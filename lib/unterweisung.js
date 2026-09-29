// unterweisung.js — Unterweisungen (§ 12 ArbSchG, § 14 GefStoffV, DGUV V1 § 4) und Objekt-Dienstanweisungen mit Lesebestätigung.
// Ein Thema hat Inhalt, Version und Intervall. Wer es braucht: alle aktiven Kräfte (objekt_id leer) oder das Team eines Objekts.
// Nachweis entweder in der App („gelesen und verstanden" mit Zeitstempel) oder als Präsenzunterweisung vom Büro eingetragen.
// Fällig ist ein Thema, wenn kein Nachweis vorliegt, die Version neuer ist als der Nachweis oder das Intervall abgelaufen ist.
'use strict';

const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// Monatsende bleibt Monatsende: 31.03. + 6 Monate = 30.09. (nicht 01.10.)
const plusMonate = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'), tag = x.getUTCDate(); x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); const letzter = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(tag, letzter)); return x.toISOString().slice(0, 10); };

const VORLAGEN = [
  ['unterweisung', 'Arbeitsschutz allgemein', 12, 'Verhalten im Objekt, Wege und Treppen, Nassbereiche kennzeichnen (Warnschild „Rutschgefahr"), Stolperstellen durch Kabel und Schläuche vermeiden, rückenschonend heben und tragen, Arbeitsunfälle sofort melden. Arbeitsmittel vor Benutzung auf Schäden prüfen; defekte Geräte nicht benutzen, sondern kennzeichnen und melden.'],
  ['unterweisung', 'Gefahrstoffe und Hautschutz', 12, 'Reinigungsmittel nur aus dem Originalgebinde oder richtig beschrifteten Flaschen verwenden. Nie Mittel mischen (Chlorgas-Gefahr bei Chlor + Säure). Dosierung laut Etikett und Betriebsanweisung. Schutzhandschuhe bei Feuchtarbeit und ätzenden Mitteln, bei Spritzgefahr Schutzbrille. Hautschutzplan: vor der Arbeit schützen, nach der Arbeit reinigen und pflegen. Bei Kontakt mit den Augen: 10 Minuten mit Wasser spülen, Arzt aufsuchen, Etikett/Sicherheitsdatenblatt mitnehmen.'],
  ['unterweisung', 'Leitern und Tritte', 12, 'Nur geprüfte Leitern benutzen (Prüfplakette). Standsicher aufstellen, nie auf Kisten oder Stühle steigen. Nicht von der Leiter übergreifen — lieber umstellen. Die obersten zwei Sprossen einer Stehleiter nicht betreten. Für Glasreinigung in der Höhe: Teleskopstange statt Leiter, wo möglich.'],
  ['unterweisung', 'Brandschutz und Notfall', 12, 'Fluchtwege und Notausgänge im Objekt kennen und freihalten. Standort von Feuerlöscher und Erste-Hilfe-Kasten merken. Im Brandfall: Ruhe bewahren, Notruf 112, Menschen warnen, Objekt verlassen, am Sammelplatz melden. Alarmanlage nach Anweisung des Kunden scharf schalten; Codes nie weitergeben.'],
  ['unterweisung', 'Hygiene und Infektionsschutz', 12, 'Farbsystem für Tücher und Eimer: Rot = WC/Urinal, Gelb = Waschbecken/Fliesen im Sanitärbereich, Blau = Büro/Möbel, Grün = Küche/Lebensmittelbereich. Tücher nie von Rot in andere Bereiche. Handschuhe nach dem Sanitärbereich wechseln. Bei Durchfall, Erbrechen oder ansteckender Krankheit nicht arbeiten, sondern melden.'],
  ['unterweisung', 'Datenschutz und Verschwiegenheit', 0, 'Alles, was du im Objekt siehst oder hörst — Unterlagen, Bildschirme, Gespräche — bleibt dort. Keine Fotos von Kundenräumen außer für Mängelmeldungen in der App. Schlüssel und Transponder nie weitergeben, Verlust sofort melden.']
];

