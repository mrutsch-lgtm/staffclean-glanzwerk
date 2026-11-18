// buero-ausbau.js — Büro-Oberfläche für die Ausbaustufe 1 (CleaningOS-Abgleich 18.11.2026):
//   · mailDialog: Mail-Entwurf ansehen und ändern, Anhänge sehen, mit „Senden" freigeben (Rechnung, Nachweis, Prüfbericht)
//   · ticket: Mangel/Reklamation als Ticket — Zuweisung, Stand, Verlauf, Kommentar, Entscheidung, Nachkontrolle
//   · kundenansicht: Reiter am Objekt — QR-Objektportal (ein/aus, Kacheln, QR, Druckblatt), Leistungsnachweis, Anlagen
//   · mailEinstellungen: Absender, Server, Stand des Mailversands, Protokoll
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe } = UI;
  const G = window.GW;
  const fehler = fn => async function () { try { await fn.apply(this, arguments); } catch (e) { meldung(e.message); } };
  const zeitDe = z => z ? datumDe(String(z).slice(0, 10)) + ' ' + String(z).slice(11, 16) : '';
  const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const monatText = m => MON[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);
  const letzteMonate = n => { const l = []; const d = new Date(heute().slice(0, 7) + '-15T12:00:00Z'); for (let i = 0; i < n; i++) { l.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); } return l; };

  // ------------------------------------------------------------ Mail: Entwurf → (ändern) → Senden = Freigabe
  async function mailDialog(o) {
    const [e, st] = await Promise.all([holen(o.entwurf), holen('/api/mail/status')]);
    G.schublade('<h2>' + esc(o.titel) + '</h2>' +
      (st.bereit ? (st.test ? '<div class="hinweis">Testbetrieb: die Mail wird nur protokolliert, nicht verschickt.</div>' : '<p class="leise klein">Absender: ' + esc(st.absender) + '</p>') : '<div class="hinweis rot">Mailversand ist noch nicht eingerichtet: ' + esc(st.grund) + '</div>') +
      (e.schon ? '<div class="hinweis gold" style="margin-top:.6rem">Schon gesendet am ' + esc(zeitDe(e.schon.zeit)) + ' an ' + esc(e.schon.an) + '. Nochmal nur mit Häkchen „erneut senden".</div>' : '') +
      '<div class="formular" style="grid-template-columns:1fr;margin-top:1rem">' + G.feld('an', 'An (mehrere mit Komma)', e.an, 'text') + G.feld('cc', 'Kopie an (optional)', '', 'text') + G.feld('betreff', 'Betreff', e.betreff, 'text') +
      '<label class="feld">Text<textarea name="text" rows="9">' + esc(e.text) + '</textarea></label></div>' +
      '<div class="karte" style="margin-top:.8rem"><div class="ueberzeile">Anhänge (' + e.anhaenge.length + ')</div>' + e.anhaenge.map(function (a) { return '<div class="klein">📎 ' + esc(a) + '</div>'; }).join('') + '<div class="leise klein" style="margin-top:.4rem">Unter dem Text steht automatisch der Firmengruß.</div></div>' +
      (e.schon ? '<label style="display:flex;gap:.5rem;align-items:center;margin-top:.8rem"><input type="checkbox" id="erneut"> erneut senden</label>' : '') +
      '<div style="display:flex;gap:.6rem;margin-top:1rem"><button class="knopf gold" id="speichern"' + (st.bereit ? '' : ' disabled') + '>Senden</button><button class="knopf zweit" id="abbrechen">Abbrechen</button></div>', function (w) {
      $('#speichern', w).onclick = fehler(async function () {
        const d = Object.assign({}, o.daten, G.formDaten(w)); const er = $('#erneut', w); if (er) d.erneut = er.checked;
        if (!confirm('Mail jetzt an ' + d.an + ' senden?')) return;
        this.disabled = true;
        try { const r = await holen(o.senden, d); G.schubladeZu(); meldung((r.test ? 'Protokolliert (Testbetrieb): ' : 'Gesendet an ') + r.an); if (o.nachher) o.nachher(); }
        catch (x) { this.disabled = false; throw x; }
      });
    });
  }

  // ------------------------------------------------------------ Ticket
  const QUELLE = { kunde: ['Reklamation', 'rot'], portal: ['Objektportal', 'rot'], pruefung: ['Prüfung', 'gold'], mitarbeiter: ['Mitarbeiter', 'grau'], buero: ['Büro', 'grau'], 'büro': ['Büro', 'grau'] };
  const STANDFARBE = { neu: 'rot', zugewiesen: 'gold', in_arbeit: '' };
  function ticketZeile(m, mitObjekt) {
    const q = QUELLE[m.quelle] || [m.quelle, 'grau'];
    const stand = m.status === 'erledigt' ? '<span class="marke">' + (m.geprueft_am ? 'erledigt · geprüft' : 'erledigt') + '</span>' : '<span class="marke ' + (STANDFARBE[m.stand] || 'grau') + '">' + esc({ neu: 'neu', zugewiesen: 'zugewiesen', in_arbeit: 'in Arbeit' }[m.stand] || 'neu') + '</span>';
    return '<div class="karte zeile klickbar" data-ticket="' + m.id + '" data-tobj="' + m.objekt_id + '" style="margin-bottom:.6rem;cursor:pointer"><div><b>' + (mitObjekt ? esc(m.objekt) + (m.raum ? ' · ' + esc(m.raum) : '') : esc(m.raum || m.bereich || 'ganzes Objekt')) + '</b> ' +
      '<span class="marke ' + q[1] + '">' + esc(q[0]) + '</span>' + (m.prioritaet === 'hoch' ? ' <span class="marke rot">dringend</span>' : '') + ' ' + stand +
      '<div>' + esc(m.text) + '</div><div class="leise klein">' + esc(datumDe(String(m.gemeldet_am).slice(0, 10))) + (m.gemeldet_von ? ' · ' + esc(m.gemeldet_von) : '') + ' · Frist <span' + (m.ueberfaellig ? ' style="color:var(--rot);font-weight:700"' : '') + '>' + esc(datumDe(m.frist)) + '</span>' +
      (m.zustaendig ? ' · bei ' + esc(m.zustaendig) : '') + ((m.fotos || []).length ? ' · ' + m.fotos.length + ' Foto' + (m.fotos.length > 1 ? 's' : '') : '') + (m.kommentare ? ' · ' + m.kommentare + ' Kommentar' + (m.kommentare > 1 ? 'e' : '') : '') + '</div></div><span class="leise">›</span></div>';
  }
  function ticketsBinden(w, nachher) { $$('[data-ticket]', w).forEach(function (k) { k.onclick = function () { ticket(Number(k.dataset.ticket), Number(k.dataset.tobj), nachher); }; }); }

  async function ticket(id, objektId, nachher) {
    const m = await holen('/api/mangel?id=' + id + '&objekt=' + objektId);
    const offen = m.status === 'offen';
    const neu = async (d, text) => { await holen('/api/mangel', Object.assign({ id: m.id, objekt_id: m.objekt_id }, d)); meldung(text); ticket(id, objektId, nachher); if (nachher) nachher(); };
    G.schublade('<h2>' + esc(m.objekt) + (m.raum ? ' · ' + esc(m.raum) : '') + '</h2><p>' + esc(m.text) + '</p>' +
      '<div class="leise klein">gemeldet ' + esc(zeitDe(m.gemeldet_am)) + (m.gemeldet_von ? ' von ' + esc(m.gemeldet_von) : '') + (m.melder_kontakt ? ' · Rückruf: ' + esc(m.melder_kontakt) : '') + ' · Quelle ' + esc((QUELLE[m.quelle] || [m.quelle])[0]) + '</div>' +
      (m.fotos.length || m.erledigt_foto ? '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.6rem">' + m.fotos.map(function (f) { return '<a href="/fotos/' + esc(f) + '" target="_blank"><img src="/fotos/' + esc(f) + '" style="width:84px;height:84px;object-fit:cover;border-radius:10px" alt="Foto"></a>'; }).join('') + (m.erledigt_foto ? '<a href="/fotos/' + esc(m.erledigt_foto) + '" target="_blank" title="nach der Erledigung"><img src="/fotos/' + esc(m.erledigt_foto) + '" style="width:84px;height:84px;object-fit:cover;border-radius:10px;outline:3px solid var(--gruen-500)" alt="erledigt"></a>' : '') + '</div>' : '') +
      '<div class="formular" style="margin-top:1rem">' +
      G.auswahl('zuweisen', 'Zuständig', [['', '— niemand —']].concat(m.kandidaten.map(function (k) { return [k.id, k.name + (k.objektleitung ? ' (Objektleitung)' : '')]; })), m.zustaendig_id || '') +
      G.auswahl('stand', 'Stand', [['neu', 'neu'], ['zugewiesen', 'zugewiesen'], ['in_arbeit', 'in Arbeit']], m.stand || 'neu') +
      G.auswahl('prioritaet', 'Priorität', [['hoch', 'dringend'], ['normal', 'normal'], ['niedrig', 'kann warten']], m.prioritaet || 'normal') + G.feld('frist', 'Frist', m.frist, 'date') +
      G.auswahl('entscheidung', 'Entscheidung', [['', '— offen —']].concat(Object.keys(m.entscheidungen).map(function (k) { return [k, m.entscheidungen[k]]; })), m.entscheidung || '') + G.feld('verursacher', 'Verursacher (Team, Kraft, Subunternehmer)', m.verursacher || '') + '</div>' +
      '<div class="ueberzeile" style="margin-top:1rem">Verlauf</div><div style="display:grid;gap:.35rem">' + m.verlauf.map(function (v) { return '<div class="klein" style="padding:.4rem .6rem;border-radius:8px;background:' + (v.art === 'kunde' ? 'var(--gruen-50)' : 'var(--grund)') + '"><span class="leise">' + esc(zeitDe(v.zeit)) + (v.wer ? ' · ' + esc(v.wer) : '') + (v.oeffentlich ? '' : ' · intern') + '</span><br>' + esc(v.text) + '</div>'; }).join('') + '</div>' +
      '<div class="formular" style="grid-template-columns:1fr;margin-top:.6rem"><label class="feld">Kommentar<textarea name="kommentar" rows="2"></textarea></label><label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="oeffentlich"> für den Melder sichtbar</label></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem">' + (offen ? '<button class="knopf" id="tSpeichern">Speichern</button><button class="knopf gold" id="tErledigt">Erledigt</button>' : (m.geprueft_am ? '' : '<button class="knopf" id="tGeprueft">Nachkontrolle: in Ordnung</button>') + '<button class="knopf zweit" id="tOeffnen">Wieder öffnen</button>') + '<button class="knopf zweit" id="abbrechen">Schließen</button></div>', function (w) {
      const s = $('#tSpeichern', w); if (s) s.onclick = fehler(async function () {
        const d = G.formDaten(w);
        if (String(d.zuweisen || '') !== String(m.zustaendig_id || '')) await holen('/api/mangel', { id: m.id, objekt_id: m.objekt_id, zuweisen: d.zuweisen ? Number(d.zuweisen) : null });
        if (d.stand !== m.stand && !(d.zuweisen && d.stand === 'neu')) await holen('/api/mangel', { id: m.id, objekt_id: m.objekt_id, stand: d.stand });
        if (d.prioritaet !== m.prioritaet || d.frist !== m.frist) await holen('/api/mangel', { id: m.id, objekt_id: m.objekt_id, prioritaet: d.prioritaet, frist: d.frist });
        if ((d.entscheidung || '') !== (m.entscheidung || '') || (d.verursacher || '') !== (m.verursacher || '')) await holen('/api/mangel', { id: m.id, objekt_id: m.objekt_id, entscheidung: d.entscheidung || null, verursacher: d.verursacher });
        if (String(d.kommentar || '').trim()) await holen('/api/mangel', { id: m.id, objekt_id: m.objekt_id, kommentar: d.kommentar, oeffentlich: !!$('[name=oeffentlich]', w).checked });
        meldung('Gespeichert'); ticket(id, objektId, nachher); if (nachher) nachher();
      });
      const e = $('#tErledigt', w); if (e) e.onclick = fehler(async function () { const n = prompt('Was wurde gemacht? (optional, steht im Verlauf)') ; if (n === null) return; await neu({ erledigt: true, notiz: n }, 'Erledigt'); });
      const g = $('#tGeprueft', w); if (g) g.onclick = fehler(async function () { await neu({ geprueft: true }, 'Nachkontrolle vermerkt'); });
      const o = $('#tOeffnen', w); if (o) o.onclick = fehler(async function () { const gr = prompt('Warum wieder öffnen?'); if (gr === null) return; await neu({ oeffnen: true, grund: gr }, 'Wieder geöffnet'); });
    });
  }

  // ------------------------------------------------------------ Reiter „Kundenansicht & Anlagen" am Objekt
  async function kundenansicht(o, bereich) {
    const [p, an] = await Promise.all([holen('/api/objekt/portal?id=' + o.id), holen('/api/anlagen?objekt=' + o.id)]);
    const monate = letzteMonate(6);
    bereich.innerHTML = '<div class="raster k2">' +
      '<div class="karte"><div class="zeile"><h3>Objektportal per QR-Code</h3><span class="marke ' + (p.aktiv ? '' : 'grau') + '">' + (p.aktiv ? 'eingeschaltet' : 'aus') + '</span></div>' +
      '<p class="leise klein">Ein QR-Code im Objekt (Treppenhaus, Empfang): Kunde und Hausverwaltung sehen ohne Anmeldung, was du unten freigibst, und melden Mängel mit Foto. Keine Preise, keine Namen von Reinigungskräften.</p>' +
      (p.aktiv ? '<div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin:.6rem 0"><img src="/api/objekt/portal-qr?id=' + o.id + '&t=' + Date.now() + '" alt="QR-Code" style="width:120px;height:120px;border:1px solid var(--linie);border-radius:10px;background:#fff">' +
        '<div style="display:grid;gap:.4rem"><a class="knopf klein" href="/drucken/objekt-qr?id=' + o.id + '" target="_blank">QR-Aushang drucken</a><a class="knopf zweit klein" href="' + esc(p.link) + '" target="_blank" rel="noopener">Kundenansicht öffnen</a><button class="knopf zweit klein" id="pKopieren">Link kopieren</button></div></div>' : '') +
      '<div class="ueberzeile" style="margin-top:.6rem">Freigegeben im Portal</div>' + p.liste.map(function (k) { return '<label style="display:flex;gap:.6rem;align-items:flex-start;padding:.3rem 0"><input type="checkbox" data-kachel="' + k[0] + '"' + (p.kacheln[k[0]] ? ' checked' : '') + '><span><b>' + esc(k[1]) + '</b><br><span class="leise klein">' + esc(k[2]) + '</span></span></label>'; }).join('') +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem">' + (p.aktiv ? '<button class="knopf zweit klein" id="pAus">Portal ausschalten</button><button class="knopf zweit klein" id="pNeu">Neuen Link erzeugen (alter QR wird ungültig)</button>' : '<button class="knopf" id="pAn">Portal einschalten</button>') + '</div></div>' +
      '<div><div class="karte"><h3>Leistungsnachweis je Monat</h3><p class="leise klein">Je Reinigungstag, welche Leistungen erledigt wurden — aus den Häkchen der App. Als PDF für den Kunden oder als Rechnungsanlage.</p>' +
      '<div class="formular" style="grid-template-columns:1fr">' + G.auswahl('nwMonat', 'Monat', monate.map(function (m) { return [m, monatText(m)]; }), monate[0]) + '</div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem"><button class="knopf klein" id="nwPdf">PDF öffnen</button><button class="knopf gold klein" id="nwMail">An Kunden senden</button></div>' +
      '<label style="display:flex;gap:.6rem;align-items:center;margin-top:.9rem"><input type="checkbox" id="nwAnh"' + (an.nachweis_anhaengen ? ' checked' : '') + '> mit jeder Rechnung dieses Objekts mitsenden</label></div>' +
      '<div class="karte" style="margin-top:1rem"><div class="zeile"><h3>Anlagen</h3><button class="knopf zweit klein" id="anNeu">+ Anlage</button></div><p class="leise klein">Aufmaß, Stundenzettel, Vertrag, Sicherheitsdatenblätter … „mit Rechnung" hängt die Datei an jede Rechnungsmail, „im Portal" zeigt sie unter Dokumente.</p>' +
      (an.anlagen.length ? '<table class="tabelle"><tbody>' + an.anlagen.map(function (a) { return '<tr><td><a href="/api/anlage/datei?id=' + a.id + '&objekt=' + o.id + '" target="_blank">' + esc(a.titel) + '</a><div class="leise klein">' + esc(an.arten[a.art] || a.art) + ' · ' + esc(datumDe(a.angelegt_am.slice(0, 10))) + '</div></td><td class="klein"><label><input type="checkbox" data-anauto="' + a.id + '"' + (a.auto ? ' checked' : '') + '> mit Rechnung</label><br><label><input type="checkbox" data-anportal="' + a.id + '"' + (a.im_portal ? ' checked' : '') + '> im Portal</label></td><td><button class="knopf zweit klein" data-anweg="' + a.id + '">Entfernen</button></td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise klein">Noch keine Anlage.</div>') + '</div></div></div>';
    const neu = () => kundenansicht(o, bereich);
    const setzen = fehler(async function (d, text) { await holen('/api/objekt/portal', Object.assign({ id: o.id }, d)); meldung(text); neu(); });
    const an1 = $('#pAn', bereich); if (an1) an1.onclick = function () { setzen({ aktiv: true }, 'Portal eingeschaltet'); };
    const aus = $('#pAus', bereich); if (aus) aus.onclick = function () { if (confirm('Portal ausschalten? Der QR-Code im Objekt zeigt dann „kein Zugang".')) setzen({ aktiv: false }, 'Portal ausgeschaltet'); };
    const nl = $('#pNeu', bereich); if (nl) nl.onclick = function () { if (confirm('Neuen Link erzeugen? Der bisherige QR-Aushang funktioniert danach nicht mehr und muss neu gedruckt werden.')) setzen({ erneuern: true }, 'Neuer Link erzeugt — bitte neu aushängen'); };
    const kp = $('#pKopieren', bereich); if (kp) kp.onclick = function () { navigator.clipboard.writeText(p.link).then(function () { meldung('Link kopiert'); }); };
    $$('[data-kachel]', bereich).forEach(function (c) { c.onchange = fehler(async function () { const k = {}; k[c.dataset.kachel] = c.checked; await holen('/api/objekt/portal', { id: o.id, kacheln: k }); meldung('Gespeichert'); }); });
    $('#nwPdf', bereich).onclick = function () { window.open('/api/nachweis.pdf?objekt=' + o.id + '&monat=' + $('[name=nwMonat]', bereich).value, '_blank'); };
    $('#nwMail', bereich).onclick = fehler(async function () { const m = $('[name=nwMonat]', bereich).value; await mailDialog({ titel: 'Leistungsnachweis ' + monatText(m) + ' senden', entwurf: '/api/nachweis/mail-entwurf?objekt=' + o.id + '&monat=' + m, senden: '/api/nachweis/mail', daten: { objekt_id: o.id, monat: m } }); });
    $('#nwAnh', bereich).onchange = fehler(async function () { await holen('/api/anlage', { objekt_id: o.id, nachweis_anhaengen: this.checked }); meldung(this.checked ? 'Nachweis geht mit jeder Rechnung mit' : 'Nachweis geht nicht mehr mit'); });
    $$('[data-anauto]', bereich).forEach(function (c) { c.onchange = fehler(async function () { await holen('/api/anlage', { objekt_id: o.id, id: Number(c.dataset.anauto), auto: c.checked }); meldung('Gespeichert'); }); });
    $$('[data-anportal]', bereich).forEach(function (c) { c.onchange = fehler(async function () { await holen('/api/anlage', { objekt_id: o.id, id: Number(c.dataset.anportal), im_portal: c.checked }); meldung('Gespeichert'); }); });
    $$('[data-anweg]', bereich).forEach(function (b) { b.onclick = fehler(async function () { if (!confirm('Anlage entfernen? Bereits versendete Mails behalten sie.')) return; await holen('/api/anlage', { objekt_id: o.id, id: Number(b.dataset.anweg), loeschen: true }); meldung('Entfernt'); neu(); }); });
    $('#anNeu', bereich).onclick = function () {
      G.schublade('<h2>Anlage hinzufügen</h2><div class="formular" style="margin-top:1rem">' + G.feld('titel', 'Titel', '') + G.auswahl('art', 'Art', Object.keys(an.arten).map(function (k) { return [k, an.arten[k]]; }), 'aufmass') +
        '<label class="feld" style="grid-column:1/-1">Datei (PDF, JPG oder PNG, bis 10 MB)<input type="file" id="anDatei" accept="application/pdf,image/jpeg,image/png"></label></div>' +
        '<label style="display:flex;gap:.5rem;align-items:center;margin-top:.6rem"><input type="checkbox" id="anAuto" checked> mit jeder Rechnung mitsenden</label><label style="display:flex;gap:.5rem;align-items:center;margin-top:.4rem"><input type="checkbox" id="anPortal"> im Objektportal zeigen</label>' + G.knoepfe('Hochladen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () {
          const f = $('#anDatei', w).files[0]; if (!f) { meldung('Bitte eine Datei wählen'); return; }
          const daten = await new Promise(function (ok) { const r = new FileReader(); r.onload = function () { ok(r.result); }; r.readAsDataURL(f); });
          const d = G.formDaten(w); await holen('/api/anlage', { objekt_id: o.id, titel: d.titel || f.name.replace(/\.[^.]+$/, ''), art: d.art, datei: daten, auto: $('#anAuto', w).checked, im_portal: $('#anPortal', w).checked });
          G.schubladeZu(); meldung('Anlage gespeichert'); neu();
        });
      });
    };
  }

  // ------------------------------------------------------------ Einstellungen: Mailversand
  async function mailEinstellungen(b, e) {
    const [st, prot] = await Promise.all([holen('/api/mail/status'), holen('/api/mail/protokoll')]);
    const box = document.createElement('div'); box.className = 'karte'; box.style.marginTop = '1rem';
    box.innerHTML = '<div class="zeile"><h3>Mailversand</h3><span class="marke ' + (st.bereit ? '' : 'rot') + '">' + (st.bereit ? (st.test ? 'Testbetrieb' : 'bereit') : 'nicht eingerichtet') + '</span></div>' +
      (st.bereit ? '' : '<div class="hinweis" style="margin:.5rem 0">' + esc(st.grund) + '</div>') +
      '<div class="formular">' + G.feld('mail_absender', 'Absender (Postfach)', e.mail_absender) + G.feld('mail_absender_name', 'Absendername', e.mail_absender_name) + G.feld('mail_smtp_host', 'Postausgangsserver', e.mail_smtp_host) + G.feld('mail_smtp_port', 'Port', e.mail_smtp_port) + G.feld('mail_kopie_an', 'Kopie jeder Mail an (leer = keine)', e.mail_kopie_an) + '</div>' +
      '<p class="leise klein">Das Passwort des Postfachs steht nie hier, sondern nur auf dem Server. Gesendet wird ausschließlich, wenn im Büro jemand auf „Senden" drückt — jede Mail steht im Protokoll.</p><button class="knopf" id="mailSpeichern">Speichern</button>' +
      '<div class="ueberzeile" style="margin-top:1rem">Zuletzt gesendet</div>' + (prot.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Zeit</th><th>Anlass</th><th>An</th><th>Betreff</th><th>Ergebnis</th></tr></thead><tbody>' + prot.slice(0, 30).map(function (p) { return '<tr><td class="klein">' + esc(zeitDe(p.zeit)) + '</td><td>' + esc({ rechnung: 'Rechnung', nachweis: 'Leistungsnachweis', pruefbericht: 'Prüfbericht' }[p.anlass] || p.anlass) + '</td><td class="klein">' + esc(p.an) + '</td><td class="klein">' + esc(p.betreff) + '</td><td>' + (p.ergebnis === 'gesendet' ? '<span class="marke">gesendet</span>' : '<span class="marke rot" title="' + esc(p.fehler || '') + '">Fehler</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="leise klein">Noch keine Mail.</div>');
    b.appendChild(box);
    $('#mailSpeichern', box).onclick = fehler(async function () { await holen('/api/einstellungen', G.formDaten(box)); meldung('Gespeichert'); });
  }

  // ------------------------------------------------------------ Objekt aus angenommenem Angebot (Vertrieb) übernehmen
  function ausAngebot(fertig) {
    G.schublade('<h2>Objekt aus Angebot übernehmen</h2><p class="leise klein">Glanzwerk holt das Angebot aus dem Vertrieb und legt Kunde, Objekt, Räume und das Leistungsverzeichnis an. Die Leistungen aus dem Angebot sind danach gesperrt — Änderungen gehen nur als Nachtrag.</p>' +
      '<div class="formular" style="grid-template-columns:1fr;margin-top:1rem">' + G.feld('nummer', 'Angebotsnummer (z. B. SC2026-00104)', '') + '</div><div id="angVorschau"></div>' +
      '<div style="display:flex;gap:.6rem;margin-top:1rem"><button class="knopf" id="angHolen">Vorschau</button><button class="knopf gold" id="angUeber" hidden>Übernehmen</button><button class="knopf zweit" id="abbrechen">Abbrechen</button></div>', function (w) {
      let v = null;
      $('#angHolen', w).onclick = fehler(async function () {
        this.disabled = true;
        try { v = await holen('/api/angebot/vorschau?nummer=' + encodeURIComponent($('[name=nummer]', w).value)); } finally { this.disabled = false; }
        $('#angVorschau', w).innerHTML = '<div class="karte" style="margin-top:1rem"><b>' + esc(v.nummer) + ' · ' + esc(v.firma) + '</b><div class="leise klein">' + (v.angenommen ? 'angenommen' + (v.angenommen.am ? ' am ' + esc(datumDe(String(v.angenommen.am).slice(0, 10))) : '') + (v.angenommen.von ? ' von ' + esc(v.angenommen.von) : '') : '<b style="color:var(--rot)">im Vertrieb nicht als angenommen markiert</b>') + ' · Kunde ' + (v.kunde ? 'vorhanden' : 'wird neu angelegt') + '</div>' +
          (v.schonDa ? '<div class="hinweis rot" style="margin-top:.5rem">Aus diesem Angebot gibt es schon das Objekt „' + esc(v.schonDa.name) + '".</div>' : '') +
          '<div class="formular" style="grid-template-columns:1fr;margin-top:.6rem">' + G.feld('name', 'Objektname', v.objekt) + '</div>' +
          '<div class="klein" style="margin-top:.4rem">' + v.raeume.length + ' Räume · ' + v.leistungen + ' Leistungen</div>' +
          '<div style="max-height:220px;overflow:auto;margin-top:.4rem">' + v.raeume.map(function (r) { return '<div class="klein"><b>' + esc(r.name) + '</b>' + (r.flaeche ? ' · ' + String(r.flaeche).replace('.', ',') + ' m²' : '') + ': ' + r.leistungen.map(function (l) { return esc(l.taetigkeit) + ' (' + esc(l.turnus) + (l.verstanden ? '' : ' ⚠') + ')'; }).join(', ') + '</div>'; }).join('') + '</div>' +
          (v.unverstanden.length ? '<div class="hinweis" style="margin-top:.5rem">Diese Turnus-Angaben versteht Glanzwerk nicht, sie werden ausgelassen: ' + v.unverstanden.map(esc).join('; ') + '</div>' : '') +
          (v.netto ? '<label style="display:flex;gap:.5rem;align-items:center;margin-top:.6rem"><input type="checkbox" id="angPreis"> Angebotssumme ' + G.euro(v.netto) + ' netto als Monatspreis übernehmen</label>' : '') +
          (!v.angenommen ? '<label style="display:flex;gap:.5rem;align-items:center;margin-top:.4rem"><input type="checkbox" id="angTrotzdem"> Auftrag liegt schriftlich vor — trotzdem übernehmen</label>' : '') + '</div>';
        $('#angUeber', w).hidden = !!v.schonDa;
      });
      $('#angUeber', w).onclick = fehler(async function () {
        const tz = $('#angTrotzdem', w), pr = $('#angPreis', w);
        const r = await holen('/api/angebot/uebernehmen', { nummer: v.nummer, name: $('[name=name]', w).value, trotzdem: tz ? tz.checked : false, monatspreis: pr ? pr.checked : false });
        G.schubladeZu(); meldung('Objekt angelegt: ' + r.raeume + ' Räume, ' + r.positionen + ' Leistungen' + (r.unverstanden.length ? ' (' + r.unverstanden.length + ' ausgelassen)' : '')); if (fertig) fertig(r.objekt_id);
      });
    });
  }

  window.GW_AUSBAU = { mailDialog, ticket, ticketZeile, ticketsBinden, kundenansicht, mailEinstellungen, ausAngebot };
})();
