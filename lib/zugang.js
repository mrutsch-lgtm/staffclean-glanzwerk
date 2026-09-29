// zugang.js — Anmeldung für Büro, Mitarbeiter und Kunden.
//
// Drei Rollen:
//   buero        E-Mail + Passwort, darf alles
//   kunde        E-Mail + Passwort, sieht nur die eigenen Objekte (Kundenportal)
//   mitarbeiter  Name + PIN in der App, sieht nur die eigenen Einsätze
// Passwörter und PINs werden nur als scrypt-Hash gespeichert. Das erste Büro-Konto legt Manuel selbst an
// (Seite /einrichten, nur solange es noch kein Konto gibt und nur vom Rechner selbst) — es steht nie ein
// Passwort in einer Datei.
'use strict';
const crypto = require('crypto');

const SITZUNG_TAGE = { buero: 14, kunde: 30, mitarbeiter: 30 };

function tabellen(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS benutzer (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, pw TEXT NOT NULL,
      rolle TEXT NOT NULL CHECK (rolle IN ('buero','kunde')), kunde_id INTEGER REFERENCES kunde(id), aktiv INTEGER DEFAULT 1,
      angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS sitzung (
      token TEXT PRIMARY KEY, rolle TEXT NOT NULL, benutzer_id INTEGER, mitarbeiter_id INTEGER,
      ablauf TEXT NOT NULL, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS anmeldeversuch (schluessel TEXT NOT NULL, zeit INTEGER NOT NULL);
  `);
}

function hash(geheim) {
  const salz = crypto.randomBytes(16);
  return 'scrypt$' + salz.toString('hex') + '$' + crypto.scryptSync(String(geheim), salz, 32).toString('hex');
}
function pruefen(geheim, gespeichert) {
  const [art, salz, wert] = String(gespeichert || '').split('$');
  if (art !== 'scrypt' || !salz || !wert) return false;
  const soll = Buffer.from(wert, 'hex'), ist = crypto.scryptSync(String(geheim), Buffer.from(salz, 'hex'), soll.length);
  return crypto.timingSafeEqual(soll, ist);
}

// Bremse gegen Raten: höchstens 8 Fehlversuche je Schlüssel (IP + Konto) in 15 Minuten
function gebremst(db, schluessel) {
  const seit = Date.now() - 15 * 60000;
  db.prepare('DELETE FROM anmeldeversuch WHERE zeit < ?').run(seit);
  return db.prepare('SELECT COUNT(*) n FROM anmeldeversuch WHERE schluessel = ?').get(schluessel).n >= 8;
}
function fehlversuch(db, schluessel) { db.prepare('INSERT INTO anmeldeversuch (schluessel, zeit) VALUES (?, ?)').run(schluessel, Date.now()); }

function sitzungAnlegen(db, rolle, benutzerId, mitarbeiterId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ablauf = new Date(Date.now() + SITZUNG_TAGE[rolle] * 86400000).toISOString();
  db.prepare('INSERT INTO sitzung (token, rolle, benutzer_id, mitarbeiter_id, ablauf) VALUES (?,?,?,?,?)').run(token, rolle, benutzerId || null, mitarbeiterId || null, ablauf);
  return { token: token, ablauf: ablauf, tage: SITZUNG_TAGE[rolle] };
}

function wer(db, req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)gw=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const s = db.prepare('SELECT * FROM sitzung WHERE token = ?').get(m[1]);
  if (!s || s.ablauf < new Date().toISOString()) return null;
  if (s.rolle === 'mitarbeiter') {
    const ma = db.prepare('SELECT id, name, sprache FROM mitarbeiter WHERE id = ? AND aktiv = 1').get(s.mitarbeiter_id);
    return ma ? { rolle: 'mitarbeiter', token: s.token, mitarbeiter: ma, name: ma.name } : null;
  }
  const b = db.prepare('SELECT id, name, email, rolle, kunde_id, berechtigung, sonderrechte, mitarbeiter_id FROM benutzer WHERE id = ? AND aktiv = 1').get(s.benutzer_id);
  return b ? { rolle: b.rolle, token: s.token, benutzer: b, name: b.name, kunde_id: b.kunde_id } : null;
}

function keks(token, tage, sicher) {
  return 'gw=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (tage * 86400) + (sicher ? '; Secure' : '');
}
const keksWeg = 'gw=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

function kontoAnlegen(db, d) {
  const email = String(d.email || '').trim().toLowerCase(), name = String(d.name || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new Error('E-Mail-Adresse prüfen');
  if (!name) throw new Error('Name fehlt');
  if (String(d.passwort || '').length < 10) throw new Error('Das Passwort braucht mindestens 10 Zeichen');
  if (!['buero', 'kunde'].includes(d.rolle)) throw new Error('Rolle unbekannt');
  if (d.rolle === 'kunde' && !d.kunde_id) throw new Error('Für ein Kunden-Konto den Kunden wählen');
  const berechtigung = d.rolle === 'buero' ? (d.berechtigung || 'admin') : null;
  return Number(db.prepare('INSERT INTO benutzer (name, email, pw, rolle, kunde_id, berechtigung, sonderrechte, mitarbeiter_id) VALUES (?,?,?,?,?,?,?,?)').run(name, email, hash(d.passwort), d.rolle, d.kunde_id || null, berechtigung, JSON.stringify(d.sonderrechte || {}), d.mitarbeiter_id || null).lastInsertRowid);
}

module.exports = { tabellen, hash, pruefen, gebremst, fehlversuch, sitzungAnlegen, wer, keks, keksWeg, kontoAnlegen };
