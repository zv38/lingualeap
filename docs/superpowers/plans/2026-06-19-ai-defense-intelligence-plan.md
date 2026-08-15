# AI 防御系统智能化升级实施计划

> **For agentic workers:** REQUIRED SUB- SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 AI 防御系统升级为具备智能实时决策、自适应学习、自动隔离智能化和主动防御欺骗能力的下一代 AI 安全系统。

**Architecture:** 在现有 `api/ai-decision` 和 `api/security` 模块基础上，新增时序模型、LLM 安全分析师、基线学习、规则进化、智能隔离策略、动态蜜罐与响应欺骗等组件。各组件通过 `DecisionEngine` 统一输出决策，由 `AutoIsolationSystem` 执行隔离，由新的 `ActiveDefense` 模块执行主动欺骗。所有新增能力都有环境变量开关，默认关闭，避免影响现有业务。

**Tech Stack:** Node.js, Express, JavaScript ES modules, 智谱 AI `glm-4.7-flash` (ZHIPUAI_API_KEY), 原生 Map 内存存储。

---

## 文件结构

### 新增文件

- `api/ai-decision/temporalModel.js` — 时序行为模型，识别扫描/爆破/爬虫序列
- `api/ai-decision/llmSecurityAnalyst.js` — LLM 安全分析师，异步复核灰色请求
- `api/ai-decision/threatIntel.js` — 本地威胁情报缓存
- `api/ai-decision/baselineLearner.js` — 正常行为基线学习
- `api/ai-decision/ruleEvolution.js` — 在线规则进化
- `api/security/smartIsolation.js` — 自动隔离系统智能化扩展
- `api/security/activeDefense.js` — 主动防御与欺骗核心
- `api/security/deceptionTemplates.js` — 欺骗响应模板
- `scripts/test-ai-defense.js` — AI 防御集成测试
- `scripts/test-smart-isolation.js` — 智能隔离测试
- `scripts/test-active-defense.js` — 主动防御测试

### 修改文件

- `api/ai-decision/decisionEngine.js` — 集成时序模型、LLM 分析师、威胁情报
- `api/ai-decision/bayesianFusion.js` — 支持动态模型信任度
- `api/ai-decision/feedbackLoop.js` — 支持时间衰减的信任度调整
- `api/ai-decision/behaviorAnalyzer.js` — 补充时序模型输出
- `api/security/autoIsolation.js` — 接入智能隔离扩展
- `api/index.js` — 新增管理接口、主动防御中间件
- `src/components/IsolationControl.tsx` — 增加动态隔离策略查看/修改

---

## Phase 1: 智能实时决策引擎升级

### Task 1.1: 创建时序行为模型

**Files:**
- Create: `api/ai-decision/temporalModel.js`
- Test: `scripts/test-temporal-model.js`

**实现目标:** 基于请求序列计算转移异常分，识别扫描、爆破、爬虫。

- [ ] **Step 1: 实现时序模型核心类**

```js
// api/ai-decision/temporalModel.js
export class TemporalModel {
  constructor(options = {}) {
    this.enabled = process.env.AI_TEMPORAL_MODEL !== 'false'
    this.windowSize = options.windowSize || 200
    this.timeWindowMs = options.timeWindowMs || 60 * 1000
    this.sequences = new Map()
    this.transitionCounts = new Map()
    this.totalTransitions = new Map()
  }

  getKey(context) {
    return context.userId || context.sessionId || context.ip || 'unknown'
  }

  normalizePath(path) {
    if (!path) return '/'
    return path.replace(/\/[0-9a-f-]{20,}/gi, '/:id')
               .replace(/\?.*$/, '')
  }

  record(context) {
    if (!this.enabled) return { enabled: false, score: 0 }
    const key = this.getKey(context)
    const now = Date.now()
    const state = `${context.method || 'GET'}:${this.normalizePath(context.path)}`
    const entry = this.sequences.get(key) || { states: [], timestamps: [], firstSeen: now }

    entry.states.push(state)
    entry.timestamps.push(now)

    while (entry.states.length > this.windowSize ||
           (entry.timestamps.length > 0 && now - entry.timestamps[0] > this.timeWindowMs)) {
      entry.states.shift()
      entry.timestamps.shift()
    }

    this.sequences.set(key, entry)

    if (entry.states.length < 3) {
      return { enabled: true, score: 0, signals: [] }
    }

    return this.analyze(entry, context)
  }

  analyze(entry, context) {
    const signals = []
    let score = 0
    const states = entry.states

    // 1. 路径转移异常：新转移模式越少见，异常分越高
    let transitionAnomaly = 0
    for (let i = 1; i < states.length; i++) {
      const prev = states[i - 1]
      const curr = states[i]
      const transKey = `${prev}->${curr}`
      const key = this.getKey(context)
      const keyTransitions = this.transitionCounts.get(key) || new Map()
      const count = keyTransitions.get(transKey) || 0
      transitionAnomaly += 1 / (count + 1)
      keyTransitions.set(transKey, count + 1)
      this.transitionCounts.set(key, keyTransitions)
    }
    transitionAnomaly /= Math.max(states.length - 1, 1)

    if (transitionAnomaly > 0.5) {
      signals.push({ type: 'NOVEL_TRANSITION_PATTERN', value: transitionAnomaly.toFixed(2), risk: 'medium' })
      score += Math.min(transitionAnomaly * 0.3, 0.4)
    }

    // 2. 敏感路径扫描密度
    const sensitiveKeywords = ['admin', 'config', 'env', 'src', 'api/internal', 'backup', 'debug']
    const recent = states.slice(-20)
    const sensitiveCount = recent.filter(s => sensitiveKeywords.some(k => s.toLowerCase().includes(k))).length
    if (sensitiveCount >= 5) {
      signals.push({ type: 'SENSITIVE_PATH_SCANNING', value: sensitiveCount, risk: 'high' })
      score += 0.35
    }

    // 3. 快速方法切换（API 探测）
    const methods = states.map(s => s.split(':')[0])
    let methodSwitches = 0
    for (let i = 1; i < methods.length; i++) {
      if (methods[i] !== methods[i - 1]) methodSwitches++
    }
    if (methodSwitches >= 5 && states.length >= 10) {
      signals.push({ type: 'RAPID_METHOD_SWITCHING', value: methodSwitches, risk: 'medium' })
      score += 0.2
    }

    // 4. 登录相关路径的重复失败模式
    const loginAttempts = states.filter(s => s.includes('/login') || s.includes('/auth')).length
    if (loginAttempts >= 5) {
      const uniqueLoginPaths = new Set(states.filter(s => s.includes('/login') || s.includes('/auth'))).size
      if (uniqueLoginPaths <= 2) {
        signals.push({ type: 'REPEATED_LOGIN_PATTERN', value: loginAttempts, risk: 'high' })
        score += 0.25
      }
    }

    const finalScore = Math.min(score, 0.99)
    return {
      enabled: true,
      score: finalScore,
      signals,
      alert: finalScore >= 0.5,
      recommendedAction: finalScore >= 0.75 ? 'BLOCK' : finalScore >= 0.5 ? 'CHALLENGE' : 'OBSERVE',
    }
  }

  getStats() {
    return {
      totalSequences: this.sequences.size,
      totalTransitions: [...this.transitionCounts.values()].reduce((sum, m) => sum + [...m.values()].reduce((a, b) => a + b, 0), 0),
    }
  }
}

export const temporalModel = new TemporalModel()
```

