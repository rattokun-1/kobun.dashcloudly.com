/* ことのは単語 PWA Service Worker */
const CACHE_VERSION = '20261007-ui-v2.1';
const CACHE_NAME = 'kobun-master-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './login.html',
  './maintenance.html',
  './update.html',
  './manifest.json',
  './assets/css/main.css',
  './assets/js/app.js',
  './assets/icons/icon.png',
  './admin.html',
  './teacher.html'
];

const RUNTIME_CACHE_TARGETS = [
  'https://fonts.googleapis.com/',
  'https://fonts.gstatic.com/',
  'https://www.gstatic.com/firebasejs/'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of APP_SHELL) {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        // アイコン未配置などでもPWA本体は止めない
      }
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => key.startsWith('kobun-master-') && key !== CACHE_NAME ? caches.delete(key) : null));
    await self.clients.claim();
  })());
});

function shouldRuntimeCache(url) {
  return RUNTIME_CACHE_TARGETS.some(prefix => url.href.startsWith(prefix));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase API / Googleログイン関連はキャッシュしない
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('securetoken') ||
    url.hostname.includes('accounts.google.com')
  ) return;

  // HTML は network-first。更新反映を優先し、失敗時だけ端末キャッシュを使う
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return (await cache.match(req)) || (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // App files are network-first: a deployed update should win over an older offline copy.
  // If the network is unavailable, serve the last saved version without clearing user data.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh.ok) {
          if (url.pathname.endsWith('/sw.js')) return fresh;
          await cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        return (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  if (shouldRuntimeCache(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok || fresh.type === 'opaque') cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return cached || Response.error();
      }
    })());
  }
});
