// db.js — Datenbank der StaffClean-Software (node:sqlite, eine Datei in daten\).
// Kette: Kunde → Objekt → Raum; Tätigkeit (Katalog); LV-Position = Raum × Tätigkeit × Turnus.
// Aufgaben werden NICHT gespeichert, sondern je Tag aus den LV-Positionen berechnet — so kann ein
// geänderter Turnus nie alte, falsche Aufgaben hinterlassen. Gespeichert wird nur, was passiert ist:
// Erledigungen (mit Zeit, Person, Foto) und Mängel.
'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const ORDNER = process.env.STAFFCLEAN_DATEN || path.join(__dirname, '..', 'daten');
fs.mkdirSync(ORDNER, { recursive: true });

function oeffnen(datei) {
  const db = new DatabaseSync(datei || path.join(ORDNER, 'staffclean.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kunde (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, ansprechpartner TEXT, email TEXT, telefon TEXT,
      anschrift TEXT, plz TEXT, ort TEXT, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS objekt (
      id INTEGER PRIMARY KEY, kunde_id INTEGER REFERENCES kunde(id), name TEXT NOT NULL,
      strasse TEXT, plz TEXT, ort TEXT, bundesland TEXT DEFAULT 'SH',
      reinigungstag INTEGER DEFAULT 1,              -- bevorzugter Wochentag für 1 W / 14T / M (0=So … 6=Sa)
      lat REAL, lon REAL, zugang TEXT, notiz TEXT, status TEXT DEFAULT 'aktiv',
      angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS raum (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
      name TEXT NOT NULL, etage TEXT, belag TEXT, raumart TEXT, flaeche_m2 REAL,
      code TEXT UNIQUE,                             -- QR-/NFC-Kennung am Raum
      reihenfolge INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS taetigkeit (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, anleitung TEXT,
      minuten REAL,                                 -- Richtzeit je Ausführung und Raum (Kalkulation, Soll-Zeit)
      kategorie TEXT);
    CREATE TABLE IF NOT EXISTS lv_position (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
      raum_id INTEGER NOT NULL REFERENCES raum(id) ON DELETE CASCADE,
      taetigkeit_id INTEGER NOT NULL REFERENCES taetigkeit(id),
      turnus TEXT NOT NULL,                         -- Kürzel wie im LV („1 W", „3 W", „1 M", „B")
      minuten REAL,                                 -- abweichende Richtzeit für diese Position
      UNIQUE (raum_id, taetigkeit_id));
    CREATE TABLE IF NOT EXISTS mitarbeiter (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, telefon TEXT, sprache TEXT DEFAULT 'de',
      rolle TEXT DEFAULT 'reinigung', minijob INTEGER DEFAULT 0, lohngruppe TEXT, pin TEXT, aktiv INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS einsatz (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
      mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id), wochentage TEXT, UNIQUE (objekt_id, mitarbeiter_id));
    CREATE TABLE IF NOT EXISTS erledigung (
      id INTEGER PRIMARY KEY, position_id INTEGER NOT NULL REFERENCES lv_position(id) ON DELETE CASCADE,
      datum TEXT NOT NULL, mitarbeiter_id INTEGER REFERENCES mitarbeiter(id), zeit TEXT DEFAULT (datetime('now','localtime')),
      foto TEXT, notiz TEXT, lat REAL, lon REAL, UNIQUE (position_id, datum));
    CREATE TABLE IF NOT EXISTS zeitbuchung (
      id INTEGER PRIMARY KEY, mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id), objekt_id INTEGER REFERENCES objekt(id),
      kommen TEXT NOT NULL, gehen TEXT, lat REAL, lon REAL);
    CREATE TABLE IF NOT EXISTS mangel (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE, raum_id INTEGER REFERENCES raum(id),
      text TEXT NOT NULL, foto TEXT, quelle TEXT DEFAULT 'mitarbeiter', gemeldet_von TEXT,
      gemeldet_am TEXT DEFAULT (datetime('now','localtime')), frist TEXT, status TEXT DEFAULT 'offen', erledigt_am TEXT);
    CREATE TABLE IF NOT EXISTS tarif (
      id INTEGER PRIMARY KEY, lohngruppe TEXT NOT NULL, bezeichnung TEXT, stundenlohn REAL NOT NULL,
      gueltig_ab TEXT NOT NULL, gueltig_bis TEXT, quelle TEXT);
    CREATE TABLE IF NOT EXISTS einstellung (schluessel TEXT PRIMARY KEY, wert TEXT);
    CREATE TABLE IF NOT EXISTS abwesenheit (
      id INTEGER PRIMARY KEY, mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id) ON DELETE CASCADE,
      von TEXT NOT NULL, bis TEXT NOT NULL, art TEXT DEFAULT 'krank', notiz TEXT);
    CREATE TABLE IF NOT EXISTS vertretung (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE, datum TEXT NOT NULL,
      fuer_id INTEGER REFERENCES mitarbeiter(id), mitarbeiter_id INTEGER REFERENCES mitarbeiter(id),
      status TEXT DEFAULT 'angefragt', angelegt_am TEXT DEFAULT (datetime('now','localtime')), UNIQUE (objekt_id, datum, mitarbeiter_id));
    CREATE TABLE IF NOT EXISTS pruefung (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE, datum TEXT NOT NULL,
      pruefer TEXT, art TEXT DEFAULT 'intern', stichprobe INTEGER, geprueft INTEGER, ergebnis REAL, bemerkung TEXT,
      abgezeichnet_von TEXT, abgezeichnet_am TEXT, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS pruefung_raum (
      id INTEGER PRIMARY KEY, pruefung_id INTEGER NOT NULL REFERENCES pruefung(id) ON DELETE CASCADE, raum_id INTEGER NOT NULL REFERENCES raum(id),
      kriterien TEXT, fehler INTEGER DEFAULT 0, UNIQUE (pruefung_id, raum_id));
    CREATE TABLE IF NOT EXISTS schicht (
      id INTEGER PRIMARY KEY, mitarbeiter_id INTEGER REFERENCES mitarbeiter(id) ON DELETE CASCADE, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
      datum TEXT NOT NULL, beginn TEXT NOT NULL, ende TEXT NOT NULL, pause_min INTEGER DEFAULT 0,
      status TEXT DEFAULT 'geplant',                -- geplant · bestätigt (vom Mitarbeiter) · abgesagt
      notiz TEXT, serie TEXT, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS schicht_tag ON schicht (datum, mitarbeiter_id);
    CREATE TABLE IF NOT EXISTS uebersetzung (
      taetigkeit_id INTEGER NOT NULL REFERENCES taetigkeit(id) ON DELETE CASCADE, sprache TEXT NOT NULL, name TEXT, anleitung TEXT,
      PRIMARY KEY (taetigkeit_id, sprache));
    -- Abrechnung: Preisbausteine je Objekt neben der Monatspauschale (z. B. Glasreinigung je Durchgang)
    CREATE TABLE IF NOT EXISTS preisposition (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
      bezeichnung TEXT NOT NULL, art TEXT NOT NULL DEFAULT 'je_ausfuehrung',   -- je_ausfuehrung · monatlich · einmalig
      turnus TEXT, preis REAL NOT NULL, einheit TEXT DEFAULT 'Durchgang', aktiv INTEGER DEFAULT 1);
    -- Abruf-Aufträge: Sonderleistungen, vom Kunden im Portal oder vom Büro angelegt, nach Aufwand oder Festpreis
    CREATE TABLE IF NOT EXISTS auftrag (
      id INTEGER PRIMARY KEY, objekt_id INTEGER NOT NULL REFERENCES objekt(id) ON DELETE CASCADE,
      text TEXT NOT NULL, wunschdatum TEXT, status TEXT DEFAULT 'angefragt',  -- angefragt · bestätigt · erledigt · abgelehnt · abgerechnet
      quelle TEXT DEFAULT 'buero', angefragt_von TEXT, angelegt_am TEXT DEFAULT (datetime('now','localtime')),
      termin TEXT, stunden REAL, festpreis REAL, erledigt_am TEXT, antwort TEXT, rechnung_id INTEGER);
    CREATE TABLE IF NOT EXISTS rechnung (
      id INTEGER PRIMARY KEY, nummer TEXT UNIQUE, kunde_id INTEGER NOT NULL REFERENCES kunde(id), objekt_id INTEGER REFERENCES objekt(id),
      zeitraum_von TEXT NOT NULL, zeitraum_bis TEXT NOT NULL, datum TEXT, faellig TEXT,
      netto REAL DEFAULT 0, ust_prozent REAL DEFAULT 19, ust REAL DEFAULT 0, brutto REAL DEFAULT 0,
      status TEXT DEFAULT 'entwurf',                -- entwurf · gestellt · bezahlt · storniert
      bezahlt_am TEXT, storno_von INTEGER, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS rechnung_position (
      id INTEGER PRIMARY KEY, rechnung_id INTEGER NOT NULL REFERENCES rechnung(id) ON DELETE CASCADE,
      reihenfolge INTEGER, bezeichnung TEXT NOT NULL, menge REAL NOT NULL, einheit TEXT, einzelpreis REAL NOT NULL, betrag REAL NOT NULL,
      quelle TEXT, quelle_id INTEGER);
  `);
  // Nachgerüstete Spalten (ältere Datenbanken): nur anlegen, wenn sie fehlen
  const spalten = (t) => db.prepare('PRAGMA table_info(' + t + ')').all().map(function (c) { return c.name; });
  const nach = (t, s, def) => { if (spalten(t).indexOf(s) < 0) db.exec('ALTER TABLE ' + t + ' ADD COLUMN ' + s + ' ' + def); };
  nach('objekt', 'radius_m', 'INTEGER DEFAULT 150');
  nach('objekt', 'monatspreis', 'REAL');
  nach('mitarbeiter', 'stundenlohn', 'REAL');
  nach('zeitbuchung', 'lat_gehen', 'REAL');
  nach('zeitbuchung', 'lon_gehen', 'REAL');
  nach('zeitbuchung', 'abstand_m', 'INTEGER');
  nach('zeitbuchung', 'pause_min', 'INTEGER DEFAULT 0');
  nach('erledigung', 'per_qr', 'INTEGER DEFAULT 0');
  nach('mangel', 'pruefung_id', 'INTEGER');
  nach('mitarbeiter', 'personalnummer', 'TEXT');
  nach('mitarbeiter', 'wochenstunden', 'REAL');
  nach('zeitbuchung', 'schicht_id', 'INTEGER');
  nach('preisposition', 'monate', 'TEXT');          // Saison für „monatlich" (z. B. Winterdienst 11,12,1,2,3)
  nach('raum', 'anzahl', 'REAL DEFAULT 1');          // gleiche Einheiten im Raum: Etagen, Treppenläufe, Wohnungen — vervielfacht die Richtzeit
  nach('kunde', 'kundennummer', 'TEXT');
  nach('kunde', 'leitweg_id', 'TEXT');              // öffentliche Auftraggeber: Pflichtangabe in der XRechnung
  nach('kunde', 'ust_id', 'TEXT');
  // Abrechnung wie in der Sicherheitsplanung: je Objekt pauschal und/oder nach Ist-Stunden, je Kunde Sammelrechnung und Format
  nach('objekt', 'abrechnungsart', "TEXT DEFAULT 'pauschale'");   // pauschale · stunden · beides
  nach('objekt', 'stundensatz', 'REAL');                          // € netto je Ist-Stunde (bei „stunden")
  nach('kunde', 'sammelrechnung', 'INTEGER DEFAULT 0');           // 1 = eine Rechnung je Monat über alle Objekte des Kunden
  nach('kunde', 'rechnungsformat', "TEXT DEFAULT 'zugferd'");     // zugferd (PDF mit XML) · xrechnung · pdf
  nach('kunde', 'zahlungsziel_tage', 'INTEGER');
  nach('kunde', 'rechnung_email', 'TEXT');
  nach('rechnung_position', 'gruppe', 'TEXT');
  nach('rechnung_position', 'objekt_id', 'INTEGER');               // für die Doppelabrechnungs-Sperre bei Sammelrechnungen                    // Objekt, zu dem die Position gehört (Gliederung 1 / 1.1)
  nach('rechnung', 'zahlungsziel_tage', 'INTEGER');
  db.exec(`CREATE TABLE IF NOT EXISTS abrechnungslauf (
    id INTEGER PRIMARY KEY, zeit TEXT DEFAULT (datetime('now','localtime')), monat TEXT NOT NULL, art TEXT DEFAULT 'hand',
    angelegt INTEGER DEFAULT 0, gestellt INTEGER DEFAULT 0, ergebnis TEXT)`);
  // Tarif Gebäudereinigerhandwerk (allgemeinverbindlich, gültig bis 31.12.2026 — ab 2027 offen, neu eintragen)
  if (!db.prepare('SELECT COUNT(*) n FROM tarif').get().n) {
    const t = db.prepare('INSERT INTO tarif (lohngruppe, bezeichnung, stundenlohn, gueltig_ab, gueltig_bis, quelle) VALUES (?,?,?,?,?,?)');
    t.run('LG 1', 'Innen- und Unterhaltsreinigung', 15.00, '2026-01-01', '2026-12-31', 'Lohntarifvertrag Gebäudereinigerhandwerk, allgemeinverbindlich');
    t.run('LG 6', 'Glas- und Fassadenreinigung', 18.40, '2026-01-01', '2026-12-31', 'Lohntarifvertrag Gebäudereinigerhandwerk, allgemeinverbindlich');
  }
  // Lohnarten für den DATEV-Export: Nummern sind Platzhalter, bitte mit dem Lohnbüro abstimmen (Einstellungen)
  const std = { lohnnebenkosten_prozent: '28', gemeinkosten_prozent: '15', gewinn_prozent: '8', minijob_grenze_eur: '603', wegezeit_min: '15', firma_name: 'StaffClean GmbH',
    datev_berater_nr: '', datev_mandant_nr: '', lohnart_stunden: '1000', lohnart_nacht: '1100', lohnart_sonntag: '1200', lohnart_feiertag: '1300',
    zuschlag_nacht_von: '20:00', zuschlag_nacht_bis: '06:00',
    // Rechnungsangaben (§ 14 UStG) — vor der ersten echten Rechnung ausfüllen
    firma_strasse: '', firma_plz: '', firma_ort: '', firma_email: '', firma_telefon: '', steuernummer: '', ust_id: '',
    bank: '', iban: '', bic: '', handelsregister: '', geschaeftsfuehrung: '',
    standard_richtzeit_min: '5',
    ust_prozent: '19', zahlungsziel_tage: '14', rechnung_praefix: 'RE', stundensatz_abruf: '',
    // Briefpapier (Kopf, Fußzeile) und Rechnungstexte — Aufbau wie die Rechnungen aus der Sicherheitsplanung
    firma_fax: '', firma_internet: 'https://www.staffclean.de', amtsgericht: '', gesellschafter: 'Manuel Rutsch', firma_sitz: '',
    rechnung_einleitung: 'Sehr geehrte Damen und Herren,\nvielen Dank für die vertrauensvolle Zusammenarbeit.\nFür die von uns erbrachten Reinigungsleistungen erlauben wir uns, Ihnen die nachfolgende Rechnung zu übersenden.\nDie Rechnung wurde automatisiert erstellt und ist daher auch ohne Unterschrift gültig.',
    rechnung_schluss: 'Wir bitten Sie, den Rechnungsbetrag innerhalb des angegebenen Zahlungsziels unter Angabe der Rechnungsnummer als Verwendungszweck zu begleichen.\nNach Ablauf des Zahlungsziels gerät der Auftraggeber gemäß § 286 BGB in Zahlungsverzug.\nSollten Sie Fragen zu der Rechnung haben, stehen wir Ihnen selbstverständlich gerne zur Verfügung.\nVielen Dank für die gute Zusammenarbeit.',
    // Automatischer Abrechnungslauf: am Tag X des Monats für den Vormonat
    auto_lauf_aktiv: '0', auto_lauf_tag: '1', auto_stellen: '0' };
  Object.keys(std).forEach(function (k) { db.prepare('INSERT OR IGNORE INTO einstellung (schluessel, wert) VALUES (?, ?)').run(k, std[k]); });
  return db;
}

function einstellungen(db) { const e = {}; db.prepare('SELECT schluessel, wert FROM einstellung').all().forEach(function (r) { e[r.schluessel] = r.wert; }); return e; }
function tarifFuer(db, lohngruppe, datum) {
  return db.prepare('SELECT * FROM tarif WHERE lohngruppe = ? AND gueltig_ab <= ? AND (gueltig_bis IS NULL OR gueltig_bis >= ?) ORDER BY gueltig_ab DESC LIMIT 1').get(lohngruppe || 'LG 1', datum, datum)
    || db.prepare('SELECT * FROM tarif WHERE lohngruppe = ? ORDER BY gueltig_ab DESC LIMIT 1').get(lohngruppe || 'LG 1');
}

module.exports = { oeffnen, ORDNER, einstellungen, tarifFuer };
