// Pirate Frequency (Tape No. 07) — Atomic-Dusk / Neon-Night Mountain View World
// Built from real OpenStreetMap geometry (assets/mountain-view-map.json) with
// spatial-hashed building/rooftop physics, 24 neon grind rails, 18 kicker ramps,
// a 158m Pirate Radio Broadcast Mast, and 19 Mountain View courier zones.

import * as DefaultTHREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CELL_SIZE = 32;

const SPAWN_POINT = Object.freeze({
  x: -75.0,
  y: 0.0,
  z: 535.0,
  yaw: 0.0,
});

const MAST_HUB = Object.freeze({
  x: -128.0,
  z: 262.0,
  height: 158.0,
  deckY: 13.0,
  deckHalf: 4.8,
});

// 19 curated Mountain View spots along the Downtown Castro -> Creek -> Shoreline corridor
// (includes all 14 canonical spots + 5 corridor connectors so every spot has >=2 nearby
// pickups in [180m, 450m] and >=3 dramatic dropoffs in [350m, 950m], all >=23m clear of buildings).
const ZONE_DEFS = [
  { id: 'castro-vinyl', name: 'Castro Vinyl Vault', x: -30.0, y: 0, z: 315.0, neighborhood: 'Downtown Castro' },
  { id: 'dana-espresso', name: 'Dana St Espresso', x: 175.0, y: 0, z: 330.0, neighborhood: 'Downtown East' },
  { id: 'pioneer-park', name: 'Pioneer Park Gazebo', x: -415.0, y: 0, z: 705.0, neighborhood: 'Downtown South' },
  { id: 'civic-center', name: 'Civic Center Plaza', x: -215.0, y: 0, z: 680.0, neighborhood: 'Downtown Castro' },
  { id: 'caltrain-platform', name: 'Caltrain Platform', x: 130.0, y: 0, z: 225.0, neighborhood: 'Transit Center' },
  { id: 'evelyn-tower', name: 'Evelyn Ave Tower', x: -155.0, y: 0, z: 70.0, neighborhood: 'Transit West' },
  { id: 'landels-bridge', name: 'Landels Footbridge', x: 435.0, y: 0, z: 100.0, neighborhood: 'Stevens Creek' },
  { id: 'whisman-skate', name: 'Whisman Skate Spot', x: 610.0, y: 0, z: -225.0, neighborhood: 'Whisman Station' },
  { id: 'rengstorff-bowl', name: 'Rengstorff Bowl', x: -375.0, y: 0, z: -235.0, neighborhood: 'Shoreline West' },
  { id: 'middlefield-hub', name: 'Middlefield Signal Box', x: -200.0, y: 0, z: -510.0, neighborhood: 'Midtown Shoreline' },
  { id: 'stevens-overpass', name: 'Stevens Creek Overpass', x: 295.0, y: 0, z: -670.0, neighborhood: 'Creek Trail' },
  { id: 'moffett-gate', name: 'Moffett Gate', x: 520.0, y: 0, z: -920.0, neighborhood: 'Moffett Corridor' },
  { id: 'bayshore-arch', name: 'Bayshore 101 Overpass', x: -50.0, y: 0, z: -885.0, neighborhood: 'US-101 Crossing' },
  { id: 'la-avenida', name: 'La Avenida Neon Diner', x: -40.0, y: 0, z: -1230.0, neighborhood: 'North Bayshore' },
  { id: 'chm-plaza', name: 'Computer History Plaza', x: 75.0, y: 0, z: -1660.0, neighborhood: 'Silicon Corridor' },
  { id: 'crittenden-trail', name: 'Shoreline Creek Bridge', x: 85.0, y: 0, z: -2040.0, neighborhood: 'Stevens Creek North' },
  { id: 'charleston-arcade', name: 'Charleston Arcade', x: -135.0, y: 0, z: -2430.0, neighborhood: 'Googleplex West' },
  { id: 'gradient-canopy', name: 'Gradient Canopy', x: 45.0, y: 0, z: -2745.0, neighborhood: 'Bayshore Campus' },
  { id: 'shoreline-stage', name: 'Shoreline Tent Stage', x: -130.0, y: 0, z: -3085.0, neighborhood: 'Shoreline Park' },
];

// 24 Neon Grind Rails (CatmullRomCurve3 splines along real streets, bridges, overpasses & rooftops)
const RAIL_DEFS = [
  {
    id: 'rail-castro-plaza',
    name: 'Castro Plaza Median',
    color: 'cyan',
    points: [[-74.2, 1.25, 521.0], [-74.8, 1.34, 496.8], [-74.0, 1.45, 465.0], [-69.7, 1.58, 435.9], [-62.0, 1.65, 405.0], [-47.2, 1.51, 366.2], [-34.0, 1.35, 335.0]],
  },
  {
    id: 'rail-castro-north',
    name: 'Castro Station Express',
    color: 'yellow',
    points: [[-22.0, 1.35, 302.0], [-12.0, 1.43, 276.2], [4.0, 1.6, 245.0], [25.9, 2.07, 218.8], [52.0, 2.4, 202.0], [85.0, 1.98, 208.3], [112.0, 1.45, 220.0]],
  },
  {
    id: 'rail-civic-pioneer',
    name: 'Civic-to-Pioneer Sky Arc',
    color: 'cyan',
    points: [[-138.0, 1.4, 545.0], [-160.7, 12.5, 601.4], [-198.0, 20.5, 662.0], [-255.1, 21.0, 685.2], [-315.0, 21.0, 695.0], [-363.8, 12.5, 701.6], [-398.0, 1.4, 704.0]],
  },
  {
    id: 'rail-villa-west',
    name: 'Villa Street Neon Line',
    color: 'yellow',
    points: [[2.0, 1.4, 242.0], [-30.4, 4.5, 225.8], [-72.0, 10.5, 205.0], [-112.5, 12.2, 189.3], [-145.0, 12.0, 168.0], [-154.6, 10.8, 124.7], [-155.0, 1.4, 86.0]],
  },
  {
    id: 'rail-dana-east',
    name: 'Dana Street Espresso Rail',
    color: 'cyan',
    points: [[-22.0, 1.4, 540.0], [0.8, 1.6, 494.8], [32.0, 1.8, 432.0], [65.5, 1.85, 353.1], [100.0, 1.8, 292.0], [136.2, 1.6, 304.2], [162.0, 1.4, 326.0]],
  },
  {
    id: 'rail-rooftop-castro-east',
    name: 'Bryant-to-Dana Rooftop Zip',
    color: 'yellow',
    rooftop: true,
    points: [[42.0, 11.8, 485.0], [55.1, 12.4, 462.9], [72.0, 13.2, 435.0], [87.4, 13.4, 411.2], [102.0, 13.0, 388.0], [115.4, 11.4, 362.1], [125.0, 10.1, 342.0]],
  },
  {
    id: 'rail-rooftop-downtown-west',
    name: 'Civic Center Rooftop Zip',
    color: 'cyan',
    rooftop: true,
    points: [[-292.0, 20.2, 659.0], [-273.6, 19.4, 600.1], [-250.0, 19.0, 525.0], [-228.9, 18.2, 458.9], [-208.0, 17.0, 395.0], [-184.9, 15.4, 328.4], [-167.0, 14.7, 278.0]],
  },
  {
    id: 'rail-rooftop-hope-skywire',
    name: 'Pirate Mast Highwire',
    color: 'yellow',
    rooftop: true,
    points: [[-34.0, 13.0, 144.0], [-47.6, 14.2, 162.1], [-65.0, 16.0, 185.0], [-80.7, 16.6, 204.9], [-96.0, 16.2, 224.0], [-111.9, 14.9, 243.4], [-124.0, 13.8, 258.0]],
  },
  {
    id: 'rail-caltrain-flyover',
    name: 'Caltrain Transit Flyover',
    color: 'cyan',
    points: [[142.0, 1.5, 218.0], [182.4, 10.2, 202.5], [235.0, 12.0, 182.0], [283.7, 12.6, 162.2], [332.0, 11.8, 142.0], [383.1, 10.2, 119.5], [422.0, 1.6, 102.0]],
  },
  {
    id: 'rail-evelyn-central',
    name: 'Central Expressway Overpass',
    color: 'yellow',
    points: [[-165.0, 1.4, 52.0], [-195.6, 4.12, 9.3], [-235.0, 6.8, -45.0], [-270.4, 7.24, -92.4], [-305.0, 6.4, -138.0], [-340.9, 3.92, -184.8], [-368.0, 1.5, -220.0]],
  },
  {
    id: 'rail-rengstorff-middlefield',
    name: 'Rengstorff Bowl Arc',
    color: 'cyan',
    points: [[-362.0, 1.5, -252.0], [-339.4, 5.68, -289.8], [-310.0, 9.8, -338.0], [-282.3, 10.61, -380.8], [-255.0, 9.4, -422.0], [-227.1, 5.42, -464.2], [-206.0, 1.5, -496.0]],
  },
  {
    id: 'rail-shoreline-midtown',
    name: 'Shoreline Midtown Viaduct',
    color: 'yellow',
    points: [[-148.0, 1.4, 48.0], [-157.0, 5.11, -24.1], [-168.0, 8.8, -120.0], [-176.6, 9.61, -214.2], [-184.0, 8.6, -310.0], [-190.5, 5.04, -411.9], [-195.0, 1.5, -490.0]],
  },
  {
    id: 'rail-landels-whisman',
    name: 'Stevens Creek Levee Rail',
    color: 'cyan',
    points: [[448.0, 1.5, 85.0], [473.2, 5.02, 41.4], [505.0, 8.5, -15.0], [532.3, 9.21, -67.0], [558.0, 8.2, -118.0], [583.3, 4.83, -170.4], [602.0, 1.5, -210.0]],
  },
  {
    id: 'rail-creek-ca85-arch',
    name: 'CA-85 Freeway Overpass Arc',
    color: 'yellow',
    points: [[592.0, 1.6, -242.0], [553.2, 7.22, -302.2], [502.0, 12.8, -380.0], [452.2, 14.03, -450.2], [402.0, 12.5, -520.0], [348.8, 7.03, -595.8], [308.0, 1.6, -654.0]],
  },
  {
    id: 'rail-middlefield-creek',
    name: 'Middlefield Creek Span',
    color: 'cyan',
    points: [[-182.0, 1.5, -518.0], [-113.5, 5.52, -539.9], [-25.0, 9.5, -568.0], [55.9, 10.33, -593.2], [135.0, 9.2, -618.0], [216.5, 5.33, -644.1], [278.0, 1.5, -664.0]],
  },
  {
    id: 'rail-moffett-express',
    name: 'Moffett Boulevard Median',
    color: 'yellow',
    points: [[312.0, 1.5, -682.0], [342.6, 4.02, -717.1], [382.0, 6.5, -762.0], [417.9, 6.96, -801.9], [452.0, 6.2, -840.0], [484.4, 3.83, -877.9], [508.0, 1.5, -906.0]],
  },
  {
    id: 'rail-moffett-to-bayshore',
    name: 'Bayshore Connector Ramp',
    color: 'cyan',
    points: [[495.0, 1.6, -922.0], [416.2, 6.07, -916.8], [315.0, 10.5, -910.0], [224.4, 11.44, -904.1], [135.0, 10.2, -898.0], [38.8, 5.88, -890.8], [-35.0, 1.6, -885.0]],
  },
  {
    id: 'rail-us101-skyway',
    name: 'US-101 Pedestrian Skybridge',
    color: 'yellow',
    points: [[-55.0, 1.6, -902.0], [-52.8, 7.7, -949.1], [-50.0, 13.8, -1010.0], [-47.4, 15.33, -1065.8], [-45.0, 13.8, -1120.0], [-43.2, 7.7, -1174.4], [-42.0, 1.6, -1215.0]],
  },
  {
    id: 'rail-north-shoreline-s',
    name: 'La Avenida S-Curve',
    color: 'cyan',
    points: [[-36.0, 1.5, -1248.0], [-19.4, 4.36, -1308.1], [2.0, 7.2, -1385.0], [21.4, 7.8, -1453.3], [40.0, 7.0, -1520.0], [58.4, 4.24, -1590.4], [72.0, 1.5, -1644.0]],
  },
  {
    id: 'rail-chm-crittenden',
    name: 'Silicon Row Monorail',
    color: 'yellow',
    points: [[78.0, 1.5, -1678.0], [79.9, 4.0, -1730.5], [82.0, 6.5, -1798.0], [83.2, 7.12, -1858.9], [84.0, 6.5, -1918.0], [84.6, 4.05, -1978.5], [85.0, 1.6, -2024.0]],
  },
  {
    id: 'rail-creek-charleston',
    name: 'Stevens Creek North Bridge',
    color: 'cyan',
    points: [[75.0, 1.6, -2058.0], [44.8, 10.2, -2111.4], [6.0, 13.8, -2180.0], [-28.2, 15.0, -2241.6], [-62.0, 13.6, -2302.0], [-99.2, 13.2, -2366.1], [-128.0, 1.5, -2415.0]],
  },
  {
    id: 'rail-charleston-canopy',
    name: 'Charleston Solar Paseo',
    color: 'yellow',
    points: [[-122.0, 1.5, -2445.0], [-98.4, 13.8, -2488.9], [-68.0, 14.5, -2545.0], [-40.9, 15.8, -2594.2], [-14.0, 14.2, -2642.0], [15.4, 12.6, -2692.1], [38.0, 1.5, -2730.0]],
  },
  {
    id: 'rail-canopy-solar-swoop',
    name: 'Gradient Canopy Swoop',
    color: 'cyan',
    points: [[92.0, 1.6, -2062.0], [92.5, 11.8, -2159.4], [92.0, 13.4, -2285.0], [90.0, 13.8, -2397.8], [84.0, 13.4, -2510.0], [67.5, 12.4, -2633.1], [52.0, 1.6, -2728.0]],
  },
  {
    id: 'rail-shoreline-tent-finale',
    name: 'Shoreline Amphitheatre Cable Swoop',
    color: 'yellow',
    points: [[55.0, 1.6, -2765.0], [66.7, 9.5, -2830.9], [68.0, 16.5, -2910.0], [34.0, 31.2, -2967.9], [-15.0, 31.2, -3015.0], [-73.7, 11.2, -3051.1], [-122.0, 1.6, -3074.0]],
  },
];

