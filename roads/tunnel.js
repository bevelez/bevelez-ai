// ============================================================================
// Option 6 (ROAD_MODES[5], Key 6): AMBIENT TUNNEL
// Tokyo Bay Aqua-Line x Cyberpunk 2077 x Wangan Midnight Subsea Megatunnel
// ============================================================================

export function createRoadWorld({ THREE, scene, neonColor }) {
  const group = new THREE.Group();
  group.name = 'AmbientTunnelWorld';
  group.visible = false;
  scene.add(group);

  const modeOverrides = {
    segmentLength: 12,
    showSun: false,
    showTerrain: false,
    showStars: false,
    showCity: false,
    showMidgarCity: false,
    showMakoReactor: false,
    skyTopHex: '#02050b',
    skyMidHex: '#030812',
    skyHorizonHex: '#040b18',
    fogHex: '#040b18',
    fogDensity: 0.0052,
    roadColorHex: '#040811',
    roadRoughness: 0.085,
    roadMetalness: 0.84,
    laneDashes: ['#00e5ff', '#ffaa22'],
    underglowHex: '#00aaff',
    cssCyan: '#00e5ff',
    cssMagenta: '#ffaa22',
    cssBgDeep: '#02050b',
    ambientLightHex: '#0b1930',
    ambientIntensity: 1.35,
    horizonLightHex: '#00ccff',
    horizonIntensity: 1.1,
    cityRimHex: '#ffaa22',
    cityRimIntensity: 1.15
  };

  // --------------------------------------------------------------------------
  // 1. SHARED AUDIO-REACTIVE EMISSIVE WAVE MATERIALS FOR TunnelArchLED RIBS
  // --------------------------------------------------------------------------
  // 24 cloned 12m segments (288m span) % 6 === 0 -> seamless cyclic wave wrap
  const NUM_ARCH_PHASES = 6;
  const archColorDeep = new THREE.Color('#0048e8');
  const archColorCrest = new THREE.Color('#00e5ff');
  const archColorBoost = new THREE.Color('#7cf9ff');
  const archTempColor = new THREE.Color();

  const archWaveMaterials = Array.from({ length: NUM_ARCH_PHASES }, () =>
    new THREE.MeshStandardMaterial({
      color: 0x06162e,
      emissive: new THREE.Color('#0068ff'),
      emissiveIntensity: 1.5,
      roughness: 0.24,
      metalness: 0.52,
      side: THREE.DoubleSide
    })
  );

  const fanRotors = [];

  // --------------------------------------------------------------------------
  // 2. SCROLLING OVERHEAD POINTLIGHT POOL (Z in [-54, +18], 72m loop)
  // --------------------------------------------------------------------------
  // Sweeps real cyan & warm sodium-amber specular highlights across the
  // DeLorean's brushed stainless-steel panels, rear louvers, and wet asphalt.
  const LIGHT_Z_MIN = -54;
  const LIGHT_Z_MAX = 18;
  const LIGHT_SPAN = LIGHT_Z_MAX - LIGHT_Z_MIN; // 72m

  const overheadLights = [
    { color: 0x00e5ff, x: -2.8, y: 7.15, z: -54, baseIntensity: 84 },
    { color: 0xff9f24, x: 2.8, y: 7.15, z: -36, baseIntensity: 76 },
    { color: 0x00e5ff, x: 2.4, y: 7.15, z: -18, baseIntensity: 84 },
    { color: 0xff9f24, x: -2.4, y: 7.15, z: 0, baseIntensity: 76 }
  ].map((cfg) => {
    const light = new THREE.PointLight(cfg.color, cfg.baseIntensity, 32, 1.75);
    light.position.set(cfg.x, cfg.y, cfg.z);
    group.add(light);
    return { light, baseIntensity: cfg.baseIntensity, baseX: cfg.x };
  });

  // --------------------------------------------------------------------------
  // 3. DISTANT VANISHING-POINT PORTAL HALO AT Z = -245 (fog: false)
  // --------------------------------------------------------------------------
  const portalGroup = new THREE.Group();
  portalGroup.position.set(0, 0, -245);
  group.add(portalGroup);

  function createPortalGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 256);

    // Clip to the subsea bore arch silhouette so zero glow bleeds outside tunnel walls
    ctx.save();
    ctx.beginPath();
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI; // 0 (right) -> pi (left)
      const c = Math.cos(theta);
      const sign = c >= 0 ? 1 : -1;
      const u = Math.abs(c);
      const nx = sign * Math.pow(u, 0.62); // -1 .. +1
      const ny = Math.pow(Math.max(0, 1 - u * u), 0.20); // 0 .. 1 in upper vault
      const px = 256 + nx * 246;
      const py = 252 - (0.38 + 0.58 * ny) * 244;
      if (i === 0) ctx.moveTo(256 + 246, 252);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(256 - 246, 252);
    ctx.closePath();
    ctx.clip();

    // Deep-sea cyan horizon radial bloom
    const coreGrad = ctx.createRadialGradient(256, 152, 6, 256, 152, 235);
    coreGrad.addColorStop(0.0, 'rgba(225, 253, 255, 0.96)');
    coreGrad.addColorStop(0.18, 'rgba(0, 229, 255, 0.82)');
    coreGrad.addColorStop(0.48, 'rgba(0, 132, 255, 0.36)');
    coreGrad.addColorStop(0.78, 'rgba(4, 38, 88, 0.12)');
    coreGrad.addColorStop(1.0, 'rgba(0, 12, 28, 0.0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, 512, 256);

    // Warm sodium-amber highway horizon reflection band at base of portal
    const roadGlow = ctx.createRadialGradient(256, 236, 4, 256, 236, 165);
    roadGlow.addColorStop(0.0, 'rgba(255, 214, 138, 0.72)');
    roadGlow.addColorStop(0.35, 'rgba(255, 159, 36, 0.34)');
    roadGlow.addColorStop(1.0, 'rgba(255, 120, 20, 0.0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = roadGlow;
    ctx.fillRect(0, 110, 512, 146);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const portalGlowMat = new THREE.MeshBasicMaterial({
    map: createPortalGlowTexture(),
    color: neonColor(0xffffff, 1.24),
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const portalGlowDisc = new THREE.Mesh(new THREE.PlaneGeometry(19.8, 9.1), portalGlowMat);
  portalGlowDisc.position.set(0, 4.55, -10);
  portalGroup.add(portalGlowDisc);

  // Concentric glowing cyan & amber architectural bore arch rings framing the vanishing point
  function buildBoreArchCurve(scaleXY) {
    const pts = [];
    const total = 34;
    pts.push(new THREE.Vector3(9.75 * scaleXY, 0.12, 0));
    pts.push(new THREE.Vector3(9.95 * scaleXY, 2.2, 0));
    for (let i = 0; i <= total; i++) {
      const theta = (i / total) * Math.PI;
      const c = Math.cos(theta);
      const sign = c >= 0 ? 1 : -1;
      const u = Math.abs(c);
      const x = sign * 9.95 * Math.pow(u, 0.62) * scaleXY;
      const y = (3.95 + 4.98 * Math.pow(Math.max(0, 1 - u * u), 0.20)) * scaleXY;
      pts.push(new THREE.Vector3(x, y, 0));
    }
    pts.push(new THREE.Vector3(-9.95 * scaleXY, 2.2, 0));
    pts.push(new THREE.Vector3(-9.75 * scaleXY, 0.12, 0));
    return new THREE.CatmullRomCurve3(pts, false);
  }

  const portalRingConfigs = [
    { zOff: 18, scale: 0.99, radius: 0.095, hex: '#00e5ff', hdr: 1.42 },
    { zOff: 6, scale: 0.93, radius: 0.085, hex: '#ffaa22', hdr: 1.34 },
    { zOff: -4, scale: 0.86, radius: 0.085, hex: '#00e5ff', hdr: 1.52 },
    { zOff: -13, scale: 0.78, radius: 0.075, hex: '#88f4ff', hdr: 1.58 }
  ];

  const portalRings = portalRingConfigs.map((cfg, idx) => {
    const curve = buildBoreArchCurve(cfg.scale);
    const geo = new THREE.TubeGeometry(curve, 52, cfg.radius, 8, false);
    const mat = new THREE.MeshBasicMaterial({
      color: neonColor(cfg.hex, cfg.hdr),
      fog: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = cfg.zOff;
    portalGroup.add(mesh);
    return { mesh, mat, baseColor: new THREE.Color(cfg.hex), hdr: cfg.hdr, phase: idx * 0.9 };
  });

  // Distant wet-asphalt horizon reflection path leading into the portal
  function createHorizonReflectionTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, 'rgba(120, 245, 255, 0.75)');
    grad.addColorStop(0.35, 'rgba(0, 205, 255, 0.35)');
    grad.addColorStop(0.75, 'rgba(255, 165, 42, 0.14)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 256);

    // Soft lateral falloff so edges feather into wet asphalt
    ctx.globalCompositeOperation = 'destination-in';
    const sideMask = ctx.createLinearGradient(0, 0, 128, 0);
    sideMask.addColorStop(0.0, 'rgba(0,0,0,0)');
    sideMask.addColorStop(0.28, 'rgba(0,0,0,1)');
    sideMask.addColorStop(0.72, 'rgba(0,0,0,1)');
    sideMask.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = sideMask;
    ctx.fillRect(0, 0, 128, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const horizonSheenMat = new THREE.MeshBasicMaterial({
    map: createHorizonReflectionTexture(),
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false
  });
  const horizonSheen = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 92), horizonSheenMat);
  horizonSheen.rotation.x = -Math.PI / 2;
  horizonSheen.position.set(0, 0.018, 36); // world Z = -245 + 36 = -209 (spans -255..-163)
  portalGroup.add(horizonSheen);

  // --------------------------------------------------------------------------
  // 4. WET CURBSIDE SPECULAR REFLECTION RIBBONS (X = +-8.55, Y = 0.015)
  // --------------------------------------------------------------------------
  function createWetShimmerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 512);

    // Deterministic wet asphalt specular streaks in ice-cyan & warm sodium-amber
    let seed = 4219;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 64; i++) {
      const cx = 20 + rand() * 88;
      const cy = rand() * 512;
      const rw = 3 + rand() * 11;
      const rh = 24 + rand() * 68;
      const isCyan = i % 3 !== 0;
      const color = isCyan ? '0, 229, 255' : '255, 162, 38';
      const alpha = 0.16 + rand() * 0.28;

      for (const wrapY of [cy - 512, cy, cy + 512]) {
        if (wrapY + rh < 0 || wrapY - rh > 512) continue;
        const g = ctx.createRadialGradient(cx, wrapY, 0, cx, wrapY, rh);
        g.addColorStop(0.0, `rgba(${color}, ${alpha})`);
        g.addColorStop(0.55, `rgba(${color}, ${alpha * 0.4})`);
        g.addColorStop(1.0, `rgba(${color}, 0)`);
        ctx.save();
        ctx.translate(cx, wrapY);
        ctx.scale(rw / rh, 1.0);
        ctx.translate(-cx, -wrapY);
        ctx.fillStyle = g;
        ctx.fillRect(cx - rh, wrapY - rh, rh * 2, rh * 2);
        ctx.restore();
      }
    }

    // Feather left & right ribbon edges smoothly
    ctx.globalCompositeOperation = 'destination-in';
    const edgeMask = ctx.createLinearGradient(0, 0, 128, 0);
    edgeMask.addColorStop(0.0, 'rgba(0,0,0,0)');
    edgeMask.addColorStop(0.22, 'rgba(0,0,0,1)');
    edgeMask.addColorStop(0.78, 'rgba(0,0,0,1)');
    edgeMask.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = edgeMask;
    ctx.fillRect(0, 0, 128, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 13);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const wetRibbonTex = createWetShimmerTexture();
  const wetRibbonMat = new THREE.MeshBasicMaterial({
    map: wetRibbonTex,
    color: neonColor(0xffffff, 1.15),
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const RIBBON_LEN = 290;
  [-8.52, 8.52].forEach((xPos) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, RIBBON_LEN), wetRibbonMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(xPos, 0.015, -RIBBON_LEN / 2 + 22);
    group.add(mesh);
  });

  // Secondary subtle outer-lane wet cove-light reflection ribbons
  const innerSheenMat = new THREE.MeshBasicMaterial({
    map: wetRibbonTex,
    color: neonColor('#00d8ff', 1.05),
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  [-5.75, 5.75].forEach((xPos) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, RIBBON_LEN), innerSheenMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(xPos, 0.014, -RIBBON_LEN / 2 + 22);
    group.add(mesh);
  });

  // --------------------------------------------------------------------------
  // 5. HIGH-VELOCITY SLIPSTREAM DUST / SPARK STREAKS (STRETCH UNDER BOOST)
  // --------------------------------------------------------------------------
  // Placed along upper vault & outer bore margins so center sightlines stay clean
  const STREAK_COUNT = 108;
  const STREAK_Z_MIN = -225;
  const STREAK_Z_MAX = 22;
  const STREAK_Z_SPAN = STREAK_Z_MAX - STREAK_Z_MIN;

  const streakPositions = new Float32Array(STREAK_COUNT * 6);
  const streakColors = new Float32Array(STREAK_COUNT * 6);
  const streakMeta = [];

  const colCyan = new THREE.Color('#00e5ff');
  const colBlue = new THREE.Color('#2d88ff');
  const colAmber = new THREE.Color('#ffaa33');

  let sSeed = 9187;
  const sRand = () => {
    sSeed = (sSeed * 16807) % 2147483647;
    return (sSeed - 1) / 2147483646;
  };

  for (let i = 0; i < STREAK_COUNT; i++) {
    let sx;
    let sy;
    if (i % 3 === 0) {
      // High crown slipstream streaks
      sx = (sRand() - 0.5) * 14.4;
      sy = 6.35 + sRand() * 2.15;
    } else {
      // Outer bore wall slipstream & tire-draft sparks
      const side = i % 2 === 0 ? 1 : -1;
      sx = side * (7.35 + sRand() * 1.75);
      sy = 0.85 + sRand() * 5.8;
    }
    const sz = STREAK_Z_MIN + sRand() * STREAK_Z_SPAN;
    const speedMul = 0.88 + sRand() * 0.42;
    const baseLen = 1.35 + sRand() * 1.15;

    streakMeta.push({ x: sx, y: sy, z: sz, speedMul, baseLen });

    const cPick = i % 6 === 0 ? colAmber : (i % 3 === 0 ? colBlue : colCyan);
    const base = i * 6;
    streakPositions[base] = sx;
    streakPositions[base + 1] = sy;
    streakPositions[base + 2] = sz;
    streakPositions[base + 3] = sx;
    streakPositions[base + 4] = sy;
    streakPositions[base + 5] = sz - baseLen;

    // Bright leading head, soft trailing tail
    streakColors[base] = cPick.r * 1.15;
    streakColors[base + 1] = cPick.g * 1.15;
    streakColors[base + 2] = cPick.b * 1.15;
    streakColors[base + 3] = cPick.r * 0.08;
    streakColors[base + 4] = cPick.g * 0.08;
    streakColors[base + 5] = cPick.b * 0.08;
  }

  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(streakColors, 3));

  const streakMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const slipstreamStreaks = new THREE.LineSegments(streakGeo, streakMat);
  slipstreamStreaks.frustumCulled = false;
  group.add(slipstreamStreaks);

  // --------------------------------------------------------------------------
  // 6. SEGMENT LIFECYCLE & REAL-TIME UPDATE HOOKS
  // --------------------------------------------------------------------------
  function onResetSegments() {
    fanRotors.length = 0;
  }

  function onCloneSegment(clone, index = 0) {
    if (!clone) return;
    const phaseIdx = ((index % NUM_ARCH_PHASES) + NUM_ARCH_PHASES) % NUM_ARCH_PHASES;
    const sharedWaveMat = archWaveMaterials[phaseIdx];

    clone.traverse((child) => {
      if (!child.isMesh || !child.name) return;
      if (child.name.includes('TunnelFanRotor')) {
        fanRotors.push({
          mesh: child,
          dir: child.name.endsWith('_R') ? -1 : 1
        });
      } else if (child.name.includes('TunnelArchLED')) {
        child.material = sharedWaveMat;
      }
    });
  }

  function smoothstep(edge0, edge1, x) {
    const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function update({ dt, elapsed, baseSpeed, isBoosting, boostBlend = 0, metrics }) {
    const safeDt = Math.min(Math.max(dt || 0, 0), 0.1);
    const t = elapsed || 0;
    const speed = baseSpeed || 48;
    const bBlend = THREE.MathUtils.clamp(boostBlend || (isBoosting ? 1 : 0), 0, 1);
    const bass = metrics?.bass || 0;
    const mid = metrics?.mid || 0;
    const high = metrics?.high || 0;
    const spectrum = metrics?.spectrum;

    // 1. Scroll Overhead PointLight Pool & modulate envelope smoothly across wrap
    for (let i = 0; i < overheadLights.length; i++) {
      const entry = overheadLights[i];
      const light = entry.light;
      light.position.z += speed * safeDt;
      if (light.position.z > LIGHT_Z_MAX) {
        light.position.z -= LIGHT_SPAN;
      }
      const z = light.position.z;
      const env = smoothstep(LIGHT_Z_MIN, LIGHT_Z_MIN + 12, z) * (1 - smoothstep(LIGHT_Z_MAX - 9, LIGHT_Z_MAX, z));
      light.intensity = entry.baseIntensity * env * (1.0 + bass * 0.30 + bBlend * 0.24);
    }

    // 2. Spin Twin Axial Jet-Fan Booster Rotors smoothly around local Z bore axis
    if (fanRotors.length > 0) {
      const spinDelta = (5.4 + speed * 0.055 + bBlend * 4.2) * safeDt;
      for (let i = 0; i < fanRotors.length; i++) {
        const r = fanRotors[i];
        r.mesh.rotation.z += r.dir * spinDelta;
      }
    }

    // 3. Ripple Audio-Reactive Cobalt -> Ice-Cyan Chasing Light Waves down TunnelArchLEDs
    const waveFreq = 3.4 + bBlend * 3.8;
    for (let p = 0; p < NUM_ARCH_PHASES; p++) {
      const mat = archWaveMaterials[p];
      const phaseAngle = t * waveFreq - (p / NUM_ARCH_PHASES) * Math.PI * 2;
      const wave01 = 0.5 + 0.5 * Math.sin(phaseAngle);
      const specEnergy = spectrum && spectrum.length > p * 2 ? spectrum[p * 2] / 255 : mid;

      archTempColor.copy(archColorDeep).lerp(archColorCrest, Math.pow(wave01, 1.35));
      if (bBlend > 0.01) {
        archTempColor.lerp(archColorBoost, bBlend * 0.45 * wave01);
      }
      mat.emissive.copy(archTempColor);
      mat.emissiveIntensity = 1.05 + wave01 * 0.92 + bass * 0.52 + specEnergy * 0.32 + bBlend * 0.42;
    }

    // 4. Scroll Wet Curbside Specular Reflection Ribbons
    wetRibbonTex.offset.y -= speed * safeDt * 0.045;
    wetRibbonMat.opacity = 0.30 + high * 0.12 + bBlend * 0.10;
    innerSheenMat.opacity = 0.12 + bass * 0.06 + bBlend * 0.06;

    // 5. Animate Slipstream Dust/Spark Streaks (stretch tail dramatically under BOOST)
    const posAttr = streakGeo.attributes.position;
    const posArr = posAttr.array;
    const stretchFactor = 1.0 + bBlend * 3.4 + bass * 0.45;
    const streakVelocity = speed * (1.22 + bBlend * 0.58);

    for (let i = 0; i < STREAK_COUNT; i++) {
      const m = streakMeta[i];
      m.z += streakVelocity * m.speedMul * safeDt;
      if (m.z > STREAK_Z_MAX) {
        m.z -= STREAK_Z_SPAN;
      }
      const len = m.baseLen * stretchFactor;
      const base = i * 6;
      posArr[base + 2] = m.z;
      posArr[base + 5] = m.z - len;
    }
    posAttr.needsUpdate = true;
    streakMat.opacity = 0.36 + bBlend * 0.34 + high * 0.10;

    // 6. Subtle Horizon Portal Breathing & Audio-Reactive Ring Harmonics
    const portalPulse = 1.0 + Math.sin(t * 2.4) * 0.035 + bass * 0.09 + bBlend * 0.06;
    portalGlowDisc.scale.set(portalPulse, 0.98 + bass * 0.06, 1);
    portalGlowMat.opacity = 0.86 + Math.sin(t * 3.1) * 0.05 + bass * 0.08;
    horizonSheenMat.opacity = 0.38 + bass * 0.12 + bBlend * 0.08;

    for (let i = 0; i < portalRings.length; i++) {
      const pr = portalRings[i];
      const ringWave = 0.92 + 0.16 * Math.sin(t * 3.2 - pr.phase) + bass * 0.22 + bBlend * 0.18;
      pr.mat.color.copy(pr.baseColor).multiplyScalar(pr.hdr * ringWave);
    }
  }

  return {
    group,
    modeOverrides,
    sunConfig: null,
    onResetSegments,
    onCloneSegment,
    update
  };
}
