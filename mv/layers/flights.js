// Aircraft near Mountain View / Moffett Federal Airfield. Every public ADS-B aggregator
// (adsb.fi, adsb.lol, adsb.one, airplanes.live, OpenSky) refuses browser origins, so this
// goes through the Worker proxy: GET {proxy}/flights → { now, ac:[readsb v2 aircraft] }
import { proxied } from '../proxy.js?v=1';

export async function fetchFlights() {
  const r = await fetch(proxied('/flights'));
  if (!r.ok) throw new Error(`flights proxy ${r.status}`);
  const d = await r.json();
  const ac = d.ac || d.aircraft || [];
  return ac
    .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
    .map((a) => ({
      hex: a.hex,
      callsign: (a.flight || '').trim() || a.r || a.hex,
      reg: a.r || '',
      type: a.t || '',
      desc: a.desc || '',
      operator: a.ownOp || '',
      altFt: a.alt_baro === 'ground' ? 0 : (typeof a.alt_baro === 'number' ? a.alt_baro : (a.alt_geom || 0)),
      onGround: a.alt_baro === 'ground',
      gsKt: a.gs || 0,
      track: a.track || a.true_heading || 0,
      vrate: a.baro_rate || a.geom_rate || 0,
      squawk: a.squawk || '',
      category: a.category || '',
      emergency: a.emergency && a.emergency !== 'none' ? a.emergency : null,
      lat: a.lat,
      lon: a.lon,
      seen: a.seen_pos ?? a.seen ?? 0,
      source: d.source || 'adsb'
    }))
    .filter((a) => a.seen < 90);
}

// A small plane glyph for billboards, drawn once per color.
const iconCache = new Map();
export function planeIcon(color) {
  if (iconCache.has(color)) return iconCache.get(color);
  const c = document.createElement('canvas');
  c.width = 40; c.height = 40;
  const g = c.getContext('2d');
  g.translate(20, 20);
  g.fillStyle = color;
  g.strokeStyle = '#07090d';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -14); g.lineTo(3, -6); g.lineTo(15, 2); g.lineTo(15, 5); g.lineTo(3, 2); g.lineTo(2, 9); g.lineTo(6, 12); g.lineTo(6, 14);
  g.lineTo(0, 12); g.lineTo(-6, 14); g.lineTo(-6, 12); g.lineTo(-2, 9); g.lineTo(-3, 2); g.lineTo(-15, 5); g.lineTo(-15, 2); g.lineTo(-3, -6);
  g.closePath();
  g.fill(); g.stroke();
  const url = c.toDataURL('image/png');
  iconCache.set(color, url);
  return url;
}

export function altitudeColor(altFt) {
  if (altFt <= 50) return '#8a93a6';
  if (altFt < 3000) return '#46e094';
  if (altFt < 10000) return '#48ecff';
  if (altFt < 25000) return '#f2d049';
  return '#f25c54';
}
