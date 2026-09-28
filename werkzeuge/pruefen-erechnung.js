// pruefen-erechnung.js — prüft die E-Rechnungen mit den offiziellen Werkzeugen und bricht bei jedem Befund ab:
//   KoSIT-Validator mit XRechnung-Konfiguration (Schema + Schematron, EN 16931 und die deutschen BR-DE-Regeln)
//   Mustang (ZUGFeRD/Factur-X EN 16931 und über veraPDF die PDF/A-3-Konformität)
// Die Werkzeuge liegen in werkzeuge/pruefung (nicht im Git): Java (Temurin JRE), validator.jar, xrechnung/, mustang.jar.
// Aufruf: npm run pruefen-erechnung
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const P = path.join(__dirname, 'pruefung'), B = path.join(P, 'belege'), BER = path.join(P, 'bericht');
const java = fs.readdirSync(P).filter(d => /^jdk-|^jre/.test(d)).map(d => path.join(P, d, 'bin', 'java.exe')).find(f => fs.existsSync(f)) || 'java';
for (const f of ['validator.jar', 'mustang.jar', 'xrechnung/scenarios.xml']) if (!fs.existsSync(path.join(P, f))) { console.log('Prüfwerkzeug fehlt: werkzeuge/pruefung/' + f); process.exit(2); }
fs.mkdirSync(BER, { recursive: true });
execFileSync(process.execPath, [path.join(__dirname, 'pruefbelege.js'), B], { stdio: 'inherit' });
const leer = fs.openSync(path.join(P, 'leer.txt'), 'w+');   // der Validator liest sonst die Standardeingabe (hier das Null-Gerät) und bricht ab
const namen = fs.readdirSync(B).filter(f => /_xrechnung\.xml$/.test(f)).map(f => f.replace(/_xrechnung\.xml$/, ''));
let fehler = 0;
const k = spawnSync(java, ['-jar', path.join(P, 'validator.jar'), '-s', path.join(P, 'xrechnung', 'scenarios.xml'), '-r', path.join(P, 'xrechnung'), '-o', BER].concat(namen.map(n => path.join(B, n + '_xrechnung.xml'))), { stdio: [leer, 'pipe', 'pipe'], encoding: 'utf8' });
for (const n of namen) {
  const rep = fs.readFileSync(path.join(BER, n + '_xrechnung-report.xml'), 'utf8');
  const ok = /<rep:accept>/.test(rep), befunde = (rep.match(/failed-assert/g) || []).length;
  console.log('KoSIT   ' + n.padEnd(18) + (ok ? 'ACCEPTABLE' : 'REJECT') + ' · Befunde ' + befunde); if (!ok || befunde) fehler++;
}
for (const n of namen) {
  const m = spawnSync(java, ['-jar', path.join(P, 'mustang.jar'), '--action', 'validate', '--no-notices', '--source', path.join(B, n + '.pdf')], { stdio: [leer, 'pipe', 'pipe'], encoding: 'utf8' }).stdout || '';
  fs.writeFileSync(path.join(BER, 'mustang-' + n + '.xml'), m);
  const pdfa = (m.match(/flavour=(\w+), totalAssertions=\d+, assertions=\[\], isCompliant=true/) || [])[1];
  const regeln = m.match(/<fired>(\d+)<\/fired>\s*<failed>(\d+)<\/failed>/) || [];
  const gesamt = (m.match(/<summary status="(\w+)"\/>\s*<\/validation>/) || [])[1];
  console.log('Mustang ' + n.padEnd(18) + (gesamt || '?') + ' · PDF/A ' + (pdfa || 'NICHT konform') + ' · Regeln ' + (regeln[1] || '?') + ', Fehler ' + (regeln[2] || '?'));
  if (gesamt !== 'valid' || !pdfa || regeln[2] !== '0') fehler++;
}
fs.closeSync(leer);
console.log(fehler ? '\n✗ ' + fehler + ' Beleg(e) mit Befund' : '\n✓ alle ' + namen.length + ' Belege gültig (KoSIT XRechnung · Mustang ZUGFeRD EN 16931 · PDF/A-3)');
process.exit(fehler ? 1 : 0);
