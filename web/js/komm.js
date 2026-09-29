// komm.js — Kommunikation unten rechts, im Büro und in der Mitarbeiter-App: Kanäle der Abteilungen (Mängel & Meldungen,
// Team, Objektleitung, Buchhaltung, Akquise, HR), Direktnachrichten, Fotos, Meldung mit Objekt (→ Mangel), aus jeder
// Nachricht eine Aufgabe, „Meine Aufgaben" mit Checkliste und Kommentaren. Das Board (Planner) öffnet sich im Büro.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe } = UI;
  let ich = null, stand = null, offen = false, ansicht = 'chats', kanal = null, letzteId = 0, objekte = null, takt = null;
  const buero = () => ich && ich.rolle === 'buero';
  const zeit = z => { const d = String(z || ''); return d.slice(0, 10) === heute() ? d.slice(11, 16) : datumDe(d.slice(0, 10)) + ' ' + d.slice(11, 16); };
  const PRIO = { dringend: ['dringend', 'rot'], hoch: ['hoch', 'orange'], mittel: ['mittel', 'grau'], niedrig: ['niedrig', 'grau'] };

  function bauen() {
    const k = document.createElement('button'); k.id = 'kommKnopf'; k.className = 'komm-knopf'; k.setAttribute('aria-label', 'Nachrichten und Aufgaben');
    k.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="komm-zahl" id="kommZahl" hidden></span>';
    const p = document.createElement('div'); p.id = 'kommPanel'; p.className = 'komm-panel'; p.hidden = true;
    p.innerHTML = '<div class="komm-kopf"><button data-kansicht="chats" class="aktiv">Chats</button><button data-kansicht="aufgaben">Meine Aufgaben <span id="kommAufgZahl"></span></button>' + (buero() ? '<a href="#planner" id="kommPlanner" title="Planner-Boards">Planner</a>' : '') + '<button id="kommZu" aria-label="Schließen" style="margin-left:auto">✕</button></div><div class="komm-inhalt" id="kommInhalt"></div>';
    document.body.appendChild(k); document.body.appendChild(p);
    k.onclick = function () { offen = !offen; p.hidden = !offen; if (offen) zeigen(); };
    $('#kommZu').onclick = function () { offen = false; p.hidden = true; };
    $$('[data-kansicht]', p).forEach(function (b) { b.onclick = function () { ansicht = b.dataset.kansicht; kanal = null; $$('[data-kansicht]', p).forEach(function (x) { x.classList.toggle('aktiv', x === b); }); zeigen(); }; });
    const pl = $('#kommPlanner'); if (pl) pl.onclick = function () { offen = false; p.hidden = true; };
  }
  async function aktualisieren() {
    try { stand = await holen('/api/komm/uebersicht'); } catch (e) { return; }
    const n = stand.ungelesen + stand.meineAufgaben, z = $('#kommZahl');
    z.hidden = !n; z.textContent = n > 99 ? '99+' : n; z.classList.toggle('rot', stand.ueberfaellig > 0 || stand.ungelesen > 0);
    const a = $('#kommAufgZahl'); if (a) a.textContent = stand.meineAufgaben ? '(' + stand.meineAufgaben + ')' : '';
    if (offen && ansicht === 'chats' && !kanal) liste();
    if (offen && kanal) nachladen();
  }
  function zeigen() { if (ansicht === 'aufgaben') return aufgaben(); if (kanal) return chat(kanal); liste(); }

  // ---------- Kanalliste
  function liste() {
    if (!stand) return;
    const w = $('#kommInhalt'), abt = stand.kanaele.filter(function (k) { return k.art === 'abteilung'; }), dm = stand.kanaele.filter(function (k) { return k.art === 'direkt'; });
    const zeile = k => '<button class="komm-kanal" data-kanal="' + esc(k.schluessel) + '"><span><b>' + (k.art === 'abteilung' ? '# ' : '') + esc(k.name) + '</b><br><span class="leise klein">' + esc(k.letzte ? (k.letzte.von_name + ': ' + (k.letzte.text || 'Foto')).slice(0, 60) : (k.beschreibung || '')) + '</span></span>' + (k.ungelesen ? '<span class="komm-zahl rot">' + k.ungelesen + '</span>' : '') + '</button>';
    w.innerHTML = '<div class="ueberzeile" style="padding:.6rem .8rem 0">Kanäle</div>' + abt.map(zeile).join('') +
      '<div class="ueberzeile" style="padding:.8rem .8rem 0">Direktnachrichten</div>' + (dm.map(zeile).join('') || '<div class="leise klein" style="padding:.3rem .8rem">Noch keine.</div>') +
      '<div style="padding:.6rem .8rem"><select id="kommNeuDm" style="width:100%"><option value="">+ Nachricht an …</option>' + stand.personen.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' · ' + esc(p.art) + (p.abteilung ? ' (' + esc(p.abteilung) + ')' : '') + '</option>'; }).join('') + '</select></div>';
    $$('[data-kanal]', w).forEach(function (b) { b.onclick = function () { chat(b.dataset.kanal); }; });
    $('#kommNeuDm').onchange = function () { if (this.value) direkt(this.value); };
  }
  function direkt(person) {
    if (!ich || !stand) return;
    offen = true; $('#kommPanel').hidden = false; ansicht = 'chats';
    chat('dm:' + [stand.ich, person].sort().join(':'));
  }

  // ---------- Chat
  async function chat(schluessel) {
    kanal = schluessel; letzteId = 0;
    const w = $('#kommInhalt');
    let d; try { d = await holen('/api/komm/nachrichten?kanal=' + encodeURIComponent(schluessel)); } catch (e) { meldung(e.message); kanal = null; return liste(); }
    const titel = d.kanal.art === 'direkt' ? ((stand.kanaele.find(function (k) { return k.schluessel === d.kanal.schluessel; }) || {}).name || stand.personen.filter(function (p) { return d.kanal.schluessel.split(':').indexOf(p.id) > 0; }).map(function (p) { return p.name; }).join('') || d.kanal.name) : '# ' + d.kanal.name;
    const mitObjekt = d.kanal.schluessel === 'maengel';
    if (mitObjekt && !objekte) objekte = await holen('/api/komm/objekte').catch(function () { return []; });
    w.innerHTML = '<div class="komm-chatkopf"><button id="kommZurueck" aria-label="zurück">‹</button><b>' + esc(titel) + '</b></div><div class="komm-verlauf" id="kommVerlauf"></div>' +
      '<div class="komm-eingabe">' + (mitObjekt ? '<select id="kommObjekt"><option value="">Objekt (für einen Mangel)</option>' + (objekte || []).map(function (o) { return '<option value="' + o.id + '">' + esc(o.name) + '</option>'; }).join('') + '</select>' : '') +
      '<div style="display:flex;gap:.4rem;align-items:flex-end"><label class="komm-foto" title="Foto anhängen"><input type="file" accept="image/*" capture="environment" id="kommFoto" hidden>📷</label><textarea id="kommText" rows="2" placeholder="' + (mitObjekt ? 'Was ist los? Mit Objekt wird daraus ein Mangel.' : 'Nachricht …') + '"></textarea><button class="knopf klein" id="kommSenden">Senden</button></div><div id="kommFotoName" class="leise klein"></div></div>';
    $('#kommZurueck').onclick = function () { kanal = null; aktualisieren().then(liste); };
    let foto = null;
    $('#kommFoto').onchange = function () { const f = this.files[0]; if (!f) return; verkleinern(f).then(function (x) { foto = x; $('#kommFotoName').textContent = 'Foto angehängt: ' + f.name; }); };
    const senden = async function () {
      const t = $('#kommText').value.trim(); if (!t && !foto) return;
      try { const r = await holen('/api/komm/nachricht', { kanal: kanal, text: t, foto: foto, objekt_id: mitObjekt ? $('#kommObjekt').value : null });
        $('#kommText').value = ''; foto = null; $('#kommFotoName').textContent = ''; if (r.mangel_id) meldung('Gemeldet — Mangel ist am Objekt erfasst'); nachladen();
      } catch (e) { meldung(e.message); }
    };
    $('#kommSenden').onclick = senden;
    $('#kommText').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(); } };
    anhaengen(d.nachrichten, true);
  }
  async function nachladen() {
    if (!kanal) return;
    try { const d = await holen('/api/komm/nachrichten?kanal=' + encodeURIComponent(kanal) + '&seit=' + letzteId); anhaengen(d.nachrichten); } catch (e) { /* still */ }
  }
  function anhaengen(l, neu) {
    const v = $('#kommVerlauf'); if (!v) return;
    if (neu) v.innerHTML = l.length ? '' : '<div class="leise klein" style="text-align:center;padding:1rem">Noch keine Nachricht.</div>';
    l.forEach(function (n) {
      if (n.id <= letzteId) return; letzteId = n.id;
      const eigen = n.von === stand.ich, e = document.createElement('div');
      e.className = n.system ? 'komm-system' : 'komm-blase' + (eigen ? ' eigen' : '');
      e.innerHTML = n.system ? esc(n.text) + ' · ' + zeit(n.zeit) :
        (eigen ? '' : '<div class="komm-von">' + esc(n.von_name) + '</div>') + (n.text ? '<div style="white-space:pre-wrap">' + esc(n.text) + '</div>' : '') + (n.foto ? '<a href="/fotos/' + esc(n.foto) + '" target="_blank"><img src="/fotos/' + esc(n.foto) + '" alt="Foto" loading="lazy"></a>' : '') +
        '<div class="komm-fuss">' + (n.objekt ? '<span class="marke">' + esc(n.objekt) + '</span> ' : '') + (n.mangel_id ? '<span class="marke rot">Mangel</span> ' : '') + zeit(n.zeit) +
        (buero() ? ' · <a href="" data-aufgabe="' + n.id + '">Aufgabe</a>' + (!n.mangel_id && n.text ? ' · <a href="" data-mangel="' + n.id + '">Mangel</a>' : '') : '') + '</div>';
      v.appendChild(e);
      const a = $('[data-aufgabe]', e); if (a) a.onclick = function (x) { x.preventDefault(); ausNachricht(n); };
      const m = $('[data-mangel]', e); if (m) m.onclick = function (x) { x.preventDefault(); alsMangel(n); };
    });
    v.scrollTop = v.scrollHeight;
  }
  function verkleinern(datei) {   // Handyfotos auf ≤ 1600 px, JPEG — hält Chat und Server schlank
    return new Promise(function (ok) {
      const img = new Image(), url = URL.createObjectURL(datei);
      img.onload = function () { const s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82)); };
      img.src = url;
    });
  }
  // Büro: Nachricht → Aufgabe (Planner) oder → Mangel
  async function ausNachricht(n) {
    if (!window.GW) return;
    const [boards, obj] = await Promise.all([holen('/api/planner/boards'), window.GW.objekteListe()]);
    const G = window.GW;
    G.schublade('<h2>Aufgabe aus Nachricht</h2><p class="leise klein">„' + esc((n.text || 'Foto').slice(0, 140)) + '" — ' + esc(n.von_name) + '</p><div class="formular" style="margin-top:1rem">' +
      G.auswahl('board_id', 'Board', boards.map(function (b) { return [b.id, b.name]; }), boards[0] && boards[0].id) + G.feld('titel', 'Aufgabe', (n.text || '').split('\n')[0].slice(0, 90)) +
      G.auswahl('zustaendig', 'Zuständig', [['', '— offen —']].concat(stand.personen.map(function (p) { return [p.id, p.name + ' · ' + p.art]; })).concat([[stand.ich, 'ich selbst']]), n.von !== stand.ich && n.von !== 'system' ? '' : '') +
      G.feld('faellig', 'Fällig', '', 'date') + G.auswahl('prioritaet', 'Priorität', [['mittel', 'mittel'], ['hoch', 'hoch'], ['dringend', 'dringend'], ['niedrig', 'niedrig']], 'mittel') + G.auswahl('objekt_id', 'Objekt', [['', '—']].concat(obj.map(function (o) { return [o.id, o.name]; })), n.objekt_id || '') +
      '<label class="feld" style="grid-column:1/-1">Beschreibung<textarea name="beschreibung" rows="3">' + esc(n.text || '') + '</textarea></label></div>' + G.knoepfe('Aufgabe anlegen'), function (w) {
      $('#speichern', w).onclick = async function () { const d = G.formDaten(w); d.nachricht_id = n.id; try { await holen('/api/planner/aufgabe', d); G.schubladeZu(); meldung('Aufgabe angelegt'); aktualisieren(); } catch (e) { meldung(e.message); } };
    });
  }
  async function alsMangel(n) {
    const obj = await window.GW.objekteListe(), G = window.GW;
    G.schublade('<h2>Als Mangel erfassen</h2><p class="leise klein">„' + esc(n.text.slice(0, 140)) + '"</p><div class="formular" style="margin-top:1rem">' + G.auswahl('objekt_id', 'Objekt', obj.filter(function (o) { return o.status === 'aktiv'; }).map(function (o) { return [o.id, o.name]; }), n.objekt_id || '') + '</div>' + G.knoepfe('Erfassen'), function (w) {
      $('#speichern', w).onclick = async function () { try { await holen('/api/komm/als-mangel', { nachricht_id: n.id, objekt_id: $('[name=objekt_id]', w).value }); G.schubladeZu(); meldung('Mangel erfasst'); if (kanal) chat(kanal); } catch (e) { meldung(e.message); } };
    });
  }

  // ---------- Meine Aufgaben
  async function aufgaben() {
    const w = $('#kommInhalt'), l = await holen('/api/planner/meine');
    w.innerHTML = l.length ? l.map(function (a) {
      const ueber = !a.erledigt && a.faellig && a.faellig < heute();
      return '<div class="komm-aufgabe' + (a.erledigt ? ' fertig' : '') + '"><input type="checkbox" data-erl="' + a.id + '"' + (a.erledigt ? ' checked' : '') + ' aria-label="erledigt"><button data-auf="' + a.id + '"><b>' + esc(a.titel) + '</b><br><span class="leise klein">' + esc(a.board) + (a.objekt ? ' · ' + esc(a.objekt) : '') + (a.punkte ? ' · ☑ ' + a.punkteFertig + '/' + a.punkte : '') + (a.kommentare ? ' · 💬 ' + a.kommentare : '') + '</span></button>' +
        '<span style="text-align:right">' + (a.faellig ? '<span class="klein" style="' + (ueber ? 'color:var(--rot);font-weight:700' : '') + '">' + datumDe(a.faellig) + '</span><br>' : '') + '<span class="marke ' + PRIO[a.prioritaet][1] + '">' + esc(PRIO[a.prioritaet][0]) + '</span></span></div>';
    }).join('') : '<div class="leise" style="padding:1.2rem;text-align:center">Keine offenen Aufgaben.</div>';
    $$('[data-erl]', w).forEach(function (c) { c.onchange = async function () { try { await holen('/api/planner/erledigt', { id: Number(c.dataset.erl), erledigt: c.checked }); meldung(c.checked ? 'Erledigt' : 'Wieder offen'); aktualisieren(); aufgaben(); } catch (e) { meldung(e.message); } }; });
    $$('[data-auf]', w).forEach(function (b) { b.onclick = function () { aufgabe(Number(b.dataset.auf)); }; });
  }
  async function aufgabe(id) {
    const w = $('#kommInhalt'), a = await holen('/api/planner/aufgabe?id=' + id);
    w.innerHTML = '<div class="komm-chatkopf"><button id="kommZurueck">‹</button><b>' + esc(a.titel) + '</b></div><div style="padding:.8rem;overflow:auto;flex:1">' +
      '<div class="leise klein">' + esc(a.board) + (a.objekt ? ' · ' + esc(a.objekt) : '') + (a.faellig ? ' · fällig ' + datumDe(a.faellig) : '') + ' · von ' + esc(a.angelegt_von_name || '—') + '</div>' + (a.beschreibung ? '<p style="white-space:pre-wrap">' + esc(a.beschreibung) + '</p>' : '') +
      (a.punkte.length ? '<div class="ueberzeile" style="margin-top:.6rem">Checkliste</div>' + a.punkte.map(function (p) { return '<label style="display:flex;gap:.5rem;padding:.2rem 0"><input type="checkbox" data-punkt="' + p.id + '"' + (p.erledigt ? ' checked' : '') + '> ' + esc(p.text) + '</label>'; }).join('') : '') +
      '<div class="ueberzeile" style="margin-top:.8rem">Kommentare</div>' + (a.kommentare.map(function (k) { return '<div class="komm-system" style="text-align:left"><b>' + esc(k.von_name) + '</b> · ' + zeit(k.zeit) + '<br>' + esc(k.text) + '</div>'; }).join('') || '<div class="leise klein">Noch keine.</div>') +
      '<div style="display:flex;gap:.4rem;margin-top:.6rem"><input id="kommKom" placeholder="Kommentar …" style="flex:1"><button class="knopf klein" id="kommKomSenden">OK</button></div>' +
      '<button class="knopf ' + (a.erledigt ? 'zweit' : '') + '" id="kommAufErl" style="margin-top:1rem;width:100%">' + (a.erledigt ? 'Wieder öffnen' : 'Erledigt') + '</button></div>';
    $('#kommZurueck').onclick = aufgaben;
    $$('[data-punkt]', w).forEach(function (c) { c.onchange = function () { holen('/api/planner/punkt', { aufgabe_id: a.id, id: Number(c.dataset.punkt), erledigt: c.checked }).catch(function (e) { meldung(e.message); }); }; });
    $('#kommKomSenden').onclick = async function () { const t = $('#kommKom').value.trim(); if (!t) return; try { await holen('/api/planner/kommentar', { aufgabe_id: a.id, text: t }); aufgabe(a.id); } catch (e) { meldung(e.message); } };
    $('#kommAufErl').onclick = async function () { try { await holen('/api/planner/erledigt', { id: a.id, erledigt: !a.erledigt }); meldung(a.erledigt ? 'Wieder offen' : 'Erledigt'); aktualisieren(); aufgaben(); } catch (e) { meldung(e.message); } };
  }

  // ---------- Start: erst nach der Anmeldung (in der App passiert die ohne Neuladen)
  async function starten() {
    try { const j = await UI.ich(); if (!j || (j.rolle !== 'buero' && j.rolle !== 'mitarbeiter')) throw 0; ich = j; }
    catch (e) { setTimeout(starten, 8000); return; }
    bauen(); await aktualisieren();
    takt = setInterval(function () { if (!document.hidden) aktualisieren(); }, 15000);
  }
  // Seitenwechsel im Büro schließt den Chat (am Handy liegt er sonst über der neuen Seite)
  window.addEventListener('hashchange', function () { if (!offen) return; offen = false; const p = document.getElementById('kommPanel'); if (p) p.hidden = true; });
  window.KOMM = { direkt: direkt, aktualisieren: aktualisieren };
  if (!/\/(anmelden|einrichten|kunde)/.test(location.pathname)) starten();
})();
