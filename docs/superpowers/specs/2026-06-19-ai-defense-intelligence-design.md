# AI 防御系统智能化升级设计

## 1. 背景与目标

当前 AI 防御系统已具备基础能力：规则引擎、Z-Score 统计异常、模式检测、语义检测、行为分析和反馈闭环。但存在明显短板：规则硬编码、统计模型简单、无序列建模、无 LLM 实时推理、反馈依赖人工标注。

本期目标：让 AI 防御系统实现**真正的智能化**——会思考、会学习、会进化。

## 2. 范围

本期聚焦三个子系统：

- **子系统 1：智能实时决策引擎升级**
- **子系统 2：自适应学习与进化**
- **子系统 3：主动防御与欺骗**

威胁情报、跨实体关联分析、攻击链重构放在后续迭代。

## 3. 设计原则

1. **不阻塞核心链路**：LLM 推理、复杂模型必须异步，主请求保持低延迟。
2. **可开关、可观察**：所有新能力都有环境变量开关和管理面板指标。
3. **渐进替换**：在现有 `decisionEngine.js` 基础上扩展，不推倒重来。
4. **安全第一**：新增模型和规则生效前经过观察期，避免误拦截正常流量。

## 4. 子系统 1：智能实时决策引擎升级

### 4.1 架构

每次关键请求进入时，决策引擎并行/异步调用多个"专家"：

| 专家 | 类型 | 延迟要求 | 说明 |
|------|------|----------|------|
| 规则引擎 | 同步 | <1ms | 已有，保留，critical 严重模式快速拦截 |
| 统计异常模型 | 同步 | <1ms | 已有，增强为增量基线 |
| 时序行为模型 | 同步 | <2ms | 新增，基于请求序列识别扫描/爆破/爬虫 |
| 威胁情报查询 | 同步 | <1ms | 新增，查本地缓存（本期只内置基础情报） |
| LLM 安全分析师 | 异步 | 50-200ms | 新增，仅对灰色请求（置信度 0.4~0.85）触发 |

### 4.2 决策流程

```
请求进入
  │
  ├─ 规则引擎 critical 命中 ──→ 立即 BLOCK
  │
  ├─ 同步专家并行打分（统计、时序、情报）
  │
  ├─ 贝叶斯融合层综合分数 → 初步 action + confidence
  │
  ├─ confidence 在 0.4~0.85 区间？
  │     ├─ 是 → 提交 LLM 安全分析师异步复核
  │     └─ 否 → 直接输出决策
  │
  └─ 输出：action + severity + reasoning + modelContributions
```

### 4.3 LLM 安全分析师

- **触发条件**：初步决策置信度在 0.4~0.85 之间，且非纯本地/白名单请求。
- **输入**：请求元信息（IP、路径、方法、UA、历史行为摘要、规则命中、统计异常、时序信号）。
- **输出**：
  - `riskLevel`: low / medium / high / critical
  - `recommendedAction`: ALLOW / CHALLENGE / BLOCK
  - `confidence`: 0~1
  - `reasoning`: 人类可读的风险解释
  - `indicators`: 具体风险指标列表
- **实现**：调用智谱 `glm-4.7-flash`（免费模型），通过 `aiConfigurator.call`。
- **效果应用**：LLM 输出异步修正后续请求，或把本次决策加入反馈队列。

### 4.4 时序行为模型

替换/增强现有 `behaviorAnalyzer.js` 的简单启发式：

- 维护每个 IP / 用户 / session 的最近 N 条请求序列。
- 提取序列特征：
  - 路径转移概率（马尔可夫链）
  - 请求间隔分布
  - 方法序列模式
  - 敏感路径访问密度
  - 登录/失败/成功转换模式
- 使用轻量异常评分，无需训练：
  - 对正常路径转移建立计数表
  - 新转移的异常度 = 1 / (出现次数 + 1)
  - 聚合得到序列异常分

### 4.5 威胁情报（本地缓存版）

本期不接入外部付费情报源，只建立可扩展的本地情报层：

- `ThreatIntel` 类，维护：
  - 已知恶意 IP 列表（可手动/自动添加）
  - Tor 出口节点列表（可选，定期更新）
  - 公开代理/IDC 段标记
  - 已知攻击指纹（UA、路径组合）
- 决策上下文增加 `threatIntelScore`。
- 提供 `/api/admin/security/threat-intel` 管理接口。

