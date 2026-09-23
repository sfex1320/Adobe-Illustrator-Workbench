param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$Nonce)
$ErrorActionPreference='Stop'
$dataRoot=Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'AIQ-Workbench'
$request=Join-Path $dataRoot ('update-'+$Nonce+'.json')
$response=Join-Path $dataRoot ('update-result-'+$Nonce+'.json')
$work=Join-Path $env:LOCALAPPDATA ('AIQ-Workbench\updates\'+$Nonce)
function Reply($Value){$Value|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $response -Encoding UTF8}
function Fetch([string]$Url,[string]$File,[long]$Limit){
 $uri=[Uri]$Url;if($uri.Scheme -ne 'https' -or $uri.UserInfo){throw 'Only HTTPS update sources are supported.'}
 $web=[Net.HttpWebRequest]::Create($uri);$web.UserAgent='AIQ-Workbench-Updater';$web.Timeout=30000;$web.ReadWriteTimeout=30000
 $res=$web.GetResponse();$inputStream=$null;$outputStream=$null
 try{if($res.ResponseUri.Scheme -ne 'https' -or $res.ContentLength -gt $Limit){throw 'Invalid update response.'};$inputStream=$res.GetResponseStream();$outputStream=[IO.File]::Create($File);$buffer=New-Object byte[] 65536;$total=0;while(($count=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0){$total+=$count;if($total -gt $Limit){throw 'Update download exceeds its limit.'};$outputStream.Write($buffer,0,$count)}}finally{if($outputStream){$outputStream.Dispose()};if($inputStream){$inputStream.Dispose()};$res.Dispose()}
}
try{
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 if((Get-Item -LiteralPath $request).Length -gt 4096){throw 'Invalid update request.'}
 $config=Get-Content -LiteralPath $request -Raw -Encoding UTF8|ConvertFrom-Json
 if($config.operation -notin @('check','install')){throw 'Invalid update operation.'}
 $prefix='';if($config.channel -eq 'mirror'){$prefix=[string]$config.mirror;$uri=[Uri]$prefix;if($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment){throw '镜像地址必须为不含账号、参数的 HTTPS 前缀。'};$prefix=$prefix.TrimEnd('/')+'/'}elseif($config.channel -ne 'github'){throw 'Invalid update channel.'}
 New-Item -ItemType Directory -Path $work -ErrorAction Stop|Out-Null
 $repo='sfex1320/Adobe-Illustrator-Workbench'
 $base='https://github.com/'+$repo+'/releases/latest/download/'
 $json=Join-Path $work 'update.json';$sig=Join-Path $work 'update.sig'
 Fetch ($prefix+$base+'update.json') $json 65536
 Fetch ($prefix+$base+'update.sig') $sig 2048
 $rsa=New-Object Security.Cryptography.RSACryptoServiceProvider
 try{$rsa.FromXmlString([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'update-public-key.xml')));if(-not $rsa.VerifyData([IO.File]::ReadAllBytes($json),'SHA256',[Convert]::FromBase64String([IO.File]::ReadAllText($sig).Trim()))){throw '更新签名不匹配，已拒绝安装。'}}finally{$rsa.Dispose()}
 $manifest=Get-Content -LiteralPath $json -Raw -Encoding UTF8|ConvertFrom-Json
 if($manifest.protocol -ne 1 -or $manifest.repository -ne $repo -or $manifest.version -notmatch '^\d+\.\d+\.\d+$' -or $manifest.sha256 -notmatch '^[a-f0-9]{64}$' -or $manifest.asset -ne ('AIQ-Workbench-'+$manifest.version+'-Windows.zip') -or $manifest.size -lt 1 -or $manifest.size -gt 536870912){throw 'Invalid signed update manifest.'}
 $extension=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
 [xml]$current=Get-Content -LiteralPath (Join-Path $extension 'CSXS\manifest.xml') -Raw
 $installed=[string]$current.ExtensionManifest.ExtensionBundleVersion
 $available=([Version]$manifest.version -gt [Version]$installed)
 if($config.operation -eq 'check' -or -not $available){Reply @{ok=$true;status='checked';available=$available;version=$manifest.version;currentVersion=$installed;notes=[string]$manifest.notes};exit 0}
 $zip=Join-Path $work 'package.zip'
 Fetch ($prefix+'https://github.com/'+$repo+'/releases/download/v'+$manifest.version+'/'+$manifest.asset) $zip ([long]$manifest.size)
 if((Get-Item -LiteralPath $zip).Length -ne $manifest.size -or (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256){throw '安装包校验失败，已拒绝安装。'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $archive=[IO.Compression.ZipFile]::OpenRead($zip)
 $unpack=Join-Path $work 'unpacked';$total=0;$seen=@{}
 try{foreach($entry in $archive.Entries){$name=$entry.FullName.Replace('\','/');$parts=$name.Split('/');if($parts[0] -ne ('AIQ-Workbench-'+$manifest.version+'-Windows') -or $parts -contains '..' -or $parts -contains '.' -or $name.Contains(':') -or $seen.ContainsKey($name)){throw 'Unsafe archive entry.'};$seen[$name]=$true;$total+=$entry.Length;if($total -gt 1073741824 -or $seen.Count -gt 2000){throw 'Archive exceeds extraction limits.'};$dest=[IO.Path]::GetFullPath((Join-Path $unpack $name));if(-not $dest.StartsWith(([IO.Path]::GetFullPath($unpack)+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Archive escapes update folder.'}}}finally{$archive.Dispose()}
 [IO.Compression.ZipFile]::ExtractToDirectory($zip,$unpack)
 $package=Join-Path $unpack ('AIQ-Workbench-'+$manifest.version+'-Windows')
 & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-local.ps1') -PackageDirectory $package | Out-Null
 if($LASTEXITCODE -ne 0){throw '提交更新安装任务失败。'}
 $queue=Join-Path $env:LOCALAPPDATA 'AIQ-Workbench\auto-install'
 $id=(Get-Content -LiteralPath (Join-Path $queue 'latest-job.txt') -Raw).Trim()
 if($id -notmatch '^[a-f0-9]{32}$'){throw 'Invalid installation receipt.'}
 $state=Get-Content -LiteralPath (Join-Path $queue ($id+'\status.json')) -Raw|ConvertFrom-Json
 Reply @{ok=$true;status=$state.status;available=$true;version=$manifest.version;currentVersion=$installed;message=$state.message}
}catch{Reply @{ok=$false;status='failed';message=$_.Exception.Message};exit 1}
finally{if(Test-Path -LiteralPath $request){Remove-Item -LiteralPath $request}}
