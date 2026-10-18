import * as THREE from 'three';
import {
  KRONOS_BPM,
  KRONOS_BEAT_SEC,
  KRONOS_BAR_SEC,
  KRONOS_FIRST_BEAT_OFFSET,
  KRONOS_LOOP_DURATION,
  KRONOS_BEAT_TIMES,
  KRONOS_BARS,
  KRONOS_TRACK_CHARTS,
  KRONOS_FULL_DURATION,
  KRONOS_ENEMY_ARCHETYPES,
  LIGHTING_PALETTES,
  estimateBpmFromAudioBuffer,
  buildCustomTrackChart,
  getSectionAtTime,
  getLightingCueAtTime,
  computeRunResultsSummary
} from './kronos-tracks.js?v=20261018k';
import { wrapCharacterRig, loadGLBAsset, loadClipsManifest } from './anim/rig-adapter.js?v=20261018k';
import { conformRigToClipSkeleton, stripHipsTranslation } from './anim/handbuilt-rig.js?v=20261018k';
import * as beatWarpModule from './anim/beatwarp.js?v=20261018k';
import {
  scheduleAction as scheduleBeatWarpAction,
  tickBeatWarp,
  cancelActorSchedules,
  clearActiveSchedules,
  hasActiveScheduleFor,
  setClipsManifest as setBeatWarpClipsManifest
} from './anim/beatwarp.js?v=20261018k';
import * as audioClockModule from './audio/clock.js?v=20261018k';
import {
  bindAudioEngine as clockBindAudioEngine,
  setActiveChart as clockSetActiveChart,
  scheduleSfx as clockScheduleSfx,
  songTimeToContextTime as clockSongTimeToContextTime,
  nextSubdivision as clockNextSubdivision,
  nearestSubdivision as clockNearestSubdivision
} from './audio/clock.js?v=20261018k';
import {
  applyEnemyHitReaction,
  getDirectionalHitReactionProfile,
  updateEnemyReactionState
} from './combat/reactions.js?v=20261018k';
import * as combatDirectorModule from './combat/director.js?v=20261018k';
import {
  tick as tickCombatDirector,
  evaluateCounterInput as directorEvaluateCounterInput,
  grantTakedownTokenProgress as directorGrantTokenProgress,
  consumeTakedownToken as directorConsumeTakedownToken,
  grantFeverProgress as directorGrantFeverProgress,
  getDirectorTelemetry,
  resetDirector
} from './combat/director.js?v=20261018k';

// Slice 2: enemies strike only on chart moveset markers through combat/director.js.
const DIRECTOR_ENABLED = true;
// Slice 3: the song drives the encounter (sections -> rosters, Kronos on markers, bar-39 finisher).
const SONG_ENCOUNTER = true;

// Who is in the ring during each section of the Flow track. `count` is the roster kept alive,
// `budget` the total crew the section can send before it is cleared. Phase fallbacks cover the
// instrumental and custom charts, whose sections carry only `phase`.
const ARCHETYPE_DEFS = Object.freeze({
  hook_brawler:       { label: 'HOOK BRAWLER',  hp: 130, color: 0x00e5ff },
  double_tap_striker: { label: 'ENFORCER',      hp: 145, color: 0xffe042 },
  heavy_charger:      { label: 'HEAVY CHARGER', hp: 165, color: 0xff1e38 }
});
const SECTION_ROSTERS = Object.freeze({
  intro:     { count: 1, budget: 2, archetypes: ['hook_brawler'] },
  verse_1:   { count: 2, budget: 5, archetypes: ['hook_brawler', 'double_tap_striker'] },
  hook_1:    { count: 2, budget: 6, archetypes: ['double_tap_striker', 'heavy_charger', 'hook_brawler'] },
  breakdown: { count: 2, budget: 5, archetypes: ['heavy_charger', 'double_tap_striker'] },
  verse_2:   { count: 1, budget: 3, archetypes: ['double_tap_striker', 'hook_brawler'], boss: true },
  outro:     { count: 1, budget: 2, archetypes: ['heavy_charger'], boss: true },
  byPhase: {
    stage:  { count: 2, budget: 4, archetypes: ['hook_brawler', 'double_tap_striker'] },
    unfold: { count: 2, budget: 5, archetypes: ['double_tap_striker', 'heavy_charger'] },
    ring:   { count: 1, budget: 2, archetypes: ['hook_brawler'], boss: true }
  }
});
const FEVER_RUSH_BARS = 2;
const FINISHER_INVULN_SEC = 1.2;
import { createContactShadowDecal } from './models/shared.js?v=20261018k';
import {
  buildChallengerModel,
  buildPersistentKickSmearRig
} from './models/challenger.js?v=20261018k';
import { buildKronosBossModel } from './models/kronos.js?v=20261018k';
import { buildBruiserModel } from './models/bruiser.js?v=20261018k';
import {
  buildSpectatorModel,
  buildInstancedArenaCrowd
} from './models/crowd.js?v=20261018k';
import {
  buildBoomboxStage,
  createBakedArenaAOMapTexture,
  createBakedArenaLightMapTexture
} from './models/stage.js?v=20261018k';
import {
  buildArenaEnvironment,
  buildFloorRhythmDial,
  buildSubwooferShockwaveRing,
  spawnStrikeSmearArc,
  spawn3DImpactBurst,
  createWeatheredAsphaltArenaTexture,
  ImpactBurstPool,
  SmearArcPool
} from './models/arena.js?v=20261018k';
import { initPostProcessing } from './kronos-postprocessing.js?v=20261018k';
import {
  SFX_SYNTH_TABLE,
  MAX_CATEGORY_VOICES,
  synthesizeCombatSfxVoice,
  synthesizeCrowdHypeSwell,
  scheduleBossTelegraphSfx
} from './kronos-sfx.js?v=20261018k';

const _bootTiming = { start: performance.now() };
const _urlParams = new URLSearchParams(window.location.search);
const IS_DEBUG_MODE = _urlParams.get('debug') === '1' || _urlParams.has('turnaround');
const IS_LOW_TIER = (
  window.matchMedia('(pointer: coarse)').matches ||
  window.innerWidth <= 900 ||
  (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
);

// ============================================================================
// 0. CENTRALIZED TUNING CONSTANTS & ACCESSIBILITY STATE
// ============================================================================
export const TUNING = {
  ARENA_RADIUS: 4.5,
  PLAYER_MAX_RADIUS: 4.2,
  INPUT_BUFFER_WINDOW_SEC: 0.50,
  PERFECT_WINDOW_SEC: 0.085,
  ON_BEAT_WINDOW_SEC: 0.165,
  OFF_BEAT_DAMAGE_MULT: 0.6,
  AUTO_AIM_MAX_DIST: 1.85,
  ACTIVE_HIT_MAX_DIST: 1.98,
  ACTIVE_HIT_MIN_FACING_DOT: 0.22,
  MAX_LUNGE_DIST: 1.35,
  DODGE_IFRAME_SEC: 0.22,
  DODGE_COOLDOWN_SEC: 0.38,
  COUNTER_WEAVE_LAST_WINDUP_SEC: 0.155,
  COUNTER_WEAVE_MAX_DIST: 2.20,
  ENEMY_MELEE_STRIKE_RADIUS: 1.55,
  COMBO_DECAY_SEC: 4.0,
  HIT_STOP: {
    JAB_PERFECT: 0.048,
    CROSS_PERFECT: 0.070,
    UPPERCUT_PERFECT: 0.110,
    KICK_PERFECT: 0.100,
    JAB_GOOD: 0.032,
    CROSS_GOOD: 0.048,
    UPPERCUT_GOOD: 0.065,
    KICK_GOOD: 0.070,
    DILATION: 0.08
  },
  MOVES: {
    'punch-jab':      { startup: 0.065, active: 0.060, recovery: 0.160, baseDmg: 32 },
    'punch-cross':    { startup: 0.075, active: 0.065, recovery: 0.170, baseDmg: 36 },
    'punch-uppercut': { startup: 0.085, active: 0.070, recovery: 0.190, baseDmg: 42 },
    'kick':           { startup: 0.095, active: 0.075, recovery: 0.210, baseDmg: 48 },
    'finisher':       { startup: 0.085, active: 0.070, recovery: 0.190, baseDmg: 42 },
    'miss':           { startup: 0.040, active: 0.020, recovery: 0.220, baseDmg: 0 },
    'miss':           { startup: 0.040, active: 0.020, recovery: 0.220, baseDmg: 0 }
  },
  WAVES: {
    1: {
      name: 'Cypher Vanguard',
      maxSimultaneousAttackers: 1,
      windupSec: 0.75,
      quickHookDmg: 10,
      haymakerDmg: 16,
      bruiserHp: 130,
      bruiserCount: 2,
      bossActive: false
    },
    2: {
      name: 'Heavy Hype-Crew',
      maxSimultaneousAttackers: 2,
      windupSec: 0.65,
      quickHookDmg: 14,
      haymakerDmg: 22,
      bruiserHp: 150,
      bruiserCount: 3,
      bossActive: false
    },
    3: {
      name: 'Boss Showdown (DJ Kronos + Royal Guard)',
      maxSimultaneousAttackers: 2,
      windupSec: 0.60,
      quickHookDmg: 16,
      haymakerDmg: 24,
      bruiserHp: 160,
      bruiserCount: 1,
      bossActive: true,
      bossScratchHitDmg: [10, 12, 18],
      bossBassDropDmg: 26,
      bossCounterRiposteDmg: 26,
      bossBassDropReboundDmg: 28
    }
  }
};

let reducedMotionEnabled = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.__kronosReducedMotion = reducedMotionEnabled;

// ============================================================================
// 1. TABLE-DRIVEN FIGHTING FOLEY SYNTH + LYRIA 3.5 AUDIO ENGINE
// ============================================================================
class KronosAudioEngine {
  constructor() {
    this.ctx = null;
    this.userGestureUnlocked = false;
    this.musicBus = null;
    this.musicFilter = null;
    this.sidechainDucker = null;
    this.sfxBus = null;
    this.masterCompressor = null;
    this.masterGain = null;
    this.analyser = null;
    this.freqData = new Uint8Array(64);

    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.88;
    this.activeTrackKey = 'flow';
    this._customObjectUrl = null;
    this.customChart = null;

    this.tracks = {
      'flow': new Audio('./assets/kronos-flow.mp3?v=8'),
      'inst-1': new Audio('./assets/kronos-lyria-inst-1.mp3?v=8'),
      'inst-2': new Audio('./assets/kronos-lyria-inst-2.mp3?v=8')
    };

    Object.values(this.tracks).forEach((el) => {
      el.loop = true;
      el.preload = 'metadata';
      el.crossOrigin = 'anonymous';
    });

    this.trackGains = {};
    this.foleyBuffers = {};
    this.noiseBuffers = {};
    this.shaperCurves = {};
    this.activeVoiceCount = 0;
    this.activeNodeCount = 0;
    this.activeSourceCount = 0;
    this.activeVoices = [];
    this.MAX_POLYPHONY = 24;
    this.MAX_CATEGORY_VOICES = { ...MAX_CATEGORY_VOICES };
    this.lastDuck = null;
    this._activeDuckTargetGain = 1.0;
    this._activeDuckEndTime = 0;
    this._activeConcCutoff = 20000;
    this._activeConcEndTime = 0;
    this.sfxCarveFilter = null;
    this.sfxLimiter = null;
    this.masterLimiter = null;

    let savedCalib = 0;
    try {
      const raw = typeof window !== 'undefined' && window.localStorage
        ? window.localStorage.getItem('kronos_audio_calibration_sec')
        : null;
      if (raw !== null) {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) savedCalib = Math.max(-0.25, Math.min(0.25, parsed));
      }
    } catch (e) {}
    this.calibrationOffsetSec = savedCalib;
    this._tapCalibSamples = [];
  }

  getActiveChart() {
    if (this.activeTrackKey === 'custom' && this.customChart) {
      return this.customChart;
    }
    return KRONOS_TRACK_CHARTS[this.activeTrackKey] || KRONOS_TRACK_CHARTS.flow;
  }

  initAudioGraph() {
    this.userGestureUnlocked = true;
    this.initContext();
  }

  initContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.initFoleyBufferPool();
    this.initNoiseBuffers();
    this.initShaperCurves();

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.72;

    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.707;

    this.sidechainDucker = this.ctx.createGain();
    this.sidechainDucker.gain.value = 1.0;

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.68;

    this.sfxCarveFilter = this.ctx.createBiquadFilter();
    this.sfxCarveFilter.type = 'peaking';
    this.sfxCarveFilter.frequency.value = 2100;
    this.sfxCarveFilter.Q.value = 1.1;
    this.sfxCarveFilter.gain.value = -3.5;

    this.sfxLimiter = this.ctx.createWaveShaper();
    this.sfxLimiter.curve = this.shaperCurves.softClip;
    this.sfxLimiter.oversample = '2x';

    this.masterCompressor = this.ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.setValueAtTime(-8.0, this.ctx.currentTime);
    this.masterCompressor.knee.setValueAtTime(8.0, this.ctx.currentTime);
    this.masterCompressor.ratio.setValueAtTime(12.0, this.ctx.currentTime);
    this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterCompressor.release.setValueAtTime(0.120, this.ctx.currentTime);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0.0 : this.volume;

    this.masterLimiter = this.ctx.createWaveShaper();
    this.masterLimiter.curve = this.shaperCurves.softClip;
    this.masterLimiter.oversample = '2x';

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.76;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.sidechainDucker);
    this.sidechainDucker.connect(this.masterCompressor);

    this.sfxBus.connect(this.sfxCarveFilter);
    this.sfxCarveFilter.connect(this.sfxLimiter);
    this.sfxLimiter.connect(this.masterCompressor);

    this.masterCompressor.connect(this.masterGain);
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    Object.entries(this.tracks).forEach(([key, el]) => {
      try {
        const src = this.ctx.createMediaElementSource(el);
        const g = this.ctx.createGain();
        g.gain.value = key === this.activeTrackKey ? 0.96 : 0.0;
        src.connect(g);
        g.connect(this.musicBus);
        this.trackGains[key] = g;
      } catch (e) {}
    });
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, Number(val)));
    if (this.volume > 0 && this.isMuted) {
      this.isMuted = false;
    }
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
    return this.isMuted;
  }

  initFoleyBufferPool() {
    if (this.foleyBuffers && this.foleyBuffers.gloveSnap) return;
    const sr = this.ctx.sampleRate;

    const snapLen = Math.floor(sr * 0.080);
    const snapBuf = this.ctx.createBuffer(1, snapLen, sr);
    const snapData = snapBuf.getChannelData(0);
    for (let i = 0; i < snapLen; i++) {
      const t = i / sr;
      const crack = (Math.random() * 2 - 1) * Math.exp(-t / 0.005);
      const leather = Math.sin(2 * Math.PI * 1850 * t) * Math.exp(-t / 0.016);
      snapData[i] = 0.65 * crack + 0.35 * leather;
    }

    const whooshLen = Math.floor(sr * 0.280);
    const whooshBuf = this.ctx.createBuffer(1, whooshLen, sr);
    const whooshData = whooshBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < whooshLen; i++) {
      const t = i / sr;
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      const pink = (b0 + b1 + b2 + white * 0.1848) * 0.05;
      const env = Math.pow(t / 0.075, 1.3) * Math.exp(-Math.pow((t - 0.075) / 0.115, 2));
      whooshData[i] = pink * env;
    }

    const thudLen = Math.floor(sr * 0.160);
    const thudBuf = this.ctx.createBuffer(1, thudLen, sr);
    const thudData = thudBuf.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < thudLen; i++) {
      const t = i / sr;
      const instFreq = 98 + (155 - 98) * Math.exp(-t / 0.040);
      phase += (2 * Math.PI * instFreq) / sr;
      const tone = Math.sin(phase) * Math.exp(-t / 0.055);
      const grit = (Math.random() * 2 - 1) * Math.exp(-t / 0.035) * 0.22;
      thudData[i] = Math.tanh(1.6 * (tone + grit));
    }

    const subLen = Math.floor(sr * 0.220);
    const subBuf = this.ctx.createBuffer(1, subLen, sr);
    const subData = subBuf.getChannelData(0);
    let subPhase = 0;
    for (let i = 0; i < subLen; i++) {
      const t = i / sr;
      const instFreq = 49.0 + (65.4 - 49.0) * Math.exp(-t / 0.045);
      subPhase += (2 * Math.PI * instFreq) / sr;
      const env = Math.pow(Math.max(0, 1.0 - t / 0.220), 1.2) * Math.exp(-t / 0.090);
      subData[i] = Math.sin(subPhase) * env;
    }

    const airLen = Math.floor(sr * 0.040);
    const airBuf = this.ctx.createBuffer(1, airLen, sr);
    const airData = airBuf.getChannelData(0);
    for (let i = 0; i < airLen; i++) {
      const t = i / sr;
      airData[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.007);
    }

    this.foleyBuffers = {
      gloveSnap: snapBuf,
      leatherSnap: snapBuf,
      clothWhoosh: whooshBuf,
      bodyThud: thudBuf,
      subPunch: subBuf,
      transientAir: airBuf
    };
  }

  initNoiseBuffers() {
    this.initFoleyBufferPool();
    if (this.noiseBuffers && this.noiseBuffers.crack) return;
    const sr = this.ctx.sampleRate;

    const crackLen = Math.floor(sr * 0.15);
    const crackBuf = this.ctx.createBuffer(1, crackLen, sr);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.018));
    }

    const whooshLen = Math.floor(sr * 0.35);
    const whooshBuf = this.ctx.createBuffer(1, whooshLen, sr);
    const whooshData = whooshBuf.getChannelData(0);
    for (let i = 0; i < whooshLen; i++) {
      whooshData[i] = (Math.random() * 2 - 1) * Math.sin((i / whooshLen) * Math.PI);
    }

    const whiteLen = Math.floor(sr * 2.0);
    const whiteBuf = this.ctx.createBuffer(1, whiteLen, sr);
    const whiteData = whiteBuf.getChannelData(0);
    for (let i = 0; i < whiteLen; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }

    const crowdLen = Math.floor(sr * 1.5);
    const crowdBuf = this.ctx.createBuffer(2, crowdLen, sr);
    const crowdL = crowdBuf.getChannelData(0);
    const crowdR = crowdBuf.getChannelData(1);
    for (let i = 0; i < crowdLen; i++) {
      const env = Math.sin((i / crowdLen) * Math.PI);
      crowdL[i] = (Math.random() * 2 - 1) * env;
      crowdR[i] = (Math.random() * 2 - 1) * env;
    }

    this.noiseBuffers = {
      crack: crackBuf,
      short: crackBuf,
      whoosh: this.foleyBuffers ? this.foleyBuffers.clothWhoosh : whooshBuf,
      med: whooshBuf,
      white: whiteBuf,
      crowd: crowdBuf,
      long: crowdBuf
    };
  }

  initShaperCurves() {
    if (this.shaperCurves && this.shaperCurves.softClip) return;
    const n = 1024;
    const soft = new Float32Array(n);
    const over = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      soft[i] = (x * (1 + 0.5 * Math.abs(x))) / (1 + Math.abs(x));
      over[i] = Math.tanh(3.2 * x);
    }
    this.shaperCurves = { softClip: soft, overdrive: over };
  }

  registerVoiceCleanup(nodes, durationSec, voiceMeta = null) {
    if (!nodes) return;
    if (!Array.isArray(nodes)) nodes = [nodes];
    const validNodes = nodes.filter(Boolean);
    if (validNodes.length === 0) return;
    const sources = validNodes.filter((n) => 'onended' in n || typeof n.stop === 'function');

    this.activeVoiceCount = (this.activeVoiceCount || 0) + 1;
    this.activeNodeCount = (this.activeNodeCount || 0) + validNodes.length;
    this.activeSourceCount = (this.activeSourceCount || 0) + sources.length;

    let cleaned = false;
    let timerId = null;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      this.activeVoiceCount = Math.max(0, (this.activeVoiceCount || 0) - 1);
      this.activeNodeCount = Math.max(0, (this.activeNodeCount || 0) - validNodes.length);
      this.activeSourceCount = Math.max(0, (this.activeSourceCount || 0) - sources.length);

      if (voiceMeta && this.activeVoices) {
        const idx = this.activeVoices.indexOf(voiceMeta);
        if (idx !== -1) this.activeVoices.splice(idx, 1);
      }

      validNodes.forEach((node) => {
        try { if (typeof node.stop === 'function') node.stop(); } catch (e) {}
        try { if (typeof node.disconnect === 'function') node.disconnect(); } catch (e) {}
      });
    };

    if (sources.length > 0) {
      let endedCount = 0;
      sources.forEach((src) => {
        src.onended = () => {
          endedCount++;
          if (endedCount >= sources.length) cleanup();
        };
      });
    }

    const timeoutMs = Math.max(20, Math.ceil(((Number(durationSec) || 0.1) + 0.08) * 1000));
    timerId = setTimeout(cleanup, timeoutMs);

    if (voiceMeta) {
      voiceMeta.immediateDispose = cleanup;
      voiceMeta.forceStop = (immediate = false) => {
        if (cleaned) return;
        const curTime = this.ctx ? this.ctx.currentTime : 0;
        validNodes.forEach((node) => {
          if (node instanceof GainNode && node !== this.sfxBus && node !== this.musicBus && node !== this.masterGain && node !== this.sidechainDucker) {
            try {
              node.gain.cancelScheduledValues(curTime);
              node.gain.setValueAtTime(Math.max(0.0001, node.gain.value), curTime);
              node.gain.exponentialRampToValueAtTime(0.0001, curTime + 0.010);
            } catch (e) {}
          }
        });
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        if (immediate || (this.activeVoices && this.activeVoices.length >= (this.MAX_POLYPHONY || 24))) {
          cleanup();
        } else {
          timerId = setTimeout(cleanup, 12);
        }
      };
      if (!this.activeVoices) this.activeVoices = [];
      this.activeVoices.push(voiceMeta);
    }
  }

  duckMusic(amountDb = -8, durationSec = 0.32) {
    if (!this.ctx || !this.sidechainDucker) return;
    const now = this.ctx.currentTime;
    const targetGain = Math.max(0.0001, Math.pow(10, amountDb / 20));
    const newEndTime = now + durationSec;
    const duckNode = this.sidechainDucker;

    this.lastDuck = { amountDb, targetGain, durationSec, startTime: now };

    if (!this._activeDuckEndTime || now >= this._activeDuckEndTime) {
      this._activeDuckTargetGain = 1.0;
      this._activeDuckEndTime = 0;
    }

    if (targetGain <= this._activeDuckTargetGain) {
      this._activeDuckTargetGain = targetGain;
      this._activeDuckEndTime = Math.max(this._activeDuckEndTime, newEndTime);
      duckNode.gain.cancelScheduledValues(now);
      duckNode.gain.setValueAtTime(duckNode.gain.value, now);
      const attackTime = 0.012;
      duckNode.gain.linearRampToValueAtTime(targetGain, now + attackTime);
      const holdTime = Math.max(0.02, (this._activeDuckEndTime - now) * 0.35);
      duckNode.gain.setValueAtTime(targetGain, now + attackTime + holdTime);
      duckNode.gain.linearRampToValueAtTime(1.0, this._activeDuckEndTime);
      duckNode.gain.setValueAtTime(1.0, this._activeDuckEndTime);
    } else if (newEndTime > this._activeDuckEndTime) {
      this._activeDuckEndTime = newEndTime;
      duckNode.gain.cancelScheduledValues(now + 0.012);
      const holdTime = Math.max(0.02, (this._activeDuckEndTime - now) * 0.35);
      duckNode.gain.setValueAtTime(this._activeDuckTargetGain, now + 0.012 + holdTime);
      duckNode.gain.linearRampToValueAtTime(1.0, this._activeDuckEndTime);
      duckNode.gain.setValueAtTime(1.0, this._activeDuckEndTime);
    }
  }

  triggerConcussion(cutoffFreq = 450, durationSec = 0.40) {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    const filterFreq = this.musicFilter.frequency;
    const safeCutoff = Math.max(20, cutoffFreq);
    const newEndTime = now + durationSec;

    if (!this._activeConcEndTime || now >= this._activeConcEndTime) {
      this._activeConcCutoff = 20000;
      this._activeConcEndTime = 0;
    }

    if (safeCutoff <= this._activeConcCutoff) {
      this._activeConcCutoff = safeCutoff;
      this._activeConcEndTime = Math.max(this._activeConcEndTime, newEndTime);
      filterFreq.cancelScheduledValues(now);
      filterFreq.setValueAtTime(Math.max(20, filterFreq.value), now);
      filterFreq.exponentialRampToValueAtTime(safeCutoff, now + 0.015);
      const holdTime = Math.min(0.12, (this._activeConcEndTime - now) * 0.30);
      filterFreq.setValueAtTime(safeCutoff, now + 0.015 + holdTime);
      filterFreq.exponentialRampToValueAtTime(20000, this._activeConcEndTime);
      filterFreq.setValueAtTime(20000, this._activeConcEndTime);
    } else if (newEndTime > this._activeConcEndTime) {
      this._activeConcEndTime = newEndTime;
      filterFreq.cancelScheduledValues(now + 0.015);
      const holdTime = Math.min(0.12, (this._activeConcEndTime - now) * 0.30);
      filterFreq.setValueAtTime(this._activeConcCutoff, now + 0.015 + holdTime);
      filterFreq.exponentialRampToValueAtTime(20000, this._activeConcEndTime);
      filterFreq.setValueAtTime(20000, this._activeConcEndTime);
    }
  }

  async toggle() {
    this.userGestureUnlocked = true;
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.isPlaying) {
      this.pause();
      return false;
    }
    return await this.play();
  }

  async play() {
    this.userGestureUnlocked = true;
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const trackKey = this.activeTrackKey === 'custom' ? 'flow' : this.activeTrackKey;
    const activeEl = this.tracks[trackKey];
    if (!activeEl) {
      this.isPlaying = false;
      return false;
    }
    try {
      const playPromise = activeEl.play();
      if (playPromise && typeof playPromise.then === 'function') {
        await playPromise;
      }
      this.isPlaying = !activeEl.paused;
      this.updateGains();
      return this.isPlaying;
    } catch (err) {
      this.isPlaying = false;
      return false;
    }
  }

  pause() {
    this.isPlaying = false;
    Object.values(this.tracks).forEach((el) => el.pause());
  }

  async restart(autoPlay = false) {
    const shouldPlay = Boolean(autoPlay || this.isPlaying);
    Object.values(this.tracks).forEach((el) => {
      try {
        el.currentTime = 0;
      } catch (e) {}
    });
    if (shouldPlay && this.userGestureUnlocked) {
      return await this.play();
    }
    return this.isPlaying;
  }

  async selectTrack(key) {
    this.userGestureUnlocked = true;
    this.initContext();
    const prevKey = this.activeTrackKey === 'custom' ? 'flow' : this.activeTrackKey;
    const prevEl = this.tracks[prevKey];
    const nextEl = this.tracks[key];
    if (!nextEl) return false;

    if (key === 'flow' && this._customObjectUrl) {
      URL.revokeObjectURL(this._customObjectUrl);
      this._customObjectUrl = null;
      this.customChart = null;
      this.tracks.flow.src = './assets/kronos-flow.mp3?v=8';
    }

    const chart = KRONOS_TRACK_CHARTS[key] || KRONOS_TRACK_CHARTS.flow;
    const currentPos = prevEl ? prevEl.currentTime : 0;
    this.activeTrackKey = key;
    nextEl.currentTime = currentPos % (nextEl.duration || chart.loopDuration || KRONOS_LOOP_DURATION);

    if (this.isPlaying) {
      Object.entries(this.tracks).forEach(([k, el]) => {
        if (k !== key) el.pause();
      });
      try {
        await nextEl.play();
        this.isPlaying = !nextEl.paused;
      } catch (e) {
        this.isPlaying = false;
      }
    }
    this.updateGains();
    return this.isPlaying;
  }

  async loadCustomFile(file) {
    if (!file) return null;
    this.userGestureUnlocked = true;
    this.initContext();

    if (this._customObjectUrl) {
      URL.revokeObjectURL(this._customObjectUrl);
      this._customObjectUrl = null;
    }

    let estimated = { bpm: 92, firstBeatOffset: 0.15, duration: 101.6 };
    try {
      const arrayBuf = await file.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(arrayBuf.slice(0));
      const est = estimateBpmFromAudioBuffer(decoded);
      estimated = {
        bpm: est.bpm || 92,
        firstBeatOffset: est.firstBeatOffset || 0.12,
        duration: decoded.duration || 100.0
      };
    } catch (e) {
      // Fallback if decoding fails
    }

    const url = URL.createObjectURL(file);
    this._customObjectUrl = url;
    this.tracks.flow.src = url;
    this.activeTrackKey = 'custom';
    this.customChart = buildCustomTrackChart(file.name, estimated.bpm, estimated.firstBeatOffset, estimated.duration);

    if (this.isPlaying) {
      try {
        await this.tracks.flow.play();
        this.isPlaying = !this.tracks.flow.paused;
      } catch (e) {
        this.isPlaying = false;
      }
    }
    this.updateGains();
    return this.customChart;
  }

  updateGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const activeMediaKey = this.activeTrackKey === 'custom' ? 'flow' : this.activeTrackKey;
    Object.entries(this.trackGains).forEach(([key, g]) => {
      g.gain.setTargetAtTime(key === activeMediaKey ? 0.96 : 0.0, now, 0.03);
    });
  }

  getOutputLatencySec() {
    const ctxLat = this.ctx ? ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) : 0;
    return ctxLat + (this.calibrationOffsetSec || 0);
  }

  setCalibrationOffsetSec(offsetSec) {
    const clamped = Math.max(-0.25, Math.min(0.25, Number(offsetSec) || 0));
    this.calibrationOffsetSec = clamped;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('kronos_audio_calibration_sec', String(clamped));
      }
    } catch (e) {}
    return this.calibrationOffsetSec;
  }

  tapCalibrate() {
    const activeMediaKey = this.activeTrackKey === 'custom' ? 'flow' : this.activeTrackKey;
    const activeEl = this.tracks[activeMediaKey];
    if (!this.isPlaying || !activeEl || activeEl.paused) return this.calibrationOffsetSec;
    const chart = this.getActiveChart();
    const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
    const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
    const ctxLat = this.ctx ? ((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) : 0;
    const uncalibratedSongTime = Math.max(0, activeEl.currentTime - ctxLat);
    const beatFloat = (uncalibratedSongTime - firstOffset) / beatSec;
    const nearestBeat = Math.round(beatFloat);
    const residualSec = (beatFloat - nearestBeat) * beatSec;
    this._tapCalibSamples.push(residualSec);
    if (this._tapCalibSamples.length > 8) this._tapCalibSamples.shift();
    const avgOffset = this._tapCalibSamples.reduce((a, b) => a + b, 0) / this._tapCalibSamples.length;
    return this.setCalibrationOffsetSec(avgOffset);
  }

  getSongTime() {
    if (IS_DEBUG_MODE && typeof gameState !== 'undefined') {
      if (gameState._debugMusicPlaying) {
        return Number(gameState._debugSongTime) || 0;
      }
      if (typeof gameState.songTime === 'number') {
        return gameState.songTime;
      }
    }
    const activeMediaKey = this.activeTrackKey === 'custom' ? 'flow' : this.activeTrackKey;
    const activeEl = this.tracks[activeMediaKey];
    if (this.isPlaying && activeEl && !activeEl.paused) {
      return Math.max(0, activeEl.currentTime - this.getOutputLatencySec());
    }
    return null;
  }

  getBassEnergy() {
    if (!this.analyser || !this.isPlaying) {
      return 0.0;
    }
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += this.freqData[i];
    return sum / (8 * 255);
  }

  calculateSpatialPan(sourcePos) {
    if (!sourcePos) return 0.0;
    const cam = camera;
    if (!cam || !cam.matrixWorldInverse) return 0.0;

    let wx = 0, wy = 0, wz = 0;
    if (typeof sourcePos === 'number') {
      return Math.max(-0.92, Math.min(0.92, sourcePos));
    } else if (sourcePos.isVector3 || (typeof sourcePos.x === 'number' && typeof sourcePos.y === 'number' && typeof sourcePos.z === 'number')) {
      wx = sourcePos.x; wy = sourcePos.y; wz = sourcePos.z;
    } else if (sourcePos.rig && sourcePos.rig.root && sourcePos.rig.root.position) {
      wx = sourcePos.rig.root.position.x; wy = sourcePos.rig.root.position.y; wz = sourcePos.rig.root.position.z;
    } else {
      return 0.0;
    }

    const e = cam.matrixWorldInverse.elements;
    const xCam = e[0] * wx + e[4] * wy + e[8] * wz + e[12];
    const zCam = e[2] * wx + e[6] * wy + e[10] * wz + e[14];
    const horizDist = Math.sqrt(xCam * xCam + zCam * zCam);
    if (horizDist < 0.0001) return 0.0;
    return Math.max(-0.92, Math.min(0.92, xCam / horizDist));
  }

  _enforcePolyphony(action, categoryLimit) {
    if (!this.activeVoices) this.activeVoices = [];
    if (categoryLimit) {
      const catVoices = this.activeVoices.filter((v) => v.action === action);
      while (catVoices.length >= categoryLimit) {
        catVoices.sort((a, b) => a.startTime - b.startTime);
        const oldest = catVoices.shift();
        if (oldest) {
          if (typeof oldest.immediateDispose === 'function') oldest.immediateDispose();
          else if (typeof oldest.forceStop === 'function') oldest.forceStop(true);
          const idx = this.activeVoices.indexOf(oldest);
          if (idx !== -1) this.activeVoices.splice(idx, 1);
        } else break;
      }
    }
    const maxPoly = this.MAX_POLYPHONY || 24;
    while (this.activeVoices.length >= maxPoly || this.activeVoiceCount >= maxPoly) {
      this.activeVoices.sort((a, b) => (a.priority - b.priority) || (a.startTime - b.startTime));
      const toSteal = this.activeVoices[0];
      if (toSteal) {
        if (typeof toSteal.immediateDispose === 'function') toSteal.immediateDispose();
        else if (typeof toSteal.forceStop === 'function') toSteal.forceStop(true);
        const idx = this.activeVoices.indexOf(toSteal);
        if (idx !== -1) this.activeVoices.splice(idx, 1);
      } else break;
    }
  }

  triggerCrowdHype(type = 'combo-4', options = {}) {
    if (!this.ctx && !this.userGestureUnlocked) return false;
    this.initContext();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;
    if (!options.force && this._lastCrowdTime && (now - this._lastCrowdTime < 0.16)) return false;
    this._lastCrowdTime = now;

    this._enforcePolyphony('crowd-swell', this.MAX_CATEGORY_VOICES['crowd-swell'] || 2);
    const { dur } = synthesizeCrowdHypeSwell(this, type, options, now);

    if (typeof gameState !== 'undefined' && gameState) {
      gameState.crowdHypeTimer = Math.max(gameState.crowdHypeTimer || 0, dur);
    }
    return true;
  }

  playCombatSfx(action, grade = 'PERFECT', spatialSource = null, scheduledStartTime = null) {
    if (!this.ctx && !this.userGestureUnlocked) return;
    this.initContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const now = scheduledStartTime !== null && scheduledStartTime !== undefined
      ? Math.max(this.ctx.currentTime, scheduledStartTime)
      : this.ctx.currentTime;
    this._enforcePolyphony(action, this.MAX_CATEGORY_VOICES ? this.MAX_CATEGORY_VOICES[action] : null);
    synthesizeCombatSfxVoice(this, action, grade, spatialSource, now);
  }

  scheduleBossTelegraphCue(pattern = 'bass_drop', beatSec = KRONOS_BEAT_SEC, windupDur = KRONOS_BEAT_SEC, spatialSource = null) {
    return scheduleBossTelegraphSfx(this, pattern, beatSec, windupDur, spatialSource);
  }
}

const audioEngine = new KronosAudioEngine();
clockBindAudioEngine(audioEngine);
_bootTiming.afterAudio = performance.now();

// ============================================================================
// 2. THREE.JS SCENE, CALIBRATED CAMERA FRAMING & CEL-SHADED LIGHTING
// ============================================================================
const stageContainer = document.getElementById('three-stage');
const renderer = new THREE.WebGLRenderer({
  antialias: !IS_LOW_TIER,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: IS_DEBUG_MODE
});
const _initW = Math.max(1, window.innerWidth || 1280);
const _initH = Math.max(1, window.innerHeight || 800);
renderer.setPixelRatio(IS_LOW_TIER ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(_initW, _initH);
renderer.shadowMap.enabled = !IS_LOW_TIER;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stageContainer.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b132b);
scene.fog = new THREE.FogExp2(0x0b132b, 0.018);

