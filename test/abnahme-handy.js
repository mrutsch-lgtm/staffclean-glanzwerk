// abnahme-handy.js — Handy-Abnahme auf einem ECHTEN Android (Emulator „staffsec", Pixel 6, Android 15) im echten
// mobilen Chrome, gesteuert über adb (Playwright _android) — kein verkleinertes Desktop-Fenster (Lehre L-851).
//
// Misst auf jeder Seite von Büro, Mitarbeiter-App und Kundenportal:
//   1. seitliches Überlaufen (Seite breiter als der Bildschirm) und welche Elemente über den Rand ragen
//   2. Zeilenverrücker: Text, der mitten im Wort umbricht, weil sein Kasten schmaler als das längste Wort ist
//   3. zu kleine Tippziele (Knöpfe, Links, Felder unter 32 px Höhe)
//   4. zu kleine Schrift (unter 11 px)
// und macht von jeder Seite ein Bildschirmfoto (test/handy-bilder/) — die sieht ein Mensch an.
//
// Voraussetzung: Emulator läuft:  set ANDROID_AVD_HOME=E:\Werkzeuge\Android\avd  und
//   E:\Werkzeuge\Android\Sdk\emulator\emulator.exe -avd staffsec -no-window -no-audio
// Aufruf: node test/abnahme-handy.js   (Testserver mit Beispieldaten auf erstem freiem Port ab 8799 abwärts, aus dem Emulator 10.0.2.2:<Port>)
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PW = process.env.PLAYWRIGHT_PFAD || 'E:/Prozessoptimierung Staffsec/tagesgeschaeft/secplan/studytool/node_modules/playwright';
const { _android } = require(PW);
let PORT = 8799, HOST = 'http://127.0.0.1:' + PORT, GERAET = 'http://10.0.2.2:' + PORT;
const BILDER = path.join(__dirname, 'handy-bilder'); fs.mkdirSync(BILDER, { recursive: true });
fs.readdirSync(BILDER).filter(function (f) { return /^h\d+-.*\.png$/.test(f); }).forEach(function (f) { fs.unlinkSync(path.join(BILDER, f)); });   // nur eigene Bilder des letzten Laufs
const DATEN = fs.mkdtempSync(path.join(os.tmpdir(), 'glanzwerk-handy-'));
const befunde = []; let seiten = 0;

