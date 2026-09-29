// buero.js — Glanzwerk Büro: Übersicht, Dienstplan, Objekte (LV, Woche, Kalkulation, QR, Standort, Team),
// Tagesplan, LV-Import, Einsatz (Lage, Abwesenheit, Vertretung), Qualität, Zeiten & Lohn (DATEV),
// Mitarbeiter, Kunden & Zugänge, Mängel, Stammdaten (Tätigkeiten, Übersetzungen, Tarife, Einstellungen).
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe, tagLang, montagVon, plusTage, ICON } = UI;
  const inhalt = $('#inhalt'), titel = $('#titel');
  const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const SPRACHEN = { de: 'Deutsch', pl: 'Polnisch', ro: 'Rumänisch', tr: 'Türkisch', uk: 'Ukrainisch', ar: 'Arabisch', en: 'Englisch', bg: 'Bulgarisch' };
  const euro = v => (Number(v) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const std = min => ((Number(min) || 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' Std.';
  const prozent = (a, b) => b ? Math.round(a * 100 / b) : 0;
  $('#leisteDatum').textContent = tagLang(heute());

  function kopf(ueber, h1, text, knoepfe) {
    titel.innerHTML = '<div class="glas">' + ICON.gebaeude.replace('<svg', '<svg width="16" height="16"') + ' ' + esc(ueber) + '</div>' +
      '<h1 style="margin-top:1rem">' + h1 + '</h1>' + (text ? '<p>' + text + '</p>' : '') + (knoepfe ? '<div class="kopfknoepfe" style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem">' + knoepfe + '</div>' : '');
  }
  const feld = (n, t, v, typ, extra) => '<label class="feld">' + esc(t) + '<input name="' + n + '" type="' + (typ || 'text') + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '></label>';
  const auswahl = (n, t, optionen, wert) => '<label class="feld">' + esc(t) + '<select name="' + n + '">' + optionen.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(wert == null ? '' : wert) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
  const formDaten = w => { const d = {}; $$('input,select,textarea', w).forEach(function (i) { if (!i.name) return; d[i.name] = i.type === 'checkbox' ? i.checked : i.value; }); return d; };
  const knoepfe = (speichern, weitere) => '<div style="display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap"><button class="knopf" id="speichern">' + (speichern || 'Speichern') + '</button>' + (weitere || '') + '<button class="knopf zweit" id="abbrechen">Abbrechen</button></div>';
  function reiter(liste, aktiv, bei) {
    const h = '<div class="reiter">' + liste.map(function (r) { return '<button data-reiter="' + r[0] + '"' + (r[0] === aktiv ? ' class="aktiv"' : '') + '>' + esc(r[1]) + '</button>'; }).join('') + '</div>';
    setTimeout(function () { $$('[data-reiter]').forEach(function (b) { b.onclick = function () { $$('[data-reiter]').forEach(function (x) { x.classList.toggle('aktiv', x === b); }); bei(b.dataset.reiter); }; }); }, 0);
    return h;
  }
  let objekteCache = null;
  async function objekteListe() { objekteCache = objekteCache || await holen('/api/objekte'); return objekteCache; }

  // ================================================================= Übersicht
  async function uebersicht() {
    const u = await holen('/api/uebersicht');
    kopf('Übersicht · ' + tagLang(u.datum), '<span class="umriss">Heute</span> alles <span class="akzent">im Blick</span>',
      'Was heute in den Objekten ansteht, wer eingestempelt ist, was erledigt ist und wo es hakt.',
      '<a class="knopf" href="#dienstplan">Dienstplan ' + ICON.pfeil.replace('<svg', '<svg width="18" height="18"') + '</a><a class="knopf hell" href="#tagesplan">Tagesplan</a><a class="knopf hell" href="#import">Leistungsverzeichnis einlesen</a>');
    const quote = prozent(u.fertig, u.soll);
    inhalt.innerHTML = (u.alarme.length ? '<div style="margin-bottom:1rem">' + u.alarme.map(function (a) { return '<div class="alarm">' + ICON.warnung.replace('<svg', '<svg width="22" height="22"') + '<div><b>' + esc(a.objekt) + '</b> — ' + esc(a.alarm) + '</div><a class="knopf klein" href="#einsatz" style="margin-left:auto">Klären</a></div>'; }).join('') + '</div>' : '') +
      '<div class="raster k4">' + kachel(u.soll, 'Aufgaben heute', ICON.kalender) + kachel(quote + ' %', 'erledigt (' + u.fertig + ' von ' + u.soll + ')', ICON.haken) +
        kachel(u.zahlen.eingestempelt, 'gerade eingestempelt', ICON.uhr) + kachel(u.zahlen.maengel, 'offene Mängel', ICON.warnung, u.zahlen.maengel ? 'rot' : '') + '</div>' +
      '<div class="abschnitt"><div class="abschnittkopf"><div><div class="ueberzeile">Heute im Einsatz</div><h2>Objekte mit Aufgaben</h2></div></div>' +
      (u.objekte.length ? '<div class="raster k3">' + u.objekte.map(function (o) {
        const p = prozent(o.fertig, o.soll);
        return '<div class="karte klickbar akzentlinie objektkarte" data-objekt="' + o.id + '"><div class="zeile"><h3>' + esc(o.name) + '</h3><span class="marke ' + (p === 100 ? '' : p ? 'gold' : 'grau') + '">' + (p === 100 ? 'fertig' : p + ' %') + '</span></div>' +
          '<div class="leise klein">' + esc([o.kunde, o.ort].filter(Boolean).join(' · ')) + '</div><div class="zeile klein" style="margin-top:.8rem"><span>' + o.soll + ' Aufgaben in ' + o.raeume + ' Räumen</span><span class="leise">' + (o.sollMinuten ? 'Soll ≈ ' + Math.round(o.sollMinuten) + ' Min.' : '') + '</span></div><div class="fortschritt"><i style="width:' + p + '%"></i></div></div>';
      }).join('') + '</div>' : '<div class="karte leer">Heute fallen keine Leistungen an.</div>') + '</div>';
    $$('[data-objekt]').forEach(function (k) { k.onclick = function () { location.hash = '#objekt/' + k.dataset.objekt; }; });
  }
  function kachel(zahl, etikett, icon, art) {
    return '<div class="karte kennzahl"><div class="symbolkasten"' + (art === 'rot' ? ' style="background:var(--rot-hell);color:var(--rot)"' : '') + '>' + icon + '</div><div class="zahl"' + (art === 'rot' ? ' style="color:var(--rot)"' : '') + '>' + esc(zahl) + '</div><div class="etikett">' + esc(etikett) + '</div></div>';
  }

  // ================================================================= Dienstplan
  let planMontag = montagVon(heute());
  async function dienstplan() {
    kopf('Dienstplan', 'Wer, <span class="akzent">wo</span>, wann', 'Schichten je Mitarbeiter und Tag. Konflikte nach Arbeitszeitgesetz, Abwesenheiten und die Minijob-Grenze siehst du sofort. Ein Klick in eine Zelle legt eine Schicht an.',
      '<button class="knopf gold" id="neuSchicht">+ Schicht</button><button class="knopf hell" id="kopieren">Vorwoche übernehmen</button>');
    const w = await holen('/api/dienstplan?montag=' + planMontag);
    const objekte = await objekteListe();
    const farbe = {}; objekte.forEach(function (o, i) { farbe[o.id] = ['#059669', '#0e7490', '#7c3aed', '#b45309', '#be123c', '#4d7c0f', '#1d4ed8'][i % 7]; });
    const chip = s => '<span class="chip' + (s.konflikte.length ? ' konflikt' : '') + (s.status === 'bestätigt' ? ' bestaetigt' : '') + '" data-schicht="' + s.id + '" title="' + esc(s.konflikte.join(' · ')) + '" style="' + (s.konflikte.length ? '' : 'border-left-color:' + farbe[s.objekt_id]) + '">' + esc(s.beginn + '–' + s.ende) + (s.status === 'bestätigt' ? ' ✓' : '') + '<small>' + esc(s.objekt) + '</small>' + (s.konflikte.length ? '<small>⚠ ' + esc(s.konflikte[0]) + '</small>' : '') + '</span>';
    inhalt.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap"><div style="display:flex;gap:.5rem;align-items:center"><button class="knopf zweit klein" id="pZurueck">‹ Woche</button><b>' + datumDe(w.tage[0]) + ' – ' + datumDe(w.tage[6]) + '</b><button class="knopf zweit klein" id="pVor">Woche ›</button><button class="knopf zweit klein" id="pHeute">Diese Woche</button></div>' +
      '<div style="display:flex;gap:.4rem;flex-wrap:wrap"><span class="marke">' + w.summe.schichten + ' Schichten</span><span class="marke gold">' + std(w.summe.minuten) + '</span>' + (w.summe.konflikte ? '<span class="marke rot">' + w.summe.konflikte + (w.summe.konflikte === 1 ? ' Konflikt' : ' Konflikte') + '</span>' : '<span class="marke">keine Konflikte</span>') + '</div></div>' +
      '<div class="scroll"><table class="plan"><thead><tr><th>Mitarbeiter</th>' + w.tage.map(function (d, i) { return '<th class="' + (w.feiertage[i] ? 'feiertag' : '') + (d === heute() ? ' heute' : '') + '" title="' + esc(w.feiertage[i] || '') + '">' + TAGE[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + d.slice(8) + '.' + d.slice(5, 7) + '.' + (w.feiertage[i] ? '<br><span style="font-weight:500">' + esc(w.feiertage[i]) + '</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      '<tr><th>Offene Schichten<small>noch niemand eingeteilt</small></th>' + w.offen.map(function (l, i) { return '<td data-neu="' + w.tage[i] + '|">' + l.map(function (s) { return '<span class="chip offen" data-schicht="' + s.id + '">' + esc(s.beginn + '–' + s.ende) + '<small>' + esc(s.objekt) + '</small></span>'; }).join('') + '</td>'; }).join('') + '</tr>' +
      w.zeilen.map(function (z) {
        return '<tr><th>' + esc(z.name) + '<small>' + std(z.minutenWoche) + ' diese Woche' + (z.sollWoche ? ' · Soll ' + z.sollWoche + ' Std.' : '') + '</small>' + (z.minijob ? '<small' + (z.minijobWarnung ? ' style="color:var(--rot);font-weight:700"' : '') + '>Minijob · ' + euro(z.verdienstMonat) + ' im Monat' + (z.minijobWarnung ? ' — über der Grenze!' : '') + '</small>' : '') + '</th>' +
          z.tage.map(function (l, i) { return '<td data-neu="' + w.tage[i] + '|' + z.id + '" class="' + (z.abwesend[i] ? 'abwesend' : '') + '">' + (z.abwesend[i] ? '<div class="grund">' + esc(z.abwesend[i]) + '</div>' : '') + l.map(chip).join('') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="leise klein" style="margin-top:.8rem">✓ = vom Mitarbeiter in der App bestätigt · rot = Konflikt (Überschneidung, Ruhezeit unter 11 Std., über 10 Std. am Tag, Pause fehlt, abwesend).</p>';
    $('#pZurueck').onclick = function () { planMontag = plusTage(planMontag, -7); dienstplan(); };
    $('#pVor').onclick = function () { planMontag = plusTage(planMontag, 7); dienstplan(); };
    $('#pHeute').onclick = function () { planMontag = montagVon(heute()); dienstplan(); };
    $('#neuSchicht').onclick = function () { schichtFormular({ datum: planMontag < heute() ? heute() : planMontag }, w); };
    $('#kopieren').onclick = async function () { try { const r = await holen('/api/dienstplan/kopieren', { montag: planMontag }); meldung(r.kopiert + ' Schichten aus der Vorwoche übernommen'); dienstplan(); } catch (e) { meldung(e.message); } };
    $$('[data-neu]').forEach(function (td) { td.onclick = function (e) { if (e.target.closest('[data-schicht]')) return; const [d, m] = td.dataset.neu.split('|'); schichtFormular({ datum: d, mitarbeiter_id: m ? Number(m) : null }, w); }; });
    $$('[data-schicht]').forEach(function (c) { c.onclick = function (e) { e.stopPropagation(); const id = Number(c.dataset.schicht); let s = null; w.zeilen.concat([{ tage: w.offen }]).forEach(function (z) { z.tage.forEach(function (l) { l.forEach(function (x) { if (x.id === id) s = x; }); }); }); schichtFormular(s, w); }; });
  }
  async function schichtFormular(s, w) {
    const objekte = await objekteListe();
    schublade('<h2>' + (s.id ? 'Schicht bearbeiten' : 'Neue Schicht') + '</h2>' + (s.konflikte && s.konflikte.length ? '<div class="hinweis" style="margin:.8rem 0">' + s.konflikte.map(esc).join('<br>') + '</div>' : '') +
      '<div class="formular" style="margin-top:1rem">' + auswahl('mitarbeiter_id', 'Mitarbeiter', [['', '— offen (noch niemand) —']].concat(w.zeilen.map(function (z) { return [z.id, z.name]; })), s.mitarbeiter_id) +
      auswahl('objekt_id', 'Objekt', objekte.filter(function (o) { return o.status === 'aktiv'; }).map(function (o) { return [o.id, o.name]; }), s.objekt_id) +
      feld('datum', 'Datum', s.datum, 'date') + feld('beginn', 'Beginn', s.beginn || '06:00', 'time') + feld('ende', 'Ende', s.ende || '09:00', 'time') + feld('pause_min', 'Pause (Min.)', s.pause_min || 0, 'number', ' min="0" step="5"') +
      feld('notiz', 'Notiz für den Mitarbeiter', s.notiz) + (s.id ? '' : feld('wiederholen_bis', 'Wöchentlich wiederholen bis (optional)', '', 'date') +
      '<div class="feld" style="grid-column:1/-1">Nur an diesen Tagen (optional)<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.3rem">' + [1, 2, 3, 4, 5, 6, 0].map(function (t) { return '<label style="display:flex;gap:.3rem;align-items:center;font-weight:600;color:var(--text)"><input type="checkbox" class="wt" value="' + t + '"> ' + TAGE[t] + '</label>'; }).join('') + '</div></div>') + '</div>' +
      knoepfe(s.id ? 'Speichern' : 'Anlegen', s.id ? '<button class="knopf zweit" id="loeschen" style="color:var(--rot)">Schicht löschen</button>' : ''), function (x) {
      $('#speichern', x).onclick = async function () {
        const d = formDaten(x); d.id = s.id; d.pause_min = Number(d.pause_min) || 0; d.wochentage = $$('.wt', x).filter(function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
        try { const r = await holen('/api/schicht', d); schubladeZu(); meldung(r.ids.length > 1 ? r.ids.length + ' Schichten angelegt' : 'Schicht gespeichert'); planMontag = montagVon(d.datum); dienstplan(); } catch (e) { meldung(e.message); }
      };
      const l = $('#loeschen', x); if (l) l.onclick = async function () { if (!confirm('Schicht wirklich löschen?')) return; await holen('/api/schicht', { id: s.id, loeschen: true }); schubladeZu(); meldung('Schicht gelöscht'); dienstplan(); };
    });
  }

  // ================================================================= Objekte
  async function objekte() {
    objekteCache = null; const l = await objekteListe();
    const anlegen = !(window.GW_ICH && /^(einsatzleiter|objektleiter)$/.test(window.GW_ICH.berechtigung));   // Objekte legt der Planer an (Server prüft ebenso)
    kopf('Objekte', 'Alle <span class="akzent">Objekte</span>', 'Jedes Objekt mit Räumen, Leistungsverzeichnis, Kalkulation, QR-Codes und Team.', anlegen ? '<button class="knopf gold" id="neuObjekt">+ Objekt anlegen</button>' + ((window.GW_ICH.bereiche || []).indexOf('stammdaten') >= 0 ? '<a class="knopf hell" href="#import">Aus Excel einlesen</a>' : '') : '');
    inhalt.innerHTML = l.length ? '<div class="raster k3">' + l.map(function (o) {
      return '<div class="karte klickbar objektkarte" data-objekt="' + o.id + '"><div class="symbolkasten">' + ICON.gebaeude + '</div><h3>' + esc(o.name) + '</h3><div class="leise klein">' + esc([o.kunde, o.strasse, o.ort].filter(Boolean).join(' · ')) + '</div>' +
        '<div style="display:flex;gap:.4rem;margin-top:.8rem;flex-wrap:wrap"><span class="marke">' + o.raeume + ' Räume</span><span class="marke gold">' + o.positionen + ' Leistungen</span>' + (o.monatspreis ? '<span class="marke">' + euro(o.monatspreis) + ' / Monat</span>' : '') + (o.status !== 'aktiv' ? '<span class="marke grau">' + esc(o.status) + '</span>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="karte leer">Noch keine Objekte. Lies ein Leistungsverzeichnis ein oder lege ein Objekt an.</div>';
    $$('[data-objekt]').forEach(function (k) { k.onclick = function () { location.hash = '#objekt/' + k.dataset.objekt; }; });
    if ($('#neuObjekt')) $('#neuObjekt').onclick = function () { objektFormular({}); };
  }
  async function objektFormular(o) {
    const kunden = await holen('/api/kunden');
    schublade('<h2>' + (o.id ? 'Objekt bearbeiten' : 'Neues Objekt') + '</h2><div class="formular" style="margin-top:1rem">' +
      feld('name', 'Name', o.name) + auswahl('kunde_id', 'Kunde', [['', '— ohne —']].concat(kunden.map(function (k) { return [k.id, k.name]; })), o.kunde_id) + feld('strasse', 'Straße', o.strasse) + feld('plz', 'PLZ', o.plz) + feld('ort', 'Ort', o.ort) +
      auswahl('bundesland', 'Bundesland (Feiertage)', ['SH', 'HH', 'NI', 'MV', 'HB', 'BE', 'BB', 'NW', 'HE', 'RP', 'SL', 'BW', 'BY', 'SN', 'ST', 'TH'].map(function (b) { return [b, b]; }), o.bundesland || 'SH') +
      auswahl('reinigungstag', 'Reinigungstag (für 1 W, 14T, 1 M)', [1, 2, 3, 4, 5, 6, 0].map(function (t) { return [t, TAGE[t]]; }), o.reinigungstag == null ? 1 : o.reinigungstag) +
      feld('radius_m', 'Stempel-Radius (m)', o.radius_m || 150, 'number') +
      auswahl('abrechnungsart', 'Abrechnung', [['pauschale', 'Monatspauschale'], ['stunden', 'nach Ist-Stunden (Zeiterfassung)'], ['beides', 'Pauschale + Stunden']], o.abrechnungsart || 'pauschale') + feld('stundensatz', 'Stundensatz € netto (bei Stunden)', o.stundensatz, 'number', ' step="0.01"') + feld('zugang', 'Zugang / Schlüssel', o.zugang) + feld('notiz', 'Notiz', o.notiz) + '</div>' + knoepfe(), function (w) {
      $('#speichern', w).onclick = async function () {
        const d = formDaten(w); d.id = o.id; d.reinigungstag = Number(d.reinigungstag);
        try { const r = await holen('/api/objekt', d); schubladeZu(); objekteCache = null; meldung('Objekt gespeichert'); if (location.hash === '#objekt/' + r.id) route(); else location.hash = '#objekt/' + r.id; } catch (e) { meldung(e.message); }
      };
    });
  }

  let objektReiter = 'akte', letztesObjekt = null;   // Reiter bleibt beim Neuladen desselben Objekts, ein anderes Objekt beginnt bei der Übersicht
  async function objekt(id) {
    if (String(id) !== String(letztesObjekt)) { objektReiter = 'akte'; letztesObjekt = id; }
    const [o, kz] = await Promise.all([holen('/api/objekt?id=' + id), holen('/api/objekt/kennzahlen?id=' + id)]);
    kopf((o.kunde ? o.kunde + ' · ' : '') + [o.strasse, o.ort].filter(Boolean).join(', '), esc(o.name) + (o.status !== 'aktiv' ? ' <span class="marke grau" style="vertical-align:middle">ruht</span>' : ''),
      'Reinigungstag ' + TAGE[o.reinigungstag] + ' · Feiertage ' + esc(o.bundesland) + ' · Stempeln ' + (o.lat != null ? 'im Umkreis von ' + (o.radius_m || 150) + ' m' : '<b>ohne Standort (noch nicht gesetzt)</b>') + (o.zugang ? ' · Zugang: ' + esc(o.zugang) : ''),
      '<button class="knopf gold" id="bearbeiten">Objekt bearbeiten</button><a class="knopf hell" href="#tagesplan/' + o.id + '">Tagesplan</a><a class="knopf hell" href="/drucken/qr?objekt=' + o.id + '" target="_blank">QR-Aufkleber drucken</a><button class="knopf hell" id="ruhen">' + (o.status === 'aktiv' ? 'Objekt ruhen lassen' : 'Objekt wieder aktiv') + '</button>');
    $('#bearbeiten').onclick = function () { objektFormular(o); };
    $('#ruhen').onclick = async function () { await holen('/api/objekt/status', { id: o.id, status: o.status === 'aktiv' ? 'ruht' : 'aktiv' }); objekteCache = null; meldung('Status geändert'); route(); };
    // Objektkopf wie in der Sicherheitsplanung: oben alles auf einen Blick, darunter die Details in Reitern
    inhalt.innerHTML = window.GW_OBJEKT.kopf(o, kz) + reiter([['akte', 'Objektakte'], ['lv', 'Leistungsverzeichnis'], ['woche', 'Woche'], ['kalk', 'Kalkulation & Angebot'], ['team', 'Team, Mängel, Prüfungen'], ['standort', 'Standort & QR'], ['auswertung', 'Auswertung'], ['rechnungen', 'Rechnungen (' + kz.rechnungen.length + ')']], objektReiter, function (r) { objektReiter = r; zeigen(); }) + '<div id="oBereich"></div>';
    const bereich = $('#oBereich');
    async function zeigen() {
      if (objektReiter === 'akte') return window.GW_OBJEKT.akte(o, kz, bereich);
      if (objektReiter === 'rechnungen') return window.GW_OBJEKT.rechnungen(o, kz, bereich);
      if (objektReiter === 'auswertung') return window.GW_OBJEKT.auswertung(o, kz, bereich);
      if (objektReiter === 'lv') return lvRaster(o, bereich);
      if (objektReiter === 'woche') return wocheObjekt(o, bereich);
      if (objektReiter === 'kalk') return kalkulation(o, bereich);
      if (objektReiter === 'standort') return standort(o, bereich);
      return team(o, bereich);
    }
    zeigen();
  }

  async function lvRaster(o, bereich) {
    const alle = await holen('/api/taetigkeiten');
    const pos = {}; o.positionen.forEach(function (p) { pos[p.raum_id + '|' + p.taetigkeit_id] = p; });
    const spalten = o.taetigkeiten.slice();
    bereich.innerHTML = '<div class="abschnittkopf kopfkarte"><div><div class="ueberzeile">Leistungsverzeichnis</div><h2>Raum × Tätigkeit × Turnus</h2><div class="leise klein">In eine Zelle tippen: <b>5 W</b>, <b>3 W</b>, <b>1 W</b>, <b>2,5 W</b>, <b>14T</b>, <b>1 M</b>, <b>1 Q</b>, <b>Mo,Mi,Fr</b> oder <b>B</b> (bei Bedarf). Leer = entfällt.</div></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="knopf zweit klein" id="neuRaum">+ Raum</button><select id="neuTaet" style="max-width:260px"><option value="">+ Tätigkeit hinzufügen …</option>' + alle.filter(function (t) { return !spalten.some(function (s) { return s.id === t.id; }); }).map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('') + '<option value="neu">Neue Tätigkeit …</option></select></div></div>' +
      (o.raeume.length ? '<div class="scroll"><table class="lv"><thead><tr><th>Raum</th>' + spalten.map(function (t) { return '<th title="' + esc(t.anleitung || '') + '">' + esc(t.name) + (t.minuten ? '<br><span style="font-weight:500;opacity:.8">' + t.minuten + ' Min.</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      o.raeume.map(function (r) {
        return '<tr><th><span class="raumname" data-raum-edit="' + r.id + '" style="cursor:pointer" title="Raum bearbeiten">' + esc(r.name) + '</span><small>' + esc([r.etage, r.belag, r.flaeche_m2 ? String(r.flaeche_m2).replace('.', ',') + ' m²' : '', r.anzahl > 1 ? '× ' + String(r.anzahl).replace('.', ',') : ''].filter(Boolean).join(' · ')) + '</small></th>' + spalten.map(function (t) {
          const p = pos[r.id + '|' + t.id];
          return '<td><input class="zelle' + (p ? '' : ' zelle-leer') + '" data-raum="' + r.id + '" data-taet="' + t.id + '" value="' + esc(p ? p.turnus : '') + '" placeholder="–" title="' + esc(p ? p.regel : '') + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' : '<div class="karte leer">Noch keine Räume — erst einen Raum anlegen.</div>');
    $$('.zelle', bereich).forEach(function (z) {
      z.onchange = async function () {
        try { const r = await holen('/api/position', { raum_id: Number(z.dataset.raum), taetigkeit_id: Number(z.dataset.taet), turnus: z.value });
          z.classList.toggle('zelle-leer', !z.value.trim()); z.classList.remove('fehler'); z.title = r.regel || ''; meldung(r.entfernt ? 'Leistung entfernt' : 'Turnus: ' + r.regel);
        } catch (e) { z.classList.add('fehler'); meldung(e.message); }
      };
    });
    $('#neuRaum').onclick = function () { raumFormular(o, {}); };
    $$('[data-raum-edit]', bereich).forEach(function (s) { s.onclick = function () { raumFormular(o, o.raeume.find(function (r) { return r.id === Number(s.dataset.raumEdit); })); }; });
    $('#neuTaet').onchange = async function () {
      let tid = this.value; if (!tid) return;
      if (tid === 'neu') { const n = prompt('Name der Tätigkeit'); if (!n) { this.value = ''; return; } tid = (await holen('/api/taetigkeit', { name: n })).id; }
      if (!o.raeume.length) { meldung('Erst einen Raum anlegen'); this.value = ''; return; }
      await holen('/api/position', { raum_id: o.raeume[0].id, taetigkeit_id: Number(tid), turnus: '1 W' }); meldung('Spalte angelegt — Turnus je Raum eintragen'); route();
    };
  }
  function raumFormular(o, r) {
    schublade('<h2>' + (r.id ? 'Raum bearbeiten' : 'Neuer Raum') + '</h2><div class="formular" style="margin-top:1rem">' + feld('name', 'Raum', r.name) + feld('etage', 'Etage', r.etage) + feld('belag', 'Bodenbelag', r.belag) + feld('flaeche_m2', 'Fläche m²', r.flaeche_m2) + feld('anzahl', 'Anzahl gleicher Einheiten (Etagen, Treppenläufe)', r.anzahl || 1, 'number', ' min="1" step="1"') + '</div>' + knoepfe(r.id ? 'Speichern' : 'Anlegen'), function (w) {
      $('#speichern', w).onclick = async function () { const d = formDaten(w); d.objekt_id = o.id; d.id = r.id; try { await holen('/api/raum', d); schubladeZu(); meldung('Raum gespeichert'); route(); } catch (e) { meldung(e.message); } };
    });
  }
  async function wocheObjekt(o, bereich) {
    let montag = montagVon(heute());
    bereich.innerHTML = '<div class="karte"><div class="zeile"><h3>Welche Leistung an welchem Tag</h3><div style="display:flex;gap:.4rem"><button class="knopf zweit klein" id="wZurueck">‹</button><button class="knopf zweit klein" id="wVor">›</button></div></div><div id="woche" class="scroll" style="margin-top:.8rem;box-shadow:none"></div></div>';
    async function z() {
      const w = await holen('/api/woche?objekt=' + o.id + '&montag=' + montag);
      $('#woche').innerHTML = '<table class="tabelle wochenraster"><thead><tr><th>Raum · Leistung</th>' + w.tage.map(function (d) { return '<th style="text-align:center">' + TAGE[new Date(d + 'T12:00:00Z').getUTCDay()] + '<br><span style="font-weight:500">' + d.slice(8) + '.' + d.slice(5, 7) + '.</span></th>'; }).join('') + '</tr></thead><tbody>' +
        w.zeilen.map(function (x) { return '<tr><td style="min-width:260px"><b>' + esc(x.raum) + '</b> · ' + esc(x.taetigkeit) + '<br><span class="leise klein">' + esc(x.turnus) + '</span></td>' + x.tage.map(function (t) { return t === 1 ? '<td class="an" style="text-align:center">●</td>' : t === 'F' ? '<td class="feiertag" style="text-align:center" title="Feiertag">F</td>' : '<td></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    }
    $('#wZurueck').onclick = function () { montag = plusTage(montag, -7); z(); };
    $('#wVor').onclick = function () { montag = plusTage(montag, 7); z(); };
    z();
  }
  async function kalkulation(o, bereich) {
    const e = await holen('/api/einstellungen');
    async function rechnen(par) {
      const k = await holen('/api/kalkulation?objekt=' + o.id + (par || ''));
      const r = k.ergebnis;
      bereich.innerHTML = '<div class="raster k2"><div class="karte akzentlinie"><div class="ueberzeile">Ergebnis je Monat</div><div class="note gut" style="margin:.3rem 0">' + euro(r.monatspreis) + '</div>' +
        '<table class="tabelle" style="margin-top:.6rem"><tbody>' +
        [['Einsatztage im Monat', r.einsatztageMonat.toLocaleString('de-DE')], ['Leistungszeit', std(r.leistungMinuten)], ['Wegezeit', std(r.wegeMinuten)], ['Stunden gesamt', r.stundenMonat.toLocaleString('de-DE') + ' Std.'],
         ['Lohnkosten (inkl. Nebenkosten)', euro(r.lohnkosten)], ['Selbstkosten (inkl. Gemeinkosten)', euro(r.selbstkosten)], ['Verrechnungssatz', euro(r.verrechnungssatz) + ' / Std.'], ['Leistungswert', r.leistungswert ? r.leistungswert + ' m²/Std.' : '–']].concat(r.bausteineMonat ? [['Preisbausteine (Monatsmittel)', euro(r.bausteineMonat)], ['Gesamt je Monat (Mittel)', euro(r.gesamtMonat)]] : [])
          .map(function (z) { return '<tr><td>' + z[0] + '</td><td style="text-align:right"><b>' + z[1] + '</b></td></tr>'; }).join('') + '</tbody></table>' +
        (k.warnungen.length ? '<div class="hinweis" style="margin-top:.8rem">' + k.warnungen.map(esc).join('<br>') + '</div>' : '') +
        '<div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap"><button class="knopf" id="preisUebernehmen">Als Monatspreis übernehmen</button><a class="knopf zweit" href="/drucken/angebot?objekt=' + o.id + '" target="_blank">Angebot drucken</a></div>' +
        (o.monatspreis ? '<p class="leise klein">Hinterlegter Monatspreis: <b>' + euro(o.monatspreis) + '</b></p>' : '') + '</div>' +
        '<div class="karte"><div class="ueberzeile">Annahmen</div><div class="formular">' + feld('lnk', 'Lohnnebenkosten %', k.annahmen.lohnnebenkosten_prozent, 'number') + feld('gk', 'Gemeinkosten %', k.annahmen.gemeinkosten_prozent, 'number') + feld('gw', 'Gewinn %', k.annahmen.gewinn_prozent, 'number') + '</div>' +
        '<p class="leise klein">Tarif: ' + esc(k.tarif ? k.tarif.lohngruppe + ' · ' + euro(k.tarif.stundenlohn) + ' / Std. · gültig bis ' + (k.tarif.gueltig_bis ? datumDe(k.tarif.gueltig_bis) : 'offen') : 'kein Tarif') + ' · Wegezeit ' + k.annahmen.wegezeit_min + ' Min. je Einsatztag</p><button class="knopf zweit klein" id="neuRechnen">Neu rechnen</button>' +
        '<div style="border-top:1px solid var(--linie);margin-top:1rem;padding-top:1rem"><div class="ueberzeile">Richtzeiten an Zielpreis ausrichten</div><p class="leise klein">Marktpreis, Bestandspreis oder Referenzangebot eingeben — Glanzwerk skaliert alle Minuten dieses Objekts im selben Verhältnis. Später schärfen die gestempelten Ist-Zeiten (Zeiten & Lohn → Soll/Ist) nach.</p>' +
        '<div style="display:flex;gap:.5rem;align-items:end;flex-wrap:wrap">' + feld('zielpreis', 'Zielpreis € netto / Monat', '', 'number', ' step="0.01"') + '<button class="knopf zweit klein" id="kalibrieren">Vorschau</button></div><div id="kalibVorschau"></div></div></div></div>' +
        '<div class="abschnitt scroll"><table class="tabelle"><thead><tr><th>Raum</th><th>Leistung</th><th>Turnus</th><th style="text-align:right">× je Monat</th><th style="text-align:right">Min. je Ausführung</th><th style="text-align:right">Min. im Monat</th></tr></thead><tbody>' +
        k.zeilen.map(function (z) { return '<tr><td>' + esc(z.raum) + '</td><td>' + esc(z.taetigkeit) + '</td><td class="leise klein">' + esc(z.turnus) + '</td><td style="text-align:right">' + z.jeMonat.toLocaleString('de-DE') + '</td><td style="text-align:right">' + String(z.minuten).replace('.', ',') + (z.anzahl > 1 ? ' × ' + String(z.anzahl).replace('.', ',') : '') + (z.minutenGeschaetzt ? ' <span class="marke orange" title="Richtzeit fehlt — in Stammdaten eintragen">?</span>' : '') + '</td><td style="text-align:right"><b>' + z.minutenMonat.toLocaleString('de-DE') + '</b></td></tr>'; }).join('') + '</tbody></table></div><div id="bausteine" class="abschnitt"></div>';
      bausteine(o);
      $('#neuRechnen').onclick = function () { rechnen('&lnk=' + $('[name=lnk]').value + '&gk=' + $('[name=gk]').value + '&gw=' + $('[name=gw]').value); };
      $('#preisUebernehmen').onclick = async function () { await holen('/api/objekt/preis', { id: o.id, monatspreis: r.monatspreis }); o.monatspreis = r.monatspreis; objekteCache = null; meldung('Monatspreis übernommen: ' + euro(r.monatspreis)); };
      $('#kalibrieren').onclick = async function () {
        const ziel = $('[name=zielpreis]').value;
        try {
          const v = await holen('/api/kalkulation/kalibrieren?objekt=' + o.id + '&ziel=' + encodeURIComponent(ziel));
          $('#kalibVorschau').innerHTML = '<div class="hinweis gruen" style="margin-top:.8rem">Faktor <b>' + String(v.faktor).replace('.', ',') + '</b> · heute ' + euro(v.vorher) + ' → Ziel ' + euro(v.ziel) + ' (Verrechnungssatz ' + euro(v.verrechnungssatz) + '/Std.)</div>' +
            '<table class="tabelle" style="margin-top:.5rem"><thead><tr><th>Raum · Leistung</th><th style="text-align:right">Min. heute</th><th style="text-align:right">Min. neu</th></tr></thead><tbody>' + v.zeilen.slice(0, 12).map(function (z) { return '<tr><td>' + esc(z.raum) + ' · ' + esc(z.taetigkeit) + '</td><td style="text-align:right">' + String(z.alt).replace('.', ',') + '</td><td style="text-align:right"><b>' + String(z.neu).replace('.', ',') + '</b></td></tr>'; }).join('') + (v.zeilen.length > 12 ? '<tr><td colspan="3" class="leise klein">… und ' + (v.zeilen.length - 12) + ' weitere</td></tr>' : '') + '</tbody></table>' +
            '<button class="knopf klein" id="kalibUebernehmen" style="margin-top:.6rem">Richtzeiten für dieses Objekt übernehmen</button>';
          $('#kalibUebernehmen').onclick = async function () { try { const x = await holen('/api/kalkulation/kalibrieren', { objekt: o.id, ziel: ziel }); meldung('Richtzeiten übernommen — neuer Monatspreis ' + euro(x.nachher)); rechnen(); } catch (e) { meldung(e.message); } };
        } catch (e) { meldung(e.message); }
      };
    }
    rechnen();
  }
  async function standort(o, bereich) {
    bereich.innerHTML = '<div class="raster k2"><div class="karte"><div class="ueberzeile">Standort fürs Stempeln</div><h3>' + (o.lat != null ? 'Gesetzt: ' + o.lat.toFixed(5) + ', ' + o.lon.toFixed(5) : 'Noch kein Standort') + '</h3>' +
      '<p class="leise klein">Mitarbeiter können nur stempeln, wenn sie im Umkreis von ' + (o.radius_m || 150) + ' m sind. Ohne Standort ist Stempeln überall möglich.</p>' +
      (o.lat != null ? '<a class="knopf zweit klein" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=' + o.lat + '&mlon=' + o.lon + '#map=18/' + o.lat + '/' + o.lon + '">Auf der Karte ansehen</a>' : '') +
      '<div class="formular" style="margin-top:1rem">' + feld('lat', 'Breite', o.lat) + feld('lon', 'Länge', o.lon) + feld('radius_m', 'Radius (m)', o.radius_m || 150, 'number') + '</div>' +
      '<div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap"><button class="knopf" id="standortSpeichern">Speichern</button><button class="knopf zweit" id="standortSuchen">Aus Anschrift ermitteln</button></div></div>' +
      '<div class="karte"><div class="ueberzeile">QR-Codes an den Räumen</div><h3>' + o.raeume.length + ' Aufkleber</h3><p class="leise klein">Jeder Raum hat einen eigenen Code. Die Mitarbeiterin scannt ihn in der App, der Raum öffnet sich, und die Erledigung zählt als „vor Ort bestätigt".</p><a class="knopf" href="/drucken/qr?objekt=' + o.id + '" target="_blank">Aufkleber drucken</a>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:.6rem;margin-top:1rem">' + o.raeume.slice(0, 6).map(function (r) { return '<div style="text-align:center"><img src="/api/qr?raum=' + r.id + '" alt="" style="width:100%;border-radius:8px;border:1px solid var(--linie)"><div class="klein">' + esc(r.name) + '</div></div>'; }).join('') + '</div></div></div>';
    $('#standortSpeichern').onclick = async function () { try { await holen('/api/objekt/standort', { id: o.id, lat: $('[name=lat]').value, lon: $('[name=lon]').value, radius_m: $('[name=radius_m]').value }); meldung('Standort gespeichert'); route(); } catch (e) { meldung(e.message); } };
    $('#standortSuchen').onclick = async function () { try { const r = await holen('/api/objekt/standort', { id: o.id, suchen: true, radius_m: $('[name=radius_m]').value }); meldung('Gefunden: ' + (r.gefunden || '').split(',').slice(0, 3).join(',')); route(); } catch (e) { meldung(e.message); } };
  }
  async function team(o, bereich) {
    const ma = await holen('/api/mitarbeiter');
    bereich.innerHTML = '<div class="raster k2"><div class="karte"><h3>Stammteam</h3><div class="leise klein" style="margin-bottom:.6rem">Diese Kräfte sehen das Objekt in der App auch ohne Schicht. Einzelne Einsätze plant der Dienstplan.</div>' +
      (ma.filter(function (m) { return m.aktiv; }).map(function (m) { const drin = o.mitarbeiter.some(function (x) { return x.id === m.id; }); return '<label style="display:flex;gap:.6rem;align-items:center;padding:.35rem 0"><input type="checkbox" data-ma="' + m.id + '"' + (drin ? ' checked' : '') + '> ' + esc(m.name) + (m.minijob ? ' <span class="marke grau">Minijob</span>' : '') + '</label>'; }).join('') || '<div class="leise">Noch keine Mitarbeiter.</div>') + '</div>' +
      '<div class="karte"><div class="zeile"><h3>Offene Mängel</h3><button class="knopf zweit klein" id="neuMangel">+ Mangel</button></div>' + (o.maengel.length ? o.maengel.map(function (m) { return '<div class="hinweis" style="margin-top:.5rem">' + esc(m.text) + ' <span class="klein">· ' + esc(datumDe(m.gemeldet_am.slice(0, 10))) + ' · ' + esc(m.quelle) + '</span></div>'; }).join('') : '<span class="marke" style="margin-top:.6rem">Keine offenen Mängel</span>') +
      '<div class="zeile" style="margin-top:1.4rem"><h3>Qualitätsprüfungen</h3><button class="knopf zweit klein" id="neuPruefung">Prüfung starten</button></div>' + (o.pruefungen.length ? '<table class="tabelle" style="margin-top:.5rem"><tbody>' + o.pruefungen.map(function (p) { return '<tr><td><a href="#pruefung/' + p.id + '">' + datumDe(p.datum) + '</a></td><td>' + (p.ergebnis != null ? '<b>' + String(p.ergebnis).replace('.', ',') + ' %</b>' : '<span class="marke orange">läuft</span>') + '</td><td class="leise klein">' + esc(p.abgezeichnet_von ? 'abgezeichnet: ' + p.abgezeichnet_von : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise klein">Noch keine Prüfung.</div>') + '</div></div>';
    $$('[data-ma]', bereich).forEach(function (c) { c.onchange = async function () { await holen('/api/einsatz', { objekt_id: o.id, mitarbeiter_id: Number(c.dataset.ma), entfernen: !c.checked }); meldung(c.checked ? 'Ins Stammteam aufgenommen' : 'Aus dem Stammteam entfernt'); }; });
    $('#neuPruefung').onclick = async function () { const r = await holen('/api/pruefung', { objekt_id: o.id }); meldung('Stichprobe: ' + r.stichprobe + ' von ' + r.von + ' Räumen'); location.hash = '#pruefung/' + r.id; };
    $('#neuMangel').onclick = function () {
      schublade('<h2>Mangel erfassen</h2><div class="formular" style="margin-top:1rem">' + auswahl('raum_id', 'Raum', [['', '— ganzes Objekt —']].concat(o.raeume.map(function (r) { return [r.id, r.name]; })), '') + feld('text', 'Was ist nicht in Ordnung?', '') + feld('frist', 'Frist', plusTage(heute(), 1), 'date') + '</div>' + knoepfe('Erfassen'), function (w) {
        $('#speichern', w).onclick = async function () { const d = formDaten(w); d.objekt_id = o.id; try { await holen('/api/mangel', d); schubladeZu(); meldung('Mangel erfasst'); route(); } catch (e) { meldung(e.message); } };
      });
    };
  }

  // ================================================================= Tagesplan
  async function tagesplan(objektId) {
    let datum = heute();
    kopf('Tagesplan', 'Was heute <span class="akzent">ansteht</span>', 'Aus dem Leistungsverzeichnis berechnet — je Objekt und Raum, mit dem, was schon erledigt ist. Nachtragen geht per Klick.');
    inhalt.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem"><div style="display:flex;gap:.5rem;align-items:center"><button class="knopf zweit klein" id="tZurueck">‹</button><input type="date" id="tDatum"><button class="knopf zweit klein" id="tVor">›</button><button class="knopf zweit klein" id="tHeute">Heute</button></div><div id="tSumme" class="leise"></div></div><div id="tListe"></div>';
    async function zeigen() {
      $('#tDatum').value = datum;
      const t = await holen('/api/tag?datum=' + datum + (objektId ? '&objekt=' + objektId : ''));
      $('#tSumme').innerHTML = '<b>' + tagLang(datum) + '</b> · ' + t.fertig + ' von ' + t.soll + ' erledigt';
      $('#tListe').innerHTML = t.objekte.length ? t.objekte.map(function (o) {
        return '<div class="karte akzentlinie" style="margin-bottom:1rem"><div class="zeile"><div><h3>' + esc(o.name) + '</h3><div class="leise klein">' + esc([o.kunde, o.strasse, o.ort].filter(Boolean).join(' · ')) + '</div></div><span class="marke">' + o.fertig + '/' + o.soll + '</span></div>' +
          '<table class="tabelle" style="margin-top:.8rem"><thead><tr><th>Raum</th><th>Leistung</th><th>Turnus</th><th>Stand</th></tr></thead><tbody>' +
          o.raeume.map(function (r) { return r.aufgaben.map(function (a, i) { return '<tr>' + (i === 0 ? '<td rowspan="' + r.aufgaben.length + '"><b>' + esc(r.name) + '</b><br><span class="leise klein">' + esc([r.etage, r.belag].filter(Boolean).join(' · ')) + '</span></td>' : '') + '<td>' + esc(a.taetigkeit) + '</td><td class="leise klein">' + esc(a.turnus) + '</td><td>' + (a.erledigt ? '<span class="marke">✓ ' + esc(a.erledigt.zeit.slice(11, 16)) + (a.erledigt.wer ? ' · ' + esc(a.erledigt.wer) : '') + '</span>' + (a.erledigt.foto ? ' <a href="/fotos/' + esc(a.erledigt.foto) + '" target="_blank" class="klein">Foto</a>' : '') + ' <button class="knopf zweit klein" data-zurueck="' + a.position + '">zurücknehmen</button>' : '<button class="knopf zweit klein" data-nachtragen="' + a.position + '">als erledigt nachtragen</button>') + '</td></tr>'; }).join(''); }).join('') + '</tbody></table></div>';
      }).join('') : '<div class="karte leer">An diesem Tag fallen keine Leistungen an.</div>';
      $$('[data-nachtragen]').forEach(function (k) { k.onclick = async function () { await holen('/api/erledigt', { position: Number(k.dataset.nachtragen), datum: datum }); meldung('Nachgetragen'); zeigen(); }; });
      $$('[data-zurueck]').forEach(function (k) { k.onclick = async function () { await holen('/api/erledigt', { position: Number(k.dataset.zurueck), datum: datum, zurueck: true }); meldung('Zurückgenommen'); zeigen(); }; });
    }
    $('#tDatum').onchange = function () { datum = this.value; zeigen(); };
    $('#tZurueck').onclick = function () { datum = plusTage(datum, -1); zeigen(); };
    $('#tVor').onclick = function () { datum = plusTage(datum, 1); zeigen(); };
    $('#tHeute').onclick = function () { datum = heute(); zeigen(); };
    zeigen();
  }

  // ================================================================= LV-Import
  function lvImport() {
    kopf('LV-Import', 'Leistungsverzeichnis <span class="akzent">einlesen</span>', 'Excel-Datei hineinziehen: Räume, Tätigkeiten und Turnus werden erkannt. Erst die Vorschau, dann legst du das Objekt an.');
    inhalt.innerHTML = '<div class="karte"><label class="ablage" id="ablage"><input type="file" id="datei" accept=".xlsx" hidden><div class="symbolkasten" style="margin:0 auto .8rem">' + ICON.datei + '</div><b>Excel-Leistungsverzeichnis hierher ziehen</b><div class="klein" style="margin-top:.3rem">oder klicken und auswählen (.xlsx)</div></label><div id="vorschau" style="margin-top:1.2rem"></div></div>';
    let datei = null; const ab = $('#ablage');
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
        $('#uebernehmen').onclick = async function () { const j = await holen('/api/import?uebernehmen=1', await datei.arrayBuffer(), true); objekteCache = null; meldung('Objekt angelegt'); location.hash = '#objekt/' + j.id; };
      } catch (e) { $('#vorschau').innerHTML = '<div class="hinweis">' + esc(e.message) + '</div>'; }
    }
  }

  // ================================================================= Einsatz: Lage, Abwesenheit, Vertretung
  async function einsatz() {
    const e = await holen('/api/einsatzplan'), ma = await holen('/api/mitarbeiter');
    kopf('Einsatz · ' + tagLang(e.datum), 'Wer ist <span class="akzent">heute</span> wo?', 'Abwesenheiten eintragen, Alarme sehen, Vertretung anfragen — die Anfrage landet in der App der Kollegin, sie sagt dort zu oder ab.', '<button class="knopf gold" id="neuAbw">+ Abwesenheit</button>');
    inhalt.innerHTML = '<div class="raster k2"><div>' + e.lage.map(function (l) {
      return '<div class="karte akzentlinie" style="margin-bottom:1rem"><div class="zeile"><h3>' + esc(l.name) + '</h3><span class="marke">' + l.fertig + '/' + l.soll + '</span></div>' + (l.alarm ? '<div class="alarm" style="margin-top:.6rem">' + esc(l.alarm) + '</div>' : '') +
        '<table class="tabelle" style="margin-top:.5rem"><tbody>' + l.kraefte.map(function (k) { return '<tr><td>' + esc(k.name) + '</td><td>' + (k.abwesend ? '<span class="marke orange">' + esc(k.abwesend) + '</span>' : k.kommen ? '<span class="marke">da seit ' + esc(k.kommen) + (k.gehen ? ', weg ' + esc(k.gehen) : '') + '</span>' : '<span class="marke grau">noch nicht da</span>') + '</td></tr>'; }).join('') +
        l.vertretungen.map(function (v) { return '<tr><td>Vertretung: ' + esc(v.name) + '</td><td><span class="marke ' + (v.status === 'zugesagt' ? '' : v.status === 'abgelehnt' ? 'rot' : 'gold') + '">' + esc(v.status) + '</span></td></tr>'; }).join('') + '</tbody></table>' +
        '<button class="knopf zweit klein" data-vertretung="' + l.id + '" style="margin-top:.6rem">Vertretung anfragen</button></div>';
    }).join('') + (e.lage.length ? '' : '<div class="karte leer">Heute keine Einsätze.</div>') + '</div>' +
      '<div><div class="karte"><h3>Abwesenheiten</h3>' + (e.abwesenheiten.length ? '<table class="tabelle"><tbody>' + e.abwesenheiten.map(function (a) { return '<tr><td><b>' + esc(a.name) + '</b><br><span class="leise klein">' + esc(a.art) + (a.notiz ? ' · ' + esc(a.notiz) : '') + '</span></td><td>' + datumDe(a.von) + ' – ' + datumDe(a.bis) + '</td><td><button class="knopf zweit klein" data-abw-weg="' + a.id + '">entfernen</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise">Keine eingetragen.</div>') + '</div>' +
      '<div class="karte" style="margin-top:1rem"><h3>Auslastung im Monat</h3><table class="tabelle"><thead><tr><th>Mitarbeiter</th><th style="text-align:right">Std. (Soll)</th><th style="text-align:right">Verdienst</th></tr></thead><tbody>' + e.auslastung.map(function (a) { return '<tr><td>' + esc(a.name) + (a.minijob ? ' <span class="marke grau">Minijob, max. ' + String(a.minijobMaxStunden).replace('.', ',') + ' Std.</span>' : '') + '</td><td style="text-align:right">' + String(a.stundenMonat).replace('.', ',') + '</td><td style="text-align:right' + (a.ueberGrenze ? ';color:var(--rot);font-weight:800' : '') + '">' + euro(a.verdienstMonat) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>';
    $('#neuAbw').onclick = function () {
      schublade('<h2>Abwesenheit</h2><div class="formular" style="margin-top:1rem">' + auswahl('mitarbeiter_id', 'Mitarbeiter', ma.filter(function (m) { return m.aktiv; }).map(function (m) { return [m.id, m.name]; }), '') + auswahl('art', 'Art', [['krank', 'krank'], ['Urlaub', 'Urlaub'], ['frei', 'frei'], ['sonstiges', 'sonstiges']], 'krank') + feld('von', 'von', heute(), 'date') + feld('bis', 'bis', heute(), 'date') + feld('notiz', 'Notiz', '') + '</div>' + knoepfe('Eintragen'), function (w) {
        $('#speichern', w).onclick = async function () { try { await holen('/api/abwesenheit', formDaten(w)); schubladeZu(); meldung('Abwesenheit eingetragen'); einsatz(); } catch (e) { meldung(e.message); } };
      });
    };
    $$('[data-abw-weg]').forEach(function (b) { b.onclick = async function () { await holen('/api/abwesenheit', { id: Number(b.dataset.abwWeg), loeschen: true }); meldung('Entfernt'); einsatz(); }; });
    $$('[data-vertretung]').forEach(function (b) {
      b.onclick = async function () {
        const oid = Number(b.dataset.vertretung), v = await holen('/api/vorschlaege?objekt=' + oid);
        schublade('<h2>Vertretung anfragen</h2><p class="leise">Vorschläge: nicht abwesend, nicht schon eingeteilt, Minijob-Grenze nicht überschritten — die mit den wenigsten Stunden zuerst.</p>' + (v.length ? v.map(function (m) { return '<div class="karte zeile" style="margin-top:.6rem"><div><b>' + esc(m.name) + '</b><div class="leise klein">' + String(m.stundenMonat).replace('.', ',') + ' Std. im Monat' + (m.minijob ? ' · Minijob' : '') + '</div></div><button class="knopf klein" data-anfragen="' + m.id + '">Anfragen</button></div>'; }).join('') : '<div class="hinweis">Niemand frei.</div>') + '<div style="margin-top:1rem"><button class="knopf zweit" id="abbrechen">Schließen</button></div>', function (w) {
          $$('[data-anfragen]', w).forEach(function (k) { k.onclick = async function () { await holen('/api/vertretung', { objekt_id: oid, mitarbeiter_id: Number(k.dataset.anfragen) }); schubladeZu(); meldung('Anfrage gesendet — erscheint in der App'); einsatz(); }; });
        });
      };
    });
  }

  // ================================================================= Qualität
  async function qualitaet() {
    const l = await holen('/api/pruefungen'), obj = await objekteListe();
    kopf('Qualität', 'Qualität <span class="akzent">messbar</span> machen', 'Prüfung angelehnt an DIN EN 13549: Stichprobe nach Anzahl der Räume, je Raum feste Prüfelemente, Qualitätswert in Prozent. Jeder Fehler wird automatisch ein Mangel mit Frist — und der Kunde kann den Bericht im Portal abzeichnen.',
      '<select id="qObjekt" style="min-width:220px">' + obj.map(function (o) { return '<option value="' + o.id + '">' + esc(o.name) + '</option>'; }).join('') + '</select><button class="knopf gold" id="qStart">Prüfung starten</button>');
    inhalt.innerHTML = l.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Datum</th><th>Objekt</th><th>Stichprobe</th><th>Ergebnis</th><th>Prüfer</th><th>Kunde</th></tr></thead><tbody>' + l.map(function (p) { return '<tr style="cursor:pointer" data-pr="' + p.id + '"><td>' + datumDe(p.datum) + '</td><td><b>' + esc(p.objekt) + '</b></td><td>' + (p.geprueft || 0) + ' / ' + p.stichprobe + '</td><td>' + (p.ergebnis != null ? '<b class="' + (p.ergebnis >= 90 ? '' : '') + '">' + String(p.ergebnis).replace('.', ',') + ' %</b>' : '<span class="marke orange">läuft</span>') + '</td><td>' + esc(p.pruefer || '') + '</td><td>' + (p.abgezeichnet_von ? '<span class="marke">abgezeichnet</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Noch keine Prüfung.</div>';
    $$('[data-pr]').forEach(function (r) { r.onclick = function () { location.hash = '#pruefung/' + r.dataset.pr; }; });
    $('#qStart').onclick = async function () { const r = await holen('/api/pruefung', { objekt_id: Number($('#qObjekt').value) }); meldung('Stichprobe: ' + r.stichprobe + ' von ' + r.von + ' Räumen'); location.hash = '#pruefung/' + r.id; };
  }
  async function pruefung(id) {
    const p = await holen('/api/pruefung?id=' + id);
    const fertig = p.ergebnis != null;
    kopf('Qualitätsprüfung · ' + datumDe(p.datum), esc(p.objekt), 'Stichprobe ' + p.stichprobe + ' Räume · Prüfer ' + esc(p.pruefer || '') + (fertig ? ' · Ergebnis <b>' + String(p.ergebnis).replace('.', ',') + ' %</b>' : ' · je Element „in Ordnung" oder „Mangel" wählen'),
      '<a class="knopf hell" href="/drucken/pruefung?id=' + p.id + '" target="_blank">Bericht drucken</a>' + (fertig ? '' : '<button class="knopf gold" id="abschliessen">Prüfung abschließen</button>'));
    inhalt.innerHTML = p.raeume.map(function (r) {
      return '<div class="karte" style="margin-bottom:1rem"><div class="zeile"><h3>' + esc(r.name) + '</h3>' + (r.fehler ? '<span class="marke rot">' + r.fehler + ' Fehler</span>' : '') + '</div><table class="tabelle" style="margin-top:.5rem"><tbody>' + r.kriterien.map(function (k, i) {
        return '<tr><td>' + esc(k.element) + '</td><td style="width:1%;white-space:nowrap"><div class="bewertung"><button class="ok' + (k.ok === true ? ' an' : '') + '" data-raum="' + r.raum_id + '" data-i="' + i + '" data-w="1"' + (fertig ? ' disabled' : '') + '>in Ordnung</button><button class="nok' + (k.ok === false ? ' an' : '') + '" data-raum="' + r.raum_id + '" data-i="' + i + '" data-w="0"' + (fertig ? ' disabled' : '') + '>Mangel</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
    }).join('') + (fertig && p.bemerkung ? '<div class="karte"><b>Bemerkung:</b> ' + esc(p.bemerkung) + '</div>' : '') + (p.abgezeichnet_von ? '<div class="hinweis gruen">Vom Kunden abgezeichnet: ' + esc(p.abgezeichnet_von) + ' am ' + esc(datumDe(p.abgezeichnet_am.slice(0, 10))) + '</div>' : '');
    $$('.bewertung button').forEach(function (b) {
      b.onclick = async function () {
        const r = p.raeume.find(function (x) { return x.raum_id === Number(b.dataset.raum); }); const k = r.kriterien[Number(b.dataset.i)];
        k.ok = b.dataset.w === '1' ? (k.ok === true ? null : true) : (k.ok === false ? null : false);
        await holen('/api/pruefung/raum', { pruefung_id: p.id, raum_id: r.raum_id, kriterien: r.kriterien });
        const knoepfe = b.parentNode.querySelectorAll('button'); knoepfe[0].classList.toggle('an', k.ok === true); knoepfe[1].classList.toggle('an', k.ok === false);
      };
    });
    const a = $('#abschliessen'); if (a) a.onclick = async function () { const bem = prompt('Bemerkung zur Prüfung (optional)') || ''; try { const r = await holen('/api/pruefung/abschliessen', { id: p.id, bemerkung: bem }); meldung('Ergebnis ' + String(r.ergebnis).replace('.', ',') + ' % · ' + r.maengel + ' Mängel angelegt'); pruefung(id); } catch (e) { meldung(e.message); } };
  }

  // ================================================================= Zeiten & Lohn
  let zeitReiter = 'buchungen';
  async function zeiten() {
    kopf('Zeiten & Lohn', 'Stunden, die <span class="akzent">stimmen</span>', 'Gestempelte Zeiten am Objekt (mit Abstand zum Objekt), Soll gegen Ist je Objekt, Stunden je Mitarbeiter mit Nacht-, Sonntags- und Feiertagsanteil — und der Export für DATEV.');
    const vonStd = heute().slice(0, 8) + '01';
    inhalt.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap"><div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap"><label class="feld">von<input type="date" id="zVon" value="' + vonStd + '"></label><label class="feld">bis<input type="date" id="zBis" value="' + heute() + '"></label><button class="knopf zweit klein" id="zLaden" style="margin-top:1.2rem">Anzeigen</button></div></div>' +
      reiter([['buchungen', 'Buchungen'], ['sollist', 'Soll / Ist je Objekt'], ['stunden', 'Stunden je Mitarbeiter'], ['datev', 'DATEV-Export']], zeitReiter, function (r) { zeitReiter = r; laden(); }) + '<div id="zBereich"></div>';
    $('#zLaden').onclick = laden;
    async function laden() {
      const von = $('#zVon').value, bis = $('#zBis').value, b = $('#zBereich');
      if (zeitReiter === 'buchungen') {
        const z = await holen('/api/zeiten?von=' + von + '&bis=' + bis);
        b.innerHTML = '<div class="zeile" style="margin-bottom:.6rem"><b>' + z.buchungen.length + ' Buchungen · ' + std(z.summeMinuten) + '</b><a class="knopf zweit klein" href="/api/zeiten.csv?von=' + von + '&bis=' + bis + '">Als Tabelle (CSV)</a></div><div class="scroll"><table class="tabelle"><thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Objekt</th><th>Beginn</th><th>Ende</th><th>Pause</th><th>Dauer</th><th>Abstand</th><th></th></tr></thead><tbody>' +
          z.buchungen.map(function (x) { return '<tr><td>' + datumDe(x.kommen.slice(0, 10)) + '</td><td>' + esc(x.mitarbeiter) + '</td><td>' + esc(x.objekt || '') + '</td><td>' + x.kommen.slice(11, 16) + '</td><td>' + (x.gehen ? x.gehen.slice(11, 16) : '<span class="marke gold">läuft</span>') + '</td><td>' + (x.pause_min || 0) + ' Min.</td><td>' + (x.minuten != null ? std(x.minuten) : '') + '</td><td class="leise klein">' + (x.abstand_m != null ? x.abstand_m + ' m' : '–') + '</td><td><button class="knopf zweit klein" data-korr="' + x.id + '" data-k="' + x.kommen.slice(11, 16) + '" data-g="' + (x.gehen ? x.gehen.slice(11, 16) : '') + '" data-p="' + (x.pause_min || 0) + '">korrigieren</button></td></tr>'; }).join('') + '</tbody></table></div>';
        $$('[data-korr]').forEach(function (k) { k.onclick = function () { schublade('<h2>Zeit korrigieren</h2><div class="formular" style="margin-top:1rem">' + feld('kommen', 'Beginn', k.dataset.k, 'time') + feld('gehen', 'Ende', k.dataset.g, 'time') + feld('pause', 'Pause (Min.)', k.dataset.p, 'number') + '</div>' + knoepfe(), function (w) { $('#speichern', w).onclick = async function () { const d = formDaten(w); d.id = Number(k.dataset.korr); try { await holen('/api/zeit/korrigieren', d); schubladeZu(); meldung('Korrigiert'); laden(); } catch (e) { meldung(e.message); } }; }); }; });
      } else if (zeitReiter === 'sollist') {
        const s = await holen('/api/soll-ist?von=' + von + '&bis=' + bis);
        b.innerHTML = '<div class="scroll"><table class="tabelle"><thead><tr><th>Objekt</th><th style="text-align:right">Soll laut LV</th><th style="text-align:right">Ist gestempelt</th><th style="text-align:right">Abweichung</th><th style="text-align:right">Aufgaben erledigt</th></tr></thead><tbody>' + s.objekte.map(function (o) { const ab = o.istMinuten - o.sollMinuten; return '<tr><td><b>' + esc(o.name) + '</b></td><td style="text-align:right">' + std(o.sollMinuten) + '</td><td style="text-align:right">' + std(o.istMinuten) + '</td><td style="text-align:right;color:' + (Math.abs(ab) > o.sollMinuten * 0.15 ? 'var(--rot)' : 'var(--gruen-700)') + '">' + (ab > 0 ? '+' : '') + std(ab) + '</td><td style="text-align:right">' + o.aufgabenFertig + ' / ' + o.aufgabenSoll + '</td></tr>'; }).join('') + '</tbody></table></div><p class="leise klein">Soll = Richtzeiten aus dem Leistungsverzeichnis (ohne Wegezeit). Rot = mehr als 15 % Abweichung.</p>';
      } else if (zeitReiter === 'stunden') {
        const s = await holen('/api/stunden?von=' + von + '&bis=' + bis);
        b.innerHTML = '<div class="scroll"><table class="tabelle"><thead><tr><th>Mitarbeiter</th><th>Personalnr.</th><th style="text-align:right">Stunden (Ist)</th><th style="text-align:right">davon Nacht</th><th style="text-align:right">Sonntag</th><th style="text-align:right">Feiertag</th><th style="text-align:right">nur geplant</th></tr></thead><tbody>' + s.mitarbeiter.map(function (m) { return '<tr><td><b>' + esc(m.name) + '</b>' + (m.minijob ? ' <span class="marke grau">Minijob</span>' : '') + '</td><td>' + (esc(m.personalnummer) || '<span class="marke rot">fehlt</span>') + '</td><td style="text-align:right">' + m.ist.stunden.toLocaleString('de-DE') + '</td><td style="text-align:right">' + m.ist.nacht.toLocaleString('de-DE') + '</td><td style="text-align:right">' + m.ist.sonntag.toLocaleString('de-DE') + '</td><td style="text-align:right">' + m.ist.feiertag.toLocaleString('de-DE') + '</td><td style="text-align:right">' + (m.nurPlanStunden ? '<span class="marke orange">' + m.nurPlanStunden.toLocaleString('de-DE') + '</span>' : '–') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="leise klein">„nur geplant" = Schichten ohne Stempelung — vor dem Lohnlauf klären.</p>';
      } else {
        const monat = von.slice(0, 7), pr = await holen('/api/datev?monat=' + monat + '&pruefen=1');
        b.innerHTML = '<div class="karte"><div class="ueberzeile">DATEV-Bewegungsdaten</div><h2>Abrechnungsmonat ' + monat.slice(5) + '/' + monat.slice(0, 4) + '</h2><p class="leise">Stunden je Mitarbeiter und Lohnart (Grundlohn, Nacht, Sonntag, Feiertag) als Datei für das Lohnbüro. Die Lohnart-Nummern stellst du unter Stammdaten → Einstellungen ein.</p>' +
          (pr.fehlendePersonalnummer.length ? '<div class="hinweis">Ohne Personalnummer: ' + pr.fehlendePersonalnummer.map(esc).join(', ') + '</div>' : '<div class="hinweis gruen">Alle Mitarbeiter haben eine Personalnummer.</div>') +
          (pr.nurPlan.length ? '<div class="hinweis" style="margin-top:.5rem">Nur geplant, nicht gestempelt: ' + pr.nurPlan.map(esc).join(', ') + '</div>' : '') +
          '<p><b>' + pr.zeilen + '</b> Zeilen</p><a class="knopf" href="/api/datev?monat=' + monat + '">DATEV-Datei herunterladen</a></div>';
      }
    }
    laden();
  }

  // Preisbausteine eines Objekts (unter der Kalkulation): Glas je Durchgang, Winterdienst saisonal, Stundensatz für Abrufe
  async function bausteine(o) {
    const w = $('#bausteine'); if (!w) return;
    const l = await holen('/api/preispositionen?objekt=' + o.id);
    const ART = { je_ausfuehrung: 'je Durchgang', monatlich: 'monatlich', einmalig: 'einmalig', stundensatz: 'Stundensatz Abruf' };
    w.innerHTML = '<div class="karte"><div class="zeile"><div><div class="ueberzeile">Preisbausteine</div><h3>Neben der Monatspauschale</h3><div class="leise klein">Glasreinigung je Durchgang (mit Turnus, z. B. 2 J), Winterdienst monatlich nur in der Saison, eigener Stundensatz für Sonderleistungen. Alles erscheint im Angebot und wird automatisch abgerechnet.</div></div><button class="knopf zweit klein" id="neuBaustein">+ Baustein</button></div>' +
      (l.length ? '<table class="tabelle" style="margin-top:.8rem"><thead><tr><th>Leistung</th><th>Art</th><th>Turnus / Saison</th><th style="text-align:right">Preis netto</th><th></th></tr></thead><tbody>' + l.map(function (p) { return '<tr' + (p.aktiv ? '' : ' style="opacity:.5"') + '><td><b>' + esc(p.bezeichnung) + '</b></td><td>' + esc(ART[p.art] || p.art) + '</td><td>' + esc(p.turnus || (p.monate ? 'Monate ' + p.monate : '')) + '</td><td style="text-align:right">' + euro(p.preis) + ' <span class="leise klein">/ ' + esc(p.einheit || '') + '</span></td><td style="white-space:nowrap"><button class="knopf zweit klein" data-bs="' + p.id + '">ändern</button> <button class="knopf zweit klein" data-bsweg="' + p.id + '">entfernen</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise" style="margin-top:.6rem">Noch keine Bausteine.</div>') + '</div>';
    const form = p => schublade('<h2>' + (p.id ? 'Baustein ändern' : 'Neuer Preisbaustein') + '</h2><div class="formular" style="margin-top:1rem">' + feld('bezeichnung', 'Leistung', p.bezeichnung || 'Glasreinigung') + auswahl('art', 'Art', [['je_ausfuehrung', 'je Durchgang (mit Turnus)'], ['monatlich', 'monatlich (optional nur in Saison)'], ['stundensatz', 'Stundensatz für Sonderleistungen'], ['einmalig', 'einmalig (nur im Angebot)']], p.art || 'je_ausfuehrung') +
      feld('turnus', 'Turnus (bei „je Durchgang"), z. B. 1 Q, 2 J, 1 M', p.turnus || '') + feld('monate', 'Saison-Monate (bei „monatlich"), z. B. 11,12,1,2,3', p.monate || '') + feld('preis', 'Preis € netto', p.preis, 'number', ' step="0.01"') + feld('einheit', 'Einheit', p.einheit || '') + '</div>' + knoepfe(), function (x) {
      $('#speichern', x).onclick = async function () { const d = formDaten(x); d.objekt_id = o.id; d.id = p.id; try { await holen('/api/preisposition', d); schubladeZu(); meldung('Baustein gespeichert'); bausteine(o); } catch (e) { meldung(e.message); } };
    });
    $('#neuBaustein').onclick = function () { form({}); };
    $$('[data-bs]', w).forEach(function (k) { k.onclick = function () { form(l.find(function (p) { return p.id === Number(k.dataset.bs); })); }; });
    $$('[data-bsweg]', w).forEach(function (k) { k.onclick = async function () { if (!confirm('Baustein entfernen?')) return; await holen('/api/preisposition', { id: Number(k.dataset.bsweg), loeschen: true }); meldung('Baustein entfernt'); bausteine(o); }; });
  }

  // ================================================================= Kunden & Zugänge
  async function kunden() {
    const l = await holen('/api/kunden'), konten = await holen('/api/konten');
    kopf('Kunden', 'Kunden &amp; <span class="akzent">Portal</span>', 'Jeder Kunde kann einen eigenen Zugang zum Kundenportal bekommen: Nachweise mit Fotos, Prüfberichte abzeichnen, Reklamationen melden.', '<button class="knopf gold" id="neuKunde">+ Kunde</button>');
    inhalt.innerHTML = '<div class="raster k3">' + l.map(function (k) { const z = konten.filter(function (x) { return x.kunde === k.name; }); return '<div class="karte"><h3>' + esc(k.name) + '</h3><div class="leise klein">' + esc([k.ansprechpartner, k.ort].filter(Boolean).join(' · ')) + '</div><div style="display:flex;gap:.4rem;margin:.8rem 0;flex-wrap:wrap"><span class="marke">' + k.objekte + ' Objekte</span><span class="marke gold">' + k.zugaenge + ' Portal-Zugänge</span></div>' + z.map(function (x) { return '<div class="klein">' + esc(x.email) + (x.aktiv ? '' : ' <span class="marke grau">gesperrt</span>') + ' <button class="knopf zweit klein" data-sperren="' + x.id + '" data-an="' + (x.aktiv ? 1 : 0) + '">' + (x.aktiv ? 'sperren' : 'entsperren') + '</button></div>'; }).join('') + '<div style="display:flex;gap:.4rem;margin-top:.8rem"><button class="knopf zweit klein" data-kunde="' + k.id + '">bearbeiten</button><button class="knopf klein" data-zugang="' + k.id + '">+ Portal-Zugang</button></div></div>'; }).join('') + '</div>';
    const formular = k => schublade('<h2>' + (k.id ? 'Kunde bearbeiten' : 'Neuer Kunde') + '</h2><div class="formular" style="margin-top:1rem">' + feld('name', 'Firma', k.name) + feld('ansprechpartner', 'Ansprechpartner', k.ansprechpartner) + feld('email', 'E-Mail', k.email, 'email') + feld('telefon', 'Telefon', k.telefon) + feld('anschrift', 'Straße', k.anschrift) + feld('plz', 'PLZ', k.plz) + feld('ort', 'Ort', k.ort) + feld('kundennummer', 'Kundennummer', k.kundennummer) + feld('ust_id', 'USt-IdNr. des Kunden', k.ust_id) + feld('leitweg_id', 'Leitweg-ID (nur öffentliche Auftraggeber)', k.leitweg_id) +
      auswahl('sammelrechnung', 'Abrechnung', [['0', 'je Objekt eine Rechnung'], ['1', 'Sammelrechnung über alle Objekte']], k.sammelrechnung ? '1' : '0') +
      auswahl('rechnungsformat', 'Rechnungsformat', [['zugferd', 'ZUGFeRD (PDF mit eingebetteter XML)'], ['xrechnung', 'XRechnung (öffentliche Auftraggeber)'], ['pdf', 'nur PDF']], k.rechnungsformat || 'zugferd') +
      feld('zahlungsziel_tage', 'Zahlungsziel in Tagen (leer = Standard)', k.zahlungsziel_tage, 'number') +
      auswahl('steuerfall', 'Umsatzsteuer', [['normal', 'regulär (19 %)'], ['reverse_charge', '§ 13b UStG: Kunde ist selbst Gebäudereiniger']], k.steuerfall || 'normal') +
      auswahl('privat', 'Kundenart', [['0', 'Unternehmen / Behörde'], ['1', 'Privatperson (Hinweis Aufbewahrungspflicht)']], k.privat ? '1' : '0') + feld('rechnung_email', 'E-Mail für Rechnungen', k.rechnung_email, 'email') + '</div>' + knoepfe(), function (w) {
      $('#speichern', w).onclick = async function () { const d = formDaten(w); d.id = k.id; try { await holen('/api/kunde', d); schubladeZu(); meldung('Gespeichert'); kunden(); } catch (e) { meldung(e.message); } };
    });
    $('#neuKunde').onclick = function () { formular({}); };
    $$('[data-kunde]').forEach(function (b) { b.onclick = function () { formular(l.find(function (k) { return k.id === Number(b.dataset.kunde); })); }; });
    $$('[data-zugang]').forEach(function (b) { b.onclick = function () { schublade('<h2>Portal-Zugang anlegen</h2><p class="leise">Das Passwort gibst du dem Kunden persönlich weiter. Es wird nur als Prüfwert gespeichert.</p><div class="formular" style="margin-top:1rem">' + feld('name', 'Name', '') + feld('email', 'E-Mail', '', 'email') + feld('passwort', 'Passwort (mind. 10 Zeichen)', '', 'text', ' autocomplete="new-password"') + '</div>' + knoepfe('Anlegen'), function (w) { $('#speichern', w).onclick = async function () { const d = formDaten(w); d.rolle = 'kunde'; d.kunde_id = Number(b.dataset.zugang); try { await holen('/api/konto', d); schubladeZu(); meldung('Zugang angelegt'); kunden(); } catch (e) { meldung(e.message); } }; }); }; });
    $$('[data-sperren]').forEach(function (b) { b.onclick = async function () { await holen('/api/konto', { id: Number(b.dataset.sperren), sperren: b.dataset.an === '1' }); meldung('Geändert'); kunden(); }; });
  }

  // ================================================================= Mängel
  async function maengel() {
    const l = await holen('/api/maengel');
    kopf('Mängel', 'Offene <span class="akzent">Mängel</span>', 'Von Mitarbeitern, Kunden oder aus Prüfungen gemeldet — jeder Mangel ist eine Aufgabe mit Frist.');
    inhalt.innerHTML = l.length ? l.map(function (m) { const ueber = m.frist && m.frist < heute(); return '<div class="karte zeile" style="margin-bottom:.7rem"><div><b>' + esc(m.objekt) + (m.raum ? ' · ' + esc(m.raum) : '') + '</b> <span class="marke ' + (m.quelle === 'kunde' ? 'rot' : m.quelle === 'pruefung' ? 'gold' : 'grau') + '">' + esc({ kunde: 'Reklamation', pruefung: 'Prüfung', mitarbeiter: 'Mitarbeiter', buero: 'Büro' }[m.quelle] || m.quelle) + '</span><div>' + esc(m.text) + '</div><div class="leise klein">gemeldet ' + esc(datumDe(m.gemeldet_am.slice(0, 10))) + (m.gemeldet_von ? ' von ' + esc(m.gemeldet_von) : '') + ' · Frist <span' + (ueber ? ' style="color:var(--rot);font-weight:700"' : '') + '>' + esc(datumDe(m.frist)) + '</span>' + (m.foto ? ' · <a href="/fotos/' + esc(m.foto) + '" target="_blank">Foto</a>' : '') + '</div></div><button class="knopf zweit klein" data-erledigt="' + m.id + '">Erledigt</button></div>'; }).join('') : '<div class="karte leer">Keine offenen Mängel.</div>';
    $$('[data-erledigt]').forEach(function (k) { k.onclick = async function () { await holen('/api/mangel', { id: Number(k.dataset.erledigt), erledigt: true }); meldung('Mangel erledigt'); maengel(); }; });
  }

  // ================================================================= Stammdaten
  let stammReiter = 'taetigkeiten';
  async function stammdaten(arg) {
    if (arg === 'berechtigungen') stammReiter = 'zugaenge';
    // Reiter nach Berechtigung: Tätigkeiten/Tarife = Stammdaten, Einstellungen/Berechtigungen = Administration (SecPlan-Vorbild)
    const darf = (window.GW_ICH && window.GW_ICH.bereiche) || [];
    const reiterListe = [['taetigkeiten', 'Tätigkeiten', 'stammdaten'], ['tarife', 'Tarife', 'stammdaten'], ['einstellungen', 'Einstellungen', 'administration'], ['zugaenge', 'Berechtigungen', 'administration']]
      .filter(function (r) { return darf.indexOf(r[2]) >= 0; }).map(function (r) { return [r[0], r[1]]; });
    if (!reiterListe.length) { inhalt.innerHTML = '<div class="karte hinweis">Dafür fehlt die Berechtigung.</div>'; return; }
    if (!reiterListe.some(function (r) { return r[0] === stammReiter; })) stammReiter = reiterListe[0][0];
    kopf('Stammdaten', 'Tätigkeiten, Tarife, <span class="akzent">Berechtigungen</span>', 'Richtzeiten und Anleitungen je Tätigkeit (mit Übersetzungen für die App), Tarif Gebäudereinigerhandwerk mit Gültigkeit, Zuschläge und DATEV-Lohnarten, Berechtigungen und Zugänge.');
    inhalt.innerHTML = reiter(reiterListe, stammReiter, function (r) { stammReiter = r; laden(); }) + '<div id="sBereich"></div>';
    async function laden() {
      const b = $('#sBereich');
      if (stammReiter === 'taetigkeiten') {
        const l = await holen('/api/taetigkeiten');
        b.innerHTML = '<div class="zeile" style="margin-bottom:.6rem"><span class="leise">Richtzeit = Minuten je Ausführung und Raum. Sie steuert Kalkulation und Soll-Zeiten.</span><span style="display:flex;gap:.4rem"><button class="knopf zweit klein" id="katalog">Standardkatalog übernehmen</button><button class="knopf klein" id="neuT">+ Tätigkeit</button></span></div><div class="scroll"><table class="tabelle"><thead><tr><th>Tätigkeit</th><th>Kategorie</th><th style="text-align:right">Min.</th><th>Anleitung</th><th>verwendet</th><th></th></tr></thead><tbody>' + l.map(function (t) { return '<tr><td><b>' + esc(t.name) + '</b></td><td>' + esc(t.kategorie || '') + '</td><td style="text-align:right">' + (t.minuten != null ? t.minuten : '<span class="marke orange">fehlt</span>') + '</td><td class="leise klein" style="max-width:340px">' + esc(t.anleitung || '') + '</td><td>' + t.verwendet + '×</td><td><button class="knopf zweit klein" data-t="' + t.id + '">bearbeiten</button></td></tr>'; }).join('') + '</tbody></table></div>';
        const formular = async t => { const x = t.id ? await holen('/api/taetigkeit?id=' + t.id) : { uebersetzungen: [] }; const u = {}; (x.uebersetzungen || []).forEach(function (v) { u[v.sprache] = v; });
          schublade('<h2>' + (t.id ? 'Tätigkeit bearbeiten' : 'Neue Tätigkeit') + '</h2><div class="formular" style="margin-top:1rem">' + feld('name', 'Name', t.name) + feld('kategorie', 'Kategorie', t.kategorie) + feld('minuten', 'Richtzeit (Min. je Ausführung)', t.minuten, 'number', ' step="0.5"') + '<label class="feld" style="grid-column:1/-1">Anleitung „So geht’s"<textarea name="anleitung" rows="3">' + esc(t.anleitung || '') + '</textarea></label></div>' +
            (t.id ? '<h3 style="margin-top:1.4rem">Übersetzungen für die App</h3>' + ['pl', 'ro', 'tr', 'uk', 'ar', 'en', 'bg'].map(function (s) { return '<div class="formular" style="margin-top:.6rem"><label class="feld">' + SPRACHEN[s] + ': Name<input data-u="' + s + '" data-f="name" value="' + esc(u[s] ? u[s].name || '' : '') + '"></label><label class="feld">' + SPRACHEN[s] + ': Anleitung<input data-u="' + s + '" data-f="anleitung" value="' + esc(u[s] ? u[s].anleitung || '' : '') + '"></label></div>'; }).join('') : '') + knoepfe(), function (w) {
            $('#speichern', w).onclick = async function () { const d = { id: t.id, name: $('[name=name]', w).value, kategorie: $('[name=kategorie]', w).value, minuten: $('[name=minuten]', w).value, anleitung: $('[name=anleitung]', w).value };
              try { await holen('/api/taetigkeit', d); if (t.id) for (const s of ['pl', 'ro', 'tr', 'uk', 'ar', 'en', 'bg']) { const n = $('[data-u="' + s + '"][data-f="name"]', w).value, a = $('[data-u="' + s + '"][data-f="anleitung"]', w).value; if (n || a || u[s]) await holen('/api/uebersetzung', { taetigkeit_id: t.id, sprache: s, name: n, anleitung: a }); } schubladeZu(); meldung('Gespeichert'); laden(); } catch (e) { meldung(e.message); } };
          }); };
        $('#neuT').onclick = function () { formular({}); };
        $('#katalog').onclick = async function () { try { const r = await holen('/api/katalog', {}); meldung('Katalog: ' + r.neu + ' neu, ' + r.ergaenzt + ' ergänzt (Beschreibungen) — Vorhandenes bleibt unverändert'); laden(); } catch (e) { meldung(e.message); } };
        $$('[data-t]').forEach(function (k) { k.onclick = function () { formular(l.find(function (t) { return t.id === Number(k.dataset.t); })); }; });
      } else if (stammReiter === 'tarife') {
        const l = await holen('/api/tarife');
        b.innerHTML = '<div class="zeile" style="margin-bottom:.6rem"><span class="leise">Neue Tarifrunde: neuen Satz mit „gültig ab" eintragen — ältere bleiben für frühere Monate erhalten.</span><button class="knopf klein" id="neuTarif">+ Tarif</button></div><div class="scroll"><table class="tabelle"><thead><tr><th>Lohngruppe</th><th>Bezeichnung</th><th style="text-align:right">Stundenlohn</th><th>gültig ab</th><th>gültig bis</th><th>Quelle</th></tr></thead><tbody>' + l.map(function (t) { return '<tr><td><b>' + esc(t.lohngruppe) + '</b></td><td>' + esc(t.bezeichnung || '') + '</td><td style="text-align:right">' + euro(t.stundenlohn) + '</td><td>' + datumDe(t.gueltig_ab) + '</td><td>' + (t.gueltig_bis ? datumDe(t.gueltig_bis) : 'offen') + '</td><td class="leise klein">' + esc(t.quelle || '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
        $('#neuTarif').onclick = function () { schublade('<h2>Tarif eintragen</h2><div class="formular" style="margin-top:1rem">' + feld('lohngruppe', 'Lohngruppe', 'LG 1') + feld('bezeichnung', 'Bezeichnung', '') + feld('stundenlohn', 'Stundenlohn €', '', 'number', ' step="0.01"') + feld('gueltig_ab', 'gültig ab', '', 'date') + feld('gueltig_bis', 'gültig bis (optional)', '', 'date') + feld('quelle', 'Quelle', 'Lohntarifvertrag Gebäudereinigerhandwerk') + '</div>' + knoepfe('Eintragen'), function (w) { $('#speichern', w).onclick = async function () { try { await holen('/api/tarif', formDaten(w)); schubladeZu(); meldung('Tarif eingetragen'); laden(); } catch (e) { meldung(e.message); } }; }); };
      } else if (stammReiter === 'einstellungen') {
        const e = await holen('/api/einstellungen');
        const felder = [['firma_name', 'Firmenname (auf Angeboten)'], ['lohnnebenkosten_prozent', 'Lohnnebenkosten %'], ['gemeinkosten_prozent', 'Gemeinkosten %'], ['gewinn_prozent', 'Gewinn %'], ['wegezeit_min', 'Wegezeit je Einsatztag (Min.)'], ['standard_richtzeit_min', 'Standard-Richtzeit, wenn eine Tätigkeit keine hat (Min.)'], ['minijob_grenze_eur', 'Minijob-Grenze € / Monat'],
          ['zuschlag_nacht_von', 'Nachtzuschlag ab (HH:MM)'], ['zuschlag_nacht_bis', 'Nachtzuschlag bis (HH:MM)'], ['datev_berater_nr', 'DATEV Beraternummer'], ['datev_mandant_nr', 'DATEV Mandantennummer'], ['lohnart_stunden', 'Lohnart Grundlohn (Stunden)'], ['lohnart_nacht', 'Lohnart Nachtzuschlag'], ['lohnart_sonntag', 'Lohnart Sonntagszuschlag'], ['lohnart_feiertag', 'Lohnart Feiertagszuschlag'],
          ['firma_strasse', 'Rechnung: Straße'], ['firma_plz', 'Rechnung: PLZ'], ['firma_ort', 'Rechnung: Ort'], ['firma_email', 'Rechnung: E-Mail'], ['firma_telefon', 'Rechnung: Telefon'], ['steuernummer', 'Steuernummer'], ['ust_id', 'USt-IdNr.'], ['handelsregister', 'Handelsregister (z. B. HRB 1234, AG Kiel)'], ['geschaeftsfuehrung', 'Geschäftsführung'],
          ['bank', 'Bank'], ['iban', 'IBAN'], ['bic', 'BIC'], ['ust_prozent', 'Umsatzsteuer %'], ['zahlungsziel_tage', 'Zahlungsziel (Tage)'], ['rechnung_praefix', 'Präfix Rechnungsnummer'], ['stundensatz_abruf', 'Stundensatz Sonderleistungen € (netto)'],
          ['firma_fax', 'Briefpapier: Fax'], ['firma_internet', 'Briefpapier: Internet'], ['amtsgericht', 'Amtsgericht'], ['gesellschafter', 'Gesellschafter'], ['firma_sitz', 'Unternehmenssitz']];
        b.innerHTML = '<div class="karte"><div class="formular">' + felder.map(function (f) { return feld(f[0], f[1], e[f[0]]); }).join('') + '</div>' +
          '<div class="formular" style="grid-template-columns:1fr;margin-top:.8rem"><label class="feld">Rechnung: Anschreiben (jede Zeile ein Absatz)<textarea name="rechnung_einleitung" rows="4">' + esc(e.rechnung_einleitung || '') + '</textarea></label><label class="feld">Rechnung: Schlusstext (jede Zeile ein Absatz)<textarea name="rechnung_schluss" rows="4">' + esc(e.rechnung_schluss || '') + '</textarea></label></div><p class="leise klein">Die Lohnart-Nummern sind Platzhalter — bitte mit dem Lohnbüro abstimmen. Ohne eigene Anschrift und Steuernummer (oder USt-IdNr.) lässt Glanzwerk keine Rechnung stellen (§ 14 UStG).</p><button class="knopf" id="eSpeichern">Speichern</button></div>';
        $('#eSpeichern').onclick = async function () { await holen('/api/einstellungen', formDaten(b)); meldung('Einstellungen gespeichert'); };
      } else {
        // Administration → Berechtigungen, wie SecPlan 10.11: Lizenzen je Rolle, Vergabe an Mitarbeiter, Sonderberechtigungen
        const B = await holen('/api/berechtigungen');
        const rollenIds = Object.keys(B.rollen), l = B.konten;
        const leiter = r => r === 'einsatzleiter' || r === 'objektleiter';
        const sonderFuer = r => Object.keys(B.sonder).filter(function (s) { return B.sonder[s].fuer.indexOf(r) >= 0; });
        const sonderText = k => Object.keys(k.sonderrechte || {}).filter(function (s) { return B.sonder[s]; }).map(function (s) { return B.sonder[s].titel; });
        b.innerHTML = '<div class="raster k3" style="margin-bottom:1rem">' + rollenIds.map(function (r) { return '<div class="karte"><div class="ueberzeile">' + esc(B.rollen[r].titel) + '</div><div style="font-size:1.6rem;font-weight:700">' + (B.anzahl[r] || 0) + '</div><p class="leise klein">' + esc(B.rollen[r].text) + '</p></div>'; }).join('') + '</div>' +
          '<div class="zeile" style="margin-bottom:.6rem"><span class="leise">Wer im Büro mit welcher Berechtigung arbeitet. Mitarbeiter ohne Berechtigung nutzen die App mit ihrer PIN.</span><span style="display:flex;gap:.4rem"><button class="knopf zweit klein" id="matrix">Rechte-Übersicht</button><button class="knopf klein" id="neuBuero">+ Berechtigung vergeben</button></span></div>' +
          '<div class="scroll"><table class="tabelle"><thead><tr><th>Name</th><th>Berechtigung</th><th>Sonderberechtigungen</th><th>Objekte</th><th>E-Mail</th><th>Status</th><th></th></tr></thead><tbody>' +
          l.slice().sort(function (x, y) { return rollenIds.indexOf(x.berechtigung) - rollenIds.indexOf(y.berechtigung) || x.name.localeCompare(y.name); }).map(function (k) {
            const st = sonderText(k);
            return '<tr><td><b>' + esc(k.name) + '</b>' + (k.mitarbeiter ? '<br><span class="leise klein">Mitarbeiterakte: ' + esc(k.mitarbeiter) + '</span>' : '') + '</td><td><span class="marke">' + esc((B.rollen[k.berechtigung] || B.rollen.admin).titel) + '</span></td>' +
              '<td class="klein">' + (st.length ? st.map(esc).join('<br>') : '<span class="leise">–</span>') + '</td><td class="klein">' + (leiter(k.berechtigung) ? (k.objekte.length ? k.objekte.map(function (o) { const x = B.objekte.find(function (y) { return y.id === o; }); return esc(x ? x.name : '#' + o); }).join('<br>') : '<span class="marke orange">keine zugewiesen</span>') : '<span class="leise">alle</span>') + '</td>' +
              '<td>' + esc(k.email) + '</td><td>' + (!k.aktiv ? '<span class="marke grau">gesperrt</span>' : k.einladung_bis && k.einladung_bis > new Date().toISOString() ? '<span class="marke orange">Einladung offen bis ' + datumDe(k.einladung_bis.slice(0, 10)) + '</span>' : '<span class="marke">aktiv</span>') + '</td>' +
              '<td style="white-space:nowrap"><button class="knopf zweit klein" data-be="' + k.id + '">bearbeiten</button> <button class="knopf zweit klein" data-ei="' + k.id + '">Einladung</button> <button class="knopf zweit klein" data-pw="' + k.id + '">Passwort</button> <button class="knopf zweit klein" data-sp="' + k.id + '" data-an="' + (k.aktiv ? 1 : 0) + '">' + (k.aktiv ? 'sperren' : 'entsperren') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>';
        // Formular für Vergabe und Bearbeitung: Sonderrechte und Objekte folgen der gewählten Rolle
        const formular = function (k) {
          const neu = !k.id;
          const teil = r => '<h3 style="margin-top:1.2rem">Sonderberechtigungen</h3>' + (sonderFuer(r).length ? '<div class="formular" style="grid-template-columns:1fr">' + sonderFuer(r).map(function (s) { const d = B.sonder[s]; return '<label class="feld" style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" data-sr="' + s + '"' + (k.sonderrechte && k.sonderrechte[s] ? ' checked' : '') + ' style="width:auto"> ' + esc(d.titel) + (d.art === 'einschraenkung' ? ' <span class="marke orange">Einschränkung</span>' : '') + '</label>'; }).join('') + '</div>' : '<p class="leise klein">Für diese Berechtigung gibt es keine Sonderberechtigungen.</p>') +
            (leiter(r) ? '<h3 style="margin-top:1.2rem">Zuständige Objekte</h3><p class="leise klein">Objekt- und Einsatzleiter sehen nur diese Objekte.</p><div class="formular" style="grid-template-columns:1fr 1fr">' + B.objekte.map(function (o) { return '<label class="feld" style="flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" data-ob="' + o.id + '"' + ((k.objekte || []).indexOf(o.id) >= 0 ? ' checked' : '') + ' style="width:auto"> ' + esc(o.name) + '</label>'; }).join('') + '</div>' : '');
          schublade('<h2>' + (neu ? 'Berechtigung vergeben' : 'Berechtigung: ' + esc(k.name)) + '</h2><div class="formular" style="margin-top:1rem">' +
            auswahl('mitarbeiter_id', 'Mitarbeiter (Personalakte)', [['', '— ohne Mitarbeiterakte —']].concat(B.mitarbeiter.map(function (m) { return [m.id, m.name]; })), k.mitarbeiter_id) +
            auswahl('berechtigung', 'Berechtigung', rollenIds.map(function (r) { return [r, B.rollen[r].titel]; }), k.berechtigung || 'planer') +
            (neu ? feld('name', 'Name', '') + feld('email', 'E-Mail (Anmeldung)', '', 'email') + '<label class="feld" style="grid-column:1/-1;flex-direction:row;align-items:center;gap:.5rem"><input type="checkbox" name="einladen" checked style="width:auto"> Einladung per E-Mail — er legt sein Passwort über einen Link selbst fest</label>' + '<div id="pwFeld" hidden>' + feld('passwort', 'Passwort (mind. 10 Zeichen)', '', 'password', ' autocomplete="new-password"') + '</div>' : '') +
            '</div><p class="leise klein" id="rollenText"></p><div id="rollenTeil"></div>' + knoepfe(neu ? 'Vergeben' : 'Speichern'), function (w) {
            const rolleFeld = $('[name=berechtigung]', w), maFeld = $('[name=mitarbeiter_id]', w);
            const zeigen = function () { $('#rollenText', w).textContent = B.rollen[rolleFeld.value].text; $('#rollenTeil', w).innerHTML = teil(rolleFeld.value); };
            rolleFeld.onchange = function () { k = Object.assign({}, k, { sonderrechte: {} }); zeigen(); }; zeigen();
            if (neu) { const ein = $('[name=einladen]', w); ein.onchange = function () { $('#pwFeld', w).hidden = ein.checked; }; }
            if (neu) maFeld.onchange = function () { const m = B.mitarbeiter.find(function (x) { return String(x.id) === maFeld.value; }); if (m && !$('[name=name]', w).value) $('[name=name]', w).value = m.name; };
            $('#speichern', w).onclick = async function () {
              const d = { berechtigung: rolleFeld.value, mitarbeiter_id: maFeld.value ? Number(maFeld.value) : null, sonderrechte: {}, objekte: [] };
              $$('[data-sr]', w).forEach(function (c) { if (c.checked) d.sonderrechte[c.dataset.sr] = true; });
              $$('[data-ob]', w).forEach(function (c) { if (c.checked) d.objekte.push(Number(c.dataset.ob)); });
              try {
                const einladen = neu && $('[name=einladen]', w).checked;
                let r = null;
                if (neu) r = await holen('/api/konto', Object.assign(d, { rolle: 'buero', name: $('[name=name]', w).value, email: $('[name=email]', w).value }, einladen ? { einladen: true } : { passwort: $('[name=passwort]', w).value }));
                else await holen('/api/konto', Object.assign(d, { id: k.id }));
                meldung(neu ? 'Berechtigung vergeben' : 'Gespeichert'); laden();
                if (r && r.einladung) einladungZeigen(r.einladung); else schubladeZu();
              } catch (e) { meldung(e.message); }
            };
          });
        };
        // Einladung: Link kopieren oder fertige Mail im eigenen Mailprogramm öffnen (Glanzwerk selbst verschickt keine Mails)
        const einladungZeigen = function (e) {
          const vorname = String(e.name || '').split(' ')[0];
          const text = ['Hallo ' + vorname + ',', '', 'du hast jetzt einen Zugang zu Glanzwerk, unserer Software für Planung, Personal und Abrechnung.', '',
            'Über diesen Link legst du dein Passwort fest (gültig bis ' + datumDe(e.bis.slice(0, 10)) + '):', e.link, '',
            'Danach meldest du dich immer hier an: ' + e.anmelden, 'Deine Anmeldung ist deine E-Mail-Adresse: ' + e.email, '', 'Sag Bescheid, wenn was unklar ist.', ''].join('\n');
          schublade('<h2>Einladung für ' + esc(e.name) + '</h2><p class="leise klein">Der Link gilt ' + e.tage + ' Tage und nur einmal. Eine neue Einladung macht die alte ungültig. In der Mail steht kein Passwort.</p><div class="formular" style="grid-template-columns:1fr;margin-top:1rem"><label class="feld">Einladungslink<input id="einLink" readonly value="' + esc(e.link) + '"></label><label class="feld">Mailtext<textarea rows="9" readonly>' + esc(text) + '</textarea></label></div>' +
            '<div style="display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap"><a class="knopf" id="einMail" href="mailto:' + encodeURIComponent(e.email) + '?subject=' + encodeURIComponent('Dein Zugang zu Glanzwerk') + '&body=' + encodeURIComponent(text) + '">E-Mail öffnen</a><button class="knopf zweit" id="einKopieren">Link kopieren</button><button class="knopf zweit" id="abbrechen">Schließen</button></div>', function (w) {
            $('#einKopieren', w).onclick = async function () { try { await navigator.clipboard.writeText(e.link); meldung('Link kopiert'); } catch (x) { $('#einLink', w).select(); meldung('Link markiert — mit Strg+C kopieren'); } };
          });
        };
        $$('[data-ei]').forEach(function (x) { x.onclick = async function () { try { const r = await holen('/api/konto', { id: Number(x.dataset.ei), einladen: true }); laden(); einladungZeigen(r.einladung); } catch (e) { meldung(e.message); } }; });
        $('#neuBuero').onclick = function () { formular({}); };
        $$('[data-be]').forEach(function (x) { x.onclick = function () { formular(l.find(function (k) { return k.id === Number(x.dataset.be); })); }; });
        // Rechte-Übersicht wie „Berechtigungen im Bereich …" in SecPlan: Bereich × Rolle (Grundrechte, ohne Sonderberechtigungen)
        $('#matrix').onclick = function () {
          schublade('<h2>Rechte-Übersicht</h2><p class="leise klein">Grundrechte je Berechtigung. Sonderberechtigungen erweitern oder schränken sie je Person ein.</p><div class="scroll" style="margin-top:.8rem"><table class="tabelle"><thead><tr><th>Bereich</th>' + rollenIds.map(function (r) { return '<th style="text-align:center">' + esc(B.rollen[r].titel) + '</th>'; }).join('') + '</tr></thead><tbody>' +
            B.bereiche.map(function (be) { return '<tr><td>' + esc(be.titel) + '</td>' + rollenIds.map(function (r) { return '<td style="text-align:center">' + (B.grund[r].indexOf(be.id) >= 0 ? (leiter(r) && be.id === 'planung' ? '✓ <span class="leise klein">eigene Objekte</span>' : '✓') : '<span class="leise">–</span>') + '</td>'; }).join('') + '</tr>'; }).join('') +
            '</tbody></table></div><div style="margin-top:1rem"><button class="knopf zweit" id="abbrechen">Schließen</button></div>');
        };
        $$('[data-sp]').forEach(function (x) { x.onclick = async function () { try { await holen('/api/konto', { id: Number(x.dataset.sp), sperren: x.dataset.an === '1' }); meldung('Geändert'); laden(); } catch (e) { meldung(e.message); } }; });
        $$('[data-pw]').forEach(function (x) { x.onclick = function () { schublade('<h2>Passwort ändern</h2><div class="formular" style="margin-top:1rem">' + feld('passwort', 'Neues Passwort (mind. 10 Zeichen)', '', 'password', ' autocomplete="new-password"') + '</div>' + knoepfe(), function (w) { $('#speichern', w).onclick = async function () { try { await holen('/api/konto', { id: Number(x.dataset.pw), passwort: $('[name=passwort]', w).value }); schubladeZu(); meldung('Passwort geändert'); } catch (e) { meldung(e.message); } }; }); }; });
      }
    }
    laden();
  }

  // ================================================================= Schublade, Router, Anmeldung
  function schublade(html, bei) { $('#schubladeInhalt').innerHTML = html; $('#schublade').hidden = false; if (bei) bei($('#schubladeInhalt')); const a = $('#abbrechen'); if (a) a.onclick = schubladeZu; const erstes = $('#schubladeInhalt input, #schubladeInhalt select'); if (erstes && matchMedia('(pointer: fine)').matches) erstes.focus(); }   // am Handy kein Autofokus: die Tastatur verdeckt sonst die halbe Maske
  function schubladeZu() { $('#schublade').hidden = true; }
  $('#schublade').onclick = function (e) { if (e.target.id === 'schublade') schubladeZu(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') schubladeZu(); });
  $('#navKnopf').onclick = function () { const o = $('#nav').classList.toggle('offen'); this.setAttribute('aria-expanded', o ? 'true' : 'false'); };
  $('#abmelden').onclick = async function () { await holen('/api/abmelden', {}); location.href = '/anmelden'; };

  // Menü nach Berechtigung (SecPlan-Vorbild): was die Rolle nicht darf, erscheint nicht. Die Sicherung sitzt im Server.
  const MENUE_BEREICH = { uebersicht: 'startseite', dienstplan: 'planung', tagesplan: 'planung', einsatz: 'planung', objekte: 'planung', qualitaet: 'planung', maengel: 'planung',
    objektauswertung: 'controlling', import: 'stammdaten', mitarbeiter: 'personal', 'mitarbeiter-fristen': 'personal', fragebogen: 'personal', bewerber: 'bewerbungen', zeiten: 'abgleich',
    kunden: 'kunden', abrechnung: 'abrechnung', 'abrechnung-op': 'abrechnung', 'abrechnung-auftraege': 'abrechnung', 'abrechnung-artikel': 'abrechnung', controlling: 'controlling',
    sicherheit: 'arbeitsschutz', unterweisung: 'arbeitsschutz', 'register-gefahrstoffe': 'arbeitsschutz', 'register-ausgaben': 'arbeitsschutz', 'register-fahrzeuge': 'arbeitsschutz', 'register-subunternehmer': 'arbeitsschutz',
    stammdaten: ['stammdaten', 'administration'], berechtigungen: 'administration' };
  function menueNachBerechtigung(ich) {
    const darf = ich.bereiche || [];
    $$('#nav a[data-v]').forEach(function (a) { const b = MENUE_BEREICH[a.dataset.v]; if (!b) return; a.hidden = ![].concat(b).some(function (x) { return darf.indexOf(x) >= 0; }); });
    $$('#nav .menue').forEach(function (m) { m.hidden = !m.querySelector('a[data-v]:not([hidden])'); });
  }
  const ANSICHT = { uebersicht, dienstplan, objekte, objekt, tagesplan, import: lvImport, einsatz, qualitaet, pruefung, zeiten, kunden, maengel, stammdaten };
  // Bausteine für die Module (Abrechnung, Personal, Objektakte, Kommunikation, Planner) — die melden ihre Ansichten hier an
  window.GW = { kopf, feld, auswahl, formDaten, knoepfe, reiter, schublade, schubladeZu, objekteListe, euro, std, route, TAGE, SPRACHEN, bausteine, inhalt: inhalt, titel: titel, objekteNeu: function () { objekteCache = null; } };
  async function route() {
    const [v, arg] = (location.hash.slice(1) || 'uebersicht').split('/');
    const nav = { objekt: 'objekte', import: 'objekte', pruefung: 'qualitaet', rechnung: 'abrechnung', mahnung: 'abrechnung', person: 'mitarbeiter', board: 'planner', kandidat: 'bewerber', report: 'controlling', register: 'sicherheit' }[v] || v;
    // Unterziel (z. B. #abrechnung/op) hat einen eigenen Menüpunkt → der ist aktiv, sonst der Hauptpunkt
    const genau = arg && document.querySelector('#nav a[data-v="' + v + '-' + arg + '"]') ? v + '-' + arg : nav;
    $$('#nav a').forEach(function (a) { a.classList.toggle('aktiv', a.dataset.v === genau); });
    $$('#nav .menue').forEach(function (m) { m.classList.toggle('aktiv', !!m.querySelector('a.aktiv')); });
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#nav')) document.activeElement.blur();   // Dropdown schließt nach der Wahl
    $('#nav').classList.remove('offen'); $('#navKnopf').setAttribute('aria-expanded', 'false');
    schubladeZu();
    const modul = window.GW_ANSICHTEN || {};
    // Direkter Aufruf einer gesperrten Seite (z. B. #zeiten als Objektleiter): Hinweis statt Absturz
    const seitenBereich = { objekt: 'planung', pruefung: 'planung', person: 'personal', kandidat: 'bewerbungen', rechnung: 'abrechnung', mahnung: 'abrechnung', report: 'controlling', register: 'arbeitsschutz' }[v] || MENUE_BEREICH[v];
    const ichB = (window.GW_ICH && window.GW_ICH.bereiche) || null;
    if (ichB && seitenBereich && ![].concat(seitenBereich).some(function (x) { return ichB.indexOf(x) >= 0; })) { kopf('Kein Zugriff', 'Dafür fehlt die <span class="akzent">Berechtigung</span>', 'Welche Bereiche du nutzen kannst, legt ein Admin unter Verwaltung → Berechtigungen fest.'); inhalt.innerHTML = ''; window.scrollTo(0, 0); return; }
    try { await (modul[v] || ANSICHT[v] || uebersicht)(arg); } catch (e) { if (/anmelden/i.test(e.message)) { location.href = '/anmelden'; return; } inhalt.innerHTML = '<div class="karte hinweis">' + esc(e.message) + '</div>'; }
    window.scrollTo(0, 0);
  }
  (async function () {
    try { const ich = await UI.ich(); if (!ich) throw 0; if (ich.rolle !== 'buero') { location.href = ich.rolle === 'kunde' ? '/kunde' : '/app'; return; } $('#leisteName').textContent = ich.name; window.GW_ICH = ich; menueNachBerechtigung(ich); }
    catch (e) { location.href = '/anmelden'; return; }
    window.addEventListener('hashchange', route); route();
  })();
})();
