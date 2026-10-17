/**
 * scene/index.js — 3D Scene Graph Module: 1:1 OpenStreetMap Rectified Hero Landmarks,
 * InstancedMesh Riparian Canopy & Dragon-Scale Roof Cells, On-Demand Shadow Map Controller,
 * and Exact 8,010-Building Spatial Click Lookup for Mountain View Digital Twin.
 *
 * Fixes from Remediation Brief Sections 2, 3, 5 & Hero Landmark Rectification Brief:
 * - Bug #6 Fixed: `findOsmBuildingAtScenePoint(worldX, worldZ, mvGisData, sceneToGeo, geoToScene)`
 *   identifies the exact clicked building in `mvGisData.buildings` via point-in-polygon
 *   and tight centroid proximity, preventing clicks on merged static buildings from
 *   falling back to an interactive parcel 91m away.
 * - Section 3 Performance Fixed:
 *   - Converts 520 Stevens Creek riparian trees into a single `THREE.InstancedMesh`
 *     with per-instance color variation (1 draw call instead of 520).
 *   - Converts 378 Google Bay View dragon-scale roof cells into 3 `THREE.InstancedMesh`
 *     objects (3 draw calls instead of 378) and Charleston East roof cells into 1 `InstancedMesh`.
 *   - Converts 30 Hangar One buttress piers into 1 `THREE.InstancedMesh`.
 *   - Configures `renderer.shadowMap.autoUpdate = false` and triggers `shadowMap.needsUpdate = true`
 *     strictly on camera, solar, or building height change.
 * - Hero Landmarks Rectified to 1:1 OpenStreetMap Centroids & Azimuths:
 *   - `GoogleBayViewCampus` at (15.30, 0, -29.70) — 0 synthetic annex boxes
 *   - `ShorelineAmphitheatre` at (-0.06, 0, -35.33) — inside Amphitheatre Pkwy loop
 *   - `NasaAmesHangarOne` at (28.99, 0, -16.55), rot.y = -0.55 rad — parallel to Runway 14L/32R, 0 flanking boxes
 *   - `GoogleCharlestonEast` at (1.20, 0, -28.89), rot.y = 0.05 rad
 *   - `GoogleplexCampus` at (-3.90, 0, -28.75), rot.y = -0.12 rad
 *   - `ComputerHistoryMuseum` at (3.63, 0, -18.47), rot.y = 0.35 rad
 *   - `NasaAmesHangarTwo` at (39.82, 0, -21.37), rot.y = -0.55 rad
 *   - `NasaAmesWindTunnel` at (18.60, 0, -20.60)
 *   - `MountainViewDowntownTransitCenter` at (4.85, 0, 9.35), rot.y = -0.46 rad — south of Caltrain & Central Expy
 *   - `MountainViewCivicCenter` at (-1.69, 0, 14.58), rot.y = -0.46 rad — 500 Castro St
 *   - `SanAntonioCenter` at (-30.50, 0, -1.90), rot.y = 0.42 rad — inside San Antonio Center superblock
 */

/**
 * Ray-casting point-in-polygon check in [lon, lat] coordinates.
 */
function pointInPolygonGeo(lon, lat, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Bug #6 Fix: Finds the exact OpenStreetMap building in `mvGisData.buildings` containing
 * (or within <= 0.32 scene units / ~25m of) a 3D raycast intersection on `staticBuildingsGroup`.
 */
export function findOsmBuildingAtScenePoint(worldX, worldZ, mvGisData, sceneToGeo, geoToScene) {
  if (!mvGisData || !Array.isArray(mvGisData.buildings) || typeof sceneToGeo !== 'function') return null;
  const { lon, lat } = sceneToGeo(worldX, worldZ);

  // 1. First pass: exact polygon containment
  for (let i = 0; i < mvGisData.buildings.length; i++) {
    const b = mvGisData.buildings[i];
    if (Array.isArray(b.polygon) && pointInPolygonGeo(lon, lat, b.polygon)) {
      return b;
    }
  }

  // 2. Second pass: nearest building centroid within <= 0.35 scene units (~28m)
  if (typeof geoToScene === 'function') {
    let best = null;
    let bestDist = 0.35;
    for (let i = 0; i < mvGisData.buildings.length; i++) {
      const b = mvGisData.buildings[i];
      if (!Array.isArray(b.center) || b.center.length < 2) continue;
      const sc = geoToScene(b.center[0], b.center[1]);
      const d = Math.hypot(sc.x - worldX, sc.z - worldZ);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }
  return null;
}

/**
 * Section 3 Performance: Builds the Stevens Creek riparian forest canopy using a single
 * `THREE.InstancedMesh` with per-instance color variation (1 draw call instead of 520).
 */
export function buildStevensCreekTrees(
  THREE,
  cityRoot,
  stevensCreekCurve,
  stevensCreekBraidedCurve,
  minDistBoxToSamples,
  corridorSamples,
  createSeededRandom
) {
  const rand = createSeededRandom(7731);
  const crownGeo = new THREE.DodecahedronGeometry(0.54, 1);
  const treeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x051a0d,
    emissiveIntensity: 0.16,
    roughness: 0.84
  });

  const palette = [
    new THREE.Color(0x0e331c),
    new THREE.Color(0x164a29),
    new THREE.Color(0x206038)
  ];

  const validTrees = [];
  const { us101Samples, caltrainSamples, ecrSamples, castroSamples } = corridorSamples;

  for (let i = 0; i < 520; i++) {
    const t = i / 520;
    const useBraid = i % 3 === 0 && t < 0.65;
    const pt = (useBraid ? stevensCreekBraidedCurve : stevensCreekCurve).getPointAt(t);
    const spread = t < 0.35 ? 3.2 : 2.6;
    const cx = pt.x + (rand() - 0.5) * spread;
    const cz = pt.z + (rand() - 0.5) * spread;
    const s = 0.38 + rand() * 0.52;

    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, us101Samples) < 2.15) continue;
    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, caltrainSamples) < 1.95) continue;
    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, ecrSamples) < 1.85) continue;
    if (minDistBoxToSamples(cx - s, cx + s, cz - s, cz + s, castroSamples) < 1.75) continue;

    validTrees.push({ cx, cz, s, color: palette[i % 3] });
  }

  const instancedTrees = new THREE.InstancedMesh(crownGeo, treeMat, validTrees.length);
  instancedTrees.name = 'StevensCreekTreesInstanced';
  instancedTrees.castShadow = false;
  instancedTrees.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < validTrees.length; i++) {
    const item = validTrees[i];
    dummy.position.set(item.cx, item.s * 0.38, item.cz);
    dummy.scale.set(item.s * 1.08, item.s * 0.76, item.s * 1.08);
    dummy.updateMatrix();
    instancedTrees.setMatrixAt(i, dummy.matrix);
    instancedTrees.setColorAt(i, item.color);
  }
  instancedTrees.instanceMatrix.needsUpdate = true;
  if (instancedTrees.instanceColor) instancedTrees.instanceColor.needsUpdate = true;

  cityRoot.add(instancedTrees);
  return instancedTrees;
}

/**
 * Section 3 Performance: Configures on-demand shadow map updates (`shadowMap.autoUpdate = false`).
 */
export function configureOnDemandShadows(renderer, scene, landmarksGroup, districtLandmarksGroup, parcelsGroup) {
  if (!renderer || !renderer.shadowMap) return () => {};
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const allowedRoots = new Set([landmarksGroup, districtLandmarksGroup, parcelsGroup].filter(Boolean));

  if (scene) {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      let underAllowed = false;
      let curr = obj;
      while (curr) {
        if (allowedRoots.has(curr)) {
          underAllowed = true;
          break;
        }
        curr = curr.parent;
      }
      if (!underAllowed) {
        obj.castShadow = false;
      }
    });
  }

  return function requestShadowUpdate() {
    if (renderer && renderer.shadowMap) {
      renderer.shadowMap.needsUpdate = true;
    }
  };
}

// ============================================================================
// 1:1 OPENSTREETMAP RECTIFIED HERO 3D ARCHITECTURAL LANDMARKS
// ============================================================================

