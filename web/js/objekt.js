// objekt.js — Objektportal per QR-Code (ohne Anmeldung): Kacheln, die das Büro für dieses Objekt freigibt.
// Leistungsnachweis je Tag (nach Monat), Mangel melden mit bis zu 4 Fotos, eigene Meldungen mit Verlauf und Nachricht,
// Leistungsverzeichnis, Reinigungszeiten, Dokumente, Ansprechpartner mit Direktwahl. Handy zuerst.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, datumDe, tagLang, ICON } = UI;
  const app = $('#app'), titel = $('#apptitel'), zurueck = $('#zurueck');
  const schluessel = location.pathname.split('/o/')[1];
  const API = '/api/o/' + schluessel;
  let kopf = null, stapel = [];
  const sym = (n, g) => (ICON[n] || ICON.datei).replace('<svg', '<svg width="' + (g || 20) + '" height="' + (g || 20) + '"');
  const SYM = { nachweis: 'haken', melden: 'warnung', meldungen: 'kalender', lv: 'datei', zeiten: 'uhr', dokumente: 'datei', kontakt: 'person' };
  const zeitDe = z => z ? datumDe(String(z).slice(0, 10)) + ' ' + String(z).slice(11, 16) : '';
  function titelSetzen(h, u) { titel.innerHTML = esc(h) + (u ? '<small>' + esc(u) + '</small>' : ''); $('#logo').hidden = !!stapel.length; zurueck.hidden = !stapel.length; }
  zurueck.onclick = function () { const f = stapel.pop(); if (f) f(); };
  const weiter = fn => function () { stapel.push(start); fn(); };

  async function start() {
    stapel = [];
    try { kopf = await holen(API); } catch (e) { titelSetzen('Objektportal'); app.innerHTML = '<div class="karte"><b>Kein Zugang</b><p class="leise">' + esc(e.message) + '</p></div>'; return; }
    titelSetzen(kopf.objekt.name, [kopf.objekt.strasse, kopf.objekt.ort].filter(Boolean).join(', '));
    app.innerHTML = '<div class="app-gruss"><div style="color:#b8d4c8">Objektportal · ' + esc(kopf.firma.name) + '</div><h2 style="margin:.3rem 0 0;color:#fff">' + esc(kopf.objekt.name) + '</h2>' +
      '<div style="color:#b8d4c8;margin-top:.3rem">' + esc([kopf.objekt.strasse, [kopf.objekt.plz, kopf.objekt.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')) + '</div></div>' +
      (kopf.kacheln.length ? kopf.kacheln.map(function (k) { return '<button class="kachel" data-k="' + k.id + '"><span class="symbolkasten" style="margin:0">' + sym(SYM[k.id]) + '</span><span style="flex:1"><b>' + esc(k.titel) + '</b><br><span class="leise klein">' + esc(k.zahl || k.text) + '</span></span></button>'; }).join('')
        : '<div class="karte leer">Für dieses Objekt sind noch keine Bereiche freigegeben.</div>') +
      (kopf.firma.telefon ? '<p class="leise klein" style="text-align:center">Dringend? <a href="tel:' + esc(kopf.firma.telefon.replace(/[^0-9+]/g, '')) + '">' + esc(kopf.firma.telefon) + '</a></p>' : '');
    const was = { nachweis: nachweis, melden: melden, meldungen: meldungen, lv: lv, zeiten: zeiten, dokumente: dokumente, kontakt: kontakt };
    $$('[data-k]').forEach(function (b) { b.onclick = weiter(function () { was[b.dataset.k](); }); });
  }

  // ---- Leistungsnachweis: Monat wählen, je Tag aufklappbar
  async function nachweis(monat) {
    const m = monat || new Date().toISOString().slice(0, 7);
    titelSetzen('Leistungsnachweis', kopf.objekt.name);
    app.innerHTML = '<div class="karte leer">Lädt …</div>';
    const n = await holen(API + '/nachweis?monat=' + m);
    const vor = (function () { const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
    const nach = (function () { const d = new Date(m + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();
    const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    app.innerHTML = '<div class="karte zeile"><button class="knopf zweit klein" id="vor">‹</button><b>' + MON[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) + '</b><button class="knopf zweit klein" id="nach"' + (nach > new Date().toISOString().slice(0, 7) ? ' disabled' : '') + '>›</button></div>' +
      '<div class="karte"><div class="ueberzeile">Im Monat</div><b>' + n.summe.fertig + ' von ' + n.summe.soll + ' Leistungen erledigt</b>' + (n.summe.quote != null ? ' <span class="pille gruen">' + String(n.summe.quote).replace('.', ',') + ' %</span>' : '') + '<div class="leise klein">' + n.summe.tage + ' Reinigungstage</div></div>' +
      (n.tage.length ? n.tage.slice().reverse().map(function (t) {
        return '<details class="karte"><summary class="tag-zeile"><span><b>' + esc(tagLang(t.datum)) + '</b>' + (t.kraefte ? '<br><span class="leise klein">Mitarbeiter: ' + t.kraefte + '</span>' : '') + '</span><span class="pille' + (t.fertig === t.soll ? ' gruen' : '') + '">' + t.fertig + '/' + t.soll + '</span></summary>' +
          '<div style="margin-top:.6rem;display:grid;gap:.3rem">' + t.leistungen.map(function (l) { return '<div class="klein">' + (l.erledigt ? '✓ ' : '○ ') + esc(l.raum) + ' · ' + esc(l.taetigkeit) + '</div>'; }).join('') + '</div></details>';
      }).join('') : '<div class="karte leer">In diesem Monat gibt es noch keine Reinigungstage.</div>');
    $('#vor').onclick = function () { nachweis(vor); };
    $('#nach').onclick = function () { nachweis(nach); };
  }

  // ---- Mangel melden: Text, Bereich, Dringlichkeit, bis zu 4 Fotos, Name/Rückruf freiwillig
  function melden() {
    titelSetzen('Mangel melden', kopf.objekt.name);
    const fotos = [];
    const BER = ['Büro', 'Sanitär', 'Küche', 'Treppenhaus', 'Eingang', 'Glas', 'Boden', 'Außenbereich', 'Müll', 'Sonstiges'];
    app.innerHTML = '<div class="karte"><div class="formular" style="grid-template-columns:1fr">' +
      '<label class="feld">Was ist nicht in Ordnung?<textarea id="text" rows="4" placeholder="z. B. Papierhandtücher im WC Erdgeschoss leer"></textarea></label>' +
      '<label class="feld">Bereich<select id="bereich"><option value="">— bitte wählen —</option>' + BER.map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('') + '</select></label>' +
      '<label class="feld">Wie dringend?<select id="prio"><option value="normal">normal</option><option value="hoch">dringend (heute)</option><option value="niedrig">kann warten</option></select></label>' +
      '<div><button class="knopf zweit" id="fotoKnopf" type="button">' + sym('kamera', 18) + ' Foto hinzufügen</button><div class="portal-fotos" id="fotos"></div></div>' +
      '<label class="feld">Ihr Name (freiwillig)<input id="name" autocomplete="name"></label>' +
      '<label class="feld">Telefon oder E-Mail für Rückfragen (freiwillig)<input id="kontakt" autocomplete="email"></label>' +
      '</div><button class="knopf" id="senden" style="width:100%;margin-top:1rem;padding:1rem">Meldung absenden</button>' +
      '<p class="leise klein" style="margin-top:.8rem">Ihre Meldung geht direkt an die Objektleitung. Den Stand sehen Sie danach unter „Meine Meldungen" auf diesem Gerät.</p></div>';
    const datei = $('#foto');
    $('#fotoKnopf').onclick = function () { if (fotos.length >= 4) { meldung('Höchstens 4 Fotos'); return; } datei.value = ''; datei.click(); };
    datei.onchange = async function () { const f = datei.files[0]; if (!f) return; fotos.push(await verkleinern(f)); $('#fotos').innerHTML = fotos.map(function (x) { return '<img src="' + x + '" alt="Foto">'; }).join(''); };
    $('#senden').onclick = async function () {
      const b = this; if (!$('#text').value.trim()) { meldung('Bitte kurz beschreiben, was nicht in Ordnung ist.'); return; }
      b.disabled = true; b.textContent = 'Wird gesendet …';
      try {
        await holen(API + '/melden', { text: $('#text').value, bereich: $('#bereich').value, prioritaet: $('#prio').value, fotos: fotos, name: $('#name').value, kontakt: $('#kontakt').value });
        app.innerHTML = '<div class="karte" style="text-align:center"><div class="symbolkasten" style="margin:0 auto">' + sym('haken', 26) + '</div><h3>Danke, Ihre Meldung ist angekommen.</h3><p class="leise">Die Objektleitung kümmert sich darum. Den Stand sehen Sie unter „Meine Meldungen".</p><button class="knopf" id="zuMeldungen">Meine Meldungen</button></div>';
        stapel = [start]; $('#zuMeldungen').onclick = function () { meldungen(); };
      } catch (e) { meldung(e.message); b.disabled = false; b.textContent = 'Meldung absenden'; }
    };
  }
  // Fotos vor dem Hochladen verkleinern (lange Seite 1600 px, JPEG) — spart Datenvolumen am Handy
  function verkleinern(f) {
    return new Promise(function (ok) {
      const r = new FileReader(); r.onload = function () { const img = new Image(); img.onload = function () { const s = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.82)); }; img.onerror = function () { ok(r.result); }; img.src = r.result; }; r.readAsDataURL(f);
    });
  }

  // ---- Meine Meldungen (dieses Gerät)
  async function meldungen() {
    titelSetzen('Meine Meldungen', kopf.objekt.name);
    const l = await holen(API + '/meldungen');
    app.innerHTML = l.length ? l.map(function (m) {
      return '<div class="karte"><div class="zeile"><b>' + esc(m.text.length > 70 ? m.text.slice(0, 70) + ' …' : m.text) + '</b><span class="pille' + (m.status === 'erledigt' ? ' gruen' : m.prioritaet === 'hoch' ? ' gold' : '') + '">' + esc(m.stand) + '</span></div>' +
        '<div class="leise klein">gemeldet ' + esc(zeitDe(m.gemeldet_am)) + (m.bereich ? ' · ' + esc(m.bereich) : '') + '</div>' +
        (m.fotos.length || m.erledigt_foto ? '<div class="portal-fotos">' + m.fotos.map(function (f) { return '<img src="' + API + '/foto?name=' + encodeURIComponent(f) + '" alt="Foto">'; }).join('') + (m.erledigt_foto ? '<img src="' + API + '/foto?name=' + encodeURIComponent(m.erledigt_foto) + '" alt="erledigt" title="nach der Erledigung">' : '') + '</div>' : '') +
        '<div class="portal-verlauf">' + m.verlauf.map(function (v) { return '<div class="' + (v.von_uns ? '' : 'kunde') + '"><span class="leise klein">' + esc(zeitDe(v.zeit)) + '</span><br>' + esc(v.text) + '</div>'; }).join('') + '</div>' +
        (m.status === 'offen' ? '<div class="zeile" style="margin-top:.6rem;gap:.5rem"><input class="feld" data-n="' + m.id + '" placeholder="Nachricht dazu …" style="flex:1"><button class="knopf klein" data-s="' + m.id + '">Senden</button></div>' : '') + '</div>';
    }).join('') : '<div class="karte leer">Von diesem Gerät gibt es noch keine Meldung.</div>';
    $$('[data-s]').forEach(function (b) { b.onclick = async function () { const i = $('[data-n="' + b.dataset.s + '"]'); if (!i.value.trim()) return; try { await holen(API + '/nachricht', { id: Number(b.dataset.s), text: i.value }); meldung('Nachricht gesendet'); meldungen(); } catch (e) { meldung(e.message); } }; });
  }

  async function lv() {
    titelSetzen('Leistungsverzeichnis', kopf.objekt.name);
    const l = await holen(API + '/lv'); const raeume = {};
    l.forEach(function (x) { const k = x.raum + (x.etage ? ' · ' + x.etage : ''); (raeume[k] = raeume[k] || []).push(x); });
    app.innerHTML = '<p class="leise klein">Die vereinbarten Leistungen mit Turnus — so, wie sie im Vertrag stehen.</p>' + (l.length ? Object.keys(raeume).map(function (r) {
      return '<div class="karte"><b>' + esc(r) + '</b><div style="display:grid;gap:.35rem;margin-top:.5rem">' + raeume[r].map(function (x) { return '<div class="zeile klein"><span>' + esc(x.taetigkeit) + '</span><span class="pille">' + esc(x.turnus) + '</span></div>'; }).join('') + '</div></div>';
    }).join('') : '<div class="karte leer">Noch nicht hinterlegt.</div>');
  }
  async function zeiten() {
    titelSetzen('Reinigungszeiten', kopf.objekt.name);
    const z = await holen(API + '/zeiten');
    app.innerHTML = '<div class="karte"><div class="ueberzeile">Wir reinigen</div>' + (z.tage.length ? '<b>' + esc(z.tage.join(', ')) + '</b>' : '<b>nach Vereinbarung</b>') +
      (z.von ? '<div style="margin-top:.4rem">' + sym('uhr', 18) + ' ' + esc(z.von) + (z.bis ? '–' + esc(z.bis) : '') + ' Uhr</div>' : '') + (z.hinweis ? '<p class="leise">' + esc(z.hinweis) + '</p>' : '') + '</div>';
  }
  async function dokumente() {
    titelSetzen('Dokumente', kopf.objekt.name);
    const l = await holen(API + '/dokumente');
    app.innerHTML = l.length ? l.map(function (d) { return '<a class="kachel" href="' + API + '/dokument?id=' + d.id + '" target="_blank" rel="noopener"><span class="symbolkasten" style="margin:0">' + sym('datei') + '</span><span style="flex:1"><b>' + esc(d.titel) + '</b><br><span class="leise klein">' + esc(datumDe(d.angelegt_am.slice(0, 10))) + '</span></span></a>'; }).join('') : '<div class="karte leer">Keine Dokumente hinterlegt.</div>';
  }
  async function kontakt() {
    titelSetzen('Ansprechpartner', kopf.objekt.name);
    const k = await holen(API + '/kontakt');
    const karte = (rolle, name, tel, mail) => '<div class="karte"><div class="ueberzeile">' + esc(rolle) + '</div><b>' + esc(name) + '</b><div style="display:flex;gap:.5rem;margin-top:.7rem;flex-wrap:wrap">' +
      (tel ? '<a class="knopf" href="tel:' + esc(tel.replace(/[^0-9+]/g, '')) + '">Anrufen</a>' : '') + (mail ? '<a class="knopf zweit" href="mailto:' + esc(mail) + '">E-Mail</a>' : '') + '</div></div>';
    app.innerHTML = (k.objektleitung ? karte('Objektleitung', k.objektleitung.name, k.objektleitung.telefon, null) : '') + karte('Büro', k.buero.name, k.buero.telefon, k.buero.email);
  }

  start();
})();
