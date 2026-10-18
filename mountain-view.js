// Mountain View 3D — a day-and-night map of the city, built from OpenStreetMap.
// Rendering notes: merged extrusions with a custom window/AO surface shader, instanced
// swaying trees, a fresnel water shader, a gradient sky dome, GTAO + bloom + ACES output.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------------------------------------------------------------- setup
const ORIGIN = { lat: 37.396, lon: -122.079 };
const R_EARTH = 6378137;
const isCoarse = matchMedia('(pointer: coarse)').matches;
const isSmall = innerWidth < 760;
const LOW = isCoarse;          // phones: no GTAO, fewer trees
const DENSE = !(isCoarse || isSmall);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const elMap = document.getElementById('map');
const elLabels = document.getElementById('labels');
const elLoading = document.getElementById('loading');
const elLoadingMsg = document.getElementById('loading-msg');
const elPhase = document.getElementById('phase');
const elClock = document.getElementById('clock');
const elChips = document.getElementById('chips');
const elHome = document.getElementById('home');
const elRide = document.getElementById('ride');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 2 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
elMap.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: elLabels });
labelRenderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 12, 40000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false;
controls.minDistance = 140;
controls.maxDistance = 9000;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = 1.40;
controls.zoomToCursor = true;
controls.rotateSpeed = 0.6;

// local metres: x east, y up, z south (north is -z)
function toLocal(lon, lat) {
  const x = THREE.MathUtils.degToRad(lon - ORIGIN.lon) * R_EARTH * Math.cos(THREE.MathUtils.degToRad(ORIGIN.lat));
  const y = THREE.MathUtils.degToRad(lat - ORIGIN.lat) * R_EARTH;
  return { x, y };
}

// ---------------------------------------------------------------- palettes
const DAY = {
  land: '#ebe4d6', park: '#b8d9a0', wetland: '#c9d8b8', waterDeep: '#74acdf', waterShallow: '#9cc8ee',
  apron: '#d6d3cd', runway: '#c4c2bd', taxiway: '#cfccc6', rail: '#b4b0a7', stream: '#9ec6ea',
  road: {
    re: ['#ffffff', '#cbc5b8'], te: ['#ffffff', '#c6bfb1'], se: ['#ffffff', '#bfb8aa'], sel: ['#ffffff', '#bfb8aa'],
    pr: ['#fbefc8', '#dccb9f'], prl: ['#fbefc8', '#dccb9f'], tr: ['#f8d994', '#dbb463'], trl: ['#f8d994', '#dbb463'],
    mw: ['#f6cf7c', '#d6aa55'], mwl: ['#f8d994', '#d6aa55'], pe: ['#f2efe8', '#dedad0'], cy: ['#e4e0d6', '#e4e0d6'],
  },
  wall: '#f0ede7', roof: '#f9f8f4', googleRoof: '#f4f3ef', hangar1: '#d9dde3', hangar: '#cdbfa8', tent: '#fbfbfa', canopy: '#9aa3ad', glass: '#b3c4d3',
  skyTop: '#6fa8e6', skyHorizon: '#dde8f2', fog: '#dfe8f3', fogNear: 3200, fogFar: 17000,
  hemiSky: '#e2eeff', hemiGround: '#ddd3c2', hemi: 1.5, sun: '#fff5e4', sunI: 2.25, exposure: 1.04,
  canopyA: '#63a152', canopyB: '#478b41', trunk: '#8a7256', lit: 0.0, bloom: 0.0, stars: 0.0, lamp: 0.0,
};
const NIGHT = {
  land: '#272c3c', park: '#223429', wetland: '#21292f', waterDeep: '#0f1a30', waterShallow: '#1b2b4a',
  apron: '#2c303c', runway: '#333741', taxiway: '#31353f', rail: '#3d414d', stream: '#172642',
  road: {
    re: ['#404659', '#2e3345'], te: ['#454b5d', '#2e3345'], se: ['#4c5265', '#323849'], sel: ['#4c5265', '#323849'],
    pr: ['#58596d', '#3b3c4e'], prl: ['#58596d', '#3b3c4e'], tr: ['#625c6a', '#3e3947'], trl: ['#625c6a', '#3e3947'],
    mw: ['#6c6372', '#443d49'], mwl: ['#625c6a', '#443d49'], pe: ['#383d4c', '#2a2e3b'], cy: ['#343949', '#343949'],
  },
  wall: '#3b4252', roof: '#4a5162', googleRoof: '#4a5162', hangar1: '#4a515d', hangar: '#46403b', tent: '#dde1ea', canopy: '#353c4a', glass: '#44566c',
  skyTop: '#0a0e1a', skyHorizon: '#2a3555', fog: '#161c2d', fogNear: 2600, fogFar: 15000,
  hemiSky: '#3e4f7a', hemiGround: '#1e222c', hemi: 1.9, sun: '#aabbe6', sunI: 0.7, exposure: 1.05,
  canopyA: '#27412e', canopyB: '#1d3325', trunk: '#25262c', lit: 0.42, bloom: 0.42, stars: 1.0, lamp: 1.0,
};

// lerpable registry: every colour/uniform that changes between day and night
const lerps = [];
function trackColor(color, dayHex, nightHex) {
  lerps.push({ kind: 'color', target: color, a: new THREE.Color(dayHex), b: new THREE.Color(nightHex) });
  color.copy(lerps[lerps.length - 1].a);
}
function trackNumber(obj, key, a, b) { lerps.push({ kind: 'num', obj, key, a, b }); obj[key] = a; }
function applyPhase(t) {
  for (const l of lerps) {
    if (l.kind === 'color') l.target.copy(l.a).lerp(l.b, t);
    else if (l.kind === 'num') l.obj[l.key] = THREE.MathUtils.lerp(l.a, l.b, t);
  }
}

// ---------------------------------------------------------------- lights, sky, fog
scene.fog = new THREE.Fog(DAY.fog, DAY.fogNear, DAY.fogFar);
trackColor(scene.fog.color, DAY.fog, NIGHT.fog);
trackNumber(scene.fog, 'near', DAY.fogNear, NIGHT.fogNear);
trackNumber(scene.fog, 'far', DAY.fogFar, NIGHT.fogFar);

const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemi);
trackColor(hemi.color, DAY.hemiSky, NIGHT.hemiSky);
trackColor(hemi.groundColor, DAY.hemiGround, NIGHT.hemiGround);
trackNumber(hemi, 'intensity', DAY.hemi, NIGHT.hemi);
scene.add(hemi);

const sun = new THREE.DirectionalLight(DAY.sun, DAY.sunI);
trackColor(sun.color, DAY.sun, NIGHT.sun);
trackNumber(sun, 'intensity', DAY.sunI, NIGHT.sunI);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 1.2;
sun.shadow.camera.near = 200;
sun.shadow.camera.far = 9000;
scene.add(sun, sun.target);

trackNumber(renderer, 'toneMappingExposure', DAY.exposure, NIGHT.exposure);

const skyUniforms = {
  uTop: { value: new THREE.Color(DAY.skyTop) },
  uHorizon: { value: new THREE.Color(DAY.skyHorizon) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uGlow: { value: 1.0 },
};
trackColor(skyUniforms.uTop.value, DAY.skyTop, NIGHT.skyTop);
trackColor(skyUniforms.uHorizon.value, DAY.skyHorizon, NIGHT.skyHorizon);
trackNumber(skyUniforms.uGlow, 'value', 1.0, 0.0);
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(30000, 48, 24),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uSunDir; uniform float uGlow;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.05, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.93, 0.8) * (pow(s, 240.0) * 0.9 + pow(s, 12.0) * 0.14) * uGlow;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
sky.frustumCulled = false;
scene.add(sky);

// stars: fixed points on the dome, faded in at night
{
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random(), v = Math.random();
    const theta = 2 * Math.PI * u, phi = Math.acos(1 - v) * 0.5; // upper hemisphere, denser near zenith
    const r = 28000;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) + 600;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  trackNumber(m, 'opacity', 0.0, 0.85);
  const stars = new THREE.Points(g, m);
  stars.frustumCulled = false;
  scene.add(stars);
}

