// Traffic: Caltrans lane closures (LCS, direct, CORS) + changeable message signs (direct)
// + CHP incidents (via proxy; media.chp.ca.gov has no CORS).
import { MV } from '../map.js?v=1';
import { proxied, hasProxy } from '../proxy.js?v=1';

const LCS_URL = 'https://cwwp2.dot.ca.gov/data/d4/lcs/lcsStatusD04.json';
const CMS_URL = 'https://cwwp2.dot.ca.gov/data/d4/cms/cmsStatusD04.json';
const RADIUS_KM = 9;

function kmBetween(lat1, lon1, lat2, lon2) {
  const R = 6371, p = Math.PI / 180;
  const dLat = (lat2 - lat1) * p, dLon = (lon2 - lon1) * p;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

let lcsCache = { at: 0, items: [] };

export async function fetchClosures() {
  if (Date.now() - lcsCache.at < 20 * 60 * 1000) return lcsCache.items;
  const r = await fetch(LCS_URL);
  if (!r.ok) throw new Error(`caltrans lcs ${r.status}`);
  const d = await r.json();
  const now = Date.now() / 1000;
  const items = [];
  for (const row of d.data || []) {
    const l = row.lcs || {};
    const b = (l.location || {}).begin || {};
    const e = (l.location || {}).end || {};
    const c = l.closure || {};
    const lat = parseFloat(b.beginLatitude), lon = parseFloat(b.beginLongitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const km = kmBetween(MV.lat, MV.lon, lat, lon);
    if (km > RADIUS_KM) continue;
    const ts = c.closureTimestamp || {};
    const start = Number(ts.closureStartEpoch) || 0, end = Number(ts.closureEndEpoch) || 0;
    const cancelled = (c.code1022 || {}).isCode1022 === 'true';
    const started = (c.code1097 || {}).isCode1097 === 'true';
    const ended = (c.code1098 || {}).isCode1098 === 'true';
    if (cancelled || ended) continue;
    // Keep closures active now or starting within the next 24 h.
    if (end && end < now) continue;
    if (start > now + 24 * 3600) continue;
    items.push({
      id: c.closureID || c.logNumber,
      route: b.beginRoute, dir: (l.location || {}).travelFlowDirection,
      from: b.beginLocationName, to: e.endLocationName,
      type: c.typeOfClosure, work: c.typeOfWork, facility: c.facility,
      lanes: c.lanesClosed, lanesTotal: c.totalExistingLanes, delay: c.estimatedDelay,
      start, end, started, active: started || (start <= now && (!end || end >= now)),
      lat, lon, km: Math.round(km * 10) / 10
    });
  }
  items.sort((a, b) => (b.active - a.active) || (a.start - b.start));
  lcsCache = { at: Date.now(), items };
  return items;
}

export async function fetchSigns() {
  const r = await fetch(CMS_URL);
  if (!r.ok) throw new Error(`caltrans cms ${r.status}`);
  const d = await r.json();
  const out = [];
  for (const row of d.data || []) {
    const c = row.cms || {};
    const loc = c.location || {};
    const lat = parseFloat(loc.latitude), lon = parseFloat(loc.longitude);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const km = kmBetween(MV.lat, MV.lon, lat, lon);
    if (km > RADIUS_KM) continue;
    const p1 = (c.message || {}).phase1 || {};
    const p2 = (c.message || {}).phase2 || {};
    const lines = [p1.phase1Line1, p1.phase1Line2, p1.phase1Line3, p2.phase2Line1, p2.phase2Line2, p2.phase2Line3].filter((t) => t && t !== 'Blank' && t.trim());
    out.push({ id: loc.locationName, route: loc.route, lat, lon, lines, km: Math.round(km * 10) / 10, inService: c.inService === 'true' });
  }
  return out;
}

// CHP incidents via the Worker: GET {proxy}/chp → [{id, time, type, location, desc, area, lat, lon}]
export async function fetchChp() {
  if (!hasProxy()) return null;
  const r = await fetch(proxied('/chp'));
  if (!r.ok) throw new Error(`chp proxy ${r.status}`);
  const j = await r.json();
  return (j.incidents || j || []).filter((i) => isFinite(i.lat) && isFinite(i.lon) && kmBetween(MV.lat, MV.lon, i.lat, i.lon) <= 12);
}

export async function fetchTraffic() {
  const [closures, signs, chp] = await Promise.all([
    fetchClosures(),
    fetchSigns().catch(() => []),
    fetchChp().catch(() => null)
  ]);
  return { closures, signs, chp };
}
