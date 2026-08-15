import crypto from 'crypto'

/**
 * 军工级基于属性的访问控制（ABAC）模块。
 *
 * 支持根据主体（Subject）、资源（Resource）、操作（Action）、环境（Environment）
 * 四个维度进行动态授权决策。策略规则为纯函数，可在运行时组合。
 *
 * @example
 * import { requireABAC, allowOwnOrAdmin, combinePolicies } from './security/access/abac.js'
 *
 * app.put('/api/users/:id', requireABAC((ctx) => allowOwnOrAdmin(ctx)), handler)
 */

/**
 * @typedef {object} ABACSubject
 * @property {string|null} [userId]
 * @property {string|null} [role]
 * @property {string[]} [groups]
 * @property {Record<string, any>} [attrs]
 */

/**
 * @typedef {object} ABACResource
 * @property {string} type
 * @property {string|null} [ownerId]
 * @property {Record<string, any>} [attrs]
 */

/**
 * @typedef {object} ABACEnvironment
 * @property {string} ip
 * @property {string} [time]
 * @property {boolean} [isTrustedDevice]
 * @property {string} [mfaLevel]
 * @property {Record<string, any>} [extra]
 */

/**
 * @typedef {object} ABACContext
 * @property {ABACSubject} subject
 * @property {ABACResource} resource
 * @property {string} action
 * @property {ABACEnvironment} environment
 * @property {import('express').Request} [req]
 */

/**
 * @typedef {(ctx: ABACContext) => boolean|Promise<boolean>} ABACPolicy
 */

/**
 * 从 Express 请求中构建标准的 ABAC 上下文。
 *
 * @param {import('express').Request} req - Express 请求对象
 * @param {Partial<ABACResource>} [resourceOverrides={}] - 资源覆盖项
 * @param {Partial<ABACEnvironment>} [envOverrides={}] - 环境覆盖项
 * @returns {ABACContext} ABAC 决策上下文
 */
export function buildABACContext(req, resourceOverrides = {}, envOverrides = {}) {
  const userId = req.user?.id || req.tokenPayload?.userId || null
  const role = req.user?.role || req.tokenPayload?.role || null
  const groups = req.user?.groups || req.tokenPayload?.groups || []

  const ip = req.ip
    || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown'

  return {
    subject: {
      userId,
      role,
      groups: Array.isArray(groups) ? groups : [],
      attrs: req.user?.attrs || req.tokenPayload?.attrs || {},
    },
    resource: {
      type: resourceOverrides.type || req.path,
      ownerId: resourceOverrides.ownerId ?? null,
      attrs: resourceOverrides.attrs || {},
    },
    action: req.method?.toUpperCase() || 'UNKNOWN',
    environment: {
      ip,
      time: new Date().toISOString(),
      isTrustedDevice: req.user?.isTrustedDevice || false,
      mfaLevel: req.user?.mfaLevel || 'none',
      extra: envOverrides.extra || {},
      ...envOverrides,
    },
    req,
  }
}

/**
 * 组合多个 ABAC 策略，所有策略必须同时通过（AND 关系）。
 *
 * @param {ABACPolicy[]} policies - 策略数组
 * @returns {ABACPolicy} 组合后的策略
 */
export function allOf(...policies) {
  return async function combinedAllOf(ctx) {
    for (const policy of policies) {
      const result = await Promise.resolve(policy(ctx))
      if (!result) return false
    }
    return true
  }
}

/**
 * 组合多个 ABAC 策略，任一策略通过即可（OR 关系）。
 *
 * @param {ABACPolicy[]} policies - 策略数组
 * @returns {ABACPolicy} 组合后的策略
 */
export function anyOf(...policies) {
  return async function combinedAnyOf(ctx) {
    for (const policy of policies) {
      const result = await Promise.resolve(policy(ctx))
      if (result) return true
    }
    return false
  }
}

/**
 * 取反一个 ABAC 策略。
 *
 * @param {ABACPolicy} policy - 原策略
 * @returns {ABACPolicy} 取反后的策略
 */
export function not(policy) {
  return async function invertedPolicy(ctx) {
    const result = await Promise.resolve(policy(ctx))
    return !result
  }
}

/**
 * 通用 ABAC 策略：仅允许资源所有者。
 *
 * @param {ABACContext} ctx
 * @returns {boolean}
 */
export function allowOwnerOnly(ctx) {
  const ownerId = ctx.resource?.ownerId
  const userId = ctx.subject?.userId
  return Boolean(ownerId && userId && ownerId === userId)
}

/**
 * 通用 ABAC 策略：允许资源所有者或管理员。
 *
 * @param {ABACContext} ctx
 * @returns {boolean}
 */
export function allowOwnOrAdmin(ctx) {
  if (allowOwnerOnly(ctx)) return true
  return ctx.subject?.role === 'admin'
}

/**
 * 通用 ABAC 策略：仅允许指定角色。
 *
 * @param {string|string[]} roles - 允许的角色
 * @returns {ABACPolicy}
 */
export function allowRoles(roles) {
  const allowed = new Set(Array.isArray(roles) ? roles : [roles])
  return function rolePolicy(ctx) {
    return allowed.has(ctx.subject?.role)
  }
}

/**
 * 通用 ABAC 策略：仅允许指定用户组。
 *
 * @param {string|string[]} groups - 允许的用户组
 * @returns {ABACPolicy}
 */
export function allowGroups(groups) {
  const allowed = new Set(Array.isArray(groups) ? groups : [groups])
  return function groupPolicy(ctx) {
    const subjectGroups = ctx.subject?.groups || []
    return subjectGroups.some(g => allowed.has(g))
  }
}

