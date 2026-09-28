// kommunikation.js — Chat zwischen den Abteilungen, Mängel- und Meldechat, Direktnachrichten und ein Aufgaben-Board
// wie Microsoft Planner (mehrere Boards, Spalten, Karten mit Zuständigen, Fälligkeit, Priorität, Checkliste, Kommentaren).
//
// Teilnehmer sind Büro-Konten („b<id>") und Mitarbeiter aus der App („m<id>"). Das Büro sieht alle Abteilungskanäle;
// Mitarbeiter sehen „Mängel & Meldungen", „Team" und ihre Direktnachrichten — und die Aufgaben, die ihnen zugewiesen sind.
// Eine Meldung mit Objekt im Mängelkanal legt sofort einen Mangel an (erscheint am Objekt, in Qualität und beim Kunden).
'use strict';

const KANAELE = [
  ['maengel', 'Mängel & Meldungen', 'Mängel, Schäden, fehlendes Material — mit Foto und Objekt', true],
  ['team', 'Team', 'Ansagen an alle Mitarbeiter', true],
  ['objektleitung', 'Objektleitung', 'Abstimmung der Objektleiter', false],
  ['buchhaltung', 'Buchhaltung', 'Rechnungen, Zahlungen, Mahnungen', false],
  ['akquise', 'Akquise', 'Anfragen, Angebote, Ausschreibungen', false],
  ['hr', 'HR / Personal', 'Einstellungen, Personalakten, Lohn', false]
];
const SPALTEN = ['Zu erledigen', 'In Arbeit', 'Warten auf Rückmeldung', 'Erledigt'];
const BOARDS = [['Büro allgemein', 'Alles, was keiner Abteilung gehört'], ['Objektleitung', 'Objekte, Qualität, Einsätze'], ['Buchhaltung', 'Rechnungen, offene Posten, Zahlungen'], ['Akquise', 'Leads, Besichtigungen, Angebote'], ['HR / Personal', 'Einstellungen, Unterlagen, Fristen']];
const PRIO = ['niedrig', 'mittel', 'hoch', 'dringend'];

