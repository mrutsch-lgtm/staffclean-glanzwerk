// mail.js — Mailversand aus Glanzwerk (Rechnung, Leistungsnachweis, Prüfbericht) über das StaffClean-Postfach.
// Aus dem CleaningOS-Abgleich 18.11.2026 (Nachbau-Katalog Baustein 7): „Versand nur nach Freigabe durch das Büro,
// Protokoll je Mail, Sperrfrist gegen Doppelversand". Glanzwerk hatte bis dahin gar keinen Mailversand.
//
// Zugang: Server, Absender und Port stehen in den Einstellungen (Standard: smtp.strato.de:465, info@staffclean.de).
// Das PASSWORT steht nie in der Datenbank und nie im Code, nur in der Umgebung des Dienstes: STAFFCLEAN_SMTP_PASS.
// Fehlt es, sagt Glanzwerk das klar („nicht eingerichtet"), statt still nichts zu senden.
// Test/Probe: STAFFCLEAN_MAIL_TEST=1 → nichts verlässt den Rechner, die Mail landet nur im Protokoll (und in M.letzte).
'use strict';
const DB = require('./db');

function tabellen(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS mail_protokoll (
    id INTEGER PRIMARY KEY, zeit TEXT DEFAULT (datetime('now','localtime')), anlass TEXT NOT NULL, bezug_id INTEGER, bezug TEXT,
    an TEXT NOT NULL, cc TEXT, betreff TEXT, anhaenge TEXT, ergebnis TEXT NOT NULL, fehler TEXT, von_name TEXT)`);
  const std = { mail_smtp_host: 'smtp.strato.de', mail_smtp_port: '465', mail_absender: 'info@staffclean.de', mail_absender_name: 'StaffClean GmbH', mail_kopie_an: 'info@staffclean.de' };
  Object.keys(std).forEach(function (k) { db.prepare('INSERT OR IGNORE INTO einstellung (schluessel, wert) VALUES (?, ?)').run(k, std[k]); });
}

const TEST = () => process.env.STAFFCLEAN_MAIL_TEST === '1';
function konfig(db) {
  const e = DB.einstellungen(db);
  return { host: process.env.STAFFCLEAN_SMTP_HOST || e.mail_smtp_host || 'smtp.strato.de', port: Number(process.env.STAFFCLEAN_SMTP_PORT || e.mail_smtp_port || 465),
    absender: (process.env.STAFFCLEAN_SMTP_USER || e.mail_absender || '').trim(), name: e.mail_absender_name || e.firma_name || 'StaffClean GmbH',
    kopie: (e.mail_kopie_an || '').trim(), pass: process.env.STAFFCLEAN_SMTP_PASS || '' };
}
function status(db) {
  const k = konfig(db);
  if (TEST()) return { bereit: true, test: true, absender: k.absender, host: 'Testbetrieb (nichts wird verschickt)' };
  if (!k.absender) return { bereit: false, absender: '', host: k.host, grund: 'Kein Absender eingetragen (Einstellungen → Mailversand).' };
  if (!k.pass) return { bereit: false, absender: k.absender, host: k.host, grund: 'Das Postfach-Passwort ist auf dem Server noch nicht hinterlegt (STAFFCLEAN_SMTP_PASS).' };
  return { bereit: true, absender: k.absender, host: k.host + ':' + k.port };
}

const ADRESSE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
function adressen(text) {
  const l = String(text || '').split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  l.forEach(function (a) { if (!ADRESSE.test(a)) throw new Error('E-Mail-Adresse prüfen: ' + a); });
  return l;
}

// Schon an diesen Empfänger raus? (gleicher Anlass, gleicher Bezug) — Antwort: letzte erfolgreiche Sendung oder null
function schonGesendet(db, anlass, bezugId, bezug) {
  return db.prepare("SELECT * FROM mail_protokoll WHERE anlass = ? AND bezug_id IS ? AND COALESCE(bezug,'') = ? AND ergebnis = 'gesendet' ORDER BY id DESC LIMIT 1").get(anlass, bezugId == null ? null : Number(bezugId), bezug || '') || null;
}

function signatur(db) {
  const e = DB.einstellungen(db);
  return ['', 'Mit freundlichen Grüßen', '', e.firma_name || 'StaffClean GmbH', [e.firma_strasse, [e.firma_plz, e.firma_ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    [e.firma_telefon ? 'Telefon ' + e.firma_telefon : '', e.firma_email || '', (e.firma_internet || '').replace(/^https?:\/\//, '')].filter(Boolean).join(' · ')].filter(function (z, i) { return i < 4 || z; }).join('\n');
}

let letzte = null;
// a = { anlass, bezug_id, bezug, an, cc, betreff, text, anhaenge: [{ name, inhalt (Buffer), typ }], erneut }
async function senden(db, a, wer) {
  const an = adressen(a.an); if (!an.length) throw new Error('Bitte einen Empfänger angeben.');
  const cc = adressen(a.cc);
  const betreff = String(a.betreff || '').trim(); if (!betreff) throw new Error('Bitte einen Betreff angeben.');
  const vorher = schonGesendet(db, a.anlass, a.bezug_id, a.bezug);
  if (vorher && !a.erneut) { const f = new Error('Diese Mail ist schon am ' + vorher.zeit.slice(0, 16).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1') + ' an ' + vorher.an + ' gegangen. Nur mit „erneut senden" noch einmal.'); f.schon = vorher; throw f; }
  const st = status(db); if (!st.bereit) throw new Error('Mailversand ist nicht eingerichtet: ' + st.grund);
  const k = konfig(db);
  // pdf-lib liefert Uint8Array — der Mailversand braucht einen Buffer, sonst geht ein leerer/kaputter Anhang raus
  const anh = (a.anhaenge || []).map(function (x) { return { filename: x.name, content: Buffer.isBuffer(x.inhalt) ? x.inhalt : Buffer.from(x.inhalt), contentType: x.typ || 'application/pdf' }; });
  if (anh.some(function (x) { return !x.content.length; })) throw new Error('Ein Anhang ist leer — nichts gesendet.');
  const nachricht = { from: { name: k.name, address: k.absender || 'info@staffclean.de' }, to: an.join(', '), cc: cc.length ? cc.join(', ') : undefined,
    bcc: k.kopie && an.indexOf(k.kopie) < 0 ? k.kopie : undefined, subject: betreff, text: String(a.text || '').replace(/\s+$/, '') + '\n' + signatur(db), attachments: anh };
  const log = (ergebnis, fehler) => Number(db.prepare('INSERT INTO mail_protokoll (anlass, bezug_id, bezug, an, cc, betreff, anhaenge, ergebnis, fehler, von_name) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(a.anlass, a.bezug_id == null ? null : Number(a.bezug_id), a.bezug || '', an.join(', '), cc.join(', ') || null, betreff, JSON.stringify((a.anhaenge || []).map(function (x) { return x.name; })), ergebnis, fehler || null, wer || null).lastInsertRowid);
  try {
    const nodemailer = require('nodemailer');
    const transport = TEST() ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({ host: k.host, port: k.port, secure: k.port === 465, auth: { user: k.absender, pass: k.pass } });
    const kopie = { from: nachricht.from, to: nachricht.to, cc: nachricht.cc, bcc: nachricht.bcc, subject: nachricht.subject, text: nachricht.text, attachments: anh.map(function (x) { return { filename: x.filename, content: Buffer.from(x.content), contentType: x.contentType }; }) };
    const info = await transport.sendMail(nachricht);   // nodemailer verändert die Anhänge beim Kodieren — deshalb vorher kopiert
    letzte = Object.assign(kopie, { messageId: info.messageId });
    return { ok: true, id: log('gesendet'), an: an.join(', '), anhaenge: anh.map(function (x) { return x.filename; }), test: TEST() };
  } catch (e) { log('fehler', e.message); throw new Error('Versand fehlgeschlagen: ' + e.message); }
}

function protokoll(db, filter) {
  filter = filter || {};
  const w = [], p = [];
  if (filter.anlass) { w.push('anlass = ?'); p.push(filter.anlass); }
  if (filter.bezug_id) { w.push('bezug_id = ?'); p.push(Number(filter.bezug_id)); }
  return db.prepare('SELECT * FROM mail_protokoll ' + (w.length ? 'WHERE ' + w.join(' AND ') : '') + ' ORDER BY id DESC LIMIT 200').all(...p)
    .map(function (r) { r.anhaenge = JSON.parse(r.anhaenge || '[]'); return r; });
}

module.exports = { tabellen, status, senden, protokoll, schonGesendet, adressen, get letzte() { return letzte; } };
