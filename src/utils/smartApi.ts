import { request } from './api'
import { fetchWithCache, invalidateCache } from './apiCache'

// 智能加载 API：对高频、变化慢的数据做 SWR 缓存

const cacheKeys = {
  membership: 'membership:status',
  notifications: 'notifications:list',
  unreadCount: 'notifications:unread',
  userProfile: 'user:profile',
  courses: 'courses:list',
  leaderboard: 'leaderboard:list',
}

export const smartApi = {
  getMembership(forceRefresh = false) {
    return fetchWithCache(
      cacheKeys.membership,
      () => request('/membership'),
      { staleMs: 30 * 1000, maxAgeMs: 5 * 60 * 1000, forceRefresh }
    )
  },

  getNotifications(category?: string, forceRefresh = false) {
    const key = category ? `${cacheKeys.notifications}:${category}` : cacheKeys.notifications
    return fetchWithCache(
      key,
      () => request(`/notifications${category ? `?category=${category}` : ''}`),
      { staleMs: 15 * 1000, maxAgeMs: 2 * 60 * 1000, forceRefresh }
    )
  },

  getUnreadCount(forceRefresh = false) {
    return fetchWithCache(
      cacheKeys.unreadCount,
      () => request('/notifications/unread-count'),
      { staleMs: 10 * 1000, maxAgeMs: 60 * 1000, forceRefresh }
    )
  },

  getUserProfile(forceRefresh = false) {
    return fetchWithCache(
      cacheKeys.userProfile,
      () => request('/me'),
      { staleMs: 60 * 1000, maxAgeMs: 10 * 60 * 1000, forceRefresh }
    )
  },

  getCourses(forceRefresh = false) {
    return fetchWithCache(
      cacheKeys.courses,
      () => request('/courses'),
      { staleMs: 60 * 1000, maxAgeMs: 10 * 60 * 1000, forceRefresh }
    )
  },

  getLeaderboard(forceRefresh = false) {
    return fetchWithCache(
      cacheKeys.leaderboard,
      () => request('/leaderboard'),
      { staleMs: 60 * 1000, maxAgeMs: 5 * 60 * 1000, forceRefresh }
    )
  },

  invalidateMembership() {
    invalidateCache(cacheKeys.membership)
  },

  invalidateNotifications() {
    invalidateCache(cacheKeys.notifications)
    invalidateCache(cacheKeys.unreadCount)
  },
}
