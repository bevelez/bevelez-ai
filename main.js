import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CyberAudioEngine } from './audio.js?v=7';

// ============================================================================
// 1. INITIALIZE SCENE, CAMERA, RENDERER & BLOOM POST-PROCESSING
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04010c);
scene.fog = new THREE.FogExp2(0x09021c, 0.0042);

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
  0.3,  // radius
  1.06  // threshold (HDR: only neon / sun / emissive windows cross it)
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

const horizonLight = new THREE.DirectionalLight(0xff007f, 1.0);
horizonLight.position.set(0, 35, -260);
scene.add(horizonLight);

const cityRimLight = new THREE.DirectionalLight(0x00f3ff, 1.2);
cityRimLight.position.set(-40, 25, 30);
scene.add(cityRimLight);

// ============================================================================
// 3. SYNTHWAVE SEGMENTED SUN & STARFIELD AT HORIZON
// ============================================================================
function createSynthwaveSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#ffea00');
  grad.addColorStop(0.35, '#ff5e00');
  grad.addColorStop(0.7, '#ff007f');
  grad.addColorStop(1.0, '#6a00f4');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(256, 256, 240, 0, Math.PI * 2);
  ctx.fill();

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

  return new THREE.CanvasTexture(canvas);
}

const sunGroup = new THREE.Group();
const sunGeo = new THREE.PlaneGeometry(125, 125);
const sunMat = new THREE.MeshBasicMaterial({
  map: createSynthwaveSunTexture(),
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
  roughness: 0.56,
  metalness: 0.5
});
const roadMesh = new THREE.Mesh(roadGeo, roadMat);
roadMesh.rotation.x = -Math.PI / 2;
roadMesh.position.set(0, 0, -ROAD_LENGTH / 2 + 25);
scene.add(roadMesh);

