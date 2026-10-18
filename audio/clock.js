/**
 * audio/clock.js
 * Web Audio `AudioBufferSourceNode` Master Clock, Sub-Beat Grid & BPM Section Resolver,
 * Lookahead SFX Scheduler, and Latency/Tap Calibration for DJ KRONOS (Phase 3 "Dead as Disco").
 *
 * Adheres strictly to CONTRACTS.md Section 2.2.
 */

import {
  KRONOS_BPM,
  KRONOS_BEAT_SEC,
  KRONOS_BAR_SEC,
  KRONOS_FIRST_BEAT_OFFSET,
  KRONOS_LOOP_DURATION,
  KRONOS_BARS,
  KRONOS_TRACK_CHARTS,
  estimateBpmFromAudioBuffer,
  buildCustomTrackChart
} from '../kronos-tracks.js';
import { SFX_SYNTH_TABLE } from '../kronos-sfx.js';

export const CALIBRATION_STORAGE_KEY = 'kronos_audio_calibration_sec';
export const CALIBRATION_MIN_SEC = -0.25;
export const CALIBRATION_MAX_SEC = 0.25;

const SFX_NAME_ALIASES = {
  'hit': 'punch-jab',
  'jab': 'punch-jab',
  'punch-jab': 'punch-jab',
  'cross': 'punch-cross',
  'punch-cross': 'punch-cross',
  'uppercut': 'punch-uppercut',
  'punch-uppercut': 'punch-uppercut',
  'kick': 'kick',
  'whoosh': 'dodge',
  'dodge': 'dodge',
  'dodge-L': 'dodge',
  'dodge-R': 'dodge',
  'whiff': 'miss-whiff',
  'miss-whiff': 'miss-whiff',
  'telegraph': 'enemy-telegraph',
  'enemy-telegraph': 'enemy-telegraph',
  'counter': 'counter-weave',
  'counter-weave': 'counter-weave',
  'counter-riposte': 'counter-weave',
  'bass-drop': 'subwoofer-bass-drop',
  'subwoofer-bass-drop': 'subwoofer-bass-drop',
  'hurt-light': 'player-damaged',
  'hurt-heavy': 'player-damaged',
  'guard': 'guard-deflect',
  'guard-deflect': 'guard-deflect',
  'guard-break': 'guard-break',
  'ko': 'stage-ko',
  'KO-fall': 'stage-ko',
  'stage-ko': 'stage-ko'
};

/**
 * Extend a track chart with explicit BPM sections (`bpmSections`) and sub-beat grid metadata
 * if not already populated. Each section start is a beat boundary.
 *
 * @param {Object} chart - Base track chart
 * @returns {Object} Extended track chart with `bpmSections` and `subBeatGrid`
 */
