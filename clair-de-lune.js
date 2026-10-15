import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================================================
// 1. AUTHENTIC DEBUSSY "CLAIR DE LUNE" SCORE (IN D♭ MAJOR, 9/8 RUBATO)
// ============================================================================
// Each step represents a harmonic/melodic phrase of Clair de Lune:
// - bass: deep sub-bass MIDI root (or null to sustain previous)
// - chord: warm analog pad dyad/triad MIDI notes
// - melody: array of { midi, delay, dur, vel } for expressive rubato triplets & lead
// - label: chord symbol displayed in the HUD
// - wait: time (seconds) before next step in Auto-Flow mode
const CLAIR_DE_LUNE_SCORE = [
  // Measure 1: Iconic quiet opening in Db Major
  {
    label: 'D♭maj7 (sus)',
    bass: 37, // Db2
    chord: [61, 65, 68], // Db4, F4, Ab4
    melody: [{ midi: 68, delay: 0, dur: 1.6, vel: 0.6 }],
    wait: 1.15
  },
  {
    label: 'D♭maj7',
    bass: null,
    chord: [61, 65],
    melody: [
      { midi: 77, delay: 0.0, dur: 2.2, vel: 0.92 }, // High F5
      { midi: 73, delay: 0.95, dur: 2.0, vel: 0.85 } // Db5
    ],
    wait: 2.25
  },
  // Measure 2: Gbmaj7 suspension & triplet ornament (Bb4 - C5 - Db5 - Bb4)
  {
    label: 'G♭maj9 / D♭',
    bass: 37,
    chord: [54, 63, 66], // Gb3, Eb4, Gb4
    melody: [
      { midi: 70, delay: 0.0, dur: 0.48, vel: 0.78 }, // Bb4
      { midi: 72, delay: 0.38, dur: 0.48, vel: 0.82 }, // C5
      { midi: 73, delay: 0.76, dur: 0.65, vel: 0.88 }, // Db5
      { midi: 70, delay: 1.22, dur: 2.1, vel: 0.76 }  // Bb4
    ],
    wait: 2.75
  },
  // Measure 3: Ebm7 / Ab7 expressive triplet (Ab4 - Bb4 - Ab4 - Db5 - Bb4 - Ab4)
  {
    label: 'E♭m9 / D♭',
    bass: 39, // Eb2
    chord: [54, 61, 65], // Gb3, Db4, F4
    melody: [
      { midi: 68, delay: 0.0, dur: 0.45, vel: 0.75 }, // Ab4
      { midi: 70, delay: 0.36, dur: 0.45, vel: 0.8 },  // Bb4
      { midi: 68, delay: 0.72, dur: 0.55, vel: 0.78 }, // Ab4
      { midi: 73, delay: 1.15, dur: 0.55, vel: 0.9 },  // Db5
      { midi: 70, delay: 1.55, dur: 0.55, vel: 0.78 }, // Bb4
      { midi: 68, delay: 1.95, dur: 1.6, vel: 0.72 }  // Ab4
    ],
    wait: 2.65
  },
  // Measure 4: Resolution to Gb4 -> F4
  {
    label: 'A♭13sus4',
    bass: 44, // Ab2
    chord: [56, 63, 66], // Ab3, Eb4, Gb4
    melody: [
      { midi: 66, delay: 0.0, dur: 1.4, vel: 0.78 }, // Gb4
      { midi: 68, delay: 0.7, dur: 0.9, vel: 0.72 }, // Ab4
      { midi: 66, delay: 1.25, dur: 1.2, vel: 0.7 }  // Gb4
    ],
    wait: 2.15
  },
  {
    label: 'D♭maj9',
    bass: 37, // Db2
    chord: [49, 56, 61, 65], // Db3, Ab3, Db4, F4
    melody: [
      { midi: 65, delay: 0.0, dur: 2.4, vel: 0.85 } // F4
    ],
    wait: 2.1
  },
  // Measure 5-6: Second lower statement (F4 - Db4 -> Bb3 - C4 - Db4 - F4 - Db4)
  {
    label: 'D♭6/9',
    bass: 37,
    chord: [53, 56, 61],
    melody: [
      { midi: 65, delay: 0.0, dur: 1.2, vel: 0.8 },  // F4
      { midi: 61, delay: 0.85, dur: 1.5, vel: 0.76 } // Db4
    ],
    wait: 1.9
  },
  {
    label: 'B♭m9',
    bass: 34, // Bb1
    chord: [53, 58, 61], // F3, Bb3, Db4
    melody: [
      { midi: 58, delay: 0.0, dur: 0.42, vel: 0.75 }, // Bb3
      { midi: 60, delay: 0.35, dur: 0.42, vel: 0.78 }, // C4
      { midi: 61, delay: 0.70, dur: 0.65, vel: 0.85 }, // Db4
      { midi: 65, delay: 1.20, dur: 0.85, vel: 0.9 },  // F4
      { midi: 61, delay: 1.85, dur: 1.5, vel: 0.78 }  // Db4
    ],
    wait: 2.65
  },
  // Measure 7: Eb7 / Abmaj9 rising phrase (C4 - Db4 - Eb4 - Ab4 - F4)
  {
    label: 'E♭m11',
    bass: 39, // Eb2
    chord: [51, 58, 63], // Eb3, Bb3, Eb4
    melody: [
      { midi: 60, delay: 0.0, dur: 0.42, vel: 0.76 }, // C4
      { midi: 61, delay: 0.35, dur: 0.42, vel: 0.8 },  // Db4
      { midi: 63, delay: 0.70, dur: 0.65, vel: 0.86 }, // Eb4
      { midi: 68, delay: 1.22, dur: 0.95, vel: 0.94 }, // Ab4
      { midi: 65, delay: 1.90, dur: 1.5, vel: 0.82 }  // F4
    ],
    wait: 2.65
  },
  // Measure 8: Descending sigh (Eb4 - Db4 - C4 - Bb3)
  {
    label: 'A♭7sus4',
    bass: 32, // Ab1
    chord: [56, 61, 63],
    melody: [
      { midi: 63, delay: 0.0, dur: 0.5, vel: 0.8 },  // Eb4
      { midi: 61, delay: 0.42, dur: 0.5, vel: 0.76 }, // Db4
      { midi: 60, delay: 0.84, dur: 0.6, vel: 0.74 }, // C4
      { midi: 63, delay: 1.35, dur: 0.7, vel: 0.8 },  // Eb4
      { midi: 61, delay: 1.85, dur: 1.6, vel: 0.75 }  // Db4
    ],
    wait: 2.6
  },
  // Measure 9-12: Deep Blade Runner Sub-Octave Crescendo & Rolling Arpeggios
  {
    label: 'D♭maj9 (SUB)',
    bass: 25, // Deep Db1 sub-bass!
    chord: [49, 56, 61, 65],
    melody: [
      { midi: 56, delay: 0.0, dur: 0.35, vel: 0.65 },
      { midi: 61, delay: 0.28, dur: 0.35, vel: 0.7 },
      { midi: 65, delay: 0.56, dur: 0.35, vel: 0.78 },
      { midi: 68, delay: 0.84, dur: 1.8, vel: 0.92 }, // Ab4
      { midi: 73, delay: 1.5, dur: 2.2, vel: 0.96 }   // Db5
    ],
    wait: 2.6
  },
  {
    label: 'G♭maj7#11',
    bass: 30, // Gb1
    chord: [54, 58, 61, 65],
    melody: [
      { midi: 70, delay: 0.0, dur: 0.4, vel: 0.85 },  // Bb4
      { midi: 73, delay: 0.35, dur: 0.4, vel: 0.88 }, // Db5
      { midi: 75, delay: 0.70, dur: 0.55, vel: 0.92 }, // Eb5
      { midi: 77, delay: 1.15, dur: 1.9, vel: 0.98 }, // F5
      { midi: 73, delay: 1.85, dur: 1.6, vel: 0.86 }  // Db5
    ],
    wait: 2.65
  },
  {
    label: 'Fm11',
    bass: 29, // F1
    chord: [53, 56, 60, 65],
    melody: [
      { midi: 72, delay: 0.0, dur: 0.45, vel: 0.84 }, // C5
      { midi: 73, delay: 0.38, dur: 0.45, vel: 0.86 }, // Db5
      { midi: 75, delay: 0.76, dur: 0.85, vel: 0.94 }, // Eb5
      { midi: 68, delay: 1.45, dur: 1.8, vel: 0.82 }  // Ab4
    ],
    wait: 2.4
  },
  {
    label: 'E♭m9',
    bass: 27, // Eb1
    chord: [51, 54, 58, 65],
    melody: [
      { midi: 66, delay: 0.0, dur: 0.45, vel: 0.8 },  // Gb4
      { midi: 68, delay: 0.38, dur: 0.45, vel: 0.84 }, // Ab4
      { midi: 70, delay: 0.76, dur: 0.95, vel: 0.9 },  // Bb4
      { midi: 65, delay: 1.5, dur: 1.8, vel: 0.8 }    // F4
    ],
    wait: 2.35
  },
  {
    label: 'A♭13 (NOCTURNE)',
    bass: 32, // Ab1
    chord: [56, 61, 63, 66],
    melody: [
      { midi: 63, delay: 0.0, dur: 0.5, vel: 0.78 },  // Eb4
      { midi: 65, delay: 0.45, dur: 0.5, vel: 0.82 }, // F4
      { midi: 66, delay: 0.90, dur: 0.7, vel: 0.85 }, // Gb4
      { midi: 63, delay: 1.5, dur: 1.6, vel: 0.76 }   // Eb4
    ],
    wait: 2.35
  },
  {
    label: 'D♭maj9 (RESOLVE)',
    bass: 25, // Db1
    chord: [49, 56, 60, 65],
    melody: [
      { midi: 61, delay: 0.0, dur: 0.4, vel: 0.8 },   // Db4
      { midi: 65, delay: 0.35, dur: 0.4, vel: 0.82 }, // F4
      { midi: 68, delay: 0.70, dur: 0.4, vel: 0.86 }, // Ab4
      { midi: 72, delay: 1.05, dur: 0.5, vel: 0.9 },  // C5
      { midi: 73, delay: 1.45, dur: 2.8, vel: 0.95 }  // Db5
    ],
    wait: 3.1
  }
];

