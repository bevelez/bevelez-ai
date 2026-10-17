import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import {
  ZONE_DEFS,
  SCENARIO_PRESETS,
  PROVENANCE,
  getDistrictMultiplier,
  resolveDistrictKey,
  createSeededRandom,
  getPacificTimeComponents,
  sampleElevationGrid,
  SimulationEngines
} from './sim/index.js';
import { TelemetryPipeline } from './telemetry/index.js';
import {
  findOsmBuildingAtScenePoint,
  buildStevensCreekTrees,
  configureOnDemandShadows,
  buildAllHeroLandmarks
} from './scene/index.js';
import {
  GeminiUrbanBridge,
  initAccessibilityControls
} from './ui/index.js';
import { createPlannerUtility } from './mv-planner-utility.js';
import './mv-graphics-fidelity.js';

window.THREE = THREE;

// ============================================================================
// 0. GIS BUNDLE LOADER WITH LOADING & ERROR BANNER (BUG #11 & SECTION 4/5)
// ============================================================================
const loadingBannerEl = document.getElementById('mv-loading-banner');
const errorBannerEl = document.getElementById('mv-error-banner');
const errorBannerTextEl = document.getElementById('mv-error-banner-text');
const retryGisBtn = document.getElementById('btn-retry-gis');

if (retryGisBtn) {
  retryGisBtn.addEventListener('click', () => {
    window.location.reload();
  });
}

let mvGisData = null;
try {
  if (loadingBannerEl) loadingBannerEl.style.display = 'flex';
  const gisRes = await fetch('./assets/mountain-view-gis.json?v=8');
  if (!gisRes.ok) {
    throw new Error(`HTTP ${gisRes.status} loading mountain-view-gis.json`);
  }
  mvGisData = await gisRes.json();
  if (loadingBannerEl) loadingBannerEl.style.display = 'none';
} catch (err) {
  if (loadingBannerEl) loadingBannerEl.style.display = 'none';
  if (errorBannerTextEl) {
    errorBannerTextEl.textContent = `Unable to load Mountain View GIS bundle (${err && err.message ? err.message : 'network error'}). Retry or check network connection.`;
  }
  if (errorBannerEl) {
    errorBannerEl.style.display = 'flex';
  }
}

// ============================================================================
// 1. GEOGRAPHIC PROJECTION CONSTANTS (MOUNTAIN VIEW, CA)
// ============================================================================
const MV_GEO = {
  refLon: -122.0839,
  refLat: 37.3861,
  midLon: mvGisData ? (mvGisData.bounds.minLon + mvGisData.bounds.maxLon) * 0.5 : -122.080,
  midLat: mvGisData ? (mvGisData.bounds.minLat + mvGisData.bounds.maxLat) * 0.5 : 37.400,
  latSpan: mvGisData ? (mvGisData.bounds.maxLat - mvGisData.bounds.minLat) : 0.090,
  lonSpan: mvGisData ? (mvGisData.bounds.maxLon - mvGisData.bounds.minLon) : 0.080,
  tableSize: 136
};

const cosRefLat = Math.cos((MV_GEO.refLat * Math.PI) / 180.0);
const m_per_deg_lat = 111000.0;
const m_per_deg_lon = 111000.0 * cosRefLat;
const scale_m = (MV_GEO.tableSize * 0.90) / (MV_GEO.latSpan * m_per_deg_lat);
const x_offset = (MV_GEO.midLon - MV_GEO.refLon) * m_per_deg_lon * scale_m;
const z_offset = (MV_GEO.midLat - MV_GEO.refLat) * m_per_deg_lat * scale_m;

function geoToScene(lon, lat) {
  const dx = (lon - MV_GEO.refLon) * m_per_deg_lon;
  const x = dx * scale_m - x_offset;
  const z = -((lat - MV_GEO.refLat) * m_per_deg_lat) * scale_m + z_offset;
  return { x, z };
}

function sceneToGeo(x, z) {
  const dx = (x + x_offset) / scale_m;
  const lon = MV_GEO.refLon + dx / m_per_deg_lon;
  const dz = -(z - z_offset) / scale_m;
  const lat = MV_GEO.refLat + dz / m_per_deg_lat;
  return { lat, lon };
}

function worldToLatLon(wx, wz) {
  return sceneToGeo(wx, wz);
}

// ============================================================================
// 2. AMBIENT ARCHITECTURAL SOUNDSCAPE & SONIFICATION ENGINE
// ============================================================================
class TwinAudioEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.chordTimer = null;
    this.stepIdx = 0;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.18;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTelemetryChime(baseFreq = 523.25) {
    if (!this.ctx || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    [baseFreq, baseFreq * 1.25, baseFreq * 1.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);
      gain.gain.setValueAtTime(0.001, now + i * 0.045);
      gain.gain.linearRampToValueAtTime(0.055, now + i * 0.045 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + i * 0.045 + 0.42);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.45);
    });
  }

  toggle() {
    this.initContext();
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.startAmbientLoop();
      this.playTelemetryChime(587.33);
    } else if (this.chordTimer) {
      clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
    return this.isPlaying;
  }

  startAmbientLoop() {
    if (this.chordTimer) clearInterval(this.chordTimer);
    const chords = [
      [174.61, 261.63, 329.63, 392.00, 493.88],
      [196.00, 293.66, 369.99, 440.00, 587.33],
      [130.81, 261.63, 329.63, 392.00, 493.88],
      [146.83, 220.00, 293.66, 369.99, 440.00]
    ];

    const triggerPad = () => {
      if (!this.isPlaying || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = chords[this.stepIdx % chords.length];
      this.stepIdx++;

      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(920, now);

        gain.gain.setValueAtTime(0.0005, now);
        gain.gain.linearRampToValueAtTime(0.028 / (idx * 0.35 + 1), now + 1.4);
        gain.gain.exponentialRampToValueAtTime(0.0006, now + 5.6);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 5.8);
      });
    };

    triggerPad();
    this.chordTimer = setInterval(triggerPad, 5200);
  }
}

// ============================================================================
// 3. 3D SPATIAL VIEWPORT (MOUNTAIN VIEW ARCHITECTURAL LIGHT-TABLE)
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);
scene.fog = new THREE.FogExp2(0x0a0d12, 0.0014);

const camera = new THREE.PerspectiveCamera(
  29,
  window.innerWidth / window.innerHeight,
  1.0,
  750
);
camera.position.set(-126.0, 138.0, 136.0);

const isTouchDevice = Boolean(
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches
);
const prefersReducedMotionQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

// Section 3: antialias: false on default framebuffer since EffectComposer uses MSAA WebGLRenderTarget
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance'
});
const effectivePixelRatio = Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.5 : 2);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(effectivePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
container.appendChild(renderer.domElement);

// MSAA RenderTarget for EffectComposer (samples: 4 on desktop, 2 on touch devices)
const msaaRenderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * effectivePixelRatio,
  window.innerHeight * effectivePixelRatio,
  {
    samples: isTouchDevice ? 2 : 4,
    type: THREE.HalfFloatType
  }
);
const composer = new EffectComposer(renderer, msaaRenderTarget);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.26,
  0.32,
  0.88
);
composer.addPass(bloomPass);

// PBR Studio Environment & Crisp Architectural Maquette Lighting
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
scene.environmentIntensity = 0.36;
roomEnv.dispose();
pmremGenerator.dispose();

const ambientLight = new THREE.AmbientLight(0x98b0c8, 0.42);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff6e8, 2.05);
keyLight.position.set(-32.0, 152.4, 36.9);
keyLight.castShadow = true;
const shadowMapRes = isTouchDevice ? 2048 : 4096;
keyLight.shadow.mapSize.width = shadowMapRes;
keyLight.shadow.mapSize.height = shadowMapRes;
keyLight.shadow.camera.near = 25;
keyLight.shadow.camera.far = 320;
const shadowOrthoHalf = 85;
keyLight.shadow.camera.left = -shadowOrthoHalf;
keyLight.shadow.camera.right = shadowOrthoHalf;
keyLight.shadow.camera.top = shadowOrthoHalf;
keyLight.shadow.camera.bottom = -shadowOrthoHalf;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.bias = -0.00015;
keyLight.shadow.radius = 1.6;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x58c4f0, 0.58);
rimLight.position.set(95, 58, -90);
scene.add(rimLight);

// OrbitControls centered on Full-City Mountain View
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.0, -4.0, 2.0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.12;
controls.minDistance = 32;
controls.maxDistance = 285;
controls.update();

const cityRoot = new THREE.Group();
scene.add(cityRoot);

// ============================================================================
// 4A. ARCHITECTURAL LIGHT-TABLE PLINTH, SF BAY WETLANDS & STEVENS CREEK
// ============================================================================
const TABLE_W = 136;

const studioFloorGeo = new THREE.PlaneGeometry(420, 420);
studioFloorGeo.rotateX(-Math.PI / 2);
const studioFloorMat = new THREE.MeshStandardMaterial({
  color: 0x080b10,
  roughness: 0.85,
  metalness: 0.15
});
const studioFloorMesh = new THREE.Mesh(studioFloorGeo, studioFloorMat);
studioFloorMesh.position.y = -3.85;
studioFloorMesh.receiveShadow = true;
cityRoot.add(studioFloorMesh);

const plinthGeo = new THREE.BoxGeometry(TABLE_W + 2.2, 3.6, TABLE_W + 2.2);
const plinthMat = new THREE.MeshStandardMaterial({
  color: 0x0b0f15,
  roughness: 0.58,
  metalness: 0.34
});
const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
plinthMesh.position.y = -2.0;
plinthMesh.castShadow = true;
plinthMesh.receiveShadow = true;
cityRoot.add(plinthMesh);

const frameEdgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(TABLE_W + 2.3, 3.62, TABLE_W + 2.3));
const frameEdgeMat = new THREE.LineBasicMaterial({
  color: 0x8c7a5b,
  transparent: true,
  opacity: 0.42
});
const frameEdgeLines = new THREE.LineSegments(frameEdgeGeo, frameEdgeMat);
frameEdgeLines.position.y = -2.0;
cityRoot.add(frameEdgeLines);

// Shared 3D Curves for Stevens Creek Riparian Corridor & Braided Emerald Trails
const stevensCreekCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(15.9, 0, 40.8),
  new THREE.Vector3(12.3, 0, 33.1),
  new THREE.Vector3(12.4, 0, 22.5),
  new THREE.Vector3(11.7, 0, 14.9),
  new THREE.Vector3(11.8, 0, 9.8),
  new THREE.Vector3(11.5, 0, -1.2),
  new THREE.Vector3(11.6, 0, -13.2),
  new THREE.Vector3(11.8, 0, -28.0),
  new THREE.Vector3(12.2, 0, -45.0)
]);

const stevensCreekBraidedCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(16.6, 0, 40.2),
  new THREE.Vector3(13.1, 0, 32.8),
  new THREE.Vector3(13.2, 0, 22.2),
  new THREE.Vector3(12.5, 0, 14.6),
  new THREE.Vector3(12.6, 0, 9.5),
  new THREE.Vector3(12.3, 0, -1.5),
  new THREE.Vector3(12.4, 0, -13.5),
  new THREE.Vector3(12.6, 0, -28.2),
  new THREE.Vector3(13.0, 0, -45.0)
]);

const US101_PROFILE = [
  [-46.6, -66.4],
  [-27.6, -43.7],
  [-18.9, -33.4],
  [-4.25, -19.9],
  [1.28, -16.4],
  [6.4, -13.8],
  [12.6, -10.85],
  [26.5, -7.0],
  [44.9, -1.6],
  [58.0, 2.2]
];

function getUs101ZAtX(x) {
  if (x <= US101_PROFILE[0][0]) return US101_PROFILE[0][1];
  for (let i = 0; i < US101_PROFILE.length - 1; i++) {
    const [x0, z0] = US101_PROFILE[i];
    const [x1, z1] = US101_PROFILE[i + 1];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return z0 + t * (z1 - z0);
    }
  }
  return US101_PROFILE[US101_PROFILE.length - 1][1];
}

const toCanvasXY = (wx, wz, size = 4096) => [
  ((wx / TABLE_W) + 0.5) * size,
  ((wz / TABLE_W) + 0.5) * size
];

