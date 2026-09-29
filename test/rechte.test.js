'use strict';
// Berechtigungen nach SecPlan-Vorbild (29.09.2026): echter Server, frische Datenbank, echte Anfragen.
// Prüft, was die Schnittstelle zulässt — die Oberfläche blendet nur aus und ist nicht die Sicherung.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os'), path = require('path'), fs = require('fs');

process.env.STAFFCLEAN_DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-rechte-'));
const { server } = require('../server');
let BASIS; const keks = {};
async function rufen(wer, pfad, daten) {
  const opt = { headers: {} };
  if (keks[wer]) opt.headers.Cookie = keks[wer];
  if (daten !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(daten); opt.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(BASIS + pfad, opt);
  const sc = r.headers.get('set-cookie'); if (sc && /gw=/.test(sc)) keks[wer] = sc.split(';')[0];
  const typ = r.headers.get('content-type') || '';
  return { status: r.status, j: /json/.test(typ) ? await r.json() : null };
}
const anmelden = (wer, email) => rufen(wer, '/api/anmelden', { email: email, passwort: 'ein-langes-passwort-2026' });
let objA, objB, martin, planerId, leiterId;

test.before(async function () { await new Promise(ok => server.listen(0, '127.0.0.1', ok)); BASIS = 'http://127.0.0.1:' + server.address().port; });
test.after(function () { server.close(); });

test('Einrichtung: erstes Büro-Konto ist Admin', async function () {
  assert.strictEqual((await rufen('admin', '/api/einrichten', { name: 'Manuel', email: 'admin@example.org', passwort: 'ein-langes-passwort-2026' })).status, 200);
  const ich = (await rufen('admin', '/api/ich')).j;
  assert.strictEqual(ich.berechtigung, 'admin');
  assert.ok(ich.bereiche.includes('administration') && ich.bereiche.includes('abrechnung'));
  objA = (await rufen('admin', '/api/objekt', { name: 'Objekt Alpha' })).j.id;
  objB = (await rufen('admin', '/api/objekt', { name: 'Objekt Beta' })).j.id;
  martin = (await rufen('admin', '/api/mitarbeiter', { name: 'Martin Korf', stundenlohn: '17', personalnummer: '2001' })).j.id;
  assert.ok(objA && objB && martin);
});

test('Administration → Berechtigungen: Übersicht mit Rollen, Sonderrechten, Mitarbeitern', async function () {
  const b = (await rufen('admin', '/api/berechtigungen')).j;
  assert.deepStrictEqual(Object.keys(b.rollen), ['admin', 'bereichsadmin', 'planer', 'controller', 'einsatzleiter', 'objektleiter']);
  assert.ok(b.sonder.abrechnung_kunden && b.sonder.lohn_ausgeblendet);
  assert.strictEqual(b.anzahl.admin, 1);
  assert.ok(b.mitarbeiter.some(m => m.name === 'Martin Korf'));
});

test('Planer (Martin Korf): Planung und Personal ja, Abrechnung und Administration nein', async function () {
  const r = await rufen('admin', '/api/konto', { rolle: 'buero', berechtigung: 'planer', name: 'Martin Korf', email: 'martin@example.org', passwort: 'ein-langes-passwort-2026', mitarbeiter_id: martin });
  assert.strictEqual(r.status, 200); planerId = r.j.id;
  assert.strictEqual((await anmelden('planer', 'martin@example.org')).status, 200);
  const ich = (await rufen('planer', '/api/ich')).j;
  assert.strictEqual(ich.berechtigung, 'planer');
  assert.strictEqual((await rufen('planer', '/api/objekte')).status, 200);
  assert.strictEqual((await rufen('planer', '/api/mitarbeiter')).status, 200);
  assert.strictEqual((await rufen('planer', '/api/controlling')).status !== 403, true);
  assert.strictEqual((await rufen('planer', '/api/rechnungen')).status, 403);
  assert.strictEqual((await rufen('planer', '/api/berechtigungen')).status, 403);
  assert.strictEqual((await rufen('planer', '/api/einstellungen')).status, 403);
  assert.strictEqual((await rufen('planer', '/api/konto', { rolle: 'buero', berechtigung: 'admin', name: 'X', email: 'x@example.org', passwort: 'ein-langes-passwort-2026' })).status, 403);
});

test('Sonderrecht „Abrechnung Kunden" öffnet die Abrechnung, Einschränkung „sieht wie ein User" schließt sie', async function () {
  await rufen('admin', '/api/konto', { id: planerId, sonderrechte: { abrechnung_kunden: true } });
  assert.strictEqual((await rufen('planer', '/api/rechnungen')).status, 200);
  await rufen('admin', '/api/konto', { id: planerId, sonderrechte: { abrechnung_kunden: true, abrechnung_gesperrt: true } });
  assert.strictEqual((await rufen('planer', '/api/rechnungen')).status, 403);
});

test('Einschränkung „Lohnabrechnung ausgeblendet": Stundenlohn kommt nicht mehr an', async function () {
  const vorher = (await rufen('planer', '/api/mitarbeiter')).j.find(m => m.id === martin);
  assert.ok('stundenlohn' in vorher);
  await rufen('admin', '/api/konto', { id: planerId, sonderrechte: { lohn_ausgeblendet: true } });
  const nachher = (await rufen('planer', '/api/mitarbeiter')).j.find(m => m.id === martin);
  assert.ok(nachher && !('stundenlohn' in nachher) && !('lohngruppe' in nachher));
  assert.ok('stundenlohn' in (await rufen('admin', '/api/mitarbeiter')).j.find(m => m.id === martin), 'Admin sieht weiter alles');
});

test('Objektleiter: nur zugewiesene Objekte, fremde gesperrt, kein Objekt anlegen', async function () {
  leiterId = (await rufen('admin', '/api/konto', { rolle: 'buero', berechtigung: 'objektleiter', name: 'Olga Leiterin', email: 'olga@example.org', passwort: 'ein-langes-passwort-2026', objekte: [objA] })).j.id;
  await anmelden('leiter', 'olga@example.org');
  const liste = (await rufen('leiter', '/api/objekte')).j;
  assert.deepStrictEqual(liste.map(o => o.id), [objA]);
  assert.strictEqual((await rufen('leiter', '/api/objekt?id=' + objA)).status, 200);
  assert.strictEqual((await rufen('leiter', '/api/objekt?id=' + objB)).status, 403);
  assert.strictEqual((await rufen('leiter', '/api/woche?objekt=' + objB)).status, 403);
  assert.strictEqual((await rufen('leiter', '/api/objekt', { name: 'Neu' })).status, 403);
  const team = await rufen('leiter', '/api/mitarbeiter');
  assert.strictEqual(team.status, 200, 'Objektleiter plant ein und braucht die Namen');
  assert.ok(team.j.length && team.j.every(m => !('stundenlohn' in m) && !('lohngruppe' in m)), 'aber ohne Lohndaten');
  assert.strictEqual((await rufen('leiter', '/api/mitarbeiter', { name: 'Neu' })).status, 403, 'anlegen darf er nicht');
  assert.strictEqual((await rufen('leiter', '/api/personal/fristen')).status, 403);
  const ueb = (await rufen('leiter', '/api/uebersicht')).j;
  assert.ok(!JSON.stringify(ueb.objekte || []).includes('Objekt Beta'), 'Übersicht ohne fremde Objekte');
  const ep = (await rufen('leiter', '/api/einsatzplan')).j;
  assert.ok(!JSON.stringify(ep).includes('Objekt Beta') && !(ep.auslastung || []).length, 'Tagesplan ohne fremde Objekte und ohne Lohn-Auslastung');
  assert.ok(!JSON.stringify((await rufen('leiter', '/api/tag')).j).includes('Objekt Beta'), 'Tagesansicht ohne fremde Objekte');
  const vs = JSON.stringify((await rufen('leiter', '/api/vorschlaege?objekt=' + objA)).j);
  assert.ok(!/"(lohn|verdienstMonat|stundenlohn)"/.test(vs), 'Vertretungsvorschläge ohne Lohn');
  assert.strictEqual((await rufen('leiter', '/api/vorschlaege?objekt=' + objB)).status, 403);
  assert.strictEqual((await rufen('leiter', '/api/controlling')).status, 403);
  await rufen('admin', '/api/konto', { id: leiterId, objekte: [objA, objB] });
  assert.strictEqual((await rufen('leiter', '/api/objekte')).j.length, 2);
});

test('Aussperren verhindert: eigene Admin-Berechtigung und letzter Admin bleiben', async function () {
  const ich = (await rufen('admin', '/api/konten')).j.find(k => k.email === 'admin@example.org');
  assert.strictEqual((await rufen('admin', '/api/konto', { id: ich.id, berechtigung: 'planer' })).status, 400);
  const b = (await rufen('admin', '/api/berechtigungen')).j;
  assert.strictEqual(b.anzahl.planer, 1); assert.strictEqual(b.anzahl.objektleiter, 1);
  const martinKonto = b.konten.find(k => k.id === planerId);
  assert.strictEqual(martinKonto.mitarbeiter, 'Martin Korf');
});

test('Einladung per E-Mail: Link statt Passwort, einmal gültig, neue Einladung macht alte ungültig', async function () {
  const r = await rufen('admin', '/api/konto', { rolle: 'buero', berechtigung: 'bereichsadmin', name: 'Martin Korf', email: 'martin.korf@example.org', einladen: true, mitarbeiter_id: martin });
  assert.strictEqual(r.status, 200);
  const e = r.j.einladung; assert.ok(e && /\/einladung\?t=[A-Za-z0-9_-]{20,}$/.test(e.link) && e.tage === 7);
  const t = new URL(e.link).searchParams.get('t');
  assert.strictEqual((await rufen('neu', '/api/anmelden', { email: 'martin.korf@example.org', passwort: 'irgendwas-langes-99' })).status, 401, 'ohne eingelöste Einladung kein Passwort bekannt');
  assert.strictEqual((await rufen('neu', '/api/einladung?t=falsch-falsch-falsch-falsch')).status, 404);
  assert.strictEqual((await rufen('neu', '/api/einladung?t=' + t)).j.email, 'martin.korf@example.org');
  // neue Einladung → alte ungültig
  const zweite = (await rufen('admin', '/api/konto', { id: r.j.id, einladen: true })).j.einladung;
  const t2 = new URL(zweite.link).searchParams.get('t');
  assert.strictEqual((await rufen('neu', '/api/einladung?t=' + t)).status, 404, 'alte Einladung ist ungültig');
  assert.strictEqual((await rufen('neu', '/api/einladung', { t: t2, passwort: 'kurz' })).status, 400);
  assert.strictEqual((await rufen('neu', '/api/einladung', { t: t2, passwort: 'martins-eigenes-passwort-2026' })).status, 200);
  const ich = (await rufen('neu', '/api/ich')).j;
  assert.strictEqual(ich.berechtigung, 'bereichsadmin', 'nach dem Einlösen direkt angemeldet');
  assert.strictEqual((await rufen('neu', '/api/einladung', { t: t2, passwort: 'nochmal-ein-passwort-2026' })).status, 404, 'Link nur einmal');
  assert.strictEqual((await rufen('m2', '/api/anmelden', { email: 'martin.korf@example.org', passwort: 'martins-eigenes-passwort-2026' })).status, 200);
  assert.strictEqual((await rufen('neu', '/api/rechnungen')).status, 200, 'Bereichsadmin sieht Abrechnung');
  assert.strictEqual((await rufen('neu', '/api/berechtigungen')).status, 403, 'aber keine Berechtigungen vergeben');
  const k = (await rufen('admin', '/api/konten')).j.find(x => x.email === 'martin.korf@example.org');
  assert.ok(!('einladung_hash' in k) && !k.einladung_bis, 'Einladung erledigt, Hash nie in der Liste');
});
