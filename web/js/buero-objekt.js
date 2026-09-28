// buero-objekt.js — Objektkopf wie in der Sicherheitsplanung (die wichtigsten Zahlen eines Objekts auf einen Blick) und die
// Objektakte der Reinigung: Vertrag, Reinigungszeiten, Ansprechpartner vor Ort, Zugang, Material und Entsorgung,
// Besonderheiten — dazu die Rechnungen des Objekts. Die Objektseite in buero.js bindet das hier ein.
'use strict';
(function () {
  const { $, esc, holen, meldung, heute, datumDe } = UI;
  const G = window.GW, euro = G.euro;
  const zahlDe = v => v == null ? '–' : String(Math.round(v * 100) / 100).replace('.', ',');
  const fehler = fn => async function () { try { await fn.apply(this, arguments); } catch (e) { meldung(e.message); } };
  const ART = { buero: 'Büro / Verwaltung', praxis: 'Praxis / Gesundheit', schule: 'Schule / Kita', weg: 'Treppenhaus / Wohnanlage', industrie: 'Industrie / Lager', handel: 'Handel / Filiale', hotel: 'Hotel / Gastronomie', oeffentlich: 'öffentliches Gebäude', sonstiges: 'sonstiges' };
  let FELDER = null;

  function kopf(o, k) {
    const kachel = (t, w, z, warn) => '<div class="karte kennzahl" style="padding:.9rem 1rem"><div class="ueberzeile">' + esc(t) + '</div><div style="font-size:1.25rem;font-weight:800' + (warn ? ';color:var(--rot)' : '') + '">' + w + '</div>' + (z ? '<div class="leise klein">' + z + '</div>' : '') + '</div>';
    const quote = k.sollStundenMonat ? Math.round(k.istStundenVormonat / k.sollStundenMonat * 100) : null;
    const info = [o.objektnummer ? 'Objekt-Nr. ' + esc(o.objektnummer) : '', o.objektart ? esc(ART[o.objektart] || o.objektart) : '', o.zeit_von ? 'Reinigung ' + esc(o.zeit_von) + (o.zeit_bis ? '–' + esc(o.zeit_bis) : '') + ' Uhr' : '', o.ap_name ? 'vor Ort: ' + esc(o.ap_name) + (o.ap_telefon ? ' (' + esc(o.ap_telefon) + ')' : '') : '',
      k.objektleitung ? 'Objektleitung: <a href="#person/' + k.objektleitung.id + '">' + esc(k.objektleitung.name) + '</a>' : '', o.vertragsbeginn ? 'Vertrag seit ' + datumDe(o.vertragsbeginn) + (o.vertragsende ? ' bis ' + datumDe(o.vertragsende) : '') : ''].filter(Boolean);
    return (info.length ? '<div class="karte" style="margin-bottom:.8rem;padding:.7rem 1rem"><span class="klein">' + info.join(' · ') + '</span></div>' : '') +
      '<div class="raster" style="grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:.7rem;margin-bottom:1rem">' +
      kachel('Monatspreis', o.monatspreis ? euro(o.monatspreis) : '–', o.abrechnungsart === 'stunden' ? 'nach Ist-Stunden' : o.abrechnungsart === 'beides' ? 'Pauschale + Stunden' : 'Pauschale') +
      kachel('Stunden Soll / Monat', zahlDe(k.sollStundenMonat), 'Vormonat Ist ' + zahlDe(k.istStundenVormonat) + (quote != null ? ' (' + quote + ' %)' : ''), quote != null && Math.abs(quote - 100) > 15) +
      kachel('Ist diesen Monat', zahlDe(k.istStundenMonat) + ' Std.', k.heuteAufgaben ? 'heute ' + k.heuteAufgaben.fertig + ' / ' + k.heuteAufgaben.soll + ' Aufgaben' : '') +
      kachel('Fläche', k.flaeche ? zahlDe(k.flaeche) + ' m²' : '–', k.raeume + ' Räume · ' + k.leistungen + ' Leistungen') +
      kachel('Team', k.team, k.team ? 'Stammkräfte' : 'noch niemand fest', !k.team) +
      kachel('Offene Mängel', k.maengel, k.pruefung ? 'letzte Prüfung ' + zahlDe(k.pruefung.ergebnis) + ' % (' + datumDe(k.pruefung.datum) + ')' : 'noch keine Prüfung', k.maengel > 0) +
      kachel('Umsatz ' + heute().slice(0, 4), euro(k.umsatzJahr), k.offen ? 'offene Rechnungen ' + euro(k.offen) + ' brutto' : 'netto · nichts offen') + '</div>';
  }

  async function akte(o, k, bereich) {
    FELDER = FELDER || await holen('/api/objekt/felder');
    const ma = await holen('/api/mitarbeiter');
    const wert = f => { const v = o[f.n]; if (v == null || v === '') return '<span class="leise">—</span>'; if (f.typ === 'wahl') { const x = f.o.find(function (z) { return z[0] === v; }); return esc(x ? x[1] : v); } if (f.typ === 'date') return datumDe(v); if (f.typ === 'mitarbeiter') { const m = ma.find(function (x) { return x.id === Number(v); }); return m ? '<a href="#person/' + m.id + '">' + esc(m.name) + '</a>' : '—'; } return '<span style="white-space:pre-line">' + esc(v) + '</span>'; };
    bereich.innerHTML = '<div class="zeile" style="margin-bottom:.8rem"><span class="leise">Alles, was die Kolonne und das Büro zu diesem Objekt wissen müssen. Zugangscodes gehören nicht hierher.</span><button class="knopf klein" id="akteBearbeiten">Objektakte bearbeiten</button></div>' +
      '<div class="raster k2">' + FELDER.gruppen.map(function (g) {
        return '<div class="karte"><div class="ueberzeile">' + esc(g) + '</div><table class="tabelle"><tbody>' + FELDER.felder.filter(function (f) { return f.g === g; }).map(function (f) { return '<tr><td class="leise" style="width:42%">' + esc(f.t) + '</td><td>' + wert(f) + '</td></tr>'; }).join('') +
          (g === 'Zugang & Sicherheit' && o.zugang ? '<tr><td class="leise">Zugang (Kurz)</td><td>' + esc(o.zugang) + '</td></tr>' : '') + (g === 'Besonderheiten' && o.notiz ? '<tr><td class="leise">Notiz</td><td>' + esc(o.notiz) + '</td></tr>' : '') + '</tbody></table></div>';
      }).join('') + '</div>';
    $('#akteBearbeiten').onclick = function () {
      const feld = f => { const v = o[f.n] == null ? '' : o[f.n];
        if (f.typ === 'wahl') return G.auswahl(f.n, f.t, f.o, v);
        if (f.typ === 'mitarbeiter') return G.auswahl(f.n, f.t, [['', '— keine —']].concat(ma.filter(function (m) { return m.aktiv; }).map(function (m) { return [m.id, m.name]; })), v);
        if (f.typ === 'text') return '<label class="feld" style="grid-column:1/-1">' + esc(f.t) + '<textarea name="' + f.n + '" rows="3">' + esc(v) + '</textarea></label>';
        return G.feld(f.n, f.t, v, f.typ === 'date' ? 'date' : f.typ === 'time' ? 'time' : f.typ === 'email' ? 'email' : 'text'); };
      G.schublade('<h2>Objektakte · ' + esc(o.name) + '</h2>' + FELDER.gruppen.map(function (g) { return '<div class="ueberzeile" style="margin-top:1rem">' + esc(g) + '</div><div class="formular">' + FELDER.felder.filter(function (f) { return f.g === g; }).map(feld).join('') + '</div>'; }).join('') + G.knoepfe(), function (w) {
        $('#speichern', w).onclick = fehler(async function () {
          const d = Object.assign({ id: o.id, name: o.name, kunde_id: o.kunde_id, strasse: o.strasse, plz: o.plz, ort: o.ort, bundesland: o.bundesland, reinigungstag: o.reinigungstag, zugang: o.zugang, notiz: o.notiz, radius_m: o.radius_m, abrechnungsart: o.abrechnungsart, stundensatz: o.stundensatz }, G.formDaten(w));
          await holen('/api/objekt', d); G.schubladeZu(); G.objekteNeu(); meldung('Objektakte gespeichert'); G.route();
        });
      });
    };
  }

  function rechnungen(o, k, bereich) {
    const ST = { entwurf: ['Entwurf', 'grau'], gestellt: ['offen', 'gold'], bezahlt: ['bezahlt', ''], storniert: ['storniert', 'rot'] };
    bereich.innerHTML = '<div class="zeile" style="margin-bottom:.6rem"><span class="leise">Einzel- und Sammelrechnungen, in denen dieses Objekt abgerechnet ist.</span><a class="knopf zweit klein" href="#abrechnung">Zur Abrechnung</a></div>' +
      (k.rechnungen.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Nummer</th><th>Zeitraum</th><th style="text-align:right">Netto</th><th style="text-align:right">Brutto</th><th>Fällig</th><th>Status</th></tr></thead><tbody>' + k.rechnungen.map(function (r) { const s = ST[r.status] || [r.status, 'grau']; return '<tr style="cursor:pointer" onclick="location.hash=\'#rechnung/' + r.id + '\'"><td><b>' + esc(r.nummer || 'Entwurf') + '</b>' + (r.storno_von ? ' <span class="marke rot">Storno</span>' : '') + '</td><td>' + datumDe(r.zeitraum_von) + ' – ' + datumDe(r.zeitraum_bis) + '</td><td style="text-align:right">' + euro(r.netto) + '</td><td style="text-align:right"><b>' + euro(r.brutto) + '</b></td><td>' + (r.faellig ? datumDe(r.faellig) : '') + '</td><td><span class="marke ' + s[1] + '">' + esc(s[0]) + '</span></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Für dieses Objekt gibt es noch keine Rechnung.</div>');
  }

  window.GW_OBJEKT = { kopf, akte, rechnungen };
})();
