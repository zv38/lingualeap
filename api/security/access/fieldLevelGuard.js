import { getRequestRole } from './rbac.js'

/**
 * 军工级字段级访问控制模块。
 *
 * 支持按角色定义字段可读/可写白名单与黑名单，
 * 在请求进入时过滤非法写入字段，在响应离开时过滤不可见字段。
 *
 * @example
 * import { guardResponseFields, guardRequestFields } from './security/access/fieldLevelGuard.js'
 *
 * const userSchema = defineFieldSchema({
 *   admin: { read: ['*'], write: ['*'] },
 *   user: { read: ['id', 'name', 'email', 'avatar'], write: ['name', 'avatar'] },
 *   guest: { read: ['id', 'name'], write: [] },
 * })
 *
 * app.get('/api/users/:id', guardResponseFields(userSchema), handler)
 * app.patch('/api/users/:id', guardRequestFields(userSchema), handler)
 */

/**
 * @typedef {object} FieldRule
 * @property {string[]} [read] - 可读字段列表，`*` 表示全部
 * @property {string[]} [write] - 可写字段列表，`*` 表示全部
 * @property {string[]} [readBlacklist] - 可读字段黑名单（优先于白名单）
 * @property {string[]} [writeBlacklist] - 可写字段黑名单（优先于白名单）
 */

/**
 * @typedef {Record<string, FieldRule>} FieldSchema
 */

/**
 * 定义字段级访问模式。未声明的角色继承默认规则（默认无读写权限）。
 *
 * @param {FieldSchema} schema - 角色到字段规则的映射
 * @param {FieldRule} [defaultRule] - 未匹配角色时的默认规则
 * @returns {{schema: FieldSchema, defaultRule: FieldRule}} 冻结后的模式定义
 */
export function defineFieldSchema(schema, defaultRule = { read: [], write: [] }) {
  return Object.freeze({
    schema: Object.freeze({ ...schema }),
    defaultRule: Object.freeze({ ...defaultRule }),
  })
}

/**
 * 获取角色对应的字段规则。
 *
 * @param {{schema: FieldSchema, defaultRule: FieldRule}} fieldSchema
 * @param {string|null} role - 角色
 * @returns {FieldRule} 字段规则
 */
export function getFieldRule(fieldSchema, role) {
  if (!role) return fieldSchema.defaultRule
  return fieldSchema.schema[role] || fieldSchema.defaultRule
}

/**
 * 判断字段列表是否包含通配符 `*`。
 *
 * @param {string[]|undefined} fields
 * @returns {boolean}
 */
function isWildcard(fields) {
  return Array.isArray(fields) && fields.includes('*')
}

/**
 * 根据规则过滤对象字段。
 *
 * @param {Record<string, any>} data - 原始数据
 * @param {string[]|undefined} whitelist - 白名单
 * @param {string[]|undefined} blacklist - 黑名单
 * @param {boolean} [allowWildcard=true] - 是否允许 `*` 通配
 * @returns {Record<string, any>} 过滤后的数据
 */
export function filterFields(data, whitelist, blacklist, allowWildcard = true) {
  if (data === null || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    return data.map(item => filterFields(item, whitelist, blacklist, allowWildcard))
  }

  const blackSet = new Set(blacklist || [])
  const whiteSet = new Set(whitelist || [])
  const useWildcard = allowWildcard && isWildcard(whitelist)

  const result = {}
  for (const key of Object.keys(data)) {
    if (blackSet.has(key)) continue
    if (useWildcard || whiteSet.has(key)) {
      const value = data[key]
      result[key] = typeof value === 'object' && value !== null
        ? filterFields(value, whitelist, blacklist, allowWildcard)
        : value
    }
  }
  return result
}

/**
 * 过滤对象中的可写字段。
 *
 * @param {Record<string, any>} data - 客户端提交的数据
 * @param {FieldRule} rule - 字段规则
 * @returns {Record<string, any>} 过滤后的写入数据
 */
export function filterWritableFields(data, rule) {
  if (isWildcard(rule.write)) {
    if (!rule.writeBlacklist?.length) return data
    return filterFields(data, undefined, rule.writeBlacklist)
  }
  return filterFields(data, rule.write, undefined)
}

/**
 * 过滤对象中的可读字段。
 *
 * @param {Record<string, any>} data - 待响应的数据
 * @param {FieldRule} rule - 字段规则
 * @returns {Record<string, any>} 过滤后的响应数据
 */
export function filterReadableFields(data, rule) {
  if (isWildcard(rule.read)) {
    if (!rule.readBlacklist?.length) return data
    return filterFields(data, undefined, rule.readBlacklist)
  }
  return filterFields(data, rule.read, undefined)
}