// High-DPI (4096×4096, Anisotropy = 8) Pre-Rasterized Base Map Texture (Section 3)
function createTableSurfaceTexture() {
  if (window.MVGraphicsFidelity && typeof window.MVGraphicsFidelity.generate4KTableSurfaceTexture === 'function') {
    return window.MVGraphicsFidelity.generate4KTableSurfaceTexture(geoToScene, toCanvasXY, THREE);
  }
  const tex = new THREE.TextureLoader().load('./assets/mv-basemap-4k.png?v=8');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const surfaceGeo = new THREE.PlaneGeometry(TABLE_W, TABLE_W);
surfaceGeo.rotateX(-Math.PI / 2);
const surfaceMat = new THREE.MeshStandardMaterial({
  map: createTableSurfaceTexture(),
  roughness: 0.78,
  metalness: 0.14
});
const surfaceMesh = new THREE.Mesh(surfaceGeo, surfaceMat);
surfaceMesh.position.y = -0.18;
surfaceMesh.receiveShadow = true;
cityRoot.add(surfaceMesh);

function buildMarshlandReliefPads() {
  if (window.MVGraphicsFidelity && typeof window.MVGraphicsFidelity.buildAuthenticSaltPondRelief === 'function') {
    window.MVGraphicsFidelity.buildAuthenticSaltPondRelief(cityRoot, geoToScene, THREE);
  }
}
buildMarshlandReliefPads();

// Dynamic SF Bay Storm Surge / Sea-Level Rise Plane
const surgeWaterGeo = new THREE.PlaneGeometry(TABLE_W - 1, 56, 48, 24);
surgeWaterGeo.rotateX(-Math.PI / 2);
const surgeWaterMat = new THREE.MeshStandardMaterial({
  color: 0x168ea6,
  emissive: 0x073440,
  emissiveIntensity: 0.32,
  transparent: true,
  opacity: 0.0,
  depthWrite: false,
  roughness: 0.55,
  metalness: 0.08
});
const surgeWaterMesh = new THREE.Mesh(surgeWaterGeo, surgeWaterMat);
surgeWaterMesh.position.set(0, -0.14, -39.5);
surgeWaterMesh.renderOrder = 1;
surgeWaterMesh.visible = false;
cityRoot.add(surgeWaterMesh);

// ============================================================================
// 4B. LUMINOUS TRANSIT & ARTERIAL CORRIDORS (TRUE GEOTOSCENE ALIGNMENT)
// ============================================================================
const corridorsGroup = new THREE.Group();
cityRoot.add(corridorsGroup);

function createRibbonGeometry(pointsOrCurve, width, segments = 128) {
  const curve = (pointsOrCurve && pointsOrCurve.isCurve)
    ? pointsOrCurve
    : (Array.isArray(pointsOrCurve) && pointsOrCurve.length > 0 && pointsOrCurve[0].isVector3
        ? new THREE.CatmullRomCurve3(pointsOrCurve)
        : new THREE.CatmullRomCurve3(pointsOrCurve.map((p) => (p.isVector3 ? p : new THREE.Vector3(p.x, p.y || 0, p.z)))));
  const halfW = width * 0.5;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normX = -tangent.z;
    const normZ = tangent.x;
    const len = Math.hypot(normX, normZ) || 1;
    const nx = (normX / len) * halfW;
    const nz = (normZ / len) * halfW;

    positions.push(pt.x + nx, 0, pt.z + nz);
    uvs.push(0, t);
    positions.push(pt.x - nx, 0, pt.z - nz);
    uvs.push(1, t);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return { geo, curve };
}

function buildGlowingCorridor(points, width, colorHex, yOffset = 0.03, opacity = 0.94, hdrMultiplier = 1.0, renderOrder = 3) {
  const { geo, curve } = createRibbonGeometry(points, width);
  const col = new THREE.Color(colorHex).multiplyScalar(hdrMultiplier);
  const mat = new THREE.MeshBasicMaterial({
    color: col,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = yOffset;
  mesh.renderOrder = renderOrder;
  corridorsGroup.add(mesh);
  return { curve, mesh, mat, width };
}

// 1. Caltrain Electrified Corridor
const caltrainPoints = [
  new THREE.Vector3(-58.0, 0, -32.7),
  new THREE.Vector3(-46.7, 0, -23.8),
  new THREE.Vector3(-35.4, 0, -14.9),
  new THREE.Vector3(-26.6, 0, -8.0),
  new THREE.Vector3(-14.6, 0, -1.9),
  new THREE.Vector3(2.05, 0, 6.38),
  new THREE.Vector3(13.9, 0, 12.4),
  new THREE.Vector3(29.7, 0, 19.3),
  new THREE.Vector3(48.5, 0, 27.2)
];
buildGlowingCorridor(caltrainPoints, 0.25, 0x0e6c8a, 0.022, 0.24, 1.08, 2);
const caltrainMain = buildGlowingCorridor(caltrainPoints, 0.14, 0x1ca8cc, 0.026, 0.44, 1.25, 2);
[-0.04, 0.0, 0.04].forEach((offset, idx) => {
  buildGlowingCorridor(
    caltrainPoints.map((p) => new THREE.Vector3(p.x + offset * 0.45, 0, p.z - offset * 0.85)),
    idx === 1 ? 0.025 : 0.035,
    idx === 1 ? 0x6ceeff : 0xb4feff,
    0.032,
    idx === 1 ? 0.82 : 0.98,
    1.78,
    4
  );
});

// 2. US-101 Bayshore Freeway
const us101Points = [
  new THREE.Vector3(-46.6, 0, -66.4),
  new THREE.Vector3(-27.6, 0, -43.7),
  new THREE.Vector3(-18.9, 0, -33.4),
  new THREE.Vector3(-4.25, 0, -19.9),
  new THREE.Vector3(1.28, 0, -16.4),
  new THREE.Vector3(6.4, 0, -13.8),
  new THREE.Vector3(12.6, 0, -10.85),
  new THREE.Vector3(26.5, 0, -7.0),
  new THREE.Vector3(44.9, 0, -1.6),
  new THREE.Vector3(58.0, 0, 2.2)
];
buildGlowingCorridor(us101Points, 0.58, 0x1284a8, 0.022, 0.24, 1.12, 2);
buildGlowingCorridor(us101Points, 0.38, 0x28bce0, 0.026, 0.46, 1.3, 3);
const us101Main = buildGlowingCorridor(us101Points, 0.22, 0xc4ffff, 0.032, 0.98, 1.82, 4);

[-0.14, 0.14].forEach((shift) => {
  const shiftedPts = us101Points.map((p) => new THREE.Vector3(p.x + shift * 0.55, 0, p.z - shift * 0.65));
  buildGlowingCorridor(shiftedPts, 0.06, 0x8ef8ff, 0.034, 0.88, 1.55, 4);
});

// 3. El Camino Real / SR-82 Grand Boulevard Spine
const ecrPoints = [
  new THREE.Vector3(-52.0, 0, -16.8),
  new THREE.Vector3(-43.5, 0, -9.2),
  new THREE.Vector3(-34.3, 0, -0.5),
  new THREE.Vector3(-24.7, 0, 5.1),
  new THREE.Vector3(-16.3, 0, 11.1),
  new THREE.Vector3(-7.3, 0, 17.3),
  new THREE.Vector3(2.0, 0, 23.2),
  new THREE.Vector3(11.9, 0, 29.1),
  new THREE.Vector3(29.1, 0, 36.9),
  new THREE.Vector3(48.5, 0, 43.2)
];
buildGlowingCorridor(ecrPoints, 0.42, 0xb8580a, 0.020, 0.18, 1.08, 2);
buildGlowingCorridor(ecrPoints, 0.26, 0xe0821c, 0.024, 0.38, 1.24, 3);
const ecrMain = buildGlowingCorridor(ecrPoints, 0.14, 0xffe092, 0.030, 0.94, 1.65, 4);

const ecrPromenadePoints = [
  new THREE.Vector3(-34.3, 0, -0.5),
  new THREE.Vector3(-24.7, 0, 5.1),
  new THREE.Vector3(-16.3, 0, 11.1),
  new THREE.Vector3(-7.3, 0, 17.3),
  new THREE.Vector3(2.0, 0, 23.2),
  new THREE.Vector3(11.9, 0, 29.1)
];
buildGlowingCorridor(ecrPromenadePoints, 0.42, 0xc8640c, 0.021, 0.20, 1.12, 2);
buildGlowingCorridor(ecrPromenadePoints, 0.26, 0xe88a20, 0.025, 0.44, 1.32, 3);
buildGlowingCorridor(ecrPromenadePoints, 0.14, 0xffe69c, 0.032, 0.98, 1.78, 4);

// 4. Downtown Castro Street / Miramonte Ave Cross-Arterial
const castroPoints = [
  new THREE.Vector3(-7.7, 0, 35.9),
  new THREE.Vector3(-7.5, 0, 24.4),
  new THREE.Vector3(-2.7, 0, 18.9),
  new THREE.Vector3(0.6, 0, 13.2),
  new THREE.Vector3(3.8, 0, 7.2),
  new THREE.Vector3(11.5, 0, -6.5),
  new THREE.Vector3(19.5, 0, -18.5)
];
buildGlowingCorridor(castroPoints, 0.28, 0xc06410, 0.020, 0.20, 1.1, 2);
const castroMain = buildGlowingCorridor(castroPoints, 0.14, 0xf8d688, 0.028, 0.90, 1.48, 3);

const castroDowntownPoints = [
  new THREE.Vector3(-7.5, 0, 24.4),
  new THREE.Vector3(-2.7, 0, 18.9),
  new THREE.Vector3(0.6, 0, 13.2),
  new THREE.Vector3(3.8, 0, 7.2)
];
buildGlowingCorridor(castroDowntownPoints, 0.28, 0xc86810, 0.022, 0.24, 1.14, 2);
buildGlowingCorridor(castroDowntownPoints, 0.18, 0xe88c24, 0.026, 0.48, 1.35, 3);
buildGlowingCorridor(castroDowntownPoints, 0.10, 0xffe498, 0.032, 0.98, 1.82, 4);

// 5. Shoreline Boulevard Overpass Connector
const shorelinePoints = [
  new THREE.Vector3(-8.85, 0, 16.6),
  new THREE.Vector3(-6.0, 0, 11.15),
  new THREE.Vector3(-1.45, 0, 2.46),
  new THREE.Vector3(1.85, 0, -3.07),
  new THREE.Vector3(2.06, 0, -8.76),
  new THREE.Vector3(2.15, 0, -16.18),
  new THREE.Vector3(2.18, 0, -24.1),
  new THREE.Vector3(2.25, 0, -34.5)
];
const shorelineMain = buildGlowingCorridor(shorelinePoints, 0.22, 0xf2c874, 0.028, 0.85, 1.35, 3);

// 6. Dual Braided Emerald Stevens Creek Trail 3D Ribbons
buildGlowingCorridor(stevensCreekCurve.getPoints(72), 0.18, 0x0e6b3c, 0.016, 0.32, 1.1, 1);
buildGlowingCorridor(stevensCreekCurve.getPoints(72), 0.08, 0x42f89c, 0.022, 0.92, 1.52, 2);
buildGlowingCorridor(stevensCreekBraidedCurve.getPoints(64), 0.06, 0x62ffae, 0.022, 0.78, 1.38, 2);

const castroPlazaLight = new THREE.PointLight(0xffb44c, 3.1, 38, 1.45);
castroPlazaLight.position.set(1.5, 4.2, 11.5);
cityRoot.add(castroPlazaLight);

const castroSouthLight = new THREE.PointLight(0xffaa38, 2.2, 30, 1.5);
castroSouthLight.position.set(-2.5, 3.5, 20.0);
cityRoot.add(castroSouthLight);

// Instanced Micro-Vehicles (2 InstancedMeshes instead of 48 separate Meshes — Section 3)
const trafficAgents = [];
const vehicleGeo = new THREE.BoxGeometry(0.34, 0.16, 0.98);
const cyanVehMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdcffff).multiplyScalar(1.45) });
const amberVehMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd884).multiplyScalar(1.45) });

const cyanVehInstanced = new THREE.InstancedMesh(vehicleGeo, cyanVehMat, 28);
const amberVehInstanced = new THREE.InstancedMesh(vehicleGeo, amberVehMat, 20);
cyanVehInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
amberVehInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cityRoot.add(cyanVehInstanced);
cityRoot.add(amberVehInstanced);

for (let i = 0; i < 48; i++) {
  const is101 = i < 28;
  trafficAgents.push({
    instancedMesh: is101 ? cyanVehInstanced : amberVehInstanced,
    instanceIndex: is101 ? i : (i - 28),
    curve: is101 ? us101Main.curve : ecrMain.curve,
    is101,
    t: (i / (is101 ? 28 : 20)) % 1,
    laneOffset: (i % 2 === 0 ? 1 : -1) * 0.44,
    dir: i % 2 === 0 ? 1 : -1,
    baseSpeed: is101 ? 0.055 : 0.038
  });
}

// 2 Bi-Directional Caltrain Electric Trains (Stadler KISS Consists)
const caltrainTrains = [];
const trainGeo = new THREE.BoxGeometry(0.56, 0.44, 5.8);
const trainMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa8faff).multiplyScalar(1.45) });
[-0.65, 0.65].forEach((laneShift, idx) => {
  const mesh = new THREE.Mesh(trainGeo, trainMat);
  cityRoot.add(mesh);
  caltrainTrains.push({
    mesh,
    laneShift,
    t: idx === 0 ? 0.68 : 0.28,
    dir: idx === 0 ? 1 : -1
  });
});

// Render Authentic Mountain View GIS Infrastructure (Bug #11 polygon vertex loop fixed)
function renderGisInfrastructure() {
  if (!mvGisData) return;

  const primaryHeroRoads = new Set(['US-101', 'El Camino Real (SR-82)', 'Shoreline Boulevard']);

  if (Array.isArray(mvGisData.roads)) {
    const roadStyles = {
      'SR-85': { width: 0.44, color: 0x1ca2cc, y: 0.034, op: 0.68, hdr: 1.35 },
      'SR-237': { width: 0.44, color: 0x20a8d4, y: 0.034, op: 0.68, hdr: 1.35 },
      'Central Expressway': { width: 0.34, color: 0xee9224, y: 0.035, op: 0.58, hdr: 1.25 },
      'Miramonte Avenue': { width: 0.24, color: 0xecd088, y: 0.028, op: 0.46, hdr: 1.1 },
      'Rengstorff Avenue': { width: 0.24, color: 0xecd088, y: 0.028, op: 0.46, hdr: 1.1 },
      'San Antonio Road': { width: 0.26, color: 0xf0c878, y: 0.030, op: 0.54, hdr: 1.18 },
      'Middlefield Road': { width: 0.26, color: 0xedd28e, y: 0.029, op: 0.48, hdr: 1.12 },
      'Grant Road': { width: 0.24, color: 0xecd088, y: 0.028, op: 0.48, hdr: 1.12 }
    };

    mvGisData.roads.forEach((road) => {
      if (primaryHeroRoads.has(road.name)) return;
      if (!Array.isArray(road.coords) || road.coords.length < 2) return;
      const pts = [];
      for (const [lon, lat] of road.coords) {
        const sc = geoToScene(lon, lat);
        if (Math.abs(sc.x) <= TABLE_W * 0.51 && Math.abs(sc.z) <= TABLE_W * 0.51) {
          const v = new THREE.Vector3(sc.x, 0, sc.z);
          if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 0.15) {
            pts.push(v);
          }
        }
      }
      if (pts.length >= 2) {
        const style = roadStyles[road.name] || { width: 0.22, color: 0xe6caa0, y: 0.028, op: 0.42, hdr: 1.1 };
        buildGlowingCorridor(pts, style.width, style.color, style.y, style.op, style.hdr, 2);
      }
    });
  }

  if (Array.isArray(mvGisData.rail)) {
    mvGisData.rail.forEach((line) => {
      if (line.name.includes('Caltrain')) return;
      if (!Array.isArray(line.coords) || line.coords.length < 2) return;
      const pts = [];
      for (const [lon, lat] of line.coords) {
        const sc = geoToScene(lon, lat);
        if (Math.abs(sc.x) <= TABLE_W * 0.51 && Math.abs(sc.z) <= TABLE_W * 0.51) {
          const v = new THREE.Vector3(sc.x, 0, sc.z);
          if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 0.15) {
            pts.push(v);
          }
        }
      }
      if (pts.length >= 2) {
        buildGlowingCorridor(pts, 0.24, 0xff9933, 0.042, 0.72, 1.4, 3);
      }
    });
  }

  if (Array.isArray(mvGisData.trails)) {
    mvGisData.trails.forEach((trail) => {
      if (trail.name.includes('Stevens Creek')) return;
      if (!Array.isArray(trail.coords) || trail.coords.length < 2) return;
      const pts = [];
      for (const [lon, lat] of trail.coords) {
        const sc = geoToScene(lon, lat);
        if (Math.abs(sc.x) <= TABLE_W * 0.51 && Math.abs(sc.z) <= TABLE_W * 0.51) {
          const v = new THREE.Vector3(sc.x, 0, sc.z);
          if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 0.15) {
            pts.push(v);
          }
        }
      }
      if (pts.length >= 2) {
        buildGlowingCorridor(pts, 0.18, 0x3ae88a, 0.022, 0.65, 1.3, 2);
      }
    });
  }

  if (Array.isArray(mvGisData.aeroways)) {
    mvGisData.aeroways.forEach((aero) => {
      if (!Array.isArray(aero.coords) || aero.coords.length < 2) return;
      const pts = [];
      for (const [lon, lat] of aero.coords) {
        const sc = geoToScene(lon, lat);
        if (Math.abs(sc.x) <= TABLE_W * 0.51 && Math.abs(sc.z) <= TABLE_W * 0.51) {
          const v = new THREE.Vector3(sc.x, 0, sc.z);
          if (pts.length === 0 || v.distanceToSquared(pts[pts.length - 1]) > 0.15) {
            pts.push(v);
          }
        }
      }
      if (pts.length >= 2) {
        const isRunway = aero.type === 'runway';
        buildGlowingCorridor(pts, isRunway ? 0.52 : 0.16, isRunway ? 0x222a34 : 0x364452, 0.024, isRunway ? 0.88 : 0.62, 1.0, 2);
        if (isRunway) {
          buildGlowingCorridor(pts, 0.08, 0xfff6d8, 0.032, 0.90, 1.45, 3);
        }
      }
    });
  }

  if (Array.isArray(mvGisData.stations)) {
    const stationGeos = [];
    mvGisData.stations.forEach((st) => {
      const sc = geoToScene(st.coords[0], st.coords[1]);
      const stationRingGeo = new THREE.RingGeometry(0.8, 1.4, 24);
      stationRingGeo.rotateX(-Math.PI / 2);
      stationRingGeo.translate(sc.x, 0.065, sc.z);
      stationGeos.push(stationRingGeo);
    });
    if (stationGeos.length > 0) {
      const mergedStations = BufferGeometryUtils.mergeGeometries(stationGeos, false);
      if (mergedStations) {
        const stationRingMat = new THREE.MeshBasicMaterial({
          color: 0x44eeff,
          transparent: true,
          opacity: 0.85,
          depthWrite: false
        });
        corridorsGroup.add(new THREE.Mesh(mergedStations, stationRingMat));
      }
    }
  }

  // Bug #11 Fix: Iterate all vertices (wb.polygon.length, only skipping duplicate closure vertex if explicitly closed)
  if (Array.isArray(mvGisData.water)) {
    const waterGeos = [];
    mvGisData.water.forEach((wb) => {
      if (wb.name === 'San Francisco Bay') return;
      if (Array.isArray(wb.polygon) && wb.polygon.length >= 3) {
        const poly = wb.polygon;
        const len = (poly.length > 3 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1])
          ? poly.length - 1
          : poly.length;
        const shape = new THREE.Shape();
        for (let i = 0; i < len; i++) {
          const sc = geoToScene(poly[i][0], poly[i][1]);
          if (i === 0) shape.moveTo(sc.x, -sc.z);
          else shape.lineTo(sc.x, -sc.z);
        }
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        waterGeos.push(geo);
      }
    });
    if (waterGeos.length > 0) {
      const mergedWater = BufferGeometryUtils.mergeGeometries(waterGeos, false);
      if (mergedWater) {
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x165258,
          roughness: 0.28,
          metalness: 0.45,
          transparent: true,
          opacity: 0.88,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(mergedWater, waterMat);
        mesh.position.y = 0.015;
        mesh.renderOrder = 1;
        cityRoot.add(mesh);
      }
    }
  }

  // Bug #11 Fix: Iterate all vertices (park.polygon.length, only skipping duplicate closure vertex if explicitly closed)
  if (Array.isArray(mvGisData.parks)) {
    const parkGeos = [];
    mvGisData.parks.forEach((park) => {
      if (Array.isArray(park.polygon) && park.polygon.length >= 3) {
        const poly = park.polygon;
        const len = (poly.length > 3 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1])
          ? poly.length - 1
          : poly.length;
        const shape = new THREE.Shape();
        for (let i = 0; i < len; i++) {
          const sc = geoToScene(poly[i][0], poly[i][1]);
          if (i === 0) shape.moveTo(sc.x, -sc.z);
          else shape.lineTo(sc.x, -sc.z);
        }
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        parkGeos.push(geo);
      }
    });
    if (parkGeos.length > 0) {
      const mergedParks = BufferGeometryUtils.mergeGeometries(parkGeos, false);
      if (mergedParks) {
        const parkMat = new THREE.MeshStandardMaterial({
          color: 0x143c24,
          roughness: 0.78,
          metalness: 0.08,
          transparent: true,
          opacity: 0.82,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(mergedParks, parkMat);
        mesh.position.y = 0.018;
        mesh.renderOrder = 1;
        cityRoot.add(mesh);
      }
    }
  }
}
renderGisInfrastructure();

