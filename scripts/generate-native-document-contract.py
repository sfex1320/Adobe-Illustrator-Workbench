"""Generate the document Win64 ABI projection from one pinned SDK header.

No suite version or member offset is guessed. Unused entries remain opaque;
only explicitly selected signatures are callable. SDK files are not distributed.
"""
import hashlib
import pathlib
import re
import sys

source = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])
expected = "037b9514492997fe3fd6a7286652d33f2579feb67533587711dc24959579c2a8"
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != expected:
    raise SystemExit("Unreviewed document header; inspect ABI before accepting another hash")
text = source.read_text(encoding="utf-8")
assert re.search(r"kAIDocumentSuiteVersion21\s+AIAPI_VERSION\(21\)", text)
body = text.split("struct AIDocumentSuite {", 1)[1].split("};", 1)[0]
body = re.sub(r"/\*.*?\*/|//[^\n]*", "", body, flags=re.S)
declarations = [s.strip() for s in body.split(";") if s.strip()]
members = []
for declaration in declarations:
    match = re.search(r"\(\s*\*\s*(\w+)\s*\)", declaration)
    assert match, f"Not a function pointer: {declaration}"
    members.append((match.group(1), re.sub(r"\s+", "", declaration)))
signatures = {
    "GetDocument": "AIAPIAIErr(*GetDocument)(AIDocumentHandle*document)",
    "GetDocumentBleeds": "AIAPIAIErr(*GetDocumentBleeds)(AIRealRect*bleedOffset)",
    "SetDocumentBleeds": "AIAPIAIErr(*SetDocumentBleeds)(constAIRealRect&bleedOffset)",
}
for name, signature in signatures.items():
    assert dict(members)[name] == signature, (name, dict(members)[name])
lines = ["// Generated from reviewed AIDocumentSuite 21. Do not edit offsets.",
         f"// Source SHA256: {digest}", "#pragma once", "#include <cstddef>",
         "#include <cstdint>", "static_assert(sizeof(void*) == 8, \"Win64 only\");",
         "struct AIQRealRect { double left, top, right, bottom; };",
         "static_assert(sizeof(AIQRealRect) == 32, \"SDK real rectangle ABI\");",
         "struct AIQDocumentSuite21 {"]
for index, (name, _) in enumerate(members):
    if name == "GetDocument":
        lines.append("    std::int32_t (*GetDocument)(void** document);")
    elif name == "GetDocumentBleeds":
        lines.append("    std::int32_t (*GetDocumentBleeds)(AIQRealRect* bleed);")
    elif name == "SetDocumentBleeds":
        lines.append("    std::int32_t (*SetDocumentBleeds)(const AIQRealRect& bleed);")
    else:
        lines.append(f"    void (*reserved{index})(); // {name}; never called")
lines.append("};")
for name in signatures:
    slot = [n for n, _ in members].index(name)
    lines.append(f'static_assert(offsetof(AIQDocumentSuite21, {name}) == {slot} * sizeof(void*), "SDK member order");')
lines.append(f'static_assert(sizeof(AIQDocumentSuite21) == {len(members)} * sizeof(void*), "SDK suite size");')
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Verified {len(members)} members; generated {output}")
