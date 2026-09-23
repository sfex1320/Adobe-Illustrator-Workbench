import json,sys,hashlib
from pathlib import Path
from PIL import Image,ImageCms
folder=Path('artifacts/v0620-codec');folder.mkdir(exist_ok=True)
if len(sys.argv)>1 and sys.argv[1]=='prepare':
    im=Image.new('RGB',(96,48));im.putdata([(x*2%256,y*5%256,(x+y)*3%256) for y in range(48) for x in range(96)])
    im.save(folder/'profile.png',icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
    (folder/'bad.png').write_bytes(b'not a PNG')
else:
    raw=Path('docs/review/v0620-codec-contract.json').read_bytes();host=json.loads(raw);ref=Image.open(folder/'profile.png');checks=[];hashes=[]
    for q in [0,20,73,80,100]:
        file=folder/f'q{q}.jpg';im=Image.open(file);im.load();hashes.append(hashlib.sha256(file.read_bytes()).hexdigest())
        checks.append(dict(quality=q,passed=im.mode=='RGB' and im.size==ref.size and im.info.get('icc_profile')==ref.info.get('icc_profile'),size=im.size,mode=im.mode,iccPreserved=im.info.get('icc_profile')==ref.info.get('icc_profile'),bytes=file.stat().st_size))
    checks.append(dict(name='Distinct quality values affect actual encoding',passed=len(set(hashes))==5))
    result=dict(passed=host['passed'] and all(c['passed'] for c in checks),nativeReportSha256=hashlib.sha256(raw).hexdigest(),checks=checks)
    Path('docs/review/v0620-codec-files.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result));assert result['passed']
