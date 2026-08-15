// ===== 数据迁移脚本：加密 JSON → SQLite =====
// 运行方式: node scripts/migrate-to-sqlite.js
// 功能：读取加密 JSON 数据文件，迁移到 SQLite 数据库
// 安全：迁移完成后，数据同时存在于 JSON 和 SQLite 中，JSON 文件保留作为备份

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { readEncryptedFile } from '../api/security/privacy/fileVault.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'api', 'data')
const DB_PATH = path.resolve(__dirname, '..', 'api', 'data', 'database.sqlite')

// 进度与统计
const stats = { total: 0, migrated: 0, skipped: 0, errors: [] }

function log(msg, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : '📦'
  console.log(`${prefix} ${msg}`)
}

/**
 * 从加密 JSON 文件中读取数据
 */
async function readEncryptedJSON(filename) {
  const filePath = path.join(DATA_DIR, filename)
  if (!fs.existsSync(filePath)) {
    log(`文件不存在: ${filename}`, 'warn')
    return null
  }
  try {
    const data = await readEncryptedFile(filePath)
    if (data === null) {
      log(`无法解密: ${filename}`, 'warn')
      return null
    }
    return JSON.parse(data)
  } catch (err) {
    log(`读取失败 ${filename}: ${err.message}`, 'error')
    return null
  }
}

/**
 * 将用户数据映射到 SQLite 列名
 */
function mapUserToDB(user) {
  // 字段映射: JSON 字段名 -> SQLite 列名
  const fieldMap = {
    id: 'id',
    username: 'username',
    email: 'email',
    password: 'password',
    avatar: 'avatar',
    level: 'level',
    createdAt: 'created_at',
    xp: 'xp',
    totalXP: 'total_xp',
    streakDays: 'streak_days',
    longestStreak: 'longest_streak',
    dailyGoal: 'daily_goal',
    reminderTime: 'reminder_time',
    theme: 'theme',
    language: 'language',
    membership: 'membership',
    membershipType: 'membership_type',
    membershipBoughtAt: 'membership_bought_at',
    membershipExpiresAt: 'membership_expires_at',
    role: 'role',
    twoFactorEnabled: 'two_factor_enabled',
    adminTotpEnabled: 'admin_totp_enabled',
  }

  const row = {}
  for (const [jsonField, dbField] of Object.entries(fieldMap)) {
    let val = user[jsonField]
    if (val === undefined || val === null) {
      // 设置默认值
      switch (dbField) {
        case 'followers':
        case 'following': val = '[]'; break
        case 'two_factor_enabled':
        case 'admin_totp_enabled': val = 0; break
        default: val = null
      }
    }
    // 数组/对象序列化
    if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
      val = JSON.stringify(val)
    }
    // 布尔转整数
    if (typeof val === 'boolean') val = val ? 1 : 0
    row[dbField] = val
  }

  // 处理 followers/following
  if (!row.followers) row.followers = JSON.stringify(user.followers || [])
  if (!row.following) row.following = JSON.stringify(user.following || [])

  row.updated_at = new Date().toISOString()
  return row
}

/**
 * 将 Bug 报告数据映射到 SQLite 列名
 */
function mapBugReportToDB(report) {
  const fieldMap = {
    id: 'id',
    incidentId: 'incident_id',
    title: 'title',
    description: 'description',
    category: 'category',
    severity: 'severity',
    status: 'status',
    email: 'email',
    browserInfo: 'browser_info',
    screenshots: 'screenshots',
    videoUrl: 'video_url',
    videoMeta: 'video_meta',
    autoDetected: 'auto_detected',
    context: 'context',
    type: 'type',
    url: 'url',
    userId: 'user_id',
    username: 'username',
    aiAnalysis: 'ai_analysis',
    adminResponse: 'admin_response',
    createdAt: 'created_at',
  }

  const row = {}
  for (const [jsonField, dbField] of Object.entries(fieldMap)) {
    let val = report[jsonField]
    if (val === undefined || val === null) {
      val = dbField === 'auto_detected' ? 0 : null
    }
    if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
      val = JSON.stringify(val)
    }
    if (typeof val === 'boolean') val = val ? 1 : 0
    row[dbField] = val
  }
  row.updated_at = new Date().toISOString()
  return row
}

/**
 * 将调查问卷数据映射
 */
