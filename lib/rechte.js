// rechte.js — Berechtigungen im Büro nach dem Vorbild von SecPlan (Administration → Berechtigungen,
// Mitarbeiterakte → Sonderberechtigungen). Manuel 29.09.2026: „Schau mal, wie das der SecPlan geregelt hat und
// genauso hätte ich das auch gerne bei uns."
//
// SecPlan-Vorbild (Handbuch 10.1 Sonderberechtigungen, 10.11 Berechtigungen, berechtigung.php live gelesen 26.09.2026):
//   · Jede Person ist Mitarbeiter; ein Admin vergibt ihr EINE Berechtigung: Admin, Bereichsadmin, Planer,
//     Controller, Einsatzleiter oder Objektleiter. Ohne Berechtigung ist sie „User" (hier: Mitarbeiter-App mit PIN).
//   · Je Person zusätzlich Sonderberechtigungen (Erweiterungen) und Einschränkungen zum Anhaken.
//   · Objekt- und Einsatzleiter sehen nur die Objekte, für die sie zuständig sind.
//   · Controlling nur für Admin, Planer, Controller; Abrechnung für den Planer nur mit Sonderrecht
//     („Abrechnung Kunden"), die Einschränkung „Abrechnung — sieht wie ein User" nimmt sie wieder weg.
//
// Die Prüfung sitzt im Server an der einen Stelle, durch die jede Büro-Anfrage läuft — die Oberfläche blendet nur aus,
// sie ist nicht die Sicherung.
'use strict';

const ROLLEN = {
  admin:         { titel: 'Admin', text: 'Alles, auch Berechtigungen, Zugänge und Einstellungen.' },
  bereichsadmin: { titel: 'Bereichsadmin', text: 'Alles außer Berechtigungen, Zugängen und Einstellungen.' },
  planer:        { titel: 'Planer', text: 'Planung, Objekte, Personal, Zeiten, Bewerber, Arbeitsschutz, Controlling. Abrechnung nur mit Sonderrecht.' },
  controller:    { titel: 'Controller', text: 'Controlling und Reports, Bericht Geschäftsführung, DATEV. Abrechnung nur mit Sonderrecht.' },
  einsatzleiter: { titel: 'Einsatzleiter', text: 'Planung, Mängel und Prüfungen — nur für die zugewiesenen Objekte.' },
  objektleiter:  { titel: 'Objektleiter', text: 'Planung, Mängel und Prüfungen — nur für die zugewiesenen Objekte.' }
};

// Bereiche wie in SecPlan (Startseite, Planung, Abgleich, Personal/Administration, Abrechnung, Controlling, Administration)
const BEREICHE = {
  startseite:     { titel: 'Startseite', pfade: ['/api/uebersicht', '/api/erledigt', '/api/vorschlaege', '/api/tag'] },
  planung:        { titel: 'Planung & Objekte', pfade: ['/api/woche', '/api/dienstplan', '/api/einsatzplan', '/api/einsatz', '/api/schicht', '/api/turnus', '/api/vertretung',
                    '/api/objekte', '/api/objekt', '/api/raum', '/api/qr', '/api/position', '/api/maengel', '/api/mangel', '/api/pruefung', '/api/pruefungen', '/api/abwesenheit'] },
  abgleich:       { titel: 'Zeiten & Abgleich', pfade: ['/api/zeiten', '/api/zeit/', '/api/stunden', '/api/soll-ist'] },
  personal:       { titel: 'Personal', pfade: ['/api/mitarbeiter', '/api/personal'] },
  bewerbungen:    { titel: 'Bewerbungen', pfade: ['/api/bewerber'] },
  arbeitsschutz:  { titel: 'Arbeitsschutz & QM', pfade: ['/api/register', '/api/unterweisung'] },
  kunden:         { titel: 'Kunden', pfade: ['/api/kunden', '/api/kunde'] },
  abrechnung:     { titel: 'Abrechnung', pfade: ['/api/rechnung', '/api/rechnungen', '/api/mahn', '/api/offene-posten', '/api/lastschrift', '/api/bank/', '/api/basiszins',
                    '/api/abrechnungslaeufe', '/api/abrechnung/', '/api/artikel', '/api/auftrag', '/api/auftraege', '/api/zahlweise', '/api/preisposition', '/api/preispositionen',
                    '/api/katalog', '/api/kalkulation', '/api/objekt/preis'] },
  controlling:    { titel: 'Controlling', pfade: ['/api/controlling', '/api/reports', '/api/report', '/api/bericht/', '/api/objektauswertung', '/api/objekt/kennzahlen', '/api/datev'] },
  stammdaten:     { titel: 'Stammdaten', pfade: ['/api/taetigkeit', '/api/taetigkeiten', '/api/tarif', '/api/tarife', '/api/uebersetzung', '/api/import'] },
  administration: { titel: 'Administration', pfade: ['/api/einstellungen', '/api/konten', '/api/konto', '/api/berechtigungen', '/api/berechtigung'] }
};
// längster Treffer gewinnt (/api/objekt/preis gehört zur Abrechnung, nicht zur Planung)
const PFADLISTE = [];
Object.keys(BEREICHE).forEach(function (b) { BEREICHE[b].pfade.forEach(function (pf) { PFADLISTE.push([pf, b]); }); });
PFADLISTE.sort(function (a, b) { return b[0].length - a[0].length; });
function bereichVon(p) {
  for (const [pf, b] of PFADLISTE) if (p === pf || (pf.endsWith('/') ? p.startsWith(pf) : (p.startsWith(pf + '/') || p.startsWith(pf + '.') || p === pf))) return b;
  return null;
}

