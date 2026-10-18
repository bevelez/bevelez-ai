/**
 * kronos-sfx.js
 * Table-Driven Fighting Foley Synth Recipes & Procedural Web Audio Voice Builders for DJ KRONOS.
 * Extracted from kronos.js in Phase 2 (Structure First) with zero behavior change.
 */

export const MAX_CATEGORY_VOICES = {
  'stage-ko': 2,
  'kick': 4,
  'counter-weave': 3,
  'enemy-telegraph': 3,
  'crowd-swell': 2,
  'boss-bass-telegraph': 2,
  'boss-scratch-telegraph': 2
};

export const SFX_SYNTH_TABLE = {
  'punch-jab': {
    priority: 1, dur: 0.125, duck: null,
    thud: { gain: 0.42, dur: 0.120 },
    subDrop: { f0: 115, f1: 44, dur: 0.075, gain: 0.38, earlyGain: 0.22 },
    snap: { cf: 1600, maxCf: 2200, q: 1.8, gain: 0.44, dur: 0.050 },
    whoosh: { f0: 550, f1: 1750, q: 1.6, gain: 0.22, dur: 0.060 },
    air: { perfectGain: 0.16, goodGain: 0.08, dur: 0.035 },
    chord: { notes: [196.00, 146.83], lp: 650, maxLp: 800, q: 0.707, perfectGain: 0.12, goodGain: 0.06, dur: 0.110 }
  },
  'punch-cross': {
    priority: 2, dur: 0.165, duck: null,
    thud: { gain: 0.48, dur: 0.150 },
    subPunch: { gain: 0.40, earlyGain: 0.20, dur: 0.140 },
    subDrop: { f0: 135, f1: 38, dur: 0.105, gain: 0.45, earlyGain: 0.25 },
    snap: { cf: 1250, maxCf: 1800, q: 1.8, gain: 0.50, dur: 0.070 },
    whoosh: { f0: 480, f1: 1600, q: 1.6, gain: 0.26, dur: 0.090 },
    air: { perfectGain: 0.18, goodGain: 0.08, dur: 0.038 },
    chord: { notes: [116.54, 146.83, 174.61], lp: 850, maxLp: 1000, q: 0.8, perfectGain: 0.14, goodGain: 0.07, dur: 0.150 }
  },
  'punch-uppercut': {
    priority: 5, dur: 0.245, duck: { perfect: -3.5, good: -2.0, early: -0.8, dur: 0.18 },
    subPunch: { gain: 0.65, earlyGain: 0.35, dur: 0.210 },
    thud: { gain: 0.58, dur: 0.160 },
    subDrop: { f0: 160, f1: 32, dur: 0.170, gain: 0.58, earlyGain: 0.45 },
    dualSnap: { cfs: [850, 1900], gain: 0.55, dur: 0.100 },
    whoosh: { f0: 380, f1: 2100, q: 1.8, gain: 0.32, dur: 0.135 },
    air: { perfectGain: 0.22, goodGain: 0.10, dur: 0.040 },
    stinger: { notes: [{ f: 98.00, dt: 0 }, { f: 146.83, dt: 0.02 }, { f: 196.00, dt: 0.04 }, { f: 233.08, dt: 0.06 }], lp: 1100, maxLp: 1200, q: 0.9, perfectGain: 0.16, goodGain: 0.08, dur: 0.220 }
  },
  'kick': {
    priority: 4, dur: 0.270, duck: { perfect: -4.5, good: -2.5, early: -1.0, dur: 0.22 },
    subPunch: { gain: 0.70, earlyGain: 0.40, dur: 0.220 },
    thud: { gain: 0.65, dur: 0.160 },
    subDrop: { f0: 140, f1: 32.7, dur: 0.200, gain: 0.68, earlyGain: 0.50, saturated: true },
    snap: { cf: 950, maxCf: 1400, q: 1.4, gain: 0.55, dur: 0.065 },
    whoosh: { f0: 320, f1: 1500, q: 1.7, gain: 0.36, dur: 0.160 },
    air: { perfectGain: 0.20, goodGain: 0.09, dur: 0.038 },
    chord: { notes: [98.00, 146.83, 196.00, 293.66], lp: 950, maxLp: 1100, q: 1.0, perfectGain: 0.18, goodGain: 0.09, dur: 0.250 }
  },
  'dodge': {
    priority: 3, dur: 0.155, duck: null,
    whoosh: { f0: 450, f1: 1550, q: 1.8, gain: 0.38, dur: 0.145 },
    air: { perfectGain: 0.12, goodGain: 0.12, dur: 0.038, always: true },
    resTone: { f: 196.00, q: 3.0, gain: 0.035, dur: 0.120 }
  },
  'miss-whiff': {
    priority: 1, dur: 0.110, duck: null,
    whoosh: { f0: 340, f1: 820, q: 2.0, gain: 0.20, dur: 0.095 },
    subDrop: { f0: 95, f1: 62, dur: 0.070, gain: 0.14, earlyGain: 0.14 }
  },
  'counter-weave': {
    priority: 8, dur: 0.390, duck: { perfect: -5.0, good: -5.0, early: -5.0, dur: 0.25 },
    whoosh: { f0: 300, f1: 2600, q: 2.2, gain: 0.36, dur: 0.080 },
    subPunch: { gain: 0.45, earlyGain: 0.45, dur: 0.180 },
    thud: { gain: 0.55, dur: 0.140 },
    air: { perfectGain: 0.22, goodGain: 0.22, dur: 0.040, always: true },
    chord: { notes: [196.00, 233.08, 293.66, 349.23], lp: 1100, maxLp: 1200, q: 1.1, perfectGain: 0.18, goodGain: 0.18, dur: 0.220, always: true },
    chime: { notes: [293.66, 392.00], lp: 600, maxLp: 750, q: 1.2, gain: 0.10, dur: 0.350 }
  },
  'enemy-telegraph': {
    priority: 6, dur: 0.225, duck: null,
    tensionDrone: { f0A: 146.83, f1A: 155.56, f0B: 98.00, f1B: 116.54, lp: 480, maxLp: 600, q: 1.4, gain: 0.24, dur: 0.210 },
    whoosh: { f0: 280, f1: 750, q: 1.8, gain: 0.26, dur: 0.200 },
    thud: { gain: 0.20, dur: 0.100 }
  },
  'player-damaged': {
    priority: 7, dur: 0.220, duck: { perfect: -6.0, good: -6.0, early: -6.0, dur: 0.30 }, concussion: { cutoff: 450, dur: 0.40 },
    thud: { gain: 0.68, dur: 0.170 },
    subPunch: { gain: 0.60, earlyGain: 0.60, dur: 0.180 },
    subDrop: { f0: 92, f1: 26, dur: 0.140, gain: 0.62, earlyGain: 0.62 },
    snap: { cf: 520, maxCf: 800, q: 1.8, gain: 0.52, dur: 0.080, saturated: true }
  },
  'guard-deflect': {
    priority: 4, dur: 0.140, duck: null,
    thud: { gain: 0.35, dur: 0.095 },
    snap: { cf: 1400, maxCf: 1850, q: 2.4, gain: 0.36, dur: 0.055 },
    chime: { notes: [392.00, 587.33], lp: 950, maxLp: 1100, q: 1.4, gain: 0.08, dur: 0.120 }
  },
  'guard-break': {
    priority: 8, dur: 0.280, duck: { perfect: -6.0, good: -6.0, early: -6.0, dur: 0.25 }, concussion: { cutoff: 600, dur: 0.35 },
    subDrop: { f0: 160, f1: 40, dur: 0.190, gain: 0.60, earlyGain: 0.60 },
    thud: { gain: 0.58, dur: 0.150 },
    snap: { cf: 1450, maxCf: 1900, q: 3.0, gain: 0.52, dur: 0.120, saturated: true },
    chime: { notes: [659.25, 987.77], lp: 1200, maxLp: 1400, q: 1.2, gain: 0.14, dur: 0.260 }
  },
  'subwoofer-bass-drop': {
    priority: 8, dur: 0.480, duck: { perfect: -5.5, good: -5.5, early: -5.5, dur: 0.32 },
    subPunch: { gain: 0.72, earlyGain: 0.72, dur: 0.220 },
    thud: { gain: 0.64, dur: 0.160 },
    subDrop: { f0: 110, f1: 28, dur: 0.420, gain: 0.75, earlyGain: 0.75, saturated: true },
    whoosh: { f0: 240, f1: 1200, q: 1.6, gain: 0.32, dur: 0.220 }
  },
  'stage-ko': {
    priority: 9, dur: 1.150, duck: { perfect: -8.0, good: -8.0, early: -8.0, dur: 0.55 }, concussion: { cutoff: 450, dur: 0.45 },
    subPunch: { gain: 0.75, earlyGain: 0.75, dur: 0.220 },
    thud: { gain: 0.70, dur: 0.160 },
    subDrop: { f0: 80, f1: 22, dur: 0.450, gain: 0.85, earlyGain: 0.85, saturated: true },
    vinylScratch: { f0: 1400, f1: 90, modF: 85, modG0: 450, modG1: 40, lp: 1600, gain: 0.38, dur: 0.180 },
    crowdCheer: { formants: [{ f: 450, q: 3.5 }, { f: 1150, q: 4.0 }, { f: 2400, q: 3.0 }], gain: 0.45, dur: 1.080 },
    chord: { notes: [196.00, 233.08, 293.66, 349.23], lp: 1100, maxLp: 1200, q: 1.1, perfectGain: 0.32, goodGain: 0.32, dur: 0.320, always: true }
  }
};
SFX_SYNTH_TABLE.punch = SFX_SYNTH_TABLE['punch-uppercut'];

