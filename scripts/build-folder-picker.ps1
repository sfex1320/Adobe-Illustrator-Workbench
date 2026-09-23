$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$msbuild=& $vswhere -latest -products '*' -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
if(-not $msbuild){throw 'Visual Studio C++ build tools are required.'}
& $msbuild (Join-Path $root 'host\windows-picker\FolderPicker.vcxproj') /p:Configuration=Release /p:Platform=x64 /v:minimal /nologo
if($LASTEXITCODE -ne 0){throw 'Folder picker build failed.'}
$inputs=@('host/windows-picker/FolderPicker.cpp','host/windows-picker/FolderPicker.vcxproj','artifacts/windows-picker/FolderPicker.exe') | ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $root $_)).Hash}}
@{files=@($inputs)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'artifacts/windows-picker/build.json') -Encoding UTF8
