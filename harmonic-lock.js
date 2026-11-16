// Tape No. 09: Harmonic Lock — Game Director, Phosphor-Vector Synesthesia HUD,
// Chase-Spline Camera Rig, HDR Bloom Post-Processing & 16th-Note Paint-Lock Integrator.
// Integrates ./harmonic-lock/world.js, ./harmonic-lock/combat.js, and ./harmonic-lock/audio.js.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createHarmonicWorld } from './harmonic-lock/world.js';
import { createHarmonicCombat } from './harmonic-lock/combat.js';
import { createHarmonicAudio } from './harmonic-lock/audio.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const BASE_FOV_DEG = 62;
const SURGE_FOV_DEG = 76;
const CAM_TRAIL_METERS = 14.5;
const CAM_LOOKAHEAD_METERS = 28.0;

const CHAIN_MULTIPLIERS = Object.freeze([
  1.0, 1.0, 1.3, 1.6, 2.0, 2.4, 2.8, 3.3, 4.0
]);

const AREA_UI_META = Object.freeze([
  {
    code: 'AREA 01',
    name: 'PHOSPHOR LATTICE',
    primary: '#00f0ff',
    secondary: '#1d4ed8',
    durationSec: 32
  },
  {
    code: 'AREA 02',
    name: 'FOURIER CATHEDRAL',
    primary: '#ffd166',
    secondary: '#ff2a85',
    durationSec: 34
  },
  {
    code: 'AREA 03',
    name: 'SUBSPACE CONDUIT',
    primary: '#1affb2',
    secondary: '#9d4edd',
    durationSec: 34
  },
  {
    code: 'AREA 04',
    name: 'SINGULARITY CORE',
    primary: '#ff2a6d',
    secondary: '#e8f9ff',
    durationSec: 60
  }
]);

const FORM_HUD_LABELS = Object.freeze({
  1: 'FORM I · VECTOR DART',
  2: 'FORM II · VALKYRIE',
  3: 'FORM III · SERAPH'
});

const BOSS_PHASE_LABELS = Object.freeze({
  1: 'PHASE I · ICOSAHEDRAL CAGE',
  2: 'PHASE II · HARMONIC WINGS',
  3: 'PHASE III · SINGULARITY CORE'
});

