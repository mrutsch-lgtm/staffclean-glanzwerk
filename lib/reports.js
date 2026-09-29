// reports.js — Controlling-Reports wie in der Sicherheitsplanung (Controlling → Reportings), auf die Gebäudereinigung
// übertragen: Mitarbeiter (Karteileichen, Arbeitsunterbrechung, Unter-/Überstunden, Urlaub, Krankheit, freie Sonntage,
// Schicht-Ranking, Zeitdatensätze, Minijob-Verdienst, 70-Tage-Kräfte, Telefonliste, Krankenkassen, fehlende Unterlagen,
// neue/ausgeschiedene Mitarbeiter, Arbeitstage, Sollzeiten, Anmeldungen, eingestempelt), Einsatz (leere und unbestätigte
// Schichten), Objekte & Kunden (Planungen Soll/Ist mit Rendite, Kunden-Controlling, Controlling Abrechnung je Kunde,
// Erledigungsquote, Qualität, Mängel, auslaufende Verträge), Finanzen (Zahlungseingänge, Ausbuchungen), Bewerber, Aufgaben.
//
// Jeder Report beschreibt Parameter und Spalten selbst — Oberfläche, CSV und Druckansicht sind für alle gleich.
// Rendite wie in SecPlan: DB I / (Lohnkosten inkl. Nebenkosten) × 100.
'use strict';
const DB = require('./db');
const P = require('./personal');
const DP = require('./dienstplan');
const AUSW = require('./auswertung');
const AB = require('./abrechnung');
const FT = require('./feiertage');

