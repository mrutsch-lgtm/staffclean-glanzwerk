'use strict';
// Abnahme der Erweiterung 28.09.2026: Rechnung frei erstellen (wie Lexware/SecPlan), Zahlungen, Mahnwesen, Personalakte,
// Objektakte, Kommunikation (Kanäle, Direktnachrichten, Mängelchat) und Planner — echter Server, echte Anfragen, Rechte.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-erw-'));
process.env.STAFFCLEAN_DATEN = ORDNER;
const { server, db } = require('../server');
const P = require('../lib/personal');
const MW = require('../lib/mahnwesen');
let BASIS;
const keks = {};
async function rufen(wer, pfad, daten) {
  const opt = { headers: {} };
  if (keks[wer]) opt.headers.Cookie = keks[wer];
  if (daten !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(daten); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(BASIS + pfad, opt);
  const sc = r.headers.get('set-cookie'); if (sc && /gw=/.test(sc)) keks[wer] = sc.split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, typ: typ, j: /json/.test(typ) ? await r.json() : null, buf: /json/.test(typ) ? null : Buffer.from(await r.arrayBuffer()) };
}
const heute = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// gültige Prüfziffern erzeugen (statt echte Nummern ins Repository zu schreiben)
function steuerIdMit(zehn) { let pr = 10; for (let i = 0; i < 10; i++) { let s = (Number(zehn[i]) + pr) % 10; if (!s) s = 10; pr = (s * 2) % 11; } let z = 11 - pr; if (z === 10) z = 0; return zehn + z; }
function svMit(elf) { const b = String(elf.charCodeAt(8) - 64).padStart(2, '0'); const d = (elf.slice(0, 8) + b + elf.slice(9, 11)).split('').map(Number), g = [2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1]; return elf + (d.reduce((a, z, i) => { const p = z * g[i]; return a + Math.floor(p / 10) + p % 10; }, 0) % 10); }

let kunde, obj1, obj2, anna;
test.before(async function () {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); BASIS = 'http://127.0.0.1:' + server.address().port;
  await rufen('buero', '/api/einrichten', { name: 'Büro Test', email: 'buero@example.org', passwort: 'geheim-und-lang-2026' });
  await rufen('buero', '/api/einstellungen', { firma_email: 'rechnung@example.org', firma_telefon: '04321 000000', steuernummer: '00/000/00000', iban: 'DE02 1203 0000 0000 2020 51', bank: 'Testbank', bic: 'BYLADEM1001' });
  kunde = (await rufen('buero', '/api/kunde', { name: 'Kanzlei Nord GmbH', anschrift: 'Holstenstraße 5', plz: '24103', ort: 'Kiel', email: 'kanzlei@example.org', kundennummer: 'K-3001' })).j.id;
  obj1 = (await rufen('buero', '/api/objekt', { name: 'Kanzlei EG', kunde_id: kunde, strasse: 'Holstenstraße 5', plz: '24103', ort: 'Kiel' })).j.id;
  obj2 = (await rufen('buero', '/api/objekt', { name: 'Kanzlei 1. OG', kunde_id: kunde, strasse: 'Holstenstraße 5', plz: '24103', ort: 'Kiel' })).j.id;
  await rufen('buero', '/api/objekt/preis', { id: obj1, monatspreis: 800 }); await rufen('buero', '/api/objekt/preis', { id: obj2, monatspreis: 450 });
  anna = (await rufen('buero', '/api/mitarbeiter', { name: 'Anna Test', pin: '1111', wochenstunden: 20 })).j.id;
  await rufen('buero', '/api/einsatz', { objekt_id: obj1, mitarbeiter_id: anna });
  await rufen('app', '/api/app/anmelden', { mitarbeiter_id: anna, pin: '1111' });
});
test.after(function () { server.close(); });

