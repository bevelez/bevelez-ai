/**
 * anim/rig-adapter.js
 * DJ KRONOS Phase 3 ("Dead as Disco") — Track A Character Rig & Animation Adapter
 *
 * Bridges skinned GLB characters (challenger.glb, kronos.glb, bruiser.glb) and
 * hierarchical fallback rigs to a unified Three.js r170 AnimationMixer + IK +
 * Root-Motion Warping interface matching CONTRACTS.md Section 3.
 *
 * Public contract:
 *   - rig.playClip(name, opts = { fadeInSec: 0.07, timeScale: 1.0, startTime: 0.0, loop: false })
 *   - rig.bone(name) -> THREE.Object3D | THREE.Bone
 *   - rig.update(dt)
 *   - loadCharacterRig(type, options)
 *   - wrapCharacterRig(rig, options)
 *   - upgradeRigToSkinnedGLB(rig, typeOrUrl, options)
 *   - warpRootTowardTarget(rig, targetPos, progress, maxLunge, stopDist)
 *   - solveTwoBoneIK(upperBone, lowerBone, endBone, targetWorldPos, poleWorldPos, opts)
 *   - createLegIKSolver(rig, options)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';

export const HUMANOID_BONE_NAMES = Object.freeze([
  'hips',
  'spine',
  'torso',
  'neck',
  'head',
  'leftShoulder',
  'leftArm',
  'leftElbow',
  'leftHand',
  'rightShoulder',
  'rightArm',
  'rightElbow',
  'rightHand',
  'leftLeg',
  'leftKnee',
  'leftAnkle',
  'rightLeg',
  'rightKnee',
  'rightAnkle'
]);

export const BONE_ALIASES = Object.freeze({
  headGroup: 'head',
  head: 'head',
  chest: 'torso',
  upperChest: 'torso',
  spine2: 'torso',
  spine1: 'spine',
  pelvis: 'hips',
  rootBone: 'hips',
  leftUpperArm: 'leftArm',
  leftForeArm: 'leftElbow',
  leftLowerArm: 'leftElbow',
  rightUpperArm: 'rightArm',
  rightForeArm: 'rightElbow',
  rightLowerArm: 'rightElbow',
  leftUpLeg: 'leftLeg',
  leftThigh: 'leftLeg',
  leftCalf: 'leftKnee',
  leftFoot: 'leftAnkle',
  rightUpLeg: 'rightLeg',
  rightThigh: 'rightLeg',
  rightCalf: 'rightKnee',
  rightFoot: 'rightAnkle',
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'spine',
  mixamorigSpine2: 'torso',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftArm',
  mixamorigLeftForeArm: 'leftElbow',
  mixamorigLeftHand: 'leftHand',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightArm',
  mixamorigRightForeArm: 'rightElbow',
  mixamorigRightHand: 'rightHand',
  mixamorigLeftUpLeg: 'leftLeg',
  mixamorigLeftLeg: 'leftKnee',
  mixamorigLeftFoot: 'leftAnkle',
  mixamorigRightUpLeg: 'rightLeg',
  mixamorigRightLeg: 'rightKnee',
  mixamorigRightFoot: 'rightAnkle'
});

export const CLIP_NAME_ALIASES = Object.freeze({
  idle: 'idle-dance',
  'idle_dance': 'idle-dance',
  'punch-jab': 'jab',
  'punch-cross': 'cross',
  'punch-uppercut': 'uppercut',
  'dodge-left': 'dodge-L',
  'dodge-right': 'dodge-R',
  'dodge': 'dodge-L',
  'hurt': 'hurt-light',
  'knockdown': 'KO-fall',
  'ko-fall': 'KO-fall',
  'ko': 'KO-fall',
  'getup': 'get-up',
  'counter': 'counter-riposte',
  'quick_hook': 'hook',
  'heavy_haymaker': 'haymaker',
  'double_tap': 'double-tap',
  'scratch_1': 'scratch-1',
  'scratch_2': 'scratch-2',
  'scratch_3': 'scratch-3',
  'bass_drop': 'bass-drop',
  'boss_idle': 'boss-idle'
});

export const DEFAULT_MODEL_URLS = Object.freeze({
  challenger: './assets/models/challenger.glb',
  kronos: './assets/models/kronos.glb',
  bruiser: './assets/models/bruiser.glb'
});

export const DEFAULT_CLIPS_MANIFEST_URL = './assets/models/clips.json';

let _sharedToonGradientMap = null;
const _gltfCache = new Map();
let _clipsManifestCache = null;
const _gltfLoader = new GLTFLoader();

/**
 * Shared 3-band procedural cel-shading gradient map matching models/shared.js:
 * Deep shadow (46) -> Lit midtone (158) -> Crisp highlight (255).
 */
