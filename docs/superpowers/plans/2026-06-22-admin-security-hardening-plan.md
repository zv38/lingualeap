# 管理员账号安全加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将管理员账号从"单点密码认证"升级为"强制 2FA + IP 白名单 + 短 token + 敏感操作二次验证 + 会话绑定"的多层防护体系，降低账号密码泄露后的系统接管风险。

**Architecture:** 在后端 `api/index.js` 中扩展管理员认证与授权逻辑；新增 `requireFreshMfa` 中间件和会话绑定校验；前端 `SecuritySettings.tsx` 增加管理员 2FA 强制引导；所有改动以独立 task 为单位，可逐条验证和回滚。

**Tech Stack:** Node.js + Express + JWT + Speakeasy TOTP + bcrypt + 内存 Map 存储

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|---|---|---|
| `api/index.js` | 修改 | 后端监听地址、强制管理员 2FA、短 token、敏感操作二次验证、会话绑定、禁止管理员走普通登录 |
| `src/pages/SecuritySettings.tsx` | 修改 | 管理员 2FA 强制开启提示和流程 |
| `src/App.tsx` | 修改（可选） | 管理员路由增加 freshMfa 状态校验 |
| `.env.example` | 修改 | 增加 `ADMIN_IP_WHITELIST` 示例 |

---

## Task 1: 后端绑定 127.0.0.1

**目标：** 防止后端监听在 `::` 导致外网可直接访问。

**Files:**
- Modify: `api/index.js:3133-3144`

- [ ] **Step 1: 修改监听代码**

在 `api/index.js` 中找到 `const server = app.listen(PORT, () => { ... })`，替换为：

