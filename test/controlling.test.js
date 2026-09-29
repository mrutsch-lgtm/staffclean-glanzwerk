'use strict';
// Abnahme 29.09.2026: Bewerbermanagement, Objektauswertung, DATEV-Buchungsstapel, LODAS, Kontoauszug (CAMT.053), SEPA-Lastschrift
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-ctrl-'));
process.env.STAFFCLEAN_DATEN = ORDNER;
const { server, db } = require('../server');
let BASIS; const keks = {};
async function rufen(wer, pfad, daten) {
  const opt = { headers: {} }; if (keks[wer]) opt.headers.Cookie = keks[wer];
  if (daten !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(daten); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(BASIS + pfad, opt); const sc = r.headers.get('set-cookie'); if (sc && /gw=/.test(sc)) keks[wer] = sc.split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, typ: typ, kopf: r.headers, j: /json/.test(typ) ? await r.json() : null, buf: /json/.test(typ) ? null : Buffer.from(await r.arrayBuffer()) };
}
const heute = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
let kunde, objekt, anna, rechnung;

test.before(async function () {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); BASIS = 'http://127.0.0.1:' + server.address().port;
  await rufen('b', '/api/einrichten', { name: 'Büro', email: 'b@example.org', passwort: 'geheim-und-lang-2026' });
  await rufen('b', '/api/einstellungen', { firma_email: 'r@example.org', steuernummer: '00/000/00000', iban: 'DE02120300000000202051', bic: 'BYLADEM1001', datev_berater_nr: '12345', datev_mandant_nr: '678', lohnnebenkosten_prozent: '25' });
  kunde = (await rufen('b', '/api/kunde', { name: 'Praxis Dr. Nord', anschrift: 'Weg 1', plz: '24103', ort: 'Kiel', kundennummer: 'K-1' })).j.id;
  objekt = (await rufen('b', '/api/objekt', { name: 'Praxis EG', kunde_id: kunde, objektnummer: 'O-77' })).j.id;
  await rufen('b', '/api/objekt/preis', { id: objekt, monatspreis: 1000 });
  anna = (await rufen('b', '/api/mitarbeiter', { name: 'Anna Test', stundenlohn: '16', personalnummer: '1001' })).j.id;
  // 10 Stunden an zwei Tagen gestempelt (06–11 Uhr)
  const m = heute.slice(0, 7);
  [m + '-02', m + '-03'].forEach(function (d) { db.prepare("INSERT INTO zeitbuchung (mitarbeiter_id, objekt_id, kommen, gehen) VALUES (?, ?, ?, ?)").run(anna, objekt, d + ' 06:00:00', d + ' 11:00:00'); });
  const r = (await rufen('b', '/api/rechnung/frei', { kunde_id: kunde, von: m + '-01', bis: m + '-28', objekte: [objekt], monat: m })).j; rechnung = r.id;
  await rufen('b', '/api/rechnung/stellen', { id: rechnung });
});
test.after(function () { server.close(); });

