# 前端安全 SDK + 管理员 ABAC 权限设计

## 1. 背景与目标

系统此前遭受过攻击，存在以下核心风险：
- 前端源码/配置暴露被扫描器利用
- API 未授权访问
- 用户隐私数据在请求/日志中意外泄露
- XSS 注入
- 管理员账号一旦被窃取即可完全接管系统

本设计目标：
- 在前端建立独立安全 SDK，进行请求拦截、隐私脱敏、源码泄露扫描、XSS 过滤、事件上报
- 后端建立安全事件分析与自动处置能力
- 为管理员建立细粒度 ABAC（属性基访问控制），最小化单点账号泄露的影响
- 为 AI/自动化系统单独设立受限角色，禁止自动执行高危操作

## 2. 前端安全 SDK 架构

目录：`src/security/`

| 模块 | 职责 |
|---|---|
| `SecurityClient.ts` | 总入口，初始化所有组件，提供全局开关 `enable/disable/reset` |
| `interceptors/RequestInterceptor.ts` | 拦截 `fetch` / `axios`，校验 API 白名单、请求方法、Headers、Body |
| `guards/PrivacyGuard.ts` | 敏感字段识别与脱敏（请求/响应/localStorage/sessionStorage/console） |
| `scanners/LeakScanner.ts` | 页面加载后扫描 source map 链接、`.env` 关键字、私钥字符串等 |
| `guards/XSSFilter.ts` | URL 参数、DOM 注入、危险 `innerHTML`/`eval` 过滤与告警 |
| `reporters/AuditReporter.ts` | 安全事件加密、批量、异步、失败重试上报 |
| `rules/SecurityRules.ts` | 可配置规则：API 白名单、敏感字段、危险模式 |
| `types.ts` | 公共类型定义 |

### 2.1 数据流

1. 应用启动调用 `SecurityClient.init()`
2. `RequestInterceptor` 包装全局 `fetch`，所有请求前校验：
   - URL 是否在 `API_WHITELIST`
   - 是否包含危险 Header（如 `x-opencode-auth`）
   - Body 是否包含未脱敏敏感字段
3. 响应返回后 `PrivacyGuard`：
   - 扫描响应中是否意外包含明文 token/password
   - 对 console.error / console.warn 中可能泄露的信息脱敏
4. 页面加载完成后 `LeakScanner`：
   - 扫描 DOM 中的 `<script>` src 是否指向 `.map`
   - 扫描页面源码中是否包含 `JWT_SECRET`、`DATABASE_URL`、`BEGIN PRIVATE KEY` 等
5. 发现异常时 `AuditReporter`：
   - 本地先脱敏
   - 批量异步上报到后端 `POST /api/security/events`
6. 后端 `analyzer` 分析、`actions` 自动处置、管理员面板实时告警

### 2.2 事件类型

```typescript
type SecurityEventType =
  | 'UNAUTHORIZED_API_ATTEMPT'    // 尝试访问未授权 API
  | 'SENSITIVE_DATA_LEAK'         // 请求/响应/日志中出现未脱敏敏感字段
  | 'SOURCE_CODE_EXPOSED'         // 检测到源码/配置/密钥暴露
  | 'XSS_ATTEMPT'                 // 检测到可疑注入
  | 'ANOMALY_PATTERN'             // 异常访问模式
```

### 2.3 性能与隐私约束

- 上报异步、批量（每 5 秒或累积 10 条），失败本地队列重试
- 前端先脱敏再上报，绝不允许把用户密码/Token 明文发出去
- 支持 `reducedSecurity` 模式，低性能设备可关闭扫描
- 安全 SDK 自身异常必须静默处理，不能导致页面白屏

## 3. 后端安全分析服务

| 模块 | 职责 |
|---|---|
| `api/security/events.js` | `POST /api/security/events` 接收前端事件，严格限流 |
| `api/security/analyzer.js` | 规则引擎：识别异常模式、聚合、打分 |
| `api/security/actions.js` | 自动处置：限流、撤销 token、标记 IP、触发隔离 |
| `api/security/admin-routes.js` | 管理员查询事件、告警列表、趋势统计 |
| `data/security-events.sqlite` | 持久化安全事件 |

### 3.1 自动处置策略

