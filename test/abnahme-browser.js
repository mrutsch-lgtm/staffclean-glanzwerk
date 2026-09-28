// abnahme-browser.js — Browser-Abnahme: klickt jeden Knopf in Büro, Mitarbeiter-App und Kundenportal
// gegen einen frischen Server mit leerer Datenbank (nur Beispieldaten). Zählt JS-Fehler und unerwartete
// Fehlerantworten der Schnittstelle. Aufruf: node test/abnahme-browser.js [--webkit]  → Bilder in test/abnahme-bilder/
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const PW = process.env.PLAYWRIGHT_PFAD || 'E:/Prozessoptimierung Staffsec/tagesgeschaeft/secplan/studytool/node_modules/playwright';
const { chromium, webkit } = require(PW);

const PORT = 8791, URL0 = 'http://127.0.0.1:' + PORT;
const BILDER = path.join(__dirname, 'abnahme-bilder'); fs.mkdirSync(BILDER, { recursive: true });
const DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-abnahme-'));
const protokoll = [], fehler = []; let erlaubt = 0, schritte = 0;
const ok = t => { schritte++; protokoll.push('✓ ' + t); };
const erwartet = n => { erlaubt += n || 1; };   // die nächsten n Fehlerantworten sind Absicht (Falscheingabe, Geofence …)
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

let letzteSeite = null;
async function beobachten(seite, name) {
  letzteSeite = seite;
  await seite.addInitScript(() => { window.__m = []; new MutationObserver(function () { const x = document.getElementById('meldung'); if (x && x.textContent && x.textContent !== window.__letzte) { window.__letzte = x.textContent; window.__m.push(x.textContent); } }).observe(document, { subtree: true, childList: true, characterData: true }); });
  seite.on('pageerror', e => fehler.push(name + ' JS: ' + e.message));
  seite.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fehler.push(name + ' Konsole: ' + m.text()); });
  seite.on('response', r => { const u = r.url(); if (!u.includes('/api/') || r.status() < 400) return; if (u.endsWith('/api/ich') && r.status() === 401) return; if (erlaubt > 0) { erlaubt--; return; } fehler.push(name + ' API ' + r.status() + ' ' + r.request().method() + ' ' + u.replace(URL0, '')); });
  seite.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Abnahme-Bemerkung' : undefined));
}
async function bild(seite, n) { if (process.env.OHNE_BILDER) return; await seite.waitForTimeout(350); await seite.screenshot({ path: path.join(BILDER, n + '.png'), fullPage: true }); }
async function ruhig(seite) { await seite.waitForLoadState('networkidle').catch(() => {}); await seite.waitForTimeout(250); }
async function klick(seite, sel, text) { await seite.locator(sel).first().click(); await ruhig(seite); ok(text || sel); }
async function meldungIst(seite, muster, text) {
  let t = [];
  for (let i = 0; i < 60; i++) { t = await seite.evaluate(() => window.__m || []); if (t.some(x => muster.test(x))) break; await seite.waitForTimeout(125); }
  const treffer = t.find(x => muster.test(x));
  if (!treffer) throw new Error(text + ': Meldung ' + JSON.stringify(t)); ok(text + ' → „' + treffer.trim() + '"');
  await seite.evaluate(() => { window.__m = []; window.__letzte = ''; const x = document.getElementById('meldung'); if (x) { x.hidden = true; x.textContent = ''; } });
}
async function schublade(seite, felder, knopf) {
  const s = seite.locator('#schublade'); await s.waitFor({ state: 'visible' });
  for (const [n, v] of Object.entries(felder || {})) { const f = s.locator('[name="' + n + '"]'); if (await f.evaluate(e => e.tagName) === 'SELECT') await f.selectOption(String(v)); else await f.fill(String(v)); }
  await s.locator(knopf || '#speichern').click(); await ruhig(seite);
}

