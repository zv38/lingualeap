// ===== AI 配置器 — 多 Provider 支持 =====
// 支持智谱AI（主模型）和 GitHub Models（备选/免费模型）
// 自动切换：主模型限流/失败时自动 fallback 到备选模型

const PROVIDERS = {
  ZHIPUAI: {
    name: 'zhipuai',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4.7-flash',
    getApiKey: () => process.env.ZHIPUAI_API_KEY,
    checkConfig: () => process.env.ZHIPUAI_API_KEY && process.env.ZHIPUAI_API_KEY !== 'your-zhipuai-api-key-here' && process.env.ZHIPUAI_API_KEY !== '你的智谱AI API密钥',
  },
  GITHUB: {
    name: 'github',
    apiUrl: 'https://models.github.ai/inference/v1/chat/completions',
    model: () => 'openai/' + (process.env.GITHUB_MODELS_MODEL || 'gpt-4o-mini'),
    getApiKey: () => process.env.GITHUB_TOKEN,
    checkConfig: () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;
  return token.startsWith('ghp_') || token.startsWith('github_pat_');
},
  },
}

const MAX_RETRIES = 2
const TIMEOUT = 15000
const RATE_LIMIT_CODES = [429, 503]

class AIConfigurator {
  constructor() {
    this._fallbackChain = ['zhipuai', 'github']
    this._currentProvider = null
    this._rateLimitedUntil = {} // provider -> timestamp
    this._stats = { calls: 0, errors: 0, fallbacks: 0, byProvider: {} }
  }

  /**
   * 获取当前可用的 Provider 列表（按优先级排序）
   * @returns {Array<{name: string, config: object}>}
   */
  getAvailableProviders() {
    const priority = process.env.AI_MODEL_PRIORITY || 'primary'
    const providers = []

    if (priority === 'github-only') {
      // 仅使用 GitHub Models
      if (PROVIDERS.GITHUB.checkConfig()) {
        providers.push({ name: 'github', config: PROVIDERS.GITHUB })
      }
    } else {
      // primary / fallback 模式
      if (PROVIDERS.ZHIPUAI.checkConfig()) {
        providers.push({ name: 'zhipuai', config: PROVIDERS.ZHIPUAI })
      }
      if (PROVIDERS.GITHUB.checkConfig()) {
        providers.push({ name: 'github', config: PROVIDERS.GITHUB })
      }
    }

    return providers
  }

  /**
   * 检查 Provider 是否处于限流冷却期
   */
  isRateLimited(providerName) {
    const until = this._rateLimitedUntil[providerName]
    if (!until) return false
    if (Date.now() > until) {
      delete this._rateLimitedUntil[providerName]
      return false
    }
    return true
  }

  /**
   * 标记 Provider 为限流状态
   */
  markRateLimited(providerName, durationMs = 60000) {
    this._rateLimitedUntil[providerName] = Date.now() + durationMs
    console.warn(`[AIConfigurator] ${providerName} 被限流，冷却 ${durationMs / 1000}s`)
  }

  /**
   * 调用 AI 模型，自动切换 Provider
   * @param {Array} messages - 消息数组
   * @param {object} options - 选项 { model, temperature, maxTokens, provider }
   * @returns {Promise<string>} 模型返回的文本
   */
  async call(messages, options = {}) {
    const providers = this.getAvailableProviders()
    if (providers.length === 0) {
      throw new Error('未配置任何可用的 AI Provider（请配置 ZHIPUAI_API_KEY 或 GITHUB_TOKEN）')
    }

    // 如果指定了 provider，优先使用
    const preferredProvider = options.provider
    const sortedProviders = preferredProvider
      ? [...providers.filter(p => p.name === preferredProvider), ...providers.filter(p => p.name !== preferredProvider)]
      : providers

    let lastError = null

    for (const { name, config } of sortedProviders) {
      // 跳过限流冷却中的 Provider
      if (this.isRateLimited(name)) {
        console.log(`[AIConfigurator] ${name} 处于限流冷却期，跳过`)
        continue
      }

      try {
        const result = await this._callProvider(config, messages, options)
        this._currentProvider = name
        this._stats.calls++
        this._stats.byProvider[name] = (this._stats.byProvider[name] || 0) + 1
        return result
      } catch (err) {
        lastError = err
        this._stats.errors++

        // 限流错误 → 标记冷却并尝试下一个 Provider
        if (RATE_LIMIT_CODES.includes(err.statusCode || err.code) || err.message?.includes('429') || err.message?.includes('rate')) {
          const coolDown = name === 'zhipuai' ? 120000 : 60000
          this.markRateLimited(name, coolDown)
          this._stats.fallbacks++
          console.warn(`[AIConfigurator] ${name} 限流，切换到下一个 Provider`)
          continue
        }

        // 非限流错误，如果还有其它 Provider 则尝试
        if (sortedProviders.length > 1) {
          this._stats.fallbacks++
          console.warn(`[AIConfigurator] ${name} 错误: ${err.message}，切换到下一个 Provider`)
          continue
        }
      }
    }

    throw lastError || new Error('所有 AI Provider 均不可用')
  }

  /**
   * 调用指定 Provider 的 API
   */
  async _callProvider(config, messages, options = {}) {
    const apiKey = config.getApiKey()
    if (!apiKey) {
      throw new Error(`${config.name} API 密钥未配置`)
    }

    const model = typeof config.model === 'function' ? config.model() : config.model
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT)

    let lastError
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: options.model || model,
            messages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 1024,
            stream: false,
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          const err = new Error(`API ${response.status}: ${text}`)
          err.statusCode = response.status
          err.code = response.status
          throw err
        }

        const data = await response.json()
        return data.choices?.[0]?.message?.content || ''
      } catch (err) {
        lastError = err
        // 限流错误直接向上抛，让外层处理 fallback
        if (RATE_LIMIT_CODES.includes(err.statusCode || err.code) || err.message?.includes('429')) {
          throw err
        }
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      } finally {
        clearTimeout(timer)
      }
    }

    throw lastError
  }

  /**
   * 获取当前使用的 Provider 名称
   */
  getCurrentProvider() {
    return this._currentProvider
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this._stats,
      currentProvider: this._currentProvider,
      rateLimited: Object.keys(this._rateLimitedUntil).filter(k => this.isRateLimited(k)),
      availableProviders: this.getAvailableProviders().map(p => p.name),
    }
  }

  /**
   * 重置限流状态
   */
  resetRateLimit(providerName) {
    if (providerName) {
      delete this._rateLimitedUntil[providerName]
    } else {
      this._rateLimitedUntil = {}
    }
  }
}

export const aiConfigurator = new AIConfigurator()