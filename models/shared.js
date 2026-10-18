import * as THREE from 'three';

// ============================================================================
// 1. HI-FI RUSH / DEAD AS DISCO CEL-SHADER + HALFTONE + INVERSE-HULL OUTLINES
// ============================================================================
function createSteppedGradientMap() {
  const data = new Uint8Array([46, 158, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export const toonGradientMap = createSteppedGradientMap();

const outlineMaterialCache = new Map();

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
        vec4 localPos = vec4( position, 1.0 );
        vec3 localNormal = normal;
        #ifdef USE_INSTANCING
          localPos = instanceMatrix * localPos;
          localNormal = mat3( instanceMatrix ) * localNormal;
        #endif
        vec4 mvPosition = modelViewMatrix * localPos;
        vec3 mvNormal = normalize( normalMatrix * localNormal );
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

const basicMaterialCache = new Map();

export function getSharedBasicMaterial(colorHex, options = {}) {
  const transparent = Boolean(options.transparent);
  const opacity = options.opacity !== undefined ? Number(options.opacity) : 1.0;
  const side = options.side || THREE.FrontSide;
  const depthWrite = options.depthWrite !== undefined ? Boolean(options.depthWrite) : true;
  const mapKey = options.map ? (options.map.uuid || options.map.id || 'tex') : 'none';
  const cacheKey = `${colorHex}_${mapKey}_${transparent}_${opacity}_${side}_${depthWrite}`;
  let mat = basicMaterialCache.get(cacheKey);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent,
      opacity,
      side,
      depthWrite,
      ...(options.map ? { map: options.map } : {})
    });
    basicMaterialCache.set(cacheKey, mat);
  }
  return mat;
}

const celMaterialCache = new Map();

