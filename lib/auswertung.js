// auswertung.js — Objektauswertung und Controlling: je Objekt und Zeitraum Umsatz (netto, abgerechnet), Soll-Stunden
// (Kalkulation), Ist-Stunden (Zeiterfassung), Lohnkosten (Ist-Stunden × Stundenlohn laut Mitarbeiter oder Tarif ×
// Lohnnebenkosten), Deckungsbeitrag, erzielter Stundensatz, Qualität (Prüfungen) und Mängel — dazu der Monatsverlauf.
//
// Grenzen (ehrlich): Material, Fahrzeuge und Gemeinkosten stehen nicht im System — der Deckungsbeitrag ist ein DB I
// (Umsatz − Lohn). Umsatz zählt nach Leistungszeitraum der Rechnung (Beginn im Zeitraum), Stornos mindern.
'use strict';
const DB = require('./db');
const KALK = require('./kalkulation');

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const tage = (von, bis) => Math.round((new Date(bis + 'T12:00:00Z') - new Date(von + 'T12:00:00Z')) / 86400000) + 1;

function monatsliste(von, bis) {
  const aus = []; let m = von.slice(0, 7);
  while (m <= bis.slice(0, 7)) { aus.push(m); const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); m = d.toISOString().slice(0, 7); }
  return aus;
}

