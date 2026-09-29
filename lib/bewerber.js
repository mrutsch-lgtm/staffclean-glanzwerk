// bewerber.js — Bewerbermanagement: vom ersten Kontakt bis zur Einstellung.
// Ablauf: neu → Kontakt → Gespräch → Probearbeit → Zusage → eingestellt (oder Absage). Beim Einstellen entsteht der
// Mitarbeiter mit Personalakte (Name, Kontakt, Anschrift, Beschäftigungsart, Tätigkeit, Eintritt), die Bewerbungsunterlagen
// wandern in die Personalakte. Datenschutz: Nach einer Absage werden die Daten spätestens 6 Monate später gelöscht
// (Frist für Ansprüche nach § 15 Abs. 4 AGG plus Klagefrist; Art. 17 DSGVO) — länger nur mit Einwilligung (Talentpool).
'use strict';
const P = require('./personal');

const STATUS = [['neu', 'Neu eingegangen'], ['kontakt', 'Kontakt aufgenommen'], ['gespraech', 'Gespräch'], ['probe', 'Probearbeit'], ['zusage', 'Zusage'], ['eingestellt', 'Eingestellt'], ['absage', 'Absage']];
const QUELLEN = [['', '—'], ['empfehlung', 'Empfehlung / Mitarbeiter'], ['website', 'Website'], ['indeed', 'Jobbörse (Indeed, Stepstone …)'], ['kleinanzeigen', 'Kleinanzeigen'], ['arbeitsagentur', 'Agentur für Arbeit / Jobcenter'], ['aushang', 'Aushang / Zeitung'], ['social', 'Social Media'], ['initiativ', 'Initiativbewerbung'], ['sonstiges', 'sonstiges']];
const FELDER = ['vorname', 'nachname', 'telefon', 'email', 'strasse', 'plz', 'ort', 'position', 'beschaeftigungsart', 'stunden_wunsch', 'verfuegbar_ab', 'quelle', 'einsatzgebiet', 'sprachen', 'fuehrerschein', 'staatsangehoerigkeit', 'arbeitserlaubnis', 'bewertung', 'termin', 'notiz', 'talentpool'];
const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plusMonate = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };

