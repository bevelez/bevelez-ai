// Tape No. 07: Pirate Frequency (107.7 FM) — Game Director, UI & Crazy-Taxi Mission Loop
// Integrates ./pirate-frequency/world.js, ./pirate-frequency/player.js, and ./pirate-frequency/audio.js

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createPirateWorld } from './pirate-frequency/world.js';
import { createCourierPlayer } from './pirate-frequency/player.js';
import { createPirateAudio } from './pirate-frequency/audio.js';

const RUN_DURATION_SEC = 180.0;
const ZONE_TRIGGER_RADIUS_M = 14.0;
const COMBO_FUSE_SEC = 5.5;

const TIER_LABELS = Object.freeze([
  'DRUMS LIVE',
  'DRUMS + BASS',
  '+ RHODES KEYS',
  'FULL BROADCAST!'
]);

const RANK_TITLES = Object.freeze({
  S: 'PIRATE KING OF EL CAMINO — ALL 4 STEMS BLAZING ACROSS THE BAY!',
  A: 'BAYSHORE SIGNAL LEGEND — SHORELINE HEARD EVERY BAR LOUD & CLEAR!',
  B: 'ROOFTOP FREQUENCY RUNNER — SOLID LATE-NIGHT TAPE DISPATCH!',
  C: 'UNDERGROUND INTERN — KEEP GRINDING RAILS & HITTING THE 118 BPM BEAT!'
});

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function formatClock(seconds) {
  const safe = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds - 1e-4 : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function computeComboTier(comboCount) {
  if (comboCount >= 7) return 3;
  if (comboCount >= 4) return 2;
  if (comboCount >= 2) return 1;
  return 0;
}

function computeComboMultiplier(comboCount) {
  return clamp(1 + Math.max(0, Math.floor(comboCount)), 1, 10);
}

// ---------------------------------------------------------------------------
// 1. DOM ELEMENT BINDINGS (1:1 with pirate-frequency.html)
// ---------------------------------------------------------------------------
const doc = typeof document !== 'undefined' ? document : null;
const win = typeof window !== 'undefined' ? window : globalThis;
const getElementById = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);

const ui = {
  stage: getElementById('three-stage'),
  screenFlash: getElementById('screen-flash'),
  linkArchive: getElementById('link-archive'),
  onAirDot: getElementById('station-onair-dot'),
  barReadout: getElementById('station-bar-readout'),
  stemPills: [
    getElementById('stem-pill-drums'),
    getElementById('stem-pill-bass'),
    getElementById('stem-pill-rhodes'),
    getElementById('stem-pill-lead')
  ],
  stemFills: [
    getElementById('stem-fill-drums'),
    getElementById('stem-fill-bass'),
    getElementById('stem-fill-rhodes'),
    getElementById('stem-fill-lead')
  ],
  timerCard: getElementById('timer-card'),
  timerDigits: getElementById('broadcast-timer'),
  popups: getElementById('hud-popups'),
  scoreValue: getElementById('score-value'),
  deliveriesValue: getElementById('deliveries-value'),
  comboBadge: getElementById('combo-badge'),
  comboMultiplier: getElementById('combo-multiplier'),
  comboTierLabel: getElementById('combo-tier-label'),
  comboTimerFill: getElementById('combo-timer-fill'),
  speedValue: getElementById('speed-value'),
  boostBarFill: getElementById('boost-bar-fill'),
  btnRespawn: getElementById('btn-respawn'),
  btnAudioToggle: getElementById('btn-audio-toggle'),
  trickToast: getElementById('trick-toast'),
  beatSyncWidget: getElementById('beat-sync-widget'),
  beatRingPulse: getElementById('beat-ring-pulse'),
  beatBarLeft: getElementById('beat-bar-left'),
  beatBarRight: getElementById('beat-bar-right'),
  beatHitTag: getElementById('beat-hit-tag'),
  dispatchCard: getElementById('dispatch-card'),
  dispatchBadge: getElementById('dispatch-badge'),
  dispatchText: getElementById('dispatch-text'),
  dispatchSub: getElementById('dispatch-sub'),
  dispatchDistance: getElementById('dispatch-distance'),
  touchControls: getElementById('touch-controls'),
  touchSteerPad: getElementById('touch-steer-pad'),
  touchSteerKnob: getElementById('touch-steer-knob'),
  btnTouchTrick: getElementById('btn-touch-trick'),
  btnTouchJump: getElementById('btn-touch-jump'),
  btnTouchBoost: getElementById('btn-touch-boost'),
  startOverlay: getElementById('start-overlay'),
  bootProgressWrap: getElementById('boot-progress-wrap'),
  bootBarFill: getElementById('boot-bar-fill'),
  bootStatusText: getElementById('boot-status-text'),
  btnStartBroadcast: getElementById('btn-start-broadcast'),
  resultsOverlay: getElementById('results-overlay'),
  resultsRankTitle: getElementById('results-rank-title'),
  resultsRank: getElementById('results-rank'),
  resultsScore: getElementById('results-score'),
  resultsDeliveries: getElementById('results-deliveries'),
  resultsBestCombo: getElementById('results-best-combo'),
  resultsOnBeatPct: getElementById('results-onbeat-pct'),
  btnRideAgain: getElementById('btn-ride-again')
};

// ---------------------------------------------------------------------------
// 2. THREE.JS SCENE, RENDERER & EFFECTCOMPOSER (UNREALBLOOM + OUTPUTPASS)
// ---------------------------------------------------------------------------
const isCoarsePointer = Boolean(win.matchMedia?.('(pointer: coarse)')?.matches);
const getViewportSize = () => ({
  w: Math.max(1, Number(win.innerWidth) || 1440),
  h: Math.max(1, Number(win.innerHeight) || 900)
});