export function createCelMaterial(colorHex, mapTex = null, emissiveHex = 0x000000, options = {}) {
  if (mapTex && typeof mapTex === 'object' && !mapTex.isTexture && !(typeof THREE !== 'undefined' && THREE.Texture && mapTex instanceof THREE.Texture)) {
    options = mapTex;
    mapTex = options.map ?? null;
    emissiveHex = options.emissive ?? 0x000000;
  }

  const isMetallic = typeof options === 'boolean' ? options : !!options.isMetallic;
  const glintThreshold = options.glintThreshold ?? 0.88;
  const glintIntensity = options.glintIntensity ?? (isMetallic ? 1.5 : 0.0);
  const creviceAO = options.creviceAO ? 1.0 : 0.0;
  const rimIntensity = options.rimIntensity ?? (options.isCharacter ? 0.85 : 0.0);

  const bumpMap = options.bumpMap ?? null;
  const bumpScale = options.bumpScale ?? 0.03;
  const normalMap = options.normalMap ?? null;
  const normalScale = options.normalScale ?? new THREE.Vector2(1, 1);
  const anisotropy = options.anisotropy ?? 4;

  if (mapTex && typeof mapTex === 'object') {
    mapTex.anisotropy = Math.max(mapTex.anisotropy || 1, anisotropy);
  }
  if (bumpMap && typeof bumpMap === 'object') {
    bumpMap.anisotropy = Math.max(bumpMap.anisotropy || 1, anisotropy);
  }
  if (normalMap && typeof normalMap === 'object') {
    normalMap.anisotropy = Math.max(normalMap.anisotropy || 1, anisotropy);
  }
  if (options.aoMap && typeof options.aoMap === 'object') {
    options.aoMap.anisotropy = Math.max(options.aoMap.anisotropy || 1, anisotropy);
  }
  if (options.lightMap && typeof options.lightMap === 'object') {
    options.lightMap.anisotropy = Math.max(options.lightMap.anisotropy || 1, anisotropy);
  }

  const texKey = mapTex ? (mapTex.uuid || mapTex.id || 'tex') : '0';
  const bumpKey = bumpMap ? (bumpMap.uuid || bumpMap.id || 'bump') : '0';
  const normKey = normalMap ? (normalMap.uuid || normalMap.id || 'norm') : '0';
  const aoKey = options.aoMap ? (options.aoMap.uuid || options.aoMap.id || 'ao') : '0';
  const lightKey = options.lightMap ? (options.lightMap.uuid || options.lightMap.id || 'lm') : '0';
  const sideVal = options.side ?? THREE.FrontSide;
  const vertexColors = Boolean(options.vertexColors);
  const cacheKey = `${colorHex}_${texKey}_${emissiveHex}_${isMetallic}_${glintThreshold}_${glintIntensity}_${creviceAO}_${rimIntensity}_${bumpKey}_${bumpScale}_${normKey}_${anisotropy}_${aoKey}_${lightKey}_${sideVal}_${vertexColors ? 1 : 0}`;
  if (celMaterialCache.has(cacheKey)) {
    return celMaterialCache.get(cacheKey);
  }

  const matConfig = {
    color: colorHex,
    gradientMap: toonGradientMap,
    map: mapTex,
    emissive: emissiveHex,
    side: sideVal,
    vertexColors
  };
  if (bumpMap) {
    matConfig.bumpMap = bumpMap;
    matConfig.bumpScale = bumpScale;
  }
  if (normalMap) {
    matConfig.normalMap = normalMap;
    matConfig.normalScale = normalScale;
  }
  if (options.aoMap) {
    matConfig.aoMap = options.aoMap;
    matConfig.aoMapIntensity = options.aoMapIntensity ?? 1.0;
  }
  if (options.lightMap) {
    matConfig.lightMap = options.lightMap;
    matConfig.lightMapIntensity = options.lightMapIntensity ?? 1.0;
  }

  const mat = new THREE.MeshToonMaterial(matConfig);
  mat.userData.celParams = {
    emissiveHex,
    isMetallic,
    glintThreshold,
    glintIntensity,
    creviceAO,
    rimIntensity,
    sideVal
  };
  if (bumpMap) {
    mat.bumpMap = bumpMap;
    mat.bumpScale = bumpScale;
  }
  if (normalMap) {
    mat.normalMap = normalMap;
    mat.normalScale = normalScale;
  }
  if (options.aoMap) {
    mat.aoMap = options.aoMap;
    mat.aoMapIntensity = options.aoMapIntensity ?? 1.0;
  }
  if (options.lightMap) {
    mat.lightMap = options.lightMap;
    mat.lightMapIntensity = options.lightMapIntensity ?? 1.0;
  }

  mat.customProgramCacheKey = () => {
    let key = isMetallic ? 'cel_glint_metallic' : 'cel_matte';
    if (creviceAO > 0.0) key += '_crevice';
    if (rimIntensity > 0.0) key += '_rim';
    if (bumpMap) key += '_bump';
    if (normalMap) key += '_norm';
    if (vertexColors) key += '_vc';
    return key;
  };

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
        float NdotL = clamp( dot( normal, lightDirection ), 0.0, 1.0 );

        float celFactor;
        if ( NdotL < 0.25 ) {
          celFactor = 0.28;
        } else if ( NdotL < 0.65 ) {
          celFactor = 0.62;
        } else {
          celFactor = 1.00;
        }

        vec2 rotCoord = vec2(
          gl_FragCoord.x * 0.70710678 - gl_FragCoord.y * 0.70710678,
          gl_FragCoord.x * 0.70710678 + gl_FragCoord.y * 0.70710678
        );
        vec2 cell = mod( rotCoord, 6.0 ) - vec2( 3.0 );
        float dotDist = length( cell );

        if ( NdotL >= 0.18 && NdotL <= 0.42 && dotDist < 1.65 ) {
          celFactor *= 0.65;
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

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment>',
      `
      #include <lights_fragment>

      if ( uCreviceAO > 0.0 ) {
        float creviceAO = clamp( smoothstep( -0.1, 1.25, vWorldPos.y ) * 0.45 + 0.55, 0.45, 1.0 );
        reflectedLight.directDiffuse *= creviceAO;
        reflectedLight.indirectDiffuse *= creviceAO;
      }

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

export function createMetallicCelMaterial(colorHex, mapTex = null, emissiveHex = 0x000000, options = {}) {
  return createCelMaterial(colorHex, mapTex, emissiveHex, {
    isMetallic: true,
    glintThreshold: options.glintThreshold ?? 0.88,
    glintIntensity: options.glintIntensity ?? 1.5,
    ...options
  });
}

let _fighterShadowScope = false;
export function setFighterShadowScope(val) {
  _fighterShadowScope = Boolean(val);
}

export function createHiFiMesh(geometry, colorHex, outlineThickness = 0.038, mapTex = null, emissiveHex = 0x000000, options = {}) {
  const mat = createCelMaterial(colorHex, mapTex, emissiveHex, options);
  const mesh = new THREE.Mesh(geometry, mat);

  if (options && options.castShadow !== undefined) {
    mesh.castShadow = Boolean(options.castShadow);
  } else if (_fighterShadowScope) {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const r = geometry.boundingSphere ? geometry.boundingSphere.radius : 0;
    mesh.castShadow = r >= 0.095;
  } else {
    mesh.castShadow = false;
  }
  mesh.receiveShadow = (options && options.receiveShadow !== undefined) ? Boolean(options.receiveShadow) : false;

  const enableOutline = (options && (options.noOutline || options.outline === false)) || outlineThickness <= 0 ? false : true;
  if (enableOutline) {
    const outlineMat = createOutlineMaterial(outlineThickness, (options && options.outlineColor) || 0x060508);
    const outline = new THREE.Mesh(geometry, outlineMat);
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = 1;
    mesh.add(outline);
  }
  return mesh;
}

export function mergeStaticGroupMeshes(rootGroup, preservePredicate = null) {
  if (!rootGroup) return rootGroup;
  rootGroup.updateMatrixWorld(true);
  const rootInv = rootGroup.matrixWorld.clone().invert();

  const preservedObjects = new Set();
  if (preservePredicate) {
    rootGroup.traverse((obj) => {
      if (obj !== rootGroup && preservePredicate(obj)) {
        obj.traverse((sub) => preservedObjects.add(sub));
      }
    });
  }

  function isVisibleFromRoot(node) {
    let cur = node;
    while (cur && cur !== rootGroup) {
      if (!cur.visible) return false;
      cur = cur.parent;
    }
    return true;
  }

  function isUntexturedSolid(mat) {
    if (!mat || !mat.color) return false;
    if (mat.map || mat.bumpMap || mat.normalMap || mat.aoMap || mat.lightMap) return false;
    if (mat.transparent && (mat.opacity ?? 1) < 0.99) return false;
    const hex = mat.color.getHex();
    if (hex === 0x11aa22 || hex === 0x2233cc || hex === 0xcc7744) return false;
    return true;
  }

  function getStructuralMatKey(mat) {
    if (!mat) return 'null';
    const canVColor = isUntexturedSolid(mat);
    const col = canVColor ? 'VCOLOR' : (mat.color ? mat.color.getHexString() : 'nc');
    const emi = mat.emissive ? mat.emissive.getHexString() : 'ne';
    const mapId = mat.map ? (mat.map.uuid || mat.map.id) : 'nm';
    const bumpId = mat.bumpMap ? (mat.bumpMap.uuid || mat.bumpMap.id) : 'nb';
    const normId = mat.normalMap ? (mat.normalMap.uuid || mat.normalMap.id) : 'nn';
    const aoId = mat.aoMap ? (mat.aoMap.uuid || mat.aoMap.id) : 'nao';
    const lmId = mat.lightMap ? (mat.lightMap.uuid || mat.lightMap.id) : 'nlm';
    const rough = mat.roughness !== undefined ? Number(mat.roughness).toFixed(2) : '';
    const metal = mat.metalness !== undefined ? Number(mat.metalness).toFixed(2) : '';
    const trans = mat.transparent ? 1 : 0;
    const opac = Number(mat.opacity ?? 1).toFixed(2);
    const side = mat.side ?? 0;
    const prog = typeof mat.customProgramCacheKey === 'function' ? mat.customProgramCacheKey() : '';
    return `${mat.type}_${col}_${emi}_${mapId}_${bumpId}_${normId}_${aoId}_${lmId}_${rough}_${metal}_${trans}_${opac}_${side}_${prog}`;
  }

  const sharedOutlineMat = createOutlineMaterial(0.030, 0x060508);
  const buckets = new Map();
  const meshesToRemove = [];

  rootGroup.traverse((obj) => {
    if (!obj.isMesh || preservedObjects.has(obj)) return;
    if (!isVisibleFromRoot(obj)) return;
    if (!obj.geometry || !obj.geometry.attributes || !obj.geometry.attributes.position) return;
    if (Array.isArray(obj.material)) return;
    if (obj.material && obj.material.transparent && obj.material.blending === THREE.AdditiveBlending) return;

    const isOutlineMesh = (obj.renderOrder === 1) && obj.material && obj.material.side === THREE.BackSide;
    const mat = isOutlineMesh ? sharedOutlineMat : obj.material;
    const key = isOutlineMesh
      ? '__SINGLE_OUTLINE_PASS__'
      : `${getStructuralMatKey(mat)}_${obj.renderOrder || 0}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        material: mat,
        isOutline: isOutlineMesh,
        canVColor: !isOutlineMesh && isUntexturedSolid(mat),
        colorHexSet: new Set(),
        castShadow: isOutlineMesh ? false : Boolean(obj.castShadow),
        receiveShadow: isOutlineMesh ? false : Boolean(obj.receiveShadow),
        renderOrder: isOutlineMesh ? 1 : (obj.renderOrder || 0),
        geoms: [],
        meshes: [],
        preservedName: ''
      };
      buckets.set(key, bucket);
    } else if (!isOutlineMesh) {
      if (obj.castShadow) bucket.castShadow = true;
      if (obj.receiveShadow) bucket.receiveShadow = true;
    }

    if (bucket.canVColor && mat.color) {
      bucket.colorHexSet.add(mat.color.getHex());
    }

    let geom = obj.geometry.clone();
    if (geom.index) {
      geom = geom.toNonIndexed();
    }
    const relMatrix = rootInv.clone().multiply(obj.matrixWorld);
    geom.applyMatrix4(relMatrix);

    const vCount = geom.attributes.position.count;
    if (!geom.attributes.normal) {
      geom.computeVertexNormals();
    } else {
      geom.normalizeNormals();
    }
    if (!geom.attributes.uv) {
      geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vCount * 2), 2));
    }
    if (!geom.attributes.uv2) {
      const uvArr = geom.attributes.uv.array;
      geom.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    }
    if (bucket.canVColor && mat.color) {
      const cArr = new Float32Array(vCount * 3);
      const cr = mat.color.r;
      const cg = mat.color.g;
      const cb = mat.color.b;
      for (let v = 0; v < vCount; v++) {
        cArr[v * 3] = cr;
        cArr[v * 3 + 1] = cg;
        cArr[v * 3 + 2] = cb;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    }

    bucket.geoms.push(geom);
    bucket.meshes.push(obj);
    if (obj.name && !bucket.preservedName) {
      bucket.preservedName = obj.name;
    }
  });

  buckets.forEach((bucket) => {
    if (bucket.geoms.length < 2) {
      if (bucket.meshes.length === 1) {
        const m = bucket.meshes[0];
        if (m.castShadow && m.geometry) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const r = m.geometry.boundingSphere ? m.geometry.boundingSphere.radius : 0;
          if (r < 0.14) m.castShadow = false;
        }
      }
      return;
    }

    let totalVerts = 0;
    for (let i = 0; i < bucket.geoms.length; i++) {
      totalVerts += bucket.geoms[i].attributes.position.count;
    }

    const useVColor = bucket.canVColor && bucket.colorHexSet.size > 1;
    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    const uvArr = new Float32Array(totalVerts * 2);
    const uv2Arr = new Float32Array(totalVerts * 2);
    const colArr = useVColor ? new Float32Array(totalVerts * 3) : null;

    let vOffset = 0;
    for (let i = 0; i < bucket.geoms.length; i++) {
      const g = bucket.geoms[i];
      const count = g.attributes.position.count;
      posArr.set(g.attributes.position.array.subarray(0, count * 3), vOffset * 3);
      normArr.set(g.attributes.normal.array.subarray(0, count * 3), vOffset * 3);
      if (g.attributes.uv && g.attributes.uv.array.length >= count * 2) {
        uvArr.set(g.attributes.uv.array.subarray(0, count * 2), vOffset * 2);
      }
      if (g.attributes.uv2 && g.attributes.uv2.array.length >= count * 2) {
        uv2Arr.set(g.attributes.uv2.array.subarray(0, count * 2), vOffset * 2);
      }
      if (useVColor && g.attributes.color && g.attributes.color.array.length >= count * 3) {
        colArr.set(g.attributes.color.array.subarray(0, count * 3), vOffset * 3);
      }
      vOffset += count;
    }

    const mergedGeom = new THREE.BufferGeometry();
    mergedGeom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    mergedGeom.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    mergedGeom.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    mergedGeom.setAttribute('uv2', new THREE.BufferAttribute(uv2Arr, 2));
    if (useVColor) {
      mergedGeom.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    }
    mergedGeom.computeBoundingSphere();

    let finalMat = bucket.material;
    if (useVColor) {
      if (finalMat.userData && finalMat.userData.celParams) {
        const p = finalMat.userData.celParams;
        finalMat = createCelMaterial(0xffffff, null, p.emissiveHex, {
          isMetallic: p.isMetallic,
          glintThreshold: p.glintThreshold,
          glintIntensity: p.glintIntensity,
          creviceAO: p.creviceAO > 0,
          rimIntensity: p.rimIntensity,
          side: p.sideVal,
          vertexColors: true
        });
      } else {
        finalMat = finalMat.clone();
        if (finalMat.color) finalMat.color.setHex(0xffffff);
        finalMat.vertexColors = true;
      }
    }

    const mergedMesh = new THREE.Mesh(mergedGeom, finalMat);
    const radius = mergedGeom.boundingSphere ? mergedGeom.boundingSphere.radius : 0;
    mergedMesh.castShadow = bucket.castShadow && (radius >= 0.14);
    mergedMesh.receiveShadow = bucket.receiveShadow;
    mergedMesh.renderOrder = bucket.renderOrder;
    if (bucket.preservedName) {
      mergedMesh.name = bucket.preservedName;
    }
    rootGroup.add(mergedMesh);

    for (let i = 0; i < bucket.meshes.length; i++) {
      meshesToRemove.push(bucket.meshes[i]);
    }
  });

  const removeSet = new Set(meshesToRemove);
  for (let i = 0; i < meshesToRemove.length; i++) {
    const m = meshesToRemove[i];
    if (!m.parent) continue;
    const childrenCopy = [...m.children];
    for (let c = 0; c < childrenCopy.length; c++) {
      const child = childrenCopy[c];
      if (!removeSet.has(child)) {
        rootGroup.attach(child);
      }
    }
    if (m.parent) {
      m.parent.remove(m);
    }
  }

  return rootGroup;
}

