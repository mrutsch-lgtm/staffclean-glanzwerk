// rechnung.js — Rechnung als PDF auf StaffClean-Briefpapier. Briefkopf = Staffsec-Briefpapier 2024 mit StaffClean-Logo
// (graue Schrägfläche, goldenes Band, rechte Spalte Hauptverwaltung/Kontakt/Bank, Absenderzeile — Bild aus
// werkzeuge/briefkopf-bauen.js); darunter der Aufbau der Rechnungen aus der Sicherheitsplanung: Anschriftenfeld,
// Rechnungsdaten rechts, Titel, Anschreiben, Positionstabelle mit Gliederung je Objekt (1 / 1.1), Summen, Schluss,
// GiroCode, Fußzeile mit Firmen-, Register- und Bankdaten auf jeder Seite, „Seite x von y".
//
// Gestellte Rechnungen werden als ZUGFeRD / Factur-X (EN 16931) ausgegeben: factur-x.xml ist eingebettet und die
// Datei trägt die PDF/A-3-Merkmale (eingebettete Schriften, sRGB-Ausgabeprofil, XMP-Metadaten mit Factur-X-Schema,
// /AF-Verknüpfung). Nicht amtlich validiert — vor dem ersten Einsatz einmal durch einen Prüfdienst schicken.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument, PDFName, PDFString, PDFHexString, rgb, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const QR = require('qrcode');
const DB = require('../db');
const ZF = require('../zugferd');

const SCHRIFT = path.join(__dirname, 'schrift');   // Inter als TTF (SIL Open Font License, siehe schrift/OFL.txt) — WOFF2 lässt sich nicht sauber einbetten
const W = 595.28, H = 841.89, L = 59.6, R = W - 42.5, FUSS = 92;
const PX = W / 1189;                       // Maßstab des Briefpapiers (1189 px breit): Positionen von dort übernommen
const GRAU = rgb(0.35, 0.38, 0.37), DUNKEL = rgb(0.08, 0.1, 0.09), LINIE = rgb(0.75, 0.78, 0.76), KOPF = rgb(0.87, 0.88, 0.87), GRUPPE = rgb(0.94, 0.95, 0.94);
const euro = v => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
const zahl = v => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumDe = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '';

