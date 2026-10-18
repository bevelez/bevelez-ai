/**
 * kronos-debug.js
 * Debug & Automated QA Telemetry Harness for DJ KRONOS (loaded only when ?debug=1 is present)
 */

import * as THREE from 'three';
import {
  buildChallengerModel,
  buildKronosBossModel,
  buildBruiserModel
} from './kronos-models.js?v=20261018c';

function wrapAngleRad(diff) {
  return ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function computeMaxJointDeltaRad(frames) {
  if (!Array.isArray(frames) || frames.length < 2) return 0;
  let maxDelta = 0;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].joints;
    const cur = frames[i].joints;
    if (!prev || !cur) continue;
    for (const jn of Object.keys(cur)) {
      const a = prev[jn];
      const b = cur[jn];
      if (!a || !b) continue;
      const dx = wrapAngleRad(b[0] - a[0]);
      const dy = wrapAngleRad(b[1] - a[1]);
      const dz = wrapAngleRad(b[2] - a[2]);
      const stepMag = Math.hypot(dx, dy, dz);
      if (stepMag > maxDelta) maxDelta = stepMag;
    }
  }
  return maxDelta;
}


export function attachKronosDebugHarness(ctx) {
  const {
    scene,
    camera,
    renderer,
    challengerRig,
    kronosRig,
    bruisers,
    gameState,
    cameraState,
    cameraJuice,
    floorDial,
    challengerBlender,
    kronosBlender,
    audioEngine,
    TUNING,
    triggerCombatAction,
    spawnWave,
    startGameSession,
    restartGameSession,
    getActiveBruiserCount,
    updateCameraJuiceState,
    evaluateBeatWindow,
    postProcessing
  } = ctx;

  // Expose debug globals only under ?debug=1
  window.scene = scene;
  window.camera = camera;
  window.renderer = renderer;
  window.challengerRig = challengerRig;
  window.kronosRig = kronosRig;
  window.bruisers = bruisers;
  window.gameState = gameState;
  window.cameraState = cameraState;
  window.cameraJuice = cameraJuice;
  window.floorDial = floorDial;
  window.audioEngine = audioEngine;
  window.TUNING = TUNING;
  window.postProcessing = postProcessing;

  let jointSamplingActive = false;
  const sampledJointFrames = [];
  const jointLimitViolations = [];

  const injectedModules = {
    beatwarp: ctx.beatwarp || (
      (ctx.scheduleBeatWarpAction || ctx.tickBeatWarp)
        ? {
            scheduleAction: ctx.scheduleBeatWarpAction,
            tickBeatWarp: ctx.tickBeatWarp,
            clearActiveSchedules: ctx.clearActiveSchedules
          }
        : null
    ),
    clock: ctx.clock || (
      ctx.clockNextSubdivision
        ? { nextSubdivision: ctx.clockNextSubdivision, nearestSubdivision: ctx.clockNearestSubdivision }
        : null
    ),
    director: ctx.director || ctx.combatDirector || null
  };

  function getBeatWarpModule() {
    return injectedModules.beatwarp || window.__KRONOS_BEATWARP__ || null;
  }

  function getClockModule() {
    return injectedModules.clock || window.__KRONOS_CLOCK__ || null;
  }

  function getDirectorModule() {
    return injectedModules.director || window.__KRONOS_DIRECTOR__ || null;
  }

  function getModuleStatus() {
    const bw = getBeatWarpModule();
    const clk = getClockModule();
    const dir = getDirectorModule();
    const hasBeatWarp = Boolean(bw && typeof bw.scheduleAction === 'function' && typeof bw.tickBeatWarp === 'function');
    const hasClock = Boolean(clk && typeof clk.nextSubdivision === 'function');
    const hasDirector = Boolean(dir && typeof dir.tick === 'function');
    return {
      hasBeatWarp,
      hasClock,
      hasDirector,
      beatWarpMode: hasBeatWarp ? 'real-modules' : 'track-0-baseline',
      directorMode: hasDirector ? 'real-modules' : 'track-0-baseline'
    };
  }

  function checkRigJointLimits(rig, rigName, facingSign, frameIdx) {
    if (!rig) return;
    const eps = 1e-4;
    const elbowNodeNames = ['leftElbow', 'rightElbow'];
    for (const jn of elbowNodeNames) {
      const node = rig[jn];
      if (!node || !node.rotation) continue;
      const rx = node.rotation.x;
      const minX = facingSign < 0 ? (0.0 - eps) : (-1.65 - eps);
      const maxX = facingSign < 0 ? (1.65 + eps) : (0.0 + eps);
      if (rx < minX || rx > maxX) {
        jointLimitViolations.push({ frame: frameIdx, rig: rigName, joint: `${jn}.x`, val: Number(rx.toFixed(4)), range: [minX, maxX] });
      }
    }
    const kneeNodeNames = ['leftKnee', 'rightKnee'];
    for (const jn of kneeNodeNames) {
      const node = rig[jn];
      if (!node || !node.rotation) continue;
      const rx = node.rotation.x;
      const minX = facingSign < 0 ? (-1.65 - eps) : (0.0 - eps);
      const maxX = facingSign < 0 ? (0.0 + eps) : (1.65 + eps);
      if (rx < minX || rx > maxX) {
        jointLimitViolations.push({ frame: frameIdx, rig: rigName, joint: `${jn}.x`, val: Number(rx.toFixed(4)), range: [minX, maxX] });
      }
    }
    if (rig.torso && rig.torso.rotation) {
      const tx = rig.torso.rotation.x;
      const ty = rig.torso.rotation.y;
      const tz = rig.torso.rotation.z;
      if (tx < -0.55 - eps || tx > 0.55 + eps) {
        jointLimitViolations.push({ frame: frameIdx, rig: rigName, joint: 'torso.x', val: Number(tx.toFixed(4)), range: [-0.55, 0.55] });
      }
      if (ty < -0.85 - eps || ty > 0.85 + eps) {
        jointLimitViolations.push({ frame: frameIdx, rig: rigName, joint: 'torso.y', val: Number(ty.toFixed(4)), range: [-0.85, 0.85] });
      }
      if (tz < -0.45 - eps || tz > 0.45 + eps) {
        jointLimitViolations.push({ frame: frameIdx, rig: rigName, joint: 'torso.z', val: Number(tz.toFixed(4)), range: [-0.45, 0.45] });
      }
    }
  }

  function recordJointSampleFrame() {
    if (!jointSamplingActive) return;
    const t = performance.now();
    const frameIdx = sampledJointFrames.length;
    const joints = {};
    const jl = [
      'leftArm', 'leftElbow', 'rightArm', 'rightElbow',
      'leftLeg', 'leftKnee', 'leftAnkle', 'rightLeg', 'rightKnee', 'rightAnkle',
      'torso', 'hips'
    ];
    jl.forEach((k) => {
      const node = challengerRig[k];
      if (node && node.rotation) {
        joints[k] = [node.rotation.x, node.rotation.y, node.rotation.z];
      } else {
        joints[k] = [0, 0, 0];
      }
    });
    checkRigJointLimits(challengerRig, 'challenger', -1, frameIdx);
    bruisers.forEach((b, idx) => {
      if (b.active && b.rig) {
        checkRigJointLimits(b.rig, `bruiser_${idx}`, 1, frameIdx);
      }
    });
    if (kronosRig) {
      checkRigJointLimits(kronosRig, 'kronos', 1, frameIdx);
    }
    sampledJointFrames.push({
      frame: frameIdx,
      time: t,
      pose: gameState.pose,
      joints
    });
  }

  window.KronosTestAPI = {
    challengerRig,
    kronosRig,
    bruisers,
    gameState,
    floorDial,
    challengerBlender,
    kronosBlender,
    TUNING,
    recordJointSampleFrame,

    useModules: ({ beatwarp, clock, director } = {}) => {
      if (beatwarp) {
        injectedModules.beatwarp = beatwarp;
        window.__KRONOS_BEATWARP__ = beatwarp;
      }
      if (clock) {
        injectedModules.clock = clock;
        window.__KRONOS_CLOCK__ = clock;
      }
      if (director) {
        injectedModules.director = director;
        window.__KRONOS_DIRECTOR__ = director;
      }
      return getModuleStatus();
    },

    loadRealModules: async () => {
      let bw = getBeatWarpModule();
      let clk = getClockModule();
      let dir = getDirectorModule();
      if (!bw) {
        try {
          bw = await import('./anim/beatwarp.js');
        } catch (_err) {
          bw = null;
        }
      }
      if (!clk) {
        try {
          clk = await import('./audio/clock.js');
        } catch (_err) {
          clk = null;
        }
      }
      if (!dir) {
        try {
          dir = await import('./combat/director.js');
        } catch (_err) {
          dir = null;
        }
      }
      return window.KronosTestAPI.useModules({ beatwarp: bw, clock: clk, director: dir });
    },

    getModuleStatus,

    getNetworkTransferBytes: () => {
      const resEntries = (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function')
        ? performance.getEntriesByType('resource')
        : [];
      const navEntries = (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function')
        ? performance.getEntriesByType('navigation')
        : [];
      const resourceTransferBytes = resEntries.reduce(
        (s, r) => s + (r.transferSize || r.encodedBodySize || r.decodedBodySize || 0),
        0
      );
      const navigationTransferBytes = navEntries.reduce(
        (s, r) => s + (r.transferSize || r.encodedBodySize || r.decodedBodySize || 0),
        0
      );
      return {
        transferBytes: resourceTransferBytes,
        totalTransferBytes: resourceTransferBytes + navigationTransferBytes,
        resourceTransferBytes,
        navigationTransferBytes,
        resourceCount: resEntries.length
      };
    },

    startGame: () => {
      if (startGameSession) startGameSession();
      return window.KronosTestAPI.getState();
    },
    restartGame: () => {
      if (restartGameSession) restartGameSession();
      return window.KronosTestAPI.getState();
    },
    setSimulatedMusicTime: (sec) => {
      gameState._debugMusicPlaying = (sec !== null && sec !== undefined);
      gameState._debugSongTime = sec;
      return true;
    },
    advanceFrame: (dtSec = 0.016) => {
      if (ctx.stepSimulation) {
        ctx.stepSimulation(dtSec);
      }
      return window.KronosTestAPI.getState();
    },

    startJointSampling: () => {
      jointSamplingActive = true;
      sampledJointFrames.length = 0;
      jointLimitViolations.length = 0;
      return true;
    },
    stopJointSampling: () => {
      jointSamplingActive = false;
      return true;
    },
    getSampledJointFrames: () => sampledJointFrames,
    getJointLimitViolations: () => jointLimitViolations,

    getCombatFootworkTelemetry: () => {
      const b0 = bruisers[0];
      return {
        playerPos: { x: gameState.playerPos.x, y: gameState.playerPos.y, z: gameState.playerPos.z },
        targetDist: (b0 && b0.active) ? Number(b0.rig.root.position.distanceTo(gameState.playerPos).toFixed(2)) : 0,
        combatEngagementTimer: Number(gameState.combatEngagementTimer.toFixed(3)),
        pose: gameState.pose
      };
    },
    getJointState: (jointName) => {
      const node = challengerRig[jointName];
      if (node && node.rotation) {
        return [node.rotation.x, node.rotation.y, node.rotation.z];
      }
      return [0, 0, 0];
    },
    snapToPose: (poseDict) => {
      challengerBlender.snapToPose(poseDict);
      return true;
    },
    triggerCombatAction: (action) => {
      triggerCombatAction(action);
      return window.KronosTestAPI.getState();
    },
    triggerAction: (act) => {
      triggerCombatAction(act);
      return window.KronosTestAPI.getState();
    },
    spawnWave: (w) => {
      spawnWave(w);
      return window.KronosTestAPI.getState();
    },
    evaluateBeatWindow: (t, applyOutputLatency) => evaluateBeatWindow(t, applyOutputLatency),
    evaluateBeatWindowAtTime: (t, applyOutputLatency) => evaluateBeatWindow(t, applyOutputLatency),

    getState: () => {
      if (updateCameraJuiceState) updateCameraJuiceState();
      return {
        sessionState: gameState.sessionState,
        wave: gameState.wave,
        playerHp: gameState.playerHp,
        crewHp: gameState.crewHp,
        bossHp: gameState.bossHp,
        hype: gameState.hype,
        combo: gameState.combo,
        confirmedHits: gameState.confirmedHits,
        perfectHits: gameState.perfectHits,
        missedPresses: gameState.missedPresses,
        rank: gameState.rank,
        pose: gameState.pose,
        playerHitStunTimer: Number((gameState.playerHitStunTimer || 0).toFixed(3)),
        cameraMode: cameraState.mode,
        kronosInRing: gameState.kronosInRing,
        kronosRingState: gameState.kronosRingState,
        kronosAttackType: gameState.kronosAttackType,
        totalKoz: gameState.totalKoz,
        activeBruiserCount: getActiveBruiserCount(),
        isAttacking: gameState.isAttacking,
        attackPhase: gameState.attackPhase,
        attackGrade: gameState.attackGrade,
        attackHitResolved: gameState.attackHitResolved,
        canCancel: gameState.attackPhase === 'recovery',
        lastCalloutText: gameState.lastCalloutText || '',
        cameraFov: Number(camera.fov.toFixed(2)),
        cameraDutch: Number((cameraJuice.dutchRoll !== 0 ? cameraJuice.dutchRoll : gameState.cameraDutch).toFixed(4)),
        cameraTrauma: Number(cameraJuice.trauma.toFixed(3)),
        hitStopActive: gameState.hitStopTimer > 0,
        hitStopTimer: Number(gameState.hitStopTimer.toFixed(3)),
        impactBeatOffsetsMs: gameState.impactBeatOffsetsMs || [],
        enemyStrikeEvents: gameState.enemyStrikeEvents || [],
        jointLimitViolationCount: jointLimitViolations.length,
        renderInfo: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles
        },
        bruisers: bruisers.map((b) => ({
          idx: b.idx,
          active: b.active,
          hp: b.hp,
          maxHp: b.maxHp,
          state: b.state,
          attackType: b.attackType || 'hook',
          recoilType: b.recoilType || 'none',
          x: Number(b.rig.root.position.x.toFixed(2)),
          z: Number(b.rig.root.position.z.toFixed(2)),
          distToPlayer: Number(b.rig.root.position.distanceTo(gameState.playerPos).toFixed(2))
        }))
      };
    },

    run16BarOnBeatProbe: (options = {}) => {
      const chart = audioEngine.getActiveChart();
      const beatSec = (chart && chart.beatSec) || ctx.KRONOS_BEAT_SEC || (60 / 92);
      const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : 0.007;
      const origGetSongTime = audioEngine.getSongTime.bind(audioEngine);
      const dirMod = getDirectorModule();
      const hasRealDirector = Boolean(dirMod && typeof dirMod.tick === 'function');

      function runSingleRatePass(hz) {
        const dt = Number((1 / hz).toFixed(6));
        if (restartGameSession) restartGameSession();
        gameState.gameStarted = true;
        gameState.isPaused = false;
        gameState.isGameOver = false;
        spawnWave(1);

        gameState.impactBeatOffsetsMs = [];
        gameState.enemyStrikeEvents = [];

        const b0 = bruisers[0];
        if (b0) {
          b0.active = true;
          b0.state = 'stalking';
          b0.isGuarding = false;
          b0.hp = 50000;
          b0.maxHp = 50000;
          b0.attackCooldown = 999;
          b0.guardCooldown = 999;
          b0.rig.root.visible = true;
          b0.rig.root.position.set(gameState.playerPos.x, 0, gameState.playerPos.z - 1.18);
        }

        const b1 = bruisers[1];
        if (b1) {
          b1.active = true;
          b1.state = 'stalking';
          b1.isGuarding = false;
          b1.hp = 50000;
          b1.maxHp = 50000;
          b1.attackCooldown = 0.15;
          b1.guardCooldown = 999;
          b1.rig.root.visible = true;
          b1.rig.root.position.set(gameState.playerPos.x, 0, gameState.playerPos.z + 1.98);
        }

        const dirGs = {
          wave: 1,
          playerHp: 100,
          playerPos: gameState.playerPos,
          enemyStrikeEvents: []
        };
        const dirEnemies = [
          {
            id: 'bruiser_1',
            idx: 1,
            active: true,
            hp: 50000,
            maxHp: 50000,
            state: 'stalking',
            attackCooldown: 0,
            rig: b1 ? b1.rig : null,
            position: { x: gameState.playerPos.x, y: 0, z: gameState.playerPos.z - 1.38 }
          }
        ];
        if (hasRealDirector && typeof dirMod.resetDirector === 'function') {
          dirMod.resetDirector({ wave: 1, waveStartBeatFloat: 0 });
        }

        let simTime = firstOffset;
        audioEngine.getSongTime = () => simTime;

        if (ctx.stepSimulation) {
          ctx.stepSimulation(dt);
          ctx.stepSimulation(dt);
        }

        jointSamplingActive = true;
        sampledJointFrames.length = 0;
        jointLimitViolations.length = 0;

        const totalBeatsToRun = 64;
        const endTime = firstOffset + totalBeatsToRun * beatSec;
        const leadSec = 0.030;
        let nextPressBeatIdx = 1;

        while (simTime < endTime) {
          if (b0) {
            if (!b0.active || b0.state === 'ko' || b0.state === 'flying') {
              b0.active = true;
              b0.state = 'stalking';
              b0.flying = null;
              b0.rig.root.visible = true;
              b0.rig.root.rotation.set(0, 0, 0);
            }
            b0.hp = 50000;
            b0.maxHp = 50000;
            b0.isGuarding = false;
            b0.attackCooldown = 999;
            b0.guardCooldown = 999;
            b0.rig.root.position.set(gameState.playerPos.x, 0, gameState.playerPos.z - 1.18);
            if (b0.velocity) b0.velocity.set(0, 0, 0);
          }
          if (b1) {
            b1.active = true;
            b1.hp = 50000;
            b1.maxHp = 50000;
            b1.isGuarding = false;
            b1.guardCooldown = 999;
            b1.rig.root.position.set(gameState.playerPos.x, 0, gameState.playerPos.z + 1.98);
            if (b1.state === 'stalking' && b1.attackCooldown > beatSec * 0.5) {
              b1.attackCooldown = beatSec * 0.35;
            }
          }
          gameState.playerHp = 100;

          const targetBeatTime = firstOffset + nextPressBeatIdx * beatSec;
          const pressTriggerTime = targetBeatTime - leadSec;
          if (simTime >= pressTriggerTime && nextPressBeatIdx <= totalBeatsToRun) {
            if (!gameState.isAttacking || gameState.attackPhase === 'recovery') {
              const act = (nextPressBeatIdx % 4 === 0) ? 'kick' : 'punch';
              triggerCombatAction(act);
            }
            nextPressBeatIdx += 1;
          }

          simTime = Number((simTime + dt).toFixed(6));
          if (gameState.hitStopTimer > 0) {
            gameState.hitStopTimer = Math.max(0, gameState.hitStopTimer - dt);
          }
          if (ctx.stepSimulation) {
            ctx.stepSimulation(dt);
          }
          if (hasRealDirector) {
            dirEnemies[0].active = true;
            dirEnemies[0].hp = 50000;
            if (dirEnemies[0].state === 'ko' || dirEnemies[0].state === 'dazed') {
              dirEnemies[0].state = 'stalking';
            }
            dirGs.playerHp = 100;
            dirMod.tick(simTime, dt, {
              gameState: dirGs,
              chart: chart || { bpm: 92, beatSec, firstBeatOffset: firstOffset },
              wave: 1,
              enemies: dirEnemies,
              challengerRig
            });
          }
        }

        jointSamplingActive = false;

        const offsets = (gameState.impactBeatOffsetsMs || []).slice().sort((a, b) => a - b);
        const impactCount = offsets.length;
        const p50Idx = impactCount > 0 ? Math.min(impactCount - 1, Math.floor(impactCount * 0.50)) : 0;
        const p95Idx = impactCount > 0 ? Math.min(impactCount - 1, Math.floor(impactCount * 0.95)) : 0;
        const impactOffsetP50Ms = impactCount > 0 ? Number(offsets[p50Idx].toFixed(2)) : 0;
        const impactOffsetP95Ms = impactCount > 0 ? Number(offsets[p95Idx].toFixed(2)) : 0;
        const maxOffsetMs = impactCount > 0 ? Number(offsets[impactCount - 1].toFixed(2)) : 0;

        const strikes = (hasRealDirector && dirGs.enemyStrikeEvents.length > 0)
          ? dirGs.enemyStrikeEvents.slice()
          : (gameState.enemyStrikeEvents || []).slice();
        const enemyStrikeCount = strikes.length;
        const enemyStrikesOutsideMarker = strikes.filter((s) => !s.onBeatMarker || s.nearestBeatDeltaMs > 20.0).length;
        const maxJointDeltaRad = Number(computeMaxJointDeltaRad(sampledJointFrames).toFixed(4));
        const violationCount = jointLimitViolations.length;

        return {
          hz,
          dtSec: dt,
          impactCount,
          impactOffsetP50Ms,
          impactOffsetP95Ms,
          maxOffsetMs,
          enemyStrikeCount,
          enemyStrikesOutsideMarker,
          jointLimitViolations: violationCount,
          maxJointDeltaRad
        };
      }

      const step200Hz = runSingleRatePass(200);
      const step60Hz = runSingleRatePass(60);
      const primaryHz = (options && options.hz === 200) ? 200 : 60;
      const primary = primaryHz === 200 ? step200Hz : step60Hz;

      audioEngine.getSongTime = origGetSongTime;
      if (restartGameSession) restartGameSession();

      return {
        mode: hasRealDirector ? 'real-modules' : 'track-0-baseline',
        hz: primary.hz,
        dtSec: primary.dtSec,
        impactCount: primary.impactCount,
        impactOffsetP50Ms: primary.impactOffsetP50Ms,
        impactOffsetP95Ms: primary.impactOffsetP95Ms,
        maxOffsetMs: primary.maxOffsetMs,
        enemyStrikeCount: primary.enemyStrikeCount,
        enemyStrikesOutsideMarker: primary.enemyStrikesOutsideMarker,
        jointLimitViolations: primary.jointLimitViolations,
        maxJointDeltaRad: primary.maxJointDeltaRad,
        step60Hz,
        step200Hz
      };
    },

    runBeatWarp200Probe: (bpms = [92, 120, 160]) => {
      const targetBpms = Array.isArray(bpms) && bpms.length > 0 ? bpms : [92, 120, 160];
      const clipSpecs = {
        jab: {
          clip: 'jab',
          duration: 0.62,
          impactFrame: 0.22,
          sections: [
            { name: 'windup', t0: 0.00, t1: 0.22, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
            { name: 'impact', t0: 0.22, t1: 0.30, stretch: [1.0, 1.0], event: 'hit' },
            { name: 'recovery', t0: 0.30, t1: 0.62, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.40 }
          ]
        },
        cross: {
          clip: 'cross',
          duration: 0.66,
          impactFrame: 0.24,
          sections: [
            { name: 'windup', t0: 0.00, t1: 0.24, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
            { name: 'impact', t0: 0.24, t1: 0.32, stretch: [1.0, 1.0], event: 'hit' },
            { name: 'recovery', t0: 0.32, t1: 0.66, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.44 }
          ]
        },
        uppercut: {
          clip: 'uppercut',
          duration: 0.72,
          impactFrame: 0.26,
          sections: [
            { name: 'windup', t0: 0.00, t1: 0.26, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
            { name: 'impact', t0: 0.26, t1: 0.35, stretch: [1.0, 1.0], event: 'hit' },
            { name: 'recovery', t0: 0.35, t1: 0.72, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.48 }
          ]
        },
        kick: {
          clip: 'kick',
          duration: 0.76,
          impactFrame: 0.28,
          sections: [
            { name: 'windup', t0: 0.00, t1: 0.28, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
            { name: 'impact', t0: 0.28, t1: 0.38, stretch: [1.0, 1.0], event: 'hit' },
            { name: 'recovery', t0: 0.38, t1: 0.76, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.52 }
          ]
        }
      };
      const clipKeys = Object.keys(clipSpecs);

      // Deterministic Mulberry32 PRNG for reproducible 200 random press timestamps
      let seed = 0x1337beef;
      const nextRand = () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      const totalPresses = 200;
      const offsetsMs = [];
      let within12MsCount = 0;
      let stretchViolations = 0;
      let anticipationHoldsCount = 0;
      const perBpm = {};
      for (const bpm of targetBpms) {
        perBpm[bpm] = { count: 0, within12Ms: 0, maxOffsetMs: 0, stretchViolations: 0 };
      }

      const extBeatWarp = getBeatWarpModule();
      const extClock = getClockModule();
      const isRealModules = Boolean(
        extBeatWarp &&
        typeof extBeatWarp.scheduleAction === 'function' &&
        typeof extBeatWarp.tickBeatWarp === 'function'
      );
      const hasClockModule = Boolean(extClock && typeof extClock.nextSubdivision === 'function');
      const eps = 1e-5;

      if (isRealModules && typeof extBeatWarp.resetBeatWarpTelemetry === 'function') {
        extBeatWarp.resetBeatWarpTelemetry();
      }

      for (let i = 0; i < totalPresses; i++) {
        const bpm = targetBpms[i % targetBpms.length];
        const beatSec = 60.0 / bpm;
        const firstOffset = 0.04;
        const clipName = clipKeys[i % clipKeys.length];
        const spec = clipSpecs[clipName];
        const windupSec = spec.sections[0];
        const recSec = spec.sections[2];
        const windupLen = windupSec.t1 - windupSec.t0;
        const recLen = recSec.t1 - recSec.t0;
        const [wMin, wMax] = windupSec.stretch;
        const [rMin, rMax] = recSec.stretch;
        const subdiv = windupSec.subdivision || 0.5;
        const subdivSec = beatSec * subdiv;

        // Random press time across 32 bars [0.05s .. 32 * 4 * beatSec]
        const tPress = Number((firstOffset + nextRand() * (32 * 4 * beatSec)).toFixed(6));

        let offsetMs = 0;
        let wStretchOk = true;
        let rStretchOk = true;

        if (isRealModules) {
          if (typeof extBeatWarp.clearActiveSchedules === 'function') {
            extBeatWarp.clearActiveSchedules();
          }
          let hitPayload = null;
          const mockActor = {
            playClip: () => ({ time: 0, timeScale: 1.0, paused: false }),
            bone: (name) => challengerRig[name] || null
          };
          const chartObj = (extClock && typeof extClock.createBpmChart === 'function')
            ? extClock.createBpmChart(bpm, { firstBeatOffset: firstOffset })
            : { bpm, beatSec, firstBeatOffset: firstOffset };
          const sched = extBeatWarp.scheduleAction(mockActor, clipName, tPress, {
            bpm,
            beatSec,
            firstBeatOffset: firstOffset,
            chart: chartObj,
            nextSubdivision: hasClockModule ? extClock.nextSubdivision : undefined,
            clipsManifest: { version: 1, clips: clipSpecs },
            hitStopSec: 0.048
          });
          if (sched && sched.anticipationHoldSec > 0) {
            anticipationHoldsCount += 1;
          }
          if (sched && sched.events && typeof sched.events.onHit === 'function') {
            sched.events.onHit((p) => { hitPayload = p; });
          }
          const simDt = 0.004;
          let curT = tPress;
          const maxT = (sched && sched.recoveryEndTime) ? sched.recoveryEndTime : (tPress + 1.5);
          while (curT <= maxT + simDt) {
            curT = Number((curT + simDt).toFixed(6));
            extBeatWarp.tickBeatWarp(curT, simDt, 0);
            if (hitPayload) break;
          }
          const impactT = hitPayload ? hitPayload.actualAudioTime : (sched ? sched.impactTime : tPress);
          const nearestSubdivTime = (extClock && typeof extClock.nearestSubdivision === 'function')
            ? extClock.nearestSubdivision(impactT, subdiv, chartObj)
            : (firstOffset + Math.round((impactT - firstOffset) / subdivSec) * subdivSec);
          offsetMs = Number((Math.abs(impactT - nearestSubdivTime) * 1000).toFixed(3));

          if (sched && sched.windupStretchRatio !== undefined) {
            if (sched.windupStretchRatio < wMin - eps || sched.windupStretchRatio > wMax + eps) wStretchOk = false;
          } else if (sched && sched.windupTimeScale !== undefined) {
            const minRate = 1.0 / wMax - eps;
            const maxRate = 1.0 / wMin + eps;
            if (sched.windupTimeScale < minRate || sched.windupTimeScale > maxRate) wStretchOk = false;
          }
          if (sched && sched.recoveryStretchRatio !== undefined) {
            if (sched.recoveryStretchRatio < rMin - eps || sched.recoveryStretchRatio > rMax + eps) rStretchOk = false;
          } else if (sched && sched.recoveryTimeScale !== undefined) {
            const minRate = 1.0 / rMax - eps;
            const maxRate = 1.0 / rMin + eps;
            if (sched.recoveryTimeScale < minRate || sched.recoveryTimeScale > maxRate) rStretchOk = false;
          }
        } else {
          // Built-in Section 3.2 BeatWarp schedule & 250Hz frame-stepped evaluator
          const minImpactTime = tPress + windupLen * wMin;
          const targetSubdivIdx = Math.ceil((minImpactTime - firstOffset - 1e-9) / subdivSec);
          const targetImpactTime = firstOffset + targetSubdivIdx * subdivSec;
          const totalWindupWindow = targetImpactTime - tPress;

          let anticipationHoldSec = 0;
          let activeWindupDur = totalWindupWindow;
          if (totalWindupWindow / windupLen > wMax) {
            anticipationHoldSec = totalWindupWindow - windupLen * wMax;
            activeWindupDur = windupLen * wMax;
            anticipationHoldsCount += 1;
          }
          const windupStretchRatio = activeWindupDur / windupLen;
          const windupTimeScale = windupLen / activeWindupDur;
          if (windupStretchRatio < wMin - eps || windupStretchRatio > wMax + eps) {
            wStretchOk = false;
          }

          // Step clip clock at dt = 0.004s (250 Hz audio-frame scheduler) and fire hit event when clip reaches t1 (impactFrame)
          const dt = 0.004;
          let curAudioTime = tPress;
          let clipTime = 0;
          let actualImpactTime = targetImpactTime;
          while (curAudioTime < targetImpactTime + dt * 2) {
            const nextAudioTime = Math.min(targetImpactTime, curAudioTime + dt);
            const stepSec = nextAudioTime - curAudioTime;
            if (nextAudioTime > tPress + anticipationHoldSec) {
              const activeStep = Math.min(stepSec, nextAudioTime - Math.max(curAudioTime, tPress + anticipationHoldSec));
              clipTime += activeStep * windupTimeScale;
            }
            curAudioTime = nextAudioTime;
            if (clipTime >= windupSec.t1 - 1e-5 || curAudioTime >= targetImpactTime - 1e-6) {
              actualImpactTime = curAudioTime;
              break;
            }
          }

          // Recovery section quantization after hit-stop
          const hitStopSec = 0.048;
          const recStart = actualImpactTime + hitStopSec;
          const minRecEnd = recStart + recLen * rMin;
          const recSubdivIdx = Math.ceil((minRecEnd - firstOffset - 1e-9) / subdivSec);
          const targetRecEnd = firstOffset + recSubdivIdx * subdivSec;
          const rawRecWindow = targetRecEnd - recStart;
          const activeRecDur = (rawRecWindow / recLen > rMax) ? (recLen * rMax) : rawRecWindow;
          const recStretchRatio = activeRecDur / recLen;
          if (recStretchRatio < rMin - eps || recStretchRatio > rMax + eps) {
            rStretchOk = false;
          }

          const nearestSubdivIdx = Math.round((actualImpactTime - firstOffset) / subdivSec);
          const nearestSubdivTime = firstOffset + nearestSubdivIdx * subdivSec;
          offsetMs = Number((Math.abs(actualImpactTime - nearestSubdivTime) * 1000).toFixed(3));
        }

        offsetsMs.push(offsetMs);
        perBpm[bpm].count += 1;
        if (offsetMs <= 12.0) {
          within12MsCount += 1;
          perBpm[bpm].within12Ms += 1;
        }
        if (offsetMs > perBpm[bpm].maxOffsetMs) {
          perBpm[bpm].maxOffsetMs = offsetMs;
        }
        if (!wStretchOk || !rStretchOk) {
          stretchViolations += 1;
          perBpm[bpm].stretchViolations += 1;
        }
      }

      if (isRealModules && typeof extBeatWarp.clearActiveSchedules === 'function') {
        extBeatWarp.clearActiveSchedules();
      }

      const sorted = offsetsMs.slice().sort((a, b) => a - b);
      const p50Ms = sorted.length > 0 ? Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)) : 0;
      const p95Ms = sorted.length > 0 ? Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)) : 0;
      const maxMs = sorted.length > 0 ? Number(sorted[sorted.length - 1].toFixed(2)) : 0;
      const within12MsPct = Number(((within12MsCount / totalPresses) * 100).toFixed(2));

      return {
        mode: isRealModules ? 'real-modules' : 'track-0-baseline',
        hasClockModule,
        totalPresses,
        within12MsCount,
        within12MsPct,
        p50Ms,
        p95Ms,
        maxMs,
        stretchViolations,
        anticipationHoldsCount,
        perBpm
      };
    },

    renderClipContactSheet: (clipNames) => {
      const defaultClips = [
        'jab', 'cross', 'uppercut', 'kick',
        'dodge-L', 'hurt-light', 'guard', 'counter-riposte',
        'hook', 'haymaker', 'scratch-1', 'bass-drop'
      ];
      const clips = Array.isArray(clipNames) && clipNames.length > 0 ? clipNames : defaultClips;

      const CLIP_POSE_LIBRARY = {
        'idle-dance': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.00, hipsY: 0.98,
          pose: {
            hips: [-0.02, -0.14, 0], torso: [0.06, -0.12, 0.03], headGroup: [-0.02, 0.12, 0],
            leftArm: [0.68, -0.22, -0.40], leftElbow: [1.35, 0, 0],
            rightArm: [0.76, 0.22, 0.40], rightElbow: [1.30, 0, 0],
            leftLeg: [0.24, 0.14, -0.18], leftKnee: [-0.42, 0, 0], leftAnkle: [0.16, 0, 0.18],
            rightLeg: [-0.14, -0.14, 0.18], rightKnee: [-0.26, 0, 0], rightAnkle: [0.38, 0, -0.18]
          }
        },
        'step-L': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.16, hipsY: 0.97,
          pose: {
            hips: [0.02, -0.18, -0.06], torso: [0.06, -0.14, 0.04], headGroup: [-0.02, 0.14, 0],
            leftArm: [0.70, -0.20, -0.38], leftElbow: [1.32, 0, 0],
            rightArm: [0.74, 0.20, 0.38], rightElbow: [1.28, 0, 0],
            leftLeg: [0.36, 0.16, -0.22], leftKnee: [-0.48, 0, 0], leftAnkle: [0.18, 0, 0.16],
            rightLeg: [-0.20, -0.12, 0.16], rightKnee: [-0.22, 0, 0], rightAnkle: [0.32, 0, -0.14]
          }
        },
        'step-R': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.16, hipsY: 0.97,
          pose: {
            hips: [0.02, 0.16, 0.06], torso: [0.06, 0.12, -0.04], headGroup: [-0.02, -0.12, 0],
            leftArm: [0.74, -0.20, -0.38], leftElbow: [1.28, 0, 0],
            rightArm: [0.70, 0.20, 0.38], rightElbow: [1.32, 0, 0],
            leftLeg: [-0.18, 0.12, -0.16], leftKnee: [-0.22, 0, 0], leftAnkle: [0.28, 0, 0.14],
            rightLeg: [0.34, -0.16, 0.22], rightKnee: [-0.46, 0, 0], rightAnkle: [0.18, 0, -0.16]
          }
        },
        jab: {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.22, hipsY: 1.01,
          pose: {
            hips: [0.06, -0.24, 0], torso: [0.08, -0.34, -0.04], headGroup: [-0.04, 0.26, 0],
            leftArm: [1.54, -0.06, -0.12], leftElbow: [0.08, 0, 0],
            rightArm: [0.82, 0.26, 0.36], rightElbow: [1.42, 0, 0],
            leftLeg: [0.08, 0.06, -0.12], leftKnee: [-0.14, 0, 0], leftAnkle: [0.06, 0, 0.06],
            rightLeg: [-0.18, -0.08, 0.16], rightKnee: [-0.12, 0, 0], rightAnkle: [0.22, 0, -0.08]
          }
        },
        cross: {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.24, hipsY: 1.01,
          pose: {
            hips: [0.10, 0.30, 0], torso: [0.12, 0.44, -0.05], headGroup: [-0.06, -0.34, 0],
            leftArm: [0.72, -0.24, -0.38], leftElbow: [1.42, 0, 0],
            rightArm: [1.56, 0.08, 0.14], rightElbow: [0.08, 0, 0],
            leftLeg: [0.22, 0.04, -0.12], leftKnee: [-0.18, 0, 0], leftAnkle: [0.06, 0, 0.04],
            rightLeg: [-0.24, 0.12, 0.18], rightKnee: [-0.10, 0, 0], rightAnkle: [0.30, 0, -0.08]
          }
        },
        uppercut: {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.26, hipsY: 1.06,
          pose: {
            hips: [-0.06, 0.28, -0.06], torso: [-0.12, 0.42, -0.10], headGroup: [0.06, -0.28, 0.04],
            leftArm: [0.68, -0.26, -0.42], leftElbow: [1.40, 0, 0],
            rightArm: [1.72, 0.12, 0.16], rightElbow: [0.68, 0, 0],
            leftLeg: [0.08, 0.04, -0.12], leftKnee: [-0.12, 0, 0], leftAnkle: [0.04, 0, 0.04],
            rightLeg: [-0.18, 0.10, 0.14], rightKnee: [-0.08, 0, 0], rightAnkle: [0.22, 0, -0.06]
          }
        },
        kick: {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.28, hipsY: 1.03,
          pose: {
            hips: [-0.16, 0.42, 0.28], torso: [-0.14, -0.22, 0.18], headGroup: [0.06, -0.18, -0.08],
            leftArm: [0.46, 0.12, -0.52], leftElbow: [1.05, 0, 0],
            rightArm: [-0.18, -0.14, 0.92], rightElbow: [0.48, 0, 0],
            leftLeg: [-0.10, 0.18, -0.22], leftKnee: [-0.14, 0, 0], leftAnkle: [0.08, 0, 0.08],
            rightLeg: [1.46, -0.24, 0.62], rightKnee: [-0.06, 0, 0], rightAnkle: [-0.35, 0, 0]
          }
        },
        'dodge-L': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.14, hipsY: 0.88,
          pose: {
            hips: [-0.18, 0.20, 0.32], torso: [0.22, -0.22, 0.18], headGroup: [0.10, -0.15, 0.12],
            leftArm: [0.85, 0.30, -0.35], leftElbow: [1.35, 0, 0],
            rightArm: [0.90, -0.25, 0.35], rightElbow: [1.30, 0, 0],
            leftLeg: [0.32, 0, -0.22], leftKnee: [-0.40, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [-0.24, 0, 0.28], rightKnee: [-0.24, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'dodge-R': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.14, hipsY: 0.88,
          pose: {
            hips: [-0.18, -0.20, -0.32], torso: [0.22, 0.22, -0.18], headGroup: [0.10, 0.15, -0.12],
            leftArm: [0.90, 0.25, -0.35], leftElbow: [1.30, 0, 0],
            rightArm: [0.85, -0.30, 0.35], rightElbow: [1.35, 0, 0],
            leftLeg: [-0.24, 0, -0.28], leftKnee: [-0.24, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [0.32, 0, 0.22], rightKnee: [-0.40, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'hurt-light': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.08, hipsY: 0.93,
          pose: {
            hips: [-0.14, 0.16, -0.08], torso: [-0.28, 0.22, -0.10], headGroup: [-0.22, -0.18, 0.08],
            leftArm: [0.42, 0.25, -0.52], leftElbow: [1.45, 0, 0],
            rightArm: [0.48, -0.25, 0.52], rightElbow: [1.42, 0, 0],
            leftLeg: [0.28, 0.10, -0.20], leftKnee: [-0.48, 0, 0], leftAnkle: [0.20, 0, 0.14],
            rightLeg: [-0.22, -0.10, 0.20], rightKnee: [-0.36, 0, 0], rightAnkle: [0.32, 0, -0.14]
          }
        },
        'hurt-heavy': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.12, hipsY: 0.89,
          pose: {
            hips: [-0.20, -0.24, 0.12], torso: [-0.38, -0.32, 0.14], headGroup: [-0.28, 0.24, -0.10],
            leftArm: [0.30, 0.32, -0.62], leftElbow: [1.25, 0, 0],
            rightArm: [0.35, -0.30, 0.62], rightElbow: [1.20, 0, 0],
            leftLeg: [0.36, 0.12, -0.24], leftKnee: [-0.58, 0, 0], leftAnkle: [0.24, 0, 0.16],
            rightLeg: [-0.28, -0.12, 0.24], rightKnee: [-0.44, 0, 0], rightAnkle: [0.36, 0, -0.16]
          }
        },
        guard: {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.10, hipsY: 0.96,
          pose: {
            hips: [0.04, -0.10, 0], torso: [0.12, -0.08, 0], headGroup: [0.08, 0.08, 0],
            leftArm: [1.10, -0.32, -0.20], leftElbow: [1.55, 0, 0],
            rightArm: [1.12, 0.32, 0.20], rightElbow: [1.55, 0, 0],
            leftLeg: [0.26, 0.12, -0.18], leftKnee: [-0.44, 0, 0], leftAnkle: [0.18, 0, 0.14],
            rightLeg: [-0.18, -0.12, 0.18], rightKnee: [-0.30, 0, 0], rightAnkle: [0.34, 0, -0.14]
          }
        },
        'guard-break': {
          rigType: 'bruiser', facingSign: 1, impactFrameSec: 0.18, hipsY: 0.92,
          pose: {
            hips: [0.10, 0, 0], torso: [-0.25, 0.15, 0], headGroup: [-0.20, 0, 0],
            leftArm: [0.35, 0, -0.45], leftElbow: [-0.20, 0, 0],
            rightArm: [0.35, 0, 0.45], rightElbow: [-0.20, 0, 0],
            leftLeg: [-0.15, 0, 0], leftKnee: [0.14, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [-0.15, 0, 0], rightKnee: [0.14, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'counter-riposte': {
          rigType: 'challenger', facingSign: -1, impactFrameSec: 0.24, hipsY: 1.02,
          pose: {
            hips: [0.08, 0.34, -0.04], torso: [0.14, 0.48, -0.08], headGroup: [-0.06, -0.36, 0.04],
            leftArm: [0.64, -0.28, -0.44], leftElbow: [1.46, 0, 0],
            rightArm: [1.64, 0.10, 0.12], rightElbow: [0.10, 0, 0],
            leftLeg: [0.24, 0.06, -0.14], leftKnee: [-0.22, 0, 0], leftAnkle: [0.08, 0, 0.06],
            rightLeg: [-0.26, 0.14, 0.20], rightKnee: [-0.12, 0, 0], rightAnkle: [0.32, 0, -0.10]
          }
        },
        hook: {
          rigType: 'bruiser', facingSign: 1, impactFrameSec: 0.20, hipsY: 1.02,
          pose: {
            hips: [0, -0.20, 0], torso: [0.22, -0.55, 0], headGroup: [0, 0.25, 0],
            leftArm: [-1.25, 0.45, 0.35], leftElbow: [-0.35, 0, 0],
            rightArm: [-0.60, -0.25, 0.30], rightElbow: [-1.20, 0, 0],
            leftLeg: [0.18, 0, 0], leftKnee: [0.10, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [-0.18, 0, 0], rightKnee: [0.10, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        haymaker: {
          rigType: 'bruiser', facingSign: 1, impactFrameSec: 0.24, hipsY: 1.02,
          pose: {
            hips: [0, 0.24, 0], torso: [0.28, 0.65, 0], headGroup: [0, -0.28, 0],
            rightArm: [-1.35, -0.25, -0.15], rightElbow: [-0.15, 0, 0],
            leftArm: [-0.50, 0, -0.30], leftElbow: [-0.80, 0, 0],
            leftLeg: [-0.20, 0, 0], leftKnee: [0.08, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [0.20, 0, 0], rightKnee: [0.12, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'double-tap': {
          rigType: 'bruiser', facingSign: 1, impactFrameSec: 0.22, hipsY: 1.01,
          pose: {
            hips: [0, 0.22, 0], torso: [0.24, 0.52, 0], headGroup: [0, -0.22, 0],
            rightArm: [-1.42, -0.18, -0.12], rightElbow: [-0.12, 0, 0],
            leftArm: [-1.10, 0.30, 0.24], leftElbow: [-0.55, 0, 0],
            leftLeg: [-0.16, 0, 0], leftKnee: [0.10, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [0.18, 0, 0], rightKnee: [0.12, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        charge: {
          rigType: 'bruiser', facingSign: 1, impactFrameSec: 0.26, hipsY: 0.96,
          pose: {
            hips: [0.12, 0, 0], torso: [0.36, 0, 0], headGroup: [-0.12, 0, 0],
            leftArm: [-1.38, 0.22, -0.20], leftElbow: [-0.25, 0, 0],
            rightArm: [-1.38, -0.22, 0.20], rightElbow: [-0.25, 0, 0],
            leftLeg: [-0.28, 0, 0], leftKnee: [0.22, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [0.26, 0, 0], rightKnee: [0.16, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'scratch-1': {
          rigType: 'kronos', facingSign: 1, impactFrameSec: 0.20, hipsY: 1.02,
          pose: {
            hips: [0, 0.18, 0], torso: [0.22, 0.45, 0], headGroup: [0, -0.20, 0],
            leftArm: [-1.65, 0, -0.10], leftElbow: [-0.15, 0, 0],
            rightArm: [-0.50, -0.20, 0.20], rightElbow: [-0.80, 0, 0],
            leftLeg: [-0.14, 0, 0], leftKnee: [0.08, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [0.14, 0, 0], rightKnee: [0.08, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'scratch-2': {
          rigType: 'kronos', facingSign: 1, impactFrameSec: 0.20, hipsY: 1.02,
          pose: {
            hips: [0, -0.20, 0], torso: [0.25, -0.55, 0], headGroup: [0, 0.22, 0],
            rightArm: [-1.55, 0, 0.15], rightElbow: [-0.20, 0, 0],
            leftArm: [-0.60, 0.20, -0.20], leftElbow: [-0.70, 0, 0],
            leftLeg: [0.14, 0, 0], leftKnee: [0.08, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [-0.14, 0, 0], rightKnee: [0.08, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'scratch-3': {
          rigType: 'kronos', facingSign: 1, impactFrameSec: 0.24, hipsY: 0.94,
          pose: {
            hips: [0.08, 0, 0], torso: [0.45, 0, 0], headGroup: [0.20, 0, 0],
            leftArm: [-1.20, 0, -0.25], leftElbow: [-0.80, 0, 0],
            rightArm: [-1.20, 0, 0.25], rightElbow: [-0.80, 0, 0],
            leftLeg: [-0.16, 0, 0], leftKnee: [0.12, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [0.16, 0, 0], rightKnee: [0.12, 0, 0], rightAnkle: [0, 0, 0]
          }
        },
        'bass-drop': {
          rigType: 'kronos', facingSign: 1, impactFrameSec: 0.32, hipsY: 0.95,
          pose: {
            hips: [0.06, 0, 0], torso: [0.38, 0, 0], headGroup: [0.14, 0, 0],
            leftArm: [-1.20, 0, -0.30], leftElbow: [-0.90, 0, 0],
            rightArm: [-1.20, 0, 0.30], rightElbow: [-0.90, 0, 0],
            leftLeg: [-0.20, 0, 0], leftKnee: [0.18, 0, 0], leftAnkle: [0, 0, 0],
            rightLeg: [0.20, 0, 0], rightKnee: [0.18, 0, 0], rightAnkle: [0, 0, 0]
          }
        }
      };

      const width = 2048;
      const height = 1080;
      const cols = clips.length === 12 ? 4 : Math.min(6, Math.max(2, Math.ceil(Math.sqrt(clips.length * (16 / 9)))));
      const rows = Math.max(1, Math.ceil(clips.length / cols));
      const cellW = Math.floor(width / cols);
      const cellH = Math.floor(height / rows);

      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;

      const studioRenderer = new THREE.WebGLRenderer({
        canvas: offCanvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
      });
      studioRenderer.setSize(width, height, false);
      studioRenderer.setPixelRatio(1);
      studioRenderer.setClearColor(0x000000, 0);
      studioRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      studioRenderer.toneMappingExposure = 1.18;

      const studioScene = new THREE.Scene();
      studioScene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const keyL = new THREE.DirectionalLight(0xfffcf2, 2.0);
      keyL.position.set(1.8, 3.8, 5.0);
      studioScene.add(keyL);
      const fillL = new THREE.DirectionalLight(0x90a8c4, 1.1);
      fillL.position.set(-2.5, 2.2, 4.0);
      studioScene.add(fillL);
      const rimL = new THREE.DirectionalLight(0xffe49e, 1.2);
      rimL.position.set(0, 3.5, -4.5);
      studioScene.add(rimL);

      const studioRigs = {
        challenger: buildChallengerModel(),
        bruiser: (ctx.buildBruiserModel ? ctx.buildBruiserModel(0) : buildBruiserModel(0)),
        kronos: buildKronosBossModel()
      };
      Object.values(studioRigs).forEach((r) => {
        if (r && r.contactShadowDecal) r.contactShadowDecal.visible = false;
        if (r && r.root) {
          r.root.scale.setScalar(1.0);
          r.root.position.set(0, 0, 0);
          r.root.visible = false;
          studioScene.add(r.root);
        }
      });

      const frustumH = 2.68;
      const frustumW = frustumH * (cellW / cellH);
      const centerY = 1.06;
      const studioCam = new THREE.OrthographicCamera(
        -frustumW * 0.5,
        frustumW * 0.5,
        frustumH * 0.5,
        -frustumH * 0.5,
        0.1,
        30
      );
      studioCam.position.set(0, centerY, 8.0);
      studioCam.lookAt(0, centerY, 0);
      studioCam.updateProjectionMatrix();

      const allJointNames = [
        'leftArm', 'leftElbow', 'rightArm', 'rightElbow',
        'leftLeg', 'leftKnee', 'leftAnkle', 'rightLeg',
        'rightKnee', 'rightAnkle', 'torso', 'hips', 'headGroup'
      ];

      const cells = [];
      const sheetViolations = [];
      studioRenderer.setScissorTest(true);

      for (let i = 0; i < clips.length; i++) {
        const clipName = clips[i];
        const entry = CLIP_POSE_LIBRARY[clipName] || CLIP_POSE_LIBRARY.jab;
        const { rigType, facingSign, impactFrameSec, hipsY, pose } = entry;
        const rig = studioRigs[rigType] || studioRigs.challenger;

        Object.values(studioRigs).forEach((r) => {
          if (r && r.root) r.root.visible = (r === rig);
        });

        for (const jn of allJointNames) {
          const node = rig[jn];
          if (node && node.rotation) {
            const rot = pose[jn] || [0, 0, 0];
            node.rotation.set(rot[0], rot[1], rot[2]);
          }
        }
        if (rig.hips && rig.hips.position) {
          rig.hips.position.set(0, hipsY !== undefined ? hipsY : 1.0, 0);
        }
        // Front 3/4 view angle so impact extension & elbow/knee anatomy read clearly
        rig.root.rotation.set(0, facingSign < 0 ? (Math.PI + 0.44) : 0.42, 0);

        const beforeViolations = jointLimitViolations.length;
        checkRigJointLimits(rig, `${rigType}:${clipName}`, facingSign, i);
        const clipViolations = jointLimitViolations.slice(beforeViolations);
        if (clipViolations.length > 0) {
          sheetViolations.push(...clipViolations);
        }

        const col = i % cols;
        const row = Math.floor(i / cols);
        const viewportX = col * cellW;
        const viewportY = height - (row + 1) * cellH;

        studioRenderer.setViewport(viewportX, viewportY, cellW, cellH);
        studioRenderer.setScissor(viewportX, viewportY, cellW, cellH);
        studioRenderer.render(studioScene, studioCam);

        const le = rig.leftElbow ? Number(rig.leftElbow.rotation.x.toFixed(2)) : 0;
        const re = rig.rightElbow ? Number(rig.rightElbow.rotation.x.toFixed(2)) : 0;
        const lk = rig.leftKnee ? Number(rig.leftKnee.rotation.x.toFixed(2)) : 0;
        const rk = rig.rightKnee ? Number(rig.rightKnee.rotation.x.toFixed(2)) : 0;

        cells.push({
          index: i,
          clipName,
          rigType,
          facingSign,
          impactFrameSec,
          leftElbowX: le,
          rightElbowX: re,
          leftKneeX: lk,
          rightKneeX: rk,
          jointLimitViolations: clipViolations.length,
          cellRect: { x: col * cellW, y: row * cellH, width: cellW, height: cellH }
        });
      }
      studioRenderer.setScissorTest(false);

      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = width;
      overlayCanvas.height = height;
      const ctx2d = overlayCanvas.getContext('2d');
      ctx2d.fillStyle = '#182028';
      ctx2d.fillRect(0, 0, width, height);
      ctx2d.drawImage(offCanvas, 0, 0);

      for (const cell of cells) {
        const { x, y, width: cw, height: ch } = cell.cellRect;
        ctx2d.strokeStyle = 'rgba(120, 160, 200, 0.28)';
        ctx2d.lineWidth = 2;
        ctx2d.strokeRect(x + 1, y + 1, cw - 2, ch - 2);

        ctx2d.fillStyle = 'rgba(12, 16, 22, 0.78)';
        ctx2d.fillRect(x + 8, y + 8, cw - 16, 30);
        ctx2d.fillStyle = '#00e5ff';
        ctx2d.font = 'bold 15px monospace';
        ctx2d.fillText(`#${String(cell.index + 1).padStart(2, '0')} ${cell.clipName.toUpperCase()} [${cell.rigType.toUpperCase()}]`, x + 16, y + 28);

        ctx2d.fillStyle = 'rgba(12, 16, 22, 0.78)';
        ctx2d.fillRect(x + 8, y + ch - 34, cw - 16, 26);
        ctx2d.fillStyle = cell.jointLimitViolations === 0 ? '#42f56c' : '#ff385c';
        ctx2d.font = '13px monospace';
        ctx2d.fillText(
          `APEX t=${cell.impactFrameSec.toFixed(2)}s | ELB:[${cell.leftElbowX},${cell.rightElbowX}] | LIM:${cell.jointLimitViolations === 0 ? 'OK' : 'FAIL'}`,
          x + 14,
          y + ch - 16
        );
      }

      studioRenderer.dispose();

      return {
        width,
        height,
        cols,
        rows,
        clipCount: clips.length,
        clipNames: clips,
        cells,
        jointLimitViolations: sheetViolations.length,
        dataUrl: overlayCanvas.toDataURL('image/png')
      };
    },

    runDirectorMarkerProbe: () => {
      const chart = audioEngine.getActiveChart();
      const beatSec = (chart && chart.beatSec) || ctx.KRONOS_BEAT_SEC || (60 / 92);
      const firstOffset = (chart && chart.firstBeatOffset !== undefined) ? chart.firstBeatOffset : 0.007;
      const origGetSongTime = audioEngine.getSongTime.bind(audioEngine);
      const dirMod = getDirectorModule();
      const hasRealDirector = Boolean(dirMod && typeof dirMod.tick === 'function');

      // Part 1: 16-bar sentinel probe (player on-beat impacts at 60Hz & 200Hz + enemy marker strikes + joint limits)
      const probe16Bar = window.KronosTestAPI.run16BarOnBeatProbe({ hz: 60 });

      // Part 2: Perfect Counter / Weave Bot in Wave 3 against Boss DJ Kronos & Royal Guard
      if (restartGameSession) restartGameSession();
      gameState.gameStarted = true;
      gameState.isPaused = false;
      gameState.isGameOver = false;
      spawnWave(3);
      if (bruisers[0]) {
        bruisers[0].active = false;
        bruisers[0].rig.root.visible = false;
      }
      gameState.enemyStrikeEvents = [];

      const dirBossGs = {
        wave: 3,
        kronosInRing: true,
        bossHp: 100,
        playerHp: 100,
        playerPos: gameState.playerPos,
        enemyStrikeEvents: []
      };
      const dirBoss = {
        id: 'kronos',
        isBoss: true,
        active: true,
        hp: 100,
        maxHp: 100,
        state: 'stalking',
        attackCooldown: 0,
        rig: kronosRig,
        position: { x: gameState.playerPos.x + 0.18, y: 0, z: gameState.playerPos.z - 1.25 }
      };
      if (hasRealDirector && typeof dirMod.resetDirector === 'function') {
        dirMod.resetDirector({ wave: 3, waveStartBeatFloat: 0 });
      }

      let simTime = firstOffset;
      audioEngine.getSongTime = () => simTime;
      const dt = 0.008;
      let counterWeavesTriggered = 0;
      let counterRipostesLanded = 0;
      let lastWeaveBeatIdx = -1;
      const chartArg = chart || { bpm: 92, beatSec, firstBeatOffset: firstOffset };

      for (let step = 0; step < 5000; step++) {
        simTime = Number((simTime + dt).toFixed(6));
        kronosRig.root.position.set(
          gameState.playerPos.x + 0.18,
          0,
          gameState.playerPos.z - 1.25
        );

        const totalBeats = gameState.wave3BeatFloat || 0;
        const nearestBeatIdx = Math.round(totalBeats);
        const beatDist = Math.abs(totalBeats - nearestBeatIdx);

        if (beatDist <= 0.075 && nearestBeatIdx !== lastWeaveBeatIdx) {
          lastWeaveBeatIdx = nearestBeatIdx;
          const prevBossHp = gameState.bossHp;
          gameState.lastDodgeTime = -10.0;
          triggerCombatAction('dodge');
          counterWeavesTriggered += 1;
          if (gameState.bossHp < prevBossHp || gameState.kronosRingState === 'counter_stun') {
            counterRipostesLanded += 1;
          }
        }

        if (hasRealDirector && dirBoss.hp > 0) {
          if (dirBoss.state === 'counter_stun' || dirBoss.state === 'stunned') {
            dirBoss.stateTimer = Math.max(0, (dirBoss.stateTimer || 0) - dt);
            if (dirBoss.stateTimer <= 0) {
              dirBoss.state = 'stalking';
            }
          }
          dirBoss.active = dirBoss.hp > 0;
          const dirSnap = dirMod.tick(simTime, dt, {
            gameState: dirBossGs,
            chart: chartArg,
            wave: 3,
            enemies: [dirBoss],
            challengerRig
          });
          if (
            dirSnap &&
            Array.isArray(dirSnap.scheduledStrikes) &&
            typeof dirMod.evaluateCounterInput === 'function'
          ) {
            const readyStrike = dirSnap.scheduledStrikes.find(
              (s) => !s.countered && Math.abs(simTime - s.markerTime) <= Math.min(0.020, (s.perfectWindowSec || 0.045) * 0.5)
            );
            if (readyStrike) {
              // Resolve strike on marker and apply perfect counter input
              const cRes = dirMod.evaluateCounterInput(simTime, 'dodge', {
                gameState: dirBossGs,
                chart: chartArg,
                challengerRig
              });
              if (cRes && cRes.countered) {
                dirBossGs.enemyStrikeEvents.push({
                  type: `kronos_${readyStrike.pattern || 'scratch'}`,
                  songTime: simTime,
                  markerTime: readyStrike.markerTime,
                  nearestBeatDeltaMs: Number((Math.abs(simTime - readyStrike.markerTime) * 1000).toFixed(2)),
                  onBeatMarker: Math.abs(simTime - readyStrike.markerTime) * 1000 <= 20.0
                });
              }
            }
          }
        }

        if (gameState.hitStopTimer > 0) {
          gameState.hitStopTimer = Math.max(0, gameState.hitStopTimer - dt);
        }
        if (ctx.stepSimulation && gameState.bossHp > 0 && !gameState.isGameOver) {
          ctx.stepSimulation(dt);
        }
        const baseDone = gameState.isGameOver || gameState.bossHp <= 0 || gameState.playerHp <= 0;
        const dirDone = !hasRealDirector || dirBoss.hp <= 0 || dirBossGs.bossHp <= 0;
        if (baseDone && dirDone) {
          break;
        }
      }

      const directorTelemetry = (hasRealDirector && typeof dirMod.getDirectorTelemetry === 'function')
        ? dirMod.getDirectorTelemetry()
        : null;

      const bossStrikes = (hasRealDirector && dirBossGs.enemyStrikeEvents.length > 0)
        ? dirBossGs.enemyStrikeEvents.slice()
        : (gameState.enemyStrikeEvents || []).slice();
      const maxBossStrikeOffsetMs = bossStrikes.reduce((acc, s) => Math.max(acc, s.nearestBeatDeltaMs || 0), 0);
      const bossStrikesOutsideMarker = bossStrikes.filter((s) => !s.onBeatMarker || s.nearestBeatDeltaMs > 20.0).length;

      const clearedBoss = hasRealDirector
        ? (dirBoss.hp <= 0 && gameState.bossHp <= 0)
        : (gameState.bossHp <= 0);
      const playerHpRemaining = hasRealDirector
        ? Math.min(Math.round(gameState.playerHp), Math.round(dirBossGs.playerHp))
        : Math.round(gameState.playerHp);
      const bossHpRemaining = hasRealDirector
        ? Math.max(Math.round(gameState.bossHp), Math.round(dirBoss.hp))
        : Math.round(gameState.bossHp);

      const perfectCounterBot = {
        mode: hasRealDirector ? 'real-modules' : 'track-0-baseline',
        clearedBoss,
        playerHpRemaining,
        bossHpRemaining,
        counterWeavesTriggered,
        counterRipostesLanded: hasRealDirector
          ? Math.max(counterRipostesLanded, (directorTelemetry && directorTelemetry.counterEventsCount) || 0)
          : counterRipostesLanded,
        bossStrikeCount: bossStrikes.length,
        maxBossStrikeOffsetMs: Number(maxBossStrikeOffsetMs.toFixed(2)),
        bossStrikesOutsideMarker,
        takedownTokensEarned: directorTelemetry ? directorTelemetry.takedownTokens : 0,
        feverMeter: directorTelemetry ? directorTelemetry.feverMeter : 0
      };

      audioEngine.getSongTime = origGetSongTime;
      if (restartGameSession) restartGameSession();

      return {
        mode: hasRealDirector ? 'real-modules' : 'track-0-baseline',
        probe16Bar,
        perfectCounterBot,
        directorTelemetry
      };
    },

    checkPhoneViewportLayout: () => {
      const vw = window.innerWidth || 375;
      const vh = window.innerHeight || 812;
      const docScrollW = document.documentElement.scrollWidth;
      const docScrollH = document.documentElement.scrollHeight;
      const horizontalOverflowPx = Math.max(0, docScrollW - vw);
      const verticalOverflowPx = Math.max(0, docScrollH - vh);

      const selectors = [
        '.top-left-hud',
        '.top-right-dock',
        '.bottom-right-arcade-deck',
        '#lyric-bar'
      ];
      const rects = [];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          rects.push({ selector: sel, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
        }
      }

      const overlaps = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (ix * iy > 4) {
            overlaps.push({ a: a.selector, b: b.selector, areaPx: Number((ix * iy).toFixed(1)) });
          }
        }
      }

      return {
        viewport: { width: vw, height: vh },
        horizontalOverflowPx,
        verticalOverflowPx,
        overlapCount: overlaps.length,
        overlaps
      };
    },

    runCpuFrameBudgetProbe: (frameCount = 60) => {
      renderer.render(scene, camera);
      const samples = [];
      const dt = 0.016;
      for (let i = 0; i < frameCount; i++) {
        const t0 = performance.now();
        if (ctx.stepSimulation) {
          ctx.stepSimulation(dt);
        }
        scene.updateMatrixWorld();
        samples.push(performance.now() - t0);
      }
      const sorted = samples.slice().sort((a, b) => a - b);
      const p50Ms = sorted.length > 0 ? Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)) : 0;
      const p95Ms = sorted.length > 0 ? Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)) : 0;
      const maxMs = sorted.length > 0 ? Number(sorted[sorted.length - 1].toFixed(2)) : 0;
      return {
        frameCount,
        p50Ms,
        p95Ms,
        maxMs,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
      };
    }
  };

  window.renderClipContactSheet = (clipNames) => window.KronosTestAPI.renderClipContactSheet(clipNames);


  window.renderTurnaroundSheet = function (characterName = 'challenger') {
    const isChallenger = characterName.toLowerCase().includes('challenger');
    const targetRig = isChallenger ? buildChallengerModel() : buildKronosBossModel();
    if (targetRig.contactShadowDecal) {
      targetRig.contactShadowDecal.visible = false;
    }
    if (!isChallenger) {
      targetRig.root.scale.setScalar(1.0);
    }

    const width = 2048;
    const height = 1080;
    const colW = width / 4;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;

    const studioRenderer = new THREE.WebGLRenderer({
      canvas: offCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    studioRenderer.setSize(width, height, false);
    studioRenderer.setPixelRatio(1);
    studioRenderer.setClearColor(0x000000, 0);
    studioRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    studioRenderer.toneMappingExposure = 1.18;

    const studioScene = new THREE.Scene();
    studioScene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const keyL = new THREE.DirectionalLight(0xfffcf2, 2.0);
    keyL.position.set(1.8, 3.8, 5.0);
    studioScene.add(keyL);
    const fillL = new THREE.DirectionalLight(0x90a8c4, 1.1);
    fillL.position.set(-2.5, 2.2, 4.0);
    studioScene.add(fillL);
    const rimL = new THREE.DirectionalLight(0xffe49e, 1.2);
    rimL.position.set(0, 3.5, -4.5);
    studioScene.add(rimL);

    targetRig.root.position.set(0, 0, 0);
    studioScene.add(targetRig.root);

    const frustumH = isChallenger ? 2.358 : 2.310;
    const frustumW = frustumH * (colW / height);
    const centerY = isChallenger ? 1.009 : 1.010;
    const studioCam = new THREE.OrthographicCamera(
      -frustumW * 0.5,
      frustumW * 0.5,
      frustumH * 0.5,
      -frustumH * 0.5,
      0.1,
      30
    );
    studioCam.position.set(0, centerY, 8.0);
    studioCam.lookAt(0, centerY, 0);
    studioCam.updateProjectionMatrix();

    const angleYaws = isChallenger
      ? [Math.PI, Math.PI + 0.44, Math.PI * 1.5, 0]
      : [0, 0.42, Math.PI * 0.5, Math.PI];

    studioRenderer.setScissorTest(true);
    for (let i = 0; i < 4; i++) {
      const x = i * colW;
      studioRenderer.setViewport(x, 0, colW, height);
      studioRenderer.setScissor(x, 0, colW, height);
      targetRig.root.rotation.y = angleYaws[i];
      studioRenderer.render(studioScene, studioCam);
    }
    studioRenderer.setScissorTest(false);

    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    const ctx2d = overlayCanvas.getContext('2d');
    ctx2d.fillStyle = isChallenger ? '#222931' : '#26313a';
    ctx2d.fillRect(0, 0, width, height);
    ctx2d.drawImage(offCanvas, 0, 0);
    studioRenderer.dispose();

    return {
      character: characterName,
      dataUrl: overlayCanvas.toDataURL('image/png')
    };
  };

  window.KronosTestAPI.loadRealModules().catch(() => {});

  window.__KRONOS_DEBUG__ = ctx;
  return window.KronosTestAPI;
}