// 18 Atomic-Orange Kicker Ramps angled toward rooftops & high grind rails
const RAMP_DEFS = [
  { id: 'ramp-castro-launch', x: -82, z: 492, dirX: 0.998, dirZ: -0.056, boostVelY: 22.5, forwardBoost: 16.0 },
  { id: 'ramp-bryant-roof', x: 5, z: 515, dirX: 0.777, dirZ: -0.630, boostVelY: 21.5, forwardBoost: 15.0 },
  { id: 'ramp-civic-arts', x: -235, z: 675, dirX: -0.963, dirZ: -0.270, boostVelY: 25.0, forwardBoost: 17.0 },
  { id: 'ramp-pioneer-kicker', x: -385, z: 695, dirX: 0.996, dirZ: -0.088, boostVelY: 19.5, forwardBoost: 15.5 },
  { id: 'ramp-villa-mast', x: -62, z: 265, dirX: -0.994, dirZ: -0.112, boostVelY: 23.0, forwardBoost: 16.5 },
  { id: 'ramp-hope-rooftop', x: -2, z: 185, dirX: -0.615, dirZ: -0.788, boostVelY: 21.5, forwardBoost: 15.5 },
  { id: 'ramp-dana-roof', x: 161, z: 352, dirX: -0.964, dirZ: -0.268, boostVelY: 20.5, forwardBoost: 15.0 },
  { id: 'ramp-caltrain-arch', x: 155, z: 212, dirX: 0.936, dirZ: -0.351, boostVelY: 21.0, forwardBoost: 16.5 },
  { id: 'ramp-evelyn-west', x: -162, z: 62, dirX: -0.564, dirZ: -0.826, boostVelY: 20.0, forwardBoost: 16.0 },
  { id: 'ramp-landels-creek', x: 442, z: 92, dirX: 0.507, dirZ: -0.862, boostVelY: 20.5, forwardBoost: 16.0 },
  { id: 'ramp-whisman-ca85', x: 598, z: -232, dirX: -0.544, dirZ: -0.839, boostVelY: 22.5, forwardBoost: 17.5 },
  { id: 'ramp-rengstorff-lip', x: -368, z: -244, dirX: 0.525, dirZ: -0.851, boostVelY: 21.0, forwardBoost: 16.0 },
  { id: 'ramp-middlefield-fly', x: -192, z: -515, dirX: 0.953, dirZ: -0.302, boostVelY: 21.5, forwardBoost: 16.5 },
  { id: 'ramp-stevens-trail', x: 302, z: -676, dirX: 0.681, dirZ: -0.732, boostVelY: 20.0, forwardBoost: 16.0 },
  { id: 'ramp-us101-south', x: -54, z: -894, dirX: 0.034, dirZ: -0.999, boostVelY: 23.5, forwardBoost: 18.0 },
  { id: 'ramp-chm-boost', x: 76, z: -1668, dirX: 0.046, dirZ: -0.999, boostVelY: 20.0, forwardBoost: 16.0 },
  { id: 'ramp-charleston-gap', x: -126, z: -2438, dirX: 0.477, dirZ: -0.879, boostVelY: 22.5, forwardBoost: 17.0 },
  { id: 'ramp-shoreline-stage', x: 48, z: -2756, dirX: 0.129, dirZ: -0.992, boostVelY: 23.5, forwardBoost: 18.0 },
];

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

async function loadJsonAsset(relBrowserUrl, fallbackPath) {
  if (typeof fetch === 'function') {
    try {
      const res = await fetch(relBrowserUrl);
      if (res && res.ok) return await res.json();
    } catch (_) {
      // Fall through to Node fs fallback for sandboxed verification suites
    }
  }
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile(fallbackPath, 'utf8');
    return JSON.parse(raw);
  }
  throw new Error(`Unable to load map asset: ${relBrowserUrl}`);
}

// Convert flat decimeter array [x0, y0, ...] to world XZ polygon [[worldX, worldZ], ...]
// normalized so signedArea2 < 0 (CCW when viewed from +Y sky -> +Y roof normal & outward wall normals).
function extractWorldPolygon(flatDecimeters) {
  const nRaw = Math.floor(flatDecimeters.length / 2);
  if (nRaw < 3) return null;
  const pts = [];
  for (let i = 0; i < nRaw; i++) {
    const wx = flatDecimeters[i * 2] * 0.1;
    const wz = -flatDecimeters[i * 2 + 1] * 0.1;
    if (pts.length > 0) {
      const prev = pts[pts.length - 1];
      if (Math.hypot(wx - prev[0], wz - prev[1]) < 0.02) continue;
    }
    pts.push([wx, wz]);
  }
  if (pts.length > 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.02) pts.pop();
  }
  if (pts.length < 3) return null;

  let area2 = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % n];
    area2 += x0 * z1 - x1 * z0;
  }
  if (Math.abs(area2) < 1e-3) return null;
  if (area2 > 0) pts.reverse();
  return pts;
}

// Fast 2D ear-clipping triangulator for normalized world XZ polygons (signedArea2 < 0).
function triangulateXZ(pts) {
  const n = pts.length;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  const V = [];
  for (let i = 0; i < n; i++) V.push(i);

  const tris = [];
  let count = 2 * n;
  let v = n - 1;

  const isPointInTri = (ax, az, bx, bz, cx, cz, px, pz) => {
    const c1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
    const c2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
    const c3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
    return c1 <= 1e-6 && c2 <= 1e-6 && c3 <= 1e-6;
  };

  while (V.length > 2) {
    if (count-- <= 0) {
      // Fallback fan for rare self-touching OSM footprints
      for (let i = 1; i + 1 < V.length; i++) tris.push(V[0], V[i], V[i + 1]);
      break;
    }
    const len = V.length;
    let u = v;
    if (u >= len) u = 0;
    v = u + 1;
    if (v >= len) v = 0;
    let w = v + 1;
    if (w >= len) w = 0;

    const ia = V[u], ib = V[v], ic = V[w];
    const [ax, az] = pts[ia];
    const [bx, bz] = pts[ib];
    const [cx, cz] = pts[ic];

    // Convex corner in signedArea2 < 0 winding has cross <= 0
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross > -1e-7) continue;

    let ear = true;
    for (let p = 0; p < len; p++) {
      if (p === u || p === v || p === w) continue;
      const [px, pz] = pts[V[p]];
      if (isPointInTri(ax, az, bx, bz, cx, cz, px, pz)) {
        ear = false;
        break;
      }
    }
    if (!ear) continue;

    tris.push(ia, ib, ic);
    V.splice(v, 1);
    count = 2 * V.length;
  }
  return tris;
}

function safeMergeGeometries(THREE, geos) {
  if (!geos || geos.length === 0) return null;
  try {
    const m = mergeGeometries(geos, false);
    if (m && m.attributes && m.attributes.position) return m;
  } catch (_) {
    // Fallback below
  }
  let totalVerts = 0;
  for (const g of geos) {
    const pos = g && g.attributes && g.attributes.position;
    if (pos) totalVerts += pos.count || (pos.array ? pos.array.length / 3 : 0);
  }
  const outPos = new Float32Array(Math.max(3, totalVerts * 3));
  const outNor = new Float32Array(Math.max(3, totalVerts * 3));
  let offset = 0;
  for (const g of geos) {
    const pos = g && g.attributes && g.attributes.position;
    if (!pos || !pos.array) continue;
    const nor = g.attributes.normal;
    if (g.index && g.index.array) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) {
        const k = idx[i] * 3;
        if (offset + 3 > outPos.length) break;
        outPos[offset] = pos.array[k];
        outPos[offset + 1] = pos.array[k + 1];
        outPos[offset + 2] = pos.array[k + 2];
        if (nor && nor.array) {
          outNor[offset] = nor.array[k];
          outNor[offset + 1] = nor.array[k + 1];
          outNor[offset + 2] = nor.array[k + 2];
        } else {
          outNor[offset + 1] = 1;
        }
        offset += 3;
      }
    } else {
      const len = Math.min(pos.array.length, outPos.length - offset);
      outPos.set(pos.array.subarray(0, len), offset);
      if (nor && nor.array) outNor.set(nor.array.subarray(0, len), offset);
      offset += len;
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(outNor, 3));
  return merged;
}