// 9 Laser Harp Monolith Scale Notes (D♭ Major / B♭ Minor Pentatonic + Maj7)
const HARP_MONOLITH_NOTES = [
  { midi: 61, name: 'D♭4', color: 0x00f3ff },
  { midi: 63, name: 'E♭4', color: 0x5a7dff },
  { midi: 65, name: 'F4',  color: 0xff007f },
  { midi: 66, name: 'G♭4', color: 0x9d4edd },
  { midi: 68, name: 'A♭4', color: 0x00f3ff },
  { midi: 70, name: 'B♭4', color: 0xff007f },
  { midi: 72, name: 'C5',  color: 0x5a7dff },
  { midi: 73, name: 'D♭5', color: 0x00f3ff },
  { midi: 77, name: 'F5',  color: 0xff55aa }
];

// ============================================================================
// 2. DARK SYNTH WEB AUDIO ENGINE (CS-80 BRASS/PAD + SHIMMER + CATHEDRAL REVERB)
// ============================================================================
class ClairDeLuneSynth {
  constructor() {
    this.ctx = null;
    this.masterFilter = null;
    this.masterGain = null;
    this.reverbNode = null;
    this.delayNode = null;
    this.analyser = null;
    this.freqData = new Uint8Array(64);

    // Live interactive expression parameters (0..1)
    this.filterNorm = 0.52;   // Controlled by Y-axis
    this.detuneNorm = 0.5;    // Controlled by X-axis
    this.droneActive = false;
    this.droneOscs = [];
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    // Master interactive CS-80 Low-Pass Filter
    this.masterFilter = this.ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 1420;
    this.masterFilter.Q.value = 2.4;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.85;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    // Deep 3.8s Dark Cathedral Reverb
    this.reverbNode = this.createDarkReverb(3.8, 2.1);
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.52;

    // Stereo Tape Delay
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.42;
    const delayFb = this.ctx.createGain();
    delayFb.gain.value = 0.34;
    const delayFilter = this.ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1800;

    this.delayNode.connect(delayFilter);
    delayFilter.connect(delayFb);
    delayFb.connect(this.delayNode);
    delayFilter.connect(this.masterGain);

    this.masterFilter.connect(this.masterGain);
    this.masterFilter.connect(this.reverbNode);
    this.masterFilter.connect(this.delayNode);
    this.reverbNode.connect(reverbGain);
    reverbGain.connect(this.masterGain);

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  createDarkReverb(duration, decay) {
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = impulse;
    return conv;
  }

  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  setExpression(normX, normY) {
    this.detuneNorm = THREE.MathUtils.clamp(normX, 0, 1);
    this.filterNorm = THREE.MathUtils.clamp(normY, 0, 1);

    if (this.ctx && this.masterFilter) {
      // Exponential mapping from 260 Hz (dark underwater) to 4600 Hz (soaring CS-80 brass)
      const cutoff = 260 * Math.pow(17.5, this.filterNorm);
      this.masterFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.06);
      return Math.round(cutoff);
    }
    return 1420;
  }