const ALLE = Object.keys(BEREICHE);
const GRUND = {
  admin: ALLE,
  bereichsadmin: ALLE.filter(function (b) { return b !== 'administration'; }),
  planer: ['startseite', 'planung', 'abgleich', 'personal', 'bewerbungen', 'arbeitsschutz', 'kunden', 'controlling'],
  controller: ['startseite', 'controlling'],
  einsatzleiter: ['startseite', 'planung'],
  objektleiter: ['startseite', 'planung']
};

// Sonderberechtigungen (Erweiterungen) und Einschränkungen — wie im SecPlan-Reiter „Sonderberechtigungen"
const SONDER = {
  abrechnung_kunden:  { titel: 'Abrechnung Kunden', art: 'erweiterung', fuer: ['planer', 'controller', 'einsatzleiter', 'objektleiter'], gibt: ['abrechnung', 'kunden'] },
  controlling:        { titel: 'Controlling / Reportings', art: 'erweiterung', fuer: ['einsatzleiter', 'objektleiter'], gibt: ['controlling'] },
  vorlaeufiger_abgleich: { titel: 'Vorläufiger Abgleich (Zeiten)', art: 'erweiterung', fuer: ['controller', 'einsatzleiter', 'objektleiter'], gibt: ['abgleich'] },
  ma_informationen:   { titel: 'MA-Informationen (Personalakte)', art: 'erweiterung', fuer: ['controller', 'einsatzleiter', 'objektleiter'], gibt: ['personal'] },
  bewerbungen:        { titel: 'Bewerbungen', art: 'erweiterung', fuer: ['controller', 'einsatzleiter', 'objektleiter'], gibt: ['bewerbungen'] },
  arbeitsschutz:      { titel: 'Arbeitsschutz & QM', art: 'erweiterung', fuer: ['controller', 'einsatzleiter', 'objektleiter'], gibt: ['arbeitsschutz'] },
  stammdaten:         { titel: 'Administration Stammdaten', art: 'erweiterung', fuer: ['planer', 'controller'], gibt: ['stammdaten'] },
  abrechnung_gesperrt: { titel: 'Abrechnung — sieht wie ein User (kein Zugriff)', art: 'einschraenkung', fuer: ['bereichsadmin', 'planer', 'controller'], nimmt: ['abrechnung'] },
  lohn_ausgeblendet:  { titel: 'Stammdaten: Lohnabrechnung ausgeblendet', art: 'einschraenkung', fuer: ['bereichsadmin', 'planer', 'controller', 'einsatzleiter', 'objektleiter'] },
  bank_ausgeblendet:  { titel: 'Stammdaten: Bankdaten ausgeblendet', art: 'einschraenkung', fuer: ['bereichsadmin', 'planer', 'controller', 'einsatzleiter', 'objektleiter'] }
};
const LOHNFELDER = ['stundenlohn', 'lohngruppe', 'steuerklasse', 'steuer_id', 'steuerId', 'sv_nummer', 'sv_ausweis', 'krankenkasse', 'steuerfall', 'verdienst'];
const BANKFELDER = ['iban', 'bic', 'kontoinhaber'];

