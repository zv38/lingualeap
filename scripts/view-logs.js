// 查看日志 CLI
// 用法：
//   node scripts/view-logs.js              # 最近 50 条审计日志
//   node scripts/view-logs.js -n 20        # 最近 20 条
//   node scripts/view-logs.js -a admin_login   # 只显示 admin_login 动作
//   node scripts/view-logs.js -u admin     # 只显示指定用户
//   node scripts/view-logs.js -f           # 持续监听（开发调试）
//   node scripts/view-logs.js -l           # 查看运行日志（unified logger）
//   node scripts/view-logs.js -l -n 100 -k error   # 运行日志按级别/关键词过滤
//   node scripts/view-logs.js -l -f        # 实时监听运行日志

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const limitFlag = args.indexOf('-n');
const actionFlag = args.indexOf('-a');
const userFlag = args.indexOf('-u');
const followFlag = args.includes('-f');
const runtimeFlag = args.includes('-l') || args.includes('--runtime');
const keywordFlag = args.indexOf('-k');
const levelFlag = args.indexOf('-lvl');

const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1], 10) || 50 : 50;
const actionFilter = actionFlag >= 0 ? args[actionFlag + 1] : null;
const userFilter = userFlag >= 0 ? args[userFlag + 1] : null;
const keyword = keywordFlag >= 0 ? args[keywordFlag + 1] : null;
const levelFilter = levelFlag >= 0 ? args[levelFlag + 1] : null;

const DB_FILE = path.resolve(process.env.AUDIT_SQLITE_PATH || 'data/audit-log.sqlite');

let SQL = null;

async function initSQL() {
  if (SQL) return SQL;
  const sqlJsModule = await import('sql.js');
  const initSqlJs = sqlJsModule.default || sqlJsModule;
  SQL = await initSqlJs();
  return SQL;
}

function buildQuery() {
  const conditions = [];
  const values = [];
  if (actionFilter) {
    conditions.push('action = ?');
    values.push(actionFilter);
  }
  if (userFilter) {
    conditions.push('user_id = ?');
    values.push(userFilter);
  }
  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return { whereClause, values };
}

function formatRow(r) {
  const time = r.timestamp.slice(0, 19).replace('T', ' ');
  const user = (r.user_id || 'unknown').toString().slice(0, 12).padEnd(12);
  const action = r.action.slice(0, 20).padEnd(20);
  const ip = (r.ip || '').toString().slice(0, 14).padEnd(14);
  const ok = r.success === 1 ? '✅' : '❌';
  const details = (r.details || '').toString().slice(0, 60);
  return `${time} | ${user} | ${action} | ${ip} | ${ok}  | ${details}`;
}

async function readLogs({ sinceCreatedAt = 0, maxRows = limit } = {}) {
  if (!fs.existsSync(DB_FILE)) return { rows: [], total: 0 };

  const SQL_LIB = await initSQL();
  const buffer = fs.readFileSync(DB_FILE);
  const db = new SQL_LIB.Database(buffer);

  const { whereClause, values } = buildQuery();

  // 总数
  const countStmt = db.prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`);
  if (values.length > 0) countStmt.bind(...values);
  countStmt.step();
  const total = Number(countStmt.getAsObject().total || 0);
  countStmt.free();

  // 查询
  const conditions = [...values];
  const timeFilter = sinceCreatedAt > 0
    ? (whereClause ? ' AND created_at > ?' : ' WHERE created_at > ?')
    : '';
  if (sinceCreatedAt > 0) conditions.push(sinceCreatedAt);

  const query = `SELECT * FROM audit_logs ${whereClause}${timeFilter} ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(maxRows, 1000))}`;
  const stmt = db.prepare(query);
  if (conditions.length > 0) stmt.bind(...conditions);

  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  db.close();

  return { rows, total };
}

async function printRecentLogs() {
  const { rows, total } = await readLogs({ maxRows: limit });

  if (rows.length === 0) {
    console.log('[view-logs] 暂无日志记录');
    return;
  }

  console.log(`\n[view-logs] 数据库共 ${total} 条，当前显示 ${rows.length} 条\n`);
  console.log('时间'.padEnd(24) + ' | 用户'.padEnd(14) + ' | 动作'.padEnd(22) + ' | IP'.padEnd(16) + ' | 结果 | 详情');
  console.log('-'.repeat(140));
  for (const r of rows) {
    console.log(formatRow(r));
  }
  console.log('');
}

async function followLogs() {
  console.log('[view-logs] 进入实时监听模式，按 Ctrl+C 退出');
  console.log('');
  console.log('时间'.padEnd(24) + ' | 用户'.padEnd(14) + ' | 动作'.padEnd(22) + ' | IP'.padEnd(16) + ' | 结果 | 详情');
  console.log('-'.repeat(140));

  let lastCreatedAt = 0;

  // 先打印已有最新日志，并记录最新时间戳
  const { rows: initialRows } = await readLogs({ maxRows: limit });
  for (const r of initialRows.reverse()) {
    console.log(formatRow(r));
    if (r.created_at > lastCreatedAt) lastCreatedAt = r.created_at;
  }

  setInterval(async () => {
    const { rows } = await readLogs({ sinceCreatedAt: lastCreatedAt, maxRows: 100 });
    if (rows.length === 0) return;
    for (const r of rows.reverse()) {
      console.log(formatRow(r));
      if (r.created_at > lastCreatedAt) lastCreatedAt = r.created_at;
    }
  }, 2000);
}

// ===== 运行日志查看（unified logger） =====
const LEVEL_ICON = {
  debug: '·', info: '●', warn: '▲', error: '■',
};

function formatRuntimeEntry(e) {
  const time = e.ts ? e.ts.slice(0, 19).replace('T', ' ') : '';
  const icon = LEVEL_ICON[e.level] || '·';
  const lvl = (e.level || 'info').toUpperCase().padEnd(5);
  const ctx = e.ctx ? ' ' + JSON.stringify(e.ctx) : '';
  return `${time} ${icon} [${lvl}] ${e.msg}${ctx}`;
}

async function printRuntimeLogs() {
  const { readRuntimeLogs } = await import('../api/security/core/logger.js');
  const { logs, total, file } = readRuntimeLogs({ limit, level: levelFilter, keyword });
  if (logs.length === 0) {
    console.log(`[view-logs] 运行日志为空（${file}）`);
    return;
  }
  console.log(`\n[view-logs] 运行日志共 ${total} 条，显示 ${logs.length} 条（文件：${file}）\n`);
  for (const e of logs) {
    console.log(formatRuntimeEntry(e));
  }
  console.log('');
}

async function followRuntimeLogs() {
  const { readRuntimeLogs } = await import('../api/security/core/logger.js');
  let lastLen = 0;
  const tick = () => {
    const { logs } = readRuntimeLogs({ limit: 1000, level: levelFilter, keyword });
    if (logs.length > lastLen) {
      for (let i = lastLen; i < logs.length; i++) {
        console.log(formatRuntimeEntry(logs[i]));
      }
      lastLen = logs.length;
    }
  };
  console.log('[view-logs] 实时监听运行日志，按 Ctrl+C 退出');
  tick();
  setInterval(tick, 2000);
}

if (runtimeFlag) {
  if (followFlag) {
    followRuntimeLogs();
  } else {
    printRuntimeLogs().then(() => setTimeout(() => process.exit(0), 200));
  }
} else if (followFlag) {
  followLogs();
} else {
  printRecentLogs().then(() => {
    setTimeout(() => process.exit(0), 200);
  });
}
