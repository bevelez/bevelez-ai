/**
 * pirate-frequency/audio.js
 * Tape No. 07: PIRATE FREQUENCY (107.7 FM)
 *
 * Self-contained 118 BPM Funky Pirate Radio Web Audio Engine:
 * - Sample-accurate lookahead 16-step / 16-bar sequencer in F Dorian / C minor funk
 *   (Fm9 - Bb13 - Ebmaj9 - C7(#9))
 * - Sub-millisecond beat phase & quantized input evaluator (PERFECT / GOOD / FLOW)
 * - 4-Tier Dynamic Stem Un-Muting (DRUMS, BASS, RHODES, LEAD) with ~0.18s crossfades
 * - Real-time 32-bin spectrum analyzer + continuous speed-modulated rail-grind synth
 * - Synthesized arcade SFX (Jump, Boost, Beat-Harmonized Trick, Pickup, Delivery, Countdown)
 */

const BPM = 118;
const BEAT_SEC = 60 / BPM; // ~0.508474576s
const STEPS_PER_BEAT = 4;
const STEPS_PER_BAR = 16;
const STEP_SEC = BEAT_SEC / STEPS_PER_BEAT; // ~0.127118644s
const LOOP_BARS = 16;
const LOOP_STEPS = LOOP_BARS * STEPS_PER_BAR; // 256 steps

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_VISIBLE_SEC = 0.14;
const LOOKAHEAD_HIDDEN_SEC = 1.2;
const MAX_CATCHUP_SEC = 180.0;

const STEM_TAU_SEC = 0.18;
const SILENT_GAIN = 0.0001; // -80 dB floor (inaudible, strictly positive for Web Audio)
const MASTER_LEVEL = 0.78;
const SWING_RATIO = 0.042; // Subtle pocket swing on off-16ths

// ============================================================================
// HARMONY & 16-BAR F DORIAN / C MINOR FUNK ARRANGEMENT
// Progression (4-bar cycle x 4): Fm9 -> Bb13 -> Ebmaj9 -> C7(#9)
// ============================================================================

const CHORD_BOOK = [
  {
    name: 'Fm9',
    root: 41, // F2
    rhodes: [53, 56, 60, 63, 67], // F3, Ab3, C4, Eb4, G4
    clav: [68, 72, 75, 79],       // Ab4, C5, Eb5, G5
    arp: [65, 68, 72, 75, 79, 75, 72, 68],
    trickStab: [65, 68, 72, 75, 79] // F4, Ab4, C5, Eb5, G5
  },
  {
    name: 'Bb13',
    root: 34, // Bb1
    rhodes: [56, 60, 62, 67],     // Ab3, C4, D4, G4 (rootless Herbie voicing)
    clav: [68, 72, 74, 79],       // Ab4, C5, D5, G5
    arp: [68, 70, 74, 79, 82, 79, 74, 70],
    trickStab: [68, 70, 74, 79, 82] // Ab4, Bb4, D5, G5, Bb5
  },
  {
    name: 'Ebmaj9',
    root: 39, // Eb2
    rhodes: [55, 58, 62, 65],     // G3, Bb3, D4, F4
    clav: [67, 70, 74, 77],       // G4, Bb4, D5, F5
    arp: [67, 70, 74, 77, 79, 77, 74, 70],
    trickStab: [67, 70, 74, 77, 82] // G4, Bb4, D5, F5, Bb5
  },
  {
    name: 'C7#9',
    root: 36, // C2
    rhodes: [52, 58, 63, 67],     // E3, Bb3, D#4, G4 (Hendrix funk dominant)
    clav: [64, 70, 75, 79],       // E4, Bb4, D#5, G5
    arp: [64, 67, 70, 75, 79, 75, 70, 67],
    trickStab: [64, 70, 75, 79, 84] // E4, Bb4, D#5, G5, C6
  }
];

// Breakbeat drum patterns (16 steps per bar)
// Kick: 'X' accent, 'x' normal, '.' rest
const KICK_PATTERNS = [
  'X..x..x...x..x..', // Bar 0: tight syncopated breakbeat
  'X..x..x..xx...x.', // Bar 1: double-kick funk pocket
  'X..x..x...x.x...', // Bar 2: rolling bounce
  'X..x..x..x..x...'  // Bar 3: setup for breakbeat fill
];

// Snare: 'X' rim-crack backbeat, 'g'Funky Drummer ghost note, '.' rest
const SNARE_PATTERNS = [
  '....X..g.g..X..g',
  '....X..g....X.g.',
  '....X..g.g..X..g',
  '....X..g.g..Xxxx' // 4-bar breakbeat snare chop on steps 13..15
];

// Hats: 'x' tight closed, 'o' soft closed, 'O' sizzling open hat
const HAT_PATTERNS = [
  'xoxoxoxoxoxOxoxo',
  'xoxoxoxoxoxOxoOx',
  'xoxoxoxoxoxOxoxo',
  'xoxoxoxoxOxOxoOO'
];

// Syncopated 16th-note Dorian funk-acid basslines per chord: [step, midi, lenSteps, vel]
const BASS_BARS = [
  // Fm9
  [
    [0, 41, 2, 0.96], [2, 53, 1, 0.76], [3, 41, 1, 0.66],
    [6, 44, 2, 0.88], [9, 46, 1, 0.78], [10, 48, 2, 0.90],
    [13, 50, 1, 0.78], [14, 51, 1, 0.85], [15, 33, 1, 0.74]
  ],
  // Bb13
  [
    [0, 34, 2, 0.96], [3, 46, 1, 0.82], [4, 38, 2, 0.82],
    [7, 41, 1, 0.74], [8, 43, 2, 0.88], [10, 44, 2, 0.90],
    [13, 41, 1, 0.76], [14, 38, 2, 0.86]
  ],
  // Ebmaj9
  [
    [0, 39, 3, 0.95], [3, 51, 1, 0.80], [6, 43, 2, 0.86],
    [8, 46, 2, 0.88], [11, 50, 1, 0.78], [12, 48, 2, 0.84],
    [14, 46, 1, 0.78], [15, 37, 1, 0.76]
  ],
  // C7(#9)
  [
    [0, 36, 2, 0.96], [2, 48, 1, 0.82], [4, 40, 2, 0.85],
    [6, 43, 2, 0.84], [8, 46, 2, 0.92], [10, 51, 2, 0.94],
    [12, 48, 1, 0.85], [13, 43, 1, 0.80], [14, 40, 2, 0.90]
  ]
];

// Rhodes 9th/13th chord stab steps: [step, lenSteps, vel]
const RHODES_COMP_A = [
  [0, 3.2, 0.92],
  [3, 1.8, 0.76],
  [6, 2.8, 0.86],
  [10, 2.4, 0.84],
  [14, 1.6, 0.78]
];

const RHODES_COMP_B = [
  [0, 2.4, 0.90],
  [4, 1.6, 0.74],
  [6, 3.0, 0.88],
  [11, 2.2, 0.84],
  [14, 1.8, 0.82]
];

// Rhythmic wah-chuck clavinet comping steps: [step, vel]
const CLAV_CHUCK_STEPS = [
  [2, 0.72],
  [5, 0.58],
  [7, 0.82],
  [9, 0.62],
  [11, 0.76],
  [13, 0.68],
  [15, 0.84]
];

