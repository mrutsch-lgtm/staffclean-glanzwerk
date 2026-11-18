'use strict';
// Ausbaustufe 1 aus dem CleaningOS-Abgleich (18.11.2026): jeder neue Ablauf mit echten Anfragen gegen einen frischen Server.
// Mail und Push laufen im Testbetrieb (nichts verlässt den Rechner), geprüft wird, was rausgegangen wäre.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.STAFFCLEAN_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-a1-'));
process.env.STAFFCLEAN_MAIL_TEST = '1';
process.env.STAFFCLEAN_PUSH_TEST = '1';
const { server, db } = require('../server');
const MAIL = require('../lib/mail'), PUSH = require('../lib/push'), KRANK = require('../lib/krank');
let BASIS;
const keks = {};
async function rufen(wer, pfad, daten) {
  const opt = { headers: {} };
  if (keks[wer]) opt.headers.Cookie = keks[wer];
  if (daten !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(daten); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(BASIS + pfad, opt);
  const sc = r.headers.get('set-cookie'); if (sc) { const m = sc.match(/(gw|gwp)=[^;]+/); if (m) keks[wer] = (keks[wer] && !keks[wer].startsWith(m[1] + '=') ? keks[wer] + '; ' : '') + m[0]; }
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, typ: typ, j: /json/.test(typ) ? await r.json() : null, buf: /json/.test(typ) ? null : Buffer.from(await r.arrayBuffer()) };
}
const heute = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');

let objektId, anna, piotr, kundeId;
test.before(async function () {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); BASIS = 'http://127.0.0.1:' + server.address().port;
  await rufen('buero', '/api/einrichten', { name: 'Büro Test', email: 'buero@example.org', passwort: 'geheim-und-lang-2026' });
  objektId = (await rufen('buero', '/api/objekte')).j[0].id;
  const ma = (await rufen('buero', '/api/mitarbeiter')).j; anna = ma.find(m => /Anna/.test(m.name)); piotr = ma.find(m => /Piotr/.test(m.name));
  kundeId = (await rufen('buero', '/api/kunden')).j[0].id;
  await rufen('buero', '/api/kunde', { id: kundeId, name: 'Musterfirma Nord GmbH', email: 'kunde@example.org', anschrift: 'Musterweg 1', plz: '24534', ort: 'Neumünster' });
});
test.after(function () { server.close(); });