  playStep(step, onNoteTriggered) {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;

    // 1. Deep Sub-Bass Drone Root
    if (step.bass !== null) {
      this.triggerSubBass(this.midiToFreq(step.bass), now, 3.0);
    }

    // 2. Warm Analog Pad Dyad/Chord
    if (Array.isArray(step.chord)) {
      this.triggerWarmPad(step.chord, now, 2.7);
    }

    // 3. Expressive CS-80 Melody & Ornaments
    if (Array.isArray(step.melody)) {
      step.melody.forEach((m) => {
        this.triggerCS80Lead(this.midiToFreq(m.midi), now + m.delay, m.dur, m.vel);
        if (typeof onNoteTriggered === 'function') {
          setTimeout(() => onNoteTriggered(m.midi), m.delay * 1000);
        }
      });
    }
  }

  triggerSubBass(freq, time, duration) {
    const sub = this.ctx.createOscillator();
    const saw = this.ctx.createOscillator();
    sub.type = 'sine';
    saw.type = 'sawtooth';
    sub.frequency.setValueAtTime(freq, time);
    saw.frequency.setValueAtTime(freq, time);

    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(240, time);
    subFilter.frequency.exponentialRampToValueAtTime(68, time + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.28, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    sub.connect(subFilter);
    saw.connect(subFilter);
    subFilter.connect(gain);
    gain.connect(this.masterGain);

    sub.start(time);
    saw.start(time);
    sub.stop(time + duration + 0.05);
    saw.stop(time + duration + 0.05);
  }

  triggerWarmPad(midiNotes, time, duration) {
    const padGain = this.ctx.createGain();
    padGain.gain.setValueAtTime(0.001, time);
    padGain.gain.linearRampToValueAtTime(0.065, time + 0.35);
    padGain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    padGain.connect(this.masterFilter);

    const spread = 6 + this.detuneNorm * 14;
    midiNotes.forEach((midi) => {
      const freq = this.midiToFreq(midi);
      [-spread, spread].forEach((det) => {
        const osc = this.ctx.createOscillator();
        osc.type = det < 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime(det, time);
        osc.connect(padGain);
        osc.start(time);
        osc.stop(time + duration + 0.05);
      });
    });
  }

  triggerCS80Lead(freq, time, duration, vel = 0.85) {
    const leadGain = this.ctx.createGain();
    const peak = 0.14 * vel;
    leadGain.gain.setValueAtTime(0.001, time);
    leadGain.gain.linearRampToValueAtTime(peak, time + 0.045);
    leadGain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    const voiceFilter = this.ctx.createBiquadFilter();
    voiceFilter.type = 'lowpass';
    const envTop = 900 + this.filterNorm * 3800;
    voiceFilter.frequency.setValueAtTime(envTop * 0.4, time);
    voiceFilter.frequency.linearRampToValueAtTime(envTop, time + 0.12);
    voiceFilter.frequency.exponentialRampToValueAtTime(360, time + duration);
    voiceFilter.Q.value = 2.8;

    leadGain.connect(voiceFilter);
    voiceFilter.connect(this.masterFilter);

    const detuneCents = 5 + this.detuneNorm * 12;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq, time);
    osc1.detune.setValueAtTime(-detuneCents, time);
    osc2.detune.setValueAtTime(detuneCents, time);

    osc1.connect(leadGain);
    osc2.connect(leadGain);
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.04);
    osc2.stop(time + duration + 0.04);

