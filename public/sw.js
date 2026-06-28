// 自毁版 Service Worker（kill-switch）。
// 旧版本（koc-v*）对静态资源缓存优先，会把旧代码锁死，导致改动看不到 / 白屏。
// 这一版不缓存、不拦截任何请求；激活时清空所有缓存、注销自己、并刷新所有页面，
// 让浏览器永远拿到服务器上的最新版本。
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          client.navigate(client.url);
        } catch {
          /* ignore */
        }
      }
    })(),
  );
});

// 没有 fetch 处理器：一切请求直接走网络，确保永远是最新的。
