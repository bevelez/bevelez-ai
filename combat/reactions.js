/**
 * combat/reactions.js — DJ KRONOS Phase 3 ("Dead as Disco") Reaction Library
 *
 * Implements:
 * 1. Directional hit reaction profiles with three-phase Sifu-style curves (impact snap, overshoot, recovery):
 *    - `hit-react-jab` (left/right directional snap)
 *    - `hit-react-cross` (lateral twist + medium knockback)
 *    - `hit-react-uppercut` (vertical launch + apex air-hang + juggle support + `land` clip)
 *    - `hit-react-kick` (heavy radial knockback toward the perimeter barricades)
 *    - `counter-riposte` (scripted counter punish reaction)
 * 2. Barricade wall-slam detection & reaction:
 *    - When knockback pushes an enemy to `hypot(x, z) >= BARRICADE_WALL_SLAM_RADIUS` (`3.95m`, `ARENA_RADIUS - 0.15`),
 *      triggers `wall_slam` state with inward rebound velocity, bonus wall-bounce damage, camera trauma,
 *      and transitions the enemy into `dazed` vulnerability for finishers/takedowns.
 * 3. Player hurt (`150 ms` hit-stun + `hurt-light` / `hurt-heavy` pose/clip) and player guard / `guard-break` handling.
 *
 * Joint-limit invariant:
 * - Enemy rigs (+Z facing): `elbow.x` in `[-1.65, 0]`, `knee.x` in `[0, 1.65]`,
 *   `torso.x` in `[-0.55, 0.55]`, `torso.y` in `[-0.85, 0.85]`, `torso.z` in `[-0.45, 0.45]`.
 * - Player rig (-Z facing): `elbow.x` in `[0, 1.65]`, `knee.x` in `[-1.65, 0]`,
 *   `torso.x` in `[-0.55, 0.55]`, `torso.y` in `[-0.85, 0.85]`, `torso.z` in `[-0.45, 0.45]`.
 */

export const ARENA_RADIUS = 4.10;
export const BARRICADE_OFFSET = 0.15;
export const BARRICADE_WALL_SLAM_RADIUS = 3.95; // ARENA_RADIUS - 0.15 (3.95m)
export const PLAYER_HIT_STUN_SEC = 0.150;
export const WALL_SLAM_BONUS_DAMAGE = 24;
export const WALL_SLAM_DURATION_SEC = 0.38;
export const DAZED_DURATION_SEC = 2.20;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function setVec3(target, x, y, z) {
  if (!target) return { x, y, z };
  if (typeof target.set === 'function') {
    target.set(x, y, z);
    return target;
  }
  target.x = x;
  target.y = y;
  target.z = z;
  return target;
}

function cloneVec3(v) {
  if (!v) return { x: 0, y: 0, z: 0 };
  if (typeof v.clone === 'function') return v.clone();
  return { x: v.x || 0, y: v.y || 0, z: v.z || 0 };
}

/**
 * Computes the barricade wall-slam trigger radius (`3.95m` by default, or `arenaRadius - 0.15` when <= 4.10m).
 *
 * @param {number} [arenaRadius]
 * @returns {number}
 */
export function getWallSlamRadius(arenaRadius) {
  if (typeof arenaRadius === 'number' && Number.isFinite(arenaRadius)) {
    return Math.min(BARRICADE_WALL_SLAM_RADIUS, arenaRadius - BARRICADE_OFFSET);
  }
  return BARRICADE_WALL_SLAM_RADIUS;
}

/**
 * Three-phase Sifu-style reaction curve:
 * - Phase 1 (0.00 -> 0.18): Snappy force-to-impact ramp with 1.12x overshoot
 * - Phase 2 (0.18 -> 0.42): Overshoot hold & compression
 * - Phase 3 (0.42 -> 1.00): Smooth release back to neutral control
 *
 * @param {number} normTime - Normalized reaction progress in `[0, 1]` (0 = start, 1 = end)
 * @returns {number} Envelope multiplier in `[0, 1.12]`
 */
export function evaluateReactionPhaseCurve(normTime) {
  const t = clamp(normTime, 0.0, 1.0);
  if (t < 0.18) {
    const u = t / 0.18;
    return Math.sin(u * Math.PI * 0.5) * 1.12;
  }
  if (t < 0.42) {
    const u = (t - 0.18) / 0.24;
    return 1.12 - u * 0.17; // 1.12 -> 0.95
  }
  const u = (t - 0.42) / 0.58;
  return 0.95 * (1.0 - u * u * (3.0 - 2.0 * u));
}

/**
 * Canonical directional hit reaction profiles.
 */