// 1. GOOGLE BAY VIEW CANOPY CAMPUS (Exact 1:1 OSM Centroid: x=15.30, z=-29.70)
// Uses THREE.InstancedMesh for the 14×9=126 diamond roof cells per pavilion (3 draw calls instead of 378)
export function buildGoogleBayViewCanopy(THREE, landmarksGroup) {
  const group = new THREE.Group();
  group.name = 'GoogleBayViewCampus';
  group.position.set(15.30, 0, -29.70);
  group.rotation.y = 0.0;
  group.scale.setScalar(0.36);

  const warmGlazingMat = new THREE.MeshStandardMaterial({
    color: 0xffdf9e,
    emissive: 0xd8841c,
    emissiveIntensity: 0.68,
    roughness: 0.28
  });

  const canopyShellMat = new THREE.MeshStandardMaterial({
    color: 0xd8b882,
    emissive: 0x6e4414,
    emissiveIntensity: 0.26,
    roughness: 0.36,
    metalness: 0.28
  });

  const scaleDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3b2a17,
    roughness: 0.48,
    metalness: 0.22
  });

  const diamondRidgeMat = new THREE.LineBasicMaterial({
    color: 0xffe4a8,
    transparent: true,
    opacity: 0.86
  });

  function sampleCanopyY(vx, vz, w, d, h) {
    const nx = vx / (w * 0.5);
    const nz = vz / (d * 0.5);
    const edgeFalloff = Math.max(0, 1 - (nx * nx * 0.56 + nz * nz * 0.58));
    const billow1 = Math.exp(-(Math.pow(nx + 0.34, 2) * 3.4 + Math.pow(nz + 0.1, 2) * 3.0)) * 1.22;
    const billow2 = Math.exp(-(Math.pow(nx - 0.32, 2) * 3.4 + Math.pow(nz - 0.1, 2) * 3.0)) * 1.18;
    const ripples = Math.cos(nx * Math.PI * 2.5) * Math.cos(nz * Math.PI * 2.0) * 0.36;
    return h * 0.36 + edgeFalloff * h * 0.54 + billow1 + billow2 + Math.max(0, ripples);
  }

  const cellGeo = new THREE.BoxGeometry(1, 0.06, 1);
  cellGeo.rotateY(Math.PI / 4);

  function createDragonCanopyModule(w, d, h, ox, oz, name) {
    const mod = new THREE.Group();
    mod.name = name;
    mod.position.set(ox, 0, oz);

    const baseGeo = new THREE.BoxGeometry(w * 0.86, h * 0.46, d * 0.86);
    const baseMesh = new THREE.Mesh(baseGeo, warmGlazingMat);
    baseMesh.position.y = h * 0.23;
    baseMesh.castShadow = true;
    mod.add(baseMesh);

    const segX = 14;
    const segZ = 9;
    const roofGeo = new THREE.PlaneGeometry(w, d, segX, segZ);
    roofGeo.rotateX(-Math.PI / 2);
    const pos = roofGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      pos.setY(i, sampleCanopyY(vx, vz, w, d, h));
    }
    roofGeo.computeVertexNormals();

    const roofMesh = new THREE.Mesh(roofGeo, canopyShellMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    mod.add(roofMesh);

    // InstancedMesh for all 14×9 = 126 diamond roof cells (1 draw call per pavilion instead of 126)
    const diamondVerts = [];
    const cellW = (w / segX) * 0.52;
    const cellD = (d / segZ) * 0.52;
    const cellsInstanced = new THREE.InstancedMesh(cellGeo, scaleDarkMat, segX * segZ);
    cellsInstanced.name = `${name}_CellsInstanced`;
    const dummy = new THREE.Object3D();
    let cellIdx = 0;

    for (let ix = 0; ix < segX; ix++) {
      for (let iz = 0; iz < segZ; iz++) {
        const x0 = -w * 0.5 + (ix / segX) * w;
        const x1 = -w * 0.5 + ((ix + 1) / segX) * w;
        const xm = (x0 + x1) * 0.5;
        const z0 = -d * 0.5 + (iz / segZ) * d;
        const z1 = -d * 0.5 + ((iz + 1) / segZ) * d;
        const zm = (z0 + z1) * 0.5;
        const ym = sampleCanopyY(xm, zm, w, d, h);

        dummy.position.set(xm, ym + 0.02, zm);
        dummy.scale.set(cellW, 1, cellD);
        dummy.updateMatrix();
        cellsInstanced.setMatrixAt(cellIdx++, dummy.matrix);

        const pN = [xm, sampleCanopyY(xm, z0, w, d, h) + 0.06, z0];
        const pE = [x1, sampleCanopyY(x1, zm, w, d, h) + 0.06, zm];
        const pS = [xm, sampleCanopyY(xm, z1, w, d, h) + 0.06, z1];
        const pW = [x0, sampleCanopyY(x0, zm, w, d, h) + 0.06, zm];

        diamondVerts.push(...pN, ...pE, ...pE, ...pS, ...pS, ...pW, ...pW, ...pN);
      }
    }
    cellsInstanced.instanceMatrix.needsUpdate = true;
    mod.add(cellsInstanced);

    const diamondGeo = new THREE.BufferGeometry();
    diamondGeo.setAttribute('position', new THREE.Float32BufferAttribute(diamondVerts, 3));
    mod.add(new THREE.LineSegments(diamondGeo, diamondRidgeMat));

    return mod;
  }

  // Strictly 3 primary pavilions (0 synthetic BayViewAnnex boxes)
  group.add(createDragonCanopyModule(5.6, 5.0, 3.2, 0.8, -3.2, 'Bay View 100'));
  group.add(createDragonCanopyModule(4.8, 4.4, 2.8, -0.8, 3.6, 'Bay View 200'));
  group.add(createDragonCanopyModule(3.6, 3.2, 2.2, 6.0, 0.1, 'Bay View Event Center'));

  const bayviewLight1 = new THREE.PointLight(0xffc66c, 2.2, 30, 1.5);
  bayviewLight1.position.set(0.0, 4.0, 0.0);
  group.add(bayviewLight1);

  const bayviewLight2 = new THREE.PointLight(0xffba52, 2.0, 28, 1.5);
  bayviewLight2.position.set(2.5, 3.5, -1.5);
  group.add(bayviewLight2);

  landmarksGroup.add(group);
  return group;
}