function tabellen(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kanal (id INTEGER PRIMARY KEY, schluessel TEXT UNIQUE NOT NULL, name TEXT NOT NULL, beschreibung TEXT, art TEXT DEFAULT 'abteilung', app INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS nachricht (
      id INTEGER PRIMARY KEY, kanal_id INTEGER NOT NULL REFERENCES kanal(id) ON DELETE CASCADE, von TEXT NOT NULL, von_name TEXT NOT NULL,
      text TEXT, foto TEXT, objekt_id INTEGER, mangel_id INTEGER, aufgabe_id INTEGER, system INTEGER DEFAULT 0, zeit TEXT DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS nachricht_kanal ON nachricht (kanal_id, id);
    CREATE TABLE IF NOT EXISTS gelesen (kanal_id INTEGER NOT NULL, wer TEXT NOT NULL, bis_id INTEGER NOT NULL, PRIMARY KEY (kanal_id, wer));
    CREATE TABLE IF NOT EXISTS board (id INTEGER PRIMARY KEY, name TEXT NOT NULL, beschreibung TEXT, archiviert INTEGER DEFAULT 0, reihenfolge INTEGER DEFAULT 0, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS board_spalte (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE, name TEXT NOT NULL, reihenfolge INTEGER DEFAULT 0, erledigt INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS aufgabe (
      id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE, spalte_id INTEGER REFERENCES board_spalte(id) ON DELETE SET NULL,
      titel TEXT NOT NULL, beschreibung TEXT, prioritaet TEXT DEFAULT 'mittel', start TEXT, faellig TEXT, zustaendig TEXT, objekt_id INTEGER, labels TEXT,
      erledigt INTEGER DEFAULT 0, erledigt_am TEXT, reihenfolge INTEGER DEFAULT 0, nachricht_id INTEGER, angelegt_von TEXT, angelegt_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS aufgabe_punkt (id INTEGER PRIMARY KEY, aufgabe_id INTEGER NOT NULL REFERENCES aufgabe(id) ON DELETE CASCADE, text TEXT NOT NULL, erledigt INTEGER DEFAULT 0, reihenfolge INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS aufgabe_kommentar (id INTEGER PRIMARY KEY, aufgabe_id INTEGER NOT NULL REFERENCES aufgabe(id) ON DELETE CASCADE, von TEXT, von_name TEXT, text TEXT NOT NULL, zeit TEXT DEFAULT (datetime('now','localtime')));
  `);
  const sp = db.prepare('PRAGMA table_info(benutzer)').all().map(function (c) { return c.name; });
  if (sp.indexOf('abteilung') < 0) db.exec('ALTER TABLE benutzer ADD COLUMN abteilung TEXT');
  KANAELE.forEach(function (k) { db.prepare('INSERT OR IGNORE INTO kanal (schluessel, name, beschreibung, art, app) VALUES (?,?,?,?,?)').run(k[0], k[1], k[2], 'abteilung', k[3] ? 1 : 0); });
  if (!db.prepare('SELECT COUNT(*) n FROM board').get().n) BOARDS.forEach(function (b, i) { boardAnlegen(db, b[0], b[1], i); });
}
function boardAnlegen(db, name, beschreibung, rf) {
  const id = Number(db.prepare('INSERT INTO board (name, beschreibung, reihenfolge) VALUES (?,?,?)').run(name, beschreibung || null, rf || 0).lastInsertRowid);
  SPALTEN.forEach(function (s, i) { db.prepare('INSERT INTO board_spalte (board_id, name, reihenfolge, erledigt) VALUES (?,?,?,?)').run(id, s, i, i === SPALTEN.length - 1 ? 1 : 0); });
  return id;
}

// ---------- Wer bin ich, wen gibt es
const kennung = ich => ich.rolle === 'mitarbeiter' ? 'm' + ich.mitarbeiter.id : 'b' + ich.benutzer.id;
function personen(db) {
  return db.prepare("SELECT id, name, abteilung FROM benutzer WHERE rolle = 'buero' AND aktiv = 1 ORDER BY name").all().map(function (b) { return { id: 'b' + b.id, name: b.name, art: 'Büro', abteilung: b.abteilung || '' }; })
    .concat(db.prepare('SELECT id, name, taetigkeit FROM mitarbeiter WHERE aktiv = 1 ORDER BY name').all().map(function (m) { return { id: 'm' + m.id, name: m.name, art: 'Mitarbeiter', abteilung: m.taetigkeit || '' }; }));
}
function personName(db, k) {
  const m = String(k || '').match(/^([bm])(\d+)$/); if (!m) return null;
  const x = m[1] === 'b' ? db.prepare("SELECT name FROM benutzer WHERE id = ? AND rolle = 'buero'").get(Number(m[2])) : db.prepare('SELECT name FROM mitarbeiter WHERE id = ?').get(Number(m[2]));
  return x ? x.name : null;
}
function darf(ich, k) {
  if (k.art === 'direkt') return k.schluessel.split(':').slice(1).indexOf(kennung(ich)) >= 0;
  return ich.rolle === 'buero' || (ich.rolle === 'mitarbeiter' && !!k.app);
}
function kanalHolen(db, ich, schluessel) {
  let k = db.prepare('SELECT * FROM kanal WHERE schluessel = ?').get(String(schluessel || ''));
  if (!k && /^dm:/.test(schluessel || '')) {   // Direktnachricht: Kanal entsteht beim ersten Öffnen
    const teil = String(schluessel).split(':').slice(1).sort();
    if (teil.length !== 2 || teil[0] === teil[1] || !teil.every(function (t) { return personName(db, t); })) throw new Error('Unbekannter Gesprächspartner');
    if (ich.rolle === 'mitarbeiter' && !teil.some(function (t) { return t[0] === 'b'; })) throw new Error('Direktnachrichten aus der App gehen ans Büro.');
    const s = 'dm:' + teil.join(':');
    db.prepare("INSERT OR IGNORE INTO kanal (schluessel, name, art) VALUES (?, ?, 'direkt')").run(s, teil.map(function (t) { return personName(db, t); }).join(' · '));
    k = db.prepare('SELECT * FROM kanal WHERE schluessel = ?').get(s);
  }
  if (!k || !darf(ich, k)) throw new Error('Kein Zugriff auf diesen Kanal');
  return k;
}
const dmSchluessel = (a, b) => 'dm:' + [a, b].sort().join(':');

// ---------- Übersicht, Nachrichten
function uebersicht(db, ich) {
  const wer = kennung(ich);
  const kanaele = db.prepare('SELECT * FROM kanal ORDER BY art, id').all().filter(function (k) { return darf(ich, k); }).map(function (k) {
    const g = db.prepare('SELECT bis_id FROM gelesen WHERE kanal_id = ? AND wer = ?').get(k.id, wer), letzte = db.prepare('SELECT id, von_name, text, zeit FROM nachricht WHERE kanal_id = ? ORDER BY id DESC LIMIT 1').get(k.id);
    const neu = db.prepare('SELECT COUNT(*) n FROM nachricht WHERE kanal_id = ? AND id > ? AND von <> ?').get(k.id, g ? g.bis_id : 0, wer).n;
    let name = k.name; if (k.art === 'direkt') { const ander = k.schluessel.split(':').slice(1).find(function (t) { return t !== wer; }); name = personName(db, ander) || k.name; }
    return { schluessel: k.schluessel, name: name, beschreibung: k.beschreibung, art: k.art, ungelesen: neu, letzte: letzte || null };
  }).filter(function (k) { return k.art !== 'direkt' || k.letzte; });
  const meine = db.prepare('SELECT COUNT(*) n FROM aufgabe a JOIN board b ON b.id = a.board_id WHERE a.zustaendig = ? AND a.erledigt = 0 AND b.archiviert = 0').get(wer).n;
  const ueberfaellig = db.prepare("SELECT COUNT(*) n FROM aufgabe a JOIN board b ON b.id = a.board_id WHERE a.zustaendig = ? AND a.erledigt = 0 AND b.archiviert = 0 AND a.faellig IS NOT NULL AND a.faellig < date('now','localtime')").get(wer).n;
  return { ich: wer, kanaele: kanaele, personen: personen(db).filter(function (p) { return p.id !== wer && (ich.rolle === 'buero' || p.id[0] === 'b'); }), ungelesen: kanaele.reduce(function (a, k) { return a + k.ungelesen; }, 0), meineAufgaben: meine, ueberfaellig: ueberfaellig };
}
function nachrichten(db, ich, schluessel, seit) {
  const k = kanalHolen(db, ich, schluessel);
  const l = db.prepare('SELECT n.*, o.name objekt FROM nachricht n LEFT JOIN objekt o ON o.id = n.objekt_id WHERE n.kanal_id = ? AND n.id > ? ORDER BY n.id DESC LIMIT 200').all(k.id, Number(seit) || 0).reverse();
  if (l.length) db.prepare('INSERT INTO gelesen (kanal_id, wer, bis_id) VALUES (?,?,?) ON CONFLICT(kanal_id, wer) DO UPDATE SET bis_id = MAX(bis_id, excluded.bis_id)').run(k.id, kennung(ich), l[l.length - 1].id);
  return { kanal: { schluessel: k.schluessel, name: k.name, art: k.art }, nachrichten: l, ich: kennung(ich) };
}
function senden(db, ich, b, fotoSpeichern) {
  const k = kanalHolen(db, ich, b.kanal), text = String(b.text || '').trim().slice(0, 4000);
  if (!text && !b.foto) throw new Error('Nachricht ist leer');
  const foto = b.foto ? fotoSpeichern(b.foto, 'c' + k.id) : null;
  let objekt = b.objekt_id ? db.prepare('SELECT id, name FROM objekt WHERE id = ?').get(Number(b.objekt_id)) : null;
  if (objekt && ich.rolle === 'mitarbeiter' && !darfObjekt(db, ich.mitarbeiter.id, objekt.id)) objekt = null;
  let mangel = null;
  if (k.schluessel === 'maengel' && objekt && text) {   // Meldung mit Objekt → Mangel
    mangel = Number(db.prepare("INSERT INTO mangel (objekt_id, text, foto, quelle, gemeldet_von, frist) VALUES (?,?,?,?,?, date('now','localtime','+1 day'))").run(objekt.id, text, foto, ich.rolle === 'mitarbeiter' ? 'mitarbeiter' : 'büro', ich.name).lastInsertRowid);
  }
  const id = Number(db.prepare('INSERT INTO nachricht (kanal_id, von, von_name, text, foto, objekt_id, mangel_id) VALUES (?,?,?,?,?,?,?)').run(k.id, kennung(ich), ich.name, text || null, foto, objekt ? objekt.id : null, mangel).lastInsertRowid);
  db.prepare('INSERT INTO gelesen (kanal_id, wer, bis_id) VALUES (?,?,?) ON CONFLICT(kanal_id, wer) DO UPDATE SET bis_id = MAX(bis_id, excluded.bis_id)').run(k.id, kennung(ich), id);
  return { id: id, mangel_id: mangel };
}
function darfObjekt(db, mid, oid) {
  return !!(db.prepare('SELECT 1 FROM einsatz WHERE mitarbeiter_id = ? AND objekt_id = ?').get(mid, oid) || db.prepare("SELECT 1 FROM schicht WHERE mitarbeiter_id = ? AND objekt_id = ? AND datum >= date('now','localtime','-30 day')").get(mid, oid));
}
function systemNachricht(db, schluessel, text, aufgabeId) {
  const k = db.prepare('SELECT id FROM kanal WHERE schluessel = ?').get(schluessel); if (!k) return;
  db.prepare("INSERT INTO nachricht (kanal_id, von, von_name, text, aufgabe_id, system) VALUES (?, 'system', 'Glanzwerk', ?, ?, 1)").run(k.id, text, aufgabeId || null);
}
// Eine Nachricht als Mangel übernehmen (Büro)
function alsMangel(db, ich, nachrichtId, objektId) {
  const n = db.prepare('SELECT * FROM nachricht WHERE id = ?').get(Number(nachrichtId)); if (!n) throw new Error('Nachricht nicht gefunden');
  if (n.mangel_id) throw new Error('Ist schon als Mangel erfasst.');
  const oid = Number(objektId || n.objekt_id); if (!db.prepare('SELECT 1 FROM objekt WHERE id = ?').get(oid)) throw new Error('Bitte ein Objekt wählen.');
  const mid = Number(db.prepare("INSERT INTO mangel (objekt_id, text, foto, quelle, gemeldet_von, frist) VALUES (?,?,?,?,?, date('now','localtime','+1 day'))").run(oid, n.text || 'Meldung aus dem Chat', n.foto, n.von[0] === 'm' ? 'mitarbeiter' : 'büro', n.von_name).lastInsertRowid);
  db.prepare('UPDATE nachricht SET mangel_id = ?, objekt_id = ? WHERE id = ?').run(mid, oid, n.id);
  return mid;
}

// ---------- Planner: Boards, Spalten, Aufgaben
function boards(db, ich) {
  const wer = kennung(ich);
  return db.prepare('SELECT * FROM board WHERE archiviert = 0 ORDER BY reihenfolge, id').all().map(function (b) {
    const z = db.prepare('SELECT COUNT(*) n, SUM(erledigt = 0) offen, SUM(erledigt = 0 AND faellig IS NOT NULL AND faellig < date(\'now\',\'localtime\')) ueber, SUM(erledigt = 0 AND zustaendig = ?) meine FROM aufgabe WHERE board_id = ?').get(wer, b.id);
    return Object.assign(b, { aufgaben: z.n || 0, offen: z.offen || 0, ueberfaellig: z.ueber || 0, meine: z.meine || 0 });
  });
}
function aufgabeMitZahlen(db, a) {
  const p = db.prepare('SELECT COUNT(*) n, SUM(erledigt) f FROM aufgabe_punkt WHERE aufgabe_id = ?').get(a.id);
  a.punkte = p.n || 0; a.punkteFertig = p.f || 0; a.kommentare = db.prepare('SELECT COUNT(*) n FROM aufgabe_kommentar WHERE aufgabe_id = ?').get(a.id).n;
  return a;
}
function board(db, id) {
  const b = db.prepare('SELECT * FROM board WHERE id = ?').get(Number(id)); if (!b) throw new Error('Board nicht gefunden');
  b.spalten = db.prepare('SELECT * FROM board_spalte WHERE board_id = ? ORDER BY reihenfolge, id').all(b.id);
  const pn = {}; personen(db).forEach(function (p) { pn[p.id] = p.name; });
  const a = db.prepare('SELECT a.*, o.name objekt FROM aufgabe a LEFT JOIN objekt o ON o.id = a.objekt_id WHERE a.board_id = ? ORDER BY a.reihenfolge, a.id').all(b.id).map(function (x) { x.zustaendig_name = pn[x.zustaendig] || null; return aufgabeMitZahlen(db, x); });
  b.spalten.forEach(function (s) { s.aufgaben = a.filter(function (x) { return x.spalte_id === s.id; }); });
  const ohne = a.filter(function (x) { return !b.spalten.some(function (s) { return s.id === x.spalte_id; }); });
  if (ohne.length && b.spalten[0]) b.spalten[0].aufgaben = ohne.concat(b.spalten[0].aufgaben);
  return b;
}
function boardSpeichern(db, b) {
  if (b.id && b.archivieren) { db.prepare('UPDATE board SET archiviert = 1 WHERE id = ?').run(Number(b.id)); return Number(b.id); }
  const name = String(b.name || '').trim(); if (!name) throw new Error('Name des Boards fehlt');
  if (b.id) { db.prepare('UPDATE board SET name = ?, beschreibung = ? WHERE id = ?').run(name, b.beschreibung || null, Number(b.id)); return Number(b.id); }
  return boardAnlegen(db, name, b.beschreibung, db.prepare('SELECT COALESCE(MAX(reihenfolge),0)+1 n FROM board').get().n);
}
function spalteSpeichern(db, b) {
  if (b.id && b.loeschen) {
    const s = db.prepare('SELECT * FROM board_spalte WHERE id = ?').get(Number(b.id)); if (!s) return;
    if (db.prepare('SELECT COUNT(*) n FROM board_spalte WHERE board_id = ?').get(s.board_id).n <= 1) throw new Error('Ein Board braucht mindestens eine Spalte.');
    const erste = db.prepare('SELECT id FROM board_spalte WHERE board_id = ? AND id <> ? ORDER BY reihenfolge, id LIMIT 1').get(s.board_id, s.id);
    db.prepare('UPDATE aufgabe SET spalte_id = ? WHERE spalte_id = ?').run(erste.id, s.id); db.prepare('DELETE FROM board_spalte WHERE id = ?').run(s.id); return;
  }
  const name = String(b.name || '').trim(); if (!name) throw new Error('Name der Spalte fehlt');
  if (b.id) { db.prepare('UPDATE board_spalte SET name = ?, erledigt = ? WHERE id = ?').run(name, b.erledigt ? 1 : 0, Number(b.id)); return; }
  if (!db.prepare('SELECT 1 FROM board WHERE id = ?').get(Number(b.board_id))) throw new Error('Board nicht gefunden');
  db.prepare('INSERT INTO board_spalte (board_id, name, reihenfolge, erledigt) VALUES (?,?,?,?)').run(Number(b.board_id), name, db.prepare('SELECT COALESCE(MAX(reihenfolge),0)+1 n FROM board_spalte WHERE board_id = ?').get(Number(b.board_id)).n, b.erledigt ? 1 : 0);
}
const datumOk = d => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
function aufgabeSpeichern(db, ich, b) {
  const wer = kennung(ich);
  if (b.id && b.loeschen) { db.prepare('DELETE FROM aufgabe WHERE id = ?').run(Number(b.id)); return Number(b.id); }
  const titel = String(b.titel || '').trim(); if (!titel) throw new Error('Titel der Aufgabe fehlt');
  if (!datumOk(b.faellig) || !datumOk(b.start)) throw new Error('Datum im Format JJJJ-MM-TT');
  if (b.start && b.faellig && b.faellig < b.start) throw new Error('Fällig liegt vor dem Start.');
  const zust = b.zustaendig ? String(b.zustaendig) : null; if (zust && !personName(db, zust)) throw new Error('Zuständige Person unbekannt');
  const prio = PRIO.indexOf(b.prioritaet) >= 0 ? b.prioritaet : 'mittel', labels = String(b.labels || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).join(', ') || null;
  const alt = b.id ? db.prepare('SELECT * FROM aufgabe WHERE id = ?').get(Number(b.id)) : null; if (b.id && !alt) throw new Error('Aufgabe nicht gefunden');
  const boardId = Number(b.board_id || (alt && alt.board_id)); if (!db.prepare('SELECT 1 FROM board WHERE id = ?').get(boardId)) throw new Error('Board nicht gefunden');
  let spalte = b.spalte_id ? db.prepare('SELECT * FROM board_spalte WHERE id = ? AND board_id = ?').get(Number(b.spalte_id), boardId) : null;
  if (!spalte) spalte = alt && alt.board_id === boardId ? db.prepare('SELECT * FROM board_spalte WHERE id = ?').get(alt.spalte_id) : null;
  if (!spalte) spalte = db.prepare('SELECT * FROM board_spalte WHERE board_id = ? ORDER BY reihenfolge, id LIMIT 1').get(boardId);
  const erledigt = spalte && spalte.erledigt ? 1 : (b.erledigt ? 1 : 0);
  const f = [boardId, spalte ? spalte.id : null, titel, String(b.beschreibung || '').trim() || null, prio, b.start || null, b.faellig || null, zust, b.objekt_id ? Number(b.objekt_id) : null, labels, erledigt];
  let id;
  if (alt) { db.prepare("UPDATE aufgabe SET board_id=?, spalte_id=?, titel=?, beschreibung=?, prioritaet=?, start=?, faellig=?, zustaendig=?, objekt_id=?, labels=?, erledigt=?, erledigt_am = CASE WHEN ? = 1 THEN COALESCE(erledigt_am, datetime('now','localtime')) ELSE NULL END WHERE id=?").run(...f, erledigt, alt.id); id = alt.id; }
  else id = Number(db.prepare("INSERT INTO aufgabe (board_id, spalte_id, titel, beschreibung, prioritaet, start, faellig, zustaendig, objekt_id, labels, erledigt, reihenfolge, nachricht_id, angelegt_von) VALUES (?,?,?,?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(reihenfolge),0)+1 FROM aufgabe WHERE spalte_id = ?),?,?)").run(...f, spalte ? spalte.id : null, b.nachricht_id || null, wer).lastInsertRowid);
  // Neu zugewiesen → Direktnachricht an die zuständige Person
  if (zust && zust !== wer && (!alt || alt.zustaendig !== zust)) {
    const s = dmSchluessel(wer, zust);
    db.prepare("INSERT OR IGNORE INTO kanal (schluessel, name, art) VALUES (?, ?, 'direkt')").run(s, [ich.name, personName(db, zust)].join(' · '));
    systemNachricht(db, s, 'Neue Aufgabe für ' + personName(db, zust) + ': „' + titel + '"' + (b.faellig ? ' — fällig ' + b.faellig.split('-').reverse().join('.') : ''), id);
  }
  return id;
}
function verschieben(db, id, spalteId, index) {
  const a = db.prepare('SELECT * FROM aufgabe WHERE id = ?').get(Number(id)); if (!a) throw new Error('Aufgabe nicht gefunden');
  const s = db.prepare('SELECT * FROM board_spalte WHERE id = ? AND board_id = ?').get(Number(spalteId), a.board_id); if (!s) throw new Error('Spalte nicht gefunden');
  const l = db.prepare('SELECT id FROM aufgabe WHERE spalte_id = ? AND id <> ? ORDER BY reihenfolge, id').all(s.id, a.id).map(function (x) { return x.id; });
  const i = Math.max(0, Math.min(l.length, Number.isInteger(Number(index)) ? Number(index) : l.length)); l.splice(i, 0, a.id);
  l.forEach(function (x, n) { db.prepare('UPDATE aufgabe SET reihenfolge = ? WHERE id = ?').run(n + 1, x); });
  db.prepare("UPDATE aufgabe SET spalte_id = ?, erledigt = ?, erledigt_am = CASE WHEN ? = 1 THEN COALESCE(erledigt_am, datetime('now','localtime')) ELSE NULL END WHERE id = ?").run(s.id, s.erledigt ? 1 : 0, s.erledigt ? 1 : 0, a.id);
}
function erledigen(db, ich, id, erledigt) {
  const a = db.prepare('SELECT * FROM aufgabe WHERE id = ?').get(Number(id)); if (!a) throw new Error('Aufgabe nicht gefunden');
  if (ich.rolle === 'mitarbeiter' && a.zustaendig !== kennung(ich)) throw new Error('Nur eigene Aufgaben.');
  const ziel = erledigt ? db.prepare('SELECT id FROM board_spalte WHERE board_id = ? AND erledigt = 1 ORDER BY reihenfolge LIMIT 1').get(a.board_id) : db.prepare('SELECT id FROM board_spalte WHERE board_id = ? AND erledigt = 0 ORDER BY reihenfolge LIMIT 1').get(a.board_id);
  db.prepare("UPDATE aufgabe SET erledigt = ?, erledigt_am = CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE NULL END, spalte_id = COALESCE(?, spalte_id) WHERE id = ?").run(erledigt ? 1 : 0, erledigt ? 1 : 0, ziel ? ziel.id : null, a.id);
  if (erledigt && a.angelegt_von && a.angelegt_von !== kennung(ich) && personName(db, a.angelegt_von)) {
    const s = dmSchluessel(kennung(ich), a.angelegt_von);
    db.prepare("INSERT OR IGNORE INTO kanal (schluessel, name, art) VALUES (?, ?, 'direkt')").run(s, [ich.name, personName(db, a.angelegt_von)].join(' · '));
    systemNachricht(db, s, ich.name + ' hat erledigt: „' + a.titel + '"', a.id);
  }
}
function aufgabe(db, ich, id) {
  const a = db.prepare('SELECT a.*, o.name objekt, b.name board FROM aufgabe a JOIN board b ON b.id = a.board_id LEFT JOIN objekt o ON o.id = a.objekt_id WHERE a.id = ?').get(Number(id)); if (!a) throw new Error('Aufgabe nicht gefunden');
  if (ich.rolle === 'mitarbeiter' && a.zustaendig !== kennung(ich)) throw new Error('Nur eigene Aufgaben.');
  a.zustaendig_name = personName(db, a.zustaendig); a.angelegt_von_name = personName(db, a.angelegt_von);
  a.punkte = db.prepare('SELECT * FROM aufgabe_punkt WHERE aufgabe_id = ? ORDER BY reihenfolge, id').all(a.id);
  a.kommentare = db.prepare('SELECT * FROM aufgabe_kommentar WHERE aufgabe_id = ? ORDER BY id').all(a.id);
  return a;
}
function punkt(db, ich, b) {
  const a = aufgabe(db, ich, b.aufgabe_id);
  if (b.id && b.loeschen) { if (ich.rolle !== 'buero') throw new Error('Nur das Büro löscht Punkte.'); db.prepare('DELETE FROM aufgabe_punkt WHERE id = ? AND aufgabe_id = ?').run(Number(b.id), a.id); return; }
  if (b.id) { db.prepare('UPDATE aufgabe_punkt SET erledigt = ? WHERE id = ? AND aufgabe_id = ?').run(b.erledigt ? 1 : 0, Number(b.id), a.id); return; }
  if (ich.rolle !== 'buero') throw new Error('Nur das Büro legt Punkte an.');
  const t = String(b.text || '').trim(); if (!t) throw new Error('Text fehlt');
  db.prepare('INSERT INTO aufgabe_punkt (aufgabe_id, text, reihenfolge) VALUES (?,?,(SELECT COALESCE(MAX(reihenfolge),0)+1 FROM aufgabe_punkt WHERE aufgabe_id = ?))').run(a.id, t, a.id);
}
function kommentar(db, ich, b) {
  const a = aufgabe(db, ich, b.aufgabe_id), t = String(b.text || '').trim(); if (!t) throw new Error('Kommentar ist leer');
  db.prepare('INSERT INTO aufgabe_kommentar (aufgabe_id, von, von_name, text) VALUES (?,?,?,?)').run(a.id, kennung(ich), ich.name, t.slice(0, 4000));
}
function meine(db, ich) {
  return db.prepare("SELECT a.*, b.name board, o.name objekt FROM aufgabe a JOIN board b ON b.id = a.board_id LEFT JOIN objekt o ON o.id = a.objekt_id WHERE a.zustaendig = ? AND b.archiviert = 0 AND (a.erledigt = 0 OR a.erledigt_am >= datetime('now','localtime','-7 day')) ORDER BY a.erledigt, a.faellig IS NULL, a.faellig, CASE a.prioritaet WHEN 'dringend' THEN 0 WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 ELSE 3 END")
    .all(kennung(ich)).map(function (a) { return aufgabeMitZahlen(db, a); });
}

module.exports = { KANAELE, PRIO, tabellen, kennung, personen, uebersicht, nachrichten, senden, alsMangel, boards, board, boardSpeichern, spalteSpeichern, aufgabeSpeichern, verschieben, erledigen, aufgabe, punkt, kommentar, meine, dmSchluessel };