export const HIT_REACTION_PROFILES = {
  'hit-react-jab': {
    recoilType: 'hit-react-jab',
    clipName: 'hurt-light',
    recoilVector: { x: 0.16, y: 0.0, z: -0.38 },
    targetTorsoRot: { x: -0.24, y: 0.22, z: -0.06 },
    targetHeadRot: { x: -0.18, y: 0.20, z: -0.10 },
    pushSpeed: 1.20,
    recoilDur: 0.48,
    launchVelocityY: 0.0,
    airHangSec: 0.0,
    microAxis: 'x',
    microAmp: 0.06,
    microDur: 0.048,
    vfxType: 'spark-burst'
  },
  'hit-react-jab-R': {
    recoilType: 'hit-react-jab',
    clipName: 'hurt-light',
    recoilVector: { x: -0.16, y: 0.0, z: -0.38 },
    targetTorsoRot: { x: -0.24, y: -0.22, z: 0.06 },
    targetHeadRot: { x: -0.18, y: -0.20, z: 0.10 },
    pushSpeed: 1.20,
    recoilDur: 0.48,
    launchVelocityY: 0.0,
    airHangSec: 0.0,
    microAxis: 'x',
    microAmp: 0.06,
    microDur: 0.048,
    vfxType: 'spark-burst'
  },
  'hit-react-cross': {
    recoilType: 'hit-react-cross',
    clipName: 'hurt-light',
    recoilVector: { x: -0.45, y: 0.0, z: -0.62 },
    targetTorsoRot: { x: -0.28, y: -0.34, z: 0.10 },
    targetHeadRot: { x: -0.22, y: -0.30, z: 0.14 },
    pushSpeed: 1.65,
    recoilDur: 0.55,
    launchVelocityY: 0.0,
    airHangSec: 0.0,
    microAxis: 'x',
    microAmp: 0.10,
    microDur: 0.070,
    vfxType: 'slash-spark'
  },
  'hit-react-uppercut': {
    recoilType: 'hit-react-uppercut',
    clipName: 'launch',
    landClipName: 'land',
    recoilVector: { x: 0.0, y: 0.95, z: -0.42 },
    targetTorsoRot: { x: -0.38, y: 0.0, z: 0.0 },
    targetHeadRot: { x: -0.36, y: 0.0, z: 0.0 },
    pushSpeed: 1.25,
    recoilDur: 0.72,
    launchVelocityY: 3.45,
    gravity: 12.8,
    airHangSec: 0.14,
    microAxis: 'y',
    microAmp: 0.14,
    microDur: 0.110,
    vfxType: 'impact-ring'
  },
  'hit-react-kick': {
    recoilType: 'hit-react-kick',
    clipName: 'hurt-heavy',
    recoilVector: { x: 0.85, y: 0.30, z: -1.15 },
    targetTorsoRot: { x: -0.34, y: 0.42, z: 0.18 },
    targetHeadRot: { x: -0.24, y: 0.35, z: 0.16 },
    pushSpeed: 4.45,
    recoilDur: 0.68,
    launchVelocityY: 0.0,
    airHangSec: 0.0,
    microAxis: 'xy',
    microAmp: 0.18,
    microDur: 0.100,
    vfxType: 'comic-starburst-3d'
  },
  'counter-riposte': {
    recoilType: 'counter-riposte',
    clipName: 'stagger',
    recoilVector: { x: 0.0, y: 0.25, z: -1.25 },
    targetTorsoRot: { x: -0.36, y: 0.28, z: -0.12 },
    targetHeadRot: { x: -0.28, y: 0.24, z: -0.10 },
    pushSpeed: 3.10,
    recoilDur: 0.75,
    launchVelocityY: 1.6,
    airHangSec: 0.06,
    microAxis: 'xy',
    microAmp: 0.16,
    microDur: 0.095,
    vfxType: 'comic-starburst-3d'
  }
};

/**
 * Enemy (+Z facing rig) poses for special reaction states.
 * All angles strictly satisfy +Z joint limits:
 *   leftElbow.x, rightElbow.x in [-1.65, 0]
 *   leftKnee.x, rightKnee.x in [0, 1.65]
 *   torso.x in [-0.55, 0.55], torso.y in [-0.85, 0.85], torso.z in [-0.45, 0.45]
 */
export const ENEMY_REACTION_POSES = {
  launch: {
    hips: [0.08, 0, 0],
    torso: [-0.38, 0.0, 0.0],
    headGroup: [-0.32, 0.0, 0.0],
    leftArm: [-1.15, 0.20, -0.45],
    leftElbow: [-0.45, 0, 0],
    rightArm: [-1.15, -0.20, 0.45],
    rightElbow: [-0.45, 0, 0],
    leftLeg: [-0.35, 0, -0.12],
    leftKnee: [0.55, 0, 0],
    leftAnkle: [0.15, 0, 0],
    rightLeg: [-0.25, 0, 0.12],
    rightKnee: [0.48, 0, 0],
    rightAnkle: [0.15, 0, 0]
  },
  land: {
    hips: [-0.12, 0, 0],
    torso: [0.28, 0.0, 0.0],
    headGroup: [0.18, 0.0, 0.0],
    leftArm: [-0.55, 0.15, -0.35],
    leftElbow: [-0.85, 0, 0],
    rightArm: [-0.55, -0.15, 0.35],
    rightElbow: [-0.85, 0, 0],
    leftLeg: [-0.28, 0, -0.10],
    leftKnee: [0.62, 0, 0],
    leftAnkle: [-0.18, 0, 0],
    rightLeg: [-0.28, 0, 0.10],
    rightKnee: [0.62, 0, 0],
    rightAnkle: [-0.18, 0, 0]
  },
  wall_slam: {
    hips: [0.10, 0, 0],
    torso: [0.36, 0.0, 0.0],
    headGroup: [0.26, 0.0, 0.0],
    leftArm: [-0.35, 0.25, -0.52],
    leftElbow: [-0.30, 0, 0],
    rightArm: [-0.35, -0.25, 0.52],
    rightElbow: [-0.30, 0, 0],
    leftLeg: [0.18, 0, -0.14],
    leftKnee: [0.32, 0, 0],
    leftAnkle: [0.0, 0, 0],
    rightLeg: [0.18, 0, 0.14],
    rightKnee: [0.32, 0, 0],
    rightAnkle: [0.0, 0, 0]
  },
  dazed: {
    hips: [-0.06, 0, 0],
    torso: [0.24, 0.0, 0.0],
    headGroup: [0.16, 0.0, 0.0],
    leftArm: [-0.28, 0, -0.36],
    leftElbow: [-0.42, 0, 0],
    rightArm: [-0.28, 0, 0.36],
    rightElbow: [-0.42, 0, 0],
    leftLeg: [-0.12, 0, -0.08],
    leftKnee: [0.22, 0, 0],
    leftAnkle: [0.0, 0, 0],
    rightLeg: [-0.12, 0, 0.08],
    rightKnee: [0.22, 0, 0],
    rightAnkle: [0.0, 0, 0]
  }
};

