// brief.js — Schreiben auf StaffClean-Briefpapier (derselbe Kopf, dieselbe rechte Spalte und Fußzeile wie die Rechnung):
// Mahnungen und der Personalfragebogen. Ein Aufbau für beide: Anschrift, Daten rechts, Titel, Absätze, Tabellen,
// Unterschriftszeilen. Seitenumbruch mit Kennzeile „… · Fortsetzung", „Seite x von y".
'use strict';
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const DB = require('../db');
const MW = require('../mahnwesen');

const SCHRIFT = path.join(__dirname, 'schrift');
const W = 595.28, H = 841.89, L = 59.6, R = W - 42.5, FUSS = 92, PX = W / 1189;
const GRAU = rgb(0.35, 0.38, 0.37), DUNKEL = rgb(0.08, 0.1, 0.09), LINIE = rgb(0.75, 0.78, 0.76), KOPF = rgb(0.87, 0.88, 0.87), GRUPPE = rgb(0.94, 0.95, 0.94);
const euro = v => (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
const datumDe = d => d ? String(d).slice(0, 10).split('-').reverse().join('.') : '';

// Aufbau: { kennung, empfaenger: [Zeilen], spalte: [[Bezeichnung, Wert] | Überschrift], titel, bloecke: [...] }
// Block: { absatz } · { tabelle: { spalten: [{ t, b, rechts }], zeilen: [[…]], summen: [[t, w, fett]] } } · { felder: { titel, paare: [[t, w]] } }
//        · { unterschrift: [Beschriftung, …] } · { abstand }
async function brief(db, a) {
  const e = DB.einstellungen(db);
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const f = { n: await pdf.embedFont(fs.readFileSync(path.join(SCHRIFT, 'Inter_400Regular.ttf')), { subset: false }), b: await pdf.embedFont(fs.readFileSync(path.join(SCHRIFT, 'Inter_700Bold.ttf')), { subset: false }), i: await pdf.embedFont(fs.readFileSync(path.join(SCHRIFT, 'Inter_400Regular_Italic.ttf')), { subset: false }) };
  const kopfbild = await pdf.embedPng(fs.readFileSync(path.join(__dirname, 'briefkopf.png')));
  const seiten = [];
  const schreib = (p, t, x, y, o) => { o = o || {}; const font = o.font || f.n, size = o.size || 8.5; t = String(t == null ? '' : t); p.drawText(t, { x: o.rechts ? x - font.widthOfTextAtSize(t, size) : x, y: y, size: size, font: font, color: o.farbe || DUNKEL }); };
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
  const neueSeite = () => { const p = pdf.addPage([W, H]); seiten.push(p); p.drawImage(kopfbild, { x: 0, y: H - kopfbild.height * PX, width: W, height: kopfbild.height * PX }); return p; };
  let p = neueSeite();
  // rechte Spalte wie auf der Rechnung
  const KX = 458, KR = 579, KG = 7.4, KZ = 16.5 * PX; let ky = H - 225 * PX;
  const kz = (t, fett) => { if (t) umbrechen(t, fett ? f.b : f.n, KG, KR - KX).forEach(function (z, i) { if (i) ky -= KZ; schreib(p, z, KX, ky, { size: KG, font: fett ? f.b : f.n, farbe: GRAU }); }); ky -= KZ; };
  const kw = (l, w) => { if (!w) return; const zeile = l + ' ' + w; if (f.n.widthOfTextAtSize(zeile, KG) <= KR - KX) return kz(zeile); schreib(p, l, KX, ky, { size: KG, farbe: GRAU }); ky -= KZ; umbrechen(w, f.n, KG, KR - KX).forEach(function (z) { schreib(p, z, KX, ky, { size: KG, farbe: GRAU }); ky -= KZ; }); };
  kz('HAUPTVERWALTUNG', true); kz(e.firma_name); kz(e.firma_strasse); kz([e.firma_plz, e.firma_ort].filter(Boolean).join(' ')); ky -= KZ;
  kw('Tel.:', e.firma_telefon); kw('E-Mail:', e.firma_email); kz(String(e.firma_internet || '').replace(/^https?:\/\//, ''));
  if (a.bank !== false && e.iban) { ky -= KZ; kz('Bankverbindung'); kz(e.bank); kw('IBAN:', String(e.iban).replace(/\s/g, '')); kw('BIC:', e.bic); }
  if (a.spalte && a.spalte.length) { ky -= KZ; a.spalte.forEach(function (s) { if (typeof s === 'string') kz(s, true); else kw(s[0], s[1]); }); }
  const by = ky + KZ;
  let ay = H - 386 * PX;
  if (a.empfaenger) {
    schreib(p, [e.firma_name, e.firma_strasse, [e.firma_plz, e.firma_ort].filter(Boolean).join(' ')].filter(Boolean).join(' | '), 119 * PX, H - 353 * PX, { size: 7.2, farbe: GRAU });
    a.empfaenger.filter(Boolean).forEach(function (z) { umbrechen(z, f.n, 10.5, KX - L - 14).forEach(function (t) { schreib(p, t, L, ay, { size: 10.5 }); ay -= 14; }); });
  }
  let y = Math.min(by, ay) - 26;
  umbrechen(a.titel, f.b, 14, R - L).forEach(function (z) { schreib(p, z, L, y, { size: 14, font: f.b }); y -= 18; });
  y -= 10;
  const folge = () => { p = neueSeite(); y = H - 162; schreib(p, a.kennung + ' · Fortsetzung', L, y, { size: 8, farbe: GRAU }); y -= 22; };
  const platz = h => { if (y - h < FUSS + 18) { folge(); return true; } return false; };

  (a.bloecke || []).forEach(function (b) {
    if (b.abstand) { y -= b.abstand; return; }
    if (b.absatz != null) { const z = umbrechen(b.absatz, b.fett ? f.b : f.n, 9.5, R - L); z.forEach(function (t) { platz(13); schreib(p, t, L, y, { size: 9.5, font: b.fett ? f.b : (b.kursiv ? f.i : f.n) }); y -= 12.5; }); y -= 6; return; }
    if (b.tabelle) {
      const T = b.tabelle, xs = []; let x = L + 2; T.spalten.forEach(function (s) { xs.push(s.rechts ? x + s.b - 4 : x); x += s.b; });
      const kopf = () => { p.drawRectangle({ x: L, y: y - 4, width: R - L, height: 14, color: KOPF }); T.spalten.forEach(function (s, i) { schreib(p, s.t, xs[i], y, { size: 7.5, font: f.b, rechts: s.rechts }); }); y -= 16; };
      platz(40); kopf();
      T.zeilen.forEach(function (z) {
        const teile = z.map(function (w, i) { return T.spalten[i].rechts ? [String(w)] : umbrechen(w, f.n, 8, T.spalten[i].b - 8); }), hoehe = Math.max.apply(null, teile.map(function (t) { return t.length; })) * 10 + 4;
        if (platz(hoehe)) kopf();
        teile.forEach(function (t, i) { t.forEach(function (s, k) { schreib(p, s, xs[i], y - k * 10, { size: 8, rechts: T.spalten[i].rechts }); }); });
        y -= hoehe; p.drawLine({ start: { x: L, y: y + 7 }, end: { x: R, y: y + 7 }, thickness: 0.3, color: LINIE });
      });
      if (T.summen) { platz(T.summen.length * 13 + 10); y -= 6; T.summen.forEach(function (s) { if (s[2]) p.drawLine({ start: { x: R - 220, y: y + 10 }, end: { x: R, y: y + 10 }, thickness: 0.5, color: DUNKEL }); schreib(p, s[0], R - 220, y, { size: 8.5, font: s[2] ? f.b : f.n }); schreib(p, s[1], R - 2, y, { size: 8.5, font: s[2] ? f.b : f.n, rechts: true }); y -= 13; }); }
      y -= 12; return;
    }
    if (b.felder) {   // Formularblock: Überschrift, darunter Bezeichnung | Wert in zwei Spalten; leere Werte als Schreiblinie
      platz(40); p.drawRectangle({ x: L, y: y - 4, width: R - L, height: 14, color: GRUPPE }); schreib(p, b.felder.titel, L + 4, y, { size: 8.5, font: f.b }); y -= 18;
      b.felder.paare.forEach(function (fw) {
        const z = umbrechen(fw[1] || '', f.n, 9, (R - L) * 0.58), zl = umbrechen(fw[0], f.n, 7.8, (R - L) * 0.38), h = Math.max(z.length * 11, zl.length * 9.5) + 6;
        platz(h);
        zl.forEach(function (t, k) { schreib(p, t, L + 4, y - k * 9.5, { size: 7.8, farbe: GRAU }); });
        const wx = L + (R - L) * 0.4;
        if (fw[1]) z.forEach(function (t, k) { schreib(p, t, wx, y - k * 11, { size: 9 }); });
        p.drawLine({ start: { x: wx, y: y - h + 8 }, end: { x: R, y: y - h + 8 }, thickness: 0.3, color: LINIE });
        y -= h;
      });
      y -= 10; return;
    }
    if (b.unterschrift) {
      platz(70); y -= 34;
      const breite = (R - L - 30) / b.unterschrift.length;
      b.unterschrift.forEach(function (t, i) { const x = L + i * (breite + 30); p.drawLine({ start: { x: x, y: y }, end: { x: x + breite, y: y }, thickness: 0.5, color: DUNKEL }); schreib(p, t, x, y - 11, { size: 7.5, farbe: GRAU }); });
      y -= 26; return;
    }
  });

  // Fußzeile wie auf der Rechnung
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
      if (sp[0] && sp[1].some(Boolean)) schreib(s, sp[0], sx[k], FUSS - 3, { size: 7, font: f.b });
      const breite = (k < 3 ? sx[k + 1] - sx[k] : R - sx[k]) - 6;
      [].concat.apply([], sp[1].filter(Boolean).map(function (z) { return umbrechen(z, f.n, 6.6, breite); })).slice(0, 6).forEach(function (z, j) { schreib(s, z, sx[k], FUSS - 15 - j * 8.5, { size: 6.6, farbe: GRAU }); });
    });
    schreib(s, a.kennung + ': Seite ' + (i + 1) + ' von ' + seiten.length, R, 26, { size: 6.5, rechts: true, farbe: GRAU });
  });
  pdf.setTitle(a.titel); pdf.setAuthor(e.firma_name); pdf.setCreator('Glanzwerk'); pdf.setProducer('Glanzwerk (pdf-lib)'); pdf.setLanguage('de-DE');
  return Buffer.from(await pdf.save());
}

