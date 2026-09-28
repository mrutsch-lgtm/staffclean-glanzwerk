// personal.js — Personalakte wie in der Sicherheitsplanung: Stammdaten für Lohnbüro und Meldewesen (DEÜV),
// Aufenthaltsrecht, Bank, Notfallkontakt; Prüfungen (Steuer-ID, SV-Nummer, IBAN), Fristen, Urlaubskonto,
// Monatsauswertung (Soll / geplant / gestempelt / Urlaub / krank) und die Stammdaten-Datei für das Lohnbüro.
//
// Eine Feldliste für alles: Datenbank (Spalten), Formular (Gruppen), Prüfung, Personalfragebogen und Export.
'use strict';
const FT = require('./feiertage');

const JN = [['', '—'], ['nein', 'nein'], ['ja', 'ja']];
const FELDER = [
  // Person
  { n: 'anrede', t: 'Anrede', g: 'Person', typ: 'wahl', o: [['', '—'], ['Frau', 'Frau'], ['Herr', 'Herr'], ['divers', 'divers']] },
  { n: 'vorname', t: 'Vorname', g: 'Person', pflicht: true },
  { n: 'nachname', t: 'Nachname', g: 'Person', pflicht: true },
  { n: 'geburtsname', t: 'Geburtsname (falls abweichend)', g: 'Person' },
  { n: 'geburtsdatum', t: 'Geburtsdatum', g: 'Person', typ: 'date', pflicht: true },
  { n: 'geburtsort', t: 'Geburtsort', g: 'Person', pflicht: true },
  { n: 'geburtsland', t: 'Geburtsland', g: 'Person' },
  { n: 'geschlecht', t: 'Geschlecht (Meldewesen)', g: 'Person', typ: 'wahl', o: [['', '—'], ['w', 'weiblich'], ['m', 'männlich'], ['d', 'divers'], ['x', 'unbestimmt']], pflicht: true },
  { n: 'staatsangehoerigkeit', t: 'Staatsangehörigkeit', g: 'Person', pflicht: true },
  { n: 'familienstand', t: 'Familienstand', g: 'Person', typ: 'wahl', o: [['', '—'], ['ledig', 'ledig'], ['verheiratet', 'verheiratet'], ['eingetragene Lebenspartnerschaft', 'eingetr. Lebenspartnerschaft'], ['geschieden', 'geschieden'], ['verwitwet', 'verwitwet'], ['getrennt lebend', 'getrennt lebend']] },
  { n: 'email', t: 'E-Mail', g: 'Person', typ: 'email' },
  // Anschrift und Notfall
  { n: 'strasse', t: 'Straße und Hausnummer', g: 'Anschrift', pflicht: true },
  { n: 'plz', t: 'PLZ', g: 'Anschrift', pflicht: true },
  { n: 'ort', t: 'Ort', g: 'Anschrift', pflicht: true },
  { n: 'land', t: 'Land', g: 'Anschrift' },
  { n: 'notfall_name', t: 'Notfallkontakt (Name, Beziehung)', g: 'Anschrift' },
  { n: 'notfall_telefon', t: 'Notfallkontakt Telefon', g: 'Anschrift' },
  // Beschäftigung
  { n: 'eintritt', t: 'Eintritt', g: 'Beschäftigung', typ: 'date', pflicht: true },
  { n: 'austritt', t: 'Austritt', g: 'Beschäftigung', typ: 'date' },
  { n: 'beschaeftigungsart', t: 'Beschäftigungsart', g: 'Beschäftigung', pflicht: true, typ: 'wahl', o: [['', '—'], ['vollzeit', 'Vollzeit'], ['teilzeit', 'Teilzeit'], ['minijob', 'Minijob (geringfügig)'], ['kurzfristig', 'kurzfristig beschäftigt'], ['werkstudent', 'Werkstudent'], ['azubi', 'Auszubildende/r'], ['aushilfe', 'Aushilfe']] },
  { n: 'taetigkeit', t: 'Tätigkeit / Funktion', g: 'Beschäftigung' },
  { n: 'probezeit_bis', t: 'Probezeit bis', g: 'Beschäftigung', typ: 'date' },
  { n: 'befristet_bis', t: 'Befristet bis (leer = unbefristet)', g: 'Beschäftigung', typ: 'date' },
  { n: 'arbeitstage_woche', t: 'Arbeitstage je Woche', g: 'Beschäftigung', typ: 'number', sql: 'REAL' },
  { n: 'urlaubsanspruch', t: 'Urlaubsanspruch (Tage im Jahr)', g: 'Beschäftigung', typ: 'number', sql: 'REAL' },
  { n: 'mehrfachbeschaeftigung', t: 'Weitere Beschäftigung bei anderem Arbeitgeber', g: 'Beschäftigung', typ: 'wahl', o: JN },
  { n: 'rv_befreiung', t: 'Minijob: Befreiung von der Rentenversicherungspflicht beantragt', g: 'Beschäftigung', typ: 'wahl', o: JN },
  { n: 'schulabschluss', t: 'Höchster Schulabschluss (Tätigkeitsschlüssel)', g: 'Beschäftigung', typ: 'wahl', o: [['', '—'], ['1', 'ohne Schulabschluss'], ['2', 'Haupt-/Volksschulabschluss'], ['3', 'Mittlere Reife'], ['4', 'Abitur / Fachabitur'], ['9', 'unbekannt']] },
  { n: 'ausbildung', t: 'Höchste Berufsausbildung (Tätigkeitsschlüssel)', g: 'Beschäftigung', typ: 'wahl', o: [['', '—'], ['1', 'ohne beruflichen Abschluss'], ['2', 'anerkannte Berufsausbildung'], ['3', 'Meister/Techniker'], ['4', 'Bachelor'], ['5', 'Diplom/Master'], ['6', 'Promotion'], ['9', 'unbekannt']] },
  // Steuer und Sozialversicherung
  { n: 'steuer_id', t: 'Steuer-Identifikationsnummer', g: 'Steuer & Sozialversicherung', pflicht: true, pruef: 'steuerId' },
  { n: 'steuerklasse', t: 'Steuerklasse', g: 'Steuer & Sozialversicherung', typ: 'wahl', o: [['', '—'], ['1', 'I'], ['2', 'II'], ['3', 'III'], ['4', 'IV'], ['5', 'V'], ['6', 'VI']] },
  { n: 'kinderfreibetraege', t: 'Kinderfreibeträge', g: 'Steuer & Sozialversicherung', typ: 'number', sql: 'REAL' },
  { n: 'konfession', t: 'Konfession (Kirchensteuer)', g: 'Steuer & Sozialversicherung', typ: 'wahl', o: [['', '—'], ['keine', 'keine'], ['ev', 'evangelisch'], ['rk', 'römisch-katholisch'], ['ak', 'altkatholisch'], ['sonstige', 'sonstige kirchensteuerpflichtige']] },
  { n: 'sv_nummer', t: 'Sozialversicherungsnummer', g: 'Steuer & Sozialversicherung', pflicht: true, pruef: 'svNummer' },
  { n: 'krankenkasse', t: 'Krankenkasse', g: 'Steuer & Sozialversicherung', pflicht: true },
  { n: 'kv_art', t: 'Krankenversicherung', g: 'Steuer & Sozialversicherung', typ: 'wahl', o: [['', '—'], ['gesetzlich', 'gesetzlich'], ['privat', 'privat'], ['familie', 'familienversichert (Minijob)']] },
  { n: 'schwerbehinderung', t: 'Schwerbehinderung (GdB)', g: 'Steuer & Sozialversicherung' },
  // Bank
  { n: 'iban', t: 'IBAN', g: 'Bankverbindung', pflicht: true, pruef: 'iban' },
  { n: 'bic', t: 'BIC', g: 'Bankverbindung' },
  { n: 'kontoinhaber', t: 'Kontoinhaber (falls abweichend)', g: 'Bankverbindung' },
  // Aufenthalt und Arbeitserlaubnis
  { n: 'aufenthaltstitel', t: 'Aufenthaltsstatus', g: 'Aufenthalt & Arbeitserlaubnis', typ: 'wahl', o: [['', '—'], ['deutsch', 'deutsche Staatsangehörigkeit'], ['eu', 'EU/EWR/Schweiz (freizügig)'], ['niederlassung', 'Niederlassungserlaubnis / Daueraufenthalt'], ['aufenthalt', 'Aufenthaltserlaubnis'], ['blaue_karte', 'Blaue Karte EU'], ['duldung', 'Duldung / Gestattung'], ['sonstiges', 'sonstiges']] },
  { n: 'aufenthalt_bis', t: 'Aufenthaltstitel gültig bis', g: 'Aufenthalt & Arbeitserlaubnis', typ: 'date' },
  { n: 'arbeitserlaubnis', t: 'Beschäftigung erlaubt (laut Titel)', g: 'Aufenthalt & Arbeitserlaubnis', typ: 'wahl', o: [['', '—'], ['ja', 'ja, uneingeschränkt'], ['eingeschraenkt', 'ja, mit Auflagen'], ['nein', 'nein']] },
  // Sonstiges
  { n: 'fuehrerschein', t: 'Führerschein (Klasse)', g: 'Sonstiges' },
  { n: 'kleidergroesse', t: 'Dienstkleidung (Größe)', g: 'Sonstiges' },
  { n: 'personal_notiz', t: 'Notiz (nur Büro)', g: 'Sonstiges', typ: 'text' }
];
const GRUPPEN = [...new Set(FELDER.map(function (f) { return f.g; }))];
const DOKUMENTARTEN = [['vertrag', 'Arbeitsvertrag'], ['personalfragebogen', 'Personalfragebogen (unterschrieben)'], ['ausweis', 'Personalausweis / Pass'], ['aufenthalt', 'Aufenthaltstitel'], ['sv_ausweis', 'SV-Ausweis / Meldung'], ['gesundheit', 'Belehrung Infektionsschutz / Gesundheit'], ['unterweisung', 'Unterweisung Arbeitsschutz / Gefahrstoffe'], ['fuehrerschein', 'Führerschein'], ['bescheinigung', 'Bescheinigung (Krankenkasse, Schule …)'], ['abmahnung', 'Abmahnung'], ['zeugnis', 'Zeugnis'], ['sonstiges', 'Sonstiges']];