const { w: initW, h: initH } = getViewportSize();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, initW / initH, 0.35, 32000);
camera.position.set(-75, 18, 565);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio?.(Math.min(Number(win.devicePixelRatio) || 1, isCoarsePointer ? 1.75 : 2.0));
renderer.setSize?.(initW, initH);
if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping !== undefined) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
}
if ('toneMappingExposure' in renderer) {
  renderer.toneMappingExposure = 1.04;
}
if (ui.stage && renderer.domElement && typeof ui.stage.appendChild === 'function') {
  ui.stage.appendChild(renderer.domElement);
}

let composer = null;
let renderPass = null;
let bloomPass = null;
let outputPass = null;

try {
  if (typeof THREE.WebGLRenderTarget === 'function' && THREE.HalfFloatType !== undefined) {
    const rt = new THREE.WebGLRenderTarget(initW, initH, {
      samples: isCoarsePointer ? 0 : 4,
      type: THREE.HalfFloatType
    });
    composer = new EffectComposer(renderer, rt);
  } else {
    composer = new EffectComposer(renderer);
  }
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Tuned so HDR neon grind rails, beacons & thrusters pop cleanly without washing out buildings
  bloomPass = new UnrealBloomPass(new THREE.Vector2(initW, initH), 0.46, 0.42, 0.86);
  composer.addPass(bloomPass);

  outputPass = new OutputPass();
  composer.addPass(outputPass);
} catch (_) {
  composer = null;
}

// ---------------------------------------------------------------------------
// 3. SUBSYSTEM INSTANTIATION (AUDIO + PLAYER + WORLD)
// ---------------------------------------------------------------------------
const audio = createPirateAudio();
const player = createCourierPlayer({ THREE, scene });
let world = null;

// ---------------------------------------------------------------------------
// 4. GAME STATE, INPUT & MISSION LOOP STATE
// ---------------------------------------------------------------------------
let isMuted = false;
let toastHideTimer = 0;
let hitTagResetTimer = 0;
let flashResetTimer = 0;
let previewElapsed = 0;

const keysHeld = new Set();
const touchState = {
  active: false,
  pointerId: null,
  steer: 0,
  throttle: 0,
  jump: false,
  trick: false,
  boost: false
};
let externalInputOverride = null;

const game = {
  phase: 'title', // 'title' | 'playing' | 'gameover'
  timeRemaining: RUN_DURATION_SEC,
  runElapsed: 0,
  score: 0,
  deliveries: 0,
  tapesCollected: 0,
  comboCount: 0,
  comboTier: 0,
  comboMultiplier: 1,
  comboTimer: 0,
  bestCombo: 0,
  bestMultiplier: 1,
  totalTricks: 0,
  onBeatTricks: 0,
  perfectTricks: 0,
  wasGrinding: false,
  grindStreakTimer: 0,
  grindScoreCarry: 0,
  lastCountdownTickSec: 11
};

const mission = {
  kind: null, // 'pickup' | 'dropoff' | null
  zone: null,
  dispatchedAt: 0,
  startDistance: 0,
  parSeconds: 20,
  currentDistance: 0,
  recentZoneIds: []
};

function rememberZone(zoneId) {
  if (!zoneId) return;
  mission.recentZoneIds.push(zoneId);
  if (mission.recentZoneIds.length > 4) {
    mission.recentZoneIds.shift();
  }
}

// Evaluates how well a corridor from `fromPos` to `zone` is lined with neon grind rails
function scoreCorridorRails(fromPos, zone) {
  if (!world || typeof world.findNearestRail !== 'function') return 0;
  const samples = [0.18, 0.36, 0.54, 0.72, 0.88];
  let railScore = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = samples[i];
    const sx = fromPos.x + (zone.x - fromPos.x) * t;
    const sz = fromPos.z + (zone.z - fromPos.z) * t;
    const hit = world.findNearestRail({ x: sx, y: 2.0, z: sz }, 115);
    if (hit && Number.isFinite(hit.dist) && hit.dist <= 115) {
      railScore += 1.0 - hit.dist / 115;
    }
  }
  return railScore;
}

function pickPickupZone(fromPos, excludeIds = []) {
  if (!world || !Array.isArray(world.zones) || world.zones.length === 0) return null;
  const excluded = new Set(excludeIds.filter(Boolean));
  const candidates = world.zones.filter((z) => !excluded.has(z.id));
  const pool = candidates.length > 0 ? candidates : world.zones;

  const inBand = [];
  for (const z of pool) {
    const d = Math.hypot(z.x - fromPos.x, z.z - fromPos.z);
    if (d >= 180 && d <= 450) {
      inBand.push({ zone: z, dist: d });
    }
  }

  if (inBand.length > 0) {
    let best = inBand[0];
    let bestScore = -Infinity;
    for (const item of inBand) {
      const railBonus = scoreCorridorRails(fromPos, item.zone) * 0.65;
      const varietyPenalty = mission.recentZoneIds.includes(item.zone.id) ? 1.25 : 0;
      // Favor crisp 210m-360m pickup sprints lined with grind rails
      const distSweetSpot = 1.0 - Math.abs(item.dist - 285) / 220;
      const total = railBonus + distSweetSpot - varietyPenalty;
      if (total > bestScore) {
        bestScore = total;
        best = item;
      }
    }
    return best.zone;
  }

  // Graceful fallback if rider rode far outside standard band
  let fallback = pool[0];
  let bestErr = Infinity;
  for (const z of pool) {
    const d = Math.hypot(z.x - fromPos.x, z.z - fromPos.z);
    const err = d < 180 ? (180 - d) * 1.6 : d - 450;
    if (err < bestErr) {
      bestErr = err;
      fallback = z;
    }
  }
  return fallback;
}

