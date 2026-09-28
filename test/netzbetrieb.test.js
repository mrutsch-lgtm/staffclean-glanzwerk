'use strict';
// Betrieb hinter dem Webserver (STAFFCLEAN_PROXY=1): Einrichtungscode statt „direkt am Rechner", Sperre nach
// Fehlversuchen je echter Adresse (X-Forwarded-For), tägliche Sicherung. Startet den Server als eigenen Prozess.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-netz-'));
const PORT = 8792 + Math.floor(Math.random() * 200);
const URL0 = 'http://127.0.0.1:' + PORT;
let srv, ausgabe = '';

test.before(async function () {
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { STAFFCLEAN_PORT: String(PORT), STAFFCLEAN_DATEN: DATEN, STAFFCLEAN_PROXY: '1', STAFFCLEAN_DEMO: '0' }) });
  srv.stdout.on('data', d => { ausgabe += d; }); srv.stderr.on('data', d => { ausgabe += d; });
  for (let i = 0; i < 80 && !/EINRICHTUNGSCODE/.test(ausgabe); i++) await new Promise(r => setTimeout(r, 100));
});
test.after(function () { srv.kill(); try { fs.rmSync(DATEN, { recursive: true, force: true }); } catch (e) {} });
const post = (p, daten, ip) => fetch(URL0 + p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, ip ? { 'X-Forwarded-For': ip } : {}), body: JSON.stringify(daten) });

test('erstes Büro-Konto nur mit Einrichtungscode aus dem Server-Protokoll, danach ist der Code verbraucht', async function () {
  const e = await (await fetch(URL0 + '/api/einrichten')).json();
  assert.strictEqual(e.noetig, true); assert.strictEqual(e.lokal, false); assert.strictEqual(e.mitCode, true);
  const code = (ausgabe.match(/EINRICHTUNGSCODE[^:]*: ([0-9A-F]{5}-[0-9A-F]{5})/) || [])[1]; assert.ok(code, 'Code steht im Protokoll');
  const konto = { name: 'Büro', email: 'buero@example.org', passwort: 'geheim-und-lang-2026' };
  assert.strictEqual((await post('/api/einrichten', konto, '203.0.113.5')).status, 403);                                   // ohne Code
  assert.strictEqual((await post('/api/einrichten', Object.assign({ code: 'AAAAA-BBBBB' }, konto), '203.0.113.5')).status, 403);   // falscher Code
  assert.strictEqual((await post('/api/einrichten', Object.assign({ code: code.toLowerCase() }, konto), '203.0.113.5')).status, 200);
  assert.strictEqual((await post('/api/einrichten', Object.assign({ code: code }, konto), '203.0.113.6')).status, 409);           // nur einmal
});

test('Sperre nach Fehlversuchen gilt für die echte Adresse, nicht für alle hinter dem Webserver', async function () {
  const falsch = { email: 'buero@example.org', passwort: 'falsch' };
  for (let i = 0; i < 8; i++) assert.strictEqual((await post('/api/anmelden', falsch, '198.51.100.7')).status, 401);
  assert.strictEqual((await post('/api/anmelden', falsch, '198.51.100.7')).status, 429);
  assert.strictEqual((await post('/api/anmelden', { email: 'buero@example.org', passwort: 'geheim-und-lang-2026' }, '198.51.100.8')).status, 200);
});

test('tägliche Sicherung liegt in daten/sicherung', function () {
  const f = fs.readdirSync(path.join(DATEN, 'sicherung')); assert.ok(f.some(n => /^staffclean-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n)), f.join(','));
});
