import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { protectIp, maskIp, revealIp } from '../privacy/adminPrivacyVault.js';
import { appendAuditRecord, readAuditChain } from '../audit/appendOnlyStore.js';
import { appendToRemoteBatch } from '../audit/remoteSignature.js';
import { computeAuditHash, GENESIS_HASH } from '../audit/chainIntegrity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_MEMORY_LOGS = 10000;
const MAX_AUDIT_FILE_LOGS = 2000;
const SECURITY_DIR = path.resolve('.security');
const AUDIT_FILE = path.join(SECURITY_DIR, 'audit-log.json');
const SQLITE_DB_FILE = path.resolve(process.env.AUDIT_SQLITE_PATH || 'data/audit-log.sqlite');
const SQLITE_SAVE_INTERVAL_MS = Number(process.env.AUDIT_SQLITE_SAVE_INTERVAL_MS || 30000);

const memoryAuditLog = [];
let sqliteDB = null;
let sqliteEnabled = false;
let sqliteDirty = false;
let sqliteSaveTimer = null;
const chainState = { lastHash: GENESIS_HASH };

// 可信代理列表：仅信任来自这些 IP 的 X-Forwarded-For 头
// 生产环境通过 TRUSTED_PROXY_IPS 环境变量扩展，例如：
// TRUSTED_PROXY_IPS=10.0.0.1,10.0.0.2,172.16.0.0/12
const DEFAULT_TRUSTED_PROXIES = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']
const ENV_PROXIES = (process.env.TRUSTED_PROXY_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
const TRUSTED_PROXIES = new Set([...DEFAULT_TRUSTED_PROXIES, ...ENV_PROXIES])

// 验证 IPv4/IPv6 地址格式是否合法
function isValidIP(ip) {
  if (!ip || ip === 'unknown') return false
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split('.').every(octet => parseInt(octet, 10) <= 255)
  }
  // IPv6 (简化校验)
  if (/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(ip)) return true
  // IPv6 mapped IPv4
  if (/^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/i.test(ip)) return true
  return false
}