test('Bewerber: erfassen, Status, Notiz, Unterlagen, Einstellen → Personalakte mit Unterlagen; Absage → Löschfrist', async function () {
  const id = (await rufen('b', '/api/bewerber', { vorname: 'Olena', nachname: 'Kovalenko', telefon: '0170 1', email: 'o@example.org', position: 'Reinigungskraft', beschaeftigungsart: 'minijob', stunden_wunsch: '10', verfuegbar_ab: plus(heute, 14), quelle: 'empfehlung', staatsangehoerigkeit: 'ukrainisch', bewertung: 4 })).j.id;
  assert.strictEqual((await rufen('b', '/api/bewerber', { email: 'kaputt' })).status, 400);
  assert.strictEqual((await rufen('b', '/api/bewerber/status', { id: id, status: 'eingestellt' })).status, 400);   // nur über „Einstellen"
  await rufen('b', '/api/bewerber/status', { id: id, status: 'gespraech' });
  await rufen('b', '/api/bewerber', { id: id, termin: plus(heute, 2) + 'T10:00' });
  await rufen('b', '/api/bewerber/notiz', { id: id, text: 'Sehr zuverlässig, spricht gut Deutsch.' });
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%Lebenslauf\n').toString('base64');
  await rufen('b', '/api/bewerber/dokument', { bewerber_id: id, titel: 'Lebenslauf', datei: pdf });
  let v = (await rufen('b', '/api/bewerber?id=' + id)).j;
  assert.strictEqual(v.status, 'gespraech'); assert.strictEqual(v.dokumente.length, 1); assert.ok(v.verlauf.length >= 4);
  assert.match((await rufen('b', '/api/bewerber/dokument?id=' + v.dokumente[0].id)).buf.toString(), /Lebenslauf/);
  const mid = (await rufen('b', '/api/bewerber/einstellen', { id: id })).j.mitarbeiter_id;
  const akte = (await rufen('b', '/api/personal?id=' + mid)).j;
  assert.strictEqual(akte.mitarbeiter.name, 'Olena Kovalenko'); assert.strictEqual(akte.mitarbeiter.beschaeftigungsart, 'minijob'); assert.strictEqual(akte.mitarbeiter.minijob, 1);
  assert.strictEqual(akte.mitarbeiter.eintritt, plus(heute, 14)); assert.strictEqual(akte.mitarbeiter.wochenstunden, 10);
  assert.strictEqual(akte.dokumente.length, 1); assert.strictEqual(akte.dokumente[0].art, 'bewerbung');
  assert.strictEqual((await rufen('b', '/api/bewerber/einstellen', { id: id })).status, 400);
  assert.strictEqual((await rufen('b', '/api/bewerber/loeschen', { id: id })).status, 400);   // eingestellt → nicht löschen
  // Absage: Löschfrist 6 Monate, Talentpool hebt sie auf
  const id2 = (await rufen('b', '/api/bewerber', { nachname: 'Abgesagt', quelle: 'indeed' })).j.id;
  await rufen('b', '/api/bewerber/status', { id: id2, status: 'absage', grund: 'kein Führerschein' });
  v = (await rufen('b', '/api/bewerber?id=' + id2)).j; const f = new Date(heute + 'T12:00:00Z'); f.setUTCMonth(f.getUTCMonth() + 6);
  assert.strictEqual(v.loeschen_ab, f.toISOString().slice(0, 10));
  db.prepare('UPDATE bewerber SET loeschen_ab = ? WHERE id = ?').run(plus(heute, -1), id2);
  let l = (await rufen('b', '/api/bewerber')).j; assert.strictEqual(l.kennzahlen.loeschfaellig, 1); assert.ok(l.liste.find(x => x.id === id2).loeschfaellig);
  await rufen('b', '/api/bewerber', { id: id2, talentpool: '1' }); l = (await rufen('b', '/api/bewerber')).j; assert.strictEqual(l.kennzahlen.loeschfaellig, 0);
  assert.strictEqual((await rufen('b', '/api/bewerber/loeschen', { id: id2 })).status, 200);
  assert.strictEqual((await rufen('b', '/api/bewerber?id=' + id2)).status, 404);
  assert.ok(l.kennzahlen.quellen.some(q => q.text === 'Empfehlung / Mitarbeiter' && q.eingestellt === 1));
});

test('Objektauswertung: Umsatz, Lohnkosten, DB I, Stundensatz, Soll/Ist — nachgerechnet; Verlauf; CSV', async function () {
  const m = heute.slice(0, 7), a = (await rufen('b', '/api/objektauswertung?von=' + m + '-01&bis=' + m + '-28')).j;
  const o = a.objekte.find(x => x.id === objekt);
  assert.strictEqual(o.umsatz, 1000); assert.strictEqual(o.istStunden, 10);
  assert.strictEqual(o.lohnkosten, 200);                 // 10 Std. × 16 € × 1,25
  assert.strictEqual(o.db, 800); assert.strictEqual(o.dbProzent, 80); assert.strictEqual(o.stundensatz, 100);
  assert.strictEqual(a.summe.umsatz, 1000);
  const v = (await rufen('b', '/api/objekt/verlauf?id=' + objekt + '&monate=3')).j; assert.strictEqual(v.length, 3); assert.strictEqual(v[2].monat, m); assert.strictEqual(v[2].umsatz, 1000);
  const csv = (await rufen('b', '/api/objektauswertung.csv?von=' + m + '-01&bis=' + m + '-28')).buf.toString(); assert.match(csv, /Praxis EG;O-77;Praxis Dr\. Nord;1000;200;800;80/);
  assert.strictEqual((await rufen('b', '/api/objektauswertung?von=2026-09-30&bis=2026-09-01')).status, 400);
});

