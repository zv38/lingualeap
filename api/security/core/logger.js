// ===== 统一日志框架 (Unified Logger) =====
// 分级(debug/info/warn/error) + 结构化 + 按天滚动的文件落盘 + 控制台彩色输出 + 敏感字段脱敏。
// 通过 installGlobalConsole() 托管全局 console，将散落在各模块的 console.* 统一收集，
// 无需逐个改造调用点即可获得统一格式、分级过滤与持久化。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== 日志级别 =====
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

const LEVEL_ORDER = [LOG_LEVELS.DEBUG, LOG_LEVELS.INFO, LOG_LEVELS.WARN, LOG_LEVELS.ERROR];

// ===== 配置 =====
// 日志目录：默认 <项目根>/logs，可用 LOG_DIR 覆盖
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const LOG_DIR = process.env.LOG_DIR || path.join(PROJECT_ROOT, 'logs');
const RUNTIME_LOG_FILE = path.join(LOG_DIR, 'runtime.log');
const MAX_LOG_FILE_BYTES = 50 * 1024 * 1024; // 单文件 50MB

// 当前级别：LOG_LEVEL 环境变量，默认 info
const DEFAULT_LEVEL = process.env.LOG_LEVEL || LOG_LEVELS.INFO;
const currentLevel = LEVEL_ORDER.includes(DEFAULT_LEVEL) ? DEFAULT_LEVEL : LOG_LEVELS.INFO;

// 运行时是否输出彩色控制台（非 TTY 时自动关闭，避免日志文件/管道出现 ANSI 码）
const USE_COLOR = process.env.LOG_COLOR !== 'false' && Boolean(process.stdout.isTTY);

// 模块顶层捕获原生 console 引用：log() 内部必须用原生方法输出，
// 避免全局托管后 console.log -> log() -> console.log 的无限递归。
const nativeConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

// ===== 敏感字段脱敏 =====
const SENSITIVE_KEYS = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'accesstoken', 'refreshtoken',
  'authorization', 'cookie', 'apikey', 'api_key', 'privatekey', 'private_key',
  'jwt', 'turnstileresponse', 'turnstile_secret_key', 'encrypted', 'plaintext',
  'adminpassword', 'admin_password', 'payment_secret', 'file_encryption_key',
];

// IP 脱敏：保留前三段，末段置 x
function maskIP(ip) {
  if (!ip || typeof ip !== 'string') return ip;
  if (ip === '::1') return '127.0.0.x';
  if (ip.startsWith('::ffff:')) return maskIP(ip.slice(7));
  const v4match = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4match) return v4match[1] + '.x';
  return ip;
}

function isSensitiveKey(key) {
  const k = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

// 递归脱敏对象/数组/字符串，保护敏感信息
export function redact(value, key = '') {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (isSensitiveKey(key)) return '[REDACTED]';
    // 疑似 IP 字符串脱敏
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return maskIP(value);
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, key));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redact(v, k);
    }
    return out;
  }

  return value;
}

// ===== 文件写入（追加 + 自动滚动） =====
let writeQueue = Promise.resolve();
let currentLogSize = 0;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getFileSize() {
  try {
    return fs.statSync(RUNTIME_LOG_FILE).size;
  } catch {
    return 0;
  }
}

// 追加一行到日志文件，超过大小时自动滚动为 runtime-<timestamp>.log
function appendToFile(line) {
  writeQueue = writeQueue.then(async () => {
    try {
      ensureLogDir();
      currentLogSize = currentLogSize || getFileSize();
      if (currentLogSize + Buffer.byteLength(line) > MAX_LOG_FILE_BYTES) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const rotated = path.join(LOG_DIR, `runtime-${ts}.log`);
        try { fs.renameSync(RUNTIME_LOG_FILE, rotated); } catch {}
        currentLogSize = 0;
      }
      fs.appendFileSync(RUNTIME_LOG_FILE, line + '\n', 'utf-8');
      currentLogSize += Buffer.byteLength(line);
    } catch {
      // 日志写入失败不影响主流程
    }
  });
}

// ===== 控制台彩色输出 =====
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

const LEVEL_STYLE = {
  [LOG_LEVELS.DEBUG]: { label: 'DEBUG', color: ANSI.gray, icon: '·' },
  [LOG_LEVELS.INFO]: { label: 'INFO ', color: ANSI.cyan, icon: '●' },
  [LOG_LEVELS.WARN]: { label: 'WARN ', color: ANSI.yellow, icon: '▲' },
  [LOG_LEVELS.ERROR]: { label: 'ERROR', color: ANSI.red, icon: '■' },
};

