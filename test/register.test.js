'use strict';
// Abnahme 29.09.2026: Register (Arbeitsschutz, Ausstattung, Fuhrpark, QM), Unterweisungen und Dienstanweisungen mit App-Bestätigung
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-reg-'));
process.env.STAFFCLEAN_DATEN = ORDNER;
process.env.STAFFCLEAN_DEMO = '0';
const { server, db } = require('../server');
let BASIS; const keks = {};
async function rufen(wer, pfad, daten) {
  const opt = { headers: {} }; if (keks[wer]) opt.headers.Cookie = keks[wer];
  if (daten !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(daten); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(BASIS + pfad, opt); const sc = r.headers.get('set-cookie'); if (sc && /gw=/.test(sc)) keks[wer] = sc.split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, typ: typ, j: /json/.test(typ) ? await r.json() : null, buf: /json/.test(typ) ? null : Buffer.from(await r.arrayBuffer()) };
}
const heute = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
let objekt, anna, bernd;
const PDF1 = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF').toString('base64');

test.before(async function () {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); BASIS = 'http://127.0.0.1:' + server.address().port;
  await rufen('b', '/api/einrichten', { name: 'Büro', email: 'b@example.org', passwort: 'geheim-und-lang-2026' });
  const kunde = (await rufen('b', '/api/kunde', { name: 'Praxis Nord' })).j.id;
  objekt = (await rufen('b', '/api/objekt', { name: 'Praxis EG', kunde_id: kunde })).j.id;
  anna = (await rufen('b', '/api/mitarbeiter', { name: 'Anna Test', pin: '1111' })).j.id;
  bernd = (await rufen('b', '/api/mitarbeiter', { name: 'Bernd Test', pin: '2222' })).j.id;
  await rufen('b', '/api/einsatz', { objekt_id: objekt, mitarbeiter_id: anna });
  await rufen('app', '/api/app/anmelden', { mitarbeiter_id: anna, pin: '1111' });
});
test.after(function () { server.close(); });

test('Katalog: 14 Register, Rechtskataster vorbelegt, Eintritts-Checkliste für neue Kräfte', async function () {
  const k = (await rufen('b', '/api/register')).j;
  assert.strictEqual(k.katalog.length, 14);
  assert.ok(k.katalog.find(r => r.id === 'rechtskataster').anzahl >= 10);
  const cl = (await rufen('b', '/api/register?id=checklisten')).j.liste;
  assert.strictEqual(cl.filter(c => c.art === 'eintritt').length, 2, 'je neuer Kraft eine Eintritts-Checkliste');
  assert.strictEqual(cl[0].fortschritt, 0);
  assert.strictEqual((await rufen('app', '/api/register')).status, 403, 'App darf keine Register lesen');
});

