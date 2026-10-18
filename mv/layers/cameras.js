// Caltrans District 4 traffic cameras near Mountain View.
// The bundled list (mv/data/cameras.json) is built from cwwp2.dot.ca.gov; stills refresh live.
// The district JSON itself is CORS-enabled, so in-service status is re-checked every 30 min.

const DISTRICT_URL = 'https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json';
const BUNDLE_URL = './mv/data/cameras.json?v=1';

let bundle = null;
let lastDistrictCheck = 0;

export async function fetchCameras() {
  if (!bundle) {
    const r = await fetch(BUNDLE_URL);
    if (!r.ok) throw new Error(`camera list ${r.status}`);
    bundle = await r.json();
  }
  // Refresh inService flags from the live district feed at most every 30 minutes (2.4 MB).
  if (Date.now() - lastDistrictCheck > 30 * 60 * 1000 && navigator.connection?.saveData !== true) {
    lastDistrictCheck = Date.now();
    try {
      const r = await fetch(DISTRICT_URL);
      if (r.ok) {
        const d = await r.json();
        const live = new Map();
        for (const row of d.data || []) {
          const c = row.cctv || {};
          const name = (c.location || {}).locationName || '';
          const code = name.split('--')[0].trim();
          live.set(code, c.inService === 'true');
        }
        for (const cam of bundle.cameras) if (live.has(cam.id)) cam.inService = live.get(cam.id);
      }
    } catch (e) { /* keep bundled flags */ }
  }
  return bundle.cameras.filter((c) => c.image);
}

export function cameraImageUrl(cam) {
  return `${cam.image}${cam.image.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 15000)}`;
}

export const ROUTE_COLOR = {
  'US-101': '#48ecff',
  'SR-85': '#46e094',
  'SR-237': '#f2ae49',
  'SR-82': '#d9b87c',
  'I-280': '#b06cf2'
};
