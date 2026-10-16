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
  const metricThickness = thickness <= 0.01 ? thickness : thickness * 0.16;
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
export function createCelMaterial(colorHex, mapTex = null, emissiveHex = 0x000000, options = {}) {
  const isMetallic = typeof options === 'boolean' ? options : !!options.isMetallic;
  const glintThreshold = options.glintThreshold ?? 0.88;
  const glintIntensity = options.glintIntensity ?? (isMetallic ? 1.5 : 0.0);

  const mat = new THREE.MeshToonMaterial({
    color: colorHex,
    gradientMap: toonGradientMap,
    map: mapTex,
    emissive: emissiveHex
  });

  mat.customProgramCacheKey = () => (isMetallic ? 'cel_glint_metallic' : 'cel_matte');

  mat.onBeforeCompile = (shader) => {
    // Inject specular glint uniforms
    shader.uniforms.uGlintIntensity = { value: glintIntensity };
    shader.uniforms.uGlintThreshold = { value: glintThreshold };
    mat.userData.shader = shader;

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
  };

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
  const segsR = 8;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segsY; i++) {
    const t = i / segsY;
    // Taper smoothly from full root to pointed tip
    const profile = t < 0.25
      ? 0.78 + (t / 0.25) * 0.22
      : Math.max(0.02, Math.pow(1.0 - (t - 0.25) / 0.75, 1.15));
    const rx = (width * 0.5) * profile;
    const rz = (thickness * 0.5) * profile;
    const y = t * length;
    const cx = bendX * t * t;
    const cz = bendZ * t * t;

    for (let j = 0; j <= segsR; j++) {
      const u = j / segsR;
      const phi = u * Math.PI * 2;
      // Diamond-faceted anime hair lock cross-section
      const dx = Math.cos(phi);
      const dz = Math.sin(phi);
      positions.push(cx + rx * dx, y, cz + rz * (dz > 0 ? dz * 1.15 : dz * 0.75));
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
//     - Eyes     (y = +0.018) -> py = 397
//     - Eyebrows (y = +0.042) -> py = 299
//     - Hairline (y = +0.062) -> py = 215
// ============================================================================

function createChallengerHeadUVTexture(expression = 'determined') {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Warm fair-tan anime skin base (#ebb690)
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle warm shading under chin (bottom of UV)
  const chinGrad = ctx.createLinearGradient(0, 820, 0, 1024);
  chinGrad.addColorStop(0, 'rgba(204, 143, 104, 0.0)');
  chinGrad.addColorStop(1, 'rgba(186, 122, 84, 0.55)');
  ctx.fillStyle = chinGrad;
  ctx.fillRect(0, 820, 1024, 204);

  // Upper cranium chestnut hair base above eyebrow line (py = 0..225)
  ctx.fillStyle = '#5a321e';
  ctx.fillRect(0, 0, 1024, 225);

  // Back of head / nape hair shadow down to py = 680 on back seam
  drawOnBackSeam(ctx, () => {
    ctx.fillStyle = '#4a2918';
    ctx.fillRect(-230, 0, 460, 680);
  });

  // Painted Forehead Fringe Bang Strands across Upper Forehead (x = 340..684, py = 180..315, stopping cleanly at brow ridge!)
  const bangTips = [
    [355, 315], [405, 290], [452, 318], [492, 302],
    [526, 322], [568, 295], [612, 312], [658, 305]
  ];
  ctx.fillStyle = '#724026';
  ctx.strokeStyle = '#1a0e08';
  ctx.lineWidth = 4.5;
  bangTips.forEach(([tx, ty]) => {
    ctx.beginPath();
    ctx.moveTo(tx - 32, 175);
    ctx.quadraticCurveTo(tx - 8, (175 + ty) * 0.5, tx, ty);
    ctx.quadraticCurveTo(tx + 10, (175 + ty) * 0.5, tx + 30, 175);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // Temple Sideburn Strands in front of ears at x = 256 (Right) and x = 768 (Left)
  [256, 768].forEach((sx) => {
    ctx.fillStyle = '#5a321e';
    ctx.beginPath();
    ctx.moveTo(sx - 48, 200);
    ctx.lineTo(sx + 48, 200);
    ctx.lineTo(sx, 505);
    ctx.closePath();
    ctx.fill();
  });

  // Center Front Facial Features around x = 512 (Front -Z)
  // Eye level: py = 435 (eyebrows at py = 385..405 clearly visible below forehead bangs!)
  // Horizontal eye center at x = 512 ± 116 (nx = ±0.45, natural anime eye spacing!)
  [-1, 1].forEach((dir) => {
    const ex = 512 + dir * 116;
    const ey = 435;

    // Crisp white sclera with sharp angular anime eye silhouette
    ctx.fillStyle = '#f8f9fb';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 52, ey + 7);
    ctx.quadraticCurveTo(ex - dir * 14, ey - 30, ex + dir * 48, ey - 13);
    ctx.quadraticCurveTo(ex + dir * 36, ey + 24, ex - dir * 14, ey + 24);
    ctx.closePath();
    ctx.fill();

    // Warm Chestnut-Amber Iris
    const irisGrad = ctx.createLinearGradient(ex, ey - 24, ex, ey + 24);
    irisGrad.addColorStop(0, '#361b0e');
    irisGrad.addColorStop(0.55, '#7c4220');
    irisGrad.addColorStop(1, '#c87834');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(ex - dir * 4, ey + 1, 25, 23, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark Pupil
    ctx.fillStyle = '#120906';
    ctx.beginPath();
    ctx.arc(ex - dir * 4, ey + 2, 11, 0, Math.PI * 2);
    ctx.fill();

    // Specular Eye Glints
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex - dir * 12, ey - 6, 6.5, 0, Math.PI * 2);
    ctx.arc(ex + dir * 8, ey + 7, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Bold Black Upper Eyelash Line
    ctx.strokeStyle = '#120a08';
    ctx.lineWidth = 10.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 54, ey + 8);
    ctx.quadraticCurveTo(ex - dir * 12, ey - 31, ex + dir * 50, ey - 14);
    ctx.stroke();

    // Lower Eyelid Line
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    ctx.moveTo(ex - dir * 28, ey + 22);
    ctx.quadraticCurveTo(ex + dir * 8, ey + 25, ex + dir * 38, ey + 12);
    ctx.stroke();

    // Thick Determined Chestnut-Black Eyebrow slanting down toward center glabella
    ctx.fillStyle = '#26140b';
    ctx.beginPath();
    ctx.moveTo(ex - dir * 58, ey - 28);
    ctx.quadraticCurveTo(ex - dir * 8, ey - 58, ex + dir * 54, ey - 46);
    ctx.lineTo(ex + dir * 48, ey - 30);
    ctx.quadraticCurveTo(ex - dir * 8, ey - 38, ex - dir * 52, ey - 15);
    ctx.closePath();
    ctx.fill();
  });

  // Brow Furrow Lines at Glabella
  ctx.strokeStyle = '#8c5436';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(494, 378);
  ctx.lineTo(501, 412);
  ctx.moveTo(530, 378);
  ctx.lineTo(523, 412);
  ctx.stroke();

  // Cel-Shaded Anime Nose Shadow Wedge & Nostril Tick (py = 475..605)
  ctx.fillStyle = '#c4865e';
  ctx.beginPath();
  ctx.moveTo(512, 472);
  ctx.lineTo(482, 590);
  ctx.lineTo(512, 608);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#1c100a';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(512, 475);
  ctx.lineTo(519, 588);
  ctx.lineTo(498, 606);
  ctx.stroke();

  // Mouth Expression at py = 748 (y = -0.068m)
  if (expression === 'grin') {
    // View 2 Confident White-Toothed Battle Grin matching reference sheet View 2!
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#160c08';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(436, 718);
    ctx.quadraticCurveTo(512, 732, 588, 710);
    ctx.quadraticCurveTo(566, 782, 512, 786);
    ctx.quadraticCurveTo(458, 782, 436, 718);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle tooth line
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(452, 748);
    ctx.lineTo(572, 744);
    ctx.stroke();
  } else {
    // View 1 & View 3 Determined Athletic Mouth Line with Slight Confident Corner
    ctx.strokeStyle = '#160c08';
    ctx.lineWidth = 7.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(446, 748);
    ctx.quadraticCurveTo(512, 738, 578, 742);
    ctx.stroke();

    // Lower lip cel shadow
    ctx.strokeStyle = '#b47450';
    ctx.lineWidth = 6.0;
    ctx.beginPath();
    ctx.moveTo(480, 776);
    ctx.lineTo(544, 776);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createChallengerTorsoUVTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Base Warm Skin Tone for Midriff (bottom of torso y = 740..1024) & Upper V-Neck Chest
  ctx.fillStyle = '#ebb690';
  ctx.fillRect(0, 0, 1024, 1024);

  // Midriff Lateral Oblique Shadows & Sculpted 6-Pack Abs (y = 730..1024, Front = 512)
  ctx.fillStyle = '#cf9268';
  // Left & Right side oblique shading
  ctx.fillRect(340, 720, 75, 304);
  ctx.fillRect(609, 720, 75, 304);
  // Center linea alba & ab pack shadows
  ctx.fillRect(504, 725, 16, 290);
  [785, 875, 960].forEach((ay) => {
    ctx.fillStyle = '#cf9268';
    ctx.fillRect(435, ay, 154, 16);
    // Warm highlight on top of each ab block
    ctx.fillStyle = '#f5c6a2';
    ctx.fillRect(442, ay - 36, 56, 24);
    ctx.fillRect(526, ay - 36, 56, 24);
  });

  // Crisp Anime Ink Lines on Midriff Abs (Front x = 512)
  ctx.strokeStyle = '#24140e';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  // Center vertical linea alba
  ctx.moveTo(512, 740);
  ctx.lineTo(512, 1005);
  // Outer rectus abdominis vertical contour lines
  ctx.moveTo(436, 745);
  ctx.lineTo(444, 1005);
  ctx.moveTo(588, 745);
  ctx.lineTo(580, 1005);
  // Horizontal tendinous intersections
  [792, 882].forEach((hy) => {
    ctx.moveTo(440, hy);
    ctx.lineTo(498, hy + 5);
    ctx.moveTo(526, hy + 5);
    ctx.lineTo(584, hy);
  });
  ctx.stroke();

  // Back Midriff Spinal Groove & Lumbar Lines (View 4, x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.fillStyle = '#cf9268';
    ctx.fillRect(-14, 730, 28, 294);
    ctx.strokeStyle = '#24140e';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(0, 735);
    ctx.lineTo(0, 1010);
    ctx.moveTo(-68, 760);
    ctx.lineTo(-56, 995);
    ctx.moveTo(68, 760);
    ctx.lineTo(56, 995);
    ctx.stroke();
  });

  // 2. Fitted Dark-Charcoal Crew-Neck Undershirt in Center Front Channel (x = 430..594, y = 265..742)
  ctx.fillStyle = '#1b1d23';
  ctx.fillRect(425, 275, 174, 468);

  // Subtle horizontal pectoral & ribcage fold lines on dark undershirt
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

  // Bare V-Neck Upper Chest & Clavicle / Sternocleidomastoid Lines above Undershirt (x = 430..594, y = 0..275)
  ctx.strokeStyle = '#24140e';
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

  // 3. Cropped Matte-Charcoal Bomber Jacket Shell (#2b2e36)
  // Covers Back (0..438 and 586..1024) from top (y = 0) down to waist hem (y = 742)
  // Open at Center Front (x = 442..582)!
  ctx.fillStyle = '#2b2e36';
  ctx.fillRect(0, 0, 442, 665);
  ctx.fillRect(582, 0, 442, 665);

  // Cel-shaded darker charcoal side/underarm panels for 3D depth
  ctx.fillStyle = '#21242b';
  ctx.fillRect(210, 100, 95, 565);
  ctx.fillRect(719, 100, 95, 565);

  // 4. Segmented Crimson-Red Ribbed Bottom Waist Hem (#c8242a) at y = 665..742
  // Stops cleanly at x = 442 and x = 582 so Center Front is OPEN!
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

  // Bold black ink borders around the jacket front opening (x = 442 and x = 582) & waist hem
  ctx.strokeStyle = '#0e0e12';
  ctx.lineWidth = 7;
  ctx.beginPath();
  // Left & Right open front zipper edges (NO vertical red stripe down chest!)
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

  // Angled Slash Pocket Welts on Front Left & Right Charcoal Panels (Views 1, 2, 3)
  ctx.strokeStyle = '#111216';
  ctx.lineWidth = 6.5;
  [
    [392, 535, 336, 618], // Viewer's left panel slash pocket
    [632, 535, 688, 618]  // Viewer's right panel slash pocket
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

  // 5. VIEW 4 BACK EMBLEM: White Stylized Skull Wearing Red-and-White DJ Headphones
  // Drawn directly on the charcoal jacket back (NO outer white circle!)
  drawOnBackSeam(ctx, () => {
    ctx.save();
    ctx.translate(0, 340);
    ctx.scale(0.82, 0.82);

    // Subtle back panel seam lines above and below skull
    ctx.strokeStyle = '#16181e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-175, -165);
    ctx.lineTo(175, -165);
    ctx.stroke();

    // Headphones Outer Arch Band (Crimson Red #c8242a with White inner band & Black Ink Outline)
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#0e0e12';
    ctx.beginPath();
    ctx.arc(0, -12, 128, Math.PI * 0.96, Math.PI * 2.04);
    ctx.stroke();

    ctx.lineWidth = 18;
    ctx.strokeStyle = '#c8242a';
    ctx.beginPath();
    ctx.arc(0, -12, 128, Math.PI * 0.96, Math.PI * 2.04);
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.strokeStyle = '#f5f6f8';
    ctx.beginPath();
    ctx.arc(0, -12, 118, Math.PI * 0.98, Math.PI * 2.02);
    ctx.stroke();

    // Left & Right Over-Ear DJ Cans (Red outer shell, White inner cushion)
    [-126, 126].forEach((hx) => {
      const sign = Math.sign(hx);
      // White mounting bracket
      ctx.fillStyle = '#f5f6f8';
      ctx.strokeStyle = '#0e0e12';
      ctx.lineWidth = 6;
      ctx.fillRect(hx - 10, -48, 20, 22);
      ctx.strokeRect(hx - 10, -48, 20, 22);

      // Red outer earcup dome
      ctx.fillStyle = '#c8242a';
      ctx.beginPath();
      ctx.ellipse(hx, 6, 26, 46, sign * -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // White inner earcup pad
      ctx.fillStyle = '#f5f6f8';
      ctx.beginPath();
      ctx.ellipse(hx - sign * 8, 6, 13, 36, sign * -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Stylized White Skull Cranium & Jaw
    ctx.fillStyle = '#f5f6f8';
    ctx.strokeStyle = '#0e0e12';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, -14, 92, Math.PI * 0.82, Math.PI * 2.18);
    // Cheekbones & tapered jaw
    ctx.lineTo(78, 42);
    ctx.lineTo(52, 62);
    ctx.lineTo(46, 108);
    ctx.lineTo(-46, 108);
    ctx.lineTo(-52, 62);
    ctx.lineTo(-78, 42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle grey temple shading inside skull
    ctx.fillStyle = '#d4d8e0';
    ctx.beginPath();
    ctx.arc(-58, -18, 24, 0, Math.PI * 2);
    ctx.arc(58, -18, 24, 0, Math.PI * 2);
    ctx.fill();

    // Large Angry Dark Eye Sockets
    ctx.fillStyle = '#121318';
    [-38, 38].forEach((ex) => {
      ctx.beginPath();
      ctx.ellipse(ex, 12, 24, 26, ex < 0 ? 0.22 : -0.22, 0, Math.PI * 2);
      ctx.fill();
    });

    // Triangular Nasal Cavity
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(-14, 62);
    ctx.lineTo(14, 62);
    ctx.closePath();
    ctx.fill();

    // Skull Teeth Vertical & Horizontal Ink Lines
    ctx.strokeStyle = '#121318';
    ctx.lineWidth = 5.5;
    [-24, 0, 24].forEach((tx) => {
      ctx.beginPath();
      ctx.moveTo(tx, 74);
      ctx.lineTo(tx, 106);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-44, 90);
    ctx.lineTo(44, 90);
    ctx.stroke();

    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createChallengerPelvisUVTexture() {
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
    ctx.strokeStyle = '#121418';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(0, 118);
    ctx.lineTo(0, 460);
    ctx.stroke();

    [-88, 88].forEach((px) => {
      ctx.fillStyle = '#252930';
      ctx.beginPath();
      ctx.moveTo(px - 52, 175);
      ctx.lineTo(px + 52, 175);
      ctx.lineTo(px + 48, 330);
      ctx.lineTo(px, 375);
      ctx.lineTo(px - 48, 330);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pocket top flap seam
      ctx.beginPath();
      ctx.moveTo(px - 50, 215);
      ctx.lineTo(px, 232);
      ctx.lineTo(px + 50, 215);
      ctx.stroke();
    });
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createChallengerPantsLegUVTexture() {
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
  return tex;
}

// ============================================================================
// 3. GROUND-TRUTH 3D CHALLENGER MODEL (100% 4-ANGLE TURNAROUND PARITY)
//    Local Frame: Front = -Z, Back = +Z, Challenger Right Hip = +X (Viewer's Left in View 1)
//    Total Height: 2.00m (Soles at y = 0.00m, Hair Crown at y = 2.00m)
// ============================================================================
export function buildChallengerModel() {
  const root = new THREE.Group();

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
    [-0.12, 0.162, 0.095, 0.105, 0, 0.004, 2.2],
    [-0.06, 0.168, 0.098, 0.108, 0, 0.004, 2.3],
    [0.00,  0.164, 0.095, 0.102, 0, 0.002, 2.3],
    [0.045, 0.158, 0.090, 0.096, 0, 0.000, 2.3]
  ];
  const pelvisGeo = createSculptedLoftGeometry(pelvisSlices, 32, true, true, true);
  const pelvisMesh = createHiFiMesh(pelvisGeo, 0xffffff, 0.032, createChallengerPelvisUVTexture());
  hips.add(pelvisMesh);

  // 3D Center Silver Belt Buckle Accent on Front (-Z)
  const buckleMesh = createHiFiMesh(
    new THREE.BoxGeometry(0.056, 0.044, 0.016),
    0xaab2bd,
    0.024,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.86, glintIntensity: 1.4 }
  );
  buckleMesh.position.set(0, 0.022, -0.092);
  hips.add(buckleMesh);

  // SIGNATURE GLOWING NEON-YELLOW HIP CHAIN ON CHALLENGER'S RIGHT HIP (Local +X)
  // Visible on viewer's left in View 1 & View 2, facing camera in View 3 (Right Profile), and on viewer's right in View 4!
  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.105, 0.018, -0.092), // Front-right belt loop attachment
    new THREE.Vector3(0.176, -0.035, -0.078),
    new THREE.Vector3(0.208, -0.095, -0.025),
    new THREE.Vector3(0.212, -0.138, 0.025),
    new THREE.Vector3(0.198, -0.080, 0.078),
    new THREE.Vector3(0.146, 0.012, 0.092)   // Rear-right belt attachment
  ]);
  const chainCoreGeo = new THREE.TubeGeometry(chainCurve, 28, 0.0115, 8, false);
  const chainCoreMat = new THREE.MeshBasicMaterial({ color: 0xffff55 });
  const chainCore = new THREE.Mesh(chainCoreGeo, chainCoreMat);
  hips.add(chainCore);

  // Soft neon-yellow outer aura tube around the hip chain
  const chainGlowGeo = new THREE.TubeGeometry(chainCurve, 28, 0.021, 8, false);
  const chainGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffd000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
  });
  const chainGlow = new THREE.Mesh(chainGlowGeo, chainGlowMat);
  hips.add(chainGlow);

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

  // Build custom double-layered flared V-collar mesh open at front (-Z)
  function buildFlaredCollarMesh(radiusScale, openBase, openTop, colorHex, outlineThick) {
    const segsU = 24;
    const segsV = 5;
    const pos = [];
    const ind = [];
    for (let iv = 0; iv <= segsV; iv++) {
      const v = iv / segsV; // 0 at neck base (y=0), 1 at high flared rim (y=0.130)
      const y = v * 0.130;
      const halfOpenAngle = openBase + v * (openTop - openBase);
      const rx = (0.104 + v * 0.064) * radiusScale;
      const rz = (0.086 + v * 0.032) * radiusScale;

      for (let iu = 0; iu <= segsU; iu++) {
        const u = iu / segsU;
        // Sweep from front-right (-PI + halfOpenAngle) around Back (0) to front-left (+PI - halfOpenAngle)
        const theta = -Math.PI + halfOpenAngle + u * (Math.PI * 2 - halfOpenAngle * 2);
        const x = -Math.sin(theta) * rx;
        const z = Math.cos(theta) * rz;
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
    if (outlineThick > 0) {
      const o = new THREE.Mesh(g, createOutlineMaterial(outlineThick));
      m.add(o);
    }
    return m;
  }

  // Outer Charcoal Collar Shell covering Side Profile (View 3) and Back (View 4)
  const collarOuter = buildFlaredCollarMesh(1.03, 0.34, 0.64, CHARCOAL_HEX, 0.030);
  collarGroup.add(collarOuter);

  // Inner Crimson Collar Lining & Front V-Lapel Edge (prominently visible in Front View 1 & 3/4 View 2!)
  const collarInner = buildFlaredCollarMesh(0.98, 0.24, 0.52, CRIMSON_HEX, 0.024);
  collarInner.position.y = 0.002;
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

  // Sculpted Anime Head Loft (Pointed Chin at y = -0.135 up to Cranium at y = +0.115)
  const headSlices = [
    [-0.132, 0.024, 0.062, 0.035, 0, -0.032, 2.0], // Pointed anime chin tip (z_front = -0.094)
    [-0.102, 0.056, 0.082, 0.065, 0, -0.016, 2.1], // Lower jawline taper (z_front = -0.098)
    [-0.060, 0.078, 0.094, 0.084, 0, -0.006, 2.1], // Gonion / mouth level (z_front = -0.100)
    [-0.015, 0.088, 0.100, 0.095, 0, -0.002, 2.1], // Cheekbones / nose bridge
    [0.035,  0.090, 0.100, 0.098, 0,  0.000, 2.1], // Eye & brow ridge level
    [0.080,  0.084, 0.092, 0.094, 0,  0.004, 2.0], // Forehead
    [0.115,  0.058, 0.064, 0.068, 0,  0.006, 2.0]  // Top of cranium under hair
  ];
  const headGeo = createSculptedLoftGeometry(headSlices, 32, true, true, true);
  const headTexDetermined = createChallengerHeadUVTexture('determined');
  const headTexGrin = createChallengerHeadUVTexture('grin');
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.030, headTexDetermined);
  headGroup.add(headMesh);

  // Subtle 3D Anime Nose Wedge on Front (-Z) for crisp Side Profile silhouette (View 3)
  const nosePts = [
    [0.000, 0.003, 0.004, 0.004, 0, 0.000, 2.0],
    [0.012, 0.012, 0.024, 0.006, 0, -0.008, 2.0],
    [0.035, 0.008, 0.014, 0.005, 0, -0.004, 2.0],
    [0.052, 0.003, 0.004, 0.004, 0, 0.000, 2.0]
  ];
  const noseMesh = createHiFiMesh(createSculptedLoftGeometry(nosePts, 12, true, true, true), SKIN_HEX, 0.0);
  noseMesh.position.set(0, -0.042, -0.096);
  headGroup.add(noseMesh);

  // Sculpted 3D Ears on Left (-X) and Right (+X)
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.032, 0.008, 0.014, 0.014, 0, 0, 2.0],
      [-0.010, 0.015, 0.022, 0.022, side * 0.004, 0, 2.0],
      [0.018,  0.017, 0.024, 0.024, side * 0.006, 0, 2.0],
      [0.034,  0.009, 0.015, 0.015, 0, 0, 2.0]
    ];
    const ear = createHiFiMesh(createSculptedLoftGeometry(earSlices, 12, true, true, true), SKIN_HEX, 0.024);
    ear.position.set(side * 0.088, -0.008, 0.005);
    ear.rotation.set(-0.08, side * -0.18, side * 0.12);
    headGroup.add(ear);
  });

  // LAYERED CHESTNUT-BROWN ANIME HAIR SCULPT (Full Rounded Tousled Hair Dome + Downward-Swept Locks)
  const hairGroup = new THREE.Group();
  headGroup.add(hairGroup);

  const HAIR_MID = 0x7a462b;
  const HAIR_LIGHT = 0x945838;
  const HAIR_DARK = 0x522e1b;

  // Full Chestnut Hair Volume Dome framing Upper Forehead, Temples, Crown, and Nape
  const hairBaseSlices = [
    [-0.055, 0.082, 0.015, 0.106, 0, 0.036, 2.0],
    [0.005,  0.104, 0.045, 0.120, 0, 0.022, 2.1],
    [0.052,  0.114, 0.105, 0.125, 0, 0.004, 2.1],
    [0.102,  0.114, 0.108, 0.122, 0, 0.002, 2.1],
    [0.148,  0.096, 0.094, 0.104, 0, 0.004, 2.1],
    [0.182,  0.052, 0.052, 0.058, 0, 0.006, 2.0]
  ];
  const hairBaseMesh = createHiFiMesh(createSculptedLoftGeometry(hairBaseSlices, 28, true, true, true), HAIR_MID, 0.030);
  hairGroup.add(hairBaseMesh);

  // Broad, curved, overlapping anime hair tufts that flare around the hair dome matching the reference turnaround!
  const lockFringeLong = createCurvedHairLockGeometry(0.088, 0.060, 0.032, -0.012, 0.005);
  const lockFringeMed  = createCurvedHairLockGeometry(0.076, 0.054, 0.028, -0.010, -0.004);
  const lockCrownBig   = createCurvedHairLockGeometry(0.112, 0.088, 0.054, 0.026, 0.0);
  const lockSideFlare  = createCurvedHairLockGeometry(0.104, 0.080, 0.048, 0.022, 0.0);
  const lockNape       = createCurvedHairLockGeometry(0.086, 0.070, 0.042, 0.018, 0.0);

  // A. Downward-Sweeping Forehead Fringe Bangs Placed Outside Forehead Surface (z = -0.102..-0.108)
  const fringeSpecs = [
    { geo: lockFringeLong, pos: [-0.012, 0.108, -0.104], rot: [Math.PI - 0.08, 0.06, -0.14], col: HAIR_MID },
    { geo: lockFringeLong, pos: [0.018,  0.110, -0.104], rot: [Math.PI - 0.06, -0.06, 0.18], col: HAIR_LIGHT },
    { geo: lockFringeMed,  pos: [-0.046, 0.106, -0.094], rot: [Math.PI - 0.10, 0.24, -0.26], col: HAIR_LIGHT },
    { geo: lockFringeMed,  pos: [0.048,  0.106, -0.094], rot: [Math.PI - 0.10, -0.24, 0.26], col: HAIR_MID },
    { geo: lockFringeMed,  pos: [-0.074, 0.098, -0.074], rot: [Math.PI - 0.08, 0.45, -0.34], col: HAIR_MID },
    { geo: lockFringeMed,  pos: [0.074,  0.098, -0.074], rot: [Math.PI - 0.08, -0.45, 0.34], col: HAIR_DARK },
    // Left & Right Temple Sideburn Locks framing cheekbones in front of ears
    { geo: lockFringeLong, pos: [-0.090, 0.074, -0.036], rot: [Math.PI - 0.04, 0.65, -0.16], col: HAIR_DARK },
    { geo: lockFringeLong, pos: [0.090,  0.074, -0.036], rot: [Math.PI - 0.04, -0.65, 0.16], col: HAIR_DARK }
  ];

  // B. Expressive Tousled Anime Crown, Temple & Back Tufts (Matching Reference Silhouette Across Views 1-4!)
  const crownSpecs = [
    // Top Crown Crest Tufts (flaring upward and slightly outward to y_world = 2.00m)
    { geo: lockCrownBig,  pos: [0.000,  0.132, -0.010], rot: [0.22, 0.0, -0.12],  col: HAIR_LIGHT },
    { geo: lockCrownBig,  pos: [-0.042, 0.128, 0.002],  rot: [0.26, -0.15, 0.42], col: HAIR_MID },
    { geo: lockCrownBig,  pos: [0.042,  0.128, 0.002],  rot: [0.26, 0.15, -0.42], col: HAIR_LIGHT },
    { geo: lockSideFlare, pos: [-0.072, 0.108, -0.004], rot: [0.32, -0.25, 0.78], col: HAIR_MID },
    { geo: lockSideFlare, pos: [0.072,  0.108, -0.004], rot: [0.32, 0.25, -0.78], col: HAIR_LIGHT },

    // Mid-Temple & Lateral Side Tufts (sweeping outward & slightly downward)
    { geo: lockSideFlare, pos: [-0.088, 0.078, 0.012],  rot: [0.25, -0.30, 1.15],  col: HAIR_MID },
    { geo: lockSideFlare, pos: [0.088,  0.078, 0.012],  rot: [0.25, 0.30, -1.15],  col: HAIR_LIGHT },
    { geo: lockNape,      pos: [-0.090, 0.042, 0.025],  rot: [-0.20, 0.18, 2.25],  col: HAIR_DARK },
    { geo: lockNape,      pos: [0.090,  0.042, 0.025],  rot: [-0.20, -0.18, -2.25], col: HAIR_MID },
    { geo: lockNape,      pos: [-0.082, 0.008, 0.036],  rot: [-0.24, 0.20, 2.58],  col: HAIR_DARK },
    { geo: lockNape,      pos: [0.082,  0.008, 0.036],  rot: [-0.24, -0.20, -2.58], col: HAIR_DARK },

    // Occipital & Back Swept Tufts (View 3 Swept Profile & View 4 Radial Layered Back)
    { geo: lockCrownBig,  pos: [0.000,  0.122, 0.052],  rot: [0.82, 0.0, 0.0],     col: HAIR_MID },
    { geo: lockCrownBig,  pos: [-0.048, 0.114, 0.048],  rot: [0.85, -0.25, 0.42],  col: HAIR_LIGHT },
    { geo: lockCrownBig,  pos: [0.048,  0.114, 0.048],  rot: [0.85, 0.25, -0.42],  col: HAIR_MID },
    { geo: lockSideFlare, pos: [0.000,  0.078, 0.078],  rot: [1.32, 0.0, 0.0],     col: HAIR_MID },
    { geo: lockSideFlare, pos: [-0.052, 0.070, 0.072],  rot: [1.35, -0.28, 0.48],  col: HAIR_DARK },
    { geo: lockSideFlare, pos: [0.052,  0.070, 0.072],  rot: [1.35, 0.28, -0.48],  col: HAIR_MID },
    { geo: lockNape,      pos: [0.000,  0.032, 0.088],  rot: [2.42, 0.0, 0.0],     col: HAIR_DARK },
    { geo: lockNape,      pos: [-0.046, 0.025, 0.082],  rot: [2.40, -0.22, 0.28],  col: HAIR_MID },
    { geo: lockNape,      pos: [0.046,  0.025, 0.082],  rot: [2.40, 0.22, -0.28],  col: HAIR_DARK }
  ];

  [...fringeSpecs, ...crownSpecs].forEach(({ geo, pos, rot, col }) => {
    const lockMesh = createHiFiMesh(geo, col, 0.026);
    lockMesh.position.set(...pos);
    lockMesh.rotation.set(...rot);
    hairGroup.add(lockMesh);
  });

  // --------------------------------------------------------------------------
  // 5. ARTICULATED TWO-SEGMENT ARMS, 3/4 SLEEVES & 5-FINGER MMA GLOVES
  // --------------------------------------------------------------------------
  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 0.43, 0.005); // Calibrated shoulder width (total shoulder span = 0.56m)

    // Sculpted 3/4 Pushed-Up Charcoal Bomber Sleeve with Gathered Elbow Folds
    const sleeveSlices = [
      [-0.27, 0.068, 0.068, 0.068, 0, 0, 2.0], // Bottom of dark ribbed elbow cuff
      [-0.22, 0.072, 0.072, 0.072, 0, 0, 2.0], // Top of elbow cuff
      [-0.19, 0.086, 0.084, 0.086, 0, 0, 2.1], // Gathered sleeve puff above cuff
      [-0.12, 0.082, 0.080, 0.082, 0, 0, 2.1], // Mid-bicep sleeve
      [-0.03, 0.088, 0.085, 0.088, 0, 0, 2.1], // Deltoid cap
      [0.04,  0.065, 0.065, 0.065, 0, 0, 2.0]
    ];
    const upperSleeve = createHiFiMesh(createSculptedLoftGeometry(sleeveSlices, 20, true, true, true), CHARCOAL_HEX, 0.030);
    shoulder.add(upperSleeve);

    // Dark-Charcoal Ribbed Elbow Cuff Band (#1e2028)
    const darkCuff = createHiFiMesh(new THREE.CylinderGeometry(0.073, 0.069, 0.052, 18), 0x1e2028, 0.028);
    darkCuff.position.y = -0.245;
    shoulder.add(darkCuff);

    // Crimson-Red Outer Shoulder-to-Elbow Sleeve Stripe (Views 1, 2, 3, 4)
    const stripeSlices = [
      [-0.21, 0.012, 0.024, 0.024, side * 0.078, 0, 2.2],
      [-0.11, 0.014, 0.026, 0.026, side * 0.078, 0, 2.2],
      [-0.01, 0.014, 0.026, 0.026, side * 0.080, 0, 2.2]
    ];
    const sleeveStripe = createHiFiMesh(createSculptedLoftGeometry(stripeSlices, 12, true, true, true), CRIMSON_HEX, 0.020);
    shoulder.add(sleeveStripe);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    // Lean Muscular Bare Forearm in Warm Skin Tone
    const forearmSlices = [
      [-0.22, 0.044, 0.042, 0.042, 0, 0, 2.0], // Wrist
      [-0.12, 0.056, 0.054, 0.054, 0, 0, 2.0], // Mid-forearm
      [-0.03, 0.064, 0.062, 0.062, 0, 0, 2.0], // Brachioradialis
      [0.01,  0.058, 0.058, 0.058, 0, 0, 2.0]
    ];
    const forearm = createHiFiMesh(createSculptedLoftGeometry(forearmSlices, 18, true, true, true), SKIN_HEX, 0.028);
    elbow.add(forearm);

    // Strapped Black MMA Glove Wrist Cuff
    const wristCuff = createHiFiMesh(new THREE.CylinderGeometry(0.052, 0.054, 0.052, 16), 0x1c1e24, 0.028);
    wristCuff.position.y = -0.225;
    elbow.add(wristCuff);

    // Articulated 5-Finger MMA Fingerless Combat Glove
    const hand = new THREE.Group();
    hand.position.y = -0.275;
    elbow.add(hand);

    const palm = createHiFiMesh(new THREE.BoxGeometry(0.078, 0.072, 0.044), 0x1c1e24, 0.028);
    hand.add(palm);

    const knucklePad = createHiFiMesh(new THREE.BoxGeometry(0.074, 0.032, 0.018), 0x2c303a, 0.022);
    knucklePad.position.set(0, 0.008, -0.024);
    hand.add(knucklePad);

    // 4 Articulated Fingers (Gloved proximal phalanx + Exposed skin distal phalanges)
    const fingerGroups = [];
    [-0.027, -0.009, 0.009, 0.027].forEach((fx, fIdx) => {
      const fGroup = new THREE.Group();
      fGroup.position.set(fx, -0.034, -0.004);

      const fGlove = createHiFiMesh(new THREE.BoxGeometry(0.016, 0.022, 0.018), 0x1c1e24, 0.020);
      fGlove.position.y = -0.008;
      fGroup.add(fGlove);

      const fSkinLen = fIdx === 1 || fIdx === 2 ? 0.034 : 0.029;
      const fSkin = createHiFiMesh(new THREE.BoxGeometry(0.015, fSkinLen, 0.016), SKIN_HEX, 0.020);
      fSkin.position.set(0, -0.018 - fSkinLen * 0.5, 0.002);
      fSkin.rotation.x = 0.25;
      fGroup.add(fSkin);

      hand.add(fGroup);
      fingerGroups.push({ fGroup, fSkin });
    });

    // Articulated Thumb (on inner side of hand: -side * X)
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(-side * 0.040, -0.008, -0.010);
    thumbGroup.rotation.set(0.18, side * 0.25, -side * 0.38);

    const thumbGlove = createHiFiMesh(new THREE.BoxGeometry(0.020, 0.024, 0.020), 0x1c1e24, 0.020);
    thumbGroup.add(thumbGlove);

    const thumbSkin = createHiFiMesh(new THREE.BoxGeometry(0.018, 0.026, 0.018), SKIN_HEX, 0.020);
    thumbSkin.position.set(side * 0.004, -0.022, 0.002);
    thumbSkin.rotation.z = side * 0.25;
    thumbGroup.add(thumbSkin);

    hand.add(thumbGroup);

    function setFistClenched(clenched) {
      fingerGroups.forEach(({ fGroup, fSkin }) => {
        if (clenched) {
          fGroup.rotation.x = 1.25;
          fSkin.rotation.x = 1.35;
        } else {
          fGroup.rotation.x = 0.16;
          fSkin.rotation.x = 0.22;
        }
      });
      if (clenched) {
        thumbGroup.rotation.set(0.55, side * 0.55, -side * 0.65);
      } else {
        thumbGroup.rotation.set(0.18, side * 0.25, -side * 0.38);
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

  function buildLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.105, -0.05, 0); // Hip joint at y_world = 1.02m

    // Sculpted Baggy Upper Thigh Loft (y = 0.02 down to Knee at y = -0.38)
    const thighSlices = [
      [-0.39, 0.108, 0.104, 0.108, side * 0.010, 0.000, 2.1], // Knee transition
      [-0.28, 0.124, 0.116, 0.120, side * 0.014, 0.000, 2.2], // Lower thigh flare
      [-0.14, 0.122, 0.114, 0.118, side * 0.010, 0.002, 2.2], // Mid thigh
      [0.02,  0.108, 0.098, 0.104, 0.000,        0.002, 2.1]  // Hip root
    ];
    const thighMesh = createHiFiMesh(createSculptedLoftGeometry(thighSlices, 24, true, true, true), PANTS_HEX, 0.032);
    hipJoint.add(thighMesh);

    // Outer-Thigh Flapped Cargo Pocket (angled along outer thigh contour)
    const pocketGroup = new THREE.Group();
    pocketGroup.position.set(side * 0.118, -0.20, 0.00);
    pocketGroup.rotation.z = side * -0.06;
    hipJoint.add(pocketGroup);

    const cargoBox = createHiFiMesh(new THREE.BoxGeometry(0.036, 0.145, 0.115), 0x252830, 0.028);
    pocketGroup.add(cargoBox);

    const cargoFlap = createHiFiMesh(new THREE.BoxGeometry(0.042, 0.036, 0.122), 0x2e323c, 0.026);
    cargoFlap.position.y = 0.062;
    pocketGroup.add(cargoFlap);

    // Knee Joint at y = -0.38 (y_world = 0.64m)
    const kneeJoint = new THREE.Group();
    kneeJoint.position.set(side * 0.010, -0.38, 0);
    hipJoint.add(kneeJoint);

    // 3/4 Baggy Calf Puff + Dark-Grey Ribbed Mid-Calf Cuff ending at y = -0.24 (y_world = 0.40m)
    const calfSlices = [
      [-0.24, 0.064, 0.064, 0.066, 0, 0.004, 2.0], // Bottom of dark-grey mid-calf cuff (y_world = 0.40m)
      [-0.19, 0.068, 0.068, 0.070, 0, 0.004, 2.0], // Top of mid-calf cuff (y_world = 0.45m)
      [-0.15, 0.114, 0.108, 0.114, side * 0.006, 0.006, 2.2], // Baggy bloused calf puff overhang!
      [-0.07, 0.118, 0.110, 0.116, side * 0.004, 0.004, 2.2], // Upper calf volume
      [0.02,  0.106, 0.102, 0.106, 0, 0.000, 2.1]  // Knee blend
    ];
    const calfMesh = createHiFiMesh(
      createSculptedLoftGeometry(calfSlices, 24, true, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    kneeJoint.add(calfMesh);

    // Exposed Lean Tapered Bare Lower Shin in Warm Skin Tone (y = -0.23 to -0.43 -> y_world = 0.21m..0.41m)
    const shinSlices = [
      [-0.43, 0.040, 0.042, 0.044, 0, 0.006, 2.0], // Ankle joint
      [-0.33, 0.048, 0.050, 0.054, 0, 0.008, 2.0], // Lower shin taper
      [-0.23, 0.056, 0.058, 0.062, 0, 0.006, 2.0]  // Enters mid-calf cuff
    ];
    const lowerShin = createHiFiMesh(createSculptedLoftGeometry(shinSlices, 20, true, true, true), SKIN_HEX, 0.028);
    kneeJoint.add(lowerShin);

    // Articulated Ankle Joint at y = -0.42 (y_world = 0.22m, so sole bottom is at y_world = 0.00m!)
    const ankleJoint = new THREE.Group();
    ankleJoint.position.set(0, -0.42, 0.006);
    kneeJoint.add(ankleJoint);

    // SCULPTED CONTOURED HIGH-TOP SNEAKER (Crimson, Black & White Rubber Toe-Cap + Flat Outsole)
    const shoeGroup = new THREE.Group();
    ankleJoint.add(shoeGroup);

    // 1. Flat White Rubber Outsole (y = -0.22 to -0.182 -> y_world = 0.00m..0.038m)
    const soleSlices = [
      [-0.220, 0.072, 0.175, 0.088, 0, 0, 2.5],
      [-0.184, 0.074, 0.178, 0.090, 0, 0, 2.5]
    ];
    const soleMesh = createHiFiMesh(createSculptedLoftGeometry(soleSlices, 24, true, true, true), 0xf4f5f7, 0.030);
    shoeGroup.add(soleMesh);

    // Crisp black foxing pinstripe along top of white sole
    const soleRimSlices = [
      [-0.186, 0.075, 0.179, 0.091, 0, 0, 2.5],
      [-0.176, 0.073, 0.175, 0.089, 0, 0, 2.5]
    ];
    const soleRim = createHiFiMesh(createSculptedLoftGeometry(soleRimSlices, 24, true, false, false), 0x14151a, 0.020);
    shoeGroup.add(soleRim);

    // 2. Sculpted Black Canvas Sneaker Upper & Throat (y = -0.18 to -0.02)
    const upperSlices = [
      [-0.180, 0.070, 0.155, 0.085, 0, 0.000, 2.3],
      [-0.130, 0.066, 0.125, 0.082, 0, 0.004, 2.2],
      [-0.075, 0.058, 0.078, 0.076, 0, 0.010, 2.1],
      [-0.015, 0.056, 0.064, 0.072, 0, 0.012, 2.1]
    ];
    const shoeUpper = createHiFiMesh(createSculptedLoftGeometry(upperSlices, 24, true, false, true), 0x1c1e24, 0.030);
    shoeGroup.add(shoeUpper);

    // 3. Rounded White Rubber Toe-Box Cap at Front (-Z)
    const toeCapSlices = [
      [-0.182, 0.069, 0.085, 0.015, 0, -0.092, 2.2],
      [-0.145, 0.064, 0.078, 0.015, 0, -0.086, 2.1],
      [-0.118, 0.045, 0.048, 0.010, 0, -0.076, 2.0]
    ];
    const toeCap = createHiFiMesh(createSculptedLoftGeometry(toeCapSlices, 20, true, false, true), 0xf4f5f7, 0.026);
    shoeGroup.add(toeCap);

    // 4. Crimson-Red High-Top Ankle Collar, Heel Counter & Eyestay Overlay (#c8242a)
    const redCollarSlices = [
      [-0.065, 0.060, 0.058, 0.078, 0, 0.014, 2.1],
      [-0.002, 0.060, 0.056, 0.076, 0, 0.014, 2.1],
      [0.018,  0.056, 0.048, 0.072, 0, 0.018, 2.1]
    ];
    const redCollar = createHiFiMesh(createSculptedLoftGeometry(redCollarSlices, 20, true, false, true), CRIMSON_HEX, 0.028);
    shoeGroup.add(redCollar);

    const redHeelSlices = [
      [-0.178, 0.071, 0.020, 0.088, 0, 0.002, 2.2],
      [-0.065, 0.061, 0.020, 0.079, 0, 0.012, 2.1]
    ];
    const redHeel = createHiFiMesh(createSculptedLoftGeometry(redHeelSlices, 18, true, false, false), CRIMSON_HEX, 0.026);
    shoeGroup.add(redHeel);

    // Crimson Front Eyestay Trim & Criss-Cross Laces down Sneaker Throat (-Z)
    [-1, 1].forEach((s) => {
      const eyestay = createHiFiMesh(new THREE.BoxGeometry(0.022, 0.13, 0.024), CRIMSON_HEX, 0.020);
      eyestay.position.set(s * 0.032, -0.085, -0.074);
      eyestay.rotation.x = -0.46;
      shoeGroup.add(eyestay);
    });

    for (let l = 0; l < 5; l++) {
      const lace = createHiFiMesh(new THREE.BoxGeometry(0.058, 0.010, 0.014), 0x16181e, 0.015);
      lace.position.set(0, -0.042 - l * 0.022, -0.056 - l * 0.013);
      lace.rotation.z = (l % 2 === 0 ? 0.18 : -0.18);
      shoeGroup.add(lace);
    }

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
  grad.addColorStop(0.55, 'rgba(246, 202, 132, 0.96)');
  grad.addColorStop(0.88, 'rgba(255, 236, 184, 0.98)');
  grad.addColorStop(1.0, 'rgba(255, 246, 215, 0.95)');

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
    opacity: 0.96,
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
function createMarqueeTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#120e24';
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
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#52f2ff';
  ctx.fillText('KRONOS', 64, 132);

  ctx.shadowColor = '#ff2a85';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ff4da6';
  ctx.fillText('BEATS', 575, 132);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTruckSubBannerTexture() {
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

  // Metallic gold radial sheen base
  const grad = ctx.createRadialGradient(256, 256, 10, 256, 256, 250);
  grad.addColorStop(0.0, '#ffeaa7');
  grad.addColorStop(0.35, '#f5c538');
  grad.addColorStop(0.70, '#d49b28');
  grad.addColorStop(1.0, '#9e6d15');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();

  // 24 Concentric Circular Vinyl Micro-Grooves
  ctx.lineWidth = 1.8;
  for (let r = 70; r < 245; r += 7.5) {
    ctx.strokeStyle = r % 15 === 0 ? 'rgba(70, 45, 10, 0.65)' : 'rgba(95, 62, 15, 0.40)';
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Outer rim bevel ring
  ctx.strokeStyle = '#fff099';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 245, 0, Math.PI * 2);
  ctx.stroke();

  // Center Gold Record Label
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.arc(256, 256, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#181216';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Micro-text on label
  ctx.fillStyle = '#181216';
  ctx.font = '900 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DJ KRONOS', 256, 235);
  ctx.font = '700 9px sans-serif';
  ctx.fillText('33⅓ RPM', 256, 248);

  // Center Spindle Hole
  ctx.fillStyle = '#120f12';
  ctx.beginPath();
  ctx.arc(256, 256, 14, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

export function createKronosBackEmblemTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  drawKronosCrownAndTurntable(ctx, 256, 256, 1.0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

function createKronosHeadUVTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // Linear Y-UV Calibration for headAndHairSlices (yMin = -0.148, yMax = +0.162, ySpan = 0.310):
  // - Chin tip (y = -0.148) -> py = 1024
  // - Goatee base (y = -0.140..-0.050) -> py = 700..995
  // - Mouth & Lips (y = -0.072) -> py = 773
  // - Nose (y = -0.038..+0.012) -> py = 495..660
  // - Sunglasses (y = +0.010) -> py = 502
  // - Eyebrows (y = +0.038) -> py = 410
  // - Forehead Razor Line-Up (y = +0.080) -> py = 271

  // 1. Rich Warm Bronze Skin Base (#b87348)
  ctx.fillStyle = '#b87348';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle cheekbone / forehead warm bronze highlight (#cc8558)
  const faceGlow = ctx.createRadialGradient(512, 480, 20, 512, 520, 230);
  faceGlow.addColorStop(0, '#ce885b');
  faceGlow.addColorStop(1, 'rgba(184, 115, 72, 0)');
  ctx.fillStyle = faceGlow;
  ctx.fillRect(260, 260, 504, 520);

  // 2. HIGH-TOP FLAT-TOP FADE HAIR & TEMPLE/NAPE SKIN-FADE GRADIENT (Top of UV py = 0..450)
  const fadeGrad = ctx.createLinearGradient(0, 220, 0, 455);
  fadeGrad.addColorStop(0.0, '#121216');
  fadeGrad.addColorStop(0.45, '#18161a');
  fadeGrad.addColorStop(0.72, '#4a2b1d');
  fadeGrad.addColorStop(0.90, '#8c5334');
  fadeGrad.addColorStop(1.0, 'rgba(184, 115, 72, 0.0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(0, 0, 1024, 460);

  // Carve out the crisp horizontal front forehead hairline & temple corners (x = 386..638, py = 270..465)
  ctx.fillStyle = '#c47c50';
  ctx.fillRect(386, 270, 252, 195);
  // Crisp dark line along the razor-sharp front line-up
  ctx.strokeStyle = '#121014';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(386, 270);
  ctx.lineTo(638, 270);
  ctx.moveTo(386, 270);
  ctx.lineTo(386, 365);
  ctx.moveTo(638, 270);
  ctx.lineTo(638, 365);
  ctx.stroke();

  // Horizontal forehead expression crease & furrowed brow lines above sunglasses (py = 330..410)
  ctx.strokeStyle = '#7d4627';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(446, 335);
  ctx.quadraticCurveTo(512, 328, 578, 335);
  ctx.moveTo(496, 368);
  ctx.lineTo(503, 405);
  ctx.moveTo(528, 368);
  ctx.lineTo(521, 405);
  ctx.stroke();

  // Thick Angled Dark Eyebrows just above Sunglasses Top Rim (py = 405..428, x = 512 ± 88)
  ctx.fillStyle = '#141014';
  [-1, 1].forEach((dir) => {
    const bx = 512 + dir * 88;
    ctx.beginPath();
    ctx.moveTo(bx - dir * 52, 412);
    ctx.quadraticCurveTo(bx, 390, bx + dir * 54, 404);
    ctx.lineTo(bx + dir * 48, 420);
    ctx.quadraticCurveTo(bx, 406, bx - dir * 46, 424);
    ctx.closePath();
    ctx.fill();
  });

  // Cheekbone & Nasolabial Sculpt Lines (x = 512 ± 108, py = 560..710)
  ctx.strokeStyle = '#7d4627';
  ctx.lineWidth = 5.0;
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(512 + dir * 112, 565);
    ctx.quadraticCurveTo(512 + dir * 92, 635, 512 + dir * 84, 695);
    ctx.stroke();
  });

  // Broad Sculpted Nose Bridge & Nostrils (x = 512, py = 505..642)
  ctx.fillStyle = '#ce885b';
  ctx.fillRect(490, 505, 44, 124);
  ctx.strokeStyle = '#3a1d10';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(484, 520);
  ctx.lineTo(468, 622);
  ctx.quadraticCurveTo(490, 642, 512, 642);
  ctx.quadraticCurveTo(534, 642, 556, 622);
  ctx.lineTo(540, 520);
  ctx.stroke();

  // 3. CONTOURED CIRCLE-BEARD GOATEE & MUSTACHE WITH VISIBLE BRONZE LIPS IN CENTER!
  // Outer black circle-beard silhouette (py = 675..975, x = 382..642 — wide heavyweight boss goatee!)
  ctx.fillStyle = '#121014';
  ctx.beginPath();
  // Top of mustache with center philtrum notch (py = 678)
  ctx.moveTo(512, 686);
  ctx.quadraticCurveTo(575, 668, 628, 708);
  // Right vertical goatee bar down to full square chin beard (py = 975)
  ctx.lineTo(642, 845);
  ctx.quadraticCurveTo(622, 965, 512, 976);
  ctx.quadraticCurveTo(402, 965, 382, 845);
  // Left vertical goatee bar
  ctx.lineTo(396, 708);
  ctx.quadraticCurveTo(449, 668, 512, 686);
  ctx.closePath();
  ctx.fill();

  // Inner cutout around mouth showing warm bronze lips & chin skin above soul-patch (py = 724..836)
  ctx.fillStyle = '#b87348';
  ctx.beginPath();
  ctx.moveTo(426, 726);
  ctx.quadraticCurveTo(512, 714, 598, 726);
  ctx.lineTo(590, 828);
  ctx.quadraticCurveTo(512, 844, 434, 828);
  ctx.closePath();
  ctx.fill();

  // Soul patch triangle below lower lip (py = 798..858)
  ctx.fillStyle = '#121014';
  ctx.beginPath();
  ctx.moveTo(482, 798);
  ctx.lineTo(542, 798);
  ctx.lineTo(512, 858);
  ctx.closePath();
  ctx.fill();

  // Sculpted Upper & Lower Bronze Lips inside Goatee Frame (py = 736..796)
  ctx.fillStyle = '#945232';
  ctx.beginPath();
  ctx.moveTo(438, 760);
  ctx.quadraticCurveTo(512, 738, 586, 760);
  ctx.quadraticCurveTo(512, 768, 438, 760);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#c4784c';
  ctx.beginPath();
  ctx.moveTo(444, 762);
  ctx.quadraticCurveTo(512, 768, 580, 762);
  ctx.quadraticCurveTo(562, 796, 512, 798);
  ctx.quadraticCurveTo(462, 796, 444, 762);
  ctx.closePath();
  ctx.fill();

  // Mouth parting ink line
  ctx.strokeStyle = '#180d08';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(436, 761);
  ctx.quadraticCurveTo(512, 754, 588, 761);
  ctx.stroke();

  // Back of neck / occipital skin creases (View 4, x = 0 / 1024)
  drawOnBackSeam(ctx, () => {
    ctx.strokeStyle = '#7d4627';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-55, 680);
    ctx.lineTo(-42, 860);
    ctx.moveTo(55, 680);
    ctx.lineTo(42, 860);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createKronosTorsoUVTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  // 1. Base Muscular Warm Bronze Skin (#b87348) for Center Front Channel (x = 442..582)
  ctx.fillStyle = '#b87348';
  ctx.fillRect(0, 0, 1024, 1024);

  // Sculpted Pectoral & 3-Row 6-Pack Abdominal Shading in Center Channel (x = 436..588)
  // Upper Pecs (y = 180..410)
  ctx.fillStyle = '#8f512c';
  ctx.fillRect(505, 160, 14, 780); // Center sternal / linea alba groove
  ctx.fillRect(436, 388, 152, 22); // Sub-pectoral shadow crease

  // 3 Distinct Rows of 6-Pack Abdominals below Medallion (y = 430..840)
  [
    { yTop: 435, h: 105 },
    { yTop: 565, h: 105 },
    { yTop: 695, h: 110 }
  ].forEach(({ yTop, h }) => {
    // Deep bronze shadow around ab blocks
    ctx.fillStyle = '#8f512c';
    ctx.fillRect(442, yTop + h - 18, 140, 20);
    // Warm bronze highlight on upper face of each ab block
    ctx.fillStyle = '#cf885a';
    ctx.fillRect(450, yTop + 8, 52, h - 30);
    ctx.fillRect(522, yTop + 8, 52, h - 30);
    // Crisp black comic ink outline for each ab block
    ctx.strokeStyle = '#1e100a';
    ctx.lineWidth = 5;
    ctx.strokeRect(448, yTop + 4, 56, h - 18);
    ctx.strokeRect(520, yTop + 4, 56, h - 18);
  });

  // Pectoral ink contour lines
  ctx.strokeStyle = '#1e100a';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(512, 185);
  ctx.lineTo(512, 855);
  ctx.moveTo(440, 395);
  ctx.quadraticCurveTo(485, 412, 512, 392);
  ctx.quadraticCurveTo(539, 412, 584, 395);
  ctx.stroke();

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
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-140, 745);
    ctx.quadraticCurveTo(0, 775, 140, 745);
    ctx.stroke();

    drawKronosCrownAndTurntable(ctx, 0, 445, 0.94);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createKronosPelvisUVTexture() {
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
  return tex;
}

function createKronosPantsLegUVTexture() {
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
  return tex;
}

export function buildKronosBossModel() {
  const root = new THREE.Group();
  root.scale.setScalar(0.58); // Calibrated ~0.58x scale in DJ booth; 1.0x in studio turnaround & Wave 3 ring fight!

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
    [0.00, 0.176, 0.105, 0.110, 0, 0.000, 2.3],
    [0.06, 0.182, 0.110, 0.115, 0, 0.002, 2.3],
    // Athletic V-Tapered Lower & Mid Torso (y = 0.15..0.38 -> y_world = 1.22m..1.45m)
    [0.16, 0.196, 0.118, 0.122, 0, 0.004, 2.3],
    [0.28, 0.218, 0.128, 0.132, 0, 0.006, 2.4],
    [0.40, 0.240, 0.136, 0.138, 0, 0.008, 2.4],
    // Broad Muscular Upper Chest & Shoulders (y = 0.47..0.52 -> y_world = 1.54m..1.59m)
    [0.48, 0.244, 0.128, 0.132, 0, 0.006, 2.4],
    [0.53, 0.178, 0.102, 0.108, 0, 0.002, 2.2],
    [0.56, 0.105, 0.084, 0.088, 0, 0.000, 2.0]
  ];
  const torsoGeo = createSculptedLoftGeometry(torsoSlices, 36, false, true, true);
  const torsoMesh = createHiFiMesh(torsoGeo, 0xffffff, 0.034, createKronosTorsoUVTexture());
  torso.add(torsoMesh);

  const vest = new THREE.Group();
  torso.add(vest);

  // High Popped Crimson Collar with Thick Metallic Gold Top Rim (wrapping Sides ±X and Back -Z, open at Front +Z)
  function buildKronosCollarArc(yBot, yTop, rScale, colorHex, outlineThick) {
    const segsU = 24;
    const pos = [];
    const ind = [];
    const openHalf = 0.42; // Open V at Front (+Z)
    for (let iv = 0; iv <= 1; iv++) {
      const y = iv === 0 ? yBot : yTop;
      const rx = (0.125 + iv * 0.032) * rScale;
      const rz = (0.102 + iv * 0.024) * rScale;
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
    if (outlineThick > 0) {
      m.add(new THREE.Mesh(g, createOutlineMaterial(outlineThick)));
    }
    return m;
  }

  const crimsonCollar = buildKronosCollarArc(0.51, 0.59, 1.0, VEST_RED, 0.028);
  vest.add(crimsonCollar);

  const goldCollarRim = buildKronosCollarArc(0.585, 0.618, 1.02, GOLD_TRIM, 0.026);
  vest.add(goldCollarRim);

  // --------------------------------------------------------------------------
  // 3. NECK DJ HEADPHONES, GOLD CURB CHAIN & PROPORTIONED GOLD VINYL MEDALLION
  // --------------------------------------------------------------------------
  // Black-and-Gold Studio DJ Headphones resting snugly around Neck inside Collar (y = 0.52..0.58)
  const hpGroup = new THREE.Group();
  hpGroup.position.set(0, 0.54, 0.01);
  torso.add(hpGroup);

  [-1, 1].forEach((side) => {
    const earcup = new THREE.Group();
    earcup.position.set(side * 0.092, 0.00, 0.082);
    earcup.rotation.set(0.28, side * 0.38, side * -0.35);

    const outerCan = createHiFiMesh(new THREE.CylinderGeometry(0.046, 0.046, 0.036, 18), 0x181a20, 0.026);
    outerCan.rotation.z = Math.PI * 0.5;
    earcup.add(outerCan);

    const goldRing = createHiFiMesh(new THREE.TorusGeometry(0.044, 0.0085, 10, 20), GOLD_TRIM, 0.020);
    goldRing.position.x = side * 0.018;
    goldRing.rotation.y = Math.PI * 0.5;
    earcup.add(goldRing);

    const cushion = createHiFiMesh(new THREE.CylinderGeometry(0.044, 0.044, 0.020, 18), 0x101216, 0.022);
    cushion.position.x = -side * 0.014;
    cushion.rotation.z = Math.PI * 0.5;
    earcup.add(cushion);

    hpGroup.add(earcup);
  });

  // Heavy V-Shaped Gold Curb Chain + Proportioned Gold Vinyl Record Medallion (radius = 0.062m at y = 0.31)
  // Positioned over upper pecs so all 3 rows of 6-pack abs remain 100% visible below!
  const medallionGroup = new THREE.Group();
  torso.add(medallionGroup);

  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.082, 0.52, 0.078),
    new THREE.Vector3(-0.056, 0.43, 0.128),
    new THREE.Vector3(0.000,  0.355, 0.140),
    new THREE.Vector3(0.056,  0.43, 0.128),
    new THREE.Vector3(0.082,  0.52, 0.078)
  ]);
  const goldChainTube = createHiFiMesh(new THREE.TubeGeometry(chainCurve, 20, 0.012, 8, false), GOLD_TRIM, 0.022);
  medallionGroup.add(goldChainTube);

  const vinylTex = createGoldVinylDiscTexture();
  const goldMedallion = new THREE.Group();
  goldMedallion.position.set(0, 0.305, 0.142); // y_world = 1.375m (Upper chest!)
  goldMedallion.rotation.x = -0.06;
  medallionGroup.add(goldMedallion);

  const bezel = createHiFiMesh(new THREE.TorusGeometry(0.060, 0.007, 10, 28), GOLD_TRIM, 0.024);
  goldMedallion.add(bezel);

  const discGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.012, 28);
  discGeo.rotateX(Math.PI * 0.5);
  const disc = createHiFiMesh(discGeo, 0xffffff, 0.022, vinylTex);
  goldMedallion.add(disc);

  // --------------------------------------------------------------------------
  // 4. SCULPTED HEAD, HIGH-TOP FLAT-TOP FADE, SUNGLASSES & CONTOURED GOATEE
  // --------------------------------------------------------------------------
  const neckSlices = [
    [0.52, 0.068, 0.066, 0.068, 0, 0.000, 2.0],
    [0.60, 0.062, 0.062, 0.064, 0, 0.004, 2.0],
    [0.66, 0.064, 0.064, 0.066, 0, 0.006, 2.0]
  ];
  const neckMesh = createHiFiMesh(createSculptedLoftGeometry(neckSlices, 24, false, false, false), SKIN_COLOR, 0.028);
  torso.add(neckMesh);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.71, 0.008); // y_world = 1.78m
  torso.add(headGroup);

  // Continuous Sculpted Chiseled Head + High-Top Flat-Top Fade Loft (y = -0.15m chin to +0.16m flat-top crown)
  // Total height reaches y_world = 1.94m with exact 1:1 head width (2 * rx = 0.176m)!
  const headAndHairSlices = [
    [-0.145, 0.044, 0.074, 0.042, 0, 0.026, 2.2], // Chiseled square chin & 3D goatee base (z_front = +0.100)
    [-0.115, 0.068, 0.090, 0.074, 0, 0.014, 2.2], // Strong jawline (z_front = +0.104)
    [-0.065, 0.082, 0.098, 0.088, 0, 0.006, 2.2], // Mouth / mustache level (z_front = +0.104)
    [-0.015, 0.086, 0.102, 0.096, 0, 0.002, 2.2], // Cheekbones / nose bridge
    [0.030,  0.086, 0.102, 0.098, 0, 0.000, 2.2], // Brow ridge / sunglasses level
    [0.075,  0.085, 0.100, 0.098, 0, -0.002, 2.3], // Forehead & temple skin-fade transition
    [0.125,  0.087, 0.102, 0.100, 0, -0.003, 2.4], // Vertical High-Top Flat-Top side walls
    [0.158,  0.088, 0.103, 0.100, 0, -0.003, 2.5], // Crisp razor-flat top crown rim
    [0.162,  0.082, 0.096, 0.094, 0, -0.003, 2.5]  // Flat top cap
  ];
  const headGeo = createSculptedLoftGeometry(headAndHairSlices, 36, false, true, true);
  const headMesh = createHiFiMesh(headGeo, 0xffffff, 0.032, createKronosHeadUVTexture());
  headGroup.add(headMesh);

  // Dark Matte Top Cap on Flat-Top Haircut so top of head is 100% ink-black from elevated angles
  const flatTopCapSlices = [
    [0.082, 0.086, 0.094, 0.101, 0, -0.005, 2.4],
    [0.158, 0.089, 0.104, 0.101, 0, -0.003, 2.5],
    [0.163, 0.083, 0.097, 0.095, 0, -0.003, 2.5]
  ];
  const flatTopCap = createHiFiMesh(createSculptedLoftGeometry(flatTopCapSlices, 32, false, false, true), 0x121216, 0.028);
  headGroup.add(flatTopCap);

  // 3D Sculpted Nose Bridge & Tip on Front (+Z) for crisp Side Profile silhouette (View 3)
  const noseSlices = [
    [-0.048, 0.004, 0.005, 0.004, 0, 0.000, 2.0],
    [-0.038, 0.016, 0.024, 0.006, 0, 0.008, 2.0],
    [-0.005, 0.010, 0.015, 0.005, 0, 0.004, 2.0],
    [0.015,  0.004, 0.005, 0.004, 0, 0.000, 2.0]
  ];
  const noseMesh = createHiFiMesh(createSculptedLoftGeometry(noseSlices, 12, false, true, true), SKIN_COLOR, 0.0);
  noseMesh.position.set(0, -0.012, 0.098);
  headGroup.add(noseMesh);

  // 3D Sculpted Goatee Chin Tip on Front (+Z) so the dark goatee projects cleanly in Side Profile (View 3)!
  const goateeChinSlices = [
    [-0.146, 0.026, 0.018, 0.008, 0, 0.004, 2.2],
    [-0.122, 0.032, 0.016, 0.008, 0, 0.004, 2.2],
    [-0.102, 0.024, 0.008, 0.006, 0, 0.000, 2.2]
  ];
  const goateeChinMesh = createHiFiMesh(createSculptedLoftGeometry(goateeChinSlices, 14, false, true, true), 0x121014, 0.0);
  goateeChinMesh.position.set(0, 0, 0.094);
  headGroup.add(goateeChinMesh);

  // 3D Sculpted Ears on Left (+X) & Right (-X)
  [-1, 1].forEach((side) => {
    const earSlices = [
      [-0.034, 0.009, 0.015, 0.015, 0, 0, 2.0],
      [-0.010, 0.016, 0.022, 0.022, side * 0.004, 0, 2.0],
      [0.018,  0.018, 0.024, 0.024, side * 0.005, 0, 2.0],
      [0.032,  0.010, 0.015, 0.015, 0, 0, 2.0]
    ];
    const ear = createHiFiMesh(createSculptedLoftGeometry(earSlices, 12, false, true, true), SKIN_COLOR, 0.024);
    ear.position.set(side * 0.086, -0.010, -0.004);
    headGroup.add(ear);
  });

  // SLEEK DARK-RIMMED WAYFARER SUNGLASSES WITH DIAGONAL LENS GLINTS (Views 1, 2, 3)
  const glassesGroup = new THREE.Group();
  glassesGroup.position.set(0, 0.010, 0.102);
  headGroup.add(glassesGroup);

  // Top & Bridge Frame Bar
  const topBar = createHiFiMesh(new THREE.BoxGeometry(0.178, 0.013, 0.016), 0x12141a, 0.022);
  topBar.position.y = 0.018;
  glassesGroup.add(topBar);

  [-1, 1].forEach((side) => {
    // Sleek tapered wayfarer lens rim
    const rim = createHiFiMesh(new THREE.BoxGeometry(0.074, 0.040, 0.015), 0x12141a, 0.022);
    rim.position.set(side * 0.045, 0.001, 0);
    rim.rotation.z = side * 0.05;
    glassesGroup.add(rim);

    // Dark Tinted Lens with Diagonal White Comic Glint
    const lens = createHiFiMesh(new THREE.BoxGeometry(0.064, 0.030, 0.017), 0x222936, 0.015);
    lens.position.set(side * 0.045, 0.001, 0.001);
    lens.rotation.z = side * 0.05;
    glassesGroup.add(lens);

    const glint = new THREE.Mesh(
      new THREE.PlaneGeometry(0.011, 0.028),
      new THREE.MeshBasicMaterial({ color: 0xd8e4f0, side: THREE.DoubleSide })
    );
    glint.position.set(side * 0.045 - 0.008, 0.001, 0.010);
    glint.rotation.z = -0.45;
    glassesGroup.add(glint);

    // Temple Arm extending back to the ear (clearly visible in Side Profile View 3!)
    const temple = createHiFiMesh(new THREE.BoxGeometry(0.010, 0.012, 0.106), 0x12141a, 0.020);
    temple.position.set(side * 0.086, 0.008, -0.052);
    glassesGroup.add(temple);
  });

  // --------------------------------------------------------------------------
  // 5. MUSCULAR BRONZE ARMS, FINGERLESS GLOVES & RIGHT-HAND (-X) VINTAGE CHROME MIC
  // --------------------------------------------------------------------------
  function buildKronosArm(side) {
    // Note: For Kronos (+Z front), side = -1 is Kronos's RIGHT arm (viewer's left in View 1, facing camera in View 3!)
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.248, 0.43, 0.00);

    // Sculpted Muscular Deltoid + Bicep/Tricep Loft in Warm Bronze Skin
    const upperArmSlices = [
      [-0.27, 0.068, 0.068, 0.068, 0, 0, 2.0], // Elbow joint
      [-0.19, 0.082, 0.084, 0.082, side * 0.006, 0.004, 2.1], // Muscular bicep peak
      [-0.09, 0.092, 0.090, 0.090, side * 0.010, 0.002, 2.1], // Deltoid insertion
      [-0.01, 0.096, 0.092, 0.092, side * 0.006, 0.000, 2.1], // Rounded shoulder cap
      [0.05,  0.068, 0.068, 0.068, 0, 0, 2.0]
    ];
    const upperArm = createHiFiMesh(createSculptedLoftGeometry(upperArmSlices, 22, false, true, true), SKIN_COLOR, 0.032);
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    // Muscular Bronze Forearm Loft (wide brachioradialis tapering to wrist)
    const forearmSlices = [
      [-0.23, 0.050, 0.048, 0.048, 0, 0, 2.0], // Wrist
      [-0.14, 0.064, 0.062, 0.062, side * 0.004, 0, 2.1], // Mid forearm
      [-0.05, 0.076, 0.074, 0.074, side * 0.006, 0, 2.1], // Muscular brachioradialis swell
      [0.02,  0.066, 0.066, 0.066, 0, 0, 2.0]
    ];
    const forearm = createHiFiMesh(createSculptedLoftGeometry(forearmSlices, 20, false, true, true), SKIN_COLOR, 0.030);
    elbow.add(forearm);

    // Black Tactical Wrist Strap Cuff
    const wristWrap = createHiFiMesh(new THREE.CylinderGeometry(0.056, 0.058, 0.056, 16), 0x181a22, 0.028);
    wristWrap.position.y = -0.225;
    elbow.add(wristWrap);

    // Black Fingerless Tactical Combat Glove with Exposed Bronze Fingers
    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);

    const glovePalm = createHiFiMesh(new THREE.BoxGeometry(0.086, 0.076, 0.052), 0x181a22, 0.028);
    hand.add(glovePalm);

    const knuckleGuard = createHiFiMesh(new THREE.BoxGeometry(0.082, 0.032, 0.018), 0x282c36, 0.022);
    knuckleGuard.position.set(0, 0.008, 0.026);
    hand.add(knuckleGuard);

    [-0.030, -0.010, 0.010, 0.030].forEach((fx) => {
      const fGlove = createHiFiMesh(new THREE.BoxGeometry(0.018, 0.024, 0.022), 0x181a22, 0.020);
      fGlove.position.set(fx, -0.036, 0.014);
      fGlove.rotation.x = -0.65;
      hand.add(fGlove);

      const fTip = createHiFiMesh(new THREE.BoxGeometry(0.017, 0.024, 0.020), SKIN_COLOR, 0.020);
      fTip.position.set(fx, -0.050, -0.004);
      fTip.rotation.x = -1.35;
      hand.add(fTip);
    });

    const thumbGlove = createHiFiMesh(new THREE.BoxGeometry(0.022, 0.028, 0.022), 0x181a22, 0.020);
    thumbGlove.position.set(-side * 0.044, -0.012, 0.016);
    thumbGlove.rotation.set(-0.35, -side * 0.35, -side * 0.35);
    hand.add(thumbGlove);

    const thumbTip = createHiFiMesh(new THREE.BoxGeometry(0.020, 0.022, 0.020), SKIN_COLOR, 0.020);
    thumbTip.position.set(-side * 0.048, -0.030, 0.004);
    hand.add(thumbTip);

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
  micGroup.position.set(0, -0.028, 0.00);
  micGroup.rotation.x = Math.PI * 0.5; // +Y of cylinder now points strictly along +Z (Forward)!
  leftArmObj.hand.add(micGroup);

  // Tapered Dark Charcoal Microphone Handle extending out the back (-Y in micGroup = -Z in world)
  const micHandle = createHiFiMesh(new THREE.CylinderGeometry(0.024, 0.016, 0.14, 16), 0x20242c, 0.024);
  micHandle.position.y = -0.05;
  micGroup.add(micHandle);

  const micTailTip = createHiFiMesh(new THREE.CylinderGeometry(0.016, 0.012, 0.028, 14), 0xb8c2cc, 0.020);
  micTailTip.position.y = -0.13;
  micGroup.add(micTailTip);

  // Ribbed Silver-Chrome Capsule Head extending out the front (+Y in micGroup = +Z in world)
  const micCapsuleGroup = new THREE.Group();
  micCapsuleGroup.position.y = 0.075;
  micGroup.add(micCapsuleGroup);

  const capsuleSlices = [
    [-0.048, 0.032, 0.032, 0.032, 0, 0, 2.0],
    [-0.020, 0.042, 0.042, 0.042, 0, 0, 2.0],
    [0.025,  0.042, 0.042, 0.042, 0, 0, 2.0],
    [0.052,  0.032, 0.032, 0.032, 0, 0, 2.0],
    [0.062,  0.018, 0.018, 0.018, 0, 0, 2.0]
  ];
  const micHead = createHiFiMesh(
    createSculptedLoftGeometry(capsuleSlices, 20, false, true, true),
    0xd8e0e8,
    0.026,
    null,
    0x000000,
    { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.5 }
  );
  micCapsuleGroup.add(micHead);

  // Ribbed Chrome Acoustic Ring Grooves around Capsule Head
  [-0.024, -0.004, 0.016, 0.036].forEach((ry) => {
    const rib = createHiFiMesh(new THREE.TorusGeometry(0.041, 0.0035, 8, 20), 0x181c22, 0.0);
    rib.position.y = ry;
    rib.rotation.x = Math.PI * 0.5;
    micCapsuleGroup.add(rib);
  });

  // Center Chrome Band around Capsule
  const centerBand = createHiFiMesh(new THREE.CylinderGeometry(0.044, 0.044, 0.014, 20), 0xf0f4f8, 0.020);
  centerBand.position.y = 0.006;
  micCapsuleGroup.add(centerBand);

  // --------------------------------------------------------------------------
  // 6. FULL-LENGTH BAGGY DARK-SLATE CARGO PANTS & BLACK/GOLD LACED COMBAT BOOTS
  // --------------------------------------------------------------------------
  const pantsLegTex = createKronosPantsLegUVTexture();

  function buildKronosLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.115, -0.05, 0); // Hip joint at y_world = 0.99m

    // Full Baggy Upper Thigh Loft in Dark Slate-Charcoal (#313e45) (y = 0.02 down to Knee at y = -0.37)
    const thighSlices = [
      [-0.38, 0.122, 0.116, 0.120, side * 0.012, 0.000, 2.2],
      [-0.25, 0.136, 0.126, 0.130, side * 0.016, 0.002, 2.2],
      [-0.12, 0.132, 0.122, 0.126, side * 0.010, 0.002, 2.2],
      [0.02,  0.118, 0.108, 0.114, 0.000,        0.000, 2.1]
    ];
    const thighMesh = createHiFiMesh(
      createSculptedLoftGeometry(thighSlices, 24, false, true, true),
      0xffffff,
      0.032,
      pantsLegTex
    );
    hipJoint.add(thighMesh);

    // Side Thigh Flapped Cargo Pocket (Views 1, 2, 3, 4)
    const pocketGroup = new THREE.Group();
    pocketGroup.position.set(side * 0.132, -0.20, 0.00);
    pocketGroup.rotation.z = side * -0.05;
    hipJoint.add(pocketGroup);

    const pocketBox = createHiFiMesh(new THREE.BoxGeometry(0.040, 0.165, 0.130), 0x263137, 0.028);
    pocketGroup.add(pocketBox);

    const pocketFlap = createHiFiMesh(new THREE.BoxGeometry(0.046, 0.040, 0.136), 0x2f3c43, 0.026);
    pocketFlap.position.y = 0.068;
    pocketGroup.add(pocketFlap);

    // Knee Joint at y = -0.37 (y_world = 0.62m)
    const kneeJoint = new THREE.Group();
    kneeJoint.position.set(side * 0.012, -0.37, 0);
    hipJoint.add(kneeJoint);

    // FULL-LENGTH BAGGY LOWER CARGO PANTS EXTENDING ALL THE WAY TO LOWER SHIN/ANKLE (y = -0.32 -> y_world = 0.30m!)
    // Matches reference sheet where 83% of leg height is baggy slate cargo pants tucked into ankle combat boots!
    const calfPantsSlices = [
      [-0.32, 0.078, 0.078, 0.080, 0, -0.004, 2.1], // Tucked into gold boot collar at y_world = 0.30m
      [-0.27, 0.122, 0.116, 0.122, side * 0.006, -0.004, 2.2], // Baggy bloused ankle overhang above boot!
      [-0.16, 0.130, 0.122, 0.128, side * 0.008, -0.002, 2.2], // Full baggy calf volume
      [-0.06, 0.126, 0.118, 0.124, side * 0.004, 0.000, 2.2],
      [0.02,  0.118, 0.112, 0.116, 0, 0.000, 2.1]
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

    // 1. Padded Metallic Gold Top Boot Collar Cuff (y = +0.04 to +0.10 -> y_world = 0.26m..0.32m)
    const goldCollarSlices = [
      [0.035, 0.072, 0.074, 0.076, 0, 0.000, 2.2],
      [0.095, 0.078, 0.080, 0.080, 0, 0.002, 2.2]
    ];
    const topGoldCollar = createHiFiMesh(createSculptedLoftGeometry(goldCollarSlices, 22, false, false, true), GOLD_TRIM, 0.028);
    footGroup.add(topGoldCollar);

    // 2. Sculpted Black Leather Combat Boot Shaft & Vamp (y = -0.18 to +0.045)
    const bootUpperSlices = [
      [-0.180, 0.080, 0.175, 0.092, 0, 0.000, 2.4],
      [-0.125, 0.074, 0.140, 0.088, 0, 0.000, 2.2],
      [-0.065, 0.066, 0.084, 0.080, 0, -0.004, 2.1],
      [0.045,  0.068, 0.070, 0.074, 0, -0.002, 2.1]
    ];
    const bootUpper = createHiFiMesh(createSculptedLoftGeometry(bootUpperSlices, 24, false, false, true), BOOT_BLACK, 0.030);
    footGroup.add(bootUpper);

    // 3. Cream-White Rubber Lug Outsole (y = -0.220 to -0.178 -> y_world = 0.00m..0.042m)
    const soleSlices = [
      [-0.220, 0.084, 0.184, 0.096, 0, 0, 2.5],
      [-0.178, 0.086, 0.186, 0.098, 0, 0, 2.5]
    ];
    const lugSole = createHiFiMesh(createSculptedLoftGeometry(soleSlices, 24, false, true, true), SOLE_WHITE, 0.030);
    footGroup.add(lugSole);

    // 4. Metallic Gold Side Welt Accent & Gold Heel Cup / Vertical Back Stripe (Views 1, 2, 3, 4)
    const goldWeltSlices = [
      [-0.178, 0.083, 0.165, 0.095, 0, 0, 2.4],
      [-0.152, 0.079, 0.155, 0.092, 0, 0, 2.3]
    ];
    const goldWelt = createHiFiMesh(createSculptedLoftGeometry(goldWeltSlices, 24, false, false, false), GOLD_TRIM, 0.022);
    footGroup.add(goldWelt);

    // View 4 Metallic Gold Heel Counter Cup & Vertical Rear Stripe (-Z)
    const goldHeelCupSlices = [
      [-0.178, 0.078, 0.010, 0.095, 0, 0, 2.3],
      [-0.095, 0.068, 0.010, 0.086, 0, -0.002, 2.2]
    ];
    const goldHeelCup = createHiFiMesh(createSculptedLoftGeometry(goldHeelCupSlices, 18, false, false, true), GOLD_TRIM, 0.024);
    footGroup.add(goldHeelCup);

    const goldBackStrip = createHiFiMesh(new THREE.BoxGeometry(0.028, 0.15, 0.016), GOLD_TRIM, 0.020);
    goldBackStrip.position.set(0, -0.02, -0.078);
    footGroup.add(goldBackStrip);

    // 5. Front Gold Eyestay Trim & 5 Criss-Cross Metallic Gold X-Laces (+Z) (Views 1 & 2)
    [-1, 1].forEach((s) => {
      const eyestay = createHiFiMesh(new THREE.BoxGeometry(0.018, 0.16, 0.020), GOLD_TRIM, 0.018);
      eyestay.position.set(s * 0.032, -0.025, 0.074);
      eyestay.rotation.x = 0.28;
      footGroup.add(eyestay);
    });

    for (let l = 0; l < 5; l++) {
      const ly = 0.032 - l * 0.028;
      const lz = 0.068 + l * 0.010;
      [-1, 1].forEach((diag) => {
        const xLace = createHiFiMesh(new THREE.BoxGeometry(0.062, 0.009, 0.012), GOLD_TRIM, 0.014);
        xLace.position.set(0, ly, lz);
        xLace.rotation.set(0.28, 0, diag * 0.34);
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
// ENHANCED HYPE-CREW BRUISER PROCEDURAL 3D MODEL
// Distinct Brawler Outfits, White Athletic Forearm Taping & Full Articulation
// ============================================================================

export function buildBruiserModel(idx = 0) {
  const root = new THREE.Group();
  root.scale.setScalar(0.96); // Imposing athletic brawler mass

  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  // Distinct Brawler Palettes matching antagonists turnaround sheet
  const skinColor = idx === 0 ? 0xc6865e : 0x8d5534;
  const pantsColor = 0x1c1e26; // Dark combat cargo trousers
  const vestColor = 0x14141a;  // Black leather biker vest

  // 1. Muscular Brawler Torso with Spiked Biker Leather Vest & Crimson Chest Wrap
  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);

  // Bare Muscular Chest / Core
  const chest = createHiFiMesh(new THREE.CylinderGeometry(0.27, 0.23, 0.68, 14), skinColor, 0.045);
  chest.scale.set(1.18, 1.0, 0.70);
  chest.position.y = 0.34;
  torso.add(chest);

  // Diagonal Crimson Fabric Chest Wrap Band across Core
  const chestWrap = createHiFiMesh(new THREE.CylinderGeometry(0.275, 0.235, 0.26, 14), 0xa82020, 0.04);
  chestWrap.scale.set(1.19, 1.0, 0.71);
  chestWrap.position.y = 0.38;
  chestWrap.rotation.z = 0.12;
  torso.add(chestWrap);

  // Open Black Leather Biker Vest with Popped Collar
  const vestGeo = new THREE.CylinderGeometry(0.31, 0.27, 0.66, 14, 1, true, Math.PI * 0.25, Math.PI * 1.5);
  const vest = createHiFiMesh(vestGeo, vestColor, 0.045);
  vest.scale.set(1.22, 1.0, 0.74);
  vest.position.y = 0.34;
  torso.add(vest);

  // Spiked Shoulder Epaulets (Silver Cones on both shoulders)
  [-1, 1].forEach((side) => {
    [-0.04, 0.04].forEach((sz) => {
      const spike = createHiFiMesh(
        new THREE.ConeGeometry(0.032, 0.09, 6),
        0xdce0ea,
        0.03,
        null,
        0x000000,
        { isMetallic: true, glintThreshold: 0.85, glintIntensity: 1.8 }
      );
      spike.position.set(side * 0.38, 0.71, sz);
      spike.rotation.set(0, 0, side * -0.35);
      torso.add(spike);
    });
  });

  // Silver Belt Buckle at Waist
  const buckle = createHiFiMesh(new THREE.BoxGeometry(0.09, 0.06, 0.035), 0xdce0ea, 0.04);
  buckle.position.set(0, 0.02, 0.18);
  hips.add(buckle);

  // 2. Sculpted Head with Spiky Dark Mohawk Crest & Angry Anime Features
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.88;
  torso.add(headGroup);

  const head = createHiFiMesh(new THREE.SphereGeometry(0.20, 14, 12), skinColor, 0.05);
  headGroup.add(head);

  // Spiky Mohawk Crest along Midline (Front to Back)
  const mohawkGroup = new THREE.Group();
  headGroup.add(mohawkGroup);

  const mohawkSpikes = [
    { z: 0.14, h: 0.16, r: 0.04, tilt: 0.25 },
    { z: 0.07, h: 0.22, r: 0.045, tilt: 0.12 },
    { z: 0.00, h: 0.24, r: 0.048, tilt: 0.0 },
    { z: -0.07, h: 0.20, r: 0.045, tilt: -0.12 },
    { z: -0.13, h: 0.15, r: 0.04, tilt: -0.25 }
  ];
  mohawkSpikes.forEach(({ z, h, r, tilt }) => {
    const spike = createHiFiMesh(new THREE.ConeGeometry(r, h, 6), 0x2a1a14, 0.04);
    spike.position.set(0, 0.18 + h * 0.4, z);
    spike.rotation.x = tilt;
    mohawkGroup.add(spike);
  });

  // Angry Furrowed Eyebrows on Front (+Z)
  [-0.065, 0.065].forEach((bx) => {
    const brow = createHiFiMesh(new THREE.BoxGeometry(0.065, 0.025, 0.02), 0x1f140f, 0.03);
    brow.position.set(bx, 0.05, 0.19);
    brow.rotation.z = (bx < 0 ? -0.22 : 0.22);
    headGroup.add(brow);
  });

  // 3. Two-Segment Articulated Arms with Striped Brawler Boxing Wraps
  function buildBruiserArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.38, 0.64, 0);

    const bicep = createHiFiMesh(new THREE.CylinderGeometry(0.125, 0.11, 0.34, 12), skinColor, 0.045);
    bicep.position.y = -0.17;
    shoulder.add(bicep);

    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);

    // Striped Black-and-White Forearm Boxing Wraps
    const wrapGeo = new THREE.CylinderGeometry(0.108, 0.092, 0.32, 12);
    const forearm = createHiFiMesh(wrapGeo, 0x1c1b22, 0.045);
    forearm.position.y = -0.16;
    elbow.add(forearm);

    // White wrap stripes
    [-0.08, -0.16, -0.24].forEach((wy) => {
      const stripe = createHiFiMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 12), 0xedeae2, 0.035);
      stripe.position.y = wy;
      elbow.add(stripe);
    });

    // Clenched Brawler Combat Hand with Articulated Fingers
    const hand = new THREE.Group();
    hand.position.y = -0.36;
    elbow.add(hand);

    const palm = createHiFiMesh(new THREE.BoxGeometry(0.13, 0.11, 0.11), 0x16151c, 0.045);
    hand.add(palm);

    [-0.04, -0.013, 0.013, 0.04].forEach((fx) => {
      const f = createHiFiMesh(new THREE.BoxGeometry(0.026, 0.042, 0.03), 0x24222a, 0.03);
      f.position.set(fx, -0.04, 0.045);
      f.rotation.x = 0.55;
      hand.add(f);
    });
    const thumb = createHiFiMesh(new THREE.BoxGeometry(0.032, 0.04, 0.03), 0x24222a, 0.03);
    thumb.position.set(-side * 0.06, -0.01, 0.025);
    hand.add(thumb);

    return { shoulder, elbow, fist: hand, hand };
  }

  const leftArmObj = buildBruiserArm(-1);
  const rightArmObj = buildBruiserArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // 4. Two-Segment Articulated Legs with Rounded Knee Pads & Heavy Boots
  function buildBruiserLeg(side) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.18, 0, 0);

    const thigh = createHiFiMesh(new THREE.CylinderGeometry(0.17, 0.14, 0.48, 12), pantsColor, 0.045);
    thigh.position.y = -0.24;
    hipJoint.add(thigh);

    // Outer-thigh cargo flap pocket
    const cargoPocket = createHiFiMesh(new THREE.BoxGeometry(0.08, 0.18, 0.16), 0x14161f, 0.04);
    cargoPocket.position.set(side * 0.15, -0.22, 0);
    hipJoint.add(cargoPocket);

    const kneeJoint = new THREE.Group();
    kneeJoint.position.y = -0.48;
    hipJoint.add(kneeJoint);

    // Oval Grey Protective Knee Pad Strapped over Knee
    const kneePad = createHiFiMesh(new THREE.BoxGeometry(0.16, 0.14, 0.06), 0x4e505e, 0.04);
    kneePad.position.set(0, 0.02, 0.12);
    kneeJoint.add(kneePad);

    const kneeStrap = createHiFiMesh(new THREE.CylinderGeometry(0.138, 0.138, 0.04, 12), 0x121216, 0.035);
    kneeStrap.position.set(0, 0.02, 0);
    kneeJoint.add(kneeStrap);

    const calf = createHiFiMesh(new THREE.CylinderGeometry(0.14, 0.12, 0.38, 12), pantsColor, 0.045);
    calf.position.y = -0.18;
    kneeJoint.add(calf);

    // Heavy Laced Brawler Combat Boot
    const boot = new THREE.Group();
    boot.position.set(0, -0.44, 0.02);
    kneeJoint.add(boot);

    const sole = createHiFiMesh(new THREE.BoxGeometry(0.24, 0.09, 0.44), 0x0c0b0e, 0.05);
    sole.position.y = -0.04;
    boot.add(sole);

    const upper = createHiFiMesh(new THREE.BoxGeometry(0.22, 0.16, 0.36), 0x18171f, 0.05);
    upper.position.set(0, 0.07, 0.03);
    boot.add(upper);

    return { hipJoint, kneeJoint, boot };
  }

  const leftLegObj = buildBruiserLeg(-1);
  const rightLegObj = buildBruiserLeg(1);
  hips.add(leftLegObj.hipJoint);
  hips.add(rightLegObj.hipJoint);

  return {
    rig: {
      root,
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

// ============================================================================
// ENHANCED CHEERING CROWD SPECTATOR PROCEDURAL 3D MODEL
// 6 Streetwear Styles, Accessories (Caps, Shades), Sneakers & Articulated Arms
// ============================================================================

let spectatorCounter = 0;

export function buildSpectatorModel(
  shirtHex = 0x38b6ff,
  pantsHex = 0x242a38,
  skinHex = 0xd89c74,
  styleIdx = null
) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 1.0;
  root.add(hips);

  const style = styleIdx !== null ? (styleIdx % 6) : (spectatorCounter++ % 6);

  // 1. Torso Geometry with Streetwear Styles (V-Neck, Hoodie, Tank Top, Jackets)
  const torso = new THREE.Group();
  torso.position.y = 0.04;
  hips.add(torso);

  const torsoBody = createHiFiMesh(new THREE.CylinderGeometry(0.25, 0.21, 0.68, 12), shirtHex, 0.045);
  torsoBody.scale.set(1.10, 1.0, 0.68);
  torsoBody.position.y = 0.34;
  torso.add(torsoBody);

  if (style === 1) {
    // Deep V-Neck Party Shirt (Matches screenshot guy raising arms)
    const vCut = createHiFiMesh(new THREE.ConeGeometry(0.12, 0.22, 4), skinHex, 0.03);
    vCut.position.set(0, 0.58, 0.18);
    vCut.rotation.set(0.15, 0, Math.PI);
    torso.add(vCut);
  } else if (style === 3) {
    // Streetwear Hoodie: Sculpted Hood Ring around Neck
    const hoodRing = createHiFiMesh(new THREE.TorusGeometry(0.22, 0.055, 8, 18), shirtHex, 0.04);
    hoodRing.position.set(0, 0.70, -0.04);
    hoodRing.rotation.x = Math.PI * 0.4;
    torso.add(hoodRing);
  }

  // 2. Sculpted Head with Varied Hair, Baseball Caps & Sunglasses
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.86;
  torso.add(headGroup);

  const head = createHiFiMesh(new THREE.SphereGeometry(0.19, 14, 12), skinHex, 0.05);
  headGroup.add(head);

  if (style === 0 || style === 4) {
    // Backward or Forward Baseball Cap
    const cap = createHiFiMesh(new THREE.SphereGeometry(0.20, 12, 10), shirtHex, 0.045);
    cap.position.set(0, 0.06, 0);
    headGroup.add(cap);

    const visor = createHiFiMesh(new THREE.BoxGeometry(0.20, 0.025, 0.14), shirtHex, 0.04);
    visor.position.set(0, 0.04, style === 0 ? -0.21 : 0.21);
    headGroup.add(visor);
  } else if (style === 2) {
    // Rave Sunglasses / Wrap-Around Shades
    const shades = createHiFiMesh(new THREE.BoxGeometry(0.24, 0.06, 0.10), 0x0c0b10, 0.04);
    shades.position.set(0, 0.03, 0.16);
    headGroup.add(shades);
  } else {
    // Tousled Hair Clumps
    const hair = createHiFiMesh(new THREE.SphereGeometry(0.205, 12, 10), 0x221814, 0.05);
    hair.position.set(0, 0.06, 0.02);
    headGroup.add(hair);
  }

  // 3. Two-Segment Articulated Cheering Arms with Hands
  function buildSpectatorArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.32, 0.62, 0);

    const armColor = style === 2 ? skinHex : shirtHex; // Sleeveless tank vs sleeved tee
    const upperArm = createHiFiMesh(new THREE.CylinderGeometry(0.085, 0.075, 0.32, 10), armColor, 0.045);
    upperArm.position.y = -0.16;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    shoulder.add(elbow);

    const forearm = createHiFiMesh(new THREE.CylinderGeometry(0.075, 0.065, 0.28, 10), skinHex, 0.045);
    forearm.position.y = -0.14;
    elbow.add(forearm);

    // Cheering Hand / Clenched Fist
    const hand = createHiFiMesh(new THREE.SphereGeometry(0.075, 10, 8), skinHex, 0.045);
    hand.position.y = -0.30;
    elbow.add(hand);

    return { shoulder, elbow, hand };
  }

  const leftArmObj = buildSpectatorArm(-1);
  const rightArmObj = buildSpectatorArm(1);
  torso.add(leftArmObj.shoulder);
  torso.add(rightArmObj.shoulder);

  // 4. Legs with Cargo/Jeans & Street High-Top Sneakers
  [-0.13, 0.13].forEach((lx) => {
    const leg = createHiFiMesh(new THREE.CylinderGeometry(0.10, 0.08, 0.88, 10), pantsHex, 0.045);
    leg.position.set(lx, -0.44, 0);
    hips.add(leg);

    // Street Sneaker (White Sole + Colored Upper)
    const shoe = new THREE.Group();
    shoe.position.set(lx, -0.88, 0.04);
    hips.add(shoe);

    const sole = createHiFiMesh(new THREE.BoxGeometry(0.19, 0.07, 0.34), 0xf7f5f0, 0.04);
    sole.position.y = -0.035;
    shoe.add(sole);

    const upper = createHiFiMesh(new THREE.BoxGeometry(0.17, 0.12, 0.28), shirtHex, 0.04);
    upper.position.set(0, 0.05, 0.02);
    shoe.add(upper);
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

function createBrassInteriorTexture() {
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
  return _lightPoolTex;
}

export function createFlightCase(w = 1.1, h = 0.85, d = 0.85, color = 0x181820, stencilText = 'KRONOS SOUND') {
  const caseGroup = new THREE.Group();
  const mainBox = createHiFiMesh(new THREE.BoxGeometry(w, h, d), color, 0.035);
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
        const ball = createHiFiMesh(new THREE.SphereGeometry(cornerR, 8, 8), 0xdce2ec, 0.02, null, 0x000000, {
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

  const basePlinth = createHiFiMesh(new THREE.BoxGeometry(w, 0.28, d), 0x828792, 0.038, tex);
  basePlinth.position.y = 0.14;
  barrierGroup.add(basePlinth);

  const midSlope = createHiFiMesh(new THREE.BoxGeometry(w, 0.22, d * 0.70), 0x828792, 0.035, tex);
  midSlope.position.y = 0.39;
  barrierGroup.add(midSlope);

  const stem = createHiFiMesh(new THREE.BoxGeometry(w, 0.38, d * 0.38), 0x828792, 0.035, tex);
  stem.position.y = 0.69;
  barrierGroup.add(stem);

  const cap = createHiFiMesh(new THREE.CylinderGeometry(d * 0.19, d * 0.19, w, 10), 0x7a808c, 0.03);
  cap.rotation.z = Math.PI / 2;
  cap.position.y = 0.88;
  barrierGroup.add(cap);

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
  const stageBase = createHiFiMesh(new THREE.BoxGeometry(8.6, 1.35, 3.2), 0x1c1830, 0.03);
  stageBase.position.set(0, 0.68, 0);
  soundRigGroup.add(stageBase);

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

    const strutRod = createHiFiMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 8), 0xdce2ec, 0.02);
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
          const cornerCap = createHiFiMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), 0xf5b942, 0.02);
          cornerCap.position.set(side * -0.35 + cx, 0.95 + cy, 0.92 + cz);
          wing.add(cornerCap);
        });
      });
    });

    // Gold Script Logo Plaque
    const logoBadge = createHiFiMesh(new THREE.BoxGeometry(0.32, 0.08, 0.02), 0xf5b942, 0.015);
    logoBadge.position.set(side * -0.35, 1.32, 1.28);
    wing.add(logoBadge);

    // B. Amplifier Head Unit mounted atop 4x12
    const ampHead = createHiFiMesh(new THREE.BoxGeometry(1.22, 0.44, 0.58), 0x16161c, 0.03);
    ampHead.position.set(side * -0.35, 1.88, 0.88);
    wing.add(ampHead);

    const facePlate = createHiFiMesh(new THREE.BoxGeometry(1.12, 0.28, 0.02), 0xf0c038, 0.02);
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

    wing.add(smallW);
    wooferCones.push(smallW);

    // 4. Heavy-Duty Dual Hydraulic Actuators propping the wing boom arm
    [0.45, 1.85].forEach((py) => {
      const cylOuter = createHiFiMesh(new THREE.CylinderGeometry(0.085, 0.085, 1.1, 10), 0xf5b942, 0.03);
      cylOuter.rotation.z = side * 0.48;
      cylOuter.rotation.y = side * 0.35;
      cylOuter.position.set(side * -0.95, py - 1.2, -0.15);
      wing.add(cylOuter);

      const pistonRod = createHiFiMesh(new THREE.CylinderGeometry(0.048, 0.048, 1.0, 10), 0xdce2ec, 0.025);
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
  const brassMat = createMetallicCelMaterial(0xffdf6b, brassTex, 0x000000, {
    glintThreshold: 0.86,
    glintIntensity: 1.8
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
      0xdce2ec,
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

      const pistonRod = createHiFiMesh(new THREE.CylinderGeometry(0.048, 0.048, 0.95, 10), 0xdce2ec, 0.025);
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
  const volConeGeo = new THREE.CylinderGeometry(0.18, 2.6, 9.2, 24, 1, true);
  volConeGeo.rotateX(Math.PI / 2);

  const poolGeo = new THREE.PlaneGeometry(3.1, 2.2);
  poolGeo.rotateX(-Math.PI / 2);
  const poolTex = createLightPoolTexture();

  [-3.6, -2.2, -0.9, 0.9, 2.2, 3.6].forEach((sx, sIdx) => {
    const canGroup = new THREE.Group();
    canGroup.position.set(sx, 6.62, 1.08);
    canGroup.rotation.x = 0.42;
    canGroup.rotation.y = -sx * 0.04; // subtle inward splay
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

    // Volumetric Additive-Blended Spotlight Beam Cone
    const coneMat = new THREE.MeshBasicMaterial({
      color: spotColors[sIdx],
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const coneMesh = new THREE.Mesh(volConeGeo, coneMat);
    coneMesh.position.z = 4.6;
    canGroup.add(coneMesh);

    // Projected Elliptical Light Pool on Asphalt Floor
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex,
      color: spotColors[sIdx],
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.position.set(sx * 1.08, 0.025, 4.3);
    soundRigGroup.add(poolMesh);
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

  const tapeGeo = new THREE.CylinderGeometry(0.054, 0.054, 0.12, 12);
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xf5c211 });

  cablePaths.forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.045, 10, false);
    const cableMesh = createHiFiMesh(tubeGeo, 0x141418, 0.03);
    cableGroup.add(cableMesh);

    // Yellow electrical hazard tape wraps spaced every ~1.5m along cable
    const totalLength = curve.getLength();
    const numWraps = Math.floor(totalLength / 1.4);
    for (let w = 1; w <= numWraps; w++) {
      const u = (w * 1.4) / totalLength;
      if (u >= 0.96) continue;
      const pt = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);

      const tape = new THREE.Mesh(tapeGeo, tapeMat);
      tape.position.copy(pt);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      tape.quaternion.copy(quat);
      cableGroup.add(tape);
    }
  });

  // Industrial Rubber Cable Bridge Ramps with Yellow Reflective Lids
  const rampSpecs = [
    { pos: [-1.8, 0.025, -2.1], rotY: 0.55 },
    { pos: [-4.2, 0.025, -0.1], rotY: 0.65 },
    { pos: [-6.2, 0.025, 2.1], rotY: 0.72 },
    { pos: [5.8, 0.025, -2.4], rotY: -0.52 },
    { pos: [7.2, 0.025, 0.2], rotY: -0.42 }
  ];

  rampSpecs.forEach(({ pos, rotY }) => {
    const rampGroup = new THREE.Group();
    rampGroup.position.set(...pos);
    rampGroup.rotation.y = rotY;

    // Sloped black rubber base
    const baseRamp = createHiFiMesh(new THREE.BoxGeometry(0.48, 0.055, 0.95), 0x16161a, 0.035);
    baseRamp.position.y = 0.028;
    rampGroup.add(baseRamp);

    // Yellow reflective hazard top lid
    const hazardLid = createHiFiMesh(new THREE.BoxGeometry(0.38, 0.012, 0.88), 0xf5c211, 0.02);
    hazardLid.position.y = 0.058;
    rampGroup.add(hazardLid);

    // Hazard stripes across lid
    for (let s = -0.32; s <= 0.32; s += 0.16) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06, 0.34),
        new THREE.MeshBasicMaterial({ color: 0x121216 })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.065, s);
      rampGroup.add(stripe);
    }

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
  building.position.set(-10.2, 0, -2.6);
  building.rotation.y = 1.15; // Angled facing southeast into arena courtyard and Orbit View

  const brickTex = createBrickWarehouseTexture();

  // 1. Main Two-Story Warehouse Facade (11.2m x 8.8m x 4.6m) with Running-Bond Brickwork
  // Use 0xffffff color with warm emissive so running-bond terracotta brickwork is vivid
  const mainFacade = createHiFiMesh(new THREE.BoxGeometry(11.2, 8.8, 4.6), 0xffffff, 0.038, brickTex, 0x28140e);
  mainFacade.position.set(0, 4.4, 0);
  building.add(mainFacade);

  // Roof Concrete Coping Parapet with Weathered Stone Trim
  const roofParapet = createHiFiMesh(new THREE.BoxGeometry(11.5, 0.42, 4.8), 0x555866, 0.04);
  roofParapet.position.set(0, 8.8, 0);
  building.add(roofParapet);

  // 2. Far-Left Industrial Waste Dumpster Container (Component 1/6)
  const dumpster = createHiFiMesh(new THREE.BoxGeometry(1.6, 1.1, 1.2), 0x243e2e, 0.035);
  dumpster.position.set(-4.5, 0.55, 2.75);
  building.add(dumpster);
  const dumpsterLid = createHiFiMesh(new THREE.BoxGeometry(1.65, 0.12, 1.25), 0x18241c, 0.03);
  dumpsterLid.position.set(-4.5, 1.14, 2.75);
  building.add(dumpsterLid);

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
    { shirt: 0xff2a85, pants: 0x1a1a24, skin: 0xd89c74 },
    { shirt: 0x00f0ff, pants: 0x222636, skin: 0x8d5534 },
    { shirt: 0xffd700, pants: 0x181a22, skin: 0xf0c8a0 },
    { shirt: 0x2ef064, pants: 0x2b2438, skin: 0xa86c48 },
    { shirt: 0xff6b00, pants: 0x1e202c, skin: 0xe0b088 },
    { shirt: 0x9d4edd, pants: 0x141620, skin: 0xd89c74 },
    { shirt: 0xd92424, pants: 0x252a3a, skin: 0x8d5534 }
  ];

  const balconySpectators = [-0.6, 0.1, 0.8, 1.5, 2.2, 2.9, 3.5].map((bx, idx) => {
    const col = spectatorColors[idx % spectatorColors.length];
    const spec = buildSpectatorModel(col.shirt, col.pants, col.skin);
    spec.root.scale.setScalar(0.82);
    spec.root.position.set(bx, 3.98, 3.75);
    spec.root.rotation.y = 0.05 * (idx - 3);
    spec.torso.rotation.x = 0.22;
    spec.leftArm.rotation.x = -1.15;
    spec.rightArm.rotation.x = -1.05 - (idx % 2) * 0.45;
    building.add(spec.root);
    return spec;
  });

  scene.add(building);
  return { building, balconySpectators };
}