test('Gefahrstoff: Pflichtfeld, Hinweise, Sicherheitsdatenblatt hochladen, Betriebsanweisung als PDF, CSV', async function () {
  assert.strictEqual((await rufen('b', '/api/register', { register: 'gefahrstoffe' })).status, 400);
  const id = (await rufen('b', '/api/register', { register: 'gefahrstoffe', produkt: 'Sanitärreiniger sauer', ghs: ['GHS05', 'GHS07'], signalwort: 'Gefahr', sdb_datum: '2021-01-10', sdb_pruefen: plus(heute, 10) })).j.id;
  let e = (await rufen('b', '/api/register?id=gefahrstoffe&eintrag=' + id)).j;
  assert.ok(e.hinweise.some(h => /ohne Betriebsanweisung/.test(h)));
  assert.ok(e.hinweise.some(h => /älter als 3 Jahre/.test(h)));
  assert.deepStrictEqual(e.eintrag.ghs, ['GHS05', 'GHS07']);
  assert.strictEqual((await rufen('b', '/api/register/datei', { register: 'gefahrstoffe', id: id, feld: 'sdb', datei: PDF1 })).status, 200);
  await rufen('b', '/api/register', { register: 'gefahrstoffe', id: id, produkt: 'Sanitärreiniger sauer', ghs: 'GHS05', sdb_pruefen: plus(heute, 10), betriebsanweisung: 'Nie mit Chlor mischen.' });
  e = (await rufen('b', '/api/register?id=gefahrstoffe&eintrag=' + id)).j;
  assert.ok(e.eintrag.sdb && e.eintrag.sdb.datei, 'Datei bleibt beim Speichern erhalten');
  assert.ok(!e.hinweise.some(h => /ohne Betriebsanweisung/.test(h)));
  const d = await rufen('b', '/api/register/datei?id=gefahrstoffe&eintrag=' + id + '&feld=sdb'); assert.strictEqual(d.status, 200); assert.ok(d.buf.toString().startsWith('%PDF'));
  const pdf = await rufen('b', '/api/register.pdf?id=gefahrstoffe&eintrag=' + id); assert.strictEqual(pdf.status, 200); assert.ok(pdf.buf.slice(0, 4).toString() === '%PDF');
  const csv = await rufen('b', '/api/register.csv?id=gefahrstoffe'); assert.ok(csv.buf.toString('utf8').includes('Sanitärreiniger sauer'));
  assert.ok((await rufen('b', '/api/register')).j.fristen.some(f => f.register === 'gefahrstoffe' && f.eintrag_id === id));
  assert.strictEqual((await rufen('b', '/api/register', { register: 'gefahrstoffe', produkt: 'x', sdb_pruefen: '10.10.2026' })).status, 400, 'Datum JJJJ-MM-TT');
});

test('Ausgabe: Schlüssel an Anna → Quittung in der App → Austritt listet Rückgabe', async function () {
  const id = (await rufen('b', '/api/register', { register: 'ausgaben', art: 'schluessel', gegenstand: 'Generalschlüssel', merkmal: 'Nr. 14', mitarbeiter_id: anna, objekt_id: objekt, ausgabe: heute })).j.id;
  let a = (await rufen('app', '/api/app/bestaetigen')).j;
  assert.strictEqual(a.ausgaben.length, 1); assert.strictEqual(a.ausgaben[0].objekt, 'Praxis EG');
  assert.strictEqual((await rufen('app', '/api/app/bestaetigen', { ausgabe: id })).status, 400, 'ohne Häkchen keine Quittung');
  assert.strictEqual((await rufen('app', '/api/app/bestaetigen', { ausgabe: id, gelesen: true })).status, 200);
  assert.strictEqual((await rufen('app', '/api/app/bestaetigen')).j.ausgaben.length, 0);
  const e = (await rufen('b', '/api/register?id=ausgaben&eintrag=' + id)).j; assert.ok(e.eintrag.quittiert_am); assert.strictEqual(e.hinweise.length, 0);
  // fremde Ausgabe quittieren geht nicht
  const fremd = (await rufen('b', '/api/register', { register: 'ausgaben', art: 'kleidung', gegenstand: 'Kasack', mitarbeiter_id: bernd, ausgabe: heute })).j.id;
  assert.strictEqual((await rufen('app', '/api/app/bestaetigen', { ausgabe: fremd, gelesen: true })).status, 403);
  await rufen('b', '/api/personal', { id: anna, austritt: plus(heute, 20) });
  const aus = (await rufen('b', '/api/register?id=checklisten')).j.liste.find(c => c.art === 'austritt' && c.mitarbeiter_id === anna);
  assert.ok(aus && aus.punkte.some(p => /Rückgabe: Generalschlüssel \(Nr\. 14\)/.test(p.schritt)));
  assert.strictEqual(aus.stichtag, plus(heute, 20));
  await rufen('b', '/api/personal', { id: anna, austritt: plus(heute, 20) });
  assert.strictEqual((await rufen('b', '/api/register?id=checklisten')).j.liste.filter(c => c.art === 'austritt').length, 1, 'keine doppelte Checkliste');
  // Schritt abhaken → Fortschritt, Frist verschwindet
  aus.punkte.forEach(p => { p.erledigt = true; });
  await rufen('b', '/api/register', Object.assign({ register: 'checklisten' }, aus));
  const neu = (await rufen('b', '/api/register?id=checklisten&eintrag=' + aus.id)).j.eintrag; assert.strictEqual(neu.fortschritt, 100);
  assert.ok(!(await rufen('b', '/api/register?tage=365')).j.fristen.some(f => f.register === 'checklisten' && f.eintrag_id === aus.id));
  await rufen('b', '/api/personal', { id: anna, austritt: '' });
});

