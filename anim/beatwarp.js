/**
 * anim/beatwarp.js
 * Dead as Disco BeatWarp Section Scheduler, Clip Event Emitter, Hit-Stop Mixer Controller,
 * and Recovery Cancel / Crossfade Chainer for DJ KRONOS (Phase 3).
 *
 * Adheres strictly to CONTRACTS.md Section 2.1, Section 2.4, and Section 3.
 */

import {
  now as clockNow,
  nextSubdivision as clockNextSubdivision,
  nearestSubdivision as clockNearestSubdivision,
  scheduleSfx as clockScheduleSfx,
  getActiveChart as clockGetActiveChart,
  createBpmChart
} from '../audio/clock.js';

/**
 * Default sidecar manifest matching `assets/models/clips.json` (CONTRACTS.md Section 3).
 * Includes all 20 player/shared humanoid clips and 9 enemy/boss clips, plus Kronos move aliases.
 */
export const DEFAULT_CLIPS_MANIFEST = {
  version: 1,
  skeleton: 'mixamo-humanoid-v1',
  clips: {
    // --- Player / Shared Humanoid Clips ---
    'idle-dance': {
      clip: 'idle-dance',
      duration: 5.2174,
      loop: true,
      sections: [
        { name: 'groove', t0: 0.0, t1: 5.2174, stretch: [0.5, 2.0], syncEnd: 'nextSubdivision', subdivision: 1.0 }
      ]
    },
    'step-L': {
      clip: 'step-L',
      duration: 0.32,
      sections: [
        { name: 'windup', t0: 0.0, t1: 0.16, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.16, t1: 0.20, stretch: [1.0, 1.0], event: 'step' },
        { name: 'recovery', t0: 0.20, t1: 0.32, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.24 }
      ]
    },
    'step-R': {
      clip: 'step-R',
      duration: 0.32,
      sections: [
        { name: 'windup', t0: 0.0, t1: 0.16, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.16, t1: 0.20, stretch: [1.0, 1.0], event: 'step' },
        { name: 'recovery', t0: 0.20, t1: 0.32, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.24 }
      ]
    },
    'jab': {
      clip: 'jab',
      duration: 0.62,
      impactFrame: 0.22,
      defaultHitStopSec: 0.048,
      sections: [
        {
          name: 'windup',
          t0: 0.00,
          t1: 0.22,
          stretch: [0.55, 2.2],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5
        },
        {
          name: 'impact',
          t0: 0.22,
          t1: 0.30,
          stretch: [1.0, 1.0],
          event: 'hit'
        },
        {
          name: 'recovery',
          t0: 0.30,
          t1: 0.62,
          stretch: [0.6, 1.6],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5,
          cancelFrom: 0.40
        }
      ]
    },
    'cross': {
      clip: 'cross',
      duration: 0.68,
      impactFrame: 0.24,
      defaultHitStopSec: 0.070,
      sections: [
        {
          name: 'windup',
          t0: 0.00,
          t1: 0.24,
          stretch: [0.55, 2.2],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5
        },
        {
          name: 'impact',
          t0: 0.24,
          t1: 0.32,
          stretch: [1.0, 1.0],
          event: 'hit'
        },
        {
          name: 'recovery',
          t0: 0.32,
          t1: 0.68,
          stretch: [0.6, 1.6],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5,
          cancelFrom: 0.44
        }
      ]
    },
    'uppercut': {
      clip: 'uppercut',
      duration: 0.76,
      impactFrame: 0.26,
      defaultHitStopSec: 0.110,
      sections: [
        {
          name: 'windup',
          t0: 0.00,
          t1: 0.26,
          stretch: [0.55, 2.2],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5
        },
        {
          name: 'impact',
          t0: 0.26,
          t1: 0.35,
          stretch: [1.0, 1.0],
          event: 'hit'
        },
        {
          name: 'recovery',
          t0: 0.35,
          t1: 0.76,
          stretch: [0.6, 1.6],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5,
          cancelFrom: 0.48
        }
      ]
    },
    'kick': {
      clip: 'kick',
      duration: 0.80,
      impactFrame: 0.28,
      defaultHitStopSec: 0.100,
      sections: [
        {
          name: 'windup',
          t0: 0.00,
          t1: 0.28,
          stretch: [0.55, 2.2],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5
        },
        {
          name: 'impact',
          t0: 0.28,
          t1: 0.37,
          stretch: [1.0, 1.0],
          event: 'hit'
        },
        {
          name: 'recovery',
          t0: 0.37,
          t1: 0.80,
          stretch: [0.6, 1.6],
          syncEnd: 'nextSubdivision',
          subdivision: 0.5,
          cancelFrom: 0.50
        }
      ]
    },
    'dodge-L': {
      clip: 'dodge-L',
      duration: 0.44,
      impactFrame: 0.14,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.14, stretch: [0.5, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.14, t1: 0.22, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.22, t1: 0.44, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.28 }
      ]
    },
    'dodge-R': {
      clip: 'dodge-R',
      duration: 0.44,
      impactFrame: 0.14,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.14, stretch: [0.5, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.14, t1: 0.22, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.22, t1: 0.44, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.28 }
      ]
    },
    'counter-riposte': {
      clip: 'counter-riposte',
      duration: 0.72,
      impactFrame: 0.25,
      defaultHitStopSec: 0.095,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.25, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 1.0 },
        { name: 'impact', t0: 0.25, t1: 0.34, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.34, t1: 0.72, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.46 }
      ]
    },
    'hurt-light': {
      clip: 'hurt-light',
      duration: 0.36,
      impactFrame: 0.08,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.08, stretch: [0.5, 2.0], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.08, t1: 0.14, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.14, t1: 0.36, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.22 }
      ]
    },
    'hurt-heavy': {
      clip: 'hurt-heavy',
      duration: 0.55,
      impactFrame: 0.12,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.12, stretch: [0.5, 2.0], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.12, t1: 0.20, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.20, t1: 0.55, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.35 }
      ]
    },
    'launch': {
      clip: 'launch',
      duration: 0.65,
      impactFrame: 0.15,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.15, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.15, t1: 0.25, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.25, t1: 0.65, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.45 }
      ]
    },
    'land': {
      clip: 'land',
      duration: 0.40,
      impactFrame: 0.10,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.10, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.10, t1: 0.16, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.16, t1: 0.40, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.25 }
      ]
    },
    'guard': {
      clip: 'guard',
      duration: 0.38,
      impactFrame: 0.10,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.10, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.10, t1: 0.16, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.16, t1: 0.38, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.24 }
      ]
    },
    'guard-break': {
      clip: 'guard-break',
      duration: 0.70,
      impactFrame: 0.16,
      defaultHitStopSec: 0.08,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.16, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.16, t1: 0.24, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.24, t1: 0.70, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.45 }
      ]
    },
    'stagger': {
      clip: 'stagger',
      duration: 0.60,
      impactFrame: 0.14,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.14, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.14, t1: 0.22, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.22, t1: 0.60, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.40 }
      ]
    },
    'KO-fall': {
      clip: 'KO-fall',
      duration: 0.90,
      impactFrame: 0.22,
      defaultHitStopSec: 0.12,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.22, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.22, t1: 0.34, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.34, t1: 0.90, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.70 }
      ]
    },
    'get-up': {
      clip: 'get-up',
      duration: 0.65,
      impactFrame: 0.20,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.20, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.20, t1: 0.28, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.28, t1: 0.65, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.45 }
      ]
    },
    'taunt': {
      clip: 'taunt',
      duration: 0.64,
      impactFrame: 0.22,
      defaultHitStopSec: 0.0,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.22, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.22, t1: 0.30, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.30, t1: 0.64, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.42 }
      ]
    },

    // --- Enemy / Boss Clips ---
    'hook': {
      clip: 'hook',
      duration: 0.72,
      impactFrame: 0.32,
      defaultHitStopSec: 0.05,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.32, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.32, t1: 0.40, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.40, t1: 0.72, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.52 }
      ]
    },
    'haymaker': {
      clip: 'haymaker',
      duration: 0.88,
      impactFrame: 0.42,
      defaultHitStopSec: 0.08,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.42, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 1.0 },
        { name: 'impact', t0: 0.42, t1: 0.52, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.52, t1: 0.88, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.68 }
      ]
    },
    'double-tap': {
      clip: 'double-tap',
      duration: 0.70,
      impactFrame: 0.26,
      defaultHitStopSec: 0.05,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.26, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.26, t1: 0.34, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.34, t1: 0.70, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.48 }
      ]
    },
    'charge': {
      clip: 'charge',
      duration: 0.96,
      impactFrame: 0.46,
      defaultHitStopSec: 0.09,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.46, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 1.0 },
        { name: 'impact', t0: 0.46, t1: 0.56, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.56, t1: 0.96, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.72 }
      ]
    },
    'scratch-1': {
      clip: 'scratch-1',
      duration: 0.64,
      impactFrame: 0.24,
      defaultHitStopSec: 0.048,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.24, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.24, t1: 0.32, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.32, t1: 0.64, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.44 }
      ]
    },
    'scratch-2': {
      clip: 'scratch-2',
      duration: 0.64,
      impactFrame: 0.24,
      defaultHitStopSec: 0.048,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.24, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.24, t1: 0.32, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.32, t1: 0.64, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.44 }
      ]
    },
    'scratch-3': {
      clip: 'scratch-3',
      duration: 0.72,
      impactFrame: 0.26,
      defaultHitStopSec: 0.08,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.26, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 0.5 },
        { name: 'impact', t0: 0.26, t1: 0.35, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.35, t1: 0.72, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.48 }
      ]
    },
    'bass-drop': {
      clip: 'bass-drop',
      duration: 1.05,
      impactFrame: 0.48,
      defaultHitStopSec: 0.12,
      sections: [
        { name: 'windup', t0: 0.00, t1: 0.48, stretch: [0.55, 2.2], syncEnd: 'nextSubdivision', subdivision: 1.0 },
        { name: 'impact', t0: 0.48, t1: 0.60, stretch: [1.0, 1.0], event: 'hit' },
        { name: 'recovery', t0: 0.60, t1: 1.05, stretch: [0.6, 1.6], syncEnd: 'nextSubdivision', subdivision: 0.5, cancelFrom: 0.80 }
      ]
    },
    'boss-idle': {
      clip: 'boss-idle',
      duration: 2.6087,
      loop: true,
      sections: [
        { name: 'groove', t0: 0.0, t1: 2.6087, stretch: [0.5, 2.0], syncEnd: 'nextSubdivision', subdivision: 1.0 }
      ]
    }
  }
};