// ---------- Prüfungen (nur Formfehler — ob die Nummer vergeben ist, weiß nur das Amt)
function steuerId(v) {   // 11 Ziffern, erste ≠ 0, Prüfziffer nach ISO 7064 MOD 11,10
  const s = String(v || '').replace(/\s/g, '');
  if (!/^[1-9]\d{10}$/.test(s)) return 'Die Steuer-ID hat 11 Ziffern und beginnt nicht mit 0.';
  let produkt = 10;
  for (let i = 0; i < 10; i++) { let summe = (Number(s[i]) + produkt) % 10; if (!summe) summe = 10; produkt = (summe * 2) % 11; }
  let pz = 11 - produkt; if (pz === 10) pz = 0;
  return pz === Number(s[10]) ? null : 'Die Prüfziffer der Steuer-ID stimmt nicht — bitte Zahlendreher prüfen.';
}
function svNummer(v, m) {   // 12 Stellen: Bereich (2) · Geburtsdatum TTMMJJ (6) · Anfangsbuchstabe Geburtsname · Seriennummer (2) · Prüfziffer
  const s = String(v || '').replace(/\s/g, '').toUpperCase();
  if (!/^\d{8}[A-Z]\d{3}$/.test(s)) return 'Die SV-Nummer hat 12 Stellen, z. B. 65 170839 J 00 3.';
  const b = String(s.charCodeAt(8) - 64).padStart(2, '0');
  const ziffern = (s.slice(0, 8) + b + s.slice(9, 11)).split('').map(Number), gewicht = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1];
  const summe = ziffern.reduce(function (a, z, i) { const p = z * gewicht[i]; return a + Math.floor(p / 10) + (p % 10); }, 0);
  if (summe % 10 !== Number(s[11])) return 'Die Prüfziffer der SV-Nummer stimmt nicht — bitte Zahlendreher prüfen.';
  if (m && m.geburtsdatum && /^\d{4}-\d{2}-\d{2}$/.test(m.geburtsdatum)) {
    const g = m.geburtsdatum.slice(8, 10) + m.geburtsdatum.slice(5, 7) + m.geburtsdatum.slice(2, 4);
    if (s.slice(2, 8) !== g) return 'SV-Nummer und Geburtsdatum passen nicht zusammen (Stellen 3–8 = TTMMJJ).';
  }
  const gn = String((m && (m.geburtsname || m.nachname)) || '').trim().toUpperCase().replace(/^Ä/, 'A').replace(/^Ö/, 'O').replace(/^Ü/, 'U');
  if (gn && /^[A-Z]/.test(gn) && gn[0] !== s[8]) return 'Der Buchstabe in der SV-Nummer (' + s[8] + ') ist nicht der Anfangsbuchstabe des Geburtsnamens.';
  return null;
}
function iban(v) {
  const s = String(v || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return 'Die IBAN ist unvollständig.';
  if (s.slice(0, 2) === 'DE' && s.length !== 22) return 'Eine deutsche IBAN hat 22 Stellen.';
  const n = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, function (c) { return String(c.charCodeAt(0) - 55); });
  let rest = 0; for (let i = 0; i < n.length; i++) rest = (rest * 10 + Number(n[i])) % 97;
  return rest === 1 ? null : 'Die Prüfziffer der IBAN stimmt nicht.';
}
const PRUEF = { steuerId, svNummer, iban };

