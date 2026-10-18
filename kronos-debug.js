/**
 * kronos-debug.js
 * Debug & Automated QA Telemetry Harness for DJ KRONOS (loaded only when ?debug=1 is present)
 */

import * as THREE from 'three';
import {
  buildChallengerModel,
  buildKronosBossModel
} from './kronos-models.js?v=20261017d';

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
    }
  };

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

  window.__KRONOS_DEBUG__ = ctx;
  return window.KronosTestAPI;
}
