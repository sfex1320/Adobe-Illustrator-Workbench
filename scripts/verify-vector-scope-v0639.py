import sys,json,hashlib,subprocess
from pathlib import Path
import fitz
from PIL import Image
root=Path(__file__).resolve().parents[1]
folder=Path(sys.argv[1]).resolve()
native=json.loads((folder/'report.json').read_text('utf8'))
checks=[]
def check(name,value):
 checks.append({'name':name,'passed':bool(value)})
 print(('PASS ' if value else 'FAIL ')+name)
def red(p):return p[0]>140 and p[1]<80 and p[2]<80 and (len(p)<4 or p[3]>240)
def empty(p):return (len(p)==4 and p[3]==0) or min(p[:3])>245
check('native suite complete',native['passed'] and len(native['checks'])==17)
files={}
for fmt in ['svg','pdf']:
 for target in ['artboards','objects']:
  file=folder/f'collection-{target}-{fmt}.{fmt}'
  files[str(file)]=hashlib.sha256(file.read_bytes()).hexdigest()
  if fmt=='pdf':
   with fitz.open(file) as doc:
    check(target+' PDF single page',len(doc)==1)
    pix=doc[0].get_pixmap(alpha=True)
    image=Image.frombytes('RGBA',(pix.width,pix.height),pix.samples)
    image.save(str(file)+'.render.png')
  else:image=Image.open(str(file)+'.render.png').convert('RGBA')
  if target=='artboards':
   check(fmt+' artboard physical union',image.size==(500,200))
   check(fmt+' spanning artwork kept on both boards',red(image.getpixel((190,110))) and red(image.getpixel((310,110))))
   check(fmt+' gap between selected boards stays empty',all(empty(image.getpixel((x,110))) for x in range(210,290)))
   check(fmt+' hidden layer remains invisible',empty(image.getpixel((65,50))))
  else:
   check(fmt+' object relative positions',image.size==(340,40) and red(image.getpixel((20,20))) and red(image.getpixel((320,20))))
   check(fmt+' object gap remains empty',empty(image.getpixel((150,20))))
report={'passed':all(c['passed'] for c in checks),'checks':checks,'sourceFiles':files,'nativeReport':str(folder/'report.json'),'nativeReportSha256':hashlib.sha256((folder/'report.json').read_bytes()).hexdigest(),'testSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(root/'docs/review/vector-scope-files-v0639.json').write_text(json.dumps(report,indent=2),'utf8')
sys.exit(0 if report['passed'] else 1)