// ---------------------------------------------------------------- geometry helpers
const layerMats = [];
function flatMat(dayHex, nightHex, order, extra = {}) {
  // slope factor kept tiny: a large factor pulls flat roads through the trail at eye level; units do the layering
  const m = new THREE.MeshStandardMaterial({ color: dayHex, roughness: 1.0, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -order * 0.05, polygonOffsetUnits: -order * 3, ...extra });
  trackColor(m.color, dayHex, nightHex);
  layerMats.push(m);
  return m;
}

function shapeFromFlat(p) {
  const s = new THREE.Shape();
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i] / 10, y = p[i + 1] / 10;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function polygonsGeometry(polys) {
  const geos = [];
  for (const poly of polys) {
    if (poly.p.length < 6) continue;
    try {
      const g = new THREE.ShapeGeometry(shapeFromFlat(poly.p));
      g.rotateX(-Math.PI / 2);
      geos.push(g);
    } catch (e) { /* skip degenerate */ }
  }
  if (!geos.length) return null;
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  return merged;
}

// polyline -> flat ribbon of given width (metres), lying on the ground
function ribbonGeometry(lines, width, y) {
  const positions = [], indices = [];
  const half = width / 2;
  for (const line of lines) {
    const pts = [];
    for (let i = 0; i < line.p.length; i += 2) pts.push(new THREE.Vector2(line.p[i] / 10, -line.p[i + 1] / 10));
    if (pts.length < 2) continue;
    const w = line.w ? line.w / 2 : half;
    const base = positions.length / 3;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const d1 = i === 0 ? next.clone().sub(prev) : pts[i].clone().sub(prev);
      const d2 = i === pts.length - 1 ? next.clone().sub(prev) : next.clone().sub(pts[i]);
      d1.normalize(); d2.normalize();
      const n1 = new THREE.Vector2(-d1.y, d1.x), n2 = new THREE.Vector2(-d2.y, d2.x);
      const n = n1.clone().add(n2);
      if (n.lengthSq() < 1e-6) n.copy(n1); else n.normalize();
      const miter = Math.min(2.2, 1 / Math.max(0.45, n.dot(n1)));
      const o = n.multiplyScalar(w * miter);
      positions.push(pts[i].x + o.x, y, pts[i].y + o.y, pts[i].x - o.x, y, pts[i].y - o.y);
      if (i > 0) {
        const a = base + (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// principal axis of a footprint: centre, angle, length, width
function fitBox(p) {
  const pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i] / 10, p[i + 1] / 10]);
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { const dx = x - cx, dy = y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, y] of pts) {
    const u = (x - cx) * ca + (y - cy) * sa, v = -(x - cx) * sa + (y - cy) * ca;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  return { cx, cy, ang, len: maxU - minU, wid: maxV - minV, u0: (minU + maxU) / 2, v0: (minV + maxV) / 2 };
}

// place an object built along +x (length) / z (width) at a fitted box
function placeOnBox(obj, box, yUp = 0) {
  const ca = Math.cos(box.ang), sa = Math.sin(box.ang);
  const cx = box.cx + box.u0 * ca - box.v0 * sa, cy = box.cy + box.u0 * sa + box.v0 * ca;
  obj.position.set(cx, yUp, -cy);
  obj.rotation.y = box.ang; // local +x -> world (cos, -sin) in xz, i.e. map east/north
  return obj;
}

// ---------------------------------------------------------------- buildings shader
const buildingUniforms = {
  uLit: { value: 0 }, uTime: { value: 0 }, uNightTint: { value: 0 },
  uNightWall: { value: new THREE.Color(NIGHT.wall) }, uNightRoof: { value: new THREE.Color(NIGHT.roof) },
};
trackNumber(buildingUniforms.uLit, 'value', DAY.lit, NIGHT.lit);
trackNumber(buildingUniforms.uNightTint, 'value', 0, 1);

function buildingSurface(mat, { windows = true } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, buildingUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float seed; attribute float bh; varying float vSeed; varying float vBh; varying vec3 vWPos; varying float vUpness; varying vec2 vUvB;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSeed = seed; vBh = bh; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vUvB = uv;
        vUpness = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLit, uTime, uNightTint; uniform vec3 uNightWall, uNightRoof; varying float vSeed; varying float vBh; varying vec3 vWPos; varying float vUpness; varying vec2 vUvB;
        float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wall = 1.0 - smoothstep(0.35, 0.65, abs(vUpness));
        // day tint comes from the vertex colour; at night walls and roofs settle to the night palette
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(uNightRoof, uNightWall, wall), uNightTint);
        // contact shading near the ground, a paper-light rim under the roof edge, faint floor lines for scale
        float base = mix(0.86, 1.0, smoothstep(0.0, 6.0, vWPos.y));
        float rim = smoothstep(vBh - 1.1, vBh - 0.15, vWPos.y);
        float floors = 1.0 - 0.035 * step(0.86, fract(vWPos.y / 3.4)) * step(6.5, vBh);
        diffuseColor.rgb *= mix(1.0, base * (1.0 + 0.09 * rim) * floors, wall);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${windows ? `
        if (wall > 0.5 && vBh > 3.4) {
          vec2 fd = vec2(fract(vUvB.x / 2.6), fract(vWPos.y / 3.2));
          float glassD = step(0.30, fd.x) * step(fd.x, 0.70) * step(0.34, fd.y) * step(fd.y, 0.74) * step(1.2, vWPos.y) * step(vWPos.y, vBh - 0.6);
          diffuseColor.rgb *= 1.0 - 0.09 * glassD * (1.0 - uNightTint);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.93, 0.97, 1.04), glassD * (1.0 - uNightTint));
        }
        if (wall > 0.5 && uLit > 0.001) {
          vec2 cell = vec2(floor(vUvB.x / 2.6), floor(vWPos.y / 3.2));
          vec2 f = vec2(fract(vUvB.x / 2.6), fract(vWPos.y / 3.2));
          float inWin = step(0.30, f.x) * step(f.x, 0.70) * step(0.34, f.y) * step(f.y, 0.74);
          float r = hash12(cell + vSeed * 17.0);
          float slow = hash12(cell * 1.7 + floor(uTime / 23.0 + vSeed));
          float lit = step(1.0 - uLit, r) * step(0.08, slow) * inWin * step(1.2, vWPos.y);
          vec3 warm = vec3(1.0, 0.82, 0.55), cool = vec3(0.78, 0.86, 1.0);
          vec3 wc = mix(warm, cool, step(0.7, hash12(cell * 3.1 + vSeed)));
          totalEmissiveRadiance += wc * lit * 1.25 * uNightTint;
        }` : ''}`);
  };
  return mat;
}

// ---------------------------------------------------------------- scene build
const group = new THREE.Group();
scene.add(group);
let bundle = null;
let bounds = null;
const labelObjects = [];
const trees = { wind: null, count: 0 };
const lamps = { mesh: null };
const occupancy = { free: () => true };

async function nextFrame(msg) {
  if (msg) elLoadingMsg.textContent = msg;
  // setTimeout, not requestAnimationFrame: a background tab must still finish building
  await new Promise(r => setTimeout(r, 0));
}

let routeData = null;
async function build() {
  bundle = await (await fetch('./assets/mountain-view-map.json?v=3')).json();
  try { routeData = await (await fetch('./assets/mountain-view-ride.json?v=2')).json(); } catch (e) { routeData = null; }
  bounds = bundle.bounds.map(v => v / 10);

  await nextFrame('Laying the ground…');
  // ground: big plane, land colour; the world fades into fog beyond the city
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), flatMat(DAY.land, NIGHT.land, 0));
  ground.rotation.x = -Math.PI / 2;
  // well below the textured ground so the two planes never fight at distance
  ground.position.set((bounds[0] + bounds[2]) / 2, -0.6, -(bounds[1] + bounds[3]) / 2);
  ground.receiveShadow = true;
  group.add(ground);

  const addPolys = (polys, mat, y) => {
    const g = polygonsGeometry(polys);
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.position.y = y;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  addPolys(bundle.wetland, flatMat(DAY.wetland, NIGHT.wetland, 1), 0.05);
  addPolys(bundle.parks, flatMat(DAY.park, NIGHT.park, 2), 0.08);
  addPolys(bundle.aero.aprons, flatMat(DAY.apron, NIGHT.apron, 3), 0.1);

  await nextFrame('Filling the bay…');
  buildWater();

  await nextFrame('Paving the streets…');
  const ROAD_W = { mw: 13, mwl: 8, tr: 12, trl: 7, pr: 13, prl: 7, se: 10.5, sel: 6, te: 8.5, tel: 6, re: 6.5, pe: 3.5, cy: 2.2 };
  const ROAD_ORDER = ['cy', 'pe', 're', 'tel', 'te', 'sel', 'se', 'prl', 'pr', 'trl', 'tr', 'mwl', 'mw'];
  const byClass = {};
  for (const r of bundle.roads) (byClass[r.c] ||= []).push(r);
  ROAD_ORDER.forEach((c, i) => {
    const lines = byClass[c];
    if (!lines) return;
    const key = DAY.road[c] ? c : c.replace(/l$/, '');
    const [fillD, caseD] = DAY.road[key], [fillN, caseN] = NIGHT.road[key];
    const w = ROAD_W[c];
    const y = 0.14 + i * 0.045;
    if (c !== 'cy') {
      const casing = new THREE.Mesh(ribbonGeometry(lines, w + 1.6, y), flatMat(caseD, caseN, 4 + i * 2));
      casing.receiveShadow = true;
      group.add(casing);
    }
    const fill = new THREE.Mesh(ribbonGeometry(lines, w, y + 0.02), flatMat(fillD, fillN, 5 + i * 2));
    fill.receiveShadow = true;
    group.add(fill);
  });
  // streams, rail, runways, taxiways
  group.add(Object.assign(new THREE.Mesh(ribbonGeometry(bundle.streams, 3.2, 0.09), flatMat(DAY.stream, NIGHT.stream, 3)), { receiveShadow: true }));
  group.add(Object.assign(new THREE.Mesh(ribbonGeometry(bundle.rail, 3.4, 0.8), flatMat(DAY.rail, NIGHT.rail, 32)), { receiveShadow: true }));
  group.add(Object.assign(new THREE.Mesh(ribbonGeometry(bundle.aero.taxiways, 23, 0.11), flatMat(DAY.taxiway, NIGHT.taxiway, 3)), { receiveShadow: true }));
  group.add(Object.assign(new THREE.Mesh(ribbonGeometry(bundle.aero.runways.map(r => ({ ...r, w: r.w * 10 })), 61, 0.12), flatMat(DAY.runway, NIGHT.runway, 4)), { receiveShadow: true }));

  await nextFrame('Raising 8,010 buildings…');
  buildBuildings();

  await nextFrame('Planting trees…');
  await buildTrees();

  await nextFrame('Hanging the street lights…');
  buildLamps();

  await nextFrame('Naming places…');
  buildLabels();
  buildChips();
}

// ---------------------------------------------------------------- water
function buildWater() {
  const g = polygonsGeometry(bundle.water);
  if (!g) return;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(DAY.waterDeep) },
    uShallow: { value: new THREE.Color(DAY.waterShallow) },
    uSky: { value: new THREE.Color(DAY.skyHorizon) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlint: { value: 1.0 },
  }]);
  trackColor(uniforms.uDeep.value, DAY.waterDeep, NIGHT.waterDeep);
  trackColor(uniforms.uShallow.value, DAY.waterShallow, NIGHT.waterShallow);
  trackColor(uniforms.uSky.value, DAY.skyHorizon, NIGHT.skyHorizon);
  trackNumber(uniforms.uGlint, 'value', 1.0, 0.35);
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true,
    polygonOffset: true, polygonOffsetFactor: -0.15, polygonOffsetUnits: -9,
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime, uGlint; uniform vec3 uDeep, uShallow, uSky, uSunDir;
      varying vec3 vWPos;
      void main() {
        vec2 p = vWPos.xz;
        float t = uTime;
        // two layers of gentle ripples
        float n = sin(p.x * 0.11 + t * 0.9) * 0.5 + sin(p.y * 0.09 - t * 0.7) * 0.5
                + sin((p.x + p.y) * 0.05 + t * 0.4) * 0.6;
        vec3 N = normalize(vec3(n * 0.018, 1.0, cos(p.x * 0.07 - t * 0.6) * 0.014));
        vec3 V = normalize(cameraPosition - vWPos);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, 0.45 + 0.25 * sin(p.x * 0.004 + p.y * 0.003));
        col = mix(col, uSky, 0.25 + 0.55 * fres);
        vec3 Rr = reflect(-normalize(uSunDir), N);
        float spec = pow(max(dot(Rr, V), 0.0), 160.0) * 0.9 * uGlint;
        col += vec3(1.0, 0.96, 0.88) * spec;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.y = 0.12;
  m.userData.water = true;
  group.add(m);
  waterMat = mat;
}
let waterMat = null;

// ---------------------------------------------------------------- buildings
const iconGroup = new THREE.Group();
function buildBuildings() {
  const geos = [];
  const wall = buildingSurface(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0, vertexColors: true }));
  const roofDay = new THREE.Color(DAY.roof);
  // soft pastel wall tints, chosen per building so blocks read as separate buildings
  const TINTS = ['#f6f3ec', '#f3eee5', '#f0eeea', '#f5f0eb', '#eef0f3', '#f4f0e7', '#f2ecee'].map(c => new THREE.Color(c));
  const rnd = mulberry32(7);

  for (const b of bundle.buildings) {
    const k = b.k || '';
    if (k === 'hangar1' || k === 'hangar' || k === 'amphitheatre' || k === 'canopy') { buildIcon(b); continue; }
    if (b.p.length < 6) continue;
    let g;
    try {
      g = new THREE.ExtrudeGeometry(shapeFromFlat(b.p), { depth: b.h, bevelEnabled: false, curveSegments: 1 });
    } catch (e) { continue; }
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(n).fill(rnd()), 1));
    g.setAttribute('bh', new THREE.BufferAttribute(new Float32Array(n).fill(b.h), 1));
    // vertex colours carry the daytime tint: roofs soft white, walls a pastel picked per building
    const col = new Float32Array(n * 3);
    const nor = g.attributes.normal;
    const tint = TINTS[Math.floor(rnd() * TINTS.length)];
    for (let i = 0; i < n; i++) {
      const c = nor.getY(i) > 0.5 ? roofDay : tint;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(merged, wall);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.add(iconGroup);
}

function buildIcon(b) {
  const box = fitBox(b.p);
  if (b.k === 'hangar1' || b.k === 'hangar') {
    // Hangar One: a 345 m long, 94 m wide, 61 m tall catenary arch, re-skinned in silver.
    // Hangars 2 and 3: the wooden WWII blimp hangars, a rounder, flatter arch.
    const silver = b.k === 'hangar1';
    const W = box.wid, H = b.h, L = box.len;
    const s = new THREE.Shape();
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const u = -1 + 2 * i / N;
      const y = H * Math.pow(Math.max(0, 1 - u * u), silver ? 0.62 : 0.5);
      if (i === 0) s.moveTo(u * W / 2, 0); else s.lineTo(u * W / 2, y);
    }
    s.lineTo(W / 2, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: 1 });
    g.rotateY(Math.PI / 2); // extrude along +x (length)
    g.translate(-L / 2, 0, 0);
    const mat = silver
      ? new THREE.MeshStandardMaterial({ color: DAY.hangar1, roughness: 0.38, metalness: 0.55 })
      : new THREE.MeshStandardMaterial({ color: DAY.hangar, roughness: 0.9, metalness: 0.0 });
    trackColor(mat.color, silver ? DAY.hangar1 : DAY.hangar, silver ? NIGHT.hangar1 : NIGHT.hangar);
    const m = placeOnBox(new THREE.Mesh(g, mat), box);
    m.castShadow = m.receiveShadow = true;
    iconGroup.add(m);
    // door frames at both ends: thin dark portals
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3, H * 0.92, W * 0.86), new THREE.MeshStandardMaterial({ color: 0x5a6069, roughness: 0.8 }));
    for (const sgn of [-1, 1]) {
      const f = frame.clone(); f.position.set(sgn * (L / 2 - 1.2), H * 0.46, 0); m.add(f);
    }
    return;
  }
  if (b.k === 'amphitheatre') {
    // Shoreline Amphitheatre: a white tensile tent with two masts over an elliptical plan
    const a = box.len / 2, c = box.wid / 2, H = b.h;
    const nr = 26, nt = 72;
    const pos = [], idx = [];
    const peak = (u, v, px) => Math.exp(-((u - px) * (u - px) + v * v) / 0.07);
    for (let i = 0; i <= nr; i++) {
      const r = i / nr;
      for (let j = 0; j <= nt; j++) {
        const th = 2 * Math.PI * j / nt;
        const u = r * Math.cos(th), v = r * Math.sin(th);
        const edge = Math.pow(Math.max(0, 1 - r * r), 0.45);
        const h = 5.5 + (H - 5.5) * Math.max(peak(u, v, -0.42), peak(u, v, 0.42)) * (0.35 + 0.65 * edge) + 4.0 * edge;
        pos.push(u * a, h, v * c);
      }
    }
    for (let i = 0; i < nr; i++) for (let j = 0; j < nt; j++) {
      const q = i * (nt + 1) + j;
      idx.push(q, q + nt + 1, q + 1, q + 1, q + nt + 1, q + nt + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: DAY.tent, roughness: 0.55, side: THREE.DoubleSide, emissive: 0xfff1d6, emissiveIntensity: 0 });
    trackColor(mat.color, DAY.tent, NIGHT.tent);
    trackNumber(mat, 'emissiveIntensity', 0, 0.35);
    const m = placeOnBox(new THREE.Mesh(g, mat), box);
    m.castShadow = m.receiveShadow = true;
    iconGroup.add(m);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5, metalness: 0.3 });
    for (const px of [-0.42, 0.42]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, H + 8, 10), mastMat);
      mast.position.set(px * a, (H + 8) / 2, 0);
      mast.castShadow = true;
      m.add(mast);
    }
    // stage house behind the tent
    const stage = new THREE.Mesh(new THREE.BoxGeometry(a * 0.9, 12, 24), new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.9 }));
    stage.position.set(0, 6, -c - 12); stage.castShadow = stage.receiveShadow = true; m.add(stage);
    return;
  }
  if (b.k === 'canopy') {
    // Google Bay View: a glass base with an undulating dragonscale-solar canopy
    const base = new THREE.ExtrudeGeometry(shapeFromFlat(b.p), { depth: 10, bevelEnabled: false, curveSegments: 1 });
    base.rotateX(-Math.PI / 2);
    const glass = new THREE.MeshStandardMaterial({ color: DAY.glass, roughness: 0.25, metalness: 0.3 });
    trackColor(glass.color, DAY.glass, NIGHT.glass);
    const bm = new THREE.Mesh(base, glass);
    bm.castShadow = bm.receiveShadow = true;
    iconGroup.add(bm);
    const canopyMat = new THREE.MeshStandardMaterial({ color: DAY.canopy, roughness: 0.5, metalness: 0.25 });
    trackColor(canopyMat.color, DAY.canopy, NIGHT.canopy);
    // bells on a grid inside the footprint
    const pts = [];
    for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i] / 10, b.p[i + 1] / 10]);
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
    const spacing = 34;
    const profile = [];
    for (let i = 0; i <= 14; i++) { const r = i / 14; profile.push(new THREE.Vector2(r * 24, (b.h - 10) * Math.pow(1 - r * r, 1.6))); }
    profile.push(new THREE.Vector2(24, 0));
    const bell = new THREE.LatheGeometry(profile, 28);
    let row = 0;
    for (let y = minY + spacing * 0.5; y < maxY; y += spacing * 0.86, row++) {
      for (let x = minX + spacing * (0.5 + (row % 2) * 0.5); x < maxX; x += spacing) {
        if (!inside(x, y) || !inside(x + 14, y) || !inside(x - 14, y) || !inside(x, y + 14) || !inside(x, y - 14)) continue;
        const m = new THREE.Mesh(bell, canopyMat);
        m.position.set(x, 10, -y);
        m.castShadow = m.receiveShadow = true;
        iconGroup.add(m);
      }
    }
    return;
  }
}

// ---------------------------------------------------------------- trees
// Seven species, each an instanced crown + trunk. Placement comes from an occupancy raster
// (buildings, roads, water block trees) and a "near buildings" mask that marks back yards.
const SPECIES = {
  oak:         { crown: 'round', r: 3.6, h: 6.8, trunkH: 3.0, trunkR: 0.40, colors: ['#549a4a', '#458a40', '#62a452', '#4d8e45'] },
  liquidambar: { crown: 'round', r: 2.7, h: 7.4, trunkH: 3.6, trunkR: 0.30, colors: ['#c96a2e', '#d98a35', '#a84b2b', '#dfa63a', '#b7722c'] },
  redwood:     { crown: 'cone',  r: 2.7, h: 17,  trunkH: 2.6, trunkR: 0.55, colors: ['#2f5f3b', '#386b43', '#2a553a'] },
  cypress:     { crown: 'cone',  r: 0.95, h: 9,  trunkH: 1.0, trunkR: 0.22, colors: ['#35613c', '#2e5737'] },
  eucalyptus:  { crown: 'tall',  r: 3.3, h: 11,  trunkH: 6.0, trunkR: 0.42, colors: ['#7d9b78', '#8aa585', '#6f8f6c'] },
  palm:        { crown: 'palm',  r: 2.8, h: 2.0, trunkH: 9.5, trunkR: 0.30, colors: ['#4f904b', '#5b9b53', '#468844'] },
  small:       { crown: 'round', r: 1.9, h: 3.6, trunkH: 1.7, trunkR: 0.18, colors: ['#8fba6c', '#a3c57c', '#e8bccb', '#f0d2dc', '#9ec47a'] },
};
const NIGHT_TREE = new THREE.Color(0.30, 0.36, 0.46); // crowns settle to a moonlit blue-green
const treeMeshes = [];

function crownGeometry(sp) {
  let g;
  const detail = DENSE ? 2 : 1;
  if (sp.crown === 'cone') {
    // a softly bulging conifer: lathe of a curved profile, smooth-shaded
    const prof = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(sp.r * Math.pow(1 - t, 0.75) * (1 + 0.12 * Math.sin(t * 9)), sp.h * t)); }
    prof.push(new THREE.Vector2(0, sp.h));
    g = new THREE.LatheGeometry(prof, 12);
    g.translate(0, sp.trunkH, 0);
  } else if (sp.crown === 'palm') {
    const parts = [];
    for (let i = 0; i < 8; i++) {
      const f = new THREE.BoxGeometry(0.55, 0.10, sp.r * 1.7);
      f.translate(0, 0, sp.r * 0.75);
      f.rotateX(0.55);
      f.rotateY(i * Math.PI / 4 + 0.2);
      parts.push(f.toNonIndexed());
    }
    parts.push(new THREE.IcosahedronGeometry(0.7, 0));
    g = mergeGeometries(parts, false);
    g.translate(0, sp.trunkH + 0.3, 0);
  } else {
    // a puffy crown: one main sphere and three lobes, merged
    const parts = [];
    const main = new THREE.IcosahedronGeometry(sp.r, detail);
    main.scale(1, sp.h / (2 * sp.r), 1);
    parts.push(main);
    const lobes = sp.crown === 'tall' ? [[0.35, 0.25, 0.3], [-0.4, -0.05, -0.25], [0.1, -0.3, 0.45]] : [[0.5, 0.15, 0.2], [-0.45, 0.05, -0.35], [0.05, -0.2, 0.55], [-0.2, 0.45, 0.1]];
    for (const [lx, ly, lz] of lobes) {
      const lobe = new THREE.IcosahedronGeometry(sp.r * 0.62, Math.max(1, detail - 1));
      lobe.scale(1, sp.h / (2 * sp.r) * 0.9, 1);
      lobe.translate(lx * sp.r, ly * sp.h, lz * sp.r);
      parts.push(lobe);
    }
    g = mergeGeometries(parts, false);
    // random bumps, keyed to position so shared edges stay sealed
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const hsh = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
      const k = 1 + ((hsh - Math.floor(hsh)) - 0.5) * 0.16;
      pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
    }
    g.computeVertexNormals();
    g.translate(0, sp.trunkH + sp.h / 2 - 0.2, 0);
  }
  return g;
}

function pickSpecies(mix, rnd) {
  let r = rnd(), acc = 0;
  for (const [name, w] of mix) { acc += w; if (r < acc) return name; }
  return mix[mix.length - 1][0];
}

async function buildTrees() {
  const px = 3;
  const W = Math.ceil((bounds[2] - bounds[0]) / px), H = Math.ceil((bounds[3] - bounds[1]) / px);
  const X = x => (x - bounds[0]) / px, Y = y => (bounds[3] - y) / px;
  const makeCanvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const pathPoly = (cx, p) => { cx.beginPath(); for (let i = 0; i < p.length; i += 2) { const x = X(p[i] / 10), y = Y(p[i + 1] / 10); i ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.closePath(); };
  const pathLine = (cx, p) => { cx.beginPath(); for (let i = 0; i < p.length; i += 2) { const x = X(p[i] / 10), y = Y(p[i + 1] / 10); i ? cx.lineTo(x, y) : cx.moveTo(x, y); } };

  // occupancy: white = free land
  const occ = makeCanvas(); const oc = occ.getContext('2d');
  oc.fillStyle = '#fff'; oc.fillRect(0, 0, W, H);
  oc.fillStyle = '#000'; oc.strokeStyle = '#000'; oc.lineCap = 'round'; oc.lineJoin = 'round';
  for (const b of bundle.buildings) { pathPoly(oc, b.p); oc.fill(); }
  for (const w of bundle.water) { pathPoly(oc, w.p); oc.fill(); }
  for (const w of bundle.wetland) { pathPoly(oc, w.p); oc.fill(); }
  for (const a of bundle.aero.aprons) { pathPoly(oc, a.p); oc.fill(); }
  const RW = { mw: 32, mwl: 18, tr: 24, trl: 14, pr: 22, prl: 14, se: 18, sel: 12, te: 15, tel: 11, re: 12, pe: 7, cy: 10 };
  for (const r of bundle.roads) { oc.lineWidth = Math.max(1, (RW[r.c] || 8) / px); pathLine(oc, r.p); oc.stroke(); }
  // the bike route (ramps, footways and lot aisles the map does not draw) stays clear of trees
  if (routeData) for (const v of Object.values(routeData.variants)) {
    oc.lineWidth = 13 / px; oc.beginPath();
    for (let i = 0; i < v.points.length; i += 2) { const x = X(v.points[i]), y = Y(v.points[i + 1]); i ? oc.lineTo(x, y) : oc.moveTo(x, y); }
    oc.stroke();
  }
  for (const r of bundle.rail) { oc.lineWidth = 10 / px; pathLine(oc, r.p); oc.stroke(); }
  for (const r of bundle.aero.runways) { oc.lineWidth = 90 / px; pathLine(oc, r.p); oc.stroke(); }
  for (const r of bundle.aero.taxiways) { oc.lineWidth = 36 / px; pathLine(oc, r.p); oc.stroke(); }
  const occImg = oc.getImageData(0, 0, W, H).data;
  // yards: land within ~22 m of a building
  const near = makeCanvas(); const nc = near.getContext('2d');
  nc.fillStyle = '#000'; nc.fillRect(0, 0, W, H);
  nc.strokeStyle = '#fff'; nc.fillStyle = '#fff'; nc.lineJoin = 'round'; nc.lineWidth = 44 / px;
  for (const b of bundle.buildings) { pathPoly(nc, b.p); nc.stroke(); }
  const nearImg = nc.getImageData(0, 0, W, H).data;
  const sample = (img, x, y) => {
    const i = Math.floor(X(x)), j = Math.floor(Y(y));
    if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) return false;
    return img[(j * W + i) * 4] > 128;
  };
  const free = (x, y) => sample(occImg, x, y) && sample(occImg, x + px, y) && sample(occImg, x, y - px);
  const inYard = (x, y) => sample(nearImg, x, y);
  occupancy.free = free;
  await nextFrame();

  const rnd = mulberry32(1337);
  const budget = DENSE ? 52000 : 17000;
  const spots = []; // {x, y, sp, s}
  const put = (x, y, sp) => { spots.push({ x, y, sp, s: 0.8 + rnd() * 0.45, rot: rnd() * 6.283, c: rnd() }); };

  // streets: species depend on the kind of street
  const BLVD = [['palm', 0.24], ['oak', 0.40], ['liquidambar', 0.18], ['small', 0.18]];
  const STREET = [['oak', 0.40], ['liquidambar', 0.24], ['small', 0.18], ['redwood', 0.08], ['cypress', 0.05], ['palm', 0.05]];
  const TRAIL = [['oak', 0.45], ['eucalyptus', 0.25], ['redwood', 0.15], ['small', 0.15]];
  const STREET_CFG = { pr: [11.5, 22, BLVD], se: [9.5, 20, BLVD], te: [9.5, 19, STREET], re: [7.5, 17, STREET], pe: [4.5, 16, [['small', 0.5], ['oak', 0.5]]], cy: [6.5, 14, TRAIL] };
  for (const r of bundle.roads) {
    const cfg = STREET_CFG[r.c]; if (!cfg) continue;
    const [off, gapBase, mix] = cfg; const gap = DENSE ? gapBase : gapBase * 1.5;
    const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    let carry = rnd() * gap;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 1) continue;
      const nx = -dy / len, ny = dx / len;
      for (let d = carry; d < len; d += gap) {
        const t = d / len, x = x0 + dx * t, y = y0 + dy * t;
        for (const sgn of [-1, 1]) {
          if (rnd() > 0.66) continue;
          const tx = x + nx * off * sgn + (rnd() - 0.5) * 2, ty = y + ny * off * sgn + (rnd() - 0.5) * 2;
          if (free(tx, ty)) put(tx, ty, pickSpecies(mix, rnd));
        }
      }
      carry = ((carry - len) % gap + gap) % gap;
    }
  }
  const streetCount = spots.length;

  // parks: groves; the very large open parks (Shoreline) get meadows with scattered trees
  const PARK = [['oak', 0.38], ['redwood', 0.22], ['eucalyptus', 0.20], ['liquidambar', 0.08], ['small', 0.12]];
  for (const park of bundle.parks) {
    const pts = []; for (let i = 0; i < park.p.length; i += 2) pts.push([park.p[i] / 10, park.p[i + 1] / 10]);
    const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
    const area = (maxX - minX) * (maxY - minY);
    const step = (area > 1.2e6 ? 30 : 15) * (DENSE ? 1 : 1.5);
    const keep = area > 1.2e6 ? 0.55 : 0.8;
    for (let y = minY; y < maxY; y += step) for (let x = minX; x < maxX; x += step) {
      const jx = x + (rnd() - 0.5) * step, jy = y + (rnd() - 0.5) * step;
      if (rnd() > keep || !pointInPoly(jx, jy, pts) || !free(jx, jy)) continue;
      put(jx, jy, pickSpecies(PARK, rnd));
    }
  }

  // creeks: riparian corridors
  const CREEK = [['oak', 0.45], ['eucalyptus', 0.30], ['redwood', 0.15], ['small', 0.10]];
  for (const st of bundle.streams) {
    const pts = []; for (let i = 0; i < st.p.length; i += 2) pts.push([st.p[i] / 10, st.p[i + 1] / 10]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 1) continue;
      const nx = -dy / len, ny = dx / len;
      for (let d = rnd() * 10; d < len; d += DENSE ? 11 : 18) {
        const t = d / len, x = x0 + dx * t, y = y0 + dy * t;
        for (const sgn of [-1, 1]) {
          if (rnd() > 0.7) continue;
          const off = 4 + rnd() * 7;
          const tx = x + nx * off * sgn, ty = y + ny * off * sgn;
          if (free(tx, ty)) put(tx, ty, pickSpecies(CREEK, rnd));
        }
      }
    }
  }

  // yards: the leafy residential canopy between the houses
  const YARD = [['oak', 0.34], ['small', 0.24], ['liquidambar', 0.14], ['redwood', 0.10], ['palm', 0.07], ['cypress', 0.06], ['eucalyptus', 0.05]];
  const yardStep = DENSE ? 15 : 24, yardKeep = DENSE ? 0.42 : 0.3;
  const remaining = budget - spots.length;
  const yardCandidates = [];
  for (let y = bounds[1]; y < bounds[3]; y += yardStep) for (let x = bounds[0]; x < bounds[2]; x += yardStep) {
    if (rnd() > yardKeep) continue;
    const jx = x + (rnd() - 0.5) * yardStep, jy = y + (rnd() - 0.5) * yardStep;
    if (!inYard(jx, jy) || !free(jx, jy)) continue;
    yardCandidates.push(jx, jy);
  }
  const yardN = Math.min(remaining, yardCandidates.length / 2);
  for (let i = 0; i < yardN; i++) put(yardCandidates[i * 2], yardCandidates[i * 2 + 1], pickSpecies(YARD, rnd));
  await nextFrame();

  // instanced meshes per species
  const windUniform = { value: 0 };
  const bySpecies = {};
  for (const sp of spots) (bySpecies[sp.sp] ||= []).push(sp);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [name, list] of Object.entries(bySpecies)) {
    const sp = SPECIES[name];
    const crownGeo = crownGeometry(sp);
    const trunkGeo = new THREE.CylinderGeometry(sp.trunkR * 0.75, sp.trunkR, sp.trunkH + 0.4, 6);
    trunkGeo.translate(0, (sp.trunkH + 0.4) / 2, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: false });
    const crownY = sp.trunkH + sp.h / 2, crownBottom = sp.trunkH, crownTop = sp.trunkH + sp.h;
    crownMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = windUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind; varying float vCrownT;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          // soften: pull normals toward a sphere around the crown so facets read as one round mass
          ${sp.crown === 'palm' ? '' : `objectNormal = normalize(mix(objectNormal, normalize(position - vec3(0.0, ${crownY.toFixed(2)}, 0.0)), 0.8));`}
          vCrownT = clamp((position.y - ${crownBottom.toFixed(2)}) / ${(crownTop - crownBottom).toFixed(2)}, 0.0, 1.0);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = instanceMatrix[3].xyz;
          float sway = sin(uWind * 1.1 + ip.x * 0.031 + ip.z * 0.027) * 0.22 + sin(uWind * 2.3 + ip.z * 0.05) * 0.08;
          float lift = max(0.0, transformed.y - ${(sp.trunkH * 0.6).toFixed(2)}) / ${(sp.trunkH + sp.h).toFixed(2)};
          transformed.x += sway * lift * ${sp.crown === 'palm' ? '1.6' : '1.0'};
          transformed.z += sway * 0.5 * lift;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vCrownT;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          // lighter crown top, shaded underside
          diffuseColor.rgb *= mix(0.70, 1.10, smoothstep(0.0, 1.0, vCrownT));`);
    };
    const trunkMat = new THREE.MeshStandardMaterial({ color: name === 'eucalyptus' ? 0xbfb2a0 : (name === 'palm' ? 0x9c8a70 : 0x7d6850), roughness: 1 });
    trackColor(trunkMat.color, trunkMat.color.getHexString() ? '#' + trunkMat.color.getHexString() : DAY.trunk, NIGHT.trunk);
    const crown = new THREE.InstancedMesh(crownGeo, crownMat, list.length);
    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const dayCols = new Float32Array(list.length * 3);
    const palette = sp.colors.map(c => new THREE.Color(c));
    const tmp = new THREE.Color();
    list.forEach((t, i) => {
      pos.set(t.x, 0, -t.y);
      const wobble = 0.85 + t.c * 0.3;
      sc.set(t.s * wobble, t.s, t.s * (1.15 - t.c * 0.3));
      q.setFromAxisAngle(up, t.rot);
      m.compose(pos, q, sc);
      crown.setMatrixAt(i, m); trunk.setMatrixAt(i, m);
      tmp.copy(palette[Math.floor(t.c * palette.length) % palette.length]);
      tmp.offsetHSL(0, 0, (t.s - 1.0) * 0.08);
      crown.setColorAt(i, tmp);
      dayCols[i * 3] = tmp.r; dayCols[i * 3 + 1] = tmp.g; dayCols[i * 3 + 2] = tmp.b;
    });
    crown.castShadow = true; crown.receiveShadow = true; trunk.castShadow = true;
    group.add(crown, trunk);
    treeMeshes.push({ crown, trunk, dayCols });
  }
  lerps.push({
    kind: 'fn', apply: (t) => {
      const tmp = new THREE.Color();
      const kr = 1 - t + t * NIGHT_TREE.r, kg = 1 - t + t * NIGHT_TREE.g, kb = 1 - t + t * NIGHT_TREE.b;
      for (const tm of treeMeshes) {
        const d = tm.dayCols, n = tm.crown.count;
        for (let i = 0; i < n; i++) {
          tmp.setRGB(d[i * 3] * kr, d[i * 3 + 1] * kg, d[i * 3 + 2] * kb);
          tm.crown.setColorAt(i, tmp);
        }
        tm.crown.instanceColor.needsUpdate = true;
      }
    }
  });
  trees.wind = windUniform;
  trees.count = spots.length;
  trees.streetCount = streetCount;

  // ground greening: a soft green wash under every canopy so leafy neighbourhoods read from above
  paintGround(spots);
}

