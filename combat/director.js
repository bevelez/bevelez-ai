/**
 * combat/director.js — DJ KRONOS Phase 3 ("Dead as Disco") Song-Marker Enemy Director
 *
 * Adheres strictly to `CONTRACTS.md` Section 2.3:
 * - `export function tick(songTime, dt = 0.016, context = undefined)`
 * - Reads per-bar `movesetSync` markers from the active chart (or synthesizes deterministic
 *   per-bar musical markers when a legacy chart is passed: `hook` on beat 2, `double-tap` on 2-and,
 *   `charge`/`haymaker` on beat 4 -> beat 1 of next bar, and Wave 3 `scratch_combo` / `bass_drop` markers).
 * - Selects one eligible attacker per marker (preferring the enemy the player is facing via dot product,
 *   weighted by cooldown and distance, respecting `maxSimultaneousAttackers`).
 * - Back-computes `windupStart = markerTime - windupLen / playRate` so the enemy begins its wind-up
 *   at `windupStart` and its strike resolves at `markerTime` (within `±20 ms`, with `0` enemy strikes
 *   ever resolving outside a marker).
 * - Drives telegraph ring & counter prompt by beat phase (`(songTime - windupStart) / (markerTime - windupStart)`),
 *   greying out the prompt until the counter window opens.
 * - Evaluates dodge/counter window (`±0.5` subdivision around `markerTime`):
 *   - Perfect counter (`|songTime - markerTime| <= 0.065s`) negates damage, triggers a scripted
 *     `counter-riposte` resolving on the next beat, KOs/launches a mook or counter-stuns Kronos,
 *     and awards Takedown Token & Fever progress.
 *   - Imperfect counter (`|songTime - markerTime| <= 0.5 * subDivSec`) negates damage and puts the
 *     attacker into `dazed` state.
 * - Tracks Takedown Tokens (`0..3`) and Fever meter (`0..100`).
 */

import {
  ARENA_RADIUS,
  BARRICADE_WALL_SLAM_RADIUS,
  PLAYER_HIT_STUN_SEC,
  HIT_REACTION_PROFILES,
  ENEMY_REACTION_POSES,
  PLAYER_REACTION_POSES,
  getWallSlamRadius,
  evaluateReactionPhaseCurve,
  getDirectionalHitReactionProfile,
  applyEnemyHitReaction,
  checkAndApplyWallSlam,
  updateEnemyReactionState,
  applyPlayerHurtReaction,
  setPlayerGuardState,
  evaluatePlayerIncomingHit,
  updatePlayerReactionState
} from './reactions.js';

export {
  ARENA_RADIUS,
  BARRICADE_WALL_SLAM_RADIUS,
  PLAYER_HIT_STUN_SEC,
  HIT_REACTION_PROFILES,
  ENEMY_REACTION_POSES,
  PLAYER_REACTION_POSES,
  getWallSlamRadius,
  evaluateReactionPhaseCurve,
  getDirectionalHitReactionProfile,
  applyEnemyHitReaction,
  checkAndApplyWallSlam,
  updateEnemyReactionState,
  applyPlayerHurtReaction,
  setPlayerGuardState,
  evaluatePlayerIncomingHit,
  updatePlayerReactionState
};

export const DEFAULT_CHART_BPM = 92.0;
export const DEFAULT_BEAT_SEC = 60.0 / DEFAULT_CHART_BPM; // 0.6521739130434783 s
export const PERFECT_COUNTER_FLOOR_SEC = 0.045;
export const PERFECT_COUNTER_CEIL_SEC = 0.085;
export const PERFECT_COUNTER_WINDOW_SEC = Math.max(
  PERFECT_COUNTER_FLOOR_SEC,
  Math.min(PERFECT_COUNTER_CEIL_SEC, 0.25 * (DEFAULT_BEAT_SEC * 0.5))
);
export const MAX_TAKEDOWN_TOKENS = 3;
export const MAX_FEVER_METER = 100.0;

/**
 * Canonical enemy clip windup lengths & stretch limits (matching `clips.json` in `CONTRACTS.md`).
 */
export const ENEMY_CLIP_SPECS = {
  hook: {
    clip: 'hook',
    attackType: 'quick_hook',
    windupLen: 0.46,
    strikeDur: 0.16,
    leadBeats: 1.0,
    stretch: [0.55, 2.2],
    damage: 12,
    heavy: false
  },
  quick_hook: {
    clip: 'hook',
    attackType: 'quick_hook',
    windupLen: 0.46,
    strikeDur: 0.16,
    leadBeats: 1.0,
    stretch: [0.55, 2.2],
    damage: 12,
    heavy: false
  },
  'double-tap': {
    clip: 'double-tap',
    attackType: 'double_tap',
    windupLen: 0.30,
    strikeDur: 0.14,
    leadBeats: 0.5,
    stretch: [0.55, 2.2],
    damage: 10,
    heavy: false
  },
  double_tap: {
    clip: 'double-tap',
    attackType: 'double_tap',
    windupLen: 0.30,
    strikeDur: 0.14,
    leadBeats: 0.5,
    stretch: [0.55, 2.2],
    damage: 10,
    heavy: false
  },
  haymaker: {
    clip: 'haymaker',
    attackType: 'heavy_haymaker',
    windupLen: 0.82,
    strikeDur: 0.20,
    leadBeats: 1.5,
    stretch: [0.55, 2.2],
    damage: 18,
    heavy: true
  },
  heavy_haymaker: {
    clip: 'haymaker',
    attackType: 'heavy_haymaker',
    windupLen: 0.82,
    strikeDur: 0.20,
    leadBeats: 1.5,
    stretch: [0.55, 2.2],
    damage: 18,
    heavy: true
  },
  charge: {
    clip: 'charge',
    attackType: 'heavy_haymaker',
    windupLen: 0.92,
    strikeDur: 0.22,
    leadBeats: 2.0,
    stretch: [0.55, 2.2],
    damage: 22,
    heavy: true
  },
  'scratch-1': {
    clip: 'scratch-1',
    attackType: 'scratch_combo',
    comboStep: 0,
    windupLen: 0.46,
    strikeDur: 0.16,
    leadBeats: 1.0,
    stretch: [0.55, 2.2],
    damage: 10,
    heavy: false
  },
  'scratch-2': {
    clip: 'scratch-2',
    attackType: 'scratch_combo',
    comboStep: 1,
    windupLen: 0.46,
    strikeDur: 0.16,
    leadBeats: 1.0,
    stretch: [0.55, 2.2],
    damage: 12,
    heavy: false
  },
  'scratch-3': {
    clip: 'scratch-3',
    attackType: 'scratch_combo',
    comboStep: 2,
    windupLen: 0.46,
    strikeDur: 0.18,
    leadBeats: 1.0,
    stretch: [0.55, 2.2],
    damage: 18,
    heavy: true
  },
  scratch_combo: {
    clip: 'scratch-1',
    attackType: 'scratch_combo',
    comboStep: 0,
    windupLen: 0.46,
    strikeDur: 0.16,
    leadBeats: 1.0,
    stretch: [0.55, 2.2],
    damage: 12,
    heavy: false
  },
  'bass-drop': {
    clip: 'bass-drop',
    attackType: 'bass_drop',
    windupLen: 0.95,
    strikeDur: 0.24,
    leadBeats: 2.0,
    stretch: [0.55, 2.2],
    damage: 26,
    heavy: true
  },
  bass_drop: {
    clip: 'bass-drop',
    attackType: 'bass_drop',
    windupLen: 0.95,
    strikeDur: 0.24,
    leadBeats: 2.0,
    stretch: [0.55, 2.2],
    damage: 26,
    heavy: true
  }
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function percentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const idx = clamp(Math.ceil((p / 100) * sortedArr.length) - 1, 0, sortedArr.length - 1);
  return Number(sortedArr[idx].toFixed(2));
}

