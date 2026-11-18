// push.js — Benachrichtigungen aufs Handy der Reinigungskraft (Web-Push an die Mitarbeiter-App, ohne App-Store).
// CleaningOS-Abgleich 18.11.2026, Baustein 3: „offene Schichten nach Krankmeldung automatisch per Push an Vertretungen".
// Vorher erschien eine Vertretungsanfrage erst, wenn die Kraft die App von selbst öffnete.
//
// Schlüssel (VAPID): erzeugt Glanzwerk beim ersten Gebrauch selbst und legt sie in den Einstellungen ab — es ist ein
// eigener Schlüssel dieses Servers, kein fremdes Geheimnis. Test: STAFFCLEAN_PUSH_TEST=1 → nichts geht ans Netz,
// die Nachrichten landen in P.gesendet.
'use strict';
const DB = require('./db');

function tabellen(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_abo (
    id INTEGER PRIMARY KEY, mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, angelegt_am TEXT DEFAULT (datetime('now','localtime')))`);
}

function schluessel(db) {
  const e = DB.einstellungen(db);
  if (e.push_vapid_public && e.push_vapid_private) return { public: e.push_vapid_public, private: e.push_vapid_private };
  const k = require('web-push').generateVAPIDKeys();
  const set = db.prepare('INSERT INTO einstellung (schluessel, wert) VALUES (?,?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert');
  set.run('push_vapid_public', k.publicKey); set.run('push_vapid_private', k.privateKey);
  return { public: k.publicKey, private: k.privateKey };
}

function abonnieren(db, mid, abo) {
  if (!abo || !abo.endpoint || !/^https:\/\//.test(abo.endpoint) || !abo.keys || !abo.keys.p256dh || !abo.keys.auth) throw new Error('Benachrichtigung konnte nicht eingerichtet werden.');
  db.prepare('INSERT INTO push_abo (mitarbeiter_id, endpoint, p256dh, auth) VALUES (?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET mitarbeiter_id = excluded.mitarbeiter_id, p256dh = excluded.p256dh, auth = excluded.auth')
    .run(Number(mid), String(abo.endpoint), String(abo.keys.p256dh), String(abo.keys.auth));
}
function abbestellen(db, mid, endpoint) { db.prepare('DELETE FROM push_abo WHERE mitarbeiter_id = ? AND (? IS NULL OR endpoint = ?)').run(Number(mid), endpoint || null, endpoint || null); }
function aktiv(db, mid) { return !!db.prepare('SELECT 1 FROM push_abo WHERE mitarbeiter_id = ?').get(Number(mid)); }

const gesendet = [];
// An eine Kraft senden. Gibt die Zahl der erreichten Geräte zurück; abgelaufene Abos werden entfernt.
async function senden(db, mid, n) {
  const abos = db.prepare('SELECT * FROM push_abo WHERE mitarbeiter_id = ?').all(Number(mid));
  if (!abos.length) return 0;
  const inhalt = JSON.stringify({ titel: String(n.titel || 'Glanzwerk').slice(0, 80), text: String(n.text || '').slice(0, 240), url: n.url || '/app' });
  if (process.env.STAFFCLEAN_PUSH_TEST === '1') { abos.forEach(function () { gesendet.push({ mitarbeiter_id: Number(mid), inhalt: JSON.parse(inhalt) }); }); return abos.length; }
  const wp = require('web-push'), k = schluessel(db), e = DB.einstellungen(db);
  wp.setVapidDetails('mailto:' + (e.firma_email || e.mail_absender || 'info@staffclean.de'), k.public, k.private);
  let ok = 0;
  for (const a of abos) {
    try { await wp.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, inhalt, { TTL: 6 * 3600 }); ok++; }
    catch (x) { if (x.statusCode === 404 || x.statusCode === 410) db.prepare('DELETE FROM push_abo WHERE id = ?').run(a.id); else console.error('Push fehlgeschlagen:', x.statusCode || '', x.message); }
  }
  return ok;
}
// Ohne Warten (Anfrage soll nicht am Netz des Push-Dienstes hängen)
function nebenbei(db, mid, n) { senden(db, mid, n).catch(function (e) { console.error('Push:', e.message); }); }

module.exports = { tabellen, schluessel, abonnieren, abbestellen, aktiv, senden, nebenbei, gesendet };