const CLIP_NAME_ALIASES = {
  'punch-jab': 'jab',
  'punch-cross': 'cross',
  'punch-uppercut': 'uppercut',
  'dodge': 'dodge-L'
};

const BONE_NAME_ALIASES = {
  'spine': 'torso',
  'torso': 'torso',
  'head': 'headGroup',
  'headGroup': 'headGroup',
  'hips': 'hips',
  'leftArm': 'leftArm',
  'leftElbow': 'leftElbow',
  'leftHand': 'leftHand',
  'rightArm': 'rightArm',
  'rightElbow': 'rightElbow',
  'rightHand': 'rightHand',
  'leftLeg': 'leftLeg',
  'leftKnee': 'leftKnee',
  'leftAnkle': 'leftAnkle',
  'rightLeg': 'rightLeg',
  'rightKnee': 'rightKnee',
  'rightAnkle': 'rightAnkle'
};

let _activeManifest = DEFAULT_CLIPS_MANIFEST;
const _activeSchedules = [];
const _bufferedInputsByActor = new WeakMap();
const _beatWarpTelemetry = {
  scheduledCount: 0,
  hitCount: 0,
  completedCount: 0,
  stretchViolations: 0,
  hitOffsetsMs: []
};

/**
 * Retrieve a clip's BeatWarp section specification by name.
 *
 * @param {string} clipName
 * @param {Object} [manifestOverride]
 * @returns {Object} Clip definition
 */
