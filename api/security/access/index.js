// ===== 军工级访问控制模块统一导出入口 =====
// 本目录提供 RBAC、ABAC、字段级守卫、动态策略引擎四类访问控制能力。
// 主入口 api/index.js 可直接从各子文件导入，也可通过本文件批量导入。

// RBAC：基于角色的权限控制
export {
  ROLES,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  getRequestRole,
  hasPermission,
  hasRoleLevel,
  requireRole,
  requirePermission,
  requireMinRole,
  getRolePermissions,
  hasResourceAccess,
  createRBACAuditEntry,
} from './rbac.js'

// ABAC：基于属性的动态授权
export {
  buildABACContext,
  allOf,
  anyOf,
  not,
  allowOwnerOnly,
  allowOwnOrAdmin,
  allowRoles,
  allowGroups,
  requireTrustedDevice,
  requireMFA,
  allowActions,
  allowIps,
  allowTimeWindow,
  evaluatePolicy,
  requireABAC,
  createABACAuditEntry,
} from './abac.js'

// Field Level Guard：字段级权限控制
export {
  defineFieldSchema,
  getFieldRule,
  filterFields,
  filterWritableFields,
  filterReadableFields,
  guardRequestFields,
  guardResponseFields,
  applyFieldFilter,
} from './fieldLevelGuard.js'

// Dynamic Policy Engine：动态策略引擎
export {
  DynamicPolicyEngine,
  dynamicPolicyMiddleware,
  getDefaultDynamicRules,
} from './dynamicPolicyEngine.js'
