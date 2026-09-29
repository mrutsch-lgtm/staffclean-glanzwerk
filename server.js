// server.js — Glanzwerk (StaffClean-Software): Büro, Mitarbeiter-App, Kundenportal, Schnittstelle.
// Start: node server.js → http://127.0.0.1:8790   ·  /app  ·  /kunde  ·  /gestaltung
// Rollen: buero (alles) · mitarbeiter (nur eigene Einsätze, /api/app/*) · kunde (nur eigene Objekte, /api/kunde/*)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const QR = require('qrcode');
const DB = require('./lib/db');
const Z = require('./lib/zugang');
const PLAN = require('./lib/plan');
const T = require('./lib/turnus');
const LV = require('./lib/lv-import');
const DEMO = require('./lib/demo');
const KALK = require('./lib/kalkulation');
const QUAL = require('./lib/qualitaet');
const EINS = require('./lib/einsatz');
const GEO = require('./lib/geo');
const DP = require('./lib/dienstplan');
const AB = require('./lib/abrechnung');
const KAT = require('./lib/katalog');
const PDFR = require('./lib/pdf/rechnung');
const BRIEF = require('./lib/pdf/brief');
const MW = require('./lib/mahnwesen');
const PERS = require('./lib/personal');
const OA = require('./lib/objektakte');

const PORT = Number(process.env.STAFFCLEAN_PORT || 8790);
const HOST = process.env.STAFFCLEAN_HOST || '127.0.0.1';
const SICHER = process.env.STAFFCLEAN_HTTPS === '1';
const WEB = path.join(__dirname, 'web');
const FOTOS = path.join(DB.ORDNER, 'fotos');
fs.mkdirSync(FOTOS, { recursive: true });
const PERSONAL = path.join(DB.ORDNER, 'personal');   // Dokumente der Personalakten — nur über die Büro-Schnittstelle erreichbar
fs.mkdirSync(PERSONAL, { recursive: true });
const plusTageIso = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const db = DB.oeffnen();
Z.tabellen(db);
const KOMM = require('./lib/kommunikation');
KOMM.tabellen(db);
const BW = require('./lib/bewerber');
BW.tabellen(db);
const AUSW = require('./lib/auswertung');
const CTRL = require('./lib/controlling');
CTRL.tabellen(db);
db.exec("CREATE TABLE IF NOT EXISTS anmeldung_log (id INTEGER PRIMARY KEY, rolle TEXT, wer_id INTEGER, name TEXT, zeit TEXT DEFAULT (datetime('now','localtime')))");
const REP = require('./lib/reports');
const RG = require('./lib/register');
RG.tabellen(db);
const UW = require('./lib/unterweisung');
UW.tabellen(db);
const REGDATEIEN = path.join(DB.ORDNER, 'register');   // Sicherheitsdatenblätter, Verträge, Nachweise — nur Büro
fs.mkdirSync(REGDATEIEN, { recursive: true });
if (process.env.STAFFCLEAN_DEMO !== '0' && DEMO.anlegen(db)) console.log('Beispieldaten angelegt.');

const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const jetzt = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
const TYPEN = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
class Fehler extends Error { constructor(code, text) { super(text); this.code = code; } }

function json(res, code, daten, kopf) { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, kopf || {})); res.end(JSON.stringify(daten)); }
function roh(req, grenze) { return new Promise(function (ok, nein) { const teile = []; let n = 0; req.on('data', function (c) { n += c.length; if (n > grenze) { nein(new Fehler(413, 'Datei zu groß')); req.destroy(); } else teile.push(c); }); req.on('end', function () { ok(Buffer.concat(teile)); }); req.on('error', nein); }); }
async function leib(req) { const b = await roh(req, 15e6); try { return JSON.parse(b.toString('utf8') || '{}'); } catch (e) { return {}; } }
// Hinter einem Webserver (Caddy, STAFFCLEAN_PROXY=1) kommt JEDE Anfrage von 127.0.0.1 — „direkt am Rechner" gilt
// dort also nie, und die echte Adresse steht in X-Forwarded-For (nur vom eigenen Proxy übernommen).
const HINTER_PROXY = process.env.STAFFCLEAN_PROXY === '1';
const vomRechner = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const lokal = req => !HINTER_PROXY && vomRechner(req);
const adresse = req => (HINTER_PROXY && vomRechner(req) && req.headers['x-forwarded-for']) ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
// Einrichtungscode: im Netz lässt sich das erste Büro-Konto nur mit diesem Code anlegen. Er steht beim Start im
// Server-Protokoll (Deploy-Log bei GitHub, nur für Manuel sichtbar) und verfällt, sobald das Konto angelegt ist.
let einrichtungscode = null;
function einrichtungscodePruefen() {
  const offen = !db.prepare("SELECT COUNT(*) n FROM benutzer WHERE rolle = 'buero'").get().n;
  if (offen && HINTER_PROXY && !einrichtungscode) {
    const z = require('crypto').randomBytes(5).toString('hex').toUpperCase();
    einrichtungscode = z.slice(0, 5) + '-' + z.slice(5);
    console.log('EINRICHTUNGSCODE für das erste Büro-Konto: ' + einrichtungscode);
  }
  if (!offen) einrichtungscode = null;
}
const zahl = v => (v === '' || v == null) ? null : (Number(String(v).replace(',', '.')) || null);

function fotoSpeichern(daten, praefix) {
  const m = String(daten || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/); if (!m) return null;
  const name = praefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(FOTOS, name), Buffer.from(m[2], 'base64')); return name;
}

function objektVoll(id) {
  const o = db.prepare('SELECT o.*, k.name kunde FROM objekt o LEFT JOIN kunde k ON k.id = o.kunde_id WHERE o.id = ?').get(Number(id));
  if (!o) return null;
  o.raeume = db.prepare('SELECT * FROM raum WHERE objekt_id = ? ORDER BY reihenfolge, id').all(o.id);
  o.positionen = db.prepare('SELECT p.id, p.raum_id, p.taetigkeit_id, p.turnus, p.minuten FROM lv_position p WHERE p.objekt_id = ?').all(o.id)
    .map(function (p) { p.regel = T.lesen(p.turnus, o.reinigungstag).text; return p; });
  const tids = [...new Set(o.positionen.map(function (p) { return p.taetigkeit_id; }))];
  o.taetigkeiten = tids.length ? db.prepare('SELECT * FROM taetigkeit WHERE id IN (' + tids.map(function () { return '?'; }).join(',') + ') ORDER BY id').all(...tids) : [];
  o.mitarbeiter = db.prepare('SELECT m.id, m.name FROM einsatz e JOIN mitarbeiter m ON m.id = e.mitarbeiter_id WHERE e.objekt_id = ?').all(o.id);
  o.maengel = db.prepare("SELECT * FROM mangel WHERE objekt_id = ? AND status = 'offen' ORDER BY id DESC").all(o.id);
  o.pruefungen = db.prepare('SELECT id, datum, pruefer, ergebnis, stichprobe, geprueft, abgezeichnet_von FROM pruefung WHERE objekt_id = ? ORDER BY datum DESC, id DESC LIMIT 10').all(o.id);
  return o;
}

// Tagesplan für die App: Texte in der Sprache des Mitarbeiters, sofern übersetzt
function uebersetzen(plan, sprache) {
  if (!sprache || sprache === 'de') return plan;
  const u = {}; db.prepare('SELECT t.name de, x.name, x.anleitung FROM uebersetzung x JOIN taetigkeit t ON t.id = x.taetigkeit_id WHERE x.sprache = ?').all(sprache).forEach(function (r) { u[r.de] = r; });
  plan.objekte.forEach(function (o) { o.raeume.forEach(function (r) { r.aufgaben.forEach(function (a) { const x = u[a.taetigkeit]; if (x) { a.original = a.taetigkeit; if (x.name) a.taetigkeit = x.name; if (x.anleitung) a.anleitung = x.anleitung; } }); }); });
  return plan;
}

function pruefungVoll(id) {
  const p = db.prepare('SELECT p.*, o.name objekt, o.kunde_id FROM pruefung p JOIN objekt o ON o.id = p.objekt_id WHERE p.id = ?').get(Number(id)); if (!p) return null;
  p.raeume = db.prepare('SELECT pr.raum_id, pr.kriterien, pr.fehler, r.name, r.etage FROM pruefung_raum pr JOIN raum r ON r.id = pr.raum_id WHERE pr.pruefung_id = ? ORDER BY r.reihenfolge, r.id').all(p.id)
    .map(function (r) { r.kriterien = JSON.parse(r.kriterien || '[]'); return r; });
  return p;
}

// Rechnung als PDF (gestellt: ZUGFeRD mit eingebetteter XML; Entwurf: mit ENTWURF-Stempel, ohne XML)
async function pdfSenden(res, r, download) {
  const buf = await PDFR.erzeugen(db, r);
  const name = (r.storno_von ? 'Stornorechnung_' : r.nummer ? 'Rechnung_' : 'Rechnungsentwurf_') + (r.nummer || r.id) + '.pdf';
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': (download ? 'attachment' : 'inline') + '; filename="' + name + '"', 'Cache-Control': 'no-store' });
  return res.end(buf);
}

// ---------------------------------------------------------------- Öffentlich (ohne Anmeldung)
async function oeffentlich(req, res, p, q) {
  if (p === '/api/einrichten' && req.method === 'GET') { einrichtungscodePruefen(); return json(res, 200, { noetig: !db.prepare("SELECT COUNT(*) n FROM benutzer WHERE rolle = 'buero'").get().n, lokal: lokal(req), mitCode: !!einrichtungscode }); }
  if (p === '/api/einrichten' && req.method === 'POST') {
    if (db.prepare("SELECT COUNT(*) n FROM benutzer WHERE rolle = 'buero'").get().n) throw new Fehler(409, 'Es gibt schon ein Büro-Konto.');
    const b = await leib(req); let id;
    if (!lokal(req)) {
      einrichtungscodePruefen();
      const schl = 'e|' + adresse(req);
      if (Z.gebremst(db, schl)) throw new Fehler(429, 'Zu viele Versuche — bitte 15 Minuten warten.');
      const gegeben = String(b.code || '').trim().toUpperCase();
      const ok = einrichtungscode && gegeben.length === einrichtungscode.length && require('crypto').timingSafeEqual(Buffer.from(gegeben), Buffer.from(einrichtungscode));
      if (!ok) { Z.fehlversuch(db, schl); throw new Fehler(403, einrichtungscode ? 'Der Einrichtungscode stimmt nicht.' : 'Das erste Konto lässt sich nur direkt am Rechner anlegen.'); }
    }
    try { id = Z.kontoAnlegen(db, Object.assign({}, b, { rolle: 'buero' })); } catch (e) { throw new Fehler(400, e.message); }
    einrichtungscode = null;
    const s = Z.sitzungAnlegen(db, 'buero', id); return json(res, 200, { ok: true }, { 'Set-Cookie': Z.keks(s.token, s.tage, SICHER) });
  }
  if (p === '/api/anmelden' && req.method === 'POST') {
    const b = await leib(req); const email = String(b.email || '').trim().toLowerCase(); const schl = 'k|' + adresse(req) + '|' + email;
    if (Z.gebremst(db, schl)) throw new Fehler(429, 'Zu viele Versuche — bitte 15 Minuten warten.');
    const u = db.prepare('SELECT * FROM benutzer WHERE email = ? AND aktiv = 1').get(email);
    if (!u || !Z.pruefen(b.passwort || '', u.pw)) { Z.fehlversuch(db, schl); throw new Fehler(401, 'E-Mail oder Passwort stimmt nicht.'); }
    db.prepare('INSERT INTO anmeldung_log (rolle, wer_id, name) VALUES (?,?,?)').run(u.rolle, u.id, u.name);
    const s = Z.sitzungAnlegen(db, u.rolle, u.id); return json(res, 200, { ok: true, rolle: u.rolle }, { 'Set-Cookie': Z.keks(s.token, s.tage, SICHER) });
  }
  if (p === '/api/app/personen') return json(res, 200, db.prepare("SELECT id, name FROM mitarbeiter WHERE aktiv = 1 AND pin IS NOT NULL AND pin <> '' ORDER BY name").all());
  if (p === '/api/app/anmelden' && req.method === 'POST') {
    const b = await leib(req); const schl = 'p|' + adresse(req) + '|' + Number(b.mitarbeiter_id);
    if (Z.gebremst(db, schl)) throw new Fehler(429, 'Zu viele Versuche — bitte 15 Minuten warten.');
    const m = db.prepare('SELECT * FROM mitarbeiter WHERE id = ? AND aktiv = 1').get(Number(b.mitarbeiter_id));
    if (!m || !m.pin || !Z.pruefen(String(b.pin || ''), m.pin)) { Z.fehlversuch(db, schl); throw new Fehler(401, 'PIN stimmt nicht.'); }
    db.prepare("INSERT INTO anmeldung_log (rolle, wer_id, name) VALUES ('mitarbeiter',?,?)").run(m.id, m.name);
    const s = Z.sitzungAnlegen(db, 'mitarbeiter', null, m.id); return json(res, 200, { ok: true, name: m.name, sprache: m.sprache }, { 'Set-Cookie': Z.keks(s.token, s.tage, SICHER) });
  }
  if (p === '/api/abmelden' && req.method === 'POST') { const w = Z.wer(db, req); if (w) db.prepare('DELETE FROM sitzung WHERE token = ?').run(w.token); return json(res, 200, { ok: true }, { 'Set-Cookie': Z.keksWeg }); }
  return undefined;
}

