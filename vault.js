import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================================================
// 1. VIBE-CODED CASSETTE ARCHIVE CATALOG
// ============================================================================
const CASSETTES = [
  {
    id: 'TAPE_01 // CrO2 90m',
    title: 'CLAIR DE LUNE // NOCTURNE 2099',
    shortTitle: 'CLAIR DE LUNE',
    subtitle: 'DARK SYNTH INTERACTIVE DEMO',
    status: 'PLAYABLE DEMO',
    unlocked: true,
    url: './clair-de-lune.html',
    shellColor: 0x00d9ff,
    edgeColor: 0x00f3ff,
    artTheme: 'moon',
    desc: "Dark synth futuristic reimagining of Debussy's Clair de Lune. Sculpt the analog CS-80 filter, pluck orbital laser-harp monoliths, or conduct every chord note-by-note across a moonlit cyber ocean."
  },
  {
    id: 'TAPE_02 // METAL IV',
    title: 'OUTRUN OVERDRIVE // HIGHWAY',
    shortTitle: 'HIGHWAY 2099',
    subtitle: 'ENDLESS SYNTHWAVE CRUISER',
    status: 'PLAYABLE DEMO',
    unlocked: true,
    url: './index.html',
    shellColor: 0xff007f,
    edgeColor: 0xff3399,
    artTheme: 'highway',
    desc: 'The flagship endless cyberpunk highway cruiser with real-time Lyria 3.5 AI music generation and audio-reactive megacity skyline.'
  },
  {
    id: 'TAPE_03 // CrO2 60m',
    title: 'NEURAL_GARDEN // PROTO_03',
    shortTitle: 'NEURAL GARDEN',
    subtitle: 'UPCOMING VIBE-CODED EXP',
    status: 'INCOMING TAPE',
    unlocked: false,
    url: null,
    shellColor: 0x8a2be2,
    edgeColor: 0xb565ff,
    artTheme: 'neural',
    desc: 'Encrypted cassette slot reserved for the next vibe-coded experiment. Check back soon as new prototypes drop into the vault.'
  },
  {
    id: 'TAPE_04 // TYPE II',
    title: 'CYBER_ARCADE // PROTO_04',
    shortTitle: 'CYBER ARCADE',
    subtitle: 'UPCOMING VIBE-CODED GAME',
    status: 'INCOMING TAPE',
    unlocked: false,
    url: null,
    shellColor: 0xff8800,
    edgeColor: 0xffaa00,
    artTheme: 'arcade',
    desc: 'Encrypted cassette slot reserved for upcoming vibe-coded mini-games and WebGL shaders on bevelez.ai.'
  }
];

// ============================================================================
// 2. THREE.JS SCENE, CAMERA & BLOOM SETUP
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04010c);
scene.fog = new THREE.FogExp2(0x050212, 0.028);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  120
);
camera.position.set(0, 0.35, 7.6);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.85,
  0.4,
  0.28
);
composer.addPass(bloomPass);

// Lighting for Translucent Acrylic Cassettes
const ambientLight = new THREE.AmbientLight(0x3a2468, 2.0);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(5, 8, 9);
scene.add(keyLight);

const cyanBackLight = new THREE.PointLight(0x00f3ff, 5, 22);
cyanBackLight.position.set(-5, 2, -3);
scene.add(cyanBackLight);

const pinkBackLight = new THREE.PointLight(0xff007f, 5, 22);
pinkBackLight.position.set(5, -2, -3);
scene.add(pinkBackLight);

// Subtle background cyber grid & floating dust particles
const gridHelper = new THREE.GridHelper(60, 40, 0x00f3ff, 0x240b4c);
gridHelper.position.y = -2.8;
scene.add(gridHelper);

const dustCount = 450;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 32;
  dustPos[i * 3 + 1] = (Math.random() - 0.5) * 16;
  dustPos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({
  color: 0x00f3ff,
  size: 0.055,
  transparent: true,
  opacity: 0.65
});
const dustParticles = new THREE.Points(dustGeo, dustMat);
scene.add(dustParticles);

