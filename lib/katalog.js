// katalog.js — Standard-Leistungskatalog: Tätigkeiten mit Leistungsbeschreibung (für Angebot und App).
//
// Die Namen der Treppenhaus-Tätigkeiten folgen den Leistungsverzeichnissen aus Neumünster, damit ein Import
// sie wiederfindet (Schreibvarianten werden beim Import zusammengeführt). Richtzeiten stehen hier bewusst
// NICHT: Sie hängen an Objektgröße und Verschmutzung und werden je Objekt kalibriert (Kalkulation →
// „Richtzeiten an Zielpreis ausrichten") und über Soll/Ist nachgeschärft.
'use strict';
const KATALOG = [
  // Treppenhaus
  ['saugen und feucht wischen', 'Boden', 'Treppenstufen, Podeste und Flure saugen bzw. kehren und anschließend nebelfeucht wischen; Ecken und Kanten mitnehmen, Laufwege freihalten.'],
  ['Fegen', 'Boden', 'Grobschmutz, Sand und Laub von Eingangsbereich, Podest und Kellertreppe kehren.'],
  ['Handlauf abwischen', 'Flächen', 'Handläufe und Geländer auf ganzer Länge feucht abwischen, Griffspuren entfernen.'],
  ['Briefkästen abwischen', 'Flächen', 'Briefkastenanlage und Klingeltableau feucht abwischen, Fingerabdrücke entfernen.'],
  ['Eingangstür feucht abwischen (ohne Glas)', 'Flächen', 'Rahmen, Türblatt und Griffe der Haus- und Kellertüren feucht abwischen; Glasflächen sind Teil der Glasreinigung.'],
  ['Fensterbank feucht abwischen', 'Flächen', 'Fensterbänke im Treppenhaus feucht abwischen, Dekoration anheben und wieder hinstellen.'],
  ['Heizkörper, Fußleisten entstauben & Spinnenweben entfernen', 'Flächen', 'Heizkörper und Fußleisten entstauben, Spinnweben an Decken, Ecken und Lampen entfernen.'],
  ['Steckdosen & Lichtschalter, entstauben', 'Flächen', 'Lichtschalter, Steckdosen und Treppenhausautomaten entstauben und feucht abwischen.'],
  ['Papier- & Abfallbehälter leeren', 'Abfall', 'Abfallbehälter leeren, Beutel wechseln, Wertstoffe getrennt entsorgen.'],
  ['Fahrstuhl reinigen', 'Flächen', 'Kabinenboden saugen und wischen, Wände, Spiegel und Bedientableau reinigen, Türschienen aussaugen.'],
  ['Kellergang kehren', 'Boden', 'Kellergänge und Kellertreppe kehren, grobe Verschmutzungen feucht aufnehmen.'],
  ['Eingangsmatte absaugen', 'Boden', 'Schmutzfangmatten absaugen, anheben und den Boden darunter reinigen.'],
  // Büro und Verwaltung
  ['Boden saugen und feucht wischen', 'Boden', 'Freie Bodenflächen saugen, Hartböden anschließend nebelfeucht wischen. Unter Tischen nur frei zugängliche Flächen.'],
  ['Teppichboden saugen', 'Boden', 'Textile Beläge vollflächig saugen, Laufstraßen besonders gründlich.'],
  ['Tische und Arbeitsflächen feucht abwischen', 'Flächen', 'Nur freie Arbeitsflächen feucht abwischen; Unterlagen und Geräte werden nicht bewegt.'],
  ['Papierkörbe leeren, Beutel wechseln', 'Abfall', 'Papierkörbe und Abfallbehälter leeren, Beutel wechseln, Wertstoffe trennen.'],
  ['Griffspuren an Türen entfernen', 'Flächen', 'Türblätter, Türgriffe und Zargen im Griffbereich feucht reinigen.'],
  ['Telefone und Bildschirme entstauben', 'Flächen', 'Telefone, Tastaturen und Bildschirme trocken entstauben — ohne Flüssigkeit an Geräte.'],
  ['Heizkörper und Fußleisten entstauben', 'Flächen', 'Heizkörper und Fußleisten entstauben, bei Bedarf feucht nachwischen.'],
  ['Teeküche reinigen', 'Küche', 'Arbeitsflächen, Spüle, Armaturen und Fronten reinigen, Geschirr nur nach Absprache.'],
  // Sanitär
  ['Sanitär reinigen und desinfizieren', 'Sanitär', 'WC, Urinale, Waschbecken, Armaturen und Spiegel reinigen und desinfizieren; Farbsystem der Tücher beachten (rot WC, gelb Waschbereich).'],
  ['Verbrauchsmaterial auffüllen', 'Sanitär', 'Seife, Papierhandtücher und Toilettenpapier prüfen und auffüllen; Material stellt der Auftraggeber, sofern nicht anders vereinbart.'],
  ['Sanitärboden nass wischen', 'Sanitär', 'Fliesenboden im Sanitärbereich nass wischen, Abflüsse und Fugen mitnehmen.'],
  ['Trennwände und Fliesen feucht reinigen', 'Sanitär', 'WC-Trennwände, Türen und Wandfliesen im Spritzbereich feucht reinigen.'],
  // Glas und Sonderleistungen
  ['Glastüren und Spiegel reinigen', 'Glas', 'Glastüren, Glaseinsätze und Spiegel streifenfrei reinigen, innen und — soweit ohne Hilfsmittel erreichbar — außen.'],
  ['Glasreinigung inkl. Rahmen', 'Glas', 'Fensterflächen innen und außen einschließlich Rahmen und Falze reinigen; Höhen über 2 m nur mit geeignetem Steiggerät.'],
  ['Grundreinigung Boden', 'Sonder', 'Beläge maschinell grundreinigen, Pflegefilm entfernen und neu einpflegen (nach Absprache, Belag berücksichtigen).'],
  ['Lampen reinigen', 'Flächen', 'Leuchten außen entstauben bzw. feucht abwischen, nur spannungsfrei erreichbare Teile.']
];

function laden(db, vergleich) {
  const alle = db.prepare('SELECT id, name, anleitung, kategorie FROM taetigkeit').all();
  let neu = 0, ergaenzt = 0;
  KATALOG.forEach(function (k) {
    const da = alle.find(function (t) { return t.name === k[0] || vergleich(t.name) === vergleich(k[0]); });
    if (!da) { db.prepare('INSERT INTO taetigkeit (name, kategorie, anleitung) VALUES (?,?,?)').run(k[0], k[1], k[2]); neu++; return; }
    if (!da.anleitung || !da.kategorie) { db.prepare('UPDATE taetigkeit SET anleitung = COALESCE(anleitung, ?), kategorie = COALESCE(kategorie, ?) WHERE id = ?').run(k[2], k[1], da.id); ergaenzt++; }
  });
  return { neu: neu, ergaenzt: ergaenzt, gesamt: KATALOG.length };
}

module.exports = { KATALOG, laden };
