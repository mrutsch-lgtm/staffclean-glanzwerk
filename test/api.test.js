'use strict';
// Schnittstellen-Abnahme: frische Datenbank, echter Server, jeder Ablauf mit echten Anfragen — auch die Rechte.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-'));
process.env.STAFFCLEAN_DATEN = ORDNER;
const { server } = require('../server');
let BASIS;
const keks = {};
async function rufen(wer, pfad, daten, roh) {
  const opt = { headers: {} };
  if (keks[wer]) opt.headers.Cookie = keks[wer];
  if (daten !== undefined) { opt.method = 'POST'; if (roh) opt.body = daten; else { opt.body = JSON.stringify(daten); opt.headers['Content-Type'] = 'application/json'; } }
  const r = await fetch(BASIS + pfad, opt);
  const sc = r.headers.get('set-cookie'); if (sc && /gw=/.test(sc)) keks[wer] = sc.split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, j: /json/.test(typ) ? await r.json() : null, text: /json/.test(typ) ? null : await r.text() };
}
const heute = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

test.before(async function () { await new Promise(ok => server.listen(0, '127.0.0.1', ok)); BASIS = 'http://127.0.0.1:' + server.address().port; });
test.after(function () { server.close(); });

test('ohne Anmeldung kein Zugriff, Einrichtung einmalig', async function () {
  assert.strictEqual((await rufen('x', '/api/objekte')).status, 401);
  assert.strictEqual((await rufen('x', '/api/einrichten')).j.noetig, true);
  assert.strictEqual((await rufen('buero', '/api/einrichten', { name: 'Manuel', email: 'buero@example.org', passwort: 'kurz' })).status, 500 - 100);   // 400: Passwort zu kurz
  assert.strictEqual((await rufen('buero', '/api/einrichten', { name: 'Manuel', email: 'buero@example.org', passwort: 'geheim-und-lang-2026' })).status, 200);
  assert.strictEqual((await rufen('y', '/api/einrichten', { name: 'X', email: 'x@example.org', passwort: 'noch-ein-passwort' })).status, 409);
  assert.strictEqual((await rufen('buero', '/api/ich')).j.rolle, 'buero');
});

test('Anmeldung: falsches Passwort abgelehnt, richtiges geht', async function () {
  assert.strictEqual((await rufen('b2', '/api/anmelden', { email: 'buero@example.org', passwort: 'falsch' })).status, 401);
  assert.strictEqual((await rufen('b2', '/api/anmelden', { email: 'BUERO@example.org', passwort: 'geheim-und-lang-2026' })).status, 200);
});

let objektId, raumId, posId, kundeId;
test('Büro: Objekte, Räume, Turnus, Tagesplan', async function () {
  const l = (await rufen('buero', '/api/objekte')).j; assert.ok(l.length >= 1); objektId = l[0].id;
  const o = (await rufen('buero', '/api/objekt?id=' + objektId)).j; raumId = o.raeume[0].id;
  assert.strictEqual((await rufen('buero', '/api/position', { raum_id: raumId, taetigkeit_id: o.taetigkeiten[0].id, turnus: 'quatsch' })).status, 400);
  assert.strictEqual((await rufen('buero', '/api/position', { raum_id: raumId, taetigkeit_id: o.taetigkeiten[0].id, turnus: 'täglich' })).j.regel, 'täglich');
  const t = (await rufen('buero', '/api/tag?datum=' + heute + '&objekt=' + objektId)).j; assert.ok(t.soll >= 1);
  posId = t.objekte[0].raeume.find(r => r.id === raumId).aufgaben[0].position;
  const k = (await rufen('buero', '/api/kalkulation?objekt=' + objektId)).j; assert.ok(k.ergebnis.monatspreis > 0 && k.ergebnis.stundenMonat > 0);
  assert.ok((await rufen('buero', '/api/qr?raum=' + raumId)).text.includes('<svg'));
});