// ---------------------------------------------------------------- Mitarbeiter-App
async function appApi(req, res, p, q, ich) {
  const mid = ich.mitarbeiter.id;
  const meinObjekt = oid => !!db.prepare('SELECT 1 FROM einsatz WHERE objekt_id = ? AND mitarbeiter_id = ?').get(Number(oid), mid)
    || !!db.prepare("SELECT 1 FROM schicht WHERE objekt_id = ? AND mitarbeiter_id = ? AND datum = ? AND status <> 'abgesagt'").get(Number(oid), mid, heute())
    || !!db.prepare("SELECT 1 FROM vertretung WHERE objekt_id = ? AND mitarbeiter_id = ? AND status = 'zugesagt' AND datum = ?").get(Number(oid), mid, heute());
  if (p === '/api/app/tag') {
    const d = q.get('datum') || heute();
    const plan = PLAN.tag(db, d, { mitarbeiter: mid });
    // zugesagte Vertretungen zählen dazu
    db.prepare("SELECT objekt_id FROM vertretung WHERE mitarbeiter_id = ? AND datum = ? AND status = 'zugesagt'").all(mid, d).forEach(function (v) {
      if (!plan.objekte.some(function (o) { return o.id === v.objekt_id; })) { const x = PLAN.tag(db, d, { objekt: v.objekt_id }); plan.objekte.push(...x.objekte); plan.soll += x.soll; plan.fertig += x.fertig; }
    });
    plan.objekte.forEach(function (o) { const zb = db.prepare("SELECT id, kommen, gehen FROM zeitbuchung WHERE mitarbeiter_id = ? AND objekt_id = ? AND substr(kommen,1,10) = ? ORDER BY id DESC LIMIT 1").get(mid, o.id, d); o.zeit = zb || null; });
    plan.abwesend = EINS.abwesend(db, mid, d);
    plan.angebote = db.prepare("SELECT v.id, v.datum, o.name objekt FROM vertretung v JOIN objekt o ON o.id = v.objekt_id WHERE v.mitarbeiter_id = ? AND v.status = 'angefragt' AND v.datum >= ?").all(mid, heute());
    return json(res, 200, uebersetzen(plan, ich.mitarbeiter.sprache));
  }
  if (p === '/api/app/ich') return json(res, 200, { name: ich.mitarbeiter.name, sprache: ich.mitarbeiter.sprache });
  // Unterweisungen, Dienstanweisungen und Empfangsquittungen: lesen und bestätigen
  if (p === '/api/app/bestaetigen' && req.method === 'GET') return json(res, 200, { unterweisungen: UW.offenFuer(db, mid), ausgaben: RG.offeneQuittungen(db, mid).map(function (a) { return { id: a.id, art: a.art, gegenstand: a.gegenstand, merkmal: a.merkmal, anzahl: a.anzahl, objekt: a.objekt_id_name, ausgabe: a.ausgabe }; }) });
  if (p === '/api/app/bestaetigen' && req.method === 'POST') {
    const b = await leib(req); if (!b.gelesen) throw new Fehler(400, 'Bitte bestätigen, dass du alles gelesen und verstanden hast.');
    try { if (b.ausgabe) RG.quittieren(db, mid, b.ausgabe); else UW.bestaetigen(db, mid, b.thema); } catch (e) { throw new Fehler(403, e.message); }
    return json(res, 200, { ok: true });
  }
  if (p === '/api/app/schichten') {
    const von = heute(), bis = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
    return json(res, 200, db.prepare(`SELECT s.id, s.datum, s.beginn, s.ende, s.pause_min, s.status, s.notiz, o.name objekt, o.strasse, o.ort, o.zugang FROM schicht s JOIN objekt o ON o.id = s.objekt_id
      WHERE s.mitarbeiter_id = ? AND s.datum BETWEEN ? AND ? AND s.status <> 'abgesagt' ORDER BY s.datum, s.beginn`).all(mid, von, bis));
  }
  if (p === '/api/app/schicht' && req.method === 'POST') {
    const b = await leib(req); const s0 = db.prepare('SELECT * FROM schicht WHERE id = ? AND mitarbeiter_id = ?').get(Number(b.id), mid); if (!s0) throw new Fehler(404, 'Schicht nicht gefunden.');
    db.prepare("UPDATE schicht SET status = 'bestätigt' WHERE id = ?").run(s0.id); return json(res, 200, { ok: true });
  }
  if (p === '/api/app/erledigt' && req.method === 'POST') {
    const b = await leib(req); const pos = db.prepare('SELECT * FROM lv_position WHERE id = ?').get(Number(b.position));
    if (!pos || !meinObjekt(pos.objekt_id)) throw new Fehler(403, 'Diese Aufgabe gehört nicht zu deinen Einsätzen.');
    const datum = String(b.datum || heute()).slice(0, 10);
    if (b.zurueck) { db.prepare('DELETE FROM erledigung WHERE position_id = ? AND datum = ?').run(pos.id, datum); return json(res, 200, { ok: true }); }
    const foto = fotoSpeichern(b.foto, 'f' + pos.id);
    db.prepare("INSERT INTO erledigung (position_id, datum, mitarbeiter_id, foto, notiz, lat, lon, per_qr) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(position_id, datum) DO UPDATE SET zeit = datetime('now','localtime'), foto = COALESCE(excluded.foto, foto), per_qr = MAX(per_qr, excluded.per_qr)")
      .run(pos.id, datum, mid, foto, b.notiz || null, zahl(b.lat), zahl(b.lon), b.per_qr ? 1 : 0);
    return json(res, 200, { ok: true, foto: foto });
  }
  if (p === '/api/app/mangel' && req.method === 'POST') {
    const b = await leib(req); if (!meinObjekt(b.objekt_id)) throw new Fehler(403, 'Nicht dein Objekt.');
    if (!String(b.text || '').trim()) throw new Fehler(400, 'Bitte beschreiben, was dir aufgefallen ist.');
    const foto = fotoSpeichern(b.foto, 'm' + b.objekt_id);
    db.prepare('INSERT INTO mangel (objekt_id, raum_id, text, foto, quelle, gemeldet_von, frist) VALUES (?,?,?,?,?,?,?)').run(Number(b.objekt_id), b.raum_id || null, String(b.text).trim(), foto, 'mitarbeiter', ich.mitarbeiter.name, new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/app/raum-code') {
    const r = db.prepare('SELECT r.id raum_id, r.name raum, r.objekt_id, o.name objekt FROM raum r JOIN objekt o ON o.id = r.objekt_id WHERE r.code = ?').get(String(q.get('code') || '').trim());
    if (!r) throw new Fehler(404, 'Diesen Code kennt Glanzwerk nicht.');
    if (!meinObjekt(r.objekt_id)) throw new Fehler(403, 'Dieser Raum gehört nicht zu deinen Einsätzen.');
    return json(res, 200, r);
  }
  if (p === '/api/app/stempeln' && req.method === 'POST') {
    const b = await leib(req); const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(b.objekt_id));
    if (!o || !meinObjekt(o.id)) throw new Fehler(403, 'Nicht dein Objekt.');
    const lat = zahl(b.lat), lon = zahl(b.lon);
    let abst = null;
    if (o.lat != null && o.lon != null) {
      if (lat == null || lon == null) throw new Fehler(400, 'Ohne Standort kein Stempeln — bitte Standort freigeben.');
      abst = GEO.abstand({ lat: lat, lon: lon }, { lat: o.lat, lon: o.lon });
      if (abst > (o.radius_m || 150)) throw new Fehler(409, 'Du bist ' + abst + ' m vom Objekt entfernt — Stempeln geht nur vor Ort (bis ' + (o.radius_m || 150) + ' m).');
    }
    const offen = db.prepare('SELECT * FROM zeitbuchung WHERE mitarbeiter_id = ? AND gehen IS NULL ORDER BY id DESC LIMIT 1').get(mid);
    if (b.art === 'kommen') {
      if (offen) throw new Fehler(409, 'Du bist noch in „' + (db.prepare('SELECT name FROM objekt WHERE id = ?').get(offen.objekt_id) || {}).name + '" eingestempelt.');
      const sch = db.prepare("SELECT id FROM schicht WHERE mitarbeiter_id = ? AND objekt_id = ? AND datum = ? AND status <> 'abgesagt' ORDER BY beginn LIMIT 1").get(mid, o.id, heute());
      db.prepare('INSERT INTO zeitbuchung (mitarbeiter_id, objekt_id, kommen, lat, lon, abstand_m, schicht_id) VALUES (?,?,?,?,?,?,?)').run(mid, o.id, jetzt(), lat, lon, abst, sch ? sch.id : null);
      return json(res, 200, { ok: true, art: 'kommen', zeit: jetzt().slice(11, 16), abstand: abst });
    }
    if (!offen || offen.objekt_id !== o.id) throw new Fehler(409, 'Du bist hier nicht eingestempelt.');
    db.prepare('UPDATE zeitbuchung SET gehen = ?, lat_gehen = ?, lon_gehen = ?, pause_min = ? WHERE id = ?').run(jetzt(), lat, lon, Math.max(0, Number(b.pause) || 0), offen.id);
    return json(res, 200, { ok: true, art: 'gehen', zeit: jetzt().slice(11, 16), abstand: abst });
  }
  if (p === '/api/app/vertretung' && req.method === 'POST') {
    const b = await leib(req); const v = db.prepare('SELECT * FROM vertretung WHERE id = ? AND mitarbeiter_id = ?').get(Number(b.id), mid);
    if (!v) throw new Fehler(404, 'Anfrage nicht gefunden.');
    db.prepare('UPDATE vertretung SET status = ? WHERE id = ?').run(b.antwort === 'ja' ? 'zugesagt' : 'abgelehnt', v.id);
    if (b.antwort === 'ja') db.prepare("UPDATE vertretung SET status = 'erledigt_andere' WHERE objekt_id = ? AND datum = ? AND id <> ? AND status = 'angefragt'").run(v.objekt_id, v.datum, v.id);
    return json(res, 200, { ok: true });
  }
  throw new Fehler(404, 'unbekannter Pfad');
}