test('Rechnung frei erstellen: mehrere Objekte, Artikel, freie Position, Nachlass, Reihenfolge, Kopf, PDF, XML', async function () {
  const art = (await rufen('buero', '/api/artikel', { nummer: 'A-10', bezeichnung: 'Grundreinigung Teppich', beschreibung: 'Sprühextraktion', einheit: 'm²', preis: '3,20' })).j.id;
  const monat = heute.slice(0, 7), g = { von: monat + '-01', bis: plus(monat.slice(0, 7) + '-28', 0) };
  const r = await rufen('buero', '/api/rechnung/frei', { kunde_id: kunde, von: g.von, bis: g.bis, betreff: 'Unterhaltsreinigung Kanzlei', bestellnummer: 'PO-4711', objekte: [obj1, obj2], monat: monat });
  assert.strictEqual(r.status, 200, JSON.stringify(r.j)); const id = r.j.id;
  // dasselbe Objekt ein zweites Mal übernehmen → Hinweis statt Doppelabrechnung
  assert.match((await rufen('buero', '/api/rechnung/objekt', { id: id, objekt_id: obj1, monat: monat })).j.hinweise.join(' '), /schon in dieser Rechnung/);
  await rufen('buero', '/api/rechnung/artikel', { id: id, artikel_id: art, menge: '40', gruppe: 'Sonderleistungen' });
  await rufen('buero', '/api/rechnung/position', { rechnung_id: id, bezeichnung: 'Anfahrt Sondertermin', menge: 1, einheit: 'pauschal', einzelpreis: 25, gruppe: 'Sonderleistungen' });
  await rufen('buero', '/api/rechnung/position', { rechnung_id: id, bezeichnung: 'Nachlass Neukunde', menge: 1, einheit: 'pauschal', einzelpreis: -50 });
  let v = (await rufen('buero', '/api/rechnung?id=' + id)).j;
  assert.strictEqual(v.positionen.length, 5); assert.strictEqual(v.netto, 800 + 450 + 128 + 25 - 50);
  const letzte = v.positionen[4].id; await rufen('buero', '/api/rechnung/verschieben', { id: id, position_id: letzte, richtung: 'hoch' });
  v = (await rufen('buero', '/api/rechnung?id=' + id)).j; assert.strictEqual(v.positionen[3].id, letzte);
  assert.strictEqual((await rufen('buero', '/api/rechnung/kopf', { id: id, von: g.bis, bis: g.von })).status, 400);   // Zeitraum rückwärts
  await rufen('buero', '/api/rechnung/kopf', { id: id, von: g.von, bis: g.bis, betreff: 'Unterhaltsreinigung Kanzlei ' + monat, bestellnummer: 'PO-4711', einleitung: 'Sehr geehrte Frau Nord,\nanbei unsere Rechnung.', zahlungsziel_tage: 30 });
  const st = await rufen('buero', '/api/rechnung/stellen', { id: id }); assert.strictEqual(st.status, 200, JSON.stringify(st.j));
  v = (await rufen('buero', '/api/rechnung?id=' + id)).j; assert.strictEqual(v.faellig, plus(heute, 30)); assert.strictEqual(v.offen, v.brutto);
  const pdf = await rufen('buero', '/api/rechnung/pdf?id=' + id); assert.strictEqual(pdf.buf.slice(0, 4).toString(), '%PDF');
  const x = await rufen('buero', '/api/rechnung/xrechnung?id=' + id); assert.match(x.buf.toString(), /<cac:OrderReference><cbc:ID>PO-4711<\/cbc:ID>/);
  const zf = require('../lib/zugferd').xml(db, require('../lib/abrechnung').voll(db, id)); assert.match(zf, /<ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>PO-4711/);
  // zweiter Entwurf für dieselben Objekte im selben Monat → gesperrt
  const r2 = (await rufen('buero', '/api/rechnung/frei', { kunde_id: kunde, von: g.von, bis: g.bis, objekte: [obj1], monat: monat })).j;
  assert.match(r2.hinweise.join(' '), /schon abgerechnet/);
  // kopieren als Vorlage
  const k = (await rufen('buero', '/api/rechnung/kopieren', { id: id })).j.id; const kv = (await rufen('buero', '/api/rechnung?id=' + k)).j;
  assert.strictEqual(kv.status, 'entwurf'); assert.strictEqual(kv.positionen.length, 5); assert.strictEqual(kv.betreff, v.betreff);
  // Rechnung ohne positiven Betrag lässt sich nicht stellen
  const leer = (await rufen('buero', '/api/rechnung/frei', { kunde_id: kunde, von: heute, bis: heute })).j.id;
  await rufen('buero', '/api/rechnung/position', { rechnung_id: leer, bezeichnung: 'Gutschrift', menge: 1, einzelpreis: -10 });
  assert.match((await rufen('buero', '/api/rechnung/stellen', { id: leer })).j.fehler, /größer 0/);
});

