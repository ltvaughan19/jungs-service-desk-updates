param([string]$Installer = (Join-Path $PSScriptRoot 'Jungs-Service-Desk-Setup-1.6.0.exe'))
$ErrorActionPreference = 'Stop'
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$registryRoots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
foreach ($registryRoot in $registryRoots) {
  $existing = Get-ItemProperty "$registryRoot\*" -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq "Jung's Service Desk" }
  if ($existing) { throw 'Use a test Windows account with no existing Jung installation; this check must not replace a live installation.' }
}
$installFolder = Join-Path $env:TEMP ('Jungs-Install-Test-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$started = Get-Date
$result = [ordered]@{ installer = $installerPath; installFolder = $installFolder; installed = $false; applicationCheckPassed = $false; uninstalled = $false }
try {
  $installProcess = Start-Process -FilePath $installerPath -ArgumentList @('/S', ('/D=' + $installFolder)) -WindowStyle Hidden -PassThru
  if (-not $installProcess.WaitForExit(180000)) { throw 'Installer has not exited within three minutes. Inspect the test installation before retrying.' }
  if ($installProcess.ExitCode -ne 0) { throw "Installer exit code: $($installProcess.ExitCode)" }
  $appFile = Join-Path $installFolder "Jung's Service Desk.exe"
  if (-not (Test-Path -LiteralPath $appFile)) { throw 'Installed application is missing.' }
  $result.installed = $true
  $appProcess = Start-Process -FilePath $appFile -ArgumentList '--security-self-test' -WindowStyle Hidden -PassThru
  if (-not $appProcess.WaitForExit(90000)) { throw 'Installed application did not finish its isolated self-test within 90 seconds.' }
  if ($appProcess.ExitCode -ne 0) { throw "Installed application self-test exit code: $($appProcess.ExitCode)" }
  $report = Get-ChildItem $env:TEMP -Directory -Filter 'jungs-security-check-*' | Where-Object { $_.LastWriteTime -ge $started } | Sort-Object LastWriteTime -Descending | ForEach-Object { Join-Path $_.FullName 'security-result.json' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $report) { throw 'Installed application produced no self-test report.' }
  $checks = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
  $properties = @($checks.PSObject.Properties)
  $requiredChecks = @('freshInstallEmpty', 'catalogAvailable', 'originalImageAvailable', 'uiLoaded', 'nodeUnavailable', 'inlineScriptsBlocked', 'externalFetchBlocked', 'sandboxed', 'contextIsolation', 'recordsEncrypted', 'applicationProtocol')
  Write-Output ('Packaged self-test checks: ' + ($checks | ConvertTo-Json -Compress))
  if ($properties.Count -lt $requiredChecks.Count -or @($properties | Where-Object { $_.Value -ne $true }).Count -ne 0) { throw 'A packaged security, empty-start, or catalog check failed.' }
  foreach ($name in $requiredChecks) { if ($checks.$name -ne $true) { throw ('Required packaged check failed or missing: ' + $name) } }
  $result.applicationCheckPassed = $true
  $result.selfTestReport = $report
  $uninstaller = Get-ChildItem -LiteralPath $installFolder -Filter '*Uninstall*.exe' | Select-Object -First 1
  if (-not $uninstaller) { throw 'Uninstaller is missing.' }
  $uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -WindowStyle Hidden -PassThru
  if (-not $uninstallProcess.WaitForExit(90000)) { throw 'Uninstall did not exit within 90 seconds.' }
  if ($uninstallProcess.ExitCode -ne 0) { throw "Uninstaller exit code: $($uninstallProcess.ExitCode)" }
  for ($attempt = 0; $attempt -lt 100 -and (Test-Path -LiteralPath $appFile); $attempt++) { Start-Sleep -Milliseconds 100 }
  if (Test-Path -LiteralPath $appFile) { throw 'Uninstall exited but the installed application is still present.' }
  $result.uninstalled = $true
} catch { $result.error = $_.Exception.Message; throw }
finally {
  $reportPath = Join-Path $env:TEMP ('Jungs-Installer-Result-' + [guid]::NewGuid().ToString('N') + '.json')
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
  Write-Output ('Installer verification report: ' + $reportPath)
}
