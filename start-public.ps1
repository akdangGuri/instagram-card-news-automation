$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$toolsDir = Join-Path $root ".tools"
$cloudflaredPath = Join-Path $toolsDir "cloudflared.exe"
$nodePath = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$serverPidPath = Join-Path $toolsDir "server.pid"
$tunnelPidPath = Join-Path $toolsDir "cloudflared.pid"
$tunnelLogPath = Join-Path $toolsDir "cloudflared.log"
$tunnelErrPath = Join-Path $toolsDir "cloudflared.err.log"

New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

if (-not (Test-Path $nodePath)) {
  throw "Node runtime was not found: $nodePath"
}

if (-not (Test-Path $cloudflaredPath)) {
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest `
    -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
    -OutFile $cloudflaredPath
}

foreach ($pidFile in @($serverPidPath, $tunnelPidPath)) {
  if (Test-Path $pidFile) {
    $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($oldPid) {
      Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
    }
  }
}

$portOwner = Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object -First 1
if ($portOwner) {
  Stop-Process -Id $portOwner.OwningProcess -Force -ErrorAction SilentlyContinue
}

$server = Start-Process `
  -FilePath $nodePath `
  -ArgumentList "server.mjs" `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru
Set-Content -Path $serverPidPath -Value $server.Id

Start-Sleep -Seconds 1
$localCheck = Invoke-WebRequest -Uri "http://localhost:4173" -UseBasicParsing -TimeoutSec 10
if ($localCheck.StatusCode -ne 200) {
  throw "Local server did not respond with 200."
}

Remove-Item -LiteralPath $tunnelLogPath, $tunnelErrPath -ErrorAction SilentlyContinue
$tunnel = Start-Process `
  -FilePath $cloudflaredPath `
  -ArgumentList "tunnel --url http://localhost:4173 --no-autoupdate" `
  -WorkingDirectory $toolsDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $tunnelLogPath `
  -RedirectStandardError $tunnelErrPath `
  -PassThru
Set-Content -Path $tunnelPidPath -Value $tunnel.Id

$publicUrl = ""
for ($attempt = 1; $attempt -le 20; $attempt += 1) {
  Start-Sleep -Seconds 1
  $logs = ""
  if (Test-Path $tunnelLogPath) { $logs += Get-Content $tunnelLogPath -Raw }
  if (Test-Path $tunnelErrPath) { $logs += "`n" + (Get-Content $tunnelErrPath -Raw) }
  $publicUrl = [regex]::Match($logs, "https://[a-zA-Z0-9-]+\.trycloudflare\.com").Value
  if ($publicUrl) { break }
}

if (-not $publicUrl) {
  throw "Could not find a trycloudflare URL in the tunnel logs."
}

$body = @{ publicBaseUrl = $publicUrl } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4173/api/social/settings" `
  -ContentType "application/json" `
  -Body $body | Out-Null

Write-Host "Local URL:  http://localhost:4173"
Write-Host "Public URL: $publicUrl"
Write-Host "Server PID: $($server.Id)"
Write-Host "Tunnel PID: $($tunnel.Id)"
