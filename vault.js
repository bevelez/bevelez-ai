import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ============================================================================
// 1. CURATED CASSETTE ARCHIVE — EACH TAPE MATCHES ITS MUSICAL & VISUAL WORLD
// ============================================================================
const TAPES = [
  {
    id: '01',
    pillLabel: '01  Clair de Lune',
    indexMeta: 'No. 01 — Claude Debussy, 1890',
    title: 'Clair de Lune',
    desc: 'An intimate nocturnal study for dark felt grand piano in D♭ major. Listen as the piano performs, or play directly across the keys.',
    unlocked: true,
    url: './clair-de-lune.html',
    shellColor: 0x1e2942,
    shellAttenuation: 0x0b101d,
    ribColor: 0x151d30,
    hubColor: 0xe8dfd1,
    artStyle: 'clair'
  },
  {
    id: '02',
    pillLabel: '02  Passacaglia',
    indexMeta: 'No. 02 — G. F. Handel, HWV 432/6',
    title: 'Passacaglia in G Minor',
    desc: 'A visual story of a life told through intricate 3D emissive line sculptures that merge across eight movements of Handel’s Passacaglia.',
    unlocked: true,
    url: './passacaglia.html',
    // Warm Smoked Bronze / Espresso Obsidian translucent shell
    shellColor: 0x3b2a1e,
    shellAttenuation: 0x1a110b,
    ribColor: 0x2b1d14,
    hubColor: 0xede4d3,
    artStyle: 'passacaglia'
  },
  {
    id: '03',
    pillLabel: '03  Night Drive',
    indexMeta: 'No. 03 — Interactive Audio Cruiser',
    title: 'Night Drive',
    desc: 'Endless midnight highway cruiser with procedural synthwave and Gemini Lyria 3.5 soundtrack generation.',
    unlocked: true,
    url: './index.html',
    shellColor: 0x9e1b3e,
    shellAttenuation: 0x59091e,
    ribColor: 0x7d1230,
    hubColor: 0xf4f1ea,
    artStyle: 'drive'
  },
  {
    id: '04',
    pillLabel: '04  Etude in Glass',
    indexMeta: 'No. 04 — In Production',
    title: 'Etude in Glass',
    desc: 'Upcoming polyphonic harmonic study for bowed glass and resonant strings.',
    unlocked: false,
    url: null,
    shellColor: 0x5c7a6b,
    shellAttenuation: 0x2d4238,
    ribColor: 0x486356,
    hubColor: 0xf2efe9,
    artStyle: 'etude'
  }
];

// ============================================================================
// 2. THREE.JS SCENE, HDR STUDIO LIGHTING & SOFT CONTACT SHADOW
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Pulled-back camera framing so the cassette sits with generous negative space
const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.5,
  60
);
camera.position.set(0, 0.08, 10.4);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
roomEnv.dispose();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfffcf5, 2.5);
keyLight.position.set(5, 8, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xeef2ff, 1.35);
fillLight.position.set(-6, 3, 5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 1.9);
rimLight.position.set(0, 5, -7);
scene.add(rimLight);

function createShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(256, 128, 10, 256, 128, 220);
  grad.addColorStop(0, 'rgba(15, 14, 12, 0.25)');
  grad.addColorStop(0.5, 'rgba(15, 14, 12, 0.09)');
  grad.addColorStop(1, 'rgba(15, 14, 12, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  return new THREE.CanvasTexture(c);
}

const shadowGeo = new THREE.PlaneGeometry(5.2, 1.45);
shadowGeo.rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({
  map: createShadowTexture(),
  transparent: true,
  depthWrite: false
});
const floorShadow = new THREE.Mesh(shadowGeo, shadowMat);
floorShadow.position.set(0, -1.72, 0);
scene.add(floorShadow);