/**
 * Resolves `beatSec` from the passed chart (`chart.beatSec || (60 / (chart.bpm || 92))`),
 * or from `chart.beatTimes` spacing when present, defaulting to 92.0 BPM (`0.652174 s`).
 *
 * @param {Object} [chart]
 * @returns {number}
 */
export function getChartBeatSec(chart = {}) {
  if (chart && typeof chart.beatSec === 'number' && chart.beatSec > 0) {
    return chart.beatSec;
  }
  if (chart && typeof chart.bpm === 'number' && chart.bpm > 0) {
    return 60.0 / chart.bpm;
  }
  if (chart && Array.isArray(chart.beatTimes) && chart.beatTimes.length >= 2) {
    const span = Number(chart.beatTimes[chart.beatTimes.length - 1]) - Number(chart.beatTimes[0]);
    if (span > 0) {
      return span / (chart.beatTimes.length - 1);
    }
  }
  return DEFAULT_BEAT_SEC;
}

/**
 * Resolves the timestamp in seconds for `globalBeat` (0-indexed beat float) from `chart.beatTimes`
 * when available (interpolating fractional subdivisions such as `1.5` for 2-and), or from
 * `firstBeatOffset + globalBeat * beatSec`.
 *
 * @param {Object} [chart]
 * @param {number} [globalBeat=0]
 * @param {number} [beatSec]
 * @returns {number}
 */
export function resolveChartBeatTime(chart = {}, globalBeat = 0, beatSec = getChartBeatSec(chart)) {
  const beatTimes = (chart && Array.isArray(chart.beatTimes)) ? chart.beatTimes : null;
  const hasExplicitTempo = Boolean(
    chart && (
      (typeof chart.beatSec === 'number' && chart.beatSec > 0) ||
      (typeof chart.bpm === 'number' && chart.bpm > 0)
    )
  );
  const firstBeatOffset = (chart && typeof chart.firstBeatOffset === 'number')
    ? chart.firstBeatOffset
    : (beatTimes && beatTimes.length > 0 ? Number(beatTimes[0]) : 0.007);

  if (beatTimes && beatTimes.length > 0 && globalBeat >= 0 && (chart.useBeatTimes || !hasExplicitTempo)) {
    const baseIdx = Math.floor(globalBeat);
    const frac = globalBeat - baseIdx;
    if (baseIdx < beatTimes.length) {
      const t0 = Number(beatTimes[baseIdx]);
      const t1 = (baseIdx + 1 < beatTimes.length)
        ? Number(beatTimes[baseIdx + 1])
        : (t0 + beatSec);
      return t0 + frac * (t1 - t0);
    }
    const lastIdx = beatTimes.length - 1;
    return Number(beatTimes[lastIdx]) + (globalBeat - lastIdx) * beatSec;
  }

  return firstBeatOffset + globalBeat * beatSec;
}

/**
 * Computes subdivision-relative counter windows for a marker/strike and chart:
 * - `subDivSec = beatSec * (marker.counterSubdivision || marker.subdivision || 0.5)`
 * - Imperfect counter / parry window: `±0.5 * subDivSec` around `markerTime` (Section 3.2)
 * - Perfect counter window: `±Math.max(0.045, Math.min(0.085, 0.25 * subDivSec))` around `markerTime`
 *
 * @param {Object} [marker]
 * @param {Object} [chart]
 */
export function getCounterWindowsForMarker(marker = {}, chart = {}) {
  const beatSec = getChartBeatSec(chart);
  const counterSubdivision = (marker && (marker.counterSubdivision || marker.subdivision)) || 0.5;
  const subDivSec = beatSec * counterSubdivision;
  const counterWindowSec = 0.5 * subDivSec;
  const perfectWindowSec = Math.max(
    PERFECT_COUNTER_FLOOR_SEC,
    Math.min(PERFECT_COUNTER_CEIL_SEC, 0.25 * subDivSec)
  );
  return {
    beatSec,
    counterSubdivision,
    subDivSec,
    counterWindowSec,
    perfectWindowSec
  };
}

/**
 * Generates or normalizes per-bar `movesetSync` markers for a track chart.
 *
 * When a chart bar already defines `bar.movesetSync` or `chart.movesetSync` (Track D schema),
 * those markers are normalized using `chart.beatSec` and `chart.beatTimes`.
 * Otherwise, deterministic per-bar beat markers are synthesized:
 * - Waves 1 & 2 (mook waves):
 *   - Beat 2 (1-indexed, `beatOffsetInBar = 1.0`): `hook`
 *   - Beat 2-and (`beatOffsetInBar = 1.5` in Wave 2 / odd bars): `double-tap`
 *   - Beat 3 windup -> Beat 1 of next bar (`beatOffsetInBar = 4.0`): `charge` / `haymaker`
 * - Wave 3 (Boss DJ Kronos + Royal Guard):
 *   - Bars 0, 1, 2 of each 4-bar phrase: `scratch-1` (beat 1), `scratch-2` (beat 2), `scratch-3` (beat 3)
 *     for Kronos (`scratch_combo`), plus a bruiser `haymaker` marker on beat 4 if Royal Guard is active.
 *   - Bar 3 of each 4-bar phrase (`barIdx % 4 === 3`): `bass_drop` landing on beat 4 (`beatOffsetInBar = 4.0`)
 *     with wind-up starting 2 beats prior.
 *
 * @param {Object} chart - Active track chart (`bpm`, `beatSec`, `beatTimes`, `firstBeatOffset`, `bars`, `loopDuration`)
 * @param {Object} [options] - `{ wave: 1|2|3, totalBars: number, waveStartBeatFloat: number }`
 * @returns {Array<Object>} Sorted array of marker descriptors
 */