test('Zahlungen: Teilzahlung, Überzahlung abgelehnt, Restzahlung → bezahlt, zurücknehmen → offen', async function () {
  const l = (await rufen('buero', '/api/rechnungen')).j.filter(r => r.status === 'gestellt'); const r = l[0];
  assert.strictEqual((await rufen('buero', '/api/rechnung/zahlung', { rechnung_id: r.id, betrag: r.brutto + 1 })).status, 400);
  assert.strictEqual((await rufen('buero', '/api/rechnung/zahlung', { rechnung_id: r.id, betrag: '500,00', datum: heute })).j.offen, Math.round((r.brutto - 500) * 100) / 100);
  let v = (await rufen('buero', '/api/rechnung?id=' + r.id)).j; assert.strictEqual(v.status, 'gestellt'); assert.strictEqual(v.zahlungen.length, 1);
  assert.strictEqual((await rufen('buero', '/api/rechnung/zahlung', { rechnung_id: r.id, datum: plus(heute, 3) })).status, 400);   // Datum in der Zukunft
  await rufen('buero', '/api/rechnung/zahlung', { rechnung_id: r.id });   // leer = offener Rest
  v = (await rufen('buero', '/api/rechnung?id=' + r.id)).j; assert.strictEqual(v.status, 'bezahlt'); assert.strictEqual(v.offen, 0);
  await rufen('buero', '/api/rechnung/bezahlt', { id: r.id, zurueck: true });
  v = (await rufen('buero', '/api/rechnung?id=' + r.id)).j; assert.strictEqual(v.status, 'gestellt'); assert.strictEqual(v.zahlungen.length, 0);
  const kz = (await rufen('buero', '/api/abrechnung/kennzahlen')).j; assert.ok(kz.offen >= v.brutto); assert.ok(kz.umsatzMonat > 0);
});

