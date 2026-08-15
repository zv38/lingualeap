# UI 优化 + AI 防御优化 + AI 隐私系统设计方案

日期：2026-06-17
方案：B（均衡升级）

## 1. 目标与范围

在不影响现有业务的前提下，对平台做三项升级：

1. **UI 优化**：打造一个专业、可读、有品质感的管理后台与全局交互体验。
2. **AI 防御系统优化**：从单点规则升级到多层检测，并提供实时可视化与可解释性。
3. **AI 隐私系统**：建立覆盖输入脱敏、输出过滤、会话保留、用户授权的全链路隐私保护。

## 2. 设计原则

- **兼容现有代码**：复用现有 CSS 变量、GlassCard、PillNav 等基础组件，不推倒重来。
- **安全优先**：隐私和防御功能默认启用，用户可显式关闭授权。
- **可观测**：Admin 后台必须能实时看到 AI 决策、风险事件、隐私扫描结果。
- **性能可控**：防御检测增加 early-exit、本地缓存、异步反馈，避免阻塞主请求。

## 3. UI 优化设计

### 3.1 Admin 安全运营中心（AdminDashboard）

将现有 AdminDashboard 升级为“安全运营中心”风格：

- **顶部 KPI 卡片**：今日请求数、拦截数、风险评分均值、活跃威胁 IP 数、隐私扫描命中数。
- **实时决策流**：右侧或底部展示最近 20 条 AI 决策记录，含时间、IP、动作、置信度、原因。
- **威胁列表**：展示被拦截/挑战的请求，支持按风险等级过滤。
- **隐私概览**：展示输入 PII 脱敏次数、输出敏感信息拦截次数、会话保留合规率。
- **视觉风格**：深色玻璃卡片、高对比度文字、细腻边框与发光效果、微交互动效。

### 3.2 全局导航与微交互

- **PillNav**：
  - 优化 active 状态指示（下划线/背景高亮）。
  - 减少不必要的动画，使用 94% 不透明度和 8px backdrop-blur（符合项目约定）。
  - 增加图标 + 文字的可读性。
- **Toast**：
  - 增加图标前缀（成功/错误/警告）。
  - 进入/退出动效更细腻（slide + fade）。
  - 支持多条堆叠与手动关闭。
- **Loading / Skeleton**：
  - 统一骨架屏样式，使用 subtle shimmer 动画。
  - 按钮 loading 状态显示 spinner + 文字变化。

### 3.3 首页与核心学习页面

- **Home**：优化课程卡片布局，增加 hover 3D tilt、渐变阴影、更清晰的信息层级。
- **学习数据**：使用更克制的图表配色，确保数据可读。
- **动画**：减少 full-screen blur/3D transform，避免路由切换掉帧；保留有意义的入场动画。

## 4. AI 防御系统优化设计

### 4.1 多层检测架构

在现有 `decisionEngine` 基础上，引入三层检测，按优先级短路：

1. **白名单/信任设备快速通道**：已知可信设备 + 低历史风险 → ALLOW（减少延迟）。
2. **规则层**：增强版 PromptGuard + IP 黑名单 + 请求速率 + 行为规则。
3. **统计与模式层**：统计模型 + 攻击模式识别（已有）。
4. **语义层（新增）**：基于启发式和结构分析的语义 Prompt 注入检测，识别间接越狱、角色扮演绕过、分步注入等。
5. **行为层（新增）**：会话序列异常检测，识别自动化工具、试探性攻击、爬虫行为。

### 4.2 新增模块

- `api/ai-decision/semanticDetector.js`
  - 检测间接注入、分步指令、语义角色扮演、隐藏意图等。
  - 输出威胁分数和分类标签。
- `api/ai-decision/behaviorAnalyzer.js`
  - 分析同一 IP/用户/session 的连续请求序列。
  - 识别高频试探、异常路径遍历、非人类点击模式。
- `api/ai-decision/thresholdOptimizer.js`（增强）
  - 根据误报反馈自动调整阈值。
  - 增加“人工复核队列”机制，收集被用户申诉的拦截记录。

### 4.3 可视化与可解释性

- Admin 后台展示：
  - 决策动作分布（ALLOW / CHALLENGE / BLOCK / DEGRADE）。
  - 检测层级贡献占比（规则/统计/语义/行为）。
  - 实时风险热力图 / Top 威胁 IP。
  - 平均决策延迟趋势。

### 4.4 性能优化

- 对同一 IP/指纹的决策结果缓存 30 秒。
- 规则层命中严重模式时直接 BLOCK，不再进入后续层。
- 语义/行为检测异步执行，不阻塞核心响应（仅影响 CHALLENGE/BLOCK 场景）。

## 5. AI 隐私系统设计

### 5.1 输入侧 PII 脱敏

- 模块：`api/ai/privacyGuard.js`
- 检测类型：手机号、身份证号、邮箱、银行卡号、住址、姓名、出生日期、车牌号。
- 处理方式：
  - 用户可选择“严格模式”（直接阻止含 PII 的消息）或“脱敏模式”（自动替换为占位符）。
  - 默认对 AI 后端发送脱敏后的内容，原始内容不进入 AI 训练/日志。
