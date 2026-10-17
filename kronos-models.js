import * as THREE from 'three';

// ============================================================================
// 1. HI-FI RUSH / DEAD AS DISCO CEL-SHADER + HALFTONE + INVERSE-HULL OUTLINES
// ============================================================================
function createSteppedGradientMap() {
  // 3 distinct stepped tonal quantization bands: [Shadow (46), Midtone (158), Highlight (255)]
  const data = new Uint8Array([46, 158, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export const toonGradientMap = createSteppedGradientMap();

// Cache for inverted-hull outline materials by thickness and color
const outlineMaterialCache = new Map();

/**
 * Creates or retrieves a cached inverted-hull outline ShaderMaterial using
 * view-space normal-displacement vertex extrusion and BackSide culling.
 * Eliminates non-uniform scaling distortions across elongated limbs.
 */
export function createOutlineMaterial(thickness = 0.038, colorHex = 0x060508) {
  const metricThickness = thickness * 0.16;
  const cacheKey = `${Number(metricThickness).toFixed(4)}_${colorHex}`;
  if (outlineMaterialCache.has(cacheKey)) {
    return outlineMaterialCache.get(cacheKey);
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: metricThickness },
      uColor: { value: new THREE.Color(colorHex) }
    },
    vertexShader: `
      uniform float uThickness;
      void main() {
        // Displace vertices along vertex normal in view space
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        vec3 mvNormal = normalize( normalMatrix * normal );
        mvPosition.xyz += mvNormal * uThickness;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4( uColor, 1.0 );
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  });

  outlineMaterialCache.set(cacheKey, mat);
  return mat;
}

/**
 * Creates a high-fidelity cel-shaded material with 3-tier stepped toon lighting,
 * 45° rotated Ben-Day halftone screen dot dithering in the shadow-to-midtone transition,
 * and optional specular cel glints for metallic/gloss surfaces.
 */
const celMaterialCache = new Map();

export function createCelMaterial(colorHex, mapTex = null, emissiveHex = 0x000000, options = {}) {
  const isMetallic = typeof options === 'boolean' ? options : !!options.isMetallic;
  const glintThreshold = options.glintThreshold ?? 0.88;
  const glintIntensity = options.glintIntensity ?? (isMetallic ? 1.5 : 0.0);
  const creviceAO = options.creviceAO ?? (options.isArchitectural ? 1.0 : 0.0);
  const rimIntensity = options.rimIntensity ?? (options.isCharacter ? 0.85 : 0.0);

  const texKey = mapTex ? (mapTex.uuid || mapTex.id || 'tex') : '0';
  const cacheKey = `${colorHex}_${texKey}_${emissiveHex}_${isMetallic}_${glintThreshold}_${glintIntensity}_${creviceAO}_${rimIntensity}`;
  if (celMaterialCache.has(cacheKey)) {
    return celMaterialCache.get(cacheKey);
  }

  const mat = new THREE.MeshToonMaterial({
    color: colorHex,
    gradientMap: toonGradientMap,
    map: mapTex,
    emissive: emissiveHex
  });

  mat.customProgramCacheKey = () => {
    let key = isMetallic ? 'cel_glint_metallic' : 'cel_matte';
    if (creviceAO > 0.0) key += '_crevice';
    if (rimIntensity > 0.0) key += '_rim';
    return key;
  };

  mat.onBeforeCompile = (shader) => {
    // Inject specular glint, crevice AO & rim uniforms
    shader.uniforms.uGlintIntensity = { value: glintIntensity };
    shader.uniforms.uGlintThreshold = { value: glintThreshold };
    shader.uniforms.uCreviceAO = { value: creviceAO };
    shader.uniforms.uRimIntensity = { value: rimIntensity };
    mat.userData.shader = shader;

    // Inject varying vWorldPos into vertex shader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldPos;
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vWorldPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;
      `
    );

    // Inject varying & uniforms into fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldPos;
      uniform float uCreviceAO;
      uniform float uRimIntensity;
      `
    );

    // 1. Replace gradientmap_pars_fragment with 3-tier stepped lighting + 45° Ben-Day halftone dither
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <gradientmap_pars_fragment>',
      `
      #ifdef USE_GRADIENTMAP
        uniform sampler2D gradientMap;
      #endif

      vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
        float NdotL = clamp( dot( normal, lightDirection ), 0.0, 1.0 );

        // 1. 3-Tier Stepped Cel Lighting Quantization
        float celFactor;
        if ( NdotL < 0.25 ) {
          celFactor = 0.28; // Deep shadow tier
        } else if ( NdotL < 0.65 ) {
          celFactor = 0.62; // Midtone tier
        } else {
          celFactor = 1.00; // Highlight tier
        }

        // 2. 45-degree rotated Ben-Day halftone screen dot dithering in the shadow-to-midtone transition zone
        // Condition: NdotL between 0.18 and 0.42, cell distance < 1.65, multiplier 0.65
        vec2 rotCoord = vec2(
          gl_FragCoord.x * 0.70710678 - gl_FragCoord.y * 0.70710678,
          gl_FragCoord.x * 0.70710678 + gl_FragCoord.y * 0.70710678
        );
        vec2 cell = mod( rotCoord, 6.0 ) - vec2( 3.0 );
        float dotDist = length( cell );

        if ( NdotL >= 0.18 && NdotL <= 0.42 && dotDist < 1.65 ) {
          celFactor *= 0.65; // Printed comic ink stipple
        }

        return vec3( celFactor );
      }
      `
    );

    // 2. Replace lights_toon_pars_fragment to add hard-edged specular cel glints for metallic assets
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
        vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
        reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

        if ( gl_FrontFacing && uGlintIntensity > 0.0 ) {
          vec3 halfDir = normalize( directLight.direction + geometryViewDir );
          float NdotH = max( 0.0, dot( geometryNormal, halfDir ) );
          if ( NdotH > uGlintThreshold ) {
            vec3 glintTint = mix( vec3( 1.0 ), material.diffuseColor, 0.30 );
            reflectedLight.directDiffuse += directLight.color * glintTint * uGlintIntensity;
          }
        }
      }

      void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
        reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
      }

      #define RE_Direct RE_Direct_Toon
      #define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
      `
    );

    // 3. Inject height-based vertical crevice AO and stylized cel Fresnel rim hook
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment>',
      `
      #include <lights_fragment>

      // Stylized Height-Based Crevice AO for vertical ground contact
      if ( uCreviceAO > 0.0 ) {
        float creviceAO = clamp( smoothstep( -0.1, 1.25, vWorldPos.y ) * 0.45 + 0.55, 0.45, 1.0 );
        reflectedLight.directDiffuse *= creviceAO;
        reflectedLight.indirectDiffuse *= creviceAO;
      }

      // Stylized Cel Fresnel Silhouette Rim Hook
      if ( uRimIntensity > 0.0 ) {
        vec3 viewDir = normalize( -vViewPosition );
        float rimDot = 1.0 - max( 0.0, dot( normal, viewDir ) );
        float rimFactor = smoothstep( 0.68, 0.88, rimDot );
        vec3 rimColor = vec3( 0.55, 0.90, 1.0 ) * uRimIntensity;
        reflectedLight.directDiffuse += rimColor * rimFactor;
      }
      `
    );
  };

  celMaterialCache.set(cacheKey, mat);
  return mat;
}

/**
 * Convenience helper to create a metallic cel material with hard specular cel glints.
 */
export function createMetallicCelMaterial(colorHex, mapTex = null, emissiveHex = 0x000000, options = {}) {
  return createCelMaterial(colorHex, mapTex, emissiveHex, {
    isMetallic: true,
    glintThreshold: options.glintThreshold ?? 0.88,
    glintIntensity: options.glintIntensity ?? 1.5,
    ...options
  });
}

/**
 * Wraps a geometry with cel material and an inverted-hull normal-displaced outline mesh.
 */
export function createHiFiMesh(geometry, colorHex, outlineThickness = 0.038, mapTex = null, emissiveHex = 0x000000, options = {}) {
  const mat = createCelMaterial(colorHex, mapTex, emissiveHex, options);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (outlineThickness > 0) {
    const outlineMat = createOutlineMaterial(outlineThickness, (options && options.outlineColor) || 0x060508);
    const outline = new THREE.Mesh(geometry, outlineMat);
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = 1;
    // Note: Do not scale outline! The vertex shader displaces vertices along view-space normals.
    mesh.add(outline);
  }
  return mesh;
}

// ============================================================================
// 2. GROUND-TRUTH SCULPTED LOFT GEOMETRY & ANIME HAIR LOCK BUILDERS
// ============================================================================

/**
 * Builds a watertight, smooth-normal 3D lofted geometry from cross-section slices:
 * Each slice: [y, rx, rzFront, rzBack, cx = 0, cz = 0, p = 2.0]
 * UV mapping:
 * - u = 0.50 (x = 512 on 1024px canvas): Center Front (View 1)
 * - u = 0.25 (x = 256 on 1024px canvas): Character Right Side (View 3 Side Profile, viewer's left in View 1)
 * - u = 0.75 (x = 768 on 1024px canvas): Character Left Side (viewer's right in View 1)
 * - u = 0.00 / 1.00 (x = 0 / 1024): Center Back (View 4)
 * - v = i / (slices.length - 1): 0.0 at bottom slice (y = 1024 on canvas) to 1.0 at top slice (y = 0 on canvas)
 */
export function createSculptedLoftGeometry(slices, radialSegments = 32, frontIsNegZ = true, closeBottom = true, closeTop = true) {
  const numSlices = slices.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  const yMin = slices[0][0];
  const yMax = slices[numSlices - 1][0];
  const ySpan = Math.max(1e-5, yMax - yMin);

  for (let i = 0; i < numSlices; i++) {
    const [y, rx, rzFront, rzBack, cx = 0, cz = 0, p = 2.0] = slices[i];
    // Linear vertical UV mapping so v is strictly proportional to 3D height y!
    const v = Math.max(0.0, Math.min(1.0, (y - yMin) / ySpan));

    for (let j = 0; j <= radialSegments; j++) {
      const t = j / radialSegments;
      const phi = (t - 0.5) * Math.PI * 2;
      const dirX = frontIsNegZ ? -Math.sin(phi) : Math.sin(phi);
      const dirZ = frontIsNegZ ? -Math.cos(phi) : Math.cos(phi);

      const isFront = frontIsNegZ ? (dirZ <= 0) : (dirZ >= 0);
      const rz = isFront ? rzFront : rzBack;

      const exp = 2.0 / p;
      const sx = Math.sign(dirX) * Math.pow(Math.abs(dirX), exp);
      const sz = Math.sign(dirZ) * Math.pow(Math.abs(dirZ), exp);

      // Orthographic linear-X UV mapping (nx in [-1, +1] where -1 = Right side u=0.25, 0 = Center Front/Back, +1 = Left side u=0.75)
      const nx = frontIsNegZ ? -sx : sx;
      let u;
      if (j === 0) {
        u = 0.0;
      } else if (j === radialSegments) {
        u = 1.0;
      } else if (t <= 0.25) {
        u = Math.max(0.0, Math.min(0.25, -0.25 * nx));
      } else if (t < 0.75) {
        u = Math.max(0.25, Math.min(0.75, 0.50 + 0.25 * nx));
      } else {
        u = Math.max(0.75, Math.min(1.0, 1.0 - 0.25 * nx));
      }

      positions.push(cx + rx * sx, y, cz + rz * sz);
      uvs.push(u, v);
    }
  }

  const ringStride = radialSegments + 1;
  for (let i = 0; i < numSlices - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * ringStride + j;
      const b = a + 1;
      const d = (i + 1) * ringStride + j;
      const c = d + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const wallVertexCount = positions.length / 3;

  // Optional end caps so geometry is 100% solid from all angles
  if (closeBottom && slices.length > 0) {
    const [y0, , , , cx0 = 0, cz0 = 0] = slices[0];
    const botCenterIdx = positions.length / 3;
    positions.push(cx0, y0, cz0);
    uvs.push(0.5, 0.0);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(botCenterIdx, j + 1, j);
    }
  }

  if (closeTop && slices.length > 0) {
    const [yN, , , , cxN = 0, czN = 0] = slices[numSlices - 1];
    const topCenterIdx = positions.length / 3;
    const topRowStart = (numSlices - 1) * ringStride;
    positions.push(cxN, yN, czN);
    uvs.push(0.5, 1.0);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(topCenterIdx, topRowStart + j, topRowStart + j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Weld seam normals at u = 0 and u = 1 so inverted-hull outlines never split!
  const normAttr = geo.attributes.normal;
  for (let i = 0; i < numSlices; i++) {
    const idx0 = i * ringStride;
    const idx1 = i * ringStride + radialSegments;
    const nx = normAttr.getX(idx0) + normAttr.getX(idx1);
    const ny = normAttr.getY(idx0) + normAttr.getY(idx1);
    const nz = normAttr.getZ(idx0) + normAttr.getZ(idx1);
    const len = Math.hypot(nx, ny, nz) || 1;
    normAttr.setXYZ(idx0, nx / len, ny / len, nz / len);
    normAttr.setXYZ(idx1, nx / len, ny / len, nz / len);
  }
  if (wallVertexCount < normAttr.count) {
    if (closeBottom) normAttr.setXYZ(wallVertexCount, 0, -1, 0);
    if (closeTop) normAttr.setXYZ(wallVertexCount + (closeBottom ? 1 : 0), 0, 1, 0);
  }
  normAttr.needsUpdate = true;

  return geo;
}

/**
 * Builds a sculpted, curved 3D anime hair lock geometry that sweeps along a smooth arc
 * and tapers to a crisp anime point with watertight seam normals.
 */
function createCurvedHairLockGeometry(length = 0.14, width = 0.055, thickness = 0.032, bendZ = 0.03, bendX = 0.0) {
  const segsY = 7;
  const segsR = 10; // 8 * 11 = 88 vertices (<= 100 invariant for test_challenger_sculpt_verification.py)
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segsY; i++) {
    const t = i / segsY;
    // Taper smoothly from full root to rounded tip (avoiding degenerate 0-radius normal pinch)
    const profile = t < 0.25
      ? 0.82 + (t / 0.25) * 0.18
      : Math.max(0.08, Math.pow(1.0 - (t - 0.25) / 0.75, 1.05));
    const rx = (width * 0.5) * profile;
    const rz = (thickness * 0.5) * profile;
    const y = t * length;
    const cx = bendX * t * t;
    const cz = bendZ * t * t;

    for (let j = 0; j <= segsR; j++) {
      const u = j / segsR;
      const phi = u * Math.PI * 2;
      const dx = Math.cos(phi);
      const dz = Math.sin(phi);
      positions.push(cx + rx * dx, y, cz + rz * dz);
      uvs.push(u, t);
    }
  }

  const stride = segsR + 1;
  for (let i = 0; i < segsY; i++) {
    for (let j = 0; j < segsR; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const d = (i + 1) * stride + j;
      const c = d + 1;
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const normAttr = geo.attributes.normal;
  for (let i = 0; i <= segsY; i++) {
    const idx0 = i * stride;
    const idx1 = i * stride + segsR;
    const nx = normAttr.getX(idx0) + normAttr.getX(idx1);
    const ny = normAttr.getY(idx0) + normAttr.getY(idx1);
    const nz = normAttr.getZ(idx0) + normAttr.getZ(idx1);
    const len = Math.hypot(nx, ny, nz) || 1;
    normAttr.setXYZ(idx0, nx / len, ny / len, nz / len);
    normAttr.setXYZ(idx1, nx / len, ny / len, nz / len);
  }
  normAttr.needsUpdate = true;
  return geo;
}

/**
 * Helper to draw seamlessly across the Center Back UV seam (x = 0 and x = 1024).
 */
function drawOnBackSeam(ctx, fn) {
  [0, 1024].forEach((bx) => {
    ctx.save();
    ctx.translate(bx, 0);
    fn();
    ctx.restore();
  });
}

// ============================================================================
// 2B. CHALLENGER 1024x1024 TURNAROUND UV TEXTURE GENERATORS
//     Linear Y-UV Calibration for headSlices (yMin = -0.135, yMax = +0.115):
//     - Chin tip (y = -0.135) -> py = 1024
//     - Mouth    (y = -0.068) -> py = 750
//     - Nose     (y = -0.025) -> py = 573
//     Linear Y-UV Calibration for 8-slice headSlices (yMin = -0.110, yMax = +0.116, ySpan = 0.226):
//     - Chin tip (y = -0.110) -> py = 1024
//     - Mouth    (y = -0.055) -> py = 775
//     - Nose tip (y = -0.026) -> py = 643
//     - Eyes     (y = +0.004) -> py = 508 (EXACT MIDLINE)
//     - Eyebrows (y = +0.038) -> py = 353
//     - Hairline (y = +0.076) -> py = 181
// ============================================================================

const _challengerHeadTexCache = {};
function createChallengerHeadUVTexture(expression = 'determined') {
  if (_challengerHeadTexCache[expression]) return _challengerHeadTexCache[expression];
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Warm fair-tan anime skin tone
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Soft cheek blush / warm tone on zygomatic arches (below eyes on cheekbones)
  [-1, 1].forEach((dir) => {
    const cx = 512 + dir * 140;
    const cy = 560;
    const blush = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
    blush.addColorStop(0, 'rgba(224, 138, 100, 0.42)');
    blush.addColorStop(1, 'rgba(235, 182, 144, 0.0)');
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. Warm Cel Jaw & Chin Under-Shading (py = 860..1024)
  const chinGrad = ctx.createLinearGradient(0, 860, 0, 1024);
  chinGrad.addColorStop(0, 'rgba(196, 126, 88, 0.0)');
  chinGrad.addColorStop(1, 'rgba(182, 110, 74, 0.65)');
  ctx.fillStyle = chinGrad;
  ctx.fillRect(0, 860, 1024, 164);

  // 4. Upper cranium chestnut hair base (strictly inside 3D hair dome at py = 0..105 so forehead skin is clean)
  ctx.fillStyle = '#5c341e';
  ctx.fillRect(0, 0, 1024, 105);

  // 5. Back of head / nape hair base on back seam (py = 0..850)
  drawOnBackSeam(ctx, () => {
    ctx.fillStyle = '#442414';
    ctx.fillRect(-240, 0, 480, 850);
  });

  // 6. Center Front Expressive Anime Eyes around x = 512 (Front -Z)
  // Eye horizontal center at x = 512 ± 100, vertical center at py = 514 (EXACT VERTICAL MIDLINE)
  // Clipped almond sclera so the golden-amber iris fills top-to-bottom between lids with crisp white corners
  [-1, 1].forEach((dir) => {
    const ex = 512 + dir * 100;
    const ey = 514;

    // A. Sharp Confident Almond Sclera (~182px wide, ~74px tall so iris touches top/bottom lids cleanly)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex - dir * 86, ey + 6);
    ctx.bezierCurveTo(ex - dir * 50, ey - 40, ex + dir * 34, ey - 42, ex + dir * 94, ey - 6);
    ctx.bezierCurveTo(ex + dir * 60, ey + 34, ex - dir * 38, ey + 34, ex - dir * 86, ey + 6);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();

    // B. Upper Sclera Subtle Eyelid Cast Shadow
    ctx.fillStyle = 'rgba(140, 110, 98, 0.22)';
    ctx.fillRect(ex - 100, ey - 44, 200, 16);

    // C. Thin Outer Limbal Ring (43x40px filling vertical eye opening)
    ctx.fillStyle = '#240f05';
    ctx.beginPath();
    ctx.ellipse(ex, ey - 2, 43, 40, 0, 0, Math.PI * 2);
    ctx.fill();

    // D. High-Luminance Golden-Amber / Chestnut Anime Iris Gradient (39x37px)
    const irisGrad = ctx.createLinearGradient(ex, ey - 38, ex, ey + 34);
    irisGrad.addColorStop(0.00, '#6e280c'); // Rich chestnut top under upper lid
    irisGrad.addColorStop(0.35, '#c45416'); // Vibrant warm amber mid-top
    irisGrad.addColorStop(0.72, '#f28c28'); // Luminous fiery amber
    irisGrad.addColorStop(1.00, '#ffd45e'); // Bright golden lower crescent
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(ex, ey - 2, 39, 37, 0, 0, Math.PI * 2);
    ctx.fill();

    // E. Crisp Compact Pupil (12.5px)
    ctx.fillStyle = '#080302';
    ctx.beginPath();
    ctx.arc(ex, ey - 2, 12.5, 0, Math.PI * 2);
    ctx.fill();

    // F. Dual High-Contrast Specular Catchlights (Anime Glints)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + dir * 15, ey - 14, 14.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex - dir * 15, ey + 12, 8.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // G. Crisp Graphic Black Upper Eyelash / Eyeliner Arch
    ctx.strokeStyle = '#0d0705';
    ctx.lineWidth = 10.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 88, ey + 6);
    ctx.bezierCurveTo(ex - dir * 50, ey - 41, ex + dir * 34, ey - 43, ex + dir * 98, ey - 6);
    ctx.stroke();

    // H. Subtle Lower Eyelid Definition Line
    ctx.strokeStyle = '#2a160e';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(ex - dir * 56, ey + 30);
    ctx.quadraticCurveTo(ex + dir * 4, ey + 36, ex + dir * 68, ey + 18);
    ctx.stroke();

    // I. Bold Angled Heroic Eyebrows (Positioned closely above upper lash at ey - 48..74 for focused fighter intensity)
    ctx.fillStyle = '#1b0d06';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 86, ey - 48);
    ctx.quadraticCurveTo(ex - dir * 8, ey - 76, ex + dir * 94, ey - 66);
    ctx.lineTo(ex + dir * 88, ey - 50);
    ctx.quadraticCurveTo(ex - dir * 8, ey - 60, ex - dir * 78, ey - 34);
    ctx.closePath();
    ctx.fill();
  });

  // 8. Clean Anime Nose Tip and Subtle Nostril Accent (eliminating harsh vertical stripe)
  ctx.fillStyle = '#c4825a';
  ctx.beginPath();
  ctx.arc(512, 638, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#180c06';
  ctx.lineWidth = 4.0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(508, 636);
  ctx.lineTo(516, 642);
  ctx.lineTo(504, 648);
  ctx.stroke();

  // 9. Mouth Expressions: Determined Line vs View 2 Cocky Battle Grin
  if (expression === 'grin') {
    // View 2 Confident Cocky Open-Mouthed Battle Grin matching reference sheet View 2!
    // A. Oral cavity interior
    ctx.fillStyle = '#3a1016';
    ctx.beginPath();
    ctx.moveTo(428, 745);
    ctx.quadraticCurveTo(512, 730, 596, 740);
    ctx.quadraticCurveTo(574, 822, 512, 826);
    ctx.quadraticCurveTo(450, 822, 428, 745);
    ctx.closePath();
    ctx.fill();

    // B. Gleaming White Upper Teeth
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(432, 747);
    ctx.quadraticCurveTo(512, 735, 592, 743);
    ctx.lineTo(586, 774);
    ctx.quadraticCurveTo(512, 778, 438, 774);
    ctx.closePath();
    ctx.fill();

    // C. Tooth Separation Lines
    ctx.strokeStyle = '#c4cad6';
    ctx.lineWidth = 2.5;
    [480, 512, 544].forEach((tx) => {
      ctx.beginPath();
      ctx.moveTo(tx, 741);
      ctx.lineTo(tx, 775);
      ctx.stroke();
    });

    // D. Bold Outer Mouth Ink Outline
    ctx.strokeStyle = '#120804';
    ctx.lineWidth = 8.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(426, 743);
    ctx.quadraticCurveTo(512, 728, 598, 738);
    ctx.quadraticCurveTo(576, 824, 512, 828);
    ctx.quadraticCurveTo(448, 824, 426, 743);
    ctx.stroke();

    // E. Lip Corner Crease Accents
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(424, 747);
    ctx.lineTo(416, 737);
    ctx.moveTo(600, 742);
    ctx.lineTo(608, 732);
    ctx.stroke();

    // F. Lower Lip Cel Shadow
    ctx.strokeStyle = '#b47048';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(484, 844);
    ctx.lineTo(540, 844);
    ctx.stroke();

  } else {
    // Views 1 & 3 Determined Athletic Mouth Line with Confident Corner
    ctx.strokeStyle = '#140a06';
    ctx.lineWidth = 8.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(442, 775);
    ctx.quadraticCurveTo(512, 763, 582, 767);
    ctx.stroke();

    // Right Corner Confident Up-Tick
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(580, 767);
    ctx.lineTo(590, 760);
    ctx.stroke();

    // Lower Lip Cel Shadow
    ctx.strokeStyle = '#b8724a';
    ctx.lineWidth = 7.0;
    ctx.beginPath();
    ctx.moveTo(478, 806);
    ctx.lineTo(546, 806);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  _challengerHeadTexCache[expression] = tex;
  return tex;
}

let _challengerTorsoTex = null;
function createChallengerTorsoUVTexture() {
  if (_challengerTorsoTex) return _challengerTorsoTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Base Warm Skin Tone for Midriff (bottom of torso y = 740..1024) & Upper V-Neck Chest
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 1024, 1024);

  // --------------------------------------------------------------------------
  // BARE ATHLETIC MIDRIFF (y = 742..1024) — ORGANIC CEL-SHADED ANATOMY
  // --------------------------------------------------------------------------
  // A. Lateral Oblique Flank Shadows (#cf885c)
  ctx.fillStyle = '#cf885c';
  // Left flank sweep
  ctx.beginPath();
  ctx.moveTo(330, 742);
  ctx.quadraticCurveTo(370, 880, 435, 1024);
  ctx.lineTo(330, 1024);
  ctx.closePath();
  ctx.fill();
  // Right flank sweep
  ctx.beginPath();
  ctx.moveTo(694, 742);
  ctx.quadraticCurveTo(654, 880, 589, 1024);
  ctx.lineTo(694, 1024);
  ctx.closePath();
  ctx.fill();

  // B. 3 Diagonal Serratus Anterior / Oblique Muscle Slips on each flank
  ctx.strokeStyle = '#b87248';
  ctx.lineWidth = 6.0;
  ctx.lineCap = 'round';
  // Left flank slips
  ctx.beginPath();
  ctx.moveTo(345, 755); ctx.lineTo(430, 785);
  ctx.moveTo(355, 810); ctx.lineTo(435, 845);
  ctx.moveTo(365, 870); ctx.lineTo(440, 910);
  // Right flank slips
  ctx.moveTo(679, 755); ctx.lineTo(594, 785);
  ctx.moveTo(669, 810); ctx.lineTo(589, 845);
  ctx.moveTo(659, 870); ctx.lineTo(584, 910);
  ctx.stroke();

  // C. Rectus Abdominis Muscle Bellies (Pillow Volumes)
  // Upper Ab Pack Pair (y = 762..854)
  // Left upper pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(444, 762, 60, 92, [12, 6, 8, 14]); else ctx.fillRect(444, 762, 60, 92);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(448, 766, 52, 44, [10, 6, 6, 10]); else ctx.fillRect(448, 766, 52, 44);
  ctx.fill();

  // Right upper pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(520, 762, 60, 92, [6, 12, 14, 8]); else ctx.fillRect(520, 762, 60, 92);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(524, 766, 52, 44, [6, 10, 10, 6]); else ctx.fillRect(524, 766, 52, 44);
  ctx.fill();

  // Lower Ab Pack Pair (y = 878..972)
  // Left lower pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(446, 878, 58, 94, [10, 6, 12, 10]); else ctx.fillRect(446, 878, 58, 94);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(450, 882, 50, 42, [8, 6, 6, 8]); else ctx.fillRect(450, 882, 50, 42);
  ctx.fill();

  // Right lower pack
  ctx.fillStyle = '#cf885c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(520, 878, 58, 94, [6, 10, 10, 12]); else ctx.fillRect(520, 878, 58, 94);
  ctx.fill();
  ctx.fillStyle = '#f7cbab';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(524, 882, 50, 42, [6, 8, 8, 6]); else ctx.fillRect(524, 882, 50, 42);
  ctx.fill();

  // D. Umbilicus (Navel) at (512, 942)
  ctx.fillStyle = '#8a4822';
  ctx.beginPath();
  ctx.arc(512, 942, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f7cbab';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(512, 940, 6.5, Math.PI * 0.8, Math.PI * 2.2);
  ctx.stroke();

  // E. Iliac Furrow / V-Cut Grooves pointing to beltline
  ctx.strokeStyle = '#b46e44';
  ctx.lineWidth = 5.0;
  ctx.beginPath();
  ctx.moveTo(438, 980);
  ctx.lineTo(475, 1018);
  ctx.moveTo(586, 980);
  ctx.lineTo(549, 1018);
  ctx.stroke();

  // F. Refined Comic Ink Crease Contours (#26130c)
  ctx.strokeStyle = '#26130c';
  ctx.lineWidth = 4.0;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Central vertical Linea Alba groove
  ctx.moveTo(512, 742);
  ctx.lineTo(512, 934);
  ctx.moveTo(512, 950);
  ctx.lineTo(512, 1018);

  // Tendinous Intersections (Arched dividers between packs)
  ctx.moveTo(442, 862);
  ctx.quadraticCurveTo(478, 868, 506, 862);
  ctx.moveTo(518, 862);
  ctx.quadraticCurveTo(546, 868, 582, 862);

  ctx.moveTo(444, 974);
  ctx.quadraticCurveTo(476, 980, 506, 974);
  ctx.moveTo(518, 974);
  ctx.quadraticCurveTo(548, 980, 580, 974);

  // Lateral boundaries (Linea Semilunaris)
  ctx.moveTo(442, 755);
  ctx.quadraticCurveTo(436, 860, 444, 980);
  ctx.moveTo(582, 755);
  ctx.quadraticCurveTo(588, 860, 580, 980);
  ctx.stroke();

  // G. Back Midriff Spinal Groove & Lumbar Lines (View 4, x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.fillStyle = '#cf885c';
    ctx.fillRect(-12, 742, 24, 276);
    ctx.strokeStyle = '#26130c';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 746);
    ctx.lineTo(0, 1014);
    // Lumbar dimple accents
    ctx.moveTo(-58, 790);
    ctx.lineTo(-50, 980);
    ctx.moveTo(58, 790);
    ctx.lineTo(50, 980);
    ctx.stroke();
  });

  // --------------------------------------------------------------------------
  // 2. FITTED DARK-CHARCOAL CREW-NECK TANK TOP (Center Channel x = 425..599)
  // --------------------------------------------------------------------------
  ctx.fillStyle = '#1b1d23';
  ctx.fillRect(425, 275, 174, 468);

  // Subtle horizontal pectoral & ribcage fold lines on dark tank top
  ctx.strokeStyle = '#0d0e12';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(435, 275);
  ctx.quadraticCurveTo(512, 295, 589, 275);
  ctx.moveTo(450, 445);
  ctx.quadraticCurveTo(512, 460, 574, 445);
  ctx.moveTo(425, 742);
  ctx.lineTo(599, 742);
  ctx.stroke();

  // Bare V-Neck Upper Chest & Clavicles above Tank Top (x = 430..594, y = 0..275)
  ctx.strokeStyle = '#26130c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  // Clavicles
  ctx.moveTo(450, 195);
  ctx.lineTo(498, 222);
  ctx.moveTo(574, 195);
  ctx.lineTo(526, 222);
  // Neck tendons
  ctx.moveTo(476, 85);
  ctx.lineTo(502, 205);
  ctx.moveTo(548, 85);
  ctx.lineTo(522, 205);
  ctx.stroke();

  // --------------------------------------------------------------------------
  // 3. CROPPED MATTE-CHARCOAL BOMBER JACKET SHELL (#2b2e36)
  // --------------------------------------------------------------------------
  ctx.fillStyle = '#2b2e36';
  ctx.fillRect(0, 0, 442, 665);
  ctx.fillRect(582, 0, 442, 665);

  // Cel-shaded darker charcoal side/underarm panels for 3D depth
  ctx.fillStyle = '#21242b';
  ctx.fillRect(210, 100, 95, 565);
  ctx.fillRect(719, 100, 95, 565);

  // --------------------------------------------------------------------------
  // 4. SEGMENTED CRIMSON-RED RIBBED BOTTOM WAIST HEM (#c8242a) at y = 665..742
  // --------------------------------------------------------------------------
  ctx.fillStyle = '#c8242a';
  ctx.fillRect(0, 665, 442, 77);
  ctx.fillRect(582, 665, 442, 77);

  // Vertical black elastic rib lines along the crimson waist hem
  ctx.strokeStyle = '#120d10';
  ctx.lineWidth = 4.5;
  for (let rx = 12; rx < 1024; rx += 26) {
    if (rx > 438 && rx < 586) continue;
    ctx.beginPath();
    ctx.moveTo(rx, 665);
    ctx.lineTo(rx, 742);
    ctx.stroke();
  }

  // Bold black ink borders around jacket opening & waist hem
  ctx.strokeStyle = '#0e0e12';
  ctx.lineWidth = 7;
  ctx.beginPath();
  // Left & Right open front zipper edges
  ctx.moveTo(442, 90);
  ctx.lineTo(442, 742);
  ctx.moveTo(582, 90);
  ctx.lineTo(582, 742);
  // Top & Bottom of crimson ribbed waist hem
  ctx.moveTo(0, 665);
  ctx.lineTo(442, 665);
  ctx.moveTo(582, 665);
  ctx.lineTo(1024, 665);
  ctx.moveTo(0, 742);
  ctx.lineTo(442, 742);
  ctx.moveTo(582, 742);
  ctx.lineTo(1024, 742);
  ctx.stroke();

  // Angled Slash Pocket Welts on Front Left & Right Charcoal Panels
  ctx.strokeStyle = '#111216';
  ctx.lineWidth = 6.5;
  [
    [392, 535, 336, 618],
    [632, 535, 688, 618]
  ].forEach(([x0, y0, x1, y1]) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = '#3c404b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 - 5, y0 - 4);
    ctx.lineTo(x1 - 5, y1 - 4);
    ctx.stroke();
    ctx.strokeStyle = '#111216';
    ctx.lineWidth = 6.5;
  });

  // --------------------------------------------------------------------------
  // 5. VIEW 4 BACK EMBLEM: HERO 1.15x SKULL WEARING RED-AND-WHITE DJ HEADPHONES
  // --------------------------------------------------------------------------
  drawOnBackSeam(ctx, () => {
    ctx.save();
    ctx.translate(0, 335);
    ctx.scale(1.15, 1.15);

    // Subtle back panel seam lines above and below skull
    ctx.strokeStyle = '#16181e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-175, -165);
    ctx.lineTo(175, -165);
    ctx.stroke();

    // Headphones Headband: Outer black border (30px), Crimson band (22px), White inner cushion (8px)
    ctx.lineWidth = 30;
    ctx.strokeStyle = '#0e0f14';
    ctx.beginPath();
    ctx.arc(0, -14, 122, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();

    ctx.lineWidth = 22;
    ctx.strokeStyle = '#c8242a';
    ctx.beginPath();
    ctx.arc(0, -14, 122, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#f5f6f8';
    ctx.beginPath();
    ctx.arc(0, -14, 113, Math.PI * 0.97, Math.PI * 2.03);
    ctx.stroke();

    // Headband radial cushion segment ticks
    ctx.strokeStyle = '#0e0f14';
    ctx.lineWidth = 2.5;
    for (let th = 1.05; th <= 1.95; th += 0.15) {
      const cosT = Math.cos(th * Math.PI);
      const sinT = Math.sin(th * Math.PI);
      ctx.beginPath();
      ctx.moveTo(cosT * 109, -14 + sinT * 109);
      ctx.lineTo(cosT * 117, -14 + sinT * 117);
      ctx.stroke();
    }

    // Over-Ear DJ Cans (Red outer shell, White inner cushion pad, Silver bracket)
    [-122, 122].forEach((hx) => {
      const sign = Math.sign(hx);
      // Silver/white swivel bracket
      ctx.fillStyle = '#f5f6f8';
      ctx.strokeStyle = '#0e0f14';
      ctx.lineWidth = 5;
      ctx.fillRect(hx - 12, -42, 24, 20);
      ctx.strokeRect(hx - 12, -42, 24, 20);

      // Crimson outer earcup dome
      ctx.fillStyle = '#c8242a';
      ctx.strokeStyle = '#0e0f14';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(hx, 10, 26, 44, sign * -0.10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // White inner cushion pad
      ctx.fillStyle = '#f5f6f8';
      ctx.beginPath();
      ctx.ellipse(hx - sign * 8, 10, 14, 34, sign * -0.10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Dark core driver accent
      ctx.fillStyle = '#1c1e24';
      ctx.beginPath();
      ctx.ellipse(hx + sign * 6, 10, 8, 20, sign * -0.10, 0, Math.PI * 2);
      ctx.fill();
    });

    // Streetwear Skull Graphic
    ctx.fillStyle = '#f5f6f8';
    ctx.strokeStyle = '#0e0f14';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, -16, 88, Math.PI * 0.82, Math.PI * 2.18);
    // Flared zygomatic cheekbones & squared maxilla
    ctx.lineTo(76, 40);
    ctx.lineTo(50, 60);
    ctx.lineTo(44, 106);
    ctx.lineTo(-44, 106);
    ctx.lineTo(-50, 60);
    ctx.lineTo(-76, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cool-grey temple and cheek cel-shading
    ctx.fillStyle = '#d6dae2';
    ctx.beginPath();
    ctx.arc(-56, -18, 22, 0, Math.PI * 2);
    ctx.arc(56, -18, 22, 0, Math.PI * 2);
    ctx.fill();

    // Aggressive Angled Comic Eye Sockets
    ctx.fillStyle = '#101116';
    [-36, 36].forEach((ex) => {
      ctx.beginPath();
      ctx.ellipse(ex, 12, 24, 26, ex < 0 ? 0.24 : -0.24, 0, Math.PI * 2);
      ctx.fill();
    });

    // Brow furrow ticks above eye sockets
    ctx.strokeStyle = '#0e0f14';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, -4);
    ctx.lineTo(-6, 4);
    ctx.moveTo(16, -4);
    ctx.lineTo(6, 4);
    ctx.stroke();

    // Flared Inverted-Heart Nasal Cavity
    ctx.fillStyle = '#101116';
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(-14, 60);
    ctx.quadraticCurveTo(0, 54, 14, 60);
    ctx.closePath();
    ctx.fill();

    // 4 Clean White Tooth Blocks with Ink Lines
    ctx.strokeStyle = '#101116';
    ctx.lineWidth = 5.5;
    [-22, 0, 22].forEach((tx) => {
      ctx.beginPath();
      ctx.moveTo(tx, 72);
      ctx.lineTo(tx, 104);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-42, 88);
    ctx.lineTo(42, 88);
    ctx.stroke();

    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _challengerTorsoTex = tex;
  return tex;
}

let _challengerPelvisTex = null;
function createChallengerPelvisUVTexture() {
  if (_challengerPelvisTex) return _challengerPelvisTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark charcoal-slate cargo pants base (#2e323a)
  ctx.fillStyle = '#2e323a';
  ctx.fillRect(0, 0, 1024, 512);

  // Crimson-Red Belt (#c8242a) along top of pelvis (y = 18..118)
  ctx.fillStyle = '#c8242a';
  ctx.fillRect(0, 18, 1024, 100);

  // Top & Bottom Black Ink Borders of Belt
  ctx.strokeStyle = '#0e0e12';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(1024, 18);
  ctx.moveTo(0, 118);
  ctx.lineTo(1024, 118);
  ctx.stroke();

  // Matte-Silver Rectangular Belt Buckle at Center Front (x = 512, y = 14..122)
  ctx.fillStyle = '#9aa2ad';
  ctx.strokeStyle = '#0e0e12';
  ctx.lineWidth = 8;
  ctx.fillRect(466, 14, 92, 108);
  ctx.strokeRect(466, 14, 92, 108);
  // Inner buckle highlight
  ctx.fillStyle = '#bcc4cf';
  ctx.fillRect(474, 22, 76, 36);

  // Dark Charcoal Belt Loops around Waist
  [120, 290, 418, 606, 734, 904].forEach((lx) => {
    ctx.fillStyle = '#24272e';
    ctx.fillRect(lx - 13, 10, 26, 116);
    ctx.strokeRect(lx - 13, 10, 26, 116);
  });

  // Front Center Fly Seam & Angled Pocket Seams (x = 512)
  ctx.strokeStyle = '#121418';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(512, 118);
  ctx.lineTo(512, 410);
  ctx.moveTo(512, 130);
  ctx.lineTo(486, 140);
  ctx.lineTo(486, 360);
  ctx.quadraticCurveTo(486, 395, 512, 405);
  // Front slash pockets
  ctx.moveTo(410, 122);
  ctx.lineTo(310, 275);
  ctx.moveTo(614, 122);
  ctx.lineTo(714, 275);
  // Crotch V-creases
  ctx.moveTo(455, 395);
  ctx.lineTo(512, 445);
  ctx.lineTo(569, 395);
  ctx.stroke();

  // View 4 Back Center Seam & Shield-Shaped Rear Patch Pockets (x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.strokeStyle = '#0e1014';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 118);
    ctx.lineTo(0, 470);
    ctx.stroke();

    // Prominent Shield-Shaped Rear Patch Pockets with High-Contrast Stitching
    [-92, 92].forEach((px) => {
      ctx.fillStyle = '#22252c';
      ctx.strokeStyle = '#0e1014';
      ctx.lineWidth = 7.5;

      ctx.beginPath();
      ctx.moveTo(px - 58, 165);
      ctx.lineTo(px + 58, 165);
      ctx.lineTo(px + 54, 345);
      ctx.lineTo(px, 395);
      ctx.lineTo(px - 54, 345);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top reinforcement flap & pocket opening seam
      ctx.beginPath();
      ctx.moveTo(px - 56, 210);
      ctx.lineTo(px, 228);
      ctx.lineTo(px + 56, 210);
      ctx.stroke();

      // Interior double-stitch decorative V-seam
      ctx.strokeStyle = '#383e4a';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(px - 44, 250);
      ctx.lineTo(px, 310);
      ctx.lineTo(px + 44, 250);
      ctx.stroke();
    });
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _challengerPelvisTex = tex;
  return tex;
}

let _challengerPantsLegTex = null;
function createChallengerPantsLegUVTexture() {
  if (_challengerPantsLegTex) return _challengerPantsLegTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark charcoal-slate cargo pants (#2e323a)
  ctx.fillStyle = '#2e323a';
  ctx.fillRect(0, 0, 512, 512);

  // Darker cel-shaded inner/under-knee shadow folds
  ctx.fillStyle = '#22252b';
  ctx.fillRect(0, 0, 95, 512);
  ctx.fillRect(417, 0, 95, 512);

  // Ribbed Mid-Calf Elastic Cuff at bottom of pants (y = 435..512) in #3a3e47
  ctx.fillStyle = '#3a3e47';
  ctx.fillRect(0, 435, 512, 77);

  ctx.strokeStyle = '#121418';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 435);
  ctx.lineTo(512, 435);
  // Dynamic knee & calf cloth fold creases matching turnaround sheet
  ctx.moveTo(190, 225);
  ctx.quadraticCurveTo(256, 255, 330, 220);
  ctx.moveTo(165, 365);
  ctx.quadraticCurveTo(256, 398, 355, 360);
  ctx.moveTo(210, 405);
  ctx.lineTo(245, 435);
  ctx.moveTo(305, 405);
  ctx.lineTo(270, 435);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _challengerPantsLegTex = tex;
  return tex;
}

function createChallengerShinUVTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Base warm fair-tan skin tone
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 256, 512);

  // Soft lateral & medial cel shade gradients (x = 0..40 and x = 216..256)
  const leftGrad = ctx.createLinearGradient(0, 0, 50, 0);
  leftGrad.addColorStop(0, 'rgba(196, 122, 85, 0.55)');
  leftGrad.addColorStop(1, 'rgba(196, 122, 85, 0.0)');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, 50, 512);

  const rightGrad = ctx.createLinearGradient(256, 0, 206, 0);
  rightGrad.addColorStop(0, 'rgba(196, 122, 85, 0.55)');
  rightGrad.addColorStop(1, 'rgba(196, 122, 85, 0.0)');
  ctx.fillStyle = rightGrad;
  ctx.fillRect(206, 0, 50, 512);

  // Anterior tibial bone highlight band down the front center (x = 128)
  const centerGrad = ctx.createLinearGradient(114, 0, 142, 0);
  centerGrad.addColorStop(0, 'rgba(247, 203, 171, 0.0)');
  centerGrad.addColorStop(0.5, 'rgba(247, 203, 171, 0.45)');
  centerGrad.addColorStop(1, 'rgba(247, 203, 171, 0.0)');
  ctx.fillStyle = centerGrad;
  ctx.fillRect(114, 40, 28, 430);

  // Subtle ankle tendon crease accent marks near base
  ctx.strokeStyle = 'rgba(74, 38, 22, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(120, 440);
  ctx.lineTo(136, 440);
  ctx.moveTo(116, 460);
  ctx.lineTo(140, 460);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================================
// 3. GROUND-TRUTH 3D CHALLENGER MODEL (100% 4-ANGLE TURNAROUND PARITY)
//    Local Frame: Front = -Z, Back = +Z, Challenger Right Hip = +X (Viewer's Left in View 1)
//    Total Height: 2.00m (Soles at y = 0.00m, Hair Crown at y = 2.00m)
// ============================================================================
export function buildChallengerModel() {
  const root = new THREE.Group();

  // Grounded dynamic contact shadow decal beneath fighter
  const contactShadowDecal = createContactShadowDecal(1.2, 0.9, 0.50);
  contactShadowDecal.name = 'contact_shadow_decal';
  contactShadowDecal.position.set(0, 0.015, 0);
  root.add(contactShadowDecal);

  const hips = new THREE.Group();
  hips.position.y = 1.07; // Calibrated to exact 50-slice ground-truth belt/crotch height
  root.add(hips);

  const SKIN_HEX = 0xebb690;
  const CHARCOAL_HEX = 0x2b2e36;
  const PANTS_HEX = 0x2e323a;
  const CRIMSON_HEX = 0xc8242a;

  // --------------------------------------------------------------------------
  // 1. SCULPTED PELVIS, CRIMSON BELT & RIGHT-HIP (+X) GLOWING YELLOW CHAIN
  // --------------------------------------------------------------------------
  const pelvisSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [-0.090, 0.136, 0.078, 0.084, 0, 0.004, 2.20], // High natural crotch inseam split (y_world = 0.98m)
    [-0.050, 0.156, 0.094, 0.100, 0, 0.003, 2.25], // Hip joint level (y_world = 1.02m)
    [ 0.000, 0.166, 0.102, 0.108, 0, 0.002, 2.30], // Mid-hip curve (y_world = 1.07m)
    [ 0.045, 0.160, 0.094, 0.100, 0, 0.000, 2.30]  // Waistband & belt line (y_world = 1.115m)
  ];
  const pelvisGeo = createSculptedLoftGeometry(pelvisSlices, 32, true, true, true);
  const pelvisMesh = createHiFiMesh(pelvisGeo, 0xffffff, 0.032, createChallengerPelvisUVTexture());
  hips.add(pelvisMesh);

  // 3D Center Silver Belt Buckle Accent on Front (-Z)
  const buckleMesh = createHiFiMesh(
    new THREE.BoxGeometry(0.062, 0.046, 0.018),
    0xaab2bd,
    0.024,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.86, glintIntensity: 1.4 }
  );
  buckleMesh.position.set(0, 0.022, -0.094);
  hips.add(buckleMesh);

  // 6 3D Charcoal Belt Loops around Waistband
  const beltLoopCoords = [
    [-0.065, 0.022, -0.094, 0],            // Front-left
    [ 0.065, 0.022, -0.094, 0],            // Front-right
    [-0.165, 0.022,  0.000, Math.PI / 2],  // Side-left
    [ 0.165, 0.022,  0.000, Math.PI / 2],  // Side-right
    [-0.075, 0.022,  0.100, 0],            // Back-left
    [ 0.075, 0.022,  0.100, 0]             // Back-right
  ];
  beltLoopCoords.forEach(([lx, ly, lz, ry]) => {
    const loop = createHiFiMesh(
      new THREE.BoxGeometry(0.014, 0.048, 0.012),
      0x22252c,
      0.020
    );
    loop.position.set(lx, ly, lz);
    loop.rotation.y = ry;
    hips.add(loop);
  });

  // SIGNATURE GLOWING NEON-YELLOW HIP CHAIN ON CHALLENGER'S RIGHT HIP (Local +X ONLY)
  // Anchored at front-right belt loop (+X, -Z) and rear-right belt loop (+X, +Z)
  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.072, 0.022, -0.094), // Front-right belt loop anchor
    new THREE.Vector3(0.135, -0.015, -0.090),
    new THREE.Vector3(0.185, -0.065, -0.060),
    new THREE.Vector3(0.215, -0.130, -0.010), // Deepest catenary dip on outer thigh
    new THREE.Vector3(0.208, -0.145, 0.035),  // Hanging loop apex
    new THREE.Vector3(0.180, -0.080, 0.075),
    new THREE.Vector3(0.135, -0.020, 0.095),
    new THREE.Vector3(0.082, 0.022, 0.100)   // Rear-right belt loop anchor
  ]);
  const chainCoreGeo = new THREE.TubeGeometry(chainCurve, 36, 0.010, 8, false);
  const chainCoreMat = new THREE.MeshBasicMaterial({ color: 0xffff44 });
  const chainCore = new THREE.Mesh(chainCoreGeo, chainCoreMat);
  hips.add(chainCore);

  const chainGlowGeo = new THREE.TubeGeometry(chainCurve, 36, 0.022, 8, false);
  const chainGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const chainGlow = new THREE.Mesh(chainGlowGeo, chainGlowMat);
  hips.add(chainGlow);

  // Metallic Silver Attachment D-Rings at Anchors
  [-0.094, 0.100].forEach((zPos, idx) => {
    const dRing = createHiFiMesh(
      new THREE.TorusGeometry(0.011, 0.003, 8, 16),
      0xaab2bd,
      0.016
    );
    dRing.position.set(idx === 0 ? 0.072 : 0.082, 0.022, zPos);
    dRing.rotation.y = Math.PI / 2;
    hips.add(dRing);
  });

  // --------------------------------------------------------------------------
  // 2. SCULPTED LOFTED TORSO (BARE 6-PACK MIDRIFF + OPEN CROPPED BOMBER JACKET)
  // --------------------------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.04; // y_world = 1.11m
  hips.add(torso);

  const torsoSlices = [
    // Bare Athletic Midriff (y = 0.00..0.14 -> y_world = 1.11m..1.25m)
    [0.00, 0.150, 0.084, 0.090, 0, 0.000, 2.2],
    [0.07, 0.144, 0.082, 0.088, 0, 0.000, 2.2],
    [0.13, 0.148, 0.085, 0.090, 0, 0.000, 2.2],
    // Cropped Bomber Jacket Crimson Ribbed Waist Hem (y = 0.14..0.19 -> y_world = 1.25m..1.30m)
    [0.14, 0.168, 0.098, 0.104, 0, 0.002, 2.3],
    [0.19, 0.174, 0.102, 0.108, 0, 0.002, 2.3],
    // Athletic V-Tapered Bomber Jacket Chest (y = 0.20..0.48 -> y_world = 1.31m..1.59m)
    [0.28, 0.192, 0.112, 0.118, 0, 0.004, 2.3],
    [0.38, 0.212, 0.118, 0.124, 0, 0.006, 2.4],
    [0.45, 0.216, 0.112, 0.118, 0, 0.006, 2.4],
    // Shoulder Slope into Neck Base (y = 0.49..0.52 -> y_world = 1.60m..1.63m)
    [0.49, 0.165, 0.092, 0.098, 0, 0.004, 2.2],
    [0.52, 0.095, 0.075, 0.080, 0, 0.002, 2.0]
  ];
  const torsoGeo = createSculptedLoftGeometry(torsoSlices, 36, true, true, true);
  const torsoMesh = createHiFiMesh(torsoGeo, 0xffffff, 0.032, createChallengerTorsoUVTexture());
  torso.add(torsoMesh);

  // --------------------------------------------------------------------------
  // 3. WIDE V-FLARED STANDING COLLAR (CHARCOAL OUTER BACK/SIDE, CRIMSON INNER/FRONT V)
  // --------------------------------------------------------------------------
  const collarGroup = new THREE.Group();
  collarGroup.position.set(0, 0.48, 0.005); // y_world = 1.59m
  torso.add(collarGroup);

  // Overhauled Flared Lapel Collar angled upward at a 45-degree V-angle framing neck and jaw
  function buildFlaredCollarMesh(radiusScale, heightScale, openBase, openTop, colorHex, outlineThick) {
    const segsU = 32;
    const segsV = 6;
    const pos = [];
    const ind = [];
    for (let iv = 0; iv <= segsV; iv++) {
      const v = iv / segsV; // 0 at neck base (y=0), 1 at flared rim
      const halfOpenAngle = openBase + v * (openTop - openBase);

      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU;
        // theta: back nape is 0, sweeping to front lapel tips at ±(PI - halfOpenAngle)
        const theta = -Math.PI + halfOpenAngle + u * (Math.PI * 2 - halfOpenAngle * 2);
        const angleFrac = Math.abs(theta) / Math.PI; // 0 at back nape, ~0.75 at front lapel tips

        // Angle collar lapels upward at a natural V-angle framing neck, jawline, and clavicles (toned down ~20%)
        const lapelRise = 0.068 * Math.pow(angleFrac, 1.25);
        const y = v * (0.076 + lapelRise) * heightScale;
        const flareFactorX = 0.032 + 0.024 * Math.sin(angleFrac * Math.PI * 0.95);
        const rx = (0.084 + v * flareFactorX) * radiusScale;
        const rz = (0.084 + v * 0.022 * (1.0 - 0.25 * angleFrac)) * radiusScale;
        const drapeZ = -v * 0.024 * Math.pow(angleFrac, 1.20);

        const x = -Math.sin(theta) * rx;
        const z = Math.cos(theta) * rz + drapeZ;
        pos.push(x, y, z);
      }
    }
    const stride = segsU + 1;
    for (let iv = 0; iv < segsV; iv++) {
      for (let iu = 0; iu < segsU; iu++) {
        const a = iv * stride + iu;
        const b = a + 1;
        const d = (iv + 1) * stride + iu;
        const c = d + 1;
        ind.push(a, b, d);
        ind.push(b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(ind);
    g.computeVertexNormals();
    const mat = createCelMaterial(colorHex);
    mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (outlineThick > 0) {
      const o = new THREE.Mesh(g, createOutlineMaterial(outlineThick));
      o.castShadow = false;
      o.receiveShadow = false;
      m.add(o);
    }
    return m;
  }

  // Outer Charcoal Collar Shell covering Side Profile (View 3) and Back (View 4)
  const collarOuter = buildFlaredCollarMesh(1.00, 0.96, 0.44, 1.08, CHARCOAL_HEX, 0.024);
  collarGroup.add(collarOuter);

  // Inner Crimson Collar Lining & Front V-Lapel Edge (prominently visible in Front View 1 & 3/4 View 2!)
  const collarInner = buildFlaredCollarMesh(1.018, 1.00, 0.36, 1.02, CRIMSON_HEX, 0.018);
  collarInner.position.set(0, 0.003, -0.003);
  collarGroup.add(collarInner);

  // --------------------------------------------------------------------------
  // 4. SCULPTED ANIME HEAD, 3D EARS, NOSE & LAYERED CHESTNUT HAIR LOCKS
  // --------------------------------------------------------------------------
  // Lean Cylindrical Neck Column
  const neckSlices = [
    [-0.02, 0.058, 0.056, 0.058, 0, 0.005, 2.0],
    [0.06,  0.052, 0.052, 0.054, 0, 0.002, 2.0],
    [0.13,  0.054, 0.054, 0.056, 0, 0.000, 2.0]
  ];
  const neckMesh = createHiFiMesh(createSculptedLoftGeometry(neckSlices, 24, true, false, false), SKIN_HEX, 0.028);
  neckMesh.position.y = 0.49;
  torso.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.65, 0); // y_world = 1.76m (Eye line at y_world = 1.74m)
  torso.add(headGroup);

  // Sculpted Anime Head Loft: Sharp V-Jawline, Pointed Chin & Heroic Proportions
  // yMin = -0.110m, yMax = +0.116m, ySpan = 0.226m
  // Max Width = 2 * rx = 0.176m -> Width/Height Ratio = 0.176 / 0.226 = 0.779 (~0.78 Anime Standard)
  const headSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [-0.110, 0.016, 0.036, 0.024, 0.0, -0.042, 2.15], // 1. Sharp pointed anime chin tip (z_front = -0.078)
    [-0.082, 0.042, 0.058, 0.044, 0.0, -0.024, 2.15], // 2. Lower jawline V-taper (z_front = -0.082)
    [-0.055, 0.064, 0.076, 0.066, 0.0, -0.012, 2.10], // 3. Mouth & gonion angle (z_front = -0.088)
    [-0.026, 0.078, 0.088, 0.082, 0.0, -0.005, 2.05], // 4. Philtrum & upper jaw (z_front = -0.093)
    [ 0.004, 0.088, 0.095, 0.094, 0.0, -0.001, 2.05], // 5. Cheekbones, nose radix & eye level MIDLINE (z_front = -0.096)
    [ 0.038, 0.085, 0.090, 0.095, 0.0,  0.002, 2.00], // 6. Brow ridge & temple contour (z_front = -0.088)
    [ 0.076, 0.076, 0.078, 0.088, 0.0,  0.005, 2.00], // 7. Forehead & anterior hairline (z_front = -0.073)
    [ 0.116, 0.050, 0.052, 0.062, 0.0,  0.008, 2.00]  // 8. Top of cranium dome under hair (z_front = -0.044)
  ];
  const headGeo = createSculptedLoftGeometry(headSlices, 32, true, true, true);
  const headTexDetermined = createChallengerHeadUVTexture('determined');
  const headTexGrin = createChallengerHeadUVTexture('grin');
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.030, headTexDetermined);
  headGroup.add(headMesh);

  // Sleek 3D Anime Nose Bridge and Sharp Tip aligned with Midline Eye Placement
  // Zero back-face outline (0.0) so no vertical black stripe cuts down the front of the nose!
  const nosePts = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [0.000, 0.004, 0.005, 0.002, 0.0,  0.000, 2.0], // Philtrum base (y_head = -0.042)
    [0.016, 0.007, 0.022, 0.004, 0.0, -0.006, 2.2], // Sharp nose tip (y_head = -0.026, z_front = -0.122)
    [0.032, 0.005, 0.012, 0.003, 0.0, -0.003, 2.0], // Mid-bridge slope (y_head = -0.010)
    [0.046, 0.003, 0.004, 0.002, 0.0,  0.000, 2.0]  // Radix between eyes (y_head = +0.004)
  ];
  const noseMesh = createHiFiMesh(
    createSculptedLoftGeometry(nosePts, 16, true, true, true),
    SKIN_HEX,
    0.0
  );
  noseMesh.position.set(0.0, -0.042, -0.094);
  headGroup.add(noseMesh);

  // Sculpted 3D Ears on Left (-X) and Right (+X) centered at Midline Eye Level
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.030, 0.008, 0.014, 0.014, 0, 0, 2.0],
      [-0.010, 0.015, 0.022, 0.022, side * 0.004, 0, 2.0],
      [ 0.016, 0.017, 0.024, 0.024, side * 0.006, 0, 2.0],
      [ 0.032, 0.009, 0.015, 0.015, 0, 0, 2.0]
    ];
    const ear = createHiFiMesh(createSculptedLoftGeometry(earSlices, 12, true, true, true), SKIN_HEX, 0.022);
    ear.position.set(side * 0.088, 0.000, 0.005);
    ear.rotation.set(-0.06, side * -0.16, side * 0.10);
    headGroup.add(ear);
  });

  // --------------------------------------------------------------------------
  // 4. LAYERED CHESTNUT-BROWN ANIME HAIR SCULPT (5-LAYER ANIME SYSTEM)
  // --------------------------------------------------------------------------
  const hairGroup = new THREE.Group();
  headGroup.add(hairGroup);

  const HAIR_MID   = 0x784428;
  const HAIR_LIGHT = 0x965636;
  const HAIR_DARK  = 0x4e2a18;

  // Full-Volume Rounded Anime Hair Base Cap framing Occiput, Temples, and Crown
  const hairBaseSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p]
    [-0.055, 0.082, 0.018, 0.102, 0.0, 0.030, 2.0], // Nape of neck over collar
    [-0.005, 0.106, 0.036, 0.116, 0.0, 0.022, 2.05], // Lower occiput behind ears
    [ 0.048, 0.118, 0.058, 0.122, 0.0, 0.014, 2.05], // Mid occiput / temple level (recessed behind forehead skin!)
    [ 0.095, 0.122, 0.080, 0.122, 0.0, 0.008, 2.05], // Upper hairline (z_front = -0.072, behind 3D bangs!)
    [ 0.138, 0.112, 0.078, 0.110, 0.0, 0.006, 2.05], // Full parietal dome
    [ 0.172, 0.076, 0.052, 0.072, 0.0, 0.006, 2.00]  // Top crown cap
  ];
  const hairBaseMesh = createHiFiMesh(
    createSculptedLoftGeometry(hairBaseSlices, 32, true, true, true),
    HAIR_MID,
    0.024
  );
  hairGroup.add(hairBaseMesh);

  // Specialized Hair Lock Geometries (Sweeping 3D Forehead Bangs, Tousled Crown & Lateral Tufts)
  const geoBangCenter  = createCurvedHairLockGeometry(0.058, 0.048, 0.024,  0.005,  0.004);
  const geoBangMed     = createCurvedHairLockGeometry(0.064, 0.054, 0.026,  0.006, -0.006);
  const geoBangSide    = createCurvedHairLockGeometry(0.068, 0.052, 0.026,  0.006,  0.008);
  const geoSideburn    = createCurvedHairLockGeometry(0.108, 0.046, 0.028,  0.012, -0.008);
  const geoCrownTall   = createCurvedHairLockGeometry(0.104, 0.080, 0.046,  0.022,  0.006);
  const geoCrownWide   = createCurvedHairLockGeometry(0.096, 0.078, 0.044,  0.020, -0.008);
  const geoLateral     = createCurvedHairLockGeometry(0.102, 0.076, 0.040,  0.018,  0.020);
  const geoNapeShingle = createCurvedHairLockGeometry(0.094, 0.070, 0.028,  0.014,  0.004);

  // 31-Lock Master Specifications Array across 5 Functional Anime Layers
  // Strictly validated against tests/test_challenger_sculpt_verification.py bounds:
  // Layer 1 Bangs:   z < -0.07, y: 0.09..0.12, |x| < 0.08 (Count: 7)
  // Layer 2 Temple:  |x| >= 0.08, z <= 0.0 (Count: 4)
  // Layer 3 Crown:   y >= 0.13 (Count: 6)
  // Layer 4 Lateral: |x| >= 0.07, z >= 0.0, y < 0.13 (Count: 6)
  // Layer 5 Nape:    z >= 0.07, y < 0.13, |x| < 0.07 (Count: 8)
  const hairLockSpecs = [
    // ------------------------------------------------------------------------
    // LAYER 1: Forehead Bangs (7 overlapping 3D chestnut locks hugging upper forehead above eyebrows!)
    // Bounds: z < -0.07, y: 0.09..0.12, |x| < 0.08 (Count: 7)
    // ------------------------------------------------------------------------
    { geo: geoBangCenter, pos: [ 0.000, 0.106, -0.078], rot: [Math.PI + 0.04,  0.00,  0.12], col: HAIR_LIGHT, outline: 0.001 },
    { geo: geoBangMed,    pos: [ 0.022, 0.104, -0.077], rot: [Math.PI + 0.05, -0.10,  0.28], col: HAIR_MID,   outline: 0.001 },
    { geo: geoBangSide,   pos: [ 0.045, 0.100, -0.075], rot: [Math.PI + 0.05, -0.18,  0.40], col: HAIR_LIGHT, outline: 0.001 },
    { geo: geoBangSide,   pos: [ 0.066, 0.095, -0.072], rot: [Math.PI + 0.05, -0.26,  0.48], col: HAIR_DARK,  outline: 0.002 },
    { geo: geoBangMed,    pos: [-0.022, 0.104, -0.077], rot: [Math.PI + 0.05,  0.10, -0.26], col: HAIR_LIGHT, outline: 0.001 },
    { geo: geoBangSide,   pos: [-0.045, 0.100, -0.075], rot: [Math.PI + 0.05,  0.18, -0.38], col: HAIR_MID,   outline: 0.001 },
    { geo: geoBangSide,   pos: [-0.066, 0.095, -0.072], rot: [Math.PI + 0.05,  0.26, -0.48], col: HAIR_DARK,  outline: 0.002 },

    // ------------------------------------------------------------------------
    // LAYER 2: Temple Sideburn Locks (Framing temples and cheekbones in front of ears)
    // Bounds: |x| >= 0.08, z <= 0.0 (Count: 4)
    // ------------------------------------------------------------------------
    { geo: geoSideburn,  pos: [ 0.090, 0.076, -0.046], rot: [Math.PI + 0.05,  0.32,  0.14], col: HAIR_DARK,  outline: 0.014 },
    { geo: geoSideburn,  pos: [-0.090, 0.076, -0.046], rot: [Math.PI + 0.05, -0.32, -0.14], col: HAIR_DARK,  outline: 0.014 },
    { geo: geoBangSide,  pos: [ 0.086, 0.092, -0.060], rot: [Math.PI + 0.08,  0.28,  0.28], col: HAIR_MID,   outline: 0.014 },
    { geo: geoBangSide,  pos: [-0.086, 0.092, -0.060], rot: [Math.PI + 0.08, -0.28, -0.28], col: HAIR_LIGHT, outline: 0.014 },

    // ------------------------------------------------------------------------
    // LAYER 3: Full Tousled Crown Crest Tufts (Reaching y_world ≈ 2.00m without tall spiky horns)
    // Bounds: y >= 0.13 (Count: 6)
    // ------------------------------------------------------------------------
    { geo: geoCrownTall, pos: [ 0.000, 0.152, -0.018], rot: [0.32,  0.00,  0.06], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoCrownWide, pos: [ 0.048, 0.144, -0.012], rot: [0.36,  0.16, -0.42], col: HAIR_MID,   outline: 0.016 },
    { geo: geoCrownWide, pos: [-0.048, 0.144, -0.012], rot: [0.36, -0.16,  0.42], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoCrownWide, pos: [ 0.054, 0.136,  0.026], rot: [0.54,  0.18, -0.48], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoCrownWide, pos: [-0.054, 0.136,  0.026], rot: [0.54, -0.18,  0.48], col: HAIR_MID,   outline: 0.016 },
    { geo: geoCrownTall, pos: [ 0.000, 0.146,  0.024], rot: [0.48,  0.00, -0.05], col: HAIR_MID,   outline: 0.016 },

    // ------------------------------------------------------------------------
    // LAYER 4: Tousled Lateral Tufts (Natural feathered side silhouette)
    // Bounds: |x| >= 0.07, z >= 0.0, y < 0.13 (Count: 6)
    // ------------------------------------------------------------------------
    { geo: geoLateral,   pos: [ 0.092, 0.116,  0.008], rot: [2.32,  0.22, -0.44], col: HAIR_MID,   outline: 0.016 },
    { geo: geoLateral,   pos: [-0.092, 0.116,  0.008], rot: [2.32, -0.22,  0.44], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoLateral,   pos: [ 0.094, 0.088,  0.024], rot: [2.48,  0.24, -0.46], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoLateral,   pos: [-0.094, 0.088,  0.024], rot: [2.48, -0.24,  0.46], col: HAIR_MID,   outline: 0.016 },
    { geo: geoLateral,   pos: [ 0.088, 0.058,  0.044], rot: [2.62,  0.20, -0.38], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoLateral,   pos: [-0.088, 0.058,  0.044], rot: [2.62, -0.20,  0.38], col: HAIR_DARK,  outline: 0.016 },

    // ------------------------------------------------------------------------
    // LAYER 5: Occipital & Nape Locks (3-Tier Downward Shingle Cascade, z >= 0.07)
    // Bounds: z >= 0.07 (Count: 8)
    // ------------------------------------------------------------------------
    { geo: geoNapeShingle, pos: [ 0.000, 0.104,  0.082], rot: [2.68,  0.00,  0.00], col: HAIR_MID,   outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.038, 0.098,  0.078], rot: [2.70,  0.14, -0.24], col: HAIR_LIGHT, outline: 0.016 },
    { geo: geoNapeShingle, pos: [-0.038, 0.098,  0.078], rot: [2.70, -0.14,  0.24], col: HAIR_MID,   outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.000, 0.060,  0.090], rot: [2.82,  0.00,  0.00], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.040, 0.054,  0.086], rot: [2.84,  0.15, -0.26], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoNapeShingle, pos: [-0.040, 0.054,  0.086], rot: [2.84, -0.15,  0.26], col: HAIR_DARK,  outline: 0.016 },
    { geo: geoNapeShingle, pos: [ 0.030, 0.018,  0.084], rot: [2.94,  0.16, -0.28], col: HAIR_MID,   outline: 0.016 },
    { geo: geoNapeShingle, pos: [-0.030, 0.018,  0.084], rot: [2.94, -0.16,  0.28], col: HAIR_DARK,  outline: 0.016 }
  ];

  hairLockSpecs.forEach(({ geo, pos, rot, col, outline = 0.016 }) => {
    const lockMesh = createHiFiMesh(geo, col, outline);
    lockMesh.position.set(...pos);
    lockMesh.rotation.set(...rot);
    hairGroup.add(lockMesh);
  });

  // --------------------------------------------------------------------------
  // 5. ARTICULATED TWO-SEGMENT ARMS, 3/4 SLEEVES & 5-FINGER MMA GLOVES
  // --------------------------------------------------------------------------
  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 0.43, 0.005); // Preserved shoulder invariant

    // 1. Upper Arm Sleeve (Child of shoulder, CHARCOAL_HEX, smoothly rounded shoulder cap)
    const upperSleeveSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.260, 0.075, 0.073, 0.075, 0,             0, 2.05], // Elbow junction
      [-0.205, 0.081, 0.079, 0.081, 0,             0, 2.05], // Lower bicep cloth puff
      [-0.125, 0.080, 0.078, 0.080, 0,             0, 2.05], // Mid-bicep
      [-0.045, 0.084, 0.082, 0.084, 0,             0, 2.05], // Deltoid curve
      [-0.005, 0.078, 0.076, 0.078, -side * 0.014, 0, 2.00], // Upper shoulder rounding inward
      [ 0.030, 0.064, 0.064, 0.066, -side * 0.028, 0, 2.00], // Smooth deltoid dome slope
      [ 0.055, 0.044, 0.044, 0.046, -side * 0.042, 0, 2.00]  // Tucked seamlessly into jacket shoulder
    ];
    const upperSleeve = createHiFiMesh(
      createSculptedLoftGeometry(upperSleeveSlices, 20, true, true, true),
      CHARCOAL_HEX,
      0.030
    );
    shoulder.add(upperSleeve);

    // Outer Crimson Sleeve Racing Stripe (Child of shoulder, CRIMSON_HEX, follows rounded shoulder curve)
    const stripeSlices = [
      [-0.240, 0.010, 0.020, 0.020, side * 0.076, 0, 2.2],
      [-0.170, 0.010, 0.022, 0.022, side * 0.081, 0, 2.2],
      [-0.100, 0.010, 0.022, 0.022, side * 0.080, 0, 2.2],
      [-0.035, 0.010, 0.022, 0.022, side * 0.082, 0, 2.2],
      [ 0.005, 0.009, 0.020, 0.020, side * 0.062, 0, 2.1],
      [ 0.035, 0.008, 0.016, 0.016, side * 0.036, 0, 2.0]
    ];
    const sleeveStripe = createHiFiMesh(
      createSculptedLoftGeometry(stripeSlices, 14, true, true, true),
      CRIMSON_HEX,
      0.020
    );
    shoulder.add(sleeveStripe);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26; // Preserved elbow invariant
    shoulder.add(elbow);

    // 2. Forearm 3/4 Pushed-Up Sleeve (Bunched below elbow to y = -0.115, exposing bare lower half of forearm!)
    const forearmSleeveSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.115, 0.059, 0.057, 0.059, 0, 0, 2.0], // Bottom of ribbed cuff high on forearm
      [-0.100, 0.064, 0.062, 0.064, 0, 0, 2.0], // Top of ribbed cuff
      [-0.082, 0.077, 0.075, 0.077, 0, 0, 2.2], // Fold Ring 1 (lower cloth bulge)
      [-0.060, 0.067, 0.065, 0.067, 0, 0, 2.1], // Crease depression 1
      [-0.038, 0.078, 0.076, 0.078, 0, 0, 2.2], // Fold Ring 2 (middle cloth bulge)
      [-0.016, 0.069, 0.067, 0.069, 0, 0, 2.1], // Crease depression 2
      [ 0.004, 0.077, 0.075, 0.077, 0, 0, 2.2], // Fold Ring 3 (upper cloth bulge)
      [ 0.022, 0.074, 0.072, 0.074, 0, 0, 2.1]  // Elbow joint overlap
    ];
    const forearmSleeve = createHiFiMesh(
      createSculptedLoftGeometry(forearmSleeveSlices, 20, true, true, true),
      CHARCOAL_HEX,
      0.028
    );
    elbow.add(forearmSleeve);

    // Forearm Ribbed Cuff & Crimson Accent Ring ending at y = -0.115 (Child of elbow)
    const forearmCuff = createHiFiMesh(new THREE.CylinderGeometry(0.061, 0.058, 0.016, 18), 0x1e2028, 0.026);
    forearmCuff.position.y = -0.107;
    elbow.add(forearmCuff);

    const cuffCrimsonRim = createHiFiMesh(new THREE.CylinderGeometry(0.059, 0.057, 0.005, 18), CRIMSON_HEX, 0.020);
    cuffCrimsonRim.position.y = -0.115;
    elbow.add(cuffCrimsonRim);

    // 3. Bare Forearm Skin Loft (Child of elbow, clearly exposed across lower half of muscular forearm in all 4 views!)
    const bareForearmSlices = [
      [-0.242, 0.047, 0.045, 0.045, 0, 0, 2.0], // Wrist joint insertion (inside MMA glove)
      [-0.200, 0.055, 0.053, 0.053, 0, 0, 2.0], // Lower exposed bare skin forearm
      [-0.150, 0.060, 0.058, 0.058, 0, 0, 2.0], // Mid muscular forearm belly (prominently visible warm skin!)
      [-0.105, 0.057, 0.055, 0.055, 0, 0, 2.0]  // Tucked cleanly inside sleeve cuff at -0.115
    ];
    const bareForearm = createHiFiMesh(
      createSculptedLoftGeometry(bareForearmSlices, 18, true, true, true),
      SKIN_HEX,
      0.028
    );
    elbow.add(bareForearm);

    // 4. Strapped Black MMA Glove Wrist Cuff & Raised Wrap Band (Compact height at wrist leaving forearm bare)
    const wristCuff = createHiFiMesh(
      new THREE.CylinderGeometry(0.048, 0.051, 0.018, 18),
      0x1a1c22,
      0.026
    );
    wristCuff.position.y = -0.242;
    elbow.add(wristCuff);

    const wristStrap = createHiFiMesh(
      new THREE.CylinderGeometry(0.052, 0.053, 0.014, 18),
      0x242832,
      0.022
    );
    wristStrap.position.y = -0.242;
    elbow.add(wristStrap);

    const strapTab = createHiFiMesh(
      new THREE.BoxGeometry(0.015, 0.014, 0.008),
      0xaab2bd,
      0.016
    );
    strapTab.position.set(side * 0.051, -0.242, -0.006);
    elbow.add(strapTab);

    // 5. Articulated Hand Base (Preserved anchor at y = -0.275 relative to elbow)
    const hand = new THREE.Group();
    hand.position.y = -0.275;
    elbow.add(hand);

    // Contoured Main Palm Body
    const palm = createHiFiMesh(
      new THREE.BoxGeometry(0.074, 0.068, 0.040),
      0x1a1c22,
      0.028
    );
    hand.add(palm);

    // Contoured Padded Knuckle Protection Plate (Dorsal Metacarpals, -Z)
    const knucklePlate = createHiFiMesh(
      new THREE.BoxGeometry(0.076, 0.034, 0.016),
      0x282c36,
      0.022
    );
    knucklePlate.position.set(0, 0.010, -0.022);
    hand.add(knucklePlate);

    // 4 Segmented Knuckle Strike Cushions
    for (let k = 0; k < 4; k++) {
      const kx = -0.027 + k * 0.018;
      const kBump = createHiFiMesh(
        new THREE.BoxGeometry(0.014, 0.028, 0.008),
        0x343a46,
        0.018
      );
      kBump.position.set(kx, 0.010, -0.028);
      hand.add(kBump);
    }

    // 4 Articulated Fingers (Gloved Proximal + Exposed Skin Distal)
    const fingerSpecs = [
      { name: 'index',  gloveLen: 0.020, skinLen: 0.026, w: 0.015, d: 0.016, splay: -0.04 },
      { name: 'middle', gloveLen: 0.022, skinLen: 0.030, w: 0.016, d: 0.016, splay:  0.00 },
      { name: 'ring',   gloveLen: 0.021, skinLen: 0.027, w: 0.015, d: 0.016, splay:  0.05 },
      { name: 'pinky',  gloveLen: 0.017, skinLen: 0.021, w: 0.013, d: 0.014, splay:  0.10 }
    ];

    const fingerGroups = [];
    fingerSpecs.forEach((spec, i) => {
      // inner (-side) to outer (+side) positioning across palm
      const fx = -side * 0.0255 + i * (side * 0.0170);
      const fGroup = new THREE.Group();
      fGroup.position.set(fx, -0.033, -0.004);
      fGroup.rotation.z = side * spec.splay;

      // Gloved Proximal Phalanx
      const fGlove = createHiFiMesh(
        new THREE.BoxGeometry(spec.w, spec.gloveLen, spec.d),
        0x1a1c22,
        0.020
      );
      fGlove.position.y = -spec.gloveLen * 0.5;
      fGroup.add(fGlove);

      // Reinforced glove hem cuff line
      const fCuff = createHiFiMesh(
        new THREE.BoxGeometry(spec.w + 0.002, 0.004, spec.d + 0.002),
        0x2c303c,
        0.016
      );
      fCuff.position.y = -spec.gloveLen + 0.002;
      fGroup.add(fCuff);

      // Distal Phalanx Joint & Exposed Bare Skin Finger Tip
      const fSkinJoint = new THREE.Group();
      fSkinJoint.position.set(0, -spec.gloveLen, 0.002);
      fGroup.add(fSkinJoint);

      const fSkin = createHiFiMesh(
        new THREE.BoxGeometry(spec.w - 0.001, spec.skinLen, spec.d - 0.001),
        SKIN_HEX,
        0.018
      );
      fSkin.position.y = -spec.skinLen * 0.5;
      fSkinJoint.add(fSkin);

      // Natural relaxed finger curl
      fGroup.rotation.x = 0.20 + (3 - i) * 0.03;
      fSkinJoint.rotation.x = 0.26 + (3 - i) * 0.04;

      hand.add(fGroup);
      fingerGroups.push({ fGroup, fSkinJoint, spec });
    });

    // Articulated Thumb on Inner Radial Side (-side * X)
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(-side * 0.038, -0.008, -0.012);
    thumbGroup.rotation.set(0.20, side * 0.28, -side * 0.38);

    const thumbGlove = createHiFiMesh(
      new THREE.BoxGeometry(0.019, 0.024, 0.019),
      0x1a1c22,
      0.020
    );
    thumbGlove.position.y = -0.012;
    thumbGroup.add(thumbGlove);

    const thumbSkinJoint = new THREE.Group();
    thumbSkinJoint.position.set(side * 0.002, -0.024, 0.002);
    thumbGroup.add(thumbSkinJoint);

    const thumbSkin = createHiFiMesh(
      new THREE.BoxGeometry(0.017, 0.024, 0.017),
      SKIN_HEX,
      0.018
    );
    thumbSkin.position.y = -0.012;
    thumbSkinJoint.add(thumbSkin);

    hand.add(thumbGroup);

    // Biomechanical Fist Clenching / Relaxing API
    function setFistClenched(clenched) {
      fingerGroups.forEach(({ fGroup, fSkinJoint, spec }) => {
        if (clenched) {
          fGroup.rotation.x = 1.38;
          fGroup.rotation.z = side * spec.splay * 0.3;
          fSkinJoint.rotation.x = 1.48;
        } else {
          const idx = fingerSpecs.indexOf(spec);
          fGroup.rotation.x = 0.20 + (3 - idx) * 0.03;
          fGroup.rotation.z = side * spec.splay;
          fSkinJoint.rotation.x = 0.26 + (3 - idx) * 0.04;
        }
      });
      if (clenched) {
        thumbGroup.rotation.set(0.65, side * 0.58, -side * 0.82);
        thumbSkinJoint.rotation.set(0.40, side * 0.20, 0);
      } else {
        thumbGroup.rotation.set(0.20, side * 0.28, -side * 0.38);
        thumbSkinJoint.rotation.set(0, 0, 0);
      }
    }

    return { shoulder, elbow, hand, fist: hand, setFistClenched };
  }

  const leftArmObj = buildArm(-1);
  const rightArmObj = buildArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // --------------------------------------------------------------------------
  // 6. ARTICULATED LEGS: BAGGY 3/4 CARGO PANTS, BARE SHINS & HIGH-TOP SNEAKERS
  // --------------------------------------------------------------------------
  const pantsLegTex = createChallengerPantsLegUVTexture();
  const shinTex = createChallengerShinUVTexture();

  function buildLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.105, -0.05, 0); // Preserved hip joint invariant

    // 1. Sculpted Baggy Upper Thigh Loft (6 slices: tailored streetwear drape & knee folds)
    const thighSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.39, 0.098, 0.104, 0.108, side * 0.014,  0.000, 2.20], // Knee blend (gap = 4.2cm)
      [-0.33, 0.104, 0.112, 0.116, side * 0.018,  0.004, 2.25], // Bunched fabric fold (gap = 3.8cm)
      [-0.24, 0.106, 0.114, 0.118, side * 0.020,  0.002, 2.25], // Lower thigh fullness (gap = 3.8cm)
      [-0.14, 0.104, 0.110, 0.114, side * 0.018,  0.002, 2.25], // Mid-thigh pocket level (gap = 3.8cm)
      [-0.04, 0.100, 0.104, 0.108, side * 0.012,  0.002, 2.20], // Upper thigh drape (gap = 3.4cm)
      [ 0.02, 0.095, 0.096, 0.100, side * 0.006,  0.000, 2.15]  // Hip root below belt (gap = 3.2cm)
    ];
    const thighMesh = createHiFiMesh(
      createSculptedLoftGeometry(thighSlices, 24, true, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    hipJoint.add(thighMesh);

    // 2. 3D Outer-Thigh Flapped Bellows Cargo Pocket
    const pocketGroup = new THREE.Group();
    pocketGroup.position.set(side * 0.122, -0.19, 0.00);
    pocketGroup.rotation.z = side * -0.05;
    hipJoint.add(pocketGroup);

    const cargoBox = createHiFiMesh(new THREE.BoxGeometry(0.038, 0.150, 0.124), 0x242730, 0.026);
    pocketGroup.add(cargoBox);

    const centerPleat = createHiFiMesh(new THREE.BoxGeometry(0.042, 0.140, 0.016), 0x1c1e24, 0.020);
    pocketGroup.add(centerPleat);

    const cargoFlap = createHiFiMesh(new THREE.BoxGeometry(0.044, 0.038, 0.130), 0x2e323c, 0.024);
    cargoFlap.position.set(0, 0.065, 0);
    cargoFlap.rotation.x = -0.06;
    pocketGroup.add(cargoFlap);

    const flapSnap = createHiFiMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 12), 0x14161a, 0.016);
    flapSnap.position.set(0.022, 0.058, 0);
    flapSnap.rotation.z = Math.PI / 2;
    pocketGroup.add(flapSnap);

    // 3. Knee Joint at y = -0.38 (Preserved knee joint invariant)
    const kneeJoint = new THREE.Group();
    kneeJoint.position.set(side * 0.010, -0.38, 0);
    hipJoint.add(kneeJoint);

    // 4. Baggy Calf Drape & Ribbed Mid-Calf Elastic Cuff (6 slices)
    const calfSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.25, 0.066, 0.066, 0.068, 0.000,        0.002, 2.05], // Bottom rim of elastic cuff (y_world = 0.39m)
      [-0.20, 0.068, 0.068, 0.070, 0.000,        0.002, 2.05], // Top rim of elastic cuff (y_world = 0.44m)
      [-0.17, 0.092, 0.092, 0.096, side * 0.004, 0.004, 2.20], // Natural fabric gather overhang above cuff
      [-0.10, 0.098, 0.100, 0.104, side * 0.006, 0.004, 2.25], // Full baggy calf drape (gap = 4.6cm unrotated)
      [-0.03, 0.095, 0.098, 0.100, side * 0.004, 0.002, 2.20], // Upper calf below knee
      [ 0.02, 0.096, 0.098, 0.102, 0.000,        0.000, 2.15]  // Knee joint blend (rx = 0.096)
    ];
    const calfMesh = createHiFiMesh(
      createSculptedLoftGeometry(calfSlices, 24, true, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    kneeJoint.add(calfMesh);

    // 5. Exposed Lean Athletic Bare Lower Shin with Anatomical Taper (5 slices)
    const shinSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.43, 0.035, 0.038, 0.042, 0.000, 0.004, 2.05], // Ankle joint level / supramalleolar insertion
      [-0.38, 0.038, 0.042, 0.046, 0.000, 0.005, 2.10], // Lower shin / Achilles tendon taper
      [-0.33, 0.044, 0.048, 0.052, 0.000, 0.006, 2.15], // Mid shin (anterior tibial crest definition)
      [-0.28, 0.050, 0.052, 0.058, 0.000, 0.006, 2.15], // Upper calf belly (gastrocnemius volume)
      [-0.24, 0.052, 0.054, 0.060, 0.000, 0.004, 2.10]  // Exits cuff interior
    ];
    const lowerShin = createHiFiMesh(
      createSculptedLoftGeometry(shinSlices, 20, true, true, true),
      0xffffff,
      0.024,
      shinTex
    );
    kneeJoint.add(lowerShin);

    // 6. Articulated Ankle Joint at y = -0.42 (Preserved ankle invariant)
    const ankleJoint = new THREE.Group();
    ankleJoint.position.set(0, -0.42, 0.006);
    kneeJoint.add(ankleJoint);

    // 7. Multi-Panel Retro High-Top Sneaker (Preserving All 6 Tiers)
    const shoeGroup = new THREE.Group();
    ankleJoint.add(shoeGroup);

    // A. Flat White Rubber Outsole
    const soleSlices = [
      [-0.220, 0.073, 0.176, 0.090, 0, -0.002, 2.5],
      [-0.184, 0.075, 0.179, 0.092, 0, -0.002, 2.5]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(soleSlices, 24, true, true, true), 0xf4f5f7, 0.030));

    // Foxing Pinstripe
    const soleRimSlices = [
      [-0.186, 0.076, 0.180, 0.093, 0, -0.002, 2.5],
      [-0.176, 0.074, 0.176, 0.090, 0, -0.002, 2.5]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(soleRimSlices, 24, true, false, false), 0x14151a, 0.020));

    // B. White Rubber Shell Toe-Box Cap
    const toeCapSlices = [
      [-0.180, 0.071, 0.088, 0.012, 0, -0.092, 2.2],
      [-0.145, 0.065, 0.080, 0.012, 0, -0.088, 2.1],
      [-0.115, 0.048, 0.052, 0.010, 0, -0.078, 2.0]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(toeCapSlices, 20, true, false, true), 0xf4f5f7, 0.026));

    // C. Sculpted Black Canvas Upper & Quarters (closeTop = false for open collar)
    const upperSlices = [
      [-0.180, 0.071, 0.158, 0.086, 0, -0.002, 2.2],
      [-0.130, 0.067, 0.126, 0.082, 0,  0.002, 2.1],
      [-0.075, 0.060, 0.082, 0.076, 0,  0.010, 2.05],
      [-0.015, 0.057, 0.066, 0.070, 0,  0.012, 2.05],
      [ 0.015, 0.054, 0.052, 0.065, 0,  0.015, 2.05]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(upperSlices, 24, true, false, false), 0x1c1e24, 0.030));

    // D. Crimson Heel Counter
    const redHeelSlices = [
      [-0.178, 0.072, 0.005, 0.088, 0, 0.010, 2.2],
      [-0.120, 0.068, 0.005, 0.084, 0, 0.012, 2.1],
      [-0.075, 0.062, 0.005, 0.078, 0, 0.014, 2.1]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(redHeelSlices, 18, true, false, false), CRIMSON_HEX, 0.026));

    // E. Crimson High-Top Ankle Collar Band (closeTop = false for open collar)
    const redCollarSlices = [
      [-0.035, 0.056, 0.058, 0.068, 0, 0.012, 2.10],
      [ 0.000, 0.054, 0.054, 0.066, 0, 0.014, 2.10],
      [ 0.020, 0.052, 0.050, 0.064, 0, 0.016, 2.10]
    ];
    shoeGroup.add(createHiFiMesh(createSculptedLoftGeometry(redCollarSlices, 20, true, false, false), CRIMSON_HEX, 0.028));

    // F. Vertical Black Heel Spine Webbing Strip
    const heelSpine = createHiFiMesh(new THREE.BoxGeometry(0.018, 0.165, 0.010), 0x14151a, 0.018);
    heelSpine.position.set(0, -0.085, 0.088);
    shoeGroup.add(heelSpine);

    // G. Crimson Eyestay Overlays
    [-1, 1].forEach((s) => {
      const eyestay = createHiFiMesh(new THREE.BoxGeometry(0.018, 0.135, 0.022), CRIMSON_HEX, 0.020);
      eyestay.position.set(s * 0.030, -0.080, -0.072);
      eyestay.rotation.x = -0.48;
      shoeGroup.add(eyestay);
    });

    // Padded Sneaker Tongue
    const tongue = createHiFiMesh(new THREE.BoxGeometry(0.046, 0.160, 0.016), CRIMSON_HEX, 0.022);
    tongue.position.set(0, -0.040, -0.058);
    tongue.rotation.x = -0.46;
    shoeGroup.add(tongue);

    // 5 Crisp Pure White Criss-Cross Laces
    const laceCoords = [
      { y: -0.128, z: -0.106, w: 0.052, rot:  0.16 },
      { y: -0.106, z: -0.094, w: 0.050, rot: -0.16 },
      { y: -0.084, z: -0.082, w: 0.048, rot:  0.16 },
      { y: -0.062, z: -0.070, w: 0.046, rot: -0.16 },
      { y: -0.040, z: -0.058, w: 0.044, rot:  0.16 }
    ];
    laceCoords.forEach(({ y, z, w, rot }) => {
      const lace = createHiFiMesh(new THREE.BoxGeometry(w, 0.009, 0.012), 0xf8f9fb, 0.016);
      lace.position.set(0, y, z);
      lace.rotation.x = -0.46;
      lace.rotation.z = rot;
      shoeGroup.add(lace);
    });

    // Top Tied Lace Knot Accent
    const laceKnot = createHiFiMesh(new THREE.BoxGeometry(0.024, 0.014, 0.014), 0xf8f9fb, 0.016);
    laceKnot.position.set(0, -0.022, -0.052);
    laceKnot.rotation.x = -0.46;
    shoeGroup.add(laceKnot);

    return { hipJoint, kneeJoint, ankleJoint, shoeGroup };
  }

  const leftLegObj = buildLeg(-1);
  const rightLegObj = buildLeg(1);
  hips.add(leftLegObj.hipJoint);
  hips.add(rightLegObj.hipJoint);

  function setExpression(expr = 'determined') {
    headMesh.material.map = expr === 'grin' ? headTexGrin : headTexDetermined;
    headMesh.material.needsUpdate = true;
    const clench = expr === 'grin';
    leftArmObj.setFistClenched(clench);
    rightArmObj.setFistClenched(clench);
  }

  return {
    root,
    contactShadowDecal,
    hips,
    torso,
    headGroup,
    leftArm: leftArmObj.shoulder,
    leftElbow: leftArmObj.elbow,
    leftHand: leftArmObj.hand,
    rightArm: rightArmObj.shoulder,
    rightElbow: rightArmObj.elbow,
    rightHand: rightArmObj.hand,
    leftLeg: leftLegObj.hipJoint,
    leftKnee: leftLegObj.kneeJoint,
    leftAnkle: leftLegObj.ankleJoint,
    rightLeg: rightLegObj.hipJoint,
    rightKnee: rightLegObj.kneeJoint,
    rightAnkle: rightLegObj.ankleJoint,
    setExpression
  };
}

// ============================================================================
// 3B. SIGNATURE CRESCENT-SWEEP TAN/GOLD KICK SMEAR RIBBON + FLYING PEBBLES
//     (Drawn on high-res 1024x1024 canvas planes on the RIGHT side of Challenger!)
// ============================================================================
function createCrescentKickSmearTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, 1024, 1024);

  // Outer warm golden-tan crescent sweep from bottom-left (180, 910)
  // bowing out to the right (860, 520) and curling up to top-right kick impact (690, 95)!
  const grad = ctx.createLinearGradient(180, 910, 740, 110);
  grad.addColorStop(0.0, 'rgba(218, 152, 84, 0.0)');
  grad.addColorStop(0.14, 'rgba(228, 168, 96, 0.85)');
  grad.addColorStop(0.55, 'rgba(246, 202, 132, 0.94)');
  grad.addColorStop(0.88, 'rgba(242, 214, 158, 0.92)');
  grad.addColorStop(1.0, 'rgba(246, 224, 175, 0.90)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  // Inner concave edge of the kick smear
  ctx.moveTo(150, 910);
  ctx.bezierCurveTo(460, 760, 650, 450, 620, 105);
  // Top rounded tip at the sneaker
  ctx.quadraticCurveTo(695, 70, 755, 130);
  // Outer convex edge of the kick smear
  ctx.bezierCurveTo(910, 430, 680, 810, 150, 910);
  ctx.closePath();
  ctx.fill();

  // Outer dark comic ink rim + inner speed-lines
  ctx.strokeStyle = '#18100c';
  ctx.lineCap = 'round';

  // Outer edge ink line
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(210, 895);
  ctx.bezierCurveTo(660, 795, 895, 430, 748, 132);
  ctx.stroke();

  // Inner speed-line arcs
  [
    { x0: 240, y0: 870, cx1: 580, cy1: 750, cx2: 790, cy2: 430, x1: 695, y1: 120, w: 6 },
    { x0: 290, y0: 835, cx1: 540, cy1: 710, cx2: 725, cy2: 435, x1: 658, y1: 115, w: 5 },
    { x0: 350, y0: 780, cx1: 515, cy1: 660, cx2: 675, cy2: 440, x1: 632, y1: 135, w: 4 }
  ].forEach(({ x0, y0, cx1, cy1, cx2, cy2, x1, y1, w }) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPersistentKickSmearRig(parentGroup) {
  const smearGroup = new THREE.Group();
  parentGroup.add(smearGroup);

  const smearTex = createCrescentKickSmearTexture();
  const arcMat = new THREE.MeshBasicMaterial({
    map: smearTex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    depthWrite: false
  });

  const planeGeo = new THREE.PlaneGeometry(2.35, 2.35);

  const primaryRibbon = new THREE.Mesh(planeGeo, arcMat);
  primaryRibbon.position.set(0.18, 1.12, -0.14);
  primaryRibbon.rotation.set(0.04, -0.08, 0.04);
  smearGroup.add(primaryRibbon);

  const secondaryRibbon = new THREE.Mesh(planeGeo, arcMat);
  secondaryRibbon.position.set(0.23, 1.09, -0.22);
  secondaryRibbon.rotation.set(0.06, -0.12, 0.06);
  secondaryRibbon.scale.setScalar(0.95);
  smearGroup.add(secondaryRibbon);

  // 14 Cel-Shaded Flying Asphalt Pebbles suspended around the kick arc!
  const pebbles = [];
  const pebbleGeo = new THREE.DodecahedronGeometry(0.055, 0);
  const pebbleSpecs = [
    { pos: [-1.26, 0.36, 0.24], s: [1.25, 0.85, 1.10], rot: [0.45, 1.20, 0.35] },
    { pos: [-1.06, 0.48, 0.22], s: [0.80, 0.65, 0.85], rot: [0.90, 0.35, 1.15] },
    { pos: [-0.85, 0.60, 0.18], s: [0.75, 0.60, 0.70], rot: [1.25, 0.80, 0.25] },
    { pos: [-0.80, 0.78, 0.15], s: [0.90, 0.75, 0.80], rot: [0.60, 1.40, 0.50] },
    { pos: [0.82, 0.42, 0.18], s: [0.95, 0.70, 0.85], rot: [0.75, 0.55, 1.05] },
    { pos: [1.05, 0.60, 0.16], s: [1.10, 0.80, 0.95], rot: [1.10, 0.95, 0.40] },
    { pos: [1.32, 0.82, 0.14], s: [1.30, 0.90, 1.15], rot: [0.35, 0.85, 1.30] },
    { pos: [1.24, 1.04, 0.12], s: [1.15, 0.85, 1.00], rot: [0.80, 1.15, 0.60] },
    { pos: [1.14, 1.26, 0.11], s: [0.70, 0.60, 0.75], rot: [1.35, 0.40, 0.90] },
    { pos: [1.02, 1.46, 0.12], s: [1.05, 0.80, 0.90], rot: [0.50, 1.05, 1.25] },
    { pos: [0.94, 1.62, 0.10], s: [0.85, 0.70, 0.80], rot: [1.00, 0.65, 0.45] },
    { pos: [0.84, 1.78, 0.22], s: [1.00, 0.75, 0.90], rot: [0.70, 1.30, 0.80] },
    { pos: [0.80, 1.96, 0.08], s: [0.90, 0.70, 0.85], rot: [1.15, 0.50, 1.10] },
    { pos: [0.76, 2.08, 0.28], s: [0.75, 0.65, 0.70], rot: [0.40, 1.25, 0.65] }
  ];

  pebbleSpecs.forEach(({ pos, s, rot }, idx) => {
    const p = createHiFiMesh(pebbleGeo, 0x6b5848, 0.08);
    p.position.set(...pos);
    p.scale.set(...s);
    if (rot) p.rotation.set(...rot);
    smearGroup.add(p);
    pebbles.push({ mesh: p, basePos: new THREE.Vector3(...pos), phase: idx * 1.1 });
  });

  return { smearGroup, primaryRibbon, secondaryRibbon, arcMat, pebbles };
}

// ============================================================================
// 4. BOOMBOX SOUND-SYSTEM TRUCK LEVEL 3 (WITH EMBEDDED DJ KRONOS IN BOOTH!)
// ============================================================================
let _marqueeTex = null;
function createMarqueeTexture() {
  if (_marqueeTex) return _marqueeTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#06040c';
  ctx.fillRect(0, 0, 1024, 256);

  ctx.strokeStyle = '#ff3898';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 1004, 236);

  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 976, 208);

  ctx.font = '900 122px "Chakra Petch", Impact, sans-serif';
  ctx.textBaseline = 'middle';

  ctx.shadowColor = '#24e5ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#52f2ff';
  ctx.fillText('KRONOS', 64, 132);

  ctx.shadowColor = '#ff2a85';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ff4da6';
  ctx.fillText('BEATS', 575, 132);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _marqueeTex = tex;
  return tex;
}

let _truckSubBannerTex = null;
function createTruckSubBannerTexture() {
  if (_truckSubBannerTex) return _truckSubBannerTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#18142c';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.strokeStyle = '#382e5c';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 1016, 120);

  ctx.fillStyle = '#e02828';
  ctx.beginPath();
  ctx.arc(58, 64, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  ctx.arc(58, 64, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '800 38px "Chakra Petch", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d8f0ff';
  ctx.fillText('BOOMBOX SOUND-SYSTEM TRUCK', 112, 66);

  ctx.fillStyle = '#ff9838';
  ctx.fillText('LEVEL 3', 825, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _truckSubBannerTex = tex;
  return tex;
}

// ============================================================================
// PROCEDURAL CANVAS TEXTURE GENERATORS FOR BOSS DJ KRONOS
// ============================================================================

/**
 * Generates high-res Cyber/Polynesian Tribal Tattoo Sleeve Texture (512x512)
 * Designed to wrap around cylindrical arm & deltoid geometries.
 */
export function createKronosTattooTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Warm bronze skin base (#8d5534)
  ctx.fillStyle = '#8d5534';
  ctx.fillRect(0, 0, 512, 512);

  // Inky dark charcoal/black tattoo lines (#120e16)
  ctx.fillStyle = '#120e16';
  ctx.strokeStyle = '#120e16';
  ctx.lineWidth = 5;

  // 1. Deltoid Band: Polynesian Spearhead Chevrons (Top row)
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x + 16, 55);
    ctx.lineTo(x + 32, 20);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x + 16, 95);
    ctx.lineTo(x + 32, 60);
    ctx.fill();
  }

  // 2. Mid-Bicep: Concentric Audio/Vinyl Wave Spirals & Sawtooth Bands
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 180, 50, 0, Math.PI * 1.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 180, 32, 0, Math.PI * 1.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(384, 180, 50, Math.PI * 0.4, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(384, 180, 32, Math.PI * 0.5, Math.PI * 2);
  ctx.stroke();

  // 3. Cybernetic Circuit Bus Traces with Junction Nodes (Center)
  ctx.lineWidth = 4;
  const circuitPaths = [
    [[0, 240], [140, 240], [180, 280], [330, 280], [370, 240], [512, 240]],
    [[0, 310], [90, 310], [130, 350], [380, 350], [420, 310], [512, 310]],
    [[60, 240], [60, 310]],
    [[256, 280], [256, 380]],
    [[450, 240], [450, 310]]
  ];
  circuitPaths.forEach((pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  });

  // Circular circuit via nodes
  const nodes = [[140, 240], [370, 240], [130, 350], [380, 350], [256, 380], [60, 275], [450, 275]];
  nodes.forEach(([nx, ny]) => {
    ctx.beginPath();
    ctx.arc(nx, ny, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d5534';
    ctx.beginPath();
    ctx.arc(nx, ny, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#120e16';
  });

  // 4. Lower Forearm: Geometric Enata Diamond Band & Solid Cuffs
  ctx.fillRect(0, 420, 512, 18);
  ctx.fillRect(0, 475, 512, 24);

  for (let x = 0; x < 512; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x + 18, 442);
    ctx.lineTo(x + 28, 456);
    ctx.lineTo(x + 18, 470);
    ctx.lineTo(x + 8, 456);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Generates Solid Gold Vinyl Record Medallion Texture (512x512)
 * Features concentric vinyl audio grooves and gold record center label.
 */
export function createGoldVinylDiscTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Rich Metallic Gold Radial Sheen Base (saturated deep gold)
  const grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 250);
  grad.addColorStop(0.0, '#ffd84d');
  grad.addColorStop(0.30, '#f0b828');
  grad.addColorStop(0.65, '#c98e16');
  grad.addColorStop(1.0, '#784805');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();

  // 32 Concentric Circular Vinyl Micro-Grooves with Deep Contrast
  for (let r = 72; r < 246; r += 5.5) {
    const isMajor = r % 22 === 0;
    ctx.strokeStyle = isMajor ? 'rgba(30, 16, 4, 0.90)' : 'rgba(50, 28, 8, 0.65)';
    ctx.lineWidth = isMajor ? 2.8 : 1.6;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer Rim Bevel Ring
  ctx.strokeStyle = '#ffe480';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(256, 256, 246, 0, Math.PI * 2);
  ctx.stroke();

  // Center Record Label: Outer Gold Ring (radius = 68px)
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.arc(256, 256, 68, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#181216';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Inner Crimson Vinyl Center Label (radius = 56px)
  ctx.fillStyle = '#8f141c';
  ctx.beginPath();
  ctx.arc(256, 256, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f5c238';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Micro-Text on Center Label
  ctx.fillStyle = '#ffd54f';
  ctx.font = '900 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DJ KRONOS', 256, 234);
  ctx.font = '700 8.5px sans-serif';
  ctx.fillText('33⅓ RPM • MASTER', 256, 247);

  // Spindle Hole Brass Grommet & Center Spindle Hole
  ctx.fillStyle = '#f5c238';
  ctx.beginPath();
  ctx.arc(256, 256, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#100c10';
  ctx.beginPath();
  ctx.arc(256, 256, 12, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const createVinylMedallionTexture = createGoldVinylDiscTexture;

/**
 * Generates Crimson Duster Gold Flame Trim Texture (512x256)
 * Comic hot rod flame tongues licking upward from the bottom hem.
 */
export function createFlameTrimTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Deep crimson coat base (#a81824)
  ctx.fillStyle = '#a81824';
  ctx.fillRect(0, 0, 512, 256);

  // Outer Gold Comic Flame Tongues (#ffd233) with black contour outline
  ctx.fillStyle = '#ffd233';
  ctx.strokeStyle = '#140c12';
  ctx.lineWidth = 6;

  function drawFlameTongues(yBase, hScale) {
    ctx.beginPath();
    ctx.moveTo(0, 256);
    const tongueCount = 8;
    const w = 512 / tongueCount;
    for (let i = 0; i < tongueCount; i++) {
      const x0 = i * w;
      const xMid = x0 + w * 0.5;
      const x1 = x0 + w;
      const flameTipY = yBase - ((i % 2 === 0) ? 90 : 60) * hScale;
      ctx.quadraticCurveTo(x0 + w * 0.2, yBase, xMid - 4, flameTipY + 25);
      ctx.quadraticCurveTo(xMid, flameTipY, xMid + 6, flameTipY + 25);
      ctx.quadraticCurveTo(x1 - w * 0.2, yBase, x1, 256);
    }
    ctx.lineTo(512, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw primary gold flame tier
  drawFlameTongues(220, 1.4);

  // Inner Electric Yellow Core Tier (#fff380)
  ctx.fillStyle = '#fff380';
  ctx.lineWidth = 3;
  drawFlameTongues(235, 0.9);

  // Bottom gold hem seam
  ctx.fillStyle = '#ffd233';
  ctx.fillRect(0, 242, 512, 14);
  ctx.strokeRect(0, 242, 512, 14);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// ============================================================================
// UPGRADED BOSS DJ KRONOS PROCEDURAL 3D MODEL
// 100% 1:1 Parity with boss_dj_kronos_turnaround_1792120739087.jpg!
// Local Frame: Front = +Z, Back = -Z, Kronos Right Side = -X (Viewer's Left in View 1)
// ============================================================================

export function createBossVestEmblemTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 1024);
  drawKronosCrownAndTurntable(ctx, 512, 512, 1.25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export const createKronosBackEmblemTexture = createBossVestEmblemTexture;

function drawKronosCrownAndTurntable(ctx, cx, cy, scale = 1.0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // 1. Five-Point Metallic Gold Crown at Top (y = -135)
  ctx.save();
  ctx.translate(0, -115);

  ctx.fillStyle = '#f5c238';
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';

  // Crown 5-spike body
  ctx.beginPath();
  ctx.moveTo(-92, 26);
  ctx.lineTo(-108, -32);
  ctx.lineTo(-56, 8);
  ctx.lineTo(-34, -54);
  ctx.lineTo(0, 10);
  ctx.lineTo(0, -72);
  ctx.lineTo(0, 10);
  ctx.lineTo(34, -54);
  ctx.lineTo(56, 8);
  ctx.lineTo(108, -32);
  ctx.lineTo(92, 26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Tip pearls on the 5 crown points
  [
    [-108, -36],
    [-34, -58],
    [0, -76],
    [34, -58],
    [108, -36]
  ].forEach(([px, py]) => {
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Crown base band
  ctx.fillStyle = '#e0a828';
  ctx.fillRect(-92, 24, 184, 18);
  ctx.strokeRect(-92, 24, 184, 18);
  ctx.restore();

  // 2. Isometric Gold DJ Turntable Deck Below Crown (y = +45)
  ctx.save();
  ctx.translate(0, 48);

  // Trapezoidal isometric deck plinth (wider at bottom than top, matching View 4 reference!)
  ctx.fillStyle = '#e8b532';
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 7.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-124, -82);
  ctx.lineTo(124, -82);
  ctx.lineTo(142, 74);
  ctx.lineTo(-142, 74);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Front 3D thickness lip of turntable plinth
  ctx.fillStyle = '#b88418';
  ctx.beginPath();
  ctx.moveTo(-142, 74);
  ctx.lineTo(142, 74);
  ctx.lineTo(136, 94);
  ctx.lineTo(-136, 94);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Concentric Gold Vinyl Platter on Left/Center of Deck
  ctx.fillStyle = '#f5c842';
  ctx.beginPath();
  ctx.ellipse(-18, -4, 82, 66, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  [64, 48, 34].forEach((rx) => {
    ctx.strokeStyle = '#181216';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(-18, -4, rx, rx * 0.80, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Dark Crimson Center Vinyl Label & Gold Spindle
  ctx.fillStyle = '#7a1419';
  ctx.beginPath();
  ctx.ellipse(-18, -4, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f5c842';
  ctx.beginPath();
  ctx.arc(-18, -4, 5, 0, Math.PI * 2);
  ctx.fill();

  // Tonearm Pivot & S-Shaped Gold Tonearm on Right of Platter
  ctx.fillStyle = '#b88418';
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(82, -46, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(82, -46);
  ctx.quadraticCurveTo(76, 4, 34, 28);
  ctx.stroke();

  ctx.strokeStyle = '#ffe680';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Pitch Fader Slot on Bottom-Right
  ctx.strokeStyle = '#141014';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(106, -10);
  ctx.lineTo(114, 52);
  ctx.stroke();
  ctx.fillStyle = '#141014';
  ctx.fillRect(98, 16, 24, 10);

  ctx.restore();
  ctx.restore();
}

let _kronosHeadTex = null;
function createKronosHeadUVTexture() {
  if (_kronosHeadTex) return _kronosHeadTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Exact Linear Y-UV Calibration for 12-Slice Master Head (yMin = -0.150, yMax = +0.160, ySpan = 0.310):
  // - Chin tip (y = -0.150) -> py = 1024
  // - Broad square goatee (y = -0.150..-0.095) -> py = 842..1024
  // - Mouth & Lips (y = -0.065) -> py = 743
  // - Mustache & Philtrum (y = -0.045..-0.030) -> py = 644..677
  // - Sculpted Nose Bridge (y = -0.030..+0.010) -> py = 496..628
  // - Vertical Midline Sunglasses (y = +0.012) -> py = 490
  // - Eyebrows & Brow Ridge (y = +0.035) -> py = 413
  // - Forehead Razor Line-Up (y = +0.080) -> py = 265
  // - High-Top Flat-Top Fade Crown (y = +0.160) -> py = 0

  // 1. Rich Warm Bronze Skin Base (#b87348)
  ctx.fillStyle = '#b87348';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle cheekbone / forehead warm bronze highlight (#ce885b)
  const faceGlow = ctx.createRadialGradient(512, 510, 25, 512, 530, 240);
  faceGlow.addColorStop(0, '#ce885b');
  faceGlow.addColorStop(0.65, '#c27b4f');
  faceGlow.addColorStop(1, 'rgba(184, 115, 72, 0)');
  ctx.fillStyle = faceGlow;
  ctx.fillRect(240, 250, 544, 540);

  // 2. HIGH-TOP FLAT-TOP FADE HAIR & TEMPLE/NAPE SKIN-FADE GRADIENT (Top of UV py = 0..450)
  // Deep jet-black crown transitioning through dark espresso to warm bronze skin
  const fadeGrad = ctx.createLinearGradient(0, 180, 0, 450);
  fadeGrad.addColorStop(0.0, '#101014');
  fadeGrad.addColorStop(0.35, '#16141a');
  fadeGrad.addColorStop(0.65, '#2c1b16');
  fadeGrad.addColorStop(0.85, '#5c3320');
  fadeGrad.addColorStop(0.95, '#8c5334');
  fadeGrad.addColorStop(1.0, 'rgba(184, 115, 72, 0.0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, 0, 1024, 450);

  // High-top hair side and back texture (stippled graphic-novel hair density)
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, 1024, 250);

  // Crisp horizontal front forehead hairline & razor-sharp temple drops (x = 380..644, py = 265..375)
  ctx.fillStyle = '#c47c50';
  ctx.fillRect(380, 265, 264, 195);

  // Crisp black comic line along razor-sharp front box line-up
  ctx.strokeStyle = '#101014';
  ctx.lineWidth = 6.0;
  ctx.beginPath();
  ctx.moveTo(380, 265);
  ctx.lineTo(644, 265); // Horizontal brow line-up
  ctx.moveTo(380, 265);
  ctx.lineTo(380, 370); // Right temple vertical drop
  ctx.moveTo(644, 265);
  ctx.lineTo(644, 370); // Left temple vertical drop
  ctx.stroke();

  // Forehead expression crease lines & furrowed brow (py = 330..400)
  ctx.strokeStyle = '#723e20';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(436, 335);
  ctx.quadraticCurveTo(512, 326, 588, 335);
  ctx.moveTo(452, 365);
  ctx.quadraticCurveTo(512, 358, 572, 365);
  // Vertical frown ticks
  ctx.moveTo(496, 372);
  ctx.lineTo(502, 406);
  ctx.moveTo(528, 372);
  ctx.lineTo(522, 406);
  ctx.stroke();

  // Thick Angled Dark Eyebrows above Sunglasses Brow Bar (py = 405..428, x = 512 ± 92)
  ctx.fillStyle = '#121014';
  [-1, 1].forEach((dir) => {
    const bx = 512 + dir * 92;
    ctx.beginPath();
    ctx.moveTo(bx - dir * 54, 412);
    ctx.quadraticCurveTo(bx, 388, bx + dir * 56, 404);
    ctx.lineTo(bx + dir * 50, 422);
    ctx.quadraticCurveTo(bx, 406, bx - dir * 48, 425);
    ctx.closePath();
    ctx.fill();
  });

  // Cheekbone & Nasolabial Contour Creases (x = 512 ± 115, py = 560..710)
  ctx.strokeStyle = '#743d22';
  ctx.lineWidth = 5.0;
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(512 + dir * 118, 560);
    ctx.quadraticCurveTo(512 + dir * 96, 635, 512 + dir * 86, 700);
    ctx.stroke();
  });

  // Broad Sculpted Nose Bridge & Nostril Wings (x = 512, py = 500..635)
  ctx.fillStyle = '#ce885b';
  ctx.fillRect(488, 500, 48, 120);
  ctx.strokeStyle = '#381c0e';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(482, 515);
  ctx.lineTo(466, 615);
  ctx.quadraticCurveTo(489, 636, 512, 636);
  ctx.quadraticCurveTo(535, 636, 558, 615);
  ctx.lineTo(542, 515);
  ctx.stroke();

  // 3. MANICURED CONTOURED CIRCLE-BEARD GOATEE, MUSTACHE & CONFIDENT BOSS SMIRK
  // Feathered groomed edge stubble fringe + tapered anatomical chin wrap (eliminating solid black block)
  ctx.save();
  // Soft feathered edge stubble fringe (shadowBlur creates organic hair falloff)
  ctx.shadowColor = 'rgba(18, 16, 20, 0.65)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#121014';

  // Manicured outer goatee contour: gracefully curves around mouth and tapers inward to chin apex
  ctx.beginPath();
  // Mustache top with subtle philtrum notch (py = 686)
  ctx.moveTo(512, 686);
  ctx.quadraticCurveTo(565, 672, 624, 712); // Right mustache arch
  // Commissure lateral bar down past corner of mouth (tapers naturally: x = 624 -> 632 -> 620)
  ctx.quadraticCurveTo(632, 765, 620, 830);
  // Tapered chin wrap hugging jaw curve inward toward chin apex (py = 976, x = 512)
  ctx.quadraticCurveTo(602, 915, 554, 962);
  ctx.quadraticCurveTo(512, 976, 470, 962); // Smoothly rounded chin apex
  // Left chin wrap curving up along jaw
  ctx.quadraticCurveTo(422, 915, 404, 830);
  // Left commissure lateral bar up to mustache
  ctx.quadraticCurveTo(392, 765, 400, 712);
  ctx.quadraticCurveTo(459, 672, 512, 686); // Left mustache arch
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Anatomical Mandibular Jawline Stubble Gradient following jaw ramus to sideburns
  [-1, 1].forEach((dir) => {
    const startX = 512 + dir * 105;
    const endX = 512 + dir * 260;
    const stubbleGrad = ctx.createLinearGradient(startX, 860, endX, 810);
    stubbleGrad.addColorStop(0.0, 'rgba(18, 16, 20, 0.55)');
    stubbleGrad.addColorStop(0.4, 'rgba(32, 22, 24, 0.30)');
    stubbleGrad.addColorStop(0.8, 'rgba(72, 42, 30, 0.12)');
    stubbleGrad.addColorStop(1.0, 'rgba(184, 115, 72, 0.0)');
    ctx.fillStyle = stubbleGrad;

    ctx.beginPath();
    ctx.moveTo(512 + dir * 105, 845);
    ctx.quadraticCurveTo(512 + dir * 175, 878, 512 + dir * 260, 836);
    ctx.lineTo(512 + dir * 260, 786);
    ctx.quadraticCurveTo(512 + dir * 175, 818, 512 + dir * 105, 795);
    ctx.closePath();
    ctx.fill();
  });

  // Inner cutout around mouth showing warm bronze skin, framed cleanly (py = 724..832)
  ctx.fillStyle = '#b87348';
  ctx.beginPath();
  ctx.moveTo(436, 730);
  ctx.quadraticCurveTo(512, 716, 588, 730); // Under mustache
  ctx.quadraticCurveTo(598, 765, 584, 824); // Right inner margin
  ctx.quadraticCurveTo(512, 838, 440, 824); // Bottom chin skin channel
  ctx.quadraticCurveTo(426, 765, 436, 730); // Left inner margin
  ctx.closePath();
  ctx.fill();

  // Manicured Soul Patch below lower lip (py = 796..854)
  // Clean tapered landing strip with bronze skin channels on left and right
  ctx.fillStyle = '#121014';
  ctx.beginPath();
  ctx.moveTo(492, 796);
  ctx.lineTo(532, 796);
  ctx.quadraticCurveTo(530, 826, 518, 854);
  ctx.lineTo(506, 854);
  ctx.quadraticCurveTo(494, 826, 492, 796);
  ctx.closePath();
  ctx.fill();

  // Sculpted Upper Bronze Lip (py = 736..760)
  ctx.fillStyle = '#945232';
  ctx.beginPath();
  ctx.moveTo(434, 758);
  ctx.quadraticCurveTo(512, 736, 590, 758);
  ctx.quadraticCurveTo(512, 766, 434, 758);
  ctx.closePath();
  ctx.fill();

  // Full Sculpted Lower Bronze Lip (py = 758..798)
  ctx.fillStyle = '#c8784c';
  ctx.beginPath();
  ctx.moveTo(440, 760);
  ctx.quadraticCurveTo(512, 766, 584, 760);
  ctx.quadraticCurveTo(566, 796, 512, 798);
  ctx.quadraticCurveTo(458, 796, 440, 760);
  ctx.closePath();
  ctx.fill();

  // Confident Boss Smirk Mouth Parting Ink Line (slight upward curl at right corner x = 588)
  ctx.strokeStyle = '#180d08';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(432, 760);
  ctx.quadraticCurveTo(512, 752, 574, 758);
  ctx.lineTo(588, 752); // Smug upward boss smirk curl!
  ctx.stroke();

  // Back of neck / occipital skin creases & clean nape skin fade (View 4, x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    // Nape hair fade arc
    const napeGrad = ctx.createLinearGradient(0, 300, 0, 520);
    napeGrad.addColorStop(0.0, '#101014');
    napeGrad.addColorStop(0.5, '#2c1b16');
    napeGrad.addColorStop(0.85, '#8c5334');
    napeGrad.addColorStop(1.0, 'rgba(184, 115, 72, 0)');
    ctx.fillStyle = napeGrad;
    ctx.beginPath();
    ctx.ellipse(0, 320, 160, 180, 0, 0, Math.PI * 2);
    ctx.fill();

    // Muscular neck trapezius crease lines
    ctx.strokeStyle = '#723e20';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-58, 680);
    ctx.lineTo(-44, 860);
    ctx.moveTo(58, 680);
    ctx.lineTo(44, 860);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosHeadTex = tex;
  return tex;
}

let _kronosTorsoTex = null;
function createKronosTorsoUVTexture() {
  if (_kronosTorsoTex) return _kronosTorsoTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Base Muscular Warm Bronze Skin (#b87348) for Center Front Channel (x = 436..588)
  ctx.fillStyle = '#b87348';
  ctx.fillRect(0, 0, 1024, 1024);

  // Smooth, subtle sternal cleft between pectorals (soft shadow, eliminating dark cross artifact)
  const sternalGlow = ctx.createLinearGradient(0, 180, 0, 420);
  sternalGlow.addColorStop(0.0, 'rgba(110, 52, 22, 0.0)');
  sternalGlow.addColorStop(0.5, 'rgba(110, 52, 22, 0.35)');
  sternalGlow.addColorStop(1.0, 'rgba(110, 52, 22, 0.55)');
  ctx.fillStyle = sternalGlow;
  ctx.fillRect(508, 180, 8, 230);

  // Linea Alba Groove below pectorals down to navel
  const albaGrad = ctx.createLinearGradient(0, 410, 0, 840);
  albaGrad.addColorStop(0.0, '#753918');
  albaGrad.addColorStop(0.5, '#6b3316');
  albaGrad.addColorStop(1.0, '#542812');
  ctx.fillStyle = albaGrad;

  ctx.beginPath();
  ctx.moveTo(508, 410);
  ctx.lineTo(516, 410);
  ctx.lineTo(518, 540);
  ctx.lineTo(517, 665);
  ctx.lineTo(512, 825);
  ctx.lineTo(507, 665);
  ctx.lineTo(506, 540);
  ctx.closePath();
  ctx.fill();

  // Pectoral Muscle Plates (Upper Chest, y = 180..415)
  // Warm golden-bronze upper pectoral highlights
  [-1, 1].forEach((dir) => {
    const px = 512 + dir * 42;
    const pecGlow = ctx.createRadialGradient(px, 280, 15, px, 290, 75);
    pecGlow.addColorStop(0, '#d89162');
    pecGlow.addColorStop(0.75, 'rgba(216, 145, 98, 0.45)');
    pecGlow.addColorStop(1, 'rgba(184, 115, 72, 0)');
    ctx.fillStyle = pecGlow;
    ctx.beginPath();
    ctx.ellipse(px, 295, 46, 68, dir * 0.12, 0, Math.PI * 2);
    ctx.fill();
  });

  // Contoured Sub-Pectoral Shadow Creases (y = 390..425)
  [-1, 1].forEach((dir) => {
    ctx.fillStyle = '#6e3314';
    ctx.beginPath();
    ctx.moveTo(512, 396);
    ctx.quadraticCurveTo(512 + dir * 32, 422, 512 + dir * 68, 412);
    ctx.quadraticCurveTo(512 + dir * 78, 404, 512 + dir * 88, 388);
    ctx.quadraticCurveTo(512 + dir * 68, 396, 512 + dir * 32, 408);
    ctx.closePath();
    ctx.fill();

    // Crisp comic ink contour along lower pec margin
    ctx.strokeStyle = '#180d08';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(512, 395);
    ctx.quadraticCurveTo(512 + dir * 32, 420, 512 + dir * 68, 410);
    ctx.quadraticCurveTo(512 + dir * 78, 402, 512 + dir * 88, 386);
    ctx.stroke();
  });

  // 3 Distinct Rows of 6-Pack Abdominals (y = 430..815)
  const abRows = [
    { yTop: 436, h: 102, w: 56, rx: 12, hlH: 52 }, // Row 1 (upper abs)
    { yTop: 554, h: 104, w: 58, rx: 14, hlH: 54 }, // Row 2 (mid abs)
    { yTop: 672, h: 108, w: 54, rx: 16, hlH: 56 }  // Row 3 (lower abs)
  ];

  abRows.forEach(({ yTop, h, w, rx, hlH }) => {
    [-1, 1].forEach((dir) => {
      const cx = 512 + dir * (w * 0.5 + 7);
      const left = cx - w * 0.5;

      // 1. Deep bronze drop shadow under and around each block
      ctx.fillStyle = '#6e3314';
      ctx.beginPath();
      ctx.roundRect(left - 2, yTop + h - 22, w + 4, 24, [0, 0, rx, rx]);
      ctx.fill();

      // 2. Base ab block contour with soft bronze midtone
      ctx.fillStyle = '#c07a4e';
      ctx.beginPath();
      ctx.roundRect(left, yTop + 4, w, h - 8, rx);
      ctx.fill();

      // 3. Warm golden-bronze volumetric highlight on upper face
      const abGlow = ctx.createLinearGradient(0, yTop + 4, 0, yTop + hlH);
      abGlow.addColorStop(0.0, '#e09a6c');
      abGlow.addColorStop(0.7, '#cf8758');
      abGlow.addColorStop(1.0, 'rgba(207, 135, 88, 0)');
      ctx.fillStyle = abGlow;
      ctx.beginPath();
      ctx.roundRect(left + 3, yTop + 6, w - 6, hlH, [rx - 2, rx - 2, 4, 4]);
      ctx.fill();

      // 4. Crisp black comic ink contour outline for each ab block
      ctx.strokeStyle = '#180d08';
      ctx.lineWidth = 5.0;
      ctx.beginPath();
      ctx.roundRect(left, yTop + 4, w, h - 8, rx);
      ctx.stroke();
    });
  });

  // Deep Navel / Belly Button Teardrop Crease
  ctx.fillStyle = '#140a06';
  ctx.beginPath();
  ctx.ellipse(512, 664, 7, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6e3314';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(512, 660, 9, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  // Lateral Serratus Anterior & Oblique Muscle Ribs (x = 420..440 and x = 584..604)
  [-1, 1].forEach((dir) => {
    [480, 560, 640].forEach((sy) => {
      ctx.strokeStyle = '#6e3314';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(512 + dir * 68, sy);
      ctx.lineTo(512 + dir * 88, sy + 18);
      ctx.stroke();

      ctx.strokeStyle = '#180d08';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(512 + dir * 70, sy + 2);
      ctx.lineTo(512 + dir * 86, sy + 18);
      ctx.stroke();
    });
  });

  // 2. Sleeveless Crimson-Red Bomber Vest Shell (#b81d24)
  // Covers x = 0..438 and x = 586..1024 from top (y = 0) down to gold waist hem (y = 825)
  ctx.fillStyle = '#b81d24';
  ctx.fillRect(0, 0, 438, 825);
  ctx.fillRect(586, 0, 438, 825);

  // Darker crimson cel-shaded side panels & vertical seam lines (around x = 256 and x = 768)
  ctx.fillStyle = '#92151c';
  ctx.fillRect(205, 80, 102, 745);
  ctx.fillRect(717, 80, 102, 745);

  // 3. Metallic Gold Vertical Front Zipper Trim Borders (x = 420..442 and x = 582..604)
  const goldGradV = ctx.createLinearGradient(0, 0, 0, 825);
  goldGradV.addColorStop(0.0, '#ffe885');
  goldGradV.addColorStop(0.5, '#f0bc32');
  goldGradV.addColorStop(1.0, '#c89218');
  ctx.fillStyle = goldGradV;
  ctx.fillRect(422, 65, 22, 865);
  ctx.fillRect(580, 65, 22, 865);

  ctx.strokeStyle = '#140e10';
  ctx.lineWidth = 6.5;
  ctx.strokeRect(422, 65, 22, 865);
  ctx.strokeRect(580, 65, 22, 865);

  // Horizontal zipper tooth ticks along the gold zipper trim
  ctx.lineWidth = 3;
  for (let zy = 95; zy < 915; zy += 22) {
    ctx.beginPath();
    ctx.moveTo(424, zy);
    ctx.lineTo(442, zy);
    ctx.moveTo(582, zy);
    ctx.lineTo(600, zy);
    ctx.stroke();
  }

  // 4. Segmented Metallic Gold Bottom Waistband Hem (y = 825..925, Open at Center Front x = 442..582!)
  const goldGradH = ctx.createLinearGradient(0, 825, 0, 925);
  goldGradH.addColorStop(0.0, '#ffe885');
  goldGradH.addColorStop(0.55, '#f2be35');
  goldGradH.addColorStop(1.0, '#b88214');
  ctx.fillStyle = goldGradH;
  ctx.fillRect(0, 825, 444, 98);
  ctx.fillRect(580, 825, 444, 98);

  ctx.strokeStyle = '#140e10';
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(0, 825);
  ctx.lineTo(444, 825);
  ctx.moveTo(580, 825);
  ctx.lineTo(1024, 825);
  ctx.moveTo(0, 923);
  ctx.lineTo(444, 923);
  ctx.moveTo(580, 923);
  ctx.lineTo(1024, 923);
  ctx.stroke();

  // Vertical ribbed seam lines on the gold waistband hem
  ctx.lineWidth = 4;
  [180, 320, 412, 612, 704, 844].forEach((wx) => {
    ctx.beginPath();
    ctx.moveTo(wx, 825);
    ctx.lineTo(wx, 923);
    ctx.stroke();
  });

  // 5. Angled Metallic Gold Slash Pocket Welts on Front Left & Right Panels (Views 1, 2, 3)
  [
    { x0: 382, y0: 565, x1: 318, y1: 715 }, // Viewer's left panel angled gold welt
    { x0: 642, y0: 565, x1: 706, y1: 715 }  // Viewer's right panel angled gold welt
  ].forEach(({ x0, y0, x1, y1 }) => {
    ctx.strokeStyle = '#140e10';
    ctx.lineWidth = 24;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.strokeStyle = '#f5c438';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  });

  // 6. Contoured Gold Armhole Trim along Left (x = 768) & Right (x = 256) Shoulder Seams
  [256, 768].forEach((ax) => {
    ctx.fillStyle = '#181418';
    ctx.beginPath();
    ctx.ellipse(ax, 235, 36, 138, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 18;
    ctx.strokeStyle = '#140e10';
    ctx.stroke();

    ctx.lineWidth = 11;
    ctx.strokeStyle = '#f5c438';
    ctx.stroke();
  });

  // 7. VIEW 4 BACK EMBLEM: Metallic Gold 5-Point Crown + Isometric Gold DJ Turntable Deck
  drawOnBackSeam(ctx, () => {
    // Subtle crimson cloth drape folds near bottom of back vest
    ctx.strokeStyle = '#6e0d12';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-160, 770);
    ctx.quadraticCurveTo(0, 805, 160, 770);
    ctx.stroke();

    // CENTERED PROPORTIONAL METALLIC GOLD CROWN + TURNTABLE EMBLEM
    // Compensates for 1.70:1 cylindrical UV horizontal stretch so the crown and turntable render un-squashed!
    ctx.save();
    ctx.translate(0, 435);
    ctx.scale(1.12, 1.66);
    drawKronosCrownAndTurntable(ctx, 0, 0, 1.0);
    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosTorsoTex = tex;
  return tex;
}

let _kronosPelvisTex = null;
function createKronosPelvisUVTexture() {
  if (_kronosPelvisTex) return _kronosPelvisTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark Slate-Charcoal Cargo Pants Base (#313e45)
  ctx.fillStyle = '#313e45';
  ctx.fillRect(0, 0, 1024, 512);

  // Clean Fitted Dark-Slate Waistband at Top (y = 12..112, NO gold buckle, NO hip chain!)
  ctx.fillStyle = '#29343b';
  ctx.fillRect(0, 12, 1024, 100);

  ctx.strokeStyle = '#11161a';
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(1024, 12);
  ctx.moveTo(0, 112);
  ctx.lineTo(1024, 112);
  ctx.stroke();

  // Center Front Waistband Button & Fly Seam (x = 512)
  ctx.fillStyle = '#9aa4ad';
  ctx.beginPath();
  ctx.arc(512, 62, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Dark Slate Belt Loops
  [140, 310, 435, 589, 714, 884].forEach((lx) => {
    ctx.fillStyle = '#242e34';
    ctx.fillRect(lx - 12, 8, 24, 110);
    ctx.strokeRect(lx - 12, 8, 24, 110);
  });

  // Front Fly J-Stitch, Crotch Creases & Slash Pockets (x = 512)
  ctx.strokeStyle = '#11161a';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(512, 112);
  ctx.lineTo(512, 425);
  ctx.moveTo(512, 112);
  ctx.lineTo(484, 112);
  ctx.lineTo(484, 355);
  ctx.quadraticCurveTo(484, 395, 512, 405);
  // Front slash pockets
  ctx.moveTo(418, 115);
  ctx.lineTo(315, 285);
  ctx.moveTo(606, 115);
  ctx.lineTo(709, 285);
  // Crotch fold lines
  ctx.moveTo(445, 385);
  ctx.lineTo(512, 445);
  ctx.lineTo(579, 385);
  ctx.stroke();

  // View 4 Back Center Seam & Shield-Shaped Rear Patch Pockets (x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.strokeStyle = '#11161a';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(0, 112);
    ctx.lineTo(0, 475);
    ctx.stroke();

    [-92, 92].forEach((px) => {
      ctx.fillStyle = '#283339';
      ctx.beginPath();
      ctx.moveTo(px - 56, 165);
      ctx.lineTo(px + 56, 165);
      ctx.lineTo(px + 50, 335);
      ctx.lineTo(px, 382);
      ctx.lineTo(px - 50, 335);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(px - 54, 212);
      ctx.lineTo(px, 228);
      ctx.lineTo(px + 54, 212);
      ctx.stroke();
    });
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosPelvisTex = tex;
  return tex;
}

let _kronosPantsLegTex = null;
function createKronosPantsLegUVTexture() {
  if (_kronosPantsLegTex) return _kronosPantsLegTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Dark Slate-Charcoal Cargo Pants (#313e45)
  ctx.fillStyle = '#313e45';
  ctx.fillRect(0, 0, 512, 512);

  // Deeper slate inner/side shadow folds (#232d33)
  ctx.fillStyle = '#232d33';
  ctx.fillRect(0, 0, 96, 512);
  ctx.fillRect(416, 0, 96, 512);

  // Expressive Comic Cloth Crease Lines at Knee & Gathered Lower Ankle Cuffs
  ctx.strokeStyle = '#11161a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  // Knee folds
  ctx.moveTo(175, 195);
  ctx.quadraticCurveTo(256, 232, 340, 190);
  ctx.moveTo(195, 245);
  ctx.quadraticCurveTo(256, 268, 325, 240);
  // Lower shin baggy chevrons gathered into boot collar
  ctx.moveTo(155, 385);
  ctx.quadraticCurveTo(256, 428, 355, 380);
  ctx.moveTo(175, 445);
  ctx.quadraticCurveTo(256, 482, 335, 440);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _kronosPantsLegTex = tex;
  return tex;
}

export function buildKronosBossModel() {
  const root = new THREE.Group();
  root.scale.setScalar(0.58); // Calibrated ~0.58x scale in DJ booth; 1.0x in studio turnaround & Wave 3 ring fight!

  // Grounded dynamic contact shadow decal beneath fighter
  const contactShadowDecal = createContactShadowDecal(1.6, 1.2, 0.52);
  contactShadowDecal.name = 'contact_shadow_decal';
  contactShadowDecal.position.set(0, 0.015, 0);
  root.add(contactShadowDecal);

  const hips = new THREE.Group();
  hips.position.y = 1.04; // Calibrated to 50-slice ground-truth waist/crotch landmark (Total H = 1.94m)
  root.add(hips);

  const SKIN_COLOR = 0xb87348;
  const VEST_RED = 0xb81d24;
  const GOLD_TRIM = 0xf5c238;
  const PANTS_COLOR = 0x313e45;
  const BOOT_BLACK = 0x16181e;
  const SOLE_WHITE = 0xe8e6e0;

  // --------------------------------------------------------------------------
  // 1. SCULPTED PELVIS & CLEAN DARK-SLATE CARGO WAISTBAND (NO GOLD BELT/CHAIN)
  // --------------------------------------------------------------------------
  const pelvisSlices = [
    [-0.12, 0.174, 0.106, 0.114, 0, 0, 2.2],
    [-0.05, 0.180, 0.110, 0.118, 0, 0, 2.3],
    [0.01,  0.176, 0.106, 0.112, 0, 0, 2.3],
    [0.05,  0.170, 0.102, 0.106, 0, 0, 2.3]
  ];
  const pelvisGeo = createSculptedLoftGeometry(pelvisSlices, 32, false, true, true);
  const pelvisMesh = createHiFiMesh(pelvisGeo, 0xffffff, 0.032, createKronosPelvisUVTexture());
  hips.add(pelvisMesh);

  // --------------------------------------------------------------------------
  // 2. V-TAPERED MUSCULAR TORSO & SLEEVELESS CRIMSON-AND-GOLD BOMBER VEST
  // --------------------------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0.03; // y_world = 1.07m
  hips.add(torso);

  const torsoSlices = [
    // Gold Ribbed Waistband Hem at Bottom of Vest (y = 0.00..0.06 -> y_world = 1.07m..1.13m)
    [0.00, 0.176, 0.106, 0.112, 0.000, 0.000, 2.30],
    [0.06, 0.182, 0.112, 0.118, 0.000, 0.002, 2.30],
    // Athletic V-Tapered Lower & Mid Torso (y = 0.15..0.36 -> y_world = 1.22m..1.43m)
    [0.15, 0.198, 0.122, 0.126, 0.000, 0.004, 2.32],
    [0.26, 0.222, 0.134, 0.136, 0.000, 0.007, 2.35],
    [0.36, 0.242, 0.148, 0.142, 0.000, 0.010, 2.38],
    // Maximum Pectoral Chest Projection (y = 0.43 -> y_world = 1.50m)
    [0.43, 0.248, 0.154, 0.144, 0.000, 0.012, 2.40],
    // Upper Chest & Clavicular Slope (y = 0.48..0.57 -> y_world = 1.55m..1.64m)
    [0.48, 0.246, 0.146, 0.140, 0.000, 0.010, 2.40],
    [0.52, 0.210, 0.126, 0.126, 0.000, 0.005, 2.25],
    [0.55, 0.150, 0.102, 0.106, 0.000, 0.002, 2.15],
    [0.57, 0.105, 0.084, 0.088, 0.000, 0.000, 2.00]
  ];
  const torsoGeo = createSculptedLoftGeometry(torsoSlices, 36, false, true, true);
  const torsoMesh = createHiFiMesh(torsoGeo, 0xffffff, 0.034, createKronosTorsoUVTexture());
  torso.add(torsoMesh);

  const vest = new THREE.Group();
  torso.add(vest);

  // High Stand-Up Popped Crimson Collar with Thick Metallic Gold Top Rim (hugging neck closely)
  function buildContouredBossCollar(yBot, yTop, rScale, colorHex, outlineThick) {
    const segsU = 32;
    const pos = [];
    const ind = [];
    const openHalf = 0.44; // Open V at Front (+Z)
    for (let iv = 0; iv <= 1; iv++) {
      const y = iv === 0 ? yBot : yTop;
      // Controlled radii: hugs neck closely, no outward flaring horns!
      const rx = (0.122 + iv * 0.008) * rScale;
      const rz = (0.098 + iv * 0.006) * rScale;
      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU;
        const theta = openHalf + u * (Math.PI * 2 - openHalf * 2);
        const x = Math.sin(theta) * rx;
        const z = Math.cos(theta) * rz;
        pos.push(x, y, z);
      }
    }
    const stride = segsU + 1;
    for (let iu = 0; iu < segsU; iu++) {
      const a = iu;
      const b = iu + 1;
      const d = stride + iu;
      const c = d + 1;
      ind.push(a, b, d);
      ind.push(b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(ind);
    g.computeVertexNormals();
    const mat = createCelMaterial(colorHex);
    mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    if (outlineThick > 0) {
      const o = new THREE.Mesh(g, createOutlineMaterial(outlineThick));
      o.castShadow = false;
      o.receiveShadow = false;
      m.add(o);
    }
    return m;
  }

  const crimsonCollar = buildContouredBossCollar(0.505, 0.585, 1.0, VEST_RED, 0.028);
  vest.add(crimsonCollar);

  const goldCollarRim = buildContouredBossCollar(0.575, 0.605, 1.015, GOLD_TRIM, 0.024);
  vest.add(goldCollarRim);

  // 3D Metallic Gold-Trimmed Armhole Borders encircling Shoulder Openings
  [-1, 1].forEach((side) => {
    const armholeBorder = new THREE.Group();
    armholeBorder.position.set(side * 0.228, 0.445, 0.005);
    armholeBorder.rotation.set(0, side * (Math.PI * 0.5), side * 0.22);

    const torusGeo = new THREE.TorusGeometry(0.076, 0.010, 12, 28);
    torusGeo.scale(1.0, 1.16, 0.96); // Contoured elliptical rim hugging vest armhole & deltoid slope
    const goldBorderMesh = createHiFiMesh(torusGeo, GOLD_TRIM, 0.020);
    armholeBorder.add(goldBorderMesh);

    vest.add(armholeBorder);
  });

  // --------------------------------------------------------------------------
  // 3. NECK DJ HEADPHONES, GOLD CURB CHAIN & PROPORTIONED GOLD VINYL MEDALLION
  // --------------------------------------------------------------------------
  // Chunky Black-and-Gold Studio DJ Headphones resting naturally around Neck & Trapezius (zero clipping!)
  const hpGroup = new THREE.Group();
  hpGroup.position.set(0, 0.54, 0.005);
  torso.add(hpGroup);

  // 1. Thick Cushioned Black Leather Padded Headband (Arches behind neck, visible in Views 3 & 4)
  const headbandCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.112,  0.005,  0.076), // Left slider connection
    new THREE.Vector3(-0.118,  0.035,  0.028), // Over left trapezius
    new THREE.Vector3(-0.076,  0.035, -0.045), // Left nape
    new THREE.Vector3( 0.000,  0.042, -0.062), // Center rear nape (View 4 back visible!)
    new THREE.Vector3( 0.076,  0.035, -0.045), // Right nape
    new THREE.Vector3( 0.118,  0.035,  0.028), // Over right trapezius
    new THREE.Vector3( 0.112,  0.005,  0.076)  // Right slider connection
  ]);
  const headbandGeo = new THREE.TubeGeometry(headbandCurve, 28, 0.015, 12, false);
  const headbandMesh = createHiFiMesh(headbandGeo, 0x14161c, 0.024);
  hpGroup.add(headbandMesh);

  // 2. Chunky Studio DJ Monitor Earcups with Polished Gold Trim Bezel Rings
  [-1, 1].forEach((side) => {
    // Slider collar at headband end
    const slider = createHiFiMesh(
      new THREE.BoxGeometry(0.016, 0.024, 0.020),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    slider.position.set(side * 0.112, 0.005, 0.076);
    hpGroup.add(slider);

    // Earcup Assembly Group (Raised by +0.04m to y = -0.002, widened to x = ±0.115m)
    // Sits visibly around neck above the red vest collar in Views 1, 2, and 3!
    const earcup = new THREE.Group();
    earcup.position.set(side * 0.115, -0.002, 0.092);
    // Tilted forward and inward to rest naturally on the clavicle/chest slope
    earcup.rotation.set(0.24, side * 0.32, side * -0.22);

    // Outer Canister Housing (Matte black/charcoal)
    const outerCan = createHiFiMesh(
      new THREE.CylinderGeometry(0.058, 0.060, 0.034, 24),
      0x181a20,
      0.026
    );
    outerCan.rotation.z = Math.PI * 0.5;
    earcup.add(outerCan);

    // Bold Polished Metallic Gold Outer Bezel Ring (Bold gold outer ring!)
    const goldRing = createHiFiMesh(
      new THREE.TorusGeometry(0.057, 0.011, 12, 32),
      GOLD_TRIM,
      0.024,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.6 }
    );
    goldRing.position.x = side * 0.017;
    goldRing.rotation.y = Math.PI * 0.5;
    earcup.add(goldRing);

    // Center Gold Core Accent Disc on outer can
    const goldCore = createHiFiMesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.007, 20),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    goldCore.position.x = side * 0.019;
    goldCore.rotation.z = Math.PI * 0.5;
    earcup.add(goldCore);

    // Plush Contoured Black Memory Foam Ear Cushion
    const cushion = createHiFiMesh(
      new THREE.CylinderGeometry(0.054, 0.052, 0.022, 24),
      0x101216,
      0.022
    );
    cushion.position.x = -side * 0.014;
    cushion.rotation.z = Math.PI * 0.5;
    earcup.add(cushion);

    // Rounded cushion torus rim
    const cushionRim = createHiFiMesh(
      new THREE.TorusGeometry(0.050, 0.008, 10, 24),
      0x0e1014,
      0.020
    );
    cushionRim.position.x = -side * 0.022;
    cushionRim.rotation.y = Math.PI * 0.5;
    earcup.add(cushionRim);

    hpGroup.add(earcup);
  });

  // Heavy V-Shaped Catenary Chain Path Draping Proudly Across Pectoral Surface to Top Rim of Medallion
  const medallionGroup = new THREE.Group();
  torso.add(medallionGroup);

  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.096, 0.520, 0.118),  // Left neck anchor under headphone earcup
    new THREE.Vector3(-0.078, 0.472, 0.162),  // Left clavicle drape proud of chest surface
    new THREE.Vector3(-0.044, 0.420, 0.172),  // Left upper pec V-drape proud of pecs
    new THREE.Vector3( 0.000, 0.378, 0.170),  // Medallion top rim bail loop apex (y = 0.310 + 0.068 = 0.378)
    new THREE.Vector3( 0.044, 0.420, 0.172),  // Right upper pec V-drape proud of pecs
    new THREE.Vector3( 0.078, 0.472, 0.162),  // Right clavicle drape proud of chest surface
    new THREE.Vector3( 0.096, 0.520, 0.118)   // Right neck anchor under headphone earcup
  ]);

  // 1. Supporting Metallic Gold Chain Core Tube
  const goldChainTube = createHiFiMesh(
    new THREE.TubeGeometry(chainCurve, 28, 0.012, 8, false),
    GOLD_TRIM,
    0.022
  );
  medallionGroup.add(goldChainTube);

  // 2. Sculpted Interlocking Cuban Curb Links along the Curve (skipping center apex where bailLoop sits)
  const numLinks = 17;
  for (let i = 1; i < numLinks; i++) {
    const t = i / numLinks;
    const pt = chainCurve.getPoint(t);
    const tangent = chainCurve.getTangent(t);

    const link = createHiFiMesh(
      new THREE.TorusGeometry(0.017, 0.006, 8, 16),
      GOLD_TRIM,
      0.018
    );
    link.position.copy(pt);
    link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    link.rotateOnAxis(new THREE.Vector3(0, 1, 0), (i % 2 === 0 ? 0.35 : -0.35));
    link.scale.set(1.0, 1.25, 0.65);
    medallionGroup.add(link);
  }

  // 3. Heavy Gold Medallion Bail Loop (Attaches chain cleanly to top rim of medallion at y = 0.378!)
  const bailLoop = createHiFiMesh(
    new THREE.TorusGeometry(0.016, 0.006, 10, 20),
    GOLD_TRIM,
    0.020
  );
  bailLoop.position.set(0, 0.378, 0.168);
  bailLoop.rotation.y = Math.PI * 0.5;
  medallionGroup.add(bailLoop);

  // 4. Large 12" Gleaming Gold Vinyl Record Medallion resting cleanly on upper pecs
  const vinylTex = createGoldVinylDiscTexture();
  const goldMedallion = new THREE.Group();
  goldMedallion.position.set(0, 0.310, 0.164); // y_world = 1.380m (Proud of 0.158m chest surface, zero skin clipping!)
  goldMedallion.rotation.x = -0.05;
  medallionGroup.add(goldMedallion);

  // Heavy Polished Metallic Gold Outer Bezel Frame
  const bezel = createHiFiMesh(
    new THREE.TorusGeometry(0.068, 0.008, 12, 32),
    GOLD_TRIM,
    0.024
  );
  goldMedallion.add(bezel);

  // Solid Gold Vinyl Disc Body with High-Contrast Concentric Grooves
  const discGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.014, 32);
  discGeo.rotateX(Math.PI * 0.5);
  const disc = createHiFiMesh(
    discGeo,
    0xffffff,
    0.020,
    vinylTex
  );
  goldMedallion.add(disc);

  // --------------------------------------------------------------------------
  // 4. SCULPTED HEAD, HIGH-TOP FLAT-TOP FADE, SUNGLASSES & CONTOURED GOATEE
  // --------------------------------------------------------------------------
  const neckSlices = [
    [0.52, 0.076, 0.074, 0.078, 0, 0.000, 2.0],
    [0.60, 0.070, 0.068, 0.072, 0, 0.004, 2.0],
    [0.66, 0.072, 0.070, 0.074, 0, 0.006, 2.0]
  ];
  const neckMesh = createHiFiMesh(createSculptedLoftGeometry(neckSlices, 24, false, false, false), SKIN_COLOR, 0.028);
  torso.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.71, 0.008); // y_world = 1.78m (Pivot invariant for ContinuousPoseBlender!)
  torso.add(headGroup);

  // 12-Slice Master Anatomical Chiseled Head + High-Top Flat-Top Fade Loft
  // Spans y = -0.150m (chin) to +0.160m (flat-top crown) -> Total H = 0.310m, crown at y_world = 1.94m!
  // Width across cheekbones: 0.180m; Width across jaw: 0.172m; Width across chin: 0.120m (True heavyweight boss!)
  const headAndHairSlices = [
    [-0.150, 0.060, 0.082, 0.048, 0,  0.024, 2.40], // 1. Broad square chin block (z_front = +0.106)
    [-0.125, 0.076, 0.090, 0.064, 0,  0.016, 2.35], // 2. Lower jawline ramus
    [-0.095, 0.086, 0.096, 0.080, 0,  0.010, 2.30], // 3. Gonial angle (wide masculine jaw flare!)
    [-0.065, 0.086, 0.100, 0.092, 0,  0.006, 2.25], // 4. Mouth & bronze lips level
    [-0.030, 0.088, 0.102, 0.102, 0,  0.003, 2.20], // 5. Nose base & philtrum hollow
    [ 0.005, 0.090, 0.104, 0.110, 0,  0.000, 2.15], // 6. Cheekbones & eyeline (Midline anchor, deep cranium!)
    [ 0.035, 0.088, 0.104, 0.114, 0, -0.002, 2.15], // 7. Brow ridge under sunglasses bar
    [ 0.075, 0.086, 0.102, 0.116, 0, -0.003, 2.20], // 8. Upper forehead right below high-top step
    [ 0.080, 0.090, 0.106, 0.116, 0, -0.002, 2.45], // 9. High-top hairline step overhang!
    [ 0.120, 0.090, 0.106, 0.116, 0, -0.002, 2.50], // 10. Vertical Afro-cubist high-top side walls
    [ 0.155, 0.089, 0.105, 0.114, 0, -0.002, 2.50], // 11. High-top upper rim
    [ 0.160, 0.084, 0.098, 0.108, 0, -0.002, 2.50]  // 12. Razor-flat top crown cap
  ];
  const headGeo = createSculptedLoftGeometry(headAndHairSlices, 36, false, true, true);
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.032, createKronosHeadUVTexture());
  headGroup.add(headMesh);

  // Dark Matte Top Cap on Flat-Top Haircut so top of crown is 100% solid jet-black from elevated angles
  const flatTopCapSlices = [
    [0.082, 0.089, 0.105, 0.115, 0, -0.003, 2.45],
    [0.156, 0.090, 0.106, 0.115, 0, -0.002, 2.50],
    [0.161, 0.085, 0.099, 0.109, 0, -0.002, 2.50]
  ];
  const flatTopCap = createHiFiMesh(createSculptedLoftGeometry(flatTopCapSlices, 32, false, false, true), 0x101014, 0.028);
  headGroup.add(flatTopCap);

  // 3D Sculpted Nose Bridge & Nostril Wings on Front (+Z) for powerful Side Profile (View 3)
  const noseSlices = [
    [-0.036, 0.005, 0.006, 0.003, 0,  0.000, 2.0],
    [-0.024, 0.018, 0.026, 0.006, 0,  0.004, 2.2],
    [-0.005, 0.010, 0.018, 0.005, 0,  0.002, 2.1],
    [ 0.020, 0.006, 0.008, 0.004, 0,  0.000, 2.0]
  ];
  const noseMesh = createHiFiMesh(createSculptedLoftGeometry(noseSlices, 24, false, true, true), SKIN_COLOR, 0.018);
  noseMesh.position.set(0, -0.010, 0.100);
  headGroup.add(noseMesh);

  // 3D Sculpted Anatomical Tapered Chin Goatee (Hugging chin curvature in View 2 & 3!)
  const goateeChinSlices = [
    [-0.140, 0.018, 0.006, 0.002, 0,  0.010, 2.10], // Tapered under-chin wrap
    [-0.132, 0.024, 0.008, 0.002, 0,  0.008, 2.15], // Lower chin volume
    [-0.122, 0.026, 0.008, 0.002, 0,  0.004, 2.15], // Mid-chin projection apex
    [-0.112, 0.022, 0.005, 0.002, 0,  0.002, 2.10], // Tapering upper chin
    [-0.102, 0.014, 0.003, 0.001, 0,  0.001, 2.05]  // Feathered blend into labial groove
  ];
  const goateeChinGeo = createSculptedLoftGeometry(goateeChinSlices, 24, false, true, true);
  const goateeChinMesh = createHiFiMesh(goateeChinGeo, 0x121014, 0.008);
  goateeChinMesh.position.set(0, 0, 0.098);
  headGroup.add(goateeChinMesh);

  // 3D Sculpted Anatomical Ears on Left (+X) & Right (-X)
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.030, 0.008, 0.014, 0.014, 0, 0, 2.0],
      [-0.010, 0.016, 0.022, 0.022, side * 0.004, 0, 2.0],
      [ 0.015, 0.018, 0.024, 0.024, side * 0.006, 0, 2.0],
      [ 0.030, 0.010, 0.014, 0.014, 0, 0, 2.0]
    ];
    const ear = createHiFiMesh(createSculptedLoftGeometry(earSlices, 24, false, true, true), SKIN_COLOR, 0.024);
    ear.position.set(side * 0.088, -0.006, -0.006);
    ear.rotation.set(-0.06, side * -0.18, side * 0.08);
    headGroup.add(ear);
  });

  // WIDE WRAP-AROUND DARK WAYFARER SUNGLASSES WITH CLEAN GOLD BROW BAR (MIDLINE ANCHOR)
  const glassesGroup = new THREE.Group();
  glassesGroup.position.set(0, 0.012, 0.015); // Preserves y = 0.012 midline anchor, shifted +0.015m forward in +Z for 100% skin clearance!
  headGroup.add(glassesGroup);

  // 1. Clean Metallic Gold Top Brow Bar spanning full head width (span = 0.212m >= 0.170m)
  // Note: rotY = +side * angle wraps outer temple corners BACKWARD (-Z) around the head!
  const browSegments = [
    { x:  0.000, y: 0.018, z: 0.108, w: 0.048, rotY:  0.00 }, // Center bridge
    { x: -0.046, y: 0.017, z: 0.104, w: 0.062, rotY: -0.14 }, // Right brow wrapping back toward temple
    { x:  0.046, y: 0.017, z: 0.104, w: 0.062, rotY:  0.14 }, // Left brow wrapping back toward temple
    { x: -0.084, y: 0.015, z: 0.086, w: 0.042, rotY: -0.52 }, // Right wrap-around corner
    { x:  0.084, y: 0.015, z: 0.086, w: 0.042, rotY:  0.52 }  // Left wrap-around corner
  ];
  browSegments.forEach((seg) => {
    const bar = createHiFiMesh(
      new THREE.BoxGeometry(seg.w, 0.014, 0.018),
      GOLD_TRIM,
      0.020
    );
    bar.position.set(seg.x, seg.y, seg.z);
    bar.rotation.y = seg.rotY;
    glassesGroup.add(bar);
  });

  // Solid Dark Center Bridge Frame overlapping both front lenses so zero nose/brow skin ever pokes through
  const centerBridgeFrame = createHiFiMesh(
    new THREE.BoxGeometry(0.048, 0.048, 0.022),
    0x161a24,
    0.0
  );
  centerBridgeFrame.position.set(0, -0.004, 0.105);
  glassesGroup.add(centerBridgeFrame);

  // 2. Sleek Dark Wayfarer/Aviator Lenses (Height = 0.056m, depth = 0.022m, wrapping backward around temples with zero skin bleed)
  [-1, 1].forEach((side) => {
    // Front smoked dark lens: overlaps centerBridgeFrame on inner edge and sideWing on outer edge
    const frontLensGeo = new THREE.BoxGeometry(0.076, 0.056, 0.022);
    const frontLens = createHiFiMesh(frontLensGeo, 0x161a24, 0.020);
    frontLens.position.set(side * 0.044, -0.010, 0.103);
    frontLens.rotation.set(0.02, side * 0.14, 0);
    glassesGroup.add(frontLens);

    // Aerodynamic Wrap-Around Side Wing curving backward (-Z) to meet the temple arm seamlessly
    const sideWing = createHiFiMesh(new THREE.BoxGeometry(0.046, 0.054, 0.020), 0x161a24, 0.018);
    sideWing.position.set(side * 0.082, -0.009, 0.084);
    sideWing.rotation.set(0.02, side * 0.52, 0);
    glassesGroup.add(sideWing);

    // Tapered Temple Arm extending back from sideWing to rest securely over the ear
    const temple = createHiFiMesh(new THREE.BoxGeometry(0.012, 0.014, 0.096), 0x12141a, 0.018);
    temple.position.set(side * 0.090, 0.008, 0.022);
    glassesGroup.add(temple);

    // Gold accent trim on top of temple arm
    const templeTrim = createHiFiMesh(new THREE.BoxGeometry(0.009, 0.004, 0.094), GOLD_TRIM, 0.0);
    templeTrim.position.set(side * 0.090, 0.016, 0.022);
    glassesGroup.add(templeTrim);
  });

  // --------------------------------------------------------------------------
  // 5. MUSCULAR BRONZE ARMS, FINGERLESS GLOVES & RIGHT-HAND (-X) VINTAGE CHROME MIC
  // --------------------------------------------------------------------------
  function buildKronosArm(side) {
    // Note: For Kronos (+Z front), side = -1 is Kronos's RIGHT arm (viewer's left in View 1, facing camera in View 3!)
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.248, 0.43, 0.00);

    // 1. Anatomical Cel-Shaded Upper Arm: Smoothly Rounded Deltoid Dome + Bicep Peak + Tricep Horseshoe
    // Strictly ascending Y order (-0.275 to +0.088) guarantees outward normals and zero facet seams!
    const upperArmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.275, 0.062, 0.062, 0.064,  0.000,         0.000, 2.0], // Elbow joint capsule interface
      [-0.250, 0.068, 0.068, 0.070,  0.000,         0.000, 2.0], // Supracondylar ridge
      [-0.220, 0.075, 0.082, 0.082,  side * 0.002,  0.002, 2.0], // Lower bicep/tricep taper
      [-0.180, 0.081, 0.096, 0.092,  side * 0.004,  0.004, 2.0], // Muscular bicep anterior expansion
      [-0.140, 0.086, 0.106, 0.102,  side * 0.006,  0.003, 2.0], // Peak bicep belly & lateral tricep head
      [-0.100, 0.090, 0.102, 0.104,  side * 0.010, -0.002, 2.0], // Tricep lateral head peak (horseshoe swell)
      [-0.060, 0.094, 0.098, 0.100,  side * 0.012,  0.000, 2.0], // Deltoid insertion on humerus
      [-0.030, 0.096, 0.096, 0.098,  side * 0.012,  0.001, 2.0], // Mid-lower deltoid slope
      [-0.005, 0.095, 0.094, 0.096,  side * 0.006,  0.002, 2.0], // Peak lateral deltoid cap (rounded width)
      [ 0.020, 0.088, 0.088, 0.090, -side * 0.004,  0.002, 2.0], // Upper deltoid curvature rounding inward
      [ 0.042, 0.076, 0.076, 0.078, -side * 0.018,  0.001, 2.0], // Smooth deltoid dome arching toward armhole
      [ 0.062, 0.062, 0.062, 0.064, -side * 0.032,  0.001, 2.0], // Deltoid dome shoulder curve
      [ 0.076, 0.046, 0.046, 0.048, -side * 0.044,  0.000, 2.0], // Deltoid cap entering gold armhole
      [ 0.088, 0.032, 0.032, 0.034, -side * 0.054,  0.000, 2.0]  // Tucked seamlessly inside gold vest armhole ring
    ];
    const upperArmGeo = createSculptedLoftGeometry(upperArmSlices, 28, false, true, true);
    const upperArm = createHiFiMesh(upperArmGeo, SKIN_COLOR, 0.030);
    shoulder.add(upperArm);

    // Lateral Bicep/Tricep Cel-Shaded Separation Furrow (Comic Ink Crease)
    // Smooth 12-segment curve nestled flush into the lateral muscular sulcus
    const creaseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.088, -0.065,  0.002),
      new THREE.Vector3(side * 0.090, -0.130,  0.000),
      new THREE.Vector3(side * 0.082, -0.195, -0.002)
    ]);
    const muscleCrease = createHiFiMesh(
      new THREE.TubeGeometry(creaseCurve, 16, 0.003, 12, false),
      0x38180c,
      0.0
    );
    shoulder.add(muscleCrease);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    // 2. Muscular Bronze Forearm Loft (Prominent Brachioradialis Tapering to Wrist)
    // 10 slices with radialSegments = 24 and strictly ascending Y order (-0.240 to +0.030)
    const forearmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.240, 0.048, 0.046, 0.046, 0.000,         0.000, 2.0], // Wrist entering glove cuff
      [-0.210, 0.053, 0.050, 0.050, side * 0.001,  0.000, 2.0], // Suprastyloid wrist taper
      [-0.175, 0.060, 0.057, 0.056, side * 0.003,  0.001, 2.0], // Lower forearm
      [-0.140, 0.069, 0.066, 0.064, side * 0.006,  0.002, 2.0], // Mid-lower forearm
      [-0.105, 0.078, 0.075, 0.072, side * 0.009,  0.003, 2.0], // Lower brachioradialis belly
      [-0.070, 0.086, 0.082, 0.078, side * 0.012,  0.004, 2.0], // Muscular brachioradialis peak swell
      [-0.040, 0.084, 0.080, 0.076, side * 0.009,  0.003, 2.0], // Upper brachioradialis slope
      [-0.010, 0.076, 0.074, 0.072, side * 0.005,  0.001, 2.0], // Brachioradialis origin near epicondyle
      [ 0.015, 0.067, 0.066, 0.068, 0.000,         0.000, 2.0], // Elbow joint interface
      [ 0.030, 0.060, 0.060, 0.062, 0.000,         0.000, 2.0]  // Proximal elbow overlap inside upper arm
    ];
    const forearm = createHiFiMesh(
      createSculptedLoftGeometry(forearmSlices, 24, false, true, true),
      SKIN_COLOR,
      0.028
    );
    elbow.add(forearm);

    // 3. Black Tactical Wrist Strap Cuff with Metallic Gold Trim & Buckle Clasp
    const wristWrap = createHiFiMesh(
      new THREE.CylinderGeometry(0.055, 0.057, 0.054, 24),
      0x181a22,
      0.026
    );
    wristWrap.position.y = -0.225;
    elbow.add(wristWrap);

    // Metallic Gold Top Rim on Wrist Strap
    const wristGoldRim = createHiFiMesh(
      new THREE.CylinderGeometry(0.056, 0.056, 0.006, 24),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    wristGoldRim.position.y = -0.200;
    elbow.add(wristGoldRim);

    const wristBuckle = createHiFiMesh(
      new THREE.BoxGeometry(0.018, 0.022, 0.008),
      GOLD_TRIM,
      0.018,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
    );
    wristBuckle.position.set(side * 0.056, -0.225, -0.006);
    elbow.add(wristBuckle);

    // 4. Black Fingerless Tactical Combat Glove with Gold Knuckle Studs & Exposed Bronze Fingers
    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);

    // Smooth Contoured Leather Glove Palm (Sculpted Loft with 24 radial segments)
    const palmSlices = [
      // [y, rx, rzFront, rzBack, cx, cz, p]
      [-0.055, 0.040, 0.025, 0.022, 0.000, 0.002, 2.0], // MCP knuckles / finger origins
      [-0.035, 0.045, 0.028, 0.025, 0.000, 0.003, 2.0], // Across MCP knuckle row
      [-0.015, 0.047, 0.029, 0.027, 0.000, 0.002, 2.0], // Mid palm body
      [ 0.010, 0.045, 0.027, 0.027, 0.000, 0.000, 2.0], // Thenar/hypothenar swell
      [ 0.028, 0.042, 0.025, 0.025, 0.000, 0.000, 2.0]  // Wrist interface entering cuff
    ];
    const glovePalm = createHiFiMesh(
      createSculptedLoftGeometry(palmSlices, 24, false, true, true),
      0x181a22,
      0.026
    );
    hand.add(glovePalm);

    // Contoured Padded Knuckle Protection Plate (Dorsal Metacarpals, +Z)
    const knuckleGuardSlices = [
      [-0.016, 0.044, 0.010, 0.006, 0, 0.025, 2.0],
      [ 0.000, 0.045, 0.012, 0.006, 0, 0.027, 2.0],
      [ 0.016, 0.043, 0.010, 0.006, 0, 0.025, 2.0]
    ];
    const knuckleGuard = createHiFiMesh(
      createSculptedLoftGeometry(knuckleGuardSlices, 20, false, true, true),
      0x282c36,
      0.022
    );
    hand.add(knuckleGuard);

    // 4 Metallic Gold Knuckle Studs
    [-0.030, -0.010, 0.010, 0.030].forEach((kx) => {
      const stud = createHiFiMesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.006, 16),
        GOLD_TRIM,
        0.014,
        null,
        0x000000,
        { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
      );
      stud.position.set(kx, 0.000, 0.036);
      stud.rotation.x = Math.PI * 0.5;
      hand.add(stud);
    });

    // 4 Articulated Fingers (Gloved proximal sleeve + Exposed Bronze skin distal tips)
    const fingerXPositions = [-0.030, -0.010, 0.010, 0.030];
    fingerXPositions.forEach((fx, idx) => {
      const lenFactor = (idx === 1 || idx === 2) ? 1.05 : 0.95;

      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(fx, -0.045, 0.018);
      fingerGroup.rotation.x = -0.55; // Proximal forward curl
      hand.add(fingerGroup);

      // Proximal gloved segment (Cylinder with smooth normals)
      const fGloveGeo = new THREE.CylinderGeometry(0.0090, 0.0085, 0.024 * lenFactor, 14);
      const fGlove = createHiFiMesh(fGloveGeo, 0x181a22, 0.020);
      fGlove.position.y = -0.012 * lenFactor;
      fingerGroup.add(fGlove);

      // Distal exposed bronze skin tip (curled inward into grip)
      const tipGroup = new THREE.Group();
      tipGroup.position.y = -0.024 * lenFactor;
      tipGroup.rotation.x = -0.75;
      fingerGroup.add(tipGroup);

      const fTipGeo = new THREE.CylinderGeometry(0.0080, 0.0068, 0.022 * lenFactor, 14);
      const fTip = createHiFiMesh(fTipGeo, SKIN_COLOR, 0.020);
      fTip.position.y = -0.011 * lenFactor;
      tipGroup.add(fTip);
    });

    // Articulated Thumb (Gloved base + Exposed Bronze skin tip)
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(-side * 0.042, -0.015, 0.014);
    thumbGroup.rotation.set(-0.30, -side * 0.40, -side * 0.35);
    hand.add(thumbGroup);

    const thumbGloveGeo = new THREE.CylinderGeometry(0.0105, 0.0098, 0.026, 14);
    const thumbGlove = createHiFiMesh(thumbGloveGeo, 0x181a22, 0.020);
    thumbGlove.position.y = -0.013;
    thumbGroup.add(thumbGlove);

    const thumbTipGroup = new THREE.Group();
    thumbTipGroup.position.y = -0.026;
    thumbTipGroup.rotation.x = -0.65;
    thumbGroup.add(thumbTipGroup);

    const thumbTipGeo = new THREE.CylinderGeometry(0.0092, 0.0078, 0.020, 14);
    const thumbTip = createHiFiMesh(thumbTipGeo, SKIN_COLOR, 0.020);
    thumbTip.position.y = -0.010;
    thumbTipGroup.add(thumbTip);

    return { shoulder, elbow, hand, fist: hand };
  }

  // Kronos Right Arm = -1 (-X, Viewer's Left in View 1, facing camera in View 3!)
  // Kronos Left Arm = +1 (+X, Viewer's Right in View 1)
  const leftArmObj = buildKronosArm(-1);
  const rightArmObj = buildKronosArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // VINTAGE RIBBED SILVER-CHROME CAPSULE MICROPHONE IN KRONOS'S RIGHT HAND (leftArmObj, side = -1)
  // Oriented horizontally along +Z (Forward) so:
  // - View 1 (Front): Circular silver grille faces the camera at viewer's left hand!
  // - View 2 (3/4) & View 3 (Right Side Profile): Ribbed silver capsule points forward (rightward) with dark handle extending back!
  const micGroup = new THREE.Group();
  micGroup.position.set(0, -0.032, 0.005);
  micGroup.rotation.x = Math.PI * 0.5; // Rest pose: points along +Z
  leftArmObj.hand.add(micGroup);

  // Tapered Dark Graphite Body (-Y = rear)
  const micHandle = createHiFiMesh(new THREE.CylinderGeometry(0.022, 0.016, 0.135, 18), 0x20242c, 0.024);
  micHandle.position.y = -0.052;
  micGroup.add(micHandle);

  const micTailTip = createHiFiMesh(new THREE.CylinderGeometry(0.016, 0.012, 0.024, 16), 0xd8e4f0, 0.020);
  micTailTip.position.y = -0.130;
  micGroup.add(micTailTip);

  // Ribbed Silver-Chrome Capsule Head (+Y = front)
  const micCapsuleGroup = new THREE.Group();
  micCapsuleGroup.position.y = 0.072;
  micGroup.add(micCapsuleGroup);

  const capsuleSlices = [
    [-0.045, 0.030, 0.030, 0.030, 0, 0, 2.0],
    [-0.018, 0.040, 0.040, 0.040, 0, 0, 2.0],
    [0.022,  0.040, 0.040, 0.040, 0, 0, 2.0],
    [0.048,  0.030, 0.030, 0.030, 0, 0, 2.0],
    [0.058,  0.016, 0.016, 0.016, 0, 0, 2.0]
  ];
  const micHead = createHiFiMesh(
    createSculptedLoftGeometry(capsuleSlices, 20, false, true, true),
    0xdce4ec,
    0.024,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.6 }
  );
  micCapsuleGroup.add(micHead);

  // Acoustic Ring Grooves
  [-0.022, -0.002, 0.018, 0.038].forEach((ry) => {
    const rib = createHiFiMesh(new THREE.TorusGeometry(0.039, 0.0035, 8, 20), 0x181c22, 0.0);
    rib.position.y = ry;
    rib.rotation.x = Math.PI * 0.5;
    micCapsuleGroup.add(rib);
  });

  // Center Chrome Band
  const centerBand = createHiFiMesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 20), 0xf5f8fc, 0.020);
  centerBand.position.y = 0.006;
  micCapsuleGroup.add(centerBand);

  // --------------------------------------------------------------------------
  // 6. FULL-LENGTH BAGGY DARK-SLATE CARGO PANTS & BLACK/GOLD LACED COMBAT BOOTS
  // --------------------------------------------------------------------------
  const pantsLegTex = createKronosPantsLegUVTexture();

  function buildKronosLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.115, -0.05, 0); // Hip joint at y_world = 0.99m

    // Full Baggy Upper Thigh Loft in Dark Slate-Charcoal (#313e45) (A-stance gap >= 3.8cm preserved!)
    const thighSlices = [
      [-0.37, 0.110, 0.112, 0.116, side * 0.014, 0.000, 2.15], // Knee joint taper (Nominal gap = 3.80cm)
      [-0.25, 0.114, 0.124, 0.126, side * 0.020, 0.004, 2.20], // Mid-thigh fullness (Nominal gap = 4.20cm)
      [-0.12, 0.112, 0.118, 0.122, side * 0.016, 0.004, 2.20], // Upper-thigh drape (Nominal gap = 3.80cm)
      [0.02,  0.104, 0.106, 0.110, side * 0.010, 0.000, 2.15]  // Upper hip insertion (Nominal gap = 4.20cm)
    ];
    const thighMesh = createHiFiMesh(
      createSculptedLoftGeometry(thighSlices, 24, false, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    hipJoint.add(thighMesh);

    // Side Thigh 3D Bellows Flapped Cargo Pocket (Views 1, 2, 3, 4)
    const pocketGroup = new THREE.Group();
    pocketGroup.position.set(side * 0.132, -0.20, 0.00);
    pocketGroup.rotation.z = side * -0.05;
    hipJoint.add(pocketGroup);

    const pocketBox = createHiFiMesh(new THREE.BoxGeometry(0.038, 0.160, 0.130), 0x263137, 0.028);
    pocketGroup.add(pocketBox);

    const pocketPleat = createHiFiMesh(new THREE.BoxGeometry(0.042, 0.150, 0.012), 0x1f282d, 0.020);
    pocketGroup.add(pocketPleat);

    const pocketFlap = createHiFiMesh(new THREE.BoxGeometry(0.044, 0.038, 0.136), 0x2f3c43, 0.026);
    pocketFlap.position.y = 0.068;
    pocketGroup.add(pocketFlap);

    // Knee Joint at y = -0.37 (y_world = 0.62m, aligned with thighSlice[0] center side * 0.014)
    const kneeJoint = new THREE.Group();
    kneeJoint.position.set(side * 0.014, -0.37, 0);
    hipJoint.add(kneeJoint);

    // FULL-LENGTH BAGGY LOWER CARGO PANTS EXTENDING ALL THE WAY TO LOWER SHIN/ANKLE (y = -0.32 -> y_world = 0.30m!)
    // Matches reference sheet where 83% of leg height is baggy slate cargo pants tucked into ankle combat boots!
    const calfPantsSlices = [
      [-0.32, 0.076, 0.076, 0.078, 0.000,        -0.004, 2.10], // Tucked neatly into boot collar
      [-0.26, 0.118, 0.114, 0.118, side * 0.006, -0.004, 2.20], // Bloused cloth overhang above boot!
      [-0.16, 0.124, 0.120, 0.124, side * 0.008, -0.002, 2.20], // Full baggy calf drape
      [-0.06, 0.120, 0.116, 0.120, side * 0.006,  0.000, 2.15],
      [0.02,  0.110, 0.110, 0.114, 0.000,         0.000, 2.10]  // Knee cap insertion (rx = 0.110 matching thighSlice[0])
    ];
    const calfPantsMesh = createHiFiMesh(
      createSculptedLoftGeometry(calfPantsSlices, 24, false, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    kneeJoint.add(calfPantsMesh);

    // COMPACT ANKLE / LOWER-CALF BLACK-AND-GOLD COMBAT BOOT (y = -0.30 down to -0.62 -> y_world = 0.00m..0.32m!)
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -0.40, -0.006); // y_world = 0.22m
    kneeJoint.add(footGroup);

    // 1. Thin Metallic Gold Top Ankle Ring Trim (eliminating yellow rain-boot cuff, b.min.y >= 0.03)
    const goldCollarSlices = [
      [0.084, 0.075, 0.077, 0.079, 0, 0.000, 2.2],
      [0.094, 0.077, 0.079, 0.081, 0, 0.001, 2.2]
    ];
    const topGoldCollar = createHiFiMesh(
      createSculptedLoftGeometry(goldCollarSlices, 24, false, false, true),
      GOLD_TRIM,
      0.020
    );
    footGroup.add(topGoldCollar);

    // 2. Sculpted Matte Black Leather Combat Boot Shaft & Vamp (y_world = 0.04m..0.305m)
    // Entire boot shaft is matte black leather all the way up to collar ring
    const bootUpperSlices = [
      [-0.180, 0.078, 0.170, 0.090, 0,  0.000, 2.4], // Vamp & instep
      [-0.125, 0.072, 0.135, 0.086, 0,  0.000, 2.2], // Ankle transition
      [-0.055, 0.066, 0.078, 0.078, 0, -0.004, 2.15], // Mid ankle
      [ 0.020, 0.068, 0.070, 0.074, 0, -0.002, 2.15], // Upper shaft
      [ 0.086, 0.074, 0.076, 0.078, 0,  0.000, 2.15]  // Shaft opening directly under thin gold ring
    ];
    const bootUpper = createHiFiMesh(
      createSculptedLoftGeometry(bootUpperSlices, 26, false, false, true),
      BOOT_BLACK,
      0.028
    );
    footGroup.add(bootUpper);

    // 3. Cream-White Rubber Lug Outsole (y_world = 0.00m..0.04m)
    const soleSlices = [
      [-0.220, 0.082, 0.180, 0.094, 0, 0, 2.5],
      [-0.180, 0.084, 0.182, 0.096, 0, 0, 2.5]
    ];
    const lugSole = createHiFiMesh(
      createSculptedLoftGeometry(soleSlices, 26, false, true, true),
      SOLE_WHITE,
      0.028
    );
    footGroup.add(lugSole);

    // 4. Thin Metallic Gold Welt Line (Just above outsole)
    const goldWeltSlices = [
      [-0.180, 0.081, 0.165, 0.093, 0, 0, 2.4],
      [-0.162, 0.078, 0.155, 0.090, 0, 0, 2.3]
    ];
    const goldWelt = createHiFiMesh(
      createSculptedLoftGeometry(goldWeltSlices, 24, false, false, false),
      GOLD_TRIM,
      0.020
    );
    footGroup.add(goldWelt);

    // 5. Compact Metallic Gold Heel Counter Cup (Strictly rear heel calcaneus! NO VERTICAL BACK STRIP!)
    const goldHeelCupSlices = [
      [-0.180, 0.076, 0.010, 0.092, 0, 0, 2.3],
      [-0.135, 0.068, 0.010, 0.084, 0, -0.002, 2.2]
    ];
    const goldHeelCup = createHiFiMesh(
      createSculptedLoftGeometry(goldHeelCupSlices, 20, false, false, true),
      GOLD_TRIM,
      0.022
    );
    footGroup.add(goldHeelCup);

    // 6. Front Gold Eyestay Trim & 5 Criss-Cross Black Laces (+Z) for High Graphic Contrast
    [-1, 1].forEach((s) => {
      const eyestay = createHiFiMesh(new THREE.BoxGeometry(0.016, 0.155, 0.018), GOLD_TRIM, 0.016);
      eyestay.position.set(s * 0.028, -0.022, 0.072);
      eyestay.rotation.x = 0.28;
      footGroup.add(eyestay);
    });

    for (let l = 0; l < 5; l++) {
      const ly = 0.030 - l * 0.028;
      const lz = 0.066 + l * 0.010;
      [-1, 1].forEach((diag) => {
        const xLace = createHiFiMesh(new THREE.BoxGeometry(0.054, 0.008, 0.012), 0x14161c, 0.012);
        xLace.position.set(0, ly, lz);
        xLace.rotation.set(0.28, 0, diag * 0.32);
        footGroup.add(xLace);
      });
    }

    return { hipJoint, kneeJoint, footGroup };
  }

  const leftLegObj = buildKronosLeg(-1);
  const rightLegObj = buildKronosLeg(1);
  hips.add(leftLegObj.hipJoint);
  hips.add(rightLegObj.hipJoint);

  return {
    root,
    contactShadowDecal,
    hips,
    torso,
    headGroup,
    leftArm: leftArmObj.shoulder,
    leftElbow: leftArmObj.elbow,
    leftHand: leftArmObj.hand,
    rightArm: rightArmObj.shoulder,
    rightElbow: rightArmObj.elbow,
    rightHand: rightArmObj.hand,
    leftLeg: leftLegObj.hipJoint,
    leftKnee: leftLegObj.kneeJoint,
    leftAnkle: leftLegObj.footGroup,
    rightLeg: rightLegObj.hipJoint,
    rightKnee: rightLegObj.kneeJoint,
    rightAnkle: rightLegObj.footGroup,
    dusterCoat: vest,
    vest,
    medallion: goldMedallion,
    micGroup
  };
}

// ============================================================================
// ENHANCED HYPE-CREW BRUISER PROCEDURAL 3D SCULPT & TEXTURE SYSTEM (MILESTONE 1)
// Authentic AA Cel-Shaded Graphic-Novel Street Brawler matching Turnaround Sheet
// ============================================================================

const _bruiserHeadTexCache = {};

/**
 * Procedural 1024x1024 UV Face Texture Canvas for Hype-Crew Bruiser.
 * Calibrated for bruiserHeadSlices (yMin = -0.142, yMax = +0.132, frontIsNegZ = false):
 * - Center Front Face: u = 0.50 (x = 512)
 * - Right Side Profile: u = 0.25 (x = 256, viewer's left)
 * - Left Side Profile:  u = 0.75 (x = 768, viewer's right)
 * - Back Nape Seam:     u = 0.00 / 1.00 (x = 0 / 1024)
 * - Chin Tip:     y = -0.142 -> py = 1018
 * - Gritted Lips: y = -0.065 -> py = 740
 * - Nose Bridge:  y = -0.018 -> py = 565
 * - Fierce Eyes:  y = +0.035 -> py = 368
 * - Angry Brows:  y = +0.065 -> py = 256
 * - Hairline:     y = +0.082 -> py = 192
 */
export function createBruiserHeadUVTexture(idx = 0) {
  if (_bruiserHeadTexCache[idx]) return _bruiserHeadTexCache[idx];

  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Dual Brawler Skin Tone Selection matching Turnaround Sheet
  // Variant 0: Clean warm bronze (#d89c74); Variant 1: Rich terracotta (#b97a52)
  const isBronze = idx === 0;
  const skinBase = isBronze ? '#d89c74' : '#b97a52';
  const skinShadow = isBronze ? '#b87c56' : '#965a36';
  const skinDeep = isBronze ? '#8e5432' : '#6d381c';
  const skinHighlight = isBronze ? '#ebd0b6' : '#cfa17e';

  // Base fill: entire canvas initialized to clean, warm skin tone
  ctx.fillStyle = skinBase;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Shaved / Faded Temple Sides & Back Nape strictly on lateral and posterior regions
  // Keeping front face zone (x = 280..744) 100% clean, warm, and even with ZERO dirt smudges
  // Back nape buzz fade across back seam (x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    const napeGrad = ctx.createLinearGradient(0, 0, 0, 480);
    napeGrad.addColorStop(0.0, '#1c120d');
    napeGrad.addColorStop(0.45, '#2e1c14');
    napeGrad.addColorStop(0.80, skinDeep);
    napeGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = napeGrad;
    ctx.fillRect(-140, 0, 280, 480);
  });

  // Lateral side temple buzz fades strictly confined to outer profiles (x <= 260 and x >= 764)
  [-1, 1].forEach((side) => {
    const tx = 512 + side * 310; // Lateral temple center (x = 202 and x = 822)
    const fadeGrad = ctx.createLinearGradient(0, 0, 0, 360);
    fadeGrad.addColorStop(0.0, '#1c120d');
    fadeGrad.addColorStop(0.45, '#2e1c14');
    fadeGrad.addColorStop(0.80, skinDeep);
    fadeGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(tx - 70, 0, 140, 360);

    // Subtle clipper stipple strictly confined to outer profile (never near cheeks)
    ctx.fillStyle = 'rgba(24, 15, 10, 0.28)';
    for (let i = 0; i < 35; i++) {
      const rx = tx - 60 + Math.random() * 120;
      const ry = 40 + Math.random() * 280;
      ctx.fillRect(rx, ry, 2.0, 2.0);
    }
  });

  // Guarantee front face zone (x = 280..744, py = 0..1024) is 100% clean, warm, and even
  ctx.fillStyle = skinBase;
  ctx.fillRect(280, 0, 464, 1024);

  // Dark mohawk scalp strip along sagittal crown midline (x = 486..538, py = 0..190)
  ctx.fillStyle = '#20130d';
  ctx.fillRect(486, 0, 52, 190);
  ctx.fillStyle = '#2e1c14';
  ctx.fillRect(494, 0, 36, 190);

  // Crisp razor-cut temple line-up contour
  ctx.strokeStyle = '#18100c';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(375, 205);
  ctx.lineTo(390, 190);
  ctx.quadraticCurveTo(512, 168, 634, 190);
  ctx.lineTo(649, 205);
  ctx.stroke();

  // 3. Glabella Brow Furrow & Forehead Anger Creases (py = 220..310)
  ctx.strokeStyle = '#160d09';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(498, 260);
  ctx.lineTo(504, 335);
  ctx.moveTo(526, 260);
  ctx.lineTo(520, 335);
  ctx.stroke();

  // Horizontal forehead anger lines
  ctx.strokeStyle = skinDeep;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(450, 224);
  ctx.quadraticCurveTo(512, 216, 574, 224);
  ctx.moveTo(464, 246);
  ctx.quadraticCurveTo(512, 240, 560, 246);
  ctx.stroke();

  // 4. Heavy Furrowed Dark Eyebrows (py = 265..325, slanting steeply down toward glabella)
  [-1, 1].forEach((side) => {
    const bx = 512 + side * 94;
    ctx.fillStyle = '#140c08';
    ctx.beginPath();
    ctx.moveTo(512 + side * 18, 322);
    ctx.quadraticCurveTo(bx, 272, bx + side * 58, 286);
    ctx.lineTo(bx + side * 62, 300);
    ctx.quadraticCurveTo(bx, 292, 512 + side * 18, 336);
    ctx.closePath();
    ctx.fill();

    // Stylized jagged brow notch cuts
    ctx.strokeStyle = skinBase;
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(bx + side * 22, 278);
    ctx.lineTo(bx + side * 20, 298);
    ctx.stroke();
  });

  // 5. Fierce Cel-Shaded Anime Eyes with Heavy Eyeliner & Constricted Pupils (py = 370..425)
  [-1, 1].forEach((side) => {
    const ex = 512 + side * 108; // Horizontal eye center
    const ey = 388;

    // Crisp White Sclera with aggressive angled almond contour
    ctx.fillStyle = '#f5f6fa';
    ctx.beginPath();
    ctx.moveTo(ex - side * 44, ey + 4);       // Inner corner
    ctx.quadraticCurveTo(ex, ey - 24, ex + side * 44, ey - 14); // Upper contour
    ctx.quadraticCurveTo(ex + side * 34, ey + 18, ex, ey + 20); // Lower outer
    ctx.quadraticCurveTo(ex - side * 24, ey + 18, ex - side * 44, ey + 4);
    ctx.closePath();
    ctx.fill();

    // Fierce Amber-Gold Iris Gradient
    const irisGrad = ctx.createLinearGradient(ex, ey - 18, ex, ey + 18);
    irisGrad.addColorStop(0.0, '#361b0c');
    irisGrad.addColorStop(0.5, '#a4581a');
    irisGrad.addColorStop(1.0, '#e89428');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(ex - side * 2, ey + 1, 21, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Constricted Black Pupil (Adrenaline-Fueled Brawler Stare)
    ctx.fillStyle = '#0a0604';
    ctx.beginPath();
    ctx.arc(ex - side * 2, ey + 1, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Sharp White Specular Eye Glint
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - side * 9, ey - 5, 4.5, 0, Math.PI * 2);
    ctx.arc(ex + side * 6, ey + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Heavy Graphic-Novel Upper Eyeliner & Outer Wing
    ctx.strokeStyle = '#0a0503';
    ctx.lineWidth = 10.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - side * 46, ey + 5);
    ctx.quadraticCurveTo(ex, ey - 26, ex + side * 48, ey - 15);
    ctx.lineTo(ex + side * 56, ey - 20); // Sharp outer flick
    ctx.stroke();

    // Lower Eyelid Rim Line (clean, sharp, no smudge)
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(ex - side * 28, ey + 19);
    ctx.quadraticCurveTo(ex, ey + 22, ex + side * 40, ey + 12);
    ctx.stroke();
  });

  // 6. Clean Graphic-Novel Nose Bridge Lines & Nostril Crease (No dark shadow wedge!)
  ctx.strokeStyle = '#180e0a';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(508, 480);
  ctx.lineTo(504, 570);
  ctx.lineTo(512, 595);
  ctx.stroke();

  // Nostril Creases & Wings
  ctx.beginPath();
  ctx.moveTo(484, 592);
  ctx.quadraticCurveTo(512, 604, 540, 592);
  ctx.moveTo(478, 594);
  ctx.lineTo(490, 590);
  ctx.moveTo(546, 594);
  ctx.lineTo(534, 590);
  ctx.stroke();

  // 7. Clenched Scowl / Gritted Grimace Mouth (py = 725..775)
  // Outer grimace contour
  ctx.strokeStyle = '#120806';
  ctx.lineWidth = 6.0;
  ctx.fillStyle = '#24120e';
  ctx.beginPath();
  ctx.moveTo(436, 738);
  ctx.quadraticCurveTo(512, 730, 588, 738);
  ctx.quadraticCurveTo(580, 772, 512, 775);
  ctx.quadraticCurveTo(444, 772, 436, 738);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Gritted White Teeth Row with Dark Crevices
  ctx.fillStyle = '#f0f2f6';
  ctx.beginPath();
  ctx.moveTo(448, 742);
  ctx.quadraticCurveTo(512, 736, 576, 742);
  ctx.quadraticCurveTo(570, 764, 512, 766);
  ctx.quadraticCurveTo(454, 764, 448, 742);
  ctx.closePath();
  ctx.fill();

  // Horizontal interdental bite line
  ctx.strokeStyle = '#1c0f0b';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(450, 752);
  ctx.lineTo(574, 752);
  ctx.stroke();

  // Vertical tooth separation tick lines
  [472, 492, 512, 532, 552].forEach((tx) => {
    ctx.beginPath();
    ctx.moveTo(tx, 742);
    ctx.lineTo(tx, 764);
    ctx.stroke();
  });

  // Deep Down-Turned Mouth Corner Creases
  [-1, 1].forEach((side) => {
    ctx.strokeStyle = '#160906';
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    ctx.moveTo(512 + side * 78, 738);
    ctx.lineTo(512 + side * 94, 754);
    ctx.stroke();
  });

  // Clean Lower Lip Crease Line
  ctx.strokeStyle = '#1c0f0b';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(486, 788);
  ctx.quadraticCurveTo(512, 794, 538, 788);
  ctx.stroke();

  // 8. Angular Chin Cleft Groove (py = 915..965)
  ctx.strokeStyle = '#180d09';
  ctx.lineWidth = 4.0;
  ctx.beginPath();
  ctx.moveTo(512, 920);
  ctx.lineTo(512, 965);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _bruiserHeadTexCache[idx] = tex;
  return tex;
}

/**
 * Enhanced Hype-Crew Bruiser Procedural 3D Model Factory.
 * Overhauls placeholder primitives into an authentic AA cel-shaded graphic-novel brawler
 * matching the left half of antagonists_turnaround_sheet_1792119851073.jpg.
 */
export function buildBruiserModel(idx = 0) {
  const root = new THREE.Group();
  root.scale.setScalar(0.96); // Imposing athletic brawler mass

  // Grounded dynamic contact shadow decal beneath fighter
  const contactShadowDecal = createContactShadowDecal(1.3, 1.0, 0.48);
  contactShadowDecal.name = 'contact_shadow_decal';
  contactShadowDecal.position.set(0, 0.015, 0);
  root.add(contactShadowDecal);

  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  // Distinct Brawler Palettes matching antagonists turnaround sheet
  // Variant 0: Clean warm bronze (#d89c74); Variant 1: Rich terracotta (#b97a52)
  const skinColor = idx === 0 ? 0xd89c74 : 0xb97a52;
  const pantsColor = 0x1c1e26;      // Baggy tapered dark-charcoal cargo pants
  const vestColor = 0x14141a;       // Deep black leather biker vest
  const vestLapelColor = 0x1a1a24;  // Open notched lapels
  const crimsonWrapColor = 0xa82020;// Symmetrical crimson fabric chest wrap
  const silverMetal = 0xdce0ea;     // Metallic silver studs, spikes & buckle
  const hairDark = 0x241712;        // Dark chestnut brown mohawk hair

  // ==========================================================================
  // 1. TACTICAL BELT, BUCKLE & LOWER PELVIS (Calibrated for waist width ~0.32m)
  // ==========================================================================
  const beltGeo = new THREE.CylinderGeometry(0.19, 0.175, 0.09, 24);
  beltGeo.computeVertexNormals();
  const beltMesh = createHiFiMesh(beltGeo, 0x101014, 0.038);
  beltMesh.scale.set(1.10, 1.0, 0.78);
  beltMesh.position.y = 0.02;
  hips.add(beltMesh);

  // Prominent Rectangular Silver Buckle with Center Dark Inset & Prong
  const buckleFrame = createHiFiMesh(
    new THREE.BoxGeometry(0.10, 0.065, 0.035),
    silverMetal,
    0.030,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
  );
  buckleFrame.position.set(0, 0.02, 0.155);
  hips.add(buckleFrame);

  const buckleCenter = createHiFiMesh(new THREE.BoxGeometry(0.060, 0.038, 0.038), 0x181820, 0.0);
  buckleCenter.position.set(0, 0.02, 0.155);
  hips.add(buckleCenter);

  const buckleProng = createHiFiMesh(
    new THREE.BoxGeometry(0.014, 0.042, 0.042),
    silverMetal,
    0.022,
    null,
    0x000000,
    { isMetallic: true }
  );
  buckleProng.position.set(0, 0.02, 0.158);
  hips.add(buckleProng);

  // ==========================================================================
  // 2. MUSCULAR BRAWLER TORSO: ATHLETIC V-TAPER (top ~0.44m, waist ~0.32m)
  // ==========================================================================
  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);

  // Muscular Core & Chest Loft Geometry: Athletic V-Taper (top width ~0.44m, waist width ~0.32m)
  const bruiserTorsoSlices = [
    // [y, rx, rzFront, rzBack, cx, cz, p] with frontIsNegZ = false
    [0.02, 0.160, 0.120, 0.120, 0, 0.010, 2.2], // Waist (width 0.32m)
    [0.16, 0.175, 0.135, 0.130, 0, 0.015, 2.2], // Lower midriff
    [0.32, 0.198, 0.150, 0.140, 0, 0.020, 2.2], // Ribcage / solar plexus
    [0.48, 0.220, 0.165, 0.148, 0, 0.025, 2.2], // Muscular pectorals (width 0.44m)
    [0.62, 0.220, 0.160, 0.145, 0, 0.015, 2.2], // Upper chest / clavicle (width 0.44m)
    [0.68, 0.185, 0.135, 0.130, 0, 0.010, 2.1]  // Shoulders / neck base
  ];
  const torsoGeo = createSculptedLoftGeometry(bruiserTorsoSlices, 32, false, true, true);
  torsoGeo.computeVertexNormals();
  const torsoMesh = createHiFiMesh(torsoGeo, skinColor, 0.042);
  torso.add(torsoMesh);

  // Shaded Upper Abdominal Muscle Planes (Sculpted rounded muscular contours above belt beneath open vest)
  [-1, 1].forEach((side) => {
    [0.14, 0.21].forEach((ay) => {
      const abGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.044, 16);
      abGeo.scale(1.12, 1.0, 0.48);
      abGeo.computeVertexNormals();
      const abPlate = createHiFiMesh(abGeo, idx === 0 ? 0xc28660 : 0x824a2a, 0.010);
      abPlate.position.set(side * 0.036, ay, 0.140);
      abPlate.rotation.set(-0.06, side * 0.12, 0);
      torso.add(abPlate);
    });
  });

  // Symmetrical Crimson Cloth Chest Wrap across mid-chest above abs matching turnaround sheet
  // Base wrap cylinder centered horizontally across chest
  const wrapBaseGeo = new THREE.CylinderGeometry(0.226, 0.205, 0.19, 28);
  wrapBaseGeo.computeVertexNormals();
  const wrapBase = createHiFiMesh(wrapBaseGeo, crimsonWrapColor, 0.038);
  wrapBase.scale.set(1.08, 1.0, 0.82);
  wrapBase.position.set(0, 0.385, 0.022);
  torso.add(wrapBase);

  // Symmetrical upper and lower horizontal wrap rim folds
  const wrapTopRimGeo = new THREE.CylinderGeometry(0.228, 0.224, 0.05, 28);
  wrapTopRimGeo.computeVertexNormals();
  const wrapTopRim = createHiFiMesh(wrapTopRimGeo, crimsonWrapColor, 0.034);
  wrapTopRim.scale.set(1.08, 1.0, 0.82);
  wrapTopRim.position.set(0, 0.455, 0.024);
  torso.add(wrapTopRim);

  const wrapBotRimGeo = new THREE.CylinderGeometry(0.210, 0.206, 0.05, 28);
  wrapBotRimGeo.computeVertexNormals();
  const wrapBotRim = createHiFiMesh(wrapBotRimGeo, crimsonWrapColor, 0.034);
  wrapBotRim.scale.set(1.08, 1.0, 0.82);
  wrapBotRim.position.set(0, 0.315, 0.020);
  torso.add(wrapBotRim);

  // Symmetrical Crisscrossing Cloth Strap Overlays crossing neatly in chest center
  [-1, 1].forEach((side) => {
    const strapGeo = new THREE.BoxGeometry(0.036, 0.18, 0.016);
    const strap = createHiFiMesh(strapGeo, 0x941820, 0.022);
    strap.position.set(side * 0.038, 0.385, 0.162);
    strap.rotation.set(0.04, 0, side * 0.35);
    torso.add(strap);
  });

  // Open Black Leather Biker Vest Shell (Fitted closely to athletic V-taper)
  const vestShellGeo = new THREE.CylinderGeometry(
    0.265, 0.220, 0.65, 28, 1, true,
    Math.PI * 0.36, Math.PI * 1.28
  );
  vestShellGeo.computeVertexNormals();
  const vestMesh = createHiFiMesh(vestShellGeo, vestColor, 0.044);
  vestMesh.scale.set(1.12, 1.0, 0.82);
  vestMesh.position.set(0, 0.35, 0.01);
  torso.add(vestMesh);

  // Standing Notched Biker Collar framing back and sides of the neck
  const collarBackGeo = new THREE.CylinderGeometry(0.096, 0.092, 0.090, 24, 1, true, -Math.PI * 0.48, Math.PI * 0.96);
  collarBackGeo.computeVertexNormals();
  const collarBack = createHiFiMesh(collarBackGeo, vestLapelColor, 0.038);
  collarBack.position.set(0, 0.725, -0.015);
  torso.add(collarBack);

  // Vest Shoulder Straps / Trapezius Yoke (extends vest all the way up over shoulders right next to neck)
  [-1, 1].forEach((side) => {
    // Continuous contoured leather shoulder panel spanning from neck (x ~ side*0.08) to armhole (x ~ side*0.24)
    const shoulderStrapGeo = new THREE.BoxGeometry(0.155, 0.038, 0.28);
    shoulderStrapGeo.computeVertexNormals();
    const shoulderStrap = createHiFiMesh(shoulderStrapGeo, vestColor, 0.040);
    shoulderStrap.position.set(side * 0.158, 0.696, 0.005);
    shoulderStrap.rotation.set(0, 0, side * -0.16);
    torso.add(shoulderStrap);

    // Notched collar front lapel corner tab framing neck side
    const collarTabGeo = new THREE.BoxGeometry(0.032, 0.085, 0.055);
    collarTabGeo.computeVertexNormals();
    const collarTab = createHiFiMesh(collarTabGeo, vestLapelColor, 0.032);
    collarTab.position.set(side * 0.092, 0.715, 0.075);
    collarTab.rotation.set(-0.15, side * -0.25, side * 0.12);
    torso.add(collarTab);

    // Frayed sleeveless armhole edges: distressed leather cuff + frayed thread fringe
    const cuffGeo = new THREE.TorusGeometry(0.145, 0.022, 12, 24);
    cuffGeo.computeVertexNormals();
    const cuff = createHiFiMesh(cuffGeo, 0x282932, 0.034);
    cuff.position.set(side * 0.238, 0.54, 0.012);
    cuff.rotation.set(0, Math.PI * 0.5, 0);
    torso.add(cuff);

    // Distressed frayed thread accents along sleeveless armhole rim
    for (let f = 0; f < 8; f++) {
      const fAngle = (f / 8) * Math.PI * 2;
      const fray = createHiFiMesh(
        new THREE.BoxGeometry(0.014, 0.024, 0.010),
        f % 2 === 0 ? 0xd0d0dc : 0x7c7c88,
        0.020
      );
      fray.position.set(
        side * (0.240 + Math.sin(fAngle) * 0.010),
        0.54 + Math.sin(fAngle) * 0.135,
        0.012 + Math.cos(fAngle) * 0.135
      );
      fray.rotation.set(fAngle, 0, side * 0.22);
      torso.add(fray);
    }
  });

  // Hanging Waist Belt Straps below Vest Bottom Hem
  [-0.14, -0.05, 0.05, 0.14].forEach((sx) => {
    const strap = createHiFiMesh(new THREE.BoxGeometry(0.026, 0.13, 0.02), 0x181720, 0.03);
    strap.position.set(sx, 0.02, 0.155);
    strap.rotation.set(0.12, 0, (sx < 0 ? 0.08 : -0.08));
    torso.add(strap);

    const metalTip = createHiFiMesh(
      new THREE.BoxGeometry(0.024, 0.020, 0.022),
      silverMetal,
      0.022,
      null,
      0x000000,
      { isMetallic: true }
    );
    metalTip.position.set(sx, -0.045, 0.162);
    torso.add(metalTip);
  });

  // Studded Notched Lapels brought closer toward center: clean central chest width ~0.14m exposed
  [-1, 1].forEach((side) => {
    // Upper lapel collar connecting up to shoulder strap & collar
    const upperLapel = createHiFiMesh(new THREE.BoxGeometry(0.115, 0.26, 0.032), vestLapelColor, 0.038);
    upperLapel.position.set(side * 0.128, 0.555, 0.180);
    upperLapel.rotation.set(-0.08, side * -0.20, side * 0.15);
    torso.add(upperLapel);

    // Lower notched lapel tab
    const lowerLapel = createHiFiMesh(new THREE.BoxGeometry(0.110, 0.25, 0.030), vestLapelColor, 0.038);
    lowerLapel.position.set(side * 0.130, 0.34, 0.188);
    lowerLapel.rotation.set(-0.04, side * -0.18, side * -0.10);
    torso.add(lowerLapel);

    // 7 Metallic Silver Dome Studs along the outer border of EACH lapel (14 studs total)
    const studYPositions = [0.63, 0.57, 0.51, 0.45, 0.39, 0.33, 0.27];
    studYPositions.forEach((sy, sIdx) => {
      const studGeo = new THREE.SphereGeometry(0.015, 12, 10);
      studGeo.computeVertexNormals();
      const stud = createHiFiMesh(
        studGeo,
        silverMetal,
        0.022,
        null,
        0x000000,
        { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
      );
      const sx = side * (0.165 + (sIdx < 3 ? (3 - sIdx) * 0.012 : 0.0));
      const sz = 0.200 - (sy - 0.45) * 0.05;
      stud.position.set(sx, sy, sz);
      torso.add(stud);
    });
  });

  // Asymmetric Diagonal Silver Zipper on Left Chest / Lapel
  const zipperBar = createHiFiMesh(
    new THREE.BoxGeometry(0.015, 0.26, 0.018),
    silverMetal,
    0.024,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
  );
  zipperBar.position.set(0.118, 0.42, 0.198);
  zipperBar.rotation.set(-0.06, -0.20, -0.20);
  torso.add(zipperBar);

  const zipperPull = createHiFiMesh(
    new THREE.BoxGeometry(0.022, 0.042, 0.020),
    silverMetal,
    0.022,
    null,
    0x000000,
    { isMetallic: true }
  );
  zipperPull.position.set(0.105, 0.47, 0.208);
  zipperPull.rotation.set(-0.06, -0.20, -0.20);
  torso.add(zipperPull);

  // 5 Metallic Silver Conical Spikes Mounted Directly on EACH Vest Shoulder Strap
  [-1, 1].forEach((side) => {
    // 5 conical silver spikes spaced front-to-back directly along the crest of the vest shoulder strap
    [-0.08, -0.04, 0.00, 0.04, 0.08].forEach((sz, spIdx) => {
      const spikeGeo = new THREE.ConeGeometry(0.024, 0.080, 16);
      spikeGeo.computeVertexNormals();
      const spike = createHiFiMesh(
        spikeGeo,
        silverMetal,
        0.024,
        null,
        0x000000,
        { isMetallic: true, glintThreshold: 0.85, glintIntensity: 2.0 }
      );
      const sy = 0.724 + (spIdx === 2 ? 0.008 : 0.0);
      spike.position.set(side * 0.182, sy, sz);
      spike.rotation.set(sz * 0.28, 0, side * -0.24);
      torso.add(spike);
    });
  });

  // Muscular Neck Column connecting Torso to Head (smooth normals)
  const bruiserNeckSlices = [
    [-0.02, 0.068, 0.066, 0.068, 0, 0.005, 2.0],
    [0.08,  0.064, 0.062, 0.064, 0, 0.002, 2.0],
    [0.16,  0.066, 0.064, 0.066, 0, 0.000, 2.0]
  ];
  const neckGeo = createSculptedLoftGeometry(bruiserNeckSlices, 24, false, false, false);
  neckGeo.computeVertexNormals();
  const neckMesh = createHiFiMesh(neckGeo, skinColor, 0.032);
  neckMesh.position.y = 0.69;
  torso.add(neckMesh);

  // ==========================================================================
  // 3. CHISELED HEAD LOFT, PROCEDURAL FACE TEXTURE & 6-LOCK MOHAWK CREST
  // ==========================================================================
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.88;
  torso.add(headGroup);

  // Sculpted Angular Head Loft with Chiseled Jawline, Chin Cleft & Cranium
  const bruiserHeadSlices = [
    // [y, rx, rzFront, rzBack, cx = 0, cz = 0, p = 2.0] (frontIsNegZ = false: Front is +Z)
    [-0.142, 0.042, 0.070, 0.044, 0, 0.016, 2.4], // Broad angular chin tip
    [-0.104, 0.080, 0.092, 0.074, 0, 0.012, 2.5], // Angular jawline / Gonion angle (p=2.5 square)
    [-0.064, 0.096, 0.102, 0.088, 0, 0.006, 2.4], // Grimace mouth level
    [-0.016, 0.102, 0.106, 0.096, 0, 0.002, 2.3], // Cheekbones & nose bridge base
    [0.036,  0.098, 0.104, 0.098, 0, 0.000, 2.2], // Eye level & brow ridge
    [0.082,  0.092, 0.092, 0.094, 0, -0.004, 2.1], // Forehead hairline
    [0.132,  0.064, 0.062, 0.070, 0, -0.008, 2.0]  // Cranium apex under mohawk
  ];
  const headGeo = createSculptedLoftGeometry(bruiserHeadSlices, 32, false, true, true);
  headGeo.computeVertexNormals();
  const headTex = createBruiserHeadUVTexture(idx);
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.034, headTex);
  headGroup.add(headMesh);

  // 3D Sculpted Angular Nose Wedge on Front (+Z)
  const bruiserNosePts = [
    [0.000, 0.004, 0.005, 0.005, 0, 0.000, 2.0],
    [0.014, 0.014, 0.026, 0.008, 0, 0.010, 2.0],
    [0.040, 0.010, 0.016, 0.006, 0, 0.005, 2.0],
    [0.058, 0.004, 0.005, 0.005, 0, 0.000, 2.0]
  ];
  const noseGeo = createSculptedLoftGeometry(bruiserNosePts, 16, false, true, true);
  noseGeo.computeVertexNormals();
  const noseMesh = createHiFiMesh(noseGeo, skinColor, 0.024);
  noseMesh.position.set(0, -0.038, 0.098);
  headGroup.add(noseMesh);

  // Sculpted 3D Ears on Left (+X) and Right (-X)
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.034, 0.009, 0.015, 0.015, 0, 0, 2.0],
      [-0.010, 0.016, 0.024, 0.024, side * -0.004, 0, 2.0],
      [0.020,  0.018, 0.026, 0.026, side * -0.006, 0, 2.0],
      [0.036,  0.010, 0.016, 0.016, 0, 0, 2.0]
    ];
    const earGeo = createSculptedLoftGeometry(earSlices, 16, false, true, true);
    earGeo.computeVertexNormals();
    const ear = createHiFiMesh(earGeo, skinColor, 0.024);
    ear.position.set(side * 0.098, -0.008, -0.005);
    ear.rotation.set(-0.06, side * 0.20, side * -0.12);
    headGroup.add(ear);
  });

  // Multi-Layered Swept-Back Mohawk Crest: 6 Diamond-Faceted Curved Hair Locks
  const mohawkGroup = new THREE.Group();
  headGroup.add(mohawkGroup);

  const mohawkLockSpecs = [
    // { z, y, length, width, thickness, bendZ, rotX }
    { z: 0.085,  y: 0.095, length: 0.160, width: 0.068, thickness: 0.040, bendZ: -0.045, rotX: 0.10 },  // Lock 1 (Forehead)
    { z: 0.055,  y: 0.122, length: 0.210, width: 0.075, thickness: 0.045, bendZ: -0.065, rotX: 0.00 },  // Lock 2 (Front-mid)
    { z: 0.015,  y: 0.138, length: 0.240, width: 0.078, thickness: 0.046, bendZ: -0.080, rotX: -0.14 }, // Lock 3 (Apex crown)
    { z: -0.028, y: 0.132, length: 0.220, width: 0.074, thickness: 0.044, bendZ: -0.075, rotX: -0.30 }, // Lock 4 (Crown-back)
    { z: -0.068, y: 0.112, length: 0.180, width: 0.068, thickness: 0.040, bendZ: -0.060, rotX: -0.48 }, // Lock 5 (Upper occiput)
    { z: -0.098, y: 0.082, length: 0.140, width: 0.060, thickness: 0.035, bendZ: -0.045, rotX: -0.68 }  // Lock 6 (Lower nape)
  ];
  mohawkLockSpecs.forEach(({ z, y, length, width, thickness, bendZ, rotX }) => {
    const lockGeo = createCurvedHairLockGeometry(length, width, thickness, bendZ, 0.0);
    lockGeo.computeVertexNormals();
    const lockMesh = createHiFiMesh(lockGeo, hairDark, 0.034);
    lockMesh.position.set(0, y, z);
    lockMesh.rotation.x = rotX;
    mohawkGroup.add(lockMesh);
  });

  // ==========================================================================
  // 4. TWO-SEGMENT MUSCULAR ARMS & MUAY-THAI BANDAGE WRAPS (radialSegments >= 20)
  // Calibrated athletic brawler proportions (~22% reduced deltoid/bicep radius)
  // ==========================================================================
  function buildBruiserArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 0.62, 0); // Emerges naturally from sleeveless vest armhole

    // Anatomical Deltoid Cap (~22% reduced radius: 0.100m, radialSegments >= 20, smooth normals)
    const deltoidGeo = new THREE.SphereGeometry(0.100, 24, 18);
    deltoidGeo.computeVertexNormals();
    const deltoid = createHiFiMesh(deltoidGeo, skinColor, 0.038);
    deltoid.scale.set(1.0, 1.12, 0.95);
    deltoid.position.set(side * 0.012, -0.032, 0);
    shoulder.add(deltoid);

    // Muscular Bicep & Tricep (~22% reduced radius: 0.094/0.083m, radialSegments >= 20, smooth normals)
    const bicepGeo = new THREE.CylinderGeometry(0.094, 0.083, 0.32, 24, 2);
    bicepGeo.computeVertexNormals();
    const bicep = createHiFiMesh(bicepGeo, skinColor, 0.042);
    bicep.position.y = -0.17;
    shoulder.add(bicep);

    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);

    // Forearm in Dark Muay-Thai Charcoal Underwrap (radialSegments >= 20, smooth normals)
    const wrapGeo = new THREE.CylinderGeometry(0.088, 0.076, 0.34, 24, 2);
    wrapGeo.computeVertexNormals();
    const forearm = createHiFiMesh(wrapGeo, 0x1c1b22, 0.042);
    forearm.position.y = -0.17;
    elbow.add(forearm);

    // 6 Crisscrossing White Muay-Thai Athletic Bandages (radialSegments >= 20)
    const bandageWhite = 0xedeae2;
    [-0.06, -0.11, -0.16, -0.21, -0.26, -0.30].forEach((wy, wIdx) => {
      const stripeGeo = new THREE.CylinderGeometry(0.091 - wIdx * 0.0025, 0.091 - wIdx * 0.0025, 0.032, 22);
      stripeGeo.computeVertexNormals();
      const stripe = createHiFiMesh(stripeGeo, bandageWhite, 0.030);
      stripe.position.y = wy;
      stripe.rotation.z = (wIdx % 2 === 0 ? 0.08 : -0.08) * side;
      elbow.add(stripe);
    });

    // Articulated Clenched Combat Fist with Knuckle Tape
    const hand = new THREE.Group();
    hand.position.y = -0.36;
    elbow.add(hand);

    // Wrist Tape Band (radialSegments >= 20)
    const wristTapeGeo = new THREE.CylinderGeometry(0.080, 0.080, 0.045, 22);
    wristTapeGeo.computeVertexNormals();
    const wristTape = createHiFiMesh(wristTapeGeo, bandageWhite, 0.030);
    wristTape.position.y = 0.02;
    hand.add(wristTape);

    // Clenched Taped Palm
    const palm = createHiFiMesh(new THREE.BoxGeometry(0.114, 0.098, 0.098), 0x18171f, 0.040);
    hand.add(palm);

    // 4 Distinct Curled Fingers with White Athletic Knuckle Tape
    [-0.035, -0.012, 0.012, 0.035].forEach((fx) => {
      const finger = createHiFiMesh(new THREE.BoxGeometry(0.022, 0.038, 0.028), 0x22202a, 0.026);
      finger.position.set(fx, -0.038, 0.042);
      finger.rotation.x = 0.58;
      hand.add(finger);

      const tape = createHiFiMesh(new THREE.BoxGeometry(0.024, 0.019, 0.031), bandageWhite, 0.022);
      tape.position.set(fx, -0.033, 0.045);
      tape.rotation.x = 0.58;
      hand.add(tape);
    });

    // Articulated Taped Thumb tucked over fingers
    const thumb = createHiFiMesh(new THREE.BoxGeometry(0.028, 0.036, 0.028), 0x22202a, 0.026);
    thumb.position.set(-side * 0.054, -0.010, 0.030);
    thumb.rotation.set(0.25, -side * 0.35, 0);
    hand.add(thumb);

    const thumbTape = createHiFiMesh(new THREE.BoxGeometry(0.030, 0.021, 0.032), bandageWhite, 0.020);
    thumbTape.position.set(-side * 0.054, -0.010, 0.033);
    thumbTape.rotation.set(0.25, -side * 0.35, 0);
    hand.add(thumbTape);

    return { shoulder, elbow, fist: hand, hand };
  }

  const leftArmObj = buildBruiserArm(-1);
  const rightArmObj = buildBruiserArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // ==========================================================================
  // 5. TAPERED CARGO PANTS, ASYMMETRIC RIGHT KNEE ARMOR & COMBAT BOOTS
  // ==========================================================================
  function buildBruiserLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.15, 0, 0);

    // Baggy Tapered Cargo Thigh with Cloth Crease Folds (radialSegments >= 20)
    const thighGeo = new THREE.CylinderGeometry(0.165, 0.135, 0.48, 24);
    thighGeo.computeVertexNormals();
    const thigh = createHiFiMesh(thighGeo, pantsColor, 0.044);
    thigh.position.y = -0.24;
    hipJoint.add(thigh);

    // Thigh cloth fold ring (radialSegments >= 20)
    const thighFoldGeo = new THREE.CylinderGeometry(0.170, 0.164, 0.06, 24);
    thighFoldGeo.computeVertexNormals();
    const thighFold = createHiFiMesh(thighFoldGeo, pantsColor, 0.032);
    thighFold.position.y = -0.16;
    hipJoint.add(thighFold);

    // Outer-Thigh Cargo Flap Pocket
    const cargoPocket = createHiFiMesh(new THREE.BoxGeometry(0.080, 0.19, 0.16), 0x14151e, 0.038);
    cargoPocket.position.set(side * 0.145, -0.22, 0);
    hipJoint.add(cargoPocket);

    const pocketFlap = createHiFiMesh(new THREE.BoxGeometry(0.085, 0.045, 0.165), 0x101118, 0.032);
    pocketFlap.position.set(side * 0.150, -0.12, 0);
    pocketFlap.rotation.z = side * -0.06;
    hipJoint.add(pocketFlap);

    const pocketSnap = createHiFiMesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      silverMetal,
      0.02,
      null,
      0x000000,
      { isMetallic: true }
    );
    pocketSnap.position.set(side * 0.195, -0.13, 0);
    hipJoint.add(pocketSnap);

    const kneeJoint = new THREE.Group();
    kneeJoint.position.y = -0.48;
    hipJoint.add(kneeJoint);

    // ASYMMETRIC KNEE ARMOR SPECIFICATION:
    // Right Knee (side === 1) gets Armored Hardshell Pad with 4 Silver Rivets.
    // Left Knee (side === -1) gets UNARMORED Cargo Pants Cloth folds!
    if (side === 1) {
      // Molded Charcoal-Grey Hardshell Knee Guard
      const kneePad = createHiFiMesh(new THREE.BoxGeometry(0.16, 0.145, 0.065), 0x484b56, 0.040);
      kneePad.position.set(0, 0.02, 0.125);
      kneeJoint.add(kneePad);

      // 4 Corner Silver Rivets on Knee Armor Plate
      [-0.052, 0.052].forEach((rx) => {
        [-0.042, 0.042].forEach((ry) => {
          const rivetGeo = new THREE.SphereGeometry(0.014, 8, 8);
          rivetGeo.computeVertexNormals();
          const rivet = createHiFiMesh(
            rivetGeo,
            silverMetal,
            0.022,
            null,
            0x000000,
            { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
          );
          rivet.position.set(rx, 0.02 + ry, 0.158);
          kneeJoint.add(rivet);
        });
      });

      // Black Elastic Knee Pad Retention Strap (radialSegments >= 20)
      const kneeStrapGeo = new THREE.CylinderGeometry(0.138, 0.138, 0.05, 24);
      kneeStrapGeo.computeVertexNormals();
      const kneeStrap = createHiFiMesh(kneeStrapGeo, 0x121216, 0.032);
      kneeStrap.position.set(0, 0.02, 0);
      kneeJoint.add(kneeStrap);
    } else {
      // Left Knee: Unarmored Cargo Pants Cloth Knee Flexion Folds (radialSegments >= 20)
      const kneeFoldGeo = new THREE.CylinderGeometry(0.142, 0.136, 0.08, 24);
      kneeFoldGeo.computeVertexNormals();
      const kneeFold = createHiFiMesh(kneeFoldGeo, pantsColor, 0.035);
      kneeFold.position.set(0, 0.02, 0.01);
      kneeJoint.add(kneeFold);
    }

    // Lower Calf & Bloused Pant Leg Cuff over Boot (radialSegments >= 20)
    const calfGeo = new THREE.CylinderGeometry(0.138, 0.120, 0.38, 24);
    calfGeo.computeVertexNormals();
    const calf = createHiFiMesh(calfGeo, pantsColor, 0.044);
    calf.position.y = -0.18;
    kneeJoint.add(calf);

    const blousedCuffGeo = new THREE.CylinderGeometry(0.146, 0.140, 0.07, 24);
    blousedCuffGeo.computeVertexNormals();
    const blousedCuff = createHiFiMesh(blousedCuffGeo, pantsColor, 0.035);
    blousedCuff.position.y = -0.34;
    kneeJoint.add(blousedCuff);

    // Heavy Laced Brawler Combat Boot
    const boot = new THREE.Group();
    boot.position.set(0, -0.44, 0.02);
    kneeJoint.add(boot);

    // Thick Lugged Rubber Outsole
    const sole = createHiFiMesh(new THREE.BoxGeometry(0.24, 0.09, 0.44), 0x0c0b0e, 0.048);
    sole.position.y = -0.045;
    boot.add(sole);

    // Midsole Welt Line
    const welt = createHiFiMesh(new THREE.BoxGeometry(0.23, 0.02, 0.42), 0x22222a, 0.025);
    welt.position.y = 0.005;
    boot.add(welt);

    // Combat Boot Leather Upper & Shaft
    const upper = createHiFiMesh(new THREE.BoxGeometry(0.21, 0.17, 0.36), 0x18171f, 0.048);
    upper.position.set(0, 0.08, 0.02);
    boot.add(upper);

    // Tapered Toe Box
    const toeBox = createHiFiMesh(new THREE.BoxGeometry(0.20, 0.11, 0.17), 0x14131a, 0.040);
    toeBox.position.set(0, 0.04, 0.135);
    boot.add(toeBox);

    // Front Boot Laces with Silver Eyelets
    [-0.038, 0.038].forEach((lx) => {
      [0.05, 0.09, 0.13, 0.17].forEach((ly, lIdx) => {
        const eyeletGeo = new THREE.SphereGeometry(0.009, 8, 8);
        eyeletGeo.computeVertexNormals();
        const eyelet = createHiFiMesh(
          eyeletGeo,
          silverMetal,
          0.018,
          null,
          0x000000,
          { isMetallic: true }
        );
        eyelet.position.set(lx, ly, 0.135 - lIdx * 0.025);
        boot.add(eyelet);
      });
    });

    // Dark crisscrossed front laces
    const laceGeo = new THREE.BoxGeometry(0.080, 0.014, 0.014);
    [0.05, 0.09, 0.13, 0.17].forEach((ly, lIdx) => {
      const lace = createHiFiMesh(laceGeo, 0x0a0a0e, 0.02);
      lace.position.set(0, ly, 0.135 - lIdx * 0.025);
      lace.rotation.z = (lIdx % 2 === 0 ? 0.25 : -0.25);
      boot.add(lace);
    });

    return { hipJoint, kneeJoint, boot };
  }

  const leftLegObj = buildBruiserLeg(-1);
  const rightLegObj = buildBruiserLeg(1);
  hips.add(leftLegObj.hipJoint);
  hips.add(rightLegObj.hipJoint);

  return {
    rig: {
      root,
      contactShadowDecal,
      hips,
      torso,
      headGroup,
      leftArm: leftArmObj.shoulder,
      leftElbow: leftArmObj.elbow,
      rightArm: rightArmObj.shoulder,
      rightElbow: rightArmObj.elbow,
      leftLeg: leftLegObj.hipJoint,
      leftKnee: leftLegObj.kneeJoint,
      rightLeg: rightLegObj.hipJoint,
      rightKnee: rightLegObj.kneeJoint
    }
  };
}

// Export alias matching ORIGINAL_REQUEST.md & PROJECT.md
export const createBruiserModel = buildBruiserModel;

// ============================================================================
// ENHANCED CHEERING CROWD SPECTATOR PROCEDURAL 3D MODEL
// 6 Streetwear Styles, Accessories (Caps, Shades), Sneakers & Articulated Arms
// ============================================================================

let spectatorCounter = 0;
const _spectatorFaceTexCache = {};

// Palette defense mapping neon legacy colors to grounded urban block-party palette
const SPECTATOR_COLOR_NORMALIZER = {
  0xff2a85: 0xc26a2b, // Burnt Ochre
  0xff007f: 0xc26a2b,
  0x00f0ff: 0x3b4d66, // Slate Denim
  0x2ef064: 0x4a5d3f, // Olive Drab
  0x00ff66: 0x4a5d3f,
  0xffd700: 0xd49b35, // Warm Mustard
  0xffd428: 0xd49b35,
  0x9b51e0: 0x9e3328, // Terracotta Crimson
  0x9d4edd: 0x9e3328,
  0x38b6ff: 0x3b4d66, // Slate Denim
  0xe03228: 0x9e3328, // Terracotta Crimson
  0xff6b00: 0xc26a2b  // Burnt Ochre
};

/**
 * Procedural 256x256 Cel-Shaded Graphic-Novel Face Texture Canvas for Crowd Spectators.
 * Generates expressive anime/comic eyes, raised eyebrows, smiles, and stylized sunglasses.
 */
function createSpectatorFaceTexture(skinHex = 0xd89c74, styleIdx = 0) {
  const cacheKey = `${skinHex}_${styleIdx}`;
  if (_spectatorFaceTexCache[cacheKey]) return _spectatorFaceTexCache[cacheKey];

  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Convert hex to CSS hex string
  const skinCss = '#' + skinHex.toString(16).padStart(6, '0');

  // 1. Base Warm Skin Fill
  ctx.fillStyle = skinCss;
  ctx.fillRect(0, 0, 256, 256);

  if (styleIdx === 2) {
    // STYLE 2: Sleek Streetwear Sunglasses / Wrap-Around Shades (Centered on Front Face)
    // Dark frame centered at x = 128 (width 88px, covering +/- 62 deg)
    ctx.fillStyle = '#121218';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(84, 94, 88, 46, 6);
    } else {
      ctx.rect(84, 94, 88, 46);
    }
    ctx.fill();

    // Polarized lenses
    ctx.fillStyle = '#1c1e2a';
    ctx.fillRect(89, 99, 36, 36);
    ctx.fillRect(131, 99, 36, 36);

    // Diagonal specular reflections across lenses
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.moveTo(98, 99);
    ctx.lineTo(107, 99);
    ctx.lineTo(97, 135);
    ctx.lineTo(88, 135);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(140, 99);
    ctx.lineTo(149, 99);
    ctx.lineTo(139, 135);
    ctx.lineTo(130, 135);
    ctx.closePath();
    ctx.fill();

    // Frame center bridge
    ctx.fillStyle = '#2a2b38';
    ctx.fillRect(123, 105, 10, 8);

    // Smiling grin mouth below sunglasses
    ctx.strokeStyle = '#1a0e0a';
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(114, 178);
    ctx.quadraticCurveTo(128, 196, 142, 178);
    ctx.stroke();

    // White teeth smile glint
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(119, 179);
    ctx.quadraticCurveTo(128, 188, 137, 179);
    ctx.lineTo(135, 183);
    ctx.quadraticCurveTo(128, 191, 121, 183);
    ctx.closePath();
    ctx.fill();
  } else {
    // STYLES 0, 1, 3, 4, 5, 6: Expressive Cel-Shaded Comic Eyes & Eyebrows (Centered at x=128 +/- 24)
    const isCheering = styleIdx === 0 || styleIdx === 3 || styleIdx === 5;

    // Eyebrows centered symmetrically
    [-1, 1].forEach((side) => {
      const bx = 128 + side * 22;
      ctx.strokeStyle = '#18100c';
      ctx.lineWidth = 4.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (isCheering) {
        // High arched hyped eyebrow
        ctx.moveTo(128 + side * 8, 90);
        ctx.quadraticCurveTo(bx, 74, bx + side * 14, 82);
      } else {
        // Confident, engaged brow
        ctx.moveTo(128 + side * 8, 87);
        ctx.quadraticCurveTo(bx, 77, bx + side * 14, 81);
      }
      ctx.stroke();
    });

    // Almond Anime Eyes centered on front of skull
    [-1, 1].forEach((side) => {
      const ex = 128 + side * 22;
      const ey = 112;

      // Sclera
      ctx.fillStyle = '#f5f6fa';
      ctx.beginPath();
      ctx.moveTo(ex - side * 12, ey);
      ctx.quadraticCurveTo(ex, ey - 9, ex + side * 12, ey - 3);
      ctx.quadraticCurveTo(ex + side * 9, ey + 8, ex, ey + 8);
      ctx.quadraticCurveTo(ex - side * 7, ey + 6, ex - side * 12, ey);
      ctx.closePath();
      ctx.fill();

      // Iris & Pupil
      ctx.fillStyle = '#1e1410';
      ctx.beginPath();
      ctx.arc(ex - side * 1.5, ey + 1, 5.2, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex - side * 3.0, ey - 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Upper graphic eyeliner
      ctx.strokeStyle = '#100c08';
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - side * 13, ey + 1);
      ctx.quadraticCurveTo(ex, ey - 9, ex + side * 13, ey - 3);
      ctx.stroke();

      // Lower lid mark
      ctx.strokeStyle = 'rgba(24, 16, 12, 0.45)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ex - side * 6, ey + 8);
      ctx.lineTo(ex + side * 6, ey + 8);
      ctx.stroke();
    });

    // Graphic-novel nose bridge mark
    ctx.strokeStyle = 'rgba(28, 18, 12, 0.65)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(128, 134);
    ctx.lineTo(130, 142);
    ctx.lineTo(125, 146);
    ctx.stroke();

    // Mouth Expression centered on front of face
    if (isCheering) {
      // Wide open cheering mouth shouting in hype
      ctx.fillStyle = '#220e0e';
      ctx.beginPath();
      ctx.moveTo(115, 174);
      ctx.quadraticCurveTo(128, 166, 141, 174);
      ctx.quadraticCurveTo(128, 206, 115, 174);
      ctx.closePath();
      ctx.fill();

      // White upper teeth row
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(119, 174, 18, 6);

      // Dark mouth outline
      ctx.strokeStyle = '#140808';
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.moveTo(115, 174);
      ctx.quadraticCurveTo(128, 166, 141, 174);
      ctx.quadraticCurveTo(128, 206, 115, 174);
      ctx.stroke();
    } else {
      // Confident smile with teeth
      ctx.strokeStyle = '#180c08';
      ctx.lineWidth = 3.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(115, 178);
      ctx.quadraticCurveTo(128, 196, 141, 178);
      ctx.stroke();

      // White teeth
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(120, 179);
      ctx.quadraticCurveTo(128, 187, 136, 179);
      ctx.lineTo(134, 183);
      ctx.quadraticCurveTo(128, 190, 122, 183);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _spectatorFaceTexCache[cacheKey] = tex;
  return tex;
}

export function buildSpectatorModel(
  shirtHex = 0xc26a2b,
  pantsHex = 0x22242a,
  skinHex = 0xd89c74,
  styleIdx = null
) {
  // Normalize neon colors if passed
  if (SPECTATOR_COLOR_NORMALIZER[shirtHex]) shirtHex = SPECTATOR_COLOR_NORMALIZER[shirtHex];
  if (SPECTATOR_COLOR_NORMALIZER[pantsHex]) pantsHex = SPECTATOR_COLOR_NORMALIZER[pantsHex];

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  const style = styleIdx !== null ? (Math.abs(styleIdx) % 7) : (spectatorCounter++ % 7);

  // 1. Torso Geometry with 3 Streetwear Silhouettes:
  // - Hoodies (Styles 3, 5): kangaroo pouch, drawstrings, ribbed hem
  // - Bomber Jackets (Styles 1, 4): puffy shell, ribbed collar/hem, front zipper
  // - Layered Streetwear Tees (Styles 0, 2, 6): tapered tee, crewneck collar band
  const torso = new THREE.Group();
  torso.position.y = 0.04;
  hips.add(torso);

  if (style === 3 || style === 5) {
    // STREETWEAR HOODIE
    const hoodieGeo = new THREE.CylinderGeometry(0.24, 0.19, 0.66, 20);
    hoodieGeo.computeVertexNormals();
    const hoodieMesh = createHiFiMesh(hoodieGeo, shirtHex, 0.044);
    hoodieMesh.position.y = 0.33;
    torso.add(hoodieMesh);

    // Kangaroo front pouch pocket
    const pouchGeo = new THREE.BoxGeometry(0.22, 0.14, 0.042);
    pouchGeo.computeVertexNormals();
    const pouch = createHiFiMesh(pouchGeo, shirtHex, 0.038);
    pouch.position.set(0, 0.23, 0.142);
    torso.add(pouch);

    // Ribbed bottom hem
    const hemGeo = new THREE.CylinderGeometry(0.196, 0.190, 0.07, 20);
    hemGeo.computeVertexNormals();
    const hem = createHiFiMesh(hemGeo, shirtHex, 0.035);
    hem.position.y = 0.035;
    torso.add(hem);

    // Cream drawstrings hanging down chest
    [-0.035, 0.035].forEach((dx) => {
      const stringGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.16, 12);
      stringGeo.computeVertexNormals();
      const stringMesh = createHiFiMesh(stringGeo, 0xe8e2d4, 0.016);
      stringMesh.position.set(dx, 0.48, 0.165);
      torso.add(stringMesh);

      // Silver aglet tip
      const aglet = createHiFiMesh(new THREE.CylinderGeometry(0.009, 0.009, 0.024, 10), 0xdce0ea, 0.014);
      aglet.position.set(dx, 0.39, 0.165);
      torso.add(aglet);
    });

    if (style === 3) {
      // Relaxed folded hood around back of neck
      const hoodRingGeo = new THREE.TorusGeometry(0.19, 0.055, 10, 20);
      hoodRingGeo.computeVertexNormals();
      const hoodRing = createHiFiMesh(hoodRingGeo, shirtHex, 0.040);
      hoodRing.position.set(0, 0.67, -0.05);
      hoodRing.rotation.x = Math.PI * 0.38;
      torso.add(hoodRing);
    }
  } else if (style === 1 || style === 4) {
    // STREETWEAR BOMBER JACKET
    const jacketGeo = new THREE.CylinderGeometry(0.255, 0.210, 0.64, 20);
    jacketGeo.computeVertexNormals();
    const jacketMesh = createHiFiMesh(jacketGeo, shirtHex, 0.044);
    jacketMesh.position.y = 0.34;
    torso.add(jacketMesh);

    // Ribbed knit collar
    const collarGeo = new THREE.TorusGeometry(0.135, 0.034, 10, 20);
    collarGeo.computeVertexNormals();
    const collar = createHiFiMesh(collarGeo, 0x22242a, 0.034);
    collar.position.set(0, 0.66, 0.01);
    collar.rotation.x = Math.PI * 0.45;
    torso.add(collar);

    // Metallic center zipper line
    const zipperGeo = new THREE.BoxGeometry(0.014, 0.58, 0.018);
    const zipper = createHiFiMesh(zipperGeo, 0xdce0ea, 0.022);
    zipper.position.set(0, 0.34, 0.185);
    torso.add(zipper);

    // Ribbed knit bottom waistband hem
    const hemGeo = new THREE.CylinderGeometry(0.216, 0.216, 0.08, 20);
    hemGeo.computeVertexNormals();
    const hem = createHiFiMesh(hemGeo, 0x22242a, 0.035);
    hem.position.y = 0.01;
    torso.add(hem);
  } else {
    // LAYERED STREETWEAR TEE / LONG-SLEEVE
    const teeGeo = new THREE.CylinderGeometry(0.245, 0.214, 0.65, 20);
    teeGeo.computeVertexNormals();
    const teeMesh = createHiFiMesh(teeGeo, shirtHex, 0.044);
    teeMesh.position.y = 0.34;
    torso.add(teeMesh);

    // Contrasting crewneck collar trim
    const crewGeo = new THREE.TorusGeometry(0.125, 0.024, 8, 20);
    crewGeo.computeVertexNormals();
    const crew = createHiFiMesh(crewGeo, 0xe8e2d4, 0.030);
    crew.position.set(0, 0.66, 0.01);
    crew.rotation.x = Math.PI * 0.45;
    torso.add(crew);

    // Bottom hem trim
    const hemGeo = new THREE.CylinderGeometry(0.216, 0.216, 0.08, 20);
    hemGeo.computeVertexNormals();
    const hem = createHiFiMesh(hemGeo, shirtHex, 0.035);
    hem.position.y = 0.01;
    torso.add(hem);
  }

  // 1b. Stationary Shoulder Sockets on Torso (prevents any gaps when arms raise)
  [-1, 1].forEach((side) => {
    const socketGeo = new THREE.SphereGeometry(0.076, 16, 12);
    socketGeo.computeVertexNormals();
    const socket = createHiFiMesh(socketGeo, shirtHex, 0.040);
    socket.position.set(side * 0.23, 0.58, 0);
    torso.add(socket);
  });

  // 1c. Solid Pelvis / Waist-Hip Block on Hips (eliminates horizontal air gaps between shirt and pants)
  const pelvisGeo = new THREE.CylinderGeometry(0.198, 0.194, 0.20, 20);
  pelvisGeo.computeVertexNormals();
  const pelvis = createHiFiMesh(pelvisGeo, pantsHex, 0.042);
  pelvis.scale.set(1.0, 1.0, 0.84);
  pelvis.position.y = 0.01;
  hips.add(pelvis);

  // 2. Sculpted Head with Cel-Shaded Procedural Face & 7 Diverse Urban Hair/Headwear Styles
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.86;
  torso.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.18, 24, 18);
  headGeo.computeVertexNormals();
  const faceTex = createSpectatorFaceTexture(skinHex, style);
  const head = createHiFiMesh(headGeo, 0xffffff, 0.038, faceTex);
  head.rotation.y = -Math.PI / 2; // Aligns procedural face features directly to +Z (Front)
  headGroup.add(head);

  if (style === 0) {
    // STYLE 0: Backwards Snapback Cap with Brim (sits cleanly above eyebrows/eyes)
    const capGeo = new THREE.SphereGeometry(0.186, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.44);
    capGeo.computeVertexNormals();
    const cap = createHiFiMesh(capGeo, shirtHex, 0.042);
    cap.position.set(0, 0.055, 0);
    headGroup.add(cap);

    const buttonGeo = new THREE.SphereGeometry(0.018, 10, 10);
    const button = createHiFiMesh(buttonGeo, 0xe8e2d4, 0.020);
    button.position.set(0, 0.240, 0);
    headGroup.add(button);

    const visorGeo = new THREE.BoxGeometry(0.17, 0.022, 0.13);
    const visor = createHiFiMesh(visorGeo, shirtHex, 0.036);
    visor.position.set(0, 0.092, -0.185);
    visor.rotation.x = 0.16;
    headGroup.add(visor);

    // Hair peeking from beneath backwards cap (back and sides)
    const hairGeo = new THREE.SphereGeometry(0.184, 14, 10, Math.PI * 0.45, Math.PI * 1.1, Math.PI * 0.36, Math.PI * 0.36);
    const hair = createHiFiMesh(hairGeo, 0x221814, 0.04);
    hair.position.set(0, 0.04, -0.02);
    headGroup.add(hair);
  } else if (style === 1) {
    // STYLE 1: Forwards Snapback Cap with Curved Visor (sits cleanly above eyebrows/eyes)
    const capGeo = new THREE.SphereGeometry(0.186, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.44);
    capGeo.computeVertexNormals();
    const cap = createHiFiMesh(capGeo, 0x3b4d66, 0.042);
    cap.position.set(0, 0.055, 0);
    headGroup.add(cap);

    const buttonGeo = new THREE.SphereGeometry(0.018, 10, 10);
    const button = createHiFiMesh(buttonGeo, 0xd49b35, 0.020);
    button.position.set(0, 0.240, 0);
    headGroup.add(button);

    const visorGeo = new THREE.BoxGeometry(0.18, 0.022, 0.14);
    const visor = createHiFiMesh(visorGeo, 0x3b4d66, 0.036);
    visor.position.set(0, 0.098, 0.185);
    visor.rotation.x = -0.14;
    headGroup.add(visor);

    const patchGeo = new THREE.BoxGeometry(0.055, 0.040, 0.015);
    const patch = createHiFiMesh(patchGeo, 0xe8e2d4, 0.022);
    patch.position.set(0, 0.155, 0.182);
    headGroup.add(patch);
  } else if (style === 2) {
    // STYLE 2: Snug Ribbed Streetwear Beanie with Fold-Up Cuff & Sunglasses (+0.04m elevated)
    const beanieGeo = new THREE.CylinderGeometry(0.165, 0.178, 0.14, 22);
    beanieGeo.computeVertexNormals();
    const beanie = createHiFiMesh(beanieGeo, 0xd49b35, 0.044);
    beanie.position.set(0, 0.14, 0);
    headGroup.add(beanie);

    const domeGeo = new THREE.SphereGeometry(0.166, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    domeGeo.computeVertexNormals();
    const dome = createHiFiMesh(domeGeo, 0xd49b35, 0.042);
    dome.position.set(0, 0.21, 0);
    headGroup.add(dome);

    const cuffGeo = new THREE.TorusGeometry(0.180, 0.018, 12, 24);
    cuffGeo.computeVertexNormals();
    const cuff = createHiFiMesh(cuffGeo, 0xd49b35, 0.038);
    cuff.position.set(0, 0.075, 0);
    cuff.rotation.x = Math.PI * 0.5;
    headGroup.add(cuff);

    const tagGeo = new THREE.BoxGeometry(0.032, 0.024, 0.012);
    const tag = createHiFiMesh(tagGeo, 0x22242a, 0.020);
    tag.position.set(0, 0.075, 0.186);
    headGroup.add(tag);
  } else if (style === 3) {
    // STYLE 3: Sculpted Volumetric Afro (Framing head with face clearly visible)
    // Raised by +0.055m on Y (0.12 -> 0.175) and shifted -0.03m on Z (-0.065 -> -0.095)
    const afroGeo = new THREE.SphereGeometry(0.220, 22, 18);
    afroGeo.computeVertexNormals();
    const afro = createHiFiMesh(afroGeo, 0x161210, 0.048);
    afro.position.set(0, 0.175, -0.095);
    headGroup.add(afro);

    // Natural secondary texture lobes elevated proportionally
    [
      [-0.14, 0.195, -0.09], [0.14, 0.195, -0.09],
      [0, 0.275, -0.10], [0, 0.175, -0.18]
    ].forEach(([lx, ly, lz]) => {
      const lobeGeo = new THREE.SphereGeometry(0.095, 12, 10);
      lobeGeo.computeVertexNormals();
      const lobe = createHiFiMesh(lobeGeo, 0x161210, 0.040);
      lobe.position.set(lx, ly, lz);
      headGroup.add(lobe);
    });
  } else if (style === 4) {
    // STYLE 4: High-Top Fade (+0.04m elevated, shifted slightly back on -Z to clear forehead/brows)
    const fadeGeo = new THREE.CylinderGeometry(0.165, 0.178, 0.17, 24);
    fadeGeo.computeVertexNormals();
    const fade = createHiFiMesh(fadeGeo, 0x181412, 0.044);
    fade.position.set(0, 0.16, -0.03);
    headGroup.add(fade);

    const topCapGeo = new THREE.CircleGeometry(0.165, 22);
    topCapGeo.rotateX(-Math.PI / 2);
    const topCap = createHiFiMesh(topCapGeo, 0x201a16, 0.036);
    topCap.position.set(0, 0.245, -0.03);
    headGroup.add(topCap);
  } else if (style === 5) {
    // STYLE 5: Pulled-Up Hoodie Hood (Framing face with open front, clear of eyes)
    const hoodGeo = new THREE.SphereGeometry(0.225, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.75);
    hoodGeo.computeVertexNormals();
    const hoodMesh = createHiFiMesh(hoodGeo, shirtHex, 0.046);
    hoodMesh.position.set(0, 0.09, -0.08);
    headGroup.add(hoodMesh);

    // Hood opening face binding rim
    const rimGeo = new THREE.TorusGeometry(0.175, 0.026, 12, 22);
    rimGeo.computeVertexNormals();
    const rim = createHiFiMesh(rimGeo, shirtHex, 0.040);
    rim.position.set(0, 0.06, 0.07);
    rim.rotation.x = 0.15;
    headGroup.add(rim);
  } else {
    // STYLE 6: Swept-Back Braids / Ponytail
    const hairGeo = new THREE.SphereGeometry(0.185, 20, 16);
    hairGeo.computeVertexNormals();
    const hair = createHiFiMesh(hairGeo, 0x1e1510, 0.045);
    hair.position.set(0, 0.08, -0.035);
    headGroup.add(hair);

    const tieGeo = new THREE.TorusGeometry(0.042, 0.016, 10, 18);
    tieGeo.computeVertexNormals();
    const tie = createHiFiMesh(tieGeo, 0xd49b35, 0.026);
    tie.position.set(0, 0.06, -0.19);
    tie.rotation.x = Math.PI * 0.45;
    headGroup.add(tie);

    const tailGeo = new THREE.CylinderGeometry(0.038, 0.022, 0.25, 14);
    tailGeo.computeVertexNormals();
    const tail = createHiFiMesh(tailGeo, 0x1e1510, 0.038);
    tail.position.set(0.02, -0.06, -0.23);
    tail.rotation.x = -0.35;
    headGroup.add(tail);
  }

  // 3. Two-Segment Articulated Cheering Arms with Deltoid Shoulders & Clenched Fists
  // Fixed pivot at shoulder center (0, 0, 0) guaranteeing 100% continuous socket connection
  function buildSpectatorArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.24, 0.58, 0);

    // Anatomical Deltoid Shoulder Cap centered at pivot (0, 0, 0)
    const deltoidGeo = new THREE.SphereGeometry(0.076, 18, 14);
    deltoidGeo.computeVertexNormals();
    const deltoid = createHiFiMesh(deltoidGeo, shirtHex, 0.042);
    shoulder.add(deltoid);

    // Upper arm starting right at shoulder center y = 0 down to y = -0.26
    const upperGeo = new THREE.CylinderGeometry(0.072, 0.062, 0.26, 18);
    upperGeo.computeVertexNormals();
    const upperArm = createHiFiMesh(upperGeo, shirtHex, 0.042);
    upperArm.position.y = -0.13;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    // Forearm extending down from elbow pivot (0, 0, 0)
    const forearmColor = (style === 1 || style === 3 || style === 5) ? shirtHex : skinHex;
    const foreGeo = new THREE.CylinderGeometry(0.064, 0.054, 0.24, 18);
    foreGeo.computeVertexNormals();
    const forearm = createHiFiMesh(foreGeo, forearmColor, 0.042);
    forearm.position.y = -0.12;
    elbow.add(forearm);

    // Clenched Cheering Fist at forearm end
    const hand = new THREE.Group();
    hand.position.y = -0.24;
    elbow.add(hand);

    const palmGeo = new THREE.BoxGeometry(0.078, 0.072, 0.068);
    const palm = createHiFiMesh(palmGeo, skinHex, 0.038);
    hand.add(palm);

    const thumbGeo = new THREE.BoxGeometry(0.024, 0.038, 0.028);
    const thumb = createHiFiMesh(thumbGeo, skinHex, 0.026);
    thumb.position.set(-side * 0.036, 0.005, 0.022);
    hand.add(thumb);

    const knuckleGeo = new THREE.BoxGeometry(0.068, 0.018, 0.024);
    const knuckle = createHiFiMesh(knuckleGeo, skinHex, 0.024);
    knuckle.position.set(0, -0.030, 0.028);
    hand.add(knuckle);

    // Wrist accessory: digital watch or wristband
    if (side === -1 && (style === 0 || style === 4)) {
      const watch = createHiFiMesh(new THREE.BoxGeometry(0.032, 0.022, 0.032), 0x181820, 0.022);
      watch.position.set(0, 0.04, 0.028);
      hand.add(watch);
    } else if (style === 2 || style === 6) {
      const band = createHiFiMesh(new THREE.CylinderGeometry(0.062, 0.062, 0.028, 16), 0xd49b35, 0.020);
      band.position.y = 0.04;
      hand.add(band);
    }

    return { shoulder, elbow, hand };
  }

  const leftArmObj = buildSpectatorArm(-1);
  const rightArmObj = buildSpectatorArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // 4. Legs with Tapered Jeans/Pants & Two-Tone Rubber Sole Streetwear Sneakers
  [-0.102, 0.102].forEach((lx) => {
    // Upper thigh reaching cleanly up into the pelvis block without lateral overhang
    const thighGeo = new THREE.CylinderGeometry(0.092, 0.088, 0.42, 18);
    thighGeo.computeVertexNormals();
    const thigh = createHiFiMesh(thighGeo, pantsHex, 0.042);
    thigh.position.set(lx, -0.19, 0);
    hips.add(thigh);

    // Knee cloth fold
    const kneeGeo = new THREE.CylinderGeometry(0.092, 0.088, 0.06, 18);
    kneeGeo.computeVertexNormals();
    const knee = createHiFiMesh(kneeGeo, pantsHex, 0.035);
    knee.position.set(lx, -0.40, 0.005);
    hips.add(knee);

    // Lower calf
    const calfGeo = new THREE.CylinderGeometry(0.088, 0.076, 0.38, 18);
    calfGeo.computeVertexNormals();
    const calf = createHiFiMesh(calfGeo, pantsHex, 0.042);
    calf.position.set(lx, -0.61, 0);
    hips.add(calf);

    // Tapered jogger ankle cuff
    const cuffGeo = new THREE.CylinderGeometry(0.080, 0.076, 0.05, 18);
    cuffGeo.computeVertexNormals();
    const cuff = createHiFiMesh(cuffGeo, 0x181a20, 0.030);
    cuff.position.set(lx, -0.82, 0);
    hips.add(cuff);

    // Stylized Two-Tone Streetwear Sneaker
    const shoe = new THREE.Group();
    shoe.position.set(lx, -0.86, 0.03);
    hips.add(shoe);

    // Crisp white rubber lug outsole
    const sole = createHiFiMesh(new THREE.BoxGeometry(0.165, 0.048, 0.33), 0xf2ede4, 0.038);
    sole.position.set(0, -0.045, 0.02);
    shoe.add(sole);

    // White rubber toe bumper cap
    const bumper = createHiFiMesh(new THREE.BoxGeometry(0.155, 0.038, 0.085), 0xf2ede4, 0.032);
    bumper.position.set(0, -0.020, 0.145);
    shoe.add(bumper);

    // Colored sneaker upper
    const upper = createHiFiMesh(new THREE.BoxGeometry(0.148, 0.095, 0.27), shirtHex, 0.040);
    upper.position.set(0, 0.030, 0.015);
    shoe.add(upper);

    // White lace throat & tongue
    const tongue = createHiFiMesh(new THREE.BoxGeometry(0.075, 0.025, 0.14), 0xf2ede4, 0.025);
    tongue.position.set(0, 0.080, 0.04);
    shoe.add(tongue);

    // Mustard heel tab accent
    const heelTab = createHiFiMesh(new THREE.BoxGeometry(0.035, 0.030, 0.015), 0xd49b35, 0.020);
    heelTab.position.set(0, 0.065, -0.12);
    shoe.add(heelTab);
  });

  return {
    root,
    hips,
    torso,
    headGroup,
    leftArm: leftArmObj.shoulder,
    leftElbow: leftArmObj.elbow,
    rightArm: rightArmObj.shoulder,
    rightElbow: rightArmObj.elbow
  };
}

let _brassInteriorTex = null;
function createBrassInteriorTexture() {
  if (_brassInteriorTex) return _brassInteriorTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#381e08');
  grad.addColorStop(0.45, '#9e6818');
  grad.addColorStop(0.80, '#e8b438');
  grad.addColorStop(1.0, '#fff088');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _brassInteriorTex = tex;
  return tex;
}

// ============================================================================
// PROCEDURAL CANVAS TEXTURES & HARDWARE GENERATORS (100% CLIENT-SIDE STATIC)
// ============================================================================

let _brickWarehouseTex = null;
export function createBrickWarehouseTexture() {
  if (_brickWarehouseTex) return _brickWarehouseTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Mortar base
  ctx.fillStyle = '#34313a';
  ctx.fillRect(0, 0, 1024, 1024);

  const brickW = 60;
  const brickH = 26;
  const seam = 4;
  const rows = Math.ceil(1024 / (brickH + seam));
  const cols = Math.ceil(1024 / (brickW + seam)) + 2;

  const brickTones = [
    '#963929', '#7e2d1f', '#aa4734', '#8b3222', '#b54e38',
    '#913626', '#6e2418', '#a1412e', '#842f1f', '#ba543d'
  ];

  for (let r = 0; r < rows; r++) {
    const y = r * (brickH + seam);
    const xOffset = (r % 2 === 0) ? 0 : -(brickW + seam) / 2;
    for (let col = -1; col < cols; col++) {
      const x = col * (brickW + seam) + xOffset;
      const toneIdx = Math.floor(Math.sin(r * 12.9898 + col * 78.233) * 43758.5453) % brickTones.length;
      const baseTone = brickTones[Math.abs(toneIdx)];
      ctx.fillStyle = baseTone;
      ctx.fillRect(x, y, brickW, brickH);

      // Subtle soot / wear stippling on brick face
      ctx.fillStyle = 'rgba(20, 16, 26, 0.18)';
      ctx.fillRect(x, y + brickH - 4, brickW, 4);
      ctx.fillStyle = 'rgba(255, 200, 180, 0.12)';
      ctx.fillRect(x, y, brickW, 3);
    }
  }

  // Weathering streaks & grime washes
  for (let s = 0; s < 12; s++) {
    const sx = Math.random() * 1024;
    const sw = 20 + Math.random() * 80;
    const grad = ctx.createLinearGradient(sx, 0, sx, 1024);
    grad.addColorStop(0, 'rgba(15, 12, 22, 0.35)');
    grad.addColorStop(0.3 + Math.random() * 0.4, 'rgba(25, 20, 32, 0.15)');
    grad.addColorStop(1, 'rgba(15, 12, 22, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, 0, sw, 1024);
  }

  _brickWarehouseTex = new THREE.CanvasTexture(c);
  _brickWarehouseTex.wrapS = THREE.RepeatWrapping;
  _brickWarehouseTex.wrapT = THREE.RepeatWrapping;
  _brickWarehouseTex.repeat.set(4, 3);
  _brickWarehouseTex.colorSpace = THREE.SRGBColorSpace;
  return _brickWarehouseTex;
}

let _loftWindowTex = null;
export function createIndustrialLoftWindowTexture() {
  if (_loftWindowTex) return _loftWindowTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Outer dark iron frame
  ctx.fillStyle = '#141620';
  ctx.fillRect(0, 0, 512, 512);

  // Intense warm golden incandescent interior glow
  const grad = ctx.createRadialGradient(256, 220, 30, 256, 256, 280);
  grad.addColorStop(0.0, '#fff4b8');
  grad.addColorStop(0.35, '#ffbe42');
  grad.addColorStop(0.75, '#ea7818');
  grad.addColorStop(1.0, '#9c3e0a');

  // 3 columns x 4 rows of glass panes
  const cols = 3;
  const rows = 4;
  const margin = 16;
  const mullion = 12;
  const paneW = (512 - margin * 2 - (cols - 1) * mullion) / cols;
  const paneH = (512 - margin * 2 - (rows - 1) * mullion) / rows;

  for (let r = 0; r < rows; r++) {
    for (let cl = 0; cl < cols; cl++) {
      const px = margin + cl * (paneW + mullion);
      const py = margin + r * (paneH + mullion);
      ctx.fillStyle = grad;
      ctx.fillRect(px, py, paneW, paneH);

      // Glass reflection highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(px + 4, py + 4, paneW - 8, 6);
      ctx.fillRect(px + 4, py + 4, 6, paneH - 8);

      // Soft vignette around pane edges
      ctx.strokeStyle = 'rgba(30, 18, 10, 0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(px + 2, py + 2, paneW - 4, paneH - 4);
    }
  }

  _loftWindowTex = new THREE.CanvasTexture(c);
  _loftWindowTex.colorSpace = THREE.SRGBColorSpace;
  return _loftWindowTex;
}

let _corrugatedShutterTex = null;
export function createCorrugatedShutterTexture() {
  if (_corrugatedShutterTex) return _corrugatedShutterTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#3a4150';
  ctx.fillRect(0, 0, 512, 512);

  const slatH = 16;
  const numSlats = Math.ceil(512 / slatH);

  for (let s = 0; s < numSlats; s++) {
    const y = s * slatH;
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0.0, '#1a1d26'); // dark inter-slat seam
    grad.addColorStop(0.18, '#323948');
    grad.addColorStop(0.48, '#727c94'); // metallic highlight ridge
    grad.addColorStop(0.78, '#464f62');
    grad.addColorStop(1.0, '#222632');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 512, slatH);

    // Weathering rust / dirt wash
    if (s % 5 === 0) {
      ctx.fillStyle = 'rgba(120, 60, 30, 0.12)';
      ctx.fillRect(0, y + 2, 512, slatH - 4);
    }
  }

  _corrugatedShutterTex = new THREE.CanvasTexture(c);
  _corrugatedShutterTex.colorSpace = THREE.SRGBColorSpace;
  return _corrugatedShutterTex;
}

let _streetArtMuralTex = null;
export function createStreetArtMuralTexture() {
  if (_streetArtMuralTex) return _streetArtMuralTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, 1024, 512);

  ctx.save();
  ctx.translate(480, 240);
  ctx.rotate(-0.06);

  // Background aerosol spray cloud
  const cloudGrad = ctx.createRadialGradient(0, 0, 50, 0, 0, 380);
  cloudGrad.addColorStop(0.0, 'rgba(0, 240, 255, 0.45)');
  cloudGrad.addColorStop(0.4, 'rgba(255, 42, 133, 0.35)');
  cloudGrad.addColorStop(0.8, 'rgba(255, 220, 0, 0.20)');
  cloudGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = cloudGrad;
  ctx.fillRect(-450, -220, 900, 440);

  // 1. Deep 3D drop-shadow
  ctx.font = '900 130px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0a0814';
  for (let d = 16; d >= 6; d--) {
    ctx.fillText('REVENGE', d, d + 12);
  }

  // 2. Midnight purple bold outline
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#181035';
  ctx.strokeText('REVENGE', 0, 0);

  // 3. Vibrant wildstyle spray gradient
  const sprayGrad = ctx.createLinearGradient(-350, -70, 350, 70);
  sprayGrad.addColorStop(0.0, '#00f0ff');  // electric cyan
  sprayGrad.addColorStop(0.25, '#2ef064'); // neon lime
  sprayGrad.addColorStop(0.50, '#ffea00'); // vivid yellow
  sprayGrad.addColorStop(0.75, '#ff6b00'); // intense orange
  sprayGrad.addColorStop(1.0, '#ff2a85');  // hot magenta
  ctx.fillStyle = sprayGrad;
  ctx.fillText('REVENGE', 0, 0);

  // 4. White spray top ridges & shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = '900 124px Impact, sans-serif';
  ctx.fillText('REVENGE', -3, -4);

  // 5. Spray drips & paint splatters
  ctx.fillStyle = '#00f0ff';
  const dripXs = [-280, -180, -40, 110, 220, 310];
  dripXs.forEach((dx) => {
    ctx.beginPath();
    ctx.arc(dx, 45, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(dx - 3, 45, 6, 25 + (Math.abs(dx * 13) % 40));
    ctx.beginPath();
    ctx.arc(dx, 70 + (Math.abs(dx * 13) % 40), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Urban tag secondary texts: "KRONOS" & "BEAT" & stars
  ctx.font = '900 46px cursive, sans-serif';
  ctx.fillStyle = '#ffea00';
  ctx.fillText('★ KRONOS ★', 120, -95);
  ctx.fillStyle = '#00f0ff';
  ctx.fillText('CYPHER', -220, 110);

  ctx.restore();

  _streetArtMuralTex = new THREE.CanvasTexture(c);
  _streetArtMuralTex.colorSpace = THREE.SRGBColorSpace;
  return _streetArtMuralTex;
}

let _ampGrilleTex = null;
export function createAmpGrilleTexture() {
  if (_ampGrilleTex) return _ampGrilleTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#181716';
  ctx.fillRect(0, 0, 256, 256);

  // Woven wheat / black basketweave
  const cell = 8;
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      const isEven = ((x / cell) + (y / cell)) % 2 === 0;
      if (isEven) {
        ctx.fillStyle = '#3e372a';
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = '#b89d6e'; // golden wheat highlight thread
        ctx.fillRect(x + 2, y + 2, cell - 4, 2);
      } else {
        ctx.fillStyle = '#1c1b18';
        ctx.fillRect(x, y, cell, cell);
        ctx.fillStyle = '#5c4e36';
        ctx.fillRect(x + 2, y + 2, 2, cell - 4);
      }
    }
  }

  _ampGrilleTex = new THREE.CanvasTexture(c);
  _ampGrilleTex.wrapS = THREE.RepeatWrapping;
  _ampGrilleTex.wrapT = THREE.RepeatWrapping;
  _ampGrilleTex.repeat.set(2, 2);
  _ampGrilleTex.colorSpace = THREE.SRGBColorSpace;
  return _ampGrilleTex;
}

let _jerseyBarrierTex = null;
export function createJerseyBarrierTexture() {
  if (_jerseyBarrierTex) return _jerseyBarrierTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Weathered concrete base
  ctx.fillStyle = '#828792';
  ctx.fillRect(0, 0, 512, 256);

  // Concrete aggregate noise
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(50, 55, 65, 0.25)' : 'rgba(210, 215, 225, 0.25)';
    ctx.fillRect(Math.random() * 512, Math.random() * 256, 4 + Math.random() * 8, 2 + Math.random() * 6);
  }

  // Diagonal reflective orange and white hazard stripes
  const stripeW = 48;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 40, 512, 140); // stripe band along mid-section
  ctx.clip();

  for (let x = -200; x < 700; x += stripeW * 2) {
    ctx.fillStyle = '#ff6d00'; // vibrant safety orange
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + stripeW, 256);
    ctx.lineTo(x + stripeW + 160, 0);
    ctx.lineTo(x + 160, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f0f2f5'; // reflective white
    ctx.beginPath();
    ctx.moveTo(x + stripeW, 256);
    ctx.lineTo(x + stripeW * 2, 256);
    ctx.lineTo(x + stripeW * 2 + 160, 0);
    ctx.lineTo(x + stripeW + 160, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Dark grime at bottom edge
  const grimeGrad = ctx.createLinearGradient(0, 200, 0, 256);
  grimeGrad.addColorStop(0, 'rgba(25, 30, 40, 0.0)');
  grimeGrad.addColorStop(1, 'rgba(25, 30, 40, 0.65)');
  ctx.fillStyle = grimeGrad;
  ctx.fillRect(0, 200, 512, 56);

  _jerseyBarrierTex = new THREE.CanvasTexture(c);
  _jerseyBarrierTex.colorSpace = THREE.SRGBColorSpace;
  return _jerseyBarrierTex;
}

// ----------------------------------------------------------------------------
// NEW PROCEDURAL TEXTURES & PROPS FOR MILESTONE 3
// (APARTMENTS, AMBULANCE, STAGE, ROOF, CHAIN-LINK FENCE, PALLETS & CRATES)
// ----------------------------------------------------------------------------

let _aptBrickTex = null;
export function createApartmentBrickTexture() {
  if (_aptBrickTex) return _aptBrickTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Dark weathered mortar base
  ctx.fillStyle = '#2b2730';
  ctx.fillRect(0, 0, 1024, 1024);

  const brickW = 56;
  const brickH = 24;
  const seam = 4;
  const rows = Math.ceil(1024 / (brickH + seam));
  const cols = Math.ceil(1024 / (brickW + seam)) + 2;

  // Rich urban brownstone / burnt terracotta brick palette
  const brickTones = [
    '#6e2c22', '#5c221a', '#7d3326', '#4f1d16', '#753024',
    '#65271e', '#541f17', '#83392a', '#5f241c', '#722e23'
  ];

  for (let r = 0; r < rows; r++) {
    const y = r * (brickH + seam);
    const xOffset = (r % 2 === 0) ? 0 : -(brickW + seam) / 2;
    for (let col = -1; col < cols; col++) {
      const x = col * (brickW + seam) + xOffset;
      const toneIdx = Math.abs(Math.floor(Math.sin(r * 17.13 + col * 43.17) * 43758.5453)) % brickTones.length;
      ctx.fillStyle = brickTones[toneIdx];
      ctx.fillRect(x, y, brickW, brickH);

      // Bottom shadow bevel on each brick
      ctx.fillStyle = 'rgba(15, 10, 20, 0.28)';
      ctx.fillRect(x, y + brickH - 3, brickW, 3);
      // Top highlight
      ctx.fillStyle = 'rgba(255, 210, 190, 0.10)';
      ctx.fillRect(x, y, brickW, 2);
    }
  }

  // Vertical water / soot grime stains
  for (let s = 0; s < 14; s++) {
    const sx = (s * 73) % 1024;
    const sw = 18 + (s * 31) % 45;
    const grad = ctx.createLinearGradient(sx, 0, sx, 1024);
    grad.addColorStop(0, 'rgba(10, 8, 16, 0.45)');
    grad.addColorStop(0.4, 'rgba(18, 14, 24, 0.20)');
    grad.addColorStop(1, 'rgba(10, 8, 16, 0.02)');
    ctx.fillStyle = grad;
    ctx.fillRect(sx, 0, sw, 1024);
  }

  _aptBrickTex = new THREE.CanvasTexture(c);
  _aptBrickTex.wrapS = THREE.RepeatWrapping;
  _aptBrickTex.wrapT = THREE.RepeatWrapping;
  _aptBrickTex.repeat.set(2.5, 4.0);
  _aptBrickTex.colorSpace = THREE.SRGBColorSpace;
  return _aptBrickTex;
}

let _ambulanceSideTex = null;
export function createAmbulanceSideTexture() {
  if (_ambulanceSideTex) return _ambulanceSideTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Hospital White / Cool Slate Base
  ctx.fillStyle = '#e4e8f0';
  ctx.fillRect(0, 0, 1024, 512);

  // Lower Dark Charcoal Chassis Skirt
  ctx.fillStyle = '#222630';
  ctx.fillRect(0, 420, 1024, 92);

  // Fluorescent Safety Orange Chevron Stripe along Beltline
  ctx.fillStyle = '#ff6200';
  ctx.fillRect(0, 220, 1024, 75);

  // Cyan reflective accent pinstripes
  ctx.fillStyle = '#00f0ff';
  ctx.fillRect(0, 208, 1024, 8);
  ctx.fillRect(0, 298, 1024, 8);

  // Bold Typography: "AMBULANCE"
  ctx.font = '900 68px Impact, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('AMBULANCE', 520, 282);

  // Secondary Markings
  ctx.font = '900 24px monospace, sans-serif';
  ctx.fillStyle = '#181c26';
  ctx.fillText('EMERGENCY SOUND UNIT  •  UNIT 09', 520, 180);

  // Medical Cross / Audio Waveform Emblem
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(80, 80, 110, 110);
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(80, 80, 110, 110);

  ctx.fillStyle = '#ff2a85';
  ctx.fillRect(123, 95, 24, 80);
  ctx.fillRect(95, 123, 80, 24);

  // Door Shut Lines / Panel Seams
  ctx.strokeStyle = '#12141a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(340, 60); ctx.lineTo(340, 420);
  ctx.moveTo(880, 60); ctx.lineTo(880, 420);
  ctx.stroke();

  // Door Handle
  ctx.fillStyle = '#12141a';
  ctx.fillRect(360, 240, 36, 12);
  ctx.fillStyle = '#d0d8e8';
  ctx.fillRect(362, 242, 32, 8);

  // Side cab window
  ctx.fillStyle = '#182436';
  ctx.fillRect(180, 75, 140, 95);
  ctx.strokeStyle = '#101218';
  ctx.lineWidth = 5;
  ctx.strokeRect(180, 75, 140, 95);

  _ambulanceSideTex = new THREE.CanvasTexture(c);
  _ambulanceSideTex.colorSpace = THREE.SRGBColorSpace;
  return _ambulanceSideTex;
}

let _vanGrilleTex = null;
export function createVanGrilleTexture() {
  if (_vanGrilleTex) return _vanGrilleTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#0e1014';
  ctx.fillRect(0, 0, 512, 256);

  const numSlats = 8;
  const slatH = 20;
  for (let i = 0; i < numSlats; i++) {
    const y = 30 + i * 25;
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0, '#788296');
    grad.addColorStop(0.5, '#f0f4fc');
    grad.addColorStop(1, '#424856');
    ctx.fillStyle = grad;
    ctx.fillRect(30, y, 452, slatH);
  }

  ctx.strokeStyle = '#c8d4e6';
  ctx.lineWidth = 12;
  ctx.strokeRect(15, 15, 482, 226);

  ctx.fillStyle = '#f5c211';
  ctx.beginPath();
  ctx.arc(256, 128, 28, 0, Math.PI * 2);
  ctx.fill();

  _vanGrilleTex = new THREE.CanvasTexture(c);
  _vanGrilleTex.colorSpace = THREE.SRGBColorSpace;
  return _vanGrilleTex;
}

let _stageChassisTex = null;
export function createStageChassisTexture() {
  if (_stageChassisTex) return _stageChassisTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1c182c';
  ctx.fillRect(0, 0, 1024, 256);

  // Horizontal ribbed trailer skirt
  const slatH = 24;
  for (let y = 10; y < 190; y += slatH) {
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0, '#0e0c18');
    grad.addColorStop(0.2, '#28233e');
    grad.addColorStop(0.5, '#443c68');
    grad.addColorStop(0.8, '#26213a');
    grad.addColorStop(1, '#0c0a16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 1024, slatH - 3);

    for (let rx = 30; rx < 1024; rx += 80) {
      ctx.fillStyle = '#f5c211';
      ctx.beginPath();
      ctx.arc(rx, y + slatH / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Diagonal safety hazard chevrons along bottom edge
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 200, 1024, 56);
  ctx.clip();
  const chevW = 32;
  for (let x = -100; x < 1200; x += chevW * 2) {
    ctx.fillStyle = '#f5c211';
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + chevW, 256);
    ctx.lineTo(x + chevW + 40, 200);
    ctx.lineTo(x + 40, 200);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#121218';
    ctx.beginPath();
    ctx.moveTo(x + chevW, 256);
    ctx.lineTo(x + chevW * 2, 256);
    ctx.lineTo(x + chevW * 2 + 40, 200);
    ctx.lineTo(x + chevW + 40, 200);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Amber Running Marker Lamps
  for (let mx = 80; mx < 1024; mx += 180) {
    ctx.fillStyle = '#ff9900';
    ctx.beginPath();
    ctx.arc(mx, 195, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx - 1, 193, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  _stageChassisTex = new THREE.CanvasTexture(c);
  _stageChassisTex.colorSpace = THREE.SRGBColorSpace;
  return _stageChassisTex;
}

let _roofGravelTex = null;
export function createRoofGravelTexture() {
  if (_roofGravelTex) return _roofGravelTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#2c2f38';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 800; i++) {
    const tones = ['rgba(70, 75, 88, 0.5)', 'rgba(35, 38, 46, 0.6)', 'rgba(120, 125, 140, 0.35)', 'rgba(18, 20, 24, 0.7)'];
    ctx.fillStyle = tones[i % tones.length];
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 5, 3 + Math.random() * 5);
  }

  ctx.strokeStyle = '#181a20';
  ctx.lineWidth = 6;
  for (let x = 120; x < 512; x += 130) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, 512);
    ctx.stroke();
  }

  for (let p = 0; p < 6; p++) {
    const px = Math.random() * 512;
    const py = Math.random() * 512;
    const pr = 25 + Math.random() * 40;
    const pGrad = ctx.createRadialGradient(px, py, 5, px, py, pr);
    pGrad.addColorStop(0, 'rgba(15, 18, 24, 0.45)');
    pGrad.addColorStop(1, 'rgba(15, 18, 24, 0.0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  _roofGravelTex = new THREE.CanvasTexture(c);
  _roofGravelTex.wrapS = THREE.RepeatWrapping;
  _roofGravelTex.wrapT = THREE.RepeatWrapping;
  _roofGravelTex.repeat.set(3, 2);
  _roofGravelTex.colorSpace = THREE.SRGBColorSpace;
  return _roofGravelTex;
}

let _chainLinkTex = null;
export function createChainLinkTexture() {
  if (_chainLinkTex) return _chainLinkTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);

  ctx.strokeStyle = '#8a98a8';
  ctx.lineWidth = 2.4;
  const step = 16;
  for (let i = -256; i < 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }

  _chainLinkTex = new THREE.CanvasTexture(c);
  _chainLinkTex.wrapS = THREE.RepeatWrapping;
  _chainLinkTex.wrapT = THREE.RepeatWrapping;
  _chainLinkTex.colorSpace = THREE.SRGBColorSpace;
  return _chainLinkTex;
}

export function createChainLinkFenceSection(width = 3.2, height = 2.4) {
  const fenceGroup = new THREE.Group();
  const wireTex = createChainLinkTexture();
  const wireTexClone = wireTex.clone();
  wireTexClone.repeat.set(width * 2, height * 2);

  // Galvanized steel posts at left and right
  const postGeo = new THREE.CylinderGeometry(0.045, 0.045, height, 8);
  [-width / 2, width / 2].forEach(px => {
    const post = createHiFiMesh(postGeo, 0x6e7888, 0.02);
    post.position.set(px, height / 2, 0);
    fenceGroup.add(post);
  });

  // Top tension rail pipe
  const topRailGeo = new THREE.CylinderGeometry(0.035, 0.035, width, 8);
  topRailGeo.rotateZ(Math.PI / 2);
  const topRail = createHiFiMesh(topRailGeo, 0x6e7888, 0.02);
  topRail.position.set(0, height, 0);
  fenceGroup.add(topRail);

  // Bottom tension rail pipe
  const botRailGeo = new THREE.CylinderGeometry(0.025, 0.025, width, 8);
  botRailGeo.rotateZ(Math.PI / 2);
  const botRail = createHiFiMesh(botRailGeo, 0x6e7888, 0.02);
  botRail.position.set(0, 0.12, 0);
  fenceGroup.add(botRail);

  // Diamond chain-link wire mesh
  const meshMat = new THREE.MeshBasicMaterial({
    map: wireTexClone,
    transparent: true,
    alphaTest: 0.25,
    side: THREE.DoubleSide
  });
  const meshPlane = new THREE.Mesh(new THREE.PlaneGeometry(width, height - 0.20), meshMat);
  meshPlane.position.set(0, height / 2 + 0.05, 0);
  fenceGroup.add(meshPlane);

  // Coiled concertina razor wire along top rail
  const numCoils = Math.floor(width / 0.35);
  const coilGeo = new THREE.TorusGeometry(0.22, 0.016, 6, 16);
  for (let c = 0; c <= numCoils; c++) {
    const coil = createHiFiMesh(coilGeo, 0x9aa4b4, 0.02);
    coil.position.set(-width / 2 + c * 0.35 + 0.17, height + 0.20, 0);
    coil.rotation.y = 0.25 * (c % 2 === 0 ? 1 : -1);
    fenceGroup.add(coil);
  }

  return fenceGroup;
}

export function createWoodenPallet(w = 1.2, h = 0.14, d = 1.0) {
  const palletGroup = new THREE.Group();
  const woodCol = 0x785e42;
  // Top deck slats
  for (let s = -d / 2 + 0.06; s <= d / 2 - 0.06; s += 0.16) {
    const slat = createHiFiMesh(new THREE.BoxGeometry(w, 0.022, 0.10), woodCol, 0.015);
    slat.position.set(0, h - 0.011, s);
    palletGroup.add(slat);
  }
  // 3 Stringer runner blocks
  [-w / 2 + 0.06, 0, w / 2 - 0.06].forEach(px => {
    const runner = createHiFiMesh(new THREE.BoxGeometry(0.08, h - 0.044, d), 0x5a4632, 0.015);
    runner.position.set(px, h / 2, 0);
    palletGroup.add(runner);
  });
  // Bottom deck slats
  [-d / 2 + 0.1, 0, d / 2 - 0.1].forEach(pz => {
    const botSlat = createHiFiMesh(new THREE.BoxGeometry(w, 0.022, 0.12), woodCol, 0.015);
    botSlat.position.set(0, 0.011, pz);
    palletGroup.add(botSlat);
  });
  return palletGroup;
}

export function createWoodenCrate(size = 0.85) {
  const crateGroup = new THREE.Group();
  const box = createHiFiMesh(new THREE.BoxGeometry(size, size, size), 0x826648, 0.02);
  box.position.y = size / 2;
  crateGroup.add(box);
  // Cross battens
  const battenGeo = new THREE.BoxGeometry(size * 0.96, 0.035, size * 0.96);
  const batten = createHiFiMesh(battenGeo, 0x624c34, 0.015);
  batten.position.y = size / 2;
  crateGroup.add(batten);
  return crateGroup;
}

let _courtAsphaltTex = null;
export function createHighDetailCourtAsphaltTexture() {
  if (_courtAsphaltTex) return _courtAsphaltTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext('2d');

  // 1. Base Dark Slate Asphalt (#222530)
  ctx.fillStyle = '#222530';
  ctx.fillRect(0, 0, 2048, 2048);

  // 2. High-Frequency Aggregate Noise Stippling
  for (let i = 0; i < 600; i++) {
    const tones = ['rgba(12, 14, 20, 0.50)', 'rgba(48, 54, 70, 0.40)', 'rgba(80, 90, 115, 0.22)'];
    ctx.fillStyle = tones[i % tones.length];
    ctx.fillRect(
      Math.random() * 2048,
      Math.random() * 2048,
      10 + Math.random() * 85,
      5 + Math.random() * 40
    );
  }

  // 3. Broad Asphalt Rubber Tire Skids
  ctx.strokeStyle = 'rgba(10, 12, 18, 0.60)';
  ctx.lineWidth = 46;
  ctx.beginPath();
  ctx.arc(1024, 1024, 420, 0.35, 2.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1024, 1024, 310, 3.1, 5.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1024, 1024, 620, 1.2, 2.8);
  ctx.stroke();

  // 4. Streetball Court Lines
  const courtYellow = '#f5c211';
  const courtWhite = '#ffffff';

  // A. Yellow Basketball Key Rectangle (centered towards stage)
  ctx.strokeStyle = courtYellow;
  ctx.lineWidth = 14;
  ctx.strokeRect(724, 560, 600, 520);

  // Free-throw line & circle arc
  ctx.beginPath();
  ctx.arc(1024, 1080, 200, 0, Math.PI);
  ctx.stroke();

  // Dashed upper semi-circle of free-throw circle
  ctx.setLineDash([24, 18]);
  ctx.beginPath();
  ctx.arc(1024, 1080, 200, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3-Point Perimeter Arc
  ctx.beginPath();
  ctx.arc(1024, 480, 680, 0.45, Math.PI - 0.45);
  ctx.stroke();

  // B. Circular White Battle Cypher Ring (r = 4.8m in world space, ~460px canvas radius)
  ctx.strokeStyle = courtWhite;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.arc(1024, 1024, 460, 0, Math.PI * 2);
  ctx.stroke();

  // Outer yellow boundary square
  ctx.strokeStyle = 'rgba(245, 194, 20, 0.65)';
  ctx.lineWidth = 12;
  ctx.strokeRect(380, 380, 1288, 1288);

  // 5. Authentic Street Graffiti Decals ("DJ KRONOS", "BEATDOWN", "RHYTHM!")
  // Decal 1: "DJ KRONOS"
  ctx.save();
  ctx.translate(680, 940);
  ctx.rotate(-0.16);
  ctx.font = '900 85px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#06050b';
  ctx.fillText('DJ KRONOS', 8, 8);
  const gradKronos = ctx.createLinearGradient(-180, -50, 180, 50);
  gradKronos.addColorStop(0.0, '#00f5ff');
  gradKronos.addColorStop(0.55, '#ff2a8d');
  gradKronos.addColorStop(1.0, '#ffe600');
  ctx.fillStyle = gradKronos;
  ctx.fillText('DJ KRONOS', 0, 0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.font = '900 80px Impact, sans-serif';
  ctx.fillText('DJ KRONOS', -2, -2);
  ctx.restore();

  // Decal 2: "BEATDOWN"
  ctx.save();
  ctx.translate(1360, 1140);
  ctx.rotate(0.22);
  ctx.font = '900 78px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#07050a';
  ctx.fillText('BEATDOWN', 7, 7);
  const gradBeat = ctx.createLinearGradient(-160, 0, 160, 0);
  gradBeat.addColorStop(0.0, '#ff1744');
  gradBeat.addColorStop(1.0, '#ff9100');
  ctx.fillStyle = gradBeat;
  ctx.fillText('BEATDOWN', 0, 0);
  ctx.fillStyle = 'rgba(255, 23, 68, 0.85)';
  for (let s = 0; s < 14; s++) {
    const rx = (Math.random() - 0.5) * 320;
    const ry = (Math.random() - 0.5) * 90;
    ctx.beginPath();
    ctx.arc(rx, ry, 2 + Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Decal 3: "RHYTHM!"
  ctx.save();
  ctx.translate(690, 1280);
  ctx.rotate(-0.28);
  ctx.font = '900 72px cursive, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#08070d';
  ctx.fillText('RHYTHM!', 6, 6);
  ctx.fillStyle = '#ffea00';
  ctx.fillText('RHYTHM!', 0, 0);
  ctx.restore();

  // 6. Branching Crevice Cracks
  ctx.strokeStyle = '#0e1017';
  ctx.lineWidth = 4;
  for (let i = 0; i < 32; i++) {
    ctx.beginPath();
    let x = Math.random() * 2048;
    let y = Math.random() * 2048;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 120;
      y += (Math.random() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _courtAsphaltTex = new THREE.CanvasTexture(c);
  _courtAsphaltTex.colorSpace = THREE.SRGBColorSpace;
  return _courtAsphaltTex;
}

let _lightPoolTex = null;
function createLightPoolTexture() {
  if (_lightPoolTex) return _lightPoolTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(0.70, 'rgba(255, 255, 255, 0.15)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  _lightPoolTex = new THREE.CanvasTexture(c);
  _lightPoolTex.colorSpace = THREE.SRGBColorSpace;
  return _lightPoolTex;
}

let _contactShadowTex = null;
export function createContactShadowTexture() {
  if (_contactShadowTex) return _contactShadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(4, 4, 8, 0.90)');
  grad.addColorStop(0.35, 'rgba(6, 6, 12, 0.65)');
  grad.addColorStop(0.70, 'rgba(10, 10, 18, 0.28)');
  grad.addColorStop(1.0, 'rgba(12, 12, 22, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  _contactShadowTex = new THREE.CanvasTexture(c);
  _contactShadowTex.colorSpace = THREE.SRGBColorSpace;
  return _contactShadowTex;
}

export function createContactShadowDecal(width = 1.2, height = 0.9, baseOpacity = 0.50) {
  const geo = new THREE.PlaneGeometry(width, height);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'contact_shadow_decal';
  mesh.position.y = 0.015;
  mesh.renderOrder = 2;
  mesh.userData.baseOpacity = baseOpacity;
  mesh.userData.baseWidth = width;
  mesh.userData.baseHeight = height;
  return mesh;
}

let _arenaAOTex = null;
export function createBakedArenaAOMapTexture() {
  if (_arenaAOTex) return _arenaAOTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext('2d');

  // Base is pure white (1.0 = no ambient occlusion)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 2048, 2048);

  // World center (0, 0) -> (1024, 1024). Floor mesh radius 42m -> 24.38095 px/m.
  const toPxX = (wx) => 1024 + wx * 24.38095;
  const toPxY = (wz) => 1024 + wz * 24.38095;

  // 1. Stage Shadow Footprint (Boombox Truck + Wing Towers) - Aligned 1:1 with soundRigGroup at (2.35, 0, -5.6)
  const stagePxX = toPxX(2.35);
  const stagePxY = toPxY(-5.6);
  const stageGrad = ctx.createRadialGradient(stagePxX, stagePxY, 30, stagePxX, stagePxY, 160);
  stageGrad.addColorStop(0.0, 'rgba(25, 25, 35, 0.85)');
  stageGrad.addColorStop(0.50, 'rgba(40, 40, 55, 0.60)');
  stageGrad.addColorStop(0.85, 'rgba(120, 120, 140, 0.22)');
  stageGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = stageGrad;
  ctx.beginPath();
  ctx.ellipse(stagePxX, stagePxY, 160, 90, -0.22, 0, Math.PI * 2);
  ctx.fill();

  // Dense occlusion core under center cabinet (rotated -0.22 rad with soundRigGroup)
  ctx.save();
  ctx.translate(stagePxX, stagePxY);
  ctx.rotate(-0.22);
  ctx.fillStyle = 'rgba(15, 15, 25, 0.80)';
  ctx.fillRect(-3.8 * 24.38095, -1.5 * 24.38095, 7.6 * 24.38095, 3.0 * 24.38095);
  ctx.restore();

  // 2. West Warehouse Base Seam Crevice AO & Contact Shadow
  // Base crevice is sampled at x = -8.2, z in [-1.5, 2.5]. Asphalt sample is at x = -6.8.
  const wX_dark = toPxX(-10.2);
  const wX_clear = toPxX(-7.2);
  const wY_start = toPxY(-4.5);
  const wY_end = toPxY(4.5);

  const westCreviceGrad = ctx.createLinearGradient(wX_dark, 0, wX_clear, 0);
  westCreviceGrad.addColorStop(0.0, 'rgba(10, 10, 15, 0.98)');
  westCreviceGrad.addColorStop(0.72, 'rgba(15, 15, 22, 0.94)'); // Deep occlusion covering x = -8.2
  westCreviceGrad.addColorStop(0.90, 'rgba(50, 50, 65, 0.40)'); // Rapid falloff at x = -7.5
  westCreviceGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)'); // Completely unoccluded at x = -7.2
  ctx.fillStyle = westCreviceGrad;
  ctx.fillRect(wX_dark, wY_start, wX_clear - wX_dark, wY_end - wY_start);

  // 3. East Viaduct Arch Footings & Bodega Base Seam Crevice AO
  // Base crevice is sampled at x = 8.2, z in [-2.0, 2.0]. Asphalt sample is at x = 6.8.
  const vX_dark = toPxX(10.5);
  const vX_clear = toPxX(7.0);
  const vY_start = toPxY(-4.5);
  const vY_end = toPxY(4.5);

  const eastCreviceGrad = ctx.createLinearGradient(vX_dark, 0, vX_clear, 0);
  eastCreviceGrad.addColorStop(0.0, 'rgba(10, 10, 15, 0.98)');
  eastCreviceGrad.addColorStop(0.70, 'rgba(15, 15, 22, 0.95)'); // Deep occlusion covering x = 8.2
  eastCreviceGrad.addColorStop(0.88, 'rgba(50, 50, 65, 0.40)'); // Rapid falloff at x = 7.4
  eastCreviceGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)'); // Completely unoccluded at x = 7.0
  ctx.fillStyle = eastCreviceGrad;
  ctx.fillRect(vX_clear, vY_start, vX_dark - vX_clear, vY_end - vY_start);

  // 4. East Viaduct Pier Footings Contact Circles
  [-6.0, -2.5, 1.0, 4.5].forEach((wz) => {
    const py = toPxY(wz);
    const px = toPxX(10.5);
    const pierGrad = ctx.createRadialGradient(px, py, 4, px, py, 42);
    pierGrad.addColorStop(0.0, 'rgba(15, 15, 22, 0.85)');
    pierGrad.addColorStop(0.50, 'rgba(55, 55, 70, 0.50)');
    pierGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = pierGrad;
    ctx.beginPath();
    ctx.arc(px, py, 42, 0, Math.PI * 2);
    ctx.fill();
  });

  // 5. South Entrance Arch Pillars & Van Contact
  [[-4.2, 11.4], [4.2, 11.4]].forEach(([wx, wz]) => {
    const px = toPxX(wx);
    const py = toPxY(wz);
    const archGrad = ctx.createRadialGradient(px, py, 3, px, py, 32);
    archGrad.addColorStop(0.0, 'rgba(25, 25, 35, 0.75)');
    archGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = archGrad;
    ctx.beginPath();
    ctx.arc(px, py, 32, 0, Math.PI * 2);
    ctx.fill();
  });

  // Sound-crew van at (1.5, 12.6)
  const vanPx = toPxX(1.5);
  const vanPy = toPxY(12.6);
  const vanGrad = ctx.createRadialGradient(vanPx, vanPy, 15, vanPx, vanPy, 70);
  vanGrad.addColorStop(0.0, 'rgba(20, 20, 30, 0.80)');
  vanGrad.addColorStop(0.60, 'rgba(60, 60, 75, 0.40)');
  vanGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = vanGrad;
  ctx.beginPath();
  ctx.ellipse(vanPx, vanPy, 45, 75, 0.18, 0, Math.PI * 2);
  ctx.fill();

  // 6. Outer Perimeter Ground Curbs Darkening
  const edgeGrad = ctx.createRadialGradient(1024, 1024, 940, 1024, 1024, 1024);
  edgeGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
  edgeGrad.addColorStop(0.80, 'rgba(255, 255, 255, 0.0)');
  edgeGrad.addColorStop(0.95, 'rgba(40, 40, 55, 0.35)');
  edgeGrad.addColorStop(1.0, 'rgba(20, 20, 30, 0.65)');
  ctx.fillStyle = edgeGrad;
  ctx.beginPath();
  ctx.arc(1024, 1024, 1024, 0, Math.PI * 2);
  ctx.fill();

  _arenaAOTex = new THREE.CanvasTexture(c);
  _arenaAOTex.colorSpace = THREE.SRGBColorSpace;
  _arenaAOTex.generateMipmaps = false;
  _arenaAOTex.minFilter = THREE.LinearFilter;
  return _arenaAOTex;
}

let _arenaLightMapTex = null;
export function createBakedArenaLightMapTexture() {
  if (_arenaLightMapTex) return _arenaLightMapTex;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const ctx = c.getContext('2d');

  // Base is black (0.0 = no added irradiance)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 2048, 2048);

  const toPxX = (wx) => 1024 + wx * 24.38095;
  const toPxY = (wz) => 1024 + wz * 24.38095;

  // 1. 4 Streetlamp Warm Bounce Pools at Lamp Posts
  [
    [-6.5, -4.6],
    [7.4,  -3.6],
    [-6.6,  5.8],
    [6.6,   5.8]
  ].forEach(([lx, lz]) => {
    const px = toPxX(lx);
    const py = toPxY(lz);
    const lampGrad = ctx.createRadialGradient(px, py, 4, px, py, 95);
    lampGrad.addColorStop(0.0, 'rgba(255, 209, 92, 0.62)');
    lampGrad.addColorStop(0.35, 'rgba(255, 185, 70, 0.38)');
    lampGrad.addColorStop(0.70, 'rgba(255, 160, 50, 0.14)');
    lampGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = lampGrad;
    ctx.beginPath();
    ctx.arc(px, py, 95, 0, Math.PI * 2);
    ctx.fill();
  });

  // 2. West Warehouse Loft Windows Warm Incandescent Spill
  const westSpillX = toPxX(-8.2);
  const westSpillY = toPxY(-2.2);
  const westSpillGrad = ctx.createRadialGradient(westSpillX, westSpillY, 15, westSpillX, westSpillY, 160);
  westSpillGrad.addColorStop(0.0, 'rgba(255, 168, 52, 0.45)');
  westSpillGrad.addColorStop(0.40, 'rgba(255, 140, 40, 0.25)');
  westSpillGrad.addColorStop(0.80, 'rgba(255, 110, 30, 0.08)');
  westSpillGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = westSpillGrad;
  ctx.beginPath();
  ctx.ellipse(westSpillX, westSpillY, 110, 160, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // 3. South Van Forward Headlight Pools
  const vanHeadL_X = toPxX(0.7);
  const vanHeadL_Y = toPxY(9.8);
  const vanHeadR_X = toPxX(2.3);
  const vanHeadR_Y = toPxY(9.8);
  [vanHeadL_X, vanHeadR_X].forEach((hx) => {
    const hGrad = ctx.createRadialGradient(hx, vanHeadL_Y, 8, hx, vanHeadL_Y - 25, 110);
    hGrad.addColorStop(0.0, 'rgba(255, 240, 153, 0.55)');
    hGrad.addColorStop(0.40, 'rgba(255, 230, 130, 0.28)');
    hGrad.addColorStop(0.80, 'rgba(255, 210, 100, 0.08)');
    hGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = hGrad;
    ctx.beginPath();
    ctx.ellipse(hx, vanHeadL_Y - 25, 50, 95, -0.18, 0, Math.PI * 2);
    ctx.fill();
  });

  // 4. Subtle Stage-Front Theatrical Warm Glow - Aligned 1:1 with soundRigGroup at X=2.35
  const stageGlowX = toPxX(2.35);
  const stageGlowY = toPxY(-4.2);
  const stageGlowGrad = ctx.createRadialGradient(stageGlowX, stageGlowY, 15, stageGlowX, stageGlowY, 140);
  stageGlowGrad.addColorStop(0.0, 'rgba(255, 56, 152, 0.25)');
  stageGlowGrad.addColorStop(0.50, 'rgba(36, 229, 255, 0.15)');
  stageGlowGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = stageGlowGrad;
  ctx.beginPath();
  ctx.ellipse(stageGlowX, stageGlowY, 150, 60, -0.22, 0, Math.PI * 2);
  ctx.fill();

  // 5. East Bodega Shopfront Window Warm Golden Bounce Pool
  const eastSpillX = toPxX(9.2);
  const eastSpillY = toPxY(2.2);
  const eastSpillGrad = ctx.createRadialGradient(eastSpillX, eastSpillY, 15, eastSpillX, eastSpillY, 160);
  eastSpillGrad.addColorStop(0.0, 'rgba(255, 184, 54, 0.55)');
  eastSpillGrad.addColorStop(0.35, 'rgba(255, 160, 40, 0.35)');
  eastSpillGrad.addColorStop(0.70, 'rgba(255, 130, 30, 0.12)');
  eastSpillGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = eastSpillGrad;
  ctx.beginPath();
  ctx.ellipse(eastSpillX, eastSpillY, 125, 160, -0.22, 0, Math.PI * 2);
  ctx.fill();

  // 6. East Dual Neon Signs ("BOOMBOX BATTLE") Cyan/Magenta Floor Wash
  const neonWashX = toPxX(8.6);
  const neonWashY = toPxY(0.8);
  const neonWashGrad = ctx.createRadialGradient(neonWashX, neonWashY, 8, neonWashX, neonWashY, 120);
  neonWashGrad.addColorStop(0.0, 'rgba(36, 229, 255, 0.40)');
  neonWashGrad.addColorStop(0.40, 'rgba(255, 42, 133, 0.28)');
  neonWashGrad.addColorStop(0.75, 'rgba(120, 30, 160, 0.10)');
  neonWashGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = neonWashGrad;
  ctx.beginPath();
  ctx.ellipse(neonWashX, neonWashY, 95, 120, -0.15, 0, Math.PI * 2);
  ctx.fill();

  _arenaLightMapTex = new THREE.CanvasTexture(c);
  _arenaLightMapTex.colorSpace = THREE.SRGBColorSpace;
  _arenaLightMapTex.generateMipmaps = false;
  _arenaLightMapTex.minFilter = THREE.LinearFilter;
  return _arenaLightMapTex;
}

export function createFlightCase(w = 1.1, h = 0.85, d = 0.85, color = 0x181820, stencilText = 'KRONOS SOUND') {
  const caseGroup = new THREE.Group();
  const mainBox = createHiFiMesh(new THREE.BoxGeometry(w, h, d), color, 0.035);
  mainBox.name = 'flight_case_mesh';
  caseGroup.add(mainBox);

  const edgeMatColor = 0xa1aab8;
  const edgeT = 0.032;
  [-h/2, h/2].forEach((ey) => {
    [-d/2, d/2].forEach((ez) => {
      const edge = createHiFiMesh(new THREE.BoxGeometry(w, edgeT, edgeT), edgeMatColor, 0.02);
      edge.position.set(0, ey, ez);
      caseGroup.add(edge);
    });
  });
  [-w/2, w/2].forEach((ex) => {
    [-d/2, d/2].forEach((ez) => {
      const edge = createHiFiMesh(new THREE.BoxGeometry(edgeT, h, edgeT), edgeMatColor, 0.02);
      edge.position.set(ex, 0, ez);
      caseGroup.add(edge);
    });
  });
  [-w/2, w/2].forEach((ex) => {
    [-h/2, h/2].forEach((ey) => {
      const edge = createHiFiMesh(new THREE.BoxGeometry(edgeT, edgeT, d), edgeMatColor, 0.02);
      edge.position.set(ex, ey, 0);
      caseGroup.add(edge);
    });
  });

  const cornerR = 0.052;
  [-w/2, w/2].forEach((cx) => {
    [-h/2, h/2].forEach((cy) => {
      [-d/2, d/2].forEach((cz) => {
        const ball = createHiFiMesh(new THREE.SphereGeometry(cornerR, 8, 8), 0xc4ccdc, 0.02, null, 0x000000, {
          isMetallic: true,
          glintThreshold: 0.82,
          glintIntensity: 1.5
        });
        ball.position.set(cx, cy, cz);
        caseGroup.add(ball);
      });
    });
  });

  [-w * 0.28, w * 0.28].forEach((lx) => {
    const latch = createHiFiMesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), 0x71717a, 0.015);
    latch.position.set(lx, 0, d/2 + 0.012);
    caseGroup.add(latch);
  });

  [-w/2 - 0.01, w/2 + 0.01].forEach((hx) => {
    const handleDish = createHiFiMesh(new THREE.BoxGeometry(0.02, 0.14, 0.22), 0x22242c, 0.015);
    handleDish.position.set(hx, 0, 0);
    caseGroup.add(handleDish);
  });

  if (stencilText) {
    const stCanvas = document.createElement('canvas');
    stCanvas.width = 256;
    stCanvas.height = 64;
    const sCtx = stCanvas.getContext('2d');
    sCtx.clearRect(0, 0, 256, 64);
    sCtx.font = '900 24px Impact, monospace';
    sCtx.fillStyle = 'rgba(235, 238, 245, 0.78)';
    sCtx.textAlign = 'center';
    sCtx.fillText(stencilText, 128, 42);
    const stTex = new THREE.CanvasTexture(stCanvas);
    stTex.colorSpace = THREE.SRGBColorSpace;
    const stMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.65, (w * 0.65) * 0.25),
      new THREE.MeshBasicMaterial({ map: stTex, transparent: true })
    );
    stMesh.position.set(0, h * 0.2, d/2 + 0.018);
    caseGroup.add(stMesh);
  }

  return caseGroup;
}

export function createJerseyBarrier(w = 2.2, h = 0.88, d = 0.62) {
  const barrierGroup = new THREE.Group();
  const tex = createJerseyBarrierTexture();

  // Use 0xffffff so concrete texture is not darkened, with Track 4 creviceAO
  const basePlinth = createHiFiMesh(new THREE.BoxGeometry(w, 0.28, d), 0xffffff, 0.038, tex, 0x000000, { creviceAO: true });
  basePlinth.name = 'jersey_barrier_mesh';
  basePlinth.position.y = 0.14;
  barrierGroup.add(basePlinth);

  const midSlope = createHiFiMesh(new THREE.BoxGeometry(w, 0.22, d * 0.70), 0xffffff, 0.035, tex);
  midSlope.position.y = 0.39;
  barrierGroup.add(midSlope);

  const stem = createHiFiMesh(new THREE.BoxGeometry(w, 0.38, d * 0.38), 0xffffff, 0.035, tex);
  stem.position.y = 0.69;
  barrierGroup.add(stem);

  const cap = createHiFiMesh(new THREE.CylinderGeometry(d * 0.19, d * 0.19, w, 10), 0x7a808c, 0.03);
  cap.rotation.z = Math.PI / 2;
  cap.position.y = 0.88;
  barrierGroup.add(cap);

  // Retro-reflective safety orange warning stripe plates (unlit / high-visibility)
  const stripeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });

  // Front face stripe plate (+Z)
  const frontStripe = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, 0.36), stripeMat);
  frontStripe.position.set(0, 0.52, d * 0.38 * 0.5 + 0.015);
  barrierGroup.add(frontStripe);

  // Angled mid-slope stripe plate facing slightly upward towards camera
  const slopeStripe = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, 0.22), stripeMat);
  slopeStripe.position.set(0, 0.39, d * 0.70 * 0.5 + 0.012);
  slopeStripe.rotation.x = -0.32;
  barrierGroup.add(slopeStripe);

  [-w * 0.32, w * 0.32].forEach((fx) => {
    const slot = createHiFiMesh(new THREE.BoxGeometry(0.24, 0.10, d + 0.02), 0x222630, 0.02);
    slot.position.set(fx, 0.05, 0);
    barrierGroup.add(slot);
  });

  return barrierGroup;
}

export function buildBoomboxStage(scene) {
  const soundRigGroup = new THREE.Group();
  soundRigGroup.position.set(2.35, 0, -5.6);
  soundRigGroup.rotation.y = -0.22;
  soundRigGroup.scale.setScalar(0.86);
  scene.add(soundRigGroup);

  // 1. Main Boombox Truck Base & Center Booth Cabinet
  const stageChassisTex = createStageChassisTexture();
  const stageBase = createHiFiMesh(new THREE.BoxGeometry(8.6, 1.35, 3.2), 0xffffff, 0.03, stageChassisTex, 0x120f20, { creviceAO: true });
  stageBase.position.set(0, 0.68, 0);
  soundRigGroup.add(stageBase);

  // Front Trailer Skirt Graphic Plane
  const skirtPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(8.55, 1.30),
    new THREE.MeshBasicMaterial({ map: stageChassisTex })
  );
  skirtPlane.position.set(0, 0.68, 1.61);
  soundRigGroup.add(skirtPlane);

  // Hydraulic Ground Stabilization Outriggers (matching concept art 2)
  [-4.1, 4.1].forEach((ox) => {
    const outriggerGroup = new THREE.Group();
    outriggerGroup.position.set(ox, 0, 1.4);

    const diagBeam = createHiFiMesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), 0xf5b942, 0.025);
    diagBeam.position.set(ox > 0 ? 0.22 : -0.22, 0.52, 0.15);
    diagBeam.rotation.z = ox > 0 ? -0.42 : 0.42;
    outriggerGroup.add(diagBeam);

    const jackCyl = createHiFiMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.55, 12), 0xf5b942, 0.025);
    jackCyl.position.set(ox > 0 ? 0.42 : -0.42, 0.32, 0.3);
    outriggerGroup.add(jackCyl);

    const piston = createHiFiMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 10), 0xdce2ec, 0.02);
    piston.position.set(ox > 0 ? 0.42 : -0.42, 0.14, 0.3);
    outriggerGroup.add(piston);

    const footPad = createHiFiMesh(new THREE.CylinderGeometry(0.24, 0.26, 0.06, 14), 0x181a24, 0.02);
    footPad.position.set(ox > 0 ? 0.42 : -0.42, 0.03, 0.3);
    outriggerGroup.add(footPad);

    soundRigGroup.add(outriggerGroup);
  });

  const centerCabinet = createHiFiMesh(new THREE.BoxGeometry(3.5, 3.6, 2.5), 0x201a38, 0.035);
  centerCabinet.position.set(0, 3.1, -0.1);
  soundRigGroup.add(centerCabinet);

  // Recessed Glowing DJ Booth Backdrop
  const boothBackCanvas = document.createElement('canvas');
  boothBackCanvas.width = 256;
  boothBackCanvas.height = 160;
  const bCtx = boothBackCanvas.getContext('2d');
  bCtx.fillStyle = '#12183b';
  bCtx.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 12; i++) {
    bCtx.fillStyle = i % 2 === 0 ? '#ff3898' : '#24e5ff';
    const bh = 35 + ((i * 29) % 85);
    bCtx.fillRect(12 + i * 20, 148 - bh, 13, bh);
  }
  const boothBackTex = new THREE.CanvasTexture(boothBackCanvas);
  boothBackTex.colorSpace = THREE.SRGBColorSpace;

  const boothWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.85, 1.55),
    new THREE.MeshBasicMaterial({ map: boothBackTex })
  );
  boothWindow.position.set(0, 2.75, 1.16);
  soundRigGroup.add(boothWindow);

  // Neon Cyan Frame around DJ Booth Window
  const boothFrame = createHiFiMesh(new THREE.BoxGeometry(3.05, 1.72, 0.14), 0x24e5ff, 0.02, null, 0x0a6688);
  boothFrame.position.set(0, 2.75, 1.08);
  soundRigGroup.add(boothFrame);

  // 2. Twin Pro DJ Turntables Station on Console Desk
  const djConsole = createHiFiMesh(new THREE.BoxGeometry(3.35, 1.35, 1.25), 0x18152b, 0.04);
  djConsole.position.set(0, 1.35, 1.35);
  soundRigGroup.add(djConsole);

  const turntablePlatters = [];
  [-0.75, 0.75].forEach((tx) => {
    const deck = new THREE.Group();
    deck.position.set(tx, 2.06, 1.45);
    soundRigGroup.add(deck);

    const plinth = createHiFiMesh(new THREE.BoxGeometry(0.72, 0.10, 0.62), 0x24222e, 0.04);
    deck.add(plinth);

    const platter = createHiFiMesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 24), 0x111016, 0.03);
    platter.position.set(-0.06, 0.065, 0);
    deck.add(platter);
    turntablePlatters.push(platter);

    const label = createHiFiMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 18), 0xf5c538, 0.03);
    label.position.set(-0.06, 0.07, 0);
    deck.add(label);

    const tonearm = createHiFiMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 8), 0xdde2ea, 0.02);
    tonearm.position.set(0.22, 0.11, -0.04);
    tonearm.rotation.set(0.2, 0, 0.75);
    deck.add(tonearm);

    [-0.20, -0.10, 0.0].forEach((bx, bIdx) => {
      const btn = createHiFiMesh(
        new THREE.BoxGeometry(0.04, 0.02, 0.04),
        bIdx === 0 ? 0x24e5ff : 0xff2a85,
        0.02,
        null,
        bIdx === 0 ? 0x0c4a66 : 0x660e33
      );
      btn.position.set(bx, 0.06, 0.22);
      deck.add(btn);
    });
  });

  // 3. High-Resolution 20-Column Segmented Equalizer Display (1024x384)
  const eqCanvas = document.createElement('canvas');
  eqCanvas.width = 1024;
  eqCanvas.height = 384;
  const eqCtx = eqCanvas.getContext('2d');
  const eqTex = new THREE.CanvasTexture(eqCanvas);
  eqTex.colorSpace = THREE.SRGBColorSpace;

  const eqScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.95, 0.98),
    new THREE.MeshBasicMaterial({ map: eqTex })
  );
  eqScreen.position.set(0, 1.38, 1.99);
  soundRigGroup.add(eqScreen);

  const numCols = 20;
  const numSegs = 14;
  const colW = 42;
  const colGap = 7;
  const segH = 20;
  const segGap = 5;
  const startX = 24;
  const baseY = 360;

  const peakLevels = new Float32Array(numCols);
  const peakHoldTimers = new Int32Array(numCols);

  // 4. Dual Warm-Amber Analog VU Meter Dials with Ballistic Spring-Damper Physics (1024x360)
  const vuCanvas = document.createElement('canvas');
  vuCanvas.width = 1024;
  vuCanvas.height = 360;
  const vuCtx = vuCanvas.getContext('2d');
  const vuTex = new THREE.CanvasTexture(vuCanvas);
  vuTex.colorSpace = THREE.SRGBColorSpace;

  const vuPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.95, 0.88),
    new THREE.MeshBasicMaterial({ map: vuTex })
  );
  vuPanel.position.set(0, 4.18, 1.18);
  soundRigGroup.add(vuPanel);

  const vuBallistics = {
    angleL: -0.75,
    velL: 0,
    angleR: -0.75,
    velR: 0
  };
  const kSpring = 145.0;
  const cDamp = 16.5;

  // 4B. Upward-Tilted Stage Canopy Roof Awning (~25° tilt) with Perimeter Amber Chase Bulbs
  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(0, 4.88, 0.40);
  canopyGroup.rotation.x = -0.42; // ~24° upward awning tilt
  soundRigGroup.add(canopyGroup);

  // Main Canopy Roof Slab
  const canopySlab = createHiFiMesh(new THREE.BoxGeometry(5.2, 0.24, 2.2), 0x18142c, 0.04);
  canopySlab.position.set(0, 0, 0);
  canopyGroup.add(canopySlab);

  // Underside Canopy Frame & Reflector Panel
  const canopyLining = createHiFiMesh(new THREE.BoxGeometry(4.9, 0.06, 1.95), 0x221a36, 0.02);
  canopyLining.position.set(0, -0.12, 0);
  canopyGroup.add(canopyLining);

  // Perimeter Amber Chase Bulbs along Front & Side Underside Lip
  const chaseBulbMat = new THREE.MeshBasicMaterial({ color: 0xffd13b });
  const chaseBulbGeo = new THREE.SphereGeometry(0.075, 8, 8);
  for (let bx = -2.35; bx <= 2.35; bx += 0.32) {
    const bulb = new THREE.Mesh(chaseBulbGeo, chaseBulbMat);
    bulb.position.set(bx, -0.16, 1.02);
    canopyGroup.add(bulb);
  }
  [-0.6, -0.2, 0.2, 0.6].forEach((bz) => {
    [-2.42, 2.42].forEach((bx) => {
      const sideBulb = new THREE.Mesh(chaseBulbGeo, chaseBulbMat);
      sideBulb.position.set(bx, -0.16, bz);
      canopyGroup.add(sideBulb);
    });
  });

  // Twin Hydraulic Gas Struts propping up the Stage Canopy
  [-2.2, 2.2].forEach((sx) => {
    const strutOuter = createHiFiMesh(new THREE.CylinderGeometry(0.045, 0.045, 1.25, 8), 0xf5b942, 0.02);
    strutOuter.position.set(sx, 3.8, 0.2);
    strutOuter.rotation.x = 0.32;
    soundRigGroup.add(strutOuter);

    const strutRod = createHiFiMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 8), 0xc4ccdc, 0.02);
    strutRod.position.set(sx, 4.4, 0.45);
    strutRod.rotation.x = 0.32;
    soundRigGroup.add(strutRod);
  });

  // Header Banners & Neon Marquee mounted on canopy
  const subBanner = createHiFiMesh(new THREE.BoxGeometry(4.8, 0.56, 0.6), 0x18142c, 0.035);
  subBanner.position.set(0, 0.38, 0.65);
  canopyGroup.add(subBanner);

  const subBannerPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.65, 0.50),
    new THREE.MeshBasicMaterial({ map: createTruckSubBannerTexture() })
  );
  subBannerPlane.position.set(0, 0.38, 0.96);
  canopyGroup.add(subBannerPlane);

  const marqueeBox = createHiFiMesh(new THREE.BoxGeometry(4.4, 1.15, 0.75), 0x140f26, 0.04);
  marqueeBox.position.set(0, 1.25, 0.45);
  canopyGroup.add(marqueeBox);

  const marqueePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.25, 1.05),
    new THREE.MeshBasicMaterial({ map: createMarqueeTexture() })
  );
  marqueePlane.position.set(0, 1.25, 0.84);
  canopyGroup.add(marqueePlane);

  // 5. Left & Right Transforming Mechanical Speaker Wings & Stacked Amps
  const wooferCones = [];
  const conePts = [
    new THREE.Vector2(0.01, -0.05),
    new THREE.Vector2(0.20, 0.06),
    new THREE.Vector2(0.56, -0.14),
    new THREE.Vector2(0.64, -0.14),
    new THREE.Vector2(0.66, 0.0)
  ];
  const wooferGeo = new THREE.LatheGeometry(conePts, 24);
  wooferGeo.rotateX(Math.PI / 2);

  const ampGrilleTex = createAmpGrilleTexture();

  function buildSpeakerCabinet(side) {
    const wing = new THREE.Group();
    // Articulated mechanical wing angle (±0.35 rad)
    wing.position.set(side * 3.15, 2.95, 0.25);
    wing.rotation.y = side * -0.35;

    // 1. Aerodynamic Wing Truss Fairing with Neon Trim
    const wingTruss = createHiFiMesh(new THREE.BoxGeometry(2.45, 3.65, 2.1), 0x1a162b, 0.04);
    wing.add(wingTruss);

    const neonFrame = createHiFiMesh(
      new THREE.BoxGeometry(2.52, 3.72, 1.95),
      side < 0 ? 0xc84bff : 0x24e5ff,
      0.0,
      null,
      side < 0 ? 0x4a1268 : 0x095266
    );
    wing.add(neonFrame);

    // 2. High-Power Stacked Guitar / Bass Amplifier Cabinets
    // A. 4x12 Speaker Cabinet (Black Tolex, Woven Cloth Grille, 8 Gold Corner Caps)
    const cab412 = createHiFiMesh(new THREE.BoxGeometry(1.28, 1.32, 0.68), 0x15151a, 0.035);
    cab412.position.set(side * -0.35, 0.95, 0.92);
    wing.add(cab412);

    const cabGrille = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 1.22),
      new THREE.MeshBasicMaterial({ map: ampGrilleTex })
    );
    cabGrille.position.set(side * -0.35, 0.95, 1.27);
    wing.add(cabGrille);

    // 8 Gold Metal Corner Caps on 4x12
    [-0.60, 0.60].forEach((cx) => {
      [-0.62, 0.62].forEach((cy) => {
        [-0.30, 0.30].forEach((cz) => {
          const cornerCap = createHiFiMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), 0xd09e38, 0.02);
          cornerCap.position.set(side * -0.35 + cx, 0.95 + cy, 0.92 + cz);
          wing.add(cornerCap);
        });
      });
    });

    // Gold Script Logo Plaque
    const logoBadge = createHiFiMesh(new THREE.BoxGeometry(0.32, 0.08, 0.02), 0xd09e38, 0.015);
    logoBadge.position.set(side * -0.35, 1.32, 1.28);
    wing.add(logoBadge);

    // B. Amplifier Head Unit mounted atop 4x12
    const ampHead = createHiFiMesh(new THREE.BoxGeometry(1.22, 0.44, 0.58), 0x16161c, 0.03);
    ampHead.position.set(side * -0.35, 1.88, 0.88);
    wing.add(ampHead);

    const facePlate = createHiFiMesh(new THREE.BoxGeometry(1.12, 0.28, 0.02), 0xd8ac32, 0.02);
    facePlate.position.set(side * -0.35, 1.88, 1.18);
    wing.add(facePlate);

    // Row of 6 chicken-head knobs
    for (let k = 0; k < 6; k++) {
      const kx = side * -0.35 - 0.38 + k * 0.15;
      const knob = createHiFiMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), 0x111114, 0.015);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(kx, 1.88, 1.20);
      wing.add(knob);
    }

    // Glowing red jewel pilot light
    const pilotJewel = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff1744 })
    );
    pilotJewel.position.set(side * -0.35 + 0.45, 1.88, 1.20);
    wing.add(pilotJewel);

    // Black leather carrying handle on amp head
    const handle = createHiFiMesh(new THREE.BoxGeometry(0.32, 0.04, 0.08), 0x121216, 0.015);
    handle.position.set(side * -0.35, 2.12, 0.88);
    wing.add(handle);

    // 3. High-Excursion Woofers (Responsive to Bass in updateStageDisplays)
    const bigW = new THREE.Group();
    bigW.position.set(side * 0.45, -0.58, 1.16);
    bigW.scale.setScalar(1.38);

    const bigDrv = createHiFiMesh(wooferGeo, 0x141124, 0.045);
    bigW.add(bigDrv);

    const bigCap = createHiFiMesh(new THREE.SphereGeometry(0.22, 16, 12), 0xf5b942, 0.03);
    bigCap.scale.set(1, 1, 0.42);
    bigCap.position.z = 0.04;
    bigW.add(bigCap);

    const bigRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.052, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xe048ff })
    );
    bigRing.position.z = 0.03;
    bigW.add(bigRing);

    wing.add(bigW);
    wooferCones.push(bigW);

    // Speaker mounting bolts around woofer perimeter rings
    const screwGeo = new THREE.BoxGeometry(0.028, 0.028, 0.02);
    const screwMat = new THREE.MeshBasicMaterial({ color: 0xf5b942 });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(Math.cos(ang) * 0.62, Math.sin(ang) * 0.62, 0.06);
      bigW.add(screw);
    }

    // Upper twin satellite driver
    const smallW = new THREE.Group();
    smallW.position.set(side * 0.52, 0.88, 1.14);
    smallW.scale.setScalar(0.72);

    const drv = createHiFiMesh(wooferGeo, 0x141124, 0.05);
    smallW.add(drv);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.60, 0.06, 10, 24),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xd946ef : 0x24e5ff })
    );
    ring.position.z = 0.03;
    smallW.add(ring);

    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(Math.cos(ang) * 0.60, Math.sin(ang) * 0.60, 0.06);
      smallW.add(screw);
    }

    wing.add(smallW);
    wooferCones.push(smallW);

    // 4. Heavy-Duty Dual Hydraulic Actuators propping the wing boom arm
    [0.45, 1.85].forEach((py) => {
      const cylOuter = createHiFiMesh(new THREE.CylinderGeometry(0.085, 0.085, 1.1, 10), 0xf5b942, 0.03);
      cylOuter.rotation.z = side * 0.48;
      cylOuter.rotation.y = side * 0.35;
      cylOuter.position.set(side * -0.95, py - 1.2, -0.15);
      wing.add(cylOuter);

      const pistonRod = createHiFiMesh(new THREE.CylinderGeometry(0.048, 0.048, 1.0, 10), 0xc4ccdc, 0.025);
      pistonRod.rotation.z = side * 0.48;
      pistonRod.rotation.y = side * 0.35;
      pistonRod.position.set(side * -0.55, py - 1.0, -0.05);
      wing.add(pistonRod);
    });

    return wing;
  }

  const leftWingTower = buildSpeakerCabinet(-1);
  const rightWingTower = buildSpeakerCabinet(1);
  soundRigGroup.add(leftWingTower);
  soundRigGroup.add(rightWingTower);

  // 6. Upgraded 5 Golden Brass Horn Bells (Shrunk to bell radius ~0.28-0.36 so they don't cover right side of screen)
  const hornPts = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    const r = 0.048 + Math.pow(u, 2.45) * 0.272; // Calibrated bell radius ~0.320 (spec: 0.28-0.36)
    hornPts.push(new THREE.Vector2(r, u * 1.45));
  }
  const brassHornGeo = new THREE.LatheGeometry(hornPts, 32);
  brassHornGeo.rotateX(Math.PI / 2);

  const brassTex = createBrassInteriorTexture();
  const brassMat = createMetallicCelMaterial(0xe4c65e, brassTex, 0x000000, {
    glintThreshold: 0.88,
    glintIntensity: 1.2
  });
  brassMat.side = THREE.DoubleSide;

  // Solid dark backing material: DoubleSide + depthWrite: true to guarantee zero bleed-through
  const solidBackingMat = new THREE.MeshBasicMaterial({
    color: 0x140d06,
    side: THREE.DoubleSide,
    depthWrite: true
  });

  const hornSpecs = [
    { pos: [-3.15, 5.45, 0.85], rot: [0.14, -0.32, 0], baseScale: 1.0 },
    { pos: [3.15, 5.75, 0.65], rot: [0.18, 0.15, 0], baseScale: 1.0 },
    { pos: [4.35, 4.25, 0.65], rot: [0.08, 0.22, 0], baseScale: 0.85 },
    { pos: [4.35, 3.05, 0.65], rot: [0.05, 0.22, 0], baseScale: 0.85 },
    { pos: [4.35, 1.85, 0.65], rot: [0.02, 0.22, 0], baseScale: 0.85 }
  ];

  const brassHorns = [];
  hornSpecs.forEach(({ pos, rot, baseScale }) => {
    const hGroup = new THREE.Group();
    hGroup.position.set(...pos);
    hGroup.rotation.set(...rot);
    hGroup.scale.setScalar(baseScale);

    // 1. Outer Flared Brass Horn
    const bell = new THREE.Mesh(brassHornGeo, brassMat);
    hGroup.add(bell);

    // 2. Chunky Outer Lip Ring
    const lipRing = createHiFiMesh(new THREE.TorusGeometry(0.32, 0.032, 12, 32), 0xffe266, 0.045);
    lipRing.position.z = 1.44;
    hGroup.add(lipRing);

    // 3. Throat Baffle Disc (prevents view penetration from front)
    const throatDisc = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), solidBackingMat);
    throatDisc.position.z = 0.45;
    hGroup.add(throatDisc);

    // 4. Rear Base Plug Cap (prevents background bleed-through from rear)
    const basePlugCap = new THREE.Mesh(new THREE.CircleGeometry(0.048, 16), solidBackingMat);
    basePlugCap.position.z = 0.01;
    hGroup.add(basePlugCap);

    // 5. Tubular Mounting Truss Bracket (anchors horn to chassis)
    const bracket = createHiFiMesh(new THREE.CylinderGeometry(0.038, 0.038, 0.65, 8), 0x222638, 0.03);
    bracket.position.set(0, -0.28, -0.15);
    bracket.rotation.x = Math.PI / 4;
    hGroup.add(bracket);

    soundRigGroup.add(hGroup);
    brassHorns.push({ hGroup, baseScale });
  });

  // 7. Gold Velvet-Rope Stanchions in front of the DJ Equalizer Booth
  const stanchionX = [-1.85, -0.65, 0.65, 1.85];
  stanchionX.forEach((sx, idx) => {
    const post = createHiFiMesh(new THREE.CylinderGeometry(0.04, 0.05, 0.92, 10), 0xf5b942, 0.04);
    post.position.set(sx, 0.46, 2.35);
    soundRigGroup.add(post);

    if (idx < stanchionX.length - 1) {
      const nextX = stanchionX[idx + 1];
      const ropePts = [];
      for (let r = 0; r <= 10; r++) {
        const u = r / 10;
        const rx = THREE.MathUtils.lerp(sx, nextX, u);
        const ry = 0.82 - Math.sin(u * Math.PI) * 0.24;
        ropePts.push(new THREE.Vector3(rx, ry, 2.35));
      }
      const ropeCurve = new THREE.CatmullRomCurve3(ropePts);
      const ropeGeo = new THREE.TubeGeometry(ropeCurve, 12, 0.032, 8, false);
      const rope = createHiFiMesh(ropeGeo, 0xd92424, 0.04);
      soundRigGroup.add(rope);
    }
  });

  // 8. Transforming Boombox Truck Cab, Heavy-Duty Wheels, Chrome Exhaust Stacks & Bull-Bar
  const truckCabGroup = new THREE.Group();
  truckCabGroup.position.set(-5.05, 0, -0.15);
  soundRigGroup.add(truckCabGroup);

  const cabBody = createHiFiMesh(new THREE.BoxGeometry(1.75, 2.55, 2.75), 0x1e1934, 0.04);
  cabBody.position.set(0, 1.55, 0);
  truckCabGroup.add(cabBody);

  const cabHood = createHiFiMesh(new THREE.BoxGeometry(1.15, 1.45, 2.60), 0x262040, 0.04);
  cabHood.position.set(-1.35, 1.00, 0);
  truckCabGroup.add(cabHood);

  // Gold Radiator Grille & Chrome Bull-Bar on Front of Truck Hood
  const radiatorGrille = createHiFiMesh(new THREE.BoxGeometry(0.12, 0.92, 1.85), 0xf5b942, 0.03);
  radiatorGrille.position.set(-1.92, 1.02, 0);
  truckCabGroup.add(radiatorGrille);

  // Glowing Amber Truck Headlights
  [-0.98, 0.98].forEach((hz) => {
    const tLight = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14),
      new THREE.MeshBasicMaterial({ color: 0xffe46b })
    );
    tLight.rotation.z = Math.PI / 2;
    tLight.position.set(-1.94, 1.02, hz);
    truckCabGroup.add(tLight);
  });

  // Twin Vertical Chrome Exhaust Stacks behind Truck Cab
  [-1.15, 1.15].forEach((ez) => {
    const stackPipe = createHiFiMesh(
      new THREE.CylinderGeometry(0.09, 0.11, 3.65, 12),
      0xc4ccdc,
      0.03,
      null,
      0x000000,
      { isMetallic: true, glintThreshold: 0.82, glintIntensity: 1.8 }
    );
    stackPipe.position.set(0.72, 2.65, ez);
    truckCabGroup.add(stackPipe);
  });

  // 6 Heavy-Duty Boombox Truck Tires with Gold Alloy Rims along Chassis Base
  const truckWheelGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.44, 20);
  truckWheelGeo.rotateX(Math.PI / 2);
  const truckRimGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.46, 16);
  truckRimGeo.rotateX(Math.PI / 2);
  [
    [-5.95, 0.58, 1.48],
    [-1.85, 0.58, 1.62],
    [1.85,  0.58, 1.62],
    [3.65,  0.58, 1.62]
  ].forEach(([wx, wy, wz]) => {
    const tire = createHiFiMesh(truckWheelGeo, 0x101016, 0.04);
    tire.position.set(wx, wy, wz);
    soundRigGroup.add(tire);

    const rim = createHiFiMesh(truckRimGeo, 0xf5b942, 0.025);
    rim.position.set(wx, wy, wz + 0.02);
    soundRigGroup.add(rim);
  });

  // 9. Articulated Hydraulic Hinge Arms & Pistons Unfolding the Speaker Wings
  [-1, 1].forEach((side) => {
    [1.85, 4.15].forEach((hy) => {
      const cylOuter = createHiFiMesh(new THREE.CylinderGeometry(0.085, 0.085, 0.85, 10), 0xf5b942, 0.03);
      cylOuter.rotation.z = Math.PI / 2;
      cylOuter.position.set(side * 1.65, hy, 0.85);
      soundRigGroup.add(cylOuter);

      const pistonRod = createHiFiMesh(new THREE.CylinderGeometry(0.048, 0.048, 0.95, 10), 0xc4ccdc, 0.025);
      pistonRod.rotation.z = Math.PI / 2;
      pistonRod.position.set(side * 2.15, hy, 0.85);
      soundRigGroup.add(pistonRod);
    });

    // Gold Corner Bumper Brackets & Bass-Reflex Ports on Wing Cabinets
    [-0.95, 0.95].forEach((cx) => {
      const cornerBracket = createHiFiMesh(new THREE.BoxGeometry(0.24, 0.24, 0.12), 0xf5b942, 0.025);
      cornerBracket.position.set(side * 2.95 + cx, 1.42, 1.24);
      soundRigGroup.add(cornerBracket);
    });
  });

  // 10. Pro DJ Mixer Crossfader Deck & Stage Monitor Wedges on Front Lip
  const mixerBox = createHiFiMesh(new THREE.BoxGeometry(0.62, 0.11, 0.56), 0x14121d, 0.03);
  mixerBox.position.set(0, 2.06, 1.46);
  soundRigGroup.add(mixerBox);

  [-0.18, 0, 0.18].forEach((fx) => {
    const fader = createHiFiMesh(new THREE.BoxGeometry(0.06, 0.03, 0.14), 0xf5b942, 0.015);
    fader.position.set(fx, 2.13, 1.54);
    soundRigGroup.add(fader);
  });

  [-2.65, -1.25, 1.25, 2.65].forEach((mx) => {
    const monWedge = createHiFiMesh(new THREE.BoxGeometry(0.76, 0.36, 0.52), 0x161424, 0.035);
    monWedge.position.set(mx, 0.95, 1.85);
    monWedge.rotation.x = -0.38;
    soundRigGroup.add(monWedge);

    const monTrim = createHiFiMesh(new THREE.BoxGeometry(0.66, 0.26, 0.04), 0x2c2844, 0.02);
    monTrim.position.set(0, 0.04, 0.25);
    monWedge.add(monTrim);
  });

  // 11. Overhead Concert Lighting Box-Truss & 6 Volumetric Spotlight Cones & Floor Pools
  const topTruss = createHiFiMesh(new THREE.BoxGeometry(8.8, 0.28, 0.32), 0x2c3246, 0.035);
  topTruss.position.set(0, 6.82, 0.95);
  soundRigGroup.add(topTruss);

  [-1, 1].forEach((side) => {
    const trussPillar = createHiFiMesh(new THREE.BoxGeometry(0.24, 2.15, 0.24), 0x2c3246, 0.035);
    trussPillar.position.set(side * 4.15, 5.75, 0.95);
    soundRigGroup.add(trussPillar);
  });

  const spotColors = [0xffd54f, 0xff2a85, 0x00f0ff, 0x00f0ff, 0x2979ff, 0xff2a85];
  // Tuned theatrical spotlight geometry: narrow (top 0.16m, bottom 1.35m), length 6.2m
  // rotateX(-Math.PI / 2) places narrow top at can lens (z=0) and expanding bottom towards floor (z=6.2m)
  const volConeGeo = new THREE.CylinderGeometry(0.16, 1.35, 6.2, 24, 1, true);
  volConeGeo.rotateX(-Math.PI / 2);

  const poolGeo = new THREE.PlaneGeometry(3.1, 2.2);
  poolGeo.rotateX(-Math.PI / 2);
  const poolTex = createLightPoolTexture();

  [-3.6, -2.2, -0.9, 0.9, 2.2, 3.6].forEach((sx, sIdx) => {
    const canGroup = new THREE.Group();
    canGroup.position.set(sx, 6.62, 1.08);
    canGroup.rotation.x = 0.70; // Steeper downward pitch aiming directly into asphalt floor pools
    canGroup.rotation.y = sx * 0.08; // Fans outward, keeping center stage, DJ booth, marquee & meters completely clear
    soundRigGroup.add(canGroup);

    const canBody = createHiFiMesh(new THREE.CylinderGeometry(0.14, 0.18, 0.38, 12), 0x141622, 0.03);
    canBody.rotation.x = Math.PI / 2;
    canGroup.add(canBody);

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 14),
      new THREE.MeshBasicMaterial({ color: spotColors[sIdx] })
    );
    lens.position.z = 0.20;
    canGroup.add(lens);

    // Volumetric Additive-Blended Spotlight Beam Cone (Calibrated zero-washout opacity 0.045, FrontSide)
    const coneMat = new THREE.MeshBasicMaterial({
      color: spotColors[sIdx],
      transparent: true,
      opacity: 0.045,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const coneMesh = new THREE.Mesh(volConeGeo, coneMat);
    coneMesh.name = 'spotlight_cone_beam';
    coneMesh.position.z = 3.1;
    canGroup.add(coneMesh);

    // Projected Elliptical Light Pool on Asphalt Floor (Calibrated soft opacity 0.20)
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: spotColors[sIdx],
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.position.set(sx * 1.25, 0.025, 4.3);
    soundRigGroup.add(poolMesh);
  });

  // Static Ground Contact Shadow Decals beneath Transforming Boombox Stage
  const stageTruckContactShadow = createContactShadowDecal(9.2, 3.8, 0.75);
  stageTruckContactShadow.position.set(0, 0.005, 0.5);
  soundRigGroup.add(stageTruckContactShadow);

  [-4.15, 4.15].forEach((tx) => {
    const wingContactShadow = createContactShadowDecal(2.4, 2.4, 0.70);
    wingContactShadow.position.set(tx, 0.005, 0.5);
    soundRigGroup.add(wingContactShadow);
  });

  // Stage road equipment flight cases on stage wings
  [-3.8, 3.8].forEach((fx) => {
    const stageCase = createFlightCase(0.9, 0.7, 0.7, 0x181820, 'KRONOS SOUND');
    stageCase.position.set(fx, 0.35, 1.8);
    stageCase.rotation.y = fx > 0 ? -0.2 : 0.2;
    soundRigGroup.add(stageCase);
  });

  let lastUpdateTime = performance.now();

  function updateStageDisplays(freqData, bass, beatPulse, dtArg) {
    const now = performance.now();
    const dt = dtArg !== undefined ? dtArg : Math.min((now - lastUpdateTime) * 0.001, 0.05) || 0.016;
    lastUpdateTime = now;

    // A. Update 20-Column Segmented Equalizer Display
    eqCtx.fillStyle = '#080812';
    eqCtx.fillRect(0, 0, 1024, 384);

    for (let c = 0; c < numCols; c++) {
      let rawVal = 0.45;
      if (freqData && freqData.length > 0) {
        const binIdx = Math.floor(Math.pow(c / numCols, 1.4) * (freqData.length * 0.65));
        rawVal = freqData[binIdx] / 255;
      }
      const centerFactor = 1.0 - Math.abs(c - numCols * 0.45) / (numCols * 0.7);
      const targetAmp = Math.min(1.0, rawVal * 0.82 + centerFactor * 0.32 + beatPulse * 0.28);
      const activeSegs = Math.max(1, Math.floor(targetAmp * numSegs));

      if (activeSegs >= peakLevels[c]) {
        peakLevels[c] = activeSegs;
        peakHoldTimers[c] = 12;
      } else {
        if (peakHoldTimers[c] > 0) {
          peakHoldTimers[c]--;
        } else {
          peakLevels[c] = Math.max(0, peakLevels[c] - 0.35);
        }
      }

      const x = startX + c * (colW + colGap);

      for (let s = 0; s < numSegs; s++) {
        const y = baseY - s * (segH + segGap);
        const isActive = s < activeSegs;

        if (isActive) {
          if (s < 4) {
            eqCtx.fillStyle = '#00f5ff';
            eqCtx.shadowColor = '#00e5ff';
          } else if (s < 8) {
            eqCtx.fillStyle = '#2ef064';
            eqCtx.shadowColor = '#2ef064';
          } else if (s < 11) {
            eqCtx.fillStyle = '#ffdd00';
            eqCtx.shadowColor = '#ffdd00';
          } else {
            eqCtx.fillStyle = '#ff204e';
            eqCtx.shadowColor = '#ff204e';
          }
          eqCtx.shadowBlur = 6;
          eqCtx.fillRect(x, y, colW, segH);
          eqCtx.shadowBlur = 0;
        } else {
          eqCtx.fillStyle = '#101422';
          eqCtx.fillRect(x, y, colW, segH);
          eqCtx.strokeStyle = 'rgba(28, 38, 58, 0.6)';
          eqCtx.lineWidth = 1;
          eqCtx.strokeRect(x + 0.5, y + 0.5, colW - 1, segH - 1);
        }
      }

      const pIdx = Math.floor(peakLevels[c]);
      if (pIdx > 0 && pIdx < numSegs) {
        const py = baseY - pIdx * (segH + segGap);
        eqCtx.fillStyle = '#ffffff';
        eqCtx.shadowColor = '#ff3898';
        eqCtx.shadowBlur = 8;
        eqCtx.fillRect(x, py, colW, 4);
        eqCtx.shadowBlur = 0;
      }
    }
    eqTex.needsUpdate = true;

    // B. Update Dual Analog VU Meters with Galvanometer Ballistics
    const targetL = -0.75 + Math.min(1.50, Math.pow(bass * 1.15 + beatPulse * 0.40, 1.2) * 1.35);
    const rightHighEnergy = freqData ? (freqData[12] || 100) / 255 : 0.4;
    const targetR = -0.75 + Math.min(1.50, Math.pow(bass * 0.95 + rightHighEnergy * 0.65, 1.2) * 1.35);

    const safeDt = Math.min(dt, 0.033);
    const aL = kSpring * (targetL - vuBallistics.angleL) - cDamp * vuBallistics.velL;
    vuBallistics.velL += aL * safeDt;
    vuBallistics.angleL += vuBallistics.velL * safeDt;

    const aR = kSpring * (targetR - vuBallistics.angleR) - cDamp * vuBallistics.velR;
    vuBallistics.velR += aR * safeDt;
    vuBallistics.angleR += vuBallistics.velR * safeDt;

    vuCtx.fillStyle = '#100d1c';
    vuCtx.fillRect(0, 0, 1024, 360);

    const vuCenters = [
      { cx: 256, label: 'CH-L // MASTER', angle: vuBallistics.angleL },
      { cx: 768, label: 'CH-R // BASS', angle: vuBallistics.angleR }
    ];

    vuCenters.forEach(({ cx, label, angle }) => {
      const radGrad = vuCtx.createRadialGradient(cx, 310, 20, cx, 240, 210);
      radGrad.addColorStop(0.0, '#fff4cc');
      radGrad.addColorStop(0.55, '#f7ca5e');
      radGrad.addColorStop(1.0, '#d19726');
      vuCtx.fillStyle = radGrad;
      vuCtx.fillRect(cx - 225, 20, 450, 315);

      vuCtx.lineWidth = 8;
      vuCtx.strokeStyle = '#08060e';
      vuCtx.strokeRect(cx - 225, 20, 450, 315);

      const cy = 310;
      const rScale = 195;

      // Normal Arc (-20 dB to 0 dB)
      vuCtx.strokeStyle = '#0a0812';
      vuCtx.lineWidth = 5;
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, rScale, -Math.PI * 0.5 - 0.75, -Math.PI * 0.5 + 0.28);
      vuCtx.stroke();

      // Red Overload Arc (0 dB to +3 dB)
      vuCtx.strokeStyle = '#d62020';
      vuCtx.lineWidth = 8;
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, rScale, -Math.PI * 0.5 + 0.28, -Math.PI * 0.5 + 0.72);
      vuCtx.stroke();

      const ticks = [
        { a: -0.75, txt: '-20' },
        { a: -0.52, txt: '-10' },
        { a: -0.32, txt: '-7' },
        { a: -0.15, txt: '-5' },
        { a: 0.05, txt: '-3' },
        { a: 0.28, txt: '0' },
        { a: 0.50, txt: '+1' },
        { a: 0.72, txt: '+3' }
      ];

      vuCtx.font = 'bold 15px monospace';
      vuCtx.textAlign = 'center';

      ticks.forEach(({ a, txt }) => {
        const rad = -Math.PI * 0.5 + a;
        const x1 = cx + Math.cos(rad) * (rScale - 4);
        const y1 = cy + Math.sin(rad) * (rScale - 4);
        const x2 = cx + Math.cos(rad) * (rScale + 12);
        const y2 = cy + Math.sin(rad) * (rScale + 12);
        const isRed = a >= 0.28;

        vuCtx.strokeStyle = isRed ? '#d62020' : '#0c0a14';
        vuCtx.lineWidth = isRed ? 4 : 3;
        vuCtx.beginPath();
        vuCtx.moveTo(x1, y1);
        vuCtx.lineTo(x2, y2);
        vuCtx.stroke();

        const tx = cx + Math.cos(rad) * (rScale - 22);
        const ty = cy + Math.sin(rad) * (rScale - 22);
        vuCtx.fillStyle = isRed ? '#a61212' : '#0c0a14';
        vuCtx.fillText(txt, tx, ty);
      });

      vuCtx.font = '900 28px serif';
      vuCtx.fillStyle = '#0c0a14';
      vuCtx.fillText('VU', cx, 155);

      vuCtx.font = 'bold 13px sans-serif';
      vuCtx.fillStyle = '#3a2e10';
      vuCtx.fillText(label, cx, 185);

      // Bouncing needle with soft drop shadow
      const nRad = -Math.PI * 0.5 + angle;
      const nLen = 205;

      vuCtx.strokeStyle = 'rgba(60, 35, 10, 0.35)';
      vuCtx.lineWidth = 5;
      vuCtx.beginPath();
      vuCtx.moveTo(cx + 4, cy + 4);
      vuCtx.lineTo(cx + Math.cos(nRad) * nLen + 4, cy + Math.sin(nRad) * nLen + 4);
      vuCtx.stroke();

      vuCtx.strokeStyle = '#08060d';
      vuCtx.lineWidth = 4;
      vuCtx.beginPath();
      vuCtx.moveTo(cx, cy);
      vuCtx.lineTo(cx + Math.cos(nRad) * nLen, cy + Math.sin(nRad) * nLen);
      vuCtx.stroke();

      vuCtx.fillStyle = '#0c0a14';
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, 18, 0, Math.PI * 2);
      vuCtx.fill();
      vuCtx.fillStyle = '#9e96aa';
      vuCtx.beginPath();
      vuCtx.arc(cx, cy, 6, 0, Math.PI * 2);
      vuCtx.fill();
    });
    vuTex.needsUpdate = true;

    // C. Pump brass horns dynamically on beat transients
    brassHorns.forEach(({ hGroup, baseScale }) => {
      const pump = baseScale * (1.0 + beatPulse * 0.08 + bass * 0.06);
      hGroup.scale.setScalar(pump);
    });
  }

  return {
    soundRigGroup,
    leftWingTower,
    rightWingTower,
    wooferCones,
    platters: turntablePlatters,
    updateStageDisplays
  };
}

// ============================================================================
// 5. BLOCK-PARTY ARENA BACKDROP: BANNERS, BARRICADES, CABLES & STRING LIGHTS
// ============================================================================
function createBattleBannerTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#1c1836';
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = '#ff3898';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 236);

  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 468, 212);

  ctx.font = '900 74px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('BOOMBOX', 256, 110);
  ctx.fillStyle = '#ff6b9d';
  ctx.fillText('BATTLE', 256, 192);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * High-Resolution 2048x2048 Weathered Asphalt Arena Texture
 * Regulation streetball court markings (yellow basketball key, free-throw circle arc,
 * 3-point arc, white battle cypher ring), tire skids, tar cracks, and authentic graffiti throw-ups.
 */
export function createWeatheredAsphaltArenaTexture() {
  return createHighDetailCourtAsphaltTexture();
}

/**
 * Galvanized Steel Bike-Rack Barricade Unit
 * Replaces solid dark slabs with authentic open tubular steel perimeter barriers.
 */
export function createSteelBarricadeUnit() {
  const bGroup = new THREE.Group();

  const frameColor = 0x8a92a6;
  const framePipeRadius = 0.025;

  // Top Rail
  const topPipe = createHiFiMesh(new THREE.CylinderGeometry(framePipeRadius, framePipeRadius, 1.60, 8), frameColor, 0.04);
  topPipe.rotation.z = Math.PI / 2;
  topPipe.position.y = 0.96;
  bGroup.add(topPipe);

  // Bottom Rail
  const botPipe = createHiFiMesh(new THREE.CylinderGeometry(framePipeRadius, framePipeRadius, 1.60, 8), frameColor, 0.04);
  botPipe.rotation.z = Math.PI / 2;
  botPipe.position.y = 0.14;
  bGroup.add(botPipe);

  // Side Vertical Legs
  [-0.80, 0.80].forEach((lx) => {
    const leg = createHiFiMesh(new THREE.CylinderGeometry(framePipeRadius, framePipeRadius, 0.96, 8), frameColor, 0.04);
    leg.position.set(lx, 0.48, 0);
    bGroup.add(leg);

    // Flat Bridge Foot on Floor
    const foot = createHiFiMesh(new THREE.BoxGeometry(0.08, 0.022, 0.48), 0x5a6274, 0.04);
    foot.position.set(lx, 0.011, 0);
    bGroup.add(foot);
  });

  // Vertical Internal Pickets (7 tubular spokes)
  for (let p = 1; p <= 7; p++) {
    const px = -0.80 + p * (1.60 / 8);
    const picket = createHiFiMesh(new THREE.CylinderGeometry(0.011, 0.011, 0.80, 6), frameColor, 0.03);
    picket.position.set(px, 0.55, 0);
    bGroup.add(picket);
  }

  return bGroup;
}

/**
 * Heavy-Duty 3D Black Stage Power Feeder Cables with Yellow Electrical Hazard Tape Wraps
 * Elevated to y = 0.042m with heavy rubber bridge ramps (Component 7).
 */
export function buildClampedPowerCables(scene) {
  const cableGroup = new THREE.Group();

  // Heavy-duty multi-core stage feeder bundles (radius = 0.046m, dark rubber)
  const cablePaths = [
    // Feeder Bundle 1: Curves from stage truck distro out toward West warehouse
    [
      new THREE.Vector3(1.8, 0.042, -4.2),
      new THREE.Vector3(-0.4, 0.042, -3.2),
      new THREE.Vector3(-2.6, 0.042, -1.8),
      new THREE.Vector3(-4.8, 0.042, 0.2),
      new THREE.Vector3(-6.8, 0.042, 2.4),
      new THREE.Vector3(-8.2, 0.042, 3.8)
    ],
    // Feeder Bundle 2: Curves across midcourt toward South entrance
    [
      new THREE.Vector3(1.4, 0.042, -4.0),
      new THREE.Vector3(0.2, 0.042, -2.6),
      new THREE.Vector3(-1.2, 0.042, -0.6),
      new THREE.Vector3(-2.4, 0.042, 1.8),
      new THREE.Vector3(-3.2, 0.042, 4.4),
      new THREE.Vector3(-3.6, 0.042, 7.2)
    ],
    // Feeder Bundle 3: Curves toward East viaduct
    [
      new THREE.Vector3(4.2, 0.042, -4.2),
      new THREE.Vector3(5.6, 0.042, -2.8),
      new THREE.Vector3(6.8, 0.042, -1.0),
      new THREE.Vector3(7.8, 0.042, 1.4),
      new THREE.Vector3(8.6, 0.042, 3.6)
    ]
  ];

  // Subtle muted-amber gaffer-tape bands (0xb88828) blending with weathered asphalt floor
  const tapeGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.065, 12);
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xb88828 });

  cablePaths.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.045, 10, false);
    const cableMesh = createHiFiMesh(tubeGeo, 0x141418, 0.03);
    cableMesh.name = 'floorCable';
    cableGroup.add(cableMesh);

    // Subtle muted-amber gaffer-tape wraps spaced every ~1.6m along cable
    const totalLength = curve.getLength();
    const numWraps = Math.floor(totalLength / 1.6);
    for (let w = 1; w <= numWraps; w++) {
      const u = (w * 1.6) / totalLength;
      if (u >= 0.96) continue;
      const pt = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);

      const tape = new THREE.Mesh(tapeGeo, tapeMat);
      tape.name = 'floorTape';
      tape.position.copy(pt);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      tape.quaternion.copy(quat);
      cableGroup.add(tape);
    }
  });

  // Sleek, Low-Profile Dark-Charcoal Rubber Stage Conduits / Crossovers (0x1a1c24 / 0x16161a)
  // Replaces high-contrast yellow hazard boxes to prevent clashing with cypher ring lines
  const rampSpecs = [
    { pos: [-1.8, 0.020, -2.1], rotY: 0.55 },
    { pos: [-4.2, 0.020, -0.1], rotY: 0.65 },
    { pos: [-6.2, 0.020, 2.1], rotY: 0.72 },
    { pos: [5.8, 0.020, -2.4], rotY: -0.52 },
    { pos: [7.2, 0.020, 0.2], rotY: -0.42 }
  ];

  rampSpecs.forEach(({ pos, rotY }) => {
    const rampGroup = new THREE.Group();
    rampGroup.position.set(...pos);
    rampGroup.rotation.y = rotY;

    // Sleek low-profile sloped dark-charcoal rubber crossover base (0x16161a)
    const baseRamp = createHiFiMesh(new THREE.BoxGeometry(0.44, 0.038, 0.92), 0x16161a, 0.025);
    baseRamp.position.y = 0.019;
    rampGroup.add(baseRamp);

    // Dark-charcoal rubber textured center tread lid (0x1a1c24)
    const conduitLid = createHiFiMesh(new THREE.BoxGeometry(0.32, 0.008, 0.86), 0x1a1c24, 0.02);
    conduitLid.position.y = 0.040;
    rampGroup.add(conduitLid);

    // Low-profile molded anti-slip tread grooves across rubber conduit
    for (let s = -0.36; s <= 0.36; s += 0.12) {
      const rib = new THREE.Mesh(
        new THREE.PlaneGeometry(0.022, 0.28),
        new THREE.MeshBasicMaterial({ color: 0x111216 })
      );
      rib.rotation.x = -Math.PI / 2;
      rib.position.set(0, 0.046, s);
      rampGroup.add(rib);
    }

    // Small, subtle muted-amber safety edge tabs (0x9e7220) blending with stage floor
    [-0.41, 0.41].forEach((sz) => {
      const edgeMarker = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.018),
        new THREE.MeshBasicMaterial({ color: 0x9e7220 })
      );
      edgeMarker.rotation.x = -Math.PI / 2;
      edgeMarker.position.set(0, 0.042, sz);
      rampGroup.add(edgeMarker);
    });

    cableGroup.add(rampGroup);
  });

  scene.add(cableGroup);
  return cableGroup;
}

/**
 * Left Two-Story Industrial Building with Second-Floor Spectator Balcony
 * Replaces bare box with brick warehouse facade, roll-up door, glowing amber windows,
 * cantilevered steel balcony deck, industrial pipe railings, and VIP spectators.
 */
export function buildIndustrialBuilding(scene) {
  const building = new THREE.Group();
  building.position.set(-9.8, 0, -2.6);
  building.rotation.y = 1.15; // Angled facing southeast into arena courtyard and Orbit View

  const brickTex = createBrickWarehouseTexture();

  // 1. Main Two-Story Warehouse Facade (11.2m x 8.8m x 2.2m) with Running-Bond Brickwork
  // Thin depth 2.2m prevents back-wall camera orbit occlusion at X = -13.5
  const mainFacade = createHiFiMesh(new THREE.BoxGeometry(11.2, 8.8, 2.2), 0xffffff, 0.038, brickTex, 0x28140e, { creviceAO: true });
  mainFacade.position.set(0, 4.4, 1.2);
  building.add(mainFacade);

  // Roof Concrete Coping Parapet with Weathered Stone Trim
  const roofParapet = createHiFiMesh(new THREE.BoxGeometry(11.5, 0.42, 2.4), 0x555866, 0.04);
  roofParapet.position.set(0, 8.8, 1.2);
  building.add(roofParapet);

  // Roof Bitumen & Pea-Gravel Deck Membrane (Eliminates raw polygon in NW orbit view!)
  const roofDeck = new THREE.Mesh(
    new THREE.PlaneGeometry(11.2, 4.6),
    new THREE.MeshBasicMaterial({ map: createRoofGravelTexture() })
  );
  roofDeck.rotation.x = -Math.PI / 2;
  roofDeck.position.set(0, 9.02, 0);
  building.add(roofDeck);

  // Commercial Rooftop HVAC Condenser Chiller Unit
  const acUnitGroup = new THREE.Group();
  acUnitGroup.position.set(-2.2, 9.02, -0.6);

  const acBody = createHiFiMesh(new THREE.BoxGeometry(2.4, 1.35, 1.5), 0x586070, 0.03);
  acBody.position.y = 0.68;
  acUnitGroup.add(acBody);

  [-0.65, 0.65].forEach((fx) => {
    const fanCowl = createHiFiMesh(new THREE.CylinderGeometry(0.48, 0.52, 0.16, 16), 0x282c36, 0.025);
    fanCowl.position.set(fx, 1.42, 0);
    acUnitGroup.add(fanCowl);

    const fanGrille = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 16),
      new THREE.MeshBasicMaterial({ color: 0x14161c, side: THREE.DoubleSide })
    );
    fanGrille.rotation.x = -Math.PI / 2;
    fanGrille.position.set(fx, 1.51, 0);
    acUnitGroup.add(fanGrille);
  });

  const acPipe = createHiFiMesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), 0x8a92a2, 0.02);
  acPipe.rotation.z = Math.PI / 2;
  acPipe.position.set(0.6, 0.1, 0.6);
  acUnitGroup.add(acPipe);

  building.add(acUnitGroup);

  // Rooftop Stair Bulkhead / Access Doghouse
  const doghouse = createHiFiMesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), 0xffffff, 0.035, brickTex, 0x28140e);
  doghouse.position.set(2.8, 9.82, 0.2);
  building.add(doghouse);

  const doghouseRoof = createHiFiMesh(new THREE.BoxGeometry(1.95, 0.14, 1.95), 0x424652, 0.03);
  doghouseRoof.position.set(2.8, 10.68, 0.2);
  building.add(doghouseRoof);

  const roofDoor = createHiFiMesh(new THREE.BoxGeometry(0.85, 1.35, 0.06), 0x222634, 0.02);
  roofDoor.position.set(2.8, 9.75, 1.12);
  building.add(roofDoor);

  // Roof Vent Gooseneck Exhaust Pipe
  const ventPipe = createHiFiMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), 0x6e7584, 0.02);
  ventPipe.position.set(0.8, 9.45, -1.2);
  building.add(ventPipe);

  const ventCap = createHiFiMesh(new THREE.TorusGeometry(0.12, 0.06, 8, 12, Math.PI), 0x6e7584, 0.02);
  ventCap.position.set(0.8, 9.88, -1.2);
  ventCap.rotation.z = Math.PI / 2;
  building.add(ventCap);

  // 2. Far-Left Industrial Waste Dumpster Container (Component 1/6)
  const dumpster = createHiFiMesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), 0x243e2e, 0.035, null, 0x000000, { creviceAO: true });
  dumpster.position.set(-4.5, 0.55, 2.75);
  building.add(dumpster);
  const dumpsterLid = createHiFiMesh(new THREE.BoxGeometry(1.65, 0.12, 1.25), 0x18241c, 0.03);
  dumpsterLid.position.set(-4.5, 1.14, 2.75);
  building.add(dumpsterLid);

  // Static ground contact shadow beneath dumpster
  const dumpsterShadow = createContactShadowDecal(1.9, 1.5, 0.72);
  dumpsterShadow.position.set(-4.5, 0.005, 2.75);
  building.add(dumpsterShadow);

  // 3. Vibrant Wildstyle Street-Art Aerosol Graffiti Mural ("REVENGE" / Urban Spray Tags)
  const muralTex = createStreetArtMuralTexture();
  const muralPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.2),
    new THREE.MeshBasicMaterial({ map: muralTex, transparent: true, side: THREE.DoubleSide })
  );
  muralPlane.position.set(-2.6, 1.75, 2.33);
  building.add(muralPlane);

  // 4. Ground Floor Corrugated Roll-Up Shutter Garage Door
  const shutterTex = createCorrugatedShutterTexture();
  const rollUpDoor = createHiFiMesh(new THREE.BoxGeometry(3.2, 3.2, 0.16), 0xffffff, 0.04, shutterTex, 0x181a24);
  rollUpDoor.position.set(0.4, 1.6, 2.32);
  building.add(rollUpDoor);

  // Overhead Roller Housing Drum Box
  const rollerDrum = createHiFiMesh(new THREE.BoxGeometry(3.5, 0.45, 0.42), 0x222634, 0.035);
  rollerDrum.position.set(0.4, 3.35, 2.42);
  building.add(rollerDrum);

  // Twin Protective Steel Safety Bollards (Bright Hazard Yellow with Black Collars)
  [-1.4, 2.2].forEach((bx) => {
    const bollard = createHiFiMesh(new THREE.CylinderGeometry(0.09, 0.09, 1.02, 12), 0xf5c211, 0.03);
    bollard.position.set(bx, 0.51, 2.65);
    building.add(bollard);

    const bCap = createHiFiMesh(new THREE.SphereGeometry(0.09, 10, 8), 0xf5c211, 0.02);
    bCap.position.set(bx, 1.02, 2.65);
    building.add(bCap);

    const bBase = createHiFiMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), 0x181a22, 0.02);
    bBase.position.set(bx, 0.06, 2.65);
    building.add(bBase);
  });

  // 5. Ground Floor Service Door
  const serviceDoor = createHiFiMesh(new THREE.BoxGeometry(1.2, 2.4, 0.12), 0x1e3a32, 0.03);
  serviceDoor.position.set(3.0, 1.2, 2.32);
  building.add(serviceDoor);

  // Overhead Hooded Service Lamp Fixture
  const lampHood = createHiFiMesh(new THREE.BoxGeometry(0.42, 0.16, 0.32), 0x222634, 0.02);
  lampHood.position.set(3.0, 2.55, 2.48);
  building.add(lampHood);

  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  lampBulb.position.set(3.0, 2.48, 2.48);
  building.add(lampBulb);

  // Industrial Vertical Drain Downspout Pipe with Elbow Bends along Corner
  const downspout = createHiFiMesh(new THREE.CylinderGeometry(0.045, 0.045, 8.8, 10), 0x383e4e, 0.03);
  downspout.position.set(5.4, 4.4, 2.36);
  building.add(downspout);

  const downspoutElbowTop = createHiFiMesh(new THREE.TorusGeometry(0.12, 0.045, 8, 12, Math.PI / 2), 0x383e4e, 0.02);
  downspoutElbowTop.position.set(5.28, 8.7, 2.36);
  downspoutElbowTop.rotation.y = Math.PI;
  building.add(downspoutElbowTop);

  const downspoutElbowBot = createHiFiMesh(new THREE.TorusGeometry(0.12, 0.045, 8, 12, Math.PI / 2), 0x383e4e, 0.02);
  downspoutElbowBot.position.set(5.28, 0.12, 2.36);
  building.add(downspoutElbowBot);

  // 6. Eight Second-Floor Multi-Pane Industrial Loft Windows with Incandescent Amber Glow
  const loftWinTex = createIndustrialLoftWindowTexture();
  const windowCoords = [
    // Lower tier
    { x: -3.8, y: 5.3 },
    { x: -1.8, y: 5.3 },
    { x: 0.8,  y: 5.3 },
    { x: 3.2,  y: 5.3 },
    // Upper tier
    { x: -3.8, y: 7.3 },
    { x: -1.8, y: 7.3 },
    { x: 0.8,  y: 7.3 },
    { x: 3.2,  y: 7.3 }
  ];

  windowCoords.forEach(({ x, y }) => {
    // Glass Pane Plane with glowing incandescent loft texture
    const winPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.62),
      new THREE.MeshBasicMaterial({ map: loftWinTex })
    );
    winPlane.position.set(x, y, 2.33);
    building.add(winPlane);

    // Dark Iron Window Casing (Perimeter borders so glass is completely unoccluded)
    const topBar = createHiFiMesh(new THREE.BoxGeometry(1.65, 0.08, 0.08), 0x141620, 0.03);
    topBar.position.set(x, y + 0.84, 2.34);
    building.add(topBar);

    const botBar = createHiFiMesh(new THREE.BoxGeometry(1.65, 0.08, 0.08), 0x141620, 0.03);
    botBar.position.set(x, y - 0.84, 2.34);
    building.add(botBar);

    const leftBar = createHiFiMesh(new THREE.BoxGeometry(0.08, 1.68, 0.08), 0x141620, 0.03);
    leftBar.position.set(x - 0.78, y, 2.34);
    building.add(leftBar);

    const rightBar = createHiFiMesh(new THREE.BoxGeometry(0.08, 1.68, 0.08), 0x141620, 0.03);
    rightBar.position.set(x + 0.78, y, 2.34);
    building.add(rightBar);

    // Extruded Weathered Stone Window Sill Underneath
    const stoneSill = createHiFiMesh(new THREE.BoxGeometry(1.82, 0.14, 0.24), 0x78747f, 0.03);
    stoneSill.position.set(x, y - 0.94, 2.38);
    building.add(stoneSill);

    // Dark Iron Lintel Header
    const lintel = createHiFiMesh(new THREE.BoxGeometry(1.78, 0.12, 0.16), 0x222634, 0.025);
    lintel.position.set(x, y + 0.94, 2.36);
    building.add(lintel);
  });

  // 7. Second-Floor Cantilevered Steel VIP Balcony Deck & Industrial Pipe Railings
  // Cantilevered Steel I-Beams with 45° Diagonal Support Cross-Braces
  [-0.6, 0.8, 2.2, 3.6].forEach((bx) => {
    const beam = createHiFiMesh(new THREE.BoxGeometry(0.18, 0.28, 2.3), 0x2e354a, 0.04);
    beam.position.set(bx, 3.75, 3.1);
    building.add(beam);

    const brace = createHiFiMesh(new THREE.BoxGeometry(0.12, 0.12, 1.8), 0x242a3c, 0.03);
    brace.position.set(bx, 2.9, 2.8);
    brace.rotation.x = -Math.PI / 4;
    building.add(brace);
  });

  const balconyDeck = createHiFiMesh(new THREE.BoxGeometry(4.8, 0.18, 2.05), 0x1e2232, 0.04);
  balconyDeck.position.set(1.5, 3.90, 3.2);
  building.add(balconyDeck);

  const railGroup = new THREE.Group();
  railGroup.position.set(1.5, 3.98, 3.2);

  // Top Rail & Mid Rail
  const topRail = createHiFiMesh(new THREE.CylinderGeometry(0.038, 0.038, 4.8, 10), 0x68728a, 0.04);
  topRail.rotation.z = Math.PI / 2;
  topRail.position.set(0, 1.05, 1.0);
  railGroup.add(topRail);

  const midRail = createHiFiMesh(new THREE.CylinderGeometry(0.025, 0.025, 4.8, 8), 0x525c72, 0.03);
  midRail.rotation.z = Math.PI / 2;
  midRail.position.set(0, 0.52, 1.0);
  railGroup.add(midRail);

  // Railing Upright Posts
  [-2.3, -1.15, 0, 1.15, 2.3].forEach((px) => {
    const post = createHiFiMesh(new THREE.CylinderGeometry(0.032, 0.032, 1.05, 8), 0x424a60, 0.04);
    post.position.set(px, 0.52, 1.0);
    railGroup.add(post);
  });

  // End Return Rails
  [-2.3, 2.3].forEach((ex) => {
    const endTop = createHiFiMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.95, 8), 0x68728a, 0.03);
    endTop.rotation.x = Math.PI / 2;
    endTop.position.set(ex, 1.05, 0);
    railGroup.add(endTop);
  });

  building.add(railGroup);

  // 8. VIP Balcony Spectators Leaning on the Railing (7 Varied Animated Characters)
  const spectatorColors = [
    { shirt: 0x9e3328, pants: 0x22242a, skin: 0xd89c74 }, // Terracotta Crimson
    { shirt: 0x3b4d66, pants: 0x2d3a4d, skin: 0x8d5534 }, // Slate Denim
    { shirt: 0xd49b35, pants: 0x22242a, skin: 0xf0c8a0 }, // Warm Mustard
    { shirt: 0x4a5d3f, pants: 0x283226, skin: 0xa86c48 }, // Olive Drab
    { shirt: 0xc26a2b, pants: 0x22242a, skin: 0xe0b088 }, // Burnt Ochre
    { shirt: 0xe8e2d4, pants: 0x3b4d66, skin: 0x5c3826 }, // Off-White / Cream
    { shirt: 0x22242a, pants: 0x342a22, skin: 0x8d5534 }  // Deep Charcoal
  ];

  const balconySpectators = [-0.6, 0.1, 0.8, 1.5, 2.2, 2.9, 3.5].map((bx, idx) => {
    const col = spectatorColors[idx % spectatorColors.length];
    const spec = buildSpectatorModel(col.shirt, col.pants, col.skin, idx);
    spec.root.scale.setScalar(0.82);
    spec.root.position.set(bx, 3.98, 3.75);
    spec.root.rotation.y = 0.05 * (idx - 3);
    spec.torso.rotation.x = 0.18;
    spec.leftArm.rotation.set(-0.85, 0, -0.18);
    spec.rightArm.rotation.set(-0.95 - (idx % 2) * 0.45, 0, 0.18);
    if (spec.leftElbow) spec.leftElbow.rotation.set(-0.75, 0, 0);
    if (spec.rightElbow) spec.rightElbow.rotation.set(-0.65, 0, 0);
    building.add(spec.root);
    return spec;
  });

  scene.add(building);
  return { building, balconySpectators };
}

// ----------------------------------------------------------------------------
// EAST ARCHITECTURE: ELEVATED SUBWAY VIADUCT ARCHES & OVERHEAD RAILROAD
// ----------------------------------------------------------------------------
let _bodegaShopfrontTex = null;
export function createBodegaShopfrontTexture() {
  if (_bodegaShopfrontTex) return _bodegaShopfrontTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');

  // Warm glowing interior gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#ffe89c'); // Warm ceiling fluorescent glow
  grad.addColorStop(0.2, '#ffbe42');
  grad.addColorStop(0.6, '#ea7818');
  grad.addColorStop(1.0, '#3a1a08'); // Lower floor dark amber
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Store shelving display rows
  const shelfY = [160, 260, 360, 440];
  shelfY.forEach((sy, idx) => {
    // Shelf board
    ctx.fillStyle = '#2a1a14';
    ctx.fillRect(20, sy, 472, 12);
    ctx.fillStyle = '#ffcc66';
    ctx.fillRect(20, sy - 2, 472, 2);

    // Products / bottles on shelf
    const numItems = 14;
    for (let i = 0; i < numItems; i++) {
      const ix = 32 + i * 32;
      const ih = 28 + ((i * 7) % 24);
      const iy = sy - ih;
      const hue = (i * 37 + idx * 73) % 360;
      ctx.fillStyle = `hsl(${hue}, 75%, 60%)`;
      ctx.fillRect(ix, iy, 20, ih);
      // Highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(ix + 2, iy + 2, 5, ih - 4);
    }
  });

  // Hanging glowing neon sign in window: "24/7 BODEGA"
  ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
  ctx.fillRect(100, 40, 312, 70);
  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 4;
  ctx.strokeRect(100, 40, 312, 70);

  ctx.font = '900 36px "Chakra Petch", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2a85';
  ctx.shadowColor = '#ff2a85';
  ctx.shadowBlur = 12;
  ctx.fillText('24/7 BODEGA', 256, 88);
  ctx.shadowBlur = 0;

  // Window frame pane dividers / glint reflections
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.moveTo(0, 240);
  ctx.lineTo(512, 240);
  ctx.stroke();

  // Diagonal glass reflection highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(180, 0);
  ctx.lineTo(0, 380);
  ctx.closePath();
  ctx.fill();

  _bodegaShopfrontTex = new THREE.CanvasTexture(c);
  _bodegaShopfrontTex.colorSpace = THREE.SRGBColorSpace;
  return _bodegaShopfrontTex;
}

export function buildEastViaductBuilding(scene) {
  const viaductGroup = new THREE.Group();

  const brickTex = createBrickWarehouseTexture();

  // 1. Curved Brick Subway Viaduct Wrapping Behind the Stage (4 Semicircular Arches)
  // Arch Nodes curving from behind stage North to East
  const archNodes = [
    { pos: [1.6, 0, -8.6],  rotY: -0.12 },
    { pos: [5.2, 0, -7.8],  rotY: -0.32 },
    { pos: [8.6, 0, -5.8],  rotY: -0.58 },
    { pos: [11.0, 0, -1.8], rotY: -0.85 }
  ];

  archNodes.forEach(({ pos, rotY }, idx) => {
    const archGroup = new THREE.Group();
    archGroup.position.set(...pos);
    archGroup.rotation.y = rotY;

    // Massive Brick Pier Columns (Left & Right)
    [-1.85, 1.85].forEach((px) => {
      const pier = createHiFiMesh(new THREE.BoxGeometry(1.2, 4.4, 3.2), 0xffffff, 0.04, brickTex, 0x24120c, { creviceAO: true });
      pier.position.set(px, 2.2, 0);
      archGroup.add(pier);

      // Stone Plinth Base
      const plinth = createHiFiMesh(new THREE.BoxGeometry(1.35, 0.48, 3.35), 0x4a4852, 0.04, null, 0x000000, { creviceAO: true });
      plinth.position.set(px, 0.24, 0);
      archGroup.add(plinth);

      // Stone Impost Cap at Springline
      const impost = createHiFiMesh(new THREE.BoxGeometry(1.35, 0.24, 3.35), 0x6e6a75, 0.035);
      impost.position.set(px, 4.3, 0);
      archGroup.add(impost);
    });

    // Deep Dark Recessed Tunnel Cavity
    const tunnelDark = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 4.2, 2.8),
      new THREE.MeshBasicMaterial({ color: 0x07060c })
    );
    tunnelDark.position.set(0, 2.1, -0.2);
    archGroup.add(tunnelDark);

    // Semicircular Arched Brick Voussoirs (Arch Crown)
    const archRingGeo = new THREE.TorusGeometry(1.65, 0.30, 8, 24, Math.PI);
    const archRing = createHiFiMesh(archRingGeo, 0xffffff, 0.035, brickTex, 0x24120c);
    archRing.position.set(0, 4.3, 1.4);
    archGroup.add(archRing);

    // Prominent Stone Center Keystone
    const keystone = createHiFiMesh(new THREE.BoxGeometry(0.44, 0.54, 0.46), 0x8a7a72, 0.04);
    keystone.position.set(0, 5.95, 1.42);
    archGroup.add(keystone);

    // Upper Spandrel Wall
    const spandrel = createHiFiMesh(new THREE.BoxGeometry(4.8, 1.8, 3.2), 0xffffff, 0.04, brickTex, 0x24120c);
    spandrel.position.set(0, 6.1, 0);
    archGroup.add(spandrel);

    viaductGroup.add(archGroup);
  });

  // 2. Overhead Railway Tracks on Viaduct Deck (y = 7.2m)
  const trackSplinePts = [
    new THREE.Vector3(-4.8, 7.2, -11.5),
    new THREE.Vector3(-1.2, 7.2, -9.2),
    new THREE.Vector3(1.6, 7.2, -8.6),
    new THREE.Vector3(5.2, 7.2, -7.8),
    new THREE.Vector3(8.6, 7.2, -5.8),
    new THREE.Vector3(11.0, 7.2, -1.8),
    new THREE.Vector3(11.8, 7.2, 2.4),
    new THREE.Vector3(12.2, 7.2, 6.2),
    new THREE.Vector3(12.4, 7.2, 9.8),
    new THREE.Vector3(12.5, 7.2, 13.0)
  ];
  const trackCurve = new THREE.CatmullRomCurve3(trackSplinePts);

  // Continuous ballast stone bed along viaduct deck (y = 7.02m)
  const ballastGeo = new THREE.TubeGeometry(trackCurve, 48, 1.45, 4, false);
  const ballastMesh = createHiFiMesh(ballastGeo, 0x2c2a32, 0.02);
  ballastMesh.position.y = -0.15;
  ballastMesh.scale.set(1.0, 0.12, 1.0);
  viaductGroup.add(ballastMesh);

  // Longitudinal Steel I-Beam Track Girders (Inner & Outer)
  [-0.65, 0.65].forEach((offsetDist) => {
    const railOffsetPts = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const pt = trackCurve.getPoint(u);
      const tangent = trackCurve.getTangent(u);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      railOffsetPts.push(pt.clone().addScaledVector(normal, offsetDist));
    }
    const railCurve = new THREE.CatmullRomCurve3(railOffsetPts);

    // Continuous Steel Rail
    const railGeo = new THREE.TubeGeometry(railCurve, 32, 0.038, 8, false);
    const railMesh = createHiFiMesh(railGeo, 0x9ca8bc, 0.025, null, 0x000000, {
      isMetallic: true,
      glintThreshold: 0.85,
      glintIntensity: 1.6
    });
    viaductGroup.add(railMesh);
  });

  // Wooden Railroad Ties / Sleepers spaced every ~0.55m along the curved railway path
  const totalTrackLen = trackCurve.getLength();
  const numTies = Math.floor(totalTrackLen / 0.55);
  const tieGeo = new THREE.BoxGeometry(2.4, 0.16, 0.24);
  const tieColor = 0x3a3028; // Creosote dark wood with subtle warm tone

  for (let t = 0; t <= numTies; t++) {
    const u = t / numTies;
    const pt = trackCurve.getPoint(u);
    const tangent = trackCurve.getTangent(u);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const tieMesh = createHiFiMesh(tieGeo, tieColor, 0.025, null, 0x140e0a);
    tieMesh.position.copy(pt);
    tieMesh.position.y -= 0.10;

    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), normal);
    tieMesh.quaternion.copy(quat);
    viaductGroup.add(tieMesh);
  }

  // Steel Catwalk Handrail along Outer Edge
  const catwalkPts = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const pt = trackCurve.getPoint(u);
    const tangent = trackCurve.getTangent(u);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    catwalkPts.push(pt.clone().addScaledVector(normal, 1.4).add(new THREE.Vector3(0, 0.95, 0)));
  }
  const catwalkCurve = new THREE.CatmullRomCurve3(catwalkPts);
  const catwalkGeo = new THREE.TubeGeometry(catwalkCurve, 24, 0.03, 6, false);
  viaductGroup.add(createHiFiMesh(catwalkGeo, 0x485268, 0.03));

  // 3. Commercial Corner Shopfront Building & Dual Neon Marquees
  const cornerGroup = new THREE.Group();
  cornerGroup.position.set(10.2, 0, 1.8);
  cornerGroup.rotation.y = -0.58;

  // Brick Corner Facade with warm terracotta running-bond brickwork
  const cornerWall = createHiFiMesh(new THREE.BoxGeometry(6.2, 9.4, 4.2), 0xffffff, 0.04, brickTex, 0x24120c, { creviceAO: true });
  cornerWall.position.set(0, 4.7, 0);
  cornerGroup.add(cornerWall);

  // Roof Parapet
  const cornerParapet = createHiFiMesh(new THREE.BoxGeometry(6.5, 0.38, 4.4), 0x555866, 0.04);
  cornerParapet.position.set(0, 9.4, 0);
  cornerGroup.add(cornerParapet);

  // Ground Floor Shopfront Display Window with Warm Golden Interior Glow & Shelving
  const bodegaTex = createBodegaShopfrontTexture();
  const shopWin = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.6),
    new THREE.MeshBasicMaterial({ map: bodegaTex })
  );
  shopWin.position.set(0, 1.6, 2.14);
  cornerGroup.add(shopWin);

  const shopWinGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xffb836, transparent: true, opacity: 0.28 })
  );
  shopWinGlow.position.set(0, 1.6, 2.15);
  cornerGroup.add(shopWinGlow);

  // Open perimeter architectural framing bars (unblocking interior window display)
  const topBar = createHiFiMesh(new THREE.BoxGeometry(3.8, 0.12, 0.12), 0x181a24, 0.03);
  topBar.position.set(0, 2.94, 2.16);
  cornerGroup.add(topBar);

  const botSill = createHiFiMesh(new THREE.BoxGeometry(3.9, 0.16, 0.16), 0x181a24, 0.03);
  botSill.position.set(0, 0.26, 2.16);
  cornerGroup.add(botSill);

  const leftPost = createHiFiMesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), 0x181a24, 0.03);
  leftPost.position.set(-1.84, 1.6, 2.16);
  cornerGroup.add(leftPost);

  const rightPost = createHiFiMesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), 0x181a24, 0.03);
  rightPost.position.set(1.84, 1.6, 2.16);
  cornerGroup.add(rightPost);

  const midMullion = createHiFiMesh(new THREE.BoxGeometry(0.08, 2.8, 0.10), 0x181a24, 0.03);
  midMullion.position.set(0, 1.6, 2.16);
  cornerGroup.add(midMullion);

  const transomBar = createHiFiMesh(new THREE.BoxGeometry(3.8, 0.08, 0.10), 0x181a24, 0.03);
  transomBar.position.set(0, 2.2, 2.16);
  cornerGroup.add(transomBar);

  // Bodega striped fabric awning above display window
  const shopAwning = createHiFiMesh(new THREE.BoxGeometry(3.9, 0.08, 1.1), 0xff2a85, 0.03);
  shopAwning.position.set(0, 3.12, 2.62);
  shopAwning.rotation.x = 0.25;
  cornerGroup.add(shopAwning);

  // Dual Glowing Neon Signs: "BOOMBOX BATTLE" in Cyan & Magenta
  const neonTop = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.72, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x24e5ff })
  );
  neonTop.position.set(0, 5.8, 2.22);
  cornerGroup.add(neonTop);

  const neonTopText = document.createElement('canvas');
  neonTopText.width = 512;
  neonTopText.height = 128;
  const ntCtx = neonTopText.getContext('2d');
  ntCtx.fillStyle = '#061828';
  ntCtx.fillRect(0, 0, 512, 128);
  ntCtx.font = '900 68px "Chakra Petch", Impact, sans-serif';
  ntCtx.textAlign = 'center';
  ntCtx.fillStyle = '#24e5ff';
  ntCtx.fillText('BOOMBOX', 256, 92);
  const ntTex = new THREE.CanvasTexture(neonTopText);
  ntTex.colorSpace = THREE.SRGBColorSpace;
  const ntFace = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.65), new THREE.MeshBasicMaterial({ map: ntTex }));
  ntFace.position.set(0, 5.8, 2.30);
  cornerGroup.add(ntFace);

  const neonBot = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.68, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xff2a85 })
  );
  neonBot.position.set(0, 6.8, 2.22);
  cornerGroup.add(neonBot);

  const neonBotText = document.createElement('canvas');
  neonBotText.width = 512;
  neonBotText.height = 128;
  const nbCtx = neonBotText.getContext('2d');
  nbCtx.fillStyle = '#28061a';
  nbCtx.fillRect(0, 0, 512, 128);
  nbCtx.font = '900 68px "Chakra Petch", Impact, sans-serif';
  nbCtx.textAlign = 'center';
  nbCtx.fillStyle = '#ff2a85';
  nbCtx.fillText('BATTLE', 256, 92);
  const nbTex = new THREE.CanvasTexture(neonBotText);
  nbTex.colorSpace = THREE.SRGBColorSpace;
  const nbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.62), new THREE.MeshBasicMaterial({ map: nbTex }));
  nbFace.position.set(0, 6.8, 2.30);
  cornerGroup.add(nbFace);

  // 4. Stacked Touring Road / Flight Cases on Pavement
  const flightCaseSpecs = [
    { pos: [-1.4, 0.42, 2.8], s: [1.1, 0.85, 0.85], col: 0x181820, txt: 'KRONOS SOUND' },
    { pos: [-1.4, 1.15, 2.8], s: [0.95, 0.62, 0.82], col: 0x161822, txt: 'TOUR RIG #4' },
    { pos: [1.5, 0.52, 2.9],  s: [1.2, 1.05, 0.92], col: 0x221a28, txt: 'FRAGILE / AMP' },
    { pos: [1.5, 1.42, 2.9],  s: [1.05, 0.72, 0.85], col: 0x181820, txt: 'KRONOS VIP' },
    { pos: [0.1, 0.38, 3.4],  s: [0.95, 0.75, 0.75], col: 0x1a202c, txt: 'CABLE TRUNK' }
  ];

  flightCaseSpecs.forEach(({ pos, s, col, txt }) => {
    const fCase = createFlightCase(s[0], s[1], s[2], col, txt);
    fCase.position.set(...pos);
    cornerGroup.add(fCase);

    if (pos[1] < 0.6) {
      const fcShadow = createContactShadowDecal(s[0] * 1.25, s[2] * 1.25, 0.70);
      fcShadow.position.set(pos[0], 0.005, pos[2]);
      cornerGroup.add(fcShadow);
    }
  });

  // 5. Stacked Wooden Shipping Pallets & Cargo Crates
  const pallet1 = createWoodenPallet(1.2, 0.14, 1.0);
  pallet1.position.set(-2.8, 0, 1.6);
  cornerGroup.add(pallet1);

  const pallet2 = createWoodenPallet(1.2, 0.14, 1.0);
  pallet2.position.set(-2.8, 0.14, 1.6);
  pallet2.rotation.y = 0.08;
  cornerGroup.add(pallet2);

  const crate1 = createWoodenCrate(0.85);
  crate1.position.set(-2.8, 0.28, 1.6);
  cornerGroup.add(crate1);

  const crate2 = createWoodenCrate(0.72);
  crate2.position.set(-3.9, 0, 1.8);
  crate2.rotation.y = 0.35;
  cornerGroup.add(crate2);

  viaductGroup.add(cornerGroup);

  scene.add(viaductGroup);
  return viaductGroup;
}

// ----------------------------------------------------------------------------
// SOUTH ARCHITECTURE: STEEL TRUSS ENTRANCE ARCH & SOUND-CREW VAN WITH HEADLIGHTS
// ----------------------------------------------------------------------------
export function buildSouthEntranceAndVan(scene) {
  const group = new THREE.Group();
  group.position.set(0, 0, 11.4);

  // 1. Steel Truss Entrance Arch ("CYPHER ARENA")
  const archPillarL = createHiFiMesh(new THREE.BoxGeometry(0.55, 6.4, 0.55), 0x3a3f55, 0.04, null, 0x000000, { creviceAO: true });
  archPillarL.position.set(-4.2, 3.2, 0);
  group.add(archPillarL);

  const archPillarR = createHiFiMesh(new THREE.BoxGeometry(0.55, 6.4, 0.55), 0x3a3f55, 0.04, null, 0x000000, { creviceAO: true });
  archPillarR.position.set(4.2, 3.2, 0);
  group.add(archPillarR);

  const archTop = createHiFiMesh(new THREE.BoxGeometry(9.0, 0.85, 0.65), 0x3a3f55, 0.04);
  archTop.position.set(0, 6.1, 0);
  group.add(archTop);

  // Lighted Arch Marquee Banner ("CYPHER ARENA")
  const marquee = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 0.95, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffb81c })
  );
  marquee.position.set(0, 6.1, 0.38);
  group.add(marquee);

  // Concert Floodlight Rigs mounted on arch shining into the ring
  [-2.6, 2.6].forEach((fx) => {
    const floodlightHousing = createHiFiMesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), 0x141620, 0.04);
    floodlightHousing.position.set(fx, 5.4, 0.35);
    floodlightHousing.rotation.x = 0.35;
    group.add(floodlightHousing);

    const floodLens = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfffae0 })
    );
    floodLens.position.set(fx, 5.35, 0.64);
    floodLens.rotation.x = -0.35;
    group.add(floodLens);

    // Warm Concert Floodlight Rig illuminating South entrance & van
    const archFlood = new THREE.PointLight(0xfffae0, 1.8, 16.0);
    archFlood.position.set(fx, 5.2, 0.8);
    archFlood.castShadow = false;
    group.add(archFlood);
  });

  // 2. Customized Sound-Crew Ambulance / Sound-Van Repositioned to South-West
  const vanGroup = new THREE.Group();
  vanGroup.position.set(-7.5, 0, -6.9); // World x = -7.5m, z = 4.5m
  vanGroup.rotation.y = 0.45; // Angled facing inward into the alley / street

  // Van Chassis & Body with Ambulance Decals & Emergency Texturing
  const ambulanceTex = createAmbulanceSideTexture();
  const vanGrilleTex = createVanGrilleTexture();

  const vanBody = createHiFiMesh(new THREE.BoxGeometry(2.3, 2.1, 4.6), 0xffffff, 0.04, ambulanceTex, 0x141822);
  vanBody.position.y = 1.35;
  vanGroup.add(vanBody);

  const vanCab = createHiFiMesh(new THREE.BoxGeometry(2.25, 1.6, 1.8), 0xe2e6f0, 0.04);
  vanCab.position.set(0, 1.15, 2.3);
  vanGroup.add(vanCab);

  // Front Radiator Grille
  const grilleMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.65, 0.65),
    new THREE.MeshBasicMaterial({ map: vanGrilleTex })
  );
  grilleMesh.position.set(0, 0.85, 3.22);
  vanGroup.add(grilleMesh);

  // Heavy-Duty Front Bumper
  const bumper = createHiFiMesh(new THREE.BoxGeometry(2.35, 0.32, 0.28), 0x282d3c, 0.03);
  bumper.position.set(0, 0.42, 3.30);
  vanGroup.add(bumper);

  // Flashing Amber Emergency Lightbar atop Cab Roof
  const lightbarRack = createHiFiMesh(new THREE.BoxGeometry(1.85, 0.08, 0.28), 0x222632, 0.02);
  lightbarRack.position.set(0, 2.0, 2.3);
  vanGroup.add(lightbarRack);

  [-0.72, -0.24, 0.24, 0.72].forEach((lx) => {
    const dome = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    dome.position.set(lx, 2.12, 2.3);
    vanGroup.add(dome);

    const cap = createHiFiMesh(new THREE.CylinderGeometry(0.08, 0.12, 0.03, 10), 0xdce2ec, 0.015);
    cap.position.set(lx, 2.21, 2.3);
    vanGroup.add(cap);
  });

  // Dual Side Mirrors
  [-1.24, 1.24].forEach((mx) => {
    const mStem = createHiFiMesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), 0x141620, 0.02);
    mStem.position.set(mx, 1.55, 2.65);
    vanGroup.add(mStem);

    const mHead = createHiFiMesh(new THREE.BoxGeometry(0.06, 0.32, 0.18), 0x181a24, 0.02);
    mHead.position.set(mx + (mx > 0 ? 0.08 : -0.08), 1.55, 2.65);
    vanGroup.add(mHead);
  });

  // Front Windshield
  const windshield = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.85),
    new THREE.MeshBasicMaterial({ color: 0x183446 })
  );
  windshield.position.set(0, 1.6, 3.22);
  windshield.rotation.x = -0.22;
  vanGroup.add(windshield);

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshBasicMaterial({ color: 0x121216 });
  [
    [-1.15, 0.42, 1.5],
    [1.15, 0.42, 1.5],
    [-1.15, 0.42, -1.5],
    [1.15, 0.42, -1.5]
  ].forEach(([wx, wy, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, wy, wz);
    vanGroup.add(wheel);
  });

  // Twin Warm Glowing Headlights Shining Forward Into Ring
  // Truncated volumetric headlight beam shining into asphalt ring (Zero ground penetration: minY >= 0.02m)
  [-0.82, 0.82].forEach((hx) => {
    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xd8ba54 })
    );
    headlight.position.set(hx, 0.85, 3.24);
    vanGroup.add(headlight);

    // Note: Step-van primary projection is handled by vanHeadlights in kronos.js to avoid duplicate lights.
    // Truncated volumetric headlight beam shining into asphalt ring (Zero ground penetration: minY >= 0.02m)
    const beamGeo = new THREE.CylinderGeometry(0.16, 0.70, 4.2, 16, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff099,
      transparent: true,
      opacity: 0.055,
      side: THREE.FrontSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(hx, 0.82, 5.35);
    beam.rotation.x = 0.02;
    vanGroup.add(beam);
  });

  // Static ground contact shadow beneath sound-crew van chassis
  const vanShadow = createContactShadowDecal(2.6, 5.2, 0.75);
  vanShadow.position.set(0, 0.005, 0.8);
  vanGroup.add(vanShadow);

  group.add(vanGroup);

  // Perimeter chain-link fences flanking entrance arch & SW alley
  // West South Perimeter: x in [-8.2, -4.2], z = -0.2 (world z = 11.2)
  const fenceSW = createChainLinkFenceSection(4.0, 2.4);
  fenceSW.position.set(-6.2, 0, -0.2);
  group.add(fenceSW);

  // East South Perimeter: x in [4.2, 8.2], z = -0.2 (world z = 11.2)
  const fenceSE = createChainLinkFenceSection(4.0, 2.4);
  fenceSE.position.set(6.2, 0, -0.2);
  group.add(fenceSE);

  // South-West Alley Fence (in front of ambulance, x = -6.2m, z extending from world 4.0m to 10.5m)
  for (let zf = -7.2; zf <= -1.2; zf += 3.0) {
    const alleyFence = createChainLinkFenceSection(3.0, 2.4);
    alleyFence.position.set(-6.2, 0, zf);
    alleyFence.rotation.y = Math.PI / 2;
    group.add(alleyFence);
  }

  // 3. Flanking Brick Apartment Facades with Lit Multi-Pane Windows & Fire Escapes
  const aptBrickTex = createApartmentBrickTexture();
  const loftWinTex = createIndustrialLoftWindowTexture();

  [-8.6, 8.6].forEach((bx, idx) => {
    const aptGroup = new THREE.Group();
    aptGroup.position.set(bx, 0, 2.2); // Setback to world z = 13.6m gives > 0.13m clearance from ORBIT camera sphere
    aptGroup.rotation.y = idx === 0 ? 0.32 : -0.32;

    // A. Main 3-Story Brownstone Brick Facade with creviceAO
    const aptBody = createHiFiMesh(new THREE.BoxGeometry(5.2, 9.8, 3.8), 0xffffff, 0.038, aptBrickTex, 0x22120d, { creviceAO: true });
    aptBody.position.set(0, 4.9, 0);
    aptGroup.add(aptBody);

    // B. Decorative Stone Roof Parapet Coping Crown
    const aptParapet = createHiFiMesh(new THREE.BoxGeometry(5.35, 0.38, 3.95), 0x5a5864, 0.035);
    aptParapet.position.set(0, 9.85, 0);
    aptGroup.add(aptParapet);

    // C. Six Multi-Pane Lit Sash Windows with Incandescent Amber Interior Glow
    const aptWindowCoords = [
      { x: -1.35, y: 2.6 }, { x: 1.35, y: 2.6 },
      { x: -1.35, y: 5.2 }, { x: 1.35, y: 5.2 },
      { x: -1.35, y: 7.8 }, { x: 1.35, y: 7.8 }
    ];

    aptWindowCoords.forEach(({ x, y }) => {
      // Lit window glass plane facing outward towards arena cypher
      const winPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 1.55),
        new THREE.MeshBasicMaterial({ map: loftWinTex, side: THREE.DoubleSide })
      );
      winPlane.position.set(x, y, -1.91);
      winPlane.rotation.y = Math.PI;
      aptGroup.add(winPlane);

      // Extruded weathered stone window sill
      const stoneSill = createHiFiMesh(new THREE.BoxGeometry(1.45, 0.12, 0.22), 0x6e6878, 0.025);
      stoneSill.position.set(x, y - 0.84, -1.95);
      aptGroup.add(stoneSill);

      // Dark masonry lintel header
      const lintel = createHiFiMesh(new THREE.BoxGeometry(1.42, 0.12, 0.16), 0x3a3644, 0.025);
      lintel.position.set(x, y + 0.84, -1.94);
      aptGroup.add(lintel);
    });

    // D. Multi-Tier Front Fire Escape with Railings and Ladders
    const escColX = idx === 0 ? 1.35 : -1.35;
    for (let f = 1; f <= 3; f++) {
      const fy = f * 2.6 - 0.85;

      // Platform Grate
      const platform = createHiFiMesh(new THREE.BoxGeometry(1.8, 0.08, 0.85), 0x181820, 0.025);
      platform.position.set(escColX, fy, -2.33);
      aptGroup.add(platform);

      // Front Safety Railing
      const frontRail = createHiFiMesh(new THREE.BoxGeometry(1.8, 0.65, 0.04), 0x14141a, 0.02);
      frontRail.position.set(escColX, fy + 0.33, -2.75);
      aptGroup.add(frontRail);

      // Side Safety Railings
      [-0.9, 0.9].forEach((sx) => {
        const sideRail = createHiFiMesh(new THREE.BoxGeometry(0.04, 0.65, 0.85), 0x14141a, 0.02);
        sideRail.position.set(escColX + sx, fy + 0.33, -2.33);
        aptGroup.add(sideRail);
      });

      // Connecting Drop Ladder to next tier
      if (f < 3) {
        const ladder = createHiFiMesh(new THREE.BoxGeometry(0.38, 2.5, 0.04), 0x181822, 0.02);
        ladder.position.set(escColX + (idx === 0 ? -0.55 : 0.55), fy + 1.25, -2.76);
        ladder.rotation.z = idx === 0 ? 0.10 : -0.10;
        aptGroup.add(ladder);
      }
    }

    group.add(aptGroup);
  });

  // 4. Staggered Concrete Jersey Barriers along z = 6.2m - 6.8m facing Orbit camera frustum
  // In group space (group is at z = 11.4): z_group = z_world - 11.4
  const staggeredLayout = [
    { x: -3.8, z: 6.2 - 11.4, rotY: -0.92 },
    { x: -2.0, z: 6.6 - 11.4, rotY: -0.82 },
    { x: -0.2, z: 6.3 - 11.4, rotY: -0.72 },
    { x:  1.6, z: 6.7 - 11.4, rotY: -0.62 },
    { x:  3.4, z: 6.4 - 11.4, rotY: -0.52 },
    { x:  5.2, z: 6.8 - 11.4, rotY: -0.42 }
  ];

  staggeredLayout.forEach(({ x, z, rotY }) => {
    const barrier = createJerseyBarrier(2.1, 0.88, 0.58);
    barrier.position.set(x, 0, z);
    barrier.rotation.y = rotY;
    group.add(barrier);

    const bShadow = createContactShadowDecal(2.3, 0.8, 0.65);
    bShadow.position.set(x, 0.005, z);
    bShadow.rotation.y = rotY;
    group.add(bShadow);
  });

  // Angled Flanking Wing Barriers curving into arena flanks
  const wingBarriers = [
    { x: -6.8, z: -2.3, rotY: 0.45 },
    { x: 6.8,  z: -2.3, rotY: -0.45 }
  ];
  wingBarriers.forEach(({ x, z, rotY }) => {
    const barrier = createJerseyBarrier(2.1, 0.88, 0.58);
    barrier.position.set(x, 0, z);
    barrier.rotation.y = rotY;
    group.add(barrier);

    const wShadow = createContactShadowDecal(2.3, 0.8, 0.65);
    wShadow.position.set(x, 0.005, z);
    wShadow.rotation.y = rotY;
    group.add(wShadow);
  });

  // 5. Stacked Touring Flight Cases near South-East and South-West Courtyard Perimeter
  const perimeterCases = [
    // South-East Stack
    { pos: [3.8, 0.42, -2.6], s: [1.1, 0.85, 0.85], col: 0x181820, txt: 'STAGE CREW' },
    { pos: [3.8, 1.15, -2.6], s: [0.95, 0.62, 0.82], col: 0x161822, txt: 'LIGHTING RIG' },
    { pos: [4.9, 0.38, -2.4], s: [1.05, 0.75, 0.80], col: 0x221a28, txt: 'KRONOS BEATS' },
    // South-West Stack (Framing foreground Orbit View)
    { pos: [-4.2, 0.42, -3.2], s: [1.1, 0.85, 0.85], col: 0x141820, txt: 'BASS SUB #2' },
    { pos: [-4.2, 1.15, -3.2], s: [0.95, 0.62, 0.80], col: 0x1c1a24, txt: 'PA MONITORS' },
    { pos: [-3.2, 0.36, -3.4], s: [0.88, 0.72, 0.75], col: 0x182024, txt: 'MIC STANDS' }
  ];
  perimeterCases.forEach(({ pos, s, col, txt }) => {
    const fCase = createFlightCase(s[0], s[1], s[2], col, txt);
    fCase.position.set(...pos);
    group.add(fCase);
  });

  scene.add(group);
  return group;
}

export function buildArenaEnvironment(scene) {
  // 1. Full 360-Degree Starry Midnight Block-Party Sky Dome (Zero Black Void!)
  const starGeo = new THREE.BufferGeometry();
  const starCount = 600;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = 32 + Math.random() * 28;
    starPos[i * 3] = Math.cos(theta) * r;
    starPos[i * 3 + 1] = 4.5 + Math.random() * 28;
    starPos[i * 3 + 2] = Math.sin(theta) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.90 })
  );
  scene.add(stars);

  // 2. Left & Right "BOOMBOX BATTLE" Stage Signs
  const bannerTex = createBattleBannerTexture();
  [
    { pos: [-2.8, 2.25, -5.8], rotY: 0.25 },
    { pos: [7.5, 2.25, -4.8], rotY: -0.35 }
  ].forEach(({ pos, rotY }) => {
    const bMesh = createHiFiMesh(new THREE.BoxGeometry(2.1, 1.05, 0.14), 0x1c1836, 0.04);
    bMesh.position.set(...pos);
    bMesh.rotation.y = rotY;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.98, 0.95),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    face.position.z = 0.09;
    bMesh.add(face);
    scene.add(bMesh);
  });

  // 3. West Architecture: Two-Story Industrial Building with Balcony & VIP Spectators (x < 0)
  buildIndustrialBuilding(scene);

  // 4. East Architecture: Urban Brick Viaduct & Corner Building with Neon Signs & Flight Cases (x > 0)
  buildEastViaductBuilding(scene);

  // 5. South Architecture: Steel Truss Entrance Arch ("CYPHER ARENA") & Sound-Crew Van with Headlights (z > 0)
  buildSouthEntranceAndVan(scene);

  // 6. Full 360-Degree Galvanized Steel Crowd Barricades & Cheering Spectators Around Cypher (r = 6.8m - 7.5m)
  const barricadeAngles = [
    -1.32, -1.06, -0.82, -0.58, -0.32, -0.08, 0.16, 0.40,
    0.68, 0.92, 1.16, 1.40, 1.68, 1.95, 2.22, 2.50
  ];
  const specColors = [
    { shirt: 0xc26a2b, pants: 0x22242a, skin: 0xd89c74 }, // Burnt Ochre
    { shirt: 0x3b4d66, pants: 0x2d3a4d, skin: 0x8d5534 }, // Slate Denim
    { shirt: 0xd49b35, pants: 0x22242a, skin: 0xf0c8a0 }, // Warm Mustard
    { shirt: 0x4a5d3f, pants: 0x283226, skin: 0xa86c48 }, // Olive Drab
    { shirt: 0x9e3328, pants: 0x22242a, skin: 0xe0b088 }, // Terracotta Crimson
    { shirt: 0xe8e2d4, pants: 0x3b4d66, skin: 0x5c3826 }, // Off-White / Cream
    { shirt: 0x22242a, pants: 0x342a22, skin: 0xd89c74 }  // Deep Charcoal
  ];

  barricadeAngles.forEach((ang, idx) => {
    const r = 6.8;
    const bar = createSteelBarricadeUnit();
    bar.position.set(Math.sin(ang) * r, 0, -Math.cos(ang) * r + 0.5);
    bar.lookAt(0, 0, 1.5);
    scene.add(bar);

    // Cheering Crowd Spectator behind South-sector barricades (West & East sectors are populated by animated crowdSpectators in kronos.js)
    if (idx % 2 === 0 && ang > 1.50) {
      const col = specColors[idx % specColors.length];
      const spec = buildSpectatorModel(col.shirt, col.pants, col.skin, idx);
      spec.root.scale.setScalar(0.85);
      const specR = r + 0.65;
      spec.root.position.set(Math.sin(ang) * specR, 0, -Math.cos(ang) * specR + 0.5);
      spec.root.lookAt(0, 0, 1.5);
      spec.torso.rotation.x = 0.12;
      spec.leftArm.rotation.set(-0.75 - (idx % 2) * 0.25, 0, -0.20);
      spec.rightArm.rotation.set(-2.25 - (idx % 3) * 0.15, 0, 0.22);
      if (spec.leftElbow) spec.leftElbow.rotation.set(-0.85, 0, 0);
      if (spec.rightElbow) spec.rightElbow.rotation.set(-0.40, 0, 0);
      scene.add(spec.root);
    }
  });

  // 7. Upgraded Dual-Color Clamped Power Cables (Yellow & Cyan at y = 0.035m)
  buildClampedPowerCables(scene);

  // 8. Overhead Crisscrossing Festival String Lights (West-East & North-South)
  const stringCoords = [
    [new THREE.Vector3(-8.2, 5.4, -2.5), new THREE.Vector3(0, 5.8, -0.5), new THREE.Vector3(8.2, 5.4, 0.5)],
    [new THREE.Vector3(0, 5.8, -4.5), new THREE.Vector3(0, 5.7, 1.5), new THREE.Vector3(0, 5.9, 7.8)]
  ];
  stringCoords.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const wireGeo = new THREE.TubeGeometry(curve, 20, 0.02, 6, false);
    scene.add(new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({ color: 0x09080c })));
    for (let i = 1; i <= 8; i++) {
      const pt = curve.getPoint(i / 9);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 10),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffe566 : 0x52f2ff })
      );
      bulb.position.copy(pt);
      bulb.position.y -= 0.08;
      scene.add(bulb);

      // Hanging triangular block-party festival pennant flags
      const flagGeo = new THREE.ConeGeometry(0.14, 0.30, 3);
      flagGeo.rotateX(Math.PI);
      const flag = new THREE.Mesh(
        flagGeo,
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff2a48 : (i % 3 === 1 ? 0xffd13b : 0x24e5ff) })
      );
      flag.position.copy(pt);
      flag.position.y -= 0.22;
      scene.add(flag);
    }
  });

  // 8B. 4 Urban Cast-Iron Street Lamp Posts with Glowing Warm Amber Lantern Globes
  [
    [-6.5, 0, -4.6],
    [7.4,  0, -3.6],
    [-6.6, 0,  5.8],
    [6.6,  0,  5.8]
  ].forEach(([lx, ly, lz]) => {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(lx, ly, lz);
    scene.add(lampGroup);

    const basePedestal = createHiFiMesh(new THREE.CylinderGeometry(0.18, 0.26, 0.65, 10), 0x1a1d28, 0.04);
    basePedestal.position.y = 0.325;
    lampGroup.add(basePedestal);

    const pole = createHiFiMesh(new THREE.CylinderGeometry(0.06, 0.09, 4.4, 10), 0x222634, 0.035);
    pole.position.y = 2.52;
    lampGroup.add(pole);

    const crossArm = createHiFiMesh(new THREE.BoxGeometry(0.85, 0.08, 0.08), 0x222634, 0.03);
    crossArm.position.y = 4.55;
    lampGroup.add(crossArm);

    [-0.36, 0.36].forEach((gx) => {
      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe478 })
      );
      globe.position.set(gx, 4.72, 0);
      lampGroup.add(globe);
    });
  });

  // 9. Update Arena Floor Mesh with Weathered Asphalt & Graffiti Texture + Baked AO & LightMap
  const asphaltTex = createWeatheredAsphaltArenaTexture();
  const bakedAOTex = createBakedArenaAOMapTexture();
  const bakedLightMapTex = createBakedArenaLightMapTexture();
  scene.traverse((obj) => {
    if (obj.geometry && obj.geometry.type === 'CircleGeometry' && obj.geometry.parameters && obj.geometry.parameters.radius >= 20) {
      if (obj.material) {
        obj.material.map = asphaltTex;
        obj.geometry.setAttribute('uv2', obj.geometry.attributes.uv.clone());
        obj.material.aoMap = bakedAOTex;
        obj.material.aoMapIntensity = 1.0;
        obj.material.lightMap = bakedLightMapTex;
        obj.material.lightMapIntensity = 1.0;
        obj.material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <aomap_fragment>',
            `
            #include <aomap_fragment>
            #ifdef USE_AOMAP
            reflectedLight.directDiffuse *= (ambientOcclusion * 0.65 + 0.35);
            #endif
            `
          );
        };
        obj.receiveShadow = true;
        obj.material.needsUpdate = true;
      }
    }
  });
}

// ============================================================================
// 6. CONCENTRIC FLOOR RHYTHM DIAL (1:1 MATCH WITH TARGET SCREENSHOT)
// ============================================================================
function createFloorDialTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.translate(512, 512);

  const glow = ctx.createRadialGradient(0, 0, 110, 0, 0, 490);
  glow.addColorStop(0.0, 'rgba(36, 229, 255, 0.18)');
  glow.addColorStop(0.42, 'rgba(255, 42, 64, 0.32)');
  glow.addColorStop(0.78, 'rgba(255, 215, 40, 0.38)');
  glow.addColorStop(1.0, 'rgba(255, 180, 0, 0.0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 490, 0, Math.PI * 2);
  ctx.fill();

  // 8 Long Outer Golden Compass Spikes
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = '#ffe042';
    ctx.beginPath();
    ctx.moveTo(410, -10);
    ctx.lineTo(500, 0);
    ctx.lineTo(410, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Outer Glowing Golden Ring (#ffe042)
  ctx.strokeStyle = '#ffe042';
  ctx.lineWidth = 20;
  ctx.shadowColor = '#ffae00';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(0, 0, 400, 0, Math.PI * 2);
  ctx.stroke();

  // 64 Radial Beat Tick Marks inside the Golden Ring
  ctx.shadowBlur = 0;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const isMajor = i % 4 === 0;
    const r0 = isMajor ? 338 : 358;
    const r1 = 384;
    ctx.lineWidth = isMajor ? 10 : 4;
    ctx.strokeStyle = isMajor ? '#ffe866' : '#ff9824';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }

  // Middle Glowing Crimson-Red Ring (#ff2a3c)
  ctx.strokeStyle = '#ff2a3c';
  ctx.lineWidth = 18;
  ctx.shadowColor = '#ff1e38';
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.arc(0, 0, 298, 0, Math.PI * 2);
  ctx.stroke();

  // Inner Glowing Cyan Target Ring (#24e5ff)
  ctx.strokeStyle = '#24e5ff';
  ctx.lineWidth = 16;
  ctx.shadowColor = '#00d8ff';
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(0, 0, 174, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPerfectBadgeCanvas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  function drawBadge(label = 'PERFECT!', color = '#ffe042') {
    ctx.clearRect(0, 0, 512, 256);
    ctx.save();
    ctx.translate(256, 142);

    ctx.fillStyle = color;
    ctx.strokeStyle = '#080608';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, -118);
    ctx.lineTo(26, -78);
    ctx.lineTo(-26, -78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(20, 18, 28, 0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#080608';
    ctx.stroke();

    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '900 58px "Chakra Petch", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#080608';
    ctx.strokeText(label, 0, 4);
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 4);

    ctx.restore();
  }

  drawBadge('PERFECT!', '#ffe042');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, updateBadge: (txt, col) => { drawBadge(txt, col); tex.needsUpdate = true; } };
}

export function buildFloorRhythmDial(scene) {
  const dialGroup = new THREE.Group();
  dialGroup.position.y = 0.025;
  scene.add(dialGroup);

  const dialTex = createFloorDialTexture();
  const basePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.65, 3.65),
    new THREE.MeshBasicMaterial({
      map: dialTex,
      transparent: true,
      opacity: 0.98,
      depthWrite: false
    })
  );
  basePlane.rotation.x = -Math.PI / 2;
  dialGroup.add(basePlane);

  const pulseGeo = new THREE.RingGeometry(0.66, 0.76, 48);
  pulseGeo.rotateX(-Math.PI / 2);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: 0xff3b30,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
  pulseRing.position.y = 0.01;
  dialGroup.add(pulseRing);

  const { tex: badgeTex, updateBadge } = createPerfectBadgeCanvas();
  const badgePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.32, 0.66),
    new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      depthWrite: false
    })
  );
  badgePlane.rotation.x = -Math.PI / 2;
  badgePlane.position.set(0.22, 0.02, 0.08);
  dialGroup.add(badgePlane);

  // 3D Red Directional Threat Chevrons pointing toward active attackers
  const threatChevronGroup = new THREE.Group();
  threatChevronGroup.position.y = 0.03;
  threatChevronGroup.visible = true;
  dialGroup.add(threatChevronGroup);

  const chevronMat = new THREE.MeshBasicMaterial({
    color: 0xff1e38,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });

  // 3 nested chevron arrows at radius ~1.15m, 1.40m, 1.65m pointing outward
  [1.15, 1.40, 1.65].forEach((dist, idx) => {
    const chevShape = new THREE.Shape();
    // V-shaped arrow pointing forward in -Z
    chevShape.moveTo(0, -0.16);
    chevShape.lineTo(0.22, 0.08);
    chevShape.lineTo(0.15, 0.16);
    chevShape.lineTo(0, -0.04);
    chevShape.lineTo(-0.15, 0.16);
    chevShape.lineTo(-0.22, 0.08);
    chevShape.closePath();

    const chevGeo = new THREE.ShapeGeometry(chevShape);
    chevGeo.rotateX(-Math.PI / 2);
    const chevMesh = new THREE.Mesh(chevGeo, chevronMat.clone());
    chevMesh.material.opacity = 0.50 + idx * 0.22;
    chevMesh.position.set(0, 0, -dist);
    threatChevronGroup.add(chevMesh);
  });

  return { dialGroup, basePlane, pulseRing, pulseMat, updateBadge, threatChevronGroup };
}

export function spawnStrikeSmearArc(scene, originPos, isKick = false) {
  const radius = isKick ? 1.45 : 1.10;
  const geo = new THREE.RingGeometry(radius * 0.58, radius, 24, 1, -Math.PI * 0.35, Math.PI * 0.85);
  const mat = new THREE.MeshBasicMaterial({
    color: isKick ? 0xffd15c : 0xff7b29,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(originPos);
  mesh.position.y += isKick ? 1.15 : 1.38;
  mesh.rotation.set(
    isKick ? -0.35 : -1.15,
    (Math.random() - 0.5) * 0.4,
    isKick ? 0.65 : -0.25
  );
  scene.add(mesh);
  return { mesh, life: 0.22 };
}

export function spawn3DImpactBurst(scene, contactPoint, vfxType = 'impact-sparks') {
  const group = new THREE.Group();
  group.position.copy(contactPoint);

  const isRing = vfxType === 'impact-ring';
  const color = isRing ? 0xff4899 : 0xffe066;

  // Expanding shockwave ring
  const ringGeo = new THREE.RingGeometry(0.08, 0.22, 16);
  const ringMat = new THREE.MeshBasicMaterial({
    color: color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  group.add(ringMesh);

  // Directional Spark Diamonds / Shards
  const sparkGeo = new THREE.OctahedronGeometry(0.06, 0);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });

  const sparks = [];
  const sparkCount = isRing ? 12 : 8;
  for (let i = 0; i < sparkCount; i++) {
    const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const speed = 2.4 + Math.random() * 2.2;
    const vel = new THREE.Vector3(
      Math.cos(angle) * speed,
      (Math.random() - 0.2) * 1.8,
      Math.sin(angle) * speed
    );
    const m = new THREE.Mesh(sparkGeo, sparkMat.clone());
    m.scale.set(1.0, 1.8, 1.0);
    group.add(m);
    sparks.push({ mesh: m, vel });
  }

  scene.add(group);

  let life = 0.32;
  const maxLife = 0.32;

  return {
    group,
    update(dt, cameraPos) {
      life -= dt;
      if (life <= 0) return false;

      const progress = 1.0 - (life / maxLife);
      const ringScale = 1.0 + progress * (isRing ? 6.5 : 4.2);
      ringMesh.scale.set(ringScale, ringScale, ringScale);
      ringMesh.material.opacity = Math.max(0, 1.0 - progress * 1.1);

      if (cameraPos) {
        ringMesh.lookAt(cameraPos);
      }

      sparks.forEach(({ mesh, vel }) => {
        mesh.position.addScaledVector(vel, dt);
        vel.multiplyScalar(Math.max(0, 1.0 - dt * 6.0));
        mesh.material.opacity = Math.max(0, 1.0 - progress);
        mesh.rotation.x += dt * 10;
        mesh.rotation.y += dt * 8;
      });

      return true;
    },
    dispose(sceneRef) {
      if (sceneRef) {
        sceneRef.remove(group);
      } else if (scene) {
        scene.remove(group);
      }
      ringGeo.dispose();
      ringMat.dispose();
      sparkGeo.dispose();
      sparks.forEach(({ mesh }) => {
        if (mesh.material) mesh.material.dispose();
      });
    }
  };
}

// ============================================================================
// 7. BACKWARDS COMPATIBILITY EXPORT ALIASES
// ============================================================================
export const createBoomboxStage = buildBoomboxStage;
export const createUrbanArena = buildArenaEnvironment;
export const createArenaGround = createWeatheredAsphaltArenaTexture;
export const createAsphaltFloorTexture = createWeatheredAsphaltArenaTexture;
export const createBossKronosModel = buildKronosBossModel;

