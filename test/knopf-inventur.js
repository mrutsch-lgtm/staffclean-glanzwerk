// knopf-inventur.js — bricht ab, wenn ein Knopf der Oberfläche in der Browser-Abnahme nicht vorkommt (npm run abnahme).
const fs = require('fs'), path = require('path'), B = path.join(__dirname, '..') + '/';
const test = fs.readFileSync(B + 'test/abnahme-browser.js', 'utf8');
const quellen = ['web/js/buero.js', 'web/js/app.js', 'web/js/kunde.js'];
const fehlend = [], gesamt = new Set();
quellen.forEach(function (q) {
  const s = fs.readFileSync(B + q, 'utf8');
  const ids = new Set(); let m;
  const reKnopf = /<(?:button|a)[^>]*\bid=\\?"([a-zA-Z]+)\\?"/g; while ((m = reKnopf.exec(s))) ids.add('#' + m[1]);
  const reData = /\$\$\('\[data-([a-z-]+)\]/g; while ((m = reData.exec(s))) ids.add('[data-' + m[1] + ']');
  const reOn = /\$\('#([a-zA-Z]+)'\)\.onclick/g; while ((m = reOn.exec(s))) ids.add('#' + m[1]);
  ids.forEach(function (k) { gesamt.add(q + ' ' + k); const roh = k.replace(/^#/, '').replace(/^\[data-|\]$/g, ''); if (!test.includes(k.replace(/\]$/, '')) && !test.includes("'" + k) && !test.includes(roh)) fehlend.push(q + '  ' + k); });
});
console.log(gesamt.size + ' Knöpfe/Handler gefunden, ' + (gesamt.size - fehlend.length) + ' in der Abnahme angeklickt');
if (fehlend.length) { console.log('NICHT in der Abnahme:\n' + fehlend.join('\n')); process.exit(1); }