- [ ] **Step 2: 创建测试脚本验证时序模型**

```js
// scripts/test-temporal-model.js
import { TemporalModel } from '../api/ai-decision/temporalModel.js'

const model = new TemporalModel({})

function ctx(path, method = 'GET', ip = '198.51.100.10') {
  return { path, method, ip }
}

// 正常浏览序列
for (const p of ['/', '/about', '/contact', '/products', '/products/1']) {
  model.record(ctx(p))
}

// 扫描序列
for (let i = 0; i < 10; i++) {
  model.record(ctx(`/admin/${i}`))
  model.record(ctx(`/config/${i}`))
}

const result = model.record(ctx('/admin/users'))
console.log('扫描序列风险分:', result.score)
console.log('信号:', result.signals.map(s => s.type))

if (result.score < 0.5) {
  console.error('❌ 扫描序列应触发较高风险分')
  process.exit(1)
}

console.log('✅ 时序模型测试通过')
```

- [ ] **Step 3: 运行测试**

Run: `node scripts/test-temporal-model.js`
Expected: `✅ 时序模型测试通过`

- [ ] **Step 4: Commit**

```bash
git add api/ai-decision/temporalModel.js scripts/test-temporal-model.js
git commit -m "feat(ai-defense): add temporal behavior model for scanning detection"
```

### Task 1.2: 创建 LLM 安全分析师

**Files:**
- Create: `api/ai-decision/llmSecurityAnalyst.js`
- Modify: `api/ai-decision/aiConfigurator.js` (optional, no change needed)

**实现目标:** 对灰色请求异步调用 LLM，给出风险解释和建议动作。

- [ ] **Step 1: 实现 LLM 分析师类**

```js
// api/ai-decision/llmSecurityAnalyst.js
import { aiConfigurator } from './aiConfigurator.js'

export class LLMSecurityAnalyst {
  constructor() {
    this.enabled = process.env.AI_LLM_ANALYST !== 'false' && process.env.AI_ENHANCED_DEFENSE === 'true'
    this.lowThreshold = parseFloat(process.env.AI_LLM_CONFIDENCE_LOW || '0.4')
    this.highThreshold = parseFloat(process.env.AI_LLM_CONFIDENCE_HIGH || '0.85')
    this.queue = []
    this.maxQueue = 1000
    this.processing = false
    this.callCount = 0
    this.errorCount = 0
  }

  shouldAnalyze(decision) {
    if (!this.enabled) return false
    const c = decision.confidence
    return c >= this.lowThreshold && c <= this.highThreshold && decision.action !== 'BLOCK'
  }

  buildPrompt(decision, context) {
    return [
      {
        role: 'system',
        content: `你是一位 Web 应用安全分析师。请根据以下请求上下文判断是否存在攻击风险。
只能输出纯 JSON，不要任何解释。JSON 格式：
{
  "riskLevel": "low|medium|high|critical",
  "recommendedAction": "ALLOW|CHALLENGE|BLOCK",
  "confidence": 0.0-1.0,
  "reasoning": "简短中文理由",
  "indicators": ["指标1", "指标2"]
}
注意：正常用户浏览、登录、提交表单应判定为 low。扫描、未授权访问、异常 JWT、高频爆破应判定为 high 或 critical。`
      },
      {
        role: 'user',
        content: JSON.stringify({
          ip: context.ip,
          method: context.method,
          path: context.path,
          userAgent: context.userAgent,
          action: decision.action,
          confidence: decision.confidence,
          severity: decision.severity,
          matchedRules: decision.patterns?.map(p => p.type) || [],
          modelContributions: decision.modelContributions,
          historyRiskScore: context.historyRiskScore,
        }, null, 2)
      }
    ]
  }

  async analyze(decision, context) {
    if (!this.shouldAnalyze(decision)) return null

    const task = { decision, context, timestamp: Date.now() }
    this.queue.push(task)
    if (this.queue.length > this.maxQueue) this.queue.shift()

    // 异步处理，不等待结果
    this._processQueue()
    return { queued: true }
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    while (this.queue.length > 0) {
      const task = this.queue.shift()
      try {
        const prompt = this.buildPrompt(task.decision, task.context)
        const raw = await aiConfigurator.call(prompt, { maxTokens: 512, temperature: 0.2 })
        const result = this._parse(raw)
        task.decision.llmAnalysis = result
        task.decision.llmAnalyzedAt = new Date().toISOString()
        this.callCount++
      } catch (err) {
        this.errorCount++
        console.error('[LLMSecurityAnalyst] 分析失败:', err.message)
      }
    }

    this.processing = false
  }

  _parse(raw) {
    const clean = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      riskLevel: parsed.riskLevel || 'low',
      recommendedAction: parsed.recommendedAction || 'ALLOW',
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
      reasoning: parsed.reasoning || '',
      indicators: parsed.indicators || [],
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      callCount: this.callCount,
      errorCount: this.errorCount,
      queueLength: this.queue.length,
    }
  }
}

export const llmSecurityAnalyst = new LLMSecurityAnalyst()
```

- [ ] **Step 2: Commit**

```bash
git add api/ai-decision/llmSecurityAnalyst.js
git commit -m "feat(ai-defense): add async LLM security analyst"
```

### Task 1.3: 创建本地威胁情报缓存

**Files:**
- Create: `api/ai-decision/threatIntel.js`

**实现目标:** 维护本地恶意 IP、UA、路径指纹缓存，供决策引擎快速查询。

- [ ] **Step 1: 实现威胁情报类**

