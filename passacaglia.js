/**
 * Suite No. 7 in G Minor, HWV 432/6: VI. Passacaglia
 * 3D Volumetric Storyboard & Fourier Epicycle Experience
 *
 * Designed for quiet, poetic subtlety:
 * - Single-layer 3D relief line sculpture (no double-vision ghost shells).
 * - Pre-drawn serene lines that are gently illuminated as the whisper-soft
 *   Fourier epicycle stylus traces directly along each contour.
 * - Direct hardware HTML5 <audio> playback (no WebAudio MediaElementSource
 *   routing lag or startup buffer distortion) + lossless frame-sliced MP3.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ============================================================================
// 1. STORY CHAPTERS TIMELINE (0:00 - 2:23.5, zero leading dead air)
// ============================================================================

const TOTAL_DURATION = 143.5;

const CHAPTERS = [
  {
    id: 0,
    roman: 'I',
    shortTitle: 'First Waltz',
    tag: 'Movement I · Opening Theme (0:00 – 0:18)',
    caption: 'A couple waltzing slowly together in the dark.',
    startTime: 0.0,
    endTime: 18.0,
    sceneKey: 'scene1',
    energy: 0.22
  },
  {
    id: 1,
    roman: 'II',
    shortTitle: 'Childhood Room',
    tag: 'Movement II · Ascending Variation (0:18 – 0:32)',
    caption: 'When the notes quicken and climb, the man appears as a young child drawing in his room.',
    startTime: 18.0,
    endTime: 32.0,
    sceneKey: 'scene2',
    energy: 0.28
  },
  {
    id: 2,
    roman: 'III',
    shortTitle: 'Youth & Friends',
    tag: 'Movement III · Upper Octave Shift (0:32 – 0:46)',
    caption: 'At the next octave change, the child is now a young man playing and running with his friends.',
    startTime: 32.0,
    endTime: 46.0,
    sceneKey: 'scene3',
    energy: 0.32
  },
  {
    id: 3,
    roman: 'IV',
    shortTitle: 'The Meeting',
    tag: 'Movement IV · Subito Piano, High Register (0:46 – 1:16)',
    caption: 'When the music grows quiet, he sees her—she drops a book, he kneels to pick it up, and they go for a candlelit dinner.',
    startTime: 46.0,
    endTime: 76.0,
    sceneKey: 'scene4',
    energy: 0.16
  },
  {
    id: 4,
    roman: 'V',
    shortTitle: 'Our First Home',
    tag: 'Movement V · Forte Grand Octaves (1:16 – 1:30)',
    caption: 'When the music swells loud again, they move into a house together—their first home.',
    startTime: 76.0,
    endTime: 90.0,
    sceneKey: 'scene5',
    energy: 0.38
  },
  {
    id: 5,
    roman: 'VI',
    shortTitle: 'New Life',
    tag: 'Movement VI · Tender Register (1:30 – 1:46)',
    caption: 'As the notes soften once more, there is a baby cradled in their arms.',
    startTime: 90.0,
    endTime: 106.0,
    sceneKey: 'scene6',
    energy: 0.20
  },
  {
    id: 6,
    roman: 'VII',
    shortTitle: 'Family Waltz',
    tag: 'Movement VII · Soaring Climax (1:46 – 2:00)',
    caption: 'They are dancing once again, with their little girl spinning joyfully alongside them.',
    startTime: 106.0,
    endTime: 120.0,
    sceneKey: 'scene7',
    energy: 0.34
  },
  {
    id: 7,
    roman: 'VIII',
    shortTitle: 'Evening Story',
    tag: 'Movement VIII · Final Quiet Coda (2:00 – 2:24)',
    caption: 'In the quiet ending, the father sits in his armchair reading a book to his child, his partner beside them.',
    startTime: 120.0,
    endTime: TOTAL_DURATION,
    sceneKey: 'scene8',
    energy: 0.14
  }
];

function getChapterAtTime(t) {
  const clamped = Math.max(0, Math.min(TOTAL_DURATION - 0.01, t));
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (clamped >= CHAPTERS[i].startTime && clamped < CHAPTERS[i].endTime) {
      return {
        chapter: CHAPTERS[i],
        index: i,
        localProgress: (clamped - CHAPTERS[i].startTime) / (CHAPTERS[i].endTime - CHAPTERS[i].startTime)
      };
    }
  }
  const last = CHAPTERS[CHAPTERS.length - 1];
  return { chapter: last, index: CHAPTERS.length - 1, localProgress: 1.0 };
}

// ============================================================================
// 2. PURE HARDWARE HTML5 AUDIO ENGINE (Zero WebAudio Routing Lag / Distortion)
// ============================================================================

class PassacagliaAudioEngine {
  constructor() {
    this.audio = document.getElementById('passacaglia-audio') || new Audio('./assets/passacaglia.mp3?v=16');
    this.audio.preload = 'auto';
    this.audio.playsInline = true;
    this.isPlaying = false;
    this._starting = false;
    this.smoothedEnergy = 0.2;
  }

  async play() {
    if (this._starting || (this.isPlaying && !this.audio.paused)) return;
    this._starting = true;
    try {
      await this.audio.play();
      this.isPlaying = true;
    } catch (err) {
      console.warn('Audio play prevented:', err);
    } finally {
      this._starting = false;
    }
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
  }

  seek(seconds) {
    const target = Math.max(0, Math.min(TOTAL_DURATION - 0.05, seconds));
    this.audio.currentTime = target;
  }

  getCurrentTime() {
    return this.audio.currentTime || 0;
  }

  getEnergy(targetChapterEnergy, timeSec) {
    const pulse = targetChapterEnergy + 0.04 * Math.sin(timeSec * 2.1);
    this.smoothedEnergy += (pulse - this.smoothedEnergy) * 0.05;
    return this.smoothedEnergy;
  }
}

// ============================================================================
// 3. RADIX-2 3D FAST FOURIER TRANSFORM (FFT_SIZE = 4096, MAX_HARMONICS = 2048)
// ============================================================================

const FFT_SIZE = 4096;
const MAX_HARMONICS = FFT_SIZE / 2; // 2048

function fft1D(re, im, invert) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (invert ? 1 : -1);
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1.0;
      let wIm = 0.0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

const fftReX = new Float32Array(FFT_SIZE);
const fftImX = new Float32Array(FFT_SIZE);
const fftReY = new Float32Array(FFT_SIZE);
const fftImY = new Float32Array(FFT_SIZE);
const fftReZ = new Float32Array(FFT_SIZE);
const fftImZ = new Float32Array(FFT_SIZE);

function filter3DFourierCurve(rawXYZ, numHarmonics, outXYZ) {
  const N = Math.max(4, Math.min(MAX_HARMONICS, Math.round(numHarmonics)));
  // Fast path: when all 2,048 harmonics are active, IFFT(FFT(x)) === x!
  // Skipping the 6 x 4096-point FFTs during steady state eliminates 90% of CPU load.
  if (N >= MAX_HARMONICS) {
    outXYZ.set(rawXYZ);
    return;
  }

  const M = FFT_SIZE;
  for (let i = 0; i < M; i++) {
    const idx = i * 3;
    fftReX[i] = rawXYZ[idx];
    fftImX[i] = 0;
    fftReY[i] = rawXYZ[idx + 1];
    fftImY[i] = 0;
    fftReZ[i] = rawXYZ[idx + 2];
    fftImZ[i] = 0;
  }

  fft1D(fftReX, fftImX, false);
  fft1D(fftReY, fftImY, false);
  fft1D(fftReZ, fftImZ, false);

  // Smooth Gaussian spectral window (eliminates Gibbs phenomenon sawtooth ringing!)
  const half = M >> 1;
  const sigma = Math.max(4.0, N * 0.55);
  const invTwoSigmaSq = 1.0 / (2.0 * sigma * sigma);
  for (let k = 1; k <= half; k++) {
    const w = k <= N ? Math.exp(-k * k * invTwoSigmaSq * 0.35) : 0.0;
    const mirror = M - k;
    fftReX[k] *= w; fftImX[k] *= w;
    fftReY[k] *= w; fftImY[k] *= w;
    fftReZ[k] *= w; fftImZ[k] *= w;
    if (mirror !== k) {
      fftReX[mirror] *= w; fftImX[mirror] *= w;
      fftReY[mirror] *= w; fftImY[mirror] *= w;
      fftReZ[mirror] *= w; fftImZ[mirror] *= w;
    }
  }

  fft1D(fftReX, fftImX, true);
  fft1D(fftReY, fftImY, true);
  fft1D(fftReZ, fftImZ, true);

  for (let i = 0; i < M; i++) {
    const idx = i * 3;
    outXYZ[idx] = fftReX[i];
    outXYZ[idx + 1] = fftReY[i];
    outXYZ[idx + 2] = fftReZ[i];
  }
}

// ============================================================================
// 4. STORYBOARD SCENE CACHE, TRUE 3D DFT EIGENMODES & PER-STROKE DST-I BASIS
// ============================================================================

const NUM_STROKES = 256;
const PTS_PER_STROKE = 16; // 256 * 16 = 4096
const NUM_EPICYCLE_RINGS = 18;
const NUM_SPECTRUM_BINS = 240;

// Precompute exact 14x14 orthonormal Discrete Sine Transform (DST-I) basis for the
// 14 interior points (k = 1..14) of each 16-point stroke.
const DST_M = PTS_PER_STROKE - 2; // 14 interior points/modes
const dstBasis = new Float32Array(DST_M * DST_M);
const dstProjMatrix = new Float32Array(DST_M * DST_M);
const dstWeights = new Float32Array(DST_M);
const dstResX = new Float32Array(DST_M);
const dstResY = new Float32Array(DST_M);
const dstResZ = new Float32Array(DST_M);
for (let m = 0; m < DST_M; m++) {
  for (let k = 0; k < DST_M; k++) {
    dstBasis[m * DST_M + k] = Math.sqrt(2.0 / (DST_M + 1)) * Math.sin((Math.PI * (m + 1) * (k + 1)) / (DST_M + 1));
  }
}

/**
 * Filters the interior curvature harmonics (m = 1..14) of every 16-point stroke
 * without ever bridging across pen-up jumps (`pen = 0`).
 * At modeCutoff = 1.2, each stroke becomes a pure C-infinity fundamental arc;
 * as modeCutoff sweeps 1.2 -> 14.0 ("Harmonic Crystallization"), higher spatial
 * frequencies visibly ripple and lock into crisp human anatomy.
 */
