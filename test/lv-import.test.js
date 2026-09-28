'use strict';
// Baut ein Excel im Aufbau der Treppenhaus-Vorlage nach (erfundene Daten) und liest es wieder ein.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const LV = require('../lib/lv-import');
const DB = require('../lib/db');
const PLAN = require('../lib/plan');

async function musterDatei() {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Tabelle1');
  ws.getRow(1).values = ['Leistungsverzeichnis', null, 'Unterhaltsreinigung'];
  ws.getRow(3).values = ['Kunde', 'Musterverwaltung, Beispielstraße 3, Neumünster'];
  ws.getRow(6).values = ['Räume', 'Belag', null, 'saugen und feucht wischen', 'Briefkästen abwischen', 'Handlauf abwischen'];
  ws.getRow(7).values = ['Treppenhaus', 'Fliese', null, '1 W', '1 W', '1 W'];
  ws.getRow(8).values = ['Keller', 'Estrich', null, '1 M', null, null];
  ws.getRow(9).values = ['Dachboden', 'Holz', null, null, null, null];
  ws.getRow(21).values = ['Bei Bedarf: ', 'Spinnweben entfernen'];
  ws.getRow(32).values = ['1 W= 1x Wöchentlich'];
  const f = path.join(os.tmpdir(), 'sc-lv-' + Date.now() + '.xlsx'); await wb.xlsx.writeFile(f); return f;
}

test('LV lesen: Kopfzeile, Räume, Turnus, Hinweise', async function () {
  const f = await musterDatei();
  const lv = await LV.lesen(f); fs.unlinkSync(f);
  assert.strictEqual(lv.objekt.kunde, 'Musterverwaltung');
  assert.strictEqual(lv.objekt.name, 'Beispielstraße 3, Neumünster');
  assert.deepStrictEqual(lv.taetigkeiten, ['saugen und feucht wischen', 'Briefkästen abwischen', 'Handlauf abwischen']);
  assert.strictEqual(lv.raeume.length, 3);
  assert.deepStrictEqual(lv.raeume[0].leistungen.map(l => l.turnus), ['1 W', '1 W', '1 W']);
  assert.strictEqual(lv.raeume[1].leistungen[0].turnus, '1 M');
  assert.ok(lv.hinweise.some(h => /Dachboden/.test(h)));
  assert.deepStrictEqual(lv.bedarf, ['Spinnweben entfernen']);
});

test('LV übernehmen → Tagesplan kennt die Aufgaben', async function () {
  const f = await musterDatei(); const lv = await LV.lesen(f); fs.unlinkSync(f);
  const db = DB.oeffnen(':memory:');
  const id = LV.uebernehmen(db, lv);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM lv_position WHERE objekt_id = ?').get(id).n, 4);
  const mo = PLAN.tag(db, '2026-10-05');           // erster Montag im Oktober: 1 W + 1 M
  assert.strictEqual(mo.soll, 4);
  const mo2 = PLAN.tag(db, '2026-10-12');          // zweiter Montag: nur 1 W
  assert.strictEqual(mo2.soll, 3);
  assert.strictEqual(PLAN.tag(db, '2026-10-06').soll, 0);
});

// Aufbau wie die Wettbewerber-LVs (erfundene Daten): „Nr | Räume | Belag | m²", Zwischenzeile „Erdgeschoss",
// eigene Kürzel mit Legende (m2 = 14-täglich, j2 = 2x jährlich), Summenzeile, QM-Spalte darf kein Turnus werden.
async function wettbewerberDatei() {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Tabelle1');
  ws.getRow(1).values = ['Leistungsverzeichnis Unterhaltsreinigung'];
  ws.getRow(2).values = [null, 'Objekt:', 'WEG Musterallee 12a, 24534 Neumünster'];
  ws.getRow(4).values = ['Nr', 'Räume', 'Belag', 'm²', 'Boden feucht wischen', 'Glas reinigen', 'Papierkörbe leeren, Beutel wechseln'];
  ws.getRow(5).values = [null, 'Erdgeschoss'];
  ws.getRow(6).values = [1, 'Flur', 'Estrich', 4, '1', 'j2', '3'];
  ws.getRow(7).values = [2, 'Büro', 'Teppich', '30,47', 'm2', null, '5'];
  ws.getRow(8).values = [null, 'Summe', null, '34,47'];
  ws.getRow(10).values = [null, 'm2 = 14-täglich (gerade Wochen)'];
  ws.getRow(11).values = [null, 'j2 = 2x jährlich'];
  const f = path.join(os.tmpdir(), 'sc-lv-wb-' + Date.now() + '.xlsx'); await wb.xlsx.writeFile(f); return f;
}

test('LV lesen: Räume in Spalte 2, Fläche als m², Zwischenzeile als Etage, Legende übersetzt Kürzel', async function () {
  const f = await wettbewerberDatei(); const lv = await LV.lesen(f); fs.unlinkSync(f);
  assert.deepStrictEqual(lv.taetigkeiten, ['Boden feucht wischen', 'Glas reinigen', 'Papierkörbe leeren, Beutel wechseln']);   // „m²" ist keine Tätigkeit
  assert.deepStrictEqual(lv.raeume.map(r => r.name), ['Flur', 'Büro']);                                                        // „Erdgeschoss" und „Summe" sind keine Räume
  assert.deepStrictEqual(lv.raeume.map(r => r.flaeche), [4, 30.47]);
  assert.deepStrictEqual(lv.raeume.map(r => r.etage), ['Erdgeschoss', 'Erdgeschoss']);
  assert.strictEqual(lv.raeume[1].leistungen[0].turnus, '14T');                                                                 // m2 laut Legende 14-täglich, nicht 2× im Monat
  assert.strictEqual(lv.raeume[0].leistungen[1].turnus, 'j2');
  assert.strictEqual(lv.objekt.kunde, 'WEG Musterallee 12a'); assert.strictEqual(lv.objekt.strasse, 'Musterallee 12a');
  assert.strictEqual(lv.objekt.plz, '24534'); assert.strictEqual(lv.objekt.ort, 'Neumünster');
  assert.ok(lv.hinweise.some(h => /m2.*14T/.test(h)));
  const db = DB.oeffnen(':memory:'); const id = LV.uebernehmen(db, lv);
  assert.strictEqual(db.prepare('SELECT SUM(flaeche_m2) f FROM raum WHERE objekt_id = ?').get(id).f, 34.47);
  const T = require('../lib/turnus');
  assert.ok(db.prepare('SELECT turnus FROM lv_position WHERE objekt_id = ?').all(id).every(p => T.lesen(p.turnus).art !== 'unbekannt'));
});

test('Schreibvarianten derselben Tätigkeit landen nur einmal im Katalog', async function () {
  const db = DB.oeffnen(':memory:');
  const lv = n => ({ objekt: { name: 'X', kunde: '', strasse: '', ort: '' }, taetigkeiten: [n], raeume: [{ name: 'Flur', belag: '', leistungen: [{ taetigkeit: n, turnus: '1 W' }] }], bedarf: [], hinweise: [] });
  LV.uebernehmen(db, lv('saugen und feucht wischen')); LV.uebernehmen(db, lv('saugen und, oder feucht wischen'));
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM taetigkeit WHERE name LIKE 'saugen%'").get().n, 1);
});