// ============================================================================
// 3. PROCEDURAL COVER ART & 3D TITLE PLATE TEXTURE GENERATORS
// ============================================================================
function createCoverArtTexture(item) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  // Cassette sticker background with center window cutout
  const bgGrad = ctx.createLinearGradient(0, 0, 640, 360);
  bgGrad.addColorStop(0, '#090418');
  bgGrad.addColorStop(0.5, '#130830');
  bgGrad.addColorStop(1, '#060210');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 640, 360);

  // Top metallic header stripe
  const hexColor = '#' + item.edgeColor.toString(16).padStart(6, '0');
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, 640, 44);

  ctx.fillStyle = '#05020d';
  ctx.font = 'bold 21px "Orbitron", sans-serif';
  ctx.fillText(`SIDE A // ${item.id}`, 22, 29);
  ctx.fillText(item.unlocked ? 'HI-BIAS' : 'LOCKED', 520, 29);

  // Bespoke vector cover artwork per cassette
  ctx.save();
  if (item.artTheme === 'moon') {
    // Eclipsed Cyber Moon & Laser Harp Waves for Clair de Lune
    const moonGrad = ctx.createRadialGradient(515, 175, 8, 515, 175, 92);
    moonGrad.addColorStop(0, '#05020f');
    moonGrad.addColorStop(0.58, '#05020f');
    moonGrad.addColorStop(0.63, '#00f3ff');
    moonGrad.addColorStop(0.78, '#7b2cbf');
    moonGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(515, 175, 92, 0, Math.PI * 2);
    ctx.fill();

    // Soundwave ripples across bottom
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    for (let w = 0; w < 5; w++) {
      ctx.globalAlpha = 0.25 + w * 0.14;
      ctx.beginPath();
      for (let x = 20; x < 620; x += 8) {
        const y = 305 + Math.sin(x * 0.035 + w * 0.9) * (10 + w * 3);
        if (x === 20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (item.artTheme === 'highway') {
    // Sunset Sun & Perspective Grid
    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.arc(520, 175, 62, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Geometric Cyber Matrix
    ctx.strokeStyle = hexColor;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (let r = 20; r < 90; r += 16) {
      ctx.strokeRect(515 - r, 175 - r, r * 2, r * 2);
    }
  }
  ctx.restore();

  // Title & Subtitle Typography
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px "Orbitron", sans-serif';
  ctx.fillText(item.shortTitle, 24, 96);

  ctx.fillStyle = hexColor;
  ctx.font = '600 17px "JetBrains Mono", monospace';
  ctx.fillText(item.subtitle, 24, 124);

  // Center transparent reel window cutout so you see the spinning 3D spools inside!
  ctx.clearRect(145, 146, 350, 112);
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(145, 146, 350, 112);

  // Outer border frame
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 632, 352);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function createTitlePlateTexture(item) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 110;
  const ctx = canvas.getContext('2d');

  const hexColor = '#' + item.edgeColor.toString(16).padStart(6, '0');
  ctx.fillStyle = 'rgba(8, 5, 22, 0.85)';
  ctx.fillRect(8, 8, 496, 94);

  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 496, 94);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px "Orbitron", sans-serif';
  ctx.fillText(item.shortTitle, 256, 52);

  ctx.fillStyle = hexColor;
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.fillText(item.unlocked ? `▶ CLICK TO LAUNCH` : `🔒 INCOMING PROTOTYPE`, 256, 82);

  return new THREE.CanvasTexture(canvas);
}

// ============================================================================
// 4. BUILD 3D TRANSLUCENT CASSETTE MESHES
// ============================================================================
const cassetteGroups = [];
const interactableMeshes = [];

function create3DCassette(item, index) {
  const group = new THREE.Group();
  group.userData = { index, item };

  // 1. Translucent Neon Acrylic Outer Cassette Shell
  const shellW = 3.5;
  const shellH = 2.22;
  const shellD = 0.36;
  const shellGeo = new THREE.BoxGeometry(shellW, shellH, shellD);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: item.shellColor,
    transparent: true,
    opacity: 0.46,
    roughness: 0.14,
    metalness: 0.12,
    transmission: 0.45,
    thickness: 0.5,
    emissive: item.shellColor,
    emissiveIntensity: 0.15
  });
  const shellMesh = new THREE.Mesh(shellGeo, shellMat);
  shellMesh.userData = { cassetteIndex: index };
  group.add(shellMesh);
  interactableMeshes.push(shellMesh);

  // Glowing neon wireframe edges on the translucent shell
  const edgesGeo = new THREE.EdgesGeometry(shellGeo);
  const edgesMat = new THREE.LineBasicMaterial({
    color: item.edgeColor,
    transparent: true,
    opacity: 0.85
  });
  const edgesLine = new THREE.LineSegments(edgesGeo, edgesMat);
  group.add(edgesLine);

  // 2. Bottom Trapezoid Head Shield Bump
  const bumpGeo = new THREE.BoxGeometry(2.25, 0.38, 0.44);
  const bumpMesh = new THREE.Mesh(bumpGeo, shellMat);
  bumpMesh.position.set(0, -shellH / 2 + 0.2, 0);
  bumpMesh.userData = { cassetteIndex: index };
  group.add(bumpMesh);
  interactableMeshes.push(bumpMesh);

  const bumpEdges = new THREE.LineSegments(new THREE.EdgesGeometry(bumpGeo), edgesMat);
  bumpEdges.position.copy(bumpMesh.position);
  group.add(bumpEdges);

  // 3. Front Cover Art Sticker Label (with transparent center window)
  const labelGeo = new THREE.PlaneGeometry(3.15, 1.72);
  const labelMat = new THREE.MeshBasicMaterial({
    map: createCoverArtTexture(item),
    transparent: true
  });
  const labelMesh = new THREE.Mesh(labelGeo, labelMat);
  labelMesh.position.set(0, 0.08, shellD / 2 + 0.008);
  labelMesh.userData = { cassetteIndex: index };
  group.add(labelMesh);
  interactableMeshes.push(labelMesh);

  // 4. Two Internal Spinning Tape Spools & Magnetic Tape Reels (visible inside shell!)
  const spools = [];
  const spoolOuterGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.26, 24);
  spoolOuterGeo.rotateX(Math.PI / 2);
  const tapePackMat = new THREE.MeshStandardMaterial({
    color: 0x080612,
    roughness: 0.5,
    metalness: 0.6
  });

  const hubGeo = new THREE.TorusGeometry(0.24, 0.045, 8, 18);
  const hubMat = new THREE.MeshBasicMaterial({ color: item.edgeColor });

  const toothGeo = new THREE.BoxGeometry(0.06, 0.14, 0.28);

  [-0.78, 0.78].forEach((xSpool, sIdx) => {
    const spoolGroup = new THREE.Group();
    spoolGroup.position.set(xSpool, -0.02, 0);

    // Dark magnetic tape pack (left reel fuller than right reel for realism)
    const packScale = sIdx === 0 ? 1.12 : 0.86;
    const tapePack = new THREE.Mesh(spoolOuterGeo, tapePackMat);
    tapePack.scale.set(packScale, packScale, 1);
    spoolGroup.add(tapePack);

    // Glowing inner spool ring
    const hub = new THREE.Mesh(hubGeo, hubMat);
    spoolGroup.add(hub);

    // 6 radial drive teeth inside the spool
    for (let t = 0; t < 6; t++) {
      const angle = (t / 6) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, hubMat);
      tooth.position.set(Math.cos(angle) * 0.17, Math.sin(angle) * 0.17, 0);
      tooth.rotation.z = angle;
      spoolGroup.add(tooth);
    }

    group.add(spoolGroup);
    spools.push(spoolGroup);
  });

  // 5. Four Corner Metallic Screws
  const screwGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.38, 10);
  screwGeo.rotateX(Math.PI / 2);
  const screwMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [
    [-1.58, 0.95],
    [1.58, 0.95],
    [-1.58, -0.95],
    [1.58, -0.95]
  ].forEach(([sx, sy]) => {
    const screw = new THREE.Mesh(screwGeo, screwMat);
    screw.position.set(sx, sy, 0);
    group.add(screw);
  });

  // 6. Floating 3D Holographic Title Plate underneath the cassette
  const plateGeo = new THREE.PlaneGeometry(3.1, 0.66);
  const plateMat = new THREE.MeshBasicMaterial({
    map: createTitlePlateTexture(item),
    transparent: true
  });
  const plateMesh = new THREE.Mesh(plateGeo, plateMat);
  plateMesh.position.set(0, -1.62, 0.1);
  plateMesh.userData = { cassetteIndex: index };
  group.add(plateMesh);
  interactableMeshes.push(plateMesh);

  scene.add(group);
  return {
    group,
    shellMat,
    edgesMat,
    spools,
    item,
    index
  };
}

