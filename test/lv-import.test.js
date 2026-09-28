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
