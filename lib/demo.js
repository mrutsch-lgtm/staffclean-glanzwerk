// demo.js — Beispieldaten zum Ausprobieren. Frei erfunden: keine echten Kunden, keine echten Personen.
'use strict';

function anlegen(db) {
  if (db.prepare('SELECT COUNT(*) n FROM objekt').get().n) return false;
  const T = {};
  [['Boden saugen und feucht wischen', 'Erst saugen, dann nebelfeucht wischen. Nasse Böden mit Warnschild sichern.', 6, 'Boden'],
   ['Papierkörbe leeren, Beutel wechseln', 'Beutel wechseln, Wertstoffe trennen, Behälter bei Bedarf auswischen.', 2, 'Abfall'],
   ['Tische und Arbeitsflächen feucht abwischen', 'Nur freie Flächen, Unterlagen nicht bewegen. Blaues Tuch.', 5, 'Flächen'],
   ['Sanitär reinigen und desinfizieren', 'WC, Waschbecken, Armaturen. Rotes Tuch nur für WC. Handschuhe tragen.', 12, 'Sanitär'],
   ['Verbrauchsmaterial auffüllen', 'Seife, Papierhandtücher, Toilettenpapier prüfen und auffüllen.', 3, 'Sanitär'],
   ['Handläufe und Türgriffe abwischen', 'Mit Desinfektionstuch, von oben nach unten.', 3, 'Flächen'],
   ['Glastüren und Spiegel reinigen', 'Streifenfrei mit Glasreiniger und Mikrofasertuch.', 4, 'Glas'],
   ['Heizkörper und Fußleisten entstauben', 'Trocken mit Staubwedel, danach feucht nachwischen.', 5, 'Flächen']
  ].forEach(function (t) { T[t[0]] = Number(db.prepare('INSERT INTO taetigkeit (name, anleitung, minuten, kategorie) VALUES (?,?,?,?)').run(t[0], t[1], t[2], t[3]).lastInsertRowid); });

  const k = Number(db.prepare("INSERT INTO kunde (name, ansprechpartner, ort) VALUES ('Musterfirma Nord GmbH','Frau Beispiel','Neumünster')").run().lastInsertRowid);
  const o = Number(db.prepare("INSERT INTO objekt (kunde_id, name, strasse, plz, ort, bundesland, reinigungstag, zugang) VALUES (?,?,?,?,?,?,?,?)")
    .run(k, 'Bürohaus Musterweg 1', 'Musterweg 1', '24534', 'Neumünster', 'SH', 1, 'Schlüssel Nr. 12, Alarm 1234# (Beispiel)').lastInsertRowid);
  const raeume = [['Empfang', 'EG', 'Fliese', 24], ['Großraumbüro', 'EG', 'Teppich', 120], ['Besprechungsraum', 'EG', 'Parkett', 30],
                  ['Teeküche', 'EG', 'Fliese', 12], ['WC Damen', 'EG', 'Fliese', 8], ['WC Herren', 'EG', 'Fliese', 8], ['Treppenhaus', 'EG–1. OG', 'Stein', 40]];
  const rid = {};
  raeume.forEach(function (r, i) { rid[r[0]] = Number(db.prepare('INSERT INTO raum (objekt_id, name, etage, belag, flaeche_m2, reihenfolge, code) VALUES (?,?,?,?,?,?,?)').run(o, r[0], r[1], r[2], r[3], i + 1, 'DEMO-' + (i + 1)).lastInsertRowid); });
  const lv = [
    ['Empfang', 'Boden saugen und feucht wischen', '5 W'], ['Empfang', 'Papierkörbe leeren, Beutel wechseln', '5 W'], ['Empfang', 'Glastüren und Spiegel reinigen', '1 W'],
    ['Großraumbüro', 'Boden saugen und feucht wischen', '3 W'], ['Großraumbüro', 'Papierkörbe leeren, Beutel wechseln', '5 W'], ['Großraumbüro', 'Tische und Arbeitsflächen feucht abwischen', '2 W'], ['Großraumbüro', 'Heizkörper und Fußleisten entstauben', '1 M'],
    ['Besprechungsraum', 'Boden saugen und feucht wischen', '2 W'], ['Besprechungsraum', 'Tische und Arbeitsflächen feucht abwischen', '2 W'],
    ['Teeküche', 'Boden saugen und feucht wischen', '5 W'], ['Teeküche', 'Tische und Arbeitsflächen feucht abwischen', '5 W'],
    ['WC Damen', 'Sanitär reinigen und desinfizieren', '5 W'], ['WC Damen', 'Verbrauchsmaterial auffüllen', '5 W'],
    ['WC Herren', 'Sanitär reinigen und desinfizieren', '5 W'], ['WC Herren', 'Verbrauchsmaterial auffüllen', '5 W'],
    ['Treppenhaus', 'Boden saugen und feucht wischen', '1 W'], ['Treppenhaus', 'Handläufe und Türgriffe abwischen', '2 W']
  ];
  lv.forEach(function (p) { db.prepare('INSERT INTO lv_position (objekt_id, raum_id, taetigkeit_id, turnus) VALUES (?,?,?,?)').run(o, rid[p[0]], T[p[1]], p[2]); });
  const m1 = Number(db.prepare("INSERT INTO mitarbeiter (name, sprache, minijob, lohngruppe, pin) VALUES ('Anna Beispiel','de',1,'LG 1','1111')").run().lastInsertRowid);
  db.prepare("INSERT INTO mitarbeiter (name, sprache, minijob, lohngruppe, pin) VALUES ('Piotr Muster','pl',0,'LG 1','2222')").run();
  db.prepare('INSERT INTO einsatz (objekt_id, mitarbeiter_id) VALUES (?,?)').run(o, m1);
  return true;
}

module.exports = { anlegen };
