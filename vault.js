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
  },
  {
    id: '06',
    indexMeta: 'No. 06 — Aetheric Nautical Rig, 1889 · 2D & 3D CAD',
    title: 'The Flying Dutchman',
    desc: 'An interactive isometric & 3D steampunk galleon anatomy figure: three square-rigged masts, a 15.5 bar Scotch marine aether-boiler, twin sidewheel levitation sponsons, six broadside brass cannons and a shrouded stern Kort propulsor. Switch between Light and Dark mode, click any assembly to explode the rig, or 3D orbit, pan and zoom around the ship.',
    unlocked: true,
    url: './flying-dutchman.html',
    ctaLabel: 'Board the Dutchman',
    shellColor: 0x102422,
    shellAttenuation: 0x05100f,
    ribColor: 0x0b1918,
    hubColor: 0xe6c886,
    artStyle: 'dutchman',
    dualTheme3D: true
  },
  {
    id: '07',
    indexMeta: 'No. 07 — 107.7 FM Mountain View · 118 BPM',
    title: 'Pirate Frequency',
    desc: 'A cel-shaded hoverboard courier run across dusk Mountain View. Carve city blocks, grind neon highway overpasses and Castro Street rails, and land bootleg cassette drops on the 118 BPM beat to un-mute all four funk and breakbeat broadcast stems before sign-off.',
    unlocked: true,
    url: './pirate-frequency.html',
    ctaLabel: 'Start Broadcast',
    shellColor: 0xd9480f,
    shellAttenuation: 0x6e1d04,
    ribColor: 0xa63208,
    hubColor: 0xffe042,
    artStyle: 'pirate'
  },
  {
    id: '08',
    indexMeta: 'No. 08 — Cloud-Sea Gunnery & CAD, 1889 · 6/8',
    title: 'Aether Broadside',
    desc: 'Command the 1889 aether-steam galleon across four cloud-sea naval waves: balance the 15.5-bar Scotch boiler across propulsion, lift and ordnance, unleash six-gun port and starboard brass broadsides, and toggle live into isometric X-ray CAD view to dispatch repair crews and vent steam.',
    unlocked: true,
    url: './aether-broadside.html',
    ctaLabel: 'Weigh Anchor',
    shellColor: 0x16322c,
    shellAttenuation: 0x071512,
    ribColor: 0x0f241f,
    hubColor: 0xe0bc75,
    artStyle: 'broadside'
  },
  {
    id: '09',
    indexMeta: 'No. 09 — Synesthetic Rail-Shooter · 124 BPM',
    title: 'Harmonic Lock',
    desc: 'Fly a three-form evolving vector craft through four architectural and Fourier spline megastructures, sweeping an eight-slot paint-lock reticle so every homing salvo and detonation plays quantized 16th-note percussion and synth harmony against SERAPH-IX.',
    unlocked: true,
    url: './harmonic-lock.html',
    ctaLabel: 'Initiate Sync',
    shellColor: 0x0f3d63,
    shellAttenuation: 0x04182b,
    ribColor: 0x0a2b46,
    hubColor: 0x00f0ff,
    artStyle: 'harmonic'
  }
];

// ============================================================================
// 2. SINGLE SHARED OFFSCREEN WEBGL RENDERER & PMREM ENVIRONMENT
// ============================================================================
const isMobile = window.innerWidth < 900 || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && window.innerWidth < 1024);

function getStagePixelRatio() {
  const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
  return Math.min(dpr, isMobile ? 1.5 : 2);
}

let sharedRenderW = 520;
let sharedRenderH = 248;
let sharedRenderDpr = getStagePixelRatio();

const sharedRenderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
sharedRenderer.setPixelRatio(sharedRenderDpr);
sharedRenderer.setSize(sharedRenderW, sharedRenderH, false);
sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
sharedRenderer.toneMappingExposure = 1.12;

const pmremGenerator = new THREE.PMREMGenerator(sharedRenderer);
const roomEnv = new RoomEnvironment();
const sharedEnvTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
roomEnv.dispose();
pmremGenerator.dispose();

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

