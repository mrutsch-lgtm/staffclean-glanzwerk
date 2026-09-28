// buero.js — Büro-Oberfläche: Übersicht, Objekte (LV-Raster), Tagesplan, LV-Import, Mitarbeiter, Mängel.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe, tagLang, montagVon, plusTage, ICON } = UI;
  const inhalt = $('#inhalt'), titel = $('#titel');
  const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  $('#leisteDatum').textContent = tagLang(heute());

  function kopf(ueber, h1, text, knoepfe) {
    titel.innerHTML = '<div class="glas">' + ICON.gebaeude.replace('<svg', '<svg width="16" height="16"') + ' ' + esc(ueber) + '</div>' +
      '<h1 style="margin-top:1rem">' + h1 + '</h1>' + (text ? '<p>' + text + '</p>' : '') + (knoepfe ? '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem">' + knoepfe + '</div>' : '');
  }
  const prozent = (a, b) => b ? Math.round(a * 100 / b) : 0;

  // ---------- Übersicht ----------
  async function uebersicht() {
    const u = await holen('/api/uebersicht');
    kopf('Übersicht · ' + tagLang(u.datum), '<span class="umriss">Heute</span> alles <span class="akzent">im Blick</span>',
      'Was heute in den Objekten ansteht, was schon erledigt ist und wo es hakt.',
      '<a class="knopf" href="#tagesplan">Tagesplan öffnen ' + ICON.pfeil.replace('<svg', '<svg width="18" height="18"') + '</a><a class="knopf hell" href="#import">Leistungsverzeichnis einlesen</a>');
    const quote = prozent(u.fertig, u.soll);
    inhalt.innerHTML =
      '<div class="raster k4">' +
        kachel(u.soll, 'Aufgaben heute', ICON.kalender) + kachel(quote + ' %', 'erledigt (' + u.fertig + ' von ' + u.soll + ')', ICON.haken) +
        kachel(u.zahlen.objekte, 'aktive Objekte · ' + u.zahlen.raeume + ' Räume', ICON.gebaeude) + kachel(u.zahlen.maengel, 'offene Mängel', ICON.warnung, u.zahlen.maengel ? 'rot' : '') +
      '</div>' +
      '<div class="abschnitt"><div class="abschnittkopf"><div><div class="ueberzeile">Heute im Einsatz</div><h2>Objekte mit Aufgaben</h2></div></div>' +
      (u.objekte.length ? '<div class="raster k3">' + u.objekte.map(function (o) {
        const p = prozent(o.fertig, o.soll);
        return '<div class="karte klickbar akzentlinie objektkarte" data-objekt="' + o.id + '"><div class="zeile"><h3>' + esc(o.name) + '</h3><span class="marke ' + (p === 100 ? '' : p ? 'gold' : 'grau') + '">' + (p === 100 ? 'fertig' : p + ' %') + '</span></div>' +
          '<div class="leise klein">' + esc([o.kunde, o.ort].filter(Boolean).join(' · ')) + '</div>' +
          '<div class="zeile klein" style="margin-top:.8rem"><span>' + o.soll + ' Aufgaben in ' + o.raeume + ' Räumen</span><span class="leise">' + (o.sollMinuten ? 'Soll ≈ ' + Math.round(o.sollMinuten) + ' Min.' : '') + '</span></div>' +
          '<div class="fortschritt"><i style="width:' + p + '%"></i></div></div>';
      }).join('') + '</div>' : '<div class="karte leer">Heute fallen keine Leistungen an.</div>') + '</div>';
    $$('[data-objekt]').forEach(function (k) { k.onclick = function () { location.hash = '#objekt/' + k.dataset.objekt; }; });
  }
  function kachel(zahl, etikett, icon, art) {
    return '<div class="karte kennzahl"><div class="symbolkasten"' + (art === 'rot' ? ' style="background:var(--rot-hell);color:var(--rot)"' : '') + '>' + icon + '</div><div class="zahl"' + (art === 'rot' ? ' style="color:var(--rot)"' : '') + '>' + esc(zahl) + '</div><div class="etikett">' + esc(etikett) + '</div></div>';
  }

  // ---------- Objekte ----------
  async function objekte() {
    const l = await holen('/api/objekte');
    kopf('Objekte', 'Alle <span class="akzent">Objekte</span>', 'Jedes Objekt mit Räumen und Leistungsverzeichnis. Ein Klick öffnet das LV-Raster.', '<button class="knopf gold" id="neuObjekt">+ Objekt anlegen</button><a class="knopf hell" href="#import">Aus Excel einlesen</a>');
    inhalt.innerHTML = l.length ? '<div class="raster k3">' + l.map(function (o) {
      return '<div class="karte klickbar objektkarte" data-objekt="' + o.id + '"><div class="symbolkasten">' + ICON.gebaeude + '</div><h3>' + esc(o.name) + '</h3><div class="leise klein">' + esc([o.kunde, o.strasse, o.ort].filter(Boolean).join(' · ')) + '</div>' +
        '<div style="display:flex;gap:.4rem;margin-top:.8rem;flex-wrap:wrap"><span class="marke">' + o.raeume + ' Räume</span><span class="marke gold">' + o.positionen + ' Leistungen</span>' + (o.status !== 'aktiv' ? '<span class="marke grau">' + esc(o.status) + '</span>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="karte leer">Noch keine Objekte. Lies ein Leistungsverzeichnis ein oder lege ein Objekt an.</div>';
    $$('[data-objekt]').forEach(function (k) { k.onclick = function () { location.hash = '#objekt/' + k.dataset.objekt; }; });
    $('#neuObjekt').onclick = function () { objektFormular({}); };
  }

  function objektFormular(o) {
    schublade('<h2>' + (o.id ? 'Objekt bearbeiten' : 'Neues Objekt') + '</h2><div class="formular" style="margin-top:1rem">' +
      feld('name', 'Name', o.name) + feld('strasse', 'Straße', o.strasse) + feld('plz', 'PLZ', o.plz) + feld('ort', 'Ort', o.ort) +
      '<label class="feld">Bundesland (Feiertage)<select name="bundesland">' + ['SH', 'HH', 'NI', 'MV', 'HB', 'BE', 'BB', 'NW', 'HE', 'RP', 'SL', 'BW', 'BY', 'SN', 'ST', 'TH'].map(function (b) { return '<option' + (b === (o.bundesland || 'SH') ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select></label>' +
      '<label class="feld">Reinigungstag (für 1 W, 14T, 1 M)<select name="reinigungstag">' + [1, 2, 3, 4, 5, 6, 0].map(function (t) { return '<option value="' + t + '"' + (t === (o.reinigungstag == null ? 1 : o.reinigungstag) ? ' selected' : '') + '>' + TAGE[t] + '</option>'; }).join('') + '</select></label>' +
      feld('zugang', 'Zugang / Schlüssel', o.zugang) + feld('notiz', 'Notiz', o.notiz) +
      '</div><div style="display:flex;gap:.6rem;margin-top:1.2rem"><button class="knopf" id="speichern">Speichern</button><button class="knopf zweit" id="abbrechen">Abbrechen</button></div>', async function (w) {
      $('#speichern', w).onclick = async function () {
        const d = { id: o.id }; $$('input,select', w).forEach(function (i) { d[i.name] = i.name === 'reinigungstag' ? Number(i.value) : i.value; });
        try { const r = await holen('/api/objekt', d); schubladeZu(); meldung('Objekt gespeichert'); location.hash = '#objekt/' + r.id; if (o.id) route(); } catch (e) { meldung(e.message); }
      };
    });
  }
  const feld = (n, t, v) => '<label class="feld">' + esc(t) + '<input name="' + n + '" value="' + esc(v || '') + '"></label>';

  async function objekt(id) {
    const o = await holen('/api/objekt?id=' + id);
    const alle = await holen('/api/taetigkeiten');
    kopf((o.kunde ? o.kunde + ' · ' : '') + [o.strasse, o.ort].filter(Boolean).join(', '), esc(o.name),
      'Reinigungstag ' + TAGE[o.reinigungstag] + ' · Feiertage ' + esc(o.bundesland) + (o.zugang ? ' · Zugang: ' + esc(o.zugang) : ''),
      '<button class="knopf gold" id="bearbeiten">Objekt bearbeiten</button><a class="knopf hell" href="#tagesplan/' + o.id + '">Tagesplan dieses Objekts</a>');
    $('#bearbeiten').onclick = function () { objektFormular(o); };
    const pos = {}; o.positionen.forEach(function (p) { pos[p.raum_id + '|' + p.taetigkeit_id] = p; });
    const spalten = o.taetigkeiten.slice();
    inhalt.innerHTML =
      '<div class="abschnittkopf kopfkarte"><div><div class="ueberzeile">Leistungsverzeichnis</div><h2>Raum × Tätigkeit × Turnus</h2><div class="leise klein">In eine Zelle tippen und den Turnus eintragen: <b>5 W</b>, <b>3 W</b>, <b>1 W</b>, <b>2,5 W</b>, <b>14T</b>, <b>1 M</b>, <b>1 Q</b>, <b>Mo,Mi,Fr</b> oder <b>B</b> (bei Bedarf). Leer = entfällt.</div></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="knopf zweit klein" id="neuRaum">+ Raum</button><select id="neuTaet" style="max-width:260px"><option value="">+ Tätigkeit hinzufügen …</option>' + alle.filter(function (t) { return !spalten.some(function (s) { return s.id === t.id; }); }).map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('') + '<option value="neu">Neue Tätigkeit …</option></select></div></div>' +
      '<div class="scroll"><table class="lv"><thead><tr><th>Raum</th>' + spalten.map(function (t) { return '<th title="' + esc(t.anleitung || '') + '">' + esc(t.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      o.raeume.map(function (r) {
        return '<tr><th>' + esc(r.name) + '<small>' + esc([r.etage, r.belag, r.flaeche_m2 ? r.flaeche_m2 + ' m²' : ''].filter(Boolean).join(' · ')) + '</small></th>' + spalten.map(function (t) {
          const p = pos[r.id + '|' + t.id];
          return '<td><input class="zelle' + (p ? '' : ' zelle-leer') + '" data-raum="' + r.id + '" data-taet="' + t.id + '" value="' + esc(p ? p.turnus : '') + '" placeholder="–" title="' + esc(p ? p.regel : '') + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="abschnitt raster k2">' +
        '<div class="karte"><div class="zeile"><h3>Diese Woche</h3><div style="display:flex;gap:.4rem"><button class="knopf zweit klein" id="wZurueck">‹</button><button class="knopf zweit klein" id="wVor">›</button></div></div><div id="woche" class="scroll" style="margin-top:.8rem;box-shadow:none"></div></div>' +
        '<div class="karte"><h3>Team &amp; Mängel</h3><div class="leise klein" style="margin-bottom:.6rem">Wer das Objekt in der App sieht.</div><div id="team"></div><div id="maengelObjekt" style="margin-top:1rem"></div></div>' +
      '</div>';
    $$('.zelle').forEach(function (z) {
      z.onchange = async function () {
        try { const r = await holen('/api/position', { raum_id: Number(z.dataset.raum), taetigkeit_id: Number(z.dataset.taet), turnus: z.value });
          z.classList.toggle('zelle-leer', !z.value.trim()); z.classList.remove('fehler'); z.title = r.regel || ''; meldung(r.entfernt ? 'Leistung entfernt' : 'Turnus: ' + r.regel); wocheZeigen();
        } catch (e) { z.classList.add('fehler'); meldung(e.message); }
      };
    });
    $('#neuRaum').onclick = function () {
      schublade('<h2>Neuer Raum</h2><div class="formular" style="margin-top:1rem">' + feld('name', 'Raum', '') + feld('etage', 'Etage', '') + feld('belag', 'Bodenbelag', '') + feld('flaeche_m2', 'Fläche m²', '') + '</div><div style="display:flex;gap:.6rem;margin-top:1.2rem"><button class="knopf" id="speichern">Anlegen</button><button class="knopf zweit" id="abbrechen">Abbrechen</button></div>', function (w) {
        $('#speichern', w).onclick = async function () { const d = { objekt_id: o.id }; $$('input', w).forEach(function (i) { d[i.name] = i.name === 'flaeche_m2' ? (Number(String(i.value).replace(',', '.')) || null) : i.value; }); try { await holen('/api/raum', d); schubladeZu(); route(); } catch (e) { meldung(e.message); } };
      });
    };
    $('#neuTaet').onchange = async function () {
      let tid = this.value; if (!tid) return;
      if (tid === 'neu') { const n = prompt('Name der Tätigkeit'); if (!n) { this.value = ''; return; } tid = (await holen('/api/taetigkeit', { name: n })).id; }
      if (!o.raeume.length) { meldung('Erst einen Raum anlegen'); return; }
      await holen('/api/position', { raum_id: o.raeume[0].id, taetigkeit_id: Number(tid), turnus: '1 W' }); meldung('Spalte angelegt — Turnus je Raum eintragen'); route();
    };
    let montag = montagVon(heute());
    async function wocheZeigen() {
      const w = await holen('/api/woche?objekt=' + o.id + '&montag=' + montag);
      $('#woche').innerHTML = '<table class="tabelle wochenraster"><thead><tr><th>Leistung</th>' + w.tage.map(function (d) { return '<th style="text-align:center">' + TAGE[new Date(d + 'T12:00:00Z').getUTCDay()] + '<br><span style="font-weight:500">' + d.slice(8) + '.' + d.slice(5, 7) + '.</span></th>'; }).join('') + '</tr></thead><tbody>' +
        w.zeilen.map(function (z) { return '<tr><td><b>' + esc(z.raum) + '</b><br><span class="leise klein">' + esc(z.taetigkeit) + '</span></td>' + z.tage.map(function (t) { return t === 1 ? '<td class="an" style="text-align:center">●</td>' : t === 'F' ? '<td class="feiertag" style="text-align:center" title="Feiertag">F</td>' : '<td></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    $('#wZurueck').onclick = function () { montag = plusTage(montag, -7); wocheZeigen(); };
    $('#wVor').onclick = function () { montag = plusTage(montag, 7); wocheZeigen(); };
    wocheZeigen();
    const ma = await holen('/api/mitarbeiter');
    $('#team').innerHTML = ma.map(function (m) { const drin = o.mitarbeiter.some(function (x) { return x.id === m.id; }); return '<label style="display:flex;gap:.6rem;align-items:center;padding:.35rem 0"><input type="checkbox" data-ma="' + m.id + '"' + (drin ? ' checked' : '') + '> ' + esc(m.name) + (m.minijob ? ' <span class="marke grau">Minijob</span>' : '') + '</label>'; }).join('') || '<div class="leise">Noch keine Mitarbeiter.</div>';
    $$('[data-ma]').forEach(function (c) { c.onchange = async function () { await holen('/api/einsatz', { objekt_id: o.id, mitarbeiter_id: Number(c.dataset.ma), entfernen: !c.checked }); meldung(c.checked ? 'Eingeteilt' : 'Ausgetragen'); }; });
    $('#maengelObjekt').innerHTML = o.maengel.length ? '<h3>Offene Mängel</h3>' + o.maengel.map(function (m) { return '<div class="hinweis" style="margin-top:.5rem">' + esc(m.text) + ' <span class="klein">· ' + esc(datumDe(m.gemeldet_am.slice(0, 10))) + '</span></div>'; }).join('') : '<span class="marke">Keine offenen Mängel</span>';
  }

  // ---------- Tagesplan ----------
  async function tagesplan(objektId) {
    let datum = heute();
    kopf('Tagesplan', 'Was heute <span class="akzent">ansteht</span>', 'Aus dem Leistungsverzeichnis berechnet — je Objekt und Raum, mit dem, was schon erledigt ist.');
    inhalt.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem"><div style="display:flex;gap:.5rem;align-items:center"><button class="knopf zweit klein" id="tZurueck">‹</button><input type="date" id="tDatum"><button class="knopf zweit klein" id="tVor">›</button><button class="knopf zweit klein" id="tHeute">Heute</button></div><div id="tSumme" class="leise"></div></div><div id="tListe"></div>';
    async function zeigen() {
      $('#tDatum').value = datum;
      const t = await holen('/api/tag?datum=' + datum + (objektId ? '&objekt=' + objektId : ''));
      $('#tSumme').innerHTML = '<b>' + tagLang(datum) + '</b> · ' + t.fertig + ' von ' + t.soll + ' erledigt';
      $('#tListe').innerHTML = t.objekte.length ? t.objekte.map(function (o) {
        return '<div class="karte akzentlinie" style="margin-bottom:1rem"><div class="zeile"><div><h3>' + esc(o.name) + '</h3><div class="leise klein">' + esc([o.kunde, o.strasse, o.ort].filter(Boolean).join(' · ')) + '</div></div><span class="marke">' + o.fertig + '/' + o.soll + '</span></div>' +
          '<table class="tabelle" style="margin-top:.8rem"><thead><tr><th>Raum</th><th>Leistung</th><th>Turnus</th><th>Stand</th></tr></thead><tbody>' +
          o.raeume.map(function (r) { return r.aufgaben.map(function (a, i) { return '<tr>' + (i === 0 ? '<td rowspan="' + r.aufgaben.length + '"><b>' + esc(r.name) + '</b><br><span class="leise klein">' + esc([r.etage, r.belag].filter(Boolean).join(' · ')) + '</span></td>' : '') + '<td>' + esc(a.taetigkeit) + '</td><td class="leise klein">' + esc(a.turnus) + '</td><td>' + (a.erledigt ? '<span class="marke">✓ ' + esc(a.erledigt.zeit.slice(11, 16)) + (a.erledigt.wer ? ' · ' + esc(a.erledigt.wer) : '') + '</span>' + (a.erledigt.foto ? ' <a href="/fotos/' + esc(a.erledigt.foto) + '" target="_blank" class="klein">Foto</a>' : '') : '<span class="marke grau">offen</span>') + '</td></tr>'; }).join(''); }).join('') +
          '</tbody></table></div>';
      }).join('') : '<div class="karte leer">An diesem Tag fallen keine Leistungen an.</div>';
    }
    $('#tDatum').onchange = function () { datum = this.value; zeigen(); };
    $('#tZurueck').onclick = function () { datum = plusTage(datum, -1); zeigen(); };
    $('#tVor').onclick = function () { datum = plusTage(datum, 1); zeigen(); };
    $('#tHeute').onclick = function () { datum = heute(); zeigen(); };
    zeigen();
  }

  // ---------- LV-Import ----------
  function lvImport() {
    kopf('LV-Import', 'Leistungsverzeichnis <span class="akzent">einlesen</span>', 'Excel-Datei hineinziehen: Räume, Tätigkeiten und Turnus werden erkannt. Du siehst erst die Vorschau, dann legst du das Objekt an.');
    inhalt.innerHTML = '<div class="karte"><label class="ablage" id="ablage"><input type="file" id="datei" accept=".xlsx" hidden><div class="symbolkasten" style="margin:0 auto .8rem">' + ICON.datei + '</div><b>Excel-Leistungsverzeichnis hierher ziehen</b><div class="klein" style="margin-top:.3rem">oder klicken und auswählen (.xlsx)</div></label><div id="vorschau" style="margin-top:1.2rem"></div></div>';
    let datei = null;
    const ab = $('#ablage');
    ab.ondragover = function (e) { e.preventDefault(); ab.classList.add('drueber'); };
    ab.ondragleave = function () { ab.classList.remove('drueber'); };
    ab.ondrop = function (e) { e.preventDefault(); ab.classList.remove('drueber'); if (e.dataTransfer.files[0]) laden(e.dataTransfer.files[0]); };
    $('#datei').onchange = function () { if (this.files[0]) laden(this.files[0]); };
    async function laden(f) {
      datei = f; $('#vorschau').innerHTML = '<div class="leise">Lese „' + esc(f.name) + '" …</div>';
      try {
        const r = await holen('/api/import', await f.arrayBuffer(), true), lv = r.lv;
        $('#vorschau').innerHTML = '<div class="zeile"><div><div class="ueberzeile">Vorschau</div><h2>' + esc(lv.objekt.name) + '</h2><div class="leise">' + esc([lv.objekt.kunde, lv.objekt.art].filter(Boolean).join(' · ')) + ' · ' + lv.raeume.length + ' Räume · ' + lv.taetigkeiten.length + ' Tätigkeiten</div></div><button class="knopf" id="uebernehmen">Objekt anlegen</button></div>' +
          (lv.hinweise.length ? '<div class="hinweis" style="margin-top:1rem">' + lv.hinweise.map(esc).join('<br>') + '</div>' : '') +
          '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:1rem 0">' + r.regeln.map(function (g) { return '<span class="marke' + (/unbekannt/.test(g.text) ? ' rot' : '') + '">' + esc(g.kuerzel) + ' → ' + esc(g.text) + '</span>'; }).join('') + '</div>' +
          '<div class="scroll"><table class="lv"><thead><tr><th>Raum</th>' + lv.taetigkeiten.map(function (t) { return '<th>' + esc(t) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          lv.raeume.map(function (rm) { return '<tr><th>' + esc(rm.name) + '<small>' + esc(rm.belag) + '</small></th>' + lv.taetigkeiten.map(function (t) { const l = rm.leistungen.find(function (x) { return x.taetigkeit === t; }); return '<td><b style="color:var(--gruen-800)">' + esc(l ? l.turnus : '') + '</b></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
          (lv.bedarf.length ? '<div class="leise klein" style="margin-top:.8rem">Bei Bedarf: ' + esc(lv.bedarf.join(', ')) + '</div>' : '');
        $('#uebernehmen').onclick = async function () { const j = await holen('/api/import?uebernehmen=1', await datei.arrayBuffer(), true); meldung('Objekt angelegt'); location.hash = '#objekt/' + j.id; };
      } catch (e) { $('#vorschau').innerHTML = '<div class="hinweis">' + esc(e.message) + '</div>'; }
    }
  }

  // ---------- Mitarbeiter ----------
  async function mitarbeiter() {
    const l = await holen('/api/mitarbeiter');
    kopf('Mitarbeiter', 'Das <span class="akzent">Team</span>', 'Wer in welcher Sprache arbeitet, wer im Minijob ist — die Minijob-Grenze wird später im Einsatzplan geprüft.', '<button class="knopf gold" id="neuMa">+ Mitarbeiter</button>');
    inhalt.innerHTML = '<div class="scroll"><table class="tabelle"><thead><tr><th>Name</th><th>Sprache</th><th>Lohngruppe</th><th>Beschäftigung</th></tr></thead><tbody>' + l.map(function (m) { return '<tr><td><b>' + esc(m.name) + '</b></td><td>' + esc(m.sprache) + '</td><td>' + esc(m.lohngruppe || '–') + '</td><td>' + (m.minijob ? '<span class="marke gold">Minijob</span>' : '<span class="marke">sozialversicherungspflichtig</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    $('#neuMa').onclick = function () {
      schublade('<h2>Neuer Mitarbeiter</h2><div class="formular" style="margin-top:1rem">' + feld('name', 'Name', '') + feld('telefon', 'Telefon', '') + '<label class="feld">Sprache der App<select name="sprache"><option value="de">Deutsch</option><option value="pl">Polnisch</option><option value="ro">Rumänisch</option><option value="tr">Türkisch</option><option value="uk">Ukrainisch</option><option value="ar">Arabisch</option><option value="en">Englisch</option></select></label>' + feld('lohngruppe', 'Lohngruppe', 'LG 1') + '<label class="feld">Minijob<select name="minijob"><option value="">nein</option><option value="1">ja</option></select></label></div><div style="display:flex;gap:.6rem;margin-top:1.2rem"><button class="knopf" id="speichern">Anlegen</button><button class="knopf zweit" id="abbrechen">Abbrechen</button></div>', function (w) {
        $('#speichern', w).onclick = async function () { const d = {}; $$('input,select', w).forEach(function (i) { d[i.name] = i.value; }); d.minijob = !!d.minijob; try { await holen('/api/mitarbeiter', d); schubladeZu(); route(); } catch (e) { meldung(e.message); } };
      });
    };
  }

  // ---------- Mängel ----------
  async function maengel() {
    const l = await holen('/api/maengel');
    kopf('Mängel', 'Offene <span class="akzent">Mängel</span>', 'Von Mitarbeitern oder Kunden gemeldet — jeder Mangel ist eine Aufgabe mit Frist.');
    inhalt.innerHTML = l.length ? l.map(function (m) { return '<div class="karte zeile" style="margin-bottom:.7rem"><div><b>' + esc(m.objekt) + (m.raum ? ' · ' + esc(m.raum) : '') + '</b><div>' + esc(m.text) + '</div><div class="leise klein">gemeldet ' + esc(datumDe(m.gemeldet_am.slice(0, 10))) + (m.gemeldet_von ? ' von ' + esc(m.gemeldet_von) : '') + ' · Frist ' + esc(datumDe(m.frist)) + '</div></div><button class="knopf zweit klein" data-erledigt="' + m.id + '" data-objekt="' + m.objekt_id + '">Erledigt</button></div>'; }).join('') : '<div class="karte leer">Keine offenen Mängel.</div>';
    $$('[data-erledigt]').forEach(function (k) { k.onclick = async function (e) { e.stopPropagation(); await holen('/api/mangel', { id: Number(k.dataset.erledigt), objekt_id: Number(k.dataset.objekt), text: '-', erledigt: true }); meldung('Mangel erledigt'); route(); }; });
  }

  // ---------- Schublade & Router ----------
  function schublade(html, bei) { $('#schubladeInhalt').innerHTML = html; $('#schublade').hidden = false; if (bei) bei($('#schubladeInhalt')); const a = $('#abbrechen'); if (a) a.onclick = schubladeZu; }
  function schubladeZu() { $('#schublade').hidden = true; }
  $('#schublade').onclick = function (e) { if (e.target.id === 'schublade') schubladeZu(); };

  async function route() {
    const [v, arg] = (location.hash.slice(1) || 'uebersicht').split('/');
    $$('#nav a').forEach(function (a) { a.classList.toggle('aktiv', a.dataset.v === (v === 'objekt' ? 'objekte' : v)); });
    try {
      if (v === 'objekte') await objekte(); else if (v === 'objekt') await objekt(arg); else if (v === 'tagesplan') await tagesplan(arg);
      else if (v === 'import') lvImport(); else if (v === 'mitarbeiter') await mitarbeiter(); else if (v === 'maengel') await maengel(); else await uebersicht();
    } catch (e) { inhalt.innerHTML = '<div class="karte hinweis">' + esc(e.message) + '</div>'; }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