test('Objektportal: aus = kein Zugang, ein = Kacheln, Meldung mit Foto wird Ticket, nur eigenes Gerät sieht seine Meldungen', async function () {
  let s = (await rufen('buero', '/api/objekt/portal?id=' + objektId)).j; assert.strictEqual(s.aktiv, false); assert.strictEqual(s.link, null);
  s = (await rufen('buero', '/api/objekt/portal', { id: objektId, aktiv: true })).j; assert.ok(s.aktiv && /\/o\/[A-Za-z0-9_-]{20,}$/.test(s.link));
  const token = s.link.split('/o/')[1];
  const seite = await fetch(BASIS + '/o/' + token); assert.strictEqual(seite.status, 200); assert.match(await seite.text(), /<html/i);
  const kopf = (await rufen('gast', '/api/o/' + token)).j; assert.ok(kopf.kacheln.some(k => k.id === 'melden')); assert.ok(!kopf.kacheln.some(k => k.id === 'dokumente'));   // Dokumente standardmäßig aus
  assert.ok(!JSON.stringify(kopf).match(/preis|monatspreis|stundenlohn/i), 'keine Preise im Portal');
  assert.ok((await rufen('gast', '/api/o/' + token + '/lv')).j.length >= 1);
  assert.ok(Array.isArray((await rufen('gast', '/api/o/' + token + '/nachweis')).j.tage));
  assert.strictEqual((await rufen('gast', '/api/o/' + token + '/dokumente')).status, 403);
  assert.strictEqual((await rufen('gast', '/api/o/' + token + '/melden', { text: '' })).status, 400);
  const m = await rufen('gast', '/api/o/' + token + '/melden', { text: 'Papierhandtücher im WC EG leer', bereich: 'Sanitär', prioritaet: 'hoch', fotos: [PNG, PNG], name: 'Frau Hausverwaltung' });
  assert.strictEqual(m.status, 200); assert.ok(/gwp=/.test(keks.gast));
  const meine = (await rufen('gast', '/api/o/' + token + '/meldungen')).j; assert.strictEqual(meine.length, 1); assert.strictEqual(meine[0].fotos.length, 2); assert.strictEqual(meine[0].stand, 'neu');
  assert.strictEqual((await rufen('gast', '/api/o/' + token + '/foto?name=' + meine[0].fotos[0])).status, 200);
  assert.strictEqual((await rufen('fremdgeraet', '/api/o/' + token + '/meldungen')).j.length, 0);
  assert.strictEqual((await rufen('fremdgeraet', '/api/o/' + token + '/foto?name=' + meine[0].fotos[0])).status, 404);
  const liste = (await rufen('buero', '/api/maengel')).j; const t = liste.find(x => x.id === m.j.id);
  assert.strictEqual(t.quelle, 'portal'); assert.strictEqual(t.prioritaet, 'hoch'); assert.strictEqual(t.frist, heute);
  assert.strictEqual((await rufen('gast', '/api/o/' + token + '/nachricht', { id: m.j.id, text: 'Bitte auch 1. OG prüfen' })).status, 200);
  // Kacheln abschalten wirkt sofort, Erneuern macht den alten Link tot
  await rufen('buero', '/api/objekt/portal', { id: objektId, kacheln: { lv: false } });
  assert.strictEqual((await rufen('gast', '/api/o/' + token + '/lv')).status, 403);
  const neu = (await rufen('buero', '/api/objekt/portal', { id: objektId, erneuern: true })).j.link.split('/o/')[1];
  assert.notStrictEqual(neu, token); assert.strictEqual((await rufen('gast', '/api/o/' + token)).status, 404); assert.strictEqual((await rufen('gast', '/api/o/' + neu)).status, 200);
  assert.ok((await rufen('buero', '/api/objekt/portal-qr?id=' + objektId)).buf.toString().includes('<svg'));
  await rufen('buero', '/api/objekt/portal', { id: objektId, aktiv: false }); assert.strictEqual((await rufen('gast', '/api/o/' + neu)).status, 404);
});

