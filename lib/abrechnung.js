// abrechnung.js — Rechnungen je Objekt und Monat.
//
// Positionen kommen aus drei Quellen: Monatspauschale des Objekts · Preisbausteine (monatlich oder je Durchgang
// mit Turnus, z. B. „Glasreinigung 1 Q" → Zahl der Termine im Monat × Preis) · erledigte Abruf-Aufträge
// (Festpreis oder Stunden × Stundensatz). Ein Entwurf ist frei änderbar; mit „stellen" bekommt er eine
// fortlaufende Nummer je Jahr und ist danach unveränderlich — Korrektur nur per Storno (Gegenrechnung).
'use strict';
const DB = require('./db');
const T = require('./turnus');

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const plusTag = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function monatsgrenzen(monat) {
  if (!/^\d{4}-\d{2}$/.test(monat || '')) throw new Error('Monat im Format JJJJ-MM');
  const letzter = new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0)).getUTCDate();
  return { von: monat + '-01', bis: monat + '-' + String(letzter).padStart(2, '0') };
}
const monatText = m => m.slice(5, 7) + '/' + m.slice(0, 4);

function summen(db, id) {
  const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(id);
  const netto = r2(db.prepare('SELECT COALESCE(SUM(betrag),0) s FROM rechnung_position WHERE rechnung_id = ?').get(id).s);
  const ust = r2(netto * r.ust_prozent / 100);
  db.prepare('UPDATE rechnung SET netto = ?, ust = ?, brutto = ? WHERE id = ?').run(netto, ust, r2(netto + ust), id);
}
function positionAnlegen(db, rid, p) {
  const n = db.prepare('SELECT COALESCE(MAX(reihenfolge),0)+1 n FROM rechnung_position WHERE rechnung_id = ?').get(rid).n;
  db.prepare('INSERT INTO rechnung_position (rechnung_id, reihenfolge, bezeichnung, menge, einheit, einzelpreis, betrag, quelle, quelle_id) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(rid, n, p.bezeichnung, r2(p.menge), p.einheit || null, r2(p.einzelpreis), r2(r2(p.menge) * r2(p.einzelpreis)), p.quelle || 'hand', p.quelle_id || null);
}

// Was würde für dieses Objekt in diesem Monat abgerechnet? (ohne zu speichern)
function vorschlag(db, objektId, monat) {
  const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(objektId)); if (!o) throw new Error('Objekt nicht gefunden');
  const g = monatsgrenzen(monat), e = DB.einstellungen(db), pos = [], hinweise = [];
  if (o.monatspreis) pos.push({ bezeichnung: 'Unterhaltsreinigung laut Leistungsverzeichnis, ' + monatText(monat), menge: 1, einheit: 'Monat', einzelpreis: o.monatspreis, quelle: 'pauschale' });
  else hinweise.push('Kein Monatspreis hinterlegt (Objekt → Kalkulation → „Als Monatspreis übernehmen").');
  db.prepare('SELECT * FROM preisposition WHERE objekt_id = ? AND aktiv = 1 ORDER BY id').all(o.id).forEach(function (p) {
    if (p.art === 'monatlich' && p.monate && p.monate.split(',').map(Number).indexOf(Number(monat.slice(5, 7))) < 0) return;   // außerhalb der Saison
    if (p.art === 'monatlich') return pos.push({ bezeichnung: p.bezeichnung + ', ' + monatText(monat), menge: 1, einheit: p.einheit || 'Monat', einzelpreis: p.preis, quelle: 'preisposition', quelle_id: p.id });
    if (p.art !== 'je_ausfuehrung' || !p.turnus) return;
    const regel = T.lesen(p.turnus, o.reinigungstag); let n = 0;
    for (let d = g.von; d <= g.bis; d = plusTag(d, 1)) if (T.faellig(regel, d, o.bundesland).an) n++;
    if (n) pos.push({ bezeichnung: p.bezeichnung + ' (' + regel.text + ')', menge: n, einheit: p.einheit || 'Durchgang', einzelpreis: p.preis, quelle: 'preisposition', quelle_id: p.id });
  });
  const eigen = db.prepare("SELECT preis FROM preisposition WHERE objekt_id = ? AND art = 'stundensatz' AND aktiv = 1 ORDER BY id DESC LIMIT 1").get(o.id);
  const satz = eigen ? eigen.preis : (Number(String(e.stundensatz_abruf || '').replace(',', '.')) || 0);
  db.prepare("SELECT * FROM auftrag WHERE objekt_id = ? AND status = 'erledigt' AND rechnung_id IS NULL AND substr(COALESCE(erledigt_am, termin),1,10) <= ? ORDER BY id").all(o.id, g.bis).forEach(function (a) {
    const wann = String(a.erledigt_am || a.termin || '').slice(0, 10).split('-').reverse().join('.');
    if (a.festpreis != null) pos.push({ bezeichnung: 'Sonderleistung: ' + a.text + (wann ? ' (' + wann + ')' : ''), menge: 1, einheit: 'pauschal', einzelpreis: a.festpreis, quelle: 'auftrag', quelle_id: a.id });
    else if (a.stunden && satz) pos.push({ bezeichnung: 'Sonderleistung nach Aufwand: ' + a.text + (wann ? ' (' + wann + ')' : ''), menge: a.stunden, einheit: 'Std.', einzelpreis: satz, quelle: 'auftrag', quelle_id: a.id });
    else hinweise.push('Auftrag „' + a.text + '" hat weder Festpreis noch (Stunden + Stundensatz für Sonderleistungen) — nicht übernommen. Stundensatz unter Stammdaten → Einstellungen oder als Preisbaustein am Objekt.');
  });
  return { objekt: o, von: g.von, bis: g.bis, positionen: pos, hinweise: hinweise };
}

