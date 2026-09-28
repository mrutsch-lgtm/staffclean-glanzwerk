// sw.js — Offline-Hülle der Mitarbeiter-App: Seite, Stil, Skripte, Schrift und Logo liegen im Gerät.
// Schnittstelle (/api) und Fotos gehen immer ans Netz — Daten werden nie zwischengespeichert.
const STAND = 'glanzwerk-v4';
const HUELLE = ['/app', '/css/stil.css', '/js/ui.js', '/js/app.js', '/js/komm.js', '/js/jsQR.js', '/bilder/glanzwerk-logo-hell.png', '/bilder/favicon-32.png', '/bilder/glanzwerk-icon-192.png', '/schrift/inter-latin.woff2', '/manifest.webmanifest'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(STAND).then(function (c) { return c.addAll(HUELLE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (l) { return Promise.all(l.filter(function (k) { return k !== STAND; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || HUELLE.indexOf(u.pathname) < 0) return;
  // Netz zuerst (immer frisch), ohne Netz aus dem Gerät
  e.respondWith(fetch(e.request).then(function (r) { const k = r.clone(); caches.open(STAND).then(function (c) { c.put(e.request, k); }); return r; }).catch(function () { return caches.match(e.request); }));
});