```javascript
const HOST = process.env.HOST || '127.0.0.1';
const server = app.listen(PORT, HOST, () => {
  seedAdmin();
  try {
    buildBaseline();
    const integrity = verifyIntegrity();
    if (integrity.changes > 0) {
      console.warn(`[FileGuardian] ⚠️ 检测到 ${integrity.changes} 个文件变更`);
    }
  } catch (e) {
    console.warn('[FileGuardian] 初始化跳过:', e.message);
  }
  console.log(`API Server is running at http://${HOST}:${PORT}`);
});
```

- [ ] **Step 2: 配置 trust proxy（如使用反向代理）**

在 `api/index.js` 中 `const app = express()` 之后添加：

```javascript
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
```

- [ ] **Step 3: 重启后端并验证**

Run:
```powershell
$env:JWT_SECRET = (-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }));
$env:JWT_REFRESH_SECRET = (-join ((1..96) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }));
npm run dev:api
```

Expected console output contains:
```
API Server is running at http://127.0.0.1:3001
```

Run:
```powershell
netstat -ano | findstr 3001
```

Expected: only `127.0.0.1:3001` is LISTENING, no `0.0.0.0:3001` or `[::]:3001`.

---

## Task 2: 强制管理员开启 2FA

**目标：** 管理员未绑定 TOTP 时无法登录后台。

**Files:**
- Modify: `api/index.js:3078-3109` (seedAdmin)
- Modify: `api/index.js:1819-1833` (admin login TOTP block)
- Modify: `src/pages/SecuritySettings.tsx`

- [ ] **Step 1: seedAdmin 添加 2FA 强制标识**

将 `seedAdmin()` 中用户对象改为：

```javascript
usersDB.set(adminId, {
  id: adminId,
  username: '系统管理员',
  email: ADMIN_EMAIL,
  password: hashedPassword,
  avatar: 'https://i.pravatar.cc/150?img=68',
  level: 'advanced',
  createdAt: '2024-01-01T00:00:00Z',
  xp: 99999,
  totalXP: 99999,
  streakDays: 365,
  longestStreak: 365,
  dailyGoal: 60,
  reminderTime: '08:00',
  theme: 'light',
  language: 'zh',
  followers: [],
  following: [],
  role: 'admin',
  requireAdminMfa: true,
  adminTotpEnabled: false,
});
```

- [ ] **Step 2: 管理员登录强制校验 2FA 是否已开启**

在 `/api/admin/login` 的 TOTP 校验块之前插入：

```javascript
// 强制管理员开启 2FA
if (foundUser.requireAdminMfa && !foundUser.adminTotpEnabled) {
  logAudit({ userId: foundUser.id, action: 'admin_login_failed', ip, details: '管理员未开启2FA', success: false });
  res.status(403).json({
    success: false,
    code: 'ADMIN_MFA_REQUIRED',
    message: '管理员账号必须开启二次验证，请先完成 2FA 绑定',
  });
  return;
}
```

- [ ] **Step 3: 前端安全设置页强制引导管理员开启 2FA**

在 `src/pages/SecuritySettings.tsx` 中，读取 `/api/me` 返回的 `role` 和 `adminTotpEnabled`。如果 role === 'admin' 且 adminTotpEnabled 为 false，在页面顶部显示固定提示条：

```tsx
{user?.role === 'admin' && !user?.adminTotpEnabled && (
  <div className="mb-4 rounded-xl border border-rose-200 bg-rose-500/10 p-4 text-sm text-rose-600">
    <strong>安全警告：</strong>管理员账号必须开启二次验证。请先在下方完成 2FA 绑定，否则无法再次登录管理后台。
  </div>
)}
```

- [ ] **Step 4: 测试强制 2FA**

Run:
```powershell
node scripts/test-admin-auth.js
```

Expected: 使用管理员邮箱密码 + 正确二次验证码登录，但 `adminTotpEnabled` 为 false 时，接口返回 403，code 为 `ADMIN_MFA_REQUIRED`。

---

## Task 3: 管理员 Token 短有效期

**目标：** 管理员 access token 有效期从 15 分钟缩短到 5 分钟，降低 token 被盗后的窗口期。

**Files:**
- Modify: `api/index.js:106-112`
- Modify: `api/index.js:1861-1862` (admin login token)
- Modify: `api/index.js:1594-1689` (normal login token, keep 15m)

- [ ] **Step 1: generateToken 支持自定义有效期**

替换 `generateToken` 函数：

```javascript
function generateToken(userId, expiresIn = '15m') {
  return jwt.sign({ userId, type: 'access', kv: KEY_VERSION, pepper: JWT_PEPPER }, JWT_SECRET, { expiresIn });
}
```

`generateRefreshToken` 保持不变。

- [ ] **Step 2: 管理员登录使用 5 分钟 token**

在 `/api/admin/login` 登录成功处：

```javascript
const token = generateToken(foundUser.id, '5m');
const refreshToken = generateRefreshToken(foundUser.id);
```

- [ ] **Step 3: 普通用户保持 15 分钟不变**

`/api/login` 和 `/api/webauthn/login-verify` 继续调用 `generateToken(userId)`，无需修改。

- [ ] **Step 4: 测试 token 有效期**

Run:
```javascript
// 在 scripts/test-admin-auth.js 中新增
const jwt = require('jsonwebtoken');
const decoded = jwt.decode(token);
const expMinutes = (decoded.exp - decoded.iat) / 60;
console.log('Admin token expires in minutes:', expMinutes);
```

Expected: `Admin token expires in minutes: 5`

---

## Task 4: 敏感操作二次验证中间件

**目标：** 管理员执行高危操作前，必须重新输入一次 TOTP 验证码。

**Files:**
- Create: `api/middleware/requireFreshMfa.js`
- Modify: `api/index.js` 引入并使用中间件

- [ ] **Step 1: 创建 requireFreshMfa 中间件**

创建 `api/middleware/requireFreshMfa.js`：

```javascript
import speakeasy from 'speakeasy';
import { logAudit, getClientIP } from '../security/auditLogger.js';

// 内存存储：userId -> { verifiedAt }
const freshMfaCache = new Map();
const FRESH_MFA_TTL_MS = 5 * 60 * 1000; // 5 分钟内免重复验证

export function requireFreshMfa(req, res, next) {
  const userId = req.tokenPayload?.userId;
  const user = usersDB.get(userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '需要管理员权限' });
  }
  if (!user.adminTotpEnabled) {
    return res.status(403).json({ success: false, message: '请先开启管理员二次验证' });
  }

  const cached = freshMfaCache.get(userId);
  if (cached && Date.now() - cached.verifiedAt < FRESH_MFA_TTL_MS) {
    return next();
  }

  const { totpCode } = req.body;
  const totpSecret = adminTOTPSecrets.get(userId);
  if (!totpCode || !totpSecret || !totpSecret.verified) {
    logAudit({ userId, action: 'admin_fresh_mfa_required', ip: getClientIP(req), details: '敏感操作缺少二次验证', success: false });
    return res.status(403).json({ success: false, code: 'FRESH_MFA_REQUIRED', message: '请先输入二次验证码以继续' });
  }

  const isValid = speakeasy.totp.verify({ secret: totpSecret.secret, encoding: 'base32', token: totpCode, window: 1 });
  if (!isValid) {
    logAudit({ userId, action: 'admin_fresh_mfa_failed', ip: getClientIP(req), details: '敏感操作二次验证失败', success: false });
    return res.status(403).json({ success: false, message: '二次验证码错误' });
  }

  freshMfaCache.set(userId, { verifiedAt: Date.now() });
  next();
}

