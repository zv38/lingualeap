import { useState, useEffect, useRef } from "react";
import { Bell, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store/useStore";

const notificationTypeLabels: Record<string, string> = {
  study_reminder: "学习提醒",
  streak_alert: "连续学习提醒",
  achievement_unlocked: "成就解锁",
  daily_challenge: "每日挑战",
  new_follower: "新关注者",
  system: "系统通知",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notifications = useStore((s) => s.notifications);
  const markAllRead = useStore((s) => s.markAllNotificationsRead);
  const deleteNotification = useStore((s) => s.deleteNotification);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-[var(--accent-primary)] text-[var(--text-on-accent)] rounded-full text-[10px] flex items-center justify-center font-sans">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-12 w-80 liquid-glass rounded-[1.5rem] p-4 z-50"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-lg text-[var(--text-primary)]">通知</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[var(--accent-primary)] text-sm flex items-center gap-1 hover:underline"
                >
                  <Check className="w-3 h-3" />
                  全部已读
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="text-[var(--text-muted)] text-center py-8 font-sans text-sm">
                  暂无通知
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex gap-3 p-3 rounded-xl hover:bg-[var(--accent-primary)]/5 transition-colors group"
                  >
                    <div className="mt-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          n.read ? "bg-[var(--success)]" : "bg-[var(--accent-primary)]"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans text-sm text-[var(--text-primary)] truncate">
                        {notificationTypeLabels[n.type] || n.type}
                      </p>
                      <p className="font-mono text-xs text-[var(--text-muted)]">
                        {n.time}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--border-primary)] text-center">
                <button className="text-[var(--accent-primary)] text-sm hover:underline">
                  查看全部
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
