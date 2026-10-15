import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ============================================================================
// 1. CLAUDE DEBUSSY — CLAIR DE LUNE (L. 75, III — D♭ MAJOR, 9/8)
// ============================================================================
const CLAIR_DE_LUNE_SCORE = [
  { label: 'Measure 1 — Andante très expressif (D♭ major)', notes: [{ n: 'Db3', v: 0.34, d: 3.6, delay: 0 }, { n: 'Ab3', v: 0.36, d: 3.6, delay: 28 }, { n: 'F4', v: 0.40, d: 3.6, delay: 55 }, { n: 'F5', v: 0.54, d: 2.5, delay: 190 }, { n: 'Ab5', v: 0.60, d: 2.5, delay: 205 }], wait: 1.6 },
  { label: 'Measure 1 — D♭5 · F5', notes: [{ n: 'Db5', v: 0.48, d: 2.6, delay: 0 }, { n: 'F5', v: 0.52, d: 2.6, delay: 14 }], wait: 1.5 },

  { label: 'Measure 2 — G♭maj7', notes: [{ n: 'Gb2', v: 0.36, d: 3.2, delay: 0 }, { n: 'Db3', v: 0.36, d: 3.2, delay: 25 }, { n: 'Bb3', v: 0.40, d: 3.2, delay: 50 }, { n: 'Eb5', v: 0.52, d: 0.9, delay: 75 }, { n: 'Gb5', v: 0.56, d: 0.9, delay: 88 }], wait: 0.64 },
  { label: 'Measure 2 — F5 · A♭5', notes: [{ n: 'F5', v: 0.54, d: 0.9, delay: 0 }, { n: 'Ab5', v: 0.58, d: 0.9, delay: 12 }], wait: 0.64 },
  { label: 'Measure 2 — D♭5 · F5', notes: [{ n: 'Db5', v: 0.46, d: 2.8, delay: 0 }, { n: 'F5', v: 0.50, d: 2.8, delay: 14 }], wait: 1.65 },

  { label: 'Measure 3 — A♭7 / F', notes: [{ n: 'F2', v: 0.35, d: 3.0, delay: 0 }, { n: 'C3', v: 0.37, d: 3.0, delay: 25 }, { n: 'Ab3', v: 0.40, d: 3.0, delay: 45 }, { n: 'C5', v: 0.50, d: 0.9, delay: 70 }, { n: 'Eb5', v: 0.54, d: 0.9, delay: 82 }], wait: 0.64 },
  { label: 'Measure 3 — D♭5 · F5', notes: [{ n: 'Db5', v: 0.52, d: 0.9, delay: 0 }, { n: 'F5', v: 0.56, d: 0.9, delay: 12 }], wait: 0.64 },
  { label: 'Measure 3 — C5 · E♭5', notes: [{ n: 'C5', v: 0.46, d: 2.6, delay: 0 }, { n: 'Eb5', v: 0.50, d: 2.6, delay: 12 }, { n: 'Gb4', v: 0.40, d: 2.4, delay: 30 }], wait: 1.55 },

  { label: 'Measure 4 — E♭m9', notes: [{ n: 'Eb2', v: 0.36, d: 3.2, delay: 0 }, { n: 'Bb2', v: 0.38, d: 3.2, delay: 25 }, { n: 'Gb3', v: 0.40, d: 3.2, delay: 50 }, { n: 'Bb4', v: 0.50, d: 0.9, delay: 75 }, { n: 'Db5', v: 0.54, d: 0.9, delay: 88 }], wait: 0.64 },
  { label: 'Measure 4 — C5 · E♭5', notes: [{ n: 'C5', v: 0.51, d: 0.9, delay: 0 }, { n: 'Eb5', v: 0.55, d: 0.9, delay: 12 }], wait: 0.64 },
  { label: 'Measure 4 — A♭13', notes: [{ n: 'Ab2', v: 0.38, d: 2.6, delay: 0 }, { n: 'Gb3', v: 0.40, d: 2.6, delay: 25 }, { n: 'Bb4', v: 0.46, d: 2.4, delay: 50 }, { n: 'Db5', v: 0.50, d: 2.4, delay: 62 }], wait: 1.48 },

  { label: 'Measure 5 — D♭maj9', notes: [{ n: 'Db2', v: 0.38, d: 3.5, delay: 0 }, { n: 'Ab2', v: 0.40, d: 3.5, delay: 30 }, { n: 'F3', v: 0.42, d: 3.5, delay: 60 }, { n: 'F4', v: 0.48, d: 1.2, delay: 90 }, { n: 'Ab4', v: 0.54, d: 1.2, delay: 105 }], wait: 0.72 },
  { label: 'Measure 5 — G♭4 · B♭4', notes: [{ n: 'Gb4', v: 0.50, d: 0.9, delay: 0 }, { n: 'Bb4', v: 0.54, d: 0.9, delay: 14 }], wait: 0.58 },
  { label: 'Measure 5 — F4 · A♭4', notes: [{ n: 'F4', v: 0.46, d: 2.4, delay: 0 }, { n: 'Ab4', v: 0.50, d: 2.4, delay: 14 }], wait: 1.35 },

  { label: 'Measure 6 — G♭maj7', notes: [{ n: 'Gb2', v: 0.36, d: 3.0, delay: 0 }, { n: 'Db3', v: 0.38, d: 3.0, delay: 28 }, { n: 'Eb4', v: 0.48, d: 0.9, delay: 55 }, { n: 'Gb4', v: 0.52, d: 0.9, delay: 68 }], wait: 0.62 },
  { label: 'Measure 6 — F4 · A♭4', notes: [{ n: 'F4', v: 0.50, d: 0.9, delay: 0 }, { n: 'Ab4', v: 0.53, d: 0.9, delay: 12 }], wait: 0.62 },
  { label: 'Measure 6 — A♭7sus', notes: [{ n: 'Ab2', v: 0.38, d: 2.8, delay: 0 }, { n: 'Eb3', v: 0.40, d: 2.8, delay: 25 }, { n: 'Eb4', v: 0.44, d: 2.5, delay: 50 }, { n: 'Gb4', v: 0.48, d: 2.5, delay: 65 }], wait: 1.55 },

  { label: 'Measure 7 — E♭m7 / A♭', notes: [{ n: 'Ab2', v: 0.35, d: 3.2, delay: 0 }, { n: 'Gb3', v: 0.38, d: 3.2, delay: 25 }, { n: 'Db4', v: 0.46, d: 1.0, delay: 55 }, { n: 'F4', v: 0.50, d: 1.0, delay: 68 }], wait: 0.65 },
  { label: 'Measure 7 — E♭4 · G♭4', notes: [{ n: 'Eb4', v: 0.48, d: 0.9, delay: 0 }, { n: 'Gb4', v: 0.52, d: 0.9, delay: 12 }], wait: 0.62 },
  { label: 'Measure 8 — B♭m7', notes: [{ n: 'Bb2', v: 0.40, d: 3.2, delay: 0 }, { n: 'F3', v: 0.42, d: 3.2, delay: 30 }, { n: 'Db4', v: 0.50, d: 2.8, delay: 60 }, { n: 'F4', v: 0.54, d: 2.8, delay: 75 }], wait: 1.65 },

  { label: 'Measure 9 — Tempo rubato (D♭ major)', notes: [{ n: 'Db2', v: 0.44, d: 4.0, delay: 0 }, { n: 'Ab2', v: 0.46, d: 4.0, delay: 35 }, { n: 'Db3', v: 0.48, d: 3.8, delay: 70 }, { n: 'F3', v: 0.50, d: 3.8, delay: 105 }, { n: 'Ab4', v: 0.56, d: 3.2, delay: 145 }, { n: 'F5', v: 0.64, d: 3.2, delay: 185 }, { n: 'Ab5', v: 0.68, d: 3.2, delay: 215 }], wait: 1.75 },
  { label: 'Measure 10 — G♭6 / D♭', notes: [{ n: 'Db2', v: 0.40, d: 3.5, delay: 0 }, { n: 'Bb2', v: 0.44, d: 3.5, delay: 35 }, { n: 'Gb3', v: 0.48, d: 3.5, delay: 70 }, { n: 'Eb4', v: 0.52, d: 3.0, delay: 105 }, { n: 'Db5', v: 0.62, d: 3.0, delay: 145 }, { n: 'F5', v: 0.66, d: 3.0, delay: 175 }], wait: 1.55 },

  { label: 'Un poco mosso — D♭ major arpeggio', notes: [{ n: 'Db2', v: 0.46, d: 3.8, delay: 0 }, { n: 'Ab2', v: 0.40, d: 2.2, delay: 140 }, { n: 'Db3', v: 0.42, d: 2.2, delay: 280 }, { n: 'F3', v: 0.44, d: 2.2, delay: 420 }, { n: 'Ab3', v: 0.46, d: 2.2, delay: 560 }, { n: 'F4', v: 0.62, d: 2.6, delay: 280 }, { n: 'Ab4', v: 0.58, d: 1.8, delay: 700 }], wait: 1.15 },
  { label: 'Un poco mosso — G♭ / D♭', notes: [{ n: 'Db2', v: 0.44, d: 3.8, delay: 0 }, { n: 'Bb2', v: 0.40, d: 2.2, delay: 140 }, { n: 'Db3', v: 0.42, d: 2.2, delay: 280 }, { n: 'Gb3', v: 0.44, d: 2.2, delay: 420 }, { n: 'Bb3', v: 0.46, d: 2.2, delay: 560 }, { n: 'Bb4', v: 0.64, d: 2.0, delay: 140 }, { n: 'Ab4', v: 0.58, d: 1.8, delay: 560 }], wait: 1.15 },
  { label: 'Un poco mosso — E♭m9', notes: [{ n: 'Eb2', v: 0.46, d: 3.8, delay: 0 }, { n: 'Bb2', v: 0.40, d: 2.2, delay: 140 }, { n: 'Gb3', v: 0.42, d: 2.2, delay: 280 }, { n: 'Bb3', v: 0.44, d: 2.2, delay: 420 }, { n: 'Db5', v: 0.66, d: 2.2, delay: 140 }, { n: 'Bb4', v: 0.60, d: 1.8, delay: 560 }], wait: 1.15 },
  { label: 'Un poco mosso — A♭9', notes: [{ n: 'Ab2', v: 0.46, d: 4.0, delay: 0 }, { n: 'Eb3', v: 0.40, d: 2.4, delay: 140 }, { n: 'Gb3', v: 0.42, d: 2.4, delay: 280 }, { n: 'C4', v: 0.44, d: 2.4, delay: 420 }, { n: 'Gb4', v: 0.62, d: 2.2, delay: 140 }, { n: 'F4', v: 0.56, d: 2.2, delay: 560 }, { n: 'Eb4', v: 0.52, d: 2.4, delay: 840 }], wait: 1.45 }
];

