// Tape No. 08: Aether Broadside (1889) — Game Director, Dual-Mode Admiralty HUD & Camera Rig
// Integrates ./aether-broadside/ships.js, ./aether-broadside/systems.js, and ./aether-broadside/audio.js

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createBroadsideWorld } from './aether-broadside/ships.js';
import { createBroadsideSimulation, computeSailTrimMultiplier } from './aether-broadside/systems.js';
import { createBroadsideAudio } from './aether-broadside/audio.js';

const SUBSYSTEM_IDS = Object.freeze(['boiler', 'sponsons', 'gunDeck', 'rigging', 'propulsor']);
const BOILER_KEYS = Object.freeze(['propulsion', 'sponsons', 'ordnance']);
const STRATA_ORDER = Object.freeze(['low', 'mid', 'high']);
const STRATA_METERS = Object.freeze({ low: -6, mid: 2, high: 11 });

const SUBSYSTEM_LABELS = Object.freeze({
  boiler: { code: '01', short: 'BOILER', spec: '15.5-BAR CORE' },
  sponsons: { code: '02', short: 'SPONSONS', spec: 'AETHER LIFT' },
  gunDeck: { code: '03', short: 'GUN DECK', spec: '12 BRASS GUNS' },
  rigging: { code: '04', short: 'RIGGING', spec: '3-MAST SAILS' },
  propulsor: { code: '05', short: 'PROPULSOR', spec: 'KORT NOZZLE' }
});

// True isometric elevation angle: arctan(1 / sqrt(2)) = 35.2643897 deg
const ISO_ELEVATION_RAD = Math.atan(1 / Math.sqrt(2));
const CAD_TACTICAL_TIME_SCALE = 0.45;
const BROADSIDE_HALF_CONE_RAD = (28 * Math.PI) / 180;
const BROADSIDE_RANGE_M = 215;

const CAD_PIN_SLOTS = Object.freeze({
  boiler: { dx: -162, dy: -88 },
  rigging: { dx: 162, dy: -96 },
  gunDeck: { dx: -176, dy: 68 },
  sponsons: { dx: 176, dy: 16 },
  propulsor: { dx: 142, dy: 106 }
});

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteOr(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function wrapAngle(a) {
  if (!Number.isFinite(a)) return 0;
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function shortestAngleDiff(from, to) {
  return wrapAngle(to - from);
}

function headingFromXZ(dx, dz) {
  return Math.atan2(-dx, -dz);
}

// ---------------------------------------------------------------------------
// 1. DOM ELEMENT BINDINGS (100% 1:1 with aether-broadside.html)
// ---------------------------------------------------------------------------
const doc = typeof document !== 'undefined' ? document : null;
const win = typeof window !== 'undefined' ? window : globalThis;
const byId = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);

const ui = {
  stage: byId('three-stage'),
  screenFlash: byId('screen-flash'),

  // Top Admiralty Bar
  linkArchive: byId('link-archive'),
  waveReadout: byId('wave-readout'),
  waveNameReadout: byId('wave-name-readout'),
  scoreReadout: byId('score-readout'),
  tacticalTimeBadge: byId('tactical-time-badge'),
  btnViewMode: byId('btn-view-mode'),
  viewModeDot: byId('view-mode-dot'),
  viewModeLabel: byId('view-mode-label'),
  btnCadTheme: byId('btn-cad-theme'),
  cadThemeLabel: byId('cad-theme-label'),
  btnAudioToggle: byId('btn-audio-toggle'),
  audioLampDot: byId('audio-lamp-dot'),
  audioToggleLabel: byId('audio-toggle-label'),

  // Upper-Center Telegraph Toast
  toast: byId('admiralty-toast'),
  toastTag: byId('admiralty-toast-tag'),
  toastText: byId('admiralty-toast-text'),

  // Left Engineering Panel — 15.5-Bar Scotch Marine Aether-Boiler
  boilerPanel: byId('boiler-panel'),
  btnBoilerBalance: byId('btn-boiler-balance'),
  boilerPressureValue: byId('boiler-pressure-value'),
  boilerUnallocatedValue: byId('boiler-unallocated-value'),
  boilerPressureFill: byId('boiler-pressure-fill'),
  btnOverpressure: byId('btn-overpressure'),
  overpressureStatus: byId('overpressure-status'),

  rowAllocPropulsion: byId('row-alloc-propulsion'),
  allocPropulsionVal: byId('alloc-propulsion-val'),
  btnPropulsionDec: byId('btn-propulsion-dec'),
  btnPropulsionInc: byId('btn-propulsion-inc'),
  pipsPropulsion: byId('pips-propulsion'),

  rowAllocSponsons: byId('row-alloc-sponsons'),
  allocSponsonsVal: byId('alloc-sponsons-val'),
  btnSponsonsDec: byId('btn-sponsons-dec'),
  btnSponsonsInc: byId('btn-sponsons-inc'),
  pipsSponsons: byId('pips-sponsons'),

  rowAllocOrdnance: byId('row-alloc-ordnance'),
  allocOrdnanceVal: byId('alloc-ordnance-val'),
  ordnanceReloadReadout: byId('ordnance-reload-readout'),
  btnOrdnanceDec: byId('btn-ordnance-dec'),
  btnOrdnanceInc: byId('btn-ordnance-inc'),
  pipsOrdnance: byId('pips-ordnance'),

  stratumAltReadout: byId('stratum-alt-readout'),
  btnStratumLow: byId('btn-stratum-low'),
  btnStratumMid: byId('btn-stratum-mid'),
  btnStratumHigh: byId('btn-stratum-high'),
  stratumEvasionNote: byId('stratum-evasion-note'),

  btnVentSteam: byId('btn-vent-steam'),
  ventSteamStatus: byId('vent-steam-status'),

  // Right Squadron & Compact 3D Damage Control
  enemyLedgerList: byId('enemy-ledger-list'),
  subsystemStrip3d: byId('subsystem-strip-3d'),
  crewAvailableBadge: byId('crew-available-badge'),
  pills3d: {
    boiler: byId('pill-sub-boiler'),
    sponsons: byId('pill-sub-sponsons'),
    gunDeck: byId('pill-sub-gunDeck'),
    rigging: byId('pill-sub-rigging'),
    propulsor: byId('pill-sub-propulsor')
  },

  // CAD X-Ray Damage-Control Overlay
  cadOverlay: byId('cad-overlay'),
  cadCrewReadout: byId('cad-crew-readout'),
  cadScaleReadout: byId('cad-scale-readout'),
  cadLeaderSvg: byId('cad-leader-svg'),
  cadLines: {
    boiler: byId('cad-line-boiler'),
    sponsons: byId('cad-line-sponsons'),
    gunDeck: byId('cad-line-gunDeck'),
    rigging: byId('cad-line-rigging'),
    propulsor: byId('cad-line-propulsor')
  },
  cadDots: {
    boiler: byId('cad-dot-boiler'),
    sponsons: byId('cad-dot-sponsons'),
    gunDeck: byId('cad-dot-gunDeck'),
    rigging: byId('cad-dot-rigging'),
    propulsor: byId('cad-dot-propulsor')
  },
  cadPins: {
    boiler: byId('cad-pin-boiler'),
    sponsons: byId('cad-pin-sponsons'),
    gunDeck: byId('cad-pin-gunDeck'),
    rigging: byId('cad-pin-rigging'),
    propulsor: byId('cad-pin-propulsor')
  },

  // Bottom Gunnery & Helm Deck
  portArcBadge: byId('port-arc-badge'),
  btnFirePort: byId('btn-fire-port'),
  portReloadFill: byId('port-reload-fill'),
  portReloadStatus: byId('port-reload-status'),

  windArrowGroup: byId('wind-arrow-group'),
  shipHeadingGroup: byId('ship-heading-group'),
  windKnotsValue: byId('wind-knots-value'),
  sailTrimValue: byId('sail-trim-value'),

  hullStatusTag: byId('hull-status-tag'),
  hullValue: byId('hull-value'),
  hullBarFill: byId('hull-bar-fill'),
  btnRudderPort: byId('btn-rudder-port'),
  rudderReadout: byId('rudder-readout'),
  btnRudderStarboard: byId('btn-rudder-starboard'),

  speedKnotsValue: byId('speed-knots-value'),
  throttlePctValue: byId('throttle-pct-value'),
  throttleBarFill: byId('throttle-bar-fill'),
  btnThrottleDown: byId('btn-throttle-down'),
  btnThrottleUp: byId('btn-throttle-up'),

  btnAmmoRoundshot: byId('btn-ammo-roundshot'),
  btnAmmoChainshot: byId('btn-ammo-chainshot'),
  btnAmmoAethershell: byId('btn-ammo-aethershell'),

  starboardArcBadge: byId('starboard-arc-badge'),
  btnFireStarboard: byId('btn-fire-starboard'),
  starboardReloadFill: byId('starboard-reload-fill'),
  starboardReloadStatus: byId('starboard-reload-status'),

  // Title Commission & Victory / Scuttled Dispatch Modals
  titleOverlay: byId('title-overlay'),
  linkTitleArchive: byId('link-title-archive'),
  btnWeighAnchor: byId('btn-weigh-anchor'),

  dispatchModal: byId('dispatch-modal'),
  modalStamp: byId('modal-stamp'),
  modalTitle: byId('modal-title'),
  modalSubtitle: byId('modal-subtitle'),
  modalRank: byId('modal-rank'),
  modalScore: byId('modal-score'),
  modalWaves: byId('modal-waves'),
  modalHull: byId('modal-hull'),
  modalSunk: byId('modal-sunk'),
  modalBroadsides: byId('modal-broadsides'),
  linkModalArchive: byId('link-modal-archive'),
  btnSailAgain: byId('btn-sail-again')
};

// ---------------------------------------------------------------------------
// 2. THREE.JS SCENE, RENDERER & EFFECTCOMPOSER (RenderPass + Bloom + Output)
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
const camera = new THREE.PerspectiveCamera(58, initVp.w / initVp.h, 0.4, 2400);
camera.position.set(0, 26, 162);

const raycaster = new THREE.Raycaster();
const ndcPointer = new THREE.Vector2();

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
    renderer.toneMappingExposure = 1.05;
  }
  if (ui.stage && renderer.domElement && typeof ui.stage.appendChild === 'function') {
    ui.stage.appendChild(renderer.domElement);
  }
} catch (_) {
  renderer = {
    domElement: doc?.createElement ? doc.createElement('canvas') : {},
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

    // Subtle UnrealBloomPass for cannon muzzle flash & emerald Scotch boiler glow
    bloomPass = new UnrealBloomPass(new THREE.Vector2(initVp.w, initVp.h), 0.36, 0.42, 0.85);
    composer.addPass(bloomPass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);
  }
} catch (_) {
  composer = null;
}

