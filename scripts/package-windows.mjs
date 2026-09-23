import { cp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const output = path.join(root, 'releases', `AIQ-Workbench-${version}-Windows`);
if (path.dirname(output) !== path.join(root, 'releases') || path.basename(output) !== `AIQ-Workbench-${version}-Windows`) throw new Error('Unsafe release path');
await mkdir(output, { recursive: true });
// A user's installer console may still have this directory as its working directory.
// Replace generated children without deleting the release directory itself.
for (const entry of await readdir(output)) {
  const child = path.resolve(output, entry);
  if (path.dirname(child) !== output) throw new Error('Unsafe release child path');
  await rm(child, { recursive: true, force: true });
}
for (const filename of ['Install.cmd', 'Uninstall.cmd', 'Install.ps1', 'README-INSTALL.md']) {
  if (filename.endsWith('.ps1')) {
    const script = (await readFile(path.join(root, 'installer', filename), 'utf8')).replace(/^\uFEFF/, '');
    // Windows PowerShell 5.1 needs a BOM to read Chinese script strings reliably.
    await writeFile(path.join(output, filename), '\uFEFF' + script, 'utf8');
  } else await cp(path.join(root, 'installer', filename), path.join(output, filename));
}
await cp(path.join(root,'scripts/install-local.ps1'),path.join(output,'Queue-Install.ps1'));
const payload = path.join(output, 'payload', 'com.aiq.workbench');
await cp(path.join(root, 'host', 'cep-package', 'com.aiq.workbench'), payload, { recursive: true });
const hashes = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) hashes.push({ path: path.relative(payload, full).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(full)).digest('hex') });
    else throw new Error('Unexpected payload link');
  }
}
await walk(payload);
await writeFile(path.join(output, 'payload-hashes.json'), JSON.stringify(hashes, null, 2));
const zip = `${output}.zip`;
// Pass paths as process environment, not interpolated PowerShell code.
execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Compress-Archive -LiteralPath $env:AIQ_PACKAGE_FOLDER -DestinationPath $env:AIQ_PACKAGE_ZIP -Force'], {
  env: { ...process.env, AIQ_PACKAGE_FOLDER: output, AIQ_PACKAGE_ZIP: zip }, stdio: 'inherit', windowsHide: true,
});
await writeFile(`${zip}.sha256`, `${createHash('sha256').update(await readFile(zip)).digest('hex')}  ${path.basename(zip)}\n`);
console.log(`Windows test installer: ${zip}`);

const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const setup=path.join(root,'releases',`AIQ-Workbench-${version}-Setup.exe`);
execFileSync(compiler,['/nologo','/target:winexe','/platform:x64','/reference:System.Windows.Forms.dll','/reference:System.IO.Compression.dll','/reference:System.IO.Compression.FileSystem.dll',`/resource:${zip},package.zip`,`/resource:${zip}.sha256,package.sha256`,`/out:${setup}`,path.join(root,'installer/Setup.cs')],{stdio:'inherit',windowsHide:true});
await writeFile(`${setup}.sha256`,`${createHash('sha256').update(await readFile(setup)).digest('hex')}  ${path.basename(setup)}\n`);
console.log(`One-click installer: ${setup}`);