// 2. SHORELINE AMPHITHEATRE (Exact 1:1 OSM Centroid: x=-0.06, z=-35.33)
export function buildShorelineAmphitheatre(THREE, landmarksGroup) {
  const group = new THREE.Group();
  group.name = 'ShorelineAmphitheatre';
  group.position.set(-0.06, 0, -35.33);
  group.scale.setScalar(0.42);

  const padGeo = new THREE.CylinderGeometry(8.3, 8.9, 0.42, 48);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x161c24, roughness: 0.74 });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.position.y = 0.21;
  group.add(padMesh);

  const bowlGeo = new THREE.CylinderGeometry(6.3, 7.3, 0.92, 36);
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0xd2cfc6, roughness: 0.48 });
  const bowlMesh = new THREE.Mesh(bowlGeo, bowlMat);
  bowlMesh.position.y = 0.52;
  bowlMesh.castShadow = true;
  bowlMesh.receiveShadow = true;
  group.add(bowlMesh);

  const pavMat = new THREE.MeshStandardMaterial({ color: 0xeae7df, roughness: 0.44 });
  [[-3.2, 5.2], [0.0, 5.8], [3.2, 5.2]].forEach(([px, pz]) => {
    const pav = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.05, 1.7), pavMat);
    pav.position.set(px, 0.52, pz);
    pav.castShadow = true;
    group.add(pav);
  });

  const sampleTentHeight = (sx, sz) => {
    const dMain1 = Math.hypot((sx + 2.45) * 0.95, sz + 0.15);
    const dMain2 = Math.hypot((sx - 2.45) * 0.95, sz - 0.15);
    const dWing1 = Math.hypot(sx + 5.1, sz - 1.4);
    const dWing2 = Math.hypot(sx - 5.1, sz - 1.4);
    const dBack1 = Math.hypot(sx + 3.8, sz + 3.2);
    const dBack2 = Math.hypot(sx - 3.8, sz + 3.2);

    const spire1 = 7.4 * Math.exp(-dMain1 * 0.58);
    const spire2 = 7.1 * Math.exp(-dMain2 * 0.60);
    const wing1 = 3.6 * Math.exp(-dWing1 * 0.72);
    const wing2 = 3.6 * Math.exp(-dWing2 * 0.72);
    const back1 = 3.2 * Math.exp(-dBack1 * 0.75);
    const back2 = 3.2 * Math.exp(-dBack2 * 0.75);
    const saddle = 2.0 * Math.exp(-Math.hypot(sx * 0.65, sz) * 0.34);

    return 0.88 + Math.max(spire1, spire2, wing1, wing2, back1, back2, saddle);
  };

  const tentGeo = new THREE.PlaneGeometry(15.6, 13.0, 64, 64);
  tentGeo.rotateX(-Math.PI / 2);
  const pos = tentGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const scallopRadius = 6.4 + 1.15 * Math.cos(angle * 8);
    const r = Math.hypot(x * 0.86, z);
    let sx = x;
    let sz = z;
    if (r > scallopRadius) {
      sx = x * (scallopRadius / r);
      sz = z * (scallopRadius / r);
      pos.setX(i, sx);
      pos.setZ(i, sz);
    }
    pos.setY(i, sampleTentHeight(sx, sz));
  }
  tentGeo.computeVertexNormals();

  const tentMat = new THREE.MeshStandardMaterial({
    color: 0xf8f6f0,
    emissive: 0x3a2a14,
    emissiveIntensity: 0.14,
    roughness: 0.30,
    metalness: 0.06,
    side: THREE.DoubleSide
  });
  const tentMesh = new THREE.Mesh(tentGeo, tentMat);
  tentMesh.castShadow = true;
  tentMesh.receiveShadow = true;
  group.add(tentMesh);

  const seamVerts = [];
  const spireTips = [
    [-2.45, sampleTentHeight(-2.45, -0.15) + 0.05, -0.15],
    [2.45, sampleTentHeight(2.45, 0.15) + 0.05, 0.15]
  ];
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const rad = 6.4 + 1.15 * Math.cos(ang * 8);
    const ex = (Math.cos(ang) * rad) / 0.86;
    const ez = Math.sin(ang) * rad;
    const tip = ex < 0 ? spireTips[0] : spireTips[1];
    const midX = (tip[0] + ex) * 0.5;
    const midZ = (tip[2] + ez) * 0.5;
    const midY = sampleTentHeight(midX, midZ) + 0.04;
    seamVerts.push(tip[0], tip[1], tip[2], midX, midY, midZ);
    seamVerts.push(midX, midY, midZ, ex, sampleTentHeight(ex, ez) + 0.03, ez);
  }
  const seamLineGeo = new THREE.BufferGeometry();
  seamLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamVerts, 3));
  group.add(
    new THREE.LineSegments(
      seamLineGeo,
      new THREE.LineBasicMaterial({ color: 0xc4bfb4, transparent: true, opacity: 0.52 })
    )
  );

  const lanternGeo = new THREE.CylinderGeometry(0.16, 0.65, 2.2, 12);
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffd278 });
  const lanternMesh = new THREE.Mesh(lanternGeo, lanternMat);
  lanternMesh.position.set(0, 1.85, 0.25);
  group.add(lanternMesh);

  const tentLight = new THREE.PointLight(0xffc868, 1.6, 18, 1.5);
  tentLight.position.set(0, 3.2, 0.5);
  group.add(tentLight);

  landmarksGroup.add(group);
  return group;
}

// 3. NASA AMES HANGAR ONE (Exact 1:1 OSM Centroid: x=28.99, z=-16.55, rot.y=-0.55 rad)
export function buildNasaHangarOne(THREE, landmarksGroup) {
  const group = new THREE.Group();
  group.name = 'NasaAmesHangarOne';
  group.position.set(28.99, 0, -16.55);
  group.rotation.y = -0.55; // Parallel to Moffett Runway 14L/32R
  group.scale.setScalar(0.48);

  const length = 21.5;
  const width = 10.6;
  const height = 7.4;

  const sampleArchPt = (uArc, vLen, radialScale = 1.0) => {
    const theta = uArc * Math.PI;
    const x = Math.cos(theta) * (width * 0.5) * radialScale;
    const y = Math.sin(theta) * height * radialScale;
    const z = (vLen - 0.5) * length;
    return [x, y, z];
  };

  const floorSlab = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.96, 0.24, length * 0.98),
    new THREE.MeshStandardMaterial({ color: 0x090c12, roughness: 0.82 })
  );
  floorSlab.position.y = 0.12;
  floorSlab.receiveShadow = true;
  group.add(floorSlab);

  const linerSegArc = 24;
  const linerSegLen = 12;
  const linerGeo = new THREE.PlaneGeometry(1, 1, linerSegArc, linerSegLen);
  const lPos = linerGeo.attributes.position;
  for (let i = 0; i < lPos.count; i++) {
    const uArc = lPos.getX(i) + 0.5;
    const vLen = lPos.getY(i) + 0.5;
    const [ax, ay, az] = sampleArchPt(uArc, vLen, 0.93);
    lPos.setXYZ(i, ax, ay, az);
  }
  linerGeo.computeVertexNormals();
  const linerMat = new THREE.MeshStandardMaterial({
    color: 0x0e131b,
    roughness: 0.68,
    metalness: 0.32,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide
  });
  group.add(new THREE.Mesh(linerGeo, linerMat));

  const numRibs = 16;
  const numArcSegs = 18;
  const latticeVerts = [];

  for (let iz = 0; iz <= numRibs; iz++) {
    const v0 = iz / numRibs;
    const v1 = (iz + 1) / numRibs;
    for (let ia = 0; ia < numArcSegs; ia++) {
      const u0 = ia / numArcSegs;
      const u1 = (ia + 1) / numArcSegs;

      const p00 = sampleArchPt(u0, v0, 1.0);
      const p10 = sampleArchPt(u1, v0, 1.0);
      latticeVerts.push(...p00, ...p10);

      const p00In = sampleArchPt(u0, v0, 0.93);
      latticeVerts.push(...p00, ...p00In);

      if (iz < numRibs) {
        const p01 = sampleArchPt(u0, v1, 1.0);
        const p11 = sampleArchPt(u1, v1, 1.0);
        latticeVerts.push(...p00, ...p01);
        latticeVerts.push(...p00, ...p11);
        latticeVerts.push(...p10, ...p01);
      }
    }
  }

  const latticeGeo = new THREE.BufferGeometry();
  latticeGeo.setAttribute('position', new THREE.Float32BufferAttribute(latticeVerts, 3));
  const latticeMat = new THREE.LineBasicMaterial({
    color: 0xd8e0ea,
    transparent: true,
    opacity: 0.78
  });
  group.add(new THREE.LineSegments(latticeGeo, latticeMat));

  const ribMat = new THREE.MeshStandardMaterial({
    color: 0xe6ebf2,
    roughness: 0.34,
    metalness: 0.46,
    depthWrite: false
  });
  const ribGeo = new THREE.TorusGeometry(width * 0.5, 0.085, 6, 28, Math.PI);
  ribGeo.scale(1.0, height / (width * 0.5), 1.0);
  const ribsInstanced = new THREE.InstancedMesh(ribGeo, ribMat, 11);
  const dummy = new THREE.Object3D();
  for (let iz = 0; iz <= 10; iz++) {
    const zPos = ((iz / 10) - 0.5) * length;
    dummy.position.set(0, 0, zPos);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    ribsInstanced.setMatrixAt(iz, dummy.matrix);
  }
  ribsInstanced.instanceMatrix.needsUpdate = true;
  ribsInstanced.castShadow = true;
  group.add(ribsInstanced);

  const buttressMat = new THREE.MeshStandardMaterial({ color: 0xeceae2, roughness: 0.46 });
  const buttressGeo = new THREE.BoxGeometry(0.44, 1.35, 0.32);
  const piersInstanced = new THREE.InstancedMesh(buttressGeo, buttressMat, 30);
  let pierIdx = 0;
  for (let iz = 0; iz <= 14; iz++) {
    const zPos = ((iz / 14) - 0.5) * (length * 0.94);
    [-width * 0.5, width * 0.5].forEach((xSide) => {
      dummy.position.set(xSide, 0.68, zPos);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      piersInstanced.setMatrixAt(pierIdx++, dummy.matrix);
    });
  }
  piersInstanced.instanceMatrix.needsUpdate = true;
  piersInstanced.castShadow = true;
  group.add(piersInstanced);

  // Synthetic flanking boxes h1 and h2 intentionally omitted (0 runway intrusion)
  landmarksGroup.add(group);
  return group;
}

