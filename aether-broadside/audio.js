/**
 * aether-broadside/audio.js
 * Tape No. 08: AETHER BROADSIDE (1889)
 *
 * Procedural 1889 Orchestral-Industrial Sea-Shanty & Naval Gunnery Web Audio Engine:
 * - 6/8 (compound 12-step) Swashbuckling Orchestral-Industrial Score at 132 BPM dotted-quarter
 *   across a 16-bar D-minor maritime theme (Dm - Bb - Gm - A7 / Dm - F - C - A7 / bridge / finale)
 * - Driving bowed cello & contrabass 6/8 sea-gallop ostinato
 * - Bold Admiralty French-horn & trombone brass melody + harmonic horn swells
 * - Clockwork harpsichord & hurdy-gurdy sympathetic fifth drone arpeggios
 * - Tuned naval kettle timpani, crisp Royal Navy side-drum snare drags/rolls & piatti cymbals
 * - Dynamic View-Mode & Combat Intensity Mix (`setModeMix('3d' | 'cad', intensity, hasAlert)`):
 *   - '3d' Gunnery Helm: wide-band full orchestral brass, rosin strings, and booming timpani
 *   - 'cad' X-Ray Schematic: warm resonant lowpass filter sweep across orchestra + tactile
 *     1889 brass telegraph / clockwork escapement tick + Scotch aether-boiler sub-harmonic hum
 * - Synthesized Naval Gunnery & Steam SFX:
 *   - Staggered 35ms-rippled broadside cannon roar ('roundshot', 'chainshot', 'aethershell')
 *   - Hull impacts ('hit', 'crit', 'fire', 'splash', 'sink')
 *   - Twin-valve steam relief hiss + pressure-drop whistle, crew telegraph + ratchet chime,
 *     boiler overpressure turbine whine + brass bell, nautical fire klaxon, & Admiralty fanfares
 */

const DOTTED_QUARTER_BPM = 132;
const BEAT_SEC = 60 / DOTTED_QUARTER_BPM; // ~0.454545s per dotted-quarter beat
const STEPS_PER_BEAT = 3;                 // 3 eighth-triplet steps per dotted-quarter
const BEATS_PER_BAR = 4;                  // Two 6/8 cells (12 steps) per full bar
const STEPS_PER_BAR = BEATS_PER_BAR * STEPS_PER_BEAT; // 12 steps per bar (~1.81818s)
const STEP_SEC = BEAT_SEC / STEPS_PER_BEAT;           // ~0.151515s per 8th-triplet step
const LOOP_BARS = 16;
const LOOP_STEPS = LOOP_BARS * STEPS_PER_BAR;         // 192 steps per 16-bar cycle

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_VISIBLE_SEC = 0.15;
const LOOKAHEAD_HIDDEN_SEC = 1.2;
const MAX_CATCHUP_SEC = 240.0;

const MODE_TAU_SEC = 0.16;
const SILENT_GAIN = 0.0001; // -80 dB floor: strictly positive for exponential ramps
const MASTER_LEVEL = 0.80;
const SEA_LILT_SEC = 0.0055; // Subtle maritime lilt on pickup 8th steps (2, 5, 8, 11)

// ============================================================================
// 16-BAR D-MINOR MARITIME HARMONY & 6/8 OSTINATO TABLES
// ============================================================================

const CHORD_LIBRARY = {
  Dm: {
    name: 'Dm',
    timpaniMidi: 38, // D2
    droneFifth: [50, 57], // D3, A3
    brassVoicing: [50, 57, 62, 65], // D3, A3, D4, F4
    ostinatoA: [38, 45, 50, 38, 45, 50, 38, 45, 50, 45, 50, 53], // D2 - A2 - D3 gallop
    ostinatoB: [38, 45, 50, 38, 45, 50, 50, 45, 38, 45, 50, 57],
    arp: [62, 65, 69, 74, 69, 65, 62, 69, 74, 77, 74, 69]
  },
  Bb: {
    name: 'Bb',
    timpaniMidi: 34, // Bb1
    droneFifth: [46, 53], // Bb2, F3
    brassVoicing: [46, 53, 58, 62], // Bb2, F3, Bb3, D4
    ostinatoA: [34, 41, 46, 34, 41, 46, 34, 41, 46, 41, 46, 50], // Bb1 - F2 - Bb2 gallop
    ostinatoB: [34, 41, 46, 34, 41, 46, 34, 46, 50, 53, 50, 46],
    arp: [58, 62, 65, 70, 65, 62, 58, 65, 70, 74, 70, 65]
  },
  Gm: {
    name: 'Gm',
    timpaniMidi: 43, // G2
    droneFifth: [43, 50], // G2, D3
    brassVoicing: [43, 50, 55, 58], // G2, D3, G3, Bb3
    ostinatoA: [43, 50, 55, 43, 50, 55, 43, 50, 55, 50, 55, 58], // G2 - D3 - G3 gallop
    ostinatoB: [43, 50, 55, 43, 50, 55, 36, 43, 48, 52, 48, 43], // Gm -> C turnaround cell
    arp: [55, 58, 62, 67, 62, 58, 55, 62, 67, 70, 67, 62]
  },
  A7: {
    name: 'A7',
    timpaniMidi: 33, // A1
    droneFifth: [45, 52], // A2, E3
    brassVoicing: [45, 52, 55, 61], // A2, E3, G3, C#4
    ostinatoA: [33, 40, 45, 37, 45, 49, 33, 40, 45, 49, 52, 55], // A1 - E2 - A2 / C#3 - E3 - G3
    ostinatoB: [33, 40, 45, 49, 52, 55, 57, 55, 52, 49, 45, 37], // Dominant scale cascade -> D2
    arp: [57, 61, 64, 69, 67, 64, 61, 64, 69, 73, 69, 64]
  },
  F: {
    name: 'F',
    timpaniMidi: 41, // F2
    droneFifth: [41, 48], // F2, C3
    brassVoicing: [41, 48, 53, 57], // F2, C3, F3, A3
    ostinatoA: [41, 48, 53, 41, 48, 53, 41, 48, 53, 48, 53, 57],
    ostinatoB: [41, 48, 53, 45, 53, 57, 41, 48, 53, 57, 60, 57],
    arp: [60, 65, 69, 72, 69, 65, 60, 69, 72, 77, 72, 69]
  },
  C: {
    name: 'C',
    timpaniMidi: 36, // C2
    droneFifth: [48, 55], // C3, G3
    brassVoicing: [48, 52, 55, 60], // C3, E3, G3, C4
    ostinatoA: [36, 43, 48, 36, 43, 48, 36, 43, 48, 43, 48, 52],
    ostinatoB: [36, 43, 48, 40, 48, 52, 36, 43, 48, 52, 55, 52],
    arp: [60, 64, 67, 72, 67, 64, 60, 67, 72, 76, 72, 67]
  }
};

// 16-bar harmonic layout:
// Bars 0-3:  Dm -> Bb -> Gm -> A7  (Main Sea-Gallop Statement)
// Bars 4-7:  Dm -> F  -> C  -> A7  (Heroic Relative-Major Counter-Statement)
// Bars 8-11: Gm -> Dm -> Bb -> A7  (Storm-Stratum Tack & Brass Canon)
// Bars 12-15: Dm -> Bb -> Gm -> A7 (Admiralty Flagship Finale & Turnaround)
const BAR_CHORD_KEYS = [
  'Dm', 'Bb', 'Gm', 'A7',
  'Dm', 'F',  'C',  'A7',
  'Gm', 'Dm', 'Bb', 'A7',
  'Dm', 'Bb', 'Gm', 'A7'
];

// 6/8 Bowed Cello/Contrabass dynamic accent curve across the 12 8th-triplet steps
const OSTINATO_VELOCITIES = [
  1.00, 0.56, 0.72,
  0.88, 0.54, 0.74,
  0.96, 0.58, 0.72,
  0.86, 0.62, 0.78
];

// 16-bar Admiralty French-Horn & Trombone Melody: [bar, step, midi, lenSteps, vel]
const BRASS_MELODY_NOTES = [
  // Phrase I (Bars 0-3): The Flying Dutchman Main Theme
  [0, 0, 62, 2, 0.90], [0, 2, 65, 1, 0.82], [0, 3, 69, 3, 0.96],
  [0, 6, 69, 2, 0.92], [0, 8, 70, 1, 0.84], [0, 9, 69, 2, 0.90], [0, 11, 67, 1, 0.80],

  [1, 0, 65, 3, 0.94], [1, 3, 74, 3, 0.98],
  [1, 6, 72, 2, 0.90], [1, 8, 70, 1, 0.84], [1, 9, 69, 3, 0.92],

  [2, 0, 67, 2, 0.92], [2, 2, 70, 1, 0.84], [2, 3, 74, 3, 0.96],
  [2, 6, 76, 2, 0.92], [2, 8, 74, 1, 0.86], [2, 9, 70, 3, 0.92],

  [3, 0, 69, 3, 0.96], [3, 3, 67, 2, 0.88], [3, 5, 65, 1, 0.84],
  [3, 6, 64, 5, 0.95], [3, 11, 61, 1, 0.84],

  // Phrase II (Bars 4-7): Broadside Heroic Lift (Dm - F - C - A7)
  [4, 0, 62, 2, 0.92], [4, 2, 69, 1, 0.86], [4, 3, 74, 3, 0.98],
  [4, 6, 74, 2, 0.94], [4, 8, 76, 1, 0.88], [4, 9, 77, 3, 0.98],

  [5, 0, 76, 2, 0.94], [5, 2, 74, 1, 0.86], [5, 3, 72, 3, 0.96],
  [5, 6, 69, 3, 0.92], [5, 9, 77, 3, 0.98],

  [6, 0, 76, 3, 0.96], [6, 3, 72, 2, 0.90], [6, 5, 74, 1, 0.86],
  [6, 6, 76, 3, 0.96], [6, 9, 79, 3, 1.00],

  [7, 0, 77, 2, 0.96], [7, 2, 76, 1, 0.88], [7, 3, 73, 3, 0.96],
  [7, 6, 69, 5, 0.95], [7, 11, 73, 1, 0.86],

  // Phrase III (Bars 8-11): Storm-Stratum Tack & Brass Canon
  [8, 0, 74, 3, 0.96], [8, 3, 70, 2, 0.90], [8, 5, 67, 1, 0.84],
  [8, 6, 79, 3, 0.98], [8, 9, 77, 2, 0.92], [8, 11, 74, 1, 0.86],

  [9, 0, 77, 3, 0.96], [9, 3, 74, 2, 0.90], [9, 5, 69, 1, 0.84],
  [9, 6, 74, 3, 0.94], [9, 9, 72, 3, 0.90],

  [10, 0, 70, 2, 0.94], [10, 2, 74, 1, 0.88], [10, 3, 77, 3, 0.98],
  [10, 6, 76, 2, 0.92], [10, 8, 74, 1, 0.86], [10, 9, 70, 3, 0.92],

  [11, 0, 69, 3, 0.94], [11, 3, 73, 3, 0.96],
  [11, 6, 76, 3, 0.98], [11, 9, 79, 3, 1.00],

  // Phrase IV (Bars 12-15): Admiralty Flagship Finale & Turnaround
  [12, 0, 81, 3, 1.00], [12, 3, 77, 2, 0.96], [12, 5, 74, 1, 0.90],
  [12, 6, 69, 3, 0.94], [12, 9, 74, 3, 0.96],

  [13, 0, 77, 2, 0.96], [13, 2, 76, 1, 0.90], [13, 3, 74, 3, 0.96],
  [13, 6, 70, 2, 0.92], [13, 8, 72, 1, 0.88], [13, 9, 74, 3, 0.94],

  [14, 0, 79, 3, 0.98], [14, 3, 74, 3, 0.94],
  [14, 6, 76, 2, 0.96], [14, 8, 74, 1, 0.90], [14, 9, 72, 3, 0.94],

  [15, 0, 73, 2, 0.96], [15, 2, 76, 1, 0.92], [15, 3, 81, 3, 1.00],
  [15, 6, 79, 2, 0.96], [15, 8, 77, 1, 0.92], [15, 9, 76, 2, 0.94], [15, 11, 73, 1, 0.90]
];

