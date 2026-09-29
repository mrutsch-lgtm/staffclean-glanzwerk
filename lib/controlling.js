// controlling.js — Schnittstellen für Steuerbüro, Lohnbüro und Bank:
//   1. DATEV-Buchungsstapel (EXTF, Format 700, Kategorie 21): Ausgangsrechnungen (Debitor an Erlös, Kostenstelle = Objekt)
//      und Zahlungseingänge (Bank an Debitor)
//   2. DATEV LODAS Bewegungsdaten (ASCII mit [Allgemein]/[Satzbeschreibung]/[Bewegungsdaten]): Stunden je Mitarbeiter,
//      Lohnart und Kostenstelle
//   3. Kontoauszug CAMT.053 einlesen, Gutschriften den offenen Rechnungen zuordnen (Rechnungsnummer, Betrag, Name)
//   4. SEPA-Lastschrift pain.008.001.08 für Kunden mit Mandat (CORE / B2B)
//
// ⚠ Die DATEV-Formate nach Beschreibung der DATEV (developer.datev.de, LODAS-Schnittstellenhandbuch) — vor dem ersten
// echten Import einmal mit dem Steuerbüro als Testimport durchspielen (Kontenrahmen, Berater-/Mandantennummer, BS-Nummern).
'use strict';
const crypto = require('crypto');
const DB = require('./db');
const AB = require('./abrechnung');
const DP = require('./dienstplan');

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const komma = v => r2(Math.abs(v)).toFixed(2).replace('.', ',');
const ttmm = d => String(d).slice(8, 10) + String(d).slice(5, 7);
const txt = (s, n) => '"' + String(s == null ? '' : s).replace(/"/g, '""').replace(/[\r\n;]+/g, ' ').slice(0, n || 60) + '"';
const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const kostenstelle = o => o ? String(o.objektnummer || ('O' + o.id)).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) : '';

// Konten je Kontenrahmen (Standard, in den Einstellungen überschreibbar)
const KONTEN = { SKR03: { erloes: '8400', erloes13b: '8337', bank: '1200' }, SKR04: { erloes: '4400', erloes13b: '4337', bank: '1800' } };
function konten(e) {
  const skr = e.datev_kontenrahmen === 'SKR04' ? 'SKR04' : 'SKR03', k = KONTEN[skr];
  return { skr: skr, erloes: e.datev_erloeskonto || k.erloes, erloes13b: e.datev_erloeskonto_13b || k.erloes13b, bank: e.datev_bankkonto || k.bank };
}
const debitor = (db, kundeId) => { const k = db.prepare('SELECT debitor_konto FROM kunde WHERE id = ?').get(kundeId) || {}; return String(k.debitor_konto || (10000 + Number(kundeId))); };

// ---------- 1. DATEV-Buchungsstapel
const SPALTEN = ['Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs', 'Basis-Umsatz', 'WKZ Basis-Umsatz', 'Konto', 'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext',
  'Postensperre', 'Diverse Adressnummer', 'Geschäftspartnerbank', 'Sachverhalt', 'Zinssperre', 'Beleglink', 'Beleginfo - Art 1', 'Beleginfo - Inhalt 1', 'Beleginfo - Art 2', 'Beleginfo - Inhalt 2', 'Beleginfo - Art 3', 'Beleginfo - Inhalt 3', 'Beleginfo - Art 4', 'Beleginfo - Inhalt 4',
  'Beleginfo - Art 5', 'Beleginfo - Inhalt 5', 'Beleginfo - Art 6', 'Beleginfo - Inhalt 6', 'Beleginfo - Art 7', 'Beleginfo - Inhalt 7', 'Beleginfo - Art 8', 'Beleginfo - Inhalt 8', 'KOST1 - Kostenstelle', 'KOST2 - Kostenstelle', 'Kost-Menge'];