const CAMERA_PRESETS = {
  orbit: {
    pos: new THREE.Vector3(-9.2, 9.8, 10.2),
    lookAt: new THREE.Vector3(0.0, 1.0, -0.5)
  },
  action: {
    pos: new THREE.Vector3(-0.65, 1.95, 5.15),
    lookAt: new THREE.Vector3(0.15, 1.45, -2.5)
  },
  booth: {
    pos: new THREE.Vector3(0.5, 3.1, -2.85),
    lookAt: new THREE.Vector3(0.0, 1.1, 3.5)
  },
  south: {
    pos: new THREE.Vector3(0.0, 2.4, 7.6),
    lookAt: new THREE.Vector3(0.0, 1.4, 0.0)
  }
};

const cameraJuice = {
  trauma: 0.0,
  fovDip: 0.0,
  baseFovDip: 0.0,
  baseDutchRoll: 0.0,
  dutchRoll: 0.0,
  punchTime: 0,
  shakeOffset: new THREE.Vector3(),
  decaySpeed: 8.5
};

const camera = new THREE.PerspectiveCamera(45, _initW / _initH, 0.05, 140);
camera.position.copy(CAMERA_PRESETS.orbit.pos);
camera.lookAt(CAMERA_PRESETS.orbit.lookAt);

const cameraState = {
  mode: 'orbit',
  currentPos: CAMERA_PRESETS.orbit.pos.clone(),
  currentLookAt: CAMERA_PRESETS.orbit.lookAt.clone(),
  targetPos: CAMERA_PRESETS.orbit.pos.clone(),
  targetLookAt: CAMERA_PRESETS.orbit.lookAt.clone(),
  orbitCenter: new THREE.Vector3(0.0, 1.35, 0.5),
  isDragging: false,
  prevPointer: { x: 0, y: 0 },
  spherical: new THREE.Spherical()
};

function setCameraPreset(mode, snap = false) {
  if (!CAMERA_PRESETS[mode]) return;
  cameraState.mode = mode;
  cameraState.targetPos.copy(CAMERA_PRESETS[mode].pos);
  cameraState.targetLookAt.copy(CAMERA_PRESETS[mode].lookAt);
  if (snap) {
    cameraState.currentPos.copy(cameraState.targetPos);
    cameraState.currentLookAt.copy(cameraState.targetLookAt);
  }
  document.querySelectorAll('.cam-pill').forEach((p) => {
    p.classList.toggle('active', p.dataset.mode === mode);
  });
}

function resetCameraToOrbit() {
  setCameraPreset('orbit');
}

let postProcessing = null;
const _rendererSizeVec = new THREE.Vector2();
renderer.getSize(_rendererSizeVec);
let _lastCanvasW = Math.max(1, Math.floor(_rendererSizeVec.x || _initW));
let _lastCanvasH = Math.max(1, Math.floor(_rendererSizeVec.y || _initH));
try {
  postProcessing = initPostProcessing(
    renderer,
    scene,
    camera,
    _lastCanvasW,
    _lastCanvasH,
    { isLowTier: IS_LOW_TIER }
  );
  if (postProcessing && postProcessing.onResize) {
    postProcessing.onResize(_lastCanvasW, _lastCanvasH);
  }
} catch (err) {
  postProcessing = null;
}

// Lights
const hemiLight = new THREE.HemisphereLight(0x243258, 0x2e2438, 1.15);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xdce6ff, 0.53);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff2d8, 1.78);
keyLight.position.set(-5.0, 14.0, 9.0);
keyLight.castShadow = !IS_LOW_TIER;
keyLight.shadow.mapSize.set(IS_LOW_TIER ? 1024 : 2048, IS_LOW_TIER ? 1024 : 2048);
keyLight.shadow.camera.left = -22.0;
keyLight.shadow.camera.right = 22.0;
keyLight.shadow.camera.top = 22.0;
keyLight.shadow.camera.bottom = -22.0;
keyLight.shadow.camera.near = 2.0;
keyLight.shadow.camera.far = 52.0;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.035;
keyLight.shadow.camera.updateProjectionMatrix();
scene.add(keyLight);

const characterRimLight = new THREE.DirectionalLight(0x8ce8ff, 1.4);
characterRimLight.position.set(0, 4.5, -7.5);
characterRimLight.castShadow = false;
scene.add(characterRimLight);

// Perimeter bounce/streetlamp illumination for 3D balcony & perimeter spectators (0 extra draw calls in forward pass)
const westBounceLight = new THREE.PointLight(0xffa834, 3.2, 18.0);
westBounceLight.position.set(-9.2, 3.8, -2.2);
scene.add(westBounceLight);

const westSconceLight = new THREE.PointLight(0xffe066, 1.4, 11.0);
westSconceLight.position.set(-7.6, 3.6, 0.5);
scene.add(westSconceLight);

const eastBounceLight = new THREE.PointLight(0xffb836, 1.9, 15.0);
eastBounceLight.position.set(8.8, 3.2, -1.0);
scene.add(eastBounceLight);

const bodegaFrontLight = new THREE.PointLight(0xffb836, 1.9, 15.0);
bodegaFrontLight.position.set(9.2, 3.2, 2.2);
scene.add(bodegaFrontLight);

const neonCyanLight = new THREE.PointLight(0x24e5ff, 2.0, 14.0);
neonCyanLight.position.set(9.0, 5.2, 2.0);
scene.add(neonCyanLight);

const neonMagentaLight = new THREE.PointLight(0xff2a85, 2.0, 14.0);
neonMagentaLight.position.set(9.0, 6.5, 2.0);
scene.add(neonMagentaLight);

const streetlampLights = [
  [-6.5, 4.2, -4.6],
  [7.4,  4.2, -3.6],
  [-6.6, 4.2,  5.8],
  [6.6,  4.2,  5.8]
].map(([lx, ly, lz]) => {
  const pLight = new THREE.PointLight(0xffd15c, 1.6, 9.0);
  pLight.position.set(lx, ly, lz);
  scene.add(pLight);
  return pLight;
});

const stageMagentaLight = new THREE.PointLight(0xff3898, 1.70, 18.0);
stageMagentaLight.position.set(2.4, 5.2, -3.5);
stageMagentaLight.castShadow = false;
scene.add(stageMagentaLight);

const stageCyanLight = new THREE.PointLight(0x24e5ff, 1.50, 18.0);
stageCyanLight.position.set(-1.5, 3.8, -3.2);
stageCyanLight.castShadow = false;
scene.add(stageCyanLight);

const vanHeadlights = [-0.65, 0.65].map((vx) => {
  const headlight = new THREE.SpotLight(0xfff099, 2.5, 22.0, 0.60, 0.45, 1.2);
  headlight.position.set(vx + 1.2, 1.35, 9.8);
  headlight.target.position.set(vx * 1.5, 0.0, 3.5);
  return headlight;
});
_bootTiming.afterLights = performance.now();

// ============================================================================
// 3. FLOOR, STAGE, ENVIRONMENT & POOLED VFX
// ============================================================================
const elStartBootStatus = document.getElementById('boot-status-text') || document.getElementById('start-loader-status') || document.getElementById('start-boot-status');
const elStartLoaderFill = document.getElementById('boot-bar-fill') || document.getElementById('start-loader-fill');
const elBtnStartCypher = document.getElementById('btn-start-cypher');
const elStartOverlay = document.getElementById('start-overlay');
const elPauseOverlay = document.getElementById('pause-overlay');
const elResultsOverlay = document.getElementById('results-overlay');

function setBootProgress(msg, pct = 100) {
  if (elStartBootStatus) elStartBootStatus.textContent = msg;
  if (elStartLoaderFill) elStartLoaderFill.style.width = `${pct}%`;
}

setBootProgress('Building urban asphalt floor & rhythm dial…', 60);
const floorMesh = new THREE.Mesh(
  new THREE.CircleGeometry(42, 64),
  new THREE.MeshToonMaterial({
    map: createWeatheredAsphaltArenaTexture(),
    aoMap: createBakedArenaAOMapTexture(),
    aoMapIntensity: 1.0,
    lightMap: createBakedArenaLightMapTexture(),
    lightMapIntensity: 1.0
  })
);
floorMesh.material.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <aomap_fragment>',
    `
    #include <aomap_fragment>
    #ifdef USE_AOMAP
    reflectedLight.directDiffuse *= (ambientOcclusion * 0.65 + 0.35);
    #endif
    `
  );
};
floorMesh.geometry.setAttribute('uv2', floorMesh.geometry.attributes.uv.clone());
floorMesh.name = 'floorMesh';
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const floorDial = buildFloorRhythmDial(scene);
floorDial.dialGroup.position.set(-0.22, 0.025, 1.68);
_bootTiming.afterFloor = performance.now();

setBootProgress('Constructing Transforming Boombox Stage & Courtyard…');
const boomboxStage = buildBoomboxStage(scene);
buildArenaEnvironment(scene);
_bootTiming.afterStage = performance.now();

// ============================================================================
// 4. CHALLENGER, BOSS DJ KRONOS, BRUISERS & DEFERRED INSTANCED CROWD
// ============================================================================
setBootProgress('Rigging Challenger & Boss DJ Kronos…');
const challengerRig = buildChallengerModel();
challengerRig.root.position.set(-0.46, 0, 1.68);
challengerRig.root.scale.setScalar(1.02);
scene.add(challengerRig.root);

const kickSmear = buildPersistentKickSmearRig(challengerRig.root);

// Authored fight clips (assets/models/kronos-clips-challenger.glb, animation-only) drive the
// hand-built Challenger through an AnimationMixer. The hand-built rig keeps its meshes; only four
// pivots (spine, neck, shoulders) are inserted so every clip track binds by name.
/**
 * Attaches the authored clips of one fighter type to a hand-built rig: conform the hierarchy to
 * the clip skeleton, build an AnimationMixer, keep hips translation only for the idle dances
 * (enemy launch/knockback physics owns the hips otherwise).
 */
async function attachClipsToRig(rig, type, manifest) {
  const { scene, animations } = await loadGLBAsset(`./assets/models/kronos-clips-${type}.glb?v=20261018k`);
  const report = conformRigToClipSkeleton(rig, scene);
  const clips = type === 'challenger' ? animations : stripHipsTranslation(animations);
  wrapCharacterRig(rig, {
    animations: clips,
    clipMetadata: manifest && manifest.clips ? manifest.clips : undefined,
    preserveDirectJointProps: true
  });
  rig.clipDriven = true;
  rig.clipType = type;
  rig.clipPivotReport = report;
  if (report.maxDeviationM > 0.005) {
    console.warn(`[kronos] ${type} rig moved ${report.maxDeviationM} m while conforming to its clip skeleton`, report);
  }
  return clips.length;
}

const _clipPreloadPromise = (async () => {
  const manifest = await loadClipsManifest('./assets/models/clips.json?v=20261018k');
  if (manifest) setBeatWarpClipsManifest(manifest);
  _clipManifest = manifest;
  return attachClipsToRig(challengerRig, 'challenger', manifest);
})().catch((err) => {
  console.warn('[kronos] authored clips unavailable; Challenger falls back to the pose blender', err);
  challengerRig.clipDriven = false;
  return 0;
});
let _clipManifest = null;
let _enemyClipPreloadPromise = null;
function preloadEnemyClips() {
  if (_enemyClipPreloadPromise) return _enemyClipPreloadPromise;
  _enemyClipPreloadPromise = _clipPreloadPromise.then((n) => {
    if (!n || !_clipManifest) return [];
    return Promise.all([
      attachClipsToRig(kronosRig, 'kronos', _clipManifest),
      ...bruisers.map((b) => attachClipsToRig(b.rig, 'bruiser', _clipManifest))
    ]);
  }).catch((err) => {
    console.warn('[kronos] enemy clips unavailable; enemies stay on the pose blender', err);
    return [];
  });
  return _enemyClipPreloadPromise;
}

const kronosRig = buildKronosBossModel();
kronosRig.root.position.set(0, 1.38, 1.25);
boomboxStage.soundRigGroup.add(kronosRig.root);

const challengerContactShadow = challengerRig.contactShadowDecal || createContactShadowDecal(1.25, 0.95, 0.50);
scene.add(challengerContactShadow);

const kronosContactShadow = kronosRig.contactShadowDecal || createContactShadowDecal(1.60, 1.20, 0.52);
if (!kronosRig.contactShadowDecal) scene.add(kronosContactShadow);
_bootTiming.afterHeroModels = performance.now();

function createEnemyOverheadBadge(title = 'BRUISER #1') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.84, 0.236),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  mesh.position.set(0, 2.18, 0);

  function update(hp, maxHp, state, labelOverride = null, attackType = null) {
    ctx.clearRect(0, 0, 256, 72);
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    const isWindup = state === 'windup' || state === 'striking' ||
                     state === 'windup_combo' || state === 'striking_combo' ||
                     state === 'windup_shockwave' || state === 'shockwave_active';
    const isStunned = state === 'stunned';
    const isCounterStun = state === 'counter_stun';
    const isGuard = state === 'guard';
    const isGuardBreak = state === 'guard_break';

    let bannerFill = 'rgba(14, 16, 26, 0.88)';
    let strokeColor = '#08080c';
    let textColor = '#ffffff';
    let headerTxt = labelOverride || title;

    if (isCounterStun) {
      bannerFill = 'rgba(255, 208, 36, 0.98)';
      strokeColor = '#ff1e38';
      textColor = '#101018';
      headerTxt = labelOverride || '★ COUNTER-STUN PUNISH! ★';
    } else if (isGuard) {
      bannerFill = 'rgba(0, 168, 204, 0.95)';
      strokeColor = '#00e5ff';
      headerTxt = labelOverride || '🛡️ DEFENSIVE GUARD 🛡️';
    } else if (isGuardBreak) {
      bannerFill = 'rgba(255, 140, 0, 0.95)';
      strokeColor = '#ffe042';
      textColor = '#101018';
      headerTxt = labelOverride || '💥 GUARD SHATTERED! 💥';
    } else if (isWindup) {
      if (attackType === 'quick_hook') {
        bannerFill = 'rgba(255, 170, 24, 0.96)';
        strokeColor = '#00e5ff';
        headerTxt = labelOverride || '! QUICK HOOK [A] !';
      } else if (attackType === 'bass_drop' || attackType === 'bass_shockwave' || (labelOverride && labelOverride.includes('BASS DROP'))) {
        bannerFill = 'rgba(255, 30, 56, 0.98)';
        strokeColor = '#ffe042';
        textColor = '#ffffff';
        headerTxt = labelOverride || '! BASS DROP [WEAVE BEAT 3] !';
      } else if (attackType === 'scratch_combo' || attackType === 'mic_drop_combo' || (labelOverride && labelOverride.includes('SCRATCH'))) {
        bannerFill = 'rgba(0, 212, 245, 0.98)';
        strokeColor = '#ffe042';
        textColor = '#0a0c14';
        headerTxt = labelOverride || '! SCRATCH COMBO [WEAVE 3RD] !';
      } else {
        bannerFill = 'rgba(225, 24, 48, 0.96)';
        strokeColor = '#ffe042';
        headerTxt = labelOverride || '! DODGE [A] / COUNTER !';
      }
    } else if (isStunned) {
      bannerFill = 'rgba(255, 208, 36, 0.95)';
      strokeColor = '#ffe042';
      textColor = '#101018';
      headerTxt = labelOverride || '★ STUNNED! STRIKE NOW!';
    }

    ctx.fillStyle = bannerFill;
    ctx.fillRect(14, 4, 228, 30);
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(14, 4, 228, 30);

    ctx.font = '900 16px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = textColor;
    ctx.fillText(headerTxt, 128, 25);

    ctx.fillStyle = '#0c0d14';
    ctx.fillRect(24, 40, 208, 20);
    ctx.fillStyle = isGuard ? '#00e5ff' : (isWindup ? '#ff2a48' : (ratio > 0.5 ? '#36e86c' : (ratio > 0.25 ? '#ffc424' : '#ff2a3c')));
    ctx.fillRect(27, 43, Math.round(202 * ratio), 14);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(24, 40, 208, 20);

    tex.needsUpdate = true;
  }

  update(100, 100, 'stalking');
  return { mesh, update };
}

const bruisers = [0, 1, 2].map((idx) => {
  const bObj = buildBruiserModel(idx % 2);
  const badge = createEnemyOverheadBadge(`HYPE BRUISER #${idx + 1}`);
  bObj.rig.root.add(badge.mesh);

  const teleGeo = new THREE.RingGeometry(0.42, 0.56, 28);
  teleGeo.rotateX(-Math.PI / 2);
  const teleMat = new THREE.MeshBasicMaterial({
    color: 0xff1e38,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  });
  const teleRing = new THREE.Mesh(teleGeo, teleMat);
  teleRing.position.y = 0.03;
  bObj.rig.root.add(teleRing);

  const contactShadow = (bObj.rig && bObj.rig.contactShadowDecal) || createContactShadowDecal(1.20, 0.90, 0.50);
  scene.add(contactShadow);
  scene.add(bObj.rig.root);

  return {
    idx,
    isBoss: false,
    ...bObj,
    badge,
    teleRing,
    teleMat,
    contactShadow,
    active: idx < 2,
    hp: 100,
    maxHp: 100,
    state: 'stalking',
    stateTimer: 0,
    windupTotalDur: KRONOS_BEAT_SEC,
    targetStrikeBeat: -1,
    attackType: idx % 2 === 0 ? 'quick_hook' : 'heavy_haymaker',
    isGuarding: false,
    slotIndex: idx === 0 ? 5 : (idx === 1 ? 1 : 0),
    guardCooldown: 3.0 + idx * 1.5,
    attackCooldown: 1.4 + idx * 1.35,
    angle: idx === 0 ? -0.48 : (idx === 1 ? 0.58 : 0.05),
    orbitRadius: idx === 0 ? 1.75 : (idx === 1 ? 1.95 : 1.85),
    strafeDir: idx % 2 === 0 ? 1 : -1,
    flying: null
  };
});

const kronosRingBadge = createEnemyOverheadBadge('★ BOSS DJ KRONOS ★');
kronosRingBadge.mesh.position.set(0, 2.15, 0);
kronosRingBadge.mesh.visible = false;
kronosRig.root.add(kronosRingBadge.mesh);

const kronosTeleGeo = new THREE.RingGeometry(0.55, 0.72, 32);
kronosTeleGeo.rotateX(-Math.PI / 2);
const kronosTeleMat = new THREE.MeshBasicMaterial({
  color: 0xff1e38,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.0,
  depthWrite: false
});
const kronosTeleRing = new THREE.Mesh(kronosTeleGeo, kronosTeleMat);
kronosTeleRing.position.y = 0.032;
kronosRig.root.add(kronosTeleRing);
kronosRig.teleRing = kronosTeleRing;
kronosRig.teleMat = kronosTeleMat;

// Deferred Instanced Crowd Spectators (built after first paint so boot is fast and draw calls stay minimal)
const crowdSpectators = [];
let instancedCrowdHandle = null;
const crowdTops = [0xc26a2b, 0x9e3328, 0x4a5d3f, 0x3b4d66, 0xd49b35, 0x22242a, 0xe8e2d4];
const crowdPants = [0x22242a, 0x2d3a4d, 0x283226, 0x342a22];
const crowdSkins = [0xd89c74, 0x8d5534, 0xe0b088, 0x5c3826, 0xf0c8a0];
const crowdAngles = [-1.36, -1.22, -1.08, -0.94, -0.80, -0.66, -0.54, 1.04, 1.16, 1.28, 1.40];

function buildDeferredInstancedCrowd() {
  if (instancedCrowdHandle) return;
  const activeAngles = IS_LOW_TIER ? crowdAngles.filter((_, idx) => idx % 2 === 0) : crowdAngles;
  const configs = activeAngles.map((ang, i) => {
    const isWest = ang < -0.4;
    const r = isWest ? (7.35 + (i % 2) * 0.22) : (7.55 + (i % 2) * 0.45);
    const x = Math.sin(ang) * r;
    const z = -Math.cos(ang) * r + 0.5;
    const rotY = Math.atan2(-x, 1.68 - z);
    const phaseOffset = i * 0.65;
    const animMode = i % 5;
    // Lightweight proxy for debug inspection if needed
    crowdSpectators.push({
      spec: {
        root: { position: new THREE.Vector3(x, 0, z), scale: new THREE.Vector3(0.86, 0.86, 0.86) },
        hips: { position: { x: 0, y: 1.04, z: 0 } },
        torso: { rotation: new THREE.Euler() },
        headGroup: { rotation: new THREE.Euler() },
        leftArm: { rotation: new THREE.Euler() },
        rightArm: { rotation: new THREE.Euler() },
        leftElbow: { rotation: new THREE.Euler() },
        rightElbow: { rotation: new THREE.Euler() }
      },
      phaseOffset,
      animMode
    });
    return {
      x, y: 0, z,
      rotY,
      scale: 0.86,
      phaseOffset,
      animMode,
      topColor: crowdTops[i % crowdTops.length],
      pantsColor: crowdPants[i % crowdPants.length],
      skinColor: crowdSkins[i % crowdSkins.length]
    };
  });
  instancedCrowdHandle = buildInstancedArenaCrowd(scene, configs);
  _bootTiming.afterCrowd = performance.now();
}

const impactBurstPool = new ImpactBurstPool(scene, 6);
const smearArcPool = new SmearArcPool(scene, 6);

// ============================================================================
// 5. RHYTHM-ACTION GAME STATE, ACCURACY RANKING & ACTIVE-PHASE COMBAT
// ============================================================================
const gameState = {
  gameStarted: false,
  isPaused: false,
  isGameOver: false,
  runStartTimeMs: 0,
  runElapsedSec: 0,

  basePos: new THREE.Vector3(-0.46, 0, 1.68),
  playerPos: new THREE.Vector3(-0.46, 0, 1.68),
  playerTarget: new THREE.Vector3(-0.46, 0, 1.68),
  pose: 'idle',
  poseTimer: 0,
  hitStopTimer: 0,
  dodgeInvulnTimer: 0,
  lastDodgeTime: -10.0,
  counterBonusTimer: 0,
  combatEngagementTimer: 0,

  combo: 0,
  maxCombo: 0,
  comboDecayTimer: 0,
  confirmedHits: 0,
  perfectHits: 0,
  onBeatHits: 0,
  missedPresses: 0,
  styleRank: '—',
  styleDamageMultiplier: 1.0,
  styleRankMultiplier: 1.0,
  hype: 0.0,
  combatIdleTimer: 0,
  lastFinisher: null,
  guardBreakActive: false,

  playerHp: 100,
  maxPlayerHp: 100,
  crewHp: 100,
  bossHp: 100,
  wave: 1,
  maxWaves: 3,

  kronosInRing: false,
  kronosRingPos: new THREE.Vector3(0.45, 0, 0.15),
  kronosRingState: 'idle',
  kronosStateTimer: 0,
  kronosAttackCooldown: 2.2,
  bossAttackPattern: 'idle',
  bossComboStep: 0,
  bossShockwave: null,
  bossShockwaveActive: false,
  bossCounterStunActive: false,
  bossPatternCycle: 0,
  shockwaveDodged: false,
  totalKoz: 0,

  cameraKick: 0,
  cameraDutch: 0,
  punchStep: 0,
  lastPunchTime: 0,
  activeSmears: [],

  isAttacking: false,
  attackType: null,
  attackPhase: 'idle',
  attackTimer: 0,
  recoveryTimer: 0,
  canCancel: false,
  pendingHit: null,
  inputBuffer: null,
  cancelHistory: [],
  lastCancel: null,
  lastCancelLatency: 0,
  phaseDurations: { startup: 0.065, active: 0.060, recovery: 0.160, total: 0.285 },

  lastHit: null,
  hitHistory: [],
  impactBeatOffsetsMs: [],
  impactTargetOffsetsMs: [],
  wallSlamCount: 0,
  takedownTokens: 0,
  feverMeter: 0,
  feverRushTimer: 0,
  feverActivations: 0,
  perfectCounters: 0,
  imperfectCounters: 0,
  counterAttempts: 0,
  finishers: 0,
  takedowns: 0,
  lastCounterTime: -10,
  directorScheduled: [],
  sectionId: null,
  sectionName: '',
  sectionBarIndex: 0,
  sectionLog: [],
  sectionBudgetLeft: 0,
  sectionBudgetTotal: 0,
  sectionCleared: false,
  respawnTimer: 0,
  spawnSeq: 0,
  bossPhase: 0,
  finisherSeq: null,
  endReason: '',
  enemyStrikeEvents: [],
  playerHitStunTimer: 0,
  attackStartPose: null,
  activeImpactVFX: [],
  lastContactPoint: null,
  priorityTargetCache: null
};

const elPlayerHpFill = document.getElementById('player-hp-fill');
const elPlayerHpPips = document.getElementById('challenger-hp-pips');
const elBossHpFill = document.getElementById('boss-hp-fill');
const elKronosHpText = document.getElementById('kronos-hp-text');
const elWaveStatusPill = document.getElementById('wave-status-pill');
const elDamageFlash = document.getElementById('damage-flash');
const elHitsNumber = document.getElementById('hits-number');
const elRankWord = document.getElementById('rank-word');
const elKrakoomBurst = document.getElementById('krakoom-burst');
const elKrakoomMain = document.getElementById('krakoom-text-main');
const elKrakoomShadow = document.getElementById('krakoom-text-shadow');
const elLyricSection = document.getElementById('lyric-section');
const elLyricLine = document.getElementById('lyric-line');
const elTempoReadout = document.getElementById('tempo-readout');

const btnPlay = document.getElementById('btn-play');
const btnA = document.getElementById('btn-a');
const btnS = document.getElementById('btn-s');
const btnD = document.getElementById('btn-d');
const btnF = document.getElementById('btn-f');

function computeAccuracyRank() {
  const hasHistory = Array.isArray(gameState.hitHistory) && gameState.hitHistory.length > 0;
  const confirmedCount = hasHistory
    ? gameState.hitHistory.filter((h) => h && h.confirmed !== false).length
    : gameState.confirmedHits;
  const perfectCount = hasHistory
    ? gameState.hitHistory.filter((h) => h && h.confirmed !== false && h.grade === 'PERFECT').length
    : gameState.perfectHits;

  if (confirmedCount <= 0) {
    return { rank: '—', shortRank: '—', mult: 1.0, perfectPct: 0, confirmedCount: 0, perfectCount: 0 };
  }
  const perfectPct = (perfectCount / Math.max(1, confirmedCount)) * 100;
  if (perfectPct >= 75 && confirmedCount >= 5) {
    return { rank: 'S-RANK', shortRank: 'S', mult: 1.8, perfectPct, confirmedCount, perfectCount };
  }
  if (perfectPct >= 55 && confirmedCount >= 3) {
    return { rank: 'A-RANK', shortRank: 'A', mult: 1.5, perfectPct, confirmedCount, perfectCount };
  }
  if (perfectPct >= 35 && confirmedCount >= 2) {
    return { rank: 'B-RANK', shortRank: 'B', mult: 1.25, perfectPct, confirmedCount, perfectCount };
  }
  if (perfectPct >= 15 || confirmedCount >= 1) {
    return { rank: 'C-RANK', shortRank: 'C', mult: 1.1, perfectPct, confirmedCount, perfectCount };
  }
  return { rank: 'D-RANK', shortRank: 'D', mult: 1.0, perfectPct, confirmedCount, perfectCount };
}

function updateStyleRankAndHype(dt = 0) {
  if (dt > 0 && gameState.combo > 0) {
    gameState.comboDecayTimer = Math.max(0, (gameState.comboDecayTimer || 0) - dt);
    if (gameState.comboDecayTimer <= 0) {
      gameState.combo = 0;
    }
  }

  const acc = computeAccuracyRank();
  gameState.styleRank = acc.rank;
  gameState.styleDamageMultiplier = acc.mult;
  gameState.styleRankMultiplier = acc.mult;

  if (dt > 0) {
    gameState.combatIdleTimer = (gameState.combatIdleTimer || 0) + dt;
    if (gameState.combatIdleTimer > 2.0 && gameState.hype > 0.0) {
      gameState.hype = Math.max(0.0, gameState.hype - dt * 3.5);
    }
  }
}

