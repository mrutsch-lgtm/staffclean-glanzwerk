// buero-personal.js — Personal wie in der Sicherheitsplanung: Personalliste, Personalakte (Stammdaten für Lohnbüro und
// Meldewesen, Aufenthalt, Bank, Notfall), Dokumente, Abwesenheiten und Urlaubskonto, Einsätze, App-Zugang,
// Personalfragebogen (PDF), Fristen, Monatsauswertung (Soll / geplant / gestempelt / Urlaub / krank) und Stammdaten-Export.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe, ICON } = UI;
  const G = window.GW, A = window.GW_ANSICHTEN = window.GW_ANSICHTEN || {};
  const inhalt = G.inhalt;
  const fehler = fn => async function () { try { await fn.apply(this, arguments); } catch (e) { meldung(e.message); } };
  const zahlDe = v => v == null ? '' : String(v).replace('.', ',');
  const BESCH = { vollzeit: 'Vollzeit', teilzeit: 'Teilzeit', minijob: 'Minijob', kurzfristig: 'kurzfristig', werkstudent: 'Werkstudent', azubi: 'Azubi', aushilfe: 'Aushilfe' };
  let META = null; const meta = async () => META = META || await holen('/api/personal/felder');
  const feldHtml = (f, m) => {
    const v = m[f.n] == null ? '' : m[f.n];
    if (f.typ === 'wahl') return G.auswahl(f.n, f.t + (f.pflicht ? ' *' : ''), f.o, v);
    if (f.typ === 'text') return '<label class="feld" style="grid-column:1/-1">' + esc(f.t) + '<textarea name="' + f.n + '" rows="3">' + esc(v) + '</textarea></label>';
    return G.feld(f.n, f.t + (f.pflicht ? ' *' : ''), f.typ === 'number' ? zahlDe(v).replace(',', '.') : v, f.typ === 'date' ? 'date' : f.typ === 'number' ? 'number' : f.typ === 'email' ? 'email' : 'text', f.typ === 'number' ? ' step="0.5"' : '');
  };

  // ---------------------------------------------------------------- Personalliste
  let reiterP = 'liste', filterP = { status: 'aktiv', suche: '' };
  A.mitarbeiter = async function mitarbeiter(arg) {
    if (arg && ['liste', 'fristen', 'auswertung', 'urlaub'].indexOf(arg) >= 0) reiterP = arg;
    G.kopf('Personal', 'Das <span class="akzent">Team</span>', 'Personalakten mit allen Angaben für Lohnbüro, Sozialversicherung und Aufenthaltsrecht, Dokumente, Urlaub und Krankheit, Fristen und die Monatsauswertung. Ausgeschiedene werden gesperrt, nicht gelöscht.',
      '<button class="knopf gold" id="neuMa">+ Mitarbeiter</button><a class="knopf hell" href="/api/personal/fragebogen" target="_blank">Personalfragebogen (leer)</a><a class="knopf hell" href="/api/personal/stammdaten.csv">Stammdaten fürs Lohnbüro</a>');
    inhalt.innerHTML = G.reiter([['liste', 'Personal'], ['fristen', 'Fristen & Lücken'], ['auswertung', 'Monatsauswertung'], ['urlaub', 'Urlaubskonten']], reiterP, function (r) { reiterP = r; laden(); }) + '<div id="pBereich"></div>';
    $('#neuMa').onclick = neu;
    async function laden() {
      const b = $('#pBereich');
      if (reiterP === 'liste') {
        const l = await holen('/api/mitarbeiter');
        b.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap"><div style="display:flex;gap:.5rem;align-items:end;flex-wrap:wrap"><label class="feld">Suche<input id="pSuche" value="' + esc(filterP.suche) + '" placeholder="Name, Personalnr., Tätigkeit"></label><label class="feld">Status<select id="pStatus">' + [['aktiv', 'aktiv'], ['aus', 'ausgeschieden / gesperrt'], ['alle', 'alle']].map(function (o) { return '<option value="' + o[0] + '"' + (filterP.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div><span class="leise klein">Klick auf eine Zeile öffnet die Personalakte.</span></div><div id="pListe"></div>';
        const zeigen = function () {
          const s = filterP.suche.toLowerCase(), f = l.filter(function (m) { return (filterP.status === 'alle' || (filterP.status === 'aktiv' ? m.aktiv : !m.aktiv)) && (!s || [m.name, m.personalnummer, m.taetigkeit].join(' ').toLowerCase().includes(s)); });
          $('#pListe').innerHTML = f.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Name</th><th>Personalnr.</th><th>Tätigkeit</th><th>Beschäftigung</th><th>Eintritt</th><th>Akte</th><th>App-PIN</th></tr></thead><tbody>' + f.map(function (m) {
            return '<tr style="cursor:pointer' + (m.aktiv ? '' : ';opacity:.55') + '" data-person="' + m.id + '"><td><b>' + esc(m.name) + '</b>' + (m.aktiv ? '' : ' <span class="marke grau">gesperrt</span>') + '</td><td>' + esc(m.personalnummer || '–') + '</td><td>' + esc(m.taetigkeit || '') + '</td><td>' + esc(BESCH[m.beschaeftigungsart] || (m.minijob ? 'Minijob' : '–')) + (m.wochenstunden ? ' · ' + zahlDe(m.wochenstunden) + ' Std./Wo.' : '') + '</td><td>' + (m.eintritt ? datumDe(m.eintritt) : '–') + (m.austritt ? '<br><span class="leise klein">bis ' + datumDe(m.austritt) + '</span>' : '') + '</td>' +
              '<td>' + (m.luecken ? '<span class="marke rot">' + m.luecken + ' Angaben fehlen</span>' : '<span class="marke">vollständig</span>') + (m.aufenthalt_bis && m.aufenthalt_bis < UI.plusTage(heute(), 60) ? ' <span class="marke orange">Aufenthalt ' + datumDe(m.aufenthalt_bis) + '</span>' : '') + '</td><td>' + (m.hat_pin ? '<span class="marke">gesetzt</span>' : '<span class="marke rot">fehlt</span>') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="karte leer">Niemand für diese Auswahl.</div>';
          $$('[data-person]').forEach(function (z) { z.onclick = function () { location.hash = '#person/' + z.dataset.person; }; });
        };
        $('#pSuche').oninput = function () { filterP.suche = this.value; zeigen(); };
        $('#pStatus').onchange = function () { filterP.status = this.value; zeigen(); };
        zeigen();
      } else if (reiterP === 'fristen') {
        const l = await holen('/api/personal/fristen?tage=90');
        b.innerHTML = l.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Was</th></tr></thead><tbody>' + l.map(function (f) { return '<tr style="cursor:pointer" data-person="' + f.mitarbeiter_id + '"><td>' + (f.datum ? '<b' + (f.abgelaufen ? ' style="color:var(--rot)"' : '') + '>' + datumDe(f.datum) + '</b>' + (f.abgelaufen ? ' <span class="marke rot">abgelaufen</span>' : '') : '–') + '</td><td>' + esc(f.name) + '</td><td>' + (f.dringend ? '<span class="marke rot">wichtig</span> ' : '') + esc(f.was) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="leise klein">Nächste 90 Tage: Aufenthaltstitel, Befristungen, Probezeiten, Dokumente mit Ablaufdatum — und Akten, in denen Pflichtangaben für die Anmeldung fehlen. Ohne gültigen Aufenthaltstitel mit Arbeitserlaubnis darf nicht weiterbeschäftigt werden.</p>' : '<div class="karte leer">Keine Fristen in den nächsten 90 Tagen, alle Akten vollständig.</div>';
        $$('[data-person]').forEach(function (z) { z.onclick = function () { location.hash = '#person/' + z.dataset.person; }; });
      } else if (reiterP === 'auswertung') {
        let monat = heute().slice(0, 7);
        b.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem"><div style="display:flex;gap:.5rem;align-items:end"><label class="feld">Monat<input type="month" id="awMonat" value="' + monat + '"></label><button class="knopf zweit klein" id="awCsv">Als Tabelle (CSV)</button></div><span class="leise klein">Soll aus den Wochenstunden je Arbeitstag, Urlaub und Krankheit zählen zum Soll. Saldo = gestempelt + bezahlte Abwesenheit − Soll.</span></div><div id="awTabelle"></div>';
        let daten = [];
        const zeigen = fehler(async function () {
          monat = $('#awMonat').value; daten = (await holen('/api/personal/auswertung?monat=' + monat)).mitarbeiter;
          const h = v => v == null ? '–' : zahlDe(Math.round(v * 100) / 100);
          $('#awTabelle').innerHTML = '<div class="scroll"><table class="tabelle"><thead><tr><th>Mitarbeiter</th><th style="text-align:right">Arbeitstage</th><th style="text-align:right">Soll</th><th style="text-align:right">geplant</th><th style="text-align:right">gestempelt</th><th style="text-align:right">Urlaub</th><th style="text-align:right">krank</th><th style="text-align:right">Saldo</th><th style="text-align:right">Nacht</th><th style="text-align:right">Sonntag</th><th style="text-align:right">Feiertag</th></tr></thead><tbody>' + daten.map(function (m) {
            return '<tr style="cursor:pointer" data-person="' + m.id + '"><td><b>' + esc(m.name) + '</b><br><span class="leise klein">' + esc(BESCH[m.beschaeftigungsart] || '') + (m.personalnummer ? ' · ' + esc(m.personalnummer) : '') + '</span></td><td style="text-align:right">' + m.arbeitstage + '</td><td style="text-align:right">' + h(m.soll) + '</td><td style="text-align:right">' + h(m.geplant) + '</td><td style="text-align:right"><b>' + h(m.ist) + '</b></td><td style="text-align:right">' + (m.urlaubTage || '–') + '</td><td style="text-align:right">' + (m.krankTage || '–') + '</td>' +
              '<td style="text-align:right;font-weight:700;color:' + (m.saldo == null ? 'inherit' : m.saldo < -2 ? 'var(--rot)' : 'var(--gruen-700)') + '">' + (m.saldo == null ? '–' : (m.saldo > 0 ? '+' : '') + h(m.saldo)) + '</td><td style="text-align:right">' + h(m.nacht) + '</td><td style="text-align:right">' + h(m.sonntag) + '</td><td style="text-align:right">' + h(m.feiertag) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
          $$('[data-person]').forEach(function (z) { z.onclick = function () { location.hash = '#person/' + z.dataset.person; }; });
        });
        $('#awMonat').onchange = zeigen;
        $('#awCsv').onclick = function () {
          const bt = v => v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ',');
          const csv = '﻿' + ['Personalnummer;Name;Arbeitstage;Soll;geplant;gestempelt;Urlaubstage;Krankheitstage;Saldo;Nacht;Sonntag;Feiertag'].concat(daten.map(function (m) { return [m.personalnummer || '', m.name, m.arbeitstage, bt(m.soll), bt(m.geplant), bt(m.ist), m.urlaubTage, m.krankTage, bt(m.saldo), bt(m.nacht), bt(m.sonntag), bt(m.feiertag)].join(';'); })).join('\r\n');
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'Personalauswertung_' + monat + '.csv'; a.click();
        };
        zeigen();
      } else {
        const jahr = Number(heute().slice(0, 4)), u = await holen('/api/personal/urlaub?jahr=' + jahr);
        b.innerHTML = '<div class="scroll"><table class="tabelle"><thead><tr><th>Mitarbeiter</th><th style="text-align:right">Jahresanspruch</th><th style="text-align:right">anteilig ' + jahr + '</th><th style="text-align:right">genommen</th><th style="text-align:right">Rest</th></tr></thead><tbody>' + u.mitarbeiter.map(function (m) { return '<tr style="cursor:pointer" data-person="' + m.id + '"><td><b>' + esc(m.name) + '</b></td><td style="text-align:right">' + (m.voll ? zahlDe(m.voll) + ' Tage' : '<span class="marke rot">fehlt</span>') + '</td><td style="text-align:right">' + zahlDe(m.anspruch) + (m.monate < 12 ? ' <span class="leise klein">(' + m.monate + '/12)</span>' : '') + '</td><td style="text-align:right">' + zahlDe(m.genommen) + '</td><td style="text-align:right;font-weight:700' + (m.rest < 0 ? ';color:var(--rot)' : '') + '">' + zahlDe(m.rest) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="leise klein">Urlaubstage = Arbeitstage (Mo–Fr bzw. Mo–Sa, ohne Feiertage) aus den Abwesenheiten „Urlaub". Anteilig nach § 5 BUrlG bei Ein- oder Austritt im Jahr; Sonderfälle klärt das Lohnbüro.</p>';
        $$('[data-person]').forEach(function (z) { z.onclick = function () { location.hash = '#person/' + z.dataset.person; }; });
      }
    }
    laden();
  };
  function neu() {
    G.schublade('<h2>Neuer Mitarbeiter</h2><p class="leise klein">Erst Name und App-Zugang — die vollständige Personalakte füllst du danach (oder aus dem unterschriebenen Personalfragebogen).</p><div class="formular" style="margin-top:1rem">' + G.feld('vorname', 'Vorname', '') + G.feld('nachname', 'Nachname', '') + G.feld('telefon', 'Telefon', '') + G.auswahl('sprache', 'Sprache der App', Object.keys(G.SPRACHEN).map(function (k) { return [k, G.SPRACHEN[k]]; }), 'de') + G.feld('pin', 'PIN für die App (4–8 Ziffern)', '', 'text', ' inputmode="numeric" autocomplete="off"') + G.feld('eintritt', 'Eintritt', heute(), 'date') + '</div>' + G.knoepfe('Anlegen'), function (w) {
      $('#speichern', w).onclick = fehler(async function () {
        const d = G.formDaten(w); if (!d.vorname || !d.nachname) { meldung('Vor- und Nachname bitte'); return; }
        const r = await holen('/api/mitarbeiter', { name: d.vorname + ' ' + d.nachname, telefon: d.telefon, sprache: d.sprache, pin: d.pin, lohngruppe: 'LG 1' });
        await holen('/api/personal', { id: r.id, vorname: d.vorname, nachname: d.nachname, eintritt: d.eintritt });
        G.schubladeZu(); meldung('Angelegt — jetzt die Personalakte ergänzen'); location.hash = '#person/' + r.id;
      });
    });
  }

  // ---------------------------------------------------------------- Personalakte
  let reiterA = 'stamm', letzte = null;
  A.person = async function person(id) {
    if (String(id) !== String(letzte)) { reiterA = 'stamm'; letzte = id; }
    const [a, M] = await Promise.all([holen('/api/personal?id=' + id), meta()]), m = a.mitarbeiter;
    G.kopf('Personalakte' + (m.personalnummer ? ' · Personalnr. ' + m.personalnummer : ''), esc(m.name) + (m.aktiv ? '' : ' <span class="marke grau" style="vertical-align:middle">gesperrt</span>'),
      esc([BESCH[m.beschaeftigungsart], m.taetigkeit, m.wochenstunden ? zahlDe(m.wochenstunden) + ' Std./Woche' : '', m.eintritt ? 'seit ' + datumDe(m.eintritt) : '', m.austritt ? 'bis ' + datumDe(m.austritt) : ''].filter(Boolean).join(' · ')) + (m.telefon ? ' · <a href="tel:' + esc(m.telefon) + '">' + esc(m.telefon) + '</a>' : ''),
      '<button class="knopf gold" id="paZugang">App-Zugang & Lohn</button><a class="knopf hell" target="_blank" href="/api/personal/fragebogen?id=' + m.id + '">Personalfragebogen (PDF)</a><button class="knopf hell" id="paNachricht">Nachricht</button><a class="knopf hell" href="#mitarbeiter">Alle Mitarbeiter</a>');
    inhalt.innerHTML = (a.luecken.length ? '<div class="alarm">' + ICON.warnung.replace('<svg', '<svg width="22" height="22"') + '<div><b>Für die Anmeldung beim Lohnbüro fehlen:</b> ' + a.luecken.map(esc).join(', ') + '</div></div>' : '') +
      (a.fristen.filter(function (f) { return f.datum; }).length ? '<div class="hinweis" style="margin-bottom:1rem">' + a.fristen.filter(function (f) { return f.datum; }).map(function (f) { return esc(f.was) + ': <b>' + datumDe(f.datum) + '</b>'; }).join(' · ') + '</div>' : '') +
      '<div class="raster k3" style="margin-bottom:1rem;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' +
      [['Urlaub ' + a.urlaub.jahr, zahlDe(a.urlaub.rest) + ' Tage Rest', zahlDe(a.urlaub.genommen) + ' von ' + zahlDe(a.urlaub.anspruch) + ' genommen'], ['Dokumente', a.dokumente.length, a.dokumente.filter(function (d) { return d.gueltig_bis && d.gueltig_bis < heute(); }).length + ' abgelaufen'], ['Stammobjekte', a.objekte.length, a.objekte.map(function (o) { return o.name; }).slice(0, 2).join(', ')], ['Schichten 14 Tage', a.schichten.length, a.schichten[0] ? 'nächste ' + datumDe(a.schichten[0].datum) : 'keine geplant']]
        .map(function (k) { return '<div class="karte kennzahl"><div class="ueberzeile">' + esc(k[0]) + '</div><div style="font-size:1.3rem;font-weight:800">' + esc(k[1]) + '</div><div class="leise klein">' + esc(k[2] || '') + '</div></div>'; }).join('') + '</div>' +
      G.reiter([['stamm', 'Stammdaten'], ['dokumente', 'Dokumente (' + a.dokumente.length + ')'], ['abwesenheit', 'Urlaub & Abwesenheit'], ['einsatz', 'Einsätze'], ['schutz', 'Unterweisung & Ausstattung']], reiterA, function (r) { reiterA = r; zeigen(); }) + '<div id="paBereich"></div>';
    const neuladen = function () { A.person(id); };
    $('#paZugang').onclick = function () {
      G.schublade('<h2>App-Zugang & Lohn</h2><div class="formular" style="margin-top:1rem">' + G.feld('telefon', 'Telefon', m.telefon) + G.feld('personalnummer', 'Personalnummer (DATEV)', m.personalnummer) + G.auswahl('sprache', 'Sprache der App', Object.keys(G.SPRACHEN).map(function (k) { return [k, G.SPRACHEN[k]]; }), m.sprache || 'de') +
        G.feld('lohngruppe', 'Lohngruppe', m.lohngruppe || 'LG 1') + G.feld('stundenlohn', 'Abweichender Stundenlohn (optional)', m.stundenlohn, 'number', ' step="0.01"') + G.feld('wochenstunden', 'Soll-Wochenstunden', m.wochenstunden, 'number', ' step="0.5"') +
        G.feld('pin', m.hat_pin ? 'Neue PIN (leer = bleibt)' : 'PIN für die App (4–8 Ziffern)', '', 'text', ' inputmode="numeric" autocomplete="off"') + G.auswahl('aktiv', 'Status', [['1', 'aktiv'], ['0', 'gesperrt (ausgeschieden)']], m.aktiv ? '1' : '0') + '</div>' + G.knoepfe(), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = m.id; d.name = m.name; d.minijob = m.beschaeftigungsart === 'minijob' || (!m.beschaeftigungsart && !!m.minijob); d.aktiv = d.aktiv === '1'; await holen('/api/mitarbeiter', d); G.schubladeZu(); meldung('Gespeichert'); neuladen(); });
      });
    };
    $('#paNachricht').onclick = function () { if (window.KOMM) window.KOMM.direkt('m' + m.id); };
    async function zeigen() {
      const b = $('#paBereich');
      if (reiterA === 'stamm') {
        b.innerHTML = '<div class="raster k2">' + M.gruppen.map(function (g) { return '<div class="karte"><div class="ueberzeile">' + esc(g) + '</div><div class="formular" style="margin-top:.6rem">' + M.felder.filter(function (f) { return f.g === g; }).map(function (f) { return feldHtml(f, m); }).join('') + '</div></div>'; }).join('') + '</div>' +
          '<div style="display:flex;gap:.6rem;margin-top:1rem;flex-wrap:wrap;position:sticky;bottom:1rem"><button class="knopf" id="paSpeichern">Personalakte speichern</button><span class="leise klein" style="align-self:center">* Pflichtangabe für die Anmeldung. Steuer-ID, SV-Nummer und IBAN werden auf Prüfziffern geprüft.</span></div>';
        $('#paSpeichern').onclick = fehler(async function () { const d = G.formDaten(b); d.id = m.id; const r = await holen('/api/personal', d); meldung(r.luecken.length ? 'Gespeichert — noch offen: ' + r.luecken.length + ' Angaben' : 'Gespeichert — Akte vollständig'); neuladen(); });
      } else if (reiterA === 'dokumente') {
        const art = k => (M.dokumentarten.find(function (x) { return x[0] === k; }) || [0, k])[1];
        b.innerHTML = '<div class="karte" style="margin-bottom:1rem"><div class="ueberzeile">Dokument ablegen</div><div class="formular" style="margin-top:.6rem">' + G.auswahl('art', 'Art', M.dokumentarten, 'vertrag') + G.feld('titel', 'Titel (optional)', '') + G.feld('gueltig_bis', 'gültig bis (optional, z. B. Aufenthaltstitel)', '', 'date') + '<label class="feld">Datei (PDF, JPG, PNG · max. 10 MB)<input type="file" id="paDatei" accept="application/pdf,image/jpeg,image/png,image/webp"></label></div><button class="knopf" id="paHoch" style="margin-top:.8rem">Hochladen</button></div>' +
          (a.dokumente.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Dokument</th><th>Art</th><th>abgelegt</th><th>gültig bis</th><th></th></tr></thead><tbody>' + a.dokumente.map(function (d) { return '<tr><td><a target="_blank" href="/api/personal/dokument?id=' + d.id + '"><b>' + esc(d.titel || art(d.art)) + '</b></a></td><td>' + esc(art(d.art)) + '</td><td>' + datumDe(d.angelegt_am.slice(0, 10)) + '</td><td>' + (d.gueltig_bis ? '<span' + (d.gueltig_bis < heute() ? ' class="marke rot"' : '') + '>' + datumDe(d.gueltig_bis) + '</span>' : '–') + '</td><td><button class="knopf zweit klein" data-dokweg="' + d.id + '">entfernen</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Noch keine Dokumente in der Akte.</div>');
        $('#paHoch').onclick = fehler(async function () {
          const f = $('#paDatei').files[0]; if (!f) { meldung('Bitte eine Datei wählen'); return; } if (f.size > 10e6) { meldung('Die Datei ist größer als 10 MB'); return; }
          const daten = await new Promise(function (ok, nein) { const r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = nein; r.readAsDataURL(f); });
          const d = G.formDaten(b); await holen('/api/personal/dokument', { mitarbeiter_id: m.id, art: d.art, titel: d.titel || f.name.replace(/\.[^.]+$/, ''), gueltig_bis: d.gueltig_bis, datei: daten });
          meldung('Dokument abgelegt'); neuladen();
        });
        $$('[data-dokweg]').forEach(function (k) { k.onclick = fehler(async function () { if (!confirm('Dokument aus der Akte entfernen?')) return; await holen('/api/personal/dokument', { id: Number(k.dataset.dokweg), loeschen: true }); meldung('Entfernt'); neuladen(); }); });
      } else if (reiterA === 'abwesenheit') {
        b.innerHTML = '<div class="raster k2"><div class="karte"><div class="ueberzeile">Urlaubskonto ' + a.urlaub.jahr + '</div><table class="tabelle"><tbody>' + [['Jahresanspruch', a.urlaub.voll ? zahlDe(a.urlaub.voll) + ' Tage' : '— in den Stammdaten eintragen'], ['anteilig (' + a.urlaub.monate + '/12)', zahlDe(a.urlaub.anspruch) + ' Tage'], ['genommen', zahlDe(a.urlaub.genommen) + ' Tage'], ['<b>Rest</b>', '<b>' + zahlDe(a.urlaub.rest) + ' Tage</b>']].map(function (z) { return '<tr><td>' + z[0] + '</td><td style="text-align:right">' + z[1] + '</td></tr>'; }).join('') + '</tbody></table></div>' +
          '<div class="karte"><div class="ueberzeile">Abwesenheit eintragen</div><div class="formular" style="margin-top:.6rem">' + G.auswahl('art', 'Art', [['Urlaub', 'Urlaub'], ['krank', 'krank (AU)'], ['frei', 'frei / Freizeitausgleich'], ['sonstiges', 'sonstiges']], 'Urlaub') + G.feld('von', 'von', heute(), 'date') + G.feld('bis', 'bis', heute(), 'date') + G.feld('notiz', 'Notiz', '') + '</div><button class="knopf" id="paAbw" style="margin-top:.8rem">Eintragen</button></div></div>' +
          '<div class="abschnitt">' + (a.abwesenheiten.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Art</th><th>von</th><th>bis</th><th>Notiz</th><th></th></tr></thead><tbody>' + a.abwesenheiten.map(function (x) { return '<tr><td><span class="marke ' + (/krank/i.test(x.art) ? 'rot' : /urlaub/i.test(x.art) ? 'gold' : 'grau') + '">' + esc(x.art) + '</span></td><td>' + datumDe(x.von) + '</td><td>' + datumDe(x.bis) + '</td><td>' + esc(x.notiz || '') + '</td><td><button class="knopf zweit klein" data-abwweg="' + x.id + '">entfernen</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Keine Abwesenheiten.</div>') + '</div>';
        $('#paAbw').onclick = fehler(async function () { const d = G.formDaten($('#paBereich')); if (d.bis < d.von) { meldung('„bis" liegt vor „von"'); return; } await holen('/api/abwesenheit', { mitarbeiter_id: m.id, art: d.art, von: d.von, bis: d.bis, notiz: d.notiz }); meldung('Eingetragen'); neuladen(); });
        $$('[data-abwweg]').forEach(function (k) { k.onclick = fehler(async function () { await holen('/api/abwesenheit', { id: Number(k.dataset.abwweg), loeschen: true }); meldung('Entfernt'); neuladen(); }); });
      } else if (reiterA === 'schutz') {
        const [uw, ag, cl] = await Promise.all([holen('/api/unterweisung?mitarbeiter=' + m.id), holen('/api/register?id=ausgaben'), holen('/api/register?id=checklisten')]);
        const ST = { ok: ['aktuell', ''], bald: ['bald fällig', 'orange'], abgelaufen: ['abgelaufen', 'rot'], neu: ['neue Fassung', 'orange'], fehlt: ['fehlt', 'rot'] };
        const aus = ag.liste.filter(function (x) { return x.mitarbeiter_id === m.id; }), chk = cl.liste.filter(function (x) { return x.mitarbeiter_id === m.id; });
        b.innerHTML = '<div class="raster k2"><div class="karte"><div class="ueberzeile">Unterweisungen & Dienstanweisungen</div>' + (uw.length ? '<table class="tabelle"><tbody>' + uw.map(function (u) { return '<tr style="cursor:pointer" data-uw="' + u.thema_id + '"><td><b>' + esc(u.titel) + '</b>' + (u.objekt ? '<br><span class="leise klein">' + esc(u.objekt) + '</span>' : '') + '</td><td>' + (u.am ? datumDe(u.am) : '–') + '</td><td><span class="marke ' + ST[u.status][1] + '">' + ST[u.status][0] + '</span></td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise">Keine Unterweisung betrifft diese Person.</div>') + '</div>' +
          '<div class="karte"><div class="ueberzeile">Ausgegeben (Kleidung, Schlüssel, Geräte)</div>' + (aus.length ? '<table class="tabelle"><tbody>' + aus.map(function (x) { return '<tr style="cursor:pointer" data-ausg="' + x.id + '"><td><b>' + esc(x.gegenstand) + '</b>' + (x.merkmal ? ' <span class="leise klein">' + esc(x.merkmal) + '</span>' : '') + '</td><td>' + datumDe(x.ausgabe) + '</td><td>' + (x.rueckgabe ? '<span class="leise klein">zurück ' + datumDe(x.rueckgabe) + '</span>' : x.quittiert_am ? '<span class="marke">quittiert</span>' : '<span class="marke orange">Quittung offen</span>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise">Nichts ausgegeben.</div>') + '<button class="knopf zweit klein" id="paAusgabe" style="margin-top:.8rem">+ Ausgabe eintragen</button></div></div>' +
          '<div class="abschnitt karte"><div class="ueberzeile">Checklisten Ein- und Austritt</div>' + (chk.length ? chk.map(function (c) { return '<div style="padding:.4rem 0;cursor:pointer" data-chk="' + c.id + '"><b>' + (c.art === 'austritt' ? 'Austritt' : 'Eintritt') + '</b> ' + (c.stichtag ? datumDe(c.stichtag) : '') + ' <div class="balken" style="display:inline-block;width:120px;vertical-align:middle"><i style="width:' + (c.fortschritt || 0) + '%"></i></div> <span class="klein">' + (c.fortschritt || 0) + ' %</span></div>'; }).join('') : '<div class="leise">Keine Checkliste.</div>') + '</div>';
        $$('[data-uw]', b).forEach(function (z) { z.onclick = function () { location.hash = '#unterweisung/' + z.dataset.uw; }; });
        $$('[data-ausg]', b).forEach(function (z) { z.onclick = function () { G.registerOeffnen('ausgaben', Number(z.dataset.ausg)); }; });
        $$('[data-chk]', b).forEach(function (z) { z.onclick = function () { G.registerOeffnen('checklisten', Number(z.dataset.chk)); }; });
        $('#paAusgabe').onclick = function () { G.registerOeffnen('ausgaben', null); };
      } else {
        b.innerHTML = '<div class="raster k2"><div class="karte"><div class="ueberzeile">Stammobjekte</div>' + (a.objekte.length ? a.objekte.map(function (o) { return '<div style="padding:.3rem 0"><a href="#objekt/' + o.id + '">' + esc(o.name) + '</a></div>'; }).join('') : '<div class="leise">Keinem Objekt fest zugeordnet (Objekt → Team).</div>') + '</div>' +
          '<div class="karte"><div class="ueberzeile">Schichten der nächsten 14 Tage</div>' + (a.schichten.length ? '<table class="tabelle"><tbody>' + a.schichten.map(function (s) { return '<tr><td>' + datumDe(s.datum) + '</td><td>' + esc(s.beginn) + '–' + esc(s.ende) + '</td><td>' + esc(s.objekt || '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise">Keine Schichten geplant — im Dienstplan einplanen.</div>') + '<a class="knopf zweit klein" href="#dienstplan" style="margin-top:.8rem">Zum Dienstplan</a></div></div>';
      }
    }
    zeigen();
  };
})();