function _buildFoleyAndSubLayers(engine, recipe, now, voiceBus, voiceNodes, gradeMult, isEarly, detuneMult, filterJitter) {
  const ctx = engine.ctx;
  if (recipe.thud && engine.foleyBuffers.bodyThud) {
    const src = ctx.createBufferSource();
    src.buffer = engine.foleyBuffers.bodyThud;
    const g = ctx.createGain();
    g.gain.setValueAtTime(recipe.thud.gain * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.thud.dur);
    src.connect(g); g.connect(voiceBus);
    src.start(now); src.stop(now + recipe.thud.dur + 0.005);
    voiceNodes.push(src, g);
  }

  if (recipe.subPunch && engine.foleyBuffers.subPunch) {
    const src = ctx.createBufferSource();
    src.buffer = engine.foleyBuffers.subPunch;
    const g = ctx.createGain();
    const baseG = isEarly ? (recipe.subPunch.earlyGain || recipe.subPunch.gain) : recipe.subPunch.gain;
    g.gain.setValueAtTime(baseG * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.subPunch.dur);
    src.connect(g); g.connect(voiceBus);
    src.start(now); src.stop(now + recipe.subPunch.dur + 0.005);
    voiceNodes.push(src, g);
  }

  if (recipe.subDrop) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(recipe.subDrop.f0 * detuneMult, now);
    osc.frequency.exponentialRampToValueAtTime(recipe.subDrop.f1 * detuneMult, now + recipe.subDrop.dur * 0.92);
    const g = ctx.createGain();
    const baseG = isEarly ? (recipe.subDrop.earlyGain || recipe.subDrop.gain) : recipe.subDrop.gain;
    g.gain.setValueAtTime(baseG * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.subDrop.dur);
    if (recipe.subDrop.saturated) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = engine.shaperCurves.softClip;
      shaper.oversample = '2x';
      osc.connect(shaper); shaper.connect(g);
      voiceNodes.push(shaper);
    } else {
      osc.connect(g);
    }
    g.connect(voiceBus);
    osc.start(now); osc.stop(now + recipe.subDrop.dur + 0.005);
    voiceNodes.push(osc, g);
  }

  if (recipe.snap && engine.foleyBuffers.gloveSnap) {
    const src = ctx.createBufferSource();
    src.buffer = engine.foleyBuffers.gloveSnap;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(Math.min(recipe.snap.maxCf, recipe.snap.cf * filterJitter), now);
    bp.Q.value = recipe.snap.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(recipe.snap.gain * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.snap.dur);
    if (recipe.snap.saturated) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = engine.shaperCurves.softClip;
      src.connect(shaper); shaper.connect(bp);
      voiceNodes.push(shaper);
    } else {
      src.connect(bp);
    }
    bp.connect(g); g.connect(voiceBus);
    src.start(now); src.stop(now + recipe.snap.dur + 0.005);
    voiceNodes.push(src, bp, g);
  }

  if (recipe.dualSnap && engine.foleyBuffers.gloveSnap) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(recipe.dualSnap.gain * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.dualSnap.dur);
    g.connect(voiceBus);
    voiceNodes.push(g);
    recipe.dualSnap.cfs.forEach((cf) => {
      const src = ctx.createBufferSource();
      src.buffer = engine.foleyBuffers.gloveSnap;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(2200, cf * filterJitter);
      bp.Q.value = cf === 850 ? 2.0 : 1.8;
      src.connect(bp); bp.connect(g);
      src.start(now); src.stop(now + recipe.dualSnap.dur + 0.005);
      voiceNodes.push(src, bp);
    });
  }

  if (recipe.whoosh && engine.foleyBuffers.clothWhoosh) {
    const src = ctx.createBufferSource();
    src.buffer = engine.foleyBuffers.clothWhoosh;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(recipe.whoosh.f0 * filterJitter, now);
    bp.frequency.exponentialRampToValueAtTime(recipe.whoosh.f1 * filterJitter, now + recipe.whoosh.dur);
    bp.Q.value = recipe.whoosh.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(recipe.whoosh.gain * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.whoosh.dur);
    src.connect(bp); bp.connect(g); g.connect(voiceBus);
    src.start(now); src.stop(now + recipe.whoosh.dur + 0.005);
    voiceNodes.push(src, bp, g);
  }
}