function pickDropoffZone(fromPos, excludeIds = []) {
  if (!world || !Array.isArray(world.zones) || world.zones.length === 0) return null;
  const excluded = new Set(excludeIds.filter(Boolean));
  const candidates = world.zones.filter((z) => !excluded.has(z.id));
  const pool = candidates.length > 0 ? candidates : world.zones;

  const inBand = [];
  for (const z of pool) {
    const d = Math.hypot(z.x - fromPos.x, z.z - fromPos.z);
    if (d >= 350 && d <= 950) {
      inBand.push({ zone: z, dist: d });
    }
  }

  if (inBand.length > 0) {
    let best = inBand[0];
    let bestScore = -Infinity;
    for (const item of inBand) {
      const railScore = scoreCorridorRails(fromPos, item.zone) * 1.15;
      const dramaBonus = ((item.dist - 350) / 600) * 0.85;
      const varietyPenalty = mission.recentZoneIds.includes(item.zone.id) ? 1.6 : 0;
      const total = railScore + dramaBonus - varietyPenalty;
      if (total > bestScore) {
        bestScore = total;
        best = item;
      }
    }
    return best.zone;
  }

  let fallback = pool[0];
  let bestErr = Infinity;
  for (const z of pool) {
    const d = Math.hypot(z.x - fromPos.x, z.z - fromPos.z);
    const err = d < 350 ? (350 - d) * 1.6 : d - 950;
    if (err < bestErr) {
      bestErr = err;
      fallback = z;
    }
  }
  return fallback;
}

function assignMissionZone(zone, kind, playerPos) {
  if (!zone || !world) {
    mission.kind = null;
    mission.zone = null;
    mission.currentDistance = 0;
    world?.setActiveZone?.(null, null);
    player.setTargetPosition(null);
    return;
  }
  const dist = Math.hypot(zone.x - playerPos.x, zone.z - playerPos.z);
  mission.kind = kind;
  mission.zone = zone;
  mission.dispatchedAt = game.runElapsed;
  mission.startDistance = Math.max(120, dist);
  mission.parSeconds = Math.max(11, dist / 25.5);
  mission.currentDistance = Math.round(dist);
  rememberZone(zone.id);

  world.setActiveZone(zone.id, kind);
  player.setTargetPosition({ x: zone.x, y: zone.y, z: zone.z }, kind);
  updateDispatchHud();
}

// ---------------------------------------------------------------------------
// 5. HUD FEEDBACK HELPERS (POPUPS, TOASTS, FLASH, COMBO & STEMS)
// ---------------------------------------------------------------------------
function triggerScreenFlash(tone = 'cyan') {
  if (!ui.screenFlash) return;
  ui.screenFlash.classList?.remove?.('flash-orange', 'flash-yellow');
  if (tone === 'orange') ui.screenFlash.classList?.add?.('flash-orange');
  if (tone === 'yellow') ui.screenFlash.classList?.add?.('flash-yellow');
  if (ui.screenFlash.style) ui.screenFlash.style.opacity = '1';
  flashResetTimer = 0.22;
}

function spawnHudPopup(text, variant = 'score-bonus') {
  if (!ui.popups || !doc || typeof doc.createElement !== 'function') return;
  const chip = doc.createElement('div');
  chip.className = `hud-popup-chip ${variant}`;
  chip.textContent = text;
  ui.popups.appendChild?.(chip);

  // Keep DOM lean
  while (ui.popups.children && ui.popups.children.length > 4) {
    ui.popups.removeChild?.(ui.popups.children[0]);
  }
  setTimeout(() => {
    if (chip.parentNode === ui.popups) {
      ui.popups.removeChild?.(chip);
    }
  }, 1800);
}

function showTrickToast(message, rating = 'FLOW') {
  if (!ui.trickToast) return;
  ui.trickToast.textContent = message;
  ui.trickToast.dataset.rating = rating;
  ui.trickToast.classList?.add?.('visible');
  toastHideTimer = 1.85;
}

function syncComboAndStems() {
  game.comboTier = computeComboTier(game.comboCount);
  game.comboMultiplier = computeComboMultiplier(game.comboCount);
  if (game.comboCount > game.bestCombo) game.bestCombo = game.comboCount;
  if (game.comboMultiplier > game.bestMultiplier) game.bestMultiplier = game.comboMultiplier;

  audio.setComboTier(game.comboTier);

  if (ui.comboBadge) ui.comboBadge.dataset.tier = String(game.comboTier);
  if (ui.comboMultiplier) ui.comboMultiplier.textContent = `x${game.comboMultiplier}`;
  if (ui.comboTierLabel) {
    ui.comboTierLabel.textContent = game.wasGrinding && game.comboCount > 0
      ? 'GRIND LOCK!'
      : TIER_LABELS[game.comboTier];
  }
  for (let i = 0; i < ui.stemPills.length; i++) {
    const pill = ui.stemPills[i];
    if (pill) {
      pill.classList?.toggle?.('active', i <= game.comboTier);
    }
  }
}

function addComboAction(delta = 1) {
  game.comboCount = Math.max(0, game.comboCount + delta);
  game.comboTimer = COMBO_FUSE_SEC;
  syncComboAndStems();
}

function computeRank() {
  if (game.score >= 16500 || (game.deliveries >= 4 && game.score >= 11500)) return 'S';
  if (game.score >= 9000 || game.deliveries >= 3) return 'A';
  if (game.score >= 3800 || game.deliveries >= 1) return 'B';
  return 'C';
}

function updateDispatchHud() {
  if (!mission.zone || !mission.kind) {
    if (ui.dispatchBadge) ui.dispatchBadge.textContent = 'STANDBY';
    if (ui.dispatchText) ui.dispatchText.textContent = '107.7 FM COURIER DISPATCH STANDING BY';
    if (ui.dispatchSub) ui.dispatchSub.textContent = 'PRESS START BROADCAST TO LAUNCH';
    if (ui.dispatchDistance) ui.dispatchDistance.textContent = '--';
    return;
  }
  const distStr = `${Math.max(0, Math.round(mission.currentDistance))}m`;
  const zoneUpper = mission.zone.name.toUpperCase();
  const hoodUpper = (mission.zone.neighborhood || 'MOUNTAIN VIEW').toUpperCase();

  if (ui.dispatchCard) ui.dispatchCard.dataset.kind = mission.kind;
  if (mission.kind === 'pickup') {
    if (ui.dispatchBadge) ui.dispatchBadge.textContent = 'PICKUP';
    if (ui.dispatchText) ui.dispatchText.textContent = `PICK UP BOOTLEG TAPE AT: ${zoneUpper} · ${distStr}`;
    if (ui.dispatchSub) ui.dispatchSub.textContent = `${hoodUpper} · FOLLOW CYAN ARROW TO HOLOGRAPHIC TAPE`;
  } else {
    if (ui.dispatchBadge) ui.dispatchBadge.textContent = 'DELIVER';
    if (ui.dispatchText) ui.dispatchText.textContent = `DELIVER TO: ${zoneUpper} · ${distStr}`;
    if (ui.dispatchSub) ui.dispatchSub.textContent = `${hoodUpper} · GRIND NEON RAILS FOR MAX FARE & TIME BONUS!`;
  }
  if (ui.dispatchDistance) ui.dispatchDistance.textContent = distStr;
}

