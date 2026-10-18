/**
 * anim/skinned-body.js
 * Binds a generated, textured skinned body (assets/models/<type>-skinned.glb, built by the
 * Blender fit/projection pipeline from the Nano Banana turnarounds) onto a hand-built DJ KRONOS
 * rig so that the rig's joint Groups become the skeleton.
 *
 * Why not swap the rig for the GLB's own skeleton: the game drives the hand-built joints directly
 * (ContinuousPoseBlender, knockback physics on hips, telegraph poses) and the authored clips are
 * already bound to those Groups by name. Making the Groups the skin's bones keeps every existing
 * motion path working and only replaces what is rendered.
 *
 * Requirements the Blender exporter (scratchpad fit_rig.py) guarantees: bone names equal the clip
 * joint names (hips, spine, torso, neck, head, left/rightShoulder/Arm/Elbow/Hand, left/rightLeg/
 * Knee/Ankle), identity rest rotations, the same parent chain as the clip skeleton, hips at the
 * fighter's game hips height with zero depth offset.
 */
import * as THREE from 'three';

const HEAD_ALIAS = { head: 'headGroup' };

function rigKeyFor(boneName) {
  return HEAD_ALIAS[boneName] || boneName;
}

/**
 * @param {Object} rig - hand-built rig prepared by conformRigToClipSkeleton (root, hips, ... Groups)
 * @param {THREE.Object3D} gltfScene - loaded + toon-converted scene of the skinned GLB
 * @param {Object} [options]
 * @param {boolean} [options.hideHandBuilt=true] - hide the procedural body meshes under rig.hips
 * @returns {{ skinnedMesh: THREE.SkinnedMesh, moved: Object<string, number>, maxMoveM: number }}
 */
export function bindSkinnedBodyToRig(rig, gltfScene, options = {}) {
  if (!rig || !rig.root) throw new Error('[skinned-body] rig has no root');
  let skinnedMesh = null;
  gltfScene.updateMatrixWorld(true);
  gltfScene.traverse((n) => { if (n.isSkinnedMesh && !skinnedMesh) skinnedMesh = n; });
  if (!skinnedMesh) throw new Error('[skinned-body] GLB has no SkinnedMesh');
  const glbBones = skinnedMesh.skeleton.bones;

  // 1. Lay the rig's joints out exactly like the GLB rest pose (identity rotation, GLB offsets).
  const groups = [];
  const moved = {};
  let maxMoveM = 0;
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  for (const bone of glbBones) {
    const key = rigKeyFor(bone.name);
    const group = rig[key];
    if (!group || !group.isObject3D) throw new Error(`[skinned-body] rig lacks joint "${key}" for bone "${bone.name}"`);
    const boneParentKey = bone.parent && bone.parent.isBone ? rigKeyFor(bone.parent.name) : null;
    if (boneParentKey && group.parent !== rig[boneParentKey]) {
      throw new Error(`[skinned-body] hierarchy mismatch: ${key} is under ${group.parent && group.parent.name}, GLB expects ${boneParentKey}`);
    }
    tmpA.copy(group.position);
    group.position.copy(bone.position);
    group.quaternion.identity();
    group.scale.set(1, 1, 1);
    const d = tmpB.subVectors(group.position, tmpA).length();
    moved[key] = Number(d.toFixed(3));
    if (d > maxMoveM) maxMoveM = d;
    groups.push(group);
  }

  // 2. Reparent the skinned mesh under the rig root; its geometry is already in rig-root space
  //    (the exporter bakes the armature transform, hips sit at the game height).
  skinnedMesh.removeFromParent();
  skinnedMesh.position.set(0, 0, 0);
  skinnedMesh.quaternion.identity();
  skinnedMesh.scale.set(1, 1, 1);
  skinnedMesh.frustumCulled = false;
  rig.root.add(skinnedMesh);
  rig.root.updateMatrixWorld(true);

  // 3. New skeleton whose bones are the rig Groups; inverses come from the current (rest) pose.
  const skeleton = new THREE.Skeleton(groups);
  skinnedMesh.bind(skeleton);

  // 4. Hide the procedural body but keep non-mesh attachments (shadow decals, rings live elsewhere).
  if (options.hideHandBuilt !== false && rig.hips) {
    rig.hips.traverse((n) => {
      if (n.isMesh && n !== skinnedMesh) {
        n.visible = false;
        n.userData.handBuiltHidden = true;
      }
    });
  }

  rig.skinnedBody = skinnedMesh;
  rig.skinnedBodySkeleton = skeleton;
  rig.isSkinnedBody = true;
  return { skinnedMesh, moved, maxMoveM: Number(maxMoveM.toFixed(3)) };
}

/**
 * Restores the hand-built body (debug / fallback): shows the procedural meshes and removes the
 * skinned body from the rig root. Joint offsets stay where the skinned layout put them.
 */
export function unbindSkinnedBody(rig) {
  if (!rig || !rig.skinnedBody) return false;
  rig.skinnedBody.removeFromParent();
  if (rig.hips) {
    rig.hips.traverse((n) => {
      if (n.isMesh && n.userData && n.userData.handBuiltHidden) {
        n.visible = true;
        delete n.userData.handBuiltHidden;
      }
    });
  }
  rig.skinnedBody = null;
  rig.skinnedBodySkeleton = null;
  rig.isSkinnedBody = false;
  return true;
}
