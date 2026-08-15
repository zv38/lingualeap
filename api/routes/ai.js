// ===== AI 路由模块 =====
// 从 api/index.js 中提取的 AI 对话与安全分析相关路由，使用工厂函数模式以共享依赖。

import { Router } from 'express';
import {
  validate,
  aiChatSchema,
  requireAdminReauth,
  PromptGuard,
  ipReputation,
  adaptiveDefense,
  getResponseStats,
} from '../security/index.js';
import { decisionEngine } from '../ai-decision/decisionEngine.js';
import { patternDetector } from '../ai-decision/patternDetector.js';
import { thresholdOptimizer } from '../ai-decision/thresholdOptimizer.js';
import { aiConfigurator } from '../ai-decision/aiConfigurator.js';
import { detectPII, sanitize as sanitizePII } from '../ai/privacyGuard.js';
import { logChatInteraction } from '../ai/chatRetention.js';

/**
 * 创建 AI 路由路由器
 * @param {Object} deps - 共享依赖
 * @param {Function} deps.authMiddleware - 认证中间件
 * @param {Function} deps.requireAdmin - 管理员角色中间件
 * @param {Map} deps.usersDB - 用户数据库 Map
 * @param {Function} deps.logAudit - 审计日志函数
 * @param {Function} deps.getClientIP - 获取客户端 IP
 * @param {Function} deps.checkAiChatAccess - 检查 AI 对话访问权限
 * @param {Function} deps.incrementAiChatUsage - 递增 AI 对话使用计数
 * @param {Function} deps.callAiModelWithFallback - 调用 AI 模型（含 Provider 自动切换）
 */