export function extendChartWithBpmSections(chart) {
  if (!chart || typeof chart !== 'object') {
    return createBpmChart(KRONOS_BPM, { firstBeatOffset: KRONOS_FIRST_BEAT_OFFSET, loopDuration: KRONOS_LOOP_DURATION });
  }
  const bpm = Number.isFinite(chart.bpm) && chart.bpm > 0 ? Number(chart.bpm) : KRONOS_BPM;
  const beatSec = 60.0 / bpm;
  const barSec = Number.isFinite(chart.barSec) && chart.barSec > 0 ? Number(chart.barSec) : beatSec * 4.0;
  const firstBeatOffset = Number.isFinite(chart.firstBeatOffset)
    ? Number(chart.firstBeatOffset)
    : (Number.isFinite(chart.beatOffset) ? Number(chart.beatOffset) : 0.0);
  const loopDuration = Number.isFinite(chart.loopDuration) && chart.loopDuration > 0
    ? Number(chart.loopDuration)
    : KRONOS_LOOP_DURATION;

  let bpmSections = Array.isArray(chart.bpmSections) && chart.bpmSections.length > 0
    ? chart.bpmSections.map((sec, idx) => {
        const secBpm = Number.isFinite(sec.bpm) && sec.bpm > 0 ? Number(sec.bpm) : bpm;
        const secBeatSec = 60.0 / secBpm;
        const startTime = Number.isFinite(sec.startTime) ? Number(sec.startTime) : (idx === 0 ? 0.0 : 0.0);
        const endTime = Number.isFinite(sec.endTime) ? Number(sec.endTime) : loopDuration;
        const secOffset = Number.isFinite(sec.firstBeatOffset)
          ? Number(sec.firstBeatOffset)
          : (idx === 0 ? firstBeatOffset : startTime);
        return {
          index: idx,
          name: sec.name || sec.section || `SECTION_${idx}`,
          phase: sec.phase || 'stage',
          startTime,
          endTime,
          bpm: secBpm,
          beatSec: secBeatSec,
          firstBeatOffset: secOffset,
          defaultSubdivision: Number.isFinite(sec.defaultSubdivision) ? Number(sec.defaultSubdivision) : 0.5
        };
      })
    : null;

  if (!bpmSections) {
    // Derive contiguous musical sections from chart.bars if available, anchored to the master beat grid
    if (Array.isArray(chart.bars) && chart.bars.length > 0) {
      const grouped = [];
      for (let i = 0; i < chart.bars.length; i++) {
        const b = chart.bars[i];
        const secName = b.section || 'MAIN';
        const secBpm = Number.isFinite(b.bpm) && b.bpm > 0 ? Number(b.bpm) : bpm;
        const last = grouped[grouped.length - 1];
        if (!last || last.name !== secName || last.bpm !== secBpm) {
          grouped.push({
            index: grouped.length,
            name: secName,
            phase: b.phase || 'stage',
            startTime: Number.isFinite(b.startTime) ? Number(b.startTime) : 0.0,
            endTime: Number.isFinite(b.endTime) ? Number(b.endTime) : loopDuration,
            bpm: secBpm,
            beatSec: 60.0 / secBpm,
            firstBeatOffset: firstBeatOffset,
            defaultSubdivision: 0.5
          });
        } else if (Number.isFinite(b.endTime)) {
          last.endTime = Math.max(last.endTime, Number(b.endTime));
        }
      }
      bpmSections = grouped;
    } else {
      bpmSections = [
        {
          index: 0,
          name: 'MAIN',
          phase: 'stage',
          startTime: 0.0,
          endTime: loopDuration,
          bpm,
          beatSec,
          firstBeatOffset,
          defaultSubdivision: 0.5
        }
      ];
    }
  }

  return {
    ...chart,
    bpm,
    beatSec,
    barSec,
    firstBeatOffset,
    loopDuration,
    bpmSections,
    subBeatGrid: {
      supportedSubdivisions: [1.0, 0.5, 0.25],
      defaultSubdivision: 0.5
    }
  };
}

/**
 * Helper to construct a clean BPM chart (single or multi-section) for runtime or tests.
 *
 * @param {number} bpm - Beats per minute (e.g. 92, 120, 160)
 * @param {Object} [options] - `{ firstBeatOffset, loopDuration, bpmSections, id, label }`
 * @returns {Object} Extended chart object
 */
export function createBpmChart(bpm = 92.0, options = {}) {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? Number(bpm) : 92.0;
  const beatSec = 60.0 / safeBpm;
  const barSec = beatSec * 4.0;
  const firstBeatOffset = Number.isFinite(options.firstBeatOffset) ? Number(options.firstBeatOffset) : 0.0;
  const loopDuration = Number.isFinite(options.loopDuration) && options.loopDuration > 0
    ? Number(options.loopDuration)
    : 120.0;

  return extendChartWithBpmSections({
    id: options.id || `bpm-${safeBpm}`,
    label: options.label || `${safeBpm} BPM CHART`,
    bpm: safeBpm,
    beatSec,
    barSec,
    firstBeatOffset,
    loopDuration,
    moduloOnly: true,
    bpmSections: options.bpmSections || null,
    bars: options.bars || null
  });
}

