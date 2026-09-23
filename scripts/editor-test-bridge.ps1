# Local test harness only: keep one COM connection instead of launching a new process on each panel poll.
$ErrorActionPreference = 'Stop'
$aiqApp = New-Object -ComObject Illustrator.Application
# A cold-start instance needs its engine to become ready; early calls fail with "JavaScript code was missing".
for ($i = 0; $i -lt 40; $i++) {
  try { if ($aiqApp.DoJavaScript('1') -eq '1') { break } } catch { }
  Start-Sleep -Seconds 2
}
while ($null -ne ($line = [Console]::ReadLine())) {
    try { $result = [string]$aiqApp.DoJavaScript([Uri]::UnescapeDataString($line)) }
    catch { $result = 'EvalScript error.' }
    [Console]::WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($result)))
}