// ---------- Mahnung
async function mahnung(db, id) {
  const m = MW.voll(db, id); if (!m) throw new Error('Mahnung nicht gefunden');
  const r = m.rechnung, e = DB.einstellungen(db);
  const zeilen = [['Rechnung ' + r.nummer + ' vom ' + datumDe(r.datum) + (r.betreff ? ' (' + r.betreff + ')' : ''), datumDe(r.faellig), euro(r.brutto)]];
  const summen = [];
  if (r.bezahlt_summe > 0) summen.push(['abzüglich Zahlungen:', '– ' + euro(Math.min(r.bezahlt_summe, r.brutto))]);
  summen.push(['Offener Rechnungsbetrag:', euro(m.offen)]);
  const bisherG = m.bisher.reduce(function (a, x) { return a + (x.gebuehr || 0); }, 0), bisherP = m.bisher.reduce(function (a, x) { return a + (x.pauschale || 0); }, 0);
  if (bisherG) summen.push(['Mahngebühren aus früheren Mahnungen:', euro(bisherG)]);
  if (m.gebuehr) summen.push(['Mahngebühr dieser Mahnung:', euro(m.gebuehr)]);
  if (bisherP || m.pauschale) summen.push(['Verzugspauschale (§ 288 Abs. 5 BGB):', euro(bisherP + m.pauschale)]);
  if (m.zinsen) summen.push(['Verzugszinsen ' + String(m.zins_prozent).replace('.', ',') + ' % p. a. ab ' + datumDe(m.zins_ab) + ':', euro(m.zinsen)]);
  summen.push(['Zu zahlender Betrag:', euro(m.gesamt), true]);
  const text = e['mahn_text_' + m.stufe] || '';
  return brief(db, {
    kennung: m.titel + ' ' + r.nummer,
    empfaenger: [r.kunde, r.ansprechpartner, r.anschrift, [r.plz, r.ort].filter(Boolean).join(' '), 'Deutschland'],
    spalte: [m.titel.toUpperCase(), ['Datum:', datumDe(m.datum)], ['Rechnungsnr.:', r.nummer], ['Kundennr.:', r.kundennummer], ['Zahlbar bis:', datumDe(m.frist)]],
    titel: m.titel + ' zur Rechnung ' + r.nummer,
    bloecke: [
      { absatz: 'Sehr geehrte Damen und Herren,' },
      { absatz: text },
      { tabelle: { spalten: [{ t: 'Beleg', b: 300 }, { t: 'Fällig seit', b: 80 }, { t: 'Betrag', b: 110, rechts: true }], zeilen: zeilen, summen: summen } },
      { absatz: 'Bitte überweisen Sie den Betrag von ' + euro(m.gesamt) + ' bis zum ' + datumDe(m.frist) + ' auf unser Konto' + (e.iban ? ' ' + String(e.iban).replace(/\s/g, '') + (e.bank ? ' bei der ' + e.bank : '') : '') + ' und geben Sie als Verwendungszweck die Rechnungsnummer ' + r.nummer + ' an.' },
      { absatz: m.stufe === 0 ? 'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.' : 'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos. Bei Fragen zur Rechnung sind wir gern für Sie da.' },
      { absatz: 'Mit freundlichen Grüßen' }, { absatz: e.firma_name, kursiv: true }
    ]
  });
}