## 5. 子系统 2：自适应学习与进化

### 5.1 正常行为基线学习

对每个维度自动学习增量统计基线：

| 维度 | 特征 | 用途 |
|------|------|------|
| IP | 请求频率、路径分布、时间段 | 识别异常流量 |
| 用户 | 登录时间、常用端点、设备指纹 | 识别账号盗用 |
| 端点 | 正常请求间隔、payload 大小 | 识别 API 滥用 |
| 全局 | 整体失败率、注册率、登录率 | 识别业务层攻击 |

实现：使用 Welford 算法增量更新 mean/variance，滑动窗口保留最近样本。

### 5.2 在线规则进化

- **候选规则发现**：当某类攻击反复出现（如某个 IP 段大量扫描 `/admin`），自动生成候选规则。
- **观察期**：候选规则只记录命中，不拦截，持续 10 分钟或 50 次命中。
- **自动启用**：观察期内无正常流量命中 → 自动启用；否则丢弃。
- **规则淘汰**：已启用规则如果误报率 > 5% 连续 1 小时，自动降级或移除。

### 5.3 模型信任度动态调整

扩展现有 `FeedbackLoop`：

- 记录每个专家的历史表现：TP、FP、FN、TN。
- 根据表现动态调整 `BayesianFusion.modelTrust`。
- 增加时间衰减：近期表现权重更高。

## 6. 子系统 3：自动隔离系统智能化

### 6.1 目标

让自动隔离从"固定阈值触发"升级为"AI 驱动的预测性、分级、可自愈隔离"。

### 6.2 智能隔离触发

现有 `autoIsolation.js` 基于固定阈值（如 3 次敏感访问 → 半隔离）。升级后：

- 接收 `decisionEngine` 的决策事件，综合判断威胁等级
- 不仅看单一攻击维度，还看攻击链阶段：
  - 侦察（扫描）→ 警戒/半隔离
  - 试探（未授权 admin）→ 半隔离
  - 利用（蜜罐触发、JWT 伪造成功）→ 完全隔离
- 引入动态威胁分：
  - 每个事件按类型/置信度/情报分加权
  - 威胁分达到阈值后触发对应级别隔离

### 6.3 预测性隔离

- 当 AI 检测到攻击链处于早期阶段（如连续侦察 + IP 信誉下降），提前升级到警戒或半隔离
- 对分布式攻击：多个不同 IP 但行为相似时，提升全局隔离级别
- 对已知攻击模式：匹配历史攻击链模板，提前阻断

### 6.4 动态隔离策略

根据攻击类型自动选择隔离策略：

| 攻击类型 | 默认隔离策略 |
|----------|--------------|
| 敏感路径扫描 | 半隔离，保留登录/注册 |
| 未授权 admin 访问 | 半隔离，严格限制 API |
| JWT/token 异常 | 警戒，加强审计 |
| 蜜罐触发 | 完全隔离，仅保留本地管理 |
| 凭证填充 | 完全隔离，拒绝该 IP 所有请求 |

策略可配置，管理员可覆盖。

### 6.5 智能恢复

- 自动恢复时间不再是固定值，而是基于威胁消退信号动态计算：
  - 无新攻击事件 → 加速恢复
  - 持续有攻击 → 延长恢复时间
  - 完全隔离默认仍需手动解除，但可配置为自动恢复（风险场景）
- 恢复前进行"试探性降级"：先降到半隔离观察，再降到警戒，最后正常

### 6.6 双向联动

- AI 防御系统 → 自动隔离：AI 决策事件驱动隔离升级
- 自动隔离 → AI 防御系统：隔离级别变化反馈给决策引擎，影响后续决策（如 LOCKDOWN 下降低正常请求的挑战率）
- 共享事件队列：统一记录到审计日志和决策历史

### 6.7 环境变量开关

```bash
# 智能隔离触发
AI_SMART_ISOLATION=true

# 预测性隔离
AI_PREDICTIVE_ISOLATION=true

# 动态隔离策略
AI_DYNAMIC_ISOLATION_POLICY=true

# 智能自动恢复
AI_SMART_RECOVERY=true
```

## 7. 子系统 4：主动防御与欺骗

### 7.1 目标

不仅被动拦截，还要主动消耗攻击者、误导攻击路径、延缓真实系统暴露。

