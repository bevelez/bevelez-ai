import * as THREE from 'three';
import {
  createCelMaterial,
  createHiFiMesh,
  createSculptedLoftGeometry,
  optimizeArticulatedRigBones
} from './shared.js?v=20261018h';

// ============================================================================
// ENHANCED CHEERING CROWD SPECTATOR PROCEDURAL 3D MODEL
// 6 Streetwear Styles, Accessories (Caps, Shades), Sneakers & Articulated Arms
// ============================================================================

let spectatorCounter = 0;
const _spectatorFaceTexCache = {};

// Palette defense mapping neon legacy colors to grounded urban block-party palette
const SPECTATOR_COLOR_NORMALIZER = {
  0xff2a85: 0xc26a2b, // Burnt Ochre
  0xff007f: 0xc26a2b,
  0x00f0ff: 0x3b4d66, // Slate Denim
  0x2ef064: 0x4a5d3f, // Olive Drab
  0x00ff66: 0x4a5d3f,
  0xffd700: 0xd49b35, // Warm Mustard
  0xffd428: 0xd49b35,
  0x9b51e0: 0x9e3328, // Terracotta Crimson
  0x9d4edd: 0x9e3328,
  0x38b6ff: 0x3b4d66, // Slate Denim
  0xe03228: 0x9e3328, // Terracotta Crimson
  0xff6b00: 0xc26a2b  // Burnt Ochre
};

/**
 * Procedural 256x256 Cel-Shaded Graphic-Novel Face Texture Canvas for Crowd Spectators.
 * Generates expressive anime/comic eyes, raised eyebrows, smiles, and stylized sunglasses.
 */
