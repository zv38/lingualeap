// ===== 数据持久化层 =====
// 支持双存储：加密 JSON（向后兼容）+ SQLite（新）
// 启动时从 SQLite 加载数据到内存，写入时同时写入 SQLite 和加密 JSON

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { readEncryptedFile, writeEncryptedFile } from './security/privacy/fileVault.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

let saveTimer = null;
let dbReady = false;

export async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // 目录已存在或创建失败时忽略
  }
}

/**
 * 从数据源加载用户数据
 * 优先从 SQLite 加载，如果 SQLite 没有数据则从加密 JSON 加载
 */
export async function loadUsers(usersDB) {
  await ensureDataDir();

  // 尝试从 SQLite 加载
  try {
    const { isReady, queryAll } = await import('./database/db.js');
    if (isReady()) {
      const rows = queryAll('SELECT * FROM users');
      if (rows.length > 0) {
        usersDB.clear();
        for (const row of rows) {
          const user = restoreUserFromDB(row);
          usersDB.set(user.id, user);
        }
        console.log(`[Persistence] 已从 SQLite 加载 ${rows.length} 个用户数据`);
        dbReady = true;
        return true;
      }
    }
  } catch (err) {
    // SQLite 不可用，降级到 JSON
  }

  // 兜底：从加密 JSON 加载
  try {
    const data = await readEncryptedFile(USERS_FILE);
    if (data === null) return false;
    const users = JSON.parse(data);
    if (Array.isArray(users)) {
      usersDB.clear();
      users.forEach(user => usersDB.set(user.id, user));
      console.log(`[Persistence] 已从加密 JSON 加载 ${users.length} 个用户数据`);
      return true;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Persistence] 加载用户数据失败:', err.message);
    }
  }
  return false;
}

/**
 * 保存用户数据到所有存储后端
 */
export async function saveUsers(usersDB) {
  await ensureDataDir();
  const users = Array.from(usersDB.values());

  // 1. 保存到加密 JSON（向后兼容）
  try {
    const plaintext = JSON.stringify(users, null, 2);
    await writeEncryptedFile(USERS_FILE, plaintext);
  } catch (err) {
    console.error('[Persistence] 保存加密 JSON 失败:', err.message);
  }

  // 2. 保存到 SQLite
  try {
    const { isReady, bulkInsert, execute } = await import('./database/db.js');
    if (isReady()) {
      // 清空并重新插入
      execute('DELETE FROM users');
      const rows = users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        password: user.password,
        avatar: user.avatar || '',
        level: user.level || 'beginner',
        created_at: user.createdAt || new Date().toISOString(),
        xp: user.xp ?? 0,
        total_xp: user.totalXP ?? 3000,
        streak_days: user.streakDays ?? 0,
        longest_streak: user.longestStreak ?? 0,
        daily_goal: user.dailyGoal ?? 30,
        reminder_time: user.reminderTime || '09:00',
        theme: user.theme || 'dark',
        language: user.language || 'zh',
        followers: JSON.stringify(user.followers || []),
        following: JSON.stringify(user.following || []),
        membership: user.membership || 'free',
        membership_type: user.membershipType || null,
        membership_bought_at: user.membershipBoughtAt || null,
        membership_expires_at: user.membershipExpiresAt || null,
        role: user.role || 'user',
        two_factor_enabled: user.twoFactorEnabled ? 1 : 0,
        admin_totp_enabled: user.adminTotpEnabled ? 1 : 0,
        updated_at: new Date().toISOString(),
      }));
      bulkInsert('users', rows);
    }
  } catch (err) {
    console.error('[Persistence] 保存 SQLite 失败:', err.message);
  }
}

/**
 * 从 SQLite 行数据还原为用户对象
 */
function restoreUserFromDB(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    avatar: row.avatar || '',
    level: row.level || 'beginner',
    createdAt: row.created_at,
    xp: row.xp ?? 0,
    totalXP: row.total_xp ?? 3000,
    streakDays: row.streak_days ?? 0,
    longestStreak: row.longest_streak ?? 0,
    dailyGoal: row.daily_goal ?? 30,
    reminderTime: row.reminder_time || '09:00',
    theme: row.theme || 'dark',
    language: row.language || 'zh',
    followers: parseJSON(row.followers, []),
    following: parseJSON(row.following, []),
    membership: row.membership || 'free',
    membershipType: row.membership_type || null,
    membershipBoughtAt: row.membership_bought_at || null,
    membershipExpiresAt: row.membership_expires_at || null,
    role: row.role || 'user',
    twoFactorEnabled: !!row.two_factor_enabled,
    adminTotpEnabled: !!row.admin_totp_enabled,
  };
}

function parseJSON(str, defaultVal) {
  if (!str) return defaultVal;
  try {
    return JSON.parse(str);
  } catch {
    return defaultVal;
  }
}

export function scheduleAutoSave(usersDB, intervalMs = 30000) {
  if (saveTimer) clearInterval(saveTimer);
  saveTimer = setInterval(() => {
    saveUsers(usersDB).catch(() => {});
  }, intervalMs);
}

export function debouncedSave(usersDB, delayMs = 500) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveUsers(usersDB).catch(() => {});
  }, delayMs);
}

// 简单的内存安全校验：只导出/导入不含敏感方法的数据
export function sanitizeUserForStorage(user) {
  const clone = { ...user };
  // 移除运行时状态，不持久化
  delete clone._socket;
  delete clone._session;
  return clone;
}