import crypto from 'crypto'

/**
 * 军工级基于角色的访问控制（RBAC）模块。
 *
 * 提供角色定义、权限层级、角色校验中间件与工具函数。
 * 所有角色与权限映射均为运行时只读，防止运行中被篡改。
 *
 * @example
 * // 在 Express 路由中使用：
 * import { requireRole, requirePermission, ROLES } from './security/access/rbac.js'
 *
 * app.get('/api/admin/users', requireRole([ROLES.admin, ROLES.moderator]), (req, res) => { ... })
 * app.delete('/api/admin/user/:id', requirePermission('user:delete'), (req, res) => { ... })
 */

/** @typedef {string} Role */

/**
 * 预定义系统角色。
 * @readonly
 * @enum {Role}
 */
export const ROLES = Object.freeze({
  admin: 'admin',
  moderator: 'moderator',
  user: 'user',
  guest: 'guest',
})

/**
 * 角色层级权重，数值越高权限越大。
 * @readonly
 * @type {Record<Role, number>}
 */
export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.guest]: 0,
  [ROLES.user]: 1,
  [ROLES.moderator]: 2,
  [ROLES.admin]: 3,
})

/**
 * 角色到权限集合的映射。
 * @readonly
 * @type {Record<Role, ReadonlySet<string>>}
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.guest]: Object.freeze(new Set(['content:read', 'public:read'])),
  [ROLES.user]: Object.freeze(new Set([
    'content:read',
    'public:read',
    'profile:read',
    'profile:update',
    'course:read',
    'course:enroll',
  ])),
  [ROLES.moderator]: Object.freeze(new Set([
    'content:read',
    'public:read',
    'profile:read',
    'profile:update',
    'course:read',
    'course:enroll',
    'content:moderate',
    'user:warn',
  ])),
  [ROLES.admin]: Object.freeze(new Set([
    '*:*',
    'content:read',
    'public:read',
    'profile:read',
    'profile:update',
    'profile:delete',
    'course:read',
    'course:enroll',
    'course:manage',
    'content:moderate',
    'user:read',
    'user:update',
    'user:delete',
    'user:warn',
    'security:audit',
    'security:policy',
  ])),
})

/**
 * 从请求对象中提取当前用户的角色。
 * 兼容 `req.user.role`、`req.tokenPayload.role` 以及 `req.headers['x-role']`（仅当显式开启）。
 *
 * 安全加固：X-Role 请求头可被任意客户端伪造，若仅凭 NODE_ENV!==production 就信任，
 * 一旦新路由只挂 RBAC 忘挂认证即直接提权。因此改为双保险：
 *   1. 必须显式设置 X_ROLE_DEV=true 环境变量（默认关闭，开发调试按需开启）；
 *   2. 且仅当 X-Role 落在 ROLE_HIERARCHY 白名单内才生效。
 *
 * @param {import('express').Request} req - Express 请求对象
 * @returns {Role|null} 用户角色，未找到时返回 null
 */
export function getRequestRole(req) {
  const role = req.user?.role || req.tokenPayload?.role
  if (role && typeof role === 'string' && ROLE_HIERARCHY[role] !== undefined) {
    return role
  }
  if (process.env.X_ROLE_DEV === 'true') {
    const devRole = req.headers['x-role']
    if (devRole && typeof devRole === 'string' && ROLE_HIERARCHY[devRole] !== undefined) {
      return devRole
    }
  }
  return null
}

/**
 * 判断指定角色是否拥有指定权限。
 *
 * @param {Role} role - 角色标识
 * @param {string} permission - 权限标识，格式通常为 `<resource>:<action>`
 * @returns {boolean} 是否拥有权限
 */
export function hasPermission(role, permission) {
  if (!role || typeof role !== 'string') return false
  const permissions = ROLE_PERMISSIONS[role]
  if (!permissions) return false
  if (permissions.has('*:*')) return true
  if (permissions.has(permission)) return true
  // 支持通配资源匹配，如 `user:*`
  const [resource] = permission.split(':')
  if (resource && permissions.has(`${resource}:*`)) return true
  return false
}

/**
 * 判断指定角色是否满足最低角色层级要求。
 *
 * @param {Role} role - 当前角色
 * @param {Role} minRole - 最低要求角色
 * @returns {boolean} 是否满足层级
 */
export function hasRoleLevel(role, minRole) {
  if (!role || !minRole) return false
  return (ROLE_HIERARCHY[role] ?? -1) >= (ROLE_HIERARCHY[minRole] ?? Number.MAX_SAFE_INTEGER)
}