const MELODY_BY_BAR = Array.from({ length: LOOP_BARS }, () => []);
for (const note of BRASS_MELODY_NOTES) {
  MELODY_BY_BAR[note[0]].push(note);
}

// Royal Navy 6/8 military side-drum patterns (12 steps):
// 'X' crisp backbeat accent, 'g' ghost tap, 'd' double-grace ruff/drag, 'r' military roll stroke, '.' rest
const SNARE_PATTERNS = [
  '..gX.d..gX..', // Bar 0: classic 6/8 naval march
  '..gX..g.gX.d', // Bar 1: rolling sea-shanty cadence
  '..gX.d..gX.g', // Bar 2: forward momentum
  '..gX.dr.rXrr'  // Bar 3: 4-bar military snare turnaround roll!
];

// ============================================================================
// SAFE DSP & STRICTLY MONOTONIC / POSITIVE AUDIOPARAM HELPERS
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

function makeSoftClipCurve(drive = 1.9, samples = 512) {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(drive) || 1;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

function createSeededNoise(seed = 1889) {
  let s = seed >>> 0;
  return function nextRand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

// ============================================================================
// MAIN AETHER BROADSIDE AUDIO ENGINE
// ============================================================================

export function createBroadsideAudio(options = {}) {
  let ctx = null;
  let isPlaying = false;

  // Dynamic view-mode & combat mix state
  let currentViewMode = '3d'; // '3d' | 'cad'
  let currentCombatIntensity = 0.35; // 0..1
  let currentAlert = false;

  // Transport & lookahead scheduler state
  let transportStartTime = 0;
  let nextStepTime = 0;
  let totalStepsScheduled = 0;
  let schedulerTimer = null;
  let lookaheadSec = LOOKAHEAD_VISIBLE_SEC;

  // Audio graph buses & filters
  let masterGain = null;
  let scoreBus = null;
  let scoreDuckGain = null;
  let orchestraFilter = null;
  let cadAmbienceBus = null;
  let cadTickBus = null;
  let boilerSteamFilter = null;
  let boilerThrobFilter = null;
  let sfxBus = null;
  let cannonSaturation = null;
  let reverbInput = null;
  let analyser = null;
  let analyserRawBins = null;
  const spectrumBins = new Uint8Array(32);

  // Shared procedural noise & high-voltage aether-spark buffers
  let noiseBuffer = null;
  let sparkBuffer = null;
  let timberBuffer = null;

  // WeakMap tracking the latest scheduled timestamp on each AudioParam to guarantee
  // strictly monotonic timestamps across lookahead steps & rapid same-frame SFX bursts.
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
    const t = monotonicTime(param, time, 0.00015);
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(f, t);
    } else {
      param.value = f;
    }
    return t;
  }

  function linearRampFreq(param, freq, time) {
    if (!param) return time;
    const f = clampFreq(freq);
    const t = monotonicTime(param, time, 0.0005);
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(f, t);
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

  function targetFreqAt(param, freq, time, tau = MODE_TAU_SEC) {
    if (!param) return time;
    const f = clampFreq(freq);
    const safeTau = Math.max(0.008, Number.isFinite(tau) ? tau : MODE_TAU_SEC);
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

  function setGainAt(param, gain, time) {
    if (!param) return time;
    const g = clampGain(gain);
    const t = monotonicTime(param, time, 0.00015);
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

  function targetGainAt(param, gain, time, tau = MODE_TAU_SEC) {
    if (!param) return time;
    const g = clampGain(gain);
    const safeTau = Math.max(0.008, Number.isFinite(tau) ? tau : MODE_TAU_SEC);
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

  function setFilterQ(filter, qVal) {
    if (!filter || !filter.Q) return;
    const safeQ = Math.max(0.1, Math.min(22, Number.isFinite(qVal) ? qVal : 1.0));
    if (typeof filter.Q === 'object') {
      filter.Q.value = safeQ;
    } else {
      filter.Q = safeQ;
    }
  }

  function scheduleOscRun(osc, startTime, stopTime) {
    if (!osc) return;
    const tStart = Math.max(0, Number.isFinite(startTime) ? startTime : 0);
    const tStop = Math.max(tStart + 0.008, Number.isFinite(stopTime) ? stopTime : tStart + 0.05);
    osc.start(tStart);
    osc.stop(tStop);
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

  function spawnBufferBurst(buffer, time, duration, offsetSeed = 0) {
    if (!ctx || !buffer || typeof ctx.createBufferSource !== 'function') return null;
    const tStart = Math.max(0, Number.isFinite(time) ? time : 0);
    const dur = Math.max(0.012, Math.min(1.85, Number.isFinite(duration) ? duration : 0.1));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bufDur = Number(buffer.duration) > 0 ? Number(buffer.duration) : 2.0;
    const maxOffset = Math.max(0, bufDur - dur - 0.02);
    const offset = maxOffset > 0 ? (Math.abs(offsetSeed * 0.319) % maxOffset) : 0;
    src.start(tStart, offset);
    src.stop(tStart + dur);
    return src;
  }

  // ==========================================================================
  // AUDIO CONTEXT & ADMIRALTY MASTER GRAPH INITIALIZATION
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

    // Master chain: masterGain -> sub-rumble highpass -> glue compressor -> brickwall limiter -> analyser -> destination
    masterGain = ctx.createGain();
    setGainAt(masterGain.gain, MASTER_LEVEL, now);

    let chainTail = masterGain;

    if (typeof ctx.createBiquadFilter === 'function') {
      const subHp = ctx.createBiquadFilter();
      subHp.type = 'highpass';
      setFreqAt(subHp.frequency, 26, now);
      setFilterQ(subHp, 0.707);
      chainTail.connect(subHp);
      chainTail = subHp;
    }

    if (typeof ctx.createDynamicsCompressor === 'function') {
      const glue = ctx.createDynamicsCompressor();
      if (glue.threshold) glue.threshold.value = -15;
      if (glue.knee) glue.knee.value = 12;
      if (glue.ratio) glue.ratio.value = 3.4;
      if (glue.attack) glue.attack.value = 0.008;
      if (glue.release) glue.release.value = 0.19;
      chainTail.connect(glue);
      chainTail = glue;

      const limiter = ctx.createDynamicsCompressor();
      if (limiter.threshold) limiter.threshold.value = -2.2;
      if (limiter.knee) limiter.knee.value = 0;
      if (limiter.ratio) limiter.ratio.value = 18;
      if (limiter.attack) limiter.attack.value = 0.001;
      if (limiter.release) limiter.release.value = 0.09;
      chainTail.connect(limiter);
      chainTail = limiter;
    }

    if (typeof ctx.createAnalyser === 'function') {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.76;
      const binCount = Number(analyser.frequencyBinCount) || 64;
      analyserRawBins = new Uint8Array(binCount);
      chainTail.connect(analyser);
      chainTail = analyser;
    }

    if (ctx.destination) {
      chainTail.connect(ctx.destination);
    }

    // Orchestral Score Bus -> Warm Resonant CAD Lowpass Filter -> Duck Bus -> Master
    scoreDuckGain = ctx.createGain();
    setGainAt(scoreDuckGain.gain, 1.0, now);
    scoreDuckGain.connect(masterGain);

    orchestraFilter = ctx.createBiquadFilter();
    orchestraFilter.type = 'lowpass';
    setFreqAt(orchestraFilter.frequency, 16500, now);
    setFilterQ(orchestraFilter, 0.8);
    orchestraFilter.connect(scoreDuckGain);

    scoreBus = ctx.createGain();
    setGainAt(scoreBus.gain, SILENT_GAIN, now);
    scoreBus.connect(orchestraFilter);

    // CAD X-Ray Clockwork Escapement Tick Bus (bypasses orchestra lowpass so ticks stay crystalline in CAD mode!)
    cadTickBus = ctx.createGain();
    setGainAt(cadTickBus.gain, SILENT_GAIN, now);
    cadTickBus.connect(masterGain);

    // CAD X-Ray Scotch Marine Aether-Boiler Sub-Harmonic Hum Bus
    cadAmbienceBus = ctx.createGain();
    setGainAt(cadAmbienceBus.gain, SILENT_GAIN, now);
    cadAmbienceBus.connect(masterGain);

    // Naval Gunnery & Steam SFX Bus + Black-Powder Saturation Bus
    sfxBus = ctx.createGain();
    setGainAt(sfxBus.gain, 0.96, now);
    sfxBus.connect(masterGain);

    if (typeof ctx.createWaveShaper === 'function') {
      cannonSaturation = ctx.createWaveShaper();
      cannonSaturation.curve = makeSoftClipCurve(2.25);
      cannonSaturation.oversample = '2x';
      cannonSaturation.connect(sfxBus);
    } else {
      cannonSaturation = sfxBus;
    }

    // Orchestral Concert-Hall / Storm-Canyon Reverb Impulse (1.45s warm wooden galleon & sky acoustics)
    if (typeof ctx.createConvolver === 'function' && typeof ctx.createBuffer === 'function') {
      try {
        const revLen = Math.floor(sampleRate * 1.45);
        const impulse = ctx.createBuffer(2, revLen, sampleRate);
        const rand = createSeededNoise(188908);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          let lp = 0;
          for (let i = 0; i < revLen; i++) {
            const prog = i / revLen;
            lp += (rand() - lp) * (0.58 - 0.38 * prog);
            data[i] = lp * Math.pow(1 - prog, 2.45);
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

    // Shared procedural noise, high-voltage aether-spark & splintering mahogany buffers
    if (typeof ctx.createBuffer === 'function') {
      const rand = createSeededNoise(1889);

      const noiseLen = Math.floor(sampleRate * 2.0);
      noiseBuffer = ctx.createBuffer(1, noiseLen, sampleRate);
      const nData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        nData[i] = rand();
      }

      const sparkLen = Math.floor(sampleRate * 1.6);
      sparkBuffer = ctx.createBuffer(1, sparkLen, sampleRate);
      const sData = sparkBuffer.getChannelData(0);
      let hiss = 0;
      for (let i = 0; i < sparkLen; i++) {
        const w = rand();
        hiss = 0.68 * hiss + 0.32 * w;
        const snap = Math.abs(rand()) > 0.958 ? rand() * 0.98 : 0;
        sData[i] = hiss * 0.24 + snap;
      }

      const timberLen = Math.floor(sampleRate * 1.4);
      timberBuffer = ctx.createBuffer(1, timberLen, sampleRate);
      const tData = timberBuffer.getChannelData(0);
      let wood = 0;
      for (let i = 0; i < timberLen; i++) {
        const crack = Math.abs(rand()) > 0.972 ? rand() : rand() * 0.16;
        wood = 0.82 * wood + 0.18 * crack;
        tData[i] = wood * 2.2;
      }
    }

    initBoilerAmbienceGraph(now);
    return ctx;
  }

  // Persistent 15.5-Bar Scotch Marine Aether-Boiler Sub-Harmonic Hum (D1 + D2 + A2 harmonic drone)
  function initBoilerAmbienceGraph(now) {
    if (!ctx || !cadAmbienceBus || boilerThrobFilter) return;

    boilerThrobFilter = ctx.createBiquadFilter();
    boilerThrobFilter.type = 'lowpass';
    setFreqAt(boilerThrobFilter.frequency, 210, now);
    setFilterQ(boilerThrobFilter, 2.6);
    boilerThrobFilter.connect(cadAmbienceBus);

    // Tuned to D1 (36.71 Hz), D2 (73.42 Hz), and A2 (110 Hz) so the boiler hums in D-minor harmony!
    if (typeof ctx.createOscillator === 'function') {
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      setFreqAt(subOsc.frequency, midiToFreq(26), now); // D1 ~36.71 Hz
      const subGain = ctx.createGain();
      subGain.gain.value = 0.42;
      subOsc.connect(subGain);
      subGain.connect(boilerThrobFilter);
      subOsc.start(now);

      const fundOsc = ctx.createOscillator();
      fundOsc.type = 'triangle';
      setFreqAt(fundOsc.frequency, midiToFreq(38), now); // D2 ~73.42 Hz
      const fundGain = ctx.createGain();
      fundGain.gain.value = 0.34;
      fundOsc.connect(fundGain);
      fundGain.connect(boilerThrobFilter);
      fundOsc.start(now);

      const fifthOsc = ctx.createOscillator();
      fifthOsc.type = 'sawtooth';
      setFreqAt(fifthOsc.frequency, midiToFreq(45, 3), now); // A2 ~110.2 Hz aether coil hum
      const fifthGain = ctx.createGain();
      fifthGain.gain.value = 0.16;
      fifthOsc.connect(fifthGain);
      fifthGain.connect(boilerThrobFilter);
      fifthOsc.start(now);
    }

    // Pressurized steam-jacket hiss inside the boiler room
    if (typeof ctx.createBufferSource === 'function' && noiseBuffer) {
      boilerSteamFilter = ctx.createBiquadFilter();
      boilerSteamFilter.type = 'bandpass';
      setFreqAt(boilerSteamFilter.frequency, 340, now);
      setFilterQ(boilerSteamFilter, 3.8);

      const steamGain = ctx.createGain();
      steamGain.gain.value = 0.14;

      const steamLoop = ctx.createBufferSource();
      steamLoop.buffer = noiseBuffer;
      steamLoop.loop = true;
      steamLoop.connect(boilerSteamFilter);
      boilerSteamFilter.connect(steamGain);
      steamGain.connect(cadAmbienceBus);
      steamLoop.start(now);
    }
  }

  function applyModeMixToAudio(nowSec) {
    if (!ctx || !scoreBus || !orchestraFilter || !cadAmbienceBus || !cadTickBus) return;

    if (!isPlaying) {
      targetGainAt(scoreBus.gain, SILENT_GAIN, nowSec, 0.06);
      targetGainAt(cadAmbienceBus.gain, SILENT_GAIN, nowSec, 0.06);
      targetGainAt(cadTickBus.gain, SILENT_GAIN, nowSec, 0.05);
      return;
    }

    const isCad = currentViewMode === 'cad';
    const intensity = currentCombatIntensity;
    const alertBoost = currentAlert ? 1 : 0;

    if (isCad) {
      // Warm resonant lowpass sweep across the orchestra + bring up clockwork tick & Scotch boiler hum
      const cadCutoff = 580 + 260 * intensity + 90 * alertBoost;
      setFilterQ(orchestraFilter, 2.35);
      targetFreqAt(orchestraFilter.frequency, cadCutoff, nowSec, MODE_TAU_SEC);
      targetGainAt(scoreBus.gain, 0.68 + 0.08 * intensity, nowSec, MODE_TAU_SEC);

      const boilerGain = 0.25 + 0.08 * intensity + 0.05 * alertBoost;
      targetGainAt(cadAmbienceBus.gain, boilerGain, nowSec, MODE_TAU_SEC);
      targetGainAt(cadTickBus.gain, 0.88 + 0.08 * alertBoost, nowSec, 0.11);

      if (boilerThrobFilter) {
        targetFreqAt(boilerThrobFilter.frequency, 195 + 115 * intensity + 65 * alertBoost, nowSec, MODE_TAU_SEC);
      }
      if (boilerSteamFilter) {
        targetFreqAt(boilerSteamFilter.frequency, 320 + 180 * intensity + 110 * alertBoost, nowSec, MODE_TAU_SEC);
      }
    } else {
      // Full wide-band 3D Gunnery Helm orchestral brass, strings & booming timpani
      const helmCutoff = 14800 + 2400 * intensity;
      setFilterQ(orchestraFilter, 0.78);
      targetFreqAt(orchestraFilter.frequency, helmCutoff, nowSec, MODE_TAU_SEC);
      targetGainAt(scoreBus.gain, 0.90 + 0.14 * intensity, nowSec, MODE_TAU_SEC);

      // Subtle hull-floor boiler presence in 3D, clockwork escapement tucked away
      targetGainAt(cadAmbienceBus.gain, 0.018 + 0.014 * intensity + 0.015 * alertBoost, nowSec, MODE_TAU_SEC);
      targetGainAt(cadTickBus.gain, SILENT_GAIN, nowSec, 0.09);
    }
  }

  function duckScoreBriefly(startTime, dipGain = 0.52, releaseSec = 0.55) {
    if (!ctx || !scoreDuckGain || !isPlaying) return;
    const t0 = setGainAt(scoreDuckGain.gain, dipGain, startTime);
    expRampGain(scoreDuckGain.gain, 1.0, t0 + releaseSec);
  }

  // ==========================================================================
  // 1889 ORCHESTRAL-INDUSTRIAL INSTRUMENT VOICES
  // ==========================================================================

  // 1. Driving Bowed Cello & Contrabass 6/8 Spiccato Sea-Gallop Ostinato
  function triggerBowedCello(midi, time, duration, velocity, isDownbeat) {
    const freq = midiToFreq(midi);
    const vel = Math.max(0.2, Math.min(1.2, velocity));

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    setFilterQ(filter, 1.45);
    const peakCutoff = clampFreq(freq * (isDownbeat ? 8.5 : 6.2) + 420 * currentCombatIntensity);
    const tf0 = setFreqAt(filter.frequency, clampFreq(freq * 2.4), time);
    const tf1 = expRampFreq(filter.frequency, peakCutoff, tf0 + 0.018);
    expRampFreq(filter.frequency, clampFreq(freq * 3.1), tf1 + duration);

    const amp = ctx.createGain();
    const peakGain = (isDownbeat ? 0.145 : 0.098) * vel;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peakGain, ta0 + 0.012);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + duration);

    const pan = createStereoPan(0.14);
    filter.connect(amp);
    amp.connect(pan);
    pan.connect(scoreBus);

    const stopAt = ta2 + 0.014;

    // Bowed cello pair (warm detuned sawtooth strings)
    for (const cents of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      setFreqAt(osc.frequency, midiToFreq(midi, cents), time);
      osc.connect(filter);
      scheduleOscRun(osc, time, stopAt);
    }

    // Deep contrabass woody body on dotted-quarter beats (0, 3, 6, 9)
    if (isDownbeat) {
      const sub = ctx.createOscillator();
      sub.type = 'triangle';
      setFreqAt(sub.frequency, freq, time);
      const subAmp = ctx.createGain();
      const ts0 = setGainAt(subAmp.gain, SILENT_GAIN, time);
      const ts1 = linearRampGain(subAmp.gain, 0.13 * vel, ts0 + 0.01);
      const ts2 = expRampGain(subAmp.gain, SILENT_GAIN, ts1 + duration * 1.05);
      sub.connect(subAmp);
      subAmp.connect(scoreBus);
      scheduleOscRun(sub, time, ts2 + 0.012);

      // Subtle rosin bow-bite transient
      const rosin = spawnBufferBurst(noiseBuffer, time, 0.032, midi + 7);
      if (rosin) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        setFilterQ(bp, 2.8);
        setFreqAt(bp.frequency, 1450, time);
        const rg = ctx.createGain();
        const trg0 = setGainAt(rg.gain, 0.028 * vel, time);
        expRampGain(rg.gain, SILENT_GAIN, trg0 + 0.026);
        rosin.connect(bp);
        bp.connect(rg);
        rg.connect(pan);
      }
    }
  }

  // 2. Bold Admiralty French-Horn & Trombone Brass Lead (sawtooth ensemble + warm brass swell)
  function triggerAdmiraltyBrassLead(midi, time, duration, velocity) {
    const vel = Math.max(0.3, Math.min(1.15, velocity));
    const intensity = currentCombatIntensity;

    const brassFilter = ctx.createBiquadFilter();
    brassFilter.type = 'lowpass';
    setFilterQ(brassFilter, 1.85);
    const swellPeak = 2150 + 1550 * intensity;
    const tf0 = setFreqAt(brassFilter.frequency, 360, time);
    const tf1 = expRampFreq(brassFilter.frequency, swellPeak, tf0 + Math.min(0.055, duration * 0.35));
    expRampFreq(brassFilter.frequency, 1120 + 420 * intensity, tf1 + duration * 0.85);

    const amp = ctx.createGain();
    const peakGain = (0.105 + 0.032 * intensity) * vel;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peakGain, ta0 + 0.022);
    const sustainEnd = ta1 + Math.max(0.03, duration * 0.72);
    const ta2 = linearRampGain(amp.gain, peakGain * 0.78, sustainEnd);
    const ta3 = expRampGain(amp.gain, SILENT_GAIN, ta2 + Math.max(0.045, duration * 0.34));

    const pan = createStereoPan(-0.16);
    brassFilter.connect(amp);
    amp.connect(pan);
    pan.connect(scoreBus);

    if (reverbInput) {
      const revSend = ctx.createGain();
      revSend.gain.value = 0.34;
      amp.connect(revSend);
      revSend.connect(reverbInput);
    }

    const stopAt = ta3 + 0.016;

    // Dual French-horn unison sawtooths + lower-octave trombone foundation
    const voices = [
      { semi: 0, cents: -5, weight: 0.46 },
      { semi: 0, cents: 5, weight: 0.46 },
      { semi: -12, cents: 0, weight: 0.32 + 0.16 * intensity }
    ];

    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      setFreqAt(osc.frequency, midiToFreq(midi + v.semi, v.cents), time);
      const vg = ctx.createGain();
      vg.gain.value = v.weight;
      osc.connect(vg);
      vg.connect(brassFilter);
      scheduleOscRun(osc, time, stopAt);
    }
  }

  // Warm Admiralty Low-Brass Chord Swell on bar/half-bar anchors
  function triggerBrassChordSwell(midiNotes, time, duration, velocity = 0.75) {
    const intensity = currentCombatIntensity;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    setFilterQ(filter, 1.35);
    const tf0 = setFreqAt(filter.frequency, 310, time);
    const tf1 = expRampFreq(filter.frequency, 1550 + 950 * intensity, tf0 + 0.065);
    expRampFreq(filter.frequency, 680, tf1 + duration);

    const amp = ctx.createGain();
    const peak = (0.048 + 0.028 * intensity) * velocity;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.032);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + duration);

    const pan = createStereoPan(0.22);
    filter.connect(amp);
    amp.connect(pan);
    pan.connect(scoreBus);

    const stopAt = ta2 + 0.016;
    for (let i = 0; i < midiNotes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      setFreqAt(osc.frequency, midiToFreq(midiNotes[i], i % 2 === 0 ? -4 : 4), time);
      osc.connect(filter);
      scheduleOscRun(osc, time, stopAt);
    }
  }

  // 3. Clockwork Harpsichord Plucks & Hurdy-Gurdy Sympathetic Fifth Drone
  function triggerHarpsichordPluck(midi, time, duration, velocity, panPos) {
    const freq = midiToFreq(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    setFilterQ(filter, 2.1);
    const tf0 = setFreqAt(filter.frequency, clampFreq(freq * 6.5), time);
    expRampFreq(filter.frequency, clampFreq(freq * 1.6), tf0 + duration);

    const amp = ctx.createGain();
    const peak = 0.046 * velocity;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.004);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + duration);

    const pan = createStereoPan(panPos);
    filter.connect(amp);
    amp.connect(pan);
    pan.connect(scoreBus);

    const stopAt = ta2 + 0.012;

    // 8' main quill string + 4' upper octave metallic harpsichord stop
    const osc8 = ctx.createOscillator();
    osc8.type = 'sawtooth';
    setFreqAt(osc8.frequency, freq, time);
    osc8.connect(filter);
    scheduleOscRun(osc8, time, stopAt);

    const osc4 = ctx.createOscillator();
    osc4.type = 'square';
    setFreqAt(osc4.frequency, clampFreq(freq * 2.0), time);
    const g4 = ctx.createGain();
    g4.gain.value = 0.28;
    osc4.connect(g4);
    g4.connect(filter);
    scheduleOscRun(osc4, time, stopAt);
  }

  function triggerHurdyGurdyDrone(fifthMidis, time, duration, velocity = 0.65) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    setFilterQ(bp, 1.75);
    const tf0 = setFreqAt(bp.frequency, 740, time);
    const tf1 = linearRampFreq(bp.frequency, 1180, tf0 + duration * 0.45);
    linearRampFreq(bp.frequency, 690, tf1 + duration * 0.55);

    const amp = ctx.createGain();
    const peak = 0.036 * velocity;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.03);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + duration);

    const pan = createStereoPan(-0.28);
    bp.connect(amp);
    amp.connect(pan);
    pan.connect(scoreBus);

    const stopAt = ta2 + 0.015;
    for (let i = 0; i < fifthMidis.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      setFreqAt(osc.frequency, midiToFreq(fifthMidis[i], i === 0 ? -3 : 4), time);
      osc.connect(bp);
      scheduleOscRun(osc, time, stopAt);
    }
  }

  // 4. Naval Kettle Timpani, Royal Navy Snare & Orchestral Piatti Crash
  function triggerNavalTimpani(midi, time, velocity = 0.9) {
    const baseFreq = midiToFreq(midi);
    const vel = Math.max(0.25, Math.min(1.2, velocity));

    // Kettle membrane fundamental with authentic drumhead tension pitch settle
    const kettle = ctx.createOscillator();
    kettle.type = 'sine';
    const tk0 = setFreqAt(kettle.frequency, clampFreq(baseFreq * 1.24), time);
    expRampFreq(kettle.frequency, baseFreq, tk0 + 0.068);

    const body = ctx.createOscillator();
    body.type = 'triangle';
    const tb0 = setFreqAt(body.frequency, clampFreq(baseFreq * 1.5), time);
    expRampFreq(body.frequency, clampFreq(baseFreq * 1.005), tb0 + 0.055);
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.38;
    body.connect(bodyGain);

    const amp = ctx.createGain();
    const peak = (0.22 + 0.06 * currentCombatIntensity) * vel;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.006);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.42);

    kettle.connect(amp);
    bodyGain.connect(amp);
    amp.connect(scoreBus);

    scheduleOscRun(kettle, time, ta2 + 0.015);
    scheduleOscRun(body, time, ta2 + 0.015);

    // Felt-mallet impact thwack
    const mallet = spawnBufferBurst(noiseBuffer, time, 0.042, midi + 19);
    if (mallet) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      setFreqAt(lp.frequency, 520, time);
      const mg = ctx.createGain();
      const tmg0 = setGainAt(mg.gain, 0.085 * vel, time);
      expRampGain(mg.gain, SILENT_GAIN, tmg0 + 0.036);
      mallet.connect(lp);
      lp.connect(mg);
      mg.connect(scoreBus);
    }
  }

  function triggerMilitarySnare(time, velocity = 0.85) {
    const vel = Math.max(0.12, Math.min(1.15, velocity));

    // Taut calfskin naval side-drum shell tone
    const shell = ctx.createOscillator();
    shell.type = 'triangle';
    const ts0 = setFreqAt(shell.frequency, 228, time);
    expRampFreq(shell.frequency, 146, ts0 + 0.055);

    const shellAmp = ctx.createGain();
    const tsa0 = setGainAt(shellAmp.gain, 0.11 * vel, time);
    const tsa1 = expRampGain(shellAmp.gain, SILENT_GAIN, tsa0 + 0.075);
    shell.connect(shellAmp);
    shellAmp.connect(scoreBus);
    scheduleOscRun(shell, time, tsa1 + 0.01);

    // Crisp gut/wire snare rattle
    const wires = spawnBufferBurst(noiseBuffer, time, 0.135, time * 13 + 5);
    if (wires) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      setFreqAt(hp.frequency, 1450, time);
      setFilterQ(hp, 1.15);

      const wg = ctx.createGain();
      const tw0 = setGainAt(wg.gain, 0.135 * vel, time);
      expRampGain(wg.gain, SILENT_GAIN, tw0 + 0.12);
      wires.connect(hp);
      hp.connect(wg);
      wg.connect(scoreBus);
    }
  }

  function triggerPiattiCrash(time, velocity = 0.7) {
    const crash = spawnBufferBurst(noiseBuffer, time, 0.78, 41);
    if (!crash) return;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    setFreqAt(hp.frequency, 3200, time);
    setFilterQ(hp, 1.3);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, 0.075 * velocity, ta0 + 0.008);
    expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.72);

    const pan = createStereoPan(-0.32);
    crash.connect(hp);
    hp.connect(amp);
    amp.connect(pan);
    pan.connect(scoreBus);
  }

  // 5. 1889 Clockwork Escapement Tick & Brass Telegraph Pulse (audible in 'cad' mode)
  function triggerClockworkEscapement(stepInBar, time) {
    const isAnchorTick = stepInBar % 2 === 0;
    const isBeatPulse = stepInBar % 3 === 0;
    const isBarBell = stepInBar === 0;

    // Crisp Swiss/Admiralty brass anchor-pallet tick-tock
    const palletOsc = ctx.createOscillator();
    palletOsc.type = 'triangle';
    const palletFreq = isAnchorTick ? 3120 : 2340;
    const tp0 = setFreqAt(palletOsc.frequency, palletFreq, time);
    expRampFreq(palletOsc.frequency, palletFreq * 0.68, tp0 + 0.018);

    const amp = ctx.createGain();
    const tickGain = isBeatPulse ? 0.058 : 0.032;
    const ta0 = setGainAt(amp.gain, tickGain, time);
    const ta1 = expRampGain(amp.gain, SILENT_GAIN, ta0 + 0.022);

    const pan = createStereoPan(isAnchorTick ? -0.24 : 0.24);
    palletOsc.connect(amp);
    amp.connect(pan);
    pan.connect(cadTickBus);
    scheduleOscRun(palletOsc, time, ta1 + 0.008);

    // Subtle mechanical click impulse
    const click = spawnBufferBurst(noiseBuffer, time, 0.016, stepInBar + 3);
    if (click) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setFilterQ(bp, 4.5);
      setFreqAt(bp.frequency, isAnchorTick ? 4200 : 3400, time);
      const cg = ctx.createGain();
      const tc0 = setGainAt(cg.gain, isBeatPulse ? 0.042 : 0.024, time);
      expRampGain(cg.gain, SILENT_GAIN, tc0 + 0.014);
      click.connect(bp);
      bp.connect(cg);
      cg.connect(pan);
    }

    // Delicate 1889 brass telegraph harmonic ping on bar downbeat (D6 = 1174.66 Hz)
    if (isBarBell) {
      const ping = ctx.createOscillator();
      ping.type = 'sine';
      setFreqAt(ping.frequency, midiToFreq(currentAlert ? 87 : 86), time); // Eb6 on alert, D6 nominal
      const pg = ctx.createGain();
      const tpg0 = setGainAt(pg.gain, SILENT_GAIN, time);
      const tpg1 = linearRampGain(pg.gain, 0.045, tpg0 + 0.003);
      const tpg2 = expRampGain(pg.gain, SILENT_GAIN, tpg1 + 0.22);
      ping.connect(pg);
      pg.connect(cadTickBus);
      scheduleOscRun(ping, time, tpg2 + 0.01);
    }
  }

  // Urgent offbeat muted-brass/anvil danger pulse when shipboard fire/critical hull is active
  function triggerDangerPulse(time) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    setFreqAt(osc.frequency, midiToFreq(69), time); // A4 urgent nautical pulse
    const over = ctx.createOscillator();
    over.type = 'sine';
    setFreqAt(over.frequency, midiToFreq(75), time); // Eb5 tritone tension
    const og = ctx.createGain();
    og.gain.value = 0.28;
    over.connect(og);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, 0.036, ta0 + 0.005);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.085);

    osc.connect(amp);
    og.connect(amp);
    amp.connect(scoreBus);

    scheduleOscRun(osc, time, ta2 + 0.01);
    scheduleOscRun(over, time, ta2 + 0.01);
  }

  // ==========================================================================
  // 6/8 LOOKAHEAD STEP SEQUENCER
  // ==========================================================================

  function scheduleStep(stepCounter, baseTime) {
    const stepInLoop = ((stepCounter % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
    const barInLoop = Math.floor(stepInLoop / STEPS_PER_BAR);
    const stepInBar = stepInLoop % STEPS_PER_BAR;

    // Subtle 6/8 sea-gallop lilt on the 3rd triplet pickup of each dotted-quarter (steps 2, 5, 8, 11)
    const lilt = stepInBar % 3 === 2 ? SEA_LILT_SEC : 0;
    const t = Math.max(0, baseTime + lilt);

    const chordKey = BAR_CHORD_KEYS[barInLoop];
    const chord = CHORD_LIBRARY[chordKey];
    const useVariantB = barInLoop >= 12 || barInLoop === 4 || barInLoop === 7;
    const ostinatoNotes = useVariantB ? chord.ostinatoB : chord.ostinatoA;
    const isCompoundBeat = stepInBar % 3 === 0; // Steps 0, 3, 6, 9

    // 1. Driving Bowed Cello & Contrabass 6/8 Sea-Gallop Ostinato
    const celloMidi = ostinatoNotes[stepInBar];
    const celloVel = OSTINATO_VELOCITIES[stepInBar];
    triggerBowedCello(celloMidi, t, STEP_SEC * (isCompoundBeat ? 1.15 : 0.88), celloVel, isCompoundBeat);

    // 2. Admiralty French-Horn & Trombone Melody + Low-Brass Swells
    const barMelody = MELODY_BY_BAR[barInLoop];
    for (let i = 0; i < barMelody.length; i++) {
      const [, mStep, midi, lenSteps, vel] = barMelody[i];
      if (mStep === stepInBar) {
        triggerAdmiraltyBrassLead(midi, t, STEP_SEC * lenSteps * 0.94, vel);
      }
    }

    if (stepInBar === 0 || (stepInBar === 6 && (currentCombatIntensity >= 0.3 || barInLoop >= 8))) {
      triggerBrassChordSwell(
        chord.brassVoicing,
        t,
        STEP_SEC * 5.2,
        stepInBar === 0 ? 0.85 : 0.68
      );
    }

    // 3. Clockwork Harpsichord Arpeggio Plucks + Hurdy-Gurdy Fifth Drone
    const shouldPluck =
      currentCombatIntensity >= 0.25 ||
      stepInBar % 3 !== 1 ||
      barInLoop >= 4;
    if (shouldPluck) {
      const arpMidi = chord.arp[stepInBar];
      const arpVel = isCompoundBeat ? 0.86 : 0.62;
      const arpPan = (stepInBar % 2 === 0 ? -1 : 1) * 0.42;
      triggerHarpsichordPluck(arpMidi, t, STEP_SEC * 1.25, arpVel, arpPan);
    }

    if (stepInBar === 0 || (stepInBar === 6 && barInLoop >= 8)) {
      triggerHurdyGurdyDrone(chord.droneFifth, t, STEP_SEC * 5.4, 0.66);
    }

    // 4. Naval Kettle Timpani, Royal Navy Snare Drags/Rolls & Piatti Cymbal
    if (stepInBar === 0) {
      triggerNavalTimpani(chord.timpaniMidi, t, 0.96);
    } else if (stepInBar === 6) {
      triggerNavalTimpani(chord.timpaniMidi + 7, t, 0.78); // Dominant fifth kettle drum!
    } else if (barInLoop % 4 === 3 && stepInBar >= 9) {
      // Dramatic 4-bar turnaround kettle timpani roll!
      const rollVel = 0.62 + (stepInBar - 9) * 0.14;
      triggerNavalTimpani(chord.timpaniMidi, t, rollVel);
    } else if (currentCombatIntensity >= 0.68 && stepInBar === 3) {
      triggerNavalTimpani(chord.timpaniMidi, t, 0.64);
    }

    const snarePattern = SNARE_PATTERNS[barInLoop % 4];
    const snareCode = snarePattern[stepInBar];
    if (snareCode === 'X') {
      triggerMilitarySnare(t, 0.88 + 0.12 * currentCombatIntensity);
    } else if (snareCode === 'g' && currentCombatIntensity >= 0.18) {
      triggerMilitarySnare(t, 0.34 + 0.14 * currentCombatIntensity);
    } else if (snareCode === 'd') {
      // Crisp Royal Navy double-grace ruff/drag before the beat!
      triggerMilitarySnare(t, 0.32);
      triggerMilitarySnare(t + STEP_SEC * 0.46, 0.44);
    } else if (snareCode === 'r') {
      // Rapid military double-stroke snare roll!
      triggerMilitarySnare(t, 0.54 + 0.18 * currentCombatIntensity);
      triggerMilitarySnare(t + STEP_SEC * 0.5, 0.62 + 0.18 * currentCombatIntensity);
    } else if (currentCombatIntensity >= 0.78 && stepInBar % 3 === 2) {
      triggerMilitarySnare(t, 0.30);
    }

    if (stepInBar === 0 && barInLoop % 4 === 0 && currentCombatIntensity >= 0.32) {
      triggerPiattiCrash(t, 0.68 + 0.25 * currentCombatIntensity);
    }

    // 5. CAD X-Ray Clockwork Escapement Tick & Optional Shipboard Danger Pulse
    triggerClockworkEscapement(stepInBar, t);

    if (currentAlert && (stepInBar === 2 || stepInBar === 8)) {
      triggerDangerPulse(t);
    }
  }

  function schedulerTick() {
    if (!isPlaying || !ctx) return;

    const now = Math.max(0, Number(ctx.currentTime) || 0);

    // Guard against multi-minute background tab suspension while supporting 36+ bar test sweeps
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

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      lookaheadSec = document.hidden ? LOOKAHEAD_HIDDEN_SEC : LOOKAHEAD_VISIBLE_SEC;
      if (isPlaying) schedulerTick();
    });
  }

  // ==========================================================================
  // PUBLIC TRANSPORT & DYNAMIC MODE MIX API
  // ==========================================================================

  function start() {
    if (!ensureContext()) return false;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        Promise.resolve(ctx.resume()).catch(() => {});
      } catch (_) {}
    }

    stopSchedulerTimer();
    isPlaying = true;

    const now = Math.max(0, Number(ctx.currentTime) || 0);
    transportStartTime = now;
    nextStepTime = now;
    totalStepsScheduled = 0;

    if (masterGain) {
      targetGainAt(masterGain.gain, MASTER_LEVEL, now, 0.05);
    }
    if (scoreDuckGain) {
      targetGainAt(scoreDuckGain.gain, 1.0, now, 0.05);
    }

    applyModeMixToAudio(now);
    schedulerTick();

    if (typeof setInterval === 'function') {
      schedulerTimer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
    }
    return true;
  }

  function stop() {
    isPlaying = false;
    stopSchedulerTimer();

    if (ctx) {
      const now = Math.max(0, Number(ctx.currentTime) || 0);
      applyModeMixToAudio(now);
    }
    return false;
  }

  function toggle() {
    return isPlaying ? stop() : start();
  }

  function setModeMix(viewMode = '3d', combatIntensity = 0.35, hasAlert = false) {
    const modeStr = String(viewMode || '3d').toLowerCase();
    currentViewMode = modeStr === 'cad' ? 'cad' : '3d';
    const rawInt = Number(combatIntensity);
    currentCombatIntensity = Number.isFinite(rawInt) ? Math.max(0, Math.min(1, rawInt)) : 0.35;
    currentAlert = Boolean(hasAlert);

    if (ctx) {
      const now = Math.max(0, Number(ctx.currentTime) || 0);
      if (isPlaying) {
        schedulerTick();
      }
      applyModeMixToAudio(now);
    }

    return {
      viewMode: currentViewMode,
      combatIntensity: currentCombatIntensity,
      hasAlert: currentAlert
    };
  }

  function getMixState() {
    if (isPlaying && ctx) schedulerTick();
    return {
      viewMode: currentViewMode,
      combatIntensity: currentCombatIntensity,
      hasAlert: currentAlert,
      isPlaying
    };
  }

  function getBarAndBeat() {
    if (!isPlaying || !ctx) {
      return { bar: 0, beat: 0, step: 0, bpm: DOTTED_QUARTER_BPM, isPlaying: false };
    }
    schedulerTick();
    const elapsed = Math.max(0, (Number(ctx.currentTime) || 0) - transportStartTime);
    const totalSteps = Math.max(0, Math.floor(elapsed / STEP_SEC));
    const step = totalSteps % STEPS_PER_BAR;
    const beat = Math.floor(step / STEPS_PER_BEAT);
    const bar = Math.floor(totalSteps / STEPS_PER_BAR);
    return { bar, beat, step, bpm: DOTTED_QUARTER_BPM, isPlaying: true };
  }

  function getBeatPhase() {
    if (!isPlaying || !ctx) return 0;
    schedulerTick();
    const elapsed = Math.max(0, (Number(ctx.currentTime) || 0) - transportStartTime);
    const beats = elapsed / BEAT_SEC;
    const phase = beats - Math.floor(beats);
    return phase >= 0 && phase < 1 ? phase : 0;
  }

  function getSpectrum() {
    if (!isPlaying) {
      spectrumBins.fill(0);
      return spectrumBins;
    }
    if (ctx) schedulerTick();
    if (analyser && analyserRawBins && typeof analyser.getByteFrequencyData === 'function') {
      analyser.getByteFrequencyData(analyserRawBins);
      const ratio = Math.max(1, Math.floor(analyserRawBins.length / 32));
      for (let i = 0; i < 32; i++) {
        let sum = 0;
        const startBin = i * ratio;
        for (let j = 0; j < ratio; j++) {
          sum += analyserRawBins[startBin + j] || 0;
        }
        spectrumBins[i] = Math.min(255, Math.round(sum / ratio));
      }
    }
    return spectrumBins;
  }

  // ==========================================================================
  // SYNTHESIZED NAVAL GUNNERY, BOILER STEAM & ADMIRALTY SFX
  // ==========================================================================

  // 1. Staggered 35ms-Rippled 6-Gun Broadside Cannon Roar
  function playBroadsideSfx(gunCount = 6, ammoType = 'roundshot') {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const now = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const rawCount = Number(gunCount);
    const count = Number.isFinite(rawCount) ? Math.max(1, Math.min(12, Math.round(rawCount))) : 6;
    const normAmmo = String(ammoType || 'roundshot').toLowerCase().replace(/[^a-z]/g, '');
    const isAether = normAmmo.includes('aether');
    const isChain = normAmmo.includes('chain');

    const voiceScale = 1 / Math.sqrt(count);
    const dest = cannonSaturation || sfxBus || masterGain || ctx.destination;
    const cleanDest = sfxBus || masterGain || ctx.destination;

    duckScoreBriefly(now, 0.58, 0.42);

    // Deterministic organic gunner ripple (~35ms per gun barrel down the broadside deck)
    const microOffsets = [0.0, 0.002, -0.0015, 0.0025, -0.001, 0.0018];

    for (let i = 0; i < count; i++) {
      const jitter = microOffsets[i % microOffsets.length];
      const gt = Math.max(now, now + i * 0.035 + (i > 0 ? jitter : 0));
      const panPos = count > 1 ? -0.46 + (0.92 * i) / (count - 1) : 0;
      const gunPan = createStereoPan(panPos);
      gunPan.connect(dest);

      // (a) Sub-bass cannon recoil chest thump
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      const startPitch = (isAether ? 148 : 126) - (i % 3) * 5;
      const ts0 = setFreqAt(sub.frequency, startPitch, gt);
      expRampFreq(sub.frequency, 32, ts0 + 0.24);

      const subAmp = ctx.createGain();
      const tsa0 = setGainAt(subAmp.gain, SILENT_GAIN, gt);
      const tsa1 = linearRampGain(subAmp.gain, 0.34 * voiceScale, tsa0 + 0.005);
      const tsa2 = expRampGain(subAmp.gain, SILENT_GAIN, tsa1 + 0.25);
      sub.connect(subAmp);
      subAmp.connect(gunPan);
      scheduleOscRun(sub, gt, tsa2 + 0.014);

      // (b) Black-powder muzzle blast filtered noise roar
      const blast = spawnBufferBurst(noiseBuffer, gt, 0.38, i * 17 + 3);
      if (blast) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        setFilterQ(lp, isAether ? 2.4 : 1.25);
        const tbl0 = setFreqAt(lp.frequency, isAether ? 3200 : 1850, gt);
        expRampFreq(lp.frequency, 210, tbl0 + 0.34);

        const bg = ctx.createGain();
        const tbg0 = setGainAt(bg.gain, 0.30 * voiceScale, gt);
        expRampGain(bg.gain, SILENT_GAIN, tbg0 + 0.35);

        blast.connect(lp);
        lp.connect(bg);
        bg.connect(gunPan);

        if (reverbInput && i % 2 === 0) {
          const rev = ctx.createGain();
          rev.gain.value = 0.24;
          bg.connect(rev);
          rev.connect(reverbInput);
        }
      }

      // (c) Cast-brass 1889 cannon breech harmonic ring
      const breechFreqs = [682 + (i % 3) * 19, 1138 + (i % 2) * 31];
      for (let m = 0; m < breechFreqs.length; m++) {
        const ring = ctx.createOscillator();
        ring.type = 'triangle';
        setFreqAt(ring.frequency, breechFreqs[m], gt);
        const rg = ctx.createGain();
        const trg0 = setGainAt(rg.gain, SILENT_GAIN, gt);
        const trg1 = linearRampGain(rg.gain, (m === 0 ? 0.075 : 0.048) * voiceScale, trg0 + 0.003);
        const trg2 = expRampGain(rg.gain, SILENT_GAIN, trg1 + 0.14);
        ring.connect(rg);
        rg.connect(cleanDest);
        scheduleOscRun(ring, gt, trg2 + 0.012);
      }

      // (d) Ammo-specific ballistic signature!
      if (isAether) {
        // High-voltage emerald aether-plasma harmonic arc + spark crackle
        const plasma = ctx.createOscillator();
        plasma.type = 'sawtooth';
        const tp0 = setFreqAt(plasma.frequency, 2150 + i * 95, gt + 0.01);
        expRampFreq(plasma.frequency, 460, tp0 + 0.22);

        const over = ctx.createOscillator();
        over.type = 'sine';
        const to0 = setFreqAt(over.frequency, 740, gt + 0.01);
        expRampFreq(over.frequency, 2680, to0 + 0.19);

        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        setFilterQ(hp, 3.6);
        const thp0 = setFreqAt(hp.frequency, 2400, gt + 0.01);
        expRampFreq(hp.frequency, 880, thp0 + 0.21);

        const pg = ctx.createGain();
        const tpg0 = setGainAt(pg.gain, SILENT_GAIN, gt + 0.01);
        const tpg1 = linearRampGain(pg.gain, 0.11 * voiceScale, tpg0 + 0.008);
        const tpg2 = expRampGain(pg.gain, SILENT_GAIN, tpg1 + 0.21);

        plasma.connect(hp);
        over.connect(hp);
        hp.connect(pg);
        pg.connect(cleanDest);
        scheduleOscRun(plasma, gt + 0.01, tpg2 + 0.012);
        scheduleOscRun(over, gt + 0.01, tpg2 + 0.012);

        const arc = spawnBufferBurst(sparkBuffer || noiseBuffer, gt + 0.012, 0.22, i * 29 + 11);
        if (arc) {
          const ahp = ctx.createBiquadFilter();
          ahp.type = 'highpass';
          setFreqAt(ahp.frequency, 3600, gt + 0.012);
          const ag = ctx.createGain();
          const tag0 = setGainAt(ag.gain, 0.15 * voiceScale, gt + 0.012);
          expRampGain(ag.gain, SILENT_GAIN, tag0 + 0.20);
          arc.connect(ahp);
          ahp.connect(ag);
          ag.connect(cleanDest);
        }
      } else if (isChain) {
        // Whipping twin-ball iron chain clatter & spinning bola Doppler whirr
        for (let c = 0; c < 2; c++) {
          const ct = gt + 0.028 + c * 0.052;
          const linkOsc = ctx.createOscillator();
          linkOsc.type = 'square';
          const tl0 = setFreqAt(linkOsc.frequency, 2680 + ((i + c) % 4) * 340, ct);
          expRampFreq(linkOsc.frequency, 1420, tl0 + 0.055);

          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          setFilterQ(bp, 4.8);
          setFreqAt(bp.frequency, 3100, ct);

          const cg = ctx.createGain();
          const tcg0 = setGainAt(cg.gain, SILENT_GAIN, ct);
          const tcg1 = linearRampGain(cg.gain, 0.095 * voiceScale, tcg0 + 0.003);
          const tcg2 = expRampGain(cg.gain, SILENT_GAIN, tcg1 + 0.065);

          linkOsc.connect(bp);
          bp.connect(cg);
          cg.connect(cleanDest);
          scheduleOscRun(linkOsc, ct, tcg2 + 0.01);
        }

        const whip = spawnBufferBurst(noiseBuffer, gt + 0.02, 0.24, i * 13 + 7);
        if (whip) {
          const wbp = ctx.createBiquadFilter();
          wbp.type = 'bandpass';
          setFilterQ(wbp, 2.9);
          const tw0 = setFreqAt(wbp.frequency, 920, gt + 0.02);
          const tw1 = expRampFreq(wbp.frequency, 2450, tw0 + 0.09);
          expRampFreq(wbp.frequency, 680, tw1 + 0.14);
          const wg = ctx.createGain();
          const twg0 = setGainAt(wg.gain, 0.12 * voiceScale, gt + 0.02);
          expRampGain(wg.gain, SILENT_GAIN, twg0 + 0.22);
          whip.connect(wbp);
          wbp.connect(wg);
          wg.connect(cleanDest);
        }
      } else {
        // Classic heavy iron roundshot supersonic whistle & punch
        const shot = ctx.createOscillator();
        shot.type = 'triangle';
        const tr0 = setFreqAt(shot.frequency, 1180 - (i % 3) * 70, gt + 0.015);
        expRampFreq(shot.frequency, 360, tr0 + 0.18);
        const sg = ctx.createGain();
        const tsg0 = setGainAt(sg.gain, SILENT_GAIN, gt + 0.015);
        const tsg1 = linearRampGain(sg.gain, 0.055 * voiceScale, tsg0 + 0.012);
        const tsg2 = expRampGain(sg.gain, SILENT_GAIN, tsg1 + 0.16);
        shot.connect(sg);
        sg.connect(cleanDest);
        scheduleOscRun(shot, gt + 0.015, tsg2 + 0.012);
      }
    }
  }

  // 2. Hull Impact, Critical Bulkhead Clang, Fire Ignition, Cloud-Splash & Magazine Sink Detonation
  function playImpactSfx(kind = 'hit') {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const k = String(kind || 'hit').toLowerCase();
    if (k === 'vent' || k === 'steam') {
      playVentSteamSfx();
      return;
    }

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = cannonSaturation || sfxBus || masterGain || ctx.destination;
    const cleanDest = sfxBus || masterGain || ctx.destination;

    if (k === 'splash') {
      // Cloud-vapor & sea-foam plume miss whoosh
      const plume = spawnBufferBurst(noiseBuffer, t0, 0.46, 53);
      if (plume) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        setFilterQ(bp, 1.5);
        const tf0 = setFreqAt(bp.frequency, 980, t0);
        const tf1 = expRampFreq(bp.frequency, 310, tf0 + 0.16);
        expRampFreq(bp.frequency, 1450, tf1 + 0.28);

        const amp = ctx.createGain();
        const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
        const ta1 = linearRampGain(amp.gain, 0.18, ta0 + 0.018);
        expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.42);

        plume.connect(bp);
        bp.connect(amp);
        amp.connect(cleanDest);
      }

      const drop = ctx.createOscillator();
      drop.type = 'sine';
      const td0 = setFreqAt(drop.frequency, 195, t0);
      expRampFreq(drop.frequency, 62, td0 + 0.18);
      const dg = ctx.createGain();
      const tdg0 = setGainAt(dg.gain, 0.11, t0);
      const tdg1 = expRampGain(dg.gain, SILENT_GAIN, tdg0 + 0.19);
      drop.connect(dg);
      dg.connect(cleanDest);
      scheduleOscRun(drop, t0, tdg1 + 0.012);
      return;
    }

    if (k === 'sink') {
      duckScoreBriefly(t0, 0.42, 0.95);

      // Stage 1: Hull-keel structural groan & heavy crunch
      const groan = ctx.createOscillator();
      groan.type = 'sawtooth';
      const tg0 = setFreqAt(groan.frequency, 132, t0);
      expRampFreq(groan.frequency, 36, tg0 + 0.65);

      const glp = ctx.createBiquadFilter();
      glp.type = 'lowpass';
      setFreqAt(glp.frequency, 380, t0);
      const gAmp = ctx.createGain();
      const tga0 = setGainAt(gAmp.gain, SILENT_GAIN, t0);
      const tga1 = linearRampGain(gAmp.gain, 0.24, tga0 + 0.02);
      const tga2 = expRampGain(gAmp.gain, SILENT_GAIN, tga1 + 0.64);
      groan.connect(glp);
      glp.connect(gAmp);
      gAmp.connect(dest);
      scheduleOscRun(groan, t0, tga2 + 0.015);

      // Stage 2: Deep secondary aether-magazine detonation at +165ms!
      const detTime = t0 + 0.165;
      const magSub = ctx.createOscillator();
      magSub.type = 'sine';
      const tms0 = setFreqAt(magSub.frequency, 98, detTime);
      expRampFreq(magSub.frequency, 24, tms0 + 0.82);

      const magAmp = ctx.createGain();
      const tma0 = setGainAt(magAmp.gain, SILENT_GAIN, detTime);
      const tma1 = linearRampGain(magAmp.gain, 0.44, tma0 + 0.008);
      const tma2 = expRampGain(magAmp.gain, SILENT_GAIN, tma1 + 0.84);
      magSub.connect(magAmp);
      magAmp.connect(dest);
      scheduleOscRun(magSub, detTime, tma2 + 0.02);

      const roar = spawnBufferBurst(noiseBuffer, detTime, 0.92, 71);
      if (roar) {
        const rlp = ctx.createBiquadFilter();
        rlp.type = 'lowpass';
        setFilterQ(rlp, 1.4);
        const tr0 = setFreqAt(rlp.frequency, 2200, detTime);
        expRampFreq(rlp.frequency, 140, tr0 + 0.86);
        const rg = ctx.createGain();
        const trg0 = setGainAt(rg.gain, 0.34, detTime);
        expRampGain(rg.gain, SILENT_GAIN, trg0 + 0.88);
        roar.connect(rlp);
        rlp.connect(rg);
        rg.connect(dest);
      }

      // Cascading mahogany splinters & tolling bronze ship bell
      for (let s = 0; s < 4; s++) {
        const st = detTime + 0.06 + s * 0.085;
        const spl = spawnBufferBurst(timberBuffer || noiseBuffer, st, 0.11, s * 19 + 4);
        if (spl) {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          setFilterQ(bp, 3.2);
          setFreqAt(bp.frequency, 1100 + s * 340, st);
          const sg = ctx.createGain();
          const tsg0 = setGainAt(sg.gain, 0.16, st);
          expRampGain(sg.gain, SILENT_GAIN, tsg0 + 0.095);
          spl.connect(bp);
          bp.connect(sg);
          sg.connect(cleanDest);
        }
      }
      return;
    }

    // Core heavy mahogany hull impact thud ('hit', 'crit', 'fire')
    const thud = ctx.createOscillator();
    thud.type = 'triangle';
    const tt0 = setFreqAt(thud.frequency, k === 'crit' ? 142 : 112, t0);
    expRampFreq(thud.frequency, 36, tt0 + 0.21);

    const thudAmp = ctx.createGain();
    const tta0 = setGainAt(thudAmp.gain, SILENT_GAIN, t0);
    const tta1 = linearRampGain(thudAmp.gain, k === 'crit' ? 0.34 : 0.26, tta0 + 0.005);
    const tta2 = expRampGain(thudAmp.gain, SILENT_GAIN, tta1 + 0.22);
    thud.connect(thudAmp);
    thudAmp.connect(dest);
    scheduleOscRun(thud, t0, tta2 + 0.014);

    // Staggered splintering timber crackles
    const splinterFreqs = [980, 1540, 2180];
    for (let i = 0; i < splinterFreqs.length; i++) {
      const st = t0 + i * 0.028;
      const wood = spawnBufferBurst(timberBuffer || noiseBuffer, st, 0.085, i * 23 + 9);
      if (wood) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        setFilterQ(bp, 3.4);
        setFreqAt(bp.frequency, splinterFreqs[i], st);
        const wg = ctx.createGain();
        const tw0 = setGainAt(wg.gain, 0.16 - i * 0.025, st);
        expRampGain(wg.gain, SILENT_GAIN, tw0 + 0.075);
        wood.connect(bp);
        bp.connect(wg);
        wg.connect(cleanDest);
      }
    }

    if (k === 'crit') {
      // Shattering brass armor / boiler bulkhead metallic clang + aether arc!
      const clangModes = [542, 886, 1435];
      for (let i = 0; i < clangModes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = i === 1 ? 'sawtooth' : 'triangle';
        const tc0 = setFreqAt(osc.frequency, clangModes[i], t0 + 0.006);
        expRampFreq(osc.frequency, clangModes[i] * 0.94, tc0 + 0.28);

        const cg = ctx.createGain();
        const tcg0 = setGainAt(cg.gain, SILENT_GAIN, t0 + 0.006);
        const tcg1 = linearRampGain(cg.gain, 0.11 / (i + 1), tcg0 + 0.004);
        const tcg2 = expRampGain(cg.gain, SILENT_GAIN, tcg1 + 0.28);
        osc.connect(cg);
        cg.connect(cleanDest);
        scheduleOscRun(osc, t0 + 0.006, tcg2 + 0.012);
      }
    } else if (k === 'fire') {
      // Incendiary flare ignition whoosh + crackling deck flames
      const blaze = spawnBufferBurst(sparkBuffer || noiseBuffer, t0 + 0.015, 0.44, 61);
      if (blaze) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        setFilterQ(bp, 1.65);
        const tf0 = setFreqAt(bp.frequency, 260, t0 + 0.015);
        const tf1 = expRampFreq(bp.frequency, 1650, tf0 + 0.11);
        expRampFreq(bp.frequency, 520, tf1 + 0.30);

        const fg = ctx.createGain();
        const tfg0 = setGainAt(fg.gain, SILENT_GAIN, t0 + 0.015);
        const tfg1 = linearRampGain(fg.gain, 0.22, tfg0 + 0.035);
        expRampGain(fg.gain, SILENT_GAIN, tfg1 + 0.38);

        blaze.connect(bp);
        bp.connect(fg);
        fg.connect(cleanDest);
      }
    }
  }

  // 3. Dramatic Pressurized Twin-Valve Steam Hiss + Pressure-Drop Whistle
  function playVentSteamSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;

    // Brass relief-valve unseating clank
    const valveModes = [1320, 2080];
    for (let i = 0; i < valveModes.length; i++) {
      const clank = ctx.createOscillator();
      clank.type = 'triangle';
      setFreqAt(clank.frequency, valveModes[i], t0);
      const cg = ctx.createGain();
      const tc0 = setGainAt(cg.gain, SILENT_GAIN, t0);
      const tc1 = linearRampGain(cg.gain, 0.12, tc0 + 0.003);
      const tc2 = expRampGain(cg.gain, SILENT_GAIN, tc1 + 0.055);
      clank.connect(cg);
      cg.connect(dest);
      scheduleOscRun(clank, t0, tc2 + 0.01);
    }

    // Twin stereo pressurized Scotch boiler relief-valve steam blasts
    const pans = [-0.52, 0.52];
    for (let v = 0; v < pans.length; v++) {
      const vt = t0 + v * 0.035;
      const hiss = spawnBufferBurst(noiseBuffer, vt, 0.88, 83 + v * 17);
      if (hiss) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        setFilterQ(bp, 1.45);
        const tf0 = setFreqAt(bp.frequency, 1100, vt);
        const tf1 = expRampFreq(bp.frequency, 4400, tf0 + 0.14);
        expRampFreq(bp.frequency, 820, tf1 + 0.70);

        const hg = ctx.createGain();
        const th0 = setGainAt(hg.gain, SILENT_GAIN, vt);
        const th1 = linearRampGain(hg.gain, 0.20, th0 + 0.03);
        expRampGain(hg.gain, SILENT_GAIN, th1 + 0.80);

        const pan = createStereoPan(pans[v]);
        hiss.connect(bp);
        bp.connect(hg);
        hg.connect(pan);
        pan.connect(dest);
      }
    }

    // 1889 Brass Steam-Whistle Pressure-Drop Calliope Interval (A5 + E6 gliding down)
    const whistleBase = [880, 1318.51];
    for (let i = 0; i < whistleBase.length; i++) {
      const wt = t0 + 0.04;
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      const tw0 = setFreqAt(osc.frequency, whistleBase[i] * 1.04, wt);
      const tw1 = linearRampFreq(osc.frequency, whistleBase[i], tw0 + 0.12);
      expRampFreq(osc.frequency, whistleBase[i] * 0.58, tw1 + 0.62);

      const wg = ctx.createGain();
      const twg0 = setGainAt(wg.gain, SILENT_GAIN, wt);
      const twg1 = linearRampGain(wg.gain, i === 0 ? 0.11 : 0.075, twg0 + 0.025);
      const twg2 = expRampGain(wg.gain, SILENT_GAIN, twg1 + 0.68);

      osc.connect(wg);
      wg.connect(dest);
      scheduleOscRun(osc, wt, twg2 + 0.015);
    }
  }

  // 4. Crisp Brass Telegraph Click + Ratchet Wrench Chime (Crew Dispatch)
  function playCrewAssignSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;

    // Chadburn brass telegraph detent click
    const detent = ctx.createOscillator();
    detent.type = 'square';
    const td0 = setFreqAt(detent.frequency, 2850, t0);
    expRampFreq(detent.frequency, 1420, td0 + 0.022);
    const dg = ctx.createGain();
    const tdg0 = setGainAt(dg.gain, 0.095, t0);
    const tdg1 = expRampGain(dg.gain, SILENT_GAIN, tdg0 + 0.024);
    detent.connect(dg);
    dg.connect(dest);
    scheduleOscRun(detent, t0, tdg1 + 0.008);

    // 3-tooth engineer ratchet wrench zip
    const ratchetFreqs = [1920, 2380, 2910];
    for (let i = 0; i < ratchetFreqs.length; i++) {
      const rt = t0 + 0.036 + i * 0.028;
      const tooth = ctx.createOscillator();
      tooth.type = 'triangle';
      setFreqAt(tooth.frequency, ratchetFreqs[i], rt);
      const rg = ctx.createGain();
      const tr0 = setGainAt(rg.gain, SILENT_GAIN, rt);
      const tr1 = linearRampGain(rg.gain, 0.085, tr0 + 0.003);
      const tr2 = expRampGain(rg.gain, SILENT_GAIN, tr1 + 0.022);
      tooth.connect(rg);
      rg.connect(dest);
      scheduleOscRun(tooth, rt, tr2 + 0.008);
    }

    // Affirming Admiralty brass telegraph bell chime (A5 -> D6)
    const chimeMidis = [81, 86];
    for (let i = 0; i < chimeMidis.length; i++) {
      const ct = t0 + 0.055 + i * 0.068;
      const bell = ctx.createOscillator();
      bell.type = 'sine';
      const baseF = midiToFreq(chimeMidis[i]);
      setFreqAt(bell.frequency, baseF, ct);

      const bronze = ctx.createOscillator();
      bronze.type = 'triangle';
      setFreqAt(bronze.frequency, clampFreq(baseF * 2.41), ct);
      const bzg = ctx.createGain();
      bzg.gain.value = 0.24;
      bronze.connect(bzg);

      const bg = ctx.createGain();
      const tb0 = setGainAt(bg.gain, SILENT_GAIN, ct);
      const tb1 = linearRampGain(bg.gain, 0.13, tb0 + 0.004);
      const tb2 = expRampGain(bg.gain, SILENT_GAIN, tb1 + (i === 1 ? 0.26 : 0.14));

      bell.connect(bg);
      bzg.connect(bg);
      bg.connect(dest);
      scheduleOscRun(bell, ct, tb2 + 0.012);
      scheduleOscRun(bronze, ct, tb2 + 0.012);
    }
  }

  // 5. Rising Boiler Turbine Whine + Brass Pressure Bell (19.5-Bar Overpressure!)
  function playOverpressureSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;

    // Deep Scotch boiler firebox surge
    const surge = ctx.createOscillator();
    surge.type = 'triangle';
    const ts0 = setFreqAt(surge.frequency, 68, t0);
    expRampFreq(surge.frequency, 146, ts0 + 0.55);
    const sg = ctx.createGain();
    const tsg0 = setGainAt(sg.gain, SILENT_GAIN, t0);
    const tsg1 = linearRampGain(sg.gain, 0.22, tsg0 + 0.05);
    const tsg2 = expRampGain(sg.gain, SILENT_GAIN, tsg1 + 0.54);
    surge.connect(sg);
    sg.connect(dest);
    scheduleOscRun(surge, t0, tsg2 + 0.015);

    // Rising twin-turbine centrifugal whine (210 Hz -> 1240 Hz)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    setFilterQ(lp, 2.8);
    const tlp0 = setFreqAt(lp.frequency, 480, t0);
    expRampFreq(lp.frequency, 4600, tlp0 + 0.58);

    const wAmp = ctx.createGain();
    const twa0 = setGainAt(wAmp.gain, SILENT_GAIN, t0);
    const twa1 = linearRampGain(wAmp.gain, 0.14, twa0 + 0.045);
    const twa2 = expRampGain(wAmp.gain, SILENT_GAIN, twa1 + 0.58);
    lp.connect(wAmp);
    wAmp.connect(dest);

    for (const ratio of [0.993, 1.007]) {
      const turb = ctx.createOscillator();
      turb.type = 'sawtooth';
      const tt0 = setFreqAt(turb.frequency, 215 * ratio, t0);
      expRampFreq(turb.frequency, 1220 * ratio, tt0 + 0.58);
      turb.connect(lp);
      scheduleOscRun(turb, t0, twa2 + 0.016);
    }

    // Double Chadburn brass pressure-bell strike
    for (let b = 0; b < 2; b++) {
      const bt = t0 + 0.09 + b * 0.155;
      const bell = ctx.createOscillator();
      bell.type = 'sine';
      setFreqAt(bell.frequency, 1174.66, bt); // D6
      const partial = ctx.createOscillator();
      partial.type = 'triangle';
      setFreqAt(partial.frequency, 2830, bt);
      const pg = ctx.createGain();
      pg.gain.value = 0.28;
      partial.connect(pg);

      const bg = ctx.createGain();
      const tb0 = setGainAt(bg.gain, SILENT_GAIN, bt);
      const tb1 = linearRampGain(bg.gain, 0.15, tb0 + 0.003);
      const tb2 = expRampGain(bg.gain, SILENT_GAIN, tb1 + 0.26);

      bell.connect(bg);
      pg.connect(bg);
      bg.connect(dest);
      scheduleOscRun(bell, bt, tb2 + 0.012);
      scheduleOscRun(partial, bt, tb2 + 0.012);
    }
  }

  // 6. Urgent Nautical Brass Klaxon Bell (Fire / Critical Hull Alert)
  function playAlertSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;

    // Two-pulse urgent Admiralty brass klaxon horn (G#4/A4 bend + D5/Eb5 naval alarm interval)
    for (let p = 0; p < 2; p++) {
      const pt = t0 + p * 0.185;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      setFilterQ(filter, 2.4);
      const tf0 = setFreqAt(filter.frequency, 680, pt);
      const tf1 = expRampFreq(filter.frequency, 1850, tf0 + 0.045);
      expRampFreq(filter.frequency, 920, tf1 + 0.11);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, pt);
      const ta1 = linearRampGain(amp.gain, 0.135, ta0 + 0.01);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.14);

      filter.connect(amp);
      amp.connect(dest);

      const hornFreqs = [440, 622.25]; // A4 + Eb5 urgent naval danger interval
      for (let i = 0; i < hornFreqs.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const th0 = setFreqAt(osc.frequency, hornFreqs[i] * 0.92, pt);
        linearRampFreq(osc.frequency, hornFreqs[i], th0 + 0.032);
        osc.connect(filter);
        scheduleOscRun(osc, pt, ta2 + 0.012);
      }
    }

    // Rapid triple bronze fire-bell clapper strikes
    for (let c = 0; c < 3; c++) {
      const ct = t0 + c * 0.105;
      const bell = ctx.createOscillator();
      bell.type = 'sine';
      setFreqAt(bell.frequency, 1567.98, ct); // G6 ship's alarm bell
      const over = ctx.createOscillator();
      over.type = 'triangle';
      setFreqAt(over.frequency, 3715, ct);
      const og = ctx.createGain();
      og.gain.value = 0.30;
      over.connect(og);

      const bg = ctx.createGain();
      const tb0 = setGainAt(bg.gain, SILENT_GAIN, ct);
      const tb1 = linearRampGain(bg.gain, 0.12, tb0 + 0.003);
      const tb2 = expRampGain(bg.gain, SILENT_GAIN, tb1 + 0.14);

      bell.connect(bg);
      og.connect(bg);
      bg.connect(dest);
      scheduleOscRun(bell, ct, tb2 + 0.01);
      scheduleOscRun(over, ct, tb2 + 0.01);
    }
  }

  // 7. Admiralty Horn Fanfare ('wave' | 'victory' | 'defeat')
  function playFanfareSfx(kind = 'wave') {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;
    const k = String(kind || 'wave').toLowerCase();

    duckScoreBriefly(t0, 0.36, k === 'victory' ? 1.4 : 0.95);

    let chords = null;
    if (k.includes('vict') || k === 'win') {
      // Grand Admiralty Triumph: Dm -> Bb -> C -> F -> Glorious D-Major Picardy Tierce!
      chords = [
        { delay: 0.00, dur: 0.16, notes: [50, 57, 62, 65], timp: 38 },
        { delay: 0.15, dur: 0.16, notes: [46, 58, 62, 65], timp: 34 },
        { delay: 0.30, dur: 0.18, notes: [48, 60, 64, 67], timp: 36 },
        { delay: 0.47, dur: 0.20, notes: [53, 60, 65, 69], timp: 41 },
        { delay: 0.66, dur: 0.78, notes: [50, 57, 62, 66, 69, 74], timp: 38 }
      ];
    } else if (k.includes('defeat') || k.includes('loss') || k.includes('scuttl')) {
      // Somber Scuttled Dirge: Dm -> Bbmaj7 -> Gm -> A7 -> Low D-minor toll
      chords = [
        { delay: 0.00, dur: 0.26, notes: [50, 57, 62, 65], timp: 38 },
        { delay: 0.25, dur: 0.26, notes: [46, 53, 57, 62], timp: 34 },
        { delay: 0.50, dur: 0.28, notes: [43, 50, 55, 58], timp: 43 },
        { delay: 0.78, dur: 0.82, notes: [38, 45, 50, 53, 57], timp: 38 }
      ];
    } else {
      // 'wave' Call to Quarters: brisk 4-step D-minor -> D5 Admiralty horn call!
      chords = [
        { delay: 0.00, dur: 0.13, notes: [50, 62, 69], timp: 38 },
        { delay: 0.12, dur: 0.13, notes: [53, 65, 72], timp: null },
        { delay: 0.24, dur: 0.14, notes: [57, 69, 76], timp: null },
        { delay: 0.37, dur: 0.48, notes: [50, 57, 62, 66, 74], timp: 38 }
      ];
    }

    const isSomber = k.includes('defeat') || k.includes('loss') || k.includes('scuttl');

    for (const step of chords) {
      const st = t0 + step.delay;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      setFilterQ(filter, 1.7);
      const peakCut = isSomber ? 1350 : 3400;
      const tf0 = setFreqAt(filter.frequency, 380, st);
      const tf1 = expRampFreq(filter.frequency, peakCut, tf0 + 0.042);
      expRampFreq(filter.frequency, isSomber ? 540 : 1450, tf1 + step.dur);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, st);
      const ta1 = linearRampGain(amp.gain, isSomber ? 0.082 : 0.092, ta0 + 0.018);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + step.dur);

      filter.connect(amp);
      amp.connect(dest);

      if (reverbInput) {
        const rev = ctx.createGain();
        rev.gain.value = 0.44;
        amp.connect(rev);
        rev.connect(reverbInput);
      }

      const stopAt = ta2 + 0.018;
      for (let i = 0; i < step.notes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        setFreqAt(osc.frequency, midiToFreq(step.notes[i], i % 2 === 0 ? -5 : 5), st);
        osc.connect(filter);
        scheduleOscRun(osc, st, stopAt);
      }

      // Kettle timpani punctuation on fanfare pillars
      if (step.timp !== null) {
        const ket = ctx.createOscillator();
        ket.type = 'sine';
        const baseF = midiToFreq(step.timp);
        const tk0 = setFreqAt(ket.frequency, baseF * 1.22, st);
        expRampFreq(ket.frequency, baseF, tk0 + 0.06);
        const kg = ctx.createGain();
        const tkg0 = setGainAt(kg.gain, 0.20, st);
        const tkg1 = expRampGain(kg.gain, SILENT_GAIN, tkg0 + 0.34);
        ket.connect(kg);
        kg.connect(dest);
        scheduleOscRun(ket, st, tkg1 + 0.014);
      }
    }

    // Ceremonial ship's bell flourish on victory, or solitary mournful bell toll on defeat
    if (k.includes('vict') || k === 'win') {
      const bells = [86, 90, 93, 98]; // D6 - F#6 - A6 - D7
      for (let i = 0; i < bells.length; i++) {
        const bt = t0 + 0.66 + i * 0.075;
        const bell = ctx.createOscillator();
        bell.type = 'sine';
        setFreqAt(bell.frequency, midiToFreq(bells[i]), bt);
        const bg = ctx.createGain();
        const tb0 = setGainAt(bg.gain, SILENT_GAIN, bt);
        const tb1 = linearRampGain(bg.gain, 0.105, tb0 + 0.004);
        const tb2 = expRampGain(bg.gain, SILENT_GAIN, tb1 + 0.36);
        bell.connect(bg);
        bg.connect(dest);
        scheduleOscRun(bell, bt, tb2 + 0.014);
      }
    } else if (isSomber) {
      const bt = t0 + 0.78;
      const toll = ctx.createOscillator();
      toll.type = 'sine';
      setFreqAt(toll.frequency, midiToFreq(74), bt); // Solitary D5 ship's bell
      const partial = ctx.createOscillator();
      partial.type = 'triangle';
      setFreqAt(partial.frequency, midiToFreq(74) * 2.41, bt);
      const pg = ctx.createGain();
      pg.gain.value = 0.22;
      partial.connect(pg);

      const bg = ctx.createGain();
      const tb0 = setGainAt(bg.gain, SILENT_GAIN, bt);
      const tb1 = linearRampGain(bg.gain, 0.12, tb0 + 0.005);
      const tb2 = expRampGain(bg.gain, SILENT_GAIN, tb1 + 0.75);
      toll.connect(bg);
      pg.connect(bg);
      bg.connect(dest);
      scheduleOscRun(toll, bt, tb2 + 0.015);
      scheduleOscRun(partial, bt, tb2 + 0.015);
    }
  }

  return {
    start,
    stop,
    toggle,
    get isPlaying() {
      return isPlaying;
    },
    setModeMix,
    playBroadsideSfx,
    playImpactSfx,
    playVentSteamSfx,
    playCrewAssignSfx,
    playOverpressureSfx,
    playAlertSfx,
    playFanfareSfx,
    // Non-breaking telemetry helpers for HUD / QA harnesses
    getMixState,
    getBarAndBeat,
    getBeatPhase,
    getSpectrum
  };
}
