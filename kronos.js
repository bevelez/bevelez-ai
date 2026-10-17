import * as THREE from 'three';
import {
  KRONOS_BPM,
  KRONOS_BEAT_SEC,
  KRONOS_FIRST_BEAT_OFFSET,
  KRONOS_LOOP_DURATION,
  KRONOS_BEAT_TIMES,
  KRONOS_BARS,
  KRONOS_TRACK_CHARTS,
  estimateBpmFromAudioBuffer,
  buildCustomTrackChart
} from './kronos-tracks.js?v=20261017b';
import {
  buildChallengerModel,
  buildPersistentKickSmearRig,
  buildKronosBossModel,
  buildBruiserModel,
  buildSpectatorModel,
  buildInstancedArenaCrowd,
  buildBoomboxStage,
  buildArenaEnvironment,
  buildFloorRhythmDial,
  buildSubwooferShockwaveRing,
  spawnStrikeSmearArc,
  spawn3DImpactBurst,
  createContactShadowDecal,
  createBakedArenaAOMapTexture,
  createBakedArenaLightMapTexture,
  createWeatheredAsphaltArenaTexture,
  ImpactBurstPool,
  SmearArcPool
} from './kronos-models.js?v=20261017b';
import { initPostProcessing } from './kronos-postprocessing.js?v=20261017b';

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
  INPUT_BUFFER_WINDOW_SEC: 0.163,
  PERFECT_WINDOW_SEC: 0.085,
  ON_BEAT_WINDOW_SEC: 0.165,
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
    'miss':           { startup: 0.040, active: 0.020, recovery: 0.220, baseDmg: 0 }
  }
};

let reducedMotionEnabled = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.__kronosReducedMotion = reducedMotionEnabled;