function buchungsstapel(db, von, bis, opt) {
  opt = opt || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(von || '') || !/^\d{4}-\d{2}-\d{2}$/.test(bis || '') || bis < von) throw new Error('Zeitraum von/bis prüfen');
  if (von.slice(0, 4) !== bis.slice(0, 4)) throw new Error('Ein Buchungsstapel umfasst nur ein Wirtschaftsjahr — bitte Zeitraum innerhalb eines Jahres wählen.');
  const e = DB.einstellungen(db), k = konten(e), zeilen = [];
  const zeile = f => { const z = new Array(SPALTEN.length).fill(''); Object.keys(f).forEach(function (i) { z[i] = f[i]; }); zeilen.push(z.join(';')); };
  // Ausgangsrechnungen: je Rechnung und Kostenstelle eine Buchung Debitor (Soll) an Erlöskonto, Bruttobetrag (Automatikkonto)
  let nRe = 0, nZa = 0;
  if (opt.rechnungen !== false) db.prepare("SELECT * FROM rechnung WHERE nummer IS NOT NULL AND datum BETWEEN ? AND ? ORDER BY nummer").all(von, bis).forEach(function (r) {
    const pos = db.prepare('SELECT betrag, objekt_id FROM rechnung_position WHERE rechnung_id = ?').all(r.id), je = {};
    pos.forEach(function (p) { const oid = p.objekt_id || r.objekt_id || 0; je[oid] = (je[oid] || 0) + p.betrag; });
    const rc = r.steuerfall === 'reverse_charge', faktor = 1 + (r.ust_prozent || 0) / 100;
    Object.keys(je).forEach(function (oid) {
      const brutto = r2(je[oid] * faktor); if (!brutto) return;
      const o = Number(oid) ? db.prepare('SELECT id, objektnummer FROM objekt WHERE id = ?').get(Number(oid)) : null;
      zeile({ 0: komma(brutto), 1: brutto >= 0 ? 'S' : 'H', 2: 'EUR', 6: debitor(db, r.kunde_id), 7: rc ? k.erloes13b : k.erloes, 9: ttmm(r.datum), 10: txt(r.nummer, 36), 13: txt((r.storno_von ? 'Storno ' : 'Rechnung ') + r.nummer, 60), 36: txt(kostenstelle(o), 36) });
      nRe++;
    });
  });
  // Zahlungseingänge: Bank (Soll) an Debitor, OPOS-Ausgleich über Belegfeld 1 = Rechnungsnummer
  if (opt.zahlungen !== false) db.prepare("SELECT z.*, r.nummer, r.kunde_id FROM zahlung z JOIN rechnung r ON r.id = z.rechnung_id WHERE z.datum BETWEEN ? AND ? AND z.art <> 'ausbuchung' ORDER BY z.datum, z.id").all(von, bis).forEach(function (z) {
    zeile({ 0: komma(z.betrag), 1: 'S', 2: 'EUR', 6: k.bank, 7: debitor(db, z.kunde_id), 9: ttmm(z.datum), 10: txt(z.nummer, 36), 13: txt('Zahlung ' + z.nummer, 60) }); nZa++;
  });
  const jetzt = new Date(), ts = jetzt.getFullYear() + String(jetzt.getMonth() + 1).padStart(2, '0') + String(jetzt.getDate()).padStart(2, '0') + String(jetzt.getHours()).padStart(2, '0') + String(jetzt.getMinutes()).padStart(2, '0') + String(jetzt.getSeconds()).padStart(2, '0') + String(jetzt.getMilliseconds()).padStart(3, '0');
  const wj = von.slice(0, 4) + String(e.datev_wj_beginn || '0101').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  const kopf = ['"EXTF"', 700, 21, '"Buchungsstapel"', 13, ts, '', '"RE"', '"Glanzwerk"', '', e.datev_berater_nr || '', e.datev_mandant_nr || '', wj, 4, von.replace(/-/g, ''), bis.replace(/-/g, ''), txt('Ausgangsrechnungen ' + von.slice(0, 7), 30), '', 1, 0, 0, '"EUR"', '', '', '', '', txt(k.skr.slice(3), 2), '', '', '', ''].join(';');
  const fehlt = []; if (!e.datev_berater_nr) fehlt.push('Beraternummer'); if (!e.datev_mandant_nr) fehlt.push('Mandantennummer');
  return { datei: [kopf, SPALTEN.join(';')].concat(zeilen).join('\r\n') + '\r\n', rechnungen: nRe, zahlungen: nZa, konten: k, fehlt: fehlt };
}

