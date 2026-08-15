/**
 * Survey routes module
 * Surveys CRUD, responses, notifications
 */
import path from 'path';
import fs from 'fs';

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export function createSurveyRouter(deps) {
  const {
    express,
    authMiddleware,
    adminClientCertGate,
    requireAdminReauth,
    surveyLimiter,
    surveys,
    notifications,
    usersDB,
    readEncryptedFile,
    writeEncryptedFile,
    DATA_DIR,
    logAudit,
    getClientIP,
    encrypt,
    decrypt,
    hasEncryptionKey,
  } = deps;

  const router = express.Router();

  // ---------- 加密文件读写辅助函数 ----------

  function readEncryptedJSON(filename, fallback = []) {
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw.trim()) return fallback;
      if (raw.startsWith('enc:')) {
        if (!hasEncryptionKey()) {
          throw new Error(`[FileVault] ${filename} 为加密文件，但 FILE_ENCRYPTION_KEY 未配置`);
        }
        return JSON.parse(decrypt(raw));
      }
      console.warn(`[FileVault] ${filename} 当前为明文存储，建议运行 npm run security:encrypt-files 迁移`);
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[FileVault] 读取 ${filename} 失败:`, err.message);
      return fallback;
    }
  }

  function restrictFilePermissions(filePath) {
    try {
      fs.chmodSync(filePath, 0o600);
      if (process.platform === 'win32') {
        const user = process.env.USERNAME || process.env.USER;
        if (user) {
          const { execSync } = require('child_process');
          execSync(`icacls "${filePath}" /inheritance:r /grant:r "${user}:(R,W)"`, { stdio: 'ignore' });
        }
      }
    } catch (err) {
      console.warn(`[FileVault] 无法限制 ${filePath} 文件权限:`, err.message);
    }
  }

  function writeEncryptedJSON(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!hasEncryptionKey()) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`[FileVault] 生产环境禁止明文写入 ${filename}，必须配置 FILE_ENCRYPTION_KEY`);
      }
      console.warn(`[FileVault] ${filename} 将以明文写入（开发环境降级）`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      restrictFilePermissions(filePath);
      return;
    }
    const plaintext = JSON.stringify(data, null, 2);
    const encrypted = encrypt(plaintext, { context: filename });
    const tempFile = `${filePath}.tmp`;
    fs.writeFileSync(tempFile, encrypted, 'utf-8');
    fs.renameSync(tempFile, filePath);
    restrictFilePermissions(filePath);
  }

  // ===== 创建问卷 =====
  // 安全规范：创建问卷属于管理权限操作，需认证并校验管理员身份
  router.post('/surveys', authMiddleware, adminClientCertGate, async (req, res) => {
    const { title, description, questions } = req.body;
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ success: false, message: '缺少必填字段' }); return;
    }
    const survey = {
      id: 'survey-' + Date.now(),
      title: sanitizeInput(title),
      description: sanitizeInput(description || ''),
      questions: questions.map((q, i) => ({
        id: 'q-' + i + '-' + Date.now(),
        type: q.type || 'text',
        title: sanitizeInput(q.title),
        required: q.required !== false,
        options: q.options || [],
      })),
      status: 'active',
      createdAt: new Date().toISOString(),
      createdBy: req.tokenPayload.userId,
      responseCount: 0,
    };
    surveys.unshift(survey);
    writeEncryptedJSON('surveys.json', surveys);

    const surveyNotif = {
      id: 'notif-' + Date.now(),
      type: 'survey',
      title: `📋 新问卷: ${survey.title}`,
      message: `我们发布了一份新的调查问卷"${survey.title}"，欢迎填写反馈！`,
      link: '/surveys',
      time: new Date().toISOString(),
      read: false,
      userId: null,
      createdAt: new Date().toISOString(),
    };
    const notificationsForSurvey = readEncryptedJSON('notifications.json');
    notificationsForSurvey.unshift(surveyNotif);
    writeEncryptedJSON('notifications.json', notificationsForSurvey);
    console.log(`[广播] 问卷通知已推送: ${survey.title}`);

    res.json({ success: true, data: survey });
  });

  // ===== 提交问卷回答 =====
  // 安全规范：公开端点，无需登录
  router.post('/surveys/:id/respond', surveyLimiter, (req, res) => {
    const survey = surveys.find(s => s.id === req.params.id);
    if (!survey || survey.status !== 'active') { res.status(404).json({ success: false, message: '问卷不可用' }); return; }
    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
      res.status(400).json({ success: false, message: '缺少答案' }); return;
    }
    const responseEntry = {
      id: 'resp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      surveyId: survey.id,
      answers: answers.map(a => ({
        questionId: a.questionId,
        value: a.value,
      })),
      submittedAt: new Date().toISOString(),
    };
    survey.responseCount = (survey.responseCount || 0) + 1;
    const allResponses = readEncryptedJSON('survey-responses.json');
    allResponses.push(responseEntry);
    writeEncryptedJSON('survey-responses.json', allResponses);
    writeEncryptedJSON('surveys.json', surveys);
    res.json({ success: true, data: { id: responseEntry.id } });
  });

  // ===== 获取问卷结果 =====
  // 安全规范：问卷结果属于敏感聚合数据，仅限管理员访问，并需二次验证
  router.get('/surveys/:id/results', authMiddleware, requireAdminReauth, (req, res) => {
    const survey = surveys.find(s => s.id === req.params.id);
    if (!survey) { res.status(404).json({ success: false, message: '问卷不存在' }); return; }
    const allResponses = readEncryptedJSON('survey-responses.json');
    const responses = allResponses.filter(r => r.surveyId === survey.id);
    const aggregated = survey.questions.map(q => {
      const qResponses = responses.map(r => r.answers.find(a => a.questionId === q.id)).filter(Boolean);
      if (q.type === 'rating' && qResponses.length > 0) {
        const nums = qResponses.map(r => Number(r.value)).filter(n => !isNaN(n));
        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          total: qResponses.length,
          average: nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : null,
          distribution: q.type === 'choice' || q.type === 'multiple' ? q.options.map(opt => ({
            option: opt,
            count: qResponses.filter(r => {
              if (Array.isArray(r.value)) return r.value.includes(opt);
              return r.value === opt;
            }).length,
          })) : undefined,
        };
      }
      if ((q.type === 'choice' || q.type === 'multiple') && q.options) {
        return {
          questionId: q.id,
          title: q.title,
          type: q.type,
          total: qResponses.length,
          distribution: q.options.map(opt => ({
            option: opt,
            count: qResponses.filter(r => {
              if (Array.isArray(r.value)) return r.value.includes(opt);
              return r.value === opt;
            }).length,
          })),
        };
      }
      return {
        questionId: q.id,
        title: q.title,
        type: q.type,
        total: qResponses.length,
        responses: qResponses.slice(0, 50).map(r => r.value),
      };
    });
    res.json({ success: true, data: { survey, aggregated, totalResponses: responses.length } });
  });

  // ===== 修改问卷状态 =====
  // 安全规范：修改问卷状态属于管理权限操作，需认证并校验管理员身份
  router.patch('/surveys/:id/status', authMiddleware, adminClientCertGate, (req, res) => {
    const survey = surveys.find(s => s.id === req.params.id);
    if (!survey) { res.status(404).json({ success: false, message: '问卷不存在' }); return; }
    const { status } = req.body;
    if (!status) { res.status(400).json({ success: false, message: '缺少 status 字段' }); return; }
    survey.status = status;
    writeEncryptedJSON('surveys.json', surveys);
    res.json({ success: true, data: survey });
  });

  // ===== 获取通知列表 =====
  // 安全规范：通知数据属于系统敏感数据，仅限管理员读取
  router.get('/notifications', authMiddleware, adminClientCertGate, (req, res) => {
    const allNotifications = readEncryptedJSON('notifications.json');
    res.json({ success: true, data: allNotifications.slice(0, 100) });
  });

  // ===== 广播通知 =====
  // 安全规范：广播通知属于管理权限操作，必须认证并校验管理员身份
  router.post('/notifications/broadcast', authMiddleware, adminClientCertGate, (req, res) => {
    const { title, message, type, link } = req.body;
    if (!title) { res.status(400).json({ success: false, message: '缺少 title' }); return; }
    const notification = {
      id: 'notif-' + Date.now(),
      type: type || 'survey',
      title: sanitizeInput(title),
      message: message ? sanitizeInput(message) : '',
      link: link || null,
      time: new Date().toISOString(),
      read: false,
      userId: null,
      createdAt: new Date().toISOString(),
    };
    const notifications = readEncryptedJSON('notifications.json');
    notifications.unshift(notification);
    writeEncryptedJSON('notifications.json', notifications);
    console.log(`[广播] 通知已发送: ${title}`);
    res.json({ success: true, data: notification });
  });

  return router;
}