/**
 * Player (-Z facing rig) poses for hurt, guard, guard-break, and counter-riposte.
 * All angles strictly satisfy -Z joint limits:
 *   leftElbow.x, rightElbow.x in [0, 1.65]
 *   leftKnee.x, rightKnee.x in [-1.65, 0]
 *   torso.x in [-0.55, 0.55], torso.y in [-0.85, 0.85], torso.z in [-0.45, 0.45]
 */
export const PLAYER_REACTION_POSES = {
  'hurt-light': {
    hips: [-0.10, 0.12, -0.06],
    torso: [-0.22, 0.18, -0.08],
    headGroup: [-0.16, -0.14, 0.06],
    leftArm: [0.48, 0.22, -0.44],
    leftElbow: [1.38, 0, 0],
    rightArm: [0.52, -0.22, 0.44],
    rightElbow: [1.36, 0, 0],
    leftLeg: [0.26, 0.10, -0.18],
    leftKnee: [-0.42, 0, 0],
    leftAnkle: [0.18, 0, 0.12],
    rightLeg: [-0.18, -0.10, 0.18],
    rightKnee: [-0.30, 0, 0],
    rightAnkle: [0.28, 0, -0.12]
  },
  'hurt-heavy': {
    hips: [-0.16, 0.20, -0.10],
    torso: [-0.34, 0.26, -0.12],
    headGroup: [-0.26, -0.22, 0.10],
    leftArm: [0.36, 0.28, -0.54],
    leftElbow: [1.46, 0, 0],
    rightArm: [0.42, -0.28, 0.54],
    rightElbow: [1.44, 0, 0],
    leftLeg: [0.32, 0.12, -0.22],
    leftKnee: [-0.52, 0, 0],
    leftAnkle: [0.22, 0, 0.14],
    rightLeg: [-0.24, -0.12, 0.22],
    rightKnee: [-0.40, 0, 0],
    rightAnkle: [0.34, 0, -0.14]
  },
  guard: {
    hips: [-0.06, -0.08, 0],
    torso: [0.12, -0.06, 0],
    headGroup: [-0.08, 0.06, 0],
    leftArm: [1.05, -0.28, -0.24],
    leftElbow: [1.52, 0, 0],
    rightArm: [1.08, 0.28, 0.24],
    rightElbow: [1.52, 0, 0],
    leftLeg: [0.28, 0.12, -0.18],
    leftKnee: [-0.44, 0, 0],
    leftAnkle: [0.18, 0, 0.14],
    rightLeg: [-0.18, -0.12, 0.18],
    rightKnee: [-0.32, 0, 0],
    rightAnkle: [0.34, 0, -0.14]
  },
  'guard-break': {
    hips: [-0.18, 0.14, 0],
    torso: [-0.32, 0.12, -0.08],
    headGroup: [-0.24, -0.10, 0.06],
    leftArm: [0.25, 0.35, -0.62],
    leftElbow: [0.85, 0, 0],
    rightArm: [0.28, -0.35, 0.62],
    rightElbow: [0.85, 0, 0],
    leftLeg: [0.34, 0.10, -0.22],
    leftKnee: [-0.54, 0, 0],
    leftAnkle: [0.22, 0, 0.14],
    rightLeg: [-0.26, -0.10, 0.22],
    rightKnee: [-0.42, 0, 0],
    rightAnkle: [0.36, 0, -0.14]
  },
  'counter-riposte': {
    hips: [0.08, 0.32, 0.06],
    torso: [0.14, 0.44, -0.06],
    headGroup: [-0.06, -0.32, 0],
    leftArm: [0.68, -0.24, -0.38],
    leftElbow: [1.38, 0, 0],
    rightArm: [1.62, 0.10, 0.14],
    rightElbow: [0.12, 0, 0],
    leftLeg: [0.18, 0.06, -0.14],
    leftKnee: [-0.20, 0, 0],
    leftAnkle: [0.08, 0, 0.06],
    rightLeg: [-0.22, 0.10, 0.16],
    rightKnee: [-0.12, 0, 0],
    rightAnkle: [0.28, 0, -0.08]
  }
};

