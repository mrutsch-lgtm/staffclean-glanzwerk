// einsatz.js — Einsatzplan: wer ist wo, Minijob-Grenze, Abwesenheit, Vertretung, Nicht-erschienen-Alarm.
'use strict';
const DB = require('./db');
const PLAN = require('./plan');
const KALK = require('./kalkulation');

function abwesend(db, mitarbeiterId, datum) {
  return db.prepare('SELECT * FROM abwesenheit WHERE mitarbeiter_id = ? AND von <= ? AND bis >= ?').get(Number(mitarbeiterId), datum, datum) || null;
}

// Monatliche Soll-Stunden je Mitarbeiter: Objektstunden gleichmäßig auf die eingeteilten Kräfte verteilt
function auslastung(db) {
  const e = DB.einstellungen(db), grenze = Number(e.minijob_grenze_eur) || 603;
  const ma = db.prepare('SELECT * FROM mitarbeiter WHERE aktiv = 1 ORDER BY name').all();
  const objStunden = {};
  db.prepare("SELECT id FROM objekt WHERE status = 'aktiv'").all().forEach(function (o) { const k = KALK.objekt(db, o.id); objStunden[o.id] = k ? k.ergebnis.stundenMonat : 0; });
  return ma.map(function (m) {
    const objekte = db.prepare('SELECT e.objekt_id, o.name, (SELECT COUNT(*) FROM einsatz x WHERE x.objekt_id = e.objekt_id) kraefte FROM einsatz e JOIN objekt o ON o.id = e.objekt_id WHERE e.mitarbeiter_id = ?').all(m.id);
    const stunden = objekte.reduce(function (a, o) { return a + (objStunden[o.objekt_id] || 0) / Math.max(1, o.kraefte); }, 0);
    const tarif = DB.tarifFuer(db, m.lohngruppe || 'LG 1', new Date().toISOString().slice(0, 10));
    const lohn = m.stundenlohn || (tarif ? tarif.stundenlohn : 15);
    const verdienst = Math.round(stunden * lohn * 100) / 100;
    const maxStunden = Math.floor(grenze / lohn * 10) / 10;
    return { id: m.id, name: m.name, minijob: !!m.minijob, lohngruppe: m.lohngruppe, lohn: lohn, objekte: objekte.map(function (o) { return o.name; }),
             stundenMonat: Math.round(stunden * 10) / 10, verdienstMonat: verdienst, minijobGrenze: grenze, minijobMaxStunden: maxStunden,
             ueberGrenze: !!m.minijob && verdienst > grenze };
  });
}

// Lage eines Tages: je Objekt mit Aufgaben — wer sollte kommen, wer ist abwesend, wer hat gestempelt, Alarm
function lage(db, datum, jetztMinuten) {
  const t = PLAN.tag(db, datum);
  const alarmNach = 10 * 60;   // ohne Kommen-Buchung bis 10:00 gilt: nicht erschienen (einstellbar später je Objekt)
  return t.objekte.map(function (o) {
    const kraefte = db.prepare('SELECT m.id, m.name FROM einsatz e JOIN mitarbeiter m ON m.id = e.mitarbeiter_id WHERE e.objekt_id = ? AND m.aktiv = 1').all(o.id)
      .map(function (m) {
        const ab = abwesend(db, m.id, datum);
        const zb = db.prepare("SELECT kommen, gehen FROM zeitbuchung WHERE mitarbeiter_id = ? AND objekt_id = ? AND substr(kommen,1,10) = ? ORDER BY id DESC LIMIT 1").get(m.id, o.id, datum);
        return { id: m.id, name: m.name, abwesend: ab ? ab.art : null, kommen: zb ? zb.kommen.slice(11, 16) : null, gehen: zb && zb.gehen ? zb.gehen.slice(11, 16) : null };
      });
    const vertretungen = db.prepare('SELECT v.*, m.name FROM vertretung v LEFT JOIN mitarbeiter m ON m.id = v.mitarbeiter_id WHERE v.objekt_id = ? AND v.datum = ?').all(o.id, datum);
    const anwesendMoeglich = kraefte.filter(function (k) { return !k.abwesend; }).length + vertretungen.filter(function (v) { return v.status === 'zugesagt'; }).length;
    const irgendwerDa = kraefte.some(function (k) { return k.kommen; }) || o.fertig > 0;
    let alarm = null;
    if (!kraefte.length) alarm = 'Niemand eingeteilt';
    else if (!anwesendMoeglich) alarm = 'Alle eingeteilten Kräfte abwesend — Vertretung nötig';
    else if (jetztMinuten != null && jetztMinuten >= alarmNach && !irgendwerDa) alarm = 'Bis 10:00 niemand erschienen';
    return { id: o.id, name: o.name, soll: o.soll, fertig: o.fertig, kraefte: kraefte, vertretungen: vertretungen, alarm: alarm };
  });
}

// Vertretung vorschlagen: aktive Kräfte, nicht abwesend, nicht schon eingeteilt, Minijob mit Luft zuerst nach Auslastung
function vorschlaege(db, objektId, datum) {
  const drin = db.prepare('SELECT mitarbeiter_id FROM einsatz WHERE objekt_id = ?').all(Number(objektId)).map(function (x) { return x.mitarbeiter_id; });
  const aus = auslastung(db);
  return aus.filter(function (m) { return drin.indexOf(m.id) < 0 && !abwesend(db, m.id, datum) && !m.ueberGrenze; })
    .sort(function (a, b) { return a.stundenMonat - b.stundenMonat; }).slice(0, 5);
}

module.exports = { abwesend, auslastung, lage, vorschlaege };
