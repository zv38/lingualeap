# Render 免费部署指南

> 本文档说明如何把本系统部署到 Render 免费版，让公网用户可以访问。

## 部署架构

采用**单服务架构**：

- 构建阶段：`npm run build` 生成前端产物到 `dist/`
- 运行阶段：Node.js Express 后端启动，同时 serve `dist/` 静态文件
- 所有请求走同一个域名，天然避免跨域问题
- Render 反向代理终结 HTTPS，后端内部以 HTTP 运行（`TRUST_PROXY=true`）

## 前置准备

1. 代码已提交到 GitHub（Render 只支持从 Git 仓库部署）。
2. 已注册 [Render](https://render.com/) 账号。
3. 已生成强密钥（本地执行）：
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"          # JWT_SECRET / PAYMENT_SECRET
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"          # JWT_REFRESH_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"       # ADMIN_PRIVACY_KEY（32 字节 base64）
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"       # FILE_ENCRYPTION_KEYS primary 密钥
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"          # ADMIN_CREATE_SECRET（创建管理员口令）
   ```
4. 已注册 Cloudflare Turnstile（人机验证，**必填**）：
   - 在 [Cloudflare Turnstile](https://dash.cloudflare.com/) 创建站点，获取 Site Key 与 Secret Key
   - 注意：**禁止使用官方测试密钥**，否则机器人可绕过验证、启动校验失败

## 部署步骤

### 1. 在 Render 创建 Web Service

1. 登录 Render Dashboard
2. 点击 **New +** → **Web Service**
3. 选择你的 GitHub 仓库
4. Render 会自动识别 `render.yaml`，填写如下：
   - **Name**: `lingualeap`（或你喜欢）
   - **Region**: Singapore（亚洲访问快）
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start:prod`

### 2. 配置环境变量（关键）

在 Render Dashboard → 你的服务 → **Environment** 里添加以下变量。

> `NODE_ENV=production`、`HOST=0.0.0.0`、`TRUST_PROXY=true`、`REDIS_ENABLED=false` 已在 `render.yaml` 自动注入，**无需重复添加**。

以下敏感变量必须在 Render 后台手动添加（不能明文提交到仓库）：

| 变量名 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | ✅ | ≥32 字节十六进制密钥 |
| `JWT_REFRESH_SECRET` | ✅ | 与 JWT_SECRET 不同，≥48 字节 |
| `ADMIN_PASSWORD_HASH` | ✅ | 管理员密码的 bcrypt 哈希（见下方"生成管理员密码哈希"） |
| `ADMIN_PRIVACY_KEY` | ✅ | 管理员隐私字段加密密钥（32 字节 base64） |
| `PAYMENT_SECRET` | ✅ | ≥64 字符十六进制密钥 |
| `FILE_ENCRYPTION_KEYS` | ✅ | 文件加密密钥 JSON（见下方"生成文件加密密钥"） |
| `ADMIN_CREATE_SECRET` | ⚠️ | 创建管理员账号的固定口令，缺失时创建管理员接口会被拒绝 |
| `TURNSTILE_SECRET_KEY` | ✅ | Cloudflare Turnstile Secret Key |
| `VITE_TURNSTILE_SITE_KEY` | ✅ | Cloudflare Turnstile Site Key（前端） |
| `INTEGRITY_KEY` | 建议 | 密钥完整性 HMAC 签名密钥，建议用强随机串 |
| `ZHIPUAI_API_KEY` | 可选 | 智谱 AI 密钥，没有则 AI 客服不可用 |

#### 生成管理员密码哈希（bcrypt）

```bash
node -e "const b=require('bcrypt');b.hash(process.argv[1],12).then(h=>console.log(h))" '你的管理员密码'
```

把输出的 `$2b$12$...` 字符串填入 `ADMIN_PASSWORD_HASH`。

> ⚠️ 不要设置 `ADMIN_PASSWORD` 明文变量，系统已禁用并忽略明文密码。

#### 生成文件加密密钥（FILE_ENCRYPTION_KEYS）

```bash
node -e "const k=require('crypto').randomBytes(32).toString('base64');console.log(JSON.stringify({primaryKeyId:'primary',keys:{primary:k}}))"
```

把输出的 JSON 字符串填入 `FILE_ENCRYPTION_KEYS`。

### 3. 第一次部署

点击 **Deploy**。Render 会：

1. 安装依赖
2. 执行 `npm run build` 构建前端（含安全校验与构建签名）
3. 启动后端

部署成功后，Render 会给你一个类似 `https://lingualeap.onrender.com` 的域名。

> 若启动失败，查看 Render 服务日志。常见原因：某个必填环境变量缺失/占位符，或 `FILE_ENCRYPTION_KEYS` 格式错误。

### 4. 访问平台

- 打开 `https://lingualeap.onrender.com` 即可访问
- 普通用户：注册 / 登录
- 管理员登录：`/admin/login`
- 系统内置管理员由 `ADMIN_PASSWORD_HASH` 对应的密码登录

## 重要注意事项

### 数据持久化

Render 免费版 Web Service 的磁盘是**临时磁盘**：

- 服务重启：数据通常保留
- 重新部署/构建：数据会丢失
- 容器迁移：数据会丢失

当前项目使用 `api/data/users.json` 保存用户数据，**仅适合测试/演示**。正式上线后建议迁移到 PostgreSQL。

### 休眠问题

免费 Web Service 15 分钟无访问会自动休眠。下次访问需要 30 秒左右唤醒。如果无法接受，需升级到付费版。

### 文件上传

用户上传的文件（如反馈视频）保存在 `uploads/` 目录，同样是临时磁盘，重新部署后会丢失。

### CORS

由于采用单服务部署，前端和后端同源，CORS 已自动处理。代码中已增加生产环境同域自动放行逻辑。

## 故障排查

- 部署后 502：检查 Render 日志，通常是 `JWT_SECRET` 未设置或构建失败
- 启动即退出 / FATAL-SECURITY：某个必填环境变量缺失、为占位符，或密钥格式不符合要求（见 `envValidator.js`）
- 前端白屏：检查 `npm run build` 是否成功生成 `dist/index.html`
- 数据文件解密失败：检查 `FILE_ENCRYPTION_KEYS` 是否与本地生成的一致，且为合法 JSON