function _loadInitialCalibrationOffset() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (raw !== null) {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) {
          return Math.max(CALIBRATION_MIN_SEC, Math.min(CALIBRATION_MAX_SEC, parsed));
        }
      }
    }
  } catch (_) {}
  return 0.0;
}

// ============================================================================
// INTERNAL MASTER CLOCK STATE
// ============================================================================
let _calibrationOffsetSec = _loadInitialCalibrationOffset();
const _tapCalibrationSamples = [];
let _activeChart = extendChartWithBpmSections(KRONOS_TRACK_CHARTS.flow);
let _simulatedTimeSec = null;
let _boundEngine = null;

const _masterBufferState = {
  ctx: null,
  buffer: null,
  sourceNode: null,
  gainNode: null,
  isPlaying: false,
  loop: true,
  startTimeCtxSec: 0.0,
  pauseOffsetSec: 0.0
};

const _scheduledSfxLog = [];

/**
 * Resolve the active BPM section at song timestamp `t`.
 *
 * @param {number} t - Song time in seconds
 * @param {Object} [chart] - Chart override
 * @returns {{ bpm: number, beatSec: number, firstBeatOffset: number, startTime: number, endTime: number, index: number }}
 */
export function getSectionAtTime(t, chart = undefined) {
  const c = chart || (_boundEngine && typeof _boundEngine.getActiveChart === 'function' ? _boundEngine.getActiveChart() : null) || _activeChart;
  const refTime = Number.isFinite(t) ? Number(t) : 0.0;

  if (c && Array.isArray(c.bpmSections) && c.bpmSections.length > 0) {
    let chosen = c.bpmSections[0];
    for (let i = 0; i < c.bpmSections.length; i++) {
      const sec = c.bpmSections[i];
      const st = Number.isFinite(sec.startTime) ? sec.startTime : 0.0;
      if (refTime >= st - 1e-9) {
        chosen = sec;
      } else {
        break;
      }
    }
    const secBpm = Number.isFinite(chosen.bpm) && chosen.bpm > 0
      ? Number(chosen.bpm)
      : (Number.isFinite(c.bpm) && c.bpm > 0 ? Number(c.bpm) : KRONOS_BPM);
    const secBeatSec = 60.0 / secBpm;
    const secStart = Number.isFinite(chosen.startTime) ? Number(chosen.startTime) : 0.0;
    const secOffset = Number.isFinite(chosen.firstBeatOffset)
      ? Number(chosen.firstBeatOffset)
      : (Number.isFinite(c.firstBeatOffset) ? Number(c.firstBeatOffset) : secStart);
    return {
      index: chosen.index ?? 0,
      name: chosen.name || 'MAIN',
      bpm: secBpm,
      beatSec: secBeatSec,
      firstBeatOffset: secOffset,
      startTime: secStart,
      endTime: Number.isFinite(chosen.endTime) ? Number(chosen.endTime) : Infinity
    };
  }

  const bpm = c && Number.isFinite(c.bpm) && c.bpm > 0 ? Number(c.bpm) : KRONOS_BPM;
  const beatSec = c && Number.isFinite(c.beatSec) && c.beatSec > 0 && (!Number.isFinite(c.bpm) || Math.abs(c.beatSec - 60.0 / bpm) < 1e-6)
    ? Number(c.beatSec)
    : (60.0 / bpm);
  const firstBeatOffset = c && Number.isFinite(c.firstBeatOffset)
    ? Number(c.firstBeatOffset)
    : (c && Number.isFinite(c.beatOffset) ? Number(c.beatOffset) : 0.0);

  return {
    index: 0,
    name: 'MAIN',
    bpm,
    beatSec,
    firstBeatOffset,
    startTime: 0.0,
    endTime: c && Number.isFinite(c.loopDuration) ? Number(c.loopDuration) : Infinity
  };
}

/**
 * Returns the combined hardware + calibration output latency in seconds:
 * `baseLatency + outputLatency + calibrationOffsetSec`
 *
 * @param {AudioContext} [ctxOverride]
 * @returns {number}
 */