function entwurf(db, objektId, monat) {
  const v = vorschlag(db, objektId, monat), o = v.objekt;
  if (!o.kunde_id) throw new Error('„' + o.name + '" hat keinen Kunden — ohne Rechnungsempfänger keine Rechnung.');
  const da = db.prepare("SELECT id, nummer, status FROM rechnung WHERE objekt_id = ? AND zeitraum_von = ? AND zeitraum_bis = ? AND status <> 'storniert' AND storno_von IS NULL").get(o.id, v.von, v.bis);
  if (da) throw new Error('Für „' + o.name + '" ' + monatText(monat) + ' gibt es schon ' + (da.nummer ? 'die Rechnung ' + da.nummer : 'einen Entwurf') + '.');
  if (!v.positionen.length) throw new Error('Für „' + o.name + '" ' + monatText(monat) + ' gibt es nichts abzurechnen. ' + v.hinweise.join(' '));
  const e = DB.einstellungen(db);
  const id = Number(db.prepare('INSERT INTO rechnung (kunde_id, objekt_id, zeitraum_von, zeitraum_bis, ust_prozent) VALUES (?,?,?,?,?)').run(o.kunde_id, o.id, v.von, v.bis, Number(e.ust_prozent) || 19).lastInsertRowid);
  v.positionen.forEach(function (p) { positionAnlegen(db, id, p); });
  summen(db, id);
  return { id: id, hinweise: v.hinweise };
}

function voll(db, id) {
  const r = db.prepare('SELECT r.*, k.name kunde, k.ansprechpartner, k.anschrift, k.plz, k.ort, k.email kunde_email, k.kundennummer, k.leitweg_id, k.ust_id kunde_ust_id, o.name objekt, o.strasse objekt_strasse, o.ort objekt_ort FROM rechnung r JOIN kunde k ON k.id = r.kunde_id LEFT JOIN objekt o ON o.id = r.objekt_id WHERE r.id = ?').get(Number(id));
  if (!r) return null;
  r.positionen = db.prepare('SELECT * FROM rechnung_position WHERE rechnung_id = ? ORDER BY reihenfolge, id').all(r.id);
  if (r.storno_von) r.storno_nummer = (db.prepare('SELECT nummer FROM rechnung WHERE id = ?').get(r.storno_von) || {}).nummer;
  const s = db.prepare('SELECT nummer FROM rechnung WHERE storno_von = ?').get(r.id); if (s) r.storniert_durch = s.nummer;
  return r;
}

