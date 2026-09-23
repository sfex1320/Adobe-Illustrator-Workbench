"""Generate release Artboard Suite 4 ABI from the pinned Adobe SDK header."""
from pathlib import Path
import re,hashlib,json
root=Path('host/native/generated');root.mkdir(exist_ok=True)
header=Path('.research/artboard-sdk2020/AIArtboard.h').read_text(encoding='utf-8')
assert hashlib.sha256(Path('.research/artboard-sdk2020/AIArtboard.h').read_bytes()).hexdigest()=='45c117f694316ec7c9411ffa12a6282f62cab33864d8c41ead759d0c6669bf86'
body=re.split(r'struct\s+AIArtboardSuite\s*\{',header,1)[1].split('#if defined(ILLUSTRATOR_MINIMAL)',1)[0]
body=re.sub(r'/\*.*?\*/|//[^\n]*','',body,flags=re.S)
declarations=[d.strip() for d in body.split(';') if d.strip()]
used=['Init','Dispose','GetArtboardList','ReleaseArtboardList','GetCount','GetActive','GetArtboardProperties','IsSelected']
lines=['// Generated from pinned Artboard Suite 4 declarations.','#pragma once','#include <cstddef>','#include "IAIArtboards.hpp"','static_assert(sizeof(ai::ArtboardList)==sizeof(void*),"SDK list layout");','static_assert(sizeof(ai::ArtboardProperties)==sizeof(void*),"SDK properties layout");','struct AIQArtboardSuite4 {']
names=[]
for i,d in enumerate(declarations):
 name=re.search(r'\(\s*\*\s*(\w+)\)',d).group(1);names.append(name)
 lines.append('    '+re.sub(r'\s+',' ',d)+';' if name in used else f'    void (*reserved{i})(); // {name}: never called')
lines.append('};')
for name in used:lines.append(f'static_assert(offsetof(AIQArtboardSuite4,{name})=={names.index(name)}*sizeof(void*),"SDK slot {name}");')
(root/'AIQArtboardContract.h').write_text('\n'.join(lines),encoding='utf-8')