// Formular → Spaltenwerte (normalisiert und geprüft). Wirft bei Formfehlern mit allen Befunden auf einmal.
function lesen(b) {
  const w = {}, fehler = [];
  FELDER.forEach(function (f) {
    if (!(f.n in b)) return;
    let v = b[f.n]; v = v == null ? '' : String(v).trim();
    if (f.typ === 'number') v = v === '' ? null : Number(v.replace(',', '.'));
    else if (f.typ === 'date') { if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fehler.push(f.t + ': Datum im Format JJJJ-MM-TT'); v = v || null; }
    else v = v || null;
    if (f.n === 'iban' || f.n === 'sv_nummer' || f.n === 'bic') v = v ? v.replace(/\s/g, '').toUpperCase() : null;
    if (f.n === 'steuer_id') v = v ? v.replace(/\s/g, '') : null;
    if (f.typ === 'number' && v != null && !isFinite(v)) { fehler.push(f.t + ': keine Zahl'); v = null; }
    w[f.n] = v;
  });
  FELDER.forEach(function (f) { if (f.pruef && w[f.n]) { const x = PRUEF[f.pruef](w[f.n], w); if (x) fehler.push(x); } });
  if (w.eintritt && w.austritt && w.austritt < w.eintritt) fehler.push('Der Austritt liegt vor dem Eintritt.');
  if (fehler.length) { const e = new Error(fehler.join(' ')); e.fehler = fehler; throw e; }
  return w;
}
// Was fehlt für die Anmeldung beim Lohnbüro?
function luecken(m) { return FELDER.filter(function (f) { return f.pflicht && (m[f.n] == null || m[f.n] === ''); }).map(function (f) { return f.t; }); }

