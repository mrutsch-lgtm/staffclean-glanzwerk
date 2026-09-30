'use strict';
// Knopf „Vertrieb" (30.09.2026): Glanzwerk stellt den Anmeldezettel für vertrieb.staffclean.de aus.
// Geprüft wird das Format, das der Vertrieb (firma.js im Sales-Hub-Repository) erwartet: base64url(JSON) + "." + HMAC.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const SCHLUESSEL = 'p'.repeat(48);
process.env.SSO_SCHLUESSEL = SCHLUESSEL;
process.env.STAFFCLEAN_VERTRIEB_URL = 'https://vertrieb.beispiel';
const V = require('../lib/vertrieb');

function lesen(zettel) {
  const [inhalt, sig] = zettel.split('.');
  const soll = crypto.createHmac('sha256', SCHLUESSEL).update(inhalt).digest('base64url');
  return { echt: sig === soll, daten: JSON.parse(Buffer.from(inhalt, 'base64url').toString('utf8')) };
}

test('Zettel ist signiert, kurzlebig und für den StaffClean-Vertrieb bestimmt', function () {
  const z = lesen(V.zettel({ name: 'Petra Beispiel', email: 'Petra@Beispiel.de', berechtigung: 'admin' }));
  assert.strictEqual(z.echt, true);
  assert.strictEqual(z.daten.ziel, 'staffclean');
  assert.strictEqual(z.daten.email, 'petra@beispiel.de');
  assert.strictEqual(z.daten.von, 'glanzwerk');
  assert.ok(z.daten.ablauf > Date.now() && z.daten.ablauf <= Date.now() + 61000);
  assert.ok(/^[0-9a-f]{24}$/.test(z.daten.nonce));
});

test('Nur Admins im Büro werden Admins im Vertrieb', function () {
  assert.strictEqual(lesen(V.zettel({ name: 'A', berechtigung: 'admin' })).daten.rolle, 'admin');
  assert.strictEqual(lesen(V.zettel({ name: 'B' })).daten.rolle, 'admin');           // ohne Angabe gilt Admin (wie in rechte.js)
  assert.strictEqual(lesen(V.zettel({ name: 'C', berechtigung: 'objektleitung' })).daten.rolle, 'closer');
});

test('Adresse zeigt auf den Vertrieb, zwei Zettel sind nie gleich', function () {
  const a = V.adresse({ name: 'A' }), b = V.adresse({ name: 'A' });
  assert.ok(a.startsWith('https://vertrieb.beispiel/sso?t='));
  assert.notStrictEqual(a, b);
});
