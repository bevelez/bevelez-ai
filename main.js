import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CyberAudioEngine } from './audio.js?v=11';
import { createRoadWorld as createDriveWorld } from './roads/the-drive.js?v=1';
import { createRoadWorld as createWindmillWorld } from './roads/windmill.js?v=1';
import { createRoadWorld as createTunnelWorld } from './roads/tunnel.js?v=1';

// ============================================================================
// 1. INITIALIZE SCENE, CAMERA, RENDERER & BLOOM POST-PROCESSING
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12062c);
scene.fog = new THREE.FogExp2(0x240b3d, 0.0035);

// Never size the renderer or its targets to 0x0 (a tab that has not been laid out yet):
// the bloom mip chain halves the size five times, so keep a floor that survives that.
function viewportSize() {
  return {
    width: Math.max(64, window.innerWidth),
    height: Math.max(64, window.innerHeight)
  };
}

const camera = new THREE.PerspectiveCamera(
  60,
  viewportSize().width / viewportSize().height,
  0.1,
  600
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(viewportSize().width, viewportSize().height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

// Neon surfaces are authored above 1.0 (HDR) so the bloom threshold only catches true emitters:
// rails, lane dashes, pylon strips, tower crowns, the sun and the tail bar. Asphalt, car paint
// and the wireframe terrain stay crisp instead of smearing into the glow.
const NEON_HDR = 1.38;
function neonColor(hex, intensity = NEON_HDR) {
  return new THREE.Color(hex).multiplyScalar(intensity);
}

// Half-float, multisampled composer target: MSAA survives post-processing (no jaggies on the
// wireframe valley) and bloom has real headroom instead of 8-bit banding in the halos.
const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  samples: isCoarsePointer ? 2 : 4
});

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(viewportSize().width, viewportSize().height),
  0.36, // strength
  0.42, // radius
  0.9   // threshold (HDR: neon, sun, the thrusters and the light pooling under the car)
);
const outputPass = new OutputPass(); // AgX tone mapping + sRGB, applied once, after bloom