export function getSharedToonGradientMap() {
  if (_sharedToonGradientMap) return _sharedToonGradientMap;
  const data = new Uint8Array([46, 158, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _sharedToonGradientMap = tex;
  return _sharedToonGradientMap;
}

/**
 * Attaches the Hi-Fi Rush / Dead as Disco 3-band cel ramp, rotated Ben-Day
 * halftone shadow dots, crevice AO, and cyan Fresnel rim highlight from
 * models/shared.js (createCelMaterial) to a MeshToonMaterial, while preserving
 * GPU skeletal skinning (#include <skinning_vertex> / <skinnormal_vertex>).
 */
export function attachKronosCelShader(mat, options = {}) {
  if (!mat) return mat;
  const glintIntensity = options.glintIntensity ?? 0.0;
  const glintThreshold = options.glintThreshold ?? 0.90;
  const creviceAO = options.creviceAO !== undefined ? Number(options.creviceAO) : 1.0;
  const rimIntensity = options.rimIntensity !== undefined ? Number(options.rimIntensity) : 0.45;

  mat.userData.celParams = {
    glintIntensity,
    glintThreshold,
    creviceAO,
    rimIntensity
  };

  mat.customProgramCacheKey = () =>
    `kronos_skinned_cel_v2_${glintIntensity}_${creviceAO}_${rimIntensity}_${mat.vertexColors ? 1 : 0}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlintIntensity = { value: glintIntensity };
    shader.uniforms.uGlintThreshold = { value: glintThreshold };
    shader.uniforms.uCreviceAO = { value: creviceAO };
    shader.uniforms.uRimIntensity = { value: rimIntensity };
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldPos;
      varying vec3 vKronosViewPos;
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vKronosViewPos = - mvPosition.xyz;
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      #ifdef USE_INSTANCING
        vWorldPos = (modelMatrix * instanceMatrix * vec4( transformed, 1.0 )).xyz;
      #else
        vWorldPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;
      #endif
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldPos;
      varying vec3 vKronosViewPos;
      uniform float uCreviceAO;
      uniform float uRimIntensity;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <gradientmap_pars_fragment>',
      `
      #ifdef USE_GRADIENTMAP
        uniform sampler2D gradientMap;
      #endif

      vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
        float halfLambert = clamp( dot( normal, lightDirection ) * 0.5 + 0.5, 0.0, 1.0 );

        float celFactor;
        if ( halfLambert < 0.34 ) {
          celFactor = 0.52;
        } else if ( halfLambert < 0.68 ) {
          celFactor = 0.82;
        } else {
          celFactor = 1.04;
        }

        vec2 rotCoord = vec2(
          gl_FragCoord.x * 0.70710678 - gl_FragCoord.y * 0.70710678,
          gl_FragCoord.x * 0.70710678 + gl_FragCoord.y * 0.70710678
        );
        vec2 cell = mod( rotCoord, 6.0 ) - vec2( 3.0 );
        float dotDist = length( cell );

        if ( halfLambert >= 0.28 && halfLambert <= 0.44 && dotDist < 1.45 ) {
          celFactor *= 0.86;
        }

        return vec3( celFactor );
      }
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_toon_pars_fragment>',
      `
      varying vec3 vViewPosition;

      uniform float uGlintIntensity;
      uniform float uGlintThreshold;

      struct ToonMaterial {
        vec3 diffuseColor;
      };

      void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
        vec3 liftedAlbedo = max( material.diffuseColor, vec3( 0.038, 0.044, 0.062 ) ) + material.diffuseColor * 0.25;
        vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
        reflectedLight.directDiffuse += irradiance * BRDF_Lambert( liftedAlbedo );

        if ( gl_FrontFacing && uGlintIntensity > 0.0 ) {
          vec3 viewDir = normalize( vKronosViewPos );
          vec3 halfDir = normalize( directLight.direction + viewDir );
          float NdotH = max( 0.0, dot( geometryNormal, halfDir ) );
          if ( NdotH > uGlintThreshold ) {
            vec3 glintTint = mix( vec3( 1.0 ), liftedAlbedo, 0.30 );
            reflectedLight.directDiffuse += directLight.color * glintTint * uGlintIntensity;
          }
        }
      }

      void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
        vec3 liftedAlbedo = max( material.diffuseColor, vec3( 0.038, 0.044, 0.062 ) ) + material.diffuseColor * 0.25;
        reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( liftedAlbedo );
      }

      #define RE_Direct RE_Direct_Toon
      #define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `
      #include <lights_fragment_end>

      if ( uCreviceAO > 0.0 ) {
        float creviceAO = clamp( smoothstep( -0.1, 1.15, vWorldPos.y ) * 0.25 + 0.75, 0.70, 1.0 );
        reflectedLight.directDiffuse *= creviceAO;
        reflectedLight.indirectDiffuse *= creviceAO;
      }

      if ( uRimIntensity > 0.0 ) {
        vec3 viewDir = normalize( vKronosViewPos );
        float rimDot = 1.0 - max( 0.0, dot( normal, viewDir ) );
        float rimFactor = smoothstep( 0.72, 0.90, rimDot );
        vec3 rimColor = vec3( 0.45, 0.85, 1.0 ) * ( uRimIntensity * 0.35 );
        reflectedLight.directDiffuse += rimColor * rimFactor * ( 0.25 + 0.75 * diffuseColor.rgb );
      }
      `
    );
  };

  mat.needsUpdate = true;
  return mat;
}

/**
 * Loads and caches assets/models/clips.json.
 */
export async function loadClipsManifest(url = DEFAULT_CLIPS_MANIFEST_URL) {
  if (_clipsManifestCache) return _clipsManifestCache;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[rig-adapter] Failed to load clips manifest from ${url}: ${res.status}`);
  }
  _clipsManifestCache = await res.json();
  return _clipsManifestCache;
}

