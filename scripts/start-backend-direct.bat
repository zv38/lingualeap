@echo off
title LinguaLeap 后端 — 独立通道
chcp 65001 >nul

echo ╔══════════════════════════════════════════╗
echo ║   LinguaLeap 后端 — 独立启动通道          ║
echo ║   一键启动 · 自动处理端口冲突             ║
echo ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0.."

echo [1/3] 检查端口 3001 占用...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  echo [信息] 发现旧进程 PID=%%a，正在关闭...
  taskkill /f /pid %%a >nul 2>&1
  timeout /t 2 /nobreak >nul
)

echo [2/3] 启动后端服务...
echo.
echo   * 日志文件: logs\backend.log
echo   * 按 Ctrl+C 可停止服务
echo.
start "LinguaLeap Backend" /min cmd /c "chcp 65001 >nul && npm run dev:api > logs\backend.log 2>&1"

echo [3/3] 等待后端就绪...
setlocal enabledelayedexpansion
set "ready="
for /l %%i in (1,1,30) do (
  >nul 2>&1 curl -s http://localhost:3001/api/health && (
    set "ready=1"
    goto :ready
  )
  timeout /t 1 /nobreak >nul
)

:ready
if defined ready (
  echo.
  echo ✅ 后端已就绪！
  echo    http://localhost:3001
  echo    http://localhost:3001/api/health
  echo.
  echo 按任意键打开测试页面，或直接关闭窗口...
  pause >nul
  start "" "http://localhost:3001/api/health"
) else (
  echo.
  echo ⚠ 后端启动超时，请检查 logs\backend.log
  pause
)