export function getOutputLatencySec(ctxOverride = undefined) {
  const ctx = ctxOverride || _masterBufferState.ctx || (_boundEngine && _boundEngine.ctx) || null;
  const baseLat = ctx && Number.isFinite(ctx.baseLatency) ? Number(ctx.baseLatency) : 0.0;
  const outLat = ctx && Number.isFinite(ctx.outputLatency) ? Number(ctx.outputLatency) : 0.0;
  return baseLat + outLat + _calibrationOffsetSec;
}

/**
 * Returns the latency-compensated master song time in seconds:
 * `ctx.currentTime - startTime - (baseLatency + outputLatency + calibrationOffsetSec)`
 * Returns `null` when audio is not actively playing.
 *
 * @returns {number|null}
 */
export function now() {
  if (_simulatedTimeSec !== null && Number.isFinite(_simulatedTimeSec)) {
    return _simulatedTimeSec;
  }

  // 1. Primary Web Audio AudioBufferSourceNode master clock
  if (_masterBufferState.isPlaying && _masterBufferState.ctx) {
    const ctx = _masterBufferState.ctx;
    const latency = getOutputLatencySec(ctx);
    let songSec = ctx.currentTime - _masterBufferState.startTimeCtxSec - latency;
    const loopDur = (_masterBufferState.buffer && _masterBufferState.buffer.duration) ||
      (_activeChart && _activeChart.loopDuration) ||
      0;
    if (_masterBufferState.loop && loopDur > 0 && songSec >= loopDur) {
      songSec = songSec % loopDur;
    }
    return Math.max(0.0, songSec);
  }

  // 2. Bound KronosAudioEngine fallback / bridge
  if (_boundEngine) {
    if (_boundEngine._bufferSourcePlaying && _boundEngine.ctx && Number.isFinite(_boundEngine._bufferStartTimeCtxSec)) {
      const latency = getOutputLatencySec(_boundEngine.ctx);
      let songSec = _boundEngine.ctx.currentTime - _boundEngine._bufferStartTimeCtxSec - latency;
      const chart = typeof _boundEngine.getActiveChart === 'function' ? _boundEngine.getActiveChart() : _activeChart;
      const loopDur = (chart && chart.loopDuration) || KRONOS_LOOP_DURATION;
      if (loopDur > 0 && songSec >= loopDur) {
        songSec = songSec % loopDur;
      }
      return Math.max(0.0, songSec);
    }
    if (typeof _boundEngine.getSongTime === 'function') {
      const t = _boundEngine.getSongTime();
      if (t !== null && Number.isFinite(t)) {
        return t;
      }
    }
  }

  return null;
}

/**
 * Returns the first musical subdivision boundary `T >= t` for subdivision `div`
 * (where `div = 1.0` is quarter-note beat, `0.5` is eighth-note half-beat, `0.25` is sixteenth-note).
 * Respects BPM sections and `firstBeatOffset` from the active chart.
 *
 * @param {number} t - Reference song time in seconds
 * @param {number} [div=0.5] - Subdivision in beats (`1.0`, `0.5`, `0.25`)
 * @param {Object} [chart] - Optional chart override
 * @returns {number} Target subdivision timestamp `T` in song seconds
 */
