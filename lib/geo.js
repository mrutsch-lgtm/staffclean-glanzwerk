// geo.js — Abstand in Metern und Lage eines Objekts aus der Anschrift (OpenStreetMap Nominatim).
'use strict';

function abstand(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s))));
}

async function suchen(anschrift) {
  const u = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=' + encodeURIComponent(anschrift);
  const r = await fetch(u, { headers: { 'User-Agent': 'Glanzwerk/0.2 (StaffClean GmbH)' } });
  if (!r.ok) throw new Error('Adresssuche nicht erreichbar (' + r.status + ')');
  const j = await r.json();
  if (!j.length) throw new Error('Anschrift nicht gefunden');
  return { lat: Number(j[0].lat), lon: Number(j[0].lon), gefunden: j[0].display_name };
}

module.exports = { abstand, suchen };
