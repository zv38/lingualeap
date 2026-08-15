// 蜜罐模块 — 引诱扫描器暴露自身
// 重要：所有蜜罐路径统一返回 404，绝不返回任何伪造数据

const HONEYPOT_PATHS = [
  // 注意：不要放真实端点，否则会被拦截
  // '/api/config' 已转为正式公共配置接口，从蜜罐列表移除
  '/api/debug',          // 调试端点
  '/api/backup',         // 备份文件扫描
  '/api/.env',           // 环境变量泄露
  '/api/sql/test',       // SQL 注入扫描
  '/api/phpmyadmin',     // phpMyAdmin 扫描
  '/api/wp-admin',       // WordPress 扫描
  '/api/admin/users',    // 用户列表
  '/api/debug/env',      // 环境调试
  '/api/.git/config',    // Git 配置泄露
]

function createHoneypotRouter() {
  const router = []

  for (const path of HONEYPOT_PATHS) {
    router.push({
      path,
      handler: (req, res) => {
        // 所有蜜罐路径统一返回 404
        return res.status(404).json({ success: false, message: 'Not Found' })
      }
    })
  }

  return router
}

const honeypotRouter = createHoneypotRouter()

export { honeypotRouter, HONEYPOT_PATHS }