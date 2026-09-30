// vertrieb.js — Knopf „Vertrieb" im Büro: öffnet den StaffClean-Vertrieb (vertrieb.staffclean.de) gleich
// angemeldet (Manuel 30.09.2026: „ein Button zu dem Vertrieb, wo man dann direkt da reinkommt").
//
// Glanzwerk stellt dafür einen Zettel aus, 60 Sekunden gültig, nur einmal einlösbar, mit HMAC-SHA256
// signiert. Der Schlüssel liegt als Datei auf dem Server (/home/staffsec/sso-schluessel), die der
// Vertrieb beim ersten Start anlegt — Glanzwerk liest ihn nur. Kein Code wird mit Staffsec geteilt, nur das
// Format des Zettels: base64url(JSON) + "." + base64url(HMAC). Gegenstück: firma.js im Sales-Hub-Repository.
'use strict';
const fs = require('fs');
const crypto = require('crypto');

const DATEI = process.env.SSO_SCHLUESSEL_DATEI || '/home/staffsec/sso-schluessel';
const ZIEL_URL = process.env.STAFFCLEAN_VERTRIEB_URL || 'https://vertrieb.staffclean.de';

function schluessel() {
  if (process.env.SSO_SCHLUESSEL && process.env.SSO_SCHLUESSEL.length >= 32) return process.env.SSO_SCHLUESSEL;
  try { const s = fs.readFileSync(DATEI, 'utf8').trim(); if (s.length >= 32) return s; } catch (e) {}
  return '';
}

// benutzer: Zeile aus der Tabelle benutzer (rolle buero). Admin im Büro = Admin im Vertrieb.
function zettel(benutzer) {
  const k = schluessel();
  if (!k) return null;
  const inhalt = Buffer.from(JSON.stringify({
    ziel: 'staffclean', name: String(benutzer.name || ''), email: String(benutzer.email || '').toLowerCase(),
    rolle: (benutzer.berechtigung || 'admin') === 'admin' ? 'admin' : 'closer', von: 'glanzwerk',
    ablauf: Date.now() + 60 * 1000, nonce: crypto.randomBytes(12).toString('hex')
  })).toString('base64url');
  return inhalt + '.' + crypto.createHmac('sha256', k).update(inhalt).digest('base64url');
}

function adresse(benutzer) {
  const z = zettel(benutzer);
  return z ? ZIEL_URL + '/sso?t=' + encodeURIComponent(z) : null;
}

module.exports = { adresse, zettel, ZIEL_URL };