// Werte eines Objekts im Zeitraum (sollMonat: Soll-Stunden je Monat aus der Kalkulation, vorab einmal berechnet)
function werte(db, o, von, bis, sollMonat, lnk) {
  const umsatz = r2(db.prepare(`SELECT COALESCE(SUM(p.betrag),0) s FROM rechnung_position p JOIN rechnung r ON r.id = p.rechnung_id
      WHERE r.nummer IS NOT NULL AND r.zeitraum_von BETWEEN ? AND ? AND (p.objekt_id = ? OR (p.objekt_id IS NULL AND r.objekt_id = ?))`).get(von, bis, o.id, o.id).s);
  let minuten = 0, lohn = 0;
  db.prepare("SELECT z.kommen, z.gehen, z.pause_min, m.stundenlohn, m.lohngruppe FROM zeitbuchung z JOIN mitarbeiter m ON m.id = z.mitarbeiter_id WHERE z.objekt_id = ? AND z.gehen IS NOT NULL AND substr(z.kommen,1,10) BETWEEN ? AND ?").all(o.id, von, bis).forEach(function (z) {
    const min = Math.max(0, (new Date(z.gehen.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 60000 - (z.pause_min || 0));
    const satz = z.stundenlohn || (DB.tarifFuer(db, z.lohngruppe, z.kommen.slice(0, 10)) || {}).stundenlohn || 0;
    minuten += min; lohn += min / 60 * satz * (1 + lnk / 100);
  });
  // Soll nur für die Tage, an denen das Objekt lief: ab Vertragsbeginn (sonst Anlage im System) bis Vertragsende
  const start = [von, o.vertragsbeginn || String(o.angelegt_am || '').slice(0, 10)].filter(Boolean).sort().pop(), ende = [bis, o.vertragsende].filter(Boolean).sort()[0];
  const ist = r2(minuten / 60), soll = sollMonat == null ? null : (start > ende ? 0 : r2(sollMonat * tage(start, ende) / (365 / 12)));
  const pr = db.prepare('SELECT AVG(ergebnis) a, COUNT(*) n FROM pruefung WHERE objekt_id = ? AND ergebnis IS NOT NULL AND datum BETWEEN ? AND ?').get(o.id, von, bis);
  const db1 = r2(umsatz - lohn);
  return { umsatz: umsatz, lohnkosten: r2(lohn), db: db1, dbProzent: umsatz ? Math.round(db1 / umsatz * 1000) / 10 : null, istStunden: ist, sollStunden: soll,
    abweichungProzent: soll ? Math.round((ist - soll) / soll * 1000) / 10 : null, stundensatz: ist ? r2(umsatz / ist) : null,
    qualitaet: pr.n ? Math.round(pr.a * 10) / 10 : null, pruefungen: pr.n,
    maengel: db.prepare('SELECT COUNT(*) n FROM mangel WHERE objekt_id = ? AND substr(gemeldet_am,1,10) BETWEEN ? AND ?').get(o.id, von, bis).n,
    erledigungen: db.prepare('SELECT COUNT(*) n FROM erledigung e JOIN lv_position p ON p.id = e.position_id WHERE p.objekt_id = ? AND e.datum BETWEEN ? AND ?').get(o.id, von, bis).n };
}
function sollMonat(db, id) { try { const k = KALK.objekt(db, id); return k && k.ergebnis ? k.ergebnis.stundenMonat : null; } catch (e) { return null; } }

function objekte(db, von, bis) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(von || '') || !/^\d{4}-\d{2}-\d{2}$/.test(bis || '') || bis < von) throw new Error('Zeitraum von/bis prüfen');
  const lnk = Number(String(DB.einstellungen(db).lohnnebenkosten_prozent || 0).replace(',', '.')) || 0;
  const l = db.prepare("SELECT o.*, k.name kunde FROM objekt o LEFT JOIN kunde k ON k.id = o.kunde_id ORDER BY o.status = 'aktiv' DESC, o.name").all().map(function (o) {
    return Object.assign({ id: o.id, name: o.name, kunde: o.kunde, status: o.status, objektnummer: o.objektnummer, monatspreis: o.monatspreis }, werte(db, o, von, bis, sollMonat(db, o.id), lnk));
  }).filter(function (x) { return x.status === 'aktiv' || x.umsatz || x.istStunden; });
  const s = { umsatz: 0, lohnkosten: 0, istStunden: 0, sollStunden: 0, maengel: 0 };
  l.forEach(function (x) { s.umsatz += x.umsatz; s.lohnkosten += x.lohnkosten; s.istStunden += x.istStunden; s.sollStunden += x.sollStunden || 0; s.maengel += x.maengel; });
  Object.keys(s).forEach(function (k) { s[k] = r2(s[k]); });
  s.db = r2(s.umsatz - s.lohnkosten); s.dbProzent = s.umsatz ? Math.round(s.db / s.umsatz * 1000) / 10 : null; s.stundensatz = s.istStunden ? r2(s.umsatz / s.istStunden) : null;
  return { von: von, bis: bis, lohnnebenkostenProzent: lnk, objekte: l, summe: s };
}
// Monatsverlauf eines Objekts (letzte n Monate bis einschließlich laufendem Monat)
function verlauf(db, id, n) {
  const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(id)); if (!o) throw new Error('Objekt nicht gefunden');
  const lnk = Number(String(DB.einstellungen(db).lohnnebenkosten_prozent || 0).replace(',', '.')) || 0, sm = sollMonat(db, o.id);
  const jetzt = new Date(); const bis = new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), 15)); const start = new Date(bis); start.setUTCMonth(start.getUTCMonth() - ((n || 12) - 1));
  return monatsliste(start.toISOString().slice(0, 10), bis.toISOString().slice(0, 10)).map(function (m) {
    const ende = m + '-' + String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');
    return Object.assign({ monat: m }, werte(db, o, m + '-01', ende, sm, lnk));
  });
}
// Monatsreihe über alle Objekte (Controlling)
function monate(db, n) {
  const lnk = Number(String(DB.einstellungen(db).lohnnebenkosten_prozent || 0).replace(',', '.')) || 0;
  const ob = db.prepare('SELECT * FROM objekt').all();
  const jetzt = new Date(); const bis = new Date(Date.UTC(jetzt.getFullYear(), jetzt.getMonth(), 15)); const start = new Date(bis); start.setUTCMonth(start.getUTCMonth() - ((n || 12) - 1));
  return monatsliste(start.toISOString().slice(0, 10), bis.toISOString().slice(0, 10)).map(function (m) {
    const ende = m + '-' + String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');
    const s = { monat: m, umsatz: 0, lohnkosten: 0, istStunden: 0 };
    ob.forEach(function (o) { const w = werte(db, o, m + '-01', ende, null, lnk); s.umsatz += w.umsatz; s.lohnkosten += w.lohnkosten; s.istStunden += w.istStunden; });
    s.umsatz = r2(s.umsatz); s.lohnkosten = r2(s.lohnkosten); s.istStunden = r2(s.istStunden); s.db = r2(s.umsatz - s.lohnkosten);
    s.zahlungseingang = r2(db.prepare("SELECT COALESCE(SUM(betrag),0) s FROM zahlung WHERE art <> 'ausbuchung' AND substr(datum,1,7) = ?").get(m).s);
    return s;
  });
}

module.exports = { objekte, verlauf, monate, werte };
