// Tape No. 08: Aether Broadside — Tactical Naval Combat, Age-of-Sail Tacking,
// 15.5-Bar Scotch Marine Aether-Boiler Power Allocation, 6-Gun Broadside Ballistics,
// FTL Subsystem Damage-Control & 4-Wave Admiralty Campaign Simulation.
// Pure deterministic ES module (zero DOM / Three.js dependencies).

const ARENA_RADIUS = 420;
const SOFT_BOUNDARY_RADIUS = 388;
const DEFAULT_SEED = 188908;

const STRATA_ALTITUDES = Object.freeze({
  low: -6,
  mid: 2,
  high: 11
});

const VALID_STRATA = Object.freeze(['low', 'mid', 'high']);
const VALID_BOILER_KEYS = Object.freeze(['propulsion', 'sponsons', 'ordnance']);
const VALID_AMMO_TYPES = Object.freeze(['roundshot', 'chainshot', 'aethershell']);
const SUBSYSTEM_IDS = Object.freeze(['boiler', 'sponsons', 'gunDeck', 'rigging', 'propulsor']);

const SUBSYSTEM_META = Object.freeze({
  boiler: { id: 'boiler', name: 'Aether Boiler' },
  sponsons: { id: 'sponsons', name: 'Levitation Sponsons' },
  gunDeck: { id: 'gunDeck', name: 'Brass Gun Deck' },
  rigging: { id: 'rigging', name: 'Square Rigging' },
  propulsor: { id: 'propulsor', name: 'Kort Propulsor' }
});

const AMMO_SPECS = Object.freeze({
  roundshot: {
    id: 'roundshot',
    damageMult: 1.0,
    speed: 118,
    maxRange: 215,
    critChance: 0.14,
    fireChance: 0.06,
    crippleDuration: 0,
    subsystemMult: 0.55
  },
  chainshot: {
    id: 'chainshot',
    damageMult: 0.55,
    speed: 94,
    maxRange: 208,
    critChance: 0.20,
    fireChance: 0.0,
    crippleDuration: 7.0,
    subsystemMult: 0.85
  },
  aethershell: {
    id: 'aethershell',
    damageMult: 0.85,
    speed: 104,
    maxRange: 215,
    critChance: 0.48,
    fireChance: 0.45,
    crippleDuration: 0,
    subsystemMult: 1.35
  }
});

const ENEMY_ARCHETYPES = Object.freeze({
  cutter: {
    type: 'cutter',
    label: 'Corsair Cutter',
    maxHull: 84,
    speedMax: 13.4,
    turnRate: 0.96,
    gunCount: 3,
    reloadDuration: 4.6,
    damagePerGun: 1.45,
    preferredRange: 108,
    radius: 8.5,
    armorMult: 1.0,
    fireChance: 0.18,
    subsystemChance: 0.32,
    scoreValue: 500
  },
  frigate: {
    type: 'frigate',
    label: 'Mortar Frigate',
    maxHull: 168,
    speedMax: 10.2,
    turnRate: 0.66,
    gunCount: 5,
    reloadDuration: 4.9,
    damagePerGun: 1.75,
    preferredRange: 136,
    radius: 11.5,
    armorMult: 0.94,
    fireChance: 0.28,
    subsystemChance: 0.42,
    scoreValue: 1100
  },
  ironclad: {
    type: 'ironclad',
    label: 'HMS Leviathan',
    maxHull: 268,
    speedMax: 8.5,
    turnRate: 0.48,
    gunCount: 6,
    reloadDuration: 4.5,
    damagePerGun: 2.1,
    preferredRange: 128,
    radius: 15.0,
    armorMult: 0.88,
    fireChance: 0.30,
    subsystemChance: 0.46,
    scoreValue: 2500,
    isBoss: true
  }
});

const WAVE_DEFINITIONS = Object.freeze([
  {
    wave: 1,
    title: 'Corsair Picket',
    bonusScore: 800,
    spawns: [
      { type: 'cutter', name: 'Corsair Picket', dist: 156, bearingOffset: 0.92, headingOffset: 2.35, stratum: 'mid', orbitSign: 1 }
    ]
  },
  {
    wave: 2,
    title: 'Twin Squall',
    bonusScore: 1400,
    spawns: [
      { type: 'cutter', name: 'Squall Harrier', dist: 168, bearingOffset: -0.95, headingOffset: -2.2, stratum: 'mid', orbitSign: 1 },
      { type: 'cutter', name: 'Gale Viper', dist: 176, bearingOffset: 1.02, headingOffset: 2.2, stratum: 'low', orbitSign: -1 }
    ]
  },
  {
    wave: 3,
    title: 'Bombard Line',
    bonusScore: 2200,
    spawns: [
      { type: 'frigate', name: 'Bombardier Rex', dist: 184, bearingOffset: -0.82, headingOffset: -1.95, stratum: 'high', orbitSign: 1 },
      { type: 'cutter', name: 'Cinder Jackal', dist: 158, bearingOffset: 1.08, headingOffset: 2.15, stratum: 'mid', orbitSign: -1 }
    ]
  },
  {
    wave: 4,
    title: 'HMS Leviathan',
    bonusScore: 4000,
    spawns: [
      { type: 'ironclad', name: 'HMS Leviathan', dist: 188, bearingOffset: 0.85, headingOffset: 2.05, stratum: 'mid', orbitSign: 1 },
      { type: 'cutter', name: 'Vanguard Fang', dist: 162, bearingOffset: -1.04, headingOffset: -2.15, stratum: 'low', orbitSign: -1 }
    ]
  }
]);