function sonderLesen(text) { try { const o = JSON.parse(text || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }

// Welche Bereiche darf dieses Büro-Konto?
function bereiche(konto) {
  const rolle = ROLLEN[konto.berechtigung] ? konto.berechtigung : 'admin';
  const s = sonderLesen(konto.sonderrechte), menge = new Set(GRUND[rolle]);
  Object.keys(SONDER).forEach(function (k) {
    const d = SONDER[k]; if (!s[k] || d.fuer.indexOf(rolle) < 0) return;
    (d.gibt || []).forEach(function (b) { menge.add(b); });
    (d.nimmt || []).forEach(function (b) { menge.delete(b); });
  });
  return menge;
}
function nurEigeneObjekte(konto) { return konto.berechtigung === 'einsatzleiter' || konto.berechtigung === 'objektleiter'; }
function objektIds(db, konto) { return new Set(db.prepare('SELECT objekt_id FROM objekt_berechtigung WHERE benutzer_id = ?').all(konto.id).map(function (r) { return r.objekt_id; })); }

// Objekt-Nummer aus einer Anfrage ziehen (Abfrage oder Rumpf); /api/objekt* trägt sie als id
function objektInAnfrage(p, q, b) {
  const kand = [q.get('objekt'), q.get('objekt_id'), b && b.objekt_id, b && b.objekt];
  if (/^\/api\/objekt(\/|$)/.test(p) || p === '/api/woche') { kand.push(q.get('id')); if (p.startsWith('/api/objekt')) kand.push(b && b.id); }
  return kand.filter(function (x) { return x != null && x !== '' && !isNaN(Number(x)); }).map(Number);
}

// Antworten, in denen Objekte ohne objekt_id stehen (id = Objekt), und Teile, die Objekt-/Einsatzleiter nie bekommen.
// Gemessen 29.09.2026 mit einer Test-Objektleiterin: Übersicht und Tagesplan zeigten fremde Objekte, der Tagesplan
// zusätzlich unter „auslastung" Lohn und Monatsverdienst aller Mitarbeiter.
const OBJEKT_LISTEN = { '/api/uebersicht': ['objekte', 'alarme'], '/api/einsatzplan': ['lage'], '/api/tag': ['objekte'] };
const NIE_FUER_LEITER = { '/api/einsatzplan': ['auslastung'] };
// Lohn- und Verdienstfelder bekommen Objekt-/Einsatzleiter in KEINER Antwort (z. B. Vertretungsvorschläge);
// dazu die Objektliste je Mitarbeiter, die fremde Objektnamen verrät
const LOHN_FUER_LEITER = ['lohn', 'stundenlohn', 'lohngruppe', 'verdienstMonat', 'verdienst', 'minijobGrenze', 'minijobMaxStunden'];
const NAMEN_FREMDER_OBJEKTE = { '/api/vorschlaege': ['objekte'] };
const MA_FELDER_LEITER = ['id', 'name', 'telefon', 'sprache', 'aktiv', 'rolle', 'hat_pin', 'personalnummer'];

function vorfilter(daten, erlaubt, p) {
  if (!erlaubt || !daten || typeof daten !== 'object' || Array.isArray(daten)) return daten;
  const o = Object.assign({}, daten);
  (OBJEKT_LISTEN[p] || []).forEach(function (k) { if (Array.isArray(o[k])) o[k] = o[k].filter(function (e) { return e && erlaubt.has(Number(e.objekt_id != null ? e.objekt_id : e.id)); }); });
  (NIE_FUER_LEITER[p] || []).forEach(function (k) { if (k in o) o[k] = Array.isArray(o[k]) ? [] : null; });
  return o;
}

// Antwort filtern: Einträge fremder Objekte raus, bei Einschränkungen Lohn-/Bankfelder raus
function filter(daten, erlaubt, weg, p, personalRecht) {
  daten = vorfilter(daten, erlaubt, p);
  if (erlaubt && !personalRecht && p === '/api/mitarbeiter' && Array.isArray(daten)) daten = daten.map(function (m) { const o = {}; MA_FELDER_LEITER.forEach(function (k) { if (k in m) o[k] = m[k]; }); return o; });
  const tiefe = function (x, top) {
    if (Array.isArray(x)) return x.filter(function (e) {
      if (!erlaubt || !e || typeof e !== 'object') return true;
      if (e.objekt_id != null) return erlaubt.has(Number(e.objekt_id));
      if (top && p === '/api/objekte' && e.id != null) return erlaubt.has(Number(e.id));
      return true;
    }).map(function (e) { return tiefe(e, false); });
    if (x && typeof x === 'object') { const o = {}; Object.keys(x).forEach(function (k) { if (weg.indexOf(k) < 0) o[k] = tiefe(x[k], false); }); return o; }
    return x;
  };
  return tiefe(daten, true);
}

// Die eine Prüfung je Büro-Anfrage. Wirft {code, text} bei fehlendem Recht, gibt sonst einen Antwortfilter zurück (oder null).
function pruefen(db, konto, p, q, b, methode) {
  const bereich = bereichVon(p);
  const darf = bereiche(konto);
  // Objekt-/Einsatzleiter planen ihre Leute ein: die Mitarbeiterliste lesen sie auch ohne Personal-Recht, aber nur
  // Name/Telefon/Sprache (Feldliste MA_FELDER_LEITER) — wie in SecPlan, wo der Objektleiter einplant, die Akte aber nicht sieht
  const leiterListe = nurEigeneObjekte(konto) && p === '/api/mitarbeiter' && methode !== 'POST';
  if (bereich && !darf.has(bereich) && !leiterListe) return { verboten: 'Dafür fehlt die Berechtigung (' + BEREICHE[bereich].titel + ').' };
  if (!bereich && konto.berechtigung !== 'admin' && konto.berechtigung !== 'bereichsadmin') return { verboten: 'Dafür fehlt die Berechtigung.' };
  let erlaubt = null;
  if (nurEigeneObjekte(konto)) {
    erlaubt = objektIds(db, konto);
    // Objekte anlegen oder ein Leistungsverzeichnis einlesen ist Sache von Planer/Admin
    if (methode === 'POST' && p === '/api/objekt' && !(b && b.id)) return { verboten: 'Objekte legt der Planer an.' };
    const fremd = objektInAnfrage(p, q, b).filter(function (id) { return !erlaubt.has(id); });
    if (fremd.length) return { verboten: 'Für dieses Objekt bist du nicht zuständig.' };
  }
  const s = sonderLesen(konto.sonderrechte), rolle = konto.berechtigung;
  const weg = [].concat(s.lohn_ausgeblendet && rolle !== 'admin' ? LOHNFELDER : [], s.bank_ausgeblendet && rolle !== 'admin' ? BANKFELDER : [],
    erlaubt ? LOHN_FUER_LEITER.concat(NAMEN_FREMDER_OBJEKTE[p] || []) : []);
  if (!erlaubt && !weg.length) return { filter: null };
  return { filter: function (d) { return filter(d, erlaubt, weg, p, darf.has('personal')); } };
}

function tabellen(db) {
  const spalten = db.prepare('PRAGMA table_info(benutzer)').all().map(function (s) { return s.name; });
  if (spalten.indexOf('berechtigung') < 0) db.exec("ALTER TABLE benutzer ADD COLUMN berechtigung TEXT DEFAULT 'admin'");
  if (spalten.indexOf('sonderrechte') < 0) db.exec("ALTER TABLE benutzer ADD COLUMN sonderrechte TEXT DEFAULT '{}'");
  if (spalten.indexOf('mitarbeiter_id') < 0) db.exec('ALTER TABLE benutzer ADD COLUMN mitarbeiter_id INTEGER');
  db.exec('CREATE TABLE IF NOT EXISTS objekt_berechtigung (benutzer_id INTEGER NOT NULL, objekt_id INTEGER NOT NULL, PRIMARY KEY (benutzer_id, objekt_id))');
}

module.exports = { ROLLEN, BEREICHE, SONDER, GRUND, bereiche, bereichVon, pruefen, tabellen, nurEigeneObjekte, sonderLesen };
