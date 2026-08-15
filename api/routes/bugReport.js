/**
 * Bug report routes module
 * POST /api/bug-report, GET /api/bug-reports
 */
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { validateVideoFile } from '../security/input/fileSanitizer.js';

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

export function createBugReportRouter(deps) {
  const {
    express,
    authMiddleware,
    adminClientCertGate,
    optionalAuthMiddleware,
    bugReportLimiter,
    usersDB,
    videoUpload,
    UPLOAD_DIR,
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

  // ---------- 加载 Bug 报告数据 ----------

  const bugReports = readEncryptedJSON('bug-reports.json');

  // ===== AI 分析辅助函数 =====
  async function analyzeBugReport(id) {
    const report = bugReports.find(r => r.id === id);
    if (!report) throw new Error('报告不存在: ' + id);

    report.status = 'analyzing';
    writeEncryptedJSON('bug-reports.json', bugReports);

    try {
      const apiKey = process.env.ZHIPUAI_API_KEY;
      const analysisPrompt = {
        model: 'glm-4.7-flash',
        messages: [
          { role: 'system', content: '你是一个软件Bug分析专家。请分析以下Bug报告，返回JSON格式的分析结果（不要markdown包裹）。字段: rootCause(string), impact(string), suggestedFix(string), affectedFiles(string数组), priority(high/medium/low), analysisSummary(string)。' },
          { role: 'user', content: JSON.stringify({
            title: report.title,
            description: report.description,
            category: report.category,
            severity: report.severity,
            browserInfo: report.browserInfo,
          })},
        ],
        temperature: 0.3,
        max_tokens: 1200,
      };

      let analysisResult;
      if (apiKey) {
        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(analysisPrompt),
        });
        if (response.ok) {
          const data = await response.json();
          analysisResult = JSON.parse(data.choices[0].message.content);
        }
      }

      if (!analysisResult) {
        analysisResult = {
          rootCause: '需要人工进一步排查',
          impact: `影响范围: ${report.category}`,
          suggestedFix: '待开发团队评估',
          affectedFiles: ['待确定'],
          priority: report.severity === 'high' ? 'high' : report.severity === 'medium' ? 'medium' : 'low',
          analysisSummary: `已收到报告: ${report.title}，团队将尽快处理。`,
        };
      }

      report.aiAnalysis = {
        ...analysisResult,
        analyzedAt: new Date().toISOString(),
      };
      report.status = 'analyzed';
      writeEncryptedJSON('bug-reports.json', bugReports);
      return report;
    } catch (error) {
      report.aiAnalysis = {
        rootCause: 'AI分析暂不可用',
        impact: '',
        suggestedFix: '',
        affectedFiles: [],
        priority: report.severity === 'high' ? 'high' : 'medium',
        analysisSummary: 'AI分析服务暂不可用，请稍后重试。',
        analyzedAt: new Date().toISOString(),
      };
      report.status = 'analyzed';
      writeEncryptedJSON('bug-reports.json', bugReports);
      return report;
    }
  }

  // ===== 提交 Bug 报告 =====
  // 安全规范：可选鉴权，未登录用户也可提交
  router.post('/bug-report', optionalAuthMiddleware, bugReportLimiter, (req, res) => {
    try {
      const { title, description, category, severity, email, browserInfo, screenshots, videoUrl, videoMeta, autoDetected, incidentId, context } = req.body || {};
      const report = {
        id: 'bug-' + Date.now(),
        incidentId: incidentId || null,
        title: sanitizeInput(title || ''),
        description: sanitizeInput(description || ''),
        category: category || '其他',
        severity: severity || 'low',
        status: 'open',
        email: email || '',
        browserInfo: browserInfo || null,
        screenshots: screenshots || [],
        videoUrl: videoUrl || null,
        videoMeta: videoMeta || null,
        autoDetected: !!autoDetected,
        context: context || null,
        userId: req.tokenPayload?.userId || null,
        username: req.tokenPayload?.username || null,
        aiAnalysis: null,
        adminResponse: null,
        createdAt: new Date().toISOString(),
      };
      bugReports.unshift(report);
      writeEncryptedJSON('bug-reports.json', bugReports);

      // 自动触发 AI 分析：critical 级别的自动检测报告
      if (autoDetected && severity === 'high') {
        setImmediate(() => {
          analyzeBugReport(report.id).catch(err => {
            console.error('[BugReport] 自动 AI 分析失败:', err.message);
          });
        });
      }

      res.json({ success: true, data: report });
    } catch (err) {
      console.error('[BugReport POST] 错误:', err);
      res.status(500).json({ success: false, message: '保存失败: ' + (err.message || 'unknown') });
    }
  });

  // ===== 获取 Bug 报告列表 =====
  // 安全规范：Bug 报告列表含用户敏感信息，仅限管理员访问
  router.get('/bug-reports', authMiddleware, adminClientCertGate, (req, res) => {
    res.json({ success: true, data: bugReports });
  });

  // ===== Bug 报告视频上传 =====
  // 安全规范：可选鉴权，未登录用户也可上传；multer 限制 100MB；
  // 落盘后立即做魔数内容校验（防伪装/防恶意内容），失败则删除文件。
  router.post('/bug-report/upload-video', optionalAuthMiddleware, bugReportLimiter, (req, res) => {
    videoUpload.single('video')(req, res, (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ success: false, message: '上传失败: ' + (uploadErr.message || 'unknown') });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: '缺少视频文件（字段名应为 video）' });
      }

      const scan = validateVideoFile(req.file.path, { originalName: req.file.originalname });
      if (!scan.ok) {
        // 内容校验失败：删除临时目录中的文件，恶意内容不进入正式 uploads 目录
        try { fs.unlinkSync(req.file.path); } catch {}
        logAudit?.({
          userId: req.tokenPayload?.userId || 'guest',
          action: 'video_upload_rejected',
          ip: getClientIP(req),
          details: `视频内容校验失败: ${scan.reason}`,
          success: false,
        });
        return res.status(400).json({ success: false, message: '视频内容校验失败: ' + scan.reason });
      }

      // 校验通过：用内容决定的【服务端安全扩展名】改名移入正式 uploads 目录。
      // 落盘扩展名由服务端根据魔数判定结果决定，绝不采用攻击者可控的 originalname 扩展名，
      // 因此不会出现 x.html / x.php 之类危险扩展名落到可被公开访问的目录。
      const safeExt = scan.format === 'webm' ? '.webm' : '.mp4';
      const finalFilename = `bug-video-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
      const finalPath = path.join(UPLOAD_DIR, finalFilename);
      try {
        fs.renameSync(req.file.path, finalPath);
      } catch (renameErr) {
        // 移动失败：清理临时文件，避免残留
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(500).json({ success: false, message: '视频保存失败' });
      }
      req.file.filename = finalFilename;
      req.file.path = finalPath;

      const url = `/uploads/${finalFilename}`;
      logAudit?.({
        userId: req.tokenPayload?.userId || 'guest',
        action: 'video_uploaded',
        ip: getClientIP(req),
        details: `视频上传成功: ${url} (${scan.format})`,
        success: true,
      });
      res.json({ success: true, data: { url, id: req.file.filename } });
    });
  });

  return router;
}