// ============================================================================
// 1. TABLE-DRIVEN FIGHTING FOLEY SYNTH + LYRIA 3.5 AUDIO ENGINE
// ============================================================================
const SFX_SYNTH_TABLE = {
  'punch-jab': {
    priority: 1, dur: 0.125, duck: null,
    thud: { gain: 0.42, dur: 0.120 },
    subDrop: { f0: 115, f1: 44, dur: 0.075, gain: 0.38, earlyGain: 0.22 },
    snap: { cf: 1600, maxCf: 2200, q: 1.8, gain: 0.44, dur: 0.050 },
    whoosh: { f0: 550, f1: 1750, q: 1.6, gain: 0.22, dur: 0.060 },
    air: { perfectGain: 0.16, goodGain: 0.08, dur: 0.035 },
    chord: { notes: [196.00, 146.83], lp: 650, maxLp: 800, q: 0.707, perfectGain: 0.12, goodGain: 0.06, dur: 0.110 }
  },
  'punch-cross': {
    priority: 2, dur: 0.165, duck: null,
    thud: { gain: 0.48, dur: 0.150 },
    subPunch: { gain: 0.40, earlyGain: 0.20, dur: 0.140 },
    subDrop: { f0: 135, f1: 38, dur: 0.105, gain: 0.45, earlyGain: 0.25 },
    snap: { cf: 1250, maxCf: 1800, q: 1.8, gain: 0.50, dur: 0.070 },
    whoosh: { f0: 480, f1: 1600, q: 1.6, gain: 0.26, dur: 0.090 },
    air: { perfectGain: 0.18, goodGain: 0.08, dur: 0.038 },
    chord: { notes: [116.54, 146.83, 174.61], lp: 850, maxLp: 1000, q: 0.8, perfectGain: 0.14, goodGain: 0.07, dur: 0.150 }
  },
  'punch-uppercut': {
    priority: 5, dur: 0.245, duck: { perfect: -3.5, good: -2.0, early: -0.8, dur: 0.18 },
    subPunch: { gain: 0.65, earlyGain: 0.35, dur: 0.210 },
    thud: { gain: 0.58, dur: 0.160 },
    subDrop: { f0: 160, f1: 32, dur: 0.170, gain: 0.58, earlyGain: 0.45 },
    dualSnap: { cfs: [850, 1900], gain: 0.55, dur: 0.100 },
    whoosh: { f0: 380, f1: 2100, q: 1.8, gain: 0.32, dur: 0.135 },
    air: { perfectGain: 0.22, goodGain: 0.10, dur: 0.040 },
    stinger: { notes: [{ f: 98.00, dt: 0 }, { f: 146.83, dt: 0.02 }, { f: 196.00, dt: 0.04 }, { f: 233.08, dt: 0.06 }], lp: 1100, maxLp: 1200, q: 0.9, perfectGain: 0.16, goodGain: 0.08, dur: 0.220 }
  },
  'kick': {
    priority: 4, dur: 0.270, duck: { perfect: -4.5, good: -2.5, early: -1.0, dur: 0.22 },
    subPunch: { gain: 0.70, earlyGain: 0.40, dur: 0.220 },
    thud: { gain: 0.65, dur: 0.160 },
    subDrop: { f0: 140, f1: 32.7, dur: 0.200, gain: 0.68, earlyGain: 0.50, saturated: true },
    snap: { cf: 950, maxCf: 1400, q: 1.4, gain: 0.55, dur: 0.065 },
    whoosh: { f0: 320, f1: 1500, q: 1.7, gain: 0.36, dur: 0.160 },
    air: { perfectGain: 0.20, goodGain: 0.09, dur: 0.038 },
    chord: { notes: [98.00, 146.83, 196.00, 293.66], lp: 950, maxLp: 1100, q: 1.0, perfectGain: 0.18, goodGain: 0.09, dur: 0.250 }
  },
  'dodge': {
    priority: 3, dur: 0.155, duck: null,
    whoosh: { f0: 450, f1: 1550, q: 1.8, gain: 0.38, dur: 0.145 },
    air: { perfectGain: 0.12, goodGain: 0.12, dur: 0.038, always: true },
    resTone: { f: 196.00, q: 3.0, gain: 0.035, dur: 0.120 }
  },
  'miss-whiff': {
    priority: 1, dur: 0.110, duck: null,
    whoosh: { f0: 340, f1: 820, q: 2.0, gain: 0.20, dur: 0.095 },
    subDrop: { f0: 95, f1: 62, dur: 0.070, gain: 0.14, earlyGain: 0.14 }
  },
  'counter-weave': {
    priority: 8, dur: 0.390, duck: { perfect: -5.0, good: -5.0, early: -5.0, dur: 0.25 },
    whoosh: { f0: 300, f1: 2600, q: 2.2, gain: 0.36, dur: 0.080 },
    subPunch: { gain: 0.45, earlyGain: 0.45, dur: 0.180 },
    thud: { gain: 0.55, dur: 0.140 },
    air: { perfectGain: 0.22, goodGain: 0.22, dur: 0.040, always: true },
    chord: { notes: [196.00, 233.08, 293.66, 349.23], lp: 1100, maxLp: 1200, q: 1.1, perfectGain: 0.18, goodGain: 0.18, dur: 0.220, always: true },
    chime: { notes: [293.66, 392.00], lp: 600, maxLp: 750, q: 1.2, gain: 0.10, dur: 0.350 }
  },
  'enemy-telegraph': {
    priority: 6, dur: 0.225, duck: null,
    tensionDrone: { f0A: 146.83, f1A: 155.56, f0B: 98.00, f1B: 116.54, lp: 480, maxLp: 600, q: 1.4, gain: 0.24, dur: 0.210 },
    whoosh: { f0: 280, f1: 750, q: 1.8, gain: 0.26, dur: 0.200 },
    thud: { gain: 0.20, dur: 0.100 }
  },
  'player-damaged': {
    priority: 7, dur: 0.220, duck: { perfect: -6.0, good: -6.0, early: -6.0, dur: 0.30 }, concussion: { cutoff: 450, dur: 0.40 },
    thud: { gain: 0.68, dur: 0.170 },
    subPunch: { gain: 0.60, earlyGain: 0.60, dur: 0.180 },
    subDrop: { f0: 92, f1: 26, dur: 0.140, gain: 0.62, earlyGain: 0.62 },
    snap: { cf: 520, maxCf: 800, q: 1.8, gain: 0.52, dur: 0.080, saturated: true }
  },
  'guard-deflect': {
    priority: 4, dur: 0.140, duck: null,
    thud: { gain: 0.35, dur: 0.095 },
    snap: { cf: 1400, maxCf: 1850, q: 2.4, gain: 0.36, dur: 0.055 },
    chime: { notes: [392.00, 587.33], lp: 950, maxLp: 1100, q: 1.4, gain: 0.08, dur: 0.120 }
  },
  'guard-break': {
    priority: 8, dur: 0.280, duck: { perfect: -6.0, good: -6.0, early: -6.0, dur: 0.25 }, concussion: { cutoff: 600, dur: 0.35 },
    subDrop: { f0: 160, f1: 40, dur: 0.190, gain: 0.60, earlyGain: 0.60 },
    thud: { gain: 0.58, dur: 0.150 },
    snap: { cf: 1450, maxCf: 1900, q: 3.0, gain: 0.52, dur: 0.120, saturated: true },
    chime: { notes: [659.25, 987.77], lp: 1200, maxLp: 1400, q: 1.2, gain: 0.14, dur: 0.260 }
  },
  'subwoofer-bass-drop': {
    priority: 8, dur: 0.480, duck: { perfect: -5.5, good: -5.5, early: -5.5, dur: 0.32 },
    subPunch: { gain: 0.72, earlyGain: 0.72, dur: 0.220 },
    thud: { gain: 0.64, dur: 0.160 },
    subDrop: { f0: 110, f1: 28, dur: 0.420, gain: 0.75, earlyGain: 0.75, saturated: true },
    whoosh: { f0: 240, f1: 1200, q: 1.6, gain: 0.32, dur: 0.220 }
  },
  'stage-ko': {
    priority: 9, dur: 1.150, duck: { perfect: -8.0, good: -8.0, early: -8.0, dur: 0.55 }, concussion: { cutoff: 450, dur: 0.45 },
    subPunch: { gain: 0.75, earlyGain: 0.75, dur: 0.220 },
    thud: { gain: 0.70, dur: 0.160 },
    subDrop: { f0: 80, f1: 22, dur: 0.450, gain: 0.85, earlyGain: 0.85, saturated: true },
    vinylScratch: { f0: 1400, f1: 90, modF: 85, modG0: 450, modG1: 40, lp: 1600, gain: 0.38, dur: 0.180 },
    crowdCheer: { formants: [{ f: 450, q: 3.5 }, { f: 1150, q: 4.0 }, { f: 2400, q: 3.0 }], gain: 0.45, dur: 1.080 },
    chord: { notes: [196.00, 233.08, 293.66, 349.23], lp: 1100, maxLp: 1200, q: 1.1, perfectGain: 0.32, goodGain: 0.32, dur: 0.320, always: true }
  }
};
SFX_SYNTH_TABLE.punch = SFX_SYNTH_TABLE['punch-uppercut'];

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
    this.MAX_CATEGORY_VOICES = {
      'stage-ko': 2,
      'kick': 4,
      'counter-weave': 3,
      'enemy-telegraph': 3,
      'crowd-swell': 2
    };
    this.lastDuck = null;
    this._activeDuckTargetGain = 1.0;
    this._activeDuckEndTime = 0;
    this._activeConcCutoff = 20000;
    this._activeConcEndTime = 0;
    this.sfxCarveFilter = null;
    this.sfxLimiter = null;
    this.masterLimiter = null;
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
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => {});
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
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => {});
    }
    const trackKey = this.activeTrackKey === 'custom' ? 'flow' : this.activeTrackKey;
    const activeEl = this.tracks[trackKey];
    if (!activeEl) {
      this.isPlaying = false;
      return false;
    }
    try {
      await activeEl.play();
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

  getSongTime() {
    if (IS_DEBUG_MODE && typeof gameState !== 'undefined' && gameState._debugMusicPlaying) {
      return Number(gameState._debugSongTime) || 0;
    }
    const activeMediaKey = this.activeTrackKey === 'custom' ? 'flow' : this.activeTrackKey;
    const activeEl = this.tracks[activeMediaKey];
    if (this.isPlaying && activeEl && !activeEl.paused) {
      const outLatency = (this.ctx && this.ctx.outputLatency) ? this.ctx.outputLatency : 0.015;
      return Math.max(0, activeEl.currentTime - outLatency);
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

    const comboNum = options.combo || (type === 'combo-4' ? 4 : (type === 'combo-8' ? 8 : (type === 'combo-12' ? 12 : 0)));
    let dur = 0.65, peakGain = 0.22, duckAmount = -1.8;
    let formants = [{ f: 380, q: 4.0 }, { f: 620, q: 4.5 }, { f: 1050, q: 5.0 }];

    if (type === 'counter-weave') {
      dur = 0.55; peakGain = 0.34; duckAmount = -3.5;
      formants = [{ f: 580, q: 3.5 }, { f: 1350, q: 4.0 }, { f: 2200, q: 2.8 }];
    } else if (type === 'wave-clear') {
      dur = 1.95; peakGain = 0.42; duckAmount = -4.5;
      formants = [{ f: 420, q: 3.0 }, { f: 1050, q: 3.5 }, { f: 2300, q: 2.5 }];
    } else if (type === 'combo-12' || comboNum >= 12) {
      dur = 1.30; peakGain = 0.38; duckAmount = -3.5;
      formants = [{ f: 450, q: 3.2 }, { f: 1100, q: 3.8 }, { f: 2400, q: 3.0 }];
    } else if (type === 'combo-8' || comboNum >= 8) {
      dur = 0.98; peakGain = 0.30; duckAmount = -2.5;
      formants = [{ f: 500, q: 3.0 }, { f: 950, q: 3.2 }, { f: 1350, q: 3.5 }];
    }

    const voiceNodes = [];
    const cheerGain = this.ctx.createGain();
    cheerGain.gain.setValueAtTime(0.0001, now);
    cheerGain.gain.linearRampToValueAtTime(peakGain, now + dur * 0.12);
    cheerGain.gain.setValueAtTime(peakGain, now + dur * 0.38);
    cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    cheerGain.connect(this.sfxBus);
    voiceNodes.push(cheerGain);

    const crowdBuf = (this.noiseBuffers && this.noiseBuffers.crowd) || (this.foleyBuffers && this.foleyBuffers.clothWhoosh);
    if (crowdBuf) {
      formants.forEach((fmt) => {
        const src = this.ctx.createBufferSource();
        src.buffer = crowdBuf;
        src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(fmt.f, now);
        bp.frequency.linearRampToValueAtTime(fmt.f * 1.08, now + dur * 0.45);
        bp.Q.value = fmt.q;
        src.connect(bp);
        bp.connect(cheerGain);
        src.start(now);
        src.stop(now + dur + 0.02);
        voiceNodes.push(src, bp);
      });
    }

    const chordGain = this.ctx.createGain();
    const chordPeak = type === 'wave-clear' ? 0.09 : (comboNum >= 8 || type === 'counter-weave' ? 0.06 : 0.035);
    chordGain.gain.setValueAtTime(0.0001, now);
    chordGain.gain.linearRampToValueAtTime(chordPeak, now + 0.04);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.72);

    const chordFilter = this.ctx.createBiquadFilter();
    chordFilter.type = 'lowpass';
    chordFilter.frequency.setValueAtTime(850, now);
    chordFilter.Q.value = 1.8;
    chordGain.connect(chordFilter);
    chordFilter.connect(this.sfxBus);
    voiceNodes.push(chordGain, chordFilter);

    const gmChord = [196.00, 233.08, 293.66, 392.00];
    gmChord.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(chordGain);
      osc.start(now);
      osc.stop(now + dur * 0.72);
      voiceNodes.push(osc);
    });

    this.duckMusic(duckAmount, Math.min(0.45, dur * 0.4));
    const voiceMeta = {
      action: 'crowd-swell',
      startTime: now,
      priority: 6,
      nodes: voiceNodes,
      chordFilter,
      chordGain,
      gmChord
    };
    this.lastCrowdHype = voiceMeta;
    this.registerVoiceCleanup(voiceNodes, dur + 0.05, voiceMeta);

    if (typeof gameState !== 'undefined' && gameState) {
      gameState.crowdHypeTimer = Math.max(gameState.crowdHypeTimer || 0, dur);
    }
    return true;
  }

  playCombatSfx(action, grade = 'PERFECT', spatialSource = null) {
    if (!this.ctx && !this.userGestureUnlocked) return;
    this.initContext();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    const recipe = SFX_SYNTH_TABLE[action] || SFX_SYNTH_TABLE['punch-jab'];
    const now = this.ctx.currentTime;
    const isPerfect = grade === 'PERFECT';
    const isGood = grade === 'GOOD';
    const isEarly = !isPerfect && !isGood;
    const gradeMult = isPerfect ? 1.0 : (isGood ? 0.82 : 0.60);
    const detuneMult = Math.pow(2, ((Math.random() * 2 - 1) * 12) / 1200);
    const filterJitter = 1.0 + (Math.random() * 2 - 1) * 0.06;

    this._enforcePolyphony(action, this.MAX_CATEGORY_VOICES ? this.MAX_CATEGORY_VOICES[action] : null);

    const voiceNodes = [];
    let voiceBus = this.sfxBus;
    let voicePanner = null;
    if (spatialSource !== null && spatialSource !== undefined && this.ctx.createStereoPanner) {
      const panVal = typeof spatialSource === 'number'
        ? Math.max(-0.92, Math.min(0.92, spatialSource))
        : this.calculateSpatialPan(spatialSource);
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = panVal;
      panner.pan.setValueAtTime(panVal, now);
      panner.connect(this.sfxBus);
      voiceNodes.push(panner);
      voiceBus = panner;
      voicePanner = panner;
      this.lastPan = panVal;
      this.lastPanner = panner;
    }

    const voiceMeta = {
      action, grade, gradeMult, isPerfect, isGood, isEarly,
      startTime: now, priority: recipe.priority || 1,
      nodes: voiceNodes, panner: voicePanner
    };
    this.lastVoice = voiceMeta;

    if (recipe.thud && this.foleyBuffers.bodyThud) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.foleyBuffers.bodyThud;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(recipe.thud.gain * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.thud.dur);
      src.connect(g); g.connect(voiceBus);
      src.start(now); src.stop(now + recipe.thud.dur + 0.005);
      voiceNodes.push(src, g);
    }

    if (recipe.subPunch && this.foleyBuffers.subPunch) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.foleyBuffers.subPunch;
      const g = this.ctx.createGain();
      const baseG = isEarly ? (recipe.subPunch.earlyGain || recipe.subPunch.gain) : recipe.subPunch.gain;
      g.gain.setValueAtTime(baseG * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.subPunch.dur);
      src.connect(g); g.connect(voiceBus);
      src.start(now); src.stop(now + recipe.subPunch.dur + 0.005);
      voiceNodes.push(src, g);
    }

    if (recipe.subDrop) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(recipe.subDrop.f0 * detuneMult, now);
      osc.frequency.exponentialRampToValueAtTime(recipe.subDrop.f1 * detuneMult, now + recipe.subDrop.dur * 0.92);
      const g = this.ctx.createGain();
      const baseG = isEarly ? (recipe.subDrop.earlyGain || recipe.subDrop.gain) : recipe.subDrop.gain;
      g.gain.setValueAtTime(baseG * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.subDrop.dur);
      if (recipe.subDrop.saturated) {
        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.shaperCurves.softClip;
        shaper.oversample = '2x';
        osc.connect(shaper); shaper.connect(g);
        voiceNodes.push(shaper);
      } else {
        osc.connect(g);
      }
      g.connect(voiceBus);
      osc.start(now); osc.stop(now + recipe.subDrop.dur + 0.005);
      voiceNodes.push(osc, g);
    }

    if (recipe.snap && this.foleyBuffers.gloveSnap) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.foleyBuffers.gloveSnap;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(Math.min(recipe.snap.maxCf, recipe.snap.cf * filterJitter), now);
      bp.Q.value = recipe.snap.q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(recipe.snap.gain * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.snap.dur);
      if (recipe.snap.saturated) {
        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.shaperCurves.softClip;
        src.connect(shaper); shaper.connect(bp);
        voiceNodes.push(shaper);
      } else {
        src.connect(bp);
      }
      bp.connect(g); g.connect(voiceBus);
      src.start(now); src.stop(now + recipe.snap.dur + 0.005);
      voiceNodes.push(src, bp, g);
    }

    if (recipe.dualSnap && this.foleyBuffers.gloveSnap) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(recipe.dualSnap.gain * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.dualSnap.dur);
      g.connect(voiceBus);
      voiceNodes.push(g);
      recipe.dualSnap.cfs.forEach((cf) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.foleyBuffers.gloveSnap;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = Math.min(2200, cf * filterJitter);
        bp.Q.value = cf === 850 ? 2.0 : 1.8;
        src.connect(bp); bp.connect(g);
        src.start(now); src.stop(now + recipe.dualSnap.dur + 0.005);
        voiceNodes.push(src, bp);
      });
    }

    if (recipe.whoosh && this.foleyBuffers.clothWhoosh) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.foleyBuffers.clothWhoosh;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(recipe.whoosh.f0 * filterJitter, now);
      bp.frequency.exponentialRampToValueAtTime(recipe.whoosh.f1 * filterJitter, now + recipe.whoosh.dur);
      bp.Q.value = recipe.whoosh.q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(recipe.whoosh.gain * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.whoosh.dur);
      src.connect(bp); bp.connect(g); g.connect(voiceBus);
      src.start(now); src.stop(now + recipe.whoosh.dur + 0.005);
      voiceNodes.push(src, bp, g);
    }

    if (recipe.air && this.foleyBuffers.transientAir && (isPerfect || isGood || recipe.air.always)) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.foleyBuffers.transientAir;
      const g = this.ctx.createGain();
      const baseG = isPerfect ? recipe.air.perfectGain : recipe.air.goodGain;
      g.gain.setValueAtTime(baseG * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.air.dur);
      src.connect(g); g.connect(voiceBus);
      src.start(now); src.stop(now + recipe.air.dur + 0.004);
      voiceNodes.push(src, g);
    }

    if (recipe.chord && (isPerfect || isGood || recipe.chord.always)) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(recipe.chord.maxLp, recipe.chord.lp * filterJitter), now);
      lp.Q.value = recipe.chord.q;
      const g = this.ctx.createGain();
      const baseG = isPerfect ? recipe.chord.perfectGain : recipe.chord.goodGain;
      g.gain.setValueAtTime(baseG * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.chord.dur);
      lp.connect(g); g.connect(voiceBus);
      voiceNodes.push(lp, g);
      recipe.chord.notes.forEach((f) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f * detuneMult, now);
        osc.connect(lp);
        osc.start(now); osc.stop(now + recipe.chord.dur + 0.005);
        voiceNodes.push(osc);
      });
    }

    if (recipe.stinger && (isPerfect || isGood)) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(recipe.stinger.maxLp, recipe.stinger.lp * filterJitter), now);
      lp.Q.value = recipe.stinger.q;
      const g = this.ctx.createGain();
      const baseG = isPerfect ? recipe.stinger.perfectGain : recipe.stinger.goodGain;
      g.gain.setValueAtTime(baseG * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.stinger.dur);
      lp.connect(g); g.connect(voiceBus);
      voiceNodes.push(lp, g);
      recipe.stinger.notes.forEach((note) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f * detuneMult, now + note.dt);
        osc.connect(lp);
        osc.start(now + note.dt); osc.stop(now + note.dt + 0.160);
        voiceNodes.push(osc);
      });
    }

    if (recipe.chime) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(recipe.chime.maxLp, recipe.chime.lp * filterJitter), now);
      lp.Q.value = recipe.chime.q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(recipe.chime.gain * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.chime.dur);
      lp.connect(g); g.connect(voiceBus);
      voiceNodes.push(lp, g);
      recipe.chime.notes.forEach((f) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * detuneMult, now);
        osc.connect(lp);
        osc.start(now); osc.stop(now + recipe.chime.dur + 0.005);
        voiceNodes.push(osc);
      });
    }

    if (recipe.resTone) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(recipe.resTone.f * detuneMult, now);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = recipe.resTone.f * detuneMult;
      bp.Q.value = recipe.resTone.q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(recipe.resTone.gain * gradeMult, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.resTone.dur);
      osc.connect(bp); bp.connect(g); g.connect(voiceBus);
      osc.start(now); osc.stop(now + recipe.resTone.dur + 0.005);
      voiceNodes.push(osc, bp, g);
    }

    if (recipe.tensionDrone) {
      const td = recipe.tensionDrone;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(td.maxLp, td.lp * filterJitter);
      lp.Q.value = td.q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(td.gain, now + 0.010);
      g.gain.exponentialRampToValueAtTime(0.0001, now + td.dur);
      lp.connect(g); g.connect(voiceBus);
      voiceNodes.push(lp, g);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(td.f0A * detuneMult, now);
      osc1.frequency.exponentialRampToValueAtTime(td.f1A * detuneMult, now + 0.180);
      osc1.connect(lp); osc1.start(now); osc1.stop(now + td.dur + 0.005);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(td.f0B * detuneMult, now);
      osc2.frequency.exponentialRampToValueAtTime(td.f1B * detuneMult, now + 0.180);
      osc2.connect(lp); osc2.start(now); osc2.stop(now + td.dur + 0.005);
      voiceNodes.push(osc1, osc2);
    }

    if (recipe.vinylScratch) {
      const vs = recipe.vinylScratch;
      const carrier = this.ctx.createOscillator();
      const modulator = this.ctx.createOscillator();
      const modGain = this.ctx.createGain();
      const fmLp = this.ctx.createBiquadFilter();
      fmLp.type = 'lowpass';
      fmLp.frequency.value = Math.min(1800, vs.lp * filterJitter);
      const fmGain = this.ctx.createGain();
      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(vs.f0 * detuneMult, now);
      carrier.frequency.exponentialRampToValueAtTime(vs.f1 * detuneMult, now + 0.140);
      modulator.type = 'sine';
      modulator.frequency.setValueAtTime(vs.modF, now);
      modGain.gain.setValueAtTime(vs.modG0, now);
      modGain.gain.exponentialRampToValueAtTime(vs.modG1, now + 0.140);
      modulator.connect(modGain); modGain.connect(carrier.frequency);
      carrier.connect(fmLp); fmLp.connect(fmGain);
      fmGain.gain.setValueAtTime(vs.gain, now);
      fmGain.gain.exponentialRampToValueAtTime(0.0001, now + vs.dur);
      fmGain.connect(voiceBus);
      carrier.start(now); modulator.start(now);
      carrier.stop(now + vs.dur + 0.005); modulator.stop(now + vs.dur + 0.005);
      voiceNodes.push(carrier, modulator, modGain, fmLp, fmGain);
    }

    if (recipe.crowdCheer && this.noiseBuffers.crowd) {
      const cc = recipe.crowdCheer;
      const cheerGain = this.ctx.createGain();
      cheerGain.gain.setValueAtTime(0.0001, now);
      cheerGain.gain.linearRampToValueAtTime(cc.gain, now + 0.080);
      cheerGain.gain.setValueAtTime(cc.gain, now + 0.330);
      cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + cc.dur);
      cheerGain.connect(voiceBus);
      voiceNodes.push(cheerGain);
      cc.formants.forEach((fmt) => {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffers.crowd;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = fmt.f;
        bp.Q.value = fmt.q;
        src.connect(bp); bp.connect(cheerGain);
        src.start(now); src.stop(now + cc.dur + 0.02);
        voiceNodes.push(src, bp);
      });
    }

    if (recipe.concussion) {
      this.triggerConcussion(recipe.concussion.cutoff, recipe.concussion.dur);
    }
    if (recipe.duck) {
      const db = isPerfect ? recipe.duck.perfect : (isGood ? recipe.duck.good : recipe.duck.early);
      this.duckMusic(db, recipe.duck.dur);
    }

    this.registerVoiceCleanup(voiceNodes, recipe.dur, voiceMeta);
  }
}