export function clearFreshMfa(userId) {
  freshMfaCache.delete(userId);
}
```

注意：上面引用了 `usersDB`、`adminTOTPSecrets`，这两个变量目前定义在 `api/index.js` 中。为了让中间件能访问，需要把它们导出，或者把中间件逻辑直接内联到 `api/index.js`。

- [ ] **Step 2: 把中间件逻辑内联到 api/index.js（推荐，避免导出内存存储）**

不创建新文件，直接在 `api/index.js` 中 `requireAdmin` 之后添加：

```javascript
const freshMfaCache = new Map();
const FRESH_MFA_TTL_MS = 5 * 60 * 1000;

function requireFreshMfa(req, res, next) {
  const userId = req.tokenPayload?.userId;
  const user = usersDB.get(userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '需要管理员权限' });
  }
  if (!user.adminTotpEnabled) {
    return res.status(403).json({ success: false, message: '请先开启管理员二次验证' });
  }

  const cached = freshMfaCache.get(userId);
  if (cached && Date.now() - cached.verifiedAt < FRESH_MFA_TTL_MS) {
    return next();
  }

  const { totpCode } = req.body;
  const totpSecret = adminTOTPSecrets.get(userId);
  if (!totpCode || !totpSecret || !totpSecret.verified) {
    logAudit({ userId, action: 'admin_fresh_mfa_required', ip: getClientIP(req), details: '敏感操作缺少二次验证', success: false });
    return res.status(403).json({ success: false, code: 'FRESH_MFA_REQUIRED', message: '请先输入二次验证码以继续' });
  }

  const isValid = speakeasy.totp.verify({ secret: totpSecret.secret, encoding: 'base32', token: totpCode, window: 1 });
  if (!isValid) {
    logAudit({ userId, action: 'admin_fresh_mfa_failed', ip: getClientIP(req), details: '敏感操作二次验证失败', success: false });
    return res.status(403).json({ success: false, message: '二次验证码错误' });
  }

  freshMfaCache.set(userId, { verifiedAt: Date.now() });
  next();
}
```

- [ ] **Step 3: 把 requireFreshMfa 应用到高危接口**

在 `/api/admin/isolation/activate` 和 `/api/admin/isolation/deactivate` 前加入 `requireFreshMfa`：

```javascript
app.post('/api/admin/isolation/activate', authMiddleware, requireAdmin, requireFreshMfa, async (req, res) => { ... });
app.post('/api/admin/isolation/deactivate', authMiddleware, requireAdmin, requireFreshMfa, async (req, res) => { ... });
```

- [ ] **Step 4: 测试敏感操作二次验证**

Run:
```powershell
curl -X POST http://localhost:3001/api/admin/isolation/activate `
  -H "Authorization: Bearer <admin-token>" `
  -H "Content-Type: application/json" `
  -d '{"level":"lockdown"}'
```

Expected: `403 FRESH_MFA_REQUIRED`

Run with totpCode:
```powershell
curl -X POST http://localhost:3001/api/admin/isolation/activate `
  -H "Authorization: Bearer <admin-token>" `
  -H "Content-Type: application/json" `
  -d '{"level":"lockdown","totpCode":"123456"}'
```

Expected with valid code: `200 success`

---

## Task 5: 禁止管理员通过普通登录接口登录

**目标：** 管理员只能使用 `/api/admin/login` 登录，防止绕过 admin 专用防护。

**Files:**
- Modify: `api/index.js:1594-1689` (/api/login)

- [ ] **Step 1: 在普通登录中拒绝管理员角色**

在 `/api/login` 中找到 `const foundUser = ...` 之后、密码校验之前插入：

```javascript
if (foundUser.role === 'admin') {
  logAudit({ userId: foundUser.id, action: 'login_failed', ip, details: '管理员尝试通过普通登录接口登录', success: false });
  res.status(403).json({ success: false, message: '管理员请使用专用登录入口' });
  return;
}
```

- [ ] **Step 2: 测试普通接口拒绝管理员**

Run:
```powershell
curl -X POST http://localhost:3001/api/login `
  -H "Content-Type: application/json" `
  -d '{"email":"admin@lingualeap.com","password":"<admin-password>","captchaId":"...","captchaCode":"..."}'
```

Expected: `403 管理员请使用专用登录入口`