// ---------------------------------------------------------------------------
// 3. SUBSYSTEM INSTANTIATION (SIMULATION + 3D SHIPS + 1889 WEB AUDIO)
// ---------------------------------------------------------------------------
const sim = createBroadsideSimulation();
const audio = createBroadsideAudio();
const ships = createBroadsideWorld({ THREE, scene });
ships.setObstacles(sim.getObstacles());

// ---------------------------------------------------------------------------
// 4. DIRECTOR STATE, DUAL CAMERA RIG & CAMPAIGN TELEMETRY
// ---------------------------------------------------------------------------
let viewMode = '3d';     // '3d' | 'cad'
let cadTheme = 'dark';   // 'dark' | 'light'
let isMuted = false;
let focusedBoilerKey = 'propulsion';
let totalElapsed = 0;

let toastTimer = 0;
let flashTimer = 0;
let alertSfxCooldown = 0;
let lastAudioMixSync = -1;
let lastMixSignature = '';
let lastPhaseRendered = 'title';
let enemyLedgerSignature = '';

const campaignStats = {
  enemiesSunk: 0,
  broadsidesFired: 0
};

// Keyboard & HUD button hold states
const keysHeld = new Set();
const helmButtonHold = {
  port: false,
  starboard: false,
  throttleUp: false,
  throttleDown: false
};

// Dual Camera Rig state
const camRig = {
  // '3d' Gunnery Helm orbit parameters
  helmYawOffset: 0.0,     // Free 360-deg mouse drag to inspect Port / Starboard broadsides
  helmPitch: 0.27,        // ~15.5 deg elevation over quarterdeck
  helmDist: 52.0,         // Zoomable 32..96m

  // 'cad' Isometric X-Ray Schematic parameters (45 deg / 35.264 deg Admiralty axonometric)
  cadYawOffset: Math.PI * 0.25,
  cadLockToShip: true,
  cadZoom: 1.0,           // Mouse-wheel zoom 0.65..1.85x

  // Smoothed camera pose & recoil shake
  posX: 0,
  posY: 28,
  posZ: 162,
  lookX: 0,
  lookY: 4,
  lookZ: 102,
  fov: 58,
  roll: 0,
  shake: 0,
  recoilLateral: 0,
  initialized: false
};

// Build interactive 10-cell pip bars for each boiler channel
const pipCellMap = {
  propulsion: [],
  sponsons: [],
  ordnance: []
};

function initBoilerPipBars() {
  const containers = {
    propulsion: ui.pipsPropulsion,
    sponsons: ui.pipsSponsons,
    ordnance: ui.pipsOrdnance
  };

  for (let k = 0; k < BOILER_KEYS.length; k++) {
    const key = BOILER_KEYS[k];
    const parent = containers[key];
    if (!parent || typeof doc?.createElement !== 'function') continue;

    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }

    const cells = [];
    for (let i = 0; i < 10; i++) {
      const cell = doc.createElement('div');
      cell.className = 'pip-cell';
      const targetBar = i + 1;
      cell.title = `Set ${key} to ${targetBar.toFixed(1)} bar`;
      cell.addEventListener?.('click', (ev) => {
        ev?.stopPropagation?.();
        setFocusedBoilerChannel(key);
        const cur = finiteOr(sim.getState().boiler?.allocation?.[key], 5.0);
        const delta = targetBar - cur;
        if (Math.abs(delta) >= 0.25) {
          sim.allocateBoiler(key, delta);
          syncHudFromState(sim.getState());
        }
      });
      parent.appendChild?.(cell);
      cells.push(cell);
    }
    pipCellMap[key] = cells;
  }
}

function setFocusedBoilerChannel(key) {
  if (!BOILER_KEYS.includes(key)) return;
  focusedBoilerKey = key;
  if (ui.rowAllocPropulsion?.dataset) ui.rowAllocPropulsion.dataset.focused = String(key === 'propulsion');
  if (ui.rowAllocSponsons?.dataset) ui.rowAllocSponsons.dataset.focused = String(key === 'sponsons');
  if (ui.rowAllocOrdnance?.dataset) ui.rowAllocOrdnance.dataset.focused = String(key === 'ordnance');
}

// ---------------------------------------------------------------------------
// 5. VISUAL FEEDBACK HELPERS (TOASTS, VIGNETTE FLASH & DISPATCH MODAL)
// ---------------------------------------------------------------------------
function showToast(tag, message, tone = 'info', duration = 3.1) {
  toastTimer = duration;
  if (ui.toastTag) ui.toastTag.textContent = `${tag} //`;
  if (ui.toastText) ui.toastText.textContent = message;
  if (ui.toast?.dataset) {
    ui.toast.dataset.tone = tone;
    ui.toast.dataset.visible = 'true';
  }
}

function triggerScreenFlash(tone = 'hit', strength = 0.7) {
  flashTimer = 0.22;
  if (!ui.screenFlash) return;
  if (ui.screenFlash.dataset) {
    ui.screenFlash.dataset.tone = tone;
  }
  if (ui.screenFlash.style) {
    ui.screenFlash.style.opacity = String(clamp(strength, 0, 1));
  }
}

function computeAdmiraltyRank(score, hullRatio, victory) {
  if (!victory) return score >= 3500 ? 'B' : 'C';
  if (score >= 9500 && hullRatio >= 0.55) return 'S';
  if (score >= 7000 || hullRatio >= 0.45) return 'A';
  return 'B';
}

function openDispatchModal(outcome, simState) {
  const isVictory = outcome === 'victory';
  const hullPct = Math.round(clamp(finiteOr(simState.hull, 0) / Math.max(1, simState.maxHull), 0, 1) * 100);
  const rank = computeAdmiraltyRank(simState.score, hullPct / 100, isVictory);
  const wavesCleared = isVictory ? simState.maxWaves : Math.max(0, simState.wave - 1);

  if (ui.modalStamp) {
    ui.modalStamp.textContent = isVictory
      ? 'ADMIRALTY VICTORY DISPATCH'
      : 'CASUALTY DISPATCH // VESSEL SCUTTLED';
  }
  if (ui.modalTitle) {
    ui.modalTitle.textContent = isVictory
      ? 'Skies Secured — HMS Leviathan Vanquished'
      : 'H.M.A.S. Flying Dutchman Scuttled';
  }
  if (ui.modalSubtitle) {
    ui.modalSubtitle.textContent = isVictory
      ? 'HMS Leviathan has struck her colors beneath the storm cloud-sea. Lords Commissioners commend your gunnery and boiler seamanship.'
      : `Hull integrity failed during Wave ${simState.wave} (${simState.waveName}). Refit at drydock and weigh anchor anew.`;
  }
  if (ui.modalRank) ui.modalRank.textContent = rank;
  if (ui.modalScore) ui.modalScore.textContent = Math.round(finiteOr(simState.score, 0)).toLocaleString('en-US');
  if (ui.modalWaves) ui.modalWaves.textContent = `${wavesCleared} / ${simState.maxWaves}`;
  if (ui.modalHull) ui.modalHull.textContent = `${hullPct}%`;
  if (ui.modalSunk) ui.modalSunk.textContent = String(campaignStats.enemiesSunk);
  if (ui.modalBroadsides) ui.modalBroadsides.textContent = String(campaignStats.broadsidesFired);

  if (ui.dispatchModal?.dataset) {
    ui.dispatchModal.dataset.hidden = 'false';
  }
  if (ui.titleOverlay?.dataset) {
    ui.titleOverlay.dataset.hidden = 'true';
  }
}

