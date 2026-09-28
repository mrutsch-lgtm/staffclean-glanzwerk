// turnus.js — Reinigungsturnus als Kalenderregel, nicht nur als Häufigkeit.
//
// Aus der Fachrecherche (28.09.2026): Ein Leistungsverzeichnis sagt „3 W", der Mitarbeiter braucht aber
// „Mo, Mi, Fr". Deshalb wird jedes Kürzel in eine Regel übersetzt, die für jeden Kalendertag
// eindeutig beantwortet: „fällt die Leistung heute an?".
//
// Unterstützte Kürzel (Groß-/Kleinschreibung und Leerzeichen egal):
//   5 W, 3 W, 2 W, 1 W …      n-mal je Woche, Standardtage siehe STANDARDTAGE
//   2,5 W                     Wechselwoche: gerade KW Mo/Mi/Fr, ungerade KW Di/Do
//   14T, 2-wöchentlich        alle zwei Wochen am Reinigungstag (gerade KW)
//   1 M, 2 M                  1× bzw. 2× im Monat (1. bzw. 1. und 3. Reinigungstag des Monats)
//   1 Q, 1 H, 1 J             Quartal / Halbjahr / Jahr (erster Reinigungstag des Zeitraums)
//   täglich, 7 W              jeden Tag
//   B, bei Bedarf             nie automatisch, nur auf Abruf
//   Mo,Mi,Fr                  genau diese Wochentage
// Feiertage: an einem Feiertag fällt nichts an (Rückgabe mit Grund), ausgefallene Monats-/Quartalstermine
// rutschen auf den nächsten Reinigungstag.
'use strict';
const { istFeiertag } = require('./feiertage');

const TAGNAMEN = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const STANDARDTAGE = { 1: [1], 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };

function wochentag(datum) { return new Date(datum + 'T12:00:00Z').getUTCDay(); }
function kw(datum) { // ISO-Kalenderwoche
  const d = new Date(datum + 'T12:00:00Z'); const t = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - t + 3); const erst = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - erst) / 86400000 - 3 + ((erst.getUTCDay() + 6) % 7)) / 7);
}

function tageAusText(t) {
  const liste = String(t).split(/[\s,;/+]+/).map(function (x) { return TAGNAMEN.findIndex(function (n) { return n.toLowerCase() === x.slice(0, 2).toLowerCase(); }); });
  return liste.every(function (i) { return i >= 0; }) && liste.length ? liste : null;
}

// Kürzel → Regel. `reinigungstag` = bevorzugter Wochentag des Objekts für 1 W/14T/M/Q/J (Standard Montag).
function lesen(kuerzel, reinigungstag) {
  const roh = String(kuerzel == null ? '' : kuerzel).trim();
  const k = roh.toLowerCase().replace(/\s+/g, ' ');
  const rt = Number.isInteger(reinigungstag) ? reinigungstag : 1;
  if (!k) return null;
  if (/^(b|bb|bei bedarf|bedarf|nach bedarf)$/.test(k)) return { art: 'bedarf', text: 'bei Bedarf', kuerzel: roh };
  if (/^(täglich|taeglich|7 ?w|7x)$/.test(k)) return { art: 'woche', tage: STANDARDTAGE[7], text: 'täglich', kuerzel: roh };
  let m = k.match(/^2[,.]5 ?w/);
  if (m) return { art: 'wechsel', tageGerade: [1, 3, 5], tageUngerade: [2, 4], text: '2,5× je Woche (Mo/Mi/Fr, Di/Do im Wechsel)', kuerzel: roh };
  m = k.match(/^(\d) ?(w|x ?w|x wöchentlich|wöchentlich)$/) || k.match(/^(\d)x?$/);
  if (m) { const n = Number(m[1]); const tage = n === 1 ? [rt] : STANDARDTAGE[n]; if (tage) return { art: 'woche', tage: tage, text: tage.map(function (t) { return TAGNAMEN[t]; }).join(', '), kuerzel: roh }; }
  if (/^(14 ?t|14-tägig|14tägig|2-wöchentlich|zweiwöchentlich|alle 2 wochen)$/.test(k)) return { art: 'zweiwoechig', tag: rt, gerade: true, text: 'alle 2 Wochen ' + TAGNAMEN[rt] + ' (gerade KW)', kuerzel: roh };
  m = k.match(/^(\d) ?m$/);
  if (m) { const n = Number(m[1]); return { art: 'monat', anzahl: n, tag: rt, text: (n === 1 ? '1× im Monat' : n + '× im Monat') + ' (' + TAGNAMEN[rt] + ')', kuerzel: roh }; }
  m = k.match(/^(\d) ?(q|h|j)$/);
  if (m) { const monate = { q: 3, h: 6, j: 12 }[m[2]]; return { art: 'zeitraum', monate: monate, tag: rt, text: { 3: 'je Quartal', 6: 'je Halbjahr', 12: '1× im Jahr' }[monate] + ' (' + TAGNAMEN[rt] + ')', kuerzel: roh }; }
  const tage = tageAusText(roh);
  if (tage) return { art: 'woche', tage: tage, text: tage.map(function (t) { return TAGNAMEN[t]; }).join(', '), kuerzel: roh };
  return { art: 'unbekannt', text: 'Turnus „' + roh + '" unbekannt — bitte festlegen', kuerzel: roh };
}

