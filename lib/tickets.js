// tickets.js — Mängel und Reklamationen als Ticket mit Ablauf (CleaningOS-Abgleich 18.11.2026, Baustein 4).
// Vorher: Mangel = Text, Frist, offen/erledigt. Jetzt zusätzlich:
//   · Priorität, Bereich, zuständige Kraft (nur aus dem Stammteam des Objekts oder die Objektleitung)
//   · Bearbeitungsstand neu → zugewiesen → in Arbeit (solange status = 'offen'), danach erledigt → geprüft
//   · Erledigen in der App nur MIT Foto (Nachweis für den Kunden)
//   · Verlauf je Ticket (Statuswechsel, Zuweisung, Kommentare); öffentliche Einträge sieht der Melder
//   · Büroentscheidung bei Beanstandungen: Nachbesserung, Gutschrift, Sub belasten, unbegründet — mit Verursacher
// Die Spalte status bleibt offen/erledigt, damit alle bisherigen Zählungen („offene Mängel") unverändert stimmen.
'use strict';

const PRIO = { hoch: 'hoch', normal: 'normal', niedrig: 'niedrig' };
const STAND = { neu: 'neu', zugewiesen: 'zugewiesen', in_arbeit: 'in Arbeit' };
const ENTSCHEIDUNG = { nachbesserung: 'Nachbesserung', gutschrift: 'Gutschrift', sub_belasten: 'Subunternehmer belasten', unbegruendet: 'unbegründet', ohne: 'keine Folgen' };
const BEREICHE = ['Büro', 'Sanitär', 'Küche', 'Treppenhaus', 'Eingang', 'Glas', 'Boden', 'Außenbereich', 'Müll', 'Sonstiges'];

