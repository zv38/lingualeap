// ============================================================
// requestValidator — 军工级结构化输入校验中间件
// 使用 zod 按 schema 校验请求体，拒绝多余字段，替换散落的 sanitizeInput。
// 设计原则：
//   - 每个路由/资源应有独立的校验 schema
//   - 拒绝 schema 中未定义的额外字段（strip unknown）
//   - 错误信息统一格式，不泄露内部结构
//   - 校验通过后，req.body 被替换为只包含 schema 定义字段的干净对象
// ============================================================

import { z } from 'zod'

// 公共字段校验器
export const emailSchema = z
  .string()
  .max(255, '邮箱地址过长')
  .email('邮箱格式无效')
  .transform(v => v.toLowerCase().trim())

export const passwordSchema = z
  .string()
  .min(8, '密码至少 8 个字符')
  .max(128, '密码过长')
  .refine(
    (v) => /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^a-zA-Z0-9]/.test(v),
    '密码必须包含大写字母、数字和特殊字符'
  )

export const usernameSchema = z
  .string()
  .min(2, '用户名至少 2 个字符')
  .max(32, '用户名最长 32 个字符')
  .regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, '用户名只能包含字母、数字、下划线和中文')

export const uuidSchema = z.string().uuid('无效的 UUID')

// 分页参数
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ===== 业务校验 Schema =====

// 注册请求
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  turnstileToken: z.string().min(1, '人机验证令牌缺失').max(2048, '令牌过长'),
  poWChallenge: z.string().optional(),
  referralCode: z.string().max(32).optional(),
  inviteCode: z.string().max(32).optional(),
  // 前端额外发送的字段（后续中间件/处理函数需要读取）
  imageCaptchaToken: z.string().optional(),
  imageCaptchaCode: z.string().optional(),
  humanToken: z.string().optional(),
  humanSignals: z.any().optional(),
  behaviorSignals: z.any().optional(),
}).strict('注册请求包含不允许的字段')

// 登录请求
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '密码不能为空').max(128, '密码过长'),
  turnstileToken: z.string().min(1, '人机验证令牌缺失').max(2048, '令牌过长'),
  totpCode: z.string().length(6).optional(),
  trustDevice: z.boolean().optional(),
  // 前端额外发送的字段（后续中间件/处理函数需要读取）
  imageCaptchaToken: z.string().optional(),
  imageCaptchaCode: z.string().optional(),
  humanToken: z.string().optional(),
  humanSignals: z.any().optional(),
}).strict('登录请求包含不允许的字段')

// 管理员登录
export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '密码不能为空').max(128, '密码过长'),
  turnstileToken: z.string().min(1, '人机验证令牌缺失').max(2048, '令牌过长'),
  totpCode: z.string().length(6).optional(),
  deviceFingerprint: z.string().optional(),
}).strict('管理员登录请求包含不允许的字段')

// 管理员二次验证
export const adminReauthSchema = z.object({
  password: z.string().min(1, '密码不能为空'),
  totpCode: z.string().length(6).optional(),
}).strict('二次验证请求包含不允许的字段')

// 创建帖子
export const createPostSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200, '标题过长'),
  content: z.string().min(1, '内容不能为空').max(50000, '内容过长'),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isPrivate: z.boolean().optional(),
}).strict('创建帖子请求包含不允许的字段')

// 评论
export const createCommentSchema = z.object({
  content: z.string().min(1, '评论不能为空').max(5000, '评论过长'),
}).strict('评论请求包含不允许的字段')

// Bug 报告
export const bugReportSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200, '标题过长'),
  description: z.string().min(1, '描述不能为空').max(10000, '描述过长'),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.string().max(100).optional(),
  stepsToReproduce: z.string().max(10000).optional(),
  expectedBehavior: z.string().max(5000).optional(),
  actualBehavior: z.string().max(5000).optional(),
  environment: z.string().max(500).optional(),
  browserInfo: z.string().max(500).optional(),
  osInfo: z.string().max(500).optional(),
  screenshotPath: z.string().max(500).optional(),
  videoPath: z.string().max(500).optional(),
}).strict('Bug 报告包含不允许的字段')

// 课程进度更新
export const courseProgressSchema = z.object({
  courseId: z.string().min(1),
  progress: z.number().min(0).max(100),
  completedLessons: z.array(z.string()).optional(),
  quizScore: z.number().min(0).max(100).optional(),
  timeSpent: z.number().int().positive().optional(),
}).strict('课程进度更新包含不允许的字段')

// 调查问卷提交
export const surveyResponseSchema = z.object({
  surveyId: z.string().min(1),
  answers: z.record(z.any()),
  completedAt: z.string().optional(),
}).strict('问卷提交包含不允许的字段')

// 管理员操作（封禁/解封）
export const adminUserStatusSchema = z.object({
  userId: z.string().min(1, '用户 ID 不能为空'),
  action: z.enum(['freeze', 'unfreeze', 'ban', 'warn', 'restrict'], '无效的操作类型'),
  reason: z.string().min(1, '原因不能为空').max(1000, '原因过长'),
  duration: z.number().int().positive().optional(),
  notifyUser: z.boolean().optional(),
}).strict('用户状态操作包含不允许的字段')

// 忘记密码
export const forgotPasswordSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1, '人机验证令牌缺失').max(2048, '令牌过长'),
}).strict('忘记密码请求包含不允许的字段')

