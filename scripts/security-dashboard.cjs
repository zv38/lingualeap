#!/usr/bin/env node
// ===== 安全防护系统终端看板 =====
// 在终端中实时显示安全防护系统的运作过程

const http = require('http');
const readline = require('readline');

// ===== 颜色常量 =====
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;

const colors = {
  green:     `${ESC}[32m`,
  yellow:    `${ESC}[33m`,
  red:       `${ESC}[31m`,
  cyan:      `${ESC}[36m`,
  magenta:   `${ESC}[35m`,
  blue:      `${ESC}[34m`,
  white:     `${ESC}[37m`,
  gray:      `${ESC}[90m`,
  bgGreen:   `${ESC}[42m`,
  bgYellow:  `${ESC}[43m`,
  bgRed:     `${ESC}[41m`,
  bgBlue:    `${ESC}[44m`,
  bgGray:    `${ESC}[100m`,
};

// ===== 终端大小 =====
const terminalWidth = () => Math.min(process.stdout.columns || 100, 120);
const terminalHeight = () => process.stdout.rows || 30;

// ===== 辅助函数 =====
function colorize(text, color) {
  return `${color}${text}${RESET}`;
}

function pad(text, len) {
  const str = String(text);
  const ansiLen = str.replace(/\x1b\[\d+m/g, '').length;
  return str + ' '.repeat(Math.max(0, len - ansiLen));
}

function truncate(text, maxLen) {
  const clean = text.replace(/\x1b\[\d+m/g, '');
  if (clean.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatRelativeTime(seconds) {
  if (seconds <= 0) return '已过期';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s}s`;
}

// ===== 状态指示器 =====
function statusDot(status) {
  switch (status) {
    case 'ok': case 'passed': case 'normal': case 'running':
      return colorize('●', colors.green);
    case 'warning': case 'warn':
      return colorize('●', colors.yellow);
    case 'error': case 'failed': case 'blocked':
      return colorize('●', colors.red);
    default:
      return colorize('○', colors.gray);
  }
}

function statusBadge(label, status) {
  const bg = status === 'ok' || status === true || status === 'passed' ? colors.bgGreen :
             status === 'warn' || status === 'warning' ? colors.bgYellow :
             status === 'error' || status === 'failed' || status === false ? colors.bgRed :
             colors.bgGray;
  const textColor = status === 'ok' || status === true || status === 'passed' ? colors.white :
                    status === 'warn' || status === 'warning' ? colors.white :
                    status === 'error' || status === 'failed' || status === false ? colors.white :
                    colors.white;
  return `${bg}${textColor} ${label} ${RESET}`;
}

// ===== 绘制边框 =====
function hr(char = '─', len = terminalWidth()) {
  return colorize(char.repeat(len), colors.gray);
}

// ===== 请求仪表盘数据 =====
function fetchDashboard() {
  return new Promise((resolve, reject) => {
    const req = http.get('http://localhost:3001/api/security/dashboard', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('解析响应失败'));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

// ===== 绘制总览 =====
function renderOverview(data) {
  const w = terminalWidth();
  const { tcpWaf, runtimeGuard, auditLog } = data;

  const tcpStatus = tcpWaf.blockedCount > 0 ? 'active' : 'normal';
  const runtimeStatus = runtimeGuard.status === 'ok' ? 'ok' : 'warn';
  const auditStatus = auditLog.total > 0 ? 'ok' : 'normal';

  const lines = [];
  lines.push('');
  lines.push(colorize(`  ████████ 安全防护系统 · 实时监控  ████████`, colors.cyan));
  lines.push('');
  lines.push(`  ${colorize('⏱', colors.gray)} ${formatTime(data.timestamp)}  |  ${colorize('刷新: 每3秒', colors.gray)}`);
  lines.push('');
  lines.push(`  ${pad('■ TCP-WAF 防火墙', 20)} ${statusBadge(tcpStatus === 'active' ? '运行中' : '正常', tcpStatus)}  ${colorize(`封禁IP: ${tcpWaf.blockedCount}`, colors.white)}  ${colorize(`活跃连接: ${tcpWaf.activeConnections}`, colors.gray)}`);
  lines.push(`  ${pad('■ 运行态防护', 20)} ${statusBadge(runtimeStatus === 'ok' ? '正常' : '异常', runtimeStatus)}  ${colorize(`违规: ${runtimeGuard.violationCount}`, colors.white)}  ${colorize(`自检: ${runtimeGuard.checksPassed}✓ ${runtimeGuard.checksFailed}✗`, colors.gray)}`);
  lines.push(`  ${pad('■ 审计日志', 20)} ${statusBadge('运行中', 'ok')}  ${colorize(`事件总数: ${auditLog.total}`, colors.white)}`);
  lines.push('');
  return lines.join('\n');
}

// ===== 绘制 TCP-WAF 详情 =====
function renderTCPWAF(data) {
  const { tcpWaf } = data;
  const w = terminalWidth();
  const lines = [];

  lines.push(colorize(`  ┌─ TCP-WAF 防护详情 ──────────────────────┐`, colors.yellow));
  lines.push(`  │ ${colorize('总跟踪IP', colors.gray)}: ${String(tcpWaf.totalTrackedIPs).padEnd(5)} ${colorize('窗口请求', colors.gray)}: ${String(tcpWaf.totalRequestsInWindow).padEnd(5)} ${colorize('封禁数', colors.gray)}: ${colorize(tcpWaf.blockedCount, colors.red)}`);
  lines.push(`  └───────────────────────────────────────────────┘`);

  if (tcpWaf.blockedIPs && tcpWaf.blockedIPs.length > 0) {
    lines.push('');
    tcpWaf.blockedIPs.slice(0, 8).forEach(ip => {
      const timeLeft = formatRelativeTime(ip.remainingSeconds);
      const reason = ip.reason?.substring(0, 25) || '未知';
      lines.push(`  ${colorize('⛔', colors.red)} ${colorize(ip.ip.padEnd(20), colors.white)} ${colorize(reason.padEnd(25), colors.gray)} ${colorize(`剩余: ${timeLeft}`, colors.yellow)}`);
    });
    if (tcpWaf.blockedIPs.length > 8) {
      lines.push(`  ${colorize(`  ... 还有 ${tcpWaf.blockedIPs.length - 8} 个封禁IP`, colors.gray)}`);
    }
  } else {
    lines.push(`  ${colorize('  当前无封禁IP ✓', colors.green)}`);
  }

  return lines.join('\n');
}

// ===== 绘制运行态防护 =====
function renderRuntimeGuard(data) {
  const { runtimeGuard } = data;
  const lines = [];
  const w = terminalWidth();

  const rg = runtimeGuard;
  const ov = colorize(rg.seriousViolation ? '有严重违规' : '无严重违规', rg.seriousViolation ? colors.red : colors.green);

  lines.push(colorize(`  ┌─ 运行态防护 (RuntimeGuard) ─────────────┐`, colors.magenta));
  lines.push(`  │ ${statusDot(rg.status)} ${colorize('整体状态', colors.gray)}: ${rg.status}  ${ov}  ${colorize(`违规记录: ${rg.violationCount}`, colors.white)}`);
  lines.push(`  │ ${colorize('┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄', colors.gray)}`);
  lines.push(`  │ ${colorize('检测项', colors.cyan)}                 ${colorize('状态', colors.cyan)}  ${colorize('说明', colors.cyan)}`);
  lines.push(`  │ ${colorize('反调试 (AntiDebug)', colors.gray)}     ${statusDot(rg.antiDebug?.status || 'normal')}  ${rg.antiDebug?.status || '未检测'}`);
  lines.push(`  │ ${colorize('内存防护 (MemoryGuard)', colors.gray)} ${statusDot(rg.memoryGuard?.status || 'normal')}  ${rg.memoryGuard?.status || '未检测'}`);
  lines.push(`  │ ${colorize('进程沙箱 (ProcessSandbox)', colors.gray)} ${statusDot(rg.processSandbox?.status || 'normal')}  ${rg.processSandbox?.status || '未检测'}`);
  lines.push(`  │ ${colorize('运行态完整性', colors.gray)}           ${statusDot(rg.runtimeIntegrity?.status || 'normal')}  ${rg.runtimeIntegrity?.status || '未检测'}`);
  lines.push(`  └───────────────────────────────────────────────┘`);

  // 违规记录
  if (rg.recentViolations && rg.recentViolations.length > 0) {
    lines.push('');
    lines.push(colorize(`  ┌─ 最近违规记录 ───────────────────────────┐`, colors.red));
    rg.recentViolations.slice(0, 6).forEach(v => {
      const icon = v.serious ? '🔴' : '🟡';
      const type = v.type?.substring(0, 25) || '未知';
      const detail = (v.detail || '').substring(0, 50);
      lines.push(`  │ ${icon} ${colorize(type.padEnd(28), colors.white)} ${colorize(detail, colors.gray)}`);
    });
    lines.push(`  └───────────────────────────────────────────────┘`);
  }

  return lines.join('\n');
}

// ===== 绘制审计日志 =====
function renderAuditLog(data) {
  const { auditLog } = data;
  const lines = [];

  lines.push(colorize(`  ┌─ 审计日志 (最近 10 条) ──────────────────┐`, colors.blue));

  if (auditLog.recentEvents && auditLog.recentEvents.length > 0) {
    auditLog.recentEvents.slice(0, 10).forEach(event => {
      const time = formatTime(event.timestamp || event.created_at || event.at);
      const action = (event.action || event.type || 'unknown').substring(0, 30);
      const user = (event.user || 'system').substring(0, 12);
      const ip = (event.ip || '').substring(0, 15);

      const icon = event.status === 'success' || event.action?.includes('success') ? '✅' :
                   event.status === 'failed' || event.action?.includes('fail') || event.action?.includes('block') ? '❌' :
                   event.status === 'warning' ? '⚠️' : '📝';

      const statusChar = event.status === 'success' ? colorize('✓', colors.green) :
                         event.status === 'failed' ? colorize('✗', colors.red) :
                         colorize('·', colors.gray);

      lines.push(`  │ ${colorize(time, colors.gray)} ${icon} ${colorize(action.padEnd(32), colors.white)} ${colorize(user.padEnd(12), colors.cyan)} ${colorize(ip.padEnd(15), colors.gray)} ${statusChar}`);
    });
  } else {
    lines.push(`  │ ${colorize('  暂无审计日志', colors.gray)}`);
  }
  lines.push(`  └───────────────────────────────────────────────┘`);

  return lines.join('\n');
}

// ===== 绘制系统事件流 =====
function renderLiveEvents(data) {
  const { auditLog } = data;
  const lines = [];

  lines.push('');
  lines.push(colorize(`  ┌─ 防护系统实时事件流 ─────────────────────┐`, colors.cyan));

  if (auditLog.recentEvents && auditLog.recentEvents.length > 0) {
    const events = auditLog.recentEvents.slice(0, 5);
    events.forEach(event => {
      const time = formatTime(event.timestamp || event.created_at || event.at);
      const action = (event.action || event.type || 'unknown').substring(0, 35);
      const detail = (event.detail || event.message || '').substring(0, 40);

      const severity = event.status === 'failed' || event.action?.includes('fail') || event.action?.includes('block') ? 'danger' :
                       event.status === 'warning' ? 'warn' : 'info';

      const sevColor = severity === 'danger' ? colors.red :
                       severity === 'warn' ? colors.yellow : colors.gray;

      const sevLabel = severity === 'danger' ? '危险' :
                       severity === 'warn' ? '警告' : '信息';

      lines.push(`  │ ${colorize(sevLabel, sevColor)} ${colorize(time, colors.cyan)} ${colorize(action.padEnd(35), colors.white)} ${colorize(detail, colors.gray)}`);
    });
  }
  lines.push(`  └───────────────────────────────────────────────┘`);

  return lines.join('\n');
}

// ===== 主渲染循环 =====
let lastData = null;
let refreshCount = 0;

async function render() {
  try {
    const result = await fetchDashboard();
    if (result.success && result.data) {
      lastData = result.data;
      refreshCount++;
    }
  } catch (err) {
    // 请求失败，保留上次数据
  }

  // 清屏
  process.stdout.write(`${ESC}[2J${ESC}[H`);

  // 标题行
  const title = `  🔒 安全防护系统终端看板  [${new Date().toLocaleTimeString('zh-CN')}]  (刷新 #${refreshCount})`;
  console.log(colorize(hr('═'), colors.cyan));
  console.log(colorize(title, BOLD));
  console.log(colorize(hr('═'), colors.cyan));

  if (lastData) {
    process.stdout.write(renderOverview(lastData));
    process.stdout.write('\n');
    process.stdout.write(renderTCPWAF(lastData));
    process.stdout.write('\n');
    process.stdout.write(renderRuntimeGuard(lastData));
    process.stdout.write('\n');
    process.stdout.write(renderAuditLog(lastData));
    process.stdout.write('\n');
    process.stdout.write(renderLiveEvents(lastData));
  } else {
    console.log('');
    console.log(`  ${colorize('◐', colors.yellow)} 正在连接后端 API (http://localhost:3001)...`);
    console.log(`  ${colorize('  请确保后端已启动: npm run dev:api', colors.gray)}`);
    console.log('');
  }

  console.log('');
  console.log(colorize(hr('─'), colors.gray));
  console.log(`  ${colorize('按 Ctrl+C 退出', DIM)}  ${colorize('API: localhost:3001', DIM)}`);
  console.log(colorize(hr('─'), colors.gray));
}

// ===== 启动 =====
console.log(`${ESC}[?25l`); // 隐藏光标
render();

// 每3秒刷新
const timer = setInterval(render, 3000);

// 退出处理
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log(`${ESC}[?25h`); // 恢复光标
  console.log('');
  console.log('  安全看板已退出');
  process.exit(0);
});