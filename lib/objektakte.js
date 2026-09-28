// objektakte.js — was in der Gebäudereinigung zu einem Objekt gehört, neben Räumen und Leistungsverzeichnis:
// Vertrag, Reinigungszeiten, Ansprechpartner vor Ort, Zugang, Material und Entsorgung, Besonderheiten.
// Eine Feldliste für Datenbank (Spalten), Formular und Anzeige im Objektkopf.
'use strict';

const FELDER = [
  { n: 'objektnummer', t: 'Objektnummer', g: 'Vertrag' },
  { n: 'objektart', t: 'Objektart', g: 'Vertrag', typ: 'wahl', o: [['', '—'], ['buero', 'Büro / Verwaltung'], ['praxis', 'Praxis / Gesundheit'], ['schule', 'Schule / Kita'], ['weg', 'Treppenhaus / Wohnanlage'], ['industrie', 'Industrie / Lager'], ['handel', 'Handel / Filiale'], ['hotel', 'Hotel / Gastronomie'], ['oeffentlich', 'öffentliches Gebäude'], ['sonstiges', 'sonstiges']] },
  { n: 'vertragsbeginn', t: 'Vertragsbeginn', g: 'Vertrag', typ: 'date' },
  { n: 'vertragsende', t: 'Vertragsende (leer = unbefristet)', g: 'Vertrag', typ: 'date' },
  { n: 'kuendigungsfrist', t: 'Kündigungsfrist', g: 'Vertrag' },
  { n: 'objektleitung_id', t: 'Objektleitung', g: 'Vertrag', typ: 'mitarbeiter', sql: 'INTEGER' },
  { n: 'zeit_von', t: 'Reinigung ab', g: 'Reinigungszeiten', typ: 'time' },
  { n: 'zeit_bis', t: 'Reinigung bis', g: 'Reinigungszeiten', typ: 'time' },
  { n: 'zeit_hinweis', t: 'Hinweis zu den Zeiten (z. B. nicht während der Sprechstunde)', g: 'Reinigungszeiten' },
  { n: 'ap_name', t: 'Ansprechpartner vor Ort', g: 'Ansprechpartner vor Ort' },
  { n: 'ap_telefon', t: 'Telefon', g: 'Ansprechpartner vor Ort' },
  { n: 'ap_email', t: 'E-Mail', g: 'Ansprechpartner vor Ort', typ: 'email' },
  { n: 'hausmeister', t: 'Hausmeister / Haustechnik (Name, Telefon)', g: 'Ansprechpartner vor Ort' },
  { n: 'schluessel', t: 'Schlüssel / Transponder (Nummern, Anzahl, wer hat sie)', g: 'Zugang & Sicherheit' },
  { n: 'alarmanlage', t: 'Alarmanlage', g: 'Zugang & Sicherheit', typ: 'wahl', o: [['', '—'], ['nein', 'keine'], ['ja', 'ja — Einweisung nötig']] },
  { n: 'alarm_hinweis', t: 'Hinweis zur Alarmanlage (keinen Code eintragen)', g: 'Zugang & Sicherheit' },
  { n: 'parken', t: 'Parken / Anfahrt', g: 'Zugang & Sicherheit' },
  { n: 'material', t: 'Reinigungsmittel und Geräte stellt', g: 'Material & Entsorgung', typ: 'wahl', o: [['', '—'], ['wir', 'StaffClean'], ['kunde', 'Auftraggeber'], ['gemischt', 'teils / teils']] },
  { n: 'verbrauch', t: 'Verbrauchsmaterial (Seife, Papier, Müllbeutel)', g: 'Material & Entsorgung', typ: 'wahl', o: [['', '—'], ['kunde', 'stellt der Auftraggeber'], ['wir_inklusive', 'stellen wir, im Preis enthalten'], ['wir_abrechnung', 'stellen wir, wird abgerechnet'], ['nein', 'entfällt']] },
  { n: 'lager', t: 'Lager / Putzraum im Objekt', g: 'Material & Entsorgung' },
  { n: 'wasser', t: 'Wasser / Ausguss', g: 'Material & Entsorgung' },
  { n: 'entsorgung', t: 'Müll und Entsorgung (Trennung, Standort Tonnen)', g: 'Material & Entsorgung' },
  { n: 'besonderheiten', t: 'Besonderheiten (Hygieneplan, Allergien, Gefahrstellen, empfindliche Flächen)', g: 'Besonderheiten', typ: 'text' }
];
const GRUPPEN = [...new Set(FELDER.map(function (f) { return f.g; }))];

function lesen(b) {
  const w = {}, fehler = [];
  FELDER.forEach(function (f) {
    if (!(f.n in b)) return;
    let v = b[f.n] == null ? '' : String(b[f.n]).trim();
    if (f.typ === 'date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fehler.push(f.t + ': Datum im Format JJJJ-MM-TT');
    if (f.typ === 'time' && v && !/^\d{2}:\d{2}$/.test(v)) fehler.push(f.t + ': Uhrzeit im Format HH:MM');
    if (f.sql === 'INTEGER') v = v ? Number(v) : null;
    w[f.n] = v === '' ? null : v;
  });
  if (w.vertragsbeginn && w.vertragsende && w.vertragsende < w.vertragsbeginn) fehler.push('Das Vertragsende liegt vor dem Beginn.');
  if (/\b\d{4,8}\b/.test(w.alarm_hinweis || '')) fehler.push('Bitte keinen Alarmcode ins Objekt schreiben — der Hinweis ist für alle im Büro sichtbar.');
  if (fehler.length) throw new Error(fehler.join(' '));
  return w;
}

module.exports = { FELDER, GRUPPEN, lesen };