// 重置密码
export const resetPasswordSchema = z.object({
  code: z.string().length(8, '重置码必须为 8 位'),
  password: passwordSchema,
  turnstileToken: z.string().min(1, '人机验证令牌缺失').max(2048, '令牌过长'),
}).strict('重置密码请求包含不允许的字段')

// AI 聊天请求
export const aiChatSchema = z.object({
  message: z.string().min(1, '消息不能为空').max(10000, '消息过长'),
  conversationId: z.string().optional(),
  model: z.string().max(50).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(8192).optional(),
  context: z.any().optional(),
}).strict('AI 聊天请求包含不允许的字段')

// 调查问卷创建
export const createSurveySchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200, '标题过长'),
  description: z.string().max(5000).optional(),
  questions: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['text', 'radio', 'checkbox', 'rating', 'select'], '无效的问题类型'),
    title: z.string().min(1, '问题标题不能为空'),
    required: z.boolean().default(false),
    options: z.array(z.string()).optional(),
    maxLength: z.number().int().positive().optional(),
  })).min(1, '至少需要一个问题').max(100, '问题数量超限'),
  isActive: z.boolean().optional(),
  targetAudience: z.enum(['all', 'students', 'admins']).optional(),
  expiresAt: z.string().optional(),
}).strict('创建问卷包含不允许的字段')

// 通知广播
export const broadcastSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200, '标题过长'),
  content: z.string().min(1, '内容不能为空').max(10000, '内容过长'),
  type: z.enum(['info', 'warning', 'success', 'error']).default('info'),
  targetAudience: z.enum(['all', 'students', 'admins']).default('all'),
  expiresAt: z.string().optional(),
  link: z.string().url().optional().or(z.literal('')),
}).strict('广播通知包含不允许的字段')

// 申诉提交
export const appealSchema = z.object({
  reason: z.string().min(1, '申诉原因不能为空').max(5000, '申诉原因过长'),
  evidence: z.array(z.string().max(500)).max(10).optional(),
  contactEmail: emailSchema.optional(),
}).strict('申诉提交包含不允许的字段')

// 导出数据请求
export const exportDataSchema = z.object({
  includeTypes: z.array(z.enum(['profile', 'progress', 'achievements', 'posts', 'messages'])).min(1, '至少选择一种数据类型'),
  format: z.enum(['json', 'csv']).default('json'),
}).strict('导出数据请求包含不允许的字段')

// 安全检测端点（行为采集）
export const securityBehaviorSchema = z.object({
  events: z.array(z.object({
    type: z.string().min(1),
    timestamp: z.number(),
    data: z.record(z.any()).optional(),
  })).min(1).max(100),
  sessionId: z.string().optional(),
}).strict('安全行为采集包含不允许的字段')

// 环境检测
export const environmentCheckSchema = z.object({
  userAgent: z.string().max(500).optional(),
  platform: z.string().max(100).optional(),
  language: z.string().max(20).optional(),
  screenResolution: z.string().max(20).optional(),
  timezone: z.string().max(50).optional(),
  hardwareConcurrency: z.number().int().positive().optional(),
  deviceMemory: z.number().positive().optional(),
}).strict('环境检测包含不允许的字段')

// 批量挂载到路由的校验中间件集合
export const validators = {
  register: registerSchema,
  login: loginSchema,
  adminLogin: adminLoginSchema,
  adminReauth: adminReauthSchema,
  createPost: createPostSchema,
  createComment: createCommentSchema,
  bugReport: bugReportSchema,
  courseProgress: courseProgressSchema,
  surveyResponse: surveyResponseSchema,
  adminUserStatus: adminUserStatusSchema,
  forgotPassword: forgotPasswordSchema,
  resetPassword: resetPasswordSchema,
  aiChat: aiChatSchema,
  createSurvey: createSurveySchema,
  broadcast: broadcastSchema,
  appeal: appealSchema,
  exportData: exportDataSchema,
  securityBehavior: securityBehaviorSchema,
  environmentCheck: environmentCheckSchema,
}

/**
 * 创建 zod 校验中间件。
 * @param {z.ZodSchema} schema - zod schema
 * @param {object} [options]
 * @param {'body'|'query'|'params'} [options.source='body'] - 校验的数据来源
 * @param {boolean} [options.stripUnknown=true] - 是否移除未知字段
 * @returns {Function} Express 中间件
 */
export function validate(schema, { source = 'body', stripUnknown = true } = {}) {
  return (req, res, next) => {
    const data = req[source]
    if (!data) {
      return res.status(400).json({
        success: false,
        message: `请求${source === 'body' ? '体' : source}为空`,
        code: 'VALIDATION_ERROR',
      })
    }

    const result = schema.safeParse(data)
    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))

      return res.status(400).json({
        success: false,
        message: '请求参数校验失败',
        code: 'VALIDATION_ERROR',
        errors: errors.slice(0, 5), // 最多返回 5 条错误
      })
    }

    // 校验通过后，替换为只包含 schema 定义字段的干净对象
    if (stripUnknown && source === 'body') {
      req.body = result.data
    }

    next()
  }
}

/**
 * 创建基于 schema key 的校验中间件。
 * 从 validators 对象中按名称查找 schema。
 */
export function validateByKey(key, options = {}) {
  const schema = validators[key]
  if (!schema) {
    throw new Error(`未知的校验 schema: ${key}`)
  }
  return validate(schema, options)
}