const BRACKET_POOL_SIZE = 28;
const FILAMENT_POOL_SIZE = 8;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteOr(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function formatScore(score) {
  const safe = Math.max(0, Math.round(finiteOr(score, 0)));
  return String(safe).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---------------------------------------------------------------------------
// 1. DOM ELEMENT BINDINGS (100% 1:1 WITH harmonic-lock.html)
// ---------------------------------------------------------------------------
const doc = typeof document !== 'undefined' ? document : null;
const win = typeof window !== 'undefined' ? window : globalThis;
const byId = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);

const ui = {
  canvasContainer: byId('canvas-container'),
  hudRoot: byId('hud-root'),
  screenFlash: byId('screen-flash'),

  // Dynamic 2D SVG Reticle & Lock-On Bracket Layer
  reticleLayer: byId('hud-reticle-layer'),
  lockFilaments: byId('hud-lock-filaments'),
  targetBrackets: byId('hud-target-brackets'),
  reticleCursor: byId('hud-reticle-cursor'),
  reticleBeatRing: byId('reticle-beat-ring'),
  reticleOuterOctagon: byId('reticle-outer-octagon'),
  reticleInnerOctagon: byId('reticle-inner-octagon'),
  reticleOctetNodes: byId('reticle-octet-nodes'),
  reticleReadoutText: byId('reticle-readout-text'),

  // Top Vector Telemetry Bar
  linkArchive: byId('link-archive'),
  beatLed: byId('beat-led'),
  spectrumCanvas: byId('hud-spectrum'),
  areaIndicator: byId('area-indicator'),
  areaCode: byId('area-code'),
  areaName: byId('area-name'),
  areaPips: [
    byId('area-pip-0'),
    byId('area-pip-1'),
    byId('area-pip-2'),
    byId('area-pip-3')
  ],
  scoreValue: byId('score-value'),
  chainValue: byId('chain-value'),
  multiplierBadge: byId('multiplier-badge'),
  syncValue: byId('sync-value'),
  rankBadge: byId('rank-badge'),
  btnAudioToggle: byId('btn-audio-toggle'),
  audioStatusDot: byId('audio-status-dot'),
  audioToggleLabel: byId('audio-toggle-label'),

  // Upper-Center Boss SERAPH-IX Telemetry & Banner
  bossHud: byId('boss-hud'),
  bossName: byId('boss-name'),
  bossPhaseLabel: byId('boss-phase-label'),
  bossPhasePips: [
    byId('boss-phase-1'),
    byId('boss-phase-2'),
    byId('boss-phase-3')
  ],
  bossHpFill: byId('boss-hp-fill'),
  bossPhaseHpFill: byId('boss-phase-hp-fill'),
  bossHpText: byId('boss-hp-text'),

  banner: byId('hud-banner'),
  bannerKicker: byId('hud-banner-kicker'),
  bannerTitle: byId('hud-banner-title'),

  // Bottom Flight & Synesthesia Deck
  formReadout: byId('form-readout'),
  shieldPipsWrap: byId('shield-pips'),
  shieldPips: [
    byId('shield-pip-1'),
    byId('shield-pip-2'),
    byId('shield-pip-3')
  ],
  shieldCountLabel: byId('shield-count-label'),
  evolutionBarFill: byId('evolution-bar-fill'),
  evolutionLabel: byId('evolution-label'),

  hudLockSlots: byId('hud-lock-slots'),
  lockSlotCells: [
    byId('lock-slot-0'),
    byId('lock-slot-1'),
    byId('lock-slot-2'),
    byId('lock-slot-3'),
    byId('lock-slot-4'),
    byId('lock-slot-5'),
    byId('lock-slot-6'),
    byId('lock-slot-7')
  ],
  lockOctetReadout: byId('lock-octet-readout'),

  overdriveStatus: byId('overdrive-status'),
  overdriveFill: byId('overdrive-fill'),
  btnBarrelRoll: byId('btn-barrel-roll'),
  barrelRollStatus: byId('barrel-roll-status'),
  btnOverdrive: byId('btn-overdrive'),
  overdriveBtnTag: byId('overdrive-btn-tag'),

  // Title Overlay & Synchronization Report Modal
  titleOverlay: byId('title-overlay'),
  titleHeading: byId('title-heading'),
  btnInitiate: byId('btn-initiate'),
  linkTitleArchive: byId('link-title-archive'),

  reportModal: byId('report-modal'),
  reportKicker: byId('report-kicker'),
  reportTitle: byId('report-title'),
  reportRank: byId('report-rank'),
  reportSubtitle: byId('report-subtitle'),
  reportSync: byId('report-sync'),
  reportFullLocks: byId('report-full-locks'),
  reportMaxChain: byId('report-max-chain'),
  reportScore: byId('report-score'),
  reportSummary: byId('report-summary'),
  btnResync: byId('btn-resync'),
  linkModalArchive: byId('link-modal-archive')
};

const spectrumCtx =
  ui.spectrumCanvas && typeof ui.spectrumCanvas.getContext === 'function'
    ? ui.spectrumCanvas.getContext('2d')
    : null;

function createSvgElement(tag) {
  if (doc && typeof doc.createElementNS === 'function') {
    return doc.createElementNS(SVG_NS, tag);
  }
  if (doc && typeof doc.createElement === 'function') {
    return doc.createElement(tag);
  }
  return {
    tagName: tag,
    style: {},
    dataset: {},
    children: [],
    setAttribute(k, v) {
      this[k] = String(v);
    },
    getAttribute(k) {
      return this[k] ?? null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  };
}

function setAttrSafe(el, name, value) {
  if (!el) return;
  if (typeof el.setAttribute === 'function') {
    el.setAttribute(name, String(value));
  } else {
    el[name] = String(value);
  }
}

// ---------------------------------------------------------------------------
// 2. THREE.JS RENDERER & HDR EFFECTCOMPOSER (RenderPass + Bloom + OutputPass)
// ---------------------------------------------------------------------------
const isCoarsePointer = Boolean(win.matchMedia?.('(pointer: coarse)')?.matches);

function getViewportSize() {
  return {
    w: Math.max(1, Number(win.innerWidth) || 1440),
    h: Math.max(1, Number(win.innerHeight) || 900)
  };
}

const initVp = getViewportSize();
const scene = new THREE.Scene();
if (typeof THREE.Color === 'function') {
  scene.background = new THREE.Color(0x03050c);
}

const camera = new THREE.PerspectiveCamera(BASE_FOV_DEG, initVp.w / initVp.h, 0.35, 1800);
camera.position.set(0, 1.8, 14.5);

let renderer = null;
let composer = null;
let renderPass = null;
let bloomPass = null;
let outputPass = null;

try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio?.(Math.min(Number(win.devicePixelRatio) || 1, isCoarsePointer ? 1.75 : 2.0));
  renderer.setSize?.(initVp.w, initVp.h);
  if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  if ('toneMappingExposure' in renderer) {
    renderer.toneMappingExposure = 1.08;
  }
  if (ui.canvasContainer && renderer.domElement && typeof ui.canvasContainer.appendChild === 'function') {
    ui.canvasContainer.appendChild(renderer.domElement);
  }
} catch (_) {
  renderer = {
    domElement: doc?.createElement ? doc.createElement('canvas') : {},
    toneMappingExposure: 1.08,
    setSize() {},
    setPixelRatio() {},
    render() {}
  };
}

try {
  if (renderer && typeof renderer.render === 'function' && renderer.capabilities) {
    if (typeof THREE.WebGLRenderTarget === 'function' && THREE.HalfFloatType !== undefined) {
      const rt = new THREE.WebGLRenderTarget(initVp.w, initVp.h, {
        samples: isCoarsePointer ? 0 : 4,
        type: THREE.HalfFloatType
      });
      composer = new EffectComposer(renderer, rt);
    } else {
      composer = new EffectComposer(renderer);
    }

    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    bloomPass = new UnrealBloomPass(new THREE.Vector2(initVp.w, initVp.h), 0.62, 0.46, 0.72);
    composer.addPass(bloomPass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);
  }
} catch (_) {
  composer = null;
}

// ---------------------------------------------------------------------------
// 3. SUBSYSTEM INSTANTIATION (WORLD + COMBAT + 124 BPM WEB AUDIO)
// ---------------------------------------------------------------------------
const world = createHarmonicWorld({ THREE, scene });
const combat = createHarmonicCombat();
const audio = createHarmonicAudio();

// ---------------------------------------------------------------------------
// 4. DIRECTOR STATE, CHASE CAMERA RIG & SVG LOCK-ON POOL
// ---------------------------------------------------------------------------
let isMuted = false;
let totalElapsed = 0;
let bannerTimer = 0;
let flashTimer = 0;
let lastPhaseRendered = 'title';
let lastLayerArea = -1;
let lastLayerStage = -1;
let lastProjections = [];
let lastLockedBracketCount = 0;

const camRig = {
  offsetX: 0,
  offsetY: 1.8,
  leadX: 0,
  leadY: 0.35,
  rollRad: 0,
  fov: BASE_FOV_DEG,
  shake: 0
};

const tmpCamPos = new THREE.Vector3();
const tmpCamUp = new THREE.Vector3();
const tmpLookAhead = new THREE.Vector3();

// Input state (Mouse / Touch Paint-Lock + Keyboard Dodge / Lock / Roll / Overdrive)
const keysHeld = new Set();
const pointerState = {
  hasMoved: false,
  ndcX: 0,
  ndcY: 0,
  isDown: false,
  activePointerId: null
};
let keyboardLockHeld = false;

// Build 8 radial mini-octagon nodes around #reticle-octet-nodes + 28 target brackets + 8 filaments
const reticleOctetPolys = [];
const bracketPool = [];
const filamentPool = [];

function buildMiniOctagonPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const ang = -Math.PI * 0.5 + (i / 8) * Math.PI * 2;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function initSvgReticlePools() {
  if (ui.reticleOctetNodes && typeof ui.reticleOctetNodes.appendChild === 'function') {
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI * 0.5 + (i / 8) * Math.PI * 2;
      const nx = Math.cos(ang) * 37;
      const ny = Math.sin(ang) * 37;
      const poly = createSvgElement('polygon');
      setAttrSafe(poly, 'points', buildMiniOctagonPoints(nx, ny, 4.2));
      setAttrSafe(poly, 'fill', 'rgba(0, 240, 255, 0.08)');
      setAttrSafe(poly, 'stroke', '#00f0ff');
      setAttrSafe(poly, 'stroke-width', '1.1');
      setAttrSafe(poly, 'stroke-opacity', '0.35');
      ui.reticleOctetNodes.appendChild(poly);
      reticleOctetPolys.push(poly);
    }
  }

  if (ui.lockFilaments && typeof ui.lockFilaments.appendChild === 'function') {
    for (let i = 0; i < FILAMENT_POOL_SIZE; i++) {
      const line = createSvgElement('line');
      setAttrSafe(line, 'x1', '0');
      setAttrSafe(line, 'y1', '0');
      setAttrSafe(line, 'x2', '0');
      setAttrSafe(line, 'y2', '0');
      setAttrSafe(line, 'stroke', '#00f0ff');
      setAttrSafe(line, 'stroke-width', '1.15');
      setAttrSafe(line, 'stroke-dasharray', '5 4');
      setAttrSafe(line, 'visibility', 'hidden');
      if (line.style) line.style.display = 'none';
      ui.lockFilaments.appendChild(line);
      filamentPool.push(line);
    }
  }

  if (ui.targetBrackets && typeof ui.targetBrackets.appendChild === 'function') {
    for (let i = 0; i < BRACKET_POOL_SIZE; i++) {
      const group = createSvgElement('g');
      setAttrSafe(group, 'visibility', 'hidden');
      if (group.style) group.style.display = 'none';

      const outerDiamond = createSvgElement('polygon');
      setAttrSafe(outerDiamond, 'points', '0,-24 24,0 0,24 -24,0');
      setAttrSafe(outerDiamond, 'fill', 'none');
      setAttrSafe(outerDiamond, 'stroke', '#00f0ff');
      setAttrSafe(outerDiamond, 'stroke-width', '1.8');

      const innerDiamond = createSvgElement('polygon');
      setAttrSafe(innerDiamond, 'points', '0,-16 16,0 0,16 -16,0');
      setAttrSafe(innerDiamond, 'fill', 'none');
      setAttrSafe(innerDiamond, 'stroke', '#ffd166');
      setAttrSafe(innerDiamond, 'stroke-width', '1.2');
      setAttrSafe(innerDiamond, 'visibility', 'hidden');

      const label = createSvgElement('text');
      setAttrSafe(label, 'x', '0');
      setAttrSafe(label, 'y', '-30');
      setAttrSafe(label, 'text-anchor', 'middle');
      setAttrSafe(label, 'fill', '#ffd166');
      setAttrSafe(label, 'font-family', 'Orbitron, JetBrains Mono, monospace');
      setAttrSafe(label, 'font-size', '10.5');
      setAttrSafe(label, 'font-weight', '800');
      setAttrSafe(label, 'letter-spacing', '1');
      label.textContent = '';

      group.appendChild(outerDiamond);
      group.appendChild(innerDiamond);
      group.appendChild(label);
      ui.targetBrackets.appendChild(group);

      bracketPool.push({
        group,
        outerDiamond,
        innerDiamond,
        label
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 5. SYNESTHETIC SCREEN FLASH, BANNERS & COMBAT EVENT WIRING
// ---------------------------------------------------------------------------
function showBanner(kicker, title, tone = 'cyan', durationSec = 2.3) {
  bannerTimer = Math.max(0.2, finiteOr(durationSec, 2.3));
  if (ui.bannerKicker) ui.bannerKicker.textContent = kicker;
  if (ui.bannerTitle) ui.bannerTitle.textContent = title;
  if (ui.banner?.dataset) {
    ui.banner.dataset.tone = tone;
    ui.banner.dataset.visible = 'true';
  }
}

function triggerScreenFlash(kind = 'cyan', intensity = 0.42, durationSec = 0.28) {
  flashTimer = Math.max(flashTimer, finiteOr(durationSec, 0.28));
  if (!ui.screenFlash?.style) return;

  let colorRgba = 'rgba(0, 240, 255, 0.36)';
  if (kind === 'damage') {
    colorRgba = 'rgba(255, 42, 109, 0.52)';
  } else if (kind === 'gold') {
    colorRgba = 'rgba(255, 209, 102, 0.44)';
  } else if (kind === 'overdrive') {
    colorRgba = 'rgba(255, 42, 133, 0.42)';
  } else if (kind === 'victory') {
    colorRgba = 'rgba(232, 249, 255, 0.65)';
  }

  ui.screenFlash.style.background = `radial-gradient(circle at 50% 50%, ${colorRgba}, transparent 74%)`;
  ui.screenFlash.style.opacity = String(clamp(intensity, 0, 0.95));
}

function applyAreaThemeCss(areaIndex) {
  const idx = clamp(Math.round(finiteOr(areaIndex, 0)), 0, 3);
  const meta = AREA_UI_META[idx];
  const rootStyle = doc?.documentElement?.style;
  if (rootStyle && typeof rootStyle.setProperty === 'function') {
    rootStyle.setProperty('--area-primary', meta.primary);
    rootStyle.setProperty('--area-secondary', meta.secondary);
  }
}

function syncAudioLayers(areaIndex, evolutionStage, force = false) {
  const safeArea = clamp(Math.round(finiteOr(areaIndex, 0)), 0, 3);
  const safeStage = clamp(Math.round(finiteOr(evolutionStage, 1)), 1, 3);
  if (force || safeArea !== lastLayerArea || safeStage !== lastLayerStage) {
    lastLayerArea = safeArea;
    lastLayerStage = safeStage;
    audio.setLayerState(safeArea, safeStage);
  }
}

combat.onEvent = (ev) => {
  if (!ev || !ev.type) return;
  const beatPhase = finiteOr(audio.getBeatPhase(), 0);

  switch (ev.type) {
    case 'lock_acquired': {
      if (!isMuted) {
        audio.playLockTick(ev.slotIndex ?? 0);
      }
      if (ev.lockCount === 8) {
        showBanner('FULL HARMONIC OCTET', '8 / 8 LOCKS PAINTED · 4.0x READY', 'gold', 1.35);
      }
      break;
    }

    case 'salvo_released': {
      const originWorld = world.corridorToWorld(
        finiteOr(ev.playerDist, 0),
        finiteOr(ev.playerX, 0),
        finiteOr(ev.playerY, 0)
      );
      world.triggerSalvoVfx(originWorld, ev.targets || [], ev.lockCount || 1);
      if (!isMuted) {
        audio.playSalvoRelease(ev.lockCount || 1);
      }
      if (ev.isFullLock || ev.lockCount >= 8) {
        triggerScreenFlash('gold', 0.32, 0.22);
        camRig.shake = Math.max(camRig.shake, 0.22);
        showBanner('QUANTIZED 16TH SALVO', 'MAX HARMONIC OCTET · 4.0x', 'gold', 1.6);
      }
      break;
    }

    case 'vulcan_fired': {
      const originWorld = world.corridorToWorld(
        finiteOr(ev.playerDist, 0),
        finiteOr(ev.playerX, 0),
        finiteOr(ev.playerY, 0)
      );
      const aimWorld = world.corridorToWorld(
        finiteOr(ev.aimDist, finiteOr(ev.playerDist, 0) + 58),
        finiteOr(ev.aimX, 0),
        finiteOr(ev.aimY, 0)
      );
      world.triggerVulcanVfx(originWorld, aimWorld);
      if (!isMuted) {
        audio.playVulcanTap();
      }
      break;
    }

    case 'target_destroyed': {
      const hitWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      world.triggerExplosionVfx(hitWorld, 'enemy', beatPhase);
      if (!isMuted) {
        audio.playTargetDetonation(ev.slotIndex ?? 0, 'enemy');
      }
      break;
    }

    case 'boss_node_destroyed': {
      const nodeWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      const vfxKind = ev.kind === 'boss' ? 'boss' : 'node';
      world.triggerExplosionVfx(nodeWorld, vfxKind, beatPhase);
      if (!isMuted) {
        audio.playTargetDetonation(ev.slotIndex ?? 0, vfxKind);
      }
      camRig.shake = Math.max(camRig.shake, ev.kind === 'boss' ? 0.85 : 0.42);
      triggerScreenFlash('gold', ev.kind === 'boss' ? 0.68 : 0.36, 0.3);
      break;
    }

    case 'boss_phase_changed': {
      const bossWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      world.triggerExplosionVfx(bossWorld, 'node', beatPhase);
      if (!isMuted) {
        audio.playAreaTransitionSfx(3);
      }
      camRig.shake = Math.max(camRig.shake, 0.52);
      const phaseTitle = BOSS_PHASE_LABELS[ev.phase] || `PHASE ${ev.phase}`;
      showBanner('SERAPH-IX METAMORPHOSIS', phaseTitle, 'magenta', 2.6);
      break;
    }

    case 'barrel_roll': {
      if (!isMuted) {
        audio.playBarrelRollSfx();
      }
      break;
    }

    case 'bolt_deflected': {
      const deflectWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      world.triggerExplosionVfx(deflectWorld, 'deflect', beatPhase);
      if (!isMuted) {
        audio.playDeflectSfx();
      }
      if (ev.overdriveGain > 0) {
        showBanner('BARREL ROLL DEFLECT', '+250 PTS · +8% OVERDRIVE', 'cyan', 1.2);
      }
      break;
    }

    case 'evolution_changed': {
      const stage = clamp(Math.round(finiteOr(ev.stage ?? ev.evolutionStage, 1)), 1, 3);
      const areaIdx = clamp(Math.round(finiteOr(ev.areaIndex, combat.getState().areaIndex)), 0, 3);
      syncAudioLayers(areaIdx, stage, true);

      const craftWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      world.triggerExplosionVfx(craftWorld, ev.upgraded !== false ? 'node' : 'deflect', beatPhase);

      if (ev.upgraded !== false) {
        if (!isMuted) {
          audio.playEvolutionSfx(stage);
        }
        triggerScreenFlash('cyan', 0.38, 0.28);
        showBanner('SYNESTHETIC EVOLUTION', FORM_HUD_LABELS[stage] || 'EVOLUTION UP', 'gold', 2.4);
      } else {
        showBanner('SHIELD OVERLOAD', `STEP-DOWN -> ${FORM_HUD_LABELS[stage]}`, 'magenta', 2.1);
      }
      break;
    }

    case 'player_hit': {
      if (!isMuted) {
        audio.playDamageSfx();
      }
      camRig.shake = Math.max(camRig.shake, 0.62);
      triggerScreenFlash('damage', 0.56, 0.34);
      break;
    }

    case 'overdrive_triggered': {
      const odWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      world.triggerExplosionVfx(odWorld, 'overdrive', beatPhase);
      if (!isMuted) {
        audio.playOverdriveSfx();
      }
      camRig.shake = Math.max(camRig.shake, 0.48);
      triggerScreenFlash('overdrive', 0.54, 0.38);
      showBanner('OVERDRIVE RESONANCE', 'HARMONIC CASCADE WAVE ENGAGED', 'magenta', 2.6);
      break;
    }

    case 'area_changed': {
      const areaIdx = clamp(Math.round(finiteOr(ev.areaIndex, 0)), 0, 3);
      const evoStage = clamp(
        Math.round(finiteOr(ev.evolutionStage, combat.getState().player?.evolutionStage ?? 1)),
        1,
        3
      );
      world.setArea(areaIdx);
      applyAreaThemeCss(areaIdx);
      syncAudioLayers(areaIdx, evoStage, true);

      if (!isMuted) {
        audio.playAreaTransitionSfx(areaIdx);
      }
      if (areaIdx > 0) {
        triggerScreenFlash('cyan', 0.34, 0.32);
      }
      const meta = AREA_UI_META[areaIdx];
      showBanner(
        areaIdx === 3 ? 'SINGULARITY DETECTED // SERAPH-IX' : 'CORRIDOR PHASE SHIFT',
        `${meta.code} // ${meta.name}`,
        areaIdx === 3 ? 'magenta' : 'cyan',
        2.8
      );
      break;
    }

    case 'victory': {
      const vicWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      world.triggerExplosionVfx(vicWorld, 'boss', beatPhase);
      if (!isMuted) {
        audio.playVictorySfx();
      }
      camRig.shake = Math.max(camRig.shake, 0.72);
      triggerScreenFlash('victory', 0.72, 0.55);
      break;
    }

    case 'defeat': {
      const defWorld = world.corridorToWorld(
        finiteOr(ev.dist, 0),
        finiteOr(ev.x, 0),
        finiteOr(ev.y, 0)
      );
      world.triggerExplosionVfx(defWorld, 'enemy', beatPhase);
      camRig.shake = Math.max(camRig.shake, 0.75);
      triggerScreenFlash('damage', 0.72, 0.55);
      break;
    }

    default:
      break;
  }
};

// ---------------------------------------------------------------------------
// 6. CHASE CAMERA RIG (SPLINE FOLLOW, DODGE ROLL BANK & 62°->76° FOV SURGE)
// ---------------------------------------------------------------------------
function updateCameraRig(state, dt, snap = false) {
  const safeDt = clamp(finiteOr(dt, 1 / 60), 0.0005, 0.1);
  const corridorDist = finiteOr(state?.corridorDist, 0);
  const player = state?.player || {};
  const reticle = state?.reticle || { x: 0, y: 0 };

  const targetOffsetX = finiteOr(player.x, 0) * 0.52;
  const targetOffsetY = finiteOr(player.y, 0) * 0.52 + 1.8;

  const targetLeadX = finiteOr(player.x, 0) * 0.22 + finiteOr(reticle.x, 0) * 1.45;
  const targetLeadY = finiteOr(player.y, 0) * 0.22 + 0.35 + finiteOr(reticle.y, 0) * 0.95;

  // Sympathetic roll bank when dodging laterally
  const vx = finiteOr(player.vx, 0);
  const px = finiteOr(player.x, 0);
  const targetRollRad = clamp(vx * 0.0095 + px * 0.0045, -0.18, 0.18);

  // FOV surge (62° cruise -> 76° during Area transitions & Overdrive!)
  const areaSurge = clamp(finiteOr(state?.areaTransitionTimer, 0) / 1.4, 0, 1);
  const overdriveSurge = finiteOr(state?.overdriveTimer, 0) > 0 ? 1.0 : 0.0;
  const surgeWeight = Math.max(areaSurge, overdriveSurge);
  const targetFov = lerp(BASE_FOV_DEG, SURGE_FOV_DEG, surgeWeight);

  if (snap) {
    camRig.offsetX = targetOffsetX;
    camRig.offsetY = targetOffsetY;
    camRig.leadX = targetLeadX;
    camRig.leadY = targetLeadY;
    camRig.rollRad = targetRollRad;
    camRig.fov = targetFov;
  } else {
    const followAlpha = 1 - Math.exp(-14.0 * safeDt);
    const rollAlpha = 1 - Math.exp(-11.0 * safeDt);
    const fovAlpha = 1 - Math.exp(-7.5 * safeDt);

    camRig.offsetX = lerp(camRig.offsetX, targetOffsetX, followAlpha);
    camRig.offsetY = lerp(camRig.offsetY, targetOffsetY, followAlpha);
    camRig.leadX = lerp(camRig.leadX, targetLeadX, followAlpha);
    camRig.leadY = lerp(camRig.leadY, targetLeadY, followAlpha);
    camRig.rollRad = lerp(camRig.rollRad, targetRollRad, rollAlpha);
    camRig.fov = lerp(camRig.fov, targetFov, fovAlpha);
  }

  // Decay micro-shake cleanly
  let shakeX = 0;
  let shakeY = 0;
  if (camRig.shake > 0.001) {
    camRig.shake = Math.max(0, camRig.shake - safeDt * 2.6);
    const amp = camRig.shake * 0.42;
    shakeX = Math.sin(totalElapsed * 53.0) * amp;
    shakeY = Math.cos(totalElapsed * 61.0) * amp;
  } else {
    camRig.shake = 0;
  }

  // Position chase camera at corridorDist - 14.5 following (player.x * 0.52, player.y * 0.52 + 1.8)
  const camSample = world.sampleCorridor(corridorDist - CAM_TRAIL_METERS);
  const ox = camRig.offsetX + shakeX;
  const oy = camRig.offsetY + shakeY;

  tmpCamPos.set(
    finiteOr(camSample.point.x + camSample.right.x * ox + camSample.up.x * oy, 0),
    finiteOr(camSample.point.y + camSample.right.y * ox + camSample.up.y * oy, 1.8),
    finiteOr(camSample.point.z + camSample.right.z * ox + camSample.up.z * oy, 14.5)
  );

  // Look ahead down the spline at corridorDist + 28
  const aheadSample = world.sampleCorridor(corridorDist + CAM_LOOKAHEAD_METERS);
  tmpLookAhead.set(
    finiteOr(
      aheadSample.point.x +
        aheadSample.right.x * camRig.leadX +
        aheadSample.up.x * camRig.leadY,
      0
    ),
    finiteOr(
      aheadSample.point.y +
        aheadSample.right.y * camRig.leadX +
        aheadSample.up.y * camRig.leadY,
      0
    ),
    finiteOr(
      aheadSample.point.z +
        aheadSample.right.z * camRig.leadX +
        aheadSample.up.z * camRig.leadY,
      -28
    )
  );

  // Rotate corridor up vector by dodge bank angle
  const cosR = Math.cos(camRig.rollRad);
  const sinR = Math.sin(camRig.rollRad);
  tmpCamUp.set(
    finiteOr(camSample.up.x * cosR + camSample.right.x * sinR, 0),
    finiteOr(camSample.up.y * cosR + camSample.right.y * sinR, 1),
    finiteOr(camSample.up.z * cosR + camSample.right.z * sinR, 0)
  );
  if (typeof tmpCamUp.normalize === 'function') {
    tmpCamUp.normalize();
  }

  camera.position.set(tmpCamPos.x, tmpCamPos.y, tmpCamPos.z);
  if (camera.up && typeof camera.up.set === 'function') {
    camera.up.set(tmpCamUp.x, tmpCamUp.y, tmpCamUp.z);
  }
  if (typeof camera.lookAt === 'function') {
    camera.lookAt(tmpLookAhead);
  }

  if (Math.abs(finiteOr(camera.fov, BASE_FOV_DEG) - camRig.fov) > 0.01) {
    camera.fov = camRig.fov;
    camera.updateProjectionMatrix?.();
  }
  camera.updateMatrixWorld?.(true);
}

// ---------------------------------------------------------------------------
// 7. HDR BLOOM BEAT-PULSE MODULATION & 2D SVG LOCK-ON HUD RENDERING
// ---------------------------------------------------------------------------
function updateBloomAndSpectrum(state, beatPhase) {
  const bp = ((finiteOr(beatPhase, 0) % 1) + 1) % 1;
  const beatPulse = Math.pow(1.0 - bp, 2.2);
  const isOverdrive = finiteOr(state?.overdriveTimer, 0) > 0;
  const isTransition = finiteOr(state?.areaTransitionTimer, 0) > 0;

  if (bloomPass) {
    bloomPass.strength = clamp(
      0.56 + 0.18 * beatPulse + (isOverdrive ? 0.32 : 0) + (isTransition ? 0.14 : 0),
      0.42,
      1.28
    );
  }
  if (renderer && 'toneMappingExposure' in renderer) {
    renderer.toneMappingExposure = clamp(
      1.06 + 0.06 * beatPulse + (isOverdrive ? 0.12 : 0),
      0.95,
      1.32
    );
  }

  if (ui.beatLed?.style) {
    const scale = 0.88 + 0.44 * beatPulse;
    ui.beatLed.style.transform = `scale(${scale.toFixed(2)})`;
    ui.beatLed.style.opacity = (0.55 + 0.45 * beatPulse).toFixed(2);
  }

  if (spectrumCtx && ui.spectrumCanvas) {
    const cw = Number(ui.spectrumCanvas.width) || 68;
    const ch = Number(ui.spectrumCanvas.height) || 18;
    spectrumCtx.clearRect(0, 0, cw, ch);

    const bins = audio.getSpectrum();
    const barCount = 16;
    const step = cw / barCount;
    const barW = Math.max(2, step - 1.4);

    for (let i = 0; i < barCount; i++) {
      const v0 = bins[i * 2] || 0;
      const v1 = bins[i * 2 + 1] || 0;
      const norm = clamp(((v0 + v1) * 0.5) / 255, 0.08, 1.0);
      const bh = Math.max(2, norm * (ch - 2));
      spectrumCtx.fillStyle = i >= 12 ? '#ff2a85' : i >= 7 ? '#ffd166' : '#00f0ff';
      spectrumCtx.fillRect(i * step, ch - bh, barW, bh);
    }
  }
}

function makeDiamondPoints(radius) {
  const r = clamp(finiteOr(radius, 22), 10, 96).toFixed(1);
  return `0,-${r} ${r},0 0,${r} -${r},0`;
}

function renderReticleAndLockBrackets(state, projections, vp, beatPhase) {
  if (!ui.reticleLayer) return;

  setAttrSafe(ui.reticleLayer, 'viewBox', `0 0 ${vp.w} ${vp.h}`);

  const bp = ((finiteOr(beatPhase, 0) % 1) + 1) % 1;
  const beatPulse = Math.pow(1.0 - bp, 2.2);

  const retX = clamp(finiteOr(state?.reticle?.x, 0), -1, 1);
  const retY = clamp(finiteOr(state?.reticle?.y, 0), -1, 1);
  const cursorScreenX = (retX * 0.5 + 0.5) * vp.w;
  const cursorScreenY = (-retY * 0.5 + 0.5) * vp.h;

  const locks = Array.isArray(state?.locks) ? state.locks : [];
  const lockCount = locks.length;
  const isLocking = Boolean(state?.isLocking);
  const isOctet = lockCount >= 8;

  // 1. Update 8-Octagon Paint-Lock Cursor Reticle
  if (ui.reticleCursor) {
    const showCursor = state?.phase === 'playing';
    setAttrSafe(ui.reticleCursor, 'visibility', showCursor ? 'visible' : 'hidden');
    setAttrSafe(
      ui.reticleCursor,
      'transform',
      `translate(${cursorScreenX.toFixed(1)}, ${cursorScreenY.toFixed(1)})`
    );

    const outerScale = 1.0 + 0.14 * beatPulse + (isLocking ? 0.08 : 0);
    const outerRot = totalElapsed * (isLocking ? 48 : 18);
    const innerRot = -totalElapsed * (isLocking ? 72 : 28);

    const mainStroke = isOctet ? '#ff2a85' : lockCount >= 4 ? '#ffd166' : '#00f0ff';

    if (ui.reticleOuterOctagon) {
      setAttrSafe(
        ui.reticleOuterOctagon,
        'transform',
        `rotate(${outerRot.toFixed(1)}) scale(${outerScale.toFixed(3)})`
      );
      setAttrSafe(ui.reticleOuterOctagon, 'stroke', mainStroke);
      setAttrSafe(ui.reticleOuterOctagon, 'stroke-width', isLocking ? '2.2' : '1.75');
    }

    if (ui.reticleInnerOctagon) {
      setAttrSafe(ui.reticleInnerOctagon, 'transform', `rotate(${innerRot.toFixed(1)})`);
      setAttrSafe(ui.reticleInnerOctagon, 'stroke', isOctet ? '#ffffff' : '#ffd166');
    }

    if (ui.reticleBeatRing) {
      const beatRadius = 28 + bp * 20;
      setAttrSafe(ui.reticleBeatRing, 'r', beatRadius.toFixed(1));
      setAttrSafe(ui.reticleBeatRing, 'stroke', mainStroke);
      setAttrSafe(ui.reticleBeatRing, 'stroke-opacity', ((1 - bp) * 0.55).toFixed(2));
    }

    for (let i = 0; i < reticleOctetPolys.length; i++) {
      const nodePoly = reticleOctetPolys[i];
      const active = i < lockCount;
      const fillCol = !active
        ? 'rgba(0, 240, 255, 0.06)'
        : isOctet
          ? '#ff2a85'
          : i >= 4
            ? '#ffd166'
            : '#00f0ff';
      const strokeCol = active ? '#ffffff' : '#00f0ff';
      setAttrSafe(nodePoly, 'fill', fillCol);
      setAttrSafe(nodePoly, 'stroke', strokeCol);
      setAttrSafe(nodePoly, 'stroke-opacity', active ? '1' : '0.32');
    }

    if (ui.reticleReadoutText) {
      const mult = CHAIN_MULTIPLIERS[clamp(lockCount, 0, 8)] || 1.0;
      if (isOctet) {
        ui.reticleReadoutText.textContent = 'OCTET MAX · 4.0x';
        setAttrSafe(ui.reticleReadoutText, 'fill', '#ff2a85');
      } else if (lockCount > 0) {
        ui.reticleReadoutText.textContent = `LOCK ${lockCount}/8 · ${mult.toFixed(1)}x`;
        setAttrSafe(ui.reticleReadoutText, 'fill', '#ffd166');
      } else if (isLocking) {
        ui.reticleReadoutText.textContent = 'SWEEP TARGETS';
        setAttrSafe(ui.reticleReadoutText, 'fill', '#00f0ff');
      } else {
        ui.reticleReadoutText.textContent = 'READY';
        setAttrSafe(ui.reticleReadoutText, 'fill', '#00f0ff');
      }
    }
  }

  // 2. Group active lock slots (1..8) by targetId & map projected coordinates
  const projById = new Map();
  if (Array.isArray(projections)) {
    for (let i = 0; i < projections.length; i++) {
      const p = projections[i];
      if (p && p.id !== undefined && p.id !== null) {
        projById.set(String(p.id), p);
      }
    }
  }

  const slotsByTargetId = new Map();
  for (let i = 0; i < locks.length; i++) {
    const lk = locks[i];
    if (!lk || lk.targetId === undefined || lk.targetId === null) continue;
    const key = String(lk.targetId);
    let entry = slotsByTargetId.get(key);
    if (!entry) {
      entry = { slots: [], fallbackLock: lk };
      slotsByTargetId.set(key, entry);
    }
    entry.slots.push((lk.slotIndex ?? i) + 1);
  }

  let poolCursor = 0;
  let filamentCursor = 0;
  let renderedLockedBrackets = 0;

  if (state?.phase === 'playing') {
    // Render locked 3D target diamond brackets first so they always take priority
    for (const [targetKey, info] of slotsByTargetId.entries()) {
      if (poolCursor >= bracketPool.length) break;

      let proj = projById.get(targetKey);
      let sx = proj ? finiteOr(proj.screenX, vp.w * 0.5) : vp.w * 0.5;
      let sy = proj ? finiteOr(proj.screenY, vp.h * 0.5) : vp.h * 0.5;
      let rad = proj ? clamp(finiteOr(proj.radiusPx, 26), 18, 76) : 26;

      if (!proj && info.fallbackLock) {
        // Fallback screen projection if target died mid-sweep while lock slot remains held
        const lk = info.fallbackLock;
        const dz = Math.max(4, finiteOr(lk.dist, state.corridorDist + 40) - (state.corridorDist - CAM_TRAIL_METERS));
        const tanHalf = Math.tan((camRig.fov * Math.PI) / 360) || 0.6;
        const aspect = vp.w / vp.h;
        const nx = (finiteOr(lk.x, 0) - camRig.offsetX) / (dz * tanHalf * aspect);
        const ny = (finiteOr(lk.y, 0) - camRig.offsetY) / (dz * tanHalf);
        sx = (nx * 0.5 + 0.5) * vp.w;
        sy = (-ny * 0.5 + 0.5) * vp.h;
      }

      sx = clamp(sx, 24, vp.w - 24);
      sy = clamp(sy, 24, vp.h - 24);

      const widget = bracketPool[poolCursor++];
      renderedLockedBrackets++;

      const slotNums = info.slots;
      const highestSlot = slotNums[slotNums.length - 1] || 1;
      const bracketColor = isOctet
        ? '#ff2a85'
        : highestSlot >= 5
          ? '#ffd166'
          : '#00f0ff';

      const spinDeg = totalElapsed * 95 + highestSlot * 22.5;
      const pulseScale = 1.0 + 0.16 * beatPulse;
      const outerR = rad * 1.15;
      const innerR = rad * 0.78;

      if (widget.group.style) widget.group.style.display = '';
      setAttrSafe(widget.group, 'visibility', 'visible');
      setAttrSafe(widget.group, 'transform', `translate(${sx.toFixed(1)}, ${sy.toFixed(1)})`);

      setAttrSafe(widget.outerDiamond, 'points', makeDiamondPoints(outerR));
      setAttrSafe(widget.outerDiamond, 'stroke', bracketColor);
      setAttrSafe(widget.outerDiamond, 'stroke-width', '2.3');
      setAttrSafe(widget.outerDiamond, 'stroke-opacity', '0.98');
      setAttrSafe(
        widget.outerDiamond,
        'transform',
        `rotate(${spinDeg.toFixed(1)}) scale(${pulseScale.toFixed(3)})`
      );

      setAttrSafe(widget.innerDiamond, 'visibility', 'visible');
      setAttrSafe(widget.innerDiamond, 'points', makeDiamondPoints(innerR));
      setAttrSafe(widget.innerDiamond, 'stroke', isOctet ? '#ffffff' : '#ffd166');
      setAttrSafe(widget.innerDiamond, 'transform', `rotate(${(-spinDeg * 1.25).toFixed(1)})`);

      const slotTag =
        slotNums.length === 8
          ? 'LOCK 1..8 MAX'
          : slotNums.length > 3
            ? `LOCK ${slotNums[0]}..${slotNums[slotNums.length - 1]} (×${slotNums.length})`
            : `LOCK ${slotNums.join('·')}`;
      widget.label.textContent = slotTag;
      setAttrSafe(widget.label, 'y', (-outerR - 8).toFixed(1));
      setAttrSafe(widget.label, 'fill', isOctet ? '#ff2a85' : '#ffd166');
      setAttrSafe(widget.label, 'visibility', 'visible');

      // Laser lock filament from cursor octagon to locked target
      if (filamentCursor < filamentPool.length) {
        const fil = filamentPool[filamentCursor++];
        if (fil.style) fil.style.display = '';
        setAttrSafe(fil, 'visibility', 'visible');
        setAttrSafe(fil, 'x1', cursorScreenX.toFixed(1));
        setAttrSafe(fil, 'y1', cursorScreenY.toFixed(1));
        setAttrSafe(fil, 'x2', sx.toFixed(1));
        setAttrSafe(fil, 'y2', sy.toFixed(1));
        setAttrSafe(fil, 'stroke', bracketColor);
        setAttrSafe(fil, 'stroke-opacity', isLocking ? '0.52' : '0.28');
      }
    }

    // Subtle vector acquisition diamonds on unlocked visible targets
    if (Array.isArray(projections)) {
      for (let i = 0; i < projections.length && poolCursor < bracketPool.length; i++) {
        const p = projections[i];
        if (!p || !p.lockable) continue;
        if (slotsByTargetId.has(String(p.id))) continue;

        const widget = bracketPool[poolCursor++];
        const r = clamp(finiteOr(p.radiusPx, 20) * 0.88, 13, 52);

        if (widget.group.style) widget.group.style.display = '';
        setAttrSafe(widget.group, 'visibility', 'visible');
        setAttrSafe(
          widget.group,
          'transform',
          `translate(${finiteOr(p.screenX, 0).toFixed(1)}, ${finiteOr(p.screenY, 0).toFixed(1)})`
        );

        setAttrSafe(widget.outerDiamond, 'points', makeDiamondPoints(r));
        setAttrSafe(widget.outerDiamond, 'stroke', '#00f0ff');
        setAttrSafe(widget.outerDiamond, 'stroke-width', '1.05');
        setAttrSafe(widget.outerDiamond, 'stroke-opacity', '0.34');
        setAttrSafe(widget.outerDiamond, 'transform', 'rotate(0) scale(1)');

        setAttrSafe(widget.innerDiamond, 'visibility', 'hidden');
        widget.label.textContent = '';
        setAttrSafe(widget.label, 'visibility', 'hidden');
      }
    }
  }

  for (let i = poolCursor; i < bracketPool.length; i++) {
    const w = bracketPool[i];
    if (w.group.style) w.group.style.display = 'none';
    setAttrSafe(w.group, 'visibility', 'hidden');
  }

  for (let i = filamentCursor; i < filamentPool.length; i++) {
    const f = filamentPool[i];
    if (f.style) f.style.display = 'none';
    setAttrSafe(f, 'visibility', 'hidden');
  }

  lastLockedBracketCount = renderedLockedBrackets;
  if (ui.targetBrackets?.dataset) {
    ui.targetBrackets.dataset.lockedBrackets = String(renderedLockedBrackets);
    ui.targetBrackets.dataset.activeBrackets = String(poolCursor);
  }
}

// ---------------------------------------------------------------------------
// 8. DOM TELEMETRY SYNCHRONIZATION (TOP BAR, BOSS BAR, DECK & MODALS)
// ---------------------------------------------------------------------------
function syncHudFromState(state) {
  if (!state) return;

  const areaIdx = clamp(Math.round(finiteOr(state.areaIndex, 0)), 0, 3);
  const meta = AREA_UI_META[areaIdx];

  // Top Bar: Area Indicator & Progress Pips
  if (ui.areaCode) ui.areaCode.textContent = meta.code;
  if (ui.areaName) ui.areaName.textContent = state.areaName || meta.name;

  const areaFrac =
    areaIdx < 3
      ? clamp(finiteOr(state.areaTime, 0) / meta.durationSec, 0, 1)
      : state.boss
        ? clamp(1 - finiteOr(state.boss.hp, 0) / Math.max(1, finiteOr(state.boss.maxHp, 36)), 0.08, 1)
        : 1.0;

  for (let i = 0; i < ui.areaPips.length; i++) {
    const pip = ui.areaPips[i];
    if (!pip) continue;
    pip.classList?.toggle?.('completed', i < areaIdx);
    pip.classList?.toggle?.('active', i === areaIdx);
    if (i === areaIdx && pip.style?.setProperty) {
      pip.style.setProperty('--area-progress', `${Math.round(areaFrac * 100)}%`);
    }
  }

  // Score, Chain, Lock Multiplier, Sync %, Rank
  if (ui.scoreValue) ui.scoreValue.textContent = formatScore(state.score);
  if (ui.chainValue) ui.chainValue.textContent = String(Math.max(0, Math.round(finiteOr(state.chain, 0))));

  const lockCount = Array.isArray(state.locks) ? state.locks.length : 0;
  const activeMult = CHAIN_MULTIPLIERS[clamp(lockCount, 0, 8)] || 1.0;
  if (ui.multiplierBadge) {
    ui.multiplierBadge.textContent = lockCount >= 8 ? '4.0x OCTET' : `${activeMult.toFixed(1)}x`;
    if (ui.multiplierBadge.dataset) {
      ui.multiplierBadge.dataset.octet = String(lockCount >= 8);
    }
  }

  const syncPct = clamp(finiteOr(state.syncPercent, 100), 0, 100);
  if (ui.syncValue) ui.syncValue.textContent = `${syncPct.toFixed(1)}%`;
  if (ui.rankBadge) ui.rankBadge.textContent = state.rank || 'S';

  // Boss SERAPH-IX Telemetry Bar
  const boss = state.boss;
  const bossActive = Boolean(boss && state.phase === 'playing');
  if (ui.bossHud?.dataset) {
    ui.bossHud.dataset.active = String(bossActive);
  }
  if (bossActive) {
    const bPhase = clamp(Math.round(finiteOr(boss.phase, 1)), 1, 3);
    if (ui.bossName) ui.bossName.textContent = boss.name || 'SERAPH-IX';
    if (ui.bossPhaseLabel) {
      ui.bossPhaseLabel.textContent = BOSS_PHASE_LABELS[bPhase] || `PHASE ${bPhase}`;
    }
    for (let p = 0; p < ui.bossPhasePips.length; p++) {
      const pip = ui.bossPhasePips[p];
      if (!pip) continue;
      pip.classList?.toggle?.('cleared', p + 1 < bPhase);
      pip.classList?.toggle?.('active', p + 1 === bPhase);
    }

    const hpPct = clamp(
      (finiteOr(boss.hp, 0) / Math.max(1, finiteOr(boss.maxHp, 36))) * 100,
      0,
      100
    );
    const phaseHpPct = clamp(
      (finiteOr(boss.phaseHp, boss.hp) / Math.max(1, finiteOr(boss.phaseMaxHp, boss.maxHp))) * 100,
      0,
      100
    );

    if (ui.bossHpFill?.style) ui.bossHpFill.style.width = `${hpPct.toFixed(1)}%`;
    if (ui.bossPhaseHpFill?.style) ui.bossPhaseHpFill.style.width = `${phaseHpPct.toFixed(1)}%`;
    if (ui.bossHpText) ui.bossHpText.textContent = `CORE ${Math.ceil(hpPct)}%`;
  }

  // Bottom Left: Evolution Form + 3 Shield Pips + Evolution Cube Progress
  const player = state.player || {};
  const evoStage = clamp(Math.round(finiteOr(player.evolutionStage, 1)), 1, 3);
  const shields = clamp(Math.round(finiteOr(player.shields, 3)), 0, 3);
  const evoProg = evoStage >= 3 ? 1.0 : clamp(finiteOr(player.evolutionProgress, 0), 0, 1);

  if (ui.formReadout) {
    ui.formReadout.textContent = FORM_HUD_LABELS[evoStage] || FORM_HUD_LABELS[1];
    if (ui.formReadout.dataset) ui.formReadout.dataset.stage = String(evoStage);
  }

  for (let s = 0; s < ui.shieldPips.length; s++) {
    ui.shieldPips[s]?.classList?.toggle?.('active', s < shields);
  }
  if (ui.shieldCountLabel) {
    ui.shieldCountLabel.textContent = `${shields}/3 SHIELDS`;
  }

  if (ui.evolutionBarFill?.style) {
    ui.evolutionBarFill.style.width = `${Math.round(evoProg * 100)}%`;
  }
  if (ui.evolutionLabel) {
    ui.evolutionLabel.textContent =
      evoStage >= 3 ? 'MAX FORM' : `CUBE ${Math.round(evoProg * 100)}%`;
  }

  // Bottom Center: 8-Slot Harmonic Lock Strip
  for (let i = 0; i < ui.lockSlotCells.length; i++) {
    const cell = ui.lockSlotCells[i];
    if (!cell) continue;
    const isLocked = i < lockCount;
    cell.classList?.toggle?.('locked', isLocked);
    cell.classList?.toggle?.('gold-tier', isLocked && i >= 4 && lockCount < 8);
    cell.classList?.toggle?.('octet-max', isLocked && lockCount >= 8);
  }

  if (ui.lockOctetReadout) {
    if (lockCount >= 8) {
      ui.lockOctetReadout.textContent = 'OCTET MAX · 4.0x';
    } else if (lockCount > 0) {
      ui.lockOctetReadout.textContent = `LOCK ${lockCount}/8 · ${activeMult.toFixed(1)}x`;
    } else if (state.isLocking) {
      ui.lockOctetReadout.textContent = 'PAINTING...';
    } else {
      ui.lockOctetReadout.textContent = 'STANDBY · 1.0x';
    }
  }

  // Bottom Right: Overdrive Resonance Gauge + [BARREL ROLL] & [OVERDRIVE] Buttons
  const overdrivePct = clamp(finiteOr(player.overdrive, 0), 0, 100);
  const overdriveActive = finiteOr(state.overdriveTimer, 0) > 0;
  const overdriveReady = overdrivePct >= 100 && !overdriveActive;

  if (ui.overdriveFill?.style) {
    const shownPct = overdriveActive
      ? clamp((finiteOr(state.overdriveTimer, 0) / 3.0) * 100, 0, 100)
      : overdrivePct;
    ui.overdriveFill.style.width = `${shownPct.toFixed(1)}%`;
  }

  if (ui.overdriveStatus) {
    if (overdriveActive) {
      ui.overdriveStatus.textContent = `ACTIVE · ${finiteOr(state.overdriveTimer, 0).toFixed(1)}S`;
    } else if (overdriveReady) {
      ui.overdriveStatus.textContent = '100% READY';
    } else {
      ui.overdriveStatus.textContent = `CHARGING · ${Math.floor(overdrivePct)}%`;
    }
    if (ui.overdriveStatus.dataset) {
      ui.overdriveStatus.dataset.ready = String(overdriveReady);
    }
  }

  if (ui.btnOverdrive) {
    ui.btnOverdrive.disabled = state.phase !== 'playing' || !overdriveReady;
    if (ui.btnOverdrive.dataset) ui.btnOverdrive.dataset.ready = String(overdriveReady);
  }
  if (ui.overdriveBtnTag) {
    ui.overdriveBtnTag.textContent = overdriveActive
      ? 'WAVE'
      : overdriveReady
        ? 'READY'
        : `${Math.floor(overdrivePct)}%`;
  }

  const rollActive = finiteOr(player.barrelRollTimer, 0) > 0;
  const rollCd = finiteOr(player.barrelRollCooldown, 0);
  const rollReady = !rollActive && rollCd <= 0.01;
  if (ui.btnBarrelRoll) {
    ui.btnBarrelRoll.disabled = state.phase !== 'playing' || !rollReady;
  }
  if (ui.barrelRollStatus) {
    ui.barrelRollStatus.textContent = rollActive
      ? 'SPINNING'
      : rollReady
        ? 'READY'
        : `${rollCd.toFixed(1)}S`;
  }

  // Title & Victory / Signal Lost Synchronization Report Modals
  if (state.phase !== lastPhaseRendered) {
    lastPhaseRendered = state.phase;

    if (ui.titleOverlay?.dataset) {
      ui.titleOverlay.dataset.hidden = String(state.phase !== 'title');
    }

    const showReport = state.phase === 'victory' || state.phase === 'defeat';
    if (ui.reportModal?.dataset) {
      ui.reportModal.dataset.hidden = String(!showReport);
      ui.reportModal.dataset.outcome = state.phase === 'defeat' ? 'defeat' : 'victory';
    }

    if (showReport) {
      const isVictory = state.phase === 'victory';
      if (ui.reportKicker) {
        ui.reportKicker.textContent = isVictory
          ? 'TAPE 09 // SYNCHRONIZATION COMPLETE'
          : 'ALERT // CARRIER DESYNCHRONIZED';
      }
      if (ui.reportTitle) {
        ui.reportTitle.textContent = isVictory ? 'SERAPH-IX HARMONIZED' : 'SIGNAL LOST';
      }
      if (ui.reportSubtitle) {
        ui.reportSubtitle.textContent = isVictory
          ? 'All four architectural Fourier corridors and the Singularity Core achieved full harmonic phase lock at 124 BPM.'
          : 'Carrier shields collapsed inside the megastructure corridor. Re-establish harmonic lock to try again.';
      }
      if (ui.reportRank) ui.reportRank.textContent = state.rank || (isVictory ? 'S' : 'C');
      if (ui.reportSync) ui.reportSync.textContent = `${syncPct.toFixed(1)}%`;
      if (ui.reportFullLocks) ui.reportFullLocks.textContent = String(state.fullLocksCount ?? 0);
      if (ui.reportMaxChain) ui.reportMaxChain.textContent = String(state.maxChain ?? 0);
      if (ui.reportScore) ui.reportScore.textContent = formatScore(state.score);
      if (ui.reportSummary) {
        ui.reportSummary.textContent = `${meta.code} // ${meta.name} · ${FORM_HUD_LABELS[evoStage]}`;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 9. SEAMLESS INPUT RESOLUTION & QUANTIZED PAINT-LOCK WIRING
// ---------------------------------------------------------------------------
function resolveLiveFlightInput() {
  const left = keysHeld.has('KeyA') || keysHeld.has('ArrowLeft');
  const right = keysHeld.has('KeyD') || keysHeld.has('ArrowRight');
  const up = keysHeld.has('KeyW') || keysHeld.has('ArrowUp');
  const down = keysHeld.has('KeyS') || keysHeld.has('ArrowDown');

  const moveX = (right ? 1 : 0) - (left ? 1 : 0);
  const moveY = (up ? 1 : 0) - (down ? 1 : 0);

  return {
    moveX,
    moveY,
    aimX: pointerState.hasMoved ? pointerState.ndcX : null,
    aimY: pointerState.hasMoved ? pointerState.ndcY : null
  };
}

function updatePointerNdcFromClient(clientX, clientY) {
  const vp = getViewportSize();
  const cx = finiteOr(clientX, vp.w * 0.5);
  const cy = finiteOr(clientY, vp.h * 0.5);
  pointerState.ndcX = clamp((cx / vp.w) * 2 - 1, -1, 1);
  pointerState.ndcY = clamp(-(cy / vp.h) * 2 + 1, -1, 1);
  pointerState.hasMoved = true;
}

function engagePaintLockSweep() {
  const st = combat.getState();
  if (st.phase !== 'playing') return false;
  combat.beginLockSweep();
  const vp = getViewportSize();
  lastProjections = world.getTargetScreenProjections(camera, vp.w, vp.h);
  combat.sweepTargets(lastProjections);
  return true;
}

function releaseQuantizedPaintLock() {
  const st = combat.getState();
  if (st.phase !== 'playing') return null;
  const subdiv = audio.getSubdivisionInfo();
  const delaySec = finiteOr(subdiv?.next16thDelaySec, 0.06);
  const res = combat.releaseLockSalvo(delaySec);
  syncHudFromState(combat.getState());
  return res;
}

function toggleAudioMute() {
  if (isMuted) {
    isMuted = false;
    if (combat.getState().phase === 'playing') {
      audio.start();
      const st = combat.getState();
      syncAudioLayers(st.areaIndex, st.player?.evolutionStage ?? 1, true);
    }
  } else if (audio.isPlaying) {
    isMuted = true;
    audio.stop();
  } else {
    isMuted = false;
    audio.start();
    const st = combat.getState();
    syncAudioLayers(st.areaIndex, st.player?.evolutionStage ?? 1, true);
  }

  if (ui.audioStatusDot?.dataset) {
    ui.audioStatusDot.dataset.muted = String(isMuted);
  }
  if (ui.audioToggleLabel) {
    ui.audioToggleLabel.textContent = isMuted ? 'MUTED' : 'AUDIO ON';
  }
  if (ui.btnAudioToggle?.setAttribute) {
    ui.btnAudioToggle.setAttribute('aria-pressed', String(!isMuted));
  }
}

// ---------------------------------------------------------------------------
// 10. RUN LIFECYCLE, STEP LOOP & PUBLIC QA API (window.HarmonicLock)
// ---------------------------------------------------------------------------
function renderSceneFrame() {
  if (composer && typeof composer.render === 'function') {
    try {
      composer.render();
      return;
    } catch (_) {
      composer = null;
    }
  }
  renderer?.render?.(scene, camera);
}

function startRun() {
  pointerState.isDown = false;
  pointerState.activePointerId = null;
  keyboardLockHeld = false;

  if (!isMuted && !audio.isPlaying) {
    audio.start();
  }

  combat.startRun();
  const st = combat.getState();

  lastPhaseRendered = 'playing';
  if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'true';
  if (ui.reportModal?.dataset) ui.reportModal.dataset.hidden = 'true';

  world.setArea(st.areaIndex);
  applyAreaThemeCss(st.areaIndex);
  syncAudioLayers(st.areaIndex, st.player?.evolutionStage ?? 1, true);

  const beatPhase = finiteOr(audio.getBeatPhase(), 0);
  updateCameraRig(st, 1 / 60, true);
  world.syncState(st, camera, 1 / 60, totalElapsed, beatPhase);

  const vp = getViewportSize();
  lastProjections = world.getTargetScreenProjections(camera, vp.w, vp.h);
  renderReticleAndLockBrackets(st, lastProjections, vp, beatPhase);
  updateBloomAndSpectrum(st, beatPhase);
  syncHudFromState(st);
  renderSceneFrame();

  return getState();
}

function resetRun(options = {}) {
  keysHeld.clear();
  pointerState.isDown = false;
  pointerState.activePointerId = null;
  keyboardLockHeld = false;
  camRig.shake = 0;

  combat.reset();

  if (options && options.toTitle === true) {
    const st = combat.getState();
    lastPhaseRendered = 'title';
    if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'false';
    if (ui.reportModal?.dataset) ui.reportModal.dataset.hidden = 'true';

    world.setArea(0);
    applyAreaThemeCss(0);
    syncAudioLayers(0, 1, true);

    const beatPhase = finiteOr(audio.getBeatPhase(), 0);
    updateCameraRig(st, 1 / 60, true);
    world.syncState(st, camera, 1 / 60, totalElapsed, beatPhase);

    const vp = getViewportSize();
    lastProjections = world.getTargetScreenProjections(camera, vp.w, vp.h);
    renderReticleAndLockBrackets(st, lastProjections, vp, beatPhase);
    syncHudFromState(st);
    renderSceneFrame();
    return getState();
  }

  return startRun();
}

function jumpToArea(areaIndex) {
  const clampedIdx = clamp(Math.round(finiteOr(Number(areaIndex), 0)), 0, 3);
  pointerState.isDown = false;
  keyboardLockHeld = false;

  if (!isMuted && !audio.isPlaying) {
    audio.start();
  }

  combat.setAreaForTest(clampedIdx);
  const st = combat.getState();

  lastPhaseRendered = 'playing';
  if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'true';
  if (ui.reportModal?.dataset) ui.reportModal.dataset.hidden = 'true';

  world.setArea(clampedIdx);
  applyAreaThemeCss(clampedIdx);
  syncAudioLayers(clampedIdx, st.player?.evolutionStage ?? 1, true);

  const beatPhase = finiteOr(audio.getBeatPhase(), 0);
  updateCameraRig(st, 1 / 60, true);
  world.syncState(st, camera, 1 / 60, totalElapsed, beatPhase);

  const vp = getViewportSize();
  lastProjections = world.getTargetScreenProjections(camera, vp.w, vp.h);
  renderReticleAndLockBrackets(st, lastProjections, vp, beatPhase);
  updateBloomAndSpectrum(st, beatPhase);
  syncHudFromState(st);
  renderSceneFrame();

  return getState();
}

function step(dt = 1 / 60, externalInput = null) {
  const safeDt = clamp(finiteOr(dt, 1 / 60), 0.0005, 0.25);
  totalElapsed += safeDt;

  if (bannerTimer > 0) {
    bannerTimer = Math.max(0, bannerTimer - safeDt);
    if (bannerTimer <= 0 && ui.banner?.dataset) {
      ui.banner.dataset.visible = 'false';
    }
  }

  if (flashTimer > 0) {
    flashTimer = Math.max(0, flashTimer - safeDt);
    if (flashTimer <= 0 && ui.screenFlash?.style) {
      ui.screenFlash.style.opacity = '0';
    }
  }

  const resolvedInput =
    externalInput !== null && typeof externalInput === 'object'
      ? externalInput
      : resolveLiveFlightInput();

  const events = combat.step(safeDt, resolvedInput);
  let st = combat.getState();

  const beatPhase = finiteOr(audio.getBeatPhase(), 0);
  updateCameraRig(st, safeDt, false);
  world.syncState(st, camera, safeDt, totalElapsed, beatPhase);

  const vp = getViewportSize();
  lastProjections = world.getTargetScreenProjections(camera, vp.w, vp.h);

  // Continuous Paint-Lock target sweep while pointer/key hold or combat.isLocking is active
  if (st.phase === 'playing' && (st.isLocking || pointerState.isDown || keyboardLockHeld)) {
    if (!st.isLocking) {
      combat.beginLockSweep();
    }
    combat.sweepTargets(lastProjections);
    st = combat.getState();
    world.syncState(st, camera, 0, totalElapsed, beatPhase);
  }

  syncAudioLayers(st.areaIndex, st.player?.evolutionStage ?? 1, false);
  renderReticleAndLockBrackets(st, lastProjections, vp, beatPhase);
  updateBloomAndSpectrum(st, beatPhase);
  syncHudFromState(st);
  renderSceneFrame();

  return events;
}

function getState() {
  const st = combat.getState();
  st.cameraFov = camera.fov;
  st.cameraRollRad = camRig.rollRad;
  st.isMuted = isMuted;
  st.projectedTargetsCount = lastProjections.length;
  st.lockedBracketCount = lastLockedBracketCount;
  return st;
}

// ---------------------------------------------------------------------------
// 11. EVENT LISTENERS (POINTER PAINT-LOCK, KEYBOARD & HUD ACTION BUTTONS)
// ---------------------------------------------------------------------------
function bindControls() {
  ui.btnInitiate?.addEventListener?.('click', (ev) => {
    ev?.stopPropagation?.();
    startRun();
  });

  ui.btnResync?.addEventListener?.('click', (ev) => {
    ev?.stopPropagation?.();
    resetRun();
  });

  ui.btnAudioToggle?.addEventListener?.('click', (ev) => {
    ev?.stopPropagation?.();
    toggleAudioMute();
  });

  // Prevent tactical button clicks from initiating a canvas paint-lock sweep
  const stopPointerBubble = (ev) => ev?.stopPropagation?.();
  ui.btnBarrelRoll?.addEventListener?.('pointerdown', stopPointerBubble);
  ui.btnOverdrive?.addEventListener?.('pointerdown', stopPointerBubble);
  ui.btnAudioToggle?.addEventListener?.('pointerdown', stopPointerBubble);

  ui.btnBarrelRoll?.addEventListener?.('click', (ev) => {
    ev?.stopPropagation?.();
    combat.triggerBarrelRoll();
    syncHudFromState(combat.getState());
  });

  ui.btnOverdrive?.addEventListener?.('click', (ev) => {
    ev?.stopPropagation?.();
    combat.triggerOverdrive();
    syncHudFromState(combat.getState());
  });

  // Viewport Paint-Lock Sweep & Release (Mouse / Touch)
  ui.canvasContainer?.addEventListener?.('pointerdown', (ev) => {
    if (ev && typeof ev.button === 'number' && ev.button !== 0) return;
    updatePointerNdcFromClient(ev?.clientX, ev?.clientY);

    const st = combat.getState();
    if (st.phase !== 'playing') return;

    pointerState.isDown = true;
    pointerState.activePointerId = ev?.pointerId ?? null;
    ui.canvasContainer?.setPointerCapture?.(ev?.pointerId);

    combat.step(0.0005, {
      moveX: 0,
      moveY: 0,
      aimX: pointerState.ndcX,
      aimY: pointerState.ndcY
    });
    engagePaintLockSweep();
    syncHudFromState(combat.getState());
  });

  win.addEventListener?.('pointermove', (ev) => {
    updatePointerNdcFromClient(ev?.clientX, ev?.clientY);
  });

  const handlePointerRelease = (ev) => {
    if (!pointerState.isDown) return;
    if (
      pointerState.activePointerId !== null &&
      ev?.pointerId !== undefined &&
      ev.pointerId !== pointerState.activePointerId
    ) {
      return;
    }
    pointerState.isDown = false;
    pointerState.activePointerId = null;
    releaseQuantizedPaintLock();
  };

  win.addEventListener?.('pointerup', handlePointerRelease);
  win.addEventListener?.('pointercancel', handlePointerRelease);

  // Keyboard Flight, Paint-Lock (KeyJ / Enter), Barrel Roll (Space) & Overdrive (Q / E)
  win.addEventListener?.('keydown', (ev) => {
    const code = ev?.code || '';
    if (!code) return;

    keysHeld.add(code);
    const phase = combat.getState().phase;

    if (code === 'KeyM' && !ev.repeat) {
      toggleAudioMute();
      return;
    }

    if (phase === 'title' && (code === 'Enter' || code === 'Space') && !ev.repeat) {
      ev.preventDefault?.();
      startRun();
      return;
    }

    if ((phase === 'victory' || phase === 'defeat') && (code === 'Enter' || code === 'Space') && !ev.repeat) {
      ev.preventDefault?.();
      resetRun();
      return;
    }

    if (phase !== 'playing') return;

    if ((code === 'KeyJ' || code === 'Enter') && !ev.repeat) {
      ev.preventDefault?.();
      keyboardLockHeld = true;
      engagePaintLockSweep();
      syncHudFromState(combat.getState());
    } else if (code === 'Space' && !ev.repeat) {
      ev.preventDefault?.();
      combat.triggerBarrelRoll();
      syncHudFromState(combat.getState());
    } else if ((code === 'KeyQ' || code === 'KeyE') && !ev.repeat) {
      ev.preventDefault?.();
      combat.triggerOverdrive();
      syncHudFromState(combat.getState());
    }
  });

  win.addEventListener?.('keyup', (ev) => {
    const code = ev?.code || '';
    if (!code) return;
    keysHeld.delete(code);

    if ((code === 'KeyJ' || code === 'Enter') && keyboardLockHeld) {
      keyboardLockHeld = false;
      releaseQuantizedPaintLock();
    }
  });

  win.addEventListener?.('blur', () => {
    keysHeld.clear();
    if (pointerState.isDown || keyboardLockHeld) {
      pointerState.isDown = false;
      pointerState.activePointerId = null;
      keyboardLockHeld = false;
      releaseQuantizedPaintLock();
    }
  });

  win.addEventListener?.('resize', () => {
    const vp = getViewportSize();
    camera.aspect = vp.w / vp.h;
    camera.updateProjectionMatrix?.();
    renderer?.setSize?.(vp.w, vp.h);
    composer?.setSize?.(vp.w, vp.h);
    bloomPass?.setSize?.(vp.w, vp.h);

    const st = combat.getState();
    const bp = finiteOr(audio.getBeatPhase(), 0);
    lastProjections = world.getTargetScreenProjections(camera, vp.w, vp.h);
    renderReticleAndLockBrackets(st, lastProjections, vp, bp);
  });
}

// ---------------------------------------------------------------------------
// 12. BOOTSTRAP, ANIMATION LOOP & QA EXPOSURE
// ---------------------------------------------------------------------------
initSvgReticlePools();
bindControls();

const bootState = combat.getState();
world.setArea(0);
applyAreaThemeCss(0);
syncAudioLayers(0, 1, true);
updateCameraRig(bootState, 1 / 60, true);
world.syncState(bootState, camera, 1 / 60, 0, 0);
lastProjections = world.getTargetScreenProjections(camera, initVp.w, initVp.h);
renderReticleAndLockBrackets(bootState, lastProjections, initVp, 0);
updateBloomAndSpectrum(bootState, 0);
syncHudFromState(bootState);
renderSceneFrame();

let lastFrameMs = null;

function onAnimationFrame(nowMs) {
  if (typeof win.requestAnimationFrame === 'function') {
    win.requestAnimationFrame(onAnimationFrame);
  }
  const tMs = Number.isFinite(nowMs) ? nowMs : 0;
  const dt = lastFrameMs === null ? 1 / 60 : clamp((tMs - lastFrameMs) / 1000, 0.001, 0.08);
  lastFrameMs = tMs;

  step(dt, null);
}

if (typeof win.requestAnimationFrame === 'function') {
  win.requestAnimationFrame(onAnimationFrame);
}

const publicApi = {
  startRun,
  resetRun,
  jumpToArea,
  step,
  getState,
  combat,
  world,
  audio,
  scene,
  camera
};

win.HarmonicLock = publicApi;
export default publicApi;