const audioEngine = new KronosAudioEngine();
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
      } else if (attackType === 'bass_shockwave' || (labelOverride && labelOverride.includes('BASS DROP'))) {
        bannerFill = 'rgba(255, 30, 56, 0.98)';
        strokeColor = '#ffe042';
        textColor = '#ffffff';
        headerTxt = labelOverride || '! SUBWOOFER BASS DROP !';
      } else if (attackType === 'mic_drop_combo' || (labelOverride && labelOverride.includes('MIC DROP'))) {
        bannerFill = 'rgba(255, 170, 24, 0.98)';
        strokeColor = '#ffe042';
        textColor = '#101018';
        headerTxt = labelOverride || '! MIC DROP SLAM [A] !';
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

function computeAccuracyRank() {
  if (gameState.confirmedHits <= 0) {
    return { rank: '—', shortRank: '—', mult: 1.0, perfectPct: 0 };
  }
  const perfectPct = (gameState.perfectHits / Math.max(1, gameState.confirmedHits)) * 100;
  if (perfectPct >= 75 && gameState.confirmedHits >= 5) {
    return { rank: 'S-RANK', shortRank: 'S', mult: 1.8, perfectPct };
  }
  if (perfectPct >= 55 && gameState.confirmedHits >= 3) {
    return { rank: 'A-RANK', shortRank: 'A', mult: 1.5, perfectPct };
  }
  if (perfectPct >= 35 && gameState.confirmedHits >= 2) {
    return { rank: 'B-RANK', shortRank: 'B', mult: 1.25, perfectPct };
  }
  if (perfectPct >= 15 || gameState.confirmedHits >= 1) {
    return { rank: 'C-RANK', shortRank: 'C', mult: 1.1, perfectPct };
  }
  return { rank: 'D-RANK', shortRank: 'D', mult: 1.0, perfectPct };
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

function evaluateBeatWindow(songTime) {
  const chart = audioEngine.getActiveChart();
  const beatSec = chart.beatSec || KRONOS_BEAT_SEC;
  const firstOffset = chart.firstBeatOffset !== undefined ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;

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
      timeUntilBeat: 0.075
    };
  }

  let minDelta = Infinity;
  let nearestFutureDelta = Infinity;
  if (!chart.moduloOnly && Array.isArray(chart.beatTimes) && chart.beatTimes.length > 0) {
    for (let i = 0; i < chart.beatTimes.length; i++) {
      const bt = chart.beatTimes[i];
      const d = Math.abs(songTime - bt);
      if (d < minDelta) minDelta = d;
      if (bt >= songTime && (bt - songTime) < nearestFutureDelta) {
        nearestFutureDelta = bt - songTime;
      }
    }
  }

  const modPhase = (((songTime - firstOffset) % beatSec) + beatSec) % beatSec;
  const modDelta = Math.min(modPhase, beatSec - modPhase);
  const delta = chart.moduloOnly ? modDelta : Math.min(minDelta, modDelta);
  const timeUntilBeat = Math.min(nearestFutureDelta, beatSec - modPhase);

  if (delta <= TUNING.PERFECT_WINDOW_SEC) {
    return { grade: 'PERFECT', label: 'PERFECT!', color: '#ffe042', mult: 1.5, onBeat: true, delta, timeUntilBeat };
  }
  if (delta <= TUNING.ON_BEAT_WINDOW_SEC) {
    return { grade: 'GOOD', label: 'ON BEAT!', color: '#42f56c', mult: 1.15, onBeat: true, delta, timeUntilBeat };
  }
  return { grade: 'MISS', label: 'MISS!', color: '#ff385c', mult: 0.0, onBeat: false, delta, timeUntilBeat };
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
  if (elHypeFill) elHypeFill.style.width = `${Math.max(0, Math.min(100, gameState.hype))}%`;
  if (elHypeVal) elHypeVal.textContent = `${Math.round(gameState.hype)}%`;

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
    const crewPct = totalCrewMax > 0 ? Math.round((totalCrewHp / totalCrewMax) * 100) : 100;
    gameState.crewHp = crewPct;
    if (elBossHpFill) elBossHpFill.style.width = `${Math.max(0, Math.min(100, crewPct))}%`;
    if (elKronosHpText) elKronosHpText.textContent = `CREW: ${crewPct}%`;
  } else {
    if (elBossHpFill) elBossHpFill.style.width = `${Math.max(0, Math.min(100, gameState.bossHp))}%`;
    if (elKronosHpText) elKronosHpText.textContent = `KRONOS: ${Math.round(gameState.bossHp)}%`;
  }

  if (elWaveStatusPill) {
    const activeCount = getActiveBruiserCount();
    if (gameState.wave === 1) {
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
  if (waveNum === 1) {
    gameState.kronosRingState = 'idle';
    gameState.crewHp = 100;
    gameState.bossHp = 100;
    if (gameState.kronosInRing) {
      gameState.kronosInRing = false;
      boomboxStage.soundRigGroup.add(kronosRig.root);
      kronosRig.root.scale.setScalar(0.58);
      kronosRig.root.position.set(0, 1.38, 1.25);
      kronosRig.root.rotation.set(0, 0, 0);
      kronosRingBadge.mesh.visible = false;
    }
    const wave1Configs = [
      { active: true, angle: -0.52, radius: 1.75, hp: 140, cd: 1.4 },
      { active: true, angle: 0.62,  radius: 1.95, hp: 140, cd: 2.6 },
      { active: false, angle: 0.0,  radius: 3.50, hp: 0,   cd: 99 }
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
    const wave2Configs = [
      { active: true, angle: -0.78, radius: 1.85, hp: 120, cd: 1.2 },
      { active: true, angle: 0.04,  radius: 1.78, hp: 120, cd: 2.2 },
      { active: true, angle: 0.82,  radius: 2.00, hp: 120, cd: 3.1 }
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
    gameState.kronosAttackCooldown = 1.45;
    gameState.kronosRingPos.set(0.32, 0, 0.05);
    gameState.bossAttackPattern = 'idle';
    gameState.bossComboStep = 0;
    gameState.bossCounterStunActive = false;
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
        b.hp = 110;
        b.maxHp = 110;
        b.state = 'stalking';
        b.stateTimer = 0;
        b.attackType = 'heavy_haymaker';
        b.isGuarding = false;
        b.slotIndex = 4;
        b.guardCooldown = 99;
        b.attackCooldown = 2.4;
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
  b.state = 'flying';
  b.teleMat.opacity = 0;
  b.badge.update(0, b.maxHp, 'ko', 'SPEAKERBOX K.O.!');
  if (b.blender) {
    b.blender.setTarget({
      torso: [-0.35, 0, 0],
      headGroup: [-0.2, 0, 0],
      leftArm: [-1.2, 0, -0.5],
      rightArm: [-1.2, 0, 0.5],
      leftElbow: [0.4, 0, 0],
      rightElbow: [0.4, 0, 0],
      leftLeg: [0.3, 0, -0.15],
      rightLeg: [0.3, 0, 0.15],
      leftKnee: [-0.1, 0, 0],
      rightKnee: [-0.1, 0, 0]
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
      : ((b.state === 'stunned' || b.state === 'guard_break') ? -1.0 : (b.state === 'guard' ? -0.5 : 0));
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
  if (gameState.runStartTimeMs > 0) {
    gameState.runElapsedSec = (performance.now() - gameState.runStartTimeMs) * 0.001;
  }
  audioEngine.pause();
  if (btnPlay) {
    btnPlay.classList.remove('playing');
    btnPlay.textContent = '▶ PLAY';
  }

  const acc = computeAccuracyRank();
  const elKicker = document.getElementById('results-tag') || document.getElementById('results-kicker');
  const elTitle = document.getElementById('results-title');
  const elRankBadge = document.getElementById('results-rank') || document.getElementById('results-rank-badge');
  const elHits = document.getElementById('results-hits');
  const elAccuracy = document.getElementById('results-accuracy');
  const elTime = document.getElementById('results-time');
  const elSubtext = document.getElementById('results-subtitle') || document.getElementById('results-subtext');

  if (elKicker) elKicker.textContent = isVictory ? 'STAGE CLEAR // VICTORY' : 'K.O. // DEFEATED';
  if (elTitle) elTitle.textContent = isVictory ? 'CYPHER CROWNED' : 'CHALLENGER DOWN';
  if (elRankBadge) elRankBadge.textContent = isVictory ? (acc.shortRank === '—' ? 'B' : acc.shortRank) : 'D';
  if (elHits) elHits.textContent = String(gameState.confirmedHits);
  if (elAccuracy) elAccuracy.textContent = `${Math.round(acc.perfectPct)}%`;
  if (elTime) elTime.textContent = formatClearTime(gameState.runElapsedSec);
  if (elSubtext) {
    elSubtext.textContent = isVictory
      ? `DJ Kronos defeated! Max Combo: ${gameState.maxCombo} · Off-Beat Misses: ${gameState.missedPresses}.`
      : `Knocked out in Wave ${gameState.wave}/3. Confirmed Hits: ${gameState.confirmedHits}.`;
  }
  if (elResultsOverlay) {
    elResultsOverlay.classList.remove('hidden');
  }
}

function restartGame() {
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
  gameState.styleRank = '—';
  gameState.hype = 0.0;
  gameState.kronosRingState = 'idle';
  gameState.isAttacking = false;
  gameState.attackPhase = 'idle';
  gameState.pendingHit = null;
  gameState.inputBuffer = null;
  gameState.playerPos.copy(gameState.basePos);
  gameState.playerTarget.copy(gameState.basePos);

  if (elStartOverlay) elStartOverlay.classList.add('hidden');
  if (elPauseOverlay) elPauseOverlay.classList.add('hidden');
  if (elResultsOverlay) elResultsOverlay.classList.add('hidden');

  spawnWave(1);
  updateHudNumbers();
}

// ============================================================================
// ACTIVE-PHASE HIT RESOLUTION (Section 2.1, 2.2, 2.6, 2.8)
// ============================================================================
function resolveActivePhaseAttack(hitCtx) {
  if (!hitCtx || hitCtx.resolved) return;
  hitCtx.resolved = true;

  const { action, punchStep, timing, moveKey } = hitCtx;
  if (hitCtx.isMiss || timing.grade === 'MISS') {
    return;
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

  // Air Whiff if no enemy passes live distance + facing check inside ACTIVE window
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
  const counterMult = (gameState.kronosRingState === 'counter_stun' || gameState.counterBonusTimer > 0) ? 2.0 : 1.0;
  if (counterMult > 1.0 && gameState.kronosRingState !== 'counter_stun') {
    gameState.counterBonusTimer = 0;
  }

  // Increment confirmed hit & accuracy counters
  gameState.combo += 1;
  gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
  gameState.comboDecayTimer = TUNING.COMBO_DECAY_SEC;
  gameState.confirmedHits += 1;
  if (isPerfect) {
    gameState.perfectHits += 1;
  } else {
    gameState.onBeatHits += 1;
  }
  gameState.combatIdleTimer = 0;
  updateStyleRankAndHype(0);

  if (gameState.combo === 4 || gameState.combo === 8 || gameState.combo === 12) {
    audioEngine.triggerCrowdHype(`combo-${gameState.combo}`, { combo: gameState.combo });
  }

  // Play impact foley SFX & apply scaled hit-stop on confirmed hit
  audioEngine.playCombatSfx(moveKey, timing.grade, validTarget.pos);

  if (isPerfect) {
    gameState.hitStopTimer = action === 'kick' ? 0.100 :
      (action === 'punch' && punchStep === 0) ? 0.048 :
      (action === 'punch' && punchStep === 1) ? 0.070 :
      (action === 'punch' && punchStep === 2) ? 0.110 : 0.048;
  } else {
    gameState.hitStopTimer = action === 'kick' ? 0.070 :
      (action === 'punch' && punchStep === 0) ? 0.032 :
      (action === 'punch' && punchStep === 1) ? 0.048 :
      (action === 'punch' && punchStep === 2) ? 0.065 : 0.032;
  }

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

  const contactPoint = calculateContactPoint(obj, limbPos, action, punchStep);
  gameState.lastContactPoint = contactPoint.clone();

  const impactVFX = impactBurstPool.acquire(contactPoint, vfxType);
  gameState.activeImpactVFX.push(impactVFX);

  const baseHitDmg = TUNING.MOVES[moveKey] ? TUNING.MOVES[moveKey].baseDmg : (action === 'kick' ? 48 : 32);
  const styleMult = gameState.styleDamageMultiplier || 1.0;
  let totalHitDmg = Math.round(baseHitDmg * (timing.mult || 1.0) * counterMult * styleMult);

  if (isPerfect) {
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + 8.0 * styleMult);
  } else {
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + 4.0 * styleMult);
  }

  floorDial.updateBadge(timing.label || 'ON BEAT!', timing.color || '#42f56c');
  const burstWords = action === 'kick'
    ? ['BEAT KICK!', 'HEAVY KICK!', 'KRA-KOOM!', 'BA-DOOM!']
    : ['POW-SNAP!', 'KRA-KOOM!', 'ON-BEAT HIT!'];
  setStarburstText(burstWords[gameState.combo % burstWords.length], action === 'kick' ? 1.18 : 1.10);

  const isSrank = gameState.styleRank === 'S-RANK' || gameState.combo >= 10;
  const isFinisherMove = action === 'kick' || (action === 'punch' && punchStep === 2);
  const isBeatDropFinisher = isSrank && isFinisherMove;

  if (isBeatDropFinisher) {
    totalHitDmg = Math.round(totalHitDmg * 1.5);
    gameState.hype = Math.min(100.0, (gameState.hype || 0) + 20.0);
    setStarburstText('SPEAKERBOX K.O.!', 1.30);
    floorDial.updateBadge('SPEAKERBOX K.O.!', '#ff1e38');
    audioEngine.playCombatSfx('stage-ko', timing.grade, validTarget.pos);
    gameState.lastFinisher = { action, timing: timing.grade, timestamp: performance.now() };
  }

  if (type === 'bruiser') {
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
        audioEngine.playCombatSfx('guard-break', timing.grade, validTarget.pos);
        gameState.hype = Math.min(100.0, (gameState.hype || 0) + 12.0);
        gameState.guardBreakActive = true;
        obj.badge.update(obj.hp, obj.maxHp, 'guard_break', '💥 GUARD SHATTERED! 💥');

        if (obj.hp <= 0) launchBruiserIntoStage(obj);
      } else {
        const chipDmg = Math.max(1, Math.round(totalHitDmg * 0.20));
        obj.hp = Math.max(0, obj.hp - chipDmg);
        audioEngine.playCombatSfx('guard-deflect', timing.grade, validTarget.pos);
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
      obj.hp = Math.max(0, obj.hp - totalHitDmg);

      const pushDir = new THREE.Vector3().subVectors(obj.rig.root.position, gameState.playerPos);
      pushDir.y = 0;
      if (pushDir.lengthSq() < 0.001) pushDir.set(0, 0, -1);
      pushDir.normalize();

      obj.recoilType = recoilType;
      obj.recoilVector = recoilVector.clone();
      obj.targetTorsoRot = targetTorsoRot;
      obj.targetHeadRot = targetHeadRot;
      obj.velocity = pushDir.clone().multiplyScalar(pushSpeed);
      obj.state = wasWindup ? 'stunned' : 'hit';
      obj.stateTimer = wasWindup ? 1.25 : recoilDur;
      obj.recoilTotalTimer = obj.stateTimer;
      obj.teleMat.opacity = 0;
      obj.badge.update(obj.hp, obj.maxHp, obj.state);

      obj.isMicroShaking = true;
      obj.microShakeDuration = microDur;
      obj.microShakeTimer = microDur;
      obj.microShakeAmp = microAmp;
      obj.microShakeVertAmp = microAxis === 'y' ? 0.055 : 0.008;
      obj.microShakeAxis = microAxis;
      obj.microShakeNormal = new THREE.Vector3(-pushDir.z, 0, pushDir.x).normalize();
      obj.lastHitStrike = action === 'kick' ? 'kick' : (punchStep === 0 ? 'jab' : (punchStep === 1 ? 'cross' : 'uppercut'));

      if (action === 'punch' && punchStep === 2) {
        obj.verticalVelocity = 2.2;
      }

      if (obj.hp <= 0 || isBeatDropFinisher) {
        obj.hp = 0;
        launchBruiserIntoStage(obj);
      }
    }
  } else if (type === 'kronos') {
    const bossDmg = (action === 'kick' ? 11.5 : 7.5) * (timing.mult || 1.0) * counterMult * styleMult;
    gameState.bossHp = Math.max(0, gameState.bossHp - bossDmg);
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
      audioEngine.playCombatSfx('stage-ko', timing.grade, validTarget.pos);
      if (postProcessing && postProcessing.triggerImpact) {
        postProcessing.triggerImpact('KO', contactPoint);
      }
      updateHudNumbers();
      triggerGameEnd(true);
      return;
    }
  }

  gameState.lastHit = {
    attackType: moveKey,
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
  gameState.hitHistory.unshift(gameState.lastHit);
  if (gameState.hitHistory.length > 10) gameState.hitHistory.pop();

  gameState.cameraKick = action === 'kick' ? 0.35 : 0.22;
  gameState.cameraDutch = (action === 'kick' ? 1 : -1) * 0.035;
  triggerCameraJuice(action, isPerfect, punchStep);
  if (isPerfect && postProcessing && postProcessing.triggerImpact) {
    postProcessing.triggerImpact('PERFECT', contactPoint);
  }
  updateHudNumbers();
}

function triggerCombatAction(action, isBufferedDequeue = false) {
  if (gameState.isPaused || gameState.isGameOver) return;

  const nowSec = performance.now() * 0.001;
  const songTime = audioEngine.getSongTime();
  const timing = evaluateBeatWindow(songTime);

  const btnMap = { dodge: btnA, punch: btnS, kick: btnD };
  if (btnMap[action]) {
    btnMap[action].classList.add('pressed');
    setTimeout(() => btnMap[action].classList.remove('pressed'), 100);
  }

  // 1. BALANCED DODGE / WEAVE (Key: A) — Cooldown > i-frames, Last-155ms Counter Window, No Heal, No Combo Increment
  if (action === 'dodge') {
    if (!isBufferedDequeue && (nowSec - gameState.lastDodgeTime) < TUNING.DODGE_COOLDOWN_SEC) {
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

    const side = Math.random() > 0.5 ? 1 : -1;
    const newX = Math.max(-4.0, Math.min(4.0, gameState.playerPos.x + side * 0.62));
    gameState.playerTarget.set(newX, 0, gameState.playerPos.z);
    if (gameState.playerTarget.length() > TUNING.PLAYER_MAX_RADIUS) {
      gameState.playerTarget.setLength(TUNING.PLAYER_MAX_RADIUS);
    }
    gameState.cameraDutch = side * 0.04;
    triggerCameraJuice('dodge', timing.grade === 'PERFECT', 0);

    // Counter Weave ONLY if dodging in the last ~155ms of an enemy windup within 2.2m (or active shockwave front)
    let counteredAttacker = false;
    bruisers.forEach((b) => {
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

    if (gameState.kronosInRing) {
      const kd = gameState.playerPos.distanceTo(kronosRig.root.position);
      if (gameState.bossShockwave && gameState.bossShockwave.active && !gameState.bossShockwave.evaded) {
        const waveDist = Math.abs(kd - gameState.bossShockwave.radius);
        if (waveDist <= 0.85) {
          gameState.bossShockwave.evaded = true;
          gameState.shockwaveDodged = true;
          gameState.kronosRingState = 'counter_stun';
          gameState.kronosStateTimer = 2.0;
          gameState.counterBonusTimer = 2.0;
          gameState.bossCounterStunActive = true;
          gameState.bossAttackPattern = 'idle';
          kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', '★ COUNTER-STUN PUNISH! ★');
          counteredAttacker = true;
        }
      } else if (kd <= TUNING.COUNTER_WEAVE_MAX_DIST) {
        const inLateWindup = (
          (gameState.kronosRingState === 'windup' || gameState.kronosRingState === 'windup_combo') &&
          gameState.kronosStateTimer <= TUNING.COUNTER_WEAVE_LAST_WINDUP_SEC
        ) || gameState.kronosRingState === 'striking' || gameState.kronosRingState === 'striking_combo';
        if (inLateWindup) {
          gameState.kronosRingState = 'stunned';
          gameState.kronosStateTimer = 1.45;
          gameState.bossAttackPattern = 'idle';
          kronosRingBadge.update(gameState.bossHp, 100, 'stunned', '★ KRONOS STUNNED! ★');
          counteredAttacker = true;
        }
      }
    }

    if (counteredAttacker) {
      gameState.counterBonusTimer = (gameState.kronosRingState === 'counter_stun') ? 2.0 : Math.max(gameState.counterBonusTimer, 1.8);
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
    return;
  }

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

  // 3. OFF-BEAT MISS CHECK (Section 2.2: require ON-BEAT ±165ms or better when music is playing)
  if (timing.grade === 'MISS') {
    gameState.missedPresses += 1;
    gameState.combo = 0;
    gameState.comboDecayTimer = 0;
    updateStyleRankAndHype(0);
    gameState.isAttacking = true;
    gameState.attackType = action === 'kick' ? 'kick' : 'punch-jab';
    gameState.pose = gameState.attackType;
    const missCfg = TUNING.MOVES.miss;
    const totalMiss = missCfg.startup + missCfg.active + missCfg.recovery;
    gameState.attackPhase = 'startup';
    gameState.attackTimer = 0;
    gameState.recoveryTimer = missCfg.recovery;
    gameState.poseTimer = totalMiss;
    gameState.canCancel = false;
    gameState.phaseDurations = {
      startup: missCfg.startup,
      active: missCfg.active,
      recovery: missCfg.recovery,
      total: totalMiss
    };
    gameState.pendingHit = { isMiss: true, resolved: true, action, timing };
    floorDial.updateBadge('MISS!', '#ff385c');
    setStarburstText('OFF-BEAT MISS!', 1.04);
    audioEngine.playCombatSfx('miss-whiff', 'MISS', gameState.playerPos);
    updateHudNumbers();
    return;
  }

  // 4. START REAL BEAT-WARPED ATTACK LIFECYCLE (Section 2.1 & 2.3)
  gameState.isAttacking = true;
  gameState.combatEngagementTimer = 0.85;

  let currentPunchStep = 0;
  let moveKey = 'kick';
  if (action === 'punch') {
    if (nowSec - gameState.lastPunchTime > 0.85) {
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

  // Real Beat-Warping: wind-up starts on input (attackTimer = 0) and warps startupDur so impact lands on the target beat
  const moveCfg = TUNING.MOVES[moveKey] || TUNING.MOVES['punch-jab'];
  let startupDur = moveCfg.startup;
  if (songTime !== null && timing.timeUntilBeat !== undefined && timing.timeUntilBeat >= 0.025 && timing.timeUntilBeat <= TUNING.ON_BEAT_WINDOW_SEC) {
    startupDur = THREE.MathUtils.clamp(timing.timeUntilBeat, 0.030, 0.165);
  }
  const activeDur = moveCfg.active;
  const recoveryDur = moveCfg.recovery;
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
    total: totalDur
  };

  // Step/lunge toward target within reduced 1.85m auto-aim radius during wind-up
  const targetInfo = findBestCombatTarget(
    gameState.wave === 3 ? Math.max(TUNING.AUTO_AIM_MAX_DIST, 2.15) : TUNING.AUTO_AIM_MAX_DIST
  );
  if (targetInfo && targetInfo.dist > 0.95) {
    const lungeDir = new THREE.Vector3().subVectors(targetInfo.pos, gameState.playerPos);
    lungeDir.y = 0;
    const lungeDist = Math.min(TUNING.MAX_LUNGE_DIST, Math.max(0, targetInfo.dist - 0.92));
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
    timing
  };

  gameState.activeSmears.push(smearArcPool.acquire(challengerRig.root.position, action === 'kick'));
}

// ============================================================================
// 6. CONTINUOUS POSE BLENDER & SKELETAL ANIMATION SYSTEM
// ============================================================================
class ContinuousPoseBlender {
  constructor(rig, options = {}) {
    this.rig = rig;
    this.lambda = options.lambda !== undefined ? options.lambda : 22.0;
    this.omegaMax = options.omegaMax !== undefined ? options.omegaMax : 16.0;
    this.maxStepFloor = options.maxStepFloor !== undefined ? options.maxStepFloor : 0.25;
    this.controlRootYaw = options.controlRootYaw !== undefined ? options.controlRootYaw : true;
    this.controlHipsPos = options.controlHipsPos !== undefined ? options.controlHipsPos : true;

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
    if (this.rig.hips && this.rig.hips.position) {
      this.currentHipsPos.copy(this.rig.hips.position);
      this.targetHipsPos.copy(this.rig.hips.position);
    }
    if (this.rig.root && this.rig.root.rotation) {
      this.currentRootYaw = this.rig.root.rotation.y;
      this.targetRootYaw = this.rig.root.rotation.y;
    }
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

    if (this.current.leftKnee && this.current.leftKnee.x > 0.0) this.current.leftKnee.x = 0.0;
    if (this.current.rightKnee && this.current.rightKnee.x > 0.0) this.current.rightKnee.x = 0.0;

    this.applyToRig();
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
  lambda: 22.0,
  omegaMax: 16.0,
  maxStepFloor: 0.25,
  controlRootYaw: true,
  controlHipsPos: true
});

bruisers.forEach((b) => {
  b.blender = new ContinuousPoseBlender(b.rig, {
    lambda: 22.0,
    omegaMax: 16.0,
    maxStepFloor: 0.25,
    controlRootYaw: false,
    controlHipsPos: false
  });
});

const kronosBlender = new ContinuousPoseBlender(kronosRig, {
  lambda: 22.0,
  omegaMax: 16.0,
  maxStepFloor: 0.25,
  controlRootYaw: false,
  controlHipsPos: false
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
      hips: [0.02, 0.05, 0], torso: [0.04, 0.08, 0], headGroup: [0, 0.04, 0],
      leftArm: [0.55, -0.10, -0.30], leftElbow: [1.45, 0, 0],
      rightArm: [0.70, -0.15, 0.40], rightElbow: [1.35, 0, 0],
      leftLeg: [0.10, 0.08, -0.12], leftKnee: [-0.20, 0, 0], leftAnkle: [0.08, 0, 0.08],
      rightLeg: [0.05, -0.05, 0.12], rightKnee: [-0.10, 0, 0], rightAnkle: [0.15, 0, -0.08]
    },
    apex: {
      hips: [0.06, 0.15, 0], torso: [0.02, 0.24, 0], headGroup: [0, 0.08, 0],
      leftArm: [1.48, 0.12, -0.15], leftElbow: [0.08, 0, 0],
      rightArm: [0.75, -0.25, 0.45], rightElbow: [1.40, 0, 0],
      leftLeg: [-0.15, 0, -0.10], leftKnee: [-0.08, 0, 0], leftAnkle: [0, 0, 0],
      rightLeg: [0.18, 0, 0.14], rightKnee: [-0.10, 0, 0], rightAnkle: [0, 0, 0]
    }
  },
  'punch-cross': {
    chamber: {
      hips: [0.04, -0.18, 0], torso: [0.02, -0.25, 0], headGroup: [0, -0.06, 0],
      leftArm: [0.20, -0.10, -0.45], leftElbow: [1.25, 0, 0],
      rightArm: [0.85, 0.10, 0.60], rightElbow: [1.45, 0, 0],
      leftLeg: [-0.05, 0, -0.10], leftKnee: [-0.10, 0, 0], leftAnkle: [0, 0, 0],
      rightLeg: [0.10, 0, 0.15], rightKnee: [-0.05, 0, 0], rightAnkle: [0, 0, 0]
    },
    apex: {
      hips: [0.12, -0.45, 0], torso: [0, -0.55, 0], headGroup: [0, -0.15, 0],
      leftArm: [-0.40, 0, -0.50], leftElbow: [1.10, 0, 0],
      rightArm: [1.45, 0.20, 0.85], rightElbow: [0.10, 0, 0],
      leftLeg: [-0.22, 0, -0.10], leftKnee: [-0.10, 0, 0], leftAnkle: [0, 0, 0],
      rightLeg: [0.28, 0, 0.25], rightKnee: [-0.08, 0, 0], rightAnkle: [0, 0, 0]
    }
  },
  'punch-uppercut': {
    chamber: {
      hips: [-0.08, -0.15, 0.04], torso: [-0.04, -0.18, 0.08], headGroup: [0.04, -0.05, 0],
      leftArm: [0.65, 0.15, -0.40], leftElbow: [1.35, 0, 0],
      rightArm: [0.80, -0.20, 0.25], rightElbow: [1.45, 0, 0],
      leftLeg: [0.08, 0, -0.12], leftKnee: [-0.20, 0, 0], leftAnkle: [0, 0, 0],
      rightLeg: [0.02, 0, 0.10], rightKnee: [-0.15, 0, 0], rightAnkle: [0, 0, 0]
    },
    apex: {
      hips: [-0.04, -0.25, 0.08], torso: [-0.08, -0.35, 0.14], headGroup: [0.08, -0.12, 0],
      leftArm: [0.65, 0.35, -0.45], leftElbow: [1.35, 0, 0],
      rightArm: [1.75, -0.15, 0.35], rightElbow: [1.25, 0, 0],
      leftLeg: [-0.08, 0, -0.10], leftKnee: [-0.12, 0, 0], leftAnkle: [0, 0, 0],
      rightLeg: [0.12, 0, 0.16], rightKnee: [-0.08, 0, 0], rightAnkle: [0, 0, 0]
    }
  },
  kick: {
    chamber: {
      hips: [-0.04, -0.08, 0.15], torso: [0.06, -0.14, 0.10], headGroup: [-0.02, -0.10, -0.05],
      leftArm: [0.45, 0.10, -0.45], leftElbow: [1.15, 0, 0],
      rightArm: [0.20, -0.10, 0.80], rightElbow: [0.80, 0, 0],
      leftLeg: [0.12, 0, -0.20], leftKnee: [-0.25, 0, 0], leftAnkle: [0.08, 0, 0.08],
      rightLeg: [0.45, 0.08, 0.85], rightKnee: [-0.85, 0, 0], rightAnkle: [0, 0, 0]
    },
    apex: {
      hips: [-0.06, -0.14, 0.34], torso: [0.12, -0.28, 0.22], headGroup: [-0.06, -0.28, -0.12],
      leftArm: [0.38, 0.25, -0.58], leftElbow: [0.95, 0, 0],
      rightArm: [-0.35, -0.25, 1.35], rightElbow: [0.25, 0, 0],
      leftLeg: [0.04, 0, -0.34], leftKnee: [-0.08, 0, 0], leftAnkle: [0, 0, 0],
      rightLeg: [-0.04, 0.05, 2.46], rightKnee: [0.0, 0, 0.06], rightAnkle: [0, 0, 0]
    }
  },
  dodge: {
    hips: [-0.18, 0.20, 0.38], torso: [0.22, -0.22, 0.18], headGroup: [0.10, -0.15, 0.12],
    leftArm: [0.85, 0.30, -0.35], leftElbow: [1.35, 0, 0],
    rightArm: [0.90, -0.25, 0.35], rightElbow: [1.30, 0, 0],
    leftLeg: [0.32, 0, -0.22], leftKnee: [-0.40, 0, 0], leftAnkle: [0, 0, 0],
    rightLeg: [-0.24, 0, 0.28], rightKnee: [-0.24, 0, 0], rightAnkle: [0, 0, 0]
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

function poseChallenger(rig, pose, elapsed, beatPulse, dt = 0.016) {
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

      if (t < startupEnd) {
        const tau = Math.min(1.0, Math.max(0.0, t / Math.max(0.001, startupEnd)));
        const ease = tau * tau * (3.0 - 2.0 * tau);
        targetJoints = lerpPoseDict(idleConfig, config.chamber, ease);
        targetHipsY = 1.00 - ease * 0.04;
        kickSmear.smearGroup.visible = false;
      } else if (t < activeEnd) {
        const tau = Math.min(1.0, Math.max(0.0, (t - startupEnd) / Math.max(0.001, p.active || 0.060)));
        const ease = Math.sin(tau * Math.PI * 0.5);
        targetJoints = lerpPoseDict(config.chamber, config.apex, ease);
        targetHipsY = 1.00 + (actKey === 'kick' ? 0.02 : (actKey === 'punch-uppercut' ? 0.05 : 0.01)) * ease;
        if (actKey === 'kick') {
          kickSmear.smearGroup.visible = true;
          kickSmear.arcMat.opacity = 0.92 + beatPulse * 0.08;
        } else {
          kickSmear.smearGroup.visible = false;
        }
      } else {
        const tau = Math.min(1.0, Math.max(0.0, (t - activeEnd) / Math.max(0.001, total - activeEnd)));
        const ease = 1.0 - Math.pow(1.0 - tau, 2.0);
        targetJoints = lerpPoseDict(config.apex, idleConfig, ease);
        targetHipsY = 1.00 - (1.0 - ease) * 0.02;
        if (actKey === 'kick') {
          kickSmear.arcMat.opacity = Math.max(0, 0.92 * (1.0 - ease));
          if (ease > 0.8) kickSmear.smearGroup.visible = false;
        } else {
          kickSmear.smearGroup.visible = false;
        }
      }
    }
  }

  if (!targetJoints) {
    if (pose === 'dodge') {
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
  challengerBlender.update(dt);
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
  elBtnStartCypher.disabled = false;
  setBootProgress('Arena Ready · 92 BPM Cypher Loaded');
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
if (btnRestart) btnRestart.addEventListener('click', () => restartGame());
if (btnPauseRestart) btnPauseRestart.addEventListener('click', () => restartGame());
if (btnResultsRestart) btnResultsRestart.addEventListener('click', () => restartGame());

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
    restartGame();
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
});

[
  { el: btnA, act: 'dodge' },
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
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
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

  // Per-move startupDur / activeDur / recoveryDur lifecycle + Active-Phase Hit Resolution
  if (gameState.isAttacking) {
    gameState.attackTimer += rawDt;
    const p = gameState.phaseDurations;
    const startupEnd = p.startup || 0.065;
    const activeEnd = startupEnd + (p.active || 0.060);
    const total = p.total || (activeEnd + (p.recovery || 0.160));

    if (gameState.attackTimer < startupEnd) {
      gameState.attackPhase = 'startup';
      gameState.canCancel = false;
    } else if (gameState.attackTimer < activeEnd) {
      gameState.attackPhase = 'active';
      gameState.canCancel = false;
      if (gameState.pendingHit && !gameState.pendingHit.resolved) {
        resolveActivePhaseAttack(gameState.pendingHit);
      }
    } else if (gameState.attackTimer < total) {
      if (gameState.pendingHit && !gameState.pendingHit.resolved) {
        resolveActivePhaseAttack(gameState.pendingHit);
      }
      gameState.attackPhase = 'recovery';
      gameState.canCancel = true;

      if (gameState.inputBuffer) {
        const nowSec = performance.now() * 0.001;
        if (nowSec - gameState.inputBuffer.timestamp <= TUNING.INPUT_BUFFER_WINDOW_SEC) {
          const act = gameState.inputBuffer.action;
          gameState.inputBuffer = null;
          gameState.isAttacking = false;
          gameState.attackPhase = 'idle';
          triggerCombatAction(act, true);
        } else {
          gameState.inputBuffer = null;
          gameState.playerTarget.copy(gameState.basePos);
        }
      } else {
        gameState.playerTarget.copy(gameState.basePos);
      }
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

  poseChallenger(challengerRig, gameState.pose, elapsed, beatPulse, dt);
}

function quantizeWindupToBeat(songTime, chart, beatsAhead = 1.0) {
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  if (songTime === null || songTime === undefined) {
    return { canStart: true, windupDur: beatSec * beatsAhead };
  }
  const beatFloat = (songTime - firstOffset) / beatSec;
  const nextIntBeat = Math.ceil(beatFloat);
  const timeToNextBeat = (nextIntBeat - beatFloat) * beatSec;
  // Start telegraph on the beat boundary (or within 75ms of a beat boundary) so impact lands strictly on target downbeat
  if (timeToNextBeat <= 0.075 || (beatSec - timeToNextBeat) <= 0.075) {
    const startBeat = timeToNextBeat <= 0.075 ? nextIntBeat : (nextIntBeat - 1);
    const targetDownbeat = startBeat + Math.max(1, Math.round(beatsAhead));
    const exactDur = Math.max(beatSec * 0.75, (targetDownbeat - beatFloat) * beatSec);
    return { canStart: true, windupDur: exactDur };
  }
  return { canStart: false, windupDur: beatSec * beatsAhead };
}

function applyPlayerDamage(dmg, hitWord, kickAmt = 0.28, dutchAmt = 0.04) {
  gameState.playerHp = Math.max(0, gameState.playerHp - dmg);
  gameState.combo = 0;
  gameState.comboDecayTimer = 0;
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

function updateFighterFSM(entity, dt, rawDt, elapsed, beatPulse, songTime, chart, contextState) {
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;

  if (!entity.isBoss) {
    const b = entity;
    const idx = b.idx;
    if (!b.active) return;

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
      return;
    }

    if (b.state === 'ko') return;

    b.rig.root.lookAt(gameState.playerPos.x, 0, gameState.playerPos.z);

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

    // Gate AI progression until gameStarted && !isPaused && !isGameOver
    if (!gameState.gameStarted || gameState.isPaused || gameState.isGameOver) {
      if (b.blender) b.blender.update(dt);
      return;
    }

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
          leftElbow: [0.6 * ease, 0, 0], rightElbow: [0.6 * ease, 0, 0],
          leftLeg: [-0.15 * ease, 0, 0], rightLeg: [-0.15 * ease, 0, 0],
          leftKnee: [-0.08, 0, 0], rightKnee: [-0.08, 0, 0]
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
          leftElbow: [0.35, 0, 0], rightElbow: [0.35, 0, 0],
          leftLeg: [-0.10, 0, 0], rightLeg: [-0.10, 0, 0],
          leftKnee: [-0.12, 0, 0], rightKnee: [-0.12, 0, 0]
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
          leftArm: [0.35, 0, -0.45], leftElbow: [0.20, 0, 0],
          rightArm: [0.35, 0, 0.45], rightElbow: [0.20, 0, 0],
          leftLeg: [-0.15, 0, 0], rightLeg: [-0.15, 0, 0],
          leftKnee: [-0.14, 0, 0], rightKnee: [-0.14, 0, 0]
        });
      }
      if (b.stateTimer <= 0) {
        b.state = 'stalking';
        b.attackCooldown = 1.8;
        b.guardCooldown = 4.5;
        b.badge.update(b.hp, b.maxHp, 'stalking');
      }
    } else if (b.state === 'guard') {
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
          leftArm: [-1.15, 0.35, -0.22], leftElbow: [1.60, 0, 0],
          rightArm: [-1.15, -0.35, 0.22], rightElbow: [1.60, 0, 0],
          leftLeg: [0.10, 0, 0], rightLeg: [-0.10, 0, 0],
          leftKnee: [-0.08, 0, 0], rightKnee: [-0.08, 0, 0]
        });
      }
      b.teleMat.opacity = 0;
      if (b.stateTimer <= 0) {
        b.state = 'stalking';
        b.isGuarding = false;
        b.guardCooldown = 4.2 + idx * 1.5;
        b.badge.update(b.hp, b.maxHp, 'stalking');
      }
    } else if (b.state === 'windup') {
      b.stateTimer -= dt;
      b.isGuarding = false;
      // Step forward into striking range (~1.38m) so spacing/stepping back beyond 1.55m evades without dodge
      const toPlayer = new THREE.Vector3().subVectors(gameState.playerPos, b.rig.root.position);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      if (dist > 1.38) {
        toPlayer.normalize().multiplyScalar(dt * 1.9);
        b.rig.root.position.add(toPlayer);
      }
      b.rig.hips.position.y = 0.95;

      if (b.attackType === 'quick_hook') {
        if (b.blender) {
          b.blender.setTarget({
            torso: [0.12, 0.45, 0],
            leftArm: [-1.45, 0.40, -0.30], leftElbow: [1.25, 0, 0],
            rightArm: [-0.85, -0.20, 0.20], rightElbow: [1.30, 0, 0],
            leftLeg: [-0.15, 0, 0], rightLeg: [0.15, 0, 0],
            leftKnee: [-0.10, 0, 0], rightKnee: [-0.10, 0, 0], headGroup: [0, 0, 0]
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
            rightArm: [-2.15, 0, 0.45], rightElbow: [1.1, 0, 0],
            leftArm: [-0.85, 0, -0.25], leftElbow: [1.15, 0, 0],
            leftLeg: [0.15, 0, 0], rightLeg: [-0.15, 0, 0],
            leftKnee: [-0.10, 0, 0], rightKnee: [-0.10, 0, 0], headGroup: [0, 0, 0]
          });
        }
        b.teleMat.color.setHex(0xff1e38);
        b.teleRing.scale.setScalar(reducedMotionEnabled ? 1.0 : (0.88 + Math.sin(elapsed * 10) * 0.16));
        b.teleMat.opacity = 0.88;
      }

      if (b.stateTimer <= 0) {
        b.state = 'striking';
        b.stateTimer = b.attackType === 'quick_hook' ? 0.18 : 0.22;
        b.badge.update(b.hp, b.maxHp, 'striking', null, b.attackType);
      }
    } else if (b.state === 'striking') {
      b.stateTimer -= dt;
      b.isGuarding = false;
      b.rig.hips.position.y = 1.02;
      if (b.blender) {
        if (b.attackType === 'quick_hook') {
          b.blender.setTarget({
            torso: [0.22, -0.55, 0],
            leftArm: [-1.25, 0.45, 0.35], leftElbow: [0.35, 0, 0],
            rightArm: [-0.60, -0.25, 0.30], rightElbow: [1.20, 0, 0],
            leftLeg: [0.18, 0, 0], rightLeg: [-0.18, 0, 0],
            leftKnee: [-0.10, 0, 0], rightKnee: [-0.10, 0, 0], headGroup: [0, 0, 0]
          });
        } else {
          b.blender.setTarget({
            torso: [0.28, 0.65, 0],
            rightArm: [-1.35, -0.25, -0.15], rightElbow: [0.15, 0, 0],
            leftArm: [-0.5, 0, -0.3], leftElbow: [0.8, 0, 0],
            leftLeg: [-0.20, 0, 0], rightLeg: [0.20, 0, 0],
            leftKnee: [-0.08, 0, 0], rightKnee: [-0.12, 0, 0], headGroup: [0, 0, 0]
          });
        }
      }
      b.teleMat.opacity = 0.95;

      if (b.stateTimer <= 0) {
        b.teleMat.opacity = 0;
        const hitDist = b.rig.root.position.distanceTo(gameState.playerPos);
        if (gameState.dodgeInvulnTimer > 0) {
          b.state = 'stunned';
          b.stateTimer = b.attackType === 'quick_hook' ? 1.15 : 1.45;
          b.badge.update(b.hp, b.maxHp, 'stunned');
          floorDial.updateBadge('EVADED!', '#ffe042');
        } else if (hitDist <= TUNING.ENEMY_MELEE_STRIKE_RADIUS) {
          const strikeDmg = b.attackType === 'quick_hook' ? 10 : 18;
          applyPlayerDamage(strikeDmg, 'BAM! DODGE [A]!', b.attackType === 'quick_hook' ? 0.25 : 0.38, b.attackType === 'quick_hook' ? -0.035 : 0.055);
          b.state = 'stalking';
          b.attackCooldown = 2.0 + idx * 0.6;
          b.badge.update(b.hp, b.maxHp, 'stalking');
        } else {
          // Outspaced! Player stepped out of 1.55m strike radius without needing dodge
          floorDial.updateBadge('OUTSPACED!', '#24e5ff');
          b.state = 'stalking';
          b.attackCooldown = 1.8;
          b.badge.update(b.hp, b.maxHp, 'stalking');
        }
      }
    } else {
      // Stalking with pairwise separation force so bruisers never overlap
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
          leftArm: [-0.95 + beatPulse * 0.15, 0.25, -0.22], leftElbow: [1.15, 0, 0],
          rightArm: [-0.95 - beatPulse * 0.15, -0.25, 0.22], rightElbow: [1.15, 0, 0],
          leftLeg: [stride, 0, 0], rightLeg: [-stride, 0, 0],
          leftKnee: [0, 0, 0], rightKnee: [0, 0, 0], headGroup: [0, 0, 0]
        });
      }
      b.teleMat.opacity = 0;

      if (b.guardCooldown > 0) b.guardCooldown -= dt;
      if (gameState.wave === 2 && b.guardCooldown <= 0 && !contextState.someoneWindingUp) {
        b.state = 'guard';
        b.isGuarding = true;
        b.stateTimer = 2.2;
        b.guardCooldown = 4.5 + idx * 1.4;
        b.badge.update(b.hp, b.maxHp, 'guard', '🛡️ GUARD [BREAK: KICK D]!');
        if (b.blender) b.blender.update(dt);
        return;
      }

      b.attackCooldown -= dt;
      if (b.attackCooldown <= 0 && !contextState.someoneWindingUp) {
        const nextType = (b.attackType === 'quick_hook') ? 'heavy_haymaker' : 'quick_hook';
        const beatsAhead = nextType === 'heavy_haymaker' ? 2.0 : 1.0;
        const q = quantizeWindupToBeat(songTime, chart, beatsAhead);
        if (q.canStart || b.attackCooldown < -beatSec) {
          b.state = 'windup';
          b.attackType = nextType;
          b.stateTimer = q.windupDur;
          b.windupTotalDur = q.windupDur;
          if (b.attackType === 'heavy_haymaker') {
            b.teleMat.color.setHex(0xff1e38);
            b.badge.update(b.hp, b.maxHp, 'windup', '! DODGE [A] / COUNTER !', 'heavy_haymaker');
          } else {
            b.teleMat.color.setHex(0x00e5ff);
            b.badge.update(b.hp, b.maxHp, 'windup', '! QUICK HOOK [A] !', 'quick_hook');
          }
          audioEngine.playCombatSfx('enemy-telegraph', 'PERFECT', b.rig.root.position);
          contextState.someoneWindingUp = true;

          bruisers.forEach((other) => {
            if (other !== b && other.active && other.state === 'stalking') {
              other.attackCooldown = Math.max(other.attackCooldown, beatSec * 1.0);
            }
          });
        }
      }
    }

    if (b.blender) b.blender.update(dt);
    if (b.state !== 'flying') {
      const rad = Math.hypot(b.rig.root.position.x, b.rig.root.position.z);
      if (rad > TUNING.ARENA_RADIUS) {
        b.rig.root.position.x = (b.rig.root.position.x / rad) * TUNING.ARENA_RADIUS;
        b.rig.root.position.z = (b.rig.root.position.z / rad) * TUNING.ARENA_RADIUS;
      }
    }
    return;
  }

  // BOSS DJ KRONOS FSM (Booth in Waves 1-2, Active Multi-Pattern Ring Combat in Wave 3)
  if (!gameState.kronosInRing) {
    kronosRig.hips.position.y = 1.04 + beatPulse * 0.08;
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [0, Math.sin(elapsed * 2.4) * 0.18, 0],
        leftArm: [-0.65 + Math.sin(elapsed * 5) * 0.20, 0, -0.15],
        rightArm: [-0.70 - Math.sin(elapsed * 5) * 0.20, 0, 0.15],
        leftElbow: [0.8, 0, 0], rightElbow: [0.8, 0, 0],
        leftLeg: [0, 0, 0], rightLeg: [0, 0, 0],
        leftKnee: [0, 0, 0], rightKnee: [0, 0, 0],
        headGroup: [0, Math.sin(elapsed * 2.4) * 0.10, 0]
      });
      kronosBlender.update(dt);
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
    if (kronosBlender) kronosBlender.update(dt);
    return;
  }

  if (gameState.kronosRingState === 'hit') {
    gameState.kronosStateTimer -= dt;
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
        leftElbow: [0.7 * ease, 0, 0], rightElbow: [0.7 * ease, 0, 0],
        leftLeg: [-0.15 * ease, 0, 0], rightLeg: [-0.15 * ease, 0, 0],
        leftKnee: [-0.08, 0, 0], rightKnee: [-0.08, 0, 0]
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
    if (gameState.kronosRingState === 'counter_stun') {
      gameState.counterBonusTimer = Math.max(0, gameState.kronosStateTimer);
      gameState.bossCounterStunActive = true;
    }
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [0.28, Math.sin(elapsed * 10.0) * 0.22, 0],
        headGroup: [0.18, Math.sin(elapsed * 8.0) * 0.16, 0],
        leftArm: [-0.2, 0, -0.35], rightArm: [-0.2, 0, 0.35],
        leftElbow: [0.35, 0, 0], rightElbow: [0.35, 0, 0],
        leftLeg: [-0.12, 0, 0], rightLeg: [-0.12, 0, 0],
        leftKnee: [-0.14, 0, 0], rightKnee: [-0.14, 0, 0]
      });
    }
    if (gameState.kronosStateTimer <= 0) {
      gameState.kronosRingState = 'stalking';
      gameState.counterBonusTimer = 0;
      gameState.bossCounterStunActive = false;
      gameState.kronosAttackCooldown = 1.8;
      kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
    }
  } else if (gameState.kronosRingState === 'windup_combo') {
    gameState.kronosStateTimer -= dt;
    const step = gameState.bossComboStep || 0;
    const toPlayer = new THREE.Vector3().subVectors(gameState.playerPos, kronosRig.root.position);
    toPlayer.y = 0;
    if (toPlayer.length() > 1.35) {
      toPlayer.normalize().multiplyScalar(dt * 2.1);
      kronosRig.root.position.add(toPlayer);
    }
    if (kronosBlender) {
      if (step === 0) {
        kronosBlender.setTarget({ torso: [-0.15, 0.35, 0], leftArm: [-1.45, 0.25, -0.2], leftElbow: [1.2, 0, 0], rightArm: [-0.65, -0.2, 0.2], rightElbow: [0.8, 0, 0] });
      } else if (step === 1) {
        kronosBlender.setTarget({ torso: [-0.18, -0.45, 0], rightArm: [-1.85, -0.3, 0.3], rightElbow: [1.3, 0, 0], leftArm: [-0.75, 0.2, -0.2], leftElbow: [0.9, 0, 0] });
      } else {
        kronosRig.hips.position.y = 1.08 + Math.sin(elapsed * 14.0) * 0.08;
        kronosBlender.setTarget({ torso: [-0.35, 0, 0], leftArm: [-2.4, 0, -0.35], leftElbow: [0.4, 0, 0], rightArm: [-2.4, 0, 0.35], rightElbow: [0.4, 0, 0], headGroup: [-0.15, 0, 0] });
      }
    }
    if (gameState.kronosStateTimer <= 0) {
      gameState.kronosRingState = 'striking_combo';
      gameState.kronosStateTimer = step === 2 ? 0.30 : 0.22;
      const label = step === 2 ? '! MIC DROP SLAM [A] !' : (step === 1 ? '! BOSS HOOK !' : '! BOSS JAB !');
      kronosRingBadge.update(gameState.bossHp, 100, 'striking', label, 'mic_drop_combo');
    }
  } else if (gameState.kronosRingState === 'striking_combo') {
    gameState.kronosStateTimer -= dt;
    const step = gameState.bossComboStep || 0;
    if (kronosBlender) {
      if (step === 0) {
        kronosBlender.setTarget({ torso: [0.22, 0.45, 0], leftArm: [-1.65, 0, -0.1], leftElbow: [0.15, 0, 0], rightArm: [-0.5, -0.2, 0.2], rightElbow: [0.8, 0, 0] });
      } else if (step === 1) {
        kronosBlender.setTarget({ torso: [0.25, -0.55, 0], rightArm: [-1.55, 0, 0.15], rightElbow: [0.2, 0, 0], leftArm: [-0.6, 0.2, -0.2], leftElbow: [0.7, 0, 0] });
      } else {
        kronosRig.hips.position.y = 0.94;
        kronosBlender.setTarget({ torso: [0.45, 0, 0], leftArm: [-1.2, 0, -0.25], leftElbow: [0.8, 0, 0], rightArm: [-1.2, 0, 0.25], rightElbow: [0.8, 0, 0], headGroup: [0.2, 0, 0] });
      }
    }
    if (gameState.kronosStateTimer <= 0) {
      const isDodging = gameState.dodgeInvulnTimer > 0;
      const hitDist = kronosRig.root.position.distanceTo(gameState.playerPos);
      if (step === 2) {
        if (isDodging) {
          gameState.kronosRingState = 'stunned';
          gameState.kronosStateTimer = 1.5;
          gameState.bossAttackPattern = 'idle';
          gameState.kronosAttackCooldown = 2.0;
          kronosRingBadge.update(gameState.bossHp, 100, 'stunned', '★ KRONOS STUNNED! ★');
          setStarburstText('COUNTER WEAVE!', 1.2);
          audioEngine.playCombatSfx('counter-weave', 'PERFECT', kronosRig.root.position);
        } else {
          if (hitDist <= TUNING.ENEMY_MELEE_STRIKE_RADIUS + 0.15) {
            applyPlayerDamage(16, 'MIC DROP SLAM!', 0.36, 0.05);
          }
          gameState.kronosRingState = 'stalking';
          gameState.bossAttackPattern = 'idle';
          gameState.kronosAttackCooldown = 2.0;
          kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
        }
      } else {
        if (!isDodging && hitDist <= TUNING.ENEMY_MELEE_STRIKE_RADIUS) {
          applyPlayerDamage(step === 0 ? 7 : 9, step === 0 ? 'BOSS JAB!' : 'BOSS HOOK!', 0.22, -0.03);
        }
        gameState.bossComboStep = step + 1;
        gameState.kronosRingState = 'windup_combo';
        gameState.kronosStateTimer = (step === 0) ? beatSec * 0.5 : beatSec * 1.0;
        const nextLabel = (step === 0) ? '! BOSS HOOK !' : '! MIC DROP SLAM [A] !';
        kronosRingBadge.update(gameState.bossHp, 100, 'windup', nextLabel, 'mic_drop_combo');
        audioEngine.playCombatSfx('enemy-telegraph', 'PERFECT', kronosRig.root.position);
      }
    }
  } else if (gameState.kronosRingState === 'windup_shockwave') {
    gameState.kronosStateTimer -= dt;
    const leapProgress = 1.0 - (gameState.kronosStateTimer / Math.max(0.1, beatSec * 1.5));
    const jumpHeight = Math.sin(Math.min(1.0, Math.max(0, leapProgress)) * Math.PI) * 0.42;
    kronosRig.hips.position.y = 1.04 + jumpHeight;
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [-0.35, 0, 0],
        leftArm: [-2.2, 0.3, -0.4], leftElbow: [0.6, 0, 0],
        rightArm: [-2.2, -0.3, 0.4], rightElbow: [0.6, 0, 0],
        leftLeg: [0.35, 0, 0], rightLeg: [-0.25, 0, 0],
        leftKnee: [-0.4, 0, 0], rightKnee: [-0.3, 0, 0]
      });
    }
    if (gameState.kronosStateTimer <= 0) {
      kronosRig.hips.position.y = 0.90;
      setStarburstText('BASS DROP!', 1.25);
      if (!reducedMotionEnabled) cameraJuice.trauma = Math.min(1.0, cameraJuice.trauma + 0.45);
      audioEngine.playCombatSfx('subwoofer-bass-drop', 'PERFECT', kronosRig.root.position);

      const shockwaveMesh = buildSubwooferShockwaveRing();
      const spawnPos = kronosRig.root.position.clone();
      shockwaveMesh.position.set(spawnPos.x, 0.04, spawnPos.z);
      scene.add(shockwaveMesh);

      gameState.bossShockwave = {
        active: true,
        radius: 0.25,
        innerRadius: 0.25,
        maxRadius: 6.5,
        speed: 5.2,
        evaded: false,
        hit: false,
        mesh: shockwaveMesh,
        pos: spawnPos
      };
      gameState.bossShockwaveActive = true;
      gameState.kronosRingState = 'shockwave_active';
      gameState.kronosStateTimer = (6.5 - 0.25) / 5.2;
      kronosRingBadge.update(gameState.bossHp, 100, 'striking', '! SUBWOOFER BASS DROP !', 'bass_shockwave');
    }
  } else if (gameState.kronosRingState === 'shockwave_active') {
    gameState.kronosStateTimer -= dt;
    kronosRig.hips.position.y = 0.95;
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [0.38, 0, 0],
        leftArm: [-1.2, 0, -0.3], leftElbow: [0.9, 0, 0],
        rightArm: [-1.2, 0, 0.3], rightElbow: [0.9, 0, 0]
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
      gameState.kronosAttackCooldown = 2.0;
      kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
    }
  } else {
    // Boss stalking inside Cypher Ring
    const kAngle = elapsed * 0.55;
    const targetKx = gameState.playerPos.x + Math.sin(kAngle) * 1.78;
    const targetKz = gameState.playerPos.z - Math.cos(kAngle) * 1.78;
    kronosRig.root.position.x = THREE.MathUtils.lerp(kronosRig.root.position.x, targetKx, dt * 2.8);
    kronosRig.root.position.z = THREE.MathUtils.lerp(kronosRig.root.position.z, targetKz, dt * 2.8);
    kronosRig.hips.position.y = 1.04 + beatPulse * 0.09;

    const kStride = Math.sin(elapsed * 6.0) * 0.25;
    if (kronosBlender) {
      kronosBlender.setTarget({
        torso: [0.06, Math.sin(elapsed * 2.8) * 0.15, 0],
        leftArm: [-0.85 + beatPulse * 0.18, 0.2, -0.2], leftElbow: [1.10, 0, 0],
        rightArm: [-0.90 - beatPulse * 0.18, -0.2, 0.2], rightElbow: [1.10, 0, 0],
        leftLeg: [kStride, 0, 0], rightLeg: [-kStride, 0, 0],
        leftKnee: [-0.05, 0, 0], rightKnee: [-0.05, 0, 0], headGroup: [0, 0, 0]
      });
    }

    gameState.kronosAttackCooldown -= dt;
    if (gameState.kronosAttackCooldown <= 0 && !contextState.someoneWindingUp) {
      const distToPlayer = kronosRig.root.position.distanceTo(gameState.playerPos);
      const preferCombo = distToPlayer <= 2.2;
      const doCombo = ((gameState.bossPatternCycle || 0) % 2 === 0) ? preferCombo : !preferCombo;
      const q = quantizeWindupToBeat(songTime, chart, doCombo ? 1.0 : 2.0);
      if (q.canStart || gameState.kronosAttackCooldown < -beatSec) {
        gameState.bossPatternCycle = (gameState.bossPatternCycle || 0) + 1;
        if (doCombo) {
          gameState.bossAttackPattern = 'mic_drop_combo';
          gameState.bossComboStep = 0;
          gameState.kronosRingState = 'windup_combo';
          gameState.kronosStateTimer = q.windupDur;
          kronosRingBadge.update(gameState.bossHp, 100, 'windup', '! BOSS JAB !', 'mic_drop_combo');
          audioEngine.playCombatSfx('enemy-telegraph', 'PERFECT', kronosRig.root.position);
        } else {
          gameState.bossAttackPattern = 'bass_shockwave';
          gameState.kronosRingState = 'windup_shockwave';
          gameState.kronosStateTimer = q.windupDur;
          kronosRingBadge.update(gameState.bossHp, 100, 'windup', '! SUBWOOFER BASS DROP !', 'bass_shockwave');
          audioEngine.playCombatSfx('subwoofer-bass-drop', 'PERFECT', kronosRig.root.position);
        }
        contextState.someoneWindingUp = true;
      }
    }
  }

  // Active Expanding Subwoofer Bass-Drop Shockwave Ring
  if (gameState.bossShockwave && gameState.bossShockwave.active) {
    const wave = gameState.bossShockwave;
    wave.radius += wave.speed * dt;
    const progress = Math.min(1.0, (wave.radius - 0.25) / (wave.maxRadius - 0.25));
    const curScale = Math.max(0.1, wave.radius / 0.55);
    wave.mesh.scale.set(curScale, curScale, 1);
    wave.mesh.material.opacity = Math.max(0.0, 0.95 * (1.0 - progress));
    if (progress > 0.45) wave.mesh.material.color.setHex(0xff1e38);

    const d = gameState.playerPos.distanceTo(wave.pos);
    const inWaveFront = Math.abs(d - wave.radius) <= 0.65;
    const isPlayerDodging = gameState.dodgeInvulnTimer > 0;

    if (inWaveFront) {
      if (isPlayerDodging && !wave.evaded) {
        wave.evaded = true;
        gameState.shockwaveDodged = true;
        gameState.hype = Math.min(100.0, (gameState.hype || 0) + 25.0);
        floorDial.updateBadge('COUNTER WEAVE!', '#ffe042');
        setStarburstText('COUNTER WEAVE!', 1.25);
        audioEngine.playCombatSfx('counter-weave', 'PERFECT', gameState.playerPos);

        gameState.kronosRingState = 'counter_stun';
        gameState.kronosStateTimer = 2.0;
        gameState.counterBonusTimer = 2.0;
        gameState.bossCounterStunActive = true;
        gameState.bossAttackPattern = 'idle';
        kronosRingBadge.update(gameState.bossHp, 100, 'counter_stun', '★ COUNTER-STUN PUNISH! ★');
      } else if (!isPlayerDodging && !wave.hit && !wave.evaded) {
        wave.hit = true;
        applyPlayerDamage(22, 'SUB-BASS IMPACT!', 0.40, 0.06);
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
        gameState.kronosAttackCooldown = 2.0;
        kronosRingBadge.update(gameState.bossHp, 100, 'stalking', '★ BOSS DJ KRONOS ★');
      }
    }
  }

  if (kronosBlender) kronosBlender.update(dt);
}