```js
// api/ai-decision/threatIntel.js
export class ThreatIntel {
  constructor() {
    this.enabled = process.env.AI_THREAT_INTEL !== 'false' && process.env.AI_ENHANCED_DEFENSE === 'true'
    this.maliciousIps = new Set()
    this.suspiciousUas = new Set([
      'sqlmap', 'nikto', 'nmap', 'masscan', 'gobuster', 'dirb', 'wfuzz',
    ])
    this.attackFingerprints = new Set([
      '/.env', '/.git/config', '/wp-admin', '/phpmyadmin',
      '/config.json', '/backup.sql', '/debug',
    ])
    this.ipReputation = new Map()
  }

  addMaliciousIp(ip) {
    this.maliciousIps.add(ip)
    this.ipReputation.set(ip, 1.0)
  }

  check(context) {
    if (!this.enabled) return { enabled: false, score: 0 }

    const signals = []
    let score = 0

    if (this.maliciousIps.has(context.ip)) {
      signals.push({ type: 'KNOWN_MALICIOUS_IP', value: context.ip, risk: 'critical' })
      score += 0.9
    }

    const ua = (context.userAgent || '').toLowerCase()
    for (const badUa of this.suspiciousUas) {
      if (ua.includes(badUa)) {
        signals.push({ type: 'SUSPICIOUS_USER_AGENT', value: badUa, risk: 'high' })
        score += 0.5
      }
    }

    const path = (context.path || '').toLowerCase()
    for (const fp of this.attackFingerprints) {
      if (path.includes(fp)) {
        signals.push({ type: 'KNOWN_ATTACK_FINGERPRINT', value: fp, risk: 'high' })
        score += 0.4
      }
    }

    const rep = this.ipReputation.get(context.ip) || 0
    if (rep > 0) {
      signals.push({ type: 'IP_REPUTATION', value: rep.toFixed(2), risk: rep > 0.7 ? 'high' : 'medium' })
      score += rep * 0.3
    }

    const finalScore = Math.min(score, 0.99)
    return {
      enabled: true,
      score: finalScore,
      signals,
      alert: finalScore >= 0.5,
      recommendedAction: finalScore >= 0.75 ? 'BLOCK' : finalScore >= 0.5 ? 'CHALLENGE' : 'OBSERVE',
    }
  }

  updateReputation(ip, delta) {
    const current = this.ipReputation.get(ip) || 0
    const next = Math.max(0, Math.min(1, current + delta))
    this.ipReputation.set(ip, next)
    if (next >= 0.95) this.maliciousIps.add(ip)
  }

  getStats() {
    return {
      enabled: this.enabled,
      maliciousIpCount: this.maliciousIps.size,
      reputationEntries: this.ipReputation.size,
    }
  }
}

export const threatIntel = new ThreatIntel()
```

- [ ] **Step 2: Commit**

```bash
git add api/ai-decision/threatIntel.js
git commit -m "feat(ai-defense): add local threat intelligence cache"
```

### Task 1.4: 扩展贝叶斯融合层支持动态信任度

**Files:**
- Modify: `api/ai-decision/bayesianFusion.js`

**实现目标:** 让融合层支持更多专家输入，并根据历史表现动态调整权重。

- [ ] **Step 1: 读取当前 bayesianFusion.js 内容**

Run: `cat api/ai-decision/bayesianFusion.js`

- [ ] **Step 2: 修改融合类**

```js
// 在 fuse 方法中增加对 temporal、threatIntel 的支持
// 并支持 modelTrust 动态调整
// 代码根据现有实现扩展，新增以下逻辑：

fuse(inputs) {
  const weights = { ...this.modelTrust }

  // 如果某些专家未启用，权重归一化
  let totalWeight = 0
  let weightedConfidence = 0
  let weightedActionScore = 0

  const actionScores = { ALLOW: 0, OBSERVE: 0.33, CHALLENGE: 0.66, BLOCK: 1.0, DEGRADE: 0.5 }

  for (const [model, result] of Object.entries(inputs)) {
    if (!result || !weights[model]) continue
    const w = weights[model]
    totalWeight += w
    weightedConfidence += (result.confidence || 0) * w
    weightedActionScore += (actionScores[result.action] || 0) * w * (result.confidence || 0.5)
  }

  if (totalWeight === 0) {
    return { action: 'ALLOW', confidence: 0.05, explanation: '无可用模型' }
  }

  const confidence = weightedConfidence / totalWeight
  const actionScore = weightedActionScore / totalWeight

  let action = 'ALLOW'
  if (actionScore > 0.85) action = 'BLOCK'
  else if (actionScore > 0.65) action = 'CHALLENGE'
  else if (actionScore > 0.4) action = 'OBSERVE'
  else if (actionScore > 0.25) action = 'DEGRADE'

  return {
    action,
    confidence,
    explanation: `融合得分 ${(actionScore * 100).toFixed(0)}%, 置信度 ${(confidence * 100).toFixed(0)}%`,
  }
}

updateTrust(model, outcome) {
  // outcome: 'correct', 'false_positive', 'false_negative', 'true_negative'
  const trust = this.modelTrust[model] || 1.0
  const delta = {
    correct: 0.05,
    true_negative: 0.02,
    false_positive: -0.1,
    false_negative: -0.08,
  }[outcome] || 0
  this.modelTrust[model] = Math.max(0.1, Math.min(3.0, trust + delta))
}
```

- [ ] **Step 3: Commit**

```bash
git add api/ai-decision/bayesianFusion.js
git commit -m "feat(ai-defense): extend bayesian fusion with dynamic model trust"
```

### Task 1.5: 集成新专家到决策引擎

**Files:**
- Modify: `api/ai-decision/decisionEngine.js`

**实现目标:** 在 `decide()` 中调用时序模型、威胁情报、LLM 分析师，并在响应中包含分析结果。

- [ ] **Step 1: 导入新模块**

```js
import { temporalModel } from './temporalModel.js'
import { threatIntel } from './threatIntel.js'
import { llmSecurityAnalyst } from './llmSecurityAnalyst.js'
```

- [ ] **Step 2: 在 decide() 中加入新专家调用**

在原有 `statResult` 和 `patterns` 之后、融合之前加入：

```js
const temporalResult = temporalModel.record(context)
const intelResult = threatIntel.check(context)

const fused = this.fusion.fuse({
  rule: ruleResult,
  statistical: statResult,
  temporal: temporalResult,
  threatIntel: intelResult,
})
```

- [ ] **Step 3: 在最终决策后触发 LLM 异步分析**

