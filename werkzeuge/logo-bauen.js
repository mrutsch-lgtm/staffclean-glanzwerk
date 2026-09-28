// logo-bauen.js — baut aus der Markenvorlage (E:\StaffClean-Gehirn\marke\2026-09-28_Logo_Glanzwerk.jpg, ein Bild mit drei
// Varianten) die Dateien der Oberfläche: Logo für hellen Grund, Logo für dunklen Grund, App-Icon in 512/192/180 px und
// Favicon 32/16. Der einfarbige Hintergrund wird freigestellt (Alpha aus dem Abstand zur Grundfarbe, Farbe entmischt),
// die Ränder werden beschnitten. Aufruf: node werkzeuge/logo-bauen.js [Vorlage]
'use strict';
const fs = require('fs'), path = require('path');
const PW = process.env.PLAYWRIGHT_PFAD || 'E:/Prozessoptimierung Staffsec/tagesgeschaeft/secplan/studytool/node_modules/playwright';
const { chromium } = require(PW);
const VORLAGE = process.argv[2] || 'E:/StaffClean-Gehirn/marke/2026-09-28_Logo_Glanzwerk.jpg';
const ZIEL = path.join(__dirname, '..', 'web', 'bilder');

(async function () {
  const b = await chromium.launch(), s = await b.newPage();
  const url = 'data:image/jpeg;base64,' + fs.readFileSync(VORLAGE).toString('base64');
  const aus = await s.evaluate(async function (url) {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const alles = x.getImageData(0, 0, c.width, c.height);
    const px = (i, j) => { const k = (j * c.width + i) * 4; return [alles.data[k], alles.data[k + 1], alles.data[k + 2]]; };
    // Grundfarbe aus einer ruhigen Fläche mitteln
    const grund = (x0, y0) => { const s = [0, 0, 0]; let n = 0; for (let j = y0; j < y0 + 20; j++) for (let i = x0; i < x0 + 20; i++) { const p = px(i, j); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; } return s.map(function (v) { return v / n; }); };
    // Ausschnitt freistellen: Alpha = größter Kanalabstand zur Grundfarbe (unter „boden" = Rauschen), Farbe entmischt
    // nurAussen: nur Grund freistellen, der vom Rand aus erreichbar ist (Flutfüllung) — beim App-Icon hat das „G" im
    // Quadrat dieselbe Farbe wie der Hintergrund und muss stehen bleiben
    function frei(r, g, boden, voll, nurAussen) {
      const d = x.getImageData(r[0], r[1], r[2], r[3]), o = d.data;
      let aussen = null;
      if (nurAussen) {
        aussen = new Uint8Array(r[2] * r[3]); const stapel = [];
        const nah = p => Math.max(Math.abs(o[p * 4] - g[0]), Math.abs(o[p * 4 + 1] - g[1]), Math.abs(o[p * 4 + 2] - g[2])) < voll;
        for (let i = 0; i < r[2]; i++) { stapel.push(i, (r[3] - 1) * r[2] + i); } for (let j = 0; j < r[3]; j++) { stapel.push(j * r[2], j * r[2] + r[2] - 1); }
        while (stapel.length) { const p = stapel.pop(); if (aussen[p] || !nah(p)) continue; aussen[p] = 1; const i = p % r[2], j = (p - i) / r[2]; if (i > 0) stapel.push(p - 1); if (i < r[2] - 1) stapel.push(p + 1); if (j > 0) stapel.push(p - r[2]); if (j < r[3] - 1) stapel.push(p + r[2]); }
      }
      for (let k = 0; k < o.length; k += 4) {
        if (aussen && !aussen[k / 4]) { o[k + 3] = 255; continue; }
        const diff = Math.max(Math.abs(o[k] - g[0]), Math.abs(o[k + 1] - g[1]), Math.abs(o[k + 2] - g[2]));
        let a = diff <= boden ? 0 : Math.min(1, (diff - boden) / (voll - boden));
        if (a > 0 && a < 1) for (let q = 0; q < 3; q++) o[k + q] = Math.max(0, Math.min(255, Math.round(g[q] + (o[k + q] - g[q]) / a)));
        o[k + 3] = Math.round(a * 255);
      }
      // beschneiden auf die sichtbaren Pixel
      let x1 = r[2], y1 = r[3], x2 = 0, y2 = 0;
      for (let j = 0; j < r[3]; j++) for (let i = 0; i < r[2]; i++) if (o[(j * r[2] + i) * 4 + 3] > 8) { if (i < x1) x1 = i; if (i > x2) x2 = i; if (j < y1) y1 = j; if (j > y2) y2 = j; }
      const t = document.createElement('canvas'); t.width = r[2]; t.height = r[3]; t.getContext('2d').putImageData(d, 0, 0);
      const e = document.createElement('canvas'); e.width = x2 - x1 + 1; e.height = y2 - y1 + 1; e.getContext('2d').drawImage(t, x1, y1, e.width, e.height, 0, 0, e.width, e.height);
      return e;
    }
    const png = (cv, breite, rand) => { const h = Math.round(cv.height * breite / cv.width), z = document.createElement('canvas'); rand = rand || 0; z.width = breite + 2 * rand; z.height = h + 2 * rand; const zx = z.getContext('2d'); zx.imageSmoothingQuality = 'high'; zx.drawImage(cv, rand, rand, breite, h); return z.toDataURL('image/png'); };
    const quadrat = (cv, seite) => { const z = document.createElement('canvas'); z.width = z.height = seite; const zx = z.getContext('2d'); zx.imageSmoothingQuality = 'high'; const f = seite / Math.max(cv.width, cv.height); zx.drawImage(cv, (seite - cv.width * f) / 2, (seite - cv.height * f) / 2, cv.width * f, cv.height * f); return z.toDataURL('image/png'); };
    const hell = grund(20, 20), dunkel = grund(20, 1000);
    const aufHell = frei([150, 200, 1260, 310], hell, 22, 150);          // oberes Feld: Logo für hellen Grund
    const aufDunkel = frei([120, 700, 860, 250], dunkel, 22, 150);       // unteres Feld: Logo für dunklen Grund
    const icon = frei([1135, 700, 265, 262], dunkel, 30, 110, true);           // App-Icon (abgerundetes Quadrat)
    const zeichen = frei([150, 700, 190, 240], dunkel, 22, 150);         // nur das „G" (für kleine Flächen)
    return { hell: png(aufHell, 1200), dunkel: png(aufDunkel, 1200), icon512: quadrat(icon, 512), icon192: quadrat(icon, 192), icon180: quadrat(icon, 180), fav32: quadrat(icon, 32), zeichen: png(zeichen, 256), masse: [aufHell.width, aufHell.height, aufDunkel.width, aufDunkel.height, icon.width, icon.height] };
  }, url);
  const schreib = (n, d) => fs.writeFileSync(path.join(ZIEL, n), Buffer.from(d.split(',')[1], 'base64'));
  schreib('glanzwerk-logo.png', aus.hell); schreib('glanzwerk-logo-hell.png', aus.dunkel); schreib('glanzwerk-icon-512.png', aus.icon512); schreib('glanzwerk-icon-192.png', aus.icon192);
  schreib('apple-touch-icon.png', aus.icon180); schreib('favicon-32.png', aus.fav32); schreib('glanzwerk-zeichen.png', aus.zeichen);
  console.log('Ausschnitte (B×H): Logo hell ' + aus.masse[0] + '×' + aus.masse[1] + ', Logo dunkel ' + aus.masse[2] + '×' + aus.masse[3] + ', Icon ' + aus.masse[4] + '×' + aus.masse[5]);
  await b.close();
})().catch(function (e) { console.error(e); process.exit(1); });