export function getClipDefinition(clipName, manifestOverride = undefined) {
  const manifest = manifestOverride || _activeManifest || DEFAULT_CLIPS_MANIFEST;
  const clipsMap = (manifest && manifest.clips) ? manifest.clips : manifest;
  const canonical = CLIP_NAME_ALIASES[clipName] || clipName || 'jab';
  return (clipsMap && (clipsMap[clipName] || clipsMap[canonical])) || DEFAULT_CLIPS_MANIFEST.clips.jab;
}

export function setClipsManifest(manifest) {
  if (manifest && typeof manifest === 'object') {
    _activeManifest = manifest;
  }
  return _activeManifest;
}

/**
 * Attach or verify the frozen CONTRACTS.md Section 2.4 rig interface (`playClip(name, opts)` and `bone(name)`)
 * on an actor or procedural rig.
 *
 * @param {Object} actor
 * @returns {Object} Actor with `.playClip` and `.bone`
 */
export function ensureActorInterface(actor) {
  const target = (actor && typeof actor === 'object') ? actor : {};

  if (typeof target.bone !== 'function') {
    target.bone = function bone(name) {
      const alias = BONE_NAME_ALIASES[name] || name;
      if (this.bones && (this.bones[name] || this.bones[alias])) {
        return this.bones[name] || this.bones[alias];
      }
      if (this[name] && typeof this[name] === 'object') return this[name];
      if (this[alias] && typeof this[alias] === 'object') return this[alias];
      if (this.rig && typeof this.rig === 'object') {
        if (this.rig[name]) return this.rig[name];
        if (this.rig[alias]) return this.rig[alias];
      }
      return null;
    };
  }

  if (typeof target.playClip !== 'function') {
    target.playClip = function playClip(name, opts = {}) {
      const handle = {
        clipName: name,
        time: Number.isFinite(opts.startTime) ? Number(opts.startTime) : 0.0,
        timeScale: Number.isFinite(opts.timeScale) ? Number(opts.timeScale) : 1.0,
        fadeInSec: Number.isFinite(opts.fadeInSec) ? Number(opts.fadeInSec) : 0.07,
        loop: Boolean(opts.loop),
        paused: false
      };
      this._currentAction = handle;
      return handle;
    };
  }

  return target;
}

/**
 * Create a standalone mock character rig implementing `playClip(name, opts)` and `bone(name)`.
 *
 * @param {string} [id='challenger']
 * @returns {Object}
 */