// 4. GOOGLE CHARLESTON EAST CANOPY PAVILION (Exact 1:1 OSM Centroid: x=1.20, z=-28.89)
export function buildGoogleCharlestonEast(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'GoogleCharlestonEast';
  group.position.set(1.20, 0, -28.89);
  group.rotation.y = 0.05;
  group.scale.setScalar(0.40);

  const warmGlazingMat = new THREE.MeshStandardMaterial({
    color: 0xffdf9e,
    emissive: 0xd8841c,
    emissiveIntensity: 0.68,
    roughness: 0.28
  });

  const alabasterCanopyMat = new THREE.MeshStandardMaterial({
    color: 0xf4e6ca,
    emissive: 0x8a5212,
    emissiveIntensity: 0.22,
    roughness: 0.32,
    metalness: 0.18
  });

  const bronzeRoofMat = new THREE.MeshStandardMaterial({
    color: 0x3d2b19,
    roughness: 0.45,
    metalness: 0.30
  });

  const diamondRidgeMat = new THREE.LineBasicMaterial({
    color: 0xffe4a8,
    transparent: true,
    opacity: 0.85
  });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 6.4), warmGlazingMat);
  plinth.position.y = 0.45;
  plinth.castShadow = true;
  group.add(plinth);

  const mezzanine = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.8, 5.8), alabasterCanopyMat);
  mezzanine.position.y = 1.30;
  mezzanine.castShadow = true;
  mezzanine.receiveShadow = true;
  group.add(mezzanine);

  const segs = 24;
  const canopyGeo = new THREE.PlaneGeometry(6.8, 6.8, segs, segs);
  canopyGeo.rotateX(-Math.PI / 2);
  const pos = canopyGeo.attributes.position;
  const w = 6.8, d = 6.8, h = 2.2;
  const R = 3.4;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const r = Math.hypot(vx, vz);
    const angle = Math.atan2(vz, vx);
    const edgeLift = Math.pow(r / R, 2.2) * (h * 0.7);
    const cornerPeaks = Math.cos(angle * 4) * Math.pow(r / R, 1.8) * 0.45;
    const centerSag = Math.cos((r / R) * (Math.PI / 2)) * 0.35;
    const ripples = Math.sin((vx / (w * 0.5)) * Math.PI * 2) * Math.sin((vz / (d * 0.5)) * Math.PI * 2) * 0.15;
    pos.setY(i, 1.70 + edgeLift + cornerPeaks - centerSag + ripples);
  }
  canopyGeo.computeVertexNormals();

  const canopyMesh = new THREE.Mesh(canopyGeo, alabasterCanopyMat);
  canopyMesh.castShadow = true;
  canopyMesh.receiveShadow = true;
  group.add(canopyMesh);

  const diamondVerts = [];
  const cellGeo = new THREE.BoxGeometry(0.35, 0.05, 0.35);
  cellGeo.rotateY(Math.PI / 4);
  const cellCoords = [];

  for (let ix = 1; ix < segs - 1; ix += 2) {
    for (let iz = 1; iz < segs - 1; iz += 2) {
      const vx = -w * 0.5 + (ix / segs) * w;
      const vz = -d * 0.5 + (iz / segs) * d;
      const r = Math.hypot(vx, vz);
      if (r < R * 0.88) {
        const angle = Math.atan2(vz, vx);
        const vy = 1.70 + Math.pow(r / R, 2.2) * (h * 0.7) + Math.cos(angle * 4) * Math.pow(r / R, 1.8) * 0.45;
        cellCoords.push([vx, vy + 0.02, vz]);

        const step = w / segs;
        diamondVerts.push(
          vx, vy + 0.04, vz - step,
          vx + step, vy + 0.04, vz,
          vx + step, vy + 0.04, vz,
          vx, vy + 0.04, vz + step,
          vx, vy + 0.04, vz + step,
          vx - step, vy + 0.04, vz,
          vx - step, vy + 0.04, vz,
          vx, vy + 0.04, vz - step
        );
      }
    }
  }

  const cellsInstanced = new THREE.InstancedMesh(cellGeo, bronzeRoofMat, cellCoords.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < cellCoords.length; i++) {
    dummy.position.set(cellCoords[i][0], cellCoords[i][1], cellCoords[i][2]);
    dummy.updateMatrix();
    cellsInstanced.setMatrixAt(i, dummy.matrix);
  }
  cellsInstanced.instanceMatrix.needsUpdate = true;
  group.add(cellsInstanced);

  const diamondGeo = new THREE.BufferGeometry();
  diamondGeo.setAttribute('position', new THREE.Float32BufferAttribute(diamondVerts, 3));
  group.add(new THREE.LineSegments(diamondGeo, diamondRidgeMat));

  const oculus = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.3, 16), warmGlazingMat);
  oculus.position.set(0, 2.35, 0);
  group.add(oculus);

  const light = new THREE.PointLight(0xffdf88, 2.0, 22, 1.4);
  light.position.set(0, 3.2, 0);
  group.add(light);

  districtLandmarksGroup.add(group);
  return group;
}

// 5. GOOGLEPLEX COURTYARD COMPLEX (Buildings 40–43, Exact 1:1 OSM Centroid: x=-3.90, z=-28.75)
export function buildGoogleplexCampus(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'GoogleplexCampus';
  group.position.set(-3.90, 0, -28.75);
  group.rotation.y = -0.12;
  group.scale.setScalar(0.42);

  const stoneSpandrelMat = new THREE.MeshStandardMaterial({
    color: 0xdfd9ce,
    roughness: 0.55,
    metalness: 0.06
  });

  const curtainWallMat = new THREE.MeshStandardMaterial({
    color: 0x5a88a5,
    emissive: 0x14344d,
    emissiveIntensity: 0.42,
    roughness: 0.22,
    metalness: 0.40
  });

  const solarPanelMat = new THREE.MeshStandardMaterial({
    color: 0x12233f,
    emissive: 0x061124,
    emissiveIntensity: 0.35,
    roughness: 0.18,
    metalness: 0.75
  });

  const solarCanopyTrimMat = new THREE.MeshStandardMaterial({
    color: 0x3d4b58,
    roughness: 0.42,
    metalness: 0.65
  });

  const courtyardLawnMat = new THREE.MeshStandardMaterial({
    color: 0x4a7c59,
    roughness: 0.88
  });

  const quadLawn = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 3.6), courtyardLawnMat);
  quadLawn.position.set(0, 0.04, 0);
  quadLawn.receiveShadow = true;
  group.add(quadLawn);

  const pathMat = new THREE.MeshStandardMaterial({ color: 0xc8c2b5, roughness: 0.7 });
  const path1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.09, 0.4), pathMat);
  path1.position.set(0, 0.05, 0);
  path1.rotation.y = 0.4;
  group.add(path1);

  const stanchionGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6);

  function createOfficeWing(w, d, h, ox, oz, wingName, hasSolar = true) {
    const wing = new THREE.Group();
    wing.name = wingName;
    wing.position.set(ox, 0, oz);

    const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.3, d * 0.96), stoneSpandrelMat);
    base.position.y = 0.15;
    wing.add(base);

    const glassCore = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h - 0.3, d * 0.92), curtainWallMat);
    glassCore.position.y = 0.3 + (h - 0.3) * 0.5;
    glassCore.castShadow = true;
    wing.add(glassCore);

    const levels = 3;
    for (let l = 1; l < levels; l++) {
      const spandrel = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), stoneSpandrelMat);
      spandrel.position.y = (h / levels) * l;
      spandrel.castShadow = true;
      wing.add(spandrel);
    }

    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.12, d * 0.98), stoneSpandrelMat);
    parapet.position.y = h + 0.06;
    wing.add(parapet);

    if (hasSolar) {
      [
        [-w * 0.35, -d * 0.35],
        [w * 0.35, -d * 0.35],
        [-w * 0.35, d * 0.35],
        [w * 0.35, d * 0.35]
      ].forEach(([px, pz]) => {
        const post = new THREE.Mesh(stanchionGeo, solarCanopyTrimMat);
        post.position.set(px, h + 0.26, pz);
        wing.add(post);
      });

      const solarTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.06, d * 0.85), solarPanelMat);
      solarTop.position.set(0, h + 0.48, 0);
      solarTop.rotation.x = -0.08;
      wing.add(solarTop);
    }

    return wing;
  }

  group.add(createOfficeWing(2.8, 1.8, 1.6, 2.4, -1.9, 'Googleplex_B40', true));
  group.add(createOfficeWing(2.4, 1.6, 1.4, 2.2, 1.9, 'Googleplex_B41', true));
  group.add(createOfficeWing(2.4, 1.6, 1.4, -2.2, 1.9, 'Googleplex_B42', true));
  group.add(createOfficeWing(2.8, 1.8, 1.6, -2.4, -1.9, 'Googleplex_B43', true));

  const bridgeMat = new THREE.MeshStandardMaterial({
    color: 0x9ecfe6,
    emissive: 0x24516e,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2
  });
  const skybridgeNorth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.5), bridgeMat);
  skybridgeNorth.position.set(0, 1.05, -1.9);
  group.add(skybridgeNorth);

  const skybridgeSouth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.5), bridgeMat);
  skybridgeSouth.position.set(0, 0.95, 1.9);
  group.add(skybridgeSouth);

  const courtyardLight = new THREE.PointLight(0xffdf88, 1.8, 18, 1.2);
  courtyardLight.position.set(0, 2.4, 0);
  group.add(courtyardLight);

  districtLandmarksGroup.add(group);
  return group;
}