test('Mitarbeiter-App: PIN, nur eigene Objekte, Stempeln nur vor Ort, Abhaken, QR', async function () {
  const personen = (await rufen('app', '/api/app/personen')).j; const anna = personen.find(p => /Anna/.test(p.name));
  assert.strictEqual((await rufen('app', '/api/app/anmelden', { mitarbeiter_id: anna.id, pin: '0000' })).status, 401);
  assert.strictEqual((await rufen('app', '/api/app/anmelden', { mitarbeiter_id: anna.id, pin: '1111' })).status, 200);
  assert.strictEqual((await rufen('app', '/api/objekte')).status, 403);          // Büro-Schnittstelle gesperrt
  const tag = (await rufen('app', '/api/app/tag')).j; assert.ok(tag.objekte.some(o => o.id === objektId));
  assert.strictEqual((await rufen('app', '/api/app/stempeln', { objekt_id: objektId, art: 'kommen', lat: 54.5, lon: 10.5 })).status, 409);   // zu weit weg
  assert.strictEqual((await rufen('app', '/api/app/stempeln', { objekt_id: objektId, art: 'kommen', lat: 54.0737, lon: 9.9848 })).status, 200);
  assert.strictEqual((await rufen('app', '/api/app/stempeln', { objekt_id: objektId, art: 'kommen', lat: 54.0737, lon: 9.9848 })).status, 409);   // schon drin
  assert.strictEqual((await rufen('app', '/api/app/erledigt', { position: posId, foto: 'data:image/png;base64,iVBORw0KGgo=' })).status, 200);
  const code = (await rufen('buero', '/api/objekt?id=' + objektId)).j.raeume[0].code;
  assert.strictEqual((await rufen('app', '/api/app/raum-code?code=' + encodeURIComponent(code))).j.raum_id, raumId);
  assert.strictEqual((await rufen('app', '/api/app/raum-code?code=GIBTSNICHT')).status, 404);
  assert.strictEqual((await rufen('app', '/api/app/mangel', { objekt_id: objektId, text: 'Seifenspender defekt' })).status, 200);
  assert.strictEqual((await rufen('app', '/api/app/stempeln', { objekt_id: objektId, art: 'gehen', lat: 54.0737, lon: 9.9848 })).status, 200);
  assert.ok((await rufen('app', '/api/app/schichten')).j.length >= 1);
});

test('Kundenportal: eigener Zugang, nur eigene Objekte, Reklamation, Abzeichnen', async function () {
  kundeId = (await rufen('buero', '/api/kunden')).j[0].id;
  assert.strictEqual((await rufen('buero', '/api/konto', { name: 'Frau Beispiel', email: 'kunde@example.org', passwort: 'kunden-passwort-1', rolle: 'kunde', kunde_id: kundeId })).status, 200);
  assert.strictEqual((await rufen('kunde', '/api/anmelden', { email: 'kunde@example.org', passwort: 'kunden-passwort-1' })).j.rolle, 'kunde');
  assert.strictEqual((await rufen('kunde', '/api/objekte')).status, 403);
  const u = (await rufen('kunde', '/api/kunde/uebersicht')).j; assert.ok(u.objekte.some(o => o.id === objektId));
  const fremd = (await rufen('buero', '/api/objekt', { name: 'Fremdobjekt' })).j.id;
  assert.strictEqual((await rufen('kunde', '/api/kunde/objekt?id=' + fremd)).status, 403);
  assert.strictEqual((await rufen('kunde', '/api/kunde/reklamation', { objekt_id: objektId, text: 'Papierkorb im Empfang voll' })).status, 200);
  assert.ok((await rufen('kunde', '/api/kunde/objekt?id=' + objektId)).j.tage.length >= 1);
});

test('Qualitätsprüfung: Stichprobe, Bewertung, Mängel automatisch, Kunde zeichnet ab', async function () {
  const p = (await rufen('buero', '/api/pruefung', { objekt_id: objektId })).j; assert.ok(p.stichprobe >= 1);
  const pr = (await rufen('buero', '/api/pruefung?id=' + p.id)).j;
  for (const r of pr.raeume) await rufen('buero', '/api/pruefung/raum', { pruefung_id: p.id, raum_id: r.raum_id, kriterien: r.kriterien.map((k, i) => ({ element: k.element, ok: i !== 0 })) });
  const a = (await rufen('buero', '/api/pruefung/abschliessen', { id: p.id })).j; assert.ok(a.ergebnis > 0 && a.ergebnis < 100 && a.maengel === pr.raeume.length);
  assert.strictEqual((await rufen('kunde', '/api/kunde/abzeichnen', { id: p.id })).status, 200);
  assert.ok((await rufen('buero', '/api/pruefung?id=' + p.id)).j.abgezeichnet_von);
});

