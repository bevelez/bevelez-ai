import * as THREE from 'three';
import {
  setFighterShadowScope,
  createCurvedHairLockGeometry,
  createHiFiMesh,
  createSculptedLoftGeometry,
  drawOnBackSeam,
  optimizeArticulatedRigBones,
  createContactShadowDecal
} from './shared.js?v=20261018c';

// ============================================================================
// ENHANCED HYPE-CREW BRUISER PROCEDURAL 3D SCULPT & TEXTURE SYSTEM (MILESTONE 1)
// Authentic AA Cel-Shaded Graphic-Novel Street Brawler matching Turnaround Sheet
// ============================================================================

const _bruiserHeadTexCache = {};

/**
 * Procedural 1024x1024 UV Face Texture Canvas for Hype-Crew Bruiser.
 * Calibrated for bruiserHeadSlices (yMin = -0.142, yMax = +0.132, frontIsNegZ = false):
 * - Center Front Face: u = 0.50 (x = 512)
 * - Right Side Profile: u = 0.25 (x = 256, viewer's left)
 * - Left Side Profile:  u = 0.75 (x = 768, viewer's right)
 * - Back Nape Seam:     u = 0.00 / 1.00 (x = 0 / 1024)
 * - Chin Tip:     y = -0.142 -> py = 1018
 * - Gritted Lips: y = -0.065 -> py = 740
 * - Nose Bridge:  y = -0.018 -> py = 565
 * - Fierce Eyes:  y = +0.035 -> py = 368
 * - Angry Brows:  y = +0.065 -> py = 256
 * - Hairline:     y = +0.082 -> py = 192
 */
export function createBruiserHeadUVTexture(idx = 0) {
  if (_bruiserHeadTexCache[idx]) return _bruiserHeadTexCache[idx];

  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Dual Brawler Skin Tone Selection matching Turnaround Sheet
  // Variant 0: Clean warm bronze (#d89c74); Variant 1: Rich terracotta (#b97a52)
  const isBronze = idx === 0;
  const skinBase = isBronze ? '#d89c74' : '#b97a52';
  const skinShadow = isBronze ? '#b87c56' : '#965a36';
  const skinDeep = isBronze ? '#8e5432' : '#6d381c';
  const skinHighlight = isBronze ? '#ebd0b6' : '#cfa17e';

  // Base fill: entire canvas initialized to clean, warm skin tone
  ctx.fillStyle = skinBase;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Shaved / Faded Temple Sides & Back Nape strictly on lateral and posterior regions
  // Keeping front face zone (x = 280..744) 100% clean, warm, and even with ZERO dirt smudges
  // Back nape buzz fade across back seam (x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    const napeGrad = ctx.createLinearGradient(0, 0, 0, 480);
    napeGrad.addColorStop(0.0, '#1c120d');
    napeGrad.addColorStop(0.45, '#2e1c14');
    napeGrad.addColorStop(0.80, skinDeep);
    napeGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = napeGrad;
    ctx.fillRect(-140, 0, 280, 480);
  });

  // Lateral side temple buzz fades strictly confined to outer profiles (x <= 260 and x >= 764)
  [-1, 1].forEach((side) => {
    const tx = 512 + side * 310; // Lateral temple center (x = 202 and x = 822)
    const fadeGrad = ctx.createLinearGradient(0, 0, 0, 360);
    fadeGrad.addColorStop(0.0, '#1c120d');
    fadeGrad.addColorStop(0.45, '#2e1c14');
    fadeGrad.addColorStop(0.80, skinDeep);
    fadeGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(tx - 70, 0, 140, 360);

    // Subtle clipper stipple strictly confined to outer profile (never near cheeks)
    ctx.fillStyle = 'rgba(24, 15, 10, 0.28)';
    for (let i = 0; i < 35; i++) {
      const rx = tx - 60 + Math.random() * 120;
      const ry = 40 + Math.random() * 280;
      ctx.fillRect(rx, ry, 2.0, 2.0);
    }
  });

  // Guarantee front face zone (x = 280..744, py = 0..1024) is 100% clean, warm, and even
  ctx.fillStyle = skinBase;
  ctx.fillRect(280, 0, 464, 1024);

  // Dark mohawk scalp strip along sagittal crown midline (x = 486..538, py = 0..190)
  ctx.fillStyle = '#20130d';
  ctx.fillRect(486, 0, 52, 190);
  ctx.fillStyle = '#2e1c14';
  ctx.fillRect(494, 0, 36, 190);

  // Crisp razor-cut temple line-up contour
  ctx.strokeStyle = '#18100c';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(375, 205);
  ctx.lineTo(390, 190);
  ctx.quadraticCurveTo(512, 168, 634, 190);
  ctx.lineTo(649, 205);
  ctx.stroke();

  // 3. Glabella Brow Furrow & Forehead Anger Creases (py = 220..310)
  ctx.strokeStyle = '#160d09';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(498, 260);
  ctx.lineTo(504, 335);
  ctx.moveTo(526, 260);
  ctx.lineTo(520, 335);
  ctx.stroke();

  // Horizontal forehead anger lines
  ctx.strokeStyle = skinDeep;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(450, 224);
  ctx.quadraticCurveTo(512, 216, 574, 224);
  ctx.moveTo(464, 246);
  ctx.quadraticCurveTo(512, 240, 560, 246);
  ctx.stroke();

  // 4. Heavy Furrowed Dark Eyebrows (py = 265..325, slanting steeply down toward glabella)
  [-1, 1].forEach((side) => {
    const bx = 512 + side * 94;
    ctx.fillStyle = '#140c08';
    ctx.beginPath();
    ctx.moveTo(512 + side * 18, 322);
    ctx.quadraticCurveTo(bx, 272, bx + side * 58, 286);
    ctx.lineTo(bx + side * 62, 300);
    ctx.quadraticCurveTo(bx, 292, 512 + side * 18, 336);
    ctx.closePath();
    ctx.fill();

    // Stylized jagged brow notch cuts
    ctx.strokeStyle = skinBase;
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(bx + side * 22, 278);
    ctx.lineTo(bx + side * 20, 298);
    ctx.stroke();
  });

  // 5. Fierce Cel-Shaded Anime Eyes with Heavy Eyeliner & Constricted Pupils (py = 370..425)
  [-1, 1].forEach((side) => {
    const ex = 512 + side * 108; // Horizontal eye center
    const ey = 388;

    // Crisp White Sclera with aggressive angled almond contour
    ctx.fillStyle = '#f5f6fa';
    ctx.beginPath();
    ctx.moveTo(ex - side * 44, ey + 4);       // Inner corner
    ctx.quadraticCurveTo(ex, ey - 24, ex + side * 44, ey - 14); // Upper contour
    ctx.quadraticCurveTo(ex + side * 34, ey + 18, ex, ey + 20); // Lower outer
    ctx.quadraticCurveTo(ex - side * 24, ey + 18, ex - side * 44, ey + 4);
    ctx.closePath();
    ctx.fill();

    // Fierce Amber-Gold Iris Gradient
    const irisGrad = ctx.createLinearGradient(ex, ey - 18, ex, ey + 18);
    irisGrad.addColorStop(0.0, '#361b0c');
    irisGrad.addColorStop(0.5, '#a4581a');
    irisGrad.addColorStop(1.0, '#e89428');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(ex - side * 2, ey + 1, 21, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Constricted Black Pupil (Adrenaline-Fueled Brawler Stare)
    ctx.fillStyle = '#0a0604';
    ctx.beginPath();
    ctx.arc(ex - side * 2, ey + 1, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Sharp White Specular Eye Glint
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - side * 9, ey - 5, 4.5, 0, Math.PI * 2);
    ctx.arc(ex + side * 6, ey + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Heavy Graphic-Novel Upper Eyeliner & Outer Wing
    ctx.strokeStyle = '#0a0503';
    ctx.lineWidth = 10.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - side * 46, ey + 5);
    ctx.quadraticCurveTo(ex, ey - 26, ex + side * 48, ey - 15);
    ctx.lineTo(ex + side * 56, ey - 20); // Sharp outer flick
    ctx.stroke();

    // Lower Eyelid Rim Line (clean, sharp, no smudge)
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(ex - side * 28, ey + 19);
    ctx.quadraticCurveTo(ex, ey + 22, ex + side * 40, ey + 12);
    ctx.stroke();
  });

  // 6. Clean Graphic-Novel Nose Bridge Lines & Nostril Crease (No dark shadow wedge!)
  ctx.strokeStyle = '#180e0a';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(508, 480);
  ctx.lineTo(504, 570);
  ctx.lineTo(512, 595);
  ctx.stroke();

  // Nostril Creases & Wings
  ctx.beginPath();
  ctx.moveTo(484, 592);
  ctx.quadraticCurveTo(512, 604, 540, 592);
  ctx.moveTo(478, 594);
  ctx.lineTo(490, 590);
  ctx.moveTo(546, 594);
  ctx.lineTo(534, 590);
  ctx.stroke();

  // 7. Clenched Scowl / Gritted Grimace Mouth (py = 725..775)
  // Outer grimace contour
  ctx.strokeStyle = '#120806';
  ctx.lineWidth = 6.0;
  ctx.fillStyle = '#24120e';
  ctx.beginPath();
  ctx.moveTo(436, 738);
  ctx.quadraticCurveTo(512, 730, 588, 738);
  ctx.quadraticCurveTo(580, 772, 512, 775);
  ctx.quadraticCurveTo(444, 772, 436, 738);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Gritted White Teeth Row with Dark Crevices
  ctx.fillStyle = '#f0f2f6';
  ctx.beginPath();
  ctx.moveTo(448, 742);
  ctx.quadraticCurveTo(512, 736, 576, 742);
  ctx.quadraticCurveTo(570, 764, 512, 766);
  ctx.quadraticCurveTo(454, 764, 448, 742);
  ctx.closePath();
  ctx.fill();

  // Horizontal interdental bite line
  ctx.strokeStyle = '#1c0f0b';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(450, 752);
  ctx.lineTo(574, 752);
  ctx.stroke();

  // Vertical tooth separation tick lines
  [472, 492, 512, 532, 552].forEach((tx) => {
    ctx.beginPath();
    ctx.moveTo(tx, 742);
    ctx.lineTo(tx, 764);
    ctx.stroke();
  });

  // Deep Down-Turned Mouth Corner Creases
  [-1, 1].forEach((side) => {
    ctx.strokeStyle = '#160906';
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    ctx.moveTo(512 + side * 78, 738);
    ctx.lineTo(512 + side * 94, 754);
    ctx.stroke();
  });

  // Clean Lower Lip Crease Line
  ctx.strokeStyle = '#1c0f0b';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(486, 788);
  ctx.quadraticCurveTo(512, 794, 538, 788);
  ctx.stroke();

  // 8. Angular Chin Cleft Groove (py = 915..965)
  ctx.strokeStyle = '#180d09';
  ctx.lineWidth = 4.0;
  ctx.beginPath();
  ctx.moveTo(512, 920);
  ctx.lineTo(512, 965);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _bruiserHeadTexCache[idx] = tex;
  return tex;
}