    // Celestial octave-up shimmer bell when cursor/finger is in upper half
    if (this.filterNorm > 0.35) {
      const shimmerOsc = this.ctx.createOscillator();
      const shimmerGain = this.ctx.createGain();
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(freq * 2, time);
      const shimLevel = (this.filterNorm - 0.35) * 0.065 * vel;
      shimmerGain.gain.setValueAtTime(0.0005, time);
      shimmerGain.gain.linearRampToValueAtTime(shimLevel, time + 0.02);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0005, time + duration * 0.75);

      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(this.masterFilter);
      shimmerOsc.start(time);
      shimmerOsc.stop(time + duration);
    }
  }

  pluckHarpMonolith(midi) {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime;
    const freq = this.midiToFreq(midi);
    this.triggerCS80Lead(freq, now, 1.65, 0.72);
  }

  toggleFreezeDrone(chordMidis = [37, 49, 61, 65, 68]) {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    if (this.droneActive) {
      this.droneOscs.forEach(({ osc, gain }) => {
        try {
          gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
          osc.stop(this.ctx.currentTime + 0.9);
        } catch {}
      });
      this.droneOscs = [];
      this.droneActive = false;
      return false;
    } else {
      const now = this.ctx.currentTime;
      chordMidis.forEach((m) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = m < 45 ? 'sine' : 'sawtooth';
        osc.frequency.setValueAtTime(this.midiToFreq(m), now);
        osc.detune.value = (Math.random() - 0.5) * 14;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(m < 45 ? 0.14 : 0.035, now + 0.8);
        osc.connect(gain);
        gain.connect(this.masterFilter);
        osc.start(now);
        this.droneOscs.push({ osc, gain });
      });
      this.droneActive = true;
      return true;
    }
  }

  getEnergy() {
    if (!this.analyser) return { bass: 0, mid: 0 };
    this.analyser.getByteFrequencyData(this.freqData);
    let b = 0;
    let m = 0;
    for (let i = 0; i < 8; i++) b += this.freqData[i];
    for (let i = 8; i < 24; i++) m += this.freqData[i];
    return {
      bass: b / (8 * 255),
      mid: m / (16 * 255)
    };
  }
}

