// register.js — Arbeitsschutz, Qualitätsmanagement und Verwaltung als Register (nach dem Vorbild der Staffsec-Ordner
// 11_ARBEITSSCHUTZ, ISO-9001-Formblätter QMF-xx, Fahrzeug-Master, Subunternehmerverträge, Dokumentenlenkung).
//
// Ein Register = eine Feldliste. Daraus entstehen Formular, Liste, Suche, Fristen (Wiedervorlage), CSV und PDF.
// Gespeichert wird je Eintrag ein JSON — neue Felder brauchen keine Datenbankänderung.
// Feldtypen: text · lang · datum · frist (Datum mit Wiedervorlage) · zahl · wahl · ja · mitarbeiter · objekt · kunde ·
//            datei (PDF/Bild) · tabelle (Zeilen mit eigenen Spalten; Spalten vom Typ frist zählen mit)
'use strict';

const JN = [['', '—'], ['ja', 'ja'], ['nein', 'nein']];
const F = (n, t, typ, x) => Object.assign({ n: n, t: t, typ: typ || 'text' }, x || {});
const REGISTER = [
  // ---------------- Arbeitsschutz
  { id: 'gefahrstoffe', gruppe: 'Arbeitsschutz', titel: 'Gefahrstoffverzeichnis', text: 'Alle Reinigungs- und Pflegemittel mit Sicherheitsdatenblatt, Gefahrensymbolen, Einsatzorten und Betriebsanweisung (§ 6 Abs. 12 GefStoffV). Sicherheitsdatenblätter regelmäßig auf den neuesten Stand prüfen.',
    felder: [F('produkt', 'Produkt', 'text', { pflicht: true }), F('hersteller', 'Hersteller'), F('verwendung', 'Verwendung (z. B. Sanitärreiniger, Grundreiniger)'), F('ghs', 'Gefahrensymbole (GHS)', 'wahl', { mehr: true, o: [['GHS02', 'GHS02 entzündbar'], ['GHS05', 'GHS05 ätzend'], ['GHS07', 'GHS07 reizend / Achtung'], ['GHS08', 'GHS08 gesundheitsgefährdend'], ['GHS09', 'GHS09 umweltgefährdend'], ['GHS03', 'GHS03 brandfördernd'], ['GHS06', 'GHS06 giftig']] }),
      F('signalwort', 'Signalwort', 'wahl', { o: [['', '—'], ['Achtung', 'Achtung'], ['Gefahr', 'Gefahr']] }), F('menge', 'Lagermenge (ca.)'), F('lagerort', 'Lagerort'), F('objekte', 'eingesetzt in Objekten'), F('sdb', 'Sicherheitsdatenblatt', 'datei'), F('sdb_datum', 'Stand des Sicherheitsdatenblatts', 'datum'),
      F('sdb_pruefen', 'Sicherheitsdatenblatt nächste Prüfung', 'frist'), F('psa', 'Schutzausrüstung (Handschuhe, Brille …)'), F('betriebsanweisung', 'Betriebsanweisung (Gefahren, Schutzmaßnahmen, Verhalten im Gefahrfall, Erste Hilfe, Entsorgung)', 'lang'), F('hautschutz', 'Hautschutzplan (Schutz, Reinigung, Pflege)', 'lang'), F('ersatz', 'Ersatzstoffprüfung (weniger gefährliches Mittel möglich?)', 'lang')],
    liste: ['produkt', 'verwendung', 'ghs', 'signalwort', 'sdb_datum', 'sdb_pruefen'], pdf: 'Betriebsanweisung' },
  { id: 'gbu', gruppe: 'Arbeitsschutz', titel: 'Gefährdungsbeurteilungen', text: 'Je Tätigkeit oder Objekt: Gefährdungen, Bewertung (Schwere × Wahrscheinlichkeit), Maßnahmen nach dem TOP-Prinzip, Restrisiko, Wirksamkeitskontrolle (§ 5 ArbSchG).',
    felder: [F('titel', 'Tätigkeit / Bereich', 'text', { pflicht: true }), F('objekt_id', 'Objekt (leer = allgemein)', 'objekt'), F('ersteller', 'erstellt von'), F('datum', 'erstellt am', 'datum'), F('revision', 'nächste Überprüfung', 'frist'),
      F('gefaehrdungen', 'Gefährdungen und Maßnahmen', 'tabelle', { spalten: [F('gefaehrdung', 'Gefährdung'), F('schwere', 'Schwere 1–3', 'zahl'), F('wahrscheinlichkeit', 'Wahrscheinlichkeit 1–3', 'zahl'), F('massnahme', 'Maßnahme (T/O/P)'), F('verantwortlich', 'verantwortlich'), F('frist', 'umgesetzt bis', 'frist'), F('restrisiko', 'Restrisiko', 'wahl', { o: [['', '—'], ['gering', 'gering'], ['mittel', 'mittel'], ['hoch', 'hoch']] })] }),
      F('psa', 'Persönliche Schutzausrüstung'), F('notfall', 'Notfall und Erste Hilfe', 'lang'), F('vorsorge', 'Arbeitsmedizinische Vorsorge (Angebot/Pflicht)'), F('wirksamkeit', 'Wirksamkeitskontrolle', 'lang')],
    liste: ['titel', 'objekt_id', 'datum', 'revision'], pdf: 'Gefährdungsbeurteilung' },
  { id: 'unfaelle', gruppe: 'Arbeitsschutz', titel: 'Unfälle, Verbandbuch & Schäden', text: 'Arbeitsunfälle, Erste-Hilfe-Leistungen (Verbandbuch, 5 Jahre aufbewahren) und Sachschäden beim Kunden. Arbeitsunfall mit mehr als 3 Kalendertagen Arbeitsunfähigkeit: Unfallanzeige an die Berufsgenossenschaft binnen 3 Tagen (§ 193 SGB VII).',
    felder: [F('art', 'Art', 'wahl', { pflicht: true, o: [['arbeitsunfall', 'Arbeitsunfall'], ['wegeunfall', 'Wegeunfall'], ['verbandbuch', 'Erste Hilfe (Verbandbuch)'], ['sachschaden', 'Sachschaden beim Kunden'], ['fahrzeug', 'Fahrzeugschaden / Unfall']] }), F('datum', 'Datum', 'datum', { pflicht: true }), F('uhrzeit', 'Uhrzeit'), F('objekt_id', 'Objekt', 'objekt'),
      F('mitarbeiter_id', 'Betroffene/r bzw. Verursacher/in', 'mitarbeiter'), F('hergang', 'Hergang', 'lang', { pflicht: true }), F('verletzung', 'Art der Verletzung / des Schadens', 'lang'), F('ersthelfer', 'Erste Hilfe geleistet von'), F('massnahmen', 'Maßnahmen', 'lang'), F('ausfalltage', 'Tage arbeitsunfähig', 'zahl'),
      F('bg_meldung', 'Unfallanzeige an die BG erstattet am', 'datum'), F('versicherung', 'Versicherung informiert (Schaden)', 'wahl', { o: JN }), F('schadennummer', 'Schadennummer'), F('foto', 'Foto / Unterlage', 'datei'), F('status', 'Status', 'wahl', { o: [['offen', 'offen'], ['erledigt', 'erledigt']] })],
    liste: ['datum', 'art', 'objekt_id', 'mitarbeiter_id', 'ausfalltage', 'status'], pruefung: 'unfall', pdf: 'Unfall- / Schadensmeldung' },
  { id: 'beauftragte', gruppe: 'Arbeitsschutz', titel: 'Beauftragte & Ersthelfer', text: 'Ersthelfer, Brandschutzhelfer, Sicherheitsbeauftragte, Datenschutz- und QM-Beauftragte mit Bestellung und Gültigkeit der Ausbildung. Ersthelfer-Quote nach DGUV Vorschrift 1 § 26.',
    felder: [F('rolle', 'Rolle', 'wahl', { pflicht: true, o: [['ersthelfer', 'Ersthelfer/in'], ['brandschutz', 'Brandschutzhelfer/in'], ['sifa', 'Sicherheitsbeauftragte/r'], ['fasi', 'Fachkraft für Arbeitssicherheit (extern)'], ['betriebsarzt', 'Betriebsarzt (extern)'], ['datenschutz', 'Datenschutzbeauftragte/r'], ['qmb', 'QM-Beauftragte/r']] }),
      F('mitarbeiter_id', 'Mitarbeiter/in', 'mitarbeiter'), F('extern', 'oder extern (Name, Firma)'), F('bestellt_am', 'bestellt am', 'datum'), F('ausbildung', 'Ausbildung / Lehrgang'), F('gueltig_bis', 'Ausbildung gültig bis', 'frist'), F('bestellung', 'Bestellungsurkunde', 'datei')],
    liste: ['rolle', 'mitarbeiter_id', 'extern', 'bestellt_am', 'gueltig_bis'] },
  // ---------------- Personal & Ausstattung
  { id: 'ausgaben', gruppe: 'Personal & Ausstattung', titel: 'Ausgabe: Kleidung, Schlüssel, Arbeitsmittel', text: 'Was wer bekommen hat — Dienstkleidung, Schlüssel und Transponder je Objekt, Geräte, Handy. Die Kraft bestätigt den Empfang in der App (Quittung); beim Austritt erscheint alles, was noch zurückkommen muss.',
    felder: [F('art', 'Art', 'wahl', { pflicht: true, o: [['kleidung', 'Dienstkleidung'], ['schluessel', 'Schlüssel / Transponder'], ['geraet', 'Gerät / Maschine'], ['handy', 'Handy / Tablet'], ['sonstiges', 'Sonstiges']] }), F('gegenstand', 'Gegenstand', 'text', { pflicht: true }), F('merkmal', 'Größe / Schlüsselnummer / Seriennummer'), F('anzahl', 'Anzahl', 'zahl'),
      F('mitarbeiter_id', 'ausgegeben an', 'mitarbeiter', { pflicht: true }), F('objekt_id', 'Objekt (bei Schlüsseln)', 'objekt'), F('ausgabe', 'ausgegeben am', 'datum', { pflicht: true }), F('rueckgabe', 'zurück am', 'datum'), F('verlust', 'verloren / gemeldet am', 'datum'), F('notiz', 'Notiz', 'lang')],
    liste: ['ausgabe', 'mitarbeiter_id', 'art', 'gegenstand', 'merkmal', 'objekt_id', 'rueckgabe'], quittung: true, pdf: 'Empfangsbestätigung' },
  { id: 'checklisten', gruppe: 'Personal & Ausstattung', titel: 'Checklisten Ein- und Austritt', text: 'Jeder Eintritt und Austritt mit festen Schritten, Zuständigen und Fristen — entsteht beim Einstellen bzw. beim Eintragen des Austritts automatisch.',
    felder: [F('art', 'Art', 'wahl', { pflicht: true, o: [['eintritt', 'Eintritt'], ['austritt', 'Austritt']] }), F('mitarbeiter_id', 'Mitarbeiter/in', 'mitarbeiter', { pflicht: true }), F('stichtag', 'Stichtag (Eintritt / Austritt)', 'datum'),
      F('punkte', 'Schritte', 'tabelle', { spalten: [F('schritt', 'Schritt'), F('wer', 'zuständig'), F('frist', 'bis', 'frist'), F('erledigt', 'erledigt', 'ja')] }), F('notiz', 'Notiz', 'lang')],
    liste: ['art', 'mitarbeiter_id', 'stichtag'], fortschritt: 'punkte' },
  { id: 'fuehrerscheine', gruppe: 'Personal & Ausstattung', titel: 'Führerscheinkontrolle', text: 'Wer ein Firmenfahrzeug fährt, dessen Führerschein wird regelmäßig (üblich alle 6 Monate) im Original geprüft — Halterhaftung § 21 StVG.',
    felder: [F('mitarbeiter_id', 'Fahrer/in', 'mitarbeiter', { pflicht: true }), F('klassen', 'Klassen'), F('gueltig_bis', 'Führerschein gültig bis', 'datum'), F('geprueft_am', 'geprüft am', 'datum', { pflicht: true }), F('geprueft_von', 'geprüft von'), F('naechste', 'nächste Kontrolle', 'frist'), F('kopie', 'Kopie / Nachweis', 'datei')],
    liste: ['mitarbeiter_id', 'klassen', 'geprueft_am', 'naechste'], standard: { naechsteMonate: 6 } },
  // ---------------- Fuhrpark
  { id: 'fahrzeuge', gruppe: 'Fuhrpark', titel: 'Fahrzeuge', text: 'Firmenfahrzeuge mit HU, Wartung, Versicherung und festem Fahrer.',
    felder: [F('kennzeichen', 'Kennzeichen', 'text', { pflicht: true }), F('typ', 'Fahrzeug (Marke, Modell)'), F('fin', 'Fahrgestellnummer'), F('besitz', 'Besitz', 'wahl', { o: [['', '—'], ['eigen', 'Eigentum'], ['leasing', 'Leasing'], ['miete', 'Miete']] }), F('fahrer_id', 'fester Fahrer', 'mitarbeiter'),
      F('hu', 'nächste Hauptuntersuchung', 'frist'), F('wartung', 'nächste Wartung', 'frist'), F('versicherung', 'Versicherung / Vertragsnummer'), F('leasing_ende', 'Leasing- / Mietende', 'frist'), F('km', 'km-Stand (zuletzt)', 'zahl'), F('schein', 'Fahrzeugschein', 'datei')],
    liste: ['kennzeichen', 'typ', 'fahrer_id', 'hu', 'wartung', 'km'] },
  { id: 'fahrzeuguebergaben', gruppe: 'Fuhrpark', titel: 'Fahrzeugübergaben', text: 'Übergabeprotokoll mit km-Stand, Tank, Zustand, Schäden und Fotos — bei jedem Fahrerwechsel.',
    felder: [F('kennzeichen', 'Fahrzeug (Kennzeichen)', 'text', { pflicht: true }), F('datum', 'Datum', 'datum', { pflicht: true }), F('von', 'übergeben von'), F('an_id', 'übernommen von', 'mitarbeiter'), F('km', 'km-Stand', 'zahl'), F('tank', 'Tank / Ladung'), F('zustand', 'Zustand innen / außen', 'lang'), F('schaeden', 'Schäden (neu / vorhanden)', 'lang'), F('zubehoer', 'Zubehör (Warndreieck, Verbandkasten, Weste …)'), F('fotos', 'Fotos / Video-Beleg', 'datei')],
    liste: ['datum', 'kennzeichen', 'an_id', 'km'], pdf: 'Übergabeprotokoll' },
  // ---------------- Qualität & Verwaltung
  { id: 'massnahmen', gruppe: 'Qualität & Verwaltung', titel: 'Maßnahmenplan (QM)', text: 'Korrektur- und Verbesserungsmaßnahmen aus Reklamationen, Audits, Unfällen, Gefährdungsbeurteilungen und Kundenumfragen — mit Frist und Wirksamkeitsprüfung (ISO 9001, 10.2).',
    felder: [F('quelle', 'Anlass', 'wahl', { pflicht: true, o: [['reklamation', 'Reklamation'], ['audit', 'Audit / Prüfung'], ['unfall', 'Unfall / Beinahe-Unfall'], ['gbu', 'Gefährdungsbeurteilung'], ['umfrage', 'Kundenumfrage'], ['intern', 'interner Vorschlag']] }), F('objekt_id', 'Objekt', 'objekt'), F('beschreibung', 'Feststellung', 'lang', { pflicht: true }), F('ursache', 'Ursache', 'lang'),
      F('massnahme', 'Maßnahme', 'lang', { pflicht: true }), F('verantwortlich', 'verantwortlich'), F('frist', 'umzusetzen bis', 'frist'), F('status', 'Status', 'wahl', { o: [['offen', 'offen'], ['umgesetzt', 'umgesetzt'], ['wirksam', 'wirksam'], ['unwirksam', 'nicht wirksam — neu planen']] }), F('wirksamkeit', 'Wirksamkeitsprüfung (wann, wie, Ergebnis)', 'lang')],
    liste: ['quelle', 'objekt_id', 'beschreibung', 'frist', 'status'] },
  { id: 'subunternehmer', gruppe: 'Qualität & Verwaltung', titel: 'Subunternehmer', text: 'Nachunternehmer mit Vertrag und Nachweisen (Unbedenklichkeit Finanzamt, Krankenkasse, BG, Mindestlohn-Erklärung) — ohne gültigen Nachweis kein Einsatz (Auftraggeberhaftung § 14 AEntG, § 13 MiLoG, § 28e SGB IV).',
    felder: [F('firma', 'Firma', 'text', { pflicht: true }), F('ansprechpartner', 'Ansprechpartner'), F('telefon', 'Telefon'), F('email', 'E-Mail'), F('leistung', 'Leistungen / Gewerke'), F('vertrag', 'Vertrag', 'datei'), F('vertrag_bis', 'Vertrag bis', 'frist'),
      F('nachweise', 'Nachweise', 'tabelle', { spalten: [F('nachweis', 'Nachweis'), F('gueltig', 'gültig bis', 'frist'), F('vorhanden', 'liegt vor', 'ja')] }), F('unterweisung', 'Arbeitsschutz-Bestätigung liegt vor', 'wahl', { o: JN }), F('bewertung', 'Bewertung 1–5', 'zahl'), F('gesperrt', 'gesperrt', 'wahl', { o: JN })],
    liste: ['firma', 'leistung', 'vertrag_bis', 'bewertung', 'gesperrt'], standard: { nachweise: ['Unbedenklichkeitsbescheinigung Finanzamt', 'Unbedenklichkeitsbescheinigung Krankenkasse(n)', 'Unbedenklichkeitsbescheinigung Berufsgenossenschaft', 'Erklärung Mindestlohn / Tariflohn', 'Gewerbeanmeldung / Handwerksrolle', 'Betriebshaftpflicht'] } },
  { id: 'lieferanten', gruppe: 'Qualität & Verwaltung', titel: 'Lieferantenbewertung', text: 'Lieferanten für Reinigungsmittel, Maschinen, Kleidung — jährlich bewertet nach Qualität, Termintreue, Preis und Service (ISO 9001, 8.4).',
    felder: [F('lieferant', 'Lieferant', 'text', { pflicht: true }), F('warengruppe', 'Warengruppe'), F('kundennummer', 'unsere Kundennummer'), F('ansprechpartner', 'Ansprechpartner'), F('qualitaet', 'Qualität 1–5', 'zahl'), F('termintreue', 'Termintreue 1–5', 'zahl'), F('preis', 'Preis 1–5', 'zahl'), F('service', 'Service 1–5', 'zahl'), F('bewertet_am', 'bewertet am', 'datum'), F('naechste', 'nächste Bewertung', 'frist'), F('freigabe', 'Status', 'wahl', { o: [['frei', 'freigegeben'], ['bedingt', 'bedingt'], ['gesperrt', 'gesperrt']] })],
    liste: ['lieferant', 'warengruppe', 'bewertet_am', 'naechste', 'freigabe'], schnitt: ['qualitaet', 'termintreue', 'preis', 'service'] },
  { id: 'rechtskataster', gruppe: 'Qualität & Verwaltung', titel: 'Rechtskataster', text: 'Welche Gesetze und Vorschriften für uns gelten, in welcher Fassung, wann zuletzt geprüft — Grundlage für Audit und Arbeitsschutz.',
    felder: [F('vorschrift', 'Vorschrift', 'text', { pflicht: true }), F('bereich', 'Bereich', 'wahl', { o: [['arbeitsschutz', 'Arbeitsschutz'], ['umwelt', 'Umwelt / Gefahrstoffe'], ['personal', 'Personal / Arbeitsrecht'], ['steuer', 'Steuer / Rechnung'], ['datenschutz', 'Datenschutz'], ['tarif', 'Tarif'], ['sonstiges', 'sonstiges']] }), F('fundstelle', 'Fundstelle / Link'), F('fassung', 'Fassung vom', 'datum'), F('relevanz', 'Was folgt daraus für uns?', 'lang'), F('geprueft_am', 'zuletzt geprüft', 'datum'), F('naechste', 'nächste Prüfung', 'frist')],
    liste: ['vorschrift', 'bereich', 'fassung', 'geprueft_am', 'naechste'],
    vorlage: [['ArbSchG — Arbeitsschutzgesetz', 'arbeitsschutz'], ['GefStoffV — Gefahrstoffverordnung', 'umwelt'], ['DGUV Vorschrift 1 — Grundsätze der Prävention', 'arbeitsschutz'], ['ArbZG — Arbeitszeitgesetz', 'personal'], ['MiLoG / Rahmentarifvertrag Gebäudereinigerhandwerk', 'tarif'], ['NachwG — Nachweisgesetz', 'personal'], ['UStG § 13b / § 14 — Rechnungen', 'steuer'], ['DSGVO / BDSG', 'datenschutz'], ['BetrSichV — Betriebssicherheitsverordnung (Leitern, Maschinen)', 'arbeitsschutz'], ['ArbMedVV — arbeitsmedizinische Vorsorge (Feuchtarbeit)', 'arbeitsschutz']] },
  { id: 'dokumente', gruppe: 'Qualität & Verwaltung', titel: 'Dokumentenlenkung', text: 'Formblätter, Anweisungen, Verträge und Vorlagen mit Version und Status Entwurf / freigegeben / archiviert — nur freigegebene Fassungen gelten.',
    felder: [F('titel', 'Dokument', 'text', { pflicht: true }), F('kennung', 'Kennung (z. B. QMF-08)'), F('bereich', 'Bereich'), F('version', 'Version'), F('status', 'Status', 'wahl', { o: [['entwurf', 'Entwurf'], ['frei', 'freigegeben'], ['archiv', 'archiviert']] }), F('freigegeben_von', 'freigegeben von'), F('freigegeben_am', 'freigegeben am', 'datum'), F('naechste', 'nächste Überprüfung', 'frist'), F('datei', 'Datei', 'datei')],
    liste: ['kennung', 'titel', 'version', 'status', 'freigegeben_am', 'naechste'] }
];