test('Ticket: Zuweisung nur ans Objektteam (mit Push), App erledigt nur mit Foto, Verlauf, Entscheidung, Nachkontrolle', async function () {
  await rufen('app', '/api/app/anmelden', { mitarbeiter_id: anna.id, pin: '1111' });
  const k = (await rufen('app', '/api/app/push-schluessel')).j; assert.ok(k.schluessel.length > 40); assert.strictEqual(k.aktiv, false);
  assert.strictEqual((await rufen('app', '/api/app/push', { abo: { endpoint: 'https://push.example.org/abc', keys: { p256dh: 'x'.repeat(40), auth: 'y'.repeat(16) } } })).j.aktiv, true);
  const id = (await rufen('buero', '/api/mangel', { objekt_id: objektId, text: 'Glastür Eingang streifig', prioritaet: 'normal' })).j.id;
  const voll = (await rufen('buero', '/api/mangel?id=' + id)).j; assert.ok(voll.kandidaten.some(x => x.id === anna.id));
  const fremd = Number(db.prepare("INSERT INTO mitarbeiter (name, aktiv) VALUES ('Fremd Kraft', 1)").run().lastInsertRowid);
  assert.strictEqual((await rufen('buero', '/api/mangel', { id: id, objekt_id: objektId, zuweisen: fremd })).status, 400);
  const vorher = PUSH.gesendet.length;
  assert.strictEqual((await rufen('buero', '/api/mangel', { id: id, objekt_id: objektId, zuweisen: anna.id })).status, 200);
  await new Promise(ok => setTimeout(ok, 50));
  assert.ok(PUSH.gesendet.slice(vorher).some(g => g.mitarbeiter_id === anna.id && /Ticket/.test(g.inhalt.titel)));
  assert.strictEqual((await rufen('buero', '/api/mangel', { id: id, objekt_id: objektId + 999, stand: 'in_arbeit' })).status, 403);   // falsches Objekt
  const tag = (await rufen('app', '/api/app/tag')).j; assert.ok(tag.tickets.some(t => t.id === id)); assert.strictEqual(tag.push, true);
  assert.strictEqual((await rufen('app', '/api/app/ticket', { id: id, stand: 'in_arbeit' })).status, 200);
  assert.strictEqual((await rufen('app', '/api/app/ticket', { id: id, stand: 'erledigt' })).status, 400);   // ohne Foto
  assert.strictEqual((await rufen('app', '/api/app/ticket', { id: id, stand: 'erledigt', foto: PNG, notiz: 'neu poliert' })).status, 200);
  let t = (await rufen('buero', '/api/mangel?id=' + id)).j; assert.strictEqual(t.status, 'erledigt'); assert.ok(t.erledigt_foto);
  assert.ok(t.verlauf.some(v => /Zugewiesen an/.test(v.text) && !v.oeffentlich), 'Name der Kraft nur intern');
  assert.ok(t.verlauf.some(v => /weitergegeben/.test(v.text) && v.oeffentlich));
  assert.strictEqual((await rufen('buero', '/api/mangel', { id: id, objekt_id: objektId, entscheidung: 'nachbesserung', verursacher: 'Team Frühschicht' })).status, 200);
  assert.strictEqual((await rufen('buero', '/api/mangel', { id: id, objekt_id: objektId, geprueft: true })).status, 200);
  t = (await rufen('buero', '/api/mangel?id=' + id)).j; assert.ok(t.geprueft_am); assert.strictEqual(t.entscheidung, 'nachbesserung');
  assert.ok((await rufen('buero', '/api/maengel/auswertung')).j.objekte.length >= 1);
});

test('Krankmeldung in der App: Abwesenheit, Vertretungen automatisch angefragt (Push), Kanal Objektleitung, Eskalation einmal', async function () {
  await rufen('app2', '/api/app/anmelden', { mitarbeiter_id: piotr.id, pin: '2222' });
  await rufen('app2', '/api/app/push', { abo: { endpoint: 'https://push.example.org/piotr', keys: { p256dh: 'p'.repeat(40), auth: 'q'.repeat(16) } } });
  // Anna ist im Stammteam des Objekts, Piotr nicht → Piotr ist Vorschlag
  db.prepare('DELETE FROM einsatz WHERE objekt_id = ? AND mitarbeiter_id = ?').run(objektId, piotr.id);
  assert.strictEqual((await rufen('app', '/api/app/krank', { von: '2020-01-01', bis: '2020-01-02' })).status, 400);
  const vorher = PUSH.gesendet.length;
  const r = (await rufen('app', '/api/app/krank', { von: heute, bis: heute })).j; assert.ok(r.ok);
  const b = r.betroffen.find(x => x.objekt_id === objektId); assert.ok(b, JSON.stringify(r)); assert.ok(b.angefragt.some(n => /Piotr/.test(n)));
  assert.ok(db.prepare("SELECT 1 FROM abwesenheit WHERE mitarbeiter_id = ? AND art = 'krank' AND von = ?").get(anna.id, heute));
  assert.ok(db.prepare("SELECT 1 FROM vertretung WHERE objekt_id = ? AND datum = ? AND mitarbeiter_id = ? AND status = 'angefragt'").get(objektId, heute, piotr.id));
  await new Promise(ok => setTimeout(ok, 50));
  assert.ok(PUSH.gesendet.slice(vorher).some(g => g.mitarbeiter_id === piotr.id && /Vertretung/.test(g.inhalt.titel)));
  assert.ok(db.prepare("SELECT 1 FROM nachricht n JOIN kanal k ON k.id = n.kanal_id WHERE k.schluessel = 'objektleitung' AND n.text LIKE '%krank gemeldet%'").get());
  // Zweite Meldung für denselben Tag: keine doppelte Abwesenheit
  await rufen('app', '/api/app/krank', { von: heute, bis: heute }); assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM abwesenheit WHERE mitarbeiter_id = ? AND art = 'krank'").get(anna.id).n, 1);
  // Eskalation: nachts nie, tagsüber genau einmal je Objekt und Alarm
  db.prepare("UPDATE objekt SET nachbesetzung_bis = '07:00' WHERE id = ?").run(objektId);
  const nacht = new Date(heute + 'T03:00:00'); assert.strictEqual(KRANK.eskalieren(db, nacht).length, 0);
  const tagsueber = new Date(heute + 'T09:00:00');
  const e1 = KRANK.eskalieren(db, tagsueber); assert.ok(e1.some(x => /Vertretung|niemand/.test(x.alarm)), JSON.stringify(e1));
  assert.strictEqual(KRANK.eskalieren(db, tagsueber).length, 0);
  // Piotr sagt zu → Lage ohne „Vertretung nötig"
  const ang = (await rufen('app2', '/api/app/tag')).j.angebote.find(a => a.datum === heute); await rufen('app2', '/api/app/vertretung', { id: ang.id, antwort: 'ja' });
  const lage = (await rufen('buero', '/api/einsatzplan')).j.lage.find(l => l.id === objektId); assert.ok(!/Vertretung nötig/.test(lage.alarm || ''));
  assert.strictEqual(lage.alarmzeit, '07:00');
});

