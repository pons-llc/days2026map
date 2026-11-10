/* CD26 観覧アプリ Service Worker（オフライン対応・通知タップ処理） */
const CACHE = 'cd26-v3';
const NAV_TIMEOUT_MS = 3000; // この時間内にネットから返ってこなければ保存済みの版を表示
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'data.js',
  'manifest.webmanifest',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'img/map.jpg',
  'img/icon-180.png',
  'img/icon-192.png',
  'img/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  if (req.mode === 'navigate') {
    // ページ本体はネットワーク優先（更新を早く反映）。
    // ただし会場など電波が弱いときに待たされないよう、一定時間で保存済みの版に切り替える
    const net = fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        return caches.open(CACHE).then(c => c.put('index.html', copy)).then(() => res);
      }
      return res;
    });
    e.waitUntil(net.catch(() => {})); // 切り替え後も裏で取得を続け、次回のためにキャッシュを更新
    e.respondWith(
      caches.match('index.html').then(cached => {
        if (!cached) return net; // まだ保存していなければ待つしかない
        const timeout = new Promise(resolve => setTimeout(() => resolve(cached), NAV_TIMEOUT_MS));
        // 通信失敗やサーバーエラーのときも保存済みの版を出す
        return Promise.race([net.then(res => (res.ok ? res : cached), () => cached), timeout]);
      })
    );
    return;
  }

  // それ以外はキャッシュ優先＋裏で更新
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) {
      const copy = res.clone();
      return caches.open(CACHE).then(c => c.put(req, copy)).then(() => res);
    }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(
    caches.match(req).then(cached => cached || net)
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