const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// Monatsende bleibt Monatsende: 31.03. + 6 Monate = 30.09. (nicht 01.10.)
const plusMonate = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'), tag = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const letzter = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(tag, letzter)); return x.toISOString().slice(0, 10); };
function tabellen(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS register_eintrag (id INTEGER PRIMARY KEY, register TEXT NOT NULL, daten TEXT NOT NULL, quittiert_am TEXT, angelegt_von TEXT, angelegt_am TEXT DEFAULT (datetime('now','localtime')), geaendert_am TEXT);
    CREATE INDEX IF NOT EXISTS register_art ON register_eintrag (register)`);
  // Rechtskataster einmalig mit den Vorschriften der Gebäudereinigung vorbelegen
  const rk = REGISTER.find(function (r) { return r.id === 'rechtskataster'; });
  if (!db.prepare("SELECT COUNT(*) n FROM register_eintrag WHERE register = 'rechtskataster'").get().n) rk.vorlage.forEach(function (v) { db.prepare("INSERT INTO register_eintrag (register, daten, angelegt_von) VALUES ('rechtskataster', ?, 'Glanzwerk')").run(JSON.stringify({ vorschrift: v[0], bereich: v[1], naechste: plusMonate(heute(), 12) })); });
}
const def = id => { const r = REGISTER.find(function (x) { return x.id === id; }); if (!r) throw new Error('Register unbekannt'); return r; };
function katalog(db) {
  return REGISTER.map(function (r) { return { id: r.id, gruppe: r.gruppe, titel: r.titel, text: r.text, anzahl: db.prepare('SELECT COUNT(*) n FROM register_eintrag WHERE register = ?').get(r.id).n, faellig: fristen(db, 30, r.id).length }; });
}
function lesen(r, b) {
  const w = {}, fehler = [];
  r.felder.forEach(function (f) {
    let v = b[f.n];
    if (f.typ === 'tabelle') { v = Array.isArray(v) ? v.map(function (z) { const o = {}; f.spalten.forEach(function (s) { let x = z[s.n]; if (s.typ === 'zahl') x = x === '' || x == null ? null : Number(String(x).replace(',', '.')); else if (s.typ === 'ja') x = x === true || x === 'ja' || x === '1'; else x = x == null ? '' : String(x).trim(); if ((s.typ === 'frist' || s.typ === 'datum') && x && !/^\d{4}-\d{2}-\d{2}$/.test(x)) fehler.push(f.t + ' / ' + s.t + ': Datum JJJJ-MM-TT'); o[s.n] = x; }); return o; }).filter(function (z) { return Object.keys(z).some(function (k) { return z[k] !== '' && z[k] != null && z[k] !== false; }); }) : []; w[f.n] = v; return; }
    if (f.typ === 'datei') return;   // Dateien laufen über einen eigenen Weg
    if (f.mehr) { v = Array.isArray(v) ? v.filter(Boolean) : String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); w[f.n] = v; return; }
    v = v == null ? '' : String(v).trim();
    if (f.typ === 'zahl') v = v === '' ? null : Number(v.replace(',', '.'));
    if (f.typ === 'zahl' && v != null && !isFinite(v)) { fehler.push(f.t + ': keine Zahl'); v = null; }
    if ((f.typ === 'datum' || f.typ === 'frist') && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fehler.push(f.t + ': Datum JJJJ-MM-TT');
    if (['mitarbeiter', 'objekt', 'kunde'].indexOf(f.typ) >= 0) v = v ? Number(v) : null;
    if (f.pflicht && (v === '' || v == null)) fehler.push(f.t + ' fehlt');
    w[f.n] = v === '' ? null : v;
  });
  if (fehler.length) throw new Error(fehler.join(' · '));
  return w;
}
function namen(db) {
  const ma = {}, ob = {}, ku = {};
  db.prepare('SELECT id, name FROM mitarbeiter').all().forEach(function (x) { ma[x.id] = x.name; });
  db.prepare('SELECT id, name FROM objekt').all().forEach(function (x) { ob[x.id] = x.name; });
  db.prepare('SELECT id, name FROM kunde').all().forEach(function (x) { ku[x.id] = x.name; });
  return { mitarbeiter: ma, objekt: ob, kunde: ku };
}
function eintrag(db, x, r, nm) {
  const d = JSON.parse(x.daten || '{}'); d.id = x.id; d.quittiert_am = x.quittiert_am; d.angelegt_am = x.angelegt_am; d.geaendert_am = x.geaendert_am;
  r.felder.forEach(function (f) { if (['mitarbeiter', 'objekt', 'kunde'].indexOf(f.typ) >= 0 && d[f.n]) d[f.n + '_name'] = nm[f.typ][d[f.n]] || ('#' + d[f.n]); });
  if (r.fortschritt) { const p = d[r.fortschritt] || []; d.fortschritt = p.length ? Math.round(p.filter(function (z) { return z.erledigt; }).length / p.length * 100) : null; }
  if (r.schnitt) { const w = r.schnitt.map(function (k) { return Number(d[k]); }).filter(function (v) { return v > 0; }); d.schnitt = w.length ? Math.round(w.reduce(function (a, v) { return a + v; }, 0) / w.length * 10) / 10 : null; }
  d.naechsteFrist = eigeneFristen(r, d).map(function (f) { return f.datum; }).sort()[0] || null;
  return d;
}
function liste(db, id) {
  const r = def(id), nm = namen(db);
  return db.prepare('SELECT * FROM register_eintrag WHERE register = ? ORDER BY id DESC').all(r.id).map(function (x) { return eintrag(db, x, r, nm); });
}
function holen(db, id, eid) {
  const r = def(id), x = db.prepare('SELECT * FROM register_eintrag WHERE id = ? AND register = ?').get(Number(eid), r.id); if (!x) throw new Error('Eintrag nicht gefunden');
  return eintrag(db, x, r, namen(db));
}
function speichern(db, id, b, von) {
  const r = def(id), w = lesen(r, b);
  if (r.id === 'fuehrerscheine' && w.geprueft_am && !w.naechste) w.naechste = plusMonate(w.geprueft_am, r.standard.naechsteMonate);
  if (b.id) {
    const alt = db.prepare('SELECT * FROM register_eintrag WHERE id = ? AND register = ?').get(Number(b.id), r.id); if (!alt) throw new Error('Eintrag nicht gefunden');
    const d = Object.assign(JSON.parse(alt.daten), w);   // Dateien bleiben erhalten
    db.prepare("UPDATE register_eintrag SET daten = ?, geaendert_am = datetime('now','localtime') WHERE id = ?").run(JSON.stringify(d), alt.id); return alt.id;
  }
  if (r.id === 'subunternehmer' && (!w.nachweise || !w.nachweise.length)) w.nachweise = r.standard.nachweise.map(function (n) { return { nachweis: n, gueltig: '', vorhanden: false }; });
  return Number(db.prepare('INSERT INTO register_eintrag (register, daten, angelegt_von) VALUES (?,?,?)').run(r.id, JSON.stringify(w), von || null).lastInsertRowid);
}
function loeschen(db, id, eid) { const r = def(id); return db.prepare('DELETE FROM register_eintrag WHERE id = ? AND register = ?').run(Number(eid), r.id).changes; }
function dateiSetzen(db, id, eid, feld, name, typ) {
  const r = def(id), f = r.felder.find(function (x) { return x.n === feld && x.typ === 'datei'; }); if (!f) throw new Error('Kein Dateifeld');
  const x = db.prepare('SELECT * FROM register_eintrag WHERE id = ? AND register = ?').get(Number(eid), r.id); if (!x) throw new Error('Eintrag nicht gefunden');
  const d = JSON.parse(x.daten); const alt = d[feld]; d[feld] = { datei: name, typ: typ, am: heute() };
  db.prepare("UPDATE register_eintrag SET daten = ?, geaendert_am = datetime('now','localtime') WHERE id = ?").run(JSON.stringify(d), x.id);
  return alt && alt.datei;
}
// Fristen: alle Felder vom Typ frist (auch in Tabellenzeilen), ohne erledigte Zeilen und ohne zurückgegebene/gesperrte Einträge
function eigeneFristen(r, d) {
  const aus = [];
  if (r.id === 'massnahmen' && (d.status === 'wirksam')) return aus;
  if (r.id === 'ausgaben' && d.rueckgabe) return aus;
  r.felder.forEach(function (f) {
    if (f.typ === 'frist' && d[f.n]) aus.push({ feld: f.t, datum: d[f.n] });
    if (f.typ === 'tabelle') (d[f.n] || []).forEach(function (z) { if (z.erledigt === true) return; f.spalten.forEach(function (s) { if (s.typ === 'frist' && z[s.n]) aus.push({ feld: f.t + ': ' + (z[f.spalten[0].n] || ''), datum: z[s.n] }); }); });
  });
  return aus;
}
function titelVon(r, d) { const f = r.felder.find(function (x) { return x.typ === 'text' && x.pflicht; }) || r.felder[0]; return String(d[f.n + '_name'] || d[f.n] || ('Eintrag ' + d.id)); }
function fristen(db, tage, nurRegister) {
  const bis = new Date(Date.now() + (tage || 30) * 86400000).toISOString().slice(0, 10), aus = [], nm = namen(db);
  REGISTER.filter(function (r) { return !nurRegister || r.id === nurRegister; }).forEach(function (r) {
    db.prepare('SELECT * FROM register_eintrag WHERE register = ?').all(r.id).forEach(function (x) {
      const d = eintrag(db, x, r, nm);
      eigeneFristen(r, d).forEach(function (f) { if (f.datum <= bis) aus.push({ register: r.id, registerTitel: r.titel, eintrag_id: x.id, titel: titelVon(r, d), was: f.feld, datum: f.datum, abgelaufen: f.datum < heute() }); });
    });
  });
  return aus.sort(function (a, b) { return a.datum < b.datum ? -1 : 1; });
}
// Prüfungen, die über reine Pflichtfelder hinausgehen
function hinweise(db, id, d) {
  const aus = [];
  if (id === 'unfaelle' && (d.art === 'arbeitsunfall' || d.art === 'wegeunfall') && Number(d.ausfalltage) > 3 && !d.bg_meldung) aus.push('Mehr als 3 Tage arbeitsunfähig: Unfallanzeige an die Berufsgenossenschaft binnen 3 Tagen (§ 193 SGB VII) — noch nicht eingetragen.');
  if (id === 'subunternehmer') { const fehlt = (d.nachweise || []).filter(function (n) { return !n.vorhanden || (n.gueltig && n.gueltig < heute()); }); if (fehlt.length) aus.push(fehlt.length + ' Nachweise fehlen oder sind abgelaufen — nicht einsetzen, bis sie vorliegen.'); }
  if (id === 'gefahrstoffe' && d.sdb_datum && d.sdb_datum < plusMonate(heute(), -36)) aus.push('Sicherheitsdatenblatt älter als 3 Jahre — beim Hersteller die aktuelle Fassung anfordern.');
  if (id === 'gefahrstoffe' && (d.ghs || []).length && !d.betriebsanweisung) aus.push('Gefahrstoff ohne Betriebsanweisung (§ 14 GefStoffV).');
  if (id === 'ausgaben' && !d.quittiert_am && !d.rueckgabe) aus.push('Empfang noch nicht in der App bestätigt.');
  return aus;
}
// Ersthelfer-Quote DGUV V1 § 26: 2–20 Versicherte → 1 Ersthelfer; mehr als 20 → Verwaltung/Handel 5 %, sonstige Betriebe 10 %
function ersthelferQuote(db) {
  const beschaeftigte = db.prepare('SELECT COUNT(*) n FROM mitarbeiter WHERE aktiv = 1').get().n;
  const eh = liste(db, 'beauftragte').filter(function (x) { return x.rolle === 'ersthelfer' && (!x.gueltig_bis || x.gueltig_bis >= heute()); }).length;
  const soll = beschaeftigte < 2 ? 0 : beschaeftigte <= 20 ? 1 : Math.ceil(beschaeftigte * 0.10);
  return { beschaeftigte: beschaeftigte, ersthelfer: eh, soll: soll, erfuellt: eh >= soll };
}
// Checkliste aus Vorlage (beim Einstellen und beim Austritt automatisch)
const VORLAGE_CHECK = {
  eintritt: [['Arbeitsvertrag unterschrieben (Nachweisgesetz)', 'Büro', 0], ['Personalfragebogen ausgefüllt und unterschrieben', 'Büro', 0], ['Anmeldung zur Sozialversicherung (Lohnbüro, vor Arbeitsbeginn)', 'Lohnbüro', 0], ['Datenschutz- und Verschwiegenheitsverpflichtung', 'Büro', 0], ['Erstunterweisung Arbeitsschutz / Gefahrstoffe (vor Arbeitsaufnahme)', 'Objektleitung', 0], ['Dienstkleidung ausgegeben (mit Quittung)', 'Objektleitung', 3], ['Schlüssel / Transponder ausgegeben (mit Quittung)', 'Objektleitung', 3], ['App-Zugang (PIN) eingerichtet und erklärt', 'Büro', 1], ['Einweisung im Objekt (Dienstanweisung gelesen)', 'Objektleitung', 7], ['Aufenthaltstitel / Arbeitserlaubnis geprüft (falls nötig)', 'Büro', 0], ['Ende der Probezeit im Kalender', 'Büro', 7]],
  austritt: [['Kündigung / Aufhebung schriftlich, Zugang belegt', 'Büro', 0], ['Abmeldung bei der Sozialversicherung (Lohnbüro)', 'Lohnbüro', 14], ['Schlüssel und Transponder zurück', 'Objektleitung', 0], ['Dienstkleidung und Geräte zurück', 'Objektleitung', 0], ['App-Zugang gesperrt', 'Büro', 0], ['Resturlaub und Stunden abgerechnet', 'Lohnbüro', 14], ['Arbeitsbescheinigung / Zeugnis', 'Büro', 14], ['Aus Dienstplan und Objekt-Team entfernt', 'Büro', 0]]
};
function checklisteAnlegen(db, art, mid, stichtag, von) {
  if (db.prepare("SELECT 1 FROM register_eintrag WHERE register = 'checklisten' AND json_extract(daten,'$.art') = ? AND json_extract(daten,'$.mitarbeiter_id') = ?").get(art, Number(mid))) return null;
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(stichtag || '') ? stichtag : heute();
  const plus = n => { const x = new Date(tag + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  // offene Ausgaben beim Austritt mit auflisten
  const offen = art === 'austritt' ? liste(db, 'ausgaben').filter(function (a) { return a.mitarbeiter_id === Number(mid) && !a.rueckgabe; }).map(function (a) { return ['Rückgabe: ' + a.gegenstand + (a.merkmal ? ' (' + a.merkmal + ')' : ''), 'Objektleitung', 0]; }) : [];
  const punkte = VORLAGE_CHECK[art].concat(offen).map(function (p) { return { schritt: p[0], wer: p[1], frist: plus(p[2]), erledigt: false }; });
  return Number(db.prepare("INSERT INTO register_eintrag (register, daten, angelegt_von) VALUES ('checklisten', ?, ?)").run(JSON.stringify({ art: art, mitarbeiter_id: Number(mid), stichtag: tag, punkte: punkte }), von || 'Glanzwerk').lastInsertRowid);
}
// Quittung in der App: offene Ausgaben der Kraft, bestätigen
function offeneQuittungen(db, mid) { return liste(db, 'ausgaben').filter(function (a) { return a.mitarbeiter_id === Number(mid) && !a.quittiert_am && !a.rueckgabe; }); }
function quittieren(db, mid, eid) {
  const x = db.prepare("SELECT * FROM register_eintrag WHERE id = ? AND register = 'ausgaben'").get(Number(eid)); if (!x) throw new Error('Nicht gefunden');
  if (JSON.parse(x.daten).mitarbeiter_id !== Number(mid)) throw new Error('Nicht deine Ausgabe');
  db.prepare("UPDATE register_eintrag SET quittiert_am = datetime('now','localtime') WHERE id = ?").run(x.id);
}
function csv(db, id) {
  const r = def(id), l = liste(db, id), sp = r.felder.filter(function (f) { return f.typ !== 'tabelle' && f.typ !== 'datei'; });
  const z = v => { v = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const w = (f, d) => { const v = d[f.n + '_name'] || d[f.n]; if ((f.typ === 'datum' || f.typ === 'frist') && v) return v.split('-').reverse().join('.'); if (f.o && !f.mehr) { const o = f.o.find(function (x) { return x[0] === v; }); return o ? o[1] : v; } return v; };
  return '﻿' + [sp.map(function (f) { return z(f.t); }).join(';')].concat(l.map(function (d) { return sp.map(function (f) { return z(w(f, d)); }).join(';'); })).join('\r\n') + '\r\n';
}

module.exports = { REGISTER, def, tabellen, katalog, liste, holen, speichern, loeschen, dateiSetzen, fristen, hinweise, ersthelferQuote, checklisteAnlegen, offeneQuittungen, quittieren, csv };