/**
 * Converts loaded glTF materials on a SkinnedMesh / Mesh hierarchy to Kronos
 * 3-band MeshToonMaterial + Ben-Day halftone + Fresnel rim while preserving
 * vertex colors (COLOR_0), embedded baseColorTexture (UV atlas), skinning,
 * shadows, and DepthNormalPass outlines.
 */
export function applyKronosToonSkinning(root, options = {}) {
  if (!root || !root.traverse) return root;
  const gradientMap = options.gradientMap || getSharedToonGradientMap();
  const tintColor = options.tintColor ? new THREE.Color(options.tintColor) : null;

  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isSkinnedMesh) return;

    obj.castShadow = options.castShadow !== undefined ? Boolean(options.castShadow) : true;
    obj.receiveShadow = options.receiveShadow !== undefined ? Boolean(options.receiveShadow) : true;
    obj.frustumCulled = false;
    obj.layers.set(0);
    if (!obj.userData) obj.userData = {};
    obj.userData.noOutline = false;

    const hasVertexColors = Boolean(
      obj.geometry &&
      obj.geometry.attributes &&
      (obj.geometry.attributes.color || obj.geometry.attributes.color_0)
    );
    if (
      obj.geometry &&
      obj.geometry.attributes &&
      !obj.geometry.attributes.color &&
      obj.geometry.attributes.color_0
    ) {
      obj.geometry.setAttribute('color', obj.geometry.attributes.color_0);
    }

    const convertMat = (srcMat) => {
      if (!srcMat) {
        const fallbackMat = new THREE.MeshToonMaterial({
          color: 0xffffff,
          gradientMap,
          vertexColors: hasVertexColors
        });
        return attachKronosCelShader(fallbackMat, options);
      }
      if (srcMat.isMeshToonMaterial) {
        srcMat.gradientMap = gradientMap;
        srcMat.vertexColors = hasVertexColors;
        return attachKronosCelShader(srcMat, options);
      }
      const baseColor = srcMat.color ? srcMat.color.clone() : new THREE.Color(0xffffff);
      if (tintColor) baseColor.multiply(tintColor);
      if (srcMat.map) {
        srcMat.map.colorSpace = THREE.SRGBColorSpace;
        srcMat.map.anisotropy = 4;
        srcMat.map.needsUpdate = true;
      }
      const toonMat = new THREE.MeshToonMaterial({
        name: srcMat.name || 'kronos_skinned_toon',
        color: baseColor,
        map: srcMat.map || null,
        gradientMap,
        vertexColors: hasVertexColors,
        transparent: Boolean(srcMat.transparent),
        opacity: srcMat.opacity !== undefined ? srcMat.opacity : 1.0,
        side: srcMat.side !== undefined ? srcMat.side : THREE.FrontSide
      });
      if (srcMat.emissive && srcMat.emissive.getHex() !== 0x000000) {
        toonMat.emissive = srcMat.emissive.clone();
        toonMat.emissiveIntensity = srcMat.emissiveIntensity ?? 1.0;
      }
      return attachKronosCelShader(toonMat, options);
    };

    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map(convertMat);
    } else {
      obj.material = convertMat(obj.material);
    }
  });

  return root;
}

