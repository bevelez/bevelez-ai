import * as THREE from 'three';
import {
  createCelMaterial,
  createHiFiMesh,
  createMetallicCelMaterial,
  mergeStaticGroupMeshes,
  createLightPoolTexture,
  createContactShadowDecal
} from './shared.js?v=20261018s';

// ============================================================================
// 4. BOOMBOX SOUND-SYSTEM TRUCK LEVEL 3 (WITH EMBEDDED DJ KRONOS IN BOOTH!)
// ============================================================================
let _marqueeTex = null;
function createMarqueeTexture() {
  if (_marqueeTex) return _marqueeTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#06040c';
  ctx.fillRect(0, 0, 1024, 256);

  ctx.strokeStyle = '#ff3898';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 1004, 236);

  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 976, 208);

  ctx.font = '900 122px "Chakra Petch", Impact, sans-serif';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = '#24e5ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#52f2ff';
  ctx.fillText('KRONOS', 64, 132);

  ctx.shadowColor = '#ff2a85';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ff4da6';
  ctx.fillText('BEATS', 575, 132);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _marqueeTex = tex;
  return tex;
}

let _truckSubBannerTex = null;
function createTruckSubBannerTexture() {
  if (_truckSubBannerTex) return _truckSubBannerTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#18142c';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.strokeStyle = '#382e5c';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 1016, 120);

  ctx.fillStyle = '#e02828';
  ctx.beginPath();
  ctx.arc(58, 64, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(58, 64, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '800 38px "Chakra Petch", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d8f0ff';
  ctx.fillText('BOOMBOX SOUND-SYSTEM TRUCK', 112, 66);

  ctx.fillStyle = '#ff9838';
  ctx.fillText('LEVEL 3', 825, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _truckSubBannerTex = tex;
  return tex;
}


let _brassInteriorTex = null;
function createBrassInteriorTexture() {
  if (_brassInteriorTex) return _brassInteriorTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#381e08');
  grad.addColorStop(0.45, '#9e6818');
  grad.addColorStop(0.80, '#e8b438');
  grad.addColorStop(1.0, '#fff088');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _brassInteriorTex = tex;
  return tex;
}

// ============================================================================
// PROCEDURAL CANVAS TEXTURES & HARDWARE GENERATORS (100% CLIENT-SIDE STATIC)
// ============================================================================

let _brickWarehouseTex = null;
export function createBrickWarehouseTexture() {
  if (_brickWarehouseTex) return _brickWarehouseTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Deep mortar base
  ctx.fillStyle = '#221f28';
  ctx.fillRect(0, 0, 1024, 1024);

  const brickW = 60;
  const brickH = 26;
  const seam = 4;
  const rows = Math.ceil(1024 / (brickH + seam));
  const cols = Math.ceil(1024 / (brickW + seam)) + 2;

  const brickTones = [
    '#963929', '#7e2d1f', '#aa4734', '#8b3222', '#b54e38',
    '#913626', '#6e2418', '#a1412e', '#842f1f', '#ba543d'
  ];

  for (let r = 0; r < rows; r++) {
    const y = r * (brickH + seam);
    const xOffset = (r % 2 === 0) ? 0 : -(brickW + seam) / 2;
    for (let col = -1; col < cols; col++) {
      const x = col * (brickW + seam) + xOffset;
      const toneIdx = Math.floor(Math.sin(r * 12.9898 + col * 78.233) * 43758.5453) % brickTones.length;
      const baseTone = brickTones[Math.abs(toneIdx)];
      ctx.fillStyle = baseTone;
      ctx.fillRect(x, y, brickW, brickH);

      // Subtle soot / wear stippling on brick face
      ctx.fillStyle = 'rgba(20, 16, 26, 0.22)';
      ctx.fillRect(x, y + brickH - 4, brickW, 4);
      ctx.fillStyle = 'rgba(255, 200, 180, 0.14)';
      ctx.fillRect(x, y, brickW, 3);

      // Graphic-novel comic ink cross-hatching in bottom-right shadow corner
      ctx.strokeStyle = 'rgba(12, 8, 18, 0.45)';
      ctx.lineWidth = 1.2;
      for (let h = 0; h < 4; h++) {
        ctx.beginPath();
        ctx.moveTo(x + brickW - 14 + h * 3, y + brickH);
        ctx.lineTo(x + brickW, y + brickH - 14 + h * 3);
        ctx.stroke();
      }
    }
  }

  // Weathering streaks & grime washes
  for (let s = 0; s < 14; s++) {
    const sx = Math.random() * 1024;
    const sw = 20 + Math.random() * 80;
    const grad = ctx.createLinearGradient(sx, 0, sx, 1024);
    grad.addColorStop(0, 'rgba(15, 12, 22, 0.40)');
    grad.addColorStop(0.3 + Math.random() * 0.4, 'rgba(25, 20, 32, 0.18)');
    grad.addColorStop(1, 'rgba(15, 12, 22, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, 0, sw, 1024);
  }

  _brickWarehouseTex = new THREE.CanvasTexture(c);
  _brickWarehouseTex.wrapS = THREE.RepeatWrapping;
  _brickWarehouseTex.wrapT = THREE.RepeatWrapping;
  _brickWarehouseTex.repeat.set(4, 3);
  _brickWarehouseTex.colorSpace = THREE.SRGBColorSpace;
  _brickWarehouseTex.anisotropy = 4;
  return _brickWarehouseTex;
}

let _brickWarehouseBumpTex = null;
export function createBrickWarehouseBumpMap() {
  if (_brickWarehouseBumpTex) return _brickWarehouseBumpTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Deep recessed mortar baseline (#202020)
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, 1024, 1024);

  const brickW = 60;
  const brickH = 26;
  const seam = 4;
  const rows = Math.ceil(1024 / (brickH + seam));
  const cols = Math.ceil(1024 / (brickW + seam)) + 2;

  for (let r = 0; r < rows; r++) {
    const y = r * (brickH + seam);
    const xOffset = (r % 2 === 0) ? 0 : -(brickW + seam) / 2;
    for (let col = -1; col < cols; col++) {
      const x = col * (brickW + seam) + xOffset;
      const bH = 190 + Math.floor(Math.sin(r * 31.4 + col * 17.8) * 30);
      ctx.fillStyle = `rgb(${bH}, ${bH}, ${bH})`;
      ctx.fillRect(x + 1, y + 1, brickW - 2, brickH - 2);

      // Top bevel highlight (raised)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 1, y + 1, brickW - 2, 2);

      // Bottom bevel shadow (depressed)
      ctx.fillStyle = '#454545';
      ctx.fillRect(x + 1, y + brickH - 3, brickW - 2, 2);

      // Comic hatch groove incisions
      ctx.strokeStyle = '#383838';
      ctx.lineWidth = 1.5;
      for (let h = 0; h < 3; h++) {
        ctx.beginPath();
        ctx.moveTo(x + brickW - 12 + h * 3, y + brickH - 1);
        ctx.lineTo(x + brickW - 1, y + brickH - 12 + h * 3);
        ctx.stroke();
      }
    }
  }

  _brickWarehouseBumpTex = new THREE.CanvasTexture(c);
  _brickWarehouseBumpTex.wrapS = THREE.RepeatWrapping;
  _brickWarehouseBumpTex.wrapT = THREE.RepeatWrapping;
  _brickWarehouseBumpTex.repeat.set(4, 3);
  _brickWarehouseBumpTex.anisotropy = 4;
  return _brickWarehouseBumpTex;
}

let _loftWindowTex = null;
export function createIndustrialLoftWindowTexture() {
  if (_loftWindowTex) return _loftWindowTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Outer dark iron frame
  ctx.fillStyle = '#141620';
  ctx.fillRect(0, 0, 1024, 1024);

  // Intense warm golden incandescent interior glow
  const grad = ctx.createRadialGradient(512, 440, 60, 512, 512, 560);
  grad.addColorStop(0.0, '#fff4b8');
  grad.addColorStop(0.35, '#ffbe42');
  grad.addColorStop(0.75, '#ea7818');
  grad.addColorStop(1.0, '#8c3508');

  // 4 columns x 5 rows of industrial glass panes
  const cols = 4;
  const rows = 5;
  const margin = 28;
  const mullion = 18;
  const paneW = (1024 - margin * 2 - (cols - 1) * mullion) / cols;
  const paneH = (1024 - margin * 2 - (rows - 1) * mullion) / rows;

  for (let r = 0; r < rows; r++) {
    for (let cl = 0; cl < cols; cl++) {
      const px = margin + cl * (paneW + mullion);
      const py = margin + r * (paneH + mullion);
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, paneW, paneH);

      // Dirty glass corner grime & soot washes
      ctx.fillStyle = 'rgba(25, 18, 12, 0.45)';
      ctx.fillRect(px, py + paneH - 16, paneW, 16);
      ctx.fillRect(px, py, 14, paneH);

      // Glass specular reflection highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
      ctx.fillRect(px + 6, py + 6, paneW - 12, 10);
      ctx.fillRect(px + 6, py + 6, 10, paneH - 12);

      // Diagonal comic reflection glint
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px + 12, py + paneH - 12);
      ctx.lineTo(px + paneW - 12, py + 12);
      ctx.stroke();

      // Inked perimeter around pane
      ctx.strokeStyle = '#0e1018';
      ctx.lineWidth = 4;
      ctx.strokeRect(px + 2, py + 2, paneW - 4, paneH - 4);
    }
  }

  _loftWindowTex = new THREE.CanvasTexture(c);
  _loftWindowTex.colorSpace = THREE.SRGBColorSpace;
  _loftWindowTex.anisotropy = 4;
  return _loftWindowTex;
}

let _loftWindowBumpTex = null;
export function createIndustrialLoftWindowBumpMap() {
  if (_loftWindowBumpTex) return _loftWindowBumpTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Prominently raised iron frame baseline (#e8e8e8)
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, 1024, 1024);

  const cols = 4;
  const rows = 5;
  const margin = 28;
  const mullion = 18;
  const paneW = (1024 - margin * 2 - (cols - 1) * mullion) / cols;
  const paneH = (1024 - margin * 2 - (rows - 1) * mullion) / rows;

  for (let r = 0; r < rows; r++) {
    for (let cl = 0; cl < cols; cl++) {
      const px = margin + cl * (paneW + mullion);
      const py = margin + r * (paneH + mullion);
      // Recessed glass pane
      ctx.fillStyle = '#222222';
      ctx.fillRect(px, py, paneW, paneH);

      // Glass bevel near frame
      ctx.fillStyle = '#383838';
      ctx.fillRect(px + 4, py + 4, paneW - 8, paneH - 8);
    }
  }

  _loftWindowBumpTex = new THREE.CanvasTexture(c);
  _loftWindowBumpTex.anisotropy = 4;
  return _loftWindowBumpTex;
}

let _corrugatedShutterTex = null;
export function createCorrugatedShutterTexture() {
  if (_corrugatedShutterTex) return _corrugatedShutterTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#3a4150';
  ctx.fillRect(0, 0, 1024, 1024);

  const slatH = 24;
  const numSlats = Math.ceil(1024 / slatH);

  for (let s = 0; s < numSlats; s++) {
    const y = s * slatH;
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0.0, '#141720'); // deep inter-slat seam
    grad.addColorStop(0.18, '#2d3444');
    grad.addColorStop(0.48, '#76829c'); // metallic highlight ridge
    grad.addColorStop(0.78, '#444d60');
    grad.addColorStop(1.0, '#1e222c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 1024, slatH);

    // Weathering rust / dirt wash
    if (s % 4 === 0) {
      ctx.fillStyle = 'rgba(130, 65, 30, 0.15)';
      ctx.fillRect(0, y + 2, 1024, slatH - 4);
    }
  }

  _corrugatedShutterTex = new THREE.CanvasTexture(c);
  _corrugatedShutterTex.colorSpace = THREE.SRGBColorSpace;
  _corrugatedShutterTex.anisotropy = 4;
  return _corrugatedShutterTex;
}

let _corrugatedShutterBumpTex = null;
export function createCorrugatedShutterBumpMap() {
  if (_corrugatedShutterBumpTex) return _corrugatedShutterBumpTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  const slatH = 24;
  const numSlats = Math.ceil(1024 / slatH);

  for (let s = 0; s < numSlats; s++) {
    const y = s * slatH;
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0.0, '#1c1c1c'); // recessed groove seam
    grad.addColorStop(0.50, '#e8e8e8'); // raised convex peak
    grad.addColorStop(1.0, '#1c1c1c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 1024, slatH);
  }

  _corrugatedShutterBumpTex = new THREE.CanvasTexture(c);
  _corrugatedShutterBumpTex.anisotropy = 4;
  return _corrugatedShutterBumpTex;
}

let _streetArtMuralTex = null;
export function createStreetArtMuralTexture() {
  if (_streetArtMuralTex) return _streetArtMuralTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, 1024, 512);

  ctx.save();
  ctx.translate(480, 240);
  ctx.rotate(-0.06);

  // Background aerosol spray cloud
  const cloudGrad = ctx.createRadialGradient(0, 0, 50, 0, 0, 380);
  cloudGrad.addColorStop(0.0, 'rgba(0, 240, 255, 0.45)');
  cloudGrad.addColorStop(0.4, 'rgba(255, 42, 133, 0.35)');
  cloudGrad.addColorStop(0.8, 'rgba(255, 220, 0, 0.20)');
  cloudGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = cloudGrad;
  ctx.fillRect(-450, -220, 900, 440);

  // 1. Deep 3D drop-shadow
  ctx.font = '900 130px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0a0814';
  for (let d = 16; d >= 6; d--) {
    ctx.fillText('REVENGE', d, d + 12);
  }

  // 2. Midnight purple bold outline
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#181035';
  ctx.strokeText('REVENGE', 0, 0);

  // 3. Vibrant wildstyle spray gradient
  const sprayGrad = ctx.createLinearGradient(-350, -70, 350, 70);
  sprayGrad.addColorStop(0.0, '#00f0ff');  // electric cyan
  sprayGrad.addColorStop(0.25, '#2ef064'); // neon lime
  sprayGrad.addColorStop(0.50, '#ffea00'); // vivid yellow
  sprayGrad.addColorStop(0.75, '#ff6b00'); // intense orange
  sprayGrad.addColorStop(1.0, '#ff2a85');  // hot magenta
  ctx.fillStyle = sprayGrad;
  ctx.fillText('REVENGE', 0, 0);

  // 4. White spray top ridges & shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '900 124px Impact, sans-serif';
  ctx.fillText('REVENGE', -3, -4);

  // 5. Spray drips & paint splatters
  ctx.fillStyle = '#00f0ff';
  const dripXs = [-280, -180, -40, 110, 220, 310];
  dripXs.forEach((dx) => {
    ctx.beginPath();
    ctx.arc(dx, 45, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(dx - 3, 45, 6, 25 + (Math.abs(dx * 13) % 40));
    ctx.beginPath();
    ctx.arc(dx, 70 + (Math.abs(dx * 13) % 40), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Urban tag secondary texts: "KRONOS" & "BEAT" & stars
  ctx.font = '900 46px cursive, sans-serif';
  ctx.fillStyle = '#ffea00';
  ctx.fillText('★ KRONOS ★', 120, -95);
  ctx.fillStyle = '#00f0ff';
  ctx.fillText('CYPHER', -220, 110);

  ctx.restore();

  _streetArtMuralTex = new THREE.CanvasTexture(c);
  _streetArtMuralTex.colorSpace = THREE.SRGBColorSpace;
  return _streetArtMuralTex;
}

let _honeycombGrilleTex = null;
export function createHoneycombGrilleTexture() {
  if (_honeycombGrilleTex) return _honeycombGrilleTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Dark speaker cavity behind grille
  ctx.fillStyle = '#0a0812';
  ctx.fillRect(0, 0, 1024, 1024);

  const hexR = 14;
  const dx = hexR * Math.sqrt(3);
  const dy = hexR * 1.5;
  const cols = Math.ceil(1024 / dx) + 1;
  const rows = Math.ceil(1024 / dy) + 1;

  for (let r = 0; r < rows; r++) {
    const y = r * dy;
    const xOff = (r % 2 === 0) ? 0 : dx / 2;
    for (let cl = 0; cl < cols; cl++) {
      const x = cl * dx + xOff;

      // Outer hexagonal perforated metal cell
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = x + (hexR + 2) * Math.cos(a);
        const py = y + (hexR + 2) * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#323644';
      ctx.fill();

      // Top-edge comic highlight rim
      ctx.strokeStyle = '#6e7a96';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner perforated hole (void)
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = x + (hexR - 2.5) * Math.cos(a);
        const py = y + (hexR - 2.5) * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#08060c';
      ctx.fill();
    }
  }

  _honeycombGrilleTex = new THREE.CanvasTexture(c);
  _honeycombGrilleTex.wrapS = THREE.RepeatWrapping;
  _honeycombGrilleTex.wrapT = THREE.RepeatWrapping;
  _honeycombGrilleTex.repeat.set(2, 2);
  _honeycombGrilleTex.colorSpace = THREE.SRGBColorSpace;
  _honeycombGrilleTex.anisotropy = 4;
  return _honeycombGrilleTex;
}

let _honeycombGrilleBumpTex = null;
export function createHoneycombGrilleBumpMap() {
  if (_honeycombGrilleBumpTex) return _honeycombGrilleBumpTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Deep recessed void behind holes
  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, 1024, 1024);

  const hexR = 14;
  const dx = hexR * Math.sqrt(3);
  const dy = hexR * 1.5;
  const cols = Math.ceil(1024 / dx) + 1;
  const rows = Math.ceil(1024 / dy) + 1;

  for (let r = 0; r < rows; r++) {
    const y = r * dy;
    const xOff = (r % 2 === 0) ? 0 : dx / 2;
    for (let cl = 0; cl < cols; cl++) {
      const x = cl * dx + xOff;

      // Raised hexagonal perforated metal web plate
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = x + (hexR + 2) * Math.cos(a);
        const py = y + (hexR + 2) * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#e8e8e8';
      ctx.fill();

      // Deep punched center hole
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 6;
        const px = x + (hexR - 2.5) * Math.cos(a);
        const py = y + (hexR - 2.5) * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#050505';
      ctx.fill();
    }
  }

  _honeycombGrilleBumpTex = new THREE.CanvasTexture(c);
  _honeycombGrilleBumpTex.wrapS = THREE.RepeatWrapping;
  _honeycombGrilleBumpTex.wrapT = THREE.RepeatWrapping;
  _honeycombGrilleBumpTex.repeat.set(2, 2);
  _honeycombGrilleBumpTex.anisotropy = 4;
  return _honeycombGrilleBumpTex;
}

let _ampGrilleTex = null;
export function createAmpGrilleTexture() {
  if (_ampGrilleTex) return _ampGrilleTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#181716';
  ctx.fillRect(0, 0, 1024, 1024);

  // Woven wheat / black basketweave (upgraded to 1024px)
  const cell = 16;
  for (let y = 0; y < 1024; y += cell) {
    for (let x = 0; x < 1024; x += cell) {
      const isEven = ((x / cell) + (y / cell)) % 2 === 0;
      if (isEven) {
        ctx.fillStyle = '#3e372a';
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = '#b89d6e'; // golden wheat highlight thread
        ctx.fillRect(x + 3, y + 3, cell - 6, 3);
      } else {
        ctx.fillStyle = '#1c1b18';
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = '#5c4e36';
        ctx.fillRect(x + 3, y + 3, 3, cell - 6);
      }
    }
  }

  _ampGrilleTex = new THREE.CanvasTexture(c);
  _ampGrilleTex.wrapS = THREE.RepeatWrapping;
  _ampGrilleTex.wrapT = THREE.RepeatWrapping;
  _ampGrilleTex.repeat.set(2, 2);
  _ampGrilleTex.colorSpace = THREE.SRGBColorSpace;
  _ampGrilleTex.anisotropy = 4;
  return _ampGrilleTex;
}

let _jerseyBarrierTex = null;
export function createJerseyBarrierTexture() {
  if (_jerseyBarrierTex) return _jerseyBarrierTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Weathered concrete base
  ctx.fillStyle = '#828792';
  ctx.fillRect(0, 0, 1024, 512);

  // Concrete aggregate noise (1,200 specks)
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(50, 55, 65, 0.30)' : 'rgba(215, 220, 230, 0.30)';
    ctx.fillRect(Math.random() * 1024, Math.random() * 512, 3 + Math.random() * 8, 2 + Math.random() * 6);
  }

  // Chipped concrete gouges & hairline fracture cracks
  ctx.strokeStyle = '#32343c';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 45;
      y += (Math.random() - 0.5) * 35;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Diagonal reflective orange and white hazard stripes
  const stripeW = 96;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 80, 1024, 280); // stripe band along mid-section
  ctx.clip();

  for (let x = -400; x < 1400; x += stripeW * 2) {
    ctx.fillStyle = '#ff6d00'; // vibrant safety orange
    ctx.beginPath();
    ctx.moveTo(x, 512);
    ctx.lineTo(x + stripeW, 512);
    ctx.lineTo(x + stripeW + 320, 0);
    ctx.lineTo(x + 320, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f0f2f5'; // reflective white
    ctx.beginPath();
    ctx.moveTo(x + stripeW, 512);
    ctx.lineTo(x + stripeW * 2, 512);
    ctx.lineTo(x + stripeW * 2 + 320, 0);
    ctx.lineTo(x + stripeW + 320, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Dark asphalt grime at bottom edge
  const grimeGrad = ctx.createLinearGradient(0, 400, 0, 512);
  grimeGrad.addColorStop(0, 'rgba(25, 30, 40, 0.0)');
  grimeGrad.addColorStop(1, 'rgba(20, 24, 32, 0.70)');
  ctx.fillStyle = grimeGrad;
  ctx.fillRect(0, 400, 1024, 112);

  _jerseyBarrierTex = new THREE.CanvasTexture(c);
  _jerseyBarrierTex.colorSpace = THREE.SRGBColorSpace;
  _jerseyBarrierTex.anisotropy = 4;
  return _jerseyBarrierTex;
}

let _jerseyBarrierBumpTex = null;
export function createJerseyBarrierBumpMap() {
  if (_jerseyBarrierBumpTex) return _jerseyBarrierBumpTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Baseline concrete height (#808080)
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 1024, 512);

  // Concrete aggregate tooth
  for (let i = 0; i < 1500; i++) {
    const val = 110 + Math.floor(Math.random() * 45);
    ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 512, 3, 3);
  }

  // Chipped corner fractures (deep gouges)
  ctx.strokeStyle = '#282828';
  ctx.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 45;
      y += (Math.random() - 0.5) * 35;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Raised reflective vinyl warning stripe band
  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(0, 80, 1024, 280);

  _jerseyBarrierBumpTex = new THREE.CanvasTexture(c);
  _jerseyBarrierBumpTex.anisotropy = 4;
  return _jerseyBarrierBumpTex;
}

// ----------------------------------------------------------------------------
// NEW PROCEDURAL TEXTURES & PROPS FOR MILESTONE 3
// (APARTMENTS, AMBULANCE, STAGE, ROOF, CHAIN-LINK FENCE, PALLETS & CRATES)
// ----------------------------------------------------------------------------

let _aptBrickTex = null;
export function createApartmentBrickTexture() {
  if (_aptBrickTex) return _aptBrickTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Dark weathered mortar base
  ctx.fillStyle = '#2b2730';
  ctx.fillRect(0, 0, 1024, 1024);

  const brickW = 56;
  const brickH = 24;
  const seam = 4;
  const rows = Math.ceil(1024 / (brickH + seam));
  const cols = Math.ceil(1024 / (brickW + seam)) + 2;

  // Rich urban brownstone / burnt terracotta brick palette
  const brickTones = [
    '#6e2c22', '#5c221a', '#7d3326', '#4f1d16', '#753024',
    '#65271e', '#541f17', '#83392a', '#5f241c', '#722e23'
  ];

  for (let r = 0; r < rows; r++) {
    const y = r * (brickH + seam);
    const xOffset = (r % 2 === 0) ? 0 : -(brickW + seam) / 2;
    for (let col = -1; col < cols; col++) {
      const x = col * (brickW + seam) + xOffset;
      const toneIdx = Math.abs(Math.floor(Math.sin(r * 17.13 + col * 43.17) * 43758.5453)) % brickTones.length;
      ctx.fillStyle = brickTones[toneIdx];
      ctx.fillRect(x, y, brickW, brickH);

      // Bottom shadow bevel on each brick
      ctx.fillStyle = 'rgba(15, 10, 20, 0.28)';
      ctx.fillRect(x, y + brickH - 3, brickW, 3);
      // Top highlight
      ctx.fillStyle = 'rgba(255, 210, 190, 0.10)';
      ctx.fillRect(x, y, brickW, 2);
    }
  }

  // Vertical water / soot grime stains
  for (let s = 0; s < 14; s++) {
    const sx = (s * 73) % 1024;
    const sw = 18 + (s * 31) % 45;
    const grad = ctx.createLinearGradient(sx, 0, sx, 1024);
    grad.addColorStop(0, 'rgba(10, 8, 16, 0.45)');
    grad.addColorStop(0.4, 'rgba(18, 14, 24, 0.20)');
    grad.addColorStop(1, 'rgba(10, 8, 16, 0.02)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, 0, sw, 1024);
  }

  _aptBrickTex = new THREE.CanvasTexture(c);
  _aptBrickTex.wrapS = THREE.RepeatWrapping;
  _aptBrickTex.wrapT = THREE.RepeatWrapping;
  _aptBrickTex.repeat.set(2.5, 4.0);
  _aptBrickTex.colorSpace = THREE.SRGBColorSpace;
  return _aptBrickTex;
}

let _ambulanceSideTex = null;
export function createAmbulanceSideTexture() {
  if (_ambulanceSideTex) return _ambulanceSideTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Hospital White / Cool Slate Base
  ctx.fillStyle = '#e4e8f0';
  ctx.fillRect(0, 0, 1024, 512);

  // Lower Dark Charcoal Chassis Skirt
  ctx.fillStyle = '#222630';
  ctx.fillRect(0, 420, 1024, 92);

  // Fluorescent Safety Orange Chevron Stripe along Beltline
  ctx.fillStyle = '#ff6200';
  ctx.fillRect(0, 220, 1024, 75);

  // Cyan reflective accent pinstripes
  ctx.fillStyle = '#00f0ff';
  ctx.fillRect(0, 208, 1024, 8);
  ctx.fillRect(0, 298, 1024, 8);

  // Bold Typography: "AMBULANCE"
  ctx.font = '900 68px Impact, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('AMBULANCE', 520, 282);

  // Secondary Markings
  ctx.font = '900 24px monospace, sans-serif';
  ctx.fillStyle = '#181c26';
  ctx.fillText('EMERGENCY SOUND UNIT  •  UNIT 09', 520, 180);

  // Medical Cross / Audio Waveform Emblem
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(80, 80, 110, 110);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 80, 110, 110);

  ctx.fillStyle = '#ff2a85';
  ctx.fillRect(123, 95, 24, 80);
  ctx.fillRect(95, 123, 80, 24);

  // Door Shut Lines / Panel Seams
  ctx.strokeStyle = '#12141a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(340, 60); ctx.lineTo(340, 420);
  ctx.moveTo(880, 60); ctx.lineTo(880, 420);
  ctx.stroke();

  // Door Handle
  ctx.fillStyle = '#12141a';
  ctx.fillRect(360, 240, 36, 12);
  ctx.fillStyle = '#d0d8e8';
  ctx.fillRect(362, 242, 32, 8);

  // Side cab window
  ctx.fillStyle = '#182436';
  ctx.fillRect(180, 75, 140, 95);
  ctx.strokeStyle = '#101218';
  ctx.lineWidth = 5;
  ctx.strokeRect(180, 75, 140, 95);

  _ambulanceSideTex = new THREE.CanvasTexture(c);
  _ambulanceSideTex.colorSpace = THREE.SRGBColorSpace;
  return _ambulanceSideTex;
}

let _vanGrilleTex = null;
export function createVanGrilleTexture() {
  if (_vanGrilleTex) return _vanGrilleTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#0e1014';
  ctx.fillRect(0, 0, 512, 256);

  const numSlats = 8;
  const slatH = 20;
  for (let i = 0; i < numSlats; i++) {
    const y = 30 + i * 25;
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0, '#788296');
    grad.addColorStop(0.5, '#f0f4fc');
    grad.addColorStop(1, '#424856');
    ctx.fillStyle = grad;
    ctx.fillRect(30, y, 452, slatH);
  }

  ctx.strokeStyle = '#c8d4e6';
  ctx.lineWidth = 12;
  ctx.strokeRect(15, 15, 482, 226);

  ctx.fillStyle = '#f5c211';
  ctx.beginPath();
  ctx.arc(256, 128, 28, 0, Math.PI * 2);
  ctx.fill();

  _vanGrilleTex = new THREE.CanvasTexture(c);
  _vanGrilleTex.colorSpace = THREE.SRGBColorSpace;
  return _vanGrilleTex;
}

let _stageChassisTex = null;
export function createStageChassisTexture() {
  if (_stageChassisTex) return _stageChassisTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1c182c';
  ctx.fillRect(0, 0, 1024, 512);

  // Stamped Vertical Structural Panel Seams
  ctx.strokeStyle = '#0e0c18';
  ctx.lineWidth = 6;
  for (let px = 256; px < 1024; px += 256) {
    ctx.beginPath();
    ctx.moveTo(px, 15);
    ctx.lineTo(px, 395);
    ctx.stroke();
  }

  // Horizontal ribbed trailer skirt
  const slatH = 48;
  for (let y = 20; y < 390; y += slatH) {
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0, '#0e0c18');
    grad.addColorStop(0.2, '#28233e');
    grad.addColorStop(0.5, '#483f6c');
    grad.addColorStop(0.8, '#26213a');
    grad.addColorStop(1, '#0c0a16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 1024, slatH - 5);

    // Stamped bolt heads / rivets
    for (let rx = 32; rx < 1024; rx += 64) {
      ctx.fillStyle = '#0a0812';
      ctx.beginPath();
      ctx.arc(rx, y + slatH / 2 + 1, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f5c211';
      ctx.beginPath();
      ctx.arc(rx, y + slatH / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rx - 1, y + slatH / 2 - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Diagonal safety hazard chevrons along bottom edge
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 400, 1024, 112);
  ctx.clip();
  const chevW = 64;
  for (let x = -200; x < 1400; x += chevW * 2) {
    ctx.fillStyle = '#f5c211';
    ctx.beginPath();
    ctx.moveTo(x, 512);
    ctx.lineTo(x + chevW, 512);
    ctx.lineTo(x + chevW + 80, 400);
    ctx.lineTo(x + 80, 400);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#121218';
    ctx.beginPath();
    ctx.moveTo(x + chevW, 512);
    ctx.lineTo(x + chevW * 2, 512);
    ctx.lineTo(x + chevW * 2 + 80, 400);
    ctx.lineTo(x + chevW + 80, 400);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Amber Running Marker Lamps
  for (let mx = 80; mx < 1024; mx += 180) {
    ctx.fillStyle = '#ff9900';
    ctx.beginPath();
    ctx.arc(mx, 395, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx - 2, 393, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  _stageChassisTex = new THREE.CanvasTexture(c);
  _stageChassisTex.colorSpace = THREE.SRGBColorSpace;
  _stageChassisTex.anisotropy = 4;
  return _stageChassisTex;
}

let _stageChassisBumpTex = null;
export function createStageChassisBumpMap() {
  if (_stageChassisBumpTex) return _stageChassisBumpTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Neutral chassis plate baseline
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, 0, 1024, 512);

  // Recessed Stamped Vertical Seams
  ctx.fillStyle = '#181818';
  for (let px = 256; px < 1024; px += 256) {
    ctx.fillRect(px - 3, 15, 6, 380);
  }

  // Ribbed Skirt Slats
  const slatH = 48;
  for (let y = 20; y < 390; y += slatH) {
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0, '#1c1c1c'); // recessed groove
    grad.addColorStop(0.5, '#c8c8c8'); // raised ridge apex
    grad.addColorStop(1, '#1c1c1c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 1024, slatH - 5);

    // Raised Bolt Head Stud Relief (#ffffff)
    for (let rx = 32; rx < 1024; rx += 64) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rx, y + slatH / 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Raised Hazard Chevron Band
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 400, 1024, 112);

  _stageChassisBumpTex = new THREE.CanvasTexture(c);
  _stageChassisBumpTex.anisotropy = 4;
  return _stageChassisBumpTex;
}

let _roofGravelTex = null;
export function createRoofGravelTexture() {
  if (_roofGravelTex) return _roofGravelTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#2c2f38';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 800; i++) {
    const tones = ['rgba(70, 75, 88, 0.5)', 'rgba(35, 38, 46, 0.6)', 'rgba(120, 125, 140, 0.35)', 'rgba(18, 20, 24, 0.7)'];
    ctx.fillStyle = tones[i % tones.length];
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 5, 3 + Math.random() * 5);
  }

  ctx.strokeStyle = '#181a20';
  ctx.lineWidth = 6;
  for (let x = 120; x < 512; x += 130) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, 512);
    ctx.stroke();
  }

  for (let p = 0; p < 6; p++) {
    const px = Math.random() * 512;
    const py = Math.random() * 512;
    const pr = 25 + Math.random() * 40;
    const pGrad = ctx.createRadialGradient(px, py, 5, px, py, pr);
    pGrad.addColorStop(0, 'rgba(15, 18, 24, 0.45)');
    pGrad.addColorStop(1, 'rgba(15, 18, 24, 0.0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  _roofGravelTex = new THREE.CanvasTexture(c);
  _roofGravelTex.wrapS = THREE.RepeatWrapping;
  _roofGravelTex.wrapT = THREE.RepeatWrapping;
  _roofGravelTex.repeat.set(3, 2);
  _roofGravelTex.colorSpace = THREE.SRGBColorSpace;
  return _roofGravelTex;
}

let _chainLinkTex = null;
export function createChainLinkTexture() {
  if (_chainLinkTex) return _chainLinkTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  ctx.strokeStyle = '#8a98a8';
  ctx.lineWidth = 2.4;
  const step = 16;
  for (let i = -256; i < 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }

  _chainLinkTex = new THREE.CanvasTexture(c);
  _chainLinkTex.wrapS = THREE.RepeatWrapping;
  _chainLinkTex.wrapT = THREE.RepeatWrapping;
  _chainLinkTex.colorSpace = THREE.SRGBColorSpace;
  return _chainLinkTex;
}

export function createChainLinkFenceSection(width = 3.2, height = 2.4) {
  const fenceGroup = new THREE.Group();
  const wireTex = createChainLinkTexture();
  const wireTexClone = wireTex.clone();
  wireTexClone.repeat.set(width * 2, height * 2);

  // Galvanized steel posts at left and right
  const postGeo = new THREE.CylinderGeometry(0.045, 0.045, height, 8);
  [-width / 2, width / 2].forEach(px => {
    const post = createHiFiMesh(postGeo, 0x6e7888, 0.02);
    post.position.set(px, height / 2, 0);
    fenceGroup.add(post);
  });

  // Top tension rail pipe
  const topRailGeo = new THREE.CylinderGeometry(0.035, 0.035, width, 8);
  topRailGeo.rotateZ(Math.PI / 2);
  const topRail = createHiFiMesh(topRailGeo, 0x6e7888, 0.02);
  topRail.position.set(0, height, 0);
  fenceGroup.add(topRail);

  // Bottom tension rail pipe
  const botRailGeo = new THREE.CylinderGeometry(0.025, 0.025, width, 8);
  botRailGeo.rotateZ(Math.PI / 2);
  const botRail = createHiFiMesh(botRailGeo, 0x6e7888, 0.02);
  botRail.position.set(0, 0.12, 0);
  fenceGroup.add(botRail);

  // Diamond chain-link wire mesh
  const meshMat = new THREE.MeshBasicMaterial({
    map: wireTexClone,
    transparent: true,
    alphaTest: 0.25,
    side: THREE.DoubleSide
  });
  const meshPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, height - 0.20), meshMat);
  meshPlane.position.set(0, height / 2 + 0.05, 0);
  fenceGroup.add(meshPlane);

  // Coiled concertina razor wire along top rail
  const numCoils = Math.floor(width / 0.35);
  const coilGeo = new THREE.TorusGeometry(0.22, 0.016, 6, 16);
  for (let c = 0; c <= numCoils; c++) {
    const coil = createHiFiMesh(coilGeo, 0x9aa4b4, 0.02);
    coil.position.set(-width / 2 + c * 0.35 + 0.17, height + 0.20, 0);
    coil.rotation.y = 0.25 * (c % 2 === 0 ? 1 : -1);
    fenceGroup.add(coil);
  }

  return fenceGroup;
}

export function createWoodenPallet(w = 1.2, h = 0.14, d = 1.0) {
  const palletGroup = new THREE.Group();
  const woodCol = 0x785e42;
  // Top deck slats
  for (let s = -d / 2 + 0.06; s <= d / 2 - 0.06; s += 0.16) {
    const slat = createHiFiMesh(new THREE.BoxGeometry(w, 0.022, 0.10), woodCol, 0.015);
    slat.position.set(0, h - 0.011, s);
    palletGroup.add(slat);
  }
  // 3 Stringer runner blocks
  [-w / 2 + 0.06, 0, w / 2 - 0.06].forEach(px => {
    const runner = createHiFiMesh(new THREE.BoxGeometry(0.08, h - 0.044, d), 0x5a4632, 0.015);
    runner.position.set(px, h / 2, 0);
    palletGroup.add(runner);
  });
  // Bottom deck slats
  [-d / 2 + 0.1, 0, d / 2 - 0.1].forEach(pz => {
    const botSlat = createHiFiMesh(new THREE.BoxGeometry(w, 0.022, 0.12), woodCol, 0.015);
    botSlat.position.set(0, 0.011, pz);
    palletGroup.add(botSlat);
  });
  return palletGroup;
}

export function createWoodenCrate(size = 0.85) {
  const crateGroup = new THREE.Group();
  const box = createHiFiMesh(new THREE.BoxGeometry(size, size, size), 0x826648, 0.02);
  box.position.y = size / 2;
  crateGroup.add(box);
  // Cross battens
  const battenGeo = new THREE.BoxGeometry(size * 0.96, 0.035, size * 0.96);
  const batten = createHiFiMesh(battenGeo, 0x624c34, 0.015);
  batten.position.y = size / 2;
  crateGroup.add(batten);
  return crateGroup;
}

let _courtAsphaltTex = null;
export function createHighDetailCourtAsphaltTexture() {
  if (_courtAsphaltTex) return _courtAsphaltTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext('2d');

  // 1. Base Dark Slate Asphalt (#1e212b to #222530)
  ctx.fillStyle = '#20232e';
  ctx.fillRect(0, 0, 2048, 2048);

  // 2. High-Frequency Fine Mineral Aggregate Speckling (8,000 tactile specks)
  const speckleTones = [
    'rgba(12, 14, 20, 0.55)',
    'rgba(40, 46, 60, 0.45)',
    'rgba(70, 80, 105, 0.28)',
    'rgba(130, 145, 175, 0.20)',
    'rgba(200, 210, 230, 0.12)'
  ];
  for (let i = 0; i < 8000; i++) {
    ctx.fillStyle = speckleTones[i % speckleTones.length];
    const sz = 1.5 + Math.random() * 3.5;
    ctx.fillRect(
      Math.random() * 2048,
      Math.random() * 2048,
      sz,
      sz
    );
  }

  // 3. Oil / Water Puddle Sheen & Damp Pavement Patches
  const puddleCoords = [
    { x: 820, y: 1200, rx: 180, ry: 90, rot: -0.2 },
    { x: 1280, y: 780, rx: 140, ry: 75, rot: 0.3 },
    { x: 950, y: 880, rx: 90, ry: 50, rot: 0.1 },
    { x: 620, y: 1420, rx: 160, ry: 80, rot: -0.4 }
  ];
  puddleCoords.forEach(({ x, y, rx, ry, rot }) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const pGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, rx);
    pGrad.addColorStop(0.0, 'rgba(10, 12, 16, 0.65)'); // dark damp asphalt core
    pGrad.addColorStop(0.6, 'rgba(16, 20, 28, 0.35)');
    pGrad.addColorStop(0.85, 'rgba(40, 70, 90, 0.18)'); // subtle petrol rainbow sheen
    pGrad.addColorStop(1.0, 'rgba(10, 12, 16, 0.0)');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // 4. Broad Asphalt Rubber Tire Skids
  ctx.strokeStyle = 'rgba(10, 12, 18, 0.60)';
  ctx.lineWidth = 46;
  ctx.beginPath();
  ctx.arc(1024, 1024, 420, 0.35, 2.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1024, 1024, 310, 3.1, 5.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1024, 1024, 620, 1.2, 2.8);
  ctx.stroke();

  // 5. Streetball Court Lines & Cypher Ring
  const courtYellow = '#f5c211';
  const courtWhite = '#f4f5f8';

  // A. Yellow Basketball Key Rectangle (centered towards stage)
  ctx.strokeStyle = courtYellow;
  ctx.lineWidth = 14;
  ctx.strokeRect(724, 560, 600, 520);

  // Free-throw line & circle arc
  ctx.beginPath();
  ctx.arc(1024, 1080, 200, 0, Math.PI);
  ctx.stroke();

  // Dashed upper semi-circle of free-throw circle
  ctx.setLineDash([24, 18]);
  ctx.beginPath();
  ctx.arc(1024, 1080, 200, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3-Point Perimeter Arc
  ctx.beginPath();
  ctx.arc(1024, 480, 680, 0.45, Math.PI - 0.45);
  ctx.stroke();

  // B. Circular White Battle Cypher Ring (r = 4.8m in world space, ~460px canvas radius)
  ctx.strokeStyle = courtWhite;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(1024, 1024, 460, 0, Math.PI * 2);
  ctx.stroke();

  // Eroded Stencil Paint Porous Bite: Stipple asphalt pores through cypher paint markings
  ctx.fillStyle = '#20232e';
  for (let a = 0; a < Math.PI * 2; a += 0.015) {
    if (Math.sin(a * 42) > 0.3) {
      const rOffset = (Math.random() - 0.5) * 16;
      const px = 1024 + (460 + rOffset) * Math.cos(a);
      const py = 1024 + (460 + rOffset) * Math.sin(a);
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
  }

  // Outer yellow boundary square
  ctx.strokeStyle = 'rgba(245, 194, 20, 0.70)';
  ctx.lineWidth = 12;
  ctx.strokeRect(380, 380, 1288, 1288);

  // 6. Authentic Street Graffiti Decals ("DJ KRONOS", "BEATDOWN", "RHYTHM!")
  // Decal 1: "DJ KRONOS"
  ctx.save();
  ctx.translate(680, 940);
  ctx.rotate(-0.16);
  ctx.font = '900 85px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#06050b';
  ctx.fillText('DJ KRONOS', 8, 8);
  const gradKronos = ctx.createLinearGradient(-180, -50, 180, 50);
  gradKronos.addColorStop(0.0, '#00f5ff');
  gradKronos.addColorStop(0.55, '#ff2a8d');
  gradKronos.addColorStop(1.0, '#ffe600');
  ctx.fillStyle = gradKronos;
  ctx.fillText('DJ KRONOS', 0, 0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.font = '900 80px Impact, sans-serif';
  ctx.fillText('DJ KRONOS', -2, -2);
  ctx.restore();

  // Decal 2: "BEATDOWN"
  ctx.save();
  ctx.translate(1360, 1140);
  ctx.rotate(0.22);
  ctx.font = '900 78px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#07050a';
  ctx.fillText('BEATDOWN', 7, 7);
  const gradBeat = ctx.createLinearGradient(-160, 0, 160, 0);
  gradBeat.addColorStop(0.0, '#ff1744');
  gradBeat.addColorStop(1.0, '#ff9100');
  ctx.fillStyle = gradBeat;
  ctx.fillText('BEATDOWN', 0, 0);
  ctx.fillStyle = 'rgba(255, 23, 68, 0.85)';
  for (let s = 0; s < 14; s++) {
    const rx = (Math.random() - 0.5) * 320;
    const ry = (Math.random() - 0.5) * 90;
    ctx.beginPath();
    ctx.arc(rx, ry, 2 + Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Decal 3: "RHYTHM!"
  ctx.save();
  ctx.translate(690, 1280);
  ctx.rotate(-0.28);
  ctx.font = '900 72px cursive, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#08070d';
  ctx.fillText('RHYTHM!', 6, 6);
  ctx.fillStyle = '#ffea00';
  ctx.fillText('RHYTHM!', 0, 0);
  ctx.restore();

  // 7. Branching Crevice Cracks (48 branched lines)
  ctx.strokeStyle = '#0e1017';
  for (let i = 0; i < 48; i++) {
    ctx.lineWidth = 2.5 + Math.random() * 2.5;
    ctx.beginPath();
    let x = Math.random() * 2048;
    let y = Math.random() * 2048;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 110;
      y += (Math.random() - 0.5) * 110;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _courtAsphaltTex = new THREE.CanvasTexture(c);
  _courtAsphaltTex.colorSpace = THREE.SRGBColorSpace;
  _courtAsphaltTex.anisotropy = 4;

  if (typeof window !== 'undefined' && window.floorMesh && window.floorMesh.material) {
    window.floorMesh.material.map = _courtAsphaltTex;
    window.floorMesh.material.bumpMap = createCourtAsphaltBumpMap();
    window.floorMesh.material.bumpScale = 0.04;
    _courtAsphaltTex.anisotropy = 4;
  }

  return _courtAsphaltTex;
}

let _courtAsphaltBumpTex = null;
export function createCourtAsphaltBumpMap() {
  if (_courtAsphaltBumpTex) return _courtAsphaltBumpTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext('2d');

  // 1. Base Neutral Mid-Gray (#808080 = 128/255 height)
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 2048, 2048);

  // 2. High-Frequency Mineral Aggregate Speckling (8,000 tactile specks)
  for (let i = 0; i < 8000; i++) {
    const val = 100 + Math.floor(Math.random() * 55); // height 100 to 155
    ctx.fillStyle = `rgb(${val}, ${val}, ${val})`;
    const sz = 1.5 + Math.random() * 3.5;
    ctx.fillRect(Math.random() * 2048, Math.random() * 2048, sz, sz);
  }

  // 3. Raised Court Paint Lines (Height ~175-190 with etched dark boundary bevel ~90)
  function drawRaisedPaintLine(drawFn, lineWidth) {
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = lineWidth + 6;
    drawFn();
    ctx.strokeStyle = '#b8b8b8';
    ctx.lineWidth = lineWidth;
    drawFn();
  }

  // Basketball key rect
  drawRaisedPaintLine(() => {
    ctx.strokeRect(724, 560, 600, 520);
  }, 14);

  // Free-throw circle arc
  drawRaisedPaintLine(() => {
    ctx.beginPath();
    ctx.arc(1024, 1080, 200, 0, Math.PI);
    ctx.stroke();
  }, 14);

  // 3-Point perimeter arc
  drawRaisedPaintLine(() => {
    ctx.beginPath();
    ctx.arc(1024, 480, 680, 0.45, Math.PI - 0.45);
    ctx.stroke();
  }, 14);

  // Circular battle cypher ring (r = 460 at 1024, 1024)
  drawRaisedPaintLine(() => {
    ctx.beginPath();
    ctx.arc(1024, 1024, 460, 0, Math.PI * 2);
    ctx.stroke();
  }, 18);

  // Outer boundary square
  drawRaisedPaintLine(() => {
    ctx.strokeRect(380, 380, 1288, 1288);
  }, 12);

  // 4. Raised Graffiti Text Relief
  ctx.save();
  ctx.translate(680, 940);
  ctx.rotate(-0.16);
  ctx.font = '900 85px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#444444';
  ctx.fillText('DJ KRONOS', 4, 4);
  ctx.fillStyle = '#b0b0b0';
  ctx.fillText('DJ KRONOS', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(1360, 1140);
  ctx.rotate(0.22);
  ctx.font = '900 78px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#444444';
  ctx.fillText('BEATDOWN', 4, 4);
  ctx.fillStyle = '#b0b0b0';
  ctx.fillText('BEATDOWN', 0, 0);
  ctx.restore();

  // 5. Deep Etched Crevice Cracks (Height 25 to 50 = deep fissures)
  ctx.strokeStyle = '#222222';
  for (let i = 0; i < 48; i++) {
    ctx.lineWidth = 2.5 + Math.random() * 2.5;
    ctx.beginPath();
    let x = Math.random() * 2048;
    let y = Math.random() * 2048;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 110;
      y += (Math.random() - 0.5) * 110;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _courtAsphaltBumpTex = new THREE.CanvasTexture(c);
  _courtAsphaltBumpTex.anisotropy = 4;
  return _courtAsphaltBumpTex;
}

let _lightPoolTex = null;

let _arenaAOTex = null;
export function createBakedArenaAOMapTexture() {
  if (_arenaAOTex) return _arenaAOTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext('2d');

  // Base is pure white (1.0 = no ambient occlusion)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 2048, 2048);

  // World center (0, 0) -> (1024, 1024). Floor mesh radius 42m -> 24.38095 px/m.
  const toPxX = (wx) => 1024 + wx * 24.38095;
  const toPxY = (wz) => 1024 + wz * 24.38095;

  // 1. Stage Shadow Footprint (Boombox Truck + Wing Towers) - Aligned 1:1 with soundRigGroup at (2.35, 0, -5.6)
  const stagePxX = toPxX(2.35);
  const stagePxY = toPxY(-5.6);
  const stageGrad = ctx.createRadialGradient(stagePxX, stagePxY, 30, stagePxX, stagePxY, 160);
  stageGrad.addColorStop(0.0, 'rgba(25, 25, 35, 0.85)');
  stageGrad.addColorStop(0.50, 'rgba(40, 40, 55, 0.60)');
  stageGrad.addColorStop(0.85, 'rgba(120, 120, 140, 0.22)');
  stageGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = stageGrad;
  ctx.beginPath();
  ctx.ellipse(stagePxX, stagePxY, 160, 90, -0.22, 0, Math.PI * 2);
  ctx.fill();

  // Dense occlusion core under center cabinet (rotated -0.22 rad with soundRigGroup)
  ctx.save();
  ctx.translate(stagePxX, stagePxY);
  ctx.rotate(-0.22);
  ctx.fillStyle = 'rgba(15, 15, 25, 0.80)';
  ctx.fillRect(-3.8 * 24.38095, -1.5 * 24.38095, 7.6 * 24.38095, 3.0 * 24.38095);
  ctx.restore();

  // 2. West Warehouse Base Seam Crevice AO & Contact Shadow
  // Base crevice is sampled at x = -8.2, z in [-1.5, 2.5]. Asphalt sample is at x = -6.8.
  const wX_dark = toPxX(-10.2);
  const wX_clear = toPxX(-7.2);
  const wY_start = toPxY(-4.5);
  const wY_end = toPxY(4.5);

  const westCreviceGrad = ctx.createLinearGradient(wX_dark, 0, wX_clear, 0);
  westCreviceGrad.addColorStop(0.0, 'rgba(10, 10, 15, 0.98)');
  westCreviceGrad.addColorStop(0.72, 'rgba(15, 15, 22, 0.94)'); // Deep occlusion covering x = -8.2
  westCreviceGrad.addColorStop(0.90, 'rgba(50, 50, 65, 0.40)'); // Rapid falloff at x = -7.5
  westCreviceGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)'); // Completely unoccluded at x = -7.2
  ctx.fillStyle = westCreviceGrad;
  ctx.fillRect(wX_dark, wY_start, wX_clear - wX_dark, wY_end - wY_start);

  // 3. East Viaduct Arch Footings & Bodega Base Seam Crevice AO
  // Base crevice is sampled at x = 8.2, z in [-2.0, 2.0]. Asphalt sample is at x = 6.8.
  const vX_dark = toPxX(10.5);
  const vX_clear = toPxX(7.0);
  const vY_start = toPxY(-4.5);
  const vY_end = toPxY(4.5);

  const eastCreviceGrad = ctx.createLinearGradient(vX_dark, 0, vX_clear, 0);
  eastCreviceGrad.addColorStop(0.0, 'rgba(10, 10, 15, 0.98)');
  eastCreviceGrad.addColorStop(0.70, 'rgba(15, 15, 22, 0.95)'); // Deep occlusion covering x = 8.2
  eastCreviceGrad.addColorStop(0.88, 'rgba(50, 50, 65, 0.40)'); // Rapid falloff at x = 7.4
  eastCreviceGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)'); // Completely unoccluded at x = 7.0
  ctx.fillStyle = eastCreviceGrad;
  ctx.fillRect(vX_clear, vY_start, vX_dark - vX_clear, vY_end - vY_start);

  // 4. East Viaduct Pier Footings Contact Circles
  [-6.0, -2.5, 1.0, 4.5].forEach((wz) => {
    const py = toPxY(wz);
    const px = toPxX(10.5);
    const pierGrad = ctx.createRadialGradient(px, py, 4, px, py, 42);
    pierGrad.addColorStop(0.0, 'rgba(15, 15, 22, 0.85)');
    pierGrad.addColorStop(0.50, 'rgba(55, 55, 70, 0.50)');
    pierGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = pierGrad;
    ctx.beginPath();
    ctx.arc(px, py, 42, 0, Math.PI * 2);
    ctx.fill();
  });

  // 5. South Entrance Arch Pillars & Van Contact
  [[-4.2, 11.4], [4.2, 11.4]].forEach(([wx, wz]) => {
    const px = toPxX(wx);
    const py = toPxY(wz);
    const archGrad = ctx.createRadialGradient(px, py, 3, px, py, 32);
    archGrad.addColorStop(0.0, 'rgba(25, 25, 35, 0.75)');
    archGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = archGrad;
    ctx.beginPath();
    ctx.arc(px, py, 32, 0, Math.PI * 2);
    ctx.fill();
  });

  // Sound-crew van at (1.5, 12.6)
  const vanPx = toPxX(1.5);
  const vanPy = toPxY(12.6);
  const vanGrad = ctx.createRadialGradient(vanPx, vanPy, 15, vanPx, vanPy, 70);
  vanGrad.addColorStop(0.0, 'rgba(20, 20, 30, 0.80)');
  vanGrad.addColorStop(0.60, 'rgba(60, 60, 75, 0.40)');
  vanGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = vanGrad;
  ctx.beginPath();
  ctx.ellipse(vanPx, vanPy, 45, 75, 0.18, 0, Math.PI * 2);
  ctx.fill();

  // 6. Outer Perimeter Ground Curbs Darkening
  const edgeGrad = ctx.createRadialGradient(1024, 1024, 940, 1024, 1024, 1024);
  edgeGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
  edgeGrad.addColorStop(0.80, 'rgba(255, 255, 255, 0.0)');
  edgeGrad.addColorStop(0.95, 'rgba(40, 40, 55, 0.35)');
  edgeGrad.addColorStop(1.0, 'rgba(20, 20, 30, 0.65)');
  ctx.fillStyle = edgeGrad;
  ctx.beginPath();
  ctx.arc(1024, 1024, 1024, 0, Math.PI * 2);
  ctx.fill();

  _arenaAOTex = new THREE.CanvasTexture(c);
  _arenaAOTex.colorSpace = THREE.SRGBColorSpace;
  _arenaAOTex.generateMipmaps = false;
  _arenaAOTex.minFilter = THREE.LinearFilter;
  return _arenaAOTex;
}

let _arenaLightMapTex = null;
export function createBakedArenaLightMapTexture() {
  if (_arenaLightMapTex) return _arenaLightMapTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext('2d');

  // Base is black (0.0 = no added irradiance)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 2048, 2048);

  const toPxX = (wx) => 1024 + wx * 24.38095;
  const toPxY = (wz) => 1024 + wz * 24.38095;

  // 1. 4 Streetlamp Warm Bounce Pools at Lamp Posts
  [
    [-6.5, -4.6],
    [7.4,  -3.6],
    [-6.6,  5.8],
    [6.6,   5.8]
  ].forEach(([lx, lz]) => {
    const px = toPxX(lx);
    const py = toPxY(lz);
    const lampGrad = ctx.createRadialGradient(px, py, 4, px, py, 95);
    lampGrad.addColorStop(0.0, 'rgba(255, 209, 92, 0.62)');
    lampGrad.addColorStop(0.35, 'rgba(255, 185, 70, 0.38)');
    lampGrad.addColorStop(0.70, 'rgba(255, 160, 50, 0.14)');
    lampGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = lampGrad;
    ctx.beginPath();
    ctx.arc(px, py, 95, 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. West Warehouse Loft Windows Warm Incandescent Spill
  const westSpillX = toPxX(-8.2);
  const westSpillY = toPxY(-2.2);
  const westSpillGrad = ctx.createRadialGradient(westSpillX, westSpillY, 15, westSpillX, westSpillY, 160);
  westSpillGrad.addColorStop(0.0, 'rgba(255, 168, 52, 0.45)');
  westSpillGrad.addColorStop(0.40, 'rgba(255, 140, 40, 0.25)');
  westSpillGrad.addColorStop(0.80, 'rgba(255, 110, 30, 0.08)');
  westSpillGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = westSpillGrad;
  ctx.beginPath();
  ctx.ellipse(westSpillX, westSpillY, 110, 160, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // 3. South Van Forward Headlight Pools
  const vanHeadL_X = toPxX(0.7);
  const vanHeadL_Y = toPxY(9.8);
  const vanHeadR_X = toPxX(2.3);
  const vanHeadR_Y = toPxY(9.8);
  [vanHeadL_X, vanHeadR_X].forEach((hx) => {
    const hGrad = ctx.createRadialGradient(hx, vanHeadL_Y, 8, hx, vanHeadL_Y - 25, 110);
    hGrad.addColorStop(0.0, 'rgba(255, 240, 153, 0.55)');
    hGrad.addColorStop(0.40, 'rgba(255, 230, 130, 0.28)');
    hGrad.addColorStop(0.80, 'rgba(255, 210, 100, 0.08)');
    hGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.ellipse(hx, vanHeadL_Y - 25, 50, 95, -0.18, 0, Math.PI * 2);
    ctx.fill();
  });

  // 4. Subtle Stage-Front Theatrical Warm Glow - Aligned 1:1 with soundRigGroup at X=2.35
  const stageGlowX = toPxX(2.35);
  const stageGlowY = toPxY(-4.2);
  const stageGlowGrad = ctx.createRadialGradient(stageGlowX, stageGlowY, 15, stageGlowX, stageGlowY, 140);
  stageGlowGrad.addColorStop(0.0, 'rgba(255, 56, 152, 0.25)');
  stageGlowGrad.addColorStop(0.50, 'rgba(36, 229, 255, 0.15)');
  stageGlowGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = stageGlowGrad;
  ctx.beginPath();
  ctx.ellipse(stageGlowX, stageGlowY, 150, 60, -0.22, 0, Math.PI * 2);
  ctx.fill();

  // 5. East Dual Neon Signs ("BOOMBOX BATTLE") Cyan/Magenta Floor Wash
  const neonWashX = toPxX(8.6);
  const neonWashY = toPxY(0.8);
  const neonWashGrad = ctx.createRadialGradient(neonWashX, neonWashY, 4, neonWashX, neonWashY, 28);
  neonWashGrad.addColorStop(0.0, 'rgba(36, 229, 255, 0.95)');
  neonWashGrad.addColorStop(0.35, 'rgba(36, 229, 255, 0.75)');
  neonWashGrad.addColorStop(0.70, 'rgba(255, 42, 133, 0.35)');
  neonWashGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = neonWashGrad;
  ctx.beginPath();
  ctx.arc(neonWashX, neonWashY, 28, 0, Math.PI * 2);
  ctx.fill();

  // 6. East Bodega Shopfront Window Warm Golden Bounce Pool
  const eastSpillX = toPxX(9.2);
  const eastSpillY = toPxY(2.2);
  const eastSpillGrad = ctx.createRadialGradient(eastSpillX, eastSpillY, 4, eastSpillX, eastSpillY, 32);
  eastSpillGrad.addColorStop(0.0, 'rgba(255, 184, 54, 0.95)');
  eastSpillGrad.addColorStop(0.40, 'rgba(255, 160, 40, 0.65)');
  eastSpillGrad.addColorStop(0.75, 'rgba(255, 130, 30, 0.25)');
  eastSpillGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = eastSpillGrad;
  ctx.beginPath();
  ctx.arc(eastSpillX, eastSpillY, 32, 0, Math.PI * 2);
  ctx.fill();

  _arenaLightMapTex = new THREE.CanvasTexture(c);
  _arenaLightMapTex.colorSpace = THREE.SRGBColorSpace;
  _arenaLightMapTex.generateMipmaps = false;
  _arenaLightMapTex.minFilter = THREE.LinearFilter;
  return _arenaLightMapTex;
}

export function createFlightCase(w = 1.1, h = 0.85, d = 0.85, color = 0x181820, stencilText = 'KRONOS SOUND') {
  const caseGroup = new THREE.Group();
  const mainBox = createHiFiMesh(new THREE.BoxGeometry(w, h, d), color, 0.035);
  mainBox.name = 'flight_case_mesh';
  caseGroup.add(mainBox);

  const edgeMatColor = 0xa1aab8;
  const edgeT = 0.032;
  [-h/2, h/2].forEach((ey) => {
    [-d/2, d/2].forEach((ez) => {
      const edge = createHiFiMesh(new THREE.BoxGeometry(w, edgeT, edgeT), edgeMatColor, 0.02);
      edge.position.set(0, ey, ez);
      caseGroup.add(edge);
    });
  });
  [-w/2, w/2].forEach((ex) => {
    [-d/2, d/2].forEach((ez) => {
      const edge = createHiFiMesh(new THREE.BoxGeometry(edgeT, h, edgeT), edgeMatColor, 0.02);
      edge.position.set(ex, 0, ez);
      caseGroup.add(edge);
    });
  });
  [-w/2, w/2].forEach((ex) => {
    [-h/2, h/2].forEach((ey) => {
      const edge = createHiFiMesh(new THREE.BoxGeometry(edgeT, edgeT, d), edgeMatColor, 0.02);
      edge.position.set(ex, ey, 0);
      caseGroup.add(edge);
    });
  });

  const cornerR = 0.052;
  [-w/2, w/2].forEach((cx) => {
    [-h/2, h/2].forEach((cy) => {
      [-d/2, d/2].forEach((cz) => {
        const ball = createHiFiMesh(new THREE.SphereGeometry(cornerR, 8, 8), 0xc4ccdc, 0.02, null, 0x000000, {
          isMetallic: true,
          glintThreshold: 0.82,
          glintIntensity: 1.5
        });
        ball.position.set(cx, cy, cz);
        caseGroup.add(ball);
      });
    });
  });

  [-w * 0.28, w * 0.28].forEach((lx) => {
    const latch = createHiFiMesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), 0x71717a, 0.015);
    latch.position.set(lx, 0, d/2 + 0.012);
    caseGroup.add(latch);
  });

  [-w/2 - 0.01, w/2 + 0.01].forEach((hx) => {
    const handleDish = createHiFiMesh(new THREE.BoxGeometry(0.02, 0.14, 0.22), 0x22242c, 0.015);
    handleDish.position.set(hx, 0, 0);
    caseGroup.add(handleDish);
  });

  if (stencilText) {
    const stCanvas = document.createElement('canvas');
    stCanvas.width = 256;
    stCanvas.height = 64;
    const sCtx = stCanvas.getContext('2d');
    sCtx.clearRect(0, 0, 256, 64);
    sCtx.font = '900 24px Impact, monospace';
    sCtx.fillStyle = 'rgba(235, 238, 245, 0.78)';
    sCtx.textAlign = 'center';
    sCtx.fillText(stencilText, 128, 42);
    const stTex = new THREE.CanvasTexture(stCanvas);
    stTex.colorSpace = THREE.SRGBColorSpace;
    const stMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.65, (w * 0.65) * 0.25),
      new THREE.MeshBasicMaterial({ map: stTex, transparent: true })
    );
    stMesh.position.set(0, h * 0.2, d/2 + 0.018);
    caseGroup.add(stMesh);
  }

  return caseGroup;
}

export function createJerseyBarrier(w = 2.2, h = 0.88, d = 0.62) {
  const barrierGroup = new THREE.Group();
  const tex = createJerseyBarrierTexture();
  const bump = createJerseyBarrierBumpMap();

  // Use 0xffffff so concrete texture is not darkened, with Track 4 creviceAO & chipped concrete bump relief
  const basePlinth = createHiFiMesh(new THREE.BoxGeometry(w, 0.28, d), 0xffffff, 0.038, tex, 0x000000, {
    creviceAO: true,
    bumpMap: bump,
    bumpScale: 0.04
  });
  basePlinth.name = 'jersey_barrier_mesh';
  basePlinth.position.y = 0.14;
  barrierGroup.add(basePlinth);

  // Angled mid-slope section with concrete aggregate and crack relief
  const midSlope = createHiFiMesh(new THREE.BoxGeometry(w, 0.22, d * 0.70), 0xffffff, 0.035, tex, 0x000000, {
    bumpMap: bump,
    bumpScale: 0.035
  });
  midSlope.position.y = 0.39;
  barrierGroup.add(midSlope);

  // Upper vertical stem section with warning stripe bump relief
  const stem = createHiFiMesh(new THREE.BoxGeometry(w, 0.38, d * 0.38), 0xffffff, 0.035, tex, 0x000000, {
    bumpMap: bump,
    bumpScale: 0.035
  });
  stem.position.y = 0.69;
  barrierGroup.add(stem);

  const cap = createHiFiMesh(new THREE.CylinderGeometry(d * 0.19, d * 0.19, w, 10), 0x7a808c, 0.03);
  cap.rotation.z = Math.PI / 2;
  cap.position.y = 0.88;
  barrierGroup.add(cap);

  // Retro-reflective safety orange warning stripe plates (unlit / high-visibility)
  const stripeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });

  // Front face stripe plate (+Z)
  const frontStripe = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, 0.36), stripeMat);
  frontStripe.position.set(0, 0.52, d * 0.38 * 0.5 + 0.015);
  barrierGroup.add(frontStripe);

  // Angled mid-slope stripe plate facing slightly upward towards camera
  const slopeStripe = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, 0.22), stripeMat);
  slopeStripe.position.set(0, 0.39, d * 0.70 * 0.5 + 0.012);
  slopeStripe.rotation.x = -0.32;
  barrierGroup.add(slopeStripe);

  [-w * 0.32, w * 0.32].forEach((fx) => {
    const slot = createHiFiMesh(new THREE.BoxGeometry(0.24, 0.10, d + 0.02), 0x222630, 0.02);
    slot.position.set(fx, 0.05, 0);
    barrierGroup.add(slot);
  });

  return barrierGroup;
}

export function buildBoomboxStage(scene) {
  const soundRigGroup = new THREE.Group();
  soundRigGroup.position.set(2.35, 0, -5.6);
  soundRigGroup.rotation.y = -0.22;
  soundRigGroup.scale.setScalar(0.86);
  scene.add(soundRigGroup);

  // 1. Main Boombox Truck Base & Center Booth Cabinet
  const stageChassisTex = createStageChassisTexture();
  const stageChassisBump = createStageChassisBumpMap();
  const stageBase = createHiFiMesh(new THREE.BoxGeometry(8.6, 1.35, 3.2), 0xffffff, 0.03, stageChassisTex, 0x120f20, {
    creviceAO: true,
    bumpMap: stageChassisBump,
    bumpScale: 0.035,
    isMetallic: true,
    castShadow: true,
    receiveShadow: true
  });
  stageBase.position.set(0, 0.68, 0);
  soundRigGroup.add(stageBase);

  // Front Trailer Skirt Graphic Plane with Cel Material and Ribbed Bump Relief
  const skirtPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(8.55, 1.30),
    createCelMaterial(0xffffff, stageChassisTex, 0x000000, {
      bumpMap: stageChassisBump,
      bumpScale: 0.035,
      isMetallic: true
    })
  );
  skirtPlane.position.set(0, 0.68, 1.61);
  soundRigGroup.add(skirtPlane);

  // Hydraulic Ground Stabilization Outriggers (matching concept art 2)
  [-4.1, 4.1].forEach((ox) => {
    const outriggerGroup = new THREE.Group();
    outriggerGroup.position.set(ox, 0, 1.4);

    const diagBeam = createHiFiMesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), 0xf5b942, 0.025);
    diagBeam.position.set(ox > 0 ? 0.22 : -0.22, 0.52, 0.15);
    diagBeam.rotation.z = ox > 0 ? -0.42 : 0.42;
    outriggerGroup.add(diagBeam);

    const jackCyl = createHiFiMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12), 0xf5b942, 0.025);
    jackCyl.position.set(ox > 0 ? 0.42 : -0.42, 0.32, 0.3);
    outriggerGroup.add(jackCyl);

    const piston = createHiFiMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 10), 0xdce2ec, 0.02);
    piston.position.set(ox > 0 ? 0.42 : -0.42, 0.14, 0.3);
    outriggerGroup.add(piston);

    const footPad = createHiFiMesh(new THREE.CylinderGeometry(0.24, 0.26, 0.06, 14), 0x181a24, 0.02);
    footPad.position.set(ox > 0 ? 0.42 : -0.42, 0.03, 0.3);
    outriggerGroup.add(footPad);

    soundRigGroup.add(outriggerGroup);
  });

  const centerCabinet = createHiFiMesh(new THREE.BoxGeometry(3.5, 3.6, 2.5), 0x201a38, 0.035, null, 0x000000, { castShadow: true });
  centerCabinet.position.set(0, 3.1, -0.1);
  soundRigGroup.add(centerCabinet);

  // Recessed Glowing DJ Booth Backdrop
  const boothBackCanvas = document.createElement('canvas');
  boothBackCanvas.width = 256;
  boothBackCanvas.height = 160;
  const bCtx = boothBackCanvas.getContext('2d');
  bCtx.fillStyle = '#12183b';
  bCtx.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 12; i++) {
    bCtx.fillStyle = i % 2 === 0 ? '#ff3898' : '#24e5ff';
    const bh = 35 + ((i * 29) % 85);
    bCtx.fillRect(12 + i * 20, 148 - bh, 13, bh);
  }
  const boothBackTex = new THREE.CanvasTexture(boothBackCanvas);
  boothBackTex.colorSpace = THREE.SRGBColorSpace;

  const boothWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.85, 1.55),
    new THREE.MeshBasicMaterial({ map: boothBackTex })
  );
  boothWindow.position.set(0, 2.75, 1.16);
  soundRigGroup.add(boothWindow);

  // Neon Cyan Frame around DJ Booth Window
  const boothFrame = createHiFiMesh(new THREE.BoxGeometry(3.05, 1.72, 0.14), 0x24e5ff, 0.02, null, 0x0a6688);
  boothFrame.position.set(0, 2.75, 1.08);
  soundRigGroup.add(boothFrame);

  // 2. Twin Pro DJ Turntables Station on Console Desk
  const djConsole = createHiFiMesh(new THREE.BoxGeometry(3.35, 1.35, 1.25), 0x18152b, 0.04);
  djConsole.position.set(0, 1.35, 1.35);
  soundRigGroup.add(djConsole);

  const turntablePlatters = [];
  [-0.75, 0.75].forEach((tx) => {
    const deck = new THREE.Group();
    deck.position.set(tx, 2.06, 1.45);
    soundRigGroup.add(deck);

    const plinth = createHiFiMesh(new THREE.BoxGeometry(0.72, 0.10, 0.62), 0x24222e, 0.04);
    deck.add(plinth);

    const platter = createHiFiMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 24), 0x111016, 0.03);
    platter.position.set(-0.06, 0.065, 0);
    deck.add(platter);
    turntablePlatters.push(platter);

    const label = createHiFiMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 18), 0xf5c538, 0.03);
    label.position.set(-0.06, 0.07, 0);
    deck.add(label);

    const tonearm = createHiFiMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8), 0xdde2ea, 0.02);
    tonearm.position.set(0.22, 0.11, -0.04);
    tonearm.rotation.set(0.2, 0, 0.75);
    deck.add(tonearm);

    [-0.20, -0.10, 0.0].forEach((bx, bIdx) => {
      const btn = createHiFiMesh(
        new THREE.BoxGeometry(0.04, 0.02, 0.04),
        bIdx === 0 ? 0x24e5ff : 0xff2a85,
        0.02,
        null,
        bIdx === 0 ? 0x0c4a66 : 0x660e33
      );
      btn.position.set(bx, 0.06, 0.22);
      deck.add(btn);
    });
  });

  // 3. High-Resolution 20-Column Segmented Equalizer Display (1024x384)
  const eqCanvas = document.createElement('canvas');
  eqCanvas.width = 1024;
  eqCanvas.height = 384;
  const eqCtx = eqCanvas.getContext('2d');
  const eqTex = new THREE.CanvasTexture(eqCanvas);
  eqTex.colorSpace = THREE.SRGBColorSpace;

  const eqScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.95, 0.98),
    new THREE.MeshBasicMaterial({ map: eqTex })
  );
  eqScreen.position.set(0, 1.38, 1.99);
  soundRigGroup.add(eqScreen);

  const numCols = 20;
  const numSegs = 14;
  const colW = 42;
  const colGap = 7;
  const segH = 20;
  const segGap = 5;
  const startX = 24;
  const baseY = 360;

  const peakLevels = new Float32Array(numCols);
  const peakHoldTimers = new Int32Array(numCols);

  // 4. Dual Warm-Amber Analog VU Meter Dials with Ballistic Spring-Damper Physics (1024x360)
  const vuCanvas = document.createElement('canvas');
  vuCanvas.width = 1024;
  vuCanvas.height = 360;
  const vuCtx = vuCanvas.getContext('2d');
  const vuTex = new THREE.CanvasTexture(vuCanvas);
  vuTex.colorSpace = THREE.SRGBColorSpace;

  const vuPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.95, 0.88),
    new THREE.MeshBasicMaterial({ map: vuTex })
  );
  vuPanel.position.set(0, 4.18, 1.18);
  soundRigGroup.add(vuPanel);

  const vuBallistics = {
    angleL: -0.75,
    velL: 0,
    angleR: -0.75,
    velR: 0
  };
  const kSpring = 145.0;
  const cDamp = 16.5;

  const cachedVuGradL = vuCtx.createRadialGradient(256, 310, 20, 256, 240, 210);
  cachedVuGradL.addColorStop(0.0, '#fff4cc');
  cachedVuGradL.addColorStop(0.55, '#f7ca5e');
  cachedVuGradL.addColorStop(1.0, '#d19726');
  const cachedVuGradR = vuCtx.createRadialGradient(768, 310, 20, 768, 240, 210);
  cachedVuGradR.addColorStop(0.0, '#fff4cc');
  cachedVuGradR.addColorStop(0.55, '#f7ca5e');
  cachedVuGradR.addColorStop(1.0, '#d19726');

  // 4B. Upward-Tilted Stage Canopy Roof Awning (~25° tilt) with Perimeter Amber Chase Bulbs
  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(0, 4.88, 0.40);
  canopyGroup.rotation.x = -0.42; // ~24° upward awning tilt
  soundRigGroup.add(canopyGroup);

  // Main Canopy Roof Slab
  const canopySlab = createHiFiMesh(new THREE.BoxGeometry(5.2, 0.24, 2.2), 0x18142c, 0.04);
  canopySlab.position.set(0, 0, 0);
  canopyGroup.add(canopySlab);

  // Underside Canopy Frame & Reflector Panel
  const canopyLining = createHiFiMesh(new THREE.BoxGeometry(4.9, 0.06, 1.95), 0x221a36, 0.02);
  canopyLining.position.set(0, -0.12, 0);
  canopyGroup.add(canopyLining);

  // Perimeter Amber Chase Bulbs along Front & Side Underside Lip
  const chaseBulbMat = new THREE.MeshBasicMaterial({ color: 0xffd13b });
  const chaseBulbGeo = new THREE.SphereGeometry(0.075, 8, 8);
  for (let bx = -2.35; bx <= 2.35; bx += 0.32) {
    const bulb = new THREE.Mesh(chaseBulbGeo, chaseBulbMat);
    bulb.position.set(bx, -0.16, 1.02);
    canopyGroup.add(bulb);
  }
  [-0.6, -0.2, 0.2, 0.6].forEach((bz) => {
    [-2.42, 2.42].forEach((bx) => {
      const sideBulb = new THREE.Mesh(chaseBulbGeo, chaseBulbMat);
      sideBulb.position.set(bx, -0.16, bz);
      canopyGroup.add(sideBulb);
    });
  });

  // Twin Hydraulic Gas Struts propping up the Stage Canopy
  [-2.2, 2.2].forEach((sx) => {
    const strutOuter = createHiFiMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.25, 8), 0xf5b942, 0.02);
    strutOuter.position.set(sx, 3.8, 0.2);
    strutOuter.rotation.x = 0.32;
    soundRigGroup.add(strutOuter);

    const strutRod = createHiFiMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 8), 0xc4ccdc, 0.02);
    strutRod.position.set(sx, 4.4, 0.45);
    strutRod.rotation.x = 0.32;
    soundRigGroup.add(strutRod);
  });

  // Header Banners & Neon Marquee mounted on canopy
  const subBanner = createHiFiMesh(new THREE.BoxGeometry(4.8, 0.56, 0.6), 0x18142c, 0.035);
  subBanner.position.set(0, 0.38, 0.65);
  canopyGroup.add(subBanner);

  const subBannerPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.65, 0.50),
    new THREE.MeshBasicMaterial({ map: createTruckSubBannerTexture() })
  );
  subBannerPlane.position.set(0, 0.38, 0.96);
  canopyGroup.add(subBannerPlane);

  const marqueeBox = createHiFiMesh(new THREE.BoxGeometry(4.4, 1.15, 0.75), 0x140f26, 0.04);
  marqueeBox.position.set(0, 1.25, 0.45);
  canopyGroup.add(marqueeBox);

  const marqueePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.25, 1.05),
    new THREE.MeshBasicMaterial({
      map: createMarqueeTexture(),
      fog: false,
      toneMapped: false
    })
  );
  marqueePlane.name = 'stage_marquee_banner';
  marqueePlane.position.set(0, 1.25, 0.84);
  canopyGroup.add(marqueePlane);

  // 5. Left & Right Transforming Mechanical Speaker Wings & Stacked Amps
  const wooferCones = [];
  const conePts = [
    new THREE.Vector2(0.01, -0.05),
    new THREE.Vector2(0.20, 0.06),
    new THREE.Vector2(0.56, -0.14),
    new THREE.Vector2(0.64, -0.14),
    new THREE.Vector2(0.66, 0.0)
  ];
  const wooferGeo = new THREE.LatheGeometry(conePts, 24);
  wooferGeo.rotateX(Math.PI / 2);

  const ampGrilleTex = createAmpGrilleTexture();

  function buildSpeakerCabinet(side) {
    const wing = new THREE.Group();
    // Articulated mechanical wing angle (±0.35 rad)
    wing.position.set(side * 3.15, 2.95, 0.25);
    wing.rotation.y = side * -0.35;

    // 1. Aerodynamic Wing Truss Fairing with Neon Trim
    const wingTruss = createHiFiMesh(new THREE.BoxGeometry(2.45, 3.65, 2.1), 0x1a162b, 0.04, null, 0x000000, { castShadow: true });
    wing.add(wingTruss);

    const neonFrame = createHiFiMesh(
      new THREE.BoxGeometry(2.52, 3.72, 1.95),
      side < 0 ? 0xc84bff : 0x24e5ff,
      0.0,
      null,
      side < 0 ? 0x4a1268 : 0x095266
    );
    wing.add(neonFrame);

    // 2. High-Power Stacked Guitar / Bass Amplifier Cabinets
    // A. 4x12 Speaker Cabinet (Black Tolex, Woven Cloth Grille, 8 Gold Corner Caps)
    const cab412 = createHiFiMesh(new THREE.BoxGeometry(1.28, 1.32, 0.68), 0x15151a, 0.035);
    cab412.position.set(side * -0.35, 0.95, 0.92);
    wing.add(cab412);

    const cabGrille = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 1.22),
      new THREE.MeshBasicMaterial({ map: ampGrilleTex })
    );
    cabGrille.position.set(side * -0.35, 0.95, 1.27);
    wing.add(cabGrille);

    // 8 Gold Metal Corner Caps on 4x12
    [-0.60, 0.60].forEach((cx) => {
      [-0.62, 0.62].forEach((cy) => {
        [-0.30, 0.30].forEach((cz) => {
          const cornerCap = createHiFiMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), 0xd09e38, 0.02);
          cornerCap.position.set(side * -0.35 + cx, 0.95 + cy, 0.92 + cz);
          wing.add(cornerCap);
        });
      });
    });

    // Gold Script Logo Plaque
    const logoBadge = createHiFiMesh(new THREE.BoxGeometry(0.32, 0.08, 0.02), 0xd09e38, 0.015);
    logoBadge.position.set(side * -0.35, 1.32, 1.28);
    wing.add(logoBadge);

    // B. Amplifier Head Unit mounted atop 4x12
    const ampHead = createHiFiMesh(new THREE.BoxGeometry(1.22, 0.44, 0.58), 0x16161c, 0.03);
    ampHead.position.set(side * -0.35, 1.88, 0.88);
    wing.add(ampHead);

    const facePlate = createHiFiMesh(new THREE.BoxGeometry(1.12, 0.28, 0.02), 0xd8ac32, 0.02);
    facePlate.position.set(side * -0.35, 1.88, 1.18);
    wing.add(facePlate);

    // Row of 6 chicken-head knobs
    for (let k = 0; k < 6; k++) {
      const kx = side * -0.35 - 0.38 + k * 0.15;
      const knob = createHiFiMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), 0x111114, 0.015);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, 1.88, 1.20);
      wing.add(knob);
    }

    // Glowing red jewel pilot light
    const pilotJewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff1744 })
    );
    pilotJewel.position.set(side * -0.35 + 0.45, 1.88, 1.20);
    wing.add(pilotJewel);

    // Black leather carrying handle on amp head
    const handle = createHiFiMesh(new THREE.BoxGeometry(0.32, 0.04, 0.08), 0x121216, 0.015);
    handle.position.set(side * -0.35, 2.12, 0.88);
    wing.add(handle);

    // 3. High-Excursion Woofers (Responsive to Bass in updateStageDisplays)
    const bigW = new THREE.Group();
    bigW.position.set(side * 0.45, -0.58, 1.16);
    bigW.scale.setScalar(1.38);

    const bigDrv = createHiFiMesh(wooferGeo, 0x141124, 0.045);
    bigW.add(bigDrv);

    const bigCap = createHiFiMesh(new THREE.SphereGeometry(0.22, 16, 12), 0xf5b942, 0.03);
    bigCap.scale.set(1, 1, 0.42);
    bigCap.position.z = 0.04;
    bigW.add(bigCap);

    const bigRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.052, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xe048ff })
    );
    bigRing.position.z = 0.03;
    bigW.add(bigRing);

    wing.add(bigW);
    wooferCones.push(bigW);

    // Speaker mounting bolts around woofer perimeter rings
    const screwGeo = new THREE.BoxGeometry(0.028, 0.028, 0.02);
    const screwMat = new THREE.MeshBasicMaterial({ color: 0xf5b942 });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(Math.cos(ang) * 0.62, Math.sin(ang) * 0.62, 0.06);
      bigW.add(screw);
    }

    // Upper twin satellite driver
    const smallW = new THREE.Group();
    smallW.position.set(side * 0.52, 0.88, 1.14);
    smallW.scale.setScalar(0.72);

    const drv = createHiFiMesh(wooferGeo, 0x141124, 0.05);
    smallW.add(drv);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.60, 0.06, 10, 24),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xd946ef : 0x24e5ff })
    );
    ring.position.z = 0.03;
    smallW.add(ring);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(Math.cos(ang) * 0.60, Math.sin(ang) * 0.60, 0.06);
      smallW.add(screw);
    }

    wing.add(smallW);
    wooferCones.push(smallW);

    // 4. Heavy-Duty Dual Hydraulic Actuators propping the wing boom arm
    [0.45, 1.85].forEach((py) => {
      const cylOuter = createHiFiMesh(new THREE.CylinderGeometry(0.085, 0.085, 1.1, 10), 0xf5b942, 0.03);
      cylOuter.rotation.z = side * 0.48;
      cylOuter.rotation.y = side * 0.35;
      cylOuter.position.set(side * -0.95, py - 1.2, -0.15);
      wing.add(cylOuter);

      const pistonRod = createHiFiMesh(new THREE.CylinderGeometry(0.048, 0.048, 1.0, 10), 0xc4ccdc, 0.025);
      pistonRod.rotation.z = side * 0.48;
      pistonRod.rotation.y = side * 0.35;
      pistonRod.position.set(side * -0.55, py - 1.0, -0.05);
      wing.add(pistonRod);
    });

    return wing;
  }

  const leftWingTower = buildSpeakerCabinet(-1);
  const rightWingTower = buildSpeakerCabinet(1);
  soundRigGroup.add(leftWingTower);
  soundRigGroup.add(rightWingTower);

  // 6. Upgraded 5 Golden Brass Horn Bells (Shrunk to bell radius ~0.28-0.36 so they don't cover right side of screen)
  const hornPts = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const r = 0.048 + Math.pow(u, 2.45) * 0.272; // Calibrated bell radius ~0.320 (spec: 0.28-0.36)
    hornPts.push(new THREE.Vector2(r, u * 1.45));
  }
  const brassHornGeo = new THREE.LatheGeometry(hornPts, 32);
  brassHornGeo.rotateX(Math.PI / 2);

  const brassTex = createBrassInteriorTexture();
  const brassMat = createMetallicCelMaterial(0xe4c65e, brassTex, 0x000000, {
    glintThreshold: 0.88,
    glintIntensity: 1.2
  });
  brassMat.side = THREE.DoubleSide;

  // Solid dark backing material: DoubleSide + depthWrite: true to guarantee zero bleed-through
  const solidBackingMat = new THREE.MeshBasicMaterial({
    color: 0x140d06,
    side: THREE.DoubleSide,
    depthWrite: true
  });

  const hornSpecs = [
    { pos: [-3.15, 5.45, 0.85], rot: [0.14, -0.32, 0], baseScale: 1.0 },
    { pos: [3.15, 5.75, 0.65], rot: [0.18, 0.15, 0], baseScale: 1.0 },
    { pos: [4.35, 4.25, 0.65], rot: [0.08, 0.22, 0], baseScale: 0.85 },
    { pos: [4.35, 3.05, 0.65], rot: [0.05, 0.22, 0], baseScale: 0.85 },
    { pos: [4.35, 1.85, 0.65], rot: [0.02, 0.22, 0], baseScale: 0.85 }
  ];

  const brassHorns = [];
  hornSpecs.forEach(({ pos, rot, baseScale }) => {
    const hGroup = new THREE.Group();
    hGroup.position.set(...pos);
    hGroup.rotation.set(...rot);
    hGroup.scale.setScalar(baseScale);

    // 1. Outer Flared Brass Horn
    const bell = new THREE.Mesh(brassHornGeo, brassMat);
    hGroup.add(bell);

    // 2. Chunky Outer Lip Ring
    const lipRing = createHiFiMesh(new THREE.TorusGeometry(0.32, 0.032, 12, 32), 0xffe266, 0.045);
    lipRing.position.z = 1.44;
    hGroup.add(lipRing);

    // 3. Throat Baffle Disc (prevents view penetration from front)
    const throatDisc = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), solidBackingMat);
    throatDisc.position.z = 0.45;
    hGroup.add(throatDisc);

    // 4. Rear Base Plug Cap (prevents background bleed-through from rear)
    const basePlugCap = new THREE.Mesh(new THREE.CircleGeometry(0.048, 16), solidBackingMat);
    basePlugCap.position.z = 0.01;
    hGroup.add(basePlugCap);

    // 5. Tubular Mounting Truss Bracket (anchors horn to chassis)
    const bracket = createHiFiMesh(new THREE.CylinderGeometry(0.038, 0.038, 0.65, 8), 0x222638, 0.03);
    bracket.position.set(0, -0.28, -0.15);
    bracket.rotation.x = Math.PI / 4;
    hGroup.add(bracket);

    soundRigGroup.add(hGroup);
    brassHorns.push({ hGroup, baseScale });
  });

  // 7. Gold Velvet-Rope Stanchions in front of the DJ Equalizer Booth
  const stanchionX = [-1.85, -0.65, 0.65, 1.85];
  stanchionX.forEach((sx, idx) => {
    const post = createHiFiMesh(new THREE.CylinderGeometry(0.04, 0.05, 0.92, 10), 0xf5b942, 0.04);
    post.position.set(sx, 0.46, 2.35);
    soundRigGroup.add(post);

    if (idx < stanchionX.length - 1) {
      const nextX = stanchionX[idx + 1];
      const ropePts = [];
      for (let r = 0; r <= 10; r++) {
        const u = r / 10;
        const rx = THREE.MathUtils.lerp(sx, nextX, u);
        const ry = 0.82 - Math.sin(u * Math.PI) * 0.24;
        ropePts.push(new THREE.Vector3(rx, ry, 2.35));
      }
      const ropeCurve = new THREE.CatmullRomCurve3(ropePts);
      const ropeGeo = new THREE.TubeGeometry(ropeCurve, 12, 0.032, 8, false);
      const rope = createHiFiMesh(ropeGeo, 0xd92424, 0.04);
      soundRigGroup.add(rope);
    }
  });

  // 8. Transforming Boombox Truck Cab, Heavy-Duty Wheels, Chrome Exhaust Stacks & Bull-Bar
  const truckCabGroup = new THREE.Group();
  truckCabGroup.position.set(-5.05, 0, -0.15);
  soundRigGroup.add(truckCabGroup);

  const cabBody = createHiFiMesh(new THREE.BoxGeometry(1.75, 2.55, 2.75), 0x1e1934, 0.04);
  cabBody.position.set(0, 1.55, 0);
  truckCabGroup.add(cabBody);

  const cabHood = createHiFiMesh(new THREE.BoxGeometry(1.15, 1.45, 2.60), 0x262040, 0.04);
  cabHood.position.set(-1.35, 1.00, 0);
  truckCabGroup.add(cabHood);

  // Gold Radiator Grille & Chrome Bull-Bar on Front of Truck Hood
  const radiatorGrille = createHiFiMesh(new THREE.BoxGeometry(0.12, 0.92, 1.85), 0xf5b942, 0.03);
  radiatorGrille.position.set(-1.92, 1.02, 0);
  truckCabGroup.add(radiatorGrille);

  // Glowing Amber Truck Headlights
  [-0.98, 0.98].forEach((hz) => {
    const tLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14),
      new THREE.MeshBasicMaterial({ color: 0xffe46b })
    );
    tLight.rotation.z = Math.PI / 2;
    tLight.position.set(-1.94, 1.02, hz);
    truckCabGroup.add(tLight);
  });

  // Twin Vertical Chrome Exhaust Stacks behind Truck Cab
  [-1.15, 1.15].forEach((ez) => {
    const stackPipe = createHiFiMesh(
      new THREE.CylinderGeometry(0.09, 0.11, 3.65, 12),
      0xc4ccdc,
      0.03,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.82, glintIntensity: 1.8 }
    );
    stackPipe.position.set(0.72, 2.65, ez);
    truckCabGroup.add(stackPipe);
  });

  // 6 Heavy-Duty Boombox Truck Tires with Gold Alloy Rims along Chassis Base
  const truckWheelGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.44, 20);
  truckWheelGeo.rotateX(Math.PI / 2);
  const truckRimGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.46, 16);
  truckRimGeo.rotateX(Math.PI / 2);
  [
    [-5.95, 0.58, 1.48],
    [-1.85, 0.58, 1.62],
    [1.85,  0.58, 1.62],
    [3.65,  0.58, 1.62]
  ].forEach(([wx, wy, wz]) => {
    const tire = createHiFiMesh(truckWheelGeo, 0x101016, 0.04);
    tire.position.set(wx, wy, wz);
    soundRigGroup.add(tire);

    const rim = createHiFiMesh(truckRimGeo, 0xf5b942, 0.025);
    rim.position.set(wx, wy, wz + 0.02);
    soundRigGroup.add(rim);
  });

  // 9. Articulated Hydraulic Hinge Arms & Pistons Unfolding the Speaker Wings
  [-1, 1].forEach((side) => {
    [1.85, 4.15].forEach((hy) => {
      const cylOuter = createHiFiMesh(new THREE.CylinderGeometry(0.085, 0.085, 0.85, 10), 0xf5b942, 0.03);
      cylOuter.rotation.z = Math.PI / 2;
      cylOuter.position.set(side * 1.65, hy, 0.85);
      soundRigGroup.add(cylOuter);

      const pistonRod = createHiFiMesh(new THREE.CylinderGeometry(0.048, 0.048, 0.95, 10), 0xc4ccdc, 0.025);
      pistonRod.rotation.z = Math.PI / 2;
      pistonRod.position.set(side * 2.15, hy, 0.85);
      soundRigGroup.add(pistonRod);
    });

    // Gold Corner Bumper Brackets & Bass-Reflex Ports on Wing Cabinets
    [-0.95, 0.95].forEach((cx) => {
      const cornerBracket = createHiFiMesh(new THREE.BoxGeometry(0.24, 0.24, 0.12), 0xf5b942, 0.025);
      cornerBracket.position.set(side * 2.95 + cx, 1.42, 1.24);
      soundRigGroup.add(cornerBracket);
    });
  });

  // 10. Pro DJ Mixer Crossfader Deck & Stage Monitor Wedges on Front Lip
  const mixerBox = createHiFiMesh(new THREE.BoxGeometry(0.62, 0.11, 0.56), 0x14121d, 0.03);
  mixerBox.position.set(0, 2.06, 1.46);
  soundRigGroup.add(mixerBox);

  [-0.18, 0, 0.18].forEach((fx) => {
    const fader = createHiFiMesh(new THREE.BoxGeometry(0.06, 0.03, 0.14), 0xf5b942, 0.015);
    fader.position.set(fx, 2.13, 1.54);
    soundRigGroup.add(fader);
  });

  [-2.65, -1.25, 1.25, 2.65].forEach((mx) => {
    const monWedge = createHiFiMesh(new THREE.BoxGeometry(0.76, 0.36, 0.52), 0x161424, 0.035);
    monWedge.position.set(mx, 0.95, 1.85);
    monWedge.rotation.x = -0.38;
    soundRigGroup.add(monWedge);

    const monTrim = createHiFiMesh(new THREE.BoxGeometry(0.66, 0.26, 0.04), 0x2c2844, 0.02);
    monTrim.position.set(0, 0.04, 0.25);
    monWedge.add(monTrim);
  });

  // 11. Overhead Concert Lighting Box-Truss & 6 Volumetric Spotlight Cones & Floor Pools
  const topTruss = createHiFiMesh(new THREE.BoxGeometry(8.8, 0.28, 0.32), 0x2c3246, 0.035);
  topTruss.position.set(0, 6.82, 0.95);
  soundRigGroup.add(topTruss);

  [-1, 1].forEach((side) => {
    const trussPillar = createHiFiMesh(new THREE.BoxGeometry(0.24, 2.15, 0.24), 0x2c3246, 0.035);
    trussPillar.position.set(side * 4.15, 5.75, 0.95);
    soundRigGroup.add(trussPillar);
  });

  const spotColors = [0xffd54f, 0xff2a85, 0x00f0ff, 0x00f0ff, 0x2979ff, 0xff2a85];
  // Tuned theatrical spotlight geometry: narrow (top 0.16m, bottom 1.35m), length 6.2m
  // rotateX(-Math.PI / 2) places narrow top at can lens (z=0) and expanding bottom towards floor (z=6.2m)
  const volConeGeo = new THREE.CylinderGeometry(0.16, 1.35, 6.2, 24, 1, true);
  volConeGeo.rotateX(-Math.PI / 2);

  const poolGeo = new THREE.PlaneGeometry(3.1, 2.2);
  poolGeo.rotateX(-Math.PI / 2);
  const poolTex = createLightPoolTexture();

  [-3.6, -2.2, -0.9, 0.9, 2.2, 3.6].forEach((sx, sIdx) => {
    const canGroup = new THREE.Group();
    canGroup.position.set(sx, 6.62, 1.08);
    canGroup.rotation.x = 0.70; // Steeper downward pitch aiming directly into asphalt floor pools
    canGroup.rotation.y = sx * 0.08; // Fans outward, keeping center stage, DJ booth, marquee & meters completely clear
    soundRigGroup.add(canGroup);

    const canBody = createHiFiMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.38, 12), 0x141622, 0.03);
    canBody.rotation.x = Math.PI / 2;
    canGroup.add(canBody);

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 14),
      new THREE.MeshBasicMaterial({ color: spotColors[sIdx] })
    );
    lens.position.z = 0.20;
    canGroup.add(lens);

    // Volumetric Additive-Blended Spotlight Beam Cone (Calibrated zero-washout opacity 0.045, FrontSide)
    const coneMat = new THREE.MeshBasicMaterial({
      color: spotColors[sIdx],
      transparent: true,
      opacity: 0.045,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const coneMesh = new THREE.Mesh(volConeGeo, coneMat);
    coneMesh.name = 'spotlight_cone_beam';
    coneMesh.position.z = 3.1;
    canGroup.add(coneMesh);

    // Projected Elliptical Light Pool on Asphalt Floor (Calibrated soft opacity 0.20)
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: spotColors[sIdx],
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.position.set(sx * 1.25, 0.025, 4.3);
    soundRigGroup.add(poolMesh);
  });

  // Static Ground Contact Shadow Decals beneath Transforming Boombox Stage
  const stageTruckContactShadow = createContactShadowDecal(9.2, 3.8, 0.75);
  stageTruckContactShadow.position.set(0, 0.005, 0.5);
  soundRigGroup.add(stageTruckContactShadow);

  [-4.15, 4.15].forEach((tx) => {
    const wingContactShadow = createContactShadowDecal(2.4, 2.4, 0.70);
    wingContactShadow.position.set(tx, 0.005, 0.5);
    soundRigGroup.add(wingContactShadow);
  });

  // Stage road equipment flight cases on stage wings
  [-3.8, 3.8].forEach((fx) => {
    const stageCase = createFlightCase(0.9, 0.7, 0.7, 0x181820, 'KRONOS SOUND');
    stageCase.position.set(fx, 0.35, 1.8);
    stageCase.rotation.y = fx > 0 ? -0.2 : 0.2;
    soundRigGroup.add(stageCase);
  });

  let lastUpdateTime = performance.now();
  let canvasUpdateAccum = 1.0;

  function updateStageDisplays(freqData, bass, beatPulse, dtArg) {
    const now = performance.now();
    const dt = dtArg !== undefined ? dtArg : Math.min((now - lastUpdateTime) * 0.001, 0.05) || 0.016;
    lastUpdateTime = now;

    const targetL = -0.75 + Math.min(1.50, Math.pow(bass * 1.15 + beatPulse * 0.40, 1.2) * 1.35);
    const rightHighEnergy = freqData ? (freqData[12] || 100) / 255 : 0.4;
    const targetR = -0.75 + Math.min(1.50, Math.pow(bass * 0.95 + rightHighEnergy * 0.65, 1.2) * 1.35);

    const safeDt = Math.min(dt, 0.033);
    const aL = kSpring * (targetL - vuBallistics.angleL) - cDamp * vuBallistics.velL;
    vuBallistics.velL += aL * safeDt;
    vuBallistics.angleL += vuBallistics.velL * safeDt;

    const aR = kSpring * (targetR - vuBallistics.angleR) - cDamp * vuBallistics.velR;
    vuBallistics.velR += aR * safeDt;
    vuBallistics.angleR += vuBallistics.velR * safeDt;

    brassHorns.forEach(({ hGroup, baseScale }) => {
      const pump = baseScale * (1.0 + beatPulse * 0.08 + bass * 0.06);
      hGroup.scale.setScalar(pump);
    });

    // Throttled to <= 20 Hz (0.055s = 18.18 Hz) with zero ctx.shadowBlur in per-frame EQ/VU canvas redraws
    const STAGE_DISPLAY_THROTTLE_SEC = 0.055;
    canvasUpdateAccum += safeDt;
    if (canvasUpdateAccum < STAGE_DISPLAY_THROTTLE_SEC) return;
    canvasUpdateAccum = 0;

    // A. Update 20-Column Segmented Equalizer Display
    eqCtx.fillStyle = '#080812';
    eqCtx.fillRect(0, 0, 1024, 384);

    for (let c = 0; c < numCols; c++) {
      let rawVal = 0.45;
      if (freqData && freqData.length > 0) {
        const binIdx = Math.floor(Math.pow(c / numCols, 1.4) * (freqData.length * 0.65));
        rawVal = freqData[binIdx] / 255;
      }
      const centerFactor = 1.0 - Math.abs(c - numCols * 0.45) / (numCols * 0.7);
      const targetAmp = Math.min(1.0, rawVal * 0.82 + centerFactor * 0.32 + beatPulse * 0.28);
      const activeSegs = Math.max(1, Math.floor(targetAmp * numSegs));

      if (activeSegs >= peakLevels[c]) {
        peakLevels[c] = activeSegs;
        peakHoldTimers[c] = 12;
      } else {
        if (peakHoldTimers[c] > 0) {
          peakHoldTimers[c]--;
        } else {
          peakLevels[c] = Math.max(0, peakLevels[c] - 0.35);
        }
      }

      const x = startX + c * (colW + colGap);

      for (let s = 0; s < numSegs; s++) {
        const y = baseY - s * (segH + segGap);
        const isActive = s < activeSegs;

        if (isActive) {
          if (s < 4) {
            eqCtx.fillStyle = '#00f5ff';
          } else if (s < 8) {
            eqCtx.fillStyle = '#2ef064';
          } else if (s < 11) {
            eqCtx.fillStyle = '#ffdd00';
          } else {
            eqCtx.fillStyle = '#ff204e';
          }
          eqCtx.fillRect(x, y, colW, segH);
        } else {
          eqCtx.fillStyle = '#101422';
          eqCtx.fillRect(x, y, colW, segH);
          eqCtx.strokeStyle = 'rgba(28, 38, 58, 0.6)';
          eqCtx.lineWidth = 1;
          eqCtx.strokeRect(x + 0.5, y + 0.5, colW - 1, segH - 1);
        }
      }

      const pIdx = Math.floor(peakLevels[c]);
      if (pIdx > 0 && pIdx < numSegs) {
        const py = baseY - pIdx * (segH + segGap);
        eqCtx.fillStyle = '#ffffff';
        eqCtx.fillRect(x, py, colW, 4);
      }
    }
    eqTex.needsUpdate = true;

    // B. Update Dual Analog VU Meters with Cached Radial Gradients
    vuCtx.fillStyle = '#100d1c';
    vuCtx.fillRect(0, 0, 1024, 360);

    const vuCenters = [
      { cx: 256, label: 'CH-L // MASTER', angle: vuBallistics.angleL, grad: cachedVuGradL },
      { cx: 768, label: 'CH-R // BASS', angle: vuBallistics.angleR, grad: cachedVuGradR }
    ];

    vuCenters.forEach(({ cx, label, angle, grad }) => {
      vuCtx.fillStyle = grad;
      vuCtx.fillRect(cx - 225, 20, 450, 315);

      vuCtx.lineWidth = 8;
      vuCtx.strokeStyle = '#08060e';
      vuCtx.strokeRect(cx - 225, 20, 450, 315);

      const cy = 310;
      const rScale = 195;

      // Normal Arc (-20 dB to 0 dB)
      vuCtx.strokeStyle = '#0a0812';
      vuCtx.lineWidth = 5;
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, rScale, -Math.PI * 0.5 - 0.75, -Math.PI * 0.5 + 0.28);
      vuCtx.stroke();

      // Red Overload Arc (0 dB to +3 dB)
      vuCtx.strokeStyle = '#d62020';
      vuCtx.lineWidth = 8;
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, rScale, -Math.PI * 0.5 + 0.28, -Math.PI * 0.5 + 0.72);
      vuCtx.stroke();

      const ticks = [
        { a: -0.75, txt: '-20' },
        { a: -0.52, txt: '-10' },
        { a: -0.32, txt: '-7' },
        { a: -0.15, txt: '-5' },
        { a: 0.05, txt: '-3' },
        { a: 0.28, txt: '0' },
        { a: 0.50, txt: '+1' },
        { a: 0.72, txt: '+3' }
      ];

      vuCtx.font = 'bold 15px monospace';
      vuCtx.textAlign = 'center';

      ticks.forEach(({ a, txt }) => {
        const rad = -Math.PI * 0.5 + a;
        const x1 = cx + Math.cos(rad) * (rScale - 4);
        const y1 = cy + Math.sin(rad) * (rScale - 4);
        const x2 = cx + Math.cos(rad) * (rScale + 12);
        const y2 = cy + Math.sin(rad) * (rScale + 12);
        const isRed = a >= 0.28;

        vuCtx.strokeStyle = isRed ? '#d62020' : '#0c0a14';
        vuCtx.lineWidth = isRed ? 4 : 3;
        vuCtx.beginPath();
        vuCtx.moveTo(x1, y1);
        vuCtx.lineTo(x2, y2);
        vuCtx.stroke();

        const tx = cx + Math.cos(rad) * (rScale - 22);
        const ty = cy + Math.sin(rad) * (rScale - 22);
        vuCtx.fillStyle = isRed ? '#a61212' : '#0c0a14';
        vuCtx.fillText(txt, tx, ty);
      });

      vuCtx.font = '900 28px serif';
      vuCtx.fillStyle = '#0c0a14';
      vuCtx.fillText('VU', cx, 155);

      vuCtx.font = 'bold 13px sans-serif';
      vuCtx.fillStyle = '#3a2e10';
      vuCtx.fillText(label, cx, 185);

      // Bouncing needle with soft drop shadow
      const nRad = -Math.PI * 0.5 + angle;
      const nLen = 205;

      vuCtx.strokeStyle = 'rgba(60, 35, 10, 0.35)';
      vuCtx.lineWidth = 5;
      vuCtx.beginPath();
      vuCtx.moveTo(cx + 4, cy + 4);
      vuCtx.lineTo(cx + Math.cos(nRad) * nLen + 4, cy + Math.sin(nRad) * nLen + 4);
      vuCtx.stroke();

      vuCtx.strokeStyle = '#08060d';
      vuCtx.lineWidth = 4;
      vuCtx.beginPath();
      vuCtx.moveTo(cx, cy);
      vuCtx.lineTo(cx + Math.cos(nRad) * nLen, cy + Math.sin(nRad) * nLen);
      vuCtx.stroke();

      vuCtx.fillStyle = '#0c0a14';
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, 18, 0, Math.PI * 2);
      vuCtx.fill();
      vuCtx.fillStyle = '#9e96aa';
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, 6, 0, Math.PI * 2);
      vuCtx.fill();
    });
    vuTex.needsUpdate = true;

  }

  turntablePlatters.forEach((p) => mergeStaticGroupMeshes(p));
  wooferCones.forEach((w) => mergeStaticGroupMeshes(w));
  brassHorns.forEach(({ hGroup }) => mergeStaticGroupMeshes(hGroup));

  const preservedStageSet = new Set([
    ...turntablePlatters,
    ...wooferCones,
    ...brassHorns.map((h) => h.hGroup),
    eqScreen,
    vuPanel,
    marqueePlane
  ]);
  mergeStaticGroupMeshes(soundRigGroup, (obj) => preservedStageSet.has(obj));

  return {
    soundRigGroup,
    leftWingTower,
    rightWingTower,
    wooferCones,
    platters: turntablePlatters,
    updateStageDisplays
  };
}


export const createBoomboxStage = buildBoomboxStage;