function normalizeIP(ip) {
  if (!ip) return ip
  if (ip === '::1') return '127.0.0.1'
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

function isTrustedProxy(ip) {
  const normalized = normalizeIP(ip)
  if (!normalized) return false
  return TRUSTED_PROXIES.has(normalized)
}

export function getClientIP(req) {
  // 安全规范：getClientIP 用于安全决策与审计。
  // 默认只使用直接连接 IP，不可信任可被客户端伪造的 X-Forwarded-For。
  // 但当直连对端是可信反向代理（本机或 TRUSTED_PROXY_IPS 配置）时，
  // 从 X-Forwarded-For / X-Real-IP 提取真实客户端 IP，避免反代后全员共享一桶。
  const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
  const directIP = normalizeIP(remoteAddr)

  if (isTrustedProxy(directIP)) {
    const xff = req.headers?.['x-forwarded-for']
    if (typeof xff === 'string') {
      const hops = xff.split(',').map(v => normalizeIP(v.trim())).filter(isValidIP)
      // 从右往左取第一个非可信代理 IP（跳过更多可信代理跳数）
      for (let i = hops.length - 1; i >= 0; i--) {
        if (!isTrustedProxy(hops[i]) && hops[i] !== directIP) return hops[i]
      }
    }
    const xri = req.headers?.['x-real-ip']
    if (xri && isValidIP(normalizeIP(xri)) && !isTrustedProxy(normalizeIP(xri))) {
      return normalizeIP(xri)
    }
  }

  return directIP
}

async function initSQLite() {
  try {
    const sqlJsModule = await import('sql.js');
    const initSqlJs = sqlJsModule.default || sqlJsModule;
    const SQL = await initSqlJs();

    let buffer = null;
    try {
      if (fs.existsSync(SQLITE_DB_FILE)) {
        buffer = fs.readFileSync(SQLITE_DB_FILE);
      }
    } catch {}

    sqliteDB = buffer ? new SQL.Database(buffer) : new SQL.Database();

    sqliteDB.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        ip TEXT,
        ip_hash TEXT,
        ip_encrypted TEXT,
        details TEXT,
        success INTEGER NOT NULL DEFAULT 1,
        timestamp TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        previous_hash TEXT,
        record_hash TEXT
      )
    `);

    // 兼容旧表：动态添加隐私保护字段（列已存在时会报错，忽略即可）
    try {
      sqliteDB.run('ALTER TABLE audit_logs ADD COLUMN ip_hash TEXT');
    } catch {}
    try {
      sqliteDB.run('ALTER TABLE audit_logs ADD COLUMN ip_encrypted TEXT');
    } catch {}
    try {
      sqliteDB.run('ALTER TABLE audit_logs ADD COLUMN previous_hash TEXT');
    } catch {}
    try {
      sqliteDB.run('ALTER TABLE audit_logs ADD COLUMN record_hash TEXT');
    } catch {}

    sqliteDB.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)
    `);
    sqliteDB.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)
    `);
    sqliteDB.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)
    `);
    sqliteDB.run(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_hash ON audit_logs(ip_hash)
    `);

    sqliteEnabled = true;
    console.log('[AuditLogger] SQLite 审计日志已启用:', SQLITE_DB_FILE);
    return true;
  } catch (err) {
    console.warn('[AuditLogger] SQLite 初始化失败，已降级为内存+JSON:', err.message);
    sqliteEnabled = false;
    sqliteDB = null;
    return false;
  }
}

function saveSQLite() {
  if (!sqliteEnabled || !sqliteDB || !sqliteDirty) return;
  try {
    const dir = path.dirname(SQLITE_DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = sqliteDB.export();
    fs.writeFileSync(SQLITE_DB_FILE, Buffer.from(data));
    sqliteDirty = false;
  } catch (err) {
    console.warn('[AuditLogger] SQLite 持久化失败:', err.message);
  }
}

function scheduleSQLiteSave() {
  if (!sqliteEnabled || sqliteSaveTimer) return;
  sqliteSaveTimer = setInterval(() => {
    saveSQLite();
  }, SQLITE_SAVE_INTERVAL_MS);
}

function stopSQLiteSave() {
  if (sqliteSaveTimer) {
    clearInterval(sqliteSaveTimer);
    sqliteSaveTimer = null;
  }
}

function normalizeLogArgs(...args) {
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    return args[0];
  }
  if (args.length >= 2) {
    return {
      userId: args[0],
      action: args[1],
      ...(args[2] || {}),
    };
  }
  return args[0] || {};
}

export function logAudit(...args) {
  const { userId, action, ip, details, success, req } = normalizeLogArgs(...args);
  const rawClientIP = ip || (req ? getClientIP(req) : 'unknown');
  const ipProtected = protectIp(rawClientIP);
  const maskedIP = maskIp(rawClientIP);
  const timestamp = new Date().toISOString();
  const record = {
    id: 'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    userId: userId || null,
    action,
    ip: maskedIP,
    ipHash: ipProtected.hash,
    ipEncrypted: ipProtected.encrypted,
    details: details || '',
    success: success !== false,
    timestamp,
  };
  record.previousHash = chainState.lastHash;
  record.hash = computeAuditHash(record, record.previousHash);
  chainState.lastHash = record.hash;

  // ===== 控制台实时输出：详细安全事件日志 =====
  const statusIcon = record.success ? '✅' : '❌';
  const detailStr = typeof record.details === 'string' ? record.details : JSON.stringify(record.details);

  // 解析详情对象，提取关键字段
  let detailObj = record.details
  if (typeof detailObj === 'string') {
    try { detailObj = JSON.parse(detailObj) } catch { detailObj = {} }
  }

  // 根据事件类型确定颜色和标签
  const ESC = '\x1b';
  const RESET = `${ESC}[0m`;
  const BOLD = `${ESC}[1m`;
  const DIM = `${ESC}[2m`;
  const _green = `${ESC}[32m`;
  const _yellow = `${ESC}[33m`;
  const _red = `${ESC}[31m`;
  const _cyan = `${ESC}[36m`;
  const _magenta = `${ESC}[35m`;
  const _blue = `${ESC}[34m`;
  const _gray = `${ESC}[90m`;
  const _white = `${ESC}[37m`;
  const _bgRed = `${ESC}[41m`;
  const _bgYellow = `${ESC}[43m`;

  // 判断事件严重级别
  const isBlock = action.includes('block') || action.includes('BLOCK') || action.includes('violation')
  const isWarn = action.includes('warn') || action.includes('WARN') || action.includes('risk') || action.includes('RISK')
  const isInfo = !isBlock && !isWarn
  const severityColor = isBlock ? _red : isWarn ? _yellow : _cyan
  const severityLabel = isBlock ? '■ 拦截' : isWarn ? '▲ 警告' : '● 信息'
  const bgColor = isBlock ? _bgRed : isWarn ? _bgYellow : ''

  // 提取详情中的关键信息
  const detailType = detailObj?.type || ''
  const detailMessage = detailObj?.message || detailObj?.detail || detailObj?.reason || ''
  const detailScore = detailObj?.score !== undefined ? ` 评分:${detailObj.score}` : ''
  const detailPath = detailObj?.path || ''
  const detailMethod = detailObj?.method || ''
  const detailSerious = detailObj?.serious ? ' [严重]' : ''

  // 格式化时间（本地时间）
  const localTime = new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })

  // 第一行：事件头部（带颜色和图标）
  const headerLine = `${bgColor}${_white} ${severityLabel} ${RESET} ${severityColor}${BOLD}${action}${RESET} ${DIM}${localTime}${RESET}`

  // 第二行：详情（如果有）
  const detailLine = []
  if (detailType) detailLine.push(`  类型: ${detailType}${detailSerious}`)
  if (detailMessage) detailLine.push(`  详情: ${detailMessage}`)
  if (detailScore) detailLine.push(detailScore)
  if (detailPath) detailLine.push(`  路径: ${detailMethod} ${detailPath}`)
  if (record.userId && record.userId !== 'unknown') detailLine.push(`  用户: ${record.userId}`)
  detailLine.push(`  来源: ${maskedIP}`)

  // 安全规范：控制台日志中 IP 已脱敏，不包含完整 IP
  // 额外输出：如果包含详细数据，展开显示
  let extraLines = ''
  if (detailObj) {
    const extraFields = []
    for (const [k, v] of Object.entries(detailObj)) {
      if (!['type', 'message', 'detail', 'reason', 'score', 'path', 'method', 'serious', 'severity', 'userAgent', 'strategy'].includes(k)) {
        if (typeof v !== 'object' || v === null) {
          extraFields.push(`${k}=${v}`)
        }
      }
    }
    if (extraFields.length > 0) {
      extraLines = `  ${_gray}${extraFields.join(', ')}${RESET}`
    }
  }

  const outputLines = [`  ${headerLine}`, ...detailLine.map(l => `  ${l}`)]
  if (extraLines) outputLines.push(extraLines)

  console.log('')
  console.log(outputLines.join('\n'))

  memoryAuditLog.unshift(record);
  if (memoryAuditLog.length > MAX_MEMORY_LOGS) memoryAuditLog.pop();

  if (sqliteEnabled && sqliteDB) {
    try {
      sqliteDB.run(
        `INSERT INTO audit_logs (id, user_id, action, ip, ip_hash, ip_encrypted, details, success, timestamp, created_at, previous_hash, record_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id,
          record.userId,
          record.action,
          record.ip,
          record.ipHash,
          record.ipEncrypted,
          typeof record.details === 'string' ? record.details : JSON.stringify(record.details),
          record.success ? 1 : 0,
          record.timestamp,
          Date.now(),
          record.previousHash,
          record.hash,
        ]
      );
      sqliteDirty = true;
    } catch (err) {
      console.warn('[AuditLogger] SQLite 写入失败:', err.message);
    }
  }

  try {
    appendAuditRecord(record);
  } catch (err) {
    console.warn('[AuditLogger] 只追加审计链写入失败:', err.message);
  }

  try {
    appendToRemoteBatch(record);
  } catch (err) {
    console.warn('[AuditLogger] 远程签名批处理失败:', err.message);
  }

  return record;
}

function saveAuditLog() {
  try {
    if (!fs.existsSync(SECURITY_DIR)) {
      fs.mkdirSync(SECURITY_DIR, { recursive: true });
    }
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(memoryAuditLog.slice(0, MAX_AUDIT_FILE_LOGS), null, 2), { mode: 0o600 });
  } catch {}
}

function loadAuditLog() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    const data = fs.readFileSync(AUDIT_FILE, 'utf-8');
    const loaded = JSON.parse(data);
    if (Array.isArray(loaded)) {
      memoryAuditLog.push(...loaded);
    }
  } catch {}
}

// 只追加审计链是链式哈希的权威来源，启动时从链尾恢复最新哈希。
function restoreChainState() {
  try {
    const chain = readAuditChain();
    if (chain.length > 0) {
      const last = chain[chain.length - 1];
      if (last.hash) {
        chainState.lastHash = last.hash;
      }
    }
  } catch {}
}

export function getAuditLog(params = {}) {
  const { page = 1, limit = 50, action, userId, success, startTime, endTime } = params;

  if (sqliteEnabled && sqliteDB) {
    try {
      const conditions = [];
      const values = [];
      if (action) { conditions.push('action = ?'); values.push(action); }
      if (userId) { conditions.push('user_id = ?'); values.push(userId); }
      if (success !== undefined) { conditions.push('success = ?'); values.push(success ? 1 : 0); }
      if (startTime) { conditions.push('timestamp >= ?'); values.push(startTime); }
      if (endTime) { conditions.push('timestamp <= ?'); values.push(endTime); }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const countStmt = sqliteDB.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`);
      const total = Number(countStmt.get(...values).total);
      countStmt.free();

      const offset = (page - 1) * limit;
      const query = `SELECT * FROM audit_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      const stmt = sqliteDB.prepare(query);
      const rows = stmt.all(...values, limit, offset);
      stmt.free();

      return {
        total,
        page,
        limit,
        data: rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          action: r.action,
          ip: r.ip || maskIp(revealIp(r.ip_encrypted)),
          ipHash: r.ip_hash || '',
          details: r.details,
          success: r.success === 1,
          timestamp: r.timestamp,
          previousHash: r.previous_hash || '',
          hash: r.record_hash || '',
        })),
      };
    } catch (err) {
      // 静默处理 SQLite 错误，不影响主流程
    }
  }

  let filtered = [...memoryAuditLog];
  if (action) filtered = filtered.filter(e => e.action === action);
  if (userId) filtered = filtered.filter(e => e.userId === userId);
  if (success !== undefined) filtered = filtered.filter(e => e.success === success);
  if (startTime) filtered = filtered.filter(e => e.timestamp >= startTime);
  if (endTime) filtered = filtered.filter(e => e.timestamp <= endTime);

  const start = (page - 1) * limit;
  return {
    total: filtered.length,
    page,
    limit,
    data: filtered.slice(start, start + limit).map(r => {
      if (r.ipHash) return { ...r, ip: r.ip };
      const p = protectIp(r.ip);
      return { ...r, ip: maskIp(r.ip), ipHash: p.hash, ipEncrypted: p.encrypted };
    }),
  };
}

export function getAuditLogStats() {
  if (sqliteEnabled && sqliteDB) {
    try {
      const stmt = sqliteDB.prepare('SELECT COUNT(*) AS total FROM audit_logs');
      const total = Number(stmt.get().total);
      stmt.free();
      return { total, source: 'sqlite', file: SQLITE_DB_FILE };
    } catch {}
  }
  return { total: memoryAuditLog.length, source: 'memory', file: AUDIT_FILE };
}

loadAuditLog();
restoreChainState();
initSQLite().then(() => {
  scheduleSQLiteSave();
});

process.on('SIGINT', () => {
  saveSQLite();
  stopSQLiteSave();
});
process.on('SIGTERM', () => {
  saveSQLite();
  stopSQLiteSave();
});

setInterval(saveAuditLog, 5 * 60 * 1000);