test('Leistungsnachweis je Monat: Ansicht, PDF, Kunde lädt eigenen', async function () {
  const n = (await rufen('buero', '/api/nachweis?objekt=' + objektId + '&monat=' + heute.slice(0, 7))).j; assert.ok(n.tage.length >= 1 && n.summe.soll >= 1);
  const pdf = await rufen('buero', '/api/nachweis.pdf?objekt=' + objektId + '&monat=' + heute.slice(0, 7)); assert.strictEqual(pdf.typ, 'application/pdf'); assert.strictEqual(pdf.buf.slice(0, 5).toString(), '%PDF-');
  await rufen('buero', '/api/konto', { name: 'Frau Beispiel', email: 'kunde2@example.org', passwort: 'kunden-passwort-1', rolle: 'kunde', kunde_id: kundeId });
  await rufen('kunde', '/api/anmelden', { email: 'kunde2@example.org', passwort: 'kunden-passwort-1' });
  assert.strictEqual((await rufen('kunde', '/api/kunde/nachweis-pdf?objekt=' + objektId + '&monat=' + heute.slice(0, 7))).buf.slice(0, 5).toString(), '%PDF-');
  const fremd = (await rufen('buero', '/api/objekt', { name: 'Fremdobjekt' })).j.id;
  assert.strictEqual((await rufen('kunde', '/api/kunde/nachweis?objekt=' + fremd)).status, 403);
  // Reklamation des Kunden ist ein Ticket mit Verlauf, Kunde schreibt dazu
  const rk = (await rufen('kunde', '/api/kunde/reklamation', { objekt_id: objektId, text: 'Teeküche nicht gewischt', bereich: 'Küche' })).j;
  assert.strictEqual((await rufen('kunde', '/api/kunde/ticket', { id: rk.id, text: 'Bitte bis Freitag' })).status, 200);
  assert.ok((await rufen('kunde', '/api/kunde/ticket?id=' + rk.id)).j.verlauf.some(v => /Freitag/.test(v.text)));
});