// ---------- Personalfragebogen (ausgefüllt aus der Personalakte oder leer zum Ausfüllen)
async function personalfragebogen(db, m) {
  const P = require('../personal'), e = DB.einstellungen(db);
  const wert = f => { const v = m ? m[f.n] : null; if (v == null || v === '') return ''; if (f.typ === 'date') return datumDe(v); if (f.o) { const o = f.o.find(function (x) { return String(x[0]) === String(v); }); return o ? o[1] : v; } return String(v).replace('.', ','); };
  const bloecke = [{ absatz: 'Bitte vollständig und in Druckschrift ausfüllen. Die Angaben brauchen wir für die Anmeldung zur Sozialversicherung, die Lohnabrechnung und — bei Staatsangehörigkeit außerhalb der EU — für die Prüfung der Arbeitserlaubnis. Änderungen (Anschrift, Bankverbindung, Steuerklasse, Familienstand) bitte sofort mitteilen.' }];
  P.GRUPPEN.filter(function (g) { return g !== 'Sonstiges'; }).forEach(function (g) {
    bloecke.push({ felder: { titel: g, paare: P.FELDER.filter(function (f) { return f.g === g; }).map(function (f) { return [f.t + (f.pflicht ? ' *' : ''), wert(f)]; }) } });
  });
  bloecke.push({ felder: { titel: 'Beschäftigung bei StaffClean', paare: [['Personalnummer', m ? m.personalnummer || '' : ''], ['Wochenstunden', m && m.wochenstunden ? String(m.wochenstunden).replace('.', ',') : ''], ['Lohngruppe', m ? m.lohngruppe || '' : ''], ['Telefon', m ? m.telefon || '' : '']] } });
  bloecke.push({ absatz: '* Pflichtangabe. Beizufügen: Kopie Personalausweis / Pass, bei Nicht-EU-Staatsangehörigkeit der Aufenthaltstitel, Nachweis der Krankenversicherung, ggf. Nachweis über weitere Beschäftigungen.' });
  bloecke.push({ absatz: 'Ich versichere, dass die Angaben vollständig und richtig sind. Mir ist bekannt, dass unrichtige Angaben arbeits- und sozialversicherungsrechtliche Folgen haben können. Meine Daten werden zur Durchführung des Beschäftigungsverhältnisses verarbeitet (Art. 6 Abs. 1 lit. b und c DSGVO, § 26 BDSG).' });
  bloecke.push({ unterschrift: ['Ort, Datum', 'Unterschrift Mitarbeiter/in', 'Unterschrift ' + (e.firma_name || 'Arbeitgeber')] });
  return brief(db, { kennung: 'Personalfragebogen' + (m ? ' ' + m.name : ''), bank: false, titel: 'Personalfragebogen' + (m ? ' – ' + m.name : ''), spalte: m ? ['PERSONAL', ['Personalnr.:', m.personalnummer], ['Eintritt:', datumDe(m.eintritt)]] : [], bloecke: bloecke });
}

module.exports = { brief, mahnung, personalfragebogen };