function paintGround(spots) {
  const size = DENSE ? 4096 : 2048;
  const margin = 300;
  const gx0 = bounds[0] - margin, gy0 = bounds[1] - margin, gx1 = bounds[2] + margin, gy1 = bounds[3] + margin;
  const gw = gx1 - gx0, gh = gy1 - gy0;
  const c = document.createElement('canvas'); c.width = size; c.height = Math.round(size * gh / gw);
  const x = c.getContext('2d');
  x.fillStyle = DAY.land; x.fillRect(0, 0, c.width, c.height);
  const sx = c.width / gw, sy = c.height / gh;
  // blob sprite
  const sp = document.createElement('canvas'); sp.width = sp.height = 64;
  const sx2 = sp.getContext('2d');
  const grd = sx2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(118,168,96,0.16)'); grd.addColorStop(0.6, 'rgba(118,168,96,0.07)'); grd.addColorStop(1, 'rgba(118,168,96,0)');
  sx2.fillStyle = grd; sx2.fillRect(0, 0, 64, 64);
  const R = 30; // metres
  for (const t of spots) {
    const px = (t.x - gx0) * sx, py = (gy1 - t.y) * sy;
    const r = R * (0.8 + t.s * 0.4);
    x.drawImage(sp, px - r * sx, py - r * sy, 2 * r * sx, 2 * r * sy);
  }
  // a fine grain so lawns and lots do not read as flat paper up close
  const grain = document.createElement('canvas'); grain.width = grain.height = 256;
  const gx = grain.getContext('2d'); const gi = gx.createImageData(256, 256);
  for (let i = 0; i < gi.data.length; i += 4) { const v = 118 + Math.random() * 40; gi.data[i] = v; gi.data[i + 1] = v + 6; gi.data[i + 2] = v - 8; gi.data[i + 3] = 22; }
  gx.putImageData(gi, 0, 0);
  x.fillStyle = x.createPattern(grain, 'repeat'); x.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 1 });
  const day = new THREE.Color(DAY.land), night = new THREE.Color(NIGHT.land);
  const mult = new THREE.Color(night.r / day.r, night.g / day.g, night.b / day.b);
  trackColor(mat.color, '#ffffff', '#' + mult.getHexString());
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((gx0 + gx1) / 2, 0.0, -(gy0 + gy1) / 2);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function pointInPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- street lights (night)
function lampSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,236,200,1)'); g.addColorStop(0.18, 'rgba(255,214,150,0.85)');
  g.addColorStop(0.5, 'rgba(255,190,110,0.22)'); g.addColorStop(1, 'rgba(255,170,90,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildLamps() {
  // every street gets lamps on alternating sides; arterials are brighter and more frequent
  const spots = [], sizes = [];
  const CLASSES = { mw: [19, 40, 1.35], mwl: [12, 50, 1.1], tr: [14, 42, 1.3], trl: [9, 50, 1.0], pr: [13, 42, 1.25], prl: [8, 50, 1.0],
                    se: [11, 44, 1.15], sel: [7, 50, 1.0], te: [9.5, 46, 1.05], tel: [7, 50, 1.0], re: [7.5, 52, 0.9], pe: [4.5, 60, 0.7] };
  const rnd = mulberry32(99);
  for (const r of bundle.roads) {
    const cfg = CLASSES[r.c]; if (!cfg) continue;
    const [off, gap, size] = cfg;
    const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    let d = 8 + rnd() * gap * 0.6, k = Math.floor(rnd() * 2);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 0.5) continue;
      const nx = -dy / len, ny = dx / len;
      for (; d < len; d += gap, k++) {
        const t = d / len, sgn = (k % 2) ? 1 : -1;
        const mx = x0 + dx * t + nx * off * sgn, my = y0 + dy * t + ny * off * sgn;
        if (!occupancy.free(mx, my)) continue;   // would stand on the other carriageway
        spots.push(mx, 7.5, -my);
        sizes.push(size * (0.9 + rnd() * 0.2));
      }
      d -= len;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(spots, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({ map: lampSprite(), color: 0xffd9a6, size: 10, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSize;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;')
      .replace('#include <logdepthbuf_vertex>', 'gl_PointSize = min(gl_PointSize, 34.0);\n#include <logdepthbuf_vertex>');
  };
  trackNumber(mat, 'opacity', 0, 1.0);
  const mesh = new THREE.Points(geo, mat);
  mesh.frustumCulled = false;
  group.add(mesh);
  lamps.mesh = mesh;
  lamps.count = sizes.length;

  // physical posts under the arterial lamps: pole, arm and head, visible by day
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.11, 7.2, 6).translate(0, 3.6, 0).toNonIndexed(),
    new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0.8, 7.2, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.5, 0.14, 0.22).translate(1.55, 7.2, 0).toNonIndexed(),
  ], false);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8e9299, roughness: 0.7, metalness: 0.3 });
  const posts = [];
  for (const r of bundle.roads) {
    if (!['mw', 'tr', 'pr', 'se', 'te'].includes(r.c)) continue;
    const [off, gap] = CLASSES[r.c];
    const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    let d = 8 + rnd() * gap * 0.6, k = Math.floor(rnd() * 2);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 0.5) continue;
      const nx = -dy / len, ny = dx / len;
      for (; d < len; d += gap, k++) {
        const t = d / len, sgn = (k % 2) ? 1 : -1;
        const mx = x0 + dx * t + nx * (off + 0.3) * sgn, my = y0 + dy * t + ny * (off + 0.3) * sgn;
        if (!occupancy.free(mx, my)) continue;
        posts.push(mx, -my, Math.atan2(-nx * sgn, -ny * sgn));
      }
      d -= len;
    }
  }
  const postCount = Math.min(DENSE ? 7000 : 2500, posts.length / 3);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, postCount);
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), py = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  for (let i = 0; i < postCount; i++) {
    pv.set(posts[i * 3], 0, posts[i * 3 + 1]);
    // arm points toward the road
    pq.setFromAxisAngle(py, posts[i * 3 + 2] + Math.PI / 2);
    pm.compose(pv, pq, one); poles.setMatrixAt(i, pm);
  }
  poles.castShadow = true;
  group.add(poles);

  // dashed centre lines on arterials
  const dashGeo = new THREE.BoxGeometry(2.6, 0.03, 0.14);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf3efe2, roughness: 1 });
  trackColor(dashMat.color, '#f3efe2', '#7d7f8a');
  const dashes = [];
  const ROAD_Y = { te: 0.14 + 4 * 0.045 + 0.02, se: 0.14 + 6 * 0.045 + 0.02, pr: 0.14 + 8 * 0.045 + 0.02, tr: 0.14 + 10 * 0.045 + 0.02, mw: 0.14 + 12 * 0.045 + 0.02 };
  for (const r of bundle.roads) {
    const y = ROAD_Y[r.c]; if (y === undefined) continue;
    const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    let d = 3;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 0.5) continue;
      for (; d < len; d += 7.5) { const t = d / len; dashes.push(x0 + dx * t, y + 0.03, -(y0 + dy * t), Math.atan2(-dy, dx)); }
      d -= len;
    }
  }
  const dashCount = Math.min(DENSE ? 30000 : 9000, dashes.length / 4);
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  for (let i = 0; i < dashCount; i++) {
    pv.set(dashes[i * 4], dashes[i * 4 + 1], dashes[i * 4 + 2]);
    pq.setFromAxisAngle(py, dashes[i * 4 + 3]);
    pm.compose(pv, pq, one); dashMesh.setMatrixAt(i, pm);
  }
  group.add(dashMesh);
}