test('Rechnung per Mail: nur gestellt, Anhänge vom Server (Rechnung + Nachweis + Anlage), nie zweimal ohne „erneut"', async function () {
  assert.strictEqual((await rufen('buero', '/api/mail/status')).j.bereit, true);
  await rufen('buero', '/api/einstellungen', { firma_strasse: 'Großflecken 48', firma_plz: '24534', firma_ort: 'Neumünster', steuernummer: '00/000/00000', firma_email: 'info@example.org', iban: 'DE02 1203 0000 0000 2020 51' });
  await rufen('buero', '/api/objekt/preis', { id: objektId, monatspreis: 900 });
  // Anlage „Aufmaß" automatisch mitsenden, eine zweite nicht
  assert.strictEqual((await rufen('buero', '/api/anlage', { objekt_id: objektId, titel: 'Aufmaß Treppenhaus', art: 'aufmass', datei: PDF })).status, 200);
  const a2 = (await rufen('buero', '/api/anlage', { objekt_id: objektId, titel: 'Vertrag', art: 'vertrag', datei: PDF, auto: false, im_portal: true })).j.id;
  assert.strictEqual((await rufen('buero', '/api/anlagen?objekt=' + objektId)).j.anlagen.length, 2);
  assert.strictEqual((await rufen('buero', '/api/anlage/datei?id=' + a2 + '&objekt=' + objektId)).buf.slice(0, 4).toString(), '%PDF');
  const e = (await rufen('buero', '/api/rechnung/entwurf', { objekt_id: objektId, monat: heute.slice(0, 7) })).j;
  assert.strictEqual((await rufen('buero', '/api/rechnung/mail-entwurf?id=' + e.id)).status, 409);   // Entwurf geht nicht raus
  await rufen('buero', '/api/rechnung/stellen', { id: e.id });
  const ent = (await rufen('buero', '/api/rechnung/mail-entwurf?id=' + e.id)).j;
  assert.strictEqual(ent.an, 'kunde@example.org'); assert.ok(ent.anhaenge.length === 3, JSON.stringify(ent.anhaenge)); assert.ok(ent.anhaenge.some(n => /Leistungsnachweis/.test(n)) && ent.anhaenge.some(n => /Aufma/.test(n)));
  assert.strictEqual((await rufen('buero', '/api/rechnung/mail', { id: e.id, an: 'kein-mail', betreff: ent.betreff, text: ent.text })).status, 400);
  const s = await rufen('buero', '/api/rechnung/mail', { id: e.id, an: ent.an, betreff: ent.betreff, text: ent.text }); assert.strictEqual(s.status, 200, JSON.stringify(s.j));
  const m = MAIL.letzte; assert.strictEqual(m.to, 'kunde@example.org'); assert.strictEqual(m.attachments.length, 3); assert.ok(m.attachments[0].content.slice(0, 5).toString() === '%PDF-');
  assert.ok(/Mit freundlichen Grüßen/.test(m.text) && !/Glanzwerk|KI|automatisch erstellt/i.test(m.text));
  assert.strictEqual((await rufen('buero', '/api/rechnung/mail', { id: e.id, an: ent.an, betreff: ent.betreff, text: ent.text })).status, 409);   // Sperre
  assert.strictEqual((await rufen('buero', '/api/rechnung/mail', { id: e.id, an: ent.an, betreff: ent.betreff, text: ent.text, erneut: true })).status, 200);
  assert.strictEqual((await rufen('buero', '/api/mail/protokoll?anlass=rechnung&bezug=' + e.id)).j.length, 2);
  // Nachweis allein mailen; Leistungsnachweis abschaltbar
  await rufen('buero', '/api/anlage', { objekt_id: objektId, nachweis_anhaengen: false });
  assert.ok(!(await rufen('buero', '/api/rechnung/mail-entwurf?id=' + e.id)).j.anhaenge.some(n => /Leistungsnachweis/.test(n)));
  const ne = (await rufen('buero', '/api/nachweis/mail-entwurf?objekt=' + objektId + '&monat=' + heute.slice(0, 7))).j;
  assert.strictEqual((await rufen('buero', '/api/nachweis/mail', Object.assign({ objekt_id: objektId, monat: heute.slice(0, 7) }, ne, { an: 'kunde@example.org' }))).status, 200);
});

