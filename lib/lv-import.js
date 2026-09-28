// lv-import.js — Leistungsverzeichnis aus Excel einlesen (Raster Raum × Tätigkeit × Turnus).
//
// Gebaut an der Vorlage, die in den Treppenhaus-LVs aus Neumünster steckt (alle gleich aufgebaut):
//   Zeile „Kunde | <Name, Straße, Ort>", darunter die Kopfzeile „Räume | Belag | … | <Tätigkeit 1> | …",
//   je Raum eine Zeile mit dem Turnus-Kürzel in der Spalte der Tätigkeit („1 W", „1 M"), unten die Legende.
// Erkannt wird die Kopfzeile am Wort „Raum"/„Räume" in der ersten Spalte — nicht an einer Zeilennummer,
// damit auch leicht abweichende Tabellen gehen. Alles, was nicht eindeutig ist, landet in `hinweise`.
'use strict';
const ExcelJS = require('exceljs');
const T = require('./turnus');

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

// Legende „1 W= 1x Wöchentlich / 1 M= 1 x im Monat" oder „m2 = 14-täglich" → { kürzel: Glanzwerk-Kürzel }
function legendeLesen(zeilen) {
  const eintraege = [], karte = {};
  zeilen.forEach(function (z) {
    z.zellen.forEach(function (c) {
      String(c || '').split(/\s+\/\s+|;|\n/).forEach(function (teil) {
        const m = teil.match(/^\s*([0-9a-zA-ZäöüÄÖÜ][0-9a-zA-ZäöüÄÖÜ,. ]{0,5}?)\s*[=:]\s*(.{3,})$/);
        if (!m || /kunde|objekt|datum|summe|telefon/i.test(m[1])) return;
        const kuerzel = m[1].trim(), text = m[2].trim(), ziel = T.ausBeschreibung(text);
        eintraege.push(kuerzel + ' = ' + text);
        if (ziel) karte[kuerzel.toLowerCase().replace(/\s+/g, ' ')] = ziel;
      });
    });
  });
  return { eintraege: eintraege, karte: karte };
}