### 7.2 动态蜜罐生成

- 对高可疑 IP / session，动态暴露一组假端点：
  - `/admin/legacy/login`
  - `/api/internal/users`
  - `/config/backup.json`
  - `/debug/sql`
- 这些端点只对该攻击者可见，正常用户不会访问到。
- 触发条件：
  - AI 决策为 `BLOCK` 或 `CHALLENGE` 且置信度 > 0.8
  - 行为分析识别为扫描/侦察
  - 主动防御开关开启
- 蜜罐访问自动触发：
  - 记录到 `honeypotEvents`
  - 调用 `autoIsolation.recordHoneypot(req)` 直接升 LOCKDOWN
  - 提升该 IP 的信誉分

### 7.3 响应欺骗

对可疑请求返回经过构造的响应，而非直接 403：

| 场景 | 欺骗策略 |
|------|----------|
  | 扫描敏感路径 | 返回 200 + 假源码片段/假配置（标记过的内容） |
  | 未授权 admin 接口 | 返回 200 + 假用户列表/假日志，诱导继续暴露 |
  | 登录爆破 | 随机延迟 1-5 秒，返回统一模糊错误，不暴露用户存在性 |
  | API 滥用 | 降速（rate degrade），返回部分假数据 |

- 欺骗响应内容由 LLM 根据攻击类型生成模板，确保看起来像真的。
- 所有欺骗行为记录到审计日志，便于后续分析攻击意图。

### 7.4 自动隔离联动

- 当主动防御判定为真实攻击时，自动向 `autoIsolation` 上报：
  - `recordHoneypot`（直接 LOCKDOWN）
  - `recordAdminAttack` / `recordSensitiveAccess` / `recordJwtAnomaly`（按需）
- 主动防御的触发会缩短隔离升级路径：
  - 蜜罐触发 → 直接完全隔离
  - 两次欺骗响应被继续利用 → 半隔离

### 7.5 攻击者画像

维护一个高可疑实体的画像：

```js
{
  ip,
  firstSeen,
  lastSeen,
  tactics: ['扫描', '爆破', '注入尝试'],
  deceptionInteractions: 5,
  isolationTriggered: true,
  confidence: 0.92
}
```

提供 `GET /api/admin/security/attacker-profiles` 查看。

### 7.6 环境变量开关

```bash
# 开启主动防御与欺骗
AI_ACTIVE_DEFENSE=true

# 动态蜜罐
AI_HONEYPOT_DYNAMIC=true

# 响应欺骗
AI_DECEPTION_RESPONSE=true

# 自动隔离联动
AI_AUTO_ISOLATION_LINK=true
```

## 8. 与现有系统的集成

### 8.1 API 接入点

- 在 `api/index.js` 的 AI 决策中间件中，继续调用 `decisionEngine.decide(context)`。
- `decisionEngine` 内部扩展，不影响中间件调用方式。
- `autoIsolation.recordDecision(decision)` 继续接收决策事件。
- 主动防御模块在 AI 决策后、响应返回前介入，决定是否替换为欺骗响应或投放蜜罐。

### 8.2 新增管理接口

- `GET /api/admin/security/ai-config`：查看当前基线、规则、模型信任度。
- `POST /api/admin/security/ai-config/reset-baseline`：重置学习基线。
- `POST /api/admin/security/ai-config/toggle-llm`：开关 LLM 分析师。
- `GET /api/admin/security/ai-decisions`：查看最近 AI 决策和 LLM 复核结果。
- `GET /api/admin/security/attacker-profiles`：查看攻击者画像。
- `POST /api/admin/security/deception/seed`：手动向某 IP 投放动态蜜罐。
- `GET /api/admin/security/isolation-policy`：查看当前动态隔离策略。
- `POST /api/admin/security/isolation-policy`：调整隔离策略。

### 8.3 环境变量开关

```bash
# 开启增强型 AI 防御
AI_ENHANCED_DEFENSE=true

# 开启 LLM 安全分析师（默认 true）
AI_LLM_ANALYST=true

# LLM 分析师触发阈值
AI_LLM_CONFIDENCE_LOW=0.4
AI_LLM_CONFIDENCE_HIGH=0.85

# 开启自适应学习
AI_ADAPTIVE_LEARNING=true

# 开启在线规则进化
AI_RULE_EVOLUTION=true

# 自动隔离智能化
AI_SMART_ISOLATION=true
AI_PREDICTIVE_ISOLATION=true
AI_DYNAMIC_ISOLATION_POLICY=true
AI_SMART_RECOVERY=true

# 主动防御与欺骗
AI_ACTIVE_DEFENSE=true
AI_HONEYPOT_DYNAMIC=true
AI_DECEPTION_RESPONSE=true
AI_AUTO_ISOLATION_LINK=true
```