const NOTE_OFFSETS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
  F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11
};

function noteToMidi(noteStr) {
  const match = noteStr.match(/^([A-G][b#]?)(\d)$/);
  if (!match) return 60;
  const [, pitch, oct] = match;
  return (parseInt(oct, 10) + 1) * 12 + NOTE_OFFSETS[pitch];
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ============================================================================
// 2. DARK FELT GRAND PIANO ENGINE
// ============================================================================
class DarkFeltPianoEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.dryGain = null;
    this.reverbGain = null;
    this.pianoWave = null;
    this.hammerNoiseBuffer = null;

    this.feltDarkness = 0.76;
    this.reverbAmount = 0.70;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.soundboardWarmth = this.ctx.createBiquadFilter();
    this.soundboardWarmth.type = 'peaking';
    this.soundboardWarmth.frequency.value = 200;
    this.soundboardWarmth.Q.value = 0.85;
    this.soundboardWarmth.gain.value = 3.8;

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.68;

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = this.reverbAmount * 0.75;

    this.convolver = this.createDarkHallReverb(4.0, 2.4);
    const reverbDamping = this.ctx.createBiquadFilter();
    reverbDamping.type = 'lowpass';
    reverbDamping.frequency.value = 1250;

    this.soundboardWarmth.connect(this.dryGain);
    this.soundboardWarmth.connect(reverbDamping);
    reverbDamping.connect(this.convolver);
    this.convolver.connect(this.reverbGain);

    this.dryGain.connect(this.masterGain);
    this.reverbGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Acoustic grand piano string overtone series (1/7th hammer strike point)
    const real = new Float32Array([0, 0.0, 0.11, 0.04, 0.018, 0.008, 0.004, 0.0, 0.001]);
    const imag = new Float32Array([0, 1.0, 0.42, 0.18, 0.08, 0.035, 0.012, 0.0, 0.004]);
    this.pianoWave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    // Soft felt hammer thud transient
    const bufLen = Math.floor(this.ctx.sampleRate * 0.026);
    this.hammerNoiseBuffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = this.hammerNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const env = Math.sin((i / bufLen) * Math.PI) * Math.pow(1 - i / bufLen, 2.0);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }

  createDarkHallReverb(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        lp = lp * 0.8 + white * 0.2;
        d[i] = lp * Math.pow(1 - i / len, decay);
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  setFeltDarkness(val01) {
    this.feltDarkness = THREE.MathUtils.clamp(val01, 0.05, 0.95);
  }

  setReverbAmount(val01) {
    this.reverbAmount = THREE.MathUtils.clamp(val01, 0.05, 0.95);
    if (this.reverbGain && this.ctx) {
      this.reverbGain.gain.setTargetAtTime(this.reverbAmount * 0.85, this.ctx.currentTime, 0.05);
    }
  }

  playNote(midi, velocity = 0.55, durationSec = 2.8) {
    this.init();
    const now = this.ctx.currentTime;
    const freq = midiToFreq(midi);

    const registerScale = THREE.MathUtils.clamp(1.65 - (midi - 36) / 52, 0.55, 1.8);
    const totalDecay = Math.max(1.9, durationSec * 1.5 * registerScale);

    const voiceGain = this.ctx.createGain();
    const peakGain = 0.18 * Math.pow(velocity, 1.15);
    const sustainLevel = peakGain * 0.33;

    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(peakGain, now + 0.007);
    voiceGain.gain.exponentialRampToValueAtTime(sustainLevel, now + 0.38);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + totalDecay);

    const brightnessFactor = 1.0 - this.feltDarkness * 0.78;
    const strikeCutoff = Math.min(4400, freq * (2.4 + brightnessFactor * 6.0) * (0.65 + velocity * 0.7));
    const sustainCutoff = Math.max(170, freq * (1.2 + brightnessFactor * 1.6));

    const stringFilter = this.ctx.createBiquadFilter();
    stringFilter.type = 'lowpass';
    stringFilter.Q.value = 0.65;
    stringFilter.frequency.setValueAtTime(strikeCutoff, now);
    stringFilter.frequency.exponentialRampToValueAtTime(sustainCutoff, now + 0.68);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.setPeriodicWave(this.pianoWave);
    osc2.setPeriodicWave(this.pianoWave);

    osc1.frequency.setValueAtTime(freq * 0.9994, now);
    osc2.frequency.setValueAtTime(freq * 1.0006, now);

    const bodyOsc = this.ctx.createOscillator();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(freq, now);
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.value = 0.58;

    osc1.connect(stringFilter);
    osc2.connect(stringFilter);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(stringFilter);

    const hammerSrc = this.ctx.createBufferSource();
    hammerSrc.buffer = this.hammerNoiseBuffer;
    const hammerFilter = this.ctx.createBiquadFilter();
    hammerFilter.type = 'bandpass';
    hammerFilter.frequency.value = Math.min(380, Math.max(105, freq * 0.6));
    hammerFilter.Q.value = 1.1;
    const hammerGain = this.ctx.createGain();
    hammerGain.gain.setValueAtTime(peakGain * (0.42 + this.feltDarkness * 0.38), now);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    hammerSrc.connect(hammerFilter);
    hammerFilter.connect(hammerGain);
    hammerGain.connect(this.soundboardWarmth);

    stringFilter.connect(voiceGain);
    voiceGain.connect(this.soundboardWarmth);

    osc1.start(now);
    osc2.start(now);
    bodyOsc.start(now);
    hammerSrc.start(now);

    const stopTime = now + totalDecay + 0.05;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    bodyOsc.stop(stopTime);
  }
}

const pianoEngine = new DarkFeltPianoEngine();

// ============================================================================
// 3. ARCHITECTURAL 3D DARK GRAND PIANO SCENE
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070709);
scene.fog = new THREE.FogExp2(0x070709, 0.048);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

const CAMERA_VIEWS = [
  { pos: new THREE.Vector3(-2.1, 3.6, 5.8), look: new THREE.Vector3(0.2, 0.1, -0.9) },
  { pos: new THREE.Vector3(0, 6.2, 1.8), look: new THREE.Vector3(0, 0, -0.4) },
  { pos: new THREE.Vector3(-3.4, 1.25, 3.8), look: new THREE.Vector3(0.9, 0.05, -0.5) }
];
let currentViewIdx = 0;
camera.position.copy(CAMERA_VIEWS[0].pos);
camera.lookAt(CAMERA_VIEWS[0].look);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
container.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = new RoomEnvironment();
scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
roomEnv.dispose();

// Understated Gallery Lighting
const ambientLight = new THREE.AmbientLight(0x161820, 0.9);
scene.add(ambientLight);

const overheadKeyLight = new THREE.DirectionalLight(0xfff4e0, 2.4);
overheadKeyLight.position.set(-2, 8, 4);
scene.add(overheadKeyLight);

const subtleRimLight = new THREE.DirectionalLight(0x9ab4d8, 1.1);
subtleRimLight.position.set(5, 5, -5);
scene.add(subtleRimLight);

const warmFallboardLight = new THREE.PointLight(0xe6cda5, 2.2, 11);
warmFallboardLight.position.set(0, 2.0, 1.4);
scene.add(warmFallboardLight);

// ============================================================================
// 4. SCULPTURAL 3D KEYBOARD & HARP CONSTRUCTION
// ============================================================================
const pianoGroup = new THREE.Group();
scene.add(pianoGroup);

const FIRST_MIDI = 36; // C2
const LAST_MIDI = 86;  // D6
const WHITE_KEY_W = 0.255;
const WHITE_KEY_H = 0.17;
const WHITE_KEY_L = 1.56;
const WHITE_KEY_GAP = 0.014;

const BLACK_KEY_W = 0.142;
const BLACK_KEY_H = 0.25;
const BLACK_KEY_L = 0.98;

function isBlackMidi(midi) {
  const m = midi % 12;
  return m === 1 || m === 3 || m === 6 || m === 8 || m === 10;
}

let totalWhiteKeys = 0;
for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) {
  if (!isBlackMidi(m)) totalWhiteKeys++;
}
const keyboardSpanWidth = totalWhiteKeys * (WHITE_KEY_W + WHITE_KEY_GAP);
const startX = -keyboardSpanWidth / 2 + WHITE_KEY_W / 2;