function _buildTonalAndAtmosphericLayers(engine, recipe, now, voiceBus, voiceNodes, gradeMult, isPerfect, isGood, detuneMult, filterJitter) {
  const ctx = engine.ctx;
  if (recipe.air && engine.foleyBuffers.transientAir && (isPerfect || isGood || recipe.air.always)) {
    const src = ctx.createBufferSource();
    src.buffer = engine.foleyBuffers.transientAir;
    const g = ctx.createGain();
    const baseG = isPerfect ? recipe.air.perfectGain : recipe.air.goodGain;
    g.gain.setValueAtTime(baseG * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.air.dur);
    src.connect(g); g.connect(voiceBus);
    src.start(now); src.stop(now + recipe.air.dur + 0.004);
    voiceNodes.push(src, g);
  }

  if (recipe.chord && (isPerfect || isGood || recipe.chord.always)) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(recipe.chord.maxLp, recipe.chord.lp * filterJitter), now);
    lp.Q.value = recipe.chord.q;
    const g = ctx.createGain();
    const baseG = isPerfect ? recipe.chord.perfectGain : recipe.chord.goodGain;
    g.gain.setValueAtTime(baseG * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.chord.dur);
    lp.connect(g); g.connect(voiceBus);
    voiceNodes.push(lp, g);
    recipe.chord.notes.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f * detuneMult, now);
      osc.connect(lp);
      osc.start(now); osc.stop(now + recipe.chord.dur + 0.005);
      voiceNodes.push(osc);
    });
  }

  if (recipe.stinger && (isPerfect || isGood)) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(recipe.stinger.maxLp, recipe.stinger.lp * filterJitter), now);
    lp.Q.value = recipe.stinger.q;
    const g = ctx.createGain();
    const baseG = isPerfect ? recipe.stinger.perfectGain : recipe.stinger.goodGain;
    g.gain.setValueAtTime(baseG * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.stinger.dur);
    lp.connect(g); g.connect(voiceBus);
    voiceNodes.push(lp, g);
    recipe.stinger.notes.forEach((note) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f * detuneMult, now + note.dt);
      osc.connect(lp);
      osc.start(now + note.dt); osc.stop(now + note.dt + 0.160);
      voiceNodes.push(osc);
    });
  }

  if (recipe.chime) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(recipe.chime.maxLp, recipe.chime.lp * filterJitter), now);
    lp.Q.value = recipe.chime.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(recipe.chime.gain * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.chime.dur);
    lp.connect(g); g.connect(voiceBus);
    voiceNodes.push(lp, g);
    recipe.chime.notes.forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * detuneMult, now);
      osc.connect(lp);
      osc.start(now); osc.stop(now + recipe.chime.dur + 0.005);
      voiceNodes.push(osc);
    });
  }

  if (recipe.resTone) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(recipe.resTone.f * detuneMult, now);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = recipe.resTone.f * detuneMult;
    bp.Q.value = recipe.resTone.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(recipe.resTone.gain * gradeMult, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.resTone.dur);
    osc.connect(bp); bp.connect(g); g.connect(voiceBus);
    osc.start(now); osc.stop(now + recipe.resTone.dur + 0.005);
    voiceNodes.push(osc, bp, g);
  }

  if (recipe.tensionDrone) {
    const td = recipe.tensionDrone;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(td.maxLp, td.lp * filterJitter);
    lp.Q.value = td.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(td.gain, now + 0.010);
    g.gain.exponentialRampToValueAtTime(0.0001, now + td.dur);
    lp.connect(g); g.connect(voiceBus);
    voiceNodes.push(lp, g);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(td.f0A * detuneMult, now);
    osc1.frequency.exponentialRampToValueAtTime(td.f1A * detuneMult, now + 0.180);
    osc1.connect(lp); osc1.start(now); osc1.stop(now + td.dur + 0.005);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(td.f0B * detuneMult, now);
    osc2.frequency.exponentialRampToValueAtTime(td.f1B * detuneMult, now + 0.180);
    osc2.connect(lp); osc2.start(now); osc2.stop(now + td.dur + 0.005);
    voiceNodes.push(osc1, osc2);
  }

  if (recipe.vinylScratch) {
    const vs = recipe.vinylScratch;
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const fmLp = ctx.createBiquadFilter();
    fmLp.type = 'lowpass';
    fmLp.frequency.value = Math.min(1800, vs.lp * filterJitter);
    const fmGain = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(vs.f0 * detuneMult, now);
    carrier.frequency.exponentialRampToValueAtTime(vs.f1 * detuneMult, now + 0.140);
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(vs.modF, now);
    modGain.gain.setValueAtTime(vs.modG0, now);
    modGain.gain.exponentialRampToValueAtTime(vs.modG1, now + 0.140);
    modulator.connect(modGain); modGain.connect(carrier.frequency);
    carrier.connect(fmLp); fmLp.connect(fmGain);
    fmGain.gain.setValueAtTime(vs.gain, now);
    fmGain.gain.exponentialRampToValueAtTime(0.0001, now + vs.dur);
    fmGain.connect(voiceBus);
    carrier.start(now); modulator.start(now);
    carrier.stop(now + vs.dur + 0.005); modulator.stop(now + vs.dur + 0.005);
    voiceNodes.push(carrier, modulator, modGain, fmLp, fmGain);
  }

  if (recipe.crowdCheer && engine.noiseBuffers.crowd) {
    const cc = recipe.crowdCheer;
    const cheerGain = ctx.createGain();
    cheerGain.gain.setValueAtTime(0.0001, now);
    cheerGain.gain.linearRampToValueAtTime(cc.gain, now + 0.080);
    cheerGain.gain.setValueAtTime(cc.gain, now + 0.330);
    cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + cc.dur);
    cheerGain.connect(voiceBus);
    voiceNodes.push(cheerGain);
    cc.formants.forEach((fmt) => {
      const src = ctx.createBufferSource();
      src.buffer = engine.noiseBuffers.crowd;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fmt.f;
      bp.Q.value = fmt.q;
      src.connect(bp); bp.connect(cheerGain);
      src.start(now); src.stop(now + cc.dur + 0.02);
      voiceNodes.push(src, bp);
    });
  }
}

