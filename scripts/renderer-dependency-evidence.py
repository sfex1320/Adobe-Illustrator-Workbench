"""Read-only proof of renderer equivalence; never executes either worker."""
import argparse
import ast
import hashlib
import io
import json
import marshal
from pathlib import Path
import types
import zipfile
import pefile
from PyInstaller.archive.readers import CArchiveReader


def canonical_code(code):
    # Debug source locations do not affect execution. Everything else, including
    # exception tables, closure metadata and nested code, is compared exactly.
    return code.replace(co_filename='', co_firstlineno=0, co_linetable=b'',
                        co_consts=tuple(canonical_code(c) if isinstance(c, types.CodeType) else c for c in code.co_consts))


ENGINE_SOURCE = '''def engine_directory():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / "engines"
    return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AIQ-Engines"
'''


def behavior(source):
    tree = ast.parse(source)
    engine = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'engine_directory']
    if engine:
        if len(engine) != 1 or ast.dump(engine[0]) != ast.dump(ast.parse(ENGINE_SOURCE).body[0]):
            raise ValueError('Unaudited renderer startup function change')
        tree.body.remove(engine[0])
        replaced = 0
        for n in tree.body:
            if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'ENGINES':
                if ast.dump(n.value) != ast.dump(ast.parse('engine_directory()', mode='eval').body):
                    raise ValueError('Unaudited ENGINES assignment')
                n.value = ast.parse('Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AIQ-Engines"', mode='eval').body
                replaced += 1
        if replaced != 1:
            raise ValueError('Ambiguous ENGINES assignment')
    return ast.dump(tree)


def bootloader(exe, archive):
    data = bytearray(exe.read_bytes()[:archive._start_offset])
    pe = pefile.PE(data=bytes(data))
    fields = [(pe.FILE_HEADER, 'TimeDateStamp'), (pe.OPTIONAL_HEADER, 'CheckSum')]
    fields += [(entry.struct, 'TimeDateStamp') for entry in getattr(pe, 'DIRECTORY_ENTRY_DEBUG', [])]
    for struct, field in fields:
        offset = struct.get_field_absolute_offset(field)
        data[offset:offset + 4] = b'\0' * 4
    return bytes(data)


def compare(old_source, current_source, old_exe, current_exe):
    before, after = old_source.read_text(encoding='utf8'), current_source.read_text(encoding='utf8')
    if behavior(before) != behavior(after):
        raise ValueError('Renderer behavior changed beyond the audited startup directory')
    old, current = CArchiveReader(str(old_exe)), CArchiveReader(str(current_exe))
    for source, archive in [(before, old), (after, current)]:
        if canonical_code(compile(source, 'worker.py', 'exec')) != canonical_code(marshal.loads(archive.extract('worker'))):
            raise ValueError('Compiled worker does not correspond to its exact source baseline')
    if set(old.toc) != set(current.toc) or old.options != current.options:
        raise ValueError('Renderer archive inventory or options changed')
    for name in old.toc:
        if name == 'worker':
            continue
        a, b = old.extract(name), current.extract(name)
        if a == b:
            continue
        if name != 'base_library.zip':
            raise ValueError('Bundled renderer dependency changed: ' + name)
        za, zb = zipfile.ZipFile(io.BytesIO(a)), zipfile.ZipFile(io.BytesIO(b))
        if len(za.namelist()) != len(set(za.namelist())) or len(zb.namelist()) != len(set(zb.namelist())) or set(za.namelist()) != set(zb.namelist()) or any(za.read(n) != zb.read(n) for n in za.namelist()):
            raise ValueError('Bundled Python library changed')
    if bootloader(old_exe, old) != bootloader(current_exe, current):
        raise ValueError('Renderer bootloader changed beyond PE build timestamps/checksum')
    return {'passed': True, 'behaviorHash': hashlib.sha256(behavior(after).encode()).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['old_source', 'current_source', 'old_exe', 'current_exe']:
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(args.old_source, args.current_source, args.old_exe, args.current_exe)))
