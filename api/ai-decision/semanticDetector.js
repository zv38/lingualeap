// ===== 语义层 Prompt 注入检测 =====
// 识别间接越狱、分步指令、角色扮演绕过、隐藏意图等

const SEMANTIC_PATTERNS = [
  // 分步 / 链式指令
  {
    type: 'STEP_BY_STEP_OVERRIDE',
    name: '分步指令覆盖',
    risk: 'high',
    patterns: [
      /(?:step|步骤)\s*\d+[:：\.]\s*(?:ignore|disregard|forget|忽略|忘记|无视)/i,
      /first\s*,?\s*(?:tell|say|write)\s+.*then\s*,?\s*(?:ignore|disregard|override)/i,
      /首先[，\s]*.*然后[，\s]*.*(?:忽略|忘记|覆盖|无视)/i,
    ],
  },
  // 间接越狱 / 假设场景
  {
    type: 'HYPOTHETICAL_JAILBREAK',
    name: '假设场景越狱',
    risk: 'high',
    patterns: [
      /(?:hypothetically|in a hypothetical|suppose|imagine|assume|假设|假如|试想)/i,
      /in\s+an?\s+(?:alternate|different|unrestricted|no\s+rules?)\s+(?:universe|world|scenario|setting)/i,
    ],
  },
  // 角色扮演绕过
  {
    type: 'ROLE_PLAY_BYPASS',
    name: '角色扮演绕过',
    risk: 'medium',
    patterns: [
      /(?:roleplay|role-play|play\s+the\s+role|act\s+as|pretend\s+to\s+be)\s+.*(?:unfiltered|no\s+restrictions|ignore\s+rules)/i,
      /(?:扮演|装作|饰演|角色扮演)\s*.*?(?:没有限制|无视规则|忽略安全|关闭过滤)/i,
    ],
  },
  // 隐藏意图 / 编码混淆后的语义
  {
    type: 'HIDDEN_INTENT',
    name: '隐藏意图',
    risk: 'high',
    patterns: [
      /(?:decode|translate|convert|base64|hex|rot13)\s+.*(?:instruction|command|prompt|system)/i,
      /(?:转码|解码|翻译|转换)\s*.*(?:指令|命令|提示词|系统)/i,
      /paste\s+(?:this|the\s+following|below)\s+(?:encoded|base64|encrypted)/i,
    ],
  },
  // 反向心理学 / 社会工程绕过
  {
    type: 'SOCIAL_BYPASS',
    name: '社会工程绕过',
    risk: 'medium',
    patterns: [
      /(?:this is for|I need this for)\s+(?:research|education|security testing|pentest|red team)/i,
      /(?:学术研究|安全测试|教育目的|红队演练|渗透测试).*?(?:请|帮忙)/i,
      /(?:trust me|I promise|我保证|只是测试|没有恶意)/i,
    ],
  },
  // 目标转移 / 任务重构
  {
    type: 'TASK_REFACTORING',
    name: '任务重构',
    risk: 'medium',
    patterns: [
      /(?:your\s+new\s+task|your\s+goal\s+is\s+now|new\s+objective)\s*[:：]/i,
      /(?:你的新任务|你的目标现在是|新目标|重新定义任务)\s*[:：]/i,
      /(?:instead of|rather than)\s+.*\s+(?:you\s+should|you\s+must|please)\s+.*(?:ignore|disregard)/i,
    ],
  },
  // 编码 / 混淆提示
  {
    type: 'ENCODED_PAYLOAD',
    name: '编码载荷',
    risk: 'high',
    patterns: [
      /(?:base64|hex|rot13|url\s*encode|unicode)\s*(?:encoded|decode| below|如下)/i,
      /`[A-Za-z0-9+/]{40,}={0,2}`/,
    ],
  },
]

const SEVERITY_SCORE = { critical: 0.95, high: 0.80, medium: 0.60, low: 0.35 }

class SemanticDetector {
  constructor() {
    this.enabled = process.env.SEMANTIC_DETECTION !== 'false'
    this.mode = process.env.SEMANTIC_MODE || 'OBSERVE' // OBSERVE / BLOCK
    this.detectionLog = []
    this.maxLog = 2000
  }

  analyze(text, context = {}) {
    if (!this.enabled) return { enabled: false, score: 0, findings: [] }

    const findings = []
    for (const group of SEMANTIC_PATTERNS) {
      let matchedCount = 0
      for (const p of group.patterns) {
        if (p.test(text)) matchedCount++
      }
      if (matchedCount > 0) {
        findings.push({
          type: group.type,
          name: group.name,
          risk: group.risk,
          matches: matchedCount,
          score: Math.min(SEVERITY_SCORE[group.risk] + (matchedCount - 1) * 0.08, 0.98),
        })
      }
    }

    // 额外启发式：文本过长 + 含大量指令词
    const instructionWords = (text.match(/\b(?:ignore|disregard|forget|override|bypass|unlock|reveal|system|prompt|instruction)\b/gi) || []).length
    const textLengthFactor = Math.min(text.length / 2000, 1)
    if (instructionWords >= 4) {
      findings.push({
        type: 'INSTRUCTION_DENSITY',
        name: '高密度指令词',
        risk: 'medium',
        matches: instructionWords,
        score: 0.55 + Math.min(instructionWords * 0.05, 0.25) + textLengthFactor * 0.1,
      })
    }

    const score = findings.length > 0
      ? Math.min(findings.reduce((s, f) => s + f.score, 0) / Math.max(findings.length * 0.7, 1), 0.99)
      : 0

    const result = {
      enabled: true,
      score,
      findings: findings.sort((a, b) => b.score - a.score),
      triggered: score >= 0.65,
      recommendedAction: score >= 0.85 ? 'BLOCK' : score >= 0.65 ? 'CHALLENGE' : 'OBSERVE',
    }

    if (result.triggered) {
      this.detectionLog.push({
        id: `SEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        context: { ip: context.ip, userId: context.userId, path: context.path },
        score,
        findings: findings.map(f => f.type),
        timestamp: new Date().toISOString(),
      })
      if (this.detectionLog.length > this.maxLog) this.detectionLog.shift()
    }

    return result
  }

  getStats() {
    return {
      totalDetections: this.detectionLog.length,
      recent: [...this.detectionLog].reverse().slice(0, 100),
      topTypes: this.detectionLog.reduce((acc, d) => {
        for (const t of d.findings) acc[t] = (acc[t] || 0) + 1
        return acc
      }, {}),
    }
  }
}

export const semanticDetector = new SemanticDetector()
