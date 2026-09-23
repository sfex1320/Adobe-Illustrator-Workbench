$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$owned = Join-Path $projectRoot ('artifacts\runtime-installer-v0636\' + [Guid]::NewGuid().ToString('N'))
$testRoot = Join-Path $owned 'aiq-installer-test'
$sourceRoot = Join-Path $testRoot 'engine-source'
$package = Join-Path $owned 'package'
$payload = Join-Path $package 'payload\com.aiq.workbench'
$checks = @()
function Check([string]$Name, [bool]$Pass) {
    $script:checks += @{name=$Name;passed=$Pass}
    if (-not $Pass) { throw $Name }
}
function Put-Text([string]$Path, [string]$Text) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $Path) -Force | Out-Null
    [IO.File]::WriteAllText($Path,$Text,(New-Object Text.UTF8Encoding($false)))
}
function Refresh-Hashes {
    $hashes = @(Get-ChildItem -LiteralPath $payload -Recurse -File | ForEach-Object {
        @{path=$_.FullName.Substring($payload.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    Put-Text (Join-Path $package 'payload-hashes.json') (ConvertTo-Json -InputObject $hashes -Depth 5)
}
function Save-Runtime($Runtime) {
    Put-Text (Join-Path $payload 'bin\raster\runtime-dependencies.json') (ConvertTo-Json -InputObject $Runtime -Depth 8)
    Refresh-Hashes
}
function Run-Install([string]$Name, [switch]$Remove) {
    $argsList = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $package 'Install.ps1'),'-TestRoot',$testRoot,'-TestEngineRoot',$sourceRoot)
    if ($Remove) { $argsList += '-Uninstall' }
    # Expected failures are recorded independently, without editing old reports.
    $priorPreference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; & powershell.exe @argsList *> (Join-Path $owned ($Name+'.log')); $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $priorPreference }
    return $code
}

Put-Text (Join-Path $payload 'CSXS\manifest.xml') '<ExtensionManifest ExtensionBundleId="com.aiq.workbench" ExtensionBundleVersion="0.6.36"/>'
Put-Text (Join-Path $payload 'index.html') '<p>isolated installer fixture</p>'
Put-Text (Join-Path $payload 'native\AIQNative.aip') 'isolated native bytes; never executed'
$scriptText = Get-Content -LiteralPath (Join-Path $projectRoot 'installer\Install.ps1') -Raw -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $package 'Install.ps1'),$scriptText,(New-Object Text.UTF8Encoding($true)))
$declared = Get-Content -LiteralPath (Join-Path $projectRoot 'host\raster\runtime-dependencies.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$runtime = @{protocol=1;localOnly=$true;files=@()}
foreach ($entry in $declared.files) {
    # Real declared filenames, small unique fixture bytes, honest fixture hashes.
    $source = Join-Path $sourceRoot $entry.path
    Put-Text $source ('isolated renderer fixture: '+$entry.path)
    $runtime.files += @{path=$entry.path;sha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()}
}
Put-Text (Join-Path $sourceRoot 'unlisted-private-file.txt') 'must never be copied'
Save-Runtime $runtime
$initialManifest = Get-Content -LiteralPath (Join-Path $payload 'bin\raster\runtime-dependencies.json') -Raw -Encoding UTF8
$installed = Join-Path $testRoot 'com.aiq.workbench'
$engineTarget = Join-Path $installed 'bin\raster\engines'
$native = Join-Path $testRoot 'native-host\Plug-ins\AIQNative.aip'
Check 'Fresh install includes local runtime' ((Run-Install 'fresh') -eq 0)
foreach ($entry in $runtime.files) {
    Check ('Installed runtime hash: '+$entry.path) ((Get-FileHash -LiteralPath (Join-Path $engineTarget $entry.path) -Algorithm SHA256).Hash -eq $entry.sha256)
}
Check 'Only manifest files are copied' (@(Get-ChildItem -LiteralPath $engineTarget -Recurse -File).Count -eq $runtime.files.Count)
Check 'Public payload remains free of local engines' (-not (Test-Path -LiteralPath (Join-Path $payload 'bin\raster\engines')))
Check 'Unlisted source is not copied' (-not (Test-Path -LiteralPath (Join-Path $engineTarget 'unlisted-private-file.txt')))
Put-Text (Join-Path $installed 'preserve-marker.txt') 'old installation must survive failure'
$firstSource = Join-Path $sourceRoot $runtime.files[0].path
$goodBytes = [IO.File]::ReadAllBytes($firstSource)
Put-Text $firstSource 'corrupt bytes'
Check 'Corrupt dependency rejects install' ((Run-Install 'corrupt-source') -ne 0)
Check 'Dependency preflight failure preserves installed extension' (Test-Path -LiteralPath (Join-Path $installed 'preserve-marker.txt'))
[IO.File]::WriteAllBytes($firstSource,$goodBytes)
$heldSource = $firstSource + '.held'
if (-not ([IO.Path]::GetFullPath($firstSource)).StartsWith(([IO.Path]::GetFullPath($testRoot)+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe owned fixture source.' }
Move-Item -LiteralPath $firstSource -Destination $heldSource
try { Check 'Missing dependency rejects install' ((Run-Install 'missing-source') -ne 0) }
finally { Move-Item -LiteralPath $heldSource -Destination $firstSource }
$bad = $initialManifest | ConvertFrom-Json
$bad.files[0].path = '../outside.exe'
Save-Runtime $bad
Check 'Manifest traversal rejects before file copy' ((Run-Install 'traversal') -ne 0)
$bad = $initialManifest | ConvertFrom-Json
$bad.files += $bad.files[0]
Save-Runtime $bad
Check 'Duplicate manifest path rejected' ((Run-Install 'duplicate') -ne 0)
$bad = $initialManifest | ConvertFrom-Json
$bad.localOnly = $false
Save-Runtime $bad
Check 'Non-local manifest rejected' ((Run-Install 'nonlocal') -ne 0)
Save-Runtime ($initialManifest | ConvertFrom-Json)

$receipt = Get-Content -LiteralPath (Join-Path $testRoot 'native-install.json') -Raw
$lock = [IO.File]::Open($native,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
try { Check 'Native replacement failure rejects upgrade' ((Run-Install 'native-locked') -ne 0) }
finally { $lock.Dispose() }
Check 'Failed replacement restores old CEP and local runtime' ((Test-Path -LiteralPath (Join-Path $installed 'preserve-marker.txt')) -and (Get-FileHash -LiteralPath (Join-Path $engineTarget $runtime.files[0].path)).Hash -eq $runtime.files[0].sha256)
Check 'Failed replacement preserves native receipt' ((Get-Content -LiteralPath (Join-Path $testRoot 'native-install.json') -Raw) -eq $receipt)
Check 'Failed replacement cleans staging including runtime' (-not (Test-Path -LiteralPath (Join-Path $testRoot 'com.aiq.workbench.installing')))
Check 'Upgrade succeeds after failure' ((Run-Install 'upgrade') -eq 0)
Check 'Upgrade replaces old extension' (-not (Test-Path -LiteralPath (Join-Path $installed 'preserve-marker.txt')))
$optional = $initialManifest | ConvertFrom-Json
$optional | Add-Member -NotePropertyName optional -NotePropertyValue $true
Save-Runtime $optional
Move-Item -LiteralPath $firstSource -Destination $heldSource
try {
    Check 'Optional missing engine permits core installation' ((Run-Install 'optional-missing') -eq 0)
    Check 'Missing optional engine never produces partial runtime' (-not (Test-Path -LiteralPath $engineTarget))
    $optional.files += $optional.files[0]
    Save-Runtime $optional
    Check 'Optional duplicate path still rejected when engine missing' ((Run-Install 'optional-duplicate') -ne 0)
} finally { Move-Item -LiteralPath $heldSource -Destination $firstSource }
Save-Runtime ($initialManifest | ConvertFrom-Json)
Check 'Full runtime restores when installed separately' ((Run-Install 'runtime-restored') -eq 0)
Check 'Uninstall handles local runtime with extension' ((Run-Install 'uninstall' -Remove) -eq 0)
Check 'Uninstall leaves external engine source intact' ((Get-FileHash -LiteralPath $firstSource -Algorithm SHA256).Hash -eq $runtime.files[0].sha256)
Check 'Uninstall removes only installed extension' (-not (Test-Path -LiteralPath $installed))
$report = @{passed=$true;mode='Windows PowerShell 5.1 isolated installer fixture; no Illustrator, registry writes or engine execution';checks=$checks;installerSha256=(Get-FileHash -LiteralPath (Join-Path $projectRoot 'installer\Install.ps1')).Hash;testSha256=(Get-FileHash -LiteralPath $PSCommandPath).Hash}
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $projectRoot 'docs\review\installer-runtime-v0636.json') -Encoding UTF8
Write-Output ('Passed '+$checks.Count+' local runtime installer checks. Logs: '+$owned)
