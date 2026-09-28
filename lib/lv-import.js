// lv-import.js — Leistungsverzeichnis aus Excel einlesen (Raster Raum × Tätigkeit × Turnus).
//
// Gebaut an der Vorlage, die in den Treppenhaus-LVs aus Neumünster steckt (alle gleich aufgebaut):
//   Zeile „Kunde | <Name, Straße, Ort>", darunter die Kopfzeile „Räume | Belag | … | <Tätigkeit 1> | …",
//   je Raum eine Zeile mit dem Turnus-Kürzel in der Spalte der Tätigkeit („1 W", „1 M"), unten die Legende.
// Erkannt wird die Kopfzeile am Wort „Raum"/„Räume" in der ersten Spalte — nicht an einer Zeilennummer,
// damit auch leicht abweichende Tabellen gehen. Alles, was nicht eindeutig ist, landet in `hinweise`.
'use strict';
const ExcelJS = require('exceljs');

function text(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
    if (v.result != null) return String(v.result);
    if (v.text) return String(v.text);
    return '';
  }
  return String(v);
}
// Trennstriche aus dem Zellumbruch („Abfall-behälter", „Licht- schalter") zusammenziehen — nur wenn klein
// weitergeschrieben wird; echte Bindestriche vor Großbuchstaben („E-Mail", „Glas-Rahmen") bleiben.
const sauber = s => text(s).replace(/\s+/g, ' ').replace(/([a-zäöüß])- ?([a-zäöüß])/g, '$1$2').trim();

async function lesen(datei) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(datei);
  const ws = wb.worksheets[0];
  const zeilen = [];
  ws.eachRow({ includeEmpty: false }, function (r, nr) { zeilen.push({ nr: nr, zellen: r.values.slice(1).map(sauber) }); });

  const hinweise = [];
  const kundeZeile = zeilen.find(function (z) { return /^kunde$/i.test(z.zellen[0] || ''); });
  const titelZeile = zeilen.find(function (z) { return /leistungsverzeichnis/i.test(z.zellen.join(' ')); });
  const kopfIdx = zeilen.findIndex(function (z) { return /^r(ä|ae)ume?$/i.test(z.zellen[0] || ''); });
  if (kopfIdx < 0) throw new Error('Keine Kopfzeile „Räume" gefunden — ist das ein Leistungsverzeichnis?');
  const kopf = zeilen[kopfIdx].zellen;
  const belagSpalte = kopf.findIndex(function (c) { return /^belag|boden/i.test(c); });
  const taetigkeiten = [];
  kopf.forEach(function (c, i) { if (i === 0 || i === belagSpalte || !c) return; taetigkeiten.push({ spalte: i, name: c }); });

  const raeume = [];
  for (let i = kopfIdx + 1; i < zeilen.length; i++) {
    const z = zeilen[i].zellen, name = z[0] || '';
    if (!name) continue;
    if (/^(bei bedarf|erläuterung|erlaeuterung|hinweis|\d+ ?[a-z]\s*=)/i.test(name)) break;   // Fußteil erreicht
    const leistungen = [];
    taetigkeiten.forEach(function (t) { const k = z[t.spalte]; if (k) leistungen.push({ taetigkeit: t.name, turnus: k }); });
    raeume.push({ name: name, belag: belagSpalte >= 0 ? (z[belagSpalte] || '') : '', leistungen: leistungen, zeile: zeilen[i].nr });
    if (!leistungen.length) hinweise.push('Raum „' + name + '" (Zeile ' + zeilen[i].nr + ') hat keine Leistung eingetragen.');
  }
  const legende = zeilen.filter(function (z) { return /^\s*\d+([,.]\d)?\s*[a-zäöü]+\s*=/i.test(z.zellen[0] || ''); }).map(function (z) { return z.zellen[0]; });
  const bedarfZeile = zeilen.find(function (z) { return /^bei bedarf/i.test(z.zellen[0] || ''); });
  const bedarf = bedarfZeile ? bedarfZeile.zellen.slice(1).filter(Boolean) : [];

  // „BBN, Havelstraße 7, Neumünster" → Kunde / Straße / Ort
  const kundeText = kundeZeile ? kundeZeile.zellen.slice(1).filter(Boolean).join(' ') : '';
  const teile = kundeText.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const objekt = { name: teile.length > 1 ? teile.slice(1).join(', ') : (kundeText || 'Neues Objekt'), kunde: teile.length > 1 ? teile[0] : '',
                   strasse: teile[1] || '', ort: teile[2] || '', art: titelZeile ? titelZeile.zellen.filter(Boolean).slice(-1)[0] : '' };
  if (!kundeText) hinweise.push('Keine Zeile „Kunde" gefunden — Objektname bitte ergänzen.');
  return { objekt: objekt, taetigkeiten: taetigkeiten.map(function (t) { return t.name; }), raeume: raeume, legende: legende, bedarf: bedarf, hinweise: hinweise };
}

// Eingelesenes LV in die Datenbank übernehmen (neues Objekt). Gibt die Objekt-ID zurück.
function uebernehmen(db, lv, opt) {
  opt = opt || {};
  db.exec('BEGIN');
  try {
    let kundeId = null;
    if (lv.objekt.kunde) {
      const k = db.prepare('SELECT id FROM kunde WHERE name = ?').get(lv.objekt.kunde);
      kundeId = k ? k.id : Number(db.prepare('INSERT INTO kunde (name, ort) VALUES (?, ?)').run(lv.objekt.kunde, lv.objekt.ort).lastInsertRowid);
    }
    const oid = Number(db.prepare('INSERT INTO objekt (kunde_id, name, strasse, ort, bundesland, notiz) VALUES (?,?,?,?,?,?)')
      .run(kundeId, opt.name || lv.objekt.name, lv.objekt.strasse, lv.objekt.ort, opt.bundesland || 'SH', lv.bedarf.length ? 'Bei Bedarf: ' + lv.bedarf.join(', ') : null).lastInsertRowid);
    const tId = {};
    lv.taetigkeiten.forEach(function (n) {
      const t = db.prepare('SELECT id FROM taetigkeit WHERE name = ?').get(n);
      tId[n] = t ? t.id : Number(db.prepare('INSERT INTO taetigkeit (name) VALUES (?)').run(n).lastInsertRowid);
    });
    lv.raeume.forEach(function (r, i) {
      const rid = Number(db.prepare('INSERT INTO raum (objekt_id, name, belag, reihenfolge, code) VALUES (?,?,?,?,?)')
        .run(oid, r.name, r.belag, i + 1, 'R' + oid + '-' + (i + 1) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()).lastInsertRowid);
      r.leistungen.forEach(function (l) { db.prepare('INSERT INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus) VALUES (?,?,?,?)').run(oid, rid, tId[l.taetigkeit], l.turnus); });
    });
    db.exec('COMMIT');
    return oid;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { lesen, uebernehmen };
