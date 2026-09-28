// plan.js — Tagesplan: welche Leistungen fallen an einem Tag je Objekt und Raum an, was ist erledigt.
'use strict';
const T = require('./turnus');

// Alle Aufgaben eines Tages, gruppiert Objekt → Raum. Optional nur ein Objekt / ein Mitarbeiter.
function tag(db, datum, opt) {
  opt = opt || {};
  let sql = `SELECT p.id pid, p.turnus, COALESCE(p.minuten, t.minuten) minuten, t.id tid, t.name taetigkeit, t.anleitung,
                    r.id rid, r.name raum, r.etage, r.belag, r.flaeche_m2, r.reihenfolge, r.code,
                    o.id oid, o.name objekt, o.strasse, o.ort, o.bundesland, o.reinigungstag, k.name kunde
               FROM lv_position p JOIN raum r ON r.id = p.raum_id JOIN taetigkeit t ON t.id = p.taetigkeit_id
               JOIN objekt o ON o.id = p.objekt_id LEFT JOIN kunde k ON k.id = o.kunde_id
              WHERE o.status = 'aktiv'`;
  const par = [];
  if (opt.objekt) { sql += ' AND o.id = ?'; par.push(Number(opt.objekt)); }
  if (opt.mitarbeiter) { sql += " AND (o.id IN (SELECT objekt_id FROM einsatz WHERE mitarbeiter_id = ?) OR o.id IN (SELECT objekt_id FROM schicht WHERE mitarbeiter_id = ? AND datum = ? AND status <> 'abgesagt'))"; par.push(Number(opt.mitarbeiter), Number(opt.mitarbeiter), datum); }
  sql += ' ORDER BY o.name, r.reihenfolge, r.id, t.id';
  const zeilen = db.prepare(sql).all(...par);
  const erledigt = {};
  db.prepare(`SELECT e.position_id, e.zeit, e.foto, m.name wer FROM erledigung e LEFT JOIN mitarbeiter m ON m.id = e.mitarbeiter_id WHERE e.datum = ?`)
    .all(datum).forEach(function (e) { erledigt[e.position_id] = e; });
  const objekte = [], nachId = {};
  zeilen.forEach(function (z) {
    const regel = T.lesen(z.turnus, z.reinigungstag);
    const f = T.faellig(regel, datum, z.bundesland);
    if (!f.an) return;
    let o = nachId[z.oid];
    if (!o) { o = nachId[z.oid] = { id: z.oid, name: z.objekt, kunde: z.kunde, strasse: z.strasse, ort: z.ort, raeume: [], soll: 0, fertig: 0, sollMinuten: 0 }; objekte.push(o); }
    let r = o.raeume.find(function (x) { return x.id === z.rid; });
    if (!r) { r = { id: z.rid, name: z.raum, etage: z.etage, belag: z.belag, flaeche: z.flaeche_m2, code: z.code, aufgaben: [] }; o.raeume.push(r); }
    const e = erledigt[z.pid] || null;
    r.aufgaben.push({ position: z.pid, taetigkeit: z.taetigkeit, anleitung: z.anleitung, turnus: regel.text, minuten: z.minuten, erledigt: e });
    o.soll++; if (e) o.fertig++; o.sollMinuten += Number(z.minuten) || 0;
  });
  return { datum: datum, wochentag: T.TAGNAMEN[T.wochentag(datum)], objekte: objekte,
           soll: objekte.reduce(function (a, o) { return a + o.soll; }, 0), fertig: objekte.reduce(function (a, o) { return a + o.fertig; }, 0) };
}

// Wochenraster eines Objekts: für jede LV-Position die 7 Tage ab `montag` (✔ fällig / leer)
function woche(db, objektId, montag) {
  const o = db.prepare('SELECT * FROM objekt WHERE id = ?').get(Number(objektId));
  if (!o) return null;
  const tage = []; for (let i = 0; i < 7; i++) { const d = new Date(montag + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); tage.push(d.toISOString().slice(0, 10)); }
  const pos = db.prepare(`SELECT p.id, p.turnus, t.name taetigkeit, r.name raum FROM lv_position p JOIN raum r ON r.id = p.raum_id
                          JOIN taetigkeit t ON t.id = p.taetigkeit_id WHERE p.objekt_id = ? ORDER BY r.reihenfolge, r.id, t.id`).all(o.id);
  return { tage: tage, zeilen: pos.map(function (p) { const regel = T.lesen(p.turnus, o.reinigungstag); return { raum: p.raum, taetigkeit: p.taetigkeit, turnus: regel.text, tage: tage.map(function (d) { const f = T.faellig(regel, d, o.bundesland); return f.an ? 1 : (f.grund && /Feiertag/.test(f.grund) ? 'F' : 0); }) }; }) };
}

module.exports = { tag, woche };