const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const heute = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const tageZw = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const minuten = z => Math.max(0, (new Date(z.gehen.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 60000 - (z.pause_min || 0));
const ma = db => db.prepare('SELECT * FROM mitarbeiter ORDER BY name').all();
const BESCH = { vollzeit: 'Vollzeit', teilzeit: 'Teilzeit', minijob: 'Minijob', kurzfristig: 'kurzfristig', werkstudent: 'Werkstudent', azubi: 'Azubi', aushilfe: 'Aushilfe' };
const besch = m => BESCH[m.beschaeftigungsart] || (m.minijob ? 'Minijob' : '');
const lohnsatz = (db, m, d) => m.stundenlohn || (DB.tarifFuer(db, m.lohngruppe, d) || {}).stundenlohn || 0;
function stempel(db, von, bis, mid) {
  return db.prepare("SELECT z.*, o.name objekt, o.bundesland FROM zeitbuchung z LEFT JOIN objekt o ON o.id = z.objekt_id WHERE z.gehen IS NOT NULL AND substr(z.kommen,1,10) BETWEEN ? AND ?" + (mid ? ' AND z.mitarbeiter_id = ' + Number(mid) : '') + ' ORDER BY z.kommen').all(von, bis);
}
function abw(db, art, von, bis) {
  return db.prepare('SELECT a.*, m.name, m.personalnummer, m.arbeitstage_woche FROM abwesenheit a JOIN mitarbeiter m ON m.id = a.mitarbeiter_id WHERE lower(a.art) = ? AND a.bis >= ? AND a.von <= ? ORDER BY a.von').all(art, von, bis)
    .map(function (a) { const v = a.von < von ? von : a.von, b = a.bis > bis ? bis : a.bis; return { personalnummer: a.personalnummer, name: a.name, mitarbeiter_id: a.mitarbeiter_id, von: a.von, bis: a.bis, arbeitstage: P.arbeitstage(v, b, a.arbeitstage_woche), kalendertage: tageZw(v, b) + 1, notiz: a.notiz }; });
}
function letzterEinsatz(db, id) {
  const z = db.prepare('SELECT MAX(substr(kommen,1,10)) d FROM zeitbuchung WHERE mitarbeiter_id = ?').get(id).d, s = db.prepare("SELECT MAX(datum) d FROM schicht WHERE mitarbeiter_id = ? AND datum <= ? AND status <> 'abgesagt'").get(id, heute()).d;
  return [z, s].filter(Boolean).sort().pop() || null;
}
const monateZw = (von, bis) => { const aus = []; let m = von.slice(0, 7); while (m <= bis.slice(0, 7)) { aus.push(m); const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); m = d.toISOString().slice(0, 7); } return aus; };
const monatsende = m => m + '-' + String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');

const S = (k, t, typ) => ({ k: k, t: t, typ: typ || 'text' });   // Spalte: text · zahl · euro · datum · prozent · std
const REPORTS = [
  // ---------------- Mitarbeiter
  { id: 'mitarbeiter', gruppe: 'Mitarbeiter', titel: 'Mitarbeiter-Controlling', text: 'Je Mitarbeiter: geplante und gestempelte Einsätze, Stunden, Objekte, letzter Einsatz, letzte Anmeldung in der App.', p: ['zeitraum'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('beschaeftigung', 'Beschäftigung'), S('geplant', 'Schichten geplant', 'zahl'), S('planStd', 'Std. geplant', 'std'), S('einsaetze', 'Einsätze gestempelt', 'zahl'), S('istStd', 'Std. gestempelt', 'std'), S('objekte', 'Objekte'), S('letzter', 'letzter Einsatz', 'datum'), S('login', 'letzte Anmeldung', 'datum')],
    daten: function (db, p) {
      return ma(db).filter(function (m) { return m.aktiv; }).map(function (m) {
        const sch = DP.schichtenZeitraum(db, p.von, p.bis, m.id), st = stempel(db, p.von, p.bis, m.id), l = db.prepare("SELECT MAX(zeit) z FROM anmeldung_log WHERE rolle = 'mitarbeiter' AND wer_id = ?").get(m.id).z;
        return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, beschaeftigung: besch(m), geplant: sch.length, planStd: r2(sch.reduce(function (a, x) { return a + DP.dauer(x.beginn, x.ende, x.pause_min); }, 0) / 60), einsaetze: st.length, istStd: r2(st.reduce(function (a, z) { return a + minuten(z); }, 0) / 60),
          objekte: [...new Set(st.map(function (z) { return z.objekt; }).concat(sch.map(function (x) { return x.objekt; })).filter(Boolean))].join(', '), letzter: letzterEinsatz(db, m.id), login: l ? l.slice(0, 10) : null };
      });
    } },
  { id: 'karteileichen', gruppe: 'Mitarbeiter', titel: 'Karteileichen', text: 'Alle Mitarbeiter mit ihrem letzten Einsatz — wer steht noch als aktiv in der Kartei, arbeitet aber nicht mehr?', p: ['tage'], standard: { tage: 60 },
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('status', 'Status'), S('beschaeftigung', 'Beschäftigung'), S('eintritt', 'Eintritt', 'datum'), S('letzter', 'letzter Einsatz', 'datum'), S('tageSeit', 'Tage ohne Einsatz', 'zahl'), S('hinweis', 'Hinweis')],
    daten: function (db, p) {
      return ma(db).map(function (m) { const l = letzterEinsatz(db, m.id), t = l ? tageZw(l, heute()) : (m.eintritt ? tageZw(m.eintritt, heute()) : null);
        return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, status: m.aktiv ? 'aktiv' : 'gesperrt', beschaeftigung: besch(m), eintritt: m.eintritt, letzter: l, tageSeit: t, hinweis: m.aktiv && (t == null || t >= Number(p.tage)) ? (l ? 'seit ' + t + ' Tagen kein Einsatz — Austritt prüfen' : 'noch nie eingesetzt') : '' };
      }).filter(function (x) { return !p.nurAuffaellig || x.hinweis; }).sort(function (a, b) { return (b.tageSeit == null ? 1e9 : b.tageSeit) - (a.tageSeit == null ? 1e9 : a.tageSeit); });
    } },
  { id: 'arbeitsunterbrechung', gruppe: 'Mitarbeiter', titel: 'Arbeitsunterbrechung', text: 'Aktive Mitarbeiter, die seit mindestens 4 Monaten nicht gearbeitet haben — Meldung an die Krankenkasse (Unterbrechungsmeldung) prüfen.', p: ['tage'], standard: { tage: 120 },
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('beschaeftigung', 'Beschäftigung'), S('krankenkasse', 'Krankenkasse'), S('letzter', 'letzter Einsatz', 'datum'), S('tageSeit', 'Tage', 'zahl')],
    daten: function (db, p) { return REPORTS.find(function (r) { return r.id === 'karteileichen'; }).daten(db, p).filter(function (x) { return x.status === 'aktiv' && x.letzter && x.tageSeit >= Number(p.tage); }).map(function (x) { x.krankenkasse = (db.prepare('SELECT krankenkasse FROM mitarbeiter WHERE id = ?').get(x.mitarbeiter_id) || {}).krankenkasse; return x; }); } },
  { id: 'ueberstunden', gruppe: 'Mitarbeiter', titel: 'Unter- und Überstunden', text: 'Soll (Wochenstunden je Arbeitstag) gegen gestempelte Stunden plus bezahlte Abwesenheit, Monat für Monat addiert.', p: ['zeitraum'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('wochenstunden', 'Std./Woche', 'zahl'), S('soll', 'Soll', 'std'), S('ist', 'gestempelt', 'std'), S('abwesenheit', 'Urlaub/krank', 'std'), S('saldo', 'Saldo', 'std')],
    daten: function (db, p) {
      const je = {};
      monateZw(p.von, p.bis).forEach(function (m) { P.auswertung(db, m).forEach(function (a) { const x = je[a.id] = je[a.id] || { mitarbeiter_id: a.id, personalnummer: a.personalnummer, name: a.name, soll: 0, ist: 0, abwesenheit: 0, ohneSoll: a.soll == null }; x.soll += a.soll || 0; x.ist += a.ist; x.abwesenheit += a.abwesenheitStunden; }); });
      return Object.keys(je).map(function (k) { const x = je[k], m = db.prepare('SELECT wochenstunden FROM mitarbeiter WHERE id = ?').get(x.mitarbeiter_id); x.wochenstunden = m.wochenstunden; x.soll = r2(x.soll); x.ist = r2(x.ist); x.abwesenheit = r2(x.abwesenheit); x.saldo = x.ohneSoll ? null : r2(x.ist + x.abwesenheit - x.soll); return x; });
    } },
  { id: 'urlaub', gruppe: 'Mitarbeiter', titel: 'Urlaubstage', text: 'Alle Urlaube im Zeitraum mit Arbeits- und Kalendertagen.', p: ['zeitraum'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('von', 'von', 'datum'), S('bis', 'bis', 'datum'), S('arbeitstage', 'Urlaubstage', 'zahl'), S('kalendertage', 'Kalendertage', 'zahl'), S('notiz', 'Notiz')], daten: function (db, p) { return abw(db, 'urlaub', p.von, p.bis); } },
  { id: 'krank', gruppe: 'Mitarbeiter', titel: 'Krankentage', text: 'Alle Krankmeldungen im Zeitraum — Grundlage für Krankenquote und Entgeltfortzahlung.', p: ['zeitraum'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('von', 'von', 'datum'), S('bis', 'bis', 'datum'), S('arbeitstage', 'Arbeitstage', 'zahl'), S('kalendertage', 'Kalendertage', 'zahl'), S('notiz', 'Notiz')], daten: function (db, p) { return abw(db, 'krank', p.von, p.bis); } },
  { id: 'krankenquote', gruppe: 'Mitarbeiter', titel: 'Krankenquote', text: 'Krankheitstage je Mitarbeiter im Verhältnis zu den Arbeitstagen im Zeitraum.', p: ['zeitraum'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('arbeitstage', 'Arbeitstage im Zeitraum', 'zahl'), S('krank', 'krank', 'zahl'), S('quote', 'Quote', 'prozent'), S('faelle', 'Fälle', 'zahl')],
    daten: function (db, p) { const k = abw(db, 'krank', p.von, p.bis); return ma(db).filter(function (m) { return m.aktiv; }).map(function (m) { const l = k.filter(function (x) { return x.mitarbeiter_id === m.id; }), at = P.arbeitstage(p.von, p.bis, m.arbeitstage_woche), kt = l.reduce(function (a, x) { return a + x.arbeitstage; }, 0); return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, arbeitstage: at, krank: kt, quote: at ? Math.round(kt / at * 1000) / 10 : 0, faelle: l.length }; }); } },
  { id: 'sonntage', gruppe: 'Mitarbeiter', titel: 'Freie Sonntage', text: 'Gearbeitete und freie Sonntage im Jahr — mindestens 15 Sonntage im Jahr müssen frei bleiben (§ 11 Abs. 1 ArbZG).', p: ['jahr'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('gearbeitet', 'Sonntage gearbeitet', 'zahl'), S('bisher', 'Sonntage bisher', 'zahl'), S('frei', 'frei', 'zahl'), S('hinweis', 'Hinweis')],
    daten: function (db, p) {
      const j = String(p.jahr), bis = j === heute().slice(0, 4) ? heute() : j + '-12-31'; let sonntage = 0; for (let d = j + '-01-01'; d <= bis; d = plus(d, 1)) if (new Date(d + 'T12:00:00Z').getUTCDay() === 0) sonntage++;
      let gesamt = 0; for (let d = j + '-01-01'; d <= j + '-12-31'; d = plus(d, 1)) if (new Date(d + 'T12:00:00Z').getUTCDay() === 0) gesamt++;
      return ma(db).filter(function (m) { return m.aktiv; }).map(function (m) { const g = new Set(stempel(db, j + '-01-01', bis, m.id).filter(function (z) { return new Date(z.kommen.slice(0, 10) + 'T12:00:00Z').getUTCDay() === 0; }).map(function (z) { return z.kommen.slice(0, 10); })).size;
        return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, gearbeitet: g, bisher: sonntage, frei: sonntage - g, hinweis: gesamt - g < 15 ? 'weniger als 15 freie Sonntage im Jahr möglich' : '' }; });
    } },
  { id: 'ranking', gruppe: 'Mitarbeiter', titel: 'Mitarbeiter-Schicht-Ranking', text: 'Wer hat wie viele Einsätze gearbeitet — und wie oft krank, im Urlaub oder abgesagt.', p: ['zeitraum'],
    spalten: [S('rang', 'Rang', 'zahl'), S('name', 'Mitarbeiter'), S('einsaetze', 'Einsätze', 'zahl'), S('stunden', 'Stunden', 'std'), S('krank', 'Tage krank', 'zahl'), S('urlaub', 'Tage Urlaub', 'zahl'), S('abgesagt', 'Schichten abgesagt', 'zahl')],
    daten: function (db, p) {
      const k = abw(db, 'krank', p.von, p.bis), u = abw(db, 'urlaub', p.von, p.bis);
      return ma(db).filter(function (m) { return m.aktiv; }).map(function (m) { const st = stempel(db, p.von, p.bis, m.id); return { mitarbeiter_id: m.id, name: m.name, einsaetze: st.length, stunden: r2(st.reduce(function (a, z) { return a + minuten(z); }, 0) / 60), krank: k.filter(function (x) { return x.mitarbeiter_id === m.id; }).reduce(function (a, x) { return a + x.arbeitstage; }, 0), urlaub: u.filter(function (x) { return x.mitarbeiter_id === m.id; }).reduce(function (a, x) { return a + x.arbeitstage; }, 0), abgesagt: db.prepare("SELECT COUNT(*) n FROM schicht WHERE mitarbeiter_id = ? AND status = 'abgesagt' AND datum BETWEEN ? AND ?").get(m.id, p.von, p.bis).n }; })
        .sort(function (a, b) { return b.stunden - a.stunden; }).map(function (x, i) { x.rang = i + 1; return x; });
    } },
  { id: 'zeitdaten', gruppe: 'Mitarbeiter', titel: 'Zeitdatensätze inkl. Pausen', text: 'Jede Stempelung mit Beginn, Ende, Pause, Dauer, Objekt und Abstand zum Objekt — der Arbeitszeitnachweis.', p: ['zeitraum'],
    spalten: [S('datum', 'Datum', 'datum'), S('name', 'Mitarbeiter'), S('personalnummer', 'Pers.-Nr.'), S('objekt', 'Objekt'), S('beginn', 'Beginn'), S('ende', 'Ende'), S('pause', 'Pause (Min.)', 'zahl'), S('dauer', 'Dauer', 'std'), S('abstand', 'Abstand (m)', 'zahl')],
    daten: function (db, p) { return db.prepare("SELECT z.*, o.name objekt, m.name, m.personalnummer FROM zeitbuchung z JOIN mitarbeiter m ON m.id = z.mitarbeiter_id LEFT JOIN objekt o ON o.id = z.objekt_id WHERE substr(z.kommen,1,10) BETWEEN ? AND ? ORDER BY z.kommen").all(p.von, p.bis).map(function (z) { return { mitarbeiter_id: z.mitarbeiter_id, datum: z.kommen.slice(0, 10), name: z.name, personalnummer: z.personalnummer, objekt: z.objekt, beginn: z.kommen.slice(11, 16), ende: z.gehen ? z.gehen.slice(11, 16) : 'läuft', pause: z.pause_min || 0, dauer: z.gehen ? r2(minuten(z) / 60) : null, abstand: z.abstand_m }; }); } },
  { id: 'arbeitstage', gruppe: 'Mitarbeiter', titel: 'Liste Arbeitstage', text: 'Geleistete Arbeitstage je Mitarbeiter im Zeitraum.', p: ['zeitraum'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('tage', 'Arbeitstage', 'zahl'), S('stunden', 'Stunden', 'std'), S('schnitt', 'Std. je Tag', 'std')],
    daten: function (db, p) { return ma(db).map(function (m) { const st = stempel(db, p.von, p.bis, m.id), t = new Set(st.map(function (z) { return z.kommen.slice(0, 10); })).size, h = r2(st.reduce(function (a, z) { return a + minuten(z); }, 0) / 60); return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, tage: t, stunden: h, schnitt: t ? r2(h / t) : null }; }).filter(function (x) { return x.tage; }); } },
  { id: 'sollzeiten', gruppe: 'Mitarbeiter', titel: 'Sollzeiten', text: 'Soll-Stunden je Mitarbeiter im Zeitraum aus den vertraglichen Wochenstunden (ohne Feiertage).', p: ['zeitraum'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('wochenstunden', 'Std./Woche', 'zahl'), S('arbeitstage', 'Arbeitstage', 'zahl'), S('soll', 'Soll-Stunden', 'std')],
    daten: function (db, p) { return ma(db).filter(function (m) { return m.aktiv; }).map(function (m) { const at = P.arbeitstage(p.von, p.bis, m.arbeitstage_woche), tw = Number(m.arbeitstage_woche) || 5; return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, wochenstunden: m.wochenstunden, arbeitstage: at, soll: m.wochenstunden ? r2(m.wochenstunden / tw * at) : null }; }); } },
  { id: 'minijob', gruppe: 'Mitarbeiter', titel: 'Minijob-Verdienst (Monate)', text: 'Verdienst der geringfügig Beschäftigten je Monat gegen die Minijob-Grenze — gelegentliches Überschreiten ist höchstens in 2 Monaten je Jahr erlaubt.', p: ['jahr'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('stundenlohn', 'Stundenlohn', 'euro')].concat(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(function (m) { return S('m' + m, m + '/' + '', 'euro'); })).concat([S('summe', 'Jahr', 'euro'), S('ueber', 'Monate über Grenze', 'zahl'), S('hinweis', 'Hinweis')]),
    daten: function (db, p) {
      const grenze = Number(String(DB.einstellungen(db).minijob_grenze_eur || 603).replace(',', '.')), j = String(p.jahr);
      return ma(db).filter(function (m) { return m.beschaeftigungsart === 'minijob' || m.minijob; }).map(function (m) {
        const x = { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, stundenlohn: lohnsatz(db, m, j + '-06-30'), summe: 0, ueber: 0 };
        for (let i = 1; i <= 12; i++) { const mo = j + '-' + String(i).padStart(2, '0'), v = r2(stempel(db, mo + '-01', monatsende(mo), m.id).reduce(function (a, z) { return a + minuten(z) / 60 * lohnsatz(db, m, z.kommen.slice(0, 10)); }, 0)); x['m' + String(i).padStart(2, '0')] = v; x.summe += v; if (v > grenze) x.ueber++; }
        x.summe = r2(x.summe); x.hinweis = x.ueber > 2 ? 'Grenze in mehr als 2 Monaten überschritten — Versicherungspflicht prüfen' : x.summe > grenze * 12 ? 'Jahresgrenze überschritten' : x.ueber ? x.ueber + '× gelegentlich überschritten' : '';
        return x;
      });
    } },
  { id: 'kurzfristig', gruppe: 'Mitarbeiter', titel: '70-Tage-Kräfte', text: 'Kurzfristig Beschäftigte: Arbeitstage im Kalenderjahr gegen die Grenze von 70 Arbeitstagen (§ 8 Abs. 1 Nr. 2 SGB IV).', p: ['jahr'],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('eintritt', 'Eintritt', 'datum'), S('tage', 'Arbeitstage im Jahr', 'zahl'), S('rest', 'noch möglich', 'zahl'), S('hinweis', 'Hinweis')],
    daten: function (db, p) { const j = String(p.jahr); return ma(db).filter(function (m) { return m.beschaeftigungsart === 'kurzfristig'; }).map(function (m) { const t = new Set(stempel(db, j + '-01-01', j + '-12-31', m.id).map(function (z) { return z.kommen.slice(0, 10); })).size; return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, eintritt: m.eintritt, tage: t, rest: Math.max(0, 70 - t), hinweis: t >= 70 ? 'Grenze erreicht — nicht weiter einsetzen' : t >= 60 ? 'fast erreicht' : '' }; }); } },
  { id: 'telefonliste', gruppe: 'Mitarbeiter', titel: 'Telefonliste', text: 'Alle aktiven Mitarbeiter mit Telefon, E-Mail, Notfallkontakt und Stammobjekten.', p: [],
    spalten: [S('name', 'Mitarbeiter'), S('telefon', 'Telefon'), S('email', 'E-Mail'), S('taetigkeit', 'Tätigkeit'), S('objekte', 'Stammobjekte'), S('notfall', 'Notfallkontakt')],
    daten: function (db) { return ma(db).filter(function (m) { return m.aktiv; }).map(function (m) { return { mitarbeiter_id: m.id, name: m.name, telefon: m.telefon, email: m.email, taetigkeit: m.taetigkeit, objekte: db.prepare('SELECT o.name FROM einsatz e JOIN objekt o ON o.id = e.objekt_id WHERE e.mitarbeiter_id = ?').all(m.id).map(function (o) { return o.name; }).join(', '), notfall: [m.notfall_name, m.notfall_telefon].filter(Boolean).join(' · ') }; }); } },
  { id: 'krankenkassen', gruppe: 'Mitarbeiter', titel: 'Krankenkassen-Report', text: 'Bei welcher Krankenkasse die Mitarbeiter versichert sind — für Meldungen und Beitragsnachweise.', p: [],
    spalten: [S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('krankenkasse', 'Krankenkasse'), S('kv_art', 'Versicherung'), S('beschaeftigung', 'Beschäftigung'), S('sv', 'SV-Nummer')],
    daten: function (db) { return ma(db).filter(function (m) { return m.aktiv; }).map(function (m) { return { mitarbeiter_id: m.id, personalnummer: m.personalnummer, name: m.name, krankenkasse: m.krankenkasse || '— fehlt —', kv_art: m.kv_art, beschaeftigung: besch(m), sv: m.sv_nummer ? m.sv_nummer.slice(0, 2) + ' ' + m.sv_nummer.slice(2, 8) + ' ' + m.sv_nummer.slice(8, 9) + ' ' + m.sv_nummer.slice(9) : '' }; }).sort(function (a, b) { return String(a.krankenkasse).localeCompare(String(b.krankenkasse)); }); } },
  { id: 'unterlagen', gruppe: 'Mitarbeiter', titel: 'Fehlende Unterlagen & Fristen', text: 'Ablaufende Aufenthaltstitel, Befristungen, Probezeiten und Dokumente — und fehlende Pflichtangaben in den Akten.', p: ['tage'], standard: { tage: 90 },
    spalten: [S('datum', 'Datum', 'datum'), S('name', 'Mitarbeiter'), S('was', 'Was'), S('status', 'Status')],
    daten: function (db, p) { return P.fristen(db, heute(), Number(p.tage) || 90).map(function (f) { return { mitarbeiter_id: f.mitarbeiter_id, datum: f.datum, name: f.name, was: f.was, status: f.abgelaufen ? 'abgelaufen' : f.datum ? 'läuft ab' : 'unvollständig' }; }); } },
  { id: 'neu', gruppe: 'Mitarbeiter', titel: 'Neue Mitarbeiter', text: 'Eintritte im Zeitraum — für Anmeldung zur Sozialversicherung und Einarbeitung.', p: ['zeitraum'],
    spalten: [S('eintritt', 'Eintritt', 'datum'), S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('beschaeftigung', 'Beschäftigung'), S('taetigkeit', 'Tätigkeit'), S('akte', 'Akte')],
    daten: function (db, p) { return ma(db).filter(function (m) { return m.eintritt && m.eintritt >= p.von && m.eintritt <= p.bis; }).map(function (m) { const l = P.luecken(m); return { mitarbeiter_id: m.id, eintritt: m.eintritt, personalnummer: m.personalnummer, name: m.name, beschaeftigung: besch(m), taetigkeit: m.taetigkeit, akte: l.length ? l.length + ' Angaben fehlen' : 'vollständig' }; }); } },
  { id: 'ausgeschieden', gruppe: 'Mitarbeiter', titel: 'Ausgeschiedene Mitarbeiter', text: 'Austritte im Zeitraum — Abmeldung, Arbeitsbescheinigung, Schlüssel und Dienstkleidung zurück.', p: ['zeitraum'],
    spalten: [S('austritt', 'Austritt', 'datum'), S('personalnummer', 'Pers.-Nr.'), S('name', 'Mitarbeiter'), S('eintritt', 'Eintritt', 'datum'), S('beschaeftigung', 'Beschäftigung'), S('letzter', 'letzter Einsatz', 'datum')],
    daten: function (db, p) { return ma(db).filter(function (m) { return m.austritt && m.austritt >= p.von && m.austritt <= p.bis; }).map(function (m) { return { mitarbeiter_id: m.id, austritt: m.austritt, personalnummer: m.personalnummer, name: m.name, eintritt: m.eintritt, beschaeftigung: besch(m), letzter: letzterEinsatz(db, m.id) }; }); } },
  { id: 'anmeldungen', gruppe: 'Mitarbeiter', titel: 'Anmeldungen', text: 'Wann sich wer angemeldet hat — Büro, Mitarbeiter-App und Kundenportal.', p: ['zeitraum'],
    spalten: [S('zeit', 'Zeitpunkt'), S('name', 'Name'), S('rolle', 'Zugang')],
    daten: function (db, p) { return db.prepare("SELECT * FROM anmeldung_log WHERE substr(zeit,1,10) BETWEEN ? AND ? ORDER BY zeit DESC LIMIT 5000").all(p.von, p.bis).map(function (a) { return { zeit: a.zeit.slice(0, 16).split(' ').map(function (x, i) { return i ? x : x.split('-').reverse().join('.'); }).join(' '), name: a.name, rolle: { buero: 'Büro', mitarbeiter: 'Mitarbeiter-App', kunde: 'Kundenportal' }[a.rolle] || a.rolle, mitarbeiter_id: a.rolle === 'mitarbeiter' ? a.wer_id : null }; }); } },
  { id: 'eingestempelt', gruppe: 'Einsatz', titel: 'Wer ist gerade eingestempelt?', text: 'Alle offenen Stempelungen — wer ist jetzt vor Ort (Terminal-Übersicht).', p: [],
    spalten: [S('name', 'Mitarbeiter'), S('objekt', 'Objekt'), S('seit', 'seit'), S('dauer', 'bisher', 'std')],
    daten: function (db) { const jetzt = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); return db.prepare('SELECT z.*, m.name, o.name objekt FROM zeitbuchung z JOIN mitarbeiter m ON m.id = z.mitarbeiter_id LEFT JOIN objekt o ON o.id = z.objekt_id WHERE z.gehen IS NULL ORDER BY z.kommen').all().map(function (z) { return { mitarbeiter_id: z.mitarbeiter_id, name: z.name, objekt: z.objekt, seit: z.kommen.slice(0, 16).split(' ').map(function (x, i) { return i ? x : x.split('-').reverse().join('.'); }).join(' '), dauer: r2((new Date(jetzt.replace(' ', 'T')) - new Date(z.kommen.replace(' ', 'T'))) / 3600000) }; }); } },
  { id: 'leere_schichten', gruppe: 'Einsatz', titel: 'Leere und unbestätigte Schichten', text: 'Schichten ohne Mitarbeiter oder noch nicht von der Kraft bestätigt — und Einsatztage im LV ohne Schicht.', p: ['zeitraum_zukunft'],
    spalten: [S('datum', 'Datum', 'datum'), S('zeit', 'Zeit'), S('objekt', 'Objekt'), S('mitarbeiter', 'Mitarbeiter'), S('status', 'Status')],
    daten: function (db, p) { return db.prepare("SELECT s.*, o.name objekt, m.name mitarbeiter FROM schicht s JOIN objekt o ON o.id = s.objekt_id LEFT JOIN mitarbeiter m ON m.id = s.mitarbeiter_id WHERE s.datum BETWEEN ? AND ? AND s.status <> 'abgesagt' AND (s.mitarbeiter_id IS NULL OR s.status = 'geplant') ORDER BY s.datum, s.beginn").all(p.von, p.bis).map(function (s) { return { mitarbeiter_id: s.mitarbeiter_id, datum: s.datum, zeit: s.beginn + '–' + s.ende, objekt: s.objekt, mitarbeiter: s.mitarbeiter || '— unbesetzt —', status: s.mitarbeiter_id ? 'nicht bestätigt' : 'unbesetzt' }; }); } },
  { id: 'erledigung', gruppe: 'Objekte & Kunden', titel: 'Erledigungsquote', text: 'Fällige Aufgaben laut Leistungsverzeichnis gegen erledigte (abgehakt in der App) je Objekt — höchstens 62 Tage.', p: ['zeitraum'],
    spalten: [S('objekt', 'Objekt'), S('soll', 'Aufgaben fällig', 'zahl'), S('fertig', 'erledigt', 'zahl'), S('quote', 'Quote', 'prozent'), S('qr', 'davon per QR vor Ort', 'zahl')],
    daten: function (db, p) {
      if (tageZw(p.von, p.bis) > 62) throw new Error('Für die Erledigungsquote höchstens 62 Tage wählen.');
      const PLAN = require('./plan'), je = {};
      for (let d = p.von; d <= p.bis; d = plus(d, 1)) PLAN.tag(db, d).objekte.forEach(function (o) { const x = je[o.id] = je[o.id] || { objekt_id: o.id, objekt: o.name, soll: 0, fertig: 0 }; x.soll += o.soll; x.fertig += o.fertig; });
      return Object.keys(je).map(function (k) { const x = je[k]; x.quote = x.soll ? Math.round(x.fertig / x.soll * 1000) / 10 : null; x.qr = db.prepare('SELECT COUNT(*) n FROM erledigung e JOIN lv_position l ON l.id = e.position_id WHERE l.objekt_id = ? AND e.per_qr = 1 AND e.datum BETWEEN ? AND ?').get(x.objekt_id, p.von, p.bis).n; return x; });
    } },
  // ---------------- Objekte & Kunden
  { id: 'planungen', gruppe: 'Objekte & Kunden', titel: 'Planungen Soll / Ist mit Rendite', text: 'Je Objekt Stunden und Umsatz Soll (Kalkulation, Monatspreis) gegen Ist (Zeiterfassung, Rechnungen), Lohnkosten und Rendite = DB I / Lohnkosten × 100.', p: ['zeitraum'],
    spalten: [S('objekt', 'Objekt'), S('kunde', 'Kunde'), S('sollStd', 'Std. Soll', 'std'), S('istStd', 'Std. Ist', 'std'), S('umsatzSoll', 'Umsatz Soll', 'euro'), S('umsatzIst', 'Umsatz Ist', 'euro'), S('lohn', 'Lohnkosten', 'euro'), S('db', 'DB I', 'euro'), S('rendite', 'Rendite', 'prozent')],
    daten: function (db, p) {
      const a = AUSW.objekte(db, p.von, p.bis), monate = (tageZw(p.von, p.bis) + 1) / (365 / 12);
      return a.objekte.map(function (o) { return { objekt_id: o.id, objekt: o.name, kunde: o.kunde, sollStd: o.sollStunden, istStd: o.istStunden, umsatzSoll: o.monatspreis ? r2(o.monatspreis * monate) : null, umsatzIst: o.umsatz, lohn: o.lohnkosten, db: o.db, rendite: o.lohnkosten ? Math.round(o.db / o.lohnkosten * 1000) / 10 : null }; });
    } },
  { id: 'kunden', gruppe: 'Objekte & Kunden', titel: 'Kunden-Controlling', text: 'Je Kunde: Umsatz, Rechnungen, offen, überfällig, durchschnittliche Zahlungsdauer.', p: ['zeitraum'],
    spalten: [S('kunde', 'Kunde'), S('kundennummer', 'Kd.-Nr.'), S('objekte', 'Objekte', 'zahl'), S('rechnungen', 'Rechnungen', 'zahl'), S('umsatz', 'Umsatz netto', 'euro'), S('offen', 'offen', 'euro'), S('ueberfaellig', 'überfällig', 'euro'), S('zahlungsdauer', 'Ø Tage bis Zahlung', 'zahl')],
    daten: function (db, p) {
      return db.prepare('SELECT * FROM kunde ORDER BY name').all().map(function (k) {
        const re = db.prepare("SELECT * FROM rechnung WHERE kunde_id = ? AND nummer IS NOT NULL AND datum BETWEEN ? AND ?").all(k.id, p.von, p.bis);
        const op = db.prepare("SELECT * FROM rechnung WHERE kunde_id = ? AND status = 'gestellt' AND storno_von IS NULL").all(k.id).map(function (r) { r.o = AB.offenBetrag(db, r); return r; });
        const bez = re.filter(function (r) { return r.status === 'bezahlt' && r.bezahlt_am; }).map(function (r) { return tageZw(r.datum, r.bezahlt_am); });
        return { kunde: k.name, kundennummer: k.kundennummer, objekte: db.prepare('SELECT COUNT(*) n FROM objekt WHERE kunde_id = ?').get(k.id).n, rechnungen: re.filter(function (r) { return !r.storno_von; }).length, umsatz: r2(re.reduce(function (a, r) { return a + r.netto; }, 0)),
          offen: r2(op.reduce(function (a, r) { return a + r.o; }, 0)), ueberfaellig: r2(op.filter(function (r) { return r.faellig < heute(); }).reduce(function (a, r) { return a + r.o; }, 0)), zahlungsdauer: bez.length ? Math.round(bez.reduce(function (a, t) { return a + t; }, 0) / bez.length) : null };
      }).filter(function (x) { return x.objekte || x.rechnungen || x.offen; });
    } },
  { id: 'abrechnung_kunde', gruppe: 'Objekte & Kunden', titel: 'Controlling Abrechnung je Kunde', text: 'Abrechnung der Kunden gegen die Lohnkosten ihrer Objekte bis zum DB I, mit Rendite.', p: ['zeitraum'],
    spalten: [S('kunde', 'Kunde'), S('umsatz', 'Umsatz netto', 'euro'), S('lohn', 'Lohnkosten', 'euro'), S('db', 'DB I', 'euro'), S('dbProzent', 'DB %', 'prozent'), S('rendite', 'Rendite', 'prozent'), S('stunden', 'Ist-Stunden', 'std')],
    daten: function (db, p) {
      const a = AUSW.objekte(db, p.von, p.bis), je = {};
      a.objekte.forEach(function (o) { const k = o.kunde || '— ohne Kunde —', x = je[k] = je[k] || { kunde: k, umsatz: 0, lohn: 0, stunden: 0 }; x.umsatz += o.umsatz; x.lohn += o.lohnkosten; x.stunden += o.istStunden; });
      return Object.keys(je).map(function (k) { const x = je[k]; x.umsatz = r2(x.umsatz); x.lohn = r2(x.lohn); x.stunden = r2(x.stunden); x.db = r2(x.umsatz - x.lohn); x.dbProzent = x.umsatz ? Math.round(x.db / x.umsatz * 1000) / 10 : null; x.rendite = x.lohn ? Math.round(x.db / x.lohn * 1000) / 10 : null; return x; });
    } },
  { id: 'qualitaet', gruppe: 'Objekte & Kunden', titel: 'Qualitätsbericht', text: 'Qualitätsprüfungen je Objekt im Zeitraum: Anzahl, Durchschnitt, schlechtestes Ergebnis, abgezeichnet vom Kunden.', p: ['zeitraum'],
    spalten: [S('objekt', 'Objekt'), S('pruefungen', 'Prüfungen', 'zahl'), S('schnitt', 'Ø Ergebnis', 'prozent'), S('min', 'schlechteste', 'prozent'), S('abgezeichnet', 'vom Kunden abgezeichnet', 'zahl'), S('letzte', 'letzte Prüfung', 'datum')],
    daten: function (db, p) { return db.prepare("SELECT o.id objekt_id, o.name objekt, COUNT(pr.id) pruefungen, AVG(pr.ergebnis) schnitt, MIN(pr.ergebnis) min, SUM(pr.abgezeichnet_von IS NOT NULL) abgezeichnet, MAX(pr.datum) letzte FROM objekt o LEFT JOIN pruefung pr ON pr.objekt_id = o.id AND pr.ergebnis IS NOT NULL AND pr.datum BETWEEN ? AND ? WHERE o.status = 'aktiv' GROUP BY o.id ORDER BY o.name").all(p.von, p.bis).map(function (x) { x.schnitt = x.schnitt == null ? null : Math.round(x.schnitt * 10) / 10; return x; }); } },
  { id: 'maengel', gruppe: 'Objekte & Kunden', titel: 'Mängel-Report', text: 'Gemeldete Mängel im Zeitraum mit Quelle, Status und Dauer bis zur Behebung.', p: ['zeitraum'],
    spalten: [S('gemeldet', 'gemeldet', 'datum'), S('objekt', 'Objekt'), S('text', 'Mangel'), S('quelle', 'Quelle'), S('status', 'Status'), S('tage', 'Tage bis erledigt', 'zahl')],
    daten: function (db, p) { return db.prepare("SELECT m.*, o.name objekt FROM mangel m JOIN objekt o ON o.id = m.objekt_id WHERE substr(m.gemeldet_am,1,10) BETWEEN ? AND ? ORDER BY m.gemeldet_am DESC").all(p.von, p.bis).map(function (m) { return { objekt_id: m.objekt_id, gemeldet: m.gemeldet_am.slice(0, 10), objekt: m.objekt, text: m.text, quelle: m.quelle, status: m.status, tage: m.erledigt_am ? tageZw(m.gemeldet_am.slice(0, 10), m.erledigt_am.slice(0, 10)) : null }; }); } },
  { id: 'vertraege', gruppe: 'Objekte & Kunden', titel: 'Auslaufende Verträge', text: 'Objekte, deren Vertrag in den nächsten Tagen endet — rechtzeitig verlängern oder neu anbieten.', p: ['tage'], standard: { tage: 180 },
    spalten: [S('vertragsende', 'Vertragsende', 'datum'), S('objekt', 'Objekt'), S('kunde', 'Kunde'), S('kuendigungsfrist', 'Kündigungsfrist'), S('monatspreis', 'Monatspreis', 'euro'), S('tage', 'Tage bis Ende', 'zahl')],
    daten: function (db, p) { return db.prepare("SELECT o.*, k.name kunde FROM objekt o LEFT JOIN kunde k ON k.id = o.kunde_id WHERE o.vertragsende IS NOT NULL AND o.vertragsende <= ? ORDER BY o.vertragsende").all(plus(heute(), Number(p.tage) || 180)).map(function (o) { return { objekt_id: o.id, vertragsende: o.vertragsende, objekt: o.name, kunde: o.kunde, kuendigungsfrist: o.kuendigungsfrist, monatspreis: o.monatspreis, tage: tageZw(heute(), o.vertragsende) }; }); } },
  // ---------------- Finanzen
  { id: 'zahlungen', gruppe: 'Finanzen', titel: 'Zahlungseingänge', text: 'Alle gebuchten Zahlungen im Zeitraum mit Art und Rechnung.', p: ['zeitraum'],
    spalten: [S('datum', 'Datum', 'datum'), S('nummer', 'Rechnung'), S('kunde', 'Kunde'), S('art', 'Art'), S('betrag', 'Betrag', 'euro'), S('notiz', 'Notiz')],
    daten: function (db, p) { return db.prepare("SELECT z.*, r.nummer, k.name kunde FROM zahlung z JOIN rechnung r ON r.id = z.rechnung_id JOIN kunde k ON k.id = r.kunde_id WHERE z.datum BETWEEN ? AND ? ORDER BY z.datum").all(p.von, p.bis).map(function (z) { return { rechnung_id: z.rechnung_id, datum: z.datum, nummer: z.nummer, kunde: z.kunde, art: AB.ZAHLART[z.art] || z.art, betrag: z.betrag, notiz: z.notiz }; }); } },
  { id: 'umsatz_monat', gruppe: 'Finanzen', titel: 'Umsatz je Kunde und Monat', text: 'Netto-Umsatz nach Rechnungsdatum als Kreuztabelle über das Jahr.', p: ['jahr'],
    spalten: [S('kunde', 'Kunde')].concat(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(function (m) { return S('m' + m, m + '/', 'euro'); })).concat([S('summe', 'Jahr', 'euro')]),
    daten: function (db, p) { const j = String(p.jahr), je = {}; db.prepare("SELECT r.netto, r.datum, k.name FROM rechnung r JOIN kunde k ON k.id = r.kunde_id WHERE r.nummer IS NOT NULL AND substr(r.datum,1,4) = ?").all(j).forEach(function (r) { const x = je[r.name] = je[r.name] || { kunde: r.name, summe: 0 }; const k = 'm' + r.datum.slice(5, 7); x[k] = r2((x[k] || 0) + r.netto); x.summe = r2(x.summe + r.netto); }); return Object.keys(je).map(function (k) { return je[k]; }).sort(function (a, b) { return b.summe - a.summe; }); } },
  { id: 'ausbuchungen', gruppe: 'Finanzen', titel: 'Forderungsverluste', text: 'Ausgebuchte Beträge (uneinbringlich) — für den Steuerberater (Umsatzsteuerkorrektur nach § 17 UStG).', p: ['zeitraum'],
    spalten: [S('datum', 'ausgebucht am', 'datum'), S('nummer', 'Rechnung'), S('kunde', 'Kunde'), S('betrag', 'Betrag brutto', 'euro'), S('notiz', 'Grund')],
    daten: function (db, p) { return db.prepare("SELECT z.*, r.nummer, k.name kunde FROM zahlung z JOIN rechnung r ON r.id = z.rechnung_id JOIN kunde k ON k.id = r.kunde_id WHERE z.art = 'ausbuchung' AND z.datum BETWEEN ? AND ? ORDER BY z.datum").all(p.von, p.bis).map(function (z) { return { rechnung_id: z.rechnung_id, datum: z.datum, nummer: z.nummer, kunde: z.kunde, betrag: z.betrag, notiz: z.notiz }; }); } },
  // ---------------- Bewerber & Aufgaben
  { id: 'bewerber', gruppe: 'Bewerber & Aufgaben', titel: 'Bewerbungen im Zeitraum', text: 'Eingegangene Bewerbungen mit Quelle und Ergebnis.', p: ['zeitraum'],
    spalten: [S('eingang', 'Eingang', 'datum'), S('name', 'Name'), S('position', 'Position'), S('quelle', 'Quelle'), S('status', 'Status')],
    daten: function (db, p) { const BW = require('./bewerber'); return db.prepare("SELECT * FROM bewerber WHERE substr(angelegt_am,1,10) BETWEEN ? AND ? ORDER BY angelegt_am DESC").all(p.von, p.bis).map(function (b) { return { eingang: b.angelegt_am.slice(0, 10), name: [b.vorname, b.nachname].filter(Boolean).join(' '), position: b.position, quelle: (BW.QUELLEN.find(function (q) { return q[0] === b.quelle; }) || [0, ''])[1], status: (BW.STATUS.find(function (s) { return s[0] === b.status; }) || [0, b.status])[1] }; }); } },
  { id: 'aufgaben', gruppe: 'Bewerber & Aufgaben', titel: 'Offene und überfällige Aufgaben', text: 'Alle offenen Planner-Aufgaben nach Zuständigen, überfällige zuerst.', p: [],
    spalten: [S('faellig', 'fällig', 'datum'), S('titel', 'Aufgabe'), S('board', 'Board'), S('zustaendig', 'zuständig'), S('prioritaet', 'Priorität'), S('status', 'Status')],
    daten: function (db) { const KOMM = require('./kommunikation'), pn = {}; KOMM.personen(db).forEach(function (x) { pn[x.id] = x.name; }); return db.prepare("SELECT a.*, b.name board FROM aufgabe a JOIN board b ON b.id = a.board_id WHERE a.erledigt = 0 AND b.archiviert = 0 ORDER BY a.faellig IS NULL, a.faellig").all().map(function (a) { return { faellig: a.faellig, titel: a.titel, board: a.board, zustaendig: pn[a.zustaendig] || '— offen —', prioritaet: a.prioritaet, status: a.faellig && a.faellig < heute() ? 'überfällig' : 'offen' }; }); } }
];

