'use strict';
// Steuerfälle der Gebäudereinigung: § 13b Abs. 2 Nr. 8 UStG (Reverse Charge) und § 14 Abs. 4 Nr. 9 UStG (Privatkunde),
// Pflichtangaben für XRechnung (BR-DE) — jeweils im Datensatz, in ZUGFeRD (CII) und in XRechnung (UBL).
const test = require('node:test');
const assert = require('node:assert');
const DB = require('../lib/db');
const AB = require('../lib/abrechnung');
const ZF = require('../lib/zugferd');

function grund(db) {
  [['steuernummer', '20/290/00000'], ['iban', 'DE02120300000000202051'], ['firma_email', 'rechnung@staffclean.de'], ['firma_telefon', '+49 4321 000000']]
    .forEach(x => db.prepare('UPDATE einstellung SET wert = ? WHERE schluessel = ?').run(x[1], x[0]));
}
function kunde(db, felder) {
  const k = Object.assign({ name: 'Kunde GmbH', anschrift: 'Weg 1', plz: '24103', ort: 'Kiel', steuerfall: 'normal', privat: 0, ust_id: null, email: null, leitweg_id: null, rechnungsformat: 'zugferd' }, felder);
  const id = Number(db.prepare('INSERT INTO kunde (name, anschrift, plz, ort, steuerfall, privat, ust_id, email, leitweg_id, rechnungsformat) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(k.name, k.anschrift, k.plz, k.ort, k.steuerfall, k.privat, k.ust_id, k.email, k.leitweg_id, k.rechnungsformat).lastInsertRowid);
  const o = Number(db.prepare("INSERT INTO objekt (kunde_id, name, monatspreis) VALUES (?, 'Objekt', 1000)").run(id).lastInsertRowid);
  return { k: id, o: o };
}

test('§ 13b: 0 % USt, Kategorie AE in CII und UBL, ohne USt-IdNr. des Kunden kein Stellen', function () {
  const db = DB.oeffnen(':memory:'); grund(db);
  const { k, o } = kunde(db, { steuerfall: 'reverse_charge' });
  const e = AB.entwurf(db, o, '2026-09');
  assert.throws(() => AB.stellen(db, e.id), /USt-IdNr\. des Kunden/);
  db.prepare("UPDATE kunde SET ust_id = 'DE987654321' WHERE id = ?").run(k);
  assert.throws(() => AB.stellen(db, e.id), /eigene USt-IdNr/);
  db.prepare("UPDATE einstellung SET wert = 'DE123456789' WHERE schluessel = 'ust_id'").run();
  AB.stellen(db, e.id);
  const r = AB.voll(db, e.id);
  assert.strictEqual(r.steuerfall, 'reverse_charge'); assert.strictEqual(r.ust, 0); assert.strictEqual(r.brutto, 1000);
  const cii = ZF.xml(db, r), ubl = AB.xrechnung(db, e.id);
  assert.match(cii, /<ram:CategoryCode>AE<\/ram:CategoryCode>/); assert.match(cii, /VATEX-EU-AE/); assert.match(cii, /Steuerschuldnerschaft des Leistungsempfängers/);
  assert.match(ubl, /<cbc:ID>AE<\/cbc:ID><cbc:Percent>0<\/cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-EU-AE/);
  // Storno übernimmt den Steuerfall
  const snr = AB.stornieren(db, e.id); const s = AB.voll(db, db.prepare('SELECT id FROM rechnung WHERE nummer = ?').get(snr).id);
  assert.strictEqual(s.steuerfall, 'reverse_charge'); assert.strictEqual(s.brutto, -1000);
});

test('Steuerfall gilt beim Stellen: später auf § 13b umgestellt → Rechnung ohne USt', function () {
  const db = DB.oeffnen(':memory:'); grund(db); db.prepare("UPDATE einstellung SET wert = 'DE123456789' WHERE schluessel = 'ust_id'").run();
  const { k, o } = kunde(db, {});
  const e = AB.entwurf(db, o, '2026-09'); assert.strictEqual(AB.voll(db, e.id).ust, 190);
  db.prepare("UPDATE kunde SET steuerfall = 'reverse_charge', ust_id = 'DE987654321' WHERE id = ?").run(k);
  AB.stellen(db, e.id); const r = AB.voll(db, e.id);
  assert.strictEqual(r.ust, 0); assert.strictEqual(r.ust_prozent, 0); assert.strictEqual(r.brutto, 1000);
});

test('Privatkunde: Kennzeichen an der Rechnung (Hinweis Aufbewahrungspflicht im PDF), reguläre USt', function () {
  const db = DB.oeffnen(':memory:'); grund(db);
  const { o } = kunde(db, { privat: 1, name: 'Erika Mustermann' });
  const e = AB.entwurf(db, o, '2026-09'); AB.stellen(db, e.id); const r = AB.voll(db, e.id);
  assert.strictEqual(r.privat, 1); assert.strictEqual(r.ust, 190); assert.strictEqual(r.brutto, 1190);
});

test('XRechnung: ohne Leitweg-ID, Kunden-E-Mail und eigene Telefonnummer kein Stellen (BR-DE)', function () {
  const db = DB.oeffnen(':memory:'); grund(db); db.prepare("UPDATE einstellung SET wert = '' WHERE schluessel = 'firma_telefon'").run();
  const { k, o } = kunde(db, { rechnungsformat: 'xrechnung' });
  const e = AB.entwurf(db, o, '2026-09');
  const l = AB.pflichtLuecken(db, AB.voll(db, e.id)).join(' | ');
  assert.match(l, /Leitweg-ID/); assert.match(l, /E-Mail des Kunden/); assert.match(l, /eigene Telefonnummer/);
  db.prepare("UPDATE kunde SET leitweg_id = '991-12345-67', email = 'rechnung@example.org' WHERE id = ?").run(k);
  db.prepare("UPDATE einstellung SET wert = '+49 4321 000000' WHERE schluessel = 'firma_telefon'").run();
  assert.deepStrictEqual(AB.pflichtLuecken(db, AB.voll(db, e.id)), []);
  assert.ok(AB.stellen(db, e.id));
});