// Final display-space grade: radial chromatic aberration that breathes with the bass and the
// boost, fine animated film grain that lives mostly in the shadows, and a soft lens vignette.
const NightGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uAberration: { value: 0.0012 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.32 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      // Lens-like aberration: nothing at the centre, growing toward the edges
      vec2 shift = c * (uAberration * (0.3 + r2 * 3.2));
      float cr = texture2D(tDiffuse, vUv + shift).r;
      float cg = texture2D(tDiffuse, vUv).g;
      float cb = texture2D(tDiffuse, vUv - shift).b;
      vec3 col = vec3(cr, cg, cb);

      col *= 1.0 - uVignette * smoothstep(0.18, 0.95, r2 * 2.0);

      float g = hash(vUv * uResolution + fract(uTime * 0.731) * 977.0) - 0.5;
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * uGrain * (0.35 + 0.65 * (1.0 - clamp(luma, 0.0, 1.0)));

      gl_FragColor = vec4(col, 1.0);
    }
  `
};
const gradePass = new ShaderPass(NightGradeShader);
gradePass.uniforms.uResolution.value.set(
  viewportSize().width * renderer.getPixelRatio(),
  viewportSize().height * renderer.getPixelRatio()
);

const composer = new EffectComposer(renderer, composerTarget);
composer.setSize(viewportSize().width, viewportSize().height);
composer.addPass(renderScene);
composer.addPass(bloomPass);
composer.addPass(outputPass);
composer.addPass(gradePass);
let boostBlend = 0;

// ============================================================================
// 2. LIGHTING
// ============================================================================
const ambientLight = new THREE.AmbientLight(0x28154a, 1.4);
scene.add(ambientLight);

const horizonLight = new THREE.DirectionalLight(0xff9429, 0.85);
horizonLight.position.set(0, 35, -260);
scene.add(horizonLight);

const cityRimLight = new THREE.DirectionalLight(0x00f3ff, 1.2);
cityRimLight.position.set(-40, 25, 30);
scene.add(cityRimLight);

// ============================================================================
// 3. SYNTHWAVE SEGMENTED SUN & STARFIELD AT HORIZON
// ============================================================================
function createSynthwaveSunTexture(stops, isSegmented = true) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  for (const s of stops) {
    grad.addColorStop(s.offset, s.color);
  }

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(256, 256, 240, 0, Math.PI * 2);
  ctx.fill();

  if (isSegmented) {
    // Classic synthwave horizontal scanline cutouts in lower half
    ctx.globalCompositeOperation = 'destination-out';
    const stripes = [
      { y: 275, h: 6 },
      { y: 300, h: 9 },
      { y: 330, h: 12 },
      { y: 365, h: 16 },
      { y: 405, h: 22 },
      { y: 452, h: 28 }
    ];
    for (const s of stripes) {
      ctx.fillRect(0, s.y, 512, s.h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sunTextures = [
  // Mode 0: Outrun Palms (pastel yellow -> peach -> orchid segmented)
  createSynthwaveSunTexture([
    { offset: 0.0, color: '#fff078' },
    { offset: 0.5, color: '#ffb347' },
    { offset: 1.0, color: '#f264af' }
  ], true),
  // Mode 1: The Drive (soft cream-gold dusk sun)
  createSynthwaveSunTexture([
    { offset: 0.0, color: '#fff3b0' },
    { offset: 1.0, color: '#ffb870' }
  ], false),
  // Mode 2: Windmill Sunset (pale-gold sunset sun)
  createSynthwaveSunTexture([
    { offset: 0.0, color: '#fff7c2' },
    { offset: 1.0, color: '#ffaa3b' }
  ], false)
];

function createSkyGradientTexture(topHex, midHex, horizonHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, topHex);
  if (midHex) {
    grad.addColorStop(0.5, midHex);
  }
  grad.addColorStop(1.0, horizonHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sunGroup = new THREE.Group();
const sunGeo = new THREE.PlaneGeometry(125, 125);
const sunMat = new THREE.MeshBasicMaterial({
  map: sunTextures[0],
  color: neonColor(0xffffff, 1.24),
  transparent: true,
  fog: false,
  depthWrite: false
});
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
sunMesh.position.set(0, 38, -320);
sunGroup.add(sunMesh);
scene.add(sunGroup);

// Starfield & Cyber-Rain Particles
const starCount = 1400;
const starGeo = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);

for (let i = 0; i < starCount; i++) {
  starPositions[i * 3] = (Math.random() - 0.5) * 460;
  starPositions[i * 3 + 1] = Math.random() * 160 + 2;
  starPositions[i * 3 + 2] = -Math.random() * 340 + 20;

  const palette = Math.random() > 0.35 ? new THREE.Color(0x00f3ff) : new THREE.Color(0xff007f);
  if (Math.random() > 0.7) palette.setHex(0xffffff);
  starColors[i * 3] = palette.r;
  starColors[i * 3 + 1] = palette.g;
  starColors[i * 3 + 2] = palette.b;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

const starMat = new THREE.PointsMaterial({
  size: 0.75,
  vertexColors: true,
  transparent: true,
  opacity: 0.85,
  fog: false,
  sizeAttenuation: true
});
const starField = new THREE.Points(starGeo, starMat);
scene.add(starField);

// ============================================================================
// 4. ENDLESS HIGHWAY, LANE MARKERS, NEON ARCHES & OUTRUN VALLEY TERRAIN
// ============================================================================
const ROAD_LENGTH = 340;
const ROAD_WIDTH = 18;

// Dark reflective asphalt surface
const roadGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH);
const roadMat = new THREE.MeshStandardMaterial({
  color: 0x080612,
  roughness: 0.3,
  metalness: 0.68
});
const roadMesh = new THREE.Mesh(roadGeo, roadMat);
roadMesh.rotation.x = -Math.PI / 2;
roadMesh.position.set(0, 0, -ROAD_LENGTH / 2 + 25);
scene.add(roadMesh);

// Glowing continuous neon shoulder rails (synchronized per mode)
const outerRailMat = new THREE.MeshBasicMaterial({ color: neonColor(0xff9429) });
const innerRailMat = new THREE.MeshBasicMaterial({ color: neonColor(0xff55aa) });

function createGlowingRail(xPos, mat, width = 0.22) {
  const geo = new THREE.PlaneGeometry(width, ROAD_LENGTH);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(xPos, 0.02, -ROAD_LENGTH / 2 + 25);
  scene.add(mesh);
  return mesh;
}

createGlowingRail(-ROAD_WIDTH / 2, outerRailMat, 0.28);
createGlowingRail(ROAD_WIDTH / 2, outerRailMat, 0.28);
createGlowingRail(-ROAD_WIDTH / 2 + 0.5, innerRailMat, 0.1);
createGlowingRail(ROAD_WIDTH / 2 - 0.5, innerRailMat, 0.1);

// Scrolling Dashed Lane Dividers (3 lanes)
const dashObjects = [];
const dashGeo = new THREE.PlaneGeometry(0.16, 4.2);
const dashMatCyan = new THREE.MeshBasicMaterial({ color: neonColor(0x00f3ff, 1.15) });
const dashMatPink = new THREE.MeshBasicMaterial({ color: neonColor(0xff007f, 1.15) });

const laneXPositions = [-3.0, 0.0, 3.0];
const numDashesPerLane = 28;
const dashSpacing = 11;

for (let l = 0; l < laneXPositions.length; l++) {
  for (let i = 0; i < numDashesPerLane; i++) {
    const mat = l === 1 ? dashMatPink : dashMatCyan;
    const dash = new THREE.Mesh(dashGeo, mat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(laneXPositions[l], 0.025, 20 - i * dashSpacing);
    scene.add(dash);
    dashObjects.push(dash);
  }
}

// ============================================================================
// 4B. 5-ROAD INTERACTIVE SYSTEM METADATA & 3D PROP ENGINE
// ============================================================================
export const ROAD_MODES = [
  {
    index: 0,
    id: 'outrun',
    name: 'OUTRUN PALMS',
    modelPath: 'assets/models/night-drive-outrun.glb',
    skyTopHex: '#12062c',
    skyMidHex: '#2a0c44',
    skyHorizonHex: '#4a1568',
    fogHex: '#240b3d',
    fogDensity: 0.0035,
    roadColorHex: '#15072b',
    roadRoughness: 0.38,
    laneDashes: ['#ff9429', '#ff55aa'],
    terrainWireHex: '#a855f7',
    underglowHex: '#ff0077',
    cssCyan: '#00e5ff',
    cssMagenta: '#ff2a85',
    cssBgDeep: '#12062c',
    showSun: true,
    sunTexIndex: 0,
    showTerrain: true,
    showStars: true,
    showCity: false,
    segmentLength: 16,
    ambientLightHex: '#28154a',
    ambientIntensity: 1.4,
    horizonLightHex: '#ff9429',
    horizonIntensity: 0.85,
    cityRimHex: '#00e5ff',
    cityRimIntensity: 1.2
  },
  {
    index: 1,
    id: 'reactor',
    name: 'MAKO REACTOR',
    modelPath: 'assets/models/night-drive-reactor.glb',
    skyTopHex: '#040c0a',
    skyMidHex: '#081814',
    skyHorizonHex: '#0e2822',
    fogHex: '#071814',
    fogDensity: 0.0028,
    roadColorHex: '#091416',
    roadRoughness: 0.48,
    laneDashes: ['#44ffcc', '#ffcc00'],
    terrainWireHex: '#33ffbb',
    underglowHex: '#00ffaa',
    cssCyan: '#22ffaa',
    cssMagenta: '#ffcc00',
    cssBgDeep: '#040c0a',
    showSun: false,
    showTerrain: false,
    showStars: false,
    showCity: false,
    showMidgarCity: false,
    showMakoReactor: true,
    segmentLength: 16,
    ambientLightHex: '#0e2420',
    ambientIntensity: 1.5,
    horizonLightHex: '#33ffbb',
    horizonIntensity: 0.14,
    cityRimHex: '#ffaa33',
    cityRimIntensity: 0.95
  },
  {
    index: 2,
    id: 'midgar',
    name: 'MIDGAR EXPRESSWAY',
    modelPath: 'assets/models/night-drive-midgar.glb',
    skyTopHex: '#050d10',
    skyMidHex: '#0a191e',
    skyHorizonHex: '#122c30',
    fogHex: '#0a1c20',
    fogDensity: 0.0032,
    roadColorHex: '#0b1619',
    roadRoughness: 0.52,
    laneDashes: ['#d8ece8', '#e6b830'],
    terrainWireHex: '#88ffdd',
    underglowHex: '#00e699',
    cssCyan: '#00d68f',
    cssMagenta: '#ff9933',
    cssBgDeep: '#050d10',
    showSun: false,
    showTerrain: false,
    showStars: false,
    showCity: false,
    showMidgarCity: true,
    segmentLength: 16,
    ambientLightHex: '#0d2224',
    ambientIntensity: 1.45,
    horizonLightHex: '#88ffdd',
    horizonIntensity: 0.12,
    cityRimHex: '#ffaa44',
    cityRimIntensity: 0.85
  },
  {
    index: 3,
    id: 'city',
    name: 'THE DRIVE',
    modelPath: 'assets/models/night-drive-city.glb',
    skyTopHex: '#1f0a28',
    skyMidHex: '#771e48',
    skyHorizonHex: '#e84a6f',
    fogHex: '#4a1638',
    fogDensity: 0.0030,
    roadColorHex: '#0a0a14',
    roadRoughness: 0.22,
    laneDashes: ['#ffaa33', '#ffffff'],
    terrainWireHex: '#ff55aa',
    underglowHex: '#ff7733',
    cssCyan: '#ffaa33',
    cssMagenta: '#ff3377',
    cssBgDeep: '#1f0a28',
    showSun: true,
    sunTexIndex: 1,
    showTerrain: false,
    showStars: true,
    showCity: true,
    segmentLength: 16,
    ambientLightHex: '#2a1424',
    ambientIntensity: 1.5,
    horizonLightHex: '#ff5c77',
    horizonIntensity: 1.8,
    cityRimHex: '#ffaa33',
    cityRimIntensity: 1.3
  },
  {
    index: 4,
    id: 'windmill',
    name: 'WINDMILL SUNSET',
    modelPath: 'assets/models/night-drive-windmill.glb',
    skyTopHex: '#28070e',
    skyMidHex: '#882218',
    skyHorizonHex: '#f26424',
    fogHex: '#5c1818',
    fogDensity: 0.0028,
    roadColorHex: '#120c18',
    roadRoughness: 0.40,
    laneDashes: ['#ffdd55', '#ffffff'],
    terrainWireHex: '#c85a32',
    underglowHex: '#ff8833',
    cssCyan: '#ffcc44',
    cssMagenta: '#ff5533',
    cssBgDeep: '#28070e',
    showSun: true,
    sunTexIndex: 2,
    showTerrain: true,
    showStars: true,
    showCity: false,
    segmentLength: 16,
    ambientLightHex: '#36151a',
    ambientIntensity: 1.3,
    horizonLightHex: '#f25424',
    horizonIntensity: 2.0,
    cityRimHex: '#ffcc44',
    cityRimIntensity: 1.0
  },
  {
    index: 5,
    id: 'tunnel',
    name: 'AMBIENT TUNNEL',
    modelPath: 'assets/models/night-drive-tunnel.glb',
    skyTopHex: '#020408',
    skyMidHex: '#03060c',
    skyHorizonHex: '#040810',
    fogHex: '#050a14',
    fogDensity: 0.012,
    roadColorHex: '#050810',
    roadRoughness: 0.12,
    laneDashes: ['#00ddff', '#ffaa22'],
    terrainWireHex: '#0077ff',
    underglowHex: '#0077ff',
    cssCyan: '#00ddff',
    cssMagenta: '#0055ff',
    cssBgDeep: '#020408',
    showSun: false,
    showTerrain: false,
    showStars: false,
    showCity: false,
    segmentLength: 12,
    ambientLightHex: '#081428',
    ambientIntensity: 1.2,
    horizonLightHex: '#0077ff',
    horizonIntensity: 0.8,
    cityRimHex: '#00e65c',
    cityRimIntensity: 1.1
  }
];

// Instantiate bespoke Road World modules (Modes 3, 4, 5) and merge metadata BEFORE skyTextures precompute
const roadWorlds = {
  3: createDriveWorld({ THREE, scene, neonColor }),
  4: createWindmillWorld({ THREE, scene, neonColor }),
  5: createTunnelWorld({ THREE, scene, neonColor })
};

for (const [idxStr, world] of Object.entries(roadWorlds)) {
  const idx = Number(idxStr);
  if (world?.modeOverrides && ROAD_MODES[idx]) {
    Object.assign(ROAD_MODES[idx], world.modeOverrides);
  }
  if (world?.sunConfig?.stops && ROAD_MODES[idx]) {
    const sunTex = createSynthwaveSunTexture(
      world.sunConfig.stops,
      Boolean(world.sunConfig.isSegmented)
    );
    sunTextures.push(sunTex);
    ROAD_MODES[idx].sunTexIndex = sunTextures.length - 1;
  }
}

// Precompute vertical sky gradient CanvasTextures for all 6 road modes
const skyTextures = ROAD_MODES.map((m) =>
  createSkyGradientTexture(m.skyTopHex, m.skyMidHex, m.skyHorizonHex)
);

const gltfLoader = new GLTFLoader();
const loadedModelTemplates = {};
const activeEnvPropGroups = [];
let activeWindmillRotors = [];
let envPropsSegmentSpacing = 16;
let envPropsTotalSpan = 288;
let currentRoadMode = 0;

function loadModelTemplate(path) {
  return new Promise((resolve) => {
    if (loadedModelTemplates[path]) {
      resolve(loadedModelTemplates[path]);
      return;
    }
    gltfLoader.load(
      path,
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.side = THREE.DoubleSide;
          }
        });
        loadedModelTemplates[path] = gltf.scene;
        try {
          renderer.compile(gltf.scene, camera, scene);
        } catch {
          // ignore shader pre-warm notice
        }
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        console.warn(`[NightDrive] Model load notice for ${path}:`, err);
        resolve(null);
      }
    );
  });
}

function spawnEnvPropsForMode(modeIdx) {
  const mode = ROAD_MODES[modeIdx];
  for (const prop of activeEnvPropGroups) {
    scene.remove(prop);
  }
  activeEnvPropGroups.length = 0;
  activeWindmillRotors = [];
  Object.values(roadWorlds).forEach((w) => w?.onResetSegments?.());

  const template = loadedModelTemplates[mode.modelPath];
  const spacing = mode.segmentLength || 16;
  const numSegments = Math.round(288 / spacing);
  envPropsSegmentSpacing = spacing;
  envPropsTotalSpan = numSegments * spacing;

  if (!template) {
    for (let i = 0; i < numSegments; i++) {
      const placeholder = new THREE.Group();
      placeholder.position.z = spacing - i * spacing;
      if (mode.id === 'windmill') {
        const rotorPlaceholder = new THREE.Group();
        rotorPlaceholder.name = 'Rotor';
        placeholder.add(rotorPlaceholder);
        activeWindmillRotors.push(rotorPlaceholder);
      }
      scene.add(placeholder);
      activeEnvPropGroups.push(placeholder);
    }
    if (window.NightDrive) {
      window.NightDrive.activeWindmillRotors = activeWindmillRotors;
    }
    loadModelTemplate(mode.modelPath).then((loaded) => {
      if (currentRoadMode === modeIdx && loaded) {
        spawnEnvPropsForMode(modeIdx);
      }
    });
    return;
  }

  for (let i = 0; i < numSegments; i++) {
    const clone = template.clone(true);
    const zPos = spacing - i * spacing;
    clone.position.set(0, 0, zPos);
    scene.add(clone);
    activeEnvPropGroups.push(clone);

    roadWorlds[modeIdx]?.onCloneSegment?.(clone, i);

    if (mode.id === 'windmill') {
      clone.traverse((child) => {
        if (child.name && /rotor/i.test(child.name)) {
          activeWindmillRotors.push(child);
        }
      });
    }
  }

  if (window.NightDrive) {
    window.NightDrive.activeWindmillRotors = activeWindmillRotors;
  }
}

// highwayProps alias for backwards compatibility
const highwayProps = activeEnvPropGroups;

// Preload all 5 road environment packages in background
ROAD_MODES.forEach((m) => {
  loadModelTemplate(m.modelPath).then((template) => {
    if (currentRoadMode === m.index && template) {
      spawnEnvPropsForMode(m.index);
    }
  });
});

// Scrolling Outrun Wireframe Canyon / Mountains flanking the highway
function createTerrainChunk(zOffset) {
  const width = 220;
  const length = 140;
  const segW = 44;
  const segL = 28;

  const geo = new THREE.PlaneGeometry(width, length, segW, segL);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const distFromRoad = Math.abs(x) - (ROAD_WIDTH / 2 + 2.5);

    if (distFromRoad > 0) {
      // Smoothly rise into synthwave mountains on both sides of the highway
      const factor = Math.min(distFromRoad / 42, 1.8);
      const wave1 = Math.sin(x * 0.08) * Math.cos(z * 0.089) * 8.5;
      const wave2 = Math.sin(x * 0.19 + z * 0.13) * 3.8;
      const ridge = Math.pow(factor, 1.55) * 16 + Math.abs(wave1 + wave2) * factor;
      pos.setY(i, ridge);
    } else {
      pos.setY(i, -0.15);
    }
  }
  geo.computeVertexNormals();

  const chunkGroup = new THREE.Group();

  const solidMat = new THREE.MeshStandardMaterial({
    color: 0x060212,
    roughness: 0.85,
    metalness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const solidMesh = new THREE.Mesh(geo, solidMat);
  chunkGroup.add(solidMesh);

  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x9d00ff,
    wireframe: true,
    transparent: true,
    opacity: 0.42
  });
  const wireMesh = new THREE.Mesh(geo, wireMat);
  chunkGroup.add(wireMesh);

  chunkGroup.position.z = zOffset;
  scene.add(chunkGroup);
  return { group: chunkGroup, solidMat, wireMat, length };
}

const terrainChunks = [
  createTerrainChunk(-30),
  createTerrainChunk(-170)
];

// ============================================================================
// 5. CYBERPUNK MEGACITY SKYLINE AT THE HORIZON
// ============================================================================
function createBuildingWindowTexture(accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#05020f';
  ctx.fillRect(0, 0, 128, 256);

  const cols = 8;
  const rows = 24;
  const padX = 4;
  const padY = 4;
  const w = (128 - padX * (cols + 1)) / cols;
  const h = (256 - padY * (rows + 1)) / rows;

  for (let r = 0; r < rows; r++) {
    const floorLitProbability = Math.random() * 0.65;
    for (let c = 0; c < cols; c++) {
      if (Math.random() < floorLitProbability) {
        ctx.fillStyle = Math.random() > 0.25 ? accentColor : '#ffffff';
        ctx.globalAlpha = 0.55 + Math.random() * 0.45;
        ctx.fillRect(padX + c * (w + padX), padY + r * (h + padY), w, h);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const windowTextures = [
  createBuildingWindowTexture('#00f3ff'),
  createBuildingWindowTexture('#ff007f'),
  createBuildingWindowTexture('#ffae00'),
  createBuildingWindowTexture('#9d4edd')
];

const cityGroup = new THREE.Group();
cityGroup.position.z = -245;
scene.add(cityGroup);

const reactiveCityCaps = [];
const NUM_BUILDINGS = 74;

for (let i = 0; i < NUM_BUILDINGS; i++) {
  // Leave a narrow gap right down the center highway corridor so the road leads into the city core
  const angleSpread = (i / NUM_BUILDINGS - 0.5) * 240;
  let x = angleSpread + (Math.random() - 0.5) * 8;
  if (Math.abs(x) < 9) {
    x += (x < 0 ? -1 : 1) * 9;
  }

  const zDepth = -Math.random() * 55;
  const distCenter = Math.abs(x);
  const maxHeight = Math.max(18, 78 - distCenter * 0.48);
  const height = 14 + Math.random() * maxHeight;
  const width = 4.2 + Math.random() * 6.5;
  const depth = 4.2 + Math.random() * 6.5;

  const tex = windowTextures[i % windowTextures.length];
  const bldgGeo = new THREE.BoxGeometry(width, height, depth);
  const bldgMat = new THREE.MeshStandardMaterial({
    color: 0x090418,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 1.15,
    roughness: 0.4,
    metalness: 0.6
  });

  const bldg = new THREE.Mesh(bldgGeo, bldgMat);
  bldg.position.set(x, height / 2 - 1, zDepth);
  cityGroup.add(bldg);

  // Glowing neon crown / spire on tall towers
  if (height > 28) {
    const capColor = i % 2 === 0 ? 0x00f3ff : 0xff007f;
    const capGeo = new THREE.BoxGeometry(width * 1.03, 0.55, depth * 1.03);
    const capMat = new THREE.MeshBasicMaterial({ color: neonColor(capColor, 1.3) });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, height - 0.8, zDepth);
    cityGroup.add(cap);

    reactiveCityCaps.push({
      mesh: cap,
      baseY: height - 0.8,
      band: i % 16
    });

    if (Math.random() > 0.45) {
      const spireH = 5 + Math.random() * 10;
      const spireGeo = new THREE.CylinderGeometry(0.08, 0.18, spireH, 6);
      const spire = new THREE.Mesh(spireGeo, capMat);
      spire.position.set(x, height + spireH / 2 - 0.8, zDepth);
      cityGroup.add(spire);
    }
  }
}

// ============================================================================
// 5B. FF7 REMAKE MIDGAR METROPOLIS 3D HORIZON SKYLINE (ROAD 5)
// ============================================================================
const midgarCityGroup = new THREE.Group();
midgarCityGroup.position.set(0, 0, 0);
scene.add(midgarCityGroup);

const midgarSearchlights = [];
const midgarMakoCores = [];

// Shared Materials for Midgar Horizon Megastructure (fog: false prevents haze washout)
const shinraHullMat = new THREE.MeshStandardMaterial({
  color: 0x1e242c,
  roughness: 0.50,
  metalness: 0.40,
  fog: false
});
const shinraExoMat = new THREE.MeshStandardMaterial({
  color: 0x2e353f,
  roughness: 0.40,
  metalness: 0.65,
  fog: false
});
const windowCyanMat = new THREE.MeshBasicMaterial({ color: 0x88ffdd, fog: false });
const windowGoldMat = new THREE.MeshBasicMaterial({ color: 0xffdf9e, fog: false });
const makoCoreMat = new THREE.MeshBasicMaterial({ color: 0x00e699, fog: false });
const reactorHullMat = new THREE.MeshStandardMaterial({
  color: 0x222830,
  roughness: 0.50,
  metalness: 0.50,
  fog: false
});
const stackGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, fog: false });
const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0xff2222, fog: false });
const plateMat = new THREE.MeshStandardMaterial({
  color: 0x1c2128,
  roughness: 0.55,
  metalness: 0.45,
  fog: false
});
const searchlightMat = new THREE.MeshBasicMaterial({
  color: 0x88ffdd,
  transparent: true,
  opacity: 0.32,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  fog: false
});
const coolingRingMat = new THREE.MeshBasicMaterial({ color: 0xc8ffe8, fog: false });
const craneSteelMat = new THREE.MeshStandardMaterial({
  color: 0x2a323c,
  roughness: 0.45,
  metalness: 0.55,
  fog: false
});
const craneWarnMat = new THREE.MeshStandardMaterial({
  color: 0xd4a017,
  roughness: 0.40,
  metalness: 0.40,
  fog: false
});

// Horizon Skyline Group at z = -238m, y = -3.0m so entire 6-tier Shinra Tower (0..140m) frames cleanly below top HUD bar
const midgarHorizonGroup = new THREE.Group();
midgarHorizonGroup.position.set(0, -3.0, -238);
midgarCityGroup.add(midgarHorizonGroup);

// Dedicated Mako architectural illumination for the sculpted 3D Shinra Building (3/4 Side Profile) & Reactors
const shinraApronLight = new THREE.PointLight(0x44ffcc, 2200, 200, 1.4);
shinraApronLight.position.set(-28, 36, 56);
midgarHorizonGroup.add(shinraApronLight);

const shinraDrumKeyLight = new THREE.PointLight(0x66ffe0, 2900, 250, 1.4);
shinraDrumKeyLight.position.set(28, 68, 62);
midgarHorizonGroup.add(shinraDrumKeyLight);

const shinraSpireRimLight = new THREE.PointLight(0xffe0a8, 2400, 250, 1.4);
shinraSpireRimLight.position.set(-36, 108, 48);
midgarHorizonGroup.add(shinraSpireRimLight);

// ----------------------------------------------------------------------------
// A. Authentic Sculpted 3D Midgar City & Shinra Building (assets/models/night-drive-midgar-city.glb)
// ----------------------------------------------------------------------------
let midgarCityModel = null;
gltfLoader.load(
  'assets/models/night-drive-midgar-city.glb',
  (gltf) => {
    midgarCityModel = gltf.scene;
    midgarCityModel.scale.set(0.84, 0.84, 0.84);
    midgarCityModel.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.fog = false;
        child.material.side = THREE.DoubleSide;
        if (child.material.isMeshStandardMaterial) {
          child.material.roughness = 0.36;
          child.material.metalness = 0.58;
          child.material.emissiveIntensity = 1.35;
        }
      }
    });
    midgarCityModel.position.set(0, 0, 0);
    midgarHorizonGroup.add(midgarCityModel);
    try {
      renderer.compile(midgarCityModel, camera, scene);
    } catch {
      // ignore shader pre-warm notice
    }
    console.log('[NightDrive] Loaded authentic 3D Midgar City & Shinra HQ Tower GLB');
  },
  undefined,
  (err) => {
    console.warn('[NightDrive] Failed to load night-drive-midgar-city.glb:', err);
  }
);

// Subtle atmospheric searchlight beams (kept low-opacity so the sculpted rooftop spire & red aviation beacon stay crisp)
searchlightMat.opacity = 0.015;
const beamGeo = new THREE.CylinderGeometry(0.4, 6.0, 90, 16, 1, true);
beamGeo.translate(0, 45, 0);

const searchlight1 = new THREE.Mesh(beamGeo, searchlightMat);
searchlight1.position.set(-7.2, 106, 2.0);
searchlight1.rotation.x = 0.25;
searchlight1.rotation.z = -0.28;
midgarHorizonGroup.add(searchlight1);
midgarSearchlights.push({ mesh: searchlight1, baseRotZ: -0.28, phase: 0.0, speed: 0.65 });

const searchlight2 = new THREE.Mesh(beamGeo, searchlightMat);
searchlight2.position.set(7.2, 106, -2.0);
searchlight2.rotation.x = -0.25;
searchlight2.rotation.z = 0.28;
midgarHorizonGroup.add(searchlight2);
midgarSearchlights.push({ mesh: searchlight2, baseRotZ: 0.28, phase: 1.8, speed: 0.55 });

// ----------------------------------------------------------------------------
// D. Midground Discrete Landmarks (Cooling Towers & Cranes)
// ----------------------------------------------------------------------------
function createMidgarCoolingTower(height, rBase, rTop, ringHeights) {
  const g = new THREE.Group();
  // Hyperboloid tapered industrial cooling tower hull
  const hullGeo = new THREE.CylinderGeometry(rTop, rBase, height, 24);
  const hull = new THREE.Mesh(hullGeo, reactorHullMat);
  hull.position.y = height / 2;
  g.add(hull);

  // Flared top rim collar
  const rimGeo = new THREE.CylinderGeometry(rTop + 0.35, rTop, 1.2, 24);
  const rim = new THREE.Mesh(rimGeo, shinraExoMat);
  rim.position.y = height + 0.6;
  g.add(rim);

  // Heavy foundation plinth
  const plinthGeo = new THREE.CylinderGeometry(rBase + 0.8, rBase + 1.2, 2.5, 20);
  const plinth = new THREE.Mesh(plinthGeo, plateMat);
  plinth.position.y = 1.25;
  g.add(plinth);

  // 4 Illuminated Mako containment rings
  ringHeights.forEach((ry) => {
    const ringT = ry / height;
    const rAtY = rBase + (rTop - rBase) * ringT;
    const ringGeo = new THREE.CylinderGeometry(rAtY + 0.16, rAtY + 0.16, 0.55, 24, 1, true);
    const ring = new THREE.Mesh(ringGeo, coolingRingMat);
    ring.position.y = ry;
    g.add(ring);
  });

  // Vertical structural buttresses
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.35, height, 0.45), shinraExoMat);
    const midR = (rBase + rTop) * 0.5 + 0.1;
    buttress.position.set(Math.cos(a) * midR, height / 2, Math.sin(a) * midR);
    buttress.rotation.y = -a;
    g.add(buttress);
  }
  return g;
}

// Hero 4-Ring Cooling Tower (far right flank, keeping central Shinra Tower & Mako Reactors 100% clear)
const heroCoolingTower = createMidgarCoolingTower(26, 4.2, 3.0, [6.5, 12.0, 17.5, 23.0]);
heroCoolingTower.position.set(52.0, 0, -95.0);
midgarCityGroup.add(heroCoolingTower);

// Secondary Cooling Tower (far left flank)
const secondaryCoolingTower = createMidgarCoolingTower(30, 4.6, 3.4, [8.0, 15.0, 22.0, 28.0]);
secondaryCoolingTower.position.set(-54.0, 0, -115.0);
midgarCityGroup.add(secondaryCoolingTower);

// Construction Lattice Tower Cranes with flashing beacons
function createMidgarCrane(mastHeight, jibLength, jibRotY) {
  const g = new THREE.Group();
  const mastGeo = new THREE.BoxGeometry(1.6, mastHeight, 1.6);
  const mastMesh = new THREE.Mesh(mastGeo, craneSteelMat);
  mastMesh.position.y = mastHeight / 2;
  g.add(mastMesh);

  const cabinGeo = new THREE.BoxGeometry(2.4, 2.2, 3.2);
  const cabin = new THREE.Mesh(cabinGeo, craneWarnMat);
  cabin.position.set(0, mastHeight + 1.1, 0);
  cabin.rotation.y = jibRotY;
  g.add(cabin);

  const apexGeo = new THREE.ConeGeometry(0.8, 6.0, 4);
  const apex = new THREE.Mesh(apexGeo, craneSteelMat);
  apex.position.set(0, mastHeight + 5.2, 0);
  g.add(apex);

  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), beaconRedMat);
  beacon.position.set(0, mastHeight + 8.6, 0);
  g.add(beacon);

  const jibGeo = new THREE.BoxGeometry(jibLength, 1.2, 1.2);
  jibGeo.translate(jibLength / 2, 0, 0);
  const jib = new THREE.Mesh(jibGeo, craneWarnMat);
  jib.position.set(0, mastHeight + 1.8, 0);
  jib.rotation.y = jibRotY;
  g.add(jib);

  const cJibLen = jibLength * 0.35;
  const cJibGeo = new THREE.BoxGeometry(cJibLen, 1.0, 1.0);
  cJibGeo.translate(-cJibLen / 2, 0, 0);
  const cJib = new THREE.Mesh(cJibGeo, craneSteelMat);
  cJib.position.set(0, mastHeight + 1.8, 0);
  cJib.rotation.y = jibRotY;
  g.add(cJib);

  const counterweight = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 2.4), plateMat);
  counterweight.position.set(
    -Math.cos(jibRotY) * (cJibLen - 0.8),
    mastHeight + 1.4,
    Math.sin(jibRotY) * (cJibLen - 0.8)
  );
  g.add(counterweight);

  return g;
}

// Crane 1 (Far left outer flank, jib angled outward away from central vista)
const midgarCrane1 = createMidgarCrane(38.0, 18.0, 2.65);
midgarCrane1.position.set(-46.0, 0, -90.0);
midgarCityGroup.add(midgarCrane1);

// Crane 2 (Far right outer flank, jib angled outward away from central vista)
const midgarCrane2 = createMidgarCrane(42.0, 20.0, -0.45);
midgarCrane2.position.set(48.0, 0, -130.0);
midgarCityGroup.add(midgarCrane2);

// Initial visibility synchronized to active road mode
midgarCityGroup.visible = Boolean(ROAD_MODES[currentRoadMode]?.showMidgarCity);

// ============================================================================
// 5C. ROAD 6 MAKO REACTOR 01 (FF7 REMAKE SECTOR 1 REACTOR MEGASTRUCTURE)
// ============================================================================
const makoReactorGroup = new THREE.Group();
scene.add(makoReactorGroup);

const makoReactorHorizonGroup = new THREE.Group();
makoReactorHorizonGroup.position.set(0, -2.5, -190);
makoReactorGroup.add(makoReactorHorizonGroup);

// Dedicated point lights to sculpt the Mako Reactor 01 armor ribs, 壱/01 chest, and crown dome
const reactorPortalLight = new THREE.PointLight(0x44ffcc, 1200, 140, 1.4);
reactorPortalLight.position.set(0, 14, 48);
makoReactorHorizonGroup.add(reactorPortalLight);

const reactorChestLight = new THREE.PointLight(0x88ffdd, 1600, 180, 1.4);
reactorChestLight.position.set(0, 52, 54);
makoReactorHorizonGroup.add(reactorChestLight);

const reactorCrownLight = new THREE.PointLight(0xff4433, 900, 140, 1.4);
reactorCrownLight.position.set(0, 92, 42);
makoReactorHorizonGroup.add(reactorCrownLight);

const gltfMakoReactorLoader = new GLTFLoader();
gltfMakoReactorLoader.load(
  'assets/models/night-drive-mako-reactor.glb',
  (gltf) => {
    const model = gltf.scene;
    model.position.set(0, 0, 0);
    model.scale.set(0.88, 0.88, 0.88);
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.fog = false;
        child.material.side = THREE.DoubleSide;
        child.material.roughness = 0.78;
        child.material.metalness = 0.20;
        if ('emissiveIntensity' in child.material) {
          child.material.emissiveIntensity = 1.28;
        }
        child.material.needsUpdate = true;
      }
    });
    makoReactorHorizonGroup.add(model);
    try {
      renderer.compile(model, camera, scene);
    } catch {
      // ignore shader pre-warm notice
    }
  },
  undefined,
  (err) => {
    console.warn('[NightDrive] Mako Reactor 01 GLB load notice:', err);
  }
);

// Flanking industrial Sector 1 cranes along the outer causeway flanks
const reactorCrane1 = createMidgarCrane(40.0, 19.0, 2.55);
reactorCrane1.position.set(-44.0, 0, -95.0);
makoReactorGroup.add(reactorCrane1);

const reactorCrane2 = createMidgarCrane(44.0, 21.0, -0.50);
reactorCrane2.position.set(46.0, 0, -135.0);
makoReactorGroup.add(reactorCrane2);

// Initial visibility synchronized to active road mode
makoReactorGroup.visible = Boolean(ROAD_MODES[currentRoadMode]?.showMakoReactor);

// ============================================================================
// 6. HERO CYBERPUNK SPORTS CAR (QUADRA / COUNTACH SYNTHWAVE SUPERCAR)
// ============================================================================
const carGroup = new THREE.Group();
carGroup.position.set(0, 0.42, 6.5);
scene.add(carGroup);

const fallbackCarBodyGroup = new THREE.Group();
// Keep low-poly procedural fallback hidden unless the high-res BTTF DeLorean GLB fails to load
fallbackCarBodyGroup.visible = false;
carGroup.add(fallbackCarBodyGroup);

const bodyPaintMat = new THREE.MeshStandardMaterial({
  color: 0x787e96,
  metalness: 0.55,
  roughness: 0.36
});

const darkTrimMat = new THREE.MeshStandardMaterial({
  color: 0x14121d,
  metalness: 0.10,
  roughness: 0.85
});

const glassMat = new THREE.MeshStandardMaterial({
  color: 0x051824,
  metalness: 0.95,
  roughness: 0.08,
  emissive: 0x00384d,
  emissiveIntensity: 0.35
});

// Lower wide aerodynamic wedge chassis
const chassisGeo = new THREE.BoxGeometry(2.25, 0.44, 4.65);
const chassisMesh = new THREE.Mesh(chassisGeo, bodyPaintMat);
chassisMesh.position.y = 0.22;
fallbackCarBodyGroup.add(chassisMesh);

// Sloped front nose hood
const hoodGeo = new THREE.BoxGeometry(2.12, 0.28, 1.55);
const hoodMesh = new THREE.Mesh(hoodGeo, bodyPaintMat);
hoodMesh.position.set(0, 0.34, -1.62);
hoodMesh.rotation.x = 0.14;
fallbackCarBodyGroup.add(hoodMesh);

// Wide rear fenders / haunches
[-0.98, 0.98].forEach((xSide) => {
  const fenderGeo = new THREE.BoxGeometry(0.38, 0.48, 2.1);
  const fender = new THREE.Mesh(fenderGeo, bodyPaintMat);
  fender.position.set(xSide, 0.28, 0.95);
  fallbackCarBodyGroup.add(fender);

  // Glowing cyan side skirt laser strip
  const skirtGlowGeo = new THREE.BoxGeometry(0.05, 0.05, 3.8);
  const skirtGlowMat = new THREE.MeshBasicMaterial({ color: neonColor(0x00f3ff) });
  const skirtGlow = new THREE.Mesh(skirtGlowGeo, skirtGlowMat);
  skirtGlow.position.set(xSide * 1.15, 0.06, 0.0);
  fallbackCarBodyGroup.add(skirtGlow);
});

// Sleek angled cabin canopy
const cabinGeo = new THREE.BoxGeometry(1.72, 0.42, 2.05);
const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
cabinMesh.position.set(0, 0.6, -0.15);
fallbackCarBodyGroup.add(cabinMesh);

// Synthwave rear window louvers
for (let i = 0; i < 5; i++) {
  const louverGeo = new THREE.BoxGeometry(1.48, 0.04, 0.18);
  const louver = new THREE.Mesh(louverGeo, darkTrimMat);
  louver.position.set(0, 0.78 - i * 0.065, 0.62 + i * 0.26);
  louver.rotation.x = -0.25;
  fallbackCarBodyGroup.add(louver);
}

// Aggressive Rear Spoiler Wing with Neon Tips
const spoilerWingGeo = new THREE.BoxGeometry(2.32, 0.06, 0.38);
const spoilerWing = new THREE.Mesh(spoilerWingGeo, bodyPaintMat);
spoilerWing.position.set(0, 0.76, 2.12);
spoilerWing.rotation.x = 0.12;
fallbackCarBodyGroup.add(spoilerWing);

[-0.85, 0.85].forEach((xStrut) => {
  const strutGeo = new THREE.BoxGeometry(0.08, 0.28, 0.3);
  const strut = new THREE.Mesh(strutGeo, darkTrimMat);
  strut.position.set(xStrut, 0.6, 2.08);
  fallbackCarBodyGroup.add(strut);
});

// Iconic Full-Width Glowing Cyberpunk Tail Light Bar
const tailLightBarGeo = new THREE.BoxGeometry(2.14, 0.14, 0.08);
const tailLightMat = new THREE.MeshBasicMaterial({ color: neonColor(0xe82c38, 1.45) });
const tailLightBar = new THREE.Mesh(tailLightBarGeo, tailLightMat);
tailLightBar.position.set(0, 0.36, 2.34);
fallbackCarBodyGroup.add(tailLightBar);

// Secondary lower diffuser light strip
const lowerTailGeo = new THREE.BoxGeometry(1.9, 0.05, 0.08);
const lowerTailMat = new THREE.MeshBasicMaterial({ color: neonColor(0xff7733, 1.15) });
const lowerTail = new THREE.Mesh(lowerTailGeo, lowerTailMat);
lowerTail.position.set(0, 0.18, 2.34);
fallbackCarBodyGroup.add(lowerTail);

// Dual Plasma Afterburner Exhaust Thrusters (tucked subtle warm ruby/amber cruising)
function createHaloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,180,90,0.8)');
  grad.addColorStop(0.6, 'rgba(255,60,20,0.3)');
  grad.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
const thrusterHaloTexture = createHaloTexture();
const exhaustFlames = [];
[-0.55, 0.55].forEach((xEx) => {
  const pipeGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.25, 12);
  pipeGeo.rotateX(Math.PI / 2);
  const pipe = new THREE.Mesh(pipeGeo, darkTrimMat);
  pipe.position.set(xEx, 0.12, 2.32);
  fallbackCarBodyGroup.add(pipe);

  const flameGeo = new THREE.ConeGeometry(0.16, 1.6, 14);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: neonColor(0xff3311, 1.8),
    transparent: true,
    opacity: 0.95
  });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(xEx, 0.12, 2.34);
  flame.visible = false;
  carGroup.add(flame);

  // Warm gold / amber core inside the plume
  const coreGeo = new THREE.ConeGeometry(0.07, 1.15, 10);
  coreGeo.rotateX(Math.PI / 2);
  const coreMat = new THREE.MeshBasicMaterial({
    color: neonColor(0xff8833, 3.2),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.set(xEx, 0.12, 2.34);
  core.visible = false;
  carGroup.add(core);

  // Hot glow at the nozzle mouth (tucked)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: thrusterHaloTexture,
    color: neonColor(0xff5522, 1.8),
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  halo.position.set(xEx, 0.12, 2.34);
  halo.scale.set(0.18, 0.18, 1);
  halo.visible = false;
  carGroup.add(halo);

  exhaustFlames.push({ flame, core, halo, phase: Math.random() * Math.PI * 2 });
});

// Plasma light the thrusters throw onto the road behind the car
const thrusterLight = new THREE.PointLight(0xff4411, 0, 8);
thrusterLight.position.set(0, 0.2, 2.8);
carGroup.add(thrusterLight);

// 4 Spinning Wheels with Brushed Silver Rims
const carWheels = [];
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.34, 20);
wheelGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.85 });

const rimGeo = new THREE.TorusGeometry(0.24, 0.032, 8, 20);
rimGeo.rotateY(Math.PI / 2);
const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b4, metalness: 0.75, roughness: 0.28 });

const wheelPositions = [
  { x: -1.12, y: -0.04, z: -1.38 },
  { x: 1.12, y: -0.04, z: -1.38 },
  { x: -1.16, y: -0.02, z: 1.38 },
  { x: 1.16, y: -0.02, z: 1.38 }
];

wheelPositions.forEach((wp) => {
  const wGroup = new THREE.Group();
  wGroup.position.set(wp.x, wp.y, wp.z);
  wGroup.visible = false; // Hidden unless BTTF DeLorean GLB fails to load

  const tire = new THREE.Mesh(wheelGeo, tireMat);
  wGroup.add(tire);

  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.x = wp.x < 0 ? -0.17 : 0.17;
  wGroup.add(rim);

  carGroup.add(wGroup);
  carWheels.push(wGroup);
});

// Car Neon Underglow & Rear Tail Light PointLight
const underglowLight = new THREE.PointLight(0xff0077, 2.5, 9);
underglowLight.position.set(0, -0.1, 0);
carGroup.add(underglowLight);

// Authentic lateral DeLorean taillight clusters + soft rear-overhead rim light
const leftTailLight = new THREE.PointLight(0xe82c38, 0.60, 6);
leftTailLight.position.set(-0.62, 0.40, 2.65);
carGroup.add(leftTailLight);

const rightTailLight = new THREE.PointLight(0xe82c38, 0.60, 6);
rightTailLight.position.set(0.62, 0.40, 2.65);
carGroup.add(rightTailLight);

const rearOverheadLight = new THREE.PointLight(0xd6deef, 2.25, 12);
rearOverheadLight.position.set(0, 2.6, 4.6);
carGroup.add(rearOverheadLight);

// Load Authentic 1985 DeLorean DMC-12 Time Machine (BTTF) GLB with Draco decoder & smooth scene fade-in
let isSceneReady = false;
function markSceneReady() {
  if (isSceneReady) return;
  isSceneReady = true;
  try {
    renderer.compile(scene, camera);
  } catch {
    // ignore
  }
  if (container) {
    container.classList.add('scene-ready');
  }
}
// Safety fallback so the canvas always fades in within 550ms even on slow connections
setTimeout(markSceneReady, 550);

const dracoCarLoader = new DRACOLoader();
dracoCarLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/gltf/');
const gltfCarLoader = new GLTFLoader();
gltfCarLoader.setDRACOLoader(dracoCarLoader);
gltfCarLoader.load(
  'assets/models/night-drive-car.glb',
  (gltf) => {
    const carModel = gltf.scene;
    carModel.position.set(0, 0, 0);
    // Hide fallback cylinder wheels and replace with the 4 real BTTF Goodyear Eagle GT wheels
    carWheels.forEach((w) => {
      w.visible = false;
    });
    carModel.traverse((child) => {
      if (child.isMesh && child.material) {
        if ('emissiveIntensity' in child.material && child.material.emissiveIntensity > 0) {
          child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity, 1.45);
        }
        child.material.needsUpdate = true;
      }
      if (child.name && child.name.startsWith('BTTF_Wheel_')) {
        carWheels.push(child);
      }
    });
    if (fallbackCarBodyGroup) fallbackCarBodyGroup.visible = false;
    carGroup.add(carModel);
    markSceneReady();
  },
  undefined,
  (err) => {
    console.warn('[NightDrive] Hero car GLB load notice:', err);
    if (fallbackCarBodyGroup) fallbackCarBodyGroup.visible = true;
    carWheels.forEach((w) => {
      w.visible = true;
    });
    markSceneReady();
  }
);

// ============================================================================
// 6B. ROAD MODE SWITCHER ENGINE & RUNTIME EXPORTS
// ============================================================================
const audioEngine = new CyberAudioEngine();
let roadSwitchFadeTimer = null;

function setRoadMode(newIndex) {
  const nextMode = (newIndex % ROAD_MODES.length + ROAD_MODES.length) % ROAD_MODES.length;
  const isChangingRoad = isSceneReady && nextMode !== currentRoadMode;
  currentRoadMode = nextMode;
  if (window.NightDrive) {
    window.NightDrive.roadMode = currentRoadMode;
  }

  if (isChangingRoad && container) {
    container.classList.add('road-switching');
    if (roadSwitchFadeTimer) clearTimeout(roadSwitchFadeTimer);
    roadSwitchFadeTimer = setTimeout(() => {
      container.classList.remove('road-switching');
    }, 95);
  }

  const mode = ROAD_MODES[currentRoadMode];

  // 1. Update UI active pills and aria-selected state
  document.querySelectorAll('.road-pill').forEach((pill) => {
    const pIdx = parseInt(pill.getAttribute('data-road'), 10);
    const isActive = pIdx === currentRoadMode;
    pill.classList.toggle('active', isActive);
    pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // 2. Update CSS root custom properties
  const root = document.documentElement;
  root.style.setProperty('--neon-cyan', mode.cssCyan);
  root.style.setProperty('--neon-magenta', mode.cssMagenta);
  root.style.setProperty('--bg-deep', mode.cssBgDeep);

  // 3. Update Sky Background & Exponential Fog
  if (skyTextures && skyTextures[currentRoadMode]) {
    scene.background = skyTextures[currentRoadMode];
  } else {
    scene.background = new THREE.Color(mode.skyTopHex);
  }
  if (scene.fog) {
    scene.fog.color = new THREE.Color(mode.fogHex);
    scene.fog.density = mode.fogDensity;
  }

  // Update per-mode sun texture
  if (sunMat && mode.sunTexIndex !== undefined && sunTextures && sunTextures[mode.sunTexIndex]) {
    sunMat.map = sunTextures[mode.sunTexIndex];
    sunMat.needsUpdate = true;
  }

  // 4. Update Lighting
  if (ambientLight) {
    ambientLight.color.set(mode.ambientLightHex);
    ambientLight.intensity = mode.ambientIntensity;
  }
  if (horizonLight) {
    horizonLight.color.set(mode.horizonLightHex);
    horizonLight.intensity = mode.horizonIntensity;
  }
  if (cityRimLight) {
    cityRimLight.color.set(mode.cityRimHex);
    cityRimLight.intensity = mode.cityRimIntensity;
  }

  // 5. Update Road Surface PBR Material
  if (roadMat) {
    roadMat.color.set(mode.roadColorHex);
    roadMat.roughness = mode.roadRoughness;
    roadMat.metalness = mode.roadMetalness ?? ((mode.showMidgarCity || mode.showMakoReactor) ? 0.35 : 0.68);
  }

  // 6. Update Lane Divider Colors & Shoulder Rails
  if (dashMatCyan && mode.laneDashes[0]) {
    dashMatCyan.color.copy(neonColor(mode.laneDashes[0]));
  }
  if (dashMatPink && mode.laneDashes[1]) {
    dashMatPink.color.copy(neonColor(mode.laneDashes[1]));
  }
  if (outerRailMat && mode.laneDashes[0]) {
    outerRailMat.color.copy(neonColor(mode.laneDashes[0]));
  }
  if (innerRailMat && mode.laneDashes[1]) {
    innerRailMat.color.copy(neonColor(mode.laneDashes[1]));
  }

  // 7. Update Car Neon Underglow
  if (underglowLight && mode.underglowHex) {
    underglowLight.color.set(mode.underglowHex);
  }

  // 8. Toggle Celestial, Terrain & City Skyline Visibility
  if (sunGroup) sunGroup.visible = Boolean(mode.showSun);
  if (terrainChunks) {
    terrainChunks.forEach((chunk) => {
      chunk.group.visible = Boolean(mode.showTerrain);
      if (chunk.solidMat) {
        chunk.solidMat.color.set(mode.terrainSolidHex || '#060212');
      }
      if (mode.terrainWireHex) {
        chunk.wireMat.color.set(mode.terrainWireHex);
      }
    });
  }
  if (starField) starField.visible = Boolean(mode.showStars);
  if (cityGroup) cityGroup.visible = Boolean(mode.showCity);
  if (midgarCityGroup) midgarCityGroup.visible = Boolean(mode.showMidgarCity);
  if (makoReactorGroup) makoReactorGroup.visible = Boolean(mode.showMakoReactor);
  if (roadWorlds[3]?.group) roadWorlds[3].group.visible = (currentRoadMode === 3);
  if (roadWorlds[4]?.group) roadWorlds[4].group.visible = (currentRoadMode === 4);
  if (roadWorlds[5]?.group) roadWorlds[5].group.visible = (currentRoadMode === 5);

  // 9. Swap 3D Roadside Environment Props Pool
  spawnEnvPropsForMode(currentRoadMode);

  // 10. Sync Radio Station to match Road Mode (0–3 Outrun/Neon/Sunset/Chrome, 4 SHINRA INC., 5 BOMBING MISSION)
  if (audioEngine) {
    audioEngine.setStation(currentRoadMode);
  }
}

// Camera presets
const CAMERA_MODES = [
  { name: 'CHASE', offset: new THREE.Vector3(0, 2.05, 12.4), lookZ: -48 },
  { name: 'LOW RETRO', offset: new THREE.Vector3(0, 1.38, 11.2), lookZ: -45 },
  { name: 'COCKPIT HOOD', offset: new THREE.Vector3(0, 1.32, 5.2), lookZ: -80 },
  { name: 'HELI WIDE', offset: new THREE.Vector3(0, 4.8, 17.0), lookZ: -38 }
];
let currentCameraIdx = 0; // CHASE by default

// Global NightDrive API Contract
window.NightDrive = {
  THREE: THREE,
  roadMode: 0,
  ROAD_MODES: ROAD_MODES,
  roadWorlds: roadWorlds,
  setRoadMode: setRoadMode,
  audioEngine: audioEngine,
  activeWindmillRotors: activeWindmillRotors,
  midgarCityGroup: midgarCityGroup,
  makoReactorGroup: makoReactorGroup,
  camera: camera,
  carGroup: carGroup,
  roadMat: roadMat,
  CAMERA_MODES: CAMERA_MODES,
  getCameraPreset: () => CAMERA_MODES[currentCameraIdx],
  getEnvironmentMetrics: () => ({
    modeIndex: currentRoadMode,
    modeName: ROAD_MODES[currentRoadMode].name,
    skyTopHex: ROAD_MODES[currentRoadMode].skyTopHex,
    skyHorizonHex: ROAD_MODES[currentRoadMode].skyHorizonHex,
    fogHex: ROAD_MODES[currentRoadMode].fogHex,
    fogDensity: scene.fog ? scene.fog.density : 0,
    roadRoughness: roadMat ? roadMat.roughness : 0.3,
    roadMetalness: roadMat ? roadMat.metalness : 0.68,
    underglowHex: ROAD_MODES[currentRoadMode].underglowHex,
    sunVisible: sunGroup ? sunGroup.visible : true,
    supported: true
  }),
  getCarMetrics: () => ({
    width: 2.29,
    length: 4.68,
    height: 1.07,
    wheelsCount: carWheels.length,
    underglowHex: ROAD_MODES[currentRoadMode].underglowHex,
    supported: true
  })
};
window.__NIGHT_DRIVE_SCENE__ = scene;

// Initialize Mode 0 (OUTRUN PALMS)
setRoadMode(0);

// ============================================================================
// 7. INTERACTIVE CONTROLS (STEERING, OVERDRIVE BOOST, CAMERA MODES)
// ============================================================================
let targetCarX = 0;
const keysPressed = { left: false, right: false, boost: false };
let overdriveLocked = false;

// Start on the chase preset instead of lerping in from the origin: the first frames (and any
// crawler / share-preview capture) show the highway, not the road plane edge-on from ground level.
camera.position.copy(CAMERA_MODES[currentCameraIdx].offset);
camera.lookAt(0, 1.8, CAMERA_MODES[currentCameraIdx].lookZ);

window.addEventListener('mousemove', (e) => {
  const normX = (e.clientX / window.innerWidth) * 2 - 1;
  targetCarX = normX * 5.6;
});

function handleTouchSteer(e) {
  if (e.target.closest('button, a, input, textarea, select, .modal-panel')) return;
  if (e.touches.length > 0) {
    document.body.classList.add('is-steering');
    const normX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    targetCarX = THREE.MathUtils.clamp(normX * 6.4, -5.8, 5.8);
  }
}

window.addEventListener('touchstart', handleTouchSteer, { passive: true });
window.addEventListener('touchmove', handleTouchSteer, { passive: true });
window.addEventListener('touchend', () => {
  document.body.classList.remove('is-steering');
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysPressed.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysPressed.right = true;
  if (e.key === 'Shift') keysPressed.boost = true;

  // Road mode shortcuts 1-6 and Key R sequential cycling
  if (e.key === '1') setRoadMode(0);
  else if (e.key === '2') setRoadMode(1);
  else if (e.key === '3') setRoadMode(2);
  else if (e.key === '4') setRoadMode(3);
  else if (e.key === '5') setRoadMode(4);
  else if (e.key === '6') setRoadMode(5);
  else if (e.key === 'r' || e.key === 'R') setRoadMode(currentRoadMode + 1);
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysPressed.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysPressed.right = false;
  if (e.key === 'Shift') keysPressed.boost = false;
});

// ============================================================================
// 8. UI WIRING & LYRIA 3.5 AUDIO STUDIO
// ============================================================================
// Road Selector HUD Navigation & Pill Click Wiring
const btnRoadPrev = document.getElementById('btn-road-prev');
const btnRoadNext = document.getElementById('btn-road-next');
if (btnRoadPrev) {
  btnRoadPrev.addEventListener('click', () => {
    setRoadMode(currentRoadMode - 1);
  });
}
if (btnRoadNext) {
  btnRoadNext.addEventListener('click', () => {
    setRoadMode(currentRoadMode + 1);
  });
}

document.querySelectorAll('.road-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    const roadIdx = parseInt(pill.getAttribute('data-road'), 10);
    if (!isNaN(roadIdx)) {
      setRoadMode(roadIdx);
    }
  });
});

const btnAudioToggle = document.getElementById('btn-audio-toggle');
const audioIcon = document.getElementById('audio-icon');
const audioLabel = document.getElementById('audio-label');
const audioSourcePill = document.getElementById('audio-source-pill');
const visCanvas = document.getElementById('audio-visualizer');
const visCtx = visCanvas.getContext('2d');

const btnCinema = document.getElementById('btn-cinema');
const cinemaLabel = document.getElementById('cinema-label');
const heroWrapper = document.getElementById('hero-wrapper');
const heroCard = document.getElementById('hero-card');
const btnCardCollapse = document.getElementById('btn-card-collapse');
const collapseIcon = document.getElementById('collapse-icon');
const heroTitleBar = document.getElementById('hero-title-bar');

const btnTurbo = document.getElementById('btn-turbo');
const btnCamera = document.getElementById('btn-camera');
const cameraLabel = document.getElementById('camera-label');
const speedValueEl = document.getElementById('speed-value');

// Modal elements
const btnLyriaModal = document.getElementById('btn-lyria-modal');
const lyriaModal = document.getElementById('lyria-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnGenerateLyria = document.getElementById('btn-generate-lyria');
const btnDownloadLyria = document.getElementById('btn-download-lyria');
const btnUseSynth = document.getElementById('btn-use-synth');
const lyriaApiKeyInput = document.getElementById('lyria-api-key');
const lyriaModelSelect = document.getElementById('lyria-model-select');
const lyriaPromptInput = document.getElementById('lyria-prompt');
const lyriaStatus = document.getElementById('lyria-status');

// Restore saved API key if present
const savedKey = localStorage.getItem('bevelez_gemini_api_key');
if (savedKey) {
  lyriaApiKeyInput.value = savedKey;
}

audioEngine.onStatusChange = (statusText, isPlaying) => {
  if (audioSourcePill) audioSourcePill.textContent = statusText;
  if (isPlaying) {
    audioIcon.textContent = '⏸';
    audioLabel.textContent = 'PLAYING';
    btnAudioToggle.classList.add('active');
  } else {
    audioIcon.textContent = '▶';
    audioLabel.textContent = 'AUDIO';
    btnAudioToggle.classList.remove('active');
  }
};

btnAudioToggle.addEventListener('click', () => {
  audioEngine.toggle();
});

// Outrun Radio dial: ‹ › change station; the name starts the radio, or skips when already playing
const btnStationPrev = document.getElementById('btn-station-prev');
const btnStationNext = document.getElementById('btn-station-next');
const btnStationName = document.getElementById('btn-station-name');
function renderStation(station) {
  if (btnStationName) btnStationName.textContent = station.name;
}
renderStation(audioEngine.station);
audioEngine.onStationChange = renderStation;
if (btnStationPrev) btnStationPrev.addEventListener('click', () => audioEngine.prevStation());
if (btnStationNext) btnStationNext.addEventListener('click', () => audioEngine.nextStation());
if (btnStationName) {
  btnStationName.addEventListener('click', () => {
    if (audioEngine.isPlaying) audioEngine.nextStation();
    else audioEngine.toggle();
  });
}

function toggleCardCollapse() {
  const collapsed = heroCard.classList.toggle('collapsed');
  collapseIcon.textContent = collapsed ? '+' : '−';
}

btnCardCollapse.addEventListener('click', toggleCardCollapse);
heroTitleBar.addEventListener('click', toggleCardCollapse);

btnCinema.addEventListener('click', () => {
  const hidden = heroWrapper.classList.toggle('hud-hidden');
  cinemaLabel.textContent = hidden ? 'SHOW HUD' : 'HIDE HUD';
});

btnTurbo.addEventListener('click', () => {
  overdriveLocked = !overdriveLocked;
  btnTurbo.classList.toggle('active', overdriveLocked);
  btnTurbo.querySelector('span').textContent = overdriveLocked
    ? '⚡ BOOST: ON'
    : '⚡ BOOST';
});

btnCamera.addEventListener('click', () => {
  currentCameraIdx = (currentCameraIdx + 1) % CAMERA_MODES.length;
  cameraLabel.textContent = `CAM: ${CAMERA_MODES[currentCameraIdx].name}`;
});

// Secret Easter Egg Cyber-Cassette Vault Transition
const btnSecretVault = document.getElementById('btn-secret-vault');
if (btnSecretVault) {
  btnSecretVault.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    overdriveLocked = true;
    speedValueEl.textContent = '999';
    document.body.classList.add('warping-to-vault');

    // Quick cassette-insert chime
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = audioEngine.ctx || new AudioCtx();
      const now = ctx.currentTime;
      [554.37, 659.25, 830.61, 1108.73].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.055);
        gain.gain.setValueAtTime(0.12, now + idx * 0.055);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.055);
        osc.stop(now + idx * 0.055 + 0.3);
      });
    } catch {
      // Ignore audio errors if blocked
    }

    setTimeout(() => {
      window.location.href = './vault.html';
    }, 340);
  });
}

// Lyria 3.5 Modal Controls
btnLyriaModal.addEventListener('click', () => {
  lyriaModal.classList.remove('hidden');
});

btnCloseModal.addEventListener('click', () => {
  lyriaModal.classList.add('hidden');
});

lyriaModal.addEventListener('click', (e) => {
  if (e.target === lyriaModal) lyriaModal.classList.add('hidden');
});

btnUseSynth.addEventListener('click', () => {
  audioEngine.startSynth();
  lyriaStatus.innerHTML = `Back on the Outrun Radio: <strong>${audioEngine.station.name}</strong> (${audioEngine.station.bpm} BPM).`;
});

btnGenerateLyria.addEventListener('click', async () => {
  const apiKey = lyriaApiKeyInput.value.trim();
  const model = lyriaModelSelect.value;
  const prompt = lyriaPromptInput.value.trim();

  if (!apiKey) {
    lyriaStatus.innerHTML = 'Please enter a valid <code>GEMINI_API_KEY</code> to call Google\'s <code>lyria-3.5</code> API, or click "Switch to WebAudio Synth" for instant procedural synthwave.';
    return;
  }

  localStorage.setItem('bevelez_gemini_api_key', apiKey);
  btnGenerateLyria.disabled = true;
  btnGenerateLyria.querySelector('span').textContent = '⏳ Generating with Lyria 3.5...';
  lyriaStatus.innerHTML = `Contacting Gemini Interactions API (<code>${model}</code>)... Generating 44.1 kHz stereo audio (this takes ~15–30s)...`;

  try {
    const blobUrl = await audioEngine.generateWithLyria({ apiKey, model, prompt });
    btnDownloadLyria.href = blobUrl;
    btnDownloadLyria.classList.remove('hidden');
    lyriaStatus.innerHTML = `✦ <strong>Success!</strong> Streaming newly generated <code>${model}</code> cyberpunk soundtrack. Click <strong>Save MP3 to Disk</strong> to save it as <code>assets/lyria-cyberpunk.mp3</code>.`;
  } catch (err) {
    lyriaStatus.innerHTML = `<span style="color:#ff6b9d">Error calling Lyria API: ${err.message}</span><br/>Falling back to the Outrun Radio.`;
    audioEngine.startSynth();
  } finally {
    btnGenerateLyria.disabled = false;
    btnGenerateLyria.querySelector('span').textContent = '✦ Generate with Lyria 3.5';
  }
});

// Draw Top-Bar Audio Spectrum Visualizer
function renderAudioVisualizer(metrics) {
  visCtx.clearRect(0, 0, visCanvas.width, visCanvas.height);
  const bars = 12;
  const barW = 4;
  const gap = 2;

  for (let i = 0; i < bars; i++) {
    const val = audioEngine.isPlaying
      ? metrics.spectrum[i * 2] / 255
      : 0.12 + Math.sin(performance.now() * 0.004 + i * 0.5) * 0.06;
    const barH = Math.max(3, val * (visCanvas.height - 4));
    const x = i * (barW + gap) + 3;
    const y = visCanvas.height - barH - 2;

    visCtx.fillStyle = i % 2 === 0 ? '#00f3ff' : '#ff007f';
    visCtx.fillRect(x, y, barW, barH);
  }
}

// ============================================================================
// 9. ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();
let displayedMph = 142;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  const isBoosting = keysPressed.boost || overdriveLocked;
  const baseSpeed = isBoosting ? 92 : 48;
  const targetMph = isBoosting ? 248 : 142;
  displayedMph = THREE.MathUtils.lerp(displayedMph, targetMph + Math.sin(elapsed * 3) * 1.5, dt * 4);
  speedValueEl.textContent = Math.round(displayedMph);

  // Audio Reactivity Metrics
  const metrics = audioEngine.getMetrics();
  renderAudioVisualizer(metrics);

  // Keyboard steering override
  if (keysPressed.left) targetCarX = Math.max(-5.8, targetCarX - 10 * dt);
  if (keysPressed.right) targetCarX = Math.min(5.8, targetCarX + 10 * dt);

  // Smooth Car Lateral Movement, Bank Roll & Suspension Bob
  const prevX = carGroup.position.x;
  carGroup.position.x = THREE.MathUtils.lerp(carGroup.position.x, targetCarX, dt * 6.5);
  const lateralVel = (carGroup.position.x - prevX) / Math.max(dt, 0.001);

  carGroup.rotation.z = THREE.MathUtils.lerp(carGroup.rotation.z, -lateralVel * 0.028, dt * 8);
  carGroup.rotation.y = THREE.MathUtils.lerp(carGroup.rotation.y, -lateralVel * 0.018, dt * 8);
  carGroup.position.y = 0.42 + Math.sin(elapsed * 18) * 0.008 + metrics.bass * 0.04;

  // Spin wheels
  carWheels.forEach((w) => {
    w.rotation.x -= baseSpeed * dt * 0.45;
  });

  // Thrusters: completely hidden during cruising, only igniting when BOOST (isBoosting) is active
  if (!isBoosting) {
    exhaustFlames.forEach(({ flame, core, halo }) => {
      flame.visible = false;
      core.visible = false;
      halo.visible = false;
    });
    thrusterLight.intensity = 0;
  } else {
    const flameBase = 2.2 + metrics.bass * 0.8;
    let thrusterFlicker = 0;
    exhaustFlames.forEach(({ flame, core, halo, phase }) => {
      flame.visible = true;
      core.visible = true;
      halo.visible = true;
      const flicker = 0.78 + 0.22 * Math.sin(elapsed * 45 + phase) + (Math.random() - 0.5) * 0.18;
      const scaleZ = flameBase * flicker;
      flame.scale.set(
        1 + metrics.bass * 0.3,
        1 + metrics.bass * 0.3,
        scaleZ
      );
      flame.position.z = 2.34 + scaleZ * 0.4;
      flame.material.opacity = 0.8 + 0.2 * flicker;
      core.scale.set(1, 1, scaleZ * 0.9);
      core.position.z = 2.32 + scaleZ * 0.26;
      core.material.opacity = 0.7 + 0.3 * flicker;
      const haloSize = (0.45 + boostBlend * 0.3 + metrics.bass * 0.2) * (0.9 + 0.2 * flicker);
      halo.scale.set(haloSize, haloSize, 1);
      halo.position.z = 2.34;
      halo.material.opacity = 0.45 + 0.3 * flicker;
      thrusterFlicker += flicker;
    });
    thrusterLight.intensity = (2.0 + boostBlend * 1.5 + metrics.bass * 1.0) * (thrusterFlicker / exhaustFlames.length);
    thrusterLight.color.setHex(0xff6622);
  }

  // Authentic lateral taillights & soft overhead rim light without bleaching center license plate
  const tailBase = 0.60 + metrics.bass * 0.12;
  leftTailLight.intensity = tailBase;
  rightTailLight.intensity = tailBase;
  rearOverheadLight.intensity = 1.35 + metrics.bass * 0.10;

  // Post grade: aberration widens with bass hits and under boost, grain keeps moving
  boostBlend = THREE.MathUtils.lerp(boostBlend, isBoosting ? 1 : 0, dt * 3);
  gradePass.uniforms.uTime.value = elapsed;
  gradePass.uniforms.uAberration.value = 0.0012 + metrics.bass * 0.0016 + boostBlend * 0.003;
  bloomPass.strength = 0.36 + metrics.bass * 0.09 + boostBlend * 0.08;

  // Scroll Highway Lane Dashes
  const totalDashSpan = numDashesPerLane * dashSpacing;
  for (const dash of dashObjects) {
    dash.position.z += baseSpeed * dt;
    if (dash.position.z > 24) {
      dash.position.z -= totalDashSpan;
    }
  }

  // Scroll Highway Environment Props
  const envWrapZ = Math.max(24, envPropsSegmentSpacing * 1.5);
  for (const prop of activeEnvPropGroups) {
    prop.position.z += baseSpeed * dt;
    if (prop.position.z > envWrapZ) {
      prop.position.z -= envPropsTotalSpan;
    }
  }

  // Continuous real-time rotation of Windmill Rotor child nodes in Mode 2
  if (activeWindmillRotors.length > 0) {
    const rotorSpeed = (baseSpeed * 0.05 + 1.2) * dt;
    for (const rotor of activeWindmillRotors) {
      rotor.rotation.z -= rotorSpeed;
    }
  }

  // Scroll Outrun Wireframe Mountain Terrain Chunks
  for (const chunk of terrainChunks) {
    chunk.group.position.z += baseSpeed * dt;
    if (chunk.group.position.z > 90) {
      chunk.group.position.z -= chunk.length * 2;
    }
    chunk.wireMat.opacity = 0.36 + metrics.bass * 0.35;
  }

  // Scroll Starfield / Neon Rain Particles
  const posAttr = starGeo.attributes.position;
  for (let i = 0; i < starCount; i++) {
    let z = posAttr.getZ(i) + baseSpeed * dt * 0.85;
    if (z > 25) z -= 340;
    posAttr.setZ(i, z);
  }
  posAttr.needsUpdate = true;

  // Audio-Reactive Megacity Towers & Synthwave Sun Pulse
  const sunScale = 1.0 + metrics.bass * 0.08;
  sunMesh.scale.set(sunScale, sunScale, 1);

  for (const cap of reactiveCityCaps) {
    const bandEnergy = metrics.spectrum[cap.band] / 255;
    cap.mesh.position.y = cap.baseY + bandEnergy * 2.5;
    cap.mesh.scale.y = 1 + bandEnergy * 4.0;
  }

  // Midgar Horizon Searchlight Sweeping & Mako Core Energy Pulse
  if (midgarCityGroup && midgarCityGroup.visible) {
    for (const sl of midgarSearchlights) {
      sl.mesh.rotation.z = sl.baseRotZ + Math.sin(elapsed * sl.speed + sl.phase) * 0.32;
      sl.mesh.rotation.x = Math.cos(elapsed * sl.speed * 0.8 + sl.phase) * 0.18;
    }
    const makoPulse = 0.88 + 0.12 * Math.sin(elapsed * 4.0) + metrics.bass * 0.20;
    makoCoreMat.color.setRGB(0, 0.90 * makoPulse, 0.60 * makoPulse);
    coolingRingMat.color.setRGB(0.78 * makoPulse, 1.0 * makoPulse, 0.91 * makoPulse);
  }

  // Smooth Camera Follow & Adaptive Framing for Folded/Unfolded Screens
  const camPreset = CAMERA_MODES[currentCameraIdx];
  const isNarrowOrSquare = camera.aspect < 1.15;
  const aspectFactor = isNarrowOrSquare ? Math.max(0, (1.15 - camera.aspect) * 14) : 0;
  const targetFov = (isBoosting ? 72 : 60) + aspectFactor;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 5);
    camera.updateProjectionMatrix();
  }

  const desiredCamX = carGroup.position.x * 0.55 + camPreset.offset.x;
  const desiredCamY = camPreset.offset.y + Math.sin(elapsed * 2.2) * 0.06;
  const desiredCamZ = camPreset.offset.z + (isNarrowOrSquare ? (1.15 - camera.aspect) * 2.6 : 0);

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredCamX, dt * 5);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredCamY, dt * 5);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredCamZ, dt * 5);
  camera.lookAt(carGroup.position.x * 0.25, 1.8, camPreset.lookZ);

  roadWorlds[currentRoadMode]?.update?.({
    dt,
    elapsed,
    baseSpeed,
    isBoosting,
    boostBlend,
    metrics,
    carGroup,
    camera
  });

  composer.render();
}

animate();

// ============================================================================
// 10. RESPONSIVE RESIZE HANDLER
// ============================================================================
window.addEventListener('resize', () => {
  const { width, height } = viewportSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  gradePass.uniforms.uResolution.value.set(
    width * renderer.getPixelRatio(),
    height * renderer.getPixelRatio()
  );
});