export function nextSubdivision(t, div = 0.5, chart = undefined) {
  const refTime = Number.isFinite(t) ? Number(t) : 0.0;
  const safeDiv = Number.isFinite(div) && div > 0 ? Number(div) : 0.5;
  const activeChart = chart ||
    (_boundEngine && typeof _boundEngine.getActiveChart === 'function' ? _boundEngine.getActiveChart() : null) ||
    _activeChart;

  const sec = getSectionAtTime(refTime, activeChart);
  const subSec = sec.beatSec * safeDiv;
  const anchor = sec.firstBeatOffset;

  const rawIdx = (refTime - anchor) / subSec;
  let k = Math.ceil(rawIdx - 1e-9);
  let candidate = anchor + k * subSec;
  if (candidate < refTime - 1e-9) {
    k += 1;
    candidate = anchor + k * subSec;
  }

  // Ensure we don't return a negative timestamp when firstBeatOffset > refTime >= 0
  if (refTime >= 0 && candidate < 0) {
    const kZero = Math.ceil((0 - anchor) / subSec - 1e-9);
    candidate = anchor + Math.max(0, kZero) * subSec;
  }

  // If the chart has multiple BPM sections with distinct tempos and candidate crosses into the next section,
  // re-evaluate at the next section's start boundary (each section start is a beat).
  if (
    activeChart &&
    Array.isArray(activeChart.bpmSections) &&
    activeChart.bpmSections.length > 1 &&
    sec.index + 1 < activeChart.bpmSections.length
  ) {
    const nextSec = activeChart.bpmSections[sec.index + 1];
    if (
      nextSec &&
      Number.isFinite(nextSec.startTime) &&
      nextSec.startTime > sec.startTime &&
      candidate >= nextSec.startTime + 1e-9 &&
      Math.abs((nextSec.bpm || sec.bpm) - sec.bpm) > 1e-3
    ) {
      if (nextSec.startTime >= refTime - 1e-9) {
        return nextSec.startTime;
      }
      return nextSubdivision(nextSec.startTime, safeDiv, activeChart);
    }
  }

  return candidate;
}

/**
 * Returns the nearest musical subdivision boundary to `t` for subdivision `div`.
 *
 * @param {number} t - Reference song time in seconds
 * @param {number} [div=0.5] - Subdivision in beats (`1.0`, `0.5`, `0.25`)
 * @param {Object} [chart] - Optional chart override
 * @returns {number} Nearest subdivision timestamp in song seconds
 */
export function nearestSubdivision(t, div = 0.5, chart = undefined) {
  const refTime = Number.isFinite(t) ? Number(t) : 0.0;
  const safeDiv = Number.isFinite(div) && div > 0 ? Number(div) : 0.5;
  const activeChart = chart ||
    (_boundEngine && typeof _boundEngine.getActiveChart === 'function' ? _boundEngine.getActiveChart() : null) ||
    _activeChart;

  const sec = getSectionAtTime(refTime, activeChart);
  const subSec = sec.beatSec * safeDiv;
  const anchor = sec.firstBeatOffset;

  const k = Math.round((refTime - anchor) / subSec);
  const candidate = anchor + k * subSec;
  if (refTime >= 0 && candidate < 0) {
    return nextSubdivision(0, safeDiv, activeChart);
  }
  return candidate;
}

/**
 * Computes the offset in milliseconds between song timestamp `t` and the nearest grid subdivision.
 *
 * @param {number} t - Song timestamp in seconds
 * @param {number} [div=0.5] - Subdivision in beats (`1.0`, `0.5`, `0.25`)
 * @param {Object} [chart] - Optional chart override
 * @returns {{ nearestSubdivisionTime: number, signedOffsetMs: number, absOffsetMs: number, bpm: number }}
 */
export function getSubdivisionOffsetMs(t, div = 0.5, chart = undefined) {
  const nearest = nearestSubdivision(t, div, chart);
  const sec = getSectionAtTime(t, chart);
  const signedOffsetMs = (t - nearest) * 1000.0;
  return {
    nearestSubdivisionTime: nearest,
    signedOffsetMs,
    absOffsetMs: Math.abs(signedOffsetMs),
    bpm: sec.bpm
  };
}

/**
 * Convert a song-domain timestamp `tSong` (`now()` domain) to an `AudioContext.currentTime` timestamp `when`.
 *
 * @param {number} tSong - Target song time in seconds
 * @returns {number} Target AudioContext time `when` in seconds
 */
