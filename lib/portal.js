// portal.js — Objektportal per QR-Code, ohne Anmeldung (CleaningOS-Abgleich 18.11.2026, Bausteine 1 + 2).
// Der QR-Code hängt im Objekt (Treppenhaus, Empfang). Wer ihn scannt, sieht, was das Büro für dieses Objekt freigibt:
// Leistungsnachweis je Tag, Mangel melden (mit Fotos), eigene Meldungen mit Verlauf, Leistungsverzeichnis,
// Reinigungszeiten, Dokumente, Ansprechpartner. Anders als im Vorbild kommt alles aus der Datenbank, nicht aus dem Browser.
//
// Sicherheit: Der Zugang ist ein zufälliger Schlüssel je Objekt (24 Zeichen), jederzeit sperr- und erneuerbar.
// Ohne Anmeldung gibt es keine Preise, keine Kalkulation, keine Namen von Reinigungskräften (nur die Objektleitung als
// Ansprechpartner) und keine Fotos aus der Reinigung. Eigene Meldungen erkennt das Portal am Gerät (Keks „gwp").
'use strict';
const crypto = require('crypto');
const PLAN = require('./plan');
const T = require('./turnus');

const KACHELN = [
  ['nachweis', 'Leistungsnachweis', 'Was wann erledigt wurde, je Tag, nach Monat'],
  ['melden', 'Mangel melden', 'Meldung mit Foto direkt an die Objektleitung'],
  ['meldungen', 'Meine Meldungen', 'Stand und Verlauf der eigenen Meldungen'],
  ['lv', 'Leistungsverzeichnis', 'Vereinbarte Leistungen mit Turnus'],
  ['zeiten', 'Reinigungszeiten', 'Wann wir im Objekt sind'],
  ['dokumente', 'Dokumente', 'Freigegebene Unterlagen (z. B. Hygieneplan, Sicherheitsdatenblätter)'],
  ['kontakt', 'Ansprechpartner', 'Objektleitung mit Telefon']
];
const STANDARD = { nachweis: true, melden: true, meldungen: true, lv: true, zeiten: true, dokumente: false, kontakt: true };

function tabellen(db) {
  const sp = db.prepare('PRAGMA table_info(objekt)').all().map(function (c) { return c.name; });
  if (sp.indexOf('portal_token') < 0) db.exec('ALTER TABLE objekt ADD COLUMN portal_token TEXT');
  if (sp.indexOf('portal_aktiv') < 0) db.exec('ALTER TABLE objekt ADD COLUMN portal_aktiv INTEGER DEFAULT 0');
  if (sp.indexOf('portal_kacheln') < 0) db.exec('ALTER TABLE objekt ADD COLUMN portal_kacheln TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS objekt_portal ON objekt (portal_token) WHERE portal_token IS NOT NULL');
}

function kacheln(o) { let k = {}; try { k = JSON.parse(o.portal_kacheln || '{}') || {}; } catch (e) { k = {}; } const aus = {}; KACHELN.forEach(function (x) { aus[x[0]] = x[0] in k ? !!k[x[0]] : STANDARD[x[0]]; }); return aus; }
const neuerSchluessel = () => crypto.randomBytes(18).toString('base64url');

// Büro: Stand des Portals eines Objekts
function stand(db, objektId) {
  const o = db.prepare('SELECT id, name, portal_token, portal_aktiv, portal_kacheln FROM objekt WHERE id = ?').get(Number(objektId)); if (!o) return null;
  return { aktiv: !!o.portal_aktiv && !!o.portal_token, token: o.portal_token, kacheln: kacheln(o), liste: KACHELN };
}
// Büro: einschalten (legt den Schlüssel an), ausschalten (Link tot, Schlüssel bleibt für späteres Wiedereinschalten), erneuern (alter Link tot)
function setzen(db, objektId, b) {
  const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(objektId)); if (!o) throw new Error('Objekt nicht gefunden');
  if (b.erneuern || (b.aktiv && !o.portal_token)) db.prepare('UPDATE objekt SET portal_token = ? WHERE id = ?').run(neuerSchluessel(), o.id);
  if (b.aktiv != null) db.prepare('UPDATE objekt SET portal_aktiv = ? WHERE id = ?').run(b.aktiv ? 1 : 0, o.id);
  if (b.kacheln && typeof b.kacheln === 'object') { const k = {}; KACHELN.forEach(function (x) { if (x[0] in b.kacheln) k[x[0]] = !!b.kacheln[x[0]]; }); db.prepare('UPDATE objekt SET portal_kacheln = ? WHERE id = ?').run(JSON.stringify(Object.assign(kacheln(o), k)), o.id); }
  return stand(db, o.id);
}
// Öffentlich: Objekt zum Schlüssel (nur wenn eingeschaltet)
function finden(db, token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ''))) return null;
  const o = db.prepare("SELECT * FROM objekt WHERE portal_token = ? AND portal_aktiv = 1 AND status = 'aktiv'").get(String(token));
  return o || null;
}