/**
 * Resolves a canonical or aliased bone name to its Object3D/Bone node on a rig.
 */
export function resolveRigBone(rig, name) {
  if (!rig || !name) return null;
  const canonical = BONE_ALIASES[name] || name;
  if (rig._boneMap && rig._boneMap.has(canonical)) {
    return rig._boneMap.get(canonical);
  }
  if (rig._boneMap && rig._boneMap.has(name)) {
    return rig._boneMap.get(name);
  }
  if (rig[canonical] && rig[canonical].isObject3D) {
    return rig[canonical];
  }
  if (rig[name] && rig[name].isObject3D) {
    return rig[name];
  }
  if (canonical === 'head' && rig.headGroup && rig.headGroup.isObject3D) {
    return rig.headGroup;
  }
  if (rig.root && rig.root.getObjectByName) {
    return rig.root.getObjectByName(canonical) || rig.root.getObjectByName(name) || null;
  }
  return null;
}

/**
 * Indexes all 19 humanoid bones on a rig (from SkinnedMesh skeleton or Object3D tree)
 * and exposes both direct properties (`rig.hips`, `rig.head`, `rig.headGroup`, etc.)
 * and `rig.bone(name)`.
 */
export function indexRigBones(rig, options = {}) {
  if (!rig) return rig;
  const preserveDirect = Boolean(options && options.preserveDirectJointProps);
  const boneMap = new Map();

  if (rig.root && rig.root.traverse) {
    rig.root.traverse((node) => {
      if (node.isSkinnedMesh && node.skeleton && Array.isArray(node.skeleton.bones)) {
        for (const b of node.skeleton.bones) {
          if (b && b.name) {
            const canonical = BONE_ALIASES[b.name] || b.name;
            boneMap.set(b.name, b);
            boneMap.set(canonical, b);
          }
        }
      }
      if (node.isBone && node.name) {
        const canonical = BONE_ALIASES[node.name] || node.name;
        boneMap.set(node.name, node);
        boneMap.set(canonical, node);
      }
    });
  }

  for (const bname of HUMANOID_BONE_NAMES) {
    if (!boneMap.has(bname)) {
      const existing = rig[bname] || (bname === 'head' ? rig.headGroup : null) || (rig.root && rig.root.getObjectByName(bname));
      if (existing && existing.isObject3D) {
        boneMap.set(bname, existing);
      }
    }
    const resolved = boneMap.get(bname);
    if (resolved) {
      if (!preserveDirect || !rig[bname]) {
        rig[bname] = resolved;
      }
      if (bname === 'head' && !rig.headGroup) {
        rig.headGroup = resolved;
      }
    }
  }

  if (rig.headGroup && !boneMap.has('head')) {
    boneMap.set('head', rig.headGroup);
    if (!preserveDirect || !rig.head) rig.head = rig.headGroup;
  }
  if (rig.head && !rig.headGroup) {
    rig.headGroup = rig.head;
  }

  // Ensure intermediate spine/neck/shoulder lookups degrade gracefully on legacy 14-group rigs
  if (!boneMap.has('spine') && boneMap.get('torso')) {
    boneMap.set('spine', boneMap.get('torso'));
    if (!rig.spine) rig.spine = boneMap.get('torso');
  }
  if (!boneMap.has('neck') && boneMap.get('head')) {
    boneMap.set('neck', boneMap.get('head'));
    if (!rig.neck) rig.neck = boneMap.get('head');
  }
  if (!boneMap.has('leftShoulder') && boneMap.get('leftArm')) {
    boneMap.set('leftShoulder', boneMap.get('leftArm'));
    if (!rig.leftShoulder) rig.leftShoulder = boneMap.get('leftArm');
  }
  if (!boneMap.has('rightShoulder') && boneMap.get('rightArm')) {
    boneMap.set('rightShoulder', boneMap.get('rightArm'));
    if (!rig.rightShoulder) rig.rightShoulder = boneMap.get('rightArm');
  }

  rig._boneMap = boneMap;
  rig.bone = (name) => resolveRigBone(rig, name);
  return rig;
}

/**
 * Retargets an AnimationClip onto a procedural hierarchical rig if `head` is named `headGroup`.
 */
function adaptClipForRig(clip, rig) {
  if (!clip || !rig) return clip;
  const hasHeadBone = Boolean(rig.root && rig.root.getObjectByName && rig.root.getObjectByName('head'));
  const hasHeadGroup = Boolean(rig.headGroup && (!rig.head || rig.head === rig.headGroup));
  if (hasHeadBone || !hasHeadGroup) return clip;

  const cloned = clip.clone();
  for (const track of cloned.tracks) {
    if (track.name.startsWith('head.')) {
      track.name = track.name.replace(/^head\./, 'headGroup.');
    }
  }
  return cloned;
}