const lacquerBlackMat = new THREE.MeshPhysicalMaterial({
  color: 0x070709,
  roughness: 0.09,
  metalness: 0.12,
  clearcoat: 1.0,
  clearcoatRoughness: 0.04
});

const woolFeltMat = new THREE.MeshStandardMaterial({
  color: 0x4a101b,
  roughness: 0.92
});

// Keybed foundation & Cheek blocks
const keybedBase = new THREE.Mesh(
  new THREE.BoxGeometry(keyboardSpanWidth + 0.9, 0.34, 2.2),
  lacquerBlackMat
);
keybedBase.position.set(0, -0.22, 0.15);
pianoGroup.add(keybedBase);

[-1, 1].forEach((side) => {
  const cheek = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.50, 2.15),
    lacquerBlackMat
  );
  cheek.position.set(side * (keyboardSpanWidth / 2 + 0.22), -0.02, 0.15);
  pianoGroup.add(cheek);
});

const fallboard = new THREE.Mesh(
  new THREE.BoxGeometry(keyboardSpanWidth + 0.6, 0.64, 0.18),
  lacquerBlackMat
);
fallboard.position.set(0, 0.25, -0.74);
pianoGroup.add(fallboard);

const feltStrip = new THREE.Mesh(
  new THREE.BoxGeometry(keyboardSpanWidth + 0.1, 0.07, 0.08),
  woolFeltMat
);
feltStrip.position.set(0, 0.08, -0.63);
pianoGroup.add(feltStrip);