export function buildChartMovesetMarkers(chart = {}, options = {}) {
  const beatSec = getChartBeatSec(chart);
  const firstBeatOffset = (chart && typeof chart.firstBeatOffset === 'number')
    ? chart.firstBeatOffset
    : (Array.isArray(chart && chart.beatTimes) && chart.beatTimes.length > 0 ? Number(chart.beatTimes[0]) : 0.007);
  const wave = options.wave || 1;
  const waveStartBeat = Math.round(options.waveStartBeatFloat || 0);
  const duration = chart.loopDuration || chart.fullDuration || 101.632;
  const totalBeatsFromChart = Array.isArray(chart.beatTimes) && chart.beatTimes.length > 0
    ? chart.beatTimes.length
    : Math.max(16, Math.ceil((duration - firstBeatOffset) / beatSec) + 8);
  const total4BeatBars = options.totalBars || chart.totalBars || Math.ceil(totalBeatsFromChart / 4);

  const buildMarkerEntry = ({
    id,
    barIndex,
    beatInBar,
    globalBeat,
    pattern,
    attackType,
    comboStep,
    targetRole,
    explicitMarkerTime,
    leadBeats,
    counterSubdivision = 0.5,
    damage,
    enemyArchetype
  }) => {
    const spec = ENEMY_CLIP_SPECS[pattern] || ENEMY_CLIP_SPECS.hook;
    const resolvedMarkerTime = explicitMarkerTime !== undefined
      ? explicitMarkerTime
      : resolveChartBeatTime(chart, globalBeat, beatSec);
    // at least 1.25 beats of body anticipation so the wind-up can be read before the counter window
    const effectiveLeadBeats = Math.max(leadBeats || spec.leadBeats || 1.0, options.minLeadBeats !== undefined ? options.minLeadBeats : 1.25);
    const desiredWindupDur = effectiveLeadBeats * beatSec;
    const playRate = clamp(spec.windupLen / desiredWindupDur, 1 / spec.stretch[1], 1 / spec.stretch[0]);
    const windupStart = resolvedMarkerTime - (spec.windupLen / playRate);
    const win = getCounterWindowsForMarker({ counterSubdivision }, chart);

    return {
      id,
      barIndex,
      beatInBar,
      globalBeat,
      pattern: pattern || 'hook',
      enemyArchetype: enemyArchetype || null,
      attackType: attackType || spec.attackType,
      comboStep: comboStep !== undefined ? comboStep : spec.comboStep,
      targetRole: targetRole || (wave === 3 ? 'any' : 'bruiser'),
      markerTime: Number(resolvedMarkerTime.toFixed(6)),
      windupStart: Number(windupStart.toFixed(6)),
      windupLen: spec.windupLen,
      leadBeats: effectiveLeadBeats,
      playRate: Number(playRate.toFixed(4)),
      subdivision: counterSubdivision,
      counterSubdivision,
      subDivSec: Number(win.subDivSec.toFixed(6)),
      counterWindowSec: Number(win.counterWindowSec.toFixed(6)),
      perfectWindowSec: Number(win.perfectWindowSec.toFixed(6)),
      damage: damage !== undefined ? damage : spec.damage
    };
  };

  // 1. Check if chart explicitly supplies top-level or per-bar movesetSync markers
  const explicitMarkers = [];
  if (Array.isArray(chart.movesetSync) && chart.movesetSync.length > 0) {
    chart.movesetSync.forEach((m, idx) => {
      if (!m || m.pattern === 'final_bar_finisher') return;
      const spec = ENEMY_CLIP_SPECS[m.pattern] || ENEMY_CLIP_SPECS.hook;
      const barIndex = m.barIndex !== undefined ? m.barIndex : Math.floor((m.beat !== undefined ? m.beat : idx) / 4);
      const beatInBar = m.beatInBar !== undefined ? m.beatInBar : ((m.beat !== undefined ? m.beat : idx) % 4);
      const globalBeat = (m.barIndex !== undefined && m.beatInBar !== undefined)
        ? (m.barIndex * 4 + m.beatInBar)
        : (m.beat !== undefined ? m.beat : idx);
      const comboStep = m.comboStep !== undefined
        ? m.comboStep
        : (m.step !== undefined && spec.attackType === 'scratch_combo' ? Math.max(0, m.step - 1) : spec.comboStep);
      const targetRole = m.targetRole || (
        (m.enemyArchetype === 'boss_kronos' || spec.attackType === 'scratch_combo' || spec.attackType === 'bass_drop')
          ? 'kronos'
          : (wave === 3 && !m.enemyArchetype ? 'any' : 'bruiser')
      );
      explicitMarkers.push(buildMarkerEntry({
        id: m.id || `marker_${idx}_${m.pattern}`,
        barIndex,
        beatInBar,
        globalBeat,
        pattern: m.pattern || 'hook',
        attackType: m.attackType || spec.attackType,
        comboStep,
        targetRole,
        explicitMarkerTime: m.markerTime,
        enemyArchetype: m.enemyArchetype,
        leadBeats: m.leadBeats || m.windupBeats || spec.leadBeats || 1.0,
        counterSubdivision: m.counterSubdivision || m.subdivision || 0.5,
        damage: m.damage
      }));
    });
  } else if (Array.isArray(chart.bars)) {
    chart.bars.forEach((bar, bIdx) => {
      if (Array.isArray(bar.movesetSync) && bar.movesetSync.length > 0) {
        bar.movesetSync.forEach((m, mIdx) => {
          const spec = ENEMY_CLIP_SPECS[m.pattern] || ENEMY_CLIP_SPECS.hook;
          const beatInBar = m.beatInBar !== undefined ? m.beatInBar : (m.beat !== undefined ? m.beat : 1.0);
          const globalBeat = bIdx * 4 + beatInBar;
          const comboStep = m.comboStep !== undefined
            ? m.comboStep
            : (m.step !== undefined && spec.attackType === 'scratch_combo' ? Math.max(0, m.step - 1) : spec.comboStep);
          const targetRole = m.targetRole || (
            (m.enemyArchetype === 'boss_kronos' || spec.attackType === 'scratch_combo' || spec.attackType === 'bass_drop')
              ? 'kronos'
              : (wave === 3 && !m.enemyArchetype ? 'any' : 'bruiser')
          );
          explicitMarkers.push(buildMarkerEntry({
            id: m.id || `bar_${bIdx}_m_${mIdx}_${m.pattern}`,
            barIndex: bIdx,
            beatInBar,
            globalBeat,
            pattern: m.pattern || 'hook',
            attackType: m.attackType || spec.attackType,
            comboStep,
            targetRole,
            explicitMarkerTime: m.markerTime,
        enemyArchetype: m.enemyArchetype,
            leadBeats: m.leadBeats || m.windupBeats || spec.leadBeats || 1.0,
            counterSubdivision: m.counterSubdivision || m.subdivision || 0.5,
            damage: m.damage
          }));
        });
      }
    });
  }

  const hasWaveRoleCoverage = wave === 3
    ? explicitMarkers.some((m) => m.targetRole === 'kronos' && m.globalBeat >= waveStartBeat && m.globalBeat <= waveStartBeat + 8)
    : explicitMarkers.length > 0;
  if (hasWaveRoleCoverage && !options.forceWaveMarkers) {
    return explicitMarkers.sort((a, b) => a.markerTime - b.markerTime);
  }

  // 2. Synthesize deterministic per-bar beat markers for the active wave
  const markers = [];
  const pushMarker = (barIdx, beatInBar, pattern, targetRole, customOpts = {}) => {
    const globalBeat = waveStartBeat + barIdx * 4 + beatInBar;
    markers.push(buildMarkerEntry({
      id: `w${wave}_bar${barIdx}_b${beatInBar}_${pattern}`,
      barIndex: barIdx,
      beatInBar,
      globalBeat,
      pattern,
      attackType: customOpts.attackType,
      comboStep: customOpts.comboStep,
      targetRole,
      leadBeats: customOpts.leadBeats,
      counterSubdivision: customOpts.counterSubdivision || customOpts.subdivision || 0.5,
      damage: customOpts.damage
    }));
  };

  for (let barIdx = 0; barIdx < total4BeatBars; barIdx++) {
    if (wave === 3) {
      // Wave 3 Boss DJ Kronos + Royal Guard movesetSync schedule
      if ((barIdx % 4) === 3) {
        // Every 4th bar (barIdx % 4 === 3): Subwoofer Bass Drop landing on beat 4.0 of the bar
        pushMarker(barIdx, 4.0, 'bass_drop', 'kronos', {
          attackType: 'bass_drop',
          leadBeats: 2.0,
          damage: 26
        });
        // Royal Guard bruiser marker on beat 2.0 if active
        pushMarker(barIdx, 2.0, 'hook', 'bruiser', {
          attackType: 'quick_hook',
          leadBeats: 1.0,
          damage: 16
        });
      } else {
        // 3-hit Scratch Combo string on beats 1.0, 2.0, 3.0 of the bar
        pushMarker(barIdx, 1.0, 'scratch-1', 'kronos', {
          attackType: 'scratch_combo',
          comboStep: 0,
          leadBeats: 0.95,
          damage: 10
        });
        pushMarker(barIdx, 2.0, 'scratch-2', 'kronos', {
          attackType: 'scratch_combo',
          comboStep: 1,
          leadBeats: 0.90,
          damage: 12
        });
        pushMarker(barIdx, 3.0, 'scratch-3', 'kronos', {
          attackType: 'scratch_combo',
          comboStep: 2,
          leadBeats: 0.90,
          damage: 18
        });
        // Royal Guard bruiser haymaker marker on beat 4.0
        pushMarker(barIdx, 4.0, 'haymaker', 'bruiser', {
          attackType: 'heavy_haymaker',
          leadBeats: 1.5,
          damage: 24
        });
      }
    } else if (wave === 2) {
      // Wave 2 Heavy Hype-Crew: hook on beat 2 (1.0), double-tap on 2-and (1.5), charge winding up on beat 3 (2.0) and landing on beat 1 of next bar (4.0)
      pushMarker(barIdx, 1.0, 'hook', 'bruiser', {
        attackType: 'quick_hook',
        leadBeats: 1.0,
        damage: 14
      });
      if ((barIdx % 2) === 1) {
        pushMarker(barIdx, 1.5, 'double-tap', 'bruiser', {
          attackType: 'quick_hook',
          leadBeats: 0.5,
          damage: 12
        });
      }
      pushMarker(barIdx, 4.0, 'charge', 'bruiser', {
        attackType: 'heavy_haymaker',
        leadBeats: 2.0,
        damage: 22
      });
    } else {
      // Wave 1 Cypher Vanguard: hook on beat 2 (1.0), haymaker landing on beat 1 of next bar (4.0)
      pushMarker(barIdx, 1.0, 'hook', 'bruiser', {
        attackType: 'quick_hook',
        leadBeats: 1.0,
        damage: 10
      });
      pushMarker(barIdx, 4.0, 'haymaker', 'bruiser', {
        attackType: 'heavy_haymaker',
        leadBeats: 1.5,
        damage: 16
      });
    }
  }

  return markers.sort((a, b) => a.markerTime - b.markerTime);
}