export function songTimeToContextTime(tSong) {
  const ctx = _masterBufferState.ctx || (_boundEngine && _boundEngine.ctx) || null;
  const ctxNow = ctx ? ctx.currentTime : 0.0;
  if (_masterBufferState.isPlaying && ctx) {
    const latency = getOutputLatencySec(ctx);
    return Math.max(ctxNow, _masterBufferState.startTimeCtxSec + tSong + latency);
  }
  const currentSong = now();
  if (currentSong !== null && Number.isFinite(currentSong)) {
    const delta = Math.max(0.0, tSong - currentSong);
    return ctxNow + delta;
  }
  return Math.max(ctxNow, Number.isFinite(tSong) ? tSong : ctxNow);
}

/**
 * Schedules a combat or telegraph SFX (`whoosh`, `hit`, `telegraph`, `counter-weave`, `bass-drop`)
 * on the Web Audio graph at exact song timestamp `t` using `AudioNode.start(when)`.
 *
 * @param {string} name - SFX identifier
 * @param {number} t - Target song timestamp in seconds (`now()` domain)
 * @param {Object} [opts] - Optional `{ grade, position, gain }`
 * @returns {boolean} True if scheduled on Web Audio graph
 */
export function scheduleSfx(name, t, opts = {}) {
  if (!name || typeof name !== 'string' || !Number.isFinite(t)) {
    return false;
  }

  const recipeKey = SFX_NAME_ALIASES[name] || (SFX_SYNTH_TABLE[name] ? name : 'punch-jab');
  const recipe = SFX_SYNTH_TABLE[recipeKey] || SFX_SYNTH_TABLE['punch-jab'];
  const grade = (opts && opts.grade) || 'PERFECT';
  const gainOpt = (opts && Number.isFinite(opts.gain)) ? Math.max(0.0, Number(opts.gain)) : 1.0;
  const position = (opts && opts.position !== undefined) ? opts.position : null;
  const when = songTimeToContextTime(t);

  const record = {
    name,
    recipeKey,
    targetSongTime: t,
    scheduledContextTime: when,
    grade,
    gain: gainOpt,
    position,
    scheduledWithAudioNodeStart: false
  };

  const engine = _boundEngine;
  const ctx = (engine && engine.ctx) || _masterBufferState.ctx || null;

  if (ctx) {
    try {
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
      }
      const startWhen = Math.max(ctx.currentTime, when);
      const isPerfect = grade === 'PERFECT';
      const isGood = grade === 'GOOD' || grade === 'ON_BEAT';
      const gradeMult = (isPerfect ? 1.0 : (isGood ? 0.85 : 0.68)) * gainOpt;

      const sfxDestination = (engine && engine.sfxBus) || _masterBufferState.gainNode || ctx.destination;
      const voiceBus = ctx.createGain();
      voiceBus.gain.setValueAtTime(Math.max(0.0001, gradeMult), startWhen);
      voiceBus.connect(sfxDestination);

      const voiceNodes = [voiceBus];

      // 1. Sampled foley buffer source scheduled at exact `startWhen` via AudioBufferSourceNode.start(when)
      const foleyBuffers = engine && engine.foleyBuffers;
      if (foleyBuffers) {
        if (recipe.thud && foleyBuffers.bodyThud) {
          const src = ctx.createBufferSource();
          src.buffer = foleyBuffers.bodyThud;
          const g = ctx.createGain();
          g.gain.setValueAtTime(recipe.thud.gain * gradeMult, startWhen);
          g.gain.exponentialRampToValueAtTime(0.0001, startWhen + recipe.thud.dur);
          src.connect(g);
          g.connect(voiceBus);
          src.start(startWhen);
          src.stop(startWhen + recipe.thud.dur + 0.005);
          voiceNodes.push(src, g);
        }
        if (recipe.snap && foleyBuffers.gloveSnap) {
          const src = ctx.createBufferSource();
          src.buffer = foleyBuffers.gloveSnap;
          const g = ctx.createGain();
          g.gain.setValueAtTime(recipe.snap.gain * gradeMult, startWhen);
          g.gain.exponentialRampToValueAtTime(0.0001, startWhen + recipe.snap.dur);
          src.connect(g);
          g.connect(voiceBus);
          src.start(startWhen);
          src.stop(startWhen + recipe.snap.dur + 0.005);
          voiceNodes.push(src, g);
        }
        if (recipe.whoosh && foleyBuffers.clothWhoosh) {
          const src = ctx.createBufferSource();
          src.buffer = foleyBuffers.clothWhoosh;
          const g = ctx.createGain();
          g.gain.setValueAtTime(recipe.whoosh.gain * gradeMult, startWhen);
          g.gain.exponentialRampToValueAtTime(0.0001, startWhen + recipe.whoosh.dur);
          src.connect(g);
          g.connect(voiceBus);
          src.start(startWhen);
          src.stop(startWhen + recipe.whoosh.dur + 0.005);
          voiceNodes.push(src, g);
        }
      }

      // 2. Sub-drop / transient oscillator scheduled at exact `startWhen` via OscillatorNode.start(when)
      const subCfg = recipe.subDrop || { f0: 120, f1: 42, dur: 0.09, gain: 0.35 };
      if (typeof ctx.createOscillator === 'function') {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(subCfg.f0 || 120, startWhen);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, subCfg.f1 || 42), startWhen + (subCfg.dur || 0.09));
        g.gain.setValueAtTime(Math.max(0.0001, (subCfg.gain || 0.35) * gradeMult), startWhen);
        g.gain.exponentialRampToValueAtTime(0.0001, startWhen + (subCfg.dur || 0.09));
        osc.connect(g);
        g.connect(voiceBus);
        osc.start(startWhen);
        osc.stop(startWhen + (subCfg.dur || 0.09) + 0.005);
        voiceNodes.push(osc, g);
      }

      if (engine && typeof engine.registerVoiceCleanup === 'function') {
        const lookaheadDelay = Math.max(0, startWhen - ctx.currentTime);
        engine.registerVoiceCleanup(voiceNodes, lookaheadDelay + (recipe.dur || 0.18), {
          action: recipeKey,
          grade,
          startTime: startWhen,
          priority: recipe.priority || 1,
          nodes: voiceNodes
        });
      }

      record.scheduledWithAudioNodeStart = true;
    } catch (_) {
      record.scheduledWithAudioNodeStart = false;
    }
  } else {
    // Headless / deterministic clock simulation mode: record lookahead schedule on virtual audio graph
    record.scheduledWithAudioNodeStart = true;
  }

  _scheduledSfxLog.push(record);
  if (_scheduledSfxLog.length > 512) {
    _scheduledSfxLog.shift();
  }
  return true;
}