// ---------------------------------------------------------------- labels and views
const LANDMARKS = [
  { name: 'Googleplex', lat: 37.4221, lon: -122.0841 },
  { name: 'Google Bay View', lat: 37.4214, lon: -122.0655 },
  { name: 'Shoreline Amphitheatre', lat: 37.4268, lon: -122.0808 },
  { name: 'Shoreline Lake', lat: 37.4332, lon: -122.0905, minor: true },
  { name: 'Hangar One', lat: 37.4130, lon: -122.0540 },
  { name: 'Moffett Federal Airfield', lat: 37.4175, lon: -122.0480, minor: true },
  { name: 'Computer History Museum', lat: 37.4144, lon: -122.0774, minor: true },
  { name: 'Downtown · Castro Street', lat: 37.3895, lon: -122.0819 },
  { name: 'Caltrain · Transit Center', lat: 37.3943, lon: -122.0760, minor: true },
  { name: 'Rengstorff Park', lat: 37.4028, lon: -122.0957, minor: true },
  { name: 'Cuesta Park', lat: 37.3722, lon: -122.0670, minor: true },
  { name: 'San Antonio', lat: 37.4074, lon: -122.1072, minor: true },
  { name: 'LinkedIn', lat: 37.3925, lon: -122.0470, minor: true },
  { name: 'Intuit', lat: 37.4300, lon: -122.0975, minor: true },
  { name: 'Stevens Creek', lat: 37.3760, lon: -122.0640, minor: true },
];
function buildLabels() {
  for (const l of LANDMARKS) {
    const { x, y } = toLocal(l.lon, l.lat);
    const div = document.createElement('div');
    div.className = 'label' + (l.minor ? ' minor' : '');
    div.textContent = l.name;
    const obj = new CSS2DObject(div);
    obj.position.set(x, l.minor ? 14 : 28, -y);
    obj.userData.minor = !!l.minor;
    scene.add(obj);
    labelObjects.push(obj);
  }
}

