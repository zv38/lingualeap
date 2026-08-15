<#
╔══════════════════════════════════════════════════════════════╗
║           LinguaLeap 后端启动器 — 独立通道                   ║
║  一键启动，自动处理端口冲突，无需手动找终端输命令             ║
╚══════════════════════════════════════════════════════════════╝
#>
param(
  [ValidateSet('start', 'stop', 'restart', 'status')]
  [string]$Action = 'start'
)

# ===== 配置 =====
$PROJECT_DIR = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$API_PORT = 3001
$LOG_FILE = Join-Path $PROJECT_DIR "logs\backend.log"
$PID_FILE = Join-Path $PROJECT_DIR "logs\backend.pid"

# 确保日志目录存在
$null = New-Item -ItemType Directory -Path (Join-Path $PROJECT_DIR "logs") -Force -ErrorAction SilentlyContinue

function Write-Status {
  param([string]$Message, [string]$Color = "White")
  $timestamp = Get-Date -Format "HH:mm:ss"
  Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

function Get-BackendProcess {
  $process = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $id = $_.Id
    try {
      $conn = netstat -ano | Select-String "LISTENING" | Select-String ":3001\s" | Select-String "$id"
      $conn -ne $null
    } catch { $false }
  }
  return $process
}

function Stop-Backend {
  $process = Get-BackendProcess
  if ($process) {
    Write-Status "⏹ 正在停止后端 (PID: $($process.Id))..." -Color Yellow
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Status "✅ 后端已停止" -Color Green
  } else {
    Write-Status "ℹ️ 后端未在运行" -Color Cyan
  }
  # 清理 PID 文件
  if (Test-Path $PID_FILE) { Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue }
}

function Start-Backend {
  # 检查是否已在运行
  $existing = Get-BackendProcess
  if ($existing) {
    Write-Status "✅ 后端已在运行 (PID: $($existing.Id))" -Color Green
    Write-Status "   http://localhost:$API_PORT" -Color Cyan
    return
  }

  Write-Status "🚀 正在启动后端..." -Color Yellow
  Write-Status "   项目目录: $PROJECT_DIR" -Color Gray
  Write-Status "   日志文件: $LOG_FILE" -Color Gray

  # 启动后端（在独立窗口中运行，不阻塞）
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "powershell.exe"
  $startInfo.Arguments = "-NoExit -Command `"`$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); chcp 65001 >`$null; cd '$PROJECT_DIR'; npm run dev:api 2>&1 | Tee-Object -FilePath '$LOG_FILE'`""
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Normal
  $startInfo.UseShellExecute = $true

  try {
    $process = [System.Diagnostics.Process]::Start($startInfo)
    Write-Status "✅ 后端启动器已启动 (新窗口 PID: $($process.Id))" -Color Green
    Write-Status "   等待后端就绪..." -Color Yellow

    # 等待后端就绪（最多 30 秒）
    $timeout = 30
    $elapsed = 0
    $ready = $false
    while ($elapsed -lt $timeout) {
      Start-Sleep -Seconds 1
      $elapsed++
      try {
        $response = Invoke-RestMethod -Uri "http://localhost:$API_PORT/api/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.status -eq "ok") {
          $ready = $true
          break
        }
      } catch {}
      if ($elapsed % 5 -eq 0) {
        Write-Status "   等待中... ($elapsed 秒)" -Color Gray
      }
    }

    if ($ready) {
      Write-Status "✅ 后端已就绪！http://localhost:$API_PORT" -Color Green
      Write-Status "   健康检查: http://localhost:$API_PORT/api/health" -Color Cyan
    } else {
      Write-Status "⚠️ 后端启动超时，请检查日志: $LOG_FILE" -Color Yellow
    }
  } catch {
    Write-Status "❌ 启动失败: $_" -Color Red
  }
}

function Show-Status {
  $process = Get-BackendProcess
  if ($process) {
    Write-Status "✅ 后端运行中" -Color Green
    Write-Status "   PID: $($process.Id)" -Color Cyan
    Write-Status "   地址: http://localhost:$API_PORT" -Color Cyan
    try {
      $response = Invoke-RestMethod -Uri "http://localhost:$API_PORT/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
      Write-Status "   状态: ok (uptime: $($response.uptime) 秒, 数据库: $($response.database))" -Color Cyan
    } catch {
      Write-Status "   状态: 端口占用但 API 无响应" -Color Yellow
    }
  } else {
    Write-Status "🔴 后端未运行" -Color Red
  }
}

# ===== 主逻辑 =====
Clear-Host
Write-Host @"

  ╔══════════════════════════════════════════╗
  ║      LinguaLeap 后端管理控制台            ║
  ║      独立通道 · 一键启动 · 安全可靠       ║
  ╚══════════════════════════════════════════╝

"@ -ForegroundColor DarkYellow

switch ($Action) {
  'stop'    { Stop-Backend }
  'restart' { Stop-Backend; Start-Backend }
  'status'  { Show-Status }
  'start'   { Start-Backend }
}