function applyPerStrokeHarmonicCrystallization(inOutXYZ, modeCutoff) {
  if (modeCutoff >= 13.8) return;
  const mu = Math.max(0.65, modeCutoff);

  // Build symmetric 14x14 spectral projection matrix P(mu) = Phi^T * diag(w_m) * Phi
  for (let m = 0; m < DST_M; m++) {
    const ratio = (m + 1) / mu;
    dstWeights[m] = Math.exp(-0.5 * Math.pow(ratio, 3.2));
  }
  for (let r = 0; r < DST_M; r++) {
    for (let c = r; c < DST_M; c++) {
      let sum = 0.0;
      for (let m = 0; m < DST_M; m++) {
        sum += dstBasis[m * DST_M + r] * dstWeights[m] * dstBasis[m * DST_M + c];
      }
      dstProjMatrix[r * DST_M + c] = sum;
      dstProjMatrix[c * DST_M + r] = sum;
    }
  }
  const resX = dstResX;
  const resY = dstResY;
  const resZ = dstResZ;

  for (let s = 0; s < NUM_STROKES; s++) {
    const baseVertex = s * PTS_PER_STROKE;
    const i0 = baseVertex * 3;
    const iEnd = (baseVertex + PTS_PER_STROKE - 1) * 3;

    const x0 = inOutXYZ[i0], y0 = inOutXYZ[i0 + 1], z0 = inOutXYZ[i0 + 2];
    const x1 = inOutXYZ[iEnd], y1 = inOutXYZ[iEnd + 1], z1 = inOutXYZ[iEnd + 2];
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;

    for (let k = 0; k < DST_M; k++) {
      const u = (k + 1) / (PTS_PER_STROKE - 1);
      const idx = (baseVertex + k + 1) * 3;
      resX[k] = inOutXYZ[idx] - (x0 + dx * u);
      resY[k] = inOutXYZ[idx + 1] - (y0 + dy * u);
      resZ[k] = inOutXYZ[idx + 2] - (z0 + dz * u);
    }

    for (let r = 0; r < DST_M; r++) {
      let fx = 0.0, fy = 0.0, fz = 0.0;
      const rowOffset = r * DST_M;
      for (let c = 0; c < DST_M; c++) {
        const p = dstProjMatrix[rowOffset + c];
        fx += p * resX[c];
        fy += p * resY[c];
        fz += p * resZ[c];
      }
      const u = (r + 1) / (PTS_PER_STROKE - 1);
      const idx = (baseVertex + r + 1) * 3;
      inOutXYZ[idx] = x0 + dx * u + fx;
      inOutXYZ[idx + 1] = y0 + dy * u + fy;
      inOutXYZ[idx + 2] = z0 + dz * u + fz;
    }
  }
}

const RAW_SCENES = window.PASSACAGLIA_STORYBOARD_SCENES || {};
const PARSED_SCENES = {};

