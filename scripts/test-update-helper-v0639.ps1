$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$owned=Join-Path $root ('artifacts\update-helper-v0639-'+[Guid]::NewGuid().ToString('N'))
$helper=Join-Path $owned 'extension\bin\update'
New-Item -ItemType Directory -Path $helper -Force|Out-Null
New-Item -ItemType Directory -Path (Join-Path $owned 'extension\CSXS') -Force|Out-Null
'<ExtensionManifest ExtensionBundleVersion="0.6.38"/>'|Set-Content (Join-Path $owned 'extension\CSXS\manifest.xml')
$source=Get-Content (Join-Path $root 'installer\Update.ps1') -Raw -Encoding UTF8
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw $errors}
$fetch=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Fetch'},$false)
# Only the transport is replaced. Signature, version, archive and checksum logic
# execute from the actual shipping helper inside an isolated app-data directory.
$transport='function Fetch([string]$Url,[string]$File,[long]$Limit){$name=if($Url.EndsWith("update.json")){"update.json"}elseif($Url.EndsWith("update.sig")){"update.sig"}else{"package.zip"};Copy-Item -LiteralPath (Join-Path $env:AIQ_UPDATE_FIXTURE $name) -Destination $File}'
$tested=$source.Substring(0,$fetch.Extent.StartOffset)+$transport+$source.Substring($fetch.Extent.EndOffset)
$tested=$tested.Replace("[Environment]::GetFolderPath('ApplicationData')",'$env:APPDATA')
[IO.File]::WriteAllText((Join-Path $helper 'Update.ps1'),$tested,(New-Object Text.UTF8Encoding($true)))
$queueStub=@'
param([string]$PackageDirectory)
if(-not (Test-Path -LiteralPath (Join-Path $PackageDirectory 'readme.txt'))){exit 1}
$queue=Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\auto-install'
$id='0123456789abcdef0123456789abcdef'
New-Item -ItemType Directory -Path (Join-Path $queue $id) -Force|Out-Null
$id|Set-Content (Join-Path $queue 'latest-job.txt')
@{status='waiting';message='isolated queue stub'}|ConvertTo-Json|Set-Content (Join-Path $queue ($id+'\status.json'))
'@
[IO.File]::WriteAllText((Join-Path $helper 'install-local.ps1'),$queueStub,(New-Object Text.UTF8Encoding($true)))
$rsa=New-Object Security.Cryptography.RSACryptoServiceProvider(2048)
[IO.File]::WriteAllText((Join-Path $helper 'update-public-key.xml'),$rsa.ToXmlString($false))
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$oldAppData=$env:APPDATA;$oldLocal=$env:LOCALAPPDATA
$checks=@()
try{
 foreach($case in @('valid-check','no-update','bad-signature','bad-hash','traversal','valid-install')){
  $caseRoot=Join-Path $owned $case;New-Item -ItemType Directory -Path $caseRoot|Out-Null
  $env:AIQ_UPDATE_FIXTURE=$caseRoot;$env:APPDATA=Join-Path $caseRoot 'appdata';$env:LOCALAPPDATA=Join-Path $caseRoot 'localdata'
  $data=Join-Path $env:APPDATA 'AIQ-Workbench';New-Item -ItemType Directory -Path $data -Force|Out-Null
  $zip=Join-Path $caseRoot 'package.zip';$archive=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
  try{$entry=$archive.CreateEntry($(if($case -eq 'traversal'){'AIQ-Workbench-0.6.39-Windows/../../escape.txt'}else{'AIQ-Workbench-0.6.39-Windows/readme.txt'}));$stream=$entry.Open();try{$bytes=[Text.Encoding]::UTF8.GetBytes('owned test');$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}}finally{$archive.Dispose()}
  $value=@{protocol=1;repository='sfex1320/Adobe-Illustrator-Workbench';version=$(if($case -eq 'no-update'){'0.6.38'}else{'0.6.39'});asset=$(if($case -eq 'no-update'){'AIQ-Workbench-0.6.38-Windows.zip'}else{'AIQ-Workbench-0.6.39-Windows.zip'});sha256=$(if($case -eq 'bad-hash'){'0'*64}else{(Get-FileHash $zip).Hash.ToLowerInvariant()});size=(Get-Item $zip).Length;notes='test'}
  $json=Join-Path $caseRoot 'update.json';[IO.File]::WriteAllText($json,($value|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
  $sig=$rsa.SignData([IO.File]::ReadAllBytes($json),'SHA256');if($case -eq 'bad-signature'){$sig[0]=$sig[0] -bxor 1}
  [IO.File]::WriteAllText((Join-Path $caseRoot 'update.sig'),[Convert]::ToBase64String($sig))
  $nonce=[Guid]::NewGuid().ToString('N');@{operation=$(if($case -in @('bad-hash','traversal','valid-install')){'install'}else{'check'});channel='github';mirror=''}|ConvertTo-Json|Set-Content (Join-Path $data ('update-'+$nonce+'.json')) -Encoding UTF8
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $helper 'Update.ps1') -Nonce $nonce
  $result=Get-Content (Join-Path $data ('update-result-'+$nonce+'.json')) -Raw|ConvertFrom-Json
  $pass=if($case -eq 'valid-check'){$LASTEXITCODE -eq 0 -and $result.ok -and $result.available -and $result.version -eq '0.6.39'}elseif($case -eq 'no-update'){$LASTEXITCODE -eq 0 -and $result.ok -and -not $result.available}else{$LASTEXITCODE -ne 0 -and -not $result.ok -and $result.status -eq 'failed'}
  if($case -eq 'valid-install'){$pass=$LASTEXITCODE -eq 0 -and $result.ok -and $result.status -eq 'waiting' -and (Test-Path (Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\auto-install'))}else{$pass=$pass -and -not (Test-Path (Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\auto-install'))}
  $pass=$pass -and -not (Test-Path (Join-Path $data ('update-'+$nonce+'.json')))
  $checks+=@{name=$case;passed=[bool]$pass;result=$result}
  Write-Output ($case+': '+$pass)
 }
}finally{$rsa.Dispose();$env:APPDATA=$oldAppData;$env:LOCALAPPDATA=$oldLocal;Remove-Item Env:AIQ_UPDATE_FIXTURE -ErrorAction SilentlyContinue}
$passed=$checks.Count -eq 6 -and @($checks|Where-Object {-not $_.passed}).Count -eq 0
@{passed=$passed;mode='Shipping helper with isolated file transport and queue stub; no host or real installation';sourceSha256=(Get-FileHash (Join-Path $root 'installer\Update.ps1')).Hash.ToLowerInvariant();testSha256=(Get-FileHash $PSCommandPath).Hash.ToLowerInvariant();checks=$checks}|ConvertTo-Json -Depth 8|Set-Content (Join-Path $root 'docs\review\update-helper-v0639.json') -Encoding UTF8
if(-not $passed){throw 'Update helper verification failed.'}
