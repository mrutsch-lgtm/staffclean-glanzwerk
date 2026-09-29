// buero-abrechnung.js — Abrechnung wie in Lexware / SecPlan: Rechnungsübersicht mit Filtern und Kennzahlen, Rechnung frei
// erstellen (Kunde, Zeitraum, mehrere Objekte, Artikel, freie Positionen, Zwischenüberschriften, Nachlass, Reihenfolge,
// Texte), Zahlungen und Teilzahlungen, offene Posten mit Altersstruktur, Mahnwesen (Erinnerung, 1./2./letzte Mahnung,
// Gebühren, Pauschale, Verzugszinsen, Mahnsperre, Mahnlauf, PDF), Artikelstamm, Automatik, Sonderleistungen.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe, ICON } = UI;
  const G = window.GW, A = window.GW_ANSICHTEN = window.GW_ANSICHTEN || {};
  const euro = G.euro, inhalt = G.inhalt;
  const RSTATUS = { entwurf: ['Entwurf', 'grau'], gestellt: ['offen', 'gold'], bezahlt: ['bezahlt', ''], storniert: ['storniert', 'rot'] };
  const ASTATUS = { angefragt: ['angefragt', 'rot'], 'bestätigt': ['bestätigt', 'gold'], erledigt: ['erledigt', ''], abgerechnet: ['abgerechnet', 'grau'], abgelehnt: ['abgelehnt', 'grau'] };
  const STUFE = ['Zahlungserinnerung', '1. Mahnung', '2. Mahnung', 'Letzte Mahnung'];
  const ZAHLART = [['ueberweisung', 'Überweisung'], ['lastschrift', 'Lastschrift'], ['bar', 'Bar'], ['verrechnung', 'Verrechnung'], ['ausbuchung', 'Ausbuchung (Forderungsverlust)']];
  const marke = (m, s) => '<span class="marke ' + (m[s] || [s, 'grau'])[1] + '">' + esc((m[s] || [s])[0]) + '</span>';
  const vormonat = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };   // Ortszeit, nicht UTC
  const monatsende = m => m + '-' + String(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()).padStart(2, '0');
  const zahlDe = v => String(v == null ? '' : v).replace('.', ',');
  const textfeld = (n, t, v, zeilen) => '<label class="feld" style="grid-column:1/-1">' + esc(t) + '<textarea name="' + n + '" rows="' + (zeilen || 4) + '">' + esc(v == null ? '' : v) + '</textarea></label>';
  const knopf = (sel, fn, w) => { const k = $(sel, w); if (k) k.onclick = fn; };
  const fehler = fn => async function () { try { await fn.apply(this, arguments); } catch (e) { meldung(e.message); } };

  let reiterAb = 'uebersicht', filter = { status: 'alle', kunde: '', suche: '', jahr: '' };
  A.abrechnung = async function abrechnung(arg) {
    if (arg && ['uebersicht', 'op', 'mahnungen', 'artikel', 'automatik', 'auftraege', 'einstellungen'].indexOf(arg) >= 0) reiterAb = arg;
    G.kopf('Abrechnung', 'Rechnungen, die <span class="akzent">stimmen</span>', 'Rechnungen frei schreiben oder per Abrechnungslauf aus den Objekten erzeugen — pauschal, nach Ist-Stunden, mit Artikeln, Sonderleistungen und Nachlässen. Gestellte Rechnungen sind nummeriert und unveränderlich (ZUGFeRD / XRechnung). Zahlungen, offene Posten und Mahnwesen an einem Ort.',
      '<button class="knopf gold" id="neuRechnung">+ Neue Rechnung</button><button class="knopf hell" id="zuMahnlauf">Mahnlauf</button>');
    inhalt.innerHTML = G.reiter([['uebersicht', 'Rechnungen'], ['op', 'Offene Posten & Mahnwesen'], ['mahnungen', 'Mahnungen'], ['artikel', 'Artikel & Leistungen'], ['automatik', 'Automatik'], ['auftraege', 'Sonderleistungen & Abrufe'], ['einstellungen', 'Einstellungen']], reiterAb, function (r) { reiterAb = r; laden(); }) + '<div id="abBereich"></div>';
    $('#neuRechnung').onclick = neueRechnung;
    $('#zuMahnlauf').onclick = function () { reiterAb = 'op'; A.abrechnung(); };
    async function laden() {
      const b = $('#abBereich');
      if (reiterAb === 'uebersicht') return uebersicht(b);
      if (reiterAb === 'op') return offenePosten(b);
      if (reiterAb === 'mahnungen') return mahnungen(b);
      if (reiterAb === 'artikel') return artikel(b);
      if (reiterAb === 'automatik') return automatik(b);
      if (reiterAb === 'auftraege') return auftraege(b);
      return einstellungen(b);
    }
    laden();
  };

  // ---------------------------------------------------------------- Rechnungsübersicht
  async function uebersicht(b) {
    const [l, kz, kunden] = await Promise.all([holen('/api/rechnungen'), holen('/api/abrechnung/kennzahlen'), holen('/api/kunden')]);
    const kachel = (t, w, z, farbe) => '<div class="karte kennzahl"><div class="ueberzeile">' + esc(t) + '</div><div style="font-size:1.45rem;font-weight:800' + (farbe ? ';color:' + farbe : '') + '">' + w + '</div>' + (z ? '<div class="leise klein">' + z + '</div>' : '') + '</div>';
    const jahre = [...new Set(l.map(function (r) { return (r.datum || r.zeitraum_von || '').slice(0, 4); }).filter(Boolean))].sort().reverse();
    b.innerHTML = '<div class="raster k3" style="margin-bottom:1rem">' +
      kachel('Umsatz ' + heute().slice(0, 4) + ' (netto)', euro(kz.umsatzJahr), 'davon ' + euro(kz.umsatzMonat) + ' im laufenden Monat') +
      kachel('Offene Posten', euro(kz.offen), kz.offenAnzahl + ' Rechnungen · Zahlungseingang im Monat ' + euro(kz.eingangMonat)) +
      kachel('Überfällig', euro(kz.ueberfaellig), kz.ueberfaelligAnzahl + ' Rechnungen · ' + kz.mahnfaellig + ' zum Mahnen fällig', kz.ueberfaellig > 0 ? 'var(--rot)' : '') + '</div>' +
      '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap;gap:.8rem"><div style="display:flex;gap:.5rem;align-items:end;flex-wrap:wrap">' +
      '<label class="feld">Suche<input id="fSuche" placeholder="Nummer, Kunde, Betreff" value="' + esc(filter.suche) + '"></label>' +
      '<label class="feld">Status<select id="fStatus">' + [['alle', 'alle'], ['entwurf', 'Entwürfe' + (kz.entwuerfe ? ' (' + kz.entwuerfe + ')' : '')], ['offen', 'offen'], ['ueberfaellig', 'überfällig'], ['teil', 'teilbezahlt'], ['bezahlt', 'bezahlt'], ['storniert', 'storniert / Storno'], ['gemahnt', 'gemahnt']].map(function (o) { return '<option value="' + o[0] + '"' + (filter.status === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="feld">Kunde<select id="fKunde"><option value="">alle</option>' + kunden.map(function (k) { return '<option value="' + k.id + '"' + (String(filter.kunde) === String(k.id) ? ' selected' : '') + '>' + esc(k.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="feld">Jahr<select id="fJahr"><option value="">alle</option>' + jahre.map(function (j) { return '<option' + (filter.jahr === j ? ' selected' : '') + '>' + j + '</option>'; }).join('') + '</select></label></div>' +
      '<div style="display:flex;gap:.5rem;align-items:end;flex-wrap:wrap"><label class="feld">Abrechnungslauf für<input type="month" id="abMonat" value="' + vormonat() + '"></label><label style="display:flex;gap:.4rem;align-items:center;font-weight:600;margin-bottom:.55rem"><input type="checkbox" id="abStellen"> gleich stellen</label><button class="knopf zweit" id="abErzeugen">Lauf starten</button></div></div>' +
      '<div id="reListe"></div>';
    function zeigen() {
      const s = filter.suche.toLowerCase();
      const f = l.filter(function (r) {
        if (filter.kunde && String(r.kunde_id) !== String(filter.kunde)) return false;
        if (filter.jahr && (r.datum || r.zeitraum_von || '').slice(0, 4) !== filter.jahr) return false;
        if (s && ![r.nummer, r.kunde, r.objekt, r.betreff, r.bestellnummer, r.kundennummer].join(' ').toLowerCase().includes(s)) return false;
        const offen = r.status === 'gestellt' && !r.storno_von;
        return filter.status === 'alle' || (filter.status === 'entwurf' && r.status === 'entwurf') || (filter.status === 'offen' && offen) || (filter.status === 'ueberfaellig' && offen && r.faellig < heute()) ||
          (filter.status === 'teil' && offen && r.bezahlt_summe > 0) || (filter.status === 'bezahlt' && r.status === 'bezahlt') || (filter.status === 'storniert' && (r.status === 'storniert' || r.storno_von)) || (filter.status === 'gemahnt' && r.mahnstufe != null && offen);
      });
      const summe = f.reduce(function (a, r) { return a + (r.storno_von ? 0 : r.brutto); }, 0), offenS = f.reduce(function (a, r) { return a + (r.offen || 0); }, 0);
      $('#reListe').innerHTML = '<div class="zeile" style="margin-bottom:.5rem"><span class="leise">' + f.length + ' Rechnungen · ' + euro(summe) + ' brutto · offen ' + euro(offenS) + '</span><button class="knopf zweit klein" id="reCsv">Liste als Tabelle (CSV)</button></div>' +
        (f.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Nummer</th><th>Datum</th><th>Kunde · Betreff</th><th>Zeitraum</th><th style="text-align:right">Brutto</th><th style="text-align:right">Offen</th><th>Fällig</th><th>Mahnung</th><th>Status</th></tr></thead><tbody>' + f.map(function (r) {
          const ueber = r.status === 'gestellt' && !r.storno_von && r.faellig < heute();
          return '<tr style="cursor:pointer" data-re="' + r.id + '"><td><b>' + esc(r.nummer || '—') + '</b>' + (r.storno_von ? ' <span class="marke rot">Storno</span>' : '') + '</td><td>' + (r.datum ? datumDe(r.datum) : '') + '</td><td>' + esc(r.kunde) + '<br><span class="leise klein">' + esc(r.betreff || r.objekt || 'Sammelrechnung') + '</span></td><td class="klein">' + datumDe(r.zeitraum_von) + (r.zeitraum_bis !== r.zeitraum_von ? ' – ' + datumDe(r.zeitraum_bis) : '') + '</td>' +
            '<td style="text-align:right"><b>' + euro(r.brutto) + '</b></td><td style="text-align:right">' + (r.offen ? (r.bezahlt_summe > 0 ? '<span class="marke gold" title="teilbezahlt">' + euro(r.offen) + '</span>' : euro(r.offen)) : '–') + '</td><td' + (ueber ? ' style="color:var(--rot);font-weight:700"' : '') + '>' + (r.faellig ? datumDe(r.faellig) : '') + '</td>' +
            '<td>' + (r.mahnsperre ? '<span class="marke grau">Sperre</span>' : r.mahnstufe != null ? '<span class="marke rot">' + esc(STUFE[r.mahnstufe]) + '</span>' : '') + '</td><td>' + marke(RSTATUS, r.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="karte leer">Keine Rechnung für diese Auswahl.</div>');
      $$('[data-re]').forEach(function (z) { z.onclick = function () { location.hash = '#rechnung/' + z.dataset.re; }; });
      $('#reCsv').onclick = function () {
        const z = v => { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, bt = v => (Number(v) || 0).toFixed(2).replace('.', ',');
        const csv = '﻿' + ['Nummer;Datum;Kunde;Kundennr.;Betreff/Objekt;von;bis;Netto;Brutto;Offen;Fällig;Status'].concat(f.map(function (r) { return [r.nummer, datumDe(r.datum), r.kunde, r.kundennummer, r.betreff || r.objekt, datumDe(r.zeitraum_von), datumDe(r.zeitraum_bis), bt(r.netto), bt(r.brutto), bt(r.offen), datumDe(r.faellig), (RSTATUS[r.status] || [r.status])[0]].map(z).join(';'); })).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'Rechnungen_' + heute() + '.csv'; a.click();
      };
    }
    $('#fSuche').oninput = function () { filter.suche = this.value; zeigen(); };
    $('#fStatus').onchange = function () { filter.status = this.value; zeigen(); };
    $('#fKunde').onchange = function () { filter.kunde = this.value; zeigen(); };
    $('#fJahr').onchange = function () { filter.jahr = this.value; zeigen(); };
    $('#abErzeugen').onclick = fehler(async function () {
      const r = await holen('/api/rechnung/lauf', { monat: $('#abMonat').value, stellen: $('#abStellen').checked });
      meldung(r.angelegt.length + ' Entwürfe angelegt' + (r.gestellt.length ? ', ' + r.gestellt.length + ' gestellt' : '') + (r.uebersprungen.length ? ', ' + r.uebersprungen.length + ' übersprungen' : ''));
      if (r.uebersprungen.length) G.schublade('<h2>Übersprungen</h2><p class="leise">' + r.angelegt.length + ' Entwürfe angelegt' + (r.gestellt.length ? ', ' + r.gestellt.length + ' gestellt' : '') + '. Hier ist etwas offen:</p>' + r.uebersprungen.map(function (u) { return '<div class="hinweis" style="margin-top:.5rem"><b>' + esc(u.objekt) + '</b><br>' + esc(u.grund) + '</div>'; }).join('') + '<div style="margin-top:1rem"><button class="knopf zweit" id="abbrechen">Schließen</button></div>');
      uebersicht(b);
    });
    zeigen();
  }

  // ---------------------------------------------------------------- Neue Rechnung
  async function neueRechnung() {
    const [kunden, objekte] = await Promise.all([holen('/api/kunden'), G.objekteListe()]);
    const vm = vormonat();
    G.schublade('<h2>Neue Rechnung</h2><p class="leise klein">Kunde und Leistungszeitraum wählen. Leistungen aus Objekten übernimmt Glanzwerk mit Monatspreis, Ist-Stunden, Preisbausteinen und erledigten Sonderleistungen — weitere Positionen, Artikel und Nachlässe fügst du danach hinzu.</p><div class="formular" style="margin-top:1rem">' +
      G.auswahl('kunde_id', 'Kunde', [['', '— bitte wählen —']].concat(kunden.map(function (k) { return [k.id, k.name + (k.kundennummer ? ' (' + k.kundennummer + ')' : '')]; })), '') +
      G.feld('von', 'Leistung von', vm + '-01', 'date') + G.feld('bis', 'Leistung bis', monatsende(vm), 'date') + G.feld('betreff', 'Betreff (optional)', '') + G.feld('bestellnummer', 'Bestellnummer des Kunden (optional)', '') +
      '<div style="grid-column:1/-1" id="nrObjekte"><div class="leise klein">Erst den Kunden wählen, dann erscheinen seine Objekte.</div></div>' + '</div>' + G.knoepfe('Rechnung anlegen'), function (w) {
      $('[name=kunde_id]', w).onchange = function () {
        const kid = Number(this.value), l = objekte.filter(function (o) { return o.kunde_id === kid && o.status === 'aktiv'; });
        $('#nrObjekte').innerHTML = l.length ? '<div class="ueberzeile">Leistungen übernehmen aus</div>' + l.map(function (o) { return '<label style="display:flex;gap:.5rem;align-items:center;padding:.25rem 0"><input type="checkbox" data-nrobj="' + o.id + '"> ' + esc(o.name) + (o.monatspreis ? ' <span class="leise klein">' + euro(o.monatspreis) + ' / Monat</span>' : '') + '</label>'; }).join('') +
          '<label class="feld" style="max-width:220px">für den Monat<input type="month" name="monat" value="' + vm + '"></label>' : '<div class="leise klein">Dieser Kunde hat keine aktiven Objekte — die Rechnung beginnt leer.</div>';
      };
      $('#speichern', w).onclick = fehler(async function () {
        const d = G.formDaten(w); d.objekte = $$('[data-nrobj]', w).filter(function (c) { return c.checked; }).map(function (c) { return Number(c.dataset.nrobj); });
        const r = await holen('/api/rechnung/frei', d); G.schubladeZu();
        meldung('Entwurf angelegt' + (r.hinweise.length ? ' — ' + r.hinweise.length + ' Hinweise' : '')); location.hash = '#rechnung/' + r.id;
        if (r.hinweise.length) setTimeout(function () { G.schublade('<h2>Hinweise</h2>' + r.hinweise.map(function (h) { return '<div class="hinweis" style="margin-top:.5rem">' + esc(h) + '</div>'; }).join('') + '<div style="margin-top:1rem"><button class="knopf zweit" id="abbrechen">Schließen</button></div>'); }, 300);
      });
    });
  }

  // ---------------------------------------------------------------- Rechnung ansehen und bearbeiten
  let aktuelleGruppe = '';
  A.rechnung = async function rechnung(id) {
    const r = await holen('/api/rechnung?id=' + id), entw = r.status === 'entwurf', offen = r.status === 'gestellt' && !r.storno_von;
    const zr = r.zeitraum_von === r.zeitraum_bis ? 'Leistungsdatum ' + datumDe(r.zeitraum_von) : 'Leistungszeitraum ' + datumDe(r.zeitraum_von) + ' – ' + datumDe(r.zeitraum_bis);
    G.kopf('Rechnung · ' + r.kunde, (r.nummer ? esc(r.nummer) : 'Entwurf') + ' ' + marke(RSTATUS, r.status), esc(r.betreff || r.objekt || 'Sammelrechnung') + ' · ' + zr + (r.datum ? ' · Rechnungsdatum ' + datumDe(r.datum) + ' · fällig ' + datumDe(r.faellig) : '') + (r.bestellnummer ? ' · Bestellnr. ' + esc(r.bestellnummer) : '') + (r.bezahlt_am ? ' · bezahlt am ' + datumDe(r.bezahlt_am) : '') + (r.storno_nummer ? ' · Storno zu ' + esc(r.storno_nummer) : '') + (r.storniert_durch ? ' · storniert durch ' + esc(r.storniert_durch) : '') + (r.mahnsperre ? ' · <b>Mahnsperre</b>' + (r.mahnsperre_grund ? ': ' + esc(r.mahnsperre_grund) : '') : ''),
      (entw ? '<button class="knopf gold" id="reStellen">Rechnung stellen</button><button class="knopf hell" id="reKopf">Kopfdaten & Texte</button>' : '') +
      '<a class="knopf hell" id="rePdf" href="/api/rechnung/pdf?id=' + r.id + '" target="_blank">' + (entw ? 'PDF-Vorschau' : 'PDF (ZUGFeRD)') + '</a>' +
      (r.nummer ? '<a class="knopf hell" id="rePdfLaden" href="/api/rechnung/pdf?download=1&id=' + r.id + '">PDF herunterladen</a><a class="knopf hell" href="/api/rechnung/xrechnung?id=' + r.id + '">XRechnung</a>' : '') +
      (offen ? '<button class="knopf hell" id="reZahlung">Zahlung buchen</button><button class="knopf hell" id="reBezahlt">Voll bezahlt</button><button class="knopf hell" id="reMahnen">Mahnen</button><button class="knopf hell" id="reSperre">' + (r.mahnsperre ? 'Mahnsperre aufheben' : 'Mahnsperre') + '</button>' : '') +
      (r.status === 'bezahlt' ? '<button class="knopf hell" id="reOffen">Wieder offen</button>' : '') +
      (!r.storno_von ? '<button class="knopf hell" id="reKopie">Als Vorlage kopieren</button>' : '') +
      ((r.status === 'gestellt' || r.status === 'bezahlt') && !r.storno_von ? '<button class="knopf hell" id="reStorno">Stornieren</button>' : '') +
      (entw ? '<button class="knopf hell" id="reLoeschen">Entwurf löschen</button>' : '') + '<a class="knopf hell" href="#abrechnung">Alle Rechnungen</a>');
    // Positionen nach Gruppe (Objekt / Zwischenüberschrift) gegliedert wie im PDF
    const gruppen = []; r.positionen.forEach(function (p) { const g = p.gruppe || ''; let x = gruppen.find(function (z) { return z.name === g; }); if (!x) { x = { name: g, pos: [] }; gruppen.push(x); } x.pos.push(p); });
    const mitG = gruppen.length > 1 || (gruppen[0] && gruppen[0].name);
    const alleGruppen = [...new Set(r.positionen.map(function (p) { return p.gruppe; }).filter(Boolean))];
    let nr = 0;
    const zeilen = gruppen.map(function (g, gi) {
      return (mitG ? '<tr style="background:var(--grau-50)"><td><b>' + (gi + 1) + '</b></td><td colspan="' + (entw ? 6 : 5) + '"><b>' + esc(g.name || 'Weitere Positionen') + '</b></td></tr>' : '') + g.pos.map(function (p, pi) {
        nr++;
        return '<tr><td>' + (mitG ? (gi + 1) + '.' + (pi + 1) : nr) + '</td><td style="white-space:pre-line">' + esc(p.bezeichnung) + (p.quelle && p.quelle !== 'hand' ? ' <span class="marke grau klein">' + esc({ pauschale: 'Pauschale', stunden: 'Ist-Stunden', preisposition: 'Baustein', auftrag: 'Sonderleistung', artikel: 'Artikel', storno: 'Storno' }[p.quelle] || p.quelle) + '</span>' : '') + '</td><td style="text-align:right">' + zahlDe(p.menge) + '</td><td>' + esc(p.einheit || '') + '</td><td style="text-align:right">' + euro(p.einzelpreis) + '</td><td style="text-align:right"><b>' + euro(p.betrag) + '</b></td>' +
          (entw ? '<td style="white-space:nowrap"><button class="knopf zweit klein" data-hoch="' + p.id + '" title="nach oben">▲</button> <button class="knopf zweit klein" data-runter="' + p.id + '" title="nach unten">▼</button> <button class="knopf zweit klein" data-pos="' + p.id + '">ändern</button> <button class="knopf zweit klein" data-posweg="' + p.id + '">entfernen</button></td>' : '') + '</tr>';
      }).join('');
    }).join('');
    const sp = entw ? '<td></td>' : '';
    inhalt.innerHTML = (r.luecken.length ? '<div class="alarm">' + ICON.warnung.replace('<svg', '<svg width="22" height="22"') + '<div><b>Vor dem Stellen fehlen Pflichtangaben:</b> ' + r.luecken.map(esc).join(', ') + ' — unter Stammdaten → Einstellungen bzw. beim Kunden eintragen.</div></div>' : '') +
      (entw ? '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap"><div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="knopf klein" id="rePos">+ Position</button><button class="knopf zweit klein" id="reArtikel">+ Artikel</button><button class="knopf zweit klein" id="reObjekt">+ Leistungen eines Objekts</button><button class="knopf zweit klein" id="reNachlass">+ Nachlass</button><button class="knopf zweit klein" id="reGruppe">+ Zwischenüberschrift</button></div><span class="leise klein">' + (aktuelleGruppe ? 'Neue Positionen landen unter „<b>' + esc(aktuelleGruppe) + '</b>" <a href="" id="reGruppeAus">aufheben</a>' : 'Neue Positionen ohne Zwischenüberschrift') + '</span></div>' : '') +
      '<div class="karte"><div class="scroll" style="box-shadow:none"><table class="tabelle"><thead><tr><th>Pos.</th><th>Leistung</th><th style="text-align:right">Menge</th><th>Einheit</th><th style="text-align:right">Einzelpreis</th><th style="text-align:right">Betrag</th>' + sp.replace('td', 'th').replace('td', 'th') + '</tr></thead><tbody>' +
      (zeilen || '<tr><td colspan="7" class="leise">Noch keine Position.</td></tr>') +
      '<tr><td></td><td colspan="4" style="text-align:right">Summe netto</td><td style="text-align:right"><b>' + euro(r.netto) + '</b></td>' + sp + '</tr><tr><td></td><td colspan="4" style="text-align:right">' + (r.steuerfall === 'reverse_charge' ? 'Umsatzsteuer (§ 13b UStG)' : 'zzgl. ' + zahlDe(r.ust_prozent) + ' % Umsatzsteuer') + '</td><td style="text-align:right">' + euro(r.ust) + '</td>' + sp + '</tr><tr><td></td><td colspan="4" style="text-align:right"><b>Rechnungsbetrag</b></td><td style="text-align:right"><b style="font-size:1.15rem">' + euro(r.brutto) + '</b></td>' + sp + '</tr>' +
      (r.zahlungen.length ? r.zahlungen.map(function (z) { return '<tr><td></td><td colspan="4" style="text-align:right" class="leise">' + esc((ZAHLART.find(function (a) { return a[0] === z.art; }) || [0, z.art])[1]) + ' am ' + datumDe(z.datum) + (z.notiz ? ' · ' + esc(z.notiz) : '') + (r.status !== 'storniert' ? ' <a href="" data-zweg="' + z.id + '">zurücknehmen</a>' : '') + '</td><td style="text-align:right">– ' + euro(z.betrag) + '</td>' + sp + '</tr>'; }).join('') + '<tr><td></td><td colspan="4" style="text-align:right"><b>Offen</b></td><td style="text-align:right"><b>' + euro(r.offen) + '</b></td>' + sp + '</tr>' : '') +
      '</tbody></table></div></div>' +
      '<div class="raster k2 abschnitt"><div class="karte"><div class="ueberzeile">Rechnungskopf</div><table class="tabelle"><tbody>' + [['Kunde', esc(r.kunde) + (r.kundennummer ? ' · ' + esc(r.kundennummer) : '')], ['Anschrift', esc([r.anschrift, [r.plz, r.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '))], ['Betreff', esc(r.betreff || '—')], ['Bestellnummer', esc(r.bestellnummer || '—')], ['Zahlungsziel', (r.zahlungsziel_tage || '—') + ' Tage' + (r.ziel_fest ? ' (an der Rechnung)' : '')], ['Format', esc({ zugferd: 'ZUGFeRD', xrechnung: 'XRechnung', pdf: 'PDF' }[r.rechnungsformat] || 'ZUGFeRD')], ['Einleitung', r.einleitung ? '<span style="white-space:pre-line">' + esc(r.einleitung) + '</span>' : '<span class="leise">Standardtext</span>'], ['Schluss', r.schluss ? '<span style="white-space:pre-line">' + esc(r.schluss) + '</span>' : '<span class="leise">Standardtext</span>']].map(function (z) { return '<tr><td class="leise" style="width:34%">' + z[0] + '</td><td>' + z[1] + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="karte"><div class="ueberzeile">Mahnwesen</div>' + (r.mahnungen.length ? '<table class="tabelle"><tbody>' + r.mahnungen.map(function (m) { return '<tr><td><b>' + esc(STUFE[m.stufe]) + '</b><br><span class="leise klein">' + datumDe(m.datum) + ' · Frist ' + datumDe(m.frist) + '</span></td><td style="text-align:right">' + euro(m.gesamt) + (m.zinsen ? '<br><span class="leise klein">inkl. ' + euro(m.zinsen) + ' Zinsen</span>' : '') + '</td><td><a class="knopf zweit klein" target="_blank" href="/api/mahnung/pdf?id=' + m.id + '">PDF</a></td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise klein">' + (offen ? 'Noch nicht gemahnt.' : 'Keine Mahnungen.') + '</div>') + '</div></div>';

    const neuladen = function () { A.rechnung(id); };
    const posForm = p => G.schublade('<h2>' + (p.id ? 'Position ändern' : (p.nachlass ? 'Nachlass' : 'Neue Position')) + '</h2><div class="formular" style="margin-top:1rem">' + textfeld('bezeichnung', 'Leistung (mehrzeilig möglich)', p.bezeichnung || (p.nachlass ? 'Nachlass' : ''), 3) + G.feld('menge', 'Menge', p.menge == null ? 1 : p.menge, 'number', ' step="0.01"') + G.feld('einheit', 'Einheit', p.einheit || (p.nachlass ? 'pauschal' : 'Std.')) +
      G.feld('einzelpreis', p.nachlass ? 'Betrag € netto (wird abgezogen)' : 'Einzelpreis € netto', p.nachlass ? '' : p.einzelpreis, 'number', ' step="0.01"') + '<label class="feld">Zwischenüberschrift / Gruppe<input name="gruppe" list="reGruppen" value="' + esc(p.id ? p.gruppe || '' : aktuelleGruppe) + '"></label><datalist id="reGruppen">' + alleGruppen.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist></div>' + G.knoepfe(), function (w) {
      $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.rechnung_id = r.id; d.id = p.id; if (p.nachlass) d.einzelpreis = -Math.abs(Number(String(d.einzelpreis).replace(',', '.'))); await holen('/api/rechnung/position', d); G.schubladeZu(); meldung('Position gespeichert'); neuladen(); });
    });
    knopf('#rePos', function () { posForm({}); });
    knopf('#reNachlass', function () { posForm({ nachlass: true }); });
    knopf('#reGruppe', function () { const n = prompt('Zwischenüberschrift (z. B. Objekt, Etage, Sonderleistungen)', aktuelleGruppe); if (n == null) return; aktuelleGruppe = n.trim(); neuladen(); });
    knopf('#reGruppeAus', function (e) { e.preventDefault(); aktuelleGruppe = ''; neuladen(); });
    knopf('#reArtikel', fehler(async function () {
      const l = (await holen('/api/artikel')).filter(function (a) { return a.aktiv; });
      if (!l.length) { meldung('Noch keine Artikel — unter Abrechnung → Artikel & Leistungen anlegen'); return; }
      G.schublade('<h2>Artikel hinzufügen</h2><div class="formular" style="margin-top:1rem">' + G.auswahl('artikel_id', 'Artikel', l.map(function (a) { return [a.id, (a.nummer ? a.nummer + ' · ' : '') + a.bezeichnung + ' — ' + euro(a.preis) + ' / ' + (a.einheit || '')]; }), l[0].id) + G.feld('menge', 'Menge', 1, 'number', ' step="0.01"') + G.feld('gruppe', 'Zwischenüberschrift (optional)', aktuelleGruppe) + '</div>' + G.knoepfe('Hinzufügen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = r.id; await holen('/api/rechnung/artikel', d); G.schubladeZu(); meldung('Artikel hinzugefügt'); neuladen(); });
      });
    }));
    knopf('#reObjekt', fehler(async function () {
      const l = (await G.objekteListe()).filter(function (o) { return o.kunde_id === r.kunde_id && o.status === 'aktiv'; });
      if (!l.length) { meldung('Dieser Kunde hat keine aktiven Objekte.'); return; }
      G.schublade('<h2>Leistungen eines Objekts übernehmen</h2><p class="leise klein">Monatspreis, Ist-Stunden, Preisbausteine und erledigte Sonderleistungen des Monats. Schon abgerechnete Objekte werden nicht doppelt übernommen.</p><div class="formular" style="margin-top:1rem">' + G.auswahl('objekt_id', 'Objekt', l.map(function (o) { return [o.id, o.name]; }), l[0].id) + '<label class="feld">Monat<input type="month" name="monat" value="' + r.zeitraum_von.slice(0, 7) + '"></label></div>' + G.knoepfe('Übernehmen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = r.id; const x = await holen('/api/rechnung/objekt', d); G.schubladeZu(); meldung(x.hinweise.length ? x.hinweise.join(' ') : 'Leistungen übernommen'); neuladen(); });
      });
    }));
    $$('[data-pos]').forEach(function (k) { k.onclick = function () { posForm(r.positionen.find(function (p) { return p.id === Number(k.dataset.pos); })); }; });
    $$('[data-posweg]').forEach(function (k) { k.onclick = fehler(async function () { await holen('/api/rechnung/position', { rechnung_id: r.id, id: Number(k.dataset.posweg), loeschen: true }); meldung('Position entfernt'); neuladen(); }); });
    $$('[data-hoch]').forEach(function (k) { k.onclick = fehler(async function () { await holen('/api/rechnung/verschieben', { id: r.id, position_id: Number(k.dataset.hoch), richtung: 'hoch' }); neuladen(); }); });
    $$('[data-runter]').forEach(function (k) { k.onclick = fehler(async function () { await holen('/api/rechnung/verschieben', { id: r.id, position_id: Number(k.dataset.runter), richtung: 'runter' }); neuladen(); }); });
    $$('[data-zweg]').forEach(function (k) { k.onclick = fehler(async function (e) { e.preventDefault(); if (!confirm('Zahlung zurücknehmen?')) return; await holen('/api/rechnung/zahlung', { rechnung_id: r.id, id: Number(k.dataset.zweg), loeschen: true }); meldung('Zahlung zurückgenommen'); neuladen(); }); });
    knopf('#reKopf', fehler(async function () {
      const kunden = await holen('/api/kunden');
      G.schublade('<h2>Kopfdaten & Texte</h2><div class="formular" style="margin-top:1rem">' + G.auswahl('kunde_id', 'Kunde', kunden.map(function (k) { return [k.id, k.name]; }), r.kunde_id) + G.feld('von', 'Leistung von', r.zeitraum_von, 'date') + G.feld('bis', 'Leistung bis', r.zeitraum_bis, 'date') + G.feld('betreff', 'Betreff', r.betreff) + G.feld('bestellnummer', 'Bestellnummer des Kunden', r.bestellnummer) +
        G.feld('zahlungsziel_tage', 'Zahlungsziel in Tagen (leer = wie beim Kunden)', r.ziel_fest ? r.zahlungsziel_tage : '', 'number', ' min="0" max="120"') + textfeld('einleitung', 'Einleitung (leer = Standardtext)', r.einleitung, 4) + textfeld('schluss', 'Schlusstext (leer = Standardtext)', r.schluss, 4) + '</div>' + G.knoepfe(), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = r.id; await holen('/api/rechnung/kopf', d); G.schubladeZu(); meldung('Gespeichert'); neuladen(); });
      });
    }));
    knopf('#reZahlung', function () {
      G.schublade('<h2>Zahlung buchen</h2><p class="leise">Offen: <b>' + euro(r.offen) + '</b></p><div class="formular" style="margin-top:1rem">' + G.feld('betrag', 'Betrag € (leer = offener Rest)', '', 'number', ' step="0.01"') + G.feld('datum', 'Zahlungsdatum', heute(), 'date', ' max="' + heute() + '"') + G.auswahl('art', 'Zahlungsart', ZAHLART, 'ueberweisung') + G.feld('notiz', 'Notiz (z. B. Kontoauszug)', '') + '</div>' + G.knoepfe('Buchen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.rechnung_id = r.id; if (d.art === 'ausbuchung' && !confirm('Den Betrag als Forderungsverlust ausbuchen?')) return; const x = await holen('/api/rechnung/zahlung', d); G.schubladeZu(); meldung(x.offen > 0 ? 'Gebucht — noch offen ' + euro(x.offen) : 'Gebucht — Rechnung ist ausgeglichen'); neuladen(); });
      });
    });
    knopf('#reMahnen', fehler(async function () {
      const v = await holen('/api/mahnung/vorschau?rechnung=' + r.id);
      if (!v.faellig) { meldung('Keine Mahnung fällig: ' + v.grund); return; }
      G.schublade('<h2>' + esc(v.titel) + '</h2><table class="tabelle" style="margin-top:.6rem"><tbody>' + [['Offener Betrag', euro(v.offen)], v.gebuehrenBisher ? ['Mahngebühren bisher', euro(v.gebuehrenBisher)] : null, v.gebuehr ? ['Mahngebühr', euro(v.gebuehr)] : null, (v.pauschale || v.pauschaleBisher) ? ['Verzugspauschale § 288 Abs. 5 BGB', euro(v.pauschale + v.pauschaleBisher)] : null, v.zinsen ? ['Verzugszinsen ' + zahlDe(v.zins_prozent) + ' % ab ' + datumDe(v.zins_ab), euro(v.zinsen)] : null, ['<b>Zu zahlen bis ' + datumDe(v.frist) + '</b>', '<b>' + euro(v.gesamt) + '</b>']].filter(Boolean).map(function (z) { return '<tr><td>' + z[0] + '</td><td style="text-align:right">' + z[1] + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<p class="leise klein">Die Mahnung wird angelegt und als PDF auf dem Briefpapier geöffnet — zum Versand per Post oder E-Mail.</p>' + G.knoepfe(esc(v.titel) + ' erstellen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const m = await holen('/api/mahnung', { rechnung_id: r.id }); G.schubladeZu(); window.open('/api/mahnung/pdf?id=' + m.id, '_blank'); meldung(m.titel + ' erstellt'); neuladen(); });
      });
    }));
    knopf('#reSperre', fehler(async function () {
      if (r.mahnsperre) { await holen('/api/rechnung/mahnsperre', { id: r.id, an: false }); meldung('Mahnsperre aufgehoben'); return neuladen(); }
      const g = prompt('Grund für die Mahnsperre (z. B. Kunde prüft, Ratenzahlung vereinbart)'); if (g == null) return;
      await holen('/api/rechnung/mahnsperre', { id: r.id, an: true, grund: g }); meldung('Mahnsperre gesetzt'); neuladen();
    }));
    knopf('#reKopie', fehler(async function () { const x = await holen('/api/rechnung/kopieren', { id: r.id }); meldung('Kopie als Entwurf angelegt'); location.hash = '#rechnung/' + x.id; }));
    const aktion = (pfad, frage, text, danach) => fehler(async function () { if (frage && !confirm(frage)) return; const x = await holen(pfad, { id: r.id }); meldung(text(x)); if (danach) danach(x); else neuladen(); });
    knopf('#reStellen', aktion('/api/rechnung/stellen', 'Rechnung jetzt stellen? Danach ist sie nummeriert und nicht mehr änderbar.', function (x) { return 'Gestellt: ' + x.nummer; }));
    knopf('#reLoeschen', aktion('/api/rechnung/loeschen', 'Entwurf löschen?', function () { return 'Entwurf gelöscht'; }, function () { location.hash = '#abrechnung'; }));
    knopf('#reBezahlt', aktion('/api/rechnung/bezahlt', 'Den offenen Rest (' + euro(r.offen) + ') heute als bezahlt buchen?', function () { return 'Als bezahlt gebucht'; }));
    knopf('#reOffen', fehler(async function () { if (!confirm('Alle Zahlungen zurücknehmen und die Rechnung wieder öffnen?')) return; await holen('/api/rechnung/bezahlt', { id: r.id, zurueck: true }); meldung('Wieder offen'); neuladen(); }));
    knopf('#reStorno', aktion('/api/rechnung/stornieren', 'Rechnung stornieren? Es entsteht eine Stornorechnung mit eigener Nummer.', function (x) { return 'Storniert — Stornorechnung ' + x.nummer; }));
  };

  // ---------------------------------------------------------------- Offene Posten und Mahnlauf
  async function offenePosten(b) {
    const op = await holen('/api/offene-posten');
    b.innerHTML = '<div class="raster k3" style="margin-bottom:1rem;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' + op.alter.map(function (a, i) { return '<div class="karte kennzahl"><div class="ueberzeile">' + esc(a.text) + '</div><div style="font-size:1.25rem;font-weight:800' + (i >= 2 && a.summe ? ';color:var(--rot)' : '') + '">' + euro(a.summe) + '</div><div class="leise klein">' + a.anzahl + ' Rechnungen</div></div>'; }).join('') + '</div>' +
      '<div class="karte zeile" style="margin-bottom:1rem;flex-wrap:wrap"><div><b>' + op.posten.length + ' offene Posten · ' + euro(op.summe) + '</b><div class="leise klein">Stichtag ' + datumDe(op.stichtag) + ' · Zahlungserinnerung nach der Karenz, jede weitere Stufe nach Ablauf der Frist der vorigen.</div></div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="knopf" id="mlStart">Mahnlauf für Ausgewählte</button><a class="knopf zweit" href="/api/offene-posten.csv">OP-Liste (CSV)</a></div></div>' +
      (op.posten.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th><input type="checkbox" id="mlAlle" title="alle fälligen"></th><th>Rechnung</th><th>Kunde</th><th>Fällig</th><th style="text-align:right">Tage</th><th style="text-align:right">Offen</th><th>Mahnstand</th><th>Nächster Schritt</th><th></th></tr></thead><tbody>' + op.posten.map(function (p) {
        return '<tr><td>' + (p.naechsteStufe != null ? '<input type="checkbox" data-ml="' + p.id + '" checked>' : '') + '</td><td><a href="#rechnung/' + p.id + '"><b>' + esc(p.nummer) + '</b></a>' + (p.teilbezahlt ? ' <span class="marke gold">teilbezahlt</span>' : '') + '</td><td>' + esc(p.kunde) + '<br><span class="leise klein">' + esc(p.objekt || '') + '</span></td><td>' + datumDe(p.faellig) + '</td>' +
          '<td style="text-align:right' + (p.tageUeberfaellig > 30 ? ';color:var(--rot);font-weight:700' : '') + '">' + (p.tageUeberfaellig || '–') + '</td><td style="text-align:right"><b>' + euro(p.offen) + '</b></td><td>' + (p.mahnstufeText ? '<span class="marke rot">' + esc(p.mahnstufeText) + '</span><br><span class="leise klein">' + datumDe(p.letzteMahnung) + '</span>' : '–') + '</td>' +
          '<td class="klein">' + (p.naechsteStufe != null ? '<span class="marke gold">' + esc(p.naechsteText) + ' fällig</span>' : p.inkasso ? '<span class="marke rot">Inkasso / Mahnbescheid</span>' : esc(p.grund)) + '</td><td style="white-space:nowrap">' + (p.naechsteStufe != null ? '<button class="knopf zweit klein" data-mahn="' + p.id + '">mahnen</button> ' : '') + '<button class="knopf zweit klein" data-sperre="' + p.id + '" data-an="' + (p.mahnsperre ? '0' : '1') + '">' + (p.mahnsperre ? 'Sperre aufheben' : 'Sperre') + '</button></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="karte leer">Keine offenen Posten — alles bezahlt.</div>');
    const alle = $('#mlAlle'); if (alle) { alle.checked = true; alle.onchange = function () { $$('[data-ml]').forEach(function (c) { c.checked = alle.checked; }); }; }
    const ergebnis = x => G.schublade('<h2>Mahnlauf</h2><p>' + x.angelegt.length + (x.angelegt.length === 1 ? ' Mahnung' : ' Mahnungen') + ' erstellt.</p>' + x.angelegt.map(function (m) { return '<div class="zeile" style="padding:.35rem 0"><span><b>' + esc(m.nummer) + '</b> · ' + esc(m.titel) + ' · ' + euro(m.gesamt) + '</span><a class="knopf zweit klein" target="_blank" href="/api/mahnung/pdf?id=' + m.id + '">PDF</a></div>'; }).join('') + x.fehler.map(function (f) { return '<div class="hinweis" style="margin-top:.4rem">' + esc(f.nummer) + ': ' + esc(f.grund) + '</div>'; }).join('') + '<div style="margin-top:1rem"><button class="knopf zweit" id="abbrechen">Schließen</button></div>');
    knopf('#mlStart', fehler(async function () {
      const ids = $$('[data-ml]').filter(function (c) { return c.checked; }).map(function (c) { return Number(c.dataset.ml); });
      if (!ids.length) { meldung('Keine fällige Rechnung ausgewählt'); return; }
      if (!confirm(ids.length + ' Mahnungen erstellen?')) return;
      const x = await holen('/api/mahnlauf', { ids: ids }); offenePosten(b); ergebnis(x);
    }));
    $$('[data-mahn]').forEach(function (k) { k.onclick = fehler(async function () { const x = await holen('/api/mahnlauf', { ids: [Number(k.dataset.mahn)] }); offenePosten(b); ergebnis(x); }); });
    $$('[data-sperre]').forEach(function (k) { k.onclick = fehler(async function () { const an = k.dataset.an === '1'; const g = an ? prompt('Grund für die Mahnsperre') : ''; if (an && g == null) return; await holen('/api/rechnung/mahnsperre', { id: Number(k.dataset.sperre), an: an, grund: g }); meldung(an ? 'Mahnsperre gesetzt' : 'Mahnsperre aufgehoben'); offenePosten(b); }); });
  }

  async function mahnungen(b) {
    const l = await holen('/api/mahnungen'), letzte = {};
    l.forEach(function (m) { if (!letzte[m.rechnung_id] || m.stufe > letzte[m.rechnung_id].stufe || (m.stufe === letzte[m.rechnung_id].stufe && m.id > letzte[m.rechnung_id].id)) letzte[m.rechnung_id] = m; });
    b.innerHTML = l.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Datum</th><th>Stufe</th><th>Rechnung</th><th>Kunde</th><th>Frist</th><th style="text-align:right">Gebühr</th><th style="text-align:right">Zinsen</th><th style="text-align:right">Gesamt</th><th></th></tr></thead><tbody>' + l.map(function (m) {
      return '<tr><td>' + datumDe(m.datum) + '</td><td><b>' + esc(m.titel) + '</b></td><td><a href="#rechnung/' + m.rechnung_id + '">' + esc(m.nummer) + '</a></td><td>' + esc(m.kunde) + '</td><td>' + datumDe(m.frist) + '</td><td style="text-align:right">' + euro(m.gebuehr + m.pauschale) + '</td><td style="text-align:right">' + euro(m.zinsen) + '</td><td style="text-align:right"><b>' + euro(m.gesamt) + '</b></td><td style="white-space:nowrap"><a class="knopf zweit klein" target="_blank" href="/api/mahnung/pdf?id=' + m.id + '">PDF</a>' + (letzte[m.rechnung_id] === m ? ' <button class="knopf zweit klein" data-mzurueck="' + m.id + '">zurücknehmen</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="karte leer">Noch keine Mahnung.</div>';
    $$('[data-mzurueck]').forEach(function (k) { k.onclick = fehler(async function () { if (!confirm('Mahnung zurücknehmen (z. B. Fehlversand oder Zahlung hatte sich überschnitten)?')) return; await holen('/api/mahnung/zuruecknehmen', { id: Number(k.dataset.mzurueck) }); meldung('Mahnung zurückgenommen'); mahnungen(b); }); });
  }

  // ---------------------------------------------------------------- Artikelstamm
  async function artikel(b) {
    const l = await holen('/api/artikel');
    b.innerHTML = '<div class="zeile" style="margin-bottom:.6rem"><span class="leise">Wiederkehrende Leistungen mit Preis — in jeder Rechnung mit „+ Artikel" in Sekunden eingefügt.</span><button class="knopf klein" id="neuArtikel">+ Artikel</button></div>' +
      (l.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Nr.</th><th>Leistung</th><th>Einheit</th><th style="text-align:right">Preis netto</th><th></th></tr></thead><tbody>' + l.map(function (a) { return '<tr' + (a.aktiv ? '' : ' style="opacity:.5"') + '><td>' + esc(a.nummer || '') + '</td><td><b>' + esc(a.bezeichnung) + '</b>' + (a.beschreibung ? '<br><span class="leise klein">' + esc(a.beschreibung) + '</span>' : '') + (a.aktiv ? '' : ' <span class="marke grau">inaktiv</span>') + '</td><td>' + esc(a.einheit || '') + '</td><td style="text-align:right">' + euro(a.preis) + '</td><td style="white-space:nowrap"><button class="knopf zweit klein" data-art="' + a.id + '">ändern</button>' + (a.aktiv ? ' <button class="knopf zweit klein" data-artweg="' + a.id + '">deaktivieren</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Noch keine Artikel — z. B. Grundreinigung je m², Glasreinigung je Stunde, Sonderreinigung pauschal.</div>');
    const form = a => G.schublade('<h2>' + (a.id ? 'Artikel ändern' : 'Neuer Artikel') + '</h2><div class="formular" style="margin-top:1rem">' + G.feld('nummer', 'Artikelnummer (optional)', a.nummer) + G.feld('bezeichnung', 'Leistung', a.bezeichnung) + textfeld('beschreibung', 'Beschreibung (erscheint unter der Leistung)', a.beschreibung, 2) + G.feld('einheit', 'Einheit', a.einheit || 'Std.') + G.feld('preis', 'Preis € netto', a.preis, 'number', ' step="0.01"') + (a.id ? G.auswahl('aktiv', 'Status', [['1', 'aktiv'], ['0', 'inaktiv']], a.aktiv ? '1' : '0') : '') + '</div>' + G.knoepfe(), function (w) {
      $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = a.id; if (d.aktiv !== undefined) d.aktiv = d.aktiv === '1'; await holen('/api/artikel', d); G.schubladeZu(); meldung('Artikel gespeichert'); artikel(b); });
    });
    $('#neuArtikel').onclick = function () { form({}); };
    $$('[data-art]').forEach(function (k) { k.onclick = function () { form(l.find(function (a) { return a.id === Number(k.dataset.art); })); }; });
    $$('[data-artweg]').forEach(function (k) { k.onclick = fehler(async function () { await holen('/api/artikel', { id: Number(k.dataset.artweg), loeschen: true }); meldung('Artikel deaktiviert'); artikel(b); }); });
  }

  // ---------------------------------------------------------------- Automatik
  async function automatik(b) {
    const [e, laeufe] = await Promise.all([holen('/api/einstellungen'), holen('/api/abrechnungslaeufe')]);
    b.innerHTML = '<div class="raster k2"><div class="karte"><div class="ueberzeile">Automatischer Abrechnungslauf</div><h3>Jeden Monat von selbst</h3><p class="leise klein">Am eingestellten Tag rechnet Glanzwerk den Vormonat ab: je Kunde Sammelrechnung oder je Objekt eine Rechnung. Mit „gleich stellen" bekommen alle vollständigen Rechnungen sofort ihre Nummer; unvollständige bleiben Entwurf und stehen im Protokoll.</p>' +
      '<div class="formular" style="margin-top:.8rem">' + G.auswahl('auto_lauf_aktiv', 'Automatik', [['0', 'aus'], ['1', 'an']], e.auto_lauf_aktiv) + G.feld('auto_lauf_tag', 'am Tag des Monats (1–28)', e.auto_lauf_tag, 'number', ' min="1" max="28"') + G.auswahl('auto_stellen', 'Rechnungen', [['0', 'nur als Entwurf anlegen (prüfen, dann stellen)'], ['1', 'gleich stellen']], e.auto_stellen) + '</div>' +
      '<button class="knopf" id="autoSpeichern" style="margin-top:1rem">Speichern</button></div>' +
      '<div class="karte"><div class="ueberzeile">Protokoll</div><h3>Letzte Abrechnungsläufe</h3>' + (laeufe.length ? '<table class="tabelle" style="margin-top:.5rem"><thead><tr><th>Zeit</th><th>Monat</th><th>Art</th><th style="text-align:right">angelegt</th><th style="text-align:right">gestellt</th><th style="text-align:right">offen</th></tr></thead><tbody>' + laeufe.map(function (l) { return '<tr style="cursor:pointer" data-lauf="' + l.id + '"><td>' + esc(datumDe(l.zeit.slice(0, 10)) + ' ' + l.zeit.slice(11, 16)) + '</td><td>' + esc(l.monat.slice(5) + '/' + l.monat.slice(0, 4)) + '</td><td>' + (l.art === 'auto' ? '<span class="marke gold">Automatik</span>' : '<span class="marke grau">von Hand</span>') + '</td><td style="text-align:right">' + l.angelegt + '</td><td style="text-align:right">' + l.gestellt + '</td><td style="text-align:right">' + ((l.ergebnis.uebersprungen || []).length) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="leise">Noch kein Lauf.</div>') + '</div></div>';
    $('#autoSpeichern').onclick = fehler(async function () { const t = Number($('[name=auto_lauf_tag]', b).value); if (!(t >= 1 && t <= 28)) { meldung('Tag zwischen 1 und 28'); return; } await holen('/api/einstellungen', G.formDaten(b)); meldung('Automatik gespeichert'); automatik(b); });
    $$('[data-lauf]', b).forEach(function (z) { z.onclick = function () { const l = laeufe.find(function (x) { return x.id === Number(z.dataset.lauf); }), g = l.ergebnis;
      G.schublade('<h2>Abrechnungslauf ' + esc(l.monat.slice(5) + '/' + l.monat.slice(0, 4)) + '</h2><p class="leise">' + esc(datumDe(l.zeit.slice(0, 10)) + ' ' + l.zeit.slice(11, 16)) + ' · ' + (l.art === 'auto' ? 'Automatik' : 'von Hand') + '</p>' +
        '<h3 style="margin-top:1rem">Angelegt</h3>' + ((g.angelegt || []).map(function (a) { const s = (g.gestellt || []).find(function (x) { return x.id === a.id; }); return '<div class="zeile" style="padding:.3rem 0"><span>' + esc(a.objekt) + '</span><a class="knopf zweit klein" href="#rechnung/' + a.id + '">' + (s ? esc(s.nummer) : 'Entwurf') + '</a></div>'; }).join('') || '<div class="leise">—</div>') +
        '<h3 style="margin-top:1rem">Offen</h3>' + ((g.uebersprungen || []).map(function (u) { return '<div class="hinweis" style="margin-top:.4rem"><b>' + esc(u.objekt) + '</b><br>' + esc(u.grund) + '</div>'; }).join('') || '<div class="leise">nichts</div>') +
        '<div style="margin-top:1rem"><button class="knopf zweit" id="abbrechen">Schließen</button></div>'); }; });
  }

  // ---------------------------------------------------------------- Sonderleistungen & Abrufe
  async function auftraege(b) {
    const [l, obj] = await Promise.all([holen('/api/auftraege'), G.objekteListe()]);
    b.innerHTML = '<div class="zeile" style="margin-bottom:.6rem"><span class="leise">Kundenanfragen aus dem Portal und eigene Sonderleistungen. Erledigt mit Stunden oder Festpreis → landet in der nächsten Rechnung.</span><button class="knopf klein" id="neuAuftrag">+ Sonderleistung</button></div>' +
      (l.length ? l.map(function (a) {
        return '<div class="karte zeile" style="margin-bottom:.7rem;flex-wrap:wrap"><div><b>' + esc(a.objekt) + '</b> ' + marke(ASTATUS, a.status) + (a.quelle === 'kunde' ? ' <span class="marke">vom Kunden</span>' : '') + '<div>' + esc(a.text) + '</div><div class="leise klein">' + (a.wunschdatum ? 'Wunsch ' + datumDe(a.wunschdatum) + ' · ' : '') + (a.termin ? 'Termin ' + datumDe(a.termin) + ' · ' : '') + (a.stunden ? zahlDe(a.stunden) + ' Std. · ' : '') + (a.festpreis != null ? 'Festpreis ' + euro(a.festpreis) + ' · ' : '') + (a.rechnung ? 'Rechnung ' + esc(a.rechnung) + ' · ' : '') + 'angelegt ' + esc(datumDe(a.angelegt_am.slice(0, 10))) + (a.angefragt_von ? ' von ' + esc(a.angefragt_von) : '') + (a.antwort ? '<br>Antwort: ' + esc(a.antwort) : '') + '</div></div>' +
          '<div style="display:flex;gap:.4rem;flex-wrap:wrap">' + (a.status === 'angefragt' ? '<button class="knopf klein" data-best="' + a.id + '">Bestätigen</button><button class="knopf zweit klein" data-abl="' + a.id + '">Ablehnen</button>' : '') + (a.status === 'bestätigt' || a.status === 'angefragt' ? '<button class="knopf zweit klein" data-erl="' + a.id + '">Erledigt</button>' : '') + '</div></div>';
      }).join('') : '<div class="karte leer">Keine Sonderleistungen.</div>');
    const finde = id => l.find(function (a) { return a.id === Number(id); });
    $('#neuAuftrag').onclick = function () {
      G.schublade('<h2>Sonderleistung anlegen</h2><div class="formular" style="margin-top:1rem">' + G.auswahl('objekt_id', 'Objekt', obj.filter(function (o) { return o.status === 'aktiv'; }).map(function (o) { return [o.id, o.name]; }), '') + G.feld('text', 'Leistung', '') + G.feld('wunschdatum', 'Termin', '', 'date') + G.feld('festpreis', 'Festpreis € netto (leer = nach Stunden)', '', 'number', ' step="0.01"') + '</div>' + G.knoepfe('Anlegen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { await holen('/api/auftrag', G.formDaten(w)); G.schubladeZu(); meldung('Sonderleistung angelegt'); auftraege(b); });
      });
    };
    $$('[data-best]').forEach(function (k) { k.onclick = fehler(async function () {
      const a = finde(k.dataset.best), ma = await holen('/api/mitarbeiter');
      G.schublade('<h2>Anfrage bestätigen</h2><p>' + esc(a.objekt) + ': ' + esc(a.text) + '</p><div class="formular" style="margin-top:1rem">' + G.feld('termin', 'Termin', a.wunschdatum || '', 'date') + G.feld('festpreis', 'Festpreis € netto (leer = nach Stunden)', a.festpreis, 'number', ' step="0.01"') + G.feld('antwort', 'Nachricht an den Kunden (optional)', '') +
        G.auswahl('mitarbeiter_id', 'Gleich einplanen (optional)', [['', '— nicht einplanen —']].concat(ma.filter(function (m) { return m.aktiv; }).map(function (m) { return [m.id, m.name]; })), '') + G.feld('beginn', 'Beginn', '08:00', 'time') + G.feld('ende', 'Ende', '10:00', 'time') + '</div>' + G.knoepfe('Bestätigen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = a.id; d.status = 'bestätigt'; if (!d.mitarbeiter_id) { delete d.beginn; delete d.ende; } const r = await holen('/api/auftrag', d); G.schubladeZu(); meldung('Bestätigt' + (r.schicht ? ' und im Dienstplan eingeplant' : '')); auftraege(b); });
      });
    }); });
    $$('[data-erl]').forEach(function (k) { k.onclick = function () {
      const a = finde(k.dataset.erl);
      G.schublade('<h2>Sonderleistung erledigt</h2><p>' + esc(a.objekt) + ': ' + esc(a.text) + '</p><div class="formular" style="margin-top:1rem">' + G.feld('datum', 'Erledigt am', a.termin && a.termin < heute() ? a.termin : heute(), 'date', ' max="' + heute() + '"') + G.feld('stunden', 'Stunden (bei Abrechnung nach Aufwand)', a.stunden, 'number', ' step="0.25"') + G.feld('festpreis', 'oder Festpreis € netto', a.festpreis, 'number', ' step="0.01"') + '</div>' + G.knoepfe('Erledigt'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { const d = G.formDaten(w); d.id = a.id; d.status = 'erledigt'; await holen('/api/auftrag', d); G.schubladeZu(); meldung('Erledigt — kommt in die nächste Rechnung'); auftraege(b); });
      });
    }; });
    $$('[data-abl]').forEach(function (k) { k.onclick = function () {
      G.schublade('<h2>Anfrage ablehnen</h2><div class="formular" style="margin-top:1rem">' + G.feld('antwort', 'Begründung für den Kunden', '') + '</div>' + G.knoepfe('Ablehnen'), function (w) {
        $('#speichern', w).onclick = fehler(async function () { await holen('/api/auftrag', { id: Number(k.dataset.abl), status: 'abgelehnt', antwort: $('[name=antwort]', w).value }); G.schubladeZu(); meldung('Abgelehnt'); auftraege(b); });
      });
    }; });
  }

  // ---------------------------------------------------------------- Einstellungen Mahnwesen und Basiszins
  async function einstellungen(b) {
    const [e, bz] = await Promise.all([holen('/api/einstellungen'), holen('/api/basiszins')]);
    b.innerHTML = '<div class="raster k2"><div class="karte"><div class="ueberzeile">Mahnwesen</div><h3>Stufen, Fristen, Kosten</h3><div class="formular" style="margin-top:.8rem">' +
      G.feld('mahn_tage_erinnerung', 'Zahlungserinnerung nach … Tagen Überfälligkeit', e.mahn_tage_erinnerung, 'number', ' min="0"') + G.feld('mahn_frist_tage', 'Zahlungsfrist in jeder Mahnung (Tage)', e.mahn_frist_tage, 'number', ' min="3"') +
      G.feld('mahn_gebuehr_1', 'Mahngebühr 1. Mahnung €', e.mahn_gebuehr_1, 'number', ' step="0.01"') + G.feld('mahn_gebuehr_2', 'Mahngebühr 2. Mahnung €', e.mahn_gebuehr_2, 'number', ' step="0.01"') + G.feld('mahn_gebuehr_3', 'Mahngebühr letzte Mahnung €', e.mahn_gebuehr_3, 'number', ' step="0.01"') +
      G.auswahl('mahn_zinsen', 'Verzugszinsen berechnen (§ 288 BGB)', [['1', 'ja'], ['0', 'nein']], e.mahn_zinsen) + G.auswahl('mahn_pauschale', 'Verzugspauschale 40 € bei Unternehmern (§ 288 Abs. 5 BGB)', [['1', 'ja'], ['0', 'nein']], e.mahn_pauschale) +
      textfeld('mahn_text_0', 'Text Zahlungserinnerung', e.mahn_text_0, 3) + textfeld('mahn_text_1', 'Text 1. Mahnung', e.mahn_text_1, 3) + textfeld('mahn_text_2', 'Text 2. Mahnung', e.mahn_text_2, 3) + textfeld('mahn_text_3', 'Text letzte Mahnung', e.mahn_text_3, 3) + '</div>' +
      '<p class="leise klein">Die Zahlungserinnerung ist kostenfrei. Bei Verbrauchern dürfen nur tatsächliche Kosten berechnet werden (Porto, Material) — Pauschalen für den Arbeitsaufwand nicht.</p><button class="knopf" id="mahnSpeichern">Speichern</button></div>' +
      '<div class="karte"><div class="ueberzeile">Basiszinssatz § 247 BGB</div><h3>Grundlage der Verzugszinsen</h3><p class="leise klein">Die Bundesbank gibt den Satz zum 01.01. und 01.07. bekannt. Verzugszinsen: Unternehmer +9, Verbraucher +5 Prozentpunkte. Wechselt der Satz im Zinszeitraum, rechnet Glanzwerk abschnittsweise.</p>' +
      '<table class="tabelle" style="margin-top:.5rem"><thead><tr><th>gültig ab</th><th style="text-align:right">Basiszins</th><th style="text-align:right">Unternehmer</th><th style="text-align:right">Verbraucher</th><th></th></tr></thead><tbody>' + bz.map(function (z) { return '<tr><td>' + datumDe(z.gueltig_ab) + '</td><td style="text-align:right"><b>' + zahlDe(z.prozent) + ' %</b></td><td style="text-align:right">' + zahlDe(Math.round((z.prozent + 9) * 100) / 100) + ' %</td><td style="text-align:right">' + zahlDe(Math.round((z.prozent + 5) * 100) / 100) + ' %</td><td><button class="knopf zweit klein" data-bzweg="' + z.gueltig_ab + '">entfernen</button></td></tr>'; }).join('') + '</tbody></table>' +
      '<div style="display:flex;gap:.5rem;align-items:end;flex-wrap:wrap;margin-top:.8rem">' + G.feld('bz_ab', 'gültig ab (01.01. / 01.07.)', '', 'date') + G.feld('bz_prozent', 'Basiszins %', '', 'number', ' step="0.01"') + '<button class="knopf zweit klein" id="bzNeu">Eintragen</button></div></div></div>';
    $('#mahnSpeichern').onclick = fehler(async function () { const d = {}; $$('[name^=mahn_]', b).forEach(function (i) { d[i.name] = i.value; }); await holen('/api/einstellungen', d); meldung('Mahnwesen gespeichert'); });
    $('#bzNeu').onclick = fehler(async function () { await holen('/api/basiszins', { gueltig_ab: $('[name=bz_ab]', b).value, prozent: $('[name=bz_prozent]', b).value, quelle: 'von Hand' }); meldung('Basiszinssatz eingetragen'); einstellungen(b); });
    $$('[data-bzweg]', b).forEach(function (k) { k.onclick = fehler(async function () { if (!confirm('Eintrag entfernen?')) return; await holen('/api/basiszins', { gueltig_ab: k.dataset.bzweg, loeschen: true }); einstellungen(b); }); });
  }
})();
