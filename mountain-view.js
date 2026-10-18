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
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 4, 40000);
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
  land: '#ede8de', park: '#c6dfb0', wetland: '#d2dcc4', waterDeep: '#86b7e3', waterShallow: '#a9cff0',
  apron: '#d6d3cd', runway: '#c4c2bd', taxiway: '#cfccc6', rail: '#b4b0a7', stream: '#9ec6ea',
  road: {
    re: ['#ffffff', '#d2cdc2'], te: ['#ffffff', '#cdc8bc'], se: ['#ffffff', '#c7c1b5'], sel: ['#ffffff', '#c7c1b5'],
    pr: ['#fbf2d4', '#e0d3ad'], prl: ['#fbf2d4', '#e0d3ad'], tr: ['#f8dea4', '#e0bd70'], trl: ['#f8dea4', '#e0bd70'],
    mw: ['#f7d78f', '#dbb362'], mwl: ['#f8dea4', '#dbb362'], pe: ['#f2efe8', '#dedad0'], cy: ['#e4e0d6', '#e4e0d6'],
  },
  wall: '#f0ede7', roof: '#f9f8f4', googleRoof: '#f4f3ef', hangar1: '#d9dde3', hangar: '#cdbfa8', tent: '#fbfbfa', canopy: '#3b4556', glass: '#a7bccf',
  skyTop: '#6fa8e6', skyHorizon: '#dde8f2', fog: '#dfe8f3', fogNear: 3200, fogFar: 17000,
  hemiSky: '#e4efff', hemiGround: '#e2dacc', hemi: 1.7, sun: '#fff6e8', sunI: 1.9, exposure: 1.0,
  canopyA: '#6aa35a', canopyB: '#4f8f48', trunk: '#8a7256', lit: 0.0, bloom: 0.0, stars: 0.0, lamp: 0.0,
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
  canopyA: '#27412e', canopyB: '#1d3325', trunk: '#25262c', lit: 0.42, bloom: 0.5, stars: 1.0, lamp: 1.0,
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
  const m = new THREE.MeshStandardMaterial({ color: dayHex, roughness: 1.0, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order * 2, ...extra });
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
        if (wall > 0.5 && uLit > 0.001) {
          vec2 cell = vec2(floor(vUvB.x / 3.2), floor(vWPos.y / 3.4));
          vec2 f = vec2(fract(vUvB.x / 3.2), fract(vWPos.y / 3.4));
          float inWin = step(0.24, f.x) * step(f.x, 0.76) * step(0.30, f.y) * step(f.y, 0.78);
          float r = hash12(cell + vSeed * 17.0);
          float slow = hash12(cell * 1.7 + floor(uTime / 23.0 + vSeed));
          float lit = step(1.0 - uLit, r) * step(0.08, slow) * inWin * step(1.2, vWPos.y);
          vec3 warm = vec3(1.0, 0.82, 0.55), cool = vec3(0.78, 0.86, 1.0);
          vec3 wc = mix(warm, cool, step(0.7, hash12(cell * 3.1 + vSeed)));
          totalEmissiveRadiance += wc * lit * 1.9 * uNightTint;
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
const trees = { canopy: null, trunk: null };
const lamps = { mesh: null };

async function nextFrame(msg) {
  if (msg) elLoadingMsg.textContent = msg;
  // setTimeout, not requestAnimationFrame: a background tab must still finish building
  await new Promise(r => setTimeout(r, 0));
}

async function build() {
  bundle = await (await fetch('./assets/mountain-view-map.json?v=2')).json();
  bounds = bundle.bounds.map(v => v / 10);

  await nextFrame('Laying the ground…');
  // ground: big plane, land colour; the world fades into fog beyond the city
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), flatMat(DAY.land, NIGHT.land, 0));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bounds[0] + bounds[2]) / 2, 0, -(bounds[1] + bounds[3]) / 2);
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
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
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
    const spacing = 46;
    const profile = [];
    for (let i = 0; i <= 14; i++) { const r = i / 14; profile.push(new THREE.Vector2(r * 40, (b.h - 10) * Math.pow(1 - r * r, 1.6))); }
    profile.push(new THREE.Vector2(40, 0));
    const bell = new THREE.LatheGeometry(profile, 28);
    let row = 0;
    for (let y = minY + spacing * 0.5; y < maxY; y += spacing * 0.86, row++) {
      for (let x = minX + spacing * (0.5 + (row % 2) * 0.5); x < maxX; x += spacing) {
        if (!inside(x, y) || !inside(x + 18, y) || !inside(x - 18, y) || !inside(x, y + 18) || !inside(x, y - 18)) continue;
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
async function buildTrees() {
  // occupancy raster (3 m per pixel): buildings, roads, water and aprons block trees
  const px = 3;
  const W = Math.ceil((bounds[2] - bounds[0]) / px), H = Math.ceil((bounds[3] - bounds[1]) / px);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
  const X = x => (x - bounds[0]) / px, Y = y => (bounds[3] - y) / px;
  cx.fillStyle = '#000'; cx.strokeStyle = '#000'; cx.lineCap = 'round'; cx.lineJoin = 'round';
  const fillPoly = (p) => { cx.beginPath(); for (let i = 0; i < p.length; i += 2) { const x = X(p[i] / 10), y = Y(p[i + 1] / 10); i ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.closePath(); cx.fill(); };
  const strokeLine = (p, w) => { cx.lineWidth = Math.max(1, w / px); cx.beginPath(); for (let i = 0; i < p.length; i += 2) { const x = X(p[i] / 10), y = Y(p[i + 1] / 10); i ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke(); };
  for (const b of bundle.buildings) fillPoly(b.p);
  for (const w of bundle.water) fillPoly(w.p);
  for (const w of bundle.wetland) fillPoly(w.p);
  for (const a of bundle.aero.aprons) fillPoly(a.p);
  const RW = { mw: 30, mwl: 16, tr: 22, trl: 12, pr: 20, prl: 12, se: 16, sel: 10, te: 13, tel: 9, re: 10, pe: 5, cy: 3 };
  for (const r of bundle.roads) strokeLine(r.p, RW[r.c] || 8);
  for (const r of bundle.rail) strokeLine(r.p, 10);
  for (const r of bundle.aero.runways) strokeLine(r.p, 90);
  for (const r of bundle.aero.taxiways) strokeLine(r.p, 36);
  const img = cx.getImageData(0, 0, W, H).data;
  const free = (x, y) => {
    const i = Math.floor(X(x)), j = Math.floor(Y(y));
    if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) return false;
    return img[(j * W + i) * 4] > 128 && img[(j * W + i + 1) * 4] > 128 && img[((j + 1) * W + i) * 4] > 128;
  };
  await nextFrame();

  const rnd = mulberry32(1337);
  const spots = []; // x, y(north), scale, hue
  const MAX = DENSE ? 22000 : 9000;
  // parks: scattered on a jittered grid
  for (const park of bundle.parks) {
    const pts = []; for (let i = 0; i < park.p.length; i += 2) pts.push([park.p[i] / 10, park.p[i + 1] / 10]);
    const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
    const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
    const step = DENSE ? 17 : 24;
    for (let y = minY; y < maxY; y += step) for (let x = minX; x < maxX; x += step) {
      const jx = x + (rnd() - 0.5) * step, jy = y + (rnd() - 0.5) * step;
      if (rnd() > 0.78 || !pointInPoly(jx, jy, pts) || !free(jx, jy)) continue;
      spots.push(jx, jy, 0.8 + rnd() * 0.6, rnd());
    }
  }
  // streets: residential and tertiary, both sides, with gaps
  const STREET_OFFSET = { re: 7.5, te: 9.5, pe: 4.5 };
  for (const r of bundle.roads) {
    const off = STREET_OFFSET[r.c]; if (!off) continue;
    const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    let carry = rnd() * 20;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 1) continue;
      const nx = -dy / len, ny = dx / len;
      for (let d = carry; d < len; d += DENSE ? 19 : 26) {
        const t = d / len, x = x0 + dx * t, y = y0 + dy * t;
        for (const sgn of [-1, 1]) {
          if (rnd() > 0.62) continue;
          const tx = x + nx * off * sgn + (rnd() - 0.5) * 2, ty = y + ny * off * sgn + (rnd() - 0.5) * 2;
          if (free(tx, ty)) spots.push(tx, ty, 0.65 + rnd() * 0.55, rnd());
        }
      }
      carry = (carry - len) % (DENSE ? 19 : 26); if (carry < 0) carry += DENSE ? 19 : 26;
    }
    if (spots.length / 4 > MAX) break;
  }
  const count = Math.min(MAX, spots.length / 4);

  // geometry: a low-poly crown on a short trunk
  const crownGeo = new THREE.IcosahedronGeometry(3.2, 1);
  crownGeo.scale(1, 0.85, 1);
  crownGeo.translate(0, 6.2, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 4.2, 6);
  trunkGeo.translate(0, 2.1, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: DAY.trunk, roughness: 1 });
  trackColor(trunkMat.color, DAY.trunk, NIGHT.trunk);
  const windUniform = { value: 0 };
  crownMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz;
        float sway = sin(uWind * 1.1 + ip.x * 0.031 + ip.z * 0.027) * 0.22 + sin(uWind * 2.3 + ip.z * 0.05) * 0.08;
        transformed.x += sway * max(0.0, transformed.y - 3.0) / 6.0;
        transformed.z += sway * 0.5 * max(0.0, transformed.y - 3.0) / 6.0;`);
  };
  trees.canopy = new THREE.InstancedMesh(crownGeo, crownMat, count);
  trees.trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const hues = new Float32Array(count);
  const cA = new THREE.Color(DAY.canopyA), cB = new THREE.Color(DAY.canopyB), tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = spots[i * 4], y = spots[i * 4 + 1], sc = spots[i * 4 + 2], hue = spots[i * 4 + 3];
    hues[i] = hue;
    p.set(x, 0, -y); s.set(sc * (0.85 + hue * 0.3), sc, sc * (0.85 + (1 - hue) * 0.3));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hue * 6.283);
    m.compose(p, q, s);
    trees.canopy.setMatrixAt(i, m); trees.trunk.setMatrixAt(i, m);
    tmp.copy(cA).lerp(cB, hue); trees.canopy.setColorAt(i, tmp);
  }
  trees.canopy.castShadow = true; trees.canopy.receiveShadow = true;
  trees.trunk.castShadow = true;
  group.add(trees.canopy, trees.trunk);
  // night re-colour of crowns
  const nA = new THREE.Color(NIGHT.canopyA), nB = new THREE.Color(NIGHT.canopyB);
  lerps.push({
    kind: 'fn', apply: (t) => {
      const a = cA.clone().lerp(nA, t), b = cB.clone().lerp(nB, t);
      for (let i = 0; i < count; i++) { tmp.copy(a).lerp(b, hues[i]); trees.canopy.setColorAt(i, tmp); }
      trees.canopy.instanceColor.needsUpdate = true;
    }
  });
  trees.wind = windUniform;
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
  const CLASSES = { mw: [16, 40, 1.35], mwl: [10, 50, 1.1], tr: [14, 42, 1.3], trl: [9, 50, 1.0], pr: [13, 42, 1.25], prl: [8, 50, 1.0],
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
        spots.push(x0 + dx * t + nx * off * sgn, 7.5, -(y0 + dy * t + ny * off * sgn));
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
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };
  trackNumber(mat, 'opacity', 0, 1.0);
  const mesh = new THREE.Points(geo, mat);
  mesh.frustumCulled = false;
  group.add(mesh);
  lamps.mesh = mesh;
  lamps.count = sizes.length;
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
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.0, 0.45, 0.72);
  bloomPass.enabled = false;
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

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
  controls.update();

  if (phaseNow !== phaseTarget) {
    const k = Math.min(1, (performance.now() - phaseT0) / PHASE_DUR);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    phaseNow = k >= 1 ? phaseTarget : THREE.MathUtils.lerp(phaseFrom, phaseTarget, e);
    applyAll(phaseNow);
  }

  // sun follows the orbit target so the shadow map stays sharp where you look
  const tgt = controls.target;
  const span = THREE.MathUtils.clamp(camera.position.distanceTo(tgt) * 1.6, 700, 6500);
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
  const dist = camera.position.distanceTo(tgt);
  for (const l of labelObjects) {
    const d = camera.position.distanceTo(l.position);
    const show = l.userData.minor ? d < 2600 : d < 7000;
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
window.__mv3d = { scene, camera, renderer, controls, setPhase, flyTo, sun, get bundle() { return bundle; }, get composer() { return composer; }, get gtao() { return gtaoPass; }, get bloom() { return bloomPass; } };