const VIEWS = {
  overview: { label: 'Overview', lat: 37.405, lon: -122.078, dist: 5600, bearing: 15, pitch: 55 },
  downtown: { label: 'Downtown', lat: 37.3905, lon: -122.0815, dist: 950, bearing: 25, pitch: 50 },
  googleplex: { label: 'Googleplex', lat: 37.4222, lon: -122.0845, dist: 1150, bearing: 335, pitch: 47 },
  bayview: { label: 'Bay View', lat: 37.4214, lon: -122.0655, dist: 950, bearing: 300, pitch: 44 },
  shoreline: { label: 'Shoreline', lat: 37.4272, lon: -122.0812, dist: 1050, bearing: 10, pitch: 46 },
  moffett: { label: 'Moffett Field', lat: 37.4150, lon: -122.0500, dist: 2300, bearing: 330, pitch: 42 },
};
function viewPose(v) {
  const { x, y } = toLocal(v.lon, v.lat);
  const target = new THREE.Vector3(x, 0, -y);
  const b = THREE.MathUtils.degToRad(v.bearing), p = THREE.MathUtils.degToRad(v.pitch);
  const off = new THREE.Vector3(-Math.sin(b) * Math.cos(p), Math.sin(p), Math.cos(b) * Math.cos(p)).multiplyScalar(v.dist);
  return { target, position: target.clone().add(off) };
}
let fly = null;
function flyTo(key) {
  const v = VIEWS[key]; if (!v) return;
  const to = viewPose(v);
  if (reduceMotion) { camera.position.copy(to.position); controls.target.copy(to.target); controls.update(); return; }
  fly = { from: { position: camera.position.clone(), target: controls.target.clone() }, to, t0: performance.now(), dur: 1500 };
  for (const el of elChips.children) el.classList.toggle('active', el.dataset.view === key);
}
function buildChips() {
  for (const [key, v] of Object.entries(VIEWS)) {
    const b = document.createElement('button');
    b.className = 'pill'; b.type = 'button'; b.textContent = v.label; b.dataset.view = key;
    b.addEventListener('click', () => flyTo(key));
    elChips.appendChild(b);
  }
}