function updateAudioButtonUi() {
  const live = audio.isPlaying && !isMuted;
  if (ui.onAirDot) ui.onAirDot.classList?.toggle?.('live', live);
  if (ui.btnAudioToggle) {
    ui.btnAudioToggle.textContent = isMuted ? '🔇 MUTED' : (audio.isPlaying ? '🔊 ON AIR' : '▶ AUDIO');
    ui.btnAudioToggle.classList?.toggle?.('muted', isMuted);
  }
}

function updateHudFrame(dt, beatPhase) {
  if (toastHideTimer > 0) {
    toastHideTimer = Math.max(0, toastHideTimer - dt);
    if (toastHideTimer <= 0 && ui.trickToast) {
      ui.trickToast.classList?.remove?.('visible');
    }
  }
  if (hitTagResetTimer > 0) {
    hitTagResetTimer = Math.max(0, hitTagResetTimer - dt);
    if (hitTagResetTimer <= 0 && ui.beatHitTag) {
      ui.beatHitTag.textContent = '118 BPM SYNC';
    }
  }
  if (flashResetTimer > 0) {
    flashResetTimer = Math.max(0, flashResetTimer - dt);
    if (flashResetTimer <= 0 && ui.screenFlash && ui.screenFlash.style) {
      ui.screenFlash.style.opacity = '0';
    }
  }

  // Timer & Score
  if (ui.timerDigits) ui.timerDigits.textContent = formatClock(game.timeRemaining);
  if (ui.timerCard) {
    ui.timerCard.classList?.toggle?.('urgent', game.phase === 'playing' && game.timeRemaining > 0 && game.timeRemaining <= 15);
  }
  if (ui.scoreValue) ui.scoreValue.textContent = Math.round(game.score).toLocaleString();
  if (ui.deliveriesValue) {
    ui.deliveriesValue.textContent = `${game.deliveries} ${game.deliveries === 1 ? 'TAPE' : 'TAPES'}`;
  }

  // Combo fuse bar
  const fusePct = game.comboCount > 0 ? clamp((game.comboTimer / COMBO_FUSE_SEC) * 100, 0, 100) : 0;
  if (ui.comboTimerFill) {
    if (ui.comboTimerFill.style) ui.comboTimerFill.style.width = `${fusePct.toFixed(1)}%`;
    ui.comboTimerFill.classList?.toggle?.('grind-locked', Boolean(game.wasGrinding && game.comboCount > 0));
  }

  // Player telemetry
  const pState = player.getState();
  if (ui.speedValue) ui.speedValue.textContent = `${pState.speedMph} MPH`;
  if (ui.boostBarFill && ui.boostBarFill.style) {
    ui.boostBarFill.style.width = `${clamp(pState.boostMeter * 100, 0, 100).toFixed(1)}%`;
  }

  // Station bar & 4-Stem VU meters
  const barInfo = audio.getBarAndBeat();
  if (ui.barReadout) {
    if (barInfo.isPlaying) {
      const barNum = String((barInfo.bar % 16) + 1).padStart(2, '0');
      ui.barReadout.textContent = `118 BPM · BAR ${barNum}.${barInfo.beat + 1}`;
    } else {
      ui.barReadout.textContent = '118 BPM · STANDBY';
    }
  }

  const levels = audio.getStemLevels();
  const spec = audio.getSpectrum();
  const pulse = Math.pow(1 - clamp(beatPhase, 0, 1), 2.0);
  const stemEnergies = [
    levels.drums * (0.52 + ((spec[2] || 0) / 255) * 0.48 + pulse * 0.22),
    levels.bass * (0.48 + ((spec[6] || 0) / 255) * 0.52),
    levels.rhodes * (0.45 + ((spec[14] || 0) / 255) * 0.55),
    levels.lead * (0.45 + ((spec[23] || 0) / 255) * 0.55)
  ];
  for (let i = 0; i < ui.stemFills.length; i++) {
    const fill = ui.stemFills[i];
    if (fill && fill.style) {
      const pct = audio.isPlaying ? clamp(stemEnergies[i] * 100, 0, 100) : (i <= game.comboTier ? 28 : 0);
      fill.style.width = `${pct.toFixed(0)}%`;
    }
  }

  // Beat Sync Ring & Metronome Bars
  const approach = 1.0 - Math.abs(beatPhase < 0.5 ? beatPhase * 2 : (1 - beatPhase) * 2);
  const onDownbeat = beatPhase < 0.16 || beatPhase > 0.88;
  if (ui.beatSyncWidget) ui.beatSyncWidget.classList?.toggle?.('downbeat', onDownbeat);
  if (ui.beatRingPulse && ui.beatRingPulse.style) {
    const ringScale = 0.48 + (1 - beatPhase) * 0.62;
    ui.beatRingPulse.style.transform = `scale(${ringScale.toFixed(3)})`;
    ui.beatRingPulse.style.opacity = `${(0.32 + pulse * 0.68).toFixed(2)}`;
  }
  const travelPct = clamp((1 - beatPhase) * 82, 0, 82);
  if (ui.beatBarLeft && ui.beatBarLeft.style) ui.beatBarLeft.style.left = `${travelPct.toFixed(1)}%`;
  if (ui.beatBarRight && ui.beatBarRight.style) ui.beatBarRight.style.right = `${travelPct.toFixed(1)}%`;
  void approach;
}