// Messung im Gerät
function messen() {
  const W = window.innerWidth, aus = { breite: document.documentElement.scrollWidth - W, rand: [], wort: [], tipp: [], schrift: [] };
  const sichtbar = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden]'); };
  const imScroll = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' „' + (e.innerText || e.value || '').trim().slice(0, 30) + '"';
  const alle = [...document.querySelectorAll('body *')].filter(sichtbar);
  alle.forEach(function (e) { const r = e.getBoundingClientRect(); if (r.right > W + 1 && !imScroll(e) && getComputedStyle(e).position !== 'fixed') aus.rand.push(name(e) + ' rechts ' + Math.round(r.right) + ' px'); });
  const span = document.createElement('span'); span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px'; document.body.appendChild(span);
  alle.forEach(function (e) {
    const eigen = [...e.childNodes].filter(function (n) { return n.nodeType === 3 && n.textContent.trim(); }).map(function (n) { return n.textContent; }).join(' ');
    if (!eigen || imScroll(e) && e.closest('table')) return;
    const s = getComputedStyle(e); if (s.textOverflow === 'ellipsis' || s.whiteSpace === 'pre' || s.whiteSpace === 'nowrap') return;
    const worte = eigen.split(/\s+/).filter(function (w) { return w.length > 3; }); if (!worte.length) return;
    const lang = worte.sort(function (a, b) { return b.length - a.length; })[0];
    span.style.fontFamily = s.fontFamily; span.style.fontSize = s.fontSize; span.style.fontWeight = s.fontWeight; span.style.fontStyle = s.fontStyle; span.style.letterSpacing = s.letterSpacing; span.style.textTransform = s.textTransform; span.textContent = lang;
    const innen = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    if (span.getBoundingClientRect().width > innen + 1 && innen > 0) aus.wort.push(name(e) + ' — „' + lang + '" (' + Math.round(span.getBoundingClientRect().width) + ' > ' + Math.round(innen) + ' px)');
    const fs = parseFloat(s.fontSize); if (fs < 11) aus.schrift.push(name(e) + ' ' + fs + ' px');
  });
  span.remove();
  alle.filter(function (e) { return e.matches('button, a.knopf, input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea, .reiter button, [data-reiter]'); }).forEach(function (e) { const r = e.getBoundingClientRect(); if (r.height < 32) aus.tipp.push(name(e) + ' ' + Math.round(r.height) + ' px hoch'); });
  // Chat-Blase verdeckt einen Knopf / ein Feld, das gerade im Bild ist?
  aus.verdeckt = [];
  const blase = document.getElementById('kommKnopf');
  if (blase && sichtbar(blase)) {
    const b = blase.getBoundingClientRect();
    alle.filter(function (e) { return !e.closest('#kommKnopf, #kommPanel') && e.matches('button, a.knopf, input, select, textarea, .app-fuss .knopf'); }).forEach(function (e) {
      const r = e.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) return;
      const x = Math.min(r.right, b.right) - Math.max(r.left, b.left), y = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (x > 8 && y > 8 && getComputedStyle(e).position === 'fixed' || (x > 8 && y > 8 && e.closest('.app-fuss'))) aus.verdeckt.push(name(e));
    });
  }
  ['rand', 'wort', 'tipp', 'schrift', 'verdeckt'].forEach(function (k) { aus[k] = [...new Set(aus[k])].slice(0, 8); });
  return aus;
}
async function pruefen(p, titel, datei) {
  await p.waitForTimeout(1300); seiten++;
  const m = await p.evaluate(messen);
  await p.screenshot({ path: path.join(BILDER, datei + '.png'), fullPage: false });
  const zeilen = [];
  if (m.breite > 1) zeilen.push('Seite ' + m.breite + ' px breiter als der Bildschirm');
  m.rand.forEach(function (x) { zeilen.push('ragt über den Rand: ' + x); });
  m.wort.forEach(function (x) { zeilen.push('Wort zerlegt: ' + x); });
  m.tipp.forEach(function (x) { zeilen.push('Tippziel zu klein: ' + x); });
  m.schrift.forEach(function (x) { zeilen.push('Schrift zu klein: ' + x); });
  m.verdeckt.forEach(function (x) { zeilen.push('Chat-Blase verdeckt: ' + x); });
  console.log((zeilen.length ? '✗ ' : '✓ ') + titel + (zeilen.length ? '\n    ' + zeilen.join('\n    ') : ''));
  zeilen.forEach(function (z) { befunde.push(titel + ': ' + z); });
}

