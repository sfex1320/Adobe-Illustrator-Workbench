# Incremental evidence baselines

These are read-only historical inputs for evidence comparison, not product sources.
Old native reports remain unchanged. Version names never authorize reuse: tools
require the hashes recorded in the accepted reports.

- `ProductivityPanel-v0635.tsx`: reverse reconstruction of the tooltip-only edit;
  the original productivity aggregate is recovered exactly when combined with
  its accepted host bytes and every other unchanged input.
- `workspace-v0635.ts`: reverse reconstruction of the variable-capture branch;
  its file hash matches both renderer-host and export-lifecycle reports.
- `worker-v0635.py`: reverse reconstruction of the engine-directory change;
  its file hash matches the original renderer and quality reports. Compiled code
  is also compared recursively with the exact accepted release executable.
- `shared-host-changes-v0636.json`: hashes of the specifically reviewed shared
  function revisions. This is an allowlist of changes, not a passed test report.
  Further shared changes require explicit review and new real-host evidence.

The source files retain their original mixed LF/CRLF bytes; do not normalize them.
The accepted host and renderer executable are located by exact report hashes in
existing release directories. Keep those releases available through packaging.

Focused real-host supplement: `node scripts/test-shared-host-compatibility-v0636.mjs`.
Focused renderer supplement is produced by `scripts/verify-raster-startup-v0636.py`
from real CEP jobs, decoded outputs and matching observed worker processes.
Neither source equivalence check fabricates or substitutes for these supplements.
