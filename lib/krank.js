// krank.js — Selbst-Krankmeldung in der App mit automatischer Nachbesetzung (CleaningOS-Abgleich 18.11.2026, Baustein 3).
// CleaningOS hat das nur beworben („Krankmeldung um 6:15 Uhr und die passende Nachbesetzung"), gebaut war es dort nicht.
// Ablauf hier:
//   1. Die Kraft tippt „Ich bin krank" (Zeitraum, keine Diagnose) → Abwesenheit „krank" wird eingetragen.
//   2. Für jeden betroffenen Einsatz (Schicht oder Reinigungstag im Stammteam) fragt Glanzwerk sofort bis zu drei
//      Vertretungen an (Vorschläge wie bisher: nicht abwesend, nicht schon dort eingeteilt, Minijob-Grenze frei) —
//      per Push aufs Handy. Die erste Zusage gewinnt (wie bisher in der App).
//   3. Die Objektleitung bekommt eine Nachricht im Kanal „Objektleitung" und — wenn sie die App mit Push nutzt — aufs Handy.
//   4. Eskalation: Steht zur Alarmzeit des Objekts (Objektakte, Standard 10:00) noch kein Ersatz bzw. niemand im Objekt,
//      meldet die Automatik das einmal je Objekt und Tag an die Objektleitung (Kanal + Push).
'use strict';
const PLAN = require('./plan');
const EINS = require('./einsatz');
const P = require('./push');

const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const heuteIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const de = d => d.slice(8, 10) + '.' + d.slice(5, 7) + '.';

