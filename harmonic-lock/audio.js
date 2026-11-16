/**
 * harmonic-lock/audio.js
 * Tape No. 09: HARMONIC LOCK (124 BPM)
 *
 * Self-contained 124 BPM Synesthetic Progressive Techno / Trance Web Audio Engine
 * (Rez / Area X Homage — Zero External MP3 Dependencies):
 * - Precision lookahead 16th-note step scheduler (124 BPM, 16 steps/bar, 16-bar harmonic cycle
 *   in C minor / C Dorian / Ab Lydian: Cm9 - Abmaj9(#11) - Fm11 - G7sus4 / G7(b9))
 * - Sub-millisecond beat phase (`getBeatPhase()`) & subdivision quantizer (`getSubdivisionInfo()`)
 * - 4-Area x 3-Evolution Progressive Stem & Filter Shimmer Architecture (`setLayerState()`):
 *   - Area 0 (PHOSPHOR LATTICE): Deep punchy 124 BPM 4/4 kick + metallic micro-hats + dark pulsing sub-bass
 *   - Area 1 (FOURIER CATHEDRAL): Warm stereo detuned minor-9th/maj9(#11) poly-pads + 16th stereo arpeggiator
 *   - Area 2 (SUBSPACE CONDUIT): Rolling offbeat trance sawtooth bassline + 909 clap/snare + supersaw lead
 *   - Area 3 (SINGULARITY CORE): Dramatic harmonic-minor brass/choir swells + polyrhythmic bell ostinato
 *   - Evolution Stages 1..3: Progressive filter cutoff opening, stereo delay bloom & octave harmonic shimmer
 * - Quantized Synesthetic Combat Instruments harmonized to the active bar's chord:
 *   - `playLockTick(0..7)`: Ascending crystal FM/harp harmonic extensions (slot 7 rings wide stereo bell!)
 *   - `playSalvoRelease(1..8)`: Next-16th quantized chord stab + upward arp (8 locks = MAX HARMONIC wash!)
 *   - `playTargetDetonation(0..7, kind)`: Quantized 909 clap/snare/tom + in-key marimba/bell chime
 *   - `playVulcanTap`, `playBarrelRollSfx`, `playDeflectSfx`, `playEvolutionSfx`, `playDamageSfx`,
 *     `playOverdriveSfx`, `playAreaTransitionSfx`, `playVictorySfx`
 */

const BPM = 124;
const BEAT_SEC = 60 / BPM;                         // ~0.4838709677s per quarter beat
const STEPS_PER_BEAT = 4;                          // 4 sixteenth-notes per beat
const BEATS_PER_BAR = 4;                           // 4/4 progressive techno/trance meter
const STEPS_PER_BAR = BEATS_PER_BAR * STEPS_PER_BEAT; // 16 steps per bar (~1.935483871s)
const STEP_SEC = BEAT_SEC / STEPS_PER_BEAT;        // ~0.1209677419s per 16th-note
const EIGHTH_SEC = STEP_SEC * 2;                   // ~0.2419354839s per 8th-note
const THIRTY_SECOND_SEC = STEP_SEC * 0.5;          // ~0.0604838710s per 32nd-note
const LOOP_BARS = 16;
const LOOP_STEPS = LOOP_BARS * STEPS_PER_BAR;      // 256 sixteenth-note steps per 16-bar cycle

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_VISIBLE_SEC = 0.15;
const LOOKAHEAD_HIDDEN_SEC = 1.2;
const MAX_CATCHUP_SEC = 320.0;

const LAYER_TAU_SEC = 0.20;
const SILENT_GAIN = 0.0001; // -80 dB floor: strictly positive for all exponential AudioParam ramps
const MASTER_LEVEL = 0.80;
const GROOVE_MICRO_SEC = 0.0035; // Subtle progressive techno pocket on off-16ths

// ============================================================================
// 16-BAR PROGRESSIVE TECHNO / TRANCE HARMONIC ARCHITECTURE
// Progression: Cm9 -> Abmaj9(#11) -> Fm11 -> G7sus4 / G7(b9) (with Dorian lift)
// ============================================================================

const CHORD_LIBRARY = {
  Cm9: {
    name: 'Cm9',
    subMidi: 24,        // C1 (~32.70 Hz) deep phosphor sub
    bassMidi: 36,       // C2 (~65.41 Hz) rolling trance bass root
    padVoicing: [48, 55, 58, 62, 63],    // C3, G3, Bb3, D4, Eb4
    choirVoicing: [60, 63, 67, 72, 74],  // C4, Eb4, G4, C5, D5
    stabVoicing: [60, 63, 67, 70, 74],   // C4, Eb4, G4, Bb4, D5
    arpPattern: [60, 63, 67, 74, 72, 67, 63, 70, 60, 67, 74, 75, 79, 74, 70, 67],
    bellOstinato: [72, 74, 75, 79, 82, 84],
    // 8-slot lock extensions: [root, 9th, b3, 5th, 7th, oct, oct+9th, oct+5th]
    lockScale: [72, 74, 75, 79, 82, 84, 86, 91] // C5, D5, Eb5, G5, Bb5, C6, D6, G6
  },
  Cm11_Dorian: {
    name: 'Cm9(Dorian)',
    subMidi: 24,        // C1
    bassMidi: 36,       // C2
    padVoicing: [48, 55, 57, 62, 63],    // C3, G3, A3 (Dorian 6th!), D4, Eb4
    choirVoicing: [60, 63, 69, 74, 79],  // C4, Eb4, A4, D5, G5
    stabVoicing: [60, 63, 67, 69, 74],   // C4, Eb4, G4, A4, D5
    arpPattern: [60, 63, 69, 74, 72, 69, 63, 67, 60, 69, 74, 75, 79, 74, 69, 67],
    bellOstinato: [72, 74, 75, 81, 79, 86],
    lockScale: [72, 74, 75, 79, 81, 84, 86, 91] // C5, D5, Eb5, G5, A5, C6, D6, G6
  },
  Abmaj9_11: {
    name: 'Abmaj9(#11)',
    subMidi: 32,        // Ab1 (~51.91 Hz) warm tectonic sub
    bassMidi: 32,       // Ab1 -> Ab2 octave bounce
    padVoicing: [44, 51, 55, 58, 62],    // Ab2, Eb3, G3, Bb3, D4 (#11 Lydian!)
    choirVoicing: [56, 60, 63, 67, 74],  // Ab3, C4, Eb4, G4, D5
    stabVoicing: [56, 63, 67, 70, 74],   // Ab3, Eb4, G4, Bb4, D5
    arpPattern: [56, 63, 67, 70, 74, 72, 67, 63, 56, 67, 70, 74, 79, 74, 72, 67],
    bellOstinato: [68, 70, 74, 75, 79, 80],
    // [root, 9th, 3rd, 5th, maj7, oct, oct+9th, oct+5th]
    lockScale: [68, 70, 72, 75, 79, 80, 82, 87] // Ab4, Bb4, C5, Eb5, G5, Ab5, Bb5, Eb6
  },
  Fm11: {
    name: 'Fm11',
    subMidi: 29,        // F1 (~43.65 Hz) deep resonance
    bassMidi: 29,       // F1 -> F2
    padVoicing: [41, 48, 51, 55, 58],    // F2, C3, Eb3, G3, Bb3 (11th)
    choirVoicing: [53, 56, 60, 67, 70],  // F3, Ab3, C4, G4, Bb4
    stabVoicing: [53, 60, 63, 67, 70],   // F3, C4, Eb4, G4, Bb4
    arpPattern: [65, 67, 68, 72, 75, 72, 68, 67, 65, 68, 72, 77, 79, 77, 72, 68],
    bellOstinato: [65, 67, 70, 72, 75, 77],
    // [root, 9th, b3, 5th, b7, oct, oct+9th, oct+5th]
    lockScale: [65, 67, 68, 72, 75, 77, 79, 84] // F4, G4, Ab4, C5, Eb5, F5, G5, C6
  },
  G7sus4: {
    name: 'G7sus4',
    subMidi: 31,        // G1 (~49.00 Hz)
    bassMidi: 31,       // G1 -> G2
    padVoicing: [43, 50, 53, 55, 60],    // G2, D3, F3, G3, C4
    choirVoicing: [55, 60, 62, 65, 72],  // G3, C4, D4, F4, C5
    stabVoicing: [55, 60, 62, 65, 69],   // G3, C4, D4, F4, A4
    arpPattern: [67, 72, 74, 77, 79, 77, 74, 72, 67, 69, 72, 74, 79, 77, 74, 72],
    bellOstinato: [67, 72, 74, 77, 79, 84],
    // [root, 9th, sus4, 5th, b7, oct, oct+9th, oct+5th]
    lockScale: [67, 69, 72, 74, 77, 79, 81, 86] // G4, A4, C5, D5, F5, G5, A5, D6
  },
  G7b9: {
    name: 'G7(b9)',
    subMidi: 31,        // G1 (~49.00 Hz)
    bassMidi: 31,       // G1 -> G2
    padVoicing: [43, 50, 53, 56, 59],    // G2, D3, F3, Ab3(b9), B3(3rd) harmonic-minor pull!
    choirVoicing: [55, 59, 62, 65, 68],  // G3, B3, D4, F4, Ab4
    stabVoicing: [55, 59, 62, 65, 68],   // G3, B3, D4, F4, Ab4
    arpPattern: [67, 68, 71, 74, 77, 74, 71, 68, 67, 71, 74, 77, 80, 77, 74, 71],
    bellOstinato: [67, 68, 71, 74, 77, 80],
    // [root, b9, 3rd, 5th, b7, oct, oct+b9, oct+5th]
    lockScale: [67, 68, 71, 74, 77, 79, 80, 86] // G4, Ab4, B4, D5, F5, G5, Ab5, D6
  }
};

// 16-bar harmonic cycle:
// Bars 0-3:   Cm9 -> Abmaj9(#11) -> Fm11 -> G7sus4
// Bars 4-7:   Cm9 -> Abmaj9(#11) -> Fm11 -> G7(b9)
// Bars 8-11:  Cm9(Dorian) -> Abmaj9(#11) -> Fm11 -> G7sus4
// Bars 12-15: Cm9 -> Abmaj9(#11) -> Fm11 -> G7(b9)
const BAR_CHORD_KEYS = [
  'Cm9',         'Abmaj9_11', 'Fm11', 'G7sus4',
  'Cm9',         'Abmaj9_11', 'Fm11', 'G7b9',
  'Cm11_Dorian', 'Abmaj9_11', 'Fm11', 'G7sus4',
  'Cm9',         'Abmaj9_11', 'Fm11', 'G7b9'
];

// Minimal metallic micro-hat patterns (16 steps/bar)
// 't' crisp tick, 'm' soft micro-pulse, 'O' offbeat open sizzle, '.' rest
const MICRO_HAT_PATTERNS = [
  'tmtmtOtmtmtOtmtm',
  'tmtmtOtmtmtOtOtO',
  'tmtmtOtmtmtOtmtm',
  'tmtmtOtmtOtOtOOO'
];

// Area 0 dark pulsing techno sub-bass triggers: [step, octaveLift, lenSteps, vel]
const SUB_BASS_STEPS = [
  [2, 0, 2, 0.94],
  [6, 0, 2, 0.90],
  [10, 0, 2, 0.94],
  [13, 12, 1, 0.72],
  [14, 0, 2, 0.88]
];

// Area 2 rolling offbeat trance sawtooth bassline across 16 steps (ducks 4/4 kick steps 0, 4, 8, 12)
// Entry: [octaveOffsetSemitones, velocity] or null on kick downbeats
const TRANCE_BASS_GRID = [
  null,       [0, 0.72],  [12, 0.96], [0, 0.80],
  null,       [0, 0.72],  [12, 0.96], [0, 0.82],
  null,       [0, 0.74],  [12, 0.96], [0, 0.80],
  null,       [0, 0.76],  [12, 0.98], [7, 0.86]
];

// Area 3 Singularity Boss polyrhythmic bell ostinato steps (3-against-4 progressive trance meter!)
const POLY_BELL_STEPS = [0, 3, 6, 9, 12, 14];

