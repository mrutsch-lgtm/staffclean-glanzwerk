// sw.js — Offline-Hülle der Mitarbeiter-App: Seite, Stil, Skripte, Schrift und Logo liegen im Gerät.
// Schnittstelle (/api) und Fotos gehen immer ans Netz — Daten werden nie zwischengespeichert.
// Seit 18.11.2026 auch Benachrichtigungen (Web-Push): Vertretungsanfragen, Tickets, Alarme — Tippen öffnet die App.
const STAND = 'glanzwerk-v7';
const HUELLE = ['/app', '/css/stil.css', '/js/ui.js', '/js/app.js', '/js/komm.js', '/js/jsQR.js', '/bilder/logo-hell.webp', '/bilder/favicon-32.png', '/bilder/glanzwerk-icon-192.png', '/schrift/inter-latin.woff2', '/manifest.webmanifest'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(STAND).then(function (c) { return c.addAll(HUELLE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (l) { return Promise.all(l.filter(function (k) { return k !== STAND; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || HUELLE.indexOf(u.pathname) < 0) return;
  // Netz zuerst (immer frisch), ohne Netz aus dem Gerät
  e.respondWith(fetch(e.request).then(function (r) { const k = r.clone(); caches.open(STAND).then(function (c) { c.put(e.request, k); }); return r; }).catch(function () { return caches.match(e.request); }));
});
self.addEventListener('push', function (e) {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { text: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titel || 'Glanzwerk', { body: d.text || '', icon: '/bilder/glanzwerk-icon-192.png', badge: '/bilder/favicon-32.png', data: { url: d.url || '/app' }, tag: d.titel || 'glanzwerk', renotify: true }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const ziel = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (const c of l) { if (new URL(c.url).pathname === '/app' && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(ziel);
  }));
});
