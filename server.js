// server.js — StaffClean-Software v0.1: Büro-Oberfläche, Mitarbeiter-App, Schnittstelle.
// Start: node server.js   →   http://127.0.0.1:8790  (Büro)   ·   /app  (Mitarbeiter-App)   ·   /gestaltung
// ⚠️ v0.1 hat noch KEINE Anmeldung und hört deshalb nur auf 127.0.0.1. Vor jedem Betrieb im Netz
//    kommen Zugänge (Büro, Mitarbeiter-PIN, Kunde) — siehe README „Nächste Schritte".
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const DB = require('./lib/db');
const PLAN = require('./lib/plan');
const T = require('./lib/turnus');
const LV = require('./lib/lv-import');
const DEMO = require('./lib/demo');

const PORT = Number(process.env.STAFFCLEAN_PORT || 8790);
const HOST = process.env.STAFFCLEAN_HOST || '127.0.0.1';
const WEB = path.join(__dirname, 'web');
const FOTOS = path.join(DB.ORDNER, 'fotos');
fs.mkdirSync(FOTOS, { recursive: true });

const db = DB.oeffnen();
if (process.env.STAFFCLEAN_DEMO !== '0' && DEMO.anlegen(db)) console.log('Beispieldaten angelegt.');

const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const TYPEN = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function json(res, code, daten) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(daten)); }
function roh(req, grenze) { return new Promise(function (ok, nein) { const teile = []; let n = 0; req.on('data', function (c) { n += c.length; if (n > grenze) { nein(new Error('zu groß')); req.destroy(); } else teile.push(c); }); req.on('end', function () { ok(Buffer.concat(teile)); }); req.on('error', nein); }); }
async function leib(req) { const b = await roh(req, 15e6); try { return JSON.parse(b.toString('utf8') || '{}'); } catch (e) { return {}; } }

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
  return o;
}

