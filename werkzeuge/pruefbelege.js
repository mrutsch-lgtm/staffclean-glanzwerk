// pruefbelege.js — erzeugt Prüfrechnungen (erfundene Daten) für die Validierung mit KoSIT und Mustang:
// normale Rechnung, Sammelrechnung mit vielen Positionen (Seitenumbruch), Stornorechnung — je als
// ZUGFeRD-PDF und XRechnung (UBL). Aufruf: node werkzeuge/pruefbelege.js <Ausgabeordner>
'use strict';
const fs = require('fs'), path = require('path');
const DB = require('../lib/db'), AB = require('../lib/abrechnung'), PDFR = require('../lib/pdf/rechnung');
const AUS = process.argv[2] || path.join(__dirname, 'pruefung', 'belege'); fs.mkdirSync(AUS, { recursive: true });
(async function () {
  const db = DB.oeffnen(':memory:');
  const set = (k, v) => db.prepare('UPDATE einstellung SET wert = ? WHERE schluessel = ?').run(v, k);
  [['firma_email', 'rechnung@staffclean.de'], ['firma_telefon', '+49 4321 000000'], ['steuernummer', '20/290/00000'], ['ust_id', 'DE123456789'],
   ['bank', 'Musterbank'], ['iban', 'DE02120300000000202051'], ['bic', 'BYLADEM1001'], ['handelsregister', 'HRB 00000 KI'], ['amtsgericht', 'Kiel'],
   ['geschaeftsfuehrung', 'Max Muster'], ['firma_sitz', 'Neumünster'], ['stundensatz_abruf', '35']].forEach(function (x) { set(x[0], x[1]); });
  const kunde = (name, extra) => Number(db.prepare('INSERT INTO kunde (name, ansprechpartner, anschrift, plz, ort, email, kundennummer, sammelrechnung, leitweg_id, rechnungsformat, steuerfall, privat, ust_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(name, extra.privat ? null : 'Frau Beispiel', 'Beispielweg 5', '24103', 'Kiel', 'buchhaltung@example.org', extra.nr, extra.sammel ? 1 : 0, extra.leitweg || null, extra.leitweg ? 'xrechnung' : 'zugferd', extra.rc ? 'reverse_charge' : 'normal', extra.privat ? 1 : 0, extra.ustid || null).lastInsertRowid);
  const objekt = (k, name, preis, art, satz) => Number(db.prepare('INSERT INTO objekt (kunde_id, name, strasse, plz, ort, monatspreis, abrechnungsart, stundensatz) VALUES (?,?,?,?,?,?,?,?)')
    .run(k, name, name.replace(/^\S+ /, ''), '24534', 'Neumünster', preis, art || 'pauschale', satz || null).lastInsertRowid);
  // 1) einfache Rechnung (öffentlicher Auftraggeber mit Leitweg-ID)
  const k1 = kunde('Stadt Musterhausen', { nr: 'K-1001', leitweg: '991-12345-67' });
  const o1 = objekt(k1, 'Rathaus Marktplatz 1', 405);
  db.prepare("INSERT INTO preisposition (objekt_id, bezeichnung, art, turnus, preis) VALUES (?, 'Glasreinigung inkl. Rahmen', 'je_ausfuehrung', '1 M', 107)").run(o1);
  db.prepare("INSERT INTO mitarbeiter (id, name) VALUES (1, 'Beispiel Kraft')").run();
  // 2) Sammelrechnung mit vielen Objekten → mehrere Seiten
  const k2 = kunde('Musterverwaltung GmbH', { nr: 'K-1002', sammel: true });
  for (let i = 1; i <= 24; i++) {
    const o = objekt(k2, 'Treppenhaus Beispielstraße ' + i, 168.75 + i * 33.75, i % 4 === 0 ? 'beides' : 'pauschale', 32);
    db.prepare("INSERT INTO preisposition (objekt_id, bezeichnung, art, turnus, preis) VALUES (?, 'Glasreinigung inkl. Rahmen, Treppenhausfenster und Eingangsbereich innen und außen', 'je_ausfuehrung', '1 M', 53.5)").run(o);
    if (i % 4 === 0) db.prepare("INSERT INTO zeitbuchung (mitarbeiter_id, objekt_id, kommen, gehen) VALUES (1, ?, '2026-09-10 06:00:00', '2026-09-10 08:15:00')").run(o);
    if (i % 5 === 0) db.prepare("INSERT INTO auftrag (objekt_id, text, status, festpreis, erledigt_am) VALUES (?, 'Grundreinigung Kellerflur nach Wasserschaden, inklusive Entsorgung des Schmutzwassers', 'erledigt', 245, '2026-09-18')").run(o);
  }
  // 4) § 13b UStG: Kunde ist selbst Gebäudereiniger (Subunternehmer-Einsatz)
  const k4 = kunde('Reinigungsdienst Nord GmbH', { nr: 'K-1004', rc: true, ustid: 'DE987654321' });
  const o4 = objekt(k4, 'Bürohaus Hafenstraße 2', 1250);
  // 5) Privatkunde: Hinweis auf Aufbewahrungspflicht
  const k5 = kunde('Erika Mustermann', { nr: 'K-1005', privat: true });
  const o5 = objekt(k5, 'Wohnung Lindenweg 4', 180);
  const e1 = AB.entwurf(db, o1, '2026-09'); AB.stellen(db, e1.id);
  const e4 = AB.entwurf(db, o4, '2026-09'); AB.stellen(db, e4.id);
  const e5 = AB.entwurf(db, o5, '2026-09'); AB.stellen(db, e5.id);
  const e2 = AB.entwurfKunde(db, k2, '2026-09'); AB.stellen(db, e2.id);
  const snr = AB.stornieren(db, e1.id); const s = db.prepare('SELECT id FROM rechnung WHERE nummer = ?').get(snr);
  for (const [name, id] of [['1_rechnung', e1.id], ['2_sammelrechnung', e2.id], ['3_storno', s.id], ['4_para13b', e4.id], ['5_privat', e5.id]]) {
    const r = AB.voll(db, id);
    fs.writeFileSync(path.join(AUS, name + '.pdf'), await PDFR.erzeugen(db, r));
    fs.writeFileSync(path.join(AUS, name + '_xrechnung.xml'), AB.xrechnung(db, id));
    fs.writeFileSync(path.join(AUS, name + '_zugferd.xml'), require('../lib/zugferd').xml(db, r));
    console.log(name, r.nummer, 'Positionen', r.positionen.length, 'brutto', r.brutto);
  }
})().catch(function (x) { console.error(x); process.exit(1); });
