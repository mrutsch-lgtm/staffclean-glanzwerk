// app.js — Glanzwerk Mitarbeiter-App: Anmelden mit PIN → Heute (Schichten, Vertretungsanfragen, Objekte)
// → Objekt (Kommen/Gehen stempeln am Standort, Raum per QR-Code öffnen) → Raum (abhaken, Foto) · Mangel melden.
// Handy zuerst: große Tippflächen, ein Schritt je Bildschirm, Texte in der eigenen Sprache.
// Ohne Netz: Häkchen werden auf dem Gerät gemerkt und nachgereicht, sobald wieder Netz da ist.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, ICON } = UI;
  const W = {
    de: { hallo: 'Hallo', aufgaben: 'Aufgaben', erledigt: 'erledigt', raeume: 'Räume', mangel: 'Mangel melden', wer: 'Wer bist du?', pin: 'Deine PIN', nichts: 'Heute stehen für dich keine Aufgaben an.', fertig: 'Alles erledigt — danke dir!', foto: 'Foto', anleitung: 'So geht’s', senden: 'Senden', was: 'Was ist dir aufgefallen?', gemeldet: 'Danke, der Mangel ist gemeldet.', kommen: 'Kommen', gehen: 'Gehen', da: 'eingestempelt seit', weg: 'ausgestempelt um', scannen: 'Raum-Code scannen', schichten: 'Meine Schichten', bestaetigen: 'Bestätigen', bestaetigt: 'bestätigt', anfrage: 'Kannst du einspringen?', ja: 'Ja, mache ich', nein: 'Nein', abmelden: 'Abmelden', frei: 'Du bist heute als abwesend eingetragen', standort: 'Standort wird ermittelt …', offline: 'Ohne Netz — wird nachgereicht', nachgereicht: 'Nachgereicht', pause: 'Pause in Minuten', code: 'Code eintippen', kamera: 'Kamera nicht verfügbar — Code bitte eintippen', falsch: 'PIN stimmt nicht', vorort: 'Vor Ort per Code bestätigt' },
    pl: { hallo: 'Cześć', aufgaben: 'zadania', erledigt: 'zrobione', raeume: 'pomieszczenia', mangel: 'Zgłoś usterkę', wer: 'Kim jesteś?', pin: 'Twój PIN', nichts: 'Na dziś nie masz zadań.', fertig: 'Wszystko zrobione — dziękujemy!', foto: 'Zdjęcie', anleitung: 'Jak to zrobić', senden: 'Wyślij', was: 'Co zauważyłeś/aś?', gemeldet: 'Dziękujemy, usterka została zgłoszona.', kommen: 'Przyjście', gehen: 'Wyjście', da: 'na miejscu od', weg: 'wyjście o', scannen: 'Zeskanuj kod pomieszczenia', schichten: 'Moje zmiany', bestaetigen: 'Potwierdź', bestaetigt: 'potwierdzone', anfrage: 'Czy możesz zastąpić?', ja: 'Tak', nein: 'Nie', abmelden: 'Wyloguj', frei: 'Dziś jesteś zapisany/a jako nieobecny/a', standort: 'Ustalanie lokalizacji …', offline: 'Brak sieci — zostanie wysłane później', nachgereicht: 'Wysłano', pause: 'Przerwa w minutach', code: 'Wpisz kod', kamera: 'Kamera niedostępna — wpisz kod', falsch: 'Błędny PIN', vorort: 'Potwierdzone kodem na miejscu' },
    ro: { hallo: 'Bună', aufgaben: 'sarcini', erledigt: 'gata', raeume: 'încăperi', mangel: 'Raportează o problemă', wer: 'Cine ești?', pin: 'PIN-ul tău', nichts: 'Azi nu ai sarcini.', fertig: 'Totul gata — mulțumim!', foto: 'Poză', anleitung: 'Cum se face', senden: 'Trimite', was: 'Ce ai observat?', gemeldet: 'Mulțumim, problema a fost raportată.', kommen: 'Sosire', gehen: 'Plecare', da: 'prezent de la', weg: 'plecat la', scannen: 'Scanează codul camerei', schichten: 'Turele mele', bestaetigen: 'Confirmă', bestaetigt: 'confirmat', anfrage: 'Poți înlocui?', ja: 'Da', nein: 'Nu', abmelden: 'Deconectare', frei: 'Azi ești trecut/ă ca absent/ă', standort: 'Se determină locația …', offline: 'Fără rețea — se trimite mai târziu', nachgereicht: 'Trimis', pause: 'Pauză în minute', code: 'Introdu codul', kamera: 'Camera indisponibilă — introdu codul', falsch: 'PIN greșit', vorort: 'Confirmat la fața locului prin cod' },
    en: { hallo: 'Hello', aufgaben: 'tasks', erledigt: 'done', raeume: 'rooms', mangel: 'Report an issue', wer: 'Who are you?', pin: 'Your PIN', nichts: 'No tasks for you today.', fertig: 'All done — thank you!', foto: 'Photo', anleitung: 'How to', senden: 'Send', was: 'What did you notice?', gemeldet: 'Thanks, the issue has been reported.', kommen: 'Clock in', gehen: 'Clock out', da: 'clocked in since', weg: 'clocked out at', scannen: 'Scan room code', schichten: 'My shifts', bestaetigen: 'Confirm', bestaetigt: 'confirmed', anfrage: 'Can you cover?', ja: 'Yes', nein: 'No', abmelden: 'Log out', frei: 'You are marked as absent today', standort: 'Getting location …', offline: 'Offline — will be sent later', nachgereicht: 'Sent', pause: 'Break in minutes', code: 'Type code', kamera: 'Camera not available — please type the code', falsch: 'Wrong PIN', vorort: 'Confirmed on site by code' }
  };
  let ich = null;
  const t = k => ((ich && W[ich.sprache]) || W.de)[k] || W.de[k];
  const app = $('#app'), titel = $('#apptitel'), zurueck = $('#zurueck');
  let stapel = [], plan = null;
  const perQr = {};
  function titelSetzen(h, u) { titel.innerHTML = esc(h) + (u ? '<small>' + esc(u) + '</small>' : ''); $('#logo').hidden = !!stapel.length; zurueck.hidden = !stapel.length; }
  zurueck.onclick = function () { scanStopp(); const f = stapel.pop(); if (f) f(); };
  const sym = (n, g) => ICON[n].replace('<svg', '<svg width="' + (g || 18) + '" height="' + (g || 18) + '"');

  // ------------------------------------------------ Offline-Warteschlange (Häkchen)
  const SCHL = 'gw-warteschlange';
  const schlange = () => { try { return JSON.parse(localStorage.getItem(SCHL) || '[]'); } catch (e) { return []; } };
  const schlangeSetzen = l => { try { localStorage.setItem(SCHL, JSON.stringify(l)); } catch (e) {} };
  async function senden(pfad, daten) {
    try { return await holen(pfad, daten); }
    catch (e) {
      if (!(e instanceof TypeError)) throw e;   // TypeError = kein Netz; alles andere ist eine Antwort vom Server
      const l = schlange(); l.push({ pfad: pfad, daten: daten }); schlangeSetzen(l); meldung(t('offline')); return { offline: true };
    }
  }
  async function nachreichen() {
    const l = schlange(); if (!l.length) return; const rest = [];
    for (const x of l) { try { await holen(x.pfad, x.daten); } catch (e) { if (e instanceof TypeError) rest.push(x); } }
    schlangeSetzen(rest); if (rest.length < l.length) meldung(t('nachgereicht') + ': ' + (l.length - rest.length));
  }
  window.addEventListener('online', function () { nachreichen().then(function () { if (ich && !stapel.length) start(); }); });

  // ------------------------------------------------ Anmelden: Person wählen, PIN tippen
  async function wer() {
    stapel = []; ich = null; titelSetzen('');
    const l = await holen('/api/app/personen');
    app.innerHTML = '<div class="app-gruss"><div style="color:#b8d4c8">Glanzwerk</div><h2 style="margin:.3rem 0 0;color:#fff">' + esc(W.de.wer) + '</h2></div>' +
      (l.length ? l.map(function (m) { return '<button class="kachel" data-id="' + m.id + '"><span class="symbolkasten" style="margin:0">' + ICON.person + '</span><span><b>' + esc(m.name) + '</b></span></button>'; }).join('') : '<div class="karte leer">Noch niemand mit PIN angelegt — bitte im Büro melden.</div>') +
      '<p class="leise klein" style="text-align:center">Büro? <a href="/anmelden">Hier anmelden</a></p>';
    $$('[data-id]').forEach(function (k) { k.onclick = function () { stapel.push(wer); pinEingabe(l.find(function (x) { return x.id === Number(k.dataset.id); })); }; });
  }
  function pinEingabe(m) {
    titelSetzen(m.name, W.de.pin);
    let pin = '';
    app.innerHTML = '<div class="karte" style="text-align:center"><div class="ueberzeile">' + esc(W.de.pin) + '</div><div class="pinpunkte" id="punkte"></div><div id="pinFehler" style="color:var(--rot);min-height:1.3em;font-weight:600"></div>' +
      '<div class="ziffern">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map(function (z) { return '<button data-z="' + z + '"' + (z === '✓' ? ' class="los"' : '') + ' aria-label="' + (z === '⌫' ? 'löschen' : z === '✓' ? 'anmelden' : z) + '">' + z + '</button>'; }).join('') + '</div></div>';
    const zeigen = () => { $('#punkte').innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].slice(0, Math.max(4, pin.length)).map(function (i) { return '<i' + (i < pin.length ? ' class="an"' : '') + '></i>'; }).join(''); };
    zeigen();
    async function los() {
      if (pin.length < 4) return;
      try { const r = await holen('/api/app/anmelden', { mitarbeiter_id: m.id, pin: pin }); ich = { name: r.name, sprache: r.sprache }; await nachreichen(); start(); }
      catch (e) { pin = ''; zeigen(); $('#pinFehler').textContent = /PIN/.test(e.message) ? W.de.falsch : e.message; if (navigator.vibrate) navigator.vibrate([40, 60, 40]); }
    }
    $$('[data-z]').forEach(function (b) { b.onclick = function () { const z = b.dataset.z; $('#pinFehler').textContent = ''; if (z === '⌫') pin = pin.slice(0, -1); else if (z === '✓') return los(); else if (pin.length < 8) pin += z; zeigen(); }; });
  }

  // ------------------------------------------------ Heute
  async function start() {
    stapel = []; scanStopp();
    const [p, schichten] = await Promise.all([holen('/api/app/tag?datum=' + heute()), holen('/api/app/schichten')]);
    plan = p; titelSetzen('');
    const q = plan.soll ? Math.round(plan.fertig * 100 / plan.soll) : 0;
    app.innerHTML = '<div class="app-gruss"><div style="color:#b8d4c8">' + esc(t('hallo')) + ' ' + esc(ich.name.split(' ')[0]) + ' · ' + esc(UI.tagLang(plan.datum)) + '</div>' +
      '<div class="zeile" style="margin-top:.6rem;align-items:end"><div><div class="zahl">' + plan.fertig + '<span style="font-size:1.2rem;color:#b8d4c8"> / ' + plan.soll + '</span></div><div style="color:#b8d4c8">' + esc(t('aufgaben')) + ' ' + esc(t('erledigt')) + '</div></div><span class="pille gruen">' + q + ' %</span></div>' +
      '<div class="fortschritt" style="background:rgba(255,255,255,.15)"><i style="width:' + q + '%"></i></div></div>' +
      (plan.abwesend ? '<div class="hinweis">' + esc(t('frei')) + ' (' + esc(plan.abwesend.art) + ')</div>' : '') +
      plan.angebote.map(function (a) { return '<div class="karte akzentlinie"><b>' + esc(t('anfrage')) + '</b><div>' + esc(a.objekt) + ' · ' + esc(UI.tagLang(a.datum)) + '</div><div style="display:flex;gap:.5rem;margin-top:.7rem"><button class="knopf" data-antwort="ja" data-v="' + a.id + '" style="flex:1">' + esc(t('ja')) + '</button><button class="knopf zweit" data-antwort="nein" data-v="' + a.id + '" style="flex:1">' + esc(t('nein')) + '</button></div></div>'; }).join('') +
      (plan.objekte.length ? plan.objekte.map(function (o) { const r = o.soll ? Math.round(o.fertig * 100 / o.soll) : 0; return '<button class="kachel" data-o="' + o.id + '"><span class="rund" style="--p:' + r + '"><span>' + r + '%</span></span><span style="flex:1"><b>' + esc(o.name) + '</b><br><span class="leise klein">' + esc([o.strasse, o.ort].filter(Boolean).join(', ')) + '</span><br><span class="klein">' + o.raeume.length + ' ' + esc(t('raeume')) + ' · ' + o.fertig + '/' + o.soll + '</span>' + (o.zeit ? '<br><span class="marke' + (o.zeit.gehen ? ' grau' : '') + '">' + esc(o.zeit.gehen ? t('weg') + ' ' + o.zeit.gehen.slice(11, 16) : t('da') + ' ' + o.zeit.kommen.slice(11, 16)) + '</span>' : '') + '</span></button>'; }).join('') : '<div class="karte leer">' + esc(t('nichts')) + '</div>') +
      '<div class="ueberzeile" style="margin-top:.6rem">' + esc(t('schichten')) + '</div>' +
      (schichten.length ? schichten.map(function (s) { return '<div class="karte zeile" style="padding:.8rem 1rem"><div><b>' + esc(UI.tagLang(s.datum)) + '</b> · ' + esc(s.beginn + '–' + s.ende) + '<div class="leise klein">' + esc(s.objekt) + (s.ort ? ' · ' + esc(s.ort) : '') + (s.notiz ? ' · ' + esc(s.notiz) : '') + '</div></div>' + (s.status === 'bestätigt' ? '<span class="marke">✓ ' + esc(t('bestaetigt')) + '</span>' : '<button class="knopf klein" data-bestaetigen="' + s.id + '">' + esc(t('bestaetigen')) + '</button>') + '</div>'; }).join('') : '<div class="leise klein">–</div>') +
      '<button class="knopf zweit" id="abmelden" style="margin-top:.5rem">' + esc(t('abmelden')) + '</button>';
    $$('[data-o]').forEach(function (k) { k.onclick = function () { stapel.push(start); objekt(Number(k.dataset.o)); }; });
    $$('[data-antwort]').forEach(function (b) { b.onclick = async function () { try { await holen('/api/app/vertretung', { id: Number(b.dataset.v), antwort: b.dataset.antwort }); start(); } catch (e) { meldung(e.message); } }; });
    $$('[data-bestaetigen]').forEach(function (b) { b.onclick = async function () { try { await holen('/api/app/schicht', { id: Number(b.dataset.bestaetigen) }); meldung('✓'); start(); } catch (e) { meldung(e.message); } }; });
    $('#abmelden').onclick = async function () { try { await holen('/api/abmelden', {}); } catch (e) {} wer(); };
  }
  async function neuLaden() { plan = await holen('/api/app/tag?datum=' + plan.datum); }

  // ------------------------------------------------ Objekt: Stempeln, QR, Räume
  function objekt(id) {
    const o = plan.objekte.find(function (x) { return x.id === id; }); if (!o) return start();
    titelSetzen(o.name, o.fertig + '/' + o.soll + ' ' + t('erledigt'));
    const drin = !!(o.zeit && !o.zeit.gehen);
    app.innerHTML = '<div class="karte"><div>' + sym('uhr', 22) + ' <b>' + esc(drin ? t('da') + ' ' + o.zeit.kommen.slice(11, 16) : o.zeit ? t('weg') + ' ' + o.zeit.gehen.slice(11, 16) : '—') + '</b></div>' +
      (drin ? '<label class="feld" style="margin-top:.6rem">' + esc(t('pause')) + '<input id="pause" type="number" min="0" step="5" value="0" inputmode="numeric"></label>' : '') +
      '<button class="knopf' + (drin ? ' gold' : '') + '" id="stempeln" style="width:100%;margin-top:.7rem;padding:1rem">' + esc(drin ? t('gehen') : t('kommen')) + '</button></div>' +
      '<button class="kachel" id="scan"><span class="symbolkasten" style="margin:0">' + ICON.kamera + '</span><span><b>' + esc(t('scannen')) + '</b></span></button>' +
      o.raeume.map(function (r) { const f = r.aufgaben.filter(function (a) { return a.erledigt; }).length, q = Math.round(f * 100 / r.aufgaben.length); return '<button class="kachel" data-r="' + r.id + '"><span class="rund" style="--p:' + q + '"><span>' + f + '/' + r.aufgaben.length + '</span></span><span style="flex:1"><b>' + esc(r.name) + '</b><br><span class="leise klein">' + esc([r.etage, r.belag].filter(Boolean).join(' · ')) + '</span></span></button>'; }).join('') +
      '<div class="app-fuss"><button class="knopf zweit" id="mangel">' + sym('warnung') + ' ' + esc(t('mangel')) + '</button></div>';
    $$('[data-r]').forEach(function (k) { k.onclick = function () { stapel.push(function () { objekt(id); }); raum(o, Number(k.dataset.r)); }; });
    $('#mangel').onclick = function () { stapel.push(function () { objekt(id); }); mangel(o, null); };
    $('#scan').onclick = function () { stapel.push(function () { objekt(id); }); scannen(o); };
    $('#stempeln').onclick = async function () {
      const b = this; b.disabled = true; b.textContent = t('standort');
      const pos = await standort();
      try {
        const r = await holen('/api/app/stempeln', { objekt_id: o.id, art: drin ? 'gehen' : 'kommen', lat: pos && pos.lat, lon: pos && pos.lon, pause: drin ? Number($('#pause').value) || 0 : 0 });
        if (navigator.vibrate) navigator.vibrate(30); meldung((r.art === 'kommen' ? t('kommen') : t('gehen')) + ' ' + r.zeit + (r.abstand != null ? ' · ' + r.abstand + ' m' : ''));
        await neuLaden(); objekt(id);
      } catch (e) { meldung(e.message); b.disabled = false; b.textContent = drin ? t('gehen') : t('kommen'); }
    };
  }
  function standort() {
    return new Promise(function (ok) {
      if (!navigator.geolocation) return ok(null);
      navigator.geolocation.getCurrentPosition(function (p) { ok({ lat: p.coords.latitude, lon: p.coords.longitude }); }, function () { ok(null); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
    });
  }

  // ------------------------------------------------ QR-Code scannen (jsQR, Rückkamera) — ersatzweise eintippen
  // Ein Scan-Lauf hat eine Nummer: endet der Lauf (Code getippt, zurück), verwirft jeder spätere Schritt sich selbst —
  // auch eine Kamera, die erst danach freigegeben wird. Ausgewertet werden ~8 Bilder je Sekunde, höchstens 640 px breit.
  let strom = null, schleife = null, lauf = 0;
  function scanStopp() { lauf++; clearTimeout(schleife); schleife = null; if (strom) strom.getTracks().forEach(function (s) { s.stop(); }); strom = null; }
  function jsqrLaden() { return window.jsQR ? Promise.resolve() : new Promise(function (ok, nein) { const s = document.createElement('script'); s.src = '/js/jsQR.js'; s.onload = ok; s.onerror = nein; document.head.appendChild(s); }); }
  async function codeOeffnen(text) {
    const code = String(text || '').trim().replace(/^GW:/i, '');
    if (!code) return;
    try {
      const r = await holen('/api/app/raum-code?code=' + encodeURIComponent(code));
      scanStopp(); if (navigator.vibrate) navigator.vibrate(30);
      await neuLaden(); const o2 = plan.objekte.find(function (x) { return x.id === r.objekt_id; });
      if (!o2 || !o2.raeume.some(function (x) { return x.id === r.raum_id; })) { meldung(r.raum + ': ' + t('nichts')); return; }
      perQr[r.raum_id] = true; stapel.pop(); stapel.push(function () { objekt(o2.id); }); raum(o2, r.raum_id);
    } catch (e) { meldung(e.message); }
  }
  async function scannen(o) {
    titelSetzen(t('scannen'), o.name);
    app.innerHTML = '<div class="scanner"><video id="video" playsinline muted></video><div class="rahmen"></div></div><div id="scanHinweis" class="leise klein" style="text-align:center"></div>' +
      '<div class="karte"><label class="feld">' + esc(t('code')) + '<input id="codeText" autocomplete="off" autocapitalize="characters"></label><button class="knopf" id="codeLos" style="width:100%;margin-top:.6rem">OK</button></div>';
    $('#codeLos').onclick = function () { codeOeffnen($('#codeText').value); };
    scanStopp(); const meinLauf = lauf;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('keine Kamera');
      await jsqrLaden();
      const s0 = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const v = $('#video');
      if (meinLauf !== lauf || !v) { s0.getTracks().forEach(function (s) { s.stop(); }); return; }
      strom = s0; v.srcObject = strom; await v.play();
      const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
      let belegt = false;
      const schritt = function () {
        if (meinLauf !== lauf || !strom) return;
        if (v.readyState >= 2 && v.videoWidth && !belegt) {
          const m = Math.min(1, 640 / v.videoWidth); c.width = Math.round(v.videoWidth * m); c.height = Math.round(v.videoHeight * m); x.drawImage(v, 0, 0, c.width, c.height);
          const f = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' });
          if (f && /^GW:/.test(f.data || '')) { belegt = true; codeOeffnen(f.data).then(function () { belegt = false; }); }
        }
        schleife = setTimeout(schritt, 120);
      };
      schritt();
    } catch (e) {
      if (meinLauf !== lauf) return;
      scanStopp(); const h = $('#scanHinweis'); if (h) h.textContent = t('kamera'); const s = $('.scanner'); if (s) s.hidden = true;
    }
  }

  // ------------------------------------------------ Raum: abhaken, Foto
  function raum(o, rid) {
    const r = o.raeume.find(function (x) { return x.id === rid; });
    const f = r.aufgaben.filter(function (a) { return a.erledigt; }).length;
    titelSetzen(r.name, o.name + ' · ' + f + '/' + r.aufgaben.length);
    app.innerHTML = (perQr[rid] ? '<div class="hinweis gruen" style="font-weight:600">' + sym('haken') + ' ' + esc(t('vorort')) + '</div>' : '') + r.aufgaben.map(function (a, i) {
      return '<div class="aufgabe' + (a.erledigt ? ' fertig' : '') + '"><button class="haken" data-i="' + i + '" aria-label="' + esc(t('erledigt')) + '">' + (a.erledigt ? ICON.haken : '') + '</button><div style="flex:1"><div class="was">' + esc(a.taetigkeit) + '</div><div class="leise klein">' + esc(a.turnus) + (a.minuten ? ' · ca. ' + Math.round(a.minuten) + ' Min.' : '') + (a.erledigt ? ' · ✓ ' + esc(a.erledigt.zeit.slice(11, 16)) : '') + (a.erledigt && a.erledigt.foto ? ' · ' + esc(t('foto')) + ' ✓' : '') + '</div>' +
        (a.anleitung ? '<details><summary>' + esc(t('anleitung')) + '</summary>' + esc(a.anleitung) + '</details>' : '') + '</div><button class="knopf zweit klein" data-foto="' + i + '" aria-label="' + esc(t('foto')) + '">' + sym('kamera') + '</button></div>';
    }).join('') + (f === r.aufgaben.length ? '<div class="hinweis gruen" style="text-align:center;font-weight:700">' + esc(t('fertig')) + '</div>' : '') +
      '<div class="app-fuss"><button class="knopf zweit" id="mangel">' + sym('warnung') + ' ' + esc(t('mangel')) + '</button></div>';
    $$('[data-i]').forEach(function (k) { k.onclick = function () { abhaken(o, r, r.aufgaben[Number(k.dataset.i)], null, k); }; });
    $$('[data-foto]').forEach(function (k) { k.onclick = function () { const inp = $('#foto'); inp.value = ''; inp.onchange = async function () { if (!inp.files[0]) return; abhaken(o, r, r.aufgaben[Number(k.dataset.foto)], await verkleinern(inp.files[0])); }; inp.click(); }; });
    $('#mangel').onclick = function () { stapel.push(function () { raum(o, rid); }); mangel(o, r); };
  }
  async function abhaken(o, r, a, foto, knopf) {
    const weg = !!a.erledigt && !foto;
    if (knopf) knopf.disabled = true;
    try {
      const x = await senden('/api/app/erledigt', { position: a.position, datum: plan.datum, foto: foto, zurueck: weg, per_qr: !!perQr[r.id] });
      if (navigator.vibrate) navigator.vibrate(weg ? 10 : 25);
      if (x.offline) { a.erledigt = weg ? null : { zeit: plan.datum + ' --:--', foto: null }; return raum(o, r.id); }
      await neuLaden();
      raum(plan.objekte.find(function (y) { return y.id === o.id; }), r.id);
      if (foto) meldung(t('foto') + ' ✓');
    } catch (e) { meldung(e.message); if (knopf) knopf.disabled = false; }
  }
  function mangel(o, r) {
    titelSetzen(t('mangel'), o.name + (r ? ' · ' + r.name : ''));
    let foto = null;
    app.innerHTML = '<div class="karte"><label class="feld">' + esc(t('was')) + '<textarea id="mtext" rows="5"></textarea></label><div style="display:flex;gap:.5rem;align-items:center;margin-top:.7rem"><button class="knopf zweit" id="mfoto">' + sym('kamera') + ' ' + esc(t('foto')) + '</button><span id="mfotoOk" class="marke" hidden>✓</span></div></div><div class="app-fuss"><button class="knopf" id="msenden">' + esc(t('senden')) + '</button></div>';
    $('#mfoto').onclick = function () { const inp = $('#foto'); inp.value = ''; inp.onchange = async function () { if (!inp.files[0]) return; foto = await verkleinern(inp.files[0]); $('#mfotoOk').hidden = !foto; }; inp.click(); };
    $('#msenden').onclick = async function () {
      const text = $('#mtext').value.trim(); if (!text) { $('#mtext').focus(); return; }
      try { await holen('/api/app/mangel', { objekt_id: o.id, raum_id: r ? r.id : null, text: text, foto: foto }); meldung(t('gemeldet')); const f = stapel.pop(); if (f) f(); } catch (e) { meldung(e.message); }
    };
  }

  // Fotos am Handy vor dem Hochladen verkleinern (1600 px, JPEG) — spart Datenvolumen
  function verkleinern(datei) {
    return new Promise(function (ok) {
      const img = new Image(), url = URL.createObjectURL(datei);
      img.onload = function () { const s = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = function () { ok(null); }; img.src = url;
    });
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
  (async function () {
    try {
      const j = await UI.ich();
      if (j) {
        if (j.rolle === 'mitarbeiter') { ich = await holen('/api/app/ich'); await nachreichen(); return start(); }
        if (j.rolle === 'buero') { location.href = '/'; return; }
        if (j.rolle === 'kunde') { location.href = '/kunde'; return; }
      }
    } catch (e) {}
    wer().catch(function (e) { app.innerHTML = '<div class="karte hinweis">' + esc(e.message) + '</div>'; });
  })();
})();