// 16-bar soaring Pirate Lead melody: [bar, step, midi, lenSteps, vel]
const LEAD_NOTES = [
  // Bars 0-3: Hook A (Pirate Anthem Call)
  [0, 0, 72, 3, 0.92], [0, 3, 75, 3, 0.90], [0, 6, 77, 4, 0.96], [0, 12, 79, 2, 0.86], [0, 14, 77, 2, 0.84],
  [1, 0, 74, 4, 0.94], [1, 6, 72, 2, 0.86], [1, 8, 70, 4, 0.90], [1, 14, 72, 2, 0.82],
  [2, 0, 74, 3, 0.92], [2, 3, 77, 3, 0.90], [2, 6, 79, 6, 0.95], [2, 13, 77, 1, 0.82], [2, 14, 75, 2, 0.86],
  [3, 0, 75, 3, 0.95], [3, 3, 72, 3, 0.88], [3, 6, 70, 4, 0.90], [3, 12, 67, 2, 0.84], [3, 14, 70, 2, 0.88],

  // Bars 4-7: Hook A' (High-Energy Response)
  [4, 0, 77, 3, 0.95], [4, 3, 79, 3, 0.92], [4, 6, 80, 4, 0.96], [4, 11, 79, 1, 0.84], [4, 12, 77, 2, 0.88], [4, 14, 75, 2, 0.86],
  [5, 0, 79, 4, 0.96], [5, 6, 77, 2, 0.88], [5, 8, 74, 6, 0.92], [5, 14, 75, 2, 0.86],
  [6, 0, 79, 3, 0.94], [6, 3, 82, 3, 0.96], [6, 6, 81, 2, 0.86], [6, 8, 79, 4, 0.94], [6, 12, 77, 4, 0.90],
  [7, 0, 76, 2, 0.92], [7, 2, 79, 2, 0.94], [7, 4, 75, 4, 0.96], [7, 10, 72, 2, 0.88], [7, 12, 75, 2, 0.92], [7, 14, 76, 2, 0.94],

  // Bars 8-11: Bridge (Syncopated Rooftop Funk Riff)
  [8, 0, 84, 3, 0.98], [8, 4, 80, 2, 0.90], [8, 6, 79, 2, 0.90], [8, 8, 77, 4, 0.94], [8, 14, 75, 2, 0.86],
  [9, 0, 74, 3, 0.94], [9, 3, 79, 3, 0.95], [9, 6, 84, 4, 0.96], [9, 12, 82, 4, 0.92],
  [10, 0, 79, 3, 0.94], [10, 3, 77, 3, 0.90], [10, 6, 74, 4, 0.92], [10, 12, 77, 2, 0.88], [10, 14, 79, 2, 0.92],
  [11, 0, 84, 3, 0.96], [11, 3, 82, 3, 0.94], [11, 6, 79, 4, 0.92], [11, 12, 75, 4, 0.95],

  // Bars 12-15: Full Broadcast Climax & Turnaround
  [12, 0, 77, 2, 0.96], [12, 2, 80, 2, 0.94], [12, 4, 84, 4, 0.98], [12, 10, 86, 2, 0.94], [12, 12, 84, 4, 0.96],
  [13, 0, 86, 4, 0.98], [13, 6, 84, 2, 0.92], [13, 8, 79, 4, 0.95], [13, 14, 82, 2, 0.92],
  [14, 0, 82, 3, 0.96], [14, 3, 79, 3, 0.94], [14, 6, 77, 4, 0.92], [14, 12, 74, 4, 0.90],
  [15, 0, 75, 2, 0.96], [15, 2, 76, 2, 0.96], [15, 4, 79, 2, 0.96], [15, 6, 82, 2, 0.96], [15, 8, 87, 4, 1.0], [15, 12, 84, 2, 0.96], [15, 14, 79, 2, 0.94]
];

// Index lead notes by bar for O(1) lookup per step
const LEAD_BY_BAR = Array.from({ length: LOOP_BARS }, () => []);
for (const entry of LEAD_NOTES) {
  LEAD_BY_BAR[entry[0]].push(entry);
}

// ============================================================================
// SAFE DSP & MONOTONIC AUDIOPARAM HELPERS
// ============================================================================

function midiToFreq(midi, centsOffset = 0) {
  return 440 * Math.pow(2, (midi - 69 + centsOffset / 100) / 12);
}

function clampFreq(f) {
  if (!Number.isFinite(f)) return 440;
  return Math.max(20, Math.min(18000, f));
}

function clampGain(g) {
  if (!Number.isFinite(g)) return SILENT_GAIN;
  return Math.max(SILENT_GAIN, Math.min(3.5, g));
}