CASSETTES.forEach((item, idx) => {
  cassetteGroups.push(create3DCassette(item, idx));
});

// ============================================================================
// 5. INTERACTION, HOVER, CAROUSEL SELECTION & SOUND EFFECTS
// ============================================================================
let activeIndex = 0;
let hoveredIndex = null;
let isInserting = false;
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

const slotIdEl = document.getElementById('tape-slot-id');
const statusTagEl = document.getElementById('tape-status-tag');
const titleEl = document.getElementById('tape-title');
const descEl = document.getElementById('tape-desc');
const btnInsert = document.getElementById('btn-insert-tape');
const insertBtnLabel = document.getElementById('insert-btn-label');
const btnPrev = document.getElementById('btn-prev-tape');
const btnNext = document.getElementById('btn-next-tape');
const infoCardEl = document.getElementById('tape-info-card');

let sfxCtx = null;
function playVaultSfx(type = 'tick') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!sfxCtx) sfxCtx = new AudioCtx();
    if (sfxCtx.state === 'suspended') sfxCtx.resume();
    const now = sfxCtx.currentTime;

    if (type === 'tick') {
      const osc = sfxCtx.createOscillator();
      const gain = sfxCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.045);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(sfxCtx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (type === 'insert') {
      // Tactile cassette mechanical latch + dark synth Db major chord swell
      [277.18, 349.23, 415.3, 554.37].forEach((freq, i) => {
        const osc = sfxCtx.createOscillator();
        const gain = sfxCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(0.08, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(gain);
        gain.connect(sfxCtx.destination);
        osc.start(now + i * 0.04);
        osc.stop(now + 0.58);
      });
    }
  } catch {
    // Ignore audio context restrictions
  }
}

