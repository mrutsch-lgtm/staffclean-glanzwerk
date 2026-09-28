// layoutprobe.js — Rechnungs-PDFs mit bewusst unterschiedlich viel Inhalt (erfundene Daten), um Umbrüche und
// Abstände zu prüfen: A normal · B minimal (keine Bank/Telefon/Kundennr., kurzes Anschreiben) · C maximal (lange Namen,
// Leitweg-ID, USt-IdNr., langes Anschreiben). Aufruf: node werkzeuge/layoutprobe.js <Ausgabeordner>
'use strict';
const fs = require('fs'), path = require('path');
const DB = require('../lib/db'), AB = require('../lib/abrechnung'), PDFR = require('../lib/pdf/rechnung');
const AUS = process.argv[2] || path.join(__dirname, 'pruefung', 'layout'); fs.mkdirSync(AUS, { recursive: true });
async function probe(name, firma, kunde, objekt, texte) {
  const db = DB.oeffnen(':memory:');
  Object.keys(firma).forEach(function (k) { db.prepare('UPDATE einstellung SET wert = ? WHERE schluessel = ?').run(firma[k], k); });
  Object.keys(texte || {}).forEach(function (k) { db.prepare('UPDATE einstellung SET wert = ? WHERE schluessel = ?').run(texte[k], k); });
  const k = Number(db.prepare('INSERT INTO kunde (name, ansprechpartner, anschrift, plz, ort, kundennummer, ust_id, leitweg_id, email) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(kunde.name, kunde.ansprechpartner || null, kunde.anschrift, kunde.plz, kunde.ort, kunde.nr || null, kunde.ustid || null, kunde.leitweg || null, 'rechnung@example.org').lastInsertRowid);
  const o = Number(db.prepare('INSERT INTO objekt (kunde_id, name, strasse, plz, ort, monatspreis) VALUES (?,?,?,?,?,?)').run(k, objekt, 'Beispielstraße 3', '24534', 'Neumünster', 236.25).lastInsertRowid);
  db.prepare("INSERT INTO preisposition (objekt_id, bezeichnung, art, turnus, preis) VALUES (?, 'Glasreinigung inkl. Rahmen', 'je_ausfuehrung', '1 M', 80.25)").run(o);
  const e = AB.entwurf(db, o, '2026-09'); AB.stellen(db, e.id);
  fs.writeFileSync(path.join(AUS, name + '.pdf'), await PDFR.erzeugen(db, AB.voll(db, e.id)));
  console.log(name, 'ok');
}
const voll = { firma_email: 'rechnung@staffclean.de', firma_telefon: '+49 4321 000000', firma_fax: '+49 4321 000001', steuernummer: '20/290/00000', ust_id: 'DE123456789', bank: 'Musterbank', iban: 'DE02120300000000202051', bic: 'BYLADEM1001', handelsregister: 'HRB 00000 KI', amtsgericht: 'Kiel', geschaeftsfuehrung: 'Max Muster', firma_sitz: 'Neumünster' };
(async function () {
  await probe('A_normal', voll, { name: 'Musterverwaltung GmbH', ansprechpartner: 'Frau Beispiel', anschrift: 'Beispielweg 5', plz: '24103', ort: 'Kiel', nr: 'K-1001' }, 'Treppenhaus Beispielstraße 3');
  await probe('B_minimal', { steuernummer: '20/290/00000', firma_internet: '' }, { name: 'Kurz AG', anschrift: 'Weg 1', plz: '24103', ort: 'Kiel' }, 'Büro', { rechnung_einleitung: 'Sehr geehrte Damen und Herren,', rechnung_schluss: 'Vielen Dank.' });
  await probe('C_maximal', voll, { name: 'Wohnungseigentümergemeinschaft Gartenstadt Nord-West Bauabschnitt II vertreten durch die Hausverwaltung Musterfrau & Partner GmbH', ansprechpartner: 'Frau Dr. Beispiel-Mustermann (Objektbuchhaltung, Zimmer 4.12)', anschrift: 'Großer Beispielweg 125 a, Hinterhaus, 3. Obergeschoss', plz: '24103', ort: 'Kiel', nr: 'K-1001-2026-NORD', ustid: 'DE987654321', leitweg: '991-12345-67890-23' },
    'Treppenhäuser, Kellergänge und Außenanlagen der Wohnanlage Gartenstadt Nord-West, Häuser 1 bis 14',
    { rechnung_einleitung: 'Sehr geehrte Damen und Herren,\nvielen Dank für die vertrauensvolle Zusammenarbeit im vergangenen Monat.\nFür die von uns erbrachten Reinigungsleistungen in allen Treppenhäusern, Kellergängen und Außenanlagen der Wohnanlage erlauben wir uns, Ihnen die nachfolgende Rechnung zu übersenden. Die Leistungen wurden gemäß Leistungsverzeichnis erbracht und im Kundenportal mit Fotos nachgewiesen.\nDie Rechnung wurde automatisiert erstellt und ist daher auch ohne Unterschrift gültig.' });
})().catch(function (x) { console.error(x); process.exit(1); });