export function synthesizeCombatSfxVoice(engine, action, grade = 'PERFECT', spatialSource = null) {
  if (!engine.ctx && !engine.userGestureUnlocked) return;
  engine.initContext();
  if (!engine.ctx) return;
  if (engine.ctx.state === 'suspended') {
    engine.ctx.resume().catch(() => {});
  }

  const recipe = SFX_SYNTH_TABLE[action] || SFX_SYNTH_TABLE['punch-jab'];
  const now = engine.ctx.currentTime;
  const isPerfect = grade === 'PERFECT';
  const isGood = grade === 'GOOD';
  const isEarly = !isPerfect && !isGood;
  const gradeMult = isPerfect ? 1.0 : (isGood ? 0.82 : 0.60);
  const detuneMult = Math.pow(2, ((Math.random() * 2 - 1) * 12) / 1200);
  const filterJitter = 1.0 + (Math.random() * 2 - 1) * 0.06;

  engine._enforcePolyphony(action, engine.MAX_CATEGORY_VOICES ? engine.MAX_CATEGORY_VOICES[action] : null);

  const voiceNodes = [];
  let voiceBus = engine.sfxBus;
  let voicePanner = null;
  if (spatialSource !== null && spatialSource !== undefined && engine.ctx.createStereoPanner) {
    const panVal = typeof spatialSource === 'number'
      ? Math.max(-0.92, Math.min(0.92, spatialSource))
      : engine.calculateSpatialPan(spatialSource);
    const panner = engine.ctx.createStereoPanner();
    panner.pan.value = panVal;
    panner.pan.setValueAtTime(panVal, now);
    panner.connect(engine.sfxBus);
    voiceNodes.push(panner);
    voiceBus = panner;
    voicePanner = panner;
    engine.lastPan = panVal;
    engine.lastPanner = panner;
  }

  const voiceMeta = {
    action, grade, gradeMult, isPerfect, isGood, isEarly,
    startTime: now, priority: recipe.priority || 1,
    nodes: voiceNodes, panner: voicePanner
  };
  engine.lastVoice = voiceMeta;

  _buildFoleyAndSubLayers(engine, recipe, now, voiceBus, voiceNodes, gradeMult, isEarly, detuneMult, filterJitter);
  _buildTonalAndAtmosphericLayers(engine, recipe, now, voiceBus, voiceNodes, gradeMult, isPerfect, isGood, detuneMult, filterJitter);

  if (recipe.concussion) {
    engine.triggerConcussion(recipe.concussion.cutoff, recipe.concussion.dur);
  }
  if (recipe.duck) {
    const db = isPerfect ? recipe.duck.perfect : (isGood ? recipe.duck.good : recipe.duck.early);
    engine.duckMusic(db, recipe.duck.dur);
  }

  engine.registerVoiceCleanup(voiceNodes, recipe.dur, voiceMeta);
}

