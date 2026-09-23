$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$release = Join-Path $projectRoot ('releases\AIQ-Workbench-' + $packageVersion + '-Windows')
$testRoot = Join-Path $projectRoot ('artifacts\' + [Guid]::NewGuid().ToString('N') + '\aiq-installer-test')
$install = Join-Path $release 'Install.ps1'
$checks = @()
function Check([string]$Name, [bool]$Pass) {
    $script:checks += @{ name=$Name; passed=$Pass }
    if (-not $Pass) { throw $Name }
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $install -TestRoot $testRoot
Check 'Fresh install exit 0' ($LASTEXITCODE -eq 0)
$installed = Join-Path $testRoot 'com.aiq.workbench'
Check 'Payload installed' (Test-Path -LiteralPath (Join-Path $installed 'index.html'))
$native = Join-Path $testRoot 'native-host\Plug-ins\AIQNative.aip'
$nativeHash = (Get-FileHash -LiteralPath (Join-Path $release 'payload\com.aiq.workbench\native\AIQNative.aip')).Hash
Check 'Native payload installed and verified' ((Get-FileHash -LiteralPath $native).Hash -eq $nativeHash)
'previous version marker' | Set-Content -LiteralPath (Join-Path $installed 'previous-version.txt')
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $install -TestRoot $testRoot
Check 'Upgrade exit 0' ($LASTEXITCODE -eq 0)
Check 'Old version removed from new target' (-not (Test-Path -LiteralPath (Join-Path $installed 'previous-version.txt')))
$backups = @(Get-ChildItem -LiteralPath (Join-Path $testRoot 'backups') -Recurse -Filter previous-version.txt)
Check 'Old version backed up' ($backups.Count -eq 1)
$badRelease = Join-Path (Split-Path $testRoot -Parent) 'damaged-package'
Copy-Item -LiteralPath $release -Destination $badRelease -Recurse
Add-Content -LiteralPath (Join-Path $badRelease 'payload\com.aiq.workbench\index.html') -Value '<!-- corrupted -->'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $badRelease 'Install.ps1') -TestRoot $testRoot
Check 'Corrupt payload rejected' ($LASTEXITCODE -ne 0)
$originalHash = (Get-FileHash -LiteralPath (Join-Path $release 'payload\com.aiq.workbench\index.html')).Hash
Check 'Failed validation preserves installed version' ((Get-FileHash -LiteralPath (Join-Path $installed 'index.html')).Hash -eq $originalHash)
Copy-Item -LiteralPath (Join-Path $release 'payload\com.aiq.workbench\index.html') -Destination (Join-Path $badRelease 'payload\com.aiq.workbench\index.html') -Force
Add-Content -LiteralPath (Join-Path $badRelease 'payload\com.aiq.workbench\native\AIQNative.aip') -Value 'corrupted native'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $badRelease 'Install.ps1') -TestRoot $testRoot
Check 'Corrupt native package rejected' ($LASTEXITCODE -ne 0)
Check 'Failed validation preserves native module' ((Get-FileHash -LiteralPath $native).Hash -eq $nativeHash)
'must survive failed native replacement' | Set-Content -LiteralPath (Join-Path $installed 'rollback-marker.txt')
$receiptBefore=Get-Content -LiteralPath (Join-Path $testRoot 'native-install.json') -Raw
$lock=[IO.File]::Open($native,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $install -TestRoot $testRoot
    Check 'Locked native replacement fails' ($LASTEXITCODE -ne 0)
} finally { $lock.Dispose() }
Check 'Native replacement failure restores previous CEP' (Test-Path -LiteralPath (Join-Path $installed 'rollback-marker.txt'))
Check 'Native replacement failure preserves previous native' ((Get-FileHash -LiteralPath $native).Hash -eq $nativeHash)
Check 'Native replacement failure preserves receipt' ((Get-Content -LiteralPath (Join-Path $testRoot 'native-install.json') -Raw) -eq $receiptBefore)
Check 'Failed native staging cleaned' (-not (Test-Path -LiteralPath ($native+'.installing')))
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $install -TestRoot $testRoot -Uninstall
Check 'Uninstall exit 0' ($LASTEXITCODE -eq 0)
Check 'Own extension removed' (-not (Test-Path -LiteralPath $installed))
Check 'Own native module removed' (-not (Test-Path -LiteralPath $native))
New-Item -ItemType Directory -Path (Join-Path $installed 'CSXS') -Force | Out-Null
'<ExtensionManifest ExtensionBundleId="somebody.else"/>' | Set-Content -LiteralPath (Join-Path $installed 'CSXS\manifest.xml')
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $install -TestRoot $testRoot
Check 'Foreign extension identity rejected' ($LASTEXITCODE -ne 0)
Check 'Foreign extension preserved' ((Get-Content -LiteralPath (Join-Path $installed 'CSXS\manifest.xml') -Raw).Contains('somebody.else'))
$report = @{ passed=$true; mode='isolated install paths, no registry writes, Windows PowerShell 5.1'; checks=$checks } | ConvertTo-Json -Depth 5
$report | Set-Content -LiteralPath (Join-Path $projectRoot 'docs\review\installer-test.json') -Encoding UTF8
$report
