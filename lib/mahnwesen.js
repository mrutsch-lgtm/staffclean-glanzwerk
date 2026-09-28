// mahnwesen.js — offene Posten, Mahnvorschläge, Mahnungen (Zahlungserinnerung · 1. · 2. · letzte Mahnung), Mahnsperre.
//
// Recht (Stand 2026): Verzug nach § 286 BGB — mit der ersten Mahnung, bei Unternehmern spätestens 30 Tage nach
// Fälligkeit und Zugang der Rechnung (§ 286 Abs. 3; bei Verbrauchern nur mit ausdrücklichem Hinweis in der Rechnung,
// deshalb hier erst ab Mahnung). Verzugszinsen § 288 BGB: Verbraucher 5, Unternehmer 9 Prozentpunkte über dem
// Basiszinssatz (§ 247 BGB, Bundesbank, Tabelle „basiszins"). Unternehmer schulden zusätzlich eine Pauschale von 40 €
// (§ 288 Abs. 5 BGB), einmal je Forderung. Mahngebühren sind einstellbar (bei Verbrauchern nur tatsächliche Kosten).
// Zinsen werden taggenau (Tage/365) und je Abschnitt mit dem jeweils gültigen Basiszinssatz berechnet.
'use strict';
const DB = require('./db');
const AB = require('./abrechnung');

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const plusTag = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tageZwischen = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const STUFE = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung', 'Letzte Mahnung'];

function basiszins(db, datum) {
  const z = db.prepare('SELECT prozent FROM basiszins WHERE gueltig_ab <= ? ORDER BY gueltig_ab DESC LIMIT 1').get(datum);
  return z ? z.prozent : null;
}
// Verzugszinsen von „ab" (erster Zinstag) bis „bis" (einschließlich), abschnittsweise je Basiszinssatz
function zinsen(db, betrag, ab, bis, privat) {
  if (!ab || bis < ab || !(betrag > 0)) return { betrag: 0, prozent: null, tage: 0, abschnitte: [] };
  const aufschlag = privat ? 5 : 9, wechsel = db.prepare('SELECT gueltig_ab FROM basiszins WHERE gueltig_ab > ? AND gueltig_ab <= ? ORDER BY gueltig_ab').all(ab, bis).map(function (x) { return x.gueltig_ab; });
  const grenzen = [ab].concat(wechsel), abschnitte = []; let summe = 0;
  grenzen.forEach(function (von, i) {
    const ende = i + 1 < grenzen.length ? plusTag(grenzen[i + 1], -1) : bis, bz = basiszins(db, von);
    if (bz == null) throw new Error('Für ' + von.split('-').reverse().join('.') + ' ist kein Basiszinssatz hinterlegt (Abrechnung → Mahnwesen → Einstellungen).');
    const p = r2(bz + aufschlag), tage = tageZwischen(von, ende) + 1, z = betrag * p / 100 * tage / 365;
    summe += z; abschnitte.push({ von: von, bis: ende, tage: tage, prozent: p });
  });
  return { betrag: r2(summe), prozent: abschnitte[abschnitte.length - 1].prozent, tage: abschnitte.reduce(function (a, x) { return a + x.tage; }, 0), abschnitte: abschnitte };
}

// Beginn des Verzugs: Tag nach Zugang der ersten Mahnung (Zugang ≈ Mahndatum + 3 Tage), bei Unternehmern spätestens
// am 31. Tag nach Fälligkeit (§ 286 Abs. 3 BGB)
function verzugAb(r, mahnungen) {
  const erste = mahnungen.filter(function (m) { return m.stufe >= 1; })[0];
  const nachMahnung = erste ? plusTag(erste.datum, 4) : null;
  const nachFrist = !r.privat && r.faellig ? plusTag(r.faellig, 31) : null;
  return [nachMahnung, nachFrist].filter(Boolean).sort()[0] || null;
}

