// qualitaet.js — Qualitätsprüfung angelehnt an DIN EN 13549 (Reinigungsdienstleistungen – Qualitätsmesssysteme).
//
// Grundgedanke der Norm: nicht jeden Raum prüfen, sondern eine STICHPROBE nach Losgröße (Tabelle wie ISO 2859-1,
// allgemeines Prüfniveau II), je Raum festgelegte Prüfelemente bewerten, Fehler zählen, Qualitätswert bilden.
// Hier: Qualitätswert = 100 × (1 − Fehler / geprüfte Elemente). Jeder Fehler wird automatisch zum Mangel mit Frist.
// ⚠️ Die genauen Norm-Tabellen (Annehmbare Qualitätsgrenzlage je Vereinbarung) sind vertraglich festzulegen —
//    die Stichprobengrößen unten sind die Standardtabelle; der Grenzwert „bestanden" ist einstellbar.
'use strict';

const STICHPROBE = [[8, 2], [15, 3], [25, 5], [50, 8], [90, 13], [150, 20], [280, 32], [500, 50], [1200, 80], [3200, 125], [Infinity, 200]];
function stichprobe(anzahlRaeume) { const n = Number(anzahlRaeume) || 0; if (n <= 2) return n; for (const [bis, s] of STICHPROBE) if (n <= bis) return Math.min(s, n); return n; }

// Prüfelemente je Raumart (Stichworte im Raumnamen) — ausbaufähig, bewusst kurz
const ELEMENTE = {
  sanitaer: ['Boden', 'WC / Urinal', 'Waschbecken & Armaturen', 'Spiegel', 'Verbrauchsmaterial', 'Abfall'],
  kueche: ['Boden', 'Arbeitsflächen', 'Spüle', 'Geräte außen', 'Abfall'],
  treppe: ['Stufen & Podeste', 'Handlauf', 'Geländer', 'Ecken & Kanten', 'Fensterbänke'],
  buero: ['Boden', 'Tische & Flächen', 'Abfall', 'Türen & Griffe', 'Heizkörper & Fußleisten'],
  standard: ['Boden', 'Flächen', 'Abfall', 'Türen & Griffe', 'Ecken & Kanten']
};
function elementeFuer(raumName) {
  const n = String(raumName || '').toLowerCase();
  if (/wc|sanit|toilet|dusch|bad/.test(n)) return ELEMENTE.sanitaer;
  if (/küche|kueche|tee/.test(n)) return ELEMENTE.kueche;
  if (/treppe|flur|keller|wasch/.test(n)) return ELEMENTE.treppe;
  if (/büro|buero|besprech|empfang|raum/.test(n)) return ELEMENTE.buero;
  return ELEMENTE.standard;
}

// Zufällige, aber reproduzierbare Auswahl der Räume (Startwert = Prüfungs-ID), damit Nachprüfbarkeit gegeben ist
function auswahl(raeume, anzahl, startwert) {
  let s = Number(startwert) || 1; const zufall = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return raeume.slice().map(function (r) { return { r: r, k: zufall() }; }).sort(function (a, b) { return a.k - b.k; }).slice(0, anzahl).map(function (x) { return x.r; })
    .sort(function (a, b) { return (a.reihenfolge || 0) - (b.reihenfolge || 0); });
}

function auswerten(raeumeErgebnisse) {
  let elemente = 0, fehler = 0;
  raeumeErgebnisse.forEach(function (r) { (r.kriterien || []).forEach(function (k) { if (k.ok === null || k.ok === undefined) return; elemente++; if (!k.ok) fehler++; }); });
  return { elemente: elemente, fehler: fehler, ergebnis: elemente ? Math.round((1 - fehler / elemente) * 1000) / 10 : null };
}

module.exports = { stichprobe, elementeFuer, auswahl, auswerten, ELEMENTE };