/**
 * 生成请求字段过滤中间件（限制可写字段）。
 * 通常用于 `POST` / `PUT` / `PATCH` 请求，防止用户写入无权限字段。
 *
 * @param {{schema: FieldSchema, defaultRule: FieldRule}} fieldSchema
 * @param {object} [options={}]
 * @param {string} [options.bodyKey='body'] - 请求体字段名
 * @param {string} [options.message='请求包含无权限修改的字段'] - 拒绝提示
 * @param {boolean} [options.strip=false] - 为 true 时直接剔除非法字段；为 false 时遇到非法字段拒绝请求
 * @returns {import('express').RequestHandler} Express 中间件
 */
export function guardRequestFields(fieldSchema, options = {}) {
  const {
    bodyKey = 'body',
    message = '请求包含无权限修改的字段',
    strip = false,
  } = options

  return function requestFieldMiddleware(req, res, next) {
    const role = getRequestRole(req)
    const rule = getFieldRule(fieldSchema, role)
    const data = req[bodyKey]

    if (data === undefined || data === null) {
      return next()
    }

    if (strip) {
      req[bodyKey] = filterWritableFields(data, rule)
      return next()
    }

    const allowed = new Set(rule.write || [])
    const blackSet = new Set(rule.writeBlacklist || [])
    const allowAll = isWildcard(rule.write)

    const invalidKeys = []
    for (const key of Object.keys(data)) {
      if (blackSet.has(key)) {
        invalidKeys.push(key)
        continue
      }
      if (!allowAll && !allowed.has(key)) {
        invalidKeys.push(key)
      }
    }

    if (invalidKeys.length > 0) {
      return res.status(403).json({
        success: false,
        code: 'FIELD_WRITE_DENIED',
        message,
        invalidFields: invalidKeys,
        role,
      })
    }

    next()
  }
}

/**
 * 生成响应字段过滤中间件（限制可读字段）。
 * 拦截 `res.json` 调用，在数据序列化前按角色过滤字段。
 *
 * @param {{schema: FieldSchema, defaultRule: FieldRule}} fieldSchema
 * @param {object} [options={}]
 * @param {boolean} [options.passthrough=false] - 为 true 时不重写 res.json，仅在 req 上挂载过滤后的结果
 * @returns {import('express').RequestHandler} Express 中间件
 */
export function guardResponseFields(fieldSchema, options = {}) {
  const { passthrough = false } = options

  return function responseFieldMiddleware(req, res, next) {
    const role = getRequestRole(req)
    const rule = getFieldRule(fieldSchema, role)

    if (passthrough) {
      req.fieldFilterRule = rule
      return next()
    }

    const originalJson = res.json.bind(res)
    res.json = function filteredJson(data) {
      res.json = originalJson
      const filtered = filterReadableFields(data, rule)
      return originalJson(filtered)
    }

    next()
  }
}

/**
 * 手动对任意数据按角色进行字段过滤，适用于服务端业务逻辑内部。
 *
 * @param {Record<string, any>} data - 原始数据
 * @param {string|null} role - 角色
 * @param {{schema: FieldSchema, defaultRule: FieldRule}} fieldSchema
 * @param {'read'|'write'} mode - 过滤模式
 * @returns {Record<string, any>} 过滤后的数据
 */
export function applyFieldFilter(data, role, fieldSchema, mode = 'read') {
  const rule = getFieldRule(fieldSchema, role)
  return mode === 'write'
    ? filterWritableFields(data, rule)
    : filterReadableFields(data, rule)
}

/*
 * 使用示例：
 *
 * import {
 *   defineFieldSchema,
 *   guardRequestFields,
 *   guardResponseFields,
 *   applyFieldFilter,
 * } from './fieldLevelGuard.js'
 *
 * const userSchema = defineFieldSchema({
 *   admin: { read: ['*'], write: ['*'] },
 *   moderator: {
 *     read: ['id', 'name', 'email', 'role', 'status', 'createdAt'],
 *     write: ['status'],
 *   },
 *   user: {
 *     read: ['id', 'name', 'email', 'avatar'],
 *     write: ['name', 'avatar'],
 *   },
 *   guest: {
 *     read: ['id', 'name'],
 *     write: [],
 *   },
 * })
 *
 * // 限制写入字段
 * app.patch('/api/users/:id', guardRequestFields(userSchema), updateUser)
 *
 * // 限制响应字段
 * app.get('/api/users/:id', guardResponseFields(userSchema), getUser)
 *
 * // 服务端手动过滤
 * const publicProfile = applyFieldFilter(user, req.user?.role, userSchema, 'read')
 */