function formatArg(arg) {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

// ===== 核心日志方法 =====
function log(level, ...args) {
  if (LEVEL_ORDER.indexOf(level) < LEVEL_ORDER.indexOf(currentLevel)) return;

  const timestamp = new Date().toISOString();
  const localTime = new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
  const style = LEVEL_STYLE[level];

  // 结构化：首参作消息，其余并入 context（脱敏后）
  let message = '';
  let context = null;
  if (args.length > 0) {
    message = formatArg(args[0]);
  }
  if (args.length > 1) {
    context = redact(args.slice(1));
  }

  // 组装落盘用的结构化 JSON
  const entry = {
    ts: timestamp,
    level,
    msg: message,
    ...(context ? { ctx: context } : {}),
  };
  const line = JSON.stringify(entry);
  appendToFile(line);

  // 控制台彩色输出（仅 TTY）
  if (USE_COLOR) {
    let out = `${style.color}${style.icon} ${style.label}${ANSI.reset} ${ANSI.dim}${localTime}${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset}`;
    if (context) {
      out += ` ${ANSI.dim}${formatArg(context)}${ANSI.reset}`;
    }
    if (level === LOG_LEVELS.ERROR) nativeConsole.error(out);
    else if (level === LOG_LEVELS.WARN) nativeConsole.warn(out);
    else nativeConsole.log(out);
  } else {
    // 无颜色：走原生 console，避免循环调用全局托管
    const plain = `${timestamp} [${style.label}] ${message}${context ? ' ' + formatArg(context) : ''}`;
    if (level === LOG_LEVELS.ERROR) nativeConsole.error(plain);
    else if (level === LOG_LEVELS.WARN) nativeConsole.warn(plain);
    else nativeConsole.log(plain);
  }
}

export const logger = {
  debug: (...args) => log(LOG_LEVELS.DEBUG, ...args),
  info: (...args) => log(LOG_LEVELS.INFO, ...args),
  warn: (...args) => log(LOG_LEVELS.WARN, ...args),
  error: (...args) => log(LOG_LEVELS.ERROR, ...args),
  get level() { return currentLevel; },
  get logDir() { return LOG_DIR; },
  get logFile() { return RUNTIME_LOG_FILE; },
};

// ===== 全局 console 托管 =====
// 将 console.log/info/warn/error/debug 统一路由到 logger，同时保留原生行为。
// 返回还原函数，以便测试/清理时恢复。
let installed = false;
let originalMethods = null;

export function installGlobalConsole({ bypassColor = false } = {}) {
  if (installed) return () => uninstallGlobalConsole();
  originalMethods = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  console.log = (...args) => {
    if (bypassColor && !USE_COLOR) { nativeConsole.log(...args); return; }
    log(LOG_LEVELS.INFO, ...args);
  };
  console.info = (...args) => log(LOG_LEVELS.INFO, ...args);
  console.warn = (...args) => log(LOG_LEVELS.WARN, ...args);
  console.error = (...args) => log(LOG_LEVELS.ERROR, ...args);
  console.debug = (...args) => log(LOG_LEVELS.DEBUG, ...args);

  installed = true;
  return () => uninstallGlobalConsole();
}

export function uninstallGlobalConsole() {
  if (!installed || !originalMethods) return;
  console.log = originalMethods.log;
  console.info = originalMethods.info;
  console.warn = originalMethods.warn;
  console.error = originalMethods.error;
  console.debug = originalMethods.debug;
  installed = false;
  originalMethods = null;
}

// ===== 便捷：读取今天运行日志 =====
export function readRuntimeLogs({ limit = 200, level, keyword } = {}) {
  const lines = [];
  try {
    const content = fs.readFileSync(RUNTIME_LOG_FILE, 'utf-8');
    const all = content.split('\n').filter(Boolean);
    for (let i = all.length - 1; i >= 0 && lines.length < limit; i--) {
      const raw = all[i];
      try {
        const obj = JSON.parse(raw);
        if (level && obj.level !== level) continue;
        if (keyword && !(raw.toLowerCase().includes(String(keyword).toLowerCase()))) continue;
        lines.unshift(obj);
      } catch {
        // 非 JSON 行（如启动早期输出）直接保留
        lines.unshift({ ts: '', level: 'info', msg: raw });
      }
    }
  } catch {
    // 无日志文件
  }
  return {
    file: RUNTIME_LOG_FILE,
    dir: LOG_DIR,
    total: lines.length,
    logs: lines,
  };
}

export default logger;