async function lvDatei() {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Tabelle1');
  ws.getRow(1).values = ['Leistungsverzeichnis', null, 'Unterhaltsreinigung'];
  ws.getRow(3).values = ['Kunde', 'Abnahmeverwaltung, Prüfweg 3, Neumünster'];
  ws.getRow(6).values = ['Räume', 'Belag', null, 'saugen und feucht wischen', 'Briefkästen abwischen', 'Handlauf abwischen'];
  ws.getRow(7).values = ['Treppenhaus', 'Fliese', null, '1 W', '1 W', '1 W'];
  ws.getRow(8).values = ['Keller', 'Estrich', null, '1 M', null, null];
  ws.getRow(21).values = ['Bei Bedarf: ', 'Spinnweben entfernen'];
  const f = path.join(DATEN, 'lv.xlsx'); await wb.xlsx.writeFile(f); return f;
}
async function wettbewerberDatei() {   // Aufbau „Nr | Räume | Belag | m²", Zwischenzeile, Legende mit eigenen Kürzeln (erfunden)
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Tabelle1');
  ws.getRow(1).values = ['Leistungsverzeichnis Unterhaltsreinigung'];
  ws.getRow(2).values = [null, 'Objekt:', 'WEG Prüfallee 12a, 24534 Neumünster'];
  ws.getRow(4).values = ['Nr', 'Räume', 'Belag', 'm²', 'Boden feucht wischen', 'Glas reinigen'];
  ws.getRow(5).values = [null, 'Erdgeschoss'];
  ws.getRow(6).values = [1, 'Flur', 'Estrich', 4, '1', 'j2'];
  ws.getRow(7).values = [2, 'Büro', 'Teppich', '30,47', 'm2', null];
  ws.getRow(8).values = [null, 'Summe', null, '34,47'];
  ws.getRow(10).values = [null, 'm2 = 14-täglich (gerade Wochen)'];
  ws.getRow(11).values = [null, 'j2 = 2x jährlich'];
  const f = path.join(DATEN, 'lv-wettbewerber.xlsx'); await wb.xlsx.writeFile(f); return f;
}
// Rechnungs-PDF laden und prüfen: Seiten zählen, eingebettete ZUGFeRD-XML herauslösen (null beim Entwurf)
async function pdfPruefen(seite, url, speichernAls) {
  const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
  const antwort = await seite.request.get(URL0 + url); const buf = await antwort.body();
  if (antwort.headers()['content-type'] !== 'application/pdf' || buf.slice(0, 5).toString() !== '%PDF-') throw new Error('kein PDF unter ' + url + ': ' + antwort.status());
  const doc = await PDFDocument.load(buf); let xml = null;
  doc.context.enumerateIndirectObjects().forEach(function ([, o]) { if (o instanceof PDFRawStream && String(o.dict.get(PDFName.of('Type'))) === '/EmbeddedFile') xml = require('zlib').inflateSync(Buffer.from(o.contents)).toString('utf8'); });
  if (speichernAls) fs.writeFileSync(path.join(BILDER, speichernAls), buf);
  return { buf: buf, seiten: doc.getPageCount(), xml: xml, pdfa: buf.includes('pdfaid:part') && buf.includes('GTS_PDFA1') };
}
function pngDatei() { const f = path.join(DATEN, 'foto.png'); fs.writeFileSync(f, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR4nGNkaGBgIAUwkaR6VMOohlENoxqGkgYAO8wBEYy2l4cAAAAASUVORK5CYII=', 'base64')); return f; }

async function buero1(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Büro');
  // Einrichten
  await s.goto(URL0 + '/anmelden'); await s.waitForURL(/einrichten/); ok('/anmelden leitet beim ersten Start auf /einrichten');
  await s.fill('[name=name]', 'Büro Abnahme'); await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.fill('[name=passwort2]', 'Abnahme-2026!');
  await s.click('button[type=submit]'); await s.waitForURL(URL0 + '/'); await ruhig(s); ok('Erstes Büro-Konto angelegt, angemeldet');
  await bild(s, 'b01-uebersicht');
  // Kunden + Portal-Zugang
  await klick(s, '#nav a[data-v=kunden]', 'Kunden öffnen'); await klick(s, '#neuKunde', '+ Kunde');
  await schublade(s, { name: 'Testkunde Abnahme GmbH', ansprechpartner: 'Frau Prüf', email: 'kunde@abnahme.test', ort: 'Kiel' }); await meldungIst(s, /Gespeichert/, 'Kunde speichern');
  const karte = s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' });
  await karte.locator('[data-zugang]').click(); await schublade(s, { name: 'Frau Prüf', email: 'kunde@abnahme.test', passwort: 'Kunde-Abnahme-1' }, '#speichern'); await meldungIst(s, /Zugang angelegt/, 'Portal-Zugang anlegen');
  await karte.locator('[data-sperren]').click(); await ruhig(s); await meldungIst(s, /Geändert/, 'Zugang sperren');
  await s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' }).locator('[data-sperren]').click(); await ruhig(s); await meldungIst(s, /Geändert/, 'Zugang entsperren');
  await s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' }).locator('[data-kunde]').click(); await schublade(s, { telefon: '0431 000' }); await meldungIst(s, /Gespeichert/, 'Kunde bearbeiten');
  await bild(s, 'b02-kunden');
  // Objekt anlegen
  await klick(s, '#nav a[data-v=objekte]', 'Objekte öffnen'); await klick(s, '#neuObjekt', '+ Objekt');
  const kid = await s.locator('#schublade [name=kunde_id] option', { hasText: 'Testkunde' }).getAttribute('value');
  await schublade(s, { name: 'Abnahme-Objekt Kiel', kunde_id: kid, strasse: 'Prüfweg 1', plz: '24103', ort: 'Kiel', bundesland: 'SH', reinigungstag: '2' });
  await s.waitForURL(/#objekt\/\d+/); const oid = s.url().split('/').pop(); ok('Objekt angelegt → Objektseite ' + oid);
  // LV
  await klick(s, '#neuRaum', '+ Raum'); await schublade(s, { name: 'Flur', etage: 'EG', belag: 'PVC', flaeche_m2: '30' }); await meldungIst(s, /Raum gespeichert/, 'Raum Flur');
  await klick(s, '#neuRaum', '+ Raum'); await schublade(s, { name: 'Büro 1', etage: 'EG', belag: 'Teppich', flaeche_m2: '20' }); await meldungIst(s, /Raum gespeichert/, 'Raum Büro 1');
  await s.selectOption('#neuTaet', { index: 1 }); await ruhig(s); await meldungIst(s, /Spalte angelegt/, 'Tätigkeit als Spalte');
  await s.selectOption('#neuTaet', { index: 1 }); await ruhig(s); ok('zweite Tätigkeit als Spalte');
  const zellen = s.locator('.zelle'); const n = await zellen.count(); if (n < 4) throw new Error('LV-Raster hat nur ' + n + ' Zellen');
  await zellen.nth(1).fill('3 W'); await zellen.nth(1).dispatchEvent('change'); await meldungIst(s, /Turnus/, 'Turnus 3 W eintragen');
  await zellen.nth(2).fill('Mo,Do'); await zellen.nth(2).dispatchEvent('change'); await meldungIst(s, /Turnus/, 'Turnus Mo,Do eintragen');
  await zellen.nth(3).fill('1 M'); await zellen.nth(3).dispatchEvent('change'); await meldungIst(s, /Turnus/, 'Turnus 1 M eintragen');
  erwartet(); await zellen.nth(3).fill('quatsch'); await zellen.nth(3).dispatchEvent('change'); await s.waitForTimeout(600);
  if (!(await zellen.nth(3).getAttribute('class')).includes('fehler')) throw new Error('Falscher Turnus wird nicht rot markiert'); ok('Falscher Turnus → Zelle rot, Server lehnt ab');
  await zellen.nth(3).fill(''); await zellen.nth(3).dispatchEvent('change'); await meldungIst(s, /entfernt/, 'Leistung durch Leeren entfernen');
  await s.locator('[data-raum-edit]').first().click(); await schublade(s, { flaeche_m2: '32' }); await meldungIst(s, /Raum gespeichert/, 'Raum bearbeiten');
  await bild(s, 'b03-objekt-lv');
  // Woche
  await klick(s, '[data-reiter=woche]', 'Reiter Woche'); await klick(s, '#wVor', 'Woche vor'); await klick(s, '#wZurueck', 'Woche zurück'); await bild(s, 'b04-objekt-woche');
  // Kalkulation
  await klick(s, '[data-reiter=kalk]', 'Reiter Kalkulation'); await s.fill('[name=gw]', '10'); await klick(s, '#neuRechnen', 'Neu rechnen mit 10 % Gewinn');
  await klick(s, '#preisUebernehmen', 'Monatspreis übernehmen'); await meldungIst(s, /Monatspreis übernommen/, 'Preis übernommen');
  await s.locator('#neuBaustein').waitFor(); await klick(s, '#neuBaustein', '+ Preisbaustein');
  await schublade(s, { bezeichnung: 'Glasreinigung', art: 'je_ausfuehrung', turnus: '1 M', preis: '53.50', einheit: 'Durchgang' }); await meldungIst(s, /Baustein gespeichert/, 'Glasreinigung je Durchgang (1 M)');
  erwartet(); await klick(s, '#neuBaustein', '+ Baustein ohne Turnus'); await schublade(s, { bezeichnung: 'Glas ohne Turnus', art: 'je_ausfuehrung', turnus: '', preis: '10' }); await meldungIst(s, /Turnus/, 'Baustein „je Durchgang" ohne Turnus abgelehnt'); await s.click('#schublade #abbrechen');
  await klick(s, '#neuBaustein', '+ Winterdienst'); await schublade(s, { bezeichnung: 'Winterdienst Zuwegung', art: 'monatlich', monate: '11,12,1,2,3', preis: '90', einheit: 'Monat' }); await meldungIst(s, /Baustein gespeichert/, 'Winterdienst nur Nov–März');
  await klick(s, '#neuBaustein', '+ Baustein zum Entfernen'); await schublade(s, { bezeichnung: 'Probeposten', art: 'einmalig', preis: '1' }); await meldungIst(s, /Baustein gespeichert/, 'Probeposten angelegt');
  await s.locator('tr', { hasText: 'Probeposten' }).locator('[data-bsweg]').click(); await ruhig(s); await meldungIst(s, /Baustein entfernt/, 'Preisbaustein entfernen');
  if (/Probeposten/.test(await s.textContent('#bausteine'))) throw new Error('Baustein nicht entfernt'); ok('Probeposten ist weg');
  await s.locator('[data-bs]').first().click(); await schublade(s, { preis: '53.50' }); await meldungIst(s, /Baustein gespeichert/, 'Baustein ändern');
  erwartet(); await s.fill('[name=zielpreis]', '1'); await klick(s, '#kalibrieren', 'Zielpreis 1 € (zu niedrig)'); await meldungIst(s, /Wegezeit/, 'Zielpreis unter Wegezeit abgelehnt');
  await s.fill('[name=zielpreis]', '236.25'); await klick(s, '#kalibrieren', 'Richtzeiten-Vorschau für 236,25 €');
  if (!/Faktor/.test(await s.textContent('#kalibVorschau'))) throw new Error('Kalibrier-Vorschau fehlt'); ok('Vorschau: Faktor und neue Minuten je Position');
  await klick(s, '#kalibUebernehmen', 'Richtzeiten übernehmen'); await meldungIst(s, /neuer Monatspreis 23[5-7],\d\d/, 'Kalkulation trifft den Zielpreis');
  await bild(s, 'b05-objekt-kalkulation');
  const [angebot] = await Promise.all([ctx.waitForEvent('page'), s.click('a[href^="/drucken/angebot"]')]); await beobachten(angebot, 'Angebot'); await ruhig(angebot);
  await angebot.locator('#weitere h3').waitFor();
  const atext = await angebot.textContent('body'); if (!/Weitere Leistungen[\s\S]*Glasreinigung[\s\S]*Winterdienst/.test(atext)) throw new Error('Angebot ohne Preisbausteine'); ok('Angebot zeigt Glasreinigung und Winterdienst');
  if (!/Monatlich brutto/.test(atext) || /Verrechnungssatz|Lohnkosten|Selbstkosten|Gewinn/.test(atext)) throw new Error('Angebot: Preis fehlt oder interne Zahlen sichtbar'); ok('Angebot druckbar, ohne interne Kalkulation'); await bild(angebot, 'b06-angebot'); await angebot.close();
  // Standort + QR
  await klick(s, '[data-reiter=standort]', 'Reiter Standort & QR'); await s.fill('[name=lat]', '54.3233'); await s.fill('[name=lon]', '10.1228'); await klick(s, '#standortSpeichern', 'Standort speichern'); await meldungIst(s, /Standort gespeichert/, 'Standort gesetzt');
  await klick(s, '#standortSuchen', 'Standort aus Anschrift ermitteln'); await meldungIst(s, /Gefunden: Prüfweg 1/, 'Adresssuche (Testdienst) → Standort gesetzt');
  await klick(s, '[data-reiter=standort]', 'Reiter Standort erneut'); if (!/54,32|54\.32/.test(await s.textContent('#oBereich'))) throw new Error('Standort aus Adresssuche nicht übernommen'); ok('Koordinaten aus der Adresssuche am Objekt');
  await s.fill('[name=lat]', '54.3233'); await s.fill('[name=lon]', '10.1228'); await klick(s, '#standortSpeichern', 'Standort zurücksetzen'); await meldungIst(s, /Standort gespeichert/, 'Standort wieder gesetzt');
  await klick(s, '[data-reiter=standort]', 'Reiter Standort erneut'); const qrOk = await s.locator('img[src^="/api/qr"]').first().evaluate(i => i.complete && i.naturalWidth > 0); if (!qrOk) throw new Error('QR-Bild lädt nicht'); ok('QR-Vorschau lädt');
  const [qr] = await Promise.all([ctx.waitForEvent('page'), s.click('.karte a[href^="/drucken/qr"]')]); await beobachten(qr, 'QR-Druck'); await ruhig(qr); if (await qr.locator('.etikett').count() !== 2) throw new Error('QR-Druck: falsche Anzahl Etiketten'); ok('QR-Aufkleber: 2 Etiketten'); await bild(qr, 'b07-qr-druck'); await qr.close();
  // Team, Mangel, Prüfung
  await klick(s, '[data-reiter=team]', 'Reiter Team'); await s.locator('[data-ma]').first().check(); await meldungIst(s, /Stammteam/, 'Stammteam aufnehmen');
  await klick(s, '#neuMangel', '+ Mangel'); await schublade(s, { text: 'Fleck im Flur (Abnahme)' }, '#speichern'); await meldungIst(s, /Mangel erfasst/, 'Mangel erfassen');
  await klick(s, '[data-reiter=team]', 'Reiter Team erneut'); await klick(s, '#neuPruefung', 'Prüfung starten'); await s.waitForURL(/#pruefung\//);
  const okKnoepfe = s.locator('.bewertung button.ok'); const k = await okKnoepfe.count(); for (let i = 0; i < k; i++) { await okKnoepfe.nth(i).click(); await s.waitForTimeout(60); } ok(k + ' Prüfelemente „in Ordnung"');
  await s.locator('.bewertung button.nok').first().click(); await ruhig(s); ok('ein Element „Mangel"');
  await s.click('#abschliessen'); await meldungIst(s, /Ergebnis .* Mängel/, 'Prüfung abschließen'); await ruhig(s); await bild(s, 'b08-pruefung');
  const [pb] = await Promise.all([ctx.waitForEvent('page'), s.click('a[href^="/drucken/pruefung"]')]); await beobachten(pb, 'Prüfbericht'); await ruhig(pb); if (!/%/.test(await pb.textContent('#kopfzahlen'))) throw new Error('Prüfbericht ohne Ergebnis'); ok('Prüfbericht druckbar'); await pb.close();
  // Objekt: bearbeiten, ruhen/aktiv
  await s.goto(URL0 + '/#objekt/' + oid); await ruhig(s); await klick(s, '#bearbeiten', 'Objekt bearbeiten'); await schublade(s, { zugang: 'Schlüssel beim Hausmeister' }); await meldungIst(s, /Objekt gespeichert/, 'Objekt speichern');
  await klick(s, '#ruhen', 'Objekt ruhen lassen'); await klick(s, '#ruhen', 'Objekt wieder aktiv');
  // Dienstplan
  await klick(s, '#nav a[data-v=dienstplan]', 'Dienstplan öffnen'); await bild(s, 'b09-dienstplan');
  await klick(s, '#neuSchicht', '+ Schicht');
  const anna = await s.locator('#schublade [name=mitarbeiter_id] option', { hasText: 'Anna' }).getAttribute('value');
  await s.locator('#schublade .wt[value="6"]').check();
  await schublade(s, { mitarbeiter_id: anna, objekt_id: oid, datum: plus(1), beginn: '17:00', ende: '19:00', pause_min: '0', wiederholen_bis: plus(20) }, '#speichern'); await meldungIst(s, /Schicht/, 'Schichtserie (nur Samstag) anlegen');
  await klick(s, '#pHeute', 'Diese Woche'); await s.locator('td[data-neu]').nth(3).click(); await s.locator('#schublade').waitFor(); await s.click('#schublade #abbrechen'); ok('Leere Zelle → Formular → Abbrechen');
  await s.locator('td[data-neu]').nth(10).click(); await schublade(s, { objekt_id: oid, beginn: '05:00', ende: '16:30', pause_min: '0' }, '#speichern'); await meldungIst(s, /Schicht gespeichert/, 'Schicht per Zellklick (lang, ohne Pause)');
  const konflikt = await s.locator('.chip.konflikt').count(); if (!konflikt) throw new Error('Konflikt (über 10 Std./ohne Pause) wird nicht angezeigt'); ok(konflikt + ' Konflikt-Schicht(en) rot markiert');
  await bild(s, 'b10-dienstplan-konflikt');
  await s.locator('.chip.konflikt').first().click(); await s.locator('#schublade #loeschen').click(); await ruhig(s); await meldungIst(s, /gelöscht/, 'Schicht löschen');
  await s.locator('[data-schicht]').first().click(); await schublade(s, { notiz: 'bitte Schlüssel holen' }, '#speichern'); await meldungIst(s, /Schicht gespeichert/, 'Schicht bearbeiten');
  for (let i = 0; i < 4; i++) await klick(s, '#pVor', 'Woche vor ' + (i + 1));
  await klick(s, '#kopieren', 'Vorwoche übernehmen'); await meldungIst(s, /übernommen/, 'Vorwoche kopiert');
  await klick(s, '#pZurueck', 'Woche zurück');
  // Tagesplan
  await klick(s, '#nav a[data-v=tagesplan]', 'Tagesplan öffnen');
  if (await s.locator('[data-nachtragen]').count()) { await klick(s, '[data-nachtragen]', 'als erledigt nachtragen'); await meldungIst(s, /Nachgetragen/, 'Nachtragen'); await klick(s, '[data-zurueck]', 'zurücknehmen'); await meldungIst(s, /Zurückgenommen/, 'Zurücknehmen'); }
  await klick(s, '#tVor', 'Tag vor'); await klick(s, '#tZurueck', 'Tag zurück'); await s.fill('#tDatum', plus(3)); await s.dispatchEvent('#tDatum', 'change'); await ruhig(s); ok('Datum wählen'); await klick(s, '#tHeute', 'Heute'); await bild(s, 'b11-tagesplan');
  // Import
  await s.goto(URL0 + '/#import'); await ruhig(s); await s.setInputFiles('#datei', await lvDatei()); await s.locator('#uebernehmen').waitFor(); ok('Excel-LV: Vorschau'); await bild(s, 'b12-import');
  await s.click('#uebernehmen'); await s.waitForURL(/#objekt\/\d+/); await ruhig(s); ok('Excel-LV übernommen → Objekt ' + s.url().split('/').pop());
  await s.goto(URL0 + '/#import'); await ruhig(s); await s.setInputFiles('#datei', await wettbewerberDatei()); await s.locator('#uebernehmen').waitFor();
  const vt = await s.textContent('#vorschau');
  if (!/Prüfallee 12a/.test(vt) || !/Kürzel „m2" laut Legende als „14T"/.test(vt) || !/als Raumfläche übernommen/.test(vt) || /Erdgeschoss<|Summe/.test(await s.innerHTML('#vorschau table'))) throw new Error('Wettbewerber-LV falsch gelesen: ' + vt.slice(0, 300));
  ok('Wettbewerber-LV: Räume in Spalte 2, m² als Fläche, Legende übersetzt m2 → 14T'); await bild(s, 'b12b-import-wettbewerber');
  await s.click('#uebernehmen'); await s.waitForURL(/#objekt\/\d+/); await ruhig(s);
  const rt = await s.textContent('#inhalt'); if (!/30,47 m²/.test(rt)) throw new Error('Fläche nicht am Raum: ' + rt.slice(0, 400)); ok('Fläche 30,47 m² am Raum');
  await s.locator('[data-raum-edit]').first().click(); await schublade(s, { anzahl: '3' }); await meldungIst(s, /Raum gespeichert/, 'Anzahl 3 Etagen am Raum');
  if (!/× 3/.test(await s.textContent('#inhalt'))) throw new Error('Anzahl nicht im Raster'); ok('Raster zeigt „× 3"');
  await klick(s, '[data-reiter=kalk]', 'Kalkulation mit Anzahl'); if (!/ × 3/.test(await s.textContent('#inhalt'))) throw new Error('Kalkulation ohne Anzahl'); ok('Kalkulation rechnet mit „× 3"');
  // Einsatz
  await klick(s, '#nav a[data-v=einsatz]', 'Einsatz öffnen'); await klick(s, '#neuAbw', '+ Abwesenheit');
  const piotr = await s.locator('#schublade [name=mitarbeiter_id] option', { hasText: 'Piotr' }).getAttribute('value');
  await schublade(s, { mitarbeiter_id: piotr, art: 'Urlaub', von: plus(5), bis: plus(9) }, '#speichern'); await meldungIst(s, /eingetragen/, 'Abwesenheit eintragen');
  await klick(s, '[data-vertretung]', 'Vertretung anfragen'); await s.locator('#schublade [data-anfragen]').first().click(); await ruhig(s); await meldungIst(s, /Anfrage gesendet/, 'Vertretungsanfrage senden');
  await bild(s, 'b13-einsatz');
  await klick(s, '[data-abw-weg]', 'Abwesenheit entfernen'); await meldungIst(s, /Entfernt/, 'Abwesenheit entfernt');
  // Qualität
  await klick(s, '#nav a[data-v=qualitaet]', 'Qualität öffnen'); await klick(s, '[data-pr]', 'Prüfung aus Liste öffnen'); await s.goto(URL0 + '/#qualitaet'); await ruhig(s);
  await klick(s, '#qStart', 'Prüfung starten (Demo-Objekt)'); await s.waitForURL(/#pruefung\//); await bild(s, 'b14-qualitaet');
  // Mitarbeiter
  await klick(s, '#nav a[data-v=mitarbeiter]', 'Mitarbeiter öffnen'); await klick(s, '#neuMa', '+ Mitarbeiter');
  await schublade(s, { name: 'Test Kraft', personalnummer: '1003', sprache: 'ro', minijob: '1', pin: '4321' }, '#speichern'); await meldungIst(s, /Gespeichert/, 'Mitarbeiter mit PIN anlegen');
  erwartet(); await klick(s, '[data-ma]', 'Mitarbeiter bearbeiten'); await schublade(s, { pin: '12' }, '#speichern'); await meldungIst(s, /4 bis 8/, 'zu kurze PIN wird abgelehnt'); await s.click('#schublade #abbrechen');
  await bild(s, 'b15-mitarbeiter');
  // Stammdaten
  await klick(s, '#nav a[data-v=stammdaten]', 'Stammdaten öffnen');
  await klick(s, '#katalog', 'Standardkatalog übernehmen'); await meldungIst(s, /Katalog: \d+ neu/, 'Standardkatalog geladen');
  if (!/Glasreinigung inkl\. Rahmen/.test(await s.textContent('#sBereich'))) throw new Error('Katalog nicht in der Liste'); ok('Katalog-Tätigkeiten mit Beschreibung sichtbar');
  await klick(s, '[data-t]', 'Tätigkeit bearbeiten');
  await s.locator('#schublade').waitFor({ state: 'visible' }); await s.fill('#schublade [data-u=ro][data-f=name]', 'Aspirare și spălare'); await schublade(s, { minuten: '7' }, '#speichern'); await meldungIst(s, /Gespeichert/, 'Tätigkeit + Übersetzung speichern');
  await klick(s, '#neuT', '+ Tätigkeit'); await schublade(s, { name: 'Fenster innen reinigen', kategorie: 'Glas', minuten: '10' }, '#speichern'); await meldungIst(s, /Gespeichert/, 'neue Tätigkeit');
  await klick(s, '[data-reiter=tarife]', 'Reiter Tarife'); await klick(s, '#neuTarif', '+ Tarif'); await schublade(s, { lohngruppe: 'LG 1', stundenlohn: '15.50', gueltig_ab: '2027-01-01' }, '#speichern'); await meldungIst(s, /Tarif eingetragen/, 'Tarif eintragen');
  await klick(s, '[data-reiter=einstellungen]', 'Reiter Einstellungen'); await s.fill('[name=datev_berater_nr]', '12345'); await s.fill('[name=datev_mandant_nr]', '678'); await klick(s, '#eSpeichern', 'Einstellungen speichern'); await meldungIst(s, /gespeichert/, 'Einstellungen');
  await klick(s, '[data-reiter=zugaenge]', 'Reiter Büro-Zugänge'); await klick(s, '#neuBuero', '+ Büro-Zugang'); await schublade(s, { name: 'Zweites Büro', email: 'zwei@abnahme.test', passwort: 'Zweites-Buero-1' }, '#speichern'); await meldungIst(s, /Zugang angelegt/, 'Büro-Zugang anlegen');
  await s.locator('tr', { hasText: 'zwei@abnahme.test' }).locator('[data-pw]').click(); await schublade(s, { passwort: 'Neues-Passwort-9' }, '#speichern'); await meldungIst(s, /Passwort geändert/, 'Passwort ändern');
  await s.locator('tr', { hasText: 'zwei@abnahme.test' }).locator('[data-sp]').click(); await ruhig(s); await meldungIst(s, /Geändert/, 'Büro-Zugang sperren');
  erwartet(); await s.locator('tr', { hasText: 'buero@abnahme.test' }).locator('[data-sp]').click(); await ruhig(s); await meldungIst(s, /eigene Konto/, 'eigenes Konto nicht sperrbar');
  await bild(s, 'b16-stammdaten');
  await ctx.close();
  return oid;
}

async function app(b, mobil) {
  const ctx = await b.newContext(Object.assign({ serviceWorkers: process.env.OHNE_SW ? 'block' : 'allow', viewport: { width: 390, height: 844 }, hasTouch: true, geolocation: { latitude: 54.0737, longitude: 9.9848 }, permissions: ['geolocation'] }, mobil ? { isMobile: true, deviceScaleFactor: 2 } : {}));
  const s = await ctx.newPage(); await beobachten(s, 'App');
  await s.goto(URL0 + '/app'); await ruhig(s); await bild(s, 'a01-wer');
  await klick(s, '.kachel:has-text("Anna")', 'Anna wählen');
  erwartet(); for (const z of ['9', '9', '9', '9', '✓']) await s.click('[data-z="' + z + '"]'); await s.waitForTimeout(500);
  if (!/PIN/.test(await s.textContent('#pinFehler'))) throw new Error('falsche PIN ohne Hinweis'); ok('falsche PIN → Hinweis'); await bild(s, 'a02-pin');
  for (const z of ['1', '1', '1', '⌫', '1', '1', '✓']) await s.click('[data-z="' + z + '"]'); await ruhig(s); await s.locator('.app-gruss').waitFor(); ok('PIN 1111 → angemeldet (mit Löschtaste)');
  await bild(s, 'a03-heute');
  if (await s.locator('[data-bestaetigen]').count()) { await klick(s, '[data-bestaetigen]', 'Schicht bestätigen'); }
  await klick(s, '[data-o]:has-text("Bürohaus")', 'Objekt Bürohaus öffnen'); await klick(s, '#stempeln', 'Kommen stempeln'); await meldungIst(s, /Kommen/, 'Kommen am Objekt (Geofence ok)');
  await bild(s, 'a04-objekt');
  await klick(s, '#scan', 'Raum-Code scannen'); await s.fill('#codeText', 'DEMO-5'); await klick(s, '#codeLos', 'Code eintippen (ohne Kamera)');
  if (!/Vor Ort per Code/.test(await s.textContent('#app'))) throw new Error('Raum per Code nicht geöffnet'); ok('Raum per Code geöffnet, „QR ✓"');
  await klick(s, '[data-i="0"]', 'Aufgabe abhaken'); if (!(await s.locator('.aufgabe').first().getAttribute('class')).includes('fertig')) throw new Error('Häkchen nicht gesetzt'); ok('Häkchen gesetzt');
  await klick(s, '[data-i="0"]', 'Häkchen zurücknehmen'); await klick(s, '[data-i="0"]', 'wieder abhaken');
  const [wahl] = await Promise.all([s.waitForEvent('filechooser'), s.click('[data-foto="1"]')]); await wahl.setFiles(pngDatei()); await meldungIst(s, /Foto/, 'Aufgabe mit Foto erledigt');
  await bild(s, 'a05-raum');
  await klick(s, '#mangel', 'Mangel melden'); await s.fill('#mtext', 'Seifenspender defekt (Abnahme)'); const [w2] = await Promise.all([s.waitForEvent('filechooser'), s.click('#mfoto')]); await w2.setFiles(pngDatei()); await s.waitForTimeout(300);
  await klick(s, '#msenden', 'Mangel senden'); await meldungIst(s, /Mangel ist gemeldet/, 'Mangel gemeldet');
  await klick(s, '#zurueck', 'zurück zum Objekt'); await s.fill('#pause', '0'); await klick(s, '#stempeln', 'Gehen stempeln'); await meldungIst(s, /Gehen/, 'Gehen gestempelt');
  // Geofence: weit weg → abgelehnt
  await ctx.setGeolocation({ latitude: 53.55, longitude: 10.0 }); erwartet(); await klick(s, '#stempeln', 'Kommen weit weg'); await meldungIst(s, /entfernt/, 'Geofence lehnt 50 km Entfernung ab');
  await ctx.setGeolocation({ latitude: 54.0737, longitude: 9.9848 });
  await klick(s, '#zurueck', 'zurück zu Heute'); await klick(s, '#abmelden', 'Abmelden');
  // Piotr: polnisch, Vertretungsanfrage beantworten
  await klick(s, '.kachel:has-text("Piotr")', 'Piotr wählen'); for (const z of ['2', '2', '2', '2', '✓']) await s.click('[data-z="' + z + '"]'); await ruhig(s); await s.locator('.app-gruss').waitFor();
  if (!/Cześć/.test(await s.textContent('.app-gruss'))) throw new Error('App nicht auf Polnisch'); ok('Piotr sieht die App auf Polnisch');
  if (!(await s.locator('[data-antwort=ja]').count())) throw new Error('Vertretungsanfrage fehlt in der App'); await bild(s, 'a06-vertretung');
  await klick(s, '[data-antwort=ja]', 'Vertretung zusagen'); if (!(await s.locator('[data-o]').count())) throw new Error('Nach Zusage kein Objekt sichtbar'); ok('nach Zusage: Objekt in „Heute"');
  await klick(s, '#abmelden', 'Piotr abmelden');
  await ctx.close();
}

async function kunde(b, oid) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } }); const s = await ctx.newPage(); await beobachten(s, 'Kunde');
  await s.goto(URL0 + '/anmelden'); erwartet(); await s.fill('[name=email]', 'kunde@abnahme.test'); await s.fill('[name=passwort]', 'falsch-falsch'); await s.click('#los'); await s.waitForTimeout(500);
  if (!/stimmt nicht/.test(await s.textContent('#fehler'))) throw new Error('falsches Passwort ohne Hinweis'); ok('falsches Passwort → Hinweis');
  await s.fill('[name=passwort]', 'Kunde-Abnahme-1'); await s.click('#los'); await s.waitForURL(/\/kunde/); await ruhig(s); ok('Kunde angemeldet → /kunde'); await bild(s, 'k01-uebersicht');
  const r = await s.request.get(URL0 + '/api/objekte'); if (r.status() !== 403) throw new Error('Kunde erreicht Büro-Schnittstelle: ' + r.status()); ok('Kunde kommt nicht an die Büro-Schnittstelle (403)');
  const r2 = await s.request.get(URL0 + '/api/kunde/objekt?id=1'); if (r2.status() !== 403) throw new Error('Kunde sieht fremdes Objekt: ' + r2.status()); ok('Kunde sieht fremdes Objekt nicht (403)');
  await klick(s, '[data-o]', 'Objekt öffnen'); await bild(s, 'k02-objekt');
  await klick(s, '[data-abzeichnen]', 'Prüfbericht abzeichnen'); await meldungIst(s, /Abgezeichnet/, 'Abgezeichnet');
  await klick(s, 'a[href^="#bericht/"]', 'Bericht ansehen'); await bild(s, 'k03-bericht');
  await s.goto(URL0 + '/kunde#objekt/' + oid); await ruhig(s); await klick(s, '#reklamieren', 'Reklamation öffnen'); await s.fill('#rtext', 'Mülleimer nicht geleert (Abnahme)');
  const [w] = await Promise.all([s.waitForEvent('filechooser'), s.click('#rfoto')]); await w.setFiles(pngDatei()); await s.waitForTimeout(300); await klick(s, '#rsenden', 'Reklamation senden'); await meldungIst(s, /Reklamation ist bei uns eingegangen/, 'Reklamation gemeldet');
  await klick(s, '#anfragen', 'Sonderleistung anfragen'); await s.fill('#atext', 'Grundreinigung Flur nach Umbau (Abnahme)'); await s.fill('#adatum', plus(2));
  await klick(s, '#asenden', 'Anfrage senden'); await meldungIst(s, /Anfrage ist bei uns eingegangen/, 'Anfrage gesendet');
  if (!/Grundreinigung Flur[\s\S]*angefragt/.test(await s.textContent('#inhalt'))) throw new Error('Anfrage nicht in „Ihre Anfragen"'); ok('Anfrage steht mit Status „angefragt" im Portal');
  await klick(s, '#nav a[data-v=rechnungen]', 'Rechnungen (noch leer)'); if (!/Noch keine Rechnungen/.test(await s.textContent('#inhalt'))) throw new Error('Rechnungsliste nicht leer'); ok('noch keine Rechnung sichtbar');
  await klick(s, '#abmelden', 'Kunde abmelden'); await s.waitForURL(/anmelden/); ok('abgemeldet → /anmelden');
  await ctx.close();
}

async function abrechnen(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Abrechnung');
  await s.goto(URL0 + '/anmelden'); await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.click('#los'); await s.waitForURL(URL0 + '/'); await ruhig(s);
  // Anfrage aus dem Portal bestätigen, einplanen, erledigen
  await klick(s, '#nav a[data-v=abrechnung]', 'Abrechnung öffnen'); await klick(s, '[data-reiter=auftraege]', 'Reiter Sonderleistungen');
  const karte = () => s.locator('.karte', { hasText: 'Grundreinigung Flur' });
  if (!/vom Kunden/.test(await karte().textContent())) throw new Error('Kundenanfrage fehlt im Büro'); ok('Kundenanfrage im Büro angekommen');
  await karte().locator('[data-best]').click(); const anna = await s.locator('#schublade [name=mitarbeiter_id] option', { hasText: 'Anna' }).getAttribute('value');
  await schublade(s, { antwort: 'Gern, wir kommen.', mitarbeiter_id: anna, beginn: '12:00', ende: '14:00' }, '#speichern'); await meldungIst(s, /Bestätigt und im Dienstplan eingeplant/, 'Anfrage bestätigt + als Schicht eingeplant');
  erwartet(); await karte().locator('[data-erl]').click(); await schublade(s, { stunden: '', festpreis: '' }, '#speichern'); await meldungIst(s, /Stunden oder Festpreis/, 'Erledigt ohne Stunden abgelehnt'); await s.click('#schublade #abbrechen');
  await karte().locator('[data-erl]').click(); await schublade(s, { stunden: '2' }, '#speichern'); await meldungIst(s, /nächste Rechnung/, 'Sonderleistung erledigt (2 Std.)');
  await klick(s, '#neuAuftrag', '+ eigene Sonderleistung'); await schublade(s, { text: 'Fensterbänke Keller (Abnahme)', festpreis: '40' }, '#speichern'); await meldungIst(s, /angelegt/, 'Sonderleistung mit Festpreis angelegt');
  await s.locator('.karte', { hasText: 'Fensterbänke Keller' }).locator('[data-erl]').click(); await schublade(s, {}, '#speichern'); await meldungIst(s, /nächste Rechnung/, 'Festpreis-Leistung erledigt');
  await bild(s, 'b22-sonderleistungen');
  // Stundensatz fehlt noch → Hinweis beim Erzeugen; danach eintragen
  await klick(s, '#nav a[data-v=stammdaten]', 'Stammdaten'); await klick(s, '[data-reiter=einstellungen]', 'Einstellungen'); await s.fill('[name=stundensatz_abruf]', '35'); await klick(s, '#eSpeichern', 'Stundensatz 35 € speichern'); await meldungIst(s, /gespeichert/, 'Stundensatz gespeichert');
  // Entwürfe für den laufenden Monat
  await klick(s, '#nav a[data-v=abrechnung]', 'Abrechnung'); await klick(s, '[data-reiter=rechnungen]', 'Reiter Rechnungen'); await s.fill('#abMonat', plus(0).slice(0, 7)); await klick(s, '#abErzeugen', 'Entwürfe erzeugen');
  await meldungIst(s, /Entwürfe angelegt/, 'Entwürfe erzeugt'); if (await s.locator('#schublade').isVisible()) { ok('Übersprungene Objekte mit Grund angezeigt'); await s.click('#schublade #abbrechen'); }
  await s.locator('tr[data-re]', { hasText: 'Abnahme-Objekt Kiel' }).first().click(); await s.waitForURL(/#rechnung\//); await ruhig(s);
  let t = await s.textContent('#inhalt');
  if (!/Unterhaltsreinigung laut Leistungsverzeichnis/.test(t) || !/Glasreinigung/.test(t) || !/Grundreinigung Flur/.test(t) || !/Fensterbänke Keller/.test(t)) throw new Error('Entwurf unvollständig: ' + t.slice(0, 300)); ok('Entwurf: Pauschale + Glas (1 M) + Sonderleistung nach Stunden + Festpreis');
  if (/Winterdienst/.test(t) !== [11, 12, 1, 2, 3].includes(new Date().getMonth() + 1)) throw new Error('Winterdienst-Saison falsch angewendet'); ok('Winterdienst nur in der Saison');
  if (!/Pflichtangaben/.test(t)) throw new Error('Pflichtangaben-Warnung fehlt'); ok('Warnung: Pflichtangaben fehlen');
  await bild(s, 'b23-rechnung-entwurf');
  await klick(s, '#rePos', '+ Position'); await schublade(s, { bezeichnung: 'Anfahrt Sonderleistung', menge: '1', einheit: 'pauschal', einzelpreis: '15' }, '#speichern'); await meldungIst(s, /Position gespeichert/, 'Position hinzufügen');
  await s.locator('tr', { hasText: 'Anfahrt Sonderleistung' }).locator('[data-pos]').click(); await schublade(s, { einzelpreis: '12.5' }, '#speichern'); await meldungIst(s, /Position gespeichert/, 'Position ändern');
  if (!/12,50/.test(await s.textContent('#inhalt'))) throw new Error('Geänderter Preis nicht übernommen'); ok('geänderter Preis sichtbar');
  await s.locator('tr', { hasText: 'Anfahrt Sonderleistung' }).locator('[data-posweg]').click(); await ruhig(s); await meldungIst(s, /entfernt/, 'Position entfernen');
  erwartet(); await klick(s, '#reStellen', 'Stellen ohne Pflichtangaben'); await meldungIst(s, /Pflichtangaben fehlen/, 'Stellen ohne Pflichtangaben blockiert');
  // Pflichtangaben nachtragen: eigene Firma + Kundenanschrift
  const rurl = s.url();
  await klick(s, '#nav a[data-v=stammdaten]', 'Stammdaten'); await klick(s, '[data-reiter=einstellungen]', 'Einstellungen');
  for (const [n, v] of [['firma_strasse', 'Prüfstraße 2'], ['firma_plz', '24534'], ['firma_ort', 'Neumünster'], ['firma_email', 'rechnung@abnahme.test'], ['steuernummer', '00/000/00000'], ['iban', 'DE02 1203 0000 0000 2020 51'], ['bank', 'Abnahmebank'], ['geschaeftsfuehrung', 'Test Geschäftsführung']]) await s.fill('[name=' + n + ']', v);
  await klick(s, '#eSpeichern', 'Rechnungsangaben speichern'); await meldungIst(s, /gespeichert/, 'Firmenangaben gespeichert');
  await klick(s, '#nav a[data-v=kunden]', 'Kunden'); await s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' }).locator('[data-kunde]').click();
  await schublade(s, { anschrift: 'Kundenweg 5', plz: '24103', kundennummer: 'K-1001', leitweg_id: '', rechnungsformat: 'zugferd', zahlungsziel_tage: '21' }); await meldungIst(s, /Gespeichert/, 'Kundenanschrift + Kundennummer');
  await s.goto(rurl); await ruhig(s); if (/Pflichtangaben/.test(await s.textContent('#inhalt'))) throw new Error('Pflichtangaben-Warnung bleibt'); ok('Pflichtangaben vollständig');
  const vorschau = await pdfPruefen(s, await s.getAttribute('#rePdf', 'href'), 'b23b-rechnung-entwurf.pdf');
  if (vorschau.xml) throw new Error('Entwurf enthält schon ZUGFeRD-Daten'); ok('PDF-Vorschau des Entwurfs (' + vorschau.seiten + ' Seite/n), ohne ZUGFeRD-Daten');
  await klick(s, '#reStellen', 'Rechnung stellen'); await meldungIst(s, /Gestellt: RE-\d{4}-0001/, 'Rechnung gestellt');
  if (await s.locator('#rePos').count()) throw new Error('Gestellte Rechnung noch änderbar'); ok('gestellte Rechnung ohne Bearbeiten-Knöpfe');
  const pr = await pdfPruefen(s, await s.getAttribute('#rePdf', 'href'), 'b24-rechnung.pdf');
  if (!pr.xml || !pr.pdfa) throw new Error('Gestellte Rechnung ohne ZUGFeRD/PDF-A-Merkmale');
  for (const muss of ['<ram:ID>RE-', 'Kundenweg 5', 'Prüfstraße 2', 'schemeID="FC">00/000/00000', 'DE02120300000000202051', 'BillingSpecifiedPeriod', '<ram:BuyerReference>K-1001', '<ram:GrandTotalAmount>', '<ram:DueDateDateTime><udt:DateTimeString format="102">' + plus(21).replace(/-/g, '')]) if (!pr.xml.includes(muss)) throw new Error('ZUGFeRD ohne „' + muss + '"');
  if (/Lohnnebenkosten|Gemeinkosten|Gewinn|Verrechnungssatz/.test(pr.xml)) throw new Error('Interne Kalkulationswerte in der Rechnung'); ok('PDF (' + pr.seiten + ' Seite/n) mit eingebetteter ZUGFeRD-XML: alle Pflichtangaben, keine internen Werte');
  const [pl] = await Promise.all([s.waitForEvent('download'), s.click('#rePdfLaden')]); if (!/^Rechnung_RE-\d{4}-0001\.pdf$/.test(pl.suggestedFilename())) throw new Error('PDF-Dateiname ' + pl.suggestedFilename()); ok('PDF herunterladen: ' + pl.suggestedFilename());
  const [xml] = await Promise.all([s.waitForEvent('download'), s.click('a[href^="/api/rechnung/xrechnung"]')]); const xp = path.join(DATEN, 'x.xml'); await xml.saveAs(xp); const xt = fs.readFileSync(xp, 'utf8');
  if (!/xrechnung_3\.0/.test(xt) || !/<cbc:BuyerReference>K-1001</.test(xt) || !/<cbc:PayableAmount currencyID="EUR">\d+\.\d\d</.test(xt)) throw new Error('XRechnung unvollständig'); ok('XRechnung heruntergeladen (' + xml.suggestedFilename() + ')');
  await klick(s, '#reBezahlt', 'Als bezahlt markieren'); await meldungIst(s, /bezahlt/, 'bezahlt'); await klick(s, '#reOffen', 'Wieder offen'); await meldungIst(s, /Wieder offen/, 'wieder offen');
  await klick(s, '#reStorno', 'Stornieren'); await meldungIst(s, /Stornorechnung RE-\d{4}-0002/, 'Storno mit eigener Nummer'); await bild(s, 'b25-storno');
  await klick(s, 'a[href="#abrechnung"]', 'Alle Rechnungen'); const lt = await s.textContent('#inhalt');
  if (!/storniert/.test(lt) || !/Storno/.test(lt)) throw new Error('Liste zeigt Storno nicht'); ok('Liste: Original storniert + Stornorechnung');
  // Nach dem Storno sind die Sonderleistungen wieder abrechenbar → neuer Entwurf, stellen
  await s.fill('#abMonat', plus(0).slice(0, 7)); await s.check('#abStellen'); await klick(s, '#abErzeugen', 'Abrechnungslauf mit „gleich stellen"'); await meldungIst(s, /Entwürfe angelegt, 1 gestellt/, 'Lauf legt an und stellt'); if (await s.locator('#schublade').isVisible()) await s.click('#schublade #abbrechen');
  await s.locator('tr[data-re]', { hasText: 'RE-' }).filter({ hasText: 'Abnahme-Objekt Kiel' }).filter({ hasText: '0003' }).first().click(); await s.waitForURL(/#rechnung\//); await ruhig(s);
  if (!/Grundreinigung Flur/.test(await s.textContent('#inhalt'))) throw new Error('Sonderleistung nach Storno nicht wieder abgerechnet'); ok('nach Storno: Sonderleistung in RE-…-0003, direkt gestellt');
  // Entwurf löschen: Entwurf für den Vormonat anlegen und wieder verwerfen
  await klick(s, 'a[href="#abrechnung"]', 'Alle Rechnungen'); await klick(s, '[data-reiter=rechnungen]', 'Reiter Rechnungen');
  const vm = new Date(); vm.setDate(1); vm.setMonth(vm.getMonth() - 1); await s.fill('#abMonat', vm.toISOString().slice(0, 7));
  await klick(s, '#abErzeugen', 'Entwürfe für den Vormonat'); await meldungIst(s, /Entwürfe angelegt/, 'Vormonats-Entwurf'); if (await s.locator('#schublade').isVisible()) await s.click('#schublade #abbrechen');
  await s.locator('tr[data-re]', { hasText: 'Entwurf' }).filter({ hasText: 'Abnahme-Objekt Kiel' }).first().click(); await s.waitForURL(/#rechnung\//); await ruhig(s);
  await klick(s, '#reLoeschen', 'Entwurf löschen'); await meldungIst(s, /Entwurf gelöscht/, 'Entwurf gelöscht'); await s.waitForURL(/#abrechnung$/);
  if (await s.locator('tr[data-re]', { hasText: 'Entwurf' }).filter({ hasText: 'Abnahme-Objekt Kiel' }).count()) throw new Error('Entwurf noch in der Liste'); ok('Entwurf ist aus der Liste verschwunden, Nummernkreis unberührt');
  // Automatik einstellen, Protokoll der Läufe ansehen
  await klick(s, '[data-reiter=automatik]', 'Reiter Automatik');
  await s.selectOption('[name=auto_lauf_aktiv]', '1'); await s.fill('[name=auto_lauf_tag]', '40'); await klick(s, '#autoSpeichern', 'Tag 40 (ungültig)'); await meldungIst(s, /zwischen 1 und 28/, 'ungültiger Tag abgelehnt');
  await s.fill('[name=auto_lauf_tag]', '3'); await s.selectOption('[name=auto_stellen]', '1'); await klick(s, '#autoSpeichern', 'Automatik an, Tag 3, gleich stellen'); await meldungIst(s, /Automatik gespeichert/, 'Automatik gespeichert');
  if (await s.inputValue('[name=auto_lauf_tag]') !== '3' || await s.inputValue('[name=auto_lauf_aktiv]') !== '1') throw new Error('Automatik nicht gespeichert'); ok('Einstellung bleibt nach dem Neuladen');
  const laeufe = await s.locator('[data-lauf]').count(); if (laeufe < 3) throw new Error('Protokoll zeigt nur ' + laeufe + ' Läufe'); ok(laeufe + ' Läufe im Protokoll');
  await s.locator('[data-lauf]').first().click(); await s.locator('#schublade').waitFor({ state: 'visible' });
  if (!/Abrechnungslauf/.test(await s.textContent('#schublade'))) throw new Error('Laufdetails fehlen'); ok('Laufdetails: angelegt / gestellt / offen'); await bild(s, 'b26-automatik'); await s.click('#schublade #abbrechen');
  await s.selectOption('[name=auto_lauf_aktiv]', '0'); await klick(s, '#autoSpeichern', 'Automatik wieder aus'); await meldungIst(s, /Automatik gespeichert/, 'Automatik aus');
  await klick(s, '#abmelden', 'Abmelden'); await s.waitForURL(/anmelden/);
  // Kunde sieht Rechnungen, kann ansehen und XRechnung laden
  await s.fill('[name=email]', 'kunde@abnahme.test'); await s.fill('[name=passwort]', 'Kunde-Abnahme-1'); await s.click('#los'); await s.waitForURL(/\/kunde/); await ruhig(s);
  await klick(s, '#nav a[data-v=rechnungen]', 'Kunde: Rechnungen'); const kt = await s.textContent('#inhalt');
  if (!/0001/.test(kt) || !/0002/.test(kt) || !/0003/.test(kt)) throw new Error('Kunde sieht nicht alle drei Belege'); ok('Kunde sieht Rechnung, Storno und neue Rechnung'); await bild(s, 'k04-rechnungen');
  const kp = await pdfPruefen(s, await s.locator('tr', { hasText: '0003' }).locator('a[href^="/api/kunde/rechnung-pdf"]').getAttribute('href'));
  if (!kp.xml || !/Prüfstraße 2/.test(kp.xml)) throw new Error('Kunde: Rechnungs-PDF unvollständig'); ok('Kunde öffnet das Rechnungs-PDF mit ZUGFeRD-Daten');
  const fremd = await s.request.get(URL0 + '/api/rechnung/pdf?id=1'); if (fremd.status() !== 403) throw new Error('Kunde erreicht Büro-PDF: ' + fremd.status()); ok('Kunde kommt nicht an die Büro-PDF-Schnittstelle (403)');
  const [kx] = await Promise.all([s.waitForEvent('download'), s.locator('tr', { hasText: '0003' }).locator('a[href^="/api/kunde/xrechnung"]').click()]); ok('Kunde lädt XRechnung: ' + kx.suggestedFilename());
  const firma = await s.request.get(URL0 + '/api/kunde/firma'); const fj = await firma.json(); if ('gewinn_prozent' in fj || 'lohnnebenkosten_prozent' in fj) throw new Error('Kunde sieht Kalkulationswerte'); ok('Kunde sieht keine Kalkulationswerte');
  await klick(s, '#nav a[data-v=uebersicht]', 'Meine Objekte'); await s.locator('[data-o]').first().click(); await ruhig(s);
  if (!/Grundreinigung Flur[\s\S]*erledigt/.test(await s.textContent('#inhalt'))) throw new Error('Anfrage im Portal nicht erledigt'); ok('Portal: Anfrage steht auf „erledigt"');
  await ctx.close();
}

async function buero2(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Büro');
  await s.goto(URL0 + '/'); await s.waitForURL(/anmelden/); ok('ohne Sitzung → /anmelden');
  await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.click('#los'); await s.waitForURL(URL0 + '/'); await ruhig(s); ok('Büro angemeldet');
  await klick(s, '#nav a[data-v=zeiten]', 'Zeiten & Lohn öffnen');
  if (!(await s.locator('[data-korr]').count())) throw new Error('Stempelung aus der App fehlt in Zeiten'); ok('Stempelung aus der App sichtbar'); await bild(s, 'b17-zeiten');
  await s.locator('[data-korr]').first().click(); await schublade(s, { kommen: '06:00', gehen: '08:30', pause: '0' }, '#speichern'); await meldungIst(s, /Korrigiert/, 'Zeit korrigieren');
  const [csv] = await Promise.all([s.waitForEvent('download'), s.click('a[href^="/api/zeiten.csv"]')]); if (!/Arbeitszeiten_/.test(csv.suggestedFilename())) throw new Error('CSV-Name'); ok('CSV herunterladen: ' + csv.suggestedFilename());
  await klick(s, '[data-reiter=sollist]', 'Reiter Soll/Ist'); await klick(s, '[data-reiter=stunden]', 'Reiter Stunden'); await bild(s, 'b18-stunden');
  await klick(s, '[data-reiter=datev]', 'Reiter DATEV'); await bild(s, 'b19-datev');
  const [dat] = await Promise.all([s.waitForEvent('download'), s.click('a[href^="/api/datev?monat="]')]); const dp = path.join(DATEN, 'datev.csv'); await dat.saveAs(dp);
  const inhalt = fs.readFileSync(dp, 'utf8'); if (!/^\uFEFF?Beraternummer;Mandantennummer/.test(inhalt) || !/12345;678;\d\d\/\d{4};1001;Anna Beispiel;1000;2,50/.test(inhalt)) throw new Error('DATEV-Datei unerwartet:\n' + inhalt); ok('DATEV-Datei: Anna 2,50 Std. Lohnart 1000, Berater 12345 / Mandant 678');
  await s.fill('#zVon', plus(-40)); await klick(s, '#zLaden', 'Zeitraum ändern');
  await klick(s, '#nav a[data-v=maengel]', 'Mängel öffnen'); const vorher = await s.locator('[data-erledigt]').count();
  const txt = await s.textContent('#inhalt'); if (!/Reklamation/.test(txt) || !/Seifenspender/.test(txt) || !/Prüfung/.test(txt)) throw new Error('Mängel aus App/Kunde/Prüfung fehlen'); ok(vorher + ' Mängel: aus App, Kundenportal und Prüfung'); await bild(s, 'b20-maengel');
  await klick(s, '[data-erledigt]', 'Mangel erledigen'); if (await s.locator('[data-erledigt]').count() !== vorher - 1) throw new Error('Mangel nicht erledigt'); ok('Mangel erledigt');
  await klick(s, '#nav a[data-v=uebersicht]', 'Übersicht'); await klick(s, '#nav a[data-v=einsatz]', 'Einsatz (nach Zusage)');
  // Einsatzplan rechnet die Auslastung aller Objekte — auf den fertigen Inhalt warten statt einmal zu lesen
  try { await s.locator('#inhalt', { hasText: 'zugesagt' }).waitFor({ timeout: 8000 }); } catch (e) { throw new Error('Zusage aus der App nicht im Einsatzplan'); }
  ok('Zusage der Vertretung im Einsatzplan sichtbar');
  await klick(s, '#nav a[data-v=objekte]', 'Objekte'); await bild(s, 'b21-objekte');
  await klick(s, '#abmelden', 'Abmelden'); await s.waitForURL(/anmelden/); ok('Büro abgemeldet');
  await ctx.close();
}

(async function () {
  const mitWebkit = process.argv.includes('--webkit');
  // Attrappe der Adresssuche (Nominatim-Schnittstelle), damit die Abnahme ohne Internet und ohne fremden Dienst läuft
  const attrappe = require('http').createServer(function (q, a) { const s = decodeURIComponent((q.url.split('q=')[1] || '').replace(/\+/g, ' ')); a.writeHead(200, { 'Content-Type': 'application/json' }); a.end(JSON.stringify(/Prüfweg/.test(s) ? [{ lat: '54.3240', lon: '10.1300', display_name: 'Prüfweg 1, 24103 Kiel, Schleswig-Holstein, Deutschland' }] : [])); });
  await new Promise(ok => attrappe.listen(0, '127.0.0.1', ok));
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { STAFFCLEAN_PORT: String(PORT), STAFFCLEAN_DATEN: DATEN, STAFFCLEAN_ADRESSSUCHE: 'http://127.0.0.1:' + attrappe.address().port }), stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = ''; srv.stdout.on('data', d => { srvLog += d; }); srv.stderr.on('data', d => { srvLog += d; });
  for (let i = 0; i < 50 && !/läuft/.test(srvLog); i++) await new Promise(r => setTimeout(r, 100));
  let b;
  try {
    b = await chromium.launch();
    if (process.env.NUR_APP) { await app(b, true); throw new Error('NUR_APP fertig'); }
    const oid = await buero1(b); await app(b, true); await kunde(b, oid); await buero2(b); await abrechnen(b);
    await b.close(); b = null;
    if (mitWebkit) {
      const w = await webkit.launch(); const ctx = await w.newContext({ viewport: { width: 390, height: 844 } }); const s = await ctx.newPage(); await beobachten(s, 'WebKit');
      for (const p of ['/app', '/anmelden', '/gestaltung']) { await s.goto(URL0 + p); await ruhig(s); ok('WebKit lädt ' + p); }
      await s.goto(URL0 + '/app'); await ruhig(s); await s.click('.kachel:has-text("Anna")'); for (const z of ['1', '1', '1', '1', '✓']) await s.click('[data-z="' + z + '"]'); await s.locator('.app-gruss').waitFor(); ok('WebKit: PIN-Anmeldung'); await bild(s, 'w01-webkit-app');
      await w.close();
    }
  } catch (e) {
    fehler.push('ABBRUCH: ' + e.message.split('\n')[0]);
    if (letzteSeite) {
      await letzteSeite.screenshot({ path: path.join(BILDER, 'abbruch.png'), fullPage: true }).catch(() => {});
      fehler.push('Seite beim Abbruch: ' + letzteSeite.url() + ' · ' + JSON.stringify(await letzteSeite.evaluate(() => [window.__m, (document.getElementById('meldung') || {}).outerHTML]).catch(() => null)));
    }
  }
  finally { if (b) await b.close().catch(() => {}); srv.kill(); attrappe.close(); }
  if (/Error|TypeError/.test(srvLog)) fehler.push('Server-Protokoll: ' + srvLog.split('\n').filter(l => /Error/.test(l)).slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(BILDER, 'protokoll.txt'), protokoll.join('\n') + '\n\nFEHLER:\n' + (fehler.join('\n') || 'keine') + '\n');
  console.log(protokoll.join('\n'));
  console.log('\n' + schritte + ' Schritte geprüft · ' + fehler.length + ' Fehler');
  fehler.forEach(f => console.log('✗ ' + f));
  if (!process.env.BEHALTEN) { try { fs.rmSync(DATEN, { recursive: true, force: true }); } catch (e) {} } else console.log('Daten behalten: ' + DATEN);
  process.exit(fehler.length ? 1 : 0);
})();