// ---------------------------------------------------------------------------
// 6. PLAYER CALLBACKS (BEAT-QUANTIZED TRICKS & MINI-TAPE PICKUPS)
// ---------------------------------------------------------------------------
player.onTrick = ({ trickName, rating, basePoints, points, isGrinding }) => {
  if (game.phase !== 'playing') return;

  game.totalTricks += 1;
  if (rating === 'PERFECT' || rating === 'GOOD') {
    game.onBeatTricks += 1;
  }
  if (rating === 'PERFECT') {
    game.perfectTricks += 1;
  }

  addComboAction(1);

  const rawPts = Number.isFinite(points) ? points : (basePoints || 300);
  const grindBonus = isGrinding ? 1.15 : 1.0;
  const awarded = Math.round(rawPts * grindBonus * game.comboMultiplier);
  game.score += awarded;

  const prefix = rating === 'PERFECT'
    ? '⚡ PERFECT BEAT!'
    : rating === 'GOOD'
      ? '🔥 ON BEAT!'
      : '🛹 FLOW TRICK!';
  showTrickToast(`${prefix} ${trickName} +${awarded.toLocaleString()}`, rating);

  if (ui.beatHitTag) {
    ui.beatHitTag.textContent = rating === 'PERFECT' ? '⚡ PERFECT x2.0' : rating === 'GOOD' ? '🔥 GOOD x1.4' : 'FLOW x1.0';
    hitTagResetTimer = 1.1;
  }
  if (rating === 'PERFECT') {
    triggerScreenFlash('yellow');
  }
};

player.onPickupCollected = (count) => {
  if (game.phase !== 'playing' || !Number.isFinite(count) || count <= 0) return;
  game.tapesCollected += count;
  addComboAction(count);
  const pts = Math.round(150 * count * game.comboMultiplier);
  game.score += pts;
  showTrickToast(`📼 MINI-TAPE BOOST x${count} +${pts.toLocaleString()}`, 'GOOD');
};

// ---------------------------------------------------------------------------
// 7. RUN LIFECYCLE: START BROADCAST, MISSION CHECKS & SIGN-OFF MODAL
// ---------------------------------------------------------------------------
function startRun() {
  ui.startOverlay?.classList?.add?.('hidden');
  ui.resultsOverlay?.classList?.add?.('hidden');

  game.phase = 'playing';
  game.timeRemaining = RUN_DURATION_SEC;
  game.runElapsed = 0;
  game.score = 0;
  game.deliveries = 0;
  game.tapesCollected = 0;
  game.comboCount = 0;
  game.comboTier = 0;
  game.comboMultiplier = 1;
  game.comboTimer = 0;
  game.bestCombo = 0;
  game.bestMultiplier = 1;
  game.totalTricks = 0;
  game.onBeatTricks = 0;
  game.perfectTricks = 0;
  game.wasGrinding = false;
  game.grindStreakTimer = 0;
  game.grindScoreCarry = 0;
  game.lastCountdownTickSec = 11;
  mission.recentZoneIds.length = 0;

  if (!isMuted) {
    audio.start();
  }
  audio.setGrinding(false, 0);
  syncComboAndStems();
  updateAudioButtonUi();

  if (world) {
    world.resetPickups?.();
    player.reset(world.spawnPoint);
  } else {
    player.reset({ x: -75, y: 0, z: 535, yaw: 0 });
  }

  // Prime player world/audio references & chase camera on frame 0
  const beatPhase = audio.getBeatPhase();
  player.update({ dt: 0, elapsed: 0, input: null, world, audio, beatPhase });
  player.updateCamera(camera, 1 / 60);

  if (world) {
    const startPos = player.getState().position;
    const firstPickup = pickPickupZone(startPos, []);
    assignMissionZone(firstPickup, 'pickup', startPos);
  }

  showTrickToast('📡 107.7 FM ON AIR — GRAB THE BOOTLEG TAPE!', 'PERFECT');
  updateHudFrame(0, beatPhase);
  return getState();
}

function finishBroadcast() {
  if (game.phase === 'gameover') return;
  game.phase = 'gameover';
  game.timeRemaining = 0;

  audio.setGrinding(false, 0);
  audio.setComboTier(0);
  if (!isMuted) {
    audio.playCountdownTick(true);
  }

  world?.setActiveZone?.(null, null);
  player.setTargetPosition(null);

  const rank = computeRank();
  const onBeatPct = game.totalTricks > 0
    ? Math.round((game.onBeatTricks / game.totalTricks) * 100)
    : 0;

  if (ui.resultsRank) ui.resultsRank.textContent = rank;
  if (ui.resultsRankTitle) ui.resultsRankTitle.textContent = RANK_TITLES[rank] || RANK_TITLES.B;
  if (ui.resultsScore) ui.resultsScore.textContent = Math.round(game.score).toLocaleString();
  if (ui.resultsDeliveries) ui.resultsDeliveries.textContent = String(game.deliveries);
  if (ui.resultsBestCombo) ui.resultsBestCombo.textContent = `x${game.bestMultiplier} · ${game.bestCombo}`;
  if (ui.resultsOnBeatPct) ui.resultsOnBeatPct.textContent = `${onBeatPct}%`;

  ui.resultsOverlay?.classList?.remove?.('hidden');
  updateHudFrame(0, audio.getBeatPhase());
}

function respawnCourier() {
  if (game.phase !== 'playing' || !world) return;
  player.reset(world.spawnPoint);
  if (mission.zone && mission.kind) {
    player.setTargetPosition({ x: mission.zone.x, y: mission.zone.y, z: mission.zone.z }, mission.kind);
  }
  player.updateCamera(camera, 1 / 60);
  showTrickToast('↻ BACK AT CASTRO PLAZA', 'FLOW');
}

