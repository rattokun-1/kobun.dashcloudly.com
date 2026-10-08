/* Firebase Cloud Messaging for installed PWA notifications */
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyDHKbY8W78Z02at8GZa2fLX65AWo0TsezI",
    authDomain: "systan-app-v6.firebaseapp.com",
    projectId: "systan-app-v6",
    storageBucket: "systan-app-v6.firebasestorage.app",
    messagingSenderId: "932991616778",
    appId: "1:932991616778:web:661dc2452baa2ea1305cf3"
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = (payload.data && payload.data.title) || (payload.notification && payload.notification.title) || '古文単語マスター';
    const options = {
      body: (payload.data && payload.data.body) || (payload.notification && payload.notification.body) || '',
      icon: './assets/icons/icon.png',
      badge: './assets/icons/icon.png',
      data: payload.data || {},
      tag: payload.data && payload.data.tag ? payload.data.tag : 'kobun-master-notice'
    };
    self.registration.showNotification(title, options);
  });
} catch (e) {
  // Messagingが使えない環境でもPWAキャッシュは動かす
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) { await client.focus(); client.postMessage({type:'OPEN_NOTIFICATIONS'}); return; }
    }
    if (clients.openWindow) return clients.openWindow('./?view=notifications');
  })());
});

/* 古文単語マスター PWA Service Worker */
const CACHE_VERSION = '20260925-onboarding-v2.0';
const CACHE_NAME = 'kobun-master-' + CACHE_VERSION;

const APP_SHELL = [
  './',
  './index.html',
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
