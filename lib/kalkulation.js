// kalkulation.js — Monatsaufwand und Preis eines Objekts aus dem Leistungsverzeichnis.
//
// Fachlicher Weg (Fachrecherche 28.09.2026): Der Leistungswert m²/h ist ein ERGEBNIS, keine Eingabe.
// Deshalb: Minuten je Tätigkeit und Raum × Häufigkeit im Monat = Soll-Minuten → Stunden
//          → Lohn laut Tarif (mit Gültigkeit) + Lohnnebenkosten → + Gemeinkosten → + Gewinn = Monatspreis.
// Häufigkeit im Monat = Zahl der Termine in den nächsten 12 Monaten ÷ 12 (Feiertage und
// Kalenderregeln sind damit genau berücksichtigt, auch 1 M / 1 Q / 2,5 W).
'use strict';
const T = require('./turnus');
const DB = require('./db');

const STANDARD_MINUTEN = 5;
function tage12(ab) { const aus = []; const d = new Date(ab + 'T12:00:00Z'); for (let i = 0; i < 365; i++) { aus.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return aus; }

function objekt(db, id, opt) {
  opt = opt || {};
  const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(id)); if (!o) return null;
  const e = DB.einstellungen(db);
  const ab = opt.ab || new Date().toISOString().slice(0, 10);
  const tage = tage12(ab);
  const pos = db.prepare(`SELECT p.id, p.turnus, COALESCE(p.minuten, t.minuten) minuten, t.name taetigkeit, r.name raum, r.flaeche_m2 FROM lv_position p
                          JOIN taetigkeit t ON t.id = p.taetigkeit_id JOIN raum r ON r.id = p.raum_id WHERE p.objekt_id = ? ORDER BY r.reihenfolge, t.id`).all(o.id);
  const einsatztage = new Set();
  const zeilen = pos.map(function (p) {
    const regel = T.lesen(p.turnus, o.reinigungstag);
    let n = 0; tage.forEach(function (d) { if (T.faellig(regel, d, o.bundesland).an) { n++; einsatztage.add(d); } });
    const jeMonat = n / 12, minuten = Number(p.minuten) || STANDARD_MINUTEN;
    return { raum: p.raum, taetigkeit: p.taetigkeit, turnus: regel.text, minuten: minuten, minutenGeschaetzt: !p.minuten, jeMonat: Math.round(jeMonat * 100) / 100, minutenMonat: Math.round(jeMonat * minuten * 10) / 10 };
  });
  const tageMonat = einsatztage.size / 12;
  const wegeMin = tageMonat * (Number(e.wegezeit_min) || 0);
  const leistungMin = zeilen.reduce(function (a, z) { return a + z.minutenMonat; }, 0);
  const stunden = (leistungMin + wegeMin) / 60;
  const tarif = DB.tarifFuer(db, opt.lohngruppe || 'LG 1', ab);
  const lohn = opt.stundenlohn || (tarif ? tarif.stundenlohn : 15);
  const lnk = (Number(opt.lohnnebenkosten_prozent != null ? opt.lohnnebenkosten_prozent : e.lohnnebenkosten_prozent) || 0) / 100;
  const gk = (Number(opt.gemeinkosten_prozent != null ? opt.gemeinkosten_prozent : e.gemeinkosten_prozent) || 0) / 100;
  const gw = (Number(opt.gewinn_prozent != null ? opt.gewinn_prozent : e.gewinn_prozent) || 0) / 100;
  const lohnkosten = stunden * lohn * (1 + lnk);
  const selbstkosten = lohnkosten * (1 + gk);
  const preis = selbstkosten * (1 + gw);
  const flaeche = db.prepare('SELECT COALESCE(SUM(flaeche_m2),0) f FROM raum WHERE objekt_id = ?').get(o.id).f;
  const r2 = x => Math.round(x * 100) / 100;
  return {
    objekt: { id: o.id, name: o.name }, ab: ab, zeilen: zeilen,
    tarif: tarif ? { lohngruppe: tarif.lohngruppe, stundenlohn: tarif.stundenlohn, gueltig_bis: tarif.gueltig_bis, quelle: tarif.quelle } : null,
    annahmen: { lohn: lohn, lohnnebenkosten_prozent: lnk * 100, gemeinkosten_prozent: gk * 100, gewinn_prozent: gw * 100, wegezeit_min: Number(e.wegezeit_min) || 0, standardMinuten: STANDARD_MINUTEN },
    ergebnis: {
      einsatztageMonat: r2(tageMonat), leistungMinuten: r2(leistungMin), wegeMinuten: r2(wegeMin), stundenMonat: r2(stunden),
      lohnkosten: r2(lohnkosten), selbstkosten: r2(selbstkosten), monatspreis: r2(preis),
      verrechnungssatz: stunden ? r2(preis / stunden) : 0,
      leistungswert: stunden && flaeche ? Math.round(flaeche * tageMonat / (leistungMin / 60 || 1)) : null, flaeche: flaeche
    },
    warnungen: [].concat(zeilen.some(function (z) { return z.minutenGeschaetzt; }) ? ['Für einige Tätigkeiten fehlt die Richtzeit — es sind ' + STANDARD_MINUTEN + ' Minuten angesetzt.'] : [],
      tarif && tarif.gueltig_bis && tarif.gueltig_bis < tage[tage.length - 1] ? ['Der Tarif gilt nur bis ' + tarif.gueltig_bis.split('-').reverse().join('.') + ' — ab dann neuen Tarif eintragen.'] : [])
  };
}

module.exports = { objekt };
