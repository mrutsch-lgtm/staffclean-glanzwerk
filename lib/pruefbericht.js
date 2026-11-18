// pruefbericht.js — Prüfbericht mit Ablauf Entwurf → Freigabe → Versand (CleaningOS-Abgleich 18.11.2026, Baustein 8).
// Eine abgeschlossene Qualitätsprüfung ist zunächst ein Entwurf: der Kunde sieht sie erst, wenn das Büro sie freigibt
// („freigegeben von … am …"); danach lässt sie sich als PDF mailen. Abschalten: Einstellung pruefung_freigabe = 0.
'use strict';
const DB = require('./db');

function tabellen(db) {
  const sp = db.prepare('PRAGMA table_info(pruefung)').all().map(function (c) { return c.name; });
  ['freigegeben_von TEXT', 'freigegeben_am TEXT', 'versendet_am TEXT'].forEach(function (s) { if (sp.indexOf(s.split(' ')[0]) < 0) db.exec('ALTER TABLE pruefung ADD COLUMN ' + s); });
  db.prepare("INSERT OR IGNORE INTO einstellung (schluessel, wert) VALUES ('pruefung_freigabe', '1')").run();
}
// Darf der Kunde diesen Bericht sehen?
function sichtbar(db, p) { return !!p && p.ergebnis != null && (!!p.freigegeben_am || DB.einstellungen(db).pruefung_freigabe === '0'); }
const sqlSichtbar = db => DB.einstellungen(db).pruefung_freigabe === '0' ? 'ergebnis IS NOT NULL' : 'ergebnis IS NOT NULL AND freigegeben_am IS NOT NULL';

function freigeben(db, id, wer) {
  const p = db.prepare('SELECT * FROM pruefung WHERE id = ?').get(Number(id)); if (!p) throw new Error('Prüfung nicht gefunden');
  if (p.ergebnis == null) throw new Error('Erst die Prüfung abschließen, dann freigeben.');
  db.prepare("UPDATE pruefung SET freigegeben_von = ?, freigegeben_am = datetime('now','localtime') WHERE id = ?").run(wer || null, p.id);
}

async function pdf(db, p) {
  const BRIEF = require('./pdf/brief');
  const o = db.prepare('SELECT o.name, o.strasse, o.plz, o.ort, o.objektnummer, k.name kunde FROM objekt o LEFT JOIN kunde k ON k.id = o.kunde_id WHERE o.id = ?').get(p.objekt_id) || {};
  const de = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '';
  const zahl = v => String(Math.round((v || 0) * 10) / 10).replace('.', ',');
  const zeilen = [];
  p.raeume.forEach(function (r) {
    const bewertet = r.kriterien.filter(function (k) { return k.ok !== null; });
    zeilen.push([r.name + (r.etage ? ' (' + r.etage + ')' : ''), String(bewertet.length), String(bewertet.filter(function (k) { return k.ok === false; }).length),
      r.kriterien.filter(function (k) { return k.ok === false; }).map(function (k) { return k.element + (k.notiz ? ' – ' + k.notiz : ''); }).join(', ') || 'in Ordnung']);
  });
  const buf = await BRIEF.brief(db, { kennung: 'Prüfbericht ' + o.name + ' ' + de(p.datum), bank: false, titel: 'Prüfbericht Reinigungsqualität – ' + o.name, empfaenger: o.kunde ? [o.kunde] : undefined,
    spalte: ['QUALITÄT', ['Objekt:', o.name], o.objektnummer ? ['Objekt-Nr.:', o.objektnummer] : null, ['Prüfdatum:', de(p.datum)], ['Prüfer:', p.pruefer || ''], p.freigegeben_am ? ['Freigegeben:', de(p.freigegeben_am)] : null].filter(Boolean),
    bloecke: [
      { absatz: 'Stichprobenprüfung angelehnt an DIN EN 13549: ' + p.stichprobe + ' Räume zufällig ausgewählt, ' + (p.geprueft || 0) + ' geprüft. Bewertet wurde je Prüfelement „in Ordnung" oder „nicht in Ordnung".' },
      { felder: { titel: 'Ergebnis', paare: [['Qualitätswert', zahl(p.ergebnis) + ' %'], ['Geprüfte Räume', String(p.geprueft || 0)], ['Beanstandete Elemente', String(p.raeume.reduce(function (a, r) { return a + r.kriterien.filter(function (k) { return k.ok === false; }).length; }, 0))]] } },
      { tabelle: { spalten: [{ t: 'Raum', b: 130 }, { t: 'Elemente', b: 55, rechts: true }, { t: 'Fehler', b: 45, rechts: true }, { t: 'Befund', b: 260 }], zeilen: zeilen.length ? zeilen : [['—', '', '', '']] } },
      p.bemerkung ? { absatz: 'Bemerkung: ' + p.bemerkung } : { abstand: 4 },
      { absatz: 'Jeder beanstandete Punkt ist als Mangel mit Frist erfasst und wird nachgearbeitet.' },
      p.abgezeichnet_von ? { absatz: 'Abgezeichnet von ' + p.abgezeichnet_von + ' am ' + de(p.abgezeichnet_am) + '.' } : { unterschrift: ['Ort, Datum', 'Unterschrift Auftraggeber'] }
    ] });
  return { buf: buf, name: 'Pruefbericht_' + String(o.name || 'Objekt').replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + '_' + p.datum + '.pdf' };
}

module.exports = { tabellen, sichtbar, sqlSichtbar, freigeben, pdf };
