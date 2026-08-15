/**
 * Events and config routes module
 * SSE endpoint, version, config, health, ping, csrf-token
 */
export function createEventsRouter(deps) {
  const {
    express,
    authMiddleware,
    adminClientCertGate,
    publicLimiter,
    csrfTokenLimiter,
    healthLimiter,
    // SSE 相关
    sseMiddleware,
    broadcastVersionUpdate,
    setVersionInfo,
    getVersionInfo,
    getSSEStats,
    // 工具
    path,
    fs,
    generateCsrfToken,
    os,
    server,
    getAuditLog,
    getAuditLogStats,
  } = deps;

  const router = express.Router();

  // ===== 健康检查端点 =====
  // 安全规范：health 端点仅返回标准状态、时间戳，禁止暴露运行态安全摘要、隔离日志、决策事件等内部信息
  router.get('/health', healthLimiter, async (req, res) => {
    // 数据库状态
    let dbStatus = 'unknown';
    try {
      const { isReady: dbIsReady } = await import('../database/db.js');
      dbStatus = dbIsReady() ? 'connected' : 'disconnected';
    } catch (e) {
      dbStatus = 'disconnected';
    }

    // Redis 状态
    let redisStatus = 'unknown';
    try {
      const { isRedisReady } = await import('../lib/redisClient.js');
      redisStatus = isRedisReady() ? 'connected' : 'disconnected';
    } catch (e) {
      redisStatus = 'disconnected';
    }

    // 系统信息
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    const version = process.env.npm_package_version || '1.0.0';

    // 活跃连接数（通过 server 对象获取）
    let activeConnections = 0;
    if (server && typeof server.getConnections === 'function') {
      try {
        activeConnections = await new Promise((resolve) => {
          server.getConnections((err, count) => {
            resolve(err ? 0 : count);
          });
        });
      } catch (e) {
        activeConnections = 0;
      }
    }

    res.json({
      status: 'ok',
      timestamp: Date.now(),
      uptime: Math.floor(uptime),
      version,
      database: dbStatus,
      redis: redisStatus,
      memory: {
        rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
        heapTotal: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
        heapUsed: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
        external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
      },
      activeConnections,
    });
  });

  // ===== Ping 端点 =====
  router.get('/ping', (req, res) => {
    res.json({ success: true, message: 'pong', timestamp: Date.now() });
  });

  // ===== CSRF Token 端点 =====
  router.get('/csrf-token', publicLimiter, csrfTokenLimiter, async (req, res) => {
    const token = await generateCsrfToken(req, res);
    res.json({ success: true, data: { csrfToken: token } });
  });

  // ===== 客户端版本与强制更新信息 =====
  // 安全规范：仅暴露最小必要字段，避免版本枚举与内部配置泄露
  router.get('/version', (req, res) => {
    const version = process.env.npm_package_version || '1.0.0';
    setVersionInfo(version, process.env.BUILD_TIME);

    // 读取 version.json 中的更新日志
    let changelog = [];
    try {
      const versionJsonPath = path.join(process.cwd(), 'public', 'version.json');
      if (fs.existsSync(versionJsonPath)) {
        const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
        changelog = data.changelog || [];
      }
    } catch { /* ignore */ }

    res.json({
      success: true,
      data: {
        version,
        buildTime: process.env.BUILD_TIME || new Date().toISOString(),
        forceUpdate: process.env.FORCE_UPDATE === 'true',
        changelog,
      },
    });
  });

  // ===== SSE 事件推送端点 =====
  // 实时接收服务器推送的版本更新、系统通知等
  router.get('/events', (req, res) => {
    // 设置较长的超时时间（SSE 连接需要保持）
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);
    sseMiddleware(req, res);
  });

  // ===== SSE 管理端点 =====
  router.get('/events/stats', (req, res) => {
    res.json({ success: true, data: getSSEStats() });
  });

  // ===== 手动触发版本更新广播 POST 端点 =====
  // 用于部署/更新后，通知所有在线前端有新版本可用
  // 安全加固：此端点可强制全平台客户端弹出"必须升级"，等同轻量 DoS ，
  // 必须叠加 管理员认证 + mTLS 客户端证书 双重校验，禁止匿名触发。
  router.post('/events/trigger-update', authMiddleware, adminClientCertGate, (req, res) => {
    try {
      const { version, forceUpdate, changelog } = req.body || {};
      const newVersion = version || process.env.npm_package_version || '1.0.0';
      const newBuildTime = new Date().toISOString();

      // 更新版本信息
      setVersionInfo(newVersion, newBuildTime);

      // 广播版本更新（携带更新详情）
      const sent = broadcastVersionUpdate({ forceUpdate: !!forceUpdate, changelog: changelog || [] });

      console.log(`[HMR] 手动触发版本更新广播: ${newVersion} (forceUpdate: ${!!forceUpdate}, changelog: ${changelog?.length || 0} 条), 推送至 ${sent} 个客户端`);
      res.json({ success: true, data: { version: newVersion, buildTime: newBuildTime, clientsNotified: sent } });
    } catch (err) {
      console.error('[HMR] 触发版本更新广播失败:', err.message);
      res.status(500).json({ success: false, error: '触发版本更新广播失败' });
    }
  });

  // ===== 公共运行时配置 =====
  // 仅暴露非敏感开关/文案
  router.get('/config', (req, res) => {
    res.json({
      success: true,
      data: {
        appName: 'LinguaLeap',
        allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
        enableAiChat: process.env.ENABLE_AI_CHAT !== 'false',
        enableMembership: process.env.ENABLE_MEMBERSHIP !== 'false',
        enableWebAuthn: process.env.ENABLE_WEBAUTHN === 'true',
        captchaTypes: ['numeric', 'math', 'rotate', 'sequence', 'audio'],
        defaultCaptchaType: 'numeric',
        supportedLanguages: ['english', 'japanese', 'korean'],
        defaultUiLanguage: 'zh',
        turnstileEnabled: true,
        turnstileSiteKey: process.env.VITE_TURNSTILE_SITE_KEY || '',
      },
    });
  });

  // ===== 审计日志查询端点 =====
  // 安全规范：日志含敏感信息，仅限管理员访问
  router.get('/logs', authMiddleware, adminClientCertGate, async (req, res) => {
    try {
      const { page, limit, action, userId, startTime, endTime } = req.query;
      const result = getAuditLog({
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 50, 200),
        action,
        userId,
        startTime: startTime ? parseInt(startTime) : undefined,
        endTime: endTime ? parseInt(endTime) : undefined,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: '查询日志失败' });
    }
  });

  // ===== 审计日志统计端点 =====
  router.get('/logs/stats', authMiddleware, adminClientCertGate, async (req, res) => {
    try {
      const stats = getAuditLogStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, message: '获取日志统计失败' });
    }
  });

  return router;
}