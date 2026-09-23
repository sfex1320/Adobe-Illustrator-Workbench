param([string]$Notes='画板范围修复、合集导出、样式吸取、四边调整与签名更新。')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
$name='AIQ-Workbench-'+$version+'-Windows.zip'
$zip=Join-Path $root ('releases\'+$name)
$key=Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\release-signing\private-key.xml'
if(-not (Test-Path -LiteralPath $key)){throw 'Release signing key is not configured on this computer.'}
$manifest=Join-Path $root 'releases\update.json'
$value=@{protocol=1;repository='sfex1320/Adobe-Illustrator-Workbench';version=$version;asset=$name;sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item -LiteralPath $zip).Length;notes=$Notes}
[IO.File]::WriteAllText($manifest,($value|ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider
try{$rsa.FromXmlString([IO.File]::ReadAllText($key));if($rsa.ToXmlString($false) -ne [IO.File]::ReadAllText((Join-Path $root 'installer\update-public-key.xml'))){throw 'Signing key does not match bundled public key.'};$signature=$rsa.SignData([IO.File]::ReadAllBytes($manifest),'SHA256');[IO.File]::WriteAllText((Join-Path $root 'releases\update.sig'),[Convert]::ToBase64String($signature))}finally{$rsa.Dispose()}
Write-Output ('Signed update '+$version)
