const CACHE_NAME = 'lingualeap-v1'
const STATIC_ASSETS = [
  '/',
  '/offline.html',
]

const isStaticAsset = (url) => {
  const staticPatterns = [
    /\.(js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$/i,
    /\/assets\//i,
  ]
  return staticPatterns.some(pattern => pattern.test(url))
}

const isApiCall = (url) => {
  return url.startsWith('/api/')
}

// 安装时缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// 网络优先策略：先尝试网络，失败则回退缓存
const networkFirst = async (request) => {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
    // API 请求无缓存时返回 JSON 错误
    if (isApiCall(request.url)) {
      return new Response(
        JSON.stringify({ error: 'offline', message: '当前无网络连接' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
    // 导航请求返回离线页面
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html')
      if (offlinePage) return offlinePage
    }
    throw error
  }
}

// 缓存优先策略：先检查缓存，未命中则发起网络请求
const cacheFirst = async (request) => {
  const cachedResponse = await caches.match(request)
  if (cachedResponse) {
    return cachedResponse
  }
  try {
    const networkResponse = await fetch(request)
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html')
      if (offlinePage) return offlinePage
    }
    throw error
  }
}

// 请求拦截
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 仅处理同源请求
  if (url.origin !== self.location.origin) return

  // API 请求使用网络优先
  if (isApiCall(url.pathname)) {
    event.respondWith(networkFirst(request))
    return
  }

  // 静态资源使用缓存优先
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 导航请求使用网络优先（带离线回退）
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  // 其他请求使用网络优先
  event.respondWith(networkFirst(request))
})