/**
 * Attaches AnimationMixer, clip registry, `playClip(name, opts)`, `bone(name)`,
 * and `update(dt)` to any character rig (skinned GLB or procedural Group tree).
 */
export function wrapCharacterRig(rig, options = {}) {
  if (!rig) throw new Error('[rig-adapter] Cannot wrap null rig');
  if (!rig.root) {
    rig.root = new THREE.Group();
  }

  indexRigBones(rig, options);

  const mixerRoot = options.mixerRoot || rig._skinnedRoot || rig.root;
  if (!rig.mixer || rig.mixer.getRoot() !== mixerRoot) {
    rig.mixer = new THREE.AnimationMixer(mixerRoot);
  }

  if (!rig.clips) rig.clips = new Map();
  if (!rig.actions) rig.actions = new Map();
  if (!rig.clipMetadata) rig.clipMetadata = options.clipMetadata || (_clipsManifestCache && _clipsManifestCache.clips) || {};

  if (Array.isArray(options.animations)) {
    for (const rawClip of options.animations) {
      if (!rawClip || !rawClip.name) continue;
      const adapted = adaptClipForRig(rawClip, rig);
      rig.clips.set(adapted.name, adapted);
      const action = rig.mixer.clipAction(adapted);
      rig.actions.set(adapted.name, action);
    }
  }

  rig._activeAction = rig._activeAction || null;
  rig._activeClipName = rig._activeClipName || null;

  /**
   * Plays an authored AnimationClip by name with optional crossfade, timeScale,
   * startTime, and loop control.
   *
   * @param {string} name - Clip name from assets/models/clips.json (or alias)
   * @param {object} [opts]
   * @param {number} [opts.fadeInSec=0.07] - Crossfade duration in seconds
   * @param {number} [opts.timeScale=1.0] - Playback speed multiplier (BeatClock stretch)
   * @param {number} [opts.startTime=0.0] - Initial clip time in seconds
   * @param {boolean} [opts.loop] - Override default loop flag from clips.json
   * @returns {THREE.AnimationAction|null}
   */
  rig.playClip = function playClip(name, opts = {}) {
    if (!name) return null;
    const canonicalName = CLIP_NAME_ALIASES[name] || name;
    let action = rig.actions.get(canonicalName) || rig.actions.get(name);

    if (!action) {
      const clip = rig.clips.get(canonicalName) || rig.clips.get(name);
      if (clip && rig.mixer) {
        action = rig.mixer.clipAction(clip);
        rig.actions.set(canonicalName, action);
      }
    }
    if (!action) return null;

    const fadeInSec = opts.fadeInSec !== undefined ? Math.max(0, Number(opts.fadeInSec)) : 0.07;
    const timeScale = opts.timeScale !== undefined ? Number(opts.timeScale) : 1.0;
    const startTime = opts.startTime !== undefined ? Math.max(0, Number(opts.startTime)) : 0.0;
    const meta = (rig.clipMetadata && (rig.clipMetadata[canonicalName] || rig.clipMetadata[name])) || null;
    const shouldLoop = opts.loop !== undefined ? Boolean(opts.loop) : Boolean(meta && meta.loop);

    action.enabled = true;
    action.paused = false;
    action.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
    action.clampWhenFinished = !shouldLoop;
    action.setEffectiveWeight(1.0);
    action.setEffectiveTimeScale(timeScale);
    action.timeScale = timeScale;

    const prevAction = rig._activeAction;
    if (prevAction && prevAction !== action) {
      action.reset();
      action.time = startTime;
      action.play();
      // A finished LoopOnce action still holds its clamped pose with its weight, so crossfading
      // from it is what keeps hurt -> idle and strike -> idle continuous instead of a hard cut.
      if (fadeInSec > 1e-4 && prevAction.enabled && prevAction.getEffectiveWeight() > 1e-4) {
        prevAction.crossFadeTo(action, fadeInSec, false);
      } else {
        prevAction.stop();
      }
    } else {
      if (fadeInSec <= 1e-4 && rig.mixer) {
        rig.mixer.stopAllAction();
      }
      action.reset();
      action.time = startTime;
      if (fadeInSec > 1e-4 && (!prevAction || !prevAction.isRunning())) {
        action.fadeIn(fadeInSec);
      }
      action.play();
    }

    if (fadeInSec <= 1e-4 && rig.mixer) {
      rig.mixer.update(0);
    }

    rig._activeAction = action;
    rig._activeClipName = canonicalName;
    action.clipName = canonicalName;
    return action;
  };

  /**
   * Seeks a clip directly to an exact timestamp (in seconds) and evaluates the pose immediately.
   * Useful for deterministic frame inspection, contact-sheet rendering, and BeatClock scrubbing.
   */
  rig.sampleClipAt = function sampleClipAt(name, timeSec = 0.0) {
    if (!rig.mixer) return null;
    rig.mixer.stopAllAction();
    const canonicalName = CLIP_NAME_ALIASES[name] || name;
    let action = rig.actions.get(canonicalName) || rig.actions.get(name);
    if (!action) {
      const clip = rig.clips.get(canonicalName) || rig.clips.get(name);
      if (clip) {
        action = rig.mixer.clipAction(clip);
        rig.actions.set(canonicalName, action);
      }
    }
    if (!action) return null;
    action.reset();
    action.enabled = true;
    action.paused = false;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(1.0);
    action.setEffectiveTimeScale(1.0);
    action.timeScale = 1.0;
    action.time = 0.0;
    action.play();
    rig.mixer.update(Math.max(0, Number(timeSec) || 0));
    action.paused = true;
    rig._activeAction = action;
    rig._activeClipName = canonicalName;
    if (rig.root && rig.root.updateMatrixWorld) {
      rig.root.updateMatrixWorld(true);
    }
    return action;
  };

  /**
   * Returns true if an AnimationMixer clip is currently active and running.
   */
  rig.isClipPlaying = function isClipPlaying() {
    return Boolean(rig._activeAction && rig._activeAction.isRunning());
  };

  /**
   * Advances the AnimationMixer and optional leg IK solver.
   */
  rig.update = function updateRig(dt) {
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (rig.mixer) {
      rig.mixer.update(safeDt);
    }
    // Watchdog: a clip must always own the body. When every action has faded or finished
    // (weight < 0.05) the default idle fades in, so the rest pose is never shown.
    if (rig.clipDriven && rig._defaultIdleClip && rig.actions) {
      let w = 0;
      for (const a of rig.actions.values()) {
        if (a.enabled && (a.isRunning() || a.clampWhenFinished)) w += a.getEffectiveWeight();
      }
      if (w < 0.05) {
        rig._restPoseFrames = (rig._restPoseFrames || 0) + 1;
        rig.playClip(rig._defaultIdleClip, { loop: true, fadeInSec: 0.12 });
      }
    }
    if (rig.ikSolver && typeof rig.ikSolver.update === 'function' && rig.ikEnabled) {
      rig.ikSolver.update();
    }
  };

  return rig;
}