// „BBN, Havelstraße 7, 24534 Neumünster" / „Böge & Cie, Friedrichstraße 32 Neumünster" / „WEG Gadelander Straße 17a, Neumünster"
const STRASSE = /([A-ZÄÖÜ][\wäöüß.\-]*(?:[ -][\wäöüß.\-]+)*\s+\d+\s*[a-z]?(?:\s*[-–\/]\s*\d+\s*[a-z]?)?)/;
function anschriftLesen(roh) {
  const teile = String(roh || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  const aus = { kunde: '', strasse: '', plz: '', ort: '' };
  const ortTeil = x => { const m = String(x).match(/^(\d{5})?\s*(.*)$/); aus.plz = m[1] || aus.plz; aus.ort = m[2] || aus.ort; };
  const strasseMitOrt = x => { const m = String(x).match(new RegExp('^(.*?' + STRASSE.source + ')\\s+((?:\\d{5}\\s+)?[A-ZÄÖÜ][\\wäöüß.\\- ]+)$')); if (m) { aus.strasse = m[1].trim(); ortTeil(m[3]); return true; } return false; };
  if (teile.length >= 3) { aus.kunde = teile[0]; aus.strasse = teile[1]; ortTeil(teile.slice(2).join(', ')); }
  else if (teile.length === 2) {
    const m0 = teile[0].match(STRASSE);
    // „24534 Neumünster" ist Ort, keine Straße
    if (!/^\d{5}\s/.test(teile[1]) && (STRASSE.test(teile[1]) || /\d/.test(teile[1]))) { aus.kunde = teile[0]; if (!strasseMitOrt(teile[1])) aus.strasse = teile[1]; }
    else if (m0) {   // Kunde ist die Hausgemeinschaft selbst („WEG …") oder fehlt ganz („Jungfernstieg 1-2, Neumünster")
      const weg = /^(WEG|Hausverwaltung|HV|Eigentümergemeinschaft)\s+/i;
      aus.strasse = m0[1].trim().replace(weg, ''); aus.kunde = weg.test(teile[0]) || m0[1].trim() !== teile[0] ? teile[0] : ''; ortTeil(teile[1]);
    }   // „WEG Gadelander Straße 17a, Neumünster"
    else { aus.kunde = teile[0]; ortTeil(teile[1]); }
  } else if (teile.length === 1) { if (!strasseMitOrt(teile[0])) { const m = teile[0].match(STRASSE); if (m) aus.strasse = m[1].trim(); else aus.kunde = teile[0]; } }
  return aus;
}

const ETAGE = /^(erdgeschoss|obergeschoss|untergeschoss|dachgeschoss|keller(geschoss)?|souterrain|\d+\.\s*(og|obergeschoss|etage|stock)|eg|og|ug|dg|\d+\.\s*og|ebene\s*\d+)$/i;

async function lesen(datei) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(datei);
  const ws = wb.worksheets[0];
  const zeilen = [];
  ws.eachRow({ includeEmpty: false }, function (r, nr) { zeilen.push({ nr: nr, zellen: r.values.slice(1).map(sauber) }); });

  const hinweise = [];
  const kundeZeile = zeilen.find(function (z) { return z.zellen.slice(0, 3).some(function (c) { return /^(kunde|objekt|auftraggeber)\s*:?$/i.test(c || ''); }); });
  const titelZeile = zeilen.find(function (z) { return /leistungsverzeichnis/i.test(z.zellen.join(' ')); });
  // Kopfzeile: das Wort „Raum"/„Räume" in einer der ersten Spalten (Beyersdorf: „Nr | Räume | Belag | m²")
  let kopfIdx = -1, nameSpalte = 0;
  zeilen.some(function (z, i) { const j = z.zellen.slice(0, 4).findIndex(function (c) { return /^r(ä|ae)ume?(\s*\/.*)?$|^raumbezeichnung$|^bereich$/i.test(c || ''); }); if (j >= 0) { kopfIdx = i; nameSpalte = j; return true; } return false; });
  if (kopfIdx < 0) throw new Error('Keine Kopfzeile „Räume" gefunden — ist das ein Leistungsverzeichnis?');
  const kopf = zeilen[kopfIdx].zellen;
  const spalteVon = re => kopf.findIndex(function (c, i) { return i !== nameSpalte && re.test(c || ''); });
  const belagSpalte = spalteVon(/^(belag|boden(belag)?)$/i);
  const flaecheSpalte = spalteVon(/^(qm|m²|m2|fläche|flaeche|fläche\s*\(?m²\)?|größe)$/i);
  const etageSpalte = spalteVon(/^(etage|geschoss|ebene|stockwerk)$/i);
  const sonder = [belagSpalte, flaecheSpalte, etageSpalte];
  const taetigkeiten = [];
  kopf.forEach(function (c, i) { if (i <= nameSpalte || sonder.indexOf(i) >= 0 || !c || /^(nr\.?|pos\.?|lfd\.? ?nr\.?)$/i.test(c)) return; taetigkeiten.push({ spalte: i, name: c }); });

  // Fußteil (Legende, „Bei Bedarf") — alles unterhalb der Raumzeilen
  const legende = legendeLesen(zeilen.slice(kopfIdx + 1).concat(zeilen.slice(0, kopfIdx)));
  const raeume = []; let etage = '', uebersetzt = {};
  for (let i = kopfIdx + 1; i < zeilen.length; i++) {
    const z = zeilen[i].zellen, name = z[nameSpalte] || '';
    if (!name) continue;
    if (/^(bei bedarf|erläuterung|erlaeuterung|hinweis|legende|\*)/i.test(name) || /^\s*[0-9a-z]{1,4}\s*=/i.test(name)) break;   // Fußteil erreicht
    if (/^(summe|gesamt|zwischensumme)/i.test(name)) continue;
    const leistungen = [];
    taetigkeiten.forEach(function (t) {
      let k = z[t.spalte]; if (!k) return;
      const schl = k.toLowerCase().replace(/\s+/g, ' ');
      if (legende.karte[schl] && legende.karte[schl] !== k) { uebersetzt[k] = legende.karte[schl]; k = legende.karte[schl]; }
      leistungen.push({ taetigkeit: t.name, turnus: k });
    });
    const flaeche = flaecheSpalte >= 0 ? Number(String(z[flaecheSpalte] || '').replace(/\./g, '').replace(',', '.')) || null : null;
    const belag = belagSpalte >= 0 ? (z[belagSpalte] || '') : '';
    if (!leistungen.length && !belag && !flaeche && ETAGE.test(name)) { etage = name; continue; }   // Zwischenzeile „Erdgeschoss"
    raeume.push({ name: name, belag: belag, flaeche: flaeche, etage: etageSpalte >= 0 ? (z[etageSpalte] || etage) : etage, leistungen: leistungen, zeile: zeilen[i].nr });
    if (!leistungen.length) hinweise.push('Raum „' + name + '" (Zeile ' + zeilen[i].nr + ') hat keine Leistung eingetragen.');
  }
  Object.keys(uebersetzt).forEach(function (k) { hinweise.push('Kürzel „' + k + '" laut Legende als „' + uebersetzt[k] + '" übernommen.'); });
  const unbekannt = {};
  raeume.forEach(function (r) { r.leistungen.forEach(function (l) { if (T.lesen(l.turnus).art === 'unbekannt') unbekannt[l.turnus] = (unbekannt[l.turnus] || 0) + 1; }); });
  Object.keys(unbekannt).forEach(function (k) { hinweise.push('Kürzel „' + k + '" (' + unbekannt[k] + '×) ist unbekannt — nach dem Import im Raster festlegen, sonst wird es nicht geplant.'); });
  const bedarfZeile = zeilen.find(function (z) { return /^bei bedarf/i.test(z.zellen[nameSpalte] || z.zellen[0] || ''); });
  const bedarf = bedarfZeile ? bedarfZeile.zellen.slice(1).filter(function (c) { return c && !/^bei bedarf/i.test(c); }) : [];

  const kundeText = kundeZeile ? kundeZeile.zellen.filter(function (c) { return c && !/^(kunde|objekt|auftraggeber)\s*:?$/i.test(c); }).join(', ') : '';
  const a = anschriftLesen(kundeText);
  const objekt = { name: a.strasse ? a.strasse + (a.ort ? ', ' + a.ort : '') : (kundeText || 'Neues Objekt'), kunde: a.kunde, strasse: a.strasse, plz: a.plz, ort: a.ort,
                   art: titelZeile ? titelZeile.zellen.filter(Boolean).slice(-1)[0] : '' };
  if (!kundeText) hinweise.push('Keine Zeile „Kunde" gefunden — Objektname bitte ergänzen.');
  else if (!a.ort) hinweise.push('Ort nicht erkannt in „' + kundeText + '" — nach dem Import am Objekt ergänzen.');
  if (flaecheSpalte >= 0) hinweise.push('Spalte „' + kopf[flaecheSpalte] + '" als Raumfläche übernommen (Summe ' + raeume.reduce(function (x, r) { return x + (r.flaeche || 0); }, 0).toLocaleString('de-DE') + ' m²).');
  return { objekt: objekt, taetigkeiten: taetigkeiten.map(function (t) { return t.name; }), raeume: raeume, legende: legende.eintraege, bedarf: bedarf, hinweise: hinweise };
}