// ============================================================================
// 3. THREE.JS SCENE: ECLIPSED CYBER-MOON, DARK MIRROR OCEAN & 9 LASER MONOLITHS
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03010a);
scene.fog = new THREE.FogExp2(0x050214, 0.018);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 3.2, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
container.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.25,
  0.5,
  0.2
);
composer.addPass(bloomPass);

// Lighting
scene.add(new THREE.AmbientLight(0x1f113d, 1.5));
const moonLight = new THREE.PointLight(0x00f3ff, 8, 90);
moonLight.position.set(0, 14, -28);
scene.add(moonLight);

const magentaRim = new THREE.PointLight(0xff007f, 6, 70);
magentaRim.position.set(0, 4, -15);
scene.add(magentaRim);

// 1. Giant Eclipsed Cyber-Moon with Glowing Corona Rings
const moonGroup = new THREE.Group();
moonGroup.position.set(0, 11.5, -36);
scene.add(moonGroup);

const darkSphereGeo = new THREE.SphereGeometry(7.2, 48, 48);
const darkSphereMat = new THREE.MeshStandardMaterial({
  color: 0x04010c,
  roughness: 0.9,
  metalness: 0.2
});
const darkMoon = new THREE.Mesh(darkSphereGeo, darkSphereMat);
moonGroup.add(darkMoon);

const coronaGeo = new THREE.RingGeometry(7.25, 8.15, 64);
const coronaMat = new THREE.MeshBasicMaterial({
  color: 0x00f3ff,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85
});
const coronaRing = new THREE.Mesh(coronaGeo, coronaMat);
moonGroup.add(coronaRing);

const outerHaloGeo = new THREE.RingGeometry(8.2, 10.6, 64);
const outerHaloMat = new THREE.MeshBasicMaterial({
  color: 0xff007f,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.28
});
const outerHalo = new THREE.Mesh(outerHaloGeo, outerHaloMat);
moonGroup.add(outerHalo);

// Orbital Gyroscope Ring around the Moon
const orbitalRingGeo = new THREE.TorusGeometry(10.8, 0.06, 12, 96);
const orbitalRingMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.55 });
const orbitalRing = new THREE.Mesh(orbitalRingGeo, orbitalRingMat);
orbitalRing.rotation.x = Math.PI / 2.6;
moonGroup.add(orbitalRing);

