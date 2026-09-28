// kunde.js — Glanzwerk Kundenportal: eigene Objekte, Leistungsnachweis der letzten 14 Tage mit Fotos,
// Qualitätsberichte ansehen und abzeichnen, Reklamation mit Foto melden. Sieht nur die eigenen Objekte.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, datumDe, tagLang, ICON } = UI;
  const inhalt = $('#inhalt'), titel = $('#titel');
  const pz = v => String(v).replace('.', ',');
  function kopf(ueber, h1, text, knoepfe) {
    titel.innerHTML = '<div class="glas">' + ICON.gebaeude.replace('<svg', '<svg width="16" height="16"') + ' ' + esc(ueber) + '</div><h1 style="margin-top:1rem">' + h1 + '</h1>' + (text ? '<p>' + text + '</p>' : '') + (knoepfe ? '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.2rem">' + knoepfe + '</div>' : '');
  }

  async function uebersicht() {
    const u = await holen('/api/kunde/uebersicht');
    $('#leisteName').textContent = u.name;
    kopf(u.kunde || 'Kundenportal', 'Ihre <span class="akzent">Objekte</span>', 'Was heute erledigt ist, wie gut die letzten 30 Tage liefen und die Ergebnisse der Qualitätsprüfungen — jederzeit einsehbar.');
    inhalt.innerHTML = u.objekte.length ? '<div class="raster k3">' + u.objekte.map(function (o) {
      return '<div class="karte klickbar akzentlinie" data-o="' + o.id + '"><h3>' + esc(o.name) + '</h3><div class="leise klein">' + esc([o.strasse, o.ort].filter(Boolean).join(', ')) + '</div>' +
        '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.8rem">' + (o.quote30 != null ? '<span class="marke">' + o.quote30 + ' % erledigt (30 Tage)</span>' : '') + (o.heuteSoll ? '<span class="marke gold">heute ' + o.heuteFertig + '/' + o.heuteSoll + '</span>' : '') +
        (o.pruefung ? '<span class="marke">Qualität ' + pz(o.pruefung.ergebnis) + ' %</span>' : '') + (o.reklamationen ? '<span class="marke rot">' + o.reklamationen + ' offene Reklamation' + (o.reklamationen > 1 ? 'en' : '') + '</span>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="karte leer">Für Ihren Zugang sind noch keine Objekte freigeschaltet.</div>';
    $$('[data-o]').forEach(function (k) { k.onclick = function () { location.hash = '#objekt/' + k.dataset.o; }; });
  }

  async function objekt(id) {
    const o = await holen('/api/kunde/objekt?id=' + id);
    kopf([o.strasse, o.ort].filter(Boolean).join(', '), esc(o.name), 'Leistungsnachweis der letzten 14 Tage, Prüfberichte und Ihre Reklamationen.', '<button class="knopf gold" id="anfragen">Sonderleistung anfragen</button><button class="knopf hell" id="reklamieren">Reklamation melden</button><a class="knopf hell" href="#">Alle Objekte</a>');
    const fotos = [].concat(...o.tage.map(function (t) { return t.fotos.map(function (f) { return Object.assign({ datum: t.datum }, f); }); })).slice(0, 24);
    inhalt.innerHTML = '<div class="raster k2"><div class="karte"><div class="ueberzeile">Leistungsnachweis</div><h3>Letzte 14 Tage</h3>' +
      (o.tage.length ? '<table class="tabelle" style="margin-top:.6rem"><thead><tr><th>Tag</th><th style="text-align:right">erledigt</th><th></th></tr></thead><tbody>' + o.tage.map(function (t) { const q = Math.round(t.fertig * 100 / t.soll); return '<tr><td>' + esc(tagLang(t.datum)) + '</td><td style="text-align:right"><b>' + t.fertig + '</b> / ' + t.soll + '</td><td style="width:40%"><div class="fortschritt" style="margin:0"><i style="width:' + q + '%"></i></div></td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise">Keine Leistungstage in diesem Zeitraum.</div>') + '</div>' +
      '<div><div class="karte"><div class="ueberzeile">Qualität</div><h3>Prüfberichte</h3>' + (o.pruefungen.length ? '<table class="tabelle" style="margin-top:.6rem"><tbody>' + o.pruefungen.map(function (p) { return '<tr><td><a href="#bericht/' + p.id + '">' + datumDe(p.datum) + '</a></td><td><b>' + pz(p.ergebnis) + ' %</b></td><td>' + (p.abgezeichnet_von ? '<span class="marke">abgezeichnet</span>' : '<button class="knopf klein" data-abzeichnen="' + p.id + '">Abzeichnen</button>') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise">Noch kein Prüfbericht.</div>') + '</div>' +
      '<div class="karte" style="margin-top:1rem"><div class="ueberzeile">Reklamationen</div>' + (o.reklamationen.length ? o.reklamationen.map(function (r) { return '<div class="zeile" style="padding:.4rem 0;border-bottom:1px solid var(--linie)"><div>' + esc(r.text) + '<div class="leise klein">' + esc(datumDe(r.gemeldet_am.slice(0, 10))) + '</div></div><span class="marke ' + (r.status === 'offen' ? 'rot' : '') + '">' + (r.status === 'offen' ? 'in Bearbeitung' : 'erledigt ' + esc(r.erledigt_am ? datumDe(r.erledigt_am.slice(0, 10)) : '')) + '</span></div>'; }).join('') : '<div class="leise">Keine Reklamationen — schön.</div>') + '</div></div></div>' +
      (fotos.length ? '<div class="abschnitt"><div class="ueberzeile">Fotonachweise</div><div class="fotoraster" style="margin-top:.6rem">' + fotos.map(function (f) { return '<figure><a href="/fotos/' + esc(f.foto) + '" target="_blank"><img src="/fotos/' + esc(f.foto) + '" alt="" loading="lazy"></a><figcaption>' + esc(f.raum) + ' · ' + esc(f.taetigkeit) + '<br>' + esc(datumDe(f.datum)) + ' ' + esc(f.zeit.slice(11, 16)) + '</figcaption></figure>'; }).join('') + '</div></div>' : '');
    $$('[data-abzeichnen]').forEach(function (b) { b.onclick = function () { abzeichnen(Number(b.dataset.abzeichnen), function () { objekt(id); }); }; });
    $('#reklamieren').onclick = function () { reklamation(o); };
    $('#anfragen').onclick = function () { anfrage(o); };
    const auftr = (await holen('/api/kunde/auftraege')).filter(function (a) { return a.objekt === o.name; });
    const ST = { angefragt: ['angefragt', 'gold'], 'bestätigt': ['bestätigt', ''], erledigt: ['erledigt', ''], abgerechnet: ['erledigt', ''], abgelehnt: ['nicht möglich', 'grau'] };
    const box = document.createElement('div'); box.className = 'abschnitt';
    box.innerHTML = '<div class="karte"><div class="ueberzeile">Sonderleistungen</div><h3>Ihre Anfragen</h3>' + (auftr.length ? auftr.map(function (a) { const s = ST[a.status] || [a.status, 'grau']; return '<div class="zeile" style="padding:.45rem 0;border-bottom:1px solid var(--linie)"><div>' + esc(a.text) + '<div class="leise klein">' + (a.termin ? 'Termin ' + datumDe(a.termin) : a.wunschdatum ? 'Wunschtermin ' + datumDe(a.wunschdatum) : '') + (a.antwort ? ' · ' + esc(a.antwort) : '') + '</div></div><span class="marke ' + s[1] + '">' + esc(s[0]) + '</span></div>'; }).join('') : '<div class="leise">Brauchen Sie eine Grund-, Glas- oder Sonderreinigung? Einfach anfragen — wir melden uns mit einem Termin.</div>') + '</div>';
    inhalt.appendChild(box);
  }
  function anfrage(o) {
    const morgen = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    $('#schubladeInhalt').innerHTML = '<h2>Sonderleistung anfragen</h2><p class="leise">' + esc(o.name) + ' — z. B. Grundreinigung, Glasreinigung, Reinigung nach einer Veranstaltung.</p><label class="feld" style="margin-top:1rem">Was dürfen wir für Sie tun?<textarea id="atext" rows="4"></textarea></label><label class="feld" style="margin-top:.8rem">Wunschtermin<input type="date" id="adatum" min="' + morgen + '" value="' + morgen + '"></label>' +
      '<div style="display:flex;gap:.6rem;margin-top:1.2rem"><button class="knopf" id="asenden">Anfrage senden</button><button class="knopf zweit" id="abbrechen">Abbrechen</button></div>';
    $('#schublade').hidden = false; $('#atext').focus(); $('#abbrechen').onclick = zu;
    $('#asenden').onclick = async function () { const text = $('#atext').value.trim(); if (!text) { $('#atext').focus(); return; } try { await holen('/api/kunde/auftrag', { objekt_id: o.id, text: text, wunschdatum: $('#adatum').value }); zu(); meldung('Danke — Ihre Anfrage ist bei uns eingegangen.'); objekt(o.id); } catch (e) { meldung(e.message); } };
  }
  async function rechnungen() {
    const l = await holen('/api/kunde/rechnungen');
    kopf('Kundenportal', 'Ihre <span class="akzent">Rechnungen</span>', 'Alle gestellten Rechnungen zum Ansehen, Drucken und als XRechnung.');
    inhalt.innerHTML = l.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Nummer</th><th>Objekt</th><th>Zeitraum</th><th style="text-align:right">Betrag</th><th>Fällig</th><th></th></tr></thead><tbody>' + l.map(function (r) { return '<tr><td><b>' + esc(r.nummer) + '</b>' + (r.storno_von ? ' <span class="marke rot">Storno</span>' : '') + (r.status === 'bezahlt' ? ' <span class="marke">bezahlt</span>' : '') + (r.status === 'storniert' ? ' <span class="marke grau">storniert</span>' : '') + '</td><td>' + esc(r.objekt || '') + '</td><td>' + datumDe(r.zeitraum_von) + ' – ' + datumDe(r.zeitraum_bis) + '</td><td style="text-align:right">' + (Number(r.brutto) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }) + '</td><td>' + (r.faellig ? datumDe(r.faellig) : '') + '</td><td style="white-space:nowrap"><a class="knopf zweit klein" href="/drucken/rechnung?id=' + r.id + '" target="_blank">Ansehen</a> <a class="knopf zweit klein" href="/api/kunde/xrechnung?id=' + r.id + '">XRechnung</a></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Noch keine Rechnungen.</div>';
  }
  async function abzeichnen(pid, danach) {
    if (!confirm('Prüfbericht abzeichnen? Damit bestätigen Sie, dass Sie ihn zur Kenntnis genommen haben.')) return;
    try { await holen('/api/kunde/abzeichnen', { id: pid }); meldung('Abgezeichnet — danke'); danach(); } catch (e) { meldung(e.message); }
  }
  function reklamation(o) {
    let foto = null;
    $('#schubladeInhalt').innerHTML = '<h2>Reklamation melden</h2><p class="leise">' + esc(o.name) + ' — wir kümmern uns umgehend und melden uns.</p><label class="feld" style="margin-top:1rem">Was ist nicht in Ordnung?<textarea id="rtext" rows="5"></textarea></label>' +
      '<div style="display:flex;gap:.5rem;align-items:center;margin-top:.8rem"><button class="knopf zweit" id="rfoto">Foto anhängen</button><span class="marke" id="rfotoOk" hidden>Foto ✓</span></div>' +
      '<div style="display:flex;gap:.6rem;margin-top:1.2rem"><button class="knopf" id="rsenden">Senden</button><button class="knopf zweit" id="abbrechen">Abbrechen</button></div>';
    $('#schublade').hidden = false; $('#rtext').focus();
    $('#abbrechen').onclick = zu;
    $('#rfoto').onclick = function () { const i = $('#foto'); i.value = ''; i.onchange = async function () { if (!i.files[0]) return; foto = await verkleinern(i.files[0]); $('#rfotoOk').hidden = !foto; }; i.click(); };
    $('#rsenden').onclick = async function () { const text = $('#rtext').value.trim(); if (!text) { $('#rtext').focus(); return; } try { await holen('/api/kunde/reklamation', { objekt_id: o.id, text: text, foto: foto }); zu(); meldung('Danke, Ihre Reklamation ist bei uns eingegangen.'); objekt(o.id); } catch (e) { meldung(e.message); } };
  }
  function zu() { $('#schublade').hidden = true; }
  $('#schublade').onclick = function (e) { if (e.target.id === 'schublade') zu(); };

  async function bericht(id) {
    const p = await holen('/api/kunde/pruefung?id=' + id);
    kopf('Prüfbericht · ' + datumDe(p.datum), esc(p.objekt), 'Qualitätswert <b>' + pz(p.ergebnis) + ' %</b> · Stichprobe ' + p.stichprobe + ' Räume' + (p.abgezeichnet_von ? ' · abgezeichnet von ' + esc(p.abgezeichnet_von) : ''),
      (p.abgezeichnet_von ? '' : '<button class="knopf gold" id="zeichnen">Abzeichnen</button>') + '<a class="knopf hell" href="/drucken/pruefung?id=' + p.id + '" target="_blank">Drucken</a><a class="knopf hell" href="#objekt/' + p.objekt_id + '">Zurück</a>');
    inhalt.innerHTML = p.raeume.map(function (r) { return '<div class="karte" style="margin-bottom:1rem"><div class="zeile"><h3>' + esc(r.name) + '</h3>' + (r.fehler ? '<span class="marke rot">' + r.fehler + ' beanstandet</span>' : '<span class="marke">in Ordnung</span>') + '</div><div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem">' + r.kriterien.filter(function (k) { return k.ok !== null; }).map(function (k) { return '<span class="marke ' + (k.ok ? '' : 'rot') + '">' + (k.ok ? '✓ ' : '✗ ') + esc(k.element) + '</span>'; }).join('') + '</div></div>'; }).join('') + (p.bemerkung ? '<div class="karte"><b>Bemerkung:</b> ' + esc(p.bemerkung) + '</div>' : '');
    const z = $('#zeichnen'); if (z) z.onclick = function () { abzeichnen(p.id, function () { bericht(id); }); };
  }

  function verkleinern(datei) {
    return new Promise(function (ok) {
      const img = new Image(), url = URL.createObjectURL(datei);
      img.onload = function () { const s = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = function () { ok(null); }; img.src = url;
    });
  }

  $('#abmelden').onclick = async function () { await holen('/api/abmelden', {}); location.href = '/anmelden'; };
  async function route() {
    const [v, arg] = (location.hash.slice(1) || '').split('/'); zu();
    $$('#nav a').forEach(function (a) { a.classList.toggle('aktiv', a.dataset.v === (v === 'rechnungen' ? 'rechnungen' : 'uebersicht')); });
    try { if (v === 'objekt') await objekt(arg); else if (v === 'bericht') await bericht(arg); else if (v === 'rechnungen') await rechnungen(); else await uebersicht(); }
    catch (e) { inhalt.innerHTML = '<div class="karte hinweis">' + esc(e.message) + '</div>'; }
    window.scrollTo(0, 0);
  }
  (async function () {
    try { const ich = await UI.ich(); if (!ich) throw 0; if (ich.rolle !== 'kunde') { location.href = ich.rolle === 'buero' ? '/' : '/app'; return; } $('#leisteName').textContent = ich.name; }
    catch (e) { location.href = '/anmelden'; return; }
    window.addEventListener('hashchange', route); route();
  })();
})();