function tabellen(db) {
  const sp = db.prepare('PRAGMA table_info(mangel)').all().map(function (c) { return c.name; });
  const nach = (s, def) => { if (sp.indexOf(s) < 0) db.exec('ALTER TABLE mangel ADD COLUMN ' + s + ' ' + def); };
  nach('prioritaet', "TEXT DEFAULT 'normal'"); nach('bereich', 'TEXT'); nach('zustaendig_id', 'INTEGER'); nach('stand', "TEXT DEFAULT 'neu'");
  nach('fotos', 'TEXT'); nach('erledigt_foto', 'TEXT'); nach('erledigt_von', 'TEXT'); nach('geprueft_am', 'TEXT'); nach('geprueft_von', 'TEXT');
  nach('entscheidung', 'TEXT'); nach('verursacher', 'TEXT'); nach('geraet', 'TEXT'); nach('melder_kontakt', 'TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS mangel_verlauf (
    id INTEGER PRIMARY KEY, mangel_id INTEGER NOT NULL REFERENCES mangel(id) ON DELETE CASCADE, zeit TEXT DEFAULT (datetime('now','localtime')),
    wer TEXT, art TEXT DEFAULT 'kommentar', text TEXT NOT NULL, oeffentlich INTEGER DEFAULT 1)`);
}

function verlauf(db, id, wer, art, text, oeffentlich) {
  db.prepare('INSERT INTO mangel_verlauf (mangel_id, wer, art, text, oeffentlich) VALUES (?,?,?,?,?)').run(Number(id), wer || null, art || 'kommentar', String(text).slice(0, 2000), oeffentlich === false ? 0 : 1);
}
function holen(db, id) {
  const m = db.prepare('SELECT m.*, o.name objekt, r.name raum, z.name zustaendig FROM mangel m JOIN objekt o ON o.id = m.objekt_id LEFT JOIN raum r ON r.id = m.raum_id LEFT JOIN mitarbeiter z ON z.id = m.zustaendig_id WHERE m.id = ?').get(Number(id));
  if (!m) return null;
  m.fotos = JSON.parse(m.fotos || '[]'); if (m.foto && m.fotos.indexOf(m.foto) < 0) m.fotos.unshift(m.foto);
  m.verlauf = db.prepare('SELECT * FROM mangel_verlauf WHERE mangel_id = ? ORDER BY id').all(m.id);
  return m;
}
// Wer darf das Ticket bekommen? Stammteam des Objekts + Objektleitung + wer dort heute/kommend eine Schicht hat
function kandidaten(db, objektId) {
  const o = db.prepare('SELECT objektleitung_id FROM objekt WHERE id = ?').get(Number(objektId)) || {};
  const l = db.prepare(`SELECT DISTINCT m.id, m.name FROM mitarbeiter m WHERE m.aktiv = 1 AND (m.id IN (SELECT mitarbeiter_id FROM einsatz WHERE objekt_id = ?)
      OR m.id IN (SELECT mitarbeiter_id FROM schicht WHERE objekt_id = ? AND datum >= date('now','localtime','-7 day')) OR m.id = ?) ORDER BY m.name`).all(Number(objektId), Number(objektId), o.objektleitung_id || 0);
  return l.map(function (m) { return Object.assign(m, { objektleitung: m.id === o.objektleitung_id }); });
}

// Neues Ticket (Quelle: mitarbeiter, kunde, buero, portal, pruefung, chat). Gibt die id zurück.
function anlegen(db, t) {
  const text = String(t.text || '').trim(); if (!text) throw new Error('Bitte beschreiben, was nicht in Ordnung ist.');
  const fotos = (t.fotos || []).filter(Boolean).slice(0, 4);
  const prio = PRIO[t.prioritaet] ? t.prioritaet : 'normal';
  const frist = /^\d{4}-\d{2}-\d{2}$/.test(t.frist || '') ? t.frist : new Date(Date.now() + (prio === 'hoch' ? 0 : prio === 'niedrig' ? 3 : 1) * 86400000).toISOString().slice(0, 10);
  const id = Number(db.prepare('INSERT INTO mangel (objekt_id, raum_id, text, foto, fotos, quelle, gemeldet_von, frist, prioritaet, bereich, geraet, melder_kontakt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(Number(t.objekt_id), t.raum_id ? Number(t.raum_id) : null, text.slice(0, 2000), fotos[0] || null, JSON.stringify(fotos), t.quelle || 'buero', t.gemeldet_von || null, frist, prio,
      BEREICHE.indexOf(t.bereich) >= 0 ? t.bereich : null, t.geraet || null, t.melder_kontakt ? String(t.melder_kontakt).slice(0, 120) : null).lastInsertRowid);
  verlauf(db, id, t.gemeldet_von, 'status', 'Gemeldet');
  return id;
}

function zuweisen(db, id, mid, wer) {
  const m = holen(db, id); if (!m) throw new Error('Ticket nicht gefunden');
  if (m.status !== 'offen') throw new Error('Das Ticket ist schon erledigt.');
  if (!mid) { db.prepare("UPDATE mangel SET zustaendig_id = NULL, stand = 'neu' WHERE id = ?").run(m.id); verlauf(db, m.id, wer, 'zuweisung', 'Zuweisung aufgehoben', false); return null; }
  const k = kandidaten(db, m.objekt_id).find(function (x) { return x.id === Number(mid); });
  if (!k) throw new Error('Zuweisen geht nur an Kräfte aus dem Team dieses Objekts oder an die Objektleitung.');
  db.prepare("UPDATE mangel SET zustaendig_id = ?, stand = CASE WHEN stand = 'in_arbeit' THEN stand ELSE 'zugewiesen' END WHERE id = ?").run(k.id, m.id);
  verlauf(db, m.id, wer, 'zuweisung', 'Zugewiesen an ' + k.name, false);   // Name nur intern — der Melder sieht nur, dass es weitergegeben ist
  if (!db.prepare("SELECT 1 FROM mangel_verlauf WHERE mangel_id = ? AND oeffentlich = 1 AND text = 'An unser Team vor Ort weitergegeben'").get(m.id)) verlauf(db, m.id, wer, 'status', 'An unser Team vor Ort weitergegeben', true);
  return k;
}

function standSetzen(db, id, stand, wer) {
  const m = holen(db, id); if (!m) throw new Error('Ticket nicht gefunden');
  if (!STAND[stand]) throw new Error('Unbekannter Stand');
  if (m.status !== 'offen') throw new Error('Das Ticket ist schon erledigt.');
  db.prepare('UPDATE mangel SET stand = ? WHERE id = ?').run(stand, m.id); verlauf(db, m.id, wer, 'status', 'Stand: ' + STAND[stand]);
}

// Erledigen: mit Foto (Pflicht, wenn pflichtFoto), Notiz geht in den Verlauf
function erledigen(db, id, o) {
  const m = holen(db, id); if (!m) throw new Error('Ticket nicht gefunden');
  if (m.status !== 'offen') throw new Error('Das Ticket ist schon erledigt.');
  if (o.pflichtFoto && !o.foto) throw new Error('Bitte ein Foto vom erledigten Zustand machen.');
  db.prepare("UPDATE mangel SET status = 'erledigt', erledigt_am = datetime('now','localtime'), erledigt_foto = COALESCE(?, erledigt_foto), erledigt_von = ? WHERE id = ?").run(o.foto || null, o.wer || null, m.id);
  verlauf(db, m.id, o.wer, 'status', 'Erledigt' + (o.notiz ? ': ' + String(o.notiz).trim() : '') + (o.foto ? ' (mit Foto)' : ''));
}
function wiederOeffnen(db, id, wer, grund) {
  const m = holen(db, id); if (!m) throw new Error('Ticket nicht gefunden');
  db.prepare("UPDATE mangel SET status = 'offen', erledigt_am = NULL, geprueft_am = NULL, geprueft_von = NULL, stand = CASE WHEN zustaendig_id IS NULL THEN 'neu' ELSE 'zugewiesen' END WHERE id = ?").run(m.id);
  verlauf(db, m.id, wer, 'status', 'Wieder geöffnet' + (grund ? ': ' + grund : ''));
}
function pruefen(db, id, wer) {
  const m = holen(db, id); if (!m) throw new Error('Ticket nicht gefunden');
  if (m.status !== 'erledigt') throw new Error('Geprüft werden kann erst ein erledigtes Ticket.');
  db.prepare("UPDATE mangel SET geprueft_am = datetime('now','localtime'), geprueft_von = ? WHERE id = ?").run(wer || null, m.id);
  verlauf(db, m.id, wer, 'status', 'Nachkontrolle: in Ordnung');
}
function entscheiden(db, id, entscheidung, verursacher, wer) {
  const m = holen(db, id); if (!m) throw new Error('Ticket nicht gefunden');
  if (entscheidung && !ENTSCHEIDUNG[entscheidung]) throw new Error('Unbekannte Entscheidung');
  db.prepare('UPDATE mangel SET entscheidung = ?, verursacher = ? WHERE id = ?').run(entscheidung || null, verursacher ? String(verursacher).slice(0, 120) : null, m.id);
  verlauf(db, m.id, wer, 'entscheidung', 'Entscheidung: ' + (ENTSCHEIDUNG[entscheidung] || '—') + (verursacher ? ' · Verursacher: ' + verursacher : ''), false);
}

// Liste fürs Büro (alle Felder) und für die App (nur meine)
function liste(db, f) {
  f = f || {};
  const w = [], p = [];
  if (f.status === 'offen' || f.status === 'erledigt') { w.push('m.status = ?'); p.push(f.status); }
  if (f.objekt) { w.push('m.objekt_id = ?'); p.push(Number(f.objekt)); }
  if (f.zustaendig) { w.push('m.zustaendig_id = ?'); p.push(Number(f.zustaendig)); }
  return db.prepare(`SELECT m.*, o.name objekt, r.name raum, z.name zustaendig, (SELECT COUNT(*) FROM mangel_verlauf v WHERE v.mangel_id = m.id AND v.art = 'kommentar') kommentare
      FROM mangel m JOIN objekt o ON o.id = m.objekt_id LEFT JOIN raum r ON r.id = m.raum_id LEFT JOIN mitarbeiter z ON z.id = m.zustaendig_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY CASE m.prioritaet WHEN 'hoch' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, m.frist, m.id DESC LIMIT 500`).all(...p)
    .map(function (m) { m.fotos = JSON.parse(m.fotos || '[]'); m.ueberfaellig = m.status === 'offen' && m.frist && m.frist < new Date().toISOString().slice(0, 10); return m; });
}

// Auswertung nach Objekt und Entscheidung (für Kündigungsrisiko und Sub-Belastung)
function auswertung(db, von, bis) {
  return db.prepare(`SELECT o.name objekt, COUNT(*) gesamt, SUM(m.quelle IN ('kunde','portal')) reklamationen, SUM(m.status = 'offen') offen,
      SUM(m.entscheidung = 'gutschrift') gutschriften, SUM(m.entscheidung = 'sub_belasten') sub_belastet, SUM(m.entscheidung = 'nachbesserung') nachbesserungen
      FROM mangel m JOIN objekt o ON o.id = m.objekt_id WHERE substr(m.gemeldet_am,1,10) BETWEEN ? AND ? GROUP BY o.id ORDER BY reklamationen DESC, gesamt DESC`).all(von, bis);
}

module.exports = { PRIO, STAND, ENTSCHEIDUNG, BEREICHE, tabellen, verlauf, holen, kandidaten, anlegen, zuweisen, standSetzen, erledigen, wiederOeffnen, pruefen, entscheiden, liste, auswertung };