// 2. Animated Dark Synthwave Ocean Mesh (with wireframe + reflective surface)
const oceanGeo = new THREE.PlaneGeometry(120, 90, 72, 54);
oceanGeo.rotateX(-Math.PI / 2);
const oceanBaseY = new Float32Array(oceanGeo.attributes.position.count);

const oceanMat = new THREE.MeshStandardMaterial({
  color: 0x060316,
  roughness: 0.2,
  metalness: 0.85,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});
const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
oceanMesh.position.set(0, -1.2, -14);
scene.add(oceanMesh);

const oceanWireMat = new THREE.MeshBasicMaterial({
  color: 0x3b1778,
  wireframe: true,
  transparent: true,
  opacity: 0.34
});
const oceanWire = new THREE.Mesh(oceanGeo, oceanWireMat);
oceanWire.position.copy(oceanMesh.position);
scene.add(oceanWire);

// 3. Nine Interactive Laser Harp Monoliths rising from the Dark Ocean
const monoliths = [];
const monolithMeshes = [];

HARP_MONOLITH_NOTES.forEach((item, idx) => {
  const t = (idx / (HARP_MONOLITH_NOTES.length - 1)) * 2 - 1; // -1 to +1
  const x = t * 11.5;
  const z = -4.5 - (1 - Math.abs(t)) * 5.5;
  const height = 9.5 + (1 - Math.abs(t)) * 3.5;

  const pillarGeo = new THREE.BoxGeometry(0.28, height, 0.28);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x0a051d,
    emissive: item.color,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.8
  });
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.set(x, height / 2 - 1.2, z);
  pillar.userData = { monolithIndex: idx };
  scene.add(pillar);
  monolithMeshes.push(pillar);

  // Laser core string running through the monolith
  const coreGeo = new THREE.CylinderGeometry(0.04, 0.04, height + 8, 8);
  const coreMat = new THREE.MeshBasicMaterial({
    color: item.color,
    transparent: true,
    opacity: 0.65
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.set(x, (height + 8) / 2 - 1.2, z);
  scene.add(core);

  monoliths.push({
    idx,
    item,
    pillar,
    pillarMat,
    core,
    coreMat,
    energy: 0,
    x,
    z
  });
});

// 4. Expanding Shockwave Ripples on the Ocean Surface when Chords/Notes Play
const activeRipples = [];
const rippleGeo = new THREE.RingGeometry(0.4, 0.62, 48);
rippleGeo.rotateX(-Math.PI / 2);

function spawnOceanRipple(x = 0, z = -6, colorHex = 0x00f3ff) {
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  const mesh = new THREE.Mesh(rippleGeo, mat);
  mesh.position.set(x, -0.95, z);
  scene.add(mesh);
  activeRipples.push({ mesh, mat, scale: 1.0, opacity: 0.9 });
}

// 5. Floating Bioluminescent Stardust Particles
const starCount = 700;
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  starPos[i * 3] = (Math.random() - 0.5) * 90;
  starPos[i * 3 + 1] = Math.random() * 35 - 1;
  starPos[i * 3 + 2] = -Math.random() * 65 + 10;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  color: 0x00f3ff,
  size: 0.14,
  transparent: true,
  opacity: 0.75
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// ============================================================================
// 4. SEQUENCER, INTERACTION MODES & UI CONTROLS
// ============================================================================
const synth = new ClairDeLuneSynth();
let scoreIndex = 0;
let isPlaying = false;
let mode = 'auto'; // 'auto' | 'conduct'
let autoTimer = null;

const startVeil = document.getElementById('start-veil');
const btnStartExp = document.getElementById('btn-start-experience');
const btnPlayPause = document.getElementById('btn-play-pause');
const playIcon = document.getElementById('play-icon');
const playLabel = document.getElementById('play-label');
const btnModeToggle = document.getElementById('btn-mode-toggle');
const modeLabel = document.getElementById('mode-label');
const chordReadout = document.getElementById('chord-readout');
const filterReadout = document.getElementById('filter-readout');
const shimmerReadout = document.getElementById('shimmer-readout');
const stepCounter = document.getElementById('step-counter');
const btnTriggerNote = document.getElementById('btn-trigger-note');
const btnDroneHold = document.getElementById('btn-drone-hold');
const droneLabel = document.getElementById('drone-label');

