# StaffClean-Software

Eigene Software der **StaffClean GmbH** für die Gebäudereinigung — selbst geschrieben, nichts gekauft.
Konzept und Marktrecherche: `E:\StaffClean-Gehirn\_wissen\konzept_software.md`.
⛔ Kein gemeinsamer Code und keine gemeinsame Datenbank mit Staffsec-Systemen.

## Starten

```
npm install
npm start          # http://127.0.0.1:8790
npm test           # Turnus-Regeln, Feiertage, LV-Import
```

| Adresse | Was |
|---|---|
| `/` | Büro: Übersicht, Objekte mit LV-Raster, Tagesplan, LV-Import, Mitarbeiter, Mängel |
| `/app` | Mitarbeiter-App (Handy): Heute → Objekt → Raum → abhaken, Foto, Mangel melden |
| `/gestaltung` | Design-System (Farben, Schrift, Bausteine — abgeleitet von staffclean.de) |

Beim ersten Start werden **erfundene Beispieldaten** angelegt (`STAFFCLEAN_DEMO=0` schaltet das ab).
Daten liegen in `daten\` (SQLite + Fotos, nicht im Git).

## Stand v0.1 (28.09.2026) — Stufe 1

- **Leistungsverzeichnis als Raster** Raum × Tätigkeit × Turnus, direkt im Browser bearbeitbar.
- **Turnus als Kalenderregel** (`lib/turnus.js`): `5 W`, `3 W` (Mo/Mi/Fr), `2 W` (Di/Fr), `1 W` (Reinigungstag des Objekts), `2,5 W` (Wechselwoche), `14T`, `1 M`/`2 M`, `1 Q`/`1 H`/`1 J`, Wochentagslisten (`Mo,Do`), `B` = bei Bedarf. Feiertage je Bundesland (`lib/feiertage.js`); Monats-/Quartalstermine rutschen am Feiertag weiter.
- **Aufgaben werden je Tag berechnet**, nicht gespeichert — ein geänderter Turnus hinterlässt nie alte Aufgaben. Gespeichert wird nur, was passiert ist (Erledigung mit Zeit, Person, Foto; Mängel).
- **Excel-Import** (`lib/lv-import.js`) nach der Vorlage der Treppenhaus-LVs: Kopfzeile „Räume | Belag | Tätigkeiten…", Kunde, Legende, „Bei Bedarf". Erst Vorschau, dann Objekt anlegen.
- **Mitarbeiter-App** mit großen Tippflächen, Foto (am Handy verkleinert), Mangel melden, Oberfläche auf Deutsch/Polnisch/Englisch.

## Nächste Schritte

1. **Zugänge** (Büro-Login, Mitarbeiter-PIN, Kunde) — vorher nicht ins Netz.
2. QR/NFC am Raum (Kennung `raum.code` ist schon da), Stempeln am Objekt (GPS), Arbeitszeit nach MiLoG.
3. Qualitätsprüfung nach DIN EN 13549, Kundenportal mit Nachweisen.
4. Kalkulation (Minuten je Tätigkeit → Leistungswert → Tarif mit Gültigkeit), Einsatzplan mit Minijob-Grenze.
5. Offline-Speicher in der App, automatische Übersetzung der Tätigkeiten, Betrieb auf eigenem Server (`app.staffclean.de`).