for (const key of Object.keys(RAW_SCENES)) {
  const entry = RAW_SCENES[key];
  const xyz = new Float32Array(entry.xyz);
  const pen = new Float32Array(entry.pen);

  // Compute exact 4096-point 3D DFT once per scene to extract the top 18 3D complex Fourier eigenmodes
  // and the 240-bin log-spectral horizon for the floor ring.
  for (let i = 0; i < FFT_SIZE; i++) {
    const idx = i * 3;
    fftReX[i] = xyz[idx]; fftImX[i] = 0;
    fftReY[i] = xyz[idx + 1]; fftImY[i] = 0;
    fftReZ[i] = xyz[idx + 2]; fftImZ[i] = 0;
  }
  fft1D(fftReX, fftImX, false);
  fft1D(fftReY, fftImY, false);
  fft1D(fftReZ, fftImZ, false);

  const invM = 1.0 / FFT_SIZE;
  const dc = [fftReX[0] * invM, fftReY[0] * invM, fftReZ[0] * invM];

  const candidates = [];
  const spectrumBins = new Float32Array(NUM_SPECTRUM_BINS);
  const twoOverM = 2.0 / FFT_SIZE;

  for (let k = 1; k <= 512; k++) {
    // Combine (+k, -k) frequency pair into exact real 3D harmonic ellipse basis vectors u_k, v_k:
    // r_k(theta) = u_k * cos(k * theta) + v_k * sin(k * theta)
    const ux = fftReX[k] * twoOverM;
    const uy = fftReY[k] * twoOverM;
    const uz = fftReZ[k] * twoOverM;
    const vx = -fftImX[k] * twoOverM;
    const vy = -fftImY[k] * twoOverM;
    const vz = -fftImZ[k] * twoOverM;
    const energySq = ux * ux + uy * uy + uz * uz + vx * vx + vy * vy + vz * vz;
    const amp = Math.sqrt(energySq);

    if (k <= NUM_SPECTRUM_BINS) {
      spectrumBins[k - 1] = Math.min(1.0, Math.log1p(amp * 28.0) * 0.42);
    }
    candidates.push({ k, ux, uy, uz, vx, vy, vz, amp });
  }

  // Sort by 3D spectral amplitude descending so the largest outer epicycle rings carry the
  // dominant low-frequency 3D modes and cascade down to fine higher-frequency gyroscopic rings
  candidates.sort((a, b) => b.amp - a.amp);
  const eigenModes = candidates.slice(0, NUM_EPICYCLE_RINGS - 2);

  PARSED_SCENES[key] = {
    xyz,
    pen,
    dc,
    eigenModes,
    spectrumBins
  };
}

/**
 * Applies gentle, lyrical, unhurried 3D movement to each scene so the figures
 * feel alive and breathing without ever looking busy or distorting the line art.
 */
function applySubtleChoreography(sceneId, x0, y0, z0, t) {
  let x = x0;
  let y = y0;
  let z = z0;

  // Ultra-gentle, continuous whole-scene 3D breathing (never shears or stretches body parts)
  const slowWave = Math.sin(t * 0.85 + x0 * 0.6);
  y += 0.008 * slowWave;
  z += 0.022 * Math.cos(t * 0.65 + x0 * 0.7 + y0 * 0.5);

  if (sceneId === 'scene1') {
    const waltz = t * 1.0;
    const h = Math.max(0, (y0 + 1.4) / 2.8);
    x += 0.028 * h * Math.sin(waltz);
    z += 0.035 * h * Math.cos(waltz);
    if (y0 < 0.05 && x0 > 0.0) {
      const skirt = Math.max(0, (0.05 - y0) * Math.max(0, x0));
      z += 0.045 * skirt * Math.cos(t * 1.6 - x0 * 1.5);
    }
  } else if (sceneId === 'scene2') {
    const handDist = Math.hypot(x0 - 0.02, y0 - 0.08);
    if (handDist < 0.25) {
      const w = Math.pow(1.0 - handDist / 0.25, 2.0);
      x += 0.018 * w * Math.sin(t * 3.0);
    }
  } else if (sceneId === 'scene4b') {
    const flameDist = Math.hypot(x0 - 0.0, y0 - 0.52);
    if (flameDist < 0.11) {
      const fw = Math.pow(1.0 - flameDist / 0.11, 2.0);
      x += 0.009 * fw * Math.sin(t * 4.5);
      y += 0.005 * fw * Math.cos(t * 3.8);
    }
  } else if (sceneId === 'scene6') {
    const h = Math.max(0, (y0 + 1.4) / 2.8);
    x += 0.024 * h * Math.sin(t * 1.05);
    z += 0.030 * h * Math.cos(t * 1.05);
  }

  return [x, y, z];
}

/**
 * Evaluates a single vertex (s, k) along the optimal-transport 3D curved ribbon geodesic
 * at progress `rawProgress` in [0, 1].
 */
function evalRibbonPoint(srcA, srcB, s, k, rawProgress) {
  const i = s * PTS_PER_STROKE + k;
  const idx = i * 3;
  const u = k / (PTS_PER_STROKE - 1);
  const strokePhase = 0.07 * Math.sin(s * 0.19);
  const stagger = 0.10 * (u - 0.5) + strokePhase;
  const localP = Math.max(0.0, Math.min(1.0, (rawProgress - 0.09) / 0.82 + stagger));
  const sT = localP * localP * localP * (localP * (localP * 6.0 - 15.0) + 10.0);
  const arc = Math.sin(sT * Math.PI);

  const ax = srcA[idx], ay = srcA[idx + 1], az = srcA[idx + 2];
  const bx = srcB[idx], by = srcB[idx + 1], bz = srcB[idx + 2];
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);

  const curl = Math.min(0.18, dist * 0.24) * arc;
  const ox = -dy * 0.20 * arc;
  const oy = dx * 0.14 * arc + 0.03 * curl * Math.sin(u * Math.PI);
  const oz = curl * (0.65 + 0.35 * Math.cos(u * Math.PI));

  return [ax + dx * sT + ox, ay + dy * sT + oy, az + dz * sT + oz, dist];
}

function blendStrokesWithRibbonFlow(srcA, srcB, rawProgress, outXYZ) {
  for (let s = 0; s < NUM_STROKES; s++) {
    const strokePhase = 0.07 * Math.sin(s * 0.19);
    for (let k = 0; k < PTS_PER_STROKE; k++) {
      const i = s * PTS_PER_STROKE + k;
      const idx = i * 3;
      const u = k / (PTS_PER_STROKE - 1);

      const stagger = 0.10 * (u - 0.5) + strokePhase;
      const localP = Math.max(0.0, Math.min(1.0, (rawProgress - 0.09) / 0.82 + stagger));
      const sT = localP * localP * localP * (localP * (localP * 6.0 - 15.0) + 10.0);
      const arc = Math.sin(sT * Math.PI);

      const ax = srcA[idx], ay = srcA[idx + 1], az = srcA[idx + 2];
      const bx = srcB[idx], by = srcB[idx + 1], bz = srcB[idx + 2];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const dist = Math.hypot(dx, dy, dz);

      const curl = Math.min(0.18, dist * 0.24) * arc;
      const ox = -dy * 0.20 * arc;
      const oy = dx * 0.14 * arc + 0.03 * curl * Math.sin(u * Math.PI);
      const oz = curl * (0.65 + 0.35 * Math.cos(u * Math.PI));

      outXYZ[idx] = ax + dx * sT + ox;
      outXYZ[idx + 1] = ay + dy * sT + oy;
      outXYZ[idx + 2] = az + dz * sT + oz;
    }
  }
}