function buildFlatPolygonsGeometry(THREE, polys) {
  if (!polys || !polys.length) return null;
  const shapeGeos = [];
  for (const poly of polys) {
    if (!poly.p || poly.p.length < 6) continue;
    try {
      const s = new THREE.Shape();
      for (let i = 0; i < poly.p.length; i += 2) {
        const x = poly.p[i] * 0.1;
        const y = poly.p[i + 1] * 0.1;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      const g = new THREE.ShapeGeometry(s);
      if (g.attributes && g.attributes.position && g.attributes.position.count > 0) {
        g.rotateX(-Math.PI / 2);
        shapeGeos.push(g);
      }
    } catch (_) {
      // Skip degenerate shapes
    }
  }
  if (shapeGeos.length > 0) {
    const merged = safeMergeGeometries(THREE, shapeGeos);
    for (const g of shapeGeos) if (typeof g.dispose === 'function') g.dispose();
    if (merged) return merged;
  }

  // Pure-JS fallback for lightweight headless THREE mocks without ShapeGeometry triangulation
  const positions = [];
  const normals = [];
  for (const poly of polys) {
    if (!poly.p || poly.p.length < 6) continue;
    let pts = extractWorldPolygon(poly.p);
    if (!pts) continue;
    if (pts.length > 96) {
      const step = Math.ceil(pts.length / 96);
      pts = pts.filter((_, idx) => idx % step === 0);
    }
    const tris = triangulateXZ(pts);
    for (let i = 0; i < tris.length; i++) {
      const [x, z] = pts[tris[i]];
      positions.push(x, 0, z);
      normals.push(0, 1, 0);
    }
  }
  if (!positions.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return g;
}

function buildRibbonGeometry(THREE, lines, defaultWidth, y) {
  const positions = [];
  const normals = [];
  const indices = [];
  const halfDefault = defaultWidth * 0.5;

  for (const line of lines || []) {
    if (!line.p || line.p.length < 4) continue;
    const pts = [];
    for (let i = 0; i < line.p.length; i += 2) {
      const wx = line.p[i] * 0.1;
      const wz = -line.p[i + 1] * 0.1;
      if (pts.length > 0) {
        const prev = pts[pts.length - 1];
        if (Math.hypot(wx - prev[0], wz - prev[1]) < 0.05) continue;
      }
      pts.push([wx, wz]);
    }
    if (pts.length < 2) continue;
    const halfW = line.w ? line.w * 0.5 : halfDefault;
    const base = positions.length / 3;

    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const curr = pts[i];
      const next = pts[Math.min(pts.length - 1, i + 1)];

      let d1x = i === 0 ? next[0] - prev[0] : curr[0] - prev[0];
      let d1z = i === 0 ? next[1] - prev[1] : curr[1] - prev[1];
      const l1 = Math.hypot(d1x, d1z) || 1;
      d1x /= l1; d1z /= l1;

      let d2x = i === pts.length - 1 ? next[0] - prev[0] : next[0] - curr[0];
      let d2z = i === pts.length - 1 ? next[1] - prev[1] : next[1] - curr[1];
      const l2 = Math.hypot(d2x, d2z) || 1;
      d2x /= l2; d2z /= l2;

      const n1x = -d1z, n1z = d1x;
      const n2x = -d2z, n2z = d2x;
      let nx = n1x + n2x, nz = n1z + n2z;
      const nl = Math.hypot(nx, nz);
      if (nl < 1e-5) { nx = n1x; nz = n1z; } else { nx /= nl; nz /= nl; }

      const dot = Math.max(0.45, nx * n1x + nz * n1z);
      const miter = Math.min(2.1, 1.0 / dot) * halfW;
      const ox = nx * miter, oz = nz * miter;

      positions.push(curr[0] + ox, y, curr[1] + oz, curr[0] - ox, y, curr[1] - oz);
      normals.push(0, 1, 0, 0, 1, 0);

      if (i > 0) {
        const a = base + (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (positions.length / 3 > 65535 && THREE.Uint32BufferAttribute) {
    g.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
  } else {
    g.setIndex(indices);
  }
  return g;
}

function fitFootprintBox(flatDecimeters) {
  const pts = [];
  for (let i = 0; i < flatDecimeters.length; i += 2) {
    pts.push([flatDecimeters[i] * 0.1, flatDecimeters[i + 1] * 0.1]);
  }
  const n = pts.length || 1;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= n; cy /= n;

  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - cx, dy = y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, y] of pts) {
    const u = (x - cx) * ca + (y - cy) * sa;
    const v = -(x - cx) * sa + (y - cy) * ca;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const u0 = (minU + maxU) * 0.5;
  const v0 = (minV + maxV) * 0.5;
  return {
    worldX: cx + u0 * ca - v0 * sa,
    worldZ: -(cy + u0 * sa + v0 * ca),
    ang,
    len: Math.max(4, maxU - minU),
    wid: Math.max(4, maxV - minV),
  };
}

// Pure Catmull-Rom spline evaluation (guarantees identical finite positions/tangents even in headless mocks)
function evalCatmullRomPoint(pts, t) {
  const n = pts.length - 1;
  if (n <= 0) return [pts[0][0], pts[0][1], pts[0][2]];
  const clamped = clamp(t, 0, 1);
  const f = clamped * n;
  const i = Math.min(n - 1, Math.max(0, Math.floor(f)));
  const s = f - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const s2 = s * s, s3 = s2 * s;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const v0 = (p2[k] - p0[k]) * 0.5;
    const v1 = (p3[k] - p1[k]) * 0.5;
    out[k] =
      (2 * p1[k] - 2 * p2[k] + v0 + v1) * s3 +
      (-3 * p1[k] + 3 * p2[k] - 2 * v0 - v1) * s2 +
      v0 * s +
      p1[k];
  }
  return out;
}

function makeGlowSpriteTexture(THREE, innerRgba, midRgba) {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot(x - c, y - c) / c);
      const falloff = Math.pow(1 - r, 2.2);
      const core = Math.pow(1 - r, 5.5);
      const idx = (y * size + x) * 4;
      data[idx] = Math.round(clamp(midRgba[0] * falloff + innerRgba[0] * core, 0, 255));
      data[idx + 1] = Math.round(clamp(midRgba[1] * falloff + innerRgba[1] * core, 0, 255));
      data[idx + 2] = Math.round(clamp(midRgba[2] * falloff + innerRgba[2] * core, 0, 255));
      data[idx + 3] = Math.round(clamp(255 * falloff, 0, 255));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export async function createPirateWorld({ THREE: InjectedTHREE, scene, onProgress } = {}) {
  const THREE = InjectedTHREE || DefaultTHREE;
  const report = (pct, label) => {
    if (typeof onProgress === 'function') {
      try { onProgress(pct, label); } catch (_) { /* ignore UI progress hook errors */ }
    }
  };

  report(0.08, 'Tuning 107.7 FM — Loading Mountain View OSM…');
  const bundle = await loadJsonAsset('./assets/mountain-view-map.json?v=3', './assets/mountain-view-map.json');
  const bounds = (bundle.bounds || [-36260, -45641, 34491, 54547]).map((v) => v * 0.1);

  const group = new THREE.Group();
  group.name = 'pirate-frequency-world';
  if (scene && typeof scene.add === 'function') {
    scene.add(group);
    if (!scene.fog) {
      scene.fog = new THREE.Fog(0x180c32, 1150, 8600);
    }
  }

  // ------------------------------------------------------------------
  // 1. 2D Spatial Hash Collision Grid (cellSize = 32m) & Rooftop Access
  // ------------------------------------------------------------------
  report(0.22, 'Indexing rooftops & collision grid…');
  const spatialCells = new Map();
  const solidBuildings = [];
  const cellKey = (gx, gz) => `${gx}:${gz}`;

  for (let idx = 0; idx < bundle.buildings.length; idx++) {
    const b = bundle.buildings[idx];
    if (!b.p || b.p.length < 6) continue;
    const pts = extractWorldPolygon(b.p);
    if (!pts) continue;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const n = pts.length;
    const edgeNx = new Float32Array(n);
    const edgeNz = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % n];
      if (x0 < minX) minX = x0;
      if (x0 > maxX) maxX = x0;
      if (z0 < minZ) minZ = z0;
      if (z0 > maxZ) maxZ = z0;
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      // With signedArea2 < 0 winding, outward horizontal normal is (-dz/len, dx/len)
      edgeNx[i] = -dz / len;
      edgeNz[i] = dx / len;
    }

    const rec = {
      id: idx,
      pts,
      edgeNx,
      edgeNz,
      minX,
      maxX,
      minZ,
      maxZ,
      height: Math.max(2.5, Number(b.h) || 4.5),
      kind: b.k || '',
    };
    solidBuildings.push(rec);

    const gx0 = Math.floor(minX / CELL_SIZE);
    const gx1 = Math.floor(maxX / CELL_SIZE);
    const gz0 = Math.floor(minZ / CELL_SIZE);
    const gz1 = Math.floor(maxZ / CELL_SIZE);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const k = cellKey(gx, gz);
        let bucket = spatialCells.get(k);
        if (!bucket) {
          bucket = [];
          spatialCells.set(k, bucket);
        }
        bucket.push(rec);
      }
    }
  }

  function pointInBuilding(px, pz, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], zi = pts[i][1];
      const xj = pts[j][0], zj = pts[j][1];
      if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function getMaxBuildingHeightNear(px, pz, margin = 2.5) {
    const gx0 = Math.floor((px - margin) / CELL_SIZE);
    const gx1 = Math.floor((px + margin) / CELL_SIZE);
    const gz0 = Math.floor((pz - margin) / CELL_SIZE);
    const gz1 = Math.floor((pz + margin) / CELL_SIZE);
    let maxH = 0;
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const bucket = spatialCells.get(cellKey(gx, gz));
        if (!bucket) continue;
        for (let bIdx = 0; bIdx < bucket.length; bIdx++) {
          const b = bucket[bIdx];
          if (b.height <= maxH) continue;
          if (px < b.minX - margin || px > b.maxX + margin || pz < b.minZ - margin || pz > b.maxZ + margin) continue;
          if (pointInBuilding(px, pz, b.pts)) {
            maxH = b.height;
            continue;
          }
          const pts = b.pts;
          for (let i = 0, n = pts.length; i < n; i++) {
            const x0 = pts[i][0], z0 = pts[i][1];
            const x1 = pts[(i + 1) % n][0], z1 = pts[(i + 1) % n][1];
            const ux = x1 - x0, uz = z1 - z0;
            const l2 = ux * ux + uz * uz;
            const t = l2 > 0 ? clamp(((px - x0) * ux + (pz - z0) * uz) / l2, 0, 1) : 0;
            const d = Math.hypot(px - (x0 + ux * t), pz - (z0 + uz * t));
            if (d <= margin) {
              maxH = b.height;
              break;
            }
          }
        }
      }
    }
    return maxH;
  }

  function getGroundHeight(x, z, currentY) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    let groundY = 0;
    const hasCurrentY = Number.isFinite(currentY);

    if (hasCurrentY) {
      // Pirate Mast elevated sky-deck landing pad (connects to rail-rooftop-hope-skywire)
      if (
        currentY >= MAST_HUB.deckY - 0.45 &&
        Math.abs(x - MAST_HUB.x) <= MAST_HUB.deckHalf &&
        Math.abs(z - MAST_HUB.z) <= MAST_HUB.deckHalf
      ) {
        groundY = Math.max(groundY, MAST_HUB.deckY);
      }

      const bucket = spatialCells.get(cellKey(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)));
      if (bucket) {
        for (let i = 0; i < bucket.length; i++) {
          const b = bucket[i];
          if (b.height <= groundY) continue;
          if (currentY < b.height - 0.4) continue;
          if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
          if (pointInBuilding(x, z, b.pts)) {
            groundY = b.height;
          }
        }
      }
    }
    return groundY;
  }

  const visitedStamp = new Int32Array(solidBuildings.length);
  let queryToken = 1;

  function resolveHorizontalCollision(pos, radius = 0.9, playerY) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
      return { hit: false, normalX: 0, normalZ: 0, buildingHeight: 0 };
    }
    const r = Number.isFinite(radius) && radius > 0 ? radius : 0.9;
    const py = Number.isFinite(playerY) ? playerY : (Number.isFinite(pos.y) ? pos.y : 0);

    let hit = false;
    let outNx = 0;
    let outNz = 1;
    let hitHeight = 0;

    for (let pass = 0; pass < 3; pass++) {
      queryToken = (queryToken + 1) | 0;
      if (queryToken <= 0) {
        visitedStamp.fill(0);
        queryToken = 1;
      }

      const gx0 = Math.floor((pos.x - r) / CELL_SIZE);
      const gx1 = Math.floor((pos.x + r) / CELL_SIZE);
      const gz0 = Math.floor((pos.z - r) / CELL_SIZE);
      const gz1 = Math.floor((pos.z + r) / CELL_SIZE);

      let passHit = false;
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const bucket = spatialCells.get(cellKey(gx, gz));
          if (!bucket) continue;

          for (let bIdx = 0; bIdx < bucket.length; bIdx++) {
            const b = bucket[bIdx];
            if (visitedStamp[b.id] === queryToken) continue;
            visitedStamp[b.id] = queryToken;

            // Rooftop rule: if playerY >= bldg.height - 0.4, player rides freely atop roof
            if (py >= b.height - 0.4) continue;
            if (pos.x < b.minX - r || pos.x > b.maxX + r || pos.z < b.minZ - r || pos.z > b.maxZ + r) continue;

            const pts = b.pts;
            const n = pts.length;
            let bestDistSq = Infinity;
            let bestCx = 0, bestCz = 0, bestEdge = 0;

            for (let i = 0; i < n; i++) {
              const x0 = pts[i][0], z0 = pts[i][1];
              const x1 = pts[(i + 1) % n][0], z1 = pts[(i + 1) % n][1];
              const ux = x1 - x0, uz = z1 - z0;
              const l2 = ux * ux + uz * uz;
              const t = l2 > 0 ? clamp(((pos.x - x0) * ux + (pos.z - z0) * uz) / l2, 0, 1) : 0;
              const cx = x0 + ux * t;
              const cz = z0 + uz * t;
              const dx = pos.x - cx;
              const dz = pos.z - cz;
              const d2 = dx * dx + dz * dz;
              if (d2 < bestDistSq) {
                bestDistSq = d2;
                bestCx = cx;
                bestCz = cz;
                bestEdge = i;
              }
            }

            const inside = pointInBuilding(pos.x, pos.z, pts);
            if (!inside && bestDistSq >= r * r) continue;

            const dist = Math.sqrt(bestDistSq);
            let nx = b.edgeNx[bestEdge];
            let nz = b.edgeNz[bestEdge];

            if (!inside) {
              if (dist > 1e-5) {
                nx = (pos.x - bestCx) / dist;
                nz = (pos.z - bestCz) / dist;
              }
              const push = r - dist + 0.002;
              pos.x += nx * push;
              pos.z += nz * push;
            } else {
              if (dist > 1e-5) {
                nx = (bestCx - pos.x) / dist;
                nz = (bestCz - pos.z) / dist;
              }
              pos.x = bestCx + nx * (r + 0.004);
              pos.z = bestCz + nz * (r + 0.004);
            }

            const nl = Math.hypot(nx, nz) || 1;
            outNx = nx / nl;
            outNz = nz / nl;
            hitHeight = Math.max(hitHeight, b.height);
            hit = true;
            passHit = true;
          }
        }
      }
      if (!passHit) break;
    }

    return {
      hit,
      normalX: hit ? outNx : 0,
      normalZ: hit ? outNz : 0,
      buildingHeight: hit ? hitHeight : 0,
    };
  }

  // ------------------------------------------------------------------
  // 2. Sky Dome, Atomic-Dusk Lighting, Horizon Mountains & Stars
  // ------------------------------------------------------------------
  report(0.35, 'Igniting atomic-dusk sky & horizon…');
  const hemiLight = new THREE.HemisphereLight(0x745ce6, 0x1a0d2e, 1.5);
  const sunsetDir = new THREE.Vector3(-0.76, 0.34, -0.55).normalize();
  const sunsetLight = new THREE.DirectionalLight(0xff8a47, 1.75);
  sunsetLight.position.copy(sunsetDir).multiplyScalar(1800);
  const bayRimLight = new THREE.DirectionalLight(0x00e5ff, 0.62);
  bayRimLight.position.set(1200, 650, 900);
  group.add(hemiLight, sunsetLight, bayRimLight);

  const skyUniforms = {
    uTop: { value: new THREE.Color('#08041a') },
    uMid: { value: new THREE.Color('#2c1159') },
    uBand: { value: new THREE.Color('#8e1d68') },
    uHorizon: { value: new THREE.Color('#ff6b1a') },
    uSunDir: { value: sunsetDir.clone() },
    uTime: { value: 0 },
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(24000, 40, 24),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop, uMid, uBand, uHorizon, uSunDir;
        uniform float uTime;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.08, 1.0);
          float t1 = smoothstep(-0.04, 0.11, h);
          float t2 = smoothstep(0.09, 0.34, h);
          float t3 = smoothstep(0.28, 0.85, h);
          vec3 col = mix(uHorizon, uBand, t1);
          col = mix(col, uMid, t2);
          col = mix(col, uTop, t3);

          vec3 dir = normalize(vDir);
          vec3 sDir = normalize(uSunDir);
          float cosA = max(dot(dir, sDir), 0.0);
          // Segmented synth-zine sunset disc + warm dusk corona
          float disc = smoothstep(0.9962, 0.9970, cosA);
          float stripes = step(0.28, fract((dir.y - sDir.y) * 95.0 + uTime * 0.08));
          float cutMask = mix(1.0, stripes, smoothstep(sDir.y + 0.015, sDir.y - 0.055, dir.y));
          vec3 sunCol = mix(vec3(1.0, 0.32, 0.38), vec3(1.0, 0.92, 0.45), clamp((dir.y - sDir.y + 0.06) * 9.0, 0.0, 1.0));
          col += sunCol * disc * cutMask * 1.65;
          col += vec3(1.0, 0.48, 0.22) * pow(cosA, 14.0) * 0.38;
          col += vec3(1.0, 0.78, 0.35) * pow(cosA, 140.0) * 0.45;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  skyDome.frustumCulled = false;
  group.add(skyDome);

  // Twinkling night stars
  {
    const rnd = mulberry32(707);
    const starCount = 1500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(1 - rnd() * 0.82);
      const r = 21500;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 900;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xe8ecff,
      size: 2.3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    group.add(stars);
  }

  // Distant Santa Cruz Mountains & Diablo Range silhouette ring
  {
    const segs = 96;
    const radius = 10500;
    const mPos = [];
    const mIdx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Higher ridges to the SW/W (Santa Cruz Mountains) and E/NE (Diablo Range), low across N Bay
      const westRidge = Math.max(0, -ca * 0.6 + sa * 0.8);
      const eastRidge = Math.max(0, ca * 0.85 + sa * 0.25);
      const ridgeNoise =
        Math.sin(a * 7.0 + 0.4) * 0.28 +
        Math.sin(a * 15.0 + 1.7) * 0.16 +
        Math.cos(a * 23.0) * 0.08;
      const h = 45 + (westRidge * 640 + eastRidge * 460) * (0.68 + ridgeNoise);
      const x = ca * radius, z = sa * radius;
      mPos.push(x, -40, z, x, h, z);
      if (i > 0) {
        const b = (i - 1) * 2;
        mIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const ridgeGeo = new THREE.BufferGeometry();
    ridgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(mPos, 3));
    ridgeGeo.setIndex(mIdx);
    ridgeGeo.computeVertexNormals();
    const ridgeMesh = new THREE.Mesh(
      ridgeGeo,
      new THREE.MeshBasicMaterial({ color: 0x16092c, side: THREE.DoubleSide, fog: false })
    );
    ridgeMesh.frustumCulled = false;
    group.add(ridgeMesh);
  }

  // ------------------------------------------------------------------
  // 3. Ground, Parks, Bay Water, Roads, Creeks & Caltrain Tracks
  // ------------------------------------------------------------------
  report(0.48, 'Paving neon-dusk streets & creeks…');
  const flatLayerMat = (hex, order, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.92,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -order * 0.05,
      polygonOffsetUnits: -order * 3,
      ...extra,
    });

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(48000, 48000),
    flatLayerMat('#130d26', 0)
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.set((bounds[0] + bounds[2]) * 0.5, -0.35, -(bounds[1] + bounds[3]) * 0.5);
  group.add(groundPlane);

  const addPolygonLayer = (polys, mat, y) => {
    const g = buildFlatPolygonsGeometry(THREE, polys);
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.position.y = y;
    group.add(m);
    return m;
  };

  addPolygonLayer(bundle.wetland, flatLayerMat('#132332', 1), 0.03);
  addPolygonLayer(bundle.parks, flatLayerMat('#142a2d', 2), 0.06);
  if (bundle.aero) {
    addPolygonLayer(bundle.aero.aprons, flatLayerMat('#1b1933', 3), 0.08);
  }

  // Shimmering neon-dusk Bay & Shoreline Lake water
  let waterUniforms = null;
  {
    const waterGeo = buildFlatPolygonsGeometry(THREE, bundle.water);
    if (waterGeo) {
      waterUniforms = {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color('#0c1738') },
        uShallow: { value: new THREE.Color('#193869') },
        uGlow: { value: new THREE.Color('#ff6b3d') },
      };
      const waterMat = new THREE.ShaderMaterial({
        uniforms: waterUniforms,
        polygonOffset: true,
        polygonOffsetFactor: -0.15,
        polygonOffsetUnits: -8,
        vertexShader: `
          varying vec3 vWPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uDeep, uShallow, uGlow;
          varying vec3 vWPos;
          void main() {
            vec2 p = vWPos.xz;
            float wave = sin(p.x * 0.09 + uTime * 1.4) * 0.5 + cos(p.y * 0.08 - uTime * 1.1) * 0.5;
            vec3 col = mix(uDeep, uShallow, 0.45 + 0.35 * wave);
            float shimmer = smoothstep(0.72, 0.98, sin(p.x * 0.16 - p.y * 0.12 + uTime * 2.2));
            col += uGlow * shimmer * 0.18;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      const waterMesh = new THREE.Mesh(waterGeo, waterMat);
      waterMesh.position.y = 0.09;
      group.add(waterMesh);
    }
  }

  // Streets & arterials with bold graphic curb casings
  const ROAD_W = { mw: 13, mwl: 8, tr: 12, trl: 7, pr: 13, prl: 7, se: 10.5, sel: 6, te: 8.5, tel: 6, re: 6.5, pe: 4.0, cy: 2.4 };
  const ROAD_ORDER = ['cy', 'pe', 're', 'tel', 'te', 'sel', 'se', 'prl', 'pr', 'trl', 'tr', 'mwl', 'mw'];
  const ROAD_PALETTE = {
    re: ['#1f1c38', '#2d2850'],
    te: ['#221f3d', '#352e5e'],
    se: ['#252144', '#3d346b'],
    pr: ['#29234b', '#483b7a'],
    tr: ['#2c2450', '#543f82'],
    mw: ['#302657', '#63458a'],
    pe: ['#232042', '#3a3468'],
    cy: ['#193142', '#193142'],
  };
  const roadsByClass = {};
  for (const r of bundle.roads || []) {
    (roadsByClass[r.c] ||= []).push(r);
  }
  ROAD_ORDER.forEach((c, idx) => {
    const lines = roadsByClass[c];
    if (!lines || !lines.length) return;
    const palKey = ROAD_PALETTE[c] ? c : c.replace(/l$/, '');
    const [fillHex, caseHex] = ROAD_PALETTE[palKey] || ROAD_PALETTE.re;
    const w = ROAD_W[c] || 7;
    const y = 0.12 + idx * 0.032;
    if (c !== 'cy') {
      group.add(new THREE.Mesh(buildRibbonGeometry(THREE, lines, w + 1.8, y), flatLayerMat(caseHex, 4 + idx * 2)));
    }
    group.add(new THREE.Mesh(buildRibbonGeometry(THREE, lines, w, y + 0.015), flatLayerMat(fillHex, 5 + idx * 2, { roughness: 0.78 })));
  });

  if (bundle.streams && bundle.streams.length) {
    group.add(new THREE.Mesh(buildRibbonGeometry(THREE, bundle.streams, 3.6, 0.08), flatLayerMat('#113a62', 3, { emissive: 0x072540, emissiveIntensity: 0.45 })));
  }
  if (bundle.rail && bundle.rail.length) {
    group.add(new THREE.Mesh(buildRibbonGeometry(THREE, bundle.rail, 3.6, 0.58), flatLayerMat('#3a335c', 30, { metalness: 0.4, roughness: 0.5 })));
  }
  if (bundle.aero) {
    if (bundle.aero.taxiways && bundle.aero.taxiways.length) {
      group.add(new THREE.Mesh(buildRibbonGeometry(THREE, bundle.aero.taxiways, 22, 0.10), flatLayerMat('#201d38', 3)));
    }
    if (bundle.aero.runways && bundle.aero.runways.length) {
      const rw = bundle.aero.runways.map((r) => ({ ...r, w: (r.w || 6) * 10 }));
      group.add(new THREE.Mesh(buildRibbonGeometry(THREE, rw, 60, 0.11), flatLayerMat('#262342', 4)));
    }
  }

  // Arterial glowing center dashes & warm-amber/cyan streetlamp halos
  {
    const dashPositions = [];
    for (const r of bundle.roads || []) {
      if (!['pr', 'se', 'te', 'tr', 'mw'].includes(r.c)) continue;
      const p = r.p;
      let carry = 4;
      for (let i = 2; i < p.length; i += 2) {
        const x0 = p[i - 2] * 0.1, z0 = -p[i - 1] * 0.1;
        const x1 = p[i] * 0.1, z1 = -p[i + 1] * 0.1;
        // Focus detail within playable & visible city radius
        if (Math.abs(x0) > 2200 || z0 < -3700 || z0 > 1300) continue;
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 1) continue;
        for (; carry < len; carry += 11) {
          const t = carry / len;
          dashPositions.push(x0 + dx * t, 0.58, z0 + dz * t, Math.atan2(-dz, dx));
        }
        carry -= len;
      }
    }
    const dashCount = Math.min(12000, Math.floor(dashPositions.length / 4));
    if (dashCount > 0) {
      const dashGeo = new THREE.BoxGeometry(2.8, 0.04, 0.18);
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const sc = new THREE.Vector3(1, 1, 1);
      const pv = new THREE.Vector3();
      for (let i = 0; i < dashCount; i++) {
        pv.set(dashPositions[i * 4], dashPositions[i * 4 + 1], dashPositions[i * 4 + 2]);
        q.setFromAxisAngle(up, dashPositions[i * 4 + 3]);
        m4.compose(pv, q, sc);
        dashMesh.setMatrixAt(i, m4);
      }
      group.add(dashMesh);
    }

    // Streetlight glow sprites along major streets
    const lampPts = [];
    const rndL = mulberry32(404);
    for (const r of bundle.roads || []) {
      if (!['pr', 'se', 'te', 'pe'].includes(r.c)) continue;
      const p = r.p;
      let d = 12;
      for (let i = 2; i < p.length; i += 2) {
        const x0 = p[i - 2] * 0.1, z0 = -p[i - 1] * 0.1;
        const x1 = p[i] * 0.1, z1 = -p[i + 1] * 0.1;
        if (Math.abs(x0) > 2100 || z0 < -3600 || z0 > 1200) continue;
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 1) continue;
        const nx = -dz / len, nz = dx / len;
        for (; d < len; d += 44) {
          const t = d / len;
          const side = rndL() > 0.5 ? 1 : -1;
          lampPts.push(x0 + dx * t + nx * 8.5 * side, 7.2, z0 + dz * t + nz * 8.5 * side);
        }
        d -= len;
      }
    }
    if (lampPts.length > 0) {
      const lampGeo = new THREE.BufferGeometry();
      lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPts, 3));
      const lampMat = new THREE.PointsMaterial({
        map: makeGlowSpriteTexture(THREE, [255, 245, 210], [255, 145, 55]),
        color: 0xffcf86,
        size: 13,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const lampPoints = new THREE.Points(lampGeo, lampMat);
      lampPoints.frustumCulled = false;
      group.add(lampPoints);
    }
  }

  // ------------------------------------------------------------------
  // 4. Merged Cel-Dusk OSM Buildings + Rooftop Neon Trim + Landmarks
  // ------------------------------------------------------------------
  report(0.64, 'Raising 8,011 neon-lit Mountain View buildings…');
  const buildingUniforms = {
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uCombo: { value: 0 },
  };

  {
    const WALL_PALETTE = [
      new THREE.Color('#221942'),
      new THREE.Color('#1c1f44'),
      new THREE.Color('#2b1b4a'),
      new THREE.Color('#1f173b'),
      new THREE.Color('#28214f'),
      new THREE.Color('#311c4d'),
    ];
    const ROOF_COLOR = new THREE.Color('#2d2556');
    const TRIM_COLORS = [
      new THREE.Color('#00f0ff'),
      new THREE.Color('#ff6b1a'),
      new THREE.Color('#ffe042'),
      new THREE.Color('#ff2e88'),
    ];

    const posArr = [];
    const norArr = [];
    const uvArr = [];
    const colArr = [];
    const seedArr = [];
    const bhArr = [];

    const trimPos = [];
    const trimCol = [];

    const rndB = mulberry32(1999);
    const landmarkGroup = new THREE.Group();
    landmarkGroup.name = 'mountain-view-landmarks';

    const buildLandmark = (b) => {
      const box = fitFootprintBox(b.p);
      const H = Math.max(8, Number(b.h) || 20);

      if (b.k === 'hangar1' || b.k === 'hangar') {
        const silver = b.k === 'hangar1';
        const W = box.wid, L = box.len;
        const archSegs = 24;
        const p = [], idx = [];
        for (let zSide = 0; zSide <= 1; zSide++) {
          const xLocal = (zSide - 0.5) * L;
          for (let i = 0; i <= archSegs; i++) {
            const u = -1 + (2 * i) / archSegs;
            const y = H * Math.pow(Math.max(0, 1 - u * u), silver ? 0.62 : 0.5);
            p.push(xLocal, y, u * W * 0.5);
          }
        }
        const stride = archSegs + 1;
        for (let i = 0; i < archSegs; i++) {
          const a = i, c = i + stride;
          idx.push(a, a + 1, c, a + 1, c + 1, c);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(
          g,
          new THREE.MeshStandardMaterial({
            color: silver ? 0x3b456e : 0x2f2948,
            emissive: silver ? 0x0b1c3d : 0x120a24,
            emissiveIntensity: 0.55,
            roughness: 0.42,
            metalness: 0.55,
            side: THREE.DoubleSide,
          })
        );
        m.position.set(box.worldX, 0, box.worldZ);
        m.rotation.y = box.ang;
        landmarkGroup.add(m);
        return;
      }

      if (b.k === 'amphitheatre') {
        // Shoreline Amphitheatre iconic glowing twin-peaked tensile tent + stage uplights
        const a = box.len * 0.5, c = box.wid * 0.5;
        const nr = 18, nt = 48;
        const p = [], idx = [];
        const peak = (u, v, px) => Math.exp(-((u - px) * (u - px) + v * v) / 0.075);
        for (let i = 0; i <= nr; i++) {
          const r = i / nr;
          for (let j = 0; j <= nt; j++) {
            const th = (2 * Math.PI * j) / nt;
            const u = r * Math.cos(th), v = r * Math.sin(th);
            const edge = Math.pow(Math.max(0, 1 - r * r), 0.45);
            const h = 5.5 + (H - 5.5) * Math.max(peak(u, v, -0.42), peak(u, v, 0.42)) * (0.35 + 0.65 * edge) + 3.8 * edge;
            p.push(u * a, h, v * c);
          }
        }
        for (let i = 0; i < nr; i++) {
          for (let j = 0; j < nt; j++) {
            const q = i * (nt + 1) + j;
            idx.push(q, q + nt + 1, q + 1, q + 1, q + nt + 1, q + nt + 2);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const tent = new THREE.Mesh(
          g,
          new THREE.MeshStandardMaterial({
            color: 0xeae6ff,
            emissive: 0x5c2d91,
            emissiveIntensity: 0.72,
            roughness: 0.45,
            side: THREE.DoubleSide,
          })
        );
        tent.position.set(box.worldX, 0, box.worldZ);
        tent.rotation.y = box.ang;
        const mastMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
        for (const px of [-0.42, 0.42]) {
          const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, H + 12, 8), mastMat);
          spire.position.set(px * a, (H + 12) * 0.5, 0);
          tent.add(spire);
        }
        landmarkGroup.add(tent);
        return;
      }

      if (b.k === 'canopy') {
        // Gradient Canopy / Bay View dragonscale solar pavilion
        const dome = new THREE.Mesh(
          new THREE.CylinderGeometry(box.wid * 0.24, box.len * 0.48, H, 16, 1, false),
          new THREE.MeshStandardMaterial({
            color: 0x283666,
            emissive: 0x0e2a47,
            emissiveIntensity: 0.65,
            roughness: 0.35,
            metalness: 0.45,
          })
        );
        dome.position.set(box.worldX, H * 0.5, box.worldZ);
        dome.rotation.y = box.ang;
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(box.len * 0.42, 0.45, 6, 32),
          new THREE.MeshBasicMaterial({ color: 0x00f0ff })
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = -H * 0.18;
        dome.add(rim);
        landmarkGroup.add(dome);
      }
    };

    for (let bIdx = 0; bIdx < bundle.buildings.length; bIdx++) {
      const b = bundle.buildings[bIdx];
      const k = b.k || '';
      if (k === 'hangar1' || k === 'hangar' || k === 'amphitheatre' || k === 'canopy') {
        buildLandmark(b);
        continue;
      }
      const pts = extractWorldPolygon(b.p);
      if (!pts) continue;

      const h = Math.max(2.6, Number(b.h) || 4.5);
      const seed = rndB();
      const wallTint = WALL_PALETTE[Math.floor(rndB() * WALL_PALETTE.length)];
      const n = pts.length;

      // Extrude walls with exact outward normals & meter-scaled UVs
      let perim = 0;
      for (let i = 0; i < n; i++) {
        const [x0, z0] = pts[i];
        const [x1, z1] = pts[(i + 1) % n];
        const dx = x1 - x0, dz = z1 - z0;
        const segLen = Math.hypot(dx, dz);
        if (segLen < 0.05) continue;
        const nx = -dz / segLen, nz = dx / segLen;
        const u0 = perim, u1 = perim + segLen;
        perim = u1;

        // Two CCW triangles: (V00, V10, V11) & (V00, V11, V01)
        posArr.push(
          x0, 0, z0, x1, 0, z1, x1, h, z1,
          x0, 0, z0, x1, h, z1, x0, h, z0
        );
        for (let v = 0; v < 6; v++) {
          norArr.push(nx, 0, nz);
          colArr.push(wallTint.r, wallTint.g, wallTint.b);
          seedArr.push(seed);
          bhArr.push(h);
        }
        uvArr.push(
          u0, 0, u1, 0, u1, h,
          u0, 0, u1, h, u0, h
        );
      }

      // Roof cap
      const roofTris = triangulateXZ(pts);
      for (let i = 0; i < roofTris.length; i++) {
        const [rx, rz] = pts[roofTris[i]];
        posArr.push(rx, h, rz);
        norArr.push(0, 1, 0);
        uvArr.push(rx * 0.1, rz * 0.1);
        colArr.push(ROOF_COLOR.r, ROOF_COLOR.g, ROOF_COLOR.b);
        seedArr.push(seed);
        bhArr.push(h);
      }

      // Crisp rooftop neon trim on taller landmarks (h >= 8.5m) & corridor roofs (h >= 6.2m)
      const px0 = pts[0][0], pz0 = pts[0][1];
      const inCorridor = px0 > -650 && px0 < 750 && pz0 > -3250 && pz0 < 820;
      if (h >= 8.5 || (inCorridor && h >= 6.2 && seed > 0.35)) {
        const tc = TRIM_COLORS[Math.floor(seed * 17) % TRIM_COLORS.length];
        const trimH = 0.28;
        const yBot = h - 0.05, yTop = h + trimH;
        for (let i = 0; i < n; i++) {
          const [x0, z0] = pts[i];
          const [x1, z1] = pts[(i + 1) % n];
          trimPos.push(
            x0, yBot, z0, x1, yBot, z1, x1, yTop, z1,
            x0, yBot, z0, x1, yTop, z1, x0, yTop, z0
          );
          for (let v = 0; v < 6; v++) trimCol.push(tc.r, tc.g, tc.b);
        }
      }
    }

    const bldgGeo = new THREE.BufferGeometry();
    bldgGeo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    bldgGeo.setAttribute('normal', new THREE.Float32BufferAttribute(norArr, 3));
    bldgGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
    bldgGeo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    bldgGeo.setAttribute('seed', new THREE.Float32BufferAttribute(seedArr, 1));
    bldgGeo.setAttribute('bh', new THREE.Float32BufferAttribute(bhArr, 1));

    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.12,
      vertexColors: true,
    });
    bldgMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = buildingUniforms.uTime;
      shader.uniforms.uBeat = buildingUniforms.uBeat;
      shader.uniforms.uCombo = buildingUniforms.uCombo;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float seed;
          attribute float bh;
          varying float vSeed;
          varying float vBh;
          varying vec3 vWPos;
          varying float vWallMask;
          varying vec2 vWallUv;`
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vSeed = seed;
          vBh = bh;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWallMask = 1.0 - smoothstep(0.35, 0.65, abs(objectNormal.y));
          vWallUv = uv;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uBeat;
          uniform float uCombo;
          varying float vSeed;
          varying float vBh;
          varying vec3 vWPos;
          varying float vWallMask;
          varying vec2 vWallUv;
          float hash21(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // Graphic ink ground-contact shadow & subtle cel band
          float groundAO = mix(0.55, 1.08, smoothstep(0.0, 7.5, vWPos.y));
          float roofRim = smoothstep(vBh - 0.9, vBh - 0.1, vWPos.y) * 0.22;
          diffuseColor.rgb *= mix(1.0, groundAO + roofRim, vWallMask);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          if (vWallMask > 0.5 && vBh > 3.6) {
            vec2 cell = vec2(floor(vWallUv.x / 2.8), floor(vWPos.y / 3.2));
            vec2 f = vec2(fract(vWallUv.x / 2.8), fract(vWPos.y / 3.2));
            float win = step(0.24, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.76);
            win *= step(1.4, vWPos.y) * step(vWPos.y, vBh - 0.55);
            float rnd = hash21(cell + vSeed * 19.7);
            float lit = step(0.46, rnd) * win;
            vec3 cGold = vec3(1.0, 0.82, 0.34);
            vec3 cCyan = vec3(0.0, 0.94, 1.0);
            vec3 cOrange = vec3(1.0, 0.42, 0.14);
            float pick = hash21(cell * 2.3 + vSeed * 7.1);
            vec3 winCol = pick < 0.58 ? cGold : (pick < 0.84 ? cCyan : cOrange);
            float eqPulse = 1.0 + uBeat * (0.22 + 0.25 * uCombo) * step(0.75, vSeed);
            totalEmissiveRadiance += winCol * lit * 1.45 * eqPulse;
          }`
        );
    };

    const bldgMesh = new THREE.Mesh(bldgGeo, bldgMat);
    group.add(bldgMesh);
    group.add(landmarkGroup);

    if (trimPos.length > 0) {
      const trimGeo = new THREE.BufferGeometry();
      trimGeo.setAttribute('position', new THREE.Float32BufferAttribute(trimPos, 3));
      trimGeo.setAttribute('color', new THREE.Float32BufferAttribute(trimCol, 3));
      const trimMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      group.add(new THREE.Mesh(trimGeo, trimMat));
    }
  }

  // Stylized boulevard palm & oak silhouettes (strictly clear of streets, zones & ramps)
  {
    const rndT = mulberry32(909);
    const palmSpots = [];
    for (const r of bundle.roads || []) {
      if (!['pr', 'se', 'pe'].includes(r.c)) continue;
      const p = r.p;
      for (let i = 2; i < p.length; i += 2) {
        const x0 = p[i - 2] * 0.1, z0 = -p[i - 1] * 0.1;
        const x1 = p[i] * 0.1, z1 = -p[i + 1] * 0.1;
        if (Math.abs(x0) > 1400 || z0 < -3300 || z0 > 900) continue;
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 18) continue;
        const nx = -dz / len, nz = dx / len;
        for (let d = 14; d < len; d += 38) {
          if (rndT() > 0.52) continue;
          const side = rndT() > 0.5 ? 1 : -1;
          const tx = x0 + (dx / len) * d + nx * 11.5 * side;
          const tz = z0 + (dz / len) * d + nz * 11.5 * side;
          if (getMaxBuildingHeightNear(tx, tz, 3.0) > 0) continue;
          if (Math.hypot(tx - SPAWN_POINT.x, tz - SPAWN_POINT.z) < 28) continue;
          palmSpots.push({ x: tx, z: tz, s: 0.85 + rndT() * 0.4, rot: rndT() * Math.PI * 2 });
          if (palmSpots.length >= 900) break;
        }
        if (palmSpots.length >= 900) break;
      }
      if (palmSpots.length >= 900) break;
    }

    if (palmSpots.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 8.5, 6);
      trunkGeo.translate(0, 4.25, 0);
      const crownGeo = new THREE.ConeGeometry(2.9, 2.6, 7);
      crownGeo.translate(0, 8.9, 0);
      const trunkMesh = new THREE.InstancedMesh(
        trunkGeo,
        new THREE.MeshStandardMaterial({ color: 0x2d1f3d, roughness: 0.9 }),
        palmSpots.length
      );
      const crownMesh = new THREE.InstancedMesh(
        crownGeo,
        new THREE.MeshStandardMaterial({ color: 0x1b4d52, emissive: 0x07262b, emissiveIntensity: 0.4, roughness: 0.8 }),
        palmSpots.length
      );
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      const pv = new THREE.Vector3(), sc = new THREE.Vector3();
      palmSpots.forEach((sp, i) => {
        pv.set(sp.x, 0, sp.z);
        q.setFromAxisAngle(up, sp.rot);
        sc.set(sp.s, sp.s, sp.s);
        m4.compose(pv, q, sc);
        trunkMesh.setMatrixAt(i, m4);
        crownMesh.setMatrixAt(i, m4);
      });
      group.add(trunkMesh, crownMesh);
    }
  }

  // ------------------------------------------------------------------
  // 5. Towering Pirate Radio Broadcast Mast (107.7 FM) + Expanding Rings
  // ------------------------------------------------------------------
  report(0.76, 'Erecting 107.7 FM Pirate Broadcast Mast…');
  const mastGroup = new THREE.Group();
  mastGroup.name = 'pirate-radio-mast';
  mastGroup.position.set(MAST_HUB.x, 0, MAST_HUB.z);
  group.add(mastGroup);

  const mastWaveRings = [];
  let mastBeaconOrb = null;
  let mastAntennaArray = null;
  {
    const H = MAST_HUB.height;
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x2a1e4a,
      emissive: 0x120829,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.7,
    });
    const orangeNeonMat = new THREE.MeshBasicMaterial({ color: 0xff6b1a });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const yellowNeonMat = new THREE.MeshBasicMaterial({ color: 0xffe042 });

    // 4 arched wide-stance legs (drive-through portal underneath!)
    const baseHalf = 10.5;
    const deckHalf = 4.2;
    const legGeo = new THREE.CylinderGeometry(0.42, 0.72, 1, 8);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) {
      const p0 = new THREE.Vector3(sx * baseHalf, 0, sz * baseHalf);
      const p1 = new THREE.Vector3(sx * deckHalf, MAST_HUB.deckY, sz * deckHalf);
      const dir = p1.clone().sub(p0);
      const len = dir.length();
      const leg = new THREE.Mesh(legGeo, steelMat);
      leg.position.copy(p0).add(p1).multiplyScalar(0.5);
      leg.scale.set(1, len, 1);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      mastGroup.add(leg);
    }

    // Elevated Broadcast Sky-Deck at y = 13m (rideable rooftop platform!)
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(MAST_HUB.deckHalf * 2, 0.9, MAST_HUB.deckHalf * 2),
      steelMat
    );
    deck.position.y = MAST_HUB.deckY - 0.45;
    const deckTrim = new THREE.Mesh(
      new THREE.BoxGeometry(MAST_HUB.deckHalf * 2 + 0.35, 0.28, MAST_HUB.deckHalf * 2 + 0.35),
      cyanNeonMat
    );
    deckTrim.position.y = MAST_HUB.deckY - 0.12;
    mastGroup.add(deck, deckTrim);

    // Upper tapered lattice spire from y = 13m to y = 158m
    const spireH = H - MAST_HUB.deckY;
    const coreSpire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 2.6, spireH, 8, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xff5a1f,
        emissive: 0x6e1b08,
        emissiveIntensity: 0.65,
        wireframe: true,
      })
    );
    coreSpire.position.y = MAST_HUB.deckY + spireH * 0.5;
    mastGroup.add(coreSpire);

    const innerCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.95, spireH, 8),
      steelMat
    );
    innerCore.position.y = MAST_HUB.deckY + spireH * 0.5;
    mastGroup.add(innerCore);

    // Alternating glowing neon broadcast collars up the mast
    for (let i = 0; i < 8; i++) {
      const frac = i / 7;
      const y = 24 + frac * (H - 34);
      const r = 2.8 * (1 - frac * 0.72) + 0.6;
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.2, 8, 24),
        i % 2 === 0 ? cyanNeonMat : (i % 4 === 1 ? orangeNeonMat : yellowNeonMat)
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = y;
      mastGroup.add(collar);
    }

    // Rotating Yagi directional antenna cross-arms near the summit
    mastAntennaArray = new THREE.Group();
    mastAntennaArray.position.y = H - 10;
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 0.22), yellowNeonMat);
      arm.rotation.y = (i * Math.PI) / 4;
      arm.position.y = (i % 2) * 2.4;
      mastAntennaArray.add(arm);
    }
    mastGroup.add(mastAntennaArray);

    // Apex glowing Pirate Radio Beacon Orb
    mastBeaconOrb = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    mastBeaconOrb.position.y = H;
    mastGroup.add(mastBeaconOrb);

    // 6 Expanding Neon Radio-Wave Rings pulsing into the night sky
    const ringColors = [0x00f0ff, 0xffe042, 0xff6b1a, 0x00f0ff, 0xff2e88, 0xffe042];
    for (let i = 0; i < 6; i++) {
      const rMat = new THREE.MeshBasicMaterial({
        color: ringColors[i],
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const rMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 8, 48), rMat);
      rMesh.rotation.x = Math.PI / 2;
      rMesh.position.y = H;
      mastGroup.add(rMesh);
      mastWaveRings.push({ mesh: rMesh, mat: rMat, phaseOffset: i / 6 });
    }
  }

  // ------------------------------------------------------------------
  // 6. 24 Grindable Neon Rails (CatmullRomCurve3) + Support Posts
  // ------------------------------------------------------------------
  report(0.86, 'Welding 24 HDR neon grind rails & 18 kicker ramps…');
  const railsGroup = new THREE.Group();
  railsGroup.name = 'grind-rails';
  group.add(railsGroup);

  const railCyanMat = new THREE.MeshStandardMaterial({
    color: 0x80f8ff,
    emissive: 0x00f0ff,
    emissiveIntensity: 2.35,
    roughness: 0.15,
    metalness: 0.2,
  });
  const railYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfff3a8,
    emissive: 0xffe042,
    emissiveIntensity: 2.25,
    roughness: 0.15,
    metalness: 0.2,
  });
  const railPostMat = new THREE.MeshStandardMaterial({
    color: 0x261d42,
    emissive: 0x0e0820,
    roughness: 0.55,
    metalness: 0.65,
  });

  const rails = [];
  const railById = new Map();
  const postInstances = [];

  for (let rIdx = 0; rIdx < RAIL_DEFS.length; rIdx++) {
    const def = RAIL_DEFS[rIdx];

    // Resample to 15 smooth control points & enforce vertical clearance over any intermediate building roof
    const densePts = [];
    const SAMPLES_CTRL = 14;
    for (let k = 0; k <= SAMPLES_CTRL; k++) {
      const u = k / SAMPLES_CTRL;
      const [px, py, pz] = evalCatmullRomPoint(def.points, u);
      let safeY = py;
      if (!def.rooftop && k > 0 && k < SAMPLES_CTRL) {
        const bh = getMaxBuildingHeightNear(px, pz, 2.8);
        if (bh > 0 && safeY < bh + 1.5) safeY = bh + 1.65;
      }
      densePts.push([px, safeY, pz]);
    }
    // 1-pass upward-only smoothing so lifted arches transition silkily
    for (let k = 1; k < SAMPLES_CTRL; k++) {
      const avgNeighborY = 0.5 * (densePts[k - 1][1] + densePts[k + 1][1]);
      if (avgNeighborY > densePts[k][1] + 0.5) {
        densePts[k][1] = 0.55 * densePts[k][1] + 0.45 * avgNeighborY;
      }
    }

    const vecPts = densePts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(vecPts, false, 'catmullrom', 0.5);

    // Precompute exact 128-segment arc-length lookup table (fast O(1) sampleRail & AABB-culled findNearestRail)
    const SEGMENTS = 128;
    const rawPts = new Array(SEGMENTS + 1);
    const cumLen = new Float64Array(SEGMENTS + 1);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      let pt = null;
      if (typeof curve.getPoint === 'function') {
        try {
          const cp = curve.getPoint(t);
          if (cp && Number.isFinite(cp.x) && Number.isFinite(cp.y) && Number.isFinite(cp.z)) {
            pt = [cp.x, cp.y, cp.z];
          }
        } catch (_) { /* fallback below */ }
      }
      if (!pt) pt = evalCatmullRomPoint(densePts, t);
      rawPts[i] = pt;
      if (pt[0] < minX) minX = pt[0];
      if (pt[0] > maxX) maxX = pt[0];
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
      if (pt[2] < minZ) minZ = pt[2];
      if (pt[2] > maxZ) maxZ = pt[2];
      if (i > 0) {
        const prev = rawPts[i - 1];
        cumLen[i] = cumLen[i - 1] + Math.hypot(pt[0] - prev[0], pt[1] - prev[1], pt[2] - prev[2]);
      }
    }
    const totalLength = Math.max(0.01, cumLen[SEGMENTS]);

    // Resample uniformly by arc-length u in [0, 1]
    const arcPts = new Float32Array((SEGMENTS + 1) * 3);
    const arcTans = new Float32Array((SEGMENTS + 1) * 3);
    let cursor = 0;
    for (let i = 0; i <= SEGMENTS; i++) {
      const targetS = (i / SEGMENTS) * totalLength;
      while (cursor < SEGMENTS - 1 && cumLen[cursor + 1] < targetS) cursor++;
      const s0 = cumLen[cursor], s1 = cumLen[cursor + 1];
      const alpha = s1 > s0 ? clamp((targetS - s0) / (s1 - s0), 0, 1) : 0;
      const p0 = rawPts[cursor], p1 = rawPts[cursor + 1];
      arcPts[i * 3] = p0[0] + (p1[0] - p0[0]) * alpha;
      arcPts[i * 3 + 1] = p0[1] + (p1[1] - p0[1]) * alpha;
      arcPts[i * 3 + 2] = p0[2] + (p1[2] - p0[2]) * alpha;
    }
    for (let i = 0; i <= SEGMENTS; i++) {
      const iPrev = Math.max(0, i - 1);
      const iNext = Math.min(SEGMENTS, i + 1);
      let tx = arcPts[iNext * 3] - arcPts[iPrev * 3];
      let ty = arcPts[iNext * 3 + 1] - arcPts[iPrev * 3 + 1];
      let tz = arcPts[iNext * 3 + 2] - arcPts[iPrev * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      arcTans[i * 3] = tx;
      arcTans[i * 3 + 1] = ty;
      arcTans[i * 3 + 2] = tz;
    }

    const evalAtU = (u) => {
      const cu = Number.isFinite(u) ? clamp(u, 0, 1) : 0;
      const f = cu * SEGMENTS;
      const idx = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(f)));
      const frac = f - idx;
      const i0 = idx * 3, i1 = (idx + 1) * 3;
      const px = arcPts[i0] + (arcPts[i1] - arcPts[i0]) * frac;
      const py = arcPts[i0 + 1] + (arcPts[i1 + 1] - arcPts[i0 + 1]) * frac;
      const pz = arcPts[i0 + 2] + (arcPts[i1 + 2] - arcPts[i0 + 2]) * frac;
      let tx = arcTans[i0] + (arcTans[i1] - arcTans[i0]) * frac;
      let ty = arcTans[i0 + 1] + (arcTans[i1 + 1] - arcTans[i0 + 1]) * frac;
      let tz = arcTans[i0 + 2] + (arcTans[i1 + 2] - arcTans[i0 + 2]) * frac;
      const tl = Math.hypot(tx, ty, tz) || 1;
      return {
        point: new THREE.Vector3(px, py, pz),
        tangent: new THREE.Vector3(tx / tl, ty / tl, tz / tl),
        length: totalLength,
      };
    };

    // Ensure curve methods exist even if running under a lightweight mock THREE
    if (typeof curve.getPointAt !== 'function') curve.getPointAt = (u) => evalAtU(u).point;
    if (typeof curve.getTangentAt !== 'function') curve.getTangentAt = (u) => evalAtU(u).tangent;
    if (typeof curve.getPoint !== 'function') curve.getPoint = (t) => evalAtU(t).point;
    if (typeof curve.getTangent !== 'function') curve.getTangent = (t) => evalAtU(t).tangent;
    if (typeof curve.getLength !== 'function') curve.getLength = () => totalLength;

    const isCyan = def.color === 'cyan';
    const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.23, 8, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, isCyan ? railCyanMat : railYellowMat);
    tubeMesh.userData.railId = def.id;
    railsGroup.add(tubeMesh);

    // Support stanchions along the rail down to rooftop or street
    const postSpacing = 26;
    const postSteps = Math.max(2, Math.floor(totalLength / postSpacing));
    for (let s = 0; s <= postSteps; s++) {
      const u = s / postSteps;
      const sample = evalAtU(u);
      const px = sample.point.x, py = sample.point.y, pz = sample.point.z;
      const baseH = getGroundHeight(px, pz, py);
      const h = py - baseH;
      if (h > 0.35 && h < 26) {
        postInstances.push({ x: px, y: baseH + h * 0.5, z: pz, h });
      }
    }

    const railRecord = {
      id: def.id,
      name: def.name,
      color: isCyan ? '#00f0ff' : '#ffe042',
      curve,
      length: totalLength,
      minX, maxX, minY, maxY, minZ, maxZ,
      arcPts,
      arcTans,
      segments: SEGMENTS,
      evalAtU,
      mesh: tubeMesh,
    };
    rails.push(railRecord);
    railById.set(def.id, railRecord);
  }

  if (postInstances.length > 0) {
    const postGeo = new THREE.CylinderGeometry(0.11, 0.16, 1, 6);
    const postsMesh = new THREE.InstancedMesh(postGeo, railPostMat, postInstances.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sc = new THREE.Vector3();
    postInstances.forEach((p, idx) => {
      pv.set(p.x, p.y, p.z);
      sc.set(1, p.h, 1);
      m4.compose(pv, q, sc);
      postsMesh.setMatrixAt(idx, m4);
    });
    railsGroup.add(postsMesh);
  }

  function sampleRail(railId, u) {
    let rail = railById.get(railId);
    if (!rail && typeof railId === 'number') rail = rails[railId];
    if (!rail && railId && typeof railId === 'object' && railId.id) rail = railById.get(railId.id);
    if (!rail) return null;
    return rail.evalAtU(u);
  }

  function findNearestRail(pos, maxDist = 3.2) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null;
    const limit = Number.isFinite(maxDist) && maxDist > 0 ? maxDist : 3.2;
    const limitSq = limit * limit;
    const px = pos.x, py = pos.y, pz = pos.z;

    let bestRail = null;
    let bestDistSq = limitSq;
    let bestU = 0;

    for (let rIdx = 0; rIdx < rails.length; rIdx++) {
      const r = rails[rIdx];
      if (
        px < r.minX - limit || px > r.maxX + limit ||
        py < r.minY - limit || py > r.maxY + limit ||
        pz < r.minZ - limit || pz > r.maxZ + limit
      ) {
        continue;
      }
      const pts = r.arcPts;
      const segs = r.segments;
      for (let i = 0; i < segs; i++) {
        const k0 = i * 3, k1 = (i + 1) * 3;
        const x0 = pts[k0], y0 = pts[k0 + 1], z0 = pts[k0 + 2];
        const ux = pts[k1] - x0, uy = pts[k1 + 1] - y0, uz = pts[k1 + 2] - z0;
        const l2 = ux * ux + uy * uy + uz * uz;
        const t = l2 > 1e-8 ? clamp(((px - x0) * ux + (py - y0) * uy + (pz - z0) * uz) / l2, 0, 1) : 0;
        const dx = px - (x0 + ux * t);
        const dy = py - (y0 + uy * t);
        const dz = pz - (z0 + uz * t);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= bestDistSq) {
          bestDistSq = d2;
          bestRail = r;
          bestU = (i + t) / segs;
        }
      }
    }

    if (!bestRail) return null;
    const sampled = bestRail.evalAtU(bestU);
    return {
      railId: bestRail.id,
      curve: bestRail.curve,
      u: bestU,
      point: sampled.point,
      tangent: sampled.tangent,
      dist: Math.sqrt(bestDistSq),
    };
  }

  // ------------------------------------------------------------------
  // 7. 18 Atomic-Orange Kicker Ramps
  // ------------------------------------------------------------------
  const rampsGroup = new THREE.Group();
  rampsGroup.name = 'kicker-ramps';
  group.add(rampsGroup);

  const rampBodyMat = new THREE.MeshStandardMaterial({
    color: 0xff6b1a,
    emissive: 0xd93b00,
    emissiveIntensity: 1.15,
    roughness: 0.3,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });
  const rampStripMat = new THREE.MeshBasicMaterial({ color: 0xffe042, side: THREE.DoubleSide });

  // Build reusable wedge geometry (width along X, length along +Z from -L/2 low toe to +L/2 high lip)
  const RAMP_W = 7.4, RAMP_L = 10.6, RAMP_H = 2.7;
  const wedgeGeo = (() => {
    const hw = RAMP_W * 0.5, hl = RAMP_L * 0.5;
    // Curved kicker profile in 4 steps along Z
    const steps = 4;
    const p = [], idx = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = -hl + t * RAMP_L;
      const y = RAMP_H * Math.pow(t, 1.35);
      p.push(-hw, y, z, hw, y, z, -hw, 0, z, hw, 0, z);
      if (i > 0) {
        const b = (i - 1) * 4;
        // Deck top (+Y/+Z)
        idx.push(b, b + 4, b + 1, b + 1, b + 4, b + 5);
        // Left & right side walls
        idx.push(b + 2, b + 6, b, b, b + 6, b + 4);
        idx.push(b + 1, b + 5, b + 3, b + 3, b + 5, b + 7);
      }
    }
    // Back vertical face at z = +hl
    const last = steps * 4;
    idx.push(last + 2, last + 1, last, last + 2, last + 3, last + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();

  const ramps = [];
  let worldElapsed = 0;

  for (let i = 0; i < RAMP_DEFS.length; i++) {
    const def = RAMP_DEFS[i];
    const dl = Math.hypot(def.dirX, def.dirZ) || 1;
    const fx = def.dirX / dl, fz = def.dirZ / dl;
    const rx = fz, rz = -fx;
    const yaw = Math.atan2(fx, fz);

    const rGroup = new THREE.Group();
    rGroup.position.set(def.x, 0.05, def.z);
    rGroup.rotation.y = yaw;
    rGroup.userData.rampId = def.id;

    const body = new THREE.Mesh(wedgeGeo, rampBodyMat);
    rGroup.add(body);

    // Glowing cyber-yellow boost chevrons along the ramp deck
    for (let c = 0; c < 3; c++) {
      const t = 0.25 + c * 0.28;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(RAMP_W * 0.72, 0.08, 0.55), rampStripMat);
      strip.position.set(0, RAMP_H * Math.pow(t, 1.35) + 0.06, -RAMP_L * 0.5 + t * RAMP_L);
      strip.rotation.x = -0.26;
      rGroup.add(strip);
    }
    rampsGroup.add(rGroup);

    // Launch normal tilted upward + forward along ramp lip
    const normal = new THREE.Vector3(fx * 0.34, 0.94, fz * 0.34).normalize();
    ramps.push({
      id: def.id,
      x: def.x,
      y: 0,
      z: def.z,
      fx,
      fz,
      rx,
      rz,
      halfW: RAMP_W * 0.5,
      halfL: RAMP_L * 0.5,
      height: RAMP_H,
      boostVelY: def.boostVelY,
      forwardBoost: def.forwardBoost,
      normal,
      lastTriggerElapsed: -10,
      mesh: rGroup,
    });
  }

  function checkRampTrigger(pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    const py = Number.isFinite(pos.y) ? pos.y : 0;

    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      const dx = pos.x - r.x;
      const dz = pos.z - r.z;
      if (Math.abs(dx) > 10 && Math.abs(dz) > 10) continue;

      const localFwd = dx * r.fx + dz * r.fz;
      const localRight = dx * r.rx + dz * r.rz;

      if (
        Math.abs(localRight) <= r.halfW + 0.9 &&
        Math.abs(localFwd) <= r.halfL + 0.9 &&
        py >= -1.0 &&
        py <= r.height + 2.5
      ) {
        if (
          r.lastTriggerElapsed >= 0 &&
          worldElapsed > r.lastTriggerElapsed &&
          worldElapsed - r.lastTriggerElapsed < 0.38
        ) {
          return null;
        }
        r.lastTriggerElapsed = worldElapsed;
        return {
          id: r.id,
          boostVelY: r.boostVelY,
          forwardBoost: r.forwardBoost,
          normal: r.normal.clone(),
        };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------
  // 8. 19 Delivery Zones + Crazy-Taxi Pillar + Holo Cassette + Mini-Tapes
  // ------------------------------------------------------------------
  report(0.94, 'Deploying bootleg cassette beacons & boost tapes…');
  const zones = ZONE_DEFS.map((z) => {
    const testPos = { x: z.x, y: 0, z: z.z };
    // Safety verification against spatial hash grid
    resolveHorizontalCollision(testPos, 3.5, 0);
    return {
      id: z.id,
      name: z.name,
      x: Math.round(testPos.x * 10) / 10,
      y: 0,
      z: Math.round(testPos.z * 10) / 10,
      neighborhood: z.neighborhood,
    };
  });

  const spawnPoint = { ...SPAWN_POINT };
  resolveHorizontalCollision(spawnPoint, 3.5, 0);

  // Subtle street-level pad rings at every zone so players spot drop zones around town
  const zonePadsGroup = new THREE.Group();
  zonePadsGroup.name = 'zone-pads';
  const padGeo = new THREE.TorusGeometry(6.5, 0.16, 6, 32);
  padGeo.rotateX(Math.PI / 2);
  const padMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  for (const z of zones) {
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(z.x, 0.35, z.z);
    zonePadsGroup.add(pad);
  }
  group.add(zonePadsGroup);

  // Active Target Beacon: 170m Crazy-Taxi Vertical Light Pillar + Giant Spinning Holographic Cassette
  const beaconGroup = new THREE.Group();
  beaconGroup.name = 'active-zone-beacon';
  beaconGroup.visible = false;
  group.add(beaconGroup);

  const beaconPrimaryMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beaconCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffe042,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beaconRingMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cassetteShellMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00f0ff,
    emissiveIntensity: 1.55,
    roughness: 0.2,
    metalness: 0.35,
    transparent: true,
    opacity: 0.9,
  });
  const cassetteAccentMat = new THREE.MeshBasicMaterial({ color: 0xffe042 });

  const outerBeam = new THREE.Mesh(new THREE.CylinderGeometry(13.2, 13.2, 175, 28, 1, true), beaconPrimaryMat);
  outerBeam.position.y = 87.5;
  const innerBeam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5.8, 185, 20, 1, true), beaconCoreMat);
  innerBeam.position.y = 92.5;
  const groundOuterRing = new THREE.Mesh(new THREE.TorusGeometry(13.5, 0.36, 8, 48), beaconRingMat);
  groundOuterRing.rotation.x = Math.PI / 2;
  groundOuterRing.position.y = 0.45;
  const groundPulseRing = new THREE.Mesh(new THREE.TorusGeometry(13.5, 0.24, 8, 48), cassetteAccentMat);
  groundPulseRing.rotation.x = Math.PI / 2;
  groundPulseRing.position.y = 0.55;
  beaconGroup.add(outerBeam, innerBeam, groundOuterRing, groundPulseRing);

  // Giant Spinning 3D Holographic Bootleg Cassette
  const holoCassette = new THREE.Group();
  holoCassette.position.y = 6.2;
  const shellMesh = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.9, 0.72), cassetteShellMat);
  const labelStrip = new THREE.Mesh(new THREE.BoxGeometry(5.3, 1.35, 0.78), cassetteAccentMat);
  labelStrip.position.y = 0.75;
  const bottomRidge = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.72, 0.86), cassetteAccentMat);
  bottomRidge.position.y = -1.55;
  const reelGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.86, 12);
  reelGeo.rotateX(Math.PI / 2);
  const leftReel = new THREE.Mesh(reelGeo, cassetteAccentMat);
  leftReel.position.set(-1.35, -0.15, 0);
  const rightReel = new THREE.Mesh(reelGeo, cassetteAccentMat);
  rightReel.position.set(1.35, -0.15, 0);
  const wireCage = new THREE.Mesh(
    new THREE.BoxGeometry(6.55, 4.25, 0.95),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.45 })
  );
  holoCassette.add(shellMesh, labelStrip, bottomRidge, leftReel, rightReel, wireCage);
  beaconGroup.add(holoCassette);

  let activeZoneState = { zoneId: null, kind: null };

  function setActiveZone(zoneId, kind = 'pickup') {
    if (!zoneId || !kind) {
      activeZoneState = { zoneId: null, kind: null };
      beaconGroup.visible = false;
      return;
    }
    const target = zones.find((z) => z.id === zoneId);
    if (!target) {
      activeZoneState = { zoneId: null, kind: null };
      beaconGroup.visible = false;
      return;
    }
    activeZoneState = { zoneId: target.id, kind };
    beaconGroup.position.set(target.x, target.y, target.z);
    beaconGroup.visible = true;

    const isDropoff = kind === 'dropoff';
    const primaryHex = isDropoff ? 0xff6b1a : 0x00f0ff;
    const accentHex = isDropoff ? 0xff2a85 : 0xffe042;
    beaconPrimaryMat.color.setHex(primaryHex);
    beaconRingMat.color.setHex(primaryHex);
    beaconCoreMat.color.setHex(accentHex);
    cassetteShellMat.color.setHex(primaryHex);
    cassetteShellMat.emissive.setHex(primaryHex);
    cassetteAccentMat.color.setHex(accentHex);
  }

  // Collectible Signal Boost Mini-Tapes along all 24 grind rails + Castro Plaza lead-in
  const boostPickups = [];
  for (let rIdx = 0; rIdx < rails.length; rIdx++) {
    const r = rails[rIdx];
    const uList = [0.2, 0.4, 0.6, 0.8];
    for (let k = 0; k < uList.length; k++) {
      const s = r.evalAtU(uList[k]);
      boostPickups.push({
        id: `tape-${r.id}-${k}`,
        x: s.point.x,
        baseY: s.point.y + 0.95,
        z: s.point.z,
        collected: false,
        collectedAt: -100,
        phase: (rIdx * 0.7 + k * 0.45) % (Math.PI * 2),
      });
    }
  }
  // Extra street lead-in mini-tapes right ahead of spawnPoint so immediate street carving grabs tapes too
  for (let i = 0; i < 6; i++) {
    boostPickups.push({
      id: `tape-spawn-lead-${i}`,
      x: SPAWN_POINT.x + Math.sin(i * 0.5) * 1.6,
      baseY: 1.35,
      z: SPAWN_POINT.z - 22 - i * 16,
      collected: false,
      collectedAt: -100,
      phase: i * 0.6,
    });
  }

  const miniTapeGeo = new THREE.BoxGeometry(1.15, 0.75, 0.24);
  const miniTapeMat = new THREE.MeshStandardMaterial({
    color: 0xffe042,
    emissive: 0xff9d00,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0.3,
  });
  const miniTapeMesh = new THREE.InstancedMesh(miniTapeGeo, miniTapeMat, boostPickups.length);
  miniTapeMesh.frustumCulled = false;
  group.add(miniTapeMesh);

  const tmpMat4 = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3(1, 1, 1);
  const zeroScale = new THREE.Vector3(0, 0, 0);
  const yAxis = new THREE.Vector3(0, 1, 0);

  function syncMiniTapes(elapsed = 0) {
    for (let i = 0; i < boostPickups.length; i++) {
      const p = boostPickups[i];
      if (p.collected) {
        tmpPos.set(p.x, -100, p.z);
        tmpMat4.compose(tmpPos, tmpQuat, zeroScale);
      } else {
        const bob = Math.sin(elapsed * 3.4 + p.phase) * 0.24;
        tmpPos.set(p.x, p.baseY + bob, p.z);
        tmpQuat.setFromAxisAngle(yAxis, elapsed * 2.6 + p.phase);
        tmpMat4.compose(tmpPos, tmpQuat, tmpScale);
      }
      miniTapeMesh.setMatrixAt(i, tmpMat4);
    }
    if (miniTapeMesh.instanceMatrix) miniTapeMesh.instanceMatrix.needsUpdate = true;
  }
  syncMiniTapes(0);

  function collectBoostPickups(pos, radius = 2.5) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return 0;
    const py = Number.isFinite(pos.y) ? pos.y : 0;
    const r = (Number.isFinite(radius) && radius > 0 ? radius : 2.5) + 0.9;
    const rSq = r * r;
    let count = 0;

    for (let i = 0; i < boostPickups.length; i++) {
      const p = boostPickups[i];
      if (p.collected) continue;
      const dx = pos.x - p.x;
      const dy = (py + 0.9) - p.baseY;
      const dz = pos.z - p.z;
      if (dx * dx + dy * dy * 0.55 + dz * dz <= rSq) {
        p.collected = true;
        p.collectedAt = worldElapsed;
        count++;
      }
    }
    if (count > 0) syncMiniTapes(worldElapsed);
    return count;
  }

  function resetPickups() {
    for (let i = 0; i < boostPickups.length; i++) {
      boostPickups[i].collected = false;
      boostPickups[i].collectedAt = -100;
    }
    syncMiniTapes(worldElapsed);
  }

  // ------------------------------------------------------------------
  // 9. Per-Frame Beat-Reactive World Update
  // ------------------------------------------------------------------
  function update({ dt = 0.016, elapsed = 0, beatPhase = 0, comboTier = 0, playerPos = null } = {}) {
    const safeElapsed = Number.isFinite(elapsed) ? elapsed : worldElapsed + (Number.isFinite(dt) ? dt : 0.016);
    worldElapsed = safeElapsed;

    const phase = Number.isFinite(beatPhase) ? ((beatPhase % 1) + 1) % 1 : 0;
    const beatPulse = Math.pow(1 - phase, 2.4);
    const tier = clamp(Number.isFinite(comboTier) ? comboTier : 0, 0, 3);

    // Keep sky dome centered around rider so horizon never shifts
    if (playerPos && Number.isFinite(playerPos.x) && Number.isFinite(playerPos.z)) {
      skyDome.position.set(playerPos.x, 0, playerPos.z);
    }

    skyUniforms.uTime.value = safeElapsed;
    buildingUniforms.uTime.value = safeElapsed;
    buildingUniforms.uBeat.value = beatPulse;
    buildingUniforms.uCombo.value = tier / 3;
    if (waterUniforms) waterUniforms.uTime.value = safeElapsed;

    // Pulse neon grind rails with combo tier & beat
    const railBoost = 1.95 + tier * 0.32 + beatPulse * (0.35 + tier * 0.18);
    railCyanMat.emissiveIntensity = railBoost;
    railYellowMat.emissiveIntensity = railBoost * 0.96;

    // Pirate Radio Broadcast Mast wave rings & summit strobe
    if (mastAntennaArray) mastAntennaArray.rotation.y = safeElapsed * 0.55;
    if (mastBeaconOrb) {
      const orbScale = 1.0 + beatPulse * (0.38 + tier * 0.14);
      mastBeaconOrb.scale.set(orbScale, orbScale, orbScale);
    }
    for (let i = 0; i < mastWaveRings.length; i++) {
      const rw = mastWaveRings[i];
      const prog = (safeElapsed * 0.38 + rw.phaseOffset + phase * 0.08) % 1;
      const radius = 5 + prog * (105 + tier * 24);
      rw.mesh.scale.set(radius, radius, Math.max(1, radius * 0.35));
      rw.mesh.position.y = MAST_HUB.height - 6 + prog * 46;
      rw.mat.opacity = (1 - prog) * (0.48 + tier * 0.12 + beatPulse * 0.15);
    }

    // Active Crazy-Taxi Delivery Beacon animation
    if (beaconGroup.visible && activeZoneState.zoneId) {
      holoCassette.rotation.y = safeElapsed * 2.1;
      holoCassette.rotation.z = Math.sin(safeElapsed * 1.7) * 0.12;
      holoCassette.position.y = 6.2 + Math.sin(safeElapsed * 3.1) * 0.65 + beatPulse * 0.35;
      leftReel.rotation.z = -safeElapsed * 5.0;
      rightReel.rotation.z = -safeElapsed * 5.0;

      const ringScale = 0.35 + phase * 0.72;
      groundPulseRing.scale.set(ringScale, ringScale, 1);
      beaconPrimaryMat.opacity = 0.20 + beatPulse * 0.14;
      beaconCoreMat.opacity = 0.38 + beatPulse * 0.22;
    }

    // Auto-respawn collected mini-tapes after 30s so long runs keep flowing
    for (let i = 0; i < boostPickups.length; i++) {
      const p = boostPickups[i];
      if (p.collected && safeElapsed - p.collectedAt > 30) {
        p.collected = false;
      }
    }
    syncMiniTapes(safeElapsed);
  }

  report(1.0, '107.7 FM Broadcast Ready!');

  return {
    group,
    spawnPoint,
    zones,
    rails,
    ramps,
    boostPickups,
    setActiveZone,
    getGroundHeight,
    resolveHorizontalCollision,
    findNearestRail,
    sampleRail,
    checkRampTrigger,
    collectBoostPickups,
    resetPickups,
    update,
  };
}