// Was eine Mahnung der Stufe s heute kosten würde (ohne zu speichern)
function berechnen(db, r, stufe, datum) {
  const e = DB.einstellungen(db), bisher = db.prepare('SELECT * FROM mahnung WHERE rechnung_id = ? ORDER BY stufe, id').all(r.id);
  const offen = AB.offenBetrag(db, r), gebuehr = stufe === 0 ? 0 : r2(Number(String(e['mahn_gebuehr_' + stufe] || 0).replace(',', '.')) || 0);
  const gebuehrenBisher = r2(bisher.reduce(function (a, m) { return a + (m.gebuehr || 0); }, 0));
  const pauschaleBisher = r2(bisher.reduce(function (a, m) { return a + (m.pauschale || 0); }, 0));
  const pauschale = stufe >= 1 && !r.privat && e.mahn_pauschale === '1' && !pauschaleBisher ? 40 : 0;
  let z = { betrag: 0, prozent: null };
  if (stufe >= 1 && e.mahn_zinsen === '1') {
    const ab = verzugAb(r, bisher.concat(stufe >= 1 && !bisher.some(function (m) { return m.stufe >= 1; }) ? [{ stufe: stufe, datum: datum }] : []));
    if (ab && ab <= datum) z = zinsen(db, offen, ab, datum, !!r.privat); z.ab = ab;
  }
  const frist = plusTag(datum, Number(e.mahn_frist_tage) || 10);
  return { stufe: stufe, titel: STUFE[stufe], datum: datum, frist: frist, offen: offen, gebuehr: gebuehr, gebuehrenBisher: gebuehrenBisher, pauschale: pauschale, pauschaleBisher: pauschaleBisher,
    zinsen: z.betrag, zins_ab: z.ab || null, zins_prozent: z.prozent, gesamt: r2(offen + gebuehrenBisher + gebuehr + pauschaleBisher + pauschale + z.betrag) };
}

// Offene Posten: gestellte, nicht (vollständig) bezahlte Rechnungen mit Mahnstand und Vorschlag für die nächste Stufe
function offenePosten(db, stichtag) {
  const e = DB.einstellungen(db), d = stichtag || heute();
  return db.prepare(`SELECT r.*, k.name kunde, k.kundennummer, o.name objekt FROM rechnung r JOIN kunde k ON k.id = r.kunde_id LEFT JOIN objekt o ON o.id = r.objekt_id
      WHERE r.status = 'gestellt' AND r.storno_von IS NULL ORDER BY r.faellig, r.nummer`).all().map(function (r) {
    const m = db.prepare('SELECT * FROM mahnung WHERE rechnung_id = ? ORDER BY stufe DESC, id DESC').all(r.id), letzte = m[0] || null;
    const offen = AB.offenBetrag(db, r), ueber = r.faellig && r.faellig < d ? tageZwischen(r.faellig, d) : 0;
    let naechste = null, grund = '';
    if (r.mahnsperre) grund = 'Mahnsperre' + (r.mahnsperre_grund ? ': ' + r.mahnsperre_grund : '');
    else if (!letzte) { if (ueber > (Number(e.mahn_tage_erinnerung) || 0)) naechste = 0; else grund = ueber ? 'noch in der Karenz (' + ueber + ' Tage überfällig)' : 'noch nicht fällig'; }
    else if (letzte.frist >= d) grund = 'Frist der ' + STUFE[letzte.stufe] + ' läuft bis ' + letzte.frist.split('-').reverse().join('.');
    else if (letzte.stufe < 3) naechste = letzte.stufe + 1;
    else grund = 'Letzte Mahnung ohne Zahlung — gerichtliches Mahnverfahren oder Inkasso';
    return { id: r.id, nummer: r.nummer, kunde: r.kunde, kundennummer: r.kundennummer, objekt: r.objekt, datum: r.datum, faellig: r.faellig, brutto: r.brutto, offen: offen,
      teilbezahlt: offen < r.brutto - 0.005, tageUeberfaellig: ueber, mahnstufe: letzte ? letzte.stufe : null, mahnstufeText: letzte ? STUFE[letzte.stufe] : '', letzteMahnung: letzte ? letzte.datum : null,
      frist: letzte ? letzte.frist : null, mahnsperre: !!r.mahnsperre, naechsteStufe: naechste, naechsteText: naechste == null ? '' : STUFE[naechste], grund: grund, inkasso: !!(letzte && letzte.stufe === 3 && letzte.frist < d) };
  });
}
function altersstruktur(posten) {
  const k = [['nicht fällig', 0, 0], ['1–30 Tage', 1, 30], ['31–60 Tage', 31, 60], ['61–90 Tage', 61, 90], ['über 90 Tage', 91, 1e9]].map(function (x) { return { text: x[0], von: x[1], bis: x[2], anzahl: 0, summe: 0 }; });
  posten.forEach(function (p) { const b = k.find(function (x) { return p.tageUeberfaellig >= x.von && p.tageUeberfaellig <= x.bis; }); b.anzahl++; b.summe = r2(b.summe + p.offen); });
  return k;
}