// 6. COMPUTER HISTORY MUSEUM (Exact 1:1 OSM Centroid: x=3.63, z=-18.47)
export function buildComputerHistoryMuseum(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'ComputerHistoryMuseum';
  group.position.set(3.63, 0, -18.47);
  group.rotation.y = 0.35;
  group.scale.setScalar(0.40);

  const museumWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf2eee6,
    roughness: 0.35,
    metalness: 0.05
  });

  const galleriaGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffe2a4,
    emissive: 0xb86c18,
    emissiveIntensity: 0.45,
    roughness: 0.20,
    metalness: 0.15
  });

  const bronzeFasciaMat = new THREE.MeshStandardMaterial({
    color: 0x36281a,
    roughness: 0.42,
    metalness: 0.35
  });

  const plazaStoneMat = new THREE.MeshStandardMaterial({
    color: 0xd8d0c2,
    roughness: 0.65
  });

  const plaza = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.15, 6.8), plazaStoneMat);
  plaza.position.set(0, 0.08, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  const mainHall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.8, 5.6), museumWhiteMat);
  mainHall.position.set(-0.3, 0.98, 0.1);
  mainHall.castShadow = true;
  mainHall.receiveShadow = true;
  group.add(mainHall);

  const galleria = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 5.2), galleriaGlassMat);
  galleria.position.set(1.4, 0.88, 0.1);
  galleria.castShadow = true;
  group.add(galleria);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 5.4), bronzeFasciaMat);
  canopy.position.set(1.3, 1.72, 0.1);
  canopy.castShadow = true;
  group.add(canopy);

  const rotunda = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.8, 16), galleriaGlassMat);
  rotunda.position.set(1.2, 0.98, -1.6);
  rotunda.castShadow = true;
  group.add(rotunda);

  const rotundaRoof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.3, 16), bronzeFasciaMat);
  rotundaRoof.position.set(1.2, 1.95, -1.6);
  group.add(rotundaRoof);

  const m1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.8), bronzeFasciaMat);
  m1.position.set(-0.6, 1.95, -0.8);
  group.add(m1);

  const m2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 1.8), bronzeFasciaMat);
  m2.position.set(-0.6, 1.95, 1.1);
  group.add(m2);

  const light = new THREE.PointLight(0xffb84d, 1.8, 20, 1.4);
  light.position.set(1.6, 2.2, 0);
  group.add(light);

  districtLandmarksGroup.add(group);
  return group;
}

// 7. NASA AMES HANGAR TWO (Exact 1:1 OSM Centroid: x=39.82, z=-21.37, rot.y=-0.55 rad)
export function buildNasaHangarTwo(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'NasaAmesHangarTwo';
  group.position.set(39.82, 0, -21.37);
  group.rotation.y = -0.55;
  group.scale.setScalar(0.48);

  const length = 21.0;
  const width = 9.8;
  const height = 6.6;

  const foundationMat = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.88 });
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(width * 1.05, 0.22, length * 1.04), foundationMat);
  foundation.position.y = 0.11;
  foundation.receiveShadow = true;
  group.add(foundation);

  const vaultGeo = new THREE.PlaneGeometry(1, 1, 32, 16);
  const vPos = vaultGeo.attributes.position;
  for (let i = 0; i < vPos.count; i++) {
    const u = vPos.getX(i) + 0.5;
    const v = vPos.getY(i) + 0.5;
    const theta = u * Math.PI;
    const x = Math.cos(theta) * (width * 0.5);
    const y = Math.sin(theta) * height;
    const z = (v - 0.5) * length;
    vPos.setXYZ(i, x, y, z);
  }
  vaultGeo.computeVertexNormals();
  const vaultMat = new THREE.MeshStandardMaterial({
    color: 0x9ba2a8,
    roughness: 0.72,
    metalness: 0.12,
    side: THREE.DoubleSide
  });
  const vaultMesh = new THREE.Mesh(vaultGeo, vaultMat);
  vaultMesh.castShadow = true;
  vaultMesh.receiveShadow = true;
  group.add(vaultMesh);

  const ribMat = new THREE.MeshStandardMaterial({ color: 0x6e6259, roughness: 0.78, metalness: 0.08 });
  const ribGeo = new THREE.TorusGeometry(width * 0.5, 0.09, 6, 28, Math.PI);
  ribGeo.scale(1.0, height / (width * 0.5), 1.0);
  const ribsInstanced = new THREE.InstancedMesh(ribGeo, ribMat, 11);
  const dummy = new THREE.Object3D();
  for (let iz = 0; iz <= 10; iz++) {
    const zPos = ((iz / 10) - 0.5) * length;
    dummy.position.set(0, 0, zPos);
    dummy.updateMatrix();
    ribsInstanced.setMatrixAt(iz, dummy.matrix);
  }
  ribsInstanced.instanceMatrix.needsUpdate = true;
  ribsInstanced.castShadow = true;
  group.add(ribsInstanced);

  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xd2cdc4, roughness: 0.76 });
  const pylonGeo = new THREE.BoxGeometry(0.78, height * 1.04, 1.1);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.set(sx * width * 0.5, height * 0.52, sz * length * 0.495);
    pylon.castShadow = true;
    group.add(pylon);
  });

  const doorMat = new THREE.MeshStandardMaterial({ color: 0x424a54, roughness: 0.65 });
  [-1, 1].forEach((sz) => {
    const door = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, height * 0.64, 0.22), doorMat);
    door.position.set(0, height * 0.32, sz * length * 0.49);
    door.castShadow = true;
    group.add(door);

    const transomGeo = new THREE.CylinderGeometry(width * 0.43, width * 0.43, 0.2, 18, 1, false, 0, Math.PI);
    transomGeo.scale(1.0, 0.2, (height * 0.36) / (width * 0.43));
    transomGeo.rotateX(Math.PI / 2);
    const transom = new THREE.Mesh(transomGeo, new THREE.MeshStandardMaterial({ color: 0x68727d, roughness: 0.7 }));
    transom.position.set(0, height * 0.64, sz * length * 0.49);
    group.add(transom);
  });

  const leantoMat = new THREE.MeshStandardMaterial({ color: 0xc8c4bc, roughness: 0.62 });
  [-1, 1].forEach((sx) => {
    const leanto = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.92, length * 0.90), leantoMat);
    leanto.position.set(sx * (width * 0.5 + 0.47), 0.46, 0);
    leanto.castShadow = true;
    group.add(leanto);
  });

  const monitorGeo = new THREE.BoxGeometry(1.3, 0.38, length * 0.88);
  const monitorMat = new THREE.MeshStandardMaterial({ color: 0x343b44, roughness: 0.68, metalness: 0.28 });
  const monitor = new THREE.Mesh(monitorGeo, monitorMat);
  monitor.position.set(0, height + 0.19, 0);
  group.add(monitor);

  const apronLight = new THREE.PointLight(0xffb86c, 0.9, 14, 1.8);
  apronLight.position.set(0, 2.8, -length * 0.48);
  group.add(apronLight);

  districtLandmarksGroup.add(group);
  return group;
}

