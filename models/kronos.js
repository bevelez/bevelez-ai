import * as THREE from 'three';
import {
  setFighterShadowScope,
  createCelMaterial,
  createHiFiMesh,
  createOutlineMaterial,
  createSculptedLoftGeometry,
  drawOnBackSeam,
  optimizeArticulatedRigBones,
  createContactShadowDecal
} from './shared.js?v=20261018t';

// ============================================================================
// PROCEDURAL CANVAS TEXTURE GENERATORS FOR BOSS DJ KRONOS
// ============================================================================

/**
 * Generates high-res Cyber/Polynesian Tribal Tattoo Sleeve Texture (512x512)
 * Designed to wrap around cylindrical arm & deltoid geometries.
 */
export function createKronosTattooTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Warm bronze skin base (#8d5534)
  ctx.fillStyle = '#8d5534';
  ctx.fillRect(0, 0, 512, 512);

  // Inky dark charcoal/black tattoo lines (#120e16)
  ctx.fillStyle = '#120e16';
  ctx.strokeStyle = '#120e16';
  ctx.lineWidth = 5;

  // 1. Deltoid Band: Polynesian Spearhead Chevrons (Top row)
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 16, 55);
    ctx.lineTo(x + 32, 20);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x + 16, 95);
    ctx.lineTo(x + 32, 60);
    ctx.fill();
  }

  // 2. Mid-Bicep: Concentric Audio/Vinyl Wave Spirals & Sawtooth Bands
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 180, 50, 0, Math.PI * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 180, 32, 0, Math.PI * 1.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(384, 180, 50, Math.PI * 0.4, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(384, 180, 32, Math.PI * 0.5, Math.PI * 2);
  ctx.stroke();

  // 3. Cybernetic Circuit Bus Traces with Junction Nodes (Center)
  ctx.lineWidth = 4;
  const circuitPaths = [
    [[0, 240], [140, 240], [180, 280], [330, 280], [370, 240], [512, 240]],
    [[0, 310], [90, 310], [130, 350], [380, 350], [420, 310], [512, 310]],
    [[60, 240], [60, 310]],
    [[256, 280], [256, 380]],
    [[450, 240], [450, 310]]
  ];
  circuitPaths.forEach((pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  });

  // Circular circuit via nodes
  const nodes = [[140, 240], [370, 240], [130, 350], [380, 350], [256, 380], [60, 275], [450, 275]];
  nodes.forEach(([nx, ny]) => {
    ctx.beginPath();
    ctx.arc(nx, ny, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d5534';
    ctx.beginPath();
    ctx.arc(nx, ny, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#120e16';
  });

  // 4. Lower Forearm: Geometric Enata Diamond Band & Solid Cuffs
  ctx.fillRect(0, 420, 512, 18);
  ctx.fillRect(0, 475, 512, 24);

  for (let x = 0; x < 512; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x + 18, 442);
    ctx.lineTo(x + 28, 456);
    ctx.lineTo(x + 18, 470);
    ctx.lineTo(x + 8, 456);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Generates Solid Gold Vinyl Record Medallion Texture (512x512)
 * Features concentric vinyl audio grooves and gold record center label.
 */
export function createGoldVinylDiscTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Rich Metallic Gold Radial Sheen Base (saturated deep gold)
  const grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 250);
  grad.addColorStop(0.0, '#ffd84d');
  grad.addColorStop(0.30, '#f0b828');
  grad.addColorStop(0.65, '#c98e16');
  grad.addColorStop(1.0, '#784805');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();

  // 32 Concentric Circular Vinyl Micro-Grooves with Deep Contrast
  for (let r = 72; r < 246; r += 5.5) {
    const isMajor = r % 22 === 0;
    ctx.strokeStyle = isMajor ? 'rgba(30, 16, 4, 0.90)' : 'rgba(50, 28, 8, 0.65)';
    ctx.lineWidth = isMajor ? 2.8 : 1.6;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer Rim Bevel Ring
  ctx.strokeStyle = '#ffe480';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(256, 256, 246, 0, Math.PI * 2);
  ctx.stroke();

  // Center Record Label: Outer Gold Ring (radius = 68px)
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.arc(256, 256, 68, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#181216';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Inner Crimson Vinyl Center Label (radius = 56px)
  ctx.fillStyle = '#8f141c';
  ctx.beginPath();
  ctx.arc(256, 256, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f5c238';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Micro-Text on Center Label
  ctx.fillStyle = '#ffd54f';
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DJ KRONOS', 256, 234);
  ctx.font = '700 8.5px sans-serif';
  ctx.fillText('33⅓ RPM • MASTER', 256, 247);

  // Spindle Hole Brass Grommet & Center Spindle Hole
  ctx.fillStyle = '#f5c238';
  ctx.beginPath();
  ctx.arc(256, 256, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#100c10';
  ctx.beginPath();
  ctx.arc(256, 256, 12, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const createVinylMedallionTexture = createGoldVinylDiscTexture;

/**
 * Generates Crimson Duster Gold Flame Trim Texture (512x256)
 * Comic hot rod flame tongues licking upward from the bottom hem.
 */
export function createFlameTrimTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Deep crimson coat base (#a81824)
  ctx.fillStyle = '#a81824';
  ctx.fillRect(0, 0, 512, 256);

  // Outer Gold Comic Flame Tongues (#ffd233) with black contour outline
  ctx.fillStyle = '#ffd233';
  ctx.strokeStyle = '#140c12';
  ctx.lineWidth = 6;

  function drawFlameTongues(yBase, hScale) {
    ctx.beginPath();
    ctx.moveTo(0, 256);
    const tongueCount = 8;
    const w = 512 / tongueCount;
    for (let i = 0; i < tongueCount; i++) {
      const x0 = i * w;
      const xMid = x0 + w * 0.5;
      const x1 = x0 + w;
      const flameTipY = yBase - ((i % 2 === 0) ? 90 : 60) * hScale;
      ctx.quadraticCurveTo(x0 + w * 0.2, yBase, xMid - 4, flameTipY + 25);
      ctx.quadraticCurveTo(xMid, flameTipY, xMid + 6, flameTipY + 25);
      ctx.quadraticCurveTo(x1 - w * 0.2, yBase, x1, 256);
    }
    ctx.lineTo(512, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw primary gold flame tier
  drawFlameTongues(220, 1.4);

  // Inner Electric Yellow Core Tier (#fff380)
  ctx.fillStyle = '#fff380';
  ctx.lineWidth = 3;
  drawFlameTongues(235, 0.9);

  // Bottom gold hem seam
  ctx.fillStyle = '#ffd233';
  ctx.fillRect(0, 242, 512, 14);
  ctx.strokeRect(0, 242, 512, 14);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ============================================================================
// UPGRADED BOSS DJ KRONOS PROCEDURAL 3D MODEL
// 100% 1:1 Parity with boss_dj_kronos_turnaround_1792120739087.jpg!
// Local Frame: Front = +Z, Back = -Z, Kronos Right Side = -X (Viewer's Left in View 1)
// ============================================================================

export function createBossVestEmblemTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 1024);
  drawKronosCrownAndTurntable(ctx, 512, 512, 1.25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export const createKronosBackEmblemTexture = createBossVestEmblemTexture;

function drawKronosCrownAndTurntable(ctx, cx, cy, scale = 1.0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // 1. Five-Point Metallic Gold Crown at Top (y = -135)
  ctx.save();
  ctx.translate(0, -115);

  ctx.fillStyle = '#f5c238';
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';

  // Crown 5-spike body
  ctx.beginPath();
  ctx.moveTo(-92, 26);
  ctx.lineTo(-108, -32);
  ctx.lineTo(-56, 8);
  ctx.lineTo(-34, -54);
  ctx.lineTo(0, 10);
  ctx.lineTo(0, -72);
  ctx.lineTo(0, 10);
  ctx.lineTo(34, -54);
  ctx.lineTo(56, 8);
  ctx.lineTo(108, -32);
  ctx.lineTo(92, 26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Tip pearls on the 5 crown points
  [
    [-108, -36],
    [-34, -58],
    [0, -76],
    [34, -58],
    [108, -36]
  ].forEach(([px, py]) => {
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Crown base band
  ctx.fillStyle = '#e0a828';
  ctx.fillRect(-92, 24, 184, 18);
  ctx.strokeRect(-92, 24, 184, 18);
  ctx.restore();

  // 2. Isometric Gold DJ Turntable Deck Below Crown (y = +45)
  ctx.save();
  ctx.translate(0, 48);

  // Trapezoidal isometric deck plinth (wider at bottom than top, matching View 4 reference!)
  ctx.fillStyle = '#e8b532';
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 7.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-124, -82);
  ctx.lineTo(124, -82);
  ctx.lineTo(142, 74);
  ctx.lineTo(-142, 74);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front 3D thickness lip of turntable plinth
  ctx.fillStyle = '#b88418';
  ctx.beginPath();
  ctx.moveTo(-142, 74);
  ctx.lineTo(142, 74);
  ctx.lineTo(136, 94);
  ctx.lineTo(-136, 94);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Concentric Gold Vinyl Platter on Left/Center of Deck
  ctx.fillStyle = '#f5c842';
  ctx.beginPath();
  ctx.ellipse(-18, -4, 82, 66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  [64, 48, 34].forEach((rx) => {
    ctx.strokeStyle = '#181216';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(-18, -4, rx, rx * 0.80, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Dark Crimson Center Vinyl Label & Gold Spindle
  ctx.fillStyle = '#7a1419';
  ctx.beginPath();
  ctx.ellipse(-18, -4, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f5c842';
  ctx.beginPath();
  ctx.arc(-18, -4, 5, 0, Math.PI * 2);
  ctx.fill();

  // Tonearm Pivot & S-Shaped Gold Tonearm on Right of Platter
  ctx.fillStyle = '#b88418';
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(82, -46, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(82, -46);
  ctx.quadraticCurveTo(76, 4, 34, 28);
  ctx.stroke();

  ctx.strokeStyle = '#ffe680';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Pitch Fader Slot on Bottom-Right
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(106, -10);
  ctx.lineTo(114, 52);
  ctx.stroke();
  ctx.fillStyle = '#141014';
  ctx.fillRect(98, 16, 24, 10);

  ctx.restore();
  ctx.restore();
}

let _kronosHeadTex = null;
function createKronosHeadUVTexture() {
  if (_kronosHeadTex) return _kronosHeadTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Exact Linear Y-UV Calibration for 12-Slice Master Head (yMin = -0.150, yMax = +0.160, ySpan = 0.310):
  // - Chin tip (y = -0.150) -> py = 1024
  // - Broad square goatee (y = -0.150..-0.095) -> py = 842..1024
  // - Mouth & Lips (y = -0.065) -> py = 743
  // - Mustache & Philtrum (y = -0.045..-0.030) -> py = 644..677
  // - Sculpted Nose Bridge (y = -0.030..+0.010) -> py = 496..628
  // - Vertical Midline Sunglasses (y = +0.012) -> py = 490
  // - Eyebrows & Brow Ridge (y = +0.035) -> py = 413
  // - Forehead Razor Line-Up (y = +0.080) -> py = 265
  // - High-Top Flat-Top Fade Crown (y = +0.160) -> py = 0

  // 1. Rich Warm Bronze Skin Base (#b87348)
  ctx.fillStyle = '#b87348';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle cheekbone / forehead warm bronze highlight (#ce885b)
  const faceGlow = ctx.createRadialGradient(512, 510, 25, 512, 530, 240);
  faceGlow.addColorStop(0, '#ce885b');
  faceGlow.addColorStop(0.65, '#c27b4f');
  faceGlow.addColorStop(1, 'rgba(184, 115, 72, 0)');
  ctx.fillStyle = faceGlow;
  ctx.fillRect(240, 250, 544, 540);

  // 2. HIGH-TOP FLAT-TOP FADE HAIR & TEMPLE/NAPE SKIN-FADE GRADIENT (Top of UV py = 0..450)
  // Deep jet-black crown transitioning through dark espresso to warm bronze skin
  const fadeGrad = ctx.createLinearGradient(0, 180, 0, 450);
  fadeGrad.addColorStop(0.0, '#101014');
  fadeGrad.addColorStop(0.35, '#16141a');
  fadeGrad.addColorStop(0.65, '#2c1b16');
  fadeGrad.addColorStop(0.85, '#5c3320');
  fadeGrad.addColorStop(0.95, '#8c5334');
  fadeGrad.addColorStop(1.0, 'rgba(184, 115, 72, 0.0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, 0, 1024, 450);

  // High-top hair side and back texture (stippled graphic-novel hair density)
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, 1024, 250);

  // Crisp horizontal front forehead hairline & razor-sharp temple drops (x = 380..644, py = 265..375)
  ctx.fillStyle = '#c47c50';
  ctx.fillRect(380, 265, 264, 195);

  // Crisp black comic line along razor-sharp front box line-up
  ctx.strokeStyle = '#101014';
  ctx.lineWidth = 6.0;
  ctx.beginPath();
  ctx.moveTo(380, 265);
  ctx.lineTo(644, 265); // Horizontal brow line-up
  ctx.moveTo(380, 265);
  ctx.lineTo(380, 370); // Right temple vertical drop
  ctx.moveTo(644, 265);
  ctx.lineTo(644, 370); // Left temple vertical drop
  ctx.stroke();

  // Forehead expression crease lines & furrowed brow (py = 330..400)
  ctx.strokeStyle = '#723e20';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(436, 335);
  ctx.quadraticCurveTo(512, 326, 588, 335);
  ctx.moveTo(452, 365);
  ctx.quadraticCurveTo(512, 358, 572, 365);
  // Vertical frown ticks
  ctx.moveTo(496, 372);
  ctx.lineTo(502, 406);
  ctx.moveTo(528, 372);
  ctx.lineTo(522, 406);
  ctx.stroke();

  // Thick Angled Dark Eyebrows above Sunglasses Brow Bar (py = 405..428, x = 512 ± 92)
  ctx.fillStyle = '#121014';
  [-1, 1].forEach((dir) => {
    const bx = 512 + dir * 92;
    ctx.beginPath();
    ctx.moveTo(bx - dir * 54, 412);
    ctx.quadraticCurveTo(bx, 388, bx + dir * 56, 404);
    ctx.lineTo(bx + dir * 50, 422);
    ctx.quadraticCurveTo(bx, 406, bx - dir * 48, 425);
    ctx.closePath();
    ctx.fill();
  });

  // Cheekbone & Nasolabial Contour Creases (x = 512 ± 115, py = 560..710)
  ctx.strokeStyle = '#743d22';
  ctx.lineWidth = 5.0;
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(512 + dir * 118, 560);
    ctx.quadraticCurveTo(512 + dir * 96, 635, 512 + dir * 86, 700);
    ctx.stroke();
  });

  // Broad Sculpted Nose Bridge & Nostril Wings (x = 512, py = 500..635)
  ctx.fillStyle = '#ce885b';
  ctx.fillRect(488, 500, 48, 120);
  ctx.strokeStyle = '#381c0e';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(482, 515);
  ctx.lineTo(466, 615);
  ctx.quadraticCurveTo(489, 636, 512, 636);
  ctx.quadraticCurveTo(535, 636, 558, 615);
  ctx.lineTo(542, 515);
  ctx.stroke();

  // 3. MANICURED CONTOURED CIRCLE-BEARD GOATEE, MUSTACHE & CONFIDENT BOSS SMIRK
  // Feathered groomed edge stubble fringe + tapered anatomical chin wrap (eliminating solid black block)
  ctx.save();
  // Soft feathered edge stubble fringe (shadowBlur creates organic hair falloff)
  ctx.shadowColor = 'rgba(18, 16, 20, 0.65)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#121014';

  // Manicured outer goatee contour: gracefully curves around mouth and tapers inward to chin apex
  ctx.beginPath();
  // Mustache top with subtle philtrum notch (py = 686)
  ctx.moveTo(512, 686);
  ctx.quadraticCurveTo(565, 672, 624, 712); // Right mustache arch
  // Commissure lateral bar down past corner of mouth (tapers naturally: x = 624 -> 632 -> 620)
  ctx.quadraticCurveTo(632, 765, 620, 830);
  // Tapered chin wrap hugging jaw curve inward toward chin apex (py = 976, x = 512)
  ctx.quadraticCurveTo(602, 915, 554, 962);
  ctx.quadraticCurveTo(512, 976, 470, 962); // Smoothly rounded chin apex
  // Left chin wrap curving up along jaw
  ctx.quadraticCurveTo(422, 915, 404, 830);
  // Left commissure lateral bar up to mustache
  ctx.quadraticCurveTo(392, 765, 400, 712);
  ctx.quadraticCurveTo(459, 672, 512, 686); // Left mustache arch
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Anatomical Mandibular Jawline Stubble Gradient following jaw ramus to sideburns
  [-1, 1].forEach((dir) => {
    const startX = 512 + dir * 105;
    const endX = 512 + dir * 260;
    const stubbleGrad = ctx.createLinearGradient(startX, 860, endX, 810);
    stubbleGrad.addColorStop(0.0, 'rgba(18, 16, 20, 0.55)');
    stubbleGrad.addColorStop(0.4, 'rgba(32, 22, 24, 0.30)');
    stubbleGrad.addColorStop(0.8, 'rgba(72, 42, 30, 0.12)');
    stubbleGrad.addColorStop(1.0, 'rgba(184, 115, 72, 0.0)');
    ctx.fillStyle = stubbleGrad;

    ctx.beginPath();
    ctx.moveTo(512 + dir * 105, 845);
    ctx.quadraticCurveTo(512 + dir * 175, 878, 512 + dir * 260, 836);
    ctx.lineTo(512 + dir * 260, 786);
    ctx.quadraticCurveTo(512 + dir * 175, 818, 512 + dir * 105, 795);
    ctx.closePath();
    ctx.fill();
  });

  // Inner cutout around mouth showing warm bronze skin, framed cleanly (py = 724..832)
  ctx.fillStyle = '#b87348';
  ctx.beginPath();
  ctx.moveTo(436, 730);
  ctx.quadraticCurveTo(512, 716, 588, 730); // Under mustache
  ctx.quadraticCurveTo(598, 765, 584, 824); // Right inner margin
  ctx.quadraticCurveTo(512, 838, 440, 824); // Bottom chin skin channel
  ctx.quadraticCurveTo(426, 765, 436, 730); // Left inner margin
  ctx.closePath();
  ctx.fill();

  // Manicured Soul Patch below lower lip (py = 796..854)
  // Clean tapered landing strip with bronze skin channels on left and right
  ctx.fillStyle = '#121014';
  ctx.beginPath();
  ctx.moveTo(492, 796);
  ctx.lineTo(532, 796);
  ctx.quadraticCurveTo(530, 826, 518, 854);
  ctx.lineTo(506, 854);
  ctx.quadraticCurveTo(494, 826, 492, 796);
  ctx.closePath();
  ctx.fill();

  // Sculpted Upper Bronze Lip (py = 736..760)
  ctx.fillStyle = '#945232';
  ctx.beginPath();
  ctx.moveTo(434, 758);
  ctx.quadraticCurveTo(512, 736, 590, 758);
  ctx.quadraticCurveTo(512, 766, 434, 758);
  ctx.closePath();
  ctx.fill();

  // Full Sculpted Lower Bronze Lip (py = 758..798)
  ctx.fillStyle = '#c8784c';
  ctx.beginPath();
  ctx.moveTo(440, 760);
  ctx.quadraticCurveTo(512, 766, 584, 760);
  ctx.quadraticCurveTo(566, 796, 512, 798);
  ctx.quadraticCurveTo(458, 796, 440, 760);
  ctx.closePath();
  ctx.fill();

  // Confident Boss Smirk Mouth Parting Ink Line (slight upward curl at right corner x = 588)
  ctx.strokeStyle = '#180d08';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(432, 760);
  ctx.quadraticCurveTo(512, 752, 574, 758);
  ctx.lineTo(588, 752); // Smug upward boss smirk curl!
  ctx.stroke();

  // Back of neck / occipital skin creases & clean nape skin fade (View 4, x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    // Nape hair fade arc
    const napeGrad = ctx.createLinearGradient(0, 300, 0, 520);
    napeGrad.addColorStop(0.0, '#101014');
    napeGrad.addColorStop(0.5, '#2c1b16');
    napeGrad.addColorStop(0.85, '#8c5334');
    napeGrad.addColorStop(1.0, 'rgba(184, 115, 72, 0)');
    ctx.fillStyle = napeGrad;
    ctx.beginPath();
    ctx.ellipse(0, 320, 160, 180, 0, 0, Math.PI * 2);
    ctx.fill();

    // Muscular neck trapezius crease lines
    ctx.strokeStyle = '#723e20';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-58, 680);
    ctx.lineTo(-44, 860);
    ctx.moveTo(58, 680);
    ctx.lineTo(44, 860);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosHeadTex = tex;
  return tex;
}

let _kronosTorsoTex = null;
function createKronosTorsoUVTexture() {
  if (_kronosTorsoTex) return _kronosTorsoTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Base Muscular Warm Bronze Skin (#b87348) for Center Front Channel (x = 436..588)
  ctx.fillStyle = '#b87348';
  ctx.fillRect(0, 0, 1024, 1024);

  // Smooth, subtle sternal cleft between pectorals (soft shadow, eliminating dark cross artifact)
  const sternalGlow = ctx.createLinearGradient(0, 180, 0, 420);
  sternalGlow.addColorStop(0.0, 'rgba(110, 52, 22, 0.0)');
  sternalGlow.addColorStop(0.5, 'rgba(110, 52, 22, 0.35)');
  sternalGlow.addColorStop(1.0, 'rgba(110, 52, 22, 0.55)');
  ctx.fillStyle = sternalGlow;
  ctx.fillRect(508, 180, 8, 230);

  // Linea Alba Groove below pectorals down to navel
  const albaGrad = ctx.createLinearGradient(0, 410, 0, 840);
  albaGrad.addColorStop(0.0, '#753918');
  albaGrad.addColorStop(0.5, '#6b3316');
  albaGrad.addColorStop(1.0, '#542812');
  ctx.fillStyle = albaGrad;

  ctx.beginPath();
  ctx.moveTo(508, 410);
  ctx.lineTo(516, 410);
  ctx.lineTo(518, 540);
  ctx.lineTo(517, 665);
  ctx.lineTo(512, 825);
  ctx.lineTo(507, 665);
  ctx.lineTo(506, 540);
  ctx.closePath();
  ctx.fill();

  // Pectoral Muscle Plates (Upper Chest, y = 180..415)
  // Warm golden-bronze upper pectoral highlights
  [-1, 1].forEach((dir) => {
    const px = 512 + dir * 42;
    const pecGlow = ctx.createRadialGradient(px, 280, 15, px, 290, 75);
    pecGlow.addColorStop(0, '#d89162');
    pecGlow.addColorStop(0.75, 'rgba(216, 145, 98, 0.45)');
    pecGlow.addColorStop(1, 'rgba(184, 115, 72, 0)');
    ctx.fillStyle = pecGlow;
    ctx.beginPath();
    ctx.ellipse(px, 295, 46, 68, dir * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });

  // Contoured Sub-Pectoral Shadow Creases (y = 390..425)
  [-1, 1].forEach((dir) => {
    ctx.fillStyle = '#6e3314';
    ctx.beginPath();
    ctx.moveTo(512, 396);
    ctx.quadraticCurveTo(512 + dir * 32, 422, 512 + dir * 68, 412);
    ctx.quadraticCurveTo(512 + dir * 78, 404, 512 + dir * 88, 388);
    ctx.quadraticCurveTo(512 + dir * 68, 396, 512 + dir * 32, 408);
    ctx.closePath();
    ctx.fill();

    // Crisp comic ink contour along lower pec margin
    ctx.strokeStyle = '#180d08';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(512, 395);
    ctx.quadraticCurveTo(512 + dir * 32, 420, 512 + dir * 68, 410);
    ctx.quadraticCurveTo(512 + dir * 78, 402, 512 + dir * 88, 386);
    ctx.stroke();
  });

  // 3 Distinct Rows of 6-Pack Abdominals (y = 430..815)
  const abRows = [
    { yTop: 436, h: 102, w: 56, rx: 12, hlH: 52 }, // Row 1 (upper abs)
    { yTop: 554, h: 104, w: 58, rx: 14, hlH: 54 }, // Row 2 (mid abs)
    { yTop: 672, h: 108, w: 54, rx: 16, hlH: 56 }  // Row 3 (lower abs)
  ];

  abRows.forEach(({ yTop, h, w, rx, hlH }) => {
    [-1, 1].forEach((dir) => {
      const cx = 512 + dir * (w * 0.5 + 7);
      const left = cx - w * 0.5;

      // 1. Deep bronze drop shadow under and around each block
      ctx.fillStyle = '#6e3314';
      ctx.beginPath();
      ctx.roundRect(left - 2, yTop + h - 22, w + 4, 24, [0, 0, rx, rx]);
      ctx.fill();

      // 2. Base ab block contour with soft bronze midtone
      ctx.fillStyle = '#c07a4e';
      ctx.beginPath();
      ctx.roundRect(left, yTop + 4, w, h - 8, rx);
      ctx.fill();

      // 3. Warm golden-bronze volumetric highlight on upper face
      const abGlow = ctx.createLinearGradient(0, yTop + 4, 0, yTop + hlH);
      abGlow.addColorStop(0.0, '#e09a6c');
      abGlow.addColorStop(0.7, '#cf8758');
      abGlow.addColorStop(1.0, 'rgba(207, 135, 88, 0)');
      ctx.fillStyle = abGlow;
      ctx.beginPath();
      ctx.roundRect(left + 3, yTop + 6, w - 6, hlH, [rx - 2, rx - 2, 4, 4]);
      ctx.fill();

      // 4. Crisp black comic ink contour outline for each ab block
      ctx.strokeStyle = '#180d08';
      ctx.lineWidth = 5.0;
      ctx.beginPath();
      ctx.roundRect(left, yTop + 4, w, h - 8, rx);
      ctx.stroke();
    });
  });

  // Deep Navel / Belly Button Teardrop Crease
  ctx.fillStyle = '#140a06';
  ctx.beginPath();
  ctx.ellipse(512, 664, 7, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6e3314';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(512, 660, 9, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  // Lateral Serratus Anterior & Oblique Muscle Ribs (x = 420..440 and x = 584..604)
  [-1, 1].forEach((dir) => {
    [480, 560, 640].forEach((sy) => {
      ctx.strokeStyle = '#6e3314';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(512 + dir * 68, sy);
      ctx.lineTo(512 + dir * 88, sy + 18);
      ctx.stroke();

      ctx.strokeStyle = '#180d08';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(512 + dir * 70, sy + 2);
      ctx.lineTo(512 + dir * 86, sy + 18);
      ctx.stroke();
    });
  });

  // 2. Sleeveless Crimson-Red Bomber Vest Shell (#b81d24)
  // Covers x = 0..438 and x = 586..1024 from top (y = 0) down to gold waist hem (y = 825)
  ctx.fillStyle = '#b81d24';
  ctx.fillRect(0, 0, 438, 825);
  ctx.fillRect(586, 0, 438, 825);

  // Darker crimson cel-shaded side panels & vertical seam lines (around x = 256 and x = 768)
  ctx.fillStyle = '#92151c';
  ctx.fillRect(205, 80, 102, 745);
  ctx.fillRect(717, 80, 102, 745);

  // 3. Metallic Gold Vertical Front Zipper Trim Borders (x = 420..442 and x = 582..604)
  const goldGradV = ctx.createLinearGradient(0, 0, 0, 825);
  goldGradV.addColorStop(0.0, '#ffe885');
  goldGradV.addColorStop(0.5, '#f0bc32');
  goldGradV.addColorStop(1.0, '#c89218');
  ctx.fillStyle = goldGradV;
  ctx.fillRect(422, 65, 22, 865);
  ctx.fillRect(580, 65, 22, 865);

  ctx.strokeStyle = '#140e10';
  ctx.lineWidth = 6.5;
  ctx.strokeRect(422, 65, 22, 865);
  ctx.strokeRect(580, 65, 22, 865);

  // Horizontal zipper tooth ticks along the gold zipper trim
  ctx.lineWidth = 3;
  for (let zy = 95; zy < 915; zy += 22) {
    ctx.beginPath();
    ctx.moveTo(424, zy);
    ctx.lineTo(442, zy);
    ctx.moveTo(582, zy);
    ctx.lineTo(600, zy);
    ctx.stroke();
  }

  // 4. Segmented Metallic Gold Bottom Waistband Hem (y = 825..925, Open at Center Front x = 442..582!)
  const goldGradH = ctx.createLinearGradient(0, 825, 0, 925);
  goldGradH.addColorStop(0.0, '#ffe885');
  goldGradH.addColorStop(0.55, '#f2be35');
  goldGradH.addColorStop(1.0, '#b88214');
  ctx.fillStyle = goldGradH;
  ctx.fillRect(0, 825, 444, 98);
  ctx.fillRect(580, 825, 444, 98);

  ctx.strokeStyle = '#140e10';
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.lineTo(444, 825);
  ctx.moveTo(580, 825);
  ctx.lineTo(1024, 825);
  ctx.moveTo(0, 923);
  ctx.lineTo(444, 923);
  ctx.moveTo(580, 923);
  ctx.lineTo(1024, 923);
  ctx.stroke();

  // Vertical ribbed seam lines on the gold waistband hem
  ctx.lineWidth = 4;
  [180, 320, 412, 612, 704, 844].forEach((wx) => {
    ctx.beginPath();
    ctx.moveTo(wx, 825);
    ctx.lineTo(wx, 923);
    ctx.stroke();
  });

  // 5. Angled Metallic Gold Slash Pocket Welts on Front Left & Right Panels (Views 1, 2, 3)
  [
    { x0: 382, y0: 565, x1: 318, y1: 715 }, // Viewer's left panel angled gold welt
    { x0: 642, y0: 565, x1: 706, y1: 715 }  // Viewer's right panel angled gold welt
  ].forEach(({ x0, y0, x1, y1 }) => {
    ctx.strokeStyle = '#140e10';
    ctx.lineWidth = 24;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.strokeStyle = '#f5c438';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  });

  // 6. Contoured Gold Armhole Trim along Left (x = 768) & Right (x = 256) Shoulder Seams
  [256, 768].forEach((ax) => {
    ctx.fillStyle = '#181418';
    ctx.beginPath();
    ctx.ellipse(ax, 235, 36, 138, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 18;
    ctx.strokeStyle = '#140e10';
    ctx.stroke();

    ctx.lineWidth = 11;
    ctx.strokeStyle = '#f5c438';
    ctx.stroke();
  });

  // 7. VIEW 4 BACK EMBLEM: Metallic Gold 5-Point Crown + Isometric Gold DJ Turntable Deck
  drawOnBackSeam(ctx, () => {
    // Subtle crimson cloth drape folds near bottom of back vest
    ctx.strokeStyle = '#6e0d12';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-160, 770);
    ctx.quadraticCurveTo(0, 805, 160, 770);
    ctx.stroke();

    // CENTERED PROPORTIONAL METALLIC GOLD CROWN + TURNTABLE EMBLEM
    // Boldly fills ~70% of the crimson vest back panel while compensating for cylindrical UV stretch!
    ctx.save();
    ctx.translate(0, 485);
    ctx.scale(1.48, 1.78);
    drawKronosCrownAndTurntable(ctx, 0, 0, 1.0);
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosTorsoTex = tex;
  return tex;
}

let _kronosPelvisTex = null;
function createKronosPelvisUVTexture() {
  if (_kronosPelvisTex) return _kronosPelvisTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark Slate-Charcoal Cargo Pants Base (#313e45)
  ctx.fillStyle = '#313e45';
  ctx.fillRect(0, 0, 1024, 512);

  // Clean Fitted Dark-Slate Waistband at Top (y = 12..112, NO gold buckle, NO hip chain!)
  ctx.fillStyle = '#29343b';
  ctx.fillRect(0, 12, 1024, 100);

  ctx.strokeStyle = '#11161a';
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(1024, 12);
  ctx.moveTo(0, 112);
  ctx.lineTo(1024, 112);
  ctx.stroke();

  // Center Front Waistband Button & Fly Seam (x = 512)
  ctx.fillStyle = '#9aa4ad';
  ctx.beginPath();
  ctx.arc(512, 62, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Dark Slate Belt Loops
  [140, 310, 435, 589, 714, 884].forEach((lx) => {
    ctx.fillStyle = '#242e34';
    ctx.fillRect(lx - 12, 8, 24, 110);
    ctx.strokeRect(lx - 12, 8, 24, 110);
  });

  // Front Fly J-Stitch, Crotch Creases & Slash Pockets (x = 512)
  ctx.strokeStyle = '#11161a';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(512, 112);
  ctx.lineTo(512, 425);
  ctx.moveTo(512, 112);
  ctx.lineTo(484, 112);
  ctx.lineTo(484, 355);
  ctx.quadraticCurveTo(484, 395, 512, 405);
  // Front slash pockets
  ctx.moveTo(418, 115);
  ctx.lineTo(315, 285);
  ctx.moveTo(606, 115);
  ctx.lineTo(709, 285);
  // Crotch fold lines
  ctx.moveTo(445, 385);
  ctx.lineTo(512, 445);
  ctx.lineTo(579, 385);
  ctx.stroke();

  // View 4 Back Center Seam & Shield-Shaped Rear Patch Pockets (x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.strokeStyle = '#11161a';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(0, 112);
    ctx.lineTo(0, 475);
    ctx.stroke();

    [-92, 92].forEach((px) => {
      ctx.fillStyle = '#283339';
      ctx.beginPath();
      ctx.moveTo(px - 56, 165);
      ctx.lineTo(px + 56, 165);
      ctx.lineTo(px + 50, 335);
      ctx.lineTo(px, 382);
      ctx.lineTo(px - 50, 335);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(px - 54, 212);
      ctx.lineTo(px, 228);
      ctx.lineTo(px + 54, 212);
      ctx.stroke();
    });
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosPelvisTex = tex;
  return tex;
}

let _kronosPantsLegTex = null;
function createKronosPantsLegUVTexture() {
  if (_kronosPantsLegTex) return _kronosPantsLegTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark Slate-Charcoal Cargo Pants (#313e45)
  ctx.fillStyle = '#313e45';
  ctx.fillRect(0, 0, 512, 512);

  // Deeper slate inner/side shadow folds (#232d33)
  ctx.fillStyle = '#232d33';
  ctx.fillRect(0, 0, 96, 512);
  ctx.fillRect(416, 0, 96, 512);

  // Expressive Comic Cloth Crease Lines at Knee & Gathered Lower Ankle Cuffs
  ctx.strokeStyle = '#11161a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  // Knee folds
  ctx.moveTo(175, 195);
  ctx.quadraticCurveTo(256, 232, 340, 190);
  ctx.moveTo(195, 245);
  ctx.quadraticCurveTo(256, 268, 325, 240);
  // Lower shin baggy chevrons gathered into boot collar
  ctx.moveTo(155, 385);
  ctx.quadraticCurveTo(256, 428, 355, 380);
  ctx.moveTo(175, 445);
  ctx.quadraticCurveTo(256, 482, 335, 440);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosPantsLegTex = tex;
  return tex;
}

export function buildKronosBossModel() {
  setFighterShadowScope(true);
  const root = new THREE.Group();
  root.scale.setScalar(0.58); // Calibrated ~0.58x scale in DJ booth; 1.0x in studio turnaround & Wave 3 ring fight!

  // Grounded dynamic contact shadow decal beneath fighter
  const contactShadowDecal = createContactShadowDecal(1.6, 1.2, 0.52);
  contactShadowDecal.name = 'contact_shadow_decal';
  contactShadowDecal.position.set(0, 0.015, 0);
  root.add(contactShadowDecal);

  const hips = new THREE.Group();
  hips.position.y = 1.04; // Calibrated to 50-slice ground-truth waist/crotch landmark (Total H = 1.94m)
  root.add(hips);

  const SKIN_COLOR = 0xb87348;
  const VEST_RED = 0xb81d24;
  const GOLD_TRIM = 0xf5c238;
  const PANTS_COLOR = 0x313e45;
  const BOOT_BLACK = 0x16181e;
  const SOLE_WHITE = 0xe8e6e0;

  // --------------------------------------------------------------------------
  // 1. SCULPTED PELVIS & CLEAN DARK-SLATE CARGO WAISTBAND (NO GOLD BELT/CHAIN)
  // --------------------------------------------------------------------------
  const pelvisSlices = [
    [-0.12, 0.174, 0.106, 0.114, 0, 0, 2.2],
    [-0.05, 0.180, 0.110, 0.118, 0, 0, 2.3],
    [0.01,  0.176, 0.106, 0.112, 0, 0, 2.3],
    [0.05,  0.170, 0.102, 0.106, 0, 0, 2.3]
  ];
  const pelvisGeo = createSculptedLoftGeometry(pelvisSlices, 32, false, true, true);
  const pelvisMesh = createHiFiMesh(pelvisGeo, 0xffffff, 0.032, createKronosPelvisUVTexture());
  hips.add(pelvisMesh);

  // --------------------------------------------------------------------------
  // 2. V-TAPERED MUSCULAR TORSO & SLEEVELESS CRIMSON-AND-GOLD BOMBER VEST
  // --------------------------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.03; // y_world = 1.07m
  hips.add(torso);

  const torsoSlices = [
    // Gold Ribbed Waistband Hem at Bottom of Vest (y = 0.00..0.06 -> y_world = 1.07m..1.13m)
    [0.00, 0.176, 0.106, 0.112, 0.000, 0.000, 2.30],
    [0.06, 0.182, 0.112, 0.118, 0.000, 0.002, 2.30],
    // Athletic V-Tapered Lower & Mid Torso (y = 0.15..0.35 -> y_world = 1.22m..1.42m)
    [0.15, 0.196, 0.122, 0.126, 0.000, 0.004, 2.30],
    [0.26, 0.214, 0.134, 0.136, 0.000, 0.007, 2.32],
    [0.35, 0.224, 0.148, 0.142, 0.000, 0.010, 2.32],
    // Sleeveless Vest Armhole Cut-In + Full Pectoral Chest Projection (y = 0.43..0.57 -> y_world = 1.50m..1.64m)
    [0.43, 0.214, 0.154, 0.144, 0.000, 0.012, 2.25],
    [0.48, 0.198, 0.146, 0.140, 0.000, 0.010, 2.20],
    [0.52, 0.176, 0.126, 0.126, 0.000, 0.005, 2.15],
    [0.55, 0.142, 0.102, 0.106, 0.000, 0.002, 2.08],
    [0.57, 0.105, 0.084, 0.088, 0.000, 0.000, 2.00]
  ];
  const torsoGeo = createSculptedLoftGeometry(torsoSlices, 36, false, true, true);
  const torsoMesh = createHiFiMesh(torsoGeo, 0xffffff, 0.034, createKronosTorsoUVTexture());
  torso.add(torsoMesh);

  const vest = new THREE.Group();
  torso.add(vest);

  // High Stand-Up Popped Crimson Collar with Thick Metallic Gold Top Rim (hugging neck closely)
  function buildContouredBossCollar(yBot, yTop, rScale, colorHex, outlineThick) {
    const segsU = 32;
    const pos = [];
    const ind = [];
    const openHalf = 0.44; // Open V at Front (+Z)
    for (let iv = 0; iv <= 1; iv++) {
      const y = iv === 0 ? yBot : yTop;
      // Controlled radii: hugs neck closely, no outward flaring horns!
      const rx = (0.122 + iv * 0.008) * rScale;
      const rz = (0.098 + iv * 0.006) * rScale;
      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU;
        const theta = openHalf + u * (Math.PI * 2 - openHalf * 2);
        const x = Math.sin(theta) * rx;
        const z = Math.cos(theta) * rz;
        pos.push(x, y, z);
      }
    }
    const stride = segsU + 1;
    for (let iu = 0; iu < segsU; iu++) {
      const a = iu;
      const b = iu + 1;
      const d = stride + iu;
      const c = d + 1;
      ind.push(a, b, d);
      ind.push(b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(ind);
    g.computeVertexNormals();
    const mat = createCelMaterial(colorHex);
    mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (outlineThick > 0) {
      const o = new THREE.Mesh(g, createOutlineMaterial(outlineThick));
      o.castShadow = false;
      o.receiveShadow = false;
      m.add(o);
    }
    return m;
  }

  const crimsonCollar = buildContouredBossCollar(0.505, 0.585, 1.0, VEST_RED, 0.028);
  vest.add(crimsonCollar);

  const goldCollarRim = buildContouredBossCollar(0.575, 0.605, 1.015, GOLD_TRIM, 0.024);
  vest.add(goldCollarRim);

  // 3D Metallic Gold-Trimmed Armhole Borders encircling Shoulder Openings
  [-1, 1].forEach((side) => {
    const armholeBorder = new THREE.Group();
    armholeBorder.position.set(side * 0.208, 0.445, 0.005);
    armholeBorder.rotation.set(0, side * (Math.PI * 0.5), side * 0.24);

    const torusGeo = new THREE.TorusGeometry(0.076, 0.010, 12, 28);
    torusGeo.scale(1.0, 1.16, 0.96); // Contoured elliptical rim hugging vest armhole & deltoid slope
    const goldBorderMesh = createHiFiMesh(torusGeo, GOLD_TRIM, 0.020);
    armholeBorder.add(goldBorderMesh);

    vest.add(armholeBorder);
  });

  // --------------------------------------------------------------------------
  // 3. NECK DJ HEADPHONES, GOLD CURB CHAIN & PROPORTIONED GOLD VINYL MEDALLION
  // --------------------------------------------------------------------------
  // Chunky Black-and-Gold Studio DJ Headphones resting naturally around Neck & Trapezius (zero clipping!)
  const hpGroup = new THREE.Group();
  hpGroup.position.set(0, 0.54, 0.005);
  torso.add(hpGroup);

  // 1. Thick Cushioned Black Leather Padded Headband (Arches behind neck, visible in Views 3 & 4)
  const headbandCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.112,  0.005,  0.076), // Left slider connection
    new THREE.Vector3(-0.118,  0.035,  0.028), // Over left trapezius
    new THREE.Vector3(-0.076,  0.035, -0.045), // Left nape
    new THREE.Vector3( 0.000,  0.042, -0.062), // Center rear nape (View 4 back visible!)
    new THREE.Vector3( 0.076,  0.035, -0.045), // Right nape
    new THREE.Vector3( 0.118,  0.035,  0.028), // Over right trapezius
    new THREE.Vector3( 0.112,  0.005,  0.076)  // Right slider connection
  ]);
  const headbandGeo = new THREE.TubeGeometry(headbandCurve, 28, 0.015, 12, false);
  const headbandMesh = createHiFiMesh(headbandGeo, 0x14161c, 0.024);
  hpGroup.add(headbandMesh);

  // 2. Chunky Studio DJ Monitor Earcups with Polished Gold Trim Bezel Rings
  [-1, 1].forEach((side) => {
    // Slider collar at headband end
    const slider = createHiFiMesh(
      new THREE.BoxGeometry(0.016, 0.024, 0.020),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    slider.position.set(side * 0.112, 0.005, 0.076);
    hpGroup.add(slider);

    // Earcup Assembly Group (Raised by +0.04m to y = -0.002, widened to x = ±0.115m)
    // Sits visibly around neck above the red vest collar in Views 1, 2, and 3!
    const earcup = new THREE.Group();
    earcup.position.set(side * 0.115, -0.002, 0.092);
    // Tilted forward and inward to rest naturally on the clavicle/chest slope
    earcup.rotation.set(0.24, side * 0.32, side * -0.22);

    // Outer Canister Housing (Matte black/charcoal)
    const outerCan = createHiFiMesh(
      new THREE.CylinderGeometry(0.058, 0.060, 0.034, 24),
      0x181a20,
      0.026
    );
    outerCan.rotation.z = Math.PI * 0.5;
    earcup.add(outerCan);

    // Bold Polished Metallic Gold Outer Bezel Ring (Bold gold outer ring!)
    const goldRing = createHiFiMesh(
      new THREE.TorusGeometry(0.057, 0.011, 12, 32),
      GOLD_TRIM,
      0.024,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.6 }
    );
    goldRing.position.x = side * 0.017;
    goldRing.rotation.y = Math.PI * 0.5;
    earcup.add(goldRing);

    // Center Gold Core Accent Disc on outer can
    const goldCore = createHiFiMesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.007, 20),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    goldCore.position.x = side * 0.019;
    goldCore.rotation.z = Math.PI * 0.5;
    earcup.add(goldCore);

    // Plush Contoured Black Memory Foam Ear Cushion
    const cushion = createHiFiMesh(
      new THREE.CylinderGeometry(0.054, 0.052, 0.022, 24),
      0x101216,
      0.022
    );
    cushion.position.x = -side * 0.014;
    cushion.rotation.z = Math.PI * 0.5;
    earcup.add(cushion);

    // Rounded cushion torus rim
    const cushionRim = createHiFiMesh(
      new THREE.TorusGeometry(0.050, 0.008, 10, 24),
      0x0e1014,
      0.020
    );
    cushionRim.position.x = -side * 0.022;
    cushionRim.rotation.y = Math.PI * 0.5;
    earcup.add(cushionRim);

    hpGroup.add(earcup);
  });

  // Heavy V-Shaped Catenary Chain Path Draping Proudly Across Pectoral Surface to Top Rim of Medallion
  const medallionGroup = new THREE.Group();
  torso.add(medallionGroup);

  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.096, 0.520, 0.118),  // Left neck anchor under headphone earcup
    new THREE.Vector3(-0.078, 0.472, 0.162),  // Left clavicle drape proud of chest surface
    new THREE.Vector3(-0.044, 0.420, 0.172),  // Left upper pec V-drape proud of pecs
    new THREE.Vector3( 0.000, 0.378, 0.170),  // Medallion top rim bail loop apex (y = 0.310 + 0.068 = 0.378)
    new THREE.Vector3( 0.044, 0.420, 0.172),  // Right upper pec V-drape proud of pecs
    new THREE.Vector3( 0.078, 0.472, 0.162),  // Right clavicle drape proud of chest surface
    new THREE.Vector3( 0.096, 0.520, 0.118)   // Right neck anchor under headphone earcup
  ]);

  // 1. Supporting Metallic Gold Chain Core Tube
  const goldChainTube = createHiFiMesh(
    new THREE.TubeGeometry(chainCurve, 28, 0.012, 8, false),
    GOLD_TRIM,
    0.022
  );
  medallionGroup.add(goldChainTube);

  // 2. Sculpted Interlocking Cuban Curb Links along the Curve (skipping center apex where bailLoop sits)
  const numLinks = 17;
  for (let i = 1; i < numLinks; i++) {
    const t = i / numLinks;
    const pt = chainCurve.getPoint(t);
    const tangent = chainCurve.getTangent(t);

    const link = createHiFiMesh(
      new THREE.TorusGeometry(0.017, 0.006, 8, 16),
      GOLD_TRIM,
      0.018
    );
    link.position.copy(pt);
    link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    link.rotateOnAxis(new THREE.Vector3(0, 1, 0), (i % 2 === 0 ? 0.35 : -0.35));
    link.scale.set(1.0, 1.25, 0.65);
    medallionGroup.add(link);
  }

  // 3. Heavy Gold Medallion Bail Loop (Attaches chain cleanly to top rim of medallion at y = 0.378!)
  const bailLoop = createHiFiMesh(
    new THREE.TorusGeometry(0.016, 0.006, 10, 20),
    GOLD_TRIM,
    0.020
  );
  bailLoop.position.set(0, 0.378, 0.168);
  bailLoop.rotation.y = Math.PI * 0.5;
  medallionGroup.add(bailLoop);

  // 4. Large 12" Gleaming Gold Vinyl Record Medallion resting cleanly on upper pecs
  const vinylTex = createGoldVinylDiscTexture();
  const goldMedallion = new THREE.Group();
  goldMedallion.position.set(0, 0.310, 0.164); // y_world = 1.380m (Proud of 0.158m chest surface, zero skin clipping!)
  goldMedallion.rotation.x = -0.05;
  medallionGroup.add(goldMedallion);

  // Heavy Polished Metallic Gold Outer Bezel Frame
  const bezel = createHiFiMesh(
    new THREE.TorusGeometry(0.068, 0.008, 12, 32),
    GOLD_TRIM,
    0.024
  );
  goldMedallion.add(bezel);

  // Solid Gold Vinyl Disc Body with High-Contrast Concentric Grooves
  const discGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.014, 32);
  discGeo.rotateX(Math.PI * 0.5);
  const disc = createHiFiMesh(
    discGeo,
    0xffffff,
    0.020,
    vinylTex
  );
  goldMedallion.add(disc);

  // --------------------------------------------------------------------------
  // 4. SCULPTED HEAD, HIGH-TOP FLAT-TOP FADE, SUNGLASSES & CONTOURED GOATEE
  // --------------------------------------------------------------------------
  const neckSlices = [
    [0.52, 0.076, 0.074, 0.078, 0, 0.000, 2.0],
    [0.60, 0.070, 0.068, 0.072, 0, 0.004, 2.0],
    [0.66, 0.072, 0.070, 0.074, 0, 0.006, 2.0]
  ];
  const neckMesh = createHiFiMesh(createSculptedLoftGeometry(neckSlices, 24, false, false, false), SKIN_COLOR, 0.028);
  torso.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.71, 0.008); // y_world = 1.78m (Pivot invariant for ContinuousPoseBlender!)
  torso.add(headGroup);

  // 12-Slice Master Anatomical Chiseled Head + High-Top Flat-Top Fade Loft
  // Spans y = -0.150m (chin) to +0.160m (flat-top crown) -> Total H = 0.310m, crown at y_world = 1.94m!
  // Width across cheekbones: 0.180m; Width across jaw: 0.172m; Width across chin: 0.120m (True heavyweight boss!)
  const headAndHairSlices = [
    [-0.150, 0.060, 0.082, 0.048, 0,  0.024, 2.40], // 1. Broad square chin block (z_front = +0.106)
    [-0.125, 0.076, 0.090, 0.064, 0,  0.016, 2.35], // 2. Lower jawline ramus
    [-0.095, 0.086, 0.096, 0.080, 0,  0.010, 2.30], // 3. Gonial angle (wide masculine jaw flare!)
    [-0.065, 0.086, 0.100, 0.092, 0,  0.006, 2.25], // 4. Mouth & bronze lips level
    [-0.030, 0.088, 0.102, 0.102, 0,  0.003, 2.20], // 5. Nose base & philtrum hollow
    [ 0.005, 0.090, 0.104, 0.110, 0,  0.000, 2.15], // 6. Cheekbones & eyeline (Midline anchor, deep cranium!)
    [ 0.035, 0.088, 0.104, 0.114, 0, -0.002, 2.15], // 7. Brow ridge under sunglasses bar
    [ 0.075, 0.086, 0.102, 0.116, 0, -0.003, 2.20], // 8. Upper forehead right below high-top step
    [ 0.080, 0.090, 0.106, 0.116, 0, -0.002, 2.45], // 9. High-top hairline step overhang!
    [ 0.120, 0.090, 0.106, 0.116, 0, -0.002, 2.50], // 10. Vertical Afro-cubist high-top side walls
    [ 0.155, 0.089, 0.105, 0.114, 0, -0.002, 2.50], // 11. High-top upper rim
    [ 0.160, 0.084, 0.098, 0.108, 0, -0.002, 2.50]  // 12. Razor-flat top crown cap
  ];
  const headGeo = createSculptedLoftGeometry(headAndHairSlices, 36, false, true, true);
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.032, createKronosHeadUVTexture());
  headGroup.add(headMesh);

  // Dark Matte Top Cap on Flat-Top Haircut so top of crown is 100% solid jet-black from elevated angles
  const flatTopCapSlices = [
    [0.082, 0.089, 0.105, 0.115, 0, -0.003, 2.45],
    [0.156, 0.090, 0.106, 0.115, 0, -0.002, 2.50],
    [0.161, 0.085, 0.099, 0.109, 0, -0.002, 2.50]
  ];
  const flatTopCap = createHiFiMesh(createSculptedLoftGeometry(flatTopCapSlices, 32, false, false, true), 0x101014, 0.028);
  headGroup.add(flatTopCap);

  // 3D Sculpted Nose Bridge & Nostril Wings on Front (+Z) for powerful Side Profile (View 3)
  const noseSlices = [
    [-0.036, 0.005, 0.006, 0.003, 0,  0.000, 2.0],
    [-0.024, 0.018, 0.026, 0.006, 0,  0.004, 2.2],
    [-0.005, 0.010, 0.018, 0.005, 0,  0.002, 2.1],
    [ 0.020, 0.006, 0.008, 0.004, 0,  0.000, 2.0]
  ];
  const noseMesh = createHiFiMesh(createSculptedLoftGeometry(noseSlices, 24, false, true, true), SKIN_COLOR, 0.018);
  noseMesh.position.set(0, -0.010, 0.100);
  headGroup.add(noseMesh);

  // 3D Sculpted Anatomical Tapered Chin Goatee (Hugging chin curvature in View 2 & 3!)
  const goateeChinSlices = [
    [-0.140, 0.018, 0.006, 0.002, 0,  0.010, 2.10], // Tapered under-chin wrap
    [-0.132, 0.024, 0.008, 0.002, 0,  0.008, 2.15], // Lower chin volume
    [-0.122, 0.026, 0.008, 0.002, 0,  0.004, 2.15], // Mid-chin projection apex
    [-0.112, 0.022, 0.005, 0.002, 0,  0.002, 2.10], // Tapering upper chin
    [-0.102, 0.014, 0.003, 0.001, 0,  0.001, 2.05]  // Feathered blend into labial groove
  ];
  const goateeChinGeo = createSculptedLoftGeometry(goateeChinSlices, 24, false, true, true);
  const goateeChinMesh = createHiFiMesh(goateeChinGeo, 0x121014, 0.008);
  goateeChinMesh.position.set(0, 0, 0.098);
  headGroup.add(goateeChinMesh);

  // 3D Sculpted Anatomical Ears on Left (+X) & Right (-X)
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.030, 0.008, 0.014, 0.014, 0, 0, 2.0],
      [-0.010, 0.016, 0.022, 0.022, side * 0.004, 0, 2.0],
      [ 0.015, 0.018, 0.024, 0.024, side * 0.006, 0, 2.0],
      [ 0.030, 0.010, 0.014, 0.014, 0, 0, 2.0]
    ];
    const ear = createHiFiMesh(createSculptedLoftGeometry(earSlices, 24, false, true, true), SKIN_COLOR, 0.024);
    ear.position.set(side * 0.088, -0.006, -0.006);
    ear.rotation.set(-0.06, side * -0.18, side * 0.08);
    headGroup.add(ear);
  });

  // WIDE WRAP-AROUND DARK WAYFARER SUNGLASSES WITH CLEAN GOLD BROW BAR (MIDLINE ANCHOR)
  const glassesGroup = new THREE.Group();
  glassesGroup.position.set(0, 0.012, 0.015); // Preserves y = 0.012 midline anchor, shifted +0.015m forward in +Z for 100% skin clearance!
  headGroup.add(glassesGroup);

  // 1. Clean Metallic Gold Top Brow Bar spanning full head width (span = 0.212m >= 0.170m)
  // Note: rotY = +side * angle wraps outer temple corners BACKWARD (-Z) around the head!
  const browSegments = [
    { x:  0.000, y: 0.018, z: 0.108, w: 0.048, rotY:  0.00 }, // Center bridge
    { x: -0.046, y: 0.017, z: 0.104, w: 0.062, rotY: -0.14 }, // Right brow wrapping back toward temple
    { x:  0.046, y: 0.017, z: 0.104, w: 0.062, rotY:  0.14 }, // Left brow wrapping back toward temple
    { x: -0.084, y: 0.015, z: 0.086, w: 0.042, rotY: -0.52 }, // Right wrap-around corner
    { x:  0.084, y: 0.015, z: 0.086, w: 0.042, rotY:  0.52 }  // Left wrap-around corner
  ];
  browSegments.forEach((seg) => {
    const bar = createHiFiMesh(
      new THREE.BoxGeometry(seg.w, 0.014, 0.018),
      GOLD_TRIM,
      0.020
    );
    bar.position.set(seg.x, seg.y, seg.z);
    bar.rotation.y = seg.rotY;
    glassesGroup.add(bar);
  });

  // Solid Dark Center Bridge Frame overlapping both front lenses so zero nose/brow skin ever pokes through
  const centerBridgeFrame = createHiFiMesh(
    new THREE.BoxGeometry(0.048, 0.048, 0.022),
    0x161a24,
    0.0
  );
  centerBridgeFrame.position.set(0, -0.004, 0.105);
  glassesGroup.add(centerBridgeFrame);

  // 2. Sleek Dark Wayfarer/Aviator Lenses (Height = 0.056m, depth = 0.022m, wrapping backward around temples with zero skin bleed)
  [-1, 1].forEach((side) => {
    // Front smoked dark lens: overlaps centerBridgeFrame on inner edge and sideWing on outer edge
    const frontLensGeo = new THREE.BoxGeometry(0.076, 0.056, 0.022);
    const frontLens = createHiFiMesh(frontLensGeo, 0x161a24, 0.020);
    frontLens.position.set(side * 0.044, -0.010, 0.103);
    frontLens.rotation.set(0.02, side * 0.14, 0);
    glassesGroup.add(frontLens);

    // Aerodynamic Wrap-Around Side Wing curving backward (-Z) to meet the temple arm seamlessly
    const sideWing = createHiFiMesh(new THREE.BoxGeometry(0.046, 0.054, 0.020), 0x161a24, 0.018);
    sideWing.position.set(side * 0.082, -0.009, 0.084);
    sideWing.rotation.set(0.02, side * 0.52, 0);
    glassesGroup.add(sideWing);

    // Tapered Temple Arm extending back from sideWing to rest securely over the ear
    const temple = createHiFiMesh(new THREE.BoxGeometry(0.012, 0.014, 0.096), 0x12141a, 0.018);
    temple.position.set(side * 0.090, 0.008, 0.022);
    glassesGroup.add(temple);

    // Gold accent trim on top of temple arm
    const templeTrim = createHiFiMesh(new THREE.BoxGeometry(0.009, 0.004, 0.094), GOLD_TRIM, 0.0);
    templeTrim.position.set(side * 0.090, 0.016, 0.022);
    glassesGroup.add(templeTrim);
  });

  // --------------------------------------------------------------------------
  // 5. MUSCULAR BRONZE ARMS, FINGERLESS GLOVES & RIGHT-HAND (-X) VINTAGE CHROME MIC
  // --------------------------------------------------------------------------
  function buildKronosArm(side) {
    // Note: For Kronos (+Z front), side = -1 is Kronos's RIGHT arm (viewer's left in View 1, facing camera in View 3!)
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.248, 0.43, 0.00);

    // 1. Anatomical Cel-Shaded Upper Arm: Smoothly Rounded Deltoid Dome + Bicep Peak + Tricep Horseshoe
    // Strictly ascending Y order (-0.275 to +0.088) guarantees outward normals and zero facet seams!
    const upperArmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.275, 0.062, 0.062, 0.064,  0.000,         0.000, 2.0], // Elbow joint capsule interface
      [-0.250, 0.068, 0.068, 0.070,  0.000,         0.000, 2.0], // Supracondylar ridge
      [-0.220, 0.075, 0.082, 0.082,  side * 0.002,  0.002, 2.0], // Lower bicep/tricep taper
      [-0.180, 0.081, 0.096, 0.092,  side * 0.004,  0.004, 2.0], // Muscular bicep anterior expansion
      [-0.140, 0.086, 0.106, 0.102,  side * 0.006,  0.003, 2.0], // Peak bicep belly & lateral tricep head
      [-0.100, 0.090, 0.102, 0.104,  side * 0.010, -0.002, 2.0], // Tricep lateral head peak (horseshoe swell)
      [-0.060, 0.093, 0.096, 0.098,  side * 0.010,  0.000, 2.0], // Deltoid insertion on humerus
      [-0.030, 0.094, 0.094, 0.096,  side * 0.008,  0.001, 2.0], // Anatomical peak lateral deltoid
      [-0.005, 0.089, 0.090, 0.092,  side * 0.000,  0.001, 2.0], // Deltoid cap rounding upward
      [ 0.020, 0.080, 0.080, 0.082, -side * 0.012,  0.001, 2.0], // Curving inward into armhole
      [ 0.042, 0.068, 0.068, 0.070, -side * 0.026,  0.001, 2.0], // Smooth anatomical deltoid arch
      [ 0.062, 0.054, 0.054, 0.056, -side * 0.038,  0.001, 2.0], // Deltoid dome entering gold rim
      [ 0.076, 0.040, 0.040, 0.042, -side * 0.048,  0.000, 2.0], // Entering gold armhole
      [ 0.088, 0.028, 0.028, 0.030, -side * 0.058,  0.000, 2.0]  // Tucked seamlessly inside gold vest armhole ring
    ];
    const upperArmGeo = createSculptedLoftGeometry(upperArmSlices, 28, false, true, true);
    const upperArm = createHiFiMesh(upperArmGeo, SKIN_COLOR, 0.030);
    shoulder.add(upperArm);

    // Lateral Bicep/Tricep Cel-Shaded Separation Furrow (Comic Ink Crease)
    // Smooth 12-segment curve nestled flush into the lateral muscular sulcus
    const creaseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.088, -0.065,  0.002),
      new THREE.Vector3(side * 0.090, -0.130,  0.000),
      new THREE.Vector3(side * 0.082, -0.195, -0.002)
    ]);
    const muscleCrease = createHiFiMesh(
      new THREE.TubeGeometry(creaseCurve, 16, 0.003, 12, false),
      0x38180c,
      0.0
    );
    shoulder.add(muscleCrease);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    // 2. Muscular Bronze Forearm Loft (Prominent Brachioradialis Tapering to Wrist)
    // 10 slices with radialSegments = 24 and strictly ascending Y order (-0.240 to +0.030)
    const forearmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.240, 0.048, 0.046, 0.046, 0.000,         0.000, 2.0], // Wrist entering glove cuff
      [-0.210, 0.053, 0.050, 0.050, side * 0.001,  0.000, 2.0], // Suprastyloid wrist taper
      [-0.175, 0.060, 0.057, 0.056, side * 0.003,  0.001, 2.0], // Lower forearm
      [-0.140, 0.069, 0.066, 0.064, side * 0.006,  0.002, 2.0], // Mid-lower forearm
      [-0.105, 0.078, 0.075, 0.072, side * 0.009,  0.003, 2.0], // Lower brachioradialis belly
      [-0.070, 0.086, 0.082, 0.078, side * 0.012,  0.004, 2.0], // Muscular brachioradialis peak swell
      [-0.040, 0.084, 0.080, 0.076, side * 0.009,  0.003, 2.0], // Upper brachioradialis slope
      [-0.010, 0.076, 0.074, 0.072, side * 0.005,  0.001, 2.0], // Brachioradialis origin near epicondyle
      [ 0.015, 0.067, 0.066, 0.068, 0.000,         0.000, 2.0], // Elbow joint interface
      [ 0.030, 0.060, 0.060, 0.062, 0.000,         0.000, 2.0]  // Proximal elbow overlap inside upper arm
    ];
    const forearm = createHiFiMesh(
      createSculptedLoftGeometry(forearmSlices, 24, false, true, true),
      SKIN_COLOR,
      0.028
    );
    elbow.add(forearm);

    // 3. Black Tactical Wrist Strap Cuff with Metallic Gold Trim & Buckle Clasp
    const wristWrap = createHiFiMesh(
      new THREE.CylinderGeometry(0.055, 0.057, 0.054, 24),
      0x181a22,
      0.026
    );
    wristWrap.position.y = -0.225;
    elbow.add(wristWrap);

    // Metallic Gold Top Rim on Wrist Strap
    const wristGoldRim = createHiFiMesh(
      new THREE.CylinderGeometry(0.056, 0.056, 0.006, 24),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    wristGoldRim.position.y = -0.200;
    elbow.add(wristGoldRim);

    const wristBuckle = createHiFiMesh(
      new THREE.BoxGeometry(0.018, 0.022, 0.008),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    wristBuckle.position.set(side * 0.056, -0.225, -0.006);
    elbow.add(wristBuckle);

    // 4. Black Fingerless Tactical Combat Glove with Gold Knuckle Studs & Exposed Bronze Fingers
    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);

    // Smooth Contoured Leather Glove Palm (Sculpted Loft with 24 radial segments)
    const palmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.055, 0.040, 0.025, 0.022, 0.000, 0.002, 2.0], // MCP knuckles / finger origins
      [-0.035, 0.045, 0.028, 0.025, 0.000, 0.003, 2.0], // Across MCP knuckle row
      [-0.015, 0.047, 0.029, 0.027, 0.000, 0.002, 2.0], // Mid palm body
      [ 0.010, 0.045, 0.027, 0.027, 0.000, 0.000, 2.0], // Thenar/hypothenar swell
      [ 0.028, 0.042, 0.025, 0.025, 0.000, 0.000, 2.0]  // Wrist interface entering cuff
    ];
    const glovePalm = createHiFiMesh(
      createSculptedLoftGeometry(palmSlices, 24, false, true, true),
      0x181a22,
      0.026
    );
    hand.add(glovePalm);

    // Contoured Padded Knuckle Protection Plate (Dorsal Metacarpals, +Z)
    const knuckleGuardSlices = [
      [-0.016, 0.044, 0.010, 0.006, 0, 0.025, 2.0],
      [ 0.000, 0.045, 0.012, 0.006, 0, 0.027, 2.0],
      [ 0.016, 0.043, 0.010, 0.006, 0, 0.025, 2.0]
    ];
    const knuckleGuard = createHiFiMesh(
      createSculptedLoftGeometry(knuckleGuardSlices, 20, false, true, true),
      0x282c36,
      0.022
    );
    hand.add(knuckleGuard);

    // 4 Metallic Gold Knuckle Studs
    [-0.030, -0.010, 0.010, 0.030].forEach((kx) => {
      const stud = createHiFiMesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.006, 16),
        GOLD_TRIM,
        0.014,
        null,
        0x000000,
        { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
      );
      stud.position.set(kx, 0.000, 0.036);
      stud.rotation.x = Math.PI * 0.5;
      hand.add(stud);
    });

    // 4 Articulated Fingers (Gloved proximal sleeve + Exposed Bronze skin distal tips)
    const fingerXPositions = [-0.030, -0.010, 0.010, 0.030];
    fingerXPositions.forEach((fx, idx) => {
      const lenFactor = (idx === 1 || idx === 2) ? 1.05 : 0.95;

      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(fx, -0.045, 0.018);
      fingerGroup.rotation.x = -0.55; // Proximal forward curl
      hand.add(fingerGroup);

      // Proximal gloved segment (Cylinder with smooth normals)
      const fGloveGeo = new THREE.CylinderGeometry(0.0090, 0.0085, 0.024 * lenFactor, 14);
      const fGlove = createHiFiMesh(fGloveGeo, 0x181a22, 0.020);
      fGlove.position.y = -0.012 * lenFactor;
      fingerGroup.add(fGlove);

      // Distal exposed bronze skin tip (curled inward into grip)
      const tipGroup = new THREE.Group();
      tipGroup.position.y = -0.024 * lenFactor;
      tipGroup.rotation.x = -0.75;
      fingerGroup.add(tipGroup);

      const fTipGeo = new THREE.CylinderGeometry(0.0080, 0.0068, 0.022 * lenFactor, 14);
      const fTip = createHiFiMesh(fTipGeo, SKIN_COLOR, 0.020);
      fTip.position.y = -0.011 * lenFactor;
      tipGroup.add(fTip);
    });

    // Articulated Thumb (Gloved base + Exposed Bronze skin tip)
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(-side * 0.042, -0.015, 0.014);
    thumbGroup.rotation.set(-0.30, -side * 0.40, -side * 0.35);
    hand.add(thumbGroup);

    const thumbGloveGeo = new THREE.CylinderGeometry(0.0105, 0.0098, 0.026, 14);
    const thumbGlove = createHiFiMesh(thumbGloveGeo, 0x181a22, 0.020);
    thumbGlove.position.y = -0.013;
    thumbGroup.add(thumbGlove);

    const thumbTipGroup = new THREE.Group();
    thumbTipGroup.position.y = -0.026;
    thumbTipGroup.rotation.x = -0.65;
    thumbGroup.add(thumbTipGroup);

    const thumbTipGeo = new THREE.CylinderGeometry(0.0092, 0.0078, 0.020, 14);
    const thumbTip = createHiFiMesh(thumbTipGeo, SKIN_COLOR, 0.020);
    thumbTip.position.y = -0.010;
    thumbTipGroup.add(thumbTip);

    return { shoulder, elbow, hand, fist: hand };
  }

  // Kronos Right Arm = -1 (-X, Viewer's Left in View 1, facing camera in View 3!)
  // Kronos Left Arm = +1 (+X, Viewer's Right in View 1)
  const leftArmObj = buildKronosArm(-1);
  const rightArmObj = buildKronosArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // VINTAGE RIBBED SILVER-CHROME CAPSULE MICROPHONE IN KRONOS'S RIGHT HAND (leftArmObj, side = -1)
  // Oriented horizontally along +Z (Forward) so:
  // - View 1 (Front): Circular silver grille faces the camera at viewer's left hand!
  // - View 2 (3/4) & View 3 (Right Side Profile): Ribbed silver capsule points forward (rightward) with dark handle extending back!
  const micGroup = new THREE.Group();
  micGroup.position.set(0, -0.032, 0.005);
  micGroup.rotation.x = Math.PI * 0.5; // Rest pose: points along +Z
  leftArmObj.hand.add(micGroup);

  // Tapered Dark Graphite Body (-Y = rear)
  const micHandle = createHiFiMesh(new THREE.CylinderGeometry(0.022, 0.016, 0.135, 18), 0x20242c, 0.024);
  micHandle.position.y = -0.052;
  micGroup.add(micHandle);

  const micTailTip = createHiFiMesh(new THREE.CylinderGeometry(0.016, 0.012, 0.024, 16), 0xd8e4f0, 0.020);
  micTailTip.position.y = -0.130;
  micGroup.add(micTailTip);

  // Ribbed Silver-Chrome Capsule Head (+Y = front)
  const micCapsuleGroup = new THREE.Group();
  micCapsuleGroup.position.y = 0.072;
  micGroup.add(micCapsuleGroup);

  const capsuleSlices = [
    [-0.045, 0.030, 0.030, 0.030, 0, 0, 2.0],
    [-0.018, 0.040, 0.040, 0.040, 0, 0, 2.0],
    [0.022,  0.040, 0.040, 0.040, 0, 0, 2.0],
    [0.048,  0.030, 0.030, 0.030, 0, 0, 2.0],
    [0.058,  0.016, 0.016, 0.016, 0, 0, 2.0]
  ];
  const micHead = createHiFiMesh(
    createSculptedLoftGeometry(capsuleSlices, 20, false, true, true),
    0xdce4ec,
    0.024,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.6 }
  );
  micCapsuleGroup.add(micHead);

  // Acoustic Ring Grooves
  [-0.022, -0.002, 0.018, 0.038].forEach((ry) => {
    const rib = createHiFiMesh(new THREE.TorusGeometry(0.039, 0.0035, 8, 20), 0x181c22, 0.0);
    rib.position.y = ry;
    rib.rotation.x = Math.PI * 0.5;
    micCapsuleGroup.add(rib);
  });

  // Center Chrome Band
  const centerBand = createHiFiMesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 20), 0xf5f8fc, 0.020);
  centerBand.position.y = 0.006;
  micCapsuleGroup.add(centerBand);

  // --------------------------------------------------------------------------
  // 6. FULL-LENGTH BAGGY DARK-SLATE CARGO PANTS & BLACK/GOLD LACED COMBAT BOOTS
  // --------------------------------------------------------------------------
  const pantsLegTex = createKronosPantsLegUVTexture();

  function buildKronosLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.115, -0.05, 0); // Hip joint at y_world = 0.99m

    // Full Baggy Upper Thigh Loft in Dark Slate-Charcoal (#313e45) (A-stance gap >= 3.8cm preserved!)
    const thighSlices = [
      [-0.37, 0.110, 0.112, 0.116, side * 0.014, 0.000, 2.15], // Knee joint taper (Nominal gap = 3.80cm)
      [-0.25, 0.114, 0.124, 0.126, side * 0.020, 0.004, 2.20], // Mid-thigh fullness (Nominal gap = 4.20cm)
      [-0.12, 0.112, 0.118, 0.122, side * 0.016, 0.004, 2.20], // Upper-thigh drape (Nominal gap = 3.80cm)
      [0.02,  0.104, 0.106, 0.110, side * 0.010, 0.000, 2.15]  // Upper hip insertion (Nominal gap = 4.20cm)
    ];
    const thighMesh = createHiFiMesh(
      createSculptedLoftGeometry(thighSlices, 24, false, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    hipJoint.add(thighMesh);

    // Side Thigh 3D Bellows Flapped Cargo Pocket (Views 1, 2, 3, 4)
    const pocketGroup = new THREE.Group();
    pocketGroup.position.set(side * 0.132, -0.20, 0.00);
    pocketGroup.rotation.z = side * -0.05;
    hipJoint.add(pocketGroup);

    const pocketBox = createHiFiMesh(new THREE.BoxGeometry(0.038, 0.160, 0.130), 0x263137, 0.028);
    pocketGroup.add(pocketBox);

    const pocketPleat = createHiFiMesh(new THREE.BoxGeometry(0.042, 0.150, 0.012), 0x1f282d, 0.020);
    pocketGroup.add(pocketPleat);

    const pocketFlap = createHiFiMesh(new THREE.BoxGeometry(0.044, 0.038, 0.136), 0x2f3c43, 0.026);
    pocketFlap.position.y = 0.068;
    pocketGroup.add(pocketFlap);

    // Knee Joint at y = -0.37 (y_world = 0.62m, aligned with thighSlice[0] center side * 0.014)
    const kneeJoint = new THREE.Group();
    kneeJoint.position.set(side * 0.014, -0.37, 0);
    hipJoint.add(kneeJoint);

    // FULL-LENGTH BAGGY LOWER CARGO PANTS EXTENDING ALL THE WAY TO LOWER SHIN/ANKLE (y = -0.32 -> y_world = 0.30m!)
    // Matches reference sheet where 83% of leg height is baggy slate cargo pants tucked into ankle combat boots!
    const calfPantsSlices = [
      [-0.32, 0.076, 0.076, 0.078, 0.000,        -0.004, 2.10], // Tucked neatly into boot collar
      [-0.26, 0.118, 0.114, 0.118, side * 0.006, -0.004, 2.20], // Bloused cloth overhang above boot!
      [-0.16, 0.124, 0.120, 0.124, side * 0.008, -0.002, 2.20], // Full baggy calf drape
      [-0.06, 0.120, 0.116, 0.120, side * 0.006,  0.000, 2.15],
      [0.02,  0.110, 0.110, 0.114, 0.000,         0.000, 2.10]  // Knee cap insertion (rx = 0.110 matching thighSlice[0])
    ];
    const calfPantsMesh = createHiFiMesh(
      createSculptedLoftGeometry(calfPantsSlices, 24, false, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    kneeJoint.add(calfPantsMesh);

    // COMPACT ANKLE / LOWER-CALF BLACK-AND-GOLD COMBAT BOOT (y = -0.30 down to -0.62 -> y_world = 0.00m..0.32m!)
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.40, -0.006); // y_world = 0.22m
    kneeJoint.add(footGroup);

    // 1. Thin Metallic Gold Top Ankle Ring Trim (eliminating yellow rain-boot cuff, b.min.y >= 0.03)
    const goldCollarSlices = [
      [0.084, 0.075, 0.077, 0.079, 0, 0.000, 2.2],
      [0.094, 0.077, 0.079, 0.081, 0, 0.001, 2.2]
    ];
    const topGoldCollar = createHiFiMesh(
      createSculptedLoftGeometry(goldCollarSlices, 24, false, false, true),
      GOLD_TRIM,
      0.020
    );
    footGroup.add(topGoldCollar);

    // 2. Sculpted Matte Black Leather Combat Boot Shaft & Vamp (y_world = 0.04m..0.305m)
    // Entire boot shaft is matte black leather all the way up to collar ring
    const bootUpperSlices = [
      [-0.180, 0.078, 0.170, 0.090, 0,  0.000, 2.4], // Vamp & instep
      [-0.125, 0.072, 0.135, 0.086, 0,  0.000, 2.2], // Ankle transition
      [-0.055, 0.066, 0.078, 0.078, 0, -0.004, 2.15], // Mid ankle
      [ 0.020, 0.068, 0.070, 0.074, 0, -0.002, 2.15], // Upper shaft
      [ 0.086, 0.074, 0.076, 0.078, 0,  0.000, 2.15]  // Shaft opening directly under thin gold ring
    ];
    const bootUpper = createHiFiMesh(
      createSculptedLoftGeometry(bootUpperSlices, 26, false, false, true),
      BOOT_BLACK,
      0.028
    );
    footGroup.add(bootUpper);

    // 3. Cream-White Rubber Lug Outsole (y_world = 0.00m..0.04m)
    const soleSlices = [
      [-0.220, 0.082, 0.180, 0.094, 0, 0, 2.5],
      [-0.180, 0.084, 0.182, 0.096, 0, 0, 2.5]
    ];
    const lugSole = createHiFiMesh(
      createSculptedLoftGeometry(soleSlices, 26, false, true, true),
      SOLE_WHITE,
      0.028
    );
    footGroup.add(lugSole);

    // 4. Thin Metallic Gold Welt Line (Just above outsole)
    const goldWeltSlices = [
      [-0.180, 0.081, 0.165, 0.093, 0, 0, 2.4],
      [-0.162, 0.078, 0.155, 0.090, 0, 0, 2.3]
    ];
    const goldWelt = createHiFiMesh(
      createSculptedLoftGeometry(goldWeltSlices, 24, false, false, false),
      GOLD_TRIM,
      0.020
    );
    footGroup.add(goldWelt);

    // 5. Compact Metallic Gold Heel Counter Cup (Strictly rear heel calcaneus! NO VERTICAL BACK STRIP!)
    const goldHeelCupSlices = [
      [-0.180, 0.076, 0.010, 0.092, 0, 0, 2.3],
      [-0.135, 0.068, 0.010, 0.084, 0, -0.002, 2.2]
    ];
    const goldHeelCup = createHiFiMesh(
      createSculptedLoftGeometry(goldHeelCupSlices, 20, false, false, true),
      GOLD_TRIM,
      0.022
    );
    footGroup.add(goldHeelCup);

    // 6. Front Gold Eyestay Trim & 5 Criss-Cross Black Laces (+Z) for High Graphic Contrast
    [-1, 1].forEach((s) => {
      const eyestay = createHiFiMesh(new THREE.BoxGeometry(0.016, 0.155, 0.018), GOLD_TRIM, 0.016);
      eyestay.position.set(s * 0.028, -0.022, 0.072);
      eyestay.rotation.x = 0.28;
      footGroup.add(eyestay);
    });

    for (let l = 0; l < 5; l++) {
      const ly = 0.030 - l * 0.028;
      const lz = 0.066 + l * 0.010;
      [-1, 1].forEach((diag) => {
        const xLace = createHiFiMesh(new THREE.BoxGeometry(0.054, 0.008, 0.012), 0x14161c, 0.012);
        xLace.position.set(0, ly, lz);
        xLace.rotation.set(0.28, 0, diag * 0.32);
        footGroup.add(xLace);
      });
    }

    return { hipJoint, kneeJoint, footGroup };
  }

  const leftLegObj = buildKronosLeg(-1);
  const rightLegObj = buildKronosLeg(1);
  hips.add(leftLegObj.hipJoint);
  hips.add(rightLegObj.hipJoint);

  return optimizeArticulatedRigBones({
    root,
    contactShadowDecal,
    hips,
    torso,
    headGroup,
    leftArm: leftArmObj.shoulder,
    leftElbow: leftArmObj.elbow,
    leftHand: leftArmObj.hand,
    rightArm: rightArmObj.shoulder,
    rightElbow: rightArmObj.elbow,
    rightHand: rightArmObj.hand,
    leftLeg: leftLegObj.hipJoint,
    leftKnee: leftLegObj.kneeJoint,
    leftAnkle: leftLegObj.footGroup,
    rightLeg: rightLegObj.hipJoint,
    rightKnee: rightLegObj.kneeJoint,
    rightAnkle: rightLegObj.footGroup,
    dusterCoat: vest,
    vest,
    medallion: goldMedallion,
    micGroup
  });
}


export const createBossKronosModel = buildKronosBossModel;
