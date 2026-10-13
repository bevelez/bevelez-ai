// audio.js — Dual-engine Audio System for BEVELEZ.AI
// 1. Google Gemini API Lyria 3.5 (lyria-3.5 / lyria-3-clip-preview) MP3 playback & live generation
// 2. Built-in Real-Time Cyberpunk Chill Synthwave Web Audio Synthesizer (92 BPM)

export class CyberAudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.masterGain = null;
    this.reverbNode = null;
    this.delayNode = null;
    this.freqData = new Uint8Array(64);

    this.isPlaying = false;
    this.mode = 'standby'; // 'standby' | 'synth' | 'lyria'
    this.stepTimer = null;
    this.currentStep = 0;
    this.bpm = 92;

    // HTML5 Audio element for Lyria 3.5 MP3 playback
    this.audioEl = new Audio();
    this.audioEl.loop = true;
    this.audioEl.crossOrigin = 'anonymous';
    this.mediaSourceNode = null;
    this.hasPrebakedLyria = false;

    this.onStatusChange = null;
    this.checkPrebakedLyriaTrack();
  }

  async checkPrebakedLyriaTrack() {
    try {
      const res = await fetch('./assets/lyria-cyberpunk.mp3', { method: 'HEAD' });
      if (res.ok && res.headers.get('content-type')?.includes('audio')) {
        this.hasPrebakedLyria = true;
        this.audioEl.src = './assets/lyria-cyberpunk.mp3';
        this.notify('LYRIA 3.5 TRACK READY');
      }
    } catch {
      // No prebaked MP3 yet; WebAudio synth will play by default
    }
  }

  notify(label) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange(label, this.isPlaying, this.mode);
    }
  }

  initContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.75;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    // Stereo algorithmic reverb impulse for lush cyberpunk chill atmosphere
    this.reverbNode = this.createReverb(2.8, 2.2);
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.38;

    // Dub/synthwave dotted-eighth stereo delay
    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = (60 / this.bpm) * 0.75;
    const delayFeedback = this.ctx.createGain();
    delayFeedback.gain.value = 0.36;
    const delayFilter = this.ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2100;

    this.delayNode.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(this.delayNode);
    delayFilter.connect(this.masterGain);

    this.reverbNode.connect(reverbGain);
    reverbGain.connect(this.masterGain);

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  createReverb(duration = 2.6, decay = 2.0) {
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    const convolver = this.ctx.createConvolver();
    convolver.buffer = impulse;
    return convolver;
  }

  async toggle() {
    this.initContext();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      if (this.audioEl.src) {
        await this.startLyriaPlayback();
      } else {
        this.startSynth();
      }
      return true;
    }
  }

  startSynth() {
    this.initContext();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.audioEl.pause();
    this.isPlaying = true;
    this.mode = 'synth';

    if (this.stepTimer) clearInterval(this.stepTimer);
    const stepMs = ((60 / this.bpm) / 4) * 1000; // 16th note
    this.currentStep = 0;
    this.scheduleStep(this.currentStep);
    this.stepTimer = setInterval(() => {
      this.currentStep = (this.currentStep + 1) % 64;
      this.scheduleStep(this.currentStep);
    }, stepMs);

    this.notify('AUDIO: CYBERPUNK CHILL SYNTH (92 BPM)');
  }

  async startLyriaPlayback(customSrc = null) {
    this.initContext();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (customSrc) {
      this.audioEl.src = customSrc;
    }
    if (!this.mediaSourceNode) {
      this.mediaSourceNode = this.ctx.createMediaElementSource(this.audioEl);
      this.mediaSourceNode.connect(this.masterGain);
    }

    await this.audioEl.play();
    this.isPlaying = true;
    this.mode = 'lyria';
    this.notify('AUDIO: LYRIA 3.5 AI SOUNDTRACK');
  }

  stop() {
    this.isPlaying = false;
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    this.audioEl.pause();
    this.notify('AUDIO: PAUSED');
  }

  // --- Procedural Cyberpunk Chill Synthwave Sequencer ---
  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  scheduleStep(step) {
    if (!this.isPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;
    const stepDur = (60 / this.bpm) / 4;

    // 4-bar chord progression (16 steps per bar): Am9 -> Fmaj9 -> Dm9 -> Em7
    const chords = [
      [57, 60, 64, 67, 71], // Am9
      [53, 57, 60, 64, 67], // Fmaj9
      [50, 53, 57, 60, 64], // Dm9
      [52, 55, 59, 62, 67]  // Em7
    ];
    const bassRoots = [33, 29, 38, 28]; // A1, F1, D2, E1

    const bar = Math.floor(step / 16);
    const stepInBar = step % 16;

    // 1. Lush Warm Juno Pad on beat 1 of each bar
    if (stepInBar === 0) {
      this.triggerPadChord(chords[bar], now, stepDur * 15.5);
    }

    // 2. Rolling Analog Sub-Bass on 16th notes (with sidechain ducking on kick)
    const root = bassRoots[bar];
    const octaveJump = (stepInBar % 4 === 2) ? 12 : 0;
    const velocity = (stepInBar % 8 === 0) ? 0.35 : 0.65; // sidechain feel
    this.triggerBass(this.midiToFreq(root + octaveJump), now, stepDur * 0.85, velocity);

    // 3. Dreamy Cyberpunk Arpeggio / Pluck Lead
    const arpPattern = [0, null, 2, 4, null, 3, 1, null, 4, null, 2, 0, null, 3, 4, null];
    const noteIdx = arpPattern[stepInBar];
    if (noteIdx !== null) {
      const midiNote = chords[bar][noteIdx] + 12;
      this.triggerLeadPluck(this.midiToFreq(midiNote), now, stepDur * 1.4);
    }

    // 4. Chill 80s Synthwave Drums
    if (stepInBar === 0 || stepInBar === 8 || (bar % 2 === 1 && stepInBar === 10)) {
      this.triggerKick(now);
    }
    if (stepInBar === 4 || stepInBar === 12) {
      this.triggerGatedSnare(now);
    }
    if (stepInBar % 2 === 0) {
      this.triggerHat(now, stepInBar % 4 === 2 ? 0.08 : 0.04);
    }
  }

  triggerPadChord(midiNotes, time, duration) {
    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.001, time);
    chordGain.gain.linearRampToValueAtTime(0.085, time + 0.6);
    chordGain.gain.setValueAtTime(0.075, time + duration - 0.8);
    chordGain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, time);
    filter.frequency.linearRampToValueAtTime(1450, time + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(700, time + duration);
    filter.Q.value = 1.5;

    chordGain.connect(filter);
    filter.connect(this.masterGain);
    filter.connect(this.reverbNode);

    midiNotes.forEach((note) => {
      [-9, 9].forEach((detune) => {
        const osc = this.ctx.createOscillator();
        osc.type = detune < 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(this.midiToFreq(note), time);
        osc.detune.value = detune;
        osc.connect(chordGain);
        osc.start(time);
        osc.stop(time + duration + 0.05);
      });
    });
  }

  triggerBass(freq, time, duration, vel = 0.6) {
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    sub.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    sub.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, time);
    filter.frequency.exponentialRampToValueAtTime(110, time + duration);
    filter.Q.value = 4.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    sub.start(time);
    osc.stop(time + duration + 0.02);
    sub.stop(time + duration + 0.02);
  }

  triggerLeadPluck(freq, time, duration) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, time);
    filter.frequency.exponentialRampToValueAtTime(450, time + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.09, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.delayNode);
    gain.connect(this.reverbNode);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  triggerKick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(135, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.12);

    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  triggerGatedSnare(time) {
    // 80s gated noise burst + body tone
    const bufferSize = this.ctx.sampleRate * 0.22;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, time);
    filter.Q.value = 0.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.setValueAtTime(0.14, time + 0.11);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.21);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.connect(this.reverbNode);
    noise.start(time);
  }

  triggerHat(time, level = 0.05) {
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    noise.connect(hp);
    hp.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
  }

  // --- Google Gemini API Lyria 3.5 Integration ---
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

  // Real-time audio metrics for 3D scene & HUD visualizer
  getMetrics() {
    if (!this.analyser || !this.isPlaying) {
      return { bass: 0, mid: 0, high: 0, spectrum: this.freqData };
    }
    this.analyser.getByteFrequencyData(this.freqData);

    let bassSum = 0;
    let midSum = 0;
    let highSum = 0;
    for (let i = 0; i < 8; i++) bassSum += this.freqData[i];
    for (let i = 8; i < 24; i++) midSum += this.freqData[i];
    for (let i = 24; i < 48; i++) highSum += this.freqData[i];

    return {
      bass: (bassSum / (8 * 255)),
      mid: (midSum / (16 * 255)),
      high: (highSum / (24 * 255)),
      spectrum: this.freqData
    };
  }
}