function findNearestChartBeat(songTime, chart) {
  const activeChart = chart || audioEngine.getActiveChart();
  const beatSec = (activeChart && activeChart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (activeChart && activeChart.firstBeatOffset !== undefined) ? activeChart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;

  const beatFloat = (songTime - firstOffset) / beatSec;
  const gridBeatIdx = Math.round(beatFloat);
  let nearestBeatTime = firstOffset + gridBeatIdx * beatSec;
  let minAbsDelta = Math.abs(songTime - nearestBeatTime);
  let nextBeatTime = firstOffset + Math.ceil(beatFloat) * beatSec;
  if (nextBeatTime <= songTime + 1e-4) {
    nextBeatTime += beatSec;
  }

  if (activeChart && !activeChart.moduloOnly && Array.isArray(activeChart.beatTimes) && activeChart.beatTimes.length > 0) {
    let bestFuture = Infinity;
    for (let i = 0; i < activeChart.beatTimes.length; i++) {
      const bt = activeChart.beatTimes[i];
      const d = Math.abs(songTime - bt);
      if (d < minAbsDelta) {
        minAbsDelta = d;
        nearestBeatTime = bt;
      }
      if (bt > songTime + 1e-4 && bt < bestFuture) {
        bestFuture = bt;
      }
    }
    if (bestFuture < Infinity) {
      nextBeatTime = bestFuture;
    }
  }

  const signedDelta = songTime - nearestBeatTime;
  const timeUntilBeat = signedDelta < -1e-4 ? -signedDelta : Math.max(0.012, nextBeatTime - songTime);
  return {
    nearestBeatTime,
    nextBeatTime,
    signedDelta,
    absDelta: minAbsDelta,
    timeUntilBeat
  };
}

/**
 * First grid line (chart beat or beat midpoint when div <= 0.5) at or after `minSongTime`.
 * Uses the chart's transient-snapped beat times when present so warped impacts land on the
 * audible beat, not on an idealised BPM grid.
 */
function findNextChartSubdivision(minSongTime, chart, div = 0.5) {
  const activeChart = chart || audioEngine.getActiveChart();
  const beatSec = (activeChart && activeChart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (activeChart && activeChart.firstBeatOffset !== undefined) ? activeChart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  const subSec = Math.max(0.05, beatSec * div);

  if (activeChart && !activeChart.moduloOnly && Array.isArray(activeChart.beatTimes) && activeChart.beatTimes.length > 0) {
    const bts = activeChart.beatTimes;
    for (let i = 0; i < bts.length; i++) {
      const bt = bts[i];
      if (bt >= minSongTime - 1e-4) return bt;
      if (div <= 0.5 && i + 1 < bts.length) {
        const mid = 0.5 * (bt + bts[i + 1]);
        if (mid >= minSongTime - 1e-4) return mid;
      }
    }
  }
  const subFloat = (minSongTime - firstOffset) / subSec;
  return firstOffset + Math.ceil(subFloat - 1e-4) * subSec;
}

function findNearestChartSubdivision(songTime, chart, div = 0.5) {
  const activeChart = chart || audioEngine.getActiveChart();
  const beatSec = (activeChart && activeChart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (activeChart && activeChart.firstBeatOffset !== undefined) ? activeChart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  const subSec = Math.max(0.05, beatSec * div);
  let best = firstOffset + Math.round((songTime - firstOffset) / subSec) * subSec;
  let bestD = Math.abs(songTime - best);
  if (activeChart && !activeChart.moduloOnly && Array.isArray(activeChart.beatTimes) && activeChart.beatTimes.length > 0) {
    const bts = activeChart.beatTimes;
    for (let i = 0; i < bts.length; i++) {
      const cands = [bts[i]];
      if (div <= 0.5 && i + 1 < bts.length) cands.push(0.5 * (bts[i] + bts[i + 1]));
      for (const c of cands) {
        const d = Math.abs(songTime - c);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
  }
  return best;
}

// Clock facade handed to BeatWarp so its targets follow the chart's real beats.
const beatWarpClock = {
  now: () => audioEngine.getSongTime(),
  nextSubdivision: (t, div = 0.5, chart = undefined) => findNextChartSubdivision(t, chart || audioEngine.getActiveChart(), div),
  nearestSubdivision: (t, div = 0.5, chart = undefined) => findNearestChartSubdivision(t, chart || audioEngine.getActiveChart(), div),
  scheduleSfx: (name, t, opts) => clockScheduleSfx(name, t, opts)
};

const MOVE_CLIP_NAMES = Object.freeze({
  'punch-jab': 'jab',
  'punch-cross': 'cross',
  'punch-uppercut': 'uppercut',
  'kick': 'kick',
  'finisher': 'uppercut'
});

/** Combat timers run on song time when the track is playing so cooldowns and strings follow the music. */
function combatClockSec() {
  const st = audioEngine.getSongTime();
  return (st !== null && st !== undefined) ? st : performance.now() * 0.001;
}

/** True while a cooldown is still running; a clock that went backwards (loop, pause, restart) counts as expired. */
function cooldownActive(lastT, nowT, cooldownSec) {
  return Number.isFinite(lastT) && nowT >= lastT && (nowT - lastT) < cooldownSec;
}

function predictHitStopSec(action, punchStep, grade) {
  if (grade === 'MISS') return 0.024;
  const perfect = grade === 'PERFECT';
  const H = TUNING.HIT_STOP;
  if (action === 'kick') return perfect ? H.KICK_PERFECT : H.KICK_GOOD;
  if (punchStep === 1) return perfect ? H.CROSS_PERFECT : H.CROSS_GOOD;
  if (punchStep === 2) return perfect ? H.UPPERCUT_PERFECT : H.UPPERCUT_GOOD;
  return perfect ? H.JAB_PERFECT : H.JAB_GOOD;
}

function evaluateBeatWindow(songTime) {
  const chart = audioEngine.getActiveChart();

  // No grading in silence unless explicitly forced by debug test harness
  if (songTime === null || songTime === undefined) {
    if (IS_DEBUG_MODE && window.__kronosForceBeatGrade) {
      return window.__kronosForceBeatGrade;
    }
    return {
      grade: 'SILENT',
      label: 'PRESS PLAY!',
      color: '#8899aa',
      mult: 1.0,
      onBeat: false,
      delta: Infinity,
      signedDelta: 0,
      timeUntilBeat: 0.065,
      nearestBeatTime: null,
      targetBeatTime: null
    };
  }

  const info = findNearestChartBeat(songTime, chart);
  const delta = info.absDelta;
  const signedDelta = info.signedDelta;
  const timeUntilBeat = info.timeUntilBeat;
  const nearestBeatTime = info.nearestBeatTime;

  if (delta <= TUNING.PERFECT_WINDOW_SEC) {
    return {
      grade: 'PERFECT',
      label: 'PERFECT!',
      color: '#ffe042',
      mult: 1.5,
      onBeat: true,
      delta,
      signedDelta,
      timeUntilBeat,
      nearestBeatTime,
      targetBeatTime: nearestBeatTime
    };
  }
  if (delta <= TUNING.ON_BEAT_WINDOW_SEC) {
    return {
      grade: 'GOOD',
      label: 'ON BEAT!',
      color: '#42f56c',
      mult: 1.15,
      onBeat: true,
      delta,
      signedDelta,
      timeUntilBeat,
      nearestBeatTime,
      targetBeatTime: nearestBeatTime
    };
  }
  return {
    grade: 'MISS',
    label: 'OFF-BEAT',
    color: '#ff385c',
    mult: 1.0,
    onBeat: false,
    delta,
    signedDelta,
    timeUntilBeat,
    nearestBeatTime,
    targetBeatTime: info.nextBeatTime
  };
}

let starburstTimer = null;
function setStarburstText(word, scale = 1.14) {
  if (!elKrakoomMain || !elKrakoomShadow || !elKrakoomBurst) return;
  elKrakoomMain.textContent = word;
  elKrakoomShadow.textContent = word;
  elKrakoomBurst.style.opacity = '1';
  const rot = reducedMotionEnabled ? 0 : (Math.random() - 0.5) * 6;
  elKrakoomBurst.style.transform = `scale(${scale}) rotate(${rot}deg)`;
  if (starburstTimer) clearTimeout(starburstTimer);
  starburstTimer = setTimeout(() => {
    elKrakoomBurst.style.opacity = '0';
    elKrakoomBurst.style.transform = 'scale(0.4) rotate(0deg)';
  }, 450);
}

let damageFlashTimer = null;
let lastDamageSfxTime = 0;
function triggerDamageFlash() {
  gameState.hype = Math.max(0.0, (gameState.hype || 0) - 20.0);
  const now = performance.now();
  if (now - lastDamageSfxTime > 120) {
    audioEngine.playCombatSfx('player-damaged');
    lastDamageSfxTime = now;
  }
  if (!elDamageFlash || reducedMotionEnabled) return;
  elDamageFlash.style.opacity = '1';
  if (damageFlashTimer) clearTimeout(damageFlashTimer);
  damageFlashTimer = setTimeout(() => {
    elDamageFlash.style.opacity = '0';
  }, 220);
}

function getActiveBruiserCount() {
  return bruisers.filter((b) => b.active && b.state !== 'ko' && b.state !== 'flying').length;
}

function updateHudNumbers() {
  updateStyleRankAndHype(0);
  if (elHitsNumber) elHitsNumber.textContent = String(gameState.combo);
  if (elRankWord) {
    elRankWord.textContent = gameState.styleRank;
    const rankColors = {
      '—': '#8899aa',
      'D-RANK': '#8899aa',
      'C-RANK': '#24e5ff',
      'B-RANK': '#36e86c',
      'A-RANK': '#ffc424',
      'S-RANK': '#ff1e38'
    };
    elRankWord.style.color = rankColors[gameState.styleRank] || '#8899aa';
    elRankWord.style.textShadow = gameState.styleRank === 'S-RANK'
      ? '0 0 14px rgba(255, 30, 56, 0.8), 3px 3px 0 #000'
      : '3px 3px 0 #000';
  }
  const elHypeFill = document.getElementById('hype-fill');
  const elHypeVal = document.getElementById('hype-val-text');
  const feverPct = Math.max(0, Math.min(100, gameState.feverMeter || 0));
  if (elHypeFill) elHypeFill.style.width = `${gameState.feverRushTimer > 0 ? 100 : feverPct}%`;
  if (elHypeVal) elHypeVal.textContent = gameState.feverRushTimer > 0 ? 'RUSH!' : `${Math.round(feverPct)}%`;
  const elFeverBox = document.getElementById('hype-meter-container');
  if (elFeverBox) elFeverBox.classList.toggle('fever-rush', gameState.feverRushTimer > 0);
  for (let i = 0; i < 3; i++) {
    const sk = document.getElementById(`token-${i}`);
    if (sk) sk.classList.toggle('ready', (gameState.takedownTokens || 0) > i);
  }
  if (btnD) btnD.classList.toggle('token-ready', (gameState.takedownTokens || 0) >= 1);

  if (elPlayerHpFill) elPlayerHpFill.style.width = `${Math.max(0, Math.min(100, gameState.playerHp))}%`;
  if (elPlayerHpPips) {
    const filledPips = Math.ceil((gameState.playerHp / 100) * 6);
    const pips = elPlayerHpPips.querySelectorAll('.hp-pip');
    pips.forEach((pip, idx) => {
      pip.classList.toggle('empty', idx >= filledPips);
      pip.classList.toggle('yellow', idx === 0 && filledPips > 0);
    });
  }

  if (gameState.wave < 3) {
    // Waves 1 & 2 display CREW / STAGE meter separately from Boss HP
    let totalCrewHp = 0;
    let totalCrewMax = 0;
    bruisers.forEach((b) => {
      if (b.maxHp > 0 && (b.active || b.state === 'ko' || b.state === 'flying')) {
        totalCrewHp += Math.max(0, b.hp);
        totalCrewMax += b.maxHp;
      }
    });
    let crewPct = totalCrewMax > 0 ? Math.round((totalCrewHp / totalCrewMax) * 100) : 100;
    let crewText = `CREW: ${crewPct}%`;
    if (SONG_ENCOUNTER && gameState.sectionBudgetTotal > 0) {
      const standing = bruisers.filter((b) => b.active && b.state !== 'ko' && b.state !== 'flying').length;
      const left = Math.max(0, gameState.sectionBudgetLeft) + standing;
      crewPct = Math.round((left / gameState.sectionBudgetTotal) * 100);
      crewText = `CREW: ${left}/${gameState.sectionBudgetTotal}`;
    }
    gameState.crewHp = crewPct;
    if (elBossHpFill) elBossHpFill.style.width = `${Math.max(0, Math.min(100, crewPct))}%`;
    if (elKronosHpText) elKronosHpText.textContent = crewText;
  } else {
    if (elBossHpFill) elBossHpFill.style.width = `${Math.max(0, Math.min(100, gameState.bossHp))}%`;
    if (elKronosHpText) elKronosHpText.textContent = `KRONOS: ${Math.round(gameState.bossHp)}%`;
  }

  if (elWaveStatusPill) {
    const activeCount = getActiveBruiserCount();
    if (SONG_ENCOUNTER && gameState.sectionName) {
      const chart = audioEngine.getActiveChart();
      const totalBars = chart && Array.isArray(chart.bars) ? chart.bars.length : 39;
      const barNo = Math.max(0, gameState.sectionBarIndex) + 1;
      const boss = gameState.kronosInRing ? ' · KRONOS' : '';
      const compact = (window.innerWidth || 1280) < 760;
      elWaveStatusPill.textContent = compact
        ? `${gameState.sectionName} · ${barNo}/${totalBars}${boss}`
        : `${gameState.sectionName} · BAR ${String(barNo).padStart(2, '0')}/${totalBars} · ${activeCount} IN RING${boss}`;
    } else if (SONG_ENCOUNTER && !gameState.gameStarted) {
      elWaveStatusPill.textContent = 'INTRO · BAR 01/39 · READY';
    } else if (gameState.wave === 1) {
      elWaveStatusPill.textContent = `WAVE 1/3 · CYPHER VANGUARD (${activeCount} ACTIVE)`;
    } else if (gameState.wave === 2) {
      elWaveStatusPill.textContent = `WAVE 2/3 · HEAVY HYPE-CREW (${activeCount} ACTIVE)`;
    } else {
      elWaveStatusPill.textContent = `WAVE 3/3 · BOSS DJ KRONOS IN THE RING!`;
    }
  }
}

function spawnWave(waveNum) {
  gameState.wave = waveNum;
  const waveCfg = TUNING.WAVES[waveNum] || TUNING.WAVES[1];
  if (waveNum === 1) {
    gameState.kronosRingState = 'idle';
    gameState.crewHp = 100;
    gameState.bossHp = 100;
    kronosTeleMat.opacity = 0;
    if (gameState.kronosInRing) {
      gameState.kronosInRing = false;
      boomboxStage.soundRigGroup.add(kronosRig.root);
      kronosRig.root.scale.setScalar(0.58);
      kronosRig.root.position.set(0, 1.38, 1.25);
      kronosRig.root.rotation.set(0, 0, 0);
      kronosRingBadge.mesh.visible = false;
    }
    const wave1Configs = [
      { active: true, angle: -0.52, radius: 1.75, hp: waveCfg.bruiserHp, cd: 1.4 },
      { active: true, angle: 0.62,  radius: 1.95, hp: waveCfg.bruiserHp, cd: 2.6 },
      { active: false, angle: 0.0,  radius: 3.50, hp: 0,                 cd: 99 }
    ];
    bruisers.forEach((b, idx) => {
      const cfg = wave1Configs[idx];
      b.active = cfg.active;
      b.hp = cfg.hp;
      b.maxHp = cfg.hp;
      b.state = cfg.active ? 'stalking' : 'ko';
      b.stateTimer = 0;
      b.attackType = idx === 0 ? 'quick_hook' : 'heavy_haymaker';
      b.isGuarding = false;
      b.slotIndex = idx === 0 ? 5 : (idx === 1 ? 1 : 3);
      b.guardCooldown = 99;
      b.attackCooldown = cfg.cd;
      b.angle = cfg.angle;
      b.orbitRadius = cfg.radius;
      b.flying = null;
      b.rig.root.visible = cfg.active;
      b.rig.root.rotation.set(0, 0, 0);
      b.teleMat.opacity = 0;
      if (cfg.active) {
        b.badge.update(b.hp, b.maxHp, b.state, `VANGUARD #${idx + 1}`);
        b.rig.root.position.set(
          gameState.basePos.x + Math.sin(cfg.angle) * cfg.radius,
          0,
          gameState.basePos.z - Math.cos(cfg.angle) * cfg.radius
        );
      } else {
        b.rig.root.position.set(-4.5, 0, -6.5);
      }
    });
  } else if (waveNum === 2) {
    setStarburstText('WAVE 2 // HEAVY CREW!', 1.18);
    floorDial.updateBadge('WAVE 2!', '#ffe042');
    gameState.crewHp = 100;
    kronosTeleMat.opacity = 0;
    const wave2Configs = [
      { active: true, angle: -0.78, radius: 1.85, hp: waveCfg.bruiserHp, cd: 1.1 },
      { active: true, angle: 0.04,  radius: 1.78, hp: waveCfg.bruiserHp, cd: 1.8 },
      { active: true, angle: 0.82,  radius: 2.00, hp: waveCfg.bruiserHp, cd: 2.7 }
    ];
    bruisers.forEach((b, idx) => {
      const cfg = wave2Configs[idx];
      b.active = true;
      b.hp = cfg.hp;
      b.maxHp = cfg.hp;
      b.state = 'stalking';
      b.stateTimer = 0;
      b.attackType = idx % 2 === 0 ? 'quick_hook' : 'heavy_haymaker';
      b.isGuarding = false;
      b.slotIndex = idx === 0 ? 5 : (idx === 1 ? 0 : 1);
      b.guardCooldown = 1.8 + idx * 1.4;
      b.attackCooldown = cfg.cd;
      b.angle = cfg.angle;
      b.orbitRadius = cfg.radius;
      b.flying = null;
      b.rig.root.visible = true;
      b.rig.root.rotation.set(0, 0, 0);
      b.teleMat.opacity = 0;
      b.badge.update(b.hp, b.maxHp, b.state, `HEAVY CREW #${idx + 1}`);
      b.rig.root.position.set(
        gameState.basePos.x + Math.sin(cfg.angle) * (cfg.radius + 1.0),
        0,
        gameState.basePos.z - Math.cos(cfg.angle) * (cfg.radius + 1.0)
      );
    });
  } else if (waveNum === 3) {
    // BOSS DJ KRONOS ENTERS WAVE 3 AT FULL 100% HP!
    setStarburstText('BOSS SHOWDOWN!', 1.22);
    floorDial.updateBadge('KRONOS IN RING!', '#ff2a3c');
    gameState.bossHp = 100;
    gameState.kronosInRing = true;
    gameState.kronosRingState = 'stalking';
    gameState.kronosStateTimer = 0;
    gameState.kronosAttackCooldown = 0.25;
    gameState.kronosRingPos.set(0.32, 0, 0.05);
    gameState.bossAttackPattern = 'idle';
    gameState.bossComboStep = 0;
    gameState.bossCounterStunActive = false;
    const curSongTime = audioEngine.getSongTime();
    const activeChart = audioEngine.getActiveChart();
    const bSec = (activeChart && activeChart.beatSec) || KRONOS_BEAT_SEC;
    const fOff = (activeChart && activeChart.firstBeatOffset !== undefined) ? activeChart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
    gameState.wave3StartBeatFloat = curSongTime !== null ? Math.max(0, (curSongTime - fOff) / bSec) : undefined;
    gameState.wave3BeatFloat = 0;
    gameState.wave3LastBassDropBar = -1;
    gameState.wave3LastScratchBar = -1;
    gameState.shockwavePreWeaved = false;
    gameState.bossStepWeaved = false;
    gameState.wave3BeatWeaveTimer = 0;
    kronosTeleMat.opacity = 0;
    if (gameState.bossShockwave && gameState.bossShockwave.mesh) {
      scene.remove(gameState.bossShockwave.mesh);
      gameState.bossShockwave.mesh.geometry.dispose();
      gameState.bossShockwave.mesh.material.dispose();
    }
    gameState.bossShockwave = null;
    gameState.bossShockwaveActive = false;

    scene.add(kronosRig.root);
    kronosRig.root.scale.setScalar(0.98);
    kronosRig.root.position.copy(gameState.kronosRingPos);
    kronosRingBadge.mesh.visible = true;
    kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');

    bruisers.forEach((b, idx) => {
      if (idx === 0) {
        b.active = true;
        b.hp = waveCfg.bruiserHp;
        b.maxHp = waveCfg.bruiserHp;
        b.state = 'stalking';
        b.stateTimer = 0;
        b.attackType = 'heavy_haymaker';
        b.isGuarding = false;
        b.slotIndex = 4;
        b.guardCooldown = 99;
        b.attackCooldown = 1.6;
        b.angle = -0.72;
        b.orbitRadius = 2.00;
        b.flying = null;
        b.rig.root.visible = true;
        b.rig.root.rotation.set(0, 0, 0);
        b.teleMat.opacity = 0;
        b.badge.update(b.hp, b.maxHp, b.state, 'ROYAL GUARD');
        b.rig.root.position.set(-2.1, 0, 0.25);
      } else {
        b.active = false;
        b.hp = 0;
        b.maxHp = 0;
        b.state = 'ko';
        b.isGuarding = false;
        b.flying = null;
        b.rig.root.visible = false;
        b.rig.root.position.set(-5.0, 0, -6.5);
      }
    });
  }
  updateHudNumbers();
}

function launchBruiserIntoStage(b) {
  if (!b || b.state === 'flying' || (b.state === 'ko' && !b.active)) return;
  b.state = 'flying';
  b.teleMat.opacity = 0;
  b.badge.update(0, b.maxHp, 'ko', 'SPEAKERBOX K.O.!');
  if (b.rig && b.rig.clipDriven && b.rig.playClip) {
    b.rig.playClip('KO-fall', { fadeInSec: 0.05, loop: false });
  } else if (b.blender) {
    b.blender.setTarget({
      torso: [-0.35, 0, 0],
      headGroup: [-0.2, 0, 0],
      leftArm: [-1.2, 0, -0.5],
      rightArm: [-1.2, 0, 0.5],
      leftElbow: [-0.4, 0, 0],
      rightElbow: [-0.4, 0, 0],
      leftLeg: [0.3, 0, -0.15],
      rightLeg: [0.3, 0, 0.15],
      leftKnee: [0.1, 0, 0],
      rightKnee: [0.1, 0, 0]
    });
  }
  const startPos = b.rig.root.position.clone();
  const targetPos = new THREE.Vector3(2.1 + (Math.random() - 0.5) * 1.4, 2.5, -4.8);
  b.flying = { t: 0, duration: 0.68, startPos, targetPos };
  gameState.totalKoz += 1;
  setStarburstText('SPEAKERBOX K.O.!', 1.25);
}

function findBestCombatTarget(maxAcquireDist = TUNING.AUTO_AIM_MAX_DIST) {
  let bestTarget = null;
  let bestScore = Infinity;

  bruisers.forEach((b) => {
    if (!b.active || b.state === 'ko' || b.state === 'flying') return;
    const d = gameState.playerPos.distanceTo(b.rig.root.position);
    if (d > maxAcquireDist) return;
    const priorityBonus = (b.state === 'windup' || b.state === 'striking') ? -2.0
      : ((b.state === 'stunned' || b.state === 'guard_break' || b.state === 'dazed' || b.state === 'wall_slam' || b.state === 'launch') ? -1.0 : (b.state === 'guard' ? -0.5 : 0));
    const score = d + priorityBonus;
    if (score < bestScore) {
      bestScore = score;
      bestTarget = { type: 'bruiser', obj: b, pos: b.rig.root.position, dist: d };
    }
  });

  if (gameState.kronosInRing && gameState.kronosRingState !== 'ko') {
    const kd = gameState.playerPos.distanceTo(kronosRig.root.position);
    const kMaxDist = (gameState.wave === 3) ? Math.max(maxAcquireDist, 2.25) : maxAcquireDist;
    if (kd <= kMaxDist) {
      const isAttacking = gameState.kronosRingState === 'windup' || gameState.kronosRingState === 'striking' ||
                          gameState.kronosRingState === 'windup_combo' || gameState.kronosRingState === 'striking_combo' ||
                          gameState.kronosRingState === 'windup_shockwave' || gameState.kronosRingState === 'shockwave_active';
      const isVulnerable = gameState.kronosRingState === 'counter_stun' || gameState.kronosRingState === 'stunned';
      const kPriority = isAttacking ? -2.5 : (isVulnerable ? -3.0 : (gameState.wave === 3 ? -1.8 : -0.4));
      const score = kd + kPriority;
      if (score < bestScore || !bestTarget) {
        bestScore = score;
        bestTarget = { type: 'kronos', obj: kronosRig, pos: kronosRig.root.position, dist: kd };
      }
    }
  }

  return bestTarget;
}

function isEnemyWithinStrikingRange(maxDist = TUNING.ACTIVE_HIT_MAX_DIST) {
  for (let i = 0; i < bruisers.length; i++) {
    const b = bruisers[i];
    if (b.active && b.state !== 'ko' && b.state !== 'flying') {
      if (gameState.playerPos.distanceTo(b.rig.root.position) <= maxDist) return true;
    }
  }
  if (gameState.kronosInRing && gameState.kronosRingState !== 'ko') {
    if (gameState.playerPos.distanceTo(kronosRig.root.position) <= maxDist) return true;
  }
  return false;
}

function getAttackingLimbWorldPos(action, punchStep) {
  const v = new THREE.Vector3();
  if (action === 'kick') {
    if (challengerRig.rightAnkle) challengerRig.rightAnkle.getWorldPosition(v);
    else if (challengerRig.rightLeg) challengerRig.rightLeg.getWorldPosition(v);
  } else if (punchStep === 0) {
    if (challengerRig.leftHand) challengerRig.leftHand.getWorldPosition(v);
    else if (challengerRig.leftArm) challengerRig.leftArm.getWorldPosition(v);
  } else {
    if (challengerRig.rightHand) challengerRig.rightHand.getWorldPosition(v);
    else if (challengerRig.rightArm) challengerRig.rightArm.getWorldPosition(v);
  }
  return v;
}

function calculateContactPoint(targetObj, limbPos, action, punchStep) {
  const targetPos = new THREE.Vector3();
  if (targetObj && targetObj.rig && targetObj.rig.torso) {
    targetObj.rig.torso.getWorldPosition(targetPos);
  } else if (targetObj && targetObj.rig && targetObj.rig.root) {
    targetObj.rig.root.getWorldPosition(targetPos);
    targetPos.y += 1.30;
  } else if (targetObj && targetObj.root) {
    targetObj.root.getWorldPosition(targetPos);
    targetPos.y += 1.30;
  } else {
    targetPos.copy(gameState.playerPos);
    targetPos.y = 1.30;
    targetPos.z -= 1.0;
  }

  const contact = limbPos.clone().lerp(targetPos, 0.65);
  if (action === 'kick') contact.y = 1.42;
  else if (punchStep === 0) contact.y = 1.34;
  else if (punchStep === 1) contact.y = 1.32;
  else if (punchStep === 2) contact.y = 1.40;
  contact.y = THREE.MathUtils.clamp(contact.y, 0.9, 1.7);
  return contact;
}

function updateCameraJuiceState() {
  if (reducedMotionEnabled) {
    cameraJuice.trauma = 0;
    cameraJuice.fovDip = 0;
    cameraJuice.dutchRoll = 0;
    cameraJuice.punchTime = 0;
    if (camera) {
      camera.fov = 45.0;
      camera.updateProjectionMatrix();
    }
    return;
  }
  const now = performance.now() * 0.001;
  if (cameraJuice.punchTime > 0) {
    const age = now - cameraJuice.punchTime;
    const peakHold = 0.12;
    const totalDuration = 0.32;
    const decayDuration = 0.20;
    const peakFov = cameraJuice.baseFovDip !== undefined ? cameraJuice.baseFovDip : 3.5;

    if (age < peakHold) {
      cameraJuice.fovDip = peakFov;
      cameraJuice.dutchRoll = cameraJuice.baseDutchRoll;
    } else if (age < totalDuration) {
      const t = (age - peakHold) / decayDuration;
      cameraJuice.fovDip = peakFov * (1.0 - t);
      cameraJuice.dutchRoll = cameraJuice.baseDutchRoll * (1.0 - t);
    } else {
      cameraJuice.fovDip = 0.0;
      cameraJuice.dutchRoll = 0.0;
      cameraJuice.punchTime = 0;
    }
  }
  if (camera) {
    camera.fov = 45.0 - cameraJuice.fovDip;
    camera.updateProjectionMatrix();
  }
}

function triggerCameraJuice(action, isPerfect, punchStep) {
  if (reducedMotionEnabled) return;
  const mult = isPerfect ? 1.4 : 1.0;
  cameraJuice.punchTime = performance.now() * 0.001;
  cameraJuice.baseFovDip = (isPerfect && action !== 'dodge') ? 3.5 : 0.0;
  cameraJuice.fovDip = cameraJuice.baseFovDip;

  if (action === 'kick') {
    cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.60 * mult);
    cameraJuice.baseDutchRoll = 0.0384 * mult;
    cameraJuice.dutchRoll = cameraJuice.baseDutchRoll;
  } else if (action === 'punch') {
    if (punchStep === 0) {
      cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.30 * mult);
      cameraJuice.baseDutchRoll = 0.0175 * mult;
      cameraJuice.dutchRoll = cameraJuice.baseDutchRoll;
    } else if (punchStep === 1) {
      cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.38 * mult);
      cameraJuice.baseDutchRoll = -0.0314 * mult;
      cameraJuice.dutchRoll = cameraJuice.baseDutchRoll;
    } else {
      cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.45 * mult);
      cameraJuice.baseDutchRoll = 0.0209 * mult;
      cameraJuice.dutchRoll = cameraJuice.baseDutchRoll;
    }
  } else if (action === 'dodge') {
    cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.20);
    cameraJuice.baseDutchRoll = -0.0436;
    cameraJuice.dutchRoll = cameraJuice.baseDutchRoll;
  }
  if (camera) {
    camera.fov = 45.0 - cameraJuice.fovDip;
    camera.updateProjectionMatrix();
  }
}

function formatClearTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function triggerGameEnd(isVictory) {
  if (gameState.isGameOver) return;
  gameState.isGameOver = true;
  let historySpanSec = 0;
  if (Array.isArray(gameState.hitHistory) && gameState.hitHistory.length >= 2) {
    const firstHit = gameState.hitHistory[0];
    const lastHit = gameState.hitHistory[gameState.hitHistory.length - 1];
    if (typeof firstHit.songTime === 'number' && typeof lastHit.songTime === 'number' && lastHit.songTime > firstHit.songTime) {
      historySpanSec = lastHit.songTime - firstHit.songTime;
    } else if (typeof firstHit.timestamp === 'number' && typeof lastHit.timestamp === 'number' && lastHit.timestamp > firstHit.timestamp) {
      historySpanSec = (lastHit.timestamp - firstHit.timestamp) * 0.001;
    }
  }
  const wallElapsedSec = (typeof gameState.runStartTimeMs === 'number')
    ? Math.max(0, (performance.now() - gameState.runStartTimeMs) * 0.001)
    : 0;
  gameState.runElapsedSec = historySpanSec > 0 ? Math.max(historySpanSec, wallElapsedSec) : wallElapsedSec;
  audioEngine.pause();
  if (btnPlay) {
    btnPlay.classList.remove('playing');
    btnPlay.textContent = '▶ PLAY';
  }

  const acc = computeAccuracyRank();
  const hasHistory = Array.isArray(gameState.hitHistory) && gameState.hitHistory.length > 0;
  const trueConfirmedHits = hasHistory ? acc.confirmedCount : gameState.confirmedHits;
  const truePerfectPct = Math.round(acc.perfectPct);
  if (hasHistory) {
    gameState.confirmedHits = trueConfirmedHits;
    gameState.perfectHits = acc.perfectCount;
  }

  const elKicker = document.getElementById('results-tag') || document.getElementById('results-kicker');
  const elTitle = document.getElementById('results-title');
  const elRankBadge = document.getElementById('results-rank') || document.getElementById('results-rank-badge');
  const elHits = document.getElementById('results-hits');
  const elAccuracy = document.getElementById('results-accuracy');
  const elTime = document.getElementById('results-time');
  const elSubtext = document.getElementById('results-subtitle') || document.getElementById('results-subtext');

  if (elKicker) elKicker.textContent = isVictory ? 'STAGE CLEAR // VICTORY' : 'K.O. // DEFEATED';
  if (elTitle) elTitle.textContent = isVictory ? 'CYPHER CROWNED' : 'CHALLENGER DOWN';
  const runSummary = computeRunResultsSummary({
    perfectHits: gameState.perfectHits,
    onBeatHits: gameState.onBeatHits,
    missedPresses: gameState.missedPresses,
    confirmedHits: trueConfirmedHits,
    maxCombo: gameState.maxCombo,
    damageTaken: Math.max(0, 100 - (gameState.playerHp || 0)),
    feverActivations: gameState.feverActivations || 0
  });
  gameState.lastRunResultsSummary = runSummary;
  if (elRankBadge) elRankBadge.textContent = isVictory ? (runSummary.rank || 'B') : 'D';
  if (elHits) elHits.textContent = String(trueConfirmedHits);
  if (elAccuracy) elAccuracy.textContent = `${Number.isFinite(runSummary.justTimingPct) ? runSummary.justTimingPct : truePerfectPct}%`;
  if (elTime) elTime.textContent = formatClearTime(gameState.runElapsedSec);
  if (elSubtext) {
    const fcBadge = runSummary.fullCombo ? 'FULL COMBO' : `MAX COMBO ${gameState.maxCombo}`;
    const where = gameState.sectionName ? `${gameState.sectionName} · BAR ${Math.max(0, gameState.sectionBarIndex) + 1}` : `Wave ${gameState.wave}/3`;
    elSubtext.textContent = isVictory
      ? `DJ Kronos defeated in ${where}! Just-Timing ${runSummary.justTimingPct}% · ${fcBadge}`
      : `${gameState.endReason || 'Knocked out'} in ${where}. Just-Timing ${runSummary.justTimingPct}% · ${fcBadge}`;
    const defenseLine = ` · Counters: ${gameState.perfectCounters} perfect / ${gameState.imperfectCounters} · Finishers: ${gameState.finishers} · Takedowns: ${gameState.takedowns}`;
    elSubtext.textContent += defenseLine;
  }
  if (elResultsOverlay) {
    elResultsOverlay.classList.remove('hidden');
  }
}

function restartGame(options = {}) {
  gameState.isGameOver = false;
  gameState.isPaused = false;
  gameState.gameStarted = true;
  gameState.runStartTimeMs = performance.now();
  gameState.runElapsedSec = 0;

  gameState.playerHp = 100;
  gameState.crewHp = 100;
  gameState.bossHp = 100;
  gameState.combo = 0;
  gameState.maxCombo = 0;
  gameState.comboDecayTimer = 0;
  gameState.confirmedHits = 0;
  gameState.perfectHits = 0;
  gameState.onBeatHits = 0;
  gameState.missedPresses = 0;
  gameState.hitHistory = [];
  gameState.impactBeatOffsetsMs = [];
  gameState.impactTargetOffsetsMs = [];
  gameState.enemyStrikeEvents = [];
  gameState.punchStep = 0;
  gameState.lastPunchTime = -10;
  gameState.wallSlamCount = 0;
  gameState.totalKoz = 0;
  gameState.takedownTokens = 0;
  gameState.feverMeter = 0;
  gameState.feverRushTimer = 0;
  gameState.feverActivations = 0;
  gameState.perfectCounters = 0;
  gameState.imperfectCounters = 0;
  gameState.counterAttempts = 0;
  gameState.finishers = 0;
  gameState.takedowns = 0;
  gameState.lastCounterTime = -10;
  gameState.directorScheduled = [];
  gameState.sectionId = null;
  gameState.sectionName = '';
  gameState.sectionBarIndex = 0;
  gameState.sectionLog = [];
  gameState.sectionBudgetLeft = 0;
  gameState.sectionBudgetTotal = 0;
  gameState.sectionCleared = false;
  gameState.respawnTimer = 0;
  gameState.spawnSeq = 0;
  gameState.bossPhase = 0;
  gameState.finisherSeq = null;
  gameState.endReason = '';
  gameState.kronosStaggerShown = 0;
  resetDirector({ wave: 1 });
  _directorKnownStrikes = new Set();
  _directorLastSongTime = null;
  gameState.hitStopTimer = 0;
  gameState.lastBeatWarpSchedule = null;
  clearActiveSchedules();
  if (challengerRig.clipDriven && challengerRig.mixer) {
    challengerRig.mixer.stopAllAction();
    challengerRig._activeAction = null;
    challengerRig._activeClipName = null;
  }
  gameState.playerHitStunTimer = 0;
  gameState.attackStartPose = null;
  gameState.styleRank = '—';
  gameState.hype = 0.0;
  gameState.kronosRingState = 'idle';
  gameState.bossAttackPattern = 'idle';
  gameState.bossComboStep = 0;
  gameState.lastProcessedBeatIdx = -1;
  gameState.wave3StartBeatIdx = undefined;
  gameState.wave3StartBeatFloat = undefined;
  gameState.wave3BeatFloat = 0;
  gameState.wave3BarIdx = 0;
  gameState.wave3BeatInBar = 0;
  gameState.wave3BeatWeaveTimer = 0;
  gameState.isAttacking = false;
  gameState.attackPhase = 'idle';
  gameState.pendingHit = null;
  gameState.inputBuffer = null;
  gameState.playerPos.copy(gameState.basePos);
  gameState.playerTarget.copy(gameState.basePos);

  if (challengerBlender) {
    challengerBlender.snapToPose(CHALLENGER_POSES.idle);
    challengerBlender.setTargetHipsPosition(0, 1.0, 0);
  }

  activeBarIdx = -1;
  if (elLyricSection) elLyricSection.textContent = '';
  if (elLyricLine) elLyricLine.textContent = '';

  const shouldAutoPlay = Boolean(
    (options && options.fromUserGesture) ||
    audioEngine.isPlaying ||
    _wasPlayingBeforePause
  );
  _wasPlayingBeforePause = false;
  if (options && options.fromUserGesture) {
    audioEngine.userGestureUnlocked = true;
  }
  audioEngine.restart(shouldAutoPlay).then((playing) => {
    if (btnPlay) {
      btnPlay.classList.toggle('playing', playing);
      btnPlay.textContent = playing ? '❚❚ PAUSE' : '▶ PLAY';
    }
  });

  if (elStartOverlay) elStartOverlay.classList.add('hidden');
  if (elPauseOverlay) elPauseOverlay.classList.add('hidden');
  if (elResultsOverlay) elResultsOverlay.classList.add('hidden');

  spawnWave(1);
  updateHudNumbers();
}

// ============================================================================
// ACTIVE-PHASE HIT RESOLUTION (Section 2.1, 2.2, 2.6, 2.8)
// ============================================================================
function getStrikeRecoilProfile(action, punchStep) {
  let recoilType = 'hit-react-jab';
  let recoilVector = new THREE.Vector3(0.00, 0.00, -0.35);
  let targetTorsoRot = new THREE.Vector3(0.10, 0.18, -0.04);
  let targetHeadRot = new THREE.Vector3(0.12, 0.15, -0.12);
  let pushSpeed = 1.1;
  let recoilDur = 0.55;
  let microAxis = 'x';
  let microAmp = 0.06;
  let microDur = 0.048;
  let vfxType = 'spark-burst';

  if (action === 'kick') {
    recoilType = 'hit-react-kick';
    recoilVector = new THREE.Vector3(0.85, 0.30, -0.95);
    targetTorsoRot = new THREE.Vector3(0.14, 0.45, 0.22);
    targetHeadRot = new THREE.Vector3(0.10, 0.35, 0.18);
    pushSpeed = 2.6;
    recoilDur = 0.65;
    microAxis = 'xy';
    microAmp = 0.18;
    microDur = 0.100;
    vfxType = 'comic-starburst-3d';
  } else if (punchStep === 1) {
    recoilType = 'hit-react-cross';
    recoilVector = new THREE.Vector3(-0.45, 0.00, -0.60);
    targetTorsoRot = new THREE.Vector3(0.18, -0.25, 0.08);
    targetHeadRot = new THREE.Vector3(-0.15, -0.28, 0.16);
    pushSpeed = 1.4;
    recoilDur = 0.55;
    microAxis = 'x';
    microAmp = 0.10;
    microDur = 0.070;
    vfxType = 'slash-spark';
  } else if (punchStep === 2) {
    recoilType = 'hit-react-uppercut';
    recoilVector = new THREE.Vector3(0.00, 0.90, -0.30);
    targetTorsoRot = new THREE.Vector3(-0.35, 0.00, 0.00);
    targetHeadRot = new THREE.Vector3(-0.40, 0.00, 0.00);
    pushSpeed = 1.0;
    recoilDur = 0.65;
    microAxis = 'y';
    microAmp = 0.14;
    microDur = 0.110;
    vfxType = 'impact-ring';
  }
  return { recoilType, recoilVector, targetTorsoRot, targetHeadRot, pushSpeed, recoilDur, microAxis, microAmp, microDur, vfxType };
}

function applyBruiserConfirmedHit(obj, action, punchStep, timing, totalHitDmg, isBeatDropFinisher, profile, validTargetPos) {
  const { recoilType, recoilVector, targetTorsoRot, targetHeadRot, pushSpeed, recoilDur, microAxis, microAmp, microDur } = profile;
  if (obj.state === 'guard') {
    if (action === 'kick') {
      obj.state = 'guard_break';
      obj.isGuarding = false;
      obj.stateTimer = 1.2;
      obj.recoilTotalTimer = 1.2;
      obj.recoilType = 'guard-break';
      obj.hp = Math.max(0, obj.hp - totalHitDmg);

      const pushDir = new THREE.Vector3().subVectors(obj.rig.root.position, gameState.playerPos);
      pushDir.y = 0;
      if (pushDir.lengthSq() < 0.001) pushDir.set(0, 0, -1);
      pushDir.normalize();
      obj.velocity = pushDir.clone().multiplyScalar(2.4);

      setStarburstText('GUARD SHATTER!', 1.25);
      floorDial.updateBadge('GUARD SHATTERED!', '#ffe042');
      audioEngine.playCombatSfx('guard-break', timing.grade, validTargetPos);
      gameState.hype = Math.min(100.0, (gameState.hype || 0) + 12.0);
      gameState.guardBreakActive = true;
      obj.badge.update(obj.hp, obj.maxHp, 'guard_break', '💥 GUARD SHATTERED! 💥');

      if (obj.hp <= 0) launchBruiserIntoStage(obj);
    } else {
      const chipDmg = Math.max(1, Math.round(totalHitDmg * 0.20));
      obj.hp = Math.max(0, obj.hp - chipDmg);
      audioEngine.playCombatSfx('guard-deflect', timing.grade, validTargetPos);
      setStarburstText('BLOCKED!', 1.05);
      floorDial.updateBadge('DEFLECTED!', '#00e5ff');
      obj.badge.update(obj.hp, obj.maxHp, 'guard', '🛡️ BLOCKED (-80%)');

      obj.isMicroShaking = true;
      obj.microShakeDuration = 0.04;
      obj.microShakeTimer = 0.04;
      obj.microShakeAmp = 0.04;
      obj.microShakeVertAmp = 0.005;
      obj.microShakeAxis = 'x';
      if (obj.hp <= 0) launchBruiserIntoStage(obj);
    }
  } else {
    obj.isGuarding = false;
    const wasWindup = obj.state === 'windup' || obj.state === 'striking';
    const heavyHit = action === 'kick' || punchStep === 2 || isBeatDropFinisher;
    if (DIRECTOR_ENABLED && wasWindup && !heavyHit) {
      // A marker swing has armor against light hits: the damage lands but the swing continues,
      // so the player must counter, dodge, or interrupt with a heavy (kick / uppercut).
      obj.hp = Math.max(0, obj.hp - Math.round(totalHitDmg * 0.75));
      obj.isMicroShaking = true;
      obj.microShakeDuration = 0.05;
      obj.microShakeTimer = 0.05;
      obj.microShakeAmp = 0.05;
      obj.microShakeVertAmp = 0.006;
      obj.microShakeAxis = 'x';
      obj.microShakeNormal = { x: 1, y: 0, z: 0 };
      floorDial.updateBadge('ARMORED SWING! COUNTER [F]', '#ff9f1c');
      obj.lastHitStrike = punchStep === 0 ? 'jab' : 'cross';
      if (obj.hp <= 0) {
        obj.hp = 0;
        launchBruiserIntoStage(obj);
      }
      return;
    }
    // Directional reaction with anticipation/overshoot curve, launch on uppercut, knockback that
    // can wall-slam against the barricades (combat/reactions.js). Damage is applied inside.
    const sideSign = (obj.rig.root.position.x - gameState.playerPos.x) >= 0 ? 1 : -1;
    const reactProfile = getDirectionalHitReactionProfile(action, punchStep, { sideSign });
    applyEnemyHitReaction(obj, {
      action,
      punchStep,
      damage: totalHitDmg,
      playerPos: gameState.playerPos,
      isPerfect: timing.grade === 'PERFECT',
      wasWindup,
      profile: reactProfile
    }, { gameState });
    if (!obj.velocity || typeof obj.velocity.lengthSq !== 'function') {
      const v = obj.velocity || { x: 0, y: 0, z: 0 };
      obj.velocity = new THREE.Vector3(v.x || 0, v.y || 0, v.z || 0);
    }
    obj.badge.update(obj.hp, obj.maxHp, obj.state === 'launch' ? 'hit' : obj.state);
    obj.lastHitStrike = action === 'kick' ? 'kick' : (punchStep === 0 ? 'jab' : (punchStep === 1 ? 'cross' : 'uppercut'));

    if (obj.hp <= 0) {
      obj.hp = 0;
      launchBruiserIntoStage(obj);
    }
  }
}