## 9. 数据结构与存储

### 9.1 基线存储

内存中维护，不持久化到文件（重启后重新学习，避免陈旧基线）：

```js
{
  ip: Map<ip, BaselineProfile>,
  user: Map<userId, BaselineProfile>,
  endpoint: Map<endpoint, BaselineProfile>,
  global: GlobalBaseline
}
```

### 9.2 LLM 复核队列

内存队列，最多保留 1000 条最近复核记录，用于审计和反馈。

### 9.3 进化规则存储

内存 + 可选的 `ai-evolved-rules.json`（不纳入 git），重启后加载。

### 9.4 攻击者画像与蜜罐状态

内存中维护，不持久化：

```js
{
  attackerProfiles: Map<ip, AttackerProfile>,
  dynamicHoneypots: Map<sessionId, Set<endpoint>>,
  deceptionLog: Array<DeceptionEvent>
}
```

### 9.5 隔离策略配置

持久化到 `isolation-policy.json`（不纳入 git）：

```js
{
  policies: {
    RECONNAISSANCE: { level: 'alert', autoRecoverMs: 300000 },
    ADMIN_ATTACK: { level: 'quarantine', autoRecoverMs: 1800000 },
    HONEYPOT: { level: 'lockdown', autoRecoverMs: 0 }
  }
}
```

## 10. 性能与成本

### 10.1 性能预算

- 同步专家总耗时 < 5ms（P99）。
- LLM 分析师异步触发，不影响主响应延迟。
- 时序模型窗口最多保留 200 条请求/实体。
- 动态蜜罐判定 < 1ms。
- 智能隔离判定 < 1ms。

### 10.2 成本预算

- LLM 只分析"灰色请求"，预计调用量减少 80% 以上。
- 欺骗响应复用模板，LLM 只用于生成/更新模板。
- 使用智谱 `glm-4.7-flash` 免费模型。

## 11. 安全与隐私

- LLM 输入中脱敏：不发送用户真实姓名、邮箱、密码、JWT token。
- 基线学习只使用请求元信息，不存储请求体。
- 欺骗响应中的假数据必须无法反向推导出真实系统结构。
- 动态蜜罐端点必须与普通端点明显隔离，避免正常用户误触。
- 智能恢复必须保守，完全隔离默认仍需手动解除。
- 所有管理接口都需要 `authMiddleware + requireAdmin`。

## 12. 测试计划

1. 单元测试：
   - 时序行为模型对扫描/爬虫的识别
   - 基线学习对异常请求的检测
   - 贝叶斯融合在多个专家冲突时的表现
   - 动态蜜罐只对可疑 IP 暴露
   - 智能隔离根据攻击类型选择正确级别
2. 集成测试：
   - `scripts/test-ai-defense.js` 模拟攻击序列，验证决策升级
   - `scripts/test-active-defense.js` 验证蜜罐触发隔离、欺骗响应生效
   - `scripts/test-smart-isolation.js` 验证预测性隔离和动态恢复
   - LLM 分析师对灰色请求的输出质量
3. 线上观察：
   - 开启后观察 24 小时决策分布、误报率、LLM 调用量、蜜罐触发次数、隔离级别变化

## 13. 成功标准

- 自动隔离系统误报率下降（不会因为普通请求误触发隔离）。
- 能识别现有规则未覆盖的新型扫描/爆破模式。
- LLM 能对"灰色请求"给出可理解的风险理由。
- 系统运行 7 天后，自适应规则开始生效，人工调参需求明显减少。
- 蜜罐被触发后能直接升级到完全隔离。
- 欺骗响应能诱导攻击者暴露更多攻击意图。
- 智能隔离能根据攻击链阶段提前/准确升级。

## 14. 后续迭代

- 威胁情报外部源接入（免费/自建）。
- 跨实体关联图与攻击链重构。
- 攻击者行为沙箱与自动样本提取。