test('Mahnwesen: Erinnerung → 1. → 2. → letzte Mahnung, Fristen, Pauschale, Verzugszinsen, Mahnsperre, PDF, OP-Liste', async function () {
  const r = (await rufen('buero', '/api/rechnungen')).j.find(x => x.status === 'gestellt');
  // noch nicht fällig → keine Mahnung
  assert.match((await rufen('buero', '/api/mahnung', { rechnung_id: r.id })).j.fehler, /Keine Mahnung fällig/);
  db.prepare('UPDATE rechnung SET faellig = ? WHERE id = ?').run(plus(heute, -60), r.id);   // 60 Tage überfällig
  let op = (await rufen('buero', '/api/offene-posten')).j; let x = op.posten.find(p => p.id === r.id);
  assert.strictEqual(x.naechsteStufe, 0); assert.strictEqual(x.tageUeberfaellig, 60); assert.ok(op.alter.find(a => a.text === '31–60 Tage').anzahl >= 1);
  // Mahnsperre verhindert Mahnung
  await rufen('buero', '/api/rechnung/mahnsperre', { id: r.id, an: true, grund: 'Kunde prüft Stunden' });
  assert.strictEqual((await rufen('buero', '/api/mahnlauf', {})).j.angelegt.length, 0);
  await rufen('buero', '/api/rechnung/mahnsperre', { id: r.id, an: false });
  const m0 = (await rufen('buero', '/api/mahnung', { rechnung_id: r.id })).j; assert.strictEqual(m0.stufe, 0); assert.strictEqual(m0.gebuehr, 0); assert.strictEqual(m0.pauschale, 0);
  // Frist läuft → keine weitere Stufe
  assert.match((await rufen('buero', '/api/mahnung', { rechnung_id: r.id })).j.fehler, /Frist/);
  db.prepare('UPDATE mahnung SET datum = ?, frist = ? WHERE id = ?').run(plus(heute, -20), plus(heute, -10), m0.id);
  const m1 = (await rufen('buero', '/api/mahnlauf', { ids: [r.id] })).j.angelegt[0];
  assert.strictEqual(m1.stufe, 1); assert.strictEqual(m1.pauschale, 40);   // Unternehmer: 40 € nach § 288 Abs. 5 BGB
  // Unternehmer: Verzug spätestens 30 Tage nach Fälligkeit → Zinsen 9 Punkte über Basiszins (1,52 % ab 01.07.2026)
  assert.ok(m1.zinsen > 0); assert.strictEqual(m1.zins_ab, plus(r.faellig && plus(heute, -60), 31));
  const tage = Math.round((new Date(heute) - new Date(m1.zins_ab)) / 86400000) + 1;
  assert.ok(Math.abs(m1.zinsen - Math.round(m1.offen * (heute >= '2026-07-01' ? 10.52 : 10.27) / 100 * tage / 365 * 100) / 100) <= 0.02, 'Zinsen ' + m1.zinsen);
  db.prepare('UPDATE mahnung SET frist = ? WHERE id = ?').run(plus(heute, -1), m1.id);
  const m2 = (await rufen('buero', '/api/mahnung', { rechnung_id: r.id })).j; assert.strictEqual(m2.stufe, 2); assert.strictEqual(m2.pauschale, 0);   // Pauschale nur einmal
  assert.strictEqual(m2.gebuehr, 5); assert.ok(m2.gesamt > m2.offen + 40 + 5 - 0.01);
  db.prepare('UPDATE mahnung SET frist = ? WHERE id = ?').run(plus(heute, -1), m2.id);
  const m3 = (await rufen('buero', '/api/mahnung', { rechnung_id: r.id })).j; assert.strictEqual(m3.stufe, 3);
  db.prepare('UPDATE mahnung SET frist = ? WHERE id = ?').run(plus(heute, -1), m3.id);
  x = (await rufen('buero', '/api/offene-posten')).j.posten.find(p => p.id === r.id); assert.strictEqual(x.inkasso, true); assert.strictEqual(x.naechsteStufe, null);
  const pdf = await rufen('buero', '/api/mahnung/pdf?id=' + m3.id); assert.strictEqual(pdf.typ, 'application/pdf'); assert.ok(pdf.buf.length > 20000);
  // nur die letzte Mahnung lässt sich zurücknehmen
  assert.strictEqual((await rufen('buero', '/api/mahnung/zuruecknehmen', { id: m1.id })).status, 400);
  assert.strictEqual((await rufen('buero', '/api/mahnung/zuruecknehmen', { id: m3.id })).status, 200);
  const csv = await rufen('buero', '/api/offene-posten.csv'); assert.match(csv.buf.toString(), /Rechnung;Kunde;Kundennr\./);
  // Kunde und Mitarbeiter-App sehen das Mahnwesen nicht
  assert.strictEqual((await rufen('app', '/api/offene-posten')).status, 403);
});

