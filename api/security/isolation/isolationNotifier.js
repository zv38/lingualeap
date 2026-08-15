// ===== 隔离状态变化通知器 =====
// 当隔离系统被触发或解除时，通知所有管理员并记录多渠道告警

import { createSecurityNotification, SECURITY_NOTIFICATION_TYPES } from '../system/userNotifications.js';

export function createIsolationNotifier({ usersDB, logAudit, getClientIP }) {
  return function isolationNotifyHook(event, payload) {
    if (event !== 'activate') return;

    const { level, reason, details, state } = payload;
    const levelText = {
      alert: '警戒',
      quarantine: '半隔离',
      lockdown: '完全隔离',
    }[level] || level;

    const title = `系统已进入 ${levelText} 模式`;
    const message = state.reason || reason || '自动隔离系统检测到威胁并提升了隔离级别';
    const metadata = {
      level,
      reason,
      details,
      triggeredAt: state.triggeredAt,
      triggeredBy: state.triggeredBy,
    };

    // 1. 给所有管理员发送站内安全通知
    let notifiedCount = 0;
    try {
      for (const user of (usersDB?.values ? usersDB.values() : [])) {
        if (user.role === 'admin' || user.isAdmin || user.requireAdminMfa) {
          createSecurityNotification({
            userId: user.id,
            type: SECURITY_NOTIFICATION_TYPES.SYSTEM_ISOLATION_TRIGGERED,
            title,
            message,
            link: '/security-center',
            metadata,
          });
          notifiedCount += 1;
        }
      }
    } catch (err) {
      console.error('[IsolationNotifier] 发送管理员通知失败:', err.message);
    }

    // 2. 审计日志（控制台 + SQLite）
    try {
      logAudit?.({
        userId: 'system',
        action: 'isolation_activated',
        ip: details?.ip || 'system',
        details: `${title}: ${message}`,
        success: true,
        metadata,
      });
    } catch {}

    // 3. 控制台告警（带视觉强调）
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error(`║  [隔离系统告警] 系统已进入 ${levelText} 模式`);
    console.error(`║  原因: ${message}`);
    console.error(`║  触发源: ${details?.ip || 'unknown'}`);
    console.error(`║  已通知管理员: ${notifiedCount} 人`);
    console.error('╚══════════════════════════════════════════════════════════════╝\n');

    // 4. TODO: 在此处接入邮件/短信/企业微信/钉钉 webhook
    // 示例：sendWebhook({ title, message, level, details });
  };
}