- 同一 IP 10 分钟内触发 3 次 `UNAUTHORIZED_API_ATTEMPT` → 临时封禁 IP
- 检测到 `SOURCE_CODE_EXPOSED` → 立即告警管理员
- 检测到 `XSS_ATTEMPT` → 记录并限流该会话
- 同一账号多地登录 + 敏感操作 → 触发账户临时锁定

## 4. 管理员 ABAC 权限模型

### 4.1 实体属性

**Subject（管理员）**
```typescript
{
  userId: string
  roles: ('super_admin' | 'security_admin' | 'user_admin' | 'content_admin' | 'system_admin' | 'support' | 'security_automation')[]
  mfaVerified: boolean
  mfaVerifiedAt: number
  ipInWhitelist: boolean
  trustLevel: 'high' | 'medium' | 'low'
}
```

**Resource**
```typescript
{
  type: 'user' | 'course' | 'post' | 'audit_log' | 'security_setting' | 'system_config' | 'admin_role'
  ownerId?: string
  isAdmin: boolean
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted'
}
```

**Action**
`read`, `create`, `update`, `delete`, `assign_role`, `revoke_role`, `isolate`, `export`, `shutdown`, `approve`

**Environment**
```typescript
{
  timeOfDay: number
  ipInWhitelist: boolean
  threatLevel: 'normal' | 'alert' | 'quarantine' | 'lockdown'
}
```

### 4.2 核心策略

| 策略 | 条件 | 结果 |
|---|---|---|
| 超级管理员 | `role == super_admin` AND `mfaVerified` AND `ipInWhitelist` | 允许所有 |
| 用户管理员管理普通用户 | `role == user_admin` AND `resource.type == user` AND `resource.isAdmin == false` | 允许 read/create/update/delete |
| 用户管理员不可管理其他管理员 | `role == user_admin` AND `resource.type == user` AND `resource.isAdmin == true` | **拒绝** |
| 安全管理员 | `role == security_admin` AND `resource.type in [audit_log, security_setting]` AND `mfaVerified` | 允许 read/update/isolate |
| 内容管理员 | `role == content_admin` AND `resource.type in [course, post, comment]` | 允许 read/create/update/delete |
| 系统管理员 | `role == system_admin` AND `resource.type == system_config` | 允许 read/update，禁止 shutdown |
| 审计日志不可删除 | `resource.type == audit_log` AND `action == delete` | **拒绝**（仅 super_admin 在 lockdown 下可归档） |
| 敏感操作需二次验证 | `action in [delete, assign_role, isolate, shutdown]` AND `mfaVerifiedWithin(5min)` | 允许 |
| 异常环境限制 | `environment.threatLevel != normal` AND `role not in [security_admin, super_admin]` | **拒绝所有敏感操作** |
| 管理员不可自提权 | `action == assign_role` AND `subject.userId == resource.userId` | **拒绝** |

### 4.3 AI / 自动化角色

`security_automation` 单独设立，权限最小化：

**允许：**
- `audit_log:read`
- `security_setting:read`
- `threat:report`（提交分析报告/建议）
- `isolation:propose`（建议隔离，需人工确认）

**禁止：**
- 删除用户
- 分配/撤销管理员角色
- 直接执行隔离、关服
- 删除或修改审计日志
- 修改安全策略或白名单

## 5. 实现计划概览

### Phase 1：前端安全 SDK 核心
- `SecurityClient` + `RequestInterceptor`
- `PrivacyGuard` 敏感字段脱敏
- `AuditReporter` 上报到后端

### Phase 2：后端安全分析
- `/api/security/events` 接收与限流
- SQLite 存储 + 简单规则引擎
- 自动处置（IP 限流、token 撤销）

### Phase 3：管理员 ABAC
- 角色表与权限策略引擎
- `requirePermission(resourceType, action, options)` 中间件
- 敏感操作二次验证

### Phase 4：监控面板与 AI 角色
- 管理员安全事件面板
- `security_automation` 角色接入

## 6. 风险与约束

- 前端 SDK 可被绕过（用户可修改浏览器代码），因此所有关键判断必须以后端为准
- 过度拦截可能误伤正常用户，规则需要灰度开启
- 安全事件上报量增加后端压力，需要限流和采样
- ABAC 判断增加每个管理员请求的延迟，需要缓存策略