/**
 * 通用 ABAC 策略：仅允许可信设备访问敏感操作。
 *
 * @param {ABACContext} ctx
 * @returns {boolean}
 */
export function requireTrustedDevice(ctx) {
  return ctx.environment?.isTrustedDevice === true
}

/**
 * 通用 ABAC 策略：仅允许已 MFA 验证的用户。
 *
 * @param {ABACContext} ctx
 * @returns {boolean}
 */
export function requireMFA(ctx) {
  const level = ctx.environment?.mfaLevel || 'none'
  return level !== 'none' && level !== null
}

/**
 * 通用 ABAC 策略：限制可执行操作。
 *
 * @param {string|string[]} actions - 允许的操作（HTTP 方法或自定义 action）
 * @returns {ABACPolicy}
 */
export function allowActions(actions) {
  const allowed = new Set(
    (Array.isArray(actions) ? actions : [actions]).map(a => a.toUpperCase()),
  )
  return function actionPolicy(ctx) {
    return allowed.has(ctx.action?.toUpperCase())
  }
}

/**
 * 通用 ABAC 策略：限制来源 IP 必须在白名单内。
 *
 * @param {string[]} allowedIps - 允许的 IP 或 CIDR（当前仅支持精确 IP）
 * @returns {ABACPolicy}
 */
export function allowIps(allowedIps) {
  const allowed = new Set(allowedIps)
  return function ipPolicy(ctx) {
    return allowed.has(ctx.environment?.ip)
  }
}

/**
 * 通用 ABAC 策略：限制只能在指定时间窗口内访问。
 *
 * @param {object} opts
 * @param {number} [opts.startHour=0]
 * @param {number} [opts.endHour=23]
 * @param {number} [opts.dayOfWeek] - 0-6， Sunday=0
 * @returns {ABACPolicy}
 */
export function allowTimeWindow({ startHour = 0, endHour = 23, dayOfWeek } = {}) {
  return function timePolicy(ctx) {
    const now = ctx.environment?.time ? new Date(ctx.environment.time) : new Date()
    if (Number.isNaN(now.getTime())) return false
    const hour = now.getHours()
    if (hour < startHour || hour > endHour) return false
    if (dayOfWeek !== undefined && now.getDay() !== dayOfWeek) return false
    return true
  }
}

/**
 * 评估单个 ABAC 策略。
 *
 * @param {ABACPolicy} policy - 策略函数
 * @param {ABACContext} ctx - 决策上下文
 * @returns {Promise<boolean>} 是否允许
 */
export async function evaluatePolicy(policy, ctx) {
  try {
    return Boolean(await Promise.resolve(policy(ctx)))
  } catch {
    return false
  }
}

/**
 * 生成 ABAC 决策中间件。
 *
 * @param {ABACPolicy|ABACPolicy[]} policies - 策略或策略数组
 * @param {object} [options={}]
 * @param {string} [options.message='访问被拒绝，ABAC 策略校验失败'] - 拒绝提示
 * @param {Partial<ABACResource>} [options.resource={}] - 资源覆盖
 * @param {Partial<ABACEnvironment>} [options.environment={}] - 环境覆盖
 * @returns {import('express').RequestHandler} Express 中间件
 */
export function requireABAC(policies, options = {}) {
  const {
    message = '访问被拒绝，ABAC 策略校验失败',
    resource = {},
    environment = {},
  } = options

  const policyList = Array.isArray(policies) ? policies : [policies]
  const combined = allOf(...policyList)

  return async function abacMiddleware(req, res, next) {
    const ctx = buildABACContext(req, resource, environment)
    const allowed = await evaluatePolicy(combined, ctx)
    if (!allowed) {
      return res.status(403).json({
        success: false,
        code: 'ABAC_DENIED',
        message,
        action: ctx.action,
        resource: ctx.resource.type,
      })
    }
    // 将上下文挂载到请求，供后续字段级守卫使用
    req.abacContext = ctx
    next()
  }
}

/**
 * 生成 ABAC 审计摘要，用于安全日志。
 *
 * @param {ABACContext} ctx - ABAC 上下文
 * @param {boolean} allowed - 决策结果
 * @returns {{id: string, allowed: boolean, subject: ABACSubject, action: string, resource: string, ip: string, timestamp: string}}
 */
export function createABACAuditEntry(ctx, allowed) {
  return {
    id: crypto.randomUUID(),
    allowed,
    subject: {
      userId: ctx.subject?.userId,
      role: ctx.subject?.role,
      groups: ctx.subject?.groups,
    },
    action: ctx.action,
    resource: ctx.resource?.type,
    ip: ctx.environment?.ip,
    timestamp: new Date().toISOString(),
  }
}

/*
 * 使用示例：
 *
 * import {
 *   requireABAC,
 *   allowOwnOrAdmin,
 *   requireTrustedDevice,
 *   requireMFA,
 *   allowActions,
 *   allOf,
 * } from './abac.js'
 *
 * // 允许本人或管理员修改资料
 * app.put('/api/users/:id',
 *   requireABAC([
 *     allowOwnOrAdmin,
 *     allowActions(['PUT', 'PATCH']),
 *   ]),
 *   updateUserHandler
 * )
 *
 * // 敏感操作需要可信设备 + MFA
 * app.post('/api/admin/security-policy',
 *   requireABAC(allOf(allowRoles('admin'), requireTrustedDevice, requireMFA)),
 *   handler
 * )
 */