/**
 * Selects the best eligible attacker for `marker` based on:
 * - Target role (`'kronos'` vs `'bruiser'` vs `'any'`)
 * - Player facing dot product (preferring the enemy the player is facing)
 * - Cooldown readiness and distance to player
 * - `maxSimultaneousAttackers` cap
 *
 * @param {Object} marker
 * @param {Array<Object>} enemies
 * @param {Object} playerState
 * @param {number} maxSimultaneousAttackers
 * @param {number} activeAttackerCount
 * @returns {Object|null}
 */
export function selectEligibleAttacker(marker, enemies, playerState = {}, maxSimultaneousAttackers = 1, activeAttackerCount = 0) {
  if (!Array.isArray(enemies) || enemies.length === 0) return null;
  if (activeAttackerCount >= maxSimultaneousAttackers) return null;

  const playerPos = playerState.playerPos || { x: -0.46, y: 0, z: 1.68 };
  const playerYaw = playerState.playerYaw !== undefined ? playerState.playerYaw : -0.18;
  // Challenger faces -Z at yaw = 0
  const fwdX = -Math.sin(playerYaw);
  const fwdZ = -Math.cos(playerYaw);

  let bestEnemy = null;
  let bestScore = -Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || !e.active) continue;
    const st = e.state || 'stalking';
    if (
      st === 'ko' ||
      st === 'flying' ||
      st === 'dazed' ||
      st === 'stunned' ||
      st === 'counter_stun' ||
      st === 'wall_slam' ||
      st === 'guard_break' ||
      st === 'launch' ||
      st === 'windup' ||
      st === 'striking' ||
      st === 'windup_combo' ||
      st === 'striking_combo' ||
      st === 'windup_shockwave' ||
      st === 'shockwave_active'
    ) {
      continue;
    }

    if (marker.targetRole === 'kronos' && !e.isBoss) continue;
    if (marker.targetRole === 'bruiser' && e.isBoss) continue;

    const ePos = (e.rig && e.rig.root && e.rig.root.position) || e.position || { x: 0, y: 0, z: 0 };
    const dx = (ePos.x || 0) - (playerPos.x || 0);
    const dz = (ePos.z || 0) - (playerPos.z || 0);
    const dist = Math.hypot(dx, dz);
    const nx = dist > 1e-4 ? (dx / dist) : 0;
    const nz = dist > 1e-4 ? (dz / dist) : -1;

    const facingDot = fwdX * nx + fwdZ * nz; // [-1, 1], higher when player is facing enemy
    const cd = Math.max(0, e.attackCooldown || 0);
    const cooldownScore = -cd * 1.25;
    const distScore = -Math.abs(dist - 1.45) * 0.65;
    const bossBonus = e.isBoss ? 1.5 : 0.0;
    const archetypeBonus = marker.enemyArchetype
      ? (e.archetype === marker.enemyArchetype ? 1.8 : (e.archetype ? -0.6 : 0.0))
      : 0.0;
    const score = facingDot * 2.2 + cooldownScore + distScore + bossBonus + archetypeBonus;

    if (score > bestScore) {
      bestScore = score;
      bestEnemy = e;
    }
  }

  return bestEnemy;
}

/**
 * Creates a stateful Combat Director instance.
 *
 * @param {Object} [options]
 */