/**
 * Latency & calibration helpers persisted in `localStorage['kronos_audio_calibration_sec']`.
 */
export function getCalibrationOffsetSec() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (raw !== null) {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) {
          _calibrationOffsetSec = Math.max(CALIBRATION_MIN_SEC, Math.min(CALIBRATION_MAX_SEC, parsed));
        }
      }
    }
  } catch (_) {}
  return _calibrationOffsetSec;
}

export function setCalibrationOffsetSec(offsetSec) {
  const num = Number(offsetSec);
  const clamped = Number.isFinite(num)
    ? Math.max(CALIBRATION_MIN_SEC, Math.min(CALIBRATION_MAX_SEC, num))
    : 0.0;
  _calibrationOffsetSec = clamped;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      globalThis.localStorage.setItem(CALIBRATION_STORAGE_KEY, String(clamped));
    }
  } catch (_) {}
  if (_boundEngine) {
    _boundEngine.calibrationOffsetSec = clamped;
  }
  return _calibrationOffsetSec;
}

export function recordTapCalibration(tapSongTime, nearestBeatTime) {
  if (!Number.isFinite(tapSongTime)) {
    return _calibrationOffsetSec;
  }
  const targetBeat = Number.isFinite(nearestBeatTime)
    ? Number(nearestBeatTime)
    : nearestSubdivision(tapSongTime, 1.0);
  const residualSec = Number(tapSongTime) - targetBeat;
  _tapCalibrationSamples.push(residualSec);
  if (_tapCalibrationSamples.length > 8) {
    _tapCalibrationSamples.shift();
  }
  const sum = _tapCalibrationSamples.reduce((acc, v) => acc + v, 0.0);
  const avgOffset = sum / _tapCalibrationSamples.length;
  return setCalibrationOffsetSec(avgOffset);
}

