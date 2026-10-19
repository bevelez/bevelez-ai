import * as THREE from 'three';
import {
  setFighterShadowScope,
  createCelMaterial,
  createCurvedHairLockGeometry,
  createHiFiMesh,
  createOutlineMaterial,
  createSculptedLoftGeometry,
  drawOnBackSeam,
  optimizeArticulatedRigBones,
  createContactShadowDecal
} from './shared.js?v=20261019g';

// ============================================================================
// 2B. CHALLENGER 1024x1024 TURNAROUND UV TEXTURE GENERATORS
//     Linear Y-UV Calibration for headSlices (yMin = -0.135, yMax = +0.115):
//     - Chin tip (y = -0.135) -> py = 1024
//     - Mouth    (y = -0.068) -> py = 750
//     - Nose     (y = -0.025) -> py = 573
//     Linear Y-UV Calibration for 8-slice headSlices (yMin = -0.110, yMax = +0.116, ySpan = 0.226):
//     - Chin tip (y = -0.110) -> py = 1024
//     - Mouth    (y = -0.055) -> py = 775
//     - Nose tip (y = -0.026) -> py = 643
//     - Eyes     (y = +0.004) -> py = 508 (EXACT MIDLINE)
//     - Eyebrows (y = +0.038) -> py = 353
//     - Hairline (y = +0.076) -> py = 181
// ============================================================================