const soundboard = new THREE.Mesh(
  new THREE.BoxGeometry(keyboardSpanWidth + 0.7, 0.14, 4.6),
  new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 0.72 })
);
soundboard.position.set(0, -0.15, -3.1);
pianoGroup.add(soundboard);

// Keys & Strings
const keyMap = new Map();
const interactableKeyMeshes = [];

const whiteGeo = new THREE.BoxGeometry(WHITE_KEY_W, WHITE_KEY_H, WHITE_KEY_L);
whiteGeo.translate(0, 0, WHITE_KEY_L / 2);

const blackGeo = new THREE.BoxGeometry(BLACK_KEY_W, BLACK_KEY_H, BLACK_KEY_L);
blackGeo.translate(0, 0, BLACK_KEY_L / 2);

let whiteIndex = 0;
for (let midi = FIRST_MIDI; midi <= LAST_MIDI; midi++) {
  const black = isBlackMidi(midi);
  let xPos = 0;

  if (!black) {
    xPos = startX + whiteIndex * (WHITE_KEY_W + WHITE_KEY_GAP);
    whiteIndex++;
  } else {
    xPos = startX + (whiteIndex - 1) * (WHITE_KEY_W + WHITE_KEY_GAP) + (WHITE_KEY_W + WHITE_KEY_GAP) * 0.5;
  }

  // Warm natural bone ivory for white keys, satin ebony for sharps/flats
  const baseColorHex = black ? 0x101013 : 0xe2ddd2;
  const mat = new THREE.MeshPhysicalMaterial({
    color: baseColorHex,
    roughness: black ? 0.28 : 0.15,
    metalness: 0.04,
    clearcoat: black ? 0.4 : 0.85,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0
  });

  const pivot = new THREE.Group();
  pivot.position.set(xPos, black ? 0.08 : 0.0, -0.62);

  const keyMesh = new THREE.Mesh(black ? blackGeo : whiteGeo, mat);
  keyMesh.userData = { midi };
  pivot.add(keyMesh);
  pianoGroup.add(pivot);
  interactableKeyMeshes.push(keyMesh);

  // Subtle bronze/steel string receding into the dark soundboard
  const normalizedPitch = (midi - FIRST_MIDI) / (LAST_MIDI - FIRST_MIDI);
  const stringLen = 4.2 - normalizedPitch * 2.4;
  const stringGeo = new THREE.CylinderGeometry(0.01, 0.01, stringLen, 6);
  stringGeo.rotateX(Math.PI / 2);
  const stringMat = new THREE.MeshBasicMaterial({
    color: 0x5c4d35,
    transparent: true,
    opacity: 0.42
  });
  const stringMesh = new THREE.Mesh(stringGeo, stringMat);
  stringMesh.position.set(xPos, 0.02, -0.85 - stringLen / 2);
  pianoGroup.add(stringMesh);

  keyMap.set(midi, {
    midi,
    pivot,
    mesh: keyMesh,
    mat,
    stringMesh,
    stringMat,
    isBlack: black,
    depress: 0,
    glow: 0,
    xPos
  });
}