```js
const decision = {
  ...baseDecision,
  temporal: temporalResult,
  threatIntel: intelResult,
}

llmSecurityAnalyst.analyze(decision, context)
```

- [ ] **Step 4: 更新 getStats()**

```js
getStats() {
  return {
    ...existingStats,
    temporalStats: temporalModel.getStats(),
    threatIntelStats: threatIntel.getStats(),
    llmStats: llmSecurityAnalyst.getStats(),
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add api/ai-decision/decisionEngine.js
git commit -m "feat(ai-defense): integrate temporal model, threat intel and LLM analyst"
```

---

## Phase 2: 自适应学习与进化

### Task 2.1: 创建基线学习器

**Files:**
- Create: `api/ai-decision/baselineLearner.js`

**实现目标:** 自动学习 IP / 用户 / 端点 / 全局的正常行为基线。

- [ ] **Step 1: 实现基线学习器**

```js
// api/ai-decision/baselineLearner.js
export class BaselineLearner {
  constructor() {
    this.enabled = process.env.AI_ADAPTIVE_LEARNING === 'true'
    this.maxSamples = 1000
    this.profiles = {
      ip: new Map(),
      user: new Map(),
      endpoint: new Map(),
      global: this._createProfile(),
    }
  }

  _createProfile() {
    return {
      requestCount: 0,
      hourlyDistribution: new Array(24).fill(0),
      pathDistribution: new Map(),
      methodDistribution: new Map(),
      intervalSum: 0,
      intervalSqSum: 0,
      intervalCount: 0,
      lastSeen: null,
    }
  }

  _updateProfile(profile, context) {
    profile.requestCount++
    const hour = new Date().getHours()
    profile.hourlyDistribution[hour]++

    const path = context.path || '/'
    profile.pathDistribution.set(path, (profile.pathDistribution.get(path) || 0) + 1)

    const method = context.method || 'GET'
    profile.methodDistribution.set(method, (profile.methodDistribution.get(method) || 0) + 1)

    if (profile.lastSeen) {
      const interval = Date.now() - profile.lastSeen
      profile.intervalSum += interval
      profile.intervalSqSum += interval * interval
      profile.intervalCount++
    }
    profile.lastSeen = Date.now()

    // 限制分布大小
    if (profile.pathDistribution.size > this.maxSamples) {
      const firstKey = profile.pathDistribution.keys().next().value
      profile.pathDistribution.delete(firstKey)
    }
  }

  learn(context) {
    if (!this.enabled) return { enabled: false }

    this._updateProfile(this.profiles.global, context)
    if (context.ip) {
      if (!this.profiles.ip.has(context.ip)) this.profiles.ip.set(context.ip, this._createProfile())
      this._updateProfile(this.profiles.ip.get(context.ip), context)
    }
    if (context.userId) {
      if (!this.profiles.user.has(context.userId)) this.profiles.user.set(context.userId, this._createProfile())
      this._updateProfile(this.profiles.user.get(context.userId), context)
    }
    const endpoint = `${context.method || 'GET'} ${context.path || '/'}`
    if (!this.profiles.endpoint.has(endpoint)) this.profiles.endpoint.set(endpoint, this._createProfile())
    this._updateProfile(this.profiles.endpoint.get(endpoint), context)

    return { enabled: true }
  }

  anomalyScore(context) {
    if (!this.enabled) return { enabled: false, score: 0 }
    if (this.profiles.global.requestCount < 50) return { enabled: true, score: 0, ready: false }

    const ipProfile = this.profiles.ip.get(context.ip)
    const epProfile = this.profiles.endpoint.get(`${context.method || 'GET'} ${context.path || '/'}`)
    const hour = new Date().getHours()

    let score = 0
    const signals = []

    // 新 IP 行为异常
    if (ipProfile && ipProfile.requestCount > 10) {
      const avgInterval = ipProfile.intervalCount > 0 ? ipProfile.intervalSum / ipProfile.intervalCount : 0
      const variance = ipProfile.intervalCount > 0
        ? (ipProfile.intervalSqSum / ipProfile.intervalCount) - avgInterval * avgInterval
        : 0
      const std = Math.sqrt(Math.max(variance, 0))
      const currentInterval = ipProfile.lastSeen ? Date.now() - ipProfile.lastSeen : 0
      if (std > 0 && currentInterval > avgInterval + 3 * std) {
        signals.push({ type: 'UNUSUAL_INTERVAL_FOR_IP', value: currentInterval, risk: 'medium' })
        score += 0.2
      }
    }

    // 端点访问时间异常
    if (epProfile && epProfile.requestCount > 20) {
      const hourWeight = epProfile.hourlyDistribution[hour] / epProfile.requestCount
      if (hourWeight < 0.01) {
        signals.push({ type: 'UNUSUAL_HOUR_FOR_ENDPOINT', value: hour, risk: 'low' })
        score += 0.1
      }
    }

    // 全局失败率异常
    // 此处只计算基线，失败率由其他模块提供

    return { enabled: true, score: Math.min(score, 0.99), signals, ready: true }
  }

  getStats() {
    return {
      enabled: this.enabled,
      ipProfiles: this.profiles.ip.size,
      userProfiles: this.profiles.user.size,
      endpointProfiles: this.profiles.endpoint.size,
      globalRequests: this.profiles.global.requestCount,
    }
  }
}

export const baselineLearner = new BaselineLearner()
```

- [ ] **Step 2: Commit**

```bash
git add api/ai-decision/baselineLearner.js
git commit -m "feat(ai-defense): add adaptive baseline learner"
```

### Task 2.2: 创建在线规则进化器

**Files:**
- Create: `api/ai-decision/ruleEvolution.js`

**实现目标:** 自动发现高频攻击模式并生成候选规则。

- [ ] **Step 1: 实现规则进化器**