function tabellen(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS alarm_meldung (datum TEXT NOT NULL, objekt_id INTEGER NOT NULL, alarm TEXT NOT NULL, zeit TEXT DEFAULT (datetime('now','localtime')), PRIMARY KEY (datum, objekt_id, alarm))`);
}

// Welche Einsätze hat die Kraft im Zeitraum? Schichten (nicht abgesagt) und Stammteam-Objekte mit fälligen Aufgaben
function einsaetze(db, mid, von, bis) {
  const aus = [], schon = new Set();
  for (let d = von; d <= bis; d = plus(d, 1)) {
    db.prepare("SELECT s.objekt_id, s.beginn, s.ende, o.name FROM schicht s JOIN objekt o ON o.id = s.objekt_id WHERE s.mitarbeiter_id = ? AND s.datum = ? AND s.status <> 'abgesagt' ORDER BY s.beginn").all(mid, d)
      .forEach(function (s) { const k = d + '|' + s.objekt_id; if (!schon.has(k)) { schon.add(k); aus.push({ datum: d, objekt_id: s.objekt_id, objekt: s.name, zeit: s.beginn + '–' + s.ende }); } });
    PLAN.tag(db, d, { mitarbeiter: mid }).objekte.forEach(function (o) { const k = d + '|' + o.id; if (!schon.has(k) && o.soll) { schon.add(k); aus.push({ datum: d, objekt_id: o.id, objekt: o.name, zeit: null }); } });
  }
  return aus;
}

function objektleitung(db, oid) { const o = db.prepare('SELECT objektleitung_id FROM objekt WHERE id = ?').get(Number(oid)); return o && o.objektleitung_id ? db.prepare('SELECT id, name FROM mitarbeiter WHERE id = ? AND aktiv = 1').get(o.objektleitung_id) : null; }
function kanal(db, text) { try { require('./kommunikation').systemNachricht(db, 'objektleitung', text); } catch (e) { console.error('Kanal Objektleitung:', e.message); } }

// Kraft meldet sich krank. Gibt zurück, welche Einsätze betroffen sind und wer angefragt wurde.
function melden(db, ma, von, bis) {
  const h = heuteIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(von || '') || !/^\d{4}-\d{2}-\d{2}$/.test(bis || '')) throw new Error('Bitte „von" und „bis" angeben.');
  if (bis < von) throw new Error('„bis" liegt vor „von".');
  if (von < plus(h, -1)) throw new Error('Krankmeldungen für zurückliegende Tage bitte im Büro melden.');
  if (bis > plus(von, 42)) throw new Error('Bitte höchstens sechs Wochen auf einmal melden.');
  const doppelt = db.prepare("SELECT * FROM abwesenheit WHERE mitarbeiter_id = ? AND art = 'krank' AND von <= ? AND bis >= ?").get(ma.id, bis, von);
  if (doppelt) { db.prepare('UPDATE abwesenheit SET von = MIN(von, ?), bis = MAX(bis, ?) WHERE id = ?').run(von, bis, doppelt.id); }
  else db.prepare("INSERT INTO abwesenheit (mitarbeiter_id, von, bis, art, notiz) VALUES (?,?,?,'krank','selbst in der App gemeldet')").run(ma.id, von, bis);
  const betroffen = einsaetze(db, ma.id, von, bis).map(function (e) {
    if (db.prepare("SELECT 1 FROM vertretung WHERE objekt_id = ? AND datum = ? AND status = 'zugesagt'").get(e.objekt_id, e.datum)) return Object.assign(e, { angefragt: [], schonBesetzt: true });
    const v = EINS.vorschlaege(db, e.objekt_id, e.datum).filter(function (x) { return x.id !== ma.id; }).slice(0, 3);
    v.forEach(function (x) {
      const neu = db.prepare('INSERT OR IGNORE INTO vertretung (objekt_id, datum, fuer_id, mitarbeiter_id) VALUES (?,?,?,?)').run(e.objekt_id, e.datum, ma.id, x.id).changes;
      if (neu) P.nebenbei(db, x.id, { titel: 'Vertretung gesucht', text: e.objekt + ' am ' + de(e.datum) + (e.zeit ? ', ' + e.zeit + ' Uhr' : '') + ' — kannst du einspringen?', url: '/app' });
    });
    return Object.assign(e, { angefragt: v.map(function (x) { return x.name; }) });
  });
  const text = ma.name + ' hat sich krank gemeldet (' + de(von) + (bis !== von ? '–' + de(bis) : '') + '). ' + (betroffen.length ? betroffen.map(function (e) { return e.objekt + ' ' + de(e.datum) + (e.schonBesetzt ? ': schon besetzt' : e.angefragt.length ? ': angefragt ' + e.angefragt.join(', ') : ': niemand frei — bitte selbst besetzen'); }).join(' · ') : 'Keine Einsätze im Zeitraum.');
  kanal(db, text);
  const leitungen = new Set(); betroffen.forEach(function (e) { const l = objektleitung(db, e.objekt_id); if (l && l.id !== ma.id) leitungen.add(l.id); });
  leitungen.forEach(function (lid) { P.nebenbei(db, lid, { titel: 'Krankmeldung', text: text.slice(0, 220), url: '/app' }); });
  return { betroffen: betroffen };
}

// Automatik (alle 10 Minuten): Alarme des Tages einmal je Objekt an die Objektleitung
function eskalieren(db, jetzt) {
  jetzt = jetzt || new Date();
  const d = new Date(jetzt.getTime() - jetzt.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const minuten = jetzt.getHours() * 60 + jetzt.getMinutes();
  const gemeldet = [];
  if (minuten < 6 * 60) return gemeldet;   // nachts niemanden wecken
  // „Vertretung nötig" erst 90 Minuten vor der Alarmzeit melden — vorher läuft die automatische Anfrage noch
  EINS.lage(db, d, minuten).filter(function (l) { return l.alarm && l.alarm !== 'Niemand eingeteilt' && (!/Vertretung/.test(l.alarm) || minuten >= l.alarmMinuten - 90); }).forEach(function (l) {
    if (!db.prepare('INSERT OR IGNORE INTO alarm_meldung (datum, objekt_id, alarm) VALUES (?,?,?)').run(d, l.id, l.alarm).changes) return;
    const text = 'Alarm ' + l.name + ': ' + l.alarm + '.';
    kanal(db, text); const lt = objektleitung(db, l.id); if (lt) P.nebenbei(db, lt.id, { titel: 'Alarm ' + l.name, text: l.alarm, url: '/app' });
    gemeldet.push({ objekt: l.name, alarm: l.alarm });
  });
  return gemeldet;
}

module.exports = { tabellen, einsaetze, melden, eskalieren };