function updateVFX(dt, elapsed, beatPulse, beatPhase, bass, songTime, chart) {
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

  boomboxStage.updateStageDisplays(
    audioEngine.isPlaying ? audioEngine.freqData : null,
    bass,
    beatPulse,
    dt,
    gameState.hype
  );

  if (songTime !== null && !reducedMotionEnabled) {
    const beatSin = Math.sin((Math.PI * songTime) / beatSec);
    const beatMod = beatSin * beatSin;
    stageMagentaLight.intensity = 1.68 * (1.0 + 0.16 * beatMod);
    stageCyanLight.intensity = 1.48 * (1.0 + 0.16 * beatMod);
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

  kickSmear.pebbles.forEach(({ mesh, basePos, phase }) => {
    mesh.position.y = basePos.y + Math.sin(elapsed * 4.2 + phase) * 0.04;
    mesh.rotation.x += dt * 1.8;
    mesh.rotation.y += dt * 2.2;
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

  const hypeRatio = Math.max(0, Math.min(1.0, (gameState.hype || 0) / 100));
  const jumpAmp = reducedMotionEnabled ? 0.04 : (0.14 + 0.14 * hypeRatio);
  if (instancedCrowdHandle && instancedCrowdHandle.update) {
    instancedCrowdHandle.update(elapsed, bpm, jumpAmp);
  }

  for (let i = gameState.activeImpactVFX.length - 1; i >= 0; i--) {
    const vfx = gameState.activeImpactVFX[i];
    const alive = vfx.update(dt, camera.position);
    if (!alive) {
      if (vfx.dispose) vfx.dispose(scene);
      gameState.activeImpactVFX.splice(i, 1);
    }
  }

  for (let i = gameState.activeSmears.length - 1; i >= 0; i--) {
    const s = gameState.activeSmears[i];
    s.life -= dt;
    s.mesh.material.opacity = Math.max(0, s.life / 0.22);
    s.mesh.scale.multiplyScalar(1 + dt * 2.2);
    if (s.life <= 0) {
      if (s.release) s.release();
      else scene.remove(s.mesh);
      gameState.activeSmears.splice(i, 1);
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
}

const clock = new THREE.Clock();
let _debugHarnessRef = null;
let _crowdDeferredScheduled = false;

function animate() {
  requestAnimationFrame(animate);

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
  const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
  const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
  const beatFloat = songTime !== null ? Math.max(0, (songTime - firstOffset) / beatSec) : 0;
  const beatPhase = songTime !== null ? (beatFloat % 1) : 0;
  const beatPulse = songTime !== null ? Math.exp(-beatPhase * 4.5) : 0;
  const bass = audioEngine.getBassEnergy();

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

  const contextState = {
    someoneWindingUp: bruisers.some((b) => b.active && (b.state === 'windup' || b.state === 'striking')) ||
      (gameState.kronosInRing && (
        gameState.kronosRingState === 'windup' || gameState.kronosRingState === 'striking' ||
        gameState.kronosRingState === 'windup_combo' || gameState.kronosRingState === 'striking_combo' ||
        gameState.kronosRingState === 'windup_shockwave' || gameState.kronosRingState === 'shockwave_active'
      ))
  };

  updatePlayer(dt, rawDt, elapsed, beatPulse);

  for (let i = 0; i < bruisers.length; i++) {
    updateFighterFSM(bruisers[i], dt, rawDt, elapsed, beatPulse, songTime, chart, contextState);
  }

  // Wave progression when all Bruisers in Wave 1 or Wave 2 are defeated
  if (gameState.wave === 1 && getActiveBruiserCount() === 0 && !bruisers.some((b) => b.state === 'flying')) {
    audioEngine.triggerCrowdHype('wave-clear');
    spawnWave(2);
  } else if (gameState.wave === 2 && getActiveBruiserCount() === 0 && !bruisers.some((b) => b.state === 'flying')) {
    audioEngine.triggerCrowdHype('wave-clear');
    spawnWave(3);
  }

  updateFighterFSM({ isBoss: true }, dt, rawDt, elapsed, beatPulse, songTime, chart, contextState);
  updateVFX(dt, elapsed, beatPulse, beatPhase, bass, songTime, chart);
  updateCamera(dt, rawDt, elapsed);
  updateStyleRankAndHype(dt);
  updateHudNumbers();

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
}

// Dynamically load kronos-debug.js ONLY when ?debug=1 or ?turnaround= is present
if (IS_DEBUG_MODE) {
  import('./kronos-debug.js?v=20261017b').then(({ attachKronosDebugHarness }) => {
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
      evaluateBeatWindow: (t) => evaluateBeatWindow(t !== undefined ? t : audioEngine.getSongTime()),
      evaluateBeatWindowAtTime: (t) => evaluateBeatWindow(t),
      quantizeWindupToBeat,
      estimateBpmFromAudioBuffer,
      buildCustomTrackChart,
      KRONOS_TRACK_CHARTS,
      KRONOS_BPM,
      KRONOS_BEAT_SEC,
      KRONOS_LOOP_DURATION,
      KRONOS_BEAT_TIMES,
      KRONOS_BARS,
      stepSimulation: (dtSec = 0.016) => {
        const chart = audioEngine.getActiveChart();
        const songTime = audioEngine.getSongTime();
        const beatSec = (chart && chart.beatSec) || KRONOS_BEAT_SEC;
        const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : KRONOS_FIRST_BEAT_OFFSET;
        const beatFloat = songTime !== null ? Math.max(0, (songTime - firstOffset) / beatSec) : 0;
        const beatPhase = songTime !== null ? (beatFloat % 1) : 0;
        const beatPulse = songTime !== null ? Math.exp(-beatPhase * 4.5) : 0;
        const elapsed = clock.getElapsedTime();
        updatePlayer(dtSec, dtSec, elapsed, beatPulse);
        const contextState = { someoneWindingUp: false };
        for (let i = 0; i < bruisers.length; i++) {
          updateFighterFSM(bruisers[i], dtSec, dtSec, elapsed, beatPulse, songTime, chart, contextState);
        }
        updateFighterFSM({ isBoss: true }, dtSec, dtSec, elapsed, beatPulse, songTime, chart, contextState);
        updateHudNumbers();
      },
      updateHudNumbers,
      buildChallengerModel,
      buildKronosBossModel,
      buildBruiserModel,
      buildSpectatorModel,
      buildSubwooferShockwaveRing,
      setStarburstText,
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
