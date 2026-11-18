// nachweis.js — Monats-Leistungsnachweis je Objekt (CleaningOS-Abgleich 18.11.2026, Baustein 6) und die Anlagen,
// die mit jeder Rechnung des Objekts an den Kunden gehen (Baustein 5: „Rechnungsanlagen je Objekt, automatisch mitsenden").
// Hausverwaltungen prüfen bei der Rechnung genau das: was wurde an welchem Tag gemacht, von wie vielen Kräften.
// Quelle sind die vorhandenen Tabellen: Tagesplan aus dem LV (plan.js), Erledigungen und Zeitbuchungen.
'use strict';
const fs = require('fs');
const path = require('path');
const DB = require('./db');
const PLAN = require('./plan');

const ANLAGEN = path.join(DB.ORDNER, 'anlagen');
const ARTEN = { aufmass: 'Aufmaß', leistungsnachweis: 'Leistungsnachweis', stundenzettel: 'Stundenzettel', bericht: 'Bericht', vertrag: 'Vertrag', sdb: 'Sicherheitsdatenblatt', sonstiges: 'Sonstiges' };

function tabellen(db) {
  fs.mkdirSync(ANLAGEN, { recursive: true });
  db.exec(`CREATE TABLE IF NOT EXISTS objekt_anlage (
    id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE, titel TEXT NOT NULL, art TEXT DEFAULT 'sonstiges',
    datei TEXT NOT NULL, typ TEXT, auto INTEGER DEFAULT 1, im_portal INTEGER DEFAULT 0, angelegt_am TEXT DEFAULT (datetime('now','localtime')))`);
  const sp = db.prepare('PRAGMA table_info(objekt)').all().map(function (c) { return c.name; });
  if (sp.indexOf('nachweis_anhaengen') < 0) db.exec('ALTER TABLE objekt ADD COLUMN nachweis_anhaengen INTEGER DEFAULT 1');
}