test('Unfall über 3 Tage ohne BG-Meldung, Subunternehmer mit Standard-Nachweisen, Führerschein +6 Monate, Lieferant-Schnitt, Ersthelfer-Quote', async function () {
  const u = (await rufen('b', '/api/register', { register: 'unfaelle', art: 'arbeitsunfall', datum: heute, hergang: 'Auf nassem Boden ausgerutscht', ausfalltage: '5', mitarbeiter_id: anna })).j.id;
  assert.ok((await rufen('b', '/api/register?id=unfaelle&eintrag=' + u)).j.hinweise.some(h => /§ 193 SGB VII/.test(h)));
  const s = (await rufen('b', '/api/register', { register: 'subunternehmer', firma: 'Glas GmbH' })).j.id;
  const se = (await rufen('b', '/api/register?id=subunternehmer&eintrag=' + s)).j;
  assert.strictEqual(se.eintrag.nachweise.length, 6); assert.ok(se.hinweise.some(h => /6 Nachweise fehlen/.test(h)));
  const f = (await rufen('b', '/api/register', { register: 'fuehrerscheine', mitarbeiter_id: bernd, geprueft_am: '2026-03-31' })).j.id;
  assert.strictEqual((await rufen('b', '/api/register?id=fuehrerscheine&eintrag=' + f)).j.eintrag.naechste, '2026-09-30');
  const l = (await rufen('b', '/api/register', { register: 'lieferanten', lieferant: 'Chemie Nord', qualitaet: 5, termintreue: 4, preis: '3', service: '' })).j.id;
  assert.strictEqual((await rufen('b', '/api/register?id=lieferanten&eintrag=' + l)).j.eintrag.schnitt, 4);
  let q = (await rufen('b', '/api/register')).j.ersthelfer; assert.deepStrictEqual([q.beschaeftigte, q.soll, q.erfuellt], [2, 1, false]);
  await rufen('b', '/api/register', { register: 'beauftragte', rolle: 'ersthelfer', mitarbeiter_id: anna, gueltig_bis: plus(heute, 400) });
  q = (await rufen('b', '/api/register')).j.ersthelfer; assert.strictEqual(q.erfuellt, true);
  const g = (await rufen('b', '/api/register', { register: 'gbu', titel: 'Unterhaltsreinigung Praxis', objekt_id: objekt, gefaehrdungen: [{ gefaehrdung: 'Rutschen', schwere: '2', wahrscheinlichkeit: 3, massnahme: 'Warnschild', frist: plus(heute, 5) }, { gefaehrdung: '' }] })).j.id;
  const ge = (await rufen('b', '/api/register?id=gbu&eintrag=' + g)).j.eintrag;
  assert.strictEqual(ge.gefaehrdungen.length, 1, 'leere Zeilen fallen weg'); assert.strictEqual(ge.gefaehrdungen[0].schwere, 2); assert.strictEqual(ge.objekt_id_name, 'Praxis EG');
  assert.ok((await rufen('b', '/api/register')).j.fristen.some(f => f.register === 'gbu' && /Rutschen/.test(f.was)));
  assert.strictEqual((await rufen('b', '/api/register.pdf?id=gbu&eintrag=' + g)).status, 200);
  assert.strictEqual((await rufen('b', '/api/register/loeschen', { register: 'gbu', id: g })).status, 200);
  assert.strictEqual((await rufen('b', '/api/register?id=gbu&eintrag=' + g)).status, 404);
});