// ---------- 2. DATEV LODAS Bewegungsdaten (Stunden je Mitarbeiter, Lohnart, Kostenstelle)
function lodas(db, monat) {
  if (!/^\d{4}-\d{2}$/.test(monat || '')) throw new Error('Monat im Format JJJJ-MM');
  const e = DB.einstellungen(db), g = AB.monatsgrenzen(monat), je = {};
  db.prepare("SELECT z.*, o.bundesland, o.objektnummer, o.id oid, m.personalnummer, m.name FROM zeitbuchung z JOIN mitarbeiter m ON m.id = z.mitarbeiter_id LEFT JOIN objekt o ON o.id = z.objekt_id WHERE z.gehen IS NOT NULL AND substr(z.kommen,1,10) BETWEEN ? AND ?").all(g.von, g.bis).forEach(function (z) {
    const a = DP.aufteilen(z.kommen, z.gehen, z.pause_min, z.bundesland || 'SH', e.zuschlag_nacht_von, e.zuschlag_nacht_bis), ks = kostenstelle(z.oid ? { id: z.oid, objektnummer: z.objektnummer } : null);
    [['stunden', a.gesamt], ['nacht', a.nacht], ['sonntag', a.sonntag], ['feiertag', a.feiertag]].forEach(function (x) {
      if (!x[1]) return; const key = (z.personalnummer || '?' + z.name) + '|' + x[0] + '|' + ks; je[key] = (je[key] || 0) + x[1];
    });
  });
  const fehlend = new Set(), zeilen = [];
  Object.keys(je).sort().forEach(function (key) {
    const [pnr, art, ks] = key.split('|'); if (pnr[0] === '?') { fehlend.add(pnr.slice(1)); return; }
    zeilen.push(['1', '01.' + monat.slice(5, 7) + '.' + monat.slice(0, 4), pnr, e['lohnart_' + art] || '', e.lodas_bs_nr || '1', (Math.round(je[key] / 60 * 100) / 100).toFixed(2).replace('.', ','), ks].join(';') + ';');
  });
  const datei = ['[Allgemein]', 'Ziel=LODAS', 'Version_SST=1.0', 'BeraterNr=' + (e.datev_berater_nr || ''), 'MandantenNr=' + (e.datev_mandant_nr || ''), 'Datumsangaben=TTMMJJJJ', 'Feldtrennzeichen=;', 'Zahlenkomma=,', 'Kommentarzeichen=*', '',
    '[Satzbeschreibung]', '1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;pnr#bwd;la_eigene#bwd;bs_nr#bwd;bs_wert_butab#bwd;kostenstelle#bwd;', '',
    '[Bewegungsdaten]'].concat(zeilen).join('\r\n') + '\r\n';
  return { datei: datei, zeilen: zeilen.length, fehlendePersonalnummer: [...fehlend] };
}