/**
 * Returns a directional hit reaction profile for the given player attack.
 *
 * @param {string} action - `'punch'` | `'kick'` | `'counter-riposte'`
 * @param {number} [punchStep=0] - `0` (jab), `1` (cross), `2` (uppercut)
 * @param {Object} [options] - `{ sideSign, isFinisher }`
 * @returns {Object}
 */
export function getDirectionalHitReactionProfile(action, punchStep = 0, options = {}) {
  let base = HIT_REACTION_PROFILES['hit-react-jab'];
  if (action === 'counter-riposte') {
    base = HIT_REACTION_PROFILES['counter-riposte'];
  } else if (action === 'kick' || action === 'hit-react-kick') {
    base = HIT_REACTION_PROFILES['hit-react-kick'];
  } else if (punchStep === 1 || action === 'punch-cross' || action === 'hit-react-cross') {
    base = HIT_REACTION_PROFILES['hit-react-cross'];
  } else if (punchStep === 2 || action === 'punch-uppercut' || action === 'hit-react-uppercut') {
    base = HIT_REACTION_PROFILES['hit-react-uppercut'];
  } else if (options.sideSign && options.sideSign < 0) {
    base = HIT_REACTION_PROFILES['hit-react-jab-R'];
  }

  return {
    ...base,
    recoilVector: cloneVec3(base.recoilVector),
    targetTorsoRot: cloneVec3(base.targetTorsoRot),
    targetHeadRot: cloneVec3(base.targetHeadRot)
  };
}

/**
 * Applies a directional hit reaction (including vertical launch on uppercut and knockback velocity)
 * to an enemy entity.
 *
 * @param {Object} enemy - Bruiser or boss entity
 * @param {Object} [hitInfo] - `{ action, punchStep, damage, playerPos, isPerfect, isFinisher }`
 * @param {Object} [context] - Optional scene/gameState hooks
 * @returns {Object} Applied reaction summary
 */
export function applyEnemyHitReaction(enemy, hitInfo = {}, context = {}) {
  if (!enemy) return { applied: false };

  const action = hitInfo.action || 'punch';
  const punchStep = hitInfo.punchStep !== undefined ? hitInfo.punchStep : 0;
  const profile = hitInfo.profile || getDirectionalHitReactionProfile(action, punchStep, hitInfo);

  const playerPos = hitInfo.playerPos || (context.gameState && context.gameState.playerPos) || { x: 0, y: 0, z: 1.68 };
  const enemyPos = (enemy.rig && enemy.rig.root && enemy.rig.root.position) || enemy.position || { x: 0, y: 0, z: 0 };

  let dx = (enemyPos.x || 0) - (playerPos.x || 0);
  let dz = (enemyPos.z || 0) - (playerPos.z || 0);
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-4) {
    dx /= dist;
    dz /= dist;
  } else {
    dx = 0;
    dz = -1;
  }

  const wasAirborne = enemy.isAirborne || (enemy.rig && enemy.rig.hips && enemy.rig.hips.position.y > 1.08);
  const wasDazed = enemy.state === 'dazed' || enemy.isDazed;
  const damageMult = wasDazed ? 1.5 : 1.0;
  const finalDamage = Math.round((hitInfo.damage || 0) * damageMult);

  if (typeof enemy.hp === 'number' && finalDamage > 0 && !hitInfo.damageAlreadyApplied) {
    enemy.hp = Math.max(0, enemy.hp - finalDamage);
  }

  const pushSpeed = profile.pushSpeed * (hitInfo.isPerfect ? 1.15 : 1.0);
  if (!enemy.velocity) {
    enemy.velocity = { x: 0, y: 0, z: 0 };
  }
  setVec3(enemy.velocity, dx * pushSpeed, 0, dz * pushSpeed);

  enemy.recoilType = profile.recoilType;
  enemy.recoilVector = cloneVec3(profile.recoilVector);
  enemy.targetTorsoRot = cloneVec3(profile.targetTorsoRot);
  enemy.targetHeadRot = cloneVec3(profile.targetHeadRot);
  enemy.recoilElapsed = 0;
  enemy.recoilTotalTimer = profile.recoilDur;
  enemy.stateTimer = profile.recoilDur;

  const isLaunch = profile.recoilType === 'hit-react-uppercut' || profile.launchVelocityY > 0;
  if (isLaunch) {
    enemy.isAirborne = true;
    enemy.verticalVelocity = wasAirborne ? Math.max(2.6, profile.launchVelocityY * 0.85) : profile.launchVelocityY;
    enemy.airHangTimer = wasAirborne ? (profile.airHangSec * 1.25) : profile.airHangSec;
    enemy.juggleCount = wasAirborne ? ((enemy.juggleCount || 0) + 1) : 1;
    enemy.state = 'launch';
    if (enemy.rig && typeof enemy.rig.playClip === 'function') {
      enemy.rig.playClip('launch', { fadeInSec: 0.05, timeScale: 1.0, loop: false });
    }
  } else if (wasAirborne) {
    // Aerial juggle continuation when struck mid-air by jab/cross/kick
    enemy.verticalVelocity = Math.max(enemy.verticalVelocity || 0, 1.85);
    enemy.airHangTimer = Math.max(enemy.airHangTimer || 0, 0.08);
    enemy.juggleCount = (enemy.juggleCount || 0) + 1;
    enemy.state = 'hit';
    if (enemy.rig && typeof enemy.rig.playClip === 'function') {
      enemy.rig.playClip(profile.clipName || 'hurt-light', { fadeInSec: 0.04, timeScale: 1.0, loop: false });
    }
  } else {
    enemy.state = hitInfo.wasWindup ? 'stunned' : 'hit';
    if (hitInfo.wasWindup) {
      enemy.stateTimer = 1.25;
      enemy.recoilTotalTimer = 1.25;
    }
    if (enemy.rig && typeof enemy.rig.playClip === 'function') {
      enemy.rig.playClip(profile.clipName || 'hurt-light', { fadeInSec: 0.05, timeScale: 1.0, loop: false });
    }
  }

  enemy.isMicroShaking = true;
  enemy.microShakeDuration = profile.microDur;
  enemy.microShakeTimer = profile.microDur;
  enemy.microShakeAmp = profile.microAmp;
  enemy.microShakeVertAmp = profile.microAxis === 'y' ? 0.055 : 0.008;
  enemy.microShakeAxis = profile.microAxis;
  enemy.microShakeNormal = { x: -dz, y: 0, z: dx };

  if (enemy.teleMat) enemy.teleMat.opacity = 0;

  return {
    applied: true,
    recoilType: profile.recoilType,
    clipName: profile.clipName,
    isLaunch,
    wasJuggled: Boolean(wasAirborne),
    wasDazed,
    finalDamage
  };
}

