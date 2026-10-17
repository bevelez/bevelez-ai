/**
 * kronos-postprocessing.js
 * Multi-Pass WebGL Post-Processing Pipeline for DJ KRONOS — Boombox Battle
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';

export function tagSceneLayers(root) {
  if (!root || !root.traverse) return;
  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isSprite && !obj.isPoints && !obj.isLine) return;

    const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);

    const isOutline = Boolean(
      (obj.name && obj.name.toLowerCase().includes('outline')) ||
      mats.some((m) => m && (m.side === THREE.BackSide || (m.name && m.name.toLowerCase().includes('outline'))))
    );

    const isDecalOrFx = Boolean(
      (obj.name && (
        obj.name.toLowerCase().includes('shadow') ||
        obj.name.toLowerCase().includes('decal') ||
        obj.name.toLowerCase().includes('smear') ||
        obj.name.toLowerCase().includes('burst') ||
        obj.name.toLowerCase().includes('particle')
      )) ||
      mats.some((m) => m && m.depthWrite === false)
    );

    const isTransparentVolume = Boolean(
      mats.some((m) => m && m.transparent === true && m.opacity < 0.99)
    );

    if (isOutline || isDecalOrFx || isTransparentVolume || obj.isInstancedMesh) {
      obj.layers.set(1);
    } else {
      obj.layers.set(0);
    }
  });
}

const _prevClearColor = new THREE.Color();

export class DepthNormalPass extends Pass {
  constructor(scene, camera, target, normalMaterial) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = target;
    this.normalMaterial = normalMaterial;
    this.enabled = true;
    this.needsSwap = false;
    this.clear = false;
    this.frameCount = 0;
  }

  setSize(width, height) {
    if (this.target && this.target.setSize) {
      this.target.setSize(width, height);
    }
  }

  render(renderer, writeBuffer, readBuffer) {
    if (!this.enabled || !this.scene || !this.camera) return;

    if (this.frameCount % 120 === 0) {
      tagSceneLayers(this.scene);
    }
    this.frameCount++;

    const prevRenderTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevOverrideMat = this.scene.overrideMaterial;
    const prevCameraMask = this.camera.layers.mask;
    renderer.getClearColor(_prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha();

    this.camera.layers.set(0);
    this.scene.overrideMaterial = this.normalMaterial;

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x7f7f7f, 1.0);
    renderer.clear(true, true, true);
    renderer.render(this.scene, this.camera);

    this.scene.overrideMaterial = prevOverrideMat;
    this.camera.layers.mask = prevCameraMask;
    renderer.setClearColor(_prevClearColor, prevClearAlpha);
    renderer.setRenderTarget(prevRenderTarget);
    renderer.autoClear = prevAutoClear;
  }
}

export const StylizedCompositeShader = {
  name: 'StylizedCompositeShader',
  uniforms: {
    tDiffuse: { value: null },
    tNormal: { value: null },
    tDepth: { value: null },

    uResolution: { value: new THREE.Vector2(1440, 900) },
    resolution: { value: new THREE.Vector2(1440, 900) },
    uCameraNear: { value: 0.05 },
    cameraNear: { value: 0.05 },
    uCameraFar: { value: 140.0 },
    cameraFar: { value: 140.0 },
    uTime: { value: 0.0 },
    uUseDepthNormal: { value: 1.0 },

    uDepthThreshold: { value: 0.012 },
    creviceThreshold: { value: 0.012 },
    uNormalThreshold: { value: 0.35 },
    uEdgeThreshold: { value: 0.35 },
    uEdgeWidth: { value: 1.0 },
    silhouetteWidth: { value: 1.0 },
    uInkStrength: { value: 0.80 },
    uInkColor: { value: new THREE.Color(0x0a0c14) },

    uAoIntensity: { value: 0.48 },
    uOcclusionIntensity: { value: 0.48 },
    uAoRadius: { value: 3.5 },
    uOcclusionRadius: { value: 0.025 },
    uAoMaxDistance: { value: 1.5 },
    uAoBias: { value: 0.025 },

    uContrast: { value: 0.22 },
    uSplitToneStrength: { value: 0.70 },
    uHalftoneIntensity: { value: 0.65 },
    uBenDayScale: { value: 6.0 },
    uVignetteRadius: { value: 0.85 },
    uVignetteDarkness: { value: 0.35 },

    uChromaticAberration: { value: 0.0 },
    uShockwavePulse: { value: 0.0 },
    uShockwaveRadius: { value: 0.0 },
    uShockwaveCenter: { value: new THREE.Vector2(0.5, 0.5) }
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;
    precision highp sampler2D;

    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;

    uniform vec2 uResolution;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform float uTime;
    uniform float uUseDepthNormal;

    uniform float uDepthThreshold;
    uniform float uNormalThreshold;
    uniform float uEdgeWidth;
    uniform float uInkStrength;
    uniform vec3 uInkColor;

    uniform float uAoIntensity;
    uniform float uAoRadius;
    uniform float uAoMaxDistance;
    uniform float uAoBias;

    uniform float uContrast;
    uniform float uSplitToneStrength;
    uniform float uHalftoneIntensity;
    uniform float uBenDayScale;
    uniform float uVignetteRadius;
    uniform float uVignetteDarkness;

    uniform float uChromaticAberration;
    uniform float uShockwavePulse;
    uniform float uShockwaveRadius;
    uniform vec2 uShockwaveCenter;

    varying vec2 vUv;

    float getLinearDepth(vec2 uv) {
      float d = texture2D(tDepth, uv).r;
      return (uCameraNear * uCameraFar) / (uCameraFar - d * (uCameraFar - uCameraNear));
    }

    vec3 getNormal(vec2 uv) {
      return texture2D(tNormal, uv).rgb * 2.0 - 1.0;
    }

    vec2 getShockwaveUV(vec2 uv) {
      if (uShockwavePulse <= 0.0001) return uv;
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 dir = (uv - uShockwaveCenter) * aspect;
      float dist = length(dir);
      float wave = exp(-pow((dist - uShockwaveRadius) * 22.0, 2.0));
      float len = length(dir);
      vec2 dispDir = len > 0.0001 ? (dir / len) : vec2(0.0);
      float amplitude = wave * uShockwavePulse * (1.0 - smoothstep(0.20, 0.90, uShockwaveRadius));
      return uv - (dispDir / aspect) * amplitude;
    }

    vec4 sampleColorAberration(vec2 uv) {
      if (uChromaticAberration <= 0.0005) {
        return texture2D(tDiffuse, uv);
      }
      vec2 dir = uv - vec2(0.5);
      float distSq = dot(dir, dir);
      vec2 offset = dir * distSq * uChromaticAberration;

      float r = texture2D(tDiffuse, uv - offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + offset).b;
      float a = texture2D(tDiffuse, uv).a;
      return vec4(r, g, b, a);
    }

    void main() {
      vec2 uv = getShockwaveUV(vUv);
      vec4 baseTex = sampleColorAberration(uv);
      vec3 color = baseTex.rgb;

      if (uUseDepthNormal > 0.5) {
        vec2 texel = (1.0 / uResolution) * uEdgeWidth;
        float zCenter = getLinearDepth(uv);
        vec3 nCenter = getNormal(uv);
        bool isSky = (zCenter > uCameraFar - 2.0);

        if (!isSky) {
          float d00 = getLinearDepth(uv + vec2(-texel.x, -texel.y));
          float d10 = getLinearDepth(uv + vec2(0.0,      -texel.y));
          float d20 = getLinearDepth(uv + vec2( texel.x, -texel.y));
          float d01 = getLinearDepth(uv + vec2(-texel.x,  0.0));
          float d21 = getLinearDepth(uv + vec2( texel.x,  0.0));
          float d02 = getLinearDepth(uv + vec2(-texel.x,  texel.y));
          float d12 = getLinearDepth(uv + vec2(0.0,       texel.y));
          float d22 = getLinearDepth(uv + vec2( texel.x,  texel.y));

          vec3 n00 = getNormal(uv + vec2(-texel.x, -texel.y));
          vec3 n10 = getNormal(uv + vec2(0.0,      -texel.y));
          vec3 n20 = getNormal(uv + vec2( texel.x, -texel.y));
          vec3 n01 = getNormal(uv + vec2(-texel.x,  0.0));
          vec3 n21 = getNormal(uv + vec2( texel.x,  0.0));
          vec3 n02 = getNormal(uv + vec2(-texel.x,  texel.y));
          vec3 n12 = getNormal(uv + vec2(0.0,       texel.y));
          vec3 n22 = getNormal(uv + vec2( texel.x,  texel.y));

          float gxDepth = (d20 - d00) + 2.0 * (d21 - d01) + (d22 - d02);
          float gyDepth = (d02 - d00) + 2.0 * (d12 - d10) + (d22 - d20);
          float deltaDepth = sqrt(gxDepth * gxDepth + gyDepth * gyDepth);

          vec3 gxNorm = (n20 - n00) + 2.0 * (n21 - n01) + (n22 - n02);
          vec3 gyNorm = (n02 - n00) + 2.0 * (n12 - n10) + (n22 - n20);
          float deltaNorm = sqrt(dot(gxNorm, gxNorm) + dot(gyNorm, gyNorm));

          float dThresh = uDepthThreshold * (1.0 + zCenter / 18.0);
          float depthEdge = smoothstep(dThresh, dThresh * 2.0, deltaDepth);
          float normEdge = smoothstep(uNormalThreshold, uNormalThreshold * 1.6, deltaNorm);

          float inkFactor = clamp(max(depthEdge, normEdge) * uInkStrength, 0.0, 1.0);

          if (zCenter < 3.5 && deltaNorm < 0.65) {
            inkFactor *= smoothstep(0.40, 0.65, deltaNorm);
          }

          color = mix(color, uInkColor, inkFactor);

          float totalOcc = 0.0;
          float aoR = uAoRadius;
          vec2 aoTexel = 1.0 / uResolution;

          #define TAP_AO(ox, oy) { \
            vec2 tapUv = uv + vec2(ox, oy) * aoR * aoTexel; \
            float tapZ = getLinearDepth(tapUv); \
            float dz = zCenter - tapZ; \
            if (dz > uAoBias && dz < uAoMaxDistance) { \
              float occ = (dz - uAoBias) / uAoMaxDistance; \
              totalOcc += occ * (1.0 - dz / uAoMaxDistance); \
            } \
          }

          TAP_AO( 0.538,  0.185)
          TAP_AO(-0.297,  0.835)
          TAP_AO(-0.749, -0.274)
          TAP_AO( 0.179, -0.716)
          TAP_AO( 0.925,  0.312)
          TAP_AO(-0.412,  0.985)
          TAP_AO(-0.884, -0.461)
          TAP_AO( 0.321, -0.912)
          #undef TAP_AO

          float aoFactor = 1.0 - clamp((totalOcc / 8.0) * uAoIntensity, 0.0, 0.70);
          color *= aoFactor;
        }
      }

      vec3 scurve = color * color * (3.0 - 2.0 * color);
      color = mix(color, scurve, uContrast);

      float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));

      vec3 shadowTint = vec3(0.90, 0.93, 1.10);
      float shadowWeight = (1.0 - smoothstep(0.04, 0.45, lum)) * 0.28 * uSplitToneStrength;
      color = mix(color, color * shadowTint, shadowWeight);

      vec3 highlightTint = vec3(1.08, 1.02, 0.92);
      float highlightWeight = smoothstep(0.55, 0.95, lum) * 0.22 * uSplitToneStrength;
      color = mix(color, color * highlightTint, highlightWeight);

      if (lum > 0.035 && lum < 0.24) {
        vec2 rotCoord = vec2(
          gl_FragCoord.x * 0.70710678 - gl_FragCoord.y * 0.70710678,
          gl_FragCoord.x * 0.70710678 + gl_FragCoord.y * 0.70710678
        );
        vec2 cell = mod(rotCoord, uBenDayScale) - vec2(uBenDayScale * 0.5);
        float dotDist = length(cell);

        float targetRadius = (1.0 - (lum - 0.035) / 0.205) * 1.85;
        if (dotDist < targetRadius) {
          float stipple = (1.0 - smoothstep(targetRadius - 0.5, targetRadius, dotDist)) * 0.18 * uHalftoneIntensity;
          color *= (1.0 - stipple);
        }
      }

      vec2 vigCoord = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float vigDist = length(vigCoord);
      float vig = 1.0 - smoothstep(uVignetteRadius - uVignetteDarkness, uVignetteRadius, vigDist);
      vec3 vigCorner = color * vec3(0.55, 0.50, 0.70);
      color = mix(vigCorner, color, vig);

      float maxComp = max(color.r, max(color.g, color.b));
      if (maxComp > 0.92) {
        float overflow = maxComp - 0.92;
        float targetMax = 0.92 + 0.045 * (overflow / (overflow + 0.25));
        color *= (targetMax / maxComp);
      }

      color = min(color, vec3(0.965));

      gl_FragColor = vec4(color, baseTex.a);
    }
  `
};

export function initPostProcessing(renderer, scene, camera, width, height, options = {}) {
  const _sizeVec = new THREE.Vector2();
  const _drawBufVec = new THREE.Vector2();
  if (renderer && typeof renderer.getSize === 'function') {
    renderer.getSize(_sizeVec);
  }
  const w = Math.max(1, Math.floor(width || _sizeVec.x || (renderer && renderer.domElement ? renderer.domElement.width : 0) || window.innerWidth || 1));
  const h = Math.max(1, Math.floor(height || _sizeVec.y || (renderer && renderer.domElement ? renderer.domElement.height : 0) || window.innerHeight || 1));
  let lastW = w;
  let lastH = h;
  const isLowTier = Boolean(options.isLowTier);

  if (camera && camera.layers) {
    camera.layers.enable(0);
    camera.layers.enable(1);
  }

  tagSceneLayers(scene);

  const depthTexture = new THREE.DepthTexture(w, h);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.type = THREE.UnsignedIntType;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  depthTexture.generateMipmaps = false;

  const depthNormalTarget = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthTexture: depthTexture,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false
  });
  depthNormalTarget.texture.name = 'depthNormalTarget.normal';

  const normalOverrideMaterial = new THREE.MeshNormalMaterial({
    side: THREE.FrontSide,
    blending: THREE.NoBlending
  });

  const composerTarget = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  });
  const composer = new EffectComposer(renderer, composerTarget);
  composer.setPixelRatio(1);
  composer.setSize(w, h);

  const depthNormalPass = new DepthNormalPass(scene, camera, depthNormalTarget, normalOverrideMaterial);
  depthNormalPass.enabled = !isLowTier;
  composer.addPass(depthNormalPass);

  const renderPass = new RenderPass(scene, camera);
  renderPass.clear = true;
  renderPass.clearDepth = true;
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    0.35,
    0.40,
    0.88
  );
  bloomPass.threshold = 0.88;
  bloomPass.strength = 0.35;
  bloomPass.radius = 0.40;
  bloomPass.enabled = !isLowTier;
  composer.addPass(bloomPass);

  const compositePass = new ShaderPass(StylizedCompositeShader);
  compositePass.renderToScreen = true;
  compositePass.uniforms.tNormal.value = depthNormalTarget.texture;
  compositePass.uniforms.tDepth.value = depthNormalTarget.depthTexture;
  compositePass.uniforms.uUseDepthNormal.value = isLowTier ? 0.0 : 1.0;
  compositePass.uniforms.uResolution.value.set(w, h);
  compositePass.uniforms.resolution.value.set(w, h);
  compositePass.uniforms.uCameraNear.value = camera ? camera.near : 0.05;
  compositePass.uniforms.cameraNear.value = camera ? camera.near : 0.05;
  compositePass.uniforms.uCameraFar.value = camera ? camera.far : 140.0;
  compositePass.uniforms.cameraFar.value = camera ? camera.far : 140.0;
  composer.addPass(compositePass);

  const impact = {
    chromaticAberration: 0.0,
    shockwavePulse: 0.0,
    shockwaveRadius: 0.0,
    shockwaveCenter: new THREE.Vector2(0.5, 0.5),
    isAtRest: true,
    lastTriggerTime: 0
  };

  const _tempVec3 = new THREE.Vector3();
  let lastUpdateTimestamp = performance.now();

  function triggerImpact(type, contactPoint) {
    if (typeof window !== 'undefined' && window.__kronosReducedMotion) return false;
    if (!type || typeof type !== 'string') return false;
    const t = type.toUpperCase();

    const now = performance.now();
    impact.lastTriggerTime = now;
    lastUpdateTimestamp = now;

    if (t.includes('PERFECT') || t === 'PUNCH') {
      impact.chromaticAberration = Math.min(0.045, Math.max(impact.chromaticAberration, 0.018));
      impact.shockwavePulse = Math.min(1.0, Math.max(impact.shockwavePulse, 0.35));
      impact.shockwaveRadius = 0.0;
      impact.isAtRest = false;
    } else if (t.includes('COUNTER') || t.includes('WEAVE') || t === 'DODGE') {
      impact.chromaticAberration = Math.min(0.045, Math.max(impact.chromaticAberration, 0.024));
      impact.shockwavePulse = Math.min(1.0, Math.max(impact.shockwavePulse, 0.80));
      impact.shockwaveRadius = 0.0;
      impact.isAtRest = false;
    } else if (t.includes('KO') || t.includes('STAGE') || t === 'KICK') {
      impact.chromaticAberration = Math.min(0.045, Math.max(impact.chromaticAberration, 0.035));
      impact.shockwavePulse = Math.min(1.0, Math.max(impact.shockwavePulse, 1.00));
      impact.shockwaveRadius = 0.0;
      impact.isAtRest = false;
    } else {
      return false;
    }

    if (contactPoint && contactPoint.isVector3 && camera) {
      _tempVec3.copy(contactPoint).project(camera);
      impact.shockwaveCenter.set(
        THREE.MathUtils.clamp((_tempVec3.x + 1) * 0.5, 0.1, 0.9),
        THREE.MathUtils.clamp((_tempVec3.y + 1) * 0.5, 0.1, 0.9)
      );
    } else {
      impact.shockwaveCenter.set(0.5, 0.5);
    }
    _syncImpactUniforms();
    return true;
  }

  function _syncImpactUniforms() {
    compositePass.uniforms.uChromaticAberration.value = impact.chromaticAberration;
    compositePass.uniforms.uShockwavePulse.value = impact.shockwavePulse;
    compositePass.uniforms.uShockwaveRadius.value = impact.shockwaveRadius;
    compositePass.uniforms.uShockwaveCenter.value.copy(impact.shockwaveCenter);
  }

  function syncImpact(now = performance.now()) {
    if (impact.isAtRest) {
      _syncImpactUniforms();
      return;
    }

    const elapsedMs = now - impact.lastTriggerTime;
    if (elapsedMs >= 450) {
      impact.chromaticAberration = 0.0;
      impact.shockwavePulse = 0.0;
      impact.shockwaveRadius = 0.0;
      impact.isAtRest = true;
      lastUpdateTimestamp = now;
      _syncImpactUniforms();
      return;
    }

    const dt = Math.max(0, (now - lastUpdateTimestamp) / 1000.0);
    lastUpdateTimestamp = now;

    if (dt > 0) {
      const decayFactor = Math.exp(-14.5 * dt);
      impact.chromaticAberration *= decayFactor;
      impact.shockwavePulse *= decayFactor;

      if (impact.shockwavePulse > 0.001) {
        impact.shockwaveRadius += dt * 2.2;
      }

      if (impact.chromaticAberration < 0.001) {
        impact.chromaticAberration = 0.0;
      }
      if (impact.shockwavePulse < 0.015 || impact.shockwaveRadius > 0.95) {
        impact.shockwavePulse = 0.0;
        impact.shockwaveRadius = 0.0;
      }

      impact.isAtRest = (impact.chromaticAberration === 0.0 && impact.shockwavePulse === 0.0);
      _syncImpactUniforms();
    }
  }

  function update(dt, rawDt) {
    if (renderer && typeof renderer.getDrawingBufferSize === 'function') {
      renderer.getDrawingBufferSize(_drawBufVec);
      const curW = Math.max(1, Math.floor(_drawBufVec.x || 1));
      const curH = Math.max(1, Math.floor(_drawBufVec.y || 1));
      if (curW !== lastW || curH !== lastH) {
        onResize(curW, curH);
      }
    }

    const now = performance.now();
    syncImpact(now);

    let frameDt = (typeof rawDt === 'number' && rawDt > 0) ? rawDt : ((typeof dt === 'number' && dt > 0) ? dt : 0.016);
    const safeDelta = Math.min(Math.max(frameDt, 0.001), 0.1);
    compositePass.uniforms.uTime.value += safeDelta;
  }

  function onResize(widthVal, heightVal) {
    if (renderer && typeof renderer.getSize === 'function') {
      renderer.getSize(_sizeVec);
    }
    const newW = Math.max(1, Math.floor(widthVal || _sizeVec.x || (renderer && renderer.domElement ? renderer.domElement.width : 0) || window.innerWidth || 1));
    const newH = Math.max(1, Math.floor(heightVal || _sizeVec.y || (renderer && renderer.domElement ? renderer.domElement.height : 0) || window.innerHeight || 1));
    lastW = newW;
    lastH = newH;

    composer.setSize(newW, newH);
    depthNormalPass.setSize(newW, newH);
    bloomPass.setSize(newW, newH);

    compositePass.uniforms.uResolution.value.set(newW, newH);
    compositePass.uniforms.resolution.value.set(newW, newH);
    if (camera) {
      compositePass.uniforms.uCameraNear.value = camera.near;
      compositePass.uniforms.cameraNear.value = camera.near;
      compositePass.uniforms.uCameraFar.value = camera.far;
      compositePass.uniforms.cameraFar.value = camera.far;
    }
  }

  onResize(w, h);

  function render() {
    if (renderer && typeof renderer.getDrawingBufferSize === 'function') {
      renderer.getDrawingBufferSize(_drawBufVec);
      const curW = Math.max(1, Math.floor(_drawBufVec.x || 1));
      const curH = Math.max(1, Math.floor(_drawBufVec.y || 1));
      if (curW !== lastW || curH !== lastH) {
        onResize(curW, curH);
      }
    }
    composer.render();
  }

  function getState() {
    syncImpact(performance.now());
    return {
      active: true,
      composer: {
        active: true,
        isEffectComposer: true,
        passesCount: composer.passes.length,
        render: () => composer.render(),
        setSize: (wVal, hVal) => onResize(wVal, hVal)
      },
      renderTarget: {
        width: depthNormalTarget.width,
        height: depthNormalTarget.height
      },
      passes: {
        depthNormalPass: { enabled: depthNormalPass.enabled },
        depthNormalTarget: { enabled: depthNormalPass.enabled },
        renderPass: { enabled: renderPass.enabled },
        bloom: {
          enabled: bloomPass.enabled,
          threshold: bloomPass.threshold,
          strength: bloomPass.strength,
          radius: bloomPass.radius
        },
        bloomPass: {
          enabled: bloomPass.enabled,
          threshold: bloomPass.threshold,
          strength: bloomPass.strength,
          radius: bloomPass.radius
        },
        edgeDetection: {
          enabled: compositePass.enabled,
          edgeSobel: true
        },
        ssao: {
          enabled: !isLowTier,
          intensity: compositePass.uniforms.uAoIntensity.value
        },
        colorGrading: {
          enabled: compositePass.enabled,
          sCurve: true
        },
        compositePass: {
          enabled: compositePass.enabled,
          edgeSobel: true,
          ssao: !isLowTier,
          colorGrading: true,
          sCurve: true,
          vignette: true,
          benDayDots: true,
          halftone: true,
          uniforms: {
            uChromaticAberration: impact.chromaticAberration,
            uShockwavePulse: impact.shockwavePulse,
            uShockwaveRadius: impact.shockwaveRadius,
            uShockwaveCenter: impact.shockwaveCenter,
            uTime: compositePass.uniforms.uTime.value
          }
        }
      },
      combatImpact: {
        chromaticAberration: impact.chromaticAberration,
        shockwavePulse: impact.shockwavePulse,
        shockwaveIntensity: impact.shockwavePulse,
        shockwaveRadius: impact.shockwaveRadius,
        shockwaveCenter: impact.shockwaveCenter,
        isAtRest: impact.isAtRest
      }
    };
  }

  return {
    composer,
    depthNormalTarget,
    render,
    update,
    onResize,
    setSize: onResize,
    triggerImpact,
    getState,
    tagSceneLayers
  };
}

export default initPostProcessing;
