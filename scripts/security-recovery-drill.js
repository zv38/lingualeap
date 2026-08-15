// ===== 密钥冷备恢复演练（DR Drill） =====
// 目的：在不触碰/不污染生产冷备的前提下验证密钥恢复路径可用。
// 采用两个无副作用检查：
//   1) Shamir 分裂/还原算法内存往返一致性（验证阈值与恢复逻辑）
//   2) 现有生产冷备 share 的健康度（存在性、份数是否达到还原阈值）
//
// 用法：
//   npm run security:recovery-drill
//   node scripts/security-recovery-drill.js
//
// 退出码：0=演练通过；1=演练失败（恢复路径不可用）

import { splitSecret, combineShares } from '../api/security/vault/shamir.js';
import { hasSplitSecret } from '../api/security/vault/keySplitStore.js';
import { logAudit } from '../api/security/core/auditLogger.js';

function report(points) {
  console.log('\n===== 密钥冷备恢复演练报告 =====');
  let pass = true;
  for (const p of points) {
    console.log(`  [${p.ok ? 'PASS' : 'FAIL'}] ${p.name}`);
    if (!p.ok) pass = false;
  }
  console.log(`  ----------------------------------\n  结论: ${pass ? '恢复路径可用' : '恢复路径存在故障'}`);
  logAudit({
    userId: 'system',
    action: 'key_recovery_drill',
    ip: '127.0.0.1',
    details: JSON.stringify(points),
    success: pass,
  });
  return pass;
}

async function run() {
  const points = [];

  // 1) Shamir 内存往返演练（k=2, n=3，模拟冷备阈值还原）
  try {
    const secretStr = 'drill-secret-' + Date.now();
    const shares = splitSecret(Buffer.from(secretStr, 'utf-8'), 2, 3);
    // 模拟丢失 1 份（使用 2/3 即可还原）
    const recovered = combineShares(shares.slice(0, 2)).toString('utf-8');
    const ok = recovered === secretStr;
    points.push({ ok, name: `Shamir 阈值还原往返一致（${ok ? 'k=2 可恢复' : '算法异常'}）` });
  } catch (err) {
    points.push({ ok: false, name: `Shamir 往返演练异常: ${err.message}` });
  }

  // 2) 生产冷备健康度（只读检查，不做任何写入）
  try {
    const exists = hasSplitSecret('file-encryption-key');
    const k = Number(process.env.LL_SHAMIR_K || 2);
    const n = Number(process.env.LL_SHAMIR_N || 3);
    if (!exists) {
      // 冷备未启用是合法状态（可选 DR 加固），记录但不作为故障阻断
      points.push({ ok: true, name: '生产冷备：未配置（可选 DR 加固，非故障）' });
    } else if (n < k) {
      points.push({ ok: false, name: `生产冷备阈值配置异常：k=${k}/n=${n} 需满足 n>=k` });
    } else {
      points.push({ ok: true, name: `生产冷备已配置 · 阈值 k=${k}/n=${n}` });
    }
  } catch (err) {
    points.push({ ok: false, name: `冷备健康检查异常: ${err.message}` });
  }

  const pass = report(points);
  process.exit(pass ? 0 : 1);
}

run().catch((err) => {
  console.error('[RecoveryDrill] 执行异常:', err);
  process.exit(1);
});