// ---------------------------------------------------------------------------
// 6. SIMULATION EVENT WIRING -> 3D VFX + 1889 WEB AUDIO + CAMERA SHAKE
// ---------------------------------------------------------------------------
sim.onEvent = (evt) => {
  if (!evt || !evt.type) return;

  switch (evt.type) {
    case 'broadside_fired': {
      const count = evt.gunCount || evt.count || 6;
      const ammo = evt.ammoType || 'roundshot';
      ships.triggerMuzzleVolley(evt.origin || evt, evt.heading, evt.side, count, ammo);
      if (!isMuted) {
        audio.playBroadsideSfx(count, ammo);
      }
      if (evt.actor === 'player') {
        campaignStats.broadsidesFired += 1;
        const sideKick = evt.side === 'port' ? 1 : -1; // Recoil kicks deck toward opposite beam
        camRig.shake = Math.max(camRig.shake, 0.55);
        camRig.recoilLateral = clamp(camRig.recoilLateral + sideKick * 1.35, -2.5, 2.5);
        triggerScreenFlash('broadside', 0.38);
      }
      break;
    }

    case 'projectile_hit': {
      const kind = evt.kind || 'hit';
      ships.triggerImpactVfx(evt.position || evt, kind);
      if (!isMuted) {
        audio.playImpactSfx(kind);
      }
      if (evt.target === 'player') {
        camRig.shake = Math.max(camRig.shake, evt.critical ? 0.85 : 0.45);
        triggerScreenFlash('hit', evt.critical ? 0.72 : 0.42);
        const st = sim.getState();
        if (st.hull > 0 && st.hull <= 32 && alertSfxCooldown <= 0) {
          alertSfxCooldown = 3.2;
          if (!isMuted) audio.playAlertSfx();
          showToast('HULL CRITICAL', 'Hull plating below 32% — offset altitude stratum!', 'alert', 3.4);
        }
      } else if (evt.target === 'evaded') {
        showToast('HELM', 'Stratum offset evaded incoming hostile broadside!', 'info', 1.8);
      }
      break;
    }

    case 'subsystem_damaged': {
      if (evt.hp <= 45) {
        showToast('DAMAGE CONTROL', `${evt.name} at ${Math.round(evt.hp)}% — press [TAB] to assign Engineer!`, 'alert', 3.0);
      }
      break;
    }

    case 'fire_started': {
      ships.triggerImpactVfx(evt.position || evt, 'fire');
      if (evt.target === 'player') {
        if (!isMuted && alertSfxCooldown <= 0) {
          alertSfxCooldown = 2.4;
          audio.playAlertSfx();
        }
        const subLabel = SUBSYSTEM_LABELS[evt.subsystem]?.short || String(evt.subsystem || 'DECK').toUpperCase();
        showToast('SHIPBOARD FIRE', `Fire in ${subLabel}! Press [V] Vent Steam or [TAB] CAD Repair!`, 'alert', 3.8);
      }
      break;
    }

    case 'steam_leak': {
      if (!isMuted && alertSfxCooldown <= 0) {
        alertSfxCooldown = 2.4;
        audio.playAlertSfx();
      }
      const subLabel = SUBSYSTEM_LABELS[evt.subsystem]?.short || 'BOILER';
      showToast('STEAM LEAK', `Valve leak on ${subLabel} — dispatch Engineer or [V] Vent Steam.`, 'alert', 3.2);
      break;
    }

    case 'vent_steam': {
      ships.triggerImpactVfx(evt.position || evt, 'vent');
      if (!isMuted) {
        audio.playVentSteamSfx();
      }
      triggerScreenFlash('vent', 0.65);
      showToast('RELIEF VALVES', 'Emergency steam relief vented — all fires doused & leaks sealed!', 'info', 2.8);
      break;
    }

    case 'enemy_sunk': {
      campaignStats.enemiesSunk += 1;
      ships.triggerImpactVfx(evt.position || evt, 'sink');
      if (!isMuted) {
        audio.playImpactSfx('sink');
      }
      camRig.shake = Math.max(camRig.shake, 0.65);
      showToast('ENEMY SUNK', `${evt.name} magazine detonated! +${evt.scoreAwarded} Prize Pts`, 'info', 3.0);
      break;
    }

    case 'wave_cleared': {
      if (evt.nextWave) {
        if (!isMuted) {
          audio.playFanfareSfx('wave');
        }
        showToast(
          `WAVE ${evt.wave} CLEARED`,
          `+${evt.bonusScore} Pts · +25% Field Refit! Stand by for Wave ${evt.nextWave}...`,
          'info',
          3.6
        );
      }
      break;
    }

    case 'victory': {
      if (!isMuted) {
        audio.playFanfareSfx('victory');
      }
      openDispatchModal('victory', sim.getState());
      break;
    }

    case 'defeat': {
      if (!isMuted) {
        audio.playFanfareSfx('defeat');
      }
      openDispatchModal('defeat', sim.getState());
      break;
    }

    default:
      break;
  }
};

// ---------------------------------------------------------------------------
// 7. DUAL CAMERA RIG (3D GUNNERY HELM <-> ISOMETRIC X-RAY CAD SCHEMATIC)
// ---------------------------------------------------------------------------
function computeDesiredCameraTargets(simState) {
  const player = simState?.player || {};
  const px = finiteOr(player.x, 0);
  const py = finiteOr(player.y, 2);
  const pz = finiteOr(player.z, 110);
  const pHeading = finiteOr(player.heading, 0);
  const pRoll = finiteOr(player.roll, 0);

  if (viewMode === 'cad') {
    // True 35.264 deg / 45 deg Admiralty Isometric Telephoto Framing
    const zoom = clamp(finiteOr(camRig.cadZoom, 1.0), 0.65, 1.85);
    const cadDist = 114.0 / zoom;
    const azim = (camRig.cadLockToShip ? pHeading : 0) + camRig.cadYawOffset;
    const horiz = Math.cos(ISO_ELEVATION_RAD) * cadDist;
    const vert = Math.sin(ISO_ELEVATION_RAD) * cadDist;

    return {
      posX: px + Math.sin(azim) * horiz,
      posY: py + 2.2 + vert,
      posZ: pz + Math.cos(azim) * horiz,
      lookX: px,
      lookY: py + 2.2,
      lookZ: pz,
      fov: 22,
      roll: 0
    };
  }

  // '3d' Gunnery Helm Chase / Broadside Orbit Camera
  const pitch = clamp(finiteOr(camRig.helmPitch, 0.27), 0.06, 0.78);
  const dist = clamp(finiteOr(camRig.helmDist, 52), 32, 96);
  const azim = pHeading + camRig.helmYawOffset;
  const horiz = Math.cos(pitch) * dist;
  const vert = Math.sin(pitch) * dist;

  // Subtle lateral recoil kick perpendicular to camera azimuth
  const rightX = Math.cos(azim);
  const rightZ = -Math.sin(azim);
  const shakeAmt = camRig.shake * 0.65;
  const shakeX = Math.sin(totalElapsed * 43.0) * shakeAmt;
  const shakeY = Math.cos(totalElapsed * 51.0) * shakeAmt * 0.7;

  const swellRoll = Math.sin(totalElapsed * 1.25) * 0.012 + pRoll * 0.18;

  return {
    posX: px + Math.sin(azim) * horiz + rightX * camRig.recoilLateral + shakeX,
    posY: py + 4.6 + vert + shakeY,
    posZ: pz + Math.cos(azim) * horiz + rightZ * camRig.recoilLateral,
    lookX: px - Math.sin(azim) * 7.2,
    lookY: py + 3.2,
    lookZ: pz - Math.cos(azim) * 7.2,
    fov: 58,
    roll: clamp(swellRoll, -0.14, 0.14)
  };
}

function updateCameraRig(simState, dt, snapRatio = null) {
  const safeDt = clamp(finiteOr(dt, 1 / 60), 0, 0.1);
  camRig.shake = Math.max(0, camRig.shake - safeDt * 2.6);
  camRig.recoilLateral = lerp(camRig.recoilLateral, 0, clamp(safeDt * 7.5, 0, 1));

  const target = computeDesiredCameraTargets(simState);
  const blend = snapRatio !== null
    ? clamp(snapRatio, 0, 1)
    : (!camRig.initialized ? 1.0 : clamp(safeDt * 10.5, 0.08, 1.0));

  camRig.posX = finiteOr(lerp(camRig.posX, target.posX, blend), target.posX);
  camRig.posY = finiteOr(lerp(camRig.posY, target.posY, blend), target.posY);
  camRig.posZ = finiteOr(lerp(camRig.posZ, target.posZ, blend), target.posZ);
  camRig.lookX = finiteOr(lerp(camRig.lookX, target.lookX, blend), target.lookX);
  camRig.lookY = finiteOr(lerp(camRig.lookY, target.lookY, blend), target.lookY);
  camRig.lookZ = finiteOr(lerp(camRig.lookZ, target.lookZ, blend), target.lookZ);
  camRig.fov = finiteOr(lerp(camRig.fov, target.fov, blend), target.fov);
  camRig.roll = finiteOr(lerp(camRig.roll, target.roll, blend), 0);
  camRig.initialized = true;

  camera.position.set(camRig.posX, camRig.posY, camRig.posZ);

  // Apply subtle sea-swell roll in '3d' mode while keeping up-vector strictly unit-length
  if (Math.abs(camRig.roll) > 1e-4) {
    camera.up.set(Math.sin(camRig.roll), Math.cos(camRig.roll), 0).normalize();
  } else {
    camera.up.set(0, 1, 0);
  }

  if (Math.abs(camera.fov - camRig.fov) > 0.02) {
    camera.fov = camRig.fov;
    camera.updateProjectionMatrix?.();
  }

  camera.lookAt(camRig.lookX, camRig.lookY, camRig.lookZ);
  camera.updateMatrixWorld?.(true);
}

// ---------------------------------------------------------------------------
// 8. VIEW MODE, CAD THEME & CREW DISPATCH CONTROLLERS
// ---------------------------------------------------------------------------
function syncBloomForMode() {
  if (!bloomPass) return;
  if (viewMode === 'cad') {
    bloomPass.strength = cadTheme === 'light' ? 0.0 : 0.16;
    bloomPass.threshold = 0.92;
  } else {
    bloomPass.strength = 0.36;
    bloomPass.threshold = 0.85;
  }
}