---

## Task 6: 管理员会话绑定 IP + UA

**目标：** token 一旦在异常环境使用立即失效。

**Files:**
- Modify: `api/index.js:1860-1878` (session creation)
- Modify: `api/index.js` authMiddleware 校验会话绑定

- [ ] **Step 1: 创建会话时存储 IP 和 UA hash**

在 `/api/admin/login` 登录成功处，把 session 对象扩展为：

```javascript
const crypto = await import('crypto');
const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex').substring(0, 16);

userSessions.push({
  id: sessionId,
  device: deviceInfo.device,
  browser: `${deviceInfo.browser} · ${deviceInfo.os}`,
  ip,
  uaHash,
  lastActive: now,
  isCurrent: true,
});
```

- [ ] **Step 2: authMiddleware 增加会话绑定校验**

找到 `authMiddleware`（约在 2228 行附近），在 token 验证成功后、设置 req.user 之前插入：

```javascript
const currentIp = getClientIP(req);
const currentUa = req.headers['user-agent'] || '';
const currentUaHash = crypto.createHash('sha256').update(currentUa).digest('hex').substring(0, 16);

const userSessions = sessionsDB.get(decoded.userId) || [];
const matchedSession = userSessions.find(s => s.id === decoded.sessionId);
if (matchedSession) {
  if (matchedSession.ip !== currentIp || matchedSession.uaHash !== currentUaHash) {
    logAudit({ userId: decoded.userId, action: 'session_binding_violation', ip: currentIp, details: `IP或UA不匹配: ${matchedSession.ip} != ${currentIp}`, success: false });
    res.status(401).json({ success: false, message: '登录环境异常，请重新登录' });
    return;
  }
}
```

注意：JWT payload 当前没有 `sessionId`。需要在 `generateToken` 中增加 sessionId 参数，或在签发 token 时把 sessionId 写入 payload。

- [ ] **Step 3: generateToken 携带 sessionId**

修改 `generateToken`：

```javascript
function generateToken(userId, expiresIn = '15m', sessionId = null) {
  const payload = { userId, type: 'access', kv: KEY_VERSION, pepper: JWT_PEPPER };
  if (sessionId) payload.sessionId = sessionId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}
```

管理员登录时：
```javascript
const token = generateToken(foundUser.id, '5m', sessionId);
```

普通用户登录时：
```javascript
const token = generateToken(foundUser.id, '15m', sessionId);
```

- [ ] **Step 4: 测试会话绑定**

登录管理员拿到 token，然后修改请求 UA 再次调用 `/api/admin/isolation`：

```powershell
curl -H "Authorization: Bearer <token>" -A "HackerBrowser/1.0" http://localhost:3001/api/admin/isolation
```

Expected: `401 登录环境异常，请重新登录`

---

## Task 7: 管理员操作审计中间件

**目标：** 所有 `/api/admin/*` 操作（不仅是登录）都被审计。

**Files:**
- Modify: `api/index.js` 在 `app.use('/api/admin', authMiddleware);` 后添加审计中间件

- [ ] **Step 1: 添加 admin 审计中间件**

在 `app.use('/api/admin', authMiddleware);` 之后添加：

```javascript
app.use('/api/admin', (req, res, next) => {
  const userId = req.tokenPayload?.userId || 'unknown';
  const ip = getClientIP(req);
  const details = `${req.method} ${req.path}`;
  logAudit({ userId, action: 'admin_api_access', ip, details, success: true });
  next();
});
```

- [ ] **Step 2: 测试审计日志**

Run:
```powershell
curl -H "Authorization: Bearer <admin-token>" http://localhost:3001/api/admin/isolation
```

Expected: `audit-log.json` 或 SQLite 审计表中出现 `admin_api_access` 记录。

---

## Self-Review Checklist

- [ ] Spec coverage: 后端 127.0.0.1 ✅ Task 1
- [ ] Spec coverage: 强制 2FA ✅ Task 2
- [ ] Spec coverage: 短 token ✅ Task 3
- [ ] Spec coverage: 敏感操作二次验证 ✅ Task 4
- [ ] Spec coverage: 禁止管理员走普通登录 ✅ Task 5
- [ ] Spec coverage: 会话绑定 ✅ Task 6
- [ ] Spec coverage: admin 操作审计 ✅ Task 7
- [ ] Placeholder scan: 无 TODO/TBD
- [ ] Type consistency: `generateToken(userId, expiresIn, sessionId)` 签名在所有调用处一致

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-22-admin-security-hardening-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
