param([Parameter(Mandatory=$true)][string]$SdkRoot)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$SdkRoot=(Resolve-Path -LiteralPath $SdkRoot).Path
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$msbuild=& $vswhere -latest -products '*' -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
if(-not $msbuild){throw 'Visual Studio C++ build tools are required.'}
& $msbuild (Join-Path $root 'host\native\AIQNative.vcxproj') /p:Configuration=Release /p:Platform=x64 "/p:AIQSdkRoot=$SdkRoot" /v:minimal /nologo
if($LASTEXITCODE -ne 0){throw 'Native build failed.'}
$native=Join-Path $root 'artifacts\native\AIQNative.aip'
$sourceInputs=@(Get-ChildItem -LiteralPath (Join-Path $root 'host\native') -Recurse -File | Where-Object {$_.Extension -in @('.cpp','.h','.rc','.vcxproj')} | Sort-Object FullName | ForEach-Object {@{path=$_.FullName.Substring($root.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName).Hash}})
@{protocol=1;nativeVersion='0.5.0';diagnostics=$false;sha256=(Get-FileHash -LiteralPath $native).Hash;sourceSha256=(Get-FileHash -LiteralPath (Join-Path $root 'host\native\AIQNative.cpp')).Hash;contractSha256=(Get-FileHash -LiteralPath (Join-Path $root 'host\native\generated\AIQDocumentContract.h')).Hash;sourceInputs=$sourceInputs} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'artifacts\native\build.json') -Encoding UTF8