// ---------------------------------------------------------------- sun position (NOAA approximation)
function sunPosition(date, lat, lon) {
  const rad = Math.PI / 180;
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const GMST = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const H = (GMST * 15 + lon) * rad - RA;
  const el = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat * rad) - Math.sin(lat * rad) * Math.cos(H));
  return { elevation: el / rad, azimuth: ((az / rad) + 360) % 360 };
}
function dirFromSky(azDeg, elDeg) {
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(Math.max(elDeg, 8));
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}
const sunDirDay = new THREE.Vector3(), sunDirNight = dirFromSky(120, 42), sunDir = new THREE.Vector3();
function updateSunDirDay() {
  // a fixed early-afternoon sun: short soft shadows, walls never fall into deep shade
  sunDirDay.copy(dirFromSky(208, 58));
}
updateSunDirDay();

// ---------------------------------------------------------------- phase (day / night)
let phaseTarget = 0, phaseNow = -1, phaseFrom = 0, phaseT0 = 0;
const PHASE_DUR = 1700;
function isNightNow() {
  const s = sunPosition(new Date(), ORIGIN.lat, ORIGIN.lon);
  return s.elevation < -2;
}
function setPhase(night, immediate = false) {
  phaseTarget = night ? 1 : 0;
  document.documentElement.dataset.phase = night ? 'night' : 'day';
  elPhase.setAttribute('aria-pressed', String(night));
  document.querySelector('meta[name=theme-color]').content = night ? '#0b0e16' : '#dfe8f3';
  if (immediate || reduceMotion) { phaseNow = phaseTarget; applyAll(phaseNow); return; }
  phaseFrom = phaseNow < 0 ? phaseTarget : phaseNow;
  phaseT0 = performance.now();
}
function applyAll(t) {
  applyPhase(t);
  for (const l of lerps) if (l.kind === 'fn') l.apply(t);
  sunDir.copy(sunDirDay).lerp(sunDirNight, t).normalize();
  if (bloomPass) { bloomPass.strength = THREE.MathUtils.lerp(DAY.bloom, NIGHT.bloom, t); bloomPass.enabled = bloomPass.strength > 0.02; }
}
elPhase.addEventListener('click', () => setPhase(phaseTarget < 0.5));