function applyKronosConfirmedHit(action, timing, counterMult, styleMult, profile, validTargetPos, contactPoint, punchStep = 0, pressSongTime = null) {
  const { recoilType, recoilVector, targetTorsoRot, targetHeadRot, recoilDur, microAxis, microAmp, microDur } = profile;
  let bossDmg = (action === 'kick' ? 11.5 : 7.5) * (timing.mult || 1.0) * counterMult * styleMult;
  const heavyHit = action === 'kick' || punchStep === 2;
  const fin = gameState.finisherSeq;
  if (fin) {
    // The four finisher beats are judged on the press (the warped impact lands a half-beat later).
    const judgeT = (pressSongTime !== null && pressSongTime !== undefined) ? pressSongTime : audioEngine.getSongTime();
    let step = null;
    if (judgeT !== null) {
      for (const st of fin.steps) {
        if (!fin.used.has(st.step) && Math.abs(judgeT - st.time) <= TUNING.ON_BEAT_WINDOW_SEC + 0.02) { step = st; break; }
      }
    }
    if (step) {
      fin.used.add(step.step);
      fin.landed += 1;
      bossDmg *= step.damageMult || 1.0;
      setStarburstText(`${step.label.replace(/^BEAT \d: /, '')}!`, 1.2 + 0.05 * fin.landed);
      floorDial.updateBadge(`FINISHER ${fin.landed}/4`, '#ffe042');
      if (step.isKnockoutBlow && fin.landed >= 2) {
        fin.koReleased = true;
        bossDmg = Math.max(bossDmg, gameState.bossHp + 1);
      }
    }
  }
  const bossBusy = gameState.kronosRingState === 'windup_combo' || gameState.kronosRingState === 'striking_combo' ||
    gameState.kronosRingState === 'windup_shockwave' || gameState.kronosRingState === 'shockwave_active';
  if (DIRECTOR_ENABLED && bossBusy && !heavyHit && !fin) {
    // Kronos has swing armor on his marker attacks: light hits chip him but do not stop the swing.
    gameState.bossHp = Math.max(0, gameState.bossHp - bossDmg * 0.75);
    applyKronosHpFloor('hit');
    gameState.kronosIsMicroShaking = true;
    gameState.kronosMicroShakeTimer = 0.05;
    gameState.kronosMicroShakeDuration = 0.05;
    gameState.kronosMicroShakeAmp = 0.05;
    gameState.kronosMicroShakeAxis = 'x';
    floorDial.updateBadge('ARMORED SCRATCH! COUNTER [F]', '#ff9f1c');
    kronosRingBadge.update(gameState.bossHp, 100, gameState.kronosRingState, null, gameState.bossAttackPattern);
    return false;
  }
  gameState.bossHp = Math.max(0, gameState.bossHp - bossDmg);
  applyKronosHpFloor('hit');
  gameState.kronosRingState = 'hit';
  gameState.kronosStateTimer = recoilDur;
  gameState.kronosRecoilTotal = recoilDur;
  gameState.kronosRecoilType = recoilType;
  gameState.kronosRecoilVector = recoilVector.clone();
  gameState.kronosTargetTorsoRot = targetTorsoRot;
  gameState.kronosTargetHeadRot = targetHeadRot;
  gameState.kronosIsMicroShaking = true;
  gameState.kronosMicroShakeTimer = microDur;
  gameState.kronosMicroShakeDuration = microDur;
  gameState.kronosMicroShakeAmp = microAmp;
  gameState.kronosMicroShakeAxis = microAxis;

  if (counterMult >= 2.0) {
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + 20.0);
    setStarburstText('CRITICAL PUNISH!', 1.25);
  }

  kronosRingBadge.update(gameState.bossHp, 100, 'hit', '★ BOSS DJ KRONOS ★');

  if (gameState.bossHp <= 0) {
    gameState.bossHp = 0;
    gameState.kronosRingState = 'ko';
    kronosRingBadge.update(0, 100, 'ko', '★ K.O.! VICTORY! ★');
    setStarburstText('K.O.! STAGE CLEAR!', 1.35);
    floorDial.updateBadge('STAGE CLEAR!', '#ffe042');
    audioEngine.playCombatSfx('stage-ko', timing.grade, validTargetPos);
    if (postProcessing && postProcessing.triggerImpact) {
      postProcessing.triggerImpact('KO', contactPoint);
    }
    updateHudNumbers();
    triggerGameEnd(true);
    return true;
  }
  return false;
}

function resolveActivePhaseAttack(hitCtx) {
  if (!hitCtx || hitCtx.resolved) return;
  hitCtx.resolved = true;

  const { action, punchStep, timing, moveKey } = hitCtx;

  const frameSongTime = audioEngine.getSongTime();
  const impactSongTime = (hitCtx.targetImpactSongTime !== undefined && hitCtx.targetImpactSongTime !== null)
    ? hitCtx.targetImpactSongTime
    : frameSongTime;
  const stepSongTime = (
    hitCtx.pressSongTime !== undefined &&
    hitCtx.pressSongTime !== null &&
    impactSongTime !== null &&
    hitCtx.pressSongTime >= impactSongTime
  ) ? hitCtx.pressSongTime : frameSongTime;
  let impactBeatOffsetMs = 0;
  if (stepSongTime !== null && stepSongTime !== undefined) {
    const chart = audioEngine.getActiveChart();
    const beatInfo = findNearestChartBeat(stepSongTime, chart);
    let absDelta = beatInfo.absDelta;
    if (hitCtx.beatWarp) {
      // Warped impacts target the half-beat grid; measure against the nearest grid line and the target.
      const gridT = findNearestChartSubdivision(stepSongTime, chart, 0.5);
      absDelta = Math.min(absDelta, Math.abs(stepSongTime - gridT));
      if (impactSongTime !== null) {
        gameState.impactTargetOffsetsMs.push(Number((Math.abs(stepSongTime - impactSongTime) * 1000).toFixed(2)));
      }
    }
    impactBeatOffsetMs = Number((absDelta * 1000).toFixed(2));
    gameState.impactBeatOffsetsMs.push(impactBeatOffsetMs);
  }

  // Live Distance + Facing check AT THE ACTIVE PHASE MOMENT!
  const targetInfo = findBestCombatTarget(
    gameState.wave === 3 ? Math.max(TUNING.ACTIVE_HIT_MAX_DIST, 2.15) : TUNING.ACTIVE_HIT_MAX_DIST
  );

  let validTarget = null;
  if (targetInfo && targetInfo.pos) {
    const toTarget = new THREE.Vector3().subVectors(targetInfo.pos, gameState.playerPos);
    toTarget.y = 0;
    const liveDist = toTarget.length();
    const maxHitDist = (targetInfo.type === 'kronos') ? 2.15 : TUNING.ACTIVE_HIT_MAX_DIST;

    if (liveDist <= maxHitDist) {
      let facingDot = 1.0;
      if (liveDist > 0.05 && challengerRig.root) {
        toTarget.normalize();
        const yaw = challengerRig.root.rotation.y;
        const fwdX = -Math.sin(yaw);
        const fwdZ = -Math.cos(yaw);
        facingDot = fwdX * toTarget.x + fwdZ * toTarget.z;
      }
      if (facingDot >= TUNING.ACTIVE_HIT_MIN_FACING_DOT) {
        validTarget = targetInfo;
      }
    }
  }

  const limbPos = getAttackingLimbWorldPos(action, punchStep);

  // Air Whiff ONLY if no enemy passes live distance + facing check inside ACTIVE window
  if (!validTarget) {
    const contactPoint = limbPos.clone().add(new THREE.Vector3(0, 0, -0.55));
    contactPoint.y = THREE.MathUtils.clamp(contactPoint.y, 0.9, 1.6);
    gameState.lastContactPoint = contactPoint;
    audioEngine.playCombatSfx('miss-whiff', timing.grade, gameState.playerPos);
    floorDial.updateBadge('WHIFF!', '#8899aa');
    updateHudNumbers();
    return;
  }

  // CONFIRMED HIT ON ENEMY IN ACTIVE PHASE!
  const { type, obj } = validTarget;
  const isPerfect = timing.grade === 'PERFECT';
  const isOffBeat = timing.grade === 'MISS';

  // Finisher on a dazed enemy (S) and token takedown (D) resolve as KOs on the warped impact frame.
  if (type === 'bruiser' && (hitCtx.isFinisher || hitCtx.isTakedown)) {
    const stillDazed = obj.state === 'dazed' || obj.isDazed || obj.state === 'stunned' || obj.state === 'wall_slam';
    let resolvedAsKo = false;
    if (hitCtx.isFinisher && stillDazed) {
      obj.hp = 0;
      obj.isDazed = false;
      obj.vulnerableToFinisher = false;
      launchBruiserIntoStage(obj);
      gameState.finishers += 1;
      gameState.dodgeInvulnTimer = Math.max(gameState.dodgeInvulnTimer, FINISHER_INVULN_SEC);
      directorGrantTokenProgress(0.5, 'finisher');
      directorGrantFeverProgress(15.0, 'finisher');
      setStarburstText('FINISHER!', 1.32);
      floorDial.updateBadge('FINISHER K.O.!', '#ffe042');
      resolvedAsKo = true;
    } else if (hitCtx.isTakedown && obj.state !== 'ko' && obj.state !== 'flying') {
      const res = directorConsumeTakedownToken(obj, { gameState, launchBruiserIntoStage });
      if (res.consumed) {
        gameState.takedowns += 1;
        gameState.takedownTokens = res.remainingTokens;
        directorGrantFeverProgress(10.0, 'takedown');
        setStarburstText('TAKEDOWN!', 1.32);
        floorDial.updateBadge(`TAKEDOWN! ${res.remainingTokens} TOKEN${res.remainingTokens === 1 ? '' : 'S'} LEFT`, '#ff3fb4');
        resolvedAsKo = true;
      }
    }
    if (resolvedAsKo) {
      gameState.combo += 1;
      gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
      gameState.comboDecayTimer = TUNING.COMBO_DECAY_SEC;
      gameState.confirmedHits += 1;
      if (!isOffBeat) { if (isPerfect) gameState.perfectHits += 1; else gameState.onBeatHits += 1; }
      gameState.hype = Math.min(100.0, (gameState.hype || 0) + 20.0);
      const koPoint = calculateContactPoint(obj, limbPos, action, punchStep);
      gameState.lastContactPoint = koPoint.clone();
      gameState.activeImpactVFX.push(impactBurstPool.acquire(koPoint, 'comic-starburst-3d'));
      audioEngine.playCombatSfx('stage-ko', 'PERFECT', validTarget.pos);
      gameState.hitStopTimer = 0.12;
      gameState.cameraKick = 0.42;
      gameState.cameraDutch = 0.05;
      cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.35);
      if (postProcessing && postProcessing.triggerImpact) postProcessing.triggerImpact('PERFECT', koPoint);
      updateStyleRankAndHype(0);
      updateHudNumbers();
      return;
    }
  }
  const counterMult = (gameState.kronosRingState === 'counter_stun' || gameState.counterBonusTimer > 0) ? 2.0 : 1.0;
  if (counterMult > 1.0 && gameState.kronosRingState !== 'counter_stun') {
    gameState.counterBonusTimer = 0;
  }

  if (!isOffBeat) {
    gameState.combo += 1;
    gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
    gameState.comboDecayTimer = TUNING.COMBO_DECAY_SEC;
    if (isPerfect) {
      gameState.perfectHits += 1;
    } else {
      gameState.onBeatHits += 1;
    }
  }
  gameState.confirmedHits += 1;
  gameState.combatIdleTimer = 0;

  const baseHitDmg = TUNING.MOVES[moveKey] ? TUNING.MOVES[moveKey].baseDmg : (action === 'kick' ? 48 : 32);
  const profile = getStrikeRecoilProfile(action, punchStep);
  const { recoilType, recoilVector, microAxis, microAmp, microDur, vfxType } = profile;

  const contactPoint = calculateContactPoint(obj, limbPos, action, punchStep);
  gameState.lastContactPoint = contactPoint.clone();

  const impactVFX = impactBurstPool.acquire(contactPoint, vfxType);
  gameState.activeImpactVFX.push(impactVFX);

  const hitEntry = {
    attackType: moveKey,
    action,
    grade: timing.grade,
    confirmed: true,
    timestamp: performance.now(),
    songTime: impactSongTime,
    impactBeatOffsetMs,
    enemyIdx: validTarget.obj && validTarget.obj.idx !== undefined ? validTarget.obj.idx : 0,
    hitReactState: recoilType,
    recoilVector: recoilVector.clone(),
    microShake: {
      active: true,
      axis: microAxis,
      amplitude: microAmp,
      duration: microDur
    },
    contactPoint: contactPoint.clone(),
    impactVfx: {
      spawned: true,
      vfxType,
      count: action === 'kick' ? 16 : 12
    }
  };
  gameState.lastHit = hitEntry;
  gameState.hitHistory.push(hitEntry);

  updateStyleRankAndHype(0);

  if (!isOffBeat && (gameState.combo === 4 || gameState.combo === 8 || gameState.combo === 12)) {
    audioEngine.triggerCrowdHype(`combo-${gameState.combo}`, { combo: gameState.combo });
  }

  const impactCtxTime = (hitCtx.beatWarp && impactSongTime !== null && impactSongTime !== undefined)
    ? clockSongTimeToContextTime(impactSongTime)
    : null;
  audioEngine.playCombatSfx(moveKey, timing.grade, validTarget.pos, impactCtxTime);

  gameState.hitStopTimer = predictHitStopSec(action, punchStep, timing.grade);

  const feverMult = gameState.feverRushTimer > 0 ? 1.5 : 1.0;
  const styleMult = (isOffBeat ? 1.0 : (gameState.styleDamageMultiplier || 1.0)) * feverMult;
  // Off-beat basics still land (never a whiff) but at reduced effect; on-beat is the reward.
  const timingMult = isOffBeat ? TUNING.OFF_BEAT_DAMAGE_MULT : (timing.mult || 1.0);
  let totalHitDmg = Math.round(baseHitDmg * timingMult * counterMult * styleMult);
  hitEntry.damage = totalHitDmg;

  if (!isOffBeat) {
    directorGrantFeverProgress(isPerfect ? 14.0 : 8.0, 'hit');
    directorGrantTokenProgress(isPerfect ? 0.20 : 0.10, 'hit');
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + (isPerfect ? 8.0 : 4.0) * styleMult);
    floorDial.updateBadge(timing.label || 'ON BEAT!', timing.color || '#42f56c');
    const burstWords = action === 'kick'
      ? ['BEAT KICK!', 'HEAVY KICK!', 'KRA-KOOM!', 'BA-DOOM!']
      : ['POW-SNAP!', 'KRA-KOOM!', 'ON-BEAT HIT!'];
    setStarburstText(burstWords[gameState.combo % burstWords.length], action === 'kick' ? 1.18 : 1.10);
  } else {
    directorGrantFeverProgress(-6.0, 'off-beat');
    floorDial.updateBadge('OFF-BEAT ×0.6', '#ff385c');
  }

  const isSrank = !isOffBeat && (gameState.styleRank === 'S-RANK' || gameState.combo >= 10);
  const isFinisherMove = action === 'kick' || (action === 'punch' && punchStep === 2);
  const isBeatDropFinisher = isSrank && isFinisherMove;

  if (isBeatDropFinisher) {
    totalHitDmg = Math.round(totalHitDmg * 1.5);
    hitEntry.damage = totalHitDmg;
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + 12.0);
    setStarburstText('BEAT DROP ×1.5!', 1.18);
    floorDial.updateBadge('BEAT DROP ×1.5!', '#ff1e38');
    gameState.lastFinisher = { action, timing: timing.grade, timestamp: performance.now() };
  }

  if (type === 'bruiser') {
    applyBruiserConfirmedHit(obj, action, punchStep, timing, totalHitDmg, isBeatDropFinisher, profile, validTarget.pos);
  } else if (type === 'kronos') {
    if (applyKronosConfirmedHit(action, timing, counterMult, styleMult, profile, validTarget.pos, contactPoint, punchStep, hitCtx.pressSongTime)) {
      return;
    }
  }

  gameState.cameraKick = isOffBeat ? 0.14 : (action === 'kick' ? 0.35 : 0.22);
  gameState.cameraDutch = (action === 'kick' ? 1 : -1) * (isOffBeat ? 0.020 : 0.035);
  triggerCameraJuice(action, isPerfect, punchStep);
  if (isPerfect && postProcessing && postProcessing.triggerImpact) {
    postProcessing.triggerImpact('PERFECT', contactPoint);
  }
  updateHudNumbers();
}

function executeDodgeAction(nowSec, timing, isBufferedDequeue = false) {
  if (!isBufferedDequeue && cooldownActive(gameState.lastDodgeTime, nowSec, TUNING.DODGE_COOLDOWN_SEC)) {
    return;
  }
  gameState.lastDodgeTime = nowSec;

  if (gameState.isAttacking || (gameState.pose !== 'idle' && gameState.pose !== 'dodge')) {
    gameState.lastCancel = {
      fromPose: gameState.pose,
      toPose: 'dodge',
      canceledWithinFrames: 1,
      inputDropped: false,
      timestamp: performance.now()
    };
    gameState.lastCancelLatency = 1;
    gameState.cancelHistory.push(gameState.lastCancel);
  }
  gameState.isAttacking = false;
  gameState.attackPhase = 'idle';
  gameState.attackType = 'dodge';
  gameState.pendingHit = null;
  gameState.canCancel = false;
  gameState.inputBuffer = null;
  gameState.pose = 'dodge';
  gameState.poseTimer = 0.34;
  gameState.dodgeInvulnTimer = TUNING.DODGE_IFRAME_SEC;
  cancelActorSchedules(challengerRig);
  if (timing.onBeat || timing.grade === 'SILENT') {
    gameState.wave3BeatWeaveTimer = 0.52;
  }

  const side = Math.random() > 0.5 ? 1 : -1;
  if (challengerRig.clipDriven && challengerRig.playClip) {
    challengerRig.playClip(side > 0 ? 'dodge-R' : 'dodge-L', { fadeInSec: 0.05, loop: false });
  }
  const newX = Math.max(-4.0, Math.min(4.0, gameState.playerPos.x + side * 0.62));
  gameState.playerTarget.set(newX, 0, gameState.playerPos.z);
  if (gameState.playerTarget.length() > TUNING.PLAYER_MAX_RADIUS) {
    gameState.playerTarget.setLength(TUNING.PLAYER_MAX_RADIUS);
  }
  gameState.cameraDutch = side * 0.04;
  triggerCameraJuice('dodge', timing.grade === 'PERFECT', 0);

  let counteredAttacker = false;
  bruisers.forEach((b) => {
    if (DIRECTOR_ENABLED) return; // the director grades the dodge at the marker (evaded strike -> dazed enemy)
    if (!b.active) return;
    const d = gameState.playerPos.distanceTo(b.rig.root.position);
    if (d > TUNING.COUNTER_WEAVE_MAX_DIST) return;
    if ((b.state === 'windup' && b.stateTimer <= TUNING.COUNTER_WEAVE_LAST_WINDUP_SEC) || b.state === 'striking') {
      b.state = 'stunned';
      b.stateTimer = 1.45;
      b.teleMat.opacity = 0;
      b.badge.update(b.hp, b.maxHp, 'stunned');
      counteredAttacker = true;
    }
  });

  if (!DIRECTOR_ENABLED && gameState.kronosInRing) {
    const kd = gameState.playerPos.distanceTo(kronosRig.root.position);
    const w3Cfg = TUNING.WAVES[3];
    // 1. BASS DROP SHOCKWAVE: weave on Beat 3 during windup_shockwave OR weave across active shockwave ring
    if (
      gameState.kronosRingState === 'windup_shockwave' ||
      (gameState.bossShockwave && gameState.bossShockwave.active && !gameState.bossShockwave.evaded)
    ) {
      const canWeaveShockwave = gameState.kronosRingState === 'windup_shockwave' ||
        Math.abs(kd - gameState.bossShockwave.radius) <= 1.25;
      if (canWeaveShockwave && !gameState.shockwavePreWeaved) {
        gameState.shockwavePreWeaved = true;
        if (gameState.bossShockwave) {
          gameState.bossShockwave.evaded = true;
        }
        gameState.shockwaveDodged = true;
        gameState.kronosRingState = 'counter_stun';
        gameState.kronosStateTimer = 0.85;
        gameState.counterBonusTimer = 1.6;
        gameState.bossCounterStunActive = true;
        gameState.bossAttackPattern = 'idle';
        kronosTeleMat.opacity = 0;
        const reboundDmg = w3Cfg ? w3Cfg.bossBassDropReboundDmg : 28;
        gameState.bossHp = Math.max(0, gameState.bossHp - reboundDmg);
        kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', `★ BASS REBOUND (-${reboundDmg})! ★`);
        counteredAttacker = true;
      }
    } else if (
      gameState.kronosRingState === 'windup_combo' ||
      gameState.kronosRingState === 'striking_combo'
    ) {
      // 2. SCRATCH COMBO 3-HIT STRING: counter window on the 3rd hit (step === 2)
      const step = gameState.bossComboStep || 0;
      if (step === 2) {
        gameState.bossStepWeaved = true;
        gameState.kronosRingState = 'counter_stun';
        gameState.kronosStateTimer = 0.85;
        gameState.counterBonusTimer = 1.6;
        gameState.bossCounterStunActive = true;
        gameState.bossAttackPattern = 'idle';
        kronosTeleMat.opacity = 0;
        const riposteDmg = w3Cfg ? w3Cfg.bossCounterRiposteDmg : 26;
        gameState.bossHp = Math.max(0, gameState.bossHp - riposteDmg);
        kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', `★ SCRATCH COUNTER (-${riposteDmg})! ★`);
        counteredAttacker = true;
      } else {
        gameState.bossStepWeaved = true;
      }
    } else if (kd <= TUNING.COUNTER_WEAVE_MAX_DIST) {
      const inLateWindup = (
        gameState.kronosRingState === 'windup' &&
        gameState.kronosStateTimer <= TUNING.COUNTER_WEAVE_LAST_WINDUP_SEC
      ) || gameState.kronosRingState === 'striking';
      if (inLateWindup) {
        gameState.kronosRingState = 'stunned';
        gameState.kronosStateTimer = 1.1;
        gameState.bossAttackPattern = 'idle';
        kronosTeleMat.opacity = 0;
        kronosRingBadge.update(gameState.bossHp, 100, 'stunned', '★ KRONOS STUNNED! ★');
        counteredAttacker = true;
      }
    }

    if (gameState.bossHp <= 0) {
      gameState.bossHp = 0;
      gameState.kronosRingState = 'ko';
      kronosTeleMat.opacity = 0;
      kronosRingBadge.update(0, 100, 'ko', '★ K.O.! VICTORY! ★');
      setStarburstText('K.O.! STAGE CLEAR!', 1.35);
      floorDial.updateBadge('STAGE CLEAR!', '#ffe042');
      audioEngine.playCombatSfx('stage-ko', timing.grade, kronosRig.root.position);
      updateHudNumbers();
      triggerGameEnd(true);
      return;
    }
  }

  if (counteredAttacker) {
    if (challengerRig.clipDriven && challengerRig.playClip) {
      challengerRig.playClip('counter-riposte', { fadeInSec: 0.05, loop: false });
      gameState.poseTimer = Math.max(gameState.poseTimer, 0.55);
    }
    gameState.counterBonusTimer = (gameState.kronosRingState === 'counter_stun') ? 1.6 : Math.max(gameState.counterBonusTimer, 1.5);
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + (gameState.kronosRingState === 'counter_stun' ? 25.0 : 15.0));
    floorDial.updateBadge('COUNTER WEAVE!', '#ffe042');
    setStarburstText('COUNTER WEAVE!', 1.16);
    audioEngine.playCombatSfx('counter-weave', timing.grade, gameState.playerPos);
    if (postProcessing && postProcessing.triggerImpact) {
      postProcessing.triggerImpact('COUNTER', challengerRig.root.position);
    }
  } else {
    setStarburstText('WEAVE!', 1.06);
    audioEngine.playCombatSfx('dodge', timing.grade, gameState.playerPos);
  }
  updateHudNumbers();
}

let _directorKnownStrikes = new Set();
let _directorLastSongTime = null;

// DJ Kronos as a director entity: the director reads/writes these fields; they map onto the
// existing boss state in gameState so the boss state machine keeps animating as before.
const kronosDirectorEntity = {
  id: 'kronos',
  isBoss: true,
  idx: 99,
  hp: 100,
  maxHp: 100,
  get active() { return Boolean(gameState.kronosInRing) && gameState.bossHp > 0 && gameState.kronosRingState !== 'ko'; },
  set active(v) {},
  get state() { return gameState.kronosRingState; },
  set state(v) { gameState.kronosRingState = v; },
  get stateTimer() { return gameState.kronosStateTimer; },
  set stateTimer(v) { gameState.kronosStateTimer = v; },
  get attackCooldown() { return gameState.kronosAttackCooldown || 0; },
  set attackCooldown(v) { gameState.kronosAttackCooldown = v; },
  get attackType() { return gameState.bossAttackPattern; },
  set attackType(v) { gameState.bossAttackPattern = v; },
  attackPattern: null,
  get targetImpactSongTime() { return gameState.kronosTargetImpactSongTime; },
  set targetImpactSongTime(v) {
    gameState.kronosTargetImpactSongTime = v;
    gameState.kronosTargetWindupEndSongTime = (v === null || v === undefined) ? null : v - KRONOS_BEAT_SEC * 0.28;
  },
  get windupTotalDur() { return gameState.kronosWindupTotal; },
  set windupTotalDur(v) { gameState.kronosWindupTotal = v; },
  get rig() { return kronosRig; },
  get teleMat() { return kronosTeleMat; },
  get teleRing() { return kronosTeleRing; },
  get badge() { return kronosRingBadge; },
  isDazed: false,
  vulnerableToFinisher: false
};

function resolveSectionAt(chart, songTime) {
  if (songTime === null || songTime === undefined) return null;
  if (chart && Array.isArray(chart.sections) && chart.sections.length > 0) {
    return getSectionAtTime(chart, songTime);
  }
  if (chart && Array.isArray(chart.bars) && chart.bars.length > 0) {
    const bar = chart.bars.find((b) => songTime >= b.startTime && songTime < b.endTime) || chart.bars[chart.bars.length - 1];
    const phase = bar.phase || 'stage';
    return {
      id: `phase_${phase}`,
      name: (bar.section || phase).toUpperCase(),
      phase,
      wave: phase === 'ring' ? 3 : (phase === 'unfold' ? 2 : 1),
      bossPhase: phase === 'ring' ? 1 : null,
      startTime: bar.startTime,
      endTime: bar.endTime
    };
  }
  return null;
}

function rosterForSection(section) {
  if (!section) return SECTION_ROSTERS.byPhase.stage;
  return SECTION_ROSTERS[section.id] || SECTION_ROSTERS.byPhase[section.phase] || SECTION_ROSTERS.byPhase.stage;
}

function assignBruiserArchetype(b, archetypeId) {
  const def = ARCHETYPE_DEFS[archetypeId] || ARCHETYPE_DEFS.hook_brawler;
  const arch = KRONOS_ENEMY_ARCHETYPES[archetypeId];
  b.archetype = archetypeId;
  b.hp = def.hp;
  b.maxHp = def.hp;
  b.attackType = arch ? (arch.pattern === 'charge' ? 'heavy_haymaker' : arch.pattern) : 'quick_hook';
  b.attackPattern = arch ? arch.pattern : 'quick_hook';
  gameState.spawnSeq += 1;
  b.badgeTitle = `${def.label} #${gameState.spawnSeq}`;
  b.badge.update(b.hp, b.maxHp, 'stalking', b.badgeTitle);
}

function respawnBruiser(b, archetypeId) {
  const toCenter = Math.atan2(-gameState.playerPos.x, -gameState.playerPos.z);
  const a = toCenter + (Math.random() - 0.5) * 2.2;
  const r = 3.6;
  b.rig.root.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
  b.rig.root.rotation.set(0, 0, 0);
  b.rig.root.visible = true;
  b.rig.hips.position.set(0, 1.0, 0);
  b.active = true;
  b.state = 'stalking';
  b.stateTimer = 0;
  b.isGuarding = false;
  b.isDazed = false;
  b.vulnerableToFinisher = false;
  b.isAirborne = false;
  b.verticalVelocity = 0;
  b.flying = null;
  b.guardCooldown = 99;
  b.attackCooldown = 0.9;
  if (b.velocity && typeof b.velocity.set === 'function') b.velocity.set(0, 0, 0);
  b.teleMat.opacity = 0;
  assignBruiserArchetype(b, archetypeId);
}

function beginSongSection(section, chart, songTime) {
  const prev = gameState.sectionId;
  gameState.sectionId = section.id;
  gameState.sectionName = section.name || section.id;
  gameState.bossPhase = section.bossPhase || 0;
  const roster = rosterForSection(section);
  gameState.sectionBudgetTotal = roster.budget;
  gameState.sectionBudgetLeft = roster.budget;
  gameState.sectionCleared = false;
  gameState.respawnTimer = 0;
  gameState.sectionRosterCursor = 0;
  const bar = Array.isArray(chart && chart.bars) ? chart.bars.findIndex((b) => songTime >= b.startTime && songTime < b.endTime) : -1;
  gameState.sectionLog.push({ id: section.id, name: gameState.sectionName, songTime: Number(songTime.toFixed(4)), expectedStart: section.startTime, barIndex: bar });

  const targetWave = section.wave || (section.phase === 'ring' ? 3 : (section.phase === 'unfold' ? 2 : 1));
  if (targetWave === 3 && !gameState.kronosInRing) {
    spawnWave(3); // Kronos leaps into the ring; the roster below keeps a flanker alive
  } else if (targetWave !== gameState.wave) {
    gameState.wave = targetWave;
  }
  if (prev !== null) {
    setStarburstText(`${gameState.sectionName}!`, 1.12);
    audioEngine.triggerCrowdHype('section-change', { section: section.id });
  }
  // Count the crew already standing against this section's budget.
  const standing = bruisers.filter((b) => b.active && b.state !== 'ko' && b.state !== 'flying').length;
  gameState.sectionBudgetLeft = Math.max(0, roster.budget - standing);
  // Retire surplus crew at a section start only when nobody is mid-swing.
  let surplus = standing - roster.count;
  for (let i = bruisers.length - 1; i >= 0 && surplus > 0; i--) {
    const b = bruisers[i];
    if (b.active && b.state === 'stalking') {
      b.active = false;
      b.state = 'ko';
      b.rig.root.visible = false;
      b.teleMat.opacity = 0;
      surplus -= 1;
      gameState.sectionBudgetLeft += 1;
    }
  }
  updateHudNumbers();
}

function maintainSectionRoster(section, dt) {
  const roster = rosterForSection(section);
  if (gameState.respawnTimer > 0) gameState.respawnTimer = Math.max(0, gameState.respawnTimer - dt);
  const standing = bruisers.filter((b) => b.active && b.state !== 'ko' && b.state !== 'flying').length;
  const anyFlying = bruisers.some((b) => b.state === 'flying');
  if (standing < roster.count && gameState.sectionBudgetLeft > 0 && gameState.respawnTimer <= 0 && !anyFlying) {
    const slot = bruisers.find((b) => !b.active || b.state === 'ko');
    if (slot) {
      const arch = roster.archetypes[(gameState.sectionRosterCursor || 0) % roster.archetypes.length];
      gameState.sectionRosterCursor = (gameState.sectionRosterCursor || 0) + 1;
      respawnBruiser(slot, arch);
      gameState.sectionBudgetLeft -= 1;
      gameState.respawnTimer = 1.1;
      floorDial.updateBadge(`${ARCHETYPE_DEFS[arch].label} STEPS IN`, '#ffffff');
      updateHudNumbers();
    }
  }
  if (!roster.boss && !gameState.sectionCleared && gameState.sectionBudgetLeft <= 0 && standing === 0 && !anyFlying) {
    gameState.sectionCleared = true;
    directorGrantFeverProgress(12.0, 'section-clear');
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + 10.0);
    setStarburstText('CREW CLEARED!', 1.2);
    floorDial.updateBadge('CREW CLEARED · DANCE TO THE NEXT DROP', '#ffe042');
  }
}

function startFinalBarFinisher(seq, songTime) {
  gameState.finisherSeq = {
    steps: seq.steps,
    startTime: seq.startTime,
    endTime: seq.endTime,
    landed: 0,
    used: new Set()
  };
  cancelActorSchedules(challengerRig);
  const holdSec = Math.max(0.5, seq.endTime - songTime + 0.5);
  gameState.kronosRingState = 'counter_stun';
  gameState.kronosStateTimer = holdSec;
  gameState.counterBonusTimer = holdSec;
  gameState.bossCounterStunActive = true;
  gameState.bossAttackPattern = 'idle';
  kronosTeleMat.opacity = 0;
  kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', '★ FINISH HIM · 4 BEATS [S] ★');
  setStarburstText('FINAL BAR! FINISH HIM!', 1.3);
  floorDial.updateBadge('HIT EVERY BEAT · JAB · CROSS · UPPERCUT · SLAM', '#ffe042');
  audioEngine.triggerCrowdHype('finisher-call', {});
  if (!reducedMotionEnabled) cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.25);
}

/**
 * Kronos survives to the music: through boss phase 1 his HP floors at 45, through phase 2 at 1,
 * and only the final-bar finisher can take him to 0 (Dead as Disco: a sync resolves to a K.O.
 * on its last marker). Returns true when the floor caught a would-be knockout.
 */
function kronosHpFloor() {
  if (!SONG_ENCOUNTER || !gameState.kronosInRing) return 0;
  if (gameState.finisherSeq) return gameState.finisherSeq.koReleased ? 0 : 1;
  if (gameState.bossPhase >= 2) return 1;
  return 45;
}

function applyKronosHpFloor(sourceLabel = '') {
  const floor = kronosHpFloor();
  if (floor > 0 && gameState.bossHp < floor) {
    gameState.bossHp = floor;
    if (gameState.kronosRingState === 'ko') {
      // A riposte or rebound would have knocked him out; he staggers instead and stays in the fight.
      gameState.kronosRingState = 'counter_stun';
      gameState.kronosStateTimer = 0.85;
      gameState.counterBonusTimer = Math.max(gameState.counterBonusTimer || 0, 1.2);
      gameState.bossCounterStunActive = true;
      gameState.bossAttackPattern = 'idle';
    }
    if (!gameState.kronosStaggerShown || gameState.kronosStaggerShown !== floor) {
      gameState.kronosStaggerShown = floor;
      setStarburstText(floor >= 45 ? 'KRONOS STAGGERS!' : 'KRONOS ON THE ROPES!', 1.22);
      floorDial.updateBadge(floor >= 45 ? 'HE HOLDS ON — RIDE OUT THE VERSE' : 'HOLD HIM TO THE FINAL BAR', '#ffe042');
      kronosRingBadge.update(gameState.bossHp, 100, 'stunned', floor >= 45 ? '★ STAGGERED · PHASE 1 ★' : '★ ON THE ROPES ★');
    }
    return true;
  }
  return false;
}

function finishBossKo(label = 'K.O.! STAGE CLEAR!') {
  if (gameState.isGameOver) return;
  gameState.bossHp = 0;
  gameState.kronosRingState = 'ko';
  kronosTeleMat.opacity = 0;
  kronosRingBadge.update(0, 100, 'ko', '★ K.O.! VICTORY! ★');
  setStarburstText(label, 1.35);
  floorDial.updateBadge('STAGE CLEAR!', '#ffe042');
  audioEngine.playCombatSfx('stage-ko', 'PERFECT', kronosRig.root.position);
  if (postProcessing && postProcessing.triggerImpact) postProcessing.triggerImpact('KO', kronosRig.root.position);
  if (!reducedMotionEnabled) cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.6);
  updateHudNumbers();
  triggerGameEnd(true);
}

