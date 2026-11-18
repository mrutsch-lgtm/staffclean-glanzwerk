// angebot.js — Angenommenes Angebot aus dem Vertrieb (vertrieb.staffclean.de) wird Objekt + Leistungsverzeichnis in Glanzwerk
// (CleaningOS-Abgleich 18.11.2026, Baustein 9: „Leistungsverzeichnis — schreibgeschützte Fassung aus dem angenommenen Angebot").
// Vorher musste das Büro jedes Objekt nach dem Auftrag von Hand neu anlegen und das LV abtippen.
//
// Weg: Glanzwerk meldet sich mit demselben signierten Zettel im Vertrieb an wie der Knopf „Vertrieb" (lib/vertrieb.js,
// im Namen des Büro-Kontos, das übernimmt) und liest dort nur: das Angebot (/api/state) und den Annahme-Stand
// (/api/offers/<nr>/annahme). Am Vertrieb wird nichts geändert und nichts geschrieben.
// Das LV des Angebots (extra_data.lv) passt 1:1: Bereiche → Räume (Name, Belag, Fläche), Spalten → Tätigkeiten, Zellen → Turnus.
// Übernommene Positionen tragen quelle = 'angebot' und sind gesperrt; ändern geht nur ausdrücklich als Nachtrag.
'use strict';
const VERTRIEB = require('./vertrieb');
const T = require('./turnus');

function tabellen(db) {
  const sp = t => db.prepare('PRAGMA table_info(' + t + ')').all().map(function (c) { return c.name; });
  if (sp('objekt').indexOf('angebot_nr') < 0) db.exec('ALTER TABLE objekt ADD COLUMN angebot_nr TEXT');
  if (sp('objekt').indexOf('angebot_am') < 0) db.exec('ALTER TABLE objekt ADD COLUMN angebot_am TEXT');
  if (sp('lv_position').indexOf('quelle') < 0) db.exec("ALTER TABLE lv_position ADD COLUMN quelle TEXT DEFAULT 'buero'");
  if (sp('lv_position').indexOf('geaendert_am') < 0) db.exec('ALTER TABLE lv_position ADD COLUMN geaendert_am TEXT');
}

// Im Vertrieb anmelden (Zettel) und ein Angebot mit LV und Annahme-Stand lesen
async function abholen(benutzer, nummer) {
  const nr = String(nummer || '').trim().toUpperCase();
  if (!/^[A-Z]{1,4}\d{4}-\d{2,6}$/.test(nr)) throw new Error('Bitte die Angebotsnummer so eingeben, wie sie auf dem Angebot steht (z. B. SC2026-00104).');
  const z = VERTRIEB.zettel(benutzer); if (!z) throw new Error('Die Verbindung zum Vertrieb ist auf diesem Rechner nicht eingerichtet (Schlüssel fehlt).');
  const basis = process.env.STAFFCLEAN_VERTRIEB_URL || VERTRIEB.ZIEL_URL;
  const a = await fetch(basis + '/sso?t=' + encodeURIComponent(z), { redirect: 'manual' });
  const keks = (a.headers.getSetCookie ? a.headers.getSetCookie() : [a.headers.get('set-cookie') || '']).map(function (c) { return String(c).split(';')[0]; }).filter(Boolean).join('; ');
  if (a.status >= 400 || !keks) throw new Error('Anmeldung im Vertrieb nicht möglich (' + a.status + ').');
  const hol = async p => { const r = await fetch(basis + p, { headers: { Cookie: keks, Accept: 'application/json' } }); if (!r.ok) throw new Error('Vertrieb antwortet mit ' + r.status + ' auf ' + p.split('?')[0]); return r.json(); };
  const st = await hol('/api/state');
  const o = (st.offers || []).find(function (x) { return String(x.number || '').toUpperCase() === nr; });
  if (!o) throw new Error('Angebot ' + nr + ' gibt es im Vertrieb nicht.');
  let extra = o.extra_data; if (typeof extra === 'string') { try { extra = JSON.parse(extra); } catch (e) { extra = {}; } }
  let items = o.items; if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
  let annahme = null; try { const an = await hol('/api/offers/' + encodeURIComponent(nr) + '/annahme'); annahme = (an.vorgaenge || []).find(function (v) { return v.status === 'angenommen'; }) || null; } catch (e) { annahme = null; }
  return { nummer: nr, firma: o.company || '', ansprechpartner: o.contact_name || '', email: o.email || '', anschrift: o.address || '', plz: o.plz || '', ort: o.ort || '', betreff: o.subject || '', projekt: o.project || '',
    status: o.status || '', netto: Number(o.total_net) || 0, positionen: (items || []).map(function (p) { return { text: p.description || p.text || p.name || '', menge: p.quantity || p.menge || 1, einheit: p.unit || p.einheit || '', preis: Number(p.price || p.preis || 0) }; }),
    lv: normalisieren(extra && extra.lv), angenommen: annahme ? { am: annahme.accepted_at, von: annahme.signer_name } : (o.status === 'accepted' ? { am: o.updated || null, von: null } : null) };
}