function triggerPianoKey(midi, velocity = 0.55, durationSec = 2.6) {
  pianoEngine.playNote(midi, velocity, durationSec);

  const keyObj = keyMap.get(midi);
  if (keyObj) {
    keyObj.depress = 1.0;
    keyObj.glow = 1.0;
  }
}

// ============================================================================
// 5. SEQUENCER & MINIMALIST CONTROLS
// ============================================================================
let hasBegun = false;
let scoreIndex = 0;
let isPlayingScore = false;
let isTouchPerformMode = false;
let tempoMultiplier = 1.0;
let stepTimeout = null;

const whisperPrompt = document.getElementById('whisper-prompt');
const harmonicLabel = document.getElementById('harmonic-label');
const btnPlay = document.getElementById('btn-play');
const playLabel = document.getElementById('play-label');
const statusDot = document.getElementById('status-dot');
const btnMode = document.getElementById('btn-mode');
const btnCamera = document.getElementById('btn-camera');

function playCurrentScoreStep() {
  const step = CLAIR_DE_LUNE_SCORE[scoreIndex];
  scoreIndex = (scoreIndex + 1) % CLAIR_DE_LUNE_SCORE.length;

  harmonicLabel.textContent = step.label;

  step.notes.forEach((nObj) => {
    const midi = noteToMidi(nObj.n);
    const delayMs = (nObj.delay || 0) / tempoMultiplier;
    setTimeout(() => {
      triggerPianoKey(midi, nObj.v, nObj.d);
    }, delayMs);
  });

  if (isPlayingScore && !isTouchPerformMode) {
    const nextWaitMs = (step.wait * 1000) / tempoMultiplier;
    clearTimeout(stepTimeout);
    stepTimeout = setTimeout(playCurrentScoreStep, nextWaitMs);
  }
}

