// Mountain View Live — app bootstrap: map, HUD, layers, radio.
import { MV, createViewer, flyHome, flyToLonLat, enableGoogle3D, setBase } from './map.js?v=1';
import { loadBuildings } from './buildings.js?v=1';
import { Radio, MOODS } from './radio.js?v=1';
import { PROXY_KEY, hasProxy, ProxyMissing } from './proxy.js?v=1';
import { fetchWeather, fetchAirQuality, fetchAlerts, WMO, aqiBand, windDir } from './layers/weather.js?v=1';
import { fetchQuakes } from './layers/quakes.js?v=1';
import { fetchCameras, cameraImageUrl, ROUTE_COLOR } from './layers/cameras.js?v=1';
import { fetchFlights, planeIcon, altitudeColor } from './layers/flights.js?v=2';
import { fetchTraffic } from './layers/traffic.js?v=1';
import { fetchOutages } from './layers/outages.js?v=1';
import { fetchFires } from './layers/fire.js?v=1';
import { fetchTransit } from './layers/transit.js?v=1';

const C = window.Cesium;
const $ = (id) => document.getElementById(id);
const status = (t) => { $('status').textContent = t || ''; };
const PT = 'America/Los_Angeles';
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PT });
const fmtDT = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: PT });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('mv_live_reduced') === '1';

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------
const googleKey = localStorage.getItem('mv_live_google_key') || '';
const viewer = createViewer('cesium-root', { google3dKey: googleKey });
window.__mvLive = { viewer };

let buildings = null;
async function bootBuildings() {
  status('loading footprints…');
  try { buildings = await loadBuildings(viewer); status(''); } catch (e) { status('footprints unavailable'); }
}
if (googleKey) {
  status('loading photorealistic 3d tiles…');
  enableGoogle3D(viewer, googleKey).then(() => status('')).catch(() => { status('3d tiles failed · using footprints'); bootBuildings(); });
} else {
  bootBuildings();
}

// ---------------------------------------------------------------------------
// HUD basics
// ---------------------------------------------------------------------------
function tickClock() { $('clock').textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PT }) + ' PT'; }
tickClock();
setInterval(tickClock, 15000);
$('btn-home').addEventListener('click', () => flyHome(viewer, reduced() ? 0 : 1.6));
$('btn-base').addEventListener('click', () => {
  const next = (localStorage.getItem('mv_live_base') || 'imagery') === 'imagery' ? 'canvas' : 'imagery';
  setBase(viewer, next);
  status(`base: ${next}`); setTimeout(() => status(''), 1500);
});

// Settings
const settings = $('settings');
$('btn-settings').addEventListener('click', () => settings.classList.toggle('hidden'));
$('settings-close').addEventListener('click', () => settings.classList.add('hidden'));
$('google-key').value = googleKey;
$('google-save').addEventListener('click', () => {
  const v = $('google-key').value.trim();
  if (v) localStorage.setItem('mv_live_google_key', v); else localStorage.removeItem('mv_live_google_key');
  location.reload();
});
$('google-clear').addEventListener('click', () => { localStorage.removeItem('mv_live_google_key'); location.reload(); });
$('proxy-url').value = localStorage.getItem(PROXY_KEY) || '';
$('proxy-save').addEventListener('click', () => {
  const v = $('proxy-url').value.trim().replace(/\/+$/, '');
  if (v) localStorage.setItem(PROXY_KEY, v); else localStorage.removeItem(PROXY_KEY);
  location.reload();
});
$('opt-reduced').checked = localStorage.getItem('mv_live_reduced') === '1';
$('opt-reduced').addEventListener('change', (e) => localStorage.setItem('mv_live_reduced', e.target.checked ? '1' : '0'));

// Drawer
const drawer = $('drawer');
let onDrawerClose = null;
function openDrawer(kicker, title, bodyHtml) {
  if (onDrawerClose) { onDrawerClose(); onDrawerClose = null; }
  $('drawer-kicker').textContent = kicker;
  $('drawer-title').textContent = title;
  $('drawer-body').innerHTML = bodyHtml;
  drawer.classList.add('open');
  settings.classList.add('hidden');
}
function closeDrawer() {
  drawer.classList.remove('open');
  $('drawer-body').innerHTML = '';
  if (onDrawerClose) { onDrawerClose(); onDrawerClose = null; }
}
$('drawer-close').addEventListener('click', closeDrawer);
const proxyNote = (what) => `<p>${what} needs the small Cloudflare Worker proxy, because the upstream feed does not allow browser requests.</p>
  <p class="note">Deploy <code>workers/mv-live-proxy</code> from the repo (five minutes, free), then paste its URL under ⚙ Settings → Proxy URL.</p>`;

