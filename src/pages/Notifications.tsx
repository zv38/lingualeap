import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  Trash2,
  BookOpen,
  Trophy,
  Zap,
  User,
  Settings,
  Info,
  Clock,
  Filter,
  ClipboardList,
  ShieldAlert,
  Smartphone,
  Lock,
  FileDown,
} from "lucide-react";
import { useStore, Notification } from "../store/useStore";
import EmptyState from "../components/EmptyState";
import Tooltip from "../components/Tooltip";

const API_BASE = '/api';

const typeIconMap: Record<string, React.ElementType> = {
  study_reminder: BookOpen,
  streak_alert: Zap,
  achievement_unlocked: Trophy,
  daily_challenge: Zap,
  new_follower: User,
  system: Settings,
  survey: ClipboardList,
  security_alert: ShieldAlert,
  login_new_device: Smartphone,
  password_changed: Lock,
  data_export: FileDown,
  sensitive_operation: ShieldAlert,
};

const typeLabelMap: Record<string, string> = {
  study_reminder: "学习提醒",
  streak_alert: "连续学习提醒",
  achievement_unlocked: "成就解锁",
  daily_challenge: "每日挑战",
  new_follower: "新关注",
  system: "系统通知",
  survey: "调查问卷",
  security_alert: "安全提醒",
  login_new_device: "新设备登录",
  password_changed: "密码变更",
  data_export: "数据导出",
  sensitive_operation: "敏感操作",
};

const filterTabs = [
  { key: "all", label: "全部" },
  { key: "unread", label: "未读" },
  { key: "security_alert", label: "安全" },
  { key: "system", label: "系统" },
  { key: "survey", label: "问卷" },
  { key: "achievement_unlocked", label: "成就" },
  { key: "study_reminder", label: "学习" },
];