// ============================================================================
// 3. BESPOKE COVER ART GENERATOR FOR EACH CASSETTE TAPE
// ============================================================================
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawClairDeLuneArtwork(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, 480);
  bg.addColorStop(0, '#0a0f1d');
  bg.addColorStop(0.6, '#121b30');
  bg.addColorStop(1, '#080b14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  const moonGlow = ctx.createRadialGradient(825, 140, 10, 825, 140, 200);
  moonGlow.addColorStop(0, 'rgba(238, 219, 173, 0.35)');
  moonGlow.addColorStop(0.45, 'rgba(150, 182, 230, 0.12)');
  moonGlow.addColorStop(1, 'rgba(10, 15, 29, 0)');
  ctx.fillStyle = moonGlow;
  ctx.fillRect(0, 0, 1024, 480);

  // Full Moon
  ctx.save();
  ctx.fillStyle = '#f3e3be';
  ctx.beginPath();
  ctx.arc(825, 132, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(196, 174, 128, 0.35)';
  ctx.beginPath();
  ctx.arc(810, 120, 15, 0, Math.PI * 2);
  ctx.arc(840, 145, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Moonlight water ripples
  ctx.save();
  ctx.strokeStyle = 'rgba(235, 212, 160, 0.55)';
  for (let i = 0; i < 14; i++) {
    const y = 205 + i * 11;
    const spread = 22 + i * 3.5;
    const xOffset = Math.sin(i * 1.7) * 7;
    ctx.lineWidth = i % 3 === 0 ? 2.2 : 1.3;
    ctx.beginPath();
    ctx.moveTo(825 - spread + xOffset, y);
    ctx.lineTo(825 + spread + xOffset, y);
    ctx.stroke();
  }
  ctx.restore();

  // Bottom piano keybed band
  ctx.fillStyle = '#070910';
  ctx.fillRect(16, 396, 992, 68);

  ctx.strokeStyle = '#c8ad78';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  const keyStartX = 340;
  const numKeys = 23;
  const keyW = 15;
  for (let k = 0; k < numKeys; k++) {
    const kx = keyStartX + k * keyW;
    ctx.fillStyle = 'rgba(236, 229, 214, 0.82)';
    ctx.fillRect(kx, 404, keyW - 2, 44);
  }
  for (let k = 0; k < numKeys - 1; k++) {
    const mod = k % 7;
    if (mod !== 2 && mod !== 6) {
      const kx = keyStartX + k * keyW + 10;
      ctx.fillStyle = '#0a0d16';
      ctx.fillRect(kx, 404, 9, 26);
    }
  }

  ctx.fillStyle = '#c8ad78';
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText('CLAUDE DEBUSSY  ·  SUITE BERGAMASQUE, L. 75', 56, 62);

  ctx.fillStyle = '#f5f1e8';
  ctx.font = 'italic 600 68px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Clair de Lune', 54, 132);

  ctx.fillStyle = '#c8ad78';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('SIDE A', 56, 245);
  ctx.fillStyle = 'rgba(245, 241, 232, 0.68)';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('D♭ MAJOR', 56, 270);
  ctx.fillText('9/8 RUBATO', 56, 294);
  ctx.fillText('FELT PIANO', 56, 318);

  ctx.fillStyle = '#c8ad78';
  ctx.fillText('NO. 01', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('CrO₂ · 90 MIN', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(200, 173, 120, 0.65)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function drawPassacagliaArtwork(ctx) {
  // Deep warm espresso-obsidian canvas with golden Fourier epicycle rings & dancing couple contour
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#0f0b08');
  bg.addColorStop(0.55, '#1c140e');
  bg.addColorStop(1, '#0c0806');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  // Warm golden aura around the Fourier epicycles on the right
  const glow = ctx.createRadialGradient(835, 210, 8, 835, 210, 170);
  glow.addColorStop(0, 'rgba(235, 195, 120, 0.32)');
  glow.addColorStop(0.5, 'rgba(210, 155, 80, 0.10)');
  glow.addColorStop(1, 'rgba(15, 11, 8, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 480);

  // Nested Fourier Epicycle Circles & Radius Vectors on right side
  ctx.save();
  const epicycles = [
    { x: 835, y: 205, r: 78 },
    { x: 835 + 55, y: 205 - 55, r: 38 },
    { x: 835 + 55 - 26, y: 205 - 55 - 28, r: 18 },
    { x: 835 + 55 - 26 + 14, y: 205 - 55 - 28 + 11, r: 8 }
  ];
  epicycles.forEach((c, idx) => {
    ctx.strokeStyle = `rgba(230, 194, 128, ${0.35 + idx * 0.12})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.stroke();

    if (idx < epicycles.length - 1) {
      const next = epicycles[idx + 1];
      ctx.strokeStyle = 'rgba(245, 222, 179, 0.65)';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
  });

  // Glowing continuous Fourier curve silhouette on the right (waltzing arc)
  ctx.strokeStyle = '#f7e4bc';
  ctx.shadowColor = '#e6b86a';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  for (let t = 0; t <= Math.PI * 2; t += 0.04) {
    const x = 835 + Math.sin(t) * 46 + Math.cos(2 * t + 0.6) * 22 + Math.sin(3 * t) * 11;
    const y = 215 + Math.cos(t) * 64 + Math.sin(2 * t) * 18 + Math.cos(5 * t) * 7;
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Bottom bar with harmonic wave
  ctx.fillStyle = '#090604';
  ctx.fillRect(16, 396, 992, 68);

  ctx.strokeStyle = '#d4af72';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  // Fourier wave along bottom center
  ctx.strokeStyle = 'rgba(230, 194, 128, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 310; x <= 714; x += 3) {
    const u = (x - 310) * 0.045;
    const y = 430 + Math.sin(u) * 11 + Math.sin(u * 2.7) * 5 + Math.cos(u * 5.1) * 2.5;
    if (x === 310) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Typography
  ctx.fillStyle = '#d4af72';
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText('G. F. HANDEL  ·  SUITE NO. 7 IN G MINOR, HWV 432/6', 56, 62);

  ctx.fillStyle = '#f7f2e7';
  ctx.font = 'italic 600 68px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('VI. Passacaglia', 54, 132);

  ctx.fillStyle = '#d4af72';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('SIDE A', 56, 245);
  ctx.fillStyle = 'rgba(247, 242, 231, 0.68)';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('G MINOR', 56, 270);
  ctx.fillText('FOURIER LIFE', 56, 294);
  ctx.fillText('8 VARIATIONS', 56, 318);

  ctx.fillStyle = '#d4af72';
  ctx.fillText('NO. 02', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('∑ cₙ e^(inωt)', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(212, 175, 114, 0.65)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function drawNightDriveArtwork(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#140b1c');
  bg.addColorStop(0.55, '#3b1234');
  bg.addColorStop(1, '#9e1946');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  const sunGrad = ctx.createLinearGradient(820, 70, 820, 200);
  sunGrad.addColorStop(0, '#ffbe76');
  sunGrad.addColorStop(1, '#eb4d4b');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(825, 135, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3b1234';
  for (let s = 0; s < 4; s++) {
    ctx.fillRect(760, 152 + s * 11, 130, 4 + s);
  }

  ctx.fillStyle = '#0e0714';
  ctx.fillRect(16, 396, 992, 68);

  ctx.strokeStyle = 'rgba(255, 190, 118, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  for (let i = -4; i <= 4; i++) {
    ctx.moveTo(512 + i * 35, 396);
    ctx.lineTo(512 + i * 110, 464);
  }
  ctx.stroke();

  ctx.fillStyle = '#ffbe76';
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText('HORIZON STUDY  ·  SYNTHESIS & LYRIA 3.5', 56, 62);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 600 68px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Night Drive', 54, 132);

  ctx.fillStyle = '#ffbe76';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('SIDE A', 56, 245);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('92 BPM', 56, 270);
  ctx.fillText('STEREO', 56, 294);

  ctx.fillStyle = '#ffbe76';
  ctx.fillText('NO. 03', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('TYPE IV · 120 MIN', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255, 190, 118, 0.5)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function drawEtudeArtwork(ctx) {
  ctx.fillStyle = '#ebe6dc';
  ctx.fillRect(0, 0, 1024, 480);

  ctx.strokeStyle = 'rgba(30, 42, 36, 0.35)';
  ctx.lineWidth = 1.8;
  for (let r = 22; r <= 88; r += 14) {
    ctx.beginPath();
    ctx.arc(825, 140, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#1e2a24';
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText('ARCHIVAL STUDY  ·  POLYPHONIC GLASS', 56, 62);

  ctx.font = 'italic 600 68px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Etude in Glass', 54, 132);

  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('SIDE A', 56, 245);
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('UPCOMING', 56, 270);

  ctx.fillText('NO. 04', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('60 MIN', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(30, 42, 36, 0.35)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function createCassetteStickerTexture(tape) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  ctx.save();
  roundedRectPath(ctx, 12, 12, 1000, 456, 28);
  ctx.clip();

  if (tape.artStyle === 'clair') {
    drawClairDeLuneArtwork(ctx);
  } else if (tape.artStyle === 'passacaglia') {
    drawPassacagliaArtwork(ctx);
  } else if (tape.artStyle === 'drive') {
    drawNightDriveArtwork(ctx);
  } else {
    drawEtudeArtwork(ctx);
  }
  ctx.restore();

  // PILL-SHAPED TRANSPARENT CENTER WINDOW CUTOUT
  const winX = 216;
  const winY = 166;
  const winW = 592;
  const winH = 204;
  const winR = 102;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  roundedRectPath(ctx, winX, winY, winW, winH, winR);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = tape.artStyle === 'etude' ? '#1e2a24' : '#c8ad78';
  ctx.lineWidth = 6;
  roundedRectPath(ctx, winX, winY, winW, winH, winR);
  ctx.stroke();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// ============================================================================
// 4. ZERO-Z-FIGHTING PRECISION 3D TRANSLUCENT CASSETTE ASSEMBLY
// ============================================================================
const cassetteRoot = new THREE.Group();
scene.add(cassetteRoot);

const SHELL_W = 4.2;
const SHELL_H = 2.68;
const WALL_T = 0.14;

function createHollowFrameGeometry(w, h, depth, cornerR, wallThickness) {
  const outer = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  outer.moveTo(-hw + cornerR, -hh);
  outer.lineTo(hw - cornerR, -hh);
  outer.quadraticCurveTo(hw, -hh, hw, -hh + cornerR);
  outer.lineTo(hw, hh - cornerR);
  outer.quadraticCurveTo(hw, hh, hw - cornerR, hh);
  outer.lineTo(-hw + cornerR, hh);
  outer.quadraticCurveTo(-hw, hh, -hw, hh - cornerR);
  outer.lineTo(-hw, -hh + cornerR);
  outer.quadraticCurveTo(-hw, -hh, -hw + cornerR, -hh);

  const inner = new THREE.Path();
  const ihw = hw - wallThickness;
  const ihh = hh - wallThickness;
  const ir = Math.max(0.04, cornerR - wallThickness * 0.6);
  inner.moveTo(-ihw + ir, -ihh);
  inner.lineTo(ihw - ir, -ihh);
  inner.quadraticCurveTo(ihw, -ihh, ihw, -ihh + ir);
  inner.lineTo(ihw, ihh - ir);
  inner.quadraticCurveTo(ihw, ihh, ihw - ir, ihh);
  inner.lineTo(-ihw + ir, ihh);
  inner.quadraticCurveTo(-ihw, ihh, -ihw, ihh - ir);
  inner.lineTo(-ihw, -ihh + ir);
  inner.quadraticCurveTo(-ihw, -ihh, -ihw + ir, -ihh);
  outer.holes.push(inner);

  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: depth,
    bevelEnabled: false,
    curveSegments: 24
  });
  geo.center();
  return geo;
}

function createRoundedPlateGeometry(w, h, depth, cornerR) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  shape.moveTo(-hw + cornerR, -hh);
  shape.lineTo(hw - cornerR, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cornerR);
  shape.lineTo(hw, hh - cornerR);
  shape.quadraticCurveTo(hw, hh, hw - cornerR, hh);
  shape.lineTo(-hw + cornerR, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cornerR);
  shape.lineTo(-hw, -hh + cornerR);
  shape.quadraticCurveTo(-hw, -hh, -hw + cornerR, -hh);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: false,
    curveSegments: 24
  });
  geo.center();
  return geo;
}

const clearAcrylicMat = new THREE.MeshPhysicalMaterial({
  color: 0x1e2942,
  attenuationColor: new THREE.Color(0x0b101d),
  attenuationDistance: 0.85,
  transparent: true,
  opacity: 1.0,
  transmission: 0.86,
  ior: 1.5,
  thickness: 0.65,
  roughness: 0.07,
  metalness: 0.02,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05
});

const innerRibAcrylicMat = new THREE.MeshPhysicalMaterial({
  color: 0x151d30,
  transparent: true,
  opacity: 0.68,
  transmission: 0.55,
  ior: 1.48,
  roughness: 0.15,
  metalness: 0.08,
  clearcoat: 1.0
});

// LAYER 1: Hollow Outer Rim Wall — strictly spans z = [-0.18, +0.18]
const rimFrameGeo = createHollowFrameGeometry(SHELL_W, SHELL_H, 0.36, 0.18, WALL_T);
const rimFrameMesh = new THREE.Mesh(rimFrameGeo, innerRibAcrylicMat);
cassetteRoot.add(rimFrameMesh);

// LAYER 2: Front & Back Faceplates — strictly outside the rim wall (z = ±0.200, spanning [0.186, 0.214])
const plateGeo = createRoundedPlateGeometry(SHELL_W, SHELL_H, 0.028, 0.18);
const frontPlate = new THREE.Mesh(plateGeo, clearAcrylicMat);
frontPlate.position.z = 0.200;
cassetteRoot.add(frontPlate);

const backPlate = new THREE.Mesh(plateGeo, clearAcrylicMat);
backPlate.position.z = -0.200;
cassetteRoot.add(backPlate);

// LAYER 3: Bottom Trapezoidal Head Bridge — positioned in the lower bay (y = [-1.26, -0.66])
// Strictly below the sticker label (which ends at y = -0.56) and mounted on the exterior (z = ±0.228)!
const trapShape = new THREE.Shape();
trapShape.moveTo(-1.36, -0.28);
trapShape.lineTo(1.36, -0.28);
trapShape.lineTo(1.14, 0.26);
trapShape.lineTo(-1.14, 0.26);
trapShape.closePath();

[-0.86, -0.44, 0.44, 0.86].forEach((hx, i) => {
  const hole = new THREE.Path();
  const radius = (i === 0 || i === 3) ? 0.10 : 0.078;
  const hy = (i === 0 || i === 3) ? -0.04 : 0.0;
  hole.absarc(hx, hy, radius, 0, Math.PI * 2, false);
  trapShape.holes.push(hole);
});

const trapPlateGeo = new THREE.ExtrudeGeometry(trapShape, {
  depth: 0.022,
  bevelEnabled: false,
  curveSegments: 20
});
trapPlateGeo.center();

const trapFront = new THREE.Mesh(trapPlateGeo, innerRibAcrylicMat);
trapFront.position.set(0, -0.96, 0.228);
cassetteRoot.add(trapFront);

const trapBack = new THREE.Mesh(trapPlateGeo, innerRibAcrylicMat);
trapBack.position.set(0, -0.96, -0.228);
cassetteRoot.add(trapBack);

// Internal structural ribs inside the hollow cavity (z = [-0.16, +0.16])
const ribGeo = new THREE.BoxGeometry(0.032, 0.44, 0.32);
[-0.65, -0.22, 0.22, 0.65].forEach((rx) => {
  const rib = new THREE.Mesh(ribGeo, innerRibAcrylicMat);
  rib.position.set(rx, -0.96, 0);
  cassetteRoot.add(rib);
});

// Metallic Pressure Pad Shield inside bottom slot (z = [-0.11, +0.11])
const metalMat = new THREE.MeshStandardMaterial({
  color: 0xd8d4ca,
  metalness: 0.88,
  roughness: 0.22
});
const padShield = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.20, 0.22), metalMat);
padShield.position.set(0, -1.06, 0);
cassetteRoot.add(padShield);

// LAYER 4: Two Spinning Internal Tape Reels (Strictly non-overlapping Z depths!)
const reels = [];
const reelPositionsX = [-0.88, 0.88];
const reelRadii = [0.66, 0.49];

const tapeOxideMat = new THREE.MeshStandardMaterial({
  color: 0x141218,
  roughness: 0.36,
  metalness: 0.22
});

const hubPlasticMat = new THREE.MeshStandardMaterial({
  color: 0xe8dfd1,
  roughness: 0.24,
  metalness: 0.15
});

reelPositionsX.forEach((rx, idx) => {
  const reelGroup = new THREE.Group();
  reelGroup.position.set(rx, 0.22, 0);

  // Magnetic tape pancake: depth = 0.20 (z = [-0.10, +0.10]), outerR -> 0.29
  const packRadius = reelRadii[idx];
  const innerHubR = 0.29;
  const pancakeShape = new THREE.Shape();
  pancakeShape.absarc(0, 0, packRadius, 0, Math.PI * 2, false);
  const pancakeHole = new THREE.Path();
  pancakeHole.absarc(0, 0, innerHubR, 0, Math.PI * 2, true);
  pancakeShape.holes.push(pancakeHole);

  const pancakeGeo = new THREE.ExtrudeGeometry(pancakeShape, {
    depth: 0.20,
    bevelEnabled: false,
    curveSegments: 48
  });
  pancakeGeo.center();
  const pancakeMesh = new THREE.Mesh(pancakeGeo, tapeOxideMat);
  reelGroup.add(pancakeMesh);

  // Hub Collar Ring: radius 0.285 -> 0.20, depth = 0.24 (z = [-0.12, +0.12])
  const collarShape = new THREE.Shape();
  collarShape.absarc(0, 0, 0.285, 0, Math.PI * 2, false);
  const collarHole = new THREE.Path();
  collarHole.absarc(0, 0, 0.20, 0, Math.PI * 2, true);
  collarShape.holes.push(collarHole);

  const collarGeo = new THREE.ExtrudeGeometry(collarShape, {
    depth: 0.24,
    bevelEnabled: false,
    curveSegments: 32
  });
  collarGeo.center();
  const collarMesh = new THREE.Mesh(collarGeo, hubPlasticMat);
  reelGroup.add(collarMesh);

  // 6 Inward Splined Drive Teeth: depth = 0.18 (z = [-0.09, +0.09]) — no Z-fighting with collar!
  const toothGeo = new THREE.BoxGeometry(0.044, 0.075, 0.18);
  for (let t = 0; t < 6; t++) {
    const angle = (t / 6) * Math.PI * 2;
    const tooth = new THREE.Mesh(toothGeo, hubPlasticMat);
    tooth.position.set(Math.cos(angle) * 0.172, Math.sin(angle) * 0.172, 0);
    tooth.rotation.z = angle + Math.PI / 2;
    reelGroup.add(tooth);
  }

  cassetteRoot.add(reelGroup);
  reels.push(reelGroup);
});

// Two Spinning Bottom-Corner Guide Rollers (Strictly stepped Z depths!)
const guideRollers = [];
const rollerGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.18, 24);
rollerGeo.rotateX(Math.PI / 2);
const rollerMat = new THREE.MeshStandardMaterial({
  color: 0x181520,
  roughness: 0.3,
  metalness: 0.5
});

[-1.62, 1.62].forEach((gx) => {
  const rGroup = new THREE.Group();
  rGroup.position.set(gx, -0.88, 0);

  const rWheel = new THREE.Mesh(rollerGeo, rollerMat);
  rGroup.add(rWheel);

  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.026, 0.21), metalMat);
  rGroup.add(spoke);

  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.25, 16).rotateX(Math.PI / 2),
    metalMat
  );
  rGroup.add(pin);

  cassetteRoot.add(rGroup);
  guideRollers.push(rGroup);
});

// Magnetic Tape Ribbon Path (depth = 0.16)
const tapePathPoints = [
  new THREE.Vector3(-1.48, 0.22, 0),
  new THREE.Vector3(-1.76, -0.88, 0),
  new THREE.Vector3(-1.32, -1.14, 0),
  new THREE.Vector3(1.32, -1.14, 0),
  new THREE.Vector3(1.76, -0.88, 0),
  new THREE.Vector3(1.34, 0.22, 0)
];
for (let i = 0; i < tapePathPoints.length - 1; i++) {
  const start = tapePathPoints[i];
  const end = tapePathPoints[i + 1];
  const len = start.distanceTo(end);
  const segGeo = new THREE.BoxGeometry(len, 0.016, 0.16);
  const segMesh = new THREE.Mesh(segGeo, tapeOxideMat);
  segMesh.position.copy(start).lerp(end, 0.5);
  segMesh.rotation.z = Math.atan2(end.y - start.y, end.x - start.x);
  cassetteRoot.add(segMesh);
}

// Corner Screw Posts (internal z = [-0.17, +0.17]) & Exterior Screw Heads (z = ±0.222)
const bossGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.34, 20);
bossGeo.rotateX(Math.PI / 2);
const screwCapGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 16);
screwCapGeo.rotateX(Math.PI / 2);

[
  [-1.88, 1.12],
  [1.88, 1.12],
  [-1.88, -1.12],
  [1.88, -1.12]
].forEach(([sx, sy]) => {
  const boss = new THREE.Mesh(bossGeo, innerRibAcrylicMat);
  boss.position.set(sx, sy, 0);
  cassetteRoot.add(boss);

  const screwFront = new THREE.Mesh(screwCapGeo, metalMat);
  screwFront.position.set(sx, sy, 0.222);
  cassetteRoot.add(screwFront);

  const screwBack = new THREE.Mesh(screwCapGeo, metalMat);
  screwBack.position.set(sx, sy, -0.222);
  cassetteRoot.add(screwBack);
});

// LAYER 5: Exterior Die-Cut Cover Art Sticker Label
// Height = 1.72, centered at y = +0.30 (spans y = [-0.56, +1.16], cleanly above the bottom trapezoid at y = -0.68!)
// Positioned at z = ±0.224 with polygonOffset so it NEVER Z-fights with the faceplate (z = ±0.214)!
const stickerGeo = new THREE.PlaneGeometry(3.68, 1.72);
const stickerMat = new THREE.MeshStandardMaterial({
  alphaTest: 0.4,
  transparent: false,
  roughness: 0.26,
  metalness: 0.06,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2
});

const stickerFrontMesh = new THREE.Mesh(stickerGeo, stickerMat);
stickerFrontMesh.position.set(0, 0.30, 0.224);
cassetteRoot.add(stickerFrontMesh);

const stickerBackMesh = new THREE.Mesh(stickerGeo, stickerMat);
stickerBackMesh.position.set(0, 0.30, -0.224);
stickerBackMesh.rotation.y = Math.PI;
cassetteRoot.add(stickerBackMesh);

// ============================================================================
// 5. UI WIRING & STATE
// ============================================================================
let currentTapeIdx = 0;
let isPlayingAnim = true;
let isRewinding = false;
let isAutoOrbit = true;

let isDragging = false;
let dragMovedDistance = 0;
let prevPointer = { x: 0, y: 0 };
let userRotY = -0.22;
let userRotX = 0.06;
let targetZoomZ = 10.2; // Comfortable, uncrowded gallery framing

const workIndexEl = document.getElementById('work-index');
const workTitleEl = document.getElementById('work-title');
const workDescEl = document.getElementById('work-desc');
const btnOpenWork = document.getElementById('btn-open-work');
const openWorkLabel = document.getElementById('open-work-label');
const tapeSelectorEl = document.getElementById('tape-selector');

const btnRewind = document.getElementById('btn-rewind');
const btnReelPlay = document.getElementById('btn-reel-play');
const reelPlayLabel = document.getElementById('reel-play-label');
const btnOrbit = document.getElementById('btn-orbit');
const btnBackdrop = document.getElementById('btn-backdrop');

TAPES.forEach((tape, idx) => {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'tape-pill' + (idx === 0 ? ' active' : '');
  pill.textContent = tape.pillLabel;
  pill.addEventListener('click', () => selectTape(idx));
  tapeSelectorEl.appendChild(pill);
});

function selectTape(idx) {
  currentTapeIdx = idx;
  const tape = TAPES[idx];

  clearAcrylicMat.color.setHex(tape.shellColor);
  clearAcrylicMat.attenuationColor.setHex(tape.shellAttenuation);
  innerRibAcrylicMat.color.setHex(tape.ribColor);
  hubPlasticMat.color.setHex(tape.hubColor);

  const prevTex = stickerMat.map;
  stickerMat.map = createCassetteStickerTexture(tape);
  stickerMat.needsUpdate = true;
  if (prevTex) prevTex.dispose();

  workIndexEl.textContent = tape.indexMeta;
  workTitleEl.textContent = tape.title;
  workDescEl.textContent = tape.desc;

  document.querySelectorAll('.tape-pill').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });

  if (tape.unlocked) {
    btnOpenWork.disabled = false;
    openWorkLabel.textContent = `Enter ${tape.title}`;
  } else {
    btnOpenWork.disabled = true;
    openWorkLabel.textContent = 'In Production';
  }
}

selectTape(0);

function openSelectedWork() {
  const tape = TAPES[currentTapeIdx];
  if (!tape.unlocked || !tape.url) return;
  targetZoomZ = 7.4;
  setTimeout(() => {
    window.location.href = tape.url;
  }, 260);
}

btnOpenWork.addEventListener('click', openSelectedWork);

btnRewind.addEventListener('click', () => {
  isRewinding = !isRewinding;
  if (isRewinding) isPlayingAnim = true;
  btnRewind.classList.toggle('active', isRewinding);
  btnReelPlay.classList.toggle('active', isPlayingAnim);
  reelPlayLabel.textContent = isRewinding ? 'Rewinding' : (isPlayingAnim ? 'Playing' : 'Paused');
});

btnReelPlay.addEventListener('click', () => {
  isPlayingAnim = !isPlayingAnim;
  if (!isPlayingAnim) isRewinding = false;
  btnRewind.classList.remove('active');
  btnReelPlay.classList.toggle('active', isPlayingAnim);
  reelPlayLabel.textContent = isPlayingAnim ? 'Playing' : 'Paused';
});

btnOrbit.addEventListener('click', () => {
  isAutoOrbit = !isAutoOrbit;
  btnOrbit.classList.toggle('active', isAutoOrbit);
});

btnBackdrop.addEventListener('click', () => {
  const isDark = document.body.classList.toggle('theme-dark');
  btnBackdrop.textContent = isDark ? 'Light room' : 'Dark room';
});

// ============================================================================
// 6. POINTER DRAG-TO-INSPECT, SCROLL-TO-ZOOM & CLICK-CASSETTE-TO-OPEN
// ============================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

container.addEventListener('pointerdown', (e) => {
  isDragging = true;
  dragMovedDistance = 0;
  prevPointer.x = e.clientX;
  prevPointer.y = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

  if (!isDragging) return;
  const dx = e.clientX - prevPointer.x;
  const dy = e.clientY - prevPointer.y;
  dragMovedDistance += Math.hypot(dx, dy);

  userRotY += dx * 0.008;
  userRotX = THREE.MathUtils.clamp(userRotX + dy * 0.006, -0.7, 0.7);

  prevPointer.x = e.clientX;
  prevPointer.y = e.clientY;
});

window.addEventListener('pointerup', (e) => {
  if (!isDragging) return;
  isDragging = false;

  if (dragMovedDistance < 10) {
    pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObjects(cassetteRoot.children, true);
    if (hits.length > 0) {
      openSelectedWork();
    }
  }
});

window.addEventListener('wheel', (e) => {
  targetZoomZ = THREE.MathUtils.clamp(targetZoomZ + e.deltaY * 0.004, 7.2, 14.0);
}, { passive: true });

// ============================================================================
// 7. ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  const aspect = window.innerWidth / window.innerHeight;
  const responsiveZ = aspect < 1.0 ? (1.0 - aspect) * 4.2 : 0;
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZoomZ + responsiveZ, dt * 6);

  if (isPlayingAnim) {
    const reelVel = isRewinding ? 15.0 : -2.4;
    reels.forEach((r, idx) => {
      const radiusFactor = idx === 0 ? 0.85 : 1.15;
      r.rotation.z += reelVel * radiusFactor * dt;
    });
    guideRollers.forEach((gr) => {
      gr.rotation.z += reelVel * 2.4 * dt;
    });
  }

  if (isAutoOrbit && !isDragging) {
    userRotY += dt * 0.36;
  }

  const finalRotY = userRotY + pointerNDC.x * 0.12;
  const finalRotX = userRotX - pointerNDC.y * 0.09;

  cassetteRoot.rotation.y = THREE.MathUtils.lerp(cassetteRoot.rotation.y, finalRotY, dt * 8);
  cassetteRoot.rotation.x = THREE.MathUtils.lerp(cassetteRoot.rotation.x, finalRotX, dt * 8);

  const rewJitter = isRewinding ? Math.sin(elapsed * 65) * 0.009 : 0;
  const floatBob = Math.sin(elapsed * 1.8) * 0.055;
  cassetteRoot.position.y = 0.22 + floatBob + rewJitter;
  cassetteRoot.rotation.z = Math.sin(elapsed * 1.2) * 0.018;

  const profileScale = 0.45 + 0.55 * Math.abs(Math.cos(cassetteRoot.rotation.y));
  floorShadow.scale.x = profileScale * (1 - floatBob * 0.4);
  floorShadow.material.opacity = 0.82 - floatBob * 1.1;

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