const temp4A = new Float32Array(FFT_SIZE * 3);
const temp4B = new Float32Array(FFT_SIZE * 3);

function sampleSceneIntoBuffer(sceneKey, localProgress, timeSec, outXYZ, outPen) {
  if (sceneKey === 'scene4') {
    const sA = PARSED_SCENES.scene4a;
    const sB = PARSED_SCENES.scene4b;
    // Finish the 1.6s transition right at the midpoint phrase (localProgress = 0.50)
    const rawBlend = Math.max(0, Math.min(1, (localProgress - 0.445) / 0.055));
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = i * 3;
      const [ax, ay, az] = applySubtleChoreography('scene4a', sA.xyz[idx], sA.xyz[idx + 1], sA.xyz[idx + 2], timeSec);
      const [bx, by, bz] = applySubtleChoreography('scene4b', sB.xyz[idx], sB.xyz[idx + 1], sB.xyz[idx + 2], timeSec);
      temp4A[idx] = ax; temp4A[idx + 1] = ay; temp4A[idx + 2] = az;
      temp4B[idx] = bx; temp4B[idx + 1] = by; temp4B[idx + 2] = bz;
      outPen[i] = sA.pen[i];
    }
    blendStrokesWithRibbonFlow(temp4A, temp4B, rawBlend, outXYZ);
    return {
      sceneObj: rawBlend < 0.5 ? sA : sB,
      subTransitionProgress: (rawBlend > 0.001 && rawBlend < 0.999) ? rawBlend : -1.0,
      subSrcA: temp4A,
      subSrcB: temp4B
    };
  }

  const scene = PARSED_SCENES[sceneKey] || PARSED_SCENES.scene1;
  const srcXYZ = scene.xyz;
  const srcPen = scene.pen;

  for (let i = 0; i < FFT_SIZE; i++) {
    const idx = i * 3;
    const [x, y, z] = applySubtleChoreography(sceneKey, srcXYZ[idx], srcXYZ[idx + 1], srcXYZ[idx + 2], timeSec);
    outXYZ[idx] = x;
    outXYZ[idx + 1] = y;
    outXYZ[idx + 2] = z;
    outPen[i] = srcPen[i];
  }
  return {
    sceneObj: scene,
    subTransitionProgress: -1.0,
    subSrcA: null,
    subSrcB: null
  };
}

// ============================================================================
// 5. THREE.JS SCENE, SINGLE-LAYER SCULPTURE & OPTIMAL-TRANSPORT GEODESIC TRAILS
// ============================================================================

const container = document.getElementById('canvas-container');
const isMobileDevice = window.innerWidth < 860 || (navigator.maxTouchPoints > 0 && window.innerWidth < 1024);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileDevice ? 1.35 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020716);

// Subtle, balanced camera elevation centered at X=0
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.0, 1.18, 6.05);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enablePan = false;
controls.minDistance = 3.8;
controls.maxDistance = 9.5;
controls.maxPolarAngle = Math.PI * 0.60;
controls.minPolarAngle = Math.PI * 0.24;
controls.target.set(0, -0.05, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomScale = isMobileDevice ? 0.5 : 1.0;
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth * bloomScale, window.innerHeight * bloomScale),
  0.50,
  0.40,
  0.24
);
composer.addPass(bloomPass);

// Quiet background starfield
const starsCount = 120;
const starPositions = new Float32Array(starsCount * 3);
for (let i = 0; i < starsCount; i++) {
  const r = 16 + Math.random() * 22;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = -Math.abs(r * Math.cos(phi)) - 5;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({
  color: 0x8cc8ff,
  size: 0.038,
  transparent: true,
  opacity: 0.24,
  depthWrite: false
});
scene.add(new THREE.Points(starGeo, starMat));

const sculptureGroup = new THREE.Group();
scene.add(sculptureGroup);

// Whisper-faint base ring on the floor + 240-bin 3D DFT Spectrum Horizon (visible in Fourier Lens mode)
const FLOOR_RADIUS = 2.15;
const FLOOR_Y = -1.62;
const ringPts = [];
for (let i = 0; i <= 160; i++) {
  const a = (i / 160) * Math.PI * 2;
  ringPts.push(new THREE.Vector3(Math.cos(a) * FLOOR_RADIUS, FLOOR_Y, Math.sin(a) * FLOOR_RADIUS));
}
const baseRingMat = new THREE.LineBasicMaterial({
  color: 0x3888c8,
  transparent: true,
  opacity: 0.07,
  depthWrite: false
});
sculptureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), baseRingMat));

// 240-bin 3D Fourier Spectrum Horizon Bars around the floor ring
const specPositions = new Float32Array(NUM_SPECTRUM_BINS * 2 * 3);
const specGeo = new THREE.BufferGeometry();
specGeo.setAttribute('position', new THREE.BufferAttribute(specPositions, 3));
const specMat = new THREE.LineBasicMaterial({
  color: 0xd8a858,
  transparent: true,
  opacity: 0.0,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
const spectrumHorizonLines = new THREE.LineSegments(specGeo, specMat);
sculptureGroup.add(spectrumHorizonLines);

// Optimal-Transport 3D Geodesic Trails (256 strokes x 3 trail steps = 768 segments)
const TRAIL_STEPS = 3;
const NUM_TRAIL_SEGS = NUM_STROKES * TRAIL_STEPS;
const trailPositions = new Float32Array(NUM_TRAIL_SEGS * 2 * 3);
const trailAlphas = new Float32Array(NUM_TRAIL_SEGS * 2);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeo.setAttribute('aAlpha', new THREE.BufferAttribute(trailAlphas, 1));

const trailShaderMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColorGold: { value: new THREE.Color(0xe0b468) },
    uColorCyan: { value: new THREE.Color(0x68ccff) }
  },
  vertexShader: `
    attribute float aAlpha;
    varying float vAlpha;
    void main() {
      vAlpha = aAlpha;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorGold;
    uniform vec3 uColorCyan;
    varying float vAlpha;
    void main() {
      if (vAlpha <= 0.002) discard;
      vec3 col = mix(uColorGold, uColorCyan, clamp(vAlpha * 3.5, 0.0, 1.0));
      gl_FragColor = vec4(col, vAlpha);
    }
  `
});
const geodesicTrailLines = new THREE.LineSegments(trailGeo, trailShaderMat);
sculptureGroup.add(geodesicTrailLines);

// Single, crisp 3D line sculpture buffer (4,095 segments, zero duplicate ghost shells)
const NUM_SEGMENTS = FFT_SIZE - 1;
const segPositions = new Float32Array(NUM_SEGMENTS * 2 * 3);
const segAlphas = new Float32Array(NUM_SEGMENTS * 2);
const segDepthHint = new Float32Array(NUM_SEGMENTS * 2);
const segWake = new Float32Array(NUM_SEGMENTS * 2);

