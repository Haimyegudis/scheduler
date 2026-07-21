// Minimal service worker: PWA installability + web push notifications.
// No offline caching is implemented — this SW exists to satisfy PWA install
// requirements and to receive/show push notifications.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = { title: 'HP Indigo Scheduler', body: '' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }
  const title = data.title || 'HP Indigo Scheduler';
  const options = {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsList) {
        if ('focus' in client) {
          client.navigate('/');
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })()
  );
});
