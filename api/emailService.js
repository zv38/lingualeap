import nodemailer from 'nodemailer';

let transporter = null;

function createTransport() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

export function isEmailConfigured() {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

export async function sendResetCode(email, code) {
  // 生产环境：未配置邮件服务直接拒绝，绝不在响应中泄露验证码
  if (!isEmailConfigured()) {
    console.warn('[Email] 邮件服务未配置，拒绝发送密码重置码');
    return { success: false, message: '邮件服务未配置' };
  }

  try {
    if (!transporter) transporter = createTransport();
    if (!transporter) {
      return { success: false, message: '邮件服务初始化失败' };
    }

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM || 'LinguaLeap'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '重置您的 LinguaLeap 密码',
      html: `
        <div style="max-width:480px;margin:0 auto;font-family:sans-serif;padding:24px;background:#faf8f5;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:28px;font-weight:800;background:linear-gradient(135deg,#f5c542,#e88520);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">LinguaLeap</div>
          </div>
          <div style="background:white;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <h2 style="margin:0 0 8px;font-size:18px;color:#1a1816;">重置密码</h2>
            <p style="margin:0 0 20px;font-size:14px;color:#6B6560;">您收到此邮件是因为有人请求重置 LinguaLeap 账号的密码。如果这不是您本人操作，请忽略此邮件。</p>
            <div style="text-align:center;margin:24px 0;">
              <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#e88520;background:#faf8f5;padding:16px 24px;border-radius:8px;display:inline-block;font-family:monospace;">${code}</div>
            </div>
            <p style="font-size:12px;color:#999490;text-align:center;">验证码有效期 15 分钟</p>
          </div>
          <p style="font-size:11px;color:#c0b8b0;text-align:center;margin-top:16px;">LinguaLeap 智能语言学习平台</p>
        </div>
      `,
    });

    console.log('[Email] 验证码已发送至 ' + email);
    return { success: true };
  } catch (err) {
    console.error('[Email] 发送失败:', err.message);
    return { success: false, message: '邮件发送失败' };
  }
}

export function getEmailInfo() {
  if (isEmailConfigured()) {
    return { mode: 'production', host: process.env.EMAIL_HOST, user: process.env.EMAIL_USER };
  }
  return { mode: 'disabled', hint: '邮件服务未配置' };
}