test('Prüfbericht: Mail erst nach Freigabe, PDF, Kunde sieht ihn erst danach', async function () {
  const p = (await rufen('buero', '/api/pruefung', { objekt_id: objektId })).j;
  const pr = (await rufen('buero', '/api/pruefung?id=' + p.id)).j;
  for (const r of pr.raeume) await rufen('buero', '/api/pruefung/raum', { pruefung_id: p.id, raum_id: r.raum_id, kriterien: r.kriterien.map((k, i) => ({ element: k.element, ok: i !== 0 })) });
  await rufen('buero', '/api/pruefung/abschliessen', { id: p.id });
  assert.ok(!(await rufen('kunde', '/api/kunde/objekt?id=' + objektId)).j.pruefungen.some(x => x.id === p.id));
  assert.strictEqual((await rufen('buero', '/api/pruefung/mail-entwurf?id=' + p.id)).status, 409);
  assert.strictEqual((await rufen('buero', '/api/pruefung/pdf?id=' + p.id)).buf.slice(0, 5).toString(), '%PDF-');
  await rufen('buero', '/api/pruefung/freigeben', { id: p.id });
  assert.ok((await rufen('kunde', '/api/kunde/objekt?id=' + objektId)).j.pruefungen.some(x => x.id === p.id));
  assert.strictEqual((await rufen('kunde', '/api/kunde/pruefung-pdf?id=' + p.id)).buf.slice(0, 5).toString(), '%PDF-');
  const ent = (await rufen('buero', '/api/pruefung/mail-entwurf?id=' + p.id)).j;
  assert.strictEqual((await rufen('buero', '/api/pruefung/mail', { id: p.id, an: 'kunde@example.org', betreff: ent.betreff, text: ent.text })).status, 200);
  assert.ok((await rufen('buero', '/api/pruefungen')).j.find(x => x.id === p.id).versendet_am);
});