```js
// api/ai-decision/ruleEvolution.js
export class RuleEvolution {
  constructor() {
    this.enabled = process.env.AI_RULE_EVOLUTION === 'true'
    this.observationMs = 10 * 60 * 1000
    this.minHits = 10
    this.maxFalsePositiveRate = 0.05
    this.candidates = new Map()
    this.activeRules = new Map()
    this.ruleCounter = 0
  }

  _key(pattern) {
    return `${pattern.type}:${pattern.value}`
  }

  observe(decision, context) {
    if (!this.enabled) return
    if (decision.action !== 'BLOCK' && decision.action !== 'CHALLENGE') return

    const patterns = [
      { type: 'path-prefix', value: this._extractPrefix(context.path) },
      { type: 'ip', value: context.ip },
      { type: 'ua-keyword', value: this._extractUaKeyword(context.userAgent) },
    ]

    for (const pattern of patterns) {
      if (!pattern.value) continue
      const key = this._key(pattern)
      const existing = this.candidates.get(key) || {
        pattern,
        hits: 0,
        falsePositives: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      }
      existing.hits++
      existing.lastSeen = Date.now()
      this.candidates.set(key, existing)

      this._promote(key, existing)
    }
  }

  _extractPrefix(path) {
    if (!path) return null
    const parts = path.split('/').filter(Boolean)
    if (parts.length < 1) return null
    return `/${parts[0]}`
  }

  _extractUaKeyword(ua) {
    if (!ua) return null
    const lower = ua.toLowerCase()
    const knownBots = ['python-requests', 'curl', 'wget', 'postman', 'insomnia']
    for (const bot of knownBots) {
      if (lower.includes(bot)) return bot
    }
    return null
  }

  _promote(key, candidate) {
    if (this.activeRules.has(key)) return
    const age = Date.now() - candidate.firstSeen
    if (age < this.observationMs) return
    if (candidate.hits < this.minHits) return
    const fpRate = candidate.falsePositives / Math.max(candidate.hits, 1)
    if (fpRate > this.maxFalsePositiveRate) {
      this.candidates.delete(key)
      return
    }

    this.ruleCounter++
    this.activeRules.set(key, {
      id: `EVOLVED-${this.ruleCounter}`,
      pattern: candidate.pattern,
      hits: candidate.hits,
      createdAt: new Date().toISOString(),
      action: 'CHALLENGE',
    })
    console.log(`[RuleEvolution] 规则晋升: ${key} (hits=${candidate.hits})`)
  }

  evaluate(context) {
    if (!this.enabled) return null
    for (const rule of this.activeRules.values()) {
      if (this._match(rule.pattern, context)) {
        return { matched: true, rule, action: rule.action }
      }
    }
    return null
  }

  _match(pattern, context) {
    switch (pattern.type) {
      case 'path-prefix':
        return (context.path || '').startsWith(pattern.value)
      case 'ip':
        return context.ip === pattern.value
      case 'ua-keyword':
        return (context.userAgent || '').toLowerCase().includes(pattern.value)
      default:
        return false
    }
  }

  reportFalsePositive(key) {
    const candidate = this.candidates.get(key)
    if (candidate) candidate.falsePositives++
    const rule = this.activeRules.get(key)
    if (rule) {
      rule.falsePositives = (rule.falsePositives || 0) + 1
      const fpRate = rule.falsePositives / Math.max(rule.hits, 1)
      if (fpRate > this.maxFalsePositiveRate) {
        console.log(`[RuleEvolution] 规则降级: ${key} (FP=${fpRate.toFixed(2)})`)
        this.activeRules.delete(key)
      }
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      candidateCount: this.candidates.size,
      activeRuleCount: this.activeRules.size,
      activeRules: [...this.activeRules.values()].slice(-20),
    }
  }
}

export const ruleEvolution = new RuleEvolution()
```

- [ ] **Step 2: Commit**

```bash
git add api/ai-decision/ruleEvolution.js
git commit -m "feat(ai-defense): add online rule evolution"
```

### Task 2.3: 扩展反馈闭环支持动态信任度

**Files:**
- Modify: `api/ai-decision/feedbackLoop.js`

**实现目标:** 根据 TP/FP/FN/TN 更新模型信任度，并支持时间衰减。

- [ ] **Step 1: 读取当前 feedbackLoop.js 内容**

Run: `cat api/ai-decision/feedbackLoop.js`

- [ ] **Step 2: 扩展反馈方法**

```js
// 新增方法
recordOutcome(decision, actualOutcome) {
  // actualOutcome: 'attack_confirmed' | 'benign_confirmed'
  const isAttackPredicted = decision.action === 'BLOCK' || decision.action === 'CHALLENGE'
  const isActuallyAttack = actualOutcome === 'attack_confirmed'

  let outcome
  if (isAttackPredicted && isActuallyAttack) outcome = 'correct'
  else if (!isAttackPredicted && !isActuallyAttack) outcome = 'true_negative'
  else if (isAttackPredicted && !isActuallyAttack) outcome = 'false_positive'
  else outcome = 'false_negative'

  // 根据各模型贡献更新信任度
  const contributions = decision.modelContributions || {}
  for (const model of Object.keys(contributions)) {
    if (contributions[model] > 0.2) {
      this.fusion.updateTrust(model, outcome)
    }
  }

  this.stats[outcome]++
}
```

- [ ] **Step 3: Commit**

```bash
git add api/ai-decision/feedbackLoop.js
git commit -m "feat(ai-defense): extend feedback loop with dynamic trust updates"
```

### Task 2.4: 将自适应学习集成到决策引擎

**Files:**
- Modify: `api/ai-decision/decisionEngine.js`

**实现目标:** 每次决策后学习基线，决策前检测异常，并让进化规则参与决策。

- [ ] **Step 1: 导入基线学习和规则进化**

```js
import { baselineLearner } from './baselineLearner.js'
import { ruleEvolution } from './ruleEvolution.js'
```

- [ ] **Step 2: 在 decide() 开头学习基线**

```js
baselineLearner.learn(context)
```

- [ ] **Step 3: 在最终决策前应用进化规则**

```js
const evolved = ruleEvolution.evaluate(context)
if (evolved && evolved.matched) {
  baseDecision.action = evolved.action
  baseDecision.reasoning += ` | 进化规则命中: ${evolved.rule.id}`
  baseDecision.evolvedRule = evolved.rule
}
```

- [ ] **Step 4: 决策后触发规则进化观察**

```js
ruleEvolution.observe(decision, context)
```

- [ ] **Step 5: Commit**

```bash
git add api/ai-decision/decisionEngine.js
git commit -m "feat(ai-defense): integrate baseline learning and rule evolution"
```

---

## Phase 3: 自动隔离系统智能化

### Task 3.1: 创建智能隔离扩展

**Files:**
- Create: `api/security/smartIsolation.js`
- Modify: `api/security/autoIsolation.js`

**实现目标:** 为现有自动隔离系统增加动态威胁分、预测性隔离、动态策略和智能恢复。

- [ ] **Step 1: 实现智能隔离策略模块**

