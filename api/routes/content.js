// ===== 内容路由模块 =====
// 从 api/index.js 中提取的内容 CRUD、用户数据导出/删除、有道翻译与语言检测相关路由，
// 使用工厂函数模式以共享依赖。

import { Router } from 'express';
import { tts as youdao_tts, translate as youdao_translate } from '../utils/youdao.js';

/**
 * 创建内容路由路由器
 * @param {Object} deps - 共享依赖
 * @param {Function} deps.authMiddleware - 认证中间件
 * @param {Function} deps.apiLimiter - API 限流中间件
 * @param {Function} deps.crudReadLimiter - CRUD 读取限流中间件
 * @param {Map} deps.usersDB - 用户数据库 Map
 * @param {Map} deps.sessionsDB - 会话数据库 Map
 * @param {Map} deps.twoFactorSecrets - 双因素认证密钥存储
 * @param {Map} deps.loginHistoryDB - 登录历史数据库
 * @param {Function} deps.logAudit - 审计日志函数
 * @param {Function} deps.getClientIP - 获取客户端 IP
 * @param {Array} deps.mockCourses - 模拟课程数据
 * @param {Array} deps.mockWords - 模拟单词数据
 * @param {Array} deps.mockGrammarExercises - 模拟语法练习数据
 * @param {Object} deps.mockProgress - 模拟学习进度数据
 * @param {Array} deps.mockAchievements - 模拟成就数据
 */
export function createContentRouter(deps) {
  const router = Router();

  const {
    authMiddleware,
    apiLimiter,
    crudReadLimiter,
    usersDB,
    sessionsDB,
    twoFactorSecrets,
    loginHistoryDB,
    logAudit,
    getClientIP,
    deleteUserData,
    mockCourses,
    mockWords,
    mockGrammarExercises,
    mockProgress,
    mockAchievements,
  } = deps;

  // ============================================================
  // 路由：课程列表
  // ============================================================
  router.get('/courses', authMiddleware, (req, res) => {
    const { language, level } = req.query;
    let filtered = mockCourses;
    if (language) filtered = filtered.filter(c => c.language === language);
    if (level) filtered = filtered.filter(c => c.level === level);
    res.json({ success: true, data: filtered });
  });

  // ============================================================
  // 路由：课程详情
  // ============================================================
  router.get('/courses/:id', authMiddleware, (req, res) => {
    const course = mockCourses.find(c => c.id === req.params.id);
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }
    res.json({ success: true, data: course });
  });

  // ============================================================
  // 路由：更新课程进度
  // ============================================================
  router.put('/courses/:id/progress', authMiddleware, (req, res) => {
    const { progress } = req.body;
    const course = mockCourses.find(c => c.id === req.params.id);
    if (course) course.progress = progress;
    res.json({ success: true });
  });

  // ============================================================
  // 路由：单词列表
  // ============================================================
  router.get('/words', authMiddleware, (req, res) => {
    res.json({ success: true, data: mockWords });
  });

  // ============================================================
  // 路由：语法练习
  // ============================================================
  router.get('/grammar', authMiddleware, (req, res) => {
    res.json({ success: true, data: mockGrammarExercises });
  });

  // ============================================================
  // 路由：听力练习
  // ============================================================
  router.get('/listening', authMiddleware, (req, res) => {
    res.json({ success: true, data: [] });
  });

  // ============================================================
  // 路由：学习进度
  // ============================================================
  router.get('/progress', authMiddleware, (req, res) => {
    res.json({ success: true, data: mockProgress });
  });

  // ============================================================
  // 路由：成就列表
  // ============================================================
  router.get('/achievements', authMiddleware, (req, res) => {
    res.json({ success: true, data: mockAchievements });
  });

  // ============================================================
  // 路由：用户数据导出
  // ============================================================
  // 安全规范：敏感操作统一使用 authMiddleware，避免自行解析 JWT，确保吊销检查与密钥版本校验生效
  router.post('/user/export-data', apiLimiter, authMiddleware, (req, res) => {
    const userData = usersDB.get(req.tokenPayload.userId);
    if (!userData) return res.status(404).json({ success: false, message: '用户不存在' });
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '2.0.0',
      user: {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        level: userData.level,
        createdAt: userData.createdAt,
        xp: userData.xp,
        streakDays: userData.streakDays,
      },
      privacy: {
        dataRetention: '用户数据在账户删除后最多保留90天',
        rights: '您拥有访问、更正、删除、限制处理、数据可携带和反对的权利',
      },
    };
    logAudit(req.tokenPayload.userId, 'DATA_EXPORT', { ip: getClientIP(req) });
    res.json({ success: true, message: '数据导出成功', data: exportData });
  });

  // ============================================================
  // 路由：用户账户删除
  // ============================================================
  router.delete('/user/delete-data', authMiddleware, async (req, res) => {
    const userId = req.tokenPayload.userId;
    const userData = usersDB.get(userId);
    if (!userData) return res.status(404).json({ success: false, message: '用户不存在' });
    usersDB.delete(userId);
    sessionsDB.delete(userId);
    twoFactorSecrets.delete(userId);
    loginHistoryDB.delete(userId);
    // 数据删除自动化：清理 AI 聊天历史与上传文件等文件系统残留
    if (typeof deleteUserData === 'function') {
      try {
        await deleteUserData(userId, { ip: getClientIP(req) });
      } catch (err) {
        console.error('[delete-data] 残留数据清理失败:', err.message);
      }
    }
    logAudit(userId, 'ACCOUNT_DELETION', { ip: getClientIP(req) });
    res.json({ success: true, message: '账户及所有个人数据已永久删除' });
  });

  // ============================================================
  // 路由：有道 TTS 语音合成
  // ============================================================
  router.post('/youdao/tts', authMiddleware, async (req, res) => {
    try {
      const { text, voiceName, speed, volume } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, message: '缺少 text 参数' });
      }
      const audioBuffer = await youdao_tts(text, { voiceName, speed, volume });
      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Disposition', 'inline; filename="tts.mp3"');
      res.send(audioBuffer);
    } catch (err) {
      console.error('[YouDao TTS] 错误:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ============================================================
  // 路由：有道翻译
  // ============================================================
  // 安全规范：需要登录后使用
  router.post('/youdao/translate', authMiddleware, async (req, res) => {
    try {
      const { text, from, to } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, message: '缺少 text 参数' });
      }
      const result = await youdao_translate(text, from || 'auto', to || 'zh-CHS');
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[YouDao Translate] 错误:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ============================================================
  // 路由：浏览器语言检测
  // ============================================================
  // 安全规范：该接口返回推荐语言与置信度，虽不敏感，但为减少信息枚举，要求登录后访问
  router.get('/language/detect', authMiddleware, (req, res) => {
    const acceptLang = req.headers['accept-language'] || 'zh';
    const primary = acceptLang.split(',')[0].trim().toLowerCase();
    const mapping = {
      en: 'english',
      'en-us': 'english',
      'en-gb': 'english',
      ja: 'japanese',
      'ja-jp': 'japanese',
      ko: 'korean',
      'ko-kr': 'korean',
      zh: 'english',
      'zh-cn': 'english',
      'zh-tw': 'english',
      'zh-hk': 'english',
    };
    const language = mapping[primary] || 'english';
    res.json({
      success: true,
      data: { language, source: primary, confidence: 0.95 },
    });
  });

  return router;
}