// n-ter Termin des Wochentags `tag` im Zeitraum [von, bis) ohne Feiertage → ISO-Datum
function termineImZeitraum(von, bis, tag, land) {
  const aus = [];
  for (let d = new Date(von + 'T12:00:00Z'); d.toISOString().slice(0, 10) < bis; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === tag && !istFeiertag(s, land)) aus.push(s);
  }
  return aus;
}
function monatAnfang(datum, schritt) {
  const j = Number(datum.slice(0, 4)), mo = Number(datum.slice(5, 7)) - 1;
  const start = Math.floor(mo / schritt) * schritt;
  const a = new Date(Date.UTC(j, start, 1)), b = new Date(Date.UTC(j, start + schritt, 1));
  return [a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)];
}

// Fällt die Regel am `datum` an? → { an: true } oder { an: false, grund }
function faellig(regel, datum, land) {
  if (!regel) return { an: false, grund: 'kein Turnus' };
  if (regel.art === 'bedarf') return { an: false, grund: 'bei Bedarf' };
  if (regel.art === 'unbekannt') return { an: false, grund: regel.text };
  const ft = istFeiertag(datum, land);
  const wt = wochentag(datum);
  if (regel.art === 'woche') { if (regel.tage.indexOf(wt) < 0) return { an: false }; return ft ? { an: false, grund: 'Feiertag: ' + ft } : { an: true }; }
  if (regel.art === 'wechsel') { const tage = kw(datum) % 2 === 0 ? regel.tageGerade : regel.tageUngerade; if (tage.indexOf(wt) < 0) return { an: false }; return ft ? { an: false, grund: 'Feiertag: ' + ft } : { an: true }; }
  if (regel.art === 'zweiwoechig') { if (wt !== regel.tag || (kw(datum) % 2 === 0) !== regel.gerade) return { an: false }; return ft ? { an: false, grund: 'Feiertag: ' + ft } : { an: true }; }
  if (regel.art === 'monat' || regel.art === 'zeitraum') {
    const schritt = regel.art === 'monat' ? 1 : regel.monate;
    const [von, bis] = monatAnfang(datum, schritt);
    const termine = termineImZeitraum(von, bis, regel.tag, land);
    const n = regel.art === 'monat' ? regel.anzahl : 1;
    const gewaehlt = n === 1 ? [termine[0]] : n === 2 ? [termine[0], termine[2] || termine[termine.length - 1]] : termine.filter(function (_, i) { return i % Math.max(1, Math.floor(termine.length / n)) === 0; }).slice(0, n);
    return gewaehlt.indexOf(datum) >= 0 ? { an: true } : { an: false };
  }
  return { an: false };
}

module.exports = { lesen, faellig, kw, wochentag, TAGNAMEN, STANDARDTAGE };