const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// Kopf + Zähler je freigegebener Kachel
function kopf(db, o, geraet) {
  const k = kacheln(o), e = {};
  db.prepare('SELECT schluessel, wert FROM einstellung WHERE schluessel IN (\'firma_name\', \'firma_telefon\', \'firma_email\')').all().forEach(function (r) { e[r.schluessel] = r.wert; });
  const aus = { objekt: { name: o.name, strasse: o.strasse, plz: o.plz, ort: o.ort }, firma: { name: e.firma_name || 'StaffClean GmbH', telefon: e.firma_telefon || '', email: e.firma_email || '' }, kacheln: [] };
  KACHELN.forEach(function (x) {
    if (!k[x[0]]) return;
    let zahl = null;
    if (x[0] === 'lv') zahl = db.prepare('SELECT COUNT(*) n FROM lv_position WHERE objekt_id = ?').get(o.id).n + ' Leistungen';
    if (x[0] === 'meldungen') zahl = (geraet ? db.prepare("SELECT COUNT(*) n FROM mangel WHERE objekt_id = ? AND geraet = ? AND status = 'offen'").get(o.id, geraet).n : 0) + ' offen';
    if (x[0] === 'dokumente') zahl = db.prepare('SELECT COUNT(*) n FROM objekt_anlage WHERE objekt_id = ? AND im_portal = 1').get(o.id).n + ' Dateien';
    if (x[0] === 'nachweis') { const t = PLAN.tag(db, heute(), { objekt: o.id }); zahl = t.soll ? 'heute ' + t.fertig + ' von ' + t.soll : 'heute kein Reinigungstag'; }
    aus.kacheln.push({ id: x[0], titel: x[1], text: x[2], zahl: zahl });
  });
  return aus;
}

function darf(o, kachel) { return !!kacheln(o)[kachel]; }

function nachweis(db, o, monat) {
  const N = require('./nachweis');
  const n = N.monat(db, o.id, monat);
  return { monat: n.monat, bis: n.bis, summe: n.summe, tage: n.tage.map(function (t) { return { datum: t.datum, soll: t.soll, fertig: t.fertig, kraefte: t.kraefte, leistungen: t.leistungen.map(function (l) { return { raum: l.raum, taetigkeit: l.taetigkeit, erledigt: l.erledigt }; }) }; }) };
}
function lv(db, o) {
  return db.prepare('SELECT r.name raum, r.etage, t.name taetigkeit, p.turnus FROM lv_position p JOIN raum r ON r.id = p.raum_id JOIN taetigkeit t ON t.id = p.taetigkeit_id WHERE p.objekt_id = ? ORDER BY r.reihenfolge, r.id, t.name').all(o.id)
    .map(function (x) { return { raum: x.raum, etage: x.etage, taetigkeit: x.taetigkeit, turnus: T.lesen(x.turnus, o.reinigungstag).text }; });
}
function zeiten(db, o) {
  // Reinigungstage aus den nächsten 14 Tagen des Plans + Uhrzeit aus der Objektakte
  const tage = new Set(); for (let i = 0; i < 14; i++) { const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10); if (PLAN.tag(db, d, { objekt: o.id }).soll) tage.add(new Date(d + 'T12:00:00Z').getUTCDay()); }
  return { tage: [1, 2, 3, 4, 5, 6, 0].filter(function (t) { return tage.has(t); }).map(function (t) { return TAGE[t]; }), von: o.zeit_von || null, bis: o.zeit_bis || null, hinweis: o.zeit_hinweis || null };
}
function kontakt(db, o) {
  const l = o.objektleitung_id ? db.prepare('SELECT name, telefon FROM mitarbeiter WHERE id = ? AND aktiv = 1').get(o.objektleitung_id) : null;
  const e = {}; db.prepare("SELECT schluessel, wert FROM einstellung WHERE schluessel IN ('firma_name','firma_telefon','firma_email')").all().forEach(function (r) { e[r.schluessel] = r.wert; });
  return { objektleitung: l ? { name: l.name, telefon: l.telefon || null } : null, buero: { name: e.firma_name || 'StaffClean GmbH', telefon: e.firma_telefon || null, email: e.firma_email || null } };
}
function dokumente(db, o) { return db.prepare('SELECT id, titel, art, angelegt_am FROM objekt_anlage WHERE objekt_id = ? AND im_portal = 1 ORDER BY id DESC').all(o.id); }
function meldungen(db, o, geraet) {
  if (!geraet) return [];
  const TK = require('./tickets');
  return db.prepare('SELECT id FROM mangel WHERE objekt_id = ? AND geraet = ? ORDER BY id DESC LIMIT 30').all(o.id, geraet).map(function (x) {
    const m = TK.holen(db, x.id);
    return { id: m.id, text: m.text, bereich: m.bereich, prioritaet: m.prioritaet, status: m.status, stand: m.status === 'erledigt' ? (m.geprueft_am ? 'erledigt und geprüft' : 'erledigt') : TK.STAND[m.stand] || 'neu',
      gemeldet_am: m.gemeldet_am, erledigt_am: m.erledigt_am, fotos: m.fotos, erledigt_foto: m.erledigt_foto, verlauf: m.verlauf.filter(function (v) { return v.oeffentlich; }).map(function (v) { return { zeit: v.zeit, text: v.text, art: v.art, von_uns: v.art !== 'kunde' }; }) };
  });
}

module.exports = { KACHELN, tabellen, kacheln, stand, setzen, finden, kopf, darf, nachweis, lv, zeiten, kontakt, dokumente, meldungen };