// Glowing continuous neon shoulder rails (Cyan outer, Magenta inner)
function createGlowingRail(xPos, colorHex, width = 0.22) {
  const geo = new THREE.PlaneGeometry(width, ROAD_LENGTH);
  const mat = new THREE.MeshBasicMaterial({ color: neonColor(colorHex) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(xPos, 0.02, -ROAD_LENGTH / 2 + 25);
  scene.add(mesh);
  return mesh;
}

createGlowingRail(-ROAD_WIDTH / 2, 0x00f3ff, 0.28);
createGlowingRail(ROAD_WIDTH / 2, 0x00f3ff, 0.28);
createGlowingRail(-ROAD_WIDTH / 2 + 0.5, 0xff007f, 0.1);
createGlowingRail(ROAD_WIDTH / 2 - 0.5, 0xff007f, 0.1);

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

// Scrolling Neon Light Pylons & Overhead Cyber Arches along the highway
const highwayProps = [];
const NUM_PYLON_PAIRS = 18;
const PYLON_SPACING = 16;

const pylonPostGeo = new THREE.BoxGeometry(0.28, 6.5, 0.28);
const pylonPostMat = new THREE.MeshStandardMaterial({
  color: 0x120d26,
  metalness: 0.8,
  roughness: 0.3
});
const neonStripGeo = new THREE.BoxGeometry(0.12, 5.8, 0.14);
const neonCyanMat = new THREE.MeshBasicMaterial({ color: neonColor(0x00f3ff) });
const neonPinkMat = new THREE.MeshBasicMaterial({ color: neonColor(0xff007f) });

for (let i = 0; i < NUM_PYLON_PAIRS; i++) {
  const pairGroup = new THREE.Group();
  const zPos = 16 - i * PYLON_SPACING;
  const isArch = i % 3 === 0;

  [-1, 1].forEach((side) => {
    const xBase = side * (ROAD_WIDTH / 2 + 0.8);
    const post = new THREE.Mesh(pylonPostGeo, pylonPostMat);
    post.position.set(xBase, 3.25, 0);
    pairGroup.add(post);

    const strip = new THREE.Mesh(
      neonStripGeo,
      i % 2 === 0 ? neonCyanMat : neonPinkMat
    );
    strip.position.set(xBase - side * 0.16, 3.25, 0);
    pairGroup.add(strip);
  });

  if (isArch) {
    const archBeamGeo = new THREE.BoxGeometry(ROAD_WIDTH + 2.0, 0.22, 0.22);
    const archBeam = new THREE.Mesh(archBeamGeo, i % 2 === 0 ? neonPinkMat : neonCyanMat);
    archBeam.position.set(0, 6.5, 0);
    pairGroup.add(archBeam);
  }

  pairGroup.position.z = zPos;
  scene.add(pairGroup);
  highwayProps.push(pairGroup);
}

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
  return { group: chunkGroup, wireMat, length };
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
// 6. HERO CYBERPUNK SPORTS CAR (QUADRA / COUNTACH SYNTHWAVE SUPERCAR)
// ============================================================================
const carGroup = new THREE.Group();
carGroup.position.set(0, 0.42, 6.5);
scene.add(carGroup);

const bodyPaintMat = new THREE.MeshStandardMaterial({
  color: 0x101324,
  metalness: 0.88,
  roughness: 0.22
});

const darkTrimMat = new THREE.MeshStandardMaterial({
  color: 0x07070f,
  metalness: 0.6,
  roughness: 0.45
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
carGroup.add(chassisMesh);

// Sloped front nose hood
const hoodGeo = new THREE.BoxGeometry(2.12, 0.28, 1.55);
const hoodMesh = new THREE.Mesh(hoodGeo, bodyPaintMat);
hoodMesh.position.set(0, 0.34, -1.62);
hoodMesh.rotation.x = 0.14;
carGroup.add(hoodMesh);

//Wide rear fenders / haunches
[-0.98, 0.98].forEach((xSide) => {
  const fenderGeo = new THREE.BoxGeometry(0.38, 0.48, 2.1);
  const fender = new THREE.Mesh(fenderGeo, bodyPaintMat);
  fender.position.set(xSide, 0.28, 0.95);
  carGroup.add(fender);

  // Glowing cyan side skirt laser strip
  const skirtGlowGeo = new THREE.BoxGeometry(0.05, 0.05, 3.8);
  const skirtGlowMat = new THREE.MeshBasicMaterial({ color: neonColor(0x00f3ff) });
  const skirtGlow = new THREE.Mesh(skirtGlowGeo, skirtGlowMat);
  skirtGlow.position.set(xSide * 1.15, 0.06, 0.0);
  carGroup.add(skirtGlow);
});

// Sleek angled cabin canopy
const cabinGeo = new THREE.BoxGeometry(1.72, 0.42, 2.05);
const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
cabinMesh.position.set(0, 0.6, -0.15);
carGroup.add(cabinMesh);

// Synthwave rear window louvers
for (let i = 0; i < 5; i++) {
  const louverGeo = new THREE.BoxGeometry(1.48, 0.04, 0.18);
  const louver = new THREE.Mesh(louverGeo, darkTrimMat);
  louver.position.set(0, 0.78 - i * 0.065, 0.62 + i * 0.26);
  louver.rotation.x = -0.25;
  carGroup.add(louver);
}

// Aggressive Rear Spoiler Wing with Neon Tips
const spoilerWingGeo = new THREE.BoxGeometry(2.32, 0.06, 0.38);
const spoilerWing = new THREE.Mesh(spoilerWingGeo, bodyPaintMat);
spoilerWing.position.set(0, 0.76, 2.12);
spoilerWing.rotation.x = 0.12;
carGroup.add(spoilerWing);

[-0.85, 0.85].forEach((xStrut) => {
  const strutGeo = new THREE.BoxGeometry(0.08, 0.28, 0.3);
  const strut = new THREE.Mesh(strutGeo, darkTrimMat);
  strut.position.set(xStrut, 0.6, 2.08);
  carGroup.add(strut);
});

// Iconic Full-Width Glowing Cyberpunk Tail Light Bar
const tailLightBarGeo = new THREE.BoxGeometry(2.14, 0.14, 0.08);
const tailLightMat = new THREE.MeshBasicMaterial({ color: neonColor(0xff0055, 1.45) });
const tailLightBar = new THREE.Mesh(tailLightBarGeo, tailLightMat);
tailLightBar.position.set(0, 0.36, 2.34);
carGroup.add(tailLightBar);

// Secondary lower diffuser light strip
const lowerTailGeo = new THREE.BoxGeometry(1.9, 0.05, 0.08);
const lowerTailMat = new THREE.MeshBasicMaterial({ color: neonColor(0xff5500, 1.15) });
const lowerTail = new THREE.Mesh(lowerTailGeo, lowerTailMat);
lowerTail.position.set(0, 0.18, 2.34);
carGroup.add(lowerTail);

// Dual Plasma Afterburner Exhaust Thrusters
const exhaustFlames = [];
[-0.55, 0.55].forEach((xEx) => {
  const pipeGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.25, 12);
  pipeGeo.rotateX(Math.PI / 2);
  const pipe = new THREE.Mesh(pipeGeo, darkTrimMat);
  pipe.position.set(xEx, 0.12, 2.32);
  carGroup.add(pipe);

  const flameGeo = new THREE.ConeGeometry(0.11, 0.75, 12);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: neonColor(0x00f3ff, 1.4),
    transparent: true,
    opacity: 0.9
  });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(xEx, 0.12, 2.68);
  carGroup.add(flame);
  exhaustFlames.push(flame);
});

// 4 Spinning Wheels with Neon Cyan Rims
const carWheels = [];
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.34, 20);
wheelGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.85 });