/**
 * Helper to generate open-arc multi-slice sculpted lofts (e.g. open vest shells and collars).
 * Uses pure BufferGeometry with outward-facing normals and proper UVs.
 */
function createBruiserVestLoft(slices, radialSegments = 18, thetaStart = Math.PI * 0.34, thetaLength = Math.PI * 1.32) {
  radialSegments = Math.min(radialSegments, 18);
  const numSlices = slices.length;
  if (numSlices === 0) return new THREE.BufferGeometry();

  const isDescending = numSlices > 1 && slices[0][0] > slices[numSlices - 1][0];
  const effectiveSlices = isDescending ? [...slices].reverse() : slices;

  const positions = [];
  const uvs = [];
  const indices = [];

  const yMin = effectiveSlices[0][0];
  const yMax = effectiveSlices[numSlices - 1][0];
  const ySpan = Math.max(1e-5, yMax - yMin);

  for (let i = 0; i < numSlices; i++) {
    const [y, rx, rzFront, rzBack, cx = 0, cz = 0, p = 2.2] = effectiveSlices[i];
    const v = (y - yMin) / ySpan;

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const theta = thetaStart + u * thetaLength;
      const dirX = Math.sin(theta);
      const dirZ = Math.cos(theta);

      const isFront = dirZ >= 0;
      const rz = isFront ? rzFront : rzBack;

      const exp = 2.0 / p;
      const sx = Math.sign(dirX) * Math.pow(Math.abs(dirX), exp);
      const sz = Math.sign(dirZ) * Math.pow(Math.abs(dirZ), exp);

      positions.push(cx + rx * sx, y, cz + rz * sz);
      uvs.push(u, v);
    }
  }

  const ringStride = radialSegments + 1;
  for (let i = 0; i < numSlices - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ringStride + j;
      const b = a + 1;
      const d = (i + 1) * ringStride + j;
      const c = d + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Enhanced Hype-Crew Bruiser Procedural 3D Model Factory.
 * Overhauls placeholder primitives into an authentic AA cel-shaded graphic-novel brawler
 * matching the left half of antagonists_turnaround_sheet_1792119851073.jpg.
 */
export function buildBruiserModel(idx = 0) {
  setFighterShadowScope(true);
  const root = new THREE.Group();
  root.scale.setScalar(0.96); // Imposing athletic brawler mass

  // Grounded dynamic contact shadow decal beneath fighter
  const contactShadowDecal = createContactShadowDecal(1.3, 1.0, 0.48);
  contactShadowDecal.name = 'contact_shadow_decal';
  contactShadowDecal.position.set(0, 0.015, 0);
  root.add(contactShadowDecal);

  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  // Distinct Brawler Palettes matching antagonists turnaround sheet
  // Variant 0: Clean warm bronze (#d89c74); Variant 1: Rich terracotta (#b97a52)
  const skinColor = idx === 0 ? 0xd89c74 : 0xb97a52;
  const pantsColor = 0x1c1e26;      // Baggy tapered dark-charcoal cargo pants
  const vestColor = 0x14141a;       // Deep black leather biker vest
  const vestLapelColor = 0x1a1a24;  // Open notched lapels
  const crimsonWrapColor = 0xa82020;// Symmetrical crimson fabric chest wrap
  const silverMetal = 0xdce0ea;     // Metallic silver studs, spikes & buckle
  const hairDark = 0x241712;        // Dark chestnut brown mohawk hair

  // ==========================================================================
  // 1. TACTICAL BELT, BUCKLE & LOWER PELVIS (Calibrated for waist width ~0.38m)
  // ==========================================================================
  const bruiserBeltSlices = [
    [-0.035, 0.188, 0.136, 0.136, 0, 0.008, 2.25],
    [ 0.000, 0.192, 0.140, 0.140, 0, 0.008, 2.25],
    [ 0.035, 0.188, 0.136, 0.136, 0, 0.008, 2.25]
  ];
  const beltGeo = createSculptedLoftGeometry(bruiserBeltSlices, 28, false, true, true);
  const beltMesh = createHiFiMesh(beltGeo, 0x101014, 0.038);
  beltMesh.position.y = 0.02;
  hips.add(beltMesh);

  // Prominent Rectangular Silver Buckle with Center Dark Inset & Prong (Lofted)
  const buckleFrameSlices = [
    [-0.032, 0.052, 0.018, 0.018, 0, 0, 2.35],
    [ 0.000, 0.054, 0.020, 0.020, 0, 0, 2.35],
    [ 0.032, 0.052, 0.018, 0.018, 0, 0, 2.35]
  ];
  const buckleFrameGeo = createSculptedLoftGeometry(buckleFrameSlices, 16, false, true, true);
  const buckleFrame = createHiFiMesh(
    buckleFrameGeo,
    silverMetal,
    0.030,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
  );
  buckleFrame.position.set(0, 0.02, 0.148);
  hips.add(buckleFrame);

  const buckleCenterSlices = [
    [-0.020, 0.034, 0.016, 0.016, 0, 0, 2.25],
    [ 0.000, 0.036, 0.018, 0.018, 0, 0, 2.25],
    [ 0.020, 0.034, 0.016, 0.016, 0, 0, 2.25]
  ];
  const buckleCenterGeo = createSculptedLoftGeometry(buckleCenterSlices, 14, false, true, true);
  const buckleCenter = createHiFiMesh(buckleCenterGeo, 0x181820, 0.0);
  buckleCenter.position.set(0, 0.02, 0.150);
  hips.add(buckleCenter);

  const prongSlices = [
    [-0.022, 0.007, 0.018, 0.018, 0, 0, 2.0],
    [ 0.022, 0.007, 0.018, 0.018, 0, 0, 2.0]
  ];
  const prongGeo = createSculptedLoftGeometry(prongSlices, 10, false, true, true);
  const buckleProng = createHiFiMesh(
    prongGeo,
    silverMetal,
    0.022,
    null,
    0x000000,
    { isMetallic: true }
  );
  buckleProng.position.set(0, 0.02, 0.152);
  hips.add(buckleProng);

  // ==========================================================================
  // 2. MUSCULAR BRAWLER TORSO: ATHLETIC V-TAPER (top ~0.44m, waist ~0.32m)
  // ==========================================================================
  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);

  // Muscular Core & Chest Loft Geometry: Athletic V-Taper (top width ~0.44m, waist width ~0.32m)
  const bruiserTorsoSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p] with frontIsNegZ = false
    [0.02, 0.160, 0.120, 0.120, 0, 0.010, 2.2], // Waist (width 0.32m)
    [0.16, 0.175, 0.135, 0.130, 0, 0.015, 2.2], // Lower midriff
    [0.32, 0.198, 0.150, 0.140, 0, 0.020, 2.2], // Ribcage / solar plexus
    [0.48, 0.220, 0.165, 0.148, 0, 0.025, 2.2], // Muscular pectorals (width 0.44m)
    [0.62, 0.220, 0.160, 0.145, 0, 0.015, 2.2], // Upper chest / clavicle (width 0.44m)
    [0.68, 0.185, 0.135, 0.130, 0, 0.010, 2.1]  // Shoulders / neck base
  ];
  const torsoGeo = createSculptedLoftGeometry(bruiserTorsoSlices, 32, false, true, true);
  const torsoMesh = createHiFiMesh(torsoGeo, skinColor, 0.042);
  torso.add(torsoMesh);

  // Shaded Upper Abdominal Muscle Planes (Sculpted rounded muscular contours above belt beneath open vest)
  [-1, 1].forEach((side) => {
    [0.14, 0.21].forEach((ay) => {
      const abSlices = [
        [-0.022, 0.028, 0.012, 0.008, 0, 0, 2.1],
        [ 0.000, 0.032, 0.016, 0.010, 0, 0, 2.2],
        [ 0.022, 0.028, 0.012, 0.008, 0, 0, 2.1]
      ];
      const abGeo = createSculptedLoftGeometry(abSlices, 14, false, true, true);
      const abPlate = createHiFiMesh(abGeo, idx === 0 ? 0xc28660 : 0x824a2a, 0.010);
      abPlate.position.set(side * 0.038, ay, 0.142);
      abPlate.rotation.set(-0.06, side * 0.12, 0);
      torso.add(abPlate);
    });
  });

  // Symmetrical Crimson Cloth Chest Wrap across mid-chest above abs matching turnaround sheet
  const bruiserWrapSlices = [
    [0.295, 0.208, 0.156, 0.142, 0, 0.020, 2.2], // Lower rim resting above abs
    [0.345, 0.218, 0.164, 0.146, 0, 0.022, 2.2], // Solar plexus wrap contour
    [0.415, 0.230, 0.172, 0.150, 0, 0.024, 2.2], // Mid-pectoral wrap swell
    [0.475, 0.234, 0.176, 0.152, 0, 0.024, 2.2]  // Top rim under collar/lapels
  ];
  const wrapGeo = createSculptedLoftGeometry(bruiserWrapSlices, 30, false, false, false);
  const wrapBase = createHiFiMesh(wrapGeo, crimsonWrapColor, 0.038);
  torso.add(wrapBase);

  // Symmetrical upper and lower horizontal wrap rim folds (Lofted)
  const wrapTopRimSlices = [
    [0.460, 0.236, 0.178, 0.154, 0, 0.024, 2.2],
    [0.485, 0.236, 0.178, 0.154, 0, 0.024, 2.2]
  ];
  const wrapTopRimGeo = createSculptedLoftGeometry(wrapTopRimSlices, 28, false, false, false);
  const wrapTopRim = createHiFiMesh(wrapTopRimGeo, crimsonWrapColor, 0.034);
  torso.add(wrapTopRim);

  const wrapBotRimSlices = [
    [0.285, 0.210, 0.158, 0.144, 0, 0.020, 2.2],
    [0.310, 0.210, 0.158, 0.144, 0, 0.020, 2.2]
  ];
  const wrapBotRimGeo = createSculptedLoftGeometry(wrapBotRimSlices, 28, false, false, false);
  const wrapBotRim = createHiFiMesh(wrapBotRimGeo, crimsonWrapColor, 0.034);
  torso.add(wrapBotRim);

  // Symmetrical Crisscrossing Cloth Strap Overlays crossing neatly in chest center (Lofted)
  [-1, 1].forEach((side) => {
    const strapSlices = [
      [-0.085, 0.018, 0.008, 0.008, 0, 0, 2.1],
      [ 0.000, 0.020, 0.010, 0.010, 0, 0, 2.1],
      [ 0.085, 0.018, 0.008, 0.008, 0, 0, 2.1]
    ];
    const strapGeo = createSculptedLoftGeometry(strapSlices, 12, false, true, true);
    const strap = createHiFiMesh(strapGeo, 0x941820, 0.022);
    strap.position.set(side * 0.038, 0.385, 0.166);
    strap.rotation.set(0.04, 0, side * 0.35);
    torso.add(strap);
  });

  // Open Black Leather Biker Vest Shell (Fitted closely to athletic V-taper)
  const bruiserVestSlices = [
    [0.02, 0.184, 0.138, 0.142, 0, 0.010, 2.2], // Waist hem above belt
    [0.16, 0.198, 0.148, 0.150, 0, 0.014, 2.2], // Lower midriff
    [0.32, 0.222, 0.164, 0.160, 0, 0.018, 2.2], // Ribcage / solar plexus
    [0.48, 0.244, 0.178, 0.168, 0, 0.022, 2.2], // Pectorals
    [0.60, 0.242, 0.172, 0.162, 0, 0.014, 2.15],// Upper chest / armholes
    [0.68, 0.208, 0.148, 0.148, 0, 0.008, 2.1]  // Shoulder yoke connection
  ];
  const vestShellGeo = createBruiserVestLoft(bruiserVestSlices, 28, Math.PI * 0.34, Math.PI * 1.32);
  const vestMesh = createHiFiMesh(vestShellGeo, vestColor, 0.044);
  vestMesh.material.side = THREE.DoubleSide;
  torso.add(vestMesh);

  // Standing Notched Biker Collar framing back and sides of the neck (Lofted)
  const collarSlices = [
    [0.680, 0.104, 0.084, 0.102, 0, -0.010, 2.05],
    [0.725, 0.108, 0.088, 0.106, 0, -0.010, 2.05],
    [0.770, 0.112, 0.092, 0.110, 0, -0.010, 2.05]
  ];
  const collarBackGeo = createBruiserVestLoft(collarSlices, 22, Math.PI * 0.26, Math.PI * 1.48);
  const collarBack = createHiFiMesh(collarBackGeo, vestLapelColor, 0.038);
  collarBack.material.side = THREE.DoubleSide;
  torso.add(collarBack);

  // Vest Shoulder Straps / Trapezius Yoke (extends vest all the way up over shoulders right next to neck)
  [-1, 1].forEach((side) => {
    // Continuous contoured leather shoulder panel spanning from neck to armhole
    const shoulderStrapSlices = [
      [-0.14, 0.076, 0.020, 0.020, 0, 0, 2.2],
      [-0.07, 0.078, 0.022, 0.022, 0, 0, 2.2],
      [ 0.00, 0.080, 0.024, 0.024, 0, 0, 2.2],
      [ 0.07, 0.078, 0.022, 0.022, 0, 0, 2.2],
      [ 0.14, 0.076, 0.020, 0.020, 0, 0, 2.2]
    ];
    const shoulderStrapGeo = createSculptedLoftGeometry(shoulderStrapSlices, 16, false, true, true);
    const shoulderStrap = createHiFiMesh(shoulderStrapGeo, vestColor, 0.040);
    shoulderStrap.position.set(side * 0.162, 0.696, 0.005);
    shoulderStrap.rotation.set(Math.PI * 0.5, 0, side * -0.16);
    torso.add(shoulderStrap);

    // Notched collar front lapel corner tab framing neck side
    const collarTabSlices = [
      [-0.042, 0.016, 0.028, 0.028, 0, 0, 2.1],
      [ 0.000, 0.017, 0.029, 0.029, 0, 0, 2.1],
      [ 0.042, 0.016, 0.028, 0.028, 0, 0, 2.1]
    ];
    const collarTabGeo = createSculptedLoftGeometry(collarTabSlices, 12, false, true, true);
    const collarTab = createHiFiMesh(collarTabGeo, vestLapelColor, 0.032);
    collarTab.position.set(side * 0.092, 0.715, 0.075);
    collarTab.rotation.set(-0.15, side * -0.25, side * 0.12);
    torso.add(collarTab);

    // Frayed sleeveless armhole edges: distressed leather cuff + frayed thread fringe
    const cuffGeo = new THREE.TorusGeometry(0.145, 0.022, 12, 24);
    cuffGeo.computeVertexNormals();
    const cuff = createHiFiMesh(cuffGeo, 0x282932, 0.034);
    cuff.position.set(side * 0.238, 0.54, 0.012);
    cuff.rotation.set(0, Math.PI * 0.5, 0);
    torso.add(cuff);

    // Distressed frayed thread accents along sleeveless armhole rim
    for (let f = 0; f < 8; f++) {
      const fAngle = (f / 8) * Math.PI * 2;
      const fraySlices = [
        [-0.012, 0.007, 0.005, 0.005, 0, 0, 2.0],
        [ 0.012, 0.007, 0.005, 0.005, 0, 0, 2.0]
      ];
      const frayGeo = createSculptedLoftGeometry(fraySlices, 8, false, true, true);
      const fray = createHiFiMesh(
        frayGeo,
        f % 2 === 0 ? 0xd0d0dc : 0x7c7c88,
        0.020
      );
      fray.position.set(
        side * (0.240 + Math.sin(fAngle) * 0.010),
        0.54 + Math.sin(fAngle) * 0.135,
        0.012 + Math.cos(fAngle) * 0.135
      );
      fray.rotation.set(fAngle, 0, side * 0.22);
      torso.add(fray);
    }
  });

  // Hanging Waist Belt Straps below Vest Bottom Hem (Lofted)
  [-0.14, -0.05, 0.05, 0.14].forEach((sx) => {
    const strapSlices = [
      [-0.065, 0.013, 0.010, 0.010, 0, 0, 2.1],
      [ 0.000, 0.014, 0.011, 0.011, 0, 0, 2.1],
      [ 0.065, 0.013, 0.010, 0.010, 0, 0, 2.1]
    ];
    const strapGeo = createSculptedLoftGeometry(strapSlices, 12, false, true, true);
    const strap = createHiFiMesh(strapGeo, 0x181720, 0.03);
    strap.position.set(sx, 0.02, 0.155);
    strap.rotation.set(0.12, 0, (sx < 0 ? 0.08 : -0.08));
    torso.add(strap);

    const tipSlices = [
      [-0.012, 0.013, 0.011, 0.011, 0, 0, 2.1],
      [ 0.012, 0.013, 0.011, 0.011, 0, 0, 2.1]
    ];
    const tipGeo = createSculptedLoftGeometry(tipSlices, 10, false, true, true);
    const metalTip = createHiFiMesh(
      tipGeo,
      silverMetal,
      0.022,
      null,
      0x000000,
      { isMetallic: true }
    );
    metalTip.position.set(sx, -0.045, 0.162);
    torso.add(metalTip);
  });

  // Studded Notched Lapels brought closer toward center: clean central chest width ~0.14m exposed (Lofted)
  [-1, 1].forEach((side) => {
    // Upper lapel collar connecting up to shoulder strap & collar
    const upperLapelSlices = [
      [-0.130, 0.058, 0.016, 0.016, 0, 0, 2.2],
      [ 0.000, 0.060, 0.017, 0.017, 0, 0, 2.2],
      [ 0.130, 0.056, 0.015, 0.015, 0, 0, 2.2]
    ];
    const upperLapelGeo = createSculptedLoftGeometry(upperLapelSlices, 14, false, true, true);
    const upperLapel = createHiFiMesh(upperLapelGeo, vestLapelColor, 0.038);
    upperLapel.position.set(side * 0.128, 0.555, 0.180);
    upperLapel.rotation.set(-0.08, side * -0.20, side * 0.15);
    torso.add(upperLapel);

    // Lower notched lapel tab
    const lowerLapelSlices = [
      [-0.125, 0.055, 0.015, 0.015, 0, 0, 2.2],
      [ 0.000, 0.057, 0.016, 0.016, 0, 0, 2.2],
      [ 0.125, 0.054, 0.014, 0.014, 0, 0, 2.2]
    ];
    const lowerLapelGeo = createSculptedLoftGeometry(lowerLapelSlices, 14, false, true, true);
    const lowerLapel = createHiFiMesh(lowerLapelGeo, vestLapelColor, 0.038);
    lowerLapel.position.set(side * 0.130, 0.34, 0.188);
    lowerLapel.rotation.set(-0.04, side * -0.18, side * -0.10);
    torso.add(lowerLapel);

    // 7 Metallic Silver Dome Studs along the outer border of EACH lapel (14 studs total)
    const studYPositions = [0.63, 0.57, 0.51, 0.45, 0.39, 0.33, 0.27];
    studYPositions.forEach((sy, sIdx) => {
      const studGeo = new THREE.SphereGeometry(0.015, 12, 10);
      studGeo.computeVertexNormals();
      const stud = createHiFiMesh(
        studGeo,
        silverMetal,
        0.022,
        null,
        0x000000,
        { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
      );
      const sx = side * (0.165 + (sIdx < 3 ? (3 - sIdx) * 0.012 : 0.0));
      const sz = 0.200 - (sy - 0.45) * 0.05;
      stud.position.set(sx, sy, sz);
      torso.add(stud);
    });
  });

  // Asymmetric Diagonal Silver Zipper on Left Chest / Lapel (Lofted)
  const zipperBarSlices = [
    [-0.130, 0.008, 0.009, 0.009, 0, 0, 2.0],
    [ 0.130, 0.008, 0.009, 0.009, 0, 0, 2.0]
  ];
  const zipperBarGeo = createSculptedLoftGeometry(zipperBarSlices, 10, false, true, true);
  const zipperBar = createHiFiMesh(
    zipperBarGeo,
    silverMetal,
    0.024,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
  );
  zipperBar.position.set(0.118, 0.42, 0.198);
  zipperBar.rotation.set(-0.06, -0.20, -0.20);
  torso.add(zipperBar);

  const zipperPullSlices = [
    [-0.021, 0.011, 0.010, 0.010, 0, 0, 2.0],
    [ 0.021, 0.011, 0.010, 0.010, 0, 0, 2.0]
  ];
  const zipperPullGeo = createSculptedLoftGeometry(zipperPullSlices, 10, false, true, true);
  const zipperPull = createHiFiMesh(
    zipperPullGeo,
    silverMetal,
    0.022,
    null,
    0x000000,
    { isMetallic: true }
  );
  zipperPull.position.set(0.105, 0.47, 0.208);
  zipperPull.rotation.set(-0.06, -0.20, -0.20);
  torso.add(zipperPull);

  // 5 Metallic Silver Conical Spikes Mounted Directly on EACH Vest Shoulder Strap (Lofted)
  [-1, 1].forEach((side) => {
    [-0.08, -0.04, 0.00, 0.04, 0.08].forEach((sz, spIdx) => {
      const spikeSlices = [
        [0.000, 0.024, 0.024, 0.024, 0, 0, 2.0],
        [0.040, 0.014, 0.014, 0.014, 0, 0, 2.0],
        [0.080, 0.002, 0.002, 0.002, 0, 0, 2.0]
      ];
      const spikeGeo = createSculptedLoftGeometry(spikeSlices, 14, false, true, true);
      const spike = createHiFiMesh(
        spikeGeo,
        silverMetal,
        0.024,
        null,
        0x000000,
        { isMetallic: true, glintThreshold: 0.85, glintIntensity: 2.0 }
      );
      const sy = 0.724 + (spIdx === 2 ? 0.008 : 0.0);
      spike.position.set(side * 0.182, sy, sz);
      spike.rotation.set(sz * 0.28, 0, side * -0.24);
      torso.add(spike);
    });
  });

  // Muscular Neck Column connecting Torso to Head (smooth normals)
  const bruiserNeckSlices = [
    [-0.02, 0.068, 0.066, 0.068, 0, 0.005, 2.0],
    [0.08,  0.064, 0.062, 0.064, 0, 0.002, 2.0],
    [0.16,  0.066, 0.064, 0.066, 0, 0.000, 2.0]
  ];
  const neckGeo = createSculptedLoftGeometry(bruiserNeckSlices, 24, false, false, false);
  const neckMesh = createHiFiMesh(neckGeo, skinColor, 0.032);
  neckMesh.position.y = 0.69;
  torso.add(neckMesh);

  // ==========================================================================
  // 3. CHISELED HEAD LOFT, PROCEDURAL FACE TEXTURE & 6-LOCK MOHAWK CREST
  // ==========================================================================
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.88;
  torso.add(headGroup);

  // Sculpted Angular Head Loft with Chiseled Jawline, Chin Cleft & Cranium
  const bruiserHeadSlices = [
    // [y, rx, rzFront, rzBack, cx = 0, cz = 0, p = 2.0] (frontIsNegZ = false: Front is +Z)
    [-0.142, 0.042, 0.070, 0.044, 0, 0.016, 2.4], // Broad angular chin tip
    [-0.104, 0.080, 0.092, 0.074, 0, 0.012, 2.5], // Angular jawline / Gonion angle (p=2.5 square)
    [-0.064, 0.096, 0.102, 0.088, 0, 0.006, 2.4], // Grimace mouth level
    [-0.016, 0.102, 0.106, 0.096, 0, 0.002, 2.3], // Cheekbones & nose bridge base
    [0.036,  0.098, 0.104, 0.098, 0, 0.000, 2.2], // Eye level & brow ridge
    [0.082,  0.092, 0.092, 0.094, 0, -0.004, 2.1], // Forehead hairline
    [0.132,  0.064, 0.062, 0.070, 0, -0.008, 2.0]  // Cranium apex under mohawk
  ];
  const headGeo = createSculptedLoftGeometry(bruiserHeadSlices, 32, false, true, true);
  const headTex = createBruiserHeadUVTexture(idx);
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.034, headTex);
  headGroup.add(headMesh);

  // 3D Sculpted Angular Nose Wedge on Front (+Z)
  const bruiserNosePts = [
    [0.000, 0.004, 0.005, 0.005, 0, 0.000, 2.0],
    [0.014, 0.014, 0.026, 0.008, 0, 0.010, 2.0],
    [0.040, 0.010, 0.016, 0.006, 0, 0.005, 2.0],
    [0.058, 0.004, 0.005, 0.005, 0, 0.000, 2.0]
  ];
  const noseGeo = createSculptedLoftGeometry(bruiserNosePts, 16, false, true, true);
  const noseMesh = createHiFiMesh(noseGeo, skinColor, 0.024);
  noseMesh.position.set(0, -0.038, 0.098);
  headGroup.add(noseMesh);

  // Sculpted 3D Ears on Left (+X) and Right (-X)
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.034, 0.009, 0.015, 0.015, 0, 0, 2.0],
      [-0.010, 0.016, 0.024, 0.024, side * -0.004, 0, 2.0],
      [0.020,  0.018, 0.026, 0.026, side * -0.006, 0, 2.0],
      [0.036,  0.010, 0.016, 0.016, 0, 0, 2.0]
    ];
    const earGeo = createSculptedLoftGeometry(earSlices, 16, false, true, true);
    const ear = createHiFiMesh(earGeo, skinColor, 0.024);
    ear.position.set(side * 0.098, -0.008, -0.005);
    ear.rotation.set(-0.06, side * 0.20, side * -0.12);
    headGroup.add(ear);
  });

  // Multi-Layered Swept-Back Mohawk Crest: 6 Diamond-Faceted Curved Hair Locks
  const mohawkGroup = new THREE.Group();
  headGroup.add(mohawkGroup);

  const mohawkLockSpecs = [
    // { z, y, length, width, thickness, bendZ, rotX }
    { z: 0.085,  y: 0.095, length: 0.160, width: 0.068, thickness: 0.040, bendZ: -0.045, rotX: 0.10 },  // Lock 1 (Forehead)
    { z: 0.055,  y: 0.122, length: 0.210, width: 0.075, thickness: 0.045, bendZ: -0.065, rotX: 0.00 },  // Lock 2 (Front-mid)
    { z: 0.015,  y: 0.138, length: 0.240, width: 0.078, thickness: 0.046, bendZ: -0.080, rotX: -0.14 }, // Lock 3 (Apex crown)
    { z: -0.028, y: 0.132, length: 0.220, width: 0.074, thickness: 0.044, bendZ: -0.075, rotX: -0.30 }, // Lock 4 (Crown-back)
    { z: -0.068, y: 0.112, length: 0.180, width: 0.068, thickness: 0.040, bendZ: -0.060, rotX: -0.48 }, // Lock 5 (Upper occiput)
    { z: -0.098, y: 0.082, length: 0.140, width: 0.060, thickness: 0.035, bendZ: -0.045, rotX: -0.68 }  // Lock 6 (Lower nape)
  ];
  mohawkLockSpecs.forEach(({ z, y, length, width, thickness, bendZ, rotX }) => {
    const lockGeo = createCurvedHairLockGeometry(length, width, thickness, bendZ, 0.0);
    const lockMesh = createHiFiMesh(lockGeo, hairDark, 0.034);
    lockMesh.position.set(0, y, z);
    lockMesh.rotation.x = rotX;
    mohawkGroup.add(lockMesh);
  });

  // ==========================================================================
  // 4. TWO-SEGMENT MUSCULAR ARMS & MUAY-THAI BANDAGE WRAPS
  // 100% sculpted continuous deltoid-to-bicep loft and 3D diagonal bandage relief
  // ==========================================================================
  function buildBruiserArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 0.62, 0); // Emerges naturally from sleeveless vest armhole

    // Continuous 8-Slice Deltoid & Muscular Bicep/Tricep Loft arching into armhole
    const bruiserUpperArmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p] with frontIsNegZ = false (+Z is front)
      [ 0.080, 0.065, 0.065, 0.065, side *  0.005, 0, 2.05], // Deltoid apex arching into armhole
      [ 0.030, 0.098, 0.094, 0.096, side *  0.014, 0, 2.15], // Deltoid lateral belly swell
      [-0.035, 0.102, 0.096, 0.098, side *  0.016, 0, 2.20], // Maximum deltoid width under strap
      [-0.105, 0.096, 0.092, 0.094, side *  0.008, 0, 2.20], // Deltoid insertion / bicep origin
      [-0.170, 0.094, 0.095, 0.088, 0, 0.005, 2.18],         // Muscular bicep peak (+Z) & tricep sweep (-Z)
      [-0.235, 0.088, 0.088, 0.082, 0, 0.002, 2.15],         // Lower bicep
      [-0.295, 0.082, 0.080, 0.076, 0, 0.000, 2.10],         // Supracondylar ridge
      [-0.340, 0.078, 0.075, 0.072, 0, 0.000, 2.05]          // Elbow joint insertion
    ];
    const upperArmGeo = createSculptedLoftGeometry(bruiserUpperArmSlices, 24, false, true, true);
    const upperArm = createHiFiMesh(upperArmGeo, skinColor, 0.042);
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);

    // Anatomical Forearm Loft with Brachioradialis Belly Bulge (Dark Charcoal Underlayer)
    const bruiserForearmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p] with frontIsNegZ = false
      [ 0.000, 0.078, 0.076, 0.074, 0, 0, 2.10], // Elbow articulation
      [-0.060, 0.088, 0.082, 0.080, side * 0.006, 0.004, 2.20], // Muscular brachioradialis belly bulge
      [-0.120, 0.086, 0.080, 0.078, side * 0.004, 0.003, 2.18], // Mid-forearm muscular volume
      [-0.180, 0.080, 0.075, 0.072, 0, 0.002, 2.15],             // Upper taper
      [-0.240, 0.075, 0.070, 0.068, 0, 0.000, 2.10],             // Mid taper
      [-0.290, 0.070, 0.066, 0.064, 0, 0.000, 2.05],             // Lower forearm
      [-0.340, 0.066, 0.062, 0.060, 0, 0.000, 2.02]              // Wrist insertion
    ];
    const forearmGeo = createSculptedLoftGeometry(bruiserForearmSlices, 24, false, true, true);
    const forearm = createHiFiMesh(forearmGeo, 0x1c1b22, 0.042);
    elbow.add(forearm);

    // 3D Crisscrossed Diagonal Muay-Thai Athletic Bandage Relief (crossing at ±32° around forearm circumference)
    const bandageWhite = 0xedeae2;
    // Positive diagonal spiral bands (+32° / +0.56 rad)
    [-0.07, -0.15, -0.23, -0.30].forEach((by, bIdx) => {
      const bandR = 0.089 - bIdx * 0.006;
      const bandSlices = [
        [-0.012, bandR, bandR * 0.94, bandR * 0.92, 0, 0, 2.1],
        [ 0.012, bandR, bandR * 0.94, bandR * 0.92, 0, 0, 2.1]
      ];
      const bandGeo = createSculptedLoftGeometry(bandSlices, 20, false, false, false);
      const band = createHiFiMesh(bandGeo, bandageWhite, 0.030);
      band.position.y = by;
      band.rotation.set(0.10, 0, side * 0.56);
      elbow.add(band);
    });

    // Negative diagonal spiral bands (-32° / -0.56 rad)
    [-0.07, -0.15, -0.23, -0.30].forEach((by, bIdx) => {
      const bandR = 0.089 - bIdx * 0.006;
      const bandSlices = [
        [-0.012, bandR, bandR * 0.94, bandR * 0.92, 0, 0, 2.1],
        [ 0.012, bandR, bandR * 0.94, bandR * 0.92, 0, 0, 2.1]
      ];
      const bandGeo = createSculptedLoftGeometry(bandSlices, 20, false, false, false);
      const band = createHiFiMesh(bandGeo, bandageWhite, 0.030);
      band.position.y = by;
      band.rotation.set(-0.10, 0, -side * 0.56);
      elbow.add(band);
    });

    // Wrist Tape Band Loft
    const wristSlices = [
      [-0.025, 0.072, 0.068, 0.066, 0, 0, 2.05],
      [ 0.025, 0.072, 0.068, 0.066, 0, 0, 2.05]
    ];
    const wristTapeGeo = createSculptedLoftGeometry(wristSlices, 20, false, true, true);
    const wristTape = createHiFiMesh(wristTapeGeo, bandageWhite, 0.032);
    wristTape.position.y = -0.34;
    elbow.add(wristTape);

    // Articulated Clenched Combat Fist with 2-Segment Knuckles, Tape & Thumb
    const hand = new THREE.Group();
    hand.position.y = -0.36;
    elbow.add(hand);

    // Contoured Palm Loft
    const palmSlices = [
      [ 0.025, 0.048, 0.036, 0.038, 0, 0, 2.15],
      [-0.020, 0.054, 0.044, 0.044, 0, 0, 2.20],
      [-0.065, 0.050, 0.040, 0.042, 0, 0, 2.15]
    ];
    const palmGeo = createSculptedLoftGeometry(palmSlices, 18, false, true, true);
    const palm = createHiFiMesh(palmGeo, 0x18171f, 0.040);
    hand.add(palm);

    // 4 Distinct Curled Fingers with Proximal and Distal Knuckle Segments & Tape
    for (let k = 0; k < 4; k++) {
      const fx = (k - 1.5) * 0.024;
      // Proximal knuckle segment
      const proxSlices = [
        [-0.015, 0.010, 0.016, 0.008, 0, -0.002, 2.1],
        [ 0.000, 0.012, 0.018, 0.010, 0,  0.002, 2.15],
        [ 0.015, 0.010, 0.016, 0.008, 0, -0.002, 2.1]
      ];
      const proxGeo = createSculptedLoftGeometry(proxSlices, 12, false, true, true);
      const proxKnuckle = createHiFiMesh(proxGeo, 0x22202a, 0.026);
      proxKnuckle.position.set(fx, -0.038, 0.038);
      proxKnuckle.rotation.x = 0.52;
      hand.add(proxKnuckle);

      // White athletic tape cushion over MCP punch knuckle
      const tapeSlices = [
        [-0.012, 0.011, 0.019, 0.011, 0, 0.001, 2.1],
        [ 0.012, 0.011, 0.019, 0.011, 0, 0.001, 2.1]
      ];
      const tapeGeo = createSculptedLoftGeometry(tapeSlices, 12, false, true, true);
      const tapeMesh = createHiFiMesh(tapeGeo, bandageWhite, 0.022);
      tapeMesh.position.set(fx, -0.034, 0.042);
      tapeMesh.rotation.x = 0.52;
      hand.add(tapeMesh);

      // Curled distal phalanx segment tucking inward under fist
      const distSlices = [
        [-0.014, 0.009, 0.013, 0.008, 0, 0, 2.05],
        [ 0.014, 0.009, 0.013, 0.008, 0, 0, 2.05]
      ];
      const distGeo = createSculptedLoftGeometry(distSlices, 10, false, true, true);
      const distMesh = createHiFiMesh(distGeo, 0x1e1c26, 0.024);
      distMesh.position.set(fx, -0.058, 0.024);
      distMesh.rotation.x = 1.35;
      hand.add(distMesh);
    }

    // Articulated 2-Segment Thumb tucked over fingers
    const thumbProxSlices = [
      [-0.018, 0.012, 0.016, 0.012, 0, 0, 2.1],
      [ 0.018, 0.012, 0.016, 0.012, 0, 0, 2.1]
    ];
    const thumbProxGeo = createSculptedLoftGeometry(thumbProxSlices, 12, false, true, true);
    const thumbProx = createHiFiMesh(thumbProxGeo, 0x22202a, 0.026);
    thumbProx.position.set(-side * 0.046, -0.016, 0.034);
    thumbProx.rotation.set(0.30, -side * 0.40, side * 0.15);
    hand.add(thumbProx);

    const thumbDistSlices = [
      [-0.015, 0.011, 0.014, 0.011, 0, 0, 2.05],
      [ 0.015, 0.011, 0.014, 0.011, 0, 0, 2.05]
    ];
    const thumbDistGeo = createSculptedLoftGeometry(thumbDistSlices, 12, false, true, true);
    const thumbDist = createHiFiMesh(thumbDistGeo, 0x1e1c26, 0.024);
    thumbDist.position.set(-side * 0.025, -0.028, 0.045);
    thumbDist.rotation.set(0.65, -side * 0.70, 0);
    hand.add(thumbDist);

    const thumbTapeSlices = [
      [-0.012, 0.013, 0.018, 0.013, 0, 0, 2.1],
      [ 0.012, 0.013, 0.018, 0.013, 0, 0, 2.1]
    ];
    const thumbTapeGeo = createSculptedLoftGeometry(thumbTapeSlices, 12, false, true, true);
    const thumbTape = createHiFiMesh(thumbTapeGeo, bandageWhite, 0.022);
    thumbTape.position.set(-side * 0.036, -0.022, 0.040);
    thumbTape.rotation.set(0.45, -side * 0.55, 0);
    hand.add(thumbTape);

    return { shoulder, elbow, fist: hand, hand };
  }

  const leftArmObj = buildBruiserArm(-1);
  const rightArmObj = buildBruiserArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // ==========================================================================
  // 5. TAPERED CARGO PANTS, ASYMMETRIC RIGHT KNEE ARMOR & SCULPTED COMBAT BOOTS
  // A-stance leg gap >= 3.5cm, sculpted lugged rubber tread, tongue & laces
  // ==========================================================================
  function buildBruiserLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.15, 0, 0);

    // Multi-Slice Baggy Cargo Thigh Loft with natural cloth folds (A-stance leg gap >= 3.5cm)
    const bruiserThighSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p] with frontIsNegZ = false
      [ 0.000, 0.126, 0.128, 0.130, 0, 0.000, 2.22], // Hip insertion (inseam gap ~4.8cm)
      [-0.100, 0.134, 0.136, 0.138, 0, 0.005, 2.25], // Upper quadriceps baggy fold bulge
      [-0.200, 0.138, 0.140, 0.142, 0, 0.008, 2.25], // Mid-thigh maximum baggy drape
      [-0.320, 0.130, 0.132, 0.134, 0, 0.005, 2.20], // Lower thigh taper
      [-0.440, 0.118, 0.116, 0.120, 0, 0.002, 2.15], // Supracondylar knee transition
      [-0.480, 0.110, 0.108, 0.112, 0, 0.000, 2.10]  // Knee joint insertion
    ];
    const thighGeo = createSculptedLoftGeometry(bruiserThighSlices, 24, false, true, true);
    const thigh = createHiFiMesh(thighGeo, pantsColor, 0.044);
    hipJoint.add(thigh);

    // Natural Thigh Cloth Crease Fold Rings (Lofted)
    [-0.16, -0.28].forEach((fy) => {
      const foldSlices = [
        [-0.020, 0.136, 0.138, 0.140, 0, 0.005, 2.22],
        [ 0.000, 0.142, 0.144, 0.146, 0, 0.008, 2.25],
        [ 0.020, 0.136, 0.138, 0.140, 0, 0.005, 2.22]
      ];
      const foldGeo = createSculptedLoftGeometry(foldSlices, 20, false, false, false);
      const fold = createHiFiMesh(foldGeo, pantsColor, 0.034);
      fold.position.y = fy;
      hipJoint.add(fold);
    });

    // Outer-Thigh Cargo Bellows Flap Pocket (Lofted)
    const pocketSlices = [
      [-0.090, 0.038, 0.078, 0.078, 0, 0, 2.3],
      [ 0.000, 0.040, 0.080, 0.080, 0, 0, 2.35],
      [ 0.090, 0.038, 0.078, 0.078, 0, 0, 2.3]
    ];
    const cargoPocketGeo = createSculptedLoftGeometry(pocketSlices, 16, false, true, true);
    const cargoPocket = createHiFiMesh(cargoPocketGeo, 0x14151e, 0.038);
    cargoPocket.position.set(side * 0.148, -0.22, 0);
    hipJoint.add(cargoPocket);

    const flapSlices = [
      [-0.022, 0.042, 0.082, 0.082, 0, 0, 2.3],
      [ 0.022, 0.042, 0.082, 0.082, 0, 0, 2.3]
    ];
    const flapGeo = createSculptedLoftGeometry(flapSlices, 14, false, true, true);
    const pocketFlap = createHiFiMesh(flapGeo, 0x101118, 0.032);
    pocketFlap.position.set(side * 0.152, -0.12, 0);
    pocketFlap.rotation.z = side * -0.06;
    hipJoint.add(pocketFlap);

    const snapSlices = [
      [-0.006, 0.012, 0.012, 0.012, 0, 0, 2.0],
      [ 0.006, 0.012, 0.012, 0.012, 0, 0, 2.0]
    ];
    const snapGeo = createSculptedLoftGeometry(snapSlices, 10, false, true, true);
    const pocketSnap = createHiFiMesh(
      snapGeo,
      silverMetal,
      0.020,
      null,
      0x000000,
      { isMetallic: true }
    );
    pocketSnap.position.set(side * 0.196, -0.13, 0);
    hipJoint.add(pocketSnap);

    const kneeJoint = new THREE.Group();
    kneeJoint.position.y = -0.48;
    hipJoint.add(kneeJoint);

    // ASYMMETRIC KNEE ARMOR SPECIFICATION:
    // Right Knee (side === 1): Armored Contoured Hardshell Pad with 4 Silver Rivets & Dual Retention Straps.
    // Left Knee (side === -1): UNARMORED Cargo Pants Natural Flexion Folds!
    if (side === 1) {
      // Molded Charcoal-Grey Hardshell Knee Guard (Lofted)
      const armorSlices = [
        [-0.075, 0.072, 0.028, 0.010, 0, 0.000, 2.2], // Lower tapered apex
        [-0.030, 0.084, 0.040, 0.012, 0, 0.005, 2.3], // Lower patellar swell
        [ 0.020, 0.086, 0.042, 0.012, 0, 0.006, 2.3], // Upper patellar swell
        [ 0.075, 0.074, 0.030, 0.010, 0, 0.000, 2.2]  // Upper rim
      ];
      const kneePadGeo = createSculptedLoftGeometry(armorSlices, 20, false, true, true);
      const kneePad = createHiFiMesh(kneePadGeo, 0x484b56, 0.040);
      kneePad.position.set(0, 0.02, 0.125);
      kneeJoint.add(kneePad);

      // 4 Corner Silver Rivets on Knee Armor Plate (Lofted)
      [-0.052, 0.052].forEach((rx) => {
        [-0.045, 0.045].forEach((ry) => {
          const rivetSlices = [
            [-0.006, 0.012, 0.012, 0.012, 0, 0, 2.0],
            [ 0.006, 0.012, 0.012, 0.012, 0, 0, 2.0]
          ];
          const rivetGeo = createSculptedLoftGeometry(rivetSlices, 10, false, true, true);
          const rivet = createHiFiMesh(
            rivetGeo,
            silverMetal,
            0.022,
            null,
            0x000000,
            { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
          );
          rivet.position.set(rx, 0.02 + ry, 0.160);
          kneeJoint.add(rivet);
        });
      });

      // Dual Black Elastic Retention Straps around popliteal fossa (Lofted)
      [-0.025, 0.055].forEach((sy) => {
        const strapSlices = [
          [-0.018, 0.120, 0.116, 0.116, 0, 0.002, 2.15],
          [ 0.018, 0.120, 0.116, 0.116, 0, 0.002, 2.15]
        ];
        const kneeStrapGeo = createSculptedLoftGeometry(strapSlices, 22, false, false, false);
        const kneeStrap = createHiFiMesh(kneeStrapGeo, 0x121216, 0.032);
        kneeStrap.position.set(0, sy, 0);
        kneeJoint.add(kneeStrap);
      });
    } else {
      // Left Knee: Unarmored Cargo Pants Natural Cloth Knee Flexion Folds (Lofted)
      const leftKneeFoldSlices = [
        [-0.040, 0.118, 0.114, 0.112, 0, 0.002, 2.15],
        [ 0.000, 0.126, 0.124, 0.116, 0, 0.012, 2.25], // Natural forward flexion crease bulge
        [ 0.040, 0.118, 0.114, 0.112, 0, 0.002, 2.15]
      ];
      const leftKneeGeo = createSculptedLoftGeometry(leftKneeFoldSlices, 22, false, false, false);
      const leftKneeFold = createHiFiMesh(leftKneeGeo, pantsColor, 0.036);
      leftKneeFold.position.set(0, 0.02, 0.01);
      kneeJoint.add(leftKneeFold);
    }

    // Lower Calf & Bloused Pant Leg Cuff over Boot (Lofted)
    const bruiserCalfPantsSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p] with frontIsNegZ = false
      [ 0.000, 0.114, 0.110, 0.112, 0, 0.000, 2.15], // Below knee joint
      [-0.080, 0.122, 0.118, 0.124, 0, -0.005, 2.22],// Gastrocnemius muscle / cloth drape volume
      [-0.180, 0.118, 0.114, 0.118, 0, -0.002, 2.20],// Mid calf
      [-0.280, 0.110, 0.106, 0.110, 0, 0.000, 2.15], // Lower calf
      [-0.360, 0.102, 0.098, 0.102, 0, 0.000, 2.10]  // Inset into boot collar
    ];
    const calfGeo = createSculptedLoftGeometry(bruiserCalfPantsSlices, 24, false, true, true);
    const calf = createHiFiMesh(calfGeo, pantsColor, 0.044);
    kneeJoint.add(calf);

    // Deep bloused pant leg cuff overhang loft
    const blousedCuffSlices = [
      [-0.300, 0.112, 0.108, 0.110, 0, 0.000, 2.15],
      [-0.340, 0.124, 0.120, 0.122, 0, 0.002, 2.25], // Deep fold bulge overhang
      [-0.370, 0.116, 0.112, 0.114, 0, 0.000, 2.20]
    ];
    const blousedCuffGeo = createSculptedLoftGeometry(blousedCuffSlices, 22, false, true, true);
    const blousedCuff = createHiFiMesh(blousedCuffGeo, pantsColor, 0.038);
    kneeJoint.add(blousedCuff);

    // Heavy Laced Brawler Combat Boot (100% Sculpted Lofts)
    const boot = new THREE.Group();
    boot.position.set(0, -0.44, 0.02);
    kneeJoint.add(boot);

    // Thick Lugged Rubber Outsole (Lofted)
    const soleSlices = [
      [-0.075, 0.108, 0.200, 0.145, 0, 0.020, 2.5], // Outsole tread baseline
      [-0.040, 0.112, 0.204, 0.148, 0, 0.020, 2.5]  // Midsole junction
    ];
    const soleGeo = createSculptedLoftGeometry(soleSlices, 24, false, true, true);
    const sole = createHiFiMesh(soleGeo, 0x0c0b0e, 0.048);
    boot.add(sole);

    // Midsole Welt Line (Lofted)
    const weltSlices = [
      [-0.040, 0.108, 0.198, 0.144, 0, 0.018, 2.4],
      [-0.025, 0.105, 0.194, 0.140, 0, 0.018, 2.4]
    ];
    const weltGeo = createSculptedLoftGeometry(weltSlices, 22, false, false, false);
    const welt = createHiFiMesh(weltGeo, 0x22222a, 0.026);
    boot.add(welt);

    // Rear Heel Step Cleat (Lofted)
    const heelSlices = [
      [-0.075, 0.104, 0.010, 0.140, 0, -0.010, 2.4],
      [-0.045, 0.106, 0.010, 0.142, 0, -0.010, 2.4]
    ];
    const heelGeo = createSculptedLoftGeometry(heelSlices, 18, false, true, true);
    const heel = createHiFiMesh(heelGeo, 0x08080a, 0.038);
    boot.add(heel);

    // 3D Lug Tread Cleats under Forefoot (Lofted)
    [-0.035, 0.035].forEach((tx) => {
      [0.05, 0.11, 0.17].forEach((tz) => {
        const cleatSlices = [
          [-0.082, 0.016, 0.018, 0.018, 0, 0, 2.2],
          [-0.072, 0.018, 0.020, 0.020, 0, 0, 2.2]
        ];
        const cleatGeo = createSculptedLoftGeometry(cleatSlices, 10, false, true, true);
        const cleat = createHiFiMesh(cleatGeo, 0x060608, 0.022);
        cleat.position.set(tx, 0, tz);
        boot.add(cleat);
      });
    });

    // Combat Boot Leather Upper & Shaft (Lofted)
    const bootUpperSlices = [
      [-0.025, 0.098, 0.185, 0.130, 0, 0.018, 2.35], // Vamp & instep
      [ 0.020, 0.088, 0.140, 0.110, 0, 0.012, 2.25], // Ankle transition
      [ 0.070, 0.080, 0.090, 0.092, 0, 0.006, 2.18], // Mid shaft
      [ 0.120, 0.082, 0.084, 0.086, 0, 0.002, 2.15], // Upper shaft
      [ 0.160, 0.086, 0.088, 0.090, 0, 0.000, 2.15]  // Collar rim under bloused cuff
    ];
    const upperGeo = createSculptedLoftGeometry(bootUpperSlices, 24, false, false, true);
    const upper = createHiFiMesh(upperGeo, 0x18171f, 0.046);
    boot.add(upper);

    // Rounded Toe Box (Lofted)
    const toeBoxSlices = [
      [-0.030, 0.088, 0.090, 0.010, 0, 0.120, 2.25],
      [ 0.010, 0.082, 0.082, 0.010, 0, 0.115, 2.20],
      [ 0.045, 0.065, 0.055, 0.008, 0, 0.105, 2.10]
    ];
    const toeBoxGeo = createSculptedLoftGeometry(toeBoxSlices, 18, false, true, true);
    const toeBox = createHiFiMesh(toeBoxGeo, 0x14131a, 0.038);
    boot.add(toeBox);

    // Extended Front Tongue rising above boot collar (Lofted)
    const tongueSlices = [
      [0.020, 0.036, 0.015, 0.010, 0, 0.100, 2.1],
      [0.080, 0.038, 0.016, 0.010, 0, 0.092, 2.1],
      [0.140, 0.040, 0.016, 0.010, 0, 0.084, 2.1],
      [0.190, 0.036, 0.014, 0.008, 0, 0.076, 2.05]
    ];
    const tongueGeo = createSculptedLoftGeometry(tongueSlices, 14, false, true, true);
    const tongue = createHiFiMesh(tongueGeo, 0x121118, 0.032);
    boot.add(tongue);

    // Front Boot Laces with 4 Pairs of Silver Eyelets (Lofted)
    [-0.036, 0.036].forEach((lx) => {
      [0.04, 0.075, 0.11, 0.145].forEach((ly, lIdx) => {
        const eyeletSlices = [
          [-0.005, 0.008, 0.008, 0.008, 0, 0, 2.0],
          [ 0.005, 0.008, 0.008, 0.008, 0, 0, 2.0]
        ];
        const eyeletGeo = createSculptedLoftGeometry(eyeletSlices, 10, false, true, true);
        const eyelet = createHiFiMesh(
          eyeletGeo,
          silverMetal,
          0.018,
          null,
          0x000000,
          { isMetallic: true }
        );
        eyelet.position.set(lx, ly, 0.118 - lIdx * 0.018);
        boot.add(eyelet);
      });
    });

    // Dark crisscrossed front combat laces (Lofted)
    [0.04, 0.075, 0.11, 0.145].forEach((ly, lIdx) => {
      const laceSlices = [
        [-0.036, 0.006, 0.006, 0.006, 0, 0, 2.0],
        [ 0.036, 0.006, 0.006, 0.006, 0, 0, 2.0]
      ];
      const laceGeo = createSculptedLoftGeometry(laceSlices, 10, false, true, true);
      const lace = createHiFiMesh(laceGeo, 0x08080c, 0.020);
      lace.position.set(0, ly, 0.120 - lIdx * 0.018);
      lace.rotation.set(0.24, 0, (lIdx % 2 === 0 ? 0.28 : -0.28));
      boot.add(lace);
    });

    return { hipJoint, kneeJoint, boot };
  }

  const leftLegObj = buildBruiserLeg(-1);
  const rightLegObj = buildBruiserLeg(1);
  hips.add(leftLegObj.hipJoint);
  hips.add(rightLegObj.hipJoint);

  const rig = optimizeArticulatedRigBones({
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
    leftAnkle: leftLegObj.boot,
    rightLeg: rightLegObj.hipJoint,
    rightKnee: rightLegObj.kneeJoint,
    rightAnkle: rightLegObj.boot
  });

  return { rig, ...rig };
}

// Export alias matching ORIGINAL_REQUEST.md & PROJECT.md
export const createBruiserModel = buildBruiserModel;