function syncAudioMix(simState, force = false) {
  const subs = simState?.subsystems || {};
  let anyAffliction = false;
  for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
    const sub = subs[SUBSYSTEM_IDS[i]];
    if (sub && (sub.onFire || sub.steamLeak || sub.hp < 30)) {
      anyAffliction = true;
      break;
    }
  }
  const criticalHull = finiteOr(simState?.hull, 100) < 35;
  const hasAlert = Boolean(simState?.phase === 'playing' && (anyAffliction || criticalHull));

  const enemyFactor = Array.isArray(simState?.enemies) ? simState.enemies.length * 0.2 : 0;
  const waveFactor = (Math.max(1, finiteOr(simState?.wave, 1)) - 1) * 0.12;
  const overFactor = simState?.boiler?.overcharged ? 0.15 : 0;
  const rawIntensity = simState?.phase === 'playing'
    ? clamp(0.35 + enemyFactor + waveFactor + overFactor, 0, 1)
    : 0.22;
  const quantIntensity = Math.round(rawIntensity * 20) / 20;

  const sig = `${viewMode}:${quantIntensity}:${hasAlert ? 1 : 0}`;
  if (force || sig !== lastMixSignature || totalElapsed - lastAudioMixSync > 0.25) {
    lastMixSignature = sig;
    lastAudioMixSync = totalElapsed;
    audio.setModeMix(viewMode, quantIntensity, hasAlert);
  }
}

function setViewMode(nextMode, nextTheme = cadTheme) {
  viewMode = nextMode === 'cad' ? 'cad' : '3d';
  if (nextTheme === 'light' || nextTheme === 'dark') {
    cadTheme = nextTheme;
  }

  ships.setViewMode(viewMode, cadTheme);
  syncBloomForMode();

  if (doc?.body?.dataset) {
    doc.body.dataset.view = viewMode;
    doc.body.dataset.theme = cadTheme;
  }

  if (ui.btnViewMode?.dataset) {
    ui.btnViewMode.dataset.mode = viewMode;
  }
  if (ui.viewModeLabel) {
    ui.viewModeLabel.textContent = viewMode === 'cad' ? 'CAD X-RAY SCHEMATIC' : '3D GUNNERY HELM';
  }
  if (ui.cadThemeLabel) {
    ui.cadThemeLabel.textContent = cadTheme === 'light' ? 'LIGHT PLATE' : 'DARK PLATE';
  }

  const st = sim.getState();
  // Snap 85% into target view immediately so screen anchors & raycasting are valid on frame 0
  updateCameraRig(st, 1 / 60, 0.85);
  ships.syncState(st, 0, totalElapsed);
  syncAudioMix(st, true);
  syncHudFromState(st);

  return ships.getViewMode();
}

function toggleViewMode(explicitMode) {
  if (explicitMode === '3d' || explicitMode === 'cad') {
    return setViewMode(explicitMode, cadTheme);
  }
  return setViewMode(viewMode === '3d' ? 'cad' : '3d', cadTheme);
}

function setCadTheme(theme) {
  const next = theme === 'light' ? 'light' : (theme === 'dark' ? 'dark' : (cadTheme === 'dark' ? 'light' : 'dark'));
  return setViewMode(viewMode, next);
}

function handleAssignCrew(subsystemId) {
  if (!SUBSYSTEM_IDS.includes(subsystemId)) return false;
  const ok = sim.assignCrew(subsystemId);
  if (ok) {
    if (!isMuted) {
      audio.playCrewAssignSfx();
    }
    const sub = sim.getState().subsystems?.[subsystemId];
    const label = SUBSYSTEM_LABELS[subsystemId]?.short || subsystemId.toUpperCase();
    if (sub && sub.crewAssigned > 0) {
      showToast('ENGINEER DISPATCHED', `Repair crew assigned to ${label} (+7.5 HP/s).`, 'info', 2.0);
    } else {
      showToast('ENGINEER RECALLED', `Engineer crew recalled from ${label} to standby.`, 'info', 1.8);
    }
    syncHudFromState(sim.getState());
  }
  return ok;
}

function pickSubsystemAtNdc(ndcX, ndcY) {
  ndcPointer.set(clamp(finiteOr(ndcX, 0), -1, 1), clamp(finiteOr(ndcY, 0), -1, 1));
  camera.updateMatrixWorld?.(true);
  raycaster.setFromCamera(ndcPointer, camera);
  return ships.pickSubsystem(raycaster);
}

// ---------------------------------------------------------------------------
// 9. HUD SYNCHRONIZATION (BOILER, WIND ROSE, BATTERIES & CAD CALLOUT PINS)
// ---------------------------------------------------------------------------
function checkEnemyInBroadsideArc(simState, side) {
  const enemies = simState?.enemies;
  if (!Array.isArray(enemies) || enemies.length === 0) return false;
  const player = simState.player;
  const sideSign = side === 'starboard' ? 1 : -1;
  const beamAngle = wrapAngle(player.heading - sideSign * (Math.PI * 0.5));

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || e.hull <= 0) continue;
    const dx = e.x - player.x;
    const dz = e.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > BROADSIDE_RANGE_M + finiteOr(e.radius, 10) || dist < 1e-3) continue;
    const bearing = headingFromXZ(dx, dz);
    if (Math.abs(shortestAngleDiff(beamAngle, bearing)) <= BROADSIDE_HALF_CONE_RAD) {
      return true;
    }
  }
  return false;
}

function describePointOfSail(trim) {
  if (trim >= 1.22) return `${trim.toFixed(2)}x REACH`;
  if (trim >= 1.02) return `${trim.toFixed(2)}x RUN`;
  if (trim >= 0.72) return `${trim.toFixed(2)}x HAULED`;
  return `${trim.toFixed(2)}x IRONS`;
}

function updateCadPinsAndLeaders(simState) {
  if (viewMode !== 'cad') return;

  const vp = getViewportSize();
  const anchors = ships.getSubsystemScreenAnchors(camera, vp.w, vp.h);

  // Compute anchor centroid on screen
  let cx = vp.w * 0.5;
  let cy = vp.h * 0.5;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
    const a = anchors?.[SUBSYSTEM_IDS[i]];
    if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) {
      sumX += a.x;
      sumY += a.y;
      count++;
    }
  }
  if (count > 0) {
    cx = sumX / count;
    cy = sumY / count;
  }

  const wide = vp.w >= 960;
  const minX = wide ? 388 : 110;
  const maxX = wide ? vp.w - 384 : vp.w - 110;
  const minY = 104;
  const maxY = vp.h - 166;

  const pinPlacements = {};
  for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
    const id = SUBSYSTEM_IDS[i];
    const a = anchors?.[id] || { x: cx, y: cy, visible: true };
    const slot = CAD_PIN_SLOTS[id];
    pinPlacements[id] = {
      ax: finiteOr(a.x, cx),
      ay: finiteOr(a.y, cy),
      px: clamp(finiteOr(a.x, cx) + slot.dx, minX, Math.max(minX, maxX)),
      py: clamp(finiteOr(a.y, cy) + slot.dy, minY, Math.max(minY, maxY))
    };
  }

  // 3-pass non-overlap relaxation across the 5 CAD callout cards (178 x 64 px)
  const cardW = 186;
  const cardH = 68;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
      for (let j = i + 1; j < SUBSYSTEM_IDS.length; j++) {
        const pA = pinPlacements[SUBSYSTEM_IDS[i]];
        const pB = pinPlacements[SUBSYSTEM_IDS[j]];
        const ox = cardW - Math.abs(pA.px - pB.px);
        const oy = cardH - Math.abs(pA.py - pB.py);
        if (ox > 0 && oy > 0) {
          if (oy <= ox) {
            const shiftY = (oy * 0.52) * (pA.py <= pB.py ? -1 : 1);
            pA.py = clamp(pA.py + shiftY, minY, Math.max(minY, maxY));
            pB.py = clamp(pB.py - shiftY, minY, Math.max(minY, maxY));
          } else {
            const shiftX = (ox * 0.52) * (pA.px <= pB.px ? -1 : 1);
            pA.px = clamp(pA.px + shiftX, minX, Math.max(minX, maxX));
            pB.px = clamp(pB.px - shiftX, minX, Math.max(minX, maxX));
          }
        }
      }
    }
  }

  const subs = simState?.subsystems || {};
  for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
    const id = SUBSYSTEM_IDS[i];
    const sub = subs[id] || { hp: 100, maxHp: 100, onFire: false, steamLeak: false, crewAssigned: 0 };
    const place = pinPlacements[id];
    const pinEl = ui.cadPins[id];
    const lineEl = ui.cadLines[id];
    const dotEl = ui.cadDots[id];

    const hpPct = Math.round(clamp(finiteOr(sub.hp, 100) / Math.max(1, sub.maxHp), 0, 1) * 100);
    const stateTone = (sub.onFire || hpPct < 35)
      ? 'crit'
      : ((sub.steamLeak || hpPct < 72) ? 'warn' : 'ok');

    let statusText = 'NOMINAL';
    if (sub.onFire && sub.crewAssigned > 0) statusText = `🔥 DOUSING · ENG ×${sub.crewAssigned}`;
    else if (sub.onFire) statusText = '🔥 ON FIRE!';
    else if (sub.steamLeak && sub.crewAssigned > 0) statusText = `💨 SEALING · ENG ×${sub.crewAssigned}`;
    else if (sub.steamLeak) statusText = '💨 STEAM LEAK';
    else if (sub.crewAssigned > 0) statusText = `🔧 ENG ×${sub.crewAssigned} REPAIR`;
    else if (hpPct < 100) statusText = 'CLICK TO REPAIR';

    if (pinEl) {
      if (pinEl.style) {
        pinEl.style.left = `${Math.round(place.px)}px`;
        pinEl.style.top = `${Math.round(place.py)}px`;
      }
      if (pinEl.dataset) {
        pinEl.dataset.state = stateTone;
        pinEl.dataset.crew = String(sub.crewAssigned > 0);
      }
      // Update pin card children safely
      const headRow = pinEl.children?.[0];
      const barWrap = pinEl.children?.[1];
      const footRow = pinEl.children?.[2];
      if (headRow?.children?.[1]) headRow.children[1].textContent = `${hpPct}%`;
      if (barWrap?.children?.[0]?.style) barWrap.children[0].style.width = `${hpPct}%`;
      if (footRow?.children?.[1]) footRow.children[1].textContent = statusText;
    }

    // Chamfered 2-segment Admiralty leader line from 3D subsystem anchor to callout pin edge
    const attachX = place.px + (place.ax < place.px ? -86 : 86);
    const attachY = place.py;
    const elbowX = lerp(place.ax, attachX, 0.55);
    const elbowY = attachY;

    if (lineEl?.setAttribute) {
      lineEl.setAttribute('d', `M ${place.ax.toFixed(1)} ${place.ay.toFixed(1)} L ${elbowX.toFixed(1)} ${elbowY.toFixed(1)} L ${attachX.toFixed(1)} ${attachY.toFixed(1)}`);
      if (lineEl.dataset) {
        lineEl.dataset.state = sub.onFire ? 'crit' : (sub.crewAssigned > 0 ? 'crew' : 'ok');
      }
    }
    if (dotEl?.setAttribute) {
      dotEl.setAttribute('cx', place.ax.toFixed(1));
      dotEl.setAttribute('cy', place.ay.toFixed(1));
      if (dotEl.dataset) {
        dotEl.dataset.state = sub.onFire ? 'crit' : 'ok';
      }
    }
  }

  const azimDeg = Math.round(((wrapAngle((camRig.cadLockToShip ? (simState?.player?.heading || 0) : 0) + camRig.cadYawOffset) * 180) / Math.PI + 360) % 360);
  if (ui.cadScaleReadout) {
    ui.cadScaleReadout.textContent = `ISOMETRIC 35.3° · AZIM ${String(azimDeg).padStart(3, '0')}° · ZOOM ${camRig.cadZoom.toFixed(2)}x`;
  }
}

