// ===== 欺骗响应模板 =====
// 提供可复用的假数据模板，用于误导攻击者

export const DECEPTION_TEMPLATES = {
  source_code: (path) => ({
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `// Internal module - auto-generated stub
export function check() {
  return { safe: true, reason: "environment check disabled" }
}
// ${path}`,
  }),

  admin_users: () => ({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      data: [
        { id: 'decoy-1', username: 'admin', role: 'admin', email: 'decoy@example.com' },
        { id: 'decoy-2', username: 'support', role: 'moderator', email: 'support@example.com' },
      ],
    }),
  }),

  config_backup: () => ({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      database: { host: '10.0.0.99', port: 5432, name: 'decoy_db' },
      jwt_secret_hint: 'DECOY_DO_NOT_USE_12345',
    }),
  }),

  login_failure: () => ({
    status: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: false, message: '用户名或密码错误' }),
  }),

  rate_degrade: () => ({
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
    body: JSON.stringify({ success: false, message: '服务暂时不可用，请稍后重试' }),
  }),
}

export function pickTemplate(context, decision) {
  const path = (context.path || '').toLowerCase()
  if (path.includes('/src/') || path.includes('/scripts/') || path.includes('/.env')) {
    return DECEPTION_TEMPLATES.source_code(context.path)
  }
  if (path.includes('/admin/users') || path.includes('/api/admin/users')) {
    return DECEPTION_TEMPLATES.admin_users()
  }
  if (path.includes('backup') || path.includes('config')) {
    return DECEPTION_TEMPLATES.config_backup()
  }
  if (path.includes('/login') || path.includes('/auth')) {
    return DECEPTION_TEMPLATES.login_failure()
  }
  return DECEPTION_TEMPLATES.rate_degrade()
}