/**
 * Checks if an enemy's knockback position has reached or crossed the perimeter barricade
 * (`hypot(x, z) >= ARENA_RADIUS - 0.15`, i.e. `3.95m`) and triggers a `wall_slam` reaction
 * with bonus damage, inward bounce, camera trauma, and `dazed` finisher vulnerability.
 *
 * @param {Object} enemy - Enemy entity with `.rig.root.position` or `.position`
 * @param {Object} [context] - `{ arenaRadius, wallSlamDamage, gameState, cameraJuice, floorDial, setStarburstText, audioEngine }`
 * @returns {{ triggered: boolean, radius: number, bonusDamage: number, state: string }}
 */
export function checkAndApplyWallSlam(enemy, context = {}) {
  if (!enemy) return { triggered: false, radius: 0, bonusDamage: 0, state: 'none' };
  const pos = (enemy.rig && enemy.rig.root && enemy.rig.root.position) || enemy.position;
  if (!pos) return { triggered: false, radius: 0, bonusDamage: 0, state: enemy.state || 'none' };

  const wallRadius = context.wallSlamRadius !== undefined
    ? context.wallSlamRadius
    : getWallSlamRadius(context.arenaRadius);

  const r = Math.hypot(pos.x || 0, pos.z || 0);
  const canSlam = (
    enemy.state === 'hit' ||
    enemy.state === 'launch' ||
    enemy.state === 'stunned' ||
    enemy.state === 'guard_break' ||
    enemy.state === 'dazed' ||
    Boolean(context.forceCheck)
  );

  if (!canSlam || r < wallRadius || enemy.state === 'wall_slam' || enemy.state === 'ko' || enemy.state === 'flying') {
    return { triggered: false, radius: r, bonusDamage: 0, state: enemy.state || 'none' };
  }

  const nx = r > 1e-5 ? (pos.x / r) : 0;
  const nz = r > 1e-5 ? (pos.z / r) : -1;

  // Clamp onto barricade perimeter and bounce slightly inward
  pos.x = nx * wallRadius;
  pos.z = nz * wallRadius;

  if (!enemy.velocity) enemy.velocity = { x: 0, y: 0, z: 0 };
  setVec3(enemy.velocity, -nx * 1.35, 0, -nz * 1.35);

  const bonusDamage = context.wallSlamDamage !== undefined ? context.wallSlamDamage : WALL_SLAM_BONUS_DAMAGE;
  if (typeof enemy.hp === 'number') {
    enemy.hp = Math.max(0, enemy.hp - bonusDamage);
  }

  enemy.state = 'wall_slam';
  enemy.stateTimer = WALL_SLAM_DURATION_SEC;
  enemy.recoilTotalTimer = WALL_SLAM_DURATION_SEC;
  enemy.wallSlammed = true;
  enemy.wallSlamCount = (enemy.wallSlamCount || 0) + 1;
  enemy.isDazed = true;
  enemy.dazedTimer = DAZED_DURATION_SEC;
  enemy.vulnerableToFinisher = true;
  enemy.isAirborne = false;
  enemy.verticalVelocity = 0;

  if (enemy.teleMat) enemy.teleMat.opacity = 0;
  if (enemy.rig && typeof enemy.rig.playClip === 'function') {
    enemy.rig.playClip('stagger', { fadeInSec: 0.04, timeScale: 1.0, loop: false });
  }
  if (enemy.blender && typeof enemy.blender.setTarget === 'function') {
    enemy.blender.setTarget(ENEMY_REACTION_POSES.wall_slam);
  }
  if (enemy.badge && typeof enemy.badge.update === 'function') {
    enemy.badge.update(enemy.hp, enemy.maxHp || 100, 'stunned', '💥 BARRICADE SLAM! [DAZED] 💥');
  }

  const gs = context.gameState;
  if (gs) {
    gs.cameraKick = Math.max(gs.cameraKick || 0, 0.34);
    gs.cameraDutch = 0.045;
    gs.hype = Math.min(100.0, (gs.hype || 0) + 16.0);
    gs.wallSlamCount = (gs.wallSlamCount || 0) + 1;
  }
  if (context.cameraJuice) {
    context.cameraJuice.trauma = Math.min(1.0, (context.cameraJuice.trauma || 0) + 0.42);
  }
  if (typeof context.setStarburstText === 'function') {
    context.setStarburstText('BARRICADE SLAM!', 1.24);
  }
  if (context.floorDial && typeof context.floorDial.updateBadge === 'function') {
    context.floorDial.updateBadge('WALL SLAM! DAZED!', '#ffe042');
  }
  if (context.audioEngine && typeof context.audioEngine.playCombatSfx === 'function') {
    context.audioEngine.playCombatSfx('guard-break', 'PERFECT', pos);
  }

  return {
    triggered: true,
    radius: r,
    clampedRadius: wallRadius,
    bonusDamage,
    state: enemy.state,
    isDazed: true,
    vulnerableToFinisher: true
  };
}