// 8. NASA AMES NFAC 40x80 / 80x120 WIND TUNNEL COMPLEX (Exact 1:1 OSM Centroid: x=18.60, z=-20.60)
export function buildNasaAmesWindTunnel(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'NasaAmesWindTunnel';
  group.position.set(18.60, 0, -20.60);
  group.scale.setScalar(0.48);

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(15.2, 0.24, 12.8),
    new THREE.MeshStandardMaterial({ color: 0x181e26, roughness: 0.88 })
  );
  pad.position.y = 0.12;
  pad.receiveShadow = true;
  group.add(pad);

  const hornMat = new THREE.MeshStandardMaterial({ color: 0xe0e5eb, roughness: 0.42, metalness: 0.22 });
  const mouthOuter = new THREE.Mesh(new THREE.BoxGeometry(6.8, 4.4, 1.2), hornMat);
  mouthOuter.position.set(-3.2, 2.4, -3.8);
  mouthOuter.castShadow = true;
  group.add(mouthOuter);

  const throatInner = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 3.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x080c12, roughness: 0.95 })
  );
  throatInner.position.set(-3.2, 2.4, -3.6);
  group.add(throatInner);

  const vaneMat = new THREE.MeshStandardMaterial({ color: 0x8a94a0, roughness: 0.5, metalness: 0.4 });
  [-1.8, 0, 1.8].forEach((vx) => {
    const vVane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.6, 1.4), vaneMat);
    vVane.position.set(-3.2 + vx, 2.4, -3.6);
    group.add(vVane);
  });
  [-0.9, 0.9].forEach((vy) => {
    const hVane = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.12, 1.4), vaneMat);
    hVane.position.set(-3.2, 2.4 + vy, -3.6);
    group.add(hVane);
  });

  const nozzle = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.6, 3.2), hornMat);
  nozzle.position.set(-3.2, 2.2, -1.8);
  nozzle.castShadow = true;
  group.add(nozzle);

  const conduitMat = new THREE.MeshStandardMaterial({
    color: 0x98a4b0,
    roughness: 0.38,
    metalness: 0.58
  });
  const westTubeGeo = new THREE.CylinderGeometry(0.9, 0.9, 8.4, 20);
  westTubeGeo.rotateX(Math.PI / 2);
  const westTube = new THREE.Mesh(westTubeGeo, conduitMat);
  westTube.position.set(-3.2, 2.2, 2.4);
  westTube.castShadow = true;
  group.add(westTube);

  const eastTubeGeo = new THREE.CylinderGeometry(0.9, 0.9, 8.4, 20);
  eastTubeGeo.rotateX(Math.PI / 2);
  const eastTube = new THREE.Mesh(eastTubeGeo, conduitMat);
  eastTube.position.set(3.2, 2.2, 2.4);
  eastTube.castShadow = true;
  group.add(eastTube);

  const crossTubeGeo = new THREE.CylinderGeometry(0.85, 0.85, 6.4, 20);
  crossTubeGeo.rotateZ(Math.PI / 2);
  const northCross = new THREE.Mesh(crossTubeGeo, conduitMat);
  northCross.position.set(0, 2.2, -1.8);
  northCross.castShadow = true;
  group.add(northCross);

  const southCross = new THREE.Mesh(crossTubeGeo, conduitMat);
  southCross.position.set(0, 2.2, 6.6);
  southCross.castShadow = true;
  group.add(southCross);

  const elbowMat = new THREE.MeshStandardMaterial({ color: 0x768290, roughness: 0.44, metalness: 0.45 });
  const elbowGeo = new THREE.BoxGeometry(2.0, 2.0, 2.0);
  [[-3.2, -1.8], [3.2, -1.8], [-3.2, 6.6], [3.2, 6.6]].forEach(([ex, ez]) => {
    const elbow = new THREE.Mesh(elbowGeo, elbowMat);
    elbow.position.set(ex, 2.2, ez);
    elbow.castShadow = true;
    group.add(elbow);
  });

  const motorMat = new THREE.MeshStandardMaterial({ color: 0x2b3846, roughness: 0.52, metalness: 0.32 });
  const motorHall = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 4.2), motorMat);
  motorHall.position.set(0, 1.8, 2.4);
  motorHall.castShadow = true;
  group.add(motorHall);

  const mechMat = new THREE.MeshStandardMaterial({ color: 0x485666, roughness: 0.65 });
  const mechPenthouse = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.82, 2.6), mechMat);
  mechPenthouse.position.set(0, 3.9, 2.4);
  group.add(mechPenthouse);

  const exhaustTower = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 4.2, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x1e2632, roughness: 0.82 })
  );
  exhaustTower.position.set(4.2, 2.2, -3.2);
  exhaustTower.castShadow = true;
  group.add(exhaustTower);

  const labMat = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.48 });
  const labWing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 3.2), labMat);
  labWing.position.set(4.4, 0.9, 1.8);
  labWing.castShadow = true;
  group.add(labWing);

  const windowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
  const windowRibbon = new THREE.Mesh(new THREE.BoxGeometry(3.64, 0.42, 1.8), windowMat);
  windowRibbon.position.set(4.4, 1.2, 1.8);
  group.add(windowRibbon);

  const beaconGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, 4.45, 2.4);
  group.add(beaconMesh);

  const labLight = new THREE.PointLight(0x38bdf8, 1.2, 14, 1.8);
  labLight.position.set(0, 4.6, 2.4);
  group.add(labLight);

  districtLandmarksGroup.add(group);
  return group;
}

// 9. MOUNTAIN VIEW DOWNTOWN TRANSIT CENTER (Exact 1:1 OSM Centroid: x=4.85, z=9.35, rot.y=-0.46 rad)
export function buildDowntownTransitCenter(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'MountainViewDowntownTransitCenter';
  group.position.set(4.85, 0.0, 9.35);
  group.rotation.y = -0.46; // Parallel to Caltrain tracks (~ -26.35 deg)
  group.scale.setScalar(0.55);

  const stuccoMat = new THREE.MeshStandardMaterial({ color: 0xede6d8, roughness: 0.68, metalness: 0.05 });
  const stuccoTrimMat = new THREE.MeshStandardMaterial({ color: 0xdfd6c4, roughness: 0.60 });
  const tileRoofMat = new THREE.MeshStandardMaterial({ color: 0xba5028, roughness: 0.42, metalness: 0.08 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.75 });
  const clockFaceMat = new THREE.MeshBasicMaterial({ color: 0xfffae6 });
  const clockBezelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 });
  const bellBronzeMat = new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.35, metalness: 0.7 });
  const canopyRoofMat = new THREE.MeshStandardMaterial({ color: 0x2a3e35, roughness: 0.55 });
  const platformDeckMat = new THREE.MeshStandardMaterial({ color: 0x9e988f, roughness: 0.85 });
  const tactileWarningMat = new THREE.MeshBasicMaterial({ color: 0xf5a623 });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.18, 4.4), stuccoTrimMat);
  plinth.position.set(0.4, 0.09, 0.8);
  plinth.receiveShadow = true;
  group.add(plinth);

  const depot = new THREE.Mesh(new THREE.BoxGeometry(5.0, 1.85, 2.6), stuccoMat);
  depot.position.set(0.2, 1.015, 0.8);
  depot.castShadow = true;
  depot.receiveShadow = true;
  group.add(depot);

  const eaveBand = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 3.0), darkWoodMat);
  eaveBand.position.set(0.2, 1.95, 0.8);
  group.add(eaveBand);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.25, 4), tileRoofMat);
  roof.position.set(0.2, 2.50, 0.8);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const entryPortal = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.1), darkWoodMat);
  entryPortal.position.set(0.2, 0.69, 2.11);
  group.add(entryPortal);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.2, 1.4), stuccoMat);
  tower.position.set(2.2, 2.19, 1.4);
  tower.castShadow = true;
  group.add(tower);

  const towerCornice = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.14, 1.55), stuccoTrimMat);
  towerCornice.position.set(2.2, 4.36, 1.4);
  group.add(towerCornice);

  const belfryFloor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 1.4), stuccoTrimMat);
  belfryFloor.position.set(2.2, 5.15, 1.4);
  group.add(belfryFloor);

  [[-0.55, -0.55], [-0.55, 0.55], [0.55, -0.55], [0.55, 0.55]].forEach(([cx, cz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.75, 8), stuccoTrimMat);
    col.position.set(2.2 + cx, 4.75, 1.4 + cz);
    group.add(col);
  });

  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.32, 12), bellBronzeMat);
  bell.position.set(2.2, 4.75, 1.4);
  group.add(bell);

  const towerCap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.35, 4), tileRoofMat);
  towerCap.position.set(2.2, 5.85, 1.4);
  towerCap.rotation.y = Math.PI / 4;
  towerCap.castShadow = true;
  group.add(towerCap);

  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.6, 8), bellBronzeMat);
  finial.position.set(2.2, 6.75, 1.4);
  group.add(finial);

  const clockGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16);
  const bezelGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.03, 16);

  const clockS = new THREE.Mesh(clockGeom, clockFaceMat);
  clockS.position.set(2.2, 3.65, 2.12);
  clockS.rotation.x = Math.PI / 2;
  const bezelS = new THREE.Mesh(bezelGeom, clockBezelMat);
  bezelS.position.set(2.2, 3.65, 2.11);
  bezelS.rotation.x = Math.PI / 2;
  group.add(bezelS);
  group.add(clockS);

  const clockN = new THREE.Mesh(clockGeom, clockFaceMat);
  clockN.position.set(2.2, 3.65, 0.68);
  clockN.rotation.x = -Math.PI / 2;
  const bezelN = new THREE.Mesh(bezelGeom, clockBezelMat);
  bezelN.position.set(2.2, 3.65, 0.69);
  bezelN.rotation.x = -Math.PI / 2;
  group.add(bezelN);
  group.add(clockN);

  const arcadeRoof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.9), tileRoofMat);
  arcadeRoof.position.set(0.1, 1.45, -0.7);
  group.add(arcadeRoof);

  const platform = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.22, 1.6), platformDeckMat);
  platform.position.set(-0.6, 0.11, -1.6);
  platform.receiveShadow = true;
  group.add(platform);

  const tactile = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.02, 0.12), tactileWarningMat);
  tactile.position.set(-0.6, 0.23, -2.35);
  group.add(tactile);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.14, 1.5), canopyRoofMat);
  canopy.position.set(-0.6, 1.65, -1.6);
  canopy.castShadow = true;
  group.add(canopy);

  const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.18, 0.25), stuccoTrimMat);
  ridgeCap.position.set(-0.6, 1.78, -1.6);
  group.add(ridgeCap);

  districtLandmarksGroup.add(group);
  return group;
}

