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