// ----------------------------------------------------------------------------
// EAST ARCHITECTURE: ELEVATED SUBWAY VIADUCT ARCHES & OVERHEAD RAILROAD
// ----------------------------------------------------------------------------
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
      const pier = createHiFiMesh(new THREE.BoxGeometry(1.2, 4.4, 3.2), 0xffffff, 0.04, brickTex, 0x24120c);
      pier.position.set(px, 2.2, 0);
      archGroup.add(pier);

      // Stone Plinth Base
      const plinth = createHiFiMesh(new THREE.BoxGeometry(1.35, 0.48, 3.35), 0x4a4852, 0.04);
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
    new THREE.Vector3(-1.2, 7.2, -9.2),
    new THREE.Vector3(1.6, 7.2, -8.6),
    new THREE.Vector3(5.2, 7.2, -7.8),
    new THREE.Vector3(8.6, 7.2, -5.8),
    new THREE.Vector3(11.0, 7.2, -1.8),
    new THREE.Vector3(11.8, 7.2, 2.4)
  ];
  const trackCurve = new THREE.CatmullRomCurve3(trackSplinePts);

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
  const tieColor = 0x241c16; // Creosote dark wood

  for (let t = 0; t <= numTies; t++) {
    const u = t / numTies;
    const pt = trackCurve.getPoint(u);
    const tangent = trackCurve.getTangent(u);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const tieMesh = createHiFiMesh(tieGeo, tieColor, 0.03);
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
  const cornerWall = createHiFiMesh(new THREE.BoxGeometry(6.2, 9.4, 4.2), 0xffffff, 0.04, brickTex, 0x24120c);
  cornerWall.position.set(0, 4.7, 0);
  cornerGroup.add(cornerWall);

  // Roof Parapet
  const cornerParapet = createHiFiMesh(new THREE.BoxGeometry(6.5, 0.38, 4.4), 0x555866, 0.04);
  cornerParapet.position.set(0, 9.4, 0);
  cornerGroup.add(cornerParapet);

  // Ground Floor Shopfront Display Window with Warm Golden Interior Glow
  const shopWin = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 2.6),
    new THREE.MeshBasicMaterial({ color: 0x221a10 })
  );
  shopWin.position.set(0, 1.6, 2.14);
  cornerGroup.add(shopWin);

  const shopWinGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.4),
    new THREE.MeshBasicMaterial({ color: 0xffb836, transparent: true, opacity: 0.35 })
  );
  shopWinGlow.position.set(0, 1.6, 2.16);
  cornerGroup.add(shopWinGlow);

  const shopFrame = createHiFiMesh(new THREE.BoxGeometry(3.8, 2.8, 0.12), 0x181a24, 0.03);
  shopFrame.position.set(0, 1.6, 2.12);
  cornerGroup.add(shopFrame);

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
  });

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
  const archPillarL = createHiFiMesh(new THREE.BoxGeometry(0.55, 6.4, 0.55), 0x3a3f55, 0.04);
  archPillarL.position.set(-4.2, 3.2, 0);
  group.add(archPillarL);

  const archPillarR = createHiFiMesh(new THREE.BoxGeometry(0.55, 6.4, 0.55), 0x3a3f55, 0.04);
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
  });

  // 2. Customized Sound-Crew Step-Van / Lowrider with Glowing Headlights
  const vanGroup = new THREE.Group();
  vanGroup.position.set(1.5, 0, 1.2);
  vanGroup.rotation.y = Math.PI - 0.18; // Angled facing inward towards the cypher ring!

  // Van Chassis & Body
  const vanBody = createHiFiMesh(new THREE.BoxGeometry(2.3, 2.1, 4.6), 0x1e2230, 0.05);
  vanBody.position.y = 1.35;
  vanGroup.add(vanBody);

  const vanCab = createHiFiMesh(new THREE.BoxGeometry(2.25, 1.6, 1.8), 0x24283b, 0.05);
  vanCab.position.set(0, 1.15, 2.3);
  vanGroup.add(vanCab);

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
  [-0.82, 0.82].forEach((hx) => {
    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xffea78 })
    );
    headlight.position.set(hx, 0.85, 3.24);
    vanGroup.add(headlight);

    // Subtle volumetric headlight beam shining into asphalt ring
    const beamGeo = new THREE.ConeGeometry(1.2, 4.5, 16, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff099,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(hx, 0.82, 5.5);
    vanGroup.add(beam);
  });

  group.add(vanGroup);

  // 3. Flanking Brick Apartment Facades with Fire Escapes (South-West and South-East)
  [-7.2, 7.2].forEach((bx, idx) => {
    const apt = createHiFiMesh(new THREE.BoxGeometry(5.2, 9.8, 3.8), 0x4a241b, 0.05);
    apt.position.set(bx, 4.9, 1.2);
    apt.rotation.y = idx === 0 ? 0.32 : -0.32;
    group.add(apt);

    // Fire escape platforms
    for (let f = 1; f <= 3; f++) {
      const escapeFloor = createHiFiMesh(new THREE.BoxGeometry(2.4, 0.1, 0.9), 0x14141a, 0.04);
      escapeFloor.position.set(bx * 0.9, f * 2.5, 3.2);
      group.add(escapeFloor);
    }
  });

  // 4. Modular Concrete Jersey Barriers (K-Rails) with Reflective Hazard Stripes along Courtyard Perimeter
  // Positioned at z = -3.4 in group space (world z = 8.0m, r >= 8.0m > 7.8m ACTION CAM clearance)
  [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5].forEach((jx) => {
    const barrier = createJerseyBarrier(2.1, 0.88, 0.58);
    barrier.position.set(jx, 0, -3.4);
    group.add(barrier);
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
    { shirt: 0xff2a85, pants: 0x1a1a24, skin: 0xd89c74 },
    { shirt: 0x00f0ff, pants: 0x222636, skin: 0x8d5534 },
    { shirt: 0xffd700, pants: 0x181a22, skin: 0xf0c8a0 },
    { shirt: 0x2ef064, pants: 0x2b2438, skin: 0xa86c48 },
    { shirt: 0xff6b00, pants: 0x1e202c, skin: 0xe0b088 }
  ];

  barricadeAngles.forEach((ang, idx) => {
    const r = 6.8;
    const bar = createSteelBarricadeUnit();
    bar.position.set(Math.sin(ang) * r, 0, -Math.cos(ang) * r + 0.5);
    bar.lookAt(0, 0, 1.5);
    scene.add(bar);

    // Cheering Crowd Spectator behind every other barricade unit
    if (idx % 2 === 0) {
      const col = specColors[idx % specColors.length];
      const spec = buildSpectatorModel(col.shirt, col.pants, col.skin);
      spec.root.scale.setScalar(0.85);
      const specR = r + 0.55;
      spec.root.position.set(Math.sin(ang) * specR, 0, -Math.cos(ang) * specR + 0.5);
      spec.root.lookAt(0, 0, 1.5);
      spec.torso.rotation.x = 0.15;
      spec.leftArm.rotation.x = -1.05 - (idx % 3) * 0.35;
      spec.rightArm.rotation.x = -1.25 + (idx % 2) * 0.25;
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

  // 9. Update Arena Floor Mesh with Weathered Asphalt & Graffiti Texture
  const asphaltTex = createWeatheredAsphaltArenaTexture();
  scene.traverse((obj) => {
    if (obj.geometry && obj.geometry.type === 'CircleGeometry' && obj.geometry.parameters && obj.geometry.parameters.radius >= 20) {
      if (obj.material) {
        obj.material.map = asphaltTex;
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

