// Mountain View Live — Cloudflare Worker proxy for feeds without CORS.
// Routes: /flights (adsb.fi → adsb.lol fallback), /chp (CHP incidents, Bay Area, bbox),
//         /caltrain (caltrain.com GTFS-RT JSON mirror), /calfire (CAL FIRE incidents).
// No keys needed. Responses are cached at the edge for a few seconds so visitors share one upstream poll.
// Deploy: `npx wrangler deploy` in this folder (see README.md), then paste the worker URL in the site's Settings.

const ALLOWED_ORIGINS = ['https://bevelez.ai', 'https://www.bevelez.ai', 'http://127.0.0.1:8978', 'http://localhost:8978'];
const MV = { lat: 37.3861, lon: -122.0839 };
const BBOX = { south: 37.25, north: 37.52, west: -122.25, east: -121.90 };
const UA = 'mountain-view-live/1.0 (+https://bevelez.ai/mountain-view.html)';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });

    const route = url.pathname.replace(/\/+$/, '') || '/';
    const handlers = { '/flights': flights, '/chp': chp, '/caltrain': caltrain, '/calfire': calfire, '/': health };
    const h = handlers[route];
    if (!h) return json({ error: 'unknown route', routes: Object.keys(handlers) }, 404, cors);

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const ttl = { '/flights': 5, '/chp': 60, '/caltrain': 30, '/calfire': 300, '/': 0 }[route];
    if (ttl) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const res = new Response(hit.body, hit);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        res.headers.set('X-Cache', 'HIT');
        return res;
      }
    }
    try {
      const body = await h();
      const res = json(body, 200, { ...cors, 'Cache-Control': `public, max-age=${ttl}` });
      if (ttl) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, cors);
    }
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
async function get(url, accept = 'application/json') {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r;
}
async function health() { return { ok: true, routes: ['/flights', '/chp', '/caltrain', '/calfire'], time: new Date().toISOString() }; }

// --- Aircraft (readsb v2 shape) ---------------------------------------------------------
async function flights() {
  const tries = [
    { name: 'adsb.fi', url: `https://opendata.adsb.fi/api/v3/lat/${MV.lat}/lon/${MV.lon}/dist/22` },
    { name: 'adsb.lol', url: `https://api.adsb.lol/v2/point/${MV.lat}/${MV.lon}/22` }
  ];
  let lastErr = null;
  for (const t of tries) {
    try {
      const r = await get(t.url);
      const d = await r.json();
      const ac = d.ac || d.aircraft || [];
      return { now: d.now || Date.now(), source: t.name, ac: ac.map(slim) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no ADS-B source');
}
function slim(a) {
  const keep = ['hex', 'flight', 'r', 't', 'desc', 'ownOp', 'alt_baro', 'alt_geom', 'gs', 'track', 'true_heading', 'baro_rate', 'geom_rate', 'squawk', 'category', 'emergency', 'lat', 'lon', 'seen', 'seen_pos'];
  const o = {};
  for (const k of keep) if (a[k] !== undefined) o[k] = a[k];
  return o;
}

// --- CHP incidents (Golden Gate / Bay Area dispatch), filtered to a bbox around Mountain View --
async function chp() {
  const r = await get('https://media.chp.ca.gov/sa_xml/sa.xml', 'text/xml');
  const xml = await r.text();
  const incidents = [];
  const unq = (s) => (s || '').replace(/^"|"$/g, '').trim();
  const logRe = /<Log ID="([^"]+)">([\s\S]*?)<\/Log>/g;
  const centerRe = /<Center ID="([^"]+)">([\s\S]*?)<\/Center>/g;
  let cm;
  while ((cm = centerRe.exec(xml))) {
    const center = cm[1];
    const block = cm[2];
    let lm;
    while ((lm = logRe.exec(block))) {
      const id = lm[1], body = lm[2];
      const tag = (t) => { const m = body.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`)); return m ? unq(m[1]) : ''; };
      const ll = tag('LATLON');
      const m = ll.match(/^(-?\d+):(-?\d+)$/);
      if (!m) continue;
      const lat = Number(m[1]) / 1e6;
      let lon = Number(m[2]) / 1e6;
      if (lon > 0) lon = -lon; // CHP publishes positive west longitudes
      if (lat < BBOX.south || lat > BBOX.north || lon < BBOX.west || lon > BBOX.east) continue;
      const details = [...body.matchAll(/<IncidentDetail>([\s\S]*?)<\/IncidentDetail>/g)].map((x) => unq(x[1])).filter(Boolean).slice(-4);
      incidents.push({ id, center, time: tag('LogTime'), type: tag('LogType'), location: tag('Location'), desc: tag('LocationDesc'), area: tag('Area'), lat, lon, details });
    }
  }
  return { fetched: new Date().toISOString(), incidents };
}

// --- Caltrain vehicle positions (undocumented JSON mirror of the GTFS-RT feed) -----------------
async function caltrain() {
  const r = await get('https://www.caltrain.com/files/rt/vehiclepositions/CT.json');
  const d = await r.json();
  const ents = d.Entities || d.entity || [];
  const trains = ents.map((e) => {
    const v = e.Vehicle || e.vehicle || {};
    const pos = v.Position || v.position || {};
    const trip = v.Trip || v.trip || {};
    const veh = v.Vehicle || v.vehicle || {};
    return { id: e.Id || e.id, label: veh.Label || veh.label || veh.Id || veh.id, lat: pos.Latitude ?? pos.latitude, lon: pos.Longitude ?? pos.longitude, bearing: pos.Bearing ?? pos.bearing ?? null, route: trip.RouteId || trip.routeId || '', direction: trip.DirectionId ?? trip.directionId ?? null, tripId: trip.TripId || trip.tripId || '', timestamp: v.Timestamp || v.timestamp || null };
  }).filter((t) => typeof t.lat === 'number' && typeof t.lon === 'number');
  return { timestamp: (d.Header || d.header || {}).Timestamp || (d.Header || d.header || {}).timestamp || null, trains };
}

// --- CAL FIRE incidents ------------------------------------------------------------------
async function calfire() {
  const r = await get('https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=false');
  const d = await r.json();
  return d;
}