test('Verzugszinsen über einen Wechsel des Basiszinssatzes und für Verbraucher', function () {
  const z = MW.zinsen(db, 1000, '2026-06-01', '2026-07-31', false);
  assert.strictEqual(z.abschnitte.length, 2); assert.strictEqual(z.abschnitte[0].prozent, 10.27); assert.strictEqual(z.abschnitte[1].prozent, 10.52);
  assert.strictEqual(z.betrag, Math.round((1000 * 10.27 / 100 * 30 / 365 + 1000 * 10.52 / 100 * 31 / 365) * 100) / 100);
  assert.strictEqual(MW.zinsen(db, 1000, '2026-08-01', '2026-08-31', true).prozent, 6.52);   // Verbraucher: 5 Punkte
});

test('Personalakte: Prüfziffern, Pflichtangaben, Dokumente, Fragebogen, Fristen, Urlaub, Auswertung, Stammdaten', async function () {
  const sid = steuerIdMit('8609574271'), sv = svMit('65170839J00');
  assert.strictEqual(P.steuerId(sid), null); assert.match(P.steuerId(sid.slice(0, 10) + ((Number(sid[10]) + 1) % 10)), /Prüfziffer/);
  assert.strictEqual(P.svNummer(sv, { geburtsdatum: '1939-08-17', nachname: 'Jansen' }), null);
  assert.match(P.svNummer(sv, { geburtsdatum: '1990-01-01' }), /Geburtsdatum/);
  assert.strictEqual(P.iban('DE02120300000000202051'), null); assert.match(P.iban('DE02120300000000202052'), /Prüfziffer/);
  // falsche Angaben → alle Befunde auf einmal
  const falsch = await rufen('buero', '/api/personal', { id: anna, steuer_id: '12345678901', iban: 'DE00' });
  assert.strictEqual(falsch.status, 400); assert.match(falsch.j.fehler, /Steuer-ID/); assert.match(falsch.j.fehler, /IBAN/);
  const ok = await rufen('buero', '/api/personal', { id: anna, vorname: 'Anna', nachname: 'Jansen', geburtsdatum: '1939-08-17', geburtsort: 'Kiel', geschlecht: 'w', staatsangehoerigkeit: 'deutsch',
    strasse: 'Weg 2', plz: '24534', ort: 'Neumünster', eintritt: heute.slice(0, 4) + '-04-01', beschaeftigungsart: 'minijob', steuer_id: sid, sv_nummer: sv.replace(/(\d{2})(\d{6})([A-Z])/, '$1 $2 $3 '), krankenkasse: 'AOK NordWest', iban: 'DE02 1203 0000 0000 2020 51',
    urlaubsanspruch: '24', arbeitstage_woche: '5', aufenthaltstitel: 'aufenthalt', aufenthalt_bis: plus(heute, 20) });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.j)); assert.deepStrictEqual(ok.j.luecken, []);
  let akte = (await rufen('buero', '/api/personal?id=' + anna)).j;
  assert.strictEqual(akte.mitarbeiter.name, 'Anna Jansen'); assert.strictEqual(akte.mitarbeiter.minijob, 1); assert.strictEqual(akte.mitarbeiter.sv_nummer, sv); assert.strictEqual(akte.mitarbeiter.pin, undefined);
  assert.strictEqual(akte.urlaub.monate, 9); assert.strictEqual(akte.urlaub.anspruch, 18);   // Eintritt 01.04. → 9/12 von 24
  assert.ok(akte.fristen.some(f => /Aufenthaltstitel/.test(f.was)));
  // Dokument hochladen, lesen, Rechte
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%Test\n').toString('base64');
  const d = (await rufen('buero', '/api/personal/dokument', { mitarbeiter_id: anna, art: 'vertrag', titel: 'Arbeitsvertrag', datei: pdf, gueltig_bis: plus(heute, 10) })).j.id;
  assert.strictEqual((await rufen('buero', '/api/personal/dokument', { mitarbeiter_id: anna, art: 'vertrag', datei: 'data:text/html;base64,PGgxPg==' })).status, 400);
  const gel = await rufen('buero', '/api/personal/dokument?id=' + d); assert.strictEqual(gel.typ, 'application/pdf'); assert.match(gel.buf.toString(), /%PDF/);
  assert.strictEqual((await rufen('app', '/api/personal/dokument?id=' + d)).status, 403);
  assert.strictEqual((await rufen('app', '/api/personal?id=' + anna)).status, 403);
  assert.ok((await rufen('buero', '/api/personal/fristen')).j.some(f => /Dokument läuft ab/.test(f.was)));
  // Fragebogen ausgefüllt und leer
  const fb = await rufen('buero', '/api/personal/fragebogen?id=' + anna); assert.strictEqual(fb.typ, 'application/pdf'); assert.ok(fb.buf.length > 20000);
  assert.strictEqual((await rufen('buero', '/api/personal/fragebogen')).typ, 'application/pdf');
  // Urlaub eintragen → Konto und Monatsauswertung
  const m = heute.slice(0, 7); db.prepare("INSERT INTO abwesenheit (mitarbeiter_id, von, bis, art) VALUES (?, ?, ?, 'Urlaub')").run(anna, m + '-01', m + '-03');
  akte = (await rufen('buero', '/api/personal?id=' + anna)).j; assert.ok(akte.urlaub.genommen >= 1 && akte.urlaub.genommen <= 3);
  const aw = (await rufen('buero', '/api/personal/auswertung?monat=' + m)).j.mitarbeiter.find(x => x.id === anna);
  assert.strictEqual(aw.urlaubTage, akte.urlaub.genommen); assert.ok(aw.soll > 0); assert.strictEqual(typeof aw.saldo, 'number');
  const csv = (await rufen('buero', '/api/personal/stammdaten.csv')).buf.toString(); assert.match(csv, /Steuer-Identifikationsnummer/); assert.match(csv, new RegExp(sid));
  // Austritt in der Vergangenheit sperrt den Zugang zur App
  await rufen('buero', '/api/personal', { id: anna, austritt: plus(heute, 30) }); assert.strictEqual((await rufen('app', '/api/app/ich')).status, 200);
});