export function createCombatDirector(options = {}) {
  const state = {
    chartId: null,
    wave: options.wave || 1,
    waveStartBeatFloat: 0,
    markers: [],
    dispatchedMarkerIds: new Set(),
    scheduledStrikes: [],
    resolvedStrikes: [],
    allResolvedStrikes: [],
    pendingRipostes: [],
    outsideMarkerStrikes: 0,
    takedownTokens: options.initialTakedownTokens || 0,
    takedownProgress: 0.0,
    feverMeter: options.initialFeverMeter || 0.0,
    feverActive: false,
    counterEvents: [],
    lastSongTime: null
  };

  function reset(resetOpts = {}) {
    state.chartId = null;
    state.wave = resetOpts.wave || 1;
    state.waveStartBeatFloat = resetOpts.waveStartBeatFloat || 0;
    state.markers = [];
    state.dispatchedMarkerIds.clear();
    state.scheduledStrikes = [];
    state.resolvedStrikes = [];
    state.allResolvedStrikes = [];
    state.pendingRipostes = [];
    state.outsideMarkerStrikes = 0;
    state.takedownTokens = resetOpts.initialTakedownTokens || 0;
    state.takedownProgress = 0.0;
    state.feverMeter = resetOpts.initialFeverMeter || 0.0;
    state.feverActive = false;
    state.counterEvents = [];
    state.lastSongTime = null;
  }

  function ensureMarkers(chart, wave, waveStartBeatFloat = 0) {
    const beatSecKey = getChartBeatSec(chart).toFixed(5);
    const chartKey = `${(chart && chart.id) || 'flow'}_b${beatSecKey}_w${wave}_s${Math.round(waveStartBeatFloat)}`;
    if (state.chartId !== chartKey || state.markers.length === 0) {
      state.chartId = chartKey;
      state.wave = wave;
      state.waveStartBeatFloat = waveStartBeatFloat;
      state.markers = buildChartMovesetMarkers(chart || {}, {
        wave,
        waveStartBeatFloat
      });
    }
  }

  function grantTakedownTokenProgress(amount = 0.35, reason = 'hit') {
    if (amount <= 0) return state.takedownTokens;
    if (state.takedownTokens >= MAX_TAKEDOWN_TOKENS) {
      state.takedownProgress = 0.0;
      return state.takedownTokens;
    }
    state.takedownProgress += amount;
    while (state.takedownProgress >= 1.0 && state.takedownTokens < MAX_TAKEDOWN_TOKENS) {
      state.takedownProgress -= 1.0;
      state.takedownTokens += 1;
    }
    if (state.takedownTokens >= MAX_TAKEDOWN_TOKENS) {
      state.takedownProgress = 0.0;
    }
    return state.takedownTokens;
  }

  function grantFeverProgress(amount = 8.0, reason = 'hit') {
    state.feverMeter = clamp(state.feverMeter + amount, 0.0, MAX_FEVER_METER);
    if (state.feverMeter >= MAX_FEVER_METER) {
      state.feverActive = true;
    }
    return state.feverMeter;
  }

  function consumeTakedownToken(targetEnemy = null, context = {}) {
    if (state.takedownTokens <= 0) {
      return { consumed: false, remainingTokens: state.takedownTokens };
    }
    state.takedownTokens -= 1;
    const gs = context.gameState;
    if (gs) {
      // Finishers grant a few seconds of invincibility (Dead as Disco Section 1.2)
      gs.dodgeInvulnTimer = Math.max(gs.dodgeInvulnTimer || 0, 1.85);
      gs.takedownTokens = state.takedownTokens;
    }
    if (targetEnemy) {
      if (targetEnemy.isBoss) {
        if (gs) {
          gs.bossHp = Math.max(0, (gs.bossHp ?? 100) - 34);
          gs.kronosRingState = gs.bossHp <= 0 ? 'ko' : 'counter_stun';
          gs.kronosStateTimer = 1.15;
        }
        if (typeof targetEnemy.hp === 'number') {
          targetEnemy.hp = Math.max(0, targetEnemy.hp - 34);
        }
      } else {
        targetEnemy.hp = 0;
        targetEnemy.state = 'ko';
        targetEnemy.isDazed = false;
        if (typeof context.launchBruiserIntoStage === 'function') {
          context.launchBruiserIntoStage(targetEnemy);
        }
      }
    }
    return {
      consumed: true,
      remainingTokens: state.takedownTokens,
      invincibilityGrantedSec: 1.85
    };
  }

  /**
   * Evaluates a player counter/dodge input at `songTime` against active scheduled strikes.
   *
   * - Perfect counter (`|songTime - markerTime| <= Math.max(0.045, Math.min(0.085, 0.25 * subDivSec))`):
   *   Negates damage, schedules a scripted `counter-riposte` that resolves on the next beat,
   *   instantly KOs a mook or counter-stuns Kronos, and grants +0.50 Takedown Token progress.
   * - Imperfect counter (`|songTime - markerTime| <= 0.5 * subDivSec`):
   *   Negates damage and puts the attacker into `dazed` state.
   */
  function evaluateCounterInput(songTime, action = 'dodge', context = {}) {
    if (songTime === null || songTime === undefined) {
      return { countered: false, grade: 'NONE', counteredStrikes: [] };
    }

    const chart = (context && context.chart) || {};
    const beatSec = getChartBeatSec(chart);

    const matchingStrikes = [];
    for (let i = state.scheduledStrikes.length - 1; i >= 0; i--) {
      const s = state.scheduledStrikes[i];
      if (s.countered) continue;
      const win = getCounterWindowsForMarker(s, chart);
      const deltaSec = Math.abs(songTime - s.markerTime);
      // Group simultaneous hits within the ±0.5 subdivision counter window around markerTime
      if (deltaSec <= win.counterWindowSec) {
        matchingStrikes.push({ strike: s, index: i, deltaSec, win });
      }
    }

    if (matchingStrikes.length === 0) {
      return { countered: false, grade: 'NONE', counteredStrikes: [] };
    }

    let bestMatch = matchingStrikes[0];
    for (const m of matchingStrikes) {
      if (m.deltaSec < bestMatch.deltaSec) bestMatch = m;
    }

    const bestDeltaSec = bestMatch.deltaSec;
    const isPerfect = bestDeltaSec <= bestMatch.win.perfectWindowSec;
    const counterGrade = isPerfect ? 'PERFECT_COUNTER' : 'IMPERFECT_COUNTER';
    const riposteImpactTime = Number((matchingStrikes[0].strike.markerTime + beatSec).toFixed(6));
    const gs = context.gameState;

    const counteredList = [];
    matchingStrikes
      .sort((a, b) => b.index - a.index)
      .forEach(({ strike, deltaSec }) => {
        strike.countered = true;
        strike.counterGrade = counterGrade;
        strike.counterSongTime = Number(songTime.toFixed(6));
        const enemy = strike._enemyRef;
        if (enemy) {
          if (enemy.teleMat) enemy.teleMat.opacity = 0;
          if (enemy.isBoss) {
            const isBassDrop = strike.attackType === 'bass_drop' || strike.pattern === 'bass_drop';
            const riposteDmg = isBassDrop ? 28 : 26;
            if (isPerfect || strike.comboStep === 2 || isBassDrop) {
              if (typeof enemy.hp === 'number') {
                enemy.hp = Math.max(0, enemy.hp - riposteDmg);
              }
              if (gs) {
                gs.bossHp = Math.max(0, (gs.bossHp ?? 100) - riposteDmg);
                gs.kronosRingState = gs.bossHp <= 0 ? 'ko' : 'counter_stun';
                gs.kronosStateTimer = 0.85;
                gs.counterBonusTimer = 1.6;
                gs.bossCounterStunActive = true;
                gs.bossAttackPattern = 'idle';
              }
              enemy.state = (enemy.hp !== undefined && enemy.hp <= 0) ? 'ko' : 'counter_stun';
              enemy.stateTimer = 0.85;
            } else {
              enemy.state = 'stunned';
              enemy.stateTimer = 0.85;
              if (gs) {
                gs.kronosRingState = 'stunned';
                gs.kronosStateTimer = 0.85;
              }
            }
          } else if (isPerfect) {
            // Perfect counter instantly KOs a mook (Dead as Disco Section 1.2)
            enemy.hp = 0;
            enemy.state = 'ko';
            enemy.isDazed = false;
            if (typeof context.launchBruiserIntoStage === 'function') {
              context.launchBruiserIntoStage(enemy);
            } else if (enemy.badge && typeof enemy.badge.update === 'function') {
              enemy.badge.update(0, enemy.maxHp || 100, 'ko', '★ COUNTER K.O.! ★');
            }
          } else {
            // Imperfect counter negates the hit and puts the attacker into dazed state
            enemy.state = 'dazed';
            enemy.isDazed = true;
            enemy.vulnerableToFinisher = true;
            enemy.stateTimer = 1.65;
            if (enemy.badge && typeof enemy.badge.update === 'function') {
              enemy.badge.update(enemy.hp, enemy.maxHp || 100, 'stunned', '★ DAZED [FINISHER] ★');
            }
          }
        }

        counteredList.push({
          attackerId: strike.attackerId,
          pattern: strike.pattern,
          markerTime: strike.markerTime,
          counterSongTime: Number(songTime.toFixed(6)),
          offsetMs: Number((deltaSec * 1000).toFixed(2)),
          grade: counterGrade,
          riposteImpactTime: isPerfect ? riposteImpactTime : null
        });
      });

    if (isPerfect) {
      grantTakedownTokenProgress(0.50, 'perfect-counter');
      grantFeverProgress(18.0, 'perfect-counter');
      state.pendingRipostes.push({
        clipName: 'counter-riposte',
        triggeredAt: Number(songTime.toFixed(6)),
        impactTime: riposteImpactTime,
        resolved: false,
        targets: counteredList.map((c) => c.attackerId)
      });
      const playerRig = context.challengerRig || (gs && gs.challengerRig);
      if (playerRig && typeof playerRig.playClip === 'function') {
        playerRig.playClip('counter-riposte', { fadeInSec: 0.05, timeScale: 1.0, loop: false });
      }
      if (typeof context.scheduleAction === 'function' && playerRig) {
        context.scheduleAction(playerRig, 'counter-riposte', songTime, { chart });
      }
    } else {
      grantTakedownTokenProgress(0.25, 'imperfect-counter');
      grantFeverProgress(10.0, 'imperfect-counter');
    }

    if (gs) {
      gs.dodgeInvulnTimer = Math.max(gs.dodgeInvulnTimer || 0, isPerfect ? 0.45 : 0.28);
      gs.takedownTokens = state.takedownTokens;
      gs.feverMeter = state.feverMeter;
    }

    const evt = {
      songTime: Number(songTime.toFixed(6)),
      grade: counterGrade,
      offsetMs: Number((bestDeltaSec * 1000).toFixed(2)),
      riposteImpactTime: isPerfect ? riposteImpactTime : null,
      counteredStrikes: counteredList
    };
    state.counterEvents.push(evt);

    return {
      countered: true,
      grade: counterGrade,
      offsetMs: evt.offsetMs,
      riposteImpactTime: evt.riposteImpactTime,
      counteredStrikes: counteredList,
      takedownTokens: state.takedownTokens,
      feverMeter: state.feverMeter
    };
  }

  /**
   * Per-frame director tick (`CONTRACTS.md` Section 2.3).
   */
  function tick(songTime, dt = 0.016, context = {}) {
    state.resolvedStrikes = [];

    if (songTime === null || songTime === undefined) {
      return {
        activeMarker: null,
        scheduledStrikes: state.scheduledStrikes.map(cleanScheduledStrike),
        resolvedStrikes: [],
        activeAttacks: [],
        counterWindows: [],
        scheduledTelegraphs: [],
        takedownTokens: state.takedownTokens,
        feverMeter: Number(state.feverMeter.toFixed(2))
      };
    }

    const gs = context.gameState || {};
    const chart = context.chart || {};
    const wave = context.wave || gs.wave || state.wave || 1;
    const beatSec = getChartBeatSec(chart);
    const maxSimultaneousAttackers = context.maxSimultaneousAttackers !== undefined
      ? context.maxSimultaneousAttackers
      : (wave === 1 ? 1 : 2);

    const waveStartBeatFloat = context.waveStartBeatFloat !== undefined
      ? context.waveStartBeatFloat
      : (gs.wave3StartBeatFloat || 0);
    ensureMarkers(chart, wave, wave === 3 ? waveStartBeatFloat : 0);

    // Gather unified enemy list from context
    const enemies = [];
    if (Array.isArray(context.enemies)) {
      for (const e of context.enemies) enemies.push(e);
    } else {
      if (Array.isArray(context.bruisers)) {
        context.bruisers.forEach((b, idx) => {
          if (b && b.id === undefined) b.id = `bruiser_${b.idx !== undefined ? b.idx : idx}`;
          enemies.push(b);
        });
      }
      if (context.kronos && (context.kronos.active || gs.kronosInRing)) {
        enemies.push(context.kronos);
      } else if (gs.kronosInRing && context.kronosRig) {
        enemies.push({
          id: 'kronos',
          isBoss: true,
          active: gs.bossHp > 0 && gs.kronosRingState !== 'ko',
          hp: gs.bossHp ?? 100,
          maxHp: 100,
          state: gs.kronosRingState || 'stalking',
          attackCooldown: gs.kronosAttackCooldown || 0,
          rig: context.kronosRig,
          teleMat: context.kronosTeleMat || (context.kronosRig && context.kronosRig.teleMat),
          teleRing: context.kronosTeleRing || (context.kronosRig && context.kronosRig.teleRing),
          badge: context.kronosRingBadge
        });
      }
    }

    // Cool down eligible enemies
    for (const e of enemies) {
      if (e && e.active && typeof e.attackCooldown === 'number' && e.attackCooldown > 0) {
        e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      }
    }

    // Cancel any un-countered scheduled strikes whose attacker became inactive, KO'd, stunned, or dazed
    for (let i = state.scheduledStrikes.length - 1; i >= 0; i--) {
      const s = state.scheduledStrikes[i];
      if (s.countered) continue;
      const e = s._enemyRef;
      if (!e || !e.active || e.state === 'ko' || e.state === 'flying' || e.state === 'dazed' || e.state === 'stunned' || e.state === 'counter_stun' || e.state === 'wall_slam' || e.state === 'hit' || e.state === 'launch' || e.state === 'guard_break') {
        if (e && e.teleMat) e.teleMat.opacity = 0;
        state.scheduledStrikes.splice(i, 1);
      }
    }

    // 1. Schedule upcoming markers whose windupStart has arrived
    const lookaheadSec = Math.max(beatSec * 2.2, 1.5);
    for (let i = 0; i < state.markers.length; i++) {
      const m = state.markers[i];
      if (state.dispatchedMarkerIds.has(m.id)) continue;
      if (m.markerTime < songTime - dt) {
        state.dispatchedMarkerIds.add(m.id);
        continue;
      }
      if (m.windupStart > songTime + dt * 0.5) {
        if (m.windupStart > songTime + lookaheadSec) break;
        continue;
      }

      // Marker wind-up window has arrived: pick an eligible attacker
      const activeUncounteredCount = state.scheduledStrikes.filter((s) => !s.countered).length;
      const attacker = selectEligibleAttacker(
        m,
        enemies,
        {
          playerPos: gs.playerPos || context.playerPos,
          playerYaw: (context.challengerRig && context.challengerRig.root && context.challengerRig.root.rotation.y) || -0.18
        },
        maxSimultaneousAttackers,
        activeUncounteredCount
      );

      state.dispatchedMarkerIds.add(m.id);
      if (!attacker) continue;

      const attackerId = attacker.id || (attacker.isBoss ? 'kronos' : `bruiser_${attacker.idx || 0}`);
      const actualWindupStart = Math.min(songTime, m.windupStart);
      const remainingToMarker = Math.max(0.05, m.markerTime - actualWindupStart);
      const playRate = Number((m.windupLen / remainingToMarker).toFixed(4));
      const win = getCounterWindowsForMarker(m, chart);

      attacker.state = attacker.isBoss
        ? (m.attackType === 'bass_drop' ? 'windup_shockwave' : 'windup_combo')
        : 'windup';
      attacker.attackType = m.attackType;
      attacker.attackPattern = m.pattern;
      attacker.targetImpactSongTime = m.markerTime;
      attacker.stateTimer = remainingToMarker;
      attacker.windupTotalDur = remainingToMarker;

      if (attacker.isBoss && gs) {
        gs.bossAttackPattern = m.attackType;
        gs.bossComboStep = m.comboStep !== undefined ? m.comboStep : 0;
        gs.kronosRingState = attacker.state;
        gs.kronosStateTimer = remainingToMarker;
        gs.kronosTargetImpactSongTime = m.markerTime;
      }

      if (attacker.rig && typeof attacker.rig.playClip === 'function') {
        const spec = ENEMY_CLIP_SPECS[m.pattern] || ENEMY_CLIP_SPECS.hook;
        attacker.rig.playClip(spec.clip, { fadeInSec: 0.14, timeScale: playRate, loop: false });
      }

      state.scheduledStrikes.push({
        markerId: m.id,
        attackerId,
        pattern: m.pattern,
        attackType: m.attackType,
        comboStep: m.comboStep,
        damage: m.damage,
        windupStart: m.windupStart,
        markerTime: m.markerTime,
        playRate,
        counterSubdivision: win.counterSubdivision,
        subDivSec: Number(win.subDivSec.toFixed(6)),
        counterWindowSec: Number(win.counterWindowSec.toFixed(6)),
        perfectWindowSec: Number(win.perfectWindowSec.toFixed(6)),
        beatPhase: 0.0,
        inCounterWindow: false,
        inPerfectWindow: false,
        promptGreyedOut: true,
        countered: false,
        _enemyRef: attacker
      });
    }

    // 2. Advance active scheduled strikes, update telegraph ring & prompt by beat phase,
    //    and resolve strikes on the tick closest to `markerTime` (`songTime >= markerTime - dt * 0.5`).
    let anyInPerfectWindow = false;
    let anyInCounterWindow = false;

    for (let i = state.scheduledStrikes.length - 1; i >= 0; i--) {
      const s = state.scheduledStrikes[i];
      const totalWindup = Math.max(0.001, s.markerTime - s.windupStart);
      const beatPhase = clamp((songTime - s.windupStart) / totalWindup, 0.0, 1.0);
      const timeToMarker = s.markerTime - songTime;
      const absDelta = Math.abs(timeToMarker);
      const win = getCounterWindowsForMarker(s, chart);

      s.beatPhase = Number(beatPhase.toFixed(4));
      s.subDivSec = Number(win.subDivSec.toFixed(6));
      s.counterWindowSec = Number(win.counterWindowSec.toFixed(6));
      s.perfectWindowSec = Number(win.perfectWindowSec.toFixed(6));
      s.inCounterWindow = !s.countered && absDelta <= win.counterWindowSec;
      s.inPerfectWindow = !s.countered && absDelta <= win.perfectWindowSec;
      s.promptGreyedOut = !s.inCounterWindow;

      if (s.inCounterWindow) anyInCounterWindow = true;
      if (s.inPerfectWindow) anyInPerfectWindow = true;

      const enemy = s._enemyRef;
      if (enemy && !s.countered) {
        enemy.stateTimer = Math.max(0, timeToMarker);
        // Telegraph ring & prompt driven by beatPhase
        if (enemy.teleRing && enemy.teleRing.scale) {
          const ringScale = 1.32 - 0.32 * beatPhase;
          if (typeof enemy.teleRing.scale.setScalar === 'function') {
            enemy.teleRing.scale.setScalar(ringScale);
          }
        }
        if (enemy.teleMat) {
          enemy.teleMat.opacity = 0.25 + 0.70 * beatPhase;
          if (enemy.teleMat.color && typeof enemy.teleMat.color.setHex === 'function') {
            enemy.teleMat.color.setHex(
              s.inPerfectWindow ? 0xffe042 : (s.inCounterWindow ? 0x00e5ff : (s.promptGreyedOut ? 0x6b778d : 0xff1e38))
            );
          }
        }
        if (enemy.badge && typeof enemy.badge.update === 'function') {
          const promptText = s.promptGreyedOut
            ? `… ${s.pattern.toUpperCase()} …`
            : (s.inPerfectWindow ? '★ COUNTER [F] NOW! ★' : '! COUNTER [F] / DODGE [A] !');
          enemy.badge.update(
            enemy.hp ?? 100,
            enemy.maxHp ?? 100,
            s.inCounterWindow ? 'striking' : 'windup',
            promptText,
            s.attackType
          );
        }
      }

      // Resolve strike on the frame closest to `markerTime` (when `songTime >= s.markerTime - dt * 0.5`)
      if (songTime >= s.markerTime - dt * 0.5) {
        state.scheduledStrikes.splice(i, 1);
        const impactSongTime = Number(songTime.toFixed(6));
        const offsetMs = Number((Math.abs(impactSongTime - s.markerTime) * 1000).toFixed(2));

        // Check if player countered or is currently in dodge/weave i-frames at marker resolution
        const playerDodging = Boolean(
          s.countered ||
          (gs.dodgeInvulnTimer && gs.dodgeInvulnTimer > 0) ||
          (gs.wave3BeatWeaveTimer && gs.wave3BeatWeaveTimer > 0) ||
          context.playerDodging
        );

        if (enemy && !s.countered) {
          if (enemy.teleMat) enemy.teleMat.opacity = 0;
          enemy.targetImpactSongTime = null;
          enemy.attackCooldown = beatSec * 0.75;

          if (playerDodging) {
            // Player weaved on beat across the marker!
            if (enemy.isBoss) {
              const isBassDrop = s.attackType === 'bass_drop' || s.pattern === 'bass_drop';
              const isFinisherStep = s.comboStep === 2 || isBassDrop;
              if (isFinisherStep) {
                const reboundDmg = isBassDrop ? 28 : 26;
                if (typeof enemy.hp === 'number') {
                  enemy.hp = Math.max(0, enemy.hp - reboundDmg);
                }
                if (gs) {
                  gs.bossHp = Math.max(0, (gs.bossHp ?? 100) - reboundDmg);
                  gs.kronosRingState = gs.bossHp <= 0 ? 'ko' : 'counter_stun';
                  gs.kronosStateTimer = 0.85;
                  gs.counterBonusTimer = 1.6;
                  gs.bossCounterStunActive = true;
                  gs.bossAttackPattern = 'idle';
                }
                enemy.state = (enemy.hp !== undefined && enemy.hp <= 0) ? 'ko' : 'counter_stun';
                enemy.stateTimer = 0.85;
              } else {
                enemy.state = 'stalking';
                if (gs) gs.kronosRingState = 'stalking';
              }
            } else {
              enemy.state = 'dazed';
              enemy.isDazed = true;
              enemy.vulnerableToFinisher = true;
              enemy.stateTimer = 1.35;
            }
          } else {
            // Strike lands on player if within range
            const pPos = gs.playerPos || context.playerPos || { x: -0.46, y: 0, z: 1.68 };
            const ePos = (enemy.rig && enemy.rig.root && enemy.rig.root.position) || enemy.position || pPos;
            const hitDist = Math.hypot((ePos.x || 0) - (pPos.x || 0), (ePos.z || 0) - (pPos.z || 0));
            const maxReach = s.attackType === 'bass_drop' ? 6.5 : (enemy.isBoss ? 1.95 : 1.65);

            if (hitDist <= maxReach) {
              if (typeof context.onPlayerHit === 'function') {
                context.onPlayerHit(s.damage || 12, s, enemy);
              } else if (gs) {
                evaluatePlayerIncomingHit(gs, {
                  damage: s.damage || 12,
                  pattern: s.attackType
                }, context);
              }
            }
            enemy.state = 'stalking';
            if (enemy.isBoss && gs) {
              gs.kronosRingState = 'stalking';
              gs.bossAttackPattern = 'idle';
            }
          }
        }

        const resolvedRecord = {
          markerId: s.markerId,
          attackerId: s.attackerId,
          pattern: s.pattern,
          attackType: s.attackType,
          impactSongTime,
          markerTime: s.markerTime,
          offsetMs,
          evaded: playerDodging,
          countered: Boolean(s.countered)
        };
        state.resolvedStrikes.push(resolvedRecord);
        state.allResolvedStrikes.push(resolvedRecord);

        if (gs && Array.isArray(gs.enemyStrikeEvents)) {
          gs.enemyStrikeEvents.push({
            type: `${s.attackerId}_${s.pattern}`,
            songTime: impactSongTime,
            markerTime: s.markerTime,
            nearestBeatDeltaMs: offsetMs,
            onBeatMarker: offsetMs <= 20.0
          });
        }
      }
    }

    // 3. Resolve any pending scripted counter-ripostes when `songTime >= riposte.impactTime - dt * 0.5`
    for (let i = state.pendingRipostes.length - 1; i >= 0; i--) {
      const r = state.pendingRipostes[i];
      if (!r.resolved && songTime >= r.impactTime - dt * 0.5) {
        r.resolved = true;
        r.actualImpactTime = Number(songTime.toFixed(6));
        r.offsetMs = Number((Math.abs(songTime - r.impactTime) * 1000).toFixed(2));
      }
    }

    // 4. Light up dodge button (`#btn-a`) in DOM during the perfect/counter window
    if (typeof document !== 'undefined') {
      for (const id of ['btn-f', 'btn-a']) {
        const btn = document.getElementById(id);
        if (btn && btn.classList) {
          btn.classList.toggle('counter-window-active', anyInCounterWindow);
          btn.classList.toggle('perfect-counter-ready', anyInPerfectWindow);
        }
      }
    }

    state.lastSongTime = songTime;
    const cleanedScheduled = state.scheduledStrikes.map(cleanScheduledStrike);
    const activeMarker = cleanedScheduled.length > 0 ? cleanedScheduled[0] : null;
    const activeAttacks = cleanedScheduled.map((s) => ({
      enemyId: s.attackerId,
      moveId: s.pattern,
      impactTime: s.markerTime,
      phase: s.inPerfectWindow ? 'flash' : (s.inCounterWindow ? 'counter' : 'windup')
    }));
    const counterWindows = cleanedScheduled.map((s) => ({
      enemyId: s.attackerId,
      windowStart: Number((s.markerTime - s.counterWindowSec).toFixed(6)),
      windowEnd: Number((s.markerTime + s.counterWindowSec).toFixed(6)),
      perfectWindowStart: Number((s.markerTime - s.perfectWindowSec).toFixed(6)),
      perfectWindowEnd: Number((s.markerTime + s.perfectWindowSec).toFixed(6))
    }));

    return {
      activeMarker,
      scheduledStrikes: cleanedScheduled,
      resolvedStrikes: state.resolvedStrikes.slice(),
      activeAttacks,
      counterWindows,
      scheduledTelegraphs: cleanedScheduled,
      takedownTokens: state.takedownTokens,
      feverMeter: Number(state.feverMeter.toFixed(2))
    };
  }

  function cleanScheduledStrike(s) {
    return {
      markerId: s.markerId,
      attackerId: s.attackerId,
      pattern: s.pattern,
      attackType: s.attackType,
      windupStart: s.windupStart,
      markerTime: s.markerTime,
      playRate: s.playRate,
      counterSubdivision: s.counterSubdivision || 0.5,
      subDivSec: s.subDivSec,
      counterWindowSec: s.counterWindowSec,
      perfectWindowSec: s.perfectWindowSec,
      beatPhase: s.beatPhase,
      inCounterWindow: s.inCounterWindow,
      inPerfectWindow: s.inPerfectWindow,
      promptGreyedOut: s.promptGreyedOut
    };
  }

  function getDirectorTelemetry() {
    const offsets = state.allResolvedStrikes
      .map((r) => r.offsetMs)
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => a - b);

    return {
      totalResolvedStrikes: state.allResolvedStrikes.length,
      outsideMarkerStrikes: state.outsideMarkerStrikes,
      offsetP50Ms: percentile(offsets, 50),
      offsetP95Ms: percentile(offsets, 95),
      offsetMaxMs: offsets.length > 0 ? offsets[offsets.length - 1] : 0,
      takedownTokens: state.takedownTokens,
      takedownProgress: Number(state.takedownProgress.toFixed(2)),
      feverMeter: Number(state.feverMeter.toFixed(2)),
      feverActive: state.feverActive,
      counterEventsCount: state.counterEvents.length,
      ripostesResolvedCount: state.pendingRipostes.filter((r) => r.resolved).length,
      resolvedStrikes: state.allResolvedStrikes.slice(),
      counterEvents: state.counterEvents.slice()
    };
  }

  return {
    tick,
    reset,
    evaluateCounterInput,
    grantTakedownTokenProgress,
    consumeTakedownToken,
    grantFeverProgress,
    getDirectorTelemetry,
    state
  };
}