const _challengerHeadTexCache = {};
function createChallengerHeadUVTexture(expression = 'determined') {
  if (_challengerHeadTexCache[expression]) return _challengerHeadTexCache[expression];
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Warm fair-tan anime skin tone
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Soft cheek blush / warm tone on zygomatic arches (below eyes on cheekbones)
  [-1, 1].forEach((dir) => {
    const cx = 512 + dir * 140;
    const cy = 560;
    const blush = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
    blush.addColorStop(0, 'rgba(224, 138, 100, 0.42)');
    blush.addColorStop(1, 'rgba(235, 182, 144, 0.0)');
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. Warm Cel Jaw & Chin Under-Shading (py = 860..1024)
  const chinGrad = ctx.createLinearGradient(0, 860, 0, 1024);
  chinGrad.addColorStop(0, 'rgba(196, 126, 88, 0.0)');
  chinGrad.addColorStop(1, 'rgba(182, 110, 74, 0.65)');
  ctx.fillStyle = chinGrad;
  ctx.fillRect(0, 860, 1024, 164);

  // 4. Upper cranium chestnut hair base (strictly inside 3D hair dome at py = 0..105 so forehead skin is clean)
  ctx.fillStyle = '#5c341e';
  ctx.fillRect(0, 0, 1024, 105);

  // 5. Back of head / nape hair base on back seam (py = 0..850)
  drawOnBackSeam(ctx, () => {
    ctx.fillStyle = '#442414';
    ctx.fillRect(-240, 0, 480, 850);
  });

  // 6. Center Front Expressive Anime Eyes around x = 512 (Front -Z)
  // Eye horizontal center at x = 512 ± 100, vertical center at py = 514 (EXACT VERTICAL MIDLINE)
  // Clipped almond sclera so the golden-amber iris fills top-to-bottom between lids with crisp white corners
  [-1, 1].forEach((dir) => {
    const ex = 512 + dir * 100;
    const ey = 514;

    // A. Sharp Confident Almond Sclera (~182px wide, ~74px tall so iris touches top/bottom lids cleanly)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - dir * 86, ey + 6);
    ctx.bezierCurveTo(ex - dir * 50, ey - 40, ex + dir * 34, ey - 42, ex + dir * 94, ey - 6);
    ctx.bezierCurveTo(ex + dir * 60, ey + 34, ex - dir * 38, ey + 34, ex - dir * 86, ey + 6);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();

    // B. Upper Sclera Subtle Eyelid Cast Shadow
    ctx.fillStyle = 'rgba(140, 110, 98, 0.22)';
    ctx.fillRect(ex - 100, ey - 44, 200, 16);

    // C. Thin Outer Limbal Ring (43x40px filling vertical eye opening)
    ctx.fillStyle = '#240f05';
    ctx.beginPath();
    ctx.ellipse(ex, ey - 2, 43, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // D. High-Luminance Golden-Amber / Chestnut Anime Iris Gradient (39x37px)
    const irisGrad = ctx.createLinearGradient(ex, ey - 38, ex, ey + 34);
    irisGrad.addColorStop(0.00, '#6e280c'); // Rich chestnut top under upper lid
    irisGrad.addColorStop(0.35, '#c45416'); // Vibrant warm amber mid-top
    irisGrad.addColorStop(0.72, '#f28c28'); // Luminous fiery amber
    irisGrad.addColorStop(1.00, '#ffd45e'); // Bright golden lower crescent
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(ex, ey - 2, 39, 37, 0, 0, Math.PI * 2);
    ctx.fill();

    // E. Crisp Compact Pupil (12.5px)
    ctx.fillStyle = '#080302';
    ctx.beginPath();
    ctx.arc(ex, ey - 2, 12.5, 0, Math.PI * 2);
    ctx.fill();

    // F. Dual High-Contrast Specular Catchlights (Anime Glints)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + dir * 15, ey - 14, 14.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - dir * 15, ey + 12, 8.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // G. Crisp Graphic Black Upper Eyelash / Eyeliner Arch
    ctx.strokeStyle = '#0d0705';
    ctx.lineWidth = 10.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 88, ey + 6);
    ctx.bezierCurveTo(ex - dir * 50, ey - 41, ex + dir * 34, ey - 43, ex + dir * 98, ey - 6);
    ctx.stroke();

    // H. Subtle Lower Eyelid Definition Line
    ctx.strokeStyle = '#2a160e';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(ex - dir * 56, ey + 30);
    ctx.quadraticCurveTo(ex + dir * 4, ey + 36, ex + dir * 68, ey + 18);
    ctx.stroke();

    // I. Bold Angled Heroic Eyebrows (Positioned closely above upper lash at ey - 48..74 for focused fighter intensity)
    ctx.fillStyle = '#1b0d06';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 86, ey - 48);
    ctx.quadraticCurveTo(ex - dir * 8, ey - 76, ex + dir * 94, ey - 66);
    ctx.lineTo(ex + dir * 88, ey - 50);
    ctx.quadraticCurveTo(ex - dir * 8, ey - 60, ex - dir * 78, ey - 34);
    ctx.closePath();
    ctx.fill();
  });

  // 8. Clean Anime Nose Tip and Subtle Nostril Accent (eliminating harsh vertical stripe)
  ctx.fillStyle = '#c4825a';
  ctx.beginPath();
  ctx.arc(512, 638, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#180c06';
  ctx.lineWidth = 4.0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(508, 636);
  ctx.lineTo(516, 642);
  ctx.lineTo(504, 648);
  ctx.stroke();

  // 9. Mouth Expressions: Determined Line vs View 2 Cocky Battle Grin
  if (expression === 'grin') {
    // View 2 Confident Cocky Open-Mouthed Battle Grin matching reference sheet View 2!
    // A. Oral cavity interior
    ctx.fillStyle = '#3a1016';
    ctx.beginPath();
    ctx.moveTo(428, 745);
    ctx.quadraticCurveTo(512, 730, 596, 740);
    ctx.quadraticCurveTo(574, 822, 512, 826);
    ctx.quadraticCurveTo(450, 822, 428, 745);
    ctx.closePath();
    ctx.fill();

    // B. Gleaming White Upper Teeth
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(432, 747);
    ctx.quadraticCurveTo(512, 735, 592, 743);
    ctx.lineTo(586, 774);
    ctx.quadraticCurveTo(512, 778, 438, 774);
    ctx.closePath();
    ctx.fill();

    // C. Tooth Separation Lines
    ctx.strokeStyle = '#c4cad6';
    ctx.lineWidth = 2.5;
    [480, 512, 544].forEach((tx) => {
      ctx.beginPath();
      ctx.moveTo(tx, 741);
      ctx.lineTo(tx, 775);
      ctx.stroke();
    });

    // D. Bold Outer Mouth Ink Outline
    ctx.strokeStyle = '#120804';
    ctx.lineWidth = 8.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(426, 743);
    ctx.quadraticCurveTo(512, 728, 598, 738);
    ctx.quadraticCurveTo(576, 824, 512, 828);
    ctx.quadraticCurveTo(448, 824, 426, 743);
    ctx.stroke();

    // E. Lip Corner Crease Accents
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(424, 747);
    ctx.lineTo(416, 737);
    ctx.moveTo(600, 742);
    ctx.lineTo(608, 732);
    ctx.stroke();

    // F. Lower Lip Cel Shadow
    ctx.strokeStyle = '#b47048';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(484, 844);
    ctx.lineTo(540, 844);
    ctx.stroke();

  } else {
    // Views 1 & 3 Determined Athletic Mouth Line with Confident Corner
    ctx.strokeStyle = '#140a06';
    ctx.lineWidth = 8.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(442, 775);
    ctx.quadraticCurveTo(512, 763, 582, 767);
    ctx.stroke();

    // Right Corner Confident Up-Tick
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(580, 767);
    ctx.lineTo(590, 760);
    ctx.stroke();

    // Lower Lip Cel Shadow
    ctx.strokeStyle = '#b8724a';
    ctx.lineWidth = 7.0;
    ctx.beginPath();
    ctx.moveTo(478, 806);
    ctx.lineTo(546, 806);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _challengerHeadTexCache[expression] = tex;
  return tex;
}

let _challengerTorsoTex = null;
function createChallengerTorsoUVTexture() {
  if (_challengerTorsoTex) return _challengerTorsoTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Base Warm Skin Tone for Midriff (bottom of torso y = 740..1024) & Upper V-Neck Chest
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 1024, 1024);

  // --------------------------------------------------------------------------
  // BARE ATHLETIC MIDRIFF (y = 742..1024) — ORGANIC CEL-SHADED ANATOMY
  // --------------------------------------------------------------------------
  // A. Lateral Oblique Flank Shadows (#cf885c)
  ctx.fillStyle = '#cf885c';
  // Left flank sweep
  ctx.beginPath();
  ctx.moveTo(330, 742);
  ctx.quadraticCurveTo(370, 880, 435, 1024);
  ctx.lineTo(330, 1024);
  ctx.closePath();
  ctx.fill();
  // Right flank sweep
  ctx.beginPath();
  ctx.moveTo(694, 742);
  ctx.quadraticCurveTo(654, 880, 589, 1024);
  ctx.lineTo(694, 1024);
  ctx.closePath();
  ctx.fill();

  // B. 3 Diagonal Serratus Anterior / Oblique Muscle Slips on each flank
  ctx.strokeStyle = '#b87248';
  ctx.lineWidth = 6.0;
  ctx.lineCap = 'round';
  // Left flank slips
  ctx.beginPath();
  ctx.moveTo(345, 755); ctx.lineTo(430, 785);
  ctx.moveTo(355, 810); ctx.lineTo(435, 845);
  ctx.moveTo(365, 870); ctx.lineTo(440, 910);
  // Right flank slips
  ctx.moveTo(679, 755); ctx.lineTo(594, 785);
  ctx.moveTo(669, 810); ctx.lineTo(589, 845);
  ctx.moveTo(659, 870); ctx.lineTo(584, 910);
  ctx.stroke();

  // C. Rectus Abdominis Muscle Bellies (Pillow Volumes)
  // Upper Ab Pack Pair (y = 762..854)
  // Left upper pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(444, 762, 60, 92, [12, 6, 8, 14]); else ctx.fillRect(444, 762, 60, 92);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(448, 766, 52, 44, [10, 6, 6, 10]); else ctx.fillRect(448, 766, 52, 44);
  ctx.fill();

  // Right upper pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(520, 762, 60, 92, [6, 12, 14, 8]); else ctx.fillRect(520, 762, 60, 92);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(524, 766, 52, 44, [6, 10, 10, 6]); else ctx.fillRect(524, 766, 52, 44);
  ctx.fill();

  // Lower Ab Pack Pair (y = 878..972)
  // Left lower pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(446, 878, 58, 94, [10, 6, 12, 10]); else ctx.fillRect(446, 878, 58, 94);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(450, 882, 50, 42, [8, 6, 6, 8]); else ctx.fillRect(450, 882, 50, 42);
  ctx.fill();

  // Right lower pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(520, 878, 58, 94, [6, 10, 10, 12]); else ctx.fillRect(520, 878, 58, 94);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(524, 882, 50, 42, [6, 8, 8, 6]); else ctx.fillRect(524, 882, 50, 42);
  ctx.fill();

  // D. Umbilicus (Navel) at (512, 942)
  ctx.fillStyle = '#8a4822';
  ctx.beginPath();
  ctx.arc(512, 942, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f7cbab';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(512, 940, 6.5, Math.PI * 0.8, Math.PI * 2.2);
  ctx.stroke();

  // E. Iliac Furrow / V-Cut Grooves pointing to beltline
  ctx.strokeStyle = '#b46e44';
  ctx.lineWidth = 5.0;
  ctx.beginPath();
  ctx.moveTo(438, 980);
  ctx.lineTo(475, 1018);
  ctx.moveTo(586, 980);
  ctx.lineTo(549, 1018);
  ctx.stroke();

  // F. Refined Comic Ink Crease Contours (#26130c)
  ctx.strokeStyle = '#26130c';
  ctx.lineWidth = 4.0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Central vertical Linea Alba groove
  ctx.moveTo(512, 742);
  ctx.lineTo(512, 934);
  ctx.moveTo(512, 950);
  ctx.lineTo(512, 1018);

  // Tendinous Intersections (Arched dividers between packs)
  ctx.moveTo(442, 862);
  ctx.quadraticCurveTo(478, 868, 506, 862);
  ctx.moveTo(518, 862);
  ctx.quadraticCurveTo(546, 868, 582, 862);

  ctx.moveTo(444, 974);
  ctx.quadraticCurveTo(476, 980, 506, 974);
  ctx.moveTo(518, 974);
  ctx.quadraticCurveTo(548, 980, 580, 974);

  // Lateral boundaries (Linea Semilunaris)
  ctx.moveTo(442, 755);
  ctx.quadraticCurveTo(436, 860, 444, 980);
  ctx.moveTo(582, 755);
  ctx.quadraticCurveTo(588, 860, 580, 980);
  ctx.stroke();

  // G. Back Midriff Spinal Groove & Lumbar Lines (View 4, x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.fillStyle = '#cf885c';
    ctx.fillRect(-12, 742, 24, 276);
    ctx.strokeStyle = '#26130c';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 746);
    ctx.lineTo(0, 1014);
    // Lumbar dimple accents
    ctx.moveTo(-58, 790);
    ctx.lineTo(-50, 980);
    ctx.moveTo(58, 790);
    ctx.lineTo(50, 980);
    ctx.stroke();
  });

  // --------------------------------------------------------------------------
  // 2. FITTED DARK-CHARCOAL CREW-NECK TANK TOP (Center Channel x = 425..599)
  // --------------------------------------------------------------------------
  ctx.fillStyle = '#1b1d23';
  ctx.fillRect(425, 275, 174, 468);

  // Subtle horizontal pectoral & ribcage fold lines on dark tank top
  ctx.strokeStyle = '#0d0e12';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(435, 275);
  ctx.quadraticCurveTo(512, 295, 589, 275);
  ctx.moveTo(450, 445);
  ctx.quadraticCurveTo(512, 460, 574, 445);
  ctx.moveTo(425, 742);
  ctx.lineTo(599, 742);
  ctx.stroke();

  // Bare V-Neck Upper Chest & Clavicles above Tank Top (x = 430..594, y = 0..275)
  ctx.strokeStyle = '#26130c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  // Clavicles
  ctx.moveTo(450, 195);
  ctx.lineTo(498, 222);
  ctx.moveTo(574, 195);
  ctx.lineTo(526, 222);
  // Neck tendons
  ctx.moveTo(476, 85);
  ctx.lineTo(502, 205);
  ctx.moveTo(548, 85);
  ctx.lineTo(522, 205);
  ctx.stroke();

  // --------------------------------------------------------------------------
  // 3. CROPPED MATTE-CHARCOAL BOMBER JACKET SHELL (#2b2e36)
  // --------------------------------------------------------------------------
  ctx.fillStyle = '#2b2e36';
  ctx.fillRect(0, 0, 442, 665);
  ctx.fillRect(582, 0, 442, 665);

  // Cel-shaded darker charcoal side/underarm panels for 3D depth
  ctx.fillStyle = '#21242b';
  ctx.fillRect(210, 100, 95, 565);
  ctx.fillRect(719, 100, 95, 565);

  // --------------------------------------------------------------------------
  // 4. SEGMENTED CRIMSON-RED RIBBED BOTTOM WAIST HEM (#c8242a) at y = 665..742
  // --------------------------------------------------------------------------
  ctx.fillStyle = '#c8242a';
  ctx.fillRect(0, 665, 442, 77);
  ctx.fillRect(582, 665, 442, 77);

  // Vertical black elastic rib lines along the crimson waist hem
  ctx.strokeStyle = '#120d10';
  ctx.lineWidth = 4.5;
  for (let rx = 12; rx < 1024; rx += 26) {
    if (rx > 438 && rx < 586) continue;
    ctx.beginPath();
    ctx.moveTo(rx, 665);
    ctx.lineTo(rx, 742);
    ctx.stroke();
  }

  // Bold black ink borders around jacket opening & waist hem
  ctx.strokeStyle = '#0e0e12';
  ctx.lineWidth = 7;
  ctx.beginPath();
  // Left & Right open front zipper edges
  ctx.moveTo(442, 90);
  ctx.lineTo(442, 742);
  ctx.moveTo(582, 90);
  ctx.lineTo(582, 742);
  // Top & Bottom of crimson ribbed waist hem
  ctx.moveTo(0, 665);
  ctx.lineTo(442, 665);
  ctx.moveTo(582, 665);
  ctx.lineTo(1024, 665);
  ctx.moveTo(0, 742);
  ctx.lineTo(442, 742);
  ctx.moveTo(582, 742);
  ctx.lineTo(1024, 742);
  ctx.stroke();

  // Angled Slash Pocket Welts on Front Left & Right Charcoal Panels
  ctx.strokeStyle = '#111216';
  ctx.lineWidth = 6.5;
  [
    [392, 535, 336, 618],
    [632, 535, 688, 618]
  ].forEach(([x0, y0, x1, y1]) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = '#3c404b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 - 5, y0 - 4);
    ctx.lineTo(x1 - 5, y1 - 4);
    ctx.stroke();
    ctx.strokeStyle = '#111216';
    ctx.lineWidth = 6.5;
  });

  // --------------------------------------------------------------------------
  // 5. VIEW 4 BACK EMBLEM: HERO 1.15x SKULL WEARING RED-AND-WHITE DJ HEADPHONES
  // --------------------------------------------------------------------------
  drawOnBackSeam(ctx, () => {
    ctx.save();
    ctx.translate(0, 335);
    ctx.scale(1.15, 1.15);

    // Subtle back panel seam lines above and below skull
    ctx.strokeStyle = '#16181e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-175, -165);
    ctx.lineTo(175, -165);
    ctx.stroke();

    // Headphones Headband: Outer black border (30px), Crimson band (22px), White inner cushion (8px)
    ctx.lineWidth = 30;
    ctx.strokeStyle = '#0e0f14';
    ctx.beginPath();
    ctx.arc(0, -14, 122, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();

    ctx.lineWidth = 22;
    ctx.strokeStyle = '#c8242a';
    ctx.beginPath();
    ctx.arc(0, -14, 122, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#f5f6f8';
    ctx.beginPath();
    ctx.arc(0, -14, 113, Math.PI * 0.97, Math.PI * 2.03);
    ctx.stroke();

    // Headband radial cushion segment ticks
    ctx.strokeStyle = '#0e0f14';
    ctx.lineWidth = 2.5;
    for (let th = 1.05; th <= 1.95; th += 0.15) {
      const cosT = Math.cos(th * Math.PI);
      const sinT = Math.sin(th * Math.PI);
      ctx.beginPath();
      ctx.moveTo(cosT * 109, -14 + sinT * 109);
      ctx.lineTo(cosT * 117, -14 + sinT * 117);
      ctx.stroke();
    }

    // Over-Ear DJ Cans (Red outer shell, White inner cushion pad, Silver bracket)
    [-122, 122].forEach((hx) => {
      const sign = Math.sign(hx);
      // Silver/white swivel bracket
      ctx.fillStyle = '#f5f6f8';
      ctx.strokeStyle = '#0e0f14';
      ctx.lineWidth = 5;
      ctx.fillRect(hx - 12, -42, 24, 20);
      ctx.strokeRect(hx - 12, -42, 24, 20);

      // Crimson outer earcup dome
      ctx.fillStyle = '#c8242a';
      ctx.strokeStyle = '#0e0f14';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(hx, 10, 26, 44, sign * -0.10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // White inner cushion pad
      ctx.fillStyle = '#f5f6f8';
      ctx.beginPath();
      ctx.ellipse(hx - sign * 8, 10, 14, 34, sign * -0.10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Dark core driver accent
      ctx.fillStyle = '#1c1e24';
      ctx.beginPath();
      ctx.ellipse(hx + sign * 6, 10, 8, 20, sign * -0.10, 0, Math.PI * 2);
      ctx.fill();
    });

    // Streetwear Skull Graphic
    ctx.fillStyle = '#f5f6f8';
    ctx.strokeStyle = '#0e0f14';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, -16, 88, Math.PI * 0.82, Math.PI * 2.18);
    // Flared zygomatic cheekbones & squared maxilla
    ctx.lineTo(76, 40);
    ctx.lineTo(50, 60);
    ctx.lineTo(44, 106);
    ctx.lineTo(-44, 106);
    ctx.lineTo(-50, 60);
    ctx.lineTo(-76, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cool-grey temple and cheek cel-shading
    ctx.fillStyle = '#d6dae2';
    ctx.beginPath();
    ctx.arc(-56, -18, 22, 0, Math.PI * 2);
    ctx.arc(56, -18, 22, 0, Math.PI * 2);
    ctx.fill();

    // Aggressive Angled Comic Eye Sockets
    ctx.fillStyle = '#101116';
    [-36, 36].forEach((ex) => {
      ctx.beginPath();
      ctx.ellipse(ex, 12, 24, 26, ex < 0 ? 0.24 : -0.24, 0, Math.PI * 2);
      ctx.fill();
    });

    // Brow furrow ticks above eye sockets
    ctx.strokeStyle = '#0e0f14';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, -4);
    ctx.lineTo(-6, 4);
    ctx.moveTo(16, -4);
    ctx.lineTo(6, 4);
    ctx.stroke();

    // Flared Inverted-Heart Nasal Cavity
    ctx.fillStyle = '#101116';
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(-14, 60);
    ctx.quadraticCurveTo(0, 54, 14, 60);
    ctx.closePath();
    ctx.fill();

    // 4 Clean White Tooth Blocks with Ink Lines
    ctx.strokeStyle = '#101116';
    ctx.lineWidth = 5.5;
    [-22, 0, 22].forEach((tx) => {
      ctx.beginPath();
      ctx.moveTo(tx, 72);
      ctx.lineTo(tx, 104);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-42, 88);
    ctx.lineTo(42, 88);
    ctx.stroke();

    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _challengerTorsoTex = tex;
  return tex;
}

let _challengerPelvisTex = null;
function createChallengerPelvisUVTexture() {
  if (_challengerPelvisTex) return _challengerPelvisTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark charcoal-slate cargo pants base (#2e323a)
  ctx.fillStyle = '#2e323a';
  ctx.fillRect(0, 0, 1024, 512);

  // Crimson-Red Belt (#c8242a) along top of pelvis (y = 18..118)
  ctx.fillStyle = '#c8242a';
  ctx.fillRect(0, 18, 1024, 100);

  // Top & Bottom Black Ink Borders of Belt
  ctx.strokeStyle = '#0e0e12';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(1024, 18);
  ctx.moveTo(0, 118);
  ctx.lineTo(1024, 118);
  ctx.stroke();

  // Matte-Silver Rectangular Belt Buckle at Center Front (x = 512, y = 14..122)
  ctx.fillStyle = '#9aa2ad';
  ctx.strokeStyle = '#0e0e12';
  ctx.lineWidth = 8;
  ctx.fillRect(466, 14, 92, 108);
  ctx.strokeRect(466, 14, 92, 108);
  // Inner buckle highlight
  ctx.fillStyle = '#bcc4cf';
  ctx.fillRect(474, 22, 76, 36);

  // Dark Charcoal Belt Loops around Waist
  [120, 290, 418, 606, 734, 904].forEach((lx) => {
    ctx.fillStyle = '#24272e';
    ctx.fillRect(lx - 13, 10, 26, 116);
    ctx.strokeRect(lx - 13, 10, 26, 116);
  });

  // Front Center Fly Seam & Angled Pocket Seams (x = 512)
  ctx.strokeStyle = '#121418';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(512, 118);
  ctx.lineTo(512, 410);
  ctx.moveTo(512, 130);
  ctx.lineTo(486, 140);
  ctx.lineTo(486, 360);
  ctx.quadraticCurveTo(486, 395, 512, 405);
  // Front slash pockets
  ctx.moveTo(410, 122);
  ctx.lineTo(310, 275);
  ctx.moveTo(614, 122);
  ctx.lineTo(714, 275);
  // Crotch V-creases
  ctx.moveTo(455, 395);
  ctx.lineTo(512, 445);
  ctx.lineTo(569, 395);
  ctx.stroke();

  // View 4 Back Center Seam & Shield-Shaped Rear Patch Pockets (x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.strokeStyle = '#0e1014';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 118);
    ctx.lineTo(0, 470);
    ctx.stroke();

    // Prominent Shield-Shaped Rear Patch Pockets with High-Contrast Stitching
    [-92, 92].forEach((px) => {
      ctx.fillStyle = '#22252c';
      ctx.strokeStyle = '#0e1014';
      ctx.lineWidth = 7.5;

      ctx.beginPath();
      ctx.moveTo(px - 58, 165);
      ctx.lineTo(px + 58, 165);
      ctx.lineTo(px + 54, 345);
      ctx.lineTo(px, 395);
      ctx.lineTo(px - 54, 345);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top reinforcement flap & pocket opening seam
      ctx.beginPath();
      ctx.moveTo(px - 56, 210);
      ctx.lineTo(px, 228);
      ctx.lineTo(px + 56, 210);
      ctx.stroke();

      // Interior double-stitch decorative V-seam
      ctx.strokeStyle = '#383e4a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(px - 44, 250);
      ctx.lineTo(px, 310);
      ctx.lineTo(px + 44, 250);
      ctx.stroke();
    });
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _challengerPelvisTex = tex;
  return tex;
}

let _challengerPantsLegTex = null;
function createChallengerPantsLegUVTexture() {
  if (_challengerPantsLegTex) return _challengerPantsLegTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark charcoal-slate cargo pants (#2e323a)
  ctx.fillStyle = '#2e323a';
  ctx.fillRect(0, 0, 512, 512);

  // Darker cel-shaded inner/under-knee shadow folds
  ctx.fillStyle = '#22252b';
  ctx.fillRect(0, 0, 95, 512);
  ctx.fillRect(417, 0, 95, 512);

  // Ribbed Mid-Calf Elastic Cuff at bottom of pants (y = 435..512) in #3a3e47
  ctx.fillStyle = '#3a3e47';
  ctx.fillRect(0, 435, 512, 77);

  ctx.strokeStyle = '#121418';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 435);
  ctx.lineTo(512, 435);
  // Dynamic knee & calf cloth fold creases matching turnaround sheet
  ctx.moveTo(190, 225);
  ctx.quadraticCurveTo(256, 255, 330, 220);
  ctx.moveTo(165, 365);
  ctx.quadraticCurveTo(256, 398, 355, 360);
  ctx.moveTo(210, 405);
  ctx.lineTo(245, 435);
  ctx.moveTo(305, 405);
  ctx.lineTo(270, 435);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _challengerPantsLegTex = tex;
  return tex;
}

function createChallengerShinUVTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Base warm fair-tan skin tone
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 256, 512);

  // Soft lateral & medial cel shade gradients (x = 0..40 and x = 216..256)
  const leftGrad = ctx.createLinearGradient(0, 0, 50, 0);
  leftGrad.addColorStop(0, 'rgba(196, 122, 85, 0.55)');
  leftGrad.addColorStop(1, 'rgba(196, 122, 85, 0.0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, 50, 512);

  const rightGrad = ctx.createLinearGradient(256, 0, 206, 0);
  rightGrad.addColorStop(0, 'rgba(196, 122, 85, 0.55)');
  rightGrad.addColorStop(1, 'rgba(196, 122, 85, 0.0)');
  ctx.fillStyle = rightGrad;
  ctx.fillRect(206, 0, 50, 512);

  // Anterior tibial bone highlight band down the front center (x = 128)
  const centerGrad = ctx.createLinearGradient(114, 0, 142, 0);
  centerGrad.addColorStop(0, 'rgba(247, 203, 171, 0.0)');
  centerGrad.addColorStop(0.5, 'rgba(247, 203, 171, 0.45)');
  centerGrad.addColorStop(1, 'rgba(247, 203, 171, 0.0)');
  ctx.fillStyle = centerGrad;
  ctx.fillRect(114, 40, 28, 430);

  // Subtle ankle tendon crease accent marks near base
  ctx.strokeStyle = 'rgba(74, 38, 22, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(120, 440);
  ctx.lineTo(136, 440);
  ctx.moveTo(116, 460);
  ctx.lineTo(140, 460);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// 3. GROUND-TRUTH 3D CHALLENGER MODEL (100% 4-ANGLE TURNAROUND PARITY)
//    Local Frame: Front = -Z, Back = +Z, Challenger Right Hip = +X (Viewer's Left in View 1)
//    Total Height: 2.00m (Soles at y = 0.00m, Hair Crown at y = 2.00m)
// ============================================================================
export function buildChallengerModel() {
  setFighterShadowScope(true);
  const root = new THREE.Group();

  // Grounded dynamic contact shadow decal beneath fighter
  const contactShadowDecal = createContactShadowDecal(1.2, 0.9, 0.50);
  contactShadowDecal.name = 'contact_shadow_decal';
  contactShadowDecal.position.set(0, 0.015, 0);
  root.add(contactShadowDecal);

  const hips = new THREE.Group();
  hips.position.y = 1.07; // Calibrated to exact 50-slice ground-truth belt/crotch height
  root.add(hips);

  const SKIN_HEX = 0xebb690;
  const CHARCOAL_HEX = 0x2b2e36;
  const PANTS_HEX = 0x2e323a;
  const CRIMSON_HEX = 0xc8242a;

  // --------------------------------------------------------------------------
  // 1. SCULPTED PELVIS, CRIMSON BELT & RIGHT-HIP (+X) GLOWING YELLOW CHAIN
  // --------------------------------------------------------------------------
  const pelvisSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [-0.090, 0.136, 0.078, 0.084, 0, 0.004, 2.20], // High natural crotch inseam split (y_world = 0.98m)
    [-0.050, 0.156, 0.094, 0.100, 0, 0.003, 2.25], // Hip joint level (y_world = 1.02m)
    [ 0.000, 0.166, 0.102, 0.108, 0, 0.002, 2.30], // Mid-hip curve (y_world = 1.07m)
    [ 0.045, 0.160, 0.094, 0.100, 0, 0.000, 2.30]  // Waistband & belt line (y_world = 1.115m)
  ];
  const pelvisGeo = createSculptedLoftGeometry(pelvisSlices, 32, true, true, true);
  const pelvisMesh = createHiFiMesh(pelvisGeo, 0xffffff, 0.032, createChallengerPelvisUVTexture());
  hips.add(pelvisMesh);

  // 3D Center Silver Belt Buckle Accent on Front (-Z)
  const buckleMesh = createHiFiMesh(
    new THREE.BoxGeometry(0.062, 0.046, 0.018),
    0xaab2bd,
    0.024,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.86, glintIntensity: 1.4 }
  );
  buckleMesh.position.set(0, 0.022, -0.094);
  hips.add(buckleMesh);

  // 6 3D Charcoal Belt Loops around Waistband
  const beltLoopCoords = [
    [-0.065, 0.022, -0.094, 0],            // Front-left
    [ 0.065, 0.022, -0.094, 0],            // Front-right
    [-0.165, 0.022,  0.000, Math.PI / 2],  // Side-left
    [ 0.165, 0.022,  0.000, Math.PI / 2],  // Side-right
    [-0.075, 0.022,  0.100, 0],            // Back-left
    [ 0.075, 0.022,  0.100, 0]             // Back-right
  ];
  beltLoopCoords.forEach(([lx, ly, lz, ry]) => {
    const loop = createHiFiMesh(
      new THREE.BoxGeometry(0.014, 0.048, 0.012),
      0x22252c,
      0.020
    );
    loop.position.set(lx, ly, lz);
    loop.rotation.y = ry;
    hips.add(loop);
  });

  // SIGNATURE GLOWING NEON-YELLOW HIP CHAIN ON CHALLENGER'S RIGHT HIP (Local +X ONLY)
  // Anchored at front-right belt loop (+X, -Z) and rear-right belt loop (+X, +Z)
  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.072, 0.022, -0.094), // Front-right belt loop anchor
    new THREE.Vector3(0.135, -0.015, -0.090),
    new THREE.Vector3(0.185, -0.065, -0.060),
    new THREE.Vector3(0.215, -0.130, -0.010), // Deepest catenary dip on outer thigh
    new THREE.Vector3(0.208, -0.145, 0.035),  // Hanging loop apex
    new THREE.Vector3(0.180, -0.080, 0.075),
    new THREE.Vector3(0.135, -0.020, 0.095),
    new THREE.Vector3(0.082, 0.022, 0.100)   // Rear-right belt loop anchor
  ]);
  const chainCoreGeo = new THREE.TubeGeometry(chainCurve, 36, 0.010, 8, false);
  const chainCoreMat = new THREE.MeshBasicMaterial({ color: 0xffff44 });
  const chainCore = new THREE.Mesh(chainCoreGeo, chainCoreMat);
  hips.add(chainCore);

  const chainGlowGeo = new THREE.TubeGeometry(chainCurve, 36, 0.022, 8, false);
  const chainGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const chainGlow = new THREE.Mesh(chainGlowGeo, chainGlowMat);
  hips.add(chainGlow);

  // Metallic Silver Attachment D-Rings at Anchors
  [-0.094, 0.100].forEach((zPos, idx) => {
    const dRing = createHiFiMesh(
      new THREE.TorusGeometry(0.011, 0.003, 8, 16),
      0xaab2bd,
      0.016
    );
    dRing.position.set(idx === 0 ? 0.072 : 0.082, 0.022, zPos);
    dRing.rotation.y = Math.PI / 2;
    hips.add(dRing);
  });

  // --------------------------------------------------------------------------
  // 2. SCULPTED LOFTED TORSO (BARE 6-PACK MIDRIFF + OPEN CROPPED BOMBER JACKET)
  // --------------------------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.04; // y_world = 1.11m
  hips.add(torso);

  const torsoSlices = [
    // Bare Athletic Midriff (y = 0.00..0.14 -> y_world = 1.11m..1.25m)
    [0.00, 0.150, 0.084, 0.090, 0, 0.000, 2.2],
    [0.07, 0.144, 0.082, 0.088, 0, 0.000, 2.2],
    [0.13, 0.148, 0.085, 0.090, 0, 0.000, 2.2],
    // Cropped Bomber Jacket Crimson Ribbed Waist Hem (y = 0.14..0.19 -> y_world = 1.25m..1.30m)
    [0.14, 0.168, 0.098, 0.104, 0, 0.002, 2.3],
    [0.19, 0.174, 0.102, 0.108, 0, 0.002, 2.3],
    // Athletic V-Tapered Bomber Jacket Chest (y = 0.20..0.48 -> y_world = 1.31m..1.59m)
    [0.28, 0.190, 0.112, 0.118, 0, 0.004, 2.25],
    [0.38, 0.204, 0.118, 0.124, 0, 0.006, 2.25],
    [0.44, 0.194, 0.110, 0.116, 0, 0.005, 2.15],
    // Smooth Trapezoid Shoulder Slope into Neck Base (y = 0.48..0.52 -> y_world = 1.59m..1.63m)
    [0.48, 0.164, 0.094, 0.100, 0, 0.004, 2.05],
    [0.52, 0.095, 0.075, 0.080, 0, 0.002, 2.00]
  ];
  const torsoGeo = createSculptedLoftGeometry(torsoSlices, 36, true, true, true);
  const torsoMesh = createHiFiMesh(torsoGeo, 0xffffff, 0.032, createChallengerTorsoUVTexture());
  torso.add(torsoMesh);

  // --------------------------------------------------------------------------
  // 3. WIDE V-FLARED STANDING COLLAR (CHARCOAL OUTER BACK/SIDE, CRIMSON INNER/FRONT V)
  // --------------------------------------------------------------------------
  const collarGroup = new THREE.Group();
  collarGroup.position.set(0, 0.48, 0.005); // y_world = 1.59m
  torso.add(collarGroup);

  // Overhauled Flared Lapel Collar angled upward at a 45-degree V-angle framing neck and jaw
  function buildFlaredCollarMesh(radiusScale, heightScale, openBase, openTop, colorHex, outlineThick) {
    const segsU = 32;
    const segsV = 6;
    const pos = [];
    const ind = [];
    for (let iv = 0; iv <= segsV; iv++) {
      const v = iv / segsV; // 0 at neck base (y=0), 1 at flared rim
      const halfOpenAngle = openBase + v * (openTop - openBase);

      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU;
        // theta: back nape is 0, sweeping to front lapel tips at ±(PI - halfOpenAngle)
        const theta = -Math.PI + halfOpenAngle + u * (Math.PI * 2 - halfOpenAngle * 2);
        const angleFrac = Math.abs(theta) / Math.PI; // 0 at back nape, ~0.75 at front lapel tips

        // Angle collar lapels upward at a natural V-angle framing neck, jawline, and clavicles (toned down ~20%)
        const lapelRise = 0.068 * Math.pow(angleFrac, 1.25);
        const y = v * (0.076 + lapelRise) * heightScale;
        const flareFactorX = 0.032 + 0.024 * Math.sin(angleFrac * Math.PI * 0.95);
        const rx = (0.084 + v * flareFactorX) * radiusScale;
        const rz = (0.084 + v * 0.022 * (1.0 - 0.25 * angleFrac)) * radiusScale;
        const drapeZ = -v * 0.024 * Math.pow(angleFrac, 1.20);

        const x = -Math.sin(theta) * rx;
        const z = Math.cos(theta) * rz + drapeZ;
        pos.push(x, y, z);
      }
    }
    const stride = segsU + 1;
    for (let iv = 0; iv < segsV; iv++) {
      for (let iu = 0; iu < segsU; iu++) {
        const a = iv * stride + iu;
        const b = a + 1;
        const d = (iv + 1) * stride + iu;
        const c = d + 1;
        ind.push(a, b, d);
        ind.push(b, c, d);
      }
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

  // Outer Charcoal Collar Shell covering Side Profile (View 3) and Back (View 4)
  const collarOuter = buildFlaredCollarMesh(1.00, 0.96, 0.44, 1.08, CHARCOAL_HEX, 0.024);
  collarGroup.add(collarOuter);

  // Inner Crimson Collar Lining & Front V-Lapel Edge (prominently visible in Front View 1 & 3/4 View 2!)
  const collarInner = buildFlaredCollarMesh(1.018, 1.00, 0.36, 1.02, CRIMSON_HEX, 0.018);
  collarInner.position.set(0, 0.003, -0.003);
  collarGroup.add(collarInner);

  // --------------------------------------------------------------------------
  // 4. SCULPTED ANIME HEAD, 3D EARS, NOSE & LAYERED CHESTNUT HAIR LOCKS
  // --------------------------------------------------------------------------
  // Lean Cylindrical Neck Column
  const neckSlices = [
    [-0.02, 0.058, 0.056, 0.058, 0, 0.005, 2.0],
    [0.06,  0.052, 0.052, 0.054, 0, 0.002, 2.0],
    [0.13,  0.054, 0.054, 0.056, 0, 0.000, 2.0]
  ];
  const neckMesh = createHiFiMesh(createSculptedLoftGeometry(neckSlices, 24, true, false, false), SKIN_HEX, 0.028);
  neckMesh.position.y = 0.49;
  torso.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.65, 0); // y_world = 1.76m (Eye line at y_world = 1.74m)
  torso.add(headGroup);

  // Sculpted Anime Head Loft: Sharp V-Jawline, Pointed Chin & Heroic Proportions
  // yMin = -0.110m, yMax = +0.116m, ySpan = 0.226m
  // Max Width = 2 * rx = 0.176m -> Width/Height Ratio = 0.176 / 0.226 = 0.779 (~0.78 Anime Standard)
  const headSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [-0.110, 0.016, 0.036, 0.024, 0.0, -0.042, 2.15], // 1. Sharp pointed anime chin tip (z_front = -0.078)
    [-0.082, 0.042, 0.058, 0.044, 0.0, -0.024, 2.15], // 2. Lower jawline V-taper (z_front = -0.082)
    [-0.055, 0.064, 0.076, 0.066, 0.0, -0.012, 2.10], // 3. Mouth & gonion angle (z_front = -0.088)
    [-0.026, 0.078, 0.088, 0.082, 0.0, -0.005, 2.05], // 4. Philtrum & upper jaw (z_front = -0.093)
    [ 0.004, 0.088, 0.095, 0.094, 0.0, -0.001, 2.05], // 5. Cheekbones, nose radix & eye level MIDLINE (z_front = -0.096)
    [ 0.038, 0.085, 0.090, 0.095, 0.0,  0.002, 2.00], // 6. Brow ridge & temple contour (z_front = -0.088)
    [ 0.076, 0.076, 0.078, 0.088, 0.0,  0.005, 2.00], // 7. Forehead & anterior hairline (z_front = -0.073)
    [ 0.116, 0.050, 0.052, 0.062, 0.0,  0.008, 2.00]  // 8. Top of cranium dome under hair (z_front = -0.044)
  ];
  const headGeo = createSculptedLoftGeometry(headSlices, 32, true, true, true);
  const headTexDetermined = createChallengerHeadUVTexture('determined');
  const headTexGrin = createChallengerHeadUVTexture('grin');
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.030, headTexDetermined);
  headGroup.add(headMesh);

  // Sleek 3D Anime Nose Bridge and Sharp Tip aligned with Midline Eye Placement
  // Zero back-face outline (0.0) so no vertical black stripe cuts down the front of the nose!
  const nosePts = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [0.000, 0.004, 0.005, 0.002, 0.0,  0.000, 2.0], // Philtrum base (y_head = -0.042)
    [0.016, 0.007, 0.022, 0.004, 0.0, -0.006, 2.2], // Sharp nose tip (y_head = -0.026, z_front = -0.122)
    [0.032, 0.005, 0.012, 0.003, 0.0, -0.003, 2.0], // Mid-bridge slope (y_head = -0.010)
    [0.046, 0.003, 0.004, 0.002, 0.0,  0.000, 2.0]  // Radix between eyes (y_head = +0.004)
  ];
  const noseMesh = createHiFiMesh(
    createSculptedLoftGeometry(nosePts, 16, true, true, true),
    SKIN_HEX,
    0.0
  );
  noseMesh.position.set(0.0, -0.042, -0.094);
  headGroup.add(noseMesh);

  // Sculpted 3D Ears on Left (-X) and Right (+X) centered at Midline Eye Level
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.030, 0.008, 0.014, 0.014, 0, 0, 2.0],
      [-0.010, 0.015, 0.022, 0.022, side * 0.004, 0, 2.0],
      [ 0.016, 0.017, 0.024, 0.024, side * 0.006, 0, 2.0],
      [ 0.032, 0.009, 0.015, 0.015, 0, 0, 2.0]
    ];
    const ear = createHiFiMesh(createSculptedLoftGeometry(earSlices, 12, true, true, true), SKIN_HEX, 0.022);
    ear.position.set(side * 0.088, 0.000, 0.005);
    ear.rotation.set(-0.06, side * -0.16, side * 0.10);
    headGroup.add(ear);
  });

  // --------------------------------------------------------------------------
  // 4. LAYERED CHESTNUT-BROWN ANIME HAIR SCULPT (5-LAYER ANIME SYSTEM)
  // --------------------------------------------------------------------------
  const hairGroup = new THREE.Group();
  headGroup.add(hairGroup);

  const HAIR_MID   = 0x784428;
  const HAIR_LIGHT = 0x965636;
  const HAIR_DARK  = 0x4e2a18;

  // Full-Volume Rounded Anime Hair Base Cap framing Occiput, Temples, and Crown
  const hairBaseSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [-0.055, 0.082, 0.018, 0.102, 0.0, 0.030, 2.0],  // Nape of neck over collar
    [-0.005, 0.106, 0.036, 0.116, 0.0, 0.022, 2.05], // Lower occiput behind ears
    [ 0.048, 0.118, 0.058, 0.122, 0.0, 0.014, 2.05], // Mid occiput / temple level (recessed behind forehead skin!)
    [ 0.095, 0.122, 0.080, 0.122, 0.0, 0.008, 2.05], // Upper hairline (z_front = -0.072, behind 3D bangs!)
    [ 0.138, 0.114, 0.082, 0.112, 0.0, 0.008, 2.00], // Full parietal dome
    [ 0.168, 0.094, 0.068, 0.092, 0.0, 0.010, 2.00], // Upper rounded crown dome
    [ 0.190, 0.062, 0.044, 0.062, 0.0, 0.012, 2.00], // Crown apex dome slope
    [ 0.202, 0.028, 0.020, 0.028, 0.0, 0.014, 2.00]  // Rounded crown cap peak
  ];
  const hairBaseMesh = createHiFiMesh(
    createSculptedLoftGeometry(hairBaseSlices, 32, true, true, true),
    HAIR_MID,
    0.024
  );
  hairGroup.add(hairBaseMesh);

  // Specialized Hair Lock Geometries (Sweeping 3D Forehead Bangs, Tousled Crown & Lateral Tufts)
  const geoBangCenter  = createCurvedHairLockGeometry(0.058, 0.048, 0.024,  0.005,  0.004);
  const geoBangMed     = createCurvedHairLockGeometry(0.064, 0.054, 0.026,  0.006, -0.006);
  const geoBangSide    = createCurvedHairLockGeometry(0.068, 0.052, 0.026,  0.006,  0.008);
  const geoSideburn    = createCurvedHairLockGeometry(0.108, 0.046, 0.028,  0.012, -0.008);
  const geoCrownTall   = createCurvedHairLockGeometry(0.096, 0.082, 0.048,  0.020,  0.004);
  const geoCrownWide   = createCurvedHairLockGeometry(0.088, 0.078, 0.044,  0.018, -0.006);
  const geoLateral     = createCurvedHairLockGeometry(0.102, 0.076, 0.040,  0.018,  0.020);
  const geoNapeShingle = createCurvedHairLockGeometry(0.094, 0.070, 0.028,  0.014,  0.004);

  // 31-Lock Master Specifications Array across 5 Functional Anime Layers
  // Strictly validated against tests/test_challenger_sculpt_verification.py bounds:
  // Layer 1 Bangs:   z < -0.07, y: 0.09..0.12, |x| < 0.08 (Count: 7)
  // Layer 2 Temple:  |x| >= 0.08, z <= 0.0 (Count: 4)
  // Layer 3 Crown:   y >= 0.13 (Count: 6)
  // Layer 4 Lateral: |x| >= 0.07, z >= 0.0, y < 0.13 (Count: 6)
  // Layer 5 Nape:    z >= 0.07, y < 0.13, |x| < 0.07 (Count: 8)
  const hairLockSpecs = [
    // ------------------------------------------------------------------------
    // LAYER 1: Forehead Bangs (7 overlapping 3D chestnut locks hugging upper forehead above eyebrows!)
    // Bounds: z < -0.07, y: 0.09..0.12, |x| < 0.08 (Count: 7)
    // ------------------------------------------------------------------------
    { geo: geoBangCenter, pos: [ 0.000, 0.106, -0.078], rot: [Math.PI + 0.04,  0.00,  0.12], col: HAIR_LIGHT, outline: 0.001 },
    { geo: geoBangMed,    pos: [ 0.022, 0.104, -0.077], rot: [Math.PI + 0.05, -0.10,  0.28], col: HAIR_MID,   outline: 0.001 },
    { geo: geoBangSide,   pos: [ 0.045, 0.100, -0.075], rot: [Math.PI + 0.05, -0.18,  0.40], col: HAIR_LIGHT, outline: 0.001 },
    { geo: geoBangSide,   pos: [ 0.066, 0.095, -0.072], rot: [Math.PI + 0.05, -0.26,  0.48], col: HAIR_DARK,  outline: 0.002 },
    { geo: geoBangMed,    pos: [-0.022, 0.104, -0.077], rot: [Math.PI + 0.05,  0.10, -0.26], col: HAIR_LIGHT, outline: 0.001 },
    { geo: geoBangSide,   pos: [-0.045, 0.100, -0.075], rot: [Math.PI + 0.05,  0.18, -0.38], col: HAIR_MID,   outline: 0.001 },
    { geo: geoBangSide,   pos: [-0.066, 0.095, -0.072], rot: [Math.PI + 0.05,  0.26, -0.48], col: HAIR_DARK,  outline: 0.002 },

    // ------------------------------------------------------------------------
    // LAYER 2: Temple Sideburn Locks (Framing temples and cheekbones in front of ears)
    // Bounds: |x| >= 0.08, z <= 0.0 (Count: 4)
    // ------------------------------------------------------------------------
    { geo: geoSideburn,  pos: [ 0.090, 0.076, -0.046], rot: [Math.PI + 0.05,  0.32,  0.14], col: HAIR_DARK,  outline: 0.014 },
    { geo: geoSideburn,  pos: [-0.090, 0.076, -0.046], rot: [Math.PI + 0.05, -0.32, -0.14], col: HAIR_DARK,  outline: 0.014 },
    { geo: geoBangSide,  pos: [ 0.086, 0.092, -0.060], rot: [Math.PI + 0.08,  0.28,  0.28], col: HAIR_MID,   outline: 0.014 },
    { geo: geoBangSide,  pos: [-0.086, 0.092, -0.060], rot: [Math.PI + 0.08, -0.28, -0.28], col: HAIR_LIGHT, outline: 0.014 },

    // ------------------------------------------------------------------------
    // LAYER 3: Full Tousled Crown Crest Tufts (Rounded central peak reaching y_world ≈ 2.00m, zero cat-ear horns)
    // Bounds: y >= 0.13 (Count: 6)
    // ------------------------------------------------------------------------
    { geo: geoCrownTall, pos: [ 0.000, 0.158, -0.004], rot: [0.54,  0.00,  0.00], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoCrownWide, pos: [ 0.020, 0.154,  0.002], rot: [0.60,  0.08, -0.22], col: HAIR_MID,   outline: 0.016 },
    { geo: geoCrownWide, pos: [-0.020, 0.154,  0.002], rot: [0.60, -0.08,  0.22], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoCrownWide, pos: [ 0.046, 0.138,  0.008], rot: [0.74,  0.18, -0.78], col: HAIR_MID,   outline: 0.016 },
    { geo: geoCrownWide, pos: [-0.046, 0.138,  0.008], rot: [0.74, -0.18,  0.78], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoCrownTall, pos: [ 0.000, 0.148,  0.032], rot: [0.82,  0.00,  0.00], col: HAIR_MID,   outline: 0.016 },

    // ------------------------------------------------------------------------
    // LAYER 4: Tousled Lateral Tufts (Natural feathered side silhouette)
    // Bounds: |x| >= 0.07, z >= 0.0, y < 0.13 (Count: 6)
    // ------------------------------------------------------------------------
    { geo: geoLateral,   pos: [ 0.092, 0.116,  0.008], rot: [2.32,  0.22, -0.44], col: HAIR_MID,   outline: 0.016 },
    { geo: geoLateral,   pos: [-0.092, 0.116,  0.008], rot: [2.32, -0.22,  0.44], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoLateral,   pos: [ 0.094, 0.088,  0.024], rot: [2.48,  0.24, -0.46], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoLateral,   pos: [-0.094, 0.088,  0.024], rot: [2.48, -0.24,  0.46], col: HAIR_MID,   outline: 0.016 },
    { geo: geoLateral,   pos: [ 0.088, 0.058,  0.044], rot: [2.62,  0.20, -0.38], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoLateral,   pos: [-0.088, 0.058,  0.044], rot: [2.62, -0.20,  0.38], col: HAIR_DARK,  outline: 0.016 },

    // ------------------------------------------------------------------------
    // LAYER 5: Occipital & Nape Locks (3-Tier Downward Shingle Cascade, z >= 0.07)
    // Bounds: z >= 0.07 (Count: 8)
    // ------------------------------------------------------------------------
    { geo: geoNapeShingle, pos: [ 0.000, 0.104,  0.082], rot: [2.68,  0.00,  0.00], col: HAIR_MID,   outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.038, 0.098,  0.078], rot: [2.70,  0.14, -0.24], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoNapeShingle, pos: [-0.038, 0.098,  0.078], rot: [2.70, -0.14,  0.24], col: HAIR_MID,   outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.000, 0.060,  0.090], rot: [2.82,  0.00,  0.00], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.040, 0.054,  0.086], rot: [2.84,  0.15, -0.26], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoNapeShingle, pos: [-0.040, 0.054,  0.086], rot: [2.84, -0.15,  0.26], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.030, 0.018,  0.084], rot: [2.94,  0.16, -0.28], col: HAIR_MID,   outline: 0.016 },
    { geo: geoNapeShingle, pos: [-0.030, 0.018,  0.084], rot: [2.94, -0.16,  0.28], col: HAIR_DARK,  outline: 0.016 }
  ];

  hairLockSpecs.forEach(({ geo, pos, rot, col, outline = 0.016 }) => {
    const lockMesh = createHiFiMesh(geo, col, outline);
    lockMesh.position.set(...pos);
    lockMesh.rotation.set(...rot);
    hairGroup.add(lockMesh);
  });

  // --------------------------------------------------------------------------
  // 5. ARTICULATED TWO-SEGMENT ARMS, 3/4 SLEEVES & 5-FINGER MMA GLOVES
  // --------------------------------------------------------------------------
  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 0.43, 0.005); // Preserved shoulder invariant

    // 1. Upper Arm Sleeve (Child of shoulder, CHARCOAL_HEX, smoothly rounded bomber-jacket shoulder slope)
    const upperSleeveSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.260, 0.073, 0.072, 0.074,  0.000,         0.000, 2.05], // Elbow junction
      [-0.205, 0.078, 0.077, 0.079,  0.000,         0.000, 2.05], // Lower bicep cloth puff
      [-0.125, 0.077, 0.076, 0.078,  0.000,         0.000, 2.05], // Mid-bicep
      [-0.060, 0.075, 0.074, 0.076, -side * 0.002,  0.000, 2.02], // Lower deltoid curve
      [-0.015, 0.068, 0.068, 0.070, -side * 0.014,  0.000, 2.00], // Rounded deltoid transition
      [ 0.020, 0.055, 0.055, 0.057, -side * 0.038,  0.000, 2.00], // Sloped shoulder cap
      [ 0.045, 0.040, 0.040, 0.042, -side * 0.065,  0.000, 2.00], // Continuous collar slope continuation
      [ 0.065, 0.025, 0.025, 0.027, -side * 0.090,  0.000, 2.00]  // Tucked seamlessly into collar base
    ];
    const upperSleeve = createHiFiMesh(
      createSculptedLoftGeometry(upperSleeveSlices, 20, true, true, true),
      CHARCOAL_HEX,
      0.030
    );
    shoulder.add(upperSleeve);

    // Outer Crimson Sleeve Racing Stripe (Child of shoulder, CRIMSON_HEX, follows rounded shoulder slope)
    const stripeSlices = [
      [-0.240, 0.010, 0.020, 0.020,  side * 0.072, 0, 2.2],
      [-0.170, 0.010, 0.022, 0.022,  side * 0.076, 0, 2.2],
      [-0.100, 0.010, 0.022, 0.022,  side * 0.075, 0, 2.2],
      [-0.055, 0.010, 0.021, 0.021,  side * 0.073, 0, 2.1],
      [-0.015, 0.009, 0.019, 0.019,  side * 0.054, 0, 2.0],
      [ 0.020, 0.008, 0.016, 0.016,  side * 0.017, 0, 2.0],
      [ 0.045, 0.007, 0.014, 0.014, -side * 0.025, 0, 2.0]
    ];
    const sleeveStripe = createHiFiMesh(
      createSculptedLoftGeometry(stripeSlices, 14, true, true, true),
      CRIMSON_HEX,
      0.020
    );
    shoulder.add(sleeveStripe);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26; // Preserved elbow invariant
    shoulder.add(elbow);

    // 2. Forearm 3/4 Pushed-Up Sleeve (Bunched below elbow to y = -0.115, exposing bare lower half of forearm!)
    const forearmSleeveSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.115, 0.059, 0.057, 0.059, 0, 0, 2.0], // Bottom of ribbed cuff high on forearm
      [-0.100, 0.064, 0.062, 0.064, 0, 0, 2.0], // Top of ribbed cuff
      [-0.082, 0.077, 0.075, 0.077, 0, 0, 2.2], // Fold Ring 1 (lower cloth bulge)
      [-0.060, 0.067, 0.065, 0.067, 0, 0, 2.1], // Crease depression 1
      [-0.038, 0.078, 0.076, 0.078, 0, 0, 2.2], // Fold Ring 2 (middle cloth bulge)
      [-0.016, 0.069, 0.067, 0.069, 0, 0, 2.1], // Crease depression 2
      [ 0.004, 0.077, 0.075, 0.077, 0, 0, 2.2], // Fold Ring 3 (upper cloth bulge)
      [ 0.022, 0.074, 0.072, 0.074, 0, 0, 2.1]  // Elbow joint overlap
    ];
    const forearmSleeve = createHiFiMesh(
      createSculptedLoftGeometry(forearmSleeveSlices, 20, true, true, true),
      CHARCOAL_HEX,
      0.028
    );
    elbow.add(forearmSleeve);

    // Forearm Ribbed Cuff & Crimson Accent Ring ending at y = -0.115 (Child of elbow)
    const forearmCuff = createHiFiMesh(new THREE.CylinderGeometry(0.061, 0.058, 0.016, 18), 0x1e2028, 0.026);
    forearmCuff.position.y = -0.107;
    elbow.add(forearmCuff);

    const cuffCrimsonRim = createHiFiMesh(new THREE.CylinderGeometry(0.059, 0.057, 0.005, 18), CRIMSON_HEX, 0.020);
    cuffCrimsonRim.position.y = -0.115;
    elbow.add(cuffCrimsonRim);

    // 3. Bare Forearm Skin Loft (Child of elbow, clearly exposed across lower half of muscular forearm in all 4 views!)
    const bareForearmSlices = [
      [-0.242, 0.047, 0.045, 0.045, 0, 0, 2.0], // Wrist joint insertion (inside MMA glove)
      [-0.200, 0.055, 0.053, 0.053, 0, 0, 2.0], // Lower exposed bare skin forearm
      [-0.150, 0.060, 0.058, 0.058, 0, 0, 2.0], // Mid muscular forearm belly (prominently visible warm skin!)
      [-0.105, 0.057, 0.055, 0.055, 0, 0, 2.0]  // Tucked cleanly inside sleeve cuff at -0.115
    ];
    const bareForearm = createHiFiMesh(
      createSculptedLoftGeometry(bareForearmSlices, 18, true, true, true),
      SKIN_HEX,
      0.028
    );
    elbow.add(bareForearm);

    // 4. Strapped Black MMA Glove Wrist Cuff & Raised Wrap Band (Compact height at wrist leaving forearm bare)
    const wristCuff = createHiFiMesh(
      new THREE.CylinderGeometry(0.048, 0.051, 0.018, 18),
      0x1a1c22,
      0.026
    );
    wristCuff.position.y = -0.242;
    elbow.add(wristCuff);

    const wristStrap = createHiFiMesh(
      new THREE.CylinderGeometry(0.052, 0.053, 0.014, 18),
      0x242832,
      0.022
    );
    wristStrap.position.y = -0.242;
    elbow.add(wristStrap);

    const strapTab = createHiFiMesh(
      new THREE.BoxGeometry(0.015, 0.014, 0.008),
      0xaab2bd,
      0.016
    );
    strapTab.position.set(side * 0.051, -0.242, -0.006);
    elbow.add(strapTab);

    // 5. Articulated Hand Base (Preserved anchor at y = -0.275 relative to elbow)
    const hand = new THREE.Group();
    hand.position.y = -0.275;
    elbow.add(hand);

    // Contoured Main Palm Body
    const palm = createHiFiMesh(
      new THREE.BoxGeometry(0.074, 0.068, 0.040),
      0x1a1c22,
      0.028
    );
    hand.add(palm);

    // Contoured Padded Knuckle Protection Plate (Dorsal Metacarpals, -Z)
    const knucklePlate = createHiFiMesh(
      new THREE.BoxGeometry(0.076, 0.034, 0.016),
      0x282c36,
      0.022
    );
    knucklePlate.position.set(0, 0.010, -0.022);
    hand.add(knucklePlate);

    // 4 Segmented Knuckle Strike Cushions
    for (let k = 0; k < 4; k++) {
      const kx = -0.027 + k * 0.018;
      const kBump = createHiFiMesh(
        new THREE.BoxGeometry(0.014, 0.028, 0.008),
        0x343a46,
        0.018
      );
      kBump.position.set(kx, 0.010, -0.028);
      hand.add(kBump);
    }

    // 4 Articulated Fingers (Gloved Proximal + Exposed Skin Distal)
    const fingerSpecs = [
      { name: 'index',  gloveLen: 0.020, skinLen: 0.026, w: 0.015, d: 0.016, splay: -0.04 },
      { name: 'middle', gloveLen: 0.022, skinLen: 0.030, w: 0.016, d: 0.016, splay:  0.00 },
      { name: 'ring',   gloveLen: 0.021, skinLen: 0.027, w: 0.015, d: 0.016, splay:  0.05 },
      { name: 'pinky',  gloveLen: 0.017, skinLen: 0.021, w: 0.013, d: 0.014, splay:  0.10 }
    ];

    const fingerGroups = [];
    fingerSpecs.forEach((spec, i) => {
      // inner (-side) to outer (+side) positioning across palm
      const fx = -side * 0.0255 + i * (side * 0.0170);
      const fGroup = new THREE.Group();
      fGroup.position.set(fx, -0.033, -0.004);
      fGroup.rotation.z = side * spec.splay;

      // Gloved Proximal Phalanx
      const fGlove = createHiFiMesh(
        new THREE.BoxGeometry(spec.w, spec.gloveLen, spec.d),
        0x1a1c22,
        0.020
      );
      fGlove.position.y = -spec.gloveLen * 0.5;
      fGroup.add(fGlove);

      // Reinforced glove hem cuff line
      const fCuff = createHiFiMesh(
        new THREE.BoxGeometry(spec.w + 0.002, 0.004, spec.d + 0.002),
        0x2c303c,
        0.016
      );
      fCuff.position.y = -spec.gloveLen + 0.002;
      fGroup.add(fCuff);

      // Distal Phalanx Joint & Exposed Bare Skin Finger Tip
      const fSkinJoint = new THREE.Group();
      fSkinJoint.position.set(0, -spec.gloveLen, 0.002);
      fGroup.add(fSkinJoint);

      const fSkin = createHiFiMesh(
        new THREE.BoxGeometry(spec.w - 0.001, spec.skinLen, spec.d - 0.001),
        SKIN_HEX,
        0.018
      );
      fSkin.position.y = -spec.skinLen * 0.5;
      fSkinJoint.add(fSkin);

      // Natural relaxed finger curl
      fGroup.rotation.x = 0.20 + (3 - i) * 0.03;
      fSkinJoint.rotation.x = 0.26 + (3 - i) * 0.04;

      hand.add(fGroup);
      fingerGroups.push({ fGroup, fSkinJoint, spec });
    });

    // Articulated Thumb on Inner Radial Side (-side * X)
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(-side * 0.038, -0.008, -0.012);
    thumbGroup.rotation.set(0.20, side * 0.28, -side * 0.38);

    const thumbGlove = createHiFiMesh(
      new THREE.BoxGeometry(0.019, 0.024, 0.019),
      0x1a1c22,
      0.020
    );
    thumbGlove.position.y = -0.012;
    thumbGroup.add(thumbGlove);

    const thumbSkinJoint = new THREE.Group();
    thumbSkinJoint.position.set(side * 0.002, -0.024, 0.002);
    thumbGroup.add(thumbSkinJoint);

    const thumbSkin = createHiFiMesh(
      new THREE.BoxGeometry(0.017, 0.024, 0.017),
      SKIN_HEX,
      0.018
    );
    thumbSkin.position.y = -0.012;
    thumbSkinJoint.add(thumbSkin);

    hand.add(thumbGroup);

    // Biomechanical Fist Clenching / Relaxing API
    function setFistClenched(clenched) {
      fingerGroups.forEach(({ fGroup, fSkinJoint, spec }) => {
        if (clenched) {
          fGroup.rotation.x = 1.38;
          fGroup.rotation.z = side * spec.splay * 0.3;
          fSkinJoint.rotation.x = 1.48;
        } else {
          const idx = fingerSpecs.indexOf(spec);
          fGroup.rotation.x = 0.20 + (3 - idx) * 0.03;
          fGroup.rotation.z = side * spec.splay;
          fSkinJoint.rotation.x = 0.26 + (3 - idx) * 0.04;
        }
      });
      if (clenched) {
        thumbGroup.rotation.set(0.65, side * 0.58, -side * 0.82);
        thumbSkinJoint.rotation.set(0.40, side * 0.20, 0);
      } else {
        thumbGroup.rotation.set(0.20, side * 0.28, -side * 0.38);
        thumbSkinJoint.rotation.set(0, 0, 0);
      }
    }

    return { shoulder, elbow, hand, fist: hand, setFistClenched };
  }

  const leftArmObj = buildArm(-1);
  const rightArmObj = buildArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // --------------------------------------------------------------------------
  // 6. ARTICULATED LEGS: BAGGY 3/4 CARGO PANTS, BARE SHINS & HIGH-TOP SNEAKERS
  // --------------------------------------------------------------------------
  const pantsLegTex = createChallengerPantsLegUVTexture();
  const shinTex = createChallengerShinUVTexture();

  function buildLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.105, -0.05, 0); // Preserved hip joint invariant

    // 1. Sculpted Baggy Upper Thigh Loft (6 slices: tailored streetwear drape & knee folds)
    const thighSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.39, 0.098, 0.104, 0.108, side * 0.014,  0.000, 2.20], // Knee blend (gap = 4.2cm)
      [-0.33, 0.104, 0.112, 0.116, side * 0.018,  0.004, 2.25], // Bunched fabric fold (gap = 3.8cm)
      [-0.24, 0.106, 0.114, 0.118, side * 0.020,  0.002, 2.25], // Lower thigh fullness (gap = 3.8cm)
      [-0.14, 0.104, 0.110, 0.114, side * 0.018,  0.002, 2.25], // Mid-thigh pocket level (gap = 3.8cm)
      [-0.04, 0.100, 0.104, 0.108, side * 0.012,  0.002, 2.20], // Upper thigh drape (gap = 3.4cm)
      [ 0.02, 0.095, 0.096, 0.100, side * 0.006,  0.000, 2.15]  // Hip root below belt (gap = 3.2cm)
    ];
    const thighMesh = createHiFiMesh(
      createSculptedLoftGeometry(thighSlices, 24, true, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    hipJoint.add(thighMesh);

    // 2. 3D Outer-Thigh Flapped Bellows Cargo Pocket
    const pocketGroup = new THREE.Group();
    pocketGroup.position.set(side * 0.122, -0.19, 0.00);
    pocketGroup.rotation.z = side * -0.05;
    hipJoint.add(pocketGroup);

    const cargoBox = createHiFiMesh(new THREE.BoxGeometry(0.038, 0.150, 0.124), 0x242730, 0.026);
    pocketGroup.add(cargoBox);

    const centerPleat = createHiFiMesh(new THREE.BoxGeometry(0.042, 0.140, 0.016), 0x1c1e24, 0.020);
    pocketGroup.add(centerPleat);

    const cargoFlap = createHiFiMesh(new THREE.BoxGeometry(0.044, 0.038, 0.130), 0x2e323c, 0.024);
    cargoFlap.position.set(0, 0.065, 0);
    cargoFlap.rotation.x = -0.06;
    pocketGroup.add(cargoFlap);

    const flapSnap = createHiFiMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 12), 0x14161a, 0.016);
    flapSnap.position.set(0.022, 0.058, 0);
    flapSnap.rotation.z = Math.PI / 2;
    pocketGroup.add(flapSnap);

    // 3. Knee Joint at y = -0.38 (Preserved knee joint invariant)
    const kneeJoint = new THREE.Group();
    kneeJoint.position.set(side * 0.010, -0.38, 0);
    hipJoint.add(kneeJoint);

    // 4. Baggy Calf Drape & Ribbed Mid-Calf Elastic Cuff (6 slices)
    const calfSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.25, 0.066, 0.066, 0.068, 0.000,        0.002, 2.05], // Bottom rim of elastic cuff (y_world = 0.39m)
      [-0.20, 0.068, 0.068, 0.070, 0.000,        0.002, 2.05], // Top rim of elastic cuff (y_world = 0.44m)
      [-0.17, 0.092, 0.092, 0.096, side * 0.004, 0.004, 2.20], // Natural fabric gather overhang above cuff
      [-0.10, 0.098, 0.100, 0.104, side * 0.006, 0.004, 2.25], // Full baggy calf drape (gap = 4.6cm unrotated)
      [-0.03, 0.095, 0.098, 0.100, side * 0.004, 0.002, 2.20], // Upper calf below knee
      [ 0.02, 0.096, 0.098, 0.102, 0.000,        0.000, 2.15]  // Knee joint blend (rx = 0.096)
    ];
    const calfMesh = createHiFiMesh(
      createSculptedLoftGeometry(calfSlices, 24, true, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    kneeJoint.add(calfMesh);

    // 5. Exposed Lean Athletic Bare Lower Shin with Anatomical Taper (5 slices)
    const shinSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.43, 0.035, 0.038, 0.042, 0.000, 0.004, 2.05], // Ankle joint level / supramalleolar insertion
      [-0.38, 0.038, 0.042, 0.046, 0.000, 0.005, 2.10], // Lower shin / Achilles tendon taper
      [-0.33, 0.044, 0.048, 0.052, 0.000, 0.006, 2.15], // Mid shin (anterior tibial crest definition)
      [-0.28, 0.050, 0.052, 0.058, 0.000, 0.006, 2.15], // Upper calf belly (gastrocnemius volume)
      [-0.24, 0.052, 0.054, 0.060, 0.000, 0.004, 2.10]  // Exits cuff interior
    ];
    const lowerShin = createHiFiMesh(
      createSculptedLoftGeometry(shinSlices, 20, true, true, true),
      0xffffff,
      0.024,
      shinTex
    );
    kneeJoint.add(lowerShin);

    // 6. Articulated Ankle Joint at y = -0.42 (Preserved ankle invariant)
    const ankleJoint = new THREE.Group();
    ankleJoint.position.set(0, -0.42, 0.006);
    kneeJoint.add(ankleJoint);

    // 7. Multi-Panel Retro High-Top Sneaker (Preserving All 6 Tiers)
    const shoeGroup = new THREE.Group();
    ankleJoint.add(shoeGroup);

    // A. Flat White Rubber Outsole
    const soleSlices = [
      [-0.220, 0.073, 0.176, 0.090, 0, -0.002, 2.5],
      [-0.184, 0.075, 0.179, 0.092, 0, -0.002, 2.5]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(soleSlices, 24, true, true, true), 0xf4f5f7, 0.030));

    // Foxing Pinstripe
    const soleRimSlices = [
      [-0.186, 0.076, 0.180, 0.093, 0, -0.002, 2.5],
      [-0.176, 0.074, 0.176, 0.090, 0, -0.002, 2.5]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(soleRimSlices, 24, true, false, false), 0x14151a, 0.020));

    // B. White Rubber Shell Toe-Box Cap
    const toeCapSlices = [
      [-0.180, 0.071, 0.088, 0.012, 0, -0.092, 2.2],
      [-0.145, 0.065, 0.080, 0.012, 0, -0.088, 2.1],
      [-0.115, 0.048, 0.052, 0.010, 0, -0.078, 2.0]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(toeCapSlices, 20, true, false, true), 0xf4f5f7, 0.026));

    // C. Sculpted Black Canvas Upper & Quarters (closeTop = false for open collar)
    const upperSlices = [
      [-0.180, 0.071, 0.158, 0.086, 0, -0.002, 2.2],
      [-0.130, 0.067, 0.126, 0.082, 0,  0.002, 2.1],
      [-0.075, 0.060, 0.082, 0.076, 0,  0.010, 2.05],
      [-0.015, 0.057, 0.066, 0.070, 0,  0.012, 2.05],
      [ 0.015, 0.054, 0.052, 0.065, 0,  0.015, 2.05]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(upperSlices, 24, true, false, false), 0x1c1e24, 0.030));

    // D. Crimson Heel Counter
    const redHeelSlices = [
      [-0.178, 0.072, 0.005, 0.088, 0, 0.010, 2.2],
      [-0.120, 0.068, 0.005, 0.084, 0, 0.012, 2.1],
      [-0.075, 0.062, 0.005, 0.078, 0, 0.014, 2.1]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(redHeelSlices, 18, true, false, false), CRIMSON_HEX, 0.026));

    // E. Crimson High-Top Ankle Collar Band (closeTop = false for open collar)
    const redCollarSlices = [
      [-0.035, 0.056, 0.058, 0.068, 0, 0.012, 2.10],
      [ 0.000, 0.054, 0.054, 0.066, 0, 0.014, 2.10],
      [ 0.020, 0.052, 0.050, 0.064, 0, 0.016, 2.10]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(redCollarSlices, 20, true, false, false), CRIMSON_HEX, 0.028));

    // F. Vertical Black Heel Spine Webbing Strip
    const heelSpine = createHiFiMesh(new THREE.BoxGeometry(0.018, 0.165, 0.010), 0x14151a, 0.018);
    heelSpine.position.set(0, -0.085, 0.088);
    shoeGroup.add(heelSpine);

    // G. Crimson Eyestay Overlays
    [-1, 1].forEach((s) => {
      const eyestay = createHiFiMesh(new THREE.BoxGeometry(0.018, 0.135, 0.022), CRIMSON_HEX, 0.020);
      eyestay.position.set(s * 0.030, -0.080, -0.072);
      eyestay.rotation.x = -0.48;
      shoeGroup.add(eyestay);
    });

    // Padded Sneaker Tongue
    const tongue = createHiFiMesh(new THREE.BoxGeometry(0.046, 0.160, 0.016), CRIMSON_HEX, 0.022);
    tongue.position.set(0, -0.040, -0.058);
    tongue.rotation.x = -0.46;
    shoeGroup.add(tongue);

    // 5 Crisp Pure White Criss-Cross Laces
    const laceCoords = [
      { y: -0.128, z: -0.106, w: 0.052, rot:  0.16 },
      { y: -0.106, z: -0.094, w: 0.050, rot: -0.16 },
      { y: -0.084, z: -0.082, w: 0.048, rot:  0.16 },
      { y: -0.062, z: -0.070, w: 0.046, rot: -0.16 },
      { y: -0.040, z: -0.058, w: 0.044, rot:  0.16 }
    ];
    laceCoords.forEach(({ y, z, w, rot }) => {
      const lace = createHiFiMesh(new THREE.BoxGeometry(w, 0.009, 0.012), 0xf8f9fb, 0.016);
      lace.position.set(0, y, z);
      lace.rotation.x = -0.46;
      lace.rotation.z = rot;
      shoeGroup.add(lace);
    });

    // Top Tied Lace Knot Accent
    const laceKnot = createHiFiMesh(new THREE.BoxGeometry(0.024, 0.014, 0.014), 0xf8f9fb, 0.016);
    laceKnot.position.set(0, -0.022, -0.052);
    laceKnot.rotation.x = -0.46;
    shoeGroup.add(laceKnot);

    return { hipJoint, kneeJoint, ankleJoint, shoeGroup };
  }

  const leftLegObj = buildLeg(-1);
  const rightLegObj = buildLeg(1);
  hips.add(leftLegObj.hipJoint);
  hips.add(rightLegObj.hipJoint);

  function setExpression(expr = 'determined') {
    headMesh.material.map = expr === 'grin' ? headTexGrin : headTexDetermined;
    headMesh.material.needsUpdate = true;
    const clench = expr === 'grin';
    leftArmObj.setFistClenched(clench);
    rightArmObj.setFistClenched(clench);
  }

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
    leftAnkle: leftLegObj.ankleJoint,
    rightLeg: rightLegObj.hipJoint,
    rightKnee: rightLegObj.kneeJoint,
    rightAnkle: rightLegObj.ankleJoint,
    setExpression
  });
}