export function synthesizeCrowdHypeSwell(engine, type = 'combo-4', options = {}, gameStateRef = null) {
  if (!engine.ctx && !engine.userGestureUnlocked) return false;
  engine.initContext();
  if (!engine.ctx) return false;
  if (engine.ctx.state === 'suspended') {
    engine.ctx.resume().catch(() => {});
  }

  const now = engine.ctx.currentTime;
  if (!options.force && engine._lastCrowdTime && (now - engine._lastCrowdTime < 0.16)) return false;
  engine._lastCrowdTime = now;

  engine._enforcePolyphony('crowd-swell', engine.MAX_CATEGORY_VOICES['crowd-swell'] || 2);

  const comboNum = options.combo || (type === 'combo-4' ? 4 : (type === 'combo-8' ? 8 : (type === 'combo-12' ? 12 : 0)));
  let dur = 0.65, peakGain = 0.22, duckAmount = -1.8;
  let formants = [{ f: 380, q: 4.0 }, { f: 620, q: 4.5 }, { f: 1050, q: 5.0 }];

  if (type === 'counter-weave') {
    dur = 0.55; peakGain = 0.34; duckAmount = -3.5;
    formants = [{ f: 580, q: 3.5 }, { f: 1350, q: 4.0 }, { f: 2200, q: 2.8 }];
  } else if (type === 'wave-clear') {
    dur = 1.95; peakGain = 0.42; duckAmount = -4.5;
    formants = [{ f: 420, q: 3.0 }, { f: 1050, q: 3.5 }, { f: 2300, q: 2.5 }];
  } else if (type === 'combo-12' || comboNum >= 12) {
    dur = 1.30; peakGain = 0.38; duckAmount = -3.5;
    formants = [{ f: 450, q: 3.2 }, { f: 1100, q: 3.8 }, { f: 2400, q: 3.0 }];
  } else if (type === 'combo-8' || comboNum >= 8) {
    dur = 0.98; peakGain = 0.30; duckAmount = -2.5;
    formants = [{ f: 500, q: 3.0 }, { f: 950, q: 3.2 }, { f: 1350, q: 3.5 }];
  }

  const voiceNodes = [];
  const cheerGain = engine.ctx.createGain();
  cheerGain.gain.setValueAtTime(0.0001, now);
  cheerGain.gain.linearRampToValueAtTime(peakGain, now + dur * 0.12);
  cheerGain.gain.setValueAtTime(peakGain, now + dur * 0.38);
  cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  cheerGain.connect(engine.sfxBus);
  voiceNodes.push(cheerGain);

  const crowdBuf = (engine.noiseBuffers && engine.noiseBuffers.crowd) || (engine.foleyBuffers && engine.foleyBuffers.clothWhoosh);
  if (crowdBuf) {
    formants.forEach((fmt) => {
      const src = engine.ctx.createBufferSource();
      src.buffer = crowdBuf;
      src.loop = true;
      const bp = engine.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(fmt.f, now);
      bp.frequency.linearRampToValueAtTime(fmt.f * 1.08, now + dur * 0.45);
      bp.Q.value = fmt.q;
      src.connect(bp);
      bp.connect(cheerGain);
      src.start(now);
      src.stop(now + dur + 0.02);
      voiceNodes.push(src, bp);
    });
  }

  const chordGain = engine.ctx.createGain();
  const chordPeak = type === 'wave-clear' ? 0.09 : (comboNum >= 8 || type === 'counter-weave' ? 0.06 : 0.035);
  chordGain.gain.setValueAtTime(0.0001, now);
  chordGain.gain.linearRampToValueAtTime(chordPeak, now + 0.04);
  chordGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.72);

  const chordFilter = engine.ctx.createBiquadFilter();
  chordFilter.type = 'lowpass';
  chordFilter.frequency.setValueAtTime(850, now);
  chordFilter.Q.value = 1.8;
  chordGain.connect(chordFilter);
  chordFilter.connect(engine.sfxBus);
  voiceNodes.push(chordGain, chordFilter);

  const gmChord = [196.00, 233.08, 293.66, 392.00];
  gmChord.forEach((freq) => {
    const osc = engine.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(chordGain);
    osc.start(now);
    osc.stop(now + dur * 0.72);
    voiceNodes.push(osc);
  });

  engine.duckMusic(duckAmount, Math.min(0.45, dur * 0.4));
  const voiceMeta = {
    action: 'crowd-swell',
    startTime: now,
    priority: 6,
    nodes: voiceNodes,
    chordFilter,
    chordGain,
    gmChord
  };
  engine.lastCrowdHype = voiceMeta;
  engine.registerVoiceCleanup(voiceNodes, dur + 0.05, voiceMeta);

  if (gameStateRef) {
    gameStateRef.crowdHypeTimer = Math.max(gameStateRef.crowdHypeTimer || 0, dur);
  }
  return { ok: true, dur };
}