function evaluateMissionProgress(pState) {
  if (!world || !mission.zone || !mission.kind) return;
  const pos = pState.position;
  const horizDist = Math.hypot(pos.x - mission.zone.x, pos.z - mission.zone.z);
  mission.currentDistance = horizDist;
  updateDispatchHud();

  // Trigger pickup or dropoff when entering 14m radius of active zone beacon
  if (horizDist <= ZONE_TRIGGER_RADIUS_M && pos.y <= (mission.zone.y || 0) + 28.0) {
    if (mission.kind === 'pickup') {
      const pickedZone = mission.zone;
      audio.playPickupSfx();
      addComboAction(1);

      const pickupPts = Math.round((400 + Math.min(220, pState.speed * 4.0)) * game.comboMultiplier);
      game.score += pickupPts;

      spawnHudPopup(`+${pickupPts.toLocaleString()} PTS · TAPE PICKUP!`, 'score-bonus');
      showTrickToast(`📼 BOOTLEG TAPE SECURED! RACE TO TRANSMITTER!`, 'GOOD');
      triggerScreenFlash('cyan');

      const dropZone = pickDropoffZone(pos, [pickedZone.id]);
      assignMissionZone(dropZone, 'dropoff', pos);
    } else if (mission.kind === 'dropoff') {
      const deliveredZone = mission.zone;
      const legTime = Math.max(0.5, game.runElapsed - mission.dispatchedAt);
      const speedRatio = clamp(mission.parSeconds / legTime, 0.4, 2.0);
      const legRank = speedRatio >= 1.2 ? 'S' : speedRatio >= 0.92 ? 'A' : speedRatio >= 0.68 ? 'B' : 'C';

      game.deliveries += 1;
      addComboAction(2);
      audio.playDeliverySfx(legRank);

      const baseFare = 1400 + Math.round(mission.startDistance * 1.45);
      const speedBonus = Math.round(650 * speedRatio);
      const deliveryPts = Math.round((baseFare + speedBonus) * game.comboMultiplier);
      game.score += deliveryPts;

      // +12s..+20s Broadcast Time Extension
      const timeBonus = Math.round(clamp(12 + (speedRatio - 0.4) * 5.5, 12, 20));
      game.timeRemaining += timeBonus;
      if (game.timeRemaining > 10) {
        game.lastCountdownTickSec = 11;
      }

      spawnHudPopup(`+${timeBonus}s TIME BONUS!`, 'time-bonus');
      spawnHudPopup(`+${deliveryPts.toLocaleString()} PTS`, 'score-bonus');
      showTrickToast(`📡 DELIVERY #${game.deliveries} COMPLETE! +${deliveryPts.toLocaleString()}`, 'PERFECT');
      triggerScreenFlash('orange');

      const nextPickup = pickPickupZone(pos, [deliveredZone.id]);
      assignMissionZone(nextPickup, 'pickup', pos);
    }
  }
}

// ---------------------------------------------------------------------------
// 8. DETERMINISTIC SIMULATION STEP & RENDER LOOP
// ---------------------------------------------------------------------------
function buildMergedInput() {
  if (externalInputOverride) {
    return externalInputOverride;
  }
  const hasTouch = touchState.active || touchState.jump || touchState.trick || touchState.boost;
  if (!hasTouch) {
    return { keys: keysHeld };
  }
  return {
    keys: keysHeld,
    throttle: touchState.active ? Math.max(0.85, touchState.throttle) : undefined,
    steer: touchState.active ? touchState.steer : undefined,
    jump: touchState.jump,
    trick: touchState.trick,
    boost: touchState.boost
  };
}

function step(dt = 1 / 60, customInput = null) {
  const safeDt = Number.isFinite(dt) ? clamp(dt, 0.0, 0.1) : 1 / 60;
  previewElapsed += safeDt;
  const beatPhase = audio.isPlaying
    ? audio.getBeatPhase()
    : ((previewElapsed * (118 / 60)) % 1);

  if (game.phase === 'playing') {
    game.runElapsed += safeDt;

    const activeInput = customInput !== null ? customInput : buildMergedInput();
    player.update({
      dt: safeDt,
      elapsed: game.runElapsed,
      input: activeInput,
      world,
      audio,
      beatPhase
    });
    player.updateCamera(camera, safeDt);

    const pState = player.getState();

    // Rail-grind combo lock, entry bonus & sustained grind flow points
    if (pState.isGrinding) {
      if (!game.wasGrinding) {
        addComboAction(1);
        const lockPts = Math.round(150 * game.comboMultiplier);
        game.score += lockPts;
        game.grindStreakTimer = 0;
      }
      // Pause & hold 5.5s combo fuse at full while actively rail-grinding!
      if (game.comboCount > 0) {
        game.comboTimer = COMBO_FUSE_SEC;
      }
      game.grindStreakTimer += safeDt;
      if (game.grindStreakTimer >= 1.5) {
        game.grindStreakTimer -= 1.5;
        addComboAction(1);
      }
      game.grindScoreCarry += 180 * safeDt * game.comboMultiplier;
      if (game.grindScoreCarry >= 1) {
        const whole = Math.floor(game.grindScoreCarry);
        game.score += whole;
        game.grindScoreCarry -= whole;
      }
      if (ui.comboTierLabel) ui.comboTierLabel.textContent = 'GRIND LOCK!';
    } else {
      if (game.wasGrinding && ui.comboTierLabel) {
        ui.comboTierLabel.textContent = TIER_LABELS[game.comboTier];
      }
      game.grindStreakTimer = 0;

      // 5.5s Combo & Stem Decay when off rails
      if (game.comboCount > 0 && safeDt > 0) {
        game.comboTimer -= safeDt;
        if (game.comboTimer <= 0) {
          if (game.comboTier === 3) {
            game.comboCount = 5;
            game.comboTimer = 2.4;
          } else if (game.comboTier === 2) {
            game.comboCount = 2;
            game.comboTimer = 2.2;
          } else {
            game.comboCount = 0;
            game.comboTimer = 0;
          }
          syncComboAndStems();
        }
      }
    }
    game.wasGrinding = pState.isGrinding;

    // Evaluate Crazy-Taxi Pickup / Dropoff triggers (may add +12s..+20s time bonus)
    evaluateMissionProgress(pState);

    // Broadcast Countdown Timer
    if (safeDt > 0) {
      game.timeRemaining = Math.max(0, game.timeRemaining - safeDt);
      const wholeSec = Math.ceil(game.timeRemaining);
      if (wholeSec >= 1 && wholeSec <= 10 && wholeSec < game.lastCountdownTickSec) {
        game.lastCountdownTickSec = wholeSec;
        if (!isMuted) audio.playCountdownTick(false);
      }
      if (game.timeRemaining <= 0) {
        world?.update?.({
          dt: safeDt,
          elapsed: game.runElapsed,
          beatPhase,
          comboTier: game.comboTier,
          playerPos: pState.position
        });
        finishBroadcast();
        return getState();
      }
    }

    world?.update?.({
      dt: safeDt,
      elapsed: game.runElapsed,
      beatPhase,
      comboTier: game.comboTier,
      playerPos: pState.position
    });
  } else {
    // Scenic dusk orbit camera behind title & results modals
    const anchor = world ? world.spawnPoint : { x: -75, y: 0, z: 535 };
    const orbitAngle = previewElapsed * 0.16;
    const radius = 58;
    const camX = anchor.x - 24 + Math.sin(orbitAngle) * radius;
    const camZ = anchor.z - 95 + Math.cos(orbitAngle) * radius;
    camera.position?.set?.(camX, 26 + Math.sin(previewElapsed * 0.4) * 3.5, camZ);
    camera.up?.set?.(0, 1, 0);
    camera.lookAt?.(anchor.x - 36, 16, anchor.z - 165);

    world?.update?.({
      dt: safeDt,
      elapsed: previewElapsed,
      beatPhase,
      comboTier: game.phase === 'title' ? 2 : 0,
      playerPos: anchor
    });
  }

  updateHudFrame(safeDt, beatPhase);
  return getState();
}