// ---------------------------------------------------------------- Kundenportal
async function kundeApi(req, res, p, q, ich) {
  const kid = ich.kunde_id;
  const meins = oid => { const o = db.prepare('SELECT * FROM objekt WHERE id = ? AND kunde_id = ?').get(Number(oid), kid); if (!o) throw new Fehler(403, 'Dieses Objekt gehört nicht zu Ihrem Zugang.'); return o; };
  if (p === '/api/kunde/uebersicht') {
    const k = db.prepare('SELECT name FROM kunde WHERE id = ?').get(kid) || {};
    const von = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const objekte = db.prepare("SELECT id, name, strasse, ort FROM objekt WHERE kunde_id = ? AND status = 'aktiv' ORDER BY name").all(kid).map(function (o) {
      let soll = 0, fertig = 0; for (let i = 0; i < 30; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); if (d < von) break; const t = PLAN.tag(db, d, { objekt: o.id }); soll += t.soll; fertig += t.fertig; }
      const letzte = db.prepare('SELECT id, datum, ergebnis, abgezeichnet_von FROM pruefung WHERE objekt_id = ? AND ergebnis IS NOT NULL ORDER BY datum DESC, id DESC LIMIT 1').get(o.id);
      const heuteT = PLAN.tag(db, heute(), { objekt: o.id });
      return Object.assign(o, { quote30: soll ? Math.round(fertig * 100 / soll) : null, heuteSoll: heuteT.soll, heuteFertig: heuteT.fertig, pruefung: letzte || null,
        reklamationen: db.prepare("SELECT COUNT(*) n FROM mangel WHERE objekt_id = ? AND quelle = 'kunde' AND status = 'offen'").get(o.id).n });
    });
    return json(res, 200, { kunde: k.name, name: ich.name, objekte: objekte });
  }
  if (p === '/api/kunde/objekt') {
    const o = meins(q.get('id'));
    const tage = []; for (let i = 0; i < 14; i++) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); const t = PLAN.tag(db, d, { objekt: o.id }); if (t.soll) tage.push({ datum: d, soll: t.soll, fertig: t.fertig, fotos: [].concat(...t.objekte.map(function (x) { return [].concat(...x.raeume.map(function (r) { return r.aufgaben.filter(function (a) { return a.erledigt && a.erledigt.foto; }).map(function (a) { return { raum: r.name, taetigkeit: a.taetigkeit, foto: a.erledigt.foto, zeit: a.erledigt.zeit }; }); })); })), raeume: t.objekte[0] ? t.objekte[0].raeume.map(function (r) { return { name: r.name, soll: r.aufgaben.length, fertig: r.aufgaben.filter(function (a) { return a.erledigt; }).length }; }) : [] }); }
    return json(res, 200, { id: o.id, name: o.name, strasse: o.strasse, ort: o.ort, tage: tage,
      pruefungen: db.prepare('SELECT id, datum, ergebnis, stichprobe, geprueft, abgezeichnet_von, abgezeichnet_am, bemerkung FROM pruefung WHERE objekt_id = ? AND ergebnis IS NOT NULL ORDER BY datum DESC LIMIT 12').all(o.id),
      reklamationen: db.prepare("SELECT id, text, gemeldet_am, status, erledigt_am FROM mangel WHERE objekt_id = ? AND quelle = 'kunde' ORDER BY id DESC LIMIT 20").all(o.id) });
  }
  if (p === '/api/kunde/pruefung') { const pr = pruefungVoll(q.get('id')); if (!pr || pr.kunde_id !== kid) throw new Fehler(404, 'Prüfbericht nicht gefunden.'); return json(res, 200, pr); }
  if (p === '/api/kunde/reklamation' && req.method === 'POST') {
    const b = await leib(req); const o = meins(b.objekt_id); if (!String(b.text || '').trim()) throw new Fehler(400, 'Bitte beschreiben Sie kurz, was nicht in Ordnung ist.');
    const foto = fotoSpeichern(b.foto, 'k' + o.id);
    db.prepare('INSERT INTO mangel (objekt_id, text, foto, quelle, gemeldet_von, frist) VALUES (?,?,?,?,?,?)').run(o.id, String(b.text).trim(), foto, 'kunde', ich.name, new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/kunde/firma') { const e = DB.einstellungen(db); const o = {}; ['firma_name', 'firma_strasse', 'firma_plz', 'firma_ort', 'firma_email', 'firma_telefon', 'steuernummer', 'ust_id', 'bank', 'iban', 'bic', 'handelsregister', 'geschaeftsfuehrung'].forEach(function (k) { o[k] = e[k] || ''; }); return json(res, 200, o); }   // nur, was auf jeder Rechnung steht — keine Kalkulationswerte
  if (p === '/api/kunde/auftraege') return json(res, 200, db.prepare("SELECT a.id, a.text, a.wunschdatum, a.termin, a.status, a.antwort, a.angelegt_am, a.erledigt_am, o.name objekt FROM auftrag a JOIN objekt o ON o.id = a.objekt_id WHERE o.kunde_id = ? ORDER BY a.id DESC LIMIT 50").all(kid));
  if (p === '/api/kunde/auftrag' && req.method === 'POST') {
    const b = await leib(req); const o = meins(b.objekt_id);
    if (!String(b.text || '').trim()) throw new Fehler(400, 'Bitte beschreiben Sie kurz, welche Leistung Sie brauchen.');
    if (b.wunschdatum && (!/^\d{4}-\d{2}-\d{2}$/.test(b.wunschdatum) || b.wunschdatum < heute())) throw new Fehler(400, 'Bitte ein Wunschdatum ab heute wählen.');
    return json(res, 200, { ok: true, id: Number(db.prepare("INSERT INTO auftrag (objekt_id, text, wunschdatum, quelle, angefragt_von) VALUES (?,?,?,'kunde',?)").run(o.id, String(b.text).trim(), b.wunschdatum || null, ich.name).lastInsertRowid) });
  }
  if (p === '/api/kunde/rechnungen') return json(res, 200, db.prepare("SELECT r.id, r.nummer, r.status, r.datum, r.faellig, r.zeitraum_von, r.zeitraum_bis, r.brutto, r.storno_von, o.name objekt FROM rechnung r LEFT JOIN objekt o ON o.id = r.objekt_id WHERE r.kunde_id = ? AND r.status <> 'entwurf' ORDER BY r.nummer DESC").all(kid));
  if (p === '/api/kunde/rechnung') { const r = AB.voll(db, q.get('id')); if (!r || r.kunde_id !== kid || r.status === 'entwurf') throw new Fehler(404, 'Rechnung nicht gefunden.'); return json(res, 200, r); }
  if (p === '/api/kunde/rechnung-pdf') { const r = AB.voll(db, q.get('id')); if (!r || r.kunde_id !== kid || r.status === 'entwurf') throw new Fehler(404, 'Rechnung nicht gefunden.'); return pdfSenden(res, r, q.get('download') === '1'); }
  if (p === '/api/kunde/xrechnung') {
    const r = AB.voll(db, q.get('id')); if (!r || r.kunde_id !== kid || r.status === 'entwurf') throw new Fehler(404, 'Rechnung nicht gefunden.');
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="XRechnung_' + r.nummer + '.xml"' }); return res.end(AB.xrechnung(db, r.id));
  }
  if (p === '/api/kunde/abzeichnen' && req.method === 'POST') {
    const b = await leib(req); const pr = pruefungVoll(b.id); if (!pr || pr.kunde_id !== kid) throw new Fehler(404, 'Prüfbericht nicht gefunden.');
    db.prepare("UPDATE pruefung SET abgezeichnet_von = ?, abgezeichnet_am = datetime('now','localtime') WHERE id = ?").run(ich.name, pr.id); return json(res, 200, { ok: true });
  }
  throw new Fehler(404, 'unbekannter Pfad');
}

// ---------------------------------------------------------------- Kommunikation und Planner (Büro und Mitarbeiter-App)
async function kommApi(req, res, p, q, ich) {
  const nurBuero = () => { if (ich.rolle !== 'buero') throw new Fehler(403, 'Nur im Büro.'); };
  const b = req.method === 'POST' ? await leib(req) : null;
  try {
    if (p === '/api/komm/uebersicht') return json(res, 200, KOMM.uebersicht(db, ich));
    if (p === '/api/komm/nachrichten') return json(res, 200, KOMM.nachrichten(db, ich, q.get('kanal'), q.get('seit')));
    if (p === '/api/komm/nachricht' && b) return json(res, 200, Object.assign({ ok: true }, KOMM.senden(db, ich, b, fotoSpeichern)));
    if (p === '/api/komm/als-mangel' && b) { nurBuero(); return json(res, 200, { ok: true, mangel_id: KOMM.alsMangel(db, ich, b.nachricht_id, b.objekt_id) }); }
    if (p === '/api/komm/objekte') return json(res, 200, ich.rolle === 'buero' ? db.prepare("SELECT id, name FROM objekt WHERE status = 'aktiv' ORDER BY name").all()
      : db.prepare("SELECT DISTINCT o.id, o.name FROM objekt o WHERE o.status = 'aktiv' AND (o.id IN (SELECT objekt_id FROM einsatz WHERE mitarbeiter_id = ?) OR o.id IN (SELECT objekt_id FROM schicht WHERE mitarbeiter_id = ? AND datum >= date('now','localtime','-30 day'))) ORDER BY o.name").all(ich.mitarbeiter.id, ich.mitarbeiter.id));
    if (p === '/api/planner/meine') return json(res, 200, KOMM.meine(db, ich));
    if (p === '/api/planner/aufgabe' && !b) return json(res, 200, KOMM.aufgabe(db, ich, q.get('id')));
    if (p === '/api/planner/erledigt' && b) { KOMM.erledigen(db, ich, b.id, !!b.erledigt); return json(res, 200, { ok: true }); }
    if (p === '/api/planner/punkt' && b) { KOMM.punkt(db, ich, b); return json(res, 200, { ok: true }); }
    if (p === '/api/planner/kommentar' && b) { KOMM.kommentar(db, ich, b); return json(res, 200, { ok: true }); }
    nurBuero();
    if (p === '/api/planner/boards') return json(res, 200, KOMM.boards(db, ich));
    if (p === '/api/planner/board' && !b) return json(res, 200, KOMM.board(db, q.get('id')));
    if (p === '/api/planner/board' && b) return json(res, 200, { ok: true, id: KOMM.boardSpeichern(db, b) });
    if (p === '/api/planner/spalte' && b) { KOMM.spalteSpeichern(db, b); return json(res, 200, { ok: true }); }
    if (p === '/api/planner/aufgabe' && b) return json(res, 200, { ok: true, id: KOMM.aufgabeSpeichern(db, ich, b) });
    if (p === '/api/planner/verschieben' && b) { KOMM.verschieben(db, b.id, b.spalte_id, b.index); return json(res, 200, { ok: true }); }
  } catch (e) { if (e instanceof Fehler) throw e; throw new Fehler(400, e.message); }
  throw new Fehler(404, 'Unbekannt');
}

// ---------------------------------------------------------------- Büro
async function bueroApi(req, res, p, q, ich) {
  if (p === '/api/uebersicht') {
    const d = q.get('datum') || heute(), t = PLAN.tag(db, d);
    const n = new Date(); const lage = EINS.lage(db, d, d === heute() ? n.getHours() * 60 + n.getMinutes() : null);
    return json(res, 200, { datum: d, wochentag: t.wochentag, soll: t.soll, fertig: t.fertig, alarme: lage.filter(function (l) { return l.alarm; }).map(function (l) { return { objekt: l.name, id: l.id, alarm: l.alarm }; }),
      objekte: t.objekte.map(function (o) { return { id: o.id, name: o.name, kunde: o.kunde, ort: o.ort, soll: o.soll, fertig: o.fertig, sollMinuten: o.sollMinuten, raeume: o.raeume.length }; }),
      zahlen: { objekte: db.prepare("SELECT COUNT(*) n FROM objekt WHERE status='aktiv'").get().n, raeume: db.prepare('SELECT COUNT(*) n FROM raum').get().n, mitarbeiter: db.prepare('SELECT COUNT(*) n FROM mitarbeiter WHERE aktiv=1').get().n, maengel: db.prepare("SELECT COUNT(*) n FROM mangel WHERE status = 'offen'").get().n, eingestempelt: db.prepare('SELECT COUNT(*) n FROM zeitbuchung WHERE gehen IS NULL').get().n } });
  }
  if (p === '/api/objekte') return json(res, 200, db.prepare(`SELECT o.id, o.name, o.strasse, o.ort, o.status, o.monatspreis, o.kunde_id, o.objektnummer, o.objektart, k.name kunde,
      (SELECT COUNT(*) FROM raum r WHERE r.objekt_id = o.id) raeume, (SELECT COUNT(*) FROM lv_position l WHERE l.objekt_id = o.id) positionen
      FROM objekt o LEFT JOIN kunde k ON k.id = o.kunde_id ORDER BY o.name`).all());
  if (p === '/api/objekt' && req.method === 'GET') { const o = objektVoll(q.get('id')); if (!o) throw new Fehler(404, 'Objekt nicht gefunden'); return json(res, 200, o); }
  if (p === '/api/objekt' && req.method === 'POST') {
    const b = await leib(req);
    if (!String(b.name || '').trim()) throw new Fehler(400, 'Name fehlt');
    const art = ['pauschale', 'stunden', 'beides'].indexOf(b.abrechnungsart) >= 0 ? b.abrechnungsart : 'pauschale';
    if (art !== 'pauschale' && !zahl(b.stundensatz)) throw new Fehler(400, 'Für die Abrechnung nach Stunden bitte einen Stundensatz angeben.');
    let akte; try { akte = OA.lesen(b); } catch (e) { throw new Fehler(400, e.message); }
    const f = [b.name, b.kunde_id ? Number(b.kunde_id) : null, b.strasse || null, b.plz || null, b.ort || null, b.bundesland || 'SH', Number.isInteger(b.reinigungstag) ? b.reinigungstag : 1, b.zugang || null, b.notiz || null, zahl(b.radius_m) || 150, art, zahl(b.stundensatz)];
    let id = Number(b.id);
    if (id) db.prepare('UPDATE objekt SET name=?, kunde_id=?, strasse=?, plz=?, ort=?, bundesland=?, reinigungstag=?, zugang=?, notiz=?, radius_m=?, abrechnungsart=?, stundensatz=? WHERE id=?').run(...f, id);
    else id = Number(db.prepare('INSERT INTO objekt (name, kunde_id, strasse, plz, ort, bundesland, reinigungstag, zugang, notiz, radius_m, abrechnungsart, stundensatz) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(...f).lastInsertRowid);
    const sp = Object.keys(akte); if (sp.length) db.prepare('UPDATE objekt SET ' + sp.map(function (s) { return s + ' = ?'; }).join(', ') + ' WHERE id = ?').run(...sp.map(function (s) { return akte[s]; }), id);
    return json(res, 200, { ok: true, id: id });
  }
  if (p === '/api/objekt/felder') return json(res, 200, { felder: OA.FELDER, gruppen: OA.GRUPPEN });
  // Objektkopf wie in der Sicherheitsplanung: die wichtigsten Zahlen auf einen Blick
  if (p === '/api/objekt/kennzahlen') {
    const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(q.get('id'))); if (!o) throw new Fehler(404, 'Objekt nicht gefunden');
    const monat = heute().slice(0, 7), jahr = heute().slice(0, 4);
    const ist = (von, bis) => Math.round(db.prepare("SELECT kommen, gehen, pause_min FROM zeitbuchung WHERE objekt_id = ? AND gehen IS NOT NULL AND substr(kommen,1,10) BETWEEN ? AND ?").all(o.id, von, bis)
      .reduce(function (a, z) { return a + Math.max(0, (new Date(z.gehen.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 60000 - (z.pause_min || 0)); }, 0) / 60 * 100) / 100;
    let kalk = null; try { kalk = KALK.objekt(db, o.id); } catch (e) { kalk = null; }
    const rech = db.prepare("SELECT id, nummer, status, datum, faellig, zeitraum_von, zeitraum_bis, netto, brutto, storno_von FROM rechnung r WHERE r.objekt_id = ? OR EXISTS (SELECT 1 FROM rechnung_position p WHERE p.rechnung_id = r.id AND p.objekt_id = ?) ORDER BY r.id DESC LIMIT 24").all(o.id, o.id);
    const umsatzJahr = AB.r2(db.prepare("SELECT COALESCE(SUM(p.betrag),0) s FROM rechnung_position p JOIN rechnung r ON r.id = p.rechnung_id WHERE r.status IN ('gestellt','bezahlt','storniert') AND r.nummer IS NOT NULL AND substr(r.datum,1,4) = ? AND (p.objekt_id = ? OR (p.objekt_id IS NULL AND r.objekt_id = ?))").get(jahr, o.id, o.id).s);
    const leitung = o.objektleitung_id ? db.prepare('SELECT id, name, telefon FROM mitarbeiter WHERE id = ?').get(o.objektleitung_id) : null;
    const pr = db.prepare('SELECT datum, ergebnis FROM pruefung WHERE objekt_id = ? AND ergebnis IS NOT NULL ORDER BY datum DESC LIMIT 1').get(o.id);
    return json(res, 200, {
      flaeche: AB.r2(db.prepare('SELECT COALESCE(SUM(flaeche_m2 * COALESCE(anzahl,1)),0) s FROM raum WHERE objekt_id = ?').get(o.id).s), raeume: db.prepare('SELECT COUNT(*) n FROM raum WHERE objekt_id = ?').get(o.id).n,
      leistungen: db.prepare('SELECT COUNT(*) n FROM lv_position WHERE objekt_id = ?').get(o.id).n, team: db.prepare('SELECT COUNT(*) n FROM einsatz WHERE objekt_id = ?').get(o.id).n,
      maengel: db.prepare("SELECT COUNT(*) n FROM mangel WHERE objekt_id = ? AND status = 'offen'").get(o.id).n, pruefung: pr || null,
      sollStundenMonat: kalk && kalk.ergebnis ? kalk.ergebnis.stundenMonat : null, istStundenMonat: ist(monat + '-01', heute()),
      istStundenVormonat: (function () { const d = new Date(monat + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); const m = d.toISOString().slice(0, 7); const g = AB.monatsgrenzen(m); return ist(g.von, g.bis); })(),
      umsatzJahr: umsatzJahr, offen: AB.r2(rech.filter(function (r) { return r.status === 'gestellt' && !r.storno_von; }).reduce(function (a, r) { return a + AB.offenBetrag(db, r); }, 0)),
      rechnungen: rech, objektleitung: leitung, heuteAufgaben: (function () { try { const t = PLAN.tag(db, heute(), { objekt: o.id }); return { soll: t.soll, fertig: t.fertig }; } catch (e) { return null; } })()
    });
  }
  if (p === '/api/objekt/status' && req.method === 'POST') { const b = await leib(req); db.prepare('UPDATE objekt SET status = ? WHERE id = ?').run(b.status === 'ruht' ? 'ruht' : 'aktiv', Number(b.id)); return json(res, 200, { ok: true }); }
  if (p === '/api/objekt/standort' && req.method === 'POST') {
    const b = await leib(req); const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(b.id)); if (!o) throw new Fehler(404, 'Objekt nicht gefunden');
    let lage = { lat: zahl(b.lat), lon: zahl(b.lon), gefunden: null };
    if (b.suchen) { const a = [o.strasse, o.plz, o.ort].filter(Boolean).join(', '); if (!a) throw new Fehler(400, 'Keine Anschrift am Objekt'); lage = await GEO.suchen(a); }
    if (lage.lat == null || lage.lon == null) throw new Fehler(400, 'Standort fehlt');
    db.prepare('UPDATE objekt SET lat = ?, lon = ?, radius_m = COALESCE(?, radius_m) WHERE id = ?').run(lage.lat, lage.lon, zahl(b.radius_m), o.id);
    return json(res, 200, { ok: true, lat: lage.lat, lon: lage.lon, gefunden: lage.gefunden });
  }
  if (p === '/api/raum' && req.method === 'POST') {
    const b = await leib(req);
    if (!b.objekt_id || !String(b.name || '').trim()) throw new Fehler(400, 'Objekt und Name nötig');
    const anzahl = zahl(b.anzahl) || 1; if (anzahl < 0 || anzahl > 500) throw new Fehler(400, 'Anzahl zwischen 1 und 500');
    if (b.id) { db.prepare('UPDATE raum SET name=?, etage=?, belag=?, flaeche_m2=?, anzahl=? WHERE id=?').run(b.name, b.etage || null, b.belag || null, zahl(b.flaeche_m2), anzahl, Number(b.id)); return json(res, 200, { ok: true }); }
    const n = db.prepare('SELECT COALESCE(MAX(reihenfolge),0)+1 n FROM raum WHERE objekt_id = ?').get(Number(b.objekt_id)).n;
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO raum (objekt_id, name, etage, belag, flaeche_m2, anzahl, reihenfolge, code) VALUES (?,?,?,?,?,?,?,?)').run(Number(b.objekt_id), b.name, b.etage || null, b.belag || null, zahl(b.flaeche_m2), anzahl, n, 'R' + b.objekt_id + '-' + n + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()).lastInsertRowid) });
  }
  if (p === '/api/taetigkeiten') return json(res, 200, db.prepare('SELECT t.*, (SELECT COUNT(*) FROM lv_position p WHERE p.taetigkeit_id = t.id) verwendet FROM taetigkeit t ORDER BY t.kategorie, t.name').all());
  if (p === '/api/taetigkeit' && req.method === 'GET') { const t = db.prepare('SELECT * FROM taetigkeit WHERE id = ?').get(Number(q.get('id'))); if (!t) throw new Fehler(404, 'Tätigkeit nicht gefunden'); t.uebersetzungen = db.prepare('SELECT * FROM uebersetzung WHERE taetigkeit_id = ?').all(t.id); return json(res, 200, t); }
  if (p === '/api/taetigkeit' && req.method === 'POST') {
    const b = await leib(req); const name = String(b.name || '').trim(); if (!name) throw new Fehler(400, 'Name fehlt');
    if (b.id) { db.prepare('UPDATE taetigkeit SET name=?, anleitung=?, minuten=?, kategorie=? WHERE id=?').run(name, b.anleitung || null, zahl(b.minuten), b.kategorie || null, Number(b.id)); return json(res, 200, { ok: true, id: Number(b.id) }); }
    const da = db.prepare('SELECT id FROM taetigkeit WHERE name = ?').get(name); if (da) return json(res, 200, { ok: true, id: da.id });
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO taetigkeit (name, anleitung, minuten, kategorie) VALUES (?,?,?,?)').run(name, b.anleitung || null, zahl(b.minuten), b.kategorie || null).lastInsertRowid) });
  }
  if (p === '/api/uebersetzung' && req.method === 'POST') {
    const b = await leib(req); if (!b.taetigkeit_id || !b.sprache) throw new Fehler(400, 'Tätigkeit und Sprache nötig');
    db.prepare('INSERT INTO uebersetzung (taetigkeit_id, sprache, name, anleitung) VALUES (?,?,?,?) ON CONFLICT(taetigkeit_id, sprache) DO UPDATE SET name = excluded.name, anleitung = excluded.anleitung').run(Number(b.taetigkeit_id), String(b.sprache), b.name || null, b.anleitung || null);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/position' && req.method === 'POST') {
    const b = await leib(req); const r = db.prepare('SELECT objekt_id FROM raum WHERE id = ?').get(Number(b.raum_id));
    if (!r || !b.taetigkeit_id) throw new Fehler(400, 'Raum und Tätigkeit nötig');
    const turnus = String(b.turnus || '').trim();
    if (!turnus) { db.prepare('DELETE FROM lv_position WHERE raum_id = ? AND taetigkeit_id = ?').run(Number(b.raum_id), Number(b.taetigkeit_id)); return json(res, 200, { ok: true, entfernt: true }); }
    const regel = T.lesen(turnus); if (regel.art === 'unbekannt') throw new Fehler(400, regel.text);
    db.prepare('INSERT INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus) VALUES (?,?,?,?) ON CONFLICT(raum_id, taetigkeit_id) DO UPDATE SET turnus = excluded.turnus').run(r.objekt_id, Number(b.raum_id), Number(b.taetigkeit_id), turnus);
    return json(res, 200, { ok: true, regel: regel.text });
  }
  if (p === '/api/import' && req.method === 'POST') {
    const b = await roh(req, 20e6); if (!b.length) throw new Fehler(400, 'Keine Datei');
    const tmp = path.join(DB.ORDNER, 'import-' + Date.now() + '.xlsx'); fs.writeFileSync(tmp, b);
    try {
      const lv = await LV.lesen(tmp);
      if (q.get('uebernehmen') === '1') return json(res, 200, { ok: true, id: LV.uebernehmen(db, lv, { name: q.get('name') || undefined }), lv: lv });
      return json(res, 200, { ok: true, vorschau: true, lv: lv, regeln: lv.raeume.flatMap(function (r) { return r.leistungen.map(function (l) { return l.turnus; }); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (k) { return { kuerzel: k, text: T.lesen(k).text }; }) });
    } catch (e) { throw new Fehler(400, e.message); } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
  if (p === '/api/tag') return json(res, 200, PLAN.tag(db, q.get('datum') || heute(), { objekt: q.get('objekt'), mitarbeiter: q.get('mitarbeiter') }));
  if (p === '/api/woche') { const w = PLAN.woche(db, q.get('objekt'), q.get('montag')); if (!w) throw new Fehler(404, 'Objekt nicht gefunden'); return json(res, 200, w); }
  if (p === '/api/mitarbeiter' && req.method === 'GET') return json(res, 200, db.prepare("SELECT * FROM mitarbeiter ORDER BY aktiv DESC, name").all().map(function (m) {
    return { id: m.id, name: m.name, telefon: m.telefon, sprache: m.sprache, rolle: m.rolle, minijob: m.minijob, lohngruppe: m.lohngruppe, stundenlohn: m.stundenlohn, aktiv: m.aktiv, personalnummer: m.personalnummer, wochenstunden: m.wochenstunden, hat_pin: !!m.pin,
      beschaeftigungsart: m.beschaeftigungsart, taetigkeit: m.taetigkeit, eintritt: m.eintritt, austritt: m.austritt, aufenthalt_bis: m.aufenthalt_bis, befristet_bis: m.befristet_bis, luecken: PERS.luecken(m).length };
  }));
  if (p === '/api/mitarbeiter' && req.method === 'POST') {
    const b = await leib(req); if (!String(b.name || '').trim()) throw new Fehler(400, 'Name fehlt');
    if (b.pin != null && b.pin !== '' && !/^\d{4,8}$/.test(String(b.pin))) throw new Fehler(400, 'Die PIN hat 4 bis 8 Ziffern.');
    const f = [b.name, b.telefon || null, b.sprache || 'de', b.minijob ? 1 : 0, b.lohngruppe || null, zahl(b.stundenlohn), b.aktiv === false || b.aktiv === 0 ? 0 : 1, b.personalnummer || null, zahl(b.wochenstunden)];
    let id = Number(b.id);
    if (id) db.prepare('UPDATE mitarbeiter SET name=?, telefon=?, sprache=?, minijob=?, lohngruppe=?, stundenlohn=?, aktiv=?, personalnummer=?, wochenstunden=? WHERE id=?').run(...f, id);
    else id = Number(db.prepare('INSERT INTO mitarbeiter (name, telefon, sprache, minijob, lohngruppe, stundenlohn, aktiv, personalnummer, wochenstunden) VALUES (?,?,?,?,?,?,?,?,?)').run(...f).lastInsertRowid);
    if (b.pin) db.prepare('UPDATE mitarbeiter SET pin = ? WHERE id = ?').run(Z.hash(String(b.pin)), id);
    if (b.aktiv === false || b.aktiv === 0) db.prepare("DELETE FROM sitzung WHERE mitarbeiter_id = ?").run(id);
    if (!Number(b.id)) RG.checklisteAnlegen(db, 'eintritt', id, heute(), ich.name);   // neue Kraft: Eintritts-Checkliste
    return json(res, 200, { ok: true, id: id });
  }
  // --- Personalakte (wie in der Sicherheitsplanung)
  if (p === '/api/personal' && req.method === 'GET') {
    const m = db.prepare('SELECT * FROM mitarbeiter WHERE id = ?').get(Number(q.get('id'))); if (!m) throw new Fehler(404, 'Mitarbeiter nicht gefunden');
    m.hat_pin = !!m.pin; delete m.pin;
    const jahr = Number(q.get('jahr')) || Number(heute().slice(0, 4));
    return json(res, 200, { mitarbeiter: m, luecken: PERS.luecken(m), urlaub: PERS.urlaub(db, m, jahr),
      dokumente: db.prepare('SELECT id, art, titel, typ, gueltig_bis, notiz, angelegt_am FROM mitarbeiter_dokument WHERE mitarbeiter_id = ? ORDER BY angelegt_am DESC').all(m.id),
      abwesenheiten: db.prepare("SELECT * FROM abwesenheit WHERE mitarbeiter_id = ? AND bis >= ? ORDER BY von DESC").all(m.id, (jahr - 1) + '-01-01'),
      objekte: db.prepare('SELECT o.id, o.name FROM einsatz e JOIN objekt o ON o.id = e.objekt_id WHERE e.mitarbeiter_id = ? ORDER BY o.name').all(m.id),
      schichten: DP.schichtenZeitraum(db, heute(), plusTageIso(heute(), 13), m.id),
      fristen: PERS.fristen(db, heute(), 90).filter(function (f) { return f.mitarbeiter_id === m.id; }) });
  }
  if (p === '/api/personal' && req.method === 'POST') {
    const b = await leib(req), id = Number(b.id); if (!id || !db.prepare('SELECT 1 FROM mitarbeiter WHERE id = ?').get(id)) throw new Fehler(404, 'Mitarbeiter nicht gefunden');
    let w; try { w = PERS.lesen(b); } catch (e) { throw new Fehler(400, e.message); }
    const sp = Object.keys(w); if (sp.length) db.prepare('UPDATE mitarbeiter SET ' + sp.map(function (s) { return s + ' = ?'; }).join(', ') + ' WHERE id = ?').run(...sp.map(function (s) { return w[s]; }), id);
    if ('beschaeftigungsart' in w) db.prepare('UPDATE mitarbeiter SET minijob = ? WHERE id = ?').run(w.beschaeftigungsart === 'minijob' ? 1 : 0, id);
    // Anzeigename folgt Vor- und Nachname, sobald beide da sind
    const m = db.prepare('SELECT vorname, nachname FROM mitarbeiter WHERE id = ?').get(id); if (m.vorname && m.nachname) db.prepare('UPDATE mitarbeiter SET name = ? WHERE id = ?').run(m.vorname + ' ' + m.nachname, id);
    // Austritt in der Vergangenheit → gesperrt, keine App-Anmeldung mehr
    if (w.austritt) RG.checklisteAnlegen(db, 'austritt', id, w.austritt, ich.name);   // Austritt eingetragen: Checkliste mit allem, was zurück muss
    if (w.austritt && w.austritt < heute()) { db.prepare('UPDATE mitarbeiter SET aktiv = 0 WHERE id = ?').run(id); db.prepare('DELETE FROM sitzung WHERE mitarbeiter_id = ?').run(id); }
    return json(res, 200, { ok: true, luecken: PERS.luecken(db.prepare('SELECT * FROM mitarbeiter WHERE id = ?').get(id)) });
  }
  if (p === '/api/personal/felder') return json(res, 200, { felder: PERS.FELDER, gruppen: PERS.GRUPPEN, dokumentarten: PERS.DOKUMENTARTEN });
  if (p === '/api/personal/fristen') return json(res, 200, PERS.fristen(db, heute(), Number(q.get('tage')) || 60));
  if (p === '/api/personal/auswertung') { const m = q.get('monat') || heute().slice(0, 7); if (!/^\d{4}-\d{2}$/.test(m)) throw new Fehler(400, 'Monat im Format JJJJ-MM'); return json(res, 200, { monat: m, mitarbeiter: PERS.auswertung(db, m) }); }
  if (p === '/api/personal/urlaub') { const j = Number(q.get('jahr')) || Number(heute().slice(0, 4)); return json(res, 200, { jahr: j, mitarbeiter: db.prepare('SELECT * FROM mitarbeiter WHERE aktiv = 1 ORDER BY name').all().map(function (m) { return Object.assign({ id: m.id, name: m.name }, PERS.urlaub(db, m, j)); }) }); }
  if (p === '/api/personal/stammdaten.csv') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="Personalstammdaten_' + heute() + '.csv"', 'Cache-Control': 'no-store' }); return res.end(PERS.stammdatenDatei(db)); }
  if (p === '/api/personal/fragebogen') {
    const m = q.get('id') ? db.prepare('SELECT * FROM mitarbeiter WHERE id = ?').get(Number(q.get('id'))) : null; if (q.get('id') && !m) throw new Fehler(404, 'Mitarbeiter nicht gefunden');
    const buf = await BRIEF.personalfragebogen(db, m);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Personalfragebogen' + (m ? '_' + String(m.name).replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') : '') + '.pdf"', 'Cache-Control': 'no-store' }); return res.end(buf);
  }
  if (p === '/api/personal/dokument' && req.method === 'GET') {
    const d = db.prepare('SELECT * FROM mitarbeiter_dokument WHERE id = ?').get(Number(q.get('id'))); if (!d) throw new Fehler(404, 'Dokument nicht gefunden');
    const datei = path.join(PERSONAL, path.basename(d.datei)); if (!fs.existsSync(datei)) throw new Fehler(404, 'Datei fehlt');
    res.writeHead(200, { 'Content-Type': d.typ || 'application/octet-stream', 'Content-Disposition': 'inline; filename="' + String(d.titel || d.art).replace(/[^A-Za-zÄÖÜäöüß0-9.]+/g, '_') + path.extname(d.datei) + '"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return fs.createReadStream(datei).pipe(res);
  }
  if (p === '/api/personal/dokument' && req.method === 'POST') {
    const b = await leib(req);
    if (b.id && b.loeschen) { const d = db.prepare('SELECT * FROM mitarbeiter_dokument WHERE id = ?').get(Number(b.id)); if (d) { db.prepare('DELETE FROM mitarbeiter_dokument WHERE id = ?').run(d.id); try { fs.unlinkSync(path.join(PERSONAL, path.basename(d.datei))); } catch (e) {} } return json(res, 200, { ok: true }); }
    if (b.id) { db.prepare('UPDATE mitarbeiter_dokument SET titel = ?, gueltig_bis = ?, notiz = ? WHERE id = ?').run(b.titel || null, /^\d{4}-\d{2}-\d{2}$/.test(b.gueltig_bis || '') ? b.gueltig_bis : null, b.notiz || null, Number(b.id)); return json(res, 200, { ok: true }); }
    if (!db.prepare('SELECT 1 FROM mitarbeiter WHERE id = ?').get(Number(b.mitarbeiter_id))) throw new Fehler(404, 'Mitarbeiter nicht gefunden');
    const m = String(b.datei || '').match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,(.+)$/); if (!m) throw new Fehler(400, 'Bitte PDF, JPG oder PNG hochladen.');
    const inhalt = Buffer.from(m[2], 'base64'); if (inhalt.length > 10e6) throw new Fehler(413, 'Die Datei ist größer als 10 MB.');
    const endung = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[m[1]];
    const name = 'ma' + Number(b.mitarbeiter_id) + '-' + Date.now() + '-' + require('crypto').randomBytes(4).toString('hex') + endung;
    fs.writeFileSync(path.join(PERSONAL, name), inhalt);
    const art = PERS.DOKUMENTARTEN.some(function (a) { return a[0] === b.art; }) ? b.art : 'sonstiges';
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO mitarbeiter_dokument (mitarbeiter_id, art, titel, datei, typ, gueltig_bis, notiz) VALUES (?,?,?,?,?,?,?)').run(Number(b.mitarbeiter_id), art, b.titel || null, name, m[1], /^\d{4}-\d{2}-\d{2}$/.test(b.gueltig_bis || '') ? b.gueltig_bis : null, b.notiz || null).lastInsertRowid) });
  }
  if (p === '/api/einsatz' && req.method === 'POST') {
    const b = await leib(req);
    if (b.entfernen) db.prepare('DELETE FROM einsatz WHERE objekt_id = ? AND mitarbeiter_id = ?').run(Number(b.objekt_id), Number(b.mitarbeiter_id));
    else db.prepare('INSERT OR IGNORE INTO einsatz (objekt_id, mitarbeiter_id) VALUES (?,?)').run(Number(b.objekt_id), Number(b.mitarbeiter_id));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/erledigt' && req.method === 'POST') {   // Büro kann nachtragen oder zurücknehmen
    const b = await leib(req); const pos = Number(b.position), datum = String(b.datum || heute()).slice(0, 10);
    if (!db.prepare('SELECT id FROM lv_position WHERE id = ?').get(pos)) throw new Fehler(404, 'Aufgabe nicht gefunden');
    if (b.zurueck) { db.prepare('DELETE FROM erledigung WHERE position_id = ? AND datum = ?').run(pos, datum); return json(res, 200, { ok: true }); }
    db.prepare("INSERT INTO erledigung (position_id, datum, mitarbeiter_id, notiz) VALUES (?,?,?,?) ON CONFLICT(position_id, datum) DO NOTHING").run(pos, datum, b.mitarbeiter ? Number(b.mitarbeiter) : null, 'im Büro nachgetragen von ' + ich.name);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/mangel' && req.method === 'POST') {
    const b = await leib(req);
    if (b.id && b.erledigt) { db.prepare("UPDATE mangel SET status='erledigt', erledigt_am=datetime('now','localtime') WHERE id=?").run(Number(b.id)); return json(res, 200, { ok: true }); }
    if (!b.objekt_id || !String(b.text || '').trim()) throw new Fehler(400, 'Objekt und Beschreibung nötig');
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO mangel (objekt_id, raum_id, text, quelle, gemeldet_von, frist) VALUES (?,?,?,?,?,?)').run(Number(b.objekt_id), b.raum_id || null, String(b.text).trim(), 'buero', ich.name, b.frist || new Date(Date.now() + 86400000).toISOString().slice(0, 10)).lastInsertRowid) });
  }
  if (p === '/api/maengel') return json(res, 200, db.prepare(`SELECT m.*, o.name objekt, r.name raum FROM mangel m JOIN objekt o ON o.id = m.objekt_id LEFT JOIN raum r ON r.id = m.raum_id WHERE m.status = ? ORDER BY m.id DESC`).all(q.get('status') || 'offen'));
  // --- Zeiten
  if (p === '/api/zeiten' || p === '/api/zeiten.csv') {
    const von = q.get('von') || heute().slice(0, 8) + '01', bis = q.get('bis') || heute();
    const l = db.prepare(`SELECT z.*, m.name mitarbeiter, o.name objekt FROM zeitbuchung z JOIN mitarbeiter m ON m.id = z.mitarbeiter_id LEFT JOIN objekt o ON o.id = z.objekt_id
                          WHERE substr(z.kommen,1,10) BETWEEN ? AND ? ${q.get('mitarbeiter') ? 'AND z.mitarbeiter_id = ' + Number(q.get('mitarbeiter')) : ''} ORDER BY z.kommen`).all(von, bis)
      .map(function (z) { const min = z.gehen ? Math.max(0, Math.round((new Date(z.gehen.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 60000) - (z.pause_min || 0)) : null; return Object.assign(z, { minuten: min }); });
    if (p === '/api/zeiten.csv') {
      const zeilen = [['Datum', 'Mitarbeiter', 'Objekt', 'Beginn', 'Ende', 'Pause (Min.)', 'Arbeitszeit (Std.)', 'Abstand beim Stempeln (m)'].join(';')].concat(l.map(function (z) { return [z.kommen.slice(0, 10).split('-').reverse().join('.'), z.mitarbeiter, z.objekt || '', z.kommen.slice(11, 16), z.gehen ? z.gehen.slice(11, 16) : 'offen', z.pause_min || 0, z.minuten != null ? (z.minuten / 60).toFixed(2).replace('.', ',') : '', z.abstand_m != null ? z.abstand_m : ''].join(';'); }));
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="Arbeitszeiten_' + von + '_' + bis + '.csv"' }); return res.end('﻿' + zeilen.join('\r\n'));
    }
    return json(res, 200, { von: von, bis: bis, buchungen: l, summeMinuten: l.reduce(function (a, z) { return a + (z.minuten || 0); }, 0) });
  }
  if (p === '/api/zeit/korrigieren' && req.method === 'POST') {
    const b = await leib(req); const z = db.prepare('SELECT * FROM zeitbuchung WHERE id = ?').get(Number(b.id)); if (!z) throw new Fehler(404, 'Buchung nicht gefunden');
    const d = z.kommen.slice(0, 10); if (!/^\d{2}:\d{2}$/.test(b.kommen || '') || (b.gehen && !/^\d{2}:\d{2}$/.test(b.gehen))) throw new Fehler(400, 'Zeit im Format HH:MM');
    db.prepare('UPDATE zeitbuchung SET kommen = ?, gehen = ?, pause_min = ? WHERE id = ?').run(d + ' ' + b.kommen + ':00', b.gehen ? d + ' ' + b.gehen + ':00' : null, Math.max(0, Number(b.pause) || 0), z.id);
    return json(res, 200, { ok: true });
  }
  // --- Soll gegen Ist je Objekt
  if (p === '/api/soll-ist') {
    const von = q.get('von') || heute().slice(0, 8) + '01', bis = q.get('bis') || heute();
    const aus = db.prepare("SELECT id, name FROM objekt WHERE status = 'aktiv' ORDER BY name").all().map(function (o) {
      let sollMin = 0, soll = 0, fertig = 0; for (let d = von; d <= bis; d = new Date(new Date(d + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)) { const t = PLAN.tag(db, d, { objekt: o.id }); if (t.objekte[0]) { sollMin += t.objekte[0].sollMinuten; soll += t.soll; fertig += t.fertig; } }
      const ist = db.prepare("SELECT kommen, gehen, pause_min FROM zeitbuchung WHERE objekt_id = ? AND gehen IS NOT NULL AND substr(kommen,1,10) BETWEEN ? AND ?").all(o.id, von, bis).reduce(function (a, z) { return a + Math.max(0, (new Date(z.gehen.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 60000 - (z.pause_min || 0)); }, 0);
      return { id: o.id, name: o.name, sollMinuten: Math.round(sollMin), istMinuten: Math.round(ist), aufgabenSoll: soll, aufgabenFertig: fertig };
    });
    return json(res, 200, { von: von, bis: bis, objekte: aus });
  }
  // --- QR
  if (p === '/api/qr') {
    const r = db.prepare('SELECT code FROM raum WHERE id = ?').get(Number(q.get('raum'))); if (!r) throw new Fehler(404, 'Raum nicht gefunden');
    const svg = await QR.toString('GW:' + r.code, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#022c22', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }); return res.end(svg);
  }
  // --- Qualitätsprüfung
  if (p === '/api/pruefung' && req.method === 'GET') { const pr = pruefungVoll(q.get('id')); if (!pr) throw new Fehler(404, 'Prüfung nicht gefunden'); return json(res, 200, pr); }
  if (p === '/api/pruefungen') return json(res, 200, db.prepare('SELECT p.id, p.datum, p.pruefer, p.ergebnis, p.stichprobe, p.geprueft, p.abgezeichnet_von, o.name objekt, o.id objekt_id FROM pruefung p JOIN objekt o ON o.id = p.objekt_id ORDER BY p.datum DESC, p.id DESC LIMIT 100').all());
  if (p === '/api/pruefung' && req.method === 'POST') {
    const b = await leib(req); const raeume = db.prepare('SELECT * FROM raum WHERE objekt_id = ? ORDER BY reihenfolge, id').all(Number(b.objekt_id));
    if (!raeume.length) throw new Fehler(400, 'Das Objekt hat keine Räume.');
    const n = QUAL.stichprobe(raeume.length);
    const pid = Number(db.prepare('INSERT INTO pruefung (objekt_id, datum, pruefer, art, stichprobe) VALUES (?,?,?,?,?)').run(Number(b.objekt_id), b.datum || heute(), ich.name, b.art || 'intern', n).lastInsertRowid);
    QUAL.auswahl(raeume, n, pid).forEach(function (r) { db.prepare('INSERT INTO pruefung_raum (pruefung_id, raum_id, kriterien) VALUES (?,?,?)').run(pid, r.id, JSON.stringify(QUAL.elementeFuer(r.name).map(function (e) { return { element: e, ok: null }; }))); });
    return json(res, 200, { ok: true, id: pid, stichprobe: n, von: raeume.length });
  }
  if (p === '/api/pruefung/raum' && req.method === 'POST') {
    const b = await leib(req); const k = Array.isArray(b.kriterien) ? b.kriterien.map(function (x) { return { element: String(x.element), ok: x.ok === true ? true : x.ok === false ? false : null, notiz: x.notiz || null }; }) : [];
    db.prepare('UPDATE pruefung_raum SET kriterien = ?, fehler = ? WHERE pruefung_id = ? AND raum_id = ?').run(JSON.stringify(k), k.filter(function (x) { return x.ok === false; }).length, Number(b.pruefung_id), Number(b.raum_id));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/pruefung/abschliessen' && req.method === 'POST') {
    const b = await leib(req); const pr = pruefungVoll(b.id); if (!pr) throw new Fehler(404, 'Prüfung nicht gefunden');
    const a = QUAL.auswerten(pr.raeume); if (!a.elemente) throw new Fehler(400, 'Noch kein Prüfelement bewertet.');
    db.prepare('UPDATE pruefung SET ergebnis = ?, geprueft = ?, bemerkung = ? WHERE id = ?').run(a.ergebnis, pr.raeume.filter(function (r) { return r.kriterien.some(function (k) { return k.ok !== null; }); }).length, b.bemerkung || null, pr.id);
    let neu = 0;
    pr.raeume.forEach(function (r) { r.kriterien.filter(function (k) { return k.ok === false; }).forEach(function (k) { db.prepare('INSERT INTO mangel (objekt_id, raum_id, text, quelle, gemeldet_von, frist, pruefung_id) VALUES (?,?,?,?,?,?,?)').run(pr.objekt_id, r.raum_id, 'Prüfung: ' + k.element + (k.notiz ? ' – ' + k.notiz : '') + ' nicht in Ordnung', 'pruefung', ich.name, new Date(Date.now() + 86400000).toISOString().slice(0, 10), pr.id); neu++; }); });
    return json(res, 200, { ok: true, ergebnis: a.ergebnis, fehler: a.fehler, elemente: a.elemente, maengel: neu });
  }
  // --- Kalkulation
  if (p === '/api/kalkulation') {
    const k = KALK.objekt(db, q.get('objekt'), { lohnnebenkosten_prozent: q.get('lnk') != null ? zahl(q.get('lnk')) : undefined, gemeinkosten_prozent: q.get('gk') != null ? zahl(q.get('gk')) : undefined, gewinn_prozent: q.get('gw') != null ? zahl(q.get('gw')) : undefined, lohngruppe: q.get('lg') || undefined });
    if (!k) throw new Fehler(404, 'Objekt nicht gefunden'); return json(res, 200, k);
  }
  if (p === '/api/objekt/preis' && req.method === 'POST') { const b = await leib(req); db.prepare('UPDATE objekt SET monatspreis = ? WHERE id = ?').run(zahl(b.monatspreis), Number(b.id)); return json(res, 200, { ok: true }); }
  if (p === '/api/kalkulation/kalibrieren') {
    const b = req.method === 'POST' ? await leib(req) : { objekt: q.get('objekt'), ziel: q.get('ziel') };
    try { const v = req.method === 'POST' ? KALK.kalibrierungUebernehmen(db, b.objekt, b.ziel) : KALK.kalibrieren(db, b.objekt, b.ziel); if (!v) throw new Fehler(404, 'Objekt nicht gefunden'); return json(res, 200, v); }
    catch (e) { if (e instanceof Fehler) throw e; throw new Fehler(400, e.message); }
  }
  if (p === '/api/katalog' && req.method === 'POST') return json(res, 200, Object.assign({ ok: true }, KAT.laden(db, LV.vergleich)));
  // --- Einsatzplan
  if (p === '/api/einsatzplan') { const d = q.get('datum') || heute(); const n = new Date(); return json(res, 200, { datum: d, auslastung: EINS.auslastung(db), lage: EINS.lage(db, d, d === heute() ? n.getHours() * 60 + n.getMinutes() : null), abwesenheiten: db.prepare('SELECT a.*, m.name FROM abwesenheit a JOIN mitarbeiter m ON m.id = a.mitarbeiter_id WHERE a.bis >= ? ORDER BY a.von').all(heute()) }); }
  if (p === '/api/abwesenheit' && req.method === 'POST') {
    const b = await leib(req);
    if (b.loeschen) { db.prepare('DELETE FROM abwesenheit WHERE id = ?').run(Number(b.id)); return json(res, 200, { ok: true }); }
    if (!b.mitarbeiter_id || !/^\d{4}-\d{2}-\d{2}$/.test(b.von || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.bis || '') || b.bis < b.von) throw new Fehler(400, 'Mitarbeiter, von und bis prüfen');
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO abwesenheit (mitarbeiter_id, von, bis, art, notiz) VALUES (?,?,?,?,?)').run(Number(b.mitarbeiter_id), b.von, b.bis, b.art || 'krank', b.notiz || null).lastInsertRowid) });
  }
  if (p === '/api/vorschlaege') return json(res, 200, EINS.vorschlaege(db, q.get('objekt'), q.get('datum') || heute()));
  if (p === '/api/vertretung' && req.method === 'POST') {
    const b = await leib(req); if (!b.objekt_id || !b.mitarbeiter_id) throw new Fehler(400, 'Objekt und Mitarbeiter nötig');
    db.prepare('INSERT OR IGNORE INTO vertretung (objekt_id, datum, fuer_id, mitarbeiter_id) VALUES (?,?,?,?)').run(Number(b.objekt_id), b.datum || heute(), b.fuer_id || null, Number(b.mitarbeiter_id));
    return json(res, 200, { ok: true });
  }
  // --- Dienstplan
  if (p === '/api/dienstplan') { const m = q.get('montag'); if (!/^\d{4}-\d{2}-\d{2}$/.test(m || '')) throw new Fehler(400, 'Montag fehlt'); return json(res, 200, DP.woche(db, m)); }
  if (p === '/api/schicht' && req.method === 'POST') {
    const b = await leib(req);
    if (b.id && b.loeschen) { db.prepare('DELETE FROM schicht WHERE id = ?').run(Number(b.id)); return json(res, 200, { ok: true }); }
    try { return json(res, 200, { ok: true, ids: DP.speichern(db, b) }); } catch (e) { throw new Fehler(400, e.message); }
  }
  if (p === '/api/dienstplan/kopieren' && req.method === 'POST') { const b = await leib(req); try { return json(res, 200, { ok: true, kopiert: DP.vorwocheKopieren(db, b.montag) }); } catch (e) { throw new Fehler(409, e.message); } }
  if (p === '/api/stunden') { const von = q.get('von') || heute().slice(0, 8) + '01', bis = q.get('bis') || heute(); return json(res, 200, { von: von, bis: bis, mitarbeiter: DP.stunden(db, von, bis) }); }
  if (p === '/api/datev') {
    const monat = q.get('monat'); if (!/^\d{4}-\d{2}$/.test(monat || '')) throw new Fehler(400, 'Monat im Format JJJJ-MM');
    const d = DP.datev(db, monat);
    if (q.get('pruefen') === '1') return json(res, 200, { fehlendePersonalnummer: d.fehlendePersonalnummer, nurPlan: d.nurPlan, zeilen: d.datei.split(/\r?\n/).length - 1 });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="DATEV_Bewegungsdaten_' + monat + '.csv"' }); return res.end(d.datei);
  }
  // --- Abrechnung: Preisbausteine, Abruf-Aufträge, Rechnungen
  if (p === '/api/preispositionen') return json(res, 200, db.prepare('SELECT * FROM preisposition WHERE objekt_id = ? ORDER BY id').all(Number(q.get('objekt'))));
  if (p === '/api/preisposition' && req.method === 'POST') {
    const b = await leib(req);
    if (b.id && b.loeschen) { db.prepare('DELETE FROM preisposition WHERE id = ?').run(Number(b.id)); return json(res, 200, { ok: true }); }
    if (!b.objekt_id || !String(b.bezeichnung || '').trim() || zahl(b.preis) == null) throw new Fehler(400, 'Objekt, Bezeichnung und Preis nötig');
    const art = ['je_ausfuehrung', 'monatlich', 'einmalig', 'stundensatz'].indexOf(b.art) >= 0 ? b.art : 'je_ausfuehrung';
    const monate = String(b.monate || '').split(/[^0-9]+/).filter(Boolean).map(Number);
    if (monate.some(function (m) { return m < 1 || m > 12; })) throw new Fehler(400, 'Saison-Monate als Zahlen 1–12, z. B. 11,12,1,2,3');
    if (art === 'je_ausfuehrung') { const rg = T.lesen(String(b.turnus || '')); if (!b.turnus || rg.art === 'unbekannt') throw new Fehler(400, 'Für „je Durchgang" bitte einen Turnus angeben (z. B. 1 Q, 1 M, 2 J)'); }
    const f = [String(b.bezeichnung).trim(), art, art === 'je_ausfuehrung' ? String(b.turnus).trim() : null, zahl(b.preis), b.einheit || ({ monatlich: 'Monat', stundensatz: 'Std.', einmalig: 'pauschal' }[art] || 'Durchgang'), b.aktiv === false ? 0 : 1, art === 'monatlich' && monate.length ? monate.join(',') : null];
    if (b.id) { db.prepare('UPDATE preisposition SET bezeichnung=?, art=?, turnus=?, preis=?, einheit=?, aktiv=?, monate=? WHERE id=?').run(...f, Number(b.id)); return json(res, 200, { ok: true, id: Number(b.id) }); }
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO preisposition (bezeichnung, art, turnus, preis, einheit, aktiv, monate, objekt_id) VALUES (?,?,?,?,?,?,?,?)').run(...f, Number(b.objekt_id)).lastInsertRowid) });
  }
  if (p === '/api/auftraege') return json(res, 200, db.prepare(`SELECT a.*, o.name objekt, k.name kunde, r.nummer rechnung FROM auftrag a JOIN objekt o ON o.id = a.objekt_id LEFT JOIN kunde k ON k.id = o.kunde_id LEFT JOIN rechnung r ON r.id = a.rechnung_id
      ${q.get('status') ? 'WHERE a.status = ?' : ''} ORDER BY CASE a.status WHEN 'angefragt' THEN 0 WHEN 'bestätigt' THEN 1 WHEN 'erledigt' THEN 2 ELSE 3 END, a.id DESC LIMIT 300`).all(...(q.get('status') ? [q.get('status')] : [])));
  if (p === '/api/auftrag' && req.method === 'POST') {
    const b = await leib(req);
    if (!b.id) {
      if (!b.objekt_id || !String(b.text || '').trim()) throw new Fehler(400, 'Objekt und Beschreibung nötig');
      return json(res, 200, { ok: true, id: Number(db.prepare("INSERT INTO auftrag (objekt_id, text, wunschdatum, termin, festpreis, quelle, angefragt_von, status) VALUES (?,?,?,?,?,'buero',?,'bestätigt')").run(Number(b.objekt_id), String(b.text).trim(), b.wunschdatum || null, b.wunschdatum || null, zahl(b.festpreis), ich.name).lastInsertRowid) });
    }
    const a = db.prepare('SELECT * FROM auftrag WHERE id = ?').get(Number(b.id)); if (!a) throw new Fehler(404, 'Auftrag nicht gefunden');
    if (a.status === 'abgerechnet') throw new Fehler(409, 'Der Auftrag ist schon abgerechnet — Änderung nur per Storno der Rechnung.');
    if (b.status === 'bestätigt') {
      const termin = b.termin || a.termin || a.wunschdatum || null;
      if (termin && !/^\d{4}-\d{2}-\d{2}$/.test(termin)) throw new Fehler(400, 'Termin im Format JJJJ-MM-TT');
      let schicht = null;
      if (b.mitarbeiter_id && b.beginn && b.ende) {
        if (!termin) throw new Fehler(400, 'Zum Einplanen bitte einen Termin angeben.');
        try { schicht = DP.speichern(db, { mitarbeiter_id: b.mitarbeiter_id, objekt_id: a.objekt_id, datum: termin, beginn: b.beginn, ende: b.ende, notiz: 'Sonderleistung: ' + a.text })[0]; } catch (e) { throw new Fehler(400, e.message); }
      }
      db.prepare("UPDATE auftrag SET status = 'bestätigt', termin = ?, festpreis = ?, antwort = ? WHERE id = ?").run(termin, b.festpreis != null && b.festpreis !== '' ? zahl(b.festpreis) : a.festpreis, b.antwort || null, a.id);
      return json(res, 200, { ok: true, schicht: schicht });
    }
    if (b.status === 'erledigt') {
      const st = zahl(b.stunden), fp = b.festpreis != null && b.festpreis !== '' ? zahl(b.festpreis) : a.festpreis;
      if (st == null && fp == null) throw new Fehler(400, 'Bitte Stunden oder Festpreis angeben — sonst lässt sich nichts abrechnen.');
      if (b.datum && b.datum > heute()) throw new Fehler(400, '„Erledigt am" liegt in der Zukunft.');
      db.prepare("UPDATE auftrag SET status = 'erledigt', stunden = ?, festpreis = ?, erledigt_am = ? WHERE id = ?").run(st, fp, /^\d{4}-\d{2}-\d{2}$/.test(b.datum || '') ? b.datum : heute(), a.id); return json(res, 200, { ok: true });
    }
    if (b.status === 'abgelehnt') { db.prepare("UPDATE auftrag SET status = 'abgelehnt', antwort = ? WHERE id = ?").run(b.antwort || null, a.id); return json(res, 200, { ok: true }); }
    throw new Fehler(400, 'Unbekannter Status');
  }
  if (p === '/api/rechnungen') return json(res, 200, db.prepare(`SELECT r.id, r.nummer, r.status, r.datum, r.faellig, r.zeitraum_von, r.zeitraum_bis, r.netto, r.brutto, r.bezahlt_am, r.storno_von, r.betreff, r.bestellnummer, r.mahnsperre, r.kunde_id, k.name kunde, k.kundennummer, o.name objekt,
      (SELECT COALESCE(SUM(z.betrag),0) FROM zahlung z WHERE z.rechnung_id = r.id) bezahlt_summe, (SELECT MAX(m.stufe) FROM mahnung m WHERE m.rechnung_id = r.id) mahnstufe
      FROM rechnung r JOIN kunde k ON k.id = r.kunde_id LEFT JOIN objekt o ON o.id = r.objekt_id ${q.get('status') ? 'WHERE r.status = ?' : ''} ORDER BY r.nummer IS NOT NULL, r.nummer DESC, r.id DESC LIMIT 2000`).all(...(q.get('status') ? [q.get('status')] : []))
    .map(function (r) { r.offen = (r.status === 'gestellt' && !r.storno_von) ? AB.r2(r.brutto - r.bezahlt_summe) : 0; return r; }));
  // Kennzahlen der Rechnungsübersicht
  if (p === '/api/abrechnung/kennzahlen') {
    const j = heute().slice(0, 4), m = heute().slice(0, 7);
    const umsatz = like => AB.r2(db.prepare("SELECT COALESCE(SUM(netto),0) s FROM rechnung WHERE nummer IS NOT NULL AND datum LIKE ?").get(like + '%').s);   // Stornos sind negativ und heben auf
    const op = MW.offenePosten(db);
    return json(res, 200, { umsatzJahr: umsatz(j), umsatzMonat: umsatz(m), offen: AB.r2(op.reduce(function (a, x) { return a + x.offen; }, 0)), offenAnzahl: op.length,
      ueberfaellig: AB.r2(op.filter(function (x) { return x.tageUeberfaellig > 0; }).reduce(function (a, x) { return a + x.offen; }, 0)), ueberfaelligAnzahl: op.filter(function (x) { return x.tageUeberfaellig > 0; }).length,
      eingangMonat: AB.r2(db.prepare("SELECT COALESCE(SUM(betrag),0) s FROM zahlung WHERE art <> 'ausbuchung' AND datum LIKE ?").get(m + '%').s), mahnfaellig: op.filter(function (x) { return x.naechsteStufe != null; }).length,
      entwuerfe: db.prepare("SELECT COUNT(*) n FROM rechnung WHERE status = 'entwurf'").get().n });
  }
  // --- Offene Posten und Mahnwesen
  if (p === '/api/offene-posten' || p === '/api/offene-posten.csv') {
    const op = MW.offenePosten(db, q.get('stichtag') || heute());
    if (p === '/api/offene-posten') return json(res, 200, { stichtag: q.get('stichtag') || heute(), posten: op, alter: MW.altersstruktur(op), summe: AB.r2(op.reduce(function (a, x) { return a + x.offen; }, 0)) });
    const z = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, dd = d => d ? d.split('-').reverse().join('.') : '', bt = v => (Number(v) || 0).toFixed(2).replace('.', ',');
    const zeilen = ['Rechnung;Kunde;Kundennr.;Objekt;Rechnungsdatum;Fällig;Tage überfällig;Brutto;Offen;Mahnstufe;Letzte Mahnung;Mahnsperre'].concat(op.map(function (x) { return [x.nummer, x.kunde, x.kundennummer, x.objekt, dd(x.datum), dd(x.faellig), x.tageUeberfaellig, bt(x.brutto), bt(x.offen), x.mahnstufeText, dd(x.letzteMahnung), x.mahnsperre ? 'ja' : ''].map(z).join(';'); }));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="Offene_Posten_' + heute() + '.csv"' }); return res.end('﻿' + zeilen.join('\r\n') + '\r\n');
  }
  if (p === '/api/mahnungen') return json(res, 200, db.prepare('SELECT m.*, r.nummer, k.name kunde FROM mahnung m JOIN rechnung r ON r.id = m.rechnung_id JOIN kunde k ON k.id = r.kunde_id ORDER BY m.datum DESC, m.id DESC LIMIT 500').all().map(function (m) { m.titel = MW.STUFE[m.stufe]; return m; }));
  if (p === '/api/mahnung/vorschau') {
    const op = MW.offenePosten(db).find(function (x) { return x.id === Number(q.get('rechnung')); }); if (!op) throw new Fehler(404, 'Rechnung ist nicht offen');
    if (op.naechsteStufe == null) return json(res, 200, { faellig: false, grund: op.grund });
    return json(res, 200, Object.assign({ faellig: true }, MW.berechnen(db, db.prepare('SELECT * FROM rechnung WHERE id = ?').get(op.id), op.naechsteStufe, heute())));
  }
  if (p === '/api/mahnung/pdf') {
    let buf; try { buf = await BRIEF.mahnung(db, q.get('id')); } catch (e) { throw new Fehler(404, e.message); }
    const m = MW.voll(db, q.get('id'));
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': (q.get('download') === '1' ? 'attachment' : 'inline') + '; filename="' + m.titel.replace(/[^A-Za-z0-9ÄÖÜäöüß.]+/g, '_') + '_' + m.rechnung.nummer + '.pdf"', 'Cache-Control': 'no-store' }); return res.end(buf);
  }
  if ((p === '/api/mahnung' || p === '/api/mahnlauf' || p === '/api/mahnung/zuruecknehmen') && req.method === 'POST') {
    const b = await leib(req);
    try {
      if (p === '/api/mahnung') return json(res, 200, Object.assign({ ok: true }, MW.anlegen(db, b.rechnung_id)));
      if (p === '/api/mahnlauf') return json(res, 200, Object.assign({ ok: true }, MW.lauf(db, Array.isArray(b.ids) ? b.ids : null)));
      MW.zuruecknehmen(db, b.id); return json(res, 200, { ok: true });
    } catch (e) { throw new Fehler(400, e.message); }
  }
  if (p === '/api/basiszins' && req.method === 'GET') return json(res, 200, db.prepare('SELECT * FROM basiszins ORDER BY gueltig_ab DESC').all());
  if (p === '/api/basiszins' && req.method === 'POST') {
    const b = await leib(req);
    if (b.loeschen) { db.prepare('DELETE FROM basiszins WHERE gueltig_ab = ?').run(String(b.gueltig_ab)); return json(res, 200, { ok: true }); }
    if (!/^\d{4}-(01|07)-01$/.test(b.gueltig_ab || '')) throw new Fehler(400, 'Der Basiszinssatz gilt jeweils ab 01.01. oder 01.07.');
    const pz = Number(String(b.prozent).replace(',', '.')); if (!isFinite(pz) || pz < -5 || pz > 15) throw new Fehler(400, 'Prozentsatz prüfen');
    db.prepare('INSERT INTO basiszins (gueltig_ab, prozent, quelle) VALUES (?,?,?) ON CONFLICT(gueltig_ab) DO UPDATE SET prozent = excluded.prozent, quelle = excluded.quelle').run(b.gueltig_ab, pz, b.quelle || 'von Hand'); return json(res, 200, { ok: true });
  }
  // --- Artikel / Leistungsstamm (für freie Rechnungen)
  if (p === '/api/artikel' && req.method === 'GET') return json(res, 200, db.prepare('SELECT * FROM artikel ORDER BY aktiv DESC, nummer, bezeichnung').all());
  if (p === '/api/artikel' && req.method === 'POST') {
    const b = await leib(req);
    if (b.id && b.loeschen) { db.prepare('UPDATE artikel SET aktiv = 0 WHERE id = ?').run(Number(b.id)); return json(res, 200, { ok: true }); }
    if (!String(b.bezeichnung || '').trim() || zahl(b.preis) == null && Number(b.preis) !== 0) throw new Fehler(400, 'Bezeichnung und Preis nötig');
    const f = [String(b.nummer || '').trim() || null, String(b.bezeichnung).trim(), String(b.beschreibung || '').trim() || null, b.einheit || 'Std.', Number(String(b.preis).replace(',', '.')), b.aktiv === false ? 0 : 1];
    if (b.id) { db.prepare('UPDATE artikel SET nummer=?, bezeichnung=?, beschreibung=?, einheit=?, preis=?, aktiv=? WHERE id=?').run(...f, Number(b.id)); return json(res, 200, { ok: true, id: Number(b.id) }); }
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO artikel (nummer, bezeichnung, beschreibung, einheit, preis, aktiv) VALUES (?,?,?,?,?,?)').run(...f).lastInsertRowid) });
  }
  if (p === '/api/rechnung' && req.method === 'GET') { const r = AB.voll(db, q.get('id')); if (!r) throw new Fehler(404, 'Rechnung nicht gefunden'); r.luecken = r.status === 'entwurf' ? AB.pflichtLuecken(db, r) : []; return json(res, 200, r); }
  if (p === '/api/rechnung/vorschlag') { try { const v = AB.vorschlag(db, q.get('objekt'), q.get('monat')); return json(res, 200, { von: v.von, bis: v.bis, positionen: v.positionen, hinweise: v.hinweise }); } catch (e) { throw new Fehler(400, e.message); } }
  if (p === '/api/rechnung/pdf') {
    const r = AB.voll(db, q.get('id')); if (!r) throw new Fehler(404, 'Rechnung nicht gefunden');
    return pdfSenden(res, r, q.get('download') === '1');
  }
  if (p === '/api/abrechnungslaeufe') return json(res, 200, db.prepare('SELECT * FROM abrechnungslauf ORDER BY id DESC LIMIT 24').all().map(function (l) { l.ergebnis = JSON.parse(l.ergebnis || '{}'); return l; }));
  if (p === '/api/rechnung/xrechnung') {
    let xml; try { xml = AB.xrechnung(db, q.get('id')); } catch (e) { throw new Fehler(400, e.message); }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="XRechnung_' + AB.voll(db, q.get('id')).nummer + '.xml"' }); return res.end(xml);
  }
  if (p.startsWith('/api/rechnung/') && req.method === 'POST') {
    const b = await leib(req);
    try {
      if (p === '/api/rechnung/entwurf') return json(res, 200, Object.assign({ ok: true }, b.kunde_id ? AB.entwurfKunde(db, b.kunde_id, b.monat) : AB.entwurf(db, b.objekt_id, b.monat)));
      if (p === '/api/rechnung/entwuerfe' || p === '/api/rechnung/lauf') return json(res, 200, Object.assign({ ok: true }, AB.lauf(db, b.monat, { stellen: !!b.stellen, art: 'hand' })));
      if (p === '/api/rechnung/position') { AB.position(db, b); return json(res, 200, { ok: true }); }
      if (p === '/api/rechnung/stellen') return json(res, 200, { ok: true, nummer: AB.stellen(db, b.id) });
      if (p === '/api/rechnung/stornieren') return json(res, 200, { ok: true, nummer: AB.stornieren(db, b.id) });
      if (p === '/api/rechnung/bezahlt') { AB.bezahlt(db, b.id, b.datum, b.zurueck); return json(res, 200, { ok: true }); }
      if (p === '/api/rechnung/loeschen') { AB.loeschen(db, b.id); return json(res, 200, { ok: true }); }
      if (p === '/api/rechnung/frei') return json(res, 200, Object.assign({ ok: true }, AB.frei(db, b)));
      if (p === '/api/rechnung/kopf') { AB.kopfAendern(db, b); return json(res, 200, { ok: true }); }
      if (p === '/api/rechnung/objekt') return json(res, 200, Object.assign({ ok: true }, AB.objektUebernehmen(db, b.id, b.objekt_id, b.monat)));
      if (p === '/api/rechnung/artikel') { AB.artikelUebernehmen(db, b.id, b.artikel_id, b.menge, b.gruppe); return json(res, 200, { ok: true }); }
      if (p === '/api/rechnung/verschieben') { AB.verschieben(db, b.id, b.position_id, b.richtung); return json(res, 200, { ok: true }); }
      if (p === '/api/rechnung/kopieren') return json(res, 200, { ok: true, id: AB.kopieren(db, b.id, b) });
      if (p === '/api/rechnung/zahlung') return json(res, 200, Object.assign({ ok: true }, AB.zahlungBuchen(db, b)));
      if (p === '/api/rechnung/mahnsperre') { MW.sperre(db, b.id, !!b.an, b.grund); return json(res, 200, { ok: true }); }
    } catch (e) { if (e instanceof Fehler) throw e; throw new Fehler(400, e.message); }
  }
  // --- Bewerbermanagement
  if (p === '/api/bewerber' && req.method === 'GET') {
    if (q.get('id')) { const x = BW.voll(db, q.get('id')); if (!x) throw new Fehler(404, 'Bewerber nicht gefunden'); return json(res, 200, x); }
    return json(res, 200, { liste: BW.liste(db), kennzahlen: BW.kennzahlen(db), status: BW.STATUS, quellen: BW.QUELLEN });
  }
  if (p === '/api/bewerber/dokument' && req.method === 'GET') {
    const d = db.prepare('SELECT * FROM bewerber_dokument WHERE id = ?').get(Number(q.get('id'))); if (!d) throw new Fehler(404, 'Dokument nicht gefunden');
    const datei = path.join(PERSONAL, path.basename(d.datei)); if (!fs.existsSync(datei)) throw new Fehler(404, 'Datei fehlt');
    res.writeHead(200, { 'Content-Type': d.typ || 'application/octet-stream', 'Content-Disposition': 'inline; filename="' + String(d.titel || 'Bewerbung').replace(/[^A-Za-zÄÖÜäöüß0-9.]+/g, '_') + path.extname(d.datei) + '"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(datei).pipe(res);
  }
  if (p.startsWith('/api/bewerber') && req.method === 'POST') {
    const b = await leib(req);
    try {
      if (p === '/api/bewerber') return json(res, 200, { ok: true, id: BW.speichern(db, b, ich.name) });
      if (p === '/api/bewerber/status') { BW.statusSetzen(db, b.id, b.status, b.grund, ich.name); return json(res, 200, { ok: true }); }
      if (p === '/api/bewerber/notiz') { if (!String(b.text || '').trim()) throw new Error('Notiz ist leer'); if (!db.prepare('SELECT 1 FROM bewerber WHERE id = ?').get(Number(b.id))) throw new Error('Bewerber nicht gefunden'); BW.verlauf(db, Number(b.id), ich.name, String(b.text).trim()); return json(res, 200, { ok: true }); }
      if (p === '/api/bewerber/einstellen') { const mid = BW.einstellen(db, b.id, b, ich.name, PERSONAL); RG.checklisteAnlegen(db, 'eintritt', mid, b.eintritt, ich.name); return json(res, 200, { ok: true, mitarbeiter_id: mid }); }
      if (p === '/api/bewerber/loeschen') {
        const x = db.prepare('SELECT * FROM bewerber WHERE id = ?').get(Number(b.id)); if (!x) throw new Error('Bewerber nicht gefunden');
        if (x.status === 'eingestellt') throw new Error('Eingestellte Bewerber leben in der Personalakte weiter — hier nicht löschen.');
        db.prepare('SELECT datei FROM bewerber_dokument WHERE bewerber_id = ?').all(x.id).forEach(function (d) { try { fs.unlinkSync(path.join(PERSONAL, path.basename(d.datei))); } catch (e) {} });
        db.prepare('DELETE FROM bewerber WHERE id = ?').run(x.id); return json(res, 200, { ok: true });
      }
      if (p === '/api/bewerber/dokument') {
        if (b.id && b.loeschen) { const d = db.prepare('SELECT * FROM bewerber_dokument WHERE id = ?').get(Number(b.id)); if (d) { db.prepare('DELETE FROM bewerber_dokument WHERE id = ?').run(d.id); try { fs.unlinkSync(path.join(PERSONAL, path.basename(d.datei))); } catch (e) {} } return json(res, 200, { ok: true }); }
        if (!db.prepare('SELECT 1 FROM bewerber WHERE id = ?').get(Number(b.bewerber_id))) throw new Error('Bewerber nicht gefunden');
        const m = String(b.datei || '').match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,(.+)$/); if (!m) throw new Error('Bitte PDF, JPG oder PNG hochladen.');
        const inhalt = Buffer.from(m[2], 'base64'); if (inhalt.length > 10e6) throw new Error('Die Datei ist größer als 10 MB.');
        const name = 'bw' + Number(b.bewerber_id) + '-' + Date.now() + '-' + require('crypto').randomBytes(4).toString('hex') + { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[m[1]];
        fs.writeFileSync(path.join(PERSONAL, name), inhalt);
        return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO bewerber_dokument (bewerber_id, titel, datei, typ) VALUES (?,?,?,?)').run(Number(b.bewerber_id), b.titel || 'Bewerbung', name, m[1]).lastInsertRowid) });
      }
    } catch (e) { throw new Fehler(400, e.message); }
  }
  // --- Register (Arbeitsschutz, Ausstattung, Fuhrpark, Qualität & Verwaltung)
  if (p === '/api/register' && req.method === 'GET') {
    try {
      const id = q.get('id');
      if (!id) return json(res, 200, { katalog: RG.katalog(db), fristen: RG.fristen(db, Number(q.get('tage')) || 30), ersthelfer: RG.ersthelferQuote(db), unterweisungen: UW.faellig(db).length });
      const r = RG.def(id);
      if (q.get('eintrag')) { const d = RG.holen(db, id, q.get('eintrag')); return json(res, 200, { register: r, eintrag: d, hinweise: RG.hinweise(db, id, d) }); }
      const l = RG.liste(db, id); return json(res, 200, { register: r, liste: l.map(function (d) { d.hinweise = RG.hinweise(db, id, d); return d; }), fristen: RG.fristen(db, 30, id) });
    } catch (e) { throw new Fehler(404, e.message); }
  }
  if (p === '/api/register.csv') { let t; try { t = RG.csv(db, q.get('id')); } catch (e) { throw new Fehler(404, e.message); } res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + RG.def(q.get('id')).titel.replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + '_' + heute() + '.csv"', 'Cache-Control': 'no-store' }); return res.end(t); }
  if (p === '/api/register.pdf') {
    let buf, d; try { d = RG.holen(db, q.get('id'), q.get('eintrag')); buf = await BRIEF.registerBlatt(db, q.get('id'), d); } catch (e) { throw new Fehler(404, e.message); }
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="' + (RG.def(q.get('id')).pdf || 'Registerblatt').replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + '_' + d.id + '.pdf"', 'Cache-Control': 'no-store' }); return res.end(buf);
  }
  if (p === '/api/register/datei' && req.method === 'GET') {
    let d; try { d = RG.holen(db, q.get('id'), q.get('eintrag')); } catch (e) { throw new Fehler(404, e.message); }
    const v = d[q.get('feld')]; if (!v || !v.datei) throw new Fehler(404, 'Keine Datei hinterlegt');
    const datei = path.join(REGDATEIEN, path.basename(v.datei)); if (!fs.existsSync(datei)) throw new Fehler(404, 'Datei fehlt');
    res.writeHead(200, { 'Content-Type': v.typ || 'application/octet-stream', 'Content-Disposition': 'inline; filename="' + q.get('feld') + '_' + d.id + path.extname(v.datei) + '"', 'Cache-Control': 'no-store' });
    return fs.createReadStream(datei).pipe(res);
  }
  if (p.startsWith('/api/register') && req.method === 'POST') {
    const b = await leib(req);
    try {
      if (p === '/api/register') return json(res, 200, { ok: true, id: RG.speichern(db, b.register, b, ich.name) });
      if (p === '/api/register/loeschen') { if (!RG.loeschen(db, b.register, b.id)) throw new Error('Eintrag nicht gefunden'); return json(res, 200, { ok: true }); }
      if (p === '/api/register/checkliste') { const id = RG.checklisteAnlegen(db, b.art === 'austritt' ? 'austritt' : 'eintritt', b.mitarbeiter_id, b.stichtag, ich.name); if (!id) throw new Error('Für diese Person gibt es die Checkliste schon'); return json(res, 200, { ok: true, id: id }); }
      if (p === '/api/register/datei') {
        const m = String(b.datei || '').match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,(.+)$/); if (!m) throw new Error('Bitte PDF, JPG oder PNG hochladen.');
        const inhalt = Buffer.from(m[2], 'base64'); if (inhalt.length > 10e6) throw new Error('Die Datei ist größer als 10 MB.');
        const name = 'rg-' + String(b.register).replace(/[^a-z]/g, '') + Number(b.id) + '-' + Date.now() + '-' + require('crypto').randomBytes(4).toString('hex') + { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[m[1]];
        fs.writeFileSync(path.join(REGDATEIEN, name), inhalt);
        RG.dateiSetzen(db, b.register, b.id, b.feld, name, m[1]);   // die alte Fassung bleibt als Datei liegen (Nachweis)
        return json(res, 200, { ok: true });
      }
    } catch (e) { throw new Fehler(400, e.message); }
  }
  // --- Unterweisungen und Dienstanweisungen
  if (p === '/api/unterweisung' && req.method === 'GET') {
    if (q.get('id')) { const t = UW.thema(db, q.get('id')); if (!t) throw new Fehler(404, 'Thema nicht gefunden'); return json(res, 200, t); }
    if (q.get('mitarbeiter')) return json(res, 200, UW.person(db, q.get('mitarbeiter')));
    return json(res, 200, { themen: UW.themen(db), faellig: UW.faellig(db) });
  }
  if (p === '/api/unterweisung.pdf') {
    const t = UW.thema(db, q.get('id')); if (!t) throw new Fehler(404, 'Thema nicht gefunden');
    const buf = await BRIEF.unterweisungsnachweis(db, t);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Unterweisung_' + t.titel.replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + '.pdf"', 'Cache-Control': 'no-store' }); return res.end(buf);
  }
  if (p.startsWith('/api/unterweisung') && req.method === 'POST') {
    const b = await leib(req);
    try {
      if (p === '/api/unterweisung') return json(res, 200, Object.assign({ ok: true }, UW.speichern(db, b)));
      if (p === '/api/unterweisung/nachweis') return json(res, 200, { ok: true, anzahl: UW.nachweisen(db, b, ich.name) });
      if (p === '/api/unterweisung/archivieren') { UW.archivieren(db, b.id); return json(res, 200, { ok: true }); }
    } catch (e) { throw new Fehler(400, e.message); }
  }
  // --- Objektauswertung und Controlling
  if (p === '/api/objektauswertung') { try { return json(res, 200, AUSW.objekte(db, q.get('von'), q.get('bis'))); } catch (e) { throw new Fehler(400, e.message); } }
  if (p === '/api/objekt/verlauf') { try { return json(res, 200, AUSW.verlauf(db, q.get('id'), Number(q.get('monate')) || 12)); } catch (e) { throw new Fehler(404, e.message); } }
  if (p === '/api/controlling') {
    const op = MW.offenePosten(db), e = DB.einstellungen(db);
    return json(res, 200, { monate: AUSW.monate(db, 12), offen: AB.r2(op.reduce(function (a, x) { return a + x.offen; }, 0)), ueberfaellig: AB.r2(op.filter(function (x) { return x.tageUeberfaellig > 0; }).reduce(function (a, x) { return a + x.offen; }, 0)),
      konten: CTRL.konten(e), einstellungen: { datev_berater_nr: e.datev_berater_nr, datev_mandant_nr: e.datev_mandant_nr, datev_kontenrahmen: e.datev_kontenrahmen, datev_erloeskonto: e.datev_erloeskonto, datev_erloeskonto_13b: e.datev_erloeskonto_13b, datev_bankkonto: e.datev_bankkonto, datev_wj_beginn: e.datev_wj_beginn, lodas_bs_nr: e.lodas_bs_nr, sepa_glaeubiger_id: e.sepa_glaeubiger_id },
      kunden: db.prepare('SELECT id, name, kundennummer, debitor_konto, sepa_iban, sepa_bic, mandatsreferenz, mandat_datum, lastschrift FROM kunde ORDER BY name').all() });
  }
  if (p === '/api/datev/buchungsstapel') {
    let d; try { d = CTRL.buchungsstapel(db, q.get('von'), q.get('bis'), { rechnungen: q.get('rechnungen') !== '0', zahlungen: q.get('zahlungen') !== '0' }); } catch (e) { throw new Fehler(400, e.message); }
    if (q.get('pruefen') === '1') return json(res, 200, { rechnungen: d.rechnungen, zahlungen: d.zahlungen, konten: d.konten, fehlt: d.fehlt });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=windows-1252', 'Content-Disposition': 'attachment; filename="EXTF_Buchungsstapel_' + q.get('von') + '_' + q.get('bis') + '.csv"', 'Cache-Control': 'no-store' });
    return res.end(Buffer.from(d.datei, 'latin1'));
  }
  if (p === '/api/datev/lodas') {
    let d; try { d = CTRL.lodas(db, q.get('monat')); } catch (e) { throw new Fehler(400, e.message); }
    if (q.get('pruefen') === '1') return json(res, 200, { zeilen: d.zeilen, fehlendePersonalnummer: d.fehlendePersonalnummer });
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=windows-1252', 'Content-Disposition': 'attachment; filename="LODAS_Bewegungsdaten_' + q.get('monat') + '.txt"', 'Cache-Control': 'no-store' });
    return res.end(Buffer.from(d.datei, 'latin1'));
  }
  if (p === '/api/objektauswertung.csv') {
    let a; try { a = AUSW.objekte(db, q.get('von'), q.get('bis')); } catch (e) { throw new Fehler(400, e.message); }
    const z = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, k = v => v == null ? '' : String(v).replace('.', ',');
    const zeilen = ['Objekt;Objektnr.;Kunde;Umsatz netto;Lohnkosten;DB I;DB I %;Soll-Std.;Ist-Std.;Abweichung %;Erlös je Std.;Qualität %;Mängel;Kostenstelle'].concat(a.objekte.map(function (o) { return [o.name, o.objektnummer, o.kunde, k(o.umsatz), k(o.lohnkosten), k(o.db), k(o.dbProzent), k(o.sollStunden), k(o.istStunden), k(o.abweichungProzent), k(o.stundensatz), k(o.qualitaet), o.maengel, CTRL.kostenstelle(o)].map(z).join(';'); }));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="Objektauswertung_' + a.von + '_' + a.bis + '.csv"' }); return res.end('﻿' + zeilen.join('\r\n') + '\r\n');
  }
  if (p === '/api/bank/camt' && req.method === 'POST') {
    const b = await leib(req); const xml = String(b.xml || ''); if (xml.length > 12e6) throw new Fehler(413, 'Datei zu groß');
    try { return json(res, 200, b.buchen ? Object.assign({ ok: true }, CTRL.camtBuchen(db, xml, b.auswahl)) : { ok: true, umsaetze: CTRL.camtAbgleich(db, xml) }); } catch (e) { throw new Fehler(400, e.message); }
  }
  if (p === '/api/lastschrift' && req.method === 'GET') return json(res, 200, CTRL.lastschriftKandidaten(db));
  if (p === '/api/lastschrift' && req.method === 'POST') {
    const b = await leib(req); let d; try { d = CTRL.pain008(db, Array.isArray(b.ids) ? b.ids : [], b.datum); } catch (e) { throw new Fehler(400, e.message); }
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="SEPA_Lastschrift_' + b.datum + '.xml"', 'X-Anzahl': String(d.anzahl), 'X-Summe': String(d.summe) }); return res.end(d.xml);
  }
  if (p === '/api/zahlweise' && req.method === 'POST') {
    const b = await leib(req), k = db.prepare('SELECT * FROM kunde WHERE id = ?').get(Number(b.id)); if (!k) throw new Fehler(404, 'Kunde nicht gefunden');
    const art = ['CORE', 'B2B'].indexOf(b.lastschrift || '') >= 0 ? b.lastschrift : null;
    const ib = String(b.sepa_iban || '').replace(/\s/g, '').toUpperCase() || null; if (ib) { const f = PERS.iban(ib); if (f) throw new Fehler(400, f); }
    if (art && (!ib || !String(b.mandatsreferenz || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(b.mandat_datum || ''))) throw new Fehler(400, 'Für die Lastschrift braucht es IBAN, Mandatsreferenz und das Datum der Unterschrift.');
    if (b.debitor_konto && !/^\d{5,9}$/.test(String(b.debitor_konto))) throw new Fehler(400, 'Debitorenkonto: 5 bis 9 Ziffern (z. B. 10001)');
    db.prepare('UPDATE kunde SET debitor_konto = ?, sepa_iban = ?, sepa_bic = ?, mandatsreferenz = ?, mandat_datum = ?, lastschrift = ? WHERE id = ?').run(b.debitor_konto || null, ib, String(b.sepa_bic || '').trim().toUpperCase() || null, String(b.mandatsreferenz || '').trim() || null, b.mandat_datum || null, art, k.id);
    return json(res, 200, { ok: true });
  }
  // --- Controlling-Reports (Katalog wie in der Sicherheitsplanung)
  if (p === '/api/reports') return json(res, 200, REP.katalog());
  if (p === '/api/report' || p === '/api/report.csv') {
    const par = {}; q.forEach(function (v, k) { if (k !== 'id') par[k] = v; });
    let e; try { e = REP.ausfuehren(db, q.get('id'), par); } catch (x) { throw new Fehler(400, x.message); }
    if (p === '/api/report') return json(res, 200, e);
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + e.titel.replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + '_' + heute() + '.csv"', 'Cache-Control': 'no-store' }); return res.end(REP.csv(e));
  }
  if (p === '/api/bericht/geschaeftsfuehrung') {
    const m = q.get('monat') || heute().slice(0, 7); if (!/^\d{4}-\d{2}$/.test(m)) throw new Fehler(400, 'Monat im Format JJJJ-MM');
    const buf = await BRIEF.geschaeftsbericht(db, m);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Bericht_Geschaeftsfuehrung_' + m + '.pdf"', 'Cache-Control': 'no-store' }); return res.end(buf);
  }
  // --- Stammdaten: Kunden, Konten, Tarife, Einstellungen
  if (p === '/api/kunden' && req.method === 'GET') return json(res, 200, db.prepare('SELECT k.*, (SELECT COUNT(*) FROM objekt o WHERE o.kunde_id = k.id) objekte, (SELECT COUNT(*) FROM benutzer b WHERE b.kunde_id = k.id) zugaenge FROM kunde k ORDER BY k.name').all());
  if (p === '/api/kunde' && req.method === 'POST') {
    const b = await leib(req); if (!String(b.name || '').trim()) throw new Fehler(400, 'Name fehlt');
    const format = ['zugferd', 'xrechnung', 'pdf'].indexOf(b.rechnungsformat) >= 0 ? b.rechnungsformat : 'zugferd';
    if (format === 'xrechnung' && !b.leitweg_id) throw new Fehler(400, 'Für XRechnung (öffentliche Auftraggeber) bitte die Leitweg-ID eintragen.');
    const f = [b.name, b.ansprechpartner || null, b.email || null, b.telefon || null, b.anschrift || null, b.plz || null, b.ort || null, b.kundennummer || null, b.leitweg_id || null, b.ust_id || null,
      b.sammelrechnung === true || b.sammelrechnung === '1' ? 1 : 0, format, zahl(b.zahlungsziel_tage), b.rechnung_email || null,
      b.steuerfall === 'reverse_charge' ? 'reverse_charge' : 'normal', b.privat === true || b.privat === '1' ? 1 : 0];
    if (f[14] === 'reverse_charge' && f[15]) throw new Fehler(400, '§ 13b gilt nur zwischen Unternehmen — ein Privatkunde kann nicht Steuerschuldner sein.');
    if (b.id) { db.prepare('UPDATE kunde SET name=?, ansprechpartner=?, email=?, telefon=?, anschrift=?, plz=?, ort=?, kundennummer=?, leitweg_id=?, ust_id=?, sammelrechnung=?, rechnungsformat=?, zahlungsziel_tage=?, rechnung_email=?, steuerfall=?, privat=? WHERE id=?').run(...f, Number(b.id)); return json(res, 200, { ok: true, id: Number(b.id) }); }
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO kunde (name, ansprechpartner, email, telefon, anschrift, plz, ort, kundennummer, leitweg_id, ust_id, sammelrechnung, rechnungsformat, zahlungsziel_tage, rechnung_email, steuerfall, privat) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...f).lastInsertRowid) });
  }
  if (p === '/api/konten' && req.method === 'GET') return json(res, 200, db.prepare('SELECT b.id, b.name, b.email, b.rolle, b.aktiv, k.name kunde FROM benutzer b LEFT JOIN kunde k ON k.id = b.kunde_id ORDER BY b.rolle, b.name').all());
  if (p === '/api/konto' && req.method === 'POST') {
    const b = await leib(req);
    if (b.id && b.sperren != null) { if (Number(b.id) === ich.benutzer.id) throw new Fehler(400, 'Das eigene Konto lässt sich nicht sperren.'); db.prepare('UPDATE benutzer SET aktiv = ? WHERE id = ?').run(b.sperren ? 0 : 1, Number(b.id)); if (b.sperren) db.prepare('DELETE FROM sitzung WHERE benutzer_id = ?').run(Number(b.id)); return json(res, 200, { ok: true }); }
    if (b.id && b.passwort) { if (String(b.passwort).length < 10) throw new Fehler(400, 'Das Passwort braucht mindestens 10 Zeichen'); db.prepare('UPDATE benutzer SET pw = ? WHERE id = ?').run(Z.hash(b.passwort), Number(b.id)); return json(res, 200, { ok: true }); }
    try { return json(res, 200, { ok: true, id: Z.kontoAnlegen(db, b) }); } catch (e) { throw new Fehler(400, /UNIQUE/.test(e.message) ? 'Diese E-Mail hat schon einen Zugang.' : e.message); }
  }
  if (p === '/api/tarife' && req.method === 'GET') return json(res, 200, db.prepare('SELECT * FROM tarif ORDER BY lohngruppe, gueltig_ab DESC').all());
  if (p === '/api/tarif' && req.method === 'POST') {
    const b = await leib(req); if (!b.lohngruppe || !zahl(b.stundenlohn) || !/^\d{4}-\d{2}-\d{2}$/.test(b.gueltig_ab || '')) throw new Fehler(400, 'Lohngruppe, Stundenlohn und „gültig ab" nötig');
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO tarif (lohngruppe, bezeichnung, stundenlohn, gueltig_ab, gueltig_bis, quelle) VALUES (?,?,?,?,?,?)').run(b.lohngruppe, b.bezeichnung || null, zahl(b.stundenlohn), b.gueltig_ab, b.gueltig_bis || null, b.quelle || null).lastInsertRowid) });
  }
  if (p === '/api/einstellungen' && req.method === 'GET') return json(res, 200, DB.einstellungen(db));
  if (p === '/api/einstellungen' && req.method === 'POST') { const b = await leib(req); Object.keys(b).forEach(function (k) { if (/^[a-z_]+$/.test(k)) db.prepare('INSERT INTO einstellung (schluessel, wert) VALUES (?,?) ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert').run(k, String(b[k])); }); return json(res, 200, { ok: true }); }
  if (p === '/api/turnus') { const r = T.lesen(q.get('k') || '', Number(q.get('tag') || 1)); return json(res, 200, r || { art: 'leer' }); }
  throw new Fehler(404, 'unbekannter Pfad');
}

// ---------------------------------------------------------------- Fotos (nur, wer das Objekt sehen darf)
function fotoErlaubt(ich, datei) {
  if (!ich) return false; if (ich.rolle === 'buero') return true;
  const c = datei.match(/^c(\d+)-/);   // Chatbild: wer den Kanal sehen darf, sieht das Bild
  if (c) { if (ich.rolle !== 'mitarbeiter') return false; const k = db.prepare('SELECT * FROM kanal WHERE id = ?').get(Number(c[1])); return !!k && (k.art === 'direkt' ? k.schluessel.split(':').indexOf('m' + ich.mitarbeiter.id) > 0 : !!k.app); }
  const m = datei.match(/^[fmk](\d+)-/); if (!m) return false;
  let oid = null;
  if (datei[0] === 'f') { const p = db.prepare('SELECT objekt_id FROM lv_position WHERE id = ?').get(Number(m[1])); oid = p && p.objekt_id; } else oid = Number(m[1]);
  if (!oid) return false;
  if (ich.rolle === 'kunde') return !!db.prepare('SELECT 1 FROM objekt WHERE id = ? AND kunde_id = ?').get(oid, ich.kunde_id);
  return !!db.prepare('SELECT 1 FROM einsatz WHERE objekt_id = ? AND mitarbeiter_id = ?').get(oid, ich.mitarbeiter.id);
}

const SEITEN = { '/': 'index.html', '/app': 'app.html', '/kunde': 'kunde.html', '/gestaltung': 'gestaltung.html', '/anmelden': 'anmelden.html', '/einrichten': 'einrichten.html', '/drucken/report': 'drucken-report.html', '/drucken/qr': 'drucken-qr.html', '/drucken/angebot': 'drucken-angebot.html', '/drucken/pruefung': 'drucken-pruefung.html', '/sw.js': 'sw.js', '/manifest.webmanifest': 'manifest.webmanifest' };

const server = http.createServer(async function (req, res) {
  const u = new URL(req.url, 'http://x'); const p = u.pathname, q = u.searchParams;
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY');
  try {
    if (p.startsWith('/api/')) {
      const o = await oeffentlich(req, res, p, q); if (o !== undefined || res.writableEnded) return;
      const ich = Z.wer(db, req);
      if (p === '/api/ich') return json(res, ich ? 200 : 401, ich ? { rolle: ich.rolle, name: ich.name } : { fehler: 'nicht angemeldet' });
      if (!ich) throw new Fehler(401, 'Bitte anmelden.');
      if (p.startsWith('/api/komm/') || p.startsWith('/api/planner/')) { if (ich.rolle === 'kunde') throw new Fehler(403, 'Kein Zugriff.'); return await kommApi(req, res, p, q, ich); }
      if (p.startsWith('/api/app/')) { if (ich.rolle !== 'mitarbeiter') throw new Fehler(403, 'Nur in der Mitarbeiter-App.'); return await appApi(req, res, p, q, ich); }
      if (p.startsWith('/api/kunde/')) { if (ich.rolle !== 'kunde') throw new Fehler(403, 'Nur im Kundenportal.'); return await kundeApi(req, res, p, q, ich); }
      if (ich.rolle !== 'buero') throw new Fehler(403, 'Kein Zugriff.');
      return await bueroApi(req, res, p, q, ich);
    }
    if (p.startsWith('/fotos/')) { const name = path.basename(p); const f = path.join(FOTOS, name); if (fotoErlaubt(Z.wer(db, req), name) && fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': TYPEN[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' }); return fs.createReadStream(f).pipe(res); } res.writeHead(404); return res.end(); }
    if (p === '/js/jsQR.js') { res.writeHead(200, { 'Content-Type': TYPEN['.js'] }); return fs.createReadStream(path.join(__dirname, 'node_modules', 'jsqr', 'dist', 'jsQR.js')).pipe(res); }
    const datei = path.join(WEB, SEITEN[p] || path.normalize(p).replace(/^([\\/])+/, ''));
    if (!datei.startsWith(WEB) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(datei).pipe(res);
  } catch (e) {
    if (!(e instanceof Fehler)) console.error(e);
    if (!res.headersSent) json(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, { fehler: e.message }); else res.end();
  }
});
// Automatischer Abrechnungslauf: prüft alle 30 Minuten, ob der eingestellte Tag erreicht ist (einmal je Monat, Vormonat)
function automatik() { try { const l = AB.autoLauf(db); if (l) console.log('Abrechnungslauf ' + l.monat + ': ' + l.angelegt.length + ' angelegt, ' + l.gestellt.length + ' gestellt, ' + l.uebersprungen.length + ' übersprungen'); } catch (e) { console.error('Abrechnungslauf fehlgeschlagen:', e.message); } }
// Tägliche Sicherung der Datenbank nach daten/sicherung (VACUUM INTO = konsistente Kopie im laufenden Betrieb), 14 Tage
function sicherung() {
  try {
    const ordner = path.join(DB.ORDNER, 'sicherung'); fs.mkdirSync(ordner, { recursive: true });
    const ziel = path.join(ordner, 'staffclean-' + heute() + '.sqlite');
    if (!fs.existsSync(ziel)) { db.exec("VACUUM INTO '" + ziel.replace(/'/g, "''") + "'"); console.log('Sicherung geschrieben: ' + ziel); }
    fs.readdirSync(ordner).filter(function (f) { return /^staffclean-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f); }).sort().reverse().slice(14).forEach(function (f) { fs.unlinkSync(path.join(ordner, f)); });
    // Dateien (Fotos, Personaldokumente) laufend mitsichern: neue Dateien werden kopiert, nichts wird überschrieben —
    // eine versehentlich gelöschte Personalakte-Datei bleibt in der Sicherung erhalten
    [['fotos', FOTOS], ['personal', PERSONAL], ['register', REGDATEIEN]].forEach(function (x) {
      const ziel = path.join(ordner, 'dateien', x[0]); fs.mkdirSync(ziel, { recursive: true });
      fs.readdirSync(x[1]).forEach(function (f) { const z = path.join(ziel, f); if (!fs.existsSync(z)) fs.copyFileSync(path.join(x[1], f), z); });
    });
  } catch (e) { console.error('Sicherung fehlgeschlagen:', e.message); }
}
if (require.main === module) {
  server.listen(PORT, HOST, function () { console.log('Glanzwerk läuft: http://' + HOST + ':' + PORT + '  ·  App /app  ·  Kunde /kunde' + (HINTER_PROXY ? '  ·  hinter Webserver' : '')); einrichtungscodePruefen(); });
  automatik(); setInterval(automatik, 30 * 60000).unref();
  sicherung(); setInterval(sicherung, 60 * 60000).unref();   // stündlich nachsehen, einmal je Tag schreiben
}
module.exports = { server, db };