function renderEnemyLedger(simState) {
  if (!ui.enemyLedgerList) return;

  if (simState.phase === 'title') {
    const sig = 'title';
    if (enemyLedgerSignature !== sig) {
      enemyLedgerSignature = sig;
      ui.enemyLedgerList.textContent = 'AWAITING WEIGH ANCHOR...';
    }
    return;
  }

  const enemies = Array.isArray(simState.enemies) ? simState.enemies : [];
  if (enemies.length === 0) {
    const sig = `clear-${simState.wave}-${simState.phase}`;
    if (enemyLedgerSignature !== sig) {
      enemyLedgerSignature = sig;
      ui.enemyLedgerList.textContent = simState.phase === 'victory'
        ? 'ALL HOSTILE SQUADRONS VANQUISHED'
        : 'SECTOR CLEAR — NEXT SQUADRON INBOUND';
    }
    return;
  }

  if (typeof doc?.createElement !== 'function') return;

  // Rebuild concise enemy rows
  while (ui.enemyLedgerList.firstChild) {
    ui.enemyLedgerList.removeChild(ui.enemyLedgerList.firstChild);
  }
  enemyLedgerSignature = `live-${enemies.length}-${totalElapsed.toFixed(1)}`;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const dist = Math.round(Math.hypot(e.x - simState.player.x, e.z - simState.player.z));
    const hpPct = Math.round(clamp(finiteOr(e.hull, 0) / Math.max(1, e.maxHull), 0, 1) * 100);
    const offsetStratum = e.stratum !== simState.stratum;

    const row = doc.createElement('div');
    row.className = 'enemy-row';
    if (row.dataset) row.dataset.boss = String(Boolean(e.isBoss));

    const top = doc.createElement('div');
    top.className = 'enemy-row-top';
    const nameSpan = doc.createElement('span');
    nameSpan.className = 'enemy-name';
    const flags = `${e.onFire ? ' 🔥' : ''}${e.crippled ? ' ⛓' : ''}`;
    nameSpan.textContent = `${e.name}${flags}`;
    const distSpan = doc.createElement('span');
    distSpan.textContent = `${dist}m`;
    top.appendChild?.(nameSpan);
    top.appendChild?.(distSpan);

    const barTrack = doc.createElement('div');
    barTrack.className = 'enemy-hp-track';
    const barFill = doc.createElement('div');
    barFill.className = 'enemy-hp-fill';
    if (barFill.style) barFill.style.width = `${hpPct}%`;
    barTrack.appendChild?.(barFill);

    const meta = doc.createElement('div');
    meta.className = 'enemy-meta';
    const stratSpan = doc.createElement('span');
    stratSpan.textContent = `ALT: ${String(e.stratum || 'mid').toUpperCase()}${offsetStratum ? ' (−40% ACC)' : ' (LEVEL)'}`;
    const hpSpan = doc.createElement('span');
    hpSpan.textContent = `${hpPct}%`;
    meta.appendChild?.(stratSpan);
    meta.appendChild?.(hpSpan);

    row.appendChild?.(top);
    row.appendChild?.(barTrack);
    row.appendChild?.(meta);
    ui.enemyLedgerList.appendChild?.(row);
  }
}