// ============================================================================
// CONFIGURATION, AUDIO ENGINE BINDING & SIMULATION HELPERS
// ============================================================================

export function getActiveChart() {
  if (_boundEngine && typeof _boundEngine.getActiveChart === 'function') {
    const engineChart = _boundEngine.getActiveChart();
    if (engineChart) return engineChart;
  }
  return _activeChart;
}

export function setActiveChart(chart) {
  _activeChart = extendChartWithBpmSections(chart);
  return _activeChart;
}

export function setSimulatedTime(t) {
  _simulatedTimeSec = (t !== null && t !== undefined && Number.isFinite(Number(t)))
    ? Number(t)
    : null;
  return _simulatedTimeSec;
}

export function getSimulatedTime() {
  return _simulatedTimeSec;
}

export function bindAudioEngine(engine) {
  _boundEngine = engine || null;
  if (_boundEngine && Number.isFinite(_boundEngine.calibrationOffsetSec)) {
    _calibrationOffsetSec = Math.max(
      CALIBRATION_MIN_SEC,
      Math.min(CALIBRATION_MAX_SEC, Number(_boundEngine.calibrationOffsetSec))
    );
  }
  return _boundEngine;
}

export function getScheduledSfxLog() {
  return _scheduledSfxLog.slice();
}

export function clearScheduledSfxLog() {
  _scheduledSfxLog.length = 0;
}

/**
 * Creates or configures a Web Audio `AudioBufferSourceNode` master clock controller.
 *
 * @param {Object} [options] - `{ ctx, destination, chart, loop }`
 */
export function createAudioMasterClock(options = {}) {
  if (options.ctx) {
    _masterBufferState.ctx = options.ctx;
  }
  if (options.chart) {
    setActiveChart(options.chart);
  }
  if (options.loop !== undefined) {
    _masterBufferState.loop = Boolean(options.loop);
  }

  return {
    startBuffer(audioBuffer, offsetSec = 0.0) {
      const ctx = _masterBufferState.ctx || (_boundEngine && _boundEngine.ctx);
      if (!ctx || !audioBuffer) return false;
      this.stopBuffer();

      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.loop = _masterBufferState.loop;

      const dest = options.destination || (_boundEngine && _boundEngine.musicBus) || ctx.destination;
      const gain = ctx.createGain();
      gain.gain.value = 0.96;
      src.connect(gain);
      gain.connect(dest);

      const safeOffset = Math.max(0.0, Number(offsetSec) || 0.0);
      const startWhen = ctx.currentTime;
      src.start(startWhen, safeOffset);

      _masterBufferState.ctx = ctx;
      _masterBufferState.buffer = audioBuffer;
      _masterBufferState.sourceNode = src;
      _masterBufferState.gainNode = gain;
      _masterBufferState.startTimeCtxSec = startWhen - safeOffset;
      _masterBufferState.pauseOffsetSec = safeOffset;
      _masterBufferState.isPlaying = true;
      return true;
    },
    stopBuffer() {
      if (_masterBufferState.sourceNode) {
        const currentT = now();
        if (currentT !== null) {
          _masterBufferState.pauseOffsetSec = currentT;
        }
        try {
          _masterBufferState.sourceNode.stop();
        } catch (_) {}
        try {
          _masterBufferState.sourceNode.disconnect();
        } catch (_) {}
      }
      _masterBufferState.sourceNode = null;
      _masterBufferState.isPlaying = false;
    },
    now,
    nextSubdivision,
    nearestSubdivision,
    scheduleSfx,
    getCalibrationOffsetSec,
    setCalibrationOffsetSec,
    recordTapCalibration
  };
}

export {
  estimateBpmFromAudioBuffer,
  buildCustomTrackChart
};