function ensureStarted() {
  if (hasBegun) return;
  hasBegun = true;
  whisperPrompt.classList.add('fade-out');
  pianoEngine.init();
  isPlayingScore = true;
  playLabel.textContent = 'Playing';
  statusDot.style.opacity = '1';
  if (!isTouchPerformMode) {
    playCurrentScoreStep();
  }
}

btnPlay.addEventListener('click', () => {
  if (!hasBegun) {
    ensureStarted();
    return;
  }
  pianoEngine.init();
  isPlayingScore = !isPlayingScore;
  playLabel.textContent = isPlayingScore ? 'Playing' : 'Paused';
  statusDot.style.opacity = isPlayingScore ? '1' : '0.3';
  clearTimeout(stepTimeout);
  if (isPlayingScore && !isTouchPerformMode) {
    playCurrentScoreStep();
  }
});

btnMode.addEventListener('click', () => {
  ensureStarted();
  isTouchPerformMode = !isTouchPerformMode;
  btnMode.textContent = isTouchPerformMode ? 'Mode: Perform by touch' : 'Mode: Auto';
  btnMode.classList.toggle('active', isTouchPerformMode);
  clearTimeout(stepTimeout);
  if (!isTouchPerformMode && isPlayingScore) {
    playCurrentScoreStep();
  }
});