// 16-bar Soaring Supersaw Trance Lead Motif (Area 2+): [bar, step, midi, lenSteps, vel]
const SUPERSAW_LEAD_NOTES = [
  // Bars 0-3: Subspace Call
  [0, 0, 79, 3, 0.92], [0, 3, 77, 1, 0.82], [0, 4, 75, 4, 0.90], [0, 8, 74, 4, 0.88], [0, 12, 72, 2, 0.84], [0, 14, 75, 2, 0.88],
  [1, 0, 74, 4, 0.94], [1, 4, 75, 2, 0.86], [1, 6, 79, 6, 0.96], [1, 12, 77, 2, 0.86], [1, 14, 75, 2, 0.84],
  [2, 0, 72, 3, 0.90], [2, 3, 75, 3, 0.92], [2, 6, 77, 4, 0.94], [2, 10, 79, 3, 0.92], [2, 13, 82, 3, 0.95],
  [3, 0, 84, 4, 0.96], [3, 4, 82, 2, 0.88], [3, 6, 79, 4, 0.92], [3, 10, 77, 3, 0.88], [3, 13, 74, 3, 0.86],

  // Bars 4-7: Harmonic Response & G7(b9) Pull
  [4, 0, 79, 3, 0.94], [4, 3, 82, 3, 0.94], [4, 6, 84, 6, 0.98], [4, 12, 82, 2, 0.90], [4, 14, 79, 2, 0.88],
  [5, 0, 82, 3, 0.95], [5, 3, 79, 3, 0.90], [5, 6, 74, 6, 0.96], [5, 12, 75, 2, 0.88], [5, 14, 79, 2, 0.90],
  [6, 0, 80, 3, 0.94], [6, 3, 79, 3, 0.90], [6, 6, 77, 4, 0.92], [6, 10, 75, 2, 0.86], [6, 12, 77, 2, 0.88], [6, 14, 79, 2, 0.92],
  [7, 0, 80, 4, 0.96], [7, 4, 79, 2, 0.90], [7, 6, 77, 4, 0.92], [7, 10, 74, 3, 0.90], [7, 13, 71, 3, 0.95],

  // Bars 8-11: Dorian & Lydian Cathedral Horizon
  [8, 0, 84, 3, 0.96], [8, 3, 86, 3, 0.95], [8, 6, 81, 6, 0.98], [8, 12, 79, 2, 0.90], [8, 14, 81, 2, 0.92],
  [9, 0, 82, 3, 0.95], [9, 3, 84, 3, 0.96], [9, 6, 86, 6, 1.00], [9, 12, 84, 2, 0.92], [9, 14, 82, 2, 0.90],
  [10, 0, 84, 3, 0.96], [10, 3, 82, 3, 0.92], [10, 6, 79, 4, 0.94], [10, 10, 77, 4, 0.90], [10, 14, 79, 2, 0.92],
  [11, 0, 84, 3, 0.96], [11, 3, 86, 3, 0.96], [11, 6, 79, 6, 0.94], [11, 12, 81, 2, 0.92], [11, 14, 82, 2, 0.94],

  // Bars 12-15: Singularity Climax & Harmonic-Minor Turnaround
  [12, 0, 87, 4, 1.00], [12, 4, 86, 2, 0.94], [12, 6, 84, 4, 0.96], [12, 10, 79, 3, 0.92], [12, 13, 82, 3, 0.94],
  [13, 0, 86, 4, 0.98], [13, 4, 87, 2, 0.96], [13, 6, 84, 4, 0.95], [13, 10, 82, 3, 0.92], [13, 13, 79, 3, 0.90],
  [14, 0, 84, 3, 0.96], [14, 3, 82, 3, 0.94], [14, 6, 80, 4, 0.94], [14, 10, 79, 3, 0.92], [14, 13, 77, 3, 0.90],
  [15, 0, 79, 2, 0.94], [15, 2, 80, 2, 0.95], [15, 4, 83, 2, 0.96], [15, 6, 86, 2, 0.98], [15, 8, 89, 4, 1.00], [15, 12, 86, 2, 0.96], [15, 14, 83, 2, 0.96]
];

const LEAD_BY_BAR = Array.from({ length: LOOP_BARS }, () => []);
for (const entry of SUPERSAW_LEAD_NOTES) {
  LEAD_BY_BAR[entry[0]].push(entry);
}

// ============================================================================
// SAFE DSP & STRICTLY POSITIVE / MONOTONIC AUDIOPARAM HELPERS
// ============================================================================

function midiToFreq(midi, centsOffset = 0) {
  const safeMidi = Number.isFinite(midi) ? midi : 60;
  const safeCents = Number.isFinite(centsOffset) ? centsOffset : 0;
  return 440 * Math.pow(2, (safeMidi - 69 + safeCents / 100) / 12);
}

function clampFreq(f) {
  if (!Number.isFinite(f)) return 440;
  return Math.max(20, Math.min(18000, f));
}

function clampGain(g) {
  if (!Number.isFinite(g)) return SILENT_GAIN;
  return Math.max(SILENT_GAIN, Math.min(3.5, g));
}

