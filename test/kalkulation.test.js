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