export function createMockActor(id = 'challenger') {
  const boneNames = [
    'hips', 'torso', 'spine', 'headGroup', 'head',
    'leftArm', 'leftElbow', 'leftHand',
    'rightArm', 'rightElbow', 'rightHand',
    'leftLeg', 'leftKnee', 'leftAnkle',
    'rightLeg', 'rightKnee', 'rightAnkle'
  ];
  const bones = {};
  for (let i = 0; i < boneNames.length; i++) {
    const bName = boneNames[i];
    bones[bName] = {
      name: bName,
      position: { x: 0, y: bName === 'hips' ? 1.0 : 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    };
  }
  return ensureActorInterface({
    id,
    bones,
    actionHistory: [],
    playClip(name, opts = {}) {
      const handle = {
        clipName: name,
        time: Number.isFinite(opts.startTime) ? Number(opts.startTime) : 0.0,
        timeScale: Number.isFinite(opts.timeScale) ? Number(opts.timeScale) : 1.0,
        fadeInSec: Number.isFinite(opts.fadeInSec) ? Number(opts.fadeInSec) : 0.07,
        loop: Boolean(opts.loop),
        paused: false
      };
      this._currentAction = handle;
      this.actionHistory.push(handle);
      return handle;
    },
    bone(name) {
      const alias = BONE_NAME_ALIASES[name] || name;
      return this.bones[name] || this.bones[alias] || null;
    }
  });
}

/**
 * Grade an input press timestamp `tPress` against the active chart's beat grid.
 * Per Section 3.2 Rule 4: MISS executes the full attack at ×1.0 damage with no bonus effects.
 *
 * @param {number} tPress
 * @param {Object} [chart]
 * @returns {{ grade: string, offsetSec: number, mult: number, onBeat: boolean }}
 */
export function evaluatePressGrade(tPress, chart = undefined) {
  if (!Number.isFinite(tPress)) {
    return { grade: 'PERFECT', offsetSec: 0, mult: 1.25, onBeat: true };
  }
  const nearestBeat = clockNearestSubdivision(tPress, 1.0, chart);
  const offsetSec = Math.abs(tPress - nearestBeat);
  if (offsetSec <= 0.085) {
    return { grade: 'PERFECT', offsetSec, mult: 1.25, onBeat: true };
  }
  if (offsetSec <= 0.165) {
    return { grade: 'ON_BEAT', offsetSec, mult: 1.10, onBeat: true };
  }
  return { grade: 'MISS', offsetSec, mult: 1.0, onBeat: false };
}

function _computeRecoveryPlan(impactTime, hitStopSec, recoverySecDef, nextSubfn, chart) {
  const recT0 = Number.isFinite(recoverySecDef.t0) ? Number(recoverySecDef.t0) : 0.30;
  const recT1 = Number.isFinite(recoverySecDef.t1) ? Number(recoverySecDef.t1) : 0.62;
  const recoveryLen = Math.max(1e-4, recT1 - recT0);
  const stretchArr = Array.isArray(recoverySecDef.stretch) && recoverySecDef.stretch.length >= 2
    ? recoverySecDef.stretch
    : [0.6, 1.6];
  const rStretchMin = Math.max(0.1, Number(stretchArr[0]) || 0.6);
  const rStretchMax = Math.max(rStretchMin, Number(stretchArr[1]) || 1.6);
  const rSubdiv = Number.isFinite(recoverySecDef.subdivision) && recoverySecDef.subdivision > 0
    ? Number(recoverySecDef.subdivision)
    : 0.5;

  const tPostHitStop = impactTime + Math.max(0.0, hitStopSec);
  const minRecDur = recoveryLen * rStretchMin;
  const recoveryEndTime = nextSubfn(tPostHitStop + minRecDur, rSubdiv, chart);
  const totalRecWindow = Math.max(minRecDur, recoveryEndTime - tPostHitStop);
  const rawRecStretch = totalRecWindow / recoveryLen;

  let recoveryStretchRatio = rawRecStretch;
  let recoveryHoldSec = 0.0;
  if (rawRecStretch > rStretchMax) {
    recoveryStretchRatio = rStretchMax;
    recoveryHoldSec = Math.max(0.0, totalRecWindow - recoveryLen * rStretchMax);
  } else if (rawRecStretch < rStretchMin) {
    recoveryStretchRatio = rStretchMin;
  }

  const recoveryTimeScale = 1.0 / recoveryStretchRatio;
  const cancelFromClip = Number.isFinite(recoverySecDef.cancelFrom)
    ? Number(recoverySecDef.cancelFrom)
    : (recT0 + recoveryLen * 0.3125);
  const cancelClipOffset = Math.max(0.0, Math.min(recoveryLen, cancelFromClip - recT0));
  const cancelReadyTime = tPostHitStop + cancelClipOffset * recoveryStretchRatio;

  return {
    recT0,
    recT1,
    recoveryLen,
    rStretchMin,
    rStretchMax,
    rSubdiv,
    tPostHitStop,
    recoveryEndTime,
    recoveryStretchRatio,
    recoveryTimeScale,
    recoveryHoldSec,
    cancelReadyTime
  };
}

/**
 * Schedule and time-warp an attack/action clip on `actor` starting immediately at `tPress`
 * so its `windup` section ends on the target musical subdivision `T`, fires the `hit` event
 * from the clip at `T`, pauses the mixer during hit-stop, and warps `recovery` to end on
 * the next subdivision after `T + hitStop`.
 *
 * @param {Object} actor - Character rig/actor exposing `playClip(name, opts)` and `bone(name)`
 * @param {string} clipName - Clip identifier in `clips.json` (e.g. 'jab', 'cross', 'uppercut', 'kick', 'dodge-L', 'dodge-R', 'counter-riposte')
 * @param {number} tPress - Audio clock timestamp (seconds) when input was pressed
 * @param {Object} [options] - Optional overrides `{ clock, clipsManifest, hitStopSec, fromCancel, chart, bpm }`
 * @returns {{
 *   clipName: string,
 *   tPress: number,
 *   impactTime: number,
 *   recoveryEndTime: number,
 *   cancelReadyTime: number,
 *   windupTimeScale: number,
 *   recoveryTimeScale: number,
 *   anticipationHoldSec: number,
 *   events: {
 *     onSectionChange: (cb: (sectionName: string, tAudio: number) => void) => void,
 *     onHit: (cb: (payload: { clipName: string, impactTime: number, actualAudioTime: number, subdivisionTime: number, offsetMs: number }) => void) => void,
 *     onCancelWindow: (cb: (tAudio: number) => void) => void,
 *     onComplete: (cb: (tAudio: number) => void) => void
 *   }
 * }}
 */
export function scheduleAction(actor, clipName, tPress, options = {}) {
  const safeActor = ensureActorInterface(actor);
  const clockObj = (options && options.clock) || null;
  const nextSubfn = (clockObj && typeof clockObj.nextSubdivision === 'function')
    ? clockObj.nextSubdivision.bind(clockObj)
    : clockNextSubdivision;
  const sfxFn = (clockObj && typeof clockObj.scheduleSfx === 'function')
    ? clockObj.scheduleSfx.bind(clockObj)
    : clockScheduleSfx;

  const chart = (options && options.chart) ||
    (options && Number.isFinite(options.bpm) ? createBpmChart(options.bpm) : null) ||
    (clockObj && clockObj.chart) ||
    clockGetActiveChart();

  const safePressTime = Number.isFinite(tPress)
    ? Number(tPress)
    : ((clockObj && typeof clockObj.now === 'function' ? clockObj.now() : clockNow()) ?? 0.0);

  // Check if chaining from an active recovery cancel window on the same actor
  let isFromCancel = Boolean(options && options.fromCancel);
  for (let i = _activeSchedules.length - 1; i >= 0; i--) {
    const prev = _activeSchedules[i];
    if (prev.actor === safeActor && !prev.completed && prev.hitFired && safePressTime >= prev.cancelReadyTime - 1e-6) {
      isFromCancel = true;
      prev.completed = true;
      prev.currentSection = 'canceled';
    }
  }

  const clipDef = getClipDefinition(clipName, options && options.clipsManifest);
  const sections = Array.isArray(clipDef.sections) ? clipDef.sections : DEFAULT_CLIPS_MANIFEST.clips.jab.sections;

  const windupSec = sections.find((s) => s.name === 'windup') || sections[0];
  const impactSec = sections.find((s) => s.name === 'impact' || s.event === 'hit') || sections[1] || {
    name: 'impact',
    t0: windupSec.t1,
    t1: windupSec.t1 + 0.08,
    stretch: [1.0, 1.0],
    event: 'hit'
  };
  const recoverySec = sections.find((s) => s.name === 'recovery') || sections[sections.length - 1];

  // 1. Windup section BeatWarp math:
  // Pick first subdivision boundary T >= tPress + windupLen * stretchMin
  const windupT0 = Number.isFinite(windupSec.t0) ? Number(windupSec.t0) : 0.0;
  const windupT1 = Number.isFinite(windupSec.t1) ? Number(windupSec.t1) : (clipDef.impactFrame ?? 0.22);
  const windupLen = Math.max(1e-4, windupT1 - windupT0);
  const wStretchArr = Array.isArray(windupSec.stretch) && windupSec.stretch.length >= 2
    ? windupSec.stretch
    : [0.55, 2.2];
  const wStretchMin = Math.max(0.1, Number(wStretchArr[0]) || 0.55);
  const wStretchMax = Math.max(wStretchMin, Number(wStretchArr[1]) || 2.2);
  const wSubdiv = Number.isFinite(windupSec.subdivision) && windupSec.subdivision > 0
    ? Number(windupSec.subdivision)
    : 0.5;

  const minWindupDur = windupLen * wStretchMin;
  const maxWindupDur = windupLen * wStretchMax;
  const impactTime = nextSubfn(safePressTime + minWindupDur, wSubdiv, chart);
  const totalWindupWindow = Math.max(minWindupDur, impactTime - safePressTime);
  const rawWindupStretch = totalWindupWindow / windupLen;

  let anticipationHoldSec = 0.0;
  let windupStretchRatio = rawWindupStretch;
  if (rawWindupStretch > wStretchMax) {
    // Keep T as target subdivision, hold initial anticipation frames, then run windup at wStretchMax
    anticipationHoldSec = Math.max(0.0, totalWindupWindow - maxWindupDur);
    windupStretchRatio = wStretchMax;
  } else if (rawWindupStretch < wStretchMin) {
    windupStretchRatio = wStretchMin;
  }

  const windupTimeScale = 1.0 / windupStretchRatio;

  // Verify stretch compliance for telemetry
  if (
    windupStretchRatio < wStretchMin - 1e-6 ||
    windupStretchRatio > wStretchMax + 1e-6
  ) {
    _beatWarpTelemetry.stretchViolations += 1;
  }

  // 2. Hit-stop & Recovery section BeatWarp math:
  const hitStopSec = (options && Number.isFinite(options.hitStopSec))
    ? Math.max(0.0, Number(options.hitStopSec))
    : (Number.isFinite(clipDef.defaultHitStopSec) ? Number(clipDef.defaultHitStopSec) : 0.048);

  // Recovery plays from the impact frame through the impact section (follow-through/overshoot)
  // and the recovery section as one stretched span, so no frames are skipped after hit-stop.
  const recoverySpanDef = { ...recoverySec, t0: Math.min(windupT1, Number.isFinite(recoverySec.t0) ? Number(recoverySec.t0) : windupT1) };
  const recPlan = _computeRecoveryPlan(impactTime, hitStopSec, recoverySpanDef, nextSubfn, chart);
  if (
    recPlan.recoveryStretchRatio < recPlan.rStretchMin - 1e-6 ||
    recPlan.recoveryStretchRatio > recPlan.rStretchMax + 1e-6
  ) {
    _beatWarpTelemetry.stretchViolations += 1;
  }

  // 3. Grade press timing (MISS = normal ×1.0 hit, never delays or whiffs on timing)
  const pressGrade = evaluatePressGrade(safePressTime, chart);

  // 4. Start clip immediately on actor with 60-80ms crossfade (0.07s on cancel chain)
  const fadeInSec = isFromCancel ? 0.07 : ((options && Number.isFinite(options.fadeInSec)) ? Number(options.fadeInSec) : 0.06);
  const initialTimeScale = anticipationHoldSec > 0 ? 0.0 : windupTimeScale;
  const actionHandle = safeActor.playClip(clipDef.clip || clipName, {
    fadeInSec,
    timeScale: initialTimeScale,
    startTime: windupT0,
    loop: Boolean(clipDef.loop)
  }) || {
    clipName: clipDef.clip || clipName,
    time: windupT0,
    timeScale: initialTimeScale,
    fadeInSec,
    paused: false
  };

  // 5. Pre-schedule whoosh (and, unless the game resolves contact itself, the impact SFX)
  //    on the Web Audio master clock.
  const wantWhooshSfx = !(options && options.scheduleWhooshSfx === false);
  const wantImpactSfx = !(options && options.scheduleImpactSfx === false);
  try {
    if (wantWhooshSfx) sfxFn('whoosh', safePressTime + anticipationHoldSec, { grade: pressGrade.grade });
    if (wantImpactSfx) sfxFn(clipDef.clip || clipName, impactTime, { grade: pressGrade.grade });
  } catch (_) {}

  const sectionListeners = [];
  const hitListeners = [];
  const cancelListeners = [];
  const completeListeners = [];

  if (options && typeof options.onSectionChange === 'function') sectionListeners.push(options.onSectionChange);
  if (options && typeof options.onHit === 'function') hitListeners.push(options.onHit);
  if (options && typeof options.onCancelWindow === 'function') cancelListeners.push(options.onCancelWindow);
  if (options && typeof options.onComplete === 'function') completeListeners.push(options.onComplete);

  const events = {
    onSectionChange(cb) {
      if (typeof cb === 'function') sectionListeners.push(cb);
      return events;
    },
    onHit(cb) {
      if (typeof cb === 'function') hitListeners.push(cb);
      return events;
    },
    onCancelWindow(cb) {
      if (typeof cb === 'function') cancelListeners.push(cb);
      return events;
    },
    onComplete(cb) {
      if (typeof cb === 'function') completeListeners.push(cb);
      return events;
    }
  };

  const scheduleEntry = {
    actor: safeActor,
    actionHandle,
    clipName,
    canonicalClipName: clipDef.clip || clipName,
    tPress: safePressTime,
    impactTime,
    subdivisionTime: impactTime,
    recoveryEndTime: recPlan.recoveryEndTime,
    cancelReadyTime: recPlan.cancelReadyTime,
    windupTimeScale,
    recoveryTimeScale: recPlan.recoveryTimeScale,
    windupStretchRatio,
    recoveryStretchRatio: recPlan.recoveryStretchRatio,
    windupStretchLimits: [wStretchMin, wStretchMax],
    recoveryStretchLimits: [recPlan.rStretchMin, recPlan.rStretchMax],
    anticipationHoldSec,
    recoveryHoldSec: recPlan.recoveryHoldSec,
    hitStopSec,
    fromCancel: isFromCancel,
    fadeInSec,
    grade: pressGrade.grade,
    damageMultiplier: pressGrade.mult,
    currentSection: 'windup',
    inAnticipationHold: anticipationHoldSec > 0,
    inRecoveryHold: false,
    windupEmitted: false,
    hitFired: false,
    recoveryEmitted: false,
    cancelWindowFired: false,
    completed: false,
    windupSec: { t0: windupT0, t1: windupT1, len: windupLen, stretchMin: wStretchMin, stretchMax: wStretchMax, subdivision: wSubdiv },
    impactSec,
    recoverySecDef: recoverySpanDef,
    recPlan,
    nextSubfn,
    sfxFn,
    chart,
    sectionListeners,
    hitListeners,
    cancelListeners,
    completeListeners,
    events
  };

  _activeSchedules.push(scheduleEntry);
  _beatWarpTelemetry.scheduledCount += 1;

  return {
    clipName,
    tPress: safePressTime,
    impactTime,
    recoveryEndTime: recPlan.recoveryEndTime,
    cancelReadyTime: recPlan.cancelReadyTime,
    windupTimeScale,
    recoveryTimeScale: recPlan.recoveryTimeScale,
    windupStretchRatio,
    recoveryStretchRatio: recPlan.recoveryStretchRatio,
    anticipationHoldSec,
    recoveryHoldSec: recPlan.recoveryHoldSec,
    hitStopSec,
    fromCancel: isFromCancel,
    fadeInSec,
    grade: pressGrade.grade,
    damageMultiplier: pressGrade.mult,
    events,
    _internal: scheduleEntry
  };
}

/**
 * Buffer a combo follow-up press on `actor` during windup/impact so it dequeues automatically
 * at `recovery.cancelFrom` with a 70ms crossfade from the current pose.
 *
 * @param {Object} actor
 * @param {string} clipName
 * @param {number} tPress
 * @param {Object} [options]
 */
export function bufferAction(actor, clipName, tPress, options = {}) {
  const safeActor = ensureActorInterface(actor);
  const active = _activeSchedules.find((s) => s.actor === safeActor && !s.completed);
  if (!active || (active.hitFired && tPress >= active.cancelReadyTime - 1e-6)) {
    return scheduleAction(safeActor, clipName, tPress, { ...options, fromCancel: Boolean(active) });
  }
  _bufferedInputsByActor.set(safeActor, { clipName, tPress, options });
  return null;
}

/**
 * Advance all active BeatWarp action schedules to audio timestamp `tAudio` (or `dt` when paused in hit-stop).
 *
 * @param {number} tAudio - Current master audio clock time in seconds (`clock.now()`)
 * @param {number} rawDt - Unscaled frame delta in seconds
 * @param {number} hitStopRemainingSec - Remaining hit-stop duration in seconds
 */
export function tickBeatWarp(tAudio, rawDt, hitStopRemainingSec = 0) {
  const curAudio = Number.isFinite(tAudio) ? Number(tAudio) : (clockNow() ?? 0.0);
  const dt = Number.isFinite(rawDt) && rawDt >= 0 ? Number(rawDt) : 0.0;
  const extHitStop = Number.isFinite(hitStopRemainingSec) && hitStopRemainingSec > 0
    ? Number(hitStopRemainingSec)
    : 0.0;

  // Symmetric nearest-tick tolerance so discrete frame ticks (e.g. 1ms, 4ms, 8ms, 16.67ms)
  // fire impact on the tick closest to T (bounded by ±dt/2, max 10ms).
  const halfTickLead = Math.min(0.010, dt * 0.5);

  for (let i = 0; i < _activeSchedules.length; i++) {
    const s = _activeSchedules[i];
    if (s.completed) continue;
    if (curAudio < s.tPress - 1e-9) continue;

    const handle = s.actionHandle;

    // Emit initial 'windup' section change on first active tick
    if (!s.windupEmitted) {
      s.windupEmitted = true;
      s.currentSection = 'windup';
      for (let k = 0; k < s.sectionListeners.length; k++) {
        s.sectionListeners[k]('windup', curAudio);
      }
    }

    // 1. Pre-impact windup phase (anticipation hold -> warped windup)
    if (!s.hitFired && curAudio < s.impactTime - halfTickLead) {
      const holdEnd = s.tPress + s.anticipationHoldSec;
      if (s.anticipationHoldSec > 0 && curAudio < holdEnd) {
        s.inAnticipationHold = true;
        s.currentSection = 'windup';
        if (handle) {
          handle.paused = false;
          handle.timeScale = 0.0;
          handle.time = s.windupSec.t0;
        }
      } else {
        s.inAnticipationHold = false;
        s.currentSection = 'windup';
        const windupElapsed = Math.max(0.0, curAudio - holdEnd);
        if (handle) {
          handle.paused = false;
          handle.timeScale = s.windupTimeScale;
          handle.time = Math.min(
            s.windupSec.t1,
            s.windupSec.t0 + windupElapsed * s.windupTimeScale
          );
        }
      }
      if (s.actor && s.actor.mixer && typeof s.actor.mixer.update === 'function') {
        s.actor.mixer.update(0);
      }
      continue;
    }

    // 2. Impact frame reached: fire 'hit' event at T
    if (!s.hitFired && curAudio >= s.impactTime - halfTickLead) {
      s.hitFired = true;
      s.inAnticipationHold = false;
      s.currentSection = 'impact';

      if (handle) {
        handle.time = s.windupSec.t1;
        handle.timeScale = 0.0;
        handle.paused = true;
      }
      if (s.actor && s.actor.mixer && typeof s.actor.mixer.update === 'function') {
        s.actor.mixer.update(0);
      }

      for (let k = 0; k < s.sectionListeners.length; k++) {
        s.sectionListeners[k]('impact', curAudio);
      }

      const offsetMs = Math.abs(curAudio - s.impactTime) * 1000.0;
      _beatWarpTelemetry.hitCount += 1;
      _beatWarpTelemetry.hitOffsetsMs.push(offsetMs);

      const hitPayload = {
        clipName: s.clipName,
        impactTime: s.impactTime,
        actualAudioTime: curAudio,
        subdivisionTime: s.subdivisionTime,
        offsetMs
      };
      for (let k = 0; k < s.hitListeners.length; k++) {
        s.hitListeners[k](hitPayload);
      }
    }

    // 3. Hit-stop pause window
    // If external hitStopRemainingSec > 0 is passed, keep mixer paused and adjust recovery start if extended
    const scheduledHitStopEnd = s.impactTime + s.hitStopSec;
    if (extHitStop > 0 || curAudio < scheduledHitStopEnd - 1e-9) {
      if (extHitStop > 0 && curAudio + extHitStop > scheduledHitStopEnd + 1e-6) {
        const newHitStopDur = (curAudio + extHitStop) - s.impactTime;
        s.hitStopSec = newHitStopDur;
        s.recPlan = _computeRecoveryPlan(s.impactTime, newHitStopDur, s.recoverySecDef, s.nextSubfn, s.chart);
        s.recoveryEndTime = s.recPlan.recoveryEndTime;
        s.recoveryTimeScale = s.recPlan.recoveryTimeScale;
        s.recoveryStretchRatio = s.recPlan.recoveryStretchRatio;
        s.recoveryHoldSec = s.recPlan.recoveryHoldSec;
        s.cancelReadyTime = s.recPlan.cancelReadyTime;
      }
      s.currentSection = 'impact';
      if (handle) {
        handle.paused = true;
        handle.timeScale = 0.0;
        handle.time = s.windupSec.t1;
      }
      continue;
    }

    // 4. Recovery section: stretch recovery to end on next subdivision after T + hitStopSec
    if (!s.recoveryEmitted) {
      s.recoveryEmitted = true;
      s.currentSection = 'recovery';
      for (let k = 0; k < s.sectionListeners.length; k++) {
        s.sectionListeners[k]('recovery', curAudio);
      }
    }

    const recElapsed = Math.max(0.0, curAudio - s.recPlan.tPostHitStop);
    const activeRecDur = s.recPlan.recoveryLen * s.recPlan.recoveryStretchRatio;

    if (recElapsed < activeRecDur) {
      s.inRecoveryHold = false;
      if (handle) {
        handle.paused = false;
        handle.timeScale = s.recoveryTimeScale;
        handle.time = Math.min(
          s.recPlan.recT1,
          s.recPlan.recT0 + recElapsed * s.recoveryTimeScale
        );
      }
    } else {
      s.inRecoveryHold = true;
      if (handle) {
        handle.paused = false;
        handle.timeScale = 0.0;
        handle.time = s.recPlan.recT1;
      }
    }

    if (s.actor && s.actor.mixer && typeof s.actor.mixer.update === 'function') {
      s.actor.mixer.update(0);
    }

    // 5. Recovery cancel window (`cancelFrom`) & buffered combo chaining
    if (!s.cancelWindowFired && curAudio >= s.cancelReadyTime - halfTickLead) {
      s.cancelWindowFired = true;
      for (let k = 0; k < s.cancelListeners.length; k++) {
        s.cancelListeners[k](curAudio);
      }

      const buffered = _bufferedInputsByActor.get(s.actor);
      if (buffered) {
        _bufferedInputsByActor.delete(s.actor);
        s.completed = true;
        s.currentSection = 'canceled';
        scheduleAction(s.actor, buffered.clipName, curAudio, {
          ...buffered.options,
          fromCancel: true,
          fadeInSec: 0.07
        });
        continue;
      }
    }

    // 6. Section completion on quantized subdivision boundary `recoveryEndTime`
    if (!s.completed && curAudio >= s.recoveryEndTime - halfTickLead) {
      s.completed = true;
      s.currentSection = 'complete';
      if (handle) {
        handle.time = s.recPlan.recT1;
        handle.timeScale = 1.0;
      }
      _beatWarpTelemetry.completedCount += 1;
      for (let k = 0; k < s.completeListeners.length; k++) {
        s.completeListeners[k](curAudio);
      }
    }
  }

  // Prune completed schedules when list grows large
  if (_activeSchedules.length > 64) {
    for (let i = _activeSchedules.length - 1; i >= 0; i--) {
      if (_activeSchedules[i].completed) {
        _activeSchedules.splice(i, 1);
      }
    }
  }
}

/**
 * Cancels every open schedule on `actor` (used when the actor is interrupted by a hit-react or a dodge),
 * and drops any buffered follow-up. Returns the number of schedules canceled.
 */
export function cancelActorSchedules(actor) {
  let canceled = 0;
  for (let i = 0; i < _activeSchedules.length; i++) {
    const s = _activeSchedules[i];
    if (!s.completed && s.actor === actor) {
      s.completed = true;
      s.currentSection = 'canceled';
      canceled += 1;
    }
  }
  if (actor && typeof actor === 'object') {
    _bufferedInputsByActor.delete(actor);
  }
  return canceled;
}

export function hasActiveScheduleFor(actor) {
  for (let i = 0; i < _activeSchedules.length; i++) {
    const s = _activeSchedules[i];
    if (!s.completed && s.actor === actor) return true;
  }
  return false;
}

export function getActiveSchedules() {
  return _activeSchedules.filter((s) => !s.completed);
}

export function clearActiveSchedules() {
  _activeSchedules.length = 0;
}

export function getBeatWarpTelemetry() {
  const offsets = _beatWarpTelemetry.hitOffsetsMs.slice().sort((a, b) => a - b);
  const n = offsets.length;
  const p50 = n > 0 ? offsets[Math.floor((n - 1) * 0.50)] : 0;
  const p95 = n > 0 ? offsets[Math.floor((n - 1) * 0.95)] : 0;
  const max = n > 0 ? offsets[n - 1] : 0;
  const within12Ms = offsets.filter((x) => x <= 12.0).length;
  return {
    scheduledCount: _beatWarpTelemetry.scheduledCount,
    hitCount: _beatWarpTelemetry.hitCount,
    completedCount: _beatWarpTelemetry.completedCount,
    stretchViolations: _beatWarpTelemetry.stretchViolations,
    within12MsCount: within12Ms,
    p50OffsetMs: Number(p50.toFixed(3)),
    p95OffsetMs: Number(p95.toFixed(3)),
    maxOffsetMs: Number(max.toFixed(3))
  };
}

export function resetBeatWarpTelemetry() {
  _beatWarpTelemetry.scheduledCount = 0;
  _beatWarpTelemetry.hitCount = 0;
  _beatWarpTelemetry.completedCount = 0;
  _beatWarpTelemetry.stretchViolations = 0;
  _beatWarpTelemetry.hitOffsetsMs.length = 0;
}