// Minimize card toggle
const nocturneCard = document.getElementById('nocturne-card');
const btnMinimizeNocturne = document.getElementById('btn-minimize-nocturne');
const nocturneCollapseIcon = document.getElementById('nocturne-collapse-icon');
const nocturneTitleBar = document.getElementById('nocturne-title-bar');

function toggleNocturneMinimize() {
  const collapsed = nocturneCard.classList.toggle('collapsed');
  nocturneCollapseIcon.textContent = collapsed ? '+' : '−';
}
btnMinimizeNocturne.addEventListener('click', toggleNocturneMinimize);
nocturneTitleBar.addEventListener('click', toggleNocturneMinimize);

function highlightMonolithByMidi(midi) {
  const pitchClass = midi % 12;
  monoliths.forEach((m) => {
    if (m.item.midi % 12 === pitchClass) {
      m.energy = 1.4;
      spawnOceanRipple(m.x, m.z, m.item.color);
    }
  });
}

function triggerCurrentScoreStep(customRipplePos = null) {
  const step = CLAIR_DE_LUNE_SCORE[scoreIndex];
  chordReadout.textContent = `CHORD: ${step.label}`;
  stepCounter.textContent = `${String(scoreIndex + 1).padStart(2, '0')} / ${CLAIR_DE_LUNE_SCORE.length}`;

  synth.playStep(step, (midiNote) => {
    highlightMonolithByMidi(midiNote);
  });

  if (customRipplePos) {
    spawnOceanRipple(customRipplePos.x, customRipplePos.z, 0xff007f);
  } else {
    spawnOceanRipple(0, -8, 0x00f3ff);
  }

  scoreIndex = (scoreIndex + 1) % CLAIR_DE_LUNE_SCORE.length;
  return step.wait;
}

function scheduleNextAutoStep() {
  if (autoTimer) clearTimeout(autoTimer);
  if (!isPlaying || mode !== 'auto') return;

  const waitSec = triggerCurrentScoreStep();
  autoTimer = setTimeout(scheduleNextAutoStep, waitSec * 1000);
}

btnStartExp.addEventListener('click', () => {
  startVeil.classList.add('hidden-veil');
  isPlaying = true;
  scheduleNextAutoStep();
});

btnPlayPause.addEventListener('click', () => {
  isPlaying = !isPlaying;
  if (isPlaying) {
    playIcon.textContent = '⏸';
    playLabel.textContent = 'FLOWING';
    if (mode === 'auto') scheduleNextAutoStep();
  } else {
    playIcon.textContent = '▶';
    playLabel.textContent = 'PAUSED';
    if (autoTimer) clearTimeout(autoTimer);
  }
});

btnModeToggle.addEventListener('click', () => {
  if (mode === 'auto') {
    mode = 'conduct';
    if (autoTimer) clearTimeout(autoTimer);
    modeLabel.textContent = 'MODE: TAP TO CONDUCT';
  } else {
    mode = 'auto';
    modeLabel.textContent = 'MODE: AUTO-FLOW';
    if (isPlaying) scheduleNextAutoStep();
  }
});

btnTriggerNote.addEventListener('click', () => {
  triggerCurrentScoreStep();
});

btnDroneHold.addEventListener('click', () => {
  const currentStep = CLAIR_DE_LUNE_SCORE[scoreIndex];
  const active = synth.toggleFreezeDrone([currentStep.bass || 37, ...currentStep.chord]);
  btnDroneHold.classList.toggle('active', active);
  droneLabel.textContent = active ? '∞ FREEZE DRONE: ON' : '∞ FREEZE DRONE: OFF';
});

// Pointer / Touch Expression & Laser Harp Plucking
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let lastPluckedMonolith = null;

