// buero-bewerber.js — Bewerbermanagement: Bewerber-Board nach Status (ziehen zum Weiterschieben), Liste mit Suche,
// Löschfristen nach Absage (DSGVO/AGG), Bewerberakte mit Kontakt, Verlauf, Unterlagen, Termin, Bewertung und „Einstellen"
// (legt Mitarbeiter mit Personalakte an und übernimmt die Unterlagen).
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe } = UI;
  const G = window.GW, A = window.GW_ANSICHTEN = window.GW_ANSICHTEN || {};
  const inhalt = G.inhalt;
  const fehler = fn => async function () { try { await fn.apply(this, arguments); } catch (e) { meldung(e.message); } };
  const BESCH = [['', '—'], ['vollzeit', 'Vollzeit'], ['teilzeit', 'Teilzeit'], ['minijob', 'Minijob'], ['kurzfristig', 'kurzfristig'], ['werkstudent', 'Werkstudent'], ['aushilfe', 'Aushilfe']];
  const sterne = n => n ? '★'.repeat(n) + '<span style="opacity:.3">' + '★'.repeat(5 - n) + '</span>' : '';
  const termin = t => t ? datumDe(t.slice(0, 10)) + (t.length > 10 ? ' ' + t.slice(11, 16) : '') : '';

  let reiterB = 'board', suche = '';
  A.bewerber = async function bewerber(arg) {
    if (arg && ['board', 'liste', 'fristen'].indexOf(arg) >= 0) reiterB = arg;
    const d = await holen('/api/bewerber'), kz = d.kennzahlen;
    G.kopf('Personal · Bewerber', 'Gute Leute <span class="akzent">finden</span>', 'Jede Bewerbung vom ersten Kontakt bis zur Einstellung — mit Terminen, Unterlagen und Bewertung. Beim Einstellen entsteht die Personalakte, die Unterlagen wandern mit. Nach einer Absage werden die Daten nach 6 Monaten gelöscht (DSGVO/AGG), außer die Person hat dem Talentpool zugestimmt.',
      '<button class="knopf gold" id="neuBewerber">+ Bewerbung erfassen</button><a class="knopf hell" href="/api/personal/fragebogen" target="_blank">Personalfragebogen (leer)</a>');
    const offen = d.liste.filter(function (b) { return b.status !== 'eingestellt' && b.status !== 'absage'; });
    inhalt.innerHTML = '<div class="raster" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.7rem;margin-bottom:1rem">' +
      [['Offen', offen.length], ['Gespräch / Probe', kz.status.gespraech + kz.status.probe], ['Zusage', kz.status.zusage], ['Eingestellt', kz.status.eingestellt], ['Löschfällig', kz.loeschfaellig]].map(function (k, i) { return '<div class="karte kennzahl" style="padding:.8rem 1rem"><div class="ueberzeile">' + k[0] + '</div><div style="font-size:1.4rem;font-weight:800' + (i === 4 && k[1] ? ';color:var(--rot)' : '') + '">' + k[1] + '</div></div>'; }).join('') + '</div>' +
      G.reiter([['board', 'Bewerber-Board'], ['liste', 'Liste'], ['fristen', 'Löschfristen' + (kz.loeschfaellig ? ' (' + kz.loeschfaellig + ')' : '')], ['quellen', 'Woher kommen sie?']], reiterB, function (r) { reiterB = r; zeigen(); }) + '<div id="bwBereich"></div>';
    $('#neuBewerber').onclick = function () { formular({}, d); };
    function zeigen() {
      const b = $('#bwBereich');
      if (reiterB === 'board') {
        b.innerHTML = '<div class="board">' + d.status.filter(function (s) { return s[0] !== 'eingestellt' && s[0] !== 'absage'; }).concat([['eingestellt', 'Eingestellt'], ['absage', 'Absage']]).map(function (s) {
          const l = d.liste.filter(function (x) { return x.status === s[0]; });
          return '<div class="board-spalte" data-bwspalte="' + s[0] + '"><div class="board-spaltenkopf"><b>' + esc(s[1]) + '</b> <span class="leise klein">' + l.length + '</span></div><div class="board-karten">' + l.slice(0, 40).map(function (x) {
            return '<div class="board-karte" draggable="' + (x.status === 'eingestellt' ? 'false' : 'true') + '" data-bw="' + x.id + '"><b>' + esc([x.vorname, x.nachname].filter(Boolean).join(' ')) + '</b><div class="leise klein">' + esc([x.position, (BESCH.find(function (y) { return y[0] === x.beschaeftigungsart; }) || [0, ''])[1], x.stunden_wunsch ? String(x.stunden_wunsch).replace('.', ',') + ' Std./Wo.' : ''].filter(Boolean).join(' · ')) + '</div>' +
              '<div style="display:flex;justify-content:space-between;margin-top:.3rem" class="klein"><span style="color:var(--gold-dunkel)">' + sterne(x.bewertung) + '</span><span>' + (x.termin ? '📅 ' + termin(x.termin) : '') + (x.dokumente ? ' 📎' + x.dokumente : '') + '</span></div>' + (x.loeschfaellig ? '<span class="marke rot">löschen</span>' : '') + '</div>';
          }).join('') + '</div></div>';
        }).join('') + '</div><p class="leise klein"><span class="nur-maus">Karte in eine andere Spalte ziehen ändert den Status.</span><span class="nur-touch">Karte antippen und in der Bewerberakte den Status wählen.</span> „Eingestellt" geht nur über die Bewerberakte (dabei entsteht die Personalakte).</p>';
        $$('[data-bw]', b).forEach(function (k) { k.onclick = function () { location.hash = '#kandidat/' + k.dataset.bw; }; k.ondragstart = function (e) { e.dataTransfer.setData('text/plain', k.dataset.bw); }; });
        $$('[data-bwspalte]', b).forEach(function (s) {
          s.ondragover = function (e) { e.preventDefault(); s.classList.add('ziel'); }; s.ondragleave = function () { s.classList.remove('ziel'); };
          s.ondrop = fehler(async function (e) { e.preventDefault(); s.classList.remove('ziel'); const id = Number(e.dataTransfer.getData('text/plain')); if (!id) return;
            if (s.dataset.bwspalte === 'eingestellt') { location.hash = '#kandidat/' + id; return; }
            const grund = s.dataset.bwspalte === 'absage' ? prompt('Grund der Absage (intern)') : ''; if (grund === null) return;
            await holen('/api/bewerber/status', { id: id, status: s.dataset.bwspalte, grund: grund }); meldung('Status geändert'); A.bewerber(); });
        });
      } else if (reiterB === 'liste') {
        b.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem"><label class="feld">Suche<input id="bwSuche" value="' + esc(suche) + '" placeholder="Name, Position, Ort"></label></div><div id="bwListe"></div>';
        const liste = function () {
          const s = suche.toLowerCase(), l = d.liste.filter(function (x) { return !s || [x.vorname, x.nachname, x.position, x.ort, x.einsatzgebiet].join(' ').toLowerCase().includes(s); });
          $('#bwListe').innerHTML = l.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Name</th><th>Position</th><th>Wunsch</th><th>verfügbar ab</th><th>Termin</th><th>Bewertung</th><th>Status</th></tr></thead><tbody>' + l.map(function (x) { return '<tr style="cursor:pointer" data-bw="' + x.id + '"><td><b>' + esc([x.vorname, x.nachname].filter(Boolean).join(' ')) + '</b><br><span class="leise klein">' + esc([x.telefon, x.ort].filter(Boolean).join(' · ')) + '</span></td><td>' + esc(x.position || '') + '</td><td>' + esc((BESCH.find(function (y) { return y[0] === x.beschaeftigungsart; }) || [0, ''])[1]) + (x.stunden_wunsch ? ' · ' + String(x.stunden_wunsch).replace('.', ',') + ' Std.' : '') + '</td><td>' + (x.verfuegbar_ab ? datumDe(x.verfuegbar_ab) : '') + '</td><td>' + termin(x.termin) + '</td><td style="color:var(--gold-dunkel)">' + sterne(x.bewertung) + '</td><td><span class="marke ' + (x.status === 'absage' ? 'grau' : x.status === 'eingestellt' ? '' : 'gold') + '">' + esc(x.statusText) + '</span></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Keine Bewerbung.</div>';
          $$('[data-bw]', b).forEach(function (z) { z.onclick = function () { location.hash = '#kandidat/' + z.dataset.bw; }; });
        };
        $('#bwSuche').oninput = function () { suche = this.value; liste(); }; liste();
      } else if (reiterB === 'fristen') {
        const l = d.liste.filter(function (x) { return x.status === 'absage'; });
        b.innerHTML = l.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Name</th><th>Absage am</th><th>Löschung ab</th><th>Talentpool</th><th></th></tr></thead><tbody>' + l.map(function (x) { return '<tr><td><a href="#kandidat/' + x.id + '"><b>' + esc([x.vorname, x.nachname].filter(Boolean).join(' ')) + '</b></a></td><td>' + (x.absage_am ? datumDe(x.absage_am) : '') + '</td><td>' + (x.talentpool ? '<span class="leise">entfällt</span>' : x.loeschfaellig ? '<b style="color:var(--rot)">' + datumDe(x.loeschen_ab) + '</b>' : datumDe(x.loeschen_ab || '')) + '</td><td>' + (x.talentpool ? '<span class="marke">Einwilligung</span>' : '–') + '</td><td>' + (x.loeschfaellig ? '<button class="knopf zweit klein" data-bwloeschen="' + x.id + '">jetzt löschen</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div><p class="leise klein">Bewerberdaten dürfen nach einer Absage nur so lange bleiben, wie Ansprüche drohen (2 Monate nach § 15 Abs. 4 AGG plus Klagefrist) — üblich sind 6 Monate. Länger nur mit Einwilligung für den Talentpool.</p>' : '<div class="karte leer">Keine Absagen mit Löschfrist.</div>';
        $$('[data-bwloeschen]', b).forEach(function (k) { k.onclick = fehler(async function () { if (!confirm('Bewerbung mit allen Unterlagen endgültig löschen?')) return; await holen('/api/bewerber/loeschen', { id: Number(k.dataset.bwloeschen) }); meldung('Gelöscht'); A.bewerber(); }); });
      } else {
        b.innerHTML = '<div class="karte"><table class="tabelle"><thead><tr><th>Quelle</th><th style="text-align:right">Bewerbungen</th><th style="text-align:right">eingestellt</th><th style="text-align:right">Quote</th></tr></thead><tbody>' + kz.quellen.map(function (q) { return '<tr><td>' + esc(q.text) + '</td><td style="text-align:right">' + q.n + '</td><td style="text-align:right">' + (q.eingestellt || 0) + '</td><td style="text-align:right">' + (q.n ? Math.round((q.eingestellt || 0) / q.n * 100) : 0) + ' %</td></tr>'; }).join('') + '</tbody></table></div>';
      }
    }
    zeigen();
  };

  function formular(x, d) {
    const feld = G.feld, wahl = G.auswahl;
    G.schublade('<h2>' + (x.id ? 'Bewerbung bearbeiten' : 'Bewerbung erfassen') + '</h2><div class="formular" style="margin-top:1rem">' +
      feld('vorname', 'Vorname', x.vorname) + feld('nachname', 'Nachname', x.nachname) + feld('telefon', 'Telefon', x.telefon) + feld('email', 'E-Mail', x.email, 'email') + feld('strasse', 'Straße', x.strasse) + feld('plz', 'PLZ', x.plz) + feld('ort', 'Ort', x.ort) +
      feld('position', 'Position / Tätigkeit', x.position || 'Reinigungskraft') + wahl('beschaeftigungsart', 'Beschäftigung', BESCH, x.beschaeftigungsart) + feld('stunden_wunsch', 'Wunschstunden je Woche', x.stunden_wunsch, 'number', ' step="0.5"') + feld('verfuegbar_ab', 'verfügbar ab', x.verfuegbar_ab, 'date') +
      feld('einsatzgebiet', 'Einsatzgebiet / Mobilität', x.einsatzgebiet) + feld('sprachen', 'Sprachen', x.sprachen) + feld('fuehrerschein', 'Führerschein', x.fuehrerschein) + feld('staatsangehoerigkeit', 'Staatsangehörigkeit', x.staatsangehoerigkeit) +
      wahl('arbeitserlaubnis', 'Arbeitserlaubnis', [['', '—'], ['ja', 'ja, uneingeschränkt'], ['eingeschraenkt', 'mit Auflagen'], ['nein', 'nein / noch offen']], x.arbeitserlaubnis) + wahl('quelle', 'Quelle', d.quellen, x.quelle) +
      wahl('bewertung', 'Bewertung', [['', '—'], ['1', '★'], ['2', '★★'], ['3', '★★★'], ['4', '★★★★'], ['5', '★★★★★']], x.bewertung || '') + feld('termin', 'Termin (Gespräch / Probearbeit)', x.termin, 'datetime-local') +
      wahl('talentpool', 'Einwilligung Talentpool (Daten bleiben nach Absage)', [['0', 'nein'], ['1', 'ja, schriftlich erteilt']], x.talentpool ? '1' : '0') + '<label class="feld" style="grid-column:1/-1">Notiz<textarea name="notiz" rows="3">' + esc(x.notiz || '') + '</textarea></label></div>' + G.knoepfe(x.id ? 'Speichern' : 'Erfassen'), function (w) {
      $('#speichern', w).onclick = fehler(async function () { const f = G.formDaten(w); f.id = x.id; const r = await holen('/api/bewerber', f); G.schubladeZu(); meldung('Gespeichert'); if (x.id) A.kandidat(x.id); else location.hash = '#kandidat/' + r.id; });
    });
  }

  A.kandidat = async function kandidat(id) {
    const [x, d] = await Promise.all([holen('/api/bewerber?id=' + id), holen('/api/bewerber')]);
    const name = [x.vorname, x.nachname].filter(Boolean).join(' ');
    G.kopf('Bewerber · ' + x.statusText, esc(name), esc([x.position, (BESCH.find(function (y) { return y[0] === x.beschaeftigungsart; }) || [0, ''])[1], x.stunden_wunsch ? String(x.stunden_wunsch).replace('.', ',') + ' Std./Woche' : '', x.verfuegbar_ab ? 'verfügbar ab ' + datumDe(x.verfuegbar_ab) : ''].filter(Boolean).join(' · ')) + (x.telefon ? ' · <a href="tel:' + esc(x.telefon) + '">' + esc(x.telefon) + '</a>' : '') + (x.email ? ' · <a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' : ''),
      (x.status !== 'eingestellt' ? '<button class="knopf gold" id="bwEinstellen">Einstellen</button><button class="knopf hell" id="bwBearbeiten">Bearbeiten</button>' : '<a class="knopf gold" href="#person/' + x.mitarbeiter_id + '">Zur Personalakte</a>') + '<a class="knopf hell" href="#bewerber">Alle Bewerber</a>');
    inhalt.innerHTML = (x.status === 'absage' ? '<div class="hinweis" style="margin-bottom:1rem">Absage am ' + datumDe(x.absage_am || '') + (x.absage_grund ? ' (' + esc(x.absage_grund) + ')' : '') + ' · ' + (x.talentpool ? 'Talentpool — keine Löschfrist' : 'Löschung ab ' + datumDe(x.loeschen_ab || '')) + '</div>' : '') +
      (x.status !== 'eingestellt' ? '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap"><span class="leise">Status:</span><div style="display:flex;gap:.4rem;flex-wrap:wrap">' + d.status.filter(function (s) { return s[0] !== 'eingestellt'; }).map(function (s) { return '<button class="knopf ' + (s[0] === x.status ? '' : 'zweit ') + 'klein" data-bwstatus="' + s[0] + '">' + esc(s[1]) + '</button>'; }).join('') + '</div></div>' : '') +
      '<div class="raster k2"><div class="karte"><div class="ueberzeile">Angaben</div><table class="tabelle"><tbody>' + [['Anschrift', [x.strasse, [x.plz, x.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')], ['Einsatzgebiet', x.einsatzgebiet], ['Sprachen', x.sprachen], ['Führerschein', x.fuehrerschein], ['Staatsangehörigkeit', x.staatsangehoerigkeit], ['Arbeitserlaubnis', { ja: 'ja', eingeschraenkt: 'mit Auflagen', nein: 'nein / offen' }[x.arbeitserlaubnis]], ['Quelle', (d.quellen.find(function (q) { return q[0] === x.quelle; }) || [0, ''])[1]], ['Bewertung', sterne(x.bewertung)], ['Termin', termin(x.termin)], ['Talentpool', x.talentpool ? 'Einwilligung erteilt' : 'nein'], ['Notiz', x.notiz]].map(function (z) { return '<tr><td class="leise" style="width:38%">' + z[0] + '</td><td>' + (z[0] === 'Bewertung' ? '<span style="color:var(--gold-dunkel)">' + (z[1] || '—') + '</span>' : esc(z[1] || '—')) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div><div class="karte"><div class="ueberzeile">Unterlagen</div>' + (x.dokumente.length ? x.dokumente.map(function (u) { return '<div class="zeile" style="padding:.3rem 0"><a target="_blank" href="/api/bewerber/dokument?id=' + u.id + '">' + esc(u.titel || 'Unterlage') + '</a>' + (x.status !== 'eingestellt' ? '<button class="knopf zweit klein" data-bwdokweg="' + u.id + '">entfernen</button>' : '') + '</div>'; }).join('') : '<div class="leise klein">Noch keine Unterlagen.</div>') +
      (x.status !== 'eingestellt' ? '<div style="display:flex;gap:.5rem;margin-top:.6rem;align-items:end;flex-wrap:wrap"><label class="feld">Datei (PDF/Bild)<input type="file" id="bwDatei" accept="application/pdf,image/*"></label><button class="knopf zweit klein" id="bwHoch">Hochladen</button></div>' : '') + '</div>' +
      '<div class="karte" style="margin-top:1rem"><div class="ueberzeile">Verlauf</div><div style="display:flex;gap:.4rem;margin:.4rem 0 .6rem"><input id="bwNotiz" placeholder="Notiz, Anruf, Eindruck …" style="flex:1"><button class="knopf zweit klein" id="bwNotizNeu">+</button></div>' + x.verlauf.map(function (v) { return '<div style="padding:.3rem 0;border-bottom:1px solid var(--linie)"><span class="leise klein">' + esc(datumDe(v.zeit.slice(0, 10)) + ' ' + v.zeit.slice(11, 16)) + (v.von ? ' · ' + esc(v.von) : '') + '</span><br>' + esc(v.text) + '</div>'; }).join('') + '</div></div></div>' +
      (x.status === 'absage' || x.loeschen_ab ? '<div style="margin-top:1rem"><button class="knopf zweit" id="bwLoeschen">Bewerbung jetzt löschen</button></div>' : '');
    const neu = function () { A.kandidat(id); };
    const k = (sel, fn) => { const e = $(sel); if (e) e.onclick = fn; };
    k('#bwBearbeiten', function () { formular(x, d); });
    $$('[data-bwstatus]').forEach(function (b) { b.onclick = fehler(async function () { const s = b.dataset.bwstatus; if (s === x.status) return; const grund = s === 'absage' ? prompt('Grund der Absage (intern)') : ''; if (grund === null) return; await holen('/api/bewerber/status', { id: x.id, status: s, grund: grund }); meldung('Status: ' + b.textContent); neu(); }); });
    k('#bwEinstellen', function () {
      G.schublade('<h2>' + esc(name) + ' einstellen</h2><p class="leise klein">Glanzwerk legt den Mitarbeiter mit Personalakte an (Name, Kontakt, Anschrift, Beschäftigung, Eintritt) und übernimmt die Unterlagen. Danach die Akte ergänzen und den Personalfragebogen ausfüllen lassen.</p><div class="formular" style="margin-top:1rem">' + G.feld('eintritt', 'Eintritt', x.verfuegbar_ab || heute(), 'date') + G.feld('lohngruppe', 'Lohngruppe', 'LG 1') + G.auswahl('sprache', 'Sprache der App', Object.keys(G.SPRACHEN).map(function (s) { return [s, G.SPRACHEN[s]]; }), 'de') + '</div>' + G.knoepfe('Einstellen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const f = G.formDaten(w); f.id = x.id; const r = await holen('/api/bewerber/einstellen', f); G.schubladeZu(); meldung('Eingestellt — Personalakte angelegt'); location.hash = '#person/' + r.mitarbeiter_id; });
      });
    });
    k('#bwHoch', fehler(async function () {
      const f = $('#bwDatei').files[0]; if (!f) { meldung('Bitte eine Datei wählen'); return; } if (f.size > 10e6) { meldung('Die Datei ist größer als 10 MB'); return; }
      const daten = await new Promise(function (ok, nein) { const r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = nein; r.readAsDataURL(f); });
      await holen('/api/bewerber/dokument', { bewerber_id: x.id, titel: f.name.replace(/\.[^.]+$/, ''), datei: daten }); meldung('Unterlage abgelegt'); neu();
    }));
    $$('[data-bwdokweg]').forEach(function (b) { b.onclick = fehler(async function () { await holen('/api/bewerber/dokument', { id: Number(b.dataset.bwdokweg), loeschen: true }); meldung('Entfernt'); neu(); }); });
    k('#bwNotizNeu', fehler(async function () { const t = $('#bwNotiz').value.trim(); if (!t) return; await holen('/api/bewerber/notiz', { id: x.id, text: t }); neu(); }));
    k('#bwLoeschen', fehler(async function () { if (!confirm('Bewerbung mit allen Unterlagen endgültig löschen?')) return; await holen('/api/bewerber/loeschen', { id: x.id }); meldung('Gelöscht'); location.hash = '#bewerber'; }));
  };
})();
