// Tape No. 09: Harmonic Lock — Deterministic 60fps Synesthetic Rail-Shooter Simulation
// 8-Slot Paint-Lock Sweep, 16th-Note Quantized Homing Salvos, Star Fox Barrel-Roll Deflection,
// 3-Stage Form Evolution, Overdrive Resonance Wave & 4-Area + 3-Phase SERAPH-IX Boss Campaign.
// Pure deterministic ES module (zero DOM / Three.js dependencies).

const DEFAULT_SEED = 12409;

const BASE_CORRIDOR_SPEED = 52;
const SURGE_CORRIDOR_SPEED = 78;
const OVERDRIVE_MIN_SPEED = 64;
const TITLE_COAST_SPEED = 34;
const ENDGAME_COAST_SPEED = 22;

const PLAYER_MAX_X = 8.5;
const PLAYER_MAX_Y = 5.0;
const PLAYER_DODGE_SPEED_X = 16.5;
const PLAYER_DODGE_SPEED_Y = 12.5;
const PLAYER_MAX_SHIELDS = 3;

const MAX_LOCK_SLOTS = 8;
const LOCK_RADIUS_NDC = 0.165;
const MIN_LOCK_SPACING_SEC = 0.055;

const BARREL_ROLL_DURATION = 0.55;
const BARREL_ROLL_COOLDOWN = 1.15;
const BARREL_ROLL_DEFLECT_RADIUS_XY = 3.85;
const BARREL_ROLL_DEFLECT_DIST_AHEAD = 9.8;
const BARREL_ROLL_DEFLECT_DIST_BEHIND = 2.6;

const PLAYER_HIT_INVULN_DURATION = 0.65;
const OVERDRIVE_DURATION = 3.0;
const VULCAN_COOLDOWN = 0.10;

const CHAIN_FACTORS = Object.freeze([
  1.0, // 0 (unused fallback)
  1.0, // 1 lock
  1.3, // 2 locks
  1.6, // 3 locks
  2.0, // 4 locks
  2.4, // 5 locks
  2.8, // 6 locks
  3.3, // 7 locks
  4.0  // 8 locks — FULL HARMONIC OCTET
]);

const FORM_NAMES = Object.freeze({
  1: 'VECTOR DART',
  2: 'HARMONIC VALKYRIE',
  3: 'SYNESTHETIC SERAPH'
});

const AREA_DEFINITIONS = Object.freeze([
  {
    index: 0,
    name: 'PHOSPHOR LATTICE',
    startTime: 0,
    endTime: 32
  },
  {
    index: 1,
    name: 'FOURIER CATHEDRAL',
    startTime: 32,
    endTime: 66
  },
  {
    index: 2,
    name: 'SUBSPACE CONDUIT',
    startTime: 66,
    endTime: 100
  },
  {
    index: 3,
    name: 'SINGULARITY CORE',
    startTime: 100,
    endTime: Infinity
  }
]);

const ENEMY_SPECS = Object.freeze({
  bit: {
    type: 'bit',
    hp: 1,
    maxLocks: 1,
    radius: 1.25,
    ndcBonus: 0.01,
    points: 200,
    paceRatio: 0.83
  },
  weaver: {
    type: 'weaver',
    hp: 2,
    maxLocks: 2,
    radius: 1.55,
    ndcBonus: 0.015,
    points: 420,
    paceRatio: 0.85
  },
  prism: {
    type: 'prism',
    hp: 4,
    maxLocks: 4,
    radius: 2.2,
    ndcBonus: 0.025,
    points: 900,
    paceRatio: 0.90
  },
  mine: {
    type: 'mine',
    hp: 1,
    maxLocks: 1,
    radius: 1.35,
    ndcBonus: 0.015,
    points: 260,
    paceRatio: 0.74
  },
  cube: {
    type: 'cube',
    hp: 1,
    maxLocks: 1,
    radius: 1.45,
    ndcBonus: 0.025,
    points: 500,
    paceRatio: 0.80
  }
});