// 10. MOUNTAIN VIEW CIVIC CENTER & PERFORMING ARTS (Exact 1:1 OSM Centroid: x=-1.69, z=14.58, rot.y=-0.46 rad)
export function buildCivicCenter(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'MountainViewCivicCenter';
  group.position.set(-1.69, 0.0, 14.58);
  group.rotation.y = -0.46; // Aligned with Downtown Castro St grid
  group.scale.setScalar(0.55);

  const civicStuccoMat = new THREE.MeshStandardMaterial({ color: 0xf2ece1, roughness: 0.65, metalness: 0.05 });
  const civicTrimMat = new THREE.MeshStandardMaterial({ color: 0xe0d6c3, roughness: 0.58 });
  const spanishRoofMat = new THREE.MeshStandardMaterial({ color: 0xb84e26, roughness: 0.40, metalness: 0.08 });
  const copperRoofMat = new THREE.MeshStandardMaterial({ color: 0x4a7c6d, roughness: 0.38, metalness: 0.25 });
  const theaterFlyMat = new THREE.MeshStandardMaterial({ color: 0xd9cebe, roughness: 0.70 });
  const civicGlazingMat = new THREE.MeshStandardMaterial({
    color: 0x1f3448,
    roughness: 0.18,
    metalness: 0.85,
    emissive: 0x0c2032,
    emissiveIntensity: 0.28
  });
  const civicPlazaMat = new THREE.MeshStandardMaterial({ color: 0xc8beb0, roughness: 0.82 });
  const fountainWaterMat = new THREE.MeshStandardMaterial({
    color: 0x1c88a8,
    roughness: 0.10,
    metalness: 0.30,
    emissive: 0x0a4052,
    emissiveIntensity: 0.40
  });
  const clockDialMat = new THREE.MeshBasicMaterial({ color: 0xfffae6 });
  const clockBezelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 });
  const bronzeTrimMat = new THREE.MeshStandardMaterial({ color: 0x5a4428, roughness: 0.40, metalness: 0.70 });

  const plaza = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.20, 8.4), civicPlazaMat);
  plaza.position.set(0.0, 0.10, 0.0);
  plaza.receiveShadow = true;
  group.add(plaza);

  const fountainRing = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.28, 24), civicTrimMat);
  fountainRing.position.set(0.0, 0.24, 0.2);
  fountainRing.receiveShadow = true;
  group.add(fountainRing);

  const fountainPool = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.04, 24), fountainWaterMat);
  fountainPool.position.set(0.0, 0.36, 0.2);
  group.add(fountainPool);

  const rotundaDrum = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 1.8, 24), civicStuccoMat);
  rotundaDrum.position.set(-1.4, 1.10, 0.0);
  rotundaDrum.castShadow = true;
  rotundaDrum.receiveShadow = true;
  group.add(rotundaDrum);

  const rotundaGlass = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.7, 24), civicGlazingMat);
  rotundaGlass.position.set(-1.4, 2.35, 0.0);
  group.add(rotundaGlass);

  const rotundaCap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 24), copperRoofMat);
  rotundaCap.position.set(-1.4, 3.25, 0.0);
  rotundaCap.castShadow = true;
  group.add(rotundaCap);

  const rotundaCupola = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.45, 12), civicTrimMat);
  rotundaCupola.position.set(-1.4, 4.0, 0.0);
  group.add(rotundaCupola);

  const cupolaFinial = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.35, 12), copperRoofMat);
  cupolaFinial.position.set(-1.4, 4.4, 0.0);
  group.add(cupolaFinial);

  const southWing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 3.2), civicStuccoMat);
  southWing.position.set(-2.8, 1.30, 1.6);
  southWing.castShadow = true;
  group.add(southWing);

  const southRoof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.2, 4), spanishRoofMat);
  southRoof.position.set(-2.8, 2.90, 1.6);
  southRoof.rotation.y = Math.PI / 4;
  southRoof.castShadow = true;
  group.add(southRoof);

  const eastWing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 2.8), civicStuccoMat);
  eastWing.position.set(-0.4, 1.30, 2.2);
  eastWing.castShadow = true;
  group.add(eastWing);

  const eastRoof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.1, 4), spanishRoofMat);
  eastRoof.position.set(-0.4, 2.85, 2.2);
  eastRoof.rotation.y = Math.PI / 4;
  eastRoof.castShadow = true;
  group.add(eastRoof);

  const campanile = new THREE.Mesh(new THREE.BoxGeometry(1.3, 5.2, 1.3), civicStuccoMat);
  campanile.position.set(1.6, 2.70, 1.8);
  campanile.castShadow = true;
  group.add(campanile);

  const campanileBand = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.15, 1.45), civicTrimMat);
  campanileBand.position.set(1.6, 4.85, 1.8);
  group.add(campanileBand);

  const belfryLoggia = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 1.2), civicTrimMat);
  belfryLoggia.position.set(1.6, 5.45, 1.8);
  group.add(belfryLoggia);

  const campanileCap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.25, 4), spanishRoofMat);
  campanileCap.position.set(1.6, 6.45, 1.8);
  campanileCap.rotation.y = Math.PI / 4;
  campanileCap.castShadow = true;
  group.add(campanileCap);

  const campanileFinial = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 8), bronzeTrimMat);
  campanileFinial.position.set(1.6, 7.30, 1.8);
  group.add(campanileFinial);

  const cDialGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16);
  const cBezelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16);
  const dEast = new THREE.Mesh(cDialGeom, clockDialMat);
  dEast.position.set(2.26, 4.30, 1.8);
  dEast.rotation.z = -Math.PI / 2;
  const bEast = new THREE.Mesh(cBezelGeom, clockBezelMat);
  bEast.position.set(2.25, 4.30, 1.8);
  bEast.rotation.z = -Math.PI / 2;
  group.add(bEast);
  group.add(dEast);

  const auditorium = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.8, 3.6), civicStuccoMat);
  auditorium.position.set(2.2, 1.60, -1.2);
  auditorium.castShadow = true;
  group.add(auditorium);

  const theaterRoof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.22, 3.8), spanishRoofMat);
  theaterRoof.position.set(2.2, 3.05, -1.2);
  group.add(theaterRoof);

  const flyTower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.8, 2.4), theaterFlyMat);
  flyTower.position.set(3.4, 2.60, -2.4);
  flyTower.castShadow = true;
  group.add(flyTower);

  const flyCornice = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.16, 2.55), civicTrimMat);
  flyCornice.position.set(3.4, 5.08, -2.4);
  group.add(flyCornice);

  const lobbyCurtain = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 1.9, 2.0, 16, 1, false, 0, Math.PI),
    civicGlazingMat
  );
  lobbyCurtain.position.set(1.2, 1.20, -0.2);
  lobbyCurtain.rotation.y = Math.PI / 2;
  group.add(lobbyCurtain);

  const marqueeCanopy = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.2), civicTrimMat);
  marqueeCanopy.position.set(1.2, 1.50, 0.6);
  group.add(marqueeCanopy);

  districtLandmarksGroup.add(group);
  return group;
}