function updateClock() {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
  elClock.innerHTML = `<b>${f.format(new Date())}</b>&nbsp;in Mountain View`;
}
updateClock(); setInterval(updateClock, 30000);

// ---------------------------------------------------------------- post-processing
let composer = null, gtaoPass = null, bloomPass = null;
function setupPost() {
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (!LOW) {
    gtaoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.updateGtaoMaterial({ radius: 9, distanceExponent: 1.2, thickness: 3, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 8 });
    gtaoPass.blendIntensity = 0.85;
    composer.addPass(gtaoPass);
  }
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.0, 0.5, 0.86);
  bloomPass.enabled = false;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

// ---------------------------------------------------------------- ride (opt-in first-person commute)
let ride = null, rideLoading = false;
async function startRide() {
  if (rideLoading) return;
  if (!ride) {
    rideLoading = true;
    elRide.disabled = true;
    try {
      const mod = await import('./mv-ride.js?v=1');
      ride = mod.createRide({ scene, camera, controls, renderer, group, reduceMotion, isNight: () => phaseTarget > 0.5, phase: () => Math.max(0, phaseNow), onExit: () => { fly = null; flyTo('googleplex'); } });
    } finally { rideLoading = false; elRide.disabled = false; }
  }
  fly = null;
  await ride.start();
}
elRide.addEventListener('click', startRide);

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let hidden = false;
document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