export default function Notifications() {
  const navigate = useNavigate();
  const storeNotifications = useStore((s) => s.notifications);
  const [activeFilter, setActiveFilter] = useState("all");
  const [remoteNotifications, setRemoteNotifications] = useState<Notification[]>([]);
  const [localNotifs, setLocalNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/notifications`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          const mapped: Notification[] = data.data.map((n: any) => ({
            id: n.id,
            type: n.type || 'system',
            title: n.title,
            message: n.message || '',
            time: formatTime(n.time),
            read: n.read || false,
            link: n.link || undefined,
          }));
          setRemoteNotifications(mapped);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const mapped: Notification[] = storeNotifications.map(n => ({
      ...n,
      link: (n as any).link || undefined,
    }));
    setLocalNotifs(mapped);
  }, [storeNotifications]);

  const allNotifications = useMemo(() => {
    const seen = new Set<string>();
    const merged: Notification[] = [];
    [...remoteNotifications, ...localNotifs].forEach(n => {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        merged.push(n);
      }
    });
    return merged;
  }, [remoteNotifications, localNotifs]);

  const unreadCount = useMemo(
    () => allNotifications.filter((n) => !n.read).length,
    [allNotifications]
  );

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "all") return allNotifications;
    if (activeFilter === "unread") return allNotifications.filter((n) => !n.read);
    return allNotifications.filter((n) => n.type === activeFilter);
  }, [activeFilter, allNotifications]);

  const markAsRead = (id: string) => {
    fetch(`${API_BASE}/api/notifications/${id}/read`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    setRemoteNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setLocalNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllRead = () => {
    fetch(`${API_BASE}/api/notifications/read-all`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    setRemoteNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setLocalNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    fetch(`${API_BASE}/notifications/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => {});
    setRemoteNotifications((prev) => prev.filter((n) => n.id !== id));
    setLocalNotifs((prev) => prev.filter((n) => n.id !== id));
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  function formatTime(iso: string) {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return '刚刚';
      if (mins < 60) return `${mins}分钟前`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}小时前`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}天前`;
      return new Date(iso).toLocaleDateString('zh-CN');
    } catch {
      return iso;
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen bg-[var(--bg-primary)] pt-24 pb-16 px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
          className="flex items-center justify-between mb-10"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/[0.08] flex items-center justify-center">
              <Bell className="w-6 h-6 text-[var(--accent-primary)]" />
            </div>
            <div>
              <h1 className="font-serif text-3xl gradient-text">通知中心</h1>
              <p className="text-[var(--text-muted)] text-sm mt-1 font-sans">
                {loading ? '加载中...' : `${allNotifications.length} 条通知`}
                {!loading && unreadCount > 0 && (
                  <span className="text-[var(--accent-primary)] ml-2">
                    · {unreadCount} 条未读
                  </span>
                )}
              </p>
            </div>
          </div>

          {unreadCount > 0 && (
            <Tooltip content="标记所有为已读">
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                onClick={markAllRead}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 transition-colors text-sm font-sans font-medium"
              >
                <Check className="w-4 h-4" />
                全部已读
              </motion.button>
            </Tooltip>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
          className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide"
        >
          <Filter className="w-4 h-4 text-[var(--text-muted)] mr-1 flex-shrink-0" />
          {filterTabs.map((tab) => (
            <Tooltip key={tab.key} content={`${tab.label}通知`}>
              <button
                onClick={() => setActiveFilter(tab.key)}
                className={`px-4 py-2 rounded-xl text-sm font-sans font-medium whitespace-nowrap transition-all duration-300 ${
                  activeFilter === tab.key
                    ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent hover:bg-black/[0.02]"
                }`}
              >
                {tab.label}
                {tab.key === "all" && (
                  <span className="ml-1.5 text-xs opacity-60">
                    {allNotifications.length}
                  </span>
                )}
                {tab.key === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 text-xs text-[var(--accent-primary)]">
                    {unreadCount}
                  </span>
                )}
              </button>
            </Tooltip>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-20"
            >
              <div className="w-6 h-6 border-2 border-[var(--accent-primary)]/30 border-t-[var(--accent-primary)] rounded-full animate-spin" />
            </motion.div>
          ) : filteredNotifications.length === 0 ? (
            <EmptyState
              icon={<Bell size={48} />}
              title="暂无通知"
              description={activeFilter === "unread" ? "所有通知都已阅读" : "该分类下没有通知"}
            />
          ) : (
            <motion.div
              key="list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              {filteredNotifications.map((notification) => {
                const IconComponent =
                  typeIconMap[notification.type] || Info;
                const typeLabel =
                  typeLabelMap[notification.type] || notification.type;
                const hasLink = !!notification.link;

                return (
                  <motion.div
                    key={notification.id}
                    variants={itemVariants}
                    layout
                    onClick={() => handleNotificationClick(notification)}
                    className={`group relative liquid-glass rounded-2xl p-5 cursor-pointer transition-all duration-300 hover:bg-[var(--accent-primary)]/[0.03] ${
                      !notification.read
                        ? "border-l-2 border-[var(--accent-primary)]"
                        : "border-l-2 border-transparent"
                    } ${hasLink ? 'hover:border-l-[var(--success)]' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          !notification.read
                            ? "bg-[var(--accent-primary)]/[0.1]"
                            : "bg-black/[0.03]"
                        }`}
                      >
                        <IconComponent
                          className={`w-5 h-5 ${
                            !notification.read
                              ? "text-[var(--accent-primary)]"
                              : "text-[var(--text-muted)]"
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3
                                className={`font-serif text-base ${
                                  !notification.read
                                    ? "text-[var(--text-primary)]"
                                    : "text-[var(--text-secondary)]"
                                }`}
                              >
                                {notification.title}
                              </h3>
                              {!notification.read && (
                                <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] flex-shrink-0" />
                              )}
                              {hasLink && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--success)]/10 text-[var(--success)] font-medium">
                                  可跳转
                                </span>
                              )}
                            </div>
                            {notification.message && (
                              <p className="text-[var(--text-muted)] text-sm leading-relaxed font-sans">
                                {notification.message}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                              <span className="text-[var(--text-muted)] text-xs font-mono">
                                {notification.time}
                              </span>
                              <span className="text-[var(--text-muted)]/40 text-xs">·</span>
                              <span className="text-[var(--text-muted)]/60 text-xs font-sans">
                                {typeLabel}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.read && (
                              <Tooltip content="标记为已读">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(notification.id);
                                  }}
                                  className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10 transition-colors"
                                  title="标记为已读"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              </Tooltip>
                            )}
                            <Tooltip content="删除通知">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteNotification(notification.id);
                                }}
                                className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--warning)] hover:bg-[var(--warning)]/10 transition-colors"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