btnCamera.addEventListener('click', () => {
  currentViewIdx = (currentViewIdx + 1) % CAMERA_VIEWS.length;
});

document.getElementById('slider-felt').addEventListener('input', (e) => {
  pianoEngine.setFeltDarkness(Number(e.target.value) / 100);
});

document.getElementById('slider-reverb').addEventListener('input', (e) => {
  pianoEngine.setReverbAmount(Number(e.target.value) / 100);
});

document.getElementById('slider-tempo').addEventListener('input', (e) => {
  tempoMultiplier = Number(e.target.value) / 100;
});

// Raycasting for 3D Piano Keys
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let isPointerDown = false;
let lastHoveredMidi = null;

function handleKeyInteraction(clientX, clientY, isInitialDown = false) {
  if (!hasBegun) {
    ensureStarted();
  }

  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(interactableKeyMeshes, false);
  if (hits.length > 0) {
    const midi = hits[0].object.userData.midi;
    if (isInitialDown || midi !== lastHoveredMidi) {
      lastHoveredMidi = midi;
      if (isTouchPerformMode && isInitialDown) {
        playCurrentScoreStep();
      } else {
        triggerPianoKey(midi, 0.58, 2.6);
      }
    }
  } else if (isInitialDown && isTouchPerformMode) {
    playCurrentScoreStep();
  }
}

