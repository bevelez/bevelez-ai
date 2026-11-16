// ============================================================================
// Option 5 (ROAD_MODES[4], Key 5): WINDMILL SUNSET — Mojave / Pass Wind Farm
// ============================================================================

function createRadialGlowTexture(THREE, innerRgba, midRgba, outerRgba, size = 128) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size * 0.5;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, innerRgba);
  grad.addColorStop(0.36, midRgba);
  grad.addColorStop(0.72, outerRgba);
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunbeamTexture(THREE) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Horizontal soft bell curve multiplied by vertical fade at top & bottom
  const img = ctx.createImageData(128, 256);
  const data = img.data;
  for (let y = 0; y < 256; y++) {
    const v = y / 255;
    // Fade smoothly at top (sun origin) and bottom (valley floor)
    const vFade = Math.sin(v * Math.PI) ** 1.35 * (1.0 - v * 0.35);
    for (let x = 0; x < 128; x++) {
      const u = (x / 127) * 2 - 1;
      const hFade = Math.exp(-u * u * 4.2);
      const alpha = Math.max(0, Math.min(255, Math.round(hFade * vFade * 255)));
      const idx = (y * 128 + x) * 4;
      data[idx] = 255;
      data[idx + 1] = Math.round(212 - v * 45);
      data[idx + 2] = Math.round(135 - v * 65);
      data[idx + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a 3D extruded desert ridge/mesa silhouette strip from (x, y) control points,
 * plus an optional sun-kissed rim highlight strip along flat/upper escarpment crests.
 */
function buildMesaRibbon(THREE, pointsXY, zFront, depth, baseY, bodyMat, rimMat = null, rimLift = 0.35) {
  const group = new THREE.Group();
  const n = pointsXY.length;
  const positions = [];
  const indices = [];

  // Front face (zFront) + Back face (zFront - depth) + Beveled top ledge
  const zBack = zFront - depth;
  for (let i = 0; i < n; i++) {
    const [x, y] = pointsXY[i];
    // 0: front bottom, 1: front crest, 2: back crest (slightly higher/setback), 3: back bottom
    positions.push(
      x, baseY, zFront,
      x, y, zFront,
      x, y + 0.45, zBack,
      x, baseY, zBack
    );
  }

  for (let i = 0; i < n - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    // Front cliff wall
    indices.push(a + 0, b + 0, b + 1, a + 0, b + 1, a + 1);
    // Sunlit top bevel / plateau cap
    indices.push(a + 1, b + 1, b + 2, a + 1, b + 2, a + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, bodyMat);
  group.add(mesh);

  if (rimMat) {
    const rimPos = [];
    const rimIdx = [];
    for (let i = 0; i < n; i++) {
      const [x, y] = pointsXY[i];
      rimPos.push(
        x, y - 0.22, zFront + 0.08,
        x, y + rimLift, zFront - 0.12
      );
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      rimIdx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    const rimGeo = new THREE.BufferGeometry();
    rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
    rimGeo.setIndex(rimIdx);
    rimGeo.computeVertexNormals();
    group.add(new THREE.Mesh(rimGeo, rimMat));
  }

  return group;
}

/**
 * Evaluates piecewise linear height along a sorted pointsXY ridge profile.
 */
function sampleProfileY(pointsXY, x) {
  if (x <= pointsXY[0][0]) return pointsXY[0][1];
  if (x >= pointsXY[pointsXY.length - 1][0]) return pointsXY[pointsXY.length - 1][1];
  for (let i = 0; i < pointsXY.length - 1; i++) {
    const [x0, y0] = pointsXY[i];
    const [x1, y1] = pointsXY[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / Math.max(1e-5, x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return 0;
}

export function createRoadWorld({ THREE, scene, neonColor }) {
  const group = new THREE.Group();
  group.name = 'WindmillSunsetWorld';
  group.visible = false;
  scene.add(group);

  // ==========================================================================
  // 1. SHARED HORIZON & ATMOSPHERE TEXTURES / MATERIALS (fog: false on horizon)
  // ==========================================================================
  const warmGlowTex = createRadialGlowTexture(
    THREE,
    'rgba(255, 250, 224, 1.0)',
    'rgba(255, 178, 64, 0.62)',
    'rgba(232, 72, 29, 0.16)',
    128
  );
  const redBeaconGlowTex = createRadialGlowTexture(
    THREE,
    'rgba(255, 185, 165, 1.0)',
    'rgba(255, 42, 24, 0.72)',
    'rgba(190, 14, 10, 0.14)',
    64
  );
  const dustMoteTex = createRadialGlowTexture(
    THREE,
    'rgba(255, 248, 215, 1.0)',
    'rgba(255, 196, 92, 0.68)',
    'rgba(255, 128, 42, 0.12)',
    64
  );
  const sunbeamTex = createSunbeamTexture(THREE);

  // Layered desert pass ridge materials (fog: false prevents horizon washout)
  const farCordilleraMat = new THREE.MeshBasicMaterial({
    color: 0x4b1511,
    fog: false,
    side: THREE.DoubleSide
  });
  const farRimMat = new THREE.MeshBasicMaterial({
    color: neonColor('#ff8e36', 1.02),
    fog: false,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide
  });

  const midMesaMat = new THREE.MeshStandardMaterial({
    color: 0x2b0b08,
    emissive: 0x1e0704,
    roughness: 0.86,
    metalness: 0.12,
    fog: false,
    side: THREE.DoubleSide
  });
  const midRimMat = new THREE.MeshBasicMaterial({
    color: neonColor('#ff9d3b', 1.12),
    fog: false,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });

  const nearSpurMat = new THREE.MeshBasicMaterial({
    color: 0x1a0605,
    fog: false,
    side: THREE.DoubleSide
  });

  // ==========================================================================
  // 2. MOJAVE / SAN GORGONIO MOUNTAIN-PASS HORIZON PANORAMA (Z = -236 .. -272)
  // ==========================================================================
  const horizonGroup = new THREE.Group();
  horizonGroup.name = 'MojavePassPanorama';
  group.add(horizonGroup);

  // Dedicated warm golden-hour rim key light for horizon mesas, solar tower & ridge turbines
  const passSunKeyLight = new THREE.PointLight(0xff9a3c, 2600, 260, 1.35);
  passSunKeyLight.position.set(0, 62, -210);
  horizonGroup.add(passSunKeyLight);

  // Tier 1: Far Desert Cordillera (Z = -270, behind scrolling terrainChunks completely)
  const farLeftProfile = [
    [-210, 74], [-182, 68], [-156, 72], [-132, 61], [-108, 64],
    [-86, 52], [-66, 46], [-48, 35], [-32, 26], [-19, 14], [-12.5, 1.2]
  ];
  const farRightProfile = [
    [12.5, 1.2], [20, 15], [34, 28], [52, 37], [70, 48],
    [92, 55], [114, 65], [138, 60], [164, 71], [190, 67], [214, 75]
  ];
  horizonGroup.add(buildMesaRibbon(THREE, farLeftProfile, -270, 10, -4, farCordilleraMat, farRimMat, 0.55));
  horizonGroup.add(buildMesaRibbon(THREE, farRightProfile, -270, 10, -4, farCordilleraMat, farRimMat, 0.55));

  // Tier 2: Midground Flat-Topped Mojave Mesas & Monument Buttes (Z = -252)
  // Carefully sculpted above the V-valley wireframe floor so every plateau & turbine reads crisply!
  const midLeftMesaProfile = [
    [-168, 58], [-142, 56], [-126, 49], [-112, 49], [-98, 43],
    [-76, 43], [-66, 34], [-52, 34], [-44, 24.5], [-28, 24.5],
    [-23.5, 17.5], [-16.2, 17.5], [-13.2, 4.5], [-11.4, -1.0]
  ];
  const midRightMesaProfile = [
    [11.4, -1.0], [13.4, 5.0], [16.5, 19.0], [24.2, 19.0],
    [28.5, 13.5], [33.5, 28.5], [51.0, 28.5], [57.0, 37.5],
    [78.0, 37.5], [86.0, 46.0], [110.0, 46.0], [124.0, 53.0],
    [146.0, 53.0], [170.0, 59.0]
  ];
  horizonGroup.add(buildMesaRibbon(THREE, midLeftMesaProfile, -252, 8, -4, midMesaMat, midRimMat, 0.42));
  horizonGroup.add(buildMesaRibbon(THREE, midRightMesaProfile, -252, 8, -4, midMesaMat, midRimMat, 0.42));

  // Tier 3: Foreground Pass Mouth Foothill Spurs (Z = -236)
  const nearLeftSpur = [
    [-52, 15.5], [-40, 13.2], [-31, 10.5], [-21, 9.2], [-15.0, 5.2], [-11.8, -1.0]
  ];
  const nearRightSpur = [
    [11.8, -1.0], [15.2, 5.6], [22.5, 10.2], [33.0, 12.8], [44.0, 14.8], [56.0, 16.5]
  ];
  horizonGroup.add(buildMesaRibbon(THREE, nearLeftSpur, -236, 6, -4, nearSpurMat, null));
  horizonGroup.add(buildMesaRibbon(THREE, nearRightSpur, -236, 6, -4, nearSpurMat, null));

  // ==========================================================================
  // 3. DISTANT RIDGE-LINE FLEET OF 22 3D WIND TURBINES + SYNCED FAA BEACONS
  // ==========================================================================
  const ridgeTowerMat = new THREE.MeshStandardMaterial({
    color: 0xf4cfb0,
    emissive: 0x3b150c,
    roughness: 0.44,
    metalness: 0.22,
    fog: false
  });
  const ridgeBladeMat = new THREE.MeshBasicMaterial({
    color: 0xffe4c4,
    fog: false,
    side: THREE.DoubleSide
  });

  // Shared geometries for the 22 ridge-line turbines (scaled per turbine for rich depth perspective)
  const unitTowerGeo = new THREE.CylinderGeometry(0.18, 0.34, 1.0, 10);
  unitTowerGeo.translate(0, 0.5, 0);

  const unitNacelleGeo = new THREE.BoxGeometry(0.46, 0.42, 1.35);
  const unitSpinnerGeo = new THREE.ConeGeometry(0.22, 0.62, 10);
  unitSpinnerGeo.rotateX(Math.PI * 0.5);
  unitSpinnerGeo.translate(0, 0, 0.30);

  // Tapered 3D blade geometry extending from hub (0,0,0) along +Y
  const unitBladeGeo = new THREE.ConeGeometry(0.14, 1.0, 5);
  unitBladeGeo.scale(1.0, 1.0, 0.28);
  unitBladeGeo.translate(0, 0.52, 0.04);

  const beaconSphereGeo = new THREE.SphereGeometry(0.24, 8, 6);

  // 4 phased FAA beacon materials so aviation warning strobes ripple naturally across the pass
  const beaconPhaseMats = [0, 1, 2, 3].map(() =>
    new THREE.MeshBasicMaterial({
      color: neonColor('#ff2416', 1.85),
      fog: false
    })
  );

  const ridgeTurbineSpecs = [
    // Left Mesa & Cordillera Fleet (11 turbines: X in [-118, -17])
    { x: -17.8, z: -251.5, profile: midLeftMesaProfile, towerH: 13.5, bladeR: 5.4, yaw: 0.20, speed: 1.32, phase: 0 },
    { x: -21.8, z: -253.0, profile: midLeftMesaProfile, towerH: 12.2, bladeR: 4.9, yaw: 0.16, speed: 1.18, phase: 1 },
    { x: -32.5, z: -251.8, profile: midLeftMesaProfile, towerH: 15.0, bladeR: 6.0, yaw: 0.22, speed: 1.25, phase: 2 },
    { x: -39.5, z: -253.2, profile: midLeftMesaProfile, towerH: 14.0, bladeR: 5.6, yaw: 0.15, speed: 1.38, phase: 3 },
    { x: -55.0, z: -251.6, profile: midLeftMesaProfile, towerH: 16.5, bladeR: 6.6, yaw: 0.18, speed: 1.14, phase: 0 },
    { x: -62.5, z: -253.4, profile: midLeftMesaProfile, towerH: 15.2, bladeR: 6.1, yaw: 0.12, speed: 1.29, phase: 1 },
    { x: -72.0, z: -252.0, profile: midLeftMesaProfile, towerH: 17.2, bladeR: 6.8, yaw: 0.14, speed: 1.21, phase: 2 },
    { x: -83.5, z: -253.5, profile: midLeftMesaProfile, towerH: 16.0, bladeR: 6.3, yaw: 0.10, speed: 1.34, phase: 3 },
    { x: -94.0, z: -269.0, profile: farLeftProfile, towerH: 17.8, bladeR: 7.0, yaw: 0.08, speed: 1.16, phase: 0 },
    { x: -106.5, z: -252.2, profile: midLeftMesaProfile, towerH: 16.8, bladeR: 6.7, yaw: 0.12, speed: 1.27, phase: 1 },
    { x: -118.0, z: -269.2, profile: farLeftProfile, towerH: 18.5, bladeR: 7.3, yaw: 0.08, speed: 1.19, phase: 2 },

    // Right Mesa & Cordillera Fleet (11 turbines: X in [+17, +118])
    { x: 18.0, z: -251.6, profile: midRightMesaProfile, towerH: 13.8, bladeR: 5.5, yaw: -0.18, speed: 1.28, phase: 1 },
    { x: 22.4, z: -253.2, profile: midRightMesaProfile, towerH: 12.6, bladeR: 5.0, yaw: -0.14, speed: 1.17, phase: 2 },
    { x: 36.0, z: -251.8, profile: midRightMesaProfile, towerH: 15.4, bladeR: 6.2, yaw: -0.20, speed: 1.35, phase: 3 },
    { x: 43.5, z: -253.0, profile: midRightMesaProfile, towerH: 14.4, bladeR: 5.8, yaw: -0.15, speed: 1.22, phase: 0 },
    { x: 49.2, z: -251.5, profile: midRightMesaProfile, towerH: 15.8, bladeR: 6.3, yaw: -0.17, speed: 1.30, phase: 1 },
    { x: 61.0, z: -252.0, profile: midRightMesaProfile, towerH: 16.8, bladeR: 6.7, yaw: -0.12, speed: 1.15, phase: 2 },
    { x: 70.5, z: -253.4, profile: midRightMesaProfile, towerH: 15.8, bladeR: 6.2, yaw: -0.10, speed: 1.26, phase: 3 },
    { x: 76.5, z: -251.6, profile: midRightMesaProfile, towerH: 17.0, bladeR: 6.8, yaw: -0.14, speed: 1.33, phase: 0 },
    { x: 91.5, z: -252.2, profile: midRightMesaProfile, towerH: 17.5, bladeR: 7.0, yaw: -0.09, speed: 1.20, phase: 1 },
    { x: 104.0, z: -252.5, profile: midRightMesaProfile, towerH: 16.6, bladeR: 6.6, yaw: -0.11, speed: 1.29, phase: 2 },
    { x: 116.5, z: -269.0, profile: farRightProfile, towerH: 18.6, bladeR: 7.4, yaw: -0.07, speed: 1.18, phase: 3 }
  ];

  const ridgeRotors = [];
  const ridgeBeaconSprites = [];

  ridgeTurbineSpecs.forEach((spec, idx) => {
    const baseCrestY = sampleProfileY(spec.profile, spec.x) - 0.35;
    const tGroup = new THREE.Group();
    tGroup.position.set(spec.x, baseCrestY, spec.z);
    tGroup.rotation.y = spec.yaw;

    const tower = new THREE.Mesh(unitTowerGeo, ridgeTowerMat);
    tower.scale.set(1.0, spec.towerH, 1.0);
    tGroup.add(tower);

    const nacelle = new THREE.Mesh(unitNacelleGeo, ridgeTowerMat);
    nacelle.position.set(0, spec.towerH + 0.2, 0.12);
    tGroup.add(nacelle);

    // Spinning 3-blade rotor centered at hub axle
    const rotorHub = new THREE.Group();
    rotorHub.position.set(0, spec.towerH + 0.22, 0.85);
    rotorHub.rotation.z = idx * 1.13;

    const spinner = new THREE.Mesh(unitSpinnerGeo, ridgeBladeMat);
    rotorHub.add(spinner);

    for (let b = 0; b < 3; b++) {
      const bladeHolder = new THREE.Group();
      bladeHolder.rotation.z = (b * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(unitBladeGeo, ridgeBladeMat);
      blade.scale.set(1.0, spec.bladeR, 1.0);
      bladeHolder.add(blade);
      rotorHub.add(bladeHolder);
    }
    tGroup.add(rotorHub);
    ridgeRotors.push({ rotor: rotorHub, speed: spec.speed });

    // Synchronized Red FAA Aviation Warning Beacon + soft halo sprite
    const beaconMesh = new THREE.Mesh(beaconSphereGeo, beaconPhaseMats[spec.phase]);
    beaconMesh.position.set(0, spec.towerH + 0.62, -0.25);
    tGroup.add(beaconMesh);

    if (redBeaconGlowTex) {
      const spriteMat = new THREE.SpriteMaterial({
        map: redBeaconGlowTex,
        color: neonColor('#ff2e1f', 1.65),
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      });
      const beaconSprite = new THREE.Sprite(spriteMat);
      beaconSprite.position.set(0, spec.towerH + 0.65, -0.25);
      beaconSprite.scale.set(2.4, 2.4, 1.0);
      tGroup.add(beaconSprite);
      ridgeBeaconSprites.push({ sprite: beaconSprite, mat: spriteMat, phase: spec.phase });
    }

    horizonGroup.add(tGroup);
  });

  // ==========================================================================
  // 4. IVANPAH-INSPIRED SOLAR THERMAL RECEIVER TOWER (X = -28.5, Z = -238)
  // ==========================================================================
  const solarComplex = new THREE.Group();
  solarComplex.name = 'SolarThermalTowerComplex';
  solarComplex.position.set(-28.5, 0, -238.0);
  horizonGroup.add(solarComplex);

  // Stepped desert solar-field terrace plinth (Y = 0 .. 8.2m so heliostats clear terrain waves cleanly)
  const solarPlinthMat = new THREE.MeshStandardMaterial({
    color: 0x260a07,
    emissive: 0x160503,
    roughness: 0.88,
    metalness: 0.12,
    fog: false
  });
  const plinthMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(14.5, 16.8, 8.8, 24),
    solarPlinthMat
  );
  plinthMesh.position.y = 4.0;
  solarComplex.add(plinthMesh);

  // Concentric Heliostat Mirror Ring Array at tower base (4 terraced arcs shimmering in golden hour)
  const heliostatMat = new THREE.MeshBasicMaterial({
    color: neonColor('#ffbe55', 1.15),
    transparent: true,
    opacity: 0.78,
    fog: false,
    side: THREE.DoubleSide
  });
  const heliostatRingGroup = new THREE.Group();
  heliostatRingGroup.position.y = 8.52;
  solarComplex.add(heliostatRingGroup);

  const mirrorGeo = new THREE.PlaneGeometry(1.35, 0.82);
  const mirrorRings = [
    { r: 5.2, count: 14, y: 0.05 },
    { r: 7.8, count: 18, y: 0.14 },
    { r: 10.6, count: 22, y: 0.24 },
    { r: 13.4, count: 26, y: 0.34 }
  ];
  const heliostatMirrors = [];
  mirrorRings.forEach((ring, rIdx) => {
    for (let i = 0; i < ring.count; i++) {
      const ang = (i / ring.count) * Math.PI * 2 + rIdx * 0.24;
      const mx = Math.cos(ang) * ring.r;
      const mz = Math.sin(ang) * ring.r;
      const m = new THREE.Mesh(mirrorGeo, heliostatMat);
      m.position.set(mx, ring.y, mz);
      // Tilt mirror upward toward receiver crown at (0, 50, 0)
      m.lookAt(0, 44, 0);
      heliostatRingGroup.add(m);
      heliostatMirrors.push({ mesh: m, baseAng: ang, rIdx });
    }
  });

  // Subtle glowing golden ground ring shimmer beneath heliostats
  if (warmGlowTex) {
    const fieldShimmer = new THREE.Mesh(
      new THREE.PlaneGeometry(31, 31),
      new THREE.MeshBasicMaterial({
        map: warmGlowTex,
        color: neonColor('#ff9d38', 1.1),
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    );
    fieldShimmer.rotation.x = -Math.PI * 0.5;
    fieldShimmer.position.y = 8.48;
    solarComplex.add(fieldShimmer);
  }

  // Slender Tapered Ivanpah Receiver Pylon Shaft (Y = 8.4 .. 49.5m)
  const solarShaftMat = new THREE.MeshStandardMaterial({
    color: 0xd8b89e,
    emissive: 0x34130a,
    roughness: 0.42,
    metalness: 0.36,
    fog: false
  });
  const solarTrimMat = new THREE.MeshStandardMaterial({
    color: 0x2c1412,
    emissive: 0x160705,
    roughness: 0.48,
    metalness: 0.52,
    fog: false
  });

  const shaftH = 41.2;
  const shaftMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.82, shaftH, 12),
    solarShaftMat
  );
  shaftMesh.position.y = 8.4 + shaftH * 0.5;
  solarComplex.add(shaftMesh);

  // 4 Structural corner exoskeleton ribs + maintenance catwalk collars
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, shaftH, 0.28), solarTrimMat);
    rib.position.set(Math.cos(a) * 1.38, 8.4 + shaftH * 0.5, Math.sin(a) * 1.38);
    solarComplex.add(rib);
  }
  [20.0, 32.0, 44.0, 49.4, 56.4].forEach((cy, idx) => {
    const rCollar = idx >= 3 ? 1.68 : 1.72 - idx * 0.14;
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(rCollar, rCollar + 0.08, idx >= 3 ? 0.65 : 0.42, 16),
      solarTrimMat
    );
    collar.position.y = cy;
    solarComplex.add(collar);
  });

  // Blazing Incandescent Golden-White Collector Receiver Crown (Y = 49.7 .. 56.1m)
  const solarCrownMat = new THREE.MeshBasicMaterial({
    color: neonColor('#fff7d6', 2.45),
    fog: false
  });
  const solarCrownMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.46, 6.2, 20),
    solarCrownMat
  );
  solarCrownMesh.position.y = 52.9;
  solarComplex.add(solarCrownMesh);

  // Lattice spire + twin FAA beacons on the Solar Receiver Tower
  const spireMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, 5.2, 8), solarTrimMat);
  spireMesh.position.y = 59.2;
  solarComplex.add(spireMesh);

  const solarTopBeacon = new THREE.Mesh(beaconSphereGeo, beaconPhaseMats[0]);
  solarTopBeacon.position.y = 61.9;
  solarComplex.add(solarTopBeacon);

  let solarCoronaSprite = null;
  let solarOuterHaloSprite = null;
  if (warmGlowTex) {
    const coronaMat = new THREE.SpriteMaterial({
      map: warmGlowTex,
      color: neonColor('#ffe89e', 2.05),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    solarCoronaSprite = new THREE.Sprite(coronaMat);
    solarCoronaSprite.position.set(0, 52.9, 0.4);
    solarCoronaSprite.scale.set(22.0, 22.0, 1.0);
    solarComplex.add(solarCoronaSprite);

    const outerHaloMat = new THREE.SpriteMaterial({
      map: warmGlowTex,
      color: neonColor('#ff8e2b', 1.35),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    solarOuterHaloSprite = new THREE.Sprite(outerHaloMat);
    solarOuterHaloSprite.position.set(0, 52.9, 0.2);
    solarOuterHaloSprite.scale.set(44.0, 34.0, 1.0);
    solarComplex.add(solarOuterHaloSprite);
  }

  // ==========================================================================
  // 5. SUBTLE GOLDEN CREPUSCULAR SUNBEAM SHAFTS & DRIFTING POLLEN/DUST MOTES
  // ==========================================================================
  const sunbeams = [];
  if (sunbeamTex) {
    const beamConfigs = [
      { x: -16, y: 34, z: -286, w: 26, h: 92, rotZ: 0.34, baseOp: 0.040, phase: 0.2 },
      { x: -6, y: 38, z: -288, w: 22, h: 98, rotZ: 0.14, baseOp: 0.045, phase: 1.5 },
      { x: 6, y: 38, z: -288, w: 22, h: 98, rotZ: -0.14, baseOp: 0.045, phase: 2.8 },
      { x: 17, y: 34, z: -286, w: 26, h: 92, rotZ: -0.35, baseOp: 0.038, phase: 4.1 },
      { x: -29, y: 29, z: -284, w: 20, h: 82, rotZ: 0.50, baseOp: 0.030, phase: 5.2 }
    ];
    const sharedBeamGeo = new THREE.PlaneGeometry(1, 1);
    beamConfigs.forEach((cfg) => {
      const mat = new THREE.MeshBasicMaterial({
        map: sunbeamTex,
        color: neonColor('#ffbe58', 1.15),
        transparent: true,
        opacity: cfg.baseOp,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false
      });
      const beam = new THREE.Mesh(sharedBeamGeo, mat);
      beam.position.set(cfg.x, cfg.y, cfg.z);
      beam.scale.set(cfg.w, cfg.h, 1);
      beam.rotation.z = cfg.rotZ;
      horizonGroup.add(beam);
      sunbeams.push({ mesh: beam, mat, ...cfg });
    });
  }

  // Warm Golden Atmospheric Dust / Desert Pollen Motes (THREE.Points)
  const moteCount = 320;
  const moteGeo = new THREE.BufferGeometry();
  const motePositions = new Float32Array(moteCount * 3);
  const moteColors = new Float32Array(moteCount * 3);
  const moteSeeds = new Float32Array(moteCount * 3);

  const cGold = new THREE.Color('#ffd875');
  const cAmber = new THREE.Color('#ff9636');
  const cCream = new THREE.Color('#fff6d6');

  for (let i = 0; i < moteCount; i++) {
    const i3 = i * 3;
    // Spread across sunlit desert corridor & shoulders
    motePositions[i3] = (Math.random() - 0.5) * 58;
    motePositions[i3 + 1] = 0.4 + Math.random() * 14.5;
    motePositions[i3 + 2] = -Math.random() * 175 + 20;

    moteSeeds[i3] = Math.random() * Math.PI * 2;
    moteSeeds[i3 + 1] = 0.35 + Math.random() * 0.75;
    moteSeeds[i3 + 2] = (Math.random() - 0.5) * 1.4;

    const r = Math.random();
    const col = r < 0.45 ? cGold : r < 0.8 ? cCream : cAmber;
    moteColors[i3] = col.r;
    moteColors[i3 + 1] = col.g;
    moteColors[i3 + 2] = col.b;
  }

  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColors, 3));

  const moteMat = new THREE.PointsMaterial({
    size: 0.44,
    map: dustMoteTex || null,
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    fog: true
  });
  const dustMotes = new THREE.Points(moteGeo, moteMat);
  dustMotes.name = 'GoldenHourDustMotes';
  group.add(dustMotes);

  // ==========================================================================
  // 6. SEGMENT HOOKS & REAL-TIME FRAME ANIMATION
  // ==========================================================================
  function onResetSegments() {
    // Stateless per-clone rotor phase initialization handled cleanly in onCloneSegment
  }

  function onCloneSegment(clone, index) {
    if (!clone) return;
    // Desynchronize rotor roll angles across successive 24m highway segments
    // so the wind-farm pass feels organically wind-driven while main.js spins rotation.z!
    let localRotorIdx = 0;
    clone.traverse((child) => {
      if (child.name && /rotor/i.test(child.name)) {
        child.rotation.z = -(index * 1.78 + localRotorIdx * 0.92);
        localRotorIdx++;
      }
    });
  }

  function update({
    dt = 0.016,
    elapsed = 0,
    baseSpeed = 48,
    boostBlend = 0,
    metrics
  }) {
    const bass = metrics && Number.isFinite(metrics.bass) ? metrics.bass : 0;
    const mid = metrics && Number.isFinite(metrics.mid) ? metrics.mid : 0;

    // 1. Spin distant ridge-line fleet of 22 3D wind turbines smoothly
    const windSpeedBoost = 1.0 + boostBlend * 0.55 + bass * 0.18;
    for (let i = 0; i < ridgeRotors.length; i++) {
      const item = ridgeRotors[i];
      item.rotor.rotation.z -= item.speed * windSpeedBoost * dt;
    }

    // 2. Synchronized FAA Red Aviation Warning Beacons (pulsing wave + bass transient)
    for (let p = 0; p < 4; p++) {
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 3.4 - p * 0.55);
      const strobe = Math.pow(wave, 2.4);
      const intensity = 0.55 + strobe * 1.65 + bass * 0.75;
      beaconPhaseMats[p].color.copy(neonColor('#ff2416', intensity));
    }
    for (let i = 0; i < ridgeBeaconSprites.length; i++) {
      const b = ridgeBeaconSprites[i];
      const wave = 0.5 + 0.5 * Math.sin(elapsed * 3.4 - b.phase * 0.55);
      const strobe = Math.pow(wave, 2.4);
      b.mat.opacity = 0.22 + strobe * 0.68 + bass * 0.18;
      const s = 1.8 + strobe * 1.15 + bass * 0.45;
      b.sprite.scale.set(s, s, 1.0);
    }

    // 3. Solar Thermal Receiver Crown Incandescent Shimmer & Heliostat Mirror Glint
    const crownPulse = 2.25 + Math.sin(elapsed * 2.7) * 0.22 + Math.sin(elapsed * 7.3) * 0.08 + bass * 0.55;
    solarCrownMat.color.copy(neonColor('#fff7d6', crownPulse));
    if (solarCoronaSprite) {
      const coronaScale = 21.0 + Math.sin(elapsed * 2.7) * 1.8 + bass * 4.2;
      solarCoronaSprite.scale.set(coronaScale, coronaScale, 1.0);
      solarCoronaSprite.material.opacity = 0.76 + Math.sin(elapsed * 3.1) * 0.08 + bass * 0.14;
    }
    if (solarOuterHaloSprite) {
      const outerW = 43.0 + bass * 6.5;
      const outerH = 33.0 + bass * 4.8;
      solarOuterHaloSprite.scale.set(outerW, outerH, 1.0);
      solarOuterHaloSprite.material.opacity = 0.36 + mid * 0.12 + bass * 0.10;
    }
    const helioGlint = 1.02 + Math.sin(elapsed * 3.8) * 0.16 + mid * 0.24;
    heliostatMat.color.copy(neonColor('#ffbe55', helioGlint));
    heliostatMat.opacity = 0.68 + Math.sin(elapsed * 2.3) * 0.10 + bass * 0.12;

    // 4. Subtle Crepuscular Sunbeam Breathing
    for (let i = 0; i < sunbeams.length; i++) {
      const sb = sunbeams[i];
      sb.mesh.rotation.z = sb.rotZ + Math.sin(elapsed * 0.38 + sb.phase) * 0.025;
      sb.mat.opacity = sb.baseOp * (0.85 + 0.22 * Math.sin(elapsed * 0.9 + sb.phase) + bass * 0.35);
    }

    // 5. Drift Warm Golden Atmospheric Dust / Pollen Motes across the sunlit highway
    const posAttr = moteGeo.attributes.position;
    const arr = posAttr.array;
    const zFlow = baseSpeed * 0.38 * dt;
    for (let i = 0; i < moteCount; i++) {
      const i3 = i * 3;
      const phase = moteSeeds[i3];
      const freq = moteSeeds[i3 + 1];
      const crossDrift = moteSeeds[i3 + 2];

      let x = arr[i3] + (Math.sin(elapsed * freq + phase) * 0.85 + crossDrift * 0.45) * dt;
      let y = arr[i3 + 1] + Math.cos(elapsed * (freq * 0.85) + phase) * 0.42 * dt;
      let z = arr[i3 + 2] + zFlow;

      if (z > 22) {
        z -= 175;
        x = (Math.random() - 0.5) * 58;
        y = 0.4 + Math.random() * 14.5;
      }
      if (x > 30) x = -30;
      else if (x < -30) x = 30;
      if (y < 0.3) y = 0.3;
      else if (y > 15.5) y = 0.6;

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }
    posAttr.needsUpdate = true;
    moteMat.opacity = 0.68 + bass * 0.20 + boostBlend * 0.10;
  }

  return {
    group,
    modeOverrides: {
      segmentLength: 24,
      showSun: true,
      showTerrain: true,
      terrainSolidHex: '#1c0906',
      terrainWireHex: '#e86f38',
      showStars: true,
      showCity: false,
      showMidgarCity: false,
      showMakoReactor: false,
      skyTopHex: '#240812',
      skyMidHex: '#8f261c',
      skyHorizonHex: '#ff7b29',
      fogHex: '#5e1d16',
      fogDensity: 0.0024,
      roadColorHex: '#140d12',
      roadRoughness: 0.34,
      roadMetalness: 0.52,
      laneDashes: ['#ffdd55', '#fff5dc'],
      underglowHex: '#ff8833',
      cssCyan: '#ffcc44',
      cssMagenta: '#ff5533',
      cssBgDeep: '#240812',
      ambientLightHex: '#4a1c16',
      ambientIntensity: 1.45,
      horizonLightHex: '#ff7828',
      horizonIntensity: 2.15,
      cityRimHex: '#ffd266',
      cityRimIntensity: 1.35
    },
    sunConfig: {
      stops: [
        { offset: 0.0, color: '#fff9d2' },
        { offset: 0.48, color: '#ffb636' },
        { offset: 1.0, color: '#e8481d' }
      ],
      isSegmented: true
    },
    onResetSegments,
    onCloneSegment,
    update
  };
}
