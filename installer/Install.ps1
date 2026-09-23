param([switch]$Uninstall, [string]$TestRoot, [switch]$WaitForExit, [string]$TestEngineRoot)
$ErrorActionPreference = 'Stop'
# Explicitly load Windows PowerShell's utility functions when launched through nested npm/PowerShell processes.
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -Force
$extensionId = 'com.aiq.workbench'
$testMode = -not [string]::IsNullOrWhiteSpace($TestRoot)
if ($testMode) {
    $targetRoot = [IO.Path]::GetFullPath($TestRoot)
    if (-not $targetRoot.EndsWith('aiq-installer-test')) { throw 'TestRoot must end with aiq-installer-test.' }
} else {
    $targetRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
    while (Get-Process -Name Illustrator -ErrorAction SilentlyContinue) {
        if ($WaitForExit) { Start-Sleep -Seconds 2; continue }
        Write-Host 'Illustrator 仍在运行，安装尚未开始。' -ForegroundColor Yellow
        Write-Host '请保存稿件，并从 Illustrator 的“文件 → 退出”关闭软件。安装器不会强制结束进程。'
        [void](Read-Host '关闭后按回车继续安装；按 Ctrl+C 可取消')
    }
}
$targetRoot = [IO.Path]::GetFullPath($targetRoot)
if ($TestEngineRoot) {
    $TestEngineRoot = [IO.Path]::GetFullPath($TestEngineRoot)
    if (-not $testMode -or -not $TestEngineRoot.StartsWith(($targetRoot+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'TestEngineRoot must be inside isolated TestRoot.' }
}
$target = Join-Path $targetRoot $extensionId
$backupRoot = if ($testMode) { Join-Path $targetRoot 'backups' } else { Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\backups' }
$nativeReceipt = if ($testMode) { Join-Path $targetRoot 'native-install.json' } else { Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\native-install.json' }
function Get-NativeTarget {
    if ($testMode) {
        $root = Join-Path $targetRoot 'native-host\Plug-ins'
        New-Item -ItemType Directory -Path $root -Force | Out-Null
    } else {
        $clsid = (Get-ItemProperty -LiteralPath 'Registry::HKEY_CLASSES_ROOT\Illustrator.Application\CLSID').'(default)'
        $command = (Get-ItemProperty -LiteralPath ('Registry::HKEY_CLASSES_ROOT\CLSID\' + $clsid + '\LocalServer32')).'(default)'
        if ($command -notmatch '^"?(.+?Illustrator\.exe)"?(?:\s|$)') { throw 'Cannot resolve registered Illustrator executable.' }
        $exe = [IO.Path]::GetFullPath($Matches[1])
        if (-not (Test-Path -LiteralPath $exe) -or (Get-Item -LiteralPath $exe).VersionInfo.FileMajorPart -ne 30) { throw 'Native module is verified only with Illustrator 2026 (30.x).' }
        if ($exe -notmatch '(?i)\\Support Files\\Contents\\Windows\\Illustrator\.exe$') { throw 'Unexpected Illustrator installation layout.' }
        $root = $exe -replace '(?i)\\Support Files\\Contents\\Windows\\Illustrator\.exe$', '\Plug-ins'
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'Illustrator Plug-ins folder does not exist.' }
    }
    if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing linked native plug-in folder.' }
    return (Join-Path $root 'AIQNative.aip')
}
function Assert-NativeFile([string]$Path) {
    if ((Test-Path -LiteralPath $Path) -and ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing linked native plug-in file.' }
}
function Assert-OwnPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -ne $target -and $full -ne (Join-Path $targetRoot ($extensionId + '.installing'))) { throw 'Refusing operation outside this extension.' }
    if (Test-Path -LiteralPath $full) {
        if ((Get-Item -LiteralPath $full).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing a linked extension folder.' }
        $links = Get-ChildItem -LiteralPath $full -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
        if ($links) { throw 'Refusing linked extension contents.' }
    }
}
function Get-LocalRuntimeFiles([string]$PayloadFolder) {
    $runtimeManifest = Join-Path $PayloadFolder 'bin\raster\runtime-dependencies.json'
    if (-not (Test-Path -LiteralPath $runtimeManifest -PathType Leaf)) { return @() }
    $runtime = Get-Content -LiteralPath $runtimeManifest -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($runtime.protocol -ne 1 -or $runtime.localOnly -ne $true -or @($runtime.files).Count -lt 1 -or @($runtime.files).Count -gt 32) { throw 'Invalid local renderer dependency manifest.' }
    if (Test-Path -LiteralPath (Join-Path $PayloadFolder 'bin\raster\engines')) { throw 'Local renderer engines must not be included in the release payload.' }
    $engineRoot = if ($TestEngineRoot) { $TestEngineRoot } else { [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'AIQ-Engines')) }
    # Public installs can use all native tools without separately licensed engines.
    # Validate every manifest path before checking availability; never accept bad paths.
    if ($runtime.optional -eq $true) {
        $optionalSeen = @{}
        $missingRuntime=$false
        foreach ($item in $runtime.files) {
            $relative=[string]$item.path
            if ($relative -notmatch '^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:exe|dll|icc)$' -or $relative -match '(?:^|/)\.{1,2}(?:/|$)' -or $item.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Invalid optional renderer dependency.' }
            if ($optionalSeen.ContainsKey($relative.ToLowerInvariant())) { throw 'Duplicate optional renderer dependency.' }
            $optionalSeen[$relative.ToLowerInvariant()] = $true
            if (-not (Test-Path -LiteralPath (Join-Path $engineRoot $relative) -PathType Leaf)) { $missingRuntime=$true }
        }
        if ($missingRuntime) { Write-Host 'Optional independent raster engines are not installed. Native tools remain available; large independent raster output requires the separate engines.'; return @() }
    }
    $seen = @{}
    $verified = @()
    foreach ($entry in $runtime.files) {
        $relative = [string]$entry.path
        if ($relative -notmatch '^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.(?:exe|dll|icc)$' -or $relative -match '(?:^|/)\.{1,2}(?:/|$)' -or $entry.sha256 -notmatch '^[0-9a-fA-F]{64}$' -or $seen.ContainsKey($relative)) { throw 'Invalid renderer dependency path or checksum.' }
        $seen[$relative] = $true
        $engineFile = [IO.Path]::GetFullPath((Join-Path $engineRoot $relative))
        if (-not $engineFile.StartsWith(($engineRoot+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid renderer dependency path.' }
        # Validate only the exact manifest paths. No unbounded directory copy.
        $cursor = $engineFile
        while ($cursor -and $cursor.StartsWith($engineRoot,[StringComparison]::OrdinalIgnoreCase)) {
            if (-not (Test-Path -LiteralPath $cursor)) { throw ('Missing local renderer dependency: '+$relative) }
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing linked renderer dependencies.' }
            if ($cursor -eq $engineRoot) { break }
            $cursor = Split-Path -Parent $cursor
        }
        if (-not (Test-Path -LiteralPath $engineFile -PathType Leaf) -or (Get-FileHash -LiteralPath $engineFile -Algorithm SHA256).Hash -ne $entry.sha256) { throw ('Local renderer dependency checksum mismatch: '+$relative) }
        $verified += @{ path=$relative; source=$engineFile; sha256=[string]$entry.sha256 }
    }
    return $verified
}
function Copy-LocalRuntime([string]$StagingFolder, $Entries) {
    $root = [IO.Path]::GetFullPath((Join-Path $StagingFolder 'bin\raster\engines'))
    foreach ($entry in $Entries) {
        $destination = [IO.Path]::GetFullPath((Join-Path $root $entry.path))
        if (-not $destination.StartsWith(($root+'\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid staged renderer dependency path.' }
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $entry.source -Destination $destination
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $entry.sha256) { throw ('Staged renderer checksum mismatch: '+$entry.path) }
    }
}
function Assert-Manifest([string]$Folder) {
    [xml]$manifest = Get-Content -LiteralPath (Join-Path $Folder 'CSXS\manifest.xml') -Raw -Encoding UTF8
    if ($manifest.ExtensionManifest.ExtensionBundleId -ne $extensionId) { throw 'Extension identity mismatch.' }
}
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
Assert-OwnPath $target
if (Test-Path -LiteralPath $target) { Assert-Manifest $target }
if ($Uninstall) {
    if (Test-Path -LiteralPath $nativeReceipt) {
        $receipt = Get-Content -LiteralPath $nativeReceipt -Raw | ConvertFrom-Json
        $native = Get-NativeTarget
        if ($receipt.path -ne $native) { throw 'Native installation path changed; inspect before uninstalling.' }
        Assert-NativeFile $native
        if (Test-Path -LiteralPath $native) {
            if ((Get-FileHash -LiteralPath $native).Hash -ne $receipt.sha256) { throw 'Native plug-in changed; refusing to remove an unknown file.' }
            New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
            Move-Item -LiteralPath $native -Destination (Join-Path $backupRoot ('removed-native-' + [Guid]::NewGuid().ToString('N') + '.aip'))
        }
        Remove-Item -LiteralPath $nativeReceipt
    }
    if (Test-Path -LiteralPath $target) {
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        $removedBackup = Join-Path $backupRoot ('removed-' + [Guid]::NewGuid().ToString('N'))
        Move-Item -LiteralPath $target -Destination $removedBackup
        Write-Host "Uninstalled. Backup: $removedBackup"
    } else { Write-Host 'This extension is not installed.' }
    Write-Host 'Shared Adobe CEP debug preference is unchanged. See README-INSTALL.md.'
    exit 0
}
$payload = Join-Path $PSScriptRoot 'payload\com.aiq.workbench'
Assert-Manifest $payload
$hashes = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'payload-hashes.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$files = @(Get-ChildItem -LiteralPath $payload -Recurse -File)
if ($files.Count -ne @($hashes).Count) { throw 'Payload file count mismatch.' }
foreach ($entry in $hashes) {
    $file = [IO.Path]::GetFullPath((Join-Path $payload $entry.path))
    if (-not $file.StartsWith(([IO.Path]::GetFullPath($payload) + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid payload path.' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Payload checksum failed: $($entry.path)" }
}
$runtimeFiles = @(Get-LocalRuntimeFiles $payload)
$staging = Join-Path $targetRoot ($extensionId + '.installing')
Assert-OwnPath $staging
if (Test-Path -LiteralPath $staging) { throw 'An installation staging folder exists. Inspect it before retrying.' }
$backup = $null
$debugKey = 'HKCU:\Software\Adobe\CSXS.12'
$debugChanged = $false
$oldDebug = $null
$newTargetInstalled = $false
$nativeTarget = Get-NativeTarget
$nativeStaging = $nativeTarget + '.installing'
$nativeReplaceBackup = $nativeTarget + '.rollback-' + [Guid]::NewGuid().ToString('N')
$nativeBackup = $null
$nativeInstalled = $false
$oldNativeReceipt = if(Test-Path -LiteralPath $nativeReceipt){[IO.File]::ReadAllBytes($nativeReceipt)}else{$null}
$nativePayload = Join-Path $payload 'native\AIQNative.aip'
$nativeHash = (Get-FileHash -LiteralPath $nativePayload).Hash
Assert-NativeFile $nativeTarget
if (Test-Path -LiteralPath $nativeStaging) { throw 'Native installation staging exists; inspect before retrying.' }
if (Test-Path -LiteralPath $nativeTarget) {
    $existingHash = (Get-FileHash -LiteralPath $nativeTarget).Hash
    $receipt = if (Test-Path -LiteralPath $nativeReceipt) { Get-Content -LiteralPath $nativeReceipt -Raw | ConvertFrom-Json } else { $null }
    if ($existingHash -ne $nativeHash -and ($null -eq $receipt -or $receipt.path -ne $nativeTarget -or $receipt.sha256 -ne $existingHash)) { throw 'Unrecognized AIQNative.aip; inspect before replacing it.' }
}
try {
    # Preflight native write access before replacing the CEP installation.
    Copy-Item -LiteralPath $nativePayload -Destination $nativeStaging
    Copy-Item -LiteralPath $payload -Destination $staging -Recurse
    Copy-LocalRuntime $staging $runtimeFiles
    if (Test-Path -LiteralPath $target) {
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        $backup = Join-Path $backupRoot ('upgrade-' + [Guid]::NewGuid().ToString('N'))
        Assert-OwnPath $target
        Move-Item -LiteralPath $target -Destination $backup
    }
    Assert-OwnPath $staging
    Move-Item -LiteralPath $staging -Destination $target
    $newTargetInstalled = $true
    if (Test-Path -LiteralPath $nativeTarget) {
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        $nativeBackup = Join-Path $backupRoot ('native-' + [Guid]::NewGuid().ToString('N') + '.aip')
        Copy-Item -LiteralPath $nativeTarget -Destination $nativeBackup
        [IO.File]::Replace($nativeStaging, $nativeTarget, $nativeReplaceBackup)
    } else { Move-Item -LiteralPath $nativeStaging -Destination $nativeTarget }
    $nativeInstalled = $true
    if ((Get-FileHash -LiteralPath $nativeTarget).Hash -ne $nativeHash) { throw 'Installed native checksum mismatch.' }
    foreach ($entry in $runtimeFiles) {
        $installedEngine = Join-Path (Join-Path $target 'bin\raster\engines') $entry.path
        if ((Get-FileHash -LiteralPath $installedEngine -Algorithm SHA256).Hash -ne $entry.sha256) { throw ('Installed renderer checksum mismatch: '+$entry.path) }
    }
    if (-not $testMode) {
        $oldDebug = Get-ItemProperty -LiteralPath $debugKey -Name PlayerDebugMode -ErrorAction SilentlyContinue
        $stateRoot = Join-Path $env:LOCALAPPDATA 'AIQ-Workbench'
        New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
        $statePath = Join-Path $stateRoot 'debug-setting-before-install.json'
        if (-not (Test-Path -LiteralPath $statePath)) {
            @{ key='Software\Adobe\CSXS.12'; existed=($null -ne $oldDebug); value=$oldDebug.PlayerDebugMode } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
        }
        if (-not (Test-Path -LiteralPath $debugKey)) { New-Item -Path $debugKey -Force | Out-Null }
        New-ItemProperty -LiteralPath $debugKey -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
        $debugChanged = $true
    }
    New-Item -ItemType Directory -Path (Split-Path $nativeReceipt -Parent) -Force | Out-Null
    @{path=$nativeTarget;sha256=$nativeHash} | ConvertTo-Json | Set-Content -LiteralPath $nativeReceipt -Encoding UTF8
    [xml]$installedManifest = Get-Content -LiteralPath (Join-Path $target 'CSXS\manifest.xml') -Raw -Encoding UTF8
    Write-Host ('AIQ Workbench ' + $installedManifest.ExtensionManifest.ExtensionBundleVersion + ' installed. Open Illustrator > Window > Extensions > Workbench.') -ForegroundColor Green
    Write-Host "Extension folder: $target"
    Write-Host "Verified native module: $nativeTarget"
    if ($runtimeFiles.Count) { Write-Host ('Verified local renderer files in extension: ' + $runtimeFiles.Count) }
    if ($backup) { Write-Host "Previous version backup: $backup" }
    Write-Host 'Restart Illustrator 2026 (30.0.0), then Window > Extensions > Workbench.'
    Write-Host 'This unsigned preview enables PlayerDebugMode for the current user, CEP 12 only.'
    Write-Host 'Includes selection properties, text outlines, sizing, artboards, A-to-B replacement, PNG/JPEG/SVG export and convex polygon symmetry.'
} catch {
    $failure = $_
    if ($nativeInstalled) {
        Assert-NativeFile $nativeTarget
        if ($nativeBackup) { Copy-Item -LiteralPath $nativeBackup -Destination $nativeTarget -Force }
        elseif (Test-Path -LiteralPath $nativeTarget) { Remove-Item -LiteralPath $nativeTarget }
        if($null -ne $oldNativeReceipt){[IO.File]::WriteAllBytes($nativeReceipt,$oldNativeReceipt)}
        elseif(Test-Path -LiteralPath $nativeReceipt){Remove-Item -LiteralPath $nativeReceipt}
    }
    if ($newTargetInstalled -and (Test-Path -LiteralPath $target)) { Assert-OwnPath $target; Remove-Item -LiteralPath $target -Recurse -Force }
    if ($backup -and (Test-Path -LiteralPath $backup)) { Move-Item -LiteralPath $backup -Destination $target }
    if ($debugChanged) {
        if ($null -ne $oldDebug) { Set-ItemProperty -LiteralPath $debugKey -Name PlayerDebugMode -Value $oldDebug.PlayerDebugMode }
        else { Remove-ItemProperty -LiteralPath $debugKey -Name PlayerDebugMode -ErrorAction SilentlyContinue }
    }
    throw $failure
} finally {
    if (Test-Path -LiteralPath $nativeReplaceBackup) { Assert-NativeFile $nativeReplaceBackup; Remove-Item -LiteralPath $nativeReplaceBackup }
    if (Test-Path -LiteralPath $nativeStaging) { Assert-NativeFile $nativeStaging; Remove-Item -LiteralPath $nativeStaging }
    if (Test-Path -LiteralPath $staging) { Assert-OwnPath $staging; Remove-Item -LiteralPath $staging -Recurse -Force }
}