function syncHudFromState(simState) {
  if (!simState) return;

  // 1. Top Admiralty Bar
  if (ui.waveReadout) ui.waveReadout.textContent = `WAVE ${simState.wave} / ${simState.maxWaves}`;
  if (ui.waveNameReadout) ui.waveNameReadout.textContent = String(simState.waveName || 'CORSAIR PICKET').toUpperCase();
  if (ui.scoreReadout) ui.scoreReadout.textContent = Math.round(finiteOr(simState.score, 0)).toLocaleString('en-US');

  // 2. Boiler Pressure & Pip Allocators
  const boiler = simState.boiler || {};
  const cap = finiteOr(boiler.capacity, 15.5);
  const alloc = boiler.allocation || { propulsion: 5.5, sponsons: 5.0, ordnance: 5.0 };
  const overcharged = Boolean(boiler.overcharged);

  if (ui.boilerPressureValue) {
    ui.boilerPressureValue.textContent = `${finiteOr(boiler.allocated, 15.5).toFixed(1)} / ${cap.toFixed(1)} BAR`;
    if (ui.boilerPressureValue.dataset) ui.boilerPressureValue.dataset.overcharged = String(overcharged);
  }
  if (ui.boilerUnallocatedValue) {
    ui.boilerUnallocatedValue.textContent = `${finiteOr(boiler.unallocated, 0).toFixed(1)} FREE`;
  }
  if (ui.boilerPressureFill) {
    const gaugePct = clamp((cap / 19.5) * 100, 10, 100);
    if (ui.boilerPressureFill.style) ui.boilerPressureFill.style.width = `${gaugePct.toFixed(1)}%`;
    if (ui.boilerPressureFill.dataset) ui.boilerPressureFill.dataset.overcharged = String(overcharged);
  }

  if (ui.btnOverpressure) {
    if (ui.btnOverpressure.dataset) ui.btnOverpressure.dataset.overcharged = String(overcharged);
    ui.btnOverpressure.disabled = Boolean(!overcharged && boiler.overchargeCooldown > 0.05);
  }
  if (ui.overpressureStatus) {
    if (overcharged) {
      ui.overpressureStatus.textContent = `SURGE ${finiteOr(boiler.overchargeTimer, 0).toFixed(1)}s`;
    } else if (finiteOr(boiler.overchargeCooldown, 0) > 0.05) {
      ui.overpressureStatus.textContent = `${Math.ceil(boiler.overchargeCooldown)}s CD`;
    } else {
      ui.overpressureStatus.textContent = 'READY';
    }
  }

  if (ui.allocPropulsionVal) ui.allocPropulsionVal.textContent = `${finiteOr(alloc.propulsion, 5.5).toFixed(1)} BAR`;
  if (ui.allocSponsonsVal) ui.allocSponsonsVal.textContent = `${finiteOr(alloc.sponsons, 5.0).toFixed(1)} BAR`;
  if (ui.allocOrdnanceVal) ui.allocOrdnanceVal.textContent = `${finiteOr(alloc.ordnance, 5.0).toFixed(1)} BAR`;
  if (ui.ordnanceReloadReadout) {
    ui.ordnanceReloadReadout.textContent = `${finiteOr(simState.reloadDuration, 3.9).toFixed(1)}s RELOAD`;
  }

  for (let k = 0; k < BOILER_KEYS.length; k++) {
    const key = BOILER_KEYS[k];
    const barVal = finiteOr(alloc[key], 5.0);
    const cells = pipCellMap[key];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell?.dataset) continue;
      if (barVal >= i + 1 - 1e-4) {
        cell.dataset.lit = (overcharged && i >= 6) ? 'over' : 'full';
      } else if (barVal >= i + 0.5 - 1e-4) {
        cell.dataset.lit = 'half';
      } else {
        cell.dataset.lit = 'off';
      }
    }
  }

  // 3. Altitude Stratum & Evasion Readout
  const curY = Math.round(finiteOr(simState.player?.y, STRATA_METERS[simState.stratum] ?? 2));
  const ySign = curY >= 0 ? '+' : '';
  if (ui.stratumAltReadout) {
    ui.stratumAltReadout.textContent = `${ySign}${curY}m · ${String(simState.targetStratum || 'mid').toUpperCase()}`;
  }
  if (ui.btnStratumLow?.dataset) ui.btnStratumLow.dataset.active = String(simState.targetStratum === 'low');
  if (ui.btnStratumMid?.dataset) ui.btnStratumMid.dataset.active = String(simState.targetStratum === 'mid');
  if (ui.btnStratumHigh?.dataset) ui.btnStratumHigh.dataset.active = String(simState.targetStratum === 'high');

  const enemies = Array.isArray(simState.enemies) ? simState.enemies : [];
  const evadingAny = enemies.some((e) => e && e.hull > 0 && e.stratum !== simState.stratum);
  if (ui.stratumEvasionNote) {
    ui.stratumEvasionNote.textContent = evadingAny
      ? 'EVASION ACTIVE: −40% HOSTILE HIT ACCURACY'
      : 'OFFSET STRATUM = −40% HOSTILE HIT ACC';
    if (ui.stratumEvasionNote.dataset) ui.stratumEvasionNote.dataset.evading = String(evadingAny);
  }

  // 4. Vent Steam Emergency Relief Button
  const subs = simState.subsystems || {};
  let anyFireOrLeak = false;
  for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
    const sub = subs[SUBSYSTEM_IDS[i]];
    if (sub && (sub.onFire || sub.steamLeak)) {
      anyFireOrLeak = true;
      break;
    }
  }
  const ventCd = finiteOr(simState.ventCooldown, 0);
  if (ui.btnVentSteam) {
    ui.btnVentSteam.disabled = ventCd > 0.05;
    if (ui.btnVentSteam.dataset) {
      ui.btnVentSteam.dataset.urgent = String(anyFireOrLeak && ventCd <= 0.05);
    }
  }
  if (ui.ventSteamStatus) {
    ui.ventSteamStatus.textContent = ventCd > 0.05 ? `${ventCd.toFixed(1)}s CD` : (anyFireOrLeak ? 'VENT NOW!' : 'READY');
  }

  // 5. Subsystems (Compact 3D Strip + Crew Counters)
  const crewAvail = finiteOr(simState.crewAvailable, 2);
  const crewTotal = finiteOr(simState.crewTotal, 2);
  if (ui.crewAvailableBadge) {
    ui.crewAvailableBadge.textContent = `${crewAvail} / ${crewTotal} STANDBY`;
  }
  if (ui.cadCrewReadout) {
    ui.cadCrewReadout.textContent = crewAvail === 1
      ? '1 ENGINEER CREW AVAILABLE'
      : `${crewAvail} ENGINEER CREWS AVAILABLE`;
  }

  for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
    const id = SUBSYSTEM_IDS[i];
    const sub = subs[id] || { hp: 100, maxHp: 100, onFire: false, steamLeak: false, crewAssigned: 0 };
    const pill = ui.pills3d[id];
    if (!pill) continue;

    const hpPct = Math.round(clamp(finiteOr(sub.hp, 100) / Math.max(1, sub.maxHp), 0, 1) * 100);
    const tone = (sub.onFire || hpPct < 35) ? 'crit' : ((sub.steamLeak || hpPct < 72) ? 'warn' : 'ok');
    if (pill.dataset) {
      pill.dataset.state = tone;
      pill.dataset.crew = String(sub.crewAssigned > 0);
    }
    const rightSpan = pill.children?.[1];
    if (rightSpan) {
      const icons = `${sub.onFire ? '🔥 ' : ''}${sub.steamLeak ? '💨 ' : ''}${sub.crewAssigned > 0 ? `🔧×${sub.crewAssigned} ` : ''}`;
      rightSpan.textContent = `${icons}${hpPct}%`;
    }
  }

  // 6. Bottom Deck: Port & Starboard Batteries, Wind Rose, Hull, Speed & Ammo
  const reloadDur = Math.max(0.5, finiteOr(simState.reloadDuration, 3.95));
  const activeGuns = finiteOr(simState.player?.activeGuns, 6);

  const portRem = Math.max(0, finiteOr(simState.portReload, 0));
  const portReady = portRem <= 0.04;
  const portProgress = clamp(1 - portRem / reloadDur, 0, 1) * 100;
  if (ui.portReloadFill) {
    if (ui.portReloadFill.style) ui.portReloadFill.style.width = `${portProgress.toFixed(1)}%`;
    if (ui.portReloadFill.dataset) ui.portReloadFill.dataset.ready = String(portReady);
  }
  if (ui.portReloadStatus) {
    ui.portReloadStatus.textContent = portReady
      ? `READY · ${activeGuns} GUNS`
      : `RELOADING ${portRem.toFixed(1)}s`;
  }
  if (ui.btnFirePort) ui.btnFirePort.disabled = !portReady;
  const portInArc = checkEnemyInBroadsideArc(simState, 'port');
  if (ui.portArcBadge) {
    ui.portArcBadge.textContent = portInArc ? 'IN ARC · FIRE!' : 'CLEAR ARC';
    if (ui.portArcBadge.dataset) ui.portArcBadge.dataset.locked = String(portInArc);
  }

  const stbdRem = Math.max(0, finiteOr(simState.starboardReload, 0));
  const stbdReady = stbdRem <= 0.04;
  const stbdProgress = clamp(1 - stbdRem / reloadDur, 0, 1) * 100;
  if (ui.starboardReloadFill) {
    if (ui.starboardReloadFill.style) ui.starboardReloadFill.style.width = `${stbdProgress.toFixed(1)}%`;
    if (ui.starboardReloadFill.dataset) ui.starboardReloadFill.dataset.ready = String(stbdReady);
  }
  if (ui.starboardReloadStatus) {
    ui.starboardReloadStatus.textContent = stbdReady
      ? `READY · ${activeGuns} GUNS`
      : `RELOADING ${stbdRem.toFixed(1)}s`;
  }
  if (ui.btnFireStarboard) ui.btnFireStarboard.disabled = !stbdReady;
  const stbdInArc = checkEnemyInBroadsideArc(simState, 'starboard');
  if (ui.starboardArcBadge) {
    ui.starboardArcBadge.textContent = stbdInArc ? 'IN ARC · FIRE!' : 'CLEAR ARC';
    if (ui.starboardArcBadge.dataset) ui.starboardArcBadge.dataset.locked = String(stbdInArc);
  }

  // Wind Rose SVG rotation (heading = 0 faces -Z = SVG Up; +heading is CCW = -deg in SVG)
  const shipDeg = (-finiteOr(simState.player?.heading, 0) * 180) / Math.PI;
  const windDeg = (-finiteOr(simState.wind?.angle, 0.72) * 180) / Math.PI;
  if (ui.shipHeadingGroup?.setAttribute) {
    ui.shipHeadingGroup.setAttribute('transform', `rotate(${shipDeg.toFixed(1)})`);
  }
  if (ui.windArrowGroup?.setAttribute) {
    ui.windArrowGroup.setAttribute('transform', `rotate(${windDeg.toFixed(1)})`);
  }
  if (ui.windKnotsValue) {
    ui.windKnotsValue.textContent = `${finiteOr(simState.wind?.knots, 18.5).toFixed(1)} KT`;
  }
  const sailTrim = finiteOr(simState.wind?.sailTrim, computeSailTrimMultiplier(simState.player?.heading || 0, simState.wind?.angle || 0.72, 1));
  if (ui.sailTrimValue) {
    ui.sailTrimValue.textContent = describePointOfSail(sailTrim);
  }

  // Hull Integrity, Speed & Throttle
  const hullRatio = clamp(finiteOr(simState.hull, 100) / Math.max(1, simState.maxHull), 0, 1);
  const hullPct = Math.round(hullRatio * 100);
  if (ui.hullValue) {
    ui.hullValue.textContent = `${Math.ceil(finiteOr(simState.hull, 100))} / ${simState.maxHull}`;
  }
  if (ui.hullBarFill) {
    if (ui.hullBarFill.style) ui.hullBarFill.style.width = `${(hullRatio * 100).toFixed(1)}%`;
    if (ui.hullBarFill.dataset) {
      ui.hullBarFill.dataset.level = hullPct < 35 ? 'crit' : (hullPct < 68 ? 'warn' : 'ok');
    }
  }
  if (ui.hullStatusTag) {
    if (simState.player?.crippled) ui.hullStatusTag.textContent = 'CHAIN-SLOWED';
    else if (anyFireOrLeak) ui.hullStatusTag.textContent = 'HAZARD';
    else if (hullPct < 35) ui.hullStatusTag.textContent = 'CRITICAL';
    else ui.hullStatusTag.textContent = 'NOMINAL';
  }

  if (ui.speedKnotsValue) {
    ui.speedKnotsValue.textContent = `${finiteOr(simState.player?.speedKnots, 16.5).toFixed(1)} KTS`;
  }
  const throttlePct = Math.round(clamp(finiteOr(simState.player?.throttle, 0.65), 0, 1) * 100);
  if (ui.throttlePctValue) ui.throttlePctValue.textContent = `${throttlePct}%`;
  if (ui.throttleBarFill?.style) ui.throttleBarFill.style.width = `${throttlePct}%`;

  // Ammo buttons
  const ammo = simState.ammoType || 'roundshot';
  if (ui.btnAmmoRoundshot?.dataset) ui.btnAmmoRoundshot.dataset.active = String(ammo === 'roundshot');
  if (ui.btnAmmoChainshot?.dataset) ui.btnAmmoChainshot.dataset.active = String(ammo === 'chainshot');
  if (ui.btnAmmoAethershell?.dataset) ui.btnAmmoAethershell.dataset.active = String(ammo === 'aethershell');

  // Squadron ledger & CAD callout anchors
  renderEnemyLedger(simState);
  updateCadPinsAndLeaders(simState);

  // Sync modal visibility if phase changed externally
  if (simState.phase !== lastPhaseRendered) {
    if (simState.phase === 'playing') {
      if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'true';
      if (ui.dispatchModal?.dataset) ui.dispatchModal.dataset.hidden = 'true';
    } else if (simState.phase === 'title') {
      if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'false';
      if (ui.dispatchModal?.dataset) ui.dispatchModal.dataset.hidden = 'true';
    } else if (simState.phase === 'victory' || simState.phase === 'defeat') {
      openDispatchModal(simState.phase, simState);
    }
    lastPhaseRendered = simState.phase;
  }
}