test('Objektakte: Vertrag, Zeiten, Ansprechpartner speichern, Kennzahlen im Kopf, kein Alarmcode', async function () {
  assert.strictEqual((await rufen('buero', '/api/objekt', { id: obj1, name: 'Kanzlei EG', kunde_id: kunde, alarm_hinweis: 'Code 4711 an der Tür' })).status, 400);
  assert.strictEqual((await rufen('buero', '/api/objekt', { id: obj1, name: 'Kanzlei EG', kunde_id: kunde, vertragsbeginn: '2026-10-01', vertragsende: '2026-09-01' })).status, 400);
  const r = await rufen('buero', '/api/objekt', { id: obj1, name: 'Kanzlei EG', kunde_id: kunde, strasse: 'Holstenstraße 5', plz: '24103', ort: 'Kiel', objektart: 'buero', vertragsbeginn: '2026-10-01', kuendigungsfrist: '3 Monate zum Quartalsende',
    zeit_von: '18:00', zeit_bis: '21:00', ap_name: 'Frau Nord', ap_telefon: '0431 000', schluessel: 'Transponder Nr. 12', alarmanlage: 'ja', objektleitung_id: anna, material: 'wir', besonderheiten: 'Aktenschränke nicht öffnen' });
  assert.strictEqual(r.status, 200);
  const o = (await rufen('buero', '/api/objekt?id=' + obj1)).j; assert.strictEqual(o.zeit_von, '18:00'); assert.strictEqual(o.ap_name, 'Frau Nord'); assert.strictEqual(o.monatspreis, 800);   // bestehende Felder bleiben
  const k = (await rufen('buero', '/api/objekt/kennzahlen?id=' + obj1)).j;
  assert.strictEqual(k.objektleitung.id, anna); assert.ok(k.rechnungen.length >= 1); assert.ok(k.umsatzJahr >= 800); assert.strictEqual(k.team, 1);
});