// Boss SERAPH-IX phase totals: Phase 1 (4x2 = 8) + Phase 2 (4x3 = 12) + Phase 3 (16) = 36
const BOSS_PHASE_1_NODE_HP = 2;
const BOSS_PHASE_2_NODE_HP = 3;
const BOSS_PHASE_3_CORE_HP = 16;
const BOSS_TOTAL_MAX_HP = 4 * BOSS_PHASE_1_NODE_HP + 4 * BOSS_PHASE_2_NODE_HP + BOSS_PHASE_3_CORE_HP;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function finiteOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function createMulberry32(seed) {
  let a = seed >>> 0;
  return function nextRand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createHarmonicCombat(options = {}) {
  const baseSeed = Number.isInteger(options.seed) ? options.seed : DEFAULT_SEED;
  let rand = createMulberry32(baseSeed);

  let nextEnemySeq = 1;
  let nextBoltSeq = 1;
  let nextSalvoSeq = 1;
  let nextVulcanSeq = 1;

  let stepEvents = [];
  let lastLockAcquiredAt = -Infinity;
  let vulcanCooldownTimer = 0;
  let areaTransitionTimer = 0;
  let overdriveTimer = 0;
  let overdrivePulseTimer = 0;
  let waveCursor = 0;
  let refillCooldown = 0;

  let quantizedHits = 0;
  let totalShots = 0;

  let state = null;

  const api = {
    reset,
    startRun,
    setAreaForTest,
    beginLockSweep,
    sweepTargets,
    releaseLockSalvo,
    fireVulcan,
    triggerBarrelRoll,
    triggerOverdrive,
    onEvent: typeof options.onEvent === 'function' ? options.onEvent : null,
    getState,
    step
  };

  function emitEvent(ev) {
    stepEvents.push(ev);
    if (typeof api.onEvent === 'function') {
      api.onEvent(ev);
    }
  }

  function computeRank(syncPct, score, fullLocks, phase) {
    if (phase === 'defeat') {
      if (syncPct >= 85 && score >= 6000) return 'B';
      return 'C';
    }
    if (syncPct >= 90 && (fullLocks >= 1 || score >= 4500)) return 'S';
    if (syncPct >= 82) return 'A';
    if (syncPct >= 68) return 'B';
    return 'C';
  }

  function refreshSyncAndRank() {
    if (totalShots <= 0) {
      state.syncPercent = 100;
    } else {
      const ratio = clamp(quantizedHits / totalShots, 0, 1);
      state.syncPercent = round1(ratio * 100);
    }
    state.rank = computeRank(state.syncPercent, state.score, state.fullLocksCount, state.phase);
  }

  function createFreshState(phase) {
    return {
      phase,
      areaIndex: 0,
      areaName: AREA_DEFINITIONS[0].name,
      areaTime: 0,
      runTime: 0,
      score: 0,
      chain: 0,
      maxChain: 0,
      fullLocksCount: 0,
      syncPercent: 100,
      rank: 'S',
      corridorDist: 0,
      corridorSpeed: BASE_CORRIDOR_SPEED,
      areaTransitionTimer: 0,
      overdriveTimer: 0,
      reticle: { x: 0, y: 0 },
      isLocking: false,
      locks: [],
      pendingSalvos: [],
      vulcanPulses: [],
      player: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rollBank: 0,
        evolutionStage: 1,
        formName: FORM_NAMES[1],
        shields: PLAYER_MAX_SHIELDS,
        maxShields: PLAYER_MAX_SHIELDS,
        evolutionProgress: 0,
        barrelRollTimer: 0,
        barrelRollCooldown: 0,
        invulnTimer: 0,
        overdrive: 100
      },
      enemies: [],
      enemyBolts: [],
      boss: null
    };
  }

  function resetInternalTimers() {
    rand = createMulberry32(baseSeed);
    nextEnemySeq = 1;
    nextBoltSeq = 1;
    nextSalvoSeq = 1;
    nextVulcanSeq = 1;
    stepEvents = [];
    lastLockAcquiredAt = -Infinity;
    vulcanCooldownTimer = 0;
    areaTransitionTimer = 0;
    overdriveTimer = 0;
    overdrivePulseTimer = 0;
    waveCursor = 0;
    refillCooldown = 0;
    quantizedHits = 0;
    totalShots = 0;
  }

  function reset() {
    resetInternalTimers();
    state = createFreshState('title');
    return getState();
  }

  function startRun() {
    resetInternalTimers();
    state = createFreshState('playing');
    spawnAreaWave(0, 0);
    emitEvent({
      type: 'area_changed',
      areaIndex: 0,
      areaName: state.areaName,
      evolutionStage: state.player.evolutionStage,
      corridorDist: state.corridorDist
    });
    return getState();
  }

  function spawnEnemy(opts) {
    const spec = ENEMY_SPECS[opts.type] || ENEMY_SPECS.bit;
    const dist = finiteOr(opts.dist, state.corridorDist + 52);
    const baseX = clamp(finiteOr(opts.x, 0), -PLAYER_MAX_X + 0.6, PLAYER_MAX_X - 0.6);
    const baseY = clamp(finiteOr(opts.y, 0), -PLAYER_MAX_Y + 0.6, PLAYER_MAX_Y - 0.6);
    const hp = Math.max(1, Math.round(finiteOr(opts.hp, spec.hp)));
    const maxLocks = Math.max(1, Math.round(finiteOr(opts.maxLocks, Math.max(spec.maxLocks, hp))));
    const enemy = {
      id: `${spec.type}-${nextEnemySeq++}`,
      type: spec.type,
      dist,
      baseX,
      baseY,
      x: baseX,
      y: baseY,
      offsetX: baseX,
      offsetY: baseY,
      hp,
      maxHp: hp,
      maxLocks,
      lockCount: 0,
      lockable: true,
      radius: spec.radius,
      ndcBonus: spec.ndcBonus,
      points: spec.points,
      paceRatio: finiteOr(opts.paceRatio, spec.paceRatio),
      motionKind: opts.motionKind || 'sine',
      ampX: finiteOr(opts.ampX, 0),
      ampY: finiteOr(opts.ampY, 0),
      freqX: finiteOr(opts.freqX, 1.4),
      freqY: finiteOr(opts.freqY, 1.1),
      phase: finiteOr(opts.phase, 0),
      age: 0,
      fireTimer: finiteOr(opts.fireDelay, spec.type === 'cube' || spec.type === 'mine' ? 9999 : 1.6 + rand() * 1.8),
      fireInterval: finiteOr(opts.fireInterval, spec.type === 'prism' ? 2.1 : 3.0),
      hitFlash: 0
    };
    updateEnemyMotion(enemy);
    state.enemies.push(enemy);
    return enemy;
  }

  function updateEnemyMotion(e) {
    let ox = e.baseX;
    let oy = e.baseY;
    const t = e.age;
    if (e.motionKind === 'sine') {
      ox = e.baseX + Math.sin(t * e.freqX + e.phase) * e.ampX;
      oy = e.baseY + Math.cos(t * e.freqY + e.phase * 0.8) * e.ampY;
    } else if (e.motionKind === 'helix') {
      ox = e.baseX + Math.cos(t * e.freqX + e.phase) * e.ampX;
      oy = e.baseY + Math.sin(t * e.freqX + e.phase) * e.ampY;
    } else if (e.motionKind === 'lissajous') {
      ox = e.baseX + Math.sin(t * e.freqX + e.phase) * e.ampX;
      oy = e.baseY + Math.sin(t * e.freqY * 1.5 + e.phase) * e.ampY;
    }
    e.x = clamp(ox, -PLAYER_MAX_X + 0.4, PLAYER_MAX_X - 0.4);
    e.y = clamp(oy, -PLAYER_MAX_Y + 0.4, PLAYER_MAX_Y - 0.4);
    e.offsetX = e.x;
    e.offsetY = e.y;
  }

  function spawnEnemyBolt(srcDist, srcX, srcY, targetX, targetY, closingSpeed = 46) {
    const safeDist = Math.max(state.corridorDist + 6, finiteOr(srcDist, state.corridorDist + 44));
    const sx = finiteOr(srcX, 0);
    const sy = finiteOr(srcY, 0);
    const tx = clamp(finiteOr(targetX, state.player.x), -PLAYER_MAX_X, PLAYER_MAX_X);
    const ty = clamp(finiteOr(targetY, state.player.y), -PLAYER_MAX_Y, PLAYER_MAX_Y);
    const cSpeed = clamp(finiteOr(closingSpeed, 46), 24, 72);
    const eta = Math.max(0.18, (safeDist - state.corridorDist) / cSpeed);

    const bolt = {
      id: `bolt-${nextBoltSeq++}`,
      dist: safeDist,
      x: sx,
      y: sy,
      offsetX: sx,
      offsetY: sy,
      vx: (tx - sx) / eta,
      vy: (ty - sy) / eta,
      closingSpeed: cSpeed,
      radius: 1.15,
      age: 0
    };
    state.enemyBolts.push(bolt);
    return bolt;
  }

  // --- 4-Area Wave Formations ---
  const AREA_WAVE_TIMES = Object.freeze([
    [0.0, 6.5, 13.0, 19.5, 25.5], // Area 0 (0..32s)
    [0.0, 7.0, 14.0, 21.0, 27.5], // Area 1 (32..66s)
    [0.0, 7.5, 14.5, 21.5, 28.0], // Area 2 (66..100s)
    [0.0]                         // Area 3 (100s+ Boss SERAPH-IX)
  ]);

  function spawnAreaWave(areaIdx, waveIdx) {
    const d0 = state.corridorDist;

    if (areaIdx === 0) {
      // PHOSPHOR LATTICE — graceful 'bit' sine-ribbons & 'cube' evolution pickups
      if (waveIdx === 0) {
        for (let i = 0; i < 8; i++) {
          spawnEnemy({
            type: 'bit',
            dist: d0 + 36 + i * 3.4,
            x: (i - 3.5) * 1.1,
            y: Math.sin(i * 0.7) * 1.4,
            motionKind: 'sine',
            ampX: 3.2,
            ampY: 1.5,
            freqX: 1.35,
            freqY: 1.05,
            phase: i * 0.55,
            fireDelay: i === 0 ? 0.55 : 2.2 + i * 0.45
          });
        }
        spawnEnemy({
          type: 'cube',
          dist: d0 + 44,
          x: 0.0,
          y: 1.4,
          motionKind: 'sine',
          ampX: 1.8,
          ampY: 0.8,
          freqX: 0.9,
          phase: 0
        });
      } else if (waveIdx === 1) {
        for (let i = 0; i < 8; i++) {
          const side = i < 4 ? -1 : 1;
          const idx = i % 4;
          spawnEnemy({
            type: 'bit',
            dist: d0 + 42 + idx * 4.2,
            x: side * 3.6,
            y: (idx - 1.5) * 1.2,
            motionKind: 'sine',
            ampX: 2.6,
            ampY: 1.4,
            freqX: 1.5,
            phase: idx * 0.6 + (side > 0 ? Math.PI : 0),
            fireDelay: 1.2 + idx * 0.5
          });
        }
      } else if (waveIdx === 2) {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          spawnEnemy({
            type: 'bit',
            dist: d0 + 46 + (i % 2) * 3.5,
            x: Math.cos(ang) * 3.8,
            y: Math.sin(ang) * 2.4,
            motionKind: 'helix',
            ampX: 1.6,
            ampY: 1.2,
            freqX: 1.3,
            phase: ang,
            fireDelay: 1.4 + i * 0.4
          });
        }
        spawnEnemy({
          type: 'cube',
          dist: d0 + 48,
          x: 0,
          y: 0,
          motionKind: 'sine',
          ampX: 1.2,
          ampY: 0.8,
          freqX: 1.0
        });
      } else if (waveIdx === 3) {
        for (let i = 0; i < 8; i++) {
          spawnEnemy({
            type: 'bit',
            dist: d0 + 40 + i * 3.2,
            x: -4.9 + i * 1.4,
            y: -2.1 + i * 0.6,
            motionKind: 'sine',
            ampX: 1.8,
            ampY: 1.1,
            freqX: 1.4,
            phase: i * 0.45,
            fireDelay: 1.3 + i * 0.4
          });
        }
        spawnEnemy({ type: 'mine', dist: d0 + 48, x: -4.2, y: 1.8, motionKind: 'sine', ampX: 0.6, ampY: 0.4 });
        spawnEnemy({ type: 'mine', dist: d0 + 52, x: 4.2, y: -1.8, motionKind: 'sine', ampX: 0.6, ampY: 0.4 });
      } else {
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          spawnEnemy({
            type: 'bit',
            dist: d0 + 42 + i * 2.5,
            x: Math.cos(ang) * 3.4,
            y: Math.sin(ang) * 2.2,
            motionKind: 'helix',
            ampX: 2.0,
            ampY: 1.4,
            freqX: 1.6,
            phase: ang
          });
        }
        spawnEnemy({ type: 'cube', dist: d0 + 50, x: 1.2, y: -1.0, motionKind: 'sine', ampX: 1.5, ampY: 0.8 });
      }
      return;
    }

    if (areaIdx === 1) {
      // FOURIER CATHEDRAL — spiraling 'weaver' double-helix formations & 'mine' clusters
      if (waveIdx === 0) {
        for (let i = 0; i < 4; i++) {
          const strand = i % 2 === 0 ? 0 : Math.PI;
          spawnEnemy({
            type: 'weaver',
            dist: d0 + 40 + i * 4.8,
            x: 0,
            y: 0,
            motionKind: 'helix',
            ampX: 4.2,
            ampY: 2.5,
            freqX: 1.45,
            phase: strand + i * 0.65,
            fireDelay: 0.8 + i * 0.55
          });
        }
        spawnEnemy({ type: 'mine', dist: d0 + 44, x: -2.6, y: 0.6, motionKind: 'sine', ampX: 0.5, ampY: 0.5 });
        spawnEnemy({ type: 'mine', dist: d0 + 50, x: 2.6, y: -0.6, motionKind: 'sine', ampX: 0.5, ampY: 0.5 });
        spawnEnemy({ type: 'cube', dist: d0 + 47, x: 0, y: 1.8, motionKind: 'sine', ampX: 1.4, ampY: 0.7 });
      } else if (waveIdx === 1) {
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2;
          spawnEnemy({
            type: 'mine',
            dist: d0 + 44 + i * 3,
            x: Math.cos(ang) * 2.5,
            y: Math.sin(ang) * 1.8,
            motionKind: 'sine',
            ampX: 0.4,
            ampY: 0.4
          });
        }
        for (let i = 0; i < 2; i++) {
          spawnEnemy({
            type: 'weaver',
            dist: d0 + 48 + i * 5,
            x: i === 0 ? -3.8 : 3.8,
            y: 0,
            motionKind: 'lissajous',
            ampX: 2.2,
            ampY: 2.0,
            freqX: 1.3,
            freqY: 1.1,
            phase: i * Math.PI,
            fireDelay: 1.1 + i * 0.6
          });
        }
        for (let i = 0; i < 4; i++) {
          spawnEnemy({
            type: 'bit',
            dist: d0 + 42 + i * 3.5,
            x: (i - 1.5) * 2.2,
            y: 2.2 * (i % 2 === 0 ? 1 : -1),
            motionKind: 'sine',
            ampX: 1.8,
            ampY: 0.9,
            phase: i * 0.8
          });
        }
      } else if (waveIdx === 2) {
        for (let i = 0; i < 4; i++) {
          spawnEnemy({
            type: 'weaver',
            dist: d0 + 42 + i * 4.5,
            x: 0,
            y: 0,
            motionKind: 'lissajous',
            ampX: 4.6,
            ampY: 2.7,
            freqX: 1.25,
            freqY: 1.0,
            phase: i * 0.85,
            fireDelay: 1.0 + i * 0.5
          });
        }
        spawnEnemy({ type: 'cube', dist: d0 + 50, x: 0, y: -1.4, motionKind: 'sine', ampX: 1.5, ampY: 0.8 });
      } else if (waveIdx === 3) {
        const mineCoords = [[-3.4, -1.6], [3.4, -1.6], [-3.4, 1.6], [3.4, 1.6]];
        for (let i = 0; i < mineCoords.length; i++) {
          spawnEnemy({
            type: 'mine',
            dist: d0 + 43 + (i % 2) * 4,
            x: mineCoords[i][0],
            y: mineCoords[i][1],
            motionKind: 'sine',
            ampX: 0.5,
            ampY: 0.5
          });
        }
        for (let i = 0; i < 6; i++) {
          spawnEnemy({
            type: 'bit',
            dist: d0 + 40 + i * 3.2,
            x: 0,
            y: 0,
            motionKind: 'helix',
            ampX: 2.2,
            ampY: 1.5,
            freqX: 1.7,
            phase: i * 0.7
          });
        }
      } else {
        for (let i = 0; i < 4; i++) {
          spawnEnemy({
            type: 'weaver',
            dist: d0 + 42 + i * 4.2,
            x: (i - 1.5) * 2.0,
            y: 0,
            motionKind: 'helix',
            ampX: 2.4,
            ampY: 2.0,
            freqX: 1.5,
            phase: i * 1.1,
            fireDelay: 1.0 + i * 0.45
          });
        }
      }
      return;
    }

    if (areaIdx === 2) {
      // SUBSPACE CONDUIT — armored 'prism' multi-lock cruisers + high-speed swarmers
      if (waveIdx === 0) {
        spawnEnemy({
          type: 'prism',
          dist: d0 + 44,
          x: -3.2,
          y: 0.8,
          motionKind: 'sine',
          ampX: 1.5,
          ampY: 1.0,
          freqX: 0.85,
          phase: 0,
          fireDelay: 0.9
        });
        spawnEnemy({
          type: 'prism',
          dist: d0 + 48,
          x: 3.2,
          y: -0.8,
          motionKind: 'sine',
          ampX: 1.5,
          ampY: 1.0,
          freqX: 0.85,
          phase: Math.PI,
          fireDelay: 1.35
        });
        for (let i = 0; i < 4; i++) {
          spawnEnemy({
            type: 'bit',
            dist: d0 + 38 + i * 3.5,
            x: 0,
            y: 0,
            paceRatio: 0.78,
            motionKind: 'helix',
            ampX: 4.8,
            ampY: 2.8,
            freqX: 2.1,
            phase: i * (Math.PI * 0.5)
          });
        }
        spawnEnemy({ type: 'cube', dist: d0 + 46, x: 0, y: 2.0, motionKind: 'sine', ampX: 1.2, ampY: 0.6 });
      } else if (waveIdx === 1) {
        for (let i = 0; i < 8; i++) {
          spawnEnemy({
            type: 'bit',
            dist: d0 + 38 + i * 2.6,
            x: 0,
            y: 0,
            paceRatio: 0.77,
            motionKind: 'helix',
            ampX: 4.6,
            ampY: 2.6,
            freqX: 2.2,
            phase: i * 0.65,
            fireDelay: 1.1 + i * 0.3
          });
        }
        for (let i = 0; i < 3; i++) {
          spawnEnemy({
            type: 'mine',
            dist: d0 + 45 + i * 4,
            x: (i - 1) * 2.8,
            y: 0,
            motionKind: 'sine',
            ampX: 0.6,
            ampY: 0.8
          });
        }
      } else if (waveIdx === 2) {
        spawnEnemy({
          type: 'prism',
          dist: d0 + 45,
          x: -2.8,
          y: -0.6,
          motionKind: 'sine',
          ampX: 1.8,
          ampY: 1.1,
          freqX: 0.9,
          fireDelay: 1.0
        });
        spawnEnemy({
          type: 'prism',
          dist: d0 + 49,
          x: 2.8,
          y: 0.6,
          motionKind: 'sine',
          ampX: 1.8,
          ampY: 1.1,
          freqX: 0.9,
          phase: Math.PI,
          fireDelay: 1.4
        });
        spawnEnemy({
          type: 'weaver',
          dist: d0 + 42,
          x: 0,
          y: 2.2,
          motionKind: 'sine',
          ampX: 3.2,
          ampY: 0.8,
          freqX: 1.5
        });
        spawnEnemy({ type: 'cube', dist: d0 + 52, x: 0, y: -1.8, motionKind: 'sine', ampX: 1.4, ampY: 0.6 });
      } else if (waveIdx === 3) {
        spawnEnemy({
          type: 'prism',
          dist: d0 + 46,
          x: 0,
          y: 0,
          motionKind: 'sine',
          ampX: 2.2,
          ampY: 1.2,
          freqX: 0.95,
          fireDelay: 0.95
        });
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
          spawnEnemy({
            type: 'mine',
            dist: d0 + 43,
            x: Math.cos(ang) * 4.2,
            y: Math.sin(ang) * 2.6,
            motionKind: 'sine',
            ampX: 0.4,
            ampY: 0.4
          });
        }
        for (let i = 0; i < 4; i++) {
          spawnEnemy({
            type: 'bit',
            dist: d0 + 39 + i * 3.0,
            x: (i - 1.5) * 2.4,
            y: (i % 2 === 0 ? 1 : -1) * 1.8,
            paceRatio: 0.78,
            motionKind: 'sine',
            ampX: 2.0,
            ampY: 1.2,
            freqX: 1.9
          });
        }
      } else {
        spawnEnemy({
          type: 'prism',
          dist: d0 + 44,
          x: -3.0,
          y: 0,
          motionKind: 'sine',
          ampX: 1.4,
          ampY: 1.2,
          freqX: 0.9,
          fireDelay: 1.0
        });
        spawnEnemy({
          type: 'prism',
          dist: d0 + 47,
          x: 3.0,
          y: 0,
          motionKind: 'sine',
          ampX: 1.4,
          ampY: 1.2,
          freqX: 0.9,
          phase: Math.PI,
          fireDelay: 1.3
        });
      }
      return;
    }

    if (areaIdx === 3) {
      // SINGULARITY CORE — Boss SERAPH-IX right ahead at corridorDist + 58m!
      spawnBossSeraphIX();
      spawnEnemy({
        type: 'cube',
        dist: d0 + 42,
        x: -2.4,
        y: 1.5,
        motionKind: 'sine',
        ampX: 1.2,
        ampY: 0.6,
        freqX: 1.0
      });
    }
  }

  function buildBossNodesForPhase(phase, bossDist, bossX, bossY, bossAge = 0) {
    if (phase === 1) {
      const nodes = [];
      for (let i = 0; i < 4; i++) {
        const angle = bossAge * 0.95 + (i / 4) * Math.PI * 2;
        const localX = Math.cos(angle) * 4.4;
        const localY = Math.sin(angle) * 3.1;
        const localDist = -2.0;
        nodes.push({
          id: `boss-p1-node-${i}`,
          index: i,
          kind: 'shield',
          phase: 1,
          hp: BOSS_PHASE_1_NODE_HP,
          maxHp: BOSS_PHASE_1_NODE_HP,
          maxLocks: BOSS_PHASE_1_NODE_HP,
          lockCount: 0,
          lockable: true,
          active: true,
          alive: true,
          angle,
          localDist,
          localX,
          localY,
          dist: bossDist + localDist,
          x: bossX + localX,
          y: bossY + localY,
          offsetX: bossX + localX,
          offsetY: bossY + localY,
          radius: 1.65,
          hitFlash: 0,
          telegraph: 0
        });
      }
      return nodes;
    }

    if (phase === 2) {
      const wingOffsets = [
        [-4.8, 2.2],
        [4.8, 2.2],
        [-4.4, -2.1],
        [4.4, -2.1]
      ];
      return wingOffsets.map((pair, i) => {
        const localX = pair[0];
        const localY = pair[1];
        const localDist = -1.2;
        return {
          id: `boss-p2-node-${i}`,
          index: i,
          kind: 'emitter',
          phase: 2,
          hp: BOSS_PHASE_2_NODE_HP,
          maxHp: BOSS_PHASE_2_NODE_HP,
          maxLocks: BOSS_PHASE_2_NODE_HP,
          lockCount: 0,
          lockable: true,
          active: true,
          alive: true,
          angle: (i / 4) * Math.PI * 2,
          localDist,
          localX,
          localY,
          dist: bossDist + localDist,
          x: bossX + localX,
          y: bossY + localY,
          offsetX: bossX + localX,
          offsetY: bossY + localY,
          radius: 1.75,
          hitFlash: 0,
          telegraph: 0
        };
      });
    }

    // Phase 3: Exposed Resonance Core (multi-lock up to all 8 slots at once!)
    return [
      {
        id: 'boss-core',
        index: 0,
        kind: 'core',
        phase: 3,
        hp: BOSS_PHASE_3_CORE_HP,
        maxHp: BOSS_PHASE_3_CORE_HP,
        maxLocks: MAX_LOCK_SLOTS,
        lockCount: 0,
        lockable: true,
        active: true,
        alive: true,
        angle: 0,
        localDist: -0.5,
        localX: 0,
        localY: 0,
        dist: bossDist - 0.5,
        x: bossX,
        y: bossY,
        offsetX: bossX,
        offsetY: bossY,
        radius: 2.8,
        hitFlash: 0,
        telegraph: 0
      }
    ];
  }

  function spawnBossSeraphIX() {
    const bossDist = state.corridorDist + 58;
    const nodes = buildBossNodesForPhase(1, bossDist, 0, 0, 0);
    state.boss = {
      id: 'boss-core',
      name: 'SERAPH-IX',
      phase: 1,
      hp: BOSS_TOTAL_MAX_HP,
      maxHp: BOSS_TOTAL_MAX_HP,
      phaseHp: 4 * BOSS_PHASE_1_NODE_HP,
      phaseMaxHp: 4 * BOSS_PHASE_1_NODE_HP,
      dist: bossDist,
      x: 0,
      y: 0,
      offsetX: 0,
      offsetY: 0,
      radius: 5.5,
      age: 0,
      attackTimer: 1.35,
      attackInterval: 1.95,
      ringStep: 0,
      cubeDropTimer: 14.0,
      hitFlash: 0,
      telegraph: 0,
      nodes
    };
  }

  function refreshBossTotals(boss) {
    if (!boss) return;
    let phaseHp = 0;
    let phaseMaxHp = 0;
    for (let i = 0; i < boss.nodes.length; i++) {
      const n = boss.nodes[i];
      phaseHp += Math.max(0, n.hp);
      phaseMaxHp += n.maxHp;
      const isAlive = n.hp > 0;
      n.lockable = isAlive;
      n.active = isAlive;
      n.alive = isAlive;
    }
    boss.phaseHp = phaseHp;
    boss.phaseMaxHp = phaseMaxHp;

    let futureStagesHp = 0;
    if (boss.phase === 1) {
      futureStagesHp = 4 * BOSS_PHASE_2_NODE_HP + BOSS_PHASE_3_CORE_HP;
    } else if (boss.phase === 2) {
      futureStagesHp = BOSS_PHASE_3_CORE_HP;
    }
    boss.hp = phaseHp + futureStagesHp;
  }

  function updateBossKinematics(dt) {
    const boss = state.boss;
    if (!boss) return;

    boss.age += dt;
    boss.hitFlash = Math.max(0, boss.hitFlash - dt * 3.2);

    const leadOffset = boss.phase === 3 ? 55 : 58;
    boss.dist = state.corridorDist + leadOffset + Math.sin(boss.age * 1.1) * 2.2;

    if (boss.phase === 1) {
      boss.x = Math.sin(boss.age * 0.72) * 2.4;
      boss.y = Math.cos(boss.age * 0.56) * 1.35;
    } else if (boss.phase === 2) {
      boss.x = Math.sin(boss.age * 0.92) * 3.4;
      boss.y = Math.sin(boss.age * 1.84) * 1.65;
    } else {
      boss.x = Math.sin(boss.age * 1.18) * 2.9;
      boss.y = Math.cos(boss.age * 0.88) * 1.7;
    }
    boss.offsetX = boss.x;
    boss.offsetY = boss.y;

    const telegraphRatio = clamp(1 - boss.attackTimer / Math.max(0.25, boss.attackInterval), 0, 1);
    boss.telegraph = telegraphRatio > 0.55 ? (telegraphRatio - 0.55) / 0.45 : 0;

    for (let i = 0; i < boss.nodes.length; i++) {
      const n = boss.nodes[i];
      n.hitFlash = Math.max(0, n.hitFlash - dt * 3.5);
      n.telegraph = n.hp > 0 ? boss.telegraph : 0;

      if (boss.phase === 1) {
        const angle = boss.age * 0.95 + (n.index / 4) * Math.PI * 2;
        n.angle = angle;
        n.localX = Math.cos(angle) * 4.4;
        n.localY = Math.sin(angle) * 3.1;
        n.localDist = -2.0;
      } else if (boss.phase === 2) {
        const baseX = n.index % 2 === 0 ? -4.7 : 4.7;
        const baseY = n.index < 2 ? 2.2 : -2.1;
        const breathe = Math.sin(boss.age * 2.6 + n.index * 0.9) * 0.45;
        n.localX = baseX + Math.sign(baseX) * breathe;
        n.localY = baseY + Math.sign(baseY) * breathe * 0.5;
        n.localDist = -1.2;
      } else {
        n.localX = 0;
        n.localY = 0;
        n.localDist = -0.5;
      }

      n.dist = boss.dist + n.localDist;
      n.x = clamp(boss.x + n.localX, -PLAYER_MAX_X + 0.3, PLAYER_MAX_X - 0.3);
      n.y = clamp(boss.y + n.localY, -PLAYER_MAX_Y + 0.3, PLAYER_MAX_Y - 0.3);
      n.offsetX = n.x;
      n.offsetY = n.y;
    }

    // Periodic recovery/evolution cube drop during Boss fight
    boss.cubeDropTimer -= dt;
    if (boss.cubeDropTimer <= 0) {
      boss.cubeDropTimer = 15.0;
      const hasCube = state.enemies.some((e) => e.type === 'cube');
      if (!hasCube) {
        spawnEnemy({
          type: 'cube',
          dist: state.corridorDist + 44,
          x: -state.player.x * 0.4,
          y: 1.2,
          motionKind: 'sine',
          ampX: 1.5,
          ampY: 0.7
        });
      }
    }

    // Boss rhythmic attacks
    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      if (boss.phase === 1) {
        boss.attackInterval = 1.95;
        boss.attackTimer = boss.attackInterval;
        const liveNodes = boss.nodes.filter((n) => n.hp > 0);
        if (liveNodes.length > 0) {
          const shooter = liveNodes[boss.ringStep % liveNodes.length];
          boss.ringStep += 1;
          spawnEnemyBolt(shooter.dist, shooter.x, shooter.y, state.player.x, state.player.y, 46);
        }
      } else if (boss.phase === 2) {
        // Phase 2: 4 Harmonic Wing-Emitters firing rhythmic plasma rings!
        boss.attackInterval = 1.85;
        boss.attackTimer = boss.attackInterval;
        const liveNodes = boss.nodes.filter((n) => n.hp > 0);
        const rot = boss.ringStep * 0.45;
        boss.ringStep += 1;
        for (let k = 0; k < liveNodes.length; k++) {
          const em = liveNodes[k];
          const ringAng = rot + (k / Math.max(1, liveNodes.length)) * Math.PI * 2;
          const aimX = k === 0 ? state.player.x : state.player.x * 0.55 + Math.cos(ringAng) * 2.8;
          const aimY = k === 0 ? state.player.y : state.player.y * 0.55 + Math.sin(ringAng) * 1.9;
          spawnEnemyBolt(em.dist, em.x, em.y, aimX, aimY, 48);
        }
      } else {
        // Phase 3: Singularity Core spiral plasma bursts
        boss.attackInterval = 1.45;
        boss.attackTimer = boss.attackInterval;
        const baseAng = boss.ringStep * 0.78;
        boss.ringStep += 1;
        spawnEnemyBolt(boss.dist, boss.x, boss.y, state.player.x, state.player.y, 50);
        for (let k = 0; k < 2; k++) {
          const ang = baseAng + k * Math.PI;
          spawnEnemyBolt(
            boss.dist,
            boss.x + Math.cos(ang) * 1.6,
            boss.y + Math.sin(ang) * 1.2,
            state.player.x + Math.cos(ang) * 2.9,
            state.player.y + Math.sin(ang) * 1.8,
            48
          );
        }
      }
    }
  }

  function transitionToArea(areaIdx) {
    const clampedIdx = clamp(Math.floor(finiteOr(areaIdx, 0)), 0, 3);
    const def = AREA_DEFINITIONS[clampedIdx];
    state.areaIndex = clampedIdx;
    state.areaName = def.name;
    state.areaTime = 0;
    waveCursor = 1; // wave 0 spawns immediately below
    refillCooldown = 3.0;
    areaTransitionTimer = 2.6;
    state.areaTransitionTimer = areaTransitionTimer;
    state.corridorSpeed = SURGE_CORRIDOR_SPEED;

    spawnAreaWave(clampedIdx, 0);

    emitEvent({
      type: 'area_changed',
      areaIndex: clampedIdx,
      areaName: state.areaName,
      evolutionStage: state.player.evolutionStage,
      corridorDist: state.corridorDist
    });
  }

  function setAreaForTest(areaIndex) {
    const clampedIdx = clamp(Math.floor(finiteOr(areaIndex, 0)), 0, 3);
    if (state.phase !== 'playing') {
      state.phase = 'playing';
      state.player.shields = Math.max(1, state.player.shields);
    }

    // Clear stale entities from prior area so jumped-to area is clean and immediate
    state.isLocking = false;
    state.locks = [];
    state.pendingSalvos = [];
    state.vulcanPulses = [];
    state.enemies = [];
    state.enemyBolts = [];
    state.boss = null;
    state.runTime = AREA_DEFINITIONS[clampedIdx].startTime;

    transitionToArea(clampedIdx);
    return getState();
  }

  // --- Target Lookup & Lock Counting ---
  function findLockableTargetById(targetId) {
    if (typeof targetId !== 'string' || !targetId) return null;

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.id === targetId && e.hp > 0 && e.dist >= state.corridorDist - 2) {
        return { kind: 'enemy', entity: e };
      }
    }

    if (state.boss) {
      const nodes = state.boss.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.id === targetId && n.hp > 0) {
          return { kind: 'boss_node', entity: n };
        }
      }
      // Resilient alias support in case external projections use 'boss', 'seraph-ix', or 'boss-node-N'
      if (
        (targetId === 'boss' || targetId === 'seraph-ix' || targetId === 'SERAPH-IX' || targetId === 'boss-core') &&
        state.boss.phase === 3 &&
        nodes[0] &&
        nodes[0].hp > 0
      ) {
        return { kind: 'boss_node', entity: nodes[0] };
      }
      const matchIdx = /^(?:boss-node-|node-)(\d+)$/.exec(targetId);
      if (matchIdx) {
        const idx = Number(matchIdx[1]);
        if (nodes[idx] && nodes[idx].hp > 0) {
          return { kind: 'boss_node', entity: nodes[idx] };
        }
      }
    }

    return null;
  }

  function syncActiveLockCounts() {
    for (let i = 0; i < state.enemies.length; i++) {
      state.enemies[i].lockCount = 0;
    }
    if (state.boss) {
      for (let i = 0; i < state.boss.nodes.length; i++) {
        state.boss.nodes[i].lockCount = 0;
      }
    }

    const validLocks = [];
    for (let i = 0; i < state.locks.length; i++) {
      const lk = state.locks[i];
      const found = findLockableTargetById(lk.targetId);
      if (found) {
        found.entity.lockCount += 1;
        lk.dist = found.entity.dist;
        lk.x = found.entity.x;
        lk.y = found.entity.y;
        lk.offsetX = found.entity.x;
        lk.offsetY = found.entity.y;
        validLocks.push(lk);
      } else {
        // Keep earned lock slot coordinates frozen at last position so player never loses earned locks mid-sweep
        validLocks.push(lk);
      }
    }
    state.locks = validLocks;
  }

  // Fallback corridor-to-NDC projection matching harmonic-lock.js chase camera framing:
  // camera at corridorDist - 14.5, offset (player.x * 0.52, player.y * 0.52 + 1.8), FOV 62 deg
  function projectCorridorPointFallback(dist, x, y) {
    const camDist = state.corridorDist - 14.5;
    const dz = dist - camDist;
    if (dz <= 1.5) return null;
    const camX = state.player.x * 0.52;
    const camY = state.player.y * 0.52 + 1.2;
    const halfTanY = 0.60086; // tan(31 deg)
    const halfTanX = halfTanY * 1.6;
    const ndcX = (x - camX) / (dz * halfTanX);
    const ndcY = (y - camY) / (dz * halfTanY);
    return { ndcX, ndcY };
  }

  function buildFallbackProjections() {
    const list = [];
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0 || e.dist < state.corridorDist - 1) continue;
      const p = projectCorridorPointFallback(e.dist, e.x, e.y);
      if (p) {
        list.push({ id: e.id, ndcX: p.ndcX, ndcY: p.ndcY, lockable: true });
      }
    }
    if (state.boss) {
      for (let i = 0; i < state.boss.nodes.length; i++) {
        const n = state.boss.nodes[i];
        if (n.hp <= 0) continue;
        const p = projectCorridorPointFallback(n.dist, n.x, n.y);
        if (p) {
          list.push({ id: n.id, ndcX: p.ndcX, ndcY: p.ndcY, lockable: true });
        }
      }
    }
    return list;
  }

  // --- 8-Slot Paint-Lock Sweep & Quantized Homing Salvo ---
  function beginLockSweep() {
    if (state.phase !== 'playing') return false;
    if (!state.isLocking) {
      state.isLocking = true;
      if (state.locks.length === 0) {
        lastLockAcquiredAt = -Infinity;
      }
    }
    return true;
  }

  function sweepTargets(projectedTargets) {
    if (state.phase !== 'playing' || !state.isLocking) {
      return state.locks.map((l) => ({ ...l }));
    }
    if (state.locks.length >= MAX_LOCK_SLOTS) {
      return state.locks.map((l) => ({ ...l }));
    }

    // Enforce min 55ms spacing so rapid sweeps cascade 0 -> 7 musically (first slot locks immediately)
    if (state.locks.length > 0 && state.runTime - lastLockAcquiredAt < MIN_LOCK_SPACING_SEC - 1e-5) {
      return state.locks.map((l) => ({ ...l }));
    }

    syncActiveLockCounts();

    const projections =
      Array.isArray(projectedTargets) && projectedTargets.length > 0
        ? projectedTargets
        : buildFallbackProjections();

    const candidates = [];
    for (let i = 0; i < projections.length; i++) {
      const proj = projections[i];
      if (!proj || proj.lockable === false) continue;
      const nx = finiteOr(proj.ndcX, NaN);
      const ny = finiteOr(proj.ndcY, NaN);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) continue;

      const found = findLockableTargetById(proj.id);
      if (!found) continue;

      const entity = found.entity;
      const maxSlotsForTarget = Math.max(1, finiteOr(entity.maxLocks, entity.hp));
      if (entity.lockCount >= maxSlotsForTarget) continue;

      const bonusRadius =
        found.kind === 'boss_node'
          ? entity.kind === 'core'
            ? 0.055
            : 0.02
          : finiteOr(entity.ndcBonus, 0.01);
      const effectiveRadius = LOCK_RADIUS_NDC + bonusRadius;
      const distNdc = Math.hypot(nx - state.reticle.x, ny - state.reticle.y);

      if (distNdc <= effectiveRadius) {
        candidates.push({
          targetId: entity.id,
          entity,
          lockCount: entity.lockCount,
          distNdc
        });
      }
    }

    if (candidates.length === 0) {
      return state.locks.map((l) => ({ ...l }));
    }

    // Prioritize unlocked targets under reticle first, then closest to reticle center
    candidates.sort((a, b) => {
      if (a.lockCount !== b.lockCount) return a.lockCount - b.lockCount;
      return a.distNdc - b.distNdc;
    });

    const chosen = candidates[0];
    const slotIndex = state.locks.length;
    const lockEntry = {
      slotIndex,
      targetId: chosen.targetId,
      dist: chosen.entity.dist,
      x: chosen.entity.x,
      y: chosen.entity.y,
      offsetX: chosen.entity.x,
      offsetY: chosen.entity.y
    };

    state.locks.push(lockEntry);
    chosen.entity.lockCount += 1;
    lastLockAcquiredAt = state.runTime;

    emitEvent({
      type: 'lock_acquired',
      slotIndex,
      lockCount: state.locks.length,
      targetId: chosen.targetId,
      dist: chosen.entity.dist,
      x: chosen.entity.x,
      y: chosen.entity.y,
      offsetX: chosen.entity.x,
      offsetY: chosen.entity.y
    });

    return state.locks.map((l) => ({ ...l }));
  }

  function computeSyncCredit(quantizeDelaySec, lockCount) {
    // 124 BPM 16th-note = 0.12097s; closer to 16th boundary or higher harmonic lock count => 88%..100%
    const subdiv16 = 60 / 124 / 4;
    const d = clamp(finiteOr(quantizeDelaySec, 0.06), 0, subdiv16);
    const distToNearestGrid = Math.min(d, Math.abs(subdiv16 - d)); // 0 .. ~0.0605s
    const timingScore = 1 - clamp(distToNearestGrid / 0.061, 0, 1) * 0.12; // 0.88 .. 1.00
    const lockHarmonyBonus = ((lockCount - 1) / 7) * 0.08;
    return clamp(timingScore + lockHarmonyBonus, 0.88, 1.0);
  }

  function releaseLockSalvo(quantizeDelaySec = 0.06) {
    if (state.phase !== 'playing') {
      state.isLocking = false;
      return { kind: 'none', lockCount: 0, chainMultiplier: 1 };
    }

    state.isLocking = false;
    const qDelay = clamp(finiteOr(quantizeDelaySec, 0.06), 0, 0.35);

    if (state.locks.length === 0) {
      fireVulcan();
      return { kind: 'vulcan', lockCount: 0, chainMultiplier: 1 };
    }

    const locksSnapshot = state.locks.slice(0, MAX_LOCK_SLOTS);
    const lockCount = locksSnapshot.length;
    state.locks = [];
    syncActiveLockCounts();

    const chainMultiplier = CHAIN_FACTORS[lockCount] || 1.0;
    if (lockCount === MAX_LOCK_SLOTS) {
      state.fullLocksCount += 1;
      state.player.overdrive = clamp(state.player.overdrive + 8, 0, 100);
    }

    const syncWeight = computeSyncCredit(qDelay, lockCount);
    totalShots += lockCount;
    quantizedHits += syncWeight * lockCount;
    refreshSyncAndRank();

    const eventTargets = [];
    for (let i = 0; i < locksSnapshot.length; i++) {
      const lk = locksSnapshot[i];
      const slotIndex = lk.slotIndex;
      const found = findLockableTargetById(lk.targetId);
      const tDist = found ? found.entity.dist : lk.dist;
      const tX = found ? found.entity.x : lk.x;
      const tY = found ? found.entity.y : lk.y;

      const strikeDelay = Math.max(0.04, qDelay + slotIndex * 0.035);
      state.pendingSalvos.push({
        id: `salvo-${nextSalvoSeq++}`,
        slotIndex,
        lockCount,
        chainMultiplier,
        targetId: lk.targetId,
        timer: strikeDelay,
        totalDuration: strikeDelay,
        fallbackDist: tDist,
        fallbackX: tX,
        fallbackY: tY
      });

      eventTargets.push({
        slotIndex,
        targetId: lk.targetId,
        dist: tDist,
        x: tX,
        y: tY,
        offsetX: tX,
        offsetY: tY
      });
    }

    emitEvent({
      type: 'salvo_released',
      lockCount,
      isFullLock: lockCount === MAX_LOCK_SLOTS,
      chainMultiplier,
      quantizeDelaySec: qDelay,
      playerDist: state.corridorDist,
      playerX: state.player.x,
      playerY: state.player.y,
      targets: eventTargets
    });

    return { kind: 'salvo', lockCount, chainMultiplier };
  }

  function fireVulcan() {
    if (state.phase !== 'playing') return false;
    if (vulcanCooldownTimer > 0) return false;

    vulcanCooldownTimer = VULCAN_COOLDOWN;

    // Gentle magnetic aim assist onto any lockable target closely aligned under the reticle
    const fallbackProjs = buildFallbackProjections();
    let assistedTargetId = null;
    let bestDistNdc = 0.20;
    for (let i = 0; i < fallbackProjs.length; i++) {
      const p = fallbackProjs[i];
      const d = Math.hypot(p.ndcX - state.reticle.x, p.ndcY - state.reticle.y);
      if (d < bestDistNdc) {
        bestDistNdc = d;
        assistedTargetId = p.id;
      }
    }

    const aimDist = state.corridorDist + 58;
    let aimX = clamp(state.player.x * 0.52 + state.reticle.x * 16.0, -11, 11);
    let aimY = clamp(state.player.y * 0.52 + 1.2 + state.reticle.y * 10.0, -7.5, 7.5);

    if (assistedTargetId) {
      const found = findLockableTargetById(assistedTargetId);
      if (found) {
        aimX = found.entity.x;
        aimY = found.entity.y;
      }
    }

    const forwardRelSpeed = 210;
    const travelTime = Math.max(0.08, (aimDist - (state.corridorDist + 1.5)) / forwardRelSpeed);
    const startDist = state.corridorDist + 1.5;
    const startX = state.player.x;
    const startY = state.player.y;

    state.vulcanPulses.push({
      id: `vulcan-${nextVulcanSeq++}`,
      dist: startDist,
      x: startX,
      y: startY,
      offsetX: startX,
      offsetY: startY,
      vx: (aimX - startX) / travelTime,
      vy: (aimY - startY) / travelTime,
      forwardRelSpeed,
      targetId: assistedTargetId,
      ttl: 0.42
    });

    totalShots += 1;
    quantizedHits += 0.88;
    refreshSyncAndRank();

    emitEvent({
      type: 'vulcan_fired',
      playerDist: state.corridorDist,
      playerX: state.player.x,
      playerY: state.player.y,
      aimDist,
      aimX,
      aimY,
      reticleX: state.reticle.x,
      reticleY: state.reticle.y
    });

    return true;
  }

  // --- Barrel Roll & Overdrive ---
  function deflectNearbyBolts() {
    if (state.enemyBolts.length === 0) return 0;
    let deflectedCount = 0;
    const remaining = [];

    for (let i = 0; i < state.enemyBolts.length; i++) {
      const bolt = state.enemyBolts[i];
      const relDist = bolt.dist - state.corridorDist;
      const radialDist = Math.hypot(bolt.x - state.player.x, bolt.y - state.player.y);

      if (
        relDist >= -BARREL_ROLL_DEFLECT_DIST_BEHIND &&
        relDist <= BARREL_ROLL_DEFLECT_DIST_AHEAD &&
        radialDist <= BARREL_ROLL_DEFLECT_RADIUS_XY
      ) {
        deflectedCount += 1;
        state.score += 250;
        state.chain += 1;
        state.maxChain = Math.max(state.maxChain, state.chain);
        state.player.overdrive = clamp(state.player.overdrive + 8, 0, 100);
        refreshSyncAndRank();

        emitEvent({
          type: 'bolt_deflected',
          boltId: bolt.id,
          kind: 'deflect',
          points: 250,
          overdriveGain: 8,
          overdrive: state.player.overdrive,
          dist: bolt.dist,
          x: bolt.x,
          y: bolt.y,
          offsetX: bolt.x,
          offsetY: bolt.y
        });
      } else {
        remaining.push(bolt);
      }
    }

    state.enemyBolts = remaining;
    return deflectedCount;
  }

  function triggerBarrelRoll() {
    if (state.phase !== 'playing') return false;
    if (state.player.barrelRollCooldown > 0 || state.player.barrelRollTimer > 0) return false;

    state.player.barrelRollTimer = BARREL_ROLL_DURATION;
    state.player.barrelRollCooldown = BARREL_ROLL_COOLDOWN;

    emitEvent({
      type: 'barrel_roll',
      duration: BARREL_ROLL_DURATION,
      cooldown: BARREL_ROLL_COOLDOWN,
      dist: state.corridorDist,
      x: state.player.x,
      y: state.player.y,
      offsetX: state.player.x,
      offsetY: state.player.y
    });

    deflectNearbyBolts();
    return true;
  }

  function sweepOverdriveResonanceBurst(isInitialBurst) {
    let clearedCount = 0;

    // Clear all incoming enemy bolts in a harmonic flash
    if (state.enemyBolts.length > 0) {
      for (let i = 0; i < state.enemyBolts.length; i++) {
        const b = state.enemyBolts[i];
        state.score += 100;
        clearedCount += 1;
        emitEvent({
          type: 'bolt_deflected',
          boltId: b.id,
          kind: 'deflect',
          points: 100,
          overdriveGain: 0,
          overdrive: state.player.overdrive,
          dist: b.dist,
          x: b.x,
          y: b.y,
          offsetX: b.x,
          offsetY: b.y
        });
      }
      state.enemyBolts = [];
    }

    // Queue cascading resonance beams onto all visible corridor enemies
    let slotCounter = 0;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0 || e.dist < state.corridorDist - 2 || e.dist > state.corridorDist + 95) continue;
      const alreadyTargeted = state.pendingSalvos.filter((s) => s.targetId === e.id).length;
      const neededHits = Math.max(0, e.hp - alreadyTargeted);
      for (let h = 0; h < neededHits; h++) {
        const slotIndex = slotCounter % MAX_LOCK_SLOTS;
        state.pendingSalvos.push({
          id: `salvo-${nextSalvoSeq++}`,
          slotIndex,
          lockCount: MAX_LOCK_SLOTS,
          chainMultiplier: isInitialBurst ? 3.0 : 2.5,
          targetId: e.id,
          timer: 0.04 + slotCounter * 0.03,
          totalDuration: 0.04 + slotCounter * 0.03,
          fallbackDist: e.dist,
          fallbackX: e.x,
          fallbackY: e.y,
          fromOverdrive: true
        });
        slotCounter += 1;
        clearedCount += 1;
      }
    }

    // On initial Overdrive wave, also strike vulnerable Boss nodes with an 8-beam harmonic cascade
    if (isInitialBurst && state.boss) {
      const liveNodes = state.boss.nodes.filter((n) => n.hp > 0);
      if (liveNodes.length > 0) {
        const bossBurstCount = 8;
        for (let b = 0; b < bossBurstCount; b++) {
          const n = liveNodes[b % liveNodes.length];
          const slotIndex = b % MAX_LOCK_SLOTS;
          state.pendingSalvos.push({
            id: `salvo-${nextSalvoSeq++}`,
            slotIndex,
            lockCount: MAX_LOCK_SLOTS,
            chainMultiplier: 3.0,
            targetId: n.id,
            timer: 0.05 + b * 0.035,
            totalDuration: 0.05 + b * 0.035,
            fallbackDist: n.dist,
            fallbackX: n.x,
            fallbackY: n.y,
            fromOverdrive: true
          });
          clearedCount += 1;
        }
      }
    }

    return clearedCount;
  }

  function triggerOverdrive() {
    if (state.phase !== 'playing') return false;
    if (state.player.overdrive < 100) return false;

    state.player.overdrive = 0;
    state.isLocking = false;
    state.locks = [];
    syncActiveLockCounts();

    overdriveTimer = OVERDRIVE_DURATION;
    overdrivePulseTimer = 0.24;
    state.overdriveTimer = overdriveTimer;

    const clearedCount = sweepOverdriveResonanceBurst(true);
    totalShots += Math.max(1, clearedCount);
    quantizedHits += Math.max(1, clearedCount);
    refreshSyncAndRank();

    emitEvent({
      type: 'overdrive_triggered',
      kind: 'overdrive',
      duration: OVERDRIVE_DURATION,
      clearedCount,
      dist: state.corridorDist + 26,
      x: 0,
      y: 0,
      offsetX: 0,
      offsetY: 0,
      playerDist: state.corridorDist,
      playerX: state.player.x,
      playerY: state.player.y
    });

    return true;
  }

  // --- Evolution, Damage & Hit Resolution ---
  function addEvolutionProgress(amount) {
    const prevStage = state.player.evolutionStage;
    if (prevStage >= 3) {
      state.player.evolutionProgress = 1;
      return false;
    }

    state.player.evolutionProgress += amount;
    if (state.player.evolutionProgress >= 1.0 - 1e-6) {
      state.player.evolutionStage = Math.min(3, prevStage + 1);
      state.player.formName = FORM_NAMES[state.player.evolutionStage];
      state.player.shields = PLAYER_MAX_SHIELDS;
      state.player.evolutionProgress = state.player.evolutionStage >= 3 ? 1 : 0;

      emitEvent({
        type: 'evolution_changed',
        stage: state.player.evolutionStage,
        evolutionStage: state.player.evolutionStage,
        previousStage: prevStage,
        upgraded: true,
        formName: state.player.formName,
        shields: state.player.shields,
        areaIndex: state.areaIndex,
        dist: state.corridorDist,
        x: state.player.x,
        y: state.player.y,
        offsetX: state.player.x,
        offsetY: state.player.y
      });
      return true;
    }

    state.player.evolutionProgress = clamp(state.player.evolutionProgress, 0, 0.99);
    return false;
  }

  function collectEvolutionCube(cube, slotIndex = 0) {
    cube.hp = 0;
    cube.lockable = false;
    state.score += 500;
    state.chain += 1;
    state.maxChain = Math.max(state.maxChain, state.chain);
    if (overdriveTimer <= 0) {
      state.player.overdrive = clamp(state.player.overdrive + 12, 0, 100);
    }

    if (state.player.evolutionStage >= 3) {
      // At Form III, Evolution cubes restore a shield pip & grant bonus score
      state.player.shields = Math.min(PLAYER_MAX_SHIELDS, state.player.shields + 1);
      state.player.evolutionProgress = 1;
      state.score += 500;
    } else {
      addEvolutionProgress(1.0);
    }

    refreshSyncAndRank();

    emitEvent({
      type: 'target_destroyed',
      targetId: cube.id,
      enemyType: 'cube',
      kind: 'enemy',
      slotIndex: clamp(slotIndex, 0, 7),
      points: 500,
      chain: state.chain,
      dist: cube.dist,
      x: cube.x,
      y: cube.y,
      offsetX: cube.x,
      offsetY: cube.y
    });
  }

  function applyPlayerDamage() {
    if (state.phase !== 'playing') return;
    if (state.player.barrelRollTimer > 0 || state.player.invulnTimer > 0 || overdriveTimer > 0) return;

    state.player.shields -= 1;
    state.chain = 0;
    state.player.invulnTimer = PLAYER_HIT_INVULN_DURATION;

    if (state.player.shields <= 0) {
      if (state.player.evolutionStage > 1) {
        const prevStage = state.player.evolutionStage;
        state.player.evolutionStage -= 1;
        state.player.formName = FORM_NAMES[state.player.evolutionStage];
        state.player.shields = PLAYER_MAX_SHIELDS;
        state.player.evolutionProgress = 0;

        emitEvent({
          type: 'player_hit',
          damage: 1,
          shields: state.player.shields,
          evolutionStage: state.player.evolutionStage,
          steppedDown: true,
          dist: state.corridorDist,
          x: state.player.x,
          y: state.player.y,
          offsetX: state.player.x,
          offsetY: state.player.y
        });

        emitEvent({
          type: 'evolution_changed',
          stage: state.player.evolutionStage,
          evolutionStage: state.player.evolutionStage,
          previousStage: prevStage,
          upgraded: false,
          formName: state.player.formName,
          shields: state.player.shields,
          areaIndex: state.areaIndex,
          dist: state.corridorDist,
          x: state.player.x,
          y: state.player.y,
          offsetX: state.player.x,
          offsetY: state.player.y
        });
        return;
      }

      // Stage 1 and all 3 shield pips depleted => Defeat
      state.player.shields = 0;
      state.phase = 'defeat';
      state.isLocking = false;
      state.locks = [];
      state.pendingSalvos = [];
      state.vulcanPulses = [];
      refreshSyncAndRank();

      emitEvent({
        type: 'player_hit',
        damage: 1,
        shields: 0,
        evolutionStage: state.player.evolutionStage,
        steppedDown: false,
        dist: state.corridorDist,
        x: state.player.x,
        y: state.player.y,
        offsetX: state.player.x,
        offsetY: state.player.y
      });

      emitEvent({
        type: 'defeat',
        score: state.score,
        syncPercent: state.syncPercent,
        fullLocksCount: state.fullLocksCount,
        maxChain: state.maxChain,
        rank: state.rank,
        areaIndex: state.areaIndex,
        dist: state.corridorDist,
        x: state.player.x,
        y: state.player.y
      });
      return;
    }

    emitEvent({
      type: 'player_hit',
      damage: 1,
      shields: state.player.shields,
      evolutionStage: state.player.evolutionStage,
      steppedDown: false,
      dist: state.corridorDist,
      x: state.player.x,
      y: state.player.y,
      offsetX: state.player.x,
      offsetY: state.player.y
    });
  }

  function applyDamageToTarget(found, damage, chainMultiplier, slotIndex, fromOverdrive = false) {
    const safeSlot = clamp(Math.floor(finiteOr(slotIndex, 0)), 0, 7);

    if (found.kind === 'enemy') {
      const e = found.entity;
      if (e.hp <= 0) return;

      if (e.type === 'cube') {
        collectEvolutionCube(e, safeSlot);
        return;
      }

      e.hp = Math.max(0, e.hp - damage);
      e.hitFlash = 1.0;
      if (!fromOverdrive) {
        state.player.overdrive = clamp(state.player.overdrive + 3.5, 0, 100);
      }

      if (e.hp <= 0) {
        e.lockable = false;
        state.chain += 1;
        state.maxChain = Math.max(state.maxChain, state.chain);
        const stageBonus = 1 + (state.player.evolutionStage - 1) * 0.12;
        const awarded = Math.round(e.points * chainMultiplier * stageBonus);
        state.score += awarded;
        addEvolutionProgress(0.06);
        refreshSyncAndRank();

        emitEvent({
          type: 'target_destroyed',
          targetId: e.id,
          enemyType: e.type,
          kind: 'enemy',
          slotIndex: safeSlot,
          points: awarded,
          chain: state.chain,
          dist: e.dist,
          x: e.x,
          y: e.y,
          offsetX: e.x,
          offsetY: e.y
        });
      }
      return;
    }

    if (found.kind === 'boss_node' && state.boss) {
      const boss = state.boss;
      const node = found.entity;
      if (node.hp <= 0) return;

      node.hp = Math.max(0, node.hp - damage);
      node.hitFlash = 1.0;
      boss.hitFlash = 0.85;
      refreshBossTotals(boss);

      state.chain += 1;
      state.maxChain = Math.max(state.maxChain, state.chain);
      if (!fromOverdrive) {
        state.player.overdrive = clamp(state.player.overdrive + 4.0, 0, 100);
      }

      const hitPts = Math.round(220 * chainMultiplier);
      state.score += hitPts;
      refreshSyncAndRank();

      if (node.hp <= 0) {
        const allPhaseNodesDown = boss.nodes.every((n) => n.hp <= 0);
        const isFinalKill = boss.phase === 3 && allPhaseNodesDown;
        const destroyPts = Math.round((isFinalKill ? 8000 : 1200) * chainMultiplier);
        state.score += destroyPts;
        refreshSyncAndRank();

        const nodeDist = node.dist;
        const nodeX = node.x;
        const nodeY = node.y;

        emitEvent({
          type: 'boss_node_destroyed',
          targetId: node.id,
          nodeId: node.id,
          bossPhase: boss.phase,
          kind: isFinalKill ? 'boss' : 'node',
          slotIndex: safeSlot,
          points: destroyPts,
          chain: state.chain,
          dist: nodeDist,
          x: nodeX,
          y: nodeY,
          offsetX: nodeX,
          offsetY: nodeY
        });

        if (allPhaseNodesDown) {
          if (boss.phase === 1) {
            boss.phase = 2;
            boss.attackInterval = 1.85;
            boss.attackTimer = 1.25;
            boss.ringStep = 0;
            boss.nodes = buildBossNodesForPhase(2, boss.dist, boss.x, boss.y, boss.age);
            refreshBossTotals(boss);
            if (!fromOverdrive) {
              state.player.overdrive = clamp(state.player.overdrive + 20, 0, 100);
            }
            spawnEnemy({
              type: 'cube',
              dist: state.corridorDist + 42,
              x: 2.2,
              y: 1.2,
              motionKind: 'sine',
              ampX: 1.2,
              ampY: 0.6
            });
            emitEvent({
              type: 'boss_phase_changed',
              phase: 2,
              hp: boss.hp,
              maxHp: boss.maxHp,
              dist: boss.dist,
              x: boss.x,
              y: boss.y
            });
          } else if (boss.phase === 2) {
            boss.phase = 3;
            boss.attackInterval = 1.45;
            boss.attackTimer = 1.15;
            boss.ringStep = 0;
            boss.nodes = buildBossNodesForPhase(3, boss.dist, boss.x, boss.y, boss.age);
            refreshBossTotals(boss);
            if (!fromOverdrive) {
              state.player.overdrive = clamp(state.player.overdrive + 25, 0, 100);
            }
            emitEvent({
              type: 'boss_phase_changed',
              phase: 3,
              hp: boss.hp,
              maxHp: boss.maxHp,
              dist: boss.dist,
              x: boss.x,
              y: boss.y
            });
          } else {
            // SERAPH-IX Phase 3 Resonance Core shattered => VICTORY!
            const victoryDist = boss.dist;
            const victoryX = boss.x;
            const victoryY = boss.y;

            state.boss = null;
            state.enemies = [];
            state.enemyBolts = [];
            state.pendingSalvos = [];
            state.vulcanPulses = [];
            state.isLocking = false;
            state.locks = [];
            state.phase = 'victory';
            refreshSyncAndRank();

            emitEvent({
              type: 'victory',
              kind: 'boss',
              score: state.score,
              syncPercent: state.syncPercent,
              fullLocksCount: state.fullLocksCount,
              maxChain: state.maxChain,
              rank: state.rank,
              dist: victoryDist,
              x: victoryX,
              y: victoryY,
              offsetX: victoryX,
              offsetY: victoryY
            });
          }
        }
      }
    }
  }

  function findNearestLiveFallbackTarget(dist, x, y) {
    let best = null;
    let bestScore = 18;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0 || e.dist < state.corridorDist - 1) continue;
      const d = Math.hypot((e.dist - dist) * 0.35, e.x - x, e.y - y);
      if (d < bestScore) {
        bestScore = d;
        best = { kind: 'enemy', entity: e };
      }
    }
    if (!best && state.boss) {
      for (let i = 0; i < state.boss.nodes.length; i++) {
        const n = state.boss.nodes[i];
        if (n.hp <= 0) continue;
        const d = Math.hypot((n.dist - dist) * 0.35, n.x - x, n.y - y);
        if (d < bestScore) {
          bestScore = d;
          best = { kind: 'boss_node', entity: n };
        }
      }
    }
    return best;
  }

  function stepSalvosAndVulcans(dt) {
    if (state.pendingSalvos.length > 0) {
      const remainingSalvos = [];
      for (let i = 0; i < state.pendingSalvos.length; i++) {
        const s = state.pendingSalvos[i];
        s.timer -= dt;
        if (s.timer <= 0) {
          let found = findLockableTargetById(s.targetId);
          if (!found) {
            found = findNearestLiveFallbackTarget(s.fallbackDist, s.fallbackX, s.fallbackY);
          }
          if (found) {
            applyDamageToTarget(found, 1, s.chainMultiplier, s.slotIndex, Boolean(s.fromOverdrive));
            if (state.phase !== 'playing') return;
          }
        } else {
          remainingSalvos.push(s);
        }
      }
      state.pendingSalvos = remainingSalvos;
    }

    if (state.vulcanPulses.length > 0) {
      const remainingVulcans = [];
      for (let i = 0; i < state.vulcanPulses.length; i++) {
        const v = state.vulcanPulses[i];
        v.ttl -= dt;
        v.dist += (state.corridorSpeed + v.forwardRelSpeed) * dt;
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        v.offsetX = v.x;
        v.offsetY = v.y;

        let hitFound = null;
        if (v.targetId) {
          const tracked = findLockableTargetById(v.targetId);
          if (tracked && v.dist >= tracked.entity.dist - 3.0) {
            hitFound = tracked;
          }
        }

        if (!hitFound) {
          for (let eIdx = 0; eIdx < state.enemies.length; eIdx++) {
            const e = state.enemies[eIdx];
            if (e.hp <= 0) continue;
            if (
              Math.abs(v.dist - e.dist) <= 3.6 &&
              Math.hypot(v.x - e.x, v.y - e.y) <= e.radius + 1.35
            ) {
              hitFound = { kind: 'enemy', entity: e };
              break;
            }
          }
        }

        if (!hitFound && state.boss) {
          for (let nIdx = 0; nIdx < state.boss.nodes.length; nIdx++) {
            const n = state.boss.nodes[nIdx];
            if (n.hp <= 0) continue;
            if (
              Math.abs(v.dist - n.dist) <= 4.0 &&
              Math.hypot(v.x - n.x, v.y - n.y) <= n.radius + 1.5
            ) {
              hitFound = { kind: 'boss_node', entity: n };
              break;
            }
          }
        }

        if (hitFound) {
          applyDamageToTarget(hitFound, 1, 1.0, 0, false);
          if (state.phase !== 'playing') return;
        } else if (v.ttl > 0 && v.dist <= state.corridorDist + 95) {
          remainingVulcans.push(v);
        }
      }
      state.vulcanPulses = remainingVulcans;
    }
  }

  function stepEnemiesAndBolts(dt) {
    const aliveEnemies = [];

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0) continue;

      e.age += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt * 3.5);
      e.dist += state.corridorSpeed * e.paceRatio * dt;
      updateEnemyMotion(e);

      const relDist = e.dist - state.corridorDist;

      // Evolution cube proximity auto-pickup when flying through/near it
      if (e.type === 'cube' && Math.abs(relDist) <= 5.2) {
        const dXY = Math.hypot(e.x - state.player.x, e.y - state.player.y);
        if (dXY <= 3.85) {
          collectEvolutionCube(e, 0);
          continue;
        }
      }

      // Mine hazard collision at player plane
      if (e.type === 'mine' && Math.abs(relDist) <= 2.5) {
        const dXY = Math.hypot(e.x - state.player.x, e.y - state.player.y);
        if (dXY <= e.radius + 1.45) {
          if (state.player.barrelRollTimer > 0 || overdriveTimer > 0) {
            applyDamageToTarget({ kind: 'enemy', entity: e }, e.hp, 1.0, 0, overdriveTimer > 0);
          } else {
            e.hp = 0;
            applyPlayerDamage();
            if (state.phase !== 'playing') return;
          }
          continue;
        }
      }

      // Enemy plasma bolt fire
      if (e.type !== 'cube' && e.type !== 'mine' && relDist > 16 && relDist < 68) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = e.fireInterval;
          spawnEnemyBolt(e.dist, e.x, e.y, state.player.x, state.player.y, 45);
          if (e.type === 'prism') {
            spawnEnemyBolt(
              e.dist,
              e.x,
              e.y,
              clamp(state.player.x + (rand() - 0.5) * 3.6, -PLAYER_MAX_X, PLAYER_MAX_X),
              clamp(state.player.y + (rand() - 0.5) * 2.4, -PLAYER_MAX_Y, PLAYER_MAX_Y),
              45
            );
          }
        }
      }

      if (relDist >= -10) {
        aliveEnemies.push(e);
      }
    }

    state.enemies = aliveEnemies;

    // Step incoming enemy plasma bolts
    if (state.enemyBolts.length > 0) {
      if (state.player.barrelRollTimer > 0) {
        deflectNearbyBolts();
      }

      const remainingBolts = [];
      for (let i = 0; i < state.enemyBolts.length; i++) {
        const b = state.enemyBolts[i];
        b.age += dt;
        b.dist += (state.corridorSpeed - b.closingSpeed) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.offsetX = b.x;
        b.offsetY = b.y;

        const relDist = b.dist - state.corridorDist;
        const radialDist = Math.hypot(b.x - state.player.x, b.y - state.player.y);

        if (
          state.player.barrelRollTimer > 0 &&
          relDist >= -BARREL_ROLL_DEFLECT_DIST_BEHIND &&
          relDist <= BARREL_ROLL_DEFLECT_DIST_AHEAD &&
          radialDist <= BARREL_ROLL_DEFLECT_RADIUS_XY
        ) {
          state.score += 250;
          state.chain += 1;
          state.maxChain = Math.max(state.maxChain, state.chain);
          state.player.overdrive = clamp(state.player.overdrive + 8, 0, 100);
          refreshSyncAndRank();

          emitEvent({
            type: 'bolt_deflected',
            boltId: b.id,
            kind: 'deflect',
            points: 250,
            overdriveGain: 8,
            overdrive: state.player.overdrive,
            dist: b.dist,
            x: b.x,
            y: b.y,
            offsetX: b.x,
            offsetY: b.y
          });
          continue;
        }

        if (Math.abs(relDist) <= 2.4 && radialDist <= 1.85) {
          applyPlayerDamage();
          if (state.phase !== 'playing') return;
          continue;
        }

        if (relDist >= -8 && b.age <= 6.0) {
          remainingBolts.push(b);
        }
      }
      state.enemyBolts = remainingBolts;
    }
  }

  function stepAreaProgressionAndWaves(dt) {
    state.runTime += dt;
    state.areaTime += dt;
    refillCooldown = Math.max(0, refillCooldown - dt);

    // Check timed Area transitions: Area 0 (0..32s) -> Area 1 (32..66s) -> Area 2 (66..100s) -> Area 3 (100s+)
    if (state.areaIndex === 0 && state.runTime >= AREA_DEFINITIONS[0].endTime) {
      transitionToArea(1);
      return;
    }
    if (state.areaIndex === 1 && state.runTime >= AREA_DEFINITIONS[1].endTime) {
      transitionToArea(2);
      return;
    }
    if (state.areaIndex === 2 && state.runTime >= AREA_DEFINITIONS[2].endTime) {
      transitionToArea(3);
      return;
    }

    if (state.areaIndex < 3) {
      const schedule = AREA_WAVE_TIMES[state.areaIndex];
      while (waveCursor < schedule.length && state.areaTime >= schedule[waveCursor]) {
        spawnAreaWave(state.areaIndex, waveCursor);
        waveCursor += 1;
        refillCooldown = 2.6;
      }

      // Keep corridor lively if an ace player clears the current wave early
      const areaDef = AREA_DEFINITIONS[state.areaIndex];
      const timeRemainingInArea = areaDef.endTime - state.runTime;
      const activeCombatTargets = state.enemies.filter((e) => e.hp > 0 && e.dist > state.corridorDist + 4).length;
      if (activeCombatTargets < 2 && refillCooldown <= 0 && timeRemainingInArea > 3.2) {
        const bonusWaveIdx = waveCursor < schedule.length ? waveCursor : (Math.floor(state.areaTime) % 3) + 1;
        spawnAreaWave(state.areaIndex, bonusWaveIdx);
        if (waveCursor < schedule.length && schedule[waveCursor] - state.areaTime < 3.5) {
          waveCursor += 1;
        }
        refillCooldown = 3.2;
      }
    } else if (state.boss) {
      updateBossKinematics(dt);
    }
  }

  function stepPlayerAndCorridor(dt, input) {
    vulcanCooldownTimer = Math.max(0, vulcanCooldownTimer - dt);
    state.player.barrelRollTimer = Math.max(0, state.player.barrelRollTimer - dt);
    state.player.barrelRollCooldown = Math.max(0, state.player.barrelRollCooldown - dt);
    state.player.invulnTimer = Math.max(0, state.player.invulnTimer - dt);

    if (areaTransitionTimer > 0) {
      areaTransitionTimer = Math.max(0, areaTransitionTimer - dt);
    }
    state.areaTransitionTimer = areaTransitionTimer;

    if (overdriveTimer > 0) {
      overdriveTimer = Math.max(0, overdriveTimer - dt);
      overdrivePulseTimer -= dt;
      if (overdrivePulseTimer <= 0 && overdriveTimer > 0.1) {
        overdrivePulseTimer = 0.24;
        sweepOverdriveResonanceBurst(false);
      }
    }
    state.overdriveTimer = overdriveTimer;

    // Corridor speed calculation (52 m/s cruise, surging to 78 m/s during Area transitions!)
    let targetSpeed = BASE_CORRIDOR_SPEED;
    if (areaTransitionTimer > 0) {
      if (areaTransitionTimer >= 1.2) {
        targetSpeed = SURGE_CORRIDOR_SPEED;
      } else {
        const u = areaTransitionTimer / 1.2;
        const smooth = u * u * (3 - 2 * u);
        targetSpeed = BASE_CORRIDOR_SPEED + (SURGE_CORRIDOR_SPEED - BASE_CORRIDOR_SPEED) * smooth;
      }
    }
    if (overdriveTimer > 0) {
      targetSpeed = Math.max(targetSpeed, OVERDRIVE_MIN_SPEED);
    }
    state.corridorSpeed = round1(targetSpeed);
    state.corridorDist += state.corridorSpeed * dt;

    // XY Dodge inside [-8.5, +8.5] x [-5.0, +5.0]
    let moveX = finiteOr(input && input.moveX, 0);
    let moveY = finiteOr(input && input.moveY, 0);
    if (moveX === 0 && input) {
      moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    }
    if (moveY === 0 && input) {
      moveY = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    }
    moveX = clamp(moveX, -1, 1);
    moveY = clamp(moveY, -1, 1);
    const moveMag = Math.hypot(moveX, moveY);
    if (moveMag > 1) {
      moveX /= moveMag;
      moveY /= moveMag;
    }

    const rollBoost = state.player.barrelRollTimer > 0 ? 1.22 : 1.0;
    const desiredVx = moveX * PLAYER_DODGE_SPEED_X * rollBoost;
    const desiredVy = moveY * PLAYER_DODGE_SPEED_Y * rollBoost;
    const response = Math.min(1, (moveMag > 0.01 ? 14.0 : 10.5) * dt);

    state.player.vx += (desiredVx - state.player.vx) * response;
    state.player.vy += (desiredVy - state.player.vy) * response;
    state.player.x += state.player.vx * dt;
    state.player.y += state.player.vy * dt;

    if (state.player.x <= -PLAYER_MAX_X) {
      state.player.x = -PLAYER_MAX_X;
      if (state.player.vx < 0) state.player.vx = 0;
    } else if (state.player.x >= PLAYER_MAX_X) {
      state.player.x = PLAYER_MAX_X;
      if (state.player.vx > 0) state.player.vx = 0;
    }

    if (state.player.y <= -PLAYER_MAX_Y) {
      state.player.y = -PLAYER_MAX_Y;
      if (state.player.vy < 0) state.player.vy = 0;
    } else if (state.player.y >= PLAYER_MAX_Y) {
      state.player.y = PLAYER_MAX_Y;
      if (state.player.vy > 0) state.player.vy = 0;
    }

    state.player.rollBank = clamp(-state.player.vx / PLAYER_DODGE_SPEED_X, -1, 1);

    // Normalized aim reticle in [-1, +1] (pointer NDC or keyboard steering offset)
    const hasAimX = input && input.aimX !== null && input.aimX !== undefined && Number.isFinite(input.aimX);
    const hasAimY = input && input.aimY !== null && input.aimY !== undefined && Number.isFinite(input.aimY);

    if (hasAimX) {
      state.reticle.x = clamp(input.aimX, -1, 1);
    }
    if (hasAimY) {
      state.reticle.y = clamp(input.aimY, -1, 1);
    }
    if (!hasAimX && !hasAimY && moveMag > 0.01) {
      state.reticle.x = clamp(state.reticle.x + moveX * 1.75 * dt, -1, 1);
      state.reticle.y = clamp(state.reticle.y + moveY * 1.75 * dt, -1, 1);
    }
  }

  function stepSingleSubframe(dt, input) {
    if (state.phase === 'title') {
      state.corridorSpeed = TITLE_COAST_SPEED;
      state.corridorDist += state.corridorSpeed * dt;
      return;
    }

    if (state.phase === 'victory' || state.phase === 'defeat') {
      state.corridorSpeed = ENDGAME_COAST_SPEED;
      state.corridorDist += state.corridorSpeed * dt;
      return;
    }

    stepPlayerAndCorridor(dt, input);
    stepAreaProgressionAndWaves(dt);
    stepSalvosAndVulcans(dt);
    if (state.phase !== 'playing') return;
    stepEnemiesAndBolts(dt);
    if (state.phase !== 'playing') return;
    syncActiveLockCounts();
  }

  function step(dt, input = {}) {
    stepEvents = [];
    const safeDt = finiteOr(dt, 0);
    if (safeDt <= 0) {
      return stepEvents;
    }

    const totalDt = Math.min(safeDt, 0.5);
    const maxSubDt = 0.025;
    const subSteps = Math.max(1, Math.ceil(totalDt / maxSubDt));
    const subDt = totalDt / subSteps;

    for (let i = 0; i < subSteps; i++) {
      stepSingleSubframe(subDt, input);
    }

    const flushed = stepEvents;
    stepEvents = [];
    return flushed;
  }

  function getState() {
    return {
      phase: state.phase,
      areaIndex: state.areaIndex,
      areaName: state.areaName,
      areaTime: state.areaTime,
      runTime: state.runTime,
      score: state.score,
      chain: state.chain,
      maxChain: state.maxChain,
      fullLocksCount: state.fullLocksCount,
      syncPercent: state.syncPercent,
      rank: state.rank,
      corridorDist: state.corridorDist,
      corridorSpeed: state.corridorSpeed,
      areaTransitionTimer: state.areaTransitionTimer,
      overdriveTimer: state.overdriveTimer,
      reticle: {
        x: state.reticle.x,
        y: state.reticle.y
      },
      isLocking: state.isLocking,
      locks: state.locks.map((l) => ({
        slotIndex: l.slotIndex,
        targetId: l.targetId,
        dist: l.dist,
        x: l.x,
        y: l.y,
        offsetX: l.offsetX,
        offsetY: l.offsetY
      })),
      pendingSalvos: state.pendingSalvos.map((s) => ({ ...s })),
      vulcanPulses: state.vulcanPulses.map((v) => ({ ...v })),
      player: {
        x: state.player.x,
        y: state.player.y,
        vx: state.player.vx,
        vy: state.player.vy,
        rollBank: state.player.rollBank,
        evolutionStage: state.player.evolutionStage,
        formName: state.player.formName,
        shields: state.player.shields,
        maxShields: PLAYER_MAX_SHIELDS,
        evolutionProgress: state.player.evolutionProgress,
        barrelRollTimer: state.player.barrelRollTimer,
        barrelRollCooldown: state.player.barrelRollCooldown,
        invulnTimer: state.player.invulnTimer,
        overdrive: state.player.overdrive
      },
      enemies: state.enemies.map((e) => ({
        id: e.id,
        type: e.type,
        dist: e.dist,
        x: e.x,
        y: e.y,
        offsetX: e.offsetX,
        offsetY: e.offsetY,
        hp: e.hp,
        maxHp: e.maxHp,
        maxLocks: e.maxLocks,
        lockCount: e.lockCount,
        lockable: e.lockable,
        radius: e.radius,
        phase: e.phase,
        age: e.age,
        hitFlash: e.hitFlash
      })),
      enemyBolts: state.enemyBolts.map((b) => ({
        id: b.id,
        dist: b.dist,
        x: b.x,
        y: b.y,
        offsetX: b.offsetX,
        offsetY: b.offsetY,
        vx: b.vx,
        vy: b.vy,
        radius: b.radius
      })),
      boss: state.boss
        ? {
            id: state.boss.id,
            name: state.boss.name,
            phase: state.boss.phase,
            hp: state.boss.hp,
            maxHp: state.boss.maxHp,
            phaseHp: state.boss.phaseHp,
            phaseMaxHp: state.boss.phaseMaxHp,
            dist: state.boss.dist,
            x: state.boss.x,
            y: state.boss.y,
            offsetX: state.boss.offsetX,
            offsetY: state.boss.offsetY,
            radius: state.boss.radius,
            hitFlash: state.boss.hitFlash,
            telegraph: state.boss.telegraph,
            nodes: state.boss.nodes.map((n) => ({
              id: n.id,
              index: n.index,
              kind: n.kind,
              phase: n.phase,
              hp: n.hp,
              maxHp: n.maxHp,
              maxLocks: n.maxLocks,
              lockCount: n.lockCount,
              lockable: n.lockable,
              active: n.active,
              alive: n.alive,
              angle: n.angle,
              localDist: n.localDist,
              localX: n.localX,
              localY: n.localY,
              dist: n.dist,
              x: n.x,
              y: n.y,
              offsetX: n.offsetX,
              offsetY: n.offsetY,
              radius: n.radius,
              hitFlash: n.hitFlash,
              telegraph: n.telegraph
            }))
          }
        : null
    };
  }

  reset();
  return api;
}
