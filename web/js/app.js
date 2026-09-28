// app.js — Mitarbeiter-App: Heute → Objekt → Raum → abhaken (mit Foto), Mangel melden.
// Bedienung für das Handy: große Tippflächen, ein Schritt je Bildschirm, Texte in der eigenen Sprache.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, ICON } = UI;
  const W = {
    de: { hallo: 'Hallo', heute: 'Heute', aufgaben: 'Aufgaben', erledigt: 'erledigt', raeume: 'Räume', mangel: 'Mangel melden', wer: 'Wer bist du?', wechseln: 'Person wechseln', nichts: 'Heute stehen für dich keine Aufgaben an.', fertig: 'Alles erledigt — danke dir!', foto: 'Foto', anleitung: 'So geht’s', senden: 'Senden', was: 'Was ist dir aufgefallen?', gemeldet: 'Danke, der Mangel ist gemeldet.' },
    pl: { hallo: 'Cześć', heute: 'Dzisiaj', aufgaben: 'zadania', erledigt: 'zrobione', raeume: 'pomieszczenia', mangel: 'Zgłoś usterkę', wer: 'Kim jesteś?', wechseln: 'Zmień osobę', nichts: 'Na dziś nie masz zadań.', fertig: 'Wszystko zrobione — dziękujemy!', foto: 'Zdjęcie', anleitung: 'Jak to zrobić', senden: 'Wyślij', was: 'Co zauważyłeś/aś?', gemeldet: 'Dziękujemy, usterka została zgłoszona.' },
    en: { hallo: 'Hello', heute: 'Today', aufgaben: 'tasks', erledigt: 'done', raeume: 'rooms', mangel: 'Report an issue', wer: 'Who are you?', wechseln: 'Switch person', nichts: 'No tasks for you today.', fertig: 'All done — thank you!', foto: 'Photo', anleitung: 'How to', senden: 'Send', was: 'What did you notice?', gemeldet: 'Thanks, the issue has been reported.' }
  };
  let ich = null; try { ich = JSON.parse(localStorage.getItem('sc-ich') || 'null'); } catch (e) {}
  const t = k => (W[ich && W[ich.sprache] ? ich.sprache : 'de'] || W.de)[k] || W.de[k];
  const app = $('#app'), titel = $('#apptitel'), zurueck = $('#zurueck');
  let stapel = [], plan = null;
  function titelSetzen(h, u) { titel.innerHTML = esc(h) + (u ? '<small>' + esc(u) + '</small>' : ''); $('#logo').hidden = !!stapel.length; zurueck.hidden = !stapel.length; }
  zurueck.onclick = function () { const f = stapel.pop(); if (f) f(); };

  async function wer() {
    stapel = []; titelSetzen('');
    const l = await holen('/api/mitarbeiter');
    app.innerHTML = '<div class="app-gruss"><div class="leise" style="color:#b8d4c8">StaffClean</div><h2 style="margin:.3rem 0 0">' + esc(W.de.wer) + '</h2></div>' +
      l.map(function (m) { return '<button class="kachel" data-id="' + m.id + '"><span class="symbolkasten" style="margin:0">' + ICON.person + '</span><span><b>' + esc(m.name) + '</b><br><span class="leise klein">' + esc(m.sprache.toUpperCase()) + '</span></span></button>'; }).join('');
    $$('[data-id]').forEach(function (k) { k.onclick = function () { const m = l.find(function (x) { return x.id === Number(k.dataset.id); }); ich = { id: m.id, name: m.name, sprache: m.sprache }; try { localStorage.setItem('sc-ich', JSON.stringify(ich)); } catch (e) {} start(); }; });
  }

  async function start() {
    stapel = [];
    plan = await holen('/api/tag?datum=' + heute() + '&mitarbeiter=' + ich.id);
    titelSetzen('');
    const p = plan.soll ? Math.round(plan.fertig * 100 / plan.soll) : 0;
    app.innerHTML = '<div class="app-gruss"><div style="color:#b8d4c8">' + esc(t('hallo')) + ' ' + esc(ich.name.split(' ')[0]) + ' · ' + esc(UI.tagLang(plan.datum)) + '</div>' +
      '<div class="zeile" style="margin-top:.6rem;align-items:end"><div><div class="zahl">' + plan.fertig + '<span style="font-size:1.2rem;color:#b8d4c8"> / ' + plan.soll + '</span></div><div style="color:#b8d4c8">' + esc(t('aufgaben')) + ' ' + esc(t('erledigt')) + '</div></div><span class="pille gruen">' + p + ' %</span></div>' +
      '<div class="fortschritt" style="background:rgba(255,255,255,.15)"><i style="width:' + p + '%"></i></div></div>' +
      (plan.objekte.length ? plan.objekte.map(function (o) { const q = o.soll ? Math.round(o.fertig * 100 / o.soll) : 0; return '<button class="kachel" data-o="' + o.id + '"><span class="rund" style="--p:' + q + '"><span>' + q + '%</span></span><span style="flex:1"><b>' + esc(o.name) + '</b><br><span class="leise klein">' + esc([o.strasse, o.ort].filter(Boolean).join(', ')) + '</span><br><span class="klein">' + o.raeume.length + ' ' + esc(t('raeume')) + ' · ' + o.fertig + '/' + o.soll + '</span></span></button>'; }).join('') : '<div class="karte leer">' + esc(t('nichts')) + '</div>') +
      '<button class="knopf zweit" id="wechsel" style="margin-top:.5rem">' + esc(t('wechseln')) + '</button>';
    $$('[data-o]').forEach(function (k) { k.onclick = function () { stapel.push(start); objekt(Number(k.dataset.o)); }; });
    $('#wechsel').onclick = function () { try { localStorage.removeItem('sc-ich'); } catch (e) {} ich = null; wer(); };
  }

  function objekt(id) {
    const o = plan.objekte.find(function (x) { return x.id === id; }); if (!o) return start();
    titelSetzen(o.name, o.fertig + '/' + o.soll + ' ' + t('erledigt'));
    app.innerHTML = o.raeume.map(function (r) { const f = r.aufgaben.filter(function (a) { return a.erledigt; }).length, q = Math.round(f * 100 / r.aufgaben.length); return '<button class="kachel" data-r="' + r.id + '"><span class="rund" style="--p:' + q + '"><span>' + f + '/' + r.aufgaben.length + '</span></span><span style="flex:1"><b>' + esc(r.name) + '</b><br><span class="leise klein">' + esc([r.etage, r.belag].filter(Boolean).join(' · ')) + '</span></span></button>'; }).join('') +
      '<div class="app-fuss"><button class="knopf zweit" id="mangel">' + ICON.warnung.replace('<svg', '<svg width="18" height="18"') + ' ' + esc(t('mangel')) + '</button></div>';
    $$('[data-r]').forEach(function (k) { k.onclick = function () { stapel.push(function () { objekt(id); }); raum(o, Number(k.dataset.r)); }; });
    $('#mangel').onclick = function () { stapel.push(function () { objekt(id); }); mangel(o, null); };
  }

  function raum(o, rid) {
    const r = o.raeume.find(function (x) { return x.id === rid; });
    const f = r.aufgaben.filter(function (a) { return a.erledigt; }).length;
    titelSetzen(r.name, o.name + ' · ' + f + '/' + r.aufgaben.length);
    app.innerHTML = r.aufgaben.map(function (a, i) {
      return '<div class="aufgabe' + (a.erledigt ? ' fertig' : '') + '"><button class="haken" data-i="' + i + '" aria-label="erledigt">' + (a.erledigt ? ICON.haken : '') + '</button><div style="flex:1"><div class="was">' + esc(a.taetigkeit) + '</div><div class="leise klein">' + esc(a.turnus) + (a.minuten ? ' · ca. ' + Math.round(a.minuten) + ' Min.' : '') + (a.erledigt ? ' · ✓ ' + esc(a.erledigt.zeit.slice(11, 16)) : '') + '</div>' +
        (a.anleitung ? '<details><summary>' + esc(t('anleitung')) + '</summary>' + esc(a.anleitung) + '</details>' : '') + '</div><button class="knopf zweit klein" data-foto="' + i + '" aria-label="' + esc(t('foto')) + '">' + ICON.kamera.replace('<svg', '<svg width="18" height="18"') + '</button></div>';
    }).join('') + (f === r.aufgaben.length ? '<div class="hinweis gruen" style="text-align:center;font-weight:700">' + esc(t('fertig')) + '</div>' : '') +
      '<div class="app-fuss"><button class="knopf zweit" id="mangel">' + esc(t('mangel')) + '</button></div>';
    $$('[data-i]').forEach(function (k) { k.onclick = function () { abhaken(o, r, r.aufgaben[Number(k.dataset.i)], null); }; });
    $$('[data-foto]').forEach(function (k) { k.onclick = function () { const inp = $('#foto'); inp.value = ''; inp.onchange = async function () { if (!inp.files[0]) return; abhaken(o, r, r.aufgaben[Number(k.dataset.foto)], await verkleinern(inp.files[0])); }; inp.click(); }; });
    $('#mangel').onclick = function () { stapel.push(function () { raum(o, rid); }); mangel(o, r); };
  }

  async function abhaken(o, r, a, foto) {
    const zurueck = !!a.erledigt && !foto;
    try {
      await holen('/api/erledigt', { position: a.position, datum: plan.datum, mitarbeiter: ich.id, foto: foto, zurueck: zurueck });
      if (navigator.vibrate) navigator.vibrate(zurueck ? 10 : 25);
      plan = await holen('/api/tag?datum=' + plan.datum + '&mitarbeiter=' + ich.id);
      const o2 = plan.objekte.find(function (x) { return x.id === o.id; }); raum(o2, r.id);
      if (foto) meldung(t('foto') + ' ✓');
    } catch (e) { meldung(e.message); }
  }

  function mangel(o, r) {
    titelSetzen(t('mangel'), o.name + (r ? ' · ' + r.name : ''));
    app.innerHTML = '<div class="karte"><label class="feld">' + esc(t('was')) + '<textarea id="mtext" rows="5"></textarea></label></div><div class="app-fuss"><button class="knopf" id="msenden">' + esc(t('senden')) + '</button></div>';
    $('#msenden').onclick = async function () { const text = $('#mtext').value.trim(); if (!text) return; await holen('/api/mangel', { objekt_id: o.id, raum_id: r ? r.id : null, text: text, von: ich.name }); meldung(t('gemeldet')); const f = stapel.pop(); if (f) f(); };
  }

  // Fotos am Handy vor dem Hochladen verkleinern (1600 px, JPEG) — spart Datenvolumen
  function verkleinern(datei) {
    return new Promise(function (ok) {
      const img = new Image(), url = URL.createObjectURL(datei);
      img.onload = function () { const s = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = function () { ok(null); }; img.src = url;
    });
  }

  if (ich) start().catch(function () { wer(); }); else wer();
})();