test('DATEV-Buchungsstapel: Kopf EXTF 700/21, Debitor an Erlös 8400 mit Kostenstelle, Zahlung Bank an Debitor', async function () {
  await rufen('b', '/api/rechnung/zahlung', { rechnung_id: rechnung, betrag: '500', datum: heute });
  const von = heute.slice(0, 4) + '-01-01', bis = heute.slice(0, 4) + '-12-31';
  const p = (await rufen('b', '/api/datev/buchungsstapel?von=' + von + '&bis=' + bis + '&pruefen=1')).j; assert.strictEqual(p.rechnungen, 1); assert.strictEqual(p.zahlungen, 1); assert.deepStrictEqual(p.fehlt, []);
  const d = await rufen('b', '/api/datev/buchungsstapel?von=' + von + '&bis=' + bis), z = d.buf.toString('latin1').split('\r\n');
  assert.match(z[0], /^"EXTF";700;21;"Buchungsstapel";13;\d{17};;"RE";"Glanzwerk";;12345;678;\d{4}0101;4;/);
  assert.match(z[1], /^Umsatz \(ohne Soll\/Haben-Kz\);Soll\/Haben-Kennzeichen;WKZ Umsatz/);
  const re = z[2].split(';'); assert.strictEqual(re[0], '1190,00'); assert.strictEqual(re[1], 'S'); assert.strictEqual(re[6], String(10000 + kunde)); assert.strictEqual(re[7], '8400'); assert.strictEqual(re[36], '"O77"');
  const za = z[3].split(';'); assert.strictEqual(za[0], '500,00'); assert.strictEqual(za[6], '1200'); assert.strictEqual(za[7], String(10000 + kunde));
  assert.strictEqual((await rufen('b', '/api/datev/buchungsstapel?von=2025-12-01&bis=2026-01-31')).status, 400);   // über den Jahreswechsel
  // SKR04 und eigenes Debitorenkonto
  await rufen('b', '/api/einstellungen', { datev_kontenrahmen: 'SKR04' }); await rufen('b', '/api/zahlweise', { id: kunde, debitor_konto: '10500' });
  const z4 = (await rufen('b', '/api/datev/buchungsstapel?von=' + von + '&bis=' + bis)).buf.toString('latin1').split('\r\n');
  assert.strictEqual(z4[2].split(';')[7], '4400'); assert.strictEqual(z4[2].split(';')[6], '10500'); assert.strictEqual(z4[3].split(';')[6], '1800');
  await rufen('b', '/api/einstellungen', { datev_kontenrahmen: 'SKR03' });
});