test('Dienstplan: Schicht, Konflikt, Serie, Kopieren, Stunden, DATEV', async function () {
  const mo = (d => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); })(heute);
  const w = (await rufen('buero', '/api/dienstplan?montag=' + mo)).j; assert.ok(w.zeilen.length >= 2);
  const piotr = w.zeilen.find(z => /Piotr/.test(z.name));
  const r1 = (await rufen('buero', '/api/schicht', { mitarbeiter_id: piotr.id, objekt_id: objektId, datum: mo, beginn: '08:00', ende: '19:30', pause_min: 0 })).j;
  const w2 = (await rufen('buero', '/api/dienstplan?montag=' + mo)).j;
  const s = w2.zeilen.find(z => z.id === piotr.id).tage[0].find(x => x.id === r1.ids[0]);
  assert.ok(s.konflikte.some(k => /10 Std/.test(k)) && s.konflikte.some(k => /Pause/.test(k)));
  const serie = (await rufen('buero', '/api/schicht', { mitarbeiter_id: piotr.id, objekt_id: objektId, datum: mo, beginn: '20:00', ende: '22:00', wiederholen_bis: new Date(new Date(mo + 'T12:00:00Z').getTime() + 20 * 86400000).toISOString().slice(0, 10) })).j;
  assert.strictEqual(serie.ids.length, 3);
  assert.strictEqual((await rufen('buero', '/api/dienstplan/kopieren', { montag: mo })).status, 409);   // Woche nicht leer
  const st = (await rufen('buero', '/api/stunden?von=' + heute + '&bis=' + heute)).j; assert.ok(st.mitarbeiter.length >= 1);
  const pr = (await rufen('buero', '/api/datev?monat=' + heute.slice(0, 7) + '&pruefen=1')).j; assert.ok(Array.isArray(pr.fehlendePersonalnummer));
  const csv = (await rufen('buero', '/api/datev?monat=' + heute.slice(0, 7))).text; assert.ok(csv.includes('Personalnummer;Name;Lohnart;Stunden'));
});

test('Einsatzlage: Abwesenheit löst Alarm/Vorschläge aus, Vertretung angefragt und zugesagt', async function () {
  const ma = (await rufen('buero', '/api/mitarbeiter')).j; const anna = ma.find(m => /Anna/.test(m.name)), piotr = ma.find(m => /Piotr/.test(m.name));
  await rufen('buero', '/api/abwesenheit', { mitarbeiter_id: anna.id, von: heute, bis: heute, art: 'krank' });
  const lage = (await rufen('buero', '/api/einsatzplan')).j.lage.find(l => l.id === objektId); assert.ok(/abwesend/i.test(lage.alarm || ''));
  const v = (await rufen('buero', '/api/vorschlaege?objekt=' + objektId)).j; assert.ok(v.some(x => x.id === piotr.id));
  await rufen('buero', '/api/vertretung', { objekt_id: objektId, mitarbeiter_id: piotr.id, fuer_id: anna.id });
  await rufen('app2', '/api/app/anmelden', { mitarbeiter_id: piotr.id, pin: '2222' });
  const ang = (await rufen('app2', '/api/app/tag')).j.angebote; assert.strictEqual(ang.length, 1);
  assert.strictEqual((await rufen('app2', '/api/app/vertretung', { id: ang[0].id, antwort: 'ja' })).status, 200);
  const t = (await rufen('app2', '/api/app/tag')).j; assert.ok(t.objekte.some(o => o.id === objektId));
  // Piotr hat polnisch: übersetzte Tätigkeit taucht auf
  assert.ok(JSON.stringify(t).includes('Odkurzyć'));
});

test('Zeiten: Liste, CSV, Korrektur; Soll/Ist', async function () {
  const z = (await rufen('buero', '/api/zeiten?von=' + heute + '&bis=' + heute)).j; assert.ok(z.buchungen.length >= 1);
  assert.strictEqual((await rufen('buero', '/api/zeit/korrigieren', { id: z.buchungen[0].id, kommen: '06:00', gehen: '08:15', pause: 0 })).status, 200);
  const csv = (await rufen('buero', '/api/zeiten.csv?von=' + heute + '&bis=' + heute)).text; assert.ok(/2,25/.test(csv));
  const si = (await rufen('buero', '/api/soll-ist?von=' + heute + '&bis=' + heute)).j; assert.ok(si.objekte.find(o => o.id === objektId).istMinuten === 135);
});

test('Fotos nur für Berechtigte, Abmelden beendet die Sitzung', async function () {
  const t = (await rufen('buero', '/api/tag?datum=' + heute + '&objekt=' + objektId)).j;
  const foto = [].concat(...t.objekte[0].raeume.map(r => r.aufgaben)).find(a => a.erledigt && a.erledigt.foto).erledigt.foto;
  assert.strictEqual((await rufen('buero', '/fotos/' + foto)).status, 200);
  assert.strictEqual((await rufen('fremd', '/fotos/' + foto)).status, 404);
  await rufen('kunde', '/api/abmelden', {});
  assert.strictEqual((await rufen('kunde', '/api/kunde/uebersicht')).status, 401);
});