function createSpectatorFaceTexture(skinHex = 0xd89c74, styleIdx = 0) {
  const cacheKey = `${skinHex}_${styleIdx}`;
  if (_spectatorFaceTexCache[cacheKey]) return _spectatorFaceTexCache[cacheKey];

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Convert hex to CSS hex string
  const skinCss = '#' + skinHex.toString(16).padStart(6, '0');

  // 1. Base Warm Skin Fill
  ctx.fillStyle = skinCss;
  ctx.fillRect(0, 0, 256, 256);

  if (styleIdx === 2) {
    // STYLE 2: Sleek Streetwear Sunglasses / Wrap-Around Shades (Centered on Front Face)
    // Dark frame centered at x = 128 (width 88px, covering +/- 62 deg)
    ctx.fillStyle = '#121218';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(84, 94, 88, 46, 6);
    } else {
      ctx.rect(84, 94, 88, 46);
    }
    ctx.fill();

    // Polarized lenses
    ctx.fillStyle = '#1c1e2a';
    ctx.fillRect(89, 99, 36, 36);
    ctx.fillRect(131, 99, 36, 36);

    // Diagonal specular reflections across lenses
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.moveTo(98, 99);
    ctx.lineTo(107, 99);
    ctx.lineTo(97, 135);
    ctx.lineTo(88, 135);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(140, 99);
    ctx.lineTo(149, 99);
    ctx.lineTo(139, 135);
    ctx.lineTo(130, 135);
    ctx.closePath();
    ctx.fill();

    // Frame center bridge
    ctx.fillStyle = '#2a2b38';
    ctx.fillRect(123, 105, 10, 8);

    // Smiling grin mouth below sunglasses
    ctx.strokeStyle = '#1a0e0a';
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(114, 178);
    ctx.quadraticCurveTo(128, 196, 142, 178);
    ctx.stroke();

    // White teeth smile glint
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(119, 179);
    ctx.quadraticCurveTo(128, 188, 137, 179);
    ctx.lineTo(135, 183);
    ctx.quadraticCurveTo(128, 191, 121, 183);
    ctx.closePath();
    ctx.fill();
  } else {
    // STYLES 0, 1, 3, 4, 5, 6: Expressive Cel-Shaded Comic Eyes & Eyebrows (Centered at x=128 +/- 24)
    const isCheering = styleIdx === 0 || styleIdx === 3 || styleIdx === 5;

    // Eyebrows centered symmetrically
    [-1, 1].forEach((side) => {
      const bx = 128 + side * 22;
      ctx.strokeStyle = '#18100c';
      ctx.lineWidth = 4.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (isCheering) {
        // High arched hyped eyebrow
        ctx.moveTo(128 + side * 8, 90);
        ctx.quadraticCurveTo(bx, 74, bx + side * 14, 82);
      } else {
        // Confident, engaged brow
        ctx.moveTo(128 + side * 8, 87);
        ctx.quadraticCurveTo(bx, 77, bx + side * 14, 81);
      }
      ctx.stroke();
    });

    // Almond Anime Eyes centered on front of skull
    [-1, 1].forEach((side) => {
      const ex = 128 + side * 22;
      const ey = 112;

      // Sclera
      ctx.fillStyle = '#f5f6fa';
      ctx.beginPath();
      ctx.moveTo(ex - side * 12, ey);
      ctx.quadraticCurveTo(ex, ey - 9, ex + side * 12, ey - 3);
      ctx.quadraticCurveTo(ex + side * 9, ey + 8, ex, ey + 8);
      ctx.quadraticCurveTo(ex - side * 7, ey + 6, ex - side * 12, ey);
      ctx.closePath();
      ctx.fill();

      // Iris & Pupil
      ctx.fillStyle = '#1e1410';
      ctx.beginPath();
      ctx.arc(ex - side * 1.5, ey + 1, 5.2, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - side * 3.0, ey - 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Upper graphic eyeliner
      ctx.strokeStyle = '#100c08';
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - side * 13, ey + 1);
      ctx.quadraticCurveTo(ex, ey - 9, ex + side * 13, ey - 3);
      ctx.stroke();

      // Lower lid mark
      ctx.strokeStyle = 'rgba(24, 16, 12, 0.45)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ex - side * 6, ey + 8);
      ctx.lineTo(ex + side * 6, ey + 8);
      ctx.stroke();
    });

    // Graphic-novel nose bridge mark
    ctx.strokeStyle = 'rgba(28, 18, 12, 0.65)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(128, 134);
    ctx.lineTo(130, 142);
    ctx.lineTo(125, 146);
    ctx.stroke();

    // Mouth Expression centered on front of face
    if (isCheering) {
      // Wide open cheering mouth shouting in hype
      ctx.fillStyle = '#220e0e';
      ctx.beginPath();
      ctx.moveTo(115, 174);
      ctx.quadraticCurveTo(128, 166, 141, 174);
      ctx.quadraticCurveTo(128, 206, 115, 174);
      ctx.closePath();
      ctx.fill();

      // White upper teeth row
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(119, 174, 18, 6);

      // Dark mouth outline
      ctx.strokeStyle = '#140808';
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.moveTo(115, 174);
      ctx.quadraticCurveTo(128, 166, 141, 174);
      ctx.quadraticCurveTo(128, 206, 115, 174);
      ctx.stroke();
    } else {
      // Confident smile with teeth
      ctx.strokeStyle = '#180c08';
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(115, 178);
      ctx.quadraticCurveTo(128, 196, 141, 178);
      ctx.stroke();

      // White teeth
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(120, 179);
      ctx.quadraticCurveTo(128, 187, 136, 179);
      ctx.lineTo(134, 183);
      ctx.quadraticCurveTo(128, 190, 122, 183);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _spectatorFaceTexCache[cacheKey] = tex;
  return tex;
}

/**
 * Streetwear DJ / Producer Headphones accessory.
 * Supports wearing over ears or resting around neck/collar.
 */
function buildStreetwearHeadphones(parentGroup, yPos = 0.0, zPos = 0.0, colorHex = 0x181a20, accentHex = 0xd49b35, overEars = false) {
  const hpGroup = new THREE.Group();
  hpGroup.position.set(0, yPos, zPos);
  parentGroup.add(hpGroup);

  if (overEars) {
    const overHeadBandSlices = [
      [0.015, 0.098, 0.014, 0.014, 0, 0.002, 2.0],
      [0.065, 0.096, 0.015, 0.015, 0, 0.003, 2.05],
      [0.115, 0.082, 0.016, 0.016, 0, 0.004, 2.1],
      [0.150, 0.052, 0.016, 0.016, 0, 0.004, 2.05]
    ];
    const bandGeo = createSculptedLoftGeometry(overHeadBandSlices, 20, false, false, false);
    const band = createHiFiMesh(bandGeo, colorHex, 0.026);
    band.position.set(0, 0.07, 0.005);
    hpGroup.add(band);

    [-1, 1].forEach((side) => {
      const cupSlices = [
        [-0.024, 0.012, 0.024, 0.024, side * 0.098, 0, 2.1],
        [ 0.000, 0.016, 0.028, 0.028, side * 0.104, 0, 2.15],
        [ 0.024, 0.012, 0.024, 0.024, side * 0.098, 0, 2.1]
      ];
      const cupGeo = createSculptedLoftGeometry(cupSlices, 14, false, true, true);
      const cup = createHiFiMesh(cupGeo, colorHex, 0.028);
      cup.position.set(0, 0.005, -0.002);
      hpGroup.add(cup);

      const ringSlices = [
        [-0.006, 0.006, 0.018, 0.018, side * 0.110, 0, 2.1],
        [ 0.006, 0.006, 0.018, 0.018, side * 0.110, 0, 2.1]
      ];
      const ringGeo = createSculptedLoftGeometry(ringSlices, 12, false, true, true);
      const ring = createHiFiMesh(ringGeo, accentHex, 0.020);
      ring.position.set(0, 0.005, -0.002);
      hpGroup.add(ring);
    });
  } else {
    const neckBandSlices = [
      [-0.012, 0.142, 0.014, 0.085, 0, -0.008, 2.1],
      [ 0.000, 0.150, 0.016, 0.095, 0, -0.010, 2.15],
      [ 0.012, 0.142, 0.014, 0.085, 0, -0.008, 2.1]
    ];
    const bandGeo = createSculptedLoftGeometry(neckBandSlices, 20, false, false, false);
    const band = createHiFiMesh(bandGeo, colorHex, 0.028);
    band.position.set(0, 0.02, 0.01);
    hpGroup.add(band);

    [-1, 1].forEach((side) => {
      const cupSlices = [
        [-0.015, 0.022, 0.026, 0.026, side * 0.145, 0.085, 2.15],
        [ 0.015, 0.022, 0.026, 0.026, side * 0.145, 0.085, 2.15]
      ];
      const cupGeo = createSculptedLoftGeometry(cupSlices, 14, false, true, true);
      const cup = createHiFiMesh(cupGeo, colorHex, 0.028);
      cup.rotation.y = side * 0.35;
      hpGroup.add(cup);

      const accentSlices = [
        [-0.008, 0.016, 0.018, 0.018, side * 0.145, 0.098, 2.1],
        [ 0.008, 0.016, 0.018, 0.018, side * 0.145, 0.098, 2.1]
      ];
      const accentGeo = createSculptedLoftGeometry(accentSlices, 12, false, true, true);
      const accent = createHiFiMesh(accentGeo, accentHex, 0.020);
      accent.rotation.y = side * 0.35;
      hpGroup.add(accent);
    });
  }
}

export function buildSpectatorModel(
  shirtHex = 0xc26a2b,
  pantsHex = 0x22242a,
  skinHex = 0xd89c74,
  styleIdx = null
) {
  // Normalize neon colors if passed
  if (SPECTATOR_COLOR_NORMALIZER[shirtHex]) shirtHex = SPECTATOR_COLOR_NORMALIZER[shirtHex];
  if (SPECTATOR_COLOR_NORMALIZER[pantsHex]) pantsHex = SPECTATOR_COLOR_NORMALIZER[pantsHex];

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  const style = styleIdx !== null ? (Math.abs(styleIdx) % 7) : (spectatorCounter++ % 7);

  // 1. Torso Geometry with 3 Multi-Slice Sculpted Streetwear Silhouettes (frontIsNegZ = false):
  // - Hoodies (Styles 3, 5): multi-slice loft with kangaroo pouch protrusion, drawstrings, ribbed hem
  // - Bomber Jackets (Styles 1, 4): puffy midriff/chest loft, knit collar, sculpted zipper
  // - Layered Streetwear Tees (Styles 0, 2, 6): tapered athletic loft, crewneck collar trim
  const torso = new THREE.Group();
  torso.position.y = 0.04;
  hips.add(torso);

  if (style === 3 || style === 5) {
    // STREETWEAR HOODIE MULTI-SLICE LOFT
    const hoodieTorsoSlices = [
      [0.00, 0.200, 0.145, 0.140, 0, 0.000, 2.2], // Ribbed hem base
      [0.07, 0.204, 0.148, 0.142, 0, 0.000, 2.2], // Hem top
      [0.18, 0.228, 0.182, 0.150, 0, 0.010, 2.25],// Midriff + kangaroo pouch protrusion
      [0.28, 0.235, 0.184, 0.152, 0, 0.010, 2.25],// Upper pouch
      [0.44, 0.244, 0.170, 0.155, 0, 0.006, 2.2], // Pectoral chest
      [0.54, 0.232, 0.145, 0.140, 0, 0.004, 2.15],// Upper chest
      [0.66, 0.125, 0.105, 0.105, 0, 0.000, 2.0]  // Neck base slope
    ];
    const hoodieGeo = createSculptedLoftGeometry(hoodieTorsoSlices, 22, false, true, true);
    const hoodieMesh = createHiFiMesh(hoodieGeo, shirtHex, 0.044);
    torso.add(hoodieMesh);

    // 3D Contoured Kangaroo Pouch Pocket Loft
    const pouchSlices = [
      [0.16, 0.110, 0.014, 0.004, 0, 0.188, 2.2],
      [0.23, 0.118, 0.018, 0.004, 0, 0.194, 2.25],
      [0.29, 0.105, 0.014, 0.004, 0, 0.190, 2.2]
    ];
    const pouchGeo = createSculptedLoftGeometry(pouchSlices, 18, false, true, true);
    const pouch = createHiFiMesh(pouchGeo, shirtHex, 0.038);
    torso.add(pouch);

    // Cream drawstrings hanging down chest with metallic aglets
    [-0.035, 0.035].forEach((dx) => {
      const stringSlices = [
        [0.39, 0.007, 0.007, 0.007, dx, 0.182, 2.0],
        [0.55, 0.007, 0.007, 0.007, dx, 0.182, 2.0]
      ];
      const stringGeo = createSculptedLoftGeometry(stringSlices, 10, false, true, true);
      const stringMesh = createHiFiMesh(stringGeo, 0xe8e2d4, 0.016);
      torso.add(stringMesh);

      const agletSlices = [
        [0.370, 0.009, 0.009, 0.009, dx, 0.182, 2.0],
        [0.394, 0.009, 0.009, 0.009, dx, 0.182, 2.0]
      ];
      const agletGeo = createSculptedLoftGeometry(agletSlices, 10, false, true, true);
      const aglet = createHiFiMesh(agletGeo, 0xdce0ea, 0.014);
      torso.add(aglet);
    });

    if (style === 3) {
      // Relaxed folded hood drape around back of neck
      const hoodDrapeSlices = [
        [0.61, 0.170, 0.040, 0.095, 0, -0.055, 2.1],
        [0.66, 0.185, 0.048, 0.115, 0, -0.065, 2.15],
        [0.70, 0.175, 0.042, 0.100, 0, -0.060, 2.1]
      ];
      const hoodRingGeo = createSculptedLoftGeometry(hoodDrapeSlices, 20, false, false, false);
      const hoodRing = createHiFiMesh(hoodRingGeo, shirtHex, 0.040);
      torso.add(hoodRing);
    }
  } else if (style === 1 || style === 4) {
    // STREETWEAR BOMBER JACKET MULTI-SLICE LOFT
    const bomberTorsoSlices = [
      [0.00, 0.210, 0.145, 0.140, 0, 0.000, 2.3], // Ribbed waistband
      [0.06, 0.214, 0.148, 0.142, 0, 0.000, 2.3],
      [0.20, 0.252, 0.188, 0.172, 0, 0.008, 2.3], // Puffy lower midriff
      [0.36, 0.262, 0.198, 0.182, 0, 0.010, 2.25],// Full puffy chest
      [0.52, 0.248, 0.175, 0.165, 0, 0.006, 2.2], // Upper chest
      [0.64, 0.130, 0.112, 0.112, 0, 0.000, 2.05] // Shoulder slope into knit collar
    ];
    const jacketGeo = createSculptedLoftGeometry(bomberTorsoSlices, 22, false, true, true);
    const jacketMesh = createHiFiMesh(jacketGeo, shirtHex, 0.044);
    torso.add(jacketMesh);

    // Ribbed knit collar
    const collarSlices = [
      [0.63, 0.134, 0.116, 0.116, 0, 0.000, 2.1],
      [0.67, 0.126, 0.108, 0.108, 0, 0.000, 2.05]
    ];
    const collarGeo = createSculptedLoftGeometry(collarSlices, 20, false, false, false);
    const collar = createHiFiMesh(collarGeo, 0x22242a, 0.034);
    torso.add(collar);

    // Sculpted center zipper tape
    const zipperSlices = [
      [0.05, 0.010, 0.010, 0.004, 0, 0.155, 2.0],
      [0.22, 0.010, 0.012, 0.004, 0, 0.195, 2.0],
      [0.40, 0.010, 0.012, 0.004, 0, 0.205, 2.0],
      [0.62, 0.010, 0.010, 0.004, 0, 0.145, 2.0]
    ];
    const zipperGeo = createSculptedLoftGeometry(zipperSlices, 10, false, true, true);
    const zipper = createHiFiMesh(zipperGeo, 0xdce0ea, 0.022);
    torso.add(zipper);

    // Ribbed knit bottom waistband
    const hemSlices = [
      [-0.01, 0.208, 0.142, 0.138, 0, 0.000, 2.25],
      [ 0.06, 0.214, 0.148, 0.142, 0, 0.000, 2.25]
    ];
    const hemGeo = createSculptedLoftGeometry(hemSlices, 20, false, true, true);
    const hem = createHiFiMesh(hemGeo, 0x22242a, 0.035);
    torso.add(hem);
  } else {
    // LAYERED STREETWEAR TEE / LONG-SLEEVE MULTI-SLICE LOFT
    const teeTorsoSlices = [
      [0.00, 0.212, 0.142, 0.140, 0, 0.000, 2.2], // Bottom hem
      [0.06, 0.214, 0.144, 0.142, 0, 0.000, 2.2],
      [0.22, 0.228, 0.155, 0.150, 0, 0.004, 2.2], // Athletic waist
      [0.40, 0.246, 0.168, 0.158, 0, 0.006, 2.2], // Upper chest
      [0.54, 0.235, 0.145, 0.140, 0, 0.004, 2.15],// Clavicle line
      [0.65, 0.120, 0.100, 0.100, 0, 0.000, 2.0]  // Crewneck base
    ];
    const teeGeo = createSculptedLoftGeometry(teeTorsoSlices, 22, false, true, true);
    const teeMesh = createHiFiMesh(teeGeo, shirtHex, 0.044);
    torso.add(teeMesh);

    // Contrasting crewneck collar trim
    const crewSlices = [
      [0.63, 0.124, 0.104, 0.104, 0, 0.000, 2.05],
      [0.67, 0.118, 0.098, 0.098, 0, 0.000, 2.0]
    ];
    const crewGeo = createSculptedLoftGeometry(crewSlices, 20, false, false, false);
    const crew = createHiFiMesh(crewGeo, 0xe8e2d4, 0.030);
    torso.add(crew);

    // Bottom hem trim
    const hemSlices = [
      [-0.01, 0.210, 0.140, 0.138, 0, 0.000, 2.2],
      [ 0.06, 0.214, 0.144, 0.142, 0, 0.000, 2.2]
    ];
    const hemGeo = createSculptedLoftGeometry(hemSlices, 20, false, true, true);
    const hem = createHiFiMesh(hemGeo, shirtHex, 0.035);
    torso.add(hem);
  }

  // 1b. Stationary Sculpted Shoulder Sockets on Torso
  [-1, 1].forEach((side) => {
    const socketSlices = [
      [-0.05, 0.065, 0.065, 0.065, 0, 0, 2.0],
      [ 0.00, 0.076, 0.076, 0.076, 0, 0, 2.0],
      [ 0.05, 0.065, 0.065, 0.065, 0, 0, 2.0]
    ];
    const socketGeo = createSculptedLoftGeometry(socketSlices, 14, false, true, true);
    const socket = createHiFiMesh(socketGeo, shirtHex, 0.040);
    socket.position.set(side * 0.23, 0.58, 0);
    torso.add(socket);
  });

  // 1c. Multi-Slice Sculpted Pelvis Loft on Hips (connects waist hem to leg hips seamlessly)
  const spectatorPelvisSlices = [
    [-0.21, 0.176, 0.126, 0.132, 0, 0.000, 2.15], // Lower groin / gluteus base enclosing thigh roots
    [-0.12, 0.188, 0.138, 0.144, 0, 0.001, 2.2],  // Mid groin taper
    [-0.04, 0.198, 0.146, 0.150, 0, 0.002, 2.25], // Mid pelvis / hip curves
    [ 0.02, 0.202, 0.148, 0.150, 0, 0.002, 2.25]  // Upper waist rim connecting to torso
  ];
  const pelvisGeo = createSculptedLoftGeometry(spectatorPelvisSlices, 20, false, true, true);
  const pelvis = createHiFiMesh(pelvisGeo, pantsHex, 0.042);
  pelvis.position.y = 0.01;
  hips.add(pelvis);

  // 1d. Anatomical 3-Slice Sculpted Neck Loft on Torso (connects collar rim to chin/jawline seamlessly)
  const spectatorNeckSlices = [
    [0.64, 0.066, 0.062, 0.062, 0, 0.005, 2.1], // Base seated inside collar rim (y=0.64..0.67)
    [0.70, 0.060, 0.056, 0.056, 0, 0.003, 2.1], // Mid neck column bridging the void
    [0.77, 0.056, 0.052, 0.054, 0, 0.002, 2.05] // Upper throat inserting cleanly into jawline/chin
  ];
  const neckGeo = createSculptedLoftGeometry(spectatorNeckSlices, 18, false, false, false);
  const neckMesh = createHiFiMesh(neckGeo, skinHex, 0.030);
  torso.add(neckMesh);

  // 2. Sculpted Anime Cranium Loft with 3D Nose Bridge, 3D Ears & 7 Streetwear Styles
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.86;
  torso.add(headGroup);

  const spectatorHeadSlices = [
    [-0.115, 0.024, 0.042, 0.028, 0, 0.012, 2.2], // Pointed anime chin tip
    [-0.085, 0.052, 0.068, 0.050, 0, 0.010, 2.2], // Jawline / gonion V-taper
    [-0.050, 0.070, 0.082, 0.072, 0, 0.005, 2.15],// Mouth level
    [-0.015, 0.080, 0.090, 0.085, 0, 0.002, 2.1], // Cheekbones & nose radix
    [ 0.025, 0.082, 0.092, 0.090, 0, 0.000, 2.05],// Eye midline (u = 0.50 aligns with face texture)
    [ 0.065, 0.078, 0.084, 0.088, 0,-0.003, 2.0], // Brow ridge & temple
    [ 0.098, 0.068, 0.068, 0.078, 0,-0.005, 2.0], // Forehead hairline
    [ 0.125, 0.045, 0.045, 0.055, 0,-0.006, 2.0]  // Cranium apex
  ];
  const headGeo = createSculptedLoftGeometry(spectatorHeadSlices, 24, false, true, true);
  const faceTex = createSpectatorFaceTexture(skinHex, style);
  const head = createHiFiMesh(headGeo, 0xffffff, 0.038, faceTex);
  headGroup.add(head);

  // 3D Sleek Anime Nose Bridge (anchored at nose radix/bridge)
  const spectatorNosePts = [
    [0.000, 0.004, 0.005, 0.005, 0, 0.000, 2.0], // Philtrum
    [0.014, 0.008, 0.018, 0.005, 0, 0.006, 2.0], // Sharp nose tip
    [0.034, 0.006, 0.012, 0.004, 0, 0.003, 2.0], // Mid bridge
    [0.048, 0.003, 0.004, 0.004, 0, 0.000, 2.0]  // Radix between eyes
  ];
  const noseGeo = createSculptedLoftGeometry(spectatorNosePts, 14, false, true, true);
  const noseMesh = createHiFiMesh(noseGeo, skinHex, 0.0); // 0 outline thickness to avoid dark line down nose
  noseMesh.position.set(0, -0.028, 0.084);
  headGroup.add(noseMesh);

  // 3D Sculpted Ears
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.026, 0.007, 0.012, 0.012, 0, 0, 2.0],
      [-0.006, 0.014, 0.019, 0.019, side * -0.003, 0, 2.0],
      [ 0.014, 0.015, 0.021, 0.021, side * -0.004, 0, 2.0],
      [ 0.028, 0.007, 0.012, 0.012, 0, 0, 2.0]
    ];
    const earGeo = createSculptedLoftGeometry(earSlices, 14, false, true, true);
    const ear = createHiFiMesh(earGeo, skinHex, 0.026);
    ear.position.set(side * 0.086, 0.005, -0.002);
    headGroup.add(ear);
  });

  if (style === 0) {
    // STYLE 0: Backwards Snapback Cap with Curved Visor & Streetwear Headphones around neck
    const capCrownSlices = [
      [0.045, 0.082, 0.082, 0.088, 0, -0.004, 2.05],
      [0.085, 0.084, 0.084, 0.088, 0, -0.004, 2.05],
      [0.125, 0.078, 0.076, 0.082, 0, -0.004, 2.0],
      [0.155, 0.048, 0.046, 0.052, 0, -0.004, 2.0]
    ];
    const capGeo = createSculptedLoftGeometry(capCrownSlices, 20, false, false, true);
    const cap = createHiFiMesh(capGeo, shirtHex, 0.042);
    headGroup.add(cap);

    const buttonSlices = [
      [0.152, 0.018, 0.018, 0.018, 0, -0.004, 2.0],
      [0.165, 0.012, 0.012, 0.012, 0, -0.004, 2.0]
    ];
    const buttonGeo = createSculptedLoftGeometry(buttonSlices, 12, false, true, true);
    const button = createHiFiMesh(buttonGeo, 0xe8e2d4, 0.020);
    headGroup.add(button);

    const visorSlices = [
      [0.052, 0.082, 0.010, 0.045, 0, -0.095, 2.0],
      [0.065, 0.078, 0.008, 0.070, 0, -0.145, 2.0],
      [0.078, 0.068, 0.006, 0.055, 0, -0.185, 2.0]
    ];
    const visorGeo = createSculptedLoftGeometry(visorSlices, 16, false, true, true);
    const visor = createHiFiMesh(visorGeo, shirtHex, 0.036);
    headGroup.add(visor);

    // Hair peeking from beneath backwards cap
    const hairSlices = [
      [-0.03, 0.076, 0.035, 0.082, 0, -0.015, 2.05],
      [ 0.03, 0.080, 0.040, 0.086, 0, -0.015, 2.05]
    ];
    const hairGeo = createSculptedLoftGeometry(hairSlices, 16, false, true, true);
    const hair = createHiFiMesh(hairGeo, 0x221814, 0.040);
    headGroup.add(hair);

    buildStreetwearHeadphones(torso, 0.62, 0.01, 0x181a20, 0xd49b35, false);
  } else if (style === 1) {
    // STYLE 1: Forwards Snapback Cap with Curved Visor & Embroidered Patch
    const capCrownSlices = [
      [0.045, 0.082, 0.084, 0.084, 0, -0.002, 2.05],
      [0.085, 0.084, 0.086, 0.086, 0, -0.002, 2.05],
      [0.125, 0.078, 0.080, 0.078, 0, -0.002, 2.0],
      [0.155, 0.048, 0.050, 0.048, 0, -0.002, 2.0]
    ];
    const capGeo = createSculptedLoftGeometry(capCrownSlices, 20, false, false, true);
    const cap = createHiFiMesh(capGeo, 0x3b4d66, 0.042);
    headGroup.add(cap);

    const buttonSlices = [
      [0.152, 0.018, 0.018, 0.018, 0, -0.002, 2.0],
      [0.165, 0.012, 0.012, 0.012, 0, -0.002, 2.0]
    ];
    const buttonGeo = createSculptedLoftGeometry(buttonSlices, 12, false, true, true);
    const button = createHiFiMesh(buttonGeo, 0xd49b35, 0.020);
    headGroup.add(button);

    const visorSlices = [
      [0.055, 0.082, 0.045, 0.010, 0, 0.095, 2.0],
      [0.050, 0.078, 0.070, 0.008, 0, 0.145, 2.0],
      [0.042, 0.068, 0.055, 0.006, 0, 0.185, 2.0]
    ];
    const visorGeo = createSculptedLoftGeometry(visorSlices, 16, false, true, true);
    const visor = createHiFiMesh(visorGeo, 0x3b4d66, 0.036);
    headGroup.add(visor);

    const patchSlices = [
      [0.075, 0.028, 0.008, 0.004, 0, 0.090, 2.0],
      [0.110, 0.028, 0.008, 0.004, 0, 0.088, 2.0]
    ];
    const patchGeo = createSculptedLoftGeometry(patchSlices, 12, false, true, true);
    const patch = createHiFiMesh(patchGeo, 0xe8e2d4, 0.022);
    headGroup.add(patch);
  } else if (style === 2) {
    // STYLE 2: Ribbed Streetwear Beanie with Fold-Up Cuff, Sunglasses & Streetwear Headphones
    const beanieSlices = [
      [0.070, 0.086, 0.088, 0.088, 0, 0.000, 2.1], // Base above cuff
      [0.120, 0.084, 0.086, 0.086, 0, 0.000, 2.1], // Ribbed crown body
      [0.170, 0.072, 0.074, 0.074, 0, 0.000, 2.05],
      [0.210, 0.042, 0.044, 0.044, 0, 0.000, 2.0]  // Dome top
    ];
    const beanieGeo = createSculptedLoftGeometry(beanieSlices, 20, false, true, true);
    const beanie = createHiFiMesh(beanieGeo, 0xd49b35, 0.044);
    headGroup.add(beanie);

    const cuffSlices = [
      [0.040, 0.088, 0.090, 0.090, 0, 0.000, 2.15],
      [0.072, 0.092, 0.094, 0.094, 0, 0.000, 2.15],
      [0.078, 0.086, 0.088, 0.088, 0, 0.000, 2.1]
    ];
    const cuffGeo = createSculptedLoftGeometry(cuffSlices, 20, false, true, true);
    const cuff = createHiFiMesh(cuffGeo, 0xd49b35, 0.038);
    headGroup.add(cuff);

    const tagSlices = [
      [0.045, 0.016, 0.008, 0.004, 0, 0.096, 2.0],
      [0.068, 0.016, 0.008, 0.004, 0, 0.098, 2.0]
    ];
    const tagGeo = createSculptedLoftGeometry(tagSlices, 12, false, true, true);
    const tag = createHiFiMesh(tagGeo, 0x22242a, 0.020);
    headGroup.add(tag);

    buildStreetwearHeadphones(headGroup, 0.02, 0.005, 0x181a20, 0xd49b35, true);
  } else if (style === 3) {
    // STYLE 3: Multi-Lobe Volumetric Textured Afro
    const afroSlices = [
      [0.040, 0.100, 0.095, 0.115, 0, -0.020, 2.1],
      [0.100, 0.125, 0.110, 0.138, 0, -0.025, 2.15],
      [0.165, 0.130, 0.108, 0.142, 0, -0.030, 2.15],
      [0.225, 0.115, 0.090, 0.125, 0, -0.030, 2.1],
      [0.275, 0.065, 0.055, 0.075, 0, -0.025, 2.0]
    ];
    const afroGeo = createSculptedLoftGeometry(afroSlices, 22, false, true, true);
    const afro = createHiFiMesh(afroGeo, 0x161210, 0.048);
    headGroup.add(afro);

    [
      [-0.105, 0.170, -0.025, 0.048],
      [ 0.105, 0.170, -0.025, 0.048],
      [ 0.000, 0.245, -0.040, 0.052],
      [-0.075, 0.120, -0.085, 0.046],
      [ 0.075, 0.120, -0.085, 0.046]
    ].forEach(([lx, ly, lz, lr]) => {
      const lobeSlices = [
        [ly - lr, lr * 0.7, lr * 0.7, lr * 0.7, lx, lz, 2.0],
        [ly,      lr,       lr,       lr,       lx, lz, 2.1],
        [ly + lr, lr * 0.6, lr * 0.6, lr * 0.6, lx, lz, 2.0]
      ];
      const lobeGeo = createSculptedLoftGeometry(lobeSlices, 12, false, true, true);
      const lobe = createHiFiMesh(lobeGeo, 0x161210, 0.040);
      headGroup.add(lobe);
    });
  } else if (style === 4) {
    // STYLE 4: High-Top Fade with Streetwear Headphones
    const fadeSlices = [
      [0.045, 0.082, 0.082, 0.086, 0, -0.010, 2.1], // Base hairline
      [0.095, 0.084, 0.084, 0.088, 0, -0.010, 2.15],// Mid vertical fade
      [0.175, 0.084, 0.084, 0.088, 0, -0.010, 2.2], // Crisp cylindrical walls
      [0.220, 0.080, 0.080, 0.084, 0, -0.010, 2.2], // Flat crown perimeter
      [0.235, 0.040, 0.040, 0.042, 0, -0.010, 2.0]  // Crown center
    ];
    const fadeGeo = createSculptedLoftGeometry(fadeSlices, 20, false, true, true);
    const fade = createHiFiMesh(fadeGeo, 0x181412, 0.044);
    headGroup.add(fade);

    buildStreetwearHeadphones(torso, 0.62, 0.01, 0x181a20, 0xd49b35, false);
  } else if (style === 5) {
    // STYLE 5: Pulled-Up Hoodie Hood with Contoured Binding Rim
    const hoodSlices = [
      [-0.040, 0.102, 0.065, 0.118, 0, -0.035, 2.1], // Hood neckline base
      [ 0.025, 0.115, 0.080, 0.135, 0, -0.038, 2.15],// Mid cranium wrap
      [ 0.095, 0.118, 0.082, 0.138, 0, -0.038, 2.15],
      [ 0.165, 0.108, 0.068, 0.125, 0, -0.035, 2.1], // Upper head curve
      [ 0.215, 0.055, 0.035, 0.065, 0, -0.030, 2.0]  // Apex
    ];
    const hoodGeo = createSculptedLoftGeometry(hoodSlices, 22, false, false, true);
    const hoodMesh = createHiFiMesh(hoodGeo, shirtHex, 0.046);
    headGroup.add(hoodMesh);

    const rimSlices = [
      [0.000, 0.125, 0.018, 0.010, 0, 0.062, 2.15],
      [0.035, 0.132, 0.022, 0.012, 0, 0.068, 2.15],
      [0.070, 0.125, 0.018, 0.010, 0, 0.062, 2.15]
    ];
    const rimGeo = createSculptedLoftGeometry(rimSlices, 20, false, false, false);
    const rim = createHiFiMesh(rimGeo, shirtHex, 0.040);
    headGroup.add(rim);
  } else {
    // STYLE 6: Swept-Back Braids / Ponytail with Streetwear Headphones around neck
    const braidScalpSlices = [
      [0.035, 0.082, 0.080, 0.086, 0, -0.015, 2.05],
      [0.085, 0.085, 0.082, 0.088, 0, -0.015, 2.1],
      [0.130, 0.076, 0.070, 0.082, 0, -0.018, 2.05],
      [0.155, 0.045, 0.040, 0.050, 0, -0.020, 2.0]
    ];
    const braidScalpGeo = createSculptedLoftGeometry(braidScalpSlices, 20, false, true, true);
    const braidScalp = createHiFiMesh(braidScalpGeo, 0x1e1510, 0.045);
    headGroup.add(braidScalp);

    const tieSlices = [
      [0.045, 0.022, 0.022, 0.022, 0, -0.115, 2.0],
      [0.065, 0.020, 0.020, 0.020, 0, -0.115, 2.0]
    ];
    const tieGeo = createSculptedLoftGeometry(tieSlices, 14, false, true, true);
    const tie = createHiFiMesh(tieGeo, 0xd49b35, 0.026);
    headGroup.add(tie);

    const tailSlices = [
      [ 0.055, 0.024, 0.024, 0.024, 0.000, -0.118, 2.0],
      [ 0.010, 0.022, 0.022, 0.022, 0.005, -0.145, 2.0],
      [-0.055, 0.018, 0.018, 0.018, 0.010, -0.175, 2.0],
      [-0.130, 0.014, 0.014, 0.014, 0.015, -0.205, 2.0],
      [-0.200, 0.005, 0.005, 0.005, 0.018, -0.225, 2.0]
    ];
    const tailGeo = createSculptedLoftGeometry(tailSlices, 14, false, true, true);
    const tail = createHiFiMesh(tailGeo, 0x1e1510, 0.038);
    headGroup.add(tail);

    buildStreetwearHeadphones(torso, 0.62, 0.01, 0x181a20, 0xd49b35, false);
  }

  // 3. Multi-Slice Sculpted Cheering Arms with Anatomical Deltoids & Articulated Fists
  function buildSpectatorArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.24, 0.58, 0);

    // Anatomical Deltoid Shoulder Cap centered at pivot (0, 0, 0)
    const spectatorDeltoidSlices = [
      [ 0.070, 0.052, 0.052, 0.052, side * -0.008, 0, 2.0],
      [ 0.025, 0.078, 0.074, 0.074, side *  0.008, 0, 2.1],
      [-0.035, 0.076, 0.072, 0.072, side *  0.006, 0, 2.1],
      [-0.085, 0.065, 0.062, 0.062, 0, 0, 2.05]
    ];
    const deltoidGeo = createSculptedLoftGeometry(spectatorDeltoidSlices, 18, false, true, true);
    const deltoid = createHiFiMesh(deltoidGeo, shirtHex, 0.042);
    shoulder.add(deltoid);

    // Upper arm starting right at shoulder center y = 0 down to y = -0.26
    const spectatorUpperArmSlices = [
      [ 0.00, 0.074, 0.070, 0.072, 0, 0, 2.1], // Shoulder socket connection
      [-0.07, 0.072, 0.068, 0.070, 0, 0, 2.1], // Bicep/tricep peak
      [-0.17, 0.064, 0.060, 0.062, 0, 0, 2.1], // Mid bicep
      [-0.26, 0.058, 0.054, 0.056, 0, 0, 2.0]  // Elbow joint transition
    ];
    const upperGeo = createSculptedLoftGeometry(spectatorUpperArmSlices, 18, false, true, true);
    const upperArm = createHiFiMesh(upperGeo, shirtHex, 0.042);
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    // Forearm extending down from elbow pivot (0, 0, 0) to y = -0.24
    const forearmColor = (style === 1 || style === 3 || style === 5) ? shirtHex : skinHex;
    const spectatorForearmSlices = [
      [ 0.00, 0.060, 0.056, 0.058, 0, 0, 2.1], // Elbow base
      [-0.07, 0.064, 0.058, 0.060, 0, 0, 2.1], // Brachioradialis muscular volume
      [-0.16, 0.054, 0.050, 0.052, 0, 0, 2.0], // Lower forearm taper
      [-0.24, 0.048, 0.046, 0.048, 0, 0, 2.0]  // Wrist insertion
    ];
    const foreGeo = createSculptedLoftGeometry(spectatorForearmSlices, 18, false, true, true);
    const forearm = createHiFiMesh(foreGeo, forearmColor, 0.042);
    elbow.add(forearm);

    // Clenched Cheering Fist at forearm end (y = -0.24)
    const hand = new THREE.Group();
    hand.position.y = -0.24;
    elbow.add(hand);

    // Contoured Palm Loft
    const palmSlices = [
      [ 0.020, 0.036, 0.026, 0.028, 0, 0, 2.1],
      [-0.015, 0.042, 0.032, 0.034, 0, 0, 2.15],
      [-0.050, 0.040, 0.030, 0.032, 0, 0, 2.1]
    ];
    const palmGeo = createSculptedLoftGeometry(palmSlices, 16, false, true, true);
    const palm = createHiFiMesh(palmGeo, skinHex, 0.038);
    hand.add(palm);

    // 4 Curled Knuckle Segments across the fist front
    for (let k = 0; k < 4; k++) {
      const kx = (k - 1.5) * 0.018;
      const knuckleSlices = [
        [-0.018, 0.008, 0.014, 0.006, 0, -0.002, 2.0],
        [-0.034, 0.009, 0.016, 0.008, 0,  0.002, 2.1],
        [-0.048, 0.008, 0.014, 0.006, 0, -0.002, 2.0]
      ];
      const knuckleGeo = createSculptedLoftGeometry(knuckleSlices, 10, false, true, true);
      const knuckle = createHiFiMesh(knuckleGeo, skinHex, 0.024);
      knuckle.position.set(kx, 0, 0.026);
      hand.add(knuckle);
    }

    // Tucked Thumb curving over the index/middle knuckle
    const thumbSlices = [
      [ 0.005, 0.010, 0.012, 0.010, -side * 0.036, 0.012, 2.0],
      [-0.012, 0.012, 0.016, 0.012, -side * 0.026, 0.026, 2.1],
      [-0.028, 0.009, 0.012, 0.009, -side * 0.012, 0.028, 2.0]
    ];
    const thumbGeo = createSculptedLoftGeometry(thumbSlices, 12, false, true, true);
    const thumb = createHiFiMesh(thumbGeo, skinHex, 0.026);
    hand.add(thumb);

    // Wrist accessory: digital watch or wristband
    if (side === -1 && (style === 0 || style === 4)) {
      const watchSlices = [
        [0.025, 0.020, 0.022, 0.022, 0, 0.018, 2.1],
        [0.045, 0.020, 0.022, 0.022, 0, 0.018, 2.1]
      ];
      const watchGeo = createSculptedLoftGeometry(watchSlices, 12, false, true, true);
      const watch = createHiFiMesh(watchGeo, 0x181820, 0.022);
      hand.add(watch);
    } else if (style === 2 || style === 6) {
      const bandSlices = [
        [0.025, 0.052, 0.048, 0.050, 0, 0, 2.1],
        [0.048, 0.052, 0.048, 0.050, 0, 0, 2.1]
      ];
      const bandGeo = createSculptedLoftGeometry(bandSlices, 14, false, true, true);
      const band = createHiFiMesh(bandGeo, 0xd49b35, 0.020);
      hand.add(band);
    }

    return { shoulder, elbow, hand };
  }

  const leftArmObj = buildSpectatorArm(-1);
  const rightArmObj = buildSpectatorArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // 4. Multi-Slice Sculpted Pants & Two-Tone High-Top Sneakers
  [-0.102, 0.102].forEach((lx) => {
    // Upper thigh reaching cleanly up into the pelvis block without lateral overhang
    const spectatorThighSlices = [
      [ 0.00, 0.096, 0.092, 0.094, 0, 0, 2.2], // Hip insertion
      [-0.12, 0.098, 0.095, 0.096, 0, 0, 2.2], // Quadriceps curve
      [-0.26, 0.092, 0.088, 0.090, 0, 0, 2.15],// Lower thigh taper
      [-0.42, 0.085, 0.081, 0.083, 0, 0, 2.1]  // Knee transition
    ];
    const thighGeo = createSculptedLoftGeometry(spectatorThighSlices, 18, false, true, true);
    const thigh = createHiFiMesh(thighGeo, pantsHex, 0.042);
    thigh.position.set(lx, -0.19, 0);
    hips.add(thigh);

    // Knee cloth flexion fold
    const spectatorKneeFoldSlices = [
      [ 0.030, 0.088, 0.085, 0.085, 0, 0.004, 2.1],
      [ 0.000, 0.094, 0.092, 0.086, 0, 0.008, 2.2], // Forward knee flexion crease
      [-0.030, 0.086, 0.083, 0.083, 0, 0.004, 2.1]
    ];
    const kneeGeo = createSculptedLoftGeometry(spectatorKneeFoldSlices, 16, false, true, true);
    const knee = createHiFiMesh(kneeGeo, pantsHex, 0.035);
    knee.position.set(lx, -0.40, 0.005);
    hips.add(knee);

    // Lower calf
    const spectatorCalfSlices = [
      [ 0.00, 0.086, 0.082, 0.084, 0, 0, 2.1], // Below knee fold
      [-0.10, 0.090, 0.085, 0.088, 0, 0, 2.15],// Gastrocnemius volume
      [-0.24, 0.078, 0.073, 0.075, 0, 0, 2.05],// Lower calf taper
      [-0.38, 0.070, 0.068, 0.070, 0, 0, 2.0]  // Ankle cuff insertion
    ];
    const calfGeo = createSculptedLoftGeometry(spectatorCalfSlices, 18, false, true, true);
    const calf = createHiFiMesh(calfGeo, pantsHex, 0.042);
    calf.position.set(lx, -0.61, 0);
    hips.add(calf);

    // Tapered jogger ankle cuff
    const spectatorCuffSlices = [
      [ 0.025, 0.076, 0.074, 0.074, 0, 0, 2.1],
      [ 0.000, 0.082, 0.080, 0.080, 0, 0, 2.15],
      [-0.025, 0.076, 0.074, 0.074, 0, 0, 2.1]
    ];
    const cuffGeo = createSculptedLoftGeometry(spectatorCuffSlices, 16, false, true, true);
    const cuff = createHiFiMesh(cuffGeo, 0x181a20, 0.030);
    cuff.position.set(lx, -0.82, 0);
    hips.add(cuff);

    // Stylized Two-Tone Streetwear Sneaker
    const shoe = new THREE.Group();
    shoe.position.set(lx, -0.86, 0.03);
    hips.add(shoe);

    // Crisp white rubber lug outsole
    const sneakerSoleSlices = [
      [-0.048, 0.082, 0.170, 0.115, 0, 0.015, 2.5],
      [-0.018, 0.084, 0.174, 0.118, 0, 0.015, 2.5]
    ];
    const soleGeo = createSculptedLoftGeometry(sneakerSoleSlices, 20, false, true, true);
    const sole = createHiFiMesh(soleGeo, 0xf2ede4, 0.038);
    shoe.add(sole);

    // White rubber toe bumper cap
    const sneakerToeCapSlices = [
      [-0.018, 0.078, 0.095, 0.010, 0, 0.085, 2.2],
      [ 0.015, 0.068, 0.085, 0.010, 0, 0.082, 2.1],
      [ 0.038, 0.048, 0.060, 0.008, 0, 0.075, 2.0]
    ];
    const bumperGeo = createSculptedLoftGeometry(sneakerToeCapSlices, 18, false, true, true);
    const bumper = createHiFiMesh(bumperGeo, 0xf2ede4, 0.032);
    shoe.add(bumper);

    // Colored sneaker upper
    const sneakerUpperSlices = [
      [-0.018, 0.076, 0.155, 0.110, 0, 0.015, 2.2],
      [ 0.025, 0.070, 0.125, 0.105, 0, 0.018, 2.1],
      [ 0.065, 0.060, 0.075, 0.095, 0, 0.020, 2.05],
      [ 0.100, 0.054, 0.054, 0.080, 0, 0.022, 2.05]
    ];
    const upperGeo = createSculptedLoftGeometry(sneakerUpperSlices, 20, false, true, true);
    const upper = createHiFiMesh(upperGeo, shirtHex, 0.040);
    shoe.add(upper);

    // White lace throat & tongue
    const sneakerTongueSlices = [
      [ 0.030, 0.038, 0.055, 0.020, 0, 0.065, 2.1],
      [ 0.070, 0.036, 0.045, 0.018, 0, 0.048, 2.1],
      [ 0.105, 0.034, 0.035, 0.016, 0, 0.035, 2.0]
    ];
    const tongueGeo = createSculptedLoftGeometry(sneakerTongueSlices, 16, false, true, true);
    const tongue = createHiFiMesh(tongueGeo, 0xf2ede4, 0.025);
    shoe.add(tongue);

    // Mustard heel tab accent
    const heelTabSlices = [
      [ 0.050, 0.018, 0.008, 0.014, 0, -0.095, 2.0],
      [ 0.080, 0.018, 0.008, 0.014, 0, -0.105, 2.0]
    ];
    const heelTabGeo = createSculptedLoftGeometry(heelTabSlices, 12, false, true, true);
    const heelTab = createHiFiMesh(heelTabGeo, 0xd49b35, 0.020);
    shoe.add(heelTab);
  });

  return optimizeArticulatedRigBones({
    root,
    hips,
    torso,
    headGroup,
    leftArm: leftArmObj.shoulder,
    leftElbow: leftArmObj.elbow,
    rightArm: rightArmObj.shoulder,
    rightElbow: rightArmObj.elbow
  });
}