const PLAYER_BASE_GUN_DAMAGE = 10.5;
const PLAYER_RADIUS = 11.0;
const BROADSIDE_CONE_HALF_ANGLE = (28 * Math.PI) / 180; // ±28° gun-carriage training arc
const BROADSIDE_MAX_RANGE = 215;
const MPS_TO_KNOTS = 1.94384;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteOr(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function wrapAngle(a) {
  if (!Number.isFinite(a)) return 0;
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function shortestAngleDiff(from, to) {
  return wrapAngle(to - from);
}

function snapHalfBar(v) {
  return Math.round(finiteOr(v, 0) * 2) / 2;
}

// Three.js right-handed naval convention:
// heading = 0 faces -Z (bow), +X is Starboard, -X is Port, +Z is Stern, +Y is Up.
function forwardX(heading) {
  return -Math.sin(heading);
}

function forwardZ(heading) {
  return -Math.cos(heading);
}

function starboardX(heading) {
  return Math.cos(heading);
}

function starboardZ(heading) {
  return -Math.sin(heading);
}

function headingFromXZ(dx, dz) {
  return Math.atan2(-dx, -dz);
}

function createMulberry32(seed) {
  let s = (seed >>> 0) || DEFAULT_SEED;
  return function nextRand() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeededObstacles(seed) {
  const rand = createMulberry32((seed ^ 0x9e3779b9) >>> 0);
  const anchors = [
    { id: 'skyrock-needle-nw', baseAngle: 0.72, baseDist: 215, radius: 21, height: 56 },
    { id: 'skyrock-spire-ne', baseAngle: -0.68, baseDist: 225, radius: 24, height: 64 },
    { id: 'skyrock-bastion-w', baseAngle: 1.62, baseDist: 255, radius: 26, height: 50 },
    { id: 'skyrock-arch-e', baseAngle: -1.58, baseDist: 248, radius: 23, height: 58 },
    { id: 'skyrock-anvil-sw', baseAngle: 2.46, baseDist: 278, radius: 20, height: 45 },
    { id: 'skyrock-beacon-se', baseAngle: -2.42, baseDist: 272, radius: 22, height: 53 }
  ];

  return anchors.map((a) => {
    const jitterAngle = a.baseAngle + (rand() - 0.5) * 0.14;
    const jitterDist = a.baseDist + (rand() - 0.5) * 18;
    const x = Math.round(forwardX(jitterAngle) * jitterDist * 10) / 10;
    const z = Math.round(forwardZ(jitterAngle) * jitterDist * 10) / 10;
    return {
      id: a.id,
      x,
      z,
      radius: a.radius,
      height: a.height
    };
  });
}

// Computes Age-of-Sail points-of-sail trim multiplier:
// - Dead in irons (heading directly against wind flow, relDiff = PI): 0.45x
// - Beam / broad reach (relDiff ~ 68°..95°): up to 1.35x
// - Running dead downwind (relDiff = 0): 1.12x
// Scaled by rigging subsystem health.
export function computeSailTrimMultiplier(shipHeading, windAngle, riggingHpRatio = 1) {
  const relDiff = Math.abs(shortestAngleDiff(shipHeading, windAngle));
  const u = clamp(relDiff / Math.PI, 0, 1);
  let idealTrim;
  if (u <= 0.40) {
    idealTrim = 1.12 + 0.23 * Math.sin((u / 0.40) * (Math.PI * 0.5));
  } else {
    idealTrim = 0.45 + 0.90 * 0.5 * (1 + Math.cos(((u - 0.40) / 0.60) * Math.PI));
  }
  const rigFactor = clamp(finiteOr(riggingHpRatio, 1), 0, 1);
  const scaled = lerp(0.45, idealTrim, 0.18 + 0.82 * rigFactor);
  return clamp(scaled, 0.45, 1.35);
}

// Closest distance squared from point (px, py, pz) to 3D segment A -> B
function distSqPointToSegment3D(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq <= 1e-8) {
    const dx = px - ax;
    const dy = py - ay;
    const dz = pz - az;
    return { distSq: dx * dx + dy * dy + dz * dz, t: 0 };
  }
  const t = clamp(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  return { distSq: dx * dx + dy * dy + dz * dz, t, cx, cy, cz };
}

function nearestStratumName(y) {
  let best = 'mid';
  let bestDist = Infinity;
  for (let i = 0; i < VALID_STRATA.length; i++) {
    const s = VALID_STRATA[i];
    const d = Math.abs(y - STRATA_ALTITUDES[s]);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export function createBroadsideSimulation(options = {}) {
  const baseSeed = Number.isInteger(options.seed) ? options.seed : DEFAULT_SEED;
  let rand = createMulberry32(baseSeed);
  const obstacles = buildSeededObstacles(baseSeed);

  // Internal simulation timers & counters
  let simElapsed = 0;
  let nextProjectileSeq = 1;
  let nextEnemySeq = 1;
  let interWaveTimer = 0;
  let pendingNextWave = null;
  let playerObstacleScrapeCooldown = 0;

  // Crew assignment FIFO order (each entry is a subsystemId, max length = 2)
  let crewQueue = [];
  // Per-subsystem internal repair/fire/leak accumulators
  const subTimers = {
    boiler: { fireExtinguish: 0, leakSeal: 0 },
    sponsons: { fireExtinguish: 0, leakSeal: 0 },
    gunDeck: { fireExtinguish: 0, leakSeal: 0 },
    rigging: { fireExtinguish: 0, leakSeal: 0 },
    propulsor: { fireExtinguish: 0, leakSeal: 0 }
  };

  let pendingEvents = [];

  function makeSubsystemsState() {
    const out = {};
    for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
      const id = SUBSYSTEM_IDS[i];
      out[id] = {
        id,
        name: SUBSYSTEM_META[id].name,
        hp: 100,
        maxHp: 100,
        onFire: false,
        steamLeak: false,
        crewAssigned: 0
      };
    }
    return out;
  }

  const state = {
    phase: 'title', // 'title' | 'playing' | 'victory' | 'defeat'
    wave: 1,
    waveName: WAVE_DEFINITIONS[0].title,
    maxWaves: 4,
    score: 0,
    hull: 100,
    maxHull: 100,
    boiler: {
      capacity: 15.5,
      maxCapacity: 15.5,
      overchargeCapacity: 19.5,
      overcharged: false,
      overchargeTimer: 0,
      overchargeCooldown: 0,
      allocated: 15.5,
      unallocated: 0,
      allocation: {
        propulsion: 5.5,
        sponsons: 5.0,
        ordnance: 5.0
      }
    },
    stratum: 'mid',
    targetStratum: 'mid',
    ammoType: 'roundshot',
    portReload: 0,
    starboardReload: 0,
    reloadDuration: 3.95,
    ventCooldown: 0,
    maxVentCooldown: 14.0,
    subsystems: makeSubsystemsState(),
    crewTotal: 2,
    crewAvailable: 2,
    wind: {
      angle: 0.72,
      knots: 18.5,
      sailTrim: 1.28
    },
    player: {
      x: 0,
      y: STRATA_ALTITUDES.mid,
      z: 110,
      vx: 0,
      vz: 0,
      forwardX: 0,
      forwardZ: -1,
      heading: 0,
      speed: 8.5,
      speedKnots: 8.5 * MPS_TO_KNOTS,
      throttle: 0.65,
      roll: 0,
      pitch: 0,
      sailTrim: 1.28,
      activeGuns: 6,
      crippled: false,
      crippledTimer: 0
    },
    enemies: [],
    projectiles: []
  };

  const api = {
    reset,
    startWave,
    getObstacles,
    getState,
    allocateBoiler,
    setBoilerSplit,
    engageOverpressure,
    overcharge: engageOverpressure,
    setTargetStratum,
    setAmmoType,
    fireBroadside,
    assignCrew,
    ventSteam,
    damageSubsystem,
    onEvent: null,
    step
  };

  function emitEvent(evt) {
    if (pendingEvents.length < 256) {
      pendingEvents.push(evt);
    }
    if (typeof api.onEvent === 'function') {
      api.onEvent(evt);
    }
  }

  function computeBoilerCapacity() {
    const boilerSub = state.subsystems.boiler;
    const hpRatio = clamp(finiteOr(boilerSub.hp, 100) / Math.max(1, boilerSub.maxHp), 0, 1);
    // Smoothly scales from 15.5 bar at 100% HP down to min 7.5 bar at 0% HP, snapped to 0.5-bar pips
    let cap = snapHalfBar(7.5 + 8.0 * hpRatio);
    cap = clamp(cap, 7.5, 15.5);
    if (state.boiler.overcharged) {
      cap = Math.min(19.5, snapHalfBar(cap + 4.0));
    }
    return cap;
  }

  function computeReloadDuration() {
    const ord = clamp(finiteOr(state.boiler.allocation.ordnance, 0), 0, 19.5);
    // 5.5s at 0 bar -> 2.4s at high bar (>= 10.0 bar)
    const ordFactor = clamp(ord / 10.0, 0, 1);
    let reload = lerp(5.5, 2.4, ordFactor);
    const gunSub = state.subsystems.gunDeck;
    const gunHpRatio = clamp(finiteOr(gunSub.hp, 100) / Math.max(1, gunSub.maxHp), 0, 1);
    const leakPenalty = gunSub.steamLeak ? 1.12 : 1.0;
    reload *= lerp(1.28, 1.0, gunHpRatio) * leakPenalty;
    return Math.round(reload * 1000) / 1000;
  }

  function computeActivePlayerGuns() {
    const gunSub = state.subsystems.gunDeck;
    const ratio = clamp(finiteOr(gunSub.hp, 100) / Math.max(1, gunSub.maxHp), 0, 1);
    return clamp(Math.round(6 * ratio), 2, 6);
  }

  function syncBoilerInvariants() {
    const cap = computeBoilerCapacity();
    state.boiler.capacity = cap;

    const alloc = state.boiler.allocation;
    for (let i = 0; i < VALID_BOILER_KEYS.length; i++) {
      const k = VALID_BOILER_KEYS[i];
      alloc[k] = Math.max(0, snapHalfBar(alloc[k]));
    }

    let sum = alloc.propulsion + alloc.sponsons + alloc.ordnance;
    // Trim excess in 0.5-bar steps from highest-allocated channels first if capacity dropped
    let guard = 0;
    while (sum > cap + 1e-6 && guard < 120) {
      guard++;
      let maxKey = 'propulsion';
      if (alloc.sponsons > alloc[maxKey]) maxKey = 'sponsons';
      if (alloc.ordnance > alloc[maxKey]) maxKey = 'ordnance';
      if (alloc[maxKey] <= 0) break;
      const trim = Math.min(0.5, alloc[maxKey], snapHalfBar(sum - cap) || 0.5);
      alloc[maxKey] = Math.max(0, snapHalfBar(alloc[maxKey] - trim));
      sum = alloc.propulsion + alloc.sponsons + alloc.ordnance;
    }

    state.boiler.allocated = Math.round(sum * 10) / 10;
    state.boiler.unallocated = Math.max(0, Math.round((cap - sum) * 10) / 10);
    state.reloadDuration = computeReloadDuration();
    state.player.activeGuns = computeActivePlayerGuns();
  }

  function syncCrewCounts() {
    crewQueue = crewQueue.filter((id) => SUBSYSTEM_IDS.includes(id));
    if (crewQueue.length > state.crewTotal) {
      crewQueue = crewQueue.slice(crewQueue.length - state.crewTotal);
    }
    for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
      state.subsystems[SUBSYSTEM_IDS[i]].crewAssigned = 0;
    }
    for (let i = 0; i < crewQueue.length; i++) {
      state.subsystems[crewQueue[i]].crewAssigned += 1;
    }
    state.crewAvailable = Math.max(0, state.crewTotal - crewQueue.length);
  }

  function syncWindAndTrim() {
    const rigSub = state.subsystems.rigging;
    const rigEff = clamp(
      (finiteOr(rigSub.hp, 100) / Math.max(1, rigSub.maxHp)) * (rigSub.steamLeak ? 0.85 : 1.0),
      0,
      1
    );
    const trim = computeSailTrimMultiplier(state.player.heading, state.wind.angle, rigEff);
    state.wind.sailTrim = Math.round(trim * 1000) / 1000;
    state.player.sailTrim = state.wind.sailTrim;
    state.player.forwardX = forwardX(state.player.heading);
    state.player.forwardZ = forwardZ(state.player.heading);
    state.player.vx = state.player.forwardX * state.player.speed;
    state.player.vz = state.player.forwardZ * state.player.speed;
    state.player.speedKnots = Math.round(state.player.speed * MPS_TO_KNOTS * 100) / 100;
  }

  function reset() {
    rand = createMulberry32(baseSeed);
    simElapsed = 0;
    nextProjectileSeq = 1;
    nextEnemySeq = 1;
    interWaveTimer = 0;
    pendingNextWave = null;
    playerObstacleScrapeCooldown = 0;
    crewQueue = [];
    pendingEvents = [];

    for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
      const id = SUBSYSTEM_IDS[i];
      subTimers[id].fireExtinguish = 0;
      subTimers[id].leakSeal = 0;
    }

    state.phase = 'title';
    state.wave = 1;
    state.waveName = WAVE_DEFINITIONS[0].title;
    state.maxWaves = 4;
    state.score = 0;
    state.hull = 100;
    state.maxHull = 100;

    state.boiler.overcharged = false;
    state.boiler.overchargeTimer = 0;
    state.boiler.overchargeCooldown = 0;
    state.boiler.allocation.propulsion = 5.5;
    state.boiler.allocation.sponsons = 5.0;
    state.boiler.allocation.ordnance = 5.0;

    state.stratum = 'mid';
    state.targetStratum = 'mid';
    state.ammoType = 'roundshot';
    state.portReload = 0;
    state.starboardReload = 0;
    state.ventCooldown = 0;

    state.subsystems = makeSubsystemsState();
    syncCrewCounts();

    state.wind.angle = 0.72;
    state.wind.knots = 18.5;

    state.player.x = 0;
    state.player.y = STRATA_ALTITUDES.mid;
    state.player.z = 110;
    state.player.heading = 0;
    state.player.throttle = 0.65;
    state.player.speed = 8.5;
    state.player.roll = 0;
    state.player.pitch = 0;
    state.player.crippled = false;
    state.player.crippledTimer = 0;

    state.enemies = [];
    state.projectiles = [];

    syncBoilerInvariants();
    syncWindAndTrim();
    return getState();
  }

  function resolveClearSpawnPosition(x, z, radius) {
    let px = x;
    let pz = z;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        const dx = px - obs.x;
        const dz = pz - obs.z;
        const dist = Math.hypot(dx, dz);
        const minDist = obs.radius + radius + 16;
        if (dist < minDist) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0;
          px = obs.x + nx * minDist;
          pz = obs.z + nz * minDist;
        }
      }
      const r = Math.hypot(px, pz);
      if (r > ARENA_RADIUS - 36) {
        const scale = (ARENA_RADIUS - 36) / r;
        px *= scale;
        pz *= scale;
      }
    }
    return { x: px, z: pz };
  }

  function startWave(waveNum = 1) {
    const clampedWave = clamp(Math.floor(finiteOr(waveNum, 1)), 1, 4);
    const waveDef = WAVE_DEFINITIONS[clampedWave - 1];

    // If caller advances directly to a higher wave before auto-refit ran, grant the +25% field refit
    if (state.phase === 'playing' && clampedWave > state.wave && pendingNextWave === null) {
      applyFieldRefit();
    }

    interWaveTimer = 0;
    pendingNextWave = null;
    state.wave = clampedWave;
    state.waveName = waveDef.title;
    state.phase = 'playing';
    state.enemies = [];

    // Remove any leftover enemy projectiles on fresh wave spawn so transitions are crisp
    state.projectiles = state.projectiles.filter((p) => p.owner === 'player');

    const baseX = state.player.x;
    const baseZ = state.player.z;
    const baseHeading = state.player.heading;

    for (let i = 0; i < waveDef.spawns.length; i++) {
      const sp = waveDef.spawns[i];
      const arch = ENEMY_ARCHETYPES[sp.type];
      const spawnBearing = wrapAngle(baseHeading + sp.bearingOffset);
      const rawX = baseX + forwardX(spawnBearing) * sp.dist;
      const rawZ = baseZ + forwardZ(spawnBearing) * sp.dist;
      const pos = resolveClearSpawnPosition(rawX, rawZ, arch.radius);
      const heading = wrapAngle(baseHeading + sp.headingOffset);
      const y = STRATA_ALTITUDES[sp.stratum] ?? STRATA_ALTITUDES.mid;
      const speed = arch.speedMax * 0.72;

      state.enemies.push({
        id: `wave${clampedWave}-${sp.type}-${nextEnemySeq++}`,
        type: sp.type,
        kind: sp.type,
        shipClass: sp.type,
        name: sp.name || arch.label,
        isBoss: Boolean(arch.isBoss),
        x: pos.x,
        y,
        z: pos.z,
        vx: forwardX(heading) * speed,
        vz: forwardZ(heading) * speed,
        forwardX: forwardX(heading),
        forwardZ: forwardZ(heading),
        heading,
        speed,
        speedKnots: Math.round(speed * MPS_TO_KNOTS * 100) / 100,
        roll: 0,
        pitch: 0,
        stratum: sp.stratum || 'mid',
        targetStratum: sp.stratum || 'mid',
        stratumSwitchTimer: 8.5 + i * 3.5,
        orbitSign: sp.orbitSign || (i % 2 === 0 ? 1 : -1),
        hull: arch.maxHull,
        maxHull: arch.maxHull,
        hp: arch.maxHull,
        maxHp: arch.maxHull,
        onFire: false,
        fireTimer: 0,
        crippled: false,
        crippledTimer: 0,
        reloadTimer: 1.8 + i * 0.85,
        reloadDuration: arch.reloadDuration,
        ammoType: sp.type === 'frigate' ? 'aethershell' : 'roundshot',
        gunCount: arch.gunCount,
        radius: arch.radius
      });
    }

    return getState();
  }

  function applyFieldRefit() {
    const hullBefore = state.hull;
    state.hull = Math.min(state.maxHull, Math.round((state.hull + state.maxHull * 0.25) * 100) / 100);
    for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
      const sub = state.subsystems[SUBSYSTEM_IDS[i]];
      sub.hp = Math.min(sub.maxHp, Math.round((sub.hp + sub.maxHp * 0.25) * 100) / 100);
    }
    syncBoilerInvariants();
    return Math.round((state.hull - hullBefore) * 100) / 100;
  }

  function getObstacles() {
    return obstacles.map((o) => ({ ...o }));
  }

  function getState() {
    syncBoilerInvariants();
    return state;
  }

  function allocateBoiler(key, deltaBar = 0.5) {
    if (!VALID_BOILER_KEYS.includes(key)) return false;
    const stepDelta = snapHalfBar(deltaBar);
    if (Math.abs(stepDelta) < 1e-6) return true;

    syncBoilerInvariants();
    const alloc = state.boiler.allocation;
    const cap = state.boiler.capacity;

    if (stepDelta < 0) {
      const nextVal = Math.max(0, snapHalfBar(alloc[key] + stepDelta));
      alloc[key] = nextVal;
      syncBoilerInvariants();
      return true;
    }

    // Positive delta: draw from unallocated bar first, then siphon smoothly in 0.5-bar
    // pips from the other channels if already at max capacity so +pip buttons always respond.
    const desiredGain = Math.min(stepDelta, cap - alloc[key]);
    if (desiredGain <= 1e-6) return false;

    const currentSum = alloc.propulsion + alloc.sponsons + alloc.ordnance;
    const freeBar = Math.max(0, snapHalfBar(cap - currentSum));
    const useFree = Math.min(desiredGain, freeBar);
    let needSiphon = snapHalfBar(desiredGain - useFree);

    const others = VALID_BOILER_KEYS.filter((k) => k !== key);
    let siphoned = 0;
    let guard = 0;
    while (needSiphon > 1e-6 && guard < 80) {
      guard++;
      const donor = alloc[others[0]] >= alloc[others[1]] ? others[0] : others[1];
      if (alloc[donor] < 0.5 - 1e-6) break;
      alloc[donor] = Math.max(0, snapHalfBar(alloc[donor] - 0.5));
      siphoned = snapHalfBar(siphoned + 0.5);
      needSiphon = snapHalfBar(needSiphon - 0.5);
    }

    alloc[key] = Math.min(cap, snapHalfBar(alloc[key] + useFree + siphoned));
    syncBoilerInvariants();
    return useFree + siphoned > 0;
  }

  function setBoilerSplit(split = {}) {
    if (!split || typeof split !== 'object') return false;
    syncBoilerInvariants();
    const cap = state.boiler.capacity;
    const alloc = state.boiler.allocation;

    const p = split.propulsion !== undefined ? Math.max(0, snapHalfBar(split.propulsion)) : alloc.propulsion;
    const s = split.sponsons !== undefined ? Math.max(0, snapHalfBar(split.sponsons)) : alloc.sponsons;
    const o = split.ordnance !== undefined ? Math.max(0, snapHalfBar(split.ordnance)) : alloc.ordnance;

    alloc.propulsion = p;
    alloc.sponsons = s;
    alloc.ordnance = o;
    syncBoilerInvariants();
    return true;
  }

  function engageOverpressure() {
    if (state.boiler.overcharged || state.boiler.overchargeCooldown > 0) {
      return false;
    }
    state.boiler.overcharged = true;
    state.boiler.overchargeTimer = 8.0;
    state.boiler.overchargeCooldown = 18.0;

    syncBoilerInvariants();

    // Distribute newfound +4.0 bar boost across the 3 channels up to new capacity
    // so overpressure immediately surges propulsion, lift & reload speed.
    const boostPlan = [
      ['propulsion', 1.5],
      ['ordnance', 1.5],
      ['sponsons', 1.0]
    ];
    for (let i = 0; i < boostPlan.length; i++) {
      const [k, add] = boostPlan[i];
      const free = Math.max(0, snapHalfBar(state.boiler.capacity - (
        state.boiler.allocation.propulsion +
        state.boiler.allocation.sponsons +
        state.boiler.allocation.ordnance
      )));
      const grant = Math.min(add, free);
      if (grant > 0) {
        state.boiler.allocation[k] = snapHalfBar(state.boiler.allocation[k] + grant);
      }
    }
    syncBoilerInvariants();

    // Small deterministic chance (28%) of straining a boiler steam valve into a steamLeak
    if (rand() < 0.28 && !state.subsystems.boiler.steamLeak) {
      state.subsystems.boiler.steamLeak = true;
      subTimers.boiler.leakSeal = 0;
      emitEvent({
        type: 'steam_leak',
        subsystem: 'boiler',
        source: 'overpressure',
        position: { x: state.player.x, y: state.player.y, z: state.player.z },
        x: state.player.x,
        y: state.player.y,
        z: state.player.z
      });
    }
    return true;
  }

  function setTargetStratum(stratum) {
    if (!VALID_STRATA.includes(stratum)) return false;
    state.targetStratum = stratum;
    return true;
  }

  function setAmmoType(ammo) {
    if (!VALID_AMMO_TYPES.includes(ammo)) return false;
    state.ammoType = ammo;
    return true;
  }

  function assignCrew(subsystemId) {
    if (!SUBSYSTEM_IDS.includes(subsystemId)) return false;
    const existingIdx = crewQueue.indexOf(subsystemId);
    if (existingIdx !== -1) {
      // Clicking an already-assigned subsystem recalls that engineer back to standby
      crewQueue.splice(existingIdx, 1);
      syncCrewCounts();
      return true;
    }

    if (crewQueue.length >= state.crewTotal) {
      // Prefer cycling an engineer off a fully-repaired healthy subsystem first, else FIFO oldest
      let evictIdx = 0;
      for (let i = 0; i < crewQueue.length; i++) {
        const sub = state.subsystems[crewQueue[i]];
        if (sub.hp >= sub.maxHp && !sub.onFire && !sub.steamLeak) {
          evictIdx = i;
          break;
        }
      }
      crewQueue.splice(evictIdx, 1);
    }

    crewQueue.push(subsystemId);
    syncCrewCounts();
    return true;
  }

  function ventSteam() {
    if (state.ventCooldown > 0) return false;
    state.ventCooldown = state.maxVentCooldown;

    let extinguished = 0;
    let sealed = 0;
    for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
      const id = SUBSYSTEM_IDS[i];
      const sub = state.subsystems[id];
      if (sub.onFire) {
        sub.onFire = false;
        extinguished++;
      }
      if (sub.steamLeak) {
        sub.steamLeak = false;
        sealed++;
      }
      subTimers[id].fireExtinguish = 0;
      subTimers[id].leakSeal = 0;
    }

    syncBoilerInvariants();
    emitEvent({
      type: 'vent_steam',
      extinguished,
      sealed,
      position: { x: state.player.x, y: state.player.y, z: state.player.z },
      x: state.player.x,
      y: state.player.y,
      z: state.player.z
    });
    return true;
  }

  function damageSubsystem(subsystemId, amount = 20, flags = {}) {
    if (!SUBSYSTEM_IDS.includes(subsystemId)) return false;
    const sub = state.subsystems[subsystemId];
    const dmg = Math.max(0, finiteOr(amount, 0));
    if (dmg > 0) {
      sub.hp = Math.max(0, Math.round((sub.hp - dmg) * 100) / 100);
      emitEvent({
        type: 'subsystem_damaged',
        subsystem: sub.id,
        name: sub.name,
        damage: dmg,
        hp: sub.hp,
        maxHp: sub.maxHp,
        position: { x: state.player.x, y: state.player.y, z: state.player.z },
        x: state.player.x,
        y: state.player.y,
        z: state.player.z
      });
    }
    if (flags && flags.fire && !sub.onFire) {
      sub.onFire = true;
      subTimers[subsystemId].fireExtinguish = 0;
      emitEvent({
        type: 'fire_started',
        target: 'player',
        subsystem: sub.id,
        position: { x: state.player.x, y: state.player.y, z: state.player.z },
        x: state.player.x,
        y: state.player.y,
        z: state.player.z
      });
    }
    if (flags && flags.steamLeak && !sub.steamLeak) {
      sub.steamLeak = true;
      subTimers[subsystemId].leakSeal = 0;
      emitEvent({
        type: 'steam_leak',
        subsystem: sub.id,
        source: 'combat',
        position: { x: state.player.x, y: state.player.y, z: state.player.z },
        x: state.player.x,
        y: state.player.y,
        z: state.player.z
      });
    }
    syncBoilerInvariants();
    return true;
  }

  function findBestEnemyInBroadsideCone(broadsideAngle, projSpeed) {
    let bestEnemy = null;
    let bestScore = Infinity;
    let bestAimAngle = broadsideAngle;
    let bestVy = 0;

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hull <= 0) continue;
      const dx = e.x - state.player.x;
      const dz = e.z - state.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > BROADSIDE_MAX_RANGE + e.radius || dist < 1e-3) continue;

      const flightTime = dist / Math.max(30, projSpeed);
      const leadX = e.x + e.vx * flightTime * 0.82 - state.player.x;
      const leadZ = e.z + e.vz * flightTime * 0.82 - state.player.z;
      const aimBearing = headingFromXZ(leadX, leadZ);
      const coneErr = shortestAngleDiff(broadsideAngle, aimBearing);

      if (Math.abs(coneErr) <= BROADSIDE_CONE_HALF_ANGLE) {
        const score = dist + Math.abs(coneErr) * 95;
        if (score < bestScore) {
          bestScore = score;
          bestEnemy = e;
          bestAimAngle = aimBearing;
          const dy = e.y - state.player.y;
          const leadDist = Math.max(10, Math.hypot(leadX, leadZ));
          bestVy = dy / (leadDist / projSpeed);
        }
      }
    }

    return { target: bestEnemy, aimAngle: bestAimAngle, vy: bestVy };
  }

  function fireBroadside(side = 'port') {
    if (side !== 'port' && side !== 'starboard') return false;
    if (state.phase === 'victory' || state.phase === 'defeat') return false;
    if (side === 'port' && state.portReload > 0) return false;
    if (side === 'starboard' && state.starboardReload > 0) return false;

    syncBoilerInvariants();
    const reloadDur = state.reloadDuration;
    if (side === 'port') {
      state.portReload = reloadDur;
    } else {
      state.starboardReload = reloadDur;
    }

    const ammoSpec = AMMO_SPECS[state.ammoType] || AMMO_SPECS.roundshot;
    const gunCount = computeActivePlayerGuns();
    const sideSign = side === 'starboard' ? 1 : -1;
    // Port (+PI/2 -> -X in local space), Starboard (-PI/2 -> +X in local space)
    const broadsideAngle = wrapAngle(state.player.heading - sideSign * (Math.PI * 0.5));

    const aim = findBestEnemyInBroadsideCone(broadsideAngle, ammoSpec.speed);
    const strataMismatchDispersion = aim.target && aim.target.stratum !== state.stratum ? 1.35 : 1.0;

    const fwdX = forwardX(state.player.heading);
    const fwdZ = forwardZ(state.player.heading);
    const stbX = starboardX(state.player.heading);
    const stbZ = starboardZ(state.player.heading);

    for (let i = 0; i < gunCount; i++) {
      const normIdx = gunCount > 1 ? (i / (gunCount - 1)) - 0.5 : 0;
      const hullAlongOffset = normIdx * 13.0; // Spaced along 6 gunports fore-to-aft
      const lateralOffset = sideSign * 4.4;

      // Tight staggered ripple: slight speed & angular fan variation across the 6 brass barrels
      const fanSpread = aim.target
        ? normIdx * 0.042 * strataMismatchDispersion + (rand() - 0.5) * 0.016
        : normIdx * 0.13;
      const shotHeading = wrapAngle(aim.aimAngle + fanSpread);
      const rippleSpeed = ammoSpec.speed * (1.0 - i * 0.022);

      const muzzleX = state.player.x + fwdX * hullAlongOffset + stbX * lateralOffset;
      const muzzleY = state.player.y + 0.55;
      const muzzleZ = state.player.z + fwdZ * hullAlongOffset + stbZ * lateralOffset;

      const vx = forwardX(shotHeading) * rippleSpeed + state.player.vx * 0.18;
      const vz = forwardZ(shotHeading) * rippleSpeed + state.player.vz * 0.18;
      const vy = clamp(aim.vy, -28, 28);

      state.projectiles.push({
        id: `proj-${nextProjectileSeq++}`,
        owner: 'player',
        ownerId: 'player',
        ammoType: ammoSpec.id,
        kind: ammoSpec.id,
        side,
        x: muzzleX,
        y: muzzleY,
        z: muzzleZ,
        prevX: muzzleX,
        prevY: muzzleY,
        prevZ: muzzleZ,
        vx,
        vy,
        vz,
        heading: shotHeading,
        age: 0,
        maxAge: ammoSpec.maxRange / Math.max(40, rippleSpeed),
        damage: PLAYER_BASE_GUN_DAMAGE * ammoSpec.damageMult,
        radius: 1.55,
        accuracyMult: 1.0
      });
    }

    emitEvent({
      type: 'broadside_fired',
      actor: 'player',
      shipId: 'player',
      side,
      count: gunCount,
      gunCount,
      ammoType: ammoSpec.id,
      origin: { x: state.player.x, y: state.player.y, z: state.player.z },
      x: state.player.x,
      y: state.player.y,
      z: state.player.z,
      heading: state.player.heading
    });

    return true;
  }

  function fireEnemyBroadside(enemy, side) {
    const arch = ENEMY_ARCHETYPES[enemy.type] || ENEMY_ARCHETYPES.cutter;
    const ammoSpec = AMMO_SPECS[enemy.ammoType] || AMMO_SPECS.roundshot;
    const sideSign = side === 'starboard' ? 1 : -1;
    const broadsideAngle = wrapAngle(enemy.heading - sideSign * (Math.PI * 0.5));

    const dx = state.player.x - enemy.x;
    const dz = state.player.z - enemy.z;
    const dist = Math.max(12, Math.hypot(dx, dz));
    const projSpeed = ammoSpec.speed * 0.84;
    const flightTime = dist / projSpeed;

    const leadX = state.player.x + state.player.vx * flightTime * 0.65 - enemy.x;
    const leadZ = state.player.z + state.player.vz * flightTime * 0.65 - enemy.z;
    const rawAim = headingFromXZ(leadX, leadZ);
    const clampedDiff = clamp(shortestAngleDiff(broadsideAngle, rawAim), -BROADSIDE_CONE_HALF_ANGLE, BROADSIDE_CONE_HALF_ANGLE);
    const baseAim = wrapAngle(broadsideAngle + clampedDiff);

    // Mismatching an enemy's altitude stratum cuts incoming hit accuracy by 40%!
    const stratumMismatch = enemy.stratum !== state.stratum;
    const accuracyMult = stratumMismatch ? 0.60 : 1.0;
    const spreadScale = stratumMismatch ? 0.18 : 0.105;

    const fwdX = forwardX(enemy.heading);
    const fwdZ = forwardZ(enemy.heading);
    const stbX = starboardX(enemy.heading);
    const stbZ = starboardZ(enemy.heading);
    const gunCount = enemy.gunCount;
    const dy = state.player.y - enemy.y;
    const baseVy = clamp(dy / Math.max(0.25, flightTime), -24, 24);

    for (let i = 0; i < gunCount; i++) {
      const normIdx = gunCount > 1 ? (i / (gunCount - 1)) - 0.5 : 0;
      const along = normIdx * 9.5;
      const lat = sideSign * 3.6;
      const shotHeading = wrapAngle(baseAim + normIdx * spreadScale + (rand() - 0.5) * spreadScale * 0.85);
      const speed = projSpeed * (1.0 - i * 0.02);

      const mx = enemy.x + fwdX * along + stbX * lat;
      const my = enemy.y + 0.5;
      const mz = enemy.z + fwdZ * along + stbZ * lat;

      state.projectiles.push({
        id: `proj-${nextProjectileSeq++}`,
        owner: 'enemy',
        ownerId: enemy.id,
        enemyType: enemy.type,
        ammoType: enemy.ammoType,
        kind: enemy.ammoType,
        side,
        x: mx,
        y: my,
        z: mz,
        prevX: mx,
        prevY: my,
        prevZ: mz,
        vx: forwardX(shotHeading) * speed,
        vy: baseVy + (stratumMismatch ? (rand() - 0.5) * 3.2 : 0),
        vz: forwardZ(shotHeading) * speed,
        heading: shotHeading,
        age: 0,
        maxAge: 215 / Math.max(40, speed),
        damage: arch.damagePerGun,
        radius: 1.35,
        accuracyMult,
        fireChance: arch.fireChance,
        subsystemChance: arch.subsystemChance
      });
    }

    enemy.reloadTimer = enemy.reloadDuration * (enemy.crippled ? 1.25 : 1.0);

    emitEvent({
      type: 'broadside_fired',
      actor: 'enemy',
      shipId: enemy.id,
      side,
      count: gunCount,
      gunCount,
      ammoType: enemy.ammoType,
      origin: { x: enemy.x, y: enemy.y, z: enemy.z },
      x: enemy.x,
      y: enemy.y,
      z: enemy.z,
      heading: enemy.heading
    });
  }

  function handleEnemySunk(enemy) {
    const arch = ENEMY_ARCHETYPES[enemy.type] || ENEMY_ARCHETYPES.cutter;
    state.score += arch.scoreValue;
    emitEvent({
      type: 'enemy_sunk',
      enemyId: enemy.id,
      enemyType: enemy.type,
      name: enemy.name,
      isBoss: Boolean(enemy.isBoss),
      scoreAwarded: arch.scoreValue,
      position: { x: enemy.x, y: enemy.y, z: enemy.z },
      x: enemy.x,
      y: enemy.y,
      z: enemy.z
    });
  }

  function checkWaveCompletion() {
    if (state.phase !== 'playing') return;
    if (pendingNextWave !== null) return;
    if (state.enemies.length > 0) return;

    const clearedWave = state.wave;
    const waveDef = WAVE_DEFINITIONS[clearedWave - 1] || WAVE_DEFINITIONS[0];
    state.score += waveDef.bonusScore;

    if (clearedWave < state.maxWaves) {
      const hullRefit = applyFieldRefit();
      pendingNextWave = clearedWave + 1;
      interWaveTimer = 0.95;
      emitEvent({
        type: 'wave_cleared',
        wave: clearedWave,
        maxWaves: state.maxWaves,
        nextWave: pendingNextWave,
        bonusScore: waveDef.bonusScore,
        hullRefit,
        position: { x: state.player.x, y: state.player.y, z: state.player.z },
        x: state.player.x,
        y: state.player.y,
        z: state.player.z
      });
    } else {
      emitEvent({
        type: 'wave_cleared',
        wave: clearedWave,
        maxWaves: state.maxWaves,
        nextWave: null,
        bonusScore: waveDef.bonusScore,
        hullRefit: 0,
        position: { x: state.player.x, y: state.player.y, z: state.player.z },
        x: state.player.x,
        y: state.player.y,
        z: state.player.z
      });
      state.phase = 'victory';
      emitEvent({
        type: 'victory',
        wave: clearedWave,
        score: state.score,
        hull: state.hull
      });
    }
  }

  function resolveShipObstacleCollisions(ship, shipRadius, isPlayer, dt) {
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      // Sky rocks rise from Y = -22m cloud floor up by obs.height
      const rockTopY = -22 + obs.height;
      if (ship.y > rockTopY + 3.0) continue;

      const dx = ship.x - obs.x;
      const dz = ship.z - obs.z;
      const dist = Math.hypot(dx, dz);
      const minDist = obs.radius + shipRadius;
      if (dist < minDist) {
        const nx = dist > 1e-4 ? dx / dist : 1;
        const nz = dist > 1e-4 ? dz / dist : 0;
        ship.x = obs.x + nx * minDist;
        ship.z = obs.z + nz * minDist;

        // Glancing deflection along rock tangent
        const fDotN = forwardX(ship.heading) * nx + forwardZ(ship.heading) * nz;
        if (fDotN < 0) {
          const tangentHeading = headingFromXZ(-nz, nx);
          const altHeading = wrapAngle(tangentHeading + Math.PI);
          const pick = Math.abs(shortestAngleDiff(ship.heading, tangentHeading)) <
            Math.abs(shortestAngleDiff(ship.heading, altHeading))
            ? tangentHeading
            : altHeading;
          ship.heading = wrapAngle(ship.heading + shortestAngleDiff(ship.heading, pick) * clamp(dt * 4.5, 0.15, 0.65));
          ship.speed *= 0.82;
        }

        if (isPlayer && state.phase === 'playing' && playerObstacleScrapeCooldown <= 0) {
          playerObstacleScrapeCooldown = 1.25;
          const scrapeDmg = 2.5;
          state.hull = Math.max(0, Math.round((state.hull - scrapeDmg) * 100) / 100);
          emitEvent({
            type: 'projectile_hit',
            target: 'player',
            targetId: 'player',
            owner: 'obstacle',
            ammoType: 'roundshot',
            kind: 'hit',
            damage: scrapeDmg,
            critical: false,
            ignited: false,
            crippled: false,
            position: { x: ship.x, y: ship.y, z: ship.z },
            x: ship.x,
            y: ship.y,
            z: ship.z
          });
        }
      }
    }

    // Soft windward push + hard arena radius clamp
    const r = Math.hypot(ship.x, ship.z);
    if (r > SOFT_BOUNDARY_RADIUS) {
      const inwardHeading = headingFromXZ(-ship.x, -ship.z);
      const pushT = clamp((r - SOFT_BOUNDARY_RADIUS) / (ARENA_RADIUS - SOFT_BOUNDARY_RADIUS), 0, 1);
      ship.heading = wrapAngle(ship.heading + shortestAngleDiff(ship.heading, inwardHeading) * pushT * dt * 2.4);
      if (r > ARENA_RADIUS) {
        const scale = ARENA_RADIUS / r;
        ship.x *= scale;
        ship.z *= scale;
      }
    }
  }

  function stepSubsystemsAndBoiler(dt) {
    // Cooldowns & Overpressure timer
    if (state.boiler.overcharged) {
      state.boiler.overchargeTimer = Math.max(0, state.boiler.overchargeTimer - dt);
      if (state.boiler.overchargeTimer <= 0) {
        state.boiler.overcharged = false;
      }
    }
    if (state.boiler.overchargeCooldown > 0) {
      state.boiler.overchargeCooldown = Math.max(0, state.boiler.overchargeCooldown - dt);
    }
    if (state.ventCooldown > 0) {
      state.ventCooldown = Math.max(0, state.ventCooldown - dt);
    }

    // Reload timers scale dynamically if player shifts power into/out of ordnance
    const targetReload = computeReloadDuration();
    state.reloadDuration = targetReload;
    if (state.portReload > 0) {
      state.portReload = Math.max(0, Math.min(state.portReload, targetReload) - dt);
    }
    if (state.starboardReload > 0) {
      state.starboardReload = Math.max(0, Math.min(state.starboardReload, targetReload) - dt);
    }

    // Subsystem fires, steam leaks & engineer crew repairs (+7.5 HP/s, ~3.5s fire extinguish)
    for (let i = 0; i < SUBSYSTEM_IDS.length; i++) {
      const id = SUBSYSTEM_IDS[i];
      const sub = state.subsystems[id];
      const crew = sub.crewAssigned;

      if (crew > 0) {
        // Active repair crew repairs +7.5 HP/s per crew and suppresses/extinguishes fires (~3.5s)
        sub.hp = Math.min(sub.maxHp, Math.round((sub.hp + 7.5 * crew * dt) * 1000) / 1000);
        if (sub.onFire) {
          subTimers[id].fireExtinguish += dt * crew;
          if (subTimers[id].fireExtinguish >= 3.5) {
            sub.onFire = false;
            subTimers[id].fireExtinguish = 0;
          }
        } else {
          subTimers[id].fireExtinguish = 0;
        }
        if (sub.steamLeak) {
          subTimers[id].leakSeal += dt * crew;
          if (subTimers[id].leakSeal >= 2.5) {
            sub.steamLeak = false;
            subTimers[id].leakSeal = 0;
          }
        } else {
          subTimers[id].leakSeal = 0;
        }
      } else {
        subTimers[id].fireExtinguish = Math.max(0, subTimers[id].fireExtinguish - dt * 0.5);
        subTimers[id].leakSeal = Math.max(0, subTimers[id].leakSeal - dt * 0.5);

        if (sub.onFire && state.phase === 'playing') {
          sub.hp = Math.max(0, Math.round((sub.hp - 2.4 * dt) * 1000) / 1000);
          state.hull = Math.max(0, Math.round((state.hull - 0.65 * dt) * 1000) / 1000);
        }
        if (sub.steamLeak && state.phase === 'playing') {
          sub.hp = Math.max(0, Math.round((sub.hp - 1.2 * dt) * 1000) / 1000);
        }
      }
    }

    syncBoilerInvariants();
  }

  function stepPlayerNavigation(dt, input) {
    const turnInput = clamp(finiteOr(input?.turn, finiteOr(input?.steer, 0)), -1, 1);
    if (input && Number.isFinite(input.throttle) && input.throttleDelta === undefined) {
      state.player.throttle = clamp(input.throttle, 0, 1);
    } else {
      const throttleDelta = clamp(finiteOr(input?.throttleDelta, 0), -1, 1);
      if (Math.abs(throttleDelta) > 1e-5) {
        state.player.throttle = clamp(state.player.throttle + throttleDelta * 0.78 * dt, 0, 1);
      }
    }

    if (state.player.crippledTimer > 0) {
      state.player.crippledTimer = Math.max(0, state.player.crippledTimer - dt);
      state.player.crippled = state.player.crippledTimer > 0;
    } else {
      state.player.crippled = false;
    }

    if (playerObstacleScrapeCooldown > 0) {
      playerObstacleScrapeCooldown = Math.max(0, playerObstacleScrapeCooldown - dt);
    }

    // Wind slowly shifts direction & gusts between 14 and 24 knots
    state.wind.angle = wrapAngle(0.72 + Math.sin(simElapsed * 0.038) * 0.85 + Math.cos(simElapsed * 0.017) * 0.35);
    state.wind.knots = Math.round(clamp(19.0 + Math.sin(simElapsed * 0.11) * 4.2 + Math.cos(simElapsed * 0.047) * 0.8, 14, 24) * 100) / 100;

    //Title screen gentle idle trim
    if (state.phase === 'title') {
      state.player.roll = Math.sin(simElapsed * 1.25) * 0.04;
      state.player.pitch = Math.cos(simElapsed * 0.95) * 0.025;
      syncWindAndTrim();
      return;
    }

    const propSub = state.subsystems.propulsor;
    const rigSub = state.subsystems.rigging;
    const sponSub = state.subsystems.sponsons;

    const propEff = clamp(
      (0.35 + 0.65 * (propSub.hp / Math.max(1, propSub.maxHp))) * (propSub.steamLeak ? 0.85 : 1.0),
      0.25,
      1.0
    );
    const rigEff = clamp(
      (rigSub.hp / Math.max(1, rigSub.maxHp)) * (rigSub.steamLeak ? 0.85 : 1.0),
      0,
      1.0
    );
    const sponEff = clamp(
      (0.40 + 0.60 * (sponSub.hp / Math.max(1, sponSub.maxHp))) * (sponSub.steamLeak ? 0.85 : 1.0),
      0.30,
      1.0
    );

    const crippleMult = state.player.crippled ? 0.5 : 1.0;

    // Rudder turn rate driven by propulsion boiler allocation + propulsor & rigging health
    const baseTurnRate = (0.52 + state.boiler.allocation.propulsion * 0.082) * propEff * (0.78 + 0.22 * rigEff) * crippleMult;
    if (Math.abs(turnInput) > 1e-4) {
      // turnInput < 0 ('A' / Port) increases heading (+Y CCW); turnInput > 0 ('D' / Starboard) decreases heading
      state.player.heading = wrapAngle(state.player.heading - turnInput * baseTurnRate * dt);
    }

    const sailTrim = computeSailTrimMultiplier(state.player.heading, state.wind.angle, rigEff);
    const boilerThrustSpeed = (3.8 + state.boiler.allocation.propulsion * 1.62) * propEff;
    const windSailSpeed = (state.wind.knots * 0.54) * sailTrim;
    const fullSpeed = (boilerThrustSpeed * 0.56 + windSailSpeed * 0.72) * crippleMult;
    const targetSpeed = fullSpeed * state.player.throttle;

    const accelRate = targetSpeed > state.player.speed ? 6.2 : 4.8;
    state.player.speed = Math.max(0, lerp(state.player.speed, targetSpeed, clamp(dt * accelRate, 0, 1)));

    state.player.x += forwardX(state.player.heading) * state.player.speed * dt;
    state.player.z += forwardZ(state.player.heading) * state.player.speed * dt;

    // Altitude stratum transition powered by Sponsons boiler bar + subsystem health
    const targetY = STRATA_ALTITUDES[state.targetStratum] ?? STRATA_ALTITUDES.mid;
    const dy = targetY - state.player.y;
    const climbRate = (2.8 + state.boiler.allocation.sponsons * 0.92) * sponEff;
    let vy = 0;
    if (Math.abs(dy) > 0.02) {
      const maxStepY = climbRate * dt;
      const moveY = clamp(dy, -maxStepY, maxStepY);
      state.player.y += moveY;
      vy = moveY / Math.max(1e-4, dt);
    } else {
      state.player.y = targetY;
    }

    if (Math.abs(state.player.y - targetY) <= 1.2) {
      state.stratum = state.targetStratum;
    } else {
      state.stratum = nearestStratumName(state.player.y);
    }

    resolveShipObstacleCollisions(state.player, PLAYER_RADIUS, true, dt);

    const targetRoll = turnInput * 0.14 + Math.sin(simElapsed * 1.35) * 0.032;
    const targetPitch = clamp(vy * 0.024, -0.20, 0.20) + Math.cos(simElapsed * 1.05) * 0.02;
    state.player.roll = lerp(state.player.roll, targetRoll, clamp(dt * 6.0, 0, 1));
    state.player.pitch = lerp(state.player.pitch, targetPitch, clamp(dt * 6.0, 0, 1));

    syncWindAndTrim();
  }

  function stepEnemies(dt) {
    if (state.phase !== 'playing') return;

    const sunkList = [];

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      const arch = ENEMY_ARCHETYPES[e.type] || ENEMY_ARCHETYPES.cutter;

      // Burn damage over time from Aether-Shell ignition
      if (e.fireTimer > 0) {
        e.fireTimer = Math.max(0, e.fireTimer - dt);
        e.onFire = e.fireTimer > 0;
        e.hull = Math.max(0, Math.round((e.hull - 6.8 * dt) * 1000) / 1000);
        e.hp = e.hull;
        if (e.hull <= 0) {
          sunkList.push(e);
          continue;
        }
      } else {
        e.onFire = false;
      }

      if (e.crippledTimer > 0) {
        e.crippledTimer = Math.max(0, e.crippledTimer - dt);
        e.crippled = e.crippledTimer > 0;
      } else {
        e.crippled = false;
      }

      if (e.reloadTimer > 0) {
        e.reloadTimer = Math.max(0, e.reloadTimer - dt);
      }

      // Tactical stratum maneuver every ~10s
      e.stratumSwitchTimer -= dt;
      if (e.stratumSwitchTimer <= 0) {
        e.stratumSwitchTimer = 9.5 + rand() * 5.0;
        // Move closer to player's stratum 65% of the time, or flank high/low 35% of the time
        if (rand() < 0.65) {
          e.targetStratum = state.stratum;
        } else {
          e.targetStratum = VALID_STRATA[Math.floor(rand() * VALID_STRATA.length)];
        }
      }

      const targetY = STRATA_ALTITUDES[e.targetStratum] ?? STRATA_ALTITUDES.mid;
      const dy = targetY - e.y;
      const eClimb = 4.2 * (e.crippled ? 0.6 : 1.0);
      if (Math.abs(dy) > 0.02) {
        e.y += clamp(dy, -eClimb * dt, eClimb * dt);
      } else {
        e.y = targetY;
      }
      e.stratum = Math.abs(e.y - targetY) <= 1.2 ? e.targetStratum : nearestStratumName(e.y);

      // Tactical broadside orbit AI
      const toPlayerX = state.player.x - e.x;
      const toPlayerZ = state.player.z - e.z;
      const distToPlayer = Math.max(1, Math.hypot(toPlayerX, toPlayerZ));
      const bearingToPlayer = headingFromXZ(toPlayerX, toPlayerZ);

      let desiredHeading;
      if (distToPlayer > arch.preferredRange + 34) {
        // Tack inward at an angled approach
        desiredHeading = wrapAngle(bearingToPlayer + e.orbitSign * 0.42);
      } else if (distToPlayer < arch.preferredRange - 32) {
        // Sheer off to open broadside range
        desiredHeading = wrapAngle(bearingToPlayer + e.orbitSign * 2.15);
      } else {
        // Hold broadside beam orbit!
        desiredHeading = wrapAngle(bearingToPlayer + e.orbitSign * (Math.PI * 0.5));
      }

      // Obstacle & fleet separation steering
      let avoidX = 0;
      let avoidZ = 0;
      for (let j = 0; j < obstacles.length; j++) {
        const obs = obstacles[j];
        const ox = e.x - obs.x;
        const oz = e.z - obs.z;
        const od = Math.hypot(ox, oz);
        const safeDist = obs.radius + e.radius + 34;
        if (od < safeDist && od > 1e-3) {
          const weight = (safeDist - od) / safeDist;
          avoidX += (ox / od) * weight * 2.2;
          avoidZ += (oz / od) * weight * 2.2;
        }
      }
      for (let j = 0; j < state.enemies.length; j++) {
        if (i === j) continue;
        const other = state.enemies[j];
        const sx = e.x - other.x;
        const sz = e.z - other.z;
        const sd = Math.hypot(sx, sz);
        const minSep = e.radius + other.radius + 26;
        if (sd < minSep && sd > 1e-3) {
          const weight = (minSep - sd) / minSep;
          avoidX += (sx / sd) * weight * 1.5;
          avoidZ += (sz / sd) * weight * 1.5;
        }
      }

      if (Math.hypot(avoidX, avoidZ) > 0.08) {
        const avoidHeading = headingFromXZ(
          forwardX(desiredHeading) + avoidX,
          forwardZ(desiredHeading) + avoidZ
        );
        desiredHeading = avoidHeading;
      }

      const crippleMult = e.crippled ? 0.5 : 1.0;
      const maxTurnStep = arch.turnRate * crippleMult * dt;
      const headingErr = shortestAngleDiff(e.heading, desiredHeading);
      e.heading = wrapAngle(e.heading + clamp(headingErr, -maxTurnStep, maxTurnStep));

      const windTrim = computeSailTrimMultiplier(e.heading, state.wind.angle, 1.0);
      const targetSpeed = arch.speedMax * lerp(0.75, 1.08, (windTrim - 0.45) / 0.90) * crippleMult;
      e.speed = lerp(e.speed, targetSpeed, clamp(dt * 3.5, 0, 1));

      e.x += forwardX(e.heading) * e.speed * dt;
      e.z += forwardZ(e.heading) * e.speed * dt;

      resolveShipObstacleCollisions(e, e.radius, false, dt);

      e.forwardX = forwardX(e.heading);
      e.forwardZ = forwardZ(e.heading);
      e.vx = e.forwardX * e.speed;
      e.vz = e.forwardZ * e.speed;
      e.speedKnots = Math.round(e.speed * MPS_TO_KNOTS * 100) / 100;
      e.roll = clamp(-headingErr * 0.12, -0.15, 0.15) + Math.sin(simElapsed * 1.4 + i) * 0.03;
      e.pitch = Math.cos(simElapsed * 1.1 + i) * 0.02;

      // Ship-to-player separation so hulls never overlap
      const sepX = state.player.x - e.x;
      const sepZ = state.player.z - e.z;
      const sepDist = Math.hypot(sepX, sepZ);
      const minHullDist = PLAYER_RADIUS + e.radius;
      if (sepDist < minHullDist && sepDist > 1e-4) {
        const nx = sepX / sepDist;
        const nz = sepZ / sepDist;
        const push = (minHullDist - sepDist) * 0.5;
        state.player.x += nx * push;
        state.player.z += nz * push;
        e.x -= nx * push;
        e.z -= nz * push;
      }

      // Check broadside firing opportunity on Port or Starboard beam
      if (e.reloadTimer <= 0 && distToPlayer <= 205) {
        const portBeam = wrapAngle(e.heading + Math.PI * 0.5);
        const starboardBeam = wrapAngle(e.heading - Math.PI * 0.5);
        const portDiff = Math.abs(shortestAngleDiff(portBeam, bearingToPlayer));
        const starboardDiff = Math.abs(shortestAngleDiff(starboardBeam, bearingToPlayer));
        if (portDiff <= BROADSIDE_CONE_HALF_ANGLE) {
          fireEnemyBroadside(e, 'port');
        } else if (starboardDiff <= BROADSIDE_CONE_HALF_ANGLE) {
          fireEnemyBroadside(e, 'starboard');
        }
      }
    }

    if (sunkList.length > 0) {
      state.enemies = state.enemies.filter((e) => e.hull > 0);
      for (let i = 0; i < sunkList.length; i++) {
        handleEnemySunk(sunkList[i]);
      }
      checkWaveCompletion();
    }
  }

  function stepProjectiles(dt) {
    if (state.projectiles.length === 0) return;

    const surviving = [];
    const newlySunkEnemies = [];

    for (let i = 0; i < state.projectiles.length; i++) {
      const p = state.projectiles[i];
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Subtle ballistic gravity arc
      p.vy -= 2.2 * dt;
      p.age += dt;

      if (p.age >= p.maxAge || p.y < -23.5) {
        if (p.y < -23.5) {
          emitEvent({
            type: 'projectile_hit',
            target: 'cloud',
            targetId: null,
            owner: p.owner,
            ammoType: p.ammoType,
            kind: 'splash',
            damage: 0,
            critical: false,
            ignited: false,
            crippled: false,
            position: { x: p.x, y: -22, z: p.z },
            x: p.x,
            y: -22,
            z: p.z
          });
        }
        continue;
      }

      // Check sky-rock obstacle intercept
      let hitObstacle = false;
      for (let j = 0; j < obstacles.length; j++) {
        const obs = obstacles[j];
        const rockTopY = -22 + obs.height;
        if (p.y <= rockTopY && Math.hypot(p.x - obs.x, p.z - obs.z) <= obs.radius) {
          hitObstacle = true;
          emitEvent({
            type: 'projectile_hit',
            target: 'obstacle',
            targetId: obs.id,
            owner: p.owner,
            ammoType: p.ammoType,
            kind: 'splash',
            damage: 0,
            critical: false,
            ignited: false,
            crippled: false,
            position: { x: p.x, y: p.y, z: p.z },
            x: p.x,
            y: p.y,
            z: p.z
          });
          break;
        }
      }
      if (hitObstacle) continue;

      if (p.owner === 'player') {
        let hitEnemy = null;
        for (let j = 0; j < state.enemies.length; j++) {
          const e = state.enemies[j];
          if (e.hull <= 0) continue;
          const hitRadius = e.radius + p.radius + 1.8;
          const seg = distSqPointToSegment3D(e.x, e.y, e.z, p.prevX, p.prevY, p.prevZ, p.x, p.y, p.z);
          if (seg.distSq <= hitRadius * hitRadius) {
            hitEnemy = e;
            break;
          }
        }

        if (hitEnemy) {
          const arch = ENEMY_ARCHETYPES[hitEnemy.type] || ENEMY_ARCHETYPES.cutter;
          const ammoSpec = AMMO_SPECS[p.ammoType] || AMMO_SPECS.roundshot;
          const isCrit = rand() < ammoSpec.critChance;
          // Aether-shells pierce ironclad armor cleanly
          const armorFactor = p.ammoType === 'aethershell' ? 1.0 : arch.armorMult;
          const finalDmg = Math.round(p.damage * armorFactor * (isCrit ? 1.35 : 1.0) * 100) / 100;

          hitEnemy.hull = Math.max(0, Math.round((hitEnemy.hull - finalDmg) * 100) / 100);
          hitEnemy.hp = hitEnemy.hull;
          state.score += Math.round(finalDmg * 4);

          let ignited = false;
          let crippled = false;
          if (ammoSpec.crippleDuration > 0) {
            hitEnemy.crippledTimer = Math.max(hitEnemy.crippledTimer, ammoSpec.crippleDuration);
            hitEnemy.crippled = true;
            hitEnemy.speed = Math.min(hitEnemy.speed, arch.speedMax * 0.5);
            crippled = true;
          }
          if (ammoSpec.fireChance > 0 && rand() < ammoSpec.fireChance) {
            const wasBurning = hitEnemy.onFire;
            hitEnemy.fireTimer = Math.max(hitEnemy.fireTimer, 8.0);
            hitEnemy.onFire = true;
            ignited = true;
            if (!wasBurning) {
              emitEvent({
                type: 'fire_started',
                target: 'enemy',
                targetId: hitEnemy.id,
                subsystem: null,
                position: { x: hitEnemy.x, y: hitEnemy.y, z: hitEnemy.z },
                x: hitEnemy.x,
                y: hitEnemy.y,
                z: hitEnemy.z
              });
            }
          }

          const vfxKind = ignited ? 'fire' : isCrit ? 'crit' : 'hit';
          emitEvent({
            type: 'projectile_hit',
            target: 'enemy',
            targetId: hitEnemy.id,
            owner: 'player',
            ammoType: p.ammoType,
            kind: vfxKind,
            damage: finalDmg,
            critical: isCrit,
            ignited,
            crippled,
            position: { x: p.x, y: p.y, z: p.z },
            x: p.x,
            y: p.y,
            z: p.z
          });

          if (hitEnemy.hull <= 0 && !newlySunkEnemies.includes(hitEnemy)) {
            newlySunkEnemies.push(hitEnemy);
          }
          continue;
        }
      } else if (p.owner === 'enemy' && state.phase === 'playing') {
        const hitRadius = PLAYER_RADIUS + p.radius + 0.8;
        const seg = distSqPointToSegment3D(
          state.player.x,
          state.player.y,
          state.player.z,
          p.prevX,
          p.prevY,
          p.prevZ,
          p.x,
          p.y,
          p.z
        );

        if (seg.distSq <= hitRadius * hitRadius) {
          // Stratum mismatch evasion: 40% incoming accuracy reduction!
          if (p.accuracyMult < 1.0 && rand() > p.accuracyMult) {
            // Grazing stratum-evasion miss!
            emitEvent({
              type: 'projectile_hit',
              target: 'evaded',
              targetId: 'player',
              owner: 'enemy',
              ammoType: p.ammoType,
              kind: 'splash',
              damage: 0,
              critical: false,
              ignited: false,
              crippled: false,
              position: { x: p.x, y: p.y, z: p.z },
              x: p.x,
              y: p.y,
              z: p.z
            });
            continue;
          }

          const isCrit = rand() < 0.16;
          const hullDmg = Math.round(p.damage * (isCrit ? 1.25 : 1.0) * 100) / 100;
          state.hull = Math.max(0, Math.round((state.hull - hullDmg) * 100) / 100);

          let ignited = false;
          if (rand() < finiteOr(p.subsystemChance, 0.34)) {
            const subId = SUBSYSTEM_IDS[Math.floor(rand() * SUBSYSTEM_IDS.length)];
            const subDmg = Math.round((6.0 + rand() * 8.0) * 10) / 10;
            const wantFire = rand() < finiteOr(p.fireChance, 0.20);
            const wantLeak = (subId === 'boiler' || subId === 'propulsor') && rand() < 0.22;
            ignited = wantFire && !state.subsystems[subId].onFire;
            damageSubsystem(subId, subDmg, { fire: wantFire, steamLeak: wantLeak });
          }

          emitEvent({
            type: 'projectile_hit',
            target: 'player',
            targetId: 'player',
            owner: 'enemy',
            ammoType: p.ammoType,
            kind: ignited ? 'fire' : isCrit ? 'crit' : 'hit',
            damage: hullDmg,
            critical: isCrit,
            ignited,
            crippled: false,
            position: { x: p.x, y: p.y, z: p.z },
            x: p.x,
            y: p.y,
            z: p.z
          });
          continue;
        }
      }

      surviving.push(p);
    }

    state.projectiles = surviving;

    if (newlySunkEnemies.length > 0) {
      state.enemies = state.enemies.filter((e) => e.hull > 0);
      for (let i = 0; i < newlySunkEnemies.length; i++) {
        handleEnemySunk(newlySunkEnemies[i]);
      }
      checkWaveCompletion();
    }
  }

  function stepSingleSubframe(dt, input) {
    simElapsed += dt;

    stepSubsystemsAndBoiler(dt);
    stepPlayerNavigation(dt, input);
    stepEnemies(dt);
    stepProjectiles(dt);

    // Check defeat condition
    if (state.phase === 'playing' && state.hull <= 0) {
      state.hull = 0;
      state.phase = 'defeat';
      interWaveTimer = 0;
      pendingNextWave = null;
      emitEvent({
        type: 'defeat',
        wave: state.wave,
        score: state.score
      });
      return;
    }

    // Auto-advance inter-wave transition if caller did not already invoke startWave(nextWave)
    if (state.phase === 'playing' && pendingNextWave !== null) {
      interWaveTimer -= dt;
      if (interWaveTimer <= 0) {
        const nextW = pendingNextWave;
        pendingNextWave = null;
        startWave(nextW);
      }
    }
  }

  function step(dt, input = {}) {
    const safeDt = finiteOr(dt, 0);
    if (safeDt <= 0) {
      const flushed = pendingEvents;
      pendingEvents = [];
      return flushed;
    }

    // Clamp extreme lag spikes & substep larger timesteps so ballistics never tunnel
    const totalDt = Math.min(safeDt, 0.5);
    const maxSubDt = 0.04;
    const steps = Math.max(1, Math.ceil(totalDt / maxSubDt));
    const subDt = totalDt / steps;

    for (let s = 0; s < steps; s++) {
      stepSingleSubframe(subDt, input);
    }

    const flushed = pendingEvents;
    pendingEvents = [];
    return flushed;
  }

  reset();
  return api;
}