// ---------- 3. Kontoauszug CAMT.053 einlesen und zuordnen
function tabellen(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS bankumsatz (id INTEGER PRIMARY KEY, schluessel TEXT UNIQUE NOT NULL, datum TEXT, betrag REAL, name TEXT, iban TEXT, zweck TEXT,
    rechnung_id INTEGER, status TEXT DEFAULT 'offen', angelegt_am TEXT DEFAULT (datetime('now','localtime')))`);
  const sp = db.prepare('PRAGMA table_info(kunde)').all().map(function (c) { return c.name; });
  [['debitor_konto', 'TEXT'], ['sepa_iban', 'TEXT'], ['sepa_bic', 'TEXT'], ['mandatsreferenz', 'TEXT'], ['mandat_datum', 'TEXT'], ['lastschrift', 'TEXT'], ['lastschrift_erste', 'INTEGER DEFAULT 1']]
    .forEach(function (x) { if (sp.indexOf(x[0]) < 0) db.exec('ALTER TABLE kunde ADD COLUMN ' + x[0] + ' ' + x[1]); });
  [['datev_kontenrahmen', 'SKR03'], ['datev_erloeskonto', ''], ['datev_erloeskonto_13b', ''], ['datev_bankkonto', ''], ['datev_wj_beginn', '0101'], ['lodas_bs_nr', '1'], ['sepa_glaeubiger_id', '']]
    .forEach(function (x) { db.prepare('INSERT OR IGNORE INTO einstellung (schluessel, wert) VALUES (?, ?)').run(x[0], x[1]); });
}
const tag = (xml, name) => { const m = xml.match(new RegExp('<(?:\\w+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + name + '>')); return m ? m[1].trim() : ''; };
const alle = (xml, name) => { const re = new RegExp('<(?:\\w+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + name + '>', 'g'), aus = []; let m; while ((m = re.exec(xml))) aus.push(m[1]); return aus; };
const ent = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
function camtLesen(xml) {
  if (!/BkToCstmrStmt|BkToCstmrAcctRpt/.test(xml)) throw new Error('Das ist keine CAMT.053/052-Datei (Kontoauszug im XML-Format der Bank).');
  return alle(xml, 'Ntry').map(function (n) {
    const betrag = Number(tag(n, 'Amt')) || 0, soll = tag(n, 'CdtDbtInd') === 'DBIT', dt = tag(n, 'BookgDt') || tag(n, 'ValDt');
    const partei = soll ? tag(n, 'Cdtr') : tag(n, 'Dbtr'), konto = soll ? tag(n, 'CdtrAcct') : tag(n, 'DbtrAcct');
    const zweck = alle(n, 'Ustrd').map(ent).join(' ') || ent(tag(n, 'AddtlNtryInf'));
    const ref = tag(n, 'AcctSvcrRef') || tag(n, 'EndToEndId');
    const datum = (tag(dt, 'Dt') || tag(dt, 'DtTm')).slice(0, 10);
    return { datum: datum, betrag: soll ? -betrag : betrag, name: ent(tag(partei, 'Nm')), iban: tag(konto, 'IBAN'), zweck: zweck.replace(/\s+/g, ' ').trim(),
      schluessel: crypto.createHash('sha1').update([ref, datum, betrag, soll, zweck].join('|')).digest('hex') };
  });
}
// Vorschlag je Gutschrift: Rechnungsnummer im Verwendungszweck → sicher; sonst gleicher Betrag + Kundenname → wahrscheinlich
function camtAbgleich(db, xml) {
  const umsaetze = camtLesen(xml), op = db.prepare("SELECT r.*, k.name kunde FROM rechnung r JOIN kunde k ON k.id = r.kunde_id WHERE r.status = 'gestellt' AND r.storno_von IS NULL").all()
    .map(function (r) { r.offen = AB.offenBetrag(db, r); return r; });
  return umsaetze.map(function (u) {
    const schon = db.prepare('SELECT * FROM bankumsatz WHERE schluessel = ?').get(u.schluessel);
    if (schon) return Object.assign(u, { status: 'schon eingelesen', rechnung_id: schon.rechnung_id });
    if (u.betrag <= 0) return Object.assign(u, { status: 'Lastschrift/Abgang — nicht zuzuordnen' });
    const nr = (u.zweck.match(/RE-\d{4}-\d{4}/g) || []).map(function (x) { return x.toUpperCase(); });
    let treffer = op.find(function (r) { return nr.indexOf(r.nummer) >= 0; }), sicher = !!treffer;
    if (!treffer) { const name = u.name.toLowerCase(); treffer = op.find(function (r) { return Math.abs(r.offen - u.betrag) < 0.005 && name && r.kunde.toLowerCase().split(/\s+/).some(function (w) { return w.length > 3 && name.indexOf(w) >= 0; }); }); }
    if (!treffer) return Object.assign(u, { status: 'keine passende Rechnung' });
    return Object.assign(u, { status: sicher ? 'Rechnungsnummer erkannt' : 'Betrag und Name passen', sicher: sicher, rechnung_id: treffer.id, nummer: treffer.nummer, kunde: treffer.kunde, offen: treffer.offen, ueberzahlung: u.betrag > treffer.offen + 0.005 });
  });
}
function camtBuchen(db, xml, auswahl) {
  const v = camtAbgleich(db, xml), gewaehlt = (auswahl || []).map(String), aus = { gebucht: [], fehler: [] };
  v.forEach(function (u) {
    if (gewaehlt.indexOf(u.schluessel) < 0 || !u.rechnung_id || u.status === 'schon eingelesen') return;
    try {
      const betrag = Math.min(u.betrag, u.offen);
      AB.zahlungBuchen(db, { rechnung_id: u.rechnung_id, betrag: betrag, datum: u.datum > heute() ? heute() : u.datum, art: 'ueberweisung', notiz: 'Kontoauszug: ' + (u.name || '') + (u.ueberzahlung ? ' (Überzahlung ' + komma(u.betrag - u.offen) + ' €)' : '') });
      db.prepare("INSERT INTO bankumsatz (schluessel, datum, betrag, name, iban, zweck, rechnung_id, status) VALUES (?,?,?,?,?,?,?, 'gebucht')").run(u.schluessel, u.datum, u.betrag, u.name, u.iban, u.zweck, u.rechnung_id);
      aus.gebucht.push({ nummer: u.nummer, betrag: betrag });
    } catch (e) { aus.fehler.push({ nummer: u.nummer, grund: e.message }); }
  });
  return aus;
}

// ---------- 4. SEPA-Lastschrift pain.008.001.08
function iban(v) { return String(v || '').replace(/\s/g, '').toUpperCase(); }
function lastschriftKandidaten(db) {
  return db.prepare("SELECT r.*, k.name kunde, k.sepa_iban, k.sepa_bic, k.mandatsreferenz, k.mandat_datum, k.lastschrift, k.lastschrift_erste FROM rechnung r JOIN kunde k ON k.id = r.kunde_id WHERE r.status = 'gestellt' AND r.storno_von IS NULL AND k.lastschrift IN ('CORE','B2B') ORDER BY r.faellig")
    .all().map(function (r) { r.offen = AB.offenBetrag(db, r); r.bereit = !!(r.sepa_iban && r.mandatsreferenz && r.mandat_datum && r.offen > 0); return r; });
}
function pain008(db, ids, datum) {
  const e = DB.einstellungen(db), x = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const P = require('./personal');
  if (!e.sepa_glaeubiger_id) throw new Error('Gläubiger-Identifikationsnummer fehlt (Controlling → Einstellungen).');
  if (!e.iban || P.iban(e.iban)) throw new Error('Eigene IBAN fehlt oder ist ungültig (Stammdaten → Einstellungen).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || '') || datum <= heute()) throw new Error('Einzugsdatum muss in der Zukunft liegen (Vorlauf der Bank beachten).');
  const l = lastschriftKandidaten(db).filter(function (r) { return ids.map(Number).indexOf(r.id) >= 0 && r.bereit; });
  if (!l.length) throw new Error('Keine einzugsfähige Rechnung ausgewählt (Mandat mit IBAN, Referenz und Datum nötig).');
  l.forEach(function (r) { const f = P.iban(r.sepa_iban); if (f) throw new Error('IBAN von „' + r.kunde + '": ' + f); });
  const gruppen = {}; l.forEach(function (r) { const g = r.lastschrift + '|' + (r.lastschrift_erste ? 'FRST' : 'RCUR'); (gruppen[g] = gruppen[g] || []).push(r); });
  const msg = 'GW' + Date.now(), summe = l.reduce(function (a, r) { return a + r.offen; }, 0);
  const pmt = Object.keys(gruppen).map(function (g, i) {
    const [art, seq] = g.split('|'), rs = gruppen[g];
    return '    <PmtInf>\n      <PmtInfId>' + msg + '-' + (i + 1) + '</PmtInfId><PmtMtd>DD</PmtMtd><NbOfTxs>' + rs.length + '</NbOfTxs><CtrlSum>' + r2(rs.reduce(function (a, r) { return a + r.offen; }, 0)).toFixed(2) + '</CtrlSum>\n' +
      '      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>' + art + '</Cd></LclInstrm><SeqTp>' + seq + '</SeqTp></PmtTpInf><ReqdColltnDt>' + datum + '</ReqdColltnDt>\n' +
      '      <Cdtr><Nm>' + x(String(e.firma_name).slice(0, 70)) + '</Nm></Cdtr><CdtrAcct><Id><IBAN>' + iban(e.iban) + '</IBAN></Id></CdtrAcct><CdtrAgt><FinInstnId>' + (e.bic ? '<BICFI>' + x(e.bic) + '</BICFI>' : '<Othr><Id>NOTPROVIDED</Id></Othr>') + '</FinInstnId></CdtrAgt><ChrgBr>SLEV</ChrgBr>\n' +
      '      <CdtrSchmeId><Id><PrvtId><Othr><Id>' + x(e.sepa_glaeubiger_id) + '</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>\n' +
      rs.map(function (r) {
        return '      <DrctDbtTxInf><PmtId><EndToEndId>' + x(r.nummer) + '</EndToEndId></PmtId><InstdAmt Ccy="EUR">' + r2(r.offen).toFixed(2) + '</InstdAmt>' +
          '<DrctDbtTx><MndtRltdInf><MndtId>' + x(r.mandatsreferenz) + '</MndtId><DtOfSgntr>' + r.mandat_datum + '</DtOfSgntr></MndtRltdInf></DrctDbtTx>' +
          '<DbtrAgt><FinInstnId>' + (r.sepa_bic ? '<BICFI>' + x(r.sepa_bic) + '</BICFI>' : '<Othr><Id>NOTPROVIDED</Id></Othr>') + '</FinInstnId></DbtrAgt><Dbtr><Nm>' + x(String(r.kunde).slice(0, 70)) + '</Nm></Dbtr><DbtrAcct><Id><IBAN>' + iban(r.sepa_iban) + '</IBAN></Id></DbtrAcct>' +
          '<RmtInf><Ustrd>' + x(('Rechnung ' + r.nummer + ' vom ' + String(r.datum).split('-').reverse().join('.')).slice(0, 140)) + '</Ustrd></RmtInf></DrctDbtTxInf>\n';
      }).join('') + '    </PmtInf>\n';
  }).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08">\n  <CstmrDrctDbtInitn>\n    <GrpHdr><MsgId>' + msg + '</MsgId><CreDtTm>' + new Date().toISOString().slice(0, 19) + '</CreDtTm><NbOfTxs>' + l.length + '</NbOfTxs><CtrlSum>' + r2(summe).toFixed(2) + '</CtrlSum><InitgPty><Nm>' + x(String(e.firma_name).slice(0, 70)) + '</Nm></InitgPty></GrpHdr>\n' + pmt + '  </CstmrDrctDbtInitn>\n</Document>\n';
  // Nach Erzeugung: Erst-Lastschrift je Mandat ist verbraucht → künftig RCUR
  l.forEach(function (r) { db.prepare('UPDATE kunde SET lastschrift_erste = 0 WHERE id = ?').run(r.kunde_id); });
  return { xml: xml, anzahl: l.length, summe: r2(summe) };
}

module.exports = { tabellen, konten, buchungsstapel, lodas, camtLesen, camtAbgleich, camtBuchen, lastschriftKandidaten, pain008, kostenstelle, SPALTEN };