/** Drives sections, rosters, the final-bar finisher and the song-end rule from song time. */
function updateSongEncounter(songTime, chart, dt) {
  if (!SONG_ENCOUNTER || songTime === null || songTime === undefined) return;
  const fullDuration = (chart && (chart.fullDuration || chart.loopDuration)) || KRONOS_FULL_DURATION;
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;

  // Song end: a looped track wraps, a one-shot track runs out.
  const wrapped = _directorLastSongTime !== null && songTime < _directorLastSongTime - 5.0;
  if (wrapped || songTime >= fullDuration - 0.06) {
    if (gameState.kronosInRing && gameState.bossHp > 0) {
      const f = gameState.finisherSeq;
      if (f && f.landed >= 2) {
        f.koReleased = true;
        finishBossKo('SPEAKERBOX K.O.!');
      } else {
        gameState.endReason = "TIME'S UP · KRONOS STANDS";
        triggerGameEnd(false);
      }
    } else if (!gameState.kronosInRing) {
      gameState.endReason = "TIME'S UP · THE CYPHER CLOSES";
      triggerGameEnd(false);
    }
    return;
  }

  const section = resolveSectionAt(chart, songTime);
  if (section && section.id !== gameState.sectionId) {
    beginSongSection(section, chart, songTime);
  }
  if (!gameState.kronosInRing && chart && Array.isArray(chart.sections)) {
    const bossSec = chart.sections.find((sec) => (sec.wave === 3 || sec.phase === 'ring') && sec.startTime > songTime);
    if (bossSec && bossSec.startTime - songTime <= 1.3) {
      spawnWave(3);
      gameState.bossPhase = bossSec.bossPhase || 1;
      setStarburstText('KRONOS DROPS IN!', 1.28);
    }
  }
  if (section) {
    const barIdx = Array.isArray(chart && chart.bars) ? chart.bars.findIndex((b) => songTime >= b.startTime && songTime < b.endTime) : -1;
    if (barIdx !== gameState.sectionBarIndex) gameState.sectionBarIndex = barIdx;
    maintainSectionRoster(section, dt);
  }

  // Final-bar finisher: when the last bar arrives with Kronos still standing, he is held open
  // and the player lands the four beats.
  const seq = chart && chart.finisherSequence;
  if (seq && Array.isArray(seq.steps) && gameState.kronosInRing && gameState.bossHp > 0 && !gameState.finisherSeq &&
      songTime >= seq.startTime - beatSec * 0.5) {
    startFinalBarFinisher(seq, songTime);
  }
}

function findBruiserByDirectorId(id) {
  for (let i = 0; i < bruisers.length; i++) {
    const b = bruisers[i];
    if (b.id === id || `bruiser_${b.idx}` === id) return b;
  }
  return null;
}

const STRIKE_CLIP_BY_PATTERN = Object.freeze({
  quick_hook: 'hook',
  hook: 'hook',
  double_tap: 'double-tap',
  heavy_haymaker: 'haymaker',
  haymaker: 'haymaker',
  bass_drop: 'bass-drop'
});

/** Plays an enemy's strike clip time-scaled so its authored impact frame lands on the marker. */
function playEnemyStrikeClip(rig, strike, songTime) {
  if (!rig || !rig.clipDriven || !rig.playClip) return;
  let clipName = STRIKE_CLIP_BY_PATTERN[strike.pattern] || STRIKE_CLIP_BY_PATTERN[strike.attackType] || null;
  if (strike.pattern === 'scratch_combo' || strike.attackType === 'scratch_combo') {
    clipName = ['scratch-1', 'scratch-2', 'scratch-3'][Math.max(0, Math.min(2, strike.comboStep || 0))];
  }
  if (!clipName || strike.pattern === 'charge') return; // the charge keeps its hand-posed rush
  const meta = rig.clipMetadata ? rig.clipMetadata[clipName] : null;
  const impactFrame = meta && Number.isFinite(meta.impactFrame) ? meta.impactFrame : 0.3;
  const remaining = Math.max(0.08, strike.markerTime - songTime);
  const timeScale = Math.max(0.35, Math.min(3.0, impactFrame / remaining));
  rig.playClip(clipName, { fadeInSec: 0.14, loop: false, timeScale });
}

/** Visual-only subwoofer shockwave for a director-resolved bass drop (damage is the director's). */
function spawnBassDropShockwaveVisual() {
  if (gameState.bossShockwave && gameState.bossShockwave.mesh) {
    scene.remove(gameState.bossShockwave.mesh);
    gameState.bossShockwave.mesh.geometry.dispose();
    gameState.bossShockwave.mesh.material.dispose();
  }
  kronosRig.hips.position.y = 0.90;
  kronosTeleMat.opacity = 0;
  setStarburstText('BASS DROP!', 1.25);
  if (!reducedMotionEnabled) cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.45);
  audioEngine.playCombatSfx('subwoofer-bass-drop', 'PERFECT', kronosRig.root.position);
  const shockwaveMesh = buildSubwooferShockwaveRing();
  const spawnPos = kronosRig.root.position.clone();
  shockwaveMesh.position.set(spawnPos.x, 0.04, spawnPos.z);
  scene.add(shockwaveMesh);
  gameState.bossShockwave = {
    active: true,
    visualOnly: true,
    radius: 0.25,
    innerRadius: 0.25,
    maxRadius: 6.5,
    speed: 5.5,
    evaded: true,
    hit: true,
    mesh: shockwaveMesh,
    pos: spawnPos
  };
  gameState.bossShockwaveActive = true;
}

/**
 * Runs the song-marker director for one frame: schedules enemy wind-ups so strikes land on
 * chart markers, resolves strikes/evasions, and syncs tokens and Fever into gameState.
 */
function runCombatDirector(songTime, dt, chart, waveCfg) {
  if (_directorLastSongTime !== null && songTime < _directorLastSongTime - 5.0) {
    // Song looped: re-arm the markers but keep the player's tokens and Fever.
    const tel = getDirectorTelemetry();
    resetDirector({ wave: gameState.wave, initialTakedownTokens: tel.takedownTokens, initialFeverMeter: tel.feverMeter });
    _directorKnownStrikes = new Set();
  }
  _directorLastSongTime = songTime;

  kronosDirectorEntity.hp = gameState.bossHp;
  const result = tickCombatDirector(songTime, dt, {
    gameState,
    chart,
    wave: gameState.wave,
    bruisers: bruisers.filter((b) => b.active && b.state !== 'ko' && b.state !== 'flying'),
    kronos: (gameState.kronosInRing && !gameState.finisherSeq) ? kronosDirectorEntity : null,
    challengerRig,
    maxSimultaneousAttackers: waveCfg.maxSimultaneousAttackers + (gameState.kronosInRing ? 1 : 0),
    onPlayerHit: (dmg, strike) => {
      const light = strike.attackType === 'quick_hook' || strike.attackType === 'double_tap';
      applyPlayerDamage(dmg, light ? 'BAM!' : 'WHAM!', light ? 0.25 : 0.38, light ? -0.035 : 0.055);
      floorDial.updateBadge('HIT! COUNTER [F] · DODGE [A]', '#ff1e38');
    }
  });

  const nowIds = new Set();
  for (const s of result.scheduledStrikes) {
    nowIds.add(s.markerId);
    if (!_directorKnownStrikes.has(s.markerId)) {
      if (s.attackerId === 'kronos') {
        const beatSecK = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
        audioEngine.scheduleBossTelegraphCue(
          s.attackType === 'bass_drop' ? 'bass_drop' : 'scratch_combo',
          beatSecK,
          Math.max(0.1, s.markerTime - songTime),
          kronosRig.root.position
        );
      } else {
        const b = findBruiserByDirectorId(s.attackerId);
        audioEngine.playCombatSfx('enemy-telegraph', 'PERFECT', b ? b.rig.root.position : gameState.playerPos);
        if (b) playEnemyStrikeClip(b.rig, s, songTime);
      }
      if (s.attackerId === 'kronos') playEnemyStrikeClip(kronosRig, s, songTime);
    }
  }
  _directorKnownStrikes = nowIds;
  gameState.directorScheduled = result.scheduledStrikes;

  for (const r of result.resolvedStrikes) {
    const rig = r.attackerId === 'kronos' ? kronosRig : (findBruiserByDirectorId(r.attackerId) || {}).rig;
    if (rig && rig._activeAction && !rig._activeAction.paused) rig._activeAction.timeScale = 1.0;
    if (r.attackerId === 'kronos' && (r.attackType === 'bass_drop' || r.pattern === 'bass_drop')) {
      spawnBassDropShockwaveVisual();
      if (r.evaded) setStarburstText('BASS REBOUND!', 1.22);
    } else if (r.evaded && !r.countered) {
      floorDial.updateBadge('EVADED! FINISH [S]!', '#ffe042');
    }
  }
  if (gameState.kronosInRing) {
    applyKronosHpFloor('director');
    if (gameState.bossHp <= 0 && !gameState.isGameOver) {
      finishBossKo('K.O.! STAGE CLEAR!');
      return;
    }
  }

  gameState.takedownTokens = result.takedownTokens;
  gameState.feverMeter = result.feverMeter;

  const barSec = (chart && chart.barSec) || KRONOS_BAR_SEC;
  if (gameState.feverRushTimer > 0) {
    gameState.feverRushTimer = Math.max(0, gameState.feverRushTimer - dt);
    directorGrantFeverProgress(-100.0 * dt / (barSec * FEVER_RUSH_BARS), 'fever-drain');
    if (gameState.feverRushTimer <= 0) {
      floorDial.updateBadge('FEVER OVER', '#8899aa');
    }
  } else if (result.feverMeter >= 100.0) {
    gameState.feverRushTimer = barSec * FEVER_RUSH_BARS;
    gameState.feverActivations += 1;
    setStarburstText('FEVER RUSH!', 1.34);
    floorDial.updateBadge('FEVER RUSH! ×1.5 DAMAGE', '#ff3fb4');
    audioEngine.triggerCrowdHype('fever-rush', { combo: gameState.combo });
    if (!reducedMotionEnabled) cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.3);
  }
}

/**
 * Counter (F). Perfect: instant KO riposte on the attacker. Imperfect: strike negated, attacker dazed.
 * With no strike in its window the Challenger just guards for a beat.
 */
function executeCounterAction(nowSec, timing) {
  if (cooldownActive(gameState.lastCounterTime, nowSec, 0.22)) return;
  gameState.lastCounterTime = nowSec;
  const songTime = audioEngine.getSongTime();
  const chart = audioEngine.getActiveChart();

  if (gameState.isAttacking) {
    cancelActorSchedules(challengerRig);
    gameState.isAttacking = false;
    gameState.attackPhase = 'idle';
    gameState.pendingHit = null;
    gameState.inputBuffer = null;
  }
  gameState.counterAttempts += 1;

  const res = (DIRECTOR_ENABLED && songTime !== null)
    ? directorEvaluateCounterInput(songTime, 'counter', {
      chart,
      gameState,
      challengerRig,
      launchBruiserIntoStage,
      scheduleAction: (rig, clipName, t) => scheduleBeatWarpAction(rig, 'counter-riposte', t, {
        chart,
        clock: beatWarpClock,
        scheduleImpactSfx: false
      })
    })
    : { countered: false, grade: 'NONE' };

  if (res.countered) {
    const perfect = res.grade === 'PERFECT_COUNTER';
    if (perfect) gameState.perfectCounters += 1; else gameState.imperfectCounters += 1;
    if (gameState.kronosInRing) applyKronosHpFloor('counter');
    gameState.pose = 'counter';
    gameState.poseTimer = perfect ? 0.76 : 0.45;
    gameState.combo += 1;
    gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
    gameState.comboDecayTimer = TUNING.COMBO_DECAY_SEC;
    gameState.counterBonusTimer = 1.5;
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + (perfect ? 25.0 : 12.0));
    gameState.takedownTokens = res.takedownTokens !== undefined ? res.takedownTokens : gameState.takedownTokens;
    if (!perfect && challengerRig.clipDriven && challengerRig.playClip) {
      challengerRig.playClip('guard', { fadeInSec: 0.04, loop: false });
    }
    floorDial.updateBadge(perfect ? 'PERFECT COUNTER K.O.!' : 'COUNTER! FINISH [S]!', perfect ? '#ffe042' : '#00e5ff');
    setStarburstText(perfect ? 'PERFECT COUNTER!' : 'COUNTER!', perfect ? 1.28 : 1.08);
    audioEngine.playCombatSfx('counter-weave', perfect ? 'PERFECT' : 'GOOD', gameState.playerPos);
    if (!reducedMotionEnabled) {
      gameState.cameraKick = perfect ? 0.34 : 0.18;
      gameState.cameraDutch = perfect ? -0.045 : -0.02;
    }
    triggerCameraJuice('dodge', perfect, 0);
    if (perfect) {
      gameState.hitStopTimer = 0.09;
      if (postProcessing && postProcessing.triggerImpact) postProcessing.triggerImpact('COUNTER', challengerRig.root.position);
    }
    updateStyleRankAndHype(0);
  } else {
    gameState.pose = 'counter';
    gameState.poseTimer = 0.30;
    if (challengerRig.clipDriven && challengerRig.playClip) {
      challengerRig.playClip('guard', { fadeInSec: 0.05, loop: false });
    }
    floorDial.updateBadge('NOTHING TO COUNTER', '#8899aa');
    audioEngine.playCombatSfx('dodge', 'MISS', gameState.playerPos);
  }
  updateHudNumbers();
}

function triggerCombatAction(action, isBufferedDequeue = false) {
  if (gameState.isPaused || gameState.isGameOver) return;

  const nowSec = combatClockSec();
  const songTime = audioEngine.getSongTime();
  const timing = evaluateBeatWindow(songTime);

  const btnMap = { dodge: btnA, punch: btnS, kick: btnD, counter: btnF };
  if (btnMap[action]) {
    btnMap[action].classList.add('pressed');
    setTimeout(() => btnMap[action].classList.remove('pressed'), 100);
  }

  // 1. BALANCED DODGE / WEAVE (Key: A) — Cooldown > i-frames, Last-155ms Counter Window, No Heal, No Combo Increment
  if (action === 'dodge') {
    executeDodgeAction(nowSec, timing, isBufferedDequeue);
    return;
  }
  if (action === 'counter') {
    executeCounterAction(nowSec, timing);
    return;
  }

  // Finisher (S on a dazed enemy) and token takedown (D with a token on a standing enemy)
  const fTarget = gameState.priorityTargetCache || findBestCombatTarget(TUNING.AUTO_AIM_MAX_DIST + 0.4);
  const fObj = fTarget && fTarget.type === 'bruiser' ? fTarget.obj : null;
  const wantsFinisher = Boolean(action === 'punch' && fObj && fObj.active && (fObj.state === 'dazed' || fObj.isDazed) && fTarget.dist <= TUNING.AUTO_AIM_MAX_DIST + 0.4);
  const wantsTakedown = Boolean(action === 'kick' && fObj && fObj.active && gameState.takedownTokens >= 1 &&
    fObj.state !== 'dazed' && fObj.state !== 'ko' && fObj.state !== 'flying' && fTarget.dist <= TUNING.AUTO_AIM_MAX_DIST + 0.4);

  // 2. ATTACK BUFFERING & RECOVERY CANCELING
  if (gameState.isAttacking) {
    if (gameState.attackPhase === 'startup' || gameState.attackPhase === 'active') {
      gameState.inputBuffer = {
        action,
        timestamp: nowSec
      };
      return;
    } else if (gameState.attackPhase === 'recovery') {
      gameState.isAttacking = false;
      gameState.attackPhase = 'idle';
      gameState.inputBuffer = null;
    }
  }

  // 3. OFF-BEAT MISS CHECK (Phase 3 Dead as Disco: off-beat resets combo & increments missedPresses, but executes normal ×1.0 attack!)
  if (timing.grade === 'MISS') {
    gameState.missedPresses += 1;
    gameState.combo = 0;
    gameState.comboDecayTimer = 0;
    updateStyleRankAndHype(0);
    floorDial.updateBadge('OFF-BEAT ×0.6', '#ff385c');
    updateHudNumbers();
  }

  // 4. START REAL BEAT-WARPED ATTACK LIFECYCLE (Section 2.1 & 2.3)
  gameState.isAttacking = true;
  gameState.combatEngagementTimer = 0.85;
  gameState.attackStartPose = challengerBlender ? challengerBlender.getCurrentPoseDict() : null;

  let currentPunchStep = 0;
  let moveKey = 'kick';
  if (wantsFinisher) {
    moveKey = 'finisher';
    currentPunchStep = 2;
    gameState.pose = 'punch-uppercut';
    gameState.attackType = 'finisher';
    gameState.punchStep = 0;
    gameState.lastPunchTime = nowSec;
  } else if (action === 'punch') {
    if (!cooldownActive(gameState.lastPunchTime, nowSec, 0.85)) {
      gameState.punchStep = 0;
    }
    currentPunchStep = gameState.punchStep || 0;
    moveKey = currentPunchStep === 0 ? 'punch-jab' : (currentPunchStep === 1 ? 'punch-cross' : 'punch-uppercut');
    gameState.pose = moveKey;
    gameState.attackType = moveKey;
    gameState.punchStep = (currentPunchStep + 1) % 3;
    gameState.lastPunchTime = nowSec;
  } else {
    moveKey = 'kick';
    gameState.pose = 'kick';
    gameState.attackType = 'kick';
  }

  // BeatWarp (Dead as Disco): the clip starts on the press; its wind-up section is time-warped so the
  // impact frame lands on the next half-beat of the chart, and the recovery section is stretched to
  // end on the following grid line. Grading judges the press; the warp guarantees the hit lands in time.
  const chart = audioEngine.getActiveChart();
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
  const moveCfg = TUNING.MOVES[moveKey] || TUNING.MOVES['punch-jab'];
  let startupDur = moveCfg.startup;
  let activeDur = moveCfg.active;
  let recoveryDur = moveCfg.recovery;
  let targetImpactSongTime = null;
  let beatWarp = null;
  if (songTime !== null && challengerRig.clipDriven) {
    beatWarp = scheduleBeatWarpAction(challengerRig, MOVE_CLIP_NAMES[moveKey] || moveKey, songTime, {
      chart,
      clock: beatWarpClock,
      fromCancel: Boolean(isBufferedDequeue),
      hitStopSec: predictHitStopSec(action, currentPunchStep, timing.grade),
      scheduleImpactSfx: false
    });
    targetImpactSongTime = beatWarp.impactTime;
    startupDur = Math.max(0.008, targetImpactSongTime - songTime);
    recoveryDur = Math.max(0.080, beatWarp.recoveryEndTime - targetImpactSongTime - activeDur);
    gameState.lastBeatWarpSchedule = beatWarp;
  } else if (songTime !== null) {
    if (timing.onBeat && timing.targetBeatTime !== undefined && timing.targetBeatTime !== null) {
      targetImpactSongTime = timing.targetBeatTime;
      const timeToTarget = targetImpactSongTime - songTime;
      startupDur = Math.max(0.008, Math.min(TUNING.ON_BEAT_WINDOW_SEC, timeToTarget));
    } else if (timing.timeUntilBeat !== undefined) {
      startupDur = THREE.MathUtils.clamp(timing.timeUntilBeat, 0.030, 0.165);
      targetImpactSongTime = songTime + startupDur;
    }
    recoveryDur = Math.max(0.120, beatSec * 0.25);
  }
  const totalDur = startupDur + activeDur + recoveryDur;

  gameState.attackPhase = 'startup';
  gameState.attackTimer = 0;
  gameState.recoveryTimer = recoveryDur;
  gameState.poseTimer = totalDur;
  gameState.canCancel = false;
  gameState.phaseDurations = {
    startup: startupDur,
    active: activeDur,
    recovery: recoveryDur,
    total: totalDur,
    beatWarp
  };

  // Step/lunge toward target within reduced 1.85m auto-aim radius during wind-up
  const feverLunge = (gameState.feverRushTimer > 0 || wantsFinisher || wantsTakedown) ? 1.6 : 1.0;
  const targetInfo = findBestCombatTarget(
    (gameState.wave === 3 ? Math.max(TUNING.AUTO_AIM_MAX_DIST, 2.15) : TUNING.AUTO_AIM_MAX_DIST) * feverLunge
  );
  if (targetInfo && targetInfo.dist > 0.95) {
    const lungeDir = new THREE.Vector3().subVectors(targetInfo.pos, gameState.playerPos);
    lungeDir.y = 0;
    const lungeDist = Math.min(TUNING.MAX_LUNGE_DIST * feverLunge, Math.max(0, targetInfo.dist - 0.92));
    lungeDir.normalize().multiplyScalar(lungeDist);
    const nextTarget = gameState.playerPos.clone().add(lungeDir);
    nextTarget.y = 0;
    if (nextTarget.length() > TUNING.PLAYER_MAX_RADIUS) nextTarget.setLength(TUNING.PLAYER_MAX_RADIUS);
    gameState.playerTarget.copy(nextTarget);
  } else {
    gameState.playerTarget.copy(gameState.playerPos);
  }

  // Queue hit resolution for the ACTIVE phase (damage is NOT applied on key-down!)
  gameState.pendingHit = {
    resolved: false,
    isMiss: false,
    action,
    punchStep: currentPunchStep,
    moveKey,
    timing,
    pressSongTime: songTime,
    targetImpactSongTime,
    beatWarp,
    isFinisher: wantsFinisher,
    isTakedown: wantsTakedown
  };

  gameState.activeSmears.push(smearArcPool.acquire(challengerRig.root.position, action === 'kick'));
}

// ============================================================================
// 6. CONTINUOUS POSE BLENDER & SKELETAL ANIMATION SYSTEM
// ============================================================================
class ContinuousPoseBlender {
  constructor(rig, options = {}) {
    this.rig = rig;
    this.lambda = options.lambda !== undefined ? options.lambda : 26.0;
    this.omegaMax = options.omegaMax !== undefined ? options.omegaMax : 16.0;
    this.maxStepFloor = options.maxStepFloor !== undefined ? options.maxStepFloor : 0.25;
    this.controlRootYaw = options.controlRootYaw !== undefined ? options.controlRootYaw : true;
    this.controlHipsPos = options.controlHipsPos !== undefined ? options.controlHipsPos : true;
    // facingSign: -1 for Challenger (-Z rig), +1 for Bruisers and Kronos (+Z rigs)
    this.facingSign = options.facingSign !== undefined ? options.facingSign : -1;

    this.jointNames = [
      'leftArm', 'leftElbow', 'rightArm', 'rightElbow',
      'leftLeg', 'leftKnee', 'leftAnkle', 'rightLeg',
      'rightKnee', 'rightAnkle', 'torso', 'hips'
    ];
    this.auxJointNames = ['headGroup'];
    this.allJoints = [...this.jointNames, ...this.auxJointNames];

    this.current = {};
    this.target = {};
    this.currentHipsPos = new THREE.Vector3(0, 1.0, 0);
    this.targetHipsPos = new THREE.Vector3(0, 1.0, 0);
    this.currentRootYaw = -0.18;
    this.targetRootYaw = -0.18;

    this.initJoints();
  }

  initJoints() {
    for (let i = 0; i < this.allJoints.length; i++) {
      const j = this.allJoints[i];
      const node = this.rig[j];
      if (node && node.rotation) {
        this.current[j] = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z };
      } else {
        this.current[j] = { x: 0, y: 0, z: 0 };
      }
      this.target[j] = { ...this.current[j] };
    }
    this.enforceJointLimits(this.current);
    this.enforceJointLimits(this.target);
    if (this.rig.hips && this.rig.hips.position) {
      this.currentHipsPos.copy(this.rig.hips.position);
      this.targetHipsPos.copy(this.rig.hips.position);
    }
    if (this.rig.root && this.rig.root.rotation) {
      this.currentRootYaw = this.rig.root.rotation.y;
      this.targetRootYaw = this.rig.root.rotation.y;
    }
  }

  enforceJointLimits(stateMap) {
    if (!stateMap) return;
    if (this.facingSign < 0) {
      // -Z rig (Challenger): forward elbow flexion in [0, 1.65], backward knee flexion in [-1.65, 0]
      if (stateMap.leftElbow) stateMap.leftElbow.x = THREE.MathUtils.clamp(stateMap.leftElbow.x, 0.0, 1.65);
      if (stateMap.rightElbow) stateMap.rightElbow.x = THREE.MathUtils.clamp(stateMap.rightElbow.x, 0.0, 1.65);
      if (stateMap.leftKnee) stateMap.leftKnee.x = THREE.MathUtils.clamp(stateMap.leftKnee.x, -1.65, 0.0);
      if (stateMap.rightKnee) stateMap.rightKnee.x = THREE.MathUtils.clamp(stateMap.rightKnee.x, -1.65, 0.0);
    } else {
      // +Z rig (Bruisers, DJ Kronos): forward elbow flexion in [-1.65, 0], backward knee flexion in [0, 1.65]
      if (stateMap.leftElbow) stateMap.leftElbow.x = THREE.MathUtils.clamp(stateMap.leftElbow.x, -1.65, 0.0);
      if (stateMap.rightElbow) stateMap.rightElbow.x = THREE.MathUtils.clamp(stateMap.rightElbow.x, -1.65, 0.0);
      if (stateMap.leftKnee) stateMap.leftKnee.x = THREE.MathUtils.clamp(stateMap.leftKnee.x, 0.0, 1.65);
      if (stateMap.rightKnee) stateMap.rightKnee.x = THREE.MathUtils.clamp(stateMap.rightKnee.x, 0.0, 1.65);
    }
  }

  getCurrentPoseDict() {
    const out = {};
    for (let i = 0; i < this.allJoints.length; i++) {
      const j = this.allJoints[i];
      const cur = this.current[j];
      out[j] = cur ? [cur.x, cur.y, cur.z] : [0, 0, 0];
    }
    return out;
  }

  static wrapAngle(diff) {
    return ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  }

  setTargetPose(poseDict) {
    if (!poseDict) return;
    for (let i = 0; i < this.allJoints.length; i++) {
      const j = this.allJoints[i];
      const p = poseDict[j];
      if (p && this.target[j]) {
        if (Array.isArray(p)) {
          this.target[j].x = p[0];
          this.target[j].y = p[1];
          this.target[j].z = p[2];
        } else if (typeof p === 'object') {
          if (p.x !== undefined) this.target[j].x = p.x;
          if (p.y !== undefined) this.target[j].y = p.y;
          if (p.z !== undefined) this.target[j].z = p.z;
        }
      }
    }
    this.enforceJointLimits(this.target);
  }

  setTarget(poseDict) {
    this.setTargetPose(poseDict);
  }

  setTargetHipsPosition(x, y, z) {
    if (typeof x === 'object' && x !== null) {
      this.targetHipsPos.copy(x);
    } else {
      this.targetHipsPos.set(x, y, z);
    }
  }

  setTargetRootYaw(yaw) {
    this.targetRootYaw = yaw;
  }

  snapToPose(poseDict) {
    this.setTargetPose(poseDict);
    for (let i = 0; i < this.allJoints.length; i++) {
      const j = this.allJoints[i];
      if (this.current[j] && this.target[j]) {
        this.current[j].x = this.target[j].x;
        this.current[j].y = this.target[j].y;
        this.current[j].z = this.target[j].z;
      }
    }
    this.enforceJointLimits(this.current);
    this.applyToRig();
  }

  update(dt) {
    if (dt <= 0) return;
    const clampedDt = Math.min(dt, 0.1);
    const decayFactor = 1.0 - Math.exp(-this.lambda * clampedDt);
    const maxStep = Math.min(this.maxStepFloor, this.omegaMax * clampedDt);

    for (let i = 0; i < this.allJoints.length; i++) {
      const j = this.allJoints[i];
      const cur = this.current[j];
      const tgt = this.target[j];
      if (!cur || !tgt) continue;

      const dx = ContinuousPoseBlender.wrapAngle(tgt.x - cur.x);
      const dy = ContinuousPoseBlender.wrapAngle(tgt.y - cur.y);
      const dz = ContinuousPoseBlender.wrapAngle(tgt.z - cur.z);

      let sx = Math.abs(dx) < 1e-6 ? dx : dx * decayFactor;
      let sy = Math.abs(dy) < 1e-6 ? dy : dy * decayFactor;
      let sz = Math.abs(dz) < 1e-6 ? dz : dz * decayFactor;

      const stepMag = Math.hypot(sx, sy, sz);
      if (stepMag > maxStep && stepMag > 1e-6) {
        const scale = maxStep / stepMag;
        sx *= scale;
        sy *= scale;
        sz *= scale;
      }

      if (Math.abs(sx) > Math.abs(dx)) sx = dx;
      if (Math.abs(sy) > Math.abs(dy)) sy = dy;
      if (Math.abs(sz) > Math.abs(dz)) sz = dz;

      cur.x += sx;
      cur.y += sy;
      cur.z += sz;
    }

    const posAlpha = 1.0 - Math.exp(-18.0 * clampedDt);
    this.currentHipsPos.lerp(this.targetHipsPos, posAlpha);

    const yawDiff = ContinuousPoseBlender.wrapAngle(this.targetRootYaw - this.currentRootYaw);
    const maxYawStep = Math.min(0.25, 12.0 * clampedDt);
    let yawStep = yawDiff * (1.0 - Math.exp(-14.0 * clampedDt));
    if (Math.abs(yawStep) > maxYawStep) yawStep = Math.sign(yawStep) * maxYawStep;
    if (Math.abs(yawStep) > Math.abs(yawDiff)) yawStep = yawDiff;
    this.currentRootYaw += yawStep;

    this.enforceJointLimits(this.current);
    this.applyToRig();
  }

  /** Reads the rig's current joint rotations into the blender so it resumes from the clip's last pose. */
  syncCurrentFromRig() {
    for (let i = 0; i < this.allJoints.length; i++) {
      const j = this.allJoints[i];
      const node = this.rig[j];
      if (node && node.rotation && this.current[j]) {
        this.current[j].x = node.rotation.x;
        this.current[j].y = node.rotation.y;
        this.current[j].z = node.rotation.z;
      }
    }
    if (this.rig.hips && this.rig.hips.position) this.currentHipsPos.copy(this.rig.hips.position);
  }

  updateYawOnly(dt) {
    if (dt <= 0) return;
    const clampedDt = Math.min(dt, 0.1);
    const yawDiff = ContinuousPoseBlender.wrapAngle(this.targetRootYaw - this.currentRootYaw);
    const maxYawStep = Math.min(0.25, 12.0 * clampedDt);
    let yawStep = yawDiff * (1.0 - Math.exp(-14.0 * clampedDt));
    if (Math.abs(yawStep) > maxYawStep) yawStep = Math.sign(yawStep) * maxYawStep;
    if (Math.abs(yawStep) > Math.abs(yawDiff)) yawStep = yawDiff;
    this.currentRootYaw += yawStep;
    if (this.controlRootYaw && this.rig.root && this.rig.root.rotation) {
      this.rig.root.rotation.set(0, this.currentRootYaw, 0);
    }
  }

  applyToRig() {
    for (let i = 0; i < this.allJoints.length; i++) {
      const j = this.allJoints[i];
      const node = this.rig[j];
      const cur = this.current[j];
      if (node && node.rotation && cur) {
        node.rotation.set(cur.x, cur.y, cur.z);
      }
    }
    if (this.controlHipsPos && this.rig.hips && this.rig.hips.position) {
      this.rig.hips.position.copy(this.currentHipsPos);
    }
    if (this.controlRootYaw && this.rig.root && this.rig.root.rotation) {
      this.rig.root.rotation.set(0, this.currentRootYaw, 0);
    }
  }
}

const challengerBlender = new ContinuousPoseBlender(challengerRig, {
  lambda: 26.0,
  omegaMax: 16.0,
  maxStepFloor: 0.25,
  controlRootYaw: true,
  controlHipsPos: true,
  facingSign: -1
});

bruisers.forEach((b) => {
  b.blender = new ContinuousPoseBlender(b.rig, {
    lambda: 22.0,
    omegaMax: 16.0,
    maxStepFloor: 0.25,
    controlRootYaw: false,
    controlHipsPos: false,
    facingSign: 1
  });
});

const kronosBlender = new ContinuousPoseBlender(kronosRig, {
  lambda: 22.0,
  omegaMax: 16.0,
  maxStepFloor: 0.25,
  controlRootYaw: false,
  controlHipsPos: false,
  facingSign: 1
});
kronosRig.blender = kronosBlender;

const CHALLENGER_POSES = {
  idle: {
    hips: [-0.02, -0.14, 0], torso: [0.04, -0.10, 0.02], headGroup: [-0.02, 0.12, 0],
    leftArm: [0.65, -0.22, -0.40], leftElbow: [1.35, 0, 0],
    rightArm: [0.75, 0.22, 0.40], rightElbow: [1.30, 0, 0],
    leftLeg: [0.24, 0.14, -0.18], leftKnee: [-0.40, 0, 0], leftAnkle: [0.16, 0, 0.18],
    rightLeg: [-0.14, -0.14, 0.18], rightKnee: [-0.24, 0, 0], rightAnkle: [0.38, 0, -0.18]
  },
  'punch-jab': {
    chamber: {
      hips: [0.02, -0.08, 0], torso: [0.05, -0.04, 0], headGroup: [-0.02, 0.08, 0],
      leftArm: [0.82, -0.14, -0.28], leftElbow: [1.12, 0, 0],
      rightArm: [0.78, 0.24, 0.38], rightElbow: [1.38, 0, 0],
      leftLeg: [0.16, 0.10, -0.14], leftKnee: [-0.28, 0, 0], leftAnkle: [0.12, 0, 0.10],
      rightLeg: [-0.08, -0.10, 0.14], rightKnee: [-0.18, 0, 0], rightAnkle: [0.24, 0, -0.10]
    },
    apex: {
      hips: [0.06, -0.24, 0], torso: [0.08, -0.34, -0.04], headGroup: [-0.04, 0.26, 0],
      leftArm: [1.54, -0.06, -0.12], leftElbow: [0.08, 0, 0],
      rightArm: [0.82, 0.26, 0.36], rightElbow: [1.42, 0, 0],
      leftLeg: [0.08, 0.06, -0.12], leftKnee: [-0.14, 0, 0], leftAnkle: [0.06, 0, 0.06],
      rightLeg: [-0.18, -0.08, 0.16], rightKnee: [-0.12, 0, 0], rightAnkle: [0.22, 0, -0.08]
    }
  },
  'punch-cross': {
    chamber: {
      hips: [0.04, -0.26, 0], torso: [0.06, -0.32, 0.03], headGroup: [-0.02, 0.22, 0],
      leftArm: [0.92, -0.16, -0.26], leftElbow: [1.10, 0, 0],
      rightArm: [0.62, 0.28, 0.44], rightElbow: [1.42, 0, 0],
      leftLeg: [0.14, 0.08, -0.14], leftKnee: [-0.24, 0, 0], leftAnkle: [0.10, 0, 0.08],
      rightLeg: [-0.10, -0.12, 0.16], rightKnee: [-0.22, 0, 0], rightAnkle: [0.26, 0, -0.12]
    },
    apex: {
      hips: [0.10, 0.30, 0], torso: [0.12, 0.44, -0.05], headGroup: [-0.06, -0.34, 0],
      leftArm: [0.72, -0.24, -0.38], leftElbow: [1.42, 0, 0],
      rightArm: [1.56, 0.08, 0.14], rightElbow: [0.08, 0, 0],
      leftLeg: [0.22, 0.04, -0.12], leftKnee: [-0.18, 0, 0], leftAnkle: [0.06, 0, 0.04],
      rightLeg: [-0.24, 0.12, 0.18], rightKnee: [-0.10, 0, 0], rightAnkle: [0.30, 0, -0.08]
    }
  },
  'punch-uppercut': {
    chamber: {
      hips: [0.06, -0.24, 0.06], torso: [0.14, -0.30, 0.10], headGroup: [-0.04, 0.20, -0.04],
      leftArm: [0.74, -0.20, -0.36], leftElbow: [1.38, 0, 0],
      rightArm: [0.32, 0.18, 0.32], rightElbow: [1.52, 0, 0],
      leftLeg: [0.28, 0.08, -0.16], leftKnee: [-0.46, 0, 0], leftAnkle: [0.18, 0, 0.10],
      rightLeg: [-0.06, -0.10, 0.16], rightKnee: [-0.36, 0, 0], rightAnkle: [0.32, 0, -0.10]
    },
    apex: {
      hips: [-0.06, 0.28, -0.06], torso: [-0.12, 0.42, -0.10], headGroup: [0.06, -0.28, 0.04],
      leftArm: [0.68, -0.26, -0.42], leftElbow: [1.40, 0, 0],
      rightArm: [1.72, 0.12, 0.16], rightElbow: [0.68, 0, 0],
      leftLeg: [0.08, 0.04, -0.12], leftKnee: [-0.12, 0, 0], leftAnkle: [0.04, 0, 0.04],
      rightLeg: [-0.18, 0.10, 0.14], rightKnee: [-0.08, 0, 0], rightAnkle: [0.22, 0, -0.06]
    }
  },
  kick: {
    chamber: {
      hips: [-0.08, 0.18, 0.14], torso: [-0.06, 0.12, 0.10], headGroup: [0.02, -0.12, -0.04],
      leftArm: [0.58, -0.12, -0.42], leftElbow: [1.22, 0, 0],
      rightArm: [0.36, 0.16, 0.56], rightElbow: [1.05, 0, 0],
      leftLeg: [0.08, 0.14, -0.18], leftKnee: [-0.22, 0, 0], leftAnkle: [0.12, 0, 0.10],
      rightLeg: [1.18, -0.18, 0.38], rightKnee: [-1.15, 0, 0], rightAnkle: [0.25, 0, 0]
    },
    apex: {
      hips: [-0.16, 0.42, 0.28], torso: [-0.14, -0.22, 0.18], headGroup: [0.06, -0.18, -0.08],
      leftArm: [0.46, 0.12, -0.52], leftElbow: [1.05, 0, 0],
      rightArm: [-0.18, -0.14, 0.92], rightElbow: [0.48, 0, 0],
      leftLeg: [-0.10, 0.18, -0.22], leftKnee: [-0.14, 0, 0], leftAnkle: [0.08, 0, 0.08],
      rightLeg: [1.46, -0.24, 0.62], rightKnee: [-0.06, 0, 0], rightAnkle: [-0.35, 0, 0]
    }
  },
  dodge: {
    hips: [-0.18, 0.20, 0.38], torso: [0.22, -0.22, 0.18], headGroup: [0.10, -0.15, 0.12],
    leftArm: [0.85, 0.30, -0.35], leftElbow: [1.35, 0, 0],
    rightArm: [0.90, -0.25, 0.35], rightElbow: [1.30, 0, 0],
    leftLeg: [0.32, 0, -0.22], leftKnee: [-0.40, 0, 0], leftAnkle: [0, 0, 0],
    rightLeg: [-0.24, 0, 0.28], rightKnee: [-0.24, 0, 0], rightAnkle: [0, 0, 0]
  },
  hurt: {
    hips: [-0.14, 0.16, -0.08], torso: [-0.28, 0.22, -0.10], headGroup: [-0.22, -0.18, 0.08],
    leftArm: [0.42, 0.25, -0.52], leftElbow: [1.45, 0, 0],
    rightArm: [0.48, -0.25, 0.52], rightElbow: [1.42, 0, 0],
    leftLeg: [0.28, 0.10, -0.20], leftKnee: [-0.48, 0, 0], leftAnkle: [0.20, 0, 0.14],
    rightLeg: [-0.22, -0.10, 0.20], rightKnee: [-0.36, 0, 0], rightAnkle: [0.32, 0, -0.14]
  }
};

