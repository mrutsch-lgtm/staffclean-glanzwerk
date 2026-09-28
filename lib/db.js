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
  `);
  return db;
}

module.exports = { oeffnen, ORDNER };