export function scheduleBossTelegraphSfx(engine, pattern = 'bass_drop', beatSec = 0.5825, windupDur = 0.5825, spatialSource = null) {
  const ctx = engine && engine.ctx;
  const now = ctx ? ctx.currentTime : 0;
  const offsets = pattern === 'scratch_combo'
    ? [0, beatSec, beatSec * 2.0]
    : [0, windupDur];

  const cueRecord = {
    pattern,
    scheduledOnAudioClock: true,
    usedSetTimeout: false,
    ctxCurrentTime: now,
    scheduledTimes: offsets.map((o) => Number((now + o).toFixed(4))),
    colorHex: pattern === 'scratch_combo' ? '#00e5ff' : '#ff1e38'
  };
  if (engine) {
    engine.lastScheduledBossCue = cueRecord;
  }

  if (!ctx && (!engine || !engine.userGestureUnlocked)) {
    return cueRecord;
  }
  engine.initContext();
  if (!engine.ctx) return cueRecord;
  if (engine.ctx.state === 'suspended') {
    engine.ctx.resume().catch(() => {});
  }

  const t0 = engine.ctx.currentTime;
  const voiceNodes = [];
  let voiceBus = engine.sfxBus;
  if (spatialSource !== null && spatialSource !== undefined && engine.ctx.createStereoPanner) {
    const panVal = typeof spatialSource === 'number'
      ? Math.max(-0.92, Math.min(0.92, spatialSource))
      : engine.calculateSpatialPan(spatialSource);
    const panner = engine.ctx.createStereoPanner();
    panner.pan.setValueAtTime(panVal, t0);
    panner.connect(engine.sfxBus);
    voiceNodes.push(panner);
    voiceBus = panner;
  }

  if (pattern === 'scratch_combo') {
    // Schedule 3 consecutive beat-grid vinyl scratch cues on AudioContext clock (t0, t0 + beatSec, t0 + 2*beatSec)
    for (let step = 0; step < 3; step++) {
      const stepStart = t0 + step * beatSec;
      const stepDur = Math.min(0.22, beatSec * 0.45);
      const isCounterBeat = step === 2;

      const carrier = engine.ctx.createOscillator();
      const mod = engine.ctx.createOscillator();
      const modGain = engine.ctx.createGain();
      const bp = engine.ctx.createBiquadFilter();
      const g = engine.ctx.createGain();

      carrier.type = isCounterBeat ? 'triangle' : 'sawtooth';
      const fStart = isCounterBeat ? 520 : (340 + step * 70);
      const fPeak = isCounterBeat ? 1180 : (780 + step * 140);
      carrier.frequency.setValueAtTime(fStart, stepStart);
      carrier.frequency.exponentialRampToValueAtTime(fPeak, stepStart + stepDur * 0.55);
      carrier.frequency.exponentialRampToValueAtTime(fStart * 0.65, stepStart + stepDur);

      mod.type = 'sine';
      mod.frequency.setValueAtTime(isCounterBeat ? 96 : 68, stepStart);
      modGain.gain.setValueAtTime(isCounterBeat ? 340 : 220, stepStart);
      modGain.gain.exponentialRampToValueAtTime(20, stepStart + stepDur);

      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isCounterBeat ? 1450 : 1050, stepStart);
      bp.Q.value = 2.2;

      g.gain.setValueAtTime(0.0001, stepStart);
      g.gain.linearRampToValueAtTime(isCounterBeat ? 0.36 : 0.26, stepStart + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, stepStart + stepDur);

      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(bp);
      bp.connect(g);
      g.connect(voiceBus);

      carrier.start(stepStart);
      mod.start(stepStart);
      carrier.stop(stepStart + stepDur + 0.01);
      mod.stop(stepStart + stepDur + 0.01);
      voiceNodes.push(carrier, mod, modGain, bp, g);
    }

    const totalDur = beatSec * 2.0 + 0.28;
    const voiceMeta = {
      action: 'boss-scratch-combo',
      startTime: t0,
      priority: 8,
      nodes: voiceNodes
    };
    engine.registerVoiceCleanup(voiceNodes, totalDur, voiceMeta);
  } else {
    // Bass Drop: Schedule sub-bass riser from t0 -> t0 + windupDur and downbeat sub-impact at t0 + windupDur on AudioContext clock
    const riserDur = Math.max(0.18, windupDur);
    const dropStart = t0 + riserDur;
    const dropDur = 0.42;

    const riserOsc = engine.ctx.createOscillator();
    const riserGain = engine.ctx.createGain();
    riserOsc.type = 'sawtooth';
    riserOsc.frequency.setValueAtTime(55.0, t0);
    riserOsc.frequency.exponentialRampToValueAtTime(165.0, dropStart);

    const riserLp = engine.ctx.createBiquadFilter();
    riserLp.type = 'lowpass';
    riserLp.frequency.setValueAtTime(220, t0);
    riserLp.frequency.exponentialRampToValueAtTime(980, dropStart);
    riserLp.Q.value = 3.0;

    riserGain.gain.setValueAtTime(0.0001, t0);
    riserGain.gain.linearRampToValueAtTime(0.30, dropStart - 0.02);
    riserGain.gain.exponentialRampToValueAtTime(0.0001, dropStart + 0.02);

    riserOsc.connect(riserLp);
    riserLp.connect(riserGain);
    riserGain.connect(voiceBus);
    riserOsc.start(t0);
    riserOsc.stop(dropStart + 0.025);

    const subOsc = engine.ctx.createOscillator();
    const subGain = engine.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(118.0, dropStart);
    subOsc.frequency.exponentialRampToValueAtTime(27.5, dropStart + dropDur);
    subGain.gain.setValueAtTime(0.0001, dropStart);
    subGain.gain.linearRampToValueAtTime(0.68, dropStart + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.0001, dropStart + dropDur);

    subOsc.connect(subGain);
    subGain.connect(voiceBus);
    subOsc.start(dropStart);
    subOsc.stop(dropStart + dropDur + 0.02);

    voiceNodes.push(riserOsc, riserLp, riserGain, subOsc, subGain);
    const voiceMeta = {
      action: 'boss-bass-drop',
      startTime: t0,
      priority: 8,
      nodes: voiceNodes
    };
    engine.registerVoiceCleanup(voiceNodes, riserDur + dropDur + 0.05, voiceMeta);
  }

  return cueRecord;
}