container.addEventListener('pointerdown', (e) => {
  isPointerDown = true;
  handleKeyInteraction(e.clientX, e.clientY, true);
});

window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (isPointerDown && !isTouchPerformMode) {
    handleKeyInteraction(e.clientX, e.clientY, false);
  }
});

window.addEventListener('pointerup', () => {
  isPointerDown = false;
  lastHoveredMidi = null;
});

const KEYBOARD_TO_MIDI = {
  a: 61, s: 63, d: 65, f: 66, g: 68, h: 70, j: 72, k: 73, l: 75, ';': 77
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (!hasBegun) {
    ensureStarted();
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    playCurrentScoreStep();
    return;
  }
  const midi = KEYBOARD_TO_MIDI[e.key.toLowerCase()];
  if (midi) {
    triggerPianoKey(midi, 0.58, 2.6);
  }
});

// ============================================================================
// 6. ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();
const currentLookAt = new THREE.Vector3().copy(CAMERA_VIEWS[0].look);

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  keyMap.forEach((k) => {
    k.depress = k.depress > 0.001 ? THREE.MathUtils.lerp(k.depress, 0, dt * 8.0) : 0;
    k.glow = k.glow > 0.001 ? THREE.MathUtils.lerp(k.glow, 0, dt * 2.4) : 0;

    // Realistic piano key dip around balance rail
    k.pivot.rotation.x = k.depress * 0.065;

    // Subtle warm ivory/amber reflection on struck key
    k.mat.emissive.setHex(0xc8ad78);
    k.mat.emissiveIntensity = k.glow * 0.24;

    // Subtle string shimmer on the harp
    k.stringMat.opacity = 0.38 + k.glow * 0.52;
    k.stringMat.color.setHex(k.glow > 0.1 ? 0xd9bf8c : 0x5c4d35);
    k.stringMesh.position.x = k.xPos + (k.glow > 0.05 ? Math.sin(elapsed * 95) * 0.004 * k.glow : 0);
  });

  const view = CAMERA_VIEWS[currentViewIdx];
  const aspect = window.innerWidth / window.innerHeight;
  const mobileBackoff = aspect < 1.0 ? (1.0 - aspect) * 4.0 : 0;

  const targetX = view.pos.x + pointer.x * 0.22;
  const targetY = view.pos.y + pointer.y * 0.14;
  const targetZ = view.pos.z + mobileBackoff;

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, dt * 4);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, dt * 4);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, dt * 4);

  currentLookAt.lerp(view.look, dt * 5);
  camera.lookAt(currentLookAt);

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