function mapSurveyToDB(survey) {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description || '',
    questions: typeof survey.questions === 'string' ? survey.questions : JSON.stringify(survey.questions || []),
    start_time: survey.startTime || survey.start_time || null,
    end_time: survey.endTime || survey.end_time || null,
    status: survey.status || 'draft',
    created_by: survey.createdBy || survey.created_by || null,
    created_at: survey.createdAt || survey.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * 将问卷回答数据映射
 */
function mapSurveyResponseToDB(response) {
  return {
    id: response.id,
    survey_id: response.surveyId || response.survey_id,
    user_id: response.userId || response.user_id || null,
    answers: typeof response.answers === 'string' ? response.answers : JSON.stringify(response.answers || []),
    submitted_at: response.submittedAt || response.submitted_at || response.createdAt || new Date().toISOString(),
  }
}

/**
 * 将通知数据映射
 */
function mapNotificationToDB(notif) {
  return {
    id: notif.id,
    user_id: notif.userId || notif.user_id,
    type: notif.type || 'info',
    title: notif.title,
    message: notif.message || '',
    data: notif.data ? (typeof notif.data === 'string' ? notif.data : JSON.stringify(notif.data)) : null,
    read: notif.read ? 1 : 0,
    created_at: notif.createdAt || notif.created_at || new Date().toISOString(),
  }
}

/**
 * 将已吊销 Token 数据映射
 */
function mapRevokedTokenToDB(token) {
  return {
    token_hash: token.tokenHash || token.token_hash || token.token,
    user_id: token.userId || token.user_id || null,
    reason: token.reason || null,
    revoked_at: token.revokedAt || token.revoked_at || new Date().toISOString(),
  }
}

/**
 * 执行迁移
 */
async function migrate() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║    加密 JSON → SQLite 数据库迁移工具    ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log()

  // 初始化 SQLite
  const { initDatabase, bulkInsert, getDBStats, closeDatabase } = await import('../api/database/db.js')
  await initDatabase()
  log('SQLite 数据库已就绪')

  // ===== 1. 迁移用户数据 =====
  log('\n--- 迁移用户数据 ---')
  const users = await readEncryptedJSON('users.json')
  if (users && Array.isArray(users)) {
    stats.total += users.length
    const rows = users.map(mapUserToDB)
    bulkInsert('users', rows)
    stats.migrated += rows.length
    log(`迁移 ${rows.length} 个用户`)
  } else {
    log('无用户数据可迁移', 'warn')
    stats.skipped++
  }

  // ===== 2. 迁移 Bug 报告 =====
  log('\n--- 迁移 Bug 报告 ---')
  const bugReports = await readEncryptedJSON('bug-reports.json')
  if (bugReports && Array.isArray(bugReports)) {
    stats.total += bugReports.length
    const rows = bugReports.map(mapBugReportToDB)
    bulkInsert('bug_reports', rows)
    stats.migrated += rows.length
    log(`迁移 ${rows.length} 条 Bug 报告`)
  } else {
    log('无 Bug 报告数据可迁移', 'warn')
    stats.skipped++
  }

  // ===== 3. 迁移调查问卷 =====
  log('\n--- 迁移调查问卷 ---')
  const surveys = await readEncryptedJSON('surveys.json')
  if (surveys && Array.isArray(surveys)) {
    stats.total += surveys.length
    const rows = surveys.map(mapSurveyToDB)
    bulkInsert('surveys', rows)
    stats.migrated += rows.length
    log(`迁移 ${rows.length} 份调查问卷`)
  } else {
    log('无调查问卷数据可迁移', 'warn')
    stats.skipped++
  }

  // ===== 4. 迁移问卷回答 =====
  log('\n--- 迁移问卷回答 ---')
  const surveyResponses = await readEncryptedJSON('survey-responses.json')
  if (surveyResponses && Array.isArray(surveyResponses)) {
    stats.total += surveyResponses.length
    const rows = surveyResponses.map(mapSurveyResponseToDB)
    bulkInsert('survey_responses', rows)
    stats.migrated += rows.length
    log(`迁移 ${rows.length} 条问卷回答`)
  } else {
    log('无问卷回答数据可迁移', 'warn')
    stats.skipped++
  }

  // ===== 5. 迁移通知 =====
  log('\n--- 迁移通知 ---')
  const notifications = await readEncryptedJSON('notifications.json')
  if (notifications && Array.isArray(notifications)) {
    stats.total += notifications.length
    const rows = notifications.map(mapNotificationToDB)
    bulkInsert('notifications', rows)
    stats.migrated += rows.length
    log(`迁移 ${rows.length} 条通知`)
  } else {
    log('无通知数据可迁移', 'warn')
    stats.skipped++
  }

  // ===== 6. 迁移已吊销 Token =====
  log('\n--- 迁移已吊销 Token ---')
  const revokedTokens = await readEncryptedJSON('revoked-tokens.json')
  if (revokedTokens && Array.isArray(revokedTokens)) {
    stats.total += revokedTokens.length
    const rows = revokedTokens.map(mapRevokedTokenToDB)
    bulkInsert('revoked_tokens', rows)
    stats.migrated += rows.length
    log(`迁移 ${rows.length} 条已吊销 Token`)
  } else {
    log('无已吊销 Token 数据可迁移', 'warn')
    stats.skipped++
  }

  // ===== 迁移完成 =====
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║             迁移完成报告                 ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`  总计处理: ${stats.total} 条`)
  console.log(`  成功迁移: ${stats.migrated} 条`)
  console.log(`  跳过: ${stats.skipped} 项`)
  if (stats.errors.length > 0) {
    console.log(`  错误: ${stats.errors.length} 个`)
    stats.errors.forEach(e => console.log(`    - ${e}`))
  }

  // 数据库统计
  const dbStats = getDBStats()
  console.log(`\n📊 数据库统计:`)
  console.log(`  文件路径: ${DB_PATH}`)
  console.log(`  文件大小: ${dbStats.fileSizeKB} KB`)
  console.log(`  总行数: ${dbStats.totalRows}`)
  console.log(`  表结构:`)
  dbStats.tables.forEach(t => {
    if (t.name !== 'schema_version') {
      console.log(`    ${t.name}: ${t.rowCount} 行`)
    }
  })

  console.log('\n✅ 迁移完成！JSON 文件已保留作为备份。')
  console.log('📝 注意: 重启 API 服务器后，数据将从 SQLite 加载。')

  closeDatabase()
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err.message)
  process.exit(1)
})