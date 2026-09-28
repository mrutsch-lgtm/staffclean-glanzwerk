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
//   1. Mi, 3. Mo, 1 M Mi      fester Wochentag im Monat (n-ter Mittwoch …)
//   m, j, j2, j4, j6, j8      Beyersdorf-Schreibweise: 1× Monat, n× im Jahr (j2 = Halbjahr, j4 = Quartal,
//                             j6 = alle 2 Monate, j8 = alle 6–7 Wochen)
//   2 J (4,10), 1 J (5)       n× im Jahr in festen Monaten (erster Reinigungstag des Monats)
//   S1 … S4                   Sichtreinigung n× je Woche (Leistungstiefe „Sicht", Tage wie n W)
//   2,5                       wie 2,5 W
// Legenden aus dem LV („m2 = 14-täglich") übersetzt ausBeschreibung() in eines dieser Kürzel.
// Feiertage: an einem Feiertag fällt nichts an (Rückgabe mit Grund), ausgefallene Monats-/Quartalstermine
// rutschen auf den nächsten Reinigungstag.
'use strict';
const { istFeiertag } = require('./feiertage');

const TAGNAMEN = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
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
  let m = k.match(/^2[,.]5( ?w.*)?$/);
  if (m) return { art: 'wechsel', tageGerade: [1, 3, 5], tageUngerade: [2, 4], text: '2,5× je Woche (Mo/Mi/Fr, Di/Do im Wechsel)', kuerzel: roh };
  m = k.match(/^s ?(\d)$/);
  if (m && STANDARDTAGE[Number(m[1])]) { const n = Number(m[1]), tage = n === 1 ? [rt] : STANDARDTAGE[n]; return { art: 'woche', tage: tage, sicht: true, text: 'Sichtreinigung ' + tage.map(function (t) { return TAGNAMEN[t]; }).join(', '), kuerzel: roh }; }
  m = k.match(/^(\d)\. ?(so|mo|di|mi|do|fr|sa)[a-z]*( im monat)?$/) || k.match(/^(\d) ?m (so|mo|di|mi|do|fr|sa)[a-z]*$/);
  if (m) { const tag = TAGNAMEN.findIndex(function (n) { return n.toLowerCase() === m[2]; }), n = Number(m[1]); if (n >= 1 && n <= 5) return { art: 'monat', anzahl: 1, nter: n, tag: tag, text: n + '. ' + TAGNAMEN[tag] + ' im Monat', kuerzel: roh }; }
  if (k === 'm') return { art: 'monat', anzahl: 1, tag: rt, text: '1× im Monat (' + TAGNAMEN[rt] + ')', kuerzel: roh };
  m = k.match(/^(\d+) ?j ?\(?\s*(\d{1,2}(?:\s*[,;/]\s*\d{1,2})*)\s*\)?$/);
  if (m) { const monate = m[2].split(/[,;/]/).map(function (x) { return Number(x.trim()); }).filter(function (x) { return x >= 1 && x <= 12; }); if (monate.length) return { art: 'monatsliste', monate: monate, tag: rt, text: monate.length + '× im Jahr (' + monate.map(function (x) { return MONATE[x - 1]; }).join(', ') + ', ' + TAGNAMEN[rt] + ')', kuerzel: roh }; }
  m = k.match(/^j ?(\d+)?$/) || k.match(/^(\d+) ?x ?(?:jährlich|jaehrlich|im jahr|p\.? ?a\.?)$/);
  if (m) {
    const n = Number(m[1] || 1), mon = { 1: 12, 2: 6, 3: 4, 4: 3, 6: 2, 12: 1 }[n];
    if (mon) return { art: 'zeitraum', monate: mon, tag: rt, text: (n === 1 ? '1× im Jahr' : n + '× im Jahr') + ' (' + TAGNAMEN[rt] + ')', kuerzel: roh };
    if (n > 0 && n < 52) { const wochen = Math.max(1, Math.round(52 / n)); return { art: 'intervall', wochen: wochen, tag: rt, text: 'ca. ' + n + '× im Jahr (alle ' + wochen + ' Wochen, ' + TAGNAMEN[rt] + ')', kuerzel: roh }; }
  }
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
  if (regel.art === 'intervall') {   // alle n Wochen am Reinigungstag, gezählt ab Montag, 01.01.2024
    if (wt !== regel.tag) return { an: false };
    const wochen = Math.floor((new Date(datum + 'T12:00:00Z') - new Date('2024-01-01T12:00:00Z')) / (7 * 86400000));
    if (wochen % regel.wochen !== 0) return { an: false };
    return ft ? { an: false, grund: 'Feiertag: ' + ft } : { an: true };
  }
  if (regel.art === 'monatsliste') {
    if (regel.monate.indexOf(Number(datum.slice(5, 7))) < 0) return { an: false };
    const [von, bis] = monatAnfang(datum, 1);
    return termineImZeitraum(von, bis, regel.tag, land)[0] === datum ? { an: true } : { an: false };
  }
  if (regel.art === 'monat' && regel.nter) {   // n-ter Wochentag im Monat; fällt er auf einen Feiertag, der nächste gleiche Wochentag
    const [von, bis] = monatAnfang(datum, 1);
    const alle = []; for (let d = new Date(von + 'T12:00:00Z'); d.toISOString().slice(0, 10) < bis; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() === regel.tag) alle.push(d.toISOString().slice(0, 10));
    let soll = alle[regel.nter - 1]; if (!soll) return { an: false };
    if (istFeiertag(soll, land)) soll = alle.slice(regel.nter).find(function (x) { return !istFeiertag(x, land); });
    return soll === datum ? { an: true } : { an: false };
  }
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

// Beschreibung aus der Legende eines LVs („14-täglich", „1x monatlich 1. Mi", „2x jährlich") → Glanzwerk-Kürzel.
// null, wenn die Beschreibung nicht eindeutig ist — dann bleibt das Original-Kürzel stehen.
function ausBeschreibung(text) {
  const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let m;
  if (/bei bedarf|nach bedarf|auf abruf/.test(t)) return 'B';
  if (/sicht/.test(t) && (m = t.match(/(\d)\s*x?\s*(?:wöch|woech|pro woche|je woche)/))) return 'S' + m[1];
  if (/14[ -]?tägig|14[ -]?täglich|14[ -]?taegig|alle (2|zwei) wochen|zweiwöchentlich|2-wöchentlich/.test(t)) return '14T';
  if (/^täglich|arbeitstäglich|werktäglich/.test(t)) return '5 W';
  if ((m = t.match(/(\d)\.\s*(mo|di|mi|do|fr|sa)[a-z]*/))) return m[1] + '. ' + m[2][0].toUpperCase() + m[2][1];
  if (/halbjährlich|halbjaehrlich/.test(t)) return '1 H';
  if (/quartal|vierteljährlich/.test(t)) return '1 Q';
  if ((m = t.match(/(\d+)\s*x?\s*(?:jährlich|jaehrlich|im jahr|pro jahr)/))) return 'j' + m[1];
  if (/jährlich|jaehrlich/.test(t)) return 'j1';
  if ((m = t.match(/(\d)\s*x?\s*(?:im monat|monatlich|pro monat)/))) return m[1] + ' M';
  if (/monatlich/.test(t)) return '1 M';
  if ((m = t.match(/(\d)\s*x?\s*(?:wöchentlich|woechentlich|pro woche|je woche|in der woche)/))) return m[1] + ' W';
  if (/wöchentlich|woechentlich/.test(t)) return '1 W';
  return null;
}

module.exports = { lesen, faellig, kw, wochentag, ausBeschreibung, TAGNAMEN, STANDARDTAGE };