/**
 * 校验用户是否属于给定角色之一。
 * 空角色列表默认拒绝。
 *
 * @param {Role[]} allowedRoles - 允许的角色数组
 * @param {string} [message='访问被拒绝，角色权限不足'] - 拒绝提示
 * @returns {import('express').RequestHandler} Express 中间件
 */
export function requireRole(allowedRoles, message = '访问被拒绝，角色权限不足') {
  const allowedSet = new Set(allowedRoles)
  return function rbacRoleMiddleware(req, res, next) {
    const role = getRequestRole(req)
    if (!role || !allowedSet.has(role)) {
      return res.status(403).json({
        success: false,
        code: 'RBAC_ROLE_DENIED',
        message,
        requiredRoles: Array.from(allowedSet),
        currentRole: role,
      })
    }
    next()
  }
}

/**
 * 校验用户是否拥有指定权限之一。
 *
 * @param {string|string[]} permissions - 要求的权限，支持单个权限或权限数组
 * @param {string} [message='访问被拒绝，缺少必要权限'] - 拒绝提示
 * @returns {import('express').RequestHandler} Express 中间件
 */
export function requirePermission(permissions, message = '访问被拒绝，缺少必要权限') {
  const required = Array.isArray(permissions) ? permissions : [permissions]
  return function rbacPermissionMiddleware(req, res, next) {
    const role = getRequestRole(req)
    if (!role) {
      return res.status(403).json({
        success: false,
        code: 'RBAC_ROLE_MISSING',
        message: '无法识别用户角色',
      })
    }
    const granted = required.some(p => hasPermission(role, p))
    if (!granted) {
      return res.status(403).json({
        success: false,
        code: 'RBAC_PERMISSION_DENIED',
        message,
        requiredPermissions: required,
        currentRole: role,
      })
    }
    next()
  }
}

/**
 * 校验用户是否达到最低角色层级。
 *
 * @param {Role} minRole - 最低角色
 * @param {string} [message='访问被拒绝，角色层级不足'] - 拒绝提示
 * @returns {import('express').RequestHandler} Express 中间件
 */
export function requireMinRole(minRole, message = '访问被拒绝，角色层级不足') {
  return function rbacMinRoleMiddleware(req, res, next) {
    const role = getRequestRole(req)
    if (!role || !hasRoleLevel(role, minRole)) {
      return res.status(403).json({
        success: false,
        code: 'RBAC_LEVEL_DENIED',
        message,
        requiredRole: minRole,
        currentRole: role,
      })
    }
    next()
  }
}

/**
 * 获取指定角色的全部权限列表。
 *
 * @param {Role} role - 角色
 * @returns {string[]} 权限数组，角色无效时返回空数组
 */
export function getRolePermissions(role) {
  if (!role || !ROLE_PERMISSIONS[role]) return []
  return Array.from(ROLE_PERMISSIONS[role])
}

/**
 * 判断用户是否拥有指定资源的所有操作权限（admin 通配默认 true）。
 *
 * @param {Role} role - 角色
 * @param {string} resource - 资源标识
 * @returns {boolean} 是否拥有该资源全部操作权限
 */
export function hasResourceAccess(role, resource) {
  if (!role || !resource) return false
  const permissions = ROLE_PERMISSIONS[role]
  if (!permissions) return false
  return permissions.has('*:*') || permissions.has(`${resource}:*`)
}

/**
 * 生成 RBAC 审计摘要，用于安全日志。
 * 返回对象中不包含敏感数据。
 *
 * @param {import('express').Request} req - Express 请求对象
 * @param {string} action - 操作描述
 * @returns {{id: string, role: Role|null, action: string, path: string, timestamp: string}}
 */
export function createRBACAuditEntry(req, action) {
  return {
    id: crypto.randomUUID(),
    role: getRequestRole(req),
    action,
    path: req.originalUrl || req.path,
    timestamp: new Date().toISOString(),
  }
}

/*
 * 使用示例：
 *
 * import { requireRole, requirePermission, requireMinRole, ROLES } from './rbac.js'
 *
 * // 仅管理员可访问
 * app.get('/api/admin/dashboard', requireRole([ROLES.admin]), handler)
 *
 * // 管理员或版主
 * app.get('/api/admin/reports', requireRole([ROLES.admin, ROLES.moderator]), handler)
 *
 * // 拥有任意指定权限即可
 * app.delete('/api/admin/user/:id', requirePermission(['user:delete', '*:*']), handler)
 *
 * // 至少 moderator 层级
 * app.patch('/api/admin/content', requireMinRole(ROLES.moderator), handler)
 */
