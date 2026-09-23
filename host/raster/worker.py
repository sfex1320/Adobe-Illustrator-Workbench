"""Local print renderer. Owns staged files only; never invokes Illustrator."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import psutil
import sys
import time
import struct
from fractions import Fraction
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream

ROOT = Path(os.environ.get("APPDATA", str(Path.home()))) / "AIQ-Workbench"
def engine_directory():
    # CEP children can have a different LocalAppData filesystem view. The local
    # installer stages hash-verified dependencies beside the installed worker.
    # Frozen production workers never silently fall back to a different version.
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / "engines"
    return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AIQ-Engines"

ENGINES = engine_directory()
GS = ENGINES / "ghostscript-10.08.0/bin/gswin64c.exe"
JPEGTRAN = ENGINES / "jpeg-3.2.0/bin/jpegtran.exe"
CODEC = Path(sys.executable).parent / "RasterCodec.exe" if getattr(sys, "frozen", False) else Path(__file__).resolve().parents[2] / "artifacts/raster/RasterCodec.exe"
Image.MAX_IMAGE_PIXELS = None  # Header-only reads; decode is bounded/streamed in RasterCodec.

def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""): h.update(part)
    return h.hexdigest()

def write_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    os.replace(temp, path)

def claim_job(job_id):
    """A permanent small claim prevents a second worker overwriting the first result."""
    if not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}", job_id): raise ValueError("任务编号无效")
    ROOT.mkdir(parents=True, exist_ok=True)
    claim = ROOT / ("raster-run-"+job_id+".lock")
    with claim.open("x", encoding="utf-8") as f:
        json.dump({"jobId": job_id, "pid": os.getpid(), "state": "running", "startedAt": int(time.time()*1000)}, f)
    return claim

def finite(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError("无效的数值参数")
    return value

def owned(root, name):
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", name) or name.startswith("."):
        raise ValueError("任务文件名无效")
    path = root / name
    if path.is_symlink() or path.resolve().parent != root.resolve(): raise ValueError("任务路径越界")
    return path

def jpeg_density(path, dpi):
    ratio=Fraction(str(dpi)).limit_denominator(65535)
    tiff=b'II'+struct.pack('<HIH',42,8,3)
    tiff+=struct.pack('<HHII',282,5,1,50)+struct.pack('<HHII',283,5,1,58)+struct.pack('<HHIHH',296,3,1,2,0)+struct.pack('<I',0)
    tiff+=struct.pack('<II',ratio.numerator,ratio.denominator)*2
    exif=b'Exif\x00\x00'+tiff
    temp=path.with_suffix('.density')
    with path.open('rb') as src,temp.open('xb') as out:
        if src.read(2)!=b'\xff\xd8': raise ValueError('JPEG 文件头无效')
        out.write(b'\xff\xd8\xff\xe1'+struct.pack('>H',len(exif)+2)+exif)
        shutil.copyfileobj(src,out,1024*1024)
    os.replace(temp,path)

def inspect(path, width, height, color, ppi, icc):
    with Image.open(path) as img:
        if img.size != (width, height) or img.mode not in ({"CMYK"} if color == "cmyk" else {"RGB", "RGBA"}):
            raise ValueError("文件像素或颜色通道与输出计划不一致")
        stored = img.info.get("dpi", (0, 0))
        if any(abs(float(n) - ppi) > .03 for n in stored): raise ValueError("文件 PPI 不一致")
        if img.info.get("icc_profile") != icc: raise ValueError("文件 ICC 未保留")
        return {"width": width, "height": height, "ppi": [float(v) for v in stored], "color": color,
                "profileSha256": hashlib.sha256(icc).hexdigest(), "bytes": path.stat().st_size}

def pdf_profile(reader, color):
    profiles = []
    for ref in reader.trailer["/Root"].get("/OutputIntents", []):
        intent = ref.get_object()
        if "/DestOutputProfile" in intent: profiles.append(intent["/DestOutputProfile"].get_data())
    seen = set()
    def walk(obj, depth=0):
        if depth > 40: raise ValueError("PDF 资源嵌套超过限制")
        obj = obj.get_object() if hasattr(obj, "get_object") else obj
        if id(obj) in seen: return
        seen.add(id(obj))
        if isinstance(obj, list):
            if len(obj) == 2 and obj[0] == "/ICCBased": profiles.append(obj[1].get_object().get_data())
            else:
                for item in obj: walk(item, depth+1)
        elif isinstance(obj, dict):
            for key, item in obj.items():
                if key not in ("/Parent", "/P", "/Metadata"): walk(item, depth+1)
    for page in reader.pages: walk(page.get("/Resources", {}))
    signature = b"CMYK" if color == "cmyk" else b"RGB "
    matches = {hashlib.sha256(p).hexdigest(): p for p in profiles if len(p) >= 128 and p[16:20] == signature}
    if len(matches) != 1: raise ValueError("无法唯一确认稿件输出 ICC，请选择标准配置或厂家 ICC")
    return next(iter(matches.values()))

def validate_pdf(reader, expected, allow_spots=False):
    if len(reader.pages) != 1: raise ValueError("中间 PDF 页数错误")
    page = reader.pages[0]
    if page.rotation or page.get("/UserUnit", 1) != 1: raise ValueError("中间 PDF 旋转/单位未经支持")
    # Illustrator can retain a larger MediaBox from document bleed even when
    # bleedOffsetRect is zero. The requested snapshot artboard is its TrimBox.
    # Validate that exact box and use the same box for rendering.
    box = page.trimbox
    if abs(float(box.width)-expected[0]) > .01 or abs(float(box.height)-expected[1]) > .01:
        raise ValueError("中间 PDF 页面尺寸错误")
    seen = set()
    def resources(r):
        r = r.get_object()
        if id(r) in seen: return
        seen.add(id(r))
        for font in r.get("/Font", {}).values():
            f = font.get_object()
            descendants = f.get("/DescendantFonts", [f])
            for ff in descendants:
                ff = ff.get_object()
                if ff.get("/Subtype") == "/Type3": continue
                descriptor = ff.get("/FontDescriptor")
                if not descriptor or not any(k in descriptor.get_object() for k in ("/FontFile", "/FontFile2", "/FontFile3")):
                    raise ValueError("PDF 存在未嵌入字体，已停止以避免替换字形")
        for space in r.get("/ColorSpace", {}).values():
            s = space.get_object()
            if isinstance(s, list) and s and s[0] in ("/Separation", "/DeviceN"):
                names = s[1] if s[0] == '/DeviceN' else [s[1]]
                # Adobe emits process subsets as DeviceN. Their encoding is not
                # evidence of a spot ink; classify the actual colorant names.
                if (not isinstance(names, list) or not names or any(str(n) not in ('/Cyan','/Magenta','/Yellow','/Black','/None') for n in names)) and not allow_spots:
                    raise ValueError("稿件包含专色/工艺通道，请先确认转为过程色或使用 PDF 交付")
        for x in r.get("/XObject", {}).values():
            x=x.get_object()
            if "/Resources" in x: resources(x["/Resources"])
    resources(page.get("/Resources", {}))

def normalize_empty_form_calls(reader, target):
    """Remove only Do calls clipped to an exactly zero-area Form BBox.

    Adobe may emit these for collapsed clipping paths. They paint no area,
    but Ghostscript's strict parser rejects their BBox. Keep all nonzero
    forms (including very thin artwork), resources and color profiles intact.
    This writes an owned rendering copy, never the source/intermediate PDF.
    """
    writer = PdfWriter(clone_from=reader)
    seen, removed = set(), 0
    def visit(obj, is_page=False, depth=0):
        nonlocal removed
        if depth > 40: raise ValueError('PDF 资源嵌套超过限制')
        if id(obj) in seen: return
        seen.add(id(obj))
        # Do not rewrite a resource-less shared Form using the first caller's
        # resources: another caller could resolve the same name differently.
        if '/Resources' not in obj: return
        def resolve(value): return value.get_object() if hasattr(value, 'get_object') else value
        resources = resolve(obj['/Resources'])
        xobjects = resolve(resources.get('/XObject', {}))
        zero = set()
        for name, ref in xobjects.items():
            form = ref.get_object()
            if form.get('/Subtype') != '/Form': continue
            box = form.get('/BBox', [])
            if len(box) == 4 and (float(box[0]) == float(box[2]) or float(box[1]) == float(box[3])):
                zero.add(name)
            else: visit(form, depth=depth+1)
        for ref in resolve(resources.get('/Pattern', {})).values():
            pattern = ref.get_object()
            if pattern.get('/PatternType') == 1: visit(pattern, depth=depth+1)
        if not zero: return
        stream = obj.get_contents() if is_page else obj
        if stream is None: return
        content = ContentStream(stream, writer)
        operations = [(args, op) for args, op in content.operations if not (op == b'Do' and len(args) == 1 and args[0] in zero)]
        count = len(content.operations) - len(operations)
        if count:
            content.operations = operations
            if is_page: obj.replace_contents(content)
            else: obj.set_data(content.get_data())
            removed += count
    for page in writer.pages: visit(page, True)
    if removed:
        with target.open('xb') as out: writer.write(out)
    return removed

class Cancelled(Exception): pass

def execute(job_id):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}", job_id): raise ValueError("任务编号无效")
    request = ROOT / ("raster-"+job_id+".json")
    if request.stat().st_size > 1500000: raise ValueError("任务过大")
    job = json.loads(request.read_text(encoding="utf-8-sig"))
    if job.get("protocol") != 1 or job.get("jobId") != job_id: raise ValueError("任务协议不匹配")
    root = ROOT / ("raster-"+job_id)
    if root.is_symlink() or root.is_junction() or not root.is_dir(): raise ValueError("任务目录无效")
    pages = job["pages"]
    if not isinstance(pages, list) or not 1 <= len(pages) <= 1000: raise ValueError("页数超出限制")
    started = int(time.time()*1000)
    try:
        previous = json.loads((ROOT / ("export-"+job_id+".json")).read_text(encoding="utf-8-sig"))
        if previous.get('jobId') == job_id and isinstance(previous.get('startedAt'), (int, float)) and 0 < previous['startedAt'] <= started:
            started = previous['startedAt']
    except (OSError, ValueError, TypeError):
        pass
    progress = {"jobId": job_id, "total": len(pages), "current": 0, "completed": 0, "failed": 0,
                "status": "running", "completedIndexes": [], "phase": "rendering", "prepared": len(pages), "startedAt": started}
    cancel = ROOT / ("export-"+job_id+".cancel")
    files, skipped, reports = [], [], []
    def status(message, phase=None):
        progress["message"] = message
        progress['updatedAt'] = int(time.time()*1000)
        if phase: progress['phase'] = phase
        write_json(ROOT / ("export-"+job_id+".json"), progress)
    def run(args):
        if cancel.exists(): raise Cancelled()
        program = Path(args[0])
        label = {GS: 'Ghostscript 渲染器', CODEC: '位图编码器', JPEGTRAN: 'JPEG 优化器'}.get(program, '独立处理程序')
        if not program.is_file(): raise ValueError(label + '未安装或已丢失，请重新安装完整组件')
        with (root / "process.log").open("wb") as log:
            try:
                p = subprocess.Popen([str(x) for x in args], stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                     cwd=str(root), creationflags=subprocess.CREATE_NO_WINDOW)
            except OSError as error:
                raise ValueError('%s启动失败（系统错误 %s）；程序文件%s' %
                                 (label, getattr(error, 'winerror', error.errno), '存在' if program.is_file() else '已丢失')) from error
            while p.poll() is None:
                if cancel.exists():
                    p.kill(); p.wait(); raise Cancelled()
                try:
                    excessive = psutil.Process(p.pid).memory_info().rss > 3*1024**3
                except psutil.NoSuchProcess:
                    excessive = False
                if excessive:
                    p.kill();p.wait();raise ValueError("独立处理超过 3 GiB 内存预算")
                time.sleep(.2)
            if p.returncode:
                detail=(root / "process.log").read_text(encoding="utf-8", errors="replace")
                code=re.search(r"codec HRESULT \d+|CMYK channels lost|Expected one embedded ICC profile|pixel dimensions mismatch|encoder changed color channels",detail)
                raise ValueError("独立渲染/编码失败（退出码 %d）%s" % (p.returncode, ": "+code.group(0) if code else ""))
        return (root / "process.log").read_text(encoding="utf-8", errors="replace").strip()
    try:
        for i, page in enumerate(pages):
            progress["current"] = i+1
            try:
                if cancel.exists(): raise Cancelled()
                fmt, color = job["format"], job["color"]
                if fmt not in ("png", "jpeg", "tif") or color not in ("rgb", "cmyk") or fmt == "png" and color != "rgb":
                    raise ValueError("格式与颜色模式不兼容")
                dpi = finite(job["ppi"], 1, 2400); scale = finite(job["scale"], .01, 100)
                quality = finite(job.get("quality", 100), 0, 100)
                size = [finite(v, .001, 16348) for v in page["sizePt"]]
                if len(size) != 2: raise ValueError("尺寸无效")
                width,height = [math.ceil(v*scale*dpi/72 - 1e-8) for v in size]
                if max(width,height)>65000 or width*height>1000000000: raise ValueError("超过独立引擎预算：单边 65000 或总像素 10 亿")
                smoothing = job.get('smoothing', 'high')
                if smoothing not in ('standard', 'high'): raise ValueError('边缘平滑选项无效')
                sample = 4 if smoothing == 'high' else 2
                # Band storage can be much larger than the final bitmap. Never
                # silently lower requested PPI/scale or the selected sampling quality.
                need = width*height*8*(sample*sample+1) + 128*1024*1024
                if shutil.disk_usage(root).free < need: raise ValueError("暂存盘空间不足")
                pdf = owned(root, page["pdf"])
                source_hash = sha(pdf)
                if page.get("sha256", source_hash) != source_hash: raise ValueError("中间 PDF 已改变")
                spot_policy=job.get('spotPolicy','reject')
                if spot_policy not in ('reject','preview'): raise ValueError('专色处理选项无效')
                reader=PdfReader(pdf); validate_pdf(reader, size, spot_policy=='preview')
                policy=job.get("profile", "source")
                if policy=="source": icc=pdf_profile(reader,color)
                elif policy=="standard": icc=(GS.parents[1]/"iccprofiles"/("default_cmyk.icc" if color=="cmyk" else "srgb.icc")).read_bytes()
                elif policy=="custom":
                    custom=Path(job["iccPath"])
                    if custom.stat().st_size>16000000 or custom.is_symlink(): raise ValueError("ICC 文件无效")
                    icc=custom.read_bytes()
                else: raise ValueError("ICC 选项无效")
                if len(icc)<128 or icc[36:40]!=b"acsp" or icc[16:20]!=(b"CMYK" if color=="cmyk" else b"RGB "): raise ValueError("ICC 与目标颜色不匹配")
                profile=owned(root,"output.icc");profile.write_bytes(icc)
                normalized=owned(root,'render.pdf')
                empty_forms=normalize_empty_form_calls(reader,normalized)
                render_pdf=normalized if empty_forms else pdf
                if empty_forms:
                    normalized_reader=PdfReader(normalized)
                    validate_pdf(normalized_reader,size,spot_policy=='preview')
                    if policy=='source' and pdf_profile(normalized_reader,color)!=icc: raise ValueError('渲染副本 ICC 发生变化')
                status("渲染 %d/%d · %d × %d px · %s · %d 倍边缘采样"%(i+1,len(pages),width,height,color.upper(),sample), 'rendering')
                pixels=owned(root,"pixels.png" if fmt=="png" else "pixels.tif")
                device="png16malpha" if fmt=="png" and job.get("transparent",True) else "png16m" if fmt=="png" else "tiffscaled32" if color=="cmyk" else "tiffscaled24"
                args=[GS,"-dSAFER","-dBATCH","-dNOPAUSE","-dPDFSTOPONERROR","-dPDFSTOPONWARNING","-dFIXEDMEDIA","-dUseTrimBox",
                      "-dMaxBitmap=16777216","-dBufferSpace=16777216","-sBandListStorage=file","-dNumRenderingThreads=2",
                      "-dTextAlphaBits=1","-dGraphicsAlphaBits=1","-dDownScaleFactor="+str(sample),"-dEmbedICCProfile=true","-dRenderIntent=1","-dBlackPtComp=1",
                      "-sDEVICE="+device,"-r"+str(dpi*scale*sample),"-g%dx%d"%(width*sample,height*sample),"-sOutputICCProfile="+str(profile),"-sOutputFile="+str(pixels),str(render_pdf)]
                run(args)
                if sha(pdf) != source_hash: raise ValueError("渲染期间中间 PDF 已改变")
                encoded=owned(root,"encoded."+("jpg" if fmt=="jpeg" else fmt))
                status("编码 %d/%d"%(i+1,len(pages)), 'encoding')
                run([CODEC,pixels,encoded,fmt,color,dpi,quality,width,height,profile])
                if fmt=="jpeg": jpeg_density(encoded,dpi)
                report=inspect(encoded,width,height,color,dpi,icc)
                status("检查输出 %d/%d"%(i+1,len(pages)), 'validating')
                report['edgeSampling']=sample
                report['spotPolicy']=spot_policy
                report['emptyFormCallsRemoved']=empty_forms
                # Decode all rows with a bounded native buffer; metadata alone is not acceptance.
                before=run([CODEC,encoded,"-","verify",color,dpi,quality,width,height,profile])
                if not re.fullmatch(r"[a-f0-9]{64}",before): raise ValueError("解码检查无效")
                report["decodedPixelSha256"]=before; report["optimization"]="not-requested"
                if fmt!="jpeg":
                    raw=run([CODEC,pixels,"-","verify",color,dpi,quality,width,height,profile])
                    if raw!=before: raise ValueError("无损格式像素发生变化")
                if fmt=="jpeg" and job.get("optimize",True):
                    status("无损优化并核对 JPG %d/%d"%(i+1,len(pages)))
                    opt=owned(root,"optimized.jpg")
                    try:
                        run([JPEGTRAN,"-copy","all","-optimize","-maxmemory","2097152","-outfile",opt,encoded])
                        inspect(opt,width,height,color,dpi,icc)
                        after=run([CODEC,opt,"-","verify",color,dpi,quality,width,height,profile])
                        if after!=before: raise ValueError("JPG 优化改变了像素")
                        if opt.stat().st_size<encoded.stat().st_size: os.replace(opt,encoded);report["optimization"]="smaller"
                        else: report["optimization"]="unchanged"
                    except Cancelled: raise
                    except Exception: report["optimization"]="incomplete-original-kept"
                    finally:
                        if opt.exists(): opt.unlink()
                if cancel.exists(): raise Cancelled()
                dest=Path(page["output"])
                status("交付成品 %d/%d"%(i+1,len(pages)), 'publishing')
                if dest.parent.resolve()!=Path(job["folder"]).resolve(): raise ValueError("成品路径超出指定目录")
                if not dest.is_absolute() or not dest.parent.is_dir() or dest.exists(): raise ValueError("成品目录无效或文件已存在")
                sibling=dest.parent/("AIQ-"+job_id+"-"+str(i)+".tmp")
                try:
                    with encoded.open("rb") as src, sibling.open("xb") as dst: shutil.copyfileobj(src,dst,1024*1024)
                    if sha(sibling)!=sha(encoded): raise ValueError("成品复制校验失败")
                    if cancel.exists(): raise Cancelled()
                    # Windows rename refuses an existing destination (no replace).
                    os.rename(sibling,dest)
                finally:
                    if sibling.exists(): sibling.unlink()
                report["fileSha256"]=sha(encoded);report["bytes"]=encoded.stat().st_size;reports.append(report)
                files.append(dest.name);progress["completedIndexes"].append(page["index"]);progress["completed"]+=1
                status("已交付 %d/%d"%(len(files),len(pages)), 'publishing')
            except Cancelled:
                progress["status"]="cancelled";break
            except Exception as error:
                stage = {'rendering':'渲染','encoding':'编码','validating':'校验','publishing':'交付'}.get(progress.get('phase'),'预检')
                skipped.append({"objectId":"artboard-"+str(page.get("index",i)+1),"reason":stage+'：'+str(error)})
                progress["failed"]+=1
            finally:
                for name in ("pixels.png","pixels.tif","encoded.jpg","encoded.png","encoded.tif","output.icc","render.pdf"):
                    p=owned(root,name)
                    if p.exists(): p.unlink()
        if progress["status"]!="cancelled": progress["status"]="partial" if skipped and files else "failed" if skipped else "completed"
        status("独立渲染结束 · 完成 %d/%d"%(len(files),len(pages)), progress['status'])
        message=progress["message"]
        if any(r["optimization"]=="incomplete-original-kept" for r in reports): message+="；部分 JPG 无损优化未完成，已保留原品质文件"
        return {"status":"completed" if progress["status"]=="completed" else "partial" if files else "failed",
                "message":message,"files":files,"folder":job["folder"],"skipped":skipped,"selectedObjectIds":[],"sideEffects":[],
                "exportProgress":progress,"rasterReports":reports}
    finally:
        # Delete only fixed owned artifacts, not arbitrary files from the request.
        for p in root.iterdir():
            if p.is_file() and not p.is_symlink() and (re.fullmatch(r"page-\d+\.pdf",p.name) or p.name in ("process.log","output.icc")): p.unlink()
        # Illustrator/PDF shell handlers can briefly retain an empty directory handle.
        # That must not erase a verified output result or its original failure reason.
        if not any(root.iterdir()):
            try: root.rmdir()
            except OSError: pass
        request.unlink(missing_ok=True);cancel.unlink(missing_ok=True)
        (ROOT / ("prepared-"+job_id+".json")).unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser();parser.add_argument("job");args=parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9_-]{8,80}",args.job): return 2
    try: claim = claim_job(args.job)
    except (FileExistsError, OSError): return 2  # Never replace another runner's result.
    try: result=execute(args.job)
    except Exception as error:
        progress={"jobId":args.job,"total":0,"current":0,"completed":0,"failed":0,"completedIndexes":[],"status":"failed","phase":"failed","message":str(error),"updatedAt":int(time.time()*1000)}
        result={"status":"failed","message":str(error),"files":[],"skipped":[],"selectedObjectIds":[],"sideEffects":[],"exportProgress":progress}
        write_json(ROOT/("export-"+args.job+".json"),progress)
    write_json(ROOT/("raster-result-"+args.job+".json"),result)
    write_json(claim,{"jobId":args.job,"pid":os.getpid(),"state":result['status'],"finishedAt":int(time.time()*1000)})
    return 0 if result["status"]=="completed" else 1

if __name__=="__main__": sys.exit(main())
