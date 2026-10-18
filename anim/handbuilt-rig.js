/**
 * anim/handbuilt-rig.js
 * Makes a hand-built DJ KRONOS rig (models/challenger.js, models/bruiser.js, models/kronos.js)
 * drivable by the authored AnimationClips in assets/models/kronos-clips-*.glb.
 *
 * The clips were authored on a 19-bone skeleton whose rest pose is identity rotation at the
 * same joint positions as the hand-built Group rigs (hips 1.07, torso +0.04, shoulder ±0.215/0.43,
 * elbow -0.26, hand -0.275, hip joint ±0.105/-0.05, knee -0.38, ankle -0.42). The hand-built rigs
 * only lack four intermediate pivots (spine, neck, leftShoulder, rightShoulder) and have unnamed
 * nodes. This module names the nodes and inserts the pivots without moving any mesh in world space,
 * so a THREE.AnimationMixer bound to rig.root resolves every clip track by name.
 */
import * as THREE from 'three';

export const CHALLENGER_CLIP_PIVOTS = Object.freeze([
  { name: 'spine', parent: 'hips', child: 'torso', position: [0, 0.02, 0] },
  { name: 'neck', parent: 'torso', child: 'headGroup', position: [0, 0.49, 0.002] },
  { name: 'leftShoulder', parent: 'torso', child: 'leftArm', position: [-0.12, 0.43, 0.005] },
  { name: 'rightShoulder', parent: 'torso', child: 'rightArm', position: [0.12, 0.43, 0.005] }
]);

const NAMED_JOINTS = Object.freeze([
  'hips', 'torso', 'headGroup',
  'leftArm', 'leftElbow', 'leftHand',
  'rightArm', 'rightElbow', 'rightHand',
  'leftLeg', 'leftKnee', 'leftAnkle',
  'rightLeg', 'rightKnee', 'rightAnkle'
]);

/**
 * Names the rig's joint Groups after their rig keys and inserts the missing pivots.
 * Idempotent. Returns a report of what was inserted so the caller can log or assert it.
 *
 * @param {Object} rig - A hand-built rig object ({ root, hips, torso, headGroup, leftArm, ... })
 * @param {Array} [pivots=CHALLENGER_CLIP_PIVOTS]
 * @returns {{ named: string[], inserted: string[], skipped: string[] }}
 */
export function prepareHandBuiltRigForClips(rig, pivots = CHALLENGER_CLIP_PIVOTS) {
  const report = { named: [], inserted: [], skipped: [] };
  if (!rig || !rig.root) return report;
  if (rig._clipPivotsReady) return rig._clipPivotsReport || report;

  for (const key of NAMED_JOINTS) {
    const node = rig[key];
    if (node && node.isObject3D) {
      node.name = key;
      report.named.push(key);
    }
  }

  for (const spec of pivots) {
    const parent = rig[spec.parent];
    const child = rig[spec.child];
    if (!parent || !child || !parent.isObject3D || !child.isObject3D) {
      report.skipped.push(`${spec.name}: missing ${!parent ? spec.parent : spec.child}`);
      continue;
    }
    if (rig[spec.name] && rig[spec.name].isObject3D) {
      report.skipped.push(`${spec.name}: already present`);
      continue;
    }
    if (child.parent !== parent) {
      report.skipped.push(`${spec.name}: ${spec.child} is not a direct child of ${spec.parent}`);
      continue;
    }
    const pivot = new THREE.Group();
    pivot.name = spec.name;
    pivot.position.set(spec.position[0], spec.position[1], spec.position[2]);
    // Preserve the child's world placement: child.local := child.local - pivot.local
    child.position.sub(pivot.position);
    parent.remove(child);
    parent.add(pivot);
    pivot.add(child);
    rig[spec.name] = pivot;
    report.inserted.push(spec.name);
  }

  rig.root.updateMatrixWorld(true);
  rig._clipPivotsReady = true;
  rig._clipPivotsReport = report;
  return report;
}

const HUMANOID_NAMES = Object.freeze([
  'hips', 'spine', 'torso', 'neck', 'head',
  'leftShoulder', 'leftArm', 'leftElbow', 'leftHand',
  'rightShoulder', 'rightArm', 'rightElbow', 'rightHand',
  'leftLeg', 'leftKnee', 'leftAnkle', 'rightLeg', 'rightKnee', 'rightAnkle'
]);