export function optimizeArticulatedRigBones(rig) {
  if (!rig || !rig.root) return rig;
  const boneGroups = new Set();
  [
    rig.root, rig.hips, rig.torso, rig.headGroup,
    rig.leftArm, rig.leftElbow, rig.leftHand,
    rig.rightArm, rig.rightElbow, rig.rightHand,
    rig.leftLeg, rig.leftKnee, rig.leftAnkle,
    rig.rightLeg, rig.rightKnee, rig.rightAnkle,
    rig.jawGroup, rig.visorGroup, rig.chainPendulum, rig.bossCape,
    rig.leftCoatTail, rig.rightCoatTail, rig.recordDisc, rig.micGroup,
    rig.vest, rig.medallion, rig.contactShadowDecal
  ].forEach((b) => {
    if (b && b.isObject3D) boneGroups.add(b);
  });

  boneGroups.forEach((bone) => {
    if (bone === rig.contactShadowDecal) return;
    mergeStaticGroupMeshes(bone, (obj) => boneGroups.has(obj));
  });
  return rig;
}

/**
 * Assigns continuous, un-tiled planar UV2 coordinates across geometry bounds.
 * Eliminates repeating seams and multi-face UV duplication in baked lightmaps and AO.
 * 
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Box3|Object|null} bounds
 * @param {string} plane - 'xz' (default), 'xy', or 'yz'
 * @returns {THREE.BufferGeometry}
 */