// LV-Form des Vertriebs (alt: bereiche[].zeilen, neu: spalten + bereiche[].werte) auf eine Form bringen
function normalisieren(lv) {
  if (!lv || !Array.isArray(lv.bereiche)) return null;
  if (!lv.spalten) {
    const spalten = [], idx = {};
    lv.bereiche.forEach(function (b) { (b.zeilen || []).forEach(function (z) { const t = String(z.t || '').trim(); if (t && !(t in idx)) { idx[t] = spalten.length; spalten.push({ t: t }); } }); });
    lv = { titel: lv.titel, objekt: lv.objekt, spalten: spalten, bereiche: lv.bereiche.map(function (b) { const w = spalten.map(function () { return ''; }); (b.zeilen || []).forEach(function (z) { const t = String(z.t || '').trim(); if (t in idx) w[idx[t]] = z.turnus || ''; }); return { name: b.name, belag: b.belag, flaeche: b.flaeche, werte: w }; }) };
  }
  return { titel: lv.titel || '', objekt: lv.objekt || '', spalten: lv.spalten.map(function (s) { return String(s.t || s || '').trim(); }),
    bereiche: lv.bereiche.map(function (b) { return { name: String(b.name || '').trim(), belag: b.belag || '', flaeche: b.flaeche || '', werte: (b.werte || []).map(function (w) { return String(w || '').trim(); }) }; }).filter(function (b) { return b.name; }) };
}

// Vorschau: was würde angelegt, welche Turnus-Angaben versteht Glanzwerk nicht
function vorschau(db, a) {
  const raeume = (a.lv ? a.lv.bereiche : []).map(function (b) {
    const leist = []; b.werte.forEach(function (w, i) { if (!w || /^[-–—x]$/i.test(w)) return; const r = T.lesen(w); leist.push({ taetigkeit: a.lv.spalten[i], turnus: w, verstanden: r.art !== 'unbekannt', regel: r.text }); });
    return { name: b.name, belag: b.belag, flaeche: zahlAus(b.flaeche), leistungen: leist };
  });
  const da = db.prepare('SELECT id, name FROM objekt WHERE angebot_nr = ?').get(a.nummer);
  return { nummer: a.nummer, firma: a.firma, objekt: (a.lv && a.lv.objekt) || a.projekt || a.betreff || a.firma, angenommen: a.angenommen, status: a.status, netto: a.netto,
    kunde: db.prepare('SELECT id, name FROM kunde WHERE lower(name) = lower(?)').get(a.firma) || null, schonDa: da || null, raeume: raeume,
    leistungen: raeume.reduce(function (s, r) { return s + r.leistungen.length; }, 0), unverstanden: [].concat(...raeume.map(function (r) { return r.leistungen.filter(function (l) { return !l.verstanden; }).map(function (l) { return r.name + ' · ' + l.taetigkeit + ': „' + l.turnus + '"'; }); })) };
}
function zahlAus(v) { const m = String(v || '').replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/); return m ? Number(m[0]) : null; }

// Übernehmen: Kunde (vorhanden oder neu), Objekt, Räume, Tätigkeiten, LV-Positionen (gesperrt, quelle = angebot)
function uebernehmen(db, a, o) {
  o = o || {};
  if (!a.angenommen && !o.trotzdem) { const f = new Error('Das Angebot ist im Vertrieb nicht als angenommen markiert. Nur übernehmen, wenn der Auftrag schriftlich vorliegt.'); f.code = 409; throw f; }
  if (db.prepare('SELECT 1 FROM objekt WHERE angebot_nr = ?').get(a.nummer)) { const f = new Error('Aus Angebot ' + a.nummer + ' gibt es schon ein Objekt.'); f.code = 409; throw f; }
  if (!a.lv || !a.lv.bereiche.length) { const f = new Error('Das Angebot hat kein Leistungsverzeichnis — bitte das Objekt von Hand anlegen.'); f.code = 400; throw f; }
  const v = vorschau(db, a);
  let ergebnis;
  db.exec('BEGIN');
  try {
    let kid = v.kunde ? v.kunde.id : null;
    if (!kid) kid = Number(db.prepare('INSERT INTO kunde (name, ansprechpartner, email, anschrift, plz, ort) VALUES (?,?,?,?,?,?)').run(a.firma || v.objekt, a.ansprechpartner || null, a.email || null, a.anschrift || null, a.plz || null, a.ort || null).lastInsertRowid);
    const oid = Number(db.prepare("INSERT INTO objekt (kunde_id, name, notiz, angebot_nr, angebot_am, status) VALUES (?,?,?,?,date('now','localtime'),'aktiv')").run(kid, String(o.name || v.objekt).slice(0, 120), 'Aus Angebot ' + a.nummer + (a.angenommen && a.angenommen.am ? ', angenommen ' + String(a.angenommen.am).slice(0, 10).split('-').reverse().join('.') : ''), a.nummer).lastInsertRowid);
    if (o.monatspreis && a.netto > 0) db.prepare('UPDATE objekt SET monatspreis = ? WHERE id = ?').run(a.netto, oid);
    const tid = {};
    a.lv.spalten.forEach(function (t) { if (!t) return; const d = db.prepare('SELECT id FROM taetigkeit WHERE lower(name) = lower(?)').get(t); tid[t] = d ? d.id : Number(db.prepare('INSERT INTO taetigkeit (name, kategorie) VALUES (?, ?)').run(t, 'aus Angebot').lastInsertRowid); });
    let n = 0, p = 0;
    v.raeume.forEach(function (r) {
      n++;
      const rid = Number(db.prepare('INSERT INTO raum (objekt_id, name, belag, flaeche_m2, reihenfolge, code) VALUES (?,?,?,?,?,?)').run(oid, r.name.slice(0, 120), r.belag || null, r.flaeche, n, 'R' + oid + '-' + n + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()).lastInsertRowid);
      r.leistungen.filter(function (l) { return l.verstanden; }).forEach(function (l) { db.prepare("INSERT OR IGNORE INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus, quelle) VALUES (?,?,?,?,'angebot')").run(oid, rid, tid[l.taetigkeit], l.turnus); p++; });
    });
    db.exec('COMMIT');
    ergebnis = { objekt_id: oid, kunde_id: kid, kundeNeu: !v.kunde, raeume: n, positionen: p, unverstanden: v.unverstanden };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return ergebnis;
}

module.exports = { tabellen, abholen, normalisieren, vorschau, uebernehmen };