/**
 * Advances an enemy's hit, launch, land, wall_slam, or dazed state over `dt`.
 *
 * @param {Object} enemy - Enemy entity
 * @param {number} dt - Frame delta in seconds
 * @param {number} [elapsed=0] - Total elapsed time in seconds
 * @param {Object} [context] - Optional `{ arenaRadius, gameState, cameraJuice, floorDial, setStarburstText, audioEngine }`
 * @returns {{ state: string, wallSlamTriggered: boolean, landedThisFrame: boolean }}
 */
export function updateEnemyReactionState(enemy, dt, elapsed = 0, context = {}) {
  if (!enemy || dt <= 0) {
    return { state: enemy ? enemy.state : 'none', wallSlamTriggered: false, landedThisFrame: false };
  }

  let wallSlamTriggered = false;
  let landedThisFrame = false;
  const pos = (enemy.rig && enemy.rig.root && enemy.rig.root.position) || enemy.position;
  const hipsPos = (enemy.rig && enemy.rig.hips && enemy.rig.hips.position) || enemy.hipsPosition;

  // Apply horizontal knockback velocity and test barricade wall-slam
  if (enemy.velocity && pos) {
    const vx = enemy.velocity.x || 0;
    const vz = enemy.velocity.z || 0;
    if (vx * vx + vz * vz > 1e-4) {
      pos.x += vx * dt;
      pos.z += vz * dt;
      const damp = Math.exp(-4.2 * dt);
      enemy.velocity.x *= damp;
      enemy.velocity.z *= damp;

      const slam = checkAndApplyWallSlam(enemy, context);
      if (slam.triggered) {
        wallSlamTriggered = true;
      }
    }
  }

  // Vertical launch + apex air-hang + gravity + landing
  if (enemy.isAirborne || (enemy.verticalVelocity && Math.abs(enemy.verticalVelocity) > 1e-4) || (hipsPos && hipsPos.y > 1.005)) {
    const curY = hipsPos ? hipsPos.y : 1.0;
    if (enemy.verticalVelocity > 0 && enemy.verticalVelocity - 12.8 * dt <= 0 && (enemy.airHangTimer || 0) > 0) {
      // Apex reached: hold in air for airHangTimer
      enemy.verticalVelocity = 0;
    } else if ((enemy.airHangTimer || 0) > 0 && Math.abs(enemy.verticalVelocity || 0) <= 0.08 && curY > 1.12) {
      enemy.airHangTimer = Math.max(0, enemy.airHangTimer - dt);
    } else {
      enemy.verticalVelocity = (enemy.verticalVelocity || 0) - 12.8 * dt;
      const nextY = curY + enemy.verticalVelocity * dt;
      if (nextY <= 1.0) {
        if (hipsPos) hipsPos.y = 1.0;
        enemy.verticalVelocity = 0;
        enemy.isAirborne = false;
        enemy.airHangTimer = 0;
        enemy.juggleCount = 0;
        landedThisFrame = true;
        if (enemy.rig && typeof enemy.rig.playClip === 'function') {
          enemy.rig.playClip('land', { fadeInSec: 0.04, timeScale: 1.0, loop: false });
        }
        if (enemy.blender && typeof enemy.blender.setTarget === 'function') {
          enemy.blender.setTarget(ENEMY_REACTION_POSES.land);
        }
      } else if (hipsPos) {
        hipsPos.y = nextY;
      }
    }
  }

  if (enemy.state === 'wall_slam') {
    enemy.stateTimer = (enemy.stateTimer || 0) - dt;
    if (hipsPos) hipsPos.y = 0.94;
    if (enemy.blender && typeof enemy.blender.setTarget === 'function') {
      enemy.blender.setTarget(ENEMY_REACTION_POSES.wall_slam);
    }
    if (enemy.stateTimer <= 0) {
      enemy.state = 'dazed';
      enemy.isDazed = true;
      enemy.vulnerableToFinisher = true;
      enemy.stateTimer = enemy.dazedTimer || DAZED_DURATION_SEC;
      if (enemy.badge && typeof enemy.badge.update === 'function') {
        enemy.badge.update(enemy.hp, enemy.maxHp || 100, 'stunned', '★ DAZED [FINISHER READY] ★');
      }
    }
  } else if (enemy.state === 'dazed') {
    enemy.stateTimer = (enemy.stateTimer || 0) - dt;
    enemy.isDazed = true;
    enemy.vulnerableToFinisher = true;
    const sway = Math.sin(elapsed * 9.0) * 0.20;
    if (hipsPos) hipsPos.y = 0.92 + Math.sin(elapsed * 7.0) * 0.03;
    if (enemy.blender && typeof enemy.blender.setTarget === 'function') {
      enemy.blender.setTarget({
        ...ENEMY_REACTION_POSES.dazed,
        torso: [0.24, sway, 0],
        headGroup: [0.16, sway * 0.7, 0]
      });
    }
    if (enemy.stateTimer <= 0) {
      enemy.state = 'stalking';
      enemy.isDazed = false;
      enemy.vulnerableToFinisher = false;
      enemy.attackCooldown = 1.4;
      if (enemy.badge && typeof enemy.badge.update === 'function') {
        enemy.badge.update(enemy.hp, enemy.maxHp || 100, 'stalking');
      }
    }
  } else if (enemy.state === 'launch' || enemy.state === 'hit') {
    enemy.stateTimer = (enemy.stateTimer || 0) - dt;
    const total = Math.max(0.05, enemy.recoilTotalTimer || 0.50);
    const normTime = clamp(1.0 - (enemy.stateTimer / total), 0.0, 1.0);
    const env = evaluateReactionPhaseCurve(normTime);
    const tRot = enemy.targetTorsoRot || { x: -0.26, y: 0, z: 0 };
    const hRot = enemy.targetHeadRot || { x: -0.18, y: 0, z: 0 };

    if (enemy.blender && typeof enemy.blender.setTarget === 'function') {
      if (enemy.state === 'launch' && enemy.isAirborne) {
        enemy.blender.setTarget(ENEMY_REACTION_POSES.launch);
      } else {
        enemy.blender.setTarget({
          torso: [
            clamp(tRot.x * env, -0.52, 0.52),
            clamp(tRot.y * env, -0.80, 0.80),
            clamp(tRot.z * env, -0.42, 0.42)
          ],
          headGroup: [
            clamp(hRot.x * env, -0.45, 0.45),
            clamp(hRot.y * env, -0.60, 0.60),
            clamp(hRot.z * env, -0.35, 0.35)
          ],
          leftArm: [-0.42 * env, 0, -0.48 * env],
          rightArm: [-0.42 * env, 0, 0.48 * env],
          leftElbow: [clamp(-0.62 * env, -1.60, 0.0), 0, 0],
          rightElbow: [clamp(-0.62 * env, -1.60, 0.0), 0, 0],
          leftLeg: [-0.15 * env, 0, 0],
          rightLeg: [-0.15 * env, 0, 0],
          leftKnee: [clamp(0.10 * env, 0.0, 1.60), 0, 0],
          rightKnee: [clamp(0.10 * env, 0.0, 1.60), 0, 0]
        });
      }
    }

    if (enemy.stateTimer <= 0 && !enemy.isAirborne) {
      enemy.state = 'stalking';
      enemy.recoilType = 'none';
      enemy.isMicroShaking = false;
      if (hipsPos) {
        hipsPos.x = 0;
        hipsPos.y = 1.0;
        hipsPos.z = 0;
      }
      if (enemy.badge && typeof enemy.badge.update === 'function') {
        enemy.badge.update(enemy.hp, enemy.maxHp || 100, 'stalking');
      }
    }
  }

  return {
    state: enemy.state,
    wallSlamTriggered,
    landedThisFrame
  };
}

