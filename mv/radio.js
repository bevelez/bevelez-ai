// Chill background radio: Radio Browser (community directory, CORS-enabled, no key) with a
// built-in Web Audio ambient pad as the no-network fallback.

const RB_HOSTS = ['https://de1.api.radio-browser.info', 'https://at1.api.radio-browser.info', 'https://nl1.api.radio-browser.info'];

export const MOODS = [
  { id: 'space', label: 'Deep Space', tag: 'ambient', hint: 'slow pads, Stellaris energy', seeds: [
    { name: 'SomaFM Deep Space One', url: 'https://ice5.somafm.com/deepspaceone-128-mp3', country: 'US', codec: 'MP3', bitrate: 128 },
    { name: 'SomaFM Drone Zone', url: 'https://ice5.somafm.com/dronezone-128-mp3', country: 'US', codec: 'MP3', bitrate: 128 },
    { name: 'SomaFM Space Station Soma', url: 'https://ice5.somafm.com/spacestation-128-mp3', country: 'US', codec: 'MP3', bitrate: 128 } ] },
  { id: 'chill', label: 'Chillout', tag: 'chillout', hint: 'downtempo, late-night drive', seeds: [
    { name: 'SomaFM Groove Salad', url: 'https://ice5.somafm.com/groovesalad-128-mp3', country: 'US', codec: 'MP3', bitrate: 128 },
    { name: 'SomaFM Fluid', url: 'https://ice5.somafm.com/fluid-128-mp3', country: 'US', codec: 'MP3', bitrate: 128 },
    { name: 'SomaFM Lush', url: 'https://ice5.somafm.com/lush-128-mp3', country: 'US', codec: 'MP3', bitrate: 128 } ] },
  { id: 'lofi', label: 'Lo-fi', tag: 'lofi', hint: 'beats to watch a city to', seeds: [] },
  { id: 'synth', label: 'Synthwave', tag: 'synthwave', hint: 'neon, 80s, outrun', seeds: [
    { name: 'SomaFM Underground 80s', url: 'https://ice5.somafm.com/u80s-128-mp3', country: 'US', codec: 'MP3', bitrate: 128 } ] }
];