function drawFlyingDutchmanArtwork(ctx) {
  // 1. Deep nocturnal sea-obsidian & verdigris bronze backdrop
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#060c0c');
  bg.addColorStop(0.55, '#0b1817');
  bg.addColorStop(1, '#122421');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  // Ectoplasmic turquoise furnace/sponson aura on right stage
  const aetherGlow = ctx.createRadialGradient(885, 220, 8, 885, 220, 185);
  aetherGlow.addColorStop(0, 'rgba(56, 217, 169, 0.34)');
  aetherGlow.addColorStop(0.5, 'rgba(56, 217, 169, 0.10)');
  aetherGlow.addColorStop(1, 'rgba(6, 12, 12, 0)');
  ctx.fillStyle = aetherGlow;
  ctx.fillRect(0, 0, 1024, 480);

  // Blueprint isometric drafting grid on right half
  ctx.save();
  ctx.strokeStyle = 'rgba(230, 200, 134, 0.08)';
  ctx.lineWidth = 1;
  for (let gx = 520; gx < 1000; gx += 28) {
    ctx.beginPath();
    ctx.moveTo(gx, 32);
    ctx.lineTo(gx, 392);
    ctx.stroke();
  }
  for (let gy = 44; gy < 390; gy += 28) {
    ctx.beginPath();
    ctx.moveTo(520, gy);
    ctx.lineTo(1000, gy);
    ctx.stroke();
  }

  // 2. Right Stage (x = 815..985): 3-Masted Steampunk Galleon Blueprint Silhouette
  // Ectoplasmic levitation ring on slipway floor
  ctx.strokeStyle = '#38d9a9';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(892, 326, 44, 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(56, 217, 169, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(892, 326, 62, 20, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 3-tier riveted galleon hull + high poop castle + forecastle + bowsprit
  ctx.fillStyle = '#0d1918';
  ctx.strokeStyle = '#e6c886';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(818, 252);
  ctx.lineTo(848, 252);
  ctx.lineTo(852, 272);
  ctx.lineTo(932, 272);
  ctx.lineTo(936, 260);
  ctx.lineTo(966, 260);
  ctx.lineTo(960, 298);
  ctx.lineTo(826, 298);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bowsprit & hanging ghost-lantern
  ctx.beginPath();
  ctx.moveTo(966, 266);
  ctx.lineTo(992, 252);
  ctx.moveTo(988, 254);
  ctx.lineTo(988, 268);
  ctx.stroke();
  ctx.fillStyle = '#38d9a9';
  ctx.beginPath();
  ctx.arc(988, 271, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Three stepped masts (mizzen, mainmast, foremast) + fighting tops + square yards
  const masts = [
    { x: 836, y0: 252, y1: 148, yTop: 184, yards: [212, 170], span: 18 },
    { x: 888, y0: 272, y1: 102, yTop: 152, yards: [196, 136], span: 28 },
    { x: 948, y0: 260, y1: 132, yTop: 172, yards: [204, 158], span: 22 }
  ];
  masts.forEach((m) => {
    ctx.strokeStyle = '#f2ede0';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y0);
    ctx.lineTo(m.x, m.y1);
    ctx.stroke();

    // Crow's nest fighting top
    ctx.fillStyle = '#122421';
    ctx.strokeStyle = '#e6c886';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(m.x, m.yTop, 8, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horizontal square yards
    ctx.strokeStyle = '#e6c886';
    ctx.lineWidth = 2.0;
    m.yards.forEach((yy, idx) => {
      const s = idx === 0 ? m.span : m.span * 0.78;
      ctx.beginPath();
      ctx.moveTo(m.x - s, yy - 5);
      ctx.lineTo(m.x + s, yy + 5);
      ctx.stroke();
    });
  });

  // Midship compound smokestack funnel & glowing plume
  ctx.fillStyle = '#152926';
  ctx.strokeStyle = '#38d9a9';
  ctx.lineWidth = 2.0;
  ctx.fillRect(908, 214, 12, 58);
  ctx.strokeRect(908, 214, 12, 58);

  // Sidewheel paddle-sponson wheel
  ctx.fillStyle = '#091211';
  ctx.strokeStyle = '#e6c886';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(892, 288, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(892 - Math.cos(a) * 15, 288 - Math.sin(a) * 15);
    ctx.lineTo(892 + Math.cos(a) * 15, 288 + Math.sin(a) * 15);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Lower Frieze: Bourdon Gauge Pressure Scale
  ctx.fillStyle = '#040808';
  ctx.fillRect(16, 396, 992, 68);
  ctx.strokeStyle = '#e6c886';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  for (let i = 0; i < 29; i++) {
    const bx = 276 + i * 16;
    const major = i % 4 === 0;
    const bh = major ? 26 : 12;
    ctx.fillStyle = major ? '#38d9a9' : 'rgba(230, 200, 134, 0.68)';
    ctx.fillRect(bx, 442 - bh, 3, bh);
  }

  // 4. Editorial Typography & Archival Metadata
  ctx.fillStyle = '#38d9a9';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('AETHERIC NAUTICAL RIG, 1889  ·  3D ORBIT & BLUEPRINT', 56, 62);

  ctx.fillStyle = '#f5f2ea';
  ctx.font = 'italic 600 60px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Flying Dutchman', 54, 128);

  ctx.fillStyle = '#e6c886';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('AETHER GALLEON', 56, 242);
  ctx.fillStyle = 'rgba(245, 242, 234, 0.76)';
  ctx.font = '400 14px "JetBrains Mono", monospace';
  ctx.fillText('15.5 BAR · 42 TF', 56, 268);
  ctx.fillText('LIGHT & DARK MODE', 56, 292);
  ctx.fillText('3D PAN & ZOOM', 56, 316);

  ctx.fillStyle = '#e6c886';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('NO. 06', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('LIGHT / DARK · 3D ORBIT', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(230, 200, 134, 0.62)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function drawPirateFrequencyArtwork(ctx) {
  // 1. Deep nocturnal indigo-to-sunset broadcast sky backdrop
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#0b0719');
  bg.addColorStop(0.52, '#220e38');
  bg.addColorStop(0.84, '#681938');
  bg.addColorStop(1, '#b83714');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  // Sunset FM transmitter radial wash on the upper-right flank
  const sunsetGlow = ctx.createRadialGradient(904, 138, 8, 904, 138, 195);
  sunsetGlow.addColorStop(0, 'rgba(255, 224, 66, 0.34)');
  sunsetGlow.addColorStop(0.45, 'rgba(255, 107, 26, 0.22)');
  sunsetGlow.addColorStop(0.75, 'rgba(0, 240, 255, 0.10)');
  sunsetGlow.addColorStop(1, 'rgba(11, 7, 25, 0)');
  ctx.fillStyle = sunsetGlow;
  ctx.fillRect(0, 0, 1024, 480);

  // Zine diagonal speed-screen texture across upper-right sky
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 224, 66, 0.08)';
  ctx.lineWidth = 1.2;
  for (let sx = 540; sx < 1020; sx += 22) {
    ctx.beginPath();
    ctx.moveTo(sx, 28);
    ctx.lineTo(sx - 64, 160);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Right Flank (x = 825..985): Pirate Radio Mast, FM Wave Rings & Cassette Hoverboard Deck
  ctx.save();
  const mastX = 906;
  const beaconY = 104;

  // Concentric cyan & gold FM broadcast wave arcs radiating from tower beacon
  [24, 40, 56, 72].forEach((rad, i) => {
    ctx.strokeStyle = i % 2 === 0 ? '#00f0ff' : '#ffe042';
    ctx.lineWidth = i < 2 ? 2.6 : 1.9;
    ctx.beginPath();
    ctx.arc(mastX, beaconY, rad, -0.58, 0.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mastX, beaconY, rad, Math.PI - 0.58, Math.PI + 0.58);
    ctx.stroke();
  });

  // Steel-ink & gold lattice broadcast tower
  ctx.strokeStyle = '#ffe042';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(mastX - 28, 268);
  ctx.lineTo(mastX - 4, beaconY + 8);
  ctx.moveTo(mastX + 28, 268);
  ctx.lineTo(mastX + 4, beaconY + 8);
  ctx.moveTo(mastX, beaconY + 8);
  ctx.lineTo(mastX, beaconY - 12);
  ctx.stroke();

  // Lattice cross-bracing struts
  ctx.strokeStyle = 'rgba(248, 247, 255, 0.82)';
  ctx.lineWidth = 1.6;
  const tiers = [
    [136, 8],
    [168, 13],
    [202, 18],
    [236, 23]
  ];
  for (let t = 0; t < tiers.length; t++) {
    const [ty, halfSpan] = tiers[t];
    ctx.beginPath();
    ctx.moveTo(mastX - halfSpan, ty);
    ctx.lineTo(mastX + halfSpan, ty);
    if (t < tiers.length - 1) {
      const [ny, nextSpan] = tiers[t + 1];
      ctx.moveTo(mastX - halfSpan, ty);
      ctx.lineTo(mastX + nextSpan, ny);
      ctx.moveTo(mastX + halfSpan, ty);
      ctx.lineTo(mastX - nextSpan, ny);
    }
    ctx.stroke();
  }

  // Hot-magenta & cyan transmitter beacon bulb
  ctx.fillStyle = '#ff2a85';
  ctx.beginPath();
  ctx.arc(mastX, beaconY, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mastX, beaconY, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Neon overpass grind rail + spark burst beneath hoverboard
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(826, 356);
  ctx.lineTo(984, 326);
  ctx.stroke();

  // Grind sparks at contact point
  ctx.strokeStyle = '#ffe042';
  ctx.lineWidth = 2.2;
  [
    [872, 344, 846, 334],
    [876, 344, 854, 362],
    [934, 334, 958, 348]
  ].forEach(([x0, y0, x1, y1]) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  });

  // Angled cel-shaded Cassette Hoverboard Deck
  ctx.save();
  ctx.translate(906, 314);
  ctx.rotate(-0.18);

  // Anti-grav cyan thruster pads under nose & tail
  [-50, 50].forEach((tx) => {
    ctx.strokeStyle = '#1aff9c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(tx, 18, 15, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Hoverboard deck body with ink outline
  ctx.fillStyle = '#ff6b1a';
  ctx.strokeStyle = '#09080f';
  ctx.lineWidth = 4;
  roundedRectPath(ctx, -74, -18, 148, 34, 16);
  ctx.fill();
  ctx.stroke();

  // Yellow zine racing stripe + embedded twin cassette reels
  ctx.fillStyle = '#ffe042';
  roundedRectPath(ctx, -54, -10, 108, 18, 7);
  ctx.fill();

  [-22, 22].forEach((rx) => {
    ctx.fillStyle = '#09080f';
    ctx.beginPath();
    ctx.arc(rx, -1, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  ctx.restore();
  ctx.restore();

  // 3. Lower Frieze (y = 396..464): 4-Stem Spectrum Analyzer (DRUMS · BASS · RHODES · LEAD)
  ctx.fillStyle = '#070510';
  ctx.fillRect(16, 396, 992, 68);
  ctx.strokeStyle = '#ffe042';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  const stems = [
    { name: 'DRUMS', color: '#ff6b1a', bars: [26, 18, 30, 14, 24] },
    { name: 'BASS', color: '#00f0ff', bars: [22, 28, 20, 26, 16] },
    { name: 'RHODES', color: '#ffe042', bars: [16, 24, 29, 21, 18] },
    { name: 'LEAD', color: '#ff2a85', bars: [20, 31, 25, 28, 22] }
  ];
  ctx.save();
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  stems.forEach((stem, sIdx) => {
    const groupX = 258 + sIdx * 126;
    stem.bars.forEach((bh, bIdx) => {
      const bx = groupX + bIdx * 14;
      ctx.fillStyle = stem.color;
      ctx.fillRect(bx, 439 - bh, 9, bh);
      ctx.fillStyle = '#fff8e7';
      ctx.fillRect(bx, 436 - bh, 9, 2);
    });
    ctx.fillStyle = 'rgba(248, 247, 255, 0.84)';
    ctx.fillText(stem.name, groupX + 32, 455);
  });
  ctx.restore();

  // 4. Editorial / Pirate Zine Typography
  ctx.fillStyle = '#00f0ff';
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText('107.7 FM // MOUNTAIN VIEW  ·  BOOTLEG COURIER', 56, 62);

  // Zine offset ink + hot-tangerine print shadow on bold italic title
  ctx.save();
  ctx.font = 'italic 600 62px "Cormorant Garamond", "Georgia", serif';
  ctx.fillStyle = '#09080f';
  ctx.fillText('Pirate Frequency', 58, 134);
  ctx.fillStyle = '#ff6b1a';
  ctx.fillText('Pirate Frequency', 56, 132);
  ctx.fillStyle = '#fff8e7';
  ctx.fillText('Pirate Frequency', 54, 130);
  ctx.restore();

  // Left-flank metadata (strictly clear of winX = 216)
  ctx.fillStyle = '#ffe042';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('107.7 FM LIVE', 56, 242);
  ctx.fillStyle = 'rgba(248, 247, 255, 0.78)';
  ctx.font = '400 14px "JetBrains Mono", monospace';
  ctx.fillText('HOVERBOARD', 56, 268);
  ctx.fillText('RAIL GRIND', 56, 292);
  ctx.fillText('ON-BEAT DROP', 56, 316);

  ctx.fillStyle = '#ffe042';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('NO. 07', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('118 BPM · 4-STEM', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255, 224, 66, 0.68)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function drawAetherBroadsideArtwork(ctx) {
  // 1. Dark Admiralty Slate-Emerald Technical Plate Backdrop
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#050b0a');
  bg.addColorStop(0.55, '#0c1c19');
  bg.addColorStop(1, '#16302a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  // Subtle brass & aether glow over right gunnery plate
  const plateGlow = ctx.createRadialGradient(904, 195, 10, 904, 195, 195);
  plateGlow.addColorStop(0, 'rgba(56, 217, 169, 0.26)');
  plateGlow.addColorStop(0.55, 'rgba(224, 188, 117, 0.14)');
  plateGlow.addColorStop(1, 'rgba(5, 11, 10, 0)');
  ctx.fillStyle = plateGlow;
  ctx.fillRect(0, 0, 1024, 480);

  // Isometric X-Ray CAD drafting grid on right plate
  ctx.save();
  ctx.strokeStyle = 'rgba(224, 188, 117, 0.08)';
  ctx.lineWidth = 1;
  for (let gx = 520; gx < 1000; gx += 28) {
    ctx.beginPath();
    ctx.moveTo(gx, 32);
    ctx.lineTo(gx, 392);
    ctx.stroke();
  }
  for (let gy = 44; gy < 390; gy += 28) {
    ctx.beginPath();
    ctx.moveTo(520, gy);
    ctx.lineTo(1000, gy);
    ctx.stroke();
  }

  // 2. Right Flank Upper (x = 825..985, y = 78..236): Drafted Compass Rose + 6-Gun Trajectory Fan
  const roseX = 906;
  const roseY = 156;

  // Concentric brass compass rings
  ctx.strokeStyle = 'rgba(224, 188, 117, 0.78)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.arc(roseX, roseY, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(56, 217, 169, 0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(roseX, roseY, 42, 0, Math.PI * 2);
  ctx.stroke();

  // 16 azimuth degree ticks around outer rose
  ctx.strokeStyle = '#e0bc75';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r0 = i % 4 === 0 ? 45 : 49;
    ctx.lineWidth = i % 4 === 0 ? 2.2 : 1.1;
    ctx.beginPath();
    ctx.moveTo(roseX + Math.cos(a) * r0, roseY + Math.sin(a) * r0);
    ctx.lineTo(roseX + Math.cos(a) * 54, roseY + Math.sin(a) * 54);
    ctx.stroke();
  }

  // 8-point drafted compass star
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const tipR = i % 2 === 0 ? 36 : 22;
    ctx.strokeStyle = i % 2 === 0 ? '#f4f0e6' : 'rgba(224, 188, 117, 0.75)';
    ctx.lineWidth = i % 2 === 0 ? 2.0 : 1.3;
    ctx.beginPath();
    ctx.moveTo(roseX, roseY);
    ctx.lineTo(roseX + Math.cos(a) * tipR, roseY + Math.sin(a) * tipR);
    ctx.stroke();
  }

  // 6-Gun Starboard Broadside Parabolic Trajectory Fan arcing right-upward
  for (let g = 0; g < 6; g++) {
    const spread = (g - 2.5) * 0.14;
    const startX = roseX - 10;
    const startY = roseY + (g - 2.5) * 5.5;
    const endX = roseX + Math.cos(-0.22 + spread) * 70;
    const endY = roseY + Math.sin(-0.22 + spread) * 66;
    const ctrlX = (startX + endX) * 0.5 + 8;
    const ctrlY = (startY + endY) * 0.5 - 12;

    ctx.strokeStyle = g % 2 === 0 ? 'rgba(255, 174, 82, 0.88)' : 'rgba(56, 217, 169, 0.82)';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
    ctx.stroke();

    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(endX, endY, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Top-down galleon hull icon at center of compass rose
  ctx.fillStyle = '#091513';
  ctx.strokeStyle = '#e0bc75';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(roseX, roseY - 18);
  ctx.quadraticCurveTo(roseX + 9, roseY - 4, roseX + 7, roseY + 16);
  ctx.lineTo(roseX - 7, roseY + 16);
  ctx.quadraticCurveTo(roseX - 9, roseY - 4, roseX, roseY - 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Right Flank Lower (x = 842..970, y = 250..366): 15.5-Bar Scotch Boiler Gauge Dial
  const dialX = 906;
  const dialY = 312;
  const dialR = 46;

  ctx.fillStyle = '#081210';
  ctx.strokeStyle = '#e0bc75';
  ctx.lineWidth = 3.0;
  ctx.beginPath();
  ctx.arc(dialX, dialY, dialR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Green operating arc (0..15.5 bar) + crimson 19.5 bar overpressure arc
  ctx.strokeStyle = '#38d9a9';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(dialX, dialY, dialR - 8, Math.PI * 0.78, Math.PI * 1.88);
  ctx.stroke();

  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(dialX, dialY, dialR - 8, Math.PI * 1.90, Math.PI * 2.22);
  ctx.stroke();

  // Gauge needle pointing to 15.5 BAR
  const needleAngle = Math.PI * 1.84;
  ctx.strokeStyle = '#f4f0e6';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(dialX, dialY);
  ctx.lineTo(dialX + Math.cos(needleAngle) * (dialR - 13), dialY + Math.sin(needleAngle) * (dialR - 13));
  ctx.stroke();

  ctx.fillStyle = '#e0bc75';
  ctx.beginPath();
  ctx.arc(dialX, dialY, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f4f0e6';
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('15.5 BAR', dialX, dialY + 26);
  ctx.textAlign = 'left';
  ctx.restore();

  // 4. Lower Frieze (y = 396..464): 15.5-Bar Boiler Allocation Pips (PROP · LIFT · ORD)
  ctx.fillStyle = '#040908';
  ctx.fillRect(16, 396, 992, 68);
  ctx.strokeStyle = '#e0bc75';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  const channels = [
    { label: 'PROP', lit: 5, total: 6, color: '#38d9a9' },
    { label: 'LIFT', lit: 4, total: 6, color: '#6b9bff' },
    { label: 'ORD', lit: 6, total: 6, color: '#f4c867' }
  ];
  ctx.save();
  ctx.font = '600 12px "JetBrains Mono", monospace';
  channels.forEach((ch, cIdx) => {
    const baseX = 252 + cIdx * 172;
    ctx.fillStyle = '#e0bc75';
    ctx.fillText(ch.label, baseX, 435);
    for (let p = 0; p < ch.total; p++) {
      const px = baseX + 46 + p * 16;
      const py = 421;
      if (p < ch.lit) {
        ctx.fillStyle = ch.color;
        ctx.fillRect(px, py, 11, 18);
      } else {
        ctx.strokeStyle = 'rgba(224, 188, 117, 0.42)';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(px, py, 11, 18);
      }
    }
  });
  ctx.restore();

  // 5. Editorial Typography & Admiralty Plate Metadata
  ctx.fillStyle = '#38d9a9';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('CLOUD-SEA TACTICAL DUEL, 1889  ·  3D & CAD X-RAY', 56, 62);

  ctx.fillStyle = '#f4f0e6';
  ctx.font = 'italic 600 60px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Aether Broadside', 54, 128);

  ctx.fillStyle = '#e0bc75';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('6-GUN VOLLEY', 56, 242);
  ctx.fillStyle = 'rgba(244, 240, 230, 0.78)';
  ctx.font = '400 14px "JetBrains Mono", monospace';
  ctx.fillText('15.5 BAR BOILER', 56, 268);
  ctx.fillText('4 NAVAL WAVES', 56, 292);
  ctx.fillText('X-RAY REPAIR', 56, 316);

  ctx.fillStyle = '#e0bc75';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('NO. 08', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('3D HELM · X-RAY CAD', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(224, 188, 117, 0.65)';
  ctx.lineWidth = 3;
  roundedRectPath(ctx, 26, 24, 972, 432, 20);
  ctx.stroke();
}

function drawHarmonicLockArtwork(ctx) {
  // 1. Deep Void-Cyan Phosphor Vector Backdrop
  const bg = ctx.createLinearGradient(0, 0, 1024, 480);
  bg.addColorStop(0, '#03050c');
  bg.addColorStop(0.55, '#061329');
  bg.addColorStop(1, '#0b2242');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 480);

  // Dual synesthetic bloom auras: crimson-magenta boss core + cyan reticle
  const bossAura = ctx.createRadialGradient(906, 124, 6, 906, 124, 150);
  bossAura.addColorStop(0, 'rgba(255, 42, 133, 0.36)');
  bossAura.addColorStop(0.5, 'rgba(255, 209, 102, 0.14)');
  bossAura.addColorStop(1, 'rgba(3, 5, 12, 0)');
  ctx.fillStyle = bossAura;
  ctx.fillRect(0, 0, 1024, 480);

  const reticleAura = ctx.createRadialGradient(906, 298, 6, 906, 298, 140);
  reticleAura.addColorStop(0, 'rgba(0, 240, 255, 0.30)');
  reticleAura.addColorStop(0.55, 'rgba(26, 255, 178, 0.10)');
  reticleAura.addColorStop(1, 'rgba(3, 5, 12, 0)');
  ctx.fillStyle = reticleAura;
  ctx.fillRect(0, 0, 1024, 480);

  // Perspective phosphor spline lattice across right void
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.11)';
  ctx.lineWidth = 1;
  for (let gx = 520; gx <= 996; gx += 34) {
    ctx.beginPath();
    ctx.moveTo(gx, 28);
    ctx.lineTo(gx, 392);
    ctx.stroke();
  }
  for (let gy = 40; gy <= 388; gy += 28) {
    ctx.beginPath();
    ctx.moveTo(520, gy);
    ctx.lineTo(996, gy);
    ctx.stroke();
  }

  // 2. Right Flank (x = 825..985): 8-Octagon Paint-Lock Reticle + Bézier Homing Salvo -> Boss Core
  const bossX = 906;
  const bossY = 122;
  const retX = 906;
  const retY = 298;
  const retR = 44;

  // Curving Magenta / Cyan / Gold Bézier Homing Ribbons from 8 octagon nodes to SERAPH-IX core
  const ribbonColors = [
    '#00f0ff', '#ff2a85', '#ffd166', '#1affb2',
    '#00f0ff', '#ff2a85', '#ffd166', '#1affb2'
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const sx = retX + Math.cos(a) * retR;
    const sy = retY + Math.sin(a) * retR;
    const side = sx >= retX ? 1 : -1;
    const bow = (i % 2 === 0 ? 48 : 30) * side;
    const midX = (sx + bossX) * 0.5 + bow;
    const midY = (sy + bossY) * 0.5;

    ctx.strokeStyle = ribbonColors[i];
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(midX, midY, bossX, bossY);
    ctx.stroke();
  }

  // Icosahedral Boss Core (SERAPH-IX) at (bossX, bossY)
  const icoOuterR = 34;
  const icoInnerR = 17;
  const outerPts = [];
  const innerPts = [];
  for (let v = 0; v < 6; v++) {
    const oa = (v / 6) * Math.PI * 2 - Math.PI / 2;
    const ia = oa + Math.PI / 6;
    outerPts.push([bossX + Math.cos(oa) * icoOuterR, bossY + Math.sin(oa) * icoOuterR]);
    innerPts.push([bossX + Math.cos(ia) * icoInnerR, bossY + Math.sin(ia) * icoInnerR]);
  }

  // Faceted wireframe cage
  ctx.fillStyle = 'rgba(12, 18, 38, 0.85)';
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  outerPts.forEach(([px, py], idx) => {
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let v = 0; v < 6; v++) {
    const [ox, oy] = outerPts[v];
    const [ix, iy] = innerPts[v];
    const [nx, ny] = innerPts[(v + 5) % 6];
    ctx.moveTo(ox, oy);
    ctx.lineTo(ix, iy);
    ctx.moveTo(ox, oy);
    ctx.lineTo(nx, ny);
    ctx.moveTo(ix, iy);
    ctx.lineTo(innerPts[(v + 1) % 6][0], innerPts[(v + 1) % 6][1]);
  }
  ctx.stroke();

  // Singularity magenta core
  ctx.fillStyle = '#ff2a85';
  ctx.beginPath();
  ctx.arc(bossX, bossY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8f9ff';
  ctx.beginPath();
  ctx.arc(bossX, bossY, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // 8-Octagon Paint-Lock Reticle at (retX, retY)
  [retR, retR * 0.58].forEach((radius, rIdx) => {
    ctx.strokeStyle = rIdx === 0 ? '#00f0ff' : '#ffd166';
    ctx.lineWidth = rIdx === 0 ? 2.4 : 1.6;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2 + (rIdx * Math.PI) / 8;
      const vx = retX + Math.cos(a) * radius;
      const vy = retY + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.stroke();
  });

  // 8 Paint-Lock Octet Nodes + center crosshair
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const vx = retX + Math.cos(a) * retR;
    const vy = retY + Math.sin(a) * retR;
    ctx.fillStyle = ribbonColors[i];
    ctx.beginPath();
    ctx.arc(vx, vy, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#e8f9ff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(retX - 9, retY);
  ctx.lineTo(retX + 9, retY);
  ctx.moveTo(retX, retY - 9);
  ctx.lineTo(retX, retY + 9);
  ctx.stroke();
  ctx.restore();

  // 3. Lower Frieze (y = 396..464): 16-Step Quantized Harmonic Pulse Sequencer Grid
  ctx.fillStyle = '#02040a';
  ctx.fillRect(16, 396, 992, 68);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(16, 396);
  ctx.lineTo(1008, 396);
  ctx.stroke();

  // 16th-note step matrix (3 harmonic voices x 16 steps across x = 254..746)
  const voiceRows = [
    { y: 409, color: '#00f0ff', pattern: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1] },
    { y: 424, color: '#ffd166', pattern: [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0] },
    { y: 439, color: '#ff2a85', pattern: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1, 1] }
  ];
  for (let step = 0; step < 16; step++) {
    const sx = 254 + step * 31;
    const isBeat = step % 4 === 0;
    voiceRows.forEach((row) => {
      if (row.pattern[step]) {
        ctx.fillStyle = row.color;
        ctx.fillRect(sx, row.y, 22, 10);
      } else {
        ctx.strokeStyle = isBeat ? 'rgba(0, 240, 255, 0.42)' : 'rgba(232, 249, 255, 0.16)';
        ctx.lineWidth = 1.1;
        ctx.strokeRect(sx, row.y, 22, 10);
      }
    });
  }

  // 4. Editorial Typography & Synesthetic Telemetry Metadata
  ctx.fillStyle = '#00f0ff';
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.fillText('SYNESTHETIC SPLINE SHOOTER  ·  QUANTIZED 124 BPM', 56, 62);

  ctx.save();
  ctx.fillStyle = '#e8f9ff';
  ctx.shadowColor = 'rgba(0, 240, 255, 0.38)';
  ctx.shadowBlur = 12;
  ctx.font = 'italic 600 62px "Cormorant Garamond", "Georgia", serif';
  ctx.fillText('Harmonic Lock', 54, 130);
  ctx.restore();

  ctx.fillStyle = '#ffd166';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('PAINT-LOCK', 56, 242);
  ctx.fillStyle = 'rgba(232, 249, 255, 0.78)';
  ctx.font = '400 14px "JetBrains Mono", monospace';
  ctx.fillText('3 EVO FORMS', 56, 268);
  ctx.fillText('4 SPLINE AREAS', 56, 292);
  ctx.fillText('1/16 QUANTIZED', 56, 316);

  ctx.fillStyle = '#00f0ff';
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillText('NO. 09', 56, 436);
  ctx.textAlign = 'right';
  ctx.fillText('8-LOCK · SERAPH-IX', 968, 436);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.62)';
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
  } else if (tape.artStyle === 'dutchman') {
    drawFlyingDutchmanArtwork(ctx);
  } else if (tape.artStyle === 'pirate') {
    drawPirateFrequencyArtwork(ctx);
  } else if (tape.artStyle === 'broadside') {
    drawAetherBroadsideArtwork(ctx);
  } else if (tape.artStyle === 'harmonic') {
    drawHarmonicLockArtwork(ctx);
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

  const windowStrokeColors = {
    pirate: '#ffe042',
    broadside: '#e0bc75',
    harmonic: '#00f0ff',
    kronos: '#ffe042',
    dutchman: '#e6c886',
    drive: '#ffbe76'
  };

  ctx.save();
  ctx.strokeStyle = windowStrokeColors[tape.artStyle] || '#c8ad78';
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

  const stageCanvas = document.createElement('canvas');
  const initW = Math.max(1, stageEl.clientWidth || 520);
  const initH = Math.max(1, stageEl.clientHeight || 248);
  const dpr = getStagePixelRatio();
  stageCanvas.width = Math.max(1, Math.floor(initW * dpr));
  stageCanvas.height = Math.max(1, Math.floor(initH * dpr));
  const stageCtx = stageCanvas.getContext('2d');
  stageEl.appendChild(stageCanvas);

  itemScene.environment = sharedEnvTexture;

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

  return { root, reels, guideRollers, itemScene, itemCamera, floorShadow, stageCanvas, stageCtx };
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

  const subActionsHtml = tape.dualTheme3D
    ? `
      <button class="open-work-sub" type="button" data-launch-theme="light" title="Open in Light Mode">☀ Light</button>
      <button class="open-work-sub" type="button" data-launch-theme="dark" title="Open in Dark Mode">☾ Dark</button>
      <button class="open-work-sub" type="button" data-launch-mode="3d" title="Open directly in 3D Orbit, Pan & Zoom mode">3D Pan &amp; Zoom</button>
    `
    : '';

  cardEl.innerHTML = `
    <div class="tape-stage" id="tape-stage-${idx}"></div>
    <div class="tape-caption">
      <div class="work-index">${tape.indexMeta}</div>
      <h2 class="work-title">${tape.title}</h2>
      <p class="work-desc">${tape.desc}</p>
      <div class="tape-action-row">
        <button class="open-work-btn" type="button" ${tape.unlocked ? '' : 'disabled'}>
          <span>${tape.ctaLabel}</span>
          ${tape.unlocked ? '<span>→</span>' : ''}
        </button>
        ${subActionsHtml}
      </div>
    </div>
  `;

  tapeGridEl.appendChild(cardEl);
  const stageEl = cardEl.querySelector('.tape-stage');
  const model = buildCassetteInstance(tape, stageEl);

  const isCenterpieceOddLast = idx === TAPES.length - 1 && TAPES.length % 2 === 1;

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
    rotY: isCenterpieceOddLast ? 0 : (idx % 2 === 0 ? -0.22 : 0.22),
    rotX: 0.08,
    hoverOffsetX: 0,
    hoverOffsetY: 0,
    hasRenderedInitialFrame: false,
    needsRedraw: true
  };

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      item.needsRedraw = true;
    });
    ro.observe(stageEl);
  }

  function navigateToWork(opts = {}) {
    if (!tape.unlocked || !tape.url) return;
    if (tape.dualTheme3D) {
      const activeTheme = opts.theme || (document.body.classList.contains('theme-dark') ? 'dark' : 'light');
      const parts = [`theme=${encodeURIComponent(activeTheme)}`];
      if (opts.mode) parts.push(`mode=${encodeURIComponent(opts.mode)}`);
      window.location.href = `${tape.url}?${parts.join('&')}`;
      return;
    }
    window.location.href = tape.url;
  }

  cardEl.querySelectorAll('[data-launch-theme]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToWork({ theme: btn.dataset.launchTheme });
    });
  });

  cardEl.querySelectorAll('[data-launch-mode]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToWork({ mode: btn.dataset.launchMode });
    });
  });

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
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.toggle('theme-dark', isDark);
    }
    btnBackdrop.textContent = isDark ? 'Light room' : 'Dark room';
  });
}

// ============================================================================
// 6. SHARED-RENDERER ANIMATION LOOP (VIEWPORT-CULLED 2D STAGE COMPOSITING)
// ============================================================================
const clock = new THREE.Clock();

function isStageNearViewport(stageEl) {
  if (!stageEl || typeof stageEl.getBoundingClientRect !== 'function') return true;
  const rect = stageEl.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.bottom === 0)) {
    return true;
  }
  const vh = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 900;
  return rect.bottom >= -300 && rect.top <= vh + 300;
}

function renderStageToCanvas(item, width, height, cam) {
  const dpr = getStagePixelRatio();
  const cw = Math.max(1, Math.floor(width * dpr));
  const ch = Math.max(1, Math.floor(height * dpr));

  const stageCanvas = item.model.stageCanvas;
  if (stageCanvas.width !== cw || stageCanvas.height !== ch) {
    stageCanvas.width = cw;
    stageCanvas.height = ch;
  }

  if (sharedRenderW !== width || sharedRenderH !== height || sharedRenderDpr !== dpr) {
    sharedRenderer.setPixelRatio(dpr);
    sharedRenderer.setSize(width, height, false);
    sharedRenderW = width;
    sharedRenderH = height;
    sharedRenderDpr = dpr;
  }

  sharedRenderer.render(item.model.itemScene, cam);

  const ctx2d = item.model.stageCtx;
  if (ctx2d) {
    ctx2d.clearRect(0, 0, cw, ch);
    if (sharedRenderer.domElement) {
      ctx2d.drawImage(sharedRenderer.domElement, 0, 0, cw, ch);
    }
  }

  item.hasRenderedInitialFrame = true;
  item.needsRedraw = false;
}

function animate() {
  requestAnimationFrame(animate);

  const rawDt = clock.getDelta();
  const dt = Number.isFinite(rawDt) ? Math.min(Math.max(rawDt, 0), 0.1) : 0.016;
  const rawElapsed = clock.getElapsedTime();
  const elapsed = Number.isFinite(rawElapsed) ? rawElapsed : 0;
  const poseLerp = Math.min(1, dt * 8);
  const orbitLerp = Math.min(1, dt * 3);

  tapeItems.forEach((item, idx) => {
    const width = Math.max(1, item.stageEl.clientWidth || 520);
    const height = Math.max(1, item.stageEl.clientHeight || 248);

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
      item.rotX = THREE.MathUtils.lerp(item.rotX, 0.08 + Math.sin(elapsed * 0.8 + idx) * 0.04, orbitLerp);
    }

    const targetY = item.rotY + item.hoverOffsetX;
    const targetX = item.rotX + item.hoverOffsetY;
    item.model.root.rotation.y = THREE.MathUtils.lerp(item.model.root.rotation.y, targetY, poseLerp);
    item.model.root.rotation.x = THREE.MathUtils.lerp(item.model.root.rotation.x, targetX, poseLerp);

    const floatBob = Math.sin(elapsed * 1.7 + idx * 0.9) * 0.05;
    const hoverLift = item.hovered ? 0.08 : 0.0;
    item.model.root.position.y = THREE.MathUtils.lerp(item.model.root.position.y, 0.06 + floatBob + hoverLift, poseLerp);
    item.model.root.rotation.z = Math.sin(elapsed * 1.1 + idx) * 0.015;

    const profileScale = 0.55 + 0.45 * Math.abs(Math.cos(item.model.root.rotation.y));
    item.model.floorShadow.scale.x = profileScale * (1 - floatBob * 0.4);
    item.model.floorShadow.material.opacity = (item.hovered ? 0.92 : 0.76) - floatBob * 0.8;

    const cam = item.model.itemCamera;
    cam.aspect = width / height;
    const aspectAdjust = cam.aspect < 1.35 ? (1.35 - cam.aspect) * 3.0 : 0;
    cam.position.z = (item.hovered ? 7.85 : 8.2) + aspectAdjust;
    cam.updateProjectionMatrix();

    if (!item.hasRenderedInitialFrame || item.needsRedraw || isStageNearViewport(item.stageEl)) {
      renderStageToCanvas(item, width, height, cam);
    }
  });
}

animate();