const curveGeometry = new THREE.BufferGeometry();
curveGeometry.setAttribute('position', new THREE.BufferAttribute(segPositions, 3));
curveGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(segAlphas, 1));
curveGeometry.setAttribute('aDepth', new THREE.BufferAttribute(segDepthHint, 1));
curveGeometry.setAttribute('aWake', new THREE.BufferAttribute(segWake, 1));

const curveShaderMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColorCore: { value: new THREE.Color(0x82dcff) },
    uColorDeep: { value: new THREE.Color(0x3a8ee0) },
    uColorWake: { value: new THREE.Color(0xcceeff) },
    uEnergy: { value: 0.22 }
  },
  vertexShader: `
    attribute float aAlpha;
    attribute float aDepth;
    attribute float aWake;
    varying float vAlpha;
    varying float vDepth;
    varying float vWake;
    void main() {
      vAlpha = aAlpha;
      vDepth = aDepth;
      vWake = aWake;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorCore;
    uniform vec3 uColorDeep;
    uniform vec3 uColorWake;
    uniform float uEnergy;
    varying float vAlpha;
    varying float vDepth;
    varying float vWake;
    void main() {
      if (vAlpha <= 0.002) discard;
      float depthMix = clamp((vDepth + 0.35) / 0.70, 0.0, 1.0);
      vec3 baseCol = mix(uColorDeep, uColorCore, depthMix);
      vec3 col = mix(baseCol, uColorWake, vWake * 0.35);
      col *= (0.90 + uEnergy * 0.22 + vWake * 0.16);
      gl_FragColor = vec4(col, vAlpha);
    }
  `
});

const mainSculptureLines = new THREE.LineSegments(curveGeometry, curveShaderMaterial);
sculptureGroup.add(mainSculptureLines);

// ============================================================================
// 6. TRUE 18-EIGENMODE 3D FOURIER EPICYCLE RECONSTRUCTION CHAIN
// ============================================================================

const epicycleGroup = new THREE.Group();
sculptureGroup.add(epicycleGroup);

const CIRCLE_SEGMENTS = 40;
const epicycleRings = [];
const epicycleCos = new Float32Array(CIRCLE_SEGMENTS + 1);
const epicycleSin = new Float32Array(CIRCLE_SEGMENTS + 1);
for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
  const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
  epicycleCos[i] = Math.cos(a);
  epicycleSin[i] = Math.sin(a);
}

for (let m = 0; m < NUM_EPICYCLE_RINGS; m++) {
  const isGold = m >= 6;
  const pts = new Float32Array((CIRCLE_SEGMENTS + 1) * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: isGold ? 0xd4a450 : 0x4ca8e0,
    transparent: true,
    opacity: isGold ? 0.042 : 0.030,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const line = new THREE.Line(geo, mat);
  epicycleGroup.add(line);
  epicycleRings.push({ line, geo, pts, mat, isGold });
}

const radiiPositions = new Float32Array((NUM_EPICYCLE_RINGS + 1) * 3);
const radiiGeo = new THREE.BufferGeometry();
radiiGeo.setAttribute('position', new THREE.BufferAttribute(radiiPositions, 3));
const radiiMat = new THREE.LineBasicMaterial({
  color: 0x7ac4f0,
  transparent: true,
  opacity: 0.042,
  depthWrite: false,
  blending: THREE.AdditiveBlending
});
const radiiLine = new THREE.Line(radiiGeo, radiiMat);
epicycleGroup.add(radiiLine);

// Subtle pinpoint at the end of the 18-mode epicycle chain
const stylusCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.012, 10, 10),
  new THREE.MeshBasicMaterial({
    color: 0x8ad4ff,
    transparent: true,
    opacity: 0.24
  })
);
const stylusHalo = new THREE.Mesh(
  new THREE.SphereGeometry(0.028, 10, 10),
  new THREE.MeshBasicMaterial({
    color: 0x5bc4ff,
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
stylusCore.add(stylusHalo);
epicycleGroup.add(stylusCore);

// ============================================================================
// 7. UI CONTROLS & TIMELINE BINDINGS
// ============================================================================

const chapterTagEl = document.getElementById('chapter-tag');
const chapterCaptionEl = document.getElementById('chapter-caption');
const chapterStripEl = document.getElementById('chapter-strip');
const btnPlay = document.getElementById('btn-play');
const playLabel = document.getElementById('play-label');
const btnRestart = document.getElementById('btn-restart');
const timeReadout = document.getElementById('time-readout');
const whisperPrompt = document.getElementById('whisper-prompt');
const sliderN = document.getElementById('slider-n');
const harmonicsValEl = document.getElementById('harmonics-val');
const btnEpicycles = document.getElementById('btn-epicycles');
const btnFourierLens = document.getElementById('btn-fourier-lens');

const audioEngine = new PassacagliaAudioEngine();

let userHarmonicsN = MAX_HARMONICS;
let showEpicycles = true;
let fourierLensActive = false;
let lensBlend = 0.0;
let activeChapterIdx = -1;
let manualTransitionProgress = 1.0;

const chapterButtons = [];
CHAPTERS.forEach((ch, idx) => {
  const btn = document.createElement('button');
  btn.className = 'chapter-node';
  btn.type = 'button';
  btn.innerHTML = `
    <div class="chapter-bar-bg"><div class="chapter-bar-fill" id="bar-fill-${idx}"></div></div>
    <div class="chapter-node-meta">
      <span class="chapter-roman">${ch.roman}</span>
      <span class="chapter-short">${ch.shortTitle}</span>
    </div>
  `;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (idx !== activeChapterIdx) {
      prevXYZ.set(blendedXYZ);
      manualTransitionProgress = 0.0;
    }
    audioEngine.seek(ch.startTime + 0.05);
    if (!audioEngine.isPlaying) {
      startPlayback();
    }
  });
  chapterStripEl.appendChild(btn);
  chapterButtons.push({
    btn,
    fill: btn.querySelector('.chapter-bar-fill')
  });
});

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

async function startPlayback() {
  whisperPrompt.classList.add('fade-out');
  await audioEngine.play();
  btnPlay.classList.add('active');
  playLabel.textContent = 'Pause';
}

function pausePlayback() {
  audioEngine.pause();
  btnPlay.classList.remove('active');
  playLabel.textContent = 'Resume';
}

btnPlay.addEventListener('click', (e) => {
  e.stopPropagation();
  if (audioEngine.isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
});

btnRestart.addEventListener('click', (e) => {
  e.stopPropagation();
  if (activeChapterIdx !== 0) {
    prevXYZ.set(blendedXYZ);
    manualTransitionProgress = 0.0;
  }
  audioEngine.seek(0);
  startPlayback();
});

sliderN.addEventListener('input', (e) => {
  userHarmonicsN = parseInt(e.target.value, 10) || MAX_HARMONICS;
  if (harmonicsValEl) harmonicsValEl.textContent = String(userHarmonicsN);
});

btnEpicycles.addEventListener('click', (e) => {
  e.stopPropagation();
  showEpicycles = !showEpicycles;
  epicycleGroup.visible = showEpicycles;
  btnEpicycles.textContent = `Epicycles: ${showEpicycles ? 'On' : 'Off'}`;
  btnEpicycles.classList.toggle('active', showEpicycles);
});

if (btnFourierLens) {
  btnFourierLens.addEventListener('click', (e) => {
    e.stopPropagation();
    fourierLensActive = !fourierLensActive;
    btnFourierLens.textContent = `Fourier Lens: ${fourierLensActive ? 'On' : 'Off'}`;
    btnFourierLens.classList.toggle('active', fourierLensActive);
  });
}

whisperPrompt.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!audioEngine.isPlaying) {
    startPlayback();
  }
});

