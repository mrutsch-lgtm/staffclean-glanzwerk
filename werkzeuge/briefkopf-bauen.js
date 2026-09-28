// briefkopf-bauen.js — baut den StaffClean-Briefkopf aus dem Staffsec-Briefpapier 2024 (Manuel 28.09.2026:
// „mit dem Briefpapier von Staffsec machen und das oben anpassen zu StaffClean mit korrektem Logo").
//
// Übernommen wird nur die Gestaltung (graue Schrägfläche, goldenes Band). Das Staffsec-Logo wird mit dem
// Grau der Fläche überdeckt, darauf kommt das StaffClean-Logo in der Original-Fassung (Schrift weiß/gold,
// gedacht für den dunklen Grund). Die Staffsec-Texte (rechte Spalte, Absenderzeile) werden entfernt —
// Glanzwerk schreibt sie selbst mit den StaffClean-Daten. Ergebnis: lib/pdf/briefkopf.png.
//
// Einmal ausführen, wenn sich Logo oder Vorlage ändern:
//   node werkzeuge/briefkopf-bauen.js <Briefpapier.jpeg> <StaffClean-Logo.png>
'use strict';
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT_PFAD || 'E:/Prozessoptimierung Staffsec/tagesgeschaeft/secplan/studytool/node_modules/playwright';
const { chromium } = require(PW);

const vorlage = process.argv[2], logo = process.argv[3];
if (!vorlage || !logo) { console.log('Aufruf: node werkzeuge/briefkopf-bauen.js <Briefpapier.jpeg> <Logo.png>'); process.exit(2); }
(async function () {
  const b = await chromium.launch(); const p = await b.newPage();
  const png = await p.evaluate(async function (a) {
    const lade = async s => { const i = new Image(); i.src = s; await i.decode(); return i; };
    const bp = await lade(a.vorlage), lg = await lade(a.logo);
    const H = 266;                                             // Kopf bis knapp unter die graue Fläche (endet bei 263 px)
    const c = document.createElement('canvas'); c.width = bp.width; c.height = H; const x = c.getContext('2d');
    x.drawImage(bp, 0, 0);
    // 1) Staffsec-Logo überdecken: Polygon entlang der gemessenen Schrägkante (y=22 → x≈554, y=262 → x≈312)
    x.fillStyle = 'rgb(120,124,125)';
    x.beginPath(); x.moveTo(0, 21); x.lineTo(552, 21); x.lineTo(314, 263); x.lineTo(0, 263); x.closePath(); x.fill();
    // 2) Staffsec-Texte der rechten Spalte entfernen (beginnen bei y≈210)
    x.fillStyle = '#ffffff'; x.fillRect(880, 200, bp.width - 880, H - 200);
    // 3) StaffClean-Logo: sichtbarer Teil der 2160er-Vorlage (x ≈ 184–1905, y ≈ 707–1372) mit Rand, eingepasst wie das Staffsec-Logo
    const sx = 150, sy = 630, sw = 1830, sh = 810, zb = 350, zh = zb * sh / sw;
    x.drawImage(lg, sx, sy, sw, sh, 28, 132 - zh / 2, zb, zh);
    return c.toDataURL('image/png');
  }, { vorlage: 'data:image/jpeg;base64,' + fs.readFileSync(vorlage).toString('base64'), logo: 'data:image/png;base64,' + fs.readFileSync(logo).toString('base64') });
  const ziel = path.join(__dirname, '..', 'lib', 'pdf', 'briefkopf.png');
  fs.writeFileSync(ziel, Buffer.from(png.split(',')[1], 'base64'));
  console.log('geschrieben: ' + ziel);
  await b.close();
})();