function renderScene() {
  if (composer && typeof composer.render === 'function') {
    composer.render();
  } else {
    renderer.render?.(scene, camera);
  }
}

let lastRafMs = null;
let docHidden = false;

function animate(rafTimestamp) {
  if (typeof win.requestAnimationFrame === 'function') {
    win.requestAnimationFrame(animate);
  }
  if (docHidden) {
    lastRafMs = typeof rafTimestamp === 'number' ? rafTimestamp : null;
    return;
  }

  let dt = 1 / 60;
  if (typeof rafTimestamp === 'number' && Number.isFinite(rafTimestamp)) {
    if (lastRafMs !== null && rafTimestamp > lastRafMs) {
      dt = clamp((rafTimestamp - lastRafMs) / 1000, 0.001, 0.1);
    }
    lastRafMs = rafTimestamp;
  }

  step(dt);
  renderScene();
}

// ---------------------------------------------------------------------------
// 9. KEYBOARD, BUTTON & COARSE-POINTER TOUCH CONTROLS
// ---------------------------------------------------------------------------
function toggleAudioMute() {
  if (!audio.isPlaying) {
    isMuted = false;
    audio.start();
    audio.setComboTier(game.comboTier);
  } else {
    isMuted = true;
    audio.stop();
  }
  updateAudioButtonUi();
}

win.addEventListener?.('keydown', (e) => {
  if (!e || e.repeat) {
    if (e && e.code) keysHeld.add(e.code);
    return;
  }
  const code = e.code || '';
  const key = e.key || '';

  if (
    code === 'Space' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight'
  ) {
    e.preventDefault?.();
  }

  if (game.phase !== 'playing') {
    if ((code === 'Space' || code === 'Enter' || code === 'KeyR') && world) {
      if (game.phase === 'gameover' || code !== 'KeyR') {
        startRun();
      }
    }
    return;
  }

  if (code) keysHeld.add(code);
  if (key) keysHeld.add(key);

  if (code === 'KeyM' || key === 'm' || key === 'M') {
    toggleAudioMute();
  } else if (code === 'KeyR' || key === 'r' || key === 'R') {
    respawnCourier();
  }
});

win.addEventListener?.('keyup', (e) => {
  if (!e) return;
  if (e.code) keysHeld.delete(e.code);
  if (e.key) keysHeld.delete(e.key);
});

win.addEventListener?.('blur', () => {
  keysHeld.clear();
  touchState.active = false;
  touchState.steer = 0;
  touchState.jump = false;
  touchState.trick = false;
  touchState.boost = false;
});

doc?.addEventListener?.('visibilitychange', () => {
  docHidden = Boolean(doc.hidden);
});

win.addEventListener?.('resize', () => {
  const { w, h } = getViewportSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix?.();
  renderer.setSize?.(w, h);
  composer?.setSize?.(w, h);
  bloomPass?.setSize?.(w, h);
});

ui.btnStartBroadcast?.addEventListener?.('click', () => startRun());
ui.btnRideAgain?.addEventListener?.('click', () => startRun());
ui.btnAudioToggle?.addEventListener?.('click', () => toggleAudioMute());
ui.btnRespawn?.addEventListener?.('click', () => respawnCourier());