function handlePointerMove(clientX, clientY) {
  const normX = clientX / window.innerWidth;
  const normY = 1.0 - clientY / window.innerHeight;

  pointer.x = normX * 2 - 1;
  pointer.y = normY * 2 - 1;

  const hz = synth.setExpression(normX, normY);
  filterReadout.textContent = `${hz.toLocaleString()} Hz`;
  shimmerReadout.textContent = `${Math.round(normY * 100)}%`;

  // Check if brushing across one of the 9 Laser Harp Monoliths
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(monolithMeshes, false);
  if (hits.length > 0) {
    const idx = hits[0].object.userData.monolithIndex;
    if (lastPluckedMonolith !== idx) {
      lastPluckedMonolith = idx;
      const m = monoliths[idx];
      m.energy = 1.6;
      synth.pluckHarpMonolith(m.item.midi);
      spawnOceanRipple(m.x, m.z, m.item.color);
    }
  } else {
    lastPluckedMonolith = null;
  }
}

window.addEventListener('mousemove', (e) => {
  handlePointerMove(e.clientX, e.clientY);
});

window.addEventListener('touchstart', (e) => {
  if (e.target.closest('button, a, .start-box, .nocturne-hud-card')) return;
  if (e.touches.length > 0) {
    document.body.classList.add('is-steering');
    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    if (mode === 'conduct') {
      triggerCurrentScoreStep({ x: pointer.x * 8, z: -6 });
    }
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (e.target.closest('button, a, .start-box')) return;
  if (e.touches.length > 0) {
    handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: true });

window.addEventListener('touchend', () => {
  document.body.classList.remove('is-steering');
  lastPluckedMonolith = null;
}, { passive: true });

window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  if (e.target.closest('button, a, .start-box, .nocturne-hud-card')) return;
  triggerCurrentScoreStep({ x: pointer.x * 8, z: -6 });
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === ' ' || (e.key.length === 1 && /[a-zA-Z]/.test(e.key))) {
    triggerCurrentScoreStep();
  }
});

// ============================================================================
// 5. ANIMATION LOOP
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  const energy = synth.getEnergy();

  // Animate Ocean Waves + Bass Reactivity
  const pos = oceanGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.sqrt(x * x + (z + 6) * (z + 6));
    const wave =
      Math.sin(dist * 0.45 - elapsed * 2.2) * (0.18 + energy.bass * 0.45) +
      Math.cos(x * 0.25 + elapsed * 1.4) * 0.12;
    pos.setY(i, oceanBaseY[i] + wave);
  }
  pos.needsUpdate = true;

  // Pulse Eclipsed Moon & Gyroscope Ring
  const moonScale = 1.0 + energy.bass * 0.14;
  coronaRing.scale.set(moonScale, moonScale, 1);
  outerHalo.scale.set(1.0 + energy.mid * 0.22, 1.0 + energy.mid * 0.22, 1);
  orbitalRing.rotation.z = elapsed * 0.25;
  orbitalRing.rotation.y = Math.sin(elapsed * 0.4) * 0.35;

  // Update 9 Laser Harp Monoliths
  monoliths.forEach((m, i) => {
    m.energy = Math.max(0, m.energy - dt * 1.8);
    const glow = 0.28 + m.energy * 1.6 + energy.mid * 0.35;
    m.pillarMat.emissiveIntensity = glow;
    m.coreMat.opacity = Math.min(1.0, 0.35 + m.energy * 0.65);
    m.pillar.position.y = (m.pillar.geometry.parameters.height / 2 - 1.2) + Math.sin(elapsed * 2 + i) * 0.08 + m.energy * 0.35;
  });

  // Update Expanding Ocean Shockwave Ripples
  for (let i = activeRipples.length - 1; i >= 0; i--) {
    const r = activeRipples[i];
    r.scale += dt * 12.5;
    r.opacity -= dt * 0.55;
    r.mesh.scale.set(r.scale, r.scale, 1);
    r.mat.opacity = Math.max(0, r.opacity);
    if (r.opacity <= 0) {
      scene.remove(r.mesh);
      r.mat.dispose();
      activeRipples.splice(i, 1);
    }
  }

  // Adaptive Camera Framing & Smooth Parallax Orbit
  const isNarrow = camera.aspect < 1.1;
  const baseZ = isNarrow ? 19.5 : 15.5;
  const targetCamX = pointer.x * 3.2;
  const targetCamY = 3.0 + pointer.y * 1.6;

  camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, dt * 3.5);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, dt * 3.5);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, baseZ, dt * 3.5);
  camera.lookAt(0, 3.8, -18);

  stars.rotation.y = elapsed * 0.015;
  composer.render();
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