// ============================================================================
// 3B. SIGNATURE CRESCENT-SWEEP TAN/GOLD KICK SMEAR RIBBON + FLYING PEBBLES
//     (Drawn on high-res 1024x1024 canvas planes on the RIGHT side of Challenger!)
// ============================================================================
function createCrescentKickSmearTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, 1024, 1024);

  // Outer warm golden-tan crescent sweep from bottom-left (180, 910)
  // bowing out to the right (860, 520) and curling up to top-right kick impact (690, 95)!
  const grad = ctx.createLinearGradient(180, 910, 740, 110);
  grad.addColorStop(0.0, 'rgba(218, 152, 84, 0.0)');
  grad.addColorStop(0.14, 'rgba(228, 168, 96, 0.85)');
  grad.addColorStop(0.55, 'rgba(246, 202, 132, 0.94)');
  grad.addColorStop(0.88, 'rgba(242, 214, 158, 0.92)');
  grad.addColorStop(1.0, 'rgba(246, 224, 175, 0.90)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  // Inner concave edge of the kick smear
  ctx.moveTo(150, 910);
  ctx.bezierCurveTo(460, 760, 650, 450, 620, 105);
  // Top rounded tip at the sneaker
  ctx.quadraticCurveTo(695, 70, 755, 130);
  // Outer convex edge of the kick smear
  ctx.bezierCurveTo(910, 430, 680, 810, 150, 910);
  ctx.closePath();
  ctx.fill();

  // Outer dark comic ink rim + inner speed-lines
  ctx.strokeStyle = '#18100c';
  ctx.lineCap = 'round';

  // Outer edge ink line
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(210, 895);
  ctx.bezierCurveTo(660, 795, 895, 430, 748, 132);
  ctx.stroke();

  // Inner speed-line arcs
  [
    { x0: 240, y0: 870, cx1: 580, cy1: 750, cx2: 790, cy2: 430, x1: 695, y1: 120, w: 6 },
    { x0: 290, y0: 835, cx1: 540, cy1: 710, cx2: 725, cy2: 435, x1: 658, y1: 115, w: 5 },
    { x0: 350, y0: 780, cx1: 515, cy1: 660, cx2: 675, cy2: 440, x1: 632, y1: 135, w: 4 }
  ].forEach(({ x0, y0, cx1, cy1, cx2, cy2, x1, y1, w }) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPersistentKickSmearRig(parentGroup) {
  const smearGroup = new THREE.Group();
  smearGroup.visible = false;
  parentGroup.add(smearGroup);

  const smearTex = createCrescentKickSmearTexture();
  const arcMat = new THREE.MeshBasicMaterial({
    map: smearTex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  });

  const planeGeo = new THREE.PlaneGeometry(2.15, 2.15);

  const primaryRibbon = new THREE.Mesh(planeGeo, arcMat);
  primaryRibbon.position.set(0.14, 1.08, -0.32);
  primaryRibbon.rotation.set(-0.38, -0.42, 0.18);
  smearGroup.add(primaryRibbon);

  const secondaryRibbon = new THREE.Mesh(planeGeo, arcMat);
  secondaryRibbon.position.set(0.18, 1.04, -0.38);
  secondaryRibbon.rotation.set(-0.34, -0.48, 0.24);
  secondaryRibbon.scale.setScalar(0.92);
  smearGroup.add(secondaryRibbon);

  const pebbles = [];

  function updateSweep(phaseProgress, isRecovery = false, beatPulse = 0) {
    if (!isRecovery) {
      smearGroup.visible = true;
      const sweepScale = 0.52 + 0.56 * phaseProgress;
      const sweepAngle = -0.65 + 1.05 * phaseProgress;
      primaryRibbon.scale.set(sweepScale, sweepScale, 1.0);
      secondaryRibbon.scale.set(sweepScale * 0.92, sweepScale * 0.92, 1.0);
      primaryRibbon.rotation.set(-0.42 + 0.18 * phaseProgress, -0.46, sweepAngle);
      secondaryRibbon.rotation.set(-0.38 + 0.18 * phaseProgress, -0.52, sweepAngle - 0.14);
      arcMat.opacity = Math.min(0.96, (0.35 + 0.60 * Math.sin(phaseProgress * Math.PI)) + beatPulse * 0.08);
    } else {
      const fade = Math.max(0, 1.0 - phaseProgress * 1.45);
      arcMat.opacity = 0.88 * fade;
      const tailAngle = 0.40 + 0.25 * phaseProgress;
      primaryRibbon.rotation.z = tailAngle;
      secondaryRibbon.rotation.z = tailAngle - 0.14;
      if (fade <= 0.02) {
        smearGroup.visible = false;
      }
    }
  }

  return { smearGroup, primaryRibbon, secondaryRibbon, arcMat, pebbles, updateSweep };
}