function katalog() { return REPORTS.map(function (r) { return { id: r.id, gruppe: r.gruppe, titel: r.titel, text: r.text, p: r.p, standard: r.standard || {}, spalten: r.spalten }; }); }
function ausfuehren(db, id, q) {
  const r = REPORTS.find(function (x) { return x.id === id; }); if (!r) throw new Error('Report nicht gefunden');
  const p = Object.assign({}, r.standard || {}, q || {});
  const jetzt = heute();
  if (r.p.indexOf('zeitraum') >= 0 || r.p.indexOf('zeitraum_zukunft') >= 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.von || '')) p.von = r.p.indexOf('zeitraum_zukunft') >= 0 ? jetzt : jetzt.slice(0, 8) + '01';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.bis || '')) p.bis = r.p.indexOf('zeitraum_zukunft') >= 0 ? plus(jetzt, 13) : jetzt;
    if (p.bis < p.von) throw new Error('Zeitraum: „bis" liegt vor „von".');
    if (tageZw(p.von, p.bis) > 3700) throw new Error('Zeitraum höchstens 10 Jahre.');
  }
  if (r.p.indexOf('jahr') >= 0 && !/^\d{4}$/.test(String(p.jahr || ''))) p.jahr = jetzt.slice(0, 4);
  if (r.p.indexOf('tage') >= 0) p.tage = Math.max(1, Math.min(3650, Number(p.tage) || (r.standard || {}).tage || 60));
  const spalten = r.spalten.map(function (s) { return Object.assign({}, s, { t: s.t.replace(/^(\d\d)\/$/, '$1/' + String(p.jahr || '').slice(2)) }); });
  return { id: r.id, titel: r.titel, text: r.text, gruppe: r.gruppe, parameter: p, spalten: spalten, zeilen: r.daten(db, p) };
}
function csv(e) {
  const z = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const wert = (s, v) => v == null ? '' : (s.typ === 'euro' || s.typ === 'std' || s.typ === 'prozent') ? String(r2(v)).replace('.', ',') : s.typ === 'datum' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split('-').reverse().join('.') : v;
  return '﻿' + [e.spalten.map(function (s) { return z(s.t); }).join(';')].concat(e.zeilen.map(function (r) { return e.spalten.map(function (s) { return z(wert(s, r[s.k])); }).join(';'); })).join('\r\n') + '\r\n';
}

module.exports = { katalog, ausfuehren, csv };
