-- ===== 001_initial.sql =====
-- 初始数据库 Schema
-- 创建所有基础表结构和索引

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  avatar TEXT DEFAULT '',
  level TEXT DEFAULT 'beginner',
  created_at TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  total_xp INTEGER DEFAULT 3000,
  streak_days INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  daily_goal INTEGER DEFAULT 30,
  reminder_time TEXT DEFAULT '09:00',
  theme TEXT DEFAULT 'dark',
  language TEXT DEFAULT 'zh',
  followers TEXT DEFAULT '[]',
  following TEXT DEFAULT '[]',
  membership TEXT DEFAULT 'free',
  membership_type TEXT,
  membership_bought_at TEXT,
  membership_expires_at TEXT,
  role TEXT DEFAULT 'user',
  two_factor_enabled INTEGER DEFAULT 0,
  admin_totp_enabled INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bug 报告表
CREATE TABLE IF NOT EXISTS bug_reports (
  id TEXT PRIMARY KEY,
  incident_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT '功能异常',
  severity TEXT DEFAULT 'low',
  status TEXT DEFAULT 'open',
  email TEXT DEFAULT '',
  browser_info TEXT,
  screenshots TEXT DEFAULT '[]',
  video_url TEXT,
  video_meta TEXT,
  auto_detected INTEGER DEFAULT 0,
  context TEXT,
  type TEXT DEFAULT 'unknown',
  url TEXT DEFAULT '',
  user_id TEXT,
  username TEXT,
  ai_analysis TEXT,
  admin_response TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 调查问卷表
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  questions TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  status TEXT DEFAULT 'draft',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 问卷回答表
CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  user_id TEXT,
  answers TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (survey_id) REFERENCES surveys(id)
);

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data TEXT,
  read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 已吊销 Token 表
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT,
  reason TEXT,
  revoked_at TEXT NOT NULL
);

-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  success INTEGER DEFAULT 1,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);