/**
 * Applies a 150 ms hit-stun and `hurt-light` / `hurt-heavy` pose/clip to the player.
 *
 * @param {Object} playerState - `gameState` or player state object
 * @param {number} damage - Incoming damage amount
 * @param {Object} [attackInfo] - `{ heavy, pattern, kickAmt, dutchAmt }`
 * @param {Object} [context] - `{ challengerRig, challengerBlender }`
 * @returns {{ playerHp: number, hitStunSec: number, hurtClip: string }}
 */
export function applyPlayerHurtReaction(playerState, damage, attackInfo = {}, context = {}) {
  if (!playerState) {
    return { playerHp: 0, hitStunSec: PLAYER_HIT_STUN_SEC, hurtClip: 'hurt-light' };
  }

  const isHeavy = Boolean(
    attackInfo.heavy ||
    damage >= 18 ||
    attackInfo.pattern === 'heavy_haymaker' ||
    attackInfo.pattern === 'charge' ||
    attackInfo.pattern === 'bass_drop'
  );
  const hurtClip = isHeavy ? 'hurt-heavy' : 'hurt-light';

  playerState.playerHp = Math.max(0, (playerState.playerHp ?? 100) - damage);
  playerState.combo = 0;
  playerState.comboDecayTimer = 0;
  playerState.playerHitStunTimer = PLAYER_HIT_STUN_SEC;
  playerState.isAttacking = false;
  playerState.attackPhase = 'idle';
  playerState.pendingHit = null;
  playerState.pose = 'hurt';
  playerState.playerHurtClip = hurtClip;
  playerState.poseTimer = PLAYER_HIT_STUN_SEC;

  const rig = context.challengerRig || playerState.challengerRig;
  if (rig && typeof rig.playClip === 'function') {
    rig.playClip(hurtClip, { fadeInSec: 0.04, timeScale: 1.0, loop: false });
  }
  const blender = context.challengerBlender || (rig && rig.blender);
  if (blender && typeof blender.setTargetPose === 'function') {
    blender.setTargetPose(PLAYER_REACTION_POSES[hurtClip] || PLAYER_REACTION_POSES['hurt-light']);
  }

  return {
    playerHp: playerState.playerHp,
    hitStunSec: PLAYER_HIT_STUN_SEC,
    hurtClip
  };
}