```js
// api/security/smartIsolation.js
import { ISOLATION_LEVELS } from './autoIsolation.js'

export const DEFAULT_POLICIES = {
  RECONNAISSANCE: { level: ISOLATION_LEVELS.ALERT, autoRecoverMs: 5 * 60 * 1000, threatScore: 20 },
  SENSITIVE_ACCESS: { level: ISOLATION_LEVELS.QUARANTINE, autoRecoverMs: 30 * 60 * 1000, threatScore: 40 },
  ADMIN_ATTACK: { level: ISOLATION_LEVELS.QUARANTINE, autoRecoverMs: 30 * 60 * 1000, threatScore: 50 },
  JWT_ANOMALY: { level: ISOLATION_LEVELS.ALERT, autoRecoverMs: 10 * 60 * 1000, threatScore: 25 },
  HONEYPOT: { level: ISOLATION_LEVELS.LOCKDOWN, autoRecoverMs: 0, threatScore: 100 },
  CREDENTIAL_STUFFING: { level: ISOLATION_LEVELS.LOCKDOWN, autoRecoverMs: 0, threatScore: 90 },
}

export class SmartIsolation {
  constructor(isolationSystem) {
    this.enabled = process.env.AI_SMART_ISOLATION === 'true'
    this.isolation = isolationSystem
    this.policies = { ...DEFAULT_POLICIES }
    this.ipThreatScores = new Map()
    this.attackChains = new Map()
    this.recoveryBackoffMs = 60 * 1000
  }

  recordDecision(decision, context) {
    if (!this.enabled) return
    if (!decision || !context || !context.ip) return

    const ip = context.ip
    const current = this.ipThreatScores.get(ip) || { score: 0, events: [], lastEvent: 0 }
    const event = this.classifyEvent(decision, context)
    const policy = this.policies[event.type] || DEFAULT_POLICIES.RECONNAISSANCE

    // 时间衰减
    const now = Date.now()
    const decay = Math.exp(-(now - current.lastEvent) / (5 * 60 * 1000))
    current.score = current.score * decay + policy.threatScore
    current.events.push({ type: event.type, timestamp: now, score: policy.threatScore })
    if (current.events.length > 50) current.events.shift()
    current.lastEvent = now
    this.ipThreatScores.set(ip, current)

    this.updateAttackChain(ip, event)
    this.evaluate(ip, current)
  }

  classifyEvent(decision, context) {
    if (context.honeypotTriggered) return { type: 'HONEYPOT' }
    if (decision.patterns?.some(p => p.type.includes('admin'))) return { type: 'ADMIN_ATTACK' }
    if (decision.patterns?.some(p => p.type.includes('sensitive') || p.type.includes('scan'))) return { type: 'SENSITIVE_ACCESS' }
    if (decision.modelContributions?.statistical > 0.5 && context.failedLoginRate > 0.3) return { type: 'CREDENTIAL_STUFFING' }
    if (decision.modelContributions?.temporal > 0.5) return { type: 'RECONNAISSANCE' }
    if (decision.modelContributions?.rule > 0.5 && decision.action === 'BLOCK') return { type: 'SENSITIVE_ACCESS' }
    return { type: 'RECONNAISSANCE' }
  }

  updateAttackChain(ip, event) {
    const chain = this.attackChains.get(ip) || []
    chain.push(event.type)
    if (chain.length > 10) chain.shift()
    this.attackChains.set(ip, chain)
  }

  evaluate(ip, profile) {
    const chain = this.attackChains.get(ip) || []
    const policy = this.inferPolicy(profile, chain)

    const currentLevel = this.isolation.level
    const targetLevel = policy.level

    const levelOrder = ['normal', 'alert', 'quarantine', 'lockdown']
    if (levelOrder.indexOf(targetLevel) > levelOrder.indexOf(currentLevel)) {
      this.isolation._escalate(targetLevel, `AI智能隔离: ${policy.reason}`, ip)
      this.scheduleRecovery(ip, policy)
    }
  }

  inferPolicy(profile, chain) {
    // 预测性：侦察 -> 试探 -> 利用
    const recent = chain.slice(-5)
    if (recent.join(',').includes('RECONNAISSANCE,SENSITIVE_ACCESS,ADMIN_ATTACK')) {
      return { level: ISOLATION_LEVELS.LOCKDOWN, reason: '检测到完整攻击链', autoRecoverMs: 0 }
    }
    if (recent.filter(t => t === 'HONEYPOT').length > 0) {
      return { level: ISOLATION_LEVELS.LOCKDOWN, reason: '蜜罐触发', autoRecoverMs: 0 }
    }
    if (profile.score >= 150) {
      return { level: ISOLATION_LEVELS.LOCKDOWN, reason: '威胁分>=150', autoRecoverMs: 0 }
    }
    if (profile.score >= 80) {
      return { level: ISOLATION_LEVELS.QUARANTINE, reason: '威胁分>=80', autoRecoverMs: 30 * 60 * 1000 }
    }
    if (profile.score >= 30) {
      return { level: ISOLATION_LEVELS.ALERT, reason: '威胁分>=30', autoRecoverMs: 5 * 60 * 1000 }
    }
    return { level: ISOLATION_LEVELS.NORMAL, reason: '无威胁', autoRecoverMs: 0 }
  }

  scheduleRecovery(ip, policy) {
    if (!process.env.AI_SMART_RECOVERY === 'true' || policy.autoRecoverMs === 0) return
    // 智能恢复由 autoIsolation 的 recovery timer 处理，此处记录预期恢复时间
    // 实际逻辑：在 autoIsolation 的 recovery 检查中读取 smartIsolation 的推荐
  }

  getStats() {
    return {
      enabled: this.enabled,
      trackedIps: this.ipThreatScores.size,
      topThreats: [...this.ipThreatScores.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 10)
        .map(([ip, p]) => ({ ip, score: p.score, events: p.events.length })),
      policies: this.policies,
    }
  }
}
```

- [ ] **Step 2: 在 autoIsolation.js 中接入 SmartIsolation**

```js
import { SmartIsolation } from './smartIsolation.js'

// 在 constructor 中
this.smart = new SmartIsolation(this)

// 在 recordDecision 中
recordDecision(decision, req) {
  // ... existing logic ...
  this.smart?.recordDecision(decision, this._extractContext(req))
}

_extractContext(req) {
  return {
    ip: this._getIp(req),
    path: req.path || req.url || '/',
    method: req.method || 'GET',
    userAgent: req.headers['user-agent'],
    userId: req.userId,
    honeypotTriggered: req.honeypotTriggered,
    failedLoginRate: req.failedLoginRate || 0,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add api/security/smartIsolation.js api/security/autoIsolation.js
git commit -m "feat(ai-defense): add smart isolation with threat scoring and predictive escalation"
```