// ---------- Arbeitstage, Urlaub, Krankheit
const tag = d => new Date(d + 'T12:00:00Z');
const plus = (d, n) => { const x = tag(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// Arbeitstage zwischen von und bis (Mo–Fr bzw. Mo–Sa bei 6 Tagen, ohne Feiertage in SH)
function arbeitstage(von, bis, tageWoche) {
  let n = 0; const sechs = Number(tageWoche) >= 6;
  for (let d = von; d <= bis; d = plus(d, 1)) { const w = tag(d).getUTCDay(); if (w === 0 || (w === 6 && !sechs)) continue; if (FT.istFeiertag(d, 'SH')) continue; n++; }
  return n;
}
function abwesenheitTage(db, mid, art, von, bis, tageWoche) {
  return db.prepare('SELECT von, bis FROM abwesenheit WHERE mitarbeiter_id = ? AND lower(art) = ? AND bis >= ? AND von <= ?').all(mid, art, von, bis)
    .reduce(function (a, x) { return a + arbeitstage(x.von < von ? von : x.von, x.bis > bis ? bis : x.bis, tageWoche); }, 0);
}
// Urlaubskonto: Jahresanspruch, anteilig bei Ein-/Austritt im Jahr (je voller Monat 1/12, ab ½ Tag aufgerundet — § 5 BUrlG)
function urlaub(db, m, jahr) {
  const von = jahr + '-01-01', bis = jahr + '-12-31', voll = Number(m.urlaubsanspruch) || 0;
  let monate = 12;
  if ((m.eintritt && m.eintritt > von) || (m.austritt && m.austritt < bis)) {
    const a = m.eintritt && m.eintritt > von ? m.eintritt : von, e = m.austritt && m.austritt < bis ? m.austritt : bis;
    monate = 0; for (let mo = 1; mo <= 12; mo++) { const mv = jahr + '-' + String(mo).padStart(2, '0') + '-01', mb = jahr + '-' + String(mo).padStart(2, '0') + '-' + String(new Date(Date.UTC(jahr, mo, 0)).getUTCDate()).padStart(2, '0'); if (a <= mv && e >= mb) monate++; }
  }
  // Bruchteile unter ½ Tag bleiben als Bruchteil stehen (BAG), ab ½ Tag wird aufgerundet. Sonderfälle (Austritt in der
  // zweiten Jahreshälfte nach erfüllter Wartezeit = voller gesetzlicher Anspruch) klärt das Lohnbüro.
  let anspruch = voll * monate / 12; anspruch = (anspruch % 1) >= 0.5 ? Math.ceil(anspruch) : Math.round(anspruch * 10) / 10;
  const genommen = abwesenheitTage(db, m.id, 'urlaub', von, bis, m.arbeitstage_woche);
  return { jahr: jahr, anspruch: anspruch, voll: voll, monate: monate, genommen: genommen, rest: Math.round((anspruch - genommen) * 10) / 10 };
}

// Monatsauswertung je Mitarbeiter: Soll (Wochenstunden), geplant (Dienstplan), gestempelt, Urlaub, krank
function auswertung(db, monat) {
  const DP = require('./dienstplan');
  const von = monat + '-01', ende = monat + '-' + String(new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');
  const stunden = {}; DP.stunden(db, von, ende).forEach(function (s) { stunden[s.id] = s; });
  return db.prepare("SELECT * FROM mitarbeiter WHERE aktiv = 1 OR (austritt IS NOT NULL AND austritt >= ?) ORDER BY name").all(von).map(function (m) {
    const at = arbeitstage(von, ende, m.arbeitstage_woche), tw = Number(m.arbeitstage_woche) || 5;
    const soll = m.wochenstunden ? Math.round(m.wochenstunden / tw * at * 100) / 100 : null;
    const geplant = DP.schichtenZeitraum(db, von, ende, m.id).reduce(function (a, x) { return a + DP.dauer(x.beginn, x.ende, x.pause_min); }, 0) / 60;
    const s = stunden[m.id], ist = s ? s.ist.stunden : 0;
    const u = abwesenheitTage(db, m.id, 'urlaub', von, ende, m.arbeitstage_woche), k = abwesenheitTage(db, m.id, 'krank', von, ende, m.arbeitstage_woche);
    // bezahlte Abwesenheit (Urlaub, Krankheit) zählt anteilig zum Soll
    const abwStd = m.wochenstunden ? Math.round((u + k) * m.wochenstunden / tw * 100) / 100 : 0;
    return { id: m.id, name: m.name, personalnummer: m.personalnummer, beschaeftigungsart: m.beschaeftigungsart || (m.minijob ? 'minijob' : ''),
      arbeitstage: at, soll: soll, geplant: Math.round(geplant * 100) / 100, ist: ist, urlaubTage: u, krankTage: k, abwesenheitStunden: abwStd,
      saldo: soll == null ? null : Math.round((ist + abwStd - soll) * 100) / 100, nacht: s ? s.ist.nacht : 0, sonntag: s ? s.ist.sonntag : 0, feiertag: s ? s.ist.feiertag : 0 };
  });
}

// Fristen und Lücken: Aufenthaltstitel, Befristung, Probezeit, Dokumente mit Ablaufdatum, fehlende Pflichtangaben
function fristen(db, heute, tage) {
  const bis = plus(heute, tage || 60), aus = [];
  db.prepare('SELECT * FROM mitarbeiter WHERE aktiv = 1 ORDER BY name').all().forEach(function (m) {
    [['aufenthalt_bis', 'Aufenthaltstitel läuft ab'], ['befristet_bis', 'Befristung endet'], ['probezeit_bis', 'Probezeit endet']].forEach(function (x) {
      if (m[x[0]] && m[x[0]] <= bis) aus.push({ mitarbeiter_id: m.id, name: m.name, was: x[1], datum: m[x[0]], abgelaufen: m[x[0]] < heute, dringend: x[0] === 'aufenthalt_bis' });
    });
    const l = luecken(m); if (l.length) aus.push({ mitarbeiter_id: m.id, name: m.name, was: 'Personalakte unvollständig: ' + l.join(', '), datum: null });
  });
  db.prepare('SELECT d.*, m.name FROM mitarbeiter_dokument d JOIN mitarbeiter m ON m.id = d.mitarbeiter_id WHERE m.aktiv = 1 AND d.gueltig_bis IS NOT NULL AND d.gueltig_bis <= ? ORDER BY d.gueltig_bis').all(bis).forEach(function (d) {
    aus.push({ mitarbeiter_id: d.mitarbeiter_id, name: d.name, was: 'Dokument läuft ab: ' + (d.titel || (DOKUMENTARTEN.find(function (a) { return a[0] === d.art; }) || [0, d.art])[1]), datum: d.gueltig_bis, abgelaufen: d.gueltig_bis < heute });
  });
  return aus.sort(function (a, b) { return (a.datum || '9') < (b.datum || '9') ? -1 : 1; });
}

// Personalstammdaten als Semikolon-Datei für das Lohnbüro (Neuanlage und Änderungen im Lohnprogramm)
function stammdatenDatei(db) {
  const spalten = ['personalnummer', 'name'].concat(FELDER.filter(function (f) { return f.n !== 'personal_notiz'; }).map(function (f) { return f.n; })).concat(['wochenstunden', 'lohngruppe', 'stundenlohn', 'telefon']);
  const kopf = spalten.map(function (s) { const f = FELDER.find(function (x) { return x.n === s; }); return f ? f.t : { personalnummer: 'Personalnummer', name: 'Name', wochenstunden: 'Wochenstunden', lohngruppe: 'Lohngruppe', stundenlohn: 'Stundenlohn', telefon: 'Telefon' }[s]; });
  const zelle = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const zeilen = db.prepare('SELECT * FROM mitarbeiter ORDER BY aktiv DESC, name').all().map(function (m) {
    return spalten.map(function (s) { let v = m[s]; if (typeof v === 'number') v = String(v).replace('.', ','); if (/^\d{4}-\d{2}-\d{2}$/.test(v || '')) v = v.split('-').reverse().join('.'); return zelle(v); }).join(';');
  });
  return '﻿' + [kopf.map(zelle).join(';')].concat(zeilen).join('\r\n') + '\r\n';
}

module.exports = { FELDER, GRUPPEN, DOKUMENTARTEN, lesen, luecken, steuerId, svNummer, iban, arbeitstage, urlaub, auswertung, fristen, stammdatenDatei };
