// ============================================================
// Process Sandbox — Windows 进程沙箱
// 职责：
//   1. 在 Windows 上尝试使用 JobObject 限制子进程权限
//   2. 非 Windows 平台降级为环境过滤与参数校验
//   3. 限制子进程 UI、退出、剪贴板等能力
//   4. 提供统一的子进程创建接口
// ============================================================

import { spawn } from 'child_process'
import { logAudit } from '../core/auditLogger.js'

const isWindows = process.platform === 'win32'

const DANGEROUS_PATTERNS = [
  /\b(?:rm|del|erase|format)\b/i,
  />\s*[a-zA-Z]:/,
  /\$\(.*\)/,
  /`.*`/,
  /\|\s*(?:sh|bash|cmd|powershell)/i,
]

const state = {
  totalSpawned: 0,
  sandboxedOk: 0,
  fallbackCount: 0,
  failures: 0,
  active: new Map(),
}

function logEvent(type, detail, success = true) {
  logAudit({
    userId: 'system',
    action: 'process_sandbox_event',
    details: { type, detail },
    success,
  })
}

function sanitizeEnv(env) {
  const sensitiveKeys = [
    /JWT_SECRET/i,
    /TURNSTILE_SECRET/i,
    /ADMIN_PASSWORD/i,
    /SMTP_PASS/i,
    /PRIVATE_KEY/i,
    /API_KEY/i,
    /SECRET/i,
  ]
  const safe = {}
  for (const [key, value] of Object.entries(env || process.env)) {
    if (sensitiveKeys.some(p => p.test(key))) continue
    safe[key] = value
  }
  return safe
}

function validateCommand(command, args) {
  const full = [command, ...(args || [])].join(' ')
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(full)) {
      throw new Error(`ProcessSandbox 拒绝潜在危险命令: ${full}`)
    }
  }
}

/**
 * 在 Windows 上通过 PowerShell + P/Invoke 将 PID 关联到受限 JobObject。
 * 若失败仅记录日志，不影响子进程运行（降级）。
 */
