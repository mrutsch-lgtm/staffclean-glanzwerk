# Glanzwerk — StaffClean-Software

Eigene Software der **StaffClean GmbH** für die Gebäudereinigung — selbst geschrieben, nichts gekauft.
Konzept und Marktrecherche: `E:\StaffClean-Gehirn\_wissen\konzept_software.md`.
⛔ Kein gemeinsamer Code und keine gemeinsame Datenbank mit Staffsec-Systemen.

## Starten

```
npm install
npm start          # http://127.0.0.1:8790  (erstes Büro-Konto über /einrichten, nur am Rechner selbst)
npm test           # Turnus, Feiertage, LV-Import, Schnittstelle (18 Tests)
npm run abnahme    # Browser-Abnahme: klickt jeden Knopf in Büro, App, Kundenportal (+ WebKit)
```

| Adresse | Wer | Was |
|---|---|---|
| `/` | Büro | Übersicht mit Alarmen, Dienstplan, Objekte (LV-Raster, Woche, Kalkulation & Angebot, Standort & QR, Team/Mängel/Prüfungen), Tagesplan, LV-Import, Einsatz (Abwesenheit, Vertretung, Minijob-Auslastung), Qualität, Zeiten & Lohn (Soll/Ist, Zuschläge, DATEV), Mitarbeiter, Kunden & Portal-Zugänge, Mängel, Stammdaten |
| `/app` | Mitarbeiter (PIN) | Heute → Objekt → Kommen/Gehen stempeln am Standort → Raum per QR-Code oder Liste → abhaken, Foto, Mangel melden; Schichten bestätigen, Vertretung zu-/absagen; ohne Netz wird nachgereicht; DE/PL/RO/EN |
| `/kunde` | Kunde (Passwort) | eigene Objekte, Leistungsnachweis 14 Tage mit Fotos, Prüfberichte abzeichnen, Reklamation mit Foto |
| `/drucken/qr`, `/drucken/angebot`, `/drucken/pruefung` | Büro (Bericht auch Kunde) | QR-Aufkleber je Raum, Angebot ohne interne Kalkulation, Prüfbericht |
| `/gestaltung` | – | Design-System (abgeleitet von staffclean.de) |

Beim ersten Start werden **erfundene Beispieldaten** angelegt (`STAFFCLEAN_DEMO=0` schaltet das ab; die Demo-PINs 1111/2222 gibt es dann nicht).
Daten liegen in `daten\` (SQLite + Fotos, nicht im Git), anderer Ort über `STAFFCLEAN_DATEN`.

## Sicherheit

- Jede Schnittstelle außer Anmelden verlangt eine Sitzung; Rollen **buero / mitarbeiter / kunde** sind strikt getrennt (Kunde sieht nur eigene Objekte, Mitarbeiter nur eigene Einsätze, Fotos ebenso).
- Passwörter und PINs nur als scrypt-Prüfwert; Sitzungs-Cookie HttpOnly/SameSite; 8 Fehlversuche je 15 Minuten.
- Das erste Büro-Konto lässt sich nur direkt am Rechner anlegen. Läuft nur auf `127.0.0.1`, bis ein Betrieb mit HTTPS eingerichtet ist (`STAFFCLEAN_HTTPS=1` setzt das Secure-Cookie).

## Fachliches

- **Turnus als Kalenderregel** (`lib/turnus.js`): `5 W`, `3 W` (Mo/Mi/Fr), `2 W` (Di/Fr), `1 W` (Reinigungstag), `2,5 W` (Wechselwoche), `14T`, `1 M`/`2 M`, `1 Q`/`1 H`/`1 J`, Wochentagslisten (`Mo,Do`), `B` = bei Bedarf. Feiertage je Bundesland.
- **Aufgaben werden je Tag berechnet**, nicht gespeichert. Gespeichert wird nur, was passiert ist.
- **Kalkulation** (`lib/kalkulation.js`): Minuten × Häufigkeit (12-Monats-Mittel inkl. Feiertage) + Wegezeit → Stunden × Tarif (mit Gültigkeit) × Lohnnebenkosten × Gemeinkosten × Gewinn = Monatspreis. Der Leistungswert m²/Std. ist Ergebnis, keine Eingabe.
- **Qualität** (`lib/qualitaet.js`): Stichprobe angelehnt an DIN EN 13549, feste Prüfelemente je Raumart, jeder Fehler wird ein Mangel mit Frist.
- **Dienstplan** (`lib/dienstplan.js`): Konflikte nach ArbZG (Überschneidung, unter 11 Std. Ruhezeit, über 10 Std. am Tag, Pausen), Abwesenheit, Minijob-Grenze; Serien, Vorwoche übernehmen.
- **Stunden & DATEV**: Ist aus Stempelzeiten mit Nacht-, Sonntags- und Feiertagsanteil; Export als Bewegungsdaten (Personalnummer, Lohnart, Stunden). ⚠ Die Lohnart-Nummern sind Platzhalter — mit dem Lohnbüro abstimmen.
- **Stempeln mit Standort**: nur im Umkreis des Objekts (Standard 150 m); der Standort wird bei jedem Stempeln frisch ermittelt.