function nurEntwurf(db, id) { const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(Number(id)); if (!r) throw new Error('Rechnung nicht gefunden'); if (r.status !== 'entwurf') throw new Error('Gestellte Rechnungen sind unveränderlich — Korrektur nur per Storno.'); return r; }
function position(db, b) {
  const r = nurEntwurf(db, b.rechnung_id);
  if (b.id && b.loeschen) db.prepare('DELETE FROM rechnung_position WHERE id = ? AND rechnung_id = ?').run(Number(b.id), r.id);
  else {
    if (!String(b.bezeichnung || '').trim()) throw new Error('Bezeichnung fehlt');
    const menge = Number(String(b.menge).replace(',', '.')), preis = Number(String(b.einzelpreis).replace(',', '.'));
    if (!isFinite(menge) || !isFinite(preis) || !menge) throw new Error('Menge und Einzelpreis prüfen');
    if (b.id) db.prepare('UPDATE rechnung_position SET bezeichnung = ?, menge = ?, einheit = ?, einzelpreis = ?, betrag = ? WHERE id = ? AND rechnung_id = ?').run(String(b.bezeichnung).trim(), r2(menge), b.einheit || null, r2(preis), r2(r2(menge) * r2(preis)), Number(b.id), r.id);
    else positionAnlegen(db, r.id, { bezeichnung: String(b.bezeichnung).trim(), menge: menge, einheit: b.einheit, einzelpreis: preis, quelle: 'hand' });
  }
  summen(db, r.id);
}

// Pflichtangaben einer Rechnung (§ 14 Abs. 4 UStG) — fehlt etwas, wird nicht gestellt
function pflichtLuecken(db, r) {
  const e = DB.einstellungen(db), l = [];
  if (!e.firma_name) l.push('Firmenname'); if (!e.firma_strasse || !e.firma_plz || !e.firma_ort) l.push('eigene Anschrift');
  if (!e.steuernummer && !e.ust_id) l.push('Steuernummer oder USt-IdNr.');
  if (!r.anschrift || !r.plz || !r.ort) l.push('Anschrift des Kunden „' + r.kunde + '"');
  return l;
}
function naechsteNummer(db, datum) {
  const e = DB.einstellungen(db), p = (e.rechnung_praefix || 'RE') + '-' + datum.slice(0, 4) + '-';
  const alt = db.prepare("SELECT nummer FROM rechnung WHERE nummer LIKE ? ORDER BY nummer DESC LIMIT 1").get(p + '%');
  return p + String((alt ? Number(alt.nummer.slice(p.length)) : 0) + 1).padStart(4, '0');
}
function stellen(db, id) {
  const r0 = nurEntwurf(db, id), r = voll(db, id);
  if (!r.positionen.length) throw new Error('Die Rechnung hat keine Position.');
  const l = pflichtLuecken(db, r); if (l.length) throw new Error('Pflichtangaben fehlen: ' + l.join(', ') + ' (Stammdaten → Einstellungen bzw. Kunde).');
  const e = DB.einstellungen(db), datum = heute();
  db.exec('BEGIN IMMEDIATE');
  try {
    const nr = naechsteNummer(db, datum);
    db.prepare("UPDATE rechnung SET nummer = ?, datum = ?, faellig = ?, status = 'gestellt' WHERE id = ?").run(nr, datum, plusTag(datum, Number(e.zahlungsziel_tage) || 14), r0.id);
    db.prepare("UPDATE auftrag SET status = 'abgerechnet', rechnung_id = ? WHERE id IN (SELECT quelle_id FROM rechnung_position WHERE rechnung_id = ? AND quelle = 'auftrag')").run(r0.id, r0.id);
    db.exec('COMMIT'); return nr;
  } catch (x) { db.exec('ROLLBACK'); throw x; }
}
function stornieren(db, id) {
  const r = voll(db, id); if (!r) throw new Error('Rechnung nicht gefunden');
  if (r.status !== 'gestellt' && r.status !== 'bezahlt') throw new Error('Nur gestellte Rechnungen lassen sich stornieren (Entwürfe einfach löschen).');
  if (r.storno_von) throw new Error('Eine Stornorechnung wird nicht storniert.');
  const datum = heute();
  db.exec('BEGIN IMMEDIATE');
  try {
    const nr = naechsteNummer(db, datum);
    const sid = Number(db.prepare("INSERT INTO rechnung (nummer, kunde_id, objekt_id, zeitraum_von, zeitraum_bis, datum, faellig, ust_prozent, status, storno_von) VALUES (?,?,?,?,?,?,?,?,'gestellt',?)")
      .run(nr, r.kunde_id, r.objekt_id, r.zeitraum_von, r.zeitraum_bis, datum, datum, r.ust_prozent, r.id).lastInsertRowid);
    r.positionen.forEach(function (p) { positionAnlegen(db, sid, { bezeichnung: 'Storno: ' + p.bezeichnung, menge: -p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis, quelle: 'storno', quelle_id: p.id }); });
    summen(db, sid);
    db.prepare("UPDATE rechnung SET status = 'storniert' WHERE id = ?").run(r.id);
    db.prepare("UPDATE auftrag SET status = 'erledigt', rechnung_id = NULL WHERE rechnung_id = ?").run(r.id);
    db.exec('COMMIT'); return nr;
  } catch (x) { db.exec('ROLLBACK'); throw x; }
}
function bezahlt(db, id, datum, zurueck) {
  const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(Number(id)); if (!r) throw new Error('Rechnung nicht gefunden');
  if (zurueck) { if (r.status !== 'bezahlt') throw new Error('Rechnung ist nicht als bezahlt markiert.'); db.prepare("UPDATE rechnung SET status = 'gestellt', bezahlt_am = NULL WHERE id = ?").run(r.id); return; }
  if (r.status !== 'gestellt' || r.storno_von) throw new Error('Nur gestellte Rechnungen lassen sich als bezahlt markieren.');
  db.prepare("UPDATE rechnung SET status = 'bezahlt', bezahlt_am = ? WHERE id = ?").run(/^\d{4}-\d{2}-\d{2}$/.test(datum || '') ? datum : heute(), r.id);
}
function loeschen(db, id) { const r = nurEntwurf(db, id); db.prepare('DELETE FROM rechnung WHERE id = ?').run(r.id); }

