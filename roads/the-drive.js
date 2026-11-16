// roads/the-drive.js — Option 4 ("THE DRIVE", ROAD_MODES[3], key 4)
// LA Dusk / *Drive* (2011) Sixth-Street-Viaduct & Downtown Los Angeles Horizon Megacity

export function createRoadWorld({ THREE, scene, neonColor }) {
  const group = new THREE.Group();
  group.name = 'TheDriveWorld';
  group.visible = false;
  scene.add(group);

  // ==========================================================================
  // 1. MODE METADATA OVERRIDES & SEGMENTED SYNTH-NOIR DUSK SUN
  // ==========================================================================
  const modeOverrides = {
    showCity: false, // Replaces generic cyan/purple box cityGroup with bespoke DTLA dusk skyline
    showSun: true,
    showStars: true,
    showTerrain: false,
    segmentLength: 16,
    skyTopHex: '#180826',
    skyMidHex: '#6e1b4a',
    skyHorizonHex: '#f05a67',
    fogHex: '#421436',
    fogDensity: 0.0026,
    roadColorHex: '#0b0914',
    roadRoughness: 0.18,
    roadMetalness: 0.72,
    laneDashes: ['#ffb347', '#fff0d6'],
    underglowHex: '#ff6b3d',
    cssCyan: '#ffb347',
    cssMagenta: '#ff3b78',
    cssBgDeep: '#180826',
    ambientLightHex: '#341630',
    ambientIntensity: 1.55,
    horizonLightHex: '#ff6e64',
    horizonIntensity: 1.85,
    cityRimHex: '#ffb347',
    cityRimIntensity: 1.35
  };

  const sunConfig = {
    isSegmented: true,
    stops: [
      { offset: 0.0, color: '#fff4b8' },
      { offset: 0.36, color: '#ffbe58' },
      { offset: 0.66, color: '#ff9a44' },
      { offset: 1.0, color: '#e83b68' }
    ]
  };

  // Deterministic PRNG so skyline windows & lights are consistent and art-directed every load
  function makeRng(seed = 20110916) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const rand = makeRng(20110916);

  // ==========================================================================
  // 2. PROCEDURAL WARM LA DUSK WINDOW, GLOW & REFLECTION TEXTURES
  // ==========================================================================
  function createDuskWindowTexture({
    bgHex = '#12071c',
    mullionHex = '#1d0c29',
    primaryHex = '#ffe8b3',
    secondaryHex = '#ff9e58',
    coralHex = '#ff6268',
    cols = 10,
    rows = 28,
    litProb = 0.58,
    verticalFlutes = false,
    horizontalRibbons = false,
    seed = 101
  }) {
    const rgen = makeRng(seed);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, 128, 256);

    // Subtle sunset gradient sheen across upper glass floors
    const sheen = ctx.createLinearGradient(0, 0, 0, 256);
    sheen.addColorStop(0.0, 'rgba(255, 118, 102, 0.14)');
    sheen.addColorStop(0.55, 'rgba(120, 32, 82, 0.06)');
    sheen.addColorStop(1.0, 'rgba(18, 7, 28, 0.0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, 128, 256);

    const padX = verticalFlutes ? 4 : 3;
    const padY = horizontalRibbons ? 4 : 3;
    const cellW = (128 - padX * (cols + 1)) / cols;
    const cellH = (256 - padY * (rows + 1)) / rows;

    for (let r = 0; r < rows; r++) {
      const floorActivity = 0.22 + rgen() * litProb;
      const isSkyLobby = horizontalRibbons && (r % 9 === 2);

      for (let c = 0; c < cols; c++) {
        const x = padX + c * (cellW + padX);
        const y = padY + r * (cellH + padY);
        if (isSkyLobby || rgen() < floorActivity) {
          const pick = rgen();
          if (isSkyLobby) {
            ctx.fillStyle = secondaryHex;
            ctx.globalAlpha = 0.85;
          } else if (pick < 0.52) {
            ctx.fillStyle = primaryHex;
            ctx.globalAlpha = 0.55 + rgen() * 0.42;
          } else if (pick < 0.84) {
            ctx.fillStyle = secondaryHex;
            ctx.globalAlpha = 0.50 + rgen() * 0.40;
          } else {
            ctx.fillStyle = coralHex;
            ctx.globalAlpha = 0.42 + rgen() * 0.35;
          }
          ctx.fillRect(x, y, cellW, cellH);
        }
      }
    }

    ctx.globalAlpha = 1.0;
    if (verticalFlutes) {
      ctx.fillStyle = mullionHex;
      for (let c = 0; c <= cols; c += 2) {
        const x = Math.round(c * (cellW + padX));
        ctx.fillRect(x, 0, 2, 256);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createSoftRadialGlowTexture(innerRgba, midRgba, outerRgba = 'rgba(255,80,60,0)') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.0, innerRgba);
    grad.addColorStop(0.32, midRgba);
    grad.addColorStop(1.0, outerRgba);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function createRoadSunShimmerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const hGrad = ctx.createLinearGradient(0, 0, 128, 0);
    hGrad.addColorStop(0.0, 'rgba(255, 110, 80, 0.0)');
    hGrad.addColorStop(0.28, 'rgba(255, 130, 85, 0.35)');
    hGrad.addColorStop(0.5, 'rgba(255, 214, 145, 0.85)');
    hGrad.addColorStop(0.72, 'rgba(255, 130, 85, 0.35)');
    hGrad.addColorStop(1.0, 'rgba(255, 110, 80, 0.0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, 128, 256);

    ctx.globalCompositeOperation = 'destination-in';
    const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
    vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    vGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.40)');
    vGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 128, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const winTextures = [
    // 0: Champagne & Gold Modern Curtain-Wall (US Bank / Bunker Hill)
    createDuskWindowTexture({
      primaryHex: '#fff2c6',
      secondaryHex: '#ffbf66',
      coralHex: '#ff7a5c',
      cols: 12,
      rows: 32,
      litProb: 0.62,
      seed: 1101
    }),
    // 1: Historic Art Deco Fluted Limestone & Sodium Amber (City Hall / Broadway)
    createDuskWindowTexture({
      bgHex: '#170922',
      mullionHex: '#281136',
      primaryHex: '#ffd894',
      secondaryHex: '#ffa84c',
      coralHex: '#ff6d5e',
      cols: 8,
      rows: 26,
      litProb: 0.56,
      verticalFlutes: true,
      seed: 2202
    }),
    // 2: Sleek Horizontal Ribbon & Sunset Coral Glass (Wilshire Grand / Figueroa)
    createDuskWindowTexture({
      primaryHex: '#ffe6b8',
      secondaryHex: '#ff9654',
      coralHex: '#ff5268',
      cols: 10,
      rows: 30,
      litProb: 0.60,
      horizontalRibbons: true,
      seed: 3303
    }),
    // 3: Warm Downtown Arts District / Warehouse Loft Midrises
    createDuskWindowTexture({
      bgHex: '#15081d',
      primaryHex: '#ffcc80',
      secondaryHex: '#ff9048',
      coralHex: '#ff5e62',
      cols: 6,
      rows: 16,
      litProb: 0.52,
      seed: 4404
    })
  ];

  const redBeaconSpriteTex = createSoftRadialGlowTexture(
    'rgba(255, 235, 230, 1.0)',
    'rgba(255, 48, 68, 0.78)',
    'rgba(255, 20, 50, 0.0)'
  );
  const warmSpotSpriteTex = createSoftRadialGlowTexture(
    'rgba(255, 252, 235, 1.0)',
    'rgba(255, 196, 118, 0.72)',
    'rgba(255, 110, 70, 0.0)'
  );

  // Subtle sunset reflection shimmer ribbon down the wet dark asphalt highway
  const roadShimmerMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 265),
    new THREE.MeshBasicMaterial({
      map: createRoadSunShimmerTexture(),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    })
  );
  roadShimmerMesh.rotation.x = -Math.PI / 2;
  roadShimmerMesh.position.set(0, 0.014, -162);
  group.add(roadShimmerMesh);

  // ==========================================================================
  // 3. HOLLYWOOD / GRIFFITH HILLS & SAN GABRIEL DUSK RIDGE SILHOUETTES
  // ==========================================================================
  function createRidgeWingMesh({ side, zPos, baseXInner, baseXOuter, peaks, colorHex, rimHex }) {
    const ridgeGroup = new THREE.Group();
    const shape = new THREE.Shape();
    const pts = [];
    const steps = 48;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const xMag = baseXInner + (baseXOuter - baseXInner) * t;
      let h = 0;
      for (const pk of peaks) {
        const d = (xMag - pk.x) / pk.w;
        h += pk.h * Math.exp(-d * d);
      }
      // Taper smoothly to 0 at inner highway basin edge so central sun corridor stays clear
      const innerFade = Math.min(1, Math.pow(t / 0.14, 1.5));
      const y = -2.2 + h * innerFade;
      pts.push(new THREE.Vector2(side * xMag, y));
    }

    if (side < 0) {
      pts.reverse();
    }

    shape.moveTo(pts[0].x, -6.0);
    for (const p of pts) {
      shape.lineTo(p.x, p.y);
    }
    shape.lineTo(pts[pts.length - 1].x, -6.0);
    shape.closePath();

    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      fog: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = zPos;
    ridgeGroup.add(mesh);

    // Thin sunset-coral atmospheric crest rim line along the ridge top
    if (rimHex) {
      const linePts = pts.map((p) => new THREE.Vector3(p.x, p.y + 0.18, zPos + 0.15));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({
        color: rimHex,
        transparent: true,
        opacity: 0.55,
        fog: false
      });
      ridgeGroup.add(new THREE.Line(lineGeo, lineMat));
    }

    return ridgeGroup;
  }

  // Far San Gabriel / Santa Monica twilight ridge (z = -288)
  group.add(createRidgeWingMesh({
    side: -1,
    zPos: -288,
    baseXInner: 14,
    baseXOuter: 255,
    peaks: [
      { x: 58, h: 24, w: 32 },
      { x: 108, h: 38, w: 42 },
      { x: 168, h: 31, w: 48 },
      { x: 225, h: 26, w: 45 }
    ],
    colorHex: 0x2b0e3b,
    rimHex: 0xe8526d
  }));

  group.add(createRidgeWingMesh({
    side: 1,
    zPos: -288,
    baseXInner: 14,
    baseXOuter: 255,
    peaks: [
      { x: 62, h: 26, w: 34 },
      { x: 116, h: 40, w: 44 },
      { x: 176, h: 33, w: 46 },
      { x: 230, h: 25, w: 44 }
    ],
    colorHex: 0x2b0e3b,
    rimHex: 0xe8526d
  }));

  // Foreground Hollywood / Griffith Park foothills silhouette (z = -268)
  group.add(createRidgeWingMesh({
    side: -1,
    zPos: -268,
    baseXInner: 18,
    baseXOuter: 245,
    peaks: [
      { x: 54, h: 16, w: 26 },
      { x: 96, h: 28, w: 30 },
      { x: 148, h: 22, w: 38 },
      { x: 205, h: 19, w: 42 }
    ],
    colorHex: 0x190724,
    rimHex: 0xb8385c
  }));

  group.add(createRidgeWingMesh({
    side: 1,
    zPos: -268,
    baseXInner: 18,
    baseXOuter: 245,
    peaks: [
      { x: 56, h: 17, w: 26 },
      { x: 92, h: 25, w: 28 },
      { x: 144, h: 21, w: 36 },
      { x: 202, h: 18, w: 42 }
    ],
    colorHex: 0x190724,
    rimHex: 0xb8385c
  }));

  // Subtle Griffith Observatory 3-dome silhouette on the right Griffith ridge crest (X = +90, Y = 22.2, Z = -267.5)
  const observatorySilhouetteMat = new THREE.MeshBasicMaterial({ color: 0x220a30, fog: false });
  const observatoryGlowMat = new THREE.MeshBasicMaterial({ color: neonColor(0xffcf86, 1.25), fog: false });
  const obsGroup = new THREE.Group();
  obsGroup.position.set(90.0, 22.0, -267.5);
  const obsHall = new THREE.Mesh(new THREE.BoxGeometry(8.8, 2.2, 2.6), observatorySilhouetteMat);
  obsHall.position.y = 1.1;
  obsGroup.add(obsHall);
  const centerDome = new THREE.Mesh(new THREE.SphereGeometry(2.0, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), observatorySilhouetteMat);
  centerDome.position.set(0, 2.1, 0);
  obsGroup.add(centerDome);
  [-3.4, 3.4].forEach((dx) => {
    const sideDome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), observatorySilhouetteMat);
    sideDome.position.set(dx, 2.0, 0);
    obsGroup.add(sideDome);
  });
  const obsColonnadeGlow = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.32, 2.7), observatoryGlowMat);
  obsColonnadeGlow.position.set(0, 1.45, 0.1);
  obsGroup.add(obsColonnadeGlow);
  group.add(obsGroup);

  // Twinkling Mulholland / Hollywood Hills residential bungalow lights along both foothills
  const hillLightCount = 150;
  const hillLightPositions = new Float32Array(hillLightCount * 3);
  const hillLightColors = new Float32Array(hillLightCount * 3);
  const hillPalette = [
    new THREE.Color('#ffdca2'),
    new THREE.Color('#ffb156'),
    new THREE.Color('#ff7a66'),
    new THREE.Color('#fff4d8')
  ];
  for (let i = 0; i < hillLightCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const xMag = 32 + rand() * 165;
    const maxSlopeY = 3.5 + 14.0 * Math.exp(-Math.pow((xMag - 94) / 48, 2));
    const y = -0.8 + rand() * maxSlopeY;
    const z = -266.5 + rand() * 2.5;
    hillLightPositions[i * 3] = side * xMag;
    hillLightPositions[i * 3 + 1] = y;
    hillLightPositions[i * 3 + 2] = z;

    const c = hillPalette[Math.floor(rand() * hillPalette.length)];
    hillLightColors[i * 3] = c.r;
    hillLightColors[i * 3 + 1] = c.g;
    hillLightColors[i * 3 + 2] = c.b;
  }
  const hillLightsGeo = new THREE.BufferGeometry();
  hillLightsGeo.setAttribute('position', new THREE.BufferAttribute(hillLightPositions, 3));
  hillLightsGeo.setAttribute('color', new THREE.BufferAttribute(hillLightColors, 3));
  const hillLightsMesh = new THREE.Points(
    hillLightsGeo,
    new THREE.PointsMaterial({
      size: 1.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      fog: false,
      sizeAttenuation: true
    })
  );
  group.add(hillLightsMesh);

  // ==========================================================================
  // 4. DOWNTOWN LA DUSK HORIZON MEGACITY (z ≈ -242, fog: false)
  // ==========================================================================
  const horizonGroup = new THREE.Group();
  horizonGroup.name = 'DTLADuskSkyline';
  horizonGroup.position.set(0, -1.6, -242);
  group.add(horizonGroup);

  // Dedicated sunset-coral & golden-amber architectural PointLights to sculpt the 3D skyline setbacks
  const dtlaCoralKeyLight = new THREE.PointLight(0xff7258, 2100, 230, 1.4);
  dtlaCoralKeyLight.position.set(0, 54, 52);
  horizonGroup.add(dtlaCoralKeyLight);

  const dtlaWestRimLight = new THREE.PointLight(0xffc266, 1650, 210, 1.4);
  dtlaWestRimLight.position.set(-44, 72, 46);
  horizonGroup.add(dtlaWestRimLight);

  const dtlaEastRimLight = new THREE.PointLight(0xffa654, 1650, 210, 1.4);
  dtlaEastRimLight.position.set(44, 68, 46);
  horizonGroup.add(dtlaEastRimLight);

  // Urban Basin Plinth Flanking the Central Highway Corridor (leaves X in [-10.2, +10.2] open for road)
  const basinPlinthMat = new THREE.MeshBasicMaterial({ color: 0x160720, fog: false });
  [-68, 68].forEach((px) => {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(114, 3.2, 68), basinPlinthMat);
    plinth.position.set(px, -1.2, -10);
    horizonGroup.add(plinth);
  });

  // Shared PBR Facade & Crown Materials (fog: false so exponential fog never washes out DTLA!)
  const facadeMaterials = winTextures.map((tex, idx) =>
    new THREE.MeshStandardMaterial({
      color: idx === 1 ? 0x261132 : 0x1b0b26,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1.22,
      roughness: 0.36,
      metalness: 0.58,
      fog: false
    })
  );

  const towerTrimMat = new THREE.MeshStandardMaterial({
    color: 0x2c1338,
    roughness: 0.42,
    metalness: 0.62,
    fog: false
  });

  const reactiveCrowns = [];
  const aviationStrobes = [];

  function addAviationBeacon(parent, x, y, z, phase = 0, isHero = false) {
    const bulbMat = new THREE.MeshBasicMaterial({
      color: neonColor(0xff2b4a, isHero ? 2.1 : 1.5),
      fog: false
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(isHero ? 0.52 : 0.34, 8, 8), bulbMat);
    bulb.position.set(x, y, z);
    parent.add(bulb);

    const haloMat = new THREE.SpriteMaterial({
      map: redBeaconSpriteTex,
      color: neonColor(0xff3355, isHero ? 1.85 : 1.35),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const halo = new THREE.Sprite(haloMat);
    const sz = isHero ? 5.2 : 3.1;
    halo.scale.set(sz, sz, 1);
    halo.position.set(x, y, z);
    parent.add(halo);

    aviationStrobes.push({ bulbMat, halo, haloMat, baseScale: sz, phase, isHero });
  }

  function registerCrownMesh(mesh, mat, baseColorHex, baseIntensity, bandIndex, baseScaleY = 1.0) {
    reactiveCrowns.push({
      mesh,
      mat,
      baseColor: new THREE.Color(baseColorHex),
      baseIntensity,
      band: bandIndex % 24,
      baseScaleY
    });
  }

  // Mount Lee / Hollywood Hills Twin Radio Broadcast Masts on Left Ridge (X = -96, Y = 25.5, Z = -267.5)
  [-94.5, -99.0].forEach((mx, idx) => {
    const mastH = idx === 0 ? 11.5 : 9.2;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.32, mastH, 4),
      observatorySilhouetteMat
    );
    mast.position.set(mx, 25.2 + mastH * 0.5, -267.5);
    group.add(mast);
    addAviationBeacon(group, mx, 25.2 + mastH + 0.3, -267.5, idx * 1.7, false);
  });

  // --------------------------------------------------------------------------
  // HERO LANDMARK 1: US Bank / Library Tower Nod (X = -20.2, Z = +4.0 -> z = -238)
  // Iconic stepped cylindrical/octagonal tower with illuminated white-gold crown!
  // --------------------------------------------------------------------------
  {
    const usBank = new THREE.Group();
    usBank.position.set(-20.2, 0, 4.0);
    horizonGroup.add(usBank);

    // Podium & 4 orthogonal stepped granite-glass wing buttresses
    const podium = new THREE.Mesh(new THREE.BoxGeometry(13.5, 16, 13.5), facadeMaterials[0]);
    podium.position.y = 8;
    usBank.add(podium);

    const wingSpecs = [
      { sx: 11.2, sy: 54, sz: 6.4 },
      { sx: 6.4, sy: 61, sz: 11.2 }
    ];
    for (const ws of wingSpecs) {
      const wMesh = new THREE.Mesh(new THREE.BoxGeometry(ws.sx, ws.sy, ws.sz), facadeMaterials[0]);
      wMesh.position.y = ws.sy / 2;
      usBank.add(wMesh);
    }

    // Central 16-faceted cylindrical core rising to 75m
    const coreH = 75;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.65, coreH, 16), facadeMaterials[0]);
    core.position.y = coreH / 2;
    usBank.add(core);

    // Upper octagonal setback collar (75..80m)
    const upperTier = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.85, 6.0, 16), facadeMaterials[0]);
    upperTier.position.y = 77.5;
    usBank.add(upperTier);

    // Signature Illuminated Glass-Block Crown (80..86.5m) in radiant champagne-white & gold!
    const usCrownCoreMat = new THREE.MeshBasicMaterial({
      color: neonColor('#fff4c8', 1.55),
      fog: false
    });
    const usCrownCore = new THREE.Mesh(new THREE.CylinderGeometry(4.12, 4.22, 5.8, 16), usCrownCoreMat);
    usCrownCore.position.y = 83.2;
    usBank.add(usCrownCore);
    registerCrownMesh(usCrownCore, usCrownCoreMat, '#fff4c8', 1.55, 1);

    // Sculptural vertical exterior crown fins framing the glowing glass crown
    for (let f = 0; f < 12; f++) {
      const ang = (f / 12) * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 6.4, 0.52), towerTrimMat);
      fin.position.set(Math.cos(ang) * 4.25, 83.2, Math.sin(ang) * 4.25);
      fin.rotation.y = -ang;
      usBank.add(fin);
    }

    // Golden crown cornice rings & rooftop helipad pad
    const corniceMat = new THREE.MeshBasicMaterial({ color: neonColor('#ffbe55', 1.45), fog: false });
    [80.2, 86.2].forEach((ry) => {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(4.42, 4.42, 0.42, 16), corniceMat);
      ring.position.y = ry;
      usBank.add(ring);
    });
    registerCrownMesh(usCrownCore, corniceMat, '#ffbe55', 1.45, 3);
  }

  // --------------------------------------------------------------------------
  // HERO LANDMARK 2: Wilshire Grand Sail & Spire Tower Nod (X = +21.0, Z = +2.0 -> z = -240)
  // Sleek curved-fin skyscraper with diagonal glass sail crown & pulsing red strobe spire!
  // --------------------------------------------------------------------------
  {
    const wilshire = new THREE.Group();
    wilshire.position.set(21.0, 0, 2.0);
    horizonGroup.add(wilshire);

    // Main aerodynamic tower shaft (H = 74m) + rounded end drums
    const shaftH = 74;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(9.6, shaftH, 5.8), facadeMaterials[2]);
    shaft.position.y = shaftH / 2;
    wilshire.add(shaft);

    [-4.8, 4.8].forEach((endX) => {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, shaftH, 12), facadeMaterials[2]);
      drum.position.set(endX, shaftH / 2, 0);
      wilshire.add(drum);
    });

    // Vertical warm coral-amber architectural spine LED ribbon up the center face
    const spineMat = new THREE.MeshBasicMaterial({ color: neonColor('#ff7e52', 1.45), fog: false });
    const spineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, shaftH + 6, 6.05), spineMat);
    spineMesh.position.set(-1.4, (shaftH + 6) / 2, 0);
    wilshire.add(spineMesh);
    registerCrownMesh(spineMesh, spineMat, '#ff7e52', 1.45, 5);

    // Asymmetric Diagonal Curved Sail Crown (74..86m, sloping dramatically upward toward the highway)
    const sailShape = new THREE.Shape();
    sailShape.moveTo(-6.2, 0);
    sailShape.lineTo(6.2, 0);
    sailShape.lineTo(5.6, 5.2);
    sailShape.quadraticCurveTo(0.5, 11.5, -5.8, 13.0);
    sailShape.closePath();

    const sailExtrude = new THREE.ExtrudeGeometry(sailShape, {
      depth: 4.4,
      bevelEnabled: false
    });
    sailExtrude.translate(0, 73.5, -2.2);

    const sailCrownMat = new THREE.MeshBasicMaterial({
      color: neonColor('#ffb86c', 1.42),
      fog: false
    });
    const sailMesh = new THREE.Mesh(sailExtrude, sailCrownMat);
    wilshire.add(sailMesh);
    registerCrownMesh(sailMesh, sailCrownMat, '#ffb86c', 1.42, 7);

    // Sleek Architectural Needle Spire rising from the high apex of the sail (Y = 86..106m)
    const spireMat = new THREE.MeshBasicMaterial({ color: neonColor('#ffe3a8', 1.38), fog: false });
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.42, 20.5, 8), spireMat);
    spire.position.set(-4.8, 95.8, 0);
    wilshire.add(spire);

    // Pulsing Red FAA Aviation Obstruction Strobe atop the 106m Wilshire Spire!
    addAviationBeacon(wilshire, -4.8, 106.4, 0, 0.0, true);
  }

  // --------------------------------------------------------------------------
  // HERO LANDMARK 3: Stepped Art Deco Civic Ziggurat (LA City Hall Nod, X = -36.5, Z = -4.0)
  // --------------------------------------------------------------------------
  {
    const deco = new THREE.Group();
    deco.position.set(-36.5, 0, -4.0);
    horizonGroup.add(deco);

    const base = new THREE.Mesh(new THREE.BoxGeometry(14.5, 18, 11.5), facadeMaterials[1]);
    base.position.y = 9;
    deco.add(base);

    const mid = new THREE.Mesh(new THREE.BoxGeometry(9.2, 48, 8.8), facadeMaterials[1]);
    mid.position.y = 24;
    deco.add(mid);

    // Warm-lit colonnaded observation loggia (48..54.5m)
    const loggiaMat = new THREE.MeshBasicMaterial({ color: neonColor('#ffd180', 1.42), fog: false });
    const loggia = new THREE.Mesh(new THREE.BoxGeometry(7.2, 6.2, 7.2), loggiaMat);
    loggia.position.y = 51.0;
    deco.add(loggia);
    registerCrownMesh(loggia, loggiaMat, '#ffd180', 1.42, 9);

    // Stepped pyramidal Art Deco ziggurat roof + Lindbergh beacon lantern
    [
      { w: 6.4, y: 55.2, h: 2.0 },
      { w: 4.8, y: 57.1, h: 1.8 },
      { w: 3.2, y: 58.8, h: 1.8 }
    ].forEach((step) => {
      const sMesh = new THREE.Mesh(new THREE.BoxGeometry(step.w, step.h, step.w), towerTrimMat);
      sMesh.position.y = step.y;
      deco.add(sMesh);
    });

    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 2.8, 8), loggiaMat);
    lantern.position.y = 61.0;
    deco.add(lantern);
    addAviationBeacon(deco, 0, 63.0, 0, 1.1, false);
  }

  // --------------------------------------------------------------------------
  // HERO LANDMARK 4: Figueroa Elliptical-Crown Tower (Gas Company Tower Nod, X = +37.5, Z = -3.5)
  // --------------------------------------------------------------------------
  {
    const gasTower = new THREE.Group();
    gasTower.position.set(37.5, 0, -3.5);
    horizonGroup.add(gasTower);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(11.4, 44, 9.6), facadeMaterials[0]);
    lower.position.y = 22;
    gasTower.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(9.2, 62, 7.8), facadeMaterials[2]);
    upper.position.y = 31;
    gasTower.add(upper);

    // Signature glowing elliptical dusk crown blade (62..70.5m)
    const bladeGeo = new THREE.CylinderGeometry(4.2, 4.4, 8.6, 16);
    bladeGeo.scale(1.0, 1.0, 0.36);
    const bladeMat = new THREE.MeshBasicMaterial({
      color: neonColor('#ff9d6e', 1.48),
      fog: false
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.y = 65.5;
    gasTower.add(blade);
    registerCrownMesh(blade, bladeMat, '#ff9d6e', 1.48, 11);
  }

  // --------------------------------------------------------------------------
  // SURROUNDING TIERED DOWNTOWN LA SKYLINE ENSEMBLE (38 Sculpted High-Rises & Lofts)
  // Strictly outside X in [-12.0, +12.0] so the highway corridor frames the sunset sun!
  // --------------------------------------------------------------------------
  const skylineSpecs = [
    // Inner Bunker Hill / Financial District frame (|X| = 13..32, staggered Z behind/beside heroes)
    { x: -14.0, z: -12, w: 6.4, d: 6.4, h: 42, style: 'stepped', mat: 1, crown: '#ffbe5c' },
    { x: 14.2, z: -11, w: 6.6, d: 6.2, h: 40, style: 'stepped', mat: 0, crown: '#ffdca2' },
    { x: -27.8, z: 6, w: 8.2, d: 7.4, h: 56, style: 'twinfin', mat: 2, crown: '#ff7d5e', beacon: true },
    { x: 28.6, z: 5, w: 8.0, d: 7.6, h: 53, style: 'octagon', mat: 0, crown: '#ffe4a8', beacon: true },
    { x: -24.5, z: -18, w: 9.5, d: 8.5, h: 68, style: 'stepped', mat: 0, crown: '#ffb357', spire: 9 },
    { x: 25.2, z: -19, w: 9.2, d: 8.4, h: 65, style: 'stepped', mat: 1, crown: '#ff8762', spire: 8 },
    { x: -15.8, z: -26, w: 7.8, d: 7.4, h: 52, style: 'octagon', mat: 2, crown: '#ffd592' },
    { x: 16.2, z: -25, w: 7.6, d: 7.4, h: 50, style: 'twinfin', mat: 1, crown: '#ff9b58' },

    // Mid-Flank Historic Core, South Park & Arts District (|X| = 33..68)
    { x: -45.5, z: 4, w: 8.8, d: 7.6, h: 46, style: 'stepped', mat: 1, crown: '#ffc466' },
    { x: 46.2, z: 4, w: 9.0, d: 7.8, h: 48, style: 'octagon', mat: 0, crown: '#ff8564', beacon: true },
    { x: -42.0, z: -18, w: 10.2, d: 8.8, h: 58, style: 'twinfin', mat: 2, crown: '#ffe0a3', spire: 7 },
    { x: 43.0, z: -17, w: 10.0, d: 8.6, h: 55, style: 'stepped', mat: 1, crown: '#ffb454' },
    { x: -53.5, z: -6, w: 8.4, d: 7.8, h: 41, style: 'stepped', mat: 1, crown: '#ff945c' },
    { x: 54.0, z: -7, w: 8.6, d: 8.0, h: 43, style: 'stepped', mat: 2, crown: '#ffd48c' },
    { x: -61.0, z: -16, w: 9.6, d: 8.4, h: 49, style: 'octagon', mat: 0, crown: '#ff7860', beacon: true },
    { x: 61.8, z: -15, w: 9.4, d: 8.2, h: 47, style: 'twinfin', mat: 0, crown: '#ffc870', beacon: true },
    { x: -50.0, z: -28, w: 10.5, d: 9.0, h: 52, style: 'stepped', mat: 2, crown: '#ffae52' },
    { x: 51.0, z: -27, w: 10.4, d: 9.0, h: 50, style: 'stepped', mat: 1, crown: '#ffe2ab' },

    // Foreground Arts District / Viaduct Landing Lofts (closer Z = +10..+16, lower heights 14..26m)
    { x: -16.5, z: 13, w: 7.4, d: 5.8, h: 17, style: 'loft', mat: 3, crown: '#ff9d52' },
    { x: 16.8, z: 13, w: 7.6, d: 5.8, h: 18, style: 'loft', mat: 3, crown: '#ffb866' },
    { x: -26.0, z: 15, w: 8.8, d: 6.2, h: 21, style: 'loft', mat: 3, crown: '#ff745c' },
    { x: 26.5, z: 14, w: 8.6, d: 6.2, h: 20, style: 'loft', mat: 3, crown: '#ffc978' },
    { x: -37.5, z: 12, w: 9.4, d: 6.6, h: 23, style: 'loft', mat: 1, crown: '#ffa454' },
    { x: 38.2, z: 12, w: 9.2, d: 6.6, h: 22, style: 'loft', mat: 3, crown: '#ffd694' },

    // Outer Wing Century City / Koreatown / Miracle Mile Tapering Skyline (|X| = 68..118)
    { x: -69.5, z: -8, w: 8.4, d: 7.6, h: 36, style: 'stepped', mat: 0, crown: '#ffc266' },
    { x: 70.2, z: -9, w: 8.6, d: 7.6, h: 35, style: 'stepped', mat: 2, crown: '#ff8a62' },
    { x: -78.0, z: -18, w: 9.2, d: 8.2, h: 39, style: 'twinfin', mat: 2, crown: '#ffe2a8', spire: 6 },
    { x: 78.8, z: -17, w: 9.0, d: 8.0, h: 38, style: 'octagon', mat: 0, crown: '#ffb258', spire: 6 },
    { x: -87.5, z: -11, w: 8.2, d: 7.4, h: 29, style: 'stepped', mat: 1, crown: '#ff965a' },
    { x: 88.2, z: -10, w: 8.4, d: 7.4, h: 30, style: 'stepped', mat: 1, crown: '#ffd28a' },
    { x: -97.0, z: -19, w: 9.0, d: 8.0, h: 32, style: 'stepped', mat: 0, crown: '#ff7664' },
    { x: 98.0, z: -18, w: 8.8, d: 8.0, h: 31, style: 'twinfin', mat: 2, crown: '#ffbe62' },
    { x: -107.5, z: -14, w: 8.5, d: 7.5, h: 24, style: 'loft', mat: 3, crown: '#ffa858' },
    { x: 108.5, z: -14, w: 8.5, d: 7.5, h: 23, style: 'loft', mat: 3, crown: '#ffd898' },
    { x: -117.0, z: -20, w: 8.0, d: 7.2, h: 19, style: 'loft', mat: 1, crown: '#ff8260' },
    { x: 118.0, z: -20, w: 8.0, d: 7.2, h: 18, style: 'loft', mat: 1, crown: '#ffc068' }
  ];

  skylineSpecs.forEach((spec, idx) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(spec.x, 0, spec.z);
    horizonGroup.add(bGroup);

    const fMat = facadeMaterials[spec.mat % facadeMaterials.length];
    const crownMat = new THREE.MeshBasicMaterial({
      color: neonColor(spec.crown, 1.36),
      fog: false
    });

    if (spec.style === 'octagon') {
      const r = Math.min(spec.w, spec.d) * 0.54;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r, spec.h, 8), fMat);
      body.position.y = spec.h / 2;
      body.rotation.y = Math.PI / 8;
      bGroup.add(body);

      const capH = 2.6;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.76, r * 0.84, capH, 8), fMat);
      cap.position.y = spec.h + capH / 2;
      cap.rotation.y = Math.PI / 8;
      bGroup.add(cap);

      const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.80, r * 0.80, 0.75, 8), crownMat);
      crown.position.y = spec.h + capH + 0.35;
      crown.rotation.y = Math.PI / 8;
      bGroup.add(crown);
      registerCrownMesh(crown, crownMat, spec.crown, 1.36, idx + 2);
    } else if (spec.style === 'twinfin') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), fMat);
      body.position.y = spec.h / 2;
      bGroup.add(body);

      const penthouse = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.72, 3.4, spec.d * 0.72), towerTrimMat);
      penthouse.position.y = spec.h + 1.7;
      bGroup.add(penthouse);

      // Twin glowing vertical crown blades framing the roof
      [-spec.w * 0.46, spec.w * 0.46].forEach((fx) => {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.2, spec.d * 0.92), crownMat);
        fin.position.set(fx, spec.h + 1.4, 0);
        bGroup.add(fin);
      });
      const brow = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 1.02, 0.55, spec.d * 1.02), crownMat);
      brow.position.y = spec.h - 0.35;
      bGroup.add(brow);
      registerCrownMesh(brow, crownMat, spec.crown, 1.36, idx + 4);
    } else if (spec.style === 'stepped') {
      const h1 = spec.h * 0.74;
      const h2 = spec.h * 0.20;
      const h3 = spec.h * 0.08;

      const t1 = new THREE.Mesh(new THREE.BoxGeometry(spec.w, h1, spec.d), fMat);
      t1.position.y = h1 / 2;
      bGroup.add(t1);

      const t2 = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.78, h2, spec.d * 0.78), fMat);
      t2.position.y = h1 + h2 / 2;
      bGroup.add(t2);

      const t3 = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.54, h3 + 1.4, spec.d * 0.54), towerTrimMat);
      t3.position.y = h1 + h2 + (h3 + 1.4) / 2;
      bGroup.add(t3);

      const band = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.80, 0.62, spec.d * 0.80), crownMat);
      band.position.y = h1 + h2 + 0.25;
      bGroup.add(band);
      registerCrownMesh(band, crownMat, spec.crown, 1.36, idx + 6);
    } else {
      // Arts District / Historic Core loft midrise with warm cornice & rooftop water-tower/penthouse
      const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), fMat);
      body.position.y = spec.h / 2;
      bGroup.add(body);

      const cornice = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 1.03, 0.42, spec.d * 1.03), crownMat);
      cornice.position.y = spec.h + 0.2;
      bGroup.add(cornice);

      const mech = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.36, 1.8, spec.d * 0.36), towerTrimMat);
      mech.position.set(spec.w * 0.18, spec.h + 0.9, 0);
      bGroup.add(mech);
    }

    if (spec.spire) {
      const sp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.22, spec.spire, 6),
        crownMat
      );
      sp.position.y = spec.h + 2.4 + spec.spire / 2;
      bGroup.add(sp);
      addAviationBeacon(bGroup, 0, spec.h + 2.4 + spec.spire + 0.25, 0, idx * 0.73, false);
    } else if (spec.beacon) {
      addAviationBeacon(bGroup, 0, spec.h + 3.6, 0, idx * 0.91, false);
    }
  });

  // ==========================================================================
  // 5. TWO SUBTLE SWEEPING HOLLYWOOD / DTLA PREMIERE SEARCHLIGHT CONES
  // ==========================================================================
  function createSearchlightGradientTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, 'rgba(255, 232, 185, 0.0)');
    grad.addColorStop(0.65, 'rgba(255, 195, 130, 0.38)');
    grad.addColorStop(1.0, 'rgba(255, 245, 210, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const searchlightTex = createSearchlightGradientTexture();
  const beamHeight = 118;
  const beamGeo = new THREE.CylinderGeometry(6.8, 0.42, beamHeight, 18, 1, true);
  beamGeo.translate(0, beamHeight / 2, 0);

  const searchlights = [
    {
      x: -31.5,
      y: 18.0,
      z: -241.0,
      color: '#ffe4a8',
      baseRotZ: -0.26,
      sweepAmpZ: 0.30,
      sweepAmpX: 0.14,
      speed: 0.44,
      phase: 0.3
    },
    {
      x: 33.5,
      y: 16.0,
      z: -245.0,
      color: '#ff9d78',
      baseRotZ: 0.24,
      sweepAmpZ: 0.28,
      sweepAmpX: 0.15,
      speed: 0.37,
      phase: 2.1
    }
  ].map((cfg) => {
    const mat = new THREE.MeshBasicMaterial({
      map: searchlightTex,
      color: new THREE.Color(cfg.color),
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false
    });
    const mesh = new THREE.Mesh(beamGeo, mat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.rotation.z = cfg.baseRotZ;
    group.add(mesh);
    return { ...cfg, mesh, mat };
  });

  // ==========================================================================
  // 6. TWO DISTANT AIRBORNE LA DUSK HELICOPTER / SPINNER LIGHT PAIRS
  // ==========================================================================
  const choppers = [
    {
      baseY: 34.5,
      z: -176,
      x: -72,
      dir: 1,
      speed: 8.8,
      spanX: 148,
      phase: 0.0
    },
    {
      baseY: 43.0,
      z: -214,
      x: 64,
      dir: -1,
      speed: 7.2,
      spanX: 158,
      phase: 2.4
    }
  ].map((cfg) => {
    const craft = new THREE.Group();
    craft.position.set(cfg.x, cfg.baseY, cfg.z);
    group.add(craft);

    const hullMat = new THREE.MeshBasicMaterial({ color: 0x12051c, fog: false });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, 0.95), hullMat);
    craft.add(cabin);

    const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.26, 0.26), hullMat);
    tailBoom.position.set(-cfg.dir * 1.9, 0.12, 0);
    craft.add(tailBoom);

    const rotorDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 0.05, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffb88c,
        transparent: true,
        opacity: 0.16,
        fog: false
      })
    );
    rotorDisc.position.y = 0.62;
    craft.add(rotorDisc);

    // Steady warm-white nose spotlight sprite
    const noseSpot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: warmSpotSpriteTex,
        color: neonColor(0xfff2d2, 1.75),
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    );
    noseSpot.scale.set(2.9, 2.9, 1);
    noseSpot.position.set(cfg.dir * 1.35, -0.18, 0.25);
    craft.add(noseSpot);

    // Blinking red/amber tail anti-collision strobe (completing the signature airborne light pair!)
    const tailStrobeMat = new THREE.SpriteMaterial({
      map: redBeaconSpriteTex,
      color: neonColor(0xff3358, 1.85),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    const tailStrobe = new THREE.Sprite(tailStrobeMat);
    tailStrobe.scale.set(2.5, 2.5, 1);
    tailStrobe.position.set(-cfg.dir * 3.05, 0.32, 0);
    craft.add(tailStrobe);

    // Subtle downward LAPD / Nightcrawler chopper searchlight cone sweeping the city deck
    const chopperConeGeo = new THREE.CylinderGeometry(0.18, 3.6, 26, 12, 1, true);
    chopperConeGeo.translate(0, -13, 0);
    const chopperCone = new THREE.Mesh(
      chopperConeGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffe6b8,
        transparent: true,
        opacity: 0.048,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false
      })
    );
    chopperCone.position.set(cfg.dir * 1.1, -0.35, 0.2);
    chopperCone.rotation.z = cfg.dir * 0.28;
    chopperCone.rotation.x = 0.16;
    craft.add(chopperCone);

    return { ...cfg, craft, tailStrobe, tailStrobeMat, chopperCone };
  });

  // ==========================================================================
  // 7. OUTER-VIADUCT & ADJACENT-DECK SCROLLING TRAFFIC LIGHT-STREAK RIBBONS
  // ==========================================================================
  // Runs along the parallel elevated Metro/Expressway decks built in night-drive-city.glb
  // (Left deck X = -26.2 @ Y = 2.15, Right deck X = +26.2 @ Y = 2.85, plus lower frontage lanes)
  const headlightRibbonMat = new THREE.MeshBasicMaterial({
    color: neonColor('#ffe2a8', 1.65),
    transparent: true,
    opacity: 0.9
  });
  const amberTrainRibbonMat = new THREE.MeshBasicMaterial({
    color: neonColor('#ff9d47', 1.48),
    transparent: true,
    opacity: 0.88
  });
  const taillightRibbonMat = new THREE.MeshBasicMaterial({
    color: neonColor('#ff2952', 1.72),
    transparent: true,
    opacity: 0.92
  });

  const trafficStreaks = [];
  const streakSpanZ = 296; // z in [-272, +24]

  // A. Left Elevated Deck Oncoming Headlight Pairs & LA Metro Light-Rail Consist Streaks
  for (let i = 0; i < 10; i++) {
    const isMetroCar = i % 5 === 0;
    const streakGroup = new THREE.Group();
    const laneX = isMetroCar ? -26.2 : (i % 2 === 0 ? -25.35 : -27.05);
    const laneY = isMetroCar ? 2.95 : 2.42;
    const zStart = 20 - i * (streakSpanZ / 10);

    if (isMetroCar) {
      // Sleek 2-car articulated LA Metro Gold/A-Line light-rail window & nose-beam ribbon
      const carLen = 11.5;
      [-carLen * 0.54, carLen * 0.54].forEach((cz) => {
        const winStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.34, carLen * 0.88),
          amberTrainRibbonMat
        );
        winStrip.position.set(0.65, 0, cz);
        streakGroup.add(winStrip);
      });
      const noseBeam = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.16, 1.4), headlightRibbonMat);
      noseBeam.position.set(0.2, -0.18, carLen + 0.5);
      streakGroup.add(noseBeam);
    } else {
      // Twin oncoming golden-champagne headlight ribbons
      [-0.36, 0.36].forEach((dx) => {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 4.6), headlightRibbonMat);
        beam.position.x = dx;
        streakGroup.add(beam);
      });
    }

    streakGroup.position.set(laneX, laneY, zStart);
    group.add(streakGroup);
    trafficStreaks.push({
      mesh: streakGroup,
      relSpeedOffset: isMetroCar ? 28 : 42 + (i % 3) * 7,
      isMetro: isMetroCar
    });
  }

  // B. Right Elevated Deck Same-Direction Ruby Taillight Ribbons (overtaken by our DeLorean!)
  for (let i = 0; i < 10; i++) {
    const streakGroup = new THREE.Group();
    const laneX = i % 2 === 0 ? 25.35 : 27.05;
    const laneY = 3.12;
    const zStart = 16 - i * (streakSpanZ / 10) - 9;

    [-0.38, 0.38].forEach((dx) => {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.10, 4.2), taillightRibbonMat);
      tail.position.x = dx;
      streakGroup.add(tail);
    });

    streakGroup.position.set(laneX, laneY, zStart);
    group.add(streakGroup);
    trafficStreaks.push({
      mesh: streakGroup,
      relSpeedOffset: -22 - (i % 3) * 5, // Slower than player -> scrolls +Z past us smoothly
      isMetro: false
    });
  }

  // C. Lower Outer Embankment Parkway Light Ribbons (X = +-29.4, Y = 0.68)
  for (let i = 0; i < 6; i++) {
    const isLeft = i % 2 === 0;
    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.10, 5.4),
      isLeft ? headlightRibbonMat : taillightRibbonMat
    );
    ribbon.position.set(isLeft ? -29.4 : 29.4, 0.68, 18 - i * (streakSpanZ / 6));
    group.add(ribbon);
    trafficStreaks.push({
      mesh: ribbon,
      relSpeedOffset: isLeft ? 34 : -18,
      isMetro: false
    });
  }

  // ==========================================================================
  // 8. SIXTH-STREET-VIADUCT ARCH RIBBON-OF-LIGHT WAVE MATERIALS (4 PHASED MATS)
  // ==========================================================================
  const archWaveMats = [0, 1, 2, 3].map(() =>
    new THREE.MeshStandardMaterial({
      color: 0xff8f5c,
      roughness: 0.24,
      metalness: 0.12,
      emissive: new THREE.Color(0xff7847),
      emissiveIntensity: 1.65,
      side: THREE.DoubleSide
    })
  );

  function onResetSegments() {
    // Shared archWaveMats stay pooled cleanly across respawns
  }

  function onCloneSegment(clone, index) {
    if (!clone) return;
    const waveMat = archWaveMats[index % archWaveMats.length];
    clone.traverse((child) => {
      if (child.isMesh && child.name === 'ViaductArchGlow') {
        child.material = waveMat;
      }
    });
  }

  // ==========================================================================
  // 9. PER-FRAME AUDIO-REACTIVE & ATMOSPHERIC ANIMATION UPDATE
  // ==========================================================================
  const tempCrownColor = new THREE.Color();

  function update({ dt, elapsed, baseSpeed, isBoosting, boostBlend = 0, metrics }) {
    const safeDt = Math.min(Math.max(dt || 0.016, 0.0), 0.1);
    const t = elapsed || 0;
    const speed = Number.isFinite(baseSpeed) ? baseSpeed : 48;
    const bass = metrics?.bass || 0;
    const mid = metrics?.mid || 0;
    const spec = metrics?.spectrum;

    // 1. Audio-reactive DTLA tower crowns & architectural spines
    for (let i = 0; i < reactiveCrowns.length; i++) {
      const rc = reactiveCrowns[i];
      const binVal = spec && spec.length > rc.band ? spec[rc.band] / 255 : 0;
      const shimmer = 0.94 + 0.08 * Math.sin(t * 2.4 + i * 0.7);
      const intensity = rc.baseIntensity * shimmer + bass * 0.36 + binVal * 0.42;
      tempCrownColor.copy(rc.baseColor).multiplyScalar(intensity);
      rc.mat.color.copy(tempCrownColor);
    }

    // 2. Pulsing red FAA aviation obstruction strobes (Wilshire Spire + skyline roofs)
    for (let i = 0; i < aviationStrobes.length; i++) {
      const st = aviationStrobes[i];
      const wave = Math.pow(0.5 + 0.5 * Math.sin(t * 3.4 + st.phase), 4.0);
      const pulse = (st.isHero ? 0.55 : 0.35) + wave * (1.25 + bass * 0.55);
      st.haloMat.opacity = Math.min(1.0, 0.28 + wave * 0.72);
      const s = st.baseScale * (0.78 + wave * 0.45 + bass * 0.18);
      st.halo.scale.set(s, s, 1);
      st.bulbMat.color.setRGB(1.0 * pulse * 1.4, 0.16 * pulse, 0.28 * pulse);
    }

    // 3. Gently sweeping Hollywood / DTLA premiere searchlight cones
    for (let i = 0; i < searchlights.length; i++) {
      const sl = searchlights[i];
      sl.mesh.rotation.z = sl.baseRotZ + Math.sin(t * sl.speed + sl.phase) * sl.sweepAmpZ;
      sl.mesh.rotation.x = Math.cos(t * sl.speed * 0.78 + sl.phase) * sl.sweepAmpX;
      sl.mat.opacity = 0.044 + 0.014 * Math.sin(t * 1.3 + sl.phase) + mid * 0.025;
    }

    // 4. Distant airborne LA dusk helicopters / spinners drifting across the horizon sky
    for (let i = 0; i < choppers.length; i++) {
      const ch = choppers[i];
      ch.x += ch.dir * ch.speed * safeDt;
      if (ch.dir > 0 && ch.x > ch.spanX) ch.x = -ch.spanX;
      if (ch.dir < 0 && ch.x < -ch.spanX) ch.x = ch.spanX;

      const bobY = Math.sin(t * 1.7 + ch.phase) * 0.85;
      ch.craft.position.x = ch.x;
      ch.craft.position.y = ch.baseY + bobY;
      ch.craft.rotation.z = -ch.dir * 0.06 + Math.sin(t * 2.1 + ch.phase) * 0.025;

      // Crisp double-flash aviation tail strobe pattern
      const cyc = (t * 1.65 + ch.phase) % 1.0;
      const flash = (cyc < 0.09 || (cyc > 0.18 && cyc < 0.26)) ? 1.0 : 0.12;
      ch.tailStrobeMat.opacity = flash;
      const stScale = 1.6 + flash * 1.5;
      ch.tailStrobe.scale.set(stScale, stScale, 1);

      // Gently pan the chopper's downward spotlight cone
      ch.chopperCone.rotation.z = ch.dir * 0.26 + Math.sin(t * 0.95 + ch.phase) * 0.22;
    }

    // 5. Scrolling outer-viaduct / adjacent-deck LA traffic & Metro light-streak ribbons
    const boostStretch = 1.0 + (isBoosting ? 0.85 : 0.0) + boostBlend * 0.65;
    for (let i = 0; i < trafficStreaks.length; i++) {
      const tr = trafficStreaks[i];
      const scrollVel = Math.max(14, speed + tr.relSpeedOffset);
      tr.mesh.position.z += scrollVel * safeDt;
      if (tr.mesh.position.z > 24) {
        tr.mesh.position.z -= streakSpanZ;
      }
      tr.mesh.scale.z = tr.isMetro ? 1.0 : boostStretch;
    }

    // 6. Subtle audio-reactive "Ribbon of Light" wave along the Sixth Street Viaduct arches
    for (let k = 0; k < archWaveMats.length; k++) {
      const wave = 0.5 + 0.5 * Math.sin(t * 2.8 - k * 0.95);
      archWaveMats[k].emissiveIntensity = 1.48 + wave * 0.34 + bass * 0.48;
    }

    // 7. Subtle shimmer on the wet highway sunset reflection ribbon
    roadShimmerMesh.material.opacity = 0.19 + 0.04 * Math.sin(t * 2.1) + bass * 0.06;
  }

  return {
    group,
    modeOverrides,
    sunConfig,
    onResetSegments,
    onCloneSegment,
    update
  };
}