export function assignPlanarUV2(geometry, bounds = null, plane = 'xz') {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    return geometry;
  }

  const posAttr = geometry.attributes.position;
  const count = posAttr.count;
  const uv2Array = new Float32Array(count * 2);

  let uIdx = 0;
  let vIdx = 2; // Default 'xz'
  const p = (plane || 'xz').toLowerCase();
  if (p === 'xy') {
    uIdx = 0;
    vIdx = 1;
  } else if (p === 'yz' || p === 'zy') {
    uIdx = 2;
    vIdx = 1;
  } else {
    uIdx = 0;
    vIdx = 2;
  }

  let minU, maxU, minV, maxV;

  if (bounds && typeof bounds === 'object') {
    if (bounds.min !== undefined && bounds.max !== undefined) {
      const getCoord = (vec, idx) => (idx === 0 ? vec.x : (idx === 1 ? vec.y : vec.z));
      minU = getCoord(bounds.min, uIdx);
      maxU = getCoord(bounds.max, uIdx);
      minV = getCoord(bounds.min, vIdx);
      maxV = getCoord(bounds.max, vIdx);
    } else {
      minU = bounds.minU ?? (uIdx === 0 ? bounds.minX : (uIdx === 1 ? bounds.minY : bounds.minZ));
      maxU = bounds.maxU ?? (uIdx === 0 ? bounds.maxX : (uIdx === 1 ? bounds.maxY : bounds.maxZ));
      minV = bounds.minV ?? (vIdx === 0 ? bounds.minX : (vIdx === 1 ? bounds.minY : bounds.minZ));
      maxV = bounds.maxV ?? (vIdx === 0 ? bounds.maxX : (vIdx === 1 ? bounds.maxY : bounds.maxZ));
    }
  }

  if (minU === undefined || maxU === undefined || minV === undefined || maxV === undefined) {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const getCoord = (vec, idx) => (idx === 0 ? vec.x : (idx === 1 ? vec.y : vec.z));
    minU = minU ?? getCoord(bb.min, uIdx);
    maxU = maxU ?? getCoord(bb.max, uIdx);
    minV = minV ?? getCoord(bb.min, vIdx);
    maxV = maxV ?? getCoord(bb.max, vIdx);
  }

  const rangeU = (maxU - minU) !== 0 ? (maxU - minU) : 1.0;
  const rangeV = (maxV - minV) !== 0 ? (maxV - minV) : 1.0;

  for (let i = 0; i < count; i++) {
    const valU = posAttr.getComponent(i, uIdx);
    const valV = posAttr.getComponent(i, vIdx);
    const u = Math.min(1.0, Math.max(0.0, (valU - minU) / rangeU));
    const v = Math.min(1.0, Math.max(0.0, (valV - minV) / rangeV));
    uv2Array[i * 2] = u;
    uv2Array[i * 2 + 1] = v;
  }

  geometry.setAttribute('uv2', new THREE.BufferAttribute(uv2Array, 2));
  return geometry;
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
export function createSculptedLoftGeometry(slices, radialSegments = 18, frontIsNegZ = true, closeBottom = true, closeTop = true) {
  radialSegments = Math.min(radialSegments, 18);
  const numSlices = slices.length;
  if (numSlices === 0) return new THREE.BufferGeometry();

  // If slices are defined top-to-bottom (descending Y), reverse them so slice indices increase upwards.
  // This guarantees counter-clockwise outward-facing triangle winding, valid positive ySpan UVs,
  // and correct end cap positioning.
  const isDescending = numSlices > 1 && slices[0][0] > slices[numSlices - 1][0];
  const effectiveSlices = isDescending ? [...slices].reverse() : slices;

  const positions = [];
  const uvs = [];
  const indices = [];

  const yMin = effectiveSlices[0][0];
  const yMax = effectiveSlices[numSlices - 1][0];
  const ySpan = Math.max(1e-5, yMax - yMin);

  for (let i = 0; i < numSlices; i++) {
    const [y, rx, rzFront, rzBack, cx = 0, cz = 0, p = 2.0] = effectiveSlices[i];
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
  if (closeBottom && effectiveSlices.length > 0) {
    const [y0, , , , cx0 = 0, cz0 = 0] = effectiveSlices[0];
    const botCenterIdx = positions.length / 3;
    positions.push(cx0, y0, cz0);
    uvs.push(0.5, 0.0);
    for (let j = 0; j < radialSegments; j++) {
      indices.push(botCenterIdx, j + 1, j);
    }
  }

  if (closeTop && effectiveSlices.length > 0) {
    const [yN, , , , cxN = 0, czN = 0] = effectiveSlices[numSlices - 1];
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
export function createCurvedHairLockGeometry(length = 0.14, width = 0.055, thickness = 0.032, bendZ = 0.03, bendX = 0.0) {
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
export function drawOnBackSeam(ctx, fn) {
  [0, 1024].forEach((bx) => {
    ctx.save();
    ctx.translate(bx, 0);
    fn();
    ctx.restore();
  });
}


let _lightPoolTex = null;
export function createLightPoolTexture() {
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