/**
 * Loads a raw GLTF asset from URL (with caching) and returns a cloned instance
 * via SkeletonUtils.clone so multiple Bruisers can share one network load.
 */
export async function loadGLBAsset(url) {
  if (!_gltfCache.has(url)) {
    const promise = new Promise((resolve, reject) => {
      _gltfLoader.load(url, resolve, undefined, reject);
    });
    _gltfCache.set(url, promise);
  }
  const gltf = await _gltfCache.get(url);
  const clonedScene = SkeletonUtils.clone(gltf.scene);
  const animations = (gltf.animations || []).map((clip) => clip.clone());
  return { scene: clonedScene, animations, rawGltf: gltf };
}

/**
 * Loads a complete skinned character rig ('challenger' | 'kronos' | 'bruiser' or GLB URL)
 * with 4-band Toon shading, 19-bone lookup, and all 29 AnimationClips registered.
 */
export async function loadCharacterRig(typeOrUrl = 'challenger', options = {}) {
  const url = DEFAULT_MODEL_URLS[typeOrUrl] || typeOrUrl;
  const [{ scene: modelRoot, animations }, manifest] = await Promise.all([
    loadGLBAsset(url),
    options.loadManifest !== false ? loadClipsManifest(options.manifestUrl).catch(() => null) : Promise.resolve(null)
  ]);

  applyKronosToonSkinning(modelRoot, options);

  const root = new THREE.Group();
  root.name = `${typeOrUrl}_rig_root`;
  root.add(modelRoot);

  const rig = {
    type: typeOrUrl,
    isSkinnedGLB: true,
    root,
    _skinnedRoot: modelRoot,
    skinnedMesh: null,
    skeleton: null
  };

  modelRoot.traverse((node) => {
    if (node.isSkinnedMesh && !rig.skinnedMesh) {
      rig.skinnedMesh = node;
      rig.skeleton = node.skeleton;
    }
  });

  wrapCharacterRig(rig, {
    mixerRoot: modelRoot,
    animations,
    clipMetadata: (manifest && manifest.clips) || {}
  });

  if (options.enableLegIK) {
    rig.ikSolver = createLegIKSolver(rig, options.legIKOptions);
  }

  return rig;
}