// ---------------------------------------------------------------------------
// Layer registry
// ---------------------------------------------------------------------------
const layers = new Map();
const railBtns = [...document.querySelectorAll('.rail-btn')];
const ON_KEY = 'mv_live_layers';
const savedOn = new Set(JSON.parse(localStorage.getItem(ON_KEY) || '["cameras","alerts","outages"]'));

function registerLayer(name, impl) {
  const ds = new C.CustomDataSource(name);
  viewer.dataSources.add(ds);
  ds.show = false;
  const layer = { name, impl, ds, on: false, timer: null, items: [], error: null };
  layers.set(name, layer);
  const btn = railBtns.find((b) => b.dataset.layer === name);
  btn.addEventListener('click', () => {
    // Clicking an on layer opens its summary; the summary offers "turn off".
    if (layer.on && impl.summary) { impl.summary(layer); return; }
    toggleLayer(name);
  });
  if (savedOn.has(name)) toggleLayer(name, true);
  return layer;
}

async function refreshLayer(layer) {
  const btn = railBtns.find((b) => b.dataset.layer === layer.name);
  btn.classList.add('busy');
  try {
    layer.items = await layer.impl.fetch();
    layer.ds.entities.removeAll();
    layer.impl.render(layer.ds, layer.items);
    $(`ct-${layer.name}`).textContent = layer.impl.count ? layer.impl.count(layer.items) : String(layer.items.length);
    layer.error = null;
    btn.classList.remove('needs-proxy');
  } catch (e) {
    layer.error = e;
    layer.ds.entities.removeAll();
    if (e instanceof ProxyMissing) {
      $(`ct-${layer.name}`).textContent = '⚙';
      btn.classList.add('needs-proxy');
    } else {
      $(`ct-${layer.name}`).textContent = '!';
      status(`${layer.name}: ${e.message || 'unavailable'}`);
      setTimeout(() => status(''), 4000);
    }
  }
  btn.classList.remove('busy');
}

function toggleLayer(name, force) {
  const layer = layers.get(name);
  const on = force === undefined ? !layer.on : force;
  layer.on = on;
  layer.ds.show = on;
  railBtns.find((b) => b.dataset.layer === name).classList.toggle('on', on);
  if (on) {
    savedOn.add(name);
    refreshLayer(layer).then(() => { if (layer.impl.onFirstOn && !layer.openedOnce) { layer.openedOnce = true; layer.impl.onFirstOn(layer); } });
    if (layer.impl.every && !layer.timer) layer.timer = setInterval(() => refreshLayer(layer), layer.impl.every);
  } else {
    savedOn.delete(name);
    if (layer.timer) { clearInterval(layer.timer); layer.timer = null; }
    if (layer.impl.onDisable) layer.impl.onDisable();
    $(`ct-${name}`).textContent = '';
  }
  localStorage.setItem(ON_KEY, JSON.stringify([...savedOn]));
}
const offButton = (name) => `<p class="note"><a href="#" data-off="${name}">Turn this layer off</a></p>`;
$('drawer-body').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-off]');
  if (a) { e.preventDefault(); toggleLayer(a.dataset.off, false); closeDrawer(); return; }
  const f = e.target.closest('button[data-fly]');
  if (f && !reduced()) { const [lon, lat, h] = f.dataset.fly.split(',').map(Number); flyToLonLat(viewer, lon, lat, { height: h || 900 }); }
});

// Picking
const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((click) => {
  const picked = viewer.scene.pick(click.position);
  if (!picked) return;
  const id = picked.id;
  if (id instanceof C.Entity && id.properties && id.properties.layer) {
    const layer = layers.get(id.properties.layer.getValue());
    const item = id.properties.item.getValue();
    if (layer && layer.impl.open) layer.impl.open(item, id);
    return;
  }
  if (typeof id === 'string' && id.startsWith('bld:') && buildings) {
    const b = buildings.index.get(id);
    if (b) openBuilding(b);
  }
}, C.ScreenSpaceEventType.LEFT_CLICK);