function tabellen(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bewerber (
      id INTEGER PRIMARY KEY, vorname TEXT, nachname TEXT NOT NULL, telefon TEXT, email TEXT, strasse TEXT, plz TEXT, ort TEXT,
      position TEXT, beschaeftigungsart TEXT, stunden_wunsch REAL, verfuegbar_ab TEXT, quelle TEXT, einsatzgebiet TEXT, sprachen TEXT, fuehrerschein TEXT,
      staatsangehoerigkeit TEXT, arbeitserlaubnis TEXT, bewertung INTEGER, termin TEXT, notiz TEXT, talentpool INTEGER DEFAULT 0,
      status TEXT DEFAULT 'neu', absage_am TEXT, absage_grund TEXT, loeschen_ab TEXT, mitarbeiter_id INTEGER, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS bewerber_verlauf (id INTEGER PRIMARY KEY, bewerber_id INTEGER NOT NULL REFERENCES bewerber(id) ON DELETE CASCADE, zeit TEXT DEFAULT (datetime('now','localtime')), von TEXT, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bewerber_dokument (id INTEGER PRIMARY KEY, bewerber_id INTEGER NOT NULL REFERENCES bewerber(id) ON DELETE CASCADE, titel TEXT, datei TEXT NOT NULL, typ TEXT, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
  `);
}
const statusText = s => (STATUS.find(function (x) { return x[0] === s; }) || [s, s])[1];
function verlauf(db, id, von, text) { db.prepare('INSERT INTO bewerber_verlauf (bewerber_id, von, text) VALUES (?,?,?)').run(id, von || null, text); }

function liste(db) {
  return db.prepare('SELECT b.*, (SELECT COUNT(*) FROM bewerber_dokument d WHERE d.bewerber_id = b.id) dokumente FROM bewerber b ORDER BY CASE b.status WHEN \'eingestellt\' THEN 2 WHEN \'absage\' THEN 3 ELSE 1 END, b.termin IS NULL, b.termin, b.id DESC').all()
    .map(function (b) { b.statusText = statusText(b.status); b.loeschfaellig = b.status === 'absage' && !b.talentpool && b.loeschen_ab && b.loeschen_ab <= heute(); return b; });
}
function voll(db, id) {
  const b = db.prepare('SELECT * FROM bewerber WHERE id = ?').get(Number(id)); if (!b) return null;
  b.statusText = statusText(b.status);
  b.verlauf = db.prepare('SELECT * FROM bewerber_verlauf WHERE bewerber_id = ? ORDER BY id DESC').all(b.id);
  b.dokumente = db.prepare('SELECT id, titel, typ, angelegt_am FROM bewerber_dokument WHERE bewerber_id = ? ORDER BY id').all(b.id);
  return b;
}
function speichern(db, b, von) {
  const w = {};
  FELDER.forEach(function (f) { if (f in b) { let v = b[f] == null ? '' : String(b[f]).trim(); w[f] = v === '' ? null : v; } });
  if ('nachname' in w && !w.nachname) throw new Error('Nachname fehlt');
  if (!b.id && !w.nachname) throw new Error('Nachname fehlt');
  if (w.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(w.email)) throw new Error('E-Mail-Adresse prüfen');
  if (w.verfuegbar_ab && !/^\d{4}-\d{2}-\d{2}$/.test(w.verfuegbar_ab)) throw new Error('„verfügbar ab" im Format JJJJ-MM-TT');
  if (w.termin && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(w.termin)) throw new Error('Termin mit Datum (und Uhrzeit)');
  if (w.stunden_wunsch != null) { w.stunden_wunsch = Number(String(w.stunden_wunsch).replace(',', '.')); if (!isFinite(w.stunden_wunsch)) throw new Error('Wunschstunden als Zahl'); }
  if (w.bewertung != null) { w.bewertung = Math.max(0, Math.min(5, Math.round(Number(w.bewertung)) || 0)) || null; }
  if ('talentpool' in w) w.talentpool = (w.talentpool === 'true' || w.talentpool === '1') ? 1 : 0;
  const sp = Object.keys(w);
  if (b.id) {
    const alt = db.prepare('SELECT * FROM bewerber WHERE id = ?').get(Number(b.id)); if (!alt) throw new Error('Bewerber nicht gefunden');
    if (sp.length) db.prepare('UPDATE bewerber SET ' + sp.map(function (s) { return s + ' = ?'; }).join(', ') + ' WHERE id = ?').run(...sp.map(function (s) { return w[s]; }), alt.id);
    if (w.termin && w.termin !== alt.termin) verlauf(db, alt.id, von, 'Termin: ' + w.termin.replace('T', ' ').split(' ')[0].split('-').reverse().join('.') + (w.termin.indexOf('T') > 0 ? ' ' + w.termin.slice(11, 16) + ' Uhr' : ''));
    if ('talentpool' in w && w.talentpool !== alt.talentpool) verlauf(db, alt.id, von, w.talentpool ? 'Einwilligung Talentpool erteilt — Daten bleiben nach Absage erhalten' : 'Einwilligung Talentpool widerrufen');
    return alt.id;
  }
  const id = Number(db.prepare('INSERT INTO bewerber (' + sp.join(', ') + ') VALUES (' + sp.map(function () { return '?'; }).join(',') + ')').run(...sp.map(function (s) { return w[s]; })).lastInsertRowid);
  verlauf(db, id, von, 'Bewerbung erfasst' + (w.quelle ? ' (Quelle: ' + ((QUELLEN.find(function (q) { return q[0] === w.quelle; }) || [0, w.quelle])[1]) + ')' : ''));
  return id;
}
function statusSetzen(db, id, status, grund, von) {
  const b = db.prepare('SELECT * FROM bewerber WHERE id = ?').get(Number(id)); if (!b) throw new Error('Bewerber nicht gefunden');
  if (!STATUS.some(function (s) { return s[0] === status; })) throw new Error('Unbekannter Status');
  if (status === 'eingestellt') throw new Error('Zum Einstellen bitte „Einstellen" verwenden — dabei entsteht die Personalakte.');
  if (b.status === 'eingestellt') throw new Error('Schon eingestellt — weiter in der Personalakte.');
  if (status === 'absage') db.prepare('UPDATE bewerber SET status = ?, absage_am = ?, absage_grund = ?, loeschen_ab = ? WHERE id = ?').run(status, heute(), String(grund || '').trim() || null, plusMonate(heute(), 6), b.id);
  else db.prepare('UPDATE bewerber SET status = ?, absage_am = NULL, absage_grund = NULL, loeschen_ab = NULL WHERE id = ?').run(status, b.id);
  verlauf(db, b.id, von, 'Status: ' + statusText(b.status) + ' → ' + statusText(status) + (status === 'absage' && grund ? ' (' + String(grund).trim() + ')' : '') + (status === 'absage' ? ' · Löschung ab ' + plusMonate(heute(), 6).split('-').reverse().join('.') : ''));
}
// Einstellen: Mitarbeiter mit Personalakte anlegen, Unterlagen übernehmen
function einstellen(db, id, opt, von, pfad) {
  const fs = require('fs'), path = require('path');
  const b = db.prepare('SELECT * FROM bewerber WHERE id = ?').get(Number(id)); if (!b) throw new Error('Bewerber nicht gefunden');
  if (b.status === 'eingestellt') throw new Error('Schon eingestellt.');
  opt = opt || {};
  const eintritt = /^\d{4}-\d{2}-\d{2}$/.test(opt.eintritt || '') ? opt.eintritt : (b.verfuegbar_ab || heute());
  const name = [b.vorname, b.nachname].filter(Boolean).join(' ');
  const mid = Number(db.prepare("INSERT INTO mitarbeiter (name, telefon, sprache, lohngruppe, wochenstunden, minijob) VALUES (?,?,?,?,?,?)").run(name, b.telefon, opt.sprache || 'de', opt.lohngruppe || 'LG 1', b.stunden_wunsch, b.beschaeftigungsart === 'minijob' ? 1 : 0).lastInsertRowid);
  const akte = P.lesen({ vorname: b.vorname, nachname: b.nachname, email: b.email, strasse: b.strasse, plz: b.plz, ort: b.ort, staatsangehoerigkeit: b.staatsangehoerigkeit, beschaeftigungsart: b.beschaeftigungsart, taetigkeit: b.position, fuehrerschein: b.fuehrerschein, eintritt: eintritt,
    arbeitserlaubnis: b.arbeitserlaubnis === 'ja' || b.arbeitserlaubnis === 'eingeschraenkt' || b.arbeitserlaubnis === 'nein' ? b.arbeitserlaubnis : null });
  const sp = Object.keys(akte).filter(function (k) { return akte[k] != null; });
  if (sp.length) db.prepare('UPDATE mitarbeiter SET ' + sp.map(function (s) { return s + ' = ?'; }).join(', ') + ' WHERE id = ?').run(...sp.map(function (s) { return akte[s]; }), mid);
  db.prepare('SELECT * FROM bewerber_dokument WHERE bewerber_id = ?').all(b.id).forEach(function (d) {   // Unterlagen in die Personalakte
    const neu = 'ma' + mid + '-' + path.basename(d.datei);
    try { fs.copyFileSync(path.join(pfad, path.basename(d.datei)), path.join(pfad, neu)); } catch (e) { return; }
    db.prepare("INSERT INTO mitarbeiter_dokument (mitarbeiter_id, art, titel, datei, typ) VALUES (?, 'bewerbung', ?, ?, ?)").run(mid, d.titel || 'Bewerbung', neu, d.typ);
  });
  db.prepare("UPDATE bewerber SET status = 'eingestellt', mitarbeiter_id = ?, loeschen_ab = NULL WHERE id = ?").run(mid, b.id);
  verlauf(db, b.id, von, 'Eingestellt zum ' + eintritt.split('-').reverse().join('.') + ' — Personalakte angelegt');
  return mid;
}
function kennzahlen(db) {
  const z = {}; STATUS.forEach(function (s) { z[s[0]] = 0; });
  db.prepare('SELECT status, COUNT(*) n FROM bewerber GROUP BY status').all().forEach(function (r) { z[r.status] = r.n; });
  const quellen = db.prepare("SELECT COALESCE(quelle,'') quelle, COUNT(*) n, SUM(status = 'eingestellt') eingestellt FROM bewerber GROUP BY quelle ORDER BY n DESC").all()
    .map(function (q) { q.text = (QUELLEN.find(function (x) { return x[0] === q.quelle; }) || [0, q.quelle || 'ohne Angabe'])[1]; if (!q.quelle) q.text = 'ohne Angabe'; return q; });
  return { status: z, quellen: quellen, loeschfaellig: db.prepare("SELECT COUNT(*) n FROM bewerber WHERE status = 'absage' AND talentpool = 0 AND loeschen_ab <= ?").get(heute()).n };
}

module.exports = { STATUS, QUELLEN, tabellen, liste, voll, speichern, statusSetzen, einstellen, kennzahlen, verlauf };