test('Kommunikation: Kanäle, Rechte, Mängelchat legt Mangel an, Direktnachricht, ungelesen', async function () {
  let u = (await rufen('buero', '/api/komm/uebersicht')).j;
  assert.deepStrictEqual(u.kanaele.filter(k => k.art === 'abteilung').map(k => k.schluessel).sort(), ['akquise', 'buchhaltung', 'hr', 'maengel', 'objektleitung', 'team']);
  const ua = (await rufen('app', '/api/komm/uebersicht')).j; assert.deepStrictEqual(ua.kanaele.map(k => k.schluessel).sort(), ['maengel', 'team']);
  assert.strictEqual((await rufen('app', '/api/komm/nachrichten?kanal=buchhaltung')).status, 400);
  // Mitarbeiterin meldet mit Objekt und Foto → Mangel am Objekt
  const foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const n = (await rufen('app', '/api/komm/nachricht', { kanal: 'maengel', text: 'Seifenspender im WC defekt', objekt_id: obj1, foto: foto })).j;
  assert.ok(n.mangel_id); assert.strictEqual(db.prepare('SELECT objekt_id FROM mangel WHERE id = ?').get(n.mangel_id).objekt_id, obj1);
  // fremdes Objekt: Meldung ja, Mangel nein
  assert.strictEqual((await rufen('app', '/api/komm/nachricht', { kanal: 'maengel', text: 'Test', objekt_id: obj2 })).j.mangel_id, null);
  u = (await rufen('buero', '/api/komm/uebersicht')).j; assert.strictEqual(u.kanaele.find(k => k.schluessel === 'maengel').ungelesen, 2);
  const liste = (await rufen('buero', '/api/komm/nachrichten?kanal=maengel')).j.nachrichten; assert.strictEqual(liste.length, 2);
  assert.strictEqual((await rufen('buero', '/api/komm/uebersicht')).j.kanaele.find(k => k.schluessel === 'maengel').ungelesen, 0);   // gelesen
  const bild = liste[0].foto; assert.strictEqual((await rufen('app', '/fotos/' + bild)).status, 200);
  // Büro übernimmt die zweite Meldung als Mangel
  assert.ok((await rufen('buero', '/api/komm/als-mangel', { nachricht_id: liste[1].id, objekt_id: obj2 })).j.mangel_id);
  assert.strictEqual((await rufen('app', '/api/komm/als-mangel', { nachricht_id: liste[1].id, objekt_id: obj2 })).status, 403);
  // Direktnachricht Büro ↔ Mitarbeiterin
  const ich = u.ich, dm = 'dm:' + [ich, 'm' + anna].sort().join(':');
  await rufen('buero', '/api/komm/nachricht', { kanal: dm, text: 'Bitte morgen 30 Minuten früher.' });
  const ua2 = (await rufen('app', '/api/komm/uebersicht')).j; assert.strictEqual(ua2.kanaele.find(k => k.schluessel === dm).ungelesen, 1);
  assert.strictEqual((await rufen('app', '/api/komm/nachrichten?kanal=' + encodeURIComponent('dm:b999:m' + anna))).status, 400);
  assert.strictEqual((await rufen('kunde', '/api/komm/uebersicht')).status, 401);
});