async function rbFetch(path) {
  let lastErr = null;
  for (const host of RB_HOSTS) {
    try {
      const r = await fetch(host + path, { headers: { Accept: 'application/json' } });
      if (r.ok) return await r.json();
      lastErr = new Error(`${host} ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('radio-browser unreachable');
}

export async function fetchStations(mood) {
  const q = new URLSearchParams({ tag: mood.tag, order: 'votes', reverse: 'true', limit: '40', hidebroken: 'true', is_https: 'true' });
  let rows = [];
  try { rows = await rbFetch(`/json/stations/search?${q}`); } catch (e) { rows = []; }
  const found = rows
    .filter((s) => s.url_resolved && /^https:/.test(s.url_resolved) && !/\.m3u8?$/i.test(s.url_resolved))
    .map((s) => ({ uuid: s.stationuuid, name: (s.name || '').trim().slice(0, 48), url: s.url_resolved, country: s.countrycode || '', codec: s.codec || '', bitrate: s.bitrate || 0, votes: s.votes || 0 }));
  // Seeds first (known-good, listener-supported streams), then the directory, de-duplicated by URL.
  const seen = new Set();
  const out = [];
  for (const s of [...mood.seeds, ...found]) {
    const k = s.url.replace(/\/+$/, '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

// Minimal ambient pad: three detuned saws through a slow low-pass, with a breathing LFO.
export class AmbientPad {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.nodes = [];
    this.playing = false;
  }
  start(volume = 0.5) {
    if (this.playing) return;
    const ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(volume * 0.5, ctx.currentTime + 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    delay.connect(fb).connect(delay);
    filter.connect(master);
    filter.connect(delay);
    delay.connect(master);
    master.connect(ctx.destination);
    // D minor 9 voicing: D2 A2 F3 C4 E4
    const freqs = [73.42, 110.0, 174.61, 261.63, 329.63];
    freqs.forEach((f, i) => {
      for (const det of [-6, 0, 6]) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = i < 2 ? 0.045 : 0.03;
        o.connect(g).connect(filter);
        o.start();
        this.nodes.push(o, g);
      }
    });
    this.nodes.push(lfo, lfoGain, filter, delay, fb);
    this.master = master;
    this.playing = true;
  }
  setVolume(v) {
    if (this.master) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2);
  }
  stop() {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.6);
    const nodes = this.nodes;
    setTimeout(() => nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch (e) {} }), 2200);
    this.nodes = [];
    this.playing = false;
  }
}

export class Radio {
  constructor(els) {
    this.els = els; // { play, next, mood, name, meta, volume, status }
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'none';
    this.pad = new AmbientPad();
    this.mood = MOODS[0];
    this.stations = [];
    this.idx = 0;
    this.playing = false;
    this.usingPad = false;
    this.volume = Number(localStorage.getItem('mv_live_radio_vol') || 0.6);
    this.audio.volume = this.volume;
    this._bind();
  }
  _bind() {
    const { play, next, mood, volume } = this.els;
    play.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    next.addEventListener('click', () => this.nextStation());
    mood.addEventListener('change', () => this.setMood(mood.value));
    volume.value = String(this.volume);
    volume.addEventListener('input', () => this.setVolume(Number(volume.value)));
    this.audio.addEventListener('error', () => this._onStreamFail());
    this.audio.addEventListener('stalled', () => this._status('buffering…'));
    this.audio.addEventListener('playing', () => this._status('live'));
    this.audio.addEventListener('waiting', () => this._status('buffering…'));
  }
  _status(t) { this.els.status.textContent = t; }
  async setMood(id) {
    this.mood = MOODS.find((m) => m.id === id) || MOODS[0];
    localStorage.setItem('mv_live_radio_mood', this.mood.id);
    this.stations = [];
    this.idx = 0;
    if (this.playing) await this.play();
  }
  async _ensureStations() {
    if (this.stations.length) return;
    this._status('finding stations…');
    try {
      this.stations = await fetchStations(this.mood);
      // Keep the curated seeds first; shuffle the directory tail so it is not the same station every time.
      const head = this.stations.slice(0, this.mood.seeds.length);
      const tail = this.stations.slice(this.mood.seeds.length);
      for (let i = tail.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tail[i], tail[j]] = [tail[j], tail[i]]; }
      this.stations = head.concat(tail);
    } catch (e) {
      this.stations = [];
    }
  }
  async play() {
    this.playing = true;
    this.els.play.textContent = '❚❚';
    await this._ensureStations();
    if (!this.stations.length) return this._playPad('no stream reachable · ambient pad');
    this._playStation();
  }
  _playStation() {
    const s = this.stations[this.idx % this.stations.length];
    if (!s) return this._playPad('ambient pad');
    this.pad.stop();
    this.usingPad = false;
    this.audio.src = s.url;
    this.els.name.textContent = s.name || 'Unknown station';
    this.els.meta.textContent = [s.country, s.codec, s.bitrate ? `${s.bitrate} kbps` : ''].filter(Boolean).join(' · ');
    this._status('connecting…');
    this.audio.play().catch(() => this._onStreamFail());
    this._failTimer = setTimeout(() => { if (this.playing && !this.usingPad && this.audio.readyState < 3) this._onStreamFail(); }, 9000);
  }
  _onStreamFail() {
    clearTimeout(this._failTimer);
    if (!this.playing || this.usingPad) return;
    this._fails = (this._fails || 0) + 1;
    if (this._fails > 6) return this._playPad('streams unreachable · ambient pad');
    this.idx += 1;
    this._playStation();
  }
  _playPad(reason) {
    this.usingPad = true;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.pad.start(this.volume);
    this.els.name.textContent = 'Built-in ambient pad';
    this.els.meta.textContent = 'Web Audio · D minor 9 · no network';
    this._status(reason);
  }
  nextStation() {
    this._fails = 0;
    this.idx += 1;
    if (this.playing) this._playStation();
  }
  pause() {
    this.playing = false;
    clearTimeout(this._failTimer);
    this.audio.pause();
    this.pad.stop();
    this.els.play.textContent = '▶';
    this._status('paused');
  }
  setVolume(v) {
    this.volume = v;
    this.audio.volume = v;
    this.pad.setVolume(v);
    localStorage.setItem('mv_live_radio_vol', String(v));
  }
}