(async function () {
  // Freien Port suchen — ist einer belegt (fremder Dienst oder alter Lauf), wird er übersprungen, nie beendet.
  // Sonst prüft der Lauf still gegen den falschen Server.
  for (let kandidat = 8799; ; kandidat--) {
    if (kandidat < 8780) throw new Error('Kein freier Port 8780–8799');
    const frei = await new Promise(function (ok) { const t = require('net').createServer(); t.once('error', function () { ok(false); }); t.listen(kandidat, '127.0.0.1', function () { t.close(function () { ok(true); }); }); });
    if (frei) { PORT = kandidat; HOST = 'http://127.0.0.1:' + PORT; GERAET = 'http://10.0.2.2:' + PORT; break; }
  }
  console.log('Testserver auf Port ' + PORT);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { STAFFCLEAN_PORT: String(PORT), STAFFCLEAN_DATEN: DATEN, STAFFCLEAN_HOST: '127.0.0.1' }) });
  let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 300 && !/läuft/.test(log); i++) await new Promise(r => setTimeout(r, 100));
  let keks = '';
  const api = async (pf, d) => { const r = await fetch(HOST + pf, { method: d ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, keks ? { Cookie: keks } : {}), body: d ? JSON.stringify(d) : undefined }); const c = r.headers.get('set-cookie'); if (c) keks = c.split(';')[0]; return r.json().catch(() => ({})); };
  let dev, ctx;
  try {
    // Testdaten: Büro-Konto, Firmendaten, eine Rechnung, eine Bewerbung, ein Kundenzugang
    await api('/api/einrichten', { name: 'Handy Büro', email: 'handy@example.org', passwort: 'Handy-Pruefung-2026' });
    await api('/api/anmelden', { email: 'handy@example.org', passwort: 'Handy-Pruefung-2026' });
    await api('/api/einstellungen', { firma_email: 'r@example.org', steuernummer: '00/000/00000', iban: 'DE02120300000000202051', bank: 'Testbank' });
    const kunden = await api('/api/kunden'), k = kunden[0]; await api('/api/kunde', Object.assign({}, k, { anschrift: 'Musterweg 1', plz: '24534', ort: 'Neumünster' }));
    const obj = (await api('/api/objekte'))[0], ma = (await api('/api/mitarbeiter'))[0];
    const m = new Date().toISOString().slice(0, 7), re = await api('/api/rechnung/frei', { kunde_id: k.id, von: m + '-01', bis: m + '-28', betreff: 'Unterhaltsreinigung Musterobjekt mit langem Betreff', objekte: obj.kunde_id === k.id ? [obj.id] : [] });
    await api('/api/rechnung/position', { rechnung_id: re.id, bezeichnung: 'Grundreinigung Teppichboden inklusive Fleckentfernung im Besprechungsraum', menge: 40, einheit: 'm²', einzelpreis: 3.2 });
    await api('/api/rechnung/stellen', { id: re.id });
    const bw = await api('/api/bewerber', { vorname: 'Olena', nachname: 'Kovalenko-Schmidt', position: 'Reinigungskraft', telefon: '0170 1234567' });
    await api('/api/konto', { name: 'Frau Kundin', email: 'kundin@example.org', passwort: 'Kunde-Handy-2026', rolle: 'kunde', kunde_id: k.id });
    const board = (await api('/api/planner/boards'))[0];
    // Arbeitsschutz & QM: Gefahrstoff, Gefährdungsbeurteilung mit Tabellenzeile, Schlüssel für die erste App-Person (Quittung)
    await api('/api/register', { register: 'gefahrstoffe', produkt: 'Sanitärreiniger sauer mit sehr langem Produktnamen', ghs: ['GHS05', 'GHS07'], signalwort: 'Gefahr', sdb_pruefen: m + '-28', betriebsanweisung: 'Nie mit chlorhaltigen Mitteln mischen.' });
    await api('/api/register', { register: 'gbu', titel: 'Unterhaltsreinigung Praxis', objekt_id: obj.id, gefaehrdungen: [{ gefaehrdung: 'Rutschgefahr nasser Boden', schwere: 2, wahrscheinlichkeit: 2, massnahme: 'Warnschild aufstellen', frist: m + '-28' }] });
    const erster = (await api('/api/mitarbeiter')).filter(x => x.aktiv && x.hat_pin).sort((x, y) => x.name < y.name ? -1 : 1)[0];   // wie die Personenliste der App (SQLite sortiert binär)
    await api('/api/register', { register: 'ausgaben', art: 'schluessel', gegenstand: 'Generalschlüssel', merkmal: 'Nr. 7', mitarbeiter_id: erster.id, objekt_id: obj.id, ausgabe: m + '-01' });
    const thema = (await api('/api/unterweisung')).themen[0];

    const [d] = await _android.devices(); if (!d) throw new Error('Kein Android-Gerät — Emulator starten (siehe Kopf der Datei).'); dev = d;
    console.log('Gerät: ' + d.model() + ' (' + d.serial() + ')');
    ctx = await d.launchBrowser({ hasTouch: true, isMobile: true }); await ctx.clearCookies(); const p = await ctx.newPage();
    const info = await (async () => { await p.goto(GERAET + '/anmelden'); return p.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: navigator.maxTouchPoints })); })();
    console.log('Bildschirm ' + info.w + ' × ' + info.h + ' CSS-px, Pixeldichte ' + info.dpr + ', Touch ' + info.touch);
    await pruefen(p, 'Anmeldung', 'h01-anmelden');
    await p.fill('[name=email]', 'handy@example.org'); await p.fill('[name=passwort]', 'Handy-Pruefung-2026'); await p.press('[name=passwort]', 'Enter'); await p.waitForURL(GERAET + '/');
    const buero = [['uebersicht', 'Übersicht'], ['dienstplan', 'Dienstplan'], ['tagesplan', 'Tagesplan'], ['einsatz', 'Einsatz'], ['objekte', 'Objekte'], ['objekt/' + obj.id, 'Objekt (Objektakte)'], ['objektauswertung', 'Objektauswertung'], ['qualitaet', 'Qualität'], ['maengel', 'Mängel'], ['import', 'LV einlesen'],
      ['mitarbeiter/liste', 'Personal'], ['person/' + ma.id, 'Personalakte'], ['bewerber', 'Bewerber'], ['kandidat/' + bw.id, 'Bewerberakte'], ['zeiten', 'Zeiten & Lohn'], ['kunden', 'Kunden'], ['abrechnung/uebersicht', 'Rechnungen'], ['abrechnung/op', 'Offene Posten'], ['rechnung/' + re.id, 'Rechnung'],
      ['controlling', 'Controlling'], ['controlling/reports', 'Report-Katalog'], ['report/planungen', 'Report Planungen'], ['report/karteileichen', 'Report Karteileichen'], ['planner', 'Planner'], ['board/' + board.id, 'Planner-Board'], ['stammdaten', 'Stammdaten'],
      ['sicherheit', 'Arbeitsschutz & QM'], ['register/gefahrstoffe', 'Gefahrstoffe'], ['register/ausgaben', 'Ausgaben'], ['register/rechtskataster', 'Rechtskataster'], ['unterweisung', 'Unterweisungen'], ['unterweisung/' + thema.id, 'Unterweisung (Thema)']];
    let i = 2;
    for (const [h, t] of buero) { await p.goto(GERAET + '/#' + h); await pruefen(p, 'Büro · ' + t, 'h' + String(i++).padStart(2, '0') + '-' + h.replace(/\W+/g, '-')); }
    // Objekt: alle Reiter
    await p.goto(GERAET + '/#objekt/' + obj.id); await p.waitForTimeout(1200);
    for (const r of ['lv', 'woche', 'kalk', 'team', 'standort', 'auswertung', 'rechnungen']) { await p.tap('[data-reiter="' + r + '"]'); await pruefen(p, 'Objekt · Reiter ' + r, 'h' + String(i++).padStart(2, '0') + '-objekt-' + r); }
    // Register-Formular mit Tabellenzeilen, Personalakte Reiter Unterweisung & Ausstattung
    await p.goto(GERAET + '/#register/gbu'); await p.waitForTimeout(1200); await p.tap('[data-eintrag] >> nth=0'); await pruefen(p, 'Schublade · Gefährdungsbeurteilung', 'h' + String(i++).padStart(2, '0') + '-schublade-gbu'); await p.tap('#schublade #abbrechen'); await p.waitForTimeout(300);
    await p.goto(GERAET + '/#person/' + erster.id); await p.waitForTimeout(1200); await p.tap('[data-reiter="schutz"]'); await pruefen(p, 'Personalakte · Unterweisung & Ausstattung', 'h' + String(i++).padStart(2, '0') + '-person-schutz');
    // Menü (☰) und Chat
    await p.goto(GERAET + '/#uebersicht'); await p.waitForTimeout(800); await p.tap('#navKnopf'); await p.tap('.menue >> text=Personal'); await pruefen(p, 'Menü geöffnet', 'h' + String(i++).padStart(2, '0') + '-menue');
    await p.goto(GERAET + '/#uebersicht'); await p.waitForTimeout(1500); await p.tap('#kommKnopf'); await pruefen(p, 'Chat', 'h' + String(i++).padStart(2, '0') + '-chat');
    await p.tap('[data-kanal="maengel"]'); await pruefen(p, 'Chat · Mängelkanal', 'h' + String(i++).padStart(2, '0') + '-chat-maengel');
    await p.goto(GERAET + '/#rechnung/' + re.id); await p.waitForTimeout(1000); await p.tap('#reZahlung'); await pruefen(p, 'Schublade · Zahlung buchen', 'h' + String(i++).padStart(2, '0') + '-schublade');
    if (await p.evaluate(() => document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) befunde.push('Schublade: Feld hat den Fokus, Tastatur verdeckt die Maske'); else console.log('✓ Schublade ohne Autofokus (keine Tastatur über der Maske)');
    await p.tap('#schublade #abbrechen'); await p.waitForTimeout(300);
    await p.tap('#abmelden'); await p.waitForURL(/anmelden/);
    // Mitarbeiter-App
    await p.goto(GERAET + '/app'); await pruefen(p, 'App · Wer bist du?', 'h' + String(i++).padStart(2, '0') + '-app-wer');
    await p.tap('.kachel >> nth=0'); await pruefen(p, 'App · PIN', 'h' + String(i++).padStart(2, '0') + '-app-pin');
    for (const z of ['1', '1', '1', '1', '✓']) await p.tap('[data-z="' + z + '"]');
    await p.locator('.app-gruss').waitFor({ timeout: 15000 }).catch(() => {}); await pruefen(p, 'App · Heute', 'h' + String(i++).padStart(2, '0') + '-app-heute');
    if (await p.locator('#bestaetigenListe').count()) { await p.tap('#bestaetigenListe'); await pruefen(p, 'App · Lesen und bestätigen', 'h' + String(i++).padStart(2, '0') + '-app-bestaetigen'); await p.tap('[data-agi] >> nth=0'); await pruefen(p, 'App · Empfang quittieren', 'h' + String(i++).padStart(2, '0') + '-app-quittung'); await p.tap('#zurueck'); await p.waitForTimeout(500); await p.tap('#zurueck'); await p.locator('.app-gruss').waitFor({ timeout: 15000 }).catch(() => {}); } else befunde.push('App: „Bitte lesen und bestätigen" fehlt');
    if (await p.locator('[data-o]').count()) { await p.tap('[data-o] >> nth=0'); await pruefen(p, 'App · Objekt', 'h' + String(i++).padStart(2, '0') + '-app-objekt'); }
    await p.locator('#kommKnopf').waitFor({ timeout: 15000 }).catch(() => {}); if (await p.locator('#kommKnopf').count()) { await p.tap('#kommKnopf'); await pruefen(p, 'App · Chat', 'h' + String(i++).padStart(2, '0') + '-app-chat'); }
    // Kundenportal
    await ctx.clearCookies(); await p.goto(GERAET + '/anmelden'); await p.fill('[name=email]', 'kundin@example.org'); await p.fill('[name=passwort]', 'Kunde-Handy-2026'); await p.press('[name=passwort]', 'Enter'); await p.waitForURL(/\/kunde/);
    await pruefen(p, 'Kundenportal · Übersicht', 'h' + String(i++).padStart(2, '0') + '-kunde');
    if (await p.locator('[data-o]').count()) { await p.tap('[data-o] >> nth=0'); await pruefen(p, 'Kundenportal · Objekt', 'h' + String(i++).padStart(2, '0') + '-kunde-objekt'); }
    await p.goto(GERAET + '/kunde#rechnungen'); await pruefen(p, 'Kundenportal · Rechnungen', 'h' + String(i++).padStart(2, '0') + '-kunde-rechnungen');
  } catch (e) { befunde.push('ABBRUCH: ' + e.message.split('\n')[0]); console.log('✗ ABBRUCH: ' + e.message.split('\n')[0] + ' · ' + String(e.stack).split('\n').find(z => /abnahme-handy/.test(z))); }
  finally { if (ctx) await ctx.close().catch(() => {}); if (dev) await dev.close().catch(() => {}); srv.kill(); }
  console.log('\n' + seiten + ' Seiten auf dem echten Android geprüft · ' + befunde.length + ' Befunde · Bilder in test/handy-bilder/');
  process.exit(befunde.length ? 1 : 0);
})();