test('Angebot aus dem Vertrieb: signierte Anmeldung, Vorschau, Übernahme mit gesperrtem LV, kein zweites Mal, Nachtrag', async function () {
  const http = require('http'), crypto = require('crypto');
  const KEY = 'test-schluessel-'.repeat(4); process.env.SSO_SCHLUESSEL = KEY;
  let angenommen = false;
  const lv = { titel: 'LV', objekt: 'WP Weede Büro', spalten: [{ g: 'boden', t: 'Boden feucht wischen' }, { g: 'ausstattung', t: 'Papierkörbe leeren' }],
    bereiche: [{ name: 'Büro EG', belag: 'PVC', flaeche: '120', werte: ['1 W', '5 W'] }, { name: 'WC', belag: 'Fliese', flaeche: '12,5', werte: ['5 W', 'quatsch'] }] };
  const vertrieb = http.createServer(function (req, res) {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/sso') { const [inh, sig] = String(u.searchParams.get('t')).split('.'); const ok = sig === crypto.createHmac('sha256', KEY).update(inh).digest('base64url'); res.writeHead(ok ? 302 : 401, ok ? { 'Set-Cookie': 'sid=abc; Path=/; HttpOnly', Location: '/?sso=1' } : {}); return res.end(); }
    if (!/sid=abc/.test(req.headers.cookie || '')) { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (u.pathname === '/api/state') return res.end(JSON.stringify({ offers: [{ number: 'SC2026-00104', company: 'Zeppelin Rental GmbH', contact_name: 'Herr Test', email: 'test@example.org', status: 'sent', total_net: 145, items: '[]', extra_data: JSON.stringify({ lv: lv }) }] }));
    if (/\/annahme$/.test(u.pathname)) return res.end(JSON.stringify({ vorgaenge: angenommen ? [{ status: 'angenommen', accepted_at: '2026-11-10 10:00:00', signer_name: 'Herr Test' }] : [] }));
    res.end('{}');
  });
  await new Promise(ok => vertrieb.listen(0, '127.0.0.1', ok)); process.env.STAFFCLEAN_VERTRIEB_URL = 'http://127.0.0.1:' + vertrieb.address().port;
  try {
    assert.strictEqual((await rufen('buero', '/api/angebot/vorschau?nummer=quatsch')).status, 400);
    assert.strictEqual((await rufen('buero', '/api/angebot/vorschau?nummer=SC2026-99999')).status, 400);
    const v = (await rufen('buero', '/api/angebot/vorschau?nummer=SC2026-00104')).j;
    assert.strictEqual(v.raeume.length, 2); assert.strictEqual(v.leistungen, 4); assert.strictEqual(v.unverstanden.length, 1); assert.strictEqual(v.angenommen, null);
    assert.strictEqual((await rufen('buero', '/api/angebot/uebernehmen', { nummer: 'SC2026-00104' })).status, 409);   // nicht angenommen
    angenommen = true;
    const r = (await rufen('buero', '/api/angebot/uebernehmen', { nummer: 'SC2026-00104', monatspreis: true })).j;
    assert.strictEqual(r.raeume, 2); assert.strictEqual(r.positionen, 3); assert.strictEqual(r.kundeNeu, true);
    assert.strictEqual((await rufen('buero', '/api/angebot/uebernehmen', { nummer: 'SC2026-00104' })).status, 409);   // kein zweites Mal
    const o = (await rufen('buero', '/api/objekt?id=' + r.objekt_id)).j;
    assert.strictEqual(o.name, 'WP Weede Büro'); assert.strictEqual(o.angebot_nr, 'SC2026-00104'); assert.strictEqual(o.raeume.find(x => x.name === 'WC').flaeche_m2, 12.5);
    const pos = o.positionen.find(x => x.turnus === '5 W' && x.quelle === 'angebot'); assert.ok(pos);
    assert.strictEqual((await rufen('buero', '/api/position', { raum_id: pos.raum_id, taetigkeit_id: pos.taetigkeit_id, turnus: '3 W' })).status, 409);
    assert.strictEqual((await rufen('buero', '/api/position', { raum_id: pos.raum_id, taetigkeit_id: pos.taetigkeit_id, turnus: '3 W', nachtrag: true })).status, 200);
    assert.strictEqual((await rufen('buero', '/api/objekt?id=' + r.objekt_id)).j.positionen.find(x => x.raum_id === pos.raum_id && x.taetigkeit_id === pos.taetigkeit_id).quelle, 'nachtrag');
    assert.strictEqual((await rufen('buero', '/api/objekte')).j.find(x => x.id === r.objekt_id).monatspreis, 145);
  } finally { vertrieb.close(); }
});

test('Rechte: Objektleiter sieht Portal und Tickets nur für eigene Objekte, Mitarbeiter kommt nicht an Büro-Pfade', async function () {
  const zweit = (await rufen('buero', '/api/objekt', { name: 'Zweitobjekt' })).j.id;
  await rufen('buero', '/api/konto', { name: 'Leiterin', email: 'leiterin@example.org', passwort: 'leiterin-pass-2026', rolle: 'buero', berechtigung: 'objektleiter', objekte: [objektId] });
  await rufen('ol', '/api/anmelden', { email: 'leiterin@example.org', passwort: 'leiterin-pass-2026' });
  assert.strictEqual((await rufen('ol', '/api/objekt/portal?id=' + objektId)).status, 200);
  assert.strictEqual((await rufen('ol', '/api/objekt/portal?id=' + zweit)).status, 403);
  const t = (await rufen('buero', '/api/mangel', { objekt_id: zweit, text: 'fremder Mangel' })).j.id;
  assert.strictEqual((await rufen('ol', '/api/mangel', { id: t, objekt_id: zweit, stand: 'in_arbeit' })).status, 403);
  assert.strictEqual((await rufen('ol', '/api/mangel', { id: t, stand: 'in_arbeit' })).status, 400);
  assert.ok(!(await rufen('ol', '/api/maengel')).j.some(x => x.objekt_id === zweit));
  assert.strictEqual((await rufen('ol', '/api/rechnung/mail-entwurf?id=1')).status, 403);   // Abrechnung nicht für Objektleiter
  assert.strictEqual((await rufen('app', '/api/maengel')).status, 403);
  assert.strictEqual((await rufen('ol', '/api/angebot/vorschau?nummer=SC2026-00104')).status, 403);   // Objekte legt der Planer an
});