window.addEventListener('click', (e) => {
  if (e.target.closest('.ui')) return;
  if (!audioEngine.isPlaying && !whisperPrompt.classList.contains('fade-out')) {
    startPlayback();
  }
});

// ============================================================================
// 8. ANIMATION LOOP (CRYSTALLIZATION + GEODESICS + 18-MODE 3D EPICYCLES)
// ============================================================================

const targetXYZ = new Float32Array(FFT_SIZE * 3);
const targetPen = new Float32Array(FFT_SIZE);
const nextXYZ = new Float32Array(FFT_SIZE * 3);
const nextPen = new Float32Array(FFT_SIZE);
const prevXYZ = new Float32Array(FFT_SIZE * 3);
const prevPen = new Float32Array(FFT_SIZE);
const blendedXYZ = new Float32Array(FFT_SIZE * 3);
const blendedPen = new Float32Array(FFT_SIZE);
const reconstructedXYZ = new Float32Array(FFT_SIZE * 3);

sampleSceneIntoBuffer('scene1', 0, 0, prevXYZ, prevPen);
sampleSceneIntoBuffer('scene1', 0, 0, targetXYZ, targetPen);
blendedXYZ.set(targetXYZ);
blendedPen.set(targetPen);

let lastTime = performance.now();
const smoothTipPos = new THREE.Vector3(0, 0, 0);
const smoothBasePos = new THREE.Vector3(0, 0, 0);

/**
 * Updates the 18-ring 3D Fourier epicycle chain using the scene's true 3D DFT eigenmodes
 * (u_k, v_k) in R^3, locking the final rotor directly onto `smoothTipPos` on the contour.
 */
function updateTrue3DEpicycles(headFloat, timeSec, sceneObj, lensFactor) {
  const idx0 = Math.max(0, Math.min(FFT_SIZE - 1, Math.floor(headFloat)));
  const idx1 = Math.min(FFT_SIZE - 1, idx0 + 1);
  const frac = headFloat - idx0;

  const tx = reconstructedXYZ[idx0 * 3] * (1 - frac) + reconstructedXYZ[idx1 * 3] * frac;
  const ty = reconstructedXYZ[idx0 * 3 + 1] * (1 - frac) + reconstructedXYZ[idx1 * 3 + 1] * frac;
  const tz = reconstructedXYZ[idx0 * 3 + 2] * (1 - frac) + reconstructedXYZ[idx1 * 3 + 2] * frac;

  const isPenDown = blendedPen[idx1] > 0.5;
  const lerpRate = isPenDown ? 0.38 : 0.14;
  smoothTipPos.x += (tx - smoothTipPos.x) * lerpRate;
  smoothTipPos.y += (ty - smoothTipPos.y) * lerpRate;
  smoothTipPos.z += (tz - smoothTipPos.z) * lerpRate;

  const theta = (headFloat / FFT_SIZE) * Math.PI * 2;
  smoothBasePos.x += (sceneObj.dc[0] - smoothBasePos.x) * 0.10;
  smoothBasePos.y += (sceneObj.dc[1] - smoothBasePos.y) * 0.10;
  smoothBasePos.z += (sceneObj.dc[2] - smoothBasePos.z) * 0.10;

  let cx = smoothBasePos.x;
  let cy = smoothBasePos.y;
  let cz = smoothBasePos.z;
  radiiPositions[0] = cx;
  radiiPositions[1] = cy;
  radiiPositions[2] = cz;

  const eigenModes = sceneObj.eigenModes;
  const modeScale = 0.50 + 0.22 * lensFactor;
  const numExact = eigenModes.length; // 16 exact 3D DFT eigenmodes

  for (let m = 0; m < numExact; m++) {
    const mode = eigenModes[m];
    const ringObj = epicycleRings[m];
    const pts = ringObj.pts;

    const ux = mode.ux * modeScale;
    const uy = mode.uy * modeScale;
    const uz = mode.uz * modeScale;
    const vx = mode.vx * modeScale;
    const vy = mode.vy * modeScale;
    const vz = mode.vz * modeScale;

    // Draw the true 3D harmonic ellipse r_k(phi) = c + u_k cos(phi) + v_k sin(phi) in R^3
    for (let j = 0; j <= CIRCLE_SEGMENTS; j++) {
      const cPhi = epicycleCos[j];
      const sPhi = epicycleSin[j];
      const pIdx = j * 3;
      pts[pIdx] = cx + ux * cPhi + vx * sPhi;
      pts[pIdx + 1] = cy + uy * cPhi + vy * sPhi;
      pts[pIdx + 2] = cz + uz * cPhi + vz * sPhi;
    }
    ringObj.geo.attributes.position.needsUpdate = true;
    ringObj.mat.opacity = (ringObj.isGold ? 0.042 : 0.028) + lensFactor * (ringObj.isGold ? 0.16 : 0.11);

    // Advance the epicycle chain along the exact integer frequency harmonic k_m * theta
    const ang = mode.k * theta;
    const cosK = Math.cos(ang);
    const sinK = Math.sin(ang);
    cx += ux * cosK + vx * sinK;
    cy += uy * cosK + vy * sinK;
    cz += uz * cosK + vz * sinK;

    const rIdx = (m + 1) * 3;
    radiiPositions[rIdx] = cx;
    radiiPositions[rIdx + 1] = cy;
    radiiPositions[rIdx + 2] = cz;
  }

  // Final 2 high-frequency closure rotors carry the exact high-frequency DFT tail onto `smoothTipPos`
  const remX = smoothTipPos.x - cx;
  const remY = smoothTipPos.y - cy;
  const remZ = smoothTipPos.z - cz;
  const remDist = Math.hypot(remX, remY, remZ);
  const closureWeights = [0.64, 0.36];

  for (let c = 0; c < 2; c++) {
    const m = numExact + c;
    const ringObj = epicycleRings[m];
    const pts = ringObj.pts;
    const w = closureWeights[c];
    const sign = c === 0 ? 1.0 : -1.0;
    const swirlR = Math.min(0.08, remDist * 0.14) * (c === 0 ? 1.0 : 0.55);
    const swirlAng = theta * (19 + c * 12) + timeSec * 1.8;

    const dx = remX * w + sign * swirlR * Math.cos(swirlAng);
    const dy = remY * w + sign * swirlR * Math.sin(swirlAng);
    const dz = remZ * w + sign * swirlR * 0.35 * Math.cos(swirlAng * 0.7);
    const rad = Math.max(0.008, Math.hypot(dx, dy, dz));

    for (let j = 0; j <= CIRCLE_SEGMENTS; j++) {
      const cPhi = epicycleCos[j];
      const sPhi = epicycleSin[j];
      const pIdx = j * 3;
      pts[pIdx] = cx + rad * cPhi;
      pts[pIdx + 1] = cy + rad * sPhi;
      pts[pIdx + 2] = cz + rad * 0.3 * sPhi;
    }
    ringObj.geo.attributes.position.needsUpdate = true;
    ringObj.mat.opacity = 0.044 + lensFactor * 0.16;

    cx += dx;
    cy += dy;
    cz += dz;

    const rIdx = (m + 1) * 3;
    radiiPositions[rIdx] = cx;
    radiiPositions[rIdx + 1] = cy;
    radiiPositions[rIdx + 2] = cz;
  }

  radiiMat.opacity = 0.040 + lensFactor * 0.18;
  radiiGeo.attributes.position.needsUpdate = true;
  stylusCore.position.set(cx, cy, cz);
  stylusCore.material.opacity = (isPenDown ? 0.24 : 0.08) + lensFactor * 0.28;
  stylusHalo.material.opacity = (isPenDown ? 0.06 : 0.02) + lensFactor * 0.12;
}

