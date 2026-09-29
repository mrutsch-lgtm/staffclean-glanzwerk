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
// Ortszeit wie der Server (toISOString allein ist UTC — zwischen 0 und 2 Uhr läge das Datum einen Tag daneben)
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

let letzteSeite = null;
async function beobachten(seite, name) {
  letzteSeite = seite;
  await seite.addInitScript(() => { window.__m = []; new MutationObserver(function () { const x = document.getElementById('meldung'); if (x && x.textContent && x.textContent !== window.__letzte) { window.__letzte = x.textContent; window.__m.push(x.textContent); } }).observe(document, { subtree: true, childList: true, characterData: true }); });
  seite.on('pageerror', e => fehler.push(name + ' JS: ' + e.message));
  seite.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fehler.push(name + ' Konsole: ' + m.text()); });
  seite.on('response', r => { const u = r.url(); if (!u.includes('/api/') || r.status() < 400) return; if (u.endsWith('/api/ich') && r.status() === 401) return; if (erlaubt > 0) { erlaubt--; return; } fehler.push(name + ' API ' + r.status() + ' ' + r.request().method() + ' ' + u.replace(URL0, '')); });
  seite.on('dialog', d => d.accept(d.type() === 'prompt' ? (/JJJJ-MM/.test(d.message()) ? d.defaultValue() : 'Abnahme-Bemerkung') : undefined));   // Monatsabfrage: Vorschlag übernehmen
}
async function bild(seite, n) { if (process.env.OHNE_BILDER) return; await seite.waitForTimeout(350); await seite.screenshot({ path: path.join(BILDER, n + '.png'), fullPage: true }); }
async function ruhig(seite) { await seite.waitForLoadState('networkidle').catch(() => {}); await seite.waitForTimeout(250); }
async function klick(seite, sel, text) { await seite.locator(sel).first().click(); await ruhig(seite); ok(text || sel); }
async function navKlick(seite, v, text) {
  const a = seite.locator('#nav a[data-v="' + v + '"]').first();
  if (!(await a.isVisible())) { const k = seite.locator('#navKnopf'); if (await k.isVisible() && !(await seite.locator('#nav').isVisible())) await k.click(); const m = a.locator('xpath=ancestor::div[contains(@class,"menue")][1]/button'); if (await m.count()) await m.click(); }
  await a.click(); await ruhig(seite); ok(text || v);
}
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
  await navKlick(s, 'kunden', 'Kunden öffnen'); await klick(s, '#neuKunde', '+ Kunde');
  await schublade(s, { name: 'Testkunde Abnahme GmbH', ansprechpartner: 'Frau Prüf', email: 'kunde@abnahme.test', ort: 'Kiel' }); await meldungIst(s, /Gespeichert/, 'Kunde speichern');
  const karte = s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' });
  await karte.locator('[data-zugang]').click(); await schublade(s, { name: 'Frau Prüf', email: 'kunde@abnahme.test', passwort: 'Kunde-Abnahme-1' }, '#speichern'); await meldungIst(s, /Zugang angelegt/, 'Portal-Zugang anlegen');
  await karte.locator('[data-sperren]').click(); await ruhig(s); await meldungIst(s, /Geändert/, 'Zugang sperren');
  await s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' }).locator('[data-sperren]').click(); await ruhig(s); await meldungIst(s, /Geändert/, 'Zugang entsperren');
  await s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' }).locator('[data-kunde]').click(); await schublade(s, { telefon: '0431 000' }); await meldungIst(s, /Gespeichert/, 'Kunde bearbeiten');
  await bild(s, 'b02-kunden');
  // Objekt anlegen
  await navKlick(s, 'objekte', 'Objekte öffnen'); await klick(s, '#neuObjekt', '+ Objekt');
  const kid = await s.locator('#schublade [name=kunde_id] option', { hasText: 'Testkunde' }).getAttribute('value');
  await schublade(s, { name: 'Abnahme-Objekt Kiel', kunde_id: kid, strasse: 'Prüfweg 1', plz: '24103', ort: 'Kiel', bundesland: 'SH', reinigungstag: '2' });
  await s.waitForURL(/#objekt\/\d+/); const oid = s.url().split('/').pop(); ok('Objekt angelegt → Objektseite ' + oid);
  // Objekt öffnet mit Objektkopf und Objektakte, das LV ist ein Reiter
  if (!(await s.locator('.kennzahl').count())) throw new Error('Objektkopf mit Kennzahlen fehlt'); ok('Objektkopf mit Kennzahlen');
  await klick(s, '[data-reiter="lv"]', 'Reiter Leistungsverzeichnis');
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
  await navKlick(s, 'dienstplan', 'Dienstplan öffnen'); await bild(s, 'b09-dienstplan');
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
  await navKlick(s, 'tagesplan', 'Tagesplan öffnen');
  if (await s.locator('[data-nachtragen]').count()) { await klick(s, '[data-nachtragen]', 'als erledigt nachtragen'); await meldungIst(s, /Nachgetragen/, 'Nachtragen'); await klick(s, '[data-zurueck]', 'zurücknehmen'); await meldungIst(s, /Zurückgenommen/, 'Zurücknehmen'); }
  await klick(s, '#tVor', 'Tag vor'); await klick(s, '#tZurueck', 'Tag zurück'); await s.fill('#tDatum', plus(3)); await s.dispatchEvent('#tDatum', 'change'); await ruhig(s); ok('Datum wählen'); await klick(s, '#tHeute', 'Heute'); await bild(s, 'b11-tagesplan');
  // Import
  await s.goto(URL0 + '/#import'); await ruhig(s); await s.setInputFiles('#datei', await lvDatei()); await s.locator('#uebernehmen').waitFor(); ok('Excel-LV: Vorschau'); await bild(s, 'b12-import');
  await s.click('#uebernehmen'); await s.waitForURL(/#objekt\/\d+/); await ruhig(s); ok('Excel-LV übernommen → Objekt ' + s.url().split('/').pop());
  await s.goto(URL0 + '/#import'); await ruhig(s); await s.setInputFiles('#datei', await wettbewerberDatei()); await s.locator('#uebernehmen').waitFor();
  const vt = await s.textContent('#vorschau');
  if (!/Prüfallee 12a/.test(vt) || !/Kürzel „m2" laut Legende als „14T"/.test(vt) || !/als Raumfläche übernommen/.test(vt) || /Erdgeschoss<|Summe/.test(await s.innerHTML('#vorschau table'))) throw new Error('Wettbewerber-LV falsch gelesen: ' + vt.slice(0, 300));
  ok('Wettbewerber-LV: Räume in Spalte 2, m² als Fläche, Legende übersetzt m2 → 14T'); await bild(s, 'b12b-import-wettbewerber');
  await s.click('#uebernehmen'); await s.waitForURL(/#objekt\/\d+/); await ruhig(s); await klick(s, '[data-reiter="lv"]', 'Reiter Leistungsverzeichnis');
  const rt = await s.textContent('#inhalt'); if (!/30,47 m²/.test(rt)) throw new Error('Fläche nicht am Raum: ' + rt.slice(0, 400)); ok('Fläche 30,47 m² am Raum');
  await s.locator('[data-raum-edit]').first().click(); await schublade(s, { anzahl: '3' }); await meldungIst(s, /Raum gespeichert/, 'Anzahl 3 Etagen am Raum');
  await textDa(s, '#inhalt', /× 3/, 'Anzahl nicht im Raster'); ok('Raster zeigt „× 3"');
  await klick(s, '[data-reiter=kalk]', 'Kalkulation mit Anzahl'); if (!/ × 3/.test(await s.textContent('#inhalt'))) throw new Error('Kalkulation ohne Anzahl'); ok('Kalkulation rechnet mit „× 3"');
  // Einsatz
  await navKlick(s, 'einsatz', 'Einsatz öffnen'); await klick(s, '#neuAbw', '+ Abwesenheit');
  const piotr = await s.locator('#schublade [name=mitarbeiter_id] option', { hasText: 'Piotr' }).getAttribute('value');
  await schublade(s, { mitarbeiter_id: piotr, art: 'Urlaub', von: plus(5), bis: plus(9) }, '#speichern'); await meldungIst(s, /eingetragen/, 'Abwesenheit eintragen');
  await klick(s, '[data-vertretung]', 'Vertretung anfragen'); await s.locator('#schublade [data-anfragen]').first().click(); await ruhig(s); await meldungIst(s, /Anfrage gesendet/, 'Vertretungsanfrage senden');
  await bild(s, 'b13-einsatz');
  await klick(s, '[data-abw-weg]', 'Abwesenheit entfernen'); await meldungIst(s, /Entfernt/, 'Abwesenheit entfernt');
  // Qualität
  await navKlick(s, 'qualitaet', 'Qualität öffnen'); await klick(s, '[data-pr]', 'Prüfung aus Liste öffnen'); await s.goto(URL0 + '/#qualitaet'); await ruhig(s);
  await klick(s, '#qStart', 'Prüfung starten (Demo-Objekt)'); await s.waitForURL(/#pruefung\//); await bild(s, 'b14-qualitaet');
  // Mitarbeiter
  // Personal: Liste, neue Kraft, Personalakte (Prüfziffern), Dokumente, Abwesenheit, Einsätze, App-Zugang, Auswertungen
  await navKlick(s, 'mitarbeiter', 'Personal öffnen'); await klick(s, '#neuMa', '+ Mitarbeiter');
  await schublade(s, { vorname: 'Test', nachname: 'Kraft', sprache: 'ro', pin: '4321' }, '#speichern'); await meldungIst(s, /Angelegt/, 'Mitarbeiter mit PIN anlegen');
  await s.waitForURL(/#person\/\d+/); await ruhig(s); ok('Personalakte geöffnet');
  if (!/Für die Anmeldung beim Lohnbüro fehlen/.test(await s.textContent('#inhalt'))) throw new Error('Lückenhinweis fehlt'); ok('Akte zeigt fehlende Pflichtangaben');
  erwartet(); await klick(s, '#paZugang', 'App-Zugang & Lohn'); await schublade(s, { personalnummer: '1003', pin: '12' }, '#speichern'); await meldungIst(s, /4 bis 8/, 'zu kurze PIN wird abgelehnt');
  await s.fill('#schublade [name=pin]', ''); await s.click('#schublade #speichern'); await ruhig(s); await meldungIst(s, /Gespeichert/, 'Personalnummer gespeichert');
  erwartet(); await s.fill('#paBereich [name=steuer_id]', '12345678901'); await klick(s, '#paSpeichern', 'Akte mit falscher Steuer-ID'); await meldungIst(s, /Prüfziffer|Steuer-ID/, 'falsche Steuer-ID abgelehnt');
  const akte = { geburtsdatum: '1939-08-17', geburtsort: 'Kiel', staatsangehoerigkeit: 'deutsch', strasse: 'Prüfweg 1', plz: '24534', ort: 'Neumünster', eintritt: plus(-30), steuer_id: '86095742719', sv_nummer: '65170839K004', krankenkasse: 'AOK', iban: 'DE02120300000000202051', urlaubsanspruch: '26', notfall_name: 'Partner', notfall_telefon: '0170 000' };
  for (const [n, v] of Object.entries(akte)) await s.fill('#paBereich [name=' + n + ']', v);
  await s.selectOption('#paBereich [name=geschlecht]', 'w'); await s.selectOption('#paBereich [name=beschaeftigungsart]', 'minijob'); await s.selectOption('#paBereich [name=aufenthaltstitel]', 'deutsch');
  await klick(s, '#paSpeichern', 'Personalakte speichern'); await meldungIst(s, /Gespeichert/, 'Personalakte gespeichert');
  await klick(s, '[data-reiter=dokumente]', 'Reiter Dokumente'); const pdfDatei = path.join(DATEN, 'vertrag.pdf'); fs.writeFileSync(pdfDatei, '%PDF-1.4\n%Abnahme\n');
  await s.setInputFiles('#paDatei', pdfDatei); await klick(s, '#paHoch', 'Dokument hochladen'); await meldungIst(s, /Dokument abgelegt/, 'Vertrag in der Akte');
  await klick(s, '[data-reiter=dokumente]', 'Reiter Dokumente'); await klick(s, '[data-dokweg]', 'Dokument entfernen'); await meldungIst(s, /Entfernt/, 'Dokument entfernt');
  await klick(s, '[data-reiter=abwesenheit]', 'Reiter Urlaub & Abwesenheit'); await klick(s, '#paAbw', 'Urlaub eintragen'); await meldungIst(s, /Eingetragen/, 'Urlaub eingetragen');
  await klick(s, '[data-reiter=abwesenheit]', 'Reiter Urlaub & Abwesenheit'); await klick(s, '[data-abwweg]', 'Abwesenheit entfernen'); await meldungIst(s, /Entfernt/, 'Abwesenheit entfernt');
  await klick(s, '[data-reiter=einsatz]', 'Reiter Einsätze');
  await klick(s, '#paNachricht', 'Nachricht an die Kraft'); await s.locator('#kommPanel').waitFor({ state: 'visible' }); await s.fill('#kommText', 'Willkommen im Team (Abnahme)'); await klick(s, '#kommSenden', 'Direktnachricht senden');
  if (!/Willkommen im Team/.test(await s.textContent('#kommVerlauf'))) throw new Error('Direktnachricht nicht im Verlauf'); ok('Direktnachricht im Verlauf'); await s.click('#kommZu');
  await bild(s, 'b15-personalakte');
  await navKlick(s, 'mitarbeiter', 'Personal-Liste'); await s.fill('#pSuche', 'Kraft'); await ruhig(s); ok('Personal durchsuchen'); await s.selectOption('#pStatus', 'alle'); await ruhig(s); ok('Status-Filter');
  await klick(s, '[data-reiter=fristen]', 'Fristen & Lücken'); await klick(s, '[data-reiter=auswertung]', 'Monatsauswertung'); await s.locator('#awTabelle table').waitFor(); ok('Monatsauswertung mit Tabelle');
  await klick(s, '#awCsv', 'Auswertung als CSV'); await klick(s, '[data-reiter=urlaub]', 'Urlaubskonten'); await klick(s, '[data-person]', 'Akte aus Urlaubskonto öffnen'); await s.waitForURL(/#person\//); ok('Personalakte über Liste');
  await bild(s, 'b15-mitarbeiter');
  // Stammdaten
  await navKlick(s, 'stammdaten', 'Stammdaten öffnen');
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
  await navKlick(s, 'rechnungen', 'Rechnungen (noch leer)'); if (!/Noch keine Rechnungen/.test(await s.textContent('#inhalt'))) throw new Error('Rechnungsliste nicht leer'); ok('noch keine Rechnung sichtbar');
  await klick(s, '#abmelden', 'Kunde abmelden'); await s.waitForURL(/anmelden/); ok('abgemeldet → /anmelden');
  await ctx.close();
}

async function abrechnen(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Abrechnung');
  await s.goto(URL0 + '/anmelden'); await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.click('#los'); await s.waitForURL(URL0 + '/'); await ruhig(s);
  // Anfrage aus dem Portal bestätigen, einplanen, erledigen
  await navKlick(s, 'abrechnung', 'Abrechnung öffnen'); await klick(s, '[data-reiter=auftraege]', 'Reiter Sonderleistungen');
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
  await navKlick(s, 'stammdaten', 'Stammdaten'); await klick(s, '[data-reiter=einstellungen]', 'Einstellungen'); await s.fill('[name=stundensatz_abruf]', '35'); await klick(s, '#eSpeichern', 'Stundensatz 35 € speichern'); await meldungIst(s, /gespeichert/, 'Stundensatz gespeichert');
  // Entwürfe für den laufenden Monat
  await navKlick(s, 'abrechnung', 'Abrechnung'); await klick(s, '[data-reiter=uebersicht]', 'Reiter Rechnungen'); await s.fill('#abMonat', plus(0).slice(0, 7)); await klick(s, '#abErzeugen', 'Entwürfe erzeugen');
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
  await navKlick(s, 'stammdaten', 'Stammdaten'); await klick(s, '[data-reiter=einstellungen]', 'Einstellungen');
  for (const [n, v] of [['firma_strasse', 'Prüfstraße 2'], ['firma_plz', '24534'], ['firma_ort', 'Neumünster'], ['firma_email', 'rechnung@abnahme.test'], ['steuernummer', '00/000/00000'], ['iban', 'DE02 1203 0000 0000 2020 51'], ['bank', 'Abnahmebank'], ['geschaeftsfuehrung', 'Test Geschäftsführung']]) await s.fill('[name=' + n + ']', v);
  await klick(s, '#eSpeichern', 'Rechnungsangaben speichern'); await meldungIst(s, /gespeichert/, 'Firmenangaben gespeichert');
  await navKlick(s, 'kunden', 'Kunden'); await s.locator('.karte', { hasText: 'Testkunde Abnahme GmbH' }).locator('[data-kunde]').click();
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
  await klick(s, 'a[href="#abrechnung"]', 'Alle Rechnungen'); await klick(s, '[data-reiter=uebersicht]', 'Reiter Rechnungen');
  const vm = new Date(); vm.setDate(1); vm.setMonth(vm.getMonth() - 1); await s.fill('#abMonat', vm.getFullYear() + '-' + String(vm.getMonth() + 1).padStart(2, '0'));
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
  await navKlick(s, 'rechnungen', 'Kunde: Rechnungen'); const kt = await s.textContent('#inhalt');
  if (!/0001/.test(kt) || !/0002/.test(kt) || !/0003/.test(kt)) throw new Error('Kunde sieht nicht alle drei Belege'); ok('Kunde sieht Rechnung, Storno und neue Rechnung'); await bild(s, 'k04-rechnungen');
  const kp = await pdfPruefen(s, await s.locator('tr', { hasText: '0003' }).locator('a[href^="/api/kunde/rechnung-pdf"]').getAttribute('href'));
  if (!kp.xml || !/Prüfstraße 2/.test(kp.xml)) throw new Error('Kunde: Rechnungs-PDF unvollständig'); ok('Kunde öffnet das Rechnungs-PDF mit ZUGFeRD-Daten');
  const fremd = await s.request.get(URL0 + '/api/rechnung/pdf?id=1'); if (fremd.status() !== 403) throw new Error('Kunde erreicht Büro-PDF: ' + fremd.status()); ok('Kunde kommt nicht an die Büro-PDF-Schnittstelle (403)');
  const [kx] = await Promise.all([s.waitForEvent('download'), s.locator('tr', { hasText: '0003' }).locator('a[href^="/api/kunde/xrechnung"]').click()]); ok('Kunde lädt XRechnung: ' + kx.suggestedFilename());
  const firma = await s.request.get(URL0 + '/api/kunde/firma'); const fj = await firma.json(); if ('gewinn_prozent' in fj || 'lohnnebenkosten_prozent' in fj) throw new Error('Kunde sieht Kalkulationswerte'); ok('Kunde sieht keine Kalkulationswerte');
  await navKlick(s, 'uebersicht', 'Meine Objekte'); await s.locator('[data-o]').first().click(); await ruhig(s);
  if (!/Grundreinigung Flur[\s\S]*erledigt/.test(await s.textContent('#inhalt'))) throw new Error('Anfrage im Portal nicht erledigt'); ok('Portal: Anfrage steht auf „erledigt"');
  await ctx.close();
}

async function buero2(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Büro');
  await s.goto(URL0 + '/'); await s.waitForURL(/anmelden/); ok('ohne Sitzung → /anmelden');
  await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.click('#los'); await s.waitForURL(URL0 + '/'); await ruhig(s); ok('Büro angemeldet');
  await navKlick(s, 'zeiten', 'Zeiten & Lohn öffnen');
  if (!(await s.locator('[data-korr]').count())) throw new Error('Stempelung aus der App fehlt in Zeiten'); ok('Stempelung aus der App sichtbar'); await bild(s, 'b17-zeiten');
  await s.locator('[data-korr]').first().click(); await schublade(s, { kommen: '06:00', gehen: '08:30', pause: '0' }, '#speichern'); await meldungIst(s, /Korrigiert/, 'Zeit korrigieren');
  const [csv] = await Promise.all([s.waitForEvent('download'), s.click('a[href^="/api/zeiten.csv"]')]); if (!/Arbeitszeiten_/.test(csv.suggestedFilename())) throw new Error('CSV-Name'); ok('CSV herunterladen: ' + csv.suggestedFilename());
  await klick(s, '[data-reiter=sollist]', 'Reiter Soll/Ist'); await klick(s, '[data-reiter=stunden]', 'Reiter Stunden'); await bild(s, 'b18-stunden');
  await klick(s, '[data-reiter=datev]', 'Reiter DATEV'); await bild(s, 'b19-datev');
  const [dat] = await Promise.all([s.waitForEvent('download'), s.click('a[href^="/api/datev?monat="]')]); const dp = path.join(DATEN, 'datev.csv'); await dat.saveAs(dp);
  const inhalt = fs.readFileSync(dp, 'utf8'); if (!/^\uFEFF?Beraternummer;Mandantennummer/.test(inhalt) || !/12345;678;\d\d\/\d{4};1001;Anna Beispiel;1000;2,50/.test(inhalt)) throw new Error('DATEV-Datei unerwartet:\n' + inhalt); ok('DATEV-Datei: Anna 2,50 Std. Lohnart 1000, Berater 12345 / Mandant 678');
  await s.fill('#zVon', plus(-40)); await klick(s, '#zLaden', 'Zeitraum ändern');
  await navKlick(s, 'maengel', 'Mängel öffnen'); const vorher = await s.locator('[data-erledigt]').count();
  const txt = await s.textContent('#inhalt'); if (!/Reklamation/.test(txt) || !/Seifenspender/.test(txt) || !/Prüfung/.test(txt)) throw new Error('Mängel aus App/Kunde/Prüfung fehlen'); ok(vorher + ' Mängel: aus App, Kundenportal und Prüfung'); await bild(s, 'b20-maengel');
  await klick(s, '[data-erledigt]', 'Mangel erledigen'); if (await s.locator('[data-erledigt]').count() !== vorher - 1) throw new Error('Mangel nicht erledigt'); ok('Mangel erledigt');
  await navKlick(s, 'uebersicht', 'Übersicht'); await navKlick(s, 'einsatz', 'Einsatz (nach Zusage)');
  // Einsatzplan rechnet die Auslastung aller Objekte — auf den fertigen Inhalt warten statt einmal zu lesen
  try { await s.locator('#inhalt', { hasText: 'zugesagt' }).waitFor({ timeout: 8000 }); } catch (e) { throw new Error('Zusage aus der App nicht im Einsatzplan'); }
  ok('Zusage der Vertretung im Einsatzplan sichtbar');
  await navKlick(s, 'objekte', 'Objekte'); await bild(s, 'b21-objekte');
  await klick(s, '#abmelden', 'Abmelden'); await s.waitForURL(/anmelden/); ok('Büro abgemeldet');
  await ctx.close();
}


// Erweiterung 28.09.2026: Rechnung frei erstellen, Zahlungen, Mahnwesen, Artikel, Einstellungen, Objektakte, Planner, Chat
async function wahlText(s, sel, muster) {
  const v = await s.$$eval(sel + ' option', (o, m) => { const x = o.find(e => new RegExp(m).test(e.textContent)); return x ? x.value : null; }, muster);
  if (v == null) throw new Error('Auswahl „' + muster + '" fehlt in ' + sel); await s.selectOption(sel, v); await ruhig(s);
}
function datenbank() { const { DatabaseSync } = require('node:sqlite'); return new DatabaseSync(path.join(DATEN, 'staffclean.sqlite')); }
async function textDa(s, sel, muster, fehlertext) { for (let i = 0; i < 50; i++) { const t = await s.textContent(sel).catch(() => ''); if (muster.test(t || '')) return; await s.waitForTimeout(200); } throw new Error(fehlertext + ': ' + String(await s.textContent(sel).catch(() => '')).slice(0, 200)); }
async function schubladeZu(s) { await s.waitForTimeout(450); if (await s.locator('#schublade').isVisible()) await s.click('#schublade #abbrechen'); }

async function erweiterung(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Erweiterung');
  await s.goto(URL0 + '/anmelden'); await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.click('#los'); await s.waitForURL(URL0 + '/'); await ruhig(s);
  // Artikelstamm
  await navKlick(s, 'abrechnung', 'Abrechnung'); await klick(s, '[data-reiter=artikel]', 'Reiter Artikel & Leistungen');
  await klick(s, '#neuArtikel', '+ Artikel'); await schublade(s, { nummer: 'A-100', bezeichnung: 'Grundreinigung Teppich', beschreibung: 'Sprühextraktion inkl. Fleckentfernung', einheit: 'm²', preis: '3.20' }); await meldungIst(s, /Artikel gespeichert/, 'Artikel angelegt');
  await klick(s, '#neuArtikel', '+ zweiter Artikel'); await schublade(s, { bezeichnung: 'Alt-Artikel', einheit: 'Std.', preis: '30' }); await meldungIst(s, /Artikel gespeichert/, 'zweiter Artikel');
  await s.locator('tr', { hasText: 'Alt-Artikel' }).locator('[data-art]').click(); await schublade(s, { preis: '31.50' }); await meldungIst(s, /Artikel gespeichert/, 'Artikel ändern');
  await s.locator('tr', { hasText: 'Alt-Artikel' }).locator('[data-artweg]').click(); await meldungIst(s, /deaktiviert/, 'Artikel deaktivieren');
  // Neue Rechnung frei erstellen
  await klick(s, '#neuRechnung', '+ Neue Rechnung'); await wahlText(s, '#schublade [name=kunde_id]', 'Testkunde Abnahme');
  await s.fill('#schublade [name=betreff]', 'Sonderreinigung Abnahme'); await s.fill('#schublade [name=bestellnummer]', 'PO-ABN-1');
  await s.locator('[data-nrobj]').first().check(); ok('Objekt für die Übernahme gewählt'); await s.click('#schublade #speichern'); await ruhig(s);
  await meldungIst(s, /Entwurf angelegt/, 'freie Rechnung angelegt'); await s.waitForURL(/#rechnung\/\d+/); await schubladeZu(s);
  const rid = s.url().split('/').pop();
  await klick(s, '#rePos', '+ Position'); await schublade(s, { bezeichnung: 'Anfahrt Sondertermin', menge: '1', einheit: 'pauschal', einzelpreis: '25', gruppe: 'Sonderleistungen' }); await meldungIst(s, /Position gespeichert/, 'freie Position mit Zwischenüberschrift');
  await klick(s, '#reArtikel', '+ Artikel'); await schublade(s, { menge: '40', gruppe: 'Sonderleistungen' }, '#speichern'); await meldungIst(s, /Artikel hinzugefügt/, 'Artikel in die Rechnung');
  await klick(s, '#reObjekt', '+ Leistungen eines Objekts'); await s.click('#schublade #speichern'); await ruhig(s); await meldungIst(s, /schon|übernommen|nichts/, 'Objekt nicht doppelt übernommen');
  await klick(s, '#reNachlass', '+ Nachlass'); await schublade(s, { einzelpreis: '10' }); await meldungIst(s, /Position gespeichert/, 'Nachlass');
  if (!/–10,00|-10,00/.test(await s.textContent('#inhalt'))) throw new Error('Nachlass nicht negativ'); ok('Nachlass wird abgezogen');
  await klick(s, '#reGruppe', '+ Zwischenüberschrift'); if (!/Abnahme-Bemerkung/.test(await s.textContent('#inhalt'))) throw new Error('Zwischenüberschrift nicht aktiv'); ok('Zwischenüberschrift für neue Positionen aktiv');
  await klick(s, '#reGruppeAus', 'Zwischenüberschrift aufheben');
  const vorher = await s.locator('[data-pos]').evaluateAll(l => l.map(e => e.dataset.pos));
  await s.locator('[data-runter]').first().click(); await ruhig(s); const nachher = await s.locator('[data-pos]').evaluateAll(l => l.map(e => e.dataset.pos));
  if (vorher[0] === nachher[0]) throw new Error('Position nicht verschoben'); ok('Position nach unten'); await s.locator('[data-hoch]').nth(1).click(); await ruhig(s); ok('Position nach oben');
  await klick(s, '#reKopf', 'Kopfdaten & Texte'); await schublade(s, { betreff: 'Sonderreinigung Abnahme Teppich', zahlungsziel_tage: '21', einleitung: 'Sehr geehrte Frau Prüf,\nanbei unsere Rechnung.' }); await meldungIst(s, /Gespeichert/, 'Kopfdaten gespeichert');
  if (!/21 Tage \(an der Rechnung\)/.test(await s.textContent('#inhalt'))) throw new Error('Zahlungsziel nicht übernommen'); ok('Zahlungsziel an der Rechnung');
  await klick(s, '#reStellen', 'freie Rechnung stellen'); await meldungIst(s, /Gestellt: RE-/, 'freie Rechnung gestellt'); await bild(s, 'b27-freie-rechnung');
  const nr = (await s.textContent('#titel')).match(/RE-\d{4}-\d{4}/)[0];
  const x = await s.request.get(URL0 + '/api/rechnung/xrechnung?id=' + rid); if (!/PO-ABN-1/.test(await x.text())) throw new Error('Bestellnummer fehlt in der XRechnung'); ok('Bestellnummer in der XRechnung');
  // Zahlungen
  await klick(s, '#reZahlung', 'Zahlung buchen'); await schublade(s, { betrag: '100' }, '#speichern'); await meldungIst(s, /noch offen/, 'Teilzahlung gebucht');
  await klick(s, '[data-zweg]', 'Zahlung zurücknehmen'); await meldungIst(s, /Zahlung zurückgenommen/, 'Zahlung zurückgenommen');
  await klick(s, '#reMahnen', 'Mahnen (noch nicht fällig)'); await meldungIst(s, /Keine Mahnung fällig/, 'noch nicht fällig → keine Mahnung');
  await klick(s, '#reSperre', 'Mahnsperre setzen'); await meldungIst(s, /Mahnsperre gesetzt/, 'Mahnsperre gesetzt'); await klick(s, '#reSperre', 'Mahnsperre aufheben'); await meldungIst(s, /aufgehoben/, 'Mahnsperre aufgehoben');
  await klick(s, '#reKopie', 'Als Vorlage kopieren'); await meldungIst(s, /Kopie als Entwurf/, 'Kopie angelegt'); await s.waitForURL(u => !u.href.endsWith('/' + rid)); await klick(s, '#reLoeschen', 'Kopie verwerfen'); await meldungIst(s, /Entwurf gelöscht/, 'Kopie gelöscht');
  // Mahnwesen: zwei Rechnungen überfällig machen (Fälligkeit zurückdatieren, wie nach 45 Tagen)
  const d = datenbank(); d.prepare("UPDATE rechnung SET faellig = ? WHERE status = 'gestellt' AND storno_von IS NULL").run(plus(-45)); d.close(); ok('Fälligkeit zurückdatiert (45 Tage überfällig)');
  await klick(s, '#zuMahnlauf', 'Mahnlauf öffnen'); const posten = await s.locator('[data-ml]').count(); if (posten < 2) throw new Error('nur ' + posten + ' mahnfällige Posten'); ok(posten + ' Posten zum Mahnen fällig');
  await s.locator('[data-mahn]').first().click(); await textDa(s, '#schublade', /Mahnung(en)? erstellt/, 'Einzelmahnung ohne Ergebnis'); ok('einzelne Rechnung mahnen'); await s.click('#schublade #abbrechen');
  await klick(s, '[data-sperre]', 'Mahnsperre in der OP-Liste'); await meldungIst(s, /Mahnsperre gesetzt/, 'Sperre aus der OP-Liste'); await s.locator('[data-sperre][data-an="0"]').first().click(); await ruhig(s); await meldungIst(s, /aufgehoben/, 'Sperre aufgehoben');
  await klick(s, '#mlStart', 'Mahnlauf für Ausgewählte'); await textDa(s, '#schublade', /Mahnung(en)? erstellt/, 'Mahnlauf ohne Ergebnis'); ok('Mahnlauf erstellt die übrigen Mahnungen'); await bild(s, 'b28-mahnlauf'); await s.click('#schublade #abbrechen');
  const pdf = await s.request.get(URL0 + (await s.locator('a[href^="/api/mahnung/pdf"]').first().getAttribute('href').catch(() => '/api/mahnungen'))); ok('Mahnungs-PDF erreichbar (' + pdf.status() + ')');
  await klick(s, '[data-reiter=mahnungen]', 'Reiter Mahnungen'); const mp = await s.request.get(URL0 + await s.locator('a[href^="/api/mahnung/pdf"]').first().getAttribute('href'));
  if (mp.headers()['content-type'] !== 'application/pdf') throw new Error('Mahnung kein PDF'); ok('Mahnung als PDF auf Briefpapier');
  await klick(s, '[data-mzurueck]', 'letzte Mahnung zurücknehmen'); await meldungIst(s, /Mahnung zurückgenommen/, 'Mahnung zurückgenommen');
  await klick(s, '[data-reiter=uebersicht]', 'Rechnungsübersicht'); await s.fill('#fSuche', nr); await ruhig(s); ok('Suche nach Rechnungsnummer'); await s.selectOption('#fStatus', 'ueberfaellig'); await ruhig(s); ok('Filter überfällig');
  if (!(await s.locator('tr[data-re]').count())) throw new Error('überfällige Rechnung nicht in der Liste'); await s.selectOption('#fStatus', 'alle'); await s.fill('#fSuche', '');
  const [csv] = await Promise.all([s.waitForEvent('download'), s.click('#reCsv')]); ok('Rechnungsliste als CSV: ' + csv.suggestedFilename());
  await klick(s, '[data-reiter=einstellungen]', 'Reiter Einstellungen'); await s.fill('[name=mahn_gebuehr_2]', '7.50'); await klick(s, '#mahnSpeichern', 'Mahnwesen speichern'); await meldungIst(s, /Mahnwesen gespeichert/, 'Mahngebühren gespeichert');
  await s.fill('[name=bz_ab]', '2027-01-01'); await s.fill('[name=bz_prozent]', '1.4'); await klick(s, '#bzNeu', 'Basiszins eintragen'); await meldungIst(s, /Basiszinssatz eingetragen/, 'Basiszins 2027 eingetragen');
  await klick(s, '[data-bzweg="2027-01-01"]', 'Basiszins entfernen'); if (/01\.01\.2027/.test(await s.textContent('#abBereich'))) throw new Error('Basiszins nicht entfernt'); ok('Basiszins entfernt');
  // Objektakte
  await navKlick(s, 'objekte', 'Objekte'); await s.locator('[data-objekt]', { hasText: 'Abnahme-Objekt Kiel' }).click(); await s.waitForURL(/#objekt\//); await ruhig(s);
  await klick(s, '#akteBearbeiten', 'Objektakte bearbeiten'); await s.selectOption('#schublade [name=objektart]', 'buero'); await s.fill('#schublade [name=zeit_von]', '18:00'); await s.fill('#schublade [name=zeit_bis]', '21:00');
  await schublade(s, { objektnummer: 'O-1001', ap_name: 'Herr Vorort', ap_telefon: '0431 000', schluessel: 'Transponder 12', besonderheiten: 'Serverraum nicht betreten' }); await meldungIst(s, /Objektakte gespeichert/, 'Objektakte gespeichert');
  if (!/Reinigung 18:00–21:00 Uhr/.test(await s.textContent('#inhalt'))) throw new Error('Objektkopf ohne Reinigungszeit'); ok('Objektkopf zeigt Zeiten und Ansprechpartner'); await bild(s, 'b29-objektakte');
  await klick(s, '[data-reiter=rechnungen]', 'Reiter Rechnungen am Objekt'); if (!(await s.locator('#oBereich tr').count())) throw new Error('keine Rechnungen am Objekt'); ok('Rechnungen des Objekts');
  // Planner
  await navKlick(s, 'planner', 'Planner öffnen'); await klick(s, '[data-board]', 'Board öffnen'); await s.waitForURL(/#board\//); await navKlick(s, 'planner', 'zurück zu den Boards');
  await klick(s, '#neuBoard', '+ Board'); await schublade(s, { name: 'Abnahme-Board', beschreibung: 'Test' }); await meldungIst(s, /Gespeichert/, 'Board angelegt'); await s.waitForURL(/#board\/\d+/); await ruhig(s);
  await klick(s, '#bNeu', '+ Aufgabe'); await wahlText(s, '#schublade [name=zustaendig]', 'Anna'); await schublade(s, { titel: 'Streugut bestellen', faellig: plus(3), prioritaet: 'hoch', labels: 'Winter' }); await meldungIst(s, /Gespeichert/, 'Aufgabe an Anna zugewiesen');
  await klick(s, '[data-neuin]', '+ Aufgabe in Spalte'); await schublade(s, { titel: 'Wegwerf-Karte' }); await meldungIst(s, /Gespeichert/, 'zweite Aufgabe');
  await s.locator('[data-karte]', { hasText: 'Streugut' }).dragTo(s.locator('[data-spalte]').nth(1)); await ruhig(s);
  if (!(await s.locator('[data-spalte]').nth(1).locator('[data-karte]', { hasText: 'Streugut' }).count())) throw new Error('Karte nicht verschoben'); ok('Karte per Ziehen in „In Arbeit"');
  await s.locator('[data-karte]', { hasText: 'Streugut' }).click(); await s.locator('#schublade').waitFor({ state: 'visible' });
  await s.fill('#kPunkt', 'Angebot einholen'); await klick(s, '#kPunktNeu', 'Checklistenpunkt'); await s.fill('#kPunkt', 'Punkt zum Löschen'); await klick(s, '#kPunktNeu', 'zweiter Punkt');
  await s.locator('[data-kp]').first().check(); await ruhig(s); ok('Punkt abgehakt'); await s.locator('[data-kpweg]').last().click(); await ruhig(s); ok('Punkt gelöscht');
  await s.fill('#kKom', 'Lieferant angefragt'); await klick(s, '#kKomNeu', 'Kommentar'); if (!/Lieferant angefragt/.test(await s.textContent('#schublade'))) throw new Error('Kommentar fehlt'); ok('Kommentar an der Karte');
  await klick(s, '#kBearb', 'Karte bearbeiten'); await schublade(s, { beschreibung: '2 t Splitt' }); await meldungIst(s, /Gespeichert/, 'Karte gespeichert');
  await s.locator('[data-karte]', { hasText: 'Streugut' }).click(); await s.locator('#schublade').waitFor({ state: 'visible' }); await klick(s, '#kChat', 'Nachricht an die Zuständige'); await s.locator('#kommPanel').waitFor({ state: 'visible' }); ok('Chat mit der Zuständigen geöffnet'); await s.click('#kommZu');
  await s.locator('[data-karte]', { hasText: 'Wegwerf' }).click(); await klick(s, '#kErl', 'Karte erledigt'); await s.click('#schublade #abbrechen'); await s.locator('[data-karte]', { hasText: 'Wegwerf' }).click(); await klick(s, '#kBearb', 'bearbeiten'); await klick(s, '#kLoeschen', 'Karte löschen'); await meldungIst(s, /Gelöscht/, 'Karte gelöscht');
  await klick(s, '#bSpalte', '+ Spalte'); await s.locator('[data-spaltebearb]').last().click(); await s.locator('#schublade').waitFor({ state: 'visible' }); await klick(s, '#spLoeschen', 'Spalte löschen');
  await s.locator('[data-spaltebearb]').first().click(); await schublade(s, { name: 'Offen' }); ok('Spalte umbenannt'); await bild(s, 'b30-planner');
  await navKlick(s, 'planner', 'Boards'); await klick(s, '#neuBoard', '+ Wegwerf-Board'); await schublade(s, { name: 'Wegwerf-Board' }); await s.waitForURL(/#board\/\d+/); await ruhig(s);
  await klick(s, '#bBearb', 'Board bearbeiten'); await klick(s, '#boardArchiv', 'Board archivieren'); await s.waitForURL(/#planner$/); await ruhig(s);
  if (/Wegwerf-Board/.test(await s.textContent('#inhalt'))) throw new Error('archiviertes Board noch sichtbar'); ok('Board archiviert, Abnahme-Board bleibt');
  // Chat im Büro: Kanal, Nachricht, Aufgabe und Mangel aus der Nachricht, meine Aufgaben
  await klick(s, '#kommKnopf', 'Chat öffnen'); if (await s.locator('#kommZurueck').isVisible()) await klick(s, '#kommZurueck', 'Chat öffnet im letzten Gespräch → zur Kanalliste');
  await s.locator('[data-kanal="buchhaltung"]').click(); await ruhig(s);
  await s.fill('#kommText', 'Bitte OP-Liste prüfen'); await klick(s, '#kommSenden', 'Nachricht in Buchhaltung');
  await s.locator('#kommVerlauf [data-aufgabe]').last().click(); await s.locator('#schublade').waitFor({ state: 'visible' }); await wahlText(s, '#schublade [name=zustaendig]', 'ich selbst'); await s.click('#schublade #speichern'); await ruhig(s); await meldungIst(s, /Aufgabe angelegt/, 'Aufgabe aus Nachricht');
  await s.locator('#kommVerlauf [data-mangel]').last().click(); await s.locator('#schublade').waitFor({ state: 'visible' }); await wahlText(s, '#schublade [name=objekt_id]', 'Abnahme-Objekt Kiel'); await s.click('#schublade #speichern'); await ruhig(s); await meldungIst(s, /Mangel erfasst/, 'Mangel aus Nachricht');
  await klick(s, '#kommZurueck', 'zurück zur Kanalliste'); await klick(s, '[data-kansicht="aufgaben"]', 'Meine Aufgaben');
  await s.locator('[data-auf]').first().click(); await ruhig(s); await s.fill('#kommKom', 'erledige ich'); await klick(s, '#kommKomSenden', 'Kommentar aus dem Chat'); await klick(s, '#kommAufErl', 'Aufgabe erledigt'); await meldungIst(s, /Erledigt/, 'Aufgabe im Chat erledigt');
  await s.locator('[data-erl]').first().uncheck(); await ruhig(s); await meldungIst(s, /Wieder offen/, 'Aufgabe wieder offen');
  await klick(s, '[data-kansicht="chats"]', 'Chats'); await klick(s, '#kommPlanner', 'Planner aus dem Chat'); await s.waitForURL(/#planner/); ok('Planner aus dem Chat erreicht');
  await klick(s, '#abmelden', 'Abmelden'); await ctx.close();
  // Mitarbeiter-App: Mängel-Chat mit Objekt → Mangel, zugewiesene Aufgabe abhaken
  const actx = await b.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, hasTouch: true }); const a = await actx.newPage(); await beobachten(a, 'App-Chat');
  await a.goto(URL0 + '/app'); await ruhig(a); await a.click('.kachel:has-text("Anna")'); for (const z of ['1', '1', '1', '1', '✓']) await a.click('[data-z="' + z + '"]'); await a.locator('.app-gruss').waitFor();
  await a.locator('#kommKnopf').waitFor({ timeout: 15000 }); await klick(a, '#kommKnopf', 'App: Chat öffnen'); await a.locator('[data-kanal="maengel"]').click(); await ruhig(a);
  await a.selectOption('#kommObjekt', { index: 1 }); await a.fill('#kommText', 'Papierhandtücher leer (Abnahme)'); await klick(a, '#kommSenden', 'App: Meldung senden'); await meldungIst(a, /Mangel ist am Objekt erfasst/, 'Meldung mit Objekt wird Mangel');
  await klick(a, '#kommZurueck', 'App: zurück'); await klick(a, '[data-kansicht="aufgaben"]', 'App: meine Aufgaben');
  if (!/Streugut bestellen/.test(await a.textContent('#kommInhalt'))) throw new Error('zugewiesene Aufgabe fehlt in der App'); ok('App zeigt die zugewiesene Aufgabe');
  await a.locator('[data-auf]', { hasText: 'Streugut' }).click(); await ruhig(a); await a.locator('[data-punkt]').first().uncheck(); await ruhig(a); ok('App: Checklistenpunkt');
  await klick(a, '#kommAufErl', 'App: Aufgabe erledigt'); await meldungIst(a, /Erledigt/, 'App: erledigt → Büro wird benachrichtigt'); await bild(a, 'a07-chat');
  await actx.close();
}


// Stufe 29.09.2026: Menü in einer Reihe mit Dropdowns, Bewerbermanagement, Objektauswertung, Controlling-Schnittstellen
async function stufe3(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Stufe 3');
  await s.goto(URL0 + '/anmelden'); await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.click('#los'); await s.waitForURL(URL0 + '/'); await ruhig(s);
  // Menü: eine Zeile, Dropdowns
  const mitten = await s.$$eval('#nav > a, #nav > .menue', l => l.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
  if (Math.max.apply(null, mitten) - Math.min.apply(null, mitten) > 10) throw new Error('Menü läuft über mehrere Zeilen: ' + mitten.map(Math.round).join(',')); ok('Hauptmenü in einer Reihe');
  if (await s.locator('#nav a[data-v=bewerber]').isVisible()) throw new Error('Dropdown ist ungefragt offen'); ok('Dropdowns zu, bis man sie öffnet');
  await navKlick(s, 'bewerber', 'Personal ▾ → Bewerber');
  if (!(await s.locator('#nav .menue.aktiv', { hasText: 'Personal' }).count())) throw new Error('Menügruppe nicht als aktiv markiert'); ok('Menügruppe „Personal" aktiv markiert');
  // Bewerber
  await klick(s, '#neuBewerber', '+ Bewerbung erfassen'); await s.selectOption('#schublade [name=beschaeftigungsart]', 'minijob'); await s.selectOption('#schublade [name=quelle]', 'empfehlung'); await s.selectOption('#schublade [name=bewertung]', '4');
  await schublade(s, { vorname: 'Olena', nachname: 'Abnahme', telefon: '0170 1234', position: 'Reinigungskraft', stunden_wunsch: '10', verfuegbar_ab: plus(7) }); await meldungIst(s, /Gespeichert/, 'Bewerbung erfasst');
  await s.waitForURL(/#kandidat\/\d+/); await ruhig(s); ok('Bewerberakte geöffnet');
  await klick(s, '[data-bwstatus="gespraech"]', 'Status Gespräch'); await meldungIst(s, /Status/, 'Status gesetzt');
  await s.fill('#bwNotiz', 'Pünktlich, freundlich'); await klick(s, '#bwNotizNeu', 'Notiz'); if (!/Pünktlich, freundlich/.test(await s.textContent('#inhalt'))) throw new Error('Notiz fehlt im Verlauf'); ok('Notiz im Verlauf');
  const lebenslauf = path.join(DATEN, 'lebenslauf.pdf'); fs.writeFileSync(lebenslauf, '%PDF-1.4\n%Lebenslauf\n');
  await s.setInputFiles('#bwDatei', lebenslauf); await klick(s, '#bwHoch', 'Lebenslauf hochladen'); await meldungIst(s, /Unterlage abgelegt/, 'Unterlage abgelegt');
  await s.setInputFiles('#bwDatei', lebenslauf); await klick(s, '#bwHoch', 'zweite Unterlage'); await meldungIst(s, /Unterlage abgelegt/, 'zweite Unterlage'); await s.locator('[data-bwdokweg]').last().click(); await ruhig(s); await meldungIst(s, /Entfernt/, 'Unterlage entfernt');
  await klick(s, '#bwBearbeiten', 'Bewerbung bearbeiten'); await schublade(s, { sprachen: 'Deutsch, Ukrainisch' }); await meldungIst(s, /Gespeichert/, 'Bewerbung gespeichert');
  await klick(s, '#bwEinstellen', 'Einstellen'); await schublade(s, {}); await meldungIst(s, /Eingestellt/, 'eingestellt → Personalakte'); await s.waitForURL(/#person\/\d+/); await ruhig(s);
  if (!/Olena Abnahme/.test(await s.textContent('#titel')) || !(await s.locator('[data-reiter=dokumente]', { hasText: '(1)' }).count())) throw new Error('Personalakte ohne Name oder Unterlage'); ok('Personalakte mit Bewerbungsunterlage');
  // zweite Bewerbung: Absage, Löschfrist, Board
  await navKlick(s, 'bewerber', 'Bewerber'); await klick(s, '#neuBewerber', '+ zweite Bewerbung'); await schublade(s, { nachname: 'Absage-Test' }); await s.waitForURL(/#kandidat\/\d+/); await ruhig(s); const bid2 = s.url().split('/').pop();
  await klick(s, '[data-bwstatus="absage"]', 'Absage'); await meldungIst(s, /Status/, 'Absage mit Grund'); if (!/Löschung ab/.test(await s.textContent('#inhalt'))) throw new Error('Löschfrist fehlt'); ok('Löschfrist nach Absage angezeigt');
  let d = datenbank(); d.prepare('UPDATE bewerber SET loeschen_ab = ? WHERE id = ?').run(plus(-1), Number(bid2)); d.close();
  await navKlick(s, 'bewerber', 'Bewerber'); await klick(s, '[data-reiter=fristen]', 'Reiter Löschfristen'); await klick(s, '[data-bwloeschen]', 'löschfällige Bewerbung löschen'); await meldungIst(s, /Gelöscht/, 'nach Frist gelöscht');
  await klick(s, '#neuBewerber', '+ dritte Bewerbung'); await schublade(s, { nachname: 'Board-Test' }); await s.waitForURL(/#kandidat\/\d+/); await navKlick(s, 'bewerber', 'Bewerber'); await klick(s, '[data-reiter=board]', 'Bewerber-Board');
  await s.locator('[data-bw]', { hasText: 'Board-Test' }).dragTo(s.locator('[data-bwspalte="kontakt"]')); await meldungIst(s, /Status geändert/, 'Karte auf „Kontakt" gezogen');
  if (!(await s.locator('[data-bwspalte="kontakt"] [data-bw]', { hasText: 'Board-Test' }).count())) throw new Error('Karte nicht in „Kontakt"'); ok('Board zeigt neuen Status'); await bild(s, 'b31-bewerber');
  await s.locator('[data-bw]', { hasText: 'Board-Test' }).click(); await s.waitForURL(/#kandidat\//); await ruhig(s); await klick(s, '[data-bwstatus="absage"]', 'Absage'); await meldungIst(s, /Status/, 'Absage'); await klick(s, '#bwLoeschen', 'Bewerbung sofort löschen'); await meldungIst(s, /Gelöscht/, 'Bewerbung gelöscht'); await s.waitForURL(/#bewerber$/);
  await klick(s, '[data-reiter=liste]', 'Bewerberliste'); await klick(s, '[data-reiter=quellen]', 'Quellen');
  // Objektauswertung
  await navKlick(s, 'objektauswertung', 'Objekte ▾ → Objektauswertung'); await s.locator('#oaErgebnis table').waitFor();
  await s.selectOption('#oaArt', 'jahr'); await ruhig(s); await klick(s, '#oaLaden', 'Jahr anzeigen'); if (!/Abnahme-Objekt Kiel/.test(await s.textContent('#oaErgebnis'))) throw new Error('Objekt fehlt in der Auswertung'); ok('Objekt in der Jahresauswertung');
  await s.locator('[data-sort="db"]').click(); await ruhig(s); ok('nach DB sortiert');
  const [oc] = await Promise.all([s.waitForEvent('download'), s.click('#oaCsv')]); ok('Objektauswertung als CSV: ' + oc.suggestedFilename()); await bild(s, 'b32-objektauswertung');
  await s.locator('[data-oaobj]', { hasText: 'Abnahme-Objekt Kiel' }).click(); await s.waitForURL(/#objekt\//); await s.locator('[data-reiter="auswertung"].aktiv').waitFor({ timeout: 8000 }); await s.locator('#oBereich table').waitFor(); ok('Objekt öffnet im Reiter Auswertung (12 Monate)');
  // Controlling
  await navKlick(s, 'controlling', 'Controlling'); await klick(s, '[data-reiter=einstellungen]', 'Controlling-Einstellungen');
  await s.fill('[name=datev_berater_nr]', '12345'); await s.fill('[name=datev_mandant_nr]', '678'); await s.fill('[name=sepa_glaeubiger_id]', 'DE98ZZZ09999999999'); await klick(s, '#cSpeichern', 'Einstellungen speichern'); await meldungIst(s, /gespeichert/, 'DATEV- und Bank-Einstellungen');
  await klick(s, '[data-reiter=datev]', 'Reiter DATEV'); await s.fill('[name=dv_von]', plus(0).slice(0, 4) + '-01-01'); await s.fill('[name=dv_bis]', plus(0).slice(0, 4) + '-12-31');
  await klick(s, '#dvPruefen', 'Buchungsstapel prüfen'); if (!/Rechnungsbuchungen/.test(await s.textContent('#dvPruef'))) throw new Error('Prüfung ohne Ergebnis'); ok('Buchungsstapel geprüft: ' + (await s.textContent('#dvPruef')).trim());
  const [dv] = await Promise.all([s.waitForEvent('download'), s.click('#dvLaden')]); const dvp = path.join(DATEN, 'extf.csv'); await dv.saveAs(dvp);
  if (!/^"EXTF";700;21;"Buchungsstapel"/.test(fs.readFileSync(dvp, 'latin1'))) throw new Error('Buchungsstapel ohne EXTF-Kopf'); ok('DATEV-Buchungsstapel heruntergeladen (EXTF)');
  await s.fill('[name=lo_monat]', plus(0).slice(0, 7)); await klick(s, '#loPruefen', 'LODAS prüfen');
  const [lo] = await Promise.all([s.waitForEvent('download'), s.click('#loLaden')]); const lop = path.join(DATEN, 'lodas.txt'); await lo.saveAs(lop); if (!/\[Allgemein\]/.test(fs.readFileSync(lop, 'latin1'))) throw new Error('LODAS-Datei falsch'); ok('LODAS-Datei heruntergeladen');
  // Kontoauszug: offene Rechnung aus der OP-Liste, Zahlung mit Rechnungsnummer im Verwendungszweck
  const op = await (await s.request.get(URL0 + '/api/offene-posten')).json(); const p0 = op.posten[0]; if (!p0) throw new Error('keine offene Rechnung für den Kontoauszug');
  const camt = path.join(DATEN, 'auszug.xml'); fs.writeFileSync(camt, '<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt><Ntry><Amt Ccy="EUR">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>' + plus(0) + '</Dt></BookgDt><AcctSvcrRef>ABN-1</AcctSvcrRef><NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Testkunde Abnahme GmbH</Nm></Dbtr></RltdPties><RmtInf><Ustrd>Teilzahlung ' + p0.nummer + '</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry></Stmt></BkToCstmrStmt></Document>');
  await klick(s, '[data-reiter=bank]', 'Reiter Kontoauszug'); await s.setInputFiles('#camtDatei', camt); await klick(s, '#camtLesen', 'Kontoauszug einlesen'); await meldungIst(s, /1 Kontobewegungen gelesen/, 'CAMT gelesen');
  if (!(await s.locator('[data-camt]:checked').count())) throw new Error('Rechnungsnummer nicht erkannt'); ok('Rechnungsnummer erkannt, Zuordnung vorausgewählt'); await bild(s, 'b33-kontoauszug');
  await klick(s, '#camtBuchen', 'Zahlung buchen'); await meldungIst(s, /1 Zahlungen gebucht/, 'Zahlung aus dem Kontoauszug gebucht');
  if (!/schon eingelesen/.test(await s.textContent('#camtErgebnis'))) throw new Error('doppelter Import nicht gesperrt'); ok('gleiche Kontobewegung nicht doppelt buchbar');
  // Debitoren & Mandat, SEPA-Lastschrift
  await klick(s, '[data-reiter=debitoren]', 'Reiter Debitoren & Mandate'); await s.locator('tr', { hasText: 'Testkunde Abnahme' }).locator('[data-deb]').click();
  await s.selectOption('#schublade [name=lastschrift]', 'B2B'); await schublade(s, { debitor_konto: '10100', sepa_iban: 'DE02 1203 0000 0000 2020 51', mandat_datum: '2026-09-01' }); await meldungIst(s, /Gespeichert/, 'Mandat hinterlegt');
  await klick(s, '[data-reiter=lastschrift]', 'Reiter Lastschrift'); await s.locator('[data-ls]').first().waitFor(); ok('offene Rechnungen mit Mandat');
  const [ls] = await Promise.all([s.waitForEvent('download'), s.click('#lsErzeugen')]); const lsp = path.join(DATEN, 'pain008.xml'); await ls.saveAs(lsp);
  if (!/pain\.008\.001\.08/.test(fs.readFileSync(lsp, 'utf8')) || !/<SeqTp>FRST<\/SeqTp>/.test(fs.readFileSync(lsp, 'utf8'))) throw new Error('Lastschriftdatei falsch'); ok('SEPA-Lastschrift pain.008 mit Erst-Lastschrift');
  await klick(s, '[data-reiter=ueberblick]', 'Controlling-Überblick'); await bild(s, 'b34-controlling');
  // Reports: Katalog, jeder Report lädt, Sortieren, Filtern, CSV, Druckansicht, Sprung in die Akte; Bericht Geschäftsführung
  await klick(s, '[data-reiter=reports]', 'Reiter Reports'); const anzahl = await s.locator('[data-report]').count(); if (anzahl < 30) throw new Error('nur ' + anzahl + ' Reports im Katalog'); ok(anzahl + ' Reports im Katalog');
  await s.fill('#repSuche', 'Karteileichen'); await ruhig(s); if (await s.locator('[data-report]').count() !== 1) throw new Error('Suche im Katalog'); ok('Report-Suche');
  await s.locator('[data-report="karteileichen"]').click(); await s.waitForURL(/#report\/karteileichen/); await s.locator('#repTabelle table').waitFor(); ok('Karteileichen geöffnet');
  await s.fill('#repParam [name=tage]', '1'); await klick(s, '#repLaden', 'Karteileichen ab 1 Tag'); await s.locator('[data-rsort="tageSeit"]').click(); await ruhig(s); ok('Report sortiert');
  await s.fill('#repFilter', 'Anna'); await ruhig(s); if (!/Anna/.test(await s.textContent('#repTabelle'))) throw new Error('Filter im Report'); ok('Report gefiltert');
  const [rc] = await Promise.all([s.waitForEvent('download'), s.click('#repCsv')]); ok('Report als CSV: ' + rc.suggestedFilename());
  const [druck] = await Promise.all([s.waitForEvent('popup'), s.click('#repDruck')]); await druck.locator('#tab tbody tr').first().waitFor(); ok('Druckansicht (Querformat) mit Tabelle'); await bild(druck, 'b36-report-druck'); await druck.close();
  await s.locator('[data-rziel]').first().click(); await s.waitForURL(/#person\//); ok('Klick auf Zeile öffnet die Personalakte');
  const kat = await (await s.request.get(URL0 + '/api/reports')).json();
  for (const r of kat) { await s.goto(URL0 + '/#report/' + r.id); await s.locator('#repTabelle table, #repTabelle .leer').first().waitFor({ timeout: 15000 }); }
  ok('alle ' + kat.length + ' Reports in der Oberfläche geladen');
  await s.goto(URL0 + '/#report/planungen'); await s.locator('#repTabelle').waitFor(); await s.selectOption('#repSchnell', 'jahr'); await s.locator('#repTabelle table').waitFor(); ok('Schnellwahl „dieses Jahr"'); await bild(s, 'b37-report-planungen');
  await navKlick(s, 'controlling', 'Controlling'); const [gb] = await Promise.all([s.waitForEvent('popup'), s.click('#cBericht')]); const vm = new Date(); vm.setDate(1); vm.setMonth(vm.getMonth() - 1); const gbu = URL0 + '/api/bericht/geschaeftsfuehrung?monat=' + vm.getFullYear() + '-' + String(vm.getMonth() + 1).padStart(2, '0'); const gbr = await s.request.get(gbu); if (gbr.status() !== 200 || (await gbr.body()).slice(0, 4).toString() !== '%PDF') throw new Error('Bericht Geschäftsführung kein PDF: ' + gbu); ok('Bericht Geschäftsführung (Vormonat) als PDF'); await gb.close();
  // Handy: Menü hinter ☰, Gruppen klappen auf
  await s.setViewportSize({ width: 390, height: 844 }); await ruhig(s);
  if (await s.locator('#nav').isVisible()) throw new Error('Menü am Handy nicht eingeklappt');
  const breit = await s.evaluate(() => Math.max(document.querySelector('.leiste .innen').scrollWidth, document.querySelector('.kopf .innen').scrollWidth) - window.innerWidth);
  if (breit > 1) throw new Error('Kopf am Handy ' + breit + ' px breiter als der Bildschirm'); ok('Handy: Kopf passt in die Breite'); await klick(s, '#navKnopf', 'Handy: Menü öffnen');
  await navKlick(s, 'kunden', 'Handy: Kunden & Finanzen → Kunden'); if (await s.locator('#nav').isVisible()) throw new Error('Menü schließt nach der Wahl nicht'); ok('Handy: Menü schließt nach der Wahl'); await bild(s, 'b35-menue-handy');
  await ctx.close();
}

// Stufe 4: Arbeitsschutz & QM — Register, Dateien, Tabellenzeilen, Unterweisungen, Dienstanweisung, Personalakte, Quittung in der App
// PDF-Link: Ziel im Browser holen (ein PDF-Popup lädt im kopflosen Chrome nie fertig) und auf %PDF prüfen
async function pdfDa(s, link, text) { const href = await link.first().getAttribute('href'); const r = await s.request.get(URL0 + href); const buf = await r.body(); if (r.status() !== 200 || buf.slice(0, 4).toString() !== '%PDF') throw new Error(text + ': kein PDF (' + r.status() + ')'); ok(text + ' (' + Math.round(buf.length / 1024) + ' KB)'); }
async function stufe4(b) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const s = await ctx.newPage(); await beobachten(s, 'Stufe 4');
  await s.goto(URL0 + '/anmelden'); await s.fill('[name=email]', 'buero@abnahme.test'); await s.fill('[name=passwort]', 'Abnahme-2026!'); await s.click('#los'); await s.waitForURL(URL0 + '/'); await ruhig(s);
  const mitten = await s.$$eval('#nav > a, #nav > .menue', l => l.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
  if (Math.max.apply(null, mitten) - Math.min.apply(null, mitten) > 10) throw new Error('Menü mit Verwaltung läuft über mehrere Zeilen'); ok('Menü mit Verwaltung weiter in einer Reihe');
  await navKlick(s, 'sicherheit', 'Verwaltung → Arbeitsschutz & QM'); await textDa(s, '#inhalt', /Wiedervorlage/, 'Übersicht Arbeitsschutz');
  if (await s.locator('[data-register]').count() !== 14) throw new Error('nicht 14 Register in der Übersicht'); ok('14 Register in der Übersicht');
  // Gefahrstoff mit Symbolen, Sicherheitsdatenblatt, Betriebsanweisung (PDF), CSV
  await navKlick(s, 'register-gefahrstoffe', 'Verwaltung → Gefahrstoffe'); await klick(s, '#regNeu2', '+ Ersten Eintrag anlegen');
  const sch = s.locator('#schublade');
  await sch.locator('[name=produkt]').fill('Sanitärreiniger sauer'); await sch.locator('[data-mehr=ghs][value=GHS05]').check(); await sch.locator('[data-mehr=ghs][value=GHS07]').check(); await sch.locator('[name=signalwort]').selectOption('Gefahr');
  await sch.locator('[name=sdb_pruefen]').fill(plus(10)); await sch.locator('[name=betriebsanweisung]').fill('Nie mit chlorhaltigen Mitteln mischen. Handschuhe und Schutzbrille tragen.');
  await klick(s, '#speichern', 'Gefahrstoff anlegen'); await meldungIst(s, /Angelegt/, 'Gefahrstoff angelegt');
  await sch.locator('h2', { hasText: 'Nr.' }).waitFor(); ok('Eintrag öffnet sich zum Weiterbearbeiten');
  const sdb = path.join(DATEN, 'sdb.pdf'); fs.writeFileSync(sdb, '%PDF-1.4\n%Sicherheitsdatenblatt\n');
  await sch.locator('[data-datei=sdb]').setInputFiles(sdb); await meldungIst(s, /Datei hochgeladen/, 'Sicherheitsdatenblatt hochgeladen');
  await sch.locator('a', { hasText: 'ansehen' }).waitFor(); ok('Sicherheitsdatenblatt verlinkt');
  await pdfDa(s, sch.locator('a[href^="/api/register.pdf"]'), 'Betriebsanweisung als PDF');
  await klick(s, '#abbrechen', 'Schublade schließen');
  await s.locator('[data-eintrag]', { hasText: 'Sanitärreiniger sauer' }).click(); await sch.waitFor({ state: 'visible' }); await sch.locator('[name=lagerort]').fill('Lager Neumünster, Regal 2'); await klick(s, '#speichern', 'Gefahrstoff speichern'); await meldungIst(s, /Gespeichert/, 'Gefahrstoff geändert');
  const [gc] = await Promise.all([s.waitForEvent('download'), s.click('a[href^="/api/register.csv"]')]); ok('Gefahrstoffverzeichnis als CSV: ' + gc.suggestedFilename());
  await s.fill('#regSuche', 'gibt-es-nicht'); await ruhig(s); if (await s.locator('[data-eintrag]').count()) throw new Error('Suche filtert nicht'); await s.fill('#regSuche', ''); await ruhig(s); ok('Suche im Register'); await bild(s, 'b40-gefahrstoffe');
  // Gefährdungsbeurteilung mit Tabellenzeilen
  await s.goto(URL0 + '/#register/gbu'); await ruhig(s); await klick(s, '#regNeu', '+ Gefährdungsbeurteilung');
  await sch.locator('[name=titel]').fill('Unterhaltsreinigung Praxis'); await sch.locator('[name=objekt_id]').selectOption({ label: 'Abnahme-Objekt Kiel' });
  const z1 = sch.locator('[data-tabelle=gefaehrdungen] .reg-zeile').first(); await z1.locator('[name=_gefaehrdung]').fill('Rutschgefahr nasser Boden'); await z1.locator('[name=_schwere]').fill('2'); await z1.locator('[name=_massnahme]').fill('Warnschild, rutschfeste Schuhe'); await z1.locator('[name=_frist]').fill(plus(5));
  await klick(s, '[data-zeileplus=gefaehrdungen]', '+ Zeile'); if (await sch.locator('[data-tabelle=gefaehrdungen] .reg-zeile').count() !== 2) throw new Error('Zeile nicht angefügt'); ok('Tabellenzeile angefügt');
  await sch.locator('.reg-weg').last().click(); if (await sch.locator('[data-tabelle=gefaehrdungen] .reg-zeile').count() !== 1) throw new Error('Zeile nicht entfernt'); ok('Tabellenzeile entfernt');
  await klick(s, '#speichern', 'Gefährdungsbeurteilung anlegen'); await meldungIst(s, /Angelegt/, 'Gefährdungsbeurteilung angelegt');
  await sch.locator('h2', { hasText: 'Nr.' }).waitFor(); if (await sch.locator('[name=_gefaehrdung]').first().inputValue() !== 'Rutschgefahr nasser Boden') throw new Error('Tabellenzeile nicht gespeichert'); ok('Tabellenzeile gespeichert');
  await klick(s, '#regLoeschen', 'Gefährdungsbeurteilung löschen'); await meldungIst(s, /Gelöscht/, 'Eintrag gelöscht');
  // Ausgabe Schlüssel an Anna (Quittung folgt in der App)
  await navKlick(s, 'register-ausgaben', 'Verwaltung → Kleidung, Schlüssel, Geräte'); await klick(s, '#regNeu2', '+ Ausgabe');
  await sch.locator('[name=art]').selectOption('schluessel'); await sch.locator('[name=gegenstand]').fill('Generalschlüssel'); await sch.locator('[name=merkmal]').fill('Nr. 7'); await sch.locator('[name=mitarbeiter_id]').selectOption({ label: 'Anna Beispiel' }); await sch.locator('[name=objekt_id]').selectOption({ label: 'Abnahme-Objekt Kiel' }); await sch.locator('[name=ausgabe]').fill(plus(0));
  await klick(s, '#speichern', 'Ausgabe anlegen'); await meldungIst(s, /Angelegt/, 'Schlüsselausgabe eingetragen'); await sch.locator('h2', { hasText: 'Nr.' }).waitFor(); await klick(s, '#abbrechen', 'Schublade zu');
  // Unterweisungen
  await navKlick(s, 'unterweisung', 'Verwaltung → Unterweisungen'); if (await s.locator('[data-thema]').count() < 6) throw new Error('Vorlagen fehlen'); ok('6 Unterweisungs-Vorlagen');
  await klick(s, '[data-reiter=faellig]', 'Reiter Fällig'); await klick(s, '[data-reiter=themen]', 'Reiter Themen');
  await klick(s, '#uwNeu', '+ Unterweisung'); await schublade(s, { titel: 'Scheuersaugmaschine', inhalt: 'Nur nach Einweisung benutzen. Kabel nicht überfahren.', intervall_monate: '12' }); await meldungIst(s, /Gespeichert/, 'Unterweisung angelegt');
  await s.waitForURL(/#unterweisung\/\d+/); await s.locator('#uwBearbeiten').waitFor(); await ruhig(s);
  await klick(s, '#uwBearbeiten', 'Unterweisung bearbeiten'); await schublade(s, { inhalt: 'Nur nach Einweisung benutzen. Kabel nicht überfahren. Akku nur im Lager laden.' }); await meldungIst(s, /Neue Fassung 2/, 'Inhalt geändert → Fassung 2');
  await klick(s, '#uwPraesenz', 'Präsenz eintragen'); await s.locator('[data-tn]').first().check(); await schublade(s, { durch: 'Objektleitung' }); await meldungIst(s, /Teilnehmer eingetragen/, 'Präsenzunterweisung eingetragen');
  await pdfDa(s, s.locator('a[href^="/api/unterweisung.pdf"]'), 'Unterweisungsnachweis als PDF'); await bild(s, 'b41-unterweisung');
  await klick(s, '#uwArchiv', 'Unterweisung archivieren'); await meldungIst(s, /Archiviert/, 'archiviert');
  await s.waitForURL(/#unterweisung$/); await s.locator('#daNeu').waitFor(); await ruhig(s); await klick(s, '#daNeu', '+ Dienstanweisung'); await s.selectOption('#schublade [name=objekt_id]', { label: 'Team Abnahme-Objekt Kiel' });
  await schublade(s, { titel: 'Dienstanweisung Kiel', inhalt: 'Schlüssel liegt im Tresor. Alarmanlage nach Anweisung scharf schalten.' }); await meldungIst(s, /Gespeichert/, 'Dienstanweisung angelegt');
  // Übersicht: Frist anklicken öffnet den Eintrag
  await navKlick(s, 'sicherheit', 'Arbeitsschutz & QM'); await s.locator('[data-frist]').first().click(); await sch.waitFor({ state: 'visible' }); ok('Frist öffnet den Eintrag'); await klick(s, '#abbrechen', 'zu'); await bild(s, 'b42-arbeitsschutz');
  // Personalakte: Reiter Unterweisung & Ausstattung, Eintritts-Checkliste abhaken
  const leute = await (await s.request.get(URL0 + '/api/mitarbeiter')).json(); const anna = leute.find(m => m.name === 'Anna Beispiel');
  await s.request.post(URL0 + '/api/register/checkliste', { data: { art: 'eintritt', mitarbeiter_id: anna.id } });
  await s.goto(URL0 + '/#person/' + anna.id); await ruhig(s); await klick(s, '[data-reiter=schutz]', 'Reiter Unterweisung & Ausstattung'); await s.locator('[data-uw]').first().waitFor(); ok('Unterweisungen in der Akte');
  await s.locator('[data-ausg]').first().click(); await sch.waitFor({ state: 'visible' }); ok('Ausgabe aus der Akte geöffnet'); await klick(s, '#abbrechen', 'zu');
  await klick(s, '#paAusgabe', '+ Ausgabe aus der Akte'); await sch.waitFor({ state: 'visible' }); await klick(s, '#abbrechen', 'zu');
  await s.locator('[data-chk]').first().click(); await sch.locator('[name=_erledigt]').first().waitFor(); await sch.locator('[name=_erledigt]').first().check(); await klick(s, '#speichern', 'Checkliste speichern'); await meldungIst(s, /Gespeichert/, 'Checklistenschritt abgehakt');
  await s.locator('[data-uw]').first().click(); await s.waitForURL(/#unterweisung\/\d+/); ok('Sprung zur Unterweisung');
  // App: Anna liest und bestätigt alles
  const handy = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const a = await handy.newPage(); await beobachten(a, 'App Stufe 4');
  await a.goto(URL0 + '/app'); await ruhig(a); await a.click('.kachel:has-text("Anna")'); for (const z of ['1', '1', '1', '1', '✓']) await a.click('[data-z="' + z + '"]'); await a.locator('.app-gruss').waitFor();
  await klick(a, '#bestaetigenListe', 'App: Bitte lesen und bestätigen'); await bild(a, 'b43-app-bestaetigen');
  let runden = 0;
  while (await a.locator('[data-uwi], [data-agi]').count()) {
    if (++runden > 12) throw new Error('Bestätigen endet nicht');
    const agi = await a.locator('[data-agi]').count(); await a.locator(agi ? '[data-agi]' : '[data-uwi]').first().click(); await a.locator('#gelesen').waitFor();
    if (runden === 1) { await a.click('#bestaetigen'); await meldungIst(a, /Häkchen/, 'App: ohne Häkchen keine Bestätigung'); await bild(a, 'b44-app-quittung'); }
    await a.check('#gelesen'); await a.click('#bestaetigen'); await meldungIst(a, /Bestätigt/, 'App: ' + (agi ? 'Empfang quittiert' : 'Unterweisung bestätigt')); await ruhig(a);
  }
  await a.locator('.app-gruss').waitFor(); if (await a.locator('#bestaetigenListe').count()) throw new Error('nach allem Bestätigen noch offen'); ok('App: alles bestätigt (' + runden + ')');
  await handy.close();
  await s.goto(URL0 + '/#register/ausgaben'); await ruhig(s); if (!/✓/.test(await s.locator('[data-eintrag]', { hasText: 'Generalschlüssel' }).textContent())) throw new Error('Quittung im Büro nicht sichtbar'); ok('Büro sieht die Quittung aus der App');
  await s.goto(URL0 + '/#unterweisung'); await ruhig(s); await klick(s, '[data-reiter=faellig]', 'Fällig nach App-Bestätigung');
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
    const oid = await buero1(b); await app(b, true); await kunde(b, oid); await buero2(b); await abrechnen(b); await erweiterung(b); await stufe3(b); await stufe4(b);
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
