/**
 * 打包 CEP 扩展：把 apps/panel 的构建产物复制进 host/cep/com.aiq.workbench/，
 * 保留 CSXS/manifest.xml 与 hostscript.jsx。输出目录 host/cep-package/
 * 可整体复制到 %APPDATA%/Adobe/CEP/extensions/ 安装（未实机验证）。
 */
import { cp, rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {verifyDirectExportEvidence} from './direct-export-evidence.mjs';
import {verifyGlyphEvidence} from './glyph-evidence.mjs';
import {verifyRGBCodecEvidence} from './rgb-codec-evidence.mjs';
import {verifyArtboardEvidence} from './artboard-evidence.mjs';
import {verifyRasterEvidence} from './raster-evidence.mjs';
import {verifyProductivityEvidence} from './productivity-evidence.mjs';
import {verifyRasterQualityEvidence} from './raster-quality-evidence.mjs';
import {verifyExportLifecycleEvidence} from './export-lifecycle-evidence.mjs';
import {verifyFeaturesV0639} from './features-v0639-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'apps', 'panel', 'dist');
const staging = path.join(root, 'host', 'cep-package', 'com.aiq.workbench');
const sourceCep = path.join(root, 'host', 'cep', 'com.aiq.workbench');

async function exists(p) {
  try {
    await readdir(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(distDir))) {
  console.error('未找到 apps/panel/dist，请先运行 npm run build');
  process.exit(1);
}

// Refuse a stale success report: source, host run and decoded output checks must agree.
await verifyDirectExportEvidence(root);
await verifyGlyphEvidence(root);
await verifyRGBCodecEvidence(root);
await verifyArtboardEvidence(root);
await verifyRasterEvidence(root);
await verifyProductivityEvidence(root);
await verifyRasterQualityEvidence(root);
await verifyExportLifecycleEvidence(root);
await verifyFeaturesV0639(root);
const packageRoot = path.resolve(root, 'host', 'cep-package');
if (path.dirname(packageRoot) !== path.join(root, 'host') || path.basename(packageRoot) !== 'cep-package') throw new Error('Unsafe packaging path');
await rm(packageRoot, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

// 先复制固定骨架（manifest、宿主脚本），再复制构建产物（同名文件以构建为准）。
await cp(path.join(sourceCep, 'CSXS'), path.join(staging, 'CSXS'), { recursive: true });
await cp(path.join(sourceCep, 'hostscript.jsx'), path.join(staging, 'hostscript.jsx'));
await cp(path.join(sourceCep, 'THIRD-PARTY-NOTICES.txt'), path.join(staging, 'THIRD-PARTY-NOTICES.txt'));
await cp(distDir, staging, { recursive: true });
// The native module has its own build and host acceptance gate; never silently
// package a missing module while advertising live document settings.
const nativeBuild=JSON.parse((await readFile(path.join(root,'artifacts/native/build.json'),'utf8')).replace(/^\uFEFF/,''));
for (const [filename,expected] of [['artifacts/native/AIQNative.aip',nativeBuild.sha256],['host/native/AIQNative.cpp',nativeBuild.sourceSha256],['host/native/generated/AIQDocumentContract.h',nativeBuild.contractSha256]]) {
  if (createHash('sha256').update(await readFile(path.join(root,filename))).digest('hex')!==String(expected).toLowerCase()) throw Error('Native binary/source changed; rebuild native module before packaging.');
}
if(nativeBuild.protocol!==1||nativeBuild.diagnostics!==false)throw Error('Unsupported or diagnostic native build.');
const requiredNativeInputs=['host/native/AIQNative.cpp','host/native/document-bleed-write.h','host/native/glyph-measure.h','host/native/generated/AIQReadArt21.h','host/native/generated/AIQDict10.h','host/native/generated/AIQDocumentContract.h','host/native/generated/AIQArtboardContract.h','host/native/AIQNative.rc','host/native/AIQNative.vcxproj'];
if(!Array.isArray(nativeBuild.sourceInputs)||requiredNativeInputs.some(p=>!nativeBuild.sourceInputs.some(v=>v.path===p)))throw Error('Native source dependency hashes missing; rebuild native module.');
for(const input of nativeBuild.sourceInputs){
  if(!/^host\/native\/[\w/.-]+$/.test(input.path)||input.path.includes('..'))throw Error('Invalid native dependency path.');
  if(createHash('sha256').update(await readFile(path.join(root,input.path))).digest('hex')!==String(input.sha256).toLowerCase())throw Error('Native dependency changed; rebuild native module.');
}
await mkdir(path.join(staging, 'native'), { recursive: true });
await cp(path.join(root, 'artifacts', 'native', 'AIQNative.aip'), path.join(staging, 'native', 'AIQNative.aip'));

// The independent Windows folder picker is versioned with the panel, not loaded into AI.
const pickerBuild=JSON.parse((await readFile(path.join(root,'artifacts/windows-picker/build.json'),'utf8')).replace(/^\uFEFF/,''));
for(const input of pickerBuild.files){if(!['host/windows-picker/FolderPicker.cpp','host/windows-picker/FolderPicker.vcxproj','artifacts/windows-picker/FolderPicker.exe'].includes(input.path)||createHash('sha256').update(await readFile(path.join(root,input.path))).digest('hex')!==input.sha256.toLowerCase())throw Error('Folder picker changed; rebuild and verify it.');}
if(pickerBuild.files.length!==3)throw Error('Folder picker build inputs incomplete.');
const pickerEvidence=JSON.parse(await readFile(path.join(root,'docs/review/v0626-folder-picker.json'),'utf8'));
if(!pickerEvidence.passed||pickerEvidence.checks.some(c=>!c.passed)||pickerEvidence.binarySha256!==createHash('sha256').update(await readFile(path.join(root,'artifacts/windows-picker/FolderPicker.exe'))).digest('hex'))throw Error('Folder picker real UI validation missing.');
await mkdir(path.join(staging,'bin'),{recursive:true});
await cp(path.join(root,'artifacts/windows-picker/FolderPicker.exe'),path.join(staging,'bin/FolderPicker.exe'));
await mkdir(path.join(staging,'bin/raster'),{recursive:true});
for(const name of ['AIQRaster.exe','RasterCodec.exe'])await cp(path.join(root,'artifacts/raster',name),path.join(staging,'bin/raster',name));
for(const name of ['runtime-dependencies.json','THIRD-PARTY-NOTICES.txt'])await cp(path.join(root,'host/raster',name),path.join(staging,'bin/raster',name));

await mkdir(path.join(staging,'bin/update'),{recursive:true});
for(const name of ['Update.ps1','update-public-key.xml']) {
  const bytes=await readFile(path.join(root,'installer',name));
  await writeFile(path.join(staging,'bin/update',name),name.endsWith('.ps1')?'\uFEFF'+bytes.toString('utf8').replace(/^\uFEFF/,''):bytes);
}
await cp(path.join(root,'scripts/install-local.ps1'),path.join(staging,'bin/update/install-local.ps1'));

// manifest 版本号统一由根 package.json 注入，避免模板滞后。
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifestPath = path.join(staging, 'CSXS', 'manifest.xml');
const manifest = await readFile(manifestPath, 'utf8');
await writeFile(manifestPath, manifest.replace(/(<Extension Id="com\.aiq\.workbench\.main" Version=")[^"]*(")/, `$1${pkg.version}$2`).replace(/ExtensionBundleVersion="[^"]*"/g, `ExtensionBundleVersion="${pkg.version}"`));

console.log(`CEP 扩展已打包：${staging}（版本 ${pkg.version}）`);
console.log('下一步运行 npm run package:windows，生成双击安装 ZIP。宿主脚本测试和 CEP 面板装载验证分别报告。');
