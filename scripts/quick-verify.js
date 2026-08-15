async function test() {
  const base = 'http://localhost:3001';
  const frontend = 'http://localhost:3000';
  const adminEmail = 'admin@lingualeap.com';
  const adminPassword = process.env.ADMIN_PASSWORD || '59TaNVHw0S6V1je3!@33';
  let ok = true;

  function check(label, condition, debug) {
    if (condition) console.log('✅', label);
    else { console.log('❌', label, JSON.stringify(debug)); ok = false; }
  }

  // 1. Admin login without 2FA -> ADMIN_MFA_REQUIRED
  const c1 = await (await fetch(base + '/api/admin/captcha')).json();
  const r1 = await fetch(base + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, adminCaptchaId: c1.captchaId, adminCaptchaCode: c1.code })
  });
  const d1 = await r1.json();
  check('管理员未开2FA返回 ADMIN_MFA_REQUIRED', r1.status === 403 && d1.code === 'ADMIN_MFA_REQUIRED', d1);

  // 2. Normal login with admin credentials -> blocked
  const c2 = await (await fetch(base + '/api/captcha')).json();
  const r2 = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, captchaId: c2.captchaId, captchaCode: c2.code })
  });
  const d2 = await r2.json();
  check('普通登录接口拒绝管理员', r2.status === 403 && d2.message.includes('专用登录入口'), d2);

  // 3. Internal files blocked
  for (const p of ['/isolation-state.json', '/audit-log.json', '/data/audit-log.sqlite']) {
    const r = await fetch(base + p);
    check('后端阻止 ' + p, r.status === 403, r.status);
  }

  // 4. Frontend blocks sensitive source
  for (const p of ['/src/utils/environmentCheck.ts', '/src/components/AutoBugDetector.tsx']) {
    const r = await fetch(frontend + p);
    check('前端阻止 ' + p, r.status === 403 || r.status === 404, r.status);
  }

  // 5. Isolation endpoints require auth
  const r3 = await fetch(base + '/api/admin/isolation');
  check('隔离状态接口未登录返回401/403', r3.status === 401 || r3.status === 403, r3.status);

  console.log('\n' + (ok ? '✅ 全部通过' : '❌ 存在失败'));
  process.exit(ok ? 0 : 1);
}
test().catch(e => { console.error(e); process.exit(1); });
