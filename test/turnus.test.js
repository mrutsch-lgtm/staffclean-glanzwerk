'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/turnus');
const F = require('../lib/feiertage');

const an = (k, d, rt, land) => T.faellig(T.lesen(k, rt), d, land || 'SH').an;

test('Ostern und Feiertage SH 2026', function () {
  assert.strictEqual(F.ostersonntag(2026).toISOString().slice(0, 10), '2026-04-05');
  const f = F.feiertage(2026, 'SH');
  assert.strictEqual(f['2026-04-03'], 'Karfreitag');
  assert.strictEqual(f['2026-05-14'], 'Christi Himmelfahrt');
  assert.strictEqual(f['2026-10-31'], 'Reformationstag');
  assert.strictEqual(F.feiertage(2026, 'BY')['2026-10-31'], undefined);
});

test('5 W = Mo bis Fr, nicht am Wochenende, nicht am Feiertag', function () {
  assert.ok(an('5 W', '2026-09-28'));          // Montag
  assert.ok(an('5 W', '2026-10-02'));          // Freitag
  assert.ok(!an('5 W', '2026-10-03'));         // Samstag + Tag der Deutschen Einheit
  assert.ok(!an('5 W', '2026-10-04'));         // Sonntag
  const r = T.faellig(T.lesen('5 W'), '2026-12-25', 'SH');
  assert.ok(!r.an && /Feiertag/.test(r.grund));
});

test('3 W = Mo/Mi/Fr, 2 W = Di/Fr, 1 W am Reinigungstag', function () {
  assert.ok(an('3 W', '2026-09-30') && !an('3 W', '2026-09-29'));
  assert.ok(an('2 W', '2026-09-29') && an('2 W', '2026-10-02') && !an('2 W', '2026-09-28'));
  assert.ok(an('1 W', '2026-09-28') && !an('1 W', '2026-09-29'));
  assert.ok(an('1 W', '2026-10-01', 4) && !an('1 W', '2026-09-28', 4));   // Reinigungstag Donnerstag
});

test('2,5 W wechselt zwischen geraden und ungeraden Kalenderwochen', function () {
  // KW 40/2026 beginnt Mo 28.09. (gerade) → Mo/Mi/Fr; KW 41 (ungerade) → Di/Do
  assert.strictEqual(T.kw('2026-09-28'), 40);
  assert.ok(an('2,5 W', '2026-09-28') && !an('2,5 W', '2026-09-29'));
  assert.ok(an('2,5 W', '2026-10-06') && !an('2,5 W', '2026-10-05'));
});

test('1 M = erster Reinigungstag im Monat, Feiertag rutscht weiter', function () {
  assert.ok(an('1 M', '2026-10-05') && !an('1 M', '2026-10-12'));   // erster Montag im Oktober 2026
  assert.ok(!an('1 M', '2026-04-06') && an('1 M', '2026-04-13'));   // Ostermontag 06.04. → 13.04.
  assert.ok(an('2 M', '2026-10-05') && an('2 M', '2026-10-19') && !an('2 M', '2026-10-12'));
});

test('Bedarf, Wochentagsliste, unbekannt', function () {
  assert.ok(!an('B', '2026-09-28'));
  assert.strictEqual(T.lesen('bei Bedarf').art, 'bedarf');
  assert.ok(an('Mo, Do', '2026-10-01') && !an('Mo, Do', '2026-09-30'));
  assert.strictEqual(T.lesen('xyz').art, 'unbekannt');
  assert.ok(an('14T', '2026-09-28') && !an('14T', '2026-10-05') && an('14T', '2026-10-12'));
  assert.ok(an('1 Q', '2026-10-05') && !an('1 Q', '2026-11-02'));
});

test('Kürzel aus Wettbewerber-LVs: n-ter Wochentag, jN, feste Monate, Sichtreinigung, Legende', function () {
  const T = require('../lib/turnus');
  const jahr = (k) => { const r = T.lesen(k, 1), t = []; for (let d = new Date('2026-01-01T12:00:00Z'); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) { const s = d.toISOString().slice(0, 10); if (T.faellig(r, s, 'SH').an) t.push(s); } return t; };
  assert.deepStrictEqual(jahr('1. Mi').slice(9, 11), ['2026-10-07', '2026-11-04']);
  assert.strictEqual(jahr('1. Mi').length, 12);
  assert.strictEqual(jahr('j2').length, 2); assert.strictEqual(jahr('j4').length, 4); assert.strictEqual(jahr('j6').length, 6);
  assert.ok([7, 8].includes(jahr('j8').length));
  assert.deepStrictEqual(jahr('2 J (4,10)'), ['2026-04-13', '2026-10-05']);   // 06.04. ist Ostermontag → nächster Montag
  assert.strictEqual(T.lesen('S3', 1).sicht, true); assert.strictEqual(T.lesen('2,5', 1).art, 'wechsel');
  assert.strictEqual(T.lesen('m2', 1).art, 'unbekannt');                      // ohne Legende nicht raten
  assert.strictEqual(T.ausBeschreibung('14-täglich (gerade Wochen)'), '14T');
  assert.strictEqual(T.ausBeschreibung('1x monatlich, 1. Mi im Monat'), '1. Mi');
  assert.strictEqual(T.ausBeschreibung('2x jährlich'), 'j2');
  assert.strictEqual(T.ausBeschreibung('3x wöchentliche Sichtreinigung'), 'S3');
  assert.strictEqual(T.ausBeschreibung('irgendwas'), null);
});
