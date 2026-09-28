'use strict';
// Kalkulation: Anzahl gleicher Einheiten vervielfacht die Richtzeit; Preisbausteine gehen als Monatsmittel ein.
const test = require('node:test');
const assert = require('node:assert');
const DB = require('../lib/db');
const KALK = require('../lib/kalkulation');

function objekt(db) {
  const oid = Number(db.prepare("INSERT INTO objekt (name, bundesland, reinigungstag) VALUES ('Treppenhaus Test', 'SH', 1)").run().lastInsertRowid);
  const rid = Number(db.prepare("INSERT INTO raum (objekt_id, name, code) VALUES (?, 'Treppenhaus', 'T1')").run(oid).lastInsertRowid);
  const tid = Number(db.prepare("INSERT INTO taetigkeit (name, minuten) VALUES ('Stufen feucht wischen', 10)").run().lastInsertRowid);
  db.prepare("INSERT INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus) VALUES (?, ?, ?, '1 W')").run(oid, rid, tid);
  return { oid, rid };
}

test('Anzahl (Etagen) vervielfacht die Minuten, nicht die Einsatztage', function () {
  const db = DB.oeffnen(':memory:'); const { oid, rid } = objekt(db);
  const eins = KALK.objekt(db, oid, { ab: '2026-10-01' });
  db.prepare('UPDATE raum SET anzahl = 4 WHERE id = ?').run(rid);
  const vier = KALK.objekt(db, oid, { ab: '2026-10-01' });
  assert.strictEqual(vier.zeilen[0].anzahl, 4);
  assert.ok(Math.abs(vier.ergebnis.leistungMinuten - 4 * eins.ergebnis.leistungMinuten) < 0.2);
  assert.strictEqual(vier.ergebnis.einsatztageMonat, eins.ergebnis.einsatztageMonat);
  assert.ok(vier.ergebnis.monatspreis > eins.ergebnis.monatspreis);
});

test('Richtzeiten an Zielpreis ausrichten: Faktor, Verhältnisse bleiben, Preis trifft das Ziel', function () {
  const db = DB.oeffnen(':memory:'); const { oid, rid } = objekt(db);
  const tid2 = Number(db.prepare("INSERT INTO taetigkeit (name, minuten) VALUES ('Handlauf abwischen', 2)").run().lastInsertRowid);
  db.prepare("INSERT INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus) VALUES (?, ?, ?, '1 W')").run(oid, rid, tid2);
  assert.throws(() => KALK.kalibrieren(db, oid, 1), /Wegezeit/);
  const v = KALK.kalibrieren(db, oid, 236.25, { ab: '2026-10-01' });
  assert.ok(v.faktor > 1);
  const [a, b] = v.zeilen; assert.ok(Math.abs(a.neu / b.neu - 10 / 2) < 0.1);                 // Verhältnis 10 : 2 bleibt
  const x = KALK.kalibrierungUebernehmen(db, oid, 236.25, { ab: '2026-10-01' });
  assert.ok(Math.abs(x.nachher - 236.25) < 1, 'Monatspreis nach Übernahme ' + x.nachher);          // Rundung der Minuten auf 0,1
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM lv_position WHERE objekt_id = ? AND minuten IS NOT NULL').get(oid).n, 2);
});

test('Standardkatalog: legt fehlende Tätigkeiten mit Beschreibung an, überschreibt nichts', function () {
  const KAT = require('../lib/katalog'), LV = require('../lib/lv-import');
  const db = DB.oeffnen(':memory:');
  db.prepare("INSERT INTO taetigkeit (name, anleitung) VALUES ('saugen und, oder feucht wischen', NULL), ('Fegen', 'eigene Anleitung')").run();
  const r = KAT.laden(db, LV.vergleich);
  assert.strictEqual(r.neu, KAT.KATALOG.length - 2); assert.strictEqual(r.ergaenzt, 2);          // Beschreibung bzw. Kategorie nachgetragen
  assert.strictEqual(db.prepare("SELECT kategorie FROM taetigkeit WHERE name = 'Fegen'").get().kategorie, 'Boden');
  assert.strictEqual(db.prepare("SELECT anleitung FROM taetigkeit WHERE name = 'Fegen'").get().anleitung, 'eigene Anleitung');
  assert.ok(db.prepare("SELECT anleitung FROM taetigkeit WHERE name = 'saugen und, oder feucht wischen'").get().anleitung.length > 20);
  assert.deepStrictEqual(KAT.laden(db, LV.vergleich).neu, 0);                                    // zweites Laden: nichts doppelt
});

test('Standard-Richtzeit aus den Einstellungen, Preisbausteine im Monatsmittel', function () {
  const db = DB.oeffnen(':memory:'); const { oid } = objekt(db);
  db.prepare('UPDATE taetigkeit SET minuten = NULL').run();
  db.prepare("UPDATE einstellung SET wert = '8' WHERE schluessel = 'standard_richtzeit_min'").run();
  const k = KALK.objekt(db, oid, { ab: '2026-10-01' });
  assert.strictEqual(k.zeilen[0].minuten, 8); assert.ok(k.warnungen.some(w => /8 Minuten/.test(w)));
  db.prepare("INSERT INTO preisposition (objekt_id, bezeichnung, art, turnus, preis) VALUES (?, 'Glasreinigung', 'je_ausfuehrung', '1 Q', 60)").run(oid);
  db.prepare("INSERT INTO preisposition (objekt_id, bezeichnung, art, preis, monate) VALUES (?, 'Winterdienst', 'monatlich', 120, '11,12,1,2,3')").run(oid);
  const b = KALK.objekt(db, oid, { ab: '2026-10-01' });
  assert.strictEqual(b.bausteine.find(x => x.bezeichnung === 'Glasreinigung').monatsmittel, 20);   // 4 × 60 € ÷ 12
  assert.strictEqual(b.bausteine.find(x => x.bezeichnung === 'Winterdienst').monatsmittel, 50);    // 5 × 120 € ÷ 12
  assert.strictEqual(b.ergebnis.bausteineMonat, 70);
  assert.strictEqual(b.ergebnis.gesamtMonat, Math.round((b.ergebnis.monatspreis + 70) * 100) / 100);
});
