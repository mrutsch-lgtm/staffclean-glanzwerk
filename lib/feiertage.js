// feiertage.js — gesetzliche Feiertage je Bundesland (bundesweit + landesspezifisch).
// Berechnet, nicht hinterlegt: Ostersonntag nach Gauß/Meeus, alles Bewegliche daraus.
'use strict';

function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(jahr, monat - 1, tag));
}
const iso = d => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 86400000);

// Landesspezifische Zusätze (Kürzel wie im Kfz-/Behördengebrauch)
const LAND = {
  BW: ['heilige3', 'fronleichnam', 'allerheiligen'], BY: ['heilige3', 'fronleichnam', 'allerheiligen'],
  BE: ['frauentag'], BB: ['reformation'], HB: ['reformation'], HH: ['reformation'],
  HE: ['fronleichnam'], MV: ['frauentag', 'reformation'], NI: ['reformation'],
  NW: ['fronleichnam', 'allerheiligen'], RP: ['fronleichnam', 'allerheiligen'],
  SL: ['fronleichnam', 'mariae', 'allerheiligen'], SN: ['reformation', 'busstag'],
  ST: ['heilige3', 'reformation'], SH: ['reformation'], TH: ['weltkinder', 'reformation']
};

function feiertage(jahr, land) {
  const o = ostersonntag(jahr);
  const f = {};
  const setze = (d, name) => { f[typeof d === 'string' ? d : iso(d)] = name; };
  setze(jahr + '-01-01', 'Neujahr');
  setze(plus(o, -2), 'Karfreitag');
  setze(plus(o, 1), 'Ostermontag');
  setze(jahr + '-05-01', 'Tag der Arbeit');
  setze(plus(o, 39), 'Christi Himmelfahrt');
  setze(plus(o, 50), 'Pfingstmontag');
  setze(jahr + '-10-03', 'Tag der Deutschen Einheit');
  setze(jahr + '-12-25', '1. Weihnachtstag');
  setze(jahr + '-12-26', '2. Weihnachtstag');
  (LAND[String(land || 'SH').toUpperCase()] || []).forEach(function (z) {
    if (z === 'heilige3') setze(jahr + '-01-06', 'Heilige Drei Könige');
    if (z === 'frauentag') setze(jahr + '-03-08', 'Internationaler Frauentag');
    if (z === 'fronleichnam') setze(plus(o, 60), 'Fronleichnam');
    if (z === 'mariae') setze(jahr + '-08-15', 'Mariä Himmelfahrt');
    if (z === 'weltkinder') setze(jahr + '-09-20', 'Weltkindertag');
    if (z === 'reformation') setze(jahr + '-10-31', 'Reformationstag');
    if (z === 'allerheiligen') setze(jahr + '-11-01', 'Allerheiligen');
    if (z === 'busstag') { // Mittwoch vor dem 23.11.
      let d = new Date(Date.UTC(jahr, 10, 22)); while (d.getUTCDay() !== 3) d = plus(d, -1); setze(d, 'Buß- und Bettag');
    }
  });
  return f;
}

const zwischenspeicher = {};
function istFeiertag(datum, land) {
  const jahr = Number(String(datum).slice(0, 4)), k = jahr + '|' + (land || 'SH');
  if (!zwischenspeicher[k]) zwischenspeicher[k] = feiertage(jahr, land);
  return zwischenspeicher[k][String(datum).slice(0, 10)] || null;
}

module.exports = { feiertage, istFeiertag, ostersonntag };