// ============================================================================
// 4C. HERO 3D ARCHITECTURAL LANDMARKS OF MOUNTAIN VIEW (1:1 OSM RECTIFIED)
// ============================================================================
const landmarksGroup = new THREE.Group();
landmarksGroup.name = 'HeroLandmarksGroup';
cityRoot.add(landmarksGroup);

const districtLandmarksGroup = new THREE.Group();
districtLandmarksGroup.name = 'DistrictLandmarksGroup';
cityRoot.add(districtLandmarksGroup);

buildAllHeroLandmarks(THREE, landmarksGroup, districtLandmarksGroup, BufferGeometryUtils);
const allLandmarks = [...landmarksGroup.children, ...districtLandmarksGroup.children];

// Pre-sample corridor curves and all 11 hero landmark bounding boxes for exact clearance
function sampleCurvePoints(curve, count = 200) {
  const pts = [];
  for (let i = 0; i <= count; i++) {
    pts.push(curve.getPointAt(i / count));
  }
  return pts;
}

const us101Samples = sampleCurvePoints(us101Main.curve, 240);
const ecrSamples = sampleCurvePoints(ecrMain.curve, 160);
const caltrainSamples = sampleCurvePoints(caltrainMain.curve, 160);
const castroSamples = sampleCurvePoints(castroMain.curve, 140);
const shorelineSamples = sampleCurvePoints(shorelineMain.curve, 90);
const stevensCreekSamples = sampleCurvePoints(stevensCreekCurve, 180);

const vtaRailSamples = [];
const otherCorridorsSamples = [];
if (mvGisData) {
  for (const r of [...(mvGisData.roads || []), ...(mvGisData.rail || [])]) {
    const isMajor = r.name.includes('101') || r.name.includes('Caltrain') || r.name.includes('Camino');
    const isVta = r.name.includes('VTA');
    for (const seg of (r.segments || [])) {
      const segPts = seg.map((p) => geoToScene(p[0], p[1]));
      if (isVta) vtaRailSamples.push(...segPts);
      else if (!isMajor) otherCorridorsSamples.push(...segPts);
    }
  }
}

const SPATIAL_CELL = 6.0;
const corridorSpatialGrid = new Map();
function addPtsToCorridorGrid(pts, type) {
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const gx = Math.floor(pt.x / SPATIAL_CELL);
    const gz = Math.floor(pt.z / SPATIAL_CELL);
    const key = `${gx}_${gz}`;
    let cell = corridorSpatialGrid.get(key);
    if (!cell) {
      cell = [];
      corridorSpatialGrid.set(key, cell);
    }
    cell.push({ x: pt.x, z: pt.z, type });
  }
}
addPtsToCorridorGrid(vtaRailSamples, 'vta');
addPtsToCorridorGrid(otherCorridorsSamples, 'other');

function checkGridClearance(minX, maxX, minZ, maxZ) {
  const maxTh = 1.45;
  const gMinX = Math.floor((minX - maxTh) / SPATIAL_CELL);
  const gMaxX = Math.floor((maxX + maxTh) / SPATIAL_CELL);
  const gMinZ = Math.floor((minZ - maxTh) / SPATIAL_CELL);
  const gMaxZ = Math.floor((maxZ + maxTh) / SPATIAL_CELL);

  for (let gx = gMinX; gx <= gMaxX; gx++) {
    for (let gz = gMinZ; gz <= gMaxZ; gz++) {
      const cell = corridorSpatialGrid.get(`${gx}_${gz}`);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const pt = cell[i];
        const th = pt.type === 'vta' ? 1.45 : 1.25;
        const dx = Math.max(minX - pt.x, 0, pt.x - maxX);
        const dz = Math.max(minZ - pt.z, 0, pt.z - maxZ);
        if (dx * dx + dz * dz < th * th) return false;
      }
    }
  }
  return true;
}