/**
 * Hot-upgrades an existing procedural rig (e.g. from buildChallengerModel,
 * buildKronosBossModel, or buildBruiserModel) in-place with its authored skinned GLB
 * mesh and 29 AnimationClips, while preserving attachments like contactShadowDecal,
 * overhead badge, and telegraph rings.
 */
export async function upgradeRigToSkinnedGLB(existingRig, typeOrUrl = 'challenger', options = {}) {
  if (!existingRig || !existingRig.root) {
    return loadCharacterRig(typeOrUrl, options);
  }
  const url = DEFAULT_MODEL_URLS[typeOrUrl] || typeOrUrl;
  const [{ scene: modelRoot, animations }, manifest] = await Promise.all([
    loadGLBAsset(url),
    options.loadManifest !== false ? loadClipsManifest(options.manifestUrl).catch(() => null) : Promise.resolve(null)
  ]);

  applyKronosToonSkinning(modelRoot, options);

  // Hide legacy procedural body meshes under existingRig.hips while keeping non-body attachments
  if (existingRig.hips && existingRig.hips.parent === existingRig.root) {
    existingRig.hips.visible = false;
  }

  existingRig.root.add(modelRoot);
  existingRig.isSkinnedGLB = true;
  existingRig._skinnedRoot = modelRoot;

  modelRoot.traverse((node) => {
    if (node.isSkinnedMesh && !existingRig.skinnedMesh) {
      existingRig.skinnedMesh = node;
      existingRig.skeleton = node.skeleton;
    }
  });

  wrapCharacterRig(existingRig, {
    mixerRoot: modelRoot,
    animations,
    clipMetadata: (manifest && manifest.clips) || {},
    preserveDirectJointProps: true
  });

  const defaultIdleClip = typeOrUrl === 'kronos' ? 'boss-idle' : 'idle-dance';
  existingRig._defaultIdleClip = defaultIdleClip;
  if (existingRig.mixer && !existingRig._hasFinishedListener) {
    existingRig._hasFinishedListener = true;
    existingRig.mixer.addEventListener('finished', (e) => {
      const finishedName = e && e.action && e.action.clipName;
      if (finishedName && finishedName !== 'KO-fall' && existingRig.playClip) {
        existingRig.playClip(existingRig._defaultIdleClip || 'idle-dance', {
          fadeInSec: 0.08,
          loop: true
        });
      }
    });
  }
  if (existingRig.playClip) {
    existingRig.playClip(defaultIdleClip, { fadeInSec: 0, loop: true });
  }

  return existingRig;
}

/**
 * Analytic 2-Bone Law-of-Cosines IK Solver for foot planting & limb targeting.
 * Works on both `THREE.Bone` chains (`leftLeg -> leftKnee -> leftAnkle`) and
 * hierarchical `THREE.Group` chains without mutating bone scale.
 */
const _ikPosA = new THREE.Vector3();
const _ikPosB = new THREE.Vector3();
const _ikPosC = new THREE.Vector3();
const _ikTargetLocal = new THREE.Vector3();

export function solveTwoBoneIK(
  upperBone,
  lowerBone,
  endBone,
  targetWorldPos,
  poleWorldPos = null,
  options = {}
) {
  if (!upperBone || !lowerBone || !endBone || !targetWorldPos) return false;

  upperBone.updateWorldMatrix(true, false);
  lowerBone.updateWorldMatrix(true, false);
  endBone.updateWorldMatrix(true, false);

  upperBone.getWorldPosition(_ikPosA);
  lowerBone.getWorldPosition(_ikPosB);
  endBone.getWorldPosition(_ikPosC);

  const lenUpper = Math.max(1e-4, _ikPosA.distanceTo(_ikPosB));
  const lenLower = Math.max(1e-4, _ikPosB.distanceTo(_ikPosC));
  const maxReach = (lenUpper + lenLower) * 0.995;
  const minReach = Math.max(0.02, Math.abs(lenUpper - lenLower) * 1.02);

  const dist = THREE.MathUtils.clamp(_ikPosA.distanceTo(targetWorldPos), minReach, maxReach);

  // Law of cosines for interior knee angle
  const cosKneeInterior = THREE.MathUtils.clamp(
    (lenUpper * lenUpper + lenLower * lenLower - dist * dist) / (2 * lenUpper * lenLower),
    -1.0,
    1.0
  );
  const kneeBendAngle = Math.PI - Math.acos(cosKneeInterior);

  const facingSign = options.facingSign !== undefined ? Math.sign(options.facingSign) || -1 : -1;
  // Challenger (facingSign = -1) bends knee with negative X; Kronos/Bruiser (+1) bends knee with positive X
  const signedKneeX = facingSign < 0 ? -kneeBendAngle : kneeBendAngle;
  lowerBone.rotation.x = THREE.MathUtils.clamp(
    signedKneeX,
    facingSign < 0 ? -1.65 : 0.0,
    facingSign < 0 ? 0.0 : 1.65
  );

  // Pitch upper leg toward target
  if (upperBone.parent) {
    _ikTargetLocal.copy(targetWorldPos);
    upperBone.parent.worldToLocal(_ikTargetLocal);
    const localPos = upperBone.position;
    const dy = _ikTargetLocal.y - localPos.y;
    const dz = _ikTargetLocal.z - localPos.z;
    const cosHipOffset = THREE.MathUtils.clamp(
      (lenUpper * lenUpper + dist * dist - lenLower * lenLower) / (2 * lenUpper * dist),
      -1.0,
      1.0
    );
    const hipInterior = Math.acos(cosHipOffset);
    const targetPitch = Math.atan2(facingSign < 0 ? -dz : dz, -dy);
    upperBone.rotation.x = THREE.MathUtils.clamp(targetPitch + hipInterior, -1.35, 1.65);
  }

  upperBone.updateMatrixWorld(true);
  return true;
}

