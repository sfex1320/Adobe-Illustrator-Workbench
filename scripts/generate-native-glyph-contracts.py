"""Research ABI projection; slot indexes always derive from reviewed SDK headers."""
import re
import sys
import hashlib
from pathlib import Path

BASE = Path(sys.argv[1]) if len(sys.argv)>1 else Path('.research/sdk-candidates/headers2025')
DEST = Path('host/native/generated')

def generate(filename, struct_name, output_name, fields, expected_count):
    path = BASE / filename
    raw = path.read_bytes()
    source = raw.decode('utf8')
    source = re.sub(r'/\*.*?\*/', '', source, flags=re.S)
    source = source[re.search(r'struct\s+'+struct_name+r'\s*\{',source).end():]
    source = source[:source.index('\n}')]
    declarations = re.findall(r'AIAPI\s+[^;]+;', source)
    assert len(declarations) == expected_count, (filename, len(declarations))
    result = ['#pragma once','// Generated SDK projection, source SHA256 ' + hashlib.sha256(raw).hexdigest(), '#include <cstddef>', 'struct ' + output_name + ' {']
    slots = {}
    for index, declaration in enumerate(declarations):
        name = re.search(r'\(\*(\w+)\)', declaration).group(1)
        slots[name] = index
        result.append(declaration if name in fields else 'void (*unused%d)();' % index)
    assert fields <= slots.keys()
    result.append('};')
    result.append('static_assert(sizeof(%s)==%d*sizeof(void(*)()),"suite size");' % (output_name, expected_count))
    for field in sorted(fields):
        result.append('static_assert(offsetof(%s,%s)==%d*sizeof(void(*)()),"%s slot");' % (output_name, field, slots[field], field))
    (DEST / (output_name+'.h')).write_text('\n'.join(result)+'\n')
    return {name: slots[name] for name in sorted(fields)}

print(generate('AIArt.h','AIArtSuite','AIQReadArt21',{'DisposeArt','DuplicateArt','GetArtType','GetArtParent','GetArtTransformBounds','CreateCopyScope','DestroyCopyScope'},79))
print(generate('AIDictionary.h','AIDictionarySuite','AIQDict10',{'CreateDictionary','Release','Key','GetArtEntry','NewArtEntry','CopyArtToEntry','MoveEntryToArt'},46))