const rimGeo = new THREE.TorusGeometry(0.24, 0.032, 8, 20);
rimGeo.rotateY(Math.PI / 2);
const rimMat = new THREE.MeshBasicMaterial({ color: neonColor(0x00f3ff, 1.2) });

const wheelPositions = [
  { x: -1.12, y: -0.04, z: -1.38 },
  { x: 1.12, y: -0.04, z: -1.38 },
  { x: -1.16, y: -0.02, z: 1.38 },
  { x: 1.16, y: -0.02, z: 1.38 }
];

wheelPositions.forEach((wp) => {
  const wGroup = new THREE.Group();
  wGroup.position.set(wp.x, wp.y, wp.z);

  const tire = new THREE.Mesh(wheelGeo, tireMat);
  wGroup.add(tire);

  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.x = wp.x < 0 ? -0.17 : 0.17;
  wGroup.add(rim);

  carGroup.add(wGroup);
  carWheels.push(wGroup);
});

// Car Neon Underglow & Rear Tail Light PointLight
const underglowLight = new THREE.PointLight(0x00f3ff, 1.6, 9);
underglowLight.position.set(0, -0.1, 0);
carGroup.add(underglowLight);

const tailPointLight = new THREE.PointLight(0xff0055, 1.5, 10);
tailPointLight.position.set(0, 0.4, 2.8);
carGroup.add(tailPointLight);

// ============================================================================
// 7. INTERACTIVE CONTROLS (STEERING, OVERDRIVE BOOST, CAMERA MODES)
// ============================================================================
let targetCarX = 0;
const keysPressed = { left: false, right: false, boost: false };
let overdriveLocked = false;

// Camera presets
const CAMERA_MODES = [
  { name: 'CHASE', offset: new THREE.Vector3(0, 2.35, 11.4), lookZ: -35 },
  { name: 'LOW RETRO', offset: new THREE.Vector3(0, 1.35, 9.8), lookZ: -50 },
  { name: 'COCKPIT HOOD', offset: new THREE.Vector3(0, 1.32, 5.2), lookZ: -80 },
  { name: 'HELI WIDE', offset: new THREE.Vector3(0, 5.8, 15.5), lookZ: -45 }
];
let currentCameraIdx = 0;

// Start on the chase preset instead of lerping in from the origin: the first frames (and any
// crawler / share-preview capture) show the highway, not the road plane edge-on from ground level.
camera.position.copy(CAMERA_MODES[0].offset);
camera.lookAt(0, 1.8, CAMERA_MODES[0].lookZ);

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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysPressed.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysPressed.right = true;
  if (e.key === 'Shift') keysPressed.boost = true;
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysPressed.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysPressed.right = false;
  if (e.key === 'Shift') keysPressed.boost = false;
});

// ============================================================================
// 8. UI WIRING & LYRIA 3.5 AUDIO STUDIO
// ============================================================================
const audioEngine = new CyberAudioEngine();
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
  lyriaStatus.innerHTML = 'Switched to built-in <strong>Cyberpunk Chill Web Audio Synthesizer (92 BPM)</strong>.';
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
    lyriaStatus.innerHTML = `<span style="color:#ff6b9d">Error calling Lyria API: ${err.message}</span><br/>Falling back to built-in Cyberpunk Chill Synthwave engine.`;
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

  // Pulse exhaust flames & tail lights with boost + bass
  const flameScaleZ = (isBoosting ? 2.1 : 1.0) + Math.sin(elapsed * 45) * 0.25 + metrics.bass * 0.9;
  exhaustFlames.forEach((flame) => {
    flame.scale.set(1 + metrics.bass * 0.3, 1 + metrics.bass * 0.3, flameScaleZ);
    flame.position.z = 2.52 + flameScaleZ * 0.22;
  });
  tailPointLight.intensity = 1.5 + metrics.bass * 1.8 + boostBlend * 1.0;

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

  // Scroll Highway Pylons & Overhead Neon Arches
  const totalPylonSpan = NUM_PYLON_PAIRS * PYLON_SPACING;
  for (const prop of highwayProps) {
    prop.position.z += baseSpeed * dt;
    if (prop.position.z > 22) {
      prop.position.z -= totalPylonSpan;
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
