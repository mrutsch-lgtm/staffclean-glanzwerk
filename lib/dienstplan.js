// dienstplan.js — Dienstplanung (Mitarbeiter × Tage), Konflikte, Stunden mit Zuschlägen, DATEV-Export.
//
// Vorbild SecPlan/Planday/Deputy (Marktrecherche 28.09.2026): Planraster je Woche, Schicht = wer, wo, wann;
// Konflikte sofort sichtbar (Doppelbelegung, Abwesenheit, mehr als 10 Std. am Tag, unter 11 Std. Ruhezeit,
// Minijob-Grenze); Stunden kommen aus den Stempelzeiten, ersatzweise aus dem Plan; Lohn macht das Lohnbüro
// in DATEV — Glanzwerk liefert die Bewegungsdaten (Personalnummer, Lohnart, Stunden) als Datei.
'use strict';
const DB = require('./db');
const F = require('./feiertage');

const minuten = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const hhmm = min => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
function dauer(beginn, ende, pause) { let d = minuten(ende) - minuten(beginn); if (d <= 0) d += 1440; return Math.max(0, d - (Number(pause) || 0)); }
const plusTag = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function schichtenZeitraum(db, von, bis, mitarbeiterId) {
  return db.prepare(`SELECT s.*, o.name objekt, o.bundesland, m.name mitarbeiter FROM schicht s JOIN objekt o ON o.id = s.objekt_id LEFT JOIN mitarbeiter m ON m.id = s.mitarbeiter_id
                     WHERE s.datum BETWEEN ? AND ? AND s.status <> 'abgesagt' ${mitarbeiterId ? 'AND s.mitarbeiter_id = ' + Number(mitarbeiterId) : ''} ORDER BY s.datum, s.beginn`).all(von, bis);
}

// Konflikte einer Schicht gegen alle anderen desselben Mitarbeiters
function konflikte(db, s, alle) {
  const aus = [];
  if (!s.mitarbeiter_id) return ['offene Schicht — niemand eingeteilt'];
  const ab = db.prepare('SELECT art FROM abwesenheit WHERE mitarbeiter_id = ? AND von <= ? AND bis >= ?').get(s.mitarbeiter_id, s.datum, s.datum);
  if (ab) aus.push('abwesend (' + ab.art + ')');
  const eigene = alle.filter(function (x) { return x.mitarbeiter_id === s.mitarbeiter_id && x.id !== s.id; });
  const a0 = new Date(s.datum + 'T' + s.beginn + ':00Z').getTime(), a1 = a0 + (dauer(s.beginn, s.ende, 0)) * 60000;
  eigene.forEach(function (x) {
    const b0 = new Date(x.datum + 'T' + x.beginn + ':00Z').getTime(), b1 = b0 + dauer(x.beginn, x.ende, 0) * 60000;
    if (a0 < b1 && b0 < a1) aus.push('überschneidet sich mit ' + x.objekt + ' ' + x.beginn + '–' + x.ende);
    else { const ruhe = a0 >= b1 ? (a0 - b1) / 3600000 : (b0 - a1) / 3600000; if (ruhe < 11 && ruhe > 0) aus.push('nur ' + (Math.round(ruhe * 10) / 10).toString().replace('.', ',') + ' Std. Ruhezeit zu ' + x.objekt); }
  });
  const tagMin = eigene.filter(function (x) { return x.datum === s.datum; }).reduce(function (a, x) { return a + dauer(x.beginn, x.ende, x.pause_min); }, dauer(s.beginn, s.ende, s.pause_min));
  if (tagMin > 600) aus.push('mehr als 10 Std. am Tag (' + (tagMin / 60).toFixed(1).replace('.', ',') + ')');
  const brutto = dauer(s.beginn, s.ende, 0);
  if (brutto > 360 && (s.pause_min || 0) < 30) aus.push('über 6 Std. ohne 30 Min. Pause');
  if (brutto > 540 && (s.pause_min || 0) < 45) aus.push('über 9 Std. ohne 45 Min. Pause');
  return [...new Set(aus)];
}