// Schreibvarianten derselben Tätigkeit zusammenführen: „saugen und, oder feucht wischen" = „saugen und feucht wischen"
const vergleich = n => String(n || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(und|oder|bzw|sowie|inkl|inklusive|ggf|u)\b/g, ' ').replace(/\s+/g, ' ').trim();

// Eingelesenes LV in die Datenbank übernehmen (neues Objekt). Gibt die Objekt-ID zurück.
function uebernehmen(db, lv, opt) {
  opt = opt || {};
  db.exec('BEGIN');
  try {
    let kundeId = null;
    if (lv.objekt.kunde) {
      const k = db.prepare('SELECT id FROM kunde WHERE name = ?').get(lv.objekt.kunde);
      kundeId = k ? k.id : Number(db.prepare('INSERT INTO kunde (name, plz, ort) VALUES (?, ?, ?)').run(lv.objekt.kunde, lv.objekt.plz || null, lv.objekt.ort).lastInsertRowid);
    }
    const oid = Number(db.prepare('INSERT INTO objekt (kunde_id, name, strasse, plz, ort, bundesland, notiz) VALUES (?,?,?,?,?,?,?)')
      .run(kundeId, opt.name || lv.objekt.name, lv.objekt.strasse, lv.objekt.plz || null, lv.objekt.ort, opt.bundesland || 'SH', lv.bedarf.length ? 'Bei Bedarf: ' + lv.bedarf.join(', ') : null).lastInsertRowid);
    const tId = {};
    lv.taetigkeiten.forEach(function (n) {
      const t = db.prepare('SELECT id FROM taetigkeit WHERE name = ?').get(n)
        || db.prepare('SELECT id, name FROM taetigkeit').all().find(function (x) { return vergleich(x.name) === vergleich(n); });
      tId[n] = t ? t.id : Number(db.prepare('INSERT INTO taetigkeit (name) VALUES (?)').run(n).lastInsertRowid);
    });
    lv.raeume.forEach(function (r, i) {
      const rid = Number(db.prepare('INSERT INTO raum (objekt_id, name, belag, etage, flaeche_m2, reihenfolge, code) VALUES (?,?,?,?,?,?,?)')
        .run(oid, r.name, r.belag, r.etage || null, r.flaeche || null, i + 1, 'R' + oid + '-' + (i + 1) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()).lastInsertRowid);
      r.leistungen.forEach(function (l) { db.prepare('INSERT OR IGNORE INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus) VALUES (?,?,?,?)').run(oid, rid, tId[l.taetigkeit], l.turnus); });
    });
    db.exec('COMMIT');
    return oid;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { lesen, uebernehmen, anschriftLesen, vergleich };
