# ============================================================
# Hidden backend launcher (legitimate hardening)
#
# Goal: make the backend process harder to identify at a glance
# in Task Manager.
# Approach:
#   1. Copy node.exe to a neutral filename (e.g. RuntimeBrokerHost.exe)
#      so it no longer shows as node.exe;
#   2. Launch with a hidden window (no console popup);
#   3. Set a neutral process title.
#
# Honest boundary:
#   - This is "rename + hide window", which makes it hard for ordinary
#     users to spot, but is NOT rootkit-level hiding. Task Manager /
#     Process Explorer running as admin can still see the process and
#     its command line.
#   - It does not impersonate the real system svchost.exe, to avoid
#     conflicts with the OS and false positives from security tools.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/start-hidden.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$DefaultEnvFile = "$env:USERPROFILE\.lingualeap-secrets\.env.local"
$EnvFile = if ($env:LL_ENV_FILE) { $env:LL_ENV_FILE } else { $DefaultEnvFile }

if (-not (Test-Path $EnvFile)) {
  Write-Host "[hidden] ERROR: env file not found: $EnvFile" -ForegroundColor Red
  exit 1
}

# ---- 1. locate node.exe and copy to a neutral name ----
$nodeExe = (Get-Command node.exe).Source
if (-not $nodeExe) {
  Write-Host "[hidden] ERROR: node.exe not found" -ForegroundColor Red
  exit 1
}

# Neutral runtime dir (under user profile, not project dir)
$runDir = Join-Path $env:LOCALAPPDATA "app-runtime-cache"
if (-not (Test-Path $runDir)) { New-Item -ItemType Directory -Path $runDir -Force | Out-Null }

# Neutral exe name (business-like, avoids conflicting with system svchost)
$neutralExe = "RuntimeBrokerHost.exe"
$neutralPath = Join-Path $runDir $neutralExe

Copy-Item -Path $nodeExe -Destination $neutralPath -Force

# ---- 2. launch backend (hidden window) ----
$env:LL_HIDDEN_MODE = "1"

$p = Start-Process -FilePath $neutralPath `
  -ArgumentList @("--env-file=$EnvFile", "api/index.js") `
  -WorkingDirectory (Get-Location) `
  -WindowStyle Hidden `
  -PassThru

$pidOut = $p.Id
Write-Host "[hidden] backend started, PID=$pidOut, exe=$neutralExe (hidden window)" -ForegroundColor Cyan
Write-Host "[hidden] note: task manager may still show it with 'Command line' column; admin can still see it." -ForegroundColor Yellow
Write-Host "[hidden] to stop: Stop-Process -Id $pidOut -Force" -ForegroundColor Cyan