export function buildInstancedArenaCrowd(scene, configs) {
  const count = configs.length;
  const SENTINEL_SHIRT = 0x11aa22;
  const SENTINEL_PANTS = 0x2233cc;
  const SENTINEL_SKIN  = 0xcc7744;

  const templateSpec = buildSpectatorModel(SENTINEL_SHIRT, SENTINEL_PANTS, SENTINEL_SKIN, 0);
  templateSpec.root.updateMatrixWorld(true);

  const boneSlots = ['hips', 'torso', 'headGroup', 'leftArm', 'leftElbow', 'rightArm', 'rightElbow'];
  const slotSet = new Set(boneSlots.map((k) => templateSpec[k]).filter(Boolean));

  const instancedBatches = [];
  const instancedGroup = new THREE.Group();
  instancedGroup.name = 'instanced_arena_crowd';
  if (scene) scene.add(instancedGroup);

  const whiteMatCache = new Map();
  function getInstancedRoleMaterial(origMat, role) {
    if (role === 'fixed' || origMat.isShaderMaterial) return origMat;
    const key = origMat.uuid + '_' + role;
    if (whiteMatCache.has(key)) return whiteMatCache.get(key);
    const whiteMat = createCelMaterial(0xffffff, origMat.map || null, origMat.emissive ? origMat.emissive.getHex() : 0x000000);
    whiteMatCache.set(key, whiteMat);
    return whiteMat;
  }

  boneSlots.forEach((slotName) => {
    const boneObj = templateSpec[slotName];
    if (!boneObj) return;
    const boneInv = boneObj.matrixWorld.clone().invert();
    const roleBuckets = new Map();

    function collectBoneMeshes(node) {
      if (node !== boneObj && slotSet.has(node)) return;
      if (node.isMesh && node.geometry && node.geometry.attributes && node.geometry.attributes.position) {
        let role = 'fixed';
        if (node.material && node.material.color && !node.material.isShaderMaterial) {
          const hex = node.material.color.getHex();
          if (hex === SENTINEL_SHIRT) role = 'shirt';
          else if (hex === SENTINEL_PANTS) role = 'pants';
          else if (hex === SENTINEL_SKIN) role = 'skin';
        }
        const targetMat = getInstancedRoleMaterial(node.material, role);
        const key = `${role}_${targetMat.uuid}_${node.renderOrder || 0}`;
        let b = roleBuckets.get(key);
        if (!b) {
          b = { role, material: targetMat, renderOrder: node.renderOrder || 0, geoms: [] };
          roleBuckets.set(key, b);
        }
        let g = node.geometry.clone();
        if (g.index) g = g.toNonIndexed();
        const relMat = boneInv.clone().multiply(node.matrixWorld);
        g.applyMatrix4(relMat);
        if (!g.attributes.normal) g.computeVertexNormals();
        const vCount = g.attributes.position.count;
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vCount * 2), 2));
        b.geoms.push(g);
      }
      for (let i = 0; i < node.children.length; i++) {
        collectBoneMeshes(node.children[i]);
      }
    }
    collectBoneMeshes(boneObj);

    roleBuckets.forEach((b) => {
      let totalVerts = 0;
      for (let i = 0; i < b.geoms.length; i++) totalVerts += b.geoms[i].attributes.position.count;
      const posArr = new Float32Array(totalVerts * 3);
      const normArr = new Float32Array(totalVerts * 3);
      const uvArr = new Float32Array(totalVerts * 2);
      let vOff = 0;
      for (let i = 0; i < b.geoms.length; i++) {
        const g = b.geoms[i];
        const c = g.attributes.position.count;
        posArr.set(g.attributes.position.array.subarray(0, c * 3), vOff * 3);
        normArr.set(g.attributes.normal.array.subarray(0, c * 3), vOff * 3);
        uvArr.set(g.attributes.uv.array.subarray(0, c * 2), vOff * 2);
        vOff += c;
      }
      const mergedGeo = new THREE.BufferGeometry();
      mergedGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
      mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      mergedGeo.computeBoundingSphere();

      const instMesh = new THREE.InstancedMesh(mergedGeo, b.material, count);
      instMesh.castShadow = false;
      instMesh.receiveShadow = false;
      instMesh.renderOrder = b.renderOrder;
      instMesh.frustumCulled = false;

      if (b.role !== 'fixed') {
        const tmpColor = new THREE.Color();
        for (let idx = 0; idx < count; idx++) {
          const cfg = configs[idx];
          const hex = b.role === 'shirt'
            ? (cfg.shirt ?? cfg.topColor ?? 0xc26a2b)
            : (b.role === 'pants' ? (cfg.pants ?? cfg.pantsColor ?? 0x22242a) : (cfg.skin ?? cfg.skinColor ?? 0xd89c74));
          tmpColor.setHex(hex);
          instMesh.setColorAt(idx, tmpColor);
        }
        if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
      }

      instancedGroup.add(instMesh);
      instancedBatches.push({ slotName, instMesh });
    });
  });

  const spectators = configs.map((cfg, i) => {
    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.copy(templateSpec.hips.position);
    root.add(hips);

    const torso = new THREE.Group();
    torso.position.copy(templateSpec.torso.position);
    hips.add(torso);

    const headGroup = new THREE.Group();
    headGroup.position.copy(templateSpec.headGroup.position);
    torso.add(headGroup);

    const leftArm = new THREE.Group();
    leftArm.position.copy(templateSpec.leftArm.position);
    torso.add(leftArm);

    const leftElbow = new THREE.Group();
    leftElbow.position.copy(templateSpec.leftElbow.position);
    leftArm.add(leftElbow);

    const rightArm = new THREE.Group();
    rightArm.position.copy(templateSpec.rightArm.position);
    torso.add(rightArm);

    const rightElbow = new THREE.Group();
    rightElbow.position.copy(templateSpec.rightElbow.position);
    rightArm.add(rightElbow);

    root.scale.setScalar(cfg.scale ?? 0.86);
    if (cfg.position) {
      root.position.copy(cfg.position);
    } else if (cfg.x !== undefined) {
      root.position.set(cfg.x, cfg.y || 0, cfg.z || 0);
    }
    if (cfg.lookAt) {
      root.lookAt(cfg.lookAt);
    } else if (cfg.rotY !== undefined) {
      root.rotation.y = cfg.rotY;
    }
    root.updateMatrixWorld(true);

    return {
      spec: { root, hips, torso, headGroup, leftArm, leftElbow, rightArm, rightElbow },
      phaseOffset: cfg.phaseOffset ?? (i * 0.65),
      animMode: cfg.animMode ?? (i % 5)
    };
  });

  function updateMatrices() {
    for (let i = 0; i < count; i++) {
      spectators[i].spec.root.updateMatrixWorld(true);
    }
    for (let b = 0; b < instancedBatches.length; b++) {
      const { slotName, instMesh } = instancedBatches[b];
      for (let i = 0; i < count; i++) {
        const bone = spectators[i].spec[slotName];
        if (bone) {
          instMesh.setMatrixAt(i, bone.matrixWorld);
        }
      }
      instMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function update(elapsed, bpm = 92, jumpAmp = 0.14) {
    for (let i = 0; i < count; i++) {
      const { spec, phaseOffset, animMode = 0 } = spectators[i];
      const cheer = Math.abs(Math.sin(elapsed * (bpm / 60) * Math.PI + phaseOffset));
      const sway = Math.sin(elapsed * (bpm / 120) * Math.PI + phaseOffset);
      spec.hips.position.y = 1.04 + cheer * jumpAmp;

      switch (animMode) {
        case 0:
          spec.rightArm.rotation.set(-2.35 - cheer * 0.35, 0, 0.22);
          spec.rightElbow.rotation.set(-0.45 + cheer * 0.25, 0, 0);
          spec.leftArm.rotation.set(-0.45 - cheer * 0.15, 0, -0.20);
          spec.leftElbow.rotation.set(-0.85 - cheer * 0.15, 0, 0);
          spec.torso.rotation.set(0, 0, sway * 0.06);
          spec.headGroup.rotation.set(cheer * 0.10, 0, 0);
          break;
        case 1:
          spec.leftArm.rotation.set(-0.78, 0, 0.18 + cheer * 0.22);
          spec.rightArm.rotation.set(-0.78, 0, -0.18 - cheer * 0.22);
          spec.leftElbow.rotation.set(-1.10, 0, 0.26 + cheer * 0.18);
          spec.rightElbow.rotation.set(-1.10, 0, -0.26 - cheer * 0.18);
          spec.torso.rotation.set(0, 0, 0);
          spec.headGroup.rotation.set(cheer * 0.08, 0, 0);
          break;
        case 2:
          spec.torso.rotation.set(0, 0, sway * 0.12);
          spec.leftArm.rotation.set(-0.35 - cheer * 0.20, 0, -0.22 + sway * 0.08);
          spec.rightArm.rotation.set(-0.35 - (1 - cheer) * 0.20, 0, 0.22 + sway * 0.08);
          spec.leftElbow.rotation.set(-0.85 - cheer * 0.20, 0, 0);
          spec.rightElbow.rotation.set(-0.85 - (1 - cheer) * 0.20, 0, 0);
          spec.headGroup.rotation.set(0, 0, -sway * 0.08);
          break;
        case 3:
          spec.leftArm.rotation.set(-2.30 - cheer * 0.35, 0, -0.26);
          spec.rightArm.rotation.set(-2.30 - (1 - cheer) * 0.35, 0, 0.26);
          spec.leftElbow.rotation.set(-0.40 + cheer * 0.20, 0, 0);
          spec.rightElbow.rotation.set(-0.40 + (1 - cheer) * 0.20, 0, 0);
          spec.torso.rotation.set(0, 0, 0);
          spec.headGroup.rotation.set(-0.10 - cheer * 0.10, 0, 0);
          break;
        case 4:
        default:
          spec.torso.rotation.set(0.14 + cheer * 0.05, 0, 0);
          spec.headGroup.rotation.set(0.10 + cheer * 0.16, 0, 0);
          spec.leftArm.rotation.set(-0.65 - cheer * 0.15, 0, -0.18);
          spec.rightArm.rotation.set(-0.65 - cheer * 0.15, 0, 0.18);
          spec.leftElbow.rotation.set(-0.80 - cheer * 0.15, 0, 0);
          spec.rightElbow.rotation.set(-0.80 - cheer * 0.15, 0, 0);
          break;
      }
    }
    updateMatrices();
  }

  update(0, 92, 0.14);
  return { spectators, instancedGroup, instancedBatches, updateMatrices, update };
}

let _brassInteriorTex = null;