// Singleton default director used by top-level module exports (`CONTRACTS.md` Section 2.3)
const _defaultDirector = createCombatDirector();

/**
 * Per-frame enemy & boss combat director tick driven by `songTime` (`CONTRACTS.md` Section 2.3).
 *
 * @param {number|null} songTime - Current master clock time from `clock.now()`
 * @param {number} [dt=0.016] - Frame delta in seconds
 * @param {Object} [context] - Runtime state & rig references
 */
export function tick(songTime, dt = 0.016, context = undefined) {
  return _defaultDirector.tick(songTime, dt, context);
}

export function evaluateCounterInput(songTime, action = 'dodge', context = undefined) {
  return _defaultDirector.evaluateCounterInput(songTime, action, context);
}

export function grantTakedownTokenProgress(amount = 0.35, reason = 'hit') {
  return _defaultDirector.grantTakedownTokenProgress(amount, reason);
}

export function consumeTakedownToken(targetEnemy = null, context = undefined) {
  return _defaultDirector.consumeTakedownToken(targetEnemy, context);
}

export function grantFeverProgress(amount = 8.0, reason = 'hit') {
  return _defaultDirector.grantFeverProgress(amount, reason);
}

export function getDirectorTelemetry() {
  return _defaultDirector.getDirectorTelemetry();
}

export function resetDirector(options = {}) {
  return _defaultDirector.reset(options);
}