const _LERP_JOINT_LIST = [
  'leftArm', 'leftElbow', 'rightArm', 'rightElbow',
  'leftLeg', 'leftKnee', 'leftAnkle', 'rightLeg',
  'rightKnee', 'rightAnkle', 'torso', 'hips', 'headGroup'
];

function lerpPoseDict(pA, pB, t) {
  const result = {};
  for (let i = 0; i < _LERP_JOINT_LIST.length; i++) {
    const j = _LERP_JOINT_LIST[i];
    const a = pA[j] || [0, 0, 0];
    const b = pB[j] || a;
    result[j] = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }
  return result;
}

function ensureChallengerIdleClip(songTime) {
  const rig = challengerRig;
  if (!rig.clipDriven || !rig.playClip) return;
  if (rig._activeClipName === 'idle-dance' && rig._activeAction && rig._activeAction.isRunning()) return;
  const chart = audioEngine.getActiveChart();
  const barSec = (chart && chart.barSec) || KRONOS_BAR_SEC;
  const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  const clip = rig.clips ? rig.clips.get('idle-dance') : null;
  const clipDur = clip && clip.duration > 0 ? clip.duration : 2.6;
  // Start the two-bar groove at the song's current bar phase (Hi-Fi Rush rule), scaled to the bar length.
  const phase = (songTime !== null && barSec > 0)
    ? ((((songTime - firstOffset) % barSec) + barSec) % barSec) / barSec
    : 0;
  rig.playClip('idle-dance', {
    loop: true,
    fadeInSec: 0.14,
    startTime: phase * clipDur,
    timeScale: clipDur / barSec
  });
}

function poseChallengerClipDriven(rig, pose, elapsed, beatPulse, dt, rawDt) {
  challengerBlender.updateYawOnly(dt);
  if (gameState.debugFreezeClip) return; // debug: hold whatever clip frame was sampled
  if (gameState.isAttacking && gameState.phaseDurations) {
    const p = gameState.phaseDurations;
    const t = gameState.attackTimer;
    const startupEnd = p.startup || 0.065;
    const activeEnd = startupEnd + (p.active || 0.060);
    const total = p.total || (activeEnd + (p.recovery || 0.160));
    const isKick = gameState.pose === 'kick' || gameState.pose === 'showcase-kick';
    if (isKick && kickSmear.updateSweep) {
      if (t < startupEnd) {
        const tau = Math.min(1.0, Math.max(0.0, t / Math.max(0.001, startupEnd)));
        if (tau > 0.40) kickSmear.updateSweep((tau - 0.40) / 0.60 * 0.85, false, beatPulse);
        else kickSmear.smearGroup.visible = false;
      } else if (t < activeEnd) {
        kickSmear.updateSweep(1.0, false, beatPulse);
      } else {
        const tau = Math.min(1.0, Math.max(0.0, (t - activeEnd) / Math.max(0.001, total - activeEnd)));
        kickSmear.updateSweep(1.0 - Math.pow(1.0 - tau, 2.0), true, beatPulse);
      }
    } else {
      kickSmear.smearGroup.visible = false;
    }
    return;
  }
  kickSmear.smearGroup.visible = false;
  if (pose === 'hurt' || gameState.playerHitStunTimer > 0 || pose === 'dodge' || pose === 'counter') return;
  const songTime = audioEngine.getSongTime();
  // Beat-locked footwork: while the Challenger drifts, step clips plant on the half-beats.
  const prev = gameState._stepPrevPos || (gameState._stepPrevPos = gameState.playerPos.clone());
  const speed = dt > 0 ? prev.distanceTo(gameState.playerPos) / dt : 0;
  prev.copy(gameState.playerPos);
  if (songTime !== null && speed > 0.30 && !hasActiveScheduleFor(challengerRig)) {
    gameState._stepSide = !gameState._stepSide;
    scheduleBeatWarpAction(challengerRig, gameState._stepSide ? 'step-L' : 'step-R', songTime, {
      chart: audioEngine.getActiveChart(),
      clock: beatWarpClock,
      scheduleWhooshSfx: false,
      scheduleImpactSfx: false
    });
    return;
  }
  if (hasActiveScheduleFor(challengerRig)) return;
  ensureChallengerIdleClip(songTime);
}

function poseChallenger(rig, pose, elapsed, beatPulse, dt = 0.016, rawDt = dt) {
  const kneeBounce = beatPulse * 0.045;
  const breath = Math.sin(elapsed * 2.8) * 0.03;

  let targetYaw = -0.18;
  const targetInfo = gameState.priorityTargetCache;
  if (targetInfo && targetInfo.pos && (gameState.isAttacking || gameState.combatEngagementTimer > 0)) {
    const dx = targetInfo.pos.x - gameState.playerPos.x;
    const dz = targetInfo.pos.z - gameState.playerPos.z;
    targetYaw = Math.atan2(-dx, -dz);
    targetYaw = Math.max(-1.15, Math.min(1.15, targetYaw));
  }
  challengerBlender.setTargetRootYaw(targetYaw);

  if (challengerRig.clipDriven) {
    poseChallengerClipDriven(rig, pose, elapsed, beatPulse, dt, rawDt);
    return;
  }

  let targetJoints = null;
  let targetHipsY = 1.00;

  if (gameState.isAttacking && gameState.phaseDurations) {
    const p = gameState.phaseDurations;
    const t = gameState.attackTimer;
    const startupEnd = p.startup || 0.065;
    const activeEnd = startupEnd + (p.active || 0.060);
    const total = p.total || (activeEnd + (p.recovery || 0.160));

    const actKey = (gameState.pose === 'punch' || gameState.pose === 'punch-cross') ? 'punch-cross' :
      (gameState.pose === 'punch-jab' ? 'punch-jab' :
      (gameState.pose === 'punch-uppercut' ? 'punch-uppercut' :
      (gameState.pose === 'kick' || gameState.pose === 'showcase-kick' ? 'kick' : null)));

    if (actKey && CHALLENGER_POSES[actKey]) {
      const config = CHALLENGER_POSES[actKey];
      const idleConfig = CHALLENGER_POSES.idle;
      const startPose = gameState.attackStartPose || idleConfig;

      if (t < startupEnd) {
        const tau = Math.min(1.0, Math.max(0.0, t / Math.max(0.001, startupEnd)));
        if (tau < 0.40) {
          const u = tau / 0.40;
          const ease = u * u * (3.0 - 2.0 * u);
          targetJoints = lerpPoseDict(startPose, config.chamber, ease);
          targetHipsY = 1.00 - ease * (actKey === 'punch-uppercut' ? 0.07 : 0.03);
        } else {
          const u = (tau - 0.40) / 0.60;
          const ease = Math.sin(u * Math.PI * 0.5);
          targetJoints = lerpPoseDict(config.chamber, config.apex, ease);
          targetHipsY = 1.00 + (actKey === 'kick' ? 0.03 : (actKey === 'punch-uppercut' ? 0.06 : 0.01)) * ease;
        }
        if (actKey === 'kick' && tau > 0.40 && kickSmear.updateSweep) {
          kickSmear.updateSweep((tau - 0.40) / 0.60 * 0.85, false, beatPulse);
        } else {
          kickSmear.smearGroup.visible = false;
        }
      } else if (t < activeEnd) {
        // Hold full 100% apex extension on the beat & throughout active phase / hit-stop
        targetJoints = config.apex;
        targetHipsY = 1.00 + (actKey === 'kick' ? 0.03 : (actKey === 'punch-uppercut' ? 0.06 : 0.01));
        if (actKey === 'kick') {
          if (kickSmear.updateSweep) {
            kickSmear.updateSweep(1.0, false, beatPulse);
          } else {
            kickSmear.smearGroup.visible = true;
            kickSmear.arcMat.opacity = 0.92 + beatPulse * 0.08;
          }
        } else {
          kickSmear.smearGroup.visible = false;
        }
      } else {
        const tau = Math.min(1.0, Math.max(0.0, (t - activeEnd) / Math.max(0.001, total - activeEnd)));
        const ease = 1.0 - Math.pow(1.0 - tau, 2.0);
        targetJoints = lerpPoseDict(config.apex, idleConfig, ease);
        targetHipsY = 1.00 - (1.0 - ease) * 0.02;
        if (actKey === 'kick') {
          if (kickSmear.updateSweep) {
            kickSmear.updateSweep(ease, true, beatPulse);
          } else {
            kickSmear.arcMat.opacity = Math.max(0, 0.92 * (1.0 - ease));
            if (ease > 0.8) kickSmear.smearGroup.visible = false;
          }
        } else {
          kickSmear.smearGroup.visible = false;
        }
      }
    }
  }

  if (!targetJoints) {
    if (pose === 'hurt' || gameState.playerHitStunTimer > 0) {
      targetJoints = CHALLENGER_POSES.hurt;
      targetHipsY = 0.93;
      kickSmear.smearGroup.visible = false;
    } else if (pose === 'dodge' || pose === 'counter') {
      targetJoints = CHALLENGER_POSES.dodge;
      targetHipsY = 0.88;
      kickSmear.smearGroup.visible = false;
    } else {
      targetJoints = {
        hips: [-0.02, -0.14, 0],
        torso: [0.04 + breath, -0.10, 0.02],
        headGroup: [-0.02, 0.12, 0],
        leftLeg: [0.24, 0.14, -0.18],
        leftKnee: [-0.40 - kneeBounce, 0, 0],
        leftAnkle: [0.16, 0, 0.18],
        rightLeg: [-0.14, -0.14, 0.18],
        rightKnee: [-0.24 - kneeBounce, 0, 0],
        rightAnkle: [0.38, 0, -0.18],
        leftArm: [0.65, -0.22, -0.40],
        leftElbow: [1.35 + breath * 0.5, 0, 0],
        rightArm: [0.75, 0.22, 0.40],
        rightElbow: [1.30 + breath * 0.5, 0, 0]
      };
      targetHipsY = 1.00 - kneeBounce;
      kickSmear.smearGroup.visible = false;
    }
  }

  challengerBlender.setTargetPose(targetJoints);
  challengerBlender.setTargetHipsPosition(0, targetHipsY, 0);
  const blenderDt = (gameState.isAttacking && gameState.attackPhase === 'active' && gameState.hitStopTimer > 0)
    ? rawDt
    : dt;
  challengerBlender.update(blenderDt);
}

// ============================================================================
// 7. SHELL OVERLAYS, INPUT LISTENERS, VISIBILITY & ACCESSIBILITY CONTROLS
// ============================================================================
let _wasPlayingBeforePause = false;

function togglePause(forceState = null) {
  if (!gameState.gameStarted || gameState.isGameOver) return;
  const nextPaused = forceState !== null ? Boolean(forceState) : !gameState.isPaused;
  if (nextPaused === gameState.isPaused) return;
  gameState.isPaused = nextPaused;

  if (gameState.isPaused) {
    _wasPlayingBeforePause = audioEngine.isPlaying;
    audioEngine.pause();
    if (btnPlay) {
      btnPlay.classList.remove('playing');
      btnPlay.textContent = '▶ PLAY';
    }
    if (elPauseOverlay) elPauseOverlay.classList.remove('hidden');
  } else {
    if (elPauseOverlay) elPauseOverlay.classList.add('hidden');
    clock.getDelta();
    if (_wasPlayingBeforePause) {
      audioEngine.play().then((playing) => {
        if (btnPlay) {
          btnPlay.classList.toggle('playing', playing);
          btnPlay.textContent = playing ? '❚❚ PAUSE' : '▶ PLAY';
        }
      });
    }
  }
}

async function enterCypherFromStartOverlay() {
  gameState.gameStarted = true;
  gameState.isPaused = false;
  gameState.isGameOver = false;
  gameState.runStartTimeMs = performance.now();
  if (elStartOverlay) elStartOverlay.classList.add('hidden');
  clock.getDelta();
  const playing = await audioEngine.play();
  if (btnPlay) {
    btnPlay.classList.toggle('playing', playing);
    btnPlay.textContent = playing ? '❚❚ PAUSE' : '▶ PLAY';
  }
}

if (elBtnStartCypher) {
  const _startBtnText = elBtnStartCypher.textContent;
  elBtnStartCypher.disabled = true;
  elBtnStartCypher.textContent = 'LOADING MOVES…';
  setBootProgress('Loading authored fight clips…', 92);
  _clipPreloadPromise.then((clipCount) => preloadEnemyClips().then((enemyCounts) => {
    elBtnStartCypher.disabled = false;
    elBtnStartCypher.textContent = _startBtnText;
    const total = clipCount + (Array.isArray(enemyCounts) ? enemyCounts.reduce((a, b) => a + (b || 0), 0) : 0);
    setBootProgress(total > 0 ? `Arena Ready · ${total} fight clips · 92 BPM` : 'Arena Ready · 92 BPM Cypher Loaded', 100);
  }));
  elBtnStartCypher.addEventListener('click', () => {
    enterCypherFromStartOverlay();
  });
}

const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume-cypher') || document.getElementById('btn-resume');
const btnRestart = document.getElementById('btn-restart');
const btnPauseRestart = document.getElementById('btn-pause-restart');
const btnResultsRestart = document.getElementById('btn-results-restart');

if (btnPause) btnPause.addEventListener('click', () => togglePause());
if (btnResume) btnResume.addEventListener('click', () => togglePause(false));
if (btnRestart) btnRestart.addEventListener('click', () => restartGame({ fromUserGesture: true }));
if (btnPauseRestart) btnPauseRestart.addEventListener('click', () => restartGame({ fromUserGesture: true }));
if (btnResultsRestart) btnResultsRestart.addEventListener('click', () => restartGame({ fromUserGesture: true }));

const btnReducedMotion = document.getElementById('btn-reduced-motion');
function updateReducedMotionPill() {
  if (!btnReducedMotion) return;
  btnReducedMotion.textContent = reducedMotionEnabled ? 'MOTION: REDUCED' : 'MOTION: FULL';
  btnReducedMotion.setAttribute('aria-pressed', String(reducedMotionEnabled));
  btnReducedMotion.classList.toggle('active', reducedMotionEnabled);
}
updateReducedMotionPill();
if (btnReducedMotion) {
  btnReducedMotion.addEventListener('click', () => {
    reducedMotionEnabled = !reducedMotionEnabled;
    window.__kronosReducedMotion = reducedMotionEnabled;
    updateReducedMotionPill();
  });
}

const btnMute = document.getElementById('btn-mute');
const volumeSlider = document.getElementById('volume-slider');
if (btnMute) {
  btnMute.addEventListener('click', () => {
    const muted = audioEngine.toggleMute();
    btnMute.textContent = muted ? 'MUTE' : 'VOL';
    btnMute.setAttribute('aria-pressed', String(muted));
  });
}
if (volumeSlider) {
  volumeSlider.addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    audioEngine.setVolume(v);
    if (btnMute) {
      btnMute.textContent = audioEngine.isMuted ? 'MUTE' : 'VOL';
      btnMute.setAttribute('aria-pressed', String(audioEngine.isMuted));
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (gameState.gameStarted && !gameState.isGameOver && !gameState.isPaused) {
      togglePause(true);
    } else if (audioEngine.isPlaying) {
      audioEngine.pause();
      if (btnPlay) {
        btnPlay.classList.remove('playing');
        btnPlay.textContent = '▶ PLAY';
      }
    }
  } else {
    clock.getDelta();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'p' || k === 'escape') {
    togglePause();
    return;
  }
  if (k === 'm') {
    if (btnMute) btnMute.click();
    return;
  }
  if (k === 'r') {
    restartGame({ fromUserGesture: true });
    return;
  }
  if (k === 'c') {
    resetCameraToOrbit();
    return;
  }
  if (k === ' ') {
    e.preventDefault();
    if (!gameState.gameStarted && elBtnStartCypher) {
      enterCypherFromStartOverlay();
    } else if (btnPlay) {
      btnPlay.click();
    }
    return;
  }
  if (!gameState.gameStarted && elStartOverlay && !elStartOverlay.classList.contains('hidden')) {
    gameState.gameStarted = true;
    gameState.runStartTimeMs = performance.now();
    elStartOverlay.classList.add('hidden');
  }
  if (k === 'a') triggerCombatAction('dodge');
  else if (k === 's') triggerCombatAction('punch');
  else if (k === 'd') triggerCombatAction('kick');
  else if (k === 'f') triggerCombatAction('counter');
});

[
  { el: btnA, act: 'dodge' },
  { el: btnF, act: 'counter' },
  { el: btnS, act: 'punch' },
  { el: btnD, act: 'kick' }
].forEach(({ el, act }) => {
  if (!el) return;
  let lastActionTime = 0;
  let lastPointerTime = 0;

  const triggerAction = (e) => {
    if (e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    const now = performance.now();
    const minDebounce = act === 'dodge' ? (TUNING.DODGE_COOLDOWN_SEC * 1000) : 140;
    if (now - lastActionTime < minDebounce) return;
    lastActionTime = now;
    if (!gameState.gameStarted && elStartOverlay) {
      gameState.gameStarted = true;
      gameState.runStartTimeMs = performance.now();
      elStartOverlay.classList.add('hidden');
    }
    triggerCombatAction(act);
  };

  el.addEventListener('pointerdown', (e) => {
    lastPointerTime = performance.now();
    triggerAction(e);
  });

  el.addEventListener('click', (e) => {
    const now = performance.now();
    if (now - lastPointerTime < 350) {
      if (e) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    triggerAction(e);
  });
});

const btnResetCam = document.getElementById('btn-reset-cam');
if (btnResetCam) {
  btnResetCam.addEventListener('click', () => resetCameraToOrbit());
  btnResetCam.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    resetCameraToOrbit();
  });
}

document.querySelectorAll('.cam-pill[data-mode]').forEach((pill) => {
  const mode = pill.dataset.mode;
  pill.addEventListener('click', () => setCameraPreset(mode));
  pill.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setCameraPreset(mode);
  });
});

function onPointerDown(e) {
  if (e.target.closest('button, a, input, .top-right-dock, .top-left-hud, .bottom-right-arcade-deck, .interactive-dock, .kronos-modal-overlay')) {
    return;
  }
  cameraState.isDragging = true;
  cameraState.prevPointer = { x: e.clientX, y: e.clientY };
}

function onPointerMove(e) {
  if (!cameraState.isDragging) return;
  const dx = (e.clientX - cameraState.prevPointer.x) * 0.005;
  const dy = (e.clientY - cameraState.prevPointer.y) * 0.005;
  cameraState.prevPointer = { x: e.clientX, y: e.clientY };

  cameraState.mode = 'custom';
  document.querySelectorAll('.cam-pill').forEach((p) => p.classList.remove('active'));

  const offset = new THREE.Vector3().subVectors(cameraState.targetPos, cameraState.orbitCenter);
  cameraState.spherical.setFromVector3(offset);
  cameraState.spherical.theta -= dx;
  cameraState.spherical.phi = Math.max(0.12, Math.min(Math.PI * 0.48, cameraState.spherical.phi - dy));

  offset.setFromSpherical(cameraState.spherical);
  cameraState.targetPos.copy(cameraState.orbitCenter).add(offset);
  cameraState.targetLookAt.copy(cameraState.orbitCenter);
}

function onPointerUp() {
  cameraState.isDragging = false;
}

function onWheel(e) {
  const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
  const offset = new THREE.Vector3().subVectors(cameraState.targetPos, cameraState.targetLookAt);
  const newDist = offset.length() * zoomFactor;
  if (newDist >= 3.0 && newDist <= 28.0) {
    offset.setLength(newDist);
    cameraState.targetPos.copy(cameraState.targetLookAt).add(offset);
    if (cameraState.mode !== 'custom') {
      cameraState.mode = 'custom';
      document.querySelectorAll('.cam-pill').forEach((p) => p.classList.remove('active'));
    }
  }
}

window.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
window.addEventListener('wheel', onWheel, { passive: true });
function syncViewportResize() {
  const w = Math.max(1, Math.floor(window.innerWidth || _lastCanvasW || 1280));
  const h = Math.max(1, Math.floor(window.innerHeight || _lastCanvasH || 800));
  const isPhone = w <= 600 || IS_LOW_TIER;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(isPhone ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = !isPhone;
  renderer.setSize(w, h);
  renderer.getSize(_rendererSizeVec);
  _lastCanvasW = Math.max(1, Math.floor(_rendererSizeVec.x || w));
  _lastCanvasH = Math.max(1, Math.floor(_rendererSizeVec.y || h));
  if (postProcessing && postProcessing.onResize) {
    postProcessing.onResize(_lastCanvasW, _lastCanvasH);
  }
}
window.addEventListener('resize', syncViewportResize);

let activeBarIdx = -1;
function refreshTrackReadoutOnSwitch() {
  const chart = audioEngine.getActiveChart();
  activeBarIdx = -1;
  if (elTempoReadout) {
    elTempoReadout.textContent = `${chart.bpm || 92} BPM`;
  }
  if (!audioEngine.isPlaying) {
    if (elLyricSection) elLyricSection.textContent = '';
    if (elLyricLine) elLyricLine.textContent = '';
  }
}

if (btnPlay) {
  btnPlay.addEventListener('click', async () => {
    if (!gameState.gameStarted && elStartOverlay) {
      gameState.gameStarted = true;
      gameState.runStartTimeMs = performance.now();
      elStartOverlay.classList.add('hidden');
    }
    const playing = await audioEngine.toggle();
    btnPlay.classList.toggle('playing', playing);
    btnPlay.textContent = playing ? '❚❚ PAUSE' : '▶ PLAY';
    if (!playing) {
      refreshTrackReadoutOnSwitch();
    }
  });
}

document.querySelectorAll('#track-pills .pill-btn[data-track]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('#track-pills .pill-btn[data-track]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const playing = await audioEngine.selectTrack(btn.dataset.track);
    refreshTrackReadoutOnSwitch();
    if (!playing && btnPlay) {
      btnPlay.click();
    }
  });
});

const btnLoadFlow = document.getElementById('btn-load-flow');
const flowFileInput = document.getElementById('flow-file-input');
if (btnLoadFlow && flowFileInput) {
  btnLoadFlow.addEventListener('click', () => flowFileInput.click());
  flowFileInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const customChart = await audioEngine.loadCustomFile(file);
      if (customChart && btnLoadFlow) {
        btnLoadFlow.textContent = `${customChart.bpm} BPM`;
      }
      refreshTrackReadoutOnSwitch();
      if (!audioEngine.isPlaying && btnPlay) btnPlay.click();
    }
  });
}

// Initialize Wave 1 and zeroed HUD
spawnWave(1);
updateHudNumbers();

// ============================================================================
// 8. MODULAR 60FPS UPDATE PIPELINE (updatePlayer / updateFighterFSM / updateVFX / updateCamera)
// ============================================================================
const RADIAL_SLOTS = [
  { angle: 0, radius: 1.75 },
  { angle: Math.PI / 3, radius: 1.85 },
  { angle: (2 * Math.PI) / 3, radius: 1.95 },
  { angle: Math.PI, radius: 1.88 },
  { angle: (4 * Math.PI) / 3, radius: 1.95 },
  { angle: (5 * Math.PI) / 3, radius: 1.85 }
];

function updatePlayer(dt, rawDt, elapsed, beatPulse) {
  if (gameState.dodgeInvulnTimer > 0) gameState.dodgeInvulnTimer = Math.max(0, gameState.dodgeInvulnTimer - dt);
  if (gameState.counterBonusTimer > 0) gameState.counterBonusTimer = Math.max(0, gameState.counterBonusTimer - dt);
  if (gameState.playerHitStunTimer > 0) gameState.playerHitStunTimer = Math.max(0, gameState.playerHitStunTimer - dt);

  // Attack lifecycle. With a BeatWarp schedule the phases follow song time (impact on the warped
  // impact frame, cancel window at the clip's cancelFrom, end on the quantized recovery end);
  // without one they follow the per-move startup/active/recovery timers.
  if (gameState.isAttacking) {
    gameState.attackTimer += dt;
    const p = gameState.phaseDurations;
    const startupEnd = p.startup || 0.065;
    const activeDur = p.active || 0.060;
    const activeEnd = startupEnd + activeDur;
    const impactApexTime = startupEnd;
    const total = p.total || (activeEnd + (p.recovery || 0.160));
    const curSongTime = audioEngine.getSongTime();
    const pending = gameState.pendingHit;
    const hasSongTarget = Boolean(
      curSongTime !== null &&
      pending &&
      !pending.resolved &&
      pending.targetImpactSongTime !== null &&
      pending.targetImpactSongTime !== undefined &&
      (pending.pressSongTime === null || pending.pressSongTime === undefined || Math.abs(curSongTime - pending.pressSongTime) > 1e-6)
    );
    const reachedTargetBeat = hasSongTarget && (curSongTime >= pending.targetImpactSongTime - 1e-6);
    const bw = p.beatWarp || null;

    let phase;
    if (bw && curSongTime !== null) {
      if (pending && !pending.resolved && !reachedTargetBeat) phase = 'startup';
      else if (curSongTime < bw.cancelReadyTime - 1e-6) phase = 'active';
      else if (curSongTime < bw.recoveryEndTime - 1e-6) phase = 'recovery';
      else phase = 'done';
    } else if ((hasSongTarget && !reachedTargetBeat) || (!hasSongTarget && gameState.attackTimer < startupEnd)) {
      phase = 'startup';
    } else if (gameState.attackTimer < activeEnd) {
      phase = 'active';
    } else if (gameState.attackTimer < total) {
      phase = 'recovery';
    } else {
      phase = 'done';
    }

    if (phase !== 'startup' && pending && !pending.resolved && (bw || reachedTargetBeat || !hasSongTarget || gameState.attackTimer >= impactApexTime)) {
      resolveActivePhaseAttack(pending);
    }

    if (phase === 'startup') {
      gameState.attackPhase = 'startup';
      gameState.canCancel = false;
    } else if (phase === 'active') {
      gameState.attackPhase = 'active';
      gameState.canCancel = false;
    } else if (phase === 'recovery') {
      gameState.attackPhase = 'recovery';
      gameState.canCancel = true;

      if (gameState.inputBuffer) {
        const nowSec = combatClockSec();
        if (cooldownActive(gameState.inputBuffer.timestamp, nowSec, TUNING.INPUT_BUFFER_WINDOW_SEC) || gameState.inputBuffer.timestamp > nowSec) {
          const act = gameState.inputBuffer.action;
          gameState.inputBuffer = null;
          gameState.isAttacking = false;
          gameState.attackPhase = 'idle';
          triggerCombatAction(act, true);
        } else {
          gameState.inputBuffer = null;
        }
      }
      // Hold position through recovery: no slide back to the base mark between hits.
    } else {
      if (gameState.pendingHit && !gameState.pendingHit.resolved) {
        resolveActivePhaseAttack(gameState.pendingHit);
      }
      gameState.isAttacking = false;
      gameState.attackPhase = 'idle';
      gameState.pendingHit = null;
      gameState.canCancel = false;
      gameState.pose = 'idle';
      if (gameState.combatEngagementTimer > 0 || isEnemyWithinStrikingRange(TUNING.ACTIVE_HIT_MAX_DIST)) {
        gameState.playerTarget.copy(gameState.playerPos);
      } else {
        gameState.playerTarget.copy(gameState.basePos);
      }
    }
  }

  if (gameState.poseTimer > 0) {
    gameState.poseTimer -= dt;
    if (gameState.poseTimer <= 0 && !gameState.isAttacking) {
      gameState.pose = 'idle';
      if (gameState.combatEngagementTimer > 0 || isEnemyWithinStrikingRange(TUNING.ACTIVE_HIT_MAX_DIST)) {
        gameState.playerTarget.copy(gameState.playerPos);
      } else {
        gameState.playerTarget.copy(gameState.basePos);
      }
    }
  }

  if (gameState.combatEngagementTimer > 0) {
    gameState.combatEngagementTimer = Math.max(0, gameState.combatEngagementTimer - dt);
    if (gameState.combatEngagementTimer <= 0 && !gameState.isAttacking && gameState.pose === 'idle') {
      if (!isEnemyWithinStrikingRange(TUNING.ACTIVE_HIT_MAX_DIST)) {
        gameState.playerTarget.copy(gameState.basePos);
      } else {
        gameState.playerTarget.copy(gameState.playerPos);
      }
    }
  }

  gameState.playerPos.lerp(gameState.playerTarget, Math.min(1.0, dt * 12));
  if (gameState.pose === 'idle' && gameState.playerPos.distanceTo(gameState.basePos) < 0.005) {
    gameState.playerPos.copy(gameState.basePos);
  }
  challengerRig.root.position.copy(gameState.playerPos);

  if (floorDial && floorDial.dialGroup) {
    floorDial.dialGroup.position.x = gameState.playerPos.x;
    floorDial.dialGroup.position.z = gameState.playerPos.z;
    floorDial.dialGroup.position.y = 0.025;
  }

  poseChallenger(challengerRig, gameState.pose, elapsed, beatPulse, dt, rawDt);
  if (challengerRig.clipDriven && challengerRig.update && !gameState.debugFreezeClip) {
    challengerRig.update(dt);
  }
}

function quantizeWindupToBeat(songTime, chart, beatsAhead = 1.0, strikeDur = 0.0) {
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  if (songTime === null || songTime === undefined) {
    return { canStart: true, windupDur: Math.max(0.20, beatSec * beatsAhead - strikeDur), targetImpactSongTime: null };
  }
  const beatFloat = (songTime - firstOffset) / beatSec;
  const nextIntBeat = Math.ceil(beatFloat);
  const timeToNextBeat = (nextIntBeat - beatFloat) * beatSec;
  const nearBeat = timeToNextBeat <= 0.075 || (beatSec - timeToNextBeat) <= 0.075;
  const startBeat = nearBeat
    ? (timeToNextBeat <= 0.075 ? nextIntBeat : (nextIntBeat - 1))
    : Math.round(beatFloat);
  const targetDownbeat = Math.max(nextIntBeat, startBeat + Math.max(1, Math.round(beatsAhead)));
  const targetImpactSongTime = firstOffset + targetDownbeat * beatSec;
  const totalTelegraphDur = Math.max(beatSec * 0.65, targetImpactSongTime - songTime);
  const exactWindupDur = Math.max(0.16, totalTelegraphDur - strikeDur);
  return { canStart: nearBeat, windupDur: exactWindupDur, targetImpactSongTime };
}

function recordEnemyStrikeEvent(type, songTime, chart) {
  if (songTime === null || songTime === undefined) return;
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  const beatFloat = (songTime - firstOffset) / beatSec;
  const nearestBeatIdx = Math.round(beatFloat);
  const deltaMs = Number((Math.abs(beatFloat - nearestBeatIdx) * beatSec * 1000).toFixed(2));
  gameState.enemyStrikeEvents.push({
    type,
    songTime: Number(songTime.toFixed(4)),
    nearestBeatDeltaMs: deltaMs,
    onBeatMarker: deltaMs <= 25.0
  });
}

function applyPlayerDamage(dmg, hitWord, kickAmt = 0.28, dutchAmt = 0.04) {
  gameState.playerHp = Math.max(0, gameState.playerHp - dmg);
  gameState.combo = 0;
  gameState.comboDecayTimer = 0;
  gameState.playerHitStunTimer = 0.150;
  gameState.isAttacking = false;
  gameState.attackPhase = 'idle';
  gameState.pendingHit = null;
  gameState.inputBuffer = null;
  gameState.pose = 'hurt';
  gameState.poseTimer = 0.150;
  // A hit-react drops the attack outright (Dead as Disco), it is never rescheduled.
  cancelActorSchedules(challengerRig);
  if (challengerRig.clipDriven && challengerRig.playClip) {
    challengerRig.playClip(dmg >= 18 ? 'hurt-heavy' : 'hurt-light', { fadeInSec: 0.04, loop: false });
    gameState.poseTimer = dmg >= 18 ? 0.30 : 0.20;
  }
  if (!reducedMotionEnabled) {
    gameState.cameraKick = kickAmt;
    gameState.cameraDutch = dutchAmt;
  }
  triggerDamageFlash();
  floorDial.updateBadge('HIT! DODGE [A]!', '#ff1e38');
  setStarburstText(hitWord, 1.12);
  updateHudNumbers();
  if (gameState.playerHp <= 0) {
    triggerGameEnd(false);
  }
}

function updateBruiserBadgeAndFlying(b, dt) {
  const idx = b.idx;
  if (b.badge && b.badge.mesh) {
    b.badge.mesh.lookAt(camera.position);
    if (b.state !== 'ko' && b.state !== 'flying') {
      let closeNeighbor = null;
      let minD = 999;
      for (let i = 0; i < bruisers.length; i++) {
        const other = bruisers[i];
        if (other === b || !other.active || other.state === 'ko' || other.state === 'flying') continue;
        const dx = b.rig.root.position.x - other.rig.root.position.x;
        const dz = b.rig.root.position.z - other.rig.root.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.4 && dist < minD) {
          minD = dist;
          closeNeighbor = other;
        }
      }
      const isTelegraph = b.state === 'windup' || b.state === 'striking';
      let targetY = 2.18;
      let targetRenderOrder = 10;
      if (closeNeighbor) {
        const neighborTelegraph = closeNeighbor.state === 'windup' || closeNeighbor.state === 'striking';
        if (isTelegraph && !neighborTelegraph) { targetY = 2.42; targetRenderOrder = 30; }
        else if (!isTelegraph && neighborTelegraph) { targetY = 2.08; targetRenderOrder = 10; }
        else if (idx > closeNeighbor.idx) { targetY = 2.42; targetRenderOrder = 20; }
        else { targetY = 2.08; targetRenderOrder = 10; }
      } else if (isTelegraph) {
        targetY = 2.42; targetRenderOrder = 25;
      }
      b.badge.mesh.position.y = THREE.MathUtils.lerp(b.badge.mesh.position.y, targetY, Math.min(1.0, dt * 10));
      b.badge.mesh.renderOrder = targetRenderOrder;
    }
  }

  if (b.state === 'flying' && b.flying) {
    b.flying.t += dt / b.flying.duration;
    const u = Math.min(1.0, b.flying.t);
    b.rig.root.position.lerpVectors(b.flying.startPos, b.flying.targetPos, u);
    b.rig.root.position.y = Math.sin(u * Math.PI) * 3.6 + u * 2.2;
    b.rig.root.rotation.x += dt * 14.0;
    b.rig.root.rotation.z += dt * 8.0;
    if (b.blender) b.blender.update(dt);

    if (u >= 1.0) {
      b.state = 'ko';
      b.active = false;
      b.hp = 0;
      b.rig.root.visible = false;
      b.flying = null;
      if (!reducedMotionEnabled) gameState.cameraKick = 0.45;
      setStarburstText('SPEAKERBOX K.O.!', 1.25);
      floorDial.updateBadge('STAGE K.O.!', '#ffe042');
      audioEngine.playCombatSfx('stage-ko', 'PERFECT', b.rig.root.position);
      if (postProcessing && postProcessing.triggerImpact) {
        postProcessing.triggerImpact('KO', b.rig.root.position);
      }
      gameState.hype = Math.min(100.0, (gameState.hype || 0) + 15.0);
      updateHudNumbers();
    }
    return true;
  }
  return false;
}