/**
 * Creates a lightweight 2-bone foot-pinning IK controller for a character rig
 * (compatible with both CCDIKSolver when IK effector bones exist and analytic 2-bone leg IK).
 */
export function createLegIKSolver(rig, options = {}) {
  const facingSign = options.facingSign !== undefined ? options.facingSign : -1;
  const groundY = options.groundY !== undefined ? options.groundY : 0.06;
  const leftTarget = new THREE.Vector3();
  const rightTarget = new THREE.Vector3();

  let ccdSolver = null;
  if (rig && rig.skinnedMesh && Array.isArray(options.iks) && options.iks.length > 0) {
    ccdSolver = new CCDIKSolver(rig.skinnedMesh, options.iks);
  }

  return {
    leftTarget,
    rightTarget,
    pinLeftFoot: false,
    pinRightFoot: false,
    ccdSolver,
    update() {
      if (ccdSolver) {
        ccdSolver.update();
      }
      if (this.pinLeftFoot) {
        leftTarget.y = Math.max(groundY, leftTarget.y);
        solveTwoBoneIK(
          rig.bone('leftLeg'),
          rig.bone('leftKnee'),
          rig.bone('leftAnkle'),
          leftTarget,
          null,
          { facingSign }
        );
      }
      if (this.pinRightFoot) {
        rightTarget.y = Math.max(groundY, rightTarget.y);
        solveTwoBoneIK(
          rig.bone('rightLeg'),
          rig.bone('rightKnee'),
          rig.bone('rightAnkle'),
          rightTarget,
          null,
          { facingSign }
        );
      }
    }
  };
}

/**
 * Root-motion lunge warping helper (`warpRootTowardTarget`):
 * Smoothly translates `rig.root.position` toward `targetPos` over normalized
 * `progress` in [0, 1] while clamping maximum lunge distance (`maxLunge`) and
 * respecting minimum combat separation (`stopDist`).
 */
const _warpDelta = new THREE.Vector3();
const _warpDir = new THREE.Vector3();

export function warpRootTowardTarget(
  rig,
  targetPos,
  progress,
  maxLunge = 1.85,
  stopDist = 0.72,
  originPos = null
) {
  if (!rig || !rig.root || !rig.root.position || !targetPos) return false;
  const rootPos = rig.root.position;
  const startPos = originPos || rootPos;

  _warpDelta.subVectors(targetPos, startPos);
  _warpDelta.y = 0;
  const totalDist = _warpDelta.length();
  if (totalDist <= stopDist + 1e-4) return false;

  _warpDir.copy(_warpDelta).divideScalar(totalDist);
  const desiredTravel = Math.min(maxLunge, Math.max(0, totalDist - stopDist));
  const clampedProgress = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
  // Smooth cubic ease-out lunge curve
  const eased = 1.0 - Math.pow(1.0 - clampedProgress, 3);

  if (originPos) {
    rootPos.x = startPos.x + _warpDir.x * desiredTravel * eased;
    rootPos.z = startPos.z + _warpDir.z * desiredTravel * eased;
  } else {
    const step = desiredTravel * eased;
    rootPos.x += _warpDir.x * step;
    rootPos.z += _warpDir.z * step;
  }

  return true;
}
