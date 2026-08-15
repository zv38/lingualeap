#requires -Version 5.1
<#
.SYNOPSIS
    启动带 Coraza WAF 的 Caddy 前置代理
.DESCRIPTION
    默认读取项目根目录的 Caddyfile.waf，监听 localhost:3443
#>
param(
    [string]$Caddyfile = "$PSScriptRoot\..\Caddyfile.waf",
    [string]$CaddyExe = "$PSScriptRoot\..\tools\caddy\caddy.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $CaddyExe)) {
    Write-Host "[start-waf] 未找到 $CaddyExe，请先运行 npm run waf:setup 或 .\scripts\setup-caddy-coraza.ps1" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $Caddyfile)) {
    Write-Host "[start-waf] 未找到 $Caddyfile" -ForegroundColor Red
    exit 1
}

Write-Host "[start-waf] 启动 Caddy + Coraza WAF ..." -ForegroundColor Cyan
Write-Host "[start-waf] 配置：$Caddyfile" -ForegroundColor Cyan
& $CaddyExe run --config $Caddyfile --adapter caddyfile
