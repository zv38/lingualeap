import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readEncryptedFileSync, writeEncryptedFileSync } from '../privacy/fileVault.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

const MAX_NOTIFICATIONS_PER_USER = 200;

function readNotifications() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const raw = readEncryptedFileSync(NOTIFICATIONS_FILE, { context: 'notifications.json' });
    if (raw === null || raw.trim() === '') return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('[UserNotifications] 读取通知失败:', err.message);
    return [];
  }
}

function writeNotifications(notifications) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const plaintext = JSON.stringify(notifications, null, 2);
    writeEncryptedFileSync(NOTIFICATIONS_FILE, plaintext, { context: 'notifications.json' });
  } catch (err) {
    console.error('[UserNotifications] 写入通知失败:', err.message);
  }
}

function makeId() {
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const SECURITY_NOTIFICATION_TYPES = {
  LOGIN_NEW_DEVICE: 'login_new_device',
  PASSWORD_CHANGED: 'password_changed',
  SENSITIVE_OPERATION: 'sensitive_operation',
  FAILED_LOGIN_ATTEMPTS: 'failed_login_attempts',
  SECURITY_SETTING_CHANGED: 'security_setting_changed',
  PAYMENT_PROTECTION_TRIGGERED: 'payment_protection_triggered',
  DATA_EXPORT: 'data_export',
  SYSTEM_ISOLATION_TRIGGERED: 'system_isolation_triggered',
};

export function createSecurityNotification({
  userId,
  type,
  title,
  message,
  link,
  metadata = {},
}) {
  if (!userId || !title) return null;

  const notifications = readNotifications();
  const notification = {
    id: makeId(),
    category: 'security',
    type: type || 'security_alert',
    title,
    message: message || '',
    link: link || null,
    userId,
    read: false,
    time: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    metadata,
  };

  notifications.unshift(notification);

  // 按用户限制数量，避免文件无限增长
  const userNotifs = notifications.filter(n => n.userId === userId);
  if (userNotifs.length > MAX_NOTIFICATIONS_PER_USER) {
    const toRemove = userNotifs.slice(MAX_NOTIFICATIONS_PER_USER);
    const removeIds = new Set(toRemove.map(n => n.id));
    const filtered = notifications.filter(n => !removeIds.has(n.id));
    writeNotifications(filtered);
  } else {
    writeNotifications(notifications);
  }

  return notification;
}

export function getUserNotifications(userId, options = {}) {
  const { limit = 100, category, unreadOnly } = options;
  const notifications = readNotifications();
  let result = notifications.filter(n => n.userId === userId);
  if (category) result = result.filter(n => n.category === category);
  if (unreadOnly) result = result.filter(n => !n.read);
  return result.slice(0, limit);
}

export function getUnreadCount(userId, options = {}) {
  const { category } = options;
  const notifications = readNotifications();
  return notifications.filter(n => n.userId === userId && !n.read && (!category || n.category === category)).length;
}

export function markNotificationAsRead(userId, notificationId) {
  const notifications = readNotifications();
  const notif = notifications.find(n => n.id === notificationId && n.userId === userId);
  if (!notif) return false;
  notif.read = true;
  writeNotifications(notifications);
  return true;
}

export function markAllNotificationsAsRead(userId, options = {}) {
  const { category } = options;
  const notifications = readNotifications();
  let changed = false;
  notifications.forEach(n => {
    if (n.userId === userId && !n.read && (!category || n.category === category)) {
      n.read = true;
      changed = true;
    }
  });
  if (changed) writeNotifications(notifications);
  return changed;
}

export function deleteNotification(userId, notificationId) {
  const notifications = readNotifications();
  const idx = notifications.findIndex(n => n.id === notificationId && n.userId === userId);
  if (idx === -1) return false;
  notifications.splice(idx, 1);
  writeNotifications(notifications);
  return true;
}
