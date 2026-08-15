# 启动后端服务，从项目目录外部加载 .env.local
# 防止真实密钥进入项目目录，避免打包/部署时泄露

$DefaultEnvFile = "$env:USERPROFILE\.lingualeap-secrets\.env.local"
$EnvFile = if ($env:LL_ENV_FILE) { $env:LL_ENV_FILE } else { $DefaultEnvFile }

if (-not (Test-Path $EnvFile)) {
  Write-Host "错误：找不到环境密钥文件 $EnvFile" -ForegroundColor Red
  Write-Host "请运行 npm run setup:keys 生成，或设置 `$env:LL_ENV_FILE 指向正确的 .env.local" -ForegroundColor Yellow
  exit 1
}

Write-Host "[启动] 使用密钥文件: $EnvFile" -ForegroundColor Cyan

$nodeCmd = "node"
$args = @("--env-file=$EnvFile", "api/index.js")

& $nodeCmd @args