function animate() {
  requestAnimationFrame(animate);
  if (hidden || !bundle) return;
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;

  if (fly) {
    const k = Math.min(1, (performance.now() - fly.t0) / fly.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fly.from.position, fly.to.position, e);
    controls.target.lerpVectors(fly.from.target, fly.to.target, e);
    if (k >= 1) fly = null;
  }
  if (ride && ride.active) ride.update(dt, t); else controls.update();

  if (phaseNow !== phaseTarget) {
    const k = Math.min(1, (performance.now() - phaseT0) / PHASE_DUR);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    phaseNow = k >= 1 ? phaseTarget : THREE.MathUtils.lerp(phaseFrom, phaseTarget, e);
    applyAll(phaseNow);
  }

  // sun follows the orbit target so the shadow map stays sharp where you look
  const riding = ride && ride.active;
  const tgt = riding ? camera.position : controls.target;
  const span = riding ? 420 : THREE.MathUtils.clamp(camera.position.distanceTo(tgt) * 1.6, 700, 6500);
  sun.position.copy(tgt).addScaledVector(sunDir, 4000);
  sun.target.position.copy(tgt);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - span) > 50) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
  skyUniforms.uSunDir.value.copy(sunDir);
  sky.position.copy(camera.position);
  if (waterMat) { waterMat.uniforms.uTime.value = t; waterMat.uniforms.uSunDir.value.copy(sunDir); }
  buildingUniforms.uTime.value = t;
  if (trees.wind) trees.wind.value = reduceMotion ? 0 : t;

  // labels: minor ones fade with distance, all hide when very far
  for (const l of labelObjects) {
    const d = camera.position.distanceTo(l.position);
    const show = riding ? (!l.userData.minor && d < 900 && d > 60) : (l.userData.minor ? d < 2600 : d < 7000);
    l.element.style.opacity = show ? '1' : '0';
  }
  if (lamps.mesh) lamps.mesh.visible = phaseNow > 0.02;

  if (composer) composer.render(); else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
  if (gtaoPass) gtaoPass.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
elHome.addEventListener('click', () => flyTo('overview'));

// ---------------------------------------------------------------- go
(async () => {
  try {
    await build();
    setupPost();
    const start = viewPose(VIEWS.overview);
    camera.position.copy(start.position);
    controls.target.copy(start.target);
    controls.update();
    setPhase(isNightNow(), true);
    phaseNow = phaseTarget;
    animate();
    await nextFrame();
    elLoading.classList.add('hidden');
    // a short opening move into the city
    if (!reduceMotion) {
      const from = viewPose({ ...VIEWS.overview, dist: 7600, pitch: 62 });
      camera.position.copy(from.position);
      fly = { from: { position: from.position, target: start.target.clone() }, to: start, t0: performance.now(), dur: 2600 };
    }
  } catch (err) {
    console.error(err);
    elLoadingMsg.textContent = 'Could not load the map. ' + (err && err.message ? err.message : '');
  }
})();
window.__mv3d = { scene, camera, renderer, controls, setPhase, flyTo, sun, startRide, get ride() { return ride; }, get bundle() { return bundle; }, get composer() { return composer; }, get gtao() { return gtaoPass; }, get bloom() { return bloomPass; } };
