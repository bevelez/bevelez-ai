// audio.js — Night Drive audio for BEVELEZ.AI
// 1. Google Gemini API Lyria 3.5 (lyria-3.5 / lyria-3-clip-preview) MP3 playback & live generation
// 2. Built-in Cyberpunk Chill Synthwave engine (92 BPM): scheduled on the AudioContext clock with a
//    lookahead (no setInterval drift), stereo-chorused Juno-style pads, rolling saturated bass under a
//    real sidechain pump, detuned pluck arpeggio, a sparse lead across the back half of the 8-bar loop,
//    80s gated drums, and a glue-compressed, brick-wall-limited master.

// Point this at a pre-generated Lyria file (e.g. './assets/lyria-cyberpunk.mp3') once it exists in the repo.
export const PREBAKED_TRACK = null;

const BPM = 92;
const STEPS_PER_BAR = 16;
const LOOP_BARS = 8;
const LOOP_STEPS = STEPS_PER_BAR * LOOP_BARS;
const STEP_DUR = (60 / BPM) / 4;

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_VISIBLE = 0.12;
const LOOKAHEAD_HIDDEN = 1.4; // background tabs throttle timers to ~1 Hz

// Am9 -> Fmaj9 -> Dm9 -> Em7 (vi – IV – ii – iii in C), four bars, played twice per loop
const CHORDS = [
  [57, 60, 64, 67, 71],
  [53, 57, 60, 64, 67],
  [50, 53, 57, 60, 64],
  [52, 55, 59, 62, 67]
];
const BASS_ROOTS = [33, 29, 38, 28]; // A1, F1, D2, E1
const BASS_VELOCITY = [1.0, 0.5, 0.68, 0.5, 0.86, 0.5, 0.7, 0.55, 0.95, 0.5, 0.68, 0.5, 0.86, 0.55, 0.72, 0.6];
const ARP_A = [0, null, 2, 4, null, 3, 1, null, 4, null, 2, 0, null, 3, 4, null];
const ARP_B = [4, null, 2, null, 3, 4, null, 1, 4, null, 0, 2, null, 4, 3, null];
// Sparse lead phrase over bars 5–8: [bar, step, midi, length in steps] — chord tones and 7ths/9ths only
const LEAD_PHRASE = [
  [4, 0, 76, 8], [4, 8, 79, 7],
  [5, 0, 81, 10], [5, 10, 79, 6],
  [6, 0, 77, 8], [6, 8, 76, 8],
  [7, 0, 74, 6], [7, 6, 71, 10]
];

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
    this.bpm = BPM;
    this.schedulerTimer = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.lookahead = LOOKAHEAD_VISIBLE;
    this.lastLeadFreq = null;

    // HTML5 Audio element for Lyria 3.5 MP3 playback
    this.audioEl = new Audio();
    this.audioEl.loop = true;
    this.audioEl.crossOrigin = 'anonymous';
    this.mediaSourceNode = null;
    if (PREBAKED_TRACK) {
      this.audioEl.src = PREBAKED_TRACK;
    }

    this.onStatusChange = null;

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

    // Bass saturation (gentle tanh) for analog weight
    this.bassDrive = ctx.createWaveShaper();
    this.bassDrive.curve = makeSoftClipCurve(1.7);
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

    // Dotted-eighth stereo-ish delay, band-limited feedback so it never muddies the lows
    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = (60 / this.bpm) * 0.75;
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

    // One shared noise bed for hats, snare and kick click
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
    if (this.audioEl.src) {
      try {
        await this.startLyriaPlayback();
        return true;
      } catch {
        // Missing or blocked file: fall through to the synth
      }
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
    this.isPlaying = true;
    this.mode = 'synth';
    this.lastLeadFreq = null;

    this.fadeMaster(this.masterLevel, 0.35);
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.schedulerTick();
    this.schedulerTimer = setInterval(() => this.schedulerTick(), SCHEDULER_INTERVAL_MS);

    this.notify('AUDIO: CYBERPUNK CHILL SYNTH (92 BPM)');
  }

  schedulerTick() {
    if (!this.isPlaying || !this.ctx || this.mode !== 'synth') return;
    const horizon = this.ctx.currentTime + this.lookahead;
    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += STEP_DUR;
      this.currentStep = (this.currentStep + 1) % LOOP_STEPS;
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
    if (customSrc) {
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
    this.notify('AUDIO: LYRIA 3.5 AI SOUNDTRACK');
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
  // Sequencer — one 16th-note step at an exact AudioContext time
  // ==========================================================================
  scheduleStep(step, time) {
    if (!this.isPlaying || !this.ctx) return;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const sib = step % STEPS_PER_BAR;
    const chord = CHORDS[bar % 4];
    const secondHalf = bar >= LOOP_BARS / 2;
    const lastBar = bar === LOOP_BARS - 1;

    // 1. Chorused pad on the downbeat, a touch brighter in the back half
    if (sib === 0) {
      this.triggerPad(chord, time, STEP_DUR * 15.6, secondHalf ? 1.1 : 1.0);
    }

    // 2. Rolling 16th bass with an octave hop on the "e" of each beat
    const root = BASS_ROOTS[bar % 4];
    const hop = sib % 4 === 2 ? 12 : 0;
    const bassVel = BASS_VELOCITY[sib] * (hop ? 0.85 : 1);
    this.triggerBass(midiToFreq(root + hop), time, STEP_DUR * 0.88, bassVel);

    // 3. Pluck arpeggio: pattern A for bars 1–4, pattern B (with octave shimmer) for bars 5–8
    const pattern = secondHalf ? ARP_B : ARP_A;
    const noteIdx = pattern[sib];
    if (noteIdx !== null) {
      const octave = secondHalf && sib % 8 === 0 ? 24 : 12;
      const pan = ((sib >> 1) % 2 === 0 ? -1 : 1) * 0.38;
      this.triggerPluck(midiToFreq(chord[noteIdx] + octave), time, STEP_DUR * 1.5, sib % 4 === 0 ? 1 : 0.78, pan);
    }

    // 4. Sparse lead phrase, bars 5–8 only
    for (const [leadBar, leadStep, midi, len] of LEAD_PHRASE) {
      if (leadBar === bar && leadStep === sib) {
        this.triggerLead(midiToFreq(midi), time, STEP_DUR * len);
      }
    }

    // 5. Drums: kick 1 & 3 (+ pickup on odd bars), gated snare 2 & 4, 8th hats, open hat into each 4-bar turn
    if (sib === 0 || sib === 8 || (bar % 2 === 1 && sib === 10)) {
      this.triggerKick(time);
      this.duck(time);
    }
    if (sib === 4 || sib === 12) {
      this.triggerSnare(time, 1);
    }
    if (lastBar && sib >= 13) {
      this.triggerSnare(time, 0.5 + (sib - 13) * 0.2); // three-hit fill into the loop restart
    }
    if (sib % 2 === 0) {
      const accent = sib % 4 === 2 ? 0.85 : 0.5;
      this.triggerHat(time + (Math.random() - 0.5) * 0.004, accent, false);
    }
    if (sib === 14 && bar % 4 === 3) {
      this.triggerHat(time, 0.75, true);
    }
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

  triggerPad(midiNotes, time, duration, brightness = 1) {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.05, time + 0.55);
    env.gain.setValueAtTime(0.046, time + duration - 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.1);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, time);
    filter.frequency.linearRampToValueAtTime(1500 * brightness, time + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(620, time + duration);
    filter.Q.value = 1.2;

    const reverbAmt = ctx.createGain();
    reverbAmt.gain.value = 0.6;

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

  triggerBass(freq, time, duration, vel = 0.7) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    osc.type = 'sawtooth';
    sub.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    sub.frequency.setValueAtTime(freq, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(190 + vel * 560, time);
    filter.frequency.exponentialRampToValueAtTime(110, time + duration);
    filter.Q.value = 3.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.26 * vel, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.3;

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

  triggerPluck(freq, time, duration, vel = 1, pan = 0) {
    const ctx = this.ctx;
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(freq, time);
    saw.detune.value = -5;
    const square = ctx.createOscillator();
    square.type = 'square';
    square.frequency.setValueAtTime(freq, time);
    square.detune.value = 5;
    const squareLevel = ctx.createGain();
    squareLevel.gain.value = 0.35;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200 + 1400 * vel, time);
    filter.frequency.exponentialRampToValueAtTime(420, time + duration);
    filter.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.07 * vel, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + duration);

    const delayAmt = ctx.createGain();
    delayAmt.gain.value = 0.45;
    const reverbAmt = ctx.createGain();
    reverbAmt.gain.value = 0.35;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    saw.connect(filter);
    square.connect(squareLevel);
    squareLevel.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.duckBus);
    gain.connect(delayAmt);
    delayAmt.connect(this.delayNode);
    gain.connect(reverbAmt);
    reverbAmt.connect(this.reverbSend);

    saw.start(time);
    square.start(time);
    saw.stop(time + duration + 0.02);
    square.stop(time + duration + 0.02);
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
    gain.gain.setValueAtTime(0.03, time + duration - 0.2);
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

  triggerKick(time) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.085);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.55, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.27);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.3);

    // Beater click so the kick reads on phone speakers that cannot reproduce 44 Hz
    const click = this.noiseSource(time, 0.015);
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 2600;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.11, time);
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
