import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ============================================================================
// 1. CURATED CASSETTE ARCHIVE — 2-ACROSS VERTICAL GRID OF 3D TAPES
// ============================================================================
const TAPES = [
  {
    id: '01',
    indexMeta: 'No. 01 — Claude Debussy, 1890',
    title: 'Clair de Lune',
    desc: 'An intimate nocturnal study for dark felt grand piano in D♭ major. Listen as the piano performs, or play directly across the keys.',
    unlocked: true,
    url: './clair-de-lune.html',
    ctaLabel: 'Enter Clair de Lune',
    shellColor: 0x1e2942,
    shellAttenuation: 0x0b101d,
    ribColor: 0x151d30,
    hubColor: 0xe8dfd1,
    artStyle: 'clair'
  },
  {
    id: '02',
    indexMeta: 'No. 02 — G. F. Handel, HWV 432/6',
    title: 'Passacaglia in G Minor',
    desc: 'A visual story of a life told through intricate 3D Fourier line sculptures that flow across eight movements of Handel’s Passacaglia.',
    unlocked: true,
    url: './passacaglia.html',
    ctaLabel: 'Enter Passacaglia',
    shellColor: 0x241d34,
    shellAttenuation: 0x0c0816,
    ribColor: 0x1a1426,
    hubColor: 0xf4e8d1,
    artStyle: 'passacaglia'
  },
  {
    id: '03',
    indexMeta: 'No. 03 — Interactive Audio Cruiser',
    title: 'Night Drive',
    desc: 'Endless midnight highway cruiser with procedural synthwave and Gemini Lyria 3.5 soundtrack generation.',
    unlocked: true,
    url: './index.html',
    ctaLabel: 'Enter Night Drive',
    shellColor: 0x9e1b3e,
    shellAttenuation: 0x59091e,
    ribColor: 0x7d1230,
    hubColor: 0xf4f1ea,
    artStyle: 'drive'
  },
  {
    id: '04',
    indexMeta: 'No. 04 — The City in 3D, Day & Night',
    title: 'Mountain View 3D',
    desc: 'Mountain View, CA as a 3D map you can orbit, by day and by night: every street, park and creek, 8,000 buildings, trees along the blocks, Moffett Field, the Googleplex and the Shoreline tent, with the windows and street lights coming on after dark. Press Ride for a first-person bike commute up the Stevens Creek Trail to Gradient Canopy.',
    unlocked: true,
    url: './mountain-view.html',
    ctaLabel: 'Open the Map',
    shellColor: 0x142624,
    shellAttenuation: 0x071211,
    ribColor: 0x0e1c1a,
    hubColor: 0xefe9dc,
    artStyle: 'mountainview'
  },
  {
    id: '05',
    indexMeta: 'No. 05 — Rhythm Arena Brawler, Lyria 3.5 Score',
    title: 'DJ Kronos',
    desc: 'A cel-shaded 3D rhythm brawler. Punch, kick and weave on the beat of a 92 BPM Lyria 3.5 boss track, clear three waves of the Hype Crew, then face DJ Kronos in the cypher.',
    unlocked: true,
    url: './kronos.html',
    ctaLabel: 'Enter the Cypher',
    shellColor: 0x1a1210,
    shellAttenuation: 0x090504,
    ribColor: 0x120c0a,
    hubColor: 0xffe042,
    artStyle: 'kronos'
  }
];

// ============================================================================
// 2. PER-STAGE BOUND THREE.JS SCENE & RENDERER FACTORY
// ============================================================================
const isMobile = window.innerWidth < 900 || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

function createShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(256, 128, 10, 256, 128, 220);
  grad.addColorStop(0, 'rgba(15, 14, 12, 0.24)');
  grad.addColorStop(0.5, 'rgba(15, 14, 12, 0.08)');
  grad.addColorStop(1, 'rgba(15, 14, 12, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  return new THREE.CanvasTexture(c);
}