test('LODAS: Bewegungsdaten mit Satzbeschreibung, Personalnummer, Lohnart, Kostenstelle', async function () {
  const d = (await rufen('b', '/api/datev/lodas?monat=' + heute.slice(0, 7))).buf.toString('latin1');
  assert.match(d, /\[Allgemein\]\r\nZiel=LODAS/); assert.match(d, /BeraterNr=12345\r\nMandantenNr=678/);
  assert.match(d, /1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;pnr#bwd;la_eigene#bwd;bs_nr#bwd;bs_wert_butab#bwd;kostenstelle#bwd;/);
  assert.match(d, new RegExp('1;01\\.' + heute.slice(5, 7) + '\\.' + heute.slice(0, 4) + ';1001;1000;1;10,00;O77;'));
});

test('Kontoauszug CAMT.053: Rechnungsnummer erkannt, Teilbetrag gebucht, doppelter Import gesperrt', async function () {
  const nr = db.prepare('SELECT nummer FROM rechnung WHERE id = ?').get(rechnung).nummer;
  const eintrag = (betrag, zweck, ref, name) => '<Ntry><Amt Ccy="EUR">' + betrag + '</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>' + heute + '</Dt></BookgDt><AcctSvcrRef>' + ref + '</AcctSvcrRef><NtryDtls><TxDtls><RltdPties><Dbtr><Nm>' + name + '</Nm></Dbtr><DbtrAcct><Id><IBAN>DE02120300000000202051</IBAN></Id></DbtrAcct></RltdPties><RmtInf><Ustrd>' + zweck + '</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>';
  const xml = '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt>' + eintrag('300.00', 'Rechnung ' + nr + ' Danke', 'A1', 'Praxis Dr. Nord') + eintrag('99.99', 'irgendwas', 'A2', 'Fremd GmbH') + '<Ntry><Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>' + heute + '</Dt></BookgDt><AcctSvcrRef>A3</AcctSvcrRef></Ntry></Stmt></BkToCstmrStmt></Document>';
  const v = (await rufen('b', '/api/bank/camt', { xml: xml })).j.umsaetze;
  assert.strictEqual(v.length, 3); assert.strictEqual(v[0].rechnung_id, rechnung); assert.strictEqual(v[0].sicher, true); assert.strictEqual(v[1].status, 'keine passende Rechnung'); assert.match(v[2].status, /Abgang/);
  const b = (await rufen('b', '/api/bank/camt', { xml: xml, buchen: true, auswahl: [v[0].schluessel] })).j; assert.strictEqual(b.gebucht.length, 1);
  const r = (await rufen('b', '/api/rechnung?id=' + rechnung)).j; assert.strictEqual(r.bezahlt_summe, 800); assert.match(r.zahlungen[1].notiz, /Kontoauszug/);
  assert.strictEqual((await rufen('b', '/api/bank/camt', { xml: xml })).j.umsaetze[0].status, 'schon eingelesen');
  assert.strictEqual((await rufen('b', '/api/bank/camt', { xml: '<Document/>' })).status, 400);
});

test('SEPA-Lastschrift pain.008: Mandat Pflicht, Datei mit FRST, danach RCUR', async function () {
  assert.strictEqual((await rufen('b', '/api/zahlweise', { id: kunde, lastschrift: 'B2B', sepa_iban: 'DE02120300000000202051' })).status, 400);   // ohne Mandat
  assert.strictEqual((await rufen('b', '/api/zahlweise', { id: kunde, lastschrift: 'B2B', sepa_iban: 'DE02120300000000202052', mandatsreferenz: 'M-1', mandat_datum: '2026-09-01' })).status, 400);   // IBAN falsch
  await rufen('b', '/api/zahlweise', { id: kunde, debitor_konto: '10500', lastschrift: 'B2B', sepa_iban: 'DE02 1203 0000 0000 2020 51', mandatsreferenz: 'M-1', mandat_datum: '2026-09-01' });
  const k = (await rufen('b', '/api/lastschrift')).j; assert.strictEqual(k.length, 1); assert.strictEqual(k[0].bereit, true);
  assert.match((await rufen('b', '/api/lastschrift', { ids: [rechnung], datum: plus(heute, 5) })).j.fehler, /Gläubiger/);
  await rufen('b', '/api/einstellungen', { sepa_glaeubiger_id: 'DE98ZZZ09999999999' });
  assert.strictEqual((await rufen('b', '/api/lastschrift', { ids: [rechnung], datum: heute })).status, 400);   // Datum muss in der Zukunft liegen
  const x = (await rufen('b', '/api/lastschrift', { ids: [rechnung], datum: plus(heute, 5) })).buf.toString();
  assert.match(x, /urn:iso:std:iso:20022:tech:xsd:pain\.008\.001\.08/); assert.match(x, /<LclInstrm><Cd>B2B<\/Cd><\/LclInstrm><SeqTp>FRST<\/SeqTp>/);
  assert.match(x, /<InstdAmt Ccy="EUR">390\.00<\/InstdAmt>/);   // 1190 brutto − 800 bezahlt
  assert.match(x, /<MndtId>M-1<\/MndtId><DtOfSgntr>2026-09-01<\/DtOfSgntr>/); assert.match(x, /<IBAN>DE02120300000000202051<\/IBAN>/);
  const x2 = (await rufen('b', '/api/lastschrift', { ids: [rechnung], datum: plus(heute, 5) })).buf.toString(); assert.match(x2, /<SeqTp>RCUR<\/SeqTp>/);
  const c = (await rufen('b', '/api/controlling')).j; assert.strictEqual(c.monate.length, 12); assert.strictEqual(c.monate[11].umsatz, 1000); assert.strictEqual(c.konten.erloes, '8400');
});

test('Reports: alle laufen, Karteileichen, Minijob-Grenze, Rendite, Krankenquote, CSV, Bericht Geschäftsführung', async function () {
  const kat = (await rufen('b', '/api/reports')).j; assert.ok(kat.length >= 30, 'nur ' + kat.length + ' Reports');
  const von = heute.slice(0, 4) + '-01-01', bis = heute;
  for (const r of kat) {
    const q = r.id === 'erledigung' ? '&von=' + plus(heute, -20) + '&bis=' + heute : '&von=' + von + '&bis=' + bis;
    const x = await rufen('b', '/api/report?id=' + r.id + q); assert.strictEqual(x.status, 200, r.id + ': ' + JSON.stringify(x.j)); assert.ok(Array.isArray(x.j.zeilen), r.id);
    x.j.zeilen.slice(0, 3).forEach(function (z) { r.spalten.forEach(function (s) { assert.ok(!(typeof z[s.k] === 'number' && !isFinite(z[s.k])), r.id + '.' + s.k + ' ist keine Zahl'); }); });
  }
  // Karteileichen: Kraft ohne Einsatz
  const lz = (await rufen('b', '/api/mitarbeiter', { name: 'Nie Da' })).j.id;
  const k = (await rufen('b', '/api/report?id=karteileichen&tage=30')).j.zeilen; assert.match(k.find(x => x.mitarbeiter_id === lz).hinweis, /noch nie eingesetzt/);
  assert.strictEqual(k.find(x => x.mitarbeiter_id === anna).tageSeit <= 31, true);
  // Minijob über der Grenze: 45 Stunden × 16 € = 720 € > 603 €
  await rufen('b', '/api/personal', { id: anna, beschaeftigungsart: 'minijob' });
  const m = heute.slice(0, 7); for (let i = 10; i < 17; i++) db.prepare("INSERT INTO zeitbuchung (mitarbeiter_id, objekt_id, kommen, gehen) VALUES (?, ?, ?, ?)").run(anna, objekt, m + '-' + i + ' 06:00:00', m + '-' + i + ' 11:00:00');
  const mj = (await rufen('b', '/api/report?id=minijob&jahr=' + heute.slice(0, 4))).j.zeilen.find(x => x.mitarbeiter_id === anna);
  assert.strictEqual(mj['m' + heute.slice(5, 7)], 720); assert.match(mj.hinweis, /überschritten/);
  // Planungen: Rendite = DB / Lohnkosten × 100
  const pl = (await rufen('b', '/api/report?id=planungen&von=' + m + '-01&bis=' + m + '-28')).j.zeilen.find(x => x.objekt_id === objekt);
  assert.strictEqual(pl.lohn, 900); assert.strictEqual(pl.umsatzIst, 1000); assert.strictEqual(pl.rendite, Math.round((1000 - 900) / 900 * 1000) / 10);
  // Krankenquote
  db.prepare("INSERT INTO abwesenheit (mitarbeiter_id, von, bis, art) VALUES (?, ?, ?, 'krank')").run(anna, m + '-01', m + '-01');
  assert.ok((await rufen('b', '/api/report?id=krankenquote&von=' + m + '-01&bis=' + m + '-28')).j.zeilen.find(x => x.mitarbeiter_id === anna).krank >= 0);
  const csv = (await rufen('b', '/api/report.csv?id=telefonliste')).buf.toString(); assert.match(csv, /^﻿Mitarbeiter;Telefon;E-Mail/);
  assert.strictEqual((await rufen('b', '/api/report?id=erledigung&von=2026-01-01&bis=2026-06-30')).status, 400);   // mehr als 62 Tage
  assert.strictEqual((await rufen('b', '/api/report?id=gibtsnicht')).status, 400);
  const gb = await rufen('b', '/api/bericht/geschaeftsfuehrung?monat=' + m); assert.strictEqual(gb.typ, 'application/pdf'); assert.ok(gb.buf.length > 20000);
});
