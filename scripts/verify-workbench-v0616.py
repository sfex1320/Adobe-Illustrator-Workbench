import json
import hashlib
from pathlib import Path
from PIL import Image
report=json.loads(Path('docs/review/v0616-native.json').read_text(encoding='utf-8'))
svg=json.loads(Path('docs/review/v0616-svg-files.json').read_text(encoding='utf-8'))
checks=[]
def check(name,passed,detail):checks.append(dict(name=name,passed=bool(passed),detail=detail))
for o in report['outputs']:
 if o['format']=='svg':continue
 im=Image.open(o['file']);im.load()
 check(o['file']+' dimensions',list(im.size)==o['expectedSize'],list(im.size))
 check(o['file']+' color',im.mode in (('RGB','RGBA') if o['colorMode']=='rgb' else ('CMYK',)),im.mode)
 resource=im.info.get('photoshop',{}).get(1005,{})
 dpi=im.info.get('dpi') or (resource.get('XResolution',0),resource.get('YResolution',0))
 dpi=tuple(float(v) for v in dpi)
 check(o['file']+' PPI',dpi and all(abs(v-o.get('ppi',144))<.02 for v in dpi),dpi)
 rgb=im.convert('RGB').getpixel((im.width//2,im.height//2));channel=1 if o['board']=='Tall' else 0
 check(o['file']+' selected board color',rgb[channel]>max(rgb[(channel+1)%3],rgb[(channel+2)%3])+45,rgb)
 w,h=(72,108) if o['board']=='Tall' else (144,72)
 clipped=im.convert('RGB').getpixel((int((w-25)/w*im.width),int(25/h*im.height)))
 outside=im.convert('RGB').getpixel((int((w-10)/w*im.width),int(25/h*im.height)))
 check(o['file']+' mask visible content',clipped[2]>max(clipped[0],clipped[1])+45,clipped)
 check(o['file']+' mask overflow hidden',outside[channel]>max(outside[(channel+1)%3],outside[(channel+2)%3])+45,outside)
for o in svg['renders']:
 im=Image.open(o['render']).convert('RGB');rgb=im.getpixel((im.width//2,im.height//2));channel=1 if o['board']=='Tall' else 0
 check(o['file']+' rendered board color',rgb[channel]>max(rgb[(channel+1)%3],rgb[(channel+2)%3])+45,rgb)
 w,h=(72,108) if o['board']=='Tall' else (144,72)
 clipped=im.getpixel((int((w-25)/w*im.width),int(25/h*im.height)))
 outside=im.getpixel((int((w-10)/w*im.width),int(25/h*im.height)))
 check(o['file']+' rendered clip content',clipped[2]>max(clipped[0],clipped[1])+45,clipped)
 check(o['file']+' rendered mask hides overflow',outside[channel]>max(outside[(channel+1)%3],outside[(channel+2)%3])+45,outside)
 # Text sits near the top; there must be actual dark glyph pixels, not just a valid XML header.
 top=im.crop((0,0,im.width,max(1,int(im.height*.3))))
 dark=sum(1 for px in top.getdata() if max(px)<80)
 check(o['file']+' visible text or outlined glyph pixels',dark>5,dark)
 # Hidden marker at y=35 pt in the wide board must leave the central strip as solid background.
 if o['board']=='Wide':
  strip=im.crop((int(im.width*.04),int(im.height*.45),int(im.width*.8),int(im.height*.7)))
  hidden_dark=sum(1 for px in strip.getdata() if max(px)<80)
  check(o['file']+' hidden text stays hidden',hidden_dark==0,hidden_dark)
# Two RGB-to-CMYK native TIF outputs are intentionally quarantined; the host
# suite instead asserts explicit rejection with no source mutation.
quarantine=any(c['name']=='RGB-tif-cmyk-100 unsafe native route rejected before source mutation' and c['passed'] for c in report['checks'])
passed=report['passed'] and svg['passed'] and quarantine and len(report['outputs'])==48 and all(c['passed'] for c in checks)
Path('docs/review/v0616-files.json').write_text(json.dumps(dict(passed=passed,nativeReportSha256=hashlib.sha256(Path('docs/review/v0616-native.json').read_bytes()).hexdigest(),svgReportSha256=hashlib.sha256(Path('docs/review/v0616-svg-files.json').read_bytes()).hexdigest(),checks=checks),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(passed=passed,checks=len(checks),failures=[c for c in checks if not c['passed']]),ensure_ascii=False))
assert passed