function clampModDepth(d) {
  if (!Number.isFinite(d)) return SILENT_GAIN;
  return Math.max(SILENT_GAIN, Math.min(6000, d));
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

function createSeededNoise(seed = 12409) {
  let s = seed >>> 0;
  return function nextRand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

// ============================================================================
// MAIN HARMONIC LOCK SYNESTHETIC AUDIO ENGINE
// ============================================================================

export function createHarmonicAudio(options = {}) {
  let ctx = null;
  let isPlaying = false;

  // Progressive 4-Area (0..3) & 3-Evolution (1..3) layer state
  let currentAreaIndex = 0;
  let currentEvolutionStage = 1;

  // Transport & lookahead scheduler state
  let transportStartTime = 0;
  let nextStepTime = 0;
  let totalStepsScheduled = 0;
  let schedulerTimer = null;
  let lookaheadSec = LOOKAHEAD_VISIBLE_SEC;

  // Burst-safe micro-stagger counters for same-frame synesthetic voice clarity
  let vulcanCycleIndex = 0;
  let lastLockBurstClock = -1;
  let lockBurstOrdinal = 0;
  let duckActiveUntil = 0;

  // Audio graph buses & dynamic filter nodes
  let masterGain = null;
  let scoreDuckGain = null;
  let scoreShimmerFilter = null;
  let kickDrive = null;
  let sfxBus = null;
  let delayInput = null;
  let delayWetGain = null;
  let reverbInput = null;
  let analyser = null;
  let analyserRawBins = null;
  const spectrumBins = new Uint8Array(32);

  // 4 Area Stem GainNodes + Evolution Harmonic Shimmer Bus + Dynamic Stem Filters
  const stemGains = {
    area0: null,
    area1: null,
    area2: null,
    area3: null,
    shimmer: null
  };

  const stemFilters = {
    subBass: null,
    pad: null,
    arp: null,
    tranceBass: null,
    lead: null,
    bossChoir: null
  };

  // Shared deterministic noise & crystalline metallic transient buffers
  let noiseBuffer = null;
  let crystalNoiseBuffer = null;

  // WeakMap tracking the latest scheduled timestamp on every AudioParam to guarantee
  // strictly monotonic (`t_next > t_prev`) timestamps across lookahead steps & frozen-clock bursts.
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
    const t = monotonicTime(param, time, 0.00045);
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
    const t = monotonicTime(param, time, 0.00045);
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(f, t);
    } else if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(f, t);
    } else {
      param.value = f;
    }
    return t;
  }

  function targetFreqAt(param, freq, time, tau = LAYER_TAU_SEC) {
    if (!param) return time;
    const f = clampFreq(freq);
    const safeTau = Math.max(0.008, Number.isFinite(tau) ? tau : LAYER_TAU_SEC);
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
    const t = monotonicTime(param, time, 0.00045);
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
    const t = monotonicTime(param, time, 0.00045);
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(g, t);
    } else if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(g, t);
    } else {
      param.value = g;
    }
    return t;
  }

  function targetGainAt(param, gain, time, tau = LAYER_TAU_SEC) {
    if (!param) return time;
    const g = clampGain(gain);
    const safeTau = Math.max(0.008, Number.isFinite(tau) ? tau : LAYER_TAU_SEC);
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

  function setModDepthAt(param, depthHz, time) {
    if (!param) return time;
    const d = clampModDepth(depthHz);
    const t = monotonicTime(param, time, 0.00015);
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(d, t);
    } else {
      param.value = d;
    }
    return t;
  }

  function expRampModDepth(param, depthHz, time) {
    if (!param) return time;
    const d = clampModDepth(depthHz);
    const t = monotonicTime(param, time, 0.00045);
    if (typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(d, t);
    } else if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(d, t);
    } else {
      param.value = d;
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

  function safeConnectParam(node, audioParam) {
    if (!node || !audioParam) return false;
    try {
      node.connect(audioParam);
      return true;
    } catch (_) {
      return false;
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
    const dur = Math.max(0.012, Math.min(1.65, Number.isFinite(duration) ? duration : 0.08));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bufDur = Number(buffer.duration) > 0 ? Number(buffer.duration) : 2.0;
    const maxOffset = Math.max(0, bufDur - dur - 0.02);
    const offset = maxOffset > 0 ? (Math.abs(offsetSeed * 0.293) % maxOffset) : 0;
    src.start(tStart, offset);
    src.stop(tStart + dur);
    return src;
  }

  // ==========================================================================
  // AUDIO CONTEXT & SYNESTHETIC MASTER GRAPH INITIALIZATION
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

    // Master studio bus: masterGain -> 28Hz sub-clean highpass -> glue compressor -> brickwall limiter -> analyser -> destination
    masterGain = ctx.createGain();
    setGainAt(masterGain.gain, MASTER_LEVEL, now);

    let chainTail = masterGain;

    if (typeof ctx.createBiquadFilter === 'function') {
      const subCleanHp = ctx.createBiquadFilter();
      subCleanHp.type = 'highpass';
      setFreqAt(subCleanHp.frequency, 28, now);
      setFilterQ(subCleanHp, 0.707);
      chainTail.connect(subCleanHp);
      chainTail = subCleanHp;
    }

    if (typeof ctx.createDynamicsCompressor === 'function') {
      const glue = ctx.createDynamicsCompressor();
      if (glue.threshold) glue.threshold.value = -14;
      if (glue.knee) glue.knee.value = 10;
      if (glue.ratio) glue.ratio.value = 3.5;
      if (glue.attack) glue.attack.value = 0.006;
      if (glue.release) glue.release.value = 0.16;
      chainTail.connect(glue);
      chainTail = glue;

      const limiter = ctx.createDynamicsCompressor();
      if (limiter.threshold) limiter.threshold.value = -2.0;
      if (limiter.knee) limiter.knee.value = 0;
      if (limiter.ratio) limiter.ratio.value = 18;
      if (limiter.attack) limiter.attack.value = 0.001;
      if (limiter.release) limiter.release.value = 0.08;
      chainTail.connect(limiter);
      chainTail = limiter;
    }

    if (typeof ctx.createAnalyser === 'function') {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      const binCount = Number(analyser.frequencyBinCount) || 64;
      analyserRawBins = new Uint8Array(binCount);
      chainTail.connect(analyser);
      chainTail = analyser;
    }

    if (ctx.destination) {
      chainTail.connect(ctx.destination);
    }

    // Score Ducking & Global Evolution Shimmer Filter
    scoreDuckGain = ctx.createGain();
    setGainAt(scoreDuckGain.gain, 1.0, now);
    scoreDuckGain.connect(masterGain);

    scoreShimmerFilter = ctx.createBiquadFilter();
    scoreShimmerFilter.type = 'lowpass';
    setFreqAt(scoreShimmerFilter.frequency, 15200, now);
    setFilterQ(scoreShimmerFilter, 0.82);
    scoreShimmerFilter.connect(scoreDuckGain);

    // 4 Progressive Area Stem GainNodes + Evolution Harmonic Shimmer Bus
    stemGains.area0 = ctx.createGain();
    stemGains.area1 = ctx.createGain();
    stemGains.area2 = ctx.createGain();
    stemGains.area3 = ctx.createGain();
    stemGains.shimmer = ctx.createGain();

    setGainAt(stemGains.area0.gain, SILENT_GAIN, now);
    setGainAt(stemGains.area1.gain, SILENT_GAIN, now);
    setGainAt(stemGains.area2.gain, SILENT_GAIN, now);
    setGainAt(stemGains.area3.gain, SILENT_GAIN, now);
    setGainAt(stemGains.shimmer.gain, SILENT_GAIN, now);

    // Kick & Area 0 percussion punch straight into scoreDuckGain, tonal stems through scoreShimmerFilter
    stemGains.area0.connect(scoreDuckGain);
    stemGains.area1.connect(scoreShimmerFilter);
    stemGains.area2.connect(scoreShimmerFilter);
    stemGains.area3.connect(scoreShimmerFilter);
    stemGains.shimmer.connect(scoreShimmerFilter);

    // Analog soft-clip drive on the 124 BPM 4/4 kick & sub-bass
    if (typeof ctx.createWaveShaper === 'function') {
      kickDrive = ctx.createWaveShaper();
      kickDrive.curve = makeSoftClipCurve(1.95);
      kickDrive.oversample = '2x';
      kickDrive.connect(stemGains.area0);
    } else {
      kickDrive = stemGains.area0;
    }

    // Dedicated continuous stem filters whose cutoffs morph across Areas 0..3 & Evolution Stages 1..3
    stemFilters.subBass = ctx.createBiquadFilter();
    stemFilters.subBass.type = 'lowpass';
    setFreqAt(stemFilters.subBass.frequency, 240, now);
    setFilterQ(stemFilters.subBass, 2.2);
    stemFilters.subBass.connect(kickDrive);

    stemFilters.pad = ctx.createBiquadFilter();
    stemFilters.pad.type = 'lowpass';
    setFreqAt(stemFilters.pad.frequency, 2400, now);
    setFilterQ(stemFilters.pad, 1.35);
    stemFilters.pad.connect(stemGains.area1);

    stemFilters.arp = ctx.createBiquadFilter();
    stemFilters.arp.type = 'lowpass';
    setFreqAt(stemFilters.arp.frequency, 4400, now);
    setFilterQ(stemFilters.arp, 1.75);
    stemFilters.arp.connect(stemGains.area1);

    stemFilters.tranceBass = ctx.createBiquadFilter();
    stemFilters.tranceBass.type = 'lowpass';
    setFreqAt(stemFilters.tranceBass.frequency, 920, now);
    setFilterQ(stemFilters.tranceBass, 3.1);
    stemFilters.tranceBass.connect(stemGains.area2);

    stemFilters.lead = ctx.createBiquadFilter();
    stemFilters.lead.type = 'lowpass';
    setFreqAt(stemFilters.lead.frequency, 5200, now);
    setFilterQ(stemFilters.lead, 1.6);
    stemFilters.lead.connect(stemGains.area2);

    stemFilters.bossChoir = ctx.createBiquadFilter();
    stemFilters.bossChoir.type = 'lowpass';
    setFreqAt(stemFilters.bossChoir.frequency, 3800, now);
    setFilterQ(stemFilters.bossChoir, 1.45);
    stemFilters.bossChoir.connect(stemGains.area3);

    // Synesthetic Combat Instrument Bus (clear headroom right into masterGain)
    sfxBus = ctx.createGain();
    setGainAt(sfxBus.gain, 0.95, now);
    sfxBus.connect(masterGain);

    // Tempo-Synced Dotted-16th / Dotted-8th Stereo Trance Ping-Pong Delay (`3 * STEP_SEC` ~0.363s)
    if (typeof ctx.createDelay === 'function' && typeof ctx.createBiquadFilter === 'function') {
      delayInput = ctx.createGain();
      delayInput.gain.value = 1.0;

      const dlyL = ctx.createDelay(2.0);
      const dlyR = ctx.createDelay(2.0);
      if (dlyL.delayTime && typeof dlyL.delayTime === 'object') {
        dlyL.delayTime.value = STEP_SEC * 3; // Dotted 8th (~0.3629s at 124 BPM)
      }
      if (dlyR.delayTime && typeof dlyR.delayTime === 'object') {
        dlyR.delayTime.value = STEP_SEC * 2; // Synced 8th (~0.2419s) for wide stereo bounce
      }

      const dlyHp = ctx.createBiquadFilter();
      dlyHp.type = 'highpass';
      setFreqAt(dlyHp.frequency, 420, now);

      const dlyLp = ctx.createBiquadFilter();
      dlyLp.type = 'lowpass';
      setFreqAt(dlyLp.frequency, 4800, now);

      const fb = ctx.createGain();
      fb.gain.value = 0.34;

      delayWetGain = ctx.createGain();
      setGainAt(delayWetGain.gain, 0.32, now);

      const panL = createStereoPan(-0.55);
      const panR = createStereoPan(0.55);

      delayInput.connect(dlyL);
      dlyL.connect(dlyHp);
      dlyHp.connect(dlyLp);
      dlyLp.connect(panL);
      panL.connect(delayWetGain);

      dlyLp.connect(dlyR);
      dlyR.connect(panR);
      panR.connect(delayWetGain);
      dlyR.connect(fb);
      fb.connect(dlyL);

      delayWetGain.connect(masterGain);
    }

    // Luminous Fourier Cathedral Reverb Impulse (1.65s stereo shimmer tail)
    if (typeof ctx.createConvolver === 'function' && typeof ctx.createBuffer === 'function') {
      try {
        const revLen = Math.floor(sampleRate * 1.65);
        const impulse = ctx.createBuffer(2, revLen, sampleRate);
        const rand = createSeededNoise(90124);
        for (let ch = 0; ch < 2; ch++) {
          const data = impulse.getChannelData(ch);
          let lp = 0;
          for (let i = 0; i < revLen; i++) {
            const prog = i / revLen;
            lp += (rand() - lp) * (0.64 - 0.36 * prog);
            data[i] = lp * Math.pow(1 - prog, 2.35);
          }
        }
        const convolver = ctx.createConvolver();
        convolver.buffer = impulse;
        reverbInput = ctx.createGain();
        reverbInput.gain.value = 0.30;
        reverbInput.connect(convolver);
        convolver.connect(masterGain);
      } catch (_) {
        reverbInput = null;
      }
    }

    // Shared procedural white-noise & crystalline high-frequency transient buffers
    if (typeof ctx.createBuffer === 'function') {
      const rand = createSeededNoise(12488);

      const noiseLen = Math.floor(sampleRate * 1.8);
      noiseBuffer = ctx.createBuffer(1, noiseLen, sampleRate);
      const nData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        nData[i] = rand();
      }

      const crysLen = Math.floor(sampleRate * 1.2);
      crystalNoiseBuffer = ctx.createBuffer(1, crysLen, sampleRate);
      const cData = crystalNoiseBuffer.getChannelData(0);
      let prev = 0;
      for (let i = 0; i < crysLen; i++) {
        const cur = rand();
        // Differentiated high-frequency metallic air + micro-glint impulses
        const glint = Math.abs(cur) > 0.965 ? cur * 0.95 : 0;
        cData[i] = (cur - prev) * 0.48 + glint;
        prev = cur;
      }
    }

    return ctx;
  }

  // ==========================================================================
  // 4-AREA x 3-EVOLUTION LAYER CROSSFADING & SHIMMER MORPHING
  // ==========================================================================

  function applyLayerStateToAudio(nowSec) {
    if (!ctx || !stemGains.area0) return;

    if (!isPlaying) {
      targetGainAt(stemGains.area0.gain, SILENT_GAIN, nowSec, 0.06);
      targetGainAt(stemGains.area1.gain, SILENT_GAIN, nowSec, 0.06);
      targetGainAt(stemGains.area2.gain, SILENT_GAIN, nowSec, 0.06);
      targetGainAt(stemGains.area3.gain, SILENT_GAIN, nowSec, 0.06);
      targetGainAt(stemGains.shimmer.gain, SILENT_GAIN, nowSec, 0.06);
      return;
    }

    const area = currentAreaIndex;           // 0..3
    const evoNorm = (currentEvolutionStage - 1) * 0.5; // 0.0, 0.5, 1.0

    // Smooth progressive stem gain levels across Areas 0 -> 3
    const gArea0 = 0.92 + 0.04 * area;
    const gArea1 = area >= 1 ? (0.82 + 0.06 * Math.min(2, area - 1) + 0.06 * evoNorm) : SILENT_GAIN;
    const gArea2 = area >= 2 ? (0.86 + 0.07 * (area - 2) + 0.07 * evoNorm) : SILENT_GAIN;
    const gArea3 = area >= 3 ? (0.90 + 0.10 * evoNorm) : SILENT_GAIN;

    // Evolution Stages 2 & 3 unlock bright octave harmonics & seraphic air shimmer!
    const gShimmer = currentEvolutionStage === 1
      ? SILENT_GAIN
      : (currentEvolutionStage === 2 ? 0.46 + 0.08 * area : 0.88 + 0.06 * area);

    targetGainAt(stemGains.area0.gain, gArea0, nowSec, LAYER_TAU_SEC);
    targetGainAt(stemGains.area1.gain, gArea1, nowSec, LAYER_TAU_SEC);
    targetGainAt(stemGains.area2.gain, gArea2, nowSec, LAYER_TAU_SEC);
    targetGainAt(stemGains.area3.gain, gArea3, nowSec, LAYER_TAU_SEC);
    targetGainAt(stemGains.shimmer.gain, gShimmer, nowSec, LAYER_TAU_SEC);

    // Morph continuous filter cutoffs by both Area progression and Evolution Stage
    if (scoreShimmerFilter) {
      const globalCut = 8600 + area * 1400 + evoNorm * 5800;
      targetFreqAt(scoreShimmerFilter.frequency, globalCut, nowSec, LAYER_TAU_SEC);
    }
    if (stemFilters.subBass) {
      targetFreqAt(stemFilters.subBass.frequency, 185 + area * 32 + evoNorm * 85, nowSec, LAYER_TAU_SEC);
    }
    if (stemFilters.pad) {
      targetFreqAt(stemFilters.pad.frequency, 1750 + area * 580 + evoNorm * 3400, nowSec, LAYER_TAU_SEC);
    }
    if (stemFilters.arp) {
      targetFreqAt(stemFilters.arp.frequency, 3200 + area * 950 + evoNorm * 5800, nowSec, LAYER_TAU_SEC);
    }
    if (stemFilters.tranceBass) {
      targetFreqAt(stemFilters.tranceBass.frequency, 680 + area * 220 + evoNorm * 780, nowSec, LAYER_TAU_SEC);
    }
    if (stemFilters.lead) {
      targetFreqAt(stemFilters.lead.frequency, 3900 + area * 900 + evoNorm * 6400, nowSec, LAYER_TAU_SEC);
    }
    if (stemFilters.bossChoir) {
      targetFreqAt(stemFilters.bossChoir.frequency, 2900 + evoNorm * 4600, nowSec, LAYER_TAU_SEC);
    }
    if (delayWetGain) {
      targetGainAt(delayWetGain.gain, 0.24 + 0.04 * area + 0.14 * evoNorm, nowSec, LAYER_TAU_SEC);
    }
  }

  function duckScoreBriefly(startTime, dipGain = 0.56, releaseSec = 0.42) {
    if (!ctx || !scoreDuckGain || !isPlaying) return;
    if (startTime < duckActiveUntil - 0.04) return;
    const t0 = setGainAt(scoreDuckGain.gain, dipGain, startTime);
    const t1 = expRampGain(scoreDuckGain.gain, 1.0, t0 + releaseSec);
    duckActiveUntil = t1;
  }

  // ==========================================================================
  // HARMONY & QUANTIZATION HELPERS
  // ==========================================================================

  function getChordForBar(barIndex) {
    const safeBar = ((Math.floor(barIndex) % LOOP_BARS) + LOOP_BARS) % LOOP_BARS;
    const key = BAR_CHORD_KEYS[safeBar] || 'Cm9';
    return CHORD_LIBRARY[key] || CHORD_LIBRARY.Cm9;
  }

  function getChordAtTime(audioTimeSec) {
    if (!isPlaying || !ctx) {
      return CHORD_LIBRARY.Cm9;
    }
    const elapsed = Math.max(0, audioTimeSec - transportStartTime);
    const barIndex = Math.floor(elapsed / (STEPS_PER_BAR * STEP_SEC));
    return getChordForBar(barIndex);
  }

  function quantizeToGrid(nowSec, gridSec, maxDelaySec = gridSec) {
    if (!isPlaying || !ctx) return nowSec;
    const elapsed = Math.max(0, nowSec - transportStartTime);
    const gridPos = elapsed / gridSec;
    const frac = gridPos - Math.floor(gridPos);
    if (frac < 0.04) return nowSec;
    const wait = (1 - frac) * gridSec;
    return nowSec + Math.min(maxDelaySec, wait);
  }

  function quantizeNext16th(nowSec) {
    if (!isPlaying || !ctx) return nowSec + 0.015;
    const elapsed = Math.max(0, nowSec - transportStartTime);
    const nextIdx = Math.ceil(elapsed / STEP_SEC);
    let target = transportStartTime + nextIdx * STEP_SEC;
    if (target - nowSec < 0.006) {
      target += STEP_SEC;
    }
    return Math.max(nowSec + 0.004, target);
  }

  // ==========================================================================
  // PROGRESSIVE TECHNO / TRANCE SCORE SYNTHESIS VOICES
  // ==========================================================================

  // Area 0.a — Deep Punchy 124 BPM 4/4 Techno Kick
  function triggerTechnoKick(time, isAccent = true) {
    const body = ctx.createOscillator();
    body.type = 'sine';
    const t0 = setFreqAt(body.frequency, isAccent ? 162 : 142, time);
    const t1 = expRampFreq(body.frequency, 52, t0 + 0.042);
    expRampFreq(body.frequency, 32.70, t1 + 0.22); // Locks to C1 fundamental!

    const amp = ctx.createGain();
    const peak = isAccent ? 0.56 : 0.36;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.003);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.28);

    body.connect(amp);
    amp.connect(kickDrive);
    scheduleOscRun(body, time, ta2 + 0.012);

    // Crisp analog beater click transient
    const click = ctx.createOscillator();
    click.type = 'triangle';
    const tc0 = setFreqAt(click.frequency, 1650, time);
    expRampFreq(click.frequency, 180, tc0 + 0.016);

    const cAmp = ctx.createGain();
    const tca0 = setGainAt(cAmp.gain, isAccent ? 0.14 : 0.08, time);
    const tca1 = expRampGain(cAmp.gain, SILENT_GAIN, tca0 + 0.018);

    click.connect(cAmp);
    cAmp.connect(stemGains.area0);
    scheduleOscRun(click, time, tca1 + 0.008);
  }

  // Area 0.b — Minimal Metallic Micro-Hats (+ Evolution Sizzle)
  function triggerMicroHat(code, stepInBar, time) {
    if (code === '.') return;
    const isOpen = code === 'O';
    const isSoft = code === 'm';
    const evoBoost = (currentEvolutionStage - 1) * 0.18;

    const dur = isOpen ? (0.14 + evoBoost * 0.10) : (isSoft ? 0.032 : 0.048);
    const src = spawnBufferBurst(crystalNoiseBuffer || noiseBuffer, time, dur + 0.015, stepInBar * 13 + 5);
    if (!src) return;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    setFreqAt(hp.frequency, isOpen ? 6400 : 7800, time);
    setFilterQ(hp, 1.3);

    const amp = ctx.createGain();
    const baseGain = isOpen ? 0.105 : (isSoft ? 0.038 : 0.068);
    const ta0 = setGainAt(amp.gain, baseGain * (1 + evoBoost), time);
    expRampGain(amp.gain, SILENT_GAIN, ta0 + dur);

    const pan = createStereoPan(((stepInBar % 4) - 1.5) * 0.18);
    src.connect(hp);
    hp.connect(amp);
    amp.connect(pan);
    pan.connect(stemGains.area0);
  }

  // Area 0.c — Dark Pulsing Techno Sub-Bass (C1 / Ab1 / F1 / G1)
  function triggerDarkSubBass(midi, time, duration, velocity) {
    const freq = midiToFreq(midi);
    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    setFreqAt(sub.frequency, freq, time);

    const harmonic = ctx.createOscillator();
    harmonic.type = 'sawtooth';
    setFreqAt(harmonic.frequency, freq * 2, time);
    const hGain = ctx.createGain();
    hGain.gain.value = 0.28;
    harmonic.connect(hGain);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, 0.24 * velocity, ta0 + 0.014);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + duration);

    sub.connect(amp);
    hGain.connect(amp);
    amp.connect(stemFilters.subBass);

    scheduleOscRun(sub, time, ta2 + 0.012);
    scheduleOscRun(harmonic, time, ta2 + 0.012);
  }

  // Area 1.a — Warm Stereo Detuned Minor-9th / Maj9(#11) Poly-Synth Pads
  function triggerCathedralPad(voicing, time, duration) {
    const env = ctx.createGain();
    const ta0 = setGainAt(env.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(env.gain, 0.068, ta0 + duration * 0.28);
    const ta2 = expRampGain(env.gain, SILENT_GAIN, ta1 + duration * 0.76);

    env.connect(stemFilters.pad);

    if (reverbInput) {
      const rev = ctx.createGain();
      rev.gain.value = 0.36;
      env.connect(rev);
      rev.connect(reverbInput);
    }

    const stopAt = ta2 + 0.025;
    for (let i = 0; i < voicing.length; i++) {
      const panPos = voicing.length > 1 ? -0.52 + (1.04 * i) / (voicing.length - 1) : 0;
      const voicePan = createStereoPan(panPos);
      voicePan.connect(env);

      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      setFreqAt(oscA.frequency, midiToFreq(voicing[i], -9), time);

      const oscB = ctx.createOscillator();
      oscB.type = i % 2 === 0 ? 'triangle' : 'sawtooth';
      setFreqAt(oscB.frequency, midiToFreq(voicing[i], 9), time);

      oscA.connect(voicePan);
      oscB.connect(voicePan);
      scheduleOscRun(oscA, time, stopAt);
      scheduleOscRun(oscB, time, stopAt);
    }
  }

  // Area 1.b — Crystalline 16th-Note Stereo Arpeggiator (+ Evolution Shimmer Octave)
  function triggerCrystalArp(midi, stepInBar, time) {
    const freq = midiToFreq(midi);
    const isAccent = stepInBar % 4 === 0 || stepInBar % 4 === 3;
    const dur = STEP_SEC * 0.88;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    setFreqAt(osc.frequency, freq, time);

    const glass = ctx.createOscillator();
    glass.type = 'sine';
    setFreqAt(glass.frequency, clampFreq(freq * 2.0), time);
    const gMix = ctx.createGain();
    gMix.gain.value = 0.32;
    glass.connect(gMix);

    const amp = ctx.createGain();
    const peak = isAccent ? 0.088 : 0.062;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.005);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + dur);

    const pan = createStereoPan((stepInBar % 2 === 0 ? -1 : 1) * (0.28 + (stepInBar % 4) * 0.09));
    osc.connect(amp);
    gMix.connect(amp);
    amp.connect(pan);
    pan.connect(stemFilters.arp);

    if (delayInput && stepInBar % 2 === 0) {
      const send = ctx.createGain();
      send.gain.value = 0.26;
      amp.connect(send);
      send.connect(delayInput);
    }

    // Feed +1 octave harmonic sparkle into Evolution Shimmer bus
    const shimOsc = ctx.createOscillator();
    shimOsc.type = 'sine';
    setFreqAt(shimOsc.frequency, clampFreq(freq * 2.0), time);
    const shimAmp = ctx.createGain();
    const ts0 = setGainAt(shimAmp.gain, SILENT_GAIN, time);
    const ts1 = linearRampGain(shimAmp.gain, peak * 0.52, ts0 + 0.004);
    const ts2 = expRampGain(shimAmp.gain, SILENT_GAIN, ts1 + dur * 0.9);
    shimOsc.connect(shimAmp);
    shimAmp.connect(stemGains.shimmer);

    const stopAt = Math.max(ta2, ts2) + 0.012;
    scheduleOscRun(osc, time, stopAt);
    scheduleOscRun(glass, time, stopAt);
    scheduleOscRun(shimOsc, time, stopAt);
  }

  // Area 2.a — Rolling Offbeat Trance Sawtooth Bassline
  function triggerRollingTranceBass(midi, time, velocity) {
    const freq = midiToFreq(midi);
    const dur = STEP_SEC * 0.84;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    setFilterQ(filter, 3.2);
    const tf0 = setFreqAt(filter.frequency, clampFreq(freq * 9.5), time);
    expRampFreq(filter.frequency, clampFreq(freq * 2.2), tf0 + dur);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, 0.145 * velocity, ta0 + 0.005);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + dur);

    filter.connect(amp);
    amp.connect(stemFilters.tranceBass);

    const stopAt = ta2 + 0.010;
    for (const cents of [-7, 7]) {
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      setFreqAt(saw.frequency, midiToFreq(midi, cents), time);
      saw.connect(filter);
      scheduleOscRun(saw, time, stopAt);
    }
  }

  // Area 2.b — Crisp TR-909 Snare / Clap Backbeat
  function triggerTranceClapSnare(time, velocity = 0.9) {
    // 909 snappy body
    const body = ctx.createOscillator();
    body.type = 'triangle';
    const tb0 = setFreqAt(body.frequency, 225, time);
    expRampFreq(body.frequency, 108, tb0 + 0.065);

    const bAmp = ctx.createGain();
    const tba0 = setGainAt(bAmp.gain, 0.14 * velocity, time);
    const tba1 = expRampGain(bAmp.gain, SILENT_GAIN, tba0 + 0.085);
    body.connect(bAmp);
    bAmp.connect(stemGains.area2);
    scheduleOscRun(body, time, tba1 + 0.01);

    // Layered 909 stereo bandpass clap crack
    const clap = spawnBufferBurst(noiseBuffer, time, 0.15, Math.round(time * 97));
    if (clap) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setFreqAt(bp.frequency, 1280, time);
      setFilterQ(bp, 1.85);

      const cAmp = ctx.createGain();
      const tc0 = setGainAt(cAmp.gain, 0.15 * velocity, time);
      const tc1 = expRampGain(cAmp.gain, 0.04 * velocity, tc0 + 0.018);
      const tc2 = linearRampGain(cAmp.gain, 0.12 * velocity, tc1 + 0.008);
      expRampGain(cAmp.gain, SILENT_GAIN, tc2 + 0.11);

      clap.connect(bp);
      bp.connect(cAmp);
      cAmp.connect(stemGains.area2);

      if (reverbInput) {
        const rev = ctx.createGain();
        rev.gain.value = 0.22;
        cAmp.connect(rev);
        rev.connect(reverbInput);
      }
    }
  }

  // Area 2.c — Soaring 3-Voice Stereo Detuned Supersaw Lead Motif
  function triggerSupersawLead(midi, time, duration, velocity) {
    const amp = ctx.createGain();
    const peak = 0.086 * velocity;
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.014);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + duration);

    amp.connect(stemFilters.lead);

    if (delayInput) {
      const send = ctx.createGain();
      send.gain.value = 0.34;
      amp.connect(send);
      send.connect(delayInput);
    }
    if (reverbInput) {
      const rev = ctx.createGain();
      rev.gain.value = 0.26;
      amp.connect(rev);
      rev.connect(reverbInput);
    }

    const stopAt = ta2 + 0.018;
    const detunes = [-15, 0, 15];
    const pans = [-0.42, 0, 0.42];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      setFreqAt(osc.frequency, midiToFreq(midi, detunes[i]), time);
      const pan = createStereoPan(pans[i]);
      osc.connect(pan);
      pan.connect(amp);
      scheduleOscRun(osc, time, stopAt);
    }

    // Evolution Stage 2/3 radiant upper-octave harmonic lead layer
    const oct = ctx.createOscillator();
    oct.type = 'sawtooth';
    setFreqAt(oct.frequency, midiToFreq(midi + 12, 4), time);
    const octAmp = ctx.createGain();
    const to0 = setGainAt(octAmp.gain, SILENT_GAIN, time);
    const to1 = linearRampGain(octAmp.gain, peak * 0.55, to0 + 0.014);
    const to2 = expRampGain(octAmp.gain, SILENT_GAIN, to1 + duration);
    oct.connect(octAmp);
    octAmp.connect(stemGains.shimmer);
    scheduleOscRun(oct, time, to2 + 0.016);
  }

  // Area 3.a — Dramatic Harmonic-Minor Brass & Formant Choir Swell (Boss Climax)
  function triggerSingularityChoirBrass(voicing, time, duration) {
    // Dual formant bandpass + warm brass lowpass parallel blend
    const brassLp = ctx.createBiquadFilter();
    brassLp.type = 'lowpass';
    setFilterQ(brassLp, 1.8);
    const tf0 = setFreqAt(brassLp.frequency, 460, time);
    const tf1 = expRampFreq(brassLp.frequency, 3600, tf0 + duration * 0.38);
    expRampFreq(brassLp.frequency, 1100, tf1 + duration * 0.62);

    const choirFormant = ctx.createBiquadFilter();
    choirFormant.type = 'bandpass';
    setFreqAt(choirFormant.frequency, 920, time); // 'Ah' cathedral choir formant
    setFilterQ(choirFormant, 2.6);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, 0.076, ta0 + duration * 0.25);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + duration * 0.78);

    brassLp.connect(amp);
    choirFormant.connect(amp);
    amp.connect(stemFilters.bossChoir);

    if (reverbInput) {
      const rev = ctx.createGain();
      rev.gain.value = 0.44;
      amp.connect(rev);
      rev.connect(reverbInput);
    }

    const stopAt = ta2 + 0.022;
    for (let i = 0; i < voicing.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      setFreqAt(osc.frequency, midiToFreq(voicing[i], i % 2 === 0 ? -8 : 8), time);
      osc.connect(brassLp);
      osc.connect(choirFormant);
      scheduleOscRun(osc, time, stopAt);
    }
  }

  // Area 3.b — Polyrhythmic Crystalline Bell Ostinato (SERAPH-IX Boss)
  function triggerPolyrhythmicBell(midi, polyIndex, time) {
    const freq = midiToFreq(midi);
    const dur = STEP_SEC * 2.1;

    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    setFreqAt(carrier.frequency, freq, time);

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    setFreqAt(mod.frequency, clampFreq(freq * 3.0), time);
    const modGain = ctx.createGain();
    const tm0 = setModDepthAt(modGain.gain, freq * 1.15, time);
    expRampModDepth(modGain.gain, SILENT_GAIN, tm0 + 0.065);
    mod.connect(modGain);
    safeConnectParam(modGain, carrier.frequency);

    const shimmerPartial = ctx.createOscillator();
    shimmerPartial.type = 'triangle';
    setFreqAt(shimmerPartial.frequency, clampFreq(freq * 2.0), time);
    const spGain = ctx.createGain();
    spGain.gain.value = 0.26;
    shimmerPartial.connect(spGain);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, time);
    const ta1 = linearRampGain(amp.gain, 0.072, ta0 + 0.003);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + dur);

    const pan = createStereoPan(polyIndex % 2 === 0 ? -0.48 : 0.48);
    carrier.connect(amp);
    spGain.connect(amp);
    amp.connect(pan);
    pan.connect(stemGains.area3);

    if (delayInput && polyIndex % 2 === 1) {
      const send = ctx.createGain();
      send.gain.value = 0.28;
      amp.connect(send);
      send.connect(delayInput);
    }

    const stopAt = ta2 + 0.014;
    scheduleOscRun(carrier, time, stopAt);
    scheduleOscRun(mod, time, stopAt);
    scheduleOscRun(shimmerPartial, time, stopAt);
  }

  // ==========================================================================
  // 124 BPM 16TH-NOTE STEP SEQUENCER & LOOKAHEAD SCHEDULER
  // ==========================================================================

  function scheduleStep(stepCounter, stepBaseTime) {
    const loopStep = ((stepCounter % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
    const barInLoop = Math.floor(loopStep / STEPS_PER_BAR);
    const stepInBar = loopStep % STEPS_PER_BAR;
    const chord = getChordForBar(barInLoop);

    const grooveOffset = stepInBar % 2 === 1 ? GROOVE_MICRO_SEC : 0;
    const t = stepBaseTime + grooveOffset;

    // --- AREA 0: PHOSPHOR LATTICE (4/4 Kick + Metallic Micro-Hats + Dark Sub-Bass) ---
    if (stepInBar % 4 === 0) {
      triggerTechnoKick(stepBaseTime, stepInBar === 0 || stepInBar === 8);
    } else if (barInLoop % 4 === 3 && stepInBar === 14) {
      // Subtle 4-bar techno pickup ghost kick
      triggerTechnoKick(t, false);
    }

    const hatPattern = MICRO_HAT_PATTERNS[barInLoop % 4];
    triggerMicroHat(hatPattern[stepInBar], stepInBar, t);

    for (let i = 0; i < SUB_BASS_STEPS.length; i++) {
      const sb = SUB_BASS_STEPS[i];
      if (sb[0] === stepInBar) {
        triggerDarkSubBass(chord.subMidi + sb[1], t, sb[2] * STEP_SEC * 0.92, sb[3]);
      }
    }

    // --- AREA 1: FOURIER CATHEDRAL (Minor-9th/Maj9 Pads + 16th Stereo Arpeggiator) ---
    if (stepInBar === 0) {
      triggerCathedralPad(chord.padVoicing, stepBaseTime, STEPS_PER_BAR * STEP_SEC * 0.98);
    }
    triggerCrystalArp(chord.arpPattern[stepInBar], stepInBar, t);

    // --- AREA 2: SUBSPACE CONDUIT (Rolling Trance Bass + 909 Clap/Snare + Supersaw Lead) ---
    const tranceCell = TRANCE_BASS_GRID[stepInBar];
    if (tranceCell) {
      triggerRollingTranceBass(chord.bassMidi + tranceCell[0], t, tranceCell[1]);
    }

    if (stepInBar === 4 || stepInBar === 12) {
      triggerTranceClapSnare(stepBaseTime, 0.94);
    } else if (barInLoop % 4 === 3 && stepInBar >= 13) {
      // 4-bar progressive trance snare build into the next chord change!
      triggerTranceClapSnare(t, 0.44 + (stepInBar - 13) * 0.16);
    }

    const barLeadNotes = LEAD_BY_BAR[barInLoop];
    for (let i = 0; i < barLeadNotes.length; i++) {
      const note = barLeadNotes[i];
      if (note[1] === stepInBar) {
        triggerSupersawLead(note[2], t, note[3] * STEP_SEC * 0.92, note[4]);
      }
    }

    // --- AREA 3: SINGULARITY CORE (Harmonic-Minor Choir/Brass Swells + Polyrhythmic Bells) ---
    if (stepInBar === 0 || (stepInBar === 8 && barInLoop % 4 === 3)) {
      const swellDur = (stepInBar === 0 ? 14 : 8) * STEP_SEC;
      triggerSingularityChoirBrass(chord.choirVoicing, stepBaseTime, swellDur);
    }

    const polyIdx = POLY_BELL_STEPS.indexOf(stepInBar);
    if (polyIdx !== -1) {
      const bellMidi = chord.bellOstinato[polyIdx % chord.bellOstinato.length];
      triggerPolyrhythmicBell(bellMidi, polyIdx, t);
    }
  }

  function schedulerTick() {
    if (!isPlaying || !ctx) return;

    const now = Math.max(0, Number(ctx.currentTime) || 0);

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
  // PUBLIC TRANSPORT, CLOCK & LAYER TELEMETRY API
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
    duckActiveUntil = now;

    if (masterGain) {
      targetGainAt(masterGain.gain, MASTER_LEVEL, now, 0.05);
    }
    if (scoreDuckGain) {
      targetGainAt(scoreDuckGain.gain, 1.0, now, 0.05);
    }

    applyLayerStateToAudio(now);
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
      applyLayerStateToAudio(now);
    }
    return false;
  }

  function toggle() {
    return isPlaying ? stop() : start();
  }

  function getBeatPhase() {
    if (!isPlaying || !ctx) return 0;
    schedulerTick();
    const elapsed = Math.max(0, (Number(ctx.currentTime) || 0) - transportStartTime);
    const beats = elapsed / BEAT_SEC;
    const phase = beats - Math.floor(beats);
    return phase >= 0 && phase < 1 ? phase : 0;
  }

  function getSubdivisionInfo() {
    if (!isPlaying || !ctx) {
      return {
        bar: 0,
        beat: 0,
        step16: 0,
        bpm: BPM,
        next16thDelaySec: STEP_SEC * 0.5,
        next8thDelaySec: EIGHTH_SEC * 0.5,
        isPlaying: false
      };
    }

    schedulerTick();
    const now = Math.max(0, Number(ctx.currentTime) || 0);
    const elapsed = Math.max(0, now - transportStartTime);

    const totalStepsFloat = elapsed / STEP_SEC;
    const totalStepsInt = Math.max(0, Math.floor(totalStepsFloat));
    const bar = Math.floor(totalStepsInt / STEPS_PER_BAR);
    const step16 = totalStepsInt % STEPS_PER_BAR;
    const beat = Math.floor(step16 / STEPS_PER_BEAT);

    const frac16 = elapsed - totalStepsInt * STEP_SEC;
    const rem16 = STEP_SEC - frac16;
    const next16thDelaySec = Math.max(0.004, Math.min(STEP_SEC, Number.isFinite(rem16) ? rem16 : STEP_SEC * 0.5));

    const total8thInt = Math.max(0, Math.floor(elapsed / EIGHTH_SEC));
    const frac8 = elapsed - total8thInt * EIGHTH_SEC;
    const rem8 = EIGHTH_SEC - frac8;
    const next8thDelaySec = Math.max(0.004, Math.min(EIGHTH_SEC, Number.isFinite(rem8) ? rem8 : EIGHTH_SEC * 0.5));

    return {
      bar,
      beat,
      step16,
      bpm: BPM,
      next16thDelaySec,
      next8thDelaySec,
      isPlaying: true
    };
  }

  function setLayerState(areaIndex = 0, evolutionStage = 1) {
    const rawArea = Number(areaIndex);
    const rawEvo = Number(evolutionStage);
    currentAreaIndex = Number.isFinite(rawArea) ? Math.max(0, Math.min(3, Math.round(rawArea))) : 0;
    currentEvolutionStage = Number.isFinite(rawEvo) ? Math.max(1, Math.min(3, Math.round(rawEvo))) : 1;

    if (ctx) {
      const now = Math.max(0, Number(ctx.currentTime) || 0);
      if (isPlaying) {
        schedulerTick();
      }
      applyLayerStateToAudio(now);
    }

    return {
      areaIndex: currentAreaIndex,
      evolutionStage: currentEvolutionStage
    };
  }

  function getSpectrum() {
    if (!isPlaying) {
      spectrumBins.fill(0);
      return spectrumBins;
    }
    if (ctx) schedulerTick();

    let energySum = 0;
    if (analyser && analyserRawBins && typeof analyser.getByteFrequencyData === 'function') {
      analyser.getByteFrequencyData(analyserRawBins);
      const ratio = Math.max(1, Math.floor(analyserRawBins.length / 32));
      for (let i = 0; i < 32; i++) {
        let sum = 0;
        const startBin = i * ratio;
        for (let j = 0; j < ratio; j++) {
          sum += analyserRawBins[startBin + j] || 0;
        }
        const val = Math.min(255, Math.round(sum / ratio));
        spectrumBins[i] = val;
        energySum += val;
      }
    }

    // Beat-reactive analytical synthesis fallback for headless/mock contexts or pre-quantum frames
    if (energySum === 0 && ctx) {
      const phase = getBeatPhase();
      const kickEnv = Math.exp(-phase * 5.2);
      const offbeatEnv = Math.exp(-((phase + 0.5) % 1) * 4.5);
      const areaLift = 0.42 + currentAreaIndex * 0.18;
      const evoLift = 0.35 + (currentEvolutionStage - 1) * 0.32;

      for (let i = 0; i < 32; i++) {
        const norm = i / 31;
        let v = 0;
        if (i < 6) {
          v = (155 * kickEnv + 68 * offbeatEnv) * (1 - norm * 0.5);
        } else if (i < 18) {
          v = (78 + 92 * offbeatEnv) * areaLift;
        } else {
          v = (54 + 88 * (1 - Math.abs(phase - 0.5))) * areaLift * evoLift;
        }
        spectrumBins[i] = Math.max(8, Math.min(255, Math.round(v)));
      }
    }

    return spectrumBins;
  }

  // ==========================================================================
  // QUANTIZED SYNESTHETIC COMBAT INSTRUMENTS (THE HEART OF REZ FEEL)
  // ==========================================================================

  // 1. Paint-Lock Acquisition Tick (`slotIndex` 0..7):
  //    Ascending crystal FM/harp harmonic scale across active chord's extensions
  //    (`root, 9th, b3, 5th, 7th, oct, oct+9th, oct+5th` — slot 7 rings wide stereo bell!)
  function playLockTick(slotIndex = 0) {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const rawSlot = Number(slotIndex);
    const slot = Number.isFinite(rawSlot) ? Math.max(0, Math.min(7, Math.round(rawSlot))) : 0;

    const now = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    if (Math.abs(now - lastLockBurstClock) < 0.002) {
      lockBurstOrdinal += 1;
    } else {
      lastLockBurstClock = now;
      lockBurstOrdinal = 0;
    }

    const t0 = quantizeToGrid(now, THIRTY_SECOND_SEC, 0.042) + Math.min(7, lockBurstOrdinal) * 0.0025;
    const chord = getChordAtTime(t0);
    const midi = chord.lockScale[slot] || 72;
    const freq = midiToFreq(midi);
    const dest = sfxBus || masterGain || ctx.destination;

    const isOctetPeak = slot === 7;
    const dur = isOctetPeak ? 0.52 : (0.17 + slot * 0.022);
    const panPos = -0.46 + (slot / 7) * 0.92;

    // Crystal FM Harp Carrier + 2x Glassy Modulator
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    setFreqAt(carrier.frequency, freq, t0);

    const fmMod = ctx.createOscillator();
    fmMod.type = 'sine';
    setFreqAt(fmMod.frequency, clampFreq(freq * (isOctetPeak ? 3.0 : 2.0)), t0);

    const fmIdx = ctx.createGain();
    const tfm0 = setModDepthAt(fmIdx.gain, freq * (0.95 + slot * 0.14), t0);
    expRampModDepth(fmIdx.gain, SILENT_GAIN, tfm0 + 0.048);
    fmMod.connect(fmIdx);
    safeConnectParam(fmIdx, carrier.frequency);

    // Bright plucked harp string transient harmonic
    const pluck = ctx.createOscillator();
    pluck.type = 'triangle';
    setFreqAt(pluck.frequency, clampFreq(freq * 2.0), t0);
    const pGain = ctx.createGain();
    const tp0 = setGainAt(pGain.gain, 0.28 + slot * 0.025, t0);
    expRampGain(pGain.gain, SILENT_GAIN, tp0 + 0.085);
    pluck.connect(pGain);

    const amp = ctx.createGain();
    const peak = isOctetPeak ? 0.20 : (0.125 + slot * 0.008);
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, peak, ta0 + 0.003);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + dur);

    const pan = createStereoPan(panPos);
    carrier.connect(amp);
    pGain.connect(amp);
    amp.connect(pan);
    pan.connect(dest);

    if (delayInput && (slot >= 4 || isOctetPeak)) {
      const send = ctx.createGain();
      send.gain.value = isOctetPeak ? 0.44 : 0.22;
      amp.connect(send);
      send.connect(delayInput);
    }
    if (reverbInput && slot >= 3) {
      const rev = ctx.createGain();
      rev.gain.value = isOctetPeak ? 0.48 : 0.20;
      amp.connect(rev);
      rev.connect(reverbInput);
    }

    const stopAt = ta2 + 0.015;
    scheduleOscRun(carrier, t0, stopAt);
    scheduleOscRun(fmMod, t0, stopAt);
    scheduleOscRun(pluck, t0, stopAt);

    // Slot 7 Special: Luminous Wide-Stereo Octave + Fifth Bell Harmonic!
    if (isOctetPeak) {
      const bellRatios = [1.5, 2.0];
      const bellPans = [-0.68, 0.68];
      for (let i = 0; i < 2; i++) {
        const bt = t0 + i * 0.014;
        const bell = ctx.createOscillator();
        bell.type = 'sine';
        setFreqAt(bell.frequency, clampFreq(freq * bellRatios[i]), bt);

        const bAmp = ctx.createGain();
        const tb0 = setGainAt(bAmp.gain, SILENT_GAIN, bt);
        const tb1 = linearRampGain(bAmp.gain, 0.115, tb0 + 0.004);
        const tb2 = expRampGain(bAmp.gain, SILENT_GAIN, tb1 + 0.56);

        const bPan = createStereoPan(bellPans[i]);
        bell.connect(bAmp);
        bAmp.connect(bPan);
        bPan.connect(dest);

        if (reverbInput) {
          const rev = ctx.createGain();
          rev.gain.value = 0.45;
          bAmp.connect(rev);
          rev.connect(reverbInput);
        }
        scheduleOscRun(bell, bt, tb2 + 0.015);
      }
    }
  }

  // 2. Quantized Salvo Release (`lockCount` 1..8):
  //    Quantized onto next 16th-note — warm resonant chord stab + upward arpeggio sweep
  //    (8 locks triggers a euphoric full-chord MAX HARMONIC shimmer wash!)
  function playSalvoRelease(lockCount = 1) {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const rawCount = Number(lockCount);
    const count = Number.isFinite(rawCount) ? Math.max(1, Math.min(8, Math.round(rawCount))) : 1;
    const isMaxHarmonic = count >= 8;

    const now = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const t0 = quantizeNext16th(now);
    const chord = getChordAtTime(t0);
    const dest = sfxBus || masterGain || ctx.destination;

    if (count >= 5) {
      duckScoreBriefly(t0, isMaxHarmonic ? 0.54 : 0.72, isMaxHarmonic ? 0.55 : 0.28);
    }

    // (a) Warm Resonant Progressive-Trance Chord Stab
    const stabNotes = chord.stabVoicing.slice(0, Math.min(chord.stabVoicing.length, 2 + Math.ceil(count * 0.45)));
    const stabFilter = ctx.createBiquadFilter();
    stabFilter.type = 'lowpass';
    setFilterQ(stabFilter, isMaxHarmonic ? 2.6 : 2.1);
    const peakCut = 1850 + count * 490;
    const tf0 = setFreqAt(stabFilter.frequency, 420, t0);
    const tf1 = expRampFreq(stabFilter.frequency, peakCut, tf0 + 0.024);
    expRampFreq(stabFilter.frequency, 680, tf1 + (isMaxHarmonic ? 0.54 : 0.28));

    const stabAmp = ctx.createGain();
    const stabDur = isMaxHarmonic ? 0.58 : (0.22 + count * 0.028);
    const ta0 = setGainAt(stabAmp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(stabAmp.gain, 0.115 + count * 0.009, ta0 + 0.008);
    const ta2 = expRampGain(stabAmp.gain, SILENT_GAIN, ta1 + stabDur);

    stabFilter.connect(stabAmp);
    stabAmp.connect(dest);

    if (delayInput) {
      const send = ctx.createGain();
      send.gain.value = isMaxHarmonic ? 0.45 : 0.28;
      stabAmp.connect(send);
      send.connect(delayInput);
    }
    if (reverbInput) {
      const rev = ctx.createGain();
      rev.gain.value = isMaxHarmonic ? 0.50 : 0.28;
      stabAmp.connect(rev);
      rev.connect(reverbInput);
    }

    const stabStop = ta2 + 0.018;
    for (let i = 0; i < stabNotes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      setFreqAt(osc.frequency, midiToFreq(stabNotes[i], i % 2 === 0 ? -6 : 6), t0);
      osc.connect(stabFilter);
      scheduleOscRun(osc, t0, stabStop);
    }

    // (b) Upward Homing Laser Arpeggio Sweep (1 voice per locked target!)
    for (let i = 0; i < count; i++) {
      const nt = t0 + i * 0.021;
      const arpMidi = chord.lockScale[i % chord.lockScale.length];
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      setFreqAt(osc.frequency, midiToFreq(arpMidi), nt);

      const nAmp = ctx.createGain();
      const tn0 = setGainAt(nAmp.gain, SILENT_GAIN, nt);
      const tn1 = linearRampGain(nAmp.gain, 0.082, tn0 + 0.003);
      const tn2 = expRampGain(nAmp.gain, SILENT_GAIN, tn1 + 0.15);

      const pan = createStereoPan(count > 1 ? -0.56 + (1.12 * i) / (count - 1) : 0);
      osc.connect(nAmp);
      nAmp.connect(pan);
      pan.connect(dest);
      scheduleOscRun(osc, nt, tn2 + 0.012);
    }

    // (c) 8-Lock MAX HARMONIC Euphoria Shimmer Wash!
    if (isMaxHarmonic) {
      const shimmerMidis = [
        chord.lockScale[5],      // oct
        chord.lockScale[6],      // oct+9th
        chord.lockScale[7],      // oct+5th
        chord.lockScale[5] + 12  // 2x oct crystalline crown
      ];

      const washLp = ctx.createBiquadFilter();
      washLp.type = 'lowpass';
      setFilterQ(washLp, 1.5);
      const tw0 = setFreqAt(washLp.frequency, 1200, t0);
      const tw1 = expRampFreq(washLp.frequency, 9600, tw0 + 0.14);
      expRampFreq(washLp.frequency, 2800, tw1 + 0.72);

      const washAmp = ctx.createGain();
      const twa0 = setGainAt(washAmp.gain, SILENT_GAIN, t0);
      const twa1 = linearRampGain(washAmp.gain, 0.115, twa0 + 0.045);
      const twa2 = expRampGain(washAmp.gain, SILENT_GAIN, twa1 + 0.82);

      washLp.connect(washAmp);
      washAmp.connect(dest);

      if (reverbInput) {
        const rev = ctx.createGain();
        rev.gain.value = 0.58;
        washAmp.connect(rev);
        rev.connect(reverbInput);
      }

      const washStop = twa2 + 0.022;
      for (let i = 0; i < shimmerMidis.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? 'sawtooth' : 'sine';
        setFreqAt(osc.frequency, midiToFreq(shimmerMidis[i], i % 2 === 0 ? -10 : 10), t0);
        const pan = createStereoPan(i % 2 === 0 ? -0.62 : 0.62);
        osc.connect(pan);
        pan.connect(washLp);
        scheduleOscRun(osc, t0, washStop);
      }
    }
  }

  // 3. Quantized Target Detonation (`slotIndex` 0..7, `kind` 'enemy' | 'node' | 'boss'):
  //    Tight TR-909 clap/snare/tom + in-key marimba/bell chime pitched by `slotIndex`!
  function playTargetDetonation(slotIndex = 0, kind = 'enemy') {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const rawSlot = Number(slotIndex);
    const slot = Number.isFinite(rawSlot) ? Math.max(0, Math.min(7, Math.round(rawSlot))) : 0;
    const normKind = String(kind || 'enemy').toLowerCase();
    const isBoss = normKind.includes('boss');
    const isNode = normKind.includes('node');

    const now = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const t0 = quantizeToGrid(now, THIRTY_SECOND_SEC, 0.036);
    const chord = getChordAtTime(t0);
    const chimeMidi = chord.lockScale[slot] || 72;
    const chimeFreq = midiToFreq(chimeMidi);
    const dest = sfxBus || masterGain || ctx.destination;

    const pan = createStereoPan(((slot % 4) - 1.5) * 0.24);
    pan.connect(dest);

    // (a) Tight 909 Electronic Tom / Sub Impact
    const tom = ctx.createOscillator();
    tom.type = 'sine';
    const startTomHz = isBoss ? 158 : (isNode ? 195 : 230 + slot * 8);
    const endTomHz = isBoss ? 29 : (isNode ? 48 : 66);
    const tomDur = isBoss ? 0.52 : (isNode ? 0.28 : 0.16);
    const tt0 = setFreqAt(tom.frequency, startTomHz, t0);
    expRampFreq(tom.frequency, endTomHz, tt0 + tomDur * 0.85);

    const tomAmp = ctx.createGain();
    const tta0 = setGainAt(tomAmp.gain, isBoss ? 0.36 : (isNode ? 0.24 : 0.18), t0);
    const tta1 = expRampGain(tomAmp.gain, SILENT_GAIN, tta0 + tomDur);
    tom.connect(tomAmp);
    tomAmp.connect(pan);
    scheduleOscRun(tom, t0, tta1 + 0.012);

    // (b) 909 Clap / Snare Transient Burst
    const noiseDur = isBoss ? 0.48 : (isNode ? 0.22 : 0.12);
    const burst = spawnBufferBurst(noiseBuffer, t0, noiseDur + 0.015, slot * 23 + (isBoss ? 7 : 2));
    if (burst) {
      const bp = ctx.createBiquadFilter();
      bp.type = isBoss ? 'lowpass' : 'bandpass';
      const tbf0 = setFreqAt(bp.frequency, isBoss ? 2800 : (isNode ? 1650 : 1320), t0);
      if (isBoss) {
        expRampFreq(bp.frequency, 260, tbf0 + noiseDur);
      }
      setFilterQ(bp, isBoss ? 1.4 : 2.1);

      const nAmp = ctx.createGain();
      const tna0 = setGainAt(nAmp.gain, isBoss ? 0.26 : (isNode ? 0.17 : 0.135), t0);
      expRampGain(nAmp.gain, SILENT_GAIN, tna0 + noiseDur);

      burst.connect(bp);
      bp.connect(nAmp);
      nAmp.connect(pan);
    }

    // (c) In-Key Resonant Marimba / Crystal Bell Chime Pitched by `slotIndex`!
    const marimba = ctx.createOscillator();
    marimba.type = 'sine';
    setFreqAt(marimba.frequency, chimeFreq, t0);

    const woodyPartial = ctx.createOscillator();
    woodyPartial.type = 'triangle';
    // 4.0x harmonic = classic resonant concert marimba overtone; 2.0x/3.0x = crystal node bell
    setFreqAt(woodyPartial.frequency, clampFreq(chimeFreq * (isNode || isBoss ? 2.0 : 3.98)), t0);
    const wpGain = ctx.createGain();
    const twp0 = setGainAt(wpGain.gain, isNode || isBoss ? 0.36 : 0.26, t0);
    expRampGain(wpGain.gain, SILENT_GAIN, twp0 + (isNode || isBoss ? 0.24 : 0.055));
    woodyPartial.connect(wpGain);

    const mAmp = ctx.createGain();
    const chimeDur = isBoss ? 0.62 : (isNode ? 0.36 : 0.21);
    const tma0 = setGainAt(mAmp.gain, SILENT_GAIN, t0);
    const tma1 = linearRampGain(mAmp.gain, isBoss ? 0.20 : 0.155, tma0 + 0.003);
    const tma2 = expRampGain(mAmp.gain, SILENT_GAIN, tma1 + chimeDur);

    marimba.connect(mAmp);
    wpGain.connect(mAmp);
    mAmp.connect(pan);

    if (reverbInput && (isNode || isBoss || slot >= 5)) {
      const rev = ctx.createGain();
      rev.gain.value = isBoss ? 0.48 : 0.28;
      mAmp.connect(rev);
      rev.connect(reverbInput);
    }

    const chimeStop = tma2 + 0.015;
    scheduleOscRun(marimba, t0, chimeStop);
    scheduleOscRun(woodyPartial, t0, chimeStop);

    // Boss core/phase detonation adds dramatic harmonic-minor fifth + octave bell pillar
    if (isBoss) {
      duckScoreBriefly(t0, 0.52, 0.55);
      const bossBells = [chord.lockScale[0] - 12, chord.lockScale[3], chord.lockScale[5]];
      for (let i = 0; i < bossBells.length; i++) {
        const bt = t0 + 0.02 + i * 0.032;
        const bOsc = ctx.createOscillator();
        bOsc.type = 'sawtooth';
        setFreqAt(bOsc.frequency, midiToFreq(bossBells[i]), bt);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        const tl0 = setFreqAt(lp.frequency, 3600, bt);
        expRampFreq(lp.frequency, 520, tl0 + 0.52);

        const bAmp = ctx.createGain();
        const tb0 = setGainAt(bAmp.gain, SILENT_GAIN, bt);
        const tb1 = linearRampGain(bAmp.gain, 0.095, tb0 + 0.008);
        const tb2 = expRampGain(bAmp.gain, SILENT_GAIN, tb1 + 0.54);

        bOsc.connect(lp);
        lp.connect(bAmp);
        bAmp.connect(dest);
        scheduleOscRun(bOsc, bt, tb2 + 0.016);
      }
    }
  }

  // 4. Quick-Tap Vulcan Acid Blip (cycles chord root -> 5th -> oct -> 9th!)
  function playVulcanTap() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const now = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const t0 = quantizeToGrid(now, THIRTY_SECOND_SEC, 0.028);
    const chord = getChordAtTime(t0);
    const dest = sfxBus || masterGain || ctx.destination;

    const cycleSlots = [0, 3, 5, 1];
    const slot = cycleSlots[vulcanCycleIndex % cycleSlots.length];
    vulcanCycleIndex = (vulcanCycleIndex + 1) % 16;

    const freq = midiToFreq(chord.lockScale[slot]);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const tf0 = setFreqAt(osc.frequency, clampFreq(freq * 1.5), t0);
    expRampFreq(osc.frequency, freq, tf0 + 0.026);

    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    setFilterQ(bp, 4.2);
    const tbf0 = setFreqAt(bp.frequency, clampFreq(freq * 6.5), t0);
    expRampFreq(bp.frequency, clampFreq(freq * 1.4), tbf0 + 0.075);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, 0.115, ta0 + 0.003);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.078);

    osc.connect(bp);
    bp.connect(amp);
    amp.connect(dest);
    scheduleOscRun(osc, t0, ta2 + 0.01);
  }

  // 5. Star Fox x Rez 360-Degree Vector Barrel Roll Whoosh + Harmonic Phase Glide
  function playBarrelRollSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const chord = getChordAtTime(t0);
    const dest = sfxBus || masterGain || ctx.destination;

    // Aerodynamic bandpass vortex sweep
    const whoosh = spawnBufferBurst(crystalNoiseBuffer || noiseBuffer, t0, 0.44, 37);
    if (whoosh) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setFilterQ(bp, 3.4);
      const tf0 = setFreqAt(bp.frequency, 360, t0);
      const tf1 = expRampFreq(bp.frequency, 3200, tf0 + 0.18);
      expRampFreq(bp.frequency, 440, tf1 + 0.24);

      const wAmp = ctx.createGain();
      const tw0 = setGainAt(wAmp.gain, SILENT_GAIN, t0);
      const tw1 = linearRampGain(wAmp.gain, 0.18, tw0 + 0.05);
      expRampGain(wAmp.gain, SILENT_GAIN, tw1 + 0.37);

      whoosh.connect(bp);
      bp.connect(wAmp);
      wAmp.connect(dest);
    }

    // Dual-wing harmonic vector spin (root -> octave -> fifth)
    const rootF = midiToFreq(chord.lockScale[0]);
    const octF = midiToFreq(chord.lockScale[5]);
    const fifthF = midiToFreq(chord.lockScale[3]);

    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const ratio = i === 0 ? 1.0 : 1.5;
      const to0 = setFreqAt(osc.frequency, clampFreq(rootF * ratio), t0);
      const to1 = expRampFreq(osc.frequency, clampFreq(octF * ratio), to0 + 0.19);
      expRampFreq(osc.frequency, clampFreq(fifthF * ratio), to1 + 0.21);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
      const ta1 = linearRampGain(amp.gain, i === 0 ? 0.11 : 0.075, ta0 + 0.035);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.38);

      const pan = createStereoPan(i === 0 ? -0.55 : 0.55);
      osc.connect(amp);
      amp.connect(pan);
      pan.connect(dest);
      scheduleOscRun(osc, t0, ta2 + 0.014);
    }
  }

  // 6. Hexagonal Deflector Shield Bolt Ricochet Ping
  function playDeflectSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const now = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const t0 = quantizeToGrid(now, THIRTY_SECOND_SEC, 0.025);
    const chord = getChordAtTime(t0);
    const dest = sfxBus || masterGain || ctx.destination;

    const baseF = midiToFreq(chord.lockScale[5]); // High chord octave ping!
    const topF = midiToFreq(chord.lockScale[7]);  // Luminous fifth whip!

    const ping = ctx.createOscillator();
    ping.type = 'sine';
    const tp0 = setFreqAt(ping.frequency, baseF, t0);
    expRampFreq(ping.frequency, topF, tp0 + 0.065);

    const mod = ctx.createOscillator();
    mod.type = 'triangle';
    setFreqAt(mod.frequency, clampFreq(baseF * 2.5), t0);
    const mIdx = ctx.createGain();
    const tm0 = setModDepthAt(mIdx.gain, baseF * 1.4, t0);
    expRampModDepth(mIdx.gain, SILENT_GAIN, tm0 + 0.055);
    mod.connect(mIdx);
    safeConnectParam(mIdx, ping.frequency);

    const amp = ctx.createGain();
    const ta0 = setGainAt(amp.gain, SILENT_GAIN, t0);
    const ta1 = linearRampGain(amp.gain, 0.175, ta0 + 0.002);
    const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.24);

    ping.connect(amp);
    amp.connect(dest);

    if (delayInput) {
      const send = ctx.createGain();
      send.gain.value = 0.35;
      amp.connect(send);
      send.connect(delayInput);
    }

    const stopAt = ta2 + 0.012;
    scheduleOscRun(ping, t0, stopAt);
    scheduleOscRun(mod, t0, stopAt);
  }

  // 7. Player Craft Form Evolution Fanfare (`stage` 1..3: Dart -> Valkyrie -> Seraph)
  function playEvolutionSfx(stage = 2) {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const rawStage = Number(stage);
    const evo = Number.isFinite(rawStage) ? Math.max(1, Math.min(3, Math.round(rawStage))) : 2;

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const chord = getChordAtTime(t0);
    const dest = sfxBus || masterGain || ctx.destination;

    duckScoreBriefly(t0, 0.62, 0.55);

    const noteCount = evo === 3 ? 8 : (evo === 2 ? 6 : 4);
    for (let i = 0; i < noteCount; i++) {
      const nt = t0 + i * 0.052;
      const midi = chord.lockScale[i % chord.lockScale.length] + (evo === 3 && i >= 4 ? 12 : 0);
      const freq = midiToFreq(midi);

      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      setFreqAt(osc.frequency, freq, nt);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, nt);
      const ta1 = linearRampGain(amp.gain, 0.115, ta0 + 0.005);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + (i === noteCount - 1 ? 0.55 : 0.24));

      const pan = createStereoPan(((i % 2 === 0 ? -1 : 1) * (0.2 + i * 0.06)));
      osc.connect(amp);
      amp.connect(pan);
      pan.connect(dest);

      if (reverbInput && i >= noteCount - 3) {
        const rev = ctx.createGain();
        rev.gain.value = 0.44;
        amp.connect(rev);
        rev.connect(reverbInput);
      }

      scheduleOscRun(osc, nt, ta2 + 0.015);
    }

    // Warm analog halo pad swell
    const haloLp = ctx.createBiquadFilter();
    haloLp.type = 'lowpass';
    const th0 = setFreqAt(haloLp.frequency, 450, t0);
    expRampFreq(haloLp.frequency, evo === 3 ? 7200 : 4200, th0 + 0.48);

    const hAmp = ctx.createGain();
    const tha0 = setGainAt(hAmp.gain, SILENT_GAIN, t0);
    const tha1 = linearRampGain(hAmp.gain, 0.095, tha0 + 0.08);
    const tha2 = expRampGain(hAmp.gain, SILENT_GAIN, tha1 + 0.62);

    haloLp.connect(hAmp);
    hAmp.connect(dest);

    const haloStop = tha2 + 0.018;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      setFreqAt(osc.frequency, midiToFreq(chord.stabVoicing[i], i === 1 ? 7 : -7), t0);
      osc.connect(haloLp);
      scheduleOscRun(osc, t0, haloStop);
    }
  }

  // 8. Shield Fracture / Form Step-Down De-Synchronization Impact
  function playDamageSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;

    duckScoreBriefly(t0, 0.45, 0.42);

    // Heavy sub-hull impact drop
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const ts0 = setFreqAt(sub.frequency, 128, t0);
    expRampFreq(sub.frequency, 31, ts0 + 0.28);

    const sAmp = ctx.createGain();
    const tsa0 = setGainAt(sAmp.gain, 0.34, t0);
    const tsa1 = expRampGain(sAmp.gain, SILENT_GAIN, tsa0 + 0.30);
    sub.connect(sAmp);
    sAmp.connect(dest);
    scheduleOscRun(sub, t0, tsa1 + 0.012);

    // De-sync minor-second glitch downward pitch fracture (Ab4 + G4 -> C3)
    const glitchFreqs = [415.30, 392.00];
    for (let i = 0; i < glitchFreqs.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const tg0 = setFreqAt(osc.frequency, glitchFreqs[i], t0);
      expRampFreq(osc.frequency, 118 + i * 17, tg0 + 0.24);

      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      setFilterQ(lp, 2.8);
      const tlf0 = setFreqAt(lp.frequency, 1850, t0);
      expRampFreq(lp.frequency, 280, tlf0 + 0.24);

      const gAmp = ctx.createGain();
      const tga0 = setGainAt(gAmp.gain, 0.125, t0);
      const tga1 = expRampGain(gAmp.gain, SILENT_GAIN, tga0 + 0.25);

      osc.connect(lp);
      lp.connect(gAmp);
      gAmp.connect(dest);
      scheduleOscRun(osc, t0, tga1 + 0.012);
    }

    // Static shield shatter burst
    const staticBurst = spawnBufferBurst(noiseBuffer, t0, 0.20, 91);
    if (staticBurst) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      setFreqAt(hp.frequency, 1400, t0);
      const nAmp = ctx.createGain();
      const tn0 = setGainAt(nAmp.gain, 0.16, t0);
      expRampGain(nAmp.gain, SILENT_GAIN, tn0 + 0.19);
      staticBurst.connect(hp);
      hp.connect(nAmp);
      nAmp.connect(dest);
    }
  }

  // 9. Overdrive Synesthetic Resonance Wave Smart-Bomb (3.0s Euphoria Surge!)
  function playOverdriveSfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const chord = getChordAtTime(t0);
    const dest = sfxBus || masterGain || ctx.destination;

    duckScoreBriefly(t0, 0.48, 0.85);

    // Tectonic resonance sub wave (C2 -> C1)
    const subWave = ctx.createOscillator();
    subWave.type = 'sine';
    const ts0 = setFreqAt(subWave.frequency, 98, t0);
    expRampFreq(subWave.frequency, 32.70, ts0 + 0.75);

    const swAmp = ctx.createGain();
    const tsw0 = setGainAt(swAmp.gain, SILENT_GAIN, t0);
    const tsw1 = linearRampGain(swAmp.gain, 0.34, tsw0 + 0.025);
    const tsw2 = expRampGain(swAmp.gain, SILENT_GAIN, tsw1 + 0.85);
    subWave.connect(swAmp);
    swAmp.connect(dest);
    scheduleOscRun(subWave, t0, tsw2 + 0.018);

    // Wide Supersaw Euphoria Riser + Resonant Sweep
    const riserLp = ctx.createBiquadFilter();
    riserLp.type = 'lowpass';
    setFilterQ(riserLp, 2.5);
    const tr0 = setFreqAt(riserLp.frequency, 340, t0);
    const tr1 = expRampFreq(riserLp.frequency, 8800, tr0 + 0.65);
    expRampFreq(riserLp.frequency, 2400, tr1 + 0.65);

    const rAmp = ctx.createGain();
    const tra0 = setGainAt(rAmp.gain, SILENT_GAIN, t0);
    const tra1 = linearRampGain(rAmp.gain, 0.125, tra0 + 0.06);
    const tra2 = expRampGain(rAmp.gain, SILENT_GAIN, tra1 + 1.25);

    riserLp.connect(rAmp);
    rAmp.connect(dest);

    if (reverbInput) {
      const rev = ctx.createGain();
      rev.gain.value = 0.52;
      rAmp.connect(rev);
      rev.connect(reverbInput);
    }

    const stopAt = tra2 + 0.024;
    for (let i = 0; i < chord.stabVoicing.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      setFreqAt(osc.frequency, midiToFreq(chord.stabVoicing[i], i % 2 === 0 ? -11 : 11), t0);
      osc.connect(riserLp);
      scheduleOscRun(osc, t0, stopAt);
    }

    // 8-note Crystalline Harmonic Cascade across the stereo horizon
    for (let i = 0; i < 8; i++) {
      const ct = t0 + 0.04 + i * 0.075;
      const bell = ctx.createOscillator();
      bell.type = 'sine';
      setFreqAt(bell.frequency, midiToFreq(chord.lockScale[i]), ct);

      const bAmp = ctx.createGain();
      const tb0 = setGainAt(bAmp.gain, SILENT_GAIN, ct);
      const tb1 = linearRampGain(bAmp.gain, 0.095, tb0 + 0.004);
      const tb2 = expRampGain(bAmp.gain, SILENT_GAIN, tb1 + 0.42);

      const pan = createStereoPan(-0.65 + (i / 7) * 1.30);
      bell.connect(bAmp);
      bAmp.connect(pan);
      pan.connect(dest);
      scheduleOscRun(bell, ct, tb2 + 0.014);
    }
  }

  // 10. Corridor Hyper-Gate Area Transition Surge (`areaIndex` 0..3)
  function playAreaTransitionSfx(areaIndex = 1) {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const rawArea = Number(areaIndex);
    const area = Number.isFinite(rawArea) ? Math.max(0, Math.min(3, Math.round(rawArea))) : 1;

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;

    duckScoreBriefly(t0, 0.58, 0.65);

    // Sweeping Subspace Tunnel Jet Whoosh
    const jet = spawnBufferBurst(noiseBuffer, t0, 0.85, area * 31 + 11);
    if (jet) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      setFilterQ(bp, 2.6);
      const tj0 = setFreqAt(bp.frequency, 220, t0);
      const tj1 = expRampFreq(bp.frequency, 3600 + area * 600, tj0 + 0.38);
      expRampFreq(bp.frequency, 460, tj1 + 0.44);

      const jAmp = ctx.createGain();
      const tja0 = setGainAt(jAmp.gain, SILENT_GAIN, t0);
      const tja1 = linearRampGain(jAmp.gain, 0.16, tja0 + 0.09);
      expRampGain(jAmp.gain, SILENT_GAIN, tja1 + 0.72);

      jet.connect(bp);
      bp.connect(jAmp);
      jAmp.connect(dest);
    }

    // Signature Modal Portal Chime per Area (0: Cm9, 1: Abmaj9#11, 2: Fm11, 3: Singularity G7b9->Cm9!)
    const areaChords = [
      [60, 67, 74, 75],         // Area 0: Phosphor Lattice
      [56, 63, 67, 74],         // Area 1: Fourier Cathedral (#11 Lydian!)
      [53, 60, 67, 70, 77],     // Area 2: Subspace Conduit
      [55, 59, 68, 72, 79]      // Area 3: Singularity Core (SERAPH-IX Arrival!)
    ];
    const notes = areaChords[area];

    for (let i = 0; i < notes.length; i++) {
      const nt = t0 + i * 0.068;
      const osc = ctx.createOscillator();
      osc.type = area === 3 ? 'sawtooth' : 'triangle';
      setFreqAt(osc.frequency, midiToFreq(notes[i]), nt);

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      const tl0 = setFreqAt(lp.frequency, 4200, nt);
      expRampFreq(lp.frequency, 900, tl0 + 0.58);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, nt);
      const ta1 = linearRampGain(amp.gain, 0.105, ta0 + 0.012);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + 0.60);

      osc.connect(lp);
      lp.connect(amp);
      amp.connect(dest);

      if (reverbInput) {
        const rev = ctx.createGain();
        rev.gain.value = 0.42;
        amp.connect(rev);
        rev.connect(reverbInput);
      }

      scheduleOscRun(osc, nt, ta2 + 0.016);
    }
  }

  // 11. Grand Synesthetic Synchronization Victory Fanfare (Cm9 -> Abmaj9#11 -> Fm11 -> G7sus4 -> Cmaj9#11!)
  function playVictorySfx() {
    if (!ensureContext()) return;
    if (isPlaying) schedulerTick();

    const t0 = Math.max(0, Number(ctx.currentTime) || 0) + 0.001;
    const dest = sfxBus || masterGain || ctx.destination;

    duckScoreBriefly(t0, 0.40, 1.45);

    const cadence = [
      { delay: 0.00, dur: 0.18, notes: [60, 63, 67, 74], sub: 36 },
      { delay: 0.17, dur: 0.18, notes: [56, 63, 67, 74], sub: 32 },
      { delay: 0.34, dur: 0.19, notes: [53, 60, 67, 70], sub: 29 },
      { delay: 0.52, dur: 0.20, notes: [55, 60, 62, 67], sub: 31 },
      // Radiant Cmaj9(#11) Synesthetic Sunrise Resolution!
      { delay: 0.72, dur: 0.92, notes: [48, 55, 62, 64, 66, 71, 79], sub: 36 }
    ];

    for (let s = 0; s < cadence.length; s++) {
      const step = cadence[s];
      const st = t0 + step.delay;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      setFilterQ(lp, 1.65);
      const tl0 = setFreqAt(lp.frequency, 480, st);
      const tl1 = expRampFreq(lp.frequency, 5800, tl0 + 0.045);
      expRampFreq(lp.frequency, 2100, tl1 + step.dur);

      const amp = ctx.createGain();
      const ta0 = setGainAt(amp.gain, SILENT_GAIN, st);
      const ta1 = linearRampGain(amp.gain, 0.092, ta0 + 0.016);
      const ta2 = expRampGain(amp.gain, SILENT_GAIN, ta1 + step.dur);

      lp.connect(amp);
      amp.connect(dest);

      if (reverbInput) {
        const rev = ctx.createGain();
        rev.gain.value = 0.48;
        amp.connect(rev);
        rev.connect(reverbInput);
      }

      const stopAt = ta2 + 0.02;
      for (let i = 0; i < step.notes.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        setFreqAt(osc.frequency, midiToFreq(step.notes[i], i % 2 === 0 ? -7 : 7), st);
        osc.connect(lp);
        scheduleOscRun(osc, st, stopAt);
      }

      // Sub-kick pillar
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      const ts0 = setFreqAt(sub.frequency, midiToFreq(step.sub) * 1.4, st);
      expRampFreq(sub.frequency, midiToFreq(step.sub), ts0 + 0.055);
      const sAmp = ctx.createGain();
      const tsa0 = setGainAt(sAmp.gain, 0.20, st);
      const tsa1 = expRampGain(sAmp.gain, SILENT_GAIN, tsa0 + Math.min(0.42, step.dur));
      sub.connect(sAmp);
      sAmp.connect(dest);
      scheduleOscRun(sub, st, tsa1 + 0.014);
    }

    // Ascending 8-note C-Lydian crystalline bell crown on final chord!
    const crownMidis = [72, 74, 76, 78, 79, 83, 86, 91];
    for (let i = 0; i < crownMidis.length; i++) {
      const bt = t0 + 0.74 + i * 0.062;
      const bell = ctx.createOscillator();
      bell.type = 'sine';
      setFreqAt(bell.frequency, midiToFreq(crownMidis[i]), bt);

      const bAmp = ctx.createGain();
      const tb0 = setGainAt(bAmp.gain, SILENT_GAIN, bt);
      const tb1 = linearRampGain(bAmp.gain, 0.105, tb0 + 0.004);
      const tb2 = expRampGain(bAmp.gain, SILENT_GAIN, tb1 + 0.44);

      const pan = createStereoPan(-0.6 + (i / 7) * 1.2);
      bell.connect(bAmp);
      bAmp.connect(pan);
      pan.connect(dest);
      scheduleOscRun(bell, bt, tb2 + 0.015);
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
    getSubdivisionInfo,
    setLayerState,
    getSpectrum,
    playLockTick,
    playSalvoRelease,
    playTargetDetonation,
    playVulcanTap,
    playBarrelRollSfx,
    playDeflectSfx,
    playEvolutionSfx,
    playDamageSfx,
    playOverdriveSfx,
    playAreaTransitionSfx,
    playVictorySfx
  };
}