// 11. SAN ANTONIO CENTER TOD VILLAGE (Exact 1:1 OSM Centroid: x=-30.50, z=-1.90, rot.y=0.42 rad)
export function buildSanAntonioCenter(THREE, districtLandmarksGroup) {
  const group = new THREE.Group();
  group.name = 'SanAntonioCenter';
  group.position.set(-30.50, 0.0, -1.90);
  group.rotation.y = 0.42; // Aligned with El Camino Real / Showers Dr grid
  group.scale.setScalar(0.55);

  const podiumMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.52, metalness: 0.08 });
  const retailGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffe09e,
    emissive: 0xcc7718,
    emissiveIntensity: 0.38,
    roughness: 0.22,
    metalness: 0.15
  });
  const arcadeGlassMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    emissive: 0x184466,
    emissiveIntensity: 0.30,
    roughness: 0.18,
    metalness: 0.85
  });
  const residentialTowerMat = new THREE.MeshStandardMaterial({ color: 0xd8d4cb, roughness: 0.45, metalness: 0.12 });
  const residentialAccentMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3e, roughness: 0.60 });
  const windowBandMat = new THREE.MeshStandardMaterial({ color: 0x1e2d3d, roughness: 0.20, metalness: 0.80 });
  const roofTerraceMat = new THREE.MeshStandardMaterial({ color: 0x426848, roughness: 0.88 });
  const poolDeckMat = new THREE.MeshStandardMaterial({
    color: 0x2288aa,
    emissive: 0x0a3344,
    emissiveIntensity: 0.42,
    roughness: 0.12,
    metalness: 0.30
  });
  const mechanicalScreenMat = new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.42, metalness: 0.65 });

  const podium = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.45, 6.6), podiumMat);
  podium.position.set(0.0, 0.725, 0.0);
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  const retailBand = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.55, 6.7), retailGlassMat);
  retailBand.position.set(0.0, 0.35, 0.0);
  group.add(retailBand);

  const arcadeSpine = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.85, 2.0), arcadeGlassMat);
  arcadeSpine.position.set(0.0, 0.50, 0.0);
  group.add(arcadeSpine);

  const skylight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 8.4, 16, 1, false, 0, Math.PI),
    arcadeGlassMat
  );
  skylight.position.set(0.0, 1.45, 0.0);
  skylight.rotation.z = Math.PI / 2;
  group.add(skylight);

  const tower1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 2.8), residentialTowerMat);
  tower1.position.set(-2.2, 2.42, 1.5);
  tower1.castShadow = true;
  group.add(tower1);

  const tower1Accent = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.5, 2.9), residentialAccentMat);
  tower1Accent.position.set(-3.0, 2.47, 1.5);
  group.add(tower1Accent);

  [1.6, 2.3, 3.0, 3.7].forEach((wy) => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.28, 2.85), windowBandMat);
    band.position.set(-2.2, wy, 1.5);
    group.add(band);
  });

  const mech1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.65, 1.8), mechanicalScreenMat);
  mech1.position.set(-2.2, 4.45, 1.5);
  group.add(mech1);

  const tower2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 2.8), residentialTowerMat);
  tower2.position.set(2.2, 2.12, -1.3);
  tower2.castShadow = true;
  group.add(tower2);

  const cornerGlass = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.85, 1.4), retailGlassMat);
  cornerGlass.position.set(3.0, 2.15, -0.6);
  group.add(cornerGlass);

  [1.5, 2.2, 2.9].forEach((wy) => {
    const band2 = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.28, 2.85), windowBandMat);
    band2.position.set(2.2, wy, -1.3);
    group.add(band2);
  });

  const mech2 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.8), mechanicalScreenMat);
  mech2.position.set(2.2, 3.80, -1.3);
  group.add(mech2);

  const greenTerrace = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 2.6), roofTerraceMat);
  greenTerrace.position.set(-2.0, 1.48, -1.4);
  greenTerrace.receiveShadow = true;
  group.add(greenTerrace);

  const pool = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.0), poolDeckMat);
  pool.position.set(-2.0, 1.51, -1.4);
  group.add(pool);

  const anchorPavilion = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.65, 2.2), podiumMat);
  anchorPavilion.position.set(2.6, 0.825, 1.8);
  anchorPavilion.castShadow = true;
  group.add(anchorPavilion);

  const anchorGlazing = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.60, 2.25), retailGlassMat);
  anchorGlazing.position.set(2.6, 0.90, 1.8);
  group.add(anchorGlazing);

  districtLandmarksGroup.add(group);
  return group;
}

function mergeLandmarkMeshesByMaterial(THREE, BufferGeometryUtils, landmarkGroup) {
  if (!BufferGeometryUtils || typeof BufferGeometryUtils.mergeGeometries !== 'function') return;
  landmarkGroup.updateMatrixWorld(true);
  const invRoot = landmarkGroup.matrixWorld.clone().invert();
  const byMaterial = new Map();
  const toRemove = [];

  landmarkGroup.traverse((child) => {
    if (!child.isMesh || child.isInstancedMesh) return;
    if (!child.geometry || !child.material || Array.isArray(child.material)) return;
    const mat = child.material;
    let entry = byMaterial.get(mat);
    if (!entry) {
      entry = { mat, geos: [], castShadow: false, receiveShadow: false };
      byMaterial.set(mat, entry);
    }
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    // Ensure consistent attribute set (position, normal) for mergeGeometries
    for (const attrName of Object.keys(g.attributes)) {
      if (attrName !== 'position' && attrName !== 'normal') {
        g.deleteAttribute(attrName);
      }
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const relMatrix = invRoot.clone().multiply(child.matrixWorld);
    g.applyMatrix4(relMatrix);
    entry.geos.push(g);
    if (child.castShadow) entry.castShadow = true;
    if (child.receiveShadow) entry.receiveShadow = true;
    toRemove.push(child);
  });

  if (toRemove.length <= byMaterial.size) return;

  for (const child of toRemove) {
    if (child.parent) child.parent.remove(child);
  }

  for (const { mat, geos, castShadow, receiveShadow } of byMaterial.values()) {
    if (geos.length === 0) continue;
    const merged = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
    if (merged) {
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      landmarkGroup.add(m);
    }
  }
}

/**
 * Builds all 11 Hero 3D Landmarks across `landmarksGroup` (3 primary anchors)
 * and `districtLandmarksGroup` (8 additional rectified landmarks).
 */
export function buildAllHeroLandmarks(THREE, landmarksGroup, districtLandmarksGroup, BufferGeometryUtils = null) {
  buildGoogleBayViewCanopy(THREE, landmarksGroup);
  buildShorelineAmphitheatre(THREE, landmarksGroup);
  buildNasaHangarOne(THREE, landmarksGroup);
  landmarksGroup.updateMatrixWorld(true);

  buildDowntownTransitCenter(THREE, districtLandmarksGroup);
  buildCivicCenter(THREE, districtLandmarksGroup);
  buildSanAntonioCenter(THREE, districtLandmarksGroup);
  buildGoogleCharlestonEast(THREE, districtLandmarksGroup);
  buildGoogleplexCampus(THREE, districtLandmarksGroup);
  buildComputerHistoryMuseum(THREE, districtLandmarksGroup);
  buildNasaHangarTwo(THREE, districtLandmarksGroup);
  buildNasaAmesWindTunnel(THREE, districtLandmarksGroup);
  if (BufferGeometryUtils) {
    districtLandmarksGroup.children.forEach((lm) => {
      mergeLandmarkMeshesByMaterial(THREE, BufferGeometryUtils, lm);
    });
  }
  districtLandmarksGroup.updateMatrixWorld(true);
}