// ---------------------------------------------------------------------------
// 10. CAMPAIGN LIFECYCLE, INPUT RESOLUTION & FRAME STEPPING
// ---------------------------------------------------------------------------
function resolveKeyboardHelmInput() {
  let turn = 0;
  if (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft') || helmButtonHold.port) turn -= 1;
  if (keysHeld.has('KeyD') || keysHeld.has('ArrowRight') || helmButtonHold.starboard) turn += 1;

  let throttleDelta = 0;
  if (keysHeld.has('KeyW') || keysHeld.has('ArrowUp') || helmButtonHold.throttleUp) throttleDelta += 1;
  if (keysHeld.has('KeyS') || keysHeld.has('ArrowDown') || helmButtonHold.throttleDown) throttleDelta -= 1;

  if (ui.rudderReadout) {
    ui.rudderReadout.textContent = turn < 0 ? 'PORT' : (turn > 0 ? 'STBD' : 'HELM');
  }

  return { turn, throttleDelta };
}

function startCampaign() {
  campaignStats.enemiesSunk = 0;
  campaignStats.broadsidesFired = 0;
  enemyLedgerSignature = '';

  sim.reset();
  const st = sim.startWave(1);
  lastPhaseRendered = 'playing';

  if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'true';
  if (ui.dispatchModal?.dataset) ui.dispatchModal.dataset.hidden = 'true';

  if (!isMuted) {
    audio.start();
    audio.playFanfareSfx('wave');
  }

  updateCameraRig(st, 1 / 60, 1.0);
  ships.syncState(st, 1 / 60, totalElapsed);
  syncAudioMix(st, true);
  syncHudFromState(st);
  showToast('COMMISSION ACTIVE', 'Wave 1: Corsair Picket sighted! Bring broadsides to bear [Q / E].', 'info', 3.6);
  return getState();
}

function resetCampaign(options = {}) {
  campaignStats.enemiesSunk = 0;
  campaignStats.broadsidesFired = 0;
  enemyLedgerSignature = '';
  keysHeld.clear();

  sim.reset();
  let st = sim.getState();
  if (!options || options.toTitle !== true) {
    st = sim.startWave(1);
    lastPhaseRendered = 'playing';
    if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'true';
    if (ui.dispatchModal?.dataset) ui.dispatchModal.dataset.hidden = 'true';
    if (!isMuted) {
      if (!audio.isPlaying) audio.start();
      audio.playFanfareSfx('wave');
    }
    showToast('NEW VOYAGE', 'Hull & 15.5-bar Scotch boiler restored — Wave 1 engaged!', 'info', 3.0);
  } else {
    lastPhaseRendered = 'title';
    if (ui.titleOverlay?.dataset) ui.titleOverlay.dataset.hidden = 'false';
    if (ui.dispatchModal?.dataset) ui.dispatchModal.dataset.hidden = 'true';
  }

  if (viewMode !== '3d') {
    setViewMode('3d', cadTheme);
  } else {
    updateCameraRig(st, 1 / 60, 1.0);
    ships.syncState(st, 1 / 60, totalElapsed);
    syncAudioMix(st, true);
    syncHudFromState(st);
  }

  return getState();
}

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

function step(dt = 1 / 60, externalInput = null, options = null) {
  const rawDt = clamp(finiteOr(dt, 1 / 60), 0, 0.25);
  const timeScale = (options?.applyTacticalDilation && viewMode === 'cad' && sim.getState().phase === 'playing')
    ? CAD_TACTICAL_TIME_SCALE
    : 1.0;
  const simDt = rawDt * timeScale;
  totalElapsed += simDt;

  if (toastTimer > 0) {
    toastTimer = Math.max(0, toastTimer - rawDt);
    if (toastTimer <= 0 && ui.toast?.dataset) {
      ui.toast.dataset.visible = 'false';
    }
  }
  if (flashTimer > 0) {
    flashTimer = Math.max(0, flashTimer - rawDt);
    if (flashTimer <= 0 && ui.screenFlash?.style) {
      ui.screenFlash.style.opacity = '0';
    }
  }
  if (alertSfxCooldown > 0) {
    alertSfxCooldown = Math.max(0, alertSfxCooldown - rawDt);
  }

  const resolvedInput = externalInput !== null && typeof externalInput === 'object'
    ? externalInput
    : resolveKeyboardHelmInput();

  const events = sim.step(simDt, resolvedInput);
  const st = sim.getState();

  ships.syncState(st, simDt, totalElapsed);
  updateCameraRig(st, rawDt, null);
  syncAudioMix(st, false);
  syncHudFromState(st);
  renderSceneFrame();

  return events;
}

function getState() {
  const simState = sim.getState();
  simState.viewMode = viewMode;
  simState.cadTheme = cadTheme;
  simState.isMuted = isMuted;
  simState.tacticalTimeScale = viewMode === 'cad' ? CAD_TACTICAL_TIME_SCALE : 1.0;
  simState.stats = { ...campaignStats };
  return simState;
}

// ---------------------------------------------------------------------------
// 11. EVENT LISTENERS (HUD BUTTONS, KEYBOARD HELM, MOUSE ORBIT & 3D RAYCAST)
// ---------------------------------------------------------------------------
function stepAltitudeStratum(dir) {
  const cur = sim.getState().targetStratum || 'mid';
  const idx = STRATA_ORDER.indexOf(cur);
  const nextIdx = clamp((idx === -1 ? 1 : idx) + dir, 0, STRATA_ORDER.length - 1);
  sim.setTargetStratum(STRATA_ORDER[nextIdx]);
  syncHudFromState(sim.getState());
}

function handleEngageOverpressure() {
  const ok = sim.engageOverpressure();
  if (ok) {
    if (!isMuted) audio.playOverpressureSfx();
    showToast('SCOTCH BOILER', '19.5-Bar Overpressure engaged for 8s!', 'info', 2.4);
    syncHudFromState(sim.getState());
  }
  return ok;
}

function toggleAudioMute() {
  if (isMuted) {
    isMuted = false;
    if (sim.getState().phase === 'playing') {
      audio.start();
    }
  } else if (audio.isPlaying) {
    isMuted = true;
    audio.stop();
  } else {
    isMuted = false;
    audio.start();
  }

  if (ui.audioLampDot?.dataset) ui.audioLampDot.dataset.on = String(!isMuted);
  if (ui.audioToggleLabel) ui.audioToggleLabel.textContent = isMuted ? 'MUTED' : 'AUDIO ON';
  if (ui.btnAudioToggle?.setAttribute) ui.btnAudioToggle.setAttribute('aria-pressed', String(!isMuted));
}

function bindUiControls() {
  // Commission & Dispatch Modals
  ui.btnWeighAnchor?.addEventListener?.('click', () => startCampaign());
  ui.btnSailAgain?.addEventListener?.('click', () => resetCampaign());

  // Top Admiralty Bar
  ui.btnViewMode?.addEventListener?.('click', () => toggleViewMode());
  ui.btnCadTheme?.addEventListener?.('click', () => setCadTheme());
  ui.btnAudioToggle?.addEventListener?.('click', () => toggleAudioMute());

  // Boiler Panel
  ui.btnOverpressure?.addEventListener?.('click', () => handleEngageOverpressure());
  ui.btnBoilerBalance?.addEventListener?.('click', () => {
    sim.setBoilerSplit({ propulsion: 5.5, sponsons: 5.0, ordnance: 5.0 });
    syncHudFromState(sim.getState());
  });

  ui.rowAllocPropulsion?.addEventListener?.('click', () => setFocusedBoilerChannel('propulsion'));
  ui.rowAllocSponsons?.addEventListener?.('click', () => setFocusedBoilerChannel('sponsons'));
  ui.rowAllocOrdnance?.addEventListener?.('click', () => setFocusedBoilerChannel('ordnance'));

  ui.btnPropulsionDec?.addEventListener?.('click', (e) => {
    e?.stopPropagation?.();
    setFocusedBoilerChannel('propulsion');
    sim.allocateBoiler('propulsion', -0.5);
    syncHudFromState(sim.getState());
  });
  ui.btnPropulsionInc?.addEventListener?.('click', (e) => {
    e?.stopPropagation?.();
    setFocusedBoilerChannel('propulsion');
    sim.allocateBoiler('propulsion', 0.5);
    syncHudFromState(sim.getState());
  });

  ui.btnSponsonsDec?.addEventListener?.('click', (e) => {
    e?.stopPropagation?.();
    setFocusedBoilerChannel('sponsons');
    sim.allocateBoiler('sponsons', -0.5);
    syncHudFromState(sim.getState());
  });
  ui.btnSponsonsInc?.addEventListener?.('click', (e) => {
    e?.stopPropagation?.();
    setFocusedBoilerChannel('sponsons');
    sim.allocateBoiler('sponsons', 0.5);
    syncHudFromState(sim.getState());
  });

  ui.btnOrdnanceDec?.addEventListener?.('click', (e) => {
    e?.stopPropagation?.();
    setFocusedBoilerChannel('ordnance');
    sim.allocateBoiler('ordnance', -0.5);
    syncHudFromState(sim.getState());
  });
  ui.btnOrdnanceInc?.addEventListener?.('click', (e) => {
    e?.stopPropagation?.();
    setFocusedBoilerChannel('ordnance');
    sim.allocateBoiler('ordnance', 0.5);
    syncHudFromState(sim.getState());
  });

  // Altitude Strata
  ui.btnStratumLow?.addEventListener?.('click', () => {
    sim.setTargetStratum('low');
    syncHudFromState(sim.getState());
  });
  ui.btnStratumMid?.addEventListener?.('click', () => {
    sim.setTargetStratum('mid');
    syncHudFromState(sim.getState());
  });
  ui.btnStratumHigh?.addEventListener?.('click', () => {
    sim.setTargetStratum('high');
    syncHudFromState(sim.getState());
  });

  // Emergency Steam Vent
  ui.btnVentSteam?.addEventListener?.('click', () => {
    sim.ventSteam();
    syncHudFromState(sim.getState());
  });

  // Compact 3D Subsystem Pills & CAD Callout Pins
  for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
    const id = SUBSYSTEM_IDS[i];
    ui.pills3d[id]?.addEventListener?.('click', () => handleAssignCrew(id));
    ui.cadPins[id]?.addEventListener?.('click', (e) => {
      e?.stopPropagation?.();
      handleAssignCrew(id);
    });
  }

  // Broadsides & Ammo
  ui.btnFirePort?.addEventListener?.('click', () => {
    sim.fireBroadside('port');
    syncHudFromState(sim.getState());
  });
  ui.btnFireStarboard?.addEventListener?.('click', () => {
    sim.fireBroadside('starboard');
    syncHudFromState(sim.getState());
  });

  ui.btnAmmoRoundshot?.addEventListener?.('click', () => {
    sim.setAmmoType('roundshot');
    syncHudFromState(sim.getState());
  });
  ui.btnAmmoChainshot?.addEventListener?.('click', () => {
    sim.setAmmoType('chainshot');
    syncHudFromState(sim.getState());
  });
  ui.btnAmmoAethershell?.addEventListener?.('click', () => {
    sim.setAmmoType('aethershell');
    syncHudFromState(sim.getState());
  });

  // Quarterdeck Helm Hold/Step Buttons
  const bindHoldButton = (el, key, onTap) => {
    if (!el?.addEventListener) return;
    el.addEventListener('pointerdown', () => { helmButtonHold[key] = true; });
    el.addEventListener('pointerup', () => { helmButtonHold[key] = false; });
    el.addEventListener('pointerleave', () => { helmButtonHold[key] = false; });
    el.addEventListener('click', () => { if (onTap) onTap(); });
  };

  bindHoldButton(ui.btnRudderPort, 'port', null);
  bindHoldButton(ui.btnRudderStarboard, 'starboard', null);
  bindHoldButton(ui.btnThrottleDown, 'throttleDown', () => {
    const nextT = clamp(finiteOr(sim.getState().player?.throttle, 0.65) - 0.12, 0, 1);
    sim.step(0.001, { throttle: nextT });
    syncHudFromState(sim.getState());
  });
  bindHoldButton(ui.btnThrottleUp, 'throttleUp', () => {
    const nextT = clamp(finiteOr(sim.getState().player?.throttle, 0.65) + 0.12, 0, 1);
    sim.step(0.001, { throttle: nextT });
    syncHudFromState(sim.getState());
  });

  // Pointer Orbit Drag & 3D Subsystem Raycast Picking on #three-stage
  let pointerDown = false;
  let pointerMoved = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;

  ui.stage?.addEventListener?.('pointerdown', (ev) => {
    pointerDown = true;
    pointerMoved = 0;
    lastPointerX = finiteOr(ev.clientX, 0);
    lastPointerY = finiteOr(ev.clientY, 0);
  });

  win.addEventListener?.('pointermove', (ev) => {
    if (!pointerDown) return;
    const cx = finiteOr(ev.clientX, lastPointerX);
    const cy = finiteOr(ev.clientY, lastPointerY);
    const dx = cx - lastPointerX;
    const dy = cy - lastPointerY;
    lastPointerX = cx;
    lastPointerY = cy;
    pointerMoved += Math.hypot(dx, dy);

    if (viewMode === 'cad') {
      camRig.cadYawOffset = wrapAngle(camRig.cadYawOffset - dx * 0.0065);
    } else {
      camRig.helmYawOffset = wrapAngle(camRig.helmYawOffset - dx * 0.0068);
      camRig.helmPitch = clamp(camRig.helmPitch + dy * 0.0042, 0.06, 0.78);
    }
  });

  win.addEventListener?.('pointerup', (ev) => {
    if (!pointerDown) return;
    pointerDown = false;

    // Clean click without drag -> raycast 3D subsystem to dispatch Engineer Crew!
    if (pointerMoved < 6 && ev && ev.target === renderer?.domElement) {
      const vp = getViewportSize();
      const nx = (finiteOr(ev.clientX, vp.w * 0.5) / vp.w) * 2 - 1;
      const ny = -(finiteOr(ev.clientY, vp.h * 0.5) / vp.h) * 2 + 1;
      const hitSub = pickSubsystemAtNdc(nx, ny);
      if (hitSub) {
        handleAssignCrew(hitSub);
      }
    }
  });

  ui.stage?.addEventListener?.('dblclick', () => {
    camRig.helmYawOffset = 0;
    camRig.cadYawOffset = Math.PI * 0.25;
  });

  ui.stage?.addEventListener?.('wheel', (ev) => {
    ev?.preventDefault?.();
    const delta = finiteOr(ev.deltaY, 0);
    if (viewMode === 'cad') {
      camRig.cadZoom = clamp(camRig.cadZoom * (delta > 0 ? 0.92 : 1.09), 0.65, 1.85);
    } else {
      camRig.helmDist = clamp(camRig.helmDist + (delta > 0 ? 4.2 : -4.2), 32, 96);
    }
  }, { passive: false });

  // Keyboard Controls
  win.addEventListener?.('keydown', (ev) => {
    if (!ev || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const code = ev.code || '';
    keysHeld.add(code);

    if (code === 'Tab') {
      ev.preventDefault?.();
      toggleViewMode();
      return;
    }

    if (code === 'Enter' || code === 'Space') {
      const ph = sim.getState().phase;
      if (ph === 'title') {
        ev.preventDefault?.();
        startCampaign();
        return;
      }
      if (ph === 'victory' || ph === 'defeat') {
        ev.preventDefault?.();
        resetCampaign();
        return;
      }
    }

    if (code === 'KeyQ') {
      sim.fireBroadside('port');
      syncHudFromState(sim.getState());
    } else if (code === 'KeyE') {
      sim.fireBroadside('starboard');
      syncHudFromState(sim.getState());
    } else if (code === 'Digit1') {
      sim.setAmmoType('roundshot');
      syncHudFromState(sim.getState());
    } else if (code === 'Digit2') {
      sim.setAmmoType('chainshot');
      syncHudFromState(sim.getState());
    } else if (code === 'Digit3') {
      sim.setAmmoType('aethershell');
      syncHudFromState(sim.getState());
    } else if (code === 'KeyR') {
      stepAltitudeStratum(1);
    } else if (code === 'KeyF') {
      stepAltitudeStratum(-1);
    } else if (code === 'KeyO') {
      handleEngageOverpressure();
    } else if (code === 'KeyV') {
      sim.ventSteam();
      syncHudFromState(sim.getState());
    } else if (code === 'Minus' || code === 'NumpadSubtract') {
      sim.allocateBoiler(focusedBoilerKey, -0.5);
      syncHudFromState(sim.getState());
    } else if (code === 'Equal' || code === 'NumpadAdd') {
      sim.allocateBoiler(focusedBoilerKey, 0.5);
      syncHudFromState(sim.getState());
    } else if (code === 'KeyB') {
      const nextIdx = (BOILER_KEYS.indexOf(focusedBoilerKey) + 1) % BOILER_KEYS.length;
      setFocusedBoilerChannel(BOILER_KEYS[nextIdx]);
    } else if (code === 'KeyC') {
      camRig.helmYawOffset = 0;
      camRig.cadYawOffset = Math.PI * 0.25;
    } else if (code === 'KeyM') {
      toggleAudioMute();
    }
  });

  win.addEventListener?.('keyup', (ev) => {
    if (ev?.code) keysHeld.delete(ev.code);
  });

  win.addEventListener?.('blur', () => {
    keysHeld.clear();
    helmButtonHold.port = false;
    helmButtonHold.starboard = false;
    helmButtonHold.throttleUp = false;
    helmButtonHold.throttleDown = false;
  });

  win.addEventListener?.('resize', () => {
    const vp = getViewportSize();
    camera.aspect = vp.w / vp.h;
    camera.updateProjectionMatrix?.();
    renderer?.setSize?.(vp.w, vp.h);
    composer?.setSize?.(vp.w, vp.h);
    bloomPass?.setSize?.(vp.w, vp.h);
    updateCadPinsAndLeaders(sim.getState());
  });
}

// ---------------------------------------------------------------------------
// 12. INITIALIZATION, ANIMATION LOOP & QA GLOBAL EXPOSURE
// ---------------------------------------------------------------------------
initBoilerPipBars();
bindUiControls();

const bootState = sim.getState();
ships.setViewMode('3d', 'dark');
ships.syncState(bootState, 1 / 60, 0);
updateCameraRig(bootState, 1 / 60, 1.0);
syncHudFromState(bootState);
renderSceneFrame();

let lastFrameTimeMs = null;

function onAnimationFrame(nowMs) {
  if (typeof win.requestAnimationFrame === 'function') {
    win.requestAnimationFrame(onAnimationFrame);
  }
  const tMs = Number.isFinite(nowMs) ? nowMs : 0;
  const rawDt = lastFrameTimeMs === null ? 1 / 60 : clamp((tMs - lastFrameTimeMs) / 1000, 0.001, 0.08);
  lastFrameTimeMs = tMs;

  step(rawDt, null, { applyTacticalDilation: true });
}

if (typeof win.requestAnimationFrame === 'function') {
  win.requestAnimationFrame(onAnimationFrame);
}

const publicApi = {
  startCampaign,
  resetCampaign,
  toggleViewMode,
  setViewMode,
  setCadTheme,
  step,
  getState,
  assignCrew: handleAssignCrew,
  pickSubsystemAtNdc,
  sim,
  world: ships,
  audio,
  scene,
  camera,
  raycaster
};

win.AetherBroadside = publicApi;
export default publicApi;
