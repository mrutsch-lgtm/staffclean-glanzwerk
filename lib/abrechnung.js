// abrechnung.js — Rechnungen je Objekt oder je Kunde (Sammelrechnung) und Monat, einzeln oder als Abrechnungslauf.
//
// Wie in der Sicherheitsplanung (SecPlan): je Objekt wird pauschal und/oder nach Ist-Stunden aus der Zeiterfassung
// abgerechnet; ein Kunde bekommt je Objekt eine Rechnung oder eine Sammelrechnung mit einer Gruppe je Objekt.
// Der Abrechnungslauf legt für einen Monat alle Entwürfe an (und stellt sie auf Wunsch gleich); die Automatik
// startet ihn am eingestellten Tag für den Vormonat. Ein Objekt wird je Zeitraum nur einmal abgerechnet.
//
// Positionen kommen aus drei Quellen: Monatspauschale des Objekts · Preisbausteine (monatlich oder je Durchgang
// mit Turnus, z. B. „Glasreinigung 1 Q" → Zahl der Termine im Monat × Preis) · erledigte Abruf-Aufträge
// (Festpreis oder Stunden × Stundensatz). Ein Entwurf ist frei änderbar; mit „stellen" bekommt er eine
// fortlaufende Nummer je Jahr und ist danach unveränderlich — Korrektur nur per Storno (Gegenrechnung).
'use strict';
const DB = require('./db');
const T = require('./turnus');

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const plusTag = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function monatsgrenzen(monat) {
  if (!/^\d{4}-\d{2}$/.test(monat || '')) throw new Error('Monat im Format JJJJ-MM');
  const letzter = new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0)).getUTCDate();
  return { von: monat + '-01', bis: monat + '-' + String(letzter).padStart(2, '0') };
}
const monatText = m => m.slice(5, 7) + '/' + m.slice(0, 4);