function makeSoftClipCurve(drive = 1.85, samples = 512) {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(drive) || 1;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

// Deterministic PRNG for reproducible noise/spark buffers without external deps
function createSeededNoise(seed = 1077) {
  let s = seed >>> 0;
  return function nextRand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

// ============================================================================
// MAIN PIRATE AUDIO FACTORY
// ============================================================================

export function createPirateAudio(options = {}) {
  let ctx = null;
  let isPlaying = false;
  let comboTier = 0;

  // Transport & scheduler state
  let transportStartTime = 0;
  let nextStepTime = 0;
  let totalStepsScheduled = 0;
  let schedulerTimer = null;
  let lookaheadSec = LOOKAHEAD_VISIBLE_SEC;
  let lastLeadFreq = null;
  let lastLeadTime = -1;

  // Audio graph nodes
  let masterGain = null;
  let analyser = null;
  let analyserRawBins = null;
  const spectrumBins = new Uint8Array(32);

  let duckBus = null;
  let bassDrive = null;
  let delayInput = null;
  let reverbInput = null;
  let noiseBuffer = null;
  let sparkBuffer = null;

  // 4 Dynamic Stem GainNodes
  const stemGains = {
    drums: null,
    bass: null,
    rhodes: null,
    lead: null
  };

  // Analytical stem envelope tracker for smooth real-time HUD & test inspection
  const stemLevels = {
    drums: 0,
    bass: 0,
    rhodes: 0,
    lead: 0
  };
  const stemTargets = {
    drums: 0,
    bass: 0,
    rhodes: 0,
    lead: 0
  };
  let lastStemSampleTime = 0;

  // Continuous rail-grinding synth state
  let grindActive = false;
  let grindSpeed = 0;
  let grindScrapeGain = null;
  let grindScrapeFilter = null;
  let grindSparkGain = null;
  let grindSparkFilter = null;

  // WeakMap tracking the latest scheduled timestamp per AudioParam to guarantee
  // strictly monotonic envelope times across lookahead steps & rapid SFX triggers.
  const paramLastTime = new WeakMap();

  function monotonicTime(param, desiredTime, minDelta = 0.0002) {
    const t = Math.max(0, Number.isFinite(desiredTime) ? desiredTime : 0);
    if (!param || typeof param !== 'object') return t;
    const prev = paramLastTime.get(param);
    const next = prev !== undefined ? Math.max(t, prev + minDelta) : t;
    paramLastTime.set(param, next);
    return next;
  }

  function setFreqAt(param, freq, time) {
    if (!param) return time;
    const f = clampFreq(freq);
    const t = monotonicTime(param, time, 0.0001);
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(f, t);
    } else {
      param.value = f;
    }
    return t;
  }

  function expRampFreq(param, freq, time) {
    if (!param) return time;
    const f = clampFreq(freq);
    const t = monotonicTime(param, time, 0.0005);
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(f, t);
    } else if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(f, t);
    } else {
      param.value = f;
    }
    return t;
  }

  function setGainAt(param, gain, time) {
    if (!param) return time;
    const g = clampGain(gain);
    const t = monotonicTime(param, time, 0.0001);
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(g, t);
    } else {
      param.value = g;
    }
    return t;
  }

  function linearRampGain(param, gain, time) {
    if (!param) return time;
    const g = clampGain(gain);
    const t = monotonicTime(param, time, 0.0005);
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(g, t);
    } else {
      param.value = g;
    }
    return t;
  }

  function expRampGain(param, gain, time) {
    if (!param) return time;
    const g = clampGain(gain);
    const t = monotonicTime(param, time, 0.0005);
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(g, t);
    } else if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(g, t);
    } else {
      param.value = g;
    }
    return t;
  }

  function targetGainAt(param, gain, time, tau = STEM_TAU_SEC) {
    if (!param) return time;
    const g = clampGain(gain);
    const safeTau = Math.max(0.008, Number.isFinite(tau) ? tau : STEM_TAU_SEC);
    const t = monotonicTime(param, time, 0.0002);
    if (typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(g, t, safeTau);
    } else if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(g, t);
    } else {
      param.value = g;
    }
    return t;
  }

  function targetFreqAt(param, freq, time, tau = 0.05) {
    if (!param) return time;
    const f = clampFreq(freq);
    const safeTau = Math.max(0.008, Number.isFinite(tau) ? tau : 0.05);
    const t = monotonicTime(param, time, 0.0002);
    if (typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(f, t, safeTau);
    } else if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(f, t);
    } else {
      param.value = f;
    }
    return t;
  }

  function setFilterQ(filter, qVal) {
    if (!filter || !filter.Q) return;
    const safeQ = Math.max(0.1, Math.min(24, Number.isFinite(qVal) ? qVal : 1.0));
    if (typeof filter.Q === 'object') {
      filter.Q.value = safeQ;
    } else {
      filter.Q = safeQ;
    }
  }

  function createStereoPan(panValue = 0) {
    if (ctx && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      const clampedPan = Math.max(-1, Math.min(1, Number.isFinite(panValue) ? panValue : 0));
      if (panner.pan && typeof panner.pan === 'object') {
        panner.pan.value = clampedPan;
      }
      return panner;
    }
    const passthrough = ctx.createGain();
    passthrough.gain.value = 1.0;
    return passthrough;
  }

  // ==========================================================================
  // CONTEXT & STUDIO MASTER GRAPH INITIALIZATION
  // ==========================================================================

  function resolveAudioContextClass() {
    if (options && typeof options.AudioContextClass === 'function') {
      return options.AudioContextClass;
    }
    if (typeof globalThis !== 'undefined') {
      if (typeof globalThis.AudioContext === 'function') return globalThis.AudioContext;
      if (typeof globalThis.webkitAudioContext === 'function') return globalThis.webkitAudioContext;
      if (globalThis.window) {
        if (typeof globalThis.window.AudioContext === 'function') return globalThis.window.AudioContext;
        if (typeof globalThis.window.webkitAudioContext === 'function') return globalThis.window.webkitAudioContext;
      }
    }
    return null;
  }

  function ensureContext() {
    if (ctx) return ctx;
    if (options && options.ctx) {
      ctx = options.ctx;
    } else {
      const AudioCtx = resolveAudioContextClass();
      if (!AudioCtx) return null;
      ctx = new AudioCtx({ latencyHint: 'interactive' });
    }

    const now = Math.max(0, Number(ctx.currentTime) || 0);
    const sampleRate = Number(ctx.sampleRate) > 0 ? Number(ctx.sampleRate) : 44100;

    // Master chain: masterGain -> sub highpass -> glue compressor -> limiter -> analyser -> destination
    masterGain = ctx.createGain();
    setGainAt(masterGain.gain, MASTER_LEVEL, now);

    let chainTail = masterGain;

    if (typeof ctx.createBiquadFilter === 'function') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      setFreqAt(hp.frequency, 30, now);
      setFilterQ(hp, 0.707);
      chainTail.connect(hp);
      chainTail = hp;
    }

    if (typeof ctx.createDynamicsCompressor === 'function') {
      const comp = ctx.createDynamicsCompressor();
      if (comp.threshold) comp.threshold.value = -16;
      if (comp.knee) comp.knee.value = 12;
      if (comp.ratio) comp.ratio.value = 3.2;
      if (comp.attack) comp.attack.value = 0.008;
      if (comp.release) comp.release.value = 0.18;
      chainTail.connect(comp);
      chainTail = comp;

      const limiter = ctx.createDynamicsCompressor();
      if (limiter.threshold) limiter.threshold.value = -2.5;
      if (limiter.knee) limiter.knee.value = 0;
      if (limiter.ratio) limiter.ratio.value = 18;
      if (limiter.attack) limiter.attack.value = 0.001;
      if (limiter.release) limiter.release.value = 0.08;
      chainTail.connect(limiter);
      chainTail = limiter;
    }

    if (typeof ctx.createAnalyser === 'function') {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 128; // 64 frequency bins -> averaged into 32 crisp HUD bars
      analyser.smoothingTimeConstant = 0.76;
      const binCount = Number(analyser.frequencyBinCount) || 64;
      analyserRawBins = new Uint8Array(binCount);
      chainTail.connect(analyser);
      chainTail = analyser;
    }

    if (ctx.destination) {
      chainTail.connect(ctx.destination);
    }

    // Sidechain ducking bus for bass, rhodes, and lead under breakbeat kicks
    duckBus = ctx.createGain();
    setGainAt(duckBus.gain, 1.0, now);
    duckBus.connect(masterGain);

    // 4 Dynamic Broadcast Stem GainNodes
    stemGains.drums = ctx.createGain();
    stemGains.bass = ctx.createGain();
    stemGains.rhodes = ctx.createGain();
    stemGains.lead = ctx.createGain();

    setGainAt(stemGains.drums.gain, SILENT_GAIN, now);
    setGainAt(stemGains.bass.gain, SILENT_GAIN, now);
    setGainAt(stemGains.rhodes.gain, SILENT_GAIN, now);
    setGainAt(stemGains.lead.gain, SILENT_GAIN, now);

    stemGains.drums.connect(masterGain);
    stemGains.bass.connect(duckBus);
    stemGains.rhodes.connect(duckBus);
    stemGains.lead.connect(duckBus);

    // Analog tanh saturation bus feeding Stem 1 (BASS)
    if (typeof ctx.createWaveShaper === 'function') {
      bassDrive = ctx.createWaveShaper();
      bassDrive.curve = makeSoftClipCurve(2.05);
      bassDrive.oversample = '2x';
      bassDrive.connect(stemGains.bass);
    } else {
      bassDrive = stemGains.bass;
    }

    // Tempo-synced dotted-eighth stereo echo send (feeds into duckBus)
    if (typeof ctx.createDelay === 'function' && typeof ctx.createBiquadFilter === 'function') {
      delayInput = ctx.createGain();
      delayInput.gain.value = 1.0;

      const dly = ctx.createDelay(2.0);
      if (dly.delayTime && typeof dly.delayTime === 'object') {
        dly.delayTime.value = BEAT_SEC * 0.75; // Dotted 8th at 118 BPM (~0.381s)
      }

      const dlyHp = ctx.createBiquadFilter();
      dlyHp.type = 'highpass';
      setFreqAt(dlyHp.frequency, 360, now);

      const dlyLp = ctx.createBiquadFilter();
      dlyLp.type = 'lowpass';
      setFreqAt(dlyLp.frequency, 3100, now);

      const fb = ctx.createGain();
      fb.gain.value = 0.32;

      const wet = ctx.createGain();
      wet.gain.value = 0.38;
      const pan = createStereoPan(0.36);

      delayInput.connect(dly);
      dly.connect(dlyHp);
      dlyHp.connect(dlyLp);
      dlyLp.connect(fb);
      fb.connect(dly);
      dlyLp.connect(wet);
      wet.connect(pan);
      pan.connect(duckBus);
    }

    // Compact studio plate reverb impulse (1.15s tight funk room)
    if (typeof ctx.createConvolver === 'function' && typeof ctx.createBuffer === 'function') {
      try {
        const revLen = Math.floor(sampleRate * 1.15);
        const impulse = ctx.createBuffer(2, revLen, sampleRate);
        const rand = createSeededNoise(9091);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          let lp = 0;
          for (let i = 0; i < revLen; i++) {
            const prog = i / revLen;
            lp += (rand() - lp) * (0.65 - 0.45 * prog);
            data[i] = lp * Math.pow(1 - prog, 2.6);
          }
        }
        const convolver = ctx.createConvolver();
        convolver.buffer = impulse;
        reverbInput = ctx.createGain();
        reverbInput.gain.value = 0.28;
        reverbInput.connect(convolver);
        convolver.connect(masterGain);
      } catch (_) {
        reverbInput = null;
      }
    }

    // Shared 2-second white noise buffer & high-voltage rail-spark crackle buffer
    if (typeof ctx.createBuffer === 'function') {
      const noiseLen = Math.floor(sampleRate * 2.0);
      noiseBuffer = ctx.createBuffer(1, noiseLen, sampleRate);
      const nData = noiseBuffer.getChannelData(0);
      const rand = createSeededNoise(1077);
      for (let i = 0; i < noiseLen; i++) {
        nData[i] = rand();
      }

      const sparkLen = Math.floor(sampleRate * 1.5);
      sparkBuffer = ctx.createBuffer(1, sparkLen, sampleRate);
      const sData = sparkBuffer.getChannelData(0);
      let grit = 0;
      for (let i = 0; i < sparkLen; i++) {
        const w = rand();
        grit = 0.72 * grit + 0.28 * w;
        // High-frequency electric rail arc snaps
        const arc = Math.abs(rand()) > 0.965 ? rand() * 0.95 : 0;
        sData[i] = grit * 0.28 + arc;
      }
    }

    initGrindGraph(now);
    lastStemSampleTime = now;
    return ctx;
  }

  // Persistent speed-modulated metallic rail-scrape + spark crackle loop
  function initGrindGraph(now) {
    if (!ctx || !masterGain || grindScrapeGain) return;

    grindScrapeGain = ctx.createGain();
    setGainAt(grindScrapeGain.gain, SILENT_GAIN, now);

    grindScrapeFilter = ctx.createBiquadFilter();
    grindScrapeFilter.type = 'bandpass';
    setFreqAt(grindScrapeFilter.frequency, 1250, now);
    setFilterQ(grindScrapeFilter, 4.4);

    grindSparkGain = ctx.createGain();
    setGainAt(grindSparkGain.gain, SILENT_GAIN, now);

    grindSparkFilter = ctx.createBiquadFilter();
    grindSparkFilter.type = 'highpass';
    setFreqAt(grindSparkFilter.frequency, 5200, now);
    setFilterQ(grindSparkFilter, 1.8);

    grindScrapeFilter.connect(grindScrapeGain);
    grindScrapeGain.connect(masterGain);

    grindSparkFilter.connect(grindSparkGain);
    grindSparkGain.connect(masterGain);

    // Metallic rail resonance pair (inharmonic steel bar modes)
    if (typeof ctx.createOscillator === 'function') {
      const railModes = [348, 531];
      for (const freq of railModes) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        setFreqAt(osc.frequency, freq, now);
        const modeGain = ctx.createGain();
        modeGain.gain.value = 0.16;
        osc.connect(modeGain);
        modeGain.connect(grindScrapeFilter);
        osc.start(now);
      }
    }

    // Continuous scrape & spark loop buffers
    if (typeof ctx.createBufferSource === 'function' && noiseBuffer && sparkBuffer) {
      const scrapeSrc = ctx.createBufferSource();
      scrapeSrc.buffer = noiseBuffer;
      scrapeSrc.loop = true;
      scrapeSrc.connect(grindScrapeFilter);
      scrapeSrc.start(now);

      const sparkSrc = ctx.createBufferSource();
      sparkSrc.buffer = sparkBuffer;
      sparkSrc.loop = true;
      sparkSrc.connect(grindSparkFilter);
      sparkSrc.start(now);
    }

    if (grindActive) {
      applyGrindParams(grindActive, grindSpeed);
    }
  }

  // ==========================================================================
  // STEM ENVELOPE & CROSSFADE ENGINE
  // ==========================================================================

  function advanceStemEnvelope(nowSec) {
    const dt = Math.max(0, nowSec - lastStemSampleTime);
    lastStemSampleTime = nowSec;
    if (dt <= 0) return;

    const alpha = 1 - Math.exp(-dt / STEM_TAU_SEC);
    for (const key of ['drums', 'bass', 'rhodes', 'lead']) {
      const target = stemTargets[key];
      const next = stemLevels[key] + (target - stemLevels[key]) * alpha;
      stemLevels[key] = next < 0.002 ? 0 : next > 0.998 ? 1 : next;
    }
  }

  function syncStemTargetsToAudio(nowSec) {
    stemTargets.drums = isPlaying ? 1 : 0;
    stemTargets.bass = isPlaying && comboTier >= 1 ? 1 : 0;
    stemTargets.rhodes = isPlaying && comboTier >= 2 ? 1 : 0;
    stemTargets.lead = isPlaying && comboTier >= 3 ? 1 : 0;

    if (!ctx || !stemGains.drums) return;

    targetGainAt(stemGains.drums.gain, stemTargets.drums > 0 ? 0.95 : SILENT_GAIN, nowSec, STEM_TAU_SEC);
    targetGainAt(stemGains.bass.gain, stemTargets.bass > 0 ? 0.92 : SILENT_GAIN, nowSec, STEM_TAU_SEC);
    targetGainAt(stemGains.rhodes.gain, stemTargets.rhodes > 0 ? 0.88 : SILENT_GAIN, nowSec, STEM_TAU_SEC);
    targetGainAt(stemGains.lead.gain, stemTargets.lead > 0 ? 0.86 : SILENT_GAIN, nowSec, STEM_TAU_SEC);
  }

  // ==========================================================================
  // SYNTHESIZED BREAKBEAT & FUNK INSTRUMENT VOICES
  // ==========================================================================

  function spawnNoiseBurst(time, duration, offsetSeed = 0) {
    if (!ctx || !noiseBuffer || typeof ctx.createBufferSource !== 'function') return null;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const maxOffset = Math.max(0, (noiseBuffer.duration || 2.0) - duration - 0.05);
    const offset = maxOffset > 0 ? ((offsetSeed * 0.371) % maxOffset) : 0;
    src.start(time, offset, duration);
    return src;
  }

  // Stem 0: Tight Breakbeat Kick + Sidechain Pump
  function triggerKick(time, vel = 1.0) {
    const t0 = Math.max(ctx.currentTime, time);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const tFreq0 = setFreqAt(osc.frequency, 168, t0);
    const tFreq1 = expRampFreq(osc.frequency, 52, tFreq0 + 0.068);
    expRampFreq(osc.frequency, 44, tFreq1 + 0.16);

    const gain = ctx.createGain();
    const peak = 0.62 * vel;
    const tg0 = setGainAt(gain.gain, SILENT_GAIN, t0);
    const tg1 = linearRampGain(gain.gain, peak, tg0 + 0.003);
    const tg2 = expRampGain(gain.gain, SILENT_GAIN, tg1 + 0.22);

    osc.connect(gain);
    gain.connect(stemGains.drums);
    osc.start(t0);
    osc.stop(tg2 + 0.015);

    // Beater click transient (cuts through laptop/mobile speakers)
    const click = spawnNoiseBurst(t0, 0.018, totalStepsScheduled);
    if (click) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      setFreqAt(hp.frequency, 2600, t0);
      const cg = ctx.createGain();
      const tc0 = setGainAt(cg.gain, 0.14 * vel, t0);
      expRampGain(cg.gain, SILENT_GAIN, tc0 + 0.014);
      click.connect(hp);
      hp.connect(cg);
      cg.connect(stemGains.drums);
    }

    // Sidechain ducking on Bass/Rhodes/Lead (strictly contained within 1 step = 0.127s)
    if (duckBus && vel >= 0.75) {
      const td0 = setGainAt(duckBus.gain, 0.98, t0);
      const td1 = linearRampGain(duckBus.gain, 0.56, td0 + 0.012);
      linearRampGain(duckBus.gain, 1.0, td1 + 0.095);
    }
  }

  // Stem 0: Snappy Funk Snare + Ghost Notes + Breakbeat Pitch Chops
  function triggerSnare(time, vel = 1.0, pitchScale = 1.0) {
    const t0 = Math.max(ctx.currentTime, time);
    const isGhost = vel < 0.45;
    const dur = isGhost ? 0.085 : 0.175;

    const noise = spawnNoiseBurst(t0, dur + 0.02, totalStepsScheduled + 3);
    if (noise) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setFreqAt(bp.frequency, (isGhost ? 2350 : 1920) * pitchScale, t0);
      setFilterQ(bp, isGhost ? 1.3 : 0.85);

      const ng = ctx.createGain();
      const tn0 = setGainAt(ng.gain, 0.24 * vel, t0);
      expRampGain(ng.gain, SILENT_GAIN, tn0 + dur);

      noise.connect(bp);
      bp.connect(ng);
      ng.connect(stemGains.drums);

      if (!isGhost && reverbInput) {
        const revSend = ctx.createGain();
        revSend.gain.value = 0.34;
        ng.connect(revSend);
        revSend.connect(reverbInput);
      }
    }

    // Snare drum shell tone
    const body = ctx.createOscillator();
    body.type = 'triangle';
    const tf0 = setFreqAt(body.frequency, 228 * pitchScale, t0);
    expRampFreq(body.frequency, 144 * pitchScale, tf0 + 0.062);

    const bg = ctx.createGain();
    const tb0 = setGainAt(bg.gain, 0.22 * vel, t0);
    const tb1 = expRampGain(bg.gain, SILENT_GAIN, tb0 + (isGhost ? 0.055 : 0.095));

    body.connect(bg);
    bg.connect(stemGains.drums);
    body.start(t0);
    body.stop(tb1 + 0.012);
  }

  // Stem 0: Crisp Closed/Open Breakbeat Hi-Hats
  function triggerHat(time, vel = 0.7, isOpen = false) {
    const t0 = Math.max(ctx.currentTime, time);
    const decay = isOpen ? 0.22 : 0.042;

    const noise = spawnNoiseBurst(t0, decay + 0.015, totalStepsScheduled + 7);
    if (!noise) return;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    setFreqAt(hp.frequency, isOpen ? 7200 : 8400, t0);

    const hg = ctx.createGain();
    const th0 = setGainAt(hg.gain, 0.11 * vel, t0);
    expRampGain(hg.gain, SILENT_GAIN, th0 + decay);

    const pan = createStereoPan(isOpen ? -0.26 : 0.2);

    noise.connect(hp);
    hp.connect(hg);
    hg.connect(pan);
    pan.connect(stemGains.drums);
  }

  // Stem 1: Gritty Syncopated FM / Sawtooth Funk-Acid Bassline
  function triggerFunkBass(freq, time, duration, vel = 0.9) {
    const t0 = Math.max(ctx.currentTime, time);
    const dur = Math.max(0.055, duration);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    setFreqAt(saw.frequency, freq, t0);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    setFreqAt(sub.frequency, freq, t0);

    // Slap-funk 2x FM harmonic bite on attack
    const fmMod = ctx.createOscillator();
    fmMod.type = 'sine';
    setFreqAt(fmMod.frequency, freq * 2.0, t0);

    const fmIndex = ctx.createGain();
    const tfm0 = setGainAt(fmIndex.gain, freq * 1.35 * vel, t0);
    expRampGain(fmIndex.gain, SILENT_GAIN, tfm0 + Math.min(0.085, dur * 0.75));
    fmMod.connect(fmIndex);
    fmIndex.connect(saw.frequency);

    // Resonant acid-funk filter envelope
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    setFilterQ(filter, vel > 0.85 ? 4.2 : 2.8);
    const tff0 = setFreqAt(filter.frequency, 360 + 1950 * vel, t0);
    expRampFreq(filter.frequency, 140, tff0 + dur);

    const subMix = ctx.createGain();
    subMix.gain.value = 0.56;
    sub.connect(subMix);

    const amp = ctx.createGain();
    const peak = 0.30 * vel;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.005);
    const ta2 = setGainAt(amp.gain, peak * 0.78, Math.max(ta1 + 0.006, t0 + dur * 0.68));
    const ta3 = expRampGain(amp.gain, SILENT_GAIN, Math.max(ta2 + 0.014, t0 + dur));

    saw.connect(filter);
    subMix.connect(filter);
    filter.connect(amp);
    amp.connect(bassDrive);

    const stopAt = ta3 + 0.015;
    saw.start(t0);
    sub.start(t0);
    fmMod.start(t0);
    saw.stop(stopAt);
    sub.stop(stopAt);
    fmMod.stop(stopAt);
  }

  // Stem 2A: Warm Stereo-Panned Electric Rhodes 9th/13th Chord Stab
  function triggerRhodesChord(midiNotes, time, duration, vel = 0.85, panDir = -0.36) {
    const t0 = Math.max(ctx.currentTime, time);
    const dur = Math.max(0.08, duration);

    const bus = ctx.createGain();
    const peak = 0.055 * vel;
    const tb0 = setGainAt(bus.gain, SILENT_GAIN, t0);
    const tb1 = linearRampGain(bus.gain, peak, tb0 + 0.01);
    const tb2 = setGainAt(bus.gain, peak * 0.74, Math.max(tb1 + 0.01, t0 + dur * 0.65));
    const tb3 = expRampGain(bus.gain, SILENT_GAIN, Math.max(tb2 + 0.02, t0 + dur));

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    setFilterQ(lp, 1.1);
    const tlp0 = setFreqAt(lp.frequency, 2100 * vel, t0);
    expRampFreq(lp.frequency, 780, tlp0 + dur);

    const pan = createStereoPan(panDir);
    bus.connect(lp);
    lp.connect(pan);
    pan.connect(stemGains.rhodes);

    if (reverbInput) {
      const rev = ctx.createGain();
      rev.gain.value = 0.35;
      lp.connect(rev);
      rev.connect(reverbInput);
    }

    const stopAt = tb3 + 0.018;
    for (let i = 0; i < midiNotes.length; i++) {
      const freq = midiToFreq(midiNotes[i], (i % 2 === 0 ? -3.5 : 3.5));
      const fund = ctx.createOscillator();
      fund.type = 'triangle';
      setFreqAt(fund.frequency, freq, t0);

      // Classic Rhodes 2x tine bell chime on attack
      const tine = ctx.createOscillator();
      tine.type = 'sine';
      setFreqAt(tine.frequency, freq * 2.0, t0);
      const tineGain = ctx.createGain();
      const tt0 = setGainAt(tineGain.gain, 0.34 * vel, t0);
      expRampGain(tineGain.gain, SILENT_GAIN, tt0 + Math.min(0.18, dur * 0.8));

      tine.connect(tineGain);
      tineGain.connect(bus);
      fund.connect(bus);

      fund.start(t0);
      tine.start(t0);
      fund.stop(stopAt);
      tine.stop(stopAt);
    }
  }

  // Stem 2B: Rhythmic Wah-Chuck Clavinet Funk Comping
  function triggerWahChuck(midiNotes, time, vel = 0.75, panDir = 0.42) {
    const t0 = Math.max(ctx.currentTime, time);
    const dur = 0.075;

    const wah = ctx.createBiquadFilter();
    wah.type = 'bandpass';
    setFilterQ(wah, 3.6);
    const tw0 = setFreqAt(wah.frequency, 880, t0);
    const tw1 = expRampFreq(wah.frequency, 2450, tw0 + 0.022);
    expRampFreq(wah.frequency, 740, tw1 + 0.052);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, 0.036 * vel, ta0 + 0.004);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + dur);

    const pan = createStereoPan(panDir);
    wah.connect(amp);
    amp.connect(pan);
    pan.connect(stemGains.rhodes);

    const stopAt = ta2 + 0.012;
    for (let i = 0; i < midiNotes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
      setFreqAt(osc.frequency, midiToFreq(midiNotes[i]), t0);
      osc.connect(wah);
      osc.start(t0);
      osc.stop(stopAt);
    }
  }

  // Stem 3A: Soaring Detuned Pirate-Synth Lead Melody
  function triggerPirateLead(freq, time, duration, vel = 0.92) {
    const t0 = Math.max(ctx.currentTime, time);
    const dur = Math.max(0.08, duration);

    const canGlide = lastLeadFreq !== null && Math.abs(t0 - lastLeadTime) < BEAT_SEC * 2.2;
    const startFreq = canGlide ? lastLeadFreq : freq;
    lastLeadFreq = freq;
    lastLeadTime = t0;

    // Vibrato LFO routed directly to oscillator Hz (strictly positive gain!)
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    setFreqAt(vib.frequency, 5.4, t0);
    const vibDepth = ctx.createGain();
    const tv0 = setGainAt(vibDepth.gain, SILENT_GAIN, t0);
    linearRampGain(vibDepth.gain, freq * 0.0048, tv0 + Math.min(0.24, dur * 0.7));
    vib.connect(vibDepth);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    setFilterQ(filter, 1.85);
    const tf0 = setFreqAt(filter.frequency, 2950 * vel, t0);
    expRampFreq(filter.frequency, 1380, tf0 + dur);

    const amp = ctx.createGain();
    const peak = 0.072 * vel;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.012);
    const ta2 = setGainAt(amp.gain, peak * 0.85, Math.max(ta1 + 0.01, t0 + dur * 0.74));
    const ta3 = expRampGain(amp.gain, SILENT_GAIN, Math.max(ta2 + 0.02, t0 + dur));

    filter.connect(amp);
    amp.connect(stemGains.lead);

    if (delayInput) {
      const dlySend = ctx.createGain();
      dlySend.gain.value = 0.34;
      amp.connect(dlySend);
      dlySend.connect(delayInput);
    }

    const stopAt = ta3 + 0.018;
    const detunes = [-7.5, 7.5];
    for (const cents of detunes) {
      const ratio = Math.pow(2, cents / 1200);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const to0 = setFreqAt(osc.frequency, startFreq * ratio, t0);
      if (Math.abs(startFreq - freq) > 0.5) {
        expRampFreq(osc.frequency, freq * ratio, to0 + Math.min(0.045, dur * 0.45));
      }
      vibDepth.connect(osc.frequency);
      osc.connect(filter);
      osc.start(t0);
      osc.stop(stopAt);
    }

    // Upper octave edge for broadcast presence
    const oct = ctx.createOscillator();
    oct.type = 'triangle';
    setFreqAt(oct.frequency, freq * 2.0, t0);
    const octGain = ctx.createGain();
    octGain.gain.value = 0.28;
    oct.connect(octGain);
    octGain.connect(filter);

    vib.start(t0);
    oct.start(t0);
    vib.stop(stopAt);
    oct.stop(stopAt);
  }

  // Stem 3B: Sparkling Octave Arpeggio Hook ("FULL BROADCAST" shimmer)
  function triggerSparkleArp(freq, time, duration, vel = 0.72, panDir = 0) {
    const t0 = Math.max(ctx.currentTime, time);
    const dur = Math.max(0.06, duration);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    setFreqAt(osc.frequency, freq, t0);

    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    setFreqAt(shimmer.frequency, freq * 2.0, t0);
    const shimGain = ctx.createGain();
    const ts0 = setGainAt(shimGain.gain, 0.36 * vel, t0);
    expRampGain(shimGain.gain, SILENT_GAIN, ts0 + dur * 0.8);
    shimmer.connect(shimGain);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, 0.044 * vel, ta0 + 0.005);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + dur);

    const pan = createStereoPan(panDir);
    osc.connect(amp);
    shimGain.connect(amp);
    amp.connect(pan);
    pan.connect(stemGains.lead);

    if (delayInput) {
      const send = ctx.createGain();
      send.gain.value = 0.28;
      amp.connect(send);
      send.connect(delayInput);
    }

    const stopAt = ta2 + 0.012;
    osc.start(t0);
    shimmer.start(t0);
    osc.stop(stopAt);
    shimmer.stop(stopAt);
  }

  // ==========================================================================
  // LOOKAHEAD 16-STEP / 16-BAR SEQUENCER
  // ==========================================================================

  function scheduleStep(globalStep, stepTime) {
    if (!ctx || !isPlaying) return;

    const loopStep = ((globalStep % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
    const barInLoop = Math.floor(loopStep / STEPS_PER_BAR); // 0..15
    const stepInBar = loopStep % STEPS_PER_BAR;            // 0..15
    const chordIdx = barInLoop % 4;                         // Fm9, Bb13, Ebmaj9, C7(#9)
    const chord = CHORD_BOOK[chordIdx];

    // Pocket 16th swing on odd steps; tiny +0.001s pad on very first step after start()
    const swingOffset = stepInBar % 2 === 1 ? SWING_RATIO * STEP_SEC : 0;
    const initialPad = globalStep === 0 ? 0.001 : 0;
    const t = Math.max(ctx.currentTime, stepTime + swingOffset + initialPad);

    // ------------------------------------------------------------------------
    // STEM 0: DRUMS (118 BPM Breakbeat Kit + 4-Bar & 16-Bar Fills)
    // ------------------------------------------------------------------------
    const isTurnaroundBar = barInLoop === 15;
    const isFillBar = barInLoop % 4 === 3;

    const kickPat = KICK_PATTERNS[barInLoop % 4];
    const kickCh = kickPat[stepInBar];
    if (kickCh === 'X' || kickCh === 'x') {
      triggerKick(t, kickCh === 'X' ? 1.0 : 0.82);
    } else if (isTurnaroundBar && stepInBar === 11) {
      triggerKick(t, 0.86);
    }

    const snarePat = SNARE_PATTERNS[barInLoop % 4];
    const snareCh = snarePat[stepInBar];
    if (isTurnaroundBar && stepInBar >= 10) {
      // 16-bar hype breakbeat fill descending in pitch across steps 10..15
      const fillProg = (stepInBar - 10) / 5;
      const pitch = 1.28 - 0.36 * fillProg;
      triggerSnare(t, 0.58 + 0.40 * fillProg, pitch);
    } else if (isFillBar && stepInBar >= 13) {
      const pitch = 1.18 - (stepInBar - 13) * 0.1;
      triggerSnare(t, 0.62 + (stepInBar - 13) * 0.14, pitch);
    } else if (snareCh === 'X') {
      triggerSnare(t, 0.96, 1.0);
    } else if (snareCh === 'g') {
      triggerSnare(t, 0.30, 1.08);
    }

    const hatPat = HAT_PATTERNS[barInLoop % 4];
    const hatCh = hatPat[stepInBar];
    if (hatCh === 'O') {
      triggerHat(t, 0.86, true);
    } else if (hatCh === 'x' || hatCh === 'o') {
      triggerHat(t, hatCh === 'x' ? 0.76 : 0.46, false);
    }

    // ------------------------------------------------------------------------
    // STEM 1: BASS (Syncopated FM / Acid Funk Bassline)
    // ------------------------------------------------------------------------
    const bassEvents = BASS_BARS[chordIdx];
    for (let i = 0; i < bassEvents.length; i++) {
      const [bStep, midi, lenSteps, vel] = bassEvents[i];
      if (bStep === stepInBar) {
        // Subtle octave lift variation in second half of 8-bar phrase
        const octShift = barInLoop >= 8 && stepInBar === 10 && chordIdx === 0 ? 12 : 0;
        triggerFunkBass(midiToFreq(midi + octShift), t, STEP_SEC * lenSteps * 0.92, vel);
      }
    }

    // ------------------------------------------------------------------------
    // STEM 2: RHODES 9th/13th STABS + WAH-CHUCK CLAVINET COMPING
    // ------------------------------------------------------------------------
    const rhodesComp = barInLoop % 2 === 0 ? RHODES_COMP_A : RHODES_COMP_B;
    for (let i = 0; i < rhodesComp.length; i++) {
      const [rStep, lenSteps, vel] = rhodesComp[i];
      if (rStep === stepInBar) {
        const panDir = (i % 2 === 0 ? -1 : 1) * 0.36;
        triggerRhodesChord(chord.rhodes, t, STEP_SEC * lenSteps, vel, panDir);
      }
    }

    for (let i = 0; i < CLAV_CHUCK_STEPS.length; i++) {
      const [cStep, vel] = CLAV_CHUCK_STEPS[i];
      if (cStep === stepInBar) {
        const panDir = (stepInBar % 4 < 2 ? 1 : -1) * 0.44;
        triggerWahChuck(chord.clav, t, vel, panDir);
      }
    }

    // ------------------------------------------------------------------------
    // STEM 3: PIRATE SYNTH LEAD + SPARKLING OCTAVE ARPEGGIO HOOK
    // ------------------------------------------------------------------------
    const barLeads = LEAD_BY_BAR[barInLoop];
    for (let i = 0; i < barLeads.length; i++) {
      const [, lStep, midi, lenSteps, vel] = barLeads[i];
      if (lStep === stepInBar) {
        triggerPirateLead(midiToFreq(midi), t, STEP_SEC * lenSteps * 0.95, vel);
      }
    }

    // Sparkling 16th-note octave arpeggio hook
    const arpBaseMidi = chord.arp[stepInBar % chord.arp.length];
    const octaveHop = stepInBar % 4 === 0 ? 12 : 0;
    const arpAccent = stepInBar % 4 === 0 ? 0.85 : 0.62;
    const arpPan = ((stepInBar >> 1) % 2 === 0 ? -1 : 1) * 0.48;
    triggerSparkleArp(midiToFreq(arpBaseMidi + octaveHop), t, STEP_SEC * 1.35, arpAccent, arpPan);
  }

  function schedulerTick() {
    if (!isPlaying || !ctx) return;

    const now = Number(ctx.currentTime) || 0;
    advanceStemEnvelope(now);

    // Guard against runaway multi-minute background suspension while allowing 32+ bar test jumps
    if (now - nextStepTime > MAX_CATCHUP_SEC) {
      const skippedSteps = Math.floor((now - transportStartTime) / STEP_SEC);
      totalStepsScheduled = Math.max(0, skippedSteps);
      nextStepTime = transportStartTime + totalStepsScheduled * STEP_SEC;
    }

    const horizon = now + lookaheadSec;
    while (nextStepTime < horizon) {
      scheduleStep(totalStepsScheduled, nextStepTime);
      totalStepsScheduled += 1;
      nextStepTime = transportStartTime + totalStepsScheduled * STEP_SEC;
    }
  }

  function stopSchedulerTimer() {
    if (schedulerTimer !== null && typeof clearInterval === 'function') {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  // Keep background tab lookahead resilient in real browsers
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      lookaheadSec = document.hidden ? LOOKAHEAD_HIDDEN_SEC : LOOKAHEAD_VISIBLE_SEC;
      if (isPlaying) schedulerTick();
    });
  }

  // ==========================================================================
  // PUBLIC TRANSPORT & BEAT QUANTIZATION API
  // ==========================================================================

  function getSongElapsedSec() {
    if (!ctx) return 0;
    return Math.max(0, (Number(ctx.currentTime) || 0) - transportStartTime);
  }

  function start() {
    ensureContext();
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        Promise.resolve(ctx.resume()).catch(() => {});
      } catch (_) {}
    }

    stopSchedulerTimer();
    isPlaying = true;
    lastLeadFreq = null;
    lastLeadTime = -1;

    const now = ctx ? Math.max(0, Number(ctx.currentTime) || 0) : 0;
    transportStartTime = now;
    nextStepTime = now;
    totalStepsScheduled = 0;
    lastStemSampleTime = now;

    if (ctx && masterGain) {
      targetGainAt(masterGain.gain, MASTER_LEVEL, now, 0.06);
    }
    syncStemTargetsToAudio(now);
    schedulerTick();

    if (typeof setInterval === 'function') {
      schedulerTimer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
    }
    return true;
  }

  function stop() {
    isPlaying = false;
    stopSchedulerTimer();

    const now = ctx ? Math.max(0, Number(ctx.currentTime) || 0) : 0;
    advanceStemEnvelope(now);
    syncStemTargetsToAudio(now);
    applyGrindParams(false, 0);

    if (ctx && masterGain) {
      targetGainAt(masterGain.gain, SILENT_GAIN, now, 0.06);
    }
    return false;
  }

  function toggle() {
    return isPlaying ? stop() : start();
  }

  function getBeatPhase() {
    if (!isPlaying || !ctx) return 0;
    schedulerTick();
    const elapsed = getSongElapsedSec();
    const beats = elapsed / BEAT_SEC;
    const phase = beats - Math.floor(beats);
    return phase >= 0 && phase < 1 ? phase : 0;
  }

  function getBarAndBeat() {
    if (!isPlaying || !ctx) {
      return { bar: 0, beat: 0, step: 0, bpm: BPM, isPlaying: false };
    }
    schedulerTick();
    const elapsed = getSongElapsedSec();
    const totalSteps = Math.max(0, Math.floor(elapsed / STEP_SEC));
    const step = totalSteps % STEPS_PER_BAR;
    const beat = Math.floor(step / STEPS_PER_BEAT);
    const bar = Math.floor(totalSteps / STEPS_PER_BAR);
    return {
      bar,
      beat,
      step,
      bpm: BPM,
      isPlaying: true
    };
  }

  function evaluateBeatHit() {
    if (isPlaying && ctx) {
      schedulerTick();
    }
    const elapsed = ctx
      ? Math.max(0, (Number(ctx.currentTime) || 0) - transportStartTime)
      : (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);

    // Distance in ms to nearest quarter-note beat
    const nearestBeatIdx = Math.round(elapsed / BEAT_SEC);
    const absBeatMs = Math.abs(elapsed - nearestBeatIdx * BEAT_SEC) * 1000;

    if (absBeatMs <= 85) {
      return { rating: 'PERFECT', accuracy: 1.0, bonusMultiplier: 2.0 };
    }

    // Distance in ms to nearest 8th-note offbeat ((k + 0.5) * BEAT_SEC)
    const offbeatIdx = Math.round(elapsed / BEAT_SEC - 0.5);
    const absOffbeatMs = Math.abs(elapsed - (offbeatIdx + 0.5) * BEAT_SEC) * 1000;

    if (absBeatMs <= 155 || absOffbeatMs <= 70) {
      return { rating: 'GOOD', accuracy: 0.75, bonusMultiplier: 1.4 };
    }

    return { rating: 'FLOW', accuracy: 0.4, bonusMultiplier: 1.0 };
  }

  function setComboTier(tier) {
    const raw = Number(tier);
    const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(3, Math.floor(raw))) : 0;
    comboTier = clamped;

    const now = ctx ? Math.max(0, Number(ctx.currentTime) || 0) : 0;
    if (isPlaying && ctx) {
      schedulerTick();
    } else {
      advanceStemEnvelope(now);
    }
    syncStemTargetsToAudio(now);
    return comboTier;
  }

  function getStemLevels() {
    const now = ctx ? Math.max(0, Number(ctx.currentTime) || 0) : lastStemSampleTime;
    if (isPlaying && ctx) {
      schedulerTick();
    } else {
      advanceStemEnvelope(now);
    }
    return {
      drums: stemLevels.drums,
      bass: stemLevels.bass,
      rhodes: stemLevels.rhodes,
      lead: stemLevels.lead,
      tier: comboTier
    };
  }

  function getSpectrum() {
    if (!isPlaying) {
      spectrumBins.fill(0);
      return spectrumBins;
    }

    if (ctx) schedulerTick();

    let hasLiveEnergy = false;
    if (analyser && analyserRawBins && typeof analyser.getByteFrequencyData === 'function') {
      analyser.getByteFrequencyData(analyserRawBins);
      const ratio = Math.max(1, Math.floor(analyserRawBins.length / 32));
      for (let i = 0; i < 32; i++) {
        let sum = 0;
        const startBin = i * ratio;
        for (let j = 0; j < ratio; j++) {
          sum += analyserRawBins[startBin + j] || 0;
        }
        const avg = Math.min(255, Math.round(sum / ratio));
        spectrumBins[i] = avg;
        if (avg > 0) hasLiveEnergy = true;
      }
    }

    // Beat-reactive fallback synthesis when running in headless mocks or during initial FFT warm-up
    if (!hasLiveEnergy) {
      const phase = getBeatPhase();
      const kickPulse = Math.pow(Math.max(0, 1 - phase * 2.4), 2);
      const offPulse = Math.pow(Math.max(0, 1 - Math.abs(phase - 0.5) * 4.0), 2);
      for (let i = 0; i < 32; i++) {
        const norm = i / 31;
        const low = (1 - norm) * (0.55 * stemLevels.drums * kickPulse + 0.45 * stemLevels.bass);
        const mid = (1 - Math.abs(norm - 0.48) * 1.8) * (0.45 * stemLevels.rhodes + 0.3 * offPulse);
        const high = norm * (0.42 * stemLevels.lead + 0.25 * stemLevels.drums);
        const energy = Math.max(0, Math.min(1, low + Math.max(0, mid) + high));
        spectrumBins[i] = Math.round(energy * 235);
      }
    }

    return spectrumBins;
  }

  // ==========================================================================
  // CONTINUOUS RAIL-GRINDING SYNTH & ARCADE SFX
  // ==========================================================================

  function applyGrindParams(active, speedNorm) {
    const s = Math.max(0, Math.min(1.5, Number.isFinite(speedNorm) ? Number(speedNorm) : 1.0));
    grindActive = Boolean(active);
    grindSpeed = grindActive ? s : 0;

    if (!ctx || !grindScrapeGain || !grindSparkGain) return;
    const now = Math.max(0, Number(ctx.currentTime) || 0);

    if (grindActive) {
      const scrapeLevel = 0.055 + 0.095 * s;
      const sparkLevel = 0.035 + 0.085 * s;
      targetFreqAt(grindScrapeFilter.frequency, 960 + 1480 * s, now, 0.045);
      targetFreqAt(grindSparkFilter.frequency, 4700 + 2100 * s, now, 0.045);
      targetGainAt(grindScrapeGain.gain, scrapeLevel, now, 0.04);
      targetGainAt(grindSparkGain.gain, sparkLevel, now, 0.035);
    } else {
      targetGainAt(grindScrapeGain.gain, SILENT_GAIN, now, 0.065);
      targetGainAt(grindSparkGain.gain, SILENT_GAIN, now, 0.055);
    }
  }

  function setGrinding(active, speedNorm = 1.0) {
    if (active && !ctx) {
      ensureContext();
    }
    applyGrindParams(active, speedNorm);
  }

  // Hoverboard mag-lev ollie pop + upward air-whoosh
  function playJumpSfx() {
    if (!ensureContext()) return;
    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;

    const dest = masterGain || ctx.destination;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const tf0 = setFreqAt(osc.frequency, 150, t0);
    expRampFreq(osc.frequency, 540, tf0 + 0.135);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, 0.24, ta0 + 0.008);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.145);

    osc.connect(amp);
    amp.connect(dest);
    osc.start(t0);
    osc.stop(ta2 + 0.015);

    const air = spawnNoiseBurst(t0, 0.12, 11);
    if (air) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setFilterQ(bp, 1.6);
      const tbf0 = setFreqAt(bp.frequency, 850, t0);
      expRampFreq(bp.frequency, 3400, tbf0 + 0.105);

      const ag = ctx.createGain();
      const tag0 = setGainAt(ag.gain, 0.09, t0);
      expRampGain(ag.gain, SILENT_GAIN, tag0 + 0.105);
      air.connect(bp);
      bp.connect(ag);
      ag.connect(dest);
    }
  }

  // Plasma hover-thruster ignition + turbo riser
  function playBoostSfx() {
    if (!ensureContext()) return;
    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = masterGain || ctx.destination;

    // Low plasma ignition thump
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const ts0 = setFreqAt(sub.frequency, 138, t0);
    expRampFreq(sub.frequency, 46, ts0 + 0.16);
    const sg = ctx.createGain();
    const tsg0 = setGainAt(sg.gain, 0.34, t0);
    const tsg1 = expRampGain(sg.gain, SILENT_GAIN, tsg0 + 0.18);
    sub.connect(sg);
    sg.connect(dest);
    sub.start(t0);
    sub.stop(tsg1 + 0.015);

    // Dual detuned turbine pitch sweep
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    setFilterQ(lp, 2.4);
    const tlp0 = setFreqAt(lp.frequency, 620, t0);
    expRampFreq(lp.frequency, 4200, tlp0 + 0.32);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, 0.16, ta0 + 0.035);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.31);

    lp.connect(amp);
    amp.connect(dest);

    for (const ratio of [0.994, 1.006]) {
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      const tw0 = setFreqAt(saw.frequency, 185 * ratio, t0);
      expRampFreq(saw.frequency, 890 * ratio, tw0 + 0.32);
      saw.connect(lp);
      saw.start(t0);
      saw.stop(ta2 + 0.018);
    }

    // Jet plasma noise rush
    const jet = spawnNoiseBurst(t0, 0.34, 19);
    if (jet) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setFilterQ(bp, 1.2);
      const tj0 = setFreqAt(bp.frequency, 700, t0);
      expRampFreq(bp.frequency, 4800, tj0 + 0.30);
      const jg = ctx.createGain();
      const tjg0 = setGainAt(jg.gain, 0.14, t0);
      expRampGain(jg.gain, SILENT_GAIN, tjg0 + 0.31);
      jet.connect(bp);
      bp.connect(jg);
      jg.connect(dest);
    }
  }

  // Beat-harmonized Trick SFX (extra quantized harmonic 9th chord stab + chime on 'PERFECT'!)
  function playTrickSfx(rating = 'FLOW') {
    if (!ensureContext()) return;
    const now = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = masterGain || ctx.destination;
    const grade = String(rating || 'FLOW').toUpperCase();

    // Harmonize with the currently playing bar's F-Dorian funk chord
    const elapsed = getSongElapsedSec();
    const currentBar = Math.floor(elapsed / (STEP_SEC * STEPS_PER_BAR));
    const chord = CHORD_BOOK[((currentBar % 4) + 4) % 4];
    const notes = chord.trickStab;

    if (grade === 'PERFECT') {
      // Micro-quantize chord bloom onto nearest upcoming 16th if within 35ms for pocket lock
      const nextSixteenth = Math.ceil(elapsed / STEP_SEC) * STEP_SEC;
      const deltaToGrid = nextSixteenth - elapsed;
      const stabStart = deltaToGrid > 0.002 && deltaToGrid <= 0.035 ? now + deltaToGrid : now;

      // 1. Lush 5-voice Pirate Brass/FM 9th Chord Stab
      const stabFilter = ctx.createBiquadFilter();
      stabFilter.type = 'lowpass';
      setFilterQ(stabFilter, 2.1);
      const tsf0 = setFreqAt(stabFilter.frequency, 4200, stabStart);
      expRampFreq(stabFilter.frequency, 1250, tsf0 + 0.34);

      const stabBus = ctx.createGain();
      const tsb0 = setGainAt(stabBus.gain, SILENT_GAIN, stabStart);
      const tsb1 = linearRampGain(stabBus.gain, 0.082, tsb0 + 0.01);
      const tsb2 = expRampGain(stabBus.gain, SILENT_GAIN, tsb1 + 0.34);

      stabFilter.connect(stabBus);
      stabBus.connect(dest);
      if (delayInput) {
        const send = ctx.createGain();
        send.gain.value = 0.36;
        stabBus.connect(send);
        send.connect(delayInput);
      }

      const stopStab = tsb2 + 0.018;
      for (let i = 0; i < notes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
        setFreqAt(osc.frequency, midiToFreq(notes[i], i % 2 === 0 ? -4 : 4), stabStart);
        osc.connect(stabFilter);
        osc.start(stabStart);
        osc.stop(stopStab);
      }

      // 2. Sparkling high-octave bell arpeggio flourish
      for (let i = 0; i < 3; i++) {
        const nt = now + i * 0.042;
        const bell = ctx.createOscillator();
        bell.type = 'sine';
        setFreqAt(bell.frequency, midiToFreq(notes[i + 2] + 12), nt);
        const bg = ctx.createGain();
        const tbg0 = setGainAt(bg.gain, SILENT_GAIN, nt);
        const tbg1 = linearRampGain(bg.gain, 0.12, tbg0 + 0.004);
        const tbg2 = expRampGain(bg.gain, SILENT_GAIN, tbg1 + 0.19);
        bell.connect(bg);
        bg.connect(dest);
        bell.start(nt);
        bell.stop(tbg2 + 0.012);
      }
      return;
    }

    // 'GOOD' (3-note bright triad) or 'FLOW' (2-note snappy spin blip)
    const count = grade === 'GOOD' ? 3 : 2;
    const peakGain = grade === 'GOOD' ? 0.12 : 0.085;
    for (let i = 0; i < count; i++) {
      const nt = now + i * 0.048;
      const osc = ctx.createOscillator();
      osc.type = grade === 'GOOD' ? 'triangle' : 'sine';
      setFreqAt(osc.frequency, midiToFreq(notes[i] + (grade === 'GOOD' ? 12 : 0)), nt);

      const g = ctx.createGain();
      const tg0 = setGainAt(g.gain, SILENT_GAIN, nt);
      const tg1 = linearRampGain(g.gain, peakGain, tg0 + 0.005);
      const tg2 = expRampGain(g.gain, SILENT_GAIN, tg1 + 0.14);

      osc.connect(g);
      g.connect(dest);
      osc.start(nt);
      osc.stop(tg2 + 0.012);
    }
  }

  // Mechanical cassette-deck latch clack + euphoric rising triad
  function playPickupSfx() {
    if (!ensureContext()) return;
    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = masterGain || ctx.destination;

    // Two-stage cassette shell clack
    const clackTimes = [
      { offset: 0.0, freq: 2450, gain: 0.22 },
      { offset: 0.032, freq: 1680, gain: 0.18 }
    ];
    for (const c of clackTimes) {
      const tc = t0 + c.offset;
      const burst = spawnNoiseBurst(tc, 0.024, 29);
      if (burst) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        setFilterQ(bp, 3.2);
        setFreqAt(bp.frequency, c.freq, tc);
        const cg = ctx.createGain();
        const tcg0 = setGainAt(cg.gain, c.gain, tc);
        expRampGain(cg.gain, SILENT_GAIN, tcg0 + 0.02);
        burst.connect(bp);
        bp.connect(cg);
        cg.connect(dest);
      }
    }

    // Rising F-major/Dorian broadcast triad + octave (F5 -> A5 -> C6 -> F6)
    const triad = [77, 81, 84, 89];
    for (let i = 0; i < triad.length; i++) {
      const nt = t0 + 0.045 + i * 0.052;
      const freq = midiToFreq(triad[i]);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      setFreqAt(osc.frequency, freq, nt);

      const harm = ctx.createOscillator();
      harm.type = 'sawtooth';
      setFreqAt(harm.frequency, freq * 2.0, nt);
      const hg = ctx.createGain();
      hg.gain.value = 0.22;
      harm.connect(hg);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, nt);
      const ta1 = linearRampGain(amp.gain, 0.13, ta0 + 0.005);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + (i === 3 ? 0.26 : 0.15));

      osc.connect(amp);
      hg.connect(amp);
      amp.connect(dest);

      osc.start(nt);
      harm.start(nt);
      osc.stop(ta2 + 0.015);
      harm.stop(ta2 + 0.015);
    }
  }

  // Euphoric synth-brass + chime fanfare on bootleg tape delivery!
  function playDeliverySfx(rank = 'A') {
    if (!ensureContext()) return;
    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = masterGain || ctx.destination;
    const r = String(rank || 'A').toUpperCase();
    const isTopRank = r === 'S' || r === 'A';

    // Rising brass chord fanfare: Fmaj -> Gmaj -> Am7 -> Fmaj9/G13 victory bloom!
    const fanfareSteps = [
      { delay: 0.0, dur: 0.13, notes: [65, 69, 72] },
      { delay: 0.095, dur: 0.13, notes: [67, 71, 74] },
      { delay: 0.19, dur: 0.14, notes: [69, 72, 76] },
      { delay: 0.29, dur: isTopRank ? 0.52 : 0.38, notes: isTopRank ? [65, 69, 72, 76, 79] : [65, 69, 72, 77] }
    ];

    for (const step of fanfareSteps) {
      const st = t0 + step.delay;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      setFilterQ(filter, 1.6);
      const tf0 = setFreqAt(filter.frequency, 520, st);
      const tf1 = expRampFreq(filter.frequency, 3400, tf0 + 0.028);
      expRampFreq(filter.frequency, 1500, tf1 + step.dur);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, st);
      const ta1 = linearRampGain(amp.gain, 0.088, ta0 + 0.012);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + step.dur);

      filter.connect(amp);
      amp.connect(dest);
      if (reverbInput) {
        const rev = ctx.createGain();
        rev.gain.value = 0.45;
        amp.connect(rev);
        rev.connect(reverbInput);
      }

      const stopAt = ta2 + 0.018;
      for (let i = 0; i < step.notes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        setFreqAt(osc.frequency, midiToFreq(step.notes[i], i % 2 === 0 ? -5 : 5), st);
        osc.connect(filter);
        osc.start(st);
        osc.stop(stopAt);
      }
    }

    // Sparkling tubular victory chimes on top
    const chimeNotes = r === 'S' ? [89, 93, 96, 101] : [89, 93, 96];
    for (let i = 0; i < chimeNotes.length; i++) {
      const ct = t0 + 0.29 + i * 0.065;
      const bell = ctx.createOscillator();
      bell.type = 'sine';
      setFreqAt(bell.frequency, midiToFreq(chimeNotes[i]), ct);
      const bg = ctx.createGain();
      const tb0 = setGainAt(bg.gain, SILENT_GAIN, ct);
      const tb1 = linearRampGain(bg.gain, 0.11, tb0 + 0.004);
      const tb2 = expRampGain(bg.gain, SILENT_GAIN, tb1 + 0.32);
      bell.connect(bg);
      bg.connect(dest);
      bell.start(ct);
      bell.stop(tb2 + 0.015);
    }
  }

  // Pirate radio studio countdown pip (!isFinal) or ON-AIR / SIGN-OFF horn (isFinal)
  function playCountdownTick(isFinal = false) {
    if (!ensureContext()) return;
    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = masterGain || ctx.destination;

    if (!isFinal) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      setFreqAt(osc.frequency, 880, t0);

      const over = ctx.createOscillator();
      over.type = 'triangle';
      setFreqAt(over.frequency, 1760, t0);
      const og = ctx.createGain();
      og.gain.value = 0.25;
      over.connect(og);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
      const ta1 = linearRampGain(amp.gain, 0.18, ta0 + 0.004);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.085);

      osc.connect(amp);
      og.connect(amp);
      amp.connect(dest);

      osc.start(t0);
      over.start(t0);
      osc.stop(ta2 + 0.012);
      over.stop(ta2 + 0.012);
      return;
    }

    // Final broadcast launch / sign-off harmonic chord blast (A5 + E6 + A6)
    const freqs = [880, 1318.51, 1760];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const tf0 = setFreqAt(lp.frequency, 4600, t0);
    expRampFreq(lp.frequency, 1800, tf0 + 0.38);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, 0.16, ta0 + 0.008);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.40);

    lp.connect(amp);
    amp.connect(dest);

    const stopAt = ta2 + 0.018;
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 1 ? 'sawtooth' : 'triangle';
      setFreqAt(osc.frequency, freqs[i], t0);
      osc.connect(lp);
      osc.start(t0);
      osc.stop(stopAt);
    }
  }

  return {
    start,
    stop,
    toggle,
    get isPlaying() {
      return isPlaying;
    },
    getBeatPhase,
    getBarAndBeat,
    evaluateBeatHit,
    setComboTier,
    getStemLevels,
    getSpectrum,
    setGrinding,
    playJumpSfx,
    playBoostSfx,
    playTrickSfx,
    playPickupSfx,
    playDeliverySfx,
    playCountdownTick
  };
}