/**
 * Sets or toggles the player's guard stance (`guard` clip/pose).
 *
 * @param {Object} playerState
 * @param {boolean} isGuarding
 * @param {Object} [context]
 */
export function setPlayerGuardState(playerState, isGuarding, context = {}) {
  if (!playerState) return false;
  if ((playerState.playerGuardBreakTimer || 0) > 0) {
    playerState.isPlayerGuarding = false;
    return false;
  }
  playerState.isPlayerGuarding = Boolean(isGuarding);
  if (playerState.playerGuardMeter === undefined) {
    playerState.playerGuardMeter = 100;
  }
  const rig = context.challengerRig || playerState.challengerRig;
  if (playerState.isPlayerGuarding) {
    playerState.pose = 'guard';
    if (rig && typeof rig.playClip === 'function') {
      rig.playClip('guard', { fadeInSec: 0.05, timeScale: 1.0, loop: true });
    }
  } else if (playerState.pose === 'guard') {
    playerState.pose = 'idle';
  }
  return playerState.isPlayerGuarding;
}

/**
 * Evaluates an incoming enemy strike against the player's guard or unguarded state.
 * Heavy / unblockable attacks or depleted guard meter trigger `guard-break`.
 *
 * @param {Object} playerState
 * @param {Object} incomingStrike - `{ damage, pattern, unblockable }`
 * @param {Object} [context]
 * @returns {{ outcome: 'guarded'|'guard-break'|'hurt', damageApplied: number, clipName: string }}
 */
export function evaluatePlayerIncomingHit(playerState, incomingStrike = {}, context = {}) {
  const rawDamage = incomingStrike.damage !== undefined ? incomingStrike.damage : 12;
  const pattern = incomingStrike.pattern || 'quick_hook';
  const isUnblockable = Boolean(
    incomingStrike.unblockable ||
    pattern === 'bass_drop' ||
    pattern === 'charge'
  );

  if (playerState && playerState.isPlayerGuarding && (playerState.playerGuardBreakTimer || 0) <= 0) {
    if (playerState.playerGuardMeter === undefined) playerState.playerGuardMeter = 100;
    const drain = isUnblockable ? 100 : (pattern === 'heavy_haymaker' ? 60 : 35);
    playerState.playerGuardMeter = Math.max(0, playerState.playerGuardMeter - drain);

    if (isUnblockable || playerState.playerGuardMeter <= 0) {
      playerState.isPlayerGuarding = false;
      playerState.playerGuardBreakTimer = 0.45;
      playerState.playerHitStunTimer = 0.25;
      playerState.pose = 'guard-break';
      playerState.poseTimer = 0.45;
      const breakDmg = Math.round(rawDamage * 0.65);
      playerState.playerHp = Math.max(0, (playerState.playerHp ?? 100) - breakDmg);
      const rig = context.challengerRig || playerState.challengerRig;
      if (rig && typeof rig.playClip === 'function') {
        rig.playClip('guard-break', { fadeInSec: 0.04, timeScale: 1.0, loop: false });
      }
      return { outcome: 'guard-break', damageApplied: breakDmg, clipName: 'guard-break' };
    }

    const chipDmg = Math.max(1, Math.round(rawDamage * 0.20));
    playerState.playerHp = Math.max(0, (playerState.playerHp ?? 100) - chipDmg);
    playerState.pose = 'guard';
    return { outcome: 'guarded', damageApplied: chipDmg, clipName: 'guard' };
  }

  const hurtRes = applyPlayerHurtReaction(playerState, rawDamage, incomingStrike, context);
  return { outcome: 'hurt', damageApplied: rawDamage, clipName: hurtRes.hurtClip };
}

/**
 * Advances player hit-stun and guard-break recovery timers over `dt`.
 *
 * @param {Object} playerState
 * @param {number} dt
 * @param {Object} [context]
 */
export function updatePlayerReactionState(playerState, dt, context = {}) {
  if (!playerState || dt <= 0) return;
  if ((playerState.playerHitStunTimer || 0) > 0) {
    playerState.playerHitStunTimer = Math.max(0, playerState.playerHitStunTimer - dt);
  }
  if ((playerState.playerGuardBreakTimer || 0) > 0) {
    playerState.playerGuardBreakTimer = Math.max(0, playerState.playerGuardBreakTimer - dt);
    if (playerState.playerGuardBreakTimer <= 0) {
      playerState.playerGuardMeter = 100;
      if (playerState.pose === 'guard-break') playerState.pose = 'idle';
    }
  } else if (!playerState.isPlayerGuarding && (playerState.playerGuardMeter ?? 100) < 100) {
    playerState.playerGuardMeter = Math.min(100, (playerState.playerGuardMeter ?? 100) + dt * 18.0);
  }
}