function woche(db, montag) {
  const tage = []; for (let i = 0; i < 7; i++) tage.push(plusTag(montag, i));
  const alle = schichtenZeitraum(db, plusTag(montag, -1), plusTag(montag, 7));
  const ma = db.prepare('SELECT id, name, minijob, wochenstunden, lohngruppe, stundenlohn FROM mitarbeiter WHERE aktiv = 1 ORDER BY name').all();
  const e = DB.einstellungen(db), grenze = Number(e.minijob_grenze_eur) || 603;
  const inWoche = alle.filter(function (s) { return s.datum >= tage[0] && s.datum <= tage[6]; }).map(function (s) { return Object.assign(s, { minuten: dauer(s.beginn, s.ende, s.pause_min), konflikte: konflikte(db, s, alle) }); });
  const monat = tage[0].slice(0, 7);
  const zeilen = ma.map(function (m) {
    const s = inWoche.filter(function (x) { return x.mitarbeiter_id === m.id; });
    const monatMin = schichtenZeitraum(db, monat + '-01', monat + '-31', m.id).reduce(function (a, x) { return a + dauer(x.beginn, x.ende, x.pause_min); }, 0);
    const tarif = DB.tarifFuer(db, m.lohngruppe || 'LG 1', tage[0]); const lohn = m.stundenlohn || (tarif ? tarif.stundenlohn : 15);
    return { id: m.id, name: m.name, minijob: !!m.minijob, sollWoche: m.wochenstunden, minutenWoche: s.reduce(function (a, x) { return a + x.minuten; }, 0), minutenMonat: monatMin,
             verdienstMonat: Math.round(monatMin / 60 * lohn * 100) / 100, minijobWarnung: !!m.minijob && monatMin / 60 * lohn > grenze,
             abwesend: tage.map(function (d) { const a = db.prepare('SELECT art FROM abwesenheit WHERE mitarbeiter_id = ? AND von <= ? AND bis >= ?').get(m.id, d, d); return a ? a.art : null; }),
             tage: tage.map(function (d) { return s.filter(function (x) { return x.datum === d; }); }) };
  });
  const offen = inWoche.filter(function (s) { return !s.mitarbeiter_id; });
  return { montag: montag, tage: tage, feiertage: tage.map(function (d) { return F.istFeiertag(d, 'SH'); }), zeilen: zeilen, offen: tage.map(function (d) { return offen.filter(function (x) { return x.datum === d; }); }),
           summe: { schichten: inWoche.length, minuten: inWoche.reduce(function (a, x) { return a + x.minuten; }, 0), konflikte: inWoche.filter(function (x) { return x.konflikte.length; }).length } };
}

function speichern(db, b) {
  if (!b.objekt_id || !/^\d{4}-\d{2}-\d{2}$/.test(b.datum || '') || !/^\d{2}:\d{2}$/.test(b.beginn || '') || !/^\d{2}:\d{2}$/.test(b.ende || '')) throw new Error('Objekt, Datum, Beginn und Ende prüfen (HH:MM)');
  if (b.beginn === b.ende) throw new Error('Beginn und Ende sind gleich');
  const f = [b.mitarbeiter_id ? Number(b.mitarbeiter_id) : null, Number(b.objekt_id), b.datum, b.beginn, b.ende, Math.max(0, Number(b.pause_min) || 0), b.status || 'geplant', b.notiz || null];
  if (b.id) { db.prepare('UPDATE schicht SET mitarbeiter_id=?, objekt_id=?, datum=?, beginn=?, ende=?, pause_min=?, status=?, notiz=? WHERE id=?').run(...f, Number(b.id)); return [Number(b.id)]; }
  const ids = [], bis = /^\d{4}-\d{2}-\d{2}$/.test(b.wiederholen_bis || '') ? b.wiederholen_bis : b.datum;
  const serie = bis > b.datum ? 'S' + Date.now().toString(36) : null;
  const tage = Array.isArray(b.wochentage) && b.wochentage.length ? b.wochentage.map(Number) : null;
  for (let d = b.datum; d <= bis; d = plusTag(d, 1)) {
    const wt = new Date(d + 'T12:00:00Z').getUTCDay();
    if (tage ? tage.indexOf(wt) < 0 : (serie && wt !== new Date(b.datum + 'T12:00:00Z').getUTCDay())) continue;
    f[2] = d; ids.push(Number(db.prepare('INSERT INTO schicht (mitarbeiter_id, objekt_id, datum, beginn, ende, pause_min, status, notiz, serie) VALUES (?,?,?,?,?,?,?,?,?)').run(...f, serie).lastInsertRowid));
  }
  return ids;
}

function vorwocheKopieren(db, montag) {
  const alt = schichtenZeitraum(db, plusTag(montag, -7), plusTag(montag, -1));
  const da = db.prepare('SELECT COUNT(*) n FROM schicht WHERE datum BETWEEN ? AND ?').get(montag, plusTag(montag, 6)).n;
  if (da) throw new Error('In dieser Woche stehen schon ' + da + ' Schichten — Kopieren nur in eine leere Woche.');
  alt.forEach(function (s) { db.prepare("INSERT INTO schicht (mitarbeiter_id, objekt_id, datum, beginn, ende, pause_min, status, notiz) VALUES (?,?,?,?,?,?,'geplant',?)").run(s.mitarbeiter_id, s.objekt_id, plusTag(s.datum, 7), s.beginn, s.ende, s.pause_min, s.notiz); });
  return alt.length;
}