const ende = m => m + '-' + String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');
const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Ein Monat: je Tag mit Soll die Leistungen (erledigt ja/nein), Zahl der Kräfte und gestempelte Stunden
function monat(db, objektId, m) {
  if (!/^\d{4}-\d{2}$/.test(m || '')) throw new Error('Monat im Format JJJJ-MM');
  const o = db.prepare('SELECT o.*, k.name kunde FROM objekt o LEFT JOIN kunde k ON k.id = o.kunde_id WHERE o.id = ?').get(Number(objektId));
  if (!o) throw new Error('Objekt nicht gefunden');
  const bis = ende(m) < heute() ? ende(m) : heute();
  const tage = [];
  for (let d = m + '-01'; d <= bis; d = plus(d, 1)) {
    const t = PLAN.tag(db, d, { objekt: o.id }); const ob = t.objekte[0];
    const zb = db.prepare('SELECT mitarbeiter_id, kommen, gehen, pause_min FROM zeitbuchung WHERE objekt_id = ? AND substr(kommen,1,10) = ?').all(o.id, d);
    const leute = new Set(zb.map(function (z) { return z.mitarbeiter_id; }));
    const leistungen = [];
    if (ob) ob.raeume.forEach(function (r) { r.aufgaben.forEach(function (a) { leistungen.push({ raum: r.name, taetigkeit: a.taetigkeit, erledigt: !!a.erledigt, zeit: a.erledigt ? String(a.erledigt.zeit || '').slice(11, 16) : null, foto: !!(a.erledigt && a.erledigt.foto) }); if (a.erledigt && a.erledigt.mitarbeiter_id) leute.add(a.erledigt.mitarbeiter_id); }); });
    const minuten = zb.filter(function (z) { return z.gehen; }).reduce(function (s, z) { return s + Math.max(0, (new Date(z.gehen.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 60000 - (z.pause_min || 0)); }, 0);
    if (!leistungen.length && !zb.length) continue;
    tage.push({ datum: d, soll: leistungen.length, fertig: leistungen.filter(function (l) { return l.erledigt; }).length, kraefte: leute.size, stunden: Math.round(minuten / 60 * 100) / 100, fotos: leistungen.filter(function (l) { return l.foto; }).length, leistungen: leistungen });
  }
  const s = tage.reduce(function (a, t) { a.soll += t.soll; a.fertig += t.fertig; a.stunden += t.stunden; return a; }, { soll: 0, fertig: 0, stunden: 0 });
  return { objekt: { id: o.id, name: o.name, strasse: o.strasse, plz: o.plz, ort: o.ort, kunde: o.kunde, kunde_id: o.kunde_id, objektnummer: o.objektnummer }, monat: m, bis: bis, tage: tage,
    summe: { tage: tage.length, soll: s.soll, fertig: s.fertig, quote: s.soll ? Math.round(s.fertig * 1000 / s.soll) / 10 : null, stunden: Math.round(s.stunden * 100) / 100 } };
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monatText = m => MONATE[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);
const tagDe = d => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + d.slice(8, 10) + '.' + d.slice(5, 7) + '.';
const zahl = v => String(Math.round((v || 0) * 100) / 100).replace('.', ',');

async function pdf(db, objektId, m) {
  const BRIEF = require('./pdf/brief');
  const n = monat(db, objektId, m), o = n.objekt;
  const zeilen = n.tage.map(function (t) { return [tagDe(t.datum), t.fertig + ' von ' + t.soll, String(t.kraefte || '–'), t.stunden ? zahl(t.stunden) : '–', t.fotos ? String(t.fotos) : '–']; });
  const bloecke = [
    { absatz: 'Leistungsnachweis für ' + o.name + (o.strasse ? ', ' + o.strasse + ', ' + [o.plz, o.ort].filter(Boolean).join(' ') : '') + ' im ' + monatText(m) + (n.bis < ende(m) ? ' (Stand ' + n.bis.split('-').reverse().join('.') + ')' : '') + '. Grundlage sind die im Leistungsverzeichnis vereinbarten Leistungen und die bei jeder Reinigung vor Ort erfassten Erledigungen.' },
    { tabelle: { spalten: [{ t: 'Tag', b: 80 }, { t: 'Leistungen erledigt', b: 140 }, { t: 'Kräfte', b: 70, rechts: true }, { t: 'Stunden', b: 80, rechts: true }, { t: 'Fotos', b: 70, rechts: true }],
      zeilen: zeilen.length ? zeilen : [['— keine Reinigungstage —', '', '', '', '']], summen: [['Summe ' + n.summe.tage + ' Tage', n.summe.fertig + ' von ' + n.summe.soll + (n.summe.quote != null ? ' (' + zahl(n.summe.quote) + ' %)' : ''), true], ['Stunden gesamt', zahl(n.summe.stunden), false]] } }
  ];
  if (n.tage.length) {
    bloecke.push({ absatz: 'Einzelnachweis je Tag', fett: true });
    n.tage.forEach(function (t) {
      const offen = t.leistungen.filter(function (l) { return !l.erledigt; });
      const gruppen = {}; t.leistungen.filter(function (l) { return l.erledigt; }).forEach(function (l) { (gruppen[l.raum] = gruppen[l.raum] || []).push(l.taetigkeit); });
      bloecke.push({ absatz: tagDe(t.datum) + '  ' + Object.keys(gruppen).map(function (r) { return r + ': ' + gruppen[r].join(', '); }).join(' · ') + (offen.length ? '  — nicht erledigt: ' + offen.map(function (l) { return l.raum + ' ' + l.taetigkeit; }).join(', ') : '') });
    });
  }
  const buf = await BRIEF.brief(db, { kennung: 'Leistungsnachweis ' + o.name + ' ' + monatText(m), bank: false, titel: 'Leistungsnachweis – ' + monatText(m),
    empfaenger: o.kunde ? [o.kunde] : undefined,
    spalte: ['LEISTUNGSNACHWEIS', ['Objekt:', o.name], o.objektnummer ? ['Objekt-Nr.:', o.objektnummer] : null, ['Zeitraum:', monatText(m)], ['Erstellt:', heute().split('-').reverse().join('.')]].filter(Boolean), bloecke: bloecke });
  return { buf: buf, name: 'Leistungsnachweis_' + o.name.replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + '_' + m + '.pdf' };
}

// ---- Anlagen je Objekt
function anlagen(db, objektId) { return db.prepare('SELECT id, objekt_id, titel, art, typ, auto, im_portal, angelegt_am FROM objekt_anlage WHERE objekt_id = ? ORDER BY id DESC').all(Number(objektId)); }
function anlageSpeichern(db, b) {
  if (b.id && b.loeschen) { const a = db.prepare('SELECT * FROM objekt_anlage WHERE id = ?').get(Number(b.id)); if (!a) throw new Error('Anlage nicht gefunden'); db.prepare('DELETE FROM objekt_anlage WHERE id = ?').run(a.id); return a; }   // Datei bleibt liegen (Nachweis, wurde evtl. schon versendet)
  if (b.id) { db.prepare('UPDATE objekt_anlage SET titel = COALESCE(?, titel), auto = COALESCE(?, auto), im_portal = COALESCE(?, im_portal) WHERE id = ?').run(b.titel || null, b.auto == null ? null : (b.auto ? 1 : 0), b.im_portal == null ? null : (b.im_portal ? 1 : 0), Number(b.id)); return { id: Number(b.id) }; }
  if (!String(b.titel || '').trim()) throw new Error('Bitte einen Titel angeben, z. B. „Aufmaß Treppenhaus".');
  const m = String(b.datei || '').match(/^data:(application\/pdf|image\/jpeg|image\/png);base64,(.+)$/); if (!m) throw new Error('Bitte eine PDF-, JPG- oder PNG-Datei wählen.');
  const inhalt = Buffer.from(m[2], 'base64'); if (inhalt.length > 10e6) throw new Error('Die Datei ist größer als 10 MB.');
  const name = 'an' + Number(b.objekt_id) + '-' + Date.now() + '-' + require('crypto').randomBytes(4).toString('hex') + { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[m[1]];
  fs.writeFileSync(path.join(ANLAGEN, name), inhalt);
  return { id: Number(db.prepare('INSERT INTO objekt_anlage (objekt_id, titel, art, datei, typ, auto, im_portal) VALUES (?,?,?,?,?,?,?)').run(Number(b.objekt_id), String(b.titel).trim().slice(0, 120), ARTEN[b.art] ? b.art : 'sonstiges', name, m[1], b.auto === false ? 0 : 1, b.im_portal ? 1 : 0).lastInsertRowid) };
}
function anlageDatei(db, id) {
  const a = db.prepare('SELECT * FROM objekt_anlage WHERE id = ?').get(Number(id)); if (!a) return null;
  const f = path.join(ANLAGEN, path.basename(a.datei)); if (!fs.existsSync(f)) return null;
  return Object.assign(a, { pfad: f, dateiname: a.titel.replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + path.extname(a.datei) });
}

// Alles, was mit dieser Rechnung an den Kunden geht: Leistungsnachweis je Objekt (wenn eingeschaltet) + Anlagen „automatisch mitsenden"
async function fuerRechnung(db, r, nurNamen) {   // nurNamen: für den Mail-Entwurf — nichts erzeugen, nur auflisten
  const objekte = new Set(); if (r.objekt_id) objekte.add(r.objekt_id);
  db.prepare('SELECT DISTINCT objekt_id FROM rechnung_position WHERE rechnung_id = ? AND objekt_id IS NOT NULL').all(r.id).forEach(function (x) { objekte.add(x.objekt_id); });
  const monate = []; for (let mm = r.zeitraum_von.slice(0, 7); mm <= r.zeitraum_bis.slice(0, 7); mm = (function (x) { const d = new Date(x + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })(mm)) monate.push(mm);
  const aus = [];
  for (const oid of objekte) {
    const o = db.prepare('SELECT nachweis_anhaengen FROM objekt WHERE id = ?').get(oid); if (!o) continue;
    const oname = (db.prepare('SELECT name FROM objekt WHERE id = ?').get(oid) || {}).name || 'Objekt';
    if (o.nachweis_anhaengen !== 0) for (const mm of monate.slice(0, 3)) {
      if (nurNamen) { aus.push({ name: 'Leistungsnachweis_' + oname.replace(/[^A-Za-zÄÖÜäöüß0-9]+/g, '_') + '_' + mm + '.pdf', art: 'leistungsnachweis' }); continue; }
      const p = await pdf(db, oid, mm); aus.push({ name: p.name, inhalt: p.buf, typ: 'application/pdf', art: 'leistungsnachweis' });
    }
    db.prepare('SELECT id FROM objekt_anlage WHERE objekt_id = ? AND auto = 1 ORDER BY id').all(oid).forEach(function (x) { const a = anlageDatei(db, x.id); if (a) aus.push({ name: a.dateiname, inhalt: nurNamen ? null : fs.readFileSync(a.pfad), typ: a.typ, art: a.art }); });
  }
  return aus;
}

module.exports = { ARTEN, tabellen, monat, pdf, anlagen, anlageSpeichern, anlageDatei, fuerRechnung, monatText };