function updateBruiserMicroShake(b, rawDt) {
  if (gameState.hitStopTimer <= 0 || !b.isMicroShaking) {
    if (b.isMicroShaking && gameState.hitStopTimer <= 0) {
      b.isMicroShaking = false;
      b.microShakeTimer = 0;
      b.rig.hips.position.x = 0;
      b.rig.hips.position.z = 0;
      if (b.state !== 'hit') b.rig.hips.position.y = 1.0;
    }
  } else if (b.microShakeTimer > 0) {
    b.microShakeTimer -= rawDt;
    if (b.microShakeTimer <= 0) {
      b.isMicroShaking = false;
      b.rig.hips.position.x = 0;
      b.rig.hips.position.z = 0;
    } else {
      const t = b.microShakeDuration - b.microShakeTimer;
      const decay = Math.exp(-22.0 * t);
      const latShake = b.microShakeAmp * decay * Math.sin(2 * Math.PI * 50.0 * t);
      const vertShake = b.microShakeVertAmp * decay * Math.sin(2 * Math.PI * 50.0 * t + Math.PI * 0.5);
      if (b.microShakeNormal) {
        b.rig.hips.position.x = b.microShakeNormal.x * latShake;
        b.rig.hips.position.z = b.microShakeNormal.z * latShake;
      }
      b.rig.hips.position.y += vertShake;
    }
  }
}

function updateBruiserHitStunGuardBreakState(b, dt, elapsed) {
  if (b.state === 'hit') {
    b.stateTimer -= dt;
    const progress = Math.max(0, b.stateTimer / (b.recoilTotalTimer || 0.35));
    const ease = Math.sin(progress * Math.PI * 0.5);
    const torsoTgt = b.targetTorsoRot ? [b.targetTorsoRot.x * ease, b.targetTorsoRot.y * ease, b.targetTorsoRot.z * ease] : [-0.32 * ease, 0, 0];
    const headTgt = b.targetHeadRot ? [b.targetHeadRot.x * ease, b.targetHeadRot.y * ease, b.targetHeadRot.z * ease] : [0, 0, 0];
    if (b.blender) {
      b.blender.setTarget({
        torso: torsoTgt, headGroup: headTgt,
        leftArm: [-0.4 * ease, 0, -0.5 * ease], rightArm: [-0.4 * ease, 0, 0.5 * ease],
        leftElbow: [-0.6 * ease, 0, 0], rightElbow: [-0.6 * ease, 0, 0],
        leftLeg: [-0.15 * ease, 0, 0], rightLeg: [-0.15 * ease, 0, 0],
        leftKnee: [0.08, 0, 0], rightKnee: [0.08, 0, 0]
      });
    }
    if (b.verticalVelocity) {
      b.rig.hips.position.y += b.verticalVelocity * dt;
      b.verticalVelocity -= 14.0 * dt;
      if (b.rig.hips.position.y <= 1.0) { b.rig.hips.position.y = 1.0; b.verticalVelocity = 0; }
    } else {
      b.rig.hips.position.y = 1.0 - 0.04 * ease;
    }
    if (b.velocity && b.velocity.lengthSq() > 0.001) {
      b.rig.root.position.addScaledVector(b.velocity, dt);
      b.velocity.multiplyScalar(Math.exp(-12.0 * dt));
    }
    if (b.stateTimer <= 0) {
      b.state = 'stalking';
      b.recoilType = 'none';
      b.isMicroShaking = false;
      b.verticalVelocity = 0;
      b.rig.hips.position.x = 0;
      b.rig.hips.position.z = 0;
      b.badge.update(b.hp, b.maxHp, 'stalking');
    }
  } else if (b.state === 'stunned') {
    b.stateTimer -= dt;
    b.rig.hips.position.y = 0.92 + Math.sin(elapsed * 8) * 0.04;
    if (b.blender) {
      b.blender.setTarget({
        torso: [0.22, Math.sin(elapsed * 10) * 0.25, 0],
        headGroup: [0.10, Math.sin(elapsed * 8) * 0.15, 0],
        leftArm: [-0.2, 0, -0.35], rightArm: [-0.2, 0, 0.35],
        leftElbow: [-0.35, 0, 0], rightElbow: [-0.35, 0, 0],
        leftLeg: [-0.10, 0, 0], rightLeg: [-0.10, 0, 0],
        leftKnee: [0.12, 0, 0], rightKnee: [0.12, 0, 0]
      });
    }
    if (b.stateTimer <= 0) {
      b.state = 'stalking';
      b.attackCooldown = 1.6;
      b.badge.update(b.hp, b.maxHp, 'stalking');
    }
  } else if (b.state === 'guard_break') {
    b.stateTimer -= dt;
    b.isGuarding = false;
    b.rig.hips.position.y = 0.92 + Math.sin(elapsed * 12.0) * 0.04;
    if (b.blender) {
      b.blender.setTarget({
        torso: [-0.25, Math.sin(elapsed * 8.0) * 0.15, 0], headGroup: [-0.20, 0, 0],
        leftArm: [0.35, 0, -0.45], leftElbow: [-0.20, 0, 0],
        rightArm: [0.35, 0, 0.45], rightElbow: [-0.20, 0, 0],
        leftLeg: [-0.15, 0, 0], rightLeg: [-0.15, 0, 0],
        leftKnee: [0.14, 0, 0], rightKnee: [0.14, 0, 0]
      });
    }
    if (b.stateTimer <= 0) {
      b.state = 'stalking';
      b.attackCooldown = 1.8;
      b.guardCooldown = 4.5;
      b.badge.update(b.hp, b.maxHp, 'stalking');
    }
  }
}

function updateBruiserWindupState(b, dt, elapsed, songTime) {
  const strikeDur = (b.attackType === 'quick_hook' || b.attackType === 'double_tap') ? 0.18 : 0.22;
  if (songTime !== null && songTime !== undefined && b.targetImpactSongTime) {
    b.stateTimer = (b.targetImpactSongTime - strikeDur) - songTime;
  } else {
    b.stateTimer -= dt;
  }
  b.isGuarding = false;
  const toPlayer = new THREE.Vector3().subVectors(gameState.playerPos, b.rig.root.position);
  toPlayer.y = 0;
  const dist = toPlayer.length();
  const isCharge = b.attackPattern === 'charge';
  if (dist > (isCharge ? 1.05 : 1.38)) {
    toPlayer.normalize().multiplyScalar(dt * (isCharge ? 3.6 : 1.9));
    b.rig.root.position.add(toPlayer);
  }
  b.rig.hips.position.y = isCharge ? 0.90 : 0.95;

  if (isCharge) {
    if (b.blender) {
      b.blender.setTarget({
        torso: [0.42, 0, 0], headGroup: [-0.2, 0, 0],
        leftArm: [0.55, 0.15, -0.35], leftElbow: [-0.95, 0, 0],
        rightArm: [0.55, -0.15, 0.35], rightElbow: [-0.95, 0, 0],
        leftLeg: [-0.55, 0, 0], rightLeg: [0.45, 0, 0],
        leftKnee: [0.35, 0, 0], rightKnee: [0.65, 0, 0]
      });
    }
    b.teleMat.color.setHex(0xff1e38);
    b.teleRing.scale.setScalar(reducedMotionEnabled ? 1.2 : (1.15 + Math.sin(elapsed * 8) * 0.2));
    b.teleMat.opacity = 0.9;
  } else if (b.attackType === 'double_tap') {
    if (b.blender) {
      b.blender.setTarget({
        torso: [0.10, 0.25, 0],
        leftArm: [-1.25, 0.30, -0.25], leftElbow: [-1.35, 0, 0],
        rightArm: [-1.05, -0.25, 0.25], rightElbow: [-1.30, 0, 0],
        leftLeg: [-0.12, 0, 0], rightLeg: [0.12, 0, 0],
        leftKnee: [0.08, 0, 0], rightKnee: [0.08, 0, 0], headGroup: [0, 0.1, 0]
      });
    }
    b.teleMat.color.setHex(0xffe042);
    b.teleRing.scale.setScalar(reducedMotionEnabled ? 1.0 : (0.9 + Math.sin(elapsed * 20) * 0.1));
    b.teleMat.opacity = 0.9;
  } else if (b.attackType === 'quick_hook') {
    if (b.blender) {
      b.blender.setTarget({
        torso: [0.12, 0.45, 0],
        leftArm: [-1.45, 0.40, -0.30], leftElbow: [-1.25, 0, 0],
        rightArm: [-0.85, -0.20, 0.20], rightElbow: [-1.30, 0, 0],
        leftLeg: [-0.15, 0, 0], rightLeg: [0.15, 0, 0],
        leftKnee: [0.10, 0, 0], rightKnee: [0.10, 0, 0], headGroup: [0, 0, 0]
      });
    }
    const flashColor = (!reducedMotionEnabled && Math.sin(elapsed * 16) > 0) ? 0x00e5ff : 0xffe042;
    b.teleMat.color.setHex(flashColor);
    b.teleRing.scale.setScalar(reducedMotionEnabled ? 1.0 : (0.92 + Math.sin(elapsed * 12) * 0.14));
    b.teleMat.opacity = 0.92;
  } else {
    if (b.blender) {
      b.blender.setTarget({
        torso: [-0.18, -0.55, 0],
        rightArm: [-2.15, 0, 0.45], rightElbow: [-1.10, 0, 0],
        leftArm: [-0.85, 0, -0.25], leftElbow: [-1.15, 0, 0],
        leftLeg: [0.15, 0, 0], rightLeg: [-0.15, 0, 0],
        leftKnee: [0.10, 0, 0], rightKnee: [0.10, 0, 0], headGroup: [0, 0, 0]
      });
    }
    b.teleMat.color.setHex(0xff1e38);
    b.teleRing.scale.setScalar(reducedMotionEnabled ? 1.0 : (0.88 + Math.sin(elapsed * 10) * 0.16));
    b.teleMat.opacity = 0.88;
  }

  if (b.stateTimer <= 0) {
    b.state = 'striking';
    b.stateTimer = (songTime !== null && songTime !== undefined && b.targetImpactSongTime)
      ? Math.max(0.016, b.targetImpactSongTime - songTime)
      : strikeDur;
    b.badge.update(b.hp, b.maxHp, 'striking', null, b.attackType);
  }
}

function updateBruiserStrikingState(b, dt, contextState, songTime, chart) {
  const idx = b.idx;
  if (songTime !== null && songTime !== undefined && b.targetImpactSongTime) {
    b.stateTimer = b.targetImpactSongTime - songTime;
  } else {
    b.stateTimer -= dt;
  }
  b.isGuarding = false;
  b.rig.hips.position.y = 1.02;
  if (b.blender) {
    if (b.attackPattern === 'charge') {
      b.blender.setTarget({
        torso: [0.55, 0, 0], headGroup: [-0.1, 0, 0],
        leftArm: [-0.9, 0.2, -0.6], leftElbow: [-0.6, 0, 0],
        rightArm: [-0.9, -0.2, 0.6], rightElbow: [-0.6, 0, 0],
        leftLeg: [0.35, 0, 0], rightLeg: [-0.45, 0, 0],
        leftKnee: [0.15, 0, 0], rightKnee: [0.45, 0, 0]
      });
    } else if (b.attackType === 'double_tap') {
      b.blender.setTarget({
        torso: [0.18, -0.35, 0],
        leftArm: [-1.55, 0.1, 0.1], leftElbow: [-0.2, 0, 0],
        rightArm: [-0.9, -0.2, 0.3], rightElbow: [-1.2, 0, 0],
        leftLeg: [0.15, 0, 0], rightLeg: [-0.15, 0, 0],
        leftKnee: [0.08, 0, 0], rightKnee: [0.08, 0, 0], headGroup: [0, 0, 0]
      });
    } else if (b.attackType === 'quick_hook') {
      b.blender.setTarget({
        torso: [0.22, -0.55, 0],
        leftArm: [-1.25, 0.45, 0.35], leftElbow: [-0.35, 0, 0],
        rightArm: [-0.60, -0.25, 0.30], rightElbow: [-1.20, 0, 0],
        leftLeg: [0.18, 0, 0], rightLeg: [-0.18, 0, 0],
        leftKnee: [0.10, 0, 0], rightKnee: [0.10, 0, 0], headGroup: [0, 0, 0]
      });
    } else {
      b.blender.setTarget({
        torso: [0.28, 0.65, 0],
        rightArm: [-1.35, -0.25, -0.15], rightElbow: [-0.15, 0, 0],
        leftArm: [-0.5, 0, -0.3], leftElbow: [-0.80, 0, 0],
        leftLeg: [-0.20, 0, 0], rightLeg: [0.20, 0, 0],
        leftKnee: [0.08, 0, 0], rightKnee: [0.12, 0, 0], headGroup: [0, 0, 0]
      });
    }
  }
  b.teleMat.opacity = 0.95;

  if (DIRECTOR_ENABLED) {
    // The director resolves the strike on its marker (damage, evade -> dazed, counter).
    if (b.stateTimer <= -0.25) { b.state = 'stalking'; b.teleMat.opacity = 0; b.badge.update(b.hp, b.maxHp, 'stalking'); }
    return;
  }

  if (b.stateTimer <= 0) {
    b.teleMat.opacity = 0;
    recordEnemyStrikeEvent(`bruiser_${b.attackType}`, songTime, chart);
    b.targetImpactSongTime = null;
    const hitDist = b.rig.root.position.distanceTo(gameState.playerPos);
    const waveCfg = (contextState && contextState.waveCfg) || TUNING.WAVES[gameState.wave] || TUNING.WAVES[1];
    const isDodging = gameState.dodgeInvulnTimer > 0 || (gameState.wave === 3 && (gameState.wave3BeatWeaveTimer || 0) > 0);
    if (isDodging) {
      b.state = 'stunned';
      b.stateTimer = b.attackType === 'quick_hook' ? 1.15 : 1.45;
      b.badge.update(b.hp, b.maxHp, 'stunned');
      floorDial.updateBadge('EVADED!', '#ffe042');
    } else if (hitDist <= TUNING.ENEMY_MELEE_STRIKE_RADIUS) {
      const strikeDmg = b.attackType === 'quick_hook' ? waveCfg.quickHookDmg : waveCfg.haymakerDmg;
      applyPlayerDamage(strikeDmg, 'BAM! DODGE [A]!', b.attackType === 'quick_hook' ? 0.25 : 0.38, b.attackType === 'quick_hook' ? -0.035 : 0.055);
      b.state = 'stalking';
      b.attackCooldown = 1.6 + idx * 0.5;
      b.badge.update(b.hp, b.maxHp, 'stalking');
    } else {
      floorDial.updateBadge('OUTSPACED!', '#24e5ff');
      b.state = 'stalking';
      b.attackCooldown = 1.6;
      b.badge.update(b.hp, b.maxHp, 'stalking');
    }
  }
}

function updateBruiserStalkingAndGuardState(b, dt, elapsed, beatPulse, songTime, chart, beatSec, contextState) {
  const idx = b.idx;
  if (b.state === 'guard') {
    b.stateTimer -= dt;
    b.isGuarding = true;
    const slot = RADIAL_SLOTS[b.slotIndex !== undefined ? b.slotIndex : (idx % 6)];
    const desiredX = gameState.playerPos.x + Math.sin(slot.angle) * slot.radius;
    const desiredZ = gameState.playerPos.z - Math.cos(slot.angle) * slot.radius;
    b.rig.root.position.x = THREE.MathUtils.lerp(b.rig.root.position.x, desiredX, dt * 2.8);
    b.rig.root.position.z = THREE.MathUtils.lerp(b.rig.root.position.z, desiredZ, dt * 2.8);
    b.rig.hips.position.y = 0.98 + Math.sin(elapsed * 5.0) * 0.02;
    if (b.blender) {
      b.blender.setTarget({
        torso: [0.08, 0, 0], headGroup: [0.12, 0, 0],
        leftArm: [-1.15, 0.35, -0.22], leftElbow: [-1.60, 0, 0],
        rightArm: [-1.15, -0.35, 0.22], rightElbow: [-1.60, 0, 0],
        leftLeg: [0.10, 0, 0], rightLeg: [-0.10, 0, 0],
        leftKnee: [0.08, 0, 0], rightKnee: [0.08, 0, 0]
      });
    }
    b.teleMat.opacity = 0;
    if (b.stateTimer <= 0) {
      b.state = 'stalking';
      b.isGuarding = false;
      b.guardCooldown = 4.2 + idx * 1.5;
      b.badge.update(b.hp, b.maxHp, 'stalking');
    }
    return;
  }

  b.isGuarding = false;
  const slot = RADIAL_SLOTS[b.slotIndex !== undefined ? b.slotIndex : (idx % 6)];
  let desiredX = gameState.playerPos.x + Math.sin(slot.angle) * slot.radius;
  let desiredZ = gameState.playerPos.z - Math.cos(slot.angle) * slot.radius;

  for (let i = 0; i < bruisers.length; i++) {
    const other = bruisers[i];
    if (other === b || !other.active || other.state === 'ko' || other.state === 'flying') continue;
    const ox = b.rig.root.position.x - other.rig.root.position.x;
    const oz = b.rig.root.position.z - other.rig.root.position.z;
    const d2 = ox * ox + oz * oz;
    if (d2 < 1.69 && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const repel = (1.30 - d) * 0.75;
      desiredX += (ox / d) * repel;
      desiredZ += (oz / d) * repel;
    }
  }

  b.rig.root.position.x = THREE.MathUtils.lerp(b.rig.root.position.x, desiredX, dt * 3.4);
  b.rig.root.position.z = THREE.MathUtils.lerp(b.rig.root.position.z, desiredZ, dt * 3.4);

  const stride = Math.sin(elapsed * 6.5 + idx * 1.7) * 0.28;
  b.rig.hips.position.y = 1.00 + beatPulse * 0.08;
  if (b.blender) {
    b.blender.setTarget({
      torso: [0.08, Math.sin(elapsed * 3.2 + idx) * 0.12, 0],
      leftArm: [-0.95 + beatPulse * 0.15, 0.25, -0.22], leftElbow: [-1.15, 0, 0],
      rightArm: [-0.95 - beatPulse * 0.15, -0.25, 0.22], rightElbow: [-1.15, 0, 0],
      leftLeg: [stride, 0, 0], rightLeg: [-stride, 0, 0],
      leftKnee: [0, 0, 0], rightKnee: [0, 0, 0], headGroup: [0, 0, 0]
    });
  }
  b.teleMat.opacity = 0;

  const waveCfg = (contextState && contextState.waveCfg) || TUNING.WAVES[gameState.wave] || TUNING.WAVES[1];
  const canAddAttacker = contextState
    ? (contextState.activeAttackerCount < contextState.maxSimultaneousAttackers)
    : true;

  if (b.guardCooldown > 0) b.guardCooldown -= dt;
  if (gameState.wave === 2 && b.guardCooldown <= 0 && canAddAttacker) {
    b.state = 'guard';
    b.isGuarding = true;
    b.stateTimer = 2.2;
    b.guardCooldown = 4.5 + idx * 1.4;
    b.badge.update(b.hp, b.maxHp, 'guard', '🛡️ GUARD [BREAK: KICK D]!');
    return;
  }

  b.attackCooldown -= dt;
  if (!DIRECTOR_ENABLED && b.attackCooldown <= 0 && canAddAttacker) {
    const nextType = (b.attackType === 'quick_hook') ? 'heavy_haymaker' : 'quick_hook';
    const strikeDur = nextType === 'quick_hook' ? 0.18 : 0.22;
    const beatsAhead = nextType === 'heavy_haymaker' ? 2.0 : 1.0;
    const q = quantizeWindupToBeat(songTime, chart, beatsAhead, strikeDur);
    if (q.canStart || (songTime === null && b.attackCooldown < -beatSec)) {
      b.state = 'windup';
      b.attackType = nextType;
      const scaledWindup = songTime !== null ? q.windupDur : (waveCfg.windupSec || q.windupDur);
      b.stateTimer = scaledWindup;
      b.windupTotalDur = scaledWindup;
      b.targetImpactSongTime = q.targetImpactSongTime;
      if (b.attackType === 'heavy_haymaker') {
        b.teleMat.color.setHex(0xff1e38);
        b.badge.update(b.hp, b.maxHp, 'windup', '! DODGE [A] / COUNTER !', 'heavy_haymaker');
      } else {
        b.teleMat.color.setHex(0x00e5ff);
        b.badge.update(b.hp, b.maxHp, 'windup', '! QUICK HOOK [A] !', 'quick_hook');
      }
      audioEngine.playCombatSfx('enemy-telegraph', 'PERFECT', b.rig.root.position);
      if (contextState) {
        contextState.activeAttackerCount += 1;
        contextState.someoneWindingUp = contextState.activeAttackerCount >= contextState.maxSimultaneousAttackers;
      }

      bruisers.forEach((other) => {
        if (other !== b && other.active && other.state === 'stalking') {
          other.attackCooldown = Math.max(other.attackCooldown, beatSec * 0.75);
        }
      });
    }
  }
}

function updateKronosHitAndStunState(dt, elapsed, beatSec) {
  if (gameState.kronosRingState === 'hit') {
    gameState.kronosStateTimer -= dt;
    kronosTeleMat.opacity = 0;
    const progress = Math.max(0, gameState.kronosStateTimer / (gameState.kronosRecoilTotal || 0.40));
    const ease = Math.sin(progress * Math.PI * 0.5);
    const torsoTgt = gameState.kronosTargetTorsoRot
      ? [gameState.kronosTargetTorsoRot.x * ease, gameState.kronosTargetTorsoRot.y * ease, gameState.kronosTargetTorsoRot.z * ease]
      : [-0.28 * ease, 0, 0];
    const headTgt = gameState.kronosTargetHeadRot && kronosRig.headGroup
      ? [gameState.kronosTargetHeadRot.x * ease, gameState.kronosTargetHeadRot.y * ease, gameState.kronosTargetHeadRot.z * ease]
      : [0, 0, 0];
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: torsoTgt, headGroup: headTgt,
        leftArm: [-0.5 * ease, 0, -0.4 * ease], rightArm: [-0.5 * ease, 0, 0.4 * ease],
        leftElbow: [-0.7 * ease, 0, 0], rightElbow: [-0.7 * ease, 0, 0],
        leftLeg: [-0.15 * ease, 0, 0], rightLeg: [-0.15 * ease, 0, 0],
        leftKnee: [0.08, 0, 0], rightKnee: [0.08, 0, 0]
      });
    }
    if (gameState.kronosStateTimer <= 0) {
      if (gameState.counterBonusTimer > 0) {
        gameState.kronosRingState = 'counter_stun';
        gameState.kronosStateTimer = gameState.counterBonusTimer;
        gameState.bossCounterStunActive = true;
        kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', '★ COUNTER-STUN PUNISH! ★');
      } else {
        gameState.kronosRingState = 'stalking';
        gameState.kronosRecoilType = 'none';
        gameState.kronosIsMicroShaking = false;
        kronosRig.hips.position.x = 0;
        kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
      }
    }
  } else if (gameState.kronosRingState === 'counter_stun' || gameState.kronosRingState === 'stunned') {
    gameState.kronosStateTimer -= dt;
    kronosTeleMat.opacity = 0;
    if (gameState.kronosRingState === 'counter_stun') {
      gameState.counterBonusTimer = Math.max(0, gameState.kronosStateTimer);
      gameState.bossCounterStunActive = true;
    }
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [0.28, Math.sin(elapsed * 10.0) * 0.22, 0],
        headGroup: [0.18, Math.sin(elapsed * 8.0) * 0.16, 0],
        leftArm: [-0.2, 0, -0.35], rightArm: [-0.2, 0, 0.35],
        leftElbow: [-0.35, 0, 0], rightElbow: [-0.35, 0, 0],
        leftLeg: [-0.12, 0, 0], rightLeg: [-0.12, 0, 0],
        leftKnee: [0.14, 0, 0], rightKnee: [0.14, 0, 0]
      });
    }
    if (gameState.kronosStateTimer <= 0) {
      gameState.kronosRingState = 'stalking';
      gameState.counterBonusTimer = 0;
      gameState.bossCounterStunActive = false;
      gameState.kronosAttackCooldown = beatSec * 0.55;
      kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
    }
  }
}

function updateKronosScratchComboState(dt, elapsed, beatSec, w3Cfg, songTime, chart) {
  if (gameState.kronosRingState === 'windup_combo') {
    gameState.kronosStateTimer -= dt;
    const step = gameState.bossComboStep || 0;
    const toPlayer = new THREE.Vector3().subVectors(gameState.playerPos, kronosRig.root.position);
    toPlayer.y = 0;
    if (toPlayer.length() > 1.25) {
      toPlayer.normalize().multiplyScalar(dt * 2.4);
      kronosRig.root.position.add(toPlayer);
    }
    kronosTeleMat.color.setHex(step === 2 ? 0xffe042 : 0x00e5ff);
    kronosTeleRing.scale.setScalar(reducedMotionEnabled ? 1.0 : (0.92 + Math.sin(elapsed * 16.0) * 0.14));
    kronosTeleMat.opacity = 0.92;

    if (kronosBlender) {
      if (step === 0) {
        kronosBlender.setTarget({ torso: [-0.15, 0.35, 0], leftArm: [-1.45, 0.25, -0.2], leftElbow: [-1.2, 0, 0], rightArm: [-0.65, -0.2, 0.2], rightElbow: [-0.8, 0, 0] });
      } else if (step === 1) {
        kronosBlender.setTarget({ torso: [-0.18, -0.45, 0], rightArm: [-1.85, -0.3, 0.3], rightElbow: [-1.3, 0, 0], leftArm: [-0.75, 0.2, -0.2], leftElbow: [-0.9, 0, 0] });
      } else {
        kronosRig.hips.position.y = 1.08 + Math.sin(elapsed * 14.0) * 0.08;
        kronosBlender.setTarget({ torso: [-0.35, 0, 0], leftArm: [-2.4, 0, -0.35], leftElbow: [-0.4, 0, 0], rightArm: [-2.4, 0, 0.35], rightElbow: [-0.4, 0, 0], headGroup: [-0.15, 0, 0] });
      }
    }
    const windupDone = (songTime !== null && gameState.kronosTargetWindupEndSongTime !== undefined && gameState.kronosTargetWindupEndSongTime !== null)
      ? (songTime >= gameState.kronosTargetWindupEndSongTime)
      : (gameState.kronosStateTimer <= 0);
    if (windupDone) {
      gameState.kronosRingState = 'striking_combo';
      gameState.kronosStateTimer = (songTime !== null && gameState.kronosTargetImpactSongTime !== undefined && gameState.kronosTargetImpactSongTime !== null)
        ? Math.max(0.02, gameState.kronosTargetImpactSongTime - songTime)
        : (beatSec * 0.28);
      const label = step === 2 ? '! SCRATCH COUNTER [3/3 · A] !' : (step === 1 ? '! SCRATCH CUT [2/3] !' : '! SCRATCH SLASH [1/3] !');
      kronosRingBadge.update(gameState.bossHp, 100, 'striking', label, 'scratch_combo');
    }
    return false;
  }

  gameState.kronosStateTimer -= dt;
  const step = gameState.bossComboStep || 0;
  kronosTeleMat.color.setHex(step === 2 ? 0xffe042 : 0x00e5ff);
  kronosTeleMat.opacity = 0.96;

  if (kronosBlender) {
    if (step === 0) {
      kronosBlender.setTarget({ torso: [0.22, 0.45, 0], leftArm: [-1.65, 0, -0.1], leftElbow: [-0.15, 0, 0], rightArm: [-0.5, -0.2, 0.2], rightElbow: [-0.8, 0, 0] });
    } else if (step === 1) {
      kronosBlender.setTarget({ torso: [0.25, -0.55, 0], rightArm: [-1.55, 0, 0.15], rightElbow: [-0.2, 0, 0], leftArm: [-0.6, 0.2, -0.2], leftElbow: [-0.7, 0, 0] });
    } else {
      kronosRig.hips.position.y = 0.94;
      kronosBlender.setTarget({ torso: [0.45, 0, 0], leftArm: [-1.2, 0, -0.25], leftElbow: [-0.8, 0, 0], rightArm: [-1.2, 0, 0.25], rightElbow: [-0.8, 0, 0], headGroup: [0.2, 0, 0] });
    }
  }
  const strikeDone = (songTime !== null && gameState.kronosTargetImpactSongTime !== undefined && gameState.kronosTargetImpactSongTime !== null)
    ? (songTime >= gameState.kronosTargetImpactSongTime)
    : (gameState.kronosStateTimer <= 0);
  if (strikeDone && DIRECTOR_ENABLED) {
    // The director resolves the scratch on its marker; hold the strike pose until it moves us on.
    if (songTime !== null && gameState.kronosTargetImpactSongTime !== null && gameState.kronosTargetImpactSongTime !== undefined &&
        songTime > gameState.kronosTargetImpactSongTime + 0.30 && gameState.kronosRingState === 'striking_combo') {
      gameState.kronosRingState = 'stalking';
      gameState.bossAttackPattern = 'idle';
      kronosTeleMat.opacity = 0;
      kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
    }
    return false;
  }
  if (strikeDone) {
    recordEnemyStrikeEvent('kronos', songTime, chart);
    const isDodging = gameState.dodgeInvulnTimer > 0 || (gameState.wave3BeatWeaveTimer || 0) > 0 || gameState.bossStepWeaved;
    const hitDist = kronosRig.root.position.distanceTo(gameState.playerPos);
    const scratchDmgs = (w3Cfg && w3Cfg.bossScratchHitDmg) || [10, 12, 18];

    if (step === 2) {
      kronosTeleMat.opacity = 0;
      gameState.bossStepWeaved = false;
      gameState.kronosTargetWindupEndSongTime = null;
      gameState.kronosTargetImpactSongTime = null;
      if (isDodging) {
        const riposteDmg = w3Cfg ? w3Cfg.bossCounterRiposteDmg : 26;
        gameState.bossHp = Math.max(0, gameState.bossHp - riposteDmg);
        gameState.kronosRingState = 'counter_stun';
        gameState.kronosStateTimer = 0.85;
        gameState.counterBonusTimer = 1.6;
        gameState.bossCounterStunActive = true;
        gameState.bossAttackPattern = 'idle';
        gameState.kronosAttackCooldown = beatSec * 0.75;
        kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', `★ SCRATCH COUNTER (-${riposteDmg})! ★`);
        setStarburstText('COUNTER WEAVE!', 1.2);
        audioEngine.playCombatSfx('counter-weave', 'PERFECT', kronosRig.root.position);
        updateHudNumbers();
        if (gameState.bossHp <= 0) {
          gameState.bossHp = 0;
          gameState.kronosRingState = 'ko';
          kronosRingBadge.update(0, 100, 'ko', '★ K.O.! VICTORY! ★');
          triggerGameEnd(true);
          return true;
        }
      } else {
        if (hitDist <= TUNING.ENEMY_MELEE_STRIKE_RADIUS + 0.35) {
          applyPlayerDamage(scratchDmgs[2], 'SCRATCH FINISHER!', 0.36, 0.05);
        }
        gameState.kronosRingState = 'stalking';
        gameState.bossAttackPattern = 'idle';
        gameState.kronosAttackCooldown = beatSec * 0.75;
        kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
      }
    } else {
      if (!isDodging && hitDist <= TUNING.ENEMY_MELEE_STRIKE_RADIUS + 0.25) {
        applyPlayerDamage(scratchDmgs[step], step === 0 ? 'SCRATCH SLASH!' : 'SCRATCH CUT!', 0.22, -0.03);
      }
      gameState.bossComboStep = step + 1;
      gameState.bossStepWeaved = false;
      gameState.kronosRingState = 'windup_combo';
      const strikeDur = beatSec * 0.28;
      if (songTime !== null) {
        const q = quantizeWindupToBeat(songTime, chart, 1.0, strikeDur);
        const windupDur = q.windupDur;
        gameState.kronosStateTimer = windupDur;
        gameState.kronosTargetWindupEndSongTime = q.targetImpactSongTime !== null ? (q.targetImpactSongTime - strikeDur) : (songTime + windupDur);
        gameState.kronosTargetImpactSongTime = q.targetImpactSongTime !== null ? q.targetImpactSongTime : (songTime + windupDur + strikeDur);
      } else {
        gameState.kronosStateTimer = beatSec * 0.72;
        gameState.kronosTargetWindupEndSongTime = null;
        gameState.kronosTargetImpactSongTime = null;
      }
      const nextLabel = (step === 0) ? '! SCRATCH CUT [2/3] !' : '! SCRATCH COUNTER [3/3 · A] !';
      kronosTeleMat.color.setHex(step === 0 ? 0x00e5ff : 0xffe042);
      kronosRingBadge.update(gameState.bossHp, 100, 'windup', nextLabel, 'scratch_combo');
    }
  }
  return false;
}

function updateKronosBassDropState(dt, elapsed, beatSec, w3Cfg) {
  if (gameState.kronosRingState === 'windup_shockwave') {
    gameState.kronosStateTimer -= dt;
    kronosTeleMat.color.setHex(0xff1e38);
    kronosTeleRing.scale.setScalar(reducedMotionEnabled ? 1.0 : (0.95 + Math.sin(elapsed * 18.0) * 0.18));
    kronosTeleMat.opacity = 0.94;

    const totalWindup = gameState.kronosWindupTotal || (beatSec * 1.5);
    const leapProgress = 1.0 - (gameState.kronosStateTimer / Math.max(0.1, totalWindup));
    const jumpHeight = Math.sin(Math.min(1.0, Math.max(0, leapProgress)) * Math.PI) * 0.42;
    kronosRig.hips.position.y = 1.04 + jumpHeight;
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [-0.35, 0, 0],
        leftArm: [-2.2, 0.3, -0.4], leftElbow: [-0.6, 0, 0],
        rightArm: [-2.2, -0.3, 0.4], rightElbow: [-0.6, 0, 0],
        leftLeg: [0.35, 0, 0], rightLeg: [-0.25, 0, 0],
        leftKnee: [0.4, 0, 0], rightKnee: [0.3, 0, 0]
      });
    }
    if (!DIRECTOR_ENABLED && gameState.kronosStateTimer <= 0) {
      kronosRig.hips.position.y = 0.90;
      kronosTeleMat.opacity = 0;
      setStarburstText('BASS DROP!', 1.25);
      if (!reducedMotionEnabled) cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.45);
      audioEngine.playCombatSfx('subwoofer-bass-drop', 'PERFECT', kronosRig.root.position);

      const shockwaveMesh = buildSubwooferShockwaveRing();
      const spawnPos = kronosRig.root.position.clone();
      shockwaveMesh.position.set(spawnPos.x, 0.04, spawnPos.z);
      scene.add(shockwaveMesh);

      const preWeaved = Boolean(gameState.shockwavePreWeaved);
      gameState.bossShockwave = {
        active: true,
        radius: 0.25,
        innerRadius: 0.25,
        maxRadius: 6.5,
        speed: 5.5,
        evaded: preWeaved,
        hit: false,
        mesh: shockwaveMesh,
        pos: spawnPos
      };
      gameState.bossShockwaveActive = true;
      gameState.kronosRingState = 'shockwave_active';
      gameState.kronosStateTimer = (6.5 - 0.25) / 5.5;
      kronosRingBadge.update(gameState.bossHp, 100, 'striking', '! SUBWOOFER BASS DROP !', 'bass_drop');
    }
  } else if (gameState.kronosRingState === 'shockwave_active') {
    gameState.kronosStateTimer -= dt;
    kronosRig.hips.position.y = 0.95;
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [0.38, 0, 0],
        leftArm: [-1.2, 0, -0.3], leftElbow: [-0.9, 0, 0],
        rightArm: [-1.2, 0, 0.3], rightElbow: [-0.9, 0, 0]
      });
    }
    if (gameState.kronosStateTimer <= 0) {
      if (gameState.bossShockwave && gameState.bossShockwave.mesh) {
        scene.remove(gameState.bossShockwave.mesh);
        gameState.bossShockwave.mesh.geometry.dispose();
        gameState.bossShockwave.mesh.material.dispose();
      }
      gameState.bossShockwave = null;
      gameState.bossShockwaveActive = false;
      gameState.kronosRingState = 'stalking';
      gameState.bossAttackPattern = 'idle';
      gameState.kronosAttackCooldown = beatSec * 0.65;
      kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
    }
  }

  if (gameState.bossShockwave && gameState.bossShockwave.active) {
    const wave = gameState.bossShockwave;
    wave.radius += wave.speed * dt;
    const progress = Math.min(1.0, (wave.radius - 0.25) / (wave.maxRadius - 0.25));
    const curScale = Math.max(0.1, wave.radius / 0.55);
    wave.mesh.scale.set(curScale, curScale, 1);
    wave.mesh.material.opacity = Math.max(0.0, 0.95 * (1.0 - progress));
    wave.mesh.material.color.setHex(0xff1e38);

    const d = gameState.playerPos.distanceTo(wave.pos);
    const inWaveFront = Math.abs(d - wave.radius) <= 0.75;
    const isPlayerDodging = gameState.dodgeInvulnTimer > 0 || (gameState.wave3BeatWeaveTimer || 0) > 0;

    if (inWaveFront && !wave.visualOnly) {
      if (isPlayerDodging && !wave.evaded) {
        wave.evaded = true;
        gameState.shockwaveDodged = true;
        gameState.hype = Math.min(100.0, (gameState.hype || 0) + 25.0);
        floorDial.updateBadge('COUNTER WEAVE!', '#ffe042');
        setStarburstText('COUNTER WEAVE!', 1.25);
        audioEngine.playCombatSfx('counter-weave', 'PERFECT', gameState.playerPos);

        const reboundDmg = w3Cfg ? w3Cfg.bossBassDropReboundDmg : 28;
        gameState.bossHp = Math.max(0, gameState.bossHp - reboundDmg);
        gameState.kronosRingState = 'counter_stun';
        gameState.kronosStateTimer = 0.85;
        gameState.counterBonusTimer = 1.6;
        gameState.bossCounterStunActive = true;
        gameState.bossAttackPattern = 'idle';
        kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', `★ BASS REBOUND (-${reboundDmg})! ★`);
        updateHudNumbers();
        if (gameState.bossHp <= 0) {
          gameState.bossHp = 0;
          gameState.kronosRingState = 'ko';
          kronosRingBadge.update(0, 100, 'ko', '★ K.O.! VICTORY! ★');
          triggerGameEnd(true);
          return true;
        }
      } else if (!isPlayerDodging && !wave.hit && !wave.evaded) {
        wave.hit = true;
        const bassDropDmg = w3Cfg ? w3Cfg.bossBassDropDmg : 26;
        applyPlayerDamage(bassDropDmg, 'SUB-BASS IMPACT!', 0.40, 0.06);
        const knockDir = gameState.playerPos.clone().sub(wave.pos).normalize();
        if (knockDir.lengthSq() < 0.001) knockDir.set(0, 0, 1);
        gameState.playerTarget.addScaledVector(knockDir, 1.25);
      }
    }

    if (wave.radius >= wave.maxRadius) {
      scene.remove(wave.mesh);
      wave.mesh.geometry.dispose();
      wave.mesh.material.dispose();
      gameState.bossShockwave = null;
      gameState.bossShockwaveActive = false;
      if (gameState.kronosRingState === 'shockwave_active') {
        gameState.kronosRingState = 'stalking';
        gameState.bossAttackPattern = 'idle';
        gameState.kronosAttackCooldown = beatSec * 0.65;
        kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
      }
    }
  }
  return false;
}