// Minuten einer Zeitspanne aufteilen: Nacht (20–6 Uhr, einstellbar), Sonntag, Feiertag — für die Zuschlags-Lohnarten
function aufteilen(startIso, endeIso, pause, land, nachtVon, nachtBis) {
  const nv = minuten(nachtVon || '20:00'), nb = minuten(nachtBis || '06:00');
  let t = new Date(startIso.replace(' ', 'T') + 'Z').getTime(); const ende = new Date(endeIso.replace(' ', 'T') + 'Z').getTime();
  const e = { gesamt: 0, nacht: 0, sonntag: 0, feiertag: 0 };
  for (; t < ende; t += 60000) {
    const d = new Date(t), tag = d.toISOString().slice(0, 10), m = d.getUTCHours() * 60 + d.getUTCMinutes();
    e.gesamt++; if (nv > nb ? (m >= nv || m < nb) : (m >= nv && m < nb)) e.nacht++;
    if (F.istFeiertag(tag, land)) e.feiertag++; else if (d.getUTCDay() === 0) e.sonntag++;
  }
  const p = Math.min(Number(pause) || 0, e.gesamt); e.gesamt -= p;   // Pause vom Grundlohn, Zuschlagsminuten bleiben (Pausen liegen i. d. R. tagsüber)
  return e;
}

// Stunden je Mitarbeiter im Zeitraum: Ist aus Stempelzeiten; Schichten ohne Stempelung zählen als „nur Plan"
function stunden(db, von, bis) {
  const e = DB.einstellungen(db);
  const ma = db.prepare('SELECT id, name, personalnummer, minijob FROM mitarbeiter ORDER BY name').all();
  return ma.map(function (m) {
    const s = { gesamt: 0, nacht: 0, sonntag: 0, feiertag: 0 }, plan = { gesamt: 0 };
    const zb = db.prepare("SELECT z.*, o.bundesland FROM zeitbuchung z LEFT JOIN objekt o ON o.id = z.objekt_id WHERE z.mitarbeiter_id = ? AND z.gehen IS NOT NULL AND substr(z.kommen,1,10) BETWEEN ? AND ?").all(m.id, von, bis);
    zb.forEach(function (z) { const a = aufteilen(z.kommen, z.gehen, z.pause_min, z.bundesland || 'SH', e.zuschlag_nacht_von, e.zuschlag_nacht_bis); Object.keys(s).forEach(function (k) { s[k] += a[k]; }); });
    const gestempelt = new Set(zb.map(function (z) { return z.kommen.slice(0, 10) + '|' + z.objekt_id; }));
    schichtenZeitraum(db, von, bis, m.id).forEach(function (x) { if (!gestempelt.has(x.datum + '|' + x.objekt_id)) plan.gesamt += dauer(x.beginn, x.ende, x.pause_min); });
    const h = v => Math.round(v / 60 * 100) / 100;
    return { id: m.id, name: m.name, personalnummer: m.personalnummer || '', minijob: !!m.minijob, ist: { stunden: h(s.gesamt), nacht: h(s.nacht), sonntag: h(s.sonntag), feiertag: h(s.feiertag) }, nurPlanStunden: h(plan.gesamt), buchungen: zb.length };
  }).filter(function (x) { return x.buchungen || x.nurPlanStunden; });
}

// DATEV-Bewegungsdaten (Stunden je Lohnart) als Semikolon-Datei für den Import beim Lohnbüro
function datev(db, monat) {
  const e = DB.einstellungen(db);
  const von = monat + '-01', bis = monat + '-' + String(new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');
  const s = stunden(db, von, bis);
  const fehlend = s.filter(function (x) { return !x.personalnummer; }).map(function (x) { return x.name; });
  const zeilen = ['Beraternummer;Mandantennummer;Abrechnungsmonat;Personalnummer;Name;Lohnart;Stunden'];
  s.forEach(function (x) {
    [[e.lohnart_stunden, x.ist.stunden], [e.lohnart_nacht, x.ist.nacht], [e.lohnart_sonntag, x.ist.sonntag], [e.lohnart_feiertag, x.ist.feiertag]].forEach(function (l) {
      if (l[1] > 0) zeilen.push([e.datev_berater_nr || '', e.datev_mandant_nr || '', monat.slice(5, 7) + '/' + monat.slice(0, 4), x.personalnummer, x.name, l[0], l[1].toFixed(2).replace('.', ',')].join(';'));
    });
  });
  return { datei: '﻿' + zeilen.join('\r\n'), fehlendePersonalnummer: fehlend, nurPlan: s.filter(function (x) { return x.nurPlanStunden; }).map(function (x) { return x.name + ' (' + x.nurPlanStunden + ' Std. nur geplant, nicht gestempelt)'; }), von: von, bis: bis };
}

module.exports = { woche, speichern, vorwocheKopieren, stunden, datev, konflikte, schichtenZeitraum, dauer, aufteilen, hhmm };