// Virtual Steer Pad (touch/pointer drag steers + auto-throttles forward)
if (ui.touchSteerPad) {
  const updateSteerFromEvent = (e) => {
    const rect = ui.touchSteerPad.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clamp((e.clientX - cx) / (rect.width * 0.42), -1, 1);
    const dy = clamp((e.clientY - cy) / (rect.height * 0.42), -1, 1);
    touchState.steer = Math.abs(dx) < 0.08 ? 0 : dx;
    touchState.throttle = dy > 0.65 ? 0 : 1;
    if (ui.touchSteerKnob && ui.touchSteerKnob.style) {
      ui.touchSteerKnob.style.transform = `translate(${(dx * 28).toFixed(1)}px, ${(dy * 24).toFixed(1)}px)`;
    }
  };

  const releaseSteer = () => {
    touchState.active = false;
    touchState.pointerId = null;
    touchState.steer = 0;
    touchState.throttle = 0;
    if (ui.touchSteerKnob && ui.touchSteerKnob.style) {
      ui.touchSteerKnob.style.transform = 'translate(0px, 0px)';
    }
  };

  ui.touchSteerPad.addEventListener?.('pointerdown', (e) => {
    e.preventDefault?.();
    touchState.active = true;
    touchState.pointerId = e.pointerId;
    ui.touchSteerPad.setPointerCapture?.(e.pointerId);
    updateSteerFromEvent(e);
  });
  ui.touchSteerPad.addEventListener?.('pointermove', (e) => {
    if (!touchState.active || (touchState.pointerId !== null && e.pointerId !== touchState.pointerId)) return;
    updateSteerFromEvent(e);
  });
  ui.touchSteerPad.addEventListener?.('pointerup', releaseSteer);
  ui.touchSteerPad.addEventListener?.('pointercancel', releaseSteer);
}

function bindTouchActionButton(btn, prop, directTrigger) {
  if (!btn) return;
  btn.addEventListener?.('pointerdown', (e) => {
    e.preventDefault?.();
    touchState[prop] = true;
    if (game.phase === 'playing' && typeof directTrigger === 'function') {
      directTrigger();
    }
  });
  const clear = () => {
    touchState[prop] = false;
  };
  btn.addEventListener?.('pointerup', clear);
  btn.addEventListener?.('pointercancel', clear);
  btn.addEventListener?.('pointerleave', clear);
}

bindTouchActionButton(ui.btnTouchJump, 'jump', () => player.triggerJump());
bindTouchActionButton(ui.btnTouchTrick, 'trick', () => player.triggerTrick());
bindTouchActionButton(ui.btnTouchBoost, 'boost', () => player.triggerBoost());

// ---------------------------------------------------------------------------
// 10. PUBLIC QA & INSPECTION INTERFACE (`window.PirateFrequency`)
// ---------------------------------------------------------------------------
function getState() {
  return {
    phase: game.phase,
    isRunning: game.phase === 'playing',
    isGameOver: game.phase === 'gameover',
    timeRemaining: game.timeRemaining,
    elapsed: game.runElapsed,
    score: game.score,
    deliveries: game.deliveries,
    deliveriesCompleted: game.deliveries,
    tapesCollected: game.tapesCollected,
    comboCount: game.comboCount,
    comboTier: game.comboTier,
    comboMultiplier: game.comboMultiplier,
    comboTimer: game.comboTimer,
    bestCombo: game.bestCombo,
    bestMultiplier: game.bestMultiplier,
    totalTricks: game.totalTricks,
    onBeatTricks: game.onBeatTricks,
    perfectTricks: game.perfectTricks,
    onBeatPercent: game.totalTricks > 0 ? Math.round((game.onBeatTricks / game.totalTricks) * 100) : 0,
    rank: computeRank(),
    mission: {
      kind: mission.kind,
      zoneId: mission.zone ? mission.zone.id : null,
      zoneName: mission.zone ? mission.zone.name : null,
      neighborhood: mission.zone ? mission.zone.neighborhood : null,
      target: mission.zone ? { x: mission.zone.x, y: mission.zone.y, z: mission.zone.z } : null,
      distance: mission.currentDistance
    },
    player: player.getState(),
    audioPlaying: audio.isPlaying,
    muted: isMuted
  };
}

function setInputOverride(inputObjOrNull) {
  externalInputOverride = inputObjOrNull;
}

const pirateFrequencyApi = {
  startRun,
  resetRun: startRun,
  endRun: finishBroadcast,
  step,
  setInputOverride,
  getState,
  world: null,
  player,
  audio,
  scene,
  camera,
  renderer,
  composer,
  ready: null
};

win.PirateFrequency = pirateFrequencyApi;

// ---------------------------------------------------------------------------
// 11. BOOT MOUNTAIN VIEW WORLD & START ANIMATION LOOP
// ---------------------------------------------------------------------------
async function bootPirateFrequency() {
  try {
    world = await createPirateWorld({
      THREE,
      scene,
      onProgress(pct, label) {
        const clampedPct = clamp(Math.round((Number(pct) || 0) * 100), 5, 100);
        if (ui.bootBarFill && ui.bootBarFill.style) {
          ui.bootBarFill.style.width = `${clampedPct}%`;
        }
        if (ui.bootStatusText && label) {
          ui.bootStatusText.textContent = label;
        }
      }
    });

    pirateFrequencyApi.world = world;
    player.reset(world.spawnPoint);
    player.update({ dt: 0, elapsed: 0, input: null, world, audio, beatPhase: 0 });

    // Preview initial dispatch readout on HUD card
    const previewPickup = pickPickupZone(world.spawnPoint, []);
    if (previewPickup) {
      mission.kind = 'pickup';
      mission.zone = previewPickup;
      mission.currentDistance = Math.round(
        Math.hypot(previewPickup.x - world.spawnPoint.x, previewPickup.z - world.spawnPoint.z)
      );
      world.setActiveZone(previewPickup.id, 'pickup');
      updateDispatchHud();
    }

    if (ui.bootBarFill && ui.bootBarFill.style) ui.bootBarFill.style.width = '100%';
    if (ui.bootStatusText) {
      ui.bootStatusText.textContent = '107.7 FM Signal Locked — Click START BROADCAST or Press [SPACE]!';
    }
    if (ui.btnStartBroadcast) {
      ui.btnStartBroadcast.disabled = false;
    }
  } catch (err) {
    if (ui.bootStatusText) {
      ui.bootStatusText.textContent = `Signal interference loading map: ${err && err.message ? err.message : String(err)}`;
    }
  }
  return pirateFrequencyApi;
}

pirateFrequencyApi.ready = bootPirateFrequency();
await pirateFrequencyApi.ready;

if (typeof win.requestAnimationFrame === 'function') {
  win.requestAnimationFrame(animate);
}