function updateKronosStalkingState(dt, elapsed, beatPulse, beatSec, songTime, chart, contextState) {
  kronosTeleMat.opacity = 0;
  const kAngle = elapsed * 0.55;
  const targetKx = gameState.playerPos.x + Math.sin(kAngle) * 1.48;
  const targetKz = gameState.playerPos.z - Math.cos(kAngle) * 1.48;
  kronosRig.root.position.x = THREE.MathUtils.lerp(kronosRig.root.position.x, targetKx, dt * 3.2);
  kronosRig.root.position.z = THREE.MathUtils.lerp(kronosRig.root.position.z, targetKz, dt * 3.2);
  kronosRig.hips.position.y = 1.04 + beatPulse * 0.09;

  const kStride = Math.sin(elapsed * 6.0) * 0.25;
  if (kronosBlender) {
    kronosBlender.setTarget({
      torso: [0.06, Math.sin(elapsed * 2.8) * 0.15, 0],
      leftArm: [-0.85 + beatPulse * 0.18, 0.2, -0.2], leftElbow: [-1.10, 0, 0],
      rightArm: [-0.90 - beatPulse * 0.18, -0.2, 0.2], rightElbow: [-1.10, 0, 0],
      leftLeg: [kStride, 0, 0], rightLeg: [-kStride, 0, 0],
      leftKnee: [0.05, 0, 0], rightKnee: [0.05, 0, 0], headGroup: [0, 0, 0]
    });
  }

  const canBossAttack = contextState
    ? (contextState.activeAttackerCount < contextState.maxSimultaneousAttackers)
    : true;
  gameState.kronosAttackCooldown -= dt;
  if (!DIRECTOR_ENABLED && gameState.kronosAttackCooldown <= 0 && canBossAttack) {
    const strikeDur = beatSec * 0.28;
    let windupDur = beatSec * 0.72;
    if (songTime !== null) {
      const q = quantizeWindupToBeat(songTime, chart, 1.0, strikeDur);
      windupDur = q.windupDur;
      gameState.kronosTargetWindupEndSongTime = q.targetImpactSongTime !== null ? (q.targetImpactSongTime - strikeDur) : (songTime + windupDur);
      gameState.kronosTargetImpactSongTime = q.targetImpactSongTime !== null ? q.targetImpactSongTime : (songTime + windupDur + strikeDur);
    } else {
      gameState.kronosTargetWindupEndSongTime = null;
      gameState.kronosTargetImpactSongTime = null;
    }
    gameState.bossAttackPattern = 'scratch_combo';
    gameState.bossComboStep = 0;
    gameState.bossStepWeaved = false;
    gameState.kronosRingState = 'windup_combo';
    gameState.kronosStateTimer = windupDur;
    kronosTeleMat.color.setHex(0x00e5ff);
    kronosTeleMat.opacity = 0.92;
    kronosRingBadge.update(gameState.bossHp, 100, 'windup', '! SCRATCH SLASH [1/3] !', 'scratch_combo');
    audioEngine.scheduleBossTelegraphCue('scratch_combo', beatSec, windupDur, kronosRig.root.position);
    if (contextState) {
      contextState.activeAttackerCount += 1;
      contextState.someoneWindingUp = contextState.activeAttackerCount >= contextState.maxSimultaneousAttackers;
    }
  }
}

/**
 * Enemy animation arbitration: while an authored clip is running the mixer owns the joints and the
 * pose blender stands down; when the clip ends the blender resumes from the clip's last pose.
 */
function updateEnemyAnimation(rig, blender, dt) {
  if (gameState.debugFreezeClip) return;
  const clipActive = Boolean(rig && rig.clipDriven && rig.isClipPlaying && rig.isClipPlaying());
  if (clipActive) {
    rig._clipWasActive = true;
  } else if (blender) {
    if (rig && rig._clipWasActive) {
      blender.syncCurrentFromRig();
      rig._clipWasActive = false;
    }
    blender.update(dt);
  }
  if (rig && rig.clipDriven && rig.update) rig.update(dt);
}

function ensureEnemyIdleClip(rig, clipName, songTime) {
  if (!rig || !rig.clipDriven || !rig.playClip) return;
  if (rig._activeClipName === clipName && rig._activeAction && rig._activeAction.isRunning()) return;
  if (rig._activeAction && rig._activeAction.isRunning()) return; // another clip (hurt, strike) owns the body
  const chart = audioEngine.getActiveChart();
  const barSec = (chart && chart.barSec) || KRONOS_BAR_SEC;
  const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  const clip = rig.clips ? rig.clips.get(clipName) : null;
  const clipDur = clip && clip.duration > 0 ? clip.duration : 2.6;
  const phase = (songTime !== null && songTime !== undefined && barSec > 0)
    ? ((((songTime - firstOffset) % barSec) + barSec) % barSec) / barSec
    : 0;
  rig.playClip(clipName, { loop: true, fadeInSec: 0.18, startTime: phase * clipDur, timeScale: clipDur / barSec });
}

function updateFighterFSM(entity, dt, rawDt, elapsed, beatPulse, songTime, chart, contextState) {
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;

  if (!entity.isBoss) {
    const b = entity;
    if (!b.active) return;
    if (updateBruiserBadgeAndFlying(b, dt)) return;
    if (b.state === 'ko') return;

    b.rig.root.lookAt(gameState.playerPos.x, 0, gameState.playerPos.z);
    updateBruiserMicroShake(b, rawDt);

    if (!gameState.gameStarted || gameState.isPaused || gameState.isGameOver) {
      updateEnemyAnimation(b.rig, b.blender, dt);
      return;
    }

    if (b.state === 'hit' || b.state === 'launch' || b.state === 'wall_slam' || b.state === 'dazed') {
      updateEnemyReactionState(b, dt, elapsed, {
        arenaRadius: TUNING.ARENA_RADIUS,
        wallSlamRadius: TUNING.ARENA_RADIUS - 0.20,
        gameState,
        cameraJuice,
        floorDial,
        setStarburstText,
        audioEngine
      });
    } else if (b.state === 'stunned' || b.state === 'guard_break') {
      updateBruiserHitStunGuardBreakState(b, dt, elapsed);
    } else if (b.state === 'windup') {
      updateBruiserWindupState(b, dt, elapsed, songTime);
    } else if (b.state === 'striking') {
      updateBruiserStrikingState(b, dt, contextState, songTime, chart);
    } else {
      updateBruiserStalkingAndGuardState(b, dt, elapsed, beatPulse, songTime, chart, beatSec, contextState);
    }

    if (b.state === 'stalking' || b.state === 'guard') ensureEnemyIdleClip(b.rig, 'idle-dance', songTime);
    updateEnemyAnimation(b.rig, b.blender, dt);
    if (b.state !== 'flying') {
      const rad = Math.hypot(b.rig.root.position.x, b.rig.root.position.z);
      if (rad > TUNING.ARENA_RADIUS) {
        b.rig.root.position.x = (b.rig.root.position.x / rad) * TUNING.ARENA_RADIUS;
        b.rig.root.position.z = (b.rig.root.position.z / rad) * TUNING.ARENA_RADIUS;
      }
    }
    return;
  }

  // BOSS DJ KRONOS FSM (Booth in Waves 1-2, Beat-Grid Ring Combat in Wave 3)
  if (!gameState.kronosInRing) {
    kronosTeleMat.opacity = 0;
    kronosRig.hips.position.y = 1.04 + beatPulse * 0.08;
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [0, Math.sin(elapsed * 2.4) * 0.18, 0],
        leftArm: [-0.65 + Math.sin(elapsed * 5) * 0.20, 0, -0.15],
        rightArm: [-0.70 - Math.sin(elapsed * 5) * 0.20, 0, 0.15],
        leftElbow: [-0.8, 0, 0], rightElbow: [-0.8, 0, 0],
        leftLeg: [0, 0, 0], rightLeg: [0, 0, 0],
        leftKnee: [0, 0, 0], rightKnee: [0, 0, 0],
        headGroup: [0, Math.sin(elapsed * 2.4) * 0.10, 0]
      });
      updateEnemyAnimation(kronosRig, kronosBlender, dt);
    }
    return;
  }

  if (kronosRingBadge && kronosRingBadge.mesh) {
    kronosRingBadge.mesh.lookAt(camera.position);
  }
  kronosRig.root.lookAt(gameState.playerPos.x, 0, gameState.playerPos.z);

  if (gameState.hitStopTimer <= 0) {
    if (gameState.kronosIsMicroShaking) {
      gameState.kronosIsMicroShaking = false;
      gameState.kronosMicroShakeTimer = 0;
      kronosRig.hips.position.x = 0;
    }
  } else if (gameState.kronosIsMicroShaking && gameState.kronosMicroShakeTimer > 0) {
    gameState.kronosMicroShakeTimer -= rawDt;
    if (gameState.kronosMicroShakeTimer <= 0) {
      gameState.kronosIsMicroShaking = false;
      kronosRig.hips.position.x = 0;
    } else {
      const t = gameState.kronosMicroShakeDuration - gameState.kronosMicroShakeTimer;
      const decay = Math.exp(-22.0 * t);
      kronosRig.hips.position.x = (gameState.kronosMicroShakeAmp || 0.05) * decay * Math.sin(2 * Math.PI * 50.0 * t) * 0.5;
    }
  } else {
    kronosRig.hips.position.x = 0;
  }

  if (!gameState.gameStarted || gameState.isPaused || gameState.isGameOver) {
    updateEnemyAnimation(kronosRig, kronosBlender, dt);
    return;
  }

  const w3Cfg = TUNING.WAVES[3];
  if (songTime !== null) {
    const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
    const curBeatFloat = Math.max(0, (songTime - firstOffset) / beatSec);
    if (
      gameState.wave3StartBeatFloat === undefined ||
      gameState.wave3StartBeatFloat === null ||
      curBeatFloat < gameState.wave3StartBeatFloat
    ) {
      gameState.wave3StartBeatFloat = curBeatFloat;
    }
    gameState.wave3BeatFloat = Math.max(0, curBeatFloat - gameState.wave3StartBeatFloat);
  } else {
    gameState.wave3BeatFloat = (gameState.wave3BeatFloat || 0) + dt / beatSec;
  }
  const totalBeats = gameState.wave3BeatFloat;
  const barIndex = Math.floor(totalBeats / 4);
  const beatInBar = totalBeats - barIndex * 4;
  gameState.wave3BarIdx = barIndex;
  gameState.wave3BeatInBar = beatInBar;

  // Every 4th bar (barIndex % 4 === 3, starting on Beat 3 -> 4th-bar downbeat): trigger BASS DROP ring shockwave
  if (
    !DIRECTOR_ENABLED &&
    (barIndex % 4) === 3 &&
    beatInBar >= 2.0 &&
    gameState.wave3LastBassDropBar !== barIndex &&
    gameState.kronosRingState !== 'ko' &&
    gameState.kronosRingState !== 'windup_shockwave' &&
    gameState.kronosRingState !== 'shockwave_active'
  ) {
    gameState.wave3LastBassDropBar = barIndex;
    const windupDur = Math.max(beatSec * 0.85, (4.0 - beatInBar) * beatSec);
    gameState.bossAttackPattern = 'bass_drop';
    gameState.kronosRingState = 'windup_shockwave';
    gameState.kronosStateTimer = windupDur;
    gameState.kronosWindupTotal = windupDur;
    gameState.shockwavePreWeaved = false;
    kronosTeleMat.color.setHex(0xff1e38);
    kronosTeleMat.opacity = 0.92;
    kronosRingBadge.update(gameState.bossHp, 100, 'windup', '! BASS DROP [WEAVE BEAT 3] !', 'bass_drop');
    audioEngine.scheduleBossTelegraphCue('bass_drop', beatSec, windupDur, kronosRig.root.position);
  }

  if (gameState.kronosRingState === 'hit' || gameState.kronosRingState === 'counter_stun' || gameState.kronosRingState === 'stunned') {
    updateKronosHitAndStunState(dt, elapsed, beatSec);
  } else if (gameState.kronosRingState === 'windup_combo' || gameState.kronosRingState === 'striking_combo') {
    if (updateKronosScratchComboState(dt, elapsed, beatSec, w3Cfg, songTime, chart)) return;
  } else if (gameState.kronosRingState === 'windup_shockwave' || gameState.kronosRingState === 'shockwave_active') {
    if (updateKronosBassDropState(dt, elapsed, beatSec, w3Cfg)) return;
  } else {
    updateKronosStalkingState(dt, elapsed, beatPulse, beatSec, songTime, chart, contextState);
  }

  if (gameState.kronosRingState !== 'windup_shockwave' && gameState.kronosRingState !== 'shockwave_active' && gameState.bossShockwave && gameState.bossShockwave.active) {
    if (updateKronosBassDropState(dt, elapsed, beatSec, w3Cfg)) return;
  }

  if (gameState.kronosRingState === 'stalking') ensureEnemyIdleClip(kronosRig, 'boss-idle', songTime);
  updateEnemyAnimation(kronosRig, kronosBlender, dt);
}

let _vfxFrameCount = 0;
const _lightTargetA = new THREE.Color(0xff2a85);
const _lightTargetB = new THREE.Color(0x00e5ff);

function updateVFX(dt, elapsed, beatPulse, beatPhase, bass, songTime, chart) {
  _vfxFrameCount += 1;
  const isPhoneViewport = (window.innerWidth || 1280) <= 600 || IS_LOW_TIER;
  const bpm = (chart && chart.bpm) || KRONOS_BPM;
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;

  // Advance lyrics/bar readout ONLY when audio is actively playing (songTime !== null)
  if (songTime !== null && chart && Array.isArray(chart.bars)) {
    const barIdx = chart.bars.findIndex((b) => songTime >= b.startTime && songTime < b.endTime);
    if (barIdx !== -1 && barIdx !== activeBarIdx) {
      activeBarIdx = barIdx;
      const bar = chart.bars[barIdx];
      if (elLyricSection) elLyricSection.textContent = bar.section;
      if (elLyricLine) elLyricLine.textContent = bar.line;
      if (elTempoReadout) {
        elTempoReadout.textContent = `${bpm} BPM · BAR ${String(barIdx + 1).padStart(2, '0')}/${chart.bars.length}`;
      }
    }
  }

  if (!isPhoneViewport) {
    if ((_vfxFrameCount % 2) === 0) {
      boomboxStage.updateStageDisplays(
        audioEngine.isPlaying ? audioEngine.freqData : null,
        bass,
        beatPulse,
        dt * 2,
        gameState.hype
      );
    }
  } else if (audioEngine.isPlaying && (_vfxFrameCount % 12) === 0) {
    boomboxStage.updateStageDisplays(
      audioEngine.freqData,
      bass,
      beatPulse,
      dt * 12,
      gameState.hype
    );
  }

  if (songTime !== null && !reducedMotionEnabled) {
    const beatSin = Math.sin((Math.PI * songTime) / beatSec);
    const beatMod = beatSin * beatSin;
    const cue = getLightingCueAtTime(chart, songTime);
    const cueMult = cue && Number.isFinite(cue.intensity) ? Math.min(1.25, Math.max(0.85, 0.6 + cue.intensity * 0.55)) : 1.0;
    const strobeMult = (cue && cue.strobe && cue.strobeHz && !reducedMotionEnabled) ? (0.78 + 0.22 * Math.max(0, Math.sin(songTime * cue.strobeHz * Math.PI * 2))) : 1.0;
    stageMagentaLight.intensity = 1.68 * (1.0 + 0.16 * beatMod) * cueMult * strobeMult;
    stageCyanLight.intensity = 1.48 * (1.0 + 0.16 * beatMod) * cueMult;
    const palKey = cue ? (cue.palette || cue.paletteKey || cue.lightingPalette) : null;
    const pal = palKey && LIGHTING_PALETTES[palKey] ? LIGHTING_PALETTES[palKey] : null;
    if (pal) {
      _lightTargetA.setStyle(pal.primaryHex);
      _lightTargetB.setStyle(pal.secondaryHex);
      stageMagentaLight.color.lerp(_lightTargetA, Math.min(1, dt * 4));
      stageCyanLight.color.lerp(_lightTargetB, Math.min(1, dt * 4));
    }
  } else {
    stageMagentaLight.intensity = 1.68;
    stageCyanLight.intensity = 1.48;
  }

  boomboxStage.wooferCones.forEach((cone) => {
    const baseS = cone.scale.x > 1.0 ? 1.38 : 0.66;
    const pump = baseS * (1.0 + bass * 0.18 + beatPulse * 0.12);
    cone.scale.set(pump, pump, baseS * (1.0 + bass * 0.28));
  });
  boomboxStage.platters.forEach((p) => {
    p.rotation.y += dt * (audioEngine.isPlaying ? 4.2 : 0.8);
  });

  // Beat ring pulses ONLY when audio is playing (and respects reduced motion)
  const ringScale = (songTime !== null && !reducedMotionEnabled)
    ? (0.72 + (1.0 - beatPhase) * 0.68)
    : 1.0;
  floorDial.pulseRing.scale.setScalar(ringScale);
  const hypeFactor = Math.max(0, Math.min(1.0, (gameState.hype || 0) / 100));
  floorDial.pulseMat.opacity = songTime !== null ? (0.45 + beatPulse * (0.40 + 0.50 * hypeFactor)) : 0.32;
  if (gameState.styleRank === 'S-RANK' || hypeFactor >= 0.90) {
    floorDial.pulseMat.color.set('#ff204e');
  } else if (gameState.styleRank === 'A-RANK' || hypeFactor >= 0.60) {
    floorDial.pulseMat.color.set('#ffdd00');
  } else {
    floorDial.pulseMat.color.set('#00e5ff');
  }

  if (floorDial && floorDial.threatChevronGroup) {
    const priorityTarget = gameState.priorityTargetCache;
    if (priorityTarget && priorityTarget.pos) {
      const dx = priorityTarget.pos.x - challengerRig.root.position.x;
      const dz = priorityTarget.pos.z - challengerRig.root.position.z;
      const ang = Math.atan2(dx, dz);
      floorDial.threatChevronGroup.rotation.y = ang + Math.PI;
      floorDial.threatChevronGroup.position.set(0, 0.03, 0);
    }
  }

  if (instancedCrowdHandle) {
    if (instancedCrowdHandle.instancedGroup) {
      instancedCrowdHandle.instancedGroup.visible = !isPhoneViewport;
    }
    if (!isPhoneViewport && instancedCrowdHandle.update) {
      const hypeRatio = Math.max(0, Math.min(1.0, (gameState.hype || 0) / 100));
      const jumpAmp = reducedMotionEnabled ? 0.04 : (0.14 + 0.14 * hypeRatio);
      const crowdTime = songTime !== null ? songTime : elapsed;
      instancedCrowdHandle.update(crowdTime, bpm, jumpAmp);
    }
  }

  for (let i = gameState.activeImpactVFX.length - 1; i >= 0; i--) {
    const vfx = gameState.activeImpactVFX[i];
    const alive = vfx && typeof vfx.update === 'function' ? vfx.update(dt, camera.position) : false;
    if (!alive) {
      if (vfx && typeof vfx.dispose === 'function') vfx.dispose(scene);
      gameState.activeImpactVFX.splice(i, 1);
    }
  }

  for (let i = gameState.activeSmears.length - 1; i >= 0; i--) {
    const s = gameState.activeSmears[i];
    if (s && typeof s.update === 'function') {
      const alive = s.update(dt);
      if (!alive) {
        gameState.activeSmears.splice(i, 1);
      }
    } else if (s) {
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.22);
      s.mesh.scale.multiplyScalar(1 + dt * 2.2);
      if (s.life <= 0) {
        if (s.release) s.release();
        gameState.activeSmears.splice(i, 1);
      }
    }
  }

  if (challengerContactShadow) {
    const pPos = gameState.playerPos;
    challengerContactShadow.position.set(pPos.x, 0.015, pPos.z);
    challengerContactShadow.rotation.set(0, challengerRig.root ? challengerRig.root.rotation.y : 0, 0);
  }
  if (kronosContactShadow && kronosRig && kronosRig.root) {
    if (gameState.kronosInRing) {
      kronosContactShadow.position.set(0, (0.015 - kronosRig.root.position.y) / (kronosRig.root.scale.y || 1.0), 0);
    } else {
      kronosContactShadow.position.set(0, 0.015, 0);
    }
  }
  for (let i = 0; i < bruisers.length; i++) {
    const b = bruisers[i];
    if (b.contactShadow) {
      if (b.active && b.rig && b.rig.root && b.state !== 'ko') {
        b.contactShadow.visible = true;
        b.contactShadow.position.set(b.rig.root.position.x, 0.015, b.rig.root.position.z);
      } else {
        b.contactShadow.visible = false;
      }
    }
  }
}

function updateCamera(dt, rawDt, elapsed) {
  cameraJuice.trauma = Math.max(0, cameraJuice.trauma - rawDt * cameraJuice.decaySpeed);
  updateCameraJuiceState();

  if (reducedMotionEnabled) {
    cameraJuice.shakeOffset.set(0, 0, 0);
    gameState.cameraKick = 0;
    gameState.cameraDutch = 0;
  } else {
    const traumaSq = cameraJuice.trauma * cameraJuice.trauma;
    cameraJuice.shakeOffset.set(
      Math.sin(elapsed * 48.0) * 0.12 * traumaSq,
      Math.cos(elapsed * 54.0) * 0.10 * traumaSq,
      Math.sin(elapsed * 62.0) * 0.08 * traumaSq
    );
    const camDecay = Math.min(1.0, dt * 14);
    gameState.cameraKick = THREE.MathUtils.lerp(gameState.cameraKick, 0, camDecay);
    if (Math.abs(gameState.cameraKick) < 0.0005) gameState.cameraKick = 0;
    gameState.cameraDutch = THREE.MathUtils.lerp(gameState.cameraDutch, 0, camDecay);
    if (Math.abs(gameState.cameraDutch) < 0.0005) gameState.cameraDutch = 0;
  }

  const camLerpSpeed = cameraState.isDragging ? 18.0 : 6.0;
  cameraState.currentPos.lerp(cameraState.targetPos, dt * camLerpSpeed);
  cameraState.currentLookAt.lerp(cameraState.targetLookAt, dt * camLerpSpeed);

  if (cameraState.mode === 'action') {
    camera.position.set(
      cameraState.currentPos.x + (gameState.playerPos.x + 0.46) * 0.25,
      cameraState.currentPos.y - gameState.cameraKick * 0.16,
      cameraState.currentPos.z - gameState.cameraKick * 0.38
    ).add(cameraJuice.shakeOffset);
  } else {
    camera.position.copy(cameraState.currentPos).add(cameraJuice.shakeOffset);
  }
  camera.lookAt(cameraState.currentLookAt);
  camera.rotation.z += gameState.cameraDutch + cameraJuice.dutchRoll;
  camera.fov = 45.0 - cameraJuice.fovDip;
  camera.updateProjectionMatrix();
  if (IS_DEBUG_MODE && gameState.debugCameraOverride) {
    const o = gameState.debugCameraOverride;
    if (o.position) camera.position.set(o.position[0], o.position[1], o.position[2]);
    if (o.lookAt) camera.lookAt(o.lookAt[0], o.lookAt[1], o.lookAt[2]);
    if (o.fov && camera.fov !== o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
  }
}

function updateEnemies(dt, rawDt, elapsed, beatPulse, songTime, chart) {
  if (gameState.wave3BeatWeaveTimer > 0) {
    gameState.wave3BeatWeaveTimer = Math.max(0, gameState.wave3BeatWeaveTimer - dt);
  }

  // Single findBestCombatTarget evaluation per frame
  gameState.priorityTargetCache = findBestCombatTarget(
    gameState.wave === 3 ? Math.max(TUNING.AUTO_AIM_MAX_DIST, 2.25) : TUNING.AUTO_AIM_MAX_DIST
  );

  // Assign radial stalking slots once per frame
  const occupiedSlots = new Set();
  for (let i = 0; i < bruisers.length; i++) {
    const b = bruisers[i];
    if (b.active && b.state !== 'ko' && b.state !== 'flying' && (b.state === 'windup' || b.state === 'striking') && b.slotIndex !== undefined) {
      occupiedSlots.add(b.slotIndex);
    }
  }
  for (let i = 0; i < bruisers.length; i++) {
    const b = bruisers[i];
    if (!b.active || b.state === 'ko' || b.state === 'flying') continue;
    if (b.slotIndex !== undefined && !occupiedSlots.has(b.slotIndex)) {
      occupiedSlots.add(b.slotIndex);
      continue;
    }
    const dx = b.rig.root.position.x - gameState.playerPos.x;
    const dz = b.rig.root.position.z - gameState.playerPos.z;
    let curAngle = Math.atan2(dx, -dz);
    if (curAngle < 0) curAngle += Math.PI * 2;
    let bestSlot = 0;
    let minDiff = Infinity;
    for (let s = 0; s < 6; s++) {
      if (occupiedSlots.has(s)) continue;
      let diff = Math.abs(curAngle - RADIAL_SLOTS[s].angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < minDiff) { minDiff = diff; bestSlot = s; }
    }
    b.slotIndex = bestSlot;
    occupiedSlots.add(bestSlot);
  }

  const waveCfg = TUNING.WAVES[gameState.wave] || TUNING.WAVES[1];
  let activeAttackerCount = bruisers.filter((b) => b.active && (b.state === 'windup' || b.state === 'striking')).length;
  if (gameState.kronosInRing && (
    gameState.kronosRingState === 'windup' || gameState.kronosRingState === 'striking' ||
    gameState.kronosRingState === 'windup_combo' || gameState.kronosRingState === 'striking_combo' ||
    gameState.kronosRingState === 'windup_shockwave' || gameState.kronosRingState === 'shockwave_active'
  )) {
    activeAttackerCount += 1;
  }

  const contextState = {
    waveCfg,
    activeAttackerCount,
    maxSimultaneousAttackers: waveCfg.maxSimultaneousAttackers,
    someoneWindingUp: activeAttackerCount >= waveCfg.maxSimultaneousAttackers
  };

  if (gameState.gameStarted && !gameState.isPaused && !gameState.isGameOver && songTime !== null) {
    updateSongEncounter(songTime, chart, dt);
    if (gameState.isGameOver) return;
    if (DIRECTOR_ENABLED) runCombatDirector(songTime, dt, chart, waveCfg);
  }

  for (let i = 0; i < bruisers.length; i++) {
    updateFighterFSM(bruisers[i], dt, rawDt, elapsed, beatPulse, songTime, chart, contextState);
  }

  // Wave progression when all Bruisers in Wave 1 or Wave 2 are defeated
  if (!SONG_ENCOUNTER && gameState.wave === 1 && getActiveBruiserCount() === 0 && !bruisers.some((b) => b.state === 'flying')) {
    audioEngine.triggerCrowdHype('wave-clear');
    spawnWave(2);
  } else if (!SONG_ENCOUNTER && gameState.wave === 2 && getActiveBruiserCount() === 0 && !bruisers.some((b) => b.state === 'flying')) {
    audioEngine.triggerCrowdHype('wave-clear');
    spawnWave(3);
  }

  updateFighterFSM({ isBoss: true }, dt, rawDt, elapsed, beatPulse, songTime, chart, contextState);
}

function updateHud(dt) {
  updateStyleRankAndHype(dt);
  updateHudNumbers();
}

const clock = new THREE.Clock();
let _debugHarnessRef = null;
let _crowdDeferredScheduled = false;
let _lastClockChart = null;

function animate() {
  requestAnimationFrame(animate);
  const _cpuStart = performance.now();

  const curWinW = Math.max(1, Math.floor(window.innerWidth || _lastCanvasW));
  const curWinH = Math.max(1, Math.floor(window.innerHeight || _lastCanvasH));
  if (curWinW !== _lastCanvasW || curWinH !== _lastCanvasH) {
    syncViewportResize();
  }

  const rawDt = Math.min(clock.getDelta(), 0.1);
  if (gameState.hitStopTimer > 0) {
    gameState.hitStopTimer -= rawDt;
  }
  const dt = gameState.hitStopTimer > 0 ? rawDt * TUNING.HIT_STOP.DILATION : rawDt;
  const elapsed = clock.getElapsedTime();

  if (postProcessing && postProcessing.update) {
    postProcessing.update(dt, rawDt);
  }

  const chart = audioEngine.getActiveChart();
  const songTime = audioEngine.getSongTime();
  if (chart !== _lastClockChart) {
    _lastClockChart = chart;
    clockSetActiveChart(chart);
  }
  if (songTime !== null) {
    tickBeatWarp(songTime, rawDt, Math.max(0, gameState.hitStopTimer || 0));
  }
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  const beatFloat = songTime !== null ? Math.max(0, (songTime - firstOffset) / beatSec) : 0;
  const beatPhase = songTime !== null ? (beatFloat % 1) : 0;
  const beatPulse = songTime !== null ? Math.exp(-beatPhase * 4.5) : 0;
  const bass = audioEngine.getBassEnergy();

  updatePlayer(dt, rawDt, elapsed, beatPulse);
  updateEnemies(dt, rawDt, elapsed, beatPulse, songTime, chart);
  updateVFX(dt, elapsed, beatPulse, beatPhase, bass, songTime, chart);
  updateCamera(dt, rawDt, elapsed);
  updateHud(dt);

  if (_debugHarnessRef && _debugHarnessRef.recordJointSampleFrame) {
    _debugHarnessRef.recordJointSampleFrame();
  }

  renderer.render(scene, camera);

  if (!_crowdDeferredScheduled) {
    _crowdDeferredScheduled = true;
    setTimeout(() => {
      buildDeferredInstancedCrowd();
    }, 0);
  }

  const _cpuMs = performance.now() - _cpuStart;
  gameState.lastFrameCpuMs = _cpuMs;
  if (window.__kronosRecordCpuFrames && Array.isArray(window.__kronosFrameCpuSamples)) {
    window.__kronosFrameCpuSamples.push(_cpuMs);
  }
}

// Dynamically load kronos-debug.js ONLY when ?debug=1 or ?turnaround= is present
if (IS_DEBUG_MODE) {
  import('./kronos-debug.js?v=20261018k').then(({ attachKronosDebugHarness }) => {
    _debugHarnessRef = attachKronosDebugHarness({
      THREE,
      renderer,
      scene,
      camera,
      cameraState,
      cameraJuice,
      CAMERA_PRESETS,
      setCameraPreset,
      updateCameraJuiceState,
      triggerCameraJuice,
      gameState,
      audioEngine,
      TUNING,
      postProcessing,
      challengerRig,
      challengerBlender,
      CHALLENGER_POSES,
      kronosRig,
      kronosBlender,
      kronosRingBadge,
      bruisers,
      crowdSpectators,
      boomboxStage,
      floorMesh,
      floorDial,
      challengerContactShadow,
      kronosContactShadow,
      spawnWave,
      triggerCombatAction,
      startGameSession: enterCypherFromStartOverlay,
      restartGameSession: restartGame,
      triggerGameEnd,
      getActiveBruiserCount,
      computeAccuracyRank,
      evaluateBeatWindow: (t, applyOutputLatency = audioEngine.isPlaying) => {
        if (t === undefined) return evaluateBeatWindow(audioEngine.getSongTime());
        const compT = (t !== null && applyOutputLatency) ? Math.max(0, t - audioEngine.getOutputLatencySec()) : t;
        return evaluateBeatWindow(compT);
      },
      evaluateBeatWindowAtTime: (t, applyOutputLatency = audioEngine.isPlaying) => {
        const compT = (t !== null && t !== undefined && applyOutputLatency) ? Math.max(0, t - audioEngine.getOutputLatencySec()) : t;
        return evaluateBeatWindow(compT);
      },
      quantizeWindupToBeat,
      estimateBpmFromAudioBuffer,
      buildCustomTrackChart,
      KRONOS_TRACK_CHARTS,
      KRONOS_BPM,
      KRONOS_BEAT_SEC,
      KRONOS_LOOP_DURATION,
      KRONOS_BEAT_TIMES,
      KRONOS_BARS,
      beatwarp: beatWarpModule,
      clock: audioClockModule,
      director: combatDirectorModule,
      getDirectorTelemetry,
      executeCounterAction,
      kronosDirectorEntity,
      getSectionAtTime,
      computeRunResultsSummary,
      beatWarpClock,
      scheduleBeatWarpAction,
      tickBeatWarp,
      clearActiveSchedules,
      cancelActorSchedules,
      clockNextSubdivision,
      clockNearestSubdivision,
      findNextChartSubdivision,
      findNearestChartSubdivision,
      clipPreloadPromise: _clipPreloadPromise,
      stepSimulation: (dtSec = 0.016) => {
        const chart = audioEngine.getActiveChart();
        const songTime = audioEngine.getSongTime();
        if (gameState.hitStopTimer > 0) gameState.hitStopTimer -= dtSec;
        if (songTime !== null) tickBeatWarp(songTime, dtSec, Math.max(0, gameState.hitStopTimer || 0));
        const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
        const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
        const beatFloat = songTime !== null ? Math.max(0, (songTime - firstOffset) / beatSec) : 0;
        const beatPhase = songTime !== null ? (beatFloat % 1) : 0;
        const beatPulse = songTime !== null ? Math.exp(-beatPhase * 4.5) : 0;
        const bass = audioEngine.getBassEnergy();
        const elapsed = clock.getElapsedTime();
        updatePlayer(dtSec, dtSec, elapsed, beatPulse);
        updateEnemies(dtSec, dtSec, elapsed, beatPulse, songTime, chart);
        updateVFX(dtSec, elapsed, beatPulse, beatPhase, bass, songTime, chart);
        updateCamera(dtSec, dtSec, elapsed);
        updateHud(dtSec);
        if (_debugHarnessRef && _debugHarnessRef.recordJointSampleFrame) {
          _debugHarnessRef.recordJointSampleFrame();
        }
      },
      updateHudNumbers,
      buildChallengerModel,
      buildKronosBossModel,
      buildBruiserModel,
      buildSpectatorModel,
      buildSubwooferShockwaveRing,
      setStarburstText,
      kickSmear,
      kronosTeleRing,
      kronosTeleMat,
      lights: {
        keyLight,
        hemiLight,
        characterRimLight,
        westBounceLight,
        westSconceLight,
        eastBounceLight,
        bodegaFrontLight,
        neonCyanLight,
        neonMagentaLight,
        streetlampLights,
        stageMagentaLight,
        stageCyanLight,
        vanHeadlights
      }
    });
  });
}

animate();