function anlegen(db, rechnungId, datum) {
  datum = datum || heute();
  const p = offenePosten(db, datum).find(function (x) { return x.id === Number(rechnungId); });
  if (!p) throw new Error('Die Rechnung ist nicht offen (bezahlt, storniert oder noch nicht gestellt).');
  if (p.naechsteStufe == null) throw new Error('Keine Mahnung fällig: ' + p.grund + '.');
  const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(p.id), b = berechnen(db, r, p.naechsteStufe, datum);
  const id = Number(db.prepare('INSERT INTO mahnung (rechnung_id, stufe, datum, frist, offen, gebuehr, zinsen, pauschale, gesamt, zins_ab, zins_prozent) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(r.id, b.stufe, b.datum, b.frist, b.offen, b.gebuehr, b.zinsen, b.pauschale, b.gesamt, b.zins_ab, b.zins_prozent).lastInsertRowid);
  return Object.assign({ id: id, nummer: r.nummer }, b);
}
// Mahnlauf: für alle übergebenen (oder alle fälligen) Rechnungen die nächste Stufe anlegen
function lauf(db, ids, datum) {
  datum = datum || heute();
  const faellig = offenePosten(db, datum).filter(function (p) { return p.naechsteStufe != null && (!ids || ids.map(Number).indexOf(p.id) >= 0); });
  const aus = { angelegt: [], fehler: [] };
  faellig.forEach(function (p) { try { aus.angelegt.push(anlegen(db, p.id, datum)); } catch (e) { aus.fehler.push({ nummer: p.nummer, grund: e.message }); } });
  return aus;
}
function zuruecknehmen(db, mahnungId) {   // nur die jeweils letzte Mahnung einer Rechnung (Fehlversand, Zahlung hatte sich überschnitten)
  const m = db.prepare('SELECT * FROM mahnung WHERE id = ?').get(Number(mahnungId)); if (!m) throw new Error('Mahnung nicht gefunden');
  const letzte = db.prepare('SELECT id FROM mahnung WHERE rechnung_id = ? ORDER BY stufe DESC, id DESC LIMIT 1').get(m.rechnung_id);
  if (letzte.id !== m.id) throw new Error('Nur die letzte Mahnung einer Rechnung lässt sich zurücknehmen.');
  db.prepare('DELETE FROM mahnung WHERE id = ?').run(m.id);
}
function sperre(db, id, an, grund) {
  const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(Number(id)); if (!r) throw new Error('Rechnung nicht gefunden');
  db.prepare('UPDATE rechnung SET mahnsperre = ?, mahnsperre_grund = ? WHERE id = ?').run(an ? 1 : 0, an ? (String(grund || '').trim() || null) : null, r.id);
}
function voll(db, id) {
  const m = db.prepare('SELECT * FROM mahnung WHERE id = ?').get(Number(id)); if (!m) return null;
  m.titel = STUFE[m.stufe]; m.rechnung = AB.voll(db, m.rechnung_id);
  m.bisher = db.prepare('SELECT * FROM mahnung WHERE rechnung_id = ? AND id < ? ORDER BY stufe, id').all(m.rechnung_id, m.id);
  return m;
}

module.exports = { STUFE, basiszins, zinsen, verzugAb, berechnen, offenePosten, altersstruktur, anlegen, lauf, zuruecknehmen, sperre, voll };
