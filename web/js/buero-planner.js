// buero-planner.js — Aufgaben-Boards wie Microsoft Planner: mehrere Boards (je Abteilung, je Projekt), Spalten
// (frei benennbar, eine davon „erledigt"), Karten mit Zuständigen, Start/Fällig, Priorität, Etiketten, Objekt,
// Checkliste und Kommentaren. Karten per Ziehen verschieben (am Handy: Spalte im Kartenfenster wählen).
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe } = UI;
  const G = window.GW, A = window.GW_ANSICHTEN = window.GW_ANSICHTEN || {};
  const inhalt = G.inhalt;
  const fehler = fn => async function () { try { await fn.apply(this, arguments); } catch (e) { meldung(e.message); } };
  const PRIO = [['niedrig', 'niedrig', 'grau'], ['mittel', 'mittel', 'grau'], ['hoch', 'hoch', 'orange'], ['dringend', 'dringend', 'rot']];
  const prio = p => PRIO.find(function (x) { return x[0] === p; }) || PRIO[1];

  A.planner = async function planner() {
    const l = await holen('/api/planner/boards');
    G.kopf('Planner', 'Aufgaben, die <span class="akzent">erledigt</span> werden', 'Boards je Abteilung oder Projekt — Karten zuweisen, mit Fälligkeit und Checkliste, im Chat besprechen. Zugewiesene Aufgaben sehen die Mitarbeiter auch in der App.', '<button class="knopf gold" id="neuBoard">+ Board</button>');
    inhalt.innerHTML = '<div class="raster k3">' + l.map(function (b) {
      return '<div class="karte klickbar" data-board="' + b.id + '"><div class="ueberzeile">Board</div><h3>' + esc(b.name) + '</h3><div class="leise klein">' + esc(b.beschreibung || '') + '</div><div style="display:flex;gap:.4rem;margin-top:.8rem;flex-wrap:wrap"><span class="marke gold">' + b.offen + ' offen</span>' + (b.ueberfaellig ? '<span class="marke rot">' + b.ueberfaellig + ' überfällig</span>' : '') + (b.meine ? '<span class="marke">' + b.meine + ' für mich</span>' : '') + '<span class="marke grau">' + b.aufgaben + ' gesamt</span></div></div>';
    }).join('') + '</div>';
    $$('[data-board]').forEach(function (k) { k.onclick = function () { location.hash = '#board/' + k.dataset.board; }; });
    $('#neuBoard').onclick = function () { boardForm({}); };
  };
  function boardForm(b) {
    G.schublade('<h2>' + (b.id ? 'Board bearbeiten' : 'Neues Board') + '</h2><div class="formular" style="margin-top:1rem">' + G.feld('name', 'Name', b.name) + G.feld('beschreibung', 'Beschreibung', b.beschreibung) + '</div>' + G.knoepfe(b.id ? 'Speichern' : 'Anlegen', b.id ? '<button class="knopf zweit" id="boardArchiv">Archivieren</button>' : ''), function (w) {
      $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = b.id; const r = await holen('/api/planner/board', d); G.schubladeZu(); meldung('Gespeichert'); location.hash = '#board/' + r.id; G.route(); });
      const a = $('#boardArchiv', w); if (a) a.onclick = fehler(async function () { if (!confirm('Board archivieren? Die Karten bleiben erhalten, das Board verschwindet aus der Liste.')) return; await holen('/api/planner/board', { id: b.id, archivieren: true }); G.schubladeZu(); location.hash = '#planner'; });
    });
  }

  let filterB = { nur: '', suche: '', prio: '' };
  A.board = async function board(id) {
    const [b, komm, obj] = await Promise.all([holen('/api/planner/board?id=' + id), holen('/api/komm/uebersicht'), G.objekteListe()]);
    const personen = [{ id: komm.ich, name: 'ich' }].concat(komm.personen);
    G.kopf('Planner · Board', esc(b.name), esc(b.beschreibung || ''), '<button class="knopf gold" id="bNeu">+ Aufgabe</button><button class="knopf hell" id="bSpalte">+ Spalte</button><button class="knopf hell" id="bBearb">Board bearbeiten</button><a class="knopf hell" href="#planner">Alle Boards</a>');
    inhalt.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap"><div style="display:flex;gap:.5rem;align-items:end;flex-wrap:wrap"><label class="feld">Suche<input id="bSuche" value="' + esc(filterB.suche) + '"></label><label class="feld">Zuständig<select id="bNur"><option value="">alle</option>' + personen.map(function (p) { return '<option value="' + esc(p.id) + '"' + (filterB.nur === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '<option value="-"' + (filterB.nur === '-' ? ' selected' : '') + '>niemand</option></select></label><label class="feld">Priorität<select id="bPrio"><option value="">alle</option>' + PRIO.map(function (p) { return '<option value="' + p[0] + '"' + (filterB.prio === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></label></div><span class="leise klein"><span class="nur-maus">Karten mit der Maus in eine andere Spalte ziehen.</span><span class="nur-touch">Karte antippen → Bearbeiten → Spalte wählen.</span></span></div><div class="board" id="bSpalten"></div>';
    const passt = a => (!filterB.nur || (filterB.nur === '-' ? !a.zustaendig : a.zustaendig === filterB.nur)) && (!filterB.prio || a.prioritaet === filterB.prio) && (!filterB.suche || [a.titel, a.beschreibung, a.labels, a.objekt, a.zustaendig_name].join(' ').toLowerCase().includes(filterB.suche.toLowerCase()));
    function zeichnen() {
      $('#bSpalten').innerHTML = b.spalten.map(function (s) {
        const l = s.aufgaben.filter(passt);
        return '<div class="board-spalte" data-spalte="' + s.id + '"><div class="board-spaltenkopf"><b>' + esc(s.name) + '</b> <span class="leise klein">' + l.length + '</span>' + (s.erledigt ? ' <span class="marke">erledigt</span>' : '') + '<button class="knopf zweit klein" data-spaltebearb="' + s.id + '" title="Spalte bearbeiten" style="margin-left:auto">…</button></div>' +
          '<div class="board-karten">' + l.map(function (a) {
            const p = prio(a.prioritaet), ueber = !a.erledigt && a.faellig && a.faellig < heute();
            return '<div class="board-karte' + (a.erledigt ? ' fertig' : '') + '" draggable="true" data-karte="' + a.id + '">' + (a.labels ? '<div class="klein" style="color:var(--gold-dunkel);font-weight:700">' + esc(a.labels) + '</div>' : '') + '<b>' + esc(a.titel) + '</b>' +
              '<div class="leise klein" style="margin-top:.3rem;display:flex;gap:.5rem;flex-wrap:wrap">' + (a.faellig ? '<span style="' + (ueber ? 'color:var(--rot);font-weight:700' : '') + '">📅 ' + datumDe(a.faellig) + '</span>' : '') + (a.punkte ? '<span>☑ ' + a.punkteFertig + '/' + a.punkte + '</span>' : '') + (a.kommentare ? '<span>💬 ' + a.kommentare + '</span>' : '') + (a.objekt ? '<span>🏢 ' + esc(a.objekt) + '</span>' : '') + '</div>' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:.4rem"><span class="marke ' + p[2] + '">' + p[1] + '</span><span class="klein">' + esc(a.zustaendig_name || '—') + '</span></div></div>';
          }).join('') + '</div><button class="knopf zweit klein" data-neuin="' + s.id + '" style="width:100%;margin-top:.4rem">+ Aufgabe</button></div>';
      }).join('');
      $$('[data-karte]').forEach(function (k) {
        k.onclick = function () { karte(Number(k.dataset.karte)); };
        k.ondragstart = function (e) { e.dataTransfer.setData('text/plain', k.dataset.karte); k.classList.add('zieht'); };
        k.ondragend = function () { k.classList.remove('zieht'); };
      });
      $$('[data-spalte]').forEach(function (s) {
        s.ondragover = function (e) { e.preventDefault(); s.classList.add('ziel'); };
        s.ondragleave = function () { s.classList.remove('ziel'); };
        s.ondrop = fehler(async function (e) {
          e.preventDefault(); s.classList.remove('ziel');
          const kid = Number(e.dataTransfer.getData('text/plain')); if (!kid) return;
          const karten = $$('[data-karte]', s), y = e.clientY; let index = karten.length;
          for (let i = 0; i < karten.length; i++) { const r = karten[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { index = i; break; } }
          await holen('/api/planner/verschieben', { id: kid, spalte_id: Number(s.dataset.spalte), index: index }); neu();
        });
      });
      $$('[data-neuin]').forEach(function (k) { k.onclick = function () { karteForm({ spalte_id: Number(k.dataset.neuin) }); }; });
      $$('[data-spaltebearb]').forEach(function (k) { k.onclick = function (e) { e.stopPropagation(); spalteForm(b.spalten.find(function (s) { return s.id === Number(k.dataset.spaltebearb); })); }; });
    }
    const neu = async function () { const x = await holen('/api/planner/board?id=' + id); b.spalten = x.spalten; zeichnen(); };
    function karteForm(a) {
      G.schublade('<h2>' + (a.id ? 'Aufgabe bearbeiten' : 'Neue Aufgabe') + '</h2><div class="formular" style="margin-top:1rem">' + G.feld('titel', 'Aufgabe', a.titel) + '<label class="feld" style="grid-column:1/-1">Beschreibung<textarea name="beschreibung" rows="4">' + esc(a.beschreibung || '') + '</textarea></label>' +
        G.auswahl('spalte_id', 'Spalte', b.spalten.map(function (s) { return [s.id, s.name]; }), a.spalte_id) + G.auswahl('zustaendig', 'Zuständig', [['', '— offen —']].concat(personen.map(function (p) { return [p.id, p.name + (p.art ? ' · ' + p.art : '')]; })), a.zustaendig || '') +
        G.feld('start', 'Start', a.start, 'date') + G.feld('faellig', 'Fällig', a.faellig, 'date') + G.auswahl('prioritaet', 'Priorität', PRIO.map(function (p) { return [p[0], p[1]]; }), a.prioritaet || 'mittel') +
        G.auswahl('objekt_id', 'Objekt', [['', '—']].concat(obj.map(function (o) { return [o.id, o.name]; })), a.objekt_id || '') + G.feld('labels', 'Etiketten (Komma-getrennt)', a.labels) + '</div>' +
        G.knoepfe(a.id ? 'Speichern' : 'Anlegen', a.id ? '<button class="knopf zweit" id="kLoeschen">Löschen</button>' : ''), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = a.id; d.board_id = b.id; await holen('/api/planner/aufgabe', d); G.schubladeZu(); meldung('Gespeichert'); neu(); if (window.KOMM) window.KOMM.aktualisieren(); });
        const l = $('#kLoeschen', w); if (l) l.onclick = fehler(async function () { if (!confirm('Aufgabe löschen?')) return; await holen('/api/planner/aufgabe', { id: a.id, loeschen: true }); G.schubladeZu(); meldung('Gelöscht'); neu(); });
      });
    }
    async function karte(kid) {
      const a = await holen('/api/planner/aufgabe?id=' + kid), p = prio(a.prioritaet);
      G.schublade('<div class="ueberzeile">' + esc(a.board) + '</div><h2>' + esc(a.titel) + '</h2><div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:.4rem 0 .8rem"><span class="marke ' + p[2] + '">' + p[1] + '</span>' + (a.erledigt ? '<span class="marke">erledigt</span>' : '') + (a.faellig ? '<span class="marke' + (!a.erledigt && a.faellig < heute() ? ' rot' : ' grau') + '">fällig ' + datumDe(a.faellig) + '</span>' : '') + (a.objekt ? '<span class="marke grau">' + esc(a.objekt) + '</span>' : '') + (a.labels ? '<span class="marke gold">' + esc(a.labels) + '</span>' : '') + '</div>' +
        '<table class="tabelle"><tbody><tr><td class="leise">Zuständig</td><td>' + esc(a.zustaendig_name || '—') + '</td></tr><tr><td class="leise">Angelegt</td><td>' + esc(a.angelegt_von_name || '—') + ' · ' + datumDe(a.angelegt_am.slice(0, 10)) + '</td></tr>' + (a.start ? '<tr><td class="leise">Start</td><td>' + datumDe(a.start) + '</td></tr>' : '') + '</tbody></table>' +
        (a.beschreibung ? '<p style="white-space:pre-wrap">' + esc(a.beschreibung) + '</p>' : '') +
        '<div class="ueberzeile" style="margin-top:1rem">Checkliste</div><div id="kPunkte">' + a.punkte.map(function (x) { return '<div style="display:flex;gap:.5rem;align-items:center;padding:.2rem 0"><input type="checkbox" data-kp="' + x.id + '"' + (x.erledigt ? ' checked' : '') + '> <span style="flex:1' + (x.erledigt ? ';text-decoration:line-through;opacity:.6' : '') + '">' + esc(x.text) + '</span><button class="knopf zweit klein" data-kpweg="' + x.id + '">✕</button></div>'; }).join('') + '</div><div style="display:flex;gap:.4rem;margin-top:.4rem"><input id="kPunkt" placeholder="Punkt hinzufügen" style="flex:1"><button class="knopf zweit klein" id="kPunktNeu">+</button></div>' +
        '<div class="ueberzeile" style="margin-top:1rem">Kommentare</div>' + (a.kommentare.map(function (k) { return '<div class="hinweis" style="margin-top:.4rem;background:var(--grau-50);border-color:var(--linie);color:inherit"><b>' + esc(k.von_name) + '</b> <span class="leise klein">' + esc(datumDe(k.zeit.slice(0, 10)) + ' ' + k.zeit.slice(11, 16)) + '</span><br>' + esc(k.text) + '</div>'; }).join('') || '<div class="leise klein">Noch keine.</div>') +
        '<div style="display:flex;gap:.4rem;margin-top:.5rem"><input id="kKom" placeholder="Kommentar …" style="flex:1"><button class="knopf zweit klein" id="kKomNeu">Senden</button></div>' +
        '<div style="display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap"><button class="knopf" id="kErl">' + (a.erledigt ? 'Wieder öffnen' : 'Erledigt') + '</button><button class="knopf zweit" id="kBearb">Bearbeiten</button>' + (a.zustaendig ? '<button class="knopf zweit" id="kChat">Nachricht an ' + esc(a.zustaendig_name) + '</button>' : '') + '<button class="knopf zweit" id="abbrechen">Schließen</button></div>', function (w) {
        const wieder = function () { karte(kid); neu(); };
        $$('[data-kp]', w).forEach(function (c) { c.onchange = fehler(async function () { await holen('/api/planner/punkt', { aufgabe_id: a.id, id: Number(c.dataset.kp), erledigt: c.checked }); wieder(); }); });
        $$('[data-kpweg]', w).forEach(function (c) { c.onclick = fehler(async function () { await holen('/api/planner/punkt', { aufgabe_id: a.id, id: Number(c.dataset.kpweg), loeschen: true }); wieder(); }); });
        $('#kPunktNeu', w).onclick = fehler(async function () { const t = $('#kPunkt', w).value.trim(); if (!t) return; await holen('/api/planner/punkt', { aufgabe_id: a.id, text: t }); wieder(); });
        $('#kPunkt', w).onkeydown = function (e) { if (e.key === 'Enter') $('#kPunktNeu', w).click(); };
        $('#kKomNeu', w).onclick = fehler(async function () { const t = $('#kKom', w).value.trim(); if (!t) return; await holen('/api/planner/kommentar', { aufgabe_id: a.id, text: t }); wieder(); });
        $('#kErl', w).onclick = fehler(async function () { await holen('/api/planner/erledigt', { id: a.id, erledigt: !a.erledigt }); meldung(a.erledigt ? 'Wieder offen' : 'Erledigt'); wieder(); });
        $('#kBearb', w).onclick = function () { karteForm(a); };
        const c = $('#kChat', w); if (c) c.onclick = function () { G.schubladeZu(); if (window.KOMM) window.KOMM.direkt(a.zustaendig); };
      });
    }
    function spalteForm(s) {
      G.schublade('<h2>Spalte „' + esc(s.name) + '"</h2><div class="formular" style="margin-top:1rem">' + G.feld('name', 'Name', s.name) + G.auswahl('erledigt', 'Karten in dieser Spalte gelten als', [['0', 'offen'], ['1', 'erledigt']], s.erledigt ? '1' : '0') + '</div>' + G.knoepfe('Speichern', '<button class="knopf zweit" id="spLoeschen">Spalte löschen</button>'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); await holen('/api/planner/spalte', { id: s.id, name: d.name, erledigt: d.erledigt === '1' }); G.schubladeZu(); neu(); });
        $('#spLoeschen', w).onclick = fehler(async function () { if (!confirm('Spalte löschen? Ihre Karten wandern in die erste Spalte.')) return; await holen('/api/planner/spalte', { id: s.id, loeschen: true }); G.schubladeZu(); neu(); });
      });
    }
    $('#bNeu').onclick = function () { karteForm({ spalte_id: b.spalten[0] && b.spalten[0].id }); };
    $('#bSpalte').onclick = fehler(async function () { const n = prompt('Name der neuen Spalte'); if (!n) return; await holen('/api/planner/spalte', { board_id: b.id, name: n }); neu(); });
    $('#bBearb').onclick = function () { boardForm(b); };
    $('#bSuche').oninput = function () { filterB.suche = this.value; zeichnen(); };
    $('#bNur').onchange = function () { filterB.nur = this.value; zeichnen(); };
    $('#bPrio').onchange = function () { filterB.prio = this.value; zeichnen(); };
    zeichnen();
  };
})();