function minDistBoxToSamples(minX, maxX, minZ, maxZ, samples) {
  let best = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const pt = samples[i];
    const dx = Math.max(minX - pt.x, 0, pt.x - maxX);
    const dz = Math.max(minZ - pt.z, 0, pt.z - maxZ);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

// Compute world bounding boxes for all 11 hero landmarks so flat OSM extrusions are deduplicated
const landmarkWorldBoxes = allLandmarks.map((lm) => {
  lm.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(lm);
});

function overlapsAnyHeroLandmark(minX, maxX, minZ, maxZ, pad = 0.65) {
  for (let i = 0; i < landmarkWorldBoxes.length; i++) {
    const box = landmarkWorldBoxes[i];
    if (
      maxX > box.min.x - pad &&
      minX < box.max.x + pad &&
      maxZ > box.min.z - pad &&
      minZ < box.max.z + pad
    ) {
      return true;
    }
  }
  return false;
}

// Stevens Creek Greenbelt 3D Tree Canopy Cluster (Single InstancedMesh — Section 3)
buildStevensCreekTrees(
  THREE,
  cityRoot,
  stevensCreekCurve,
  stevensCreekBraidedCurve,
  minDistBoxToSamples,
  { us101Samples, caltrainSamples, ecrSamples, castroSamples },
  createSeededRandom
);

// ============================================================================
// 4D. INTERACTIVE GEO-REFERENCED MOUNTAIN VIEW PARCELS (8,200 REAL OSM BUILDINGS)
// ============================================================================
const parcelsGroup = new THREE.Group();
cityRoot.add(parcelsGroup);

const staticBuildingsGroup = new THREE.Group();
staticBuildingsGroup.name = 'StaticBuildingsGroup';
cityRoot.add(staticBuildingsGroup);

const parcelRecords = [];
const interactableMeshes = [];

function applyMaquetteShader(mat, isStorefront = false) {
  mat.userData = mat.userData || {};
  mat.userData.uIsStorefront = { value: isStorefront ? 1.0 : 0.0 };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uIsStorefront = mat.userData.uIsStorefront;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vMaquetteWorldPos;
varying vec3 vMaquetteNormal;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
vec4 maquetteWorldPos = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  maquetteWorldPos = batchingMatrix * maquetteWorldPos;
#endif
#ifdef USE_INSTANCING
  maquetteWorldPos = instanceMatrix * maquetteWorldPos;
#endif
maquetteWorldPos = modelMatrix * maquetteWorldPos;
vMaquetteWorldPos = maquetteWorldPos.xyz;
vMaquetteNormal = normalize( normalMatrix * normal );`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vMaquetteWorldPos;
varying vec3 vMaquetteNormal;
uniform float uIsStorefront;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
if (abs(vMaquetteNormal.y) < 0.85) {
  float storyHeight = 0.38;
  float storyPhase = fract(vMaquetteWorldPos.y / storyHeight);
  float storyGroove = smoothstep(0.0, 0.05, storyPhase) * smoothstep(1.0, 0.95, storyPhase);
  diffuseColor.rgb *= (0.93 + 0.07 * storyGroove);
}`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
if (uIsStorefront > 0.5) {
  float storefrontMask = smoothstep(0.32, 0.12, vMaquetteWorldPos.y);
  vec3 warmStorefront = vec3(0.96, 0.58, 0.16) * 0.85;
  totalEmissiveRadiance += warmStorefront * storefrontMask;
}`
    );
  };
}

function generateCityParcels() {
  if (!mvGisData || !Array.isArray(mvGisData.buildings) || mvGisData.buildings.length === 0) {
    return;
  }

  let idx = 100;
  function mapGisDistrict(gisDistrict, lon, lat) {
    if (gisDistrict === 'Downtown Castro') return 'DT_CRA';
    if (gisDistrict === 'San Antonio' || (lon !== undefined && lon <= -122.100 && lat >= 37.399 && lat <= 37.411)) {
      return 'SA_PP';
    }
    if (gisDistrict === 'El Camino Real') return 'ECR_MU';
    if (gisDistrict === 'East Whisman' || gisDistrict === 'General Commercial') return 'EW_TOD';
    if (gisDistrict === 'North Bayshore') return 'NB_PP';
    return 'RES_SF';
  }

  const targetCounts = { DT_CRA: 60, ECR_MU: 55, SA_PP: 25, EW_TOD: 65, NB_PP: 65, RES_SF: 70 };
  const meshTargetCounts = { DT_CRA: 8, ECR_MU: 8, SA_PP: 6, EW_TOD: 8, NB_PP: 8, RES_SF: 8 };
  const selectedCounts = { DT_CRA: 0, ECR_MU: 0, SA_PP: 0, EW_TOD: 0, NB_PP: 0, RES_SF: 0 };
  const districtGeos = { DT_CRA: [], ECR_MU: [], SA_PP: [], EW_TOD: [], NB_PP: [], RES_SF: [] };

  for (const b of mvGisData.buildings) {
    const poly = b.polygon;
    if (!Array.isArray(poly) || poly.length < 3) continue;
    const numPts = (poly.length > 3 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1])
      ? poly.length - 1
      : poly.length;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const scenePts = [];
    for (let i = 0; i < numPts; i++) {
      const sc = geoToScene(poly[i][0], poly[i][1]);
      if (!scenePts.length || Math.hypot(sc.x - scenePts[scenePts.length - 1].x, sc.z - scenePts[scenePts.length - 1].z) > 0.04) {
        scenePts.push(sc);
        if (sc.x < minX) minX = sc.x;
        if (sc.x > maxX) maxX = sc.x;
        if (sc.z < minZ) minZ = sc.z;
        if (sc.z > maxZ) maxZ = sc.z;
      }
    }
    if (scenePts.length < 3) continue;
    if (minX < -66.8 || maxX > 66.8 || minZ < -66.8 || maxZ > 66.8) continue;

    // Deduplicate underlying OSM building footprints overlapping any of the 11 sculpted hero landmarks
    if (overlapsAnyHeroLandmark(minX, maxX, minZ, maxZ, 0.55)) continue;

    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    const d101 = minDistBoxToSamples(minX, maxX, minZ, maxZ, us101Samples);
    const dCal = minDistBoxToSamples(minX, maxX, minZ, maxZ, caltrainSamples);
    const dEcr = minDistBoxToSamples(minX, maxX, minZ, maxZ, ecrSamples);
    const dCreek = minDistBoxToSamples(minX, maxX, minZ, maxZ, stevensCreekSamples);
    const dCastro = minDistBoxToSamples(minX, maxX, minZ, maxZ, castroSamples);

    const isCleared = (
      d101 >= 2.25 &&
      dCal >= 1.55 &&
      dEcr >= 1.45 &&
      dCreek >= 1.65 &&
      dCastro >= 0.8 &&
      checkGridClearance(minX, maxX, minZ, maxZ)
    );
    if (!isCleared) continue;

    const lon = b.center ? b.center[0] : sceneToGeo(cx, cz).lon;
    const lat = b.center ? b.center[1] : sceneToGeo(cx, cz).lat;
    const dist = mapGisDistrict(b.district, lon, lat);

    if (selectedCounts[dist] < targetCounts[dist]) {
      selectedCounts[dist]++;
      const hasIndividualMesh = selectedCounts[dist] <= meshTargetCounts[dist];
      const w = Math.max(maxX - minX, 2.6);
      const d = Math.max(maxZ - minZ, 2.6);
      const origHeight = b.height_m
        ? Math.max(0.55, Math.min(2.4, b.height_m * 0.11))
        : (b.levels ? b.levels * 0.38 : 0.95);

      const shape = new THREE.Shape();
      for (let k = 0; k < scenePts.length; k++) {
        const lx = scenePts[k].x - cx;
        const lz = scenePts[k].z - cz;
        if (k === 0) shape.moveTo(lx, -lz);
        else shape.lineTo(lx, -lz);
      }
      shape.closePath();

      const bGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false });
      bGeo.rotateX(-Math.PI / 2);

      const nearAmberSpine = (dist === 'DT_CRA' || dist === 'ECR_MU' || dist === 'SA_PP') && (dEcr < 6.5 || Math.hypot(cx - 1.0, cz - 13.0) < 12.0);

      const baseZone = dist === 'DT_CRA' ? 'MU6' :
                       dist === 'ECR_MU' ? 'MU6' :
                       dist === 'SA_PP' ? 'TOD10' :
                       dist === 'EW_TOD' ? 'MU6' :
                       dist === 'NB_PP' ? 'MU6' :
                       ((b.levels && b.levels >= 2) || (b.height_m && b.height_m > 7.0) ? 'R3' : 'R1');
      const zDef = ZONE_DEFS[baseZone] || ZONE_DEFS.MU6;

      const mat = new THREE.MeshStandardMaterial({
        color: zDef.colorHex,
        emissive: 0x10161e,
        emissiveIntensity: 0.025,
        roughness: zDef.roughness || 0.78,
        metalness: zDef.metalness || 0.03
      });
      applyMaquetteShader(mat, nearAmberSpine);

      const mesh = new THREE.Group();
      mesh.position.set(cx, 0, cz);
      mesh.scale.set(1, origHeight, 1);
      parcelsGroup.add(mesh);

      if (hasIndividualMesh) {
        const bMesh = new THREE.Mesh(bGeo, mat);
        // Section 3: Only cast shadows on multi-story / commercial structures, not single-family R-1
        bMesh.castShadow = baseZone !== 'R1';
        bMesh.receiveShadow = true;
        mesh.add(bMesh);
      } else {
        // Merge into static district batch to save draw calls while retaining bGeo for on-demand rezone
        const worldShape = new THREE.Shape();
        for (let k = 0; k < scenePts.length; k++) {
          if (k === 0) worldShape.moveTo(scenePts[k].x, -scenePts[k].z);
          else worldShape.lineTo(scenePts[k].x, -scenePts[k].z);
        }
        worldShape.closePath();
        const worldGeo = new THREE.ExtrudeGeometry(worldShape, { depth: origHeight, bevelEnabled: false });
        worldGeo.rotateX(-Math.PI / 2);
        districtGeos[dist].push(worldGeo);
      }

      const districtName = dist === 'DT_CRA' ? 'Downtown Castro Street Precise Plan' :
                           dist === 'SA_PP' ? 'San Antonio Center Precise Plan' :
                           dist === 'ECR_MU' ? 'El Camino Real Corridor Plan' :
                           dist === 'EW_TOD' ? 'East Whisman Precise Plan' :
                           dist === 'NB_PP' ? 'North Bayshore Precise Plan' :
                           'Old Mountain View / Residential Neighborhoods';

      // Sample real SRTM elevation from mvGisData.elevation_grid (Bugs #4 & #9 Fixed)
      const elevationThreshold = sampleElevationGrid(lon, lat, mvGisData?.elevation_grid, mvGisData?.bounds);

      const record = {
        id: b.id || `MV-${dist.split('_')[0]}-${idx++}`,
        name: b.name || `${districtName} Parcel`,
        district: dist,
        districtName,
        baseZone,
        currentZoneKey: baseZone,
        currentZoneCode: ZONE_DEFS[baseZone].code,
        x: cx,
        z: cz,
        w,
        d,
        minX,
        maxX,
        minZ,
        maxZ,
        lat,
        lon,
        areaSqm: b.area_m2 || Math.round(w * d * 180),
        levels: b.levels || Math.max(1, Math.round(origHeight * 1.8)),
        heightM: b.height_m || +(origHeight * 4.2).toFixed(1),
        heightSource: b.height_source || 'district_zoning_default',
        origHeight,
        baseHeightScale: 1.0,
        currentHeight: origHeight,
        targetHeight: origHeight,
        targetFar: ZONE_DEFS[baseZone].baseFar,
        units: Math.round(Math.max(12, (w * d) / 6.5 * ZONE_DEFS[baseZone].unitsPerArea * 18)),
        jobs: Math.round((w * d) / 6.5 * ZONE_DEFS[baseZone].jobsPerArea * 26),
        greenRatio: 0.2,
        heatDelta: 0.0,
        floodRisk: 0.0,
        elevationThreshold,
        warmLit: nearAmberSpine,
        baseColorHex: mat.color.getHex(),
        baseEmissiveHex: mat.emissive.getHex(),
        baseEmissiveIntensity: mat.emissiveIntensity,
        bGeo,
        mesh,
        mat
      };

      mesh.traverse((child) => {
        if (child.isMesh) {
          child.userData.parcel = record;
          interactableMeshes.push(child);
        }
      });
      parcelRecords.push(record);
    } else {
      const shape = new THREE.Shape();
      for (let k = 0; k < scenePts.length; k++) {
        if (k === 0) shape.moveTo(scenePts[k].x, -scenePts[k].z);
        else shape.lineTo(scenePts[k].x, -scenePts[k].z);
      }
      shape.closePath();
      const h = b.height_m ? Math.max(0.42, Math.min(2.6, b.height_m * 0.11)) : (b.levels ? b.levels * 0.36 : 0.78);
      const bGeo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
      bGeo.rotateX(-Math.PI / 2);
      districtGeos[dist].push(bGeo);
    }
  }

  for (const dKey of Object.keys(districtGeos)) {
    const geos = districtGeos[dKey];
    if (geos.length > 0) {
      const batchSize = 4000;
      const dKeyZone = dKey === 'RES_SF' ? 'R1' : (dKey === 'DT_CRA' || dKey === 'ECR_MU' ? 'MU6' : 'TOD10');
      const zDef = ZONE_DEFS[dKeyZone] || ZONE_DEFS.MU6;
      const baseColorHex = zDef.colorHex;
      const isStorefrontDistrict = (dKey === 'DT_CRA' || dKey === 'ECR_MU' || dKey === 'SA_PP');
      const distMat = new THREE.MeshStandardMaterial({
        color: baseColorHex,
        emissive: 0x10161e,
        emissiveIntensity: 0.025,
        roughness: zDef.roughness || 0.78,
        metalness: zDef.metalness || 0.03
      });
      applyMaquetteShader(distMat, isStorefrontDistrict);
      for (let bi = 0; bi < geos.length; bi += batchSize) {
        const chunk = geos.slice(bi, bi + batchSize);
        const mergedGeo = BufferGeometryUtils.mergeGeometries(chunk, false);
        if (mergedGeo) {
          const distMesh = new THREE.Mesh(mergedGeo, distMat);
          distMesh.castShadow = dKey !== 'RES_SF';
          distMesh.receiveShadow = true;
          distMesh.userData.district = dKey;
          distMesh.userData.baseColorHex = baseColorHex;
          distMesh.userData.currentScaleY = 1.0;
          staticBuildingsGroup.add(distMesh);
        }
      }
    }
  }
}

generateCityParcels();
parcelsGroup.updateMatrixWorld(true);

// Configure on-demand shadow map rendering (Section 3)
const requestShadowMapUpdate = configureOnDemandShadows(
  renderer,
  scene,
  landmarksGroup,
  districtLandmarksGroup,
  parcelsGroup
);

// Selection Wireframe Beacon for Clicked Parcel or OSM Building
const selectionBeaconGeo = new THREE.BoxGeometry(1.06, 1.04, 1.06);
selectionBeaconGeo.translate(0, 0.5, 0);
const selectionBeaconMat = new THREE.MeshBasicMaterial({
  color: 0x48ecff,
  wireframe: true,
  transparent: true,
  opacity: 0.9
});
const selectionBeacon = new THREE.Mesh(selectionBeaconGeo, selectionBeaconMat);
selectionBeacon.visible = false;
cityRoot.add(selectionBeacon);

// ============================================================================
// 5. 3D PROJECTED LANDMARK CALLOUT PINS & SVG LEADER LINES (RECTIFIED COORDS)
// ============================================================================
const bayViewSc = geoToScene(-122.06916, 37.42416);
const hangarOneSc = geoToScene(-122.05506, 37.41597);
const transitCenterSc = geoToScene(-122.07633, 37.39441);
const shorelineSc = geoToScene(-122.08065, 37.42676);

const LANDMARK_CALLOUTS = [
  {
    id: 'call-bayview',
    title: 'GOOGLE BAY VIEW CANOPY',
    sub: 'NORTH BAYSHORE',
    subColor: 'rgba(236, 232, 223, 0.82)',
    styleType: 'top-left',
    worldPos: new THREE.Vector3(bayViewSc.x, 2.2, bayViewSc.z),
    offsetX: -225,
    offsetY: -12,
    camKey: 'bayshore',
    priority: 100
  },
  {
    id: 'call-hangar',
    title: 'NASA AMES HANGAR ONE',
    sub: 'MOFFETT AIRFIELD',
    subColor: 'rgba(236, 232, 223, 0.82)',
    styleType: 'top-right',
    worldPos: new THREE.Vector3(hangarOneSc.x, 3.8, hangarOneSc.z),
    offsetX: 28,
    offsetY: -48,
    camKey: 'moffett',
    priority: 95
  },
  {
    id: 'call-castro',
    title: 'CASTRO ST. PROMENADE',
    sub: 'DOWNTOWN // AMBER',
    subColor: '#f2ae49',
    styleType: 'bottom-left',
    worldPos: new THREE.Vector3(0.6, 0.4, 13.2),
    verticalDropVh: 0.86,
    camKey: 'castro',
    priority: 90
  },
  {
    id: 'call-caltrain',
    title: 'MOUNTAIN VIEW TRANSIT CENTER',
    sub: 'CALTRAIN CORRIDOR // CYAN',
    subColor: '#48ecff',
    styleType: 'bottom-left',
    worldPos: new THREE.Vector3(transitCenterSc.x, 0.8, transitCenterSc.z),
    verticalDropVh: 0.78,
    camKey: 'castro',
    priority: 85
  },
  {
    id: 'call-shoreline',
    title: 'SHORELINE AMPHITHEATRE',
    sub: 'BAYFRONT',
    subColor: 'rgba(236, 232, 223, 0.82)',
    styleType: 'top-left',
    worldPos: new THREE.Vector3(shorelineSc.x, 3.2, shorelineSc.z),
    offsetX: -265,
    offsetY: -78,
    camKey: 'bayshore',
    priority: 80
  },
  {
    id: 'call-creek',
    title: 'STEVENS CREEK TRAIL',
    sub: '(EMERALD)',
    subColor: '#46e094',
    styleType: 'bottom-right',
    worldPos: new THREE.Vector3(12.3, 0.4, 33.1),
    verticalDropVh: 0.89,
    camKey: 'overview',
    priority: 70
  }
];

const calloutSvg = document.getElementById('callout-svg');
const calloutPinsContainer = document.getElementById('callout-pins');
let pinsVisible = true;

const bayLabelEl = document.createElement('div');
bayLabelEl.className = 'water-label';
bayLabelEl.textContent = 'SF BAY WETLANDS';
calloutPinsContainer.appendChild(bayLabelEl);
const bayWaterWorldPos = new THREE.Vector3(-28.0, 0.4, -58.0);

const calloutDomElements = LANDMARK_CALLOUTS.map((item) => {
  const el = document.createElement('div');
  el.className = `landmark-callout callout-${item.styleType}`;
  el.id = item.id;
  el.innerHTML = `
    <div class="callout-title">${item.title}</div>
    <div class="callout-sub" style="color: ${item.subColor}">${item.sub}</div>
  `;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    flyToCameraPreset(item.camKey);
  });
  calloutPinsContainer.appendChild(el);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'rgba(236, 232, 223, 0.68)');
  line.setAttribute('stroke-width', '1.05');
  calloutSvg.appendChild(line);

  return { item, el, line };
});

function cacheCalloutDimensions() {
  calloutDomElements.forEach(({ item, el }) => {
    const prevDisplay = el.style.display;
    const prevVis = el.style.visibility;
    el.style.visibility = 'hidden';
    el.style.display = 'block';
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width || el.offsetWidth || 195);
    const h = Math.round(rect.height || el.offsetHeight || 32);
    item.cachedWidth = w > 0 ? w : 195;
    item.cachedHeight = h > 0 ? h : 32;
    el.style.display = prevDisplay;
    el.style.visibility = prevVis;
  });

  const prevBayDisplay = bayLabelEl.style.display;
  const prevBayVis = bayLabelEl.style.visibility;
  bayLabelEl.style.visibility = 'hidden';
  bayLabelEl.style.display = 'block';
  const bRect = bayLabelEl.getBoundingClientRect();
  const bw = Math.round(bRect.width || bayLabelEl.offsetWidth || 140);
  const bh = Math.round(bRect.height || bayLabelEl.offsetHeight || 18);
  bayLabelEl._cachedWidth = bw > 0 ? bw : 140;
  bayLabelEl._cachedHeight = bh > 0 ? bh : 18;
  bayLabelEl.style.display = prevBayDisplay;
  bayLabelEl.style.visibility = prevBayVis;
}

cacheCalloutDimensions();
window.addEventListener('resize', cacheCalloutDimensions);

function checkAABBOverlap(boxA, boxB, pad = 6) {
  return !(
    boxA.right + pad <= boxB.left ||
    boxA.left >= boxB.right + pad ||
    boxA.bottom + pad <= boxB.top ||
    boxA.top >= boxB.bottom + pad
  );
}

function updateCalloutProjections() {
  if (!pinsVisible || window.innerWidth <= 960) {
    calloutSvg.style.display = 'none';
    calloutPinsContainer.style.display = 'none';
    return;
  }
  calloutSvg.style.display = 'block';
  calloutPinsContainer.style.display = 'block';

  const w = window.innerWidth;
  const h = window.innerHeight;
  const candidates = [];

  const bayProj = bayWaterWorldPos.clone().project(camera);
  const bx = (bayProj.x * 0.5 + 0.5) * w;
  const by = (-bayProj.y * 0.5 + 0.5) * h;
  const bw = bayLabelEl._cachedWidth || 140;
  const bh = bayLabelEl._cachedHeight || 18;

  let waterCandidate = null;
  if (bayProj.z < 1 && bx > 240 && bx < w - 240 && by > 65 && by < h - 180) {
    waterCandidate = {
      id: 'water-label',
      type: 'water',
      priority: 50,
      baseX: bx,
      baseY: by,
      w: bw,
      h: bh,
      placed: false
    };
    candidates.push(waterCandidate);
  } else {
    bayLabelEl.style.display = 'none';
  }

  calloutDomElements.forEach(({ item, el, line }) => {
    const proj = item.worldPos.clone().project(camera);
    const sx = (proj.x * 0.5 + 0.5) * w;
    const sy = (-proj.y * 0.5 + 0.5) * h;
    const tw = item.cachedWidth || 195;
    const th = item.cachedHeight || 32;

    if (proj.z > 1 || sx < 235 || sx > w - 235 || sy < 55 || sy > h - 55) {
      el.style.display = 'none';
      line.style.display = 'none';
      return;
    }

    candidates.push({
      id: item.id,
      type: 'landmark',
      item,
      el,
      line,
      priority: item.priority || 70,
      sx,
      sy,
      tw,
      th,
      styleType: item.styleType,
      placed: false
    });
  });

  candidates.sort((a, b) => b.priority - a.priority);

  const placedBoxes = [];
  const pad = 6;
  const activePlannerDrawer = document.getElementById('planner-drawer');
  if (activePlannerDrawer && !activePlannerDrawer.classList.contains('collapsed')) {
    const pRect = activePlannerDrawer.getBoundingClientRect();
    if (pRect.width > 0 && pRect.height > 0) {
      placedBoxes.push({
        id: 'planner-drawer-guard',
        left: pRect.left - 8,
        right: pRect.right + 8,
        top: pRect.top - 12,
        bottom: pRect.bottom + 8
      });
    }
  }

  function overlapsAny(testBox) {
    for (let i = 0; i < placedBoxes.length; i++) {
      if (checkAABBOverlap(testBox, placedBoxes[i], pad)) {
        return true;
      }
    }
    return false;
  }

  for (const c of candidates) {
    if (c.type === 'water') {
      const testBox = {
        left: c.baseX - c.w * 0.5,
        right: c.baseX + c.w * 0.5,
        top: c.baseY - c.h * 0.5,
        bottom: c.baseY + c.h * 0.5
      };
      if (!overlapsAny(testBox)) {
        c.placed = true;
        c.box = testBox;
        placedBoxes.push({ id: c.id, ...testBox });
      }
      continue;
    }

    const sx = c.sx;
    const sy = c.sy;
    const tw = c.tw;
    const th = c.th;

    if (c.styleType === 'top-left') {
      const baseLx = Math.max(235, Math.min(w - 280, sx + (c.item.offsetX || -245)));
      const baseLy = Math.max(68, sy + (c.item.offsetY || -64));
      const vOffsets = [0, -22, 22, -44, 44, -66, 66, -88, 88];
      const hOffsets = [0, -28, 28, -56, 56];
      let bestPlacement = null;

      for (const dy of vOffsets) {
        for (const dx of hOffsets) {
          const testLx = Math.max(235, Math.min(w - 280, baseLx + dx));
          const testLy = Math.max(68, Math.min(h - 190, baseLy + dy));
          const testBox = {
            left: testLx,
            right: testLx + tw,
            top: testLy - th * 0.5,
            bottom: testLy + th * 0.5
          };
          if (!overlapsAny(testBox)) {
            bestPlacement = { lx: testLx, ly: testLy, box: testBox };
            break;
          }
        }
        if (bestPlacement) break;
      }

      if (bestPlacement) {
        c.placed = true;
        c.lx = bestPlacement.lx;
        c.ly = bestPlacement.ly;
        c.box = bestPlacement.box;
        placedBoxes.push({ id: c.id, ...bestPlacement.box });
      }
    } else if (c.styleType === 'top-right') {
      const baseLx = Math.max(235, Math.min(w - 430, sx + (c.item.offsetX || 34)));
      const baseLy = Math.max(68, sy + (c.item.offsetY || -50));
      const vOffsets = [0, -22, 22, -44, 44, -66, 66, -88, 88];
      const hOffsets = [0, 28, -28, 56, -56];
      let bestPlacement = null;

      for (const dy of vOffsets) {
        for (const dx of hOffsets) {
          const testLx = Math.max(235, Math.min(w - 430, baseLx + dx));
          const testLy = Math.max(68, Math.min(h - 190, baseLy + dy));
          const testBox = {
            left: testLx,
            right: testLx + tw,
            top: testLy - th * 0.5,
            bottom: testLy + th * 0.5
          };
          if (!overlapsAny(testBox)) {
            bestPlacement = { lx: testLx, ly: testLy, box: testBox };
            break;
          }
        }
        if (bestPlacement) break;
      }

      if (bestPlacement) {
        c.placed = true;
        c.lx = bestPlacement.lx;
        c.ly = bestPlacement.ly;
        c.box = bestPlacement.box;
        placedBoxes.push({ id: c.id, ...bestPlacement.box });
      }
    } else if (c.styleType === 'bottom-left' || c.styleType === 'bottom-right') {
      const isLeft = c.styleType === 'bottom-left';
      const baseBottomY = Math.max(sy + 48, Math.min(h - 34, h * (c.item.verticalDropVh || 0.8)));
      const yOffsets = [0, 20, -20, 40, -40, 60, -60];
      let bestPlacement = null;
      const alignmentOrder = [isLeft, !isLeft];

      for (const tryLeft of alignmentOrder) {
        for (const dy of yOffsets) {
          const testBottomY = Math.max(sy + 40, Math.min(h - 30, baseBottomY + dy));
          const testBox = tryLeft
            ? { left: sx - tw, right: sx, top: testBottomY - th * 0.76, bottom: testBottomY + th * 0.24 }
            : { left: sx, right: sx + tw, top: testBottomY - th * 0.76, bottom: testBottomY + th * 0.24 };

          if (testBox.left >= 235 && testBox.right <= w - 235 && !overlapsAny(testBox)) {
            bestPlacement = { bottomY: testBottomY, box: testBox, usedLeft: tryLeft };
            break;
          }
        }
        if (bestPlacement) break;
      }

      if (bestPlacement) {
        c.placed = true;
        c.bottomY = bestPlacement.bottomY;
        c.usedLeft = bestPlacement.usedLeft;
        c.box = bestPlacement.box;
        placedBoxes.push({ id: c.id, ...bestPlacement.box });
      }
    }
  }

  if (waterCandidate && waterCandidate.placed) {
    bayLabelEl.style.left = `${waterCandidate.baseX}px`;
    bayLabelEl.style.top = `${waterCandidate.baseY}px`;
    bayLabelEl.style.display = 'block';
  } else {
    bayLabelEl.style.display = 'none';
  }

  for (const c of candidates) {
    if (c.type === 'water') continue;
    if (!c.placed) {
      c.el.style.display = 'none';
      c.line.style.display = 'none';
      continue;
    }

    c.el.style.display = 'block';
    c.line.style.display = 'block';

    if (c.styleType === 'top-left') {
      c.el.style.left = `${c.lx}px`;
      c.el.style.top = `${c.ly}px`;
      const elbowX = c.lx + c.tw + 8;
      const elbowY = c.ly;
      c.line.setAttribute(
        'points',
        `${c.lx.toFixed(1)},${elbowY.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${c.sx.toFixed(1)},${c.sy.toFixed(1)}`
      );
    } else if (c.styleType === 'top-right') {
      c.el.style.left = `${c.lx}px`;
      c.el.style.top = `${c.ly}px`;
      const elbowX = c.lx - 10;
      const elbowY = c.ly;
      const rightEnd = c.lx + c.tw;
      c.line.setAttribute(
        'points',
        `${rightEnd.toFixed(1)},${elbowY.toFixed(1)} ${elbowX.toFixed(1)},${elbowY.toFixed(1)} ${c.sx.toFixed(1)},${c.sy.toFixed(1)}`
      );
    } else if (c.styleType === 'bottom-left' || c.styleType === 'bottom-right') {
      if (c.usedLeft !== (c.styleType === 'bottom-left')) {
        c.el.className = `landmark-callout callout-${c.usedLeft ? 'bottom-left' : 'bottom-right'}`;
      }
      c.el.style.left = `${c.sx}px`;
      c.el.style.top = `${c.bottomY}px`;
      c.line.setAttribute(
        'points',
        `${c.sx.toFixed(1)},${c.sy.toFixed(1)} ${c.sx.toFixed(1)},${c.bottomY.toFixed(1)}`
      );
    }
  }
}

// ============================================================================
// 6. INITIALIZE PIPELINE, ENGINES, PLANNER UTILITY & UI BINDINGS (BUGS #1 & #2)
// ============================================================================
const audioEngine = new TwinAudioEngine();
const telemetryPipeline = new TelemetryPipeline();
const simEngines = new SimulationEngines(mvGisData, telemetryPipeline);

let activeGisLayer = 'massing';
let selectedParcel = parcelRecords.find((p) => p.district === 'DT_CRA') || parcelRecords[0] || null;
let isAutoOrbit = false;

const CAMERA_PRESETS = {
  overview: {
    pos: new THREE.Vector3(-126.0, 138.0, 136.0),
    target: new THREE.Vector3(0.0, -4.0, 2.0),
    label: '360° ISOMETRIC ORBITAL VIEW'
  },
  bayshore: {
    pos: new THREE.Vector3(-42, 36, 4),
    target: new THREE.Vector3(2, 1, -33),
    label: 'NORTH BAYSHORE // BAY VIEW & SHORELINE'
  },
  castro: {
    pos: new THREE.Vector3(-42, 34, 52),
    target: new THREE.Vector3(2, 1, 10),
    label: 'DOWNTOWN CASTRO & CALTRAIN TRANSIT HUB'
  },
  sanantonio: {
    pos: new THREE.Vector3(-76, 34, 28),
    target: new THREE.Vector3(-31, 1, -8),
    label: 'SAN ANTONIO // CALTRAIN STATION & TOD CENTER'
  },
  moffett: {
    pos: new THREE.Vector3(-12, 38, 22),
    target: new THREE.Vector3(28, 2, -20),
    label: 'MOFFETT AIRFIELD & NASA AMES HANGAR ONE'
  },
  southmv: {
    pos: new THREE.Vector3(-48, 42, 88),
    target: new THREE.Vector3(2, 1, 36),
    label: 'SOUTH MOUNTAIN VIEW // CUESTA PARK & SR-85'
  }
};

let camFlight = null;

function flyToCameraPreset(key) {
  const preset = CAMERA_PRESETS[key] || CAMERA_PRESETS.overview;
  selectionBeacon.visible = false;
  if (prefersReducedMotionQuery && prefersReducedMotionQuery.matches) {
    camera.position.copy(preset.pos);
    controls.target.copy(preset.target);
    controls.update();
    camFlight = null;
  } else {
    camFlight = {
      startPos: camera.position.clone(),
      endPos: preset.pos.clone(),
      startTarget: controls.target.clone(),
      endTarget: preset.target.clone(),
      progress: 0
    };
  }
  const labelEl = document.getElementById('view-mode-label');
  if (labelEl) labelEl.textContent = preset.label;

  document.querySelectorAll('[data-cam]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cam === key);
  });
  audioEngine.playTelemetryChime(659.25);
}

function applyGisOverlayColors() {
  const snapshot = telemetryPipeline.getSnapshot();
  const vc101 = snapshot ? snapshot.corridors.us101.vc : 0.88;

  if (activeGisLayer === 'traffic') {
    const colHex = vc101 >= 0.82 ? 0xff5252 : vc101 >= 0.56 ? 0xffb84d : 0x48ecff;
    us101Main.mat.color.setHex(colHex).multiplyScalar(1.45);
  } else {
    us101Main.mat.color.setHex(0x8efaff).multiplyScalar(1.62);
  }

  const surgeM = simEngines.params.baySurge;
  if (activeGisLayer === 'flood' || surgeM > 0.05) {
    const effectiveSurge = activeGisLayer === 'flood' ? Math.max(0.8, surgeM) : surgeM;
    surgeWaterMat.opacity = Math.min(0.62, 0.18 + effectiveSurge * 0.22);
    surgeWaterMesh.position.y = -0.12 + effectiveSurge * 0.34;
    surgeWaterMesh.visible = true;
  } else {
    surgeWaterMat.opacity = 0.0;
    surgeWaterMesh.position.y = -0.14;
    surgeWaterMesh.visible = false;
  }

  for (const p of parcelRecords) {
    if (p.currentZoneKey === 'PARK') {
      p.mat.color.setHex(0x28a86b);
      p.mat.emissive.setHex(0x0d472b);
      p.mat.emissiveIntensity = 0.35;
      continue;
    }

    if (activeGisLayer === 'massing') {
      const isUpzoned = simEngines.parcelOverrides.has(p.id);
      p.mat.color.setHex(isUpzoned ? 0xfff6e0 : p.baseColorHex);
      p.mat.emissive.setHex(isUpzoned ? 0x48ecff : p.baseEmissiveHex);
      p.mat.emissiveIntensity = isUpzoned ? 0.32 : p.baseEmissiveIntensity;
    } else if (activeGisLayer === 'traffic') {
      const tripIntensity = Math.min(1, (p.units + p.jobs) / 480);
      const col = new THREE.Color().setHSL(0.48 - tripIntensity * 0.46, 0.85, 0.54);
      p.mat.color.copy(col);
      p.mat.emissive.copy(col);
      p.mat.emissiveIntensity = 0.28;
    } else if (activeGisLayer === 'thermal') {
      const heatNorm = Math.max(0, Math.min(1, (p.heatDelta + 1.0) / 3.2));
      const col = new THREE.Color().setHSL(0.42 - heatNorm * 0.39, 0.88, 0.52);
      p.mat.color.copy(col);
      p.mat.emissive.copy(col);
      p.mat.emissiveIntensity = 0.3;
    } else if (activeGisLayer === 'flood') {
      const totalWater = 1.65 + (activeGisLayer === 'flood' ? Math.max(0.8, surgeM) : surgeM);
      const risk = totalWater >= p.elevationThreshold ? 1.0 : 0.05;
      const col = risk > 0.35 ? new THREE.Color(0x2bc4ff) : new THREE.Color(0x8899a8);
      p.mat.color.copy(col);
      p.mat.emissive.setHex(risk > 0.35 ? 0x0088cc : 0x101820);
      p.mat.emissiveIntensity = risk > 0.35 ? 0.45 : 0.08;
    }
  }

  for (const distMesh of staticBuildingsGroup.children) {
    const dKey = distMesh.userData.district;
    const mat = distMesh.material;
    if (!mat) continue;
    if (activeGisLayer === 'massing') {
      mat.color.setHex(distMesh.userData.baseColorHex || 0xf7f4eb);
      mat.emissive.setHex(0x10161e);
      mat.emissiveIntensity = 0.025;
    } else if (activeGisLayer === 'traffic') {
      const isHighTrip = dKey === 'DT_CRA' || dKey === 'ECR_MU' || dKey === 'SA_PP' || dKey === 'NB_PP';
      mat.color.setHex(isHighTrip ? 0xf2b468 : 0x76d4dc);
      mat.emissive.setHex(isHighTrip ? 0x5c3208 : 0x0c343c);
      mat.emissiveIntensity = 0.22;
    } else if (activeGisLayer === 'thermal') {
      const isCool = simEngines.params.canopyMandate >= 24 || dKey === 'RES_SF';
      mat.color.setHex(isCool ? 0x62d898 : 0xf29c52);
      mat.emissive.setHex(isCool ? 0x0c3c22 : 0x542206);
      mat.emissiveIntensity = 0.22;
    } else if (activeGisLayer === 'flood') {
      const isFloodZone = dKey === 'NB_PP';
      mat.color.setHex(isFloodZone ? 0x2bc4ff : 0x8899a8);
      mat.emissive.setHex(isFloodZone ? 0x006699 : 0x101820);
      mat.emissiveIntensity = isFloodZone ? 0.36 : 0.06;
    }
  }
}

let plannerUtilityInstance = null;
function getPlannerUtility() {
  if (!plannerUtilityInstance && typeof createPlannerUtility === 'function') {
    plannerUtilityInstance = createPlannerUtility(window.MountainViewTwin || null);
  }
  return plannerUtilityInstance;
}

function updateInspectorUI(parcel) {
  if (!parcel) return;
  selectedParcel = parcel;
  selectionBeacon.visible = true;
  selectionBeacon.position.set(parcel.x, 0, parcel.z);
  selectionBeacon.scale.set(
    Math.max(1.2, (parcel.w || 2.4) * 1.08),
    Math.max(0.5, (parcel.targetHeight || parcel.currentHeight || 1.0) * 1.04),
    Math.max(1.2, (parcel.d || 2.4) * 1.08)
  );

  const idEl = document.getElementById('parcel-id-label');
  const badgeEl = document.getElementById('parcel-zone-badge');
  const descEl = document.getElementById('parcel-desc-label');
  const statsEl = document.getElementById('parcel-stats-label');

  const bName = parcel.name ? ` (${parcel.name.toUpperCase()})` : '';
  const staticTag = parcel.isStaticOsmBuilding ? ' [STATIC OSM FOOTPRINT]' : '';
  if (idEl) idEl.textContent = `${parcel.isStaticOsmBuilding ? 'BUILDING' : 'PARCEL'}: ${parcel.id}${bName}${staticTag}`;
  if (badgeEl) badgeEl.textContent = parcel.currentZoneCode || 'R-1 LOW';
  const lat = parcel.lat !== undefined ? parcel.lat : (sceneToGeo(parcel.x, parcel.z).lat);
  const lon = parcel.lon !== undefined ? parcel.lon : (sceneToGeo(parcel.x, parcel.z).lon);
  const areaSqm = Math.round(parcel.areaSqm || ((parcel.w || 2.4) * (parcel.d || 2.4) * 180));
  const areaSqFt = Math.round(areaSqm * 10.7639);
  if (descEl) {
    const heightSrcNote = parcel.heightSource === 'osm_tag' ? 'OSM Height Tag' : 'Zoning Default';
    descEl.textContent = `${parcel.districtName} · Lat/Lon: ${lat.toFixed(5)}, ${lon.toFixed(5)} · Area: ${areaSqm.toLocaleString()} m² (${areaSqFt.toLocaleString()} sq ft) · Height: ${heightSrcNote}`;
  }
  const stories = parcel.levels || Math.max(1, Math.round((parcel.targetHeight || 1.0) * 1.8));
  const heightM = parcel.heightM || +((parcel.targetHeight || 1.0) * 4.2).toFixed(1);
  const heightFt = Math.round(heightM * 3.28084);
  const zDef = ZONE_DEFS[parcel.currentZoneKey] || ZONE_DEFS.MU6;
  if (statsEl) {
    const unitsVal = parcel.units !== undefined ? `${parcel.units} Units · ${parcel.jobs} Jobs · ` : '';
    statsEl.textContent = `FAR ${parcel.targetFar || zDef.baseFar} · ${stories} Stories (${heightM}m / ${heightFt}ft) · ${unitsVal}${zDef.label}`;
  }

  // Bug #1 Fix: Guard against pf.error and ensure window.MountainViewTwin exists before runSimulationCycle('init')
  const util = window.MountainViewTwin?.plannerUtility || getPlannerUtility();
  if (util) {
    try {
      const pf = util.getParcelProForma(parcel.id);
      if (pf && !pf.error) {
        const pfFootprint = document.getElementById('pf-footprint');
        const pfFarVal = document.getElementById('pf-far-val');
        const pfGfa = document.getElementById('pf-gfa');
        const pfYields = document.getElementById('pf-yields');
        const pfTrips = document.getElementById('pf-trips');
        const pfVmt = document.getElementById('pf-vmt');
        const pfEco = document.getElementById('pf-eco');
        const batchDistName = document.getElementById('batch-district-name');

        if (pfFootprint) pfFootprint.textContent = `${pf.footprintSqm.toLocaleString()} m² (${pf.footprintSqft.toLocaleString()} sq ft)`;
        if (pfFarVal) pfFarVal.textContent = `${pf.targetFar}`;
        if (pfGfa) pfGfa.textContent = `${pf.gfaSqm.toLocaleString()} m² (${pf.gfaSqft.toLocaleString()} sq ft)`;
        if (pfYields) pfYields.textContent = `${pf.dwellingUnits.toLocaleString()} DU · ${pf.commercialJobs.toLocaleString()} Jobs`;
        if (pfTrips) pfTrips.textContent = `${pf.iteNetDailyTrips.toLocaleString()} trips/day`;
        const stationShort = pf.nearestStation.includes('San Antonio') ? 'San Antonio' : 'Castro';
        if (pfVmt) pfVmt.textContent = `-${pf.vmtReductionPercent}% VMT (${pf.transitProximityMeters}m to ${stationShort})`;
        if (pfEco) pfEco.textContent = `${pf.solarPvPotentialKw} kW Solar (${pf.solarAnnualMwh} MWh/y) · ${pf.stormwaterRetentionM3} m³ Runoff`;
        if (batchDistName) batchDistName.textContent = pf.districtName;
      }
    } catch (e) {
      console.warn('Pro-forma calculation note:', e);
    }
  }

  document.querySelectorAll('[data-rezone]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rezone === parcel.currentZoneKey);
    btn.disabled = Boolean(parcel.isStaticOsmBuilding);
    btn.title = parcel.isStaticOsmBuilding
      ? 'Static OSM building footprint (select a zoning parcel to rezone)'
      : `Rezone parcel to ${btn.textContent}`;
  });
}

// Subscribe DOM Telemetry Readouts to TelemetryPipeline
telemetryPipeline.subscribe((snap) => {
  const los101El = document.getElementById('los-101');
  const losEcrEl = document.getElementById('los-ecr');
  if (los101El) {
    los101El.textContent = snap.corridors.us101.label;
    los101El.className = snap.corridors.us101.cls;
  }
  if (losEcrEl) {
    losEcrEl.textContent = snap.corridors.ecr.label;
    losEcrEl.className = snap.corridors.ecr.cls;
  }

  const caltrainEl = document.getElementById('metric-caltrain');
  if (caltrainEl) {
    caltrainEl.textContent = `${snap.caltrainHeadway} min · ${snap.caltrainBoardingsK}k/d`;
  }

  const modeShareEl = document.getElementById('metric-mode-share');
  if (modeShareEl) {
    modeShareEl.textContent = `${snap.transitShare.toFixed(1)}%`;
  }

  const climateEl = document.getElementById('metric-climate');
  if (climateEl) {
    const sign = snap.uhiDelta > 0 ? '+' : '';
    climateEl.textContent = `${sign}${snap.uhiDelta}°C · ${snap.baySurge.toFixed(1)}m`;
  }

  const greenEl = document.getElementById('metric-greenspace');
  if (greenEl) {
    greenEl.textContent = snap.greenspacePct.toFixed(1);
  }
  const deltaGreenEl = document.getElementById('delta-greenspace');
  if (deltaGreenEl) {
    const diff = +(snap.greenspacePct - 16.4).toFixed(1);
    deltaGreenEl.textContent = diff === 0 ? 'BASELINE' : `${diff > 0 ? '+' : ''}${diff}% CANOPY`;
  }
  const solarSubEl = document.getElementById('metric-solar-sub');
  if (solarSubEl) {
    solarSubEl.textContent = `SOLAR PV: ${snap.solarMw} MW · RUNOFF CAPTURE: ${snap.runoffCapturePct}%`;
  }

  const popEl = document.getElementById('metric-population');
  if (popEl) {
    popEl.textContent = snap.population.toLocaleString();
  }
  const deltaPopEl = document.getElementById('delta-population');
  if (deltaPopEl) {
    const rhnaPct = ((Math.max(0, snap.rhnaDelta) / 11135) * 100).toFixed(1);
    deltaPopEl.textContent = `RHNA ${snap.rhnaDelta >= 0 ? '+' : ''}${snap.rhnaDelta.toLocaleString()} / 11,135 (${rhnaPct}%)`;
  }
  const housingSubEl = document.getElementById('metric-housing-sub');
  if (housingSubEl) {
    housingSubEl.textContent = `${snap.housingUnits.toLocaleString()} UNITS · JOBS/HOUSING ${snap.jobsHousingRatio}:1`;
  }
});

// ============================================================================
// 7. CITY PLANNER DECISION-SUPPORT SUITE UI & EVENT INTEGRATION (BUG #2 FIXED)
// ============================================================================
let currentPlannerDistrict = 'NB_PP';
let currentExportFormat = 'markdown';

function updatePlannerUI() {
  const util = getPlannerUtility();
  if (!util) return;

  // 1. Update RHNA Tab
  try {
    const rhna = util.getRhnaTierBreakdown();
    const netEl = document.getElementById('rhna-net-units');
    const pctEl = document.getElementById('rhna-master-pct');
    const barFill = document.getElementById('rhna-bar-fill');
    const badgeEl = document.getElementById('rhna-stat-badge');
    const inclEl = document.getElementById('rhna-inclusionary-rate');

    if (netEl) netEl.textContent = rhna.currentNetUnits.toLocaleString();
    if (pctEl) pctEl.textContent = `${rhna.percentComplete}%`;
    if (barFill) barFill.style.width = `${Math.min(100, Math.max(0, rhna.percentComplete))}%`;
    if (inclEl) inclEl.textContent = `${rhna.effectiveInclusionaryRate}%`;
    if (badgeEl) {
      if (rhna.percentComplete >= 100) {
        badgeEl.textContent = 'MANDATE MET';
        badgeEl.style.color = 'var(--emerald)';
        badgeEl.style.borderColor = 'rgba(70, 224, 148, 0.4)';
      } else {
        badgeEl.textContent = 'IN PROGRESS';
        badgeEl.style.color = 'var(--amber)';
        badgeEl.style.borderColor = 'rgba(242, 174, 73, 0.35)';
      }
    }

    const tiers = rhna.tiers;
    if (tiers) {
      const vliVal = document.getElementById('tier-vli-val');
      const vliFill = document.getElementById('tier-vli-fill');
      const vliPct = document.getElementById('tier-vli-pct');
      if (vliVal) vliVal.textContent = `${tiers.veryLow.units.toLocaleString()} / ${tiers.veryLow.target.toLocaleString()}`;
      if (vliFill) vliFill.style.width = `${Math.min(100, Math.max(0, tiers.veryLow.percent))}%`;
      if (vliPct) vliPct.textContent = `${tiers.veryLow.percent}% met`;

      const liVal = document.getElementById('tier-li-val');
      const liFill = document.getElementById('tier-li-fill');
      const liPct = document.getElementById('tier-li-pct');
      if (liVal) liVal.textContent = `${tiers.low.units.toLocaleString()} / ${tiers.low.target.toLocaleString()}`;
      if (liFill) liFill.style.width = `${Math.min(100, Math.max(0, tiers.low.percent))}%`;
      if (liPct) liPct.textContent = `${tiers.low.percent}% met`;

      const modVal = document.getElementById('tier-mod-val');
      const modFill = document.getElementById('tier-mod-fill');
      const modPct = document.getElementById('tier-mod-pct');
      if (modVal) modVal.textContent = `${tiers.moderate.units.toLocaleString()} / ${tiers.moderate.target.toLocaleString()}`;
      if (modFill) modFill.style.width = `${Math.min(100, Math.max(0, tiers.moderate.percent))}%`;
      if (modPct) modPct.textContent = `${tiers.moderate.percent}% met`;

      const amodVal = document.getElementById('tier-amod-val');
      const amodFill = document.getElementById('tier-amod-fill');
      const amodPct = document.getElementById('tier-amod-pct');
      if (amodVal) amodVal.textContent = `${tiers.aboveModerate.units.toLocaleString()} / ${tiers.aboveModerate.target.toLocaleString()}`;
      if (amodFill) amodFill.style.width = `${Math.min(100, Math.max(0, tiers.aboveModerate.percent))}%`;
      if (amodPct) amodPct.textContent = `${tiers.aboveModerate.percent}% met`;
    }
  } catch (err) {
    console.warn('Error updating RHNA UI:', err);
  }

  // 2. Update Districts Tab
  try {
    const scorecards = util.getDistrictScorecards();
    const sc = scorecards[currentPlannerDistrict] || scorecards.NB_PP;
    if (sc) {
      const nameEl = document.getElementById('dist-card-name');
      const codeEl = document.getElementById('dist-card-code');
      const parcelsEl = document.getElementById('dist-stat-parcels');
      const areaEl = document.getElementById('dist-stat-area');
      const farEl = document.getElementById('dist-stat-far');
      const unitsEl = document.getElementById('dist-stat-units');
      const jobsEl = document.getElementById('dist-stat-jobs');
      const jhEl = document.getElementById('dist-stat-jh');
      const rhnaPctEl = document.getElementById('dist-stat-rhna-pct');

      if (nameEl) nameEl.textContent = sc.name;
      if (codeEl) codeEl.textContent = sc.code;
      if (parcelsEl) parcelsEl.textContent = sc.parcelCount.toLocaleString();
      if (areaEl) areaEl.textContent = `${sc.totalFootprintSqm.toLocaleString()} m² (${sc.totalFootprintAcres} ac)`;
      if (farEl) farEl.textContent = `${sc.currentFar.toFixed(2)} / ${sc.targetFar.toFixed(2)}`;
      if (unitsEl) unitsEl.textContent = `+${sc.netAddedUnits.toLocaleString()} DU`;
      if (jobsEl) jobsEl.textContent = `+${sc.netAddedJobs.toLocaleString()} Jobs`;
      if (jhEl) jhEl.textContent = `${sc.jobsHousingRatio}:1`;
      if (rhnaPctEl) rhnaPctEl.textContent = `${sc.rhnaContributionPercent}% of Mandate`;
    }
  } catch (err) {
    console.warn('Error updating District UI:', err);
  }

  // 3. Update Scenario Comparator Tab
  try {
    const comp = util.getScenarioComparison();
    const badge = document.getElementById('comparator-active-badge');
    if (badge) badge.textContent = `ACTIVE: ${comp.activeScenarioName.toUpperCase()}`;

    const tbody = document.getElementById('comparator-tbody');
    if (tbody && Array.isArray(comp.indicators)) {
      tbody.innerHTML = '';
      for (const ind of comp.indicators) {
        const tr = document.createElement('tr');
        const isPos = String(ind.delta).startsWith('+');
        const isNeg = String(ind.delta).startsWith('-');
        let cls = 'delta-zero';
        if (ind.key === 'us101_vc_los' || ind.key === 'ecr_vc_los') {
          cls = isNeg ? 'delta-pos' : (isPos ? 'delta-neg' : 'delta-zero');
        } else if (ind.key === 'flood_exposed_parcels') {
          cls = isPos ? 'delta-neg' : (isNeg ? 'delta-pos' : 'delta-zero');
        } else {
          cls = isPos ? 'delta-pos' : (isNeg ? 'delta-neg' : 'delta-zero');
        }

        tr.innerHTML = `
          <td><strong>${ind.label}</strong></td>
          <td align="right">${ind.baseline}</td>
          <td align="right">${ind.active}</td>
          <td align="right" class="${cls}">${ind.delta}</td>
        `;
        tbody.appendChild(tr);
      }
    }
  } catch (err) {
    console.warn('Error updating Comparator UI:', err);
  }

  // 4. Update Report Export Tab
  try {
    const previewEl = document.getElementById('export-preview-code');
    if (previewEl) {
      const rep = util.exportPlanningReport(currentExportFormat);
      previewEl.textContent = typeof rep === 'string' ? rep : JSON.stringify(rep, null, 2);
    }
  } catch (err) {
    console.warn('Error updating Export UI:', err);
  }
}

// Bug #2 Fix: Define refreshPlannerUtilityUI so runSimulationCycle refreshes all Planner tabs on every slider/scenario update
function refreshPlannerUtilityUI() {
  updatePlannerUI();
}

function formatHourLabel(hourFloat, tzOffsetHours, isOverride, altitudeDeg) {
  const h = Math.floor(hourFloat) % 24;
  const m = Math.round((hourFloat - Math.floor(hourFloat)) * 60) % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const tzName = tzOffsetHours === -8 ? 'PST' : 'PDT';
  const modeTag = isOverride ? `Alt ${altitudeDeg}°` : 'LIVE';
  return `${hh}:${mm} ${tzName} (${modeTag})`;
}

function updateSolarUiReadout(solar) {
  const valEl = document.getElementById('val-solar-time');
  const sliderEl = document.getElementById('slider-solar-hour');
  const isOverride = simEngines.solarHourOverride !== null && Number.isFinite(simEngines.solarHourOverride);
  if (valEl && solar) {
    valEl.textContent = formatHourLabel(solar.localHour, solar.tzOffsetHours, isOverride, solar.altitudeDeg);
  }
  if (sliderEl && !isOverride && solar) {
    sliderEl.value = String(Number(solar.localHour.toFixed(2)));
  }
}

function runSimulationCycle(reason = 'update') {
  const snapshot = simEngines.evaluateState(parcelRecords);
  if (reason === 'init') {
    for (const p of parcelRecords) {
      p.currentHeight = p.targetHeight;
      if (p.mesh) p.mesh.scale.y = p.currentHeight;
    }
  }
  telemetryPipeline.publish(snapshot, reason);
  applyGisOverlayColors();
  updateInspectorUI(selectedParcel);
  refreshPlannerUtilityUI();

  // Bug #10 Fix: Astronomical Solar Physics Lighting driven by real Pacific time or user time-scrubber
  const solar = simEngines.computeSolarPhysics();
  const R = 160;
  keyLight.position.set(solar.sunVector[0] * R, Math.max(30, solar.sunVector[1] * R), solar.sunVector[2] * R);
  updateSolarUiReadout(solar);
  requestShadowMapUpdate();

  return snapshot;
}

const geminiBridge = new GeminiUrbanBridge(simEngines, runSimulationCycle, () => parcelRecords);

function activateScenarioPreset(scenarioKey) {
  const preset = SCENARIO_PRESETS[scenarioKey];
  if (!preset) return null;

  simEngines.activeScenarioId = preset.id;
  simEngines.params.farCap = preset.farCap;
  simEngines.params.transitShare = preset.transitShare;
  simEngines.params.canopyMandate = preset.canopyMandate;
  simEngines.params.baySurge = preset.baySurge;
  simEngines.districtMultipliers = { ...preset.districtMultipliers };
  simEngines.parcelOverrides.clear();

  syncSlidersFromSim();
  const snap = runSimulationCycle(`scenario:${scenarioKey}`);

  document.querySelectorAll('[data-scenario]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scenario === scenarioKey);
  });

  const synthEl = document.getElementById('gemini-synthesis-text');
  if (synthEl) {
    synthEl.textContent = preset.summary;
  }

  audioEngine.playTelemetryChime(523.25);
  return snap;
}

// ============================================================================
// 8. ASSIGN window.MountainViewTwin BEFORE runSimulationCycle('init') (BUG #1 FIXED)
// ============================================================================
window.MountainViewTwin = {
  provenance: PROVENANCE,
  viewport: {
    scene,
    camera,
    renderer,
    controls,
    surfaceMesh,
    tableTexture: surfaceMat.map,
    parcelsGroup,
    parcelRecords,
    interactableMeshes,
    staticBuildingsGroup,
    corridorsGroup,
    landmarksGroup,
    districtLandmarksGroup,
    allLandmarks,
    CAMERA_PRESETS,
    mvGisData,
    geoToScene,
    sceneToGeo,
    stevensCreekSamples,
    get selectedParcel() {
      return selectedParcel;
    },
    corridors: {
      us101: us101Samples,
      caltrain: caltrainSamples,
      ecr: ecrSamples,
      castro: castroSamples,
      shoreline: shorelineSamples,
      vta: vtaRailSamples,
      other: otherCorridorsSamples,
      stevensCreek: stevensCreekSamples
    },
    flyToCameraPreset,
    getActiveLayer: () => activeGisLayer,
    setActiveLayer: (layer) => {
      const btn = document.querySelector(`[data-layer="${layer}"]`);
      if (btn) btn.click();
    },
    selectParcelById: (id) => {
      const p = parcelRecords.find((item) => item.id === id);
      if (p) {
        updateInspectorUI(p);
        return {
          id: p.id,
          district: p.district,
          currentZoneKey: p.currentZoneKey,
          currentZoneCode: p.currentZoneCode,
          units: p.units,
          jobs: p.jobs,
          targetFar: p.targetFar,
          targetHeight: p.targetHeight
        };
      }
      return null;
    }
  },
  telemetry: telemetryPipeline,
  simulation: simEngines,
  geminiBridge,
  activateScenarioPreset,
  runSimulationCycle,
  refreshPlannerUtilityUI,
  get plannerUtility() {
    return getPlannerUtility();
  },
  set plannerUtility(val) {
    plannerUtilityInstance = val;
  }
};

window.MountainViewTwin.plannerUtility = createPlannerUtility(window.MountainViewTwin);
window.TelemetryPipeline = telemetryPipeline;
window.SimulationEngines = simEngines;

// Initial Baseline Evaluation (runs AFTER window.MountainViewTwin & plannerUtility are initialized)
runSimulationCycle('init');
selectionBeacon.visible = false;
telemetryPipeline.initLiveFeeds(simEngines, runSimulationCycle);

// ============================================================================
// 9. UI EVENT LISTENERS (SCENARIOS, SLIDERS, SOLAR SCRUBBER, RAYCASTING, A11Y)
// ============================================================================
function syncSlidersFromSim() {
  const sFar = document.getElementById('slider-far');
  const sTransit = document.getElementById('slider-transit');
  const sCanopy = document.getElementById('slider-canopy');
  const sSurge = document.getElementById('slider-surge');

  if (sFar) sFar.value = simEngines.params.farCap;
  if (sTransit) sTransit.value = simEngines.params.transitShare;
  if (sCanopy) sCanopy.value = Math.round(simEngines.params.canopyMandate);
  if (sSurge) sSurge.value = simEngines.params.baySurge;

  const valFar = document.getElementById('val-far');
  const valTransit = document.getElementById('val-transit');
  const valCanopy = document.getElementById('val-canopy');
  const valSurge = document.getElementById('val-surge');

  if (valFar) valFar.textContent = `${simEngines.params.farCap.toFixed(1)}x`;
  if (valTransit) valTransit.textContent = `${Math.round(simEngines.params.transitShare)}%`;
  if (valCanopy) valCanopy.textContent = `${Math.round(simEngines.params.canopyMandate)}%`;
  if (valSurge) valSurge.textContent = `${simEngines.params.baySurge.toFixed(1)}m`;
}

document.querySelectorAll('[data-scenario]').forEach((btn) => {
  btn.addEventListener('click', () => {
    activateScenarioPreset(btn.dataset.scenario);
  });
});

document.querySelectorAll('[data-layer]').forEach((btn) => {
  btn.addEventListener('click', () => {
    activeGisLayer = btn.dataset.layer;
    document.querySelectorAll('[data-layer]').forEach((b) => {
      b.classList.toggle('active', b.dataset.layer === activeGisLayer);
    });
    applyGisOverlayColors();
    audioEngine.playTelemetryChime(698.46);
  });
});

document.querySelectorAll('[data-cam]').forEach((btn) => {
  btn.addEventListener('click', () => {
    flyToCameraPreset(btn.dataset.cam);
  });
});

['slider-far', 'slider-transit', 'slider-canopy', 'slider-surge'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    simEngines.activeScenarioId = 'custom';
    simEngines.params.farCap = parseFloat(document.getElementById('slider-far').value);
    simEngines.params.transitShare = parseFloat(document.getElementById('slider-transit').value);
    simEngines.params.canopyMandate = parseFloat(document.getElementById('slider-canopy').value);
    simEngines.params.baySurge = parseFloat(document.getElementById('slider-surge').value);
    syncSlidersFromSim();
    document.querySelectorAll('[data-scenario]').forEach((b) => b.classList.remove('active'));
    runSimulationCycle('slider');
  });
});

// Solar Time-of-Day Scrubber & Live Reset (Bug #10)
const sliderSolarHour = document.getElementById('slider-solar-hour');
const btnSolarNow = document.getElementById('btn-solar-now');
if (sliderSolarHour) {
  sliderSolarHour.addEventListener('input', () => {
    const h = parseFloat(sliderSolarHour.value);
    if (Number.isFinite(h)) {
      simEngines.setSolarHourOverride(h);
      runSimulationCycle('solar-hour');
    }
  });
}
if (btnSolarNow) {
  btnSolarNow.addEventListener('click', () => {
    simEngines.setSolarHourOverride(null);
    runSimulationCycle('solar-now');
  });
}

// Honest Parcel Rezone Synthesis String (Section 1: zero PostGIS/TimescaleDB/SUMO/WebGPU claims)
document.querySelectorAll('[data-rezone]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!selectedParcel || selectedParcel.isStaticOsmBuilding) return;
    if (selectedParcel.mesh && selectedParcel.mesh.children.length === 0 && selectedParcel.bGeo) {
      const bMesh = new THREE.Mesh(selectedParcel.bGeo, selectedParcel.mat);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      bMesh.userData.parcel = selectedParcel;
      selectedParcel.mesh.add(bMesh);
      interactableMeshes.push(bMesh);
    }
    const zoneKey = btn.dataset.rezone;
    simEngines.parcelOverrides.set(selectedParcel.id, zoneKey);
    const snap = runSimulationCycle(`rezone:${selectedParcel.id}:${zoneKey}`);
    const synthEl = document.getElementById('gemini-synthesis-text');
    if (synthEl) {
      synthEl.textContent = `[ZONING OVERRIDE APPLIED] Parcel ${selectedParcel.id} (${selectedParcel.districtName}) rezoned to ${ZONE_DEFS[zoneKey].code} → ${selectedParcel.units} housing units, ${selectedParcel.jobs} jobs. City total: ${snap.housingUnits.toLocaleString()} units.`;
    }
    audioEngine.playTelemetryChime(783.99);
  });
});

// Sim Controls Drawer Toggle
const simDrawer = document.getElementById('sim-drawer');
const btnDrawerToggle = document.getElementById('btn-drawer-toggle');

function toggleSimDrawer(forceState) {
  if (!simDrawer) return;
  const isCollapsed = simDrawer.classList.contains('collapsed');
  const shouldCollapse = forceState !== undefined ? !forceState : !isCollapsed;
  simDrawer.classList.toggle('collapsed', shouldCollapse);
  if (btnDrawerToggle) {
    btnDrawerToggle.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
  }
}

if (btnDrawerToggle && simDrawer) {
  btnDrawerToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSimDrawer();
  });
}

['telemetry-left-card', 'telemetry-right-card', 'header-title-trigger'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', () => {
      toggleSimDrawer();
    });
  }
});

const headerCoordTrigger = document.getElementById('header-coord-trigger');
if (headerCoordTrigger) {
  headerCoordTrigger.addEventListener('click', () => {
    flyToCameraPreset('overview');
  });
}

// 360° Auto-Orbit, Pins, and Audio Toggles
const btnOrbitToggle = document.getElementById('btn-orbit-toggle');
if (btnOrbitToggle) {
  btnOrbitToggle.addEventListener('click', () => {
    isAutoOrbit = !isAutoOrbit;
    btnOrbitToggle.classList.toggle('active', isAutoOrbit);
    btnOrbitToggle.setAttribute('aria-pressed', isAutoOrbit ? 'true' : 'false');
  });
}

const btnPinsToggle = document.getElementById('btn-pins-toggle');
if (btnPinsToggle) {
  btnPinsToggle.addEventListener('click', () => {
    pinsVisible = !pinsVisible;
    btnPinsToggle.textContent = pinsVisible ? 'Pins: On' : 'Pins: Off';
    btnPinsToggle.classList.toggle('active', pinsVisible);
    btnPinsToggle.setAttribute('aria-pressed', pinsVisible ? 'true' : 'false');
  });
}

const btnAudioToggle = document.getElementById('btn-audio-toggle');
if (btnAudioToggle) {
  btnAudioToggle.addEventListener('click', () => {
    const playing = audioEngine.toggle();
    btnAudioToggle.classList.toggle('active', playing);
    btnAudioToggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
    btnAudioToggle.textContent = playing ? '♪ Playing' : '♪ Audio';
  });
}

// Optional Gemini 2.5 Flash API Key Management (Bug #8 Fixed: Never print key fragments in UI)
const geminiDrawer = document.getElementById('gemini-settings-card');
const btnGeminiToggle = document.getElementById('btn-gemini-toggle');
const btnCloseGemini = document.getElementById('btn-close-gemini-settings');
const geminiKeyInput = document.getElementById('gemini-key-input');
const btnSaveGeminiKey = document.getElementById('btn-save-gemini-key');
const btnClearGeminiKey = document.getElementById('btn-clear-gemini-key');
const geminiStatusLabel = document.getElementById('gemini-status-label');

function updateGeminiKeyStatus() {
  const hasKey = geminiBridge.hasApiKey();
  if (hasKey) {
    if (geminiStatusLabel) {
      geminiStatusLabel.textContent = 'Status: [GEMINI 2.5 FLASH (LIVE API)] Key stored in session';
      geminiStatusLabel.style.color = 'var(--emerald)';
    }
    if (geminiKeyInput && !geminiKeyInput.value) {
      geminiKeyInput.value = geminiBridge.getApiKey();
    }
  } else {
    if (geminiStatusLabel) {
      geminiStatusLabel.textContent = 'Status: [LOCAL INTENT PARSER] Active (Zero keys required)';
      geminiStatusLabel.style.color = '';
    }
    if (geminiKeyInput) geminiKeyInput.value = '';
  }
}
updateGeminiKeyStatus();

if (btnGeminiToggle && geminiDrawer) {
  btnGeminiToggle.addEventListener('click', () => {
    const willCollapse = !geminiDrawer.classList.contains('collapsed');
    geminiDrawer.classList.toggle('collapsed', willCollapse);
    btnGeminiToggle.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
    updateGeminiKeyStatus();
  });
}
if (btnCloseGemini && geminiDrawer) {
  btnCloseGemini.addEventListener('click', () => {
    geminiDrawer.classList.add('collapsed');
    if (btnGeminiToggle) btnGeminiToggle.setAttribute('aria-expanded', 'false');
  });
}
if (btnSaveGeminiKey) {
  btnSaveGeminiKey.addEventListener('click', () => {
    const val = geminiKeyInput ? geminiKeyInput.value.trim() : '';
    geminiBridge.setApiKey(val);
    updateGeminiKeyStatus();
  });
}
if (btnClearGeminiKey) {
  btnClearGeminiKey.addEventListener('click', () => {
    geminiBridge.clearApiKey();
    updateGeminiKeyStatus();
  });
}

// Gemini Natural Language Form Submission
const geminiForm = document.getElementById('gemini-form');
const geminiInput = document.getElementById('gemini-prompt-input');
if (geminiForm && geminiInput) {
  geminiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = geminiInput.value.trim() || 'Upzone El Camino Real to 6 stories with BRT and +30% solar canopy';
    simDrawer.classList.remove('collapsed');

    const synthEl = document.getElementById('gemini-synthesis-text');
    if (synthEl) synthEl.textContent = `Evaluating "${query}" across ${parcelRecords.length} Mountain View parcels...`;

    const resultText = await geminiBridge.executePrompt(query);
    syncSlidersFromSim();
    if (synthEl && resultText) {
      synthEl.textContent = resultText;
    }
    audioEngine.playTelemetryChime(880.0);
  });
}

// 3D Raycasting for Parcel & Static OSM Building Inspection (Bugs #6 & #11 Fixed)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersect = new THREE.Vector3();
let pointerDownPos = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointerDownPos = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons > 0 && Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) {
    camFlight = null;
  }
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(groundPlane, planeIntersect)) {
    const { lat, lon } = worldToLatLon(planeIntersect.x, planeIntersect.z);
    const coordEl = document.getElementById('cursor-coords');
    if (coordEl) {
      coordEl.textContent = `[LAT: ${lat.toFixed(2)}N, LON: ${Math.abs(lon).toFixed(2)}W]`;
    }
  }

  // Hover cursor feedback over interactive parcels
  if (e.buttons === 0) {
    const hoverHits = raycaster.intersectObjects(interactableMeshes, false);
    renderer.domElement.style.cursor = hoverHits.length > 0 ? 'pointer' : '';
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  // Bug #11 Fix: Ignore non-primary mouse buttons (right-click / middle-click orbit/pan)
  if (e.button !== 0) return;
  const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (dragDist > 6) return;

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects([...interactableMeshes, ...staticBuildingsGroup.children], false);
  if (hits.length > 0) {
    let clickedParcel = hits[0].object.userData.parcel;
    // Bug #6 Fix: When clicking a merged static building, look up exact interactive parcel or OSM building at hit point
    if (!clickedParcel) {
      const hitPt = hits[0].point;
      for (let i = 0; i < parcelRecords.length; i++) {
        const p = parcelRecords[i];
        if (
          hitPt.x >= (p.minX ?? p.x - p.w * 0.5) - 0.35 &&
          hitPt.x <= (p.maxX ?? p.x + p.w * 0.5) + 0.35 &&
          hitPt.z >= (p.minZ ?? p.z - p.d * 0.5) - 0.35 &&
          hitPt.z <= (p.maxZ ?? p.z + p.d * 0.5) + 0.35
        ) {
          clickedParcel = p;
          break;
        }
      }
      if (!clickedParcel) {
        const osmB = findOsmBuildingAtScenePoint(hitPt.x, hitPt.z, mvGisData, sceneToGeo, geoToScene);
        if (osmB) {
          const distKey = resolveDistrictKey(osmB.district, osmB.lon, osmB.lat);
          const zoneKey = osmB.zone === 'DT-P' || osmB.zone === 'SA-P'
            ? 'TOD10'
            : (osmB.zone === 'R' ? 'R1' : 'MU6');
          const zDef = ZONE_DEFS[zoneKey] || ZONE_DEFS.MU6;
          clickedParcel = {
            id: osmB.id,
            name: osmB.name || `OSM Building ${osmB.id}`,
            isStaticOsmBuilding: true,
            district: distKey,
            districtName: osmB.district || 'Mountain View',
            baseZone: zoneKey,
            currentZoneKey: zoneKey,
            currentZoneCode: osmB.zone || zDef.code,
            x: osmB.sceneX,
            z: osmB.sceneZ,
            w: osmB.sceneW,
            d: osmB.sceneD,
            lat: osmB.lat,
            lon: osmB.lon,
            areaSqm: Math.round(Number(osmB.area_m2) || 220),
            levels: osmB.levels || 1,
            heightM: osmB.height_m || 4.5,
            heightSource: osmB.height_source || 'district_zoning_default',
            currentHeight: osmB.sceneH,
            targetHeight: osmB.sceneH,
            targetFar: Number(((osmB.levels || 1) * 0.55).toFixed(2))
          };
        }
      }
    }
    if (clickedParcel) {
      simDrawer.classList.remove('collapsed');
      updateInspectorUI(clickedParcel);
      audioEngine.playTelemetryChime(659.25);
    }
  }
});

window.addEventListener('resize', () => {
  const pr = Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.5 : 2);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Planner Drawer Controls
const plannerDrawer = document.getElementById('planner-drawer');
const btnPlannerHeaderToggle = document.getElementById('btn-planner-header-toggle');
const btnPlannerPill = document.getElementById('btn-planner-pill');
const btnPlannerClose = document.getElementById('btn-planner-close');
const btnPlannerRefresh = document.getElementById('btn-planner-refresh');

function togglePlannerDrawer(forceState) {
  if (!plannerDrawer) return;
  const isCollapsed = plannerDrawer.classList.contains('collapsed');
  const targetOpen = forceState !== undefined ? forceState : isCollapsed;
  plannerDrawer.classList.toggle('collapsed', !targetOpen);
  if (btnPlannerPill) {
    btnPlannerPill.classList.toggle('active', targetOpen);
    btnPlannerPill.setAttribute('aria-expanded', targetOpen ? 'true' : 'false');
  }
  if (btnPlannerHeaderToggle) {
    btnPlannerHeaderToggle.classList.toggle('active', targetOpen);
    btnPlannerHeaderToggle.setAttribute('aria-expanded', targetOpen ? 'true' : 'false');
  }
  if (targetOpen) {
    if (window.innerWidth <= 884 && simDrawer && !simDrawer.classList.contains('collapsed')) {
      simDrawer.classList.add('collapsed');
    }
    updatePlannerUI();
  }
}

if (btnPlannerHeaderToggle) {
  btnPlannerHeaderToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlannerDrawer();
  });
}
if (btnPlannerPill) {
  btnPlannerPill.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlannerDrawer();
  });
}
if (btnPlannerClose) {
  btnPlannerClose.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlannerDrawer(false);
  });
}
if (btnPlannerRefresh) {
  btnPlannerRefresh.addEventListener('click', () => {
    runSimulationCycle('planner-refresh');
    updatePlannerUI();
  });
}

document.querySelectorAll('.planner-tab').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    const tabKey = tabBtn.dataset.tab;
    document.querySelectorAll('.planner-tab').forEach((b) => {
      const isActive = (b === tabBtn);
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.planner-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `tab-panel-${tabKey}`);
    });
    updatePlannerUI();
  });
});

document.querySelectorAll('.district-pills [data-district]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.district-pills [data-district]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentPlannerDistrict = btn.dataset.district;
    updatePlannerUI();
  });
});

const btnDistOrbit = document.getElementById('btn-dist-orbit');
if (btnDistOrbit) {
  btnDistOrbit.addEventListener('click', () => {
    const camMap = {
      NB_PP: 'bayshore',
      EW_TOD: 'moffett',
      ECR_MU: 'overview',
      SA_PP: 'sanantonio',
      DT_CRA: 'castro'
    };
    const preset = camMap[currentPlannerDistrict] || 'overview';
    flyToCameraPreset(preset);
  });
}

const btnBatchRezoneUndo = document.getElementById('btn-batch-rezone-undo');
function syncBatchUndoButton(canUndo) {
  if (btnBatchRezoneUndo) {
    btnBatchRezoneUndo.style.display = canUndo ? 'inline-block' : 'none';
  }
}

const btnDistRezoneAction = document.getElementById('btn-dist-rezone-action');
if (btnDistRezoneAction) {
  btnDistRezoneAction.addEventListener('click', () => {
    const util = getPlannerUtility();
    if (!util) return;
    const res = util.batchRezoneDistrict(currentPlannerDistrict, 'TOD10');
    if (res && res.success) {
      syncBatchUndoButton(res.canUndo);
      updatePlannerUI();
      if (selectedParcel) updateInspectorUI(selectedParcel);
      audioEngine.playTelemetryChime(880.0);
    }
  });
}

const btnBatchRezone = document.getElementById('btn-batch-rezone');
if (btnBatchRezone) {
  btnBatchRezone.addEventListener('click', () => {
    if (!selectedParcel) return;
    const util = getPlannerUtility();
    if (!util) return;
    const targetZone = selectedParcel.currentZoneKey;
    const dist = selectedParcel.district;
    const res = util.batchRezoneDistrict(dist, targetZone);
    if (res && res.success) {
      syncBatchUndoButton(res.canUndo);
      updateInspectorUI(selectedParcel);
      updatePlannerUI();
      audioEngine.playTelemetryChime(880.0);
    }
  });
}

if (btnBatchRezoneUndo) {
  btnBatchRezoneUndo.addEventListener('click', () => {
    const util = getPlannerUtility();
    if (!util || typeof util.undoLastBatchRezone !== 'function') return;
    const res = util.undoLastBatchRezone();
    if (res && res.success) {
      syncBatchUndoButton(res.canUndo);
      if (selectedParcel) updateInspectorUI(selectedParcel);
      updatePlannerUI();
      audioEngine.playTelemetryChime(523.25);
    }
  });
}

// Export Format Pills
const btnFmtMd = document.getElementById('btn-fmt-md');
const btnFmtJson = document.getElementById('btn-fmt-json');
if (btnFmtMd && btnFmtJson) {
  btnFmtMd.addEventListener('click', () => {
    btnFmtMd.classList.add('active');
    btnFmtJson.classList.remove('active');
    currentExportFormat = 'markdown';
    updatePlannerUI();
  });
  btnFmtJson.addEventListener('click', () => {
    btnFmtJson.classList.add('active');
    btnFmtMd.classList.remove('active');
    currentExportFormat = 'json';
    updatePlannerUI();
  });
}

const btnCopyReport = document.getElementById('btn-copy-report');
if (btnCopyReport) {
  btnCopyReport.addEventListener('click', async () => {
    const codeEl = document.getElementById('export-preview-code');
    if (codeEl && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(codeEl.textContent);
        const origText = btnCopyReport.textContent;
        btnCopyReport.textContent = '✓ Copied!';
        setTimeout(() => { btnCopyReport.textContent = origText; }, 1800);
      } catch (e) {
        console.warn('Clipboard copy note:', e);
      }
    }
  });
}

const btnDownloadReport = document.getElementById('btn-download-report');
if (btnDownloadReport) {
  btnDownloadReport.addEventListener('click', () => {
    const util = getPlannerUtility();
    if (!util) return;
    const rep = util.exportPlanningReport(currentExportFormat);
    const content = typeof rep === 'string' ? rep : JSON.stringify(rep, null, 2);
    const ext = currentExportFormat === 'json' ? 'json' : 'md';
    const mime = currentExportFormat === 'json' ? 'application/json' : 'text/markdown';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MountainView_PlanReport_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// Initialize Accessibility Controls, Escape-to-close, Tab Roving, and Controls HUD (Section 4)
initAccessibilityControls({
  toggleSimDrawer: () => toggleSimDrawer(),
  togglePlannerDrawer: () => togglePlannerDrawer(),
  resetCamera: () => flyToCameraPreset('overview')
});

// ============================================================================
// 10. 60FPS CONTINUOUS ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();
const _vehMatrix = new THREE.Matrix4();
const _vehPos = new THREE.Vector3();
const _vehQuat = new THREE.Quaternion();
const _vehScale = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const reducedMotion = Boolean(prefersReducedMotionQuery && prefersReducedMotionQuery.matches);

  if (camFlight) {
    if (reducedMotion) {
      camera.position.copy(camFlight.endPos);
      controls.target.copy(camFlight.endTarget);
      camFlight = null;
    } else {
      camFlight.progress = Math.min(1, camFlight.progress + dt * 2.2);
      const ease = 1 - Math.pow(1 - camFlight.progress, 3);
      camera.position.lerpVectors(camFlight.startPos, camFlight.endPos, ease);
      controls.target.lerpVectors(camFlight.startTarget, camFlight.endTarget, ease);
      if (camFlight.progress >= 1) camFlight = null;
    }
  } else if (isAutoOrbit && !reducedMotion) {
    const angle = dt * 0.28;
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(_upAxis, angle);
    camera.position.copy(controls.target).add(offset);
  }

  controls.update();

  let anyHeightAnimating = false;
  for (const p of parcelRecords) {
    if (Math.abs(p.currentHeight - p.targetHeight) > 0.004) {
      p.currentHeight = reducedMotion
        ? p.targetHeight
        : THREE.MathUtils.lerp(p.currentHeight, p.targetHeight, dt * 7.5);
      p.mesh.scale.y = p.currentHeight;
      anyHeightAnimating = true;
    }
  }
  const farFactor = simEngines.params.farCap / 2.5;
  for (const distMesh of staticBuildingsGroup.children) {
    const dKey = distMesh.userData.district;
    const distMult = getDistrictMultiplier(simEngines.districtMultipliers, dKey);
    const targetScaleY = dKey === 'RES_SF'
      ? Math.max(0.85, 1.0 + (distMult - 1.0) * 0.65)
      : Math.max(0.55, distMult * (0.65 + 0.35 * farFactor));
    const currScaleY = distMesh.userData.currentScaleY || 1.0;
    if (Math.abs(currScaleY - targetScaleY) > 0.003) {
      distMesh.userData.currentScaleY = reducedMotion
        ? targetScaleY
        : THREE.MathUtils.lerp(currScaleY, targetScaleY, dt * 6.5);
      distMesh.scale.y = distMesh.userData.currentScaleY;
      anyHeightAnimating = true;
    }
  }
  if (anyHeightAnimating) {
    requestShadowMapUpdate();
  }
  if (selectionBeacon.visible && selectedParcel) {
    selectionBeacon.scale.y = Math.max(0.5, (selectedParcel.currentHeight || selectedParcel.targetHeight || 1.0) * 1.04);
  }

  if (!reducedMotion) {
    const snap = telemetryPipeline.getSnapshot();
    const speed101 = snap ? snap.corridors.us101.speedFactor : 0.6;
    const speedEcr = snap ? snap.corridors.ecr.speedFactor : 0.85;

    for (const agent of trafficAgents) {
      const mult = agent.is101 ? speed101 : speedEcr;
      agent.t = (agent.t + agent.dir * agent.baseSpeed * mult * dt + 1) % 1;
      const pt = agent.curve.getPointAt(agent.t);
      const tangent = agent.curve.getTangentAt(agent.t).normalize();
      const normalX = -tangent.z;
      const normalZ = tangent.x;
      _vehPos.set(
        pt.x + normalX * agent.laneOffset,
        0.22,
        pt.z + normalZ * agent.laneOffset
      );
      _vehQuat.setFromAxisAngle(_upAxis, Math.atan2(tangent.x, tangent.z));
      _vehMatrix.compose(_vehPos, _vehQuat, _vehScale);
      agent.instancedMesh.setMatrixAt(agent.instanceIndex, _vehMatrix);
    }
    cyanVehInstanced.instanceMatrix.needsUpdate = true;
    amberVehInstanced.instanceMatrix.needsUpdate = true;

    const trainFreqBoost = 1 + (simEngines.params.transitShare - 25) * 0.015;
    for (const train of caltrainTrains) {
      train.t = (train.t + train.dir * 0.085 * trainFreqBoost * dt + 1) % 1;
      const pt = caltrainMain.curve.getPointAt(train.t);
      const tangent = caltrainMain.curve.getTangentAt(train.t).normalize();
      const normalX = -tangent.z;
      const normalZ = tangent.x;
      train.mesh.position.set(
        pt.x + normalX * train.laneShift,
        0.36,
        pt.z + normalZ * train.laneShift
      );
      train.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
  } else {
    // Initialize static vehicle transforms once when reduced motion is active
    for (const agent of trafficAgents) {
      const pt = agent.curve.getPointAt(agent.t);
      const tangent = agent.curve.getTangentAt(agent.t).normalize();
      _vehPos.set(pt.x - tangent.z * agent.laneOffset, 0.22, pt.z + tangent.x * agent.laneOffset);
      _vehQuat.setFromAxisAngle(_upAxis, Math.atan2(tangent.x, tangent.z));
      _vehMatrix.compose(_vehPos, _vehQuat, _vehScale);
      agent.instancedMesh.setMatrixAt(agent.instanceIndex, _vehMatrix);
    }
    cyanVehInstanced.instanceMatrix.needsUpdate = true;
    amberVehInstanced.instanceMatrix.needsUpdate = true;
  }

  updateCalloutProjections();
  composer.render();
}

animate();