function canonicalRigKey(name) {
  return name === 'head' ? 'headGroup' : name;
}

/**
 * Conforms any hand-built rig to the hierarchy of a clip skeleton (the node tree of an
 * animation-only GLB): names the joints, inserts the pivots the rig lacks at the skeleton's
 * local offsets, and re-parents existing joints under them. Joint world positions must already
 * match the skeleton (they do for all three Kronos fighters); the report's `maxDeviationM` says
 * how far any joint moved, so a mismatch is visible instead of silent.
 *
 * @param {Object} rig - hand-built rig ({ root, hips, torso, headGroup, leftArm, ... })
 * @param {THREE.Object3D} skeletonRoot - scene of the animation-only GLB
 */
export function conformRigToClipSkeleton(rig, skeletonRoot) {
  const report = { named: [], inserted: [], reparented: [], skipped: [], maxDeviationM: 0 };
  if (!rig || !rig.root || !skeletonRoot) return report;
  if (rig._clipPivotsReady) return rig._clipPivotsReport || report;

  for (const key of NAMED_JOINTS) {
    const node = rig[key];
    if (node && node.isObject3D) {
      node.name = key;
      report.named.push(key);
    }
  }
  const before = sampleRigJointWorldPositions(rig);

  const glbByName = new Map();
  skeletonRoot.traverse((n) => { if (n.name && HUMANOID_NAMES.includes(n.name)) glbByName.set(n.name, n); });

  // Parent-first order: traverse visits parents before children.
  skeletonRoot.traverse((node) => {
    if (!glbByName.has(node.name) || node.name === 'hips') return;
    const key = canonicalRigKey(node.name);
    const glbParent = node.parent;
    if (!glbParent || !glbByName.has(glbParent.name)) return;
    const parentRig = rig[canonicalRigKey(glbParent.name)];
    if (!parentRig || !parentRig.isObject3D) {
      report.skipped.push(`${key}: parent ${glbParent.name} missing`);
      return;
    }
    let rigNode = rig[key];
    if (!rigNode || !rigNode.isObject3D) {
      rigNode = new THREE.Group();
      rigNode.name = key;
      rigNode.position.copy(node.position);
      parentRig.add(rigNode);
      rig[key] = rigNode;
      report.inserted.push(key);
    } else if (rigNode.parent !== parentRig) {
      if (rigNode.parent) rigNode.parent.remove(rigNode);
      parentRig.add(rigNode);
      rigNode.position.copy(node.position);
      report.reparented.push(key);
    }
  });

  rig.root.updateMatrixWorld(true);
  const after = sampleRigJointWorldPositions(rig);
  for (const k of Object.keys(before)) {
    if (!after[k]) continue;
    const d = Math.hypot(after[k][0] - before[k][0], after[k][1] - before[k][1], after[k][2] - before[k][2]);
    if (d > report.maxDeviationM) report.maxDeviationM = Number(d.toFixed(4));
  }
  rig._clipPivotsReady = true;
  rig._clipPivotsReport = report;
  return report;
}

/**
 * Removes root-translation tracks from clips so game-side physics (launch, knockback, slide)
 * keeps control of the hips, except for the clips listed in `keepFor` (idle dances).
 */
export function stripHipsTranslation(animations, keepFor = ['idle-dance', 'boss-idle']) {
  const out = [];
  for (const clip of animations || []) {
    if (!clip || keepFor.includes(clip.name)) { out.push(clip); continue; }
    const c = clip.clone();
    c.tracks = c.tracks.filter((t) => !/(^|\.)hips\.position$/.test(t.name));
    out.push(c);
  }
  return out;
}

/**
 * Returns the world-space position of each named joint, for parity checks against a clip skeleton.
 */
export function sampleRigJointWorldPositions(rig) {
  const out = {};
  if (!rig || !rig.root) return out;
  rig.root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  for (const key of [...NAMED_JOINTS, 'spine', 'neck', 'leftShoulder', 'rightShoulder']) {
    const node = rig[key];
    if (node && node.isObject3D) {
      node.getWorldPosition(v);
      out[key] = [Number(v.x.toFixed(3)), Number(v.y.toFixed(3)), Number(v.z.toFixed(3))];
    }
  }
  return out;
}