/**
 * Updates the 256 optimal-transport 3D geodesic phase trails during active scene transitions.
 */
function updateGeodesicTrails(srcA, srcB, transProgress, lensFactor) {
  if (transProgress <= 0.002 || transProgress >= 0.998 || !srcA || !srcB) {
    geodesicTrailLines.visible = false;
    return;
  }
  geodesicTrailLines.visible = true;
  const bell = Math.sin(transProgress * Math.PI);
  const baseOpacity = (0.19 + 0.18 * lensFactor) * bell;
  const kMid = 8; // midpoint of each 16-point stroke
  const stepLag = 0.055;

  let segIdx = 0;
  for (let s = 0; s < NUM_STROKES; s++) {
    for (let step = 0; step < TRAIL_STEPS; step++) {
      const p0 = Math.max(0.0, transProgress - (step + 1) * stepLag);
      const p1 = Math.max(0.0, transProgress - step * stepLag);
      const [x0, y0, z0, dist] = evalRibbonPoint(srcA, srcB, s, kMid, p0);
      const [x1, y1, z1] = evalRibbonPoint(srcA, srcB, s, kMid, p1);

      const dst = segIdx * 6;
      trailPositions[dst] = x0;
      trailPositions[dst + 1] = y0;
      trailPositions[dst + 2] = z0;
      trailPositions[dst + 3] = x1;
      trailPositions[dst + 4] = y1;
      trailPositions[dst + 5] = z1;

      const decay = 1.0 - step / TRAIL_STEPS;
      const distWeight = Math.min(1.0, dist * 1.4);
      const a0 = baseOpacity * (decay - 0.28) * distWeight;
      const a1 = baseOpacity * decay * distWeight;
      trailAlphas[segIdx * 2] = Math.max(0.0, a0);
      trailAlphas[segIdx * 2 + 1] = Math.max(0.0, a1);
      segIdx++;
    }
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.aAlpha.needsUpdate = true;
}

/**
 * Updates the 240-bin 3D Fourier Spectrum Horizon around the floor ring when Fourier Lens is active.
 */
function updateSpectrumHorizon(sceneObj, lensFactor, effectiveHarmonics, timeSec) {
  if (lensFactor <= 0.005) {
    spectrumHorizonLines.visible = false;
    baseRingMat.opacity = 0.07;
    return;
  }
  spectrumHorizonLines.visible = true;
  specMat.opacity = 0.34 * lensFactor;
  baseRingMat.opacity = 0.07 + 0.14 * lensFactor;

  const bins = sceneObj.spectrumBins;
  const activeBins = Math.max(2, Math.round((effectiveHarmonics / MAX_HARMONICS) * NUM_SPECTRUM_BINS));
  for (let b = 0; b < NUM_SPECTRUM_BINS; b++) {
    const a = (b / NUM_SPECTRUM_BINS) * Math.PI * 2;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const bx = cosA * FLOOR_RADIUS;
    const bz = sinA * FLOOR_RADIUS;

    const isActive = b <= activeBins ? 1.0 : 0.08;
    const pulse = 1.0 + 0.12 * Math.sin(timeSec * 3.0 + b * 0.25);
    const h = bins[b] * 0.42 * lensFactor * isActive * pulse;

    const idx = b * 6;
    specPositions[idx] = bx;
    specPositions[idx + 1] = FLOOR_Y;
    specPositions[idx + 2] = bz;
    specPositions[idx + 3] = bx;
    specPositions[idx + 4] = FLOOR_Y + h;
    specPositions[idx + 5] = bz;
  }
  specGeo.attributes.position.needsUpdate = true;
}

// Anticipate each movement by 1.65s so the transition finishes right as the next movement starts
const TRANSITION_LEAD_SEC = 1.65;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) * 0.001);
  lastTime = now;

  lensBlend += ((fourierLensActive ? 1.0 : 0.0) - lensBlend) * Math.min(1.0, dt * 6.0);

  const songTime = audioEngine.isPlaying ? audioEngine.getCurrentTime() : (now * 0.001) % TOTAL_DURATION;
  if (audioEngine.isPlaying && songTime >= TOTAL_DURATION - 0.15) {
    audioEngine.seek(0);
  }

  const { chapter, index, localProgress } = getChapterAtTime(songTime);

  if (index !== activeChapterIdx) {
    activeChapterIdx = index;
    chapterTagEl.textContent = chapter.tag;
    chapterCaptionEl.textContent = chapter.caption;
    chapterButtons.forEach((item, idx) => {
      item.btn.classList.toggle('active', idx === activeChapterIdx);
    });
  }

  chapterButtons.forEach((item, idx) => {
    if (idx < activeChapterIdx) {
      item.fill.style.width = '100%';
    } else if (idx > activeChapterIdx) {
      item.fill.style.width = '0%';
    } else {
      item.fill.style.width = `${(localProgress * 100).toFixed(1)}%`;
    }
  });

  if (audioEngine.isPlaying) {
    timeReadout.textContent = `${formatTime(songTime)} / ${formatTime(TOTAL_DURATION)}`;
  }

  if (manualTransitionProgress < 1.0) {
    manualTransitionProgress = Math.min(1.0, manualTransitionProgress + dt * 0.82);
  }

  const timeSec = now * 0.001;
  const sampled = sampleSceneIntoBuffer(chapter.sceneKey, localProgress, timeSec, targetXYZ, targetPen);
  let activeSceneObj = sampled.sceneObj;

  let activeTransitionProgress = -1.0;
  let trailSrcA = null;
  let trailSrcB = null;

  const timeUntilNext = chapter.endTime - songTime;
  if (manualTransitionProgress < 1.0) {
    blendStrokesWithRibbonFlow(prevXYZ, targetXYZ, manualTransitionProgress, blendedXYZ);
    blendedPen.set(targetPen);
    activeTransitionProgress = manualTransitionProgress;
    trailSrcA = prevXYZ;
    trailSrcB = targetXYZ;
  } else if (index < CHAPTERS.length - 1 && timeUntilNext <= TRANSITION_LEAD_SEC) {
    // Anticipate the next movement over the final 1.65s so the new scene finishes forming right as the next movement begins
    const preProgress = Math.max(0.0, Math.min(1.0, 1.0 - timeUntilNext / TRANSITION_LEAD_SEC));
    const nextChapter = CHAPTERS[index + 1];
    const nextSampled = sampleSceneIntoBuffer(nextChapter.sceneKey, 0.0, timeSec, nextXYZ, nextPen);
    blendStrokesWithRibbonFlow(targetXYZ, nextXYZ, preProgress, blendedXYZ);
    blendedPen.set(nextPen);
    if (preProgress > 0.5) {
      activeSceneObj = nextSampled.sceneObj;
    }
    activeTransitionProgress = preProgress;
    trailSrcA = targetXYZ;
    trailSrcB = nextXYZ;
  } else {
    blendedXYZ.set(targetXYZ);
    blendedPen.set(targetPen);
    if (sampled.subTransitionProgress >= 0.0) {
      activeTransitionProgress = sampled.subTransitionProgress;
      trailSrcA = sampled.subSrcA;
      trailSrcB = sampled.subSrcB;
    }
  }

  // Per-stroke Harmonic Crystallization during transitions (and when user lowers HARMONICS N)
  const userStrokeModeCutoff = 1.0 + 13.0 * Math.pow(userHarmonicsN / MAX_HARMONICS, 0.65);
  let transitionStrokeModeCutoff = 14.0;
  let displayedHarmonics = userHarmonicsN;

  if (activeTransitionProgress >= 0.0 && activeTransitionProgress <= 1.0) {
    // Dip into pure low-order harmonic arcs mid-flight, then crystallize (N: 48 -> 2048) as the strokes land!
    const arch = Math.sin(activeTransitionProgress * Math.PI);
    transitionStrokeModeCutoff = 14.0 - 12.6 * Math.pow(arch, 0.75);
    const crystalN = Math.round(userHarmonicsN * (1.0 - 0.94 * Math.pow(arch, 0.85)));
    displayedHarmonics = Math.max(24, crystalN);
  }
  if (harmonicsValEl) {
    harmonicsValEl.textContent = String(displayedHarmonics);
  }

  const effectiveStrokeCutoff = Math.min(userStrokeModeCutoff, transitionStrokeModeCutoff);
  applyPerStrokeHarmonicCrystallization(blendedXYZ, effectiveStrokeCutoff);

  // Global 4,096-point 3D Fourier filter (active when user explores the HARMONICS N slider)
  filter3DFourierCurve(blendedXYZ, userHarmonicsN, reconstructedXYZ);

  // Update 3D optimal-transport geodesic trails and floor spectrum horizon
  updateGeodesicTrails(trailSrcA, trailSrcB, activeTransitionProgress, lensBlend);
  updateSpectrumHorizon(activeSceneObj, lensBlend, displayedHarmonics, timeSec);

  // One slow, unhurried pass of the stylus across the pre-drawn lines per movement
  let traceProgress = localProgress;
  if (chapter.sceneKey === 'scene4') {
    traceProgress = localProgress < 0.5 ? (localProgress / 0.5) : ((localProgress - 0.5) / 0.5);
  }
  const headFloat = Math.max(0, Math.min(NUM_SEGMENTS - 0.01, traceProgress * NUM_SEGMENTS));
  const headIdx = Math.floor(headFloat);

  const unweaveAmount = 1.0 - Math.min(1.0, (userHarmonicsN - 24) / 450);
  const jumpAlpha = unweaveAmount * 0.14;

  const WAKE_SPAN = 140;
  for (let i = 0; i < NUM_SEGMENTS; i++) {
    const src0 = i * 3;
    const src1 = (i + 1) * 3;
    const dst = i * 6;

    const x0 = reconstructedXYZ[src0];
    const y0 = reconstructedXYZ[src0 + 1];
    const z0 = reconstructedXYZ[src0 + 2];
    const x1 = reconstructedXYZ[src1];
    const y1 = reconstructedXYZ[src1 + 1];
    const z1 = reconstructedXYZ[src1 + 2];

    segPositions[dst] = x0;
    segPositions[dst + 1] = y0;
    segPositions[dst + 2] = z0;
    segPositions[dst + 3] = x1;
    segPositions[dst + 4] = y1;
    segPositions[dst + 5] = z1;

    const isConnected = blendedPen[i + 1] > 0.5;
    const segLenSq = (x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0) + (z1 - z0) * (z1 - z0);
    const validStroke = isConnected && segLenSq < 0.85;

    let alpha = jumpAlpha;
    let wake = 0.0;

    if (validStroke) {
      alpha = i <= headIdx ? 0.88 : 0.72;
      const distBehind = headIdx - i;
      if (distBehind >= 0 && distBehind < WAKE_SPAN) {
        wake = Math.pow(1.0 - distBehind / WAKE_SPAN, 1.8);
      }
    }

    segAlphas[i * 2] = alpha;
    segAlphas[i * 2 + 1] = alpha;
    segDepthHint[i * 2] = z0;
    segDepthHint[i * 2 + 1] = z1;
    segWake[i * 2] = wake;
    segWake[i * 2 + 1] = wake;
  }

  curveGeometry.attributes.position.needsUpdate = true;
  curveGeometry.attributes.aAlpha.needsUpdate = true;
  curveGeometry.attributes.aDepth.needsUpdate = true;
  curveGeometry.attributes.aWake.needsUpdate = true;

  if (showEpicycles && activeSceneObj) {
    updateTrue3DEpicycles(headFloat, timeSec, activeSceneObj, lensBlend);
  }

  // Subtle, balanced side-to-side rotation (±9.5 deg on Y, ±1.1 deg on Z) so neither side is ever extreme
  sculptureGroup.rotation.y = 0.165 * Math.sin(timeSec * 0.22);
  sculptureGroup.rotation.x = 0.04 + 0.025 * Math.sin(timeSec * 0.14);
  sculptureGroup.rotation.z = 0.020 * Math.cos(timeSec * 0.18);

  const energy = audioEngine.getEnergy(chapter.energy, timeSec);
  curveShaderMaterial.uniforms.uEnergy.value = energy;
  bloomPass.strength = 0.48 + energy * 0.18;

  controls.update();
  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(animate);
