// audio.js — Night Drive audio for BEVELEZ.AI
// 1. Outrun Radio: procedural synthwave stations defined in radio.js (or file stations), scheduled on
//    the AudioContext clock with a lookahead, each with its own tempo, swing, harmony, patterns,
//    timbres, lead phrase and a 16-bar arrangement (groove / breakdown / rise) so the music moves.
// 2. Google Gemini API Lyria 3.5 (lyria-3.5 / lyria-3-clip-preview) MP3 playback & live generation.

import { STATIONS, DEFAULT_STATION } from './radio.js?v=1';

const STEPS_PER_BAR = 16;
const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_VISIBLE = 0.12;
const LOOKAHEAD_HIDDEN = 1.4; // background tabs throttle timers to ~1 Hz
const STATION_KEY = 'bevelez_radio_station';

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function makeSoftClipCurve(drive = 1.7, samples = 1024) {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

// Pattern char -> velocity (0 = rest)
function hitVelocity(ch) {
  if (ch === 'x' || ch === 'X' || ch === 'O') return 1;
  if (ch === 'o') return 0.55;
  return 0;
}

export class CyberAudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.masterGain = null;
    this.masterLevel = 0.72;
    this.duckBus = null;
    this.padBus = null;
    this.bassDrive = null;
    this.reverbSend = null;
    this.reverbNode = null;
    this.delayNode = null;
    this.noiseBuffer = null;
    this.freqData = new Uint8Array(128);

    this.isPlaying = false;
    this.mode = 'standby'; // 'standby' | 'synth' | 'lyria'
    this.schedulerTimer = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.lookahead = LOOKAHEAD_VISIBLE;
    this.lastLeadFreq = null;
    this.riserArmedAt = -1;

    this.stations = STATIONS;
    this.stationIndex = this.loadStationIndex();
    this.station = this.stations[this.stationIndex];
    this.bpm = this.station.bpm;

    // HTML5 Audio element for file stations and Lyria 3.5 MP3 playback
    this.audioEl = new Audio();
    this.audioEl.loop = true;
    this.audioEl.crossOrigin = 'anonymous';
    this.mediaSourceNode = null;

    this.onStatusChange = null;
    this.onStationChange = null;

    document.addEventListener('visibilitychange', () => {
      this.lookahead = document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD_VISIBLE;
      if (this.schedulerTimer) this.schedulerTick();
    });
  }

  notify(label) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(label, this.isPlaying, this.mode);
    }
  }

  // ==========================================================================
  // Stations
  // ==========================================================================
  loadStationIndex() {
    try {
      const saved = parseInt(localStorage.getItem(STATION_KEY), 10);
      if (Number.isInteger(saved) && saved >= 0 && saved < STATIONS.length) return saved;
    } catch {
      // localStorage unavailable (private mode); fall through
    }
    return DEFAULT_STATION;
  }

  get stepDuration() {
    return (60 / this.station.bpm) / 4;
  }

  get loopSteps() {
    return this.station.arrangement.length * STEPS_PER_BAR;
  }

  setStation(index) {
    const count = this.stations.length;
    this.stationIndex = ((index % count) + count) % count;
    this.station = this.stations[this.stationIndex];
    this.bpm = this.station.bpm;
    try {
      localStorage.setItem(STATION_KEY, String(this.stationIndex));
    } catch {
      // ignore
    }
    if (typeof this.onStationChange === 'function') {
      this.onStationChange(this.station, this.stationIndex);
    }

    if (!this.isPlaying) return;
    if (this.station.type === 'file') {
      this.startLyriaPlayback(this.station.src).catch(() => this.startSynth());
    } else {
      this.startSynth();
    }
  }

  nextStation() {
    this.setStation(this.stationIndex + 1);
  }

  prevStation() {
    this.setStation(this.stationIndex - 1);
  }

  // ==========================================================================
  // Context & master chain
  // ==========================================================================
  initContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // Master: gain -> 28 Hz high-pass -> air shelf -> glue compressor -> brick-wall limiter -> analyser -> out
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterLevel;

    const rumbleCut = ctx.createBiquadFilter();
    rumbleCut.type = 'highpass';
    rumbleCut.frequency.value = 28;
    rumbleCut.Q.value = 0.7;

    const airShelf = ctx.createBiquadFilter();
    airShelf.type = 'highshelf';
    airShelf.frequency.value = 6500;
    airShelf.gain.value = 2.0;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 14;
    glue.ratio.value = 2.6;
    glue.attack.value = 0.012;
    glue.release.value = 0.26;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.09;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.masterGain.connect(rumbleCut);
    rumbleCut.connect(airShelf);
    airShelf.connect(glue);
    glue.connect(limiter);
    limiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Sidechain bus: pads, bass and arp pump under every kick
    this.duckBus = ctx.createGain();
    this.duckBus.connect(this.masterGain);

    // Bass saturation (gentle tanh) for analog weight; drive is re-shaped per station
    this.bassDrive = ctx.createWaveShaper();
    this.bassDrive.curve = makeSoftClipCurve(this.station.bass?.drive || 1.7);
    this.bassDrive.oversample = '2x';
    this.bassDrive.connect(this.duckBus);

    // Pad stereo chorus: dry centre + two LFO-modulated delay taps panned hard left / right
    this.padBus = ctx.createGain();
    const padDry = ctx.createGain();
    padDry.gain.value = 0.62;
    this.padBus.connect(padDry);
    padDry.connect(this.duckBus);

    const chorusTaps = [
      { base: 0.011, depth: 0.0022, rate: 0.31, pan: -0.72 },
      { base: 0.017, depth: 0.0019, rate: 0.27, pan: 0.72 }
    ];
    for (const tap of chorusTaps) {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = tap.base;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = tap.rate;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = tap.depth;
      lfo.connect(lfoDepth);
      lfoDepth.connect(delay.delayTime);
      lfo.start();

      const panner = ctx.createStereoPanner();
      panner.pan.value = tap.pan;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;

      this.padBus.connect(delay);
      delay.connect(panner);
      panner.connect(wet);
      wet.connect(this.duckBus);
    }

    // Reverb: 18 ms pre-delay into a darkening stereo tail
    this.reverbSend = ctx.createDelay(0.1);
    this.reverbSend.delayTime.value = 0.018;
    this.reverbNode = this.createReverb(2.8, 2.4);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.3;
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(reverbGain);
    reverbGain.connect(this.masterGain);

    // Tempo-synced dotted-eighth delay, band-limited feedback, returned off-centre
    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = (60 / this.station.bpm) * 0.75;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.34;
    const delayLow = ctx.createBiquadFilter();
    delayLow.type = 'highpass';
    delayLow.frequency.value = 320;
    const delayHigh = ctx.createBiquadFilter();
    delayHigh.type = 'lowpass';
    delayHigh.frequency.value = 2600;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.55;
    const delayPan = ctx.createStereoPanner();
    delayPan.pan.value = 0.45;
    this.delayNode.connect(delayLow);
    delayLow.connect(delayHigh);
    delayHigh.connect(delayFeedback);
    delayFeedback.connect(this.delayNode);
    delayHigh.connect(delayOut);
    delayOut.connect(delayPan);
    delayPan.connect(this.masterGain);

    // One shared noise bed for hats, snare, kick click and the riser
    const noiseLength = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const noise = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) {
      noise[i] = Math.random() * 2 - 1;
    }
  }

  createReverb(duration = 2.8, decay = 2.4) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // one-pole low-pass whose cutoff closes as the tail decays: bright early reflections, dark tail
        const coeff = 0.18 + 0.72 * t;
        lp += (Math.random() * 2 - 1 - lp) * (1 - coeff);
        data[i] = lp * Math.pow(1 - t, decay);
      }
    }
    const convolver = this.ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  fadeMaster(target, seconds) {
    const g = this.masterGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.linearRampToValueAtTime(target, now + seconds);
  }

  applyStationToGraph() {
    if (!this.ctx) return;
    this.bassDrive.curve = makeSoftClipCurve(this.station.bass?.drive || 1.7);
    this.delayNode.delayTime.setTargetAtTime((60 / this.station.bpm) * 0.75, this.ctx.currentTime, 0.05);
  }

  // ==========================================================================
  // Transport
  // ==========================================================================
  async toggle() {
    this.initContext();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.isPlaying) {
      this.stop();
      return false;
    }
    if (this.station.type === 'file') {
      try {
        await this.startLyriaPlayback(this.station.src);
        return true;
      } catch {
        // Missing or blocked file: fall through to the synth
      }
    } else if (this.audioEl.src && this.mode === 'lyria') {
      // A generated Lyria track is loaded: resume it
      await this.startLyriaPlayback();
      return true;
    }
    this.startSynth();
    return true;
  }

  startSynth() {
    this.initContext();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.audioEl.pause();
    this.stopScheduler();
    this.applyStationToGraph();
    this.isPlaying = true;
    this.mode = 'synth';
    this.lastLeadFreq = null;
    this.riserArmedAt = -1;

    this.fadeMaster(this.masterLevel, 0.35);
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.schedulerTick();
    this.schedulerTimer = setInterval(() => this.schedulerTick(), SCHEDULER_INTERVAL_MS);

    this.notify(`RADIO: ${this.station.name} (${this.station.bpm} BPM)`);
  }

  schedulerTick() {
    if (!this.isPlaying || !this.ctx || this.mode !== 'synth') return;
    const horizon = this.ctx.currentTime + this.lookahead;
    const stepDur = this.stepDuration;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += stepDur;
      this.currentStep = (this.currentStep + 1) % this.loopSteps;
    }
  }

  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async startLyriaPlayback(customSrc = null) {
    this.initContext();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.stopScheduler();
    if (customSrc && this.audioEl.src !== customSrc) {
      this.audioEl.src = customSrc;
    }
    if (!this.mediaSourceNode) {
      this.mediaSourceNode = this.ctx.createMediaElementSource(this.audioEl);
      this.mediaSourceNode.connect(this.masterGain);
    }

    await this.audioEl.play();
    this.fadeMaster(this.masterLevel, 0.3);
    this.isPlaying = true;
    this.mode = 'lyria';
    this.notify(this.station.type === 'file' ? `RADIO: ${this.station.name}` : 'AUDIO: LYRIA 3.5 AI SOUNDTRACK');
  }

  stop() {
    this.isPlaying = false;
    this.stopScheduler();
    if (this.masterGain) {
      this.fadeMaster(0.0001, 0.22);
    }
    this.audioEl.pause();
    this.notify('AUDIO: PAUSED');
  }

  // ==========================================================================
  // Sequencer — one 16th-note step of the current station at an exact AudioContext time
  // ==========================================================================
  scheduleStep(step, time) {
    if (!this.isPlaying || !this.ctx) return;
    const st = this.station;
    const stepDur = this.stepDuration;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const sib = step % STEPS_PER_BAR;
    const section = st.arrangement[bar] || 'A';
    const chord = st.chords[bar % st.chords.length];
    const barsInLoop = st.arrangement.length;
    const lastBar = bar === barsInLoop - 1;

    // Swing: push the off 16ths late
    const t = time + (sib % 2 === 1 ? (st.swing || 0) * stepDur : 0);

    const groove = section === 'A' || section === 'a';
    const breakdown = section === 'B';
    const rise = section === 'R';

    // 1. Pad on the downbeat; opens up in the breakdown and the rise
    if (sib === 0) {
      const brightness = breakdown ? 1.35 : rise ? 1.5 : section === 'a' ? 1.1 : 1.0;
      this.triggerPad(chord, t, stepDur * 15.6, brightness, st.pad);
    }

    // 2. Bass
    const root = st.bassRoots[bar % st.bassRoots.length];
    if (breakdown) {
      if (sib === 0 || sib === 8) {
        this.triggerBass(midiToFreq(root), t, stepDur * 7.5, 0.7, st.bass, true);
      }
    } else {
      const vel = hitVelocity(st.bassPattern[sib]);
      if (vel > 0) {
        const hop = st.bassHop[sib] === 'x' ? 12 : 0;
        this.triggerBass(midiToFreq(root + hop), t, stepDur * 0.88, vel * (hop ? 0.85 : 1), st.bass, false);
      }
    }

    // 3. Pluck arpeggio: pattern A in A bars, pattern B in a bars; quieter and wetter in the breakdown
    const pattern = section === 'a' || rise ? st.arpB : st.arpA;
    const noteIdx = pattern[sib];
    if (noteIdx !== null && noteIdx !== undefined) {
      const shimmer = st.arpOctaveShimmer && (section === 'a' || rise) && sib % 8 === 0 ? 24 : 12;
      const accent = sib % 4 === 0 ? 1 : 0.78;
      const level = breakdown ? 0.6 : 1;
      const pan = ((sib >> 1) % 2 === 0 ? -1 : 1) * 0.38;
      this.triggerPluck(midiToFreq(chord[noteIdx] + shimmer), t, stepDur * 1.5, accent * level, pan, st.pluck, breakdown);
    }

    // 4. Lead phrase (absolute bars in the loop)
    for (const [leadBar, leadStep, midi, len] of st.lead) {
      if (leadBar === bar && leadStep === sib) {
        this.triggerLead(midiToFreq(midi), t, stepDur * len);
      }
    }

    // 5. Drums
    if (groove) {
      const kickVel = hitVelocity(st.kick[sib]);
      if (kickVel > 0) {
        this.triggerKick(t, kickVel);
        this.duck(t);
      }
      const snareVel = hitVelocity(st.snare[sib]);
      if (snareVel > 0) this.triggerSnare(t, snareVel);
      this.triggerHatFromPattern(st, sib, t, 1);
      if (lastBar && sib >= 13) {
        this.triggerSnare(t, 0.5 + (sib - 13) * 0.2); // three-hit fill into the loop restart
      }
    } else if (breakdown) {
      if (sib % 4 === 2) this.triggerHat(t, 0.35 * (st.hatLevel || 0.8), false);
    } else if (rise) {
      if (sib % 4 === 0) {
        this.triggerKick(t, 0.9);
        this.duck(t);
      }
      // Snare roll: 8ths on the first rise bar, 16ths on the last, rising velocity
      const riseBars = this.countRun(st.arrangement, bar, 'R');
      const riseIndex = riseBars.index;
      const riseLen = riseBars.length;
      const isLastRise = riseIndex === riseLen - 1;
      const rollStep = isLastRise ? 1 : 2;
      if (sib % rollStep === 0) {
        const progress = (riseIndex + sib / STEPS_PER_BAR) / riseLen;
        this.triggerSnare(t, 0.35 + 0.65 * progress);
      }
      this.triggerHatFromPattern(st, sib, t, 0.8);
      if (riseIndex === 0 && sib === 0 && this.riserArmedAt !== bar) {
        this.riserArmedAt = bar;
        this.triggerRiser(t, stepDur * STEPS_PER_BAR * riseLen);
      }
    }
  }

  countRun(arrangement, bar, letter) {
    let start = bar;
    while (start > 0 && arrangement[start - 1] === letter) start--;
    let end = bar;
    while (end < arrangement.length - 1 && arrangement[end + 1] === letter) end++;
    return { index: bar - start, length: end - start + 1 };
  }

  triggerHatFromPattern(st, sib, time, scale) {
    const ch = st.hats[sib];
    if (ch === '.') return;
    const open = ch === 'O';
    const vel = (ch === 'o' ? 0.5 : open ? 0.75 : 0.85) * (st.hatLevel || 0.8) * scale;
    this.triggerHat(time + (Math.random() - 0.5) * 0.004, vel, open);
  }

  duck(time) {
    const g = this.duckBus.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(1, time);
    g.linearRampToValueAtTime(0.5, time + 0.014);
    g.setTargetAtTime(1, time + 0.05, 0.11);
  }

  // ==========================================================================
  // Voices
  // ==========================================================================
  noiseSource(time, duration) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.start(time, Math.random() * 1.5, duration);
    return src;
  }

  triggerPad(midiNotes, time, duration, brightness = 1, cfg = {}) {
    const ctx = this.ctx;
    const level = cfg.level || 0.05;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(level, time + 0.55);
    env.gain.setValueAtTime(level * 0.92, time + duration - 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.1);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cfg.lo || 480, time);
    filter.frequency.linearRampToValueAtTime((cfg.hi || 1500) * brightness, time + duration * 0.5);
    filter.frequency.linearRampToValueAtTime((cfg.lo || 480) * 1.3, time + duration);
    filter.Q.value = 1.2;

    const reverbAmt = ctx.createGain();
    reverbAmt.gain.value = brightness > 1.2 ? 0.9 : 0.6;

    env.connect(filter);
    filter.connect(this.padBus);
    filter.connect(reverbAmt);
    reverbAmt.connect(this.reverbSend);

    const subLevel = ctx.createGain();
    subLevel.gain.value = 0.45;
    subLevel.connect(env);

    const stopAt = time + duration + 0.15;
    midiNotes.forEach((note) => {
      const freq = midiToFreq(note);
      [-8, 8].forEach((detune) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.value = detune;
        osc.connect(env);
        osc.start(time);
        osc.stop(stopAt);
      });
      const under = ctx.createOscillator();
      under.type = 'triangle';
      under.frequency.setValueAtTime(freq / 2, time);
      under.connect(subLevel);
      under.start(time);
      under.stop(stopAt);
    });
  }

  triggerBass(freq, time, duration, vel = 0.7, cfg = {}, sustained = false) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = cfg.wave || 'sawtooth';
    sub.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    sub.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = cfg.cutoff || 560;
    filter.frequency.setValueAtTime(cutoff * (0.35 + vel * 0.75), time);
    filter.frequency.exponentialRampToValueAtTime(sustained ? 160 : 110, time + duration);
    filter.Q.value = sustained ? 1.6 : 3.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.26 * vel, time + 0.004);
    if (sustained) {
      gain.gain.setValueAtTime(0.24 * vel, time + duration - 0.25);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    const subGain = ctx.createGain();
    subGain.gain.value = sustained ? 0.5 : 0.3;

    osc.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.bassDrive);

    osc.start(time);
    sub.start(time);
    osc.stop(time + duration + 0.02);
    sub.stop(time + duration + 0.02);
  }

  triggerPluck(freq, time, duration, vel = 1, pan = 0, cfg = {}, wet = false) {
    const ctx = this.ctx;
    const wave = cfg.wave || 'sawtooth';
    const main = ctx.createOscillator();
    main.type = wave;
    main.frequency.setValueAtTime(freq, time);
    main.detune.value = -5;
    const second = ctx.createOscillator();
    second.type = wave === 'square' ? 'sawtooth' : 'square';
    second.frequency.setValueAtTime(freq, time);
    second.detune.value = 5;
    const secondLevel = ctx.createGain();
    secondLevel.gain.value = wave === 'triangle' ? 0.2 : 0.35;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200 + 1400 * vel, time);
    filter.frequency.exponentialRampToValueAtTime(420, time + duration);
    filter.Q.value = 0.9;

    const level = cfg.level || 0.07;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level * vel, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + duration);

    const delayAmt = ctx.createGain();
    delayAmt.gain.value = (cfg.delaySend || 0.45) * (wet ? 1.5 : 1);
    const reverbAmt = ctx.createGain();
    reverbAmt.gain.value = wet ? 0.7 : 0.35;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    main.connect(filter);
    second.connect(secondLevel);
    secondLevel.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.duckBus);
    gain.connect(delayAmt);
    delayAmt.connect(this.delayNode);
    gain.connect(reverbAmt);
    reverbAmt.connect(this.reverbSend);

    main.start(time);
    second.start(time);
    main.stop(time + duration + 0.02);
    second.stop(time + duration + 0.02);
  }

  triggerLead(freq, time, duration) {
    const ctx = this.ctx;
    const glideFrom = this.lastLeadFreq || freq;
    this.lastLeadFreq = freq;

    const vibrato = ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.value = 5.2;
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.setValueAtTime(0, time);
    vibratoDepth.gain.linearRampToValueAtTime(7, time + 0.5); // cents, swells in like a player would
    vibrato.connect(vibratoDepth);

    const voices = [-6, 6].map((detune) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(glideFrom, time);
      osc.frequency.exponentialRampToValueAtTime(freq, time + 0.07);
      osc.detune.value = detune;
      vibratoDepth.connect(osc.detune);
      return osc;
    });

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1700, time);
    filter.frequency.exponentialRampToValueAtTime(1100, time + duration);
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.032, time + 0.09);
    gain.gain.setValueAtTime(0.03, time + Math.max(0.1, duration - 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.05);

    const delayAmt = ctx.createGain();
    delayAmt.gain.value = 0.4;
    const reverbAmt = ctx.createGain();
    reverbAmt.gain.value = 0.55;

    voices.forEach((osc) => osc.connect(filter));
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(delayAmt);
    delayAmt.connect(this.delayNode);
    gain.connect(reverbAmt);
    reverbAmt.connect(this.reverbSend);

    const stopAt = time + duration + 0.1;
    vibrato.start(time);
    vibrato.stop(stopAt);
    voices.forEach((osc) => {
      osc.start(time);
      osc.stop(stopAt);
    });
  }

  triggerKick(time, vel = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.085);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.55 * vel, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.27);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.3);

    // Beater click so the kick reads on phone speakers that cannot reproduce 48 Hz
    const click = this.noiseSource(time, 0.015);
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 2600;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.11 * vel, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.014);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.masterGain);
  }

  triggerSnare(time, vel = 1) {
    const ctx = this.ctx;
    // 80s gated noise burst: holds flat for 90 ms, then is cut
    const noise = this.noiseSource(time, 0.24);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(1900, time);
    band.Q.value = 0.75;

    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0.2 * vel, time);
    gate.gain.setValueAtTime(0.17 * vel, time + 0.09);
    gate.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    noise.connect(band);
    band.connect(gate);
    gate.connect(this.masterGain);

    const reverbAmt = ctx.createGain();
    reverbAmt.gain.value = 0.5;
    gate.connect(reverbAmt);
    reverbAmt.connect(this.reverbSend);

    // Body tone underneath the noise
    const body = ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(205, time);
    body.frequency.exponentialRampToValueAtTime(160, time + 0.09);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.17 * vel, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    body.connect(bodyGain);
    bodyGain.connect(this.masterGain);
    body.start(time);
    body.stop(time + 0.14);
  }

  triggerHat(time, vel = 0.6, open = false) {
    const ctx = this.ctx;
    const decay = open ? 0.26 : 0.045;
    const noise = this.noiseSource(time, decay + 0.02);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(8200, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.085 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    const panner = ctx.createStereoPanner();
    panner.pan.value = open ? -0.3 : 0.22;

    noise.connect(hp);
    hp.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    if (open) {
      const reverbAmt = ctx.createGain();
      reverbAmt.gain.value = 0.3;
      gain.connect(reverbAmt);
      reverbAmt.connect(this.reverbSend);
    }
  }

  // Filtered-noise sweep that climbs across the rise bars into the drop
  triggerRiser(time, duration) {
    const ctx = this.ctx;
    const noise = this.noiseSource(time, duration + 0.1);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(260, time);
    band.frequency.exponentialRampToValueAtTime(6500, time + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.1, time + duration * 0.92);
    gain.gain.linearRampToValueAtTime(0.0001, time + duration + 0.05);

    const reverbAmt = ctx.createGain();
    reverbAmt.gain.value = 0.6;

    noise.connect(band);
    band.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(reverbAmt);
    reverbAmt.connect(this.reverbSend);
  }

  // ==========================================================================
  // Google Gemini API — Lyria 3.5
  // ==========================================================================
  async generateWithLyria({ apiKey, model = 'lyria-3.5', prompt }) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        model,
        input: prompt,
        response_format: { type: 'audio' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API returned ${response.status}: ${errText.slice(0, 220)}`);
    }

    const data = await response.json();

    // Extract base64 audio from either convenience field or steps[].content[]
    let base64Audio = data?.output_audio?.data || null;
    if (!base64Audio && Array.isArray(data?.steps)) {
      for (const step of data.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          for (const block of step.content) {
            if (block.type === 'audio' && block.data) {
              base64Audio = block.data;
              break;
            }
          }
        }
      }
    }

    if (!base64Audio) {
      throw new Error('No audio block returned in Lyria 3.5 response.');
    }

    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mp3' });
    const blobUrl = URL.createObjectURL(blob);

    await this.startLyriaPlayback(blobUrl);
    return blobUrl;
  }

  // ==========================================================================
  // Real-time metrics for the 3D scene & HUD visualizer
  // ==========================================================================
  getMetrics() {
    if (!this.analyser || !this.isPlaying) {
      return { bass: 0, mid: 0, high: 0, spectrum: this.freqData };
    }
    this.analyser.getByteFrequencyData(this.freqData);

    // 128 bins at ~172 Hz each: bass 0–690 Hz, mid 690 Hz–4.1 kHz, high 4.1–13.8 kHz
    let bassSum = 0;
    let midSum = 0;
    let highSum = 0;
    for (let i = 0; i < 4; i++) bassSum += this.freqData[i];
    for (let i = 4; i < 24; i++) midSum += this.freqData[i];
    for (let i = 24; i < 80; i++) highSum += this.freqData[i];

    return {
      bass: bassSum / (4 * 255),
      mid: midSum / (20 * 255),
      high: highSum / (56 * 255),
      spectrum: this.freqData
    };
  }
}
