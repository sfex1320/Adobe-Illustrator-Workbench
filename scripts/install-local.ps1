param([switch]$Worker, [string]$JobDirectory, [string]$TestRoot, [string]$PackageDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\auto-install'
if ($TestRoot) {
    $TestRoot = [IO.Path]::GetFullPath($TestRoot)
    if (-not $TestRoot.EndsWith('\aiq-installer-test')) { throw 'Invalid isolated test path.' }
    $stateRoot = Join-Path $TestRoot 'auto-install'
}
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
$latestFile = Join-Path $stateRoot 'latest-job.txt'
$mutexSuffix = if ($TestRoot) { 'test' } else { [Environment]::UserName }
$mutex = New-Object Threading.Mutex($false, ('Local\AIQ-Workbench-Install-' + $mutexSuffix))
function Save-State([string]$Status, [string]$Message) {
    @{ status=$Status; message=$Message; updatedAt=[DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $JobDirectory 'status.json') -Encoding UTF8
}
function Is-Latest {
    return (Test-Path -LiteralPath $latestFile) -and ((Get-Content -LiteralPath $latestFile -Raw).Trim() -eq (Split-Path $JobDirectory -Leaf))
}
try {
    if (-not $Worker) {
        if ($PackageDirectory) { $release=[IO.Path]::GetFullPath($PackageDirectory) } else {
            $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
            $release = Join-Path $projectRoot ('releases\AIQ-Workbench-' + $version + '-Windows')
        }
        if (-not (Test-Path -LiteralPath (Join-Path $release 'payload-hashes.json'))) { throw 'Build the Windows package first.' }
        $jobId = [Guid]::NewGuid().ToString('N')
        $JobDirectory = Join-Path $stateRoot $jobId
        New-Item -ItemType Directory -Path $JobDirectory | Out-Null
        # Freeze this build: a later build may replace the release directory while Illustrator is open.
        Copy-Item -LiteralPath $release -Destination (Join-Path $JobDirectory 'package') -Recurse
        if (-not $mutex.WaitOne(30000)) { throw 'An installation is busy. Retry deploy:local after it finishes.' }
        try { $jobId | Set-Content -LiteralPath $latestFile -Encoding ASCII }
        finally { $mutex.ReleaseMutex() }
        Save-State 'queued' 'Waiting for Illustrator to exit; no document will be closed automatically.'
        if (Get-Process -Name Illustrator -ErrorAction SilentlyContinue) {
            $argsList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-Worker', '-JobDirectory', ('"' + $JobDirectory + '"'))
            if ($TestRoot) { $argsList += @('-TestRoot', ('"' + $TestRoot + '"')) }
            $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $argsList -WindowStyle Hidden -PassThru
            Write-Output ('Automatic installation queued. It will run after Illustrator exits. Worker PID: ' + $process.Id)
            Write-Output ('Status: ' + (Join-Path $JobDirectory 'status.json'))
            exit 0
        }
    }
    $JobDirectory = [IO.Path]::GetFullPath($JobDirectory)
    if ((Split-Path $JobDirectory -Parent) -ne [IO.Path]::GetFullPath($stateRoot)) { throw 'Invalid installation job directory.' }
    Save-State 'waiting' 'Waiting for Illustrator to exit.'
    while ($true) {
        if (-not (Is-Latest)) { Save-State 'superseded' 'A newer build is queued.'; exit 0 }
        if (Get-Process -Name Illustrator -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 2; continue }
        if (-not $mutex.WaitOne(2000)) { continue }
        try {
            if (-not (Is-Latest)) { Save-State 'superseded' 'A newer build is queued.'; exit 0 }
            if (Get-Process -Name Illustrator -ErrorAction SilentlyContinue) { continue }
            Save-State 'installing' 'Installing the verified local build.'
            $installer = Join-Path $JobDirectory 'package\Install.ps1'
            $installArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer, '-WaitForExit')
            if ($TestRoot) { $installArgs += @('-TestRoot', $TestRoot) }
            & powershell.exe @installArgs *> (Join-Path $JobDirectory 'install.log')
            if ($LASTEXITCODE -ne 0) { throw ('Installer failed. See ' + (Join-Path $JobDirectory 'install.log')) }
            Save-State 'installed' 'Installed. Open Illustrator and the Workbench panel.'
            Write-Output ('Installed successfully. Log: ' + (Join-Path $JobDirectory 'install.log'))
            break
        } finally { $mutex.ReleaseMutex() }
    }
} catch {
    if ($JobDirectory -and (Test-Path -LiteralPath $JobDirectory)) { Save-State 'failed' $_.Exception.Message }
    throw
} finally { $mutex.Dispose() }