function selectCassette(index) {
  activeIndex = (index + CASSETTES.length) % CASSETTES.length;
  const item = CASSETTES[activeIndex];
  const hexColor = '#' + item.edgeColor.toString(16).padStart(6, '0');

  slotIdEl.textContent = item.id;
  slotIdEl.style.color = hexColor;
  statusTagEl.textContent = item.status;
  statusTagEl.classList.toggle('locked', !item.unlocked);
  titleEl.textContent = item.title;
  descEl.textContent = item.desc;
  infoCardEl.style.borderColor = hexColor;

  if (item.unlocked) {
    btnInsert.disabled = false;
    insertBtnLabel.textContent = `▶ INSERT & PLAY TAPE`;
  } else {
    btnInsert.disabled = true;
    insertBtnLabel.textContent = `🔒 INCOMING PROTOTYPE`;
  }
}

function launchActiveCassette() {
  const item = CASSETTES[activeIndex];
  if (!item.unlocked || !item.url || isInserting) return;
  isInserting = true;
  playVaultSfx('insert');
  insertBtnLabel.textContent = '⏳ LOADING TAPE DECK...';
  document.body.classList.add('warping-to-vault');
  setTimeout(() => {
    window.location.href = item.url;
  }, 560);
}

selectCassette(0);

btnPrev.addEventListener('click', () => {
  playVaultSfx('tick');
  selectCassette(activeIndex - 1);
});

btnNext.addEventListener('click', () => {
  playVaultSfx('tick');
  selectCassette(activeIndex + 1);
});

btnInsert.addEventListener('click', launchActiveCassette);