- 管理后台展示：今日 PII 扫描数、各类 PII 命中占比。

### 5.2 输出侧敏感信息过滤

- 检测 AI 返回内容中的：API 密钥、JWT Token、密码、内部 URL、私有 IP、大量邮箱。
- 命中后：
  - 对管理员/系统记录告警。
  - 对用户展示替换后的内容（如 `***REDACTED***`）。

### 5.3 AI 会话数据生命周期管理

- 模块：`api/ai/chatRetention.js`
- 存储：每条 AI 对话附加 `createdAt`、`expiresAt`、`userId`、`privacyConsent`。
- 策略：
  - 默认保留 30 天，到期自动清理。
  - 用户可在 PrivacySettings 中删除自己的全部 AI 对话历史。
  - 未获得 `aiDataConsent` 的用户，对话仅保留 24 小时且仅用于服务交付。

### 5.4 用户授权控制

- 用户模型新增字段：`aiDataConsent`（布尔，默认 false）。
- 首次使用 AI 功能时弹出授权弹窗，说明数据用途。
- PrivacySettings 页面增加开关，用户可随时撤销授权。
- 撤销后：
  - 不再使用历史数据进行个性化。
  - 已存储的个性化数据在 7 天内删除。
  - 仍可继续使用 AI 基础功能。

### 5.5 隐私审计

- 后端记录隐私相关事件：PII 脱敏、输出过滤、授权变更、数据删除、保留策略执行。
- Admin 后台展示隐私事件时间线和统计。

## 6. 数据流

用户输入 → 隐私输入扫描（PII 检测/脱敏） → PromptGuard 注入检测 → AI 决策引擎（多层） → AI API 调用 → 隐私输出扫描（敏感信息过滤） → 用户看到回复 → 聊天记录按保留策略存储

## 7. 新增与修改文件清单

### 后端

- `api/ai/privacyGuard.js`（新）
- `api/ai/chatRetention.js`（新）
- `api/ai-decision/semanticDetector.js`（新）
- `api/ai-decision/behaviorAnalyzer.js`（新）
- `api/ai-decision/thresholdOptimizer.js`（增强）
- `api/security/promptGuard.js`（增强）
- `api/index.js`（集成新模块、新增 API 端点）

### 前端

- `src/pages/AdminDashboard.tsx`（重写为安全运营中心）
- `src/components/AIDecisionStream.tsx`（新）
- `src/components/ThreatList.tsx`（新）
- `src/components/PrivacyEventLog.tsx`（新）
- `src/components/StatCard.tsx`（新，复用 KPI 卡片）
- `src/components/PillNav.tsx`（改进）
- `src/components/Toast.tsx`（改进）
- `src/components/LoadingSpinner.tsx`（改进）
- `src/pages/PrivacySettings.tsx`（扩展 AI 授权与数据管理）
- `src/pages/Home.tsx`（视觉微调）
- `src/store/useStore.ts`（增加 aiDataConsent、持久化）

## 8. API 端点设计

| 端点 | 方法 | 说明 | 权限 |
|---|---|---|---|
| `/api/ai/privacy/scan-input` | POST | 测试输入 PII 扫描与脱敏 | Admin |
| `/api/ai/privacy/scan-output` | POST | 测试输出敏感信息过滤 | Admin |
| `/api/ai/privacy/events` | GET | 获取隐私事件列表 | Admin |
| `/api/ai/chat/history` | GET | 当前用户获取自己的 AI 对话历史 | 登录用户 |
| `/api/ai/chat/history` | DELETE | 当前用户删除自己的 AI 对话历史 | 登录用户 |
| `/api/user/privacy-consent` | GET | 获取 AI 数据授权状态 | 登录用户 |
| `/api/user/privacy-consent` | POST | 更新 AI 数据授权状态 | 登录用户 |
| `/api/admin/security/dashboard` | GET | 安全运营中心聚合数据 | Admin |
| `/api/admin/security/decisions` | GET | 分页 AI 决策记录 | Admin |
| `/api/admin/security/threats` | GET | 活跃威胁列表 | Admin |

## 9. 验收标准

- [ ] AdminDashboard 能展示实时安全 KPI、决策流、威胁列表、隐私概览。
- [ ] AI 聊天输入经过 PII 脱敏，输出经过敏感信息过滤。
- [ ] 用户首次使用 AI 必须完成授权，且可在 PrivacySettings 中撤销。
- [ ] 决策引擎平均延迟不超过 50ms（白名单/缓存场景）。
- [ ] 新增语义/行为检测能识别至少 3 种新型攻击模式。
- [ ] 服务整体可正常启动，核心页面可访问。

## 10. 风险与回滚

- **风险**：新检测层可能增加正常请求误拦截。
- **缓解**：新增模块默认以 OBSERVE/WARN 模式运行一周，收集反馈后再启用 BLOCK；保留白名单和申诉入口。
- **回滚**：通过 `PRIVACY_STRICT_MODE=false` / `SEMANTIC_DETECTION=false` 环境变量可关闭新功能。