async function api(req, res, u) {
  const p = u.pathname, q = u.searchParams;
  if (p === '/api/uebersicht') {
    const d = q.get('datum') || heute(), t = PLAN.tag(db, d);
    const offen = db.prepare("SELECT COUNT(*) n FROM mangel WHERE status = 'offen'").get().n;
    return json(res, 200, { datum: d, wochentag: t.wochentag, soll: t.soll, fertig: t.fertig, objekte: t.objekte.map(function (o) { return { id: o.id, name: o.name, kunde: o.kunde, ort: o.ort, soll: o.soll, fertig: o.fertig, sollMinuten: o.sollMinuten, raeume: o.raeume.length }; }),
      zahlen: { objekte: db.prepare("SELECT COUNT(*) n FROM objekt WHERE status='aktiv'").get().n, raeume: db.prepare('SELECT COUNT(*) n FROM raum').get().n, mitarbeiter: db.prepare('SELECT COUNT(*) n FROM mitarbeiter WHERE aktiv=1').get().n, maengel: offen } });
  }
  if (p === '/api/objekte') return json(res, 200, db.prepare(`SELECT o.id, o.name, o.strasse, o.ort, o.status, k.name kunde,
      (SELECT COUNT(*) FROM raum r WHERE r.objekt_id = o.id) raeume, (SELECT COUNT(*) FROM lv_position l WHERE l.objekt_id = o.id) positionen
      FROM objekt o LEFT JOIN kunde k ON k.id = o.kunde_id ORDER BY o.name`).all());
  if (p === '/api/objekt' && req.method === 'GET') { const o = objektVoll(q.get('id')); return o ? json(res, 200, o) : json(res, 404, { fehler: 'Objekt nicht gefunden' }); }
  if (p === '/api/objekt' && req.method === 'POST') {
    const b = await leib(req);
    if (!String(b.name || '').trim()) return json(res, 400, { fehler: 'Name fehlt' });
    const f = [b.name, b.strasse || null, b.plz || null, b.ort || null, b.bundesland || 'SH', Number.isInteger(b.reinigungstag) ? b.reinigungstag : 1, b.zugang || null, b.notiz || null];
    if (b.id) { db.prepare('UPDATE objekt SET name=?, strasse=?, plz=?, ort=?, bundesland=?, reinigungstag=?, zugang=?, notiz=? WHERE id=?').run(...f, Number(b.id)); return json(res, 200, { ok: true, id: Number(b.id) }); }
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO objekt (name, strasse, plz, ort, bundesland, reinigungstag, zugang, notiz) VALUES (?,?,?,?,?,?,?,?)').run(...f).lastInsertRowid) });
  }
  if (p === '/api/raum' && req.method === 'POST') {
    const b = await leib(req);
    if (!b.objekt_id || !String(b.name || '').trim()) return json(res, 400, { fehler: 'Objekt und Name nötig' });
    if (b.id) { db.prepare('UPDATE raum SET name=?, etage=?, belag=?, flaeche_m2=? WHERE id=?').run(b.name, b.etage || null, b.belag || null, b.flaeche_m2 || null, Number(b.id)); return json(res, 200, { ok: true }); }
    const n = db.prepare('SELECT COALESCE(MAX(reihenfolge),0)+1 n FROM raum WHERE objekt_id = ?').get(Number(b.objekt_id)).n;
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO raum (objekt_id, name, etage, belag, flaeche_m2, reihenfolge, code) VALUES (?,?,?,?,?,?,?)').run(Number(b.objekt_id), b.name, b.etage || null, b.belag || null, b.flaeche_m2 || null, n, 'R' + b.objekt_id + '-' + n + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()).lastInsertRowid) });
  }
  if (p === '/api/taetigkeiten') return json(res, 200, db.prepare('SELECT * FROM taetigkeit ORDER BY kategorie, name').all());
  if (p === '/api/taetigkeit' && req.method === 'POST') {
    const b = await leib(req); const name = String(b.name || '').trim(); if (!name) return json(res, 400, { fehler: 'Name fehlt' });
    const da = db.prepare('SELECT id FROM taetigkeit WHERE name = ?').get(name); if (da) return json(res, 200, { ok: true, id: da.id });
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO taetigkeit (name, anleitung, minuten, kategorie) VALUES (?,?,?,?)').run(name, b.anleitung || null, b.minuten || null, b.kategorie || null).lastInsertRowid) });
  }
  if (p === '/api/position' && req.method === 'POST') {   // Turnus einer Zelle Raum × Tätigkeit setzen; leer = entfernen
    const b = await leib(req); const r = db.prepare('SELECT objekt_id FROM raum WHERE id = ?').get(Number(b.raum_id));
    if (!r || !b.taetigkeit_id) return json(res, 400, { fehler: 'Raum und Tätigkeit nötig' });
    const turnus = String(b.turnus || '').trim();
    if (!turnus) { db.prepare('DELETE FROM lv_position WHERE raum_id = ? AND taetigkeit_id = ?').run(Number(b.raum_id), Number(b.taetigkeit_id)); return json(res, 200, { ok: true, entfernt: true }); }
    const regel = T.lesen(turnus); if (regel.art === 'unbekannt') return json(res, 400, { fehler: regel.text });
    db.prepare('INSERT INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus) VALUES (?,?,?,?) ON CONFLICT(raum_id, taetigkeit_id) DO UPDATE SET turnus = excluded.turnus').run(r.objekt_id, Number(b.raum_id), Number(b.taetigkeit_id), turnus);
    return json(res, 200, { ok: true, regel: regel.text });
  }
  if (p === '/api/turnus') { const r = T.lesen(q.get('k') || '', Number(q.get('tag') || 1)); return json(res, 200, r || { art: 'leer' }); }
  if (p === '/api/import' && req.method === 'POST') {    // Rumpf = Excel-Datei; ?uebernehmen=1 legt das Objekt an
    const b = await roh(req, 20e6); if (!b.length) return json(res, 400, { fehler: 'Keine Datei' });
    const tmp = path.join(DB.ORDNER, 'import-' + Date.now() + '.xlsx'); fs.writeFileSync(tmp, b);
    try {
      const lv = await LV.lesen(tmp);
      if (q.get('uebernehmen') === '1') return json(res, 200, { ok: true, id: LV.uebernehmen(db, lv, { name: q.get('name') || undefined }), lv: lv });
      return json(res, 200, { ok: true, vorschau: true, lv: lv, regeln: lv.raeume.flatMap(function (r) { return r.leistungen.map(function (l) { return l.turnus; }); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (k) { return { kuerzel: k, text: T.lesen(k).text }; }) });
    } catch (e) { return json(res, 400, { fehler: e.message }); } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
  if (p === '/api/tag') return json(res, 200, PLAN.tag(db, q.get('datum') || heute(), { objekt: q.get('objekt'), mitarbeiter: q.get('mitarbeiter') }));
  if (p === '/api/woche') { const w = PLAN.woche(db, q.get('objekt'), q.get('montag')); return w ? json(res, 200, w) : json(res, 404, { fehler: 'Objekt nicht gefunden' }); }
  if (p === '/api/mitarbeiter' && req.method === 'GET') return json(res, 200, db.prepare('SELECT id, name, sprache, rolle, minijob, lohngruppe, aktiv FROM mitarbeiter ORDER BY name').all());
  if (p === '/api/mitarbeiter' && req.method === 'POST') {
    const b = await leib(req); if (!String(b.name || '').trim()) return json(res, 400, { fehler: 'Name fehlt' });
    if (b.id) { db.prepare('UPDATE mitarbeiter SET name=?, telefon=?, sprache=?, minijob=?, lohngruppe=? WHERE id=?').run(b.name, b.telefon || null, b.sprache || 'de', b.minijob ? 1 : 0, b.lohngruppe || null, Number(b.id)); return json(res, 200, { ok: true }); }
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO mitarbeiter (name, telefon, sprache, minijob, lohngruppe) VALUES (?,?,?,?,?)').run(b.name, b.telefon || null, b.sprache || 'de', b.minijob ? 1 : 0, b.lohngruppe || null).lastInsertRowid) });
  }
  if (p === '/api/einsatz' && req.method === 'POST') {
    const b = await leib(req);
    if (b.entfernen) db.prepare('DELETE FROM einsatz WHERE objekt_id = ? AND mitarbeiter_id = ?').run(Number(b.objekt_id), Number(b.mitarbeiter_id));
    else db.prepare('INSERT OR IGNORE INTO einsatz (objekt_id, mitarbeiter_id) VALUES (?,?)').run(Number(b.objekt_id), Number(b.mitarbeiter_id));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/erledigt' && req.method === 'POST') {
    const b = await leib(req); const pos = Number(b.position), datum = String(b.datum || heute()).slice(0, 10);
    if (!db.prepare('SELECT id FROM lv_position WHERE id = ?').get(pos)) return json(res, 404, { fehler: 'Aufgabe nicht gefunden' });
    if (b.zurueck) { db.prepare('DELETE FROM erledigung WHERE position_id = ? AND datum = ?').run(pos, datum); return json(res, 200, { ok: true }); }
    let foto = null;
    const m = String(b.foto || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
    if (m) { foto = 'f' + pos + '-' + datum + '-' + Date.now() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); fs.writeFileSync(path.join(FOTOS, foto), Buffer.from(m[2], 'base64')); }
    db.prepare('INSERT INTO erledigung (position_id, datum, mitarbeiter_id, foto, notiz, lat, lon) VALUES (?,?,?,?,?,?,?) ON CONFLICT(position_id, datum) DO UPDATE SET zeit = datetime(\'now\',\'localtime\'), foto = COALESCE(excluded.foto, foto)')
      .run(pos, datum, b.mitarbeiter ? Number(b.mitarbeiter) : null, foto, b.notiz || null, b.lat || null, b.lon || null);
    return json(res, 200, { ok: true, foto: foto });
  }
  if (p === '/api/mangel' && req.method === 'POST') {
    const b = await leib(req); if (!b.objekt_id || !String(b.text || '').trim()) return json(res, 400, { fehler: 'Objekt und Beschreibung nötig' });
    if (b.id && b.erledigt) { db.prepare("UPDATE mangel SET status='erledigt', erledigt_am=datetime('now','localtime') WHERE id=?").run(Number(b.id)); return json(res, 200, { ok: true }); }
    const frist = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return json(res, 200, { ok: true, id: Number(db.prepare('INSERT INTO mangel (objekt_id, raum_id, text, quelle, gemeldet_von, frist) VALUES (?,?,?,?,?,?)').run(Number(b.objekt_id), b.raum_id || null, String(b.text).trim(), b.quelle || 'mitarbeiter', b.von || null, frist).lastInsertRowid) });
  }
  if (p === '/api/maengel') return json(res, 200, db.prepare(`SELECT m.*, o.name objekt, r.name raum FROM mangel m JOIN objekt o ON o.id = m.objekt_id LEFT JOIN raum r ON r.id = m.raum_id WHERE m.status = ? ORDER BY m.id DESC`).all(q.get('status') || 'offen'));
  return json(res, 404, { fehler: 'unbekannter Pfad' });
}

const server = http.createServer(async function (req, res) {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    if (u.pathname.startsWith('/fotos/')) { const f = path.join(FOTOS, path.basename(u.pathname)); if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': TYPEN[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(res); } }
    const seiten = { '/': 'index.html', '/app': 'app.html', '/gestaltung': 'gestaltung.html' };
    const datei = path.join(WEB, seiten[u.pathname] || path.normalize(u.pathname).replace(/^([\\/])+/, ''));
    if (!datei.startsWith(WEB) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(datei).pipe(res);
  } catch (e) { console.error(e); json(res, 500, { fehler: e.message }); }
});
server.listen(PORT, HOST, function () { console.log('StaffClean läuft: http://' + HOST + ':' + PORT + '  ·  App: /app  ·  Gestaltung: /gestaltung'); });