const shadowGeo = new THREE.PlaneGeometry(5.0, 1.38);
shadowGeo.rotateX(-Math.PI / 2);
const sharedShadowTex = createShadowTexture();

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
  // 1. Deep nocturnal midnight-indigo & warm obsidian cosmos backdrop
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#050812');
  bg.addColorStop(0.5, '#0c1326');
  bg.addColorStop(1, '#120c1c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  // Dual harmonic auras: ice-cyan & warm champagne gold around the waltzing couple stage
  const cyanAura = ctx.createRadialGradient(892, 210, 6, 892, 210, 185);
  cyanAura.addColorStop(0, 'rgba(102, 212, 255, 0.34)');
  cyanAura.addColorStop(0.45, 'rgba(102, 212, 255, 0.12)');
  cyanAura.addColorStop(1, 'rgba(5, 8, 18, 0)');
  ctx.fillStyle = cyanAura;
  ctx.fillRect(0, 0, 1024, 480);

  const goldAura = ctx.createRadialGradient(855, 145, 8, 855, 145, 170);
  goldAura.addColorStop(0, 'rgba(242, 198, 120, 0.26)');
  goldAura.addColorStop(0.5, 'rgba(212, 165, 90, 0.08)');
  goldAura.addColorStop(1, 'rgba(5, 8, 18, 0)');
  ctx.fillStyle = goldAura;
  ctx.fillRect(0, 0, 1024, 480);

  // Subtle starlight harmonic dust across the top sky
  const starCoords = [
    [540, 52, 1.4], [585, 84, 1.1], [630, 46, 1.6], [678, 72, 1.2],
    [725, 58, 1.8], [768, 92, 1.3], [818, 48, 1.5], [948, 64, 1.4],
    [965, 118, 1.2], [835, 355, 1.3], [962, 342, 1.5], [148, 192, 1.3]
  ];
  starCoords.forEach(([sx, sy, sr], idx) => {
    ctx.fillStyle = idx % 2 === 0 ? 'rgba(130, 224, 255, 0.7)' : 'rgba(245, 212, 148, 0.7)';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. Optimal-Transport Geodesic Ribbons sweeping across the upper sky (x=510..875, y=55..148)
  ctx.save();
  for (let r = 0; r < 4; r++) {
    ctx.strokeStyle = r % 2 === 0
      ? `rgba(115, 216, 255, ${0.28 + r * 0.08})`
      : `rgba(240, 196, 120, ${0.26 + r * 0.08})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = 515; x <= 870; x += 6) {
      const t = (x - 515) / 355;
      const y = 118 - Math.sin(t * Math.PI) * (36 - r * 7) + Math.sin(t * 9 + r * 1.4) * 5;
      if (x === 515) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // 3. Fourier Epicycle Orbits behind the Waltzing Couple (Right Stage x=892, y=218)
  ctx.save();
  const cx = 892;
  const cy = 218;
  const rings = [
    { x: cx, y: cy, r: 78, color: 'rgba(235, 195, 120, 0.25)' },
    { x: cx + 22, y: cy - 28, r: 46, color: 'rgba(115, 216, 255, 0.30)' },
    { x: cx + 8, y: cy - 48, r: 22, color: 'rgba(245, 218, 165, 0.38)' }
  ];
  rings.forEach((ring) => {
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();

  // 4. Iconic 3D Calligraphic Line Sculpture: The Waltzing Couple (Scene I & VII)
  // Helper to stroke a calligraphic curve with cyan outer luminescence & warm ivory-cyan core
  function strokeCalligraphicPath(points, close = false, isGoldAccent = false) {
    if (points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer glow pass
    ctx.strokeStyle = isGoldAccent ? 'rgba(242, 196, 115, 0.55)' : 'rgba(102, 212, 255, 0.62)';
    ctx.shadowColor = isGoldAccent ? '#f2c473' : '#66d4ff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const mx = (prev[0] + curr[0]) * 0.5;
      const my = (prev[1] + curr[1]) * 0.5;
      ctx.quadraticCurveTo(prev[0], prev[1], mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1]);
    if (close) ctx.closePath();
    ctx.stroke();

    // Crisp luminous core pass
    ctx.shadowBlur = 4;
    ctx.strokeStyle = isGoldAccent ? '#fff3d6' : '#e8f9ff';
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.restore();
  }

  // Gentleman silhouette & waltz posture (left partner of the waltz)
  strokeCalligraphicPath([
    [872, 114], [863, 122], [864, 136], [873, 144], [879, 138], [876, 124]
  ], true);
  // Gentleman shoulders, tailored coat & torso
  strokeCalligraphicPath([
    [866, 148], [852, 168], [848, 206], [854, 248], [851, 296], [847, 344]
  ]);
  strokeCalligraphicPath([
    [874, 152], [877, 195], [874, 245], [876, 298], [880, 346]
  ]);
  // Gentleman leading arm raised to clasp her hand
  strokeCalligraphicPath([
    [868, 156], [884, 174], [898, 166], [906, 152]
  ], false, true);
  // Gentleman embrace arm around her waist
  strokeCalligraphicPath([
    [862, 170], [885, 192], [912, 196]
  ]);

  // Lady head in profile & flowing hair ribbon (right partner of the waltz)
  strokeCalligraphicPath([
    [920, 122], [912, 130], [914, 143], [924, 148], [931, 138], [928, 125]
  ], true);
  strokeCalligraphicPath([
    [928, 126], [942, 134], [952, 150], [948, 168]
  ], false, true);
  // Lady raised arm meeting his hand at (906, 152)
  strokeCalligraphicPath([
    [906, 152], [914, 164], [922, 156]
  ], false, true);
  // Lady bodice & arched waltz back
  strokeCalligraphicPath([
    [916, 154], [908, 182], [906, 206]
  ]);
  strokeCalligraphicPath([
    [928, 156], [930, 184], [926, 208]
  ]);

  // Swirling 3D Fourier Waltz Gown — cascading calligraphic contour ribbons
  const dressRibbons = [
    [[906, 206], [894, 242], [882, 286], [868, 336], [892, 348]],
    [[911, 207], [904, 246], [898, 294], [894, 346], [918, 354]],
    [[916, 208], [918, 248], [922, 298], [926, 350], [948, 346]],
    [[922, 208], [934, 246], [948, 292], [964, 338], [942, 348]],
    [[926, 208], [946, 240], [966, 280], [978, 322]]
  ];
  dressRibbons.forEach((ribbon, idx) => {
    strokeCalligraphicPath(ribbon, false, idx % 2 === 1);
  });

  // Swirling hemline harmonic wave connecting the gown folds in 3D space
  strokeCalligraphicPath([
    [866, 336], [884, 350], [906, 342], [928, 354], [952, 344], [976, 324]
  ], false, true);

  // 5. Lower Frieze: The 8 Scenes of a Life Harmonic Timeline (y=396..464)
  ctx.fillStyle = '#04060d';
  ctx.fillRect(16, 396, 992, 68);

  ctx.strokeStyle = '#d8b474';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  // Dual interweaving Fourier waves (cyan & gold) across the center of the frieze
  ctx.save();
  ctx.strokeStyle = 'rgba(102, 212, 255, 0.72)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let x = 235; x <= 775; x += 3) {
    const u = ((x - 235) / 540) * Math.PI * 4;
    const y = 426 + Math.sin(u) * 10 + Math.cos(u * 2.5) * 4;
    if (x === 235) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(232, 190, 116, 0.78)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let x = 235; x <= 775; x += 3) {
    const u = ((x - 235) / 540) * Math.PI * 4;
    const y = 426 - Math.sin(u) * 9 + Math.sin(u * 3.0) * 3.5;
    if (x === 235) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 8 Glowing Life-Variation Nodes (I through VIII)
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  numerals.forEach((num, idx) => {
    const nx = 255 + idx * (500 / 7);
    ctx.fillStyle = idx % 2 === 0 ? '#73d8ff' : '#f0c678';
    ctx.beginPath();
    ctx.arc(nx, 422, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(245, 240, 230, 0.72)';
    ctx.fillText(num, nx, 452);
  });
  ctx.restore();

  // 6. Editorial Typography & Archival Metadata
  ctx.fillStyle = '#e0bc7c';
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText('G. F. HANDEL  ·  HWV 432/6  ·  A LIFE IN 8 SCENES', 56, 62);

  ctx.save();
  ctx.fillStyle = '#f7f3eb';
  ctx.shadowColor = 'rgba(102, 212, 255, 0.28)';
  ctx.shadowBlur = 10;
  ctx.font = 'italic 600 68px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Passacaglia', 54, 132);
  ctx.restore();

  ctx.fillStyle = '#73d8ff';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('8 MOVEMENTS', 56, 242);
  ctx.fillStyle = 'rgba(247, 243, 235, 0.72)';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('G MINOR', 56, 268);
  ctx.fillText('3D FOURIER', 56, 292);
  ctx.fillText('LINE STORY', 56, 316);

  ctx.fillStyle = '#e0bc7c';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('NO. 02', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('∑ cₙ e^(inωt) · 8 VAR.', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(224, 188, 124, 0.68)';
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

function drawMountainViewArtwork(ctx) {
  // 1. Deep obsidian-slate & SF Bay emerald-teal cartographic backdrop
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#070c10');
  bg.addColorStop(0.55, '#0b1919');
  bg.addColorStop(1, '#102422');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  // Subtle GIS topographic grid & SF Bay wetland stipple on right half
  ctx.save();
  ctx.strokeStyle = 'rgba(72, 219, 178, 0.08)';
  ctx.lineWidth = 1;
  for (let gx = 480; gx < 1000; gx += 32) {
    ctx.beginPath();
    ctx.moveTo(gx, 28);
    ctx.lineTo(gx, 392);
    ctx.stroke();
  }
  for (let gy = 40; gy < 390; gy += 32) {
    ctx.beginPath();
    ctx.moveTo(480, gy);
    ctx.lineTo(1000, gy);
    ctx.stroke();
  }

  // SF Bay Wetlands radial glow in upper-right
  const bayGlow = ctx.createRadialGradient(855, 115, 10, 855, 115, 175);
  bayGlow.addColorStop(0, 'rgba(64, 214, 172, 0.28)');
  bayGlow.addColorStop(0.55, 'rgba(0, 210, 255, 0.10)');
  bayGlow.addColorStop(1, 'rgba(7, 12, 16, 0)');
  ctx.fillStyle = bayGlow;
  ctx.fillRect(0, 0, 1024, 480);

  // Shoreline Amphitheatre iconic white tensile twin peaks (right stage x=845, y=135)
  ctx.fillStyle = 'rgba(244, 241, 232, 0.92)';
  ctx.beginPath();
  ctx.moveTo(785, 156);
  ctx.quadraticCurveTo(812, 138, 826, 92);
  ctx.quadraticCurveTo(844, 132, 864, 96);
  ctx.quadraticCurveTo(878, 138, 906, 156);
  ctx.quadraticCurveTo(845, 168, 785, 156);
  ctx.closePath();
  ctx.fill();

  // Google Bay View Dragon-Scale Canopy diamond lattice (x=830..955, y=185..250)
  ctx.strokeStyle = 'rgba(238, 194, 118, 0.78)';
  ctx.lineWidth = 1.5;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const dx = 838 + c * 22 + (r % 2) * 11;
      const dy = 195 + r * 14;
      ctx.beginPath();
      ctx.moveTo(dx, dy - 7);
      ctx.lineTo(dx + 10, dy);
      ctx.lineTo(dx, dy + 7);
      ctx.lineTo(dx - 10, dy);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // US-101 & Caltrain Cyan Telemetry Corridors + Castro St Amber Spine
  ctx.strokeStyle = '#38e8ff';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(760, 255);
  ctx.lineTo(975, 315);
  ctx.moveTo(775, 282);
  ctx.lineTo(975, 342);
  ctx.stroke();

  ctx.strokeStyle = '#f3b659';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(815, 365);
  ctx.lineTo(895, 245);
  ctx.stroke();
  ctx.restore();

  // Lower Telemetry Frieze
  ctx.fillStyle = '#05090c';
  ctx.fillRect(16, 396, 992, 68);

  ctx.strokeStyle = '#d8b474';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  // Live telemetry bar ticks along bottom frieze
  for (let i = 0; i < 28; i++) {
    const bx = 280 + i * 16;
    const bh = 8 + Math.round(Math.abs(Math.sin(i * 0.65)) * 22);
    ctx.fillStyle = i % 3 === 0 ? '#42e6b5' : (i % 2 === 0 ? '#38e8ff' : '#e0bc7c');
    ctx.fillRect(bx, 442 - bh, 8, bh);
  }

  // Editorial Typography & GIS Metadata
  ctx.fillStyle = '#42e6b5';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('37.3861° N, 122.0839° W  ·  THE CITY IN 3D', 56, 62);

  ctx.fillStyle = '#f5f2ea';
  ctx.font = 'italic 600 64px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Mountain View', 54, 130);

  ctx.fillStyle = '#e0bc7c';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('3D MAP', 56, 242);
  ctx.fillStyle = 'rgba(245, 242, 234, 0.74)';
  ctx.font = '400 14px "JetBrains Mono", monospace';
  ctx.fillText('DAY & NIGHT', 56, 268);
  ctx.fillText('STREETS · PARKS · TREES', 56, 292);
  ctx.fillText('MOFFETT · GOOGLEPLEX', 56, 316);

  ctx.fillStyle = '#e0bc7c';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('NO. 04', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('OPENSTREETMAP · DAY & NIGHT', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(216, 180, 116, 0.62)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function drawKronosArtwork(ctx) {
  // 1. Ink-black backdrop with a warm stage-light wash from the upper right
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#0a0608');
  bg.addColorStop(0.6, '#140b0c');
  bg.addColorStop(1, '#1d0f0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  const stageGlow = ctx.createRadialGradient(850, 120, 10, 850, 120, 240);
  stageGlow.addColorStop(0, 'rgba(255, 123, 25, 0.34)');
  stageGlow.addColorStop(0.5, 'rgba(224, 36, 36, 0.12)');
  stageGlow.addColorStop(1, 'rgba(10, 6, 8, 0)');
  ctx.fillStyle = stageGlow;
  ctx.fillRect(0, 0, 1024, 480);

  // 2. Ben-Day halftone screen on the right half (comic-book print texture)
  ctx.save();
  ctx.fillStyle = 'rgba(255, 224, 66, 0.10)';
  for (let gy = 36; gy < 392; gy += 14) {
    for (let gx = 500; gx < 1000; gx += 14) {
      const r = 1.2 + ((gx + gy) % 42) / 42 * 2.4;
      ctx.beginPath();
      ctx.arc(gx + ((gy / 14) % 2) * 7, gy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 3. Boombox silhouette: chassis, twin speaker cones, cassette deck and handle
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#120a0c';
  ctx.strokeStyle = '#ffe042';
  ctx.lineWidth = 4;
  roundedRectPath(ctx, 776, 112, 206, 118, 14);
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(812, 112);
  ctx.quadraticCurveTo(879, 72, 946, 112);
  ctx.stroke();

  [818, 940].forEach((cx) => {
    ctx.fillStyle = '#e02424';
    ctx.beginPath();
    ctx.arc(cx, 171, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffe042';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#0a0608';
    ctx.beginPath();
    ctx.arc(cx, 171, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff7b19';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, 171, 25, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.fillStyle = '#24e5ff';
  roundedRectPath(ctx, 858, 150, 42, 30, 5);
  ctx.fill();
  ctx.fillStyle = '#0a0608';
  ctx.beginPath();
  ctx.arc(869, 165, 5, 0, Math.PI * 2);
  ctx.arc(889, 165, 5, 0, Math.PI * 2);
  ctx.fill();

  // LED equaliser bars across the deck face
  for (let i = 0; i < 9; i++) {
    const bx = 858 + i * 5;
    const bh = 4 + Math.round(Math.abs(Math.sin(i * 1.3)) * 10);
    ctx.fillStyle = i % 3 === 0 ? '#ffe042' : (i % 2 === 0 ? '#ff7b19' : '#24e5ff');
    ctx.fillRect(bx, 206 - bh, 3, bh);
  }
  ctx.restore();

  // 4. Comic impact burst with the title call-out
  ctx.save();
  ctx.translate(870, 300);
  ctx.rotate(-0.12);
  ctx.fillStyle = '#ffe042';
  ctx.strokeStyle = '#0a0608';
  ctx.lineWidth = 4;
  ctx.beginPath();
  const spikes = 14;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? 74 : 46;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const px = Math.cos(a) * rad * 1.35;
    const py = Math.sin(a) * rad * 0.78;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e02424';
  ctx.font = '900 30px "Bangers", "Impact", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KRA-KOOM!', 0, 11);
  ctx.restore();

  // 5. Lower frieze: beat grid at 92 BPM
  ctx.fillStyle = '#05030a';
  ctx.fillRect(16, 396, 992, 68);
  ctx.strokeStyle = '#ffe042';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  for (let i = 0; i < 28; i++) {
    const bx = 280 + i * 16;
    const onBeat = i % 4 === 0;
    const bh = onBeat ? 30 : 8 + Math.round(Math.abs(Math.sin(i * 0.9)) * 14);
    ctx.fillStyle = onBeat ? '#ffe042' : (i % 2 === 0 ? '#e02424' : '#ff7b19');
    ctx.fillRect(bx, 442 - bh, 8, bh);
  }

  // 6. Editorial typography (left column, clear of the tape window)
  ctx.fillStyle = '#24e5ff';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('92 BPM  ·  3D CEL-SHADED RHYTHM BRAWLER', 56, 62);

  ctx.fillStyle = '#fff6d6';
  ctx.font = 'italic 600 64px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('DJ Kronos', 54, 130);

  ctx.fillStyle = '#ffe042';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('BOOMBOX BATTLE', 56, 242);
  ctx.fillStyle = 'rgba(255, 246, 214, 0.74)';
  ctx.font = '400 14px "JetBrains Mono", monospace';
  ctx.fillText('A · DODGE', 56, 268);
  ctx.fillText('S · PUNCH', 56, 292);
  ctx.fillText('D · KICK', 56, 316);

  ctx.fillStyle = '#ffe042';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('NO. 05', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('LYRIA 3.5 · BOSS TRACK', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255, 224, 66, 0.55)';
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
  } else if (tape.artStyle === 'kronos') {
    drawKronosArtwork(ctx);
  } else {
    drawMountainViewArtwork(ctx);
  }
  ctx.restore();

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
  ctx.strokeStyle = '#c8ad78';
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
// 4. SHARED CASSETTE GEOMETRIES & PER-TAPE 3D CASSETTE BUILDER
// ============================================================================
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

const rimFrameGeo = createHollowFrameGeometry(SHELL_W, SHELL_H, 0.36, 0.18, WALL_T);
const plateGeo = createRoundedPlateGeometry(SHELL_W, SHELL_H, 0.028, 0.18);

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

const ribGeo = new THREE.BoxGeometry(0.032, 0.44, 0.32);
const padShieldGeo = new THREE.BoxGeometry(0.36, 0.20, 0.22);

const metalMat = new THREE.MeshStandardMaterial({
  color: 0xd8d4ca,
  metalness: 0.88,
  roughness: 0.22
});

const tapeOxideMat = new THREE.MeshStandardMaterial({
  color: 0x141218,
  roughness: 0.36,
  metalness: 0.22
});

const rollerMat = new THREE.MeshStandardMaterial({
  color: 0x181520,
  roughness: 0.3,
  metalness: 0.5
});

const reelPositionsX = [-0.88, 0.88];
const reelRadii = [0.66, 0.49];
const pancakeGeos = reelRadii.map((packRadius) => {
  const innerHubR = 0.29;
  const pancakeShape = new THREE.Shape();
  pancakeShape.absarc(0, 0, packRadius, 0, Math.PI * 2, false);
  const pancakeHole = new THREE.Path();
  pancakeHole.absarc(0, 0, innerHubR, 0, Math.PI * 2, true);
  pancakeShape.holes.push(pancakeHole);
  const geo = new THREE.ExtrudeGeometry(pancakeShape, {
    depth: 0.20,
    bevelEnabled: false,
    curveSegments: 40
  });
  geo.center();
  return geo;
});

const collarShape = new THREE.Shape();
collarShape.absarc(0, 0, 0.285, 0, Math.PI * 2, false);
const collarHole = new THREE.Path();
collarHole.absarc(0, 0, 0.20, 0, Math.PI * 2, true);
collarShape.holes.push(collarHole);
const collarGeo = new THREE.ExtrudeGeometry(collarShape, {
  depth: 0.24,
  bevelEnabled: false,
  curveSegments: 28
});
collarGeo.center();

const toothGeo = new THREE.BoxGeometry(0.044, 0.075, 0.18);
const rollerGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.18, 20);
rollerGeo.rotateX(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(0.24, 0.026, 0.21);
const pinGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.25, 14);
pinGeo.rotateX(Math.PI / 2);

const bossGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.34, 18);
bossGeo.rotateX(Math.PI / 2);
const screwCapGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14);
screwCapGeo.rotateX(Math.PI / 2);
const stickerGeo = new THREE.PlaneGeometry(3.68, 1.72);

const tapePathPoints = [
  new THREE.Vector3(-1.48, 0.22, 0),
  new THREE.Vector3(-1.76, -0.88, 0),
  new THREE.Vector3(-1.32, -1.14, 0),
  new THREE.Vector3(1.32, -1.14, 0),
  new THREE.Vector3(1.76, -0.88, 0),
  new THREE.Vector3(1.34, 0.22, 0)
];

function buildCassetteInstance(tape, stageEl) {
  const itemScene = new THREE.Scene();
  const itemCamera = new THREE.PerspectiveCamera(32, 1.5, 0.5, 50);
  itemCamera.position.set(0, 0.08, 8.2);

  const itemRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  const initW = Math.max(1, stageEl.clientWidth || 520);
  const initH = Math.max(1, stageEl.clientHeight || 320);
  itemRenderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  itemRenderer.setSize(initW, initH, false);
  itemRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  itemRenderer.toneMappingExposure = 1.12;
  stageEl.appendChild(itemRenderer.domElement);

  const pmremGenerator = new THREE.PMREMGenerator(itemRenderer);
  const roomEnv = new RoomEnvironment();
  itemScene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();
  pmremGenerator.dispose();

  itemScene.add(new THREE.AmbientLight(0xffffff, 1.25));

  const keyLight = new THREE.DirectionalLight(0xfffcf5, 2.5);
  keyLight.position.set(5, 8, 7);
  itemScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xeef2ff, 1.35);
  fillLight.position.set(-6, 3, 5);
  itemScene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 1.9);
  rimLight.position.set(0, 5, -7);
  itemScene.add(rimLight);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: sharedShadowTex,
    transparent: true,
    depthWrite: false
  });
  const floorShadow = new THREE.Mesh(shadowGeo, shadowMat);
  floorShadow.position.set(0, -1.66, 0);
  itemScene.add(floorShadow);

  const root = new THREE.Group();
  itemScene.add(root);

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: tape.shellColor,
    attenuationColor: new THREE.Color(tape.shellAttenuation),
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

  const ribMat = new THREE.MeshPhysicalMaterial({
    color: tape.ribColor,
    transparent: true,
    opacity: 0.68,
    transmission: 0.55,
    ior: 1.48,
    roughness: 0.15,
    metalness: 0.08,
    clearcoat: 1.0
  });

  const hubMat = new THREE.MeshStandardMaterial({
    color: tape.hubColor,
    roughness: 0.24,
    metalness: 0.15
  });

  root.add(new THREE.Mesh(rimFrameGeo, ribMat));

  const frontPlate = new THREE.Mesh(plateGeo, shellMat);
  frontPlate.position.z = 0.200;
  root.add(frontPlate);

  const backPlate = new THREE.Mesh(plateGeo, shellMat);
  backPlate.position.z = -0.200;
  root.add(backPlate);

  const trapFront = new THREE.Mesh(trapPlateGeo, ribMat);
  trapFront.position.set(0, -0.96, 0.228);
  root.add(trapFront);

  const trapBack = new THREE.Mesh(trapPlateGeo, ribMat);
  trapBack.position.set(0, -0.96, -0.228);
  root.add(trapBack);

  [-0.65, -0.22, 0.22, 0.65].forEach((rx) => {
    const rib = new THREE.Mesh(ribGeo, ribMat);
    rib.position.set(rx, -0.96, 0);
    root.add(rib);
  });

  const padShield = new THREE.Mesh(padShieldGeo, metalMat);
  padShield.position.set(0, -1.06, 0);
  root.add(padShield);

  const reels = [];
  reelPositionsX.forEach((rx, idx) => {
    const reelGroup = new THREE.Group();
    reelGroup.position.set(rx, 0.22, 0);
    reelGroup.add(new THREE.Mesh(pancakeGeos[idx], tapeOxideMat));
    reelGroup.add(new THREE.Mesh(collarGeo, hubMat));

    for (let t = 0; t < 6; t++) {
      const angle = (t / 6) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, hubMat);
      tooth.position.set(Math.cos(angle) * 0.172, Math.sin(angle) * 0.172, 0);
      tooth.rotation.z = angle + Math.PI / 2;
      reelGroup.add(tooth);
    }
    root.add(reelGroup);
    reels.push(reelGroup);
  });

  const guideRollers = [];
  [-1.62, 1.62].forEach((gx) => {
    const rGroup = new THREE.Group();
    rGroup.position.set(gx, -0.88, 0);
    rGroup.add(new THREE.Mesh(rollerGeo, rollerMat));
    rGroup.add(new THREE.Mesh(spokeGeo, metalMat));
    rGroup.add(new THREE.Mesh(pinGeo, metalMat));
    root.add(rGroup);
    guideRollers.push(rGroup);
  });

  for (let i = 0; i < tapePathPoints.length - 1; i++) {
    const start = tapePathPoints[i];
    const end = tapePathPoints[i + 1];
    const len = start.distanceTo(end);
    const segGeo = new THREE.BoxGeometry(len, 0.016, 0.16);
    const segMesh = new THREE.Mesh(segGeo, tapeOxideMat);
    segMesh.position.copy(start).lerp(end, 0.5);
    segMesh.rotation.z = Math.atan2(end.y - start.y, end.x - start.x);
    root.add(segMesh);
  }

  [
    [-1.88, 1.12],
    [1.88, 1.12],
    [-1.88, -1.12],
    [1.88, -1.12]
  ].forEach(([sx, sy]) => {
    const boss = new THREE.Mesh(bossGeo, ribMat);
    boss.position.set(sx, sy, 0);
    root.add(boss);

    const screwFront = new THREE.Mesh(screwCapGeo, metalMat);
    screwFront.position.set(sx, sy, 0.222);
    root.add(screwFront);

    const screwBack = new THREE.Mesh(screwCapGeo, metalMat);
    screwBack.position.set(sx, sy, -0.222);
    root.add(screwBack);
  });

  const stickerMat = new THREE.MeshStandardMaterial({
    map: createCassetteStickerTexture(tape),
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
  root.add(stickerFrontMesh);

  const stickerBackMesh = new THREE.Mesh(stickerGeo, stickerMat);
  stickerBackMesh.position.set(0, 0.30, -0.224);
  stickerBackMesh.rotation.y = Math.PI;
  root.add(stickerBackMesh);

  return { root, reels, guideRollers, itemScene, itemCamera, itemRenderer, floorShadow };
}

// ============================================================================
// 5. BUILD 2-ACROSS VERTICAL GRID CARDS & INTERACTION HANDLERS
// ============================================================================
const tapeGridEl = document.getElementById('tape-grid');
const btnRewind = document.getElementById('btn-rewind');
const btnReelPlay = document.getElementById('btn-reel-play');
const reelPlayLabel = document.getElementById('reel-play-label');
const btnOrbit = document.getElementById('btn-orbit');
const btnBackdrop = document.getElementById('btn-backdrop');

let isPlayingAnim = true;
let isRewinding = false;
let isAutoOrbit = true;

const tapeItems = TAPES.map((tape, idx) => {
  const cardEl = document.createElement('article');
  cardEl.className = `tape-card ${tape.unlocked ? 'unlocked' : 'locked'}`;
  cardEl.dataset.url = tape.url || '';
  cardEl.setAttribute('role', tape.unlocked ? 'link' : 'region');
  if (tape.unlocked) {
    cardEl.tabIndex = 0;
  }

  cardEl.innerHTML = `
    <div class="tape-stage" id="tape-stage-${idx}"></div>
    <div class="tape-caption">
      <div class="work-index">${tape.indexMeta}</div>
      <h2 class="work-title">${tape.title}</h2>
      <p class="work-desc">${tape.desc}</p>
      <button class="open-work-btn" type="button" ${tape.unlocked ? '' : 'disabled'}>
        <span>${tape.ctaLabel}</span>
        ${tape.unlocked ? '<span>→</span>' : ''}
      </button>
    </div>
  `;

  tapeGridEl.appendChild(cardEl);
  const stageEl = cardEl.querySelector('.tape-stage');
  const model = buildCassetteInstance(tape, stageEl);

  const item = {
    tape,
    idx,
    cardEl,
    stageEl,
    model,
    hovered: false,
    isDragging: false,
    dragDistance: 0,
    prevX: 0,
    prevY: 0,
    rotY: (idx % 2 === 0 ? -0.22 : 0.22),
    rotX: 0.08,
    hoverOffsetX: 0,
    hoverOffsetY: 0
  };

  const ro = new ResizeObserver(() => {
    const w = Math.max(1, stageEl.clientWidth);
    const h = Math.max(1, stageEl.clientHeight);
    model.itemRenderer.setSize(w, h, false);
  });
  ro.observe(stageEl);

  function navigateToWork() {
    if (!tape.unlocked || !tape.url) return;
    window.location.href = tape.url;
  }

  cardEl.addEventListener('pointerenter', () => {
    item.hovered = true;
  });

  cardEl.addEventListener('pointerleave', () => {
    item.hovered = false;
    item.isDragging = false;
    item.hoverOffsetX = 0;
    item.hoverOffsetY = 0;
  });

  cardEl.addEventListener('pointermove', (e) => {
    const rect = cardEl.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    item.hoverOffsetX = nx * 0.16;
    item.hoverOffsetY = ny * 0.10;

    if (item.isDragging) {
      const dx = e.clientX - item.prevX;
      const dy = e.clientY - item.prevY;
      item.dragDistance += Math.hypot(dx, dy);
      item.rotY += dx * 0.010;
      item.rotX = THREE.MathUtils.clamp(item.rotX + dy * 0.008, -0.65, 0.65);
      item.prevX = e.clientX;
      item.prevY = e.clientY;
    }
  });

  stageEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    item.isDragging = true;
    item.dragDistance = 0;
    item.prevX = e.clientX;
    item.prevY = e.clientY;
  });

  window.addEventListener('pointerup', () => {
    item.isDragging = false;
  });

  cardEl.addEventListener('click', () => {
    if (item.dragDistance > 10) {
      item.dragDistance = 0;
      return;
    }
    navigateToWork();
  });

  cardEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToWork();
    }
  });

  return item;
});

if (btnRewind) {
  btnRewind.addEventListener('click', () => {
    isRewinding = !isRewinding;
    if (isRewinding) isPlayingAnim = true;
    btnRewind.classList.toggle('active', isRewinding);
    btnReelPlay.classList.toggle('active', isPlayingAnim);
    reelPlayLabel.textContent = isRewinding ? 'Rewinding' : (isPlayingAnim ? 'Playing' : 'Paused');
  });
}

if (btnReelPlay) {
  btnReelPlay.addEventListener('click', () => {
    isPlayingAnim = !isPlayingAnim;
    if (!isPlayingAnim) isRewinding = false;
    if (btnRewind) btnRewind.classList.remove('active');
    btnReelPlay.classList.toggle('active', isPlayingAnim);
    reelPlayLabel.textContent = isPlayingAnim ? 'Playing' : 'Paused';
  });
}

if (btnOrbit) {
  btnOrbit.addEventListener('click', () => {
    isAutoOrbit = !isAutoOrbit;
    btnOrbit.classList.toggle('active', isAutoOrbit);
  });
}

if (btnBackdrop) {
  btnBackdrop.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('theme-dark');
    document.documentElement.classList.toggle('theme-dark', isDark);
    btnBackdrop.textContent = isDark ? 'Light room' : 'Dark room';
  });
}

// ============================================================================
// 6. PER-STAGE ANIMATION LOOP (EACH CASSETTE BOUND TO ITS OWN STAGE CANVAS)
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  tapeItems.forEach((item, idx) => {
    const width = Math.max(1, item.stageEl.clientWidth);
    const height = Math.max(1, item.stageEl.clientHeight);

    if (isPlayingAnim) {
      const speedBoost = item.hovered ? 1.65 : 1.0;
      const reelVel = (isRewinding ? 15.0 : -2.4) * speedBoost;
      item.model.reels.forEach((r, rIdx) => {
        const radiusFactor = rIdx === 0 ? 0.85 : 1.15;
        r.rotation.z += reelVel * radiusFactor * dt;
      });
      item.model.guideRollers.forEach((gr) => {
        gr.rotation.z += reelVel * 2.4 * dt;
      });
    }

    if (isAutoOrbit && !item.isDragging) {
      item.rotY += dt * 0.36;
      item.rotX = THREE.MathUtils.lerp(item.rotX, 0.08 + Math.sin(elapsed * 0.8 + idx) * 0.04, dt * 3);
    }

    const targetY = item.rotY + item.hoverOffsetX;
    const targetX = item.rotX + item.hoverOffsetY;
    item.model.root.rotation.y = THREE.MathUtils.lerp(item.model.root.rotation.y, targetY, dt * 8);
    item.model.root.rotation.x = THREE.MathUtils.lerp(item.model.root.rotation.x, targetX, dt * 8);

    const floatBob = Math.sin(elapsed * 1.7 + idx * 0.9) * 0.05;
    const hoverLift = item.hovered ? 0.08 : 0.0;
    item.model.root.position.y = THREE.MathUtils.lerp(item.model.root.position.y, 0.06 + floatBob + hoverLift, dt * 8);
    item.model.root.rotation.z = Math.sin(elapsed * 1.1 + idx) * 0.015;

    const profileScale = 0.55 + 0.45 * Math.abs(Math.cos(item.model.root.rotation.y));
    item.model.floorShadow.scale.x = profileScale * (1 - floatBob * 0.4);
    item.model.floorShadow.material.opacity = (item.hovered ? 0.92 : 0.76) - floatBob * 0.8;

    const cam = item.model.itemCamera;
    cam.aspect = width / height;
    const aspectAdjust = cam.aspect < 1.35 ? (1.35 - cam.aspect) * 3.0 : 0;
    cam.position.z = (item.hovered ? 7.85 : 8.2) + aspectAdjust;
    cam.updateProjectionMatrix();

    item.model.itemRenderer.render(item.model.itemScene, cam);
  });
}

animate();