function summen(db, id) {
  const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(id);
  const netto = r2(db.prepare('SELECT COALESCE(SUM(betrag),0) s FROM rechnung_position WHERE rechnung_id = ?').get(id).s);
  const ust = r2(netto * r.ust_prozent / 100);
  db.prepare('UPDATE rechnung SET netto = ?, ust = ?, brutto = ? WHERE id = ?').run(netto, ust, r2(netto + ust), id);
}
function positionAnlegen(db, rid, p) {
  const n = db.prepare('SELECT COALESCE(MAX(reihenfolge),0)+1 n FROM rechnung_position WHERE rechnung_id = ?').get(rid).n;
  db.prepare('INSERT INTO rechnung_position (rechnung_id, reihenfolge, bezeichnung, menge, einheit, einzelpreis, betrag, quelle, quelle_id, gruppe, objekt_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(rid, n, p.bezeichnung, r2(p.menge), p.einheit || null, r2(p.einzelpreis), r2(r2(p.menge) * r2(p.einzelpreis)), p.quelle || 'hand', p.quelle_id || null, p.gruppe || null, p.objekt_id || null);
}

// Was würde für dieses Objekt in diesem Monat abgerechnet? (ohne zu speichern)
function vorschlag(db, objektId, monat) {
  const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(objektId)); if (!o) throw new Error('Objekt nicht gefunden');
  const g = monatsgrenzen(monat), e = DB.einstellungen(db), pos = [], hinweise = [];
  const art = o.abrechnungsart || 'pauschale';
  if (art !== 'stunden') {
    if (o.monatspreis) pos.push({ bezeichnung: 'Unterhaltsreinigung laut Leistungsverzeichnis, ' + monatText(monat), menge: 1, einheit: 'Monat', einzelpreis: o.monatspreis, quelle: 'pauschale' });
    else hinweise.push('„' + o.name + '": kein Monatspreis hinterlegt (Objekt → Kalkulation → „Als Monatspreis übernehmen").');
  }
  if (art === 'stunden' || art === 'beides') {   // Ist-Stunden aus der Zeiterfassung (gestempelt, abzüglich Pausen)
    const min = db.prepare("SELECT kommen, gehen, pause_min FROM zeitbuchung WHERE objekt_id = ? AND gehen IS NOT NULL AND substr(kommen,1,10) BETWEEN ? AND ?").all(o.id, g.von, g.bis)
      .reduce(function (a, z) { return a + Math.max(0, (new Date(z.gehen.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 60000 - (z.pause_min || 0)); }, 0);
    const std = Math.round(min / 60 * 100) / 100;
    if (!o.stundensatz) hinweise.push('„' + o.name + '": Abrechnung nach Stunden, aber kein Stundensatz am Objekt.');
    else if (!std) hinweise.push('„' + o.name + '": keine gestempelten Stunden im ' + monatText(monat) + '.');
    else pos.push({ bezeichnung: 'Reinigungsleistung nach Aufwand (Ist-Zeiten laut Zeiterfassung), ' + monatText(monat), menge: std, einheit: 'Std.', einzelpreis: o.stundensatz, quelle: 'stunden' });
  }
  db.prepare('SELECT * FROM preisposition WHERE objekt_id = ? AND aktiv = 1 ORDER BY id').all(o.id).forEach(function (p) {
    if (p.art === 'monatlich' && p.monate && p.monate.split(',').map(Number).indexOf(Number(monat.slice(5, 7))) < 0) return;   // außerhalb der Saison
    if (p.art === 'monatlich') return pos.push({ bezeichnung: p.bezeichnung + ', ' + monatText(monat), menge: 1, einheit: p.einheit || 'Monat', einzelpreis: p.preis, quelle: 'preisposition', quelle_id: p.id });
    if (p.art !== 'je_ausfuehrung' || !p.turnus) return;
    const regel = T.lesen(p.turnus, o.reinigungstag); let n = 0;
    for (let d = g.von; d <= g.bis; d = plusTag(d, 1)) if (T.faellig(regel, d, o.bundesland).an) n++;
    if (n) pos.push({ bezeichnung: p.bezeichnung + ' (' + regel.text + ')', menge: n, einheit: p.einheit || 'Durchgang', einzelpreis: p.preis, quelle: 'preisposition', quelle_id: p.id });
  });
  const eigen = db.prepare("SELECT preis FROM preisposition WHERE objekt_id = ? AND art = 'stundensatz' AND aktiv = 1 ORDER BY id DESC LIMIT 1").get(o.id);
  const satz = eigen ? eigen.preis : (Number(String(e.stundensatz_abruf || '').replace(',', '.')) || 0);
  db.prepare("SELECT * FROM auftrag WHERE objekt_id = ? AND status = 'erledigt' AND rechnung_id IS NULL AND substr(COALESCE(erledigt_am, termin),1,10) <= ? ORDER BY id").all(o.id, g.bis).forEach(function (a) {
    const wann = String(a.erledigt_am || a.termin || '').slice(0, 10).split('-').reverse().join('.');
    if (a.festpreis != null) pos.push({ bezeichnung: 'Sonderleistung: ' + a.text + (wann ? ' (' + wann + ')' : ''), menge: 1, einheit: 'pauschal', einzelpreis: a.festpreis, quelle: 'auftrag', quelle_id: a.id });
    else if (a.stunden && satz) pos.push({ bezeichnung: 'Sonderleistung nach Aufwand: ' + a.text + (wann ? ' (' + wann + ')' : ''), menge: a.stunden, einheit: 'Std.', einzelpreis: satz, quelle: 'auftrag', quelle_id: a.id });
    else hinweise.push('Auftrag „' + a.text + '" hat weder Festpreis noch (Stunden + Stundensatz für Sonderleistungen) — nicht übernommen. Stundensatz unter Stammdaten → Einstellungen oder als Preisbaustein am Objekt.');
  });
  const gruppe = o.name + ([o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).length ? ' – ' + [o.strasse, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '');
  pos.forEach(function (p) { p.gruppe = gruppe; p.objekt_id = o.id; });
  return { objekt: o, von: g.von, bis: g.bis, positionen: pos, hinweise: hinweise };
}

// Wurde dieses Objekt für den Zeitraum schon abgerechnet — einzeln oder in einer Sammelrechnung?
function schonAbgerechnet(db, objektId, von, bis) {
  return db.prepare(`SELECT r.id, r.nummer FROM rechnung r WHERE r.zeitraum_von = ? AND r.zeitraum_bis = ? AND r.status <> 'storniert' AND r.storno_von IS NULL
    AND (r.objekt_id = ? OR EXISTS (SELECT 1 FROM rechnung_position p WHERE p.rechnung_id = r.id AND p.objekt_id = ?)) LIMIT 1`).get(von, bis, Number(objektId), Number(objektId));
}
function rechnungAnlegen(db, kundeId, objektId, g, positionen) {
  const e = DB.einstellungen(db), k = db.prepare('SELECT zahlungsziel_tage, steuerfall, privat FROM kunde WHERE id = ?').get(kundeId) || {};
  const rc = k.steuerfall === 'reverse_charge';
  const id = Number(db.prepare('INSERT INTO rechnung (kunde_id, objekt_id, zeitraum_von, zeitraum_bis, ust_prozent, zahlungsziel_tage, steuerfall, privat) VALUES (?,?,?,?,?,?,?,?)')
    .run(kundeId, objektId || null, g.von, g.bis, rc ? 0 : (Number(e.ust_prozent) || 19), k.zahlungsziel_tage || Number(e.zahlungsziel_tage) || 14, rc ? 'reverse_charge' : 'normal', k.privat ? 1 : 0).lastInsertRowid);
  positionen.forEach(function (p) { positionAnlegen(db, id, p); });
  summen(db, id);
  return id;
}

// Sammelrechnung: alle aktiven Objekte eines Kunden in einer Rechnung, je Objekt eine Gruppe
function entwurfKunde(db, kundeId, monat) {
  const k = db.prepare('SELECT * FROM kunde WHERE id = ?').get(Number(kundeId)); if (!k) throw new Error('Kunde nicht gefunden');
  const g = monatsgrenzen(monat), pos = [], hinweise = [], bereits = [];
  db.prepare("SELECT id, name FROM objekt WHERE kunde_id = ? AND status = 'aktiv' ORDER BY name").all(k.id).forEach(function (o) {
    const da = schonAbgerechnet(db, o.id, g.von, g.bis); if (da) { bereits.push(o.name + (da.nummer ? ' (' + da.nummer + ')' : ' (Entwurf)')); return; }
    const v = vorschlag(db, o.id, monat); pos.push.apply(pos, v.positionen); hinweise.push.apply(hinweise, v.hinweise);
  });
  if (!pos.length) throw new Error('Für „' + k.name + '" ' + monatText(monat) + ' gibt es nichts abzurechnen.' + (bereits.length ? ' Schon abgerechnet: ' + bereits.join(', ') + '.' : '') + (hinweise.length ? ' ' + hinweise.join(' ') : ''));
  return { id: rechnungAnlegen(db, k.id, null, g, pos), hinweise: hinweise.concat(bereits.length ? ['Schon abgerechnet und hier nicht enthalten: ' + bereits.join(', ')] : []) };
}

function entwurf(db, objektId, monat) {
  const v = vorschlag(db, objektId, monat), o = v.objekt;
  if (!o.kunde_id) throw new Error('„' + o.name + '" hat keinen Kunden — ohne Rechnungsempfänger keine Rechnung.');
  const da = schonAbgerechnet(db, o.id, v.von, v.bis);
  if (da) throw new Error('Für „' + o.name + '" ' + monatText(monat) + ' gibt es schon ' + (da.nummer ? 'die Rechnung ' + da.nummer : 'einen Entwurf') + '.');
  if (!v.positionen.length) throw new Error('Für „' + o.name + '" ' + monatText(monat) + ' gibt es nichts abzurechnen. ' + v.hinweise.join(' '));
  return { id: rechnungAnlegen(db, o.kunde_id, o.id, v, v.positionen), hinweise: v.hinweise };
}

// Abrechnungslauf für einen Monat: je Kunde Sammelrechnung oder je Objekt eine Rechnung; auf Wunsch gleich stellen
function lauf(db, monat, opt) {
  opt = opt || {}; monatsgrenzen(monat);
  const aus = { monat: monat, angelegt: [], gestellt: [], uebersprungen: [] };
  db.prepare("SELECT DISTINCT k.* FROM kunde k JOIN objekt o ON o.kunde_id = k.id WHERE o.status = 'aktiv' ORDER BY k.name").all().forEach(function (k) {
    const neu = [];
    if (k.sammelrechnung) { try { neu.push({ id: entwurfKunde(db, k.id, monat).id, wer: k.name + ' (Sammelrechnung)' }); } catch (e) { aus.uebersprungen.push({ objekt: k.name, grund: e.message }); } }
    else db.prepare("SELECT id, name FROM objekt WHERE kunde_id = ? AND status = 'aktiv' ORDER BY name").all(k.id).forEach(function (o) {
      try { neu.push({ id: entwurf(db, o.id, monat).id, wer: o.name }); } catch (e) { aus.uebersprungen.push({ objekt: o.name, grund: e.message }); }
    });
    neu.forEach(function (n) {
      aus.angelegt.push({ objekt: n.wer, id: n.id });
      if (opt.stellen) { try { aus.gestellt.push({ objekt: n.wer, id: n.id, nummer: stellen(db, n.id) }); } catch (e) { aus.uebersprungen.push({ objekt: n.wer, grund: 'als Entwurf angelegt, nicht gestellt: ' + e.message }); } }
    });
  });
  db.prepare('INSERT INTO abrechnungslauf (monat, art, angelegt, gestellt, ergebnis) VALUES (?,?,?,?,?)').run(monat, opt.art || 'hand', aus.angelegt.length, aus.gestellt.length, JSON.stringify(aus));
  return aus;
}
// Automatik: ab dem eingestellten Tag einmal je Monat den Vormonat abrechnen
function autoLauf(db, datum) {
  const e = DB.einstellungen(db); datum = datum || heute();
  if (e.auto_lauf_aktiv !== '1' || Number(datum.slice(8, 10)) < (Number(e.auto_lauf_tag) || 1)) return null;
  const d = new Date(datum.slice(0, 7) + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); const vormonat = d.toISOString().slice(0, 7);
  if (db.prepare("SELECT 1 FROM abrechnungslauf WHERE monat = ? AND art = 'auto'").get(vormonat)) return null;
  return lauf(db, vormonat, { stellen: e.auto_stellen === '1', art: 'auto' });
}

function voll(db, id) {
  const r = db.prepare('SELECT r.*, k.name kunde, k.ansprechpartner, k.anschrift, k.plz, k.ort, k.email kunde_email, k.kundennummer, k.leitweg_id, k.ust_id kunde_ust_id, k.rechnungsformat, k.rechnung_email, k.sammelrechnung, k.steuerfall kunde_steuerfall, k.privat kunde_privat, o.name objekt, o.strasse objekt_strasse, o.ort objekt_ort FROM rechnung r JOIN kunde k ON k.id = r.kunde_id LEFT JOIN objekt o ON o.id = r.objekt_id WHERE r.id = ?').get(Number(id));
  if (!r) return null;
  r.positionen = db.prepare('SELECT * FROM rechnung_position WHERE rechnung_id = ? ORDER BY reihenfolge, id').all(r.id);
  if (r.storno_von) r.storno_nummer = (db.prepare('SELECT nummer FROM rechnung WHERE id = ?').get(r.storno_von) || {}).nummer;
  const s = db.prepare('SELECT nummer FROM rechnung WHERE storno_von = ?').get(r.id); if (s) r.storniert_durch = s.nummer;
  return r;
}

function nurEntwurf(db, id) { const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(Number(id)); if (!r) throw new Error('Rechnung nicht gefunden'); if (r.status !== 'entwurf') throw new Error('Gestellte Rechnungen sind unveränderlich — Korrektur nur per Storno.'); return r; }
function position(db, b) {
  const r = nurEntwurf(db, b.rechnung_id);
  if (b.id && b.loeschen) db.prepare('DELETE FROM rechnung_position WHERE id = ? AND rechnung_id = ?').run(Number(b.id), r.id);
  else {
    if (!String(b.bezeichnung || '').trim()) throw new Error('Bezeichnung fehlt');
    const menge = Number(String(b.menge).replace(',', '.')), preis = Number(String(b.einzelpreis).replace(',', '.'));
    if (!isFinite(menge) || !isFinite(preis) || !menge) throw new Error('Menge und Einzelpreis prüfen');
    if (b.id) db.prepare('UPDATE rechnung_position SET bezeichnung = ?, menge = ?, einheit = ?, einzelpreis = ?, betrag = ? WHERE id = ? AND rechnung_id = ?').run(String(b.bezeichnung).trim(), r2(menge), b.einheit || null, r2(preis), r2(r2(menge) * r2(preis)), Number(b.id), r.id);
    else positionAnlegen(db, r.id, { bezeichnung: String(b.bezeichnung).trim(), menge: menge, einheit: b.einheit, einzelpreis: preis, quelle: 'hand' });
  }
  summen(db, r.id);
}

// Pflichtangaben einer Rechnung (§ 14 Abs. 4 UStG) — fehlt etwas, wird nicht gestellt
function pflichtLuecken(db, r) {
  const e = DB.einstellungen(db), l = [];
  if (!e.firma_name) l.push('Firmenname'); if (!e.firma_strasse || !e.firma_plz || !e.firma_ort) l.push('eigene Anschrift');
  if (!e.steuernummer && !e.ust_id) l.push('Steuernummer oder USt-IdNr.');
  if (!r.anschrift || !r.plz || !r.ort) l.push('Anschrift des Kunden „' + r.kunde + '"');
  const rc = (r.status === 'entwurf' ? r.kunde_steuerfall : r.steuerfall) === 'reverse_charge';
  if (rc && !r.kunde_ust_id) l.push('USt-IdNr. des Kunden (Pflicht bei § 13b UStG)');
  if (rc && !e.ust_id) l.push('eigene USt-IdNr. (Pflicht bei § 13b UStG in der E-Rechnung)');
  if (r.rechnungsformat === 'xrechnung') {   // XRechnung (BR-DE): Kontakt des Verkäufers, elektronische Adressen, Leitweg-ID
    if (!r.leitweg_id) l.push('Leitweg-ID des Kunden (XRechnung)');
    if (!(r.rechnung_email || r.kunde_email)) l.push('E-Mail des Kunden (XRechnung)');
    if (!e.firma_telefon) l.push('eigene Telefonnummer (XRechnung)');
    if (!e.firma_email) l.push('eigene E-Mail (XRechnung)');
  }
  return l;
}
function naechsteNummer(db, datum) {
  const e = DB.einstellungen(db), p = (e.rechnung_praefix || 'RE') + '-' + datum.slice(0, 4) + '-';
  const alt = db.prepare("SELECT nummer FROM rechnung WHERE nummer LIKE ? ORDER BY nummer DESC LIMIT 1").get(p + '%');
  return p + String((alt ? Number(alt.nummer.slice(p.length)) : 0) + 1).padStart(4, '0');
}
function stellen(db, id) {
  const r0 = nurEntwurf(db, id), r = voll(db, id);
  if (!r.positionen.length) throw new Error('Die Rechnung hat keine Position.');
  const l = pflichtLuecken(db, r); if (l.length) throw new Error('Pflichtangaben fehlen: ' + l.join(', ') + ' (Stammdaten → Einstellungen bzw. Kunde).');
  const e = DB.einstellungen(db), datum = heute();
  db.exec('BEGIN IMMEDIATE');
  try {
    const nr = naechsteNummer(db, datum);
    // Zahlungsziel beim Stellen: aktueller Wert am Kunden, sonst Standard (nicht der Stand beim Anlegen des Entwurfs)
    const kd = db.prepare('SELECT zahlungsziel_tage, steuerfall, privat FROM kunde WHERE id = ?').get(r0.kunde_id) || {};
    const ziel = kd.zahlungsziel_tage || Number(e.zahlungsziel_tage) || 14;
    // Steuerfall beim Stellen: aktueller Stand am Kunden (wie das Zahlungsziel) — Steuersatz und Summen neu
    const rc = kd.steuerfall === 'reverse_charge';
    db.prepare('UPDATE rechnung SET steuerfall = ?, privat = ?, ust_prozent = ? WHERE id = ?').run(rc ? 'reverse_charge' : 'normal', kd.privat ? 1 : 0, rc ? 0 : (Number(e.ust_prozent) || 19), r0.id);
    summen(db, r0.id);
    db.prepare("UPDATE rechnung SET nummer = ?, datum = ?, faellig = ?, zahlungsziel_tage = ?, status = 'gestellt' WHERE id = ?").run(nr, datum, plusTag(datum, ziel), ziel, r0.id);
    db.prepare("UPDATE auftrag SET status = 'abgerechnet', rechnung_id = ? WHERE id IN (SELECT quelle_id FROM rechnung_position WHERE rechnung_id = ? AND quelle = 'auftrag')").run(r0.id, r0.id);
    db.exec('COMMIT'); return nr;
  } catch (x) { db.exec('ROLLBACK'); throw x; }
}
function stornieren(db, id) {
  const r = voll(db, id); if (!r) throw new Error('Rechnung nicht gefunden');
  if (r.status !== 'gestellt' && r.status !== 'bezahlt') throw new Error('Nur gestellte Rechnungen lassen sich stornieren (Entwürfe einfach löschen).');
  if (r.storno_von) throw new Error('Eine Stornorechnung wird nicht storniert.');
  const datum = heute();
  db.exec('BEGIN IMMEDIATE');
  try {
    const nr = naechsteNummer(db, datum);
    const sid = Number(db.prepare("INSERT INTO rechnung (nummer, kunde_id, objekt_id, zeitraum_von, zeitraum_bis, datum, faellig, ust_prozent, status, storno_von, steuerfall, privat) VALUES (?,?,?,?,?,?,?,?,'gestellt',?,?,?)")
      .run(nr, r.kunde_id, r.objekt_id, r.zeitraum_von, r.zeitraum_bis, datum, datum, r.ust_prozent, r.id, r.steuerfall || 'normal', r.privat || 0).lastInsertRowid);
    r.positionen.forEach(function (p) { positionAnlegen(db, sid, { bezeichnung: 'Storno: ' + p.bezeichnung, menge: -p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis, quelle: 'storno', quelle_id: p.id, gruppe: p.gruppe }); });
    summen(db, sid);
    db.prepare("UPDATE rechnung SET status = 'storniert' WHERE id = ?").run(r.id);
    db.prepare("UPDATE auftrag SET status = 'erledigt', rechnung_id = NULL WHERE rechnung_id = ?").run(r.id);
    db.exec('COMMIT'); return nr;
  } catch (x) { db.exec('ROLLBACK'); throw x; }
}
function bezahlt(db, id, datum, zurueck) {
  const r = db.prepare('SELECT * FROM rechnung WHERE id = ?').get(Number(id)); if (!r) throw new Error('Rechnung nicht gefunden');
  if (zurueck) { if (r.status !== 'bezahlt') throw new Error('Rechnung ist nicht als bezahlt markiert.'); db.prepare("UPDATE rechnung SET status = 'gestellt', bezahlt_am = NULL WHERE id = ?").run(r.id); return; }
  if (r.status !== 'gestellt' || r.storno_von) throw new Error('Nur gestellte Rechnungen lassen sich als bezahlt markieren.');
  db.prepare("UPDATE rechnung SET status = 'bezahlt', bezahlt_am = ? WHERE id = ?").run(/^\d{4}-\d{2}-\d{2}$/.test(datum || '') ? datum : heute(), r.id);
}
function loeschen(db, id) { const r = nurEntwurf(db, id); db.prepare('DELETE FROM rechnung WHERE id = ?').run(r.id); }

// XRechnung im UBL-Aufbau (EN 16931, XRechnung 3.0). Nicht amtlich validiert — vor dem ersten Versand an eine
// Behörde einmal durch den KoSIT-Validator schicken.
function xrechnung(db, id) {
  const r = voll(db, id); if (!r || !r.nummer) throw new Error('Nur gestellte Rechnungen haben eine XRechnung.');
  const e = DB.einstellungen(db);
  const x = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const b = v => r2(v).toFixed(2);
  const einheit = s => /std/i.test(s || '') ? 'HUR' : /monat/i.test(s || '') ? 'MON' : 'C62';
  const kat = r.steuerfall === 'reverse_charge' ? 'AE' : 'S';
  const befreiung = kat === 'AE' ? '<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Steuerschuldnerschaft des Leistungsempfängers (§ 13b Abs. 2 Nr. 8 UStG)</cbc:TaxExemptionReason>' : '';
  const zeilen = r.positionen.map(function (p, i) {
    return '  <cac:InvoiceLine>\n    <cbc:ID>' + (i + 1) + '</cbc:ID>\n    <cbc:InvoicedQuantity unitCode="' + einheit(p.einheit) + '">' + p.menge + '</cbc:InvoicedQuantity>\n    <cbc:LineExtensionAmount currencyID="EUR">' + b(p.betrag) + '</cbc:LineExtensionAmount>\n' +
      '    <cac:Item>\n      <cbc:Name>' + x(p.bezeichnung) + '</cbc:Name>\n      <cac:ClassifiedTaxCategory><cbc:ID>' + kat + '</cbc:ID><cbc:Percent>' + r.ust_prozent + '</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>\n    </cac:Item>\n' +
      '    <cac:Price><cbc:PriceAmount currencyID="EUR">' + b(p.einzelpreis) + '</cbc:PriceAmount></cac:Price>\n  </cac:InvoiceLine>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<ubl:Invoice xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">\n' +
    '  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>\n  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>\n' +
    '  <cbc:ID>' + x(r.nummer) + '</cbc:ID>\n  <cbc:IssueDate>' + r.datum + '</cbc:IssueDate>\n  <cbc:DueDate>' + r.faellig + '</cbc:DueDate>\n  <cbc:InvoiceTypeCode>' + (r.storno_von ? '384' : '380') + '</cbc:InvoiceTypeCode>\n  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>\n' +
    '  <cbc:BuyerReference>' + x(r.leitweg_id || r.kundennummer || r.kunde) + '</cbc:BuyerReference>\n' +
    '  <cac:InvoicePeriod><cbc:StartDate>' + r.zeitraum_von + '</cbc:StartDate><cbc:EndDate>' + r.zeitraum_bis + '</cbc:EndDate></cac:InvoicePeriod>\n' +
    (r.storno_nummer ? '  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>' + x(r.storno_nummer) + '</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>\n' : '') +
    '  <cac:AccountingSupplierParty><cac:Party>\n    <cbc:EndpointID schemeID="EM">' + x(e.firma_email) + '</cbc:EndpointID>\n    <cac:PostalAddress><cbc:StreetName>' + x(e.firma_strasse) + '</cbc:StreetName><cbc:CityName>' + x(e.firma_ort) + '</cbc:CityName><cbc:PostalZone>' + x(e.firma_plz) + '</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>\n' +
    (e.ust_id ? '    <cac:PartyTaxScheme><cbc:CompanyID>' + x(e.ust_id) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n' : '') +
    (e.steuernummer ? '    <cac:PartyTaxScheme><cbc:CompanyID>' + x(e.steuernummer) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n' : '') +
    '    <cac:PartyLegalEntity><cbc:RegistrationName>' + x(e.firma_name) + '</cbc:RegistrationName></cac:PartyLegalEntity>\n' +
    '    <cac:Contact><cbc:Name>' + x(e.geschaeftsfuehrung || e.firma_name) + '</cbc:Name><cbc:Telephone>' + x(e.firma_telefon) + '</cbc:Telephone><cbc:ElectronicMail>' + x(e.firma_email) + '</cbc:ElectronicMail></cac:Contact>\n  </cac:Party></cac:AccountingSupplierParty>\n' +
    '  <cac:AccountingCustomerParty><cac:Party>\n    <cbc:EndpointID schemeID="EM">' + x(r.kunde_email) + '</cbc:EndpointID>\n    <cac:PostalAddress><cbc:StreetName>' + x(r.anschrift) + '</cbc:StreetName><cbc:CityName>' + x(r.ort) + '</cbc:CityName><cbc:PostalZone>' + x(r.plz) + '</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>\n' +
    (r.kunde_ust_id ? '    <cac:PartyTaxScheme><cbc:CompanyID>' + x(r.kunde_ust_id) + '</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>\n' : '') +
    '    <cac:PartyLegalEntity><cbc:RegistrationName>' + x(r.kunde) + '</cbc:RegistrationName></cac:PartyLegalEntity>\n  </cac:Party></cac:AccountingCustomerParty>\n' +
    (e.iban ? '  <cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cbc:PaymentID>' + x(r.nummer) + '</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>' + x(e.iban.replace(/\s/g, '')) + '</cbc:ID><cbc:Name>' + x(e.firma_name) + '</cbc:Name>' + (e.bic ? '<cac:FinancialInstitutionBranch><cbc:ID>' + x(e.bic) + '</cbc:ID></cac:FinancialInstitutionBranch>' : '') + '</cac:PayeeFinancialAccount></cac:PaymentMeans>\n' : '') +
    '  <cac:PaymentTerms><cbc:Note>Zahlbar bis ' + r.faellig.split('-').reverse().join('.') + ' ohne Abzug.</cbc:Note></cac:PaymentTerms>\n' +
    '  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">' + b(r.ust) + '</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">' + b(r.netto) + '</cbc:TaxableAmount><cbc:TaxAmount currencyID="EUR">' + b(r.ust) + '</cbc:TaxAmount><cac:TaxCategory><cbc:ID>' + kat + '</cbc:ID><cbc:Percent>' + r.ust_prozent + '</cbc:Percent>' + befreiung + '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>\n' +
    '  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">' + b(r.netto) + '</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">' + b(r.netto) + '</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">' + b(r.brutto) + '</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">' + b(r.brutto) + '</cbc:PayableAmount></cac:LegalMonetaryTotal>\n' +
    zeilen + '\n</ubl:Invoice>\n';
}

module.exports = { vorschlag, entwurf, entwurfKunde, lauf, autoLauf, schonAbgerechnet, voll, position, stellen, stornieren, bezahlt, loeschen, xrechnung, pflichtLuecken, monatsgrenzen };
