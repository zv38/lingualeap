// ===== 启动横幅 (Startup Banner) =====
// 后端完全就绪后，在终端渲染一个高级精致的启动横幅：
// 彩色渐变 LOGO + 服务信息面板 + 轻量加载帧动画。
// 遵循用户偏好：低饱和中性色 + 单点缀青紫、呼吸感、克制专业、拒绝机械感。

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // 前景色
  fg: {
    purple: '\x1b[38;2;139;129;216m',   // 柔和紫
    indigo: '\x1b[38;2;99;102;241m',    // 靛蓝紫（点缀色）
    cyan: '\x1b[38;2;94;196;214m',      // 温柔青
    teal: '\x1b[38;2;92;190;180m',
    white: '\x1b[38;2;226;226;232m',
    gray: '\x1b[38;2;140;140;152m',
    dimgray: '\x1b[38;2;95;95;105m',
    softGreen: '\x1b[38;2;132;204;158m',
    softYellow: '\x1b[38;2;230;199;120m',
    softRed: '\x1b[38;2;226;140;140m',
  },
  box: {
    dim: '\x1b[38;2;120;120;132m',
    line: '\x1b[38;2;150;150;165m',
    accent: '\x1b[38;2;99;102;241m',
  },
};

// ===== LOGO 文本（两行，居中后拼接） =====
const LOGO_TOP = [
  '  ██╗     ██╗███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ██╗     ███████╗ █████╗ ██████╗ ',
  '  ██║     ██║████╗  ██║██╔════╝ ██║   ██║██╔══██╗██║     ██╔════╝██╔══██╗██╔══██╗',
  '  ██║     ██║██╔██╗ ██║██║      ██║   ██║███████║██║     █████╗  ███████║██████╔╝',
  '  ██║     ██║██║╚██╗██║██║      ██║   ██║██╔══██║██║     ██╔══╝  ██╔══██║██╔═══╝ ',
  '  ███████╗██║██║ ╚████║╚██████╗ ╚██████╔╝██║  ██║███████╗███████╗██║  ██║██║     ',
  '  ╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ',
];

const LOGO_BOTTOM = [
  '  LANGUAGE LEARNING PLATFORM',
  '     ·  安全 · 智能 · 沉浸  ·',
];

// LOGO 渐变配色序列（自上而下渐变，青紫过渡）
const GRADIENT = [ANSI.fg.cyan, ANSI.fg.teal, ANSI.fg.indigo, ANSI.fg.purple, ANSI.fg.indigo, ANSI.fg.cyan];

function renderLogo() {
  const lines = [];
  // 顶部大 LOGO（每行一个渐变色）
  for (let i = 0; i < LOGO_TOP.length; i++) {
    lines.push(GRADIENT[i % GRADIENT.length] + LOGO_TOP[i] + ANSI.reset);
  }
  // 空白行
  lines.push('');
  // 底部文字（居中、柔和）
  const inner = LOGO_BOTTOM[0];
  const pad = ' '.repeat(Math.max((LOGO_TOP[0].length - inner.length) / 2, 0) | 0);
  lines.push(ANSI.fg.white + pad + inner + ANSI.reset);
  lines.push(ANSI.fg.dimgray + ' '.repeat(Math.max((LOGO_TOP[0].length - LOGO_BOTTOM[1].length) / 2, 0) | 0) + LOGO_BOTTOM[1] + ANSI.reset);
  return lines.join('\n');
}

// ===== 加载帧动画（轻量、呼吸感，非旋转机械感） =====
const LOAD_FRAMES = ['  ', '· ', '··', '···', '····'];
const LOAD_STEPS = ['初始化安全模块', '加载密钥库', '启动审计链', '装载路由', '服务就绪'];

// 渲染一个带呼吸点进度指示的启动过程（异步，逐行推进）
export function playStartupSteps({ fast = false } = {}) {
  const delay = fast ? 40 : 160;
  return new Promise((resolve) => {
    let i = 0;
    const step = () => {
      if (i >= LOAD_STEPS.length) {
        process.stdout.write('\n');
        resolve();
        return;
      }
      const dots = LOAD_FRAMES[i % LOAD_FRAMES.length];
      const label = LOAD_STEPS[i];
      const spacer = ' '.repeat(6 - dots.length);
      process.stdout.write(`\r${ANSI.fg.indigo}${dots}${spacer}${ANSI.reset}${ANSI.fg.gray}${label}${ANSI.reset}`);
      i++;
      setTimeout(step, delay);
    };
    step();
  });
}

// ===== 信息面板 =====
// 中文字符按 2 列宽计算，保证竖线对齐
function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    w += ch.charCodeAt(0) > 0xFF ? 2 : 1;
  }
  return w;
}

// 剥离 ANSI 颜色码后再计算宽度，避免颜色字符干扰对齐
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function visualWidth(str) {
  return displayWidth(str.replace(ANSI_RE, ''));
}

function padTo(str, width) {
  const cur = visualWidth(str);
  const pad = Math.max(width - cur, 0);
  return str + ' '.repeat(pad);
}

function drawPanel(rows) {
  const innerWidth = 60; // 内容可视宽度（不含边框）
  const out = [];
  out.push(ANSI.box.accent + '┌' + '─'.repeat(innerWidth + 2) + '┐' + ANSI.reset);
  for (const [k, v] of rows) {
    const key = padTo(k + ':', 10);
    const val = padTo(v, innerWidth - 10);
    out.push(
      ANSI.box.dim + '│ ' + ANSI.reset +
      ANSI.fg.white + key + ANSI.reset +
      ANSI.fg.gray + val + ANSI.reset +
      ANSI.box.dim + ' │' + ANSI.reset
    );
  }
  out.push(ANSI.box.accent + '└' + '─'.repeat(innerWidth + 2) + '┘' + ANSI.reset);
  return out.join('\n');
}

// ===== 主横幅 =====
export function printBanner(info) {
  const { port, protocol, env, version, startedAt } = info;
  const lines = [];
  lines.push('');
  lines.push(renderLogo());
  lines.push('');
  lines.push(drawPanel([
    ['状态', ANSI.fg.softGreen + '● 运行中' + ANSI.reset],
    ['地址', `${protocol}://localhost:${port}`],
    ['环境', env === 'production' ? ANSI.fg.softYellow + 'production' + ANSI.reset : ANSI.fg.cyan + 'development' + ANSI.reset],
    ['版本', version || '1.0.0'],
    ['启动耗时', startedAt ? `${startedAt}ms` : '—'],
  ]));
  lines.push('');
  lines.push(ANSI.fg.dimgray + '  安全 · 智能 · 沉浸式语言学习平台  ·  ' + ANSI.fg.indigo + 'LinguaLeap' + ANSI.reset);
  lines.push('');
  return lines.join('\n');
}

export default { printBanner, playStartupSteps };