// XRechnung im UBL-Aufbau (EN 16931, XRechnung 3.0). Nicht amtlich validiert — vor dem ersten Versand an eine
// Behörde einmal durch den KoSIT-Validator schicken.
function xrechnung(db, id) {
  const r = voll(db, id); if (!r || !r.nummer) throw new Error('Nur gestellte Rechnungen haben eine XRechnung.');
  const e = DB.einstellungen(db);
  const x = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const b = v => r2(v).toFixed(2);
  const einheit = s => /std/i.test(s || '') ? 'HUR' : /monat/i.test(s || '') ? 'MON' : 'C62';
  const zeilen = r.positionen.map(function (p, i) {
    return '  <cac:InvoiceLine>\n    <cbc:ID>' + (i + 1) + '</cbc:ID>\n    <cbc:InvoicedQuantity unitCode="' + einheit(p.einheit) + '">' + p.menge + '</cbc:InvoicedQuantity>\n    <cbc:LineExtensionAmount currencyID="EUR">' + b(p.betrag) + '</cbc:LineExtensionAmount>\n' +
      '    <cac:Item>\n      <cbc:Name>' + x(p.bezeichnung) + '</cbc:Name>\n      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>' + r.ust_prozent + '</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>\n    </cac:Item>\n' +
      '    <cac:Price><cbc:PriceAmount currencyID="EUR">' + b(p.einzelpreis) + '</cbc:PriceAmount></cac:Price>\n  </cac:InvoiceLine>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">\n' +
    '  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>\n  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>\n' +
    '  <cbc:ID>' + x(r.nummer) + '</cbc:ID>\n  <cbc:IssueDate>' + r.datum + '</cbc:IssueDate>\n  <cbc:DueDate>' + r.faellig + '</cbc:DueDate>\n  <cbc:InvoiceTypeCode>' + (r.storno_von ? '384' : '380') + '</cbc:InvoiceTypeCode>\n  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>\n' +
    '  <cbc:BuyerReference>' + x(r.leitweg_id || r.kundennummer || r.kunde) + '</cbc:BuyerReference>\n' +
    '  <cac:InvoicePeriod><cbc:StartDate>' + r.zeitraum_von + '</cbc:StartDate><cbc:EndDate>' + r.zeitraum_bis + '</cbc:EndDate></cac:InvoicePeriod>\n' +
    (r.storno_nummer ? '  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>' + x(r.storno_nummer) + '</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>\n' : '') +
    '  <cac:AccountingSupplierParty><cac:Party>\n    <cbc:EndpointID schemeID="EM">' + x(e.firma_email) + '</cbc:EndpointID>\n    <cac:PostalAddress><cbc:StreetName>' + x(e.firma_strasse) + '</cbc:StreetName><cbc:CityName>' + x(e.firma_ort) + '</cbc:CityName><cbc:PostalZone>' + x(e.firma_plz) + '</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>\n' +
    (e.ust_id ? '    <cac:PartyTaxScheme><cbc:CompanyID>' + x(e.ust_id) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n' : '') +
    (e.steuernummer ? '    <cac:PartyTaxScheme><cbc:CompanyID>' + x(e.steuernummer) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n' : '') +
    '    <cac:PartyLegalEntity><cbc:RegistrationName>' + x(e.firma_name) + '</cbc:RegistrationName></cac:PartyLegalEntity>\n' +
    '    <cac:Contact><cbc:Name>' + x(e.geschaeftsfuehrung || e.firma_name) + '</cbc:Name><cbc:Telephone>' + x(e.firma_telefon) + '</cbc:Telephone><cbc:ElectronicMail>' + x(e.firma_email) + '</cbc:ElectronicMail></cac:Contact>\n  </cac:Party></cac:AccountingSupplierParty>\n' +
    '  <cac:AccountingCustomerParty><cac:Party>\n    <cbc:EndpointID schemeID="EM">' + x(r.kunde_email) + '</cbc:EndpointID>\n    <cac:PostalAddress><cbc:StreetName>' + x(r.anschrift) + '</cbc:StreetName><cbc:CityName>' + x(r.ort) + '</cbc:CityName><cbc:PostalZone>' + x(r.plz) + '</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>\n' +
    (r.kunde_ust_id ? '    <cac:PartyTaxScheme><cbc:CompanyID>' + x(r.kunde_ust_id) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n' : '') +
    '    <cac:PartyLegalEntity><cbc:RegistrationName>' + x(r.kunde) + '</cbc:RegistrationName></cac:PartyLegalEntity>\n  </cac:Party></cac:AccountingCustomerParty>\n' +
    (e.iban ? '  <cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cbc:PaymentID>' + x(r.nummer) + '</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>' + x(e.iban.replace(/\s/g, '')) + '</cbc:ID><cbc:Name>' + x(e.firma_name) + '</cbc:Name>' + (e.bic ? '<cac:FinancialInstitutionBranch><cbc:ID>' + x(e.bic) + '</cbc:ID></cac:FinancialInstitutionBranch>' : '') + '</cac:PayeeFinancialAccount></cac:PaymentMeans>\n' : '') +
    '  <cac:PaymentTerms><cbc:Note>Zahlbar bis ' + r.faellig.split('-').reverse().join('.') + ' ohne Abzug.</cbc:Note></cac:PaymentTerms>\n' +
    '  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">' + b(r.ust) + '</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">' + b(r.netto) + '</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">' + b(r.ust) + '</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>' + r.ust_prozent + '</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>\n' +
    '  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">' + b(r.netto) + '</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">' + b(r.netto) + '</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">' + b(r.brutto) + '</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">' + b(r.brutto) + '</cbc:PayableAmount></cac:LegalMonetaryTotal>\n' +
    zeilen + '\n</ubl:Invoice>\n';
}

module.exports = { vorschlag, entwurf, voll, position, stellen, stornieren, bezahlt, loeschen, xrechnung, pflichtLuecken, monatsgrenzen };