async function erzeugen(db, r, opt) {   // opt.muster: Musterrechnung mit Stempel, ohne GiroCode (zum Vorzeigen)
  opt = opt || {};
  const e = DB.einstellungen(db);
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const f = {
    n: await pdf.embedFont(fs.readFileSync(path.join(SCHRIFT, 'Inter_400Regular.ttf')), { subset: false }),
    b: await pdf.embedFont(fs.readFileSync(path.join(SCHRIFT, 'Inter_700Bold.ttf')), { subset: false }),
    i: await pdf.embedFont(fs.readFileSync(path.join(SCHRIFT, 'Inter_400Regular_Italic.ttf')), { subset: false })
  };
  const kopfbild = await pdf.embedPng(fs.readFileSync(path.join(__dirname, 'briefkopf.png')));
  const entwurf = r.status === 'entwurf', storno = !!r.storno_von;
  const nr = r.nummer || 'Entwurf';
  const seiten = [];

  const schreib = (p, t, x, y, o) => { o = o || {}; const font = o.font || f.n, size = o.size || 8.5; t = String(t == null ? '' : t); const bx = o.rechts ? x - font.widthOfTextAtSize(t, size) : x; p.drawText(t, { x: bx, y: y, size: size, font: font, color: o.farbe || DUNKEL }); return font.widthOfTextAtSize(t, size); };
  function umbrechen(t, font, size, breite) {
    const aus = [];
    String(t == null ? '' : t).split('\n').forEach(function (absatz) {
      let zeile = '';
      absatz.split(/\s+/).forEach(function (wort) {
        const probe = zeile ? zeile + ' ' + wort : wort;
        if (font.widthOfTextAtSize(probe, size) <= breite) zeile = probe;
        else { if (zeile) aus.push(zeile); while (font.widthOfTextAtSize(wort, size) > breite) { let k = wort.length; while (k > 1 && font.widthOfTextAtSize(wort.slice(0, k), size) > breite) k--; aus.push(wort.slice(0, k)); wort = wort.slice(k); } zeile = wort; }
      });
      aus.push(zeile);
    });
    return aus;
  }
  function neueSeite() {
    const p = pdf.addPage([W, H]); seiten.push(p);
    // Briefkopf über die volle Breite (graue Schrägfläche mit Logo, goldenes Band) — auf jeder Seite
    p.drawImage(kopfbild, { x: 0, y: H - kopfbild.height * PX, width: W, height: kopfbild.height * PX });
    if (opt.muster) p.drawText('MUSTER – nicht zahlen', { x: 75, y: 230, size: 50, font: f.b, color: rgb(0.85, 0.2, 0.2), opacity: 0.13, rotate: degrees(35) });
    if (entwurf) p.drawText('ENTWURF', { x: 120, y: 330, size: 96, font: f.b, color: rgb(0.85, 0.2, 0.2), opacity: 0.12, rotate: degrees(35) });
    return p;
  }

  // ---------- Seite 1: Kopf
  let p = neueSeite();
  // rechte Spalte wie auf dem Briefpapier: Hauptverwaltung, Kontakt, Bankverbindung (ab 218 px, Zeilenabstand 16,5 px).
  // Sie steht auf derselben Linie wie die Rechnungsdaten darunter (KX) — wie bei den SecPlan-Rechnungen, und die IBAN bleibt im Rand.
  const KX = 362, KW = KX + 78;
  const kx = KX; let ky = H - 225 * PX;
  const kz = (t, fett) => { if (t != null) schreib(p, t, kx, ky, { size: 7.4, font: fett ? f.b : f.n, farbe: GRAU }); ky -= 16.5 * PX; };
  kz('HAUPTVERWALTUNG', true); kz(e.firma_name); kz(e.firma_strasse); kz([e.firma_plz, e.firma_ort].filter(Boolean).join(' ')); kz('');
  if (e.firma_telefon) kz('Tel.: ' + e.firma_telefon); if (e.firma_fax) kz('Fax.: ' + e.firma_fax); if (e.firma_email) kz('E-Mail: ' + e.firma_email); if (e.firma_internet) kz(String(e.firma_internet).replace(/^https?:\/\//, ''));
  if (e.iban) { kz(''); kz('Bankverbindung'); if (e.bank) kz(e.bank); kz('IBAN: ' + String(e.iban).replace(/\s/g, '')); if (e.bic) kz('BIC: ' + e.bic); }   // IBAN ohne Leerzeichen wie auf dem Briefpapier, sonst läuft sie über den Rand
  // Absenderzeile wie auf dem Briefpapier (119 px / 349 px)
  schreib(p, [e.firma_name, e.firma_strasse, [e.firma_plz, e.firma_ort].filter(Boolean).join(' ')].filter(Boolean).join(' | '), 119 * PX, H - 353 * PX, { size: 7.2, farbe: GRAU });
  let ay = H - 386 * PX;
  [r.kunde, r.ansprechpartner, r.anschrift, [r.plz, r.ort].filter(Boolean).join(' '), 'Deutschland'].filter(Boolean).forEach(function (z) { schreib(p, z, L, ay, { size: 10.5 }); ay -= 14; });

  // Rechnungsdaten rechts unter der Briefpapier-Spalte (wie der Infoblock der SecPlan-Rechnung), gleiche linke Kante
  let by = ky - 10;
  const info = (l, w) => { schreib(p, l, KX, by, { size: 8.2 }); if (w != null) umbrechen(w, f.n, 8.2, R - KW).forEach(function (z, i) { if (i) by -= 10.5; schreib(p, z, KW, by, { size: 8.2 }); }); by -= 10.5; };
  const ziel = r.zahlungsziel_tage || Number(e.zahlungsziel_tage) || 14;
  [['Kundennr.:', r.kundennummer], ['Ihre USt-IdNr.:', r.kunde_ust_id], ['Rechnungsnr.:', nr], ['Rechnungsdatum:', r.datum ? datumDe(r.datum) : '—'],
   ['Leistungszeitraum:', datumDe(r.zeitraum_von) + ' - ' + datumDe(r.zeitraum_bis)], ['Zahlungsziel:', storno ? '—' : (r.faellig ? datumDe(r.faellig) + ' / ' : '') + ziel + ' Tage'],
   ['Leitweg-ID:', r.leitweg_id], ['Objekt:', r.objekt]].filter(function (x) { return x[1]; }).forEach(function (x) { info(x[0], x[1]); });

  let y = Math.min(by, ay) - 26;
  schreib(p, (storno ? 'Stornorechnung ' : entwurf ? 'Rechnungsentwurf' : 'Rechnung ') + (entwurf ? '' : nr), L, y, { size: 14, font: f.b });
  y -= 28;
  const absaetze = storno ? ['Sehr geehrte Damen und Herren,', 'hiermit stornieren wir unsere Rechnung ' + (r.storno_nummer || '') + ' vollständig. Der Betrag wird mit offenen Forderungen verrechnet bzw. erstattet.']
    : String(e.rechnung_einleitung || '').split('\n').filter(Boolean);
  absaetze.forEach(function (a) { umbrechen(a, f.n, 9.5, R - L).forEach(function (z) { schreib(p, z, L, y, { size: 9.5 }); y -= 12.5; }); y -= 6; });
  y -= 6;

  // ---------- Positionstabelle
  // Spalten so bemessen, dass auch „12.345,67 EUR" in Betrag und Summe Netto Platz hat (je ≈ 58 pt bei 8 pt)
  const SP = [{ t: 'Pos.', x: L + 2, b: 34 }, { t: 'Beschreibung', x: L + 36, b: 196 }, { t: 'Menge', x: L + 268, r: true }, { t: 'Einheit', x: L + 273 }, { t: 'Betrag', x: L + 381, r: true }, { t: 'MwSt.', x: L + 421, r: true }, { t: 'Summe Netto', x: R - 2, r: true }];
  const tabKopf = () => { p.drawRectangle({ x: L, y: y - 4, width: R - L, height: 14, color: KOPF }); SP.forEach(function (s) { schreib(p, s.t, s.x, y, { size: 7.5, font: f.b, rechts: s.r }); }); y -= 16; };
  // Folgeseiten: Kennzeile „Rechnung … · Fortsetzung" mit Abstand unter dem Briefkopf (Kopf endet 133 pt unter der Oberkante)
  const folgeseite = () => { p = neueSeite(); y = H - 162; schreib(p, (storno ? 'Stornorechnung ' : 'Rechnung ') + nr + ' · Fortsetzung', L, y, { size: 8, farbe: GRAU }); y -= 22; };
  let uebertrag = 0;                                                        // laufende Nettosumme für den Übertrag
  const UNTEN = FUSS + 30;                                                  // Tabellenzeilen enden mindestens 30 pt über der Fußzeile
  const uebertragZeile = (t) => { schreib(p, t, R - 190, y, { size: 8, font: f.b }); schreib(p, euro(uebertrag), R - 2, y, { size: 8, font: f.b, rechts: true }); y -= 14; };
  const platz = (h) => {                                                    // innerhalb der Tabelle: Übertrag unten, Kopf + Übertrag oben
    if (y - h >= UNTEN) return;
    y -= 2; p.drawLine({ start: { x: R - 190, y: y + 10 }, end: { x: R, y: y + 10 }, thickness: 0.4, color: LINIE }); uebertragZeile('Übertrag:');
    folgeseite(); tabKopf(); uebertragZeile('Übertrag von Seite ' + (seiten.length - 1) + ':');
  };
  const platzText = (h) => { if (y - h < FUSS + 18) folgeseite(); };      // nach der Tabelle: neue Seite ohne Tabellenkopf
  tabKopf();
  const gruppen = []; r.positionen.forEach(function (x) { const g = x.gruppe || ''; let gr = gruppen.find(function (z) { return z.name === g; }); if (!gr) { gr = { name: g, pos: [] }; gruppen.push(gr); } gr.pos.push(x); });
  const mitGruppen = gruppen.length > 1 || (gruppen[0] && gruppen[0].name);
  gruppen.forEach(function (g, gi) {
    if (mitGruppen) {
      const zeilen = umbrechen(g.name || 'Weitere Positionen', f.b, 8, R - L - 40);
      const erste = g.pos[0] ? umbrechen(g.pos[0].bezeichnung, f.n, 8, SP[1].b).length * 10 + 4 : 0;
      platz(zeilen.length * 10 + 6 + erste);                                // Objektzeile nie allein unten auf der Seite
      p.drawRectangle({ x: L, y: y - 3 - (zeilen.length - 1) * 10, width: R - L, height: 10 * zeilen.length + 3, color: GRUPPE });
      schreib(p, String(gi + 1), SP[0].x, y, { size: 8, font: f.b }); zeilen.forEach(function (z, i) { schreib(p, z, SP[1].x, y - i * 10, { size: 8, font: f.b }); });
      y -= zeilen.length * 10 + 5;
    }
    g.pos.forEach(function (x, pi) {
      const zeilen = umbrechen(x.bezeichnung, f.n, 8, SP[1].b);
      const hoehe = zeilen.length * 10 + 4;
      platz(hoehe);
      schreib(p, mitGruppen ? (gi + 1) + '.' + (pi + 1) : String(pi + 1), SP[0].x, y, { size: 8 });
      zeilen.forEach(function (z, i) { schreib(p, z, SP[1].x, y - i * 10, { size: 8 }); });
      schreib(p, zahl(x.menge), SP[2].x, y, { size: 8, rechts: true }); schreib(p, x.einheit || '', SP[3].x, y, { size: 8 });
      schreib(p, euro(x.einzelpreis), SP[4].x, y, { size: 8, rechts: true }); schreib(p, zahl(r.ust_prozent) + '%', SP[5].x, y, { size: 8, rechts: true });
      schreib(p, euro(x.betrag), SP[6].x, y, { size: 8, rechts: true });
      y -= hoehe; p.drawLine({ start: { x: L, y: y + 7 }, end: { x: R, y: y + 7 }, thickness: 0.3, color: LINIE });
      uebertrag = Math.round((uebertrag + Number(x.betrag)) * 100) / 100;
    });
  });

  // ---------- Summen
  const rc = r.steuerfall === 'reverse_charge';
  platz(52); y -= 8;
  const summe = (t, w, fett) => { schreib(p, t, R - 190, y, { size: 8.5, font: fett ? f.b : f.n }); schreib(p, w, R - 2, y, { size: 8.5, font: fett ? f.b : f.n, rechts: true }); y -= 13; };
  summe('Summe Netto:', euro(r.netto)); summe(rc ? 'Umsatzsteuer (§ 13b UStG):' : zahl(r.ust_prozent) + ' % MwSt.:', euro(r.ust));
  p.drawLine({ start: { x: R - 190, y: y + 9 }, end: { x: R, y: y + 9 }, thickness: 0.5, color: DUNKEL });
  summe(rc ? 'Rechnungsbetrag:' : 'Summe Brutto:', euro(r.brutto), true);
  y -= 16;
  // Steuerliche Pflichthinweise (§ 14a Abs. 5 und § 14 Abs. 4 Satz 1 Nr. 9 UStG)
  const hinweis = (titel, text) => { const z = umbrechen(text, f.n, 9, R - L); platzText(z.length * 11.5 + 18); schreib(p, titel, L, y, { size: 9, font: f.b }); y -= 12; z.forEach(function (t) { schreib(p, t, L, y, { size: 9 }); y -= 11.5; }); y -= 8; };
  if (rc) hinweis('Steuerschuldnerschaft des Leistungsempfängers', 'Die Umsatzsteuer für diese Reinigungsleistungen schulden Sie als Leistungsempfänger (§ 13b Abs. 2 Nr. 8 und Abs. 5 UStG). Die Rechnung weist deshalb keine Umsatzsteuer aus.' + (r.kunde_ust_id ? ' Ihre USt-IdNr.: ' + r.kunde_ust_id + '.' : ''));
  if (r.privat) hinweis('Hinweis zur Aufbewahrungspflicht', 'Als Privatperson sind Sie gesetzlich verpflichtet, diese Rechnung, einen Zahlungsbeleg oder eine andere beweiskräftige Unterlage zwei Jahre lang aufzubewahren (§ 14b Abs. 1 Satz 5 UStG). Die Frist beginnt mit dem Schluss des Kalenderjahres, in dem die Rechnung ausgestellt wurde.');

  // ---------- Schluss, GiroCode, ZUGFeRD-Hinweis
  const schluss = storno ? ['Sollten Sie Fragen zu dieser Stornorechnung haben, stehen wir Ihnen selbstverständlich gerne zur Verfügung.'] : String(e.rechnung_schluss || '').split('\n').filter(Boolean);
  schluss.concat(['Mit freundlichen Grüßen']).forEach(function (a) { const z = umbrechen(a, f.n, 9.5, R - L); platzText(z.length * 12.5 + 6); z.forEach(function (t) { schreib(p, t, L, y, { size: 9.5 }); y -= 12.5; }); y -= 6; });
  y += 4; schreib(p, e.firma_name, L, y, { size: 9.5, font: f.i }); y -= 24;
  const giro = !storno && !entwurf && !opt.muster && e.iban && r.brutto > 0;
  if (giro) {
    platzText(90);
    const epc = ['BCD', '002', '1', 'SCT', (e.bic || '').replace(/\s/g, ''), String(e.firma_name).slice(0, 70), String(e.iban).replace(/\s/g, ''), 'EUR' + (Math.round(r.brutto * 100) / 100).toFixed(2), '', '', String('Rechnung ' + r.nummer).slice(0, 140)].join('\n');
    const bild = await pdf.embedPng(await QR.toBuffer(epc, { errorCorrectionLevel: 'M', margin: 0, width: 360 }));
    p.drawImage(bild, { x: R - 72, y: y - 62, width: 72, height: 72 });
    schreib(p, 'Zahlung per GiroCode:', L, y, { size: 9.5, font: f.b }); y -= 12.5;
    umbrechen('Der GiroCode enthält alle Zahlungsdaten wie Empfänger, IBAN, BIC sowie den Überweisungsbetrag und den Verwendungszweck. Scannen Sie ihn einfach mit Ihrer Banking-App auf dem Smartphone oder Tablet ein und geben Sie die Zahlung frei.', f.n, 9.5, R - L - 110)
      .forEach(function (t) { schreib(p, t, L, y, { size: 9.5 }); y -= 12.5; });
    y -= 22;
  }
  if (!entwurf) { platzText(20); schreib(p, 'Dieses ist eine ZUGFeRD-Rechnung mit eingebetteter XML-Datei („factur-x.xml").', L, y, { size: 9.5 }); }

  // ---------- Fußzeile und Seitenzahl auf jeder Seite
  const spalten = [
    ['Firmendaten:', [e.firma_name, e.firma_strasse, [e.firma_plz, e.firma_ort].filter(Boolean).join(' '), 'Deutschland']],
    ['', [e.ust_id ? 'USt-IdNr.: ' + e.ust_id : '', e.amtsgericht ? 'Amtsgericht: ' + e.amtsgericht : '', e.handelsregister ? 'Handelsregister: ' + e.handelsregister : '', e.steuernummer ? 'Steuernummer: ' + e.steuernummer : '']],
    ['', [e.geschaeftsfuehrung ? 'Geschäftsführung: ' + e.geschaeftsfuehrung : '', e.gesellschafter ? 'Gesellschafter: ' + e.gesellschafter : '', e.firma_sitz ? 'Unternehmenssitz: ' + e.firma_sitz : '']],
    ['Bankverbindung:', [e.bank ? 'Kreditinstitut: ' + e.bank : '', e.iban ? 'Kontoinhaber: ' + e.firma_name : '', e.iban ? 'IBAN: ' + e.iban : '', e.bic ? 'BIC: ' + e.bic : '']]
  ];
  seiten.forEach(function (s, i) {
    const sx = [L, L + 115, L + 228, L + 350];
    s.drawLine({ start: { x: L, y: FUSS - 6 }, end: { x: R, y: FUSS - 6 }, thickness: 0.6, color: DUNKEL });
    spalten.forEach(function (sp, k) {
      if (sp[0]) schreib(s, sp[0], sx[k], FUSS - 3, { size: 7, font: f.b });
      const breite = (k < 3 ? sx[k + 1] - sx[k] : R - sx[k]) - 6;   // Spaltenbreite: lange Einträge umbrechen statt in die Nachbarspalte laufen
      [].concat.apply([], sp[1].filter(Boolean).map(function (z) { return umbrechen(z, f.n, 6.6, breite); })).slice(0, 6).forEach(function (z, j) { schreib(s, z, sx[k], FUSS - 15 - j * 8.5, { size: 6.6, farbe: GRAU }); });
    });
    schreib(s, nr + ': Seite ' + (i + 1) + ' von ' + seiten.length, R, 26, { size: 6.5, rechts: true, farbe: GRAU });
  });

  // ---------- Metadaten, ZUGFeRD, PDF/A-3
  const jetzt = new Date(Math.floor(Date.now() / 1000) * 1000), titel = (storno ? 'Stornorechnung ' : 'Rechnung ') + nr;
  pdf.setTitle(titel); pdf.setAuthor(e.firma_name); pdf.setCreator('Glanzwerk'); pdf.setProducer('Glanzwerk (pdf-lib)'); pdf.setCreationDate(jetzt); pdf.setModificationDate(jetzt); pdf.setLanguage('de-DE');
  const ctx = pdf.context, katalog = pdf.catalog;
  if (!entwurf) {
    const daten = Buffer.from(ZF.xml(db, r), 'utf8');
    const strom = ctx.flateStream(daten, { Type: 'EmbeddedFile', Subtype: 'text/xml', Params: { ModDate: PDFString.fromDate(jetzt), Size: daten.length } });
    const stromRef = ctx.register(strom);
    const spec = ctx.register(ctx.obj({ Type: 'Filespec', F: PDFString.of('factur-x.xml'), UF: PDFHexString.fromText('factur-x.xml'), EF: { F: stromRef, UF: stromRef }, Desc: PDFString.of('Factur-X / ZUGFeRD Rechnungsdaten'), AFRelationship: 'Alternative' }));
    katalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: { Names: [PDFString.of('factur-x.xml'), spec] } }));
    katalog.set(PDFName.of('AF'), ctx.obj([spec]));
  }
  const icc = fs.readFileSync(path.join(__dirname, 'sRGB_IEC61966-2-1.icc'));
  const iccRef = ctx.register(ctx.flateStream(icc, { N: 3 }));
  katalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.obj({ Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), Info: PDFString.of('sRGB IEC61966-2.1'), DestOutputProfile: iccRef })]));
  const xmp = Buffer.from(xmpText(titel, e.firma_name, jetzt.toISOString().replace(/\.\d+Z$/, 'Z'), !entwurf), 'utf8');
  katalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML', Length: xmp.length })));
  const kennung = crypto.createHash('md5').update(titel + jetzt.toISOString()).digest('hex');
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(kennung), PDFHexString.of(kennung)]);
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function xmpText(titel, autor, datum, zugferd) {
  const x = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const eig = (n, typ, besch) => '<rdf:li rdf:parseType="Resource"><pdfaProperty:name>' + n + '</pdfaProperty:name><pdfaProperty:valueType>' + typ + '</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>' + besch + '</pdfaProperty:description></rdf:li>';
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>\n' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + x(titel) + '</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>' + x(autor) + '</rdf:li></rdf:Seq></dc:creator></rdf:Description>\n' +
    '<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>Glanzwerk (pdf-lib)</pdf:Producer></rdf:Description>\n' +
    '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>Glanzwerk</xmp:CreatorTool><xmp:CreateDate>' + datum + '</xmp:CreateDate><xmp:ModifyDate>' + datum + '</xmp:ModifyDate></rdf:Description>\n' +
    (zugferd ? '<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">' +
      '<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix><pdfaSchema:property><rdf:Seq>' +
      eig('DocumentFileName', 'Text', 'name of the embedded XML invoice file') + eig('DocumentType', 'Text', 'INVOICE') + eig('Version', 'Text', 'The actual version of the Factur-X XML schema') + eig('ConformanceLevel', 'Text', 'The conformance level of the embedded Factur-X data') +
      '</rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>\n' +
      '<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>\n' : '') +
    '</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>';
}

module.exports = { erzeugen };
