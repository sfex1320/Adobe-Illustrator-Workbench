$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
  $msbuild=& $vswhere -latest -products '*' -requires Microsoft.Component.MSBuild -find 'MSBuild/**/Bin/MSBuild.exe' | Select-Object -First 1
  if(-not $msbuild){throw 'Visual Studio C++ compiler is required'}
  & $msbuild host/raster/RasterCodec.vcxproj /p:Configuration=Release /p:Platform=x64 /v:minimal /nologo
  if($LASTEXITCODE -ne 0){throw 'RasterCodec build failed'}
  python -m PyInstaller --noconfirm --onefile --noconsole --name AIQRaster --distpath artifacts/raster --workpath artifacts/raster-build/work --specpath artifacts/raster-build host/raster/worker.py
  if($LASTEXITCODE -ne 0){throw 'Raster worker build failed'}
  # Local-only engines are staged for executable tests, not added to release ZIPs.
  $engineManifest=Get-Content -LiteralPath host/raster/runtime-dependencies.json -Raw | ConvertFrom-Json
  $engineSource=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'AIQ-Engines'))
  $engineStage=[IO.Path]::GetFullPath((Join-Path $root 'artifacts/raster/engines'))
  foreach($entry in $engineManifest.files){
    $relative=[string]$entry.path
    if([IO.Path]::IsPathRooted($relative) -or $relative -match '(^|[\\/])\.\.([\\/]|$)'){throw 'Unsafe renderer dependency path'}
    $inputFile=[IO.Path]::GetFullPath((Join-Path $engineSource $relative))
    $outputFile=[IO.Path]::GetFullPath((Join-Path $engineStage $relative))
    if(-not $inputFile.StartsWith($engineSource+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or -not $outputFile.StartsWith($engineStage+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Renderer dependency escaped root'}
    if((Get-FileHash -LiteralPath $inputFile).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Renderer dependency hash mismatch'}
    New-Item -ItemType Directory -Path (Split-Path -Parent $outputFile) -Force | Out-Null
    Copy-Item -LiteralPath $inputFile -Destination $outputFile -Force
    if((Get-FileHash -LiteralPath $outputFile).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Staged renderer dependency hash mismatch'}
  }
  $inputs=@('host/raster/worker.py','host/raster/RasterCodec.cpp','host/raster/RasterCodec.vcxproj','host/raster/requirements.txt','scripts/build-raster.ps1','artifacts/raster/AIQRaster.exe','artifacts/raster/RasterCodec.exe')
  $files=@($inputs | ForEach-Object {@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash.ToLowerInvariant()}})
  @{protocol=1;files=$files} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath 'artifacts/raster/build.json' -Encoding utf8
} finally { Pop-Location }