function openBuilding(b) {
  const src = { osm_tag: 'OpenStreetMap height tag', ms_global_ml: 'Microsoft Global ML footprints', district_zoning_default: 'district default', landmark_override: 'landmark' }[b.height_source] || b.height_source || '—';
  openDrawer('Building', b.name || 'Building', `
    <div class="kv">
      <span class="k">DISTRICT</span><span class="v">${esc(b.district || '—')}</span>
      <span class="k">HEIGHT</span><span class="v">${Math.round(b.height_m || 0)} m · ${b.levels || '?'} levels</span>
      <span class="k">FOOTPRINT</span><span class="v">${Math.round(b.area_m2 || 0).toLocaleString()} m²</span>
      <span class="k">HEIGHT SRC</span><span class="v">${esc(src)}</span>
      <span class="k">LAT / LON</span><span class="v">${b.center ? `${b.center[1].toFixed(5)}, ${b.center[0].toFixed(5)}` : '—'}</span>
    </div>
    <p class="note">Footprint © OpenStreetMap contributors (ODbL).</p>`);
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------
function labelOpts(text, far = 9000) {
  return {
    text, font: '500 11px JetBrains Mono, monospace',
    fillColor: C.Color.fromCssColorString('#ecebe6'),
    outlineColor: C.Color.fromCssColorString('#07090d'), outlineWidth: 3,
    style: C.LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new C.Cartesian2(0, -16), verticalOrigin: C.VerticalOrigin.BOTTOM,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    distanceDisplayCondition: new C.DistanceDisplayCondition(0, far),
    scaleByDistance: new C.NearFarScalar(800, 1.0, far, 0.6)
  };
}
function pointEntity(ds, { lon, lat, height = 0, color, size = 9, label, layer, item, outline = '#07090d', far = 9000 }) {
  return ds.entities.add({
    position: C.Cartesian3.fromDegrees(lon, lat, height),
    point: { pixelSize: size, color: C.Color.fromCssColorString(color), outlineColor: C.Color.fromCssColorString(outline), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: label ? labelOpts(label, far) : undefined,
    properties: { layer, item }
  });
}

// ---------------------------------------------------------------------------
// Now card (weather + AQI)
// ---------------------------------------------------------------------------
async function refreshNow() {
  try {
    const [wx, aq] = await Promise.all([fetchWeather(), fetchAirQuality().catch(() => null)]);
    const c = wx.current;
    const [cond, icon] = WMO[c.weather_code] || ['—', '·'];
    $('wx-icon').textContent = c.is_day ? icon : (c.weather_code <= 1 ? '🌙' : icon);
    $('wx-temp').textContent = Math.round(c.temperature_2m);
    $('wx-cond').textContent = `${cond} · ${Math.round(c.cloud_cover)}% cloud`;
    $('wx-feels').textContent = `${Math.round(c.apparent_temperature)}°`;
    $('wx-wind').textContent = `${Math.round(c.wind_speed_10m)} mph ${windDir(c.wind_direction_10m)}`;
    $('wx-hum').textContent = `${Math.round(c.relative_humidity_2m)}%`;
    $('wx-rise').textContent = fmtTime(wx.daily.sunrise[0]);
    $('wx-set').textContent = fmtTime(wx.daily.sunset[0]);
    if (aq && aq.current && aq.current.us_aqi != null) {
      const [band, color] = aqiBand(aq.current.us_aqi);
      $('wx-aqi').textContent = `${aq.current.us_aqi} ${band.split(' ')[0]}`;
      $('wx-aqi').style.color = color;
    } else { $('wx-aqi').textContent = '—'; }
    $('wx-src').textContent = `Open-Meteo · NWS · ${fmtTime(c.time)}`;
  } catch (e) {
    $('wx-cond').textContent = 'Weather unavailable';
  }
}
refreshNow();
setInterval(refreshNow, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

// Caltrans cameras ----------------------------------------------------------
let camTimer = null;
function showStill(cam) {
  const old = $('drawer-body').querySelector('video.cam, img.cam');
  if (!old) return;
  const img = document.createElement('img');
  img.className = 'cam'; img.id = 'cam-img'; img.alt = cam.name; img.src = cameraImageUrl(cam);
  old.replaceWith(img);
  const feed = $('cam-feed'); if (feed) feed.textContent = 'still · refreshes every 15 s';
  clearInterval(camTimer);
  camTimer = setInterval(() => { const i = $('cam-img'); if (i) i.src = cameraImageUrl(cam); else clearInterval(camTimer); }, 15000);
}
registerLayer('cameras', {
  every: 30 * 60 * 1000,
  fetch: fetchCameras,
  render(ds, items) {
    for (const cam of items) {
      pointEntity(ds, { lon: cam.lon, lat: cam.lat, height: 14, color: cam.inService ? (ROUTE_COLOR[cam.route] || '#ecebe6') : '#5a6372', size: cam.stream ? 11 : 9, label: `${cam.route} ${cam.dir ? cam.dir[0] : ''}`.trim(), layer: 'cameras', item: cam });
    }
  },
  open(cam) {
    const hasHls = cam.stream && (window.Hls?.isSupported() || document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));
    openDrawer(`Caltrans ${cam.route} · ${cam.dir || ''}bound`, cam.name, `
      ${hasHls ? '<video class="cam" id="cam-video" muted playsinline autoplay controls></video>' : `<img class="cam" id="cam-img" alt="${esc(cam.name)}" src="${cameraImageUrl(cam)}" />`}
      <div class="kv">
        <span class="k">CAMERA</span><span class="v">${esc(cam.id)} · ${cam.inService ? 'in service' : 'offline'}</span>
        <span class="k">DISTANCE</span><span class="v">${cam.km} km from downtown</span>
        <span class="k">FEED</span><span class="v" id="cam-feed">${hasHls ? 'live video (HLS)' : 'still · refreshes every 15 s'}</span>
      </div>
      ${hasHls ? '<p class="note"><a href="#" id="cam-still-link">Show the still instead</a></p>' : ''}
      <p class="note">Source: Caltrans District 4 CCTV. Stills update about every 5 minutes.</p>`);
    if (!reduced()) flyToLonLat(viewer, cam.lon, cam.lat, { height: 700, pitch: -34 });
    clearInterval(camTimer);
    if (hasHls) {
      const video = $('cam-video');
      if (window.Hls?.isSupported()) {
        const hls = new window.Hls({ enableWorker: true });
        hls.loadSource(cam.stream);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, (_, data) => { if (data.fatal) { hls.destroy(); showStill(cam); } });
        onDrawerClose = () => { try { hls.destroy(); } catch (e) {} clearInterval(camTimer); };
      } else {
        video.src = cam.stream;
        video.addEventListener('error', () => showStill(cam), { once: true });
      }
      $('cam-still-link')?.addEventListener('click', (e) => { e.preventDefault(); if (onDrawerClose) { onDrawerClose(); onDrawerClose = null; } showStill(cam); });
    } else {
      camTimer = setInterval(() => { const img = $('cam-img'); if (img) img.src = cameraImageUrl(cam); else clearInterval(camTimer); }, 15000);
      onDrawerClose = () => clearInterval(camTimer);
    }
  },
  summary(layer) {
    const items = layer.items.slice().sort((a, b) => a.km - b.km);
    openDrawer('Caltrans cameras', `${items.filter((c) => c.inService).length} in service within 8 km`, `<div class="list">${items.map((c) => `
      <button type="button" data-cam="${esc(c.id)}"><div class="t">${esc(c.route)} ${esc(c.dir || '')} · ${esc(c.name)}</div><div class="s">${c.km} km${c.stream ? ' · live video' : ''}${c.inService ? '' : ' · offline'}</div></button>`).join('')}</div>${offButton('cameras')}`);
    $('drawer-body').querySelectorAll('button[data-cam]').forEach((b) => b.addEventListener('click', () => { const cam = items.find((c) => c.id === b.dataset.cam); if (cam) layer.impl.open(cam); }));
  },
  onDisable() { clearInterval(camTimer); },
  count: (items) => String(items.filter((c) => c.inService).length)
});

// Traffic: closures + signs + CHP ------------------------------------------
registerLayer('traffic', {
  every: 2 * 60 * 1000,
  fetch: fetchTraffic,
  render(ds, { closures, signs, chp }) {
    for (const c of closures) pointEntity(ds, { lon: c.lon, lat: c.lat, height: 10, color: c.active ? '#f2ae49' : '#8a7a4a', size: c.active ? 10 : 7, label: c.active ? `${c.route} closure` : undefined, layer: 'traffic', item: { kind: 'closure', ...c } });
    for (const s of signs) if (s.lines.length) pointEntity(ds, { lon: s.lon, lat: s.lat, height: 10, color: '#d9b87c', size: 8, label: 'SIGN', layer: 'traffic', item: { kind: 'sign', ...s } });
    for (const i of chp || []) pointEntity(ds, { lon: i.lon, lat: i.lat, height: 10, color: '#f25c54', size: 11, label: (i.type || '').replace(/^\d+-/, '').slice(0, 26), layer: 'traffic', item: { kind: 'chp', ...i } });
  },
  open(it) {
    if (it.kind === 'chp') {
      openDrawer(`CHP · ${it.area || ''}`, (it.type || 'Incident').replace(/^\d+-/, ''), `
        <div class="kv"><span class="k">WHERE</span><span class="v">${esc(it.location)}${it.desc ? ' · ' + esc(it.desc) : ''}</span><span class="k">LOGGED</span><span class="v">${esc(it.time)}</span><span class="k">LOG</span><span class="v">${esc(it.id)}</span></div>
        ${it.details?.length ? `<div class="list">${it.details.map((d) => `<div class="row s">${esc(d)}</div>`).join('')}</div>` : ''}
        <p class="note">Source: CHP Traffic Incident Information Page, via the proxy, refreshed each minute.</p>`);
    } else if (it.kind === 'sign') {
      openDrawer(`Caltrans sign · ${it.route}`, it.id, `<div class="list"><div class="row mono">${it.lines.map(esc).join('<br>')}</div></div><p class="note">Changeable message sign text as published by Caltrans District 4.</p>`);
    } else {
      openDrawer(`Caltrans closure · ${it.route} ${it.dir && it.dir !== 'N/A' ? it.dir : ''}`, `${it.type || 'Closure'} · ${it.work || ''}`, `
        <div class="kv">
          <span class="k">WHERE</span><span class="v">${esc(it.from)}${it.to && it.to !== it.from ? ' → ' + esc(it.to) : ''}</span>
          <span class="k">LANES</span><span class="v">${esc(it.lanes || '—')} of ${esc(it.lanesTotal || '?')}</span>
          <span class="k">WHEN</span><span class="v">${it.start ? fmtDT(it.start * 1000) : '—'} → ${it.end ? fmtDT(it.end * 1000) : 'open-ended'}</span>
          <span class="k">STATUS</span><span class="v">${it.active ? '<span class="pill amber">active now</span>' : 'scheduled'}${it.delay && it.delay !== 'None' ? ' · est. delay ' + esc(it.delay) : ''}</span>
        </div><p class="note">Source: Caltrans Lane Closure System (District 4).</p>`);
    }
    if (!reduced()) flyToLonLat(viewer, it.lon, it.lat, { height: 1200, pitch: -40 });
  },
  summary(layer) {
    const { closures, signs, chp } = layer.items;
    const active = closures.filter((c) => c.active);
    openDrawer('Traffic', `${active.length} active closure${active.length === 1 ? '' : 's'} · ${closures.length - active.length} scheduled`, `
      ${chp === null ? proxyNote('CHP incidents (collisions, hazards, stalls)') : chp.length ? `<div class="list">${chp.map((i) => `<button type="button" data-fly="${i.lon},${i.lat},1200"><div class="t"><span class="pill red">CHP</span>${esc((i.type || '').replace(/^\d+-/, ''))}</div><div class="s">${esc(i.location)} · ${esc(i.time)}</div></button>`).join('')}</div>` : '<p>No CHP incidents in the area right now.</p>'}
      <div class="list" style="margin-top:10px">${closures.slice(0, 20).map((c) => `<button type="button" data-fly="${c.lon},${c.lat},1200"><div class="t">${c.active ? '<span class="pill amber">now</span>' : ''}${esc(c.route)} · ${esc(c.from)}</div><div class="s">${esc(c.type)} · ${esc(c.work)} · ${c.start ? fmtDT(c.start * 1000) : ''}</div></button>`).join('')}</div>
      ${signs.some((s) => s.lines.length) ? '' : '<p class="note">All nearby message signs are blank.</p>'}${offButton('traffic')}`);
  },
  count: ({ closures, chp }) => String(closures.filter((c) => c.active).length + (chp ? chp.length : 0))
});

// Flights (ADS-B via proxy) --------------------------------------------------
registerLayer('flights', {
  every: 10 * 1000,
  fetch: fetchFlights,
  render(ds, items) {
    for (const a of items) {
      const color = altitudeColor(a.altFt);
      ds.entities.add({
        position: C.Cartesian3.fromDegrees(a.lon, a.lat, Math.max(0, a.altFt * 0.3048)),
        billboard: { image: planeIcon(color), rotation: -C.Math.toRadians(a.track || 0), alignedAxis: C.Cartesian3.UNIT_Z, width: a.onGround ? 16 : 24, height: a.onGround ? 16 : 24, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { ...labelOpts(`${a.callsign}${a.onGround ? '' : ` · ${Math.round(a.altFt / 100) * 100} ft`}`, 60000), font: '500 10px JetBrains Mono, monospace', pixelOffset: new C.Cartesian2(0, -18) },
        properties: { layer: 'flights', item: a }
      });
    }
  },
  open(a) {
    openDrawer(`Aircraft · ${a.source}`, a.callsign, `
      <div class="kv">
        <span class="k">TYPE</span><span class="v">${esc(a.type || '—')}${a.desc ? ' · ' + esc(a.desc) : ''}</span>
        <span class="k">OPERATOR</span><span class="v">${esc(a.operator || '—')}</span>
        <span class="k">REG</span><span class="v">${esc(a.reg || '—')} · ${esc(a.hex)}</span>
        <span class="k">ALTITUDE</span><span class="v">${a.onGround ? 'on the ground' : `${a.altFt.toLocaleString()} ft${a.vrate ? ` · ${a.vrate > 0 ? '↑' : '↓'} ${Math.abs(a.vrate)} fpm` : ''}`}</span>
        <span class="k">SPEED</span><span class="v">${Math.round(a.gsKt)} kt · track ${Math.round(a.track)}°</span>
        <span class="k">SQUAWK</span><span class="v">${esc(a.squawk || '—')}${a.emergency ? ` · <span class="pill red">${esc(a.emergency)}</span>` : ''}</span>
      </div>
      <a href="https://globe.adsb.lol/?icao=${esc(a.hex)}" target="_blank" rel="noopener">Track on adsb.lol ↗</a>
      <p class="note">Community ADS-B receivers (adsb.fi / adsb.lol). Positions can lag a few seconds; some military and private aircraft are absent.</p>`);
  },
  summary(layer) {
    if (layer.error instanceof ProxyMissing) { openDrawer('Flights', 'Aircraft over Moffett and the SFO/SJC approaches', proxyNote('The aircraft layer') + offButton('flights')); return; }
    const items = layer.items.filter((a) => !a.onGround).sort((a, b) => a.altFt - b.altFt);
    openDrawer('Flights', `${items.length} airborne within 22 nm`, `<div class="list">${items.slice(0, 30).map((a) => `<button type="button" data-fly="${a.lon},${a.lat},${Math.max(1500, a.altFt * 0.3048 + 800)}"><div class="t">${esc(a.callsign)} · ${esc(a.type || '')}</div><div class="s">${a.altFt.toLocaleString()} ft · ${Math.round(a.gsKt)} kt</div></button>`).join('')}</div>${offButton('flights')}`);
  },
  count: (items) => String(items.filter((a) => !a.onGround).length)
});

// Transit: Caltrain stations (always) + live trains (proxy) -------------------
registerLayer('transit', {
  every: 30 * 1000,
  fetch: fetchTransit,
  render(ds, { trains, stations }) {
    for (const s of stations) pointEntity(ds, { lon: s.lon, lat: s.lat, height: 8, color: '#ecebe6', size: 7, label: `${s.name} Caltrain`, layer: 'transit', item: { kind: 'station', ...s } });
    for (const t of trains || []) pointEntity(ds, { lon: t.lon, lat: t.lat, height: 12, color: '#f25c54', size: 11, label: `Train ${t.label || t.id}`, layer: 'transit', item: { kind: 'train', ...t }, far: 20000 });
  },
  open(it) {
    if (it.kind === 'train') {
      openDrawer('Caltrain · live', `Train ${it.label || it.id}`, `<div class="kv"><span class="k">ROUTE</span><span class="v">${esc(it.route || '—')} · ${it.direction === 0 ? 'northbound' : it.direction === 1 ? 'southbound' : '—'}</span><span class="k">TRIP</span><span class="v">${esc(it.tripId || '—')}</span><span class="k">HEADING</span><span class="v">${it.bearing != null ? Math.round(it.bearing) + '°' : '—'}</span></div><p class="note">Caltrain GTFS-Realtime via the proxy, refreshed every 30 s.</p>`);
    } else {
      openDrawer('Caltrain station', it.name, `<p><a href="https://www.caltrain.com/stations/${esc(it.name.toLowerCase().replace(/ /g, ''))}station" target="_blank" rel="noopener">Station page and schedule ↗</a></p>`);
    }
    if (!reduced()) flyToLonLat(viewer, it.lon, it.lat, { height: 900 });
  },
  summary(layer) {
    const { trains } = layer.items;
    openDrawer('Transit', trains ? `${trains.length} Caltrain trains reporting` : 'Caltrain stations', trains === null ? proxyNote('Live train positions') + offButton('transit') : `<div class="list">${(trains || []).map((t) => `<button type="button" data-fly="${t.lon},${t.lat},1500"><div class="t">Train ${esc(t.label || t.id)}</div><div class="s">${esc(t.route || '')} · ${t.direction === 0 ? 'NB' : t.direction === 1 ? 'SB' : ''}</div></button>`).join('')}</div>${offButton('transit')}`);
  },
  count: ({ trains }) => (trains ? String(trains.length) : '⚙')
});

// Alerts (NWS) ---------------------------------------------------------------
registerLayer('alerts', {
  every: 2 * 60 * 1000,
  fetch: fetchAlerts,
  render(ds, items) {
    if (items.length) pointEntity(ds, { lon: MV.lon, lat: MV.lat, color: '#f2ae49', size: 12, label: `${items.length} NWS alert${items.length > 1 ? 's' : ''}`, layer: 'alerts', item: { all: true } });
  },
  open() { layers.get('alerts').impl.summary(layers.get('alerts')); },
  summary(layer) {
    const items = layer.items;
    openDrawer('NWS alerts', items.length ? `${items.length} active for Mountain View` : 'No active alerts', (items.length ? `<div class="list">${items.map((a) => `
      <div class="row"><div class="t"><span class="pill ${/Extreme|Severe/.test(a.severity) ? 'red' : 'amber'}">${esc(a.severity)}</span>${esc(a.event)}</div><div class="s">until ${a.ends ? fmtTime(a.ends) : '—'}</div><div style="margin-top:6px">${esc(a.headline || '')}</div></div>`).join('')}</div>` :
      '<p>Nothing from the National Weather Service for this point right now.</p>') + '<p class="note">Source: api.weather.gov, zone CAZ508, refreshed every 2 minutes.</p>' + offButton('alerts'));
  },
  count: (items) => String(items.length)
});

// Quakes (USGS) --------------------------------------------------------------
registerLayer('quakes', {
  every: 5 * 60 * 1000,
  fetch: fetchQuakes,
  render(ds, items) {
    for (const q of items) {
      const ageH = (Date.now() - q.time) / 3.6e6;
      pointEntity(ds, { lon: q.lon, lat: q.lat, color: ageH < 24 ? '#f25c54' : ageH < 72 ? '#f2ae49' : '#8a93a6', size: 6 + Math.max(0, q.mag - 2) * 4, label: `M${q.mag.toFixed(1)}`, layer: 'quakes', item: q, far: 400000 });
    }
  },
  open(q) {
    openDrawer('USGS earthquake', `M${q.mag.toFixed(1)} · ${q.place}`, `<div class="kv"><span class="k">WHEN</span><span class="v">${fmtDT(q.time)}</span><span class="k">DEPTH</span><span class="v">${q.depth.toFixed(1)} km</span><span class="k">DISTANCE</span><span class="v">${q.km.toFixed(0)} km from Mountain View</span></div><a href="${esc(q.url)}" target="_blank" rel="noopener">USGS event page ↗</a>`);
    if (!reduced()) flyToLonLat(viewer, q.lon, q.lat, { height: Math.max(4000, q.km * 400) });
  },
  summary(layer) {
    const items = layer.items;
    openDrawer('Earthquakes', `${items.length} of M2.5+ within 200 km this week`, `<div class="list">${items.slice(0, 25).map((q) => `<button type="button" data-fly="${q.lon},${q.lat},${Math.max(4000, q.km * 400)}"><div class="t">M${q.mag.toFixed(1)} · ${esc(q.place)}</div><div class="s">${fmtDT(q.time)} · ${q.km.toFixed(0)} km</div></button>`).join('')}</div>${offButton('quakes')}`);
  }
});

// Outages (PG&E) -------------------------------------------------------------
registerLayer('outages', {
  every: 3 * 60 * 1000,
  fetch: fetchOutages,
  render(ds, items) {
    for (const o of items) pointEntity(ds, { lon: o.lon, lat: o.lat, height: 10, color: o.type === 'Planned' ? '#d9b87c' : '#f2ae49', size: 7 + Math.min(10, Math.log2(1 + o.customers) * 1.6), label: `${o.customers.toLocaleString()} out`, layer: 'outages', item: o, far: 30000 });
  },
  open(o) {
    openDrawer(`PG&E outage · ${o.type}`, `${o.customers.toLocaleString()} customer${o.customers === 1 ? '' : 's'} · ${o.cause}`, `<div class="kv"><span class="k">STATUS</span><span class="v">${esc(o.status)}</span><span class="k">STARTED</span><span class="v">${o.start ? fmtDT(o.start) : '—'}</span><span class="k">EST. RESTORE</span><span class="v">${o.etr ? fmtDT(o.etr) : '—'}</span><span class="k">COUNTY</span><span class="v">${esc(o.county)}</span></div><p class="note">Source: PG&E outage map (ArcGIS view), refreshed every 3 minutes.</p>`);
    if (!reduced()) flyToLonLat(viewer, o.lon, o.lat, { height: 1500 });
  },
  summary(layer) {
    const items = layer.items;
    const total = items.reduce((s, o) => s + o.customers, 0);
    openDrawer('Power', items.length ? `${items.length} outage${items.length === 1 ? '' : 's'} · ${total.toLocaleString()} customers within 20 km` : 'No PG&E outages within 20 km', `<div class="list">${items.map((o) => `<button type="button" data-fly="${o.lon},${o.lat},1500"><div class="t">${o.customers.toLocaleString()} · ${esc(o.cause)}</div><div class="s">${esc(o.type)} · ${esc(o.status)} · ETR ${o.etr ? fmtDT(o.etr) : '—'}</div></button>`).join('')}</div>${offButton('outages')}`);
  },
  count: (items) => String(items.length)
});

// Fire (NIFC) ----------------------------------------------------------------
registerLayer('fire', {
  every: 5 * 60 * 1000,
  fetch: fetchFires,
  render(ds, items) {
    for (const f of items) pointEntity(ds, { lon: f.lon, lat: f.lat, color: '#f25c54', size: 8 + Math.min(12, Math.log2(1 + f.acres) * 1.3), label: `${f.name} fire`, layer: 'fire', item: f, far: 400000 });
  },
  open(f) {
    openDrawer(`Wildfire · ${f.county} County`, `${f.name} Fire`, `<div class="kv"><span class="k">SIZE</span><span class="v">${f.acres.toLocaleString()} acres${f.contained != null ? ` · ${f.contained}% contained` : ''}</span><span class="k">DISCOVERED</span><span class="v">${f.discovered ? fmtDT(f.discovered) : '—'}</span><span class="k">CAUSE</span><span class="v">${esc(f.cause || '—')}</span><span class="k">DISTANCE</span><span class="v">${f.km} km</span></div><p class="note">Source: NIFC WFIGS current incidents (interagency).</p>`);
    if (!reduced()) flyToLonLat(viewer, f.lon, f.lat, { height: Math.max(4000, f.km * 300) });
  },
  summary(layer) {
    const items = layer.items;
    openDrawer('Wildfire', items.length ? `${items.length} active incident${items.length === 1 ? '' : 's'} within 120 km` : 'No active wildfire incidents within 120 km', `<div class="list">${items.map((f) => `<button type="button" data-fly="${f.lon},${f.lat},${Math.max(4000, f.km * 300)}"><div class="t">${esc(f.name)} · ${f.acres.toLocaleString()} ac</div><div class="s">${esc(f.county)} · ${f.km} km</div></button>`).join('')}</div>${offButton('fire')}`);
  }
});

// Scanner: links panel (embedding is not permitted; MVPD radio is encrypted) ---
const scannerPanel = () => openDrawer('Scanner', 'Fire, EMS and police', `
  <p>Mountain View police radio is encrypted statewide (a CA DOJ requirement), so there is no live police audio anywhere. Fire and EMS dispatch is open; these players cannot be embedded, so they open in a new tab.</p>
  <div class="list">
    <a class="row" href="https://www.broadcastify.com/listen/feed/16240" target="_blank" rel="noopener"><div class="t">Mountain View Fire · dispatch + command</div><div class="s">Broadcastify feed 16240 · left: dispatch, right: command</div></a>
    <a class="row" href="https://www.broadcastify.com/listen/feed/45483" target="_blank" rel="noopener"><div class="t">Santa Clara County Fire · dispatch</div><div class="s">Broadcastify feed 45483</div></a>
    <a class="row" href="https://openmhz.com/system/svrcs2" target="_blank" rel="noopener"><div class="t">SVRCS trunked system · recorded calls</div><div class="s">OpenMHz svrcs2 · MV Fire, SCC EMS, VTA talkgroups</div></a>
    <a class="row" href="https://web.pulsepoint.org/?agencies=43050" target="_blank" rel="noopener"><div class="t">PulsePoint · Mountain View Fire incidents</div><div class="s">active and recent calls, agency 43050</div></a>
    <a class="row" href="https://www.mountainview.gov/our-city/departments/police" target="_blank" rel="noopener"><div class="t">MVPD · calls-for-service logs and dashboard</div><div class="s">weekly logs and the transparency dashboard</div></a>
  </div>
  <p class="note">For live collisions and road hazards on the map, turn on Traffic: it carries CHP incidents when the proxy is set.</p>${offButton('scanner')}`);
registerLayer('scanner', {
  fetch: async () => [],
  render() {},
  summary: () => scannerPanel(),
  onFirstOn: () => scannerPanel(),
  count: () => ''
});

// ---------------------------------------------------------------------------
// Radio
// ---------------------------------------------------------------------------
const moodSel = $('radio-mood');
for (const m of MOODS) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; moodSel.appendChild(o); }
moodSel.value = localStorage.getItem('mv_live_radio_mood') || MOODS[0].id;
const radio = new Radio({ play: $('radio-play'), next: $('radio-next'), mood: moodSel, name: $('radio-name'), meta: $('radio-meta'), volume: $('radio-vol'), status: $('radio-status') });
radio.setMood(moodSel.value);
window.__mvLive.radio = radio;
window.__mvLive.layers = layers;
if (!hasProxy()) { status('tip: flights, chp incidents and caltrain need the proxy (⚙)'); setTimeout(() => status(''), 7000); }