export function createAiRouter(deps) {
  const router = Router();

  const {
    authMiddleware,
    requireAdmin,
    usersDB,
    logAudit,
    getClientIP,
    checkAiChatAccess,
    incrementAiChatUsage,
    callAiModelWithFallback,
  } = deps;

  // ============================================================
  // 路由：AI 安全统计
  // ============================================================
  router.get('/ai/security/stats', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可访问' });
    }
    res.json({
      success: true,
      data: {
        decisions: decisionEngine.getStats(),
        reputation: ipReputation.getStats(),
        adaptiveDefense: adaptiveDefense.getStats(),
        patternRates: patternDetector.getPatternStats(),
        promptGuardRules: PromptGuard.getRuleCount?.() || 29,
        aiOptimization: thresholdOptimizer.getCurrentConfig(),
        modelTrust: decisionEngine.fusion.modelTrust,
        feedbackAccuracy: decisionEngine.feedback.getStats().accuracy,
        autoResponse: getResponseStats(),
      },
    });
  });

  // ============================================================
  // 路由：AI 安全配置优化
  // ============================================================
  // 安全规范：安全阈值优化属于管理权限操作，需认证并校验管理员身份
  router.post('/ai/security/optimize', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const result = await thresholdOptimizer.optimizeWithEngine(decisionEngine);
      res.json({ success: true, data: result });
    } catch (err) {
      res.json({ success: false, message: err.message });
    }
  });

  // ============================================================
  // 路由：AI 安全分析
  // ============================================================
  // 安全规范：安全/防御类诊断端点必须置于 requireAdmin 下；普通用户如需「是否安全」反馈只能拿到 safe 布尔。
  router.post('/ai/security/analyze', authMiddleware, (req, res) => {
    const { messages } = req.body;
    if (!messages) {
      res.status(400).json({ success: false, message: '缺少 messages 参数' });
      return;
    }

    const threats = PromptGuard.analyze(messages);
    const safe = threats.length === 0;
    // 仅管理员可读取内部威胁规则、评分与处置动作；普通用户只能拿到是否安全的结论
    if (req.tokenPayload?.role === 'admin') {
      return res.json({ success: true, data: { threats, safe } });
    }
    return res.json({ success: true, data: { safe } });
  });

  // ============================================================
  // 路由：AI 对话
  // ============================================================
  // 安全规范：AI 聊天消耗外部 API 配额，必须认证后使用；服务端校验会员/免费额度、隐私脱敏、留存归档
  router.post('/ai/chat', authMiddleware, validate(aiChatSchema), async (req, res) => {
    const { messages, model, temperature = 0.7, max_tokens = 800 } = req.body;
    const userId = req.tokenPayload?.userId;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, message: '缺少 messages 参数' });
      return;
    }

    // 服务端会员/免费额度校验（死代码 membership 实际生效）
    const access = await checkAiChatAccess(userId);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        code: 'AI_QUOTA_EXCEEDED',
        message: access.reason,
        limit: access.limit,
        used: access.used,
      });
    }

    // 隐私保护：检测并脱敏用户消息中的 PII
    const sanitizedMessages = messages.map((m) => {
      if (typeof m?.content !== 'string') return m;
      const pii = detectPII(m.content);
      const content = pii.length > 0 ? sanitizePII(m.content) : m.content;
      return { ...m, content };
    });

    try {
      await incrementAiChatUsage(userId);
      const { response, provider, model: usedModel } = await callAiModelWithFallback(
        sanitizedMessages,
        { model, temperature, max_tokens, stream: false },
      );

      const data = await response.json();
      const assistantContent = data.choices?.[0]?.message?.content || '';

      // 留存归档：记录 AI 对话（异步，不阻塞响应）
      logChatInteraction({
        userId,
        sessionId: req.headers['x-session-id'] || `session-${Date.now()}`,
        messages: sanitizedMessages,
        response: assistantContent,
        metadata: { model: usedModel, provider, endpoint: '/api/ai/chat', ip: getClientIP(req) },
      }).catch(err => console.error('[ChatRetention] 归档失败:', err.message));

      res.json({ success: true, data, provider, quota: { limit: access.limit, used: access.used + 1 } });
    } catch (error) {
      const providerHint = aiConfigurator.getAvailableProviders().length > 0
        ? `当前可用 Provider: ${aiConfigurator.getAvailableProviders().map(p => p.name).join(', ')}`
        : '请配置 ZHIPUAI_API_KEY 或 GITHUB_TOKEN';
      res.status(502).json({ success: false, message: `AI 请求失败: ${error.message}。${providerHint}` });
    }
  });

  // ============================================================
  // 路由：AI 流式对话端点 (SSE)
  // ============================================================
  // 安全规范：流式端点同样必须认证、校验额度、做隐私脱敏与留存归档
  // 支持多 Provider 自动切换（智谱AI → GitHub Models）
  router.post('/ai/chat/stream', authMiddleware, async (req, res) => {
    const { messages, model, temperature = 0.7 } = req.body;
    const userId = req.tokenPayload?.userId;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, message: '缺少 messages 参数' });
      return;
    }

    // 服务端会员/免费额度校验
    const access = await checkAiChatAccess(userId);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        code: 'AI_QUOTA_EXCEEDED',
        message: access.reason,
        limit: access.limit,
        used: access.used,
      });
    }

    // 隐私保护：检测并脱敏用户消息中的 PII
    const sanitizedMessages = messages.map((m) => {
      if (typeof m?.content !== 'string') return m;
      const pii = detectPII(m.content);
      const content = pii.length > 0 ? sanitizePII(m.content) : m.content;
      return { ...m, content };
    });

    await incrementAiChatUsage(userId);

    const assistantChunks = [];
    let usedProvider = 'unknown';
    let usedModel = 'unknown';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // 获取可用 Provider 列表
    const providers = aiConfigurator.getAvailableProviders();
    if (providers.length === 0) {
      res.write(`data: ${JSON.stringify({ error: '未配置任何可用的 AI Provider（请配置 ZHIPUAI_API_KEY 或 GITHUB_TOKEN）' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    let lastError = null;

    for (const { name, config } of providers) {
      if (aiConfigurator.isRateLimited(name)) {
        console.log(`[AI Stream] ${name} 处于限流冷却期，跳过`);
        continue;
      }

      const apiKey = config.getApiKey();
      const modelName = typeof config.model === 'function' ? config.model() : config.model;

      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || modelName,
            messages: sanitizedMessages,
            temperature,
            stream: true,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          const err = new Error(`API ${response.status}: ${text}`);
          err.statusCode = response.status;
          throw err;
        }

        // 更新当前 Provider
        usedProvider = name;
        usedModel = model || modelName;
        aiConfigurator._currentProvider = name;
        aiConfigurator._stats.calls++;
        aiConfigurator._stats.byProvider[name] = (aiConfigurator._stats.byProvider[name] || 0) + 1;

        // 发送 Provider 信息到客户端
        res.write(`data: ${JSON.stringify({ provider: name, model: usedModel })}\n\n`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  assistantChunks.push(content);
                  res.write(
                    `data: ${JSON.stringify({ content, provider: name, quota: { limit: access.limit, used: access.used + 1 } })}\n\n`,
                  );
                }
              } catch {}
            }
          }
        }

        // 成功完成流式响应
        res.write('data: [DONE]\n\n');
        res.end();

        // 留存归档：流式响应结束后异步记录
        logChatInteraction({
          userId,
          sessionId: req.headers['x-session-id'] || `session-${Date.now()}`,
          messages: sanitizedMessages,
          response: assistantChunks.join(''),
          metadata: { model: usedModel, provider: usedProvider, endpoint: '/api/ai/chat/stream', ip: getClientIP(req) },
        }).catch(err => console.error('[ChatRetention] 流式归档失败:', err.message));

        return; // 成功，退出函数
      } catch (err) {
        lastError = err;
        aiConfigurator._stats.errors++;

        if (err.statusCode === 429 || err.statusCode === 503 || err.message?.includes('rate')) {
          const coolDown = name === 'zhipuai' ? 120000 : 60000;
          aiConfigurator.markRateLimited(name, coolDown);
          aiConfigurator._stats.fallbacks++;
          console.warn(`[AI Stream] ${name} 限流，切换到下一个 Provider`);
          continue;
        }

        if (providers.length > 1) {
          aiConfigurator._stats.fallbacks++;
          console.warn(`[AI Stream] ${name} 错误: ${err.message}，切换到下一个 Provider`);
          continue;
        }
      }
    }

    // 所有 Provider 都失败了
    const errorMsg = lastError ? lastError.message : '所有 AI Provider 均不可用';
    res.write(`data: ${JSON.stringify({ error: `流式请求失败: ${errorMsg}` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });

  // ============================================================
  // 路由：AI 搜索（Bing 代理）
  // ============================================================
  router.post('/ai/search', authMiddleware, async (req, res) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ success: false, message: '缺少 query 参数' });
      return;
    }

    try {
      const response = await fetch(
        `https://cn.bing.com/search?q=${encodeURIComponent(query)}&format=json&mkt=zh-CN`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          },
        },
      );

      if (!response.ok) {
        res.status(response.status).json({ success: false, message: `搜索请求失败 (${response.status})` });
        return;
      }

      const html = await response.text();
      const results = [];

      const liRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;

      while ((liMatch = liRegex.exec(html)) !== null && results.length < 5) {
        const liContent = liMatch[1];

        const titleMatch = liContent.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i);
        if (!titleMatch) continue;

        const url = titleMatch[1];
        const title = titleMatch[2].replace(/<[^>]*>/g, '').trim();

        const snippetMatch = liContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : '';

        if (title && url) {
          results.push({ title, url, snippet });
        }
      }

      res.json({ success: true, results, summary: results[0]?.snippet || '' });
    } catch (error) {
      res.status(502).json({ success: false, message: error.message || '搜索代理请求失败' });
    }
  });

  return router;
}