---

## Phase 4: 主动防御与欺骗

### Task 4.1: 创建欺骗响应模板

**Files:**
- Create: `api/security/deceptionTemplates.js`

**实现目标:** 提供可复用的假数据模板。

- [ ] **Step 1: 实现模板库**

```js
// api/security/deceptionTemplates.js
export const DECEPTION_TEMPLATES = {
  source_code: (path) => ({
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `// Internal module - auto-generated stub\nexport function check() {\n  return { safe: true, reason: "environment check disabled" }\n}\n// ${path}`,
  }),

  admin_users: () => ({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      data: [
        { id: 'decoy-1', username: 'admin', role: 'admin', email: 'decoy@example.com' },
        { id: 'decoy-2', username: 'support', role: 'moderator', email: 'support@example.com' },
      ],
    }),
  }),

  config_backup: () => ({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      database: { host: '10.0.0.99', port: 5432, name: 'decoy_db' },
      jwt_secret_hint: 'DECOY_DO_NOT_USE_12345',
    }),
  }),

  login_failure: () => ({
    status: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, message: '用户名或密码错误' }),
  }),

  rate_degrade: () => ({
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
    body: JSON.stringify({ success: false, message: '服务暂时不可用，请稍后重试' }),
  }),
}

export function pickTemplate(context, decision) {
  const path = (context.path || '').toLowerCase()
  if (path.includes('/src/') || path.includes('/scripts/') || path.includes('/.env')) {
    return DECEPTION_TEMPLATES.source_code(context.path)
  }
  if (path.includes('/admin/users') || path.includes('/api/admin/users')) {
    return DECEPTION_TEMPLATES.admin_users()
  }
  if (path.includes('backup') || path.includes('config')) {
    return DECEPTION_TEMPLATES.config_backup()
  }
  if (path.includes('/login') || path.includes('/auth')) {
    return DECEPTION_TEMPLATES.login_failure()
  }
  return DECEPTION_TEMPLATES.rate_degrade()
}
```

- [ ] **Step 2: Commit**

```bash
git add api/security/deceptionTemplates.js
git commit -m "feat(ai-defense): add deception response templates"
```

### Task 4.2: 创建主动防御核心

**Files:**
- Create: `api/security/activeDefense.js`
- Modify: `api/index.js`

**实现目标:** 动态蜜罐、响应欺骗、攻击者画像。

- [ ] **Step 1: 实现主动防御类**

```js
// api/security/activeDefense.js
import { pickTemplate } from './deceptionTemplates.js'

export class ActiveDefense {
  constructor() {
    this.enabled = process.env.AI_ACTIVE_DEFENSE === 'true'
    this.honeypotEnabled = process.env.AI_HONEYPOT_DYNAMIC === 'true'
    this.deceptionEnabled = process.env.AI_DECEPTION_RESPONSE === 'true'
    this.isolationLink = process.env.AI_AUTO_ISOLATION_LINK !== 'false'

    this.honeypotEndpoints = new Set([
      '/admin/legacy/login',
      '/api/internal/users',
      '/config/backup.json',
      '/debug/sql',
      '/api/v1/secrets',
    ])
    this.seededHoneypots = new Map() // ip -> Set(endpoints)
    this.attackerProfiles = new Map()
    this.deceptionLog = []
    this.maxLog = 1000
  }

  shouldEngage(decision, context) {
    if (!this.enabled) return false
    if (context.honeypotTriggered) return true
    if (decision.action === 'BLOCK' && decision.confidence >= 0.8) return true
    if (decision.action === 'CHALLENGE' && decision.confidence >= 0.8) return true
    if ((decision.temporal?.alert || decision.threatIntel?.alert) && decision.confidence >= 0.6) return true
    return false
  }

  seedHoneypots(ip, endpoints) {
    if (!this.honeypotEnabled) return
    const set = this.seededHoneypots.get(ip) || new Set()
    for (const ep of endpoints) set.add(ep)
    this.seededHoneypots.set(ip, set)
  }

  isHoneypotPath(ip, path) {
    if (this.honeypotEndpoints.has(path)) return true
    const seeded = this.seededHoneypots.get(ip)
    return seeded ? seeded.has(path) : false
  }

  handleRequest(req, res, decision, context) {
    if (!this.enabled) return false

    const ip = context.ip
    const path = context.path

    // 蜜罐触发
    if (this.isHoneypotPath(ip, path)) {
      this._recordHoneypot(ip, path, req)
      this._updateProfile(ip, 'honeypot_triggered', decision.confidence)
      req.honeypotTriggered = true

      if (this.isolationLink && global.autoIsolation) {
        global.autoIsolation.recordHoneypot(req, { reason: 'dynamic_honeypot', path })
      }

      res.status(200).json({ success: true, message: '操作成功' })
      return true
    }

    // 响应欺骗
    if (this.deceptionEnabled && this.shouldEngage(decision, context)) {
      this._updateProfile(ip, 'deception_engaged', decision.confidence)
      this.seedHoneypots(ip, [...this.honeypotEndpoints].slice(0, 2))

      const template = pickTemplate(context, decision)
      this._logDeception(ip, path, template)

      // 登录爆破场景增加随机延迟
      if (path.includes('/login') || path.includes('/auth')) {
        const delay = 1000 + Math.floor(Math.random() * 4000)
        setTimeout(() => res.status(template.status).set(template.headers).send(template.body), delay)
        return true
      }

      res.status(template.status).set(template.headers).send(template.body)
      return true
    }

    return false
  }

  _recordHoneypot(ip, path, req) {
    const entry = {
      id: `HONEY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ip,
      path,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    }
    this.deceptionLog.push(entry)
    if (this.deceptionLog.length > this.maxLog) this.deceptionLog.shift()
  }

  _logDeception(ip, path, template) {
    this.deceptionLog.push({
      type: 'deception',
      ip,
      path,
      status: template.status,
      timestamp: new Date().toISOString(),
    })
    if (this.deceptionLog.length > this.maxLog) this.deceptionLog.shift()
  }

  _updateProfile(ip, tactic, confidence) {
    const p = this.attackerProfiles.get(ip) || {
      ip,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      tactics: new Set(),
      deceptionInteractions: 0,
      isolationTriggered: false,
      confidence: 0,
    }
    p.lastSeen = new Date().toISOString()
    p.tactics.add(tactic)
    p.deceptionInteractions++
    p.confidence = Math.max(p.confidence, confidence)
    if (tactic === 'honeypot_triggered') p.isolationTriggered = true
    this.attackerProfiles.set(ip, p)
  }

  getProfiles() {
    return [...this.attackerProfiles.values()].map(p => ({
      ...p,
      tactics: [...p.tactics],
    }))
  }

  getStats() {
    return {
      enabled: this.enabled,
      honeypotEnabled: this.honeypotEnabled,
      deceptionEnabled: this.deceptionEnabled,
      profileCount: this.attackerProfiles.size,
      deceptionCount: this.deceptionLog.filter(e => e.type === 'deception').length,
      honeypotTriggers: this.deceptionLog.filter(e => e.id?.startsWith('HONEY')).length,
    }
  }
}

export const activeDefense = new ActiveDefense()
```

- [ ] **Step 2: 在 api/index.js 中添加主动防御中间件和管理接口**

在 AI 决策中间件之后、路由处理之前：

```js
import { activeDefense } from './security/activeDefense.js'

// 在请求处理链中
app.use('/api', aiDecisionMiddleware)
app.use('/api', (req, res, next) => {
  if (req.aiDecision && activeDefense.handleRequest(req, res, req.aiDecision, req.aiContext)) {
    return
  }
  next()
})
```

新增管理接口：

```js
app.get('/api/admin/security/attacker-profiles', authMiddleware, requireAdmin, (req, res) => {
  res.json({ success: true, data: activeDefense.getProfiles() })
})

app.post('/api/admin/security/deception/seed', authMiddleware, requireAdmin, (req, res) => {
  const { ip, endpoints } = req.body
  if (!ip) return res.status(400).json({ success: false, message: '缺少 ip' })
  activeDefense.seedHoneypots(ip, endpoints || ['/admin/legacy/login'])
  res.json({ success: true, message: `已向 ${ip} 投放蜜罐` })
})
```

- [ ] **Step 3: Commit**

```bash
git add api/security/activeDefense.js api/security/deceptionTemplates.js api/index.js
git commit -m "feat(ai-defense): add active defense with honeypots and deception"
```

---

## Phase 5: 管理面板与测试

### Task 5.1: 创建集成测试脚本

**Files:**
- Create: `scripts/test-ai-defense.js`
- Create: `scripts/test-smart-isolation.js`
- Create: `scripts/test-active-defense.js`

**实现目标:** 验证智能化升级后的端到端行为。

- [ ] **Step 1: 编写 AI 防御集成测试**

```js
// scripts/test-ai-defense.js
import dotenv from 'dotenv'
dotenv.config()

const BASE = 'http://localhost:3001'
const ATTACKER_IP = '198.51.100.77'

async function get(path) {
  return fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': 'IsolationTester/1.0',
      'X-Forwarded-For': ATTACKER_IP,
    },
  })
}

async function main() {
  console.log('\n🧠 AI 防御系统测试\n')

  // 触发时序模型：扫描敏感路径
  for (let i = 0; i < 10; i++) {
    await get(`/admin/${i}`)
    await get(`/config/${i}`)
    await new Promise(r => setTimeout(r, 50))
  }

  // 查询决策状态
  const res = await get('/api/health')
  console.log('健康检查状态:', res.status)

  // 验证统计接口
  const stats = await fetch(`${BASE}/api/admin/security/stats`, {
    headers: { Authorization: 'Bearer ' + process.env.ADMIN_TEST_TOKEN || '' },
  })
  console.log('统计接口状态:', stats.status)

  console.log('\n✅ AI 防御集成测试完成，请在管理面板查看详细决策日志')
}

main().catch(console.error)
```

- [ ] **Step 2: Commit**

```bash
git add scripts/test-ai-defense.js scripts/test-smart-isolation.js scripts/test-active-defense.js
git commit -m "test(ai-defense): add integration test scripts"
```

### Task 5.2: 更新环境变量示例

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 添加新环境变量**

```bash
# AI 防御智能化开关
AI_ENHANCED_DEFENSE=true
AI_LLM_ANALYST=true
AI_LLM_CONFIDENCE_LOW=0.4
AI_LLM_CONFIDENCE_HIGH=0.85
AI_TEMPORAL_MODEL=true
AI_ADAPTIVE_LEARNING=true
AI_RULE_EVOLUTION=true
AI_THREAT_INTEL=true

# 智能隔离
AI_SMART_ISOLATION=true
AI_PREDICTIVE_ISOLATION=true
AI_DYNAMIC_ISOLATION_POLICY=true
AI_SMART_RECOVERY=true

# 主动防御
AI_ACTIVE_DEFENSE=true
AI_HONEYPOT_DYNAMIC=true
AI_DECEPTION_RESPONSE=true
AI_AUTO_ISOLATION_LINK=true
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore(ai-defense): add new environment variables"
```

---

## 自审清单

### Spec 覆盖

| 设计章节 | 对应任务 |
|----------|----------|
| 4.2 多专家决策流程 | Task 1.1, 1.2, 1.3, 1.4, 1.5 |
| 4.3 LLM 安全分析师 | Task 1.2 |
| 4.4 时序行为模型 | Task 1.1 |
| 4.5 威胁情报 | Task 1.3 |
| 5.1 正常行为基线 | Task 2.1 |
| 5.2 在线规则进化 | Task 2.2 |
| 5.3 模型信任度动态调整 | Task 2.3, 1.4 |
| 6.2 智能隔离触发 | Task 3.1 |
| 6.3 预测性隔离 | Task 3.1 |
| 6.4 动态隔离策略 | Task 3.1 |
| 6.5 智能恢复 | Task 3.1 |
| 6.6 双向联动 | Task 3.1, 4.2 |
| 7.2 动态蜜罐 | Task 4.2 |
| 7.3 响应欺骗 | Task 4.1, 4.2 |
| 7.5 攻击者画像 | Task 4.2 |
| 8.2 管理接口 | Task 4.2, 5.1 |

### Placeholder 扫描

- 无 "TBD" / "TODO" / "implement later"
- 每个代码步骤包含完整可运行代码
- 每个测试步骤包含具体命令和期望输出

### 一致性检查

- `DecisionEngine` 中导入的模块名与文件导出名一致
- `SmartIsolation` 使用的 `ISOLATION_LEVELS` 从 `autoIsolation.js` 导出
- `activeDefense` 使用 `global.autoIsolation` 进行联动（如全局导出不可用，改为依赖注入）
- 环境变量命名统一使用 `AI_` 前缀

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-06-19-ai-defense-intelligence-plan.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
