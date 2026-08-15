// ===== 军工级全局错误响应归一化 =====
// 统一错误响应格式，生产环境禁止泄露内部路径、堆栈、模块信息
// 支持自定义错误类、错误分类、自动 requestId 追踪、异步错误处理

import crypto from 'crypto'

// 错误分类映射表
const ERROR_CODES = {
  VALIDATION_ERROR:  { statusCode: 400, message: '请求参数校验失败' },
  AUTH_ERROR:        { statusCode: 401, message: '身份验证失败' },
  FORBIDDEN:         { statusCode: 403, message: '权限不足，禁止访问' },
  NOT_FOUND:         { statusCode: 404, message: '请求的资源不存在' },
  RATE_LIMITED:      { statusCode: 429, message: '请求频率过高，请稍后重试' },
  CONFLICT:          { statusCode: 409, message: '资源冲突' },
  PAYLOAD_TOO_LARGE: { statusCode: 413, message: '请求体过大' },
  UNSUPPORTED_MEDIA: { statusCode: 415, message: '不支持的媒体类型' },
  INTERNAL_ERROR:    { statusCode: 500, message: '服务器内部错误' },
  SERVICE_UNAVAILABLE: { statusCode: 503, message: '服务暂不可用，请稍后重试' },
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * 自定义错误类
 * 支持 statusCode / code / details / cause 字段
 * @example
 *   throw new AppError('VALIDATION_ERROR', '邮箱格式不正确', { field: 'email' })
 *   throw new AppError('NOT_FOUND', null, { resourceId: 42 })
 */
export class AppError extends Error {
  /**
   * @param {string} code        - 错误分类码，如 VALIDATION_ERROR
   * @param {string} [message]   - 可读错误消息，不传则使用分类默认值
   * @param {*}      [details]   - 附加调试信息（生产环境自动脱敏）
   * @param {Error}  [cause]     - 原始错误链
   */
  constructor(code, message, details, cause) {
    const config = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR
    const finalMessage = message || config.message

    super(finalMessage)
    this.name = 'AppError'
    this.code = code
    this.statusCode = config.statusCode
    this.details = details ?? null
    this.cause = cause ?? null
    this.timestamp = new Date().toISOString()

    // 保留完整堆栈供非生产环境调试
    if (cause instanceof Error) {
      this.stack = cause.stack
    } else {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: IS_PRODUCTION ? null : this.details,
      timestamp: this.timestamp,
    }
  }
}

/**
 * 生成唯一请求追踪 ID
 * 格式: err-{timestamp}-{8位随机hex}
 */
function generateRequestId() {
  return `req-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
}

/**
 * 从各种错误形态中提取标准化信息
 */
function normalizeError(err) {
  // 已封装的 AppError
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
      stack: err.stack,
    }
  }

  // Express body-parser / JSON 解析错误
  if (err.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: '请求体 JSON 格式错误',
      details: null,
      stack: err.stack,
    }
  }

  if (err.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: '请求体超过大小限制',
      details: null,
      stack: err.stack,
    }
  }

  // 文件上传相关错误
  if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: err.code === 'LIMIT_FILE_SIZE' ? '文件大小超出限制' : '上传字段名不匹配',
      details: null,
      stack: err.stack,
    }
  }

  // Multer 错误
  if (err.name === 'MulterError') {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: `文件上传错误: ${err.message}`,
      details: null,
      stack: err.stack,
    }
  }

  // 认证相关错误
  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return {
      statusCode: 401,
      code: 'AUTH_ERROR',
      message: err.message || '身份验证失败',
      details: null,
      stack: err.stack,
    }
  }

  // 通用 SyntaxError（JSON 解析等）
  if (err instanceof SyntaxError && err.status === 400) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: '请求数据格式错误',
      details: null,
      stack: err.stack,
    }
  }

  // 兜底：未知错误
  return {
    statusCode: err.statusCode || err.status || 500,
    code: err.code && ERROR_CODES[err.code] ? err.code : 'INTERNAL_ERROR',
    message: err.statusCode || err.status ? (err.message || '服务器内部错误') : '服务器内部错误',
    details: err.details || null,
    stack: err.stack,
  }
}

/**
 * 全局错误处理中间件
 * 统一所有错误响应格式为:
 *   { success: false, message, code, requestId }
 * 生产环境剥离堆栈、内部路径、模块信息
 */
export function errorHandler(err, req, res, next) {
  const requestId = generateRequestId()

  // 规范化错误信息
  const normalized = normalizeError(err)
  const { statusCode, code, message, details } = normalized

  // 构造统一响应体
  const body = {
    success: false,
    message,
    code,
    requestId,
  }

  // 非生产环境附加调试信息，但始终过滤敏感路径
  if (!IS_PRODUCTION) {
    body.details = details
    // 堆栈脱敏：替换绝对路径为相对路径
    if (normalized.stack) {
      body.stack = normalized.stack
        .split('\n')
        .map(line => {
          // 替换 windows 绝对路径 (C:\xxx) 为相对路径
          if (IS_PRODUCTION) return line
          return line.replace(/[A-Za-z]:\\(?:[^\\]+\\)+/g, '.../')
        })
        .join('\n')
    }
  }

  // 日志输出（包含 requestId 用于关联追踪）
  const logLevel = statusCode >= 500 ? 'error' : (statusCode >= 400 ? 'warn' : 'info')
  const logMsg = `[ErrorHandler] ${logLevel.toUpperCase()} | req=${requestId} | code=${code} | status=${statusCode} | ${message}`
  if (statusCode >= 500) {
    console.error(logMsg)
    if (!IS_PRODUCTION && normalized.stack) {
      console.error(`[ErrorHandler] Stack:\n${normalized.stack}`)
    }
  } else {
    console.warn(logMsg)
  }

  // 设置响应头
  res.status(statusCode)
  res.json(body)
}

/**
 * 异步错误处理包装器
 * 自动捕获 async 中间件中抛出的错误并传递给 errorHandler
 * @param {Function} fn - async 中间件函数
 * @returns {Function}  Express 中间件
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * 创建指定错误分类的快捷工厂函数
 * @param {string} code - 错误分类码
 * @returns {Function}  抛出该分类错误的工厂
 */
export function createErrorFactory(code) {
  return (message, details, cause) => {
    throw new AppError(code, message, details, cause)
  }
}