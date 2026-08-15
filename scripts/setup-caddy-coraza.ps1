#requires -Version 5.1
<#
.SYNOPSIS
    一键安装/构建内置 Coraza WAF + OWASP CRS 的 Caddy 二进制文件（Windows）
.DESCRIPTION
    - 检测并使用已安装的 Go，否则下载到 tools/go
    - 安装 xcaddy
    - 使用 xcaddy 构建包含 coraza-caddy 与 coraza-coreruleset 的 Caddy
    - 输出到 tools/caddy/caddy.exe
#>
param(
    [string]$GoVersion = "1.23.4",
    [string]$OutputDir = "$PSScriptRoot\..\tools\caddy",
    [string]$GoDir = "$PSScriptRoot\..\tools\go"
)

$ErrorActionPreference = "Stop"
if (Resolve-Path $OutputDir -ErrorAction SilentlyContinue) {
    $OutputDir = (Resolve-Path $OutputDir).Path
} else {
    $OutputDir = (New-Item -ItemType Directory -Path $OutputDir -Force).FullName
}
if (Resolve-Path $GoDir -ErrorAction SilentlyContinue) {
    $GoDir = (Resolve-Path $GoDir).Path
} else {
    $GoDir = (New-Item -ItemType Directory -Path $GoDir -Force).FullName
}

function Add-ToPath {
    param([string]$Dir)
    if ($env:PATH -notlike "*$Dir*") {
        $env:PATH = "$Dir;$env:PATH"
    }
}

# 1. 准备 Go
$goExe = Get-Command go -ErrorAction SilentlyContinue
if (-not $goExe) {
    $goExe = Join-Path $GoDir "bin\go.exe"
}

if (-not (Test-Path $goExe)) {
    Write-Host "[setup-caddy-coraza] 未检测到 Go，下载 Go $GoVersion ..." -ForegroundColor Cyan
    $goZip = "$env:TEMP\go$GoVersion.windows-amd64.zip"
    $goUrl = "https://go.dev/dl/go$GoVersion.windows-amd64.zip"
    if (Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue) {
        Start-BitsTransfer -Source $goUrl -Destination $goZip -DisplayName "Downloading Go $GoVersion"
    } else {
        Invoke-WebRequest -Uri $goUrl -OutFile $goZip -UseBasicParsing -TimeoutSec 600
    }
    if ((Get-Item $goZip).Length -lt 10MB) {
        throw "Go 下载失败或文件过小：$goZip"
    }
    Write-Host "[setup-caddy-coraza] 解压 Go 到 $GoDir ..." -ForegroundColor Cyan
    Expand-Archive -Path $goZip -DestinationPath $GoDir -Force
    Move-Item -Path "$GoDir\go\*" -Destination $GoDir -Force
    Remove-Item -Path "$GoDir\go" -Recurse -Force
    Remove-Item -Path $goZip -Force
}

Add-ToPath -Dir (Join-Path $GoDir "bin")
$goExe = Join-Path $GoDir "bin\go.exe"
& $goExe version

# 配置中国大陆可用的 Go 模块代理（若默认代理不可达会自动切换）
& $goExe env -w GOPROXY="https://goproxy.cn,https://goproxy.io,direct"
& $goExe env -w GOSUMDB="sum.golang.google.cn"
$env:GOPROXY = "https://goproxy.cn,https://goproxy.io,direct"
$env:GOSUMDB = "sum.golang.google.cn"

# 2. 安装 xcaddy
Write-Host "[setup-caddy-coraza] 安装 xcaddy ..." -ForegroundColor Cyan
& $goExe install github.com/caddyserver/xcaddy/cmd/xcaddy@latest

$gopath = & $goExe env GOPATH
$xcaddy = Join-Path $gopath "bin\xcaddy.exe"
if (-not (Test-Path $xcaddy)) {
    throw "xcaddy 安装失败：未找到 $xcaddy"
}

# 3. 构建 Caddy + Coraza + OWASP CRS
Write-Host "[setup-caddy-coraza] 构建 Caddy（含 Coraza WAF + OWASP CRS）..." -ForegroundColor Cyan
$buildArgs = @(
    "build",
    "--with", "github.com/corazawaf/coraza-caddy/v2",
    "--with", "github.com/corazawaf/coraza-coreruleset",
    "--output", "$OutputDir\caddy.exe"
)
& $xcaddy @buildArgs

if (-not (Test-Path "$OutputDir\caddy.exe")) {
    throw "Caddy 构建失败：未找到 $OutputDir\caddy.exe"
}

& "$OutputDir\caddy.exe" version
Write-Host "[setup-caddy-coraza] 构建完成：$OutputDir\caddy.exe" -ForegroundColor Green