// Mouse Hover Raycasting
window.addEventListener('mousemove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactableMeshes, false);
  if (hits.length > 0) {
    const idx = hits[0].object.userData.cassetteIndex;
    if (hoveredIndex !== idx) {
      hoveredIndex = idx;
      document.body.style.cursor = 'pointer';
      playVaultSfx('tick');
    }
  } else {
    hoveredIndex = null;
    document.body.style.cursor = 'default';
  }
});

// Click / Tap on 3D Cassette
let touchStartX = null;
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, a, .tape-info-card')) return;
  touchStartX = e.clientX;
});

window.addEventListener('pointerup', (e) => {
  if (e.target.closest('button, a, .tape-info-card')) return;

  if (touchStartX !== null && Math.abs(e.clientX - touchStartX) > 48) {
    // Horizontal swipe on mobile / Fold 8 cycles tapes!
    playVaultSfx('tick');
    if (e.clientX < touchStartX) selectCassette(activeIndex + 1);
    else selectCassette(activeIndex - 1);
    touchStartX = null;
    return;
  }
  touchStartX = null;

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactableMeshes, false);

  if (hits.length > 0) {
    const clickedIdx = hits[0].object.userData.cassetteIndex;
    if (clickedIdx === activeIndex) {
      launchActiveCassette();
    } else {
      playVaultSfx('tick');
      selectCassette(clickedIdx);
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    playVaultSfx('tick');
    selectCassette(activeIndex - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    playVaultSfx('tick');
    selectCassette(activeIndex + 1);
  } else if (e.key === 'Enter' || e.key === ' ') {
    launchActiveCassette();
  }
});

// ============================================================================
// 6. ANIMATION LOOP (3D CAROUSEL, HOVER TILT & SPINNING TAPE REELS)
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  // Adaptive spacing & camera distance for Folded / Unfolded / Desktop screens
  const isCompact = camera.aspect < 1.1;
  const targetCamZ = isCompact ? 9.4 : 7.4;
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, dt * 5);

  const spacingX = isCompact ? 3.45 : 4.25;

  cassetteGroups.forEach((cg, idx) => {
    const offset = idx - activeIndex;
    const isSelected = idx === activeIndex;
    const isHovered = idx === hoveredIndex;

    const targetX = offset * spacingX;
    let targetY = 0.72 + Math.sin(elapsed * 2.2 + idx * 1.1) * 0.08;
    let targetZ = isSelected ? 1.35 : -Math.abs(offset) * 1.35;

    if (isHovered) {
      targetY += 0.18;
      targetZ += 0.42;
    }

    if (isInserting && isSelected) {
      targetY -= 1.8;
      targetZ += 1.6;
    }

    cg.group.position.x = THREE.MathUtils.lerp(cg.group.position.x, targetX, dt * 6.5);
    cg.group.position.y = THREE.MathUtils.lerp(cg.group.position.y, targetY, dt * 6.5);
    cg.group.position.z = THREE.MathUtils.lerp(cg.group.position.z, targetZ, dt * 6.5);

    // 3D Hover & Active Tilt
    let targetRotY = -offset * 0.34;
    let targetRotX = 0;
    if (isSelected || isHovered) {
      targetRotY += pointer.x * 0.28;
      targetRotX = -pointer.y * 0.22;
    }

    cg.group.rotation.y = THREE.MathUtils.lerp(cg.group.rotation.y, targetRotY, dt * 7);
    cg.group.rotation.x = THREE.MathUtils.lerp(cg.group.rotation.x, targetRotX, dt * 7);

    // Glow intensity & spinning tape spools inside the translucent shell
    const reelSpeed = (isSelected || isHovered) ? 3.2 : 0.45;
    cg.spools.forEach((s) => {
      s.rotation.z -= reelSpeed * dt;
    });

    cg.shellMat.opacity = (isSelected || isHovered) ? 0.62 : 0.36;
    cg.shellMat.emissiveIntensity = isHovered ? 0.38 : (isSelected ? 0.22 : 0.08);
  });

  dustParticles.rotation.y = elapsed * 0.03;
  composer.render();
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