test('Unterweisung: Vorlagen, App-Bestätigung, neue Fassung → neu fällig, Präsenz, Dienstanweisung nur fürs Objekt-Team, PDF', async function () {
  const u = (await rufen('b', '/api/unterweisung')).j;
  assert.strictEqual(u.themen.length, 6);
  assert.strictEqual(u.faellig.length, 12, '6 Themen × 2 Kräfte');
  const gs = u.themen.find(t => t.titel === 'Gefahrstoffe und Hautschutz');
  let offen = (await rufen('app', '/api/app/bestaetigen')).j.unterweisungen; assert.strictEqual(offen.length, 6);
  assert.strictEqual((await rufen('app', '/api/app/bestaetigen', { thema: gs.id })).status, 400);
  assert.strictEqual((await rufen('app', '/api/app/bestaetigen', { thema: gs.id, gelesen: true })).status, 200);
  assert.strictEqual((await rufen('app', '/api/app/bestaetigen')).j.unterweisungen.length, 5);
  let t = (await rufen('b', '/api/unterweisung?id=' + gs.id)).j;
  const a = t.personen.find(p => p.id === anna); assert.strictEqual(a.status, 'ok'); assert.strictEqual(a.weg, 'app'); assert.strictEqual(a.faellig, plus(heute, 0).slice(0, 4) * 1 + 1 + heute.slice(4));
  // Inhalt geändert → Version 2, Anna muss neu bestätigen; nur Titel geändert → keine neue Version
  let r = (await rufen('b', '/api/unterweisung', { id: gs.id, titel: gs.titel, inhalt: gs.inhalt + ' Neu: Dosiersystem benutzen.', intervall_monate: 12 })).j; assert.strictEqual(r.version, 2);
  assert.ok((await rufen('app', '/api/app/bestaetigen')).j.unterweisungen.some(x => x.id === gs.id && x.status === 'neu'));
  r = (await rufen('b', '/api/unterweisung', { id: gs.id, titel: 'Gefahrstoffe & Hautschutz', inhalt: gs.inhalt + ' Neu: Dosiersystem benutzen.', intervall_monate: 12 })).j; assert.strictEqual(r.neueVersion, false);
  // Präsenz für beide
  assert.strictEqual((await rufen('b', '/api/unterweisung/nachweis', { thema_id: gs.id, mitarbeiter_ids: [anna, bernd], am: heute, durch: 'Objektleitung' })).j.anzahl, 2);
  assert.strictEqual((await rufen('b', '/api/unterweisung/nachweis', { thema_id: gs.id, mitarbeiter_ids: [anna], am: plus(heute, 3) })).status, 400, 'nicht in der Zukunft');
  t = (await rufen('b', '/api/unterweisung?id=' + gs.id)).j; assert.ok(t.personen.every(p => p.status === 'ok'));
  // Dienstanweisung: nur Anna ist im Objekt-Team
  assert.strictEqual((await rufen('b', '/api/unterweisung', { art: 'dienstanweisung', titel: 'DA Praxis', inhalt: 'Alarm um 6 Uhr aus.' })).status, 400, 'Dienstanweisung braucht ein Objekt');
  const da = (await rufen('b', '/api/unterweisung', { art: 'dienstanweisung', titel: 'DA Praxis', inhalt: 'Röntgenraum nur nach Freigabe betreten.', objekt_id: objekt })).j.id;
  t = (await rufen('b', '/api/unterweisung?id=' + da)).j; assert.deepStrictEqual(t.personen.map(p => p.name), ['Anna Test']); assert.strictEqual(t.intervall_monate, 0);
  assert.ok((await rufen('app', '/api/app/bestaetigen')).j.unterweisungen.some(x => x.id === da && x.objekt === 'Praxis EG'));
  await rufen('app', '/api/app/bestaetigen', { thema: da, gelesen: true });
  assert.ok(!(await rufen('app', '/api/app/bestaetigen')).j.unterweisungen.some(x => x.id === da), 'einmalig bestätigt → erledigt');
  const pdf = await rufen('b', '/api/unterweisung.pdf?id=' + gs.id); assert.strictEqual(pdf.status, 200); assert.ok(pdf.buf.slice(0, 4).toString() === '%PDF');
  assert.strictEqual((await rufen('b', '/api/unterweisung?mitarbeiter=' + anna)).j.length, 7);
  await rufen('b', '/api/unterweisung/archivieren', { id: da });
  assert.strictEqual((await rufen('b', '/api/unterweisung')).j.themen.length, 6);
});
