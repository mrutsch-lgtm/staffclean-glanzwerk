// buero-register.js — Arbeitsschutz & QM: Übersicht mit Fristen und Ersthelfer-Quote, 14 Register (Gefahrstoffe, Gefährdungs-
// beurteilungen, Unfälle, Beauftragte, Ausgaben mit App-Quittung, Ein-/Austritts-Checklisten, Führerscheine, Fahrzeuge, Übergaben,
// Maßnahmenplan, Subunternehmer, Lieferanten, Rechtskataster, Dokumentenlenkung) und Unterweisungen / Dienstanweisungen.
// Die Register bauen sich aus der Feldliste des Servers — Formular, Tabelle, Dateien, PDF und CSV kommen von dort.
'use strict';
(function () {
  const { $, $$, esc, holen, meldung, heute, datumDe } = UI;
  const G = window.GW, A = window.GW_ANSICHTEN = window.GW_ANSICHTEN || {};
  const inhalt = G.inhalt;
  const fehler = fn => async function () { try { await fn.apply(this, arguments); } catch (e) { meldung(e.message); } };
  const marke = (datum) => { if (!datum) return ''; const t = Math.round((new Date(datum + 'T12:00:00') - new Date(heute() + 'T12:00:00')) / 864e5); return '<span class="marke ' + (t < 0 ? 'rot' : t <= 30 ? 'orange' : '') + '">' + datumDe(datum) + '</span>'; };
  const opt = (f, v) => { const o = (f.o || []).find(function (x) { return x[0] === v; }); return o ? o[1] : v; };
  let personen = null;
  async function leute() { personen = personen || await holen('/api/mitarbeiter'); return personen; }

  // ------------------------------------------------------------------ Übersicht
  A.sicherheit = async function sicherheit() {
    const d = await holen('/api/register?tage=45');
    G.kopf('Verwaltung · Arbeitsschutz & QM', 'Sicher, sauber, <span class="akzent">nachweisbar</span>', 'Alles, was bei einer Prüfung durch Berufsgenossenschaft, Gewerbeaufsicht oder Kunden-Audit auf den Tisch muss — mit Wiedervorlage, bevor etwas abläuft.',
      '<a class="knopf gold" href="#unterweisung">Unterweisungen' + (d.unterweisungen ? ' (' + d.unterweisungen + ' offen)' : '') + '</a><a class="knopf hell" href="#register/gefahrstoffe">Gefahrstoffverzeichnis</a>');
    const eh = d.ersthelfer, gruppen = [];
    d.katalog.forEach(function (r) { if (gruppen.indexOf(r.gruppe) < 0) gruppen.push(r.gruppe); });
    inhalt.innerHTML = '<div class="raster" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin-bottom:1rem">' +
      [['Fristen in 45 Tagen', d.fristen.length, d.fristen.some(function (f) { return f.abgelaufen; })], ['davon abgelaufen', d.fristen.filter(function (f) { return f.abgelaufen; }).length, d.fristen.some(function (f) { return f.abgelaufen; })], ['Unterweisungen offen', d.unterweisungen, d.unterweisungen > 0], ['Ersthelfer', eh.ersthelfer + ' / ' + eh.soll, !eh.erfuellt]].map(function (k) { return '<div class="karte kennzahl" style="padding:.8rem 1rem"><div class="ueberzeile">' + k[0] + '</div><div style="font-size:1.4rem;font-weight:800' + (k[2] ? ';color:var(--rot)' : '') + '">' + k[1] + '</div></div>'; }).join('') + '</div>' +
      (!eh.erfuellt ? '<div class="karte hinweis" style="margin-bottom:1rem">Bei ' + eh.beschaeftigte + ' Beschäftigten braucht es mindestens ' + eh.soll + ' ausgebildete Ersthelfer (DGUV Vorschrift 1 § 26) — gültig sind ' + eh.ersthelfer + '. <a href="#register/beauftragte">Ersthelfer eintragen</a></div>' : '') +
      '<div class="raster k2" style="gap:1rem;align-items:start"><div>' + gruppen.map(function (g) {
        return '<div class="karte" style="margin-bottom:1rem"><div class="ueberzeile">' + esc(g) + '</div>' + d.katalog.filter(function (r) { return r.gruppe === g; }).map(function (r) {
          return '<a class="reg-kachel" href="#register/' + r.id + '" data-register="' + r.id + '"><b>' + esc(r.titel) + '</b><span class="leise klein">' + r.anzahl + ' Einträge' + (r.faellig ? ' · <span style="color:var(--rot)">' + r.faellig + ' fällig</span>' : '') + '</span></a>';
        }).join('') + '</div>';
      }).join('') + '</div><div class="karte"><div class="ueberzeile">Wiedervorlage</div><h2>Was als Nächstes fällig wird</h2>' +
      (d.fristen.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Datum</th><th>Register</th><th>Eintrag</th><th>Was</th></tr></thead><tbody>' + d.fristen.map(function (f) { return '<tr style="cursor:pointer" data-frist="' + f.register + '/' + f.eintrag_id + '"><td>' + marke(f.datum) + '</td><td class="klein">' + esc(f.registerTitel) + '</td><td><b>' + esc(f.titel) + '</b></td><td class="klein">' + esc(f.was) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="leise">In den nächsten 45 Tagen läuft nichts ab.</p>') + '</div></div>';
    $$('[data-frist]').forEach(function (z) { z.onclick = function () { const t = z.dataset.frist.split('/'); oeffnen(t[0], Number(t[1])); }; });
  };

  // ------------------------------------------------------------------ Register-Liste
  let suche = '';
  A.register = async function register(id) {
    if (!id) { location.hash = '#sicherheit'; return; }
    const d = await holen('/api/register?id=' + encodeURIComponent(id)), r = d.register;
    const sp = r.liste.map(function (n) { return r.felder.find(function (f) { return f.n === n; }); }).filter(Boolean);
    G.kopf('Arbeitsschutz & QM · ' + r.gruppe, esc(r.titel), esc(r.text),
      '<button class="knopf gold" id="regNeu">+ Neuer Eintrag</button><a class="knopf hell" href="/api/register.csv?id=' + r.id + '">CSV / Excel</a><a class="knopf hell" href="#sicherheit">← Übersicht</a>');
    inhalt.innerHTML = '<div class="karte zeile" style="margin-bottom:1rem"><label class="feld">Suche<input id="regSuche" value="' + esc(suche) + '" placeholder="in allen Feldern"></label></div><div id="regListe"></div>';
    const zelle = (f, x) => {
      const v = x[f.n + '_name'] || x[f.n];
      if (f.typ === 'frist') return marke(v);
      if (f.typ === 'datum') return v ? datumDe(v) : '';
      if (f.mehr) return (v || []).map(function (g) { return '<span class="marke grau">' + esc(g) + '</span>'; }).join(' ');
      if (f.o) return v ? '<span class="marke ' + (/gesperrt|offen|unwirksam|ja/.test(v) && f.n !== 'freigabe' || v === 'gesperrt' ? 'orange' : '') + '">' + esc(opt(f, v)) + '</span>' : '';
      return esc(v == null ? '' : String(v).length > 70 ? String(v).slice(0, 70) + '…' : v);
    };
    const liste = function () {
      const s = suche.toLowerCase(), l = d.liste.filter(function (x) { return !s || JSON.stringify(x).toLowerCase().includes(s); });
      $('#regListe').innerHTML = l.length ? '<div class="scroll"><table class="tabelle"><thead><tr>' + sp.map(function (f) { return '<th>' + esc(f.t) + '</th>'; }).join('') + (r.fortschritt ? '<th>erledigt</th>' : '') + (r.schnitt ? '<th>Schnitt</th>' : '') + (r.quittung ? '<th>Quittung</th>' : '') + '<th></th></tr></thead><tbody>' +
        l.map(function (x) { return '<tr style="cursor:pointer" data-eintrag="' + x.id + '">' + sp.map(function (f, i) { return '<td>' + (i === 0 ? '<b>' + zelle(f, x) + '</b>' : zelle(f, x)) + '</td>'; }).join('') +
          (r.fortschritt ? '<td>' + (x.fortschritt == null ? '' : '<div class="balken"><i style="width:' + x.fortschritt + '%"></i></div><span class="klein">' + x.fortschritt + ' %</span>') + '</td>' : '') +
          (r.schnitt ? '<td><b>' + (x.schnitt == null ? '–' : String(x.schnitt).replace('.', ',')) + '</b></td>' : '') +
          (r.quittung ? '<td>' + (x.quittiert_am ? '<span class="marke">✓ ' + datumDe(x.quittiert_am.slice(0, 10)) + '</span>' : x.rueckgabe ? '<span class="leise klein">zurück</span>' : '<span class="marke orange">offen</span>') + '</td>' : '') +
          '<td>' + (x.hinweise && x.hinweise.length ? '<span class="marke rot" title="' + esc(x.hinweise.join(' ')) + '">!</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Noch keine Einträge. <button class="knopf klein" id="regNeu2">+ Ersten Eintrag anlegen</button></div>';
      $$('[data-eintrag]').forEach(function (z) { z.onclick = function () { oeffnen(r.id, Number(z.dataset.eintrag)); }; });
      const n2 = $('#regNeu2'); if (n2) n2.onclick = function () { oeffnen(r.id, null); };
    };
    $('#regSuche').oninput = function () { suche = this.value; liste(); }; liste();
    $('#regNeu').onclick = function () { oeffnen(r.id, null); };
  };

  // ------------------------------------------------------------------ Formular (Schublade)
  async function oeffnen(regId, eid) {
    const d = eid ? await holen('/api/register?id=' + regId + '&eintrag=' + eid) : await holen('/api/register?id=' + regId);
    const r = d.register, x = eid ? d.eintrag : {};
    const brauchtLeute = r.felder.some(function (f) { return f.typ === 'mitarbeiter'; }), brauchtObjekte = r.felder.some(function (f) { return f.typ === 'objekt'; });
    const ma = brauchtLeute ? await leute() : [], ob = brauchtObjekte ? await G.objekteListe() : [];
    const eingabe = function (f, v, name) {
      name = name || f.n;
      if (f.typ === 'lang') return '<label class="feld breit">' + esc(f.t) + '<textarea name="' + name + '" rows="3">' + esc(v || '') + '</textarea></label>';
      if (f.typ === 'mitarbeiter') return G.auswahl(name, f.t, [['', '—']].concat(ma.map(function (m) { return [m.id, m.name + (m.aktiv ? '' : ' (ausgeschieden)')]; })), v);
      if (f.typ === 'objekt') return G.auswahl(name, f.t, [['', '—']].concat(ob.map(function (o) { return [o.id, o.name]; })), v);
      if (f.typ === 'wahl' && f.mehr) return '<fieldset class="feld breit reg-mehr"><legend>' + esc(f.t) + '</legend>' + f.o.map(function (o) { return '<label><input type="checkbox" data-mehr="' + name + '" value="' + esc(o[0]) + '"' + ((v || []).indexOf(o[0]) >= 0 ? ' checked' : '') + '> ' + esc(o[1]) + '</label>'; }).join('') + '</fieldset>';
      if (f.typ === 'wahl') return G.auswahl(name, f.t, (f.o[0] && f.o[0][0] === '' ? [] : [['', '—']]).concat(f.o), v);
      if (f.typ === 'ja') return '<label class="feld reg-ja"><input type="checkbox" name="' + name + '"' + (v ? ' checked' : '') + '> ' + esc(f.t) + '</label>';
      if (f.typ === 'datei') return '<div class="feld">' + esc(f.t) + (!x.id ? '<span class="leise klein">nach dem ersten Speichern hochladen</span>' : '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">' + (v && v.datei ? '<a class="knopf hell klein" target="_blank" href="/api/register/datei?id=' + r.id + '&eintrag=' + x.id + '&feld=' + f.n + '">ansehen (' + datumDe(v.am) + ')</a>' : '<span class="leise klein">noch keine Datei</span>') + '<label class="knopf zweit klein">' + (v && v.datei ? 'ersetzen' : 'hochladen') + '<input type="file" accept="application/pdf,image/*" data-datei="' + f.n + '" hidden></label></div>') + '</div>';
      return G.feld(name, f.t, v == null ? '' : v, f.typ === 'zahl' ? 'number' : (f.typ === 'datum' || f.typ === 'frist') ? 'date' : 'text', f.typ === 'zahl' ? ' step="any" inputmode="decimal"' : '');
    };
    const tabelle = function (f) {
      const zeilen = (x[f.n] || []).concat([{}]);
      return '<div class="feld breit"><b>' + esc(f.t) + '</b><div class="reg-tabelle" data-tabelle="' + f.n + '">' + zeilen.map(function (z) { return zeileHtml(f, z); }).join('') + '</div><button type="button" class="knopf zweit klein" data-zeileplus="' + f.n + '">+ Zeile</button></div>';
    };
    const zeileHtml = (f, z) => '<div class="reg-zeile">' + f.spalten.map(function (s) { return eingabe(s, z[s.n], '_' + s.n); }).join('') + '<button type="button" class="knopf zweit klein reg-weg" title="Zeile entfernen" aria-label="Zeile entfernen">×</button></div>';
    G.schublade('<div class="ueberzeile">' + esc(r.gruppe) + '</div><h2>' + esc(r.titel) + (x.id ? ' · Nr. ' + x.id : ' · neu') + '</h2>' +
      (d.hinweise && d.hinweise.length ? '<div class="karte hinweis" style="margin-top:.8rem">' + d.hinweise.map(esc).join('<br>') + '</div>' : '') +
      (x.quittiert_am ? '<p class="leise klein" style="margin-top:.6rem">✓ Empfang in der App bestätigt am ' + datumDe(x.quittiert_am.slice(0, 10)) + ' um ' + x.quittiert_am.slice(11, 16) + ' Uhr</p>' : '') +
      '<div class="formular" style="margin-top:1rem">' + r.felder.map(function (f) { return f.typ === 'tabelle' ? tabelle(f) : eingabe(f, x[f.n]); }).join('') + '</div>' +
      G.knoepfe(x.id ? 'Speichern' : 'Anlegen', x.id ? (r.pdf ? '<a class="knopf hell" target="_blank" href="/api/register.pdf?id=' + r.id + '&eintrag=' + x.id + '">' + esc(r.pdf) + ' (PDF)</a>' : '') + '<button class="knopf zweit" id="regLoeschen">Löschen</button>' : ''),
    function (w) {
      $$('[data-zeileplus]', w).forEach(function (k) { k.onclick = function () { const f = r.felder.find(function (y) { return y.n === k.dataset.zeileplus; }); $('[data-tabelle="' + f.n + '"]', w).insertAdjacentHTML('beforeend', zeileHtml(f, {})); weg(); }; });
      const weg = () => $$('.reg-weg', w).forEach(function (k) { k.onclick = function () { k.parentNode.remove(); }; }); weg();
      const sammeln = function () {
        const b = { register: r.id }; if (x.id) b.id = x.id;
        r.felder.forEach(function (f) {
          if (f.typ === 'datei') return;
          if (f.typ === 'tabelle') { b[f.n] = $$('[data-tabelle="' + f.n + '"] .reg-zeile', w).map(function (z) { const o = {}; f.spalten.forEach(function (s) { const i = $('[name="_' + s.n + '"]', z); o[s.n] = i.type === 'checkbox' ? i.checked : i.value; }); return o; }); return; }
          if (f.mehr) { b[f.n] = $$('[data-mehr="' + f.n + '"]', w).filter(function (i) { return i.checked; }).map(function (i) { return i.value; }); return; }
          const i = $('[name="' + f.n + '"]', w); b[f.n] = i.type === 'checkbox' ? i.checked : i.value;
        });
        return b;
      };
      $('#speichern', w).onclick = fehler(async function () { const a = await holen('/api/register', sammeln()); meldung(x.id ? 'Gespeichert' : 'Angelegt'); if (location.hash === '#register/' + r.id) A.register(r.id); if (!x.id) oeffnen(r.id, a.id); else G.schubladeZu(); });
      const l = $('#regLoeschen', w); if (l) l.onclick = fehler(async function () { if (!confirm('Diesen Eintrag endgültig löschen? Ein Nachweis ist danach weg.')) return; await holen('/api/register/loeschen', { register: r.id, id: x.id }); G.schubladeZu(); meldung('Gelöscht'); if (location.hash === '#register/' + r.id) A.register(r.id); });
      $$('[data-datei]', w).forEach(function (i) { i.onchange = function () { const datei = i.files[0]; if (!datei) return; if (datei.size > 10e6) { meldung('Die Datei ist größer als 10 MB.'); return; } const fr = new FileReader(); fr.onload = fehler(async function () { await holen('/api/register/datei', { register: r.id, id: x.id, feld: i.dataset.datei, datei: fr.result }); meldung('Datei hochgeladen'); oeffnen(r.id, x.id); }); fr.readAsDataURL(datei); }; });
    });
  }
  G.registerOeffnen = oeffnen;

  // ------------------------------------------------------------------ Unterweisungen und Dienstanweisungen
  const STATUS = { ok: ['aktuell', ''], bald: ['bald fällig', 'orange'], abgelaufen: ['abgelaufen', 'rot'], neu: ['neue Fassung', 'orange'], fehlt: ['fehlt', 'rot'] };
  let reiterU = 'themen';
  A.unterweisung = async function unterweisung(arg) {
    if (arg && /^\d+$/.test(arg)) return thema(Number(arg));
    if (arg === 'faellig' || arg === 'themen') reiterU = arg;
    const d = await holen('/api/unterweisung');
    G.kopf('Verwaltung · Unterweisungen', 'Unterwiesen — <span class="akzent">mit Nachweis</span>', 'Jährliche Unterweisung (§ 12 ArbSchG, § 14 GefStoffV) und Dienstanweisungen je Objekt. Die Kräfte lesen und bestätigen in der App, Präsenzunterweisungen trägt das Büro ein. Wird ein Inhalt geändert, müssen alle die neue Fassung bestätigen.',
      '<button class="knopf gold" id="uwNeu">+ Unterweisung</button><button class="knopf hell" id="daNeu">+ Dienstanweisung (Objekt)</button>');
    inhalt.innerHTML = G.reiter([['themen', 'Themen'], ['faellig', 'Fällig (' + d.faellig.length + ')']], reiterU, function (r) { reiterU = r; zeigen(); }) + '<div id="uwBereich"></div>';
    function zeigen() {
      const b = $('#uwBereich');
      if (reiterU === 'themen') b.innerHTML = '<div class="scroll"><table class="tabelle"><thead><tr><th>Thema</th><th>gilt für</th><th>Intervall</th><th>Fassung</th><th>Stand</th></tr></thead><tbody>' + d.themen.map(function (t) { return '<tr style="cursor:pointer" data-thema="' + t.id + '"><td><b>' + esc(t.titel) + '</b>' + (t.art === 'dienstanweisung' ? ' <span class="marke grau">Dienstanweisung</span>' : '') + '</td><td>' + esc(t.objekt || 'alle') + '</td><td>' + (t.intervall_monate ? t.intervall_monate + ' Mon.' : 'einmalig') + '</td><td>' + t.version + '</td><td><div class="balken"><i style="width:' + (t.personen ? Math.round(t.erledigt / t.personen * 100) : 100) + '%"></i></div><span class="klein">' + t.erledigt + ' / ' + t.personen + '</span></td></tr>'; }).join('') + '</tbody></table></div>';
      else b.innerHTML = d.faellig.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Name</th><th>Thema</th><th>Objekt</th><th>zuletzt</th><th>Stand</th></tr></thead><tbody>' + d.faellig.map(function (f) { return '<tr style="cursor:pointer" data-thema="' + f.thema_id + '"><td><b>' + esc(f.name) + '</b></td><td>' + esc(f.thema) + '</td><td>' + esc(f.objekt || '') + '</td><td>' + (f.zuletzt ? datumDe(f.zuletzt) : '–') + '</td><td><span class="marke ' + STATUS[f.status][1] + '">' + STATUS[f.status][0] + '</span>' + (f.status === 'bald' ? ' ' + datumDe(f.faellig) : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="karte leer">Alle sind unterwiesen. 👍</div>';
      $$('[data-thema]', b).forEach(function (z) { z.onclick = function () { location.hash = '#unterweisung/' + z.dataset.thema; }; });
    }
    zeigen();
    $('#uwNeu').onclick = function () { formular({ art: 'unterweisung', intervall_monate: 12 }); };
    $('#daNeu').onclick = function () { formular({ art: 'dienstanweisung', intervall_monate: 0 }); };
  };
  async function formular(t) {
    const ob = await G.objekteListe();
    G.schublade('<h2>' + (t.art === 'dienstanweisung' ? 'Dienstanweisung' : 'Unterweisung') + (t.id ? ' bearbeiten' : ' anlegen') + '</h2><div class="formular" style="margin-top:1rem">' +
      G.feld('titel', 'Titel', t.titel || (t.art === 'dienstanweisung' ? 'Dienstanweisung ' : '')) +
      G.auswahl('objekt_id', t.art === 'dienstanweisung' ? 'Objekt' : 'gilt für', [['', t.art === 'dienstanweisung' ? '— bitte wählen —' : 'alle Kräfte']].concat(ob.map(function (o) { return [o.id, 'Team ' + o.name]; })), t.objekt_id) +
      G.feld('intervall_monate', 'Wiederholen alle … Monate (0 = einmalig)', t.intervall_monate, 'number', ' min="0" max="60"') +
      '<label class="feld breit">Inhalt (das lesen die Kräfte in der App)<textarea name="inhalt" rows="9">' + esc(t.inhalt || '') + '</textarea></label></div>' +
      (t.id ? '<p class="leise klein">Änderst du den Inhalt, entsteht Fassung ' + (t.version + 1) + ' — alle müssen sie neu bestätigen.</p>' : '') + G.knoepfe(t.id ? 'Speichern' : 'Anlegen'),
    function (w) { $('#speichern', w).onclick = fehler(async function () { const b = G.formDaten(w); b.art = t.art; if (t.id) b.id = t.id; const a = await holen('/api/unterweisung', b); G.schubladeZu(); meldung(a.neueVersion ? 'Neue Fassung ' + a.version + ' — alle müssen neu bestätigen' : 'Gespeichert'); location.hash = '#unterweisung/' + a.id; if (t.id) thema(a.id); }); });
  }
  async function thema(id) {
    const t = await holen('/api/unterweisung?id=' + id);
    G.kopf('Unterweisungen · ' + (t.art === 'dienstanweisung' ? 'Dienstanweisung' : 'Thema'), esc(t.titel), 'Gilt für: ' + esc(t.objekt ? 'Team ' + t.objekt : 'alle Kräfte') + ' · ' + (t.intervall_monate ? 'alle ' + t.intervall_monate + ' Monate' : 'einmalig') + ' · Fassung ' + t.version,
      '<button class="knopf gold" id="uwPraesenz">Präsenz eintragen</button><a class="knopf hell" target="_blank" href="/api/unterweisung.pdf?id=' + t.id + '">Nachweis (PDF)</a><button class="knopf hell" id="uwBearbeiten">Bearbeiten</button><button class="knopf zweit" id="uwArchiv">Archivieren</button><a class="knopf hell" href="#unterweisung">← alle Themen</a>');
    inhalt.innerHTML = '<div class="raster k2" style="gap:1rem;align-items:start"><div class="karte"><div class="ueberzeile">Inhalt</div><p style="white-space:pre-wrap">' + esc(t.inhalt || '') + '</p></div>' +
      '<div class="karte"><div class="ueberzeile">Wer ist unterwiesen?</div>' + (t.personen.length ? '<div class="scroll"><table class="tabelle"><thead><tr><th>Name</th><th>zuletzt</th><th>wie</th><th>Stand</th></tr></thead><tbody>' + t.personen.map(function (p) { return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + (p.am ? datumDe(p.am) : '–') + '</td><td class="klein">' + (p.weg === 'app' ? 'App' : p.weg === 'praesenz' ? 'Präsenz' : '') + '</td><td><span class="marke ' + STATUS[p.status][1] + '">' + STATUS[p.status][0] + '</span>' + (p.faellig && p.status !== 'fehlt' && p.status !== 'neu' ? ' <span class="leise klein">bis ' + datumDe(p.faellig) + '</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="leise">Niemand betroffen' + (t.objekt ? ' — im Objekt ist noch kein Team eingetragen.' : '.') + '</p>') + '</div></div>';
    $('#uwBearbeiten').onclick = function () { formular(t); };
    $('#uwArchiv').onclick = fehler(async function () { if (!confirm('Thema archivieren? Die Nachweise bleiben erhalten.')) return; await holen('/api/unterweisung/archivieren', { id: t.id }); meldung('Archiviert'); location.hash = '#unterweisung'; });
    $('#uwPraesenz').onclick = function () {
      G.schublade('<h2>Präsenzunterweisung</h2><p class="leise">' + esc(t.titel) + ' · Fassung ' + t.version + '</p><div class="formular" style="margin-top:1rem">' + G.feld('am', 'Datum', heute(), 'date', ' max="' + heute() + '"') + G.feld('durch', 'unterwiesen durch', '') +
        '<fieldset class="feld breit reg-mehr"><legend>Teilnehmer</legend>' + t.personen.map(function (p) { return '<label><input type="checkbox" data-tn value="' + p.id + '"' + (p.status !== 'ok' ? ' checked' : '') + '> ' + esc(p.name) + '</label>'; }).join('') + '</fieldset></div>' + G.knoepfe('Eintragen'),
      function (w) { $('#speichern', w).onclick = fehler(async function () { const a = await holen('/api/unterweisung/nachweis', { thema_id: t.id, am: $('[name=am]', w).value, durch: $('[name=durch]', w).value, mitarbeiter_ids: $$('[data-tn]', w).filter(function (i) { return i.checked; }).map(function (i) { return Number(i.value); }) }); G.schubladeZu(); meldung(a.anzahl + ' Teilnehmer eingetragen'); thema(t.id); }); });
    };
  }
})();