function applyWindowsJobObject(pid, options = {}) {
  if (!isWindows || !pid) return { applied: false, reason: 'not_windows' }

  const activeProcessLimit = options.activeProcessLimit || 1
  const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class JobObjectHelper {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll")]
    public static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll")]
    public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    public const int JobObjectBasicLimitInformation = 2;
    public const int JobObjectBasicUIRestrictions = 4;
    public const uint JOB_OBJECT_LIMIT_ACTIVE_PROCESS = 0x00000008;
    public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    public const uint JOB_OBJECT_LIMIT_BREAKAWAY_OK = 0x00000800;
    public const uint JOB_OBJECT_UILIMIT_DESKTOP = 0x00000040;
    public const uint JOB_OBJECT_UILIMIT_DISPLAYSETTINGS = 0x00000020;
    public const uint JOB_OBJECT_UILIMIT_EXITWINDOWS = 0x00000080;
    public const uint JOB_OBJECT_UILIMIT_GLOBALATOMS = 0x00000010;
    public const uint JOB_OBJECT_UILIMIT_HANDLES = 0x00000001;
    public const uint JOB_OBJECT_UILIMIT_READCLIPBOARD = 0x00000002;
    public const uint JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS = 0x00000008;
    public const uint JOB_OBJECT_UILIMIT_WRITECLIPBOARD = 0x00000004;
    public const uint PROCESS_SET_QUOTA = 0x00000100;
    public const uint PROCESS_TERMINATE = 0x00000001;

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_UI_RESTRICTIONS {
        public uint UIRestrictionsClass;
    }

    public static bool Apply(int pid, int maxActive) {
        IntPtr job = CreateJobObject(IntPtr.Zero, "LinguaLeapSandbox_" + Guid.NewGuid().ToString("N"));
        if (job == IntPtr.Zero) return false;

        JOBOBJECT_BASIC_LIMIT_INFORMATION limits = new JOBOBJECT_BASIC_LIMIT_INFORMATION();
        limits.ActiveProcessLimit = (uint)maxActive;
        limits.LimitFlags = JOB_OBJECT_LIMIT_ACTIVE_PROCESS | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
        IntPtr pLimits = Marshal.AllocHGlobal(Marshal.SizeOf(limits));
        Marshal.StructureToPtr(limits, pLimits, false);
        bool ok = SetInformationJobObject(job, JobObjectBasicLimitInformation, pLimits, (uint)Marshal.SizeOf(limits));
        Marshal.FreeHGlobal(pLimits);
        if (!ok) return false;

        JOBOBJECT_BASIC_UI_RESTRICTIONS ui = new JOBOBJECT_BASIC_UI_RESTRICTIONS();
        ui.UIRestrictionsClass = JOB_OBJECT_UILIMIT_DESKTOP | JOB_OBJECT_UILIMIT_DISPLAYSETTINGS | JOB_OBJECT_UILIMIT_EXITWINDOWS | JOB_OBJECT_UILIMIT_GLOBALATOMS | JOB_OBJECT_UILIMIT_HANDLES | JOB_OBJECT_UILIMIT_READCLIPBOARD | JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS | JOB_OBJECT_UILIMIT_WRITECLIPBOARD;
        IntPtr pUi = Marshal.AllocHGlobal(Marshal.SizeOf(ui));
        Marshal.StructureToPtr(ui, pUi, false);
        ok = SetInformationJobObject(job, JobObjectBasicUIRestrictions, pUi, (uint)Marshal.SizeOf(ui));
        Marshal.FreeHGlobal(pUi);
        if (!ok) return false;

        IntPtr hProcess = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid);
        if (hProcess == IntPtr.Zero) return false;
        ok = AssignProcessToJobObject(job, hProcess);
        CloseHandle(hProcess);
        return ok;
    }
}
"@
try {
    $r = [JobObjectHelper]::Apply(${pid}, ${activeProcessLimit})
    if (-not $r) { throw "AssignProcessToJobObject failed" }
    Write-Host "OK"
} catch {
    Write-Host "FAIL: $_"
    exit 1
}
`

  return new Promise((resolve) => {
    const helper = spawn('powershell.exe', ['-NoProfile', '-Command', ps], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: sanitizeEnv(),
    })
    let stdout = ''
    let stderr = ''
    helper.stdout.on('data', d => { stdout += d })
    helper.stderr.on('data', d => { stderr += d })
    helper.on('close', (code) => {
      if (code === 0 && stdout.trim() === 'OK') {
        resolve({ applied: true, method: 'job_object' })
      } else {
        resolve({ applied: false, reason: stderr.trim() || stdout.trim() || 'powershell_failed' })
      }
    })
    helper.on('error', (err) => {
      resolve({ applied: false, reason: err.message })
    })
  })
}

export { sanitizeEnv }

/**
 * 创建受控子进程。
 * 在 Windows 上尝试附加 JobObject；其他平台或非管理员场景下降级。
 */
export function createSandboxedProcess(command, args, options = {}) {
  validateCommand(command, args)

  const {
    activeProcessLimit = 1,
    restrictEnv = true,
    timeoutMs = 30 * 1000,
    ...spawnOptions
  } = options

  const childEnv = restrictEnv ? sanitizeEnv(spawnOptions.env) : spawnOptions.env
  const child = spawn(command, args, {
    windowsHide: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...spawnOptions,
    env: childEnv,
  })

  state.totalSpawned++
  const meta = {
    pid: child.pid,
    command,
    args,
    startedAt: new Date().toISOString(),
    sandboxed: false,
    method: 'spawn_only',
  }
  state.active.set(child.pid, meta)

  let killTimer = null
  if (timeoutMs > 0) {
    killTimer = setTimeout(() => {
      try {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 5000)
      } catch {
        // ignore
      }
      logEvent('timeout_kill', `PID ${child.pid} 执行超时 ${timeoutMs}ms`, false)
    }, timeoutMs)
    killTimer.unref?.()
  }

  // Windows 尝试 JobObject；其他平台使用环境过滤降级
  if (isWindows) {
    applyWindowsJobObject(child.pid, { activeProcessLimit })
      .then((result) => {
        if (result.applied) {
          meta.sandboxed = true
          meta.method = 'job_object'
          state.sandboxedOk++
          logEvent('job_object_applied', `PID ${child.pid} 已加入 JobObject`)
        } else {
          state.fallbackCount++
          logEvent('job_object_fallback', `PID ${child.pid} JobObject 失败: ${result.reason}`, false)
        }
      })
      .catch((err) => {
        state.fallbackCount++
        logEvent('job_object_error', err.message, false)
      })
  } else {
    state.fallbackCount++
    meta.method = 'env_filter'
    logEvent('sandbox_fallback', `PID ${child.pid} 使用非 Windows 降级方案`)
  }

  child.on('exit', () => {
    if (killTimer) clearTimeout(killTimer)
    state.active.delete(child.pid)
  })

  return child
}

/**
 * 主动终止仍处于活动状态的子进程。
 */
export function terminateSandboxedProcess(pid, force = false) {
  const meta = state.active.get(pid)
  if (!meta) return { found: false }
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
    return { found: true, signal: force ? 'SIGKILL' : 'SIGTERM' }
  } catch (err) {
    return { found: true, error: err.message }
  }
}

export function getSandboxStatus() {
  return {
    platform: process.platform,
    isWindows,
    totalSpawned: state.totalSpawned,
    sandboxedOk: state.sandboxedOk,
    fallbackCount: state.fallbackCount,
    failures: state.failures,
    activeProcesses: Array.from(state.active.values()),
  }
}

export default {
  createSandboxedProcess,
  terminateSandboxedProcess,
  getSandboxStatus,
  sanitizeEnv,
}