function tabellen(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS unterweisung_thema (id INTEGER PRIMARY KEY, art TEXT NOT NULL DEFAULT 'unterweisung', titel TEXT NOT NULL, inhalt TEXT, intervall_monate INTEGER DEFAULT 12,
      objekt_id INTEGER REFERENCES objekt(id) ON DELETE CASCADE, version INTEGER DEFAULT 1, aktiv INTEGER DEFAULT 1, geaendert_am TEXT DEFAULT (datetime('now','localtime')));
    CREATE TABLE IF NOT EXISTS unterweisung_nachweis (id INTEGER PRIMARY KEY, thema_id INTEGER NOT NULL REFERENCES unterweisung_thema(id) ON DELETE CASCADE, mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
      version INTEGER, am TEXT NOT NULL, weg TEXT DEFAULT 'app', durch TEXT, zeit TEXT DEFAULT (datetime('now','localtime')));
    CREATE INDEX IF NOT EXISTS unterweisung_nw ON unterweisung_nachweis (mitarbeiter_id, thema_id)`);
  if (!db.prepare('SELECT COUNT(*) n FROM unterweisung_thema').get().n) VORLAGEN.forEach(function (v) { db.prepare('INSERT INTO unterweisung_thema (art, titel, intervall_monate, inhalt) VALUES (?,?,?,?)').run(v[0], v[1], v[2], v[3]); });
}
function betroffene(db, t) {
  if (t.objekt_id) return db.prepare('SELECT m.id, m.name FROM einsatz e JOIN mitarbeiter m ON m.id = e.mitarbeiter_id WHERE e.objekt_id = ? AND m.aktiv = 1 ORDER BY m.name').all(t.objekt_id);
  return db.prepare('SELECT id, name FROM mitarbeiter WHERE aktiv = 1 ORDER BY name').all();
}
// Stand je Person und Thema
function stand(db, t, mid) {
  const n = db.prepare('SELECT * FROM unterweisung_nachweis WHERE thema_id = ? AND mitarbeiter_id = ? ORDER BY am DESC, id DESC LIMIT 1').get(t.id, mid);
  if (!n) return { status: 'fehlt', faellig: heute() };
  if ((n.version || 1) < (t.version || 1)) return { status: 'neu', faellig: heute(), am: n.am, weg: n.weg };
  if (!t.intervall_monate) return { status: 'ok', am: n.am, weg: n.weg, faellig: null };
  const f = plusMonate(n.am, t.intervall_monate);
  return { status: f <= heute() ? 'abgelaufen' : f <= plusMonate(heute(), 1) ? 'bald' : 'ok', am: n.am, weg: n.weg, faellig: f };
}
function themen(db) {
  return db.prepare('SELECT t.*, o.name objekt FROM unterweisung_thema t LEFT JOIN objekt o ON o.id = t.objekt_id WHERE t.aktiv = 1 ORDER BY t.art DESC, o.name, t.titel').all().map(function (t) {
    const p = betroffene(db, t), s = p.map(function (m) { return stand(db, t, m.id); });
    t.personen = p.length; t.erledigt = s.filter(function (x) { return x.status === 'ok' || x.status === 'bald'; }).length; t.offen = p.length - t.erledigt;
    return t;
  });
}
function thema(db, id) {
  const t = db.prepare('SELECT t.*, o.name objekt FROM unterweisung_thema t LEFT JOIN objekt o ON o.id = t.objekt_id WHERE t.id = ?').get(Number(id)); if (!t) return null;
  t.personen = betroffene(db, t).map(function (m) { return Object.assign({ id: m.id, name: m.name }, stand(db, t, m.id)); });
  t.nachweise = db.prepare('SELECT n.*, m.name FROM unterweisung_nachweis n JOIN mitarbeiter m ON m.id = n.mitarbeiter_id WHERE n.thema_id = ? ORDER BY n.am DESC, n.id DESC LIMIT 300').all(t.id);
  return t;
}
function speichern(db, b) {
  const titel = String(b.titel || '').trim(); if (!titel) throw new Error('Titel fehlt');
  const art = b.art === 'dienstanweisung' ? 'dienstanweisung' : 'unterweisung';
  const iv = b.intervall_monate === '' || b.intervall_monate == null ? (art === 'dienstanweisung' ? 0 : 12) : Number(b.intervall_monate);
  if (!(iv >= 0 && iv <= 60)) throw new Error('Intervall 0–60 Monate');
  const oid = b.objekt_id ? Number(b.objekt_id) : null;
  if (art === 'dienstanweisung' && !oid) throw new Error('Eine Dienstanweisung gehört zu einem Objekt');
  const inhalt = String(b.inhalt || '').trim(); if (!inhalt) throw new Error('Inhalt fehlt — was sollen die Kräfte lesen?');
  if (b.id) {
    const alt = db.prepare('SELECT * FROM unterweisung_thema WHERE id = ?').get(Number(b.id)); if (!alt) throw new Error('Thema nicht gefunden');
    // Inhalt geändert → neue Version, alle müssen neu bestätigen
    const version = alt.inhalt !== inhalt ? (alt.version || 1) + 1 : alt.version;
    db.prepare("UPDATE unterweisung_thema SET art = ?, titel = ?, inhalt = ?, intervall_monate = ?, objekt_id = ?, version = ?, geaendert_am = datetime('now','localtime') WHERE id = ?").run(art, titel, inhalt, iv, oid, version, alt.id);
    return { id: alt.id, version: version, neueVersion: version !== alt.version };
  }
  return { id: Number(db.prepare('INSERT INTO unterweisung_thema (art, titel, inhalt, intervall_monate, objekt_id) VALUES (?,?,?,?,?)').run(art, titel, inhalt, iv, oid).lastInsertRowid), version: 1 };
}
function archivieren(db, id) { db.prepare('UPDATE unterweisung_thema SET aktiv = 0 WHERE id = ?').run(Number(id)); }
// Präsenzunterweisung: mehrere Teilnehmer auf einmal
function nachweisen(db, b, von) {
  const t = db.prepare('SELECT * FROM unterweisung_thema WHERE id = ? AND aktiv = 1').get(Number(b.thema_id)); if (!t) throw new Error('Thema nicht gefunden');
  const am = /^\d{4}-\d{2}-\d{2}$/.test(b.am || '') ? b.am : heute(); if (am > heute()) throw new Error('Unterweisung liegt in der Zukunft');
  const ids = (Array.isArray(b.mitarbeiter_ids) ? b.mitarbeiter_ids : [b.mitarbeiter_ids]).map(Number).filter(Boolean); if (!ids.length) throw new Error('Keine Teilnehmer gewählt');
  ids.forEach(function (m) { if (!db.prepare('SELECT 1 FROM mitarbeiter WHERE id = ?').get(m)) throw new Error('Mitarbeiter ' + m + ' unbekannt'); db.prepare("INSERT INTO unterweisung_nachweis (thema_id, mitarbeiter_id, version, am, weg, durch) VALUES (?,?,?,?,'praesenz',?)").run(t.id, m, t.version, am, String(b.durch || von || '').trim() || null); });
  return ids.length;
}
// App: was muss ich lesen / bestätigen?
function offenFuer(db, mid) {
  const aus = [];
  db.prepare('SELECT t.*, o.name objekt FROM unterweisung_thema t LEFT JOIN objekt o ON o.id = t.objekt_id WHERE t.aktiv = 1').all().forEach(function (t) {
    if (!betroffene(db, t).some(function (m) { return m.id === Number(mid); })) return;
    const s = stand(db, t, Number(mid)); if (s.status === 'ok') return;
    aus.push({ id: t.id, art: t.art, titel: t.titel, objekt: t.objekt, inhalt: t.inhalt, version: t.version, status: s.status, faellig: s.faellig });
  });
  return aus;
}
function bestaetigen(db, mid, tid) {
  const t = db.prepare('SELECT * FROM unterweisung_thema WHERE id = ? AND aktiv = 1').get(Number(tid)); if (!t) throw new Error('Nicht gefunden');
  if (!betroffene(db, t).some(function (m) { return m.id === Number(mid); })) throw new Error('Gilt nicht für dich');
  db.prepare("INSERT INTO unterweisung_nachweis (thema_id, mitarbeiter_id, version, am, weg) VALUES (?,?,?,?,'app')").run(t.id, Number(mid), t.version, heute());
}
// Fällig-Liste über alle (Büro, Fristen, Controlling)
function faellig(db) {
  const aus = [];
  themen(db).forEach(function (t) { betroffene(db, t).forEach(function (m) { const s = stand(db, t, m.id); if (s.status !== 'ok') aus.push({ thema_id: t.id, thema: t.titel, art: t.art, objekt: t.objekt, mitarbeiter_id: m.id, name: m.name, status: s.status, faellig: s.faellig, zuletzt: s.am || null }); }); });
  return aus.sort(function (a, b) { return (a.faellig || '') < (b.faellig || '') ? -1 : 1; });
}
// Übersicht einer Person (Personalakte)
function person(db, mid) {
  return db.prepare('SELECT t.*, o.name objekt FROM unterweisung_thema t LEFT JOIN objekt o ON o.id = t.objekt_id WHERE t.aktiv = 1 ORDER BY t.titel').all()
    .filter(function (t) { return betroffene(db, t).some(function (m) { return m.id === Number(mid); }); })
    .map(function (t) { return Object.assign({ thema_id: t.id, titel: t.titel, art: t.art, objekt: t.objekt }, stand(db, t, Number(mid))); });
}

module.exports = { VORLAGEN, tabellen, themen, thema, speichern, archivieren, nachweisen, offenFuer, bestaetigen, faellig, person, stand };