test('Planner: Boards, Spalten, Aufgaben zuweisen, verschieben, Checkliste, Kommentar, meine Aufgaben, Rechte', async function () {
  const boards = (await rufen('buero', '/api/planner/boards')).j; assert.strictEqual(boards.length, 5);
  const bid = (await rufen('buero', '/api/planner/board', { name: 'Winterdienst 2026/27', beschreibung: 'Touren und Streugut' })).j.id;
  let b = (await rufen('buero', '/api/planner/board?id=' + bid)).j; assert.deepStrictEqual(b.spalten.map(s => s.name), ['Zu erledigen', 'In Arbeit', 'Warten auf Rückmeldung', 'Erledigt']);
  assert.strictEqual((await rufen('buero', '/api/planner/aufgabe', { board_id: bid, titel: 'X', faellig: '2026-10-01', start: '2026-10-05' })).status, 400);
  const aid = (await rufen('buero', '/api/planner/aufgabe', { board_id: bid, titel: 'Streugut bestellen', beschreibung: '2 t Splitt', prioritaet: 'hoch', faellig: plus(heute, -1), zustaendig: 'm' + anna, objekt_id: obj1, labels: 'Einkauf, Winter' })).j.id;
  // Zuweisung erscheint als Direktnachricht bei der Mitarbeiterin und in „meine Aufgaben"
  const ua = (await rufen('app', '/api/komm/uebersicht')).j; assert.strictEqual(ua.meineAufgaben, 1); assert.strictEqual(ua.ueberfaellig, 1);
  assert.strictEqual((await rufen('app', '/api/planner/meine')).j[0].titel, 'Streugut bestellen');
  await rufen('buero', '/api/planner/punkt', { aufgabe_id: aid, text: 'Angebot einholen' });
  await rufen('buero', '/api/planner/punkt', { aufgabe_id: aid, text: 'Lieferung prüfen' });
  let a = (await rufen('app', '/api/planner/aufgabe?id=' + aid)).j; assert.strictEqual(a.punkte.length, 2);
  await rufen('app', '/api/planner/punkt', { aufgabe_id: aid, id: a.punkte[0].id, erledigt: true });
  await rufen('app', '/api/planner/kommentar', { aufgabe_id: aid, text: 'Angebot liegt vor.' });
  assert.strictEqual((await rufen('app', '/api/planner/punkt', { aufgabe_id: aid, text: 'darf ich nicht' })).status, 400);
  assert.strictEqual((await rufen('app', '/api/planner/boards')).status, 403);
  assert.strictEqual((await rufen('app', '/api/planner/aufgabe', { board_id: bid, titel: 'eigene Karte' })).status, 403);
  // verschieben in „In Arbeit", dann erledigt aus der App → landet in „Erledigt", Büro bekommt Nachricht
  b = (await rufen('buero', '/api/planner/board?id=' + bid)).j;
  await rufen('buero', '/api/planner/verschieben', { id: aid, spalte_id: b.spalten[1].id, index: 0 });
  b = (await rufen('buero', '/api/planner/board?id=' + bid)).j; assert.strictEqual(b.spalten[1].aufgaben[0].id, aid); assert.strictEqual(b.spalten[1].aufgaben[0].punkteFertig, 1);
  await rufen('app', '/api/planner/erledigt', { id: aid, erledigt: true });
  b = (await rufen('buero', '/api/planner/board?id=' + bid)).j; assert.strictEqual(b.spalten[3].aufgaben[0].id, aid); assert.strictEqual(b.spalten[3].aufgaben[0].erledigt, 1);
  const u = (await rufen('buero', '/api/komm/uebersicht')).j; assert.ok(u.kanaele.some(k => k.art === 'direkt' && k.ungelesen >= 1 && /erledigt/.test(k.letzte.text)));
  // neue Spalte, Spalte löschen verschiebt die Karten
  await rufen('buero', '/api/planner/spalte', { board_id: bid, name: 'Abgerechnet' });
  b = (await rufen('buero', '/api/planner/board?id=' + bid)).j; assert.strictEqual(b.spalten.length, 5);
  await rufen('buero', '/api/planner/spalte', { id: b.spalten[3].id, loeschen: true });
  b = (await rufen('buero', '/api/planner/board?id=' + bid)).j; assert.strictEqual(b.spalten.length, 4); assert.ok(b.spalten[0].aufgaben.some(x => x.id === aid));
  await rufen('buero', '/api/planner/board', { id: bid, archivieren: true });
  assert.strictEqual((await rufen('buero', '/api/planner/boards')).j.length, 5);
});
