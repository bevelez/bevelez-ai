// Tape No. 07: Pirate Frequency — 3D Hoverboard Courier, Arcade Physics,
// Magnet Rail-Grinding, Beat-Quantized Tricks & Dynamic Chase Camera.

const TRICK_CATALOG = Object.freeze([
  { name: 'CASSETTE FLIP', basePoints: 300, duration: 0.62 },
  { name: '360 PIRATE SPIN', basePoints: 350, duration: 0.66 },
  { name: 'FM METHOD GRAB', basePoints: 400, duration: 0.68 },
  { name: 'SIGNAL OVERDRIVE', basePoints: 450, duration: 0.68 },
  { name: 'SUBWOOFER SHUVIT', basePoints: 350, duration: 0.64 },
  { name: 'ANTENNA HANDPLANT', basePoints: 500, duration: 0.72 }
]);

const PHYSICS = Object.freeze({
  CRUISE_SPEED: 38.0,
  BOOST_SPEED: 56.0,
  GRIND_SPEED: 44.0,
  GRIND_BOOST_SPEED: 54.0,
  REVERSE_MAX: -10.0,
  ACCEL: 38.0,
  BOOST_ACCEL: 64.0,
  BRAKE_DECEL: 52.0,
  COAST_DECEL: 5.2,
  AIR_DRAG: 1.35,
  GRAVITY: 30.0,
  JUMP_VEL_Y: 14.5,
  RAIL_JUMP_VEL_Y: 15.2,
  AIR_DASH_VEL_Y: 10.6,
  WALL_KICK_VEL_Y: 11.8,
  BASE_TURN_RATE: 2.55,
  DRIFT_TURN_RATE: 3.45,
  AIR_TURN_RATE: 2.25,
  COLLISION_RADIUS: 0.85,
  RAIL_SNAP_DIST: 3.2,
  PICKUP_RADIUS: 2.9,
  COYOTE_TIME: 0.14,
  JUMP_BUFFER_TIME: 0.12,
  TRICK_COOLDOWN: 0.30
});

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrapAngle(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function shortestAngleDiff(from, to) {
  return wrapAngle(to - from);
}

function lerpAngle(from, to, t) {
  return from + shortestAngleDiff(from, to) * clamp(t, 0, 1);
}

function finiteOr(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

export function createCourierPlayer({ THREE, scene }) {
  if (!THREE) {
    throw new Error('createCourierPlayer requires { THREE, scene }');
  }

  const group = new THREE.Group();
  group.name = 'PirateCourierPlayer';
  if (scene && typeof scene.add === 'function') {
    scene.add(group);
  }

  // World-space FX container for wake ribbons, sparks, and ground drop-ring
  const worldFxGroup = new THREE.Group();
  worldFxGroup.name = 'PirateCourierWorldFX';
  if (scene && typeof scene.add === 'function') {
    scene.add(worldFxGroup);
  }

  // ---------------------------------------------------------------------------
  // 1. CEL-SHADING RAMP & MATERIAL HELPERS (Jet Set Radio crisp comic style)
  // ---------------------------------------------------------------------------
  let toonGradientMap = null;
  if (typeof THREE.DataTexture === 'function') {
    const rampBytes = new Uint8Array([52, 164, 255]);
    const fmt = THREE.RedFormat !== undefined ? THREE.RedFormat : undefined;
    toonGradientMap = fmt !== undefined
      ? new THREE.DataTexture(rampBytes, 3, 1, fmt)
      : new THREE.DataTexture(new Uint8Array([52, 52, 52, 255, 164, 164, 164, 255, 255, 255, 255, 255]), 3, 1);
    if (THREE.NearestFilter !== undefined) {
      toonGradientMap.minFilter = THREE.NearestFilter;
      toonGradientMap.magFilter = THREE.NearestFilter;
    }
    toonGradientMap.needsUpdate = true;
  }

  const inkOutlineMat = new THREE.MeshBasicMaterial({
    color: 0x09080f,
    side: THREE.BackSide !== undefined ? THREE.BackSide : 1,
    depthWrite: false,
    toneMapped: false
  });

  function makeToonMat(colorHex, emissiveHex = 0x000000, emissiveIntensity = 0.0) {
    const MatCtor = THREE.MeshToonMaterial || THREE.MeshStandardMaterial || THREE.MeshBasicMaterial;
    const cfg = { color: colorHex };
    if (MatCtor === THREE.MeshToonMaterial && toonGradientMap) {
      cfg.gradientMap = toonGradientMap;
    }
    if (emissiveHex && MatCtor !== THREE.MeshBasicMaterial) {
      cfg.emissive = new THREE.Color(emissiveHex);
      cfg.emissiveIntensity = emissiveIntensity;
    }
    return new MatCtor(cfg);
  }

  function makeGlowMat(colorHex, opacity = 1.0, additive = false) {
    const cfg = {
      color: colorHex,
      transparent: opacity < 1.0 || additive,
      opacity,
      toneMapped: false
    };
    if (additive && THREE.AdditiveBlending !== undefined) {
      cfg.blending = THREE.AdditiveBlending;
      cfg.depthWrite = false;
    }
    if (THREE.DoubleSide !== undefined) {
      cfg.side = THREE.DoubleSide;
    }
    return new THREE.MeshBasicMaterial(cfg);
  }

  function addOutlinedMesh(parent, geometry, material, outlineScale = 1.068) {
    const holder = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    holder.add(mesh);

    if (outlineScale > 1.0) {
      const outline = new THREE.Mesh(geometry, inkOutlineMat);
      if ( Array.isArray(outlineScale) ) {
        outline.scale.set(outlineScale[0], outlineScale[1], outlineScale[2]);
      } else {
        outline.scale.set(outlineScale, outlineScale, outlineScale);
      }
      holder.add(outline);
    }
    parent.add(holder);
    return holder;
  }

  // Palette materials
  const mats = {
    orange: makeToonMat(0xff6b1a, 0x3a1000, 0.22),
    yellow: makeToonMat(0xffe042, 0x3a2c00, 0.24),
    cyanToon: makeToonMat(0x00f0ff, 0x005566, 0.45),
    indigoDark: makeToonMat(0x181b38, 0x050611, 0.15),
    indigoMid: makeToonMat(0x283064, 0x080b1f, 0.18),
    charcoal: makeToonMat(0x14121f),
    canvasBag: makeToonMat(0x2d334a, 0x070810, 0.12),
    skin: makeToonMat(0xebb48e, 0x2a1108, 0.12),
    hair: makeToonMat(0x0e2a38, 0x001822, 0.2),
    white: makeToonMat(0xf7f8ff, 0x1a2030, 0.15),
    cyanGlow: makeGlowMat(0x00f0ff, 0.96, false),
    yellowGlow: makeGlowMat(0xffe042, 0.96, false),
    magentaGlow: makeGlowMat(0xff2a85, 0.96, false),
    greenGlow: makeGlowMat(0x1aff9c, 0.96, false),
    orangeGlow: makeGlowMat(0xff6b1a, 0.96, false),
    thrusterCore: makeGlowMat(0xdffcff, 0.95, true),
    thrusterPlume: makeGlowMat(0x00f0ff, 0.72, true),
    boardRailGlow: makeGlowMat(0x00f0ff, 0.95, false),
    antennaTipGlow: makeGlowMat(0xff2a85, 1.0, false),
    headphoneEqGlow: makeGlowMat(0x00f0ff, 0.95, false)
  };

  // ---------------------------------------------------------------------------
  // 2. CASSETTE-DECK MAG-LEV HOVERBOARD + CEL-SHADED STREET COURIER RIG
  // ---------------------------------------------------------------------------
  // Local orientation convention: -Z is forward, +X is right, +Y is up.
  const visualRoot = new THREE.Group();
  visualRoot.position.set(0, 0.24, 0);
  group.add(visualRoot);

  // Subtle plasma underglow light illuminating streets, rails & courier sneakers
  let underglowLight = null;
  if (typeof THREE.PointLight === 'function') {
    underglowLight = new THREE.PointLight(0x00f0ff, 2.2, 9.0, 1.6);
    underglowLight.position.set(0, 0.28, 0);
    group.add(underglowLight);
  }

  // --- A. Mag-Lev Cassette Hoverboard (`boardRig`) ---
  const boardRig = new THREE.Group();
  visualRoot.add(boardRig);

  // Main deck chassis
  const deckCenter = addOutlinedMesh(
    boardRig,
    new THREE.BoxGeometry(0.54, 0.075, 1.14),
    mats.orange,
    [1.07, 1.24, 1.04]
  );
  deckCenter.position.set(0, 0, 0);

  // Angled nose (-Z) & tail (+Z) kicktails in cyber yellow
  const noseKick = addOutlinedMesh(
    boardRig,
    new THREE.BoxGeometry(0.48, 0.068, 0.30),
    mats.yellow,
    [1.08, 1.24, 1.08]
  );
  noseKick.position.set(0, 0.036, -0.68);
  noseKick.rotation.x = 0.26;

  const tailKick = addOutlinedMesh(
    boardRig,
    new THREE.BoxGeometry(0.48, 0.068, 0.30),
    mats.yellow,
    [1.08, 1.24, 1.08]
  );
  tailKick.position.set(0, 0.036, 0.68);
  tailKick.rotation.x = -0.26;

  // Recessed cassette tape deck window on top of board
  const tapeBay = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.02, 0.78), mats.charcoal);
  tapeBay.position.set(0, 0.038, 0);
  boardRig.add(tapeBay);

  // Cassette label stripe
  const labelStripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.014, 0.14), mats.yellowGlow);
  labelStripe.position.set(0, 0.045, -0.28);
  boardRig.add(labelStripe);

  // Spinning Dual Cassette Spools inside the hoverboard deck
  const cassetteReels = [];
  for (const zOff of [-0.15, 0.17]) {
    const reelGroup = new THREE.Group();
    reelGroup.position.set(0, 0.048, zOff);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.018, 14), mats.cyanGlow);
    reelGroup.add(hub);
    const innerHole = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.022, 10), mats.charcoal);
    reelGroup.add(innerHole);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.021, 0.022), mats.white);
      spoke.rotation.y = (k * Math.PI) / 3;
      reelGroup.add(spoke);
    }
    boardRig.add(reelGroup);
    cassetteReels.push(reelGroup);
  }

  // Glowing side mag-grind rails along left & right edges of deck
  for (const side of [-1, 1]) {
    const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.048, 1.12), mats.boardRailGlow);
    sideRail.position.set(side * 0.285, 0.0, 0);
    boardRig.add(sideRail);
  }

  // Underside Dual Repulsor Pads & Twin Rear Plasma Hover-Thrusters
  const repulsorRings = [];
  for (const zOff of [-0.42, 0.42]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.20, 0.045, 14), mats.charcoal);
    pad.position.set(0, -0.052, zOff);
    boardRig.add(pad);

    const glowDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.025, 14), mats.thrusterPlume);
    glowDisc.position.set(0, -0.075, zOff);
    boardRig.add(glowDisc);
    repulsorRings.push(glowDisc);
  }

  const thrusterPlumes = [];
  for (const side of [-1, 1]) {
    const nozzle = addOutlinedMesh(
      boardRig,
      new THREE.CylinderGeometry(0.055, 0.078, 0.18, 10),
      mats.charcoal,
      1.09
    );
    nozzle.position.set(side * 0.145, -0.02, 0.78);
    nozzle.rotation.x = Math.PI * 0.5;

    const plumeGroup = new THREE.Group();
    plumeGroup.position.set(side * 0.145, -0.02, 0.87);

    const coreCone = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.28, 10), mats.thrusterCore);
    coreCone.rotation.x = Math.PI * 0.5;
    coreCone.position.set(0, 0, 0.14);
    plumeGroup.add(coreCone);

    const outerCone = new THREE.Mesh(new THREE.ConeGeometry(0.088, 0.54, 10), mats.thrusterPlume);
    outerCone.rotation.x = Math.PI * 0.5;
    outerCone.position.set(0, 0, 0.26);
    plumeGroup.add(outerCone);

    boardRig.add(plumeGroup);
    thrusterPlumes.push(plumeGroup);
  }

  // --- B. Articulated Cel-Shaded Street Courier (`hipsRig`) ---
  const hipsRig = new THREE.Group();
  const STANCE_YAW = 0.50; // Stylish 28-deg street skater stance on the deck
  hipsRig.position.set(0, 0.72, 0.02);
  hipsRig.rotation.y = STANCE_YAW;
  visualRoot.add(hipsRig);

  // Pelvis / Belt
  const pelvis = addOutlinedMesh(hipsRig, new THREE.BoxGeometry(0.32, 0.16, 0.22), mats.indigoDark, 1.07);
  pelvis.position.set(0, 0, 0);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.335, 0.045, 0.235), mats.yellow);
  belt.position.set(0, 0.055, 0);
  hipsRig.add(belt);

  // Legs (Thigh -> Knee -> Baggy Cargo Shin -> Giant Jet-Set High-Top Skate Sneakers)
  function buildLeg(sideSign, zStanceOffset) {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(sideSign * 0.09, -0.04, zStanceOffset);
    hipsRig.add(hipJoint);

    const thigh = addOutlinedMesh(hipJoint, new THREE.CylinderGeometry(0.075, 0.085, 0.32, 9), mats.indigoDark, 1.08);
    thigh.position.set(0, -0.15, 0);

    const kneeJoint = new THREE.Group();
    kneeJoint.position.set(0, -0.31, 0);
    hipJoint.add(kneeJoint);

    // Flared street cargo pant leg
    const shin = addOutlinedMesh(kneeJoint, new THREE.CylinderGeometry(0.082, 0.118, 0.30, 9), mats.indigoMid, 1.08);
    shin.position.set(0, -0.14, 0);

    // Oversized high-top mag-skate sneaker
    const ankleJoint = new THREE.Group();
    ankleJoint.position.set(0, -0.30, 0);
    kneeJoint.add(ankleJoint);

    const shoeCuff = addOutlinedMesh(ankleJoint, new THREE.CylinderGeometry(0.082, 0.088, 0.09, 9), mats.yellow, 1.08);
    shoeCuff.position.set(0, 0.02, 0);

    const shoeBody = addOutlinedMesh(ankleJoint, new THREE.BoxGeometry(0.165, 0.105, 0.30), mats.white, 1.08);
    shoeBody.position.set(0, -0.035, -0.045);

    const shoeTongue = addOutlinedMesh(ankleJoint, new THREE.BoxGeometry(0.11, 0.085, 0.10), mats.orange, 1.08);
    shoeTongue.position.set(0, 0.015, -0.09);
    shoeTongue.rotation.x = -0.32;

    const magSole = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.032, 0.315), mats.cyanGlow);
    magSole.position.set(0, -0.088, -0.045);
    ankleJoint.add(magSole);

    return { hipJoint, kneeJoint, ankleJoint };
  }

  const frontLeg = buildLeg(-1, -0.18); // Front foot near nose
  const backLeg = buildLeg(1, 0.20);    // Back foot near tail

  // Torso & Bomber Windbreaker Jacket
  const torsoRig = new THREE.Group();
  torsoRig.position.set(0, 0.08, 0);
  hipsRig.add(torsoRig);

  const jacketTorso = addOutlinedMesh(
    torsoRig,
    new THREE.CylinderGeometry(0.205, 0.16, 0.44, 10),
    mats.indigoMid,
    1.07
  );
  jacketTorso.scale.set(1.08, 1.0, 0.78);
  jacketTorso.position.set(0, 0.22, 0);

  // Atomic-orange V-chevron stripe on jacket chest & back
  const jacketStripe = addOutlinedMesh(
    torsoRig,
    new THREE.BoxGeometry(0.41, 0.10, 0.29),
    mats.orange,
    1.05
  );
  jacketStripe.position.set(0, 0.29, 0);

  // Glowing 107.7 Pirate Broadcast emblem on back of jacket
  const backEmblem = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 12), mats.cyanGlow);
  backEmblem.rotation.x = Math.PI * 0.5;
  backEmblem.position.set(0, 0.29, 0.152);
  torsoRig.add(backEmblem);

  // High popped cyber-yellow collar
  const poppedCollar = addOutlinedMesh(
    torsoRig,
    new THREE.CylinderGeometry(0.155, 0.135, 0.11, 10),
    mats.yellow,
    1.08
  );
  poppedCollar.position.set(0, 0.44, 0.01);

  // Crossbody Courier Strap + Messenger Bag Stuffed with Glowing Neon Cassettes
  const bagStrap = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.54, 0.315), mats.charcoal);
  bagStrap.position.set(0.01, 0.23, 0);
  bagStrap.rotation.z = 0.62;
  torsoRig.add(bagStrap);

  const bagRig = new THREE.Group();
  bagRig.position.set(0.21, 0.03, 0.13);
  bagRig.rotation.set(0.08, -0.25, -0.18);
  torsoRig.add(bagRig);

  addOutlinedMesh(bagRig, new THREE.BoxGeometry(0.15, 0.23, 0.28), mats.canvasBag, 1.08);
  const bagTrim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.29), mats.yellow);
  bagTrim.position.set(0, 0.03, 0);
  bagRig.add(bagTrim);

  // 4 Neon Bootleg Cassettes sticking out of the courier satchel
  const bagTapes = [];
  const tapeMats = [mats.cyanGlow, mats.yellowGlow, mats.magentaGlow, mats.greenGlow];
  for (let i = 0; i < 4; i++) {
    const tape = addOutlinedMesh(
      bagRig,
      new THREE.BoxGeometry(0.028, 0.11, 0.075),
      tapeMats[i],
      1.09
    );
    tape.position.set((i % 2 === 0 ? -0.026 : 0.026), 0.135 + (i % 2) * 0.018, -0.075 + i * 0.05);
    tape.rotation.set((i - 1.5) * 0.09, 0.12 * (i % 2 ? 1 : -1), (i % 2 ? -0.14 : 0.14));
    bagTapes.push(tape);
  }

  // Articulated Arms (Shoulder -> Upper Arm -> Elbow -> Forearm -> Glove)
  function buildArm(sideSign) {
    const shoulderJoint = new THREE.Group();
    shoulderJoint.position.set(sideSign * 0.235, 0.39, 0);
    torsoRig.add(shoulderJoint);

    const shoulderPuff = addOutlinedMesh(
      shoulderJoint,
      new THREE.SphereGeometry(0.078, 9, 8),
      mats.orange,
      1.08
    );
    shoulderPuff.position.set(0, -0.01, 0);

    const upperArm = addOutlinedMesh(
      shoulderJoint,
      new THREE.CylinderGeometry(0.062, 0.054, 0.25, 8),
      mats.indigoMid,
      1.08
    );
    upperArm.position.set(0, -0.13, 0);

    const elbowJoint = new THREE.Group();
    elbowJoint.position.set(0, -0.25, 0);
    shoulderJoint.add(elbowJoint);

    const forearm = addOutlinedMesh(
      elbowJoint,
      new THREE.CylinderGeometry(0.052, 0.046, 0.23, 8),
      mats.skin,
      1.08
    );
    forearm.position.set(0, -0.115, 0);

    const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.055, 8), mats.cyanGlow);
    wristband.position.set(0, -0.195, 0);
    elbowJoint.add(wristband);

    const glove = addOutlinedMesh(
      elbowJoint,
      new THREE.BoxGeometry(0.095, 0.105, 0.105),
      mats.charcoal,
      1.09
    );
    glove.position.set(0, -0.25, -0.01);

    return { shoulderJoint, elbowJoint };
  }

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Head, Cyber Shades, Oversized Pirate-Radio Headphones & Whipping Whip Antenna
  const headRig = new THREE.Group();
  headRig.position.set(0, 0.49, 0);
  headRig.rotation.y = -STANCE_YAW * 0.92; // Turned to look forward down -Z!
  torsoRig.add(headRig);

  const cranium = addOutlinedMesh(headRig, new THREE.SphereGeometry(0.145, 12, 10), mats.skin, 1.07);
  cranium.position.set(0, 0.13, 0);

  // Stylized street cap + spiky hair tufts
  const capCrown = addOutlinedMesh(
    headRig,
    new THREE.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
    mats.indigoDark,
    1.07
  );
  capCrown.position.set(0, 0.145, 0.01);
  capCrown.rotation.x = -0.18;

  const capBrim = addOutlinedMesh(headRig, new THREE.BoxGeometry(0.20, 0.026, 0.14), mats.yellow, 1.08);
  capBrim.position.set(0, 0.20, 0.14); // Backwards street cap brim!
  capBrim.rotation.x = 0.22;

  for (let i = -1; i <= 1; i++) {
    const spike = addOutlinedMesh(headRig, new THREE.ConeGeometry(0.042, 0.13, 6), mats.hair, 1.08);
    spike.position.set(i * 0.055, 0.19, -0.135);
    spike.rotation.set(-0.85, i * 0.25, -i * 0.18);
  }

  // Wrap-around neon cyber shades (-Z front)
  const visor = addOutlinedMesh(headRig, new THREE.BoxGeometry(0.25, 0.068, 0.10), mats.cyanGlow, 1.08);
  visor.position.set(0, 0.14, -0.11);

  // Oversized DJ Headphones
  const headbandArc = addOutlinedMesh(
    headRig,
    new THREE.TorusGeometry(0.168, 0.024, 8, 18, Math.PI),
    mats.charcoal,
    1.08
  );
  headbandArc.position.set(0, 0.145, 0);

  for (const side of [-1, 1]) {
    const earCup = addOutlinedMesh(
      headRig,
      new THREE.CylinderGeometry(0.078, 0.078, 0.072, 12),
      mats.orange,
      1.09
    );
    earCup.rotation.z = Math.PI * 0.5;
    earCup.position.set(side * 0.168, 0.135, 0);

    const eqRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.078, 12),
      mats.headphoneEqGlow
    );
    eqRing.rotation.z = Math.PI * 0.5;
    eqRing.position.set(side * 0.172, 0.135, 0);
    headRig.add(eqRing);
  }

  // 4-Link Articulated Pirate Radio Whip Antenna mounted on right headphone cup
  const antennaSegs = [];
  let antennaParent = headRig;
  const segLen = 0.23;
  for (let s = 0; s < 4; s++) {
    const segPivot = new THREE.Group();
    if (s === 0) {
      segPivot.position.set(0.185, 0.19, 0.01);
      segPivot.rotation.z = -0.14;
    } else {
      segPivot.position.set(0, segLen, 0);
    }
    const r0 = 0.013 - s * 0.0022;
    const r1 = Math.max(0.004, r0 - 0.0022);
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, segLen, 6),
      s % 2 === 0 ? mats.charcoal : mats.yellowGlow
    );
    rod.position.set(0, segLen * 0.5, 0);
    segPivot.add(rod);

    if (s === 3) {
      const tipBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), mats.antennaTipGlow);
      tipBeacon.position.set(0, segLen + 0.015, 0);
      segPivot.add(tipBeacon);
    }

    antennaParent.add(segPivot);
    antennaSegs.push(segPivot);
    antennaParent = segPivot;
  }

  // ---------------------------------------------------------------------------
  // 3. OVERHEAD 3D CRAZY-TAXI NEON NAVIGATION ARROW (y + 3.4m above rider)
  // ---------------------------------------------------------------------------
  const arrowAnchor = new THREE.Group();
  arrowAnchor.position.set(0, 3.4, 0);
  arrowAnchor.visible = false;
  group.add(arrowAnchor);

  const arrowSpinGroup = new THREE.Group();
  arrowAnchor.add(arrowSpinGroup);

  const arrowCoreMat = makeGlowMat(0x1aff9c, 0.98, false);
  const arrowRimMat = makeGlowMat(0x00f0ff, 0.55, true);

  // Chunky 3D arrowhead pointing toward local -Z + bold shaft + halo
  const arrowTip = addOutlinedMesh(
    arrowSpinGroup,
    new THREE.ConeGeometry(0.46, 0.78, 4),
    arrowCoreMat,
    1.09
  );
  arrowTip.rotation.x = -Math.PI * 0.5;
  arrowTip.rotation.z = Math.PI * 0.25;
  arrowTip.scale.set(1.25, 0.42, 1.0);
  arrowTip.position.set(0, 0, -0.34);

  const arrowShaft = addOutlinedMesh(
    arrowSpinGroup,
    new THREE.BoxGeometry(0.32, 0.16, 0.68),
    arrowCoreMat,
    1.09
  );
  arrowShaft.position.set(0, 0, 0.28);

  const arrowHalo = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.032, 8, 24), arrowRimMat);
  arrowHalo.rotation.x = Math.PI * 0.5;
  arrowSpinGroup.add(arrowHalo);

  // ---------------------------------------------------------------------------
  // 4. SCROLLING NEON WAKE RIBBONS, SPARK PARTICLE POOL & GROUND DROP RING
  // ---------------------------------------------------------------------------
  // Ground target ring right beneath rider for crisp rooftop & rail landing alignment
  const groundShadowRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.68, 0.02, 20),
    makeGlowMat(0x00f0ff, 0.34, true)
  );
  worldFxGroup.add(groundShadowRing);

  // Dual Wake Ribbon Trails (N = 26 slices each)
  const TRAIL_SLICES = 26;
  function createWakeRibbon(colorHex) {
    const vertCount = TRAIL_SLICES * 2;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices = [];
    for (let i = 0; i < TRAIL_SLICES - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    if (THREE.DynamicDrawUsage !== undefined) {
      posAttr.setUsage?.(THREE.DynamicDrawUsage);
      colAttr.setUsage?.(THREE.DynamicDrawUsage);
    }
    geo.setAttribute('position', posAttr);
    geo.setAttribute('color', colAttr);
    geo.setIndex?.(indices);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      toneMapped: false,
      ...(THREE.AdditiveBlending !== undefined ? { blending: THREE.AdditiveBlending } : {}),
      ...(THREE.DoubleSide !== undefined ? { side: THREE.DoubleSide } : {})
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    worldFxGroup.add(mesh);

    const history = [];
    for (let i = 0; i < TRAIL_SLICES; i++) {
      history.push({ x: 0, y: 0, z: 0, rx: 1, rz: 0 });
    }
    return { mesh, geo, positions, colors, posAttr, colAttr, history, baseColor: new THREE.Color(colorHex) };
  }

  const leftRibbon = createWakeRibbon(0x00f0ff);
  const rightRibbon = createWakeRibbon(0x00f0ff);
  const tmpTrailColor = new THREE.Color(0x00f0ff);

  function resetRibbons(x, y, z, heading) {
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    for (const rib of [leftRibbon, rightRibbon]) {
      const side = rib === leftRibbon ? -0.16 : 0.16;
      for (let i = 0; i < TRAIL_SLICES; i++) {
        rib.history[i].x = x + rx * side;
        rib.history[i].y = y + 0.22;
        rib.history[i].z = z + rz * side;
        rib.history[i].rx = rx;
        rib.history[i].rz = rz;
      }
    }
  }

  // Procedural Spark-Shower Particle Pool (for rail-grinds, wall-rides & PERFECT tricks)
  const SPARK_POOL_SIZE = 96;
  const sparkPositions = new Float32Array(SPARK_POOL_SIZE * 3);
  const sparkColors = new Float32Array(SPARK_POOL_SIZE * 3);
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPosAttr = new THREE.BufferAttribute(sparkPositions, 3);
  const sparkColAttr = new THREE.BufferAttribute(sparkColors, 3);
  if (THREE.DynamicDrawUsage !== undefined) {
    sparkPosAttr.setUsage?.(THREE.DynamicDrawUsage);
    sparkColAttr.setUsage?.(THREE.DynamicDrawUsage);
  }
  sparkGeo.setAttribute('position', sparkPosAttr);
  sparkGeo.setAttribute('color', sparkColAttr);

  let sparkVisual = null;
  if (typeof THREE.Points === 'function' && typeof THREE.PointsMaterial === 'function') {
    const sparkMat = new THREE.PointsMaterial({
      size: 0.30,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      toneMapped: false,
      ...(THREE.AdditiveBlending !== undefined ? { blending: THREE.AdditiveBlending } : {})
    });
    sparkVisual = new THREE.Points(sparkGeo, sparkMat);
    sparkVisual.frustumCulled = false;
    worldFxGroup.add(sparkVisual);
  }

  const sparks = [];
  for (let i = 0; i < SPARK_POOL_SIZE; i++) {
    sparks.push({
      active: false,
      x: 0, y: -999, z: 0,
      vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 0.35,
      r: 1, g: 0.85, b: 0.25
    });
    sparkPositions[i * 3 + 1] = -9999;
  }
  let sparkCursor = 0;

  function emitSparkBurst(wx, wy, wz, baseVx, baseVz, count, palette = 'grind') {
    for (let n = 0; n < count; n++) {
      const sp = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % SPARK_POOL_SIZE;
      sp.active = true;
      sp.x = wx + (Math.random() - 0.5) * 0.28;
      sp.y = wy + Math.random() * 0.14;
      sp.z = wz + (Math.random() - 0.5) * 0.28;
      const spread = palette === 'trick' ? 8.5 : 5.2;
      sp.vx = baseVx * -0.22 + (Math.random() - 0.5) * spread;
      sp.vy = (palette === 'trick' ? 4.5 : 2.8) + Math.random() * 6.2;
      sp.vz = baseVz * -0.22 + (Math.random() - 0.5) * spread;
      sp.maxLife = 0.22 + Math.random() * 0.26;
      sp.life = sp.maxLife;
      if (palette === 'perfect') {
        const pick = n % 3;
        sp.r = pick === 0 ? 0.0 : 1.0;
        sp.g = pick === 0 ? 0.95 : pick === 1 ? 0.88 : 0.25;
        sp.b = pick === 0 ? 1.0 : pick === 1 ? 0.26 : 0.62;
      } else if (palette === 'pickup') {
        sp.r = 0.1; sp.g = 1.0; sp.b = 0.85;
      } else {
        // Hot yellow/white/atomic-orange rail & wall sparks
        const hot = Math.random();
        sp.r = 1.0;
        sp.g = 0.52 + hot * 0.48;
        sp.b = hot > 0.72 ? 0.85 : 0.15;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. PLAYER STATE & ARCADE PHYSICS ENGINE
  // ---------------------------------------------------------------------------
  const state = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: 0,
    isGrounded: true,
    isGrinding: false,
    isDrifting: false,
    isBoosting: false,
    boostMeter: 1.0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    canAirTrickDash: true,
    driftCharge: 0,
    manualBoostTimer: 0,
    trickBoostTimer: 0,
    trickCooldownTimer: 0,
    activeTrick: null,
    activeTrickIndex: 0,
    trickTimer: 0,
    trickDuration: 0.64,
    lastTrickRating: 'FLOW',
    // Rail grind tracking
    activeRailId: null,
    railU: 0,
    railDir: 1,
    railLength: 100,
    railSnapBlend: 0,
    railCooldownId: null,
    railCooldownTimer: 0,
    // Wall & ramp cooldowns
    wallKickCooldown: 0,
    wallTilt: 0,
    lastRampId: null,
    rampCooldownTimer: 0,
    // Visual spring states
    carveLean: 0,
    crouchAmount: 0,
    reelAngle: 0,
    antennaBendX: 0,
    antennaBendZ: 0,
    // Target beacon
    targetPos: null,
    targetKind: 'pickup',
    arrowWorldYaw: 0,
    // Camera spring states
    camInitialized: false,
    camYaw: 0,
    camRoll: 0,
    camObstruction: 1.0,
    camPos: { x: 0, y: 3, z: 7 },
    camLook: { x: 0, y: 1.5, z: -8 }
  };

  let lastSpawnPoint = { x: 0, y: 0, z: 0, yaw: 0 };
  let lastWorld = null;
  let lastAudio = null;
  let prevJumpHeld = false;
  let prevTrickHeld = false;
  let prevBoostHeld = false;
  let trickCycleCursor = 0;

  // Forward unit vector in XZ from heading (local -Z is forward)
  function forwardX(h) {
    return -Math.sin(h);
  }
  function forwardZ(h) {
    return -Math.cos(h);
  }

  function syncGroupTransform() {
    group.position.set(state.x, state.y, state.z);
    group.rotation.set(0, state.heading, 0);
  }

  function endGrind(audioRef) {
    if (state.isGrinding) {
      state.isGrinding = false;
      state.activeRailId = null;
      const aud = audioRef || lastAudio;
      aud?.setGrinding?.(false, 0);
    }
  }

  function trySnapToRail(worldRef, audioRef, maxDist = PHYSICS.RAIL_SNAP_DIST) {
    if (!worldRef || typeof worldRef.findNearestRail !== 'function') return false;
    const hit = worldRef.findNearestRail({ x: state.x, y: state.y, z: state.z }, maxDist);
    if (!hit || hit.railId === undefined || hit.railId === null) return false;
    if (state.railCooldownTimer > 0 && hit.railId === state.railCooldownId) return false;

    const pt = hit.point;
    const tan = hit.tangent;
    if (!pt || !tan) return false;
    const px = finiteOr(pt.x, state.x);
    const py = finiteOr(pt.y, state.y);
    const pz = finiteOr(pt.z, state.z);

    // Avoid snapping to overhead bridge rails far above jump peak
    if (py - state.y > 2.8 || state.y - py > 3.2) return false;

    const tx = finiteOr(tan.x, 0);
    const tz = finiteOr(tan.z, -1);
    const tHoriz = Math.hypot(tx, tz) || 1;
    const ntx = tx / tHoriz;
    const ntz = tz / tHoriz;

    const fx = forwardX(state.heading);
    const fz = forwardZ(state.heading);
    const dot = fx * ntx + fz * ntz;
    const dir = dot >= 0 ? 1 : -1;

    let sampledLen = finiteOr(hit.length, 0);
    if (sampledLen <= 0 && typeof worldRef.sampleRail === 'function') {
      const s0 = worldRef.sampleRail(hit.railId, clamp(finiteOr(hit.u, 0.5), 0, 1));
      sampledLen = finiteOr(s0?.length, 0);
    }
    if (sampledLen <= 0 && hit.curve && typeof hit.curve.getLength === 'function') {
      sampledLen = finiteOr(hit.curve.getLength(), 0);
    }
    if (sampledLen <= 1) sampledLen = 80;

    state.isGrinding = true;
    state.isGrounded = false;
    state.activeRailId = hit.railId;
    state.railU = clamp(finiteOr(hit.u, 0), 0, 1);
    state.railDir = dir;
    state.railLength = sampledLen;
    state.railSnapBlend = 1.0;
    state.vy = 0;
    state.canAirTrickDash = true;
    state.speed = Math.max(state.speed, PHYSICS.GRIND_SPEED);
    state.heading = Math.atan2(-ntx * dir, -ntz * dir);
    state.x = lerp(state.x, px, 0.65);
    state.y = py + 0.08;
    state.z = lerp(state.z, pz, 0.65);
    state.vx = forwardX(state.heading) * state.speed;
    state.vz = forwardZ(state.heading) * state.speed;

    const aud = audioRef || lastAudio;
    aud?.setGrinding?.(true, clamp(state.speed / PHYSICS.BOOST_SPEED, 0.4, 1.0));
    emitSparkBurst(state.x, state.y + 0.12, state.z, state.vx, state.vz, 14, 'grind');
    return true;
  }

  function executeJump(steerInput = 0) {
    const worldRef = lastWorld;
    const audioRef = lastAudio;

    // 1. Jumping OFF an active grind rail
    if (state.isGrinding) {
      const oldRail = state.activeRailId;
      endGrind(audioRef);
      state.railCooldownId = oldRail;
      state.railCooldownTimer = 0.30;
      state.vy = PHYSICS.RAIL_JUMP_VEL_Y;
      state.isGrounded = false;
      state.canAirTrickDash = true;
      state.speed = Math.max(state.speed, PHYSICS.GRIND_SPEED);
      if (Math.abs(steerInput) > 0.1) {
        state.heading -= steerInput * 0.24;
      }
      state.vx = forwardX(state.heading) * state.speed;
      state.vz = forwardZ(state.heading) * state.speed;
      audioRef?.playJumpSfx?.();
      emitSparkBurst(state.x, state.y + 0.15, state.z, state.vx, state.vz, 12, 'grind');
      syncGroupTransform();
      return true;
    }

    // 2. Pressing Jump right next to a grind rail -> magnet snap!
    if (worldRef && trySnapToRail(worldRef, audioRef, PHYSICS.RAIL_SNAP_DIST)) {
      audioRef?.playJumpSfx?.();
      syncGroupTransform();
      return true;
    }

    // 3. Standard generous ollie / bunny-hop (grounded or coyote window)
    if (state.isGrounded || state.coyoteTimer > 0) {
      state.isGrounded = false;
      state.coyoteTimer = 0;
      state.jumpBufferTimer = 0;
      state.vy = PHYSICS.JUMP_VEL_Y;
      state.canAirTrickDash = true;
      state.crouchAmount = -0.35; // Spring extension pop
      if (state.speed < 14 && state.speed >= 0) {
        state.speed = Math.max(state.speed, 14);
      }
      state.vx = forwardX(state.heading) * state.speed;
      state.vz = forwardZ(state.heading) * state.speed;
      audioRef?.playJumpSfx?.();
      syncGroupTransform();
      return true;
    }

    // 4. Mid-air buffer right before landing
    state.jumpBufferTimer = PHYSICS.JUMP_BUFFER_TIME;
    return false;
  }

  function executeBoost() {
    const audioRef = lastAudio;
    if (state.boostMeter <= 0.04) {
      state.boostMeter = 0.18; // Generous arcade reserve pulse so button never feels dead
    }
    state.manualBoostTimer = 0.85;
    state.isBoosting = true;
    state.speed = Math.min(PHYSICS.BOOST_SPEED, Math.max(state.speed + 12.0, 46.0));
    state.vx = forwardX(state.heading) * state.speed;
    state.vz = forwardZ(state.heading) * state.speed;
    audioRef?.playBoostSfx?.();
    emitSparkBurst(state.x, state.y + 0.22, state.z, state.vx, state.vz, 10, 'perfect');
    return true;
  }

  function executeTrick() {
    if (state.trickCooldownTimer > 0) return null;

    const audioRef = lastAudio;
    const wasGrinding = state.isGrinding;
    const wasAirborne = !state.isGrounded && !wasGrinding;
    const wasDrifting = state.isDrifting;

    // If grounded & not drifting, pop a snappy street-hop into the trick so TRICK always feels responsive!
    if (state.isGrounded && !wasGrinding && !wasDrifting) {
      state.isGrounded = false;
      state.coyoteTimer = 0;
      state.vy = 11.2;
      state.canAirTrickDash = false;
    } else if (wasAirborne && state.canAirTrickDash) {
      // Double-jump / air-dash on mid-air trick!
      state.vy = Math.max(state.vy, PHYSICS.AIR_DASH_VEL_Y);
      state.canAirTrickDash = false;
    }

    // Evaluate beat quantization from Pirate Radio audio clock
    const rawEval = audioRef && typeof audioRef.evaluateBeatHit === 'function'
      ? audioRef.evaluateBeatHit()
      : null;
    const rating = rawEval?.rating === 'PERFECT' || rawEval?.rating === 'GOOD' || rawEval?.rating === 'FLOW'
      ? rawEval.rating
      : 'GOOD';
    const bonusMultiplier = Number.isFinite(rawEval?.bonusMultiplier) && rawEval.bonusMultiplier > 0
      ? rawEval.bonusMultiplier
      : (rating === 'PERFECT' ? 2.0 : rating === 'GOOD' ? 1.4 : 1.0);
    const accuracy = Number.isFinite(rawEval?.accuracy)
      ? rawEval.accuracy
      : (rating === 'PERFECT' ? 1.0 : rating === 'GOOD' ? 0.75 : 0.4);

    // Choose trick from 6-trick catalog (clean rotation through all 6 named tricks)
    const idx = trickCycleCursor % TRICK_CATALOG.length;
    trickCycleCursor = (trickCycleCursor + 1) % TRICK_CATALOG.length;
    const spec = TRICK_CATALOG[idx];

    state.activeTrick = spec.name;
    state.activeTrickIndex = idx;
    state.trickDuration = spec.duration;
    state.trickTimer = spec.duration;
    state.trickCooldownTimer = PHYSICS.TRICK_COOLDOWN;
    state.lastTrickRating = rating;

    // Speed surge + boost meter reward (on rail stays locked without falling off!)
    const speedBonus = rating === 'PERFECT' ? 10.5 : rating === 'GOOD' ? 7.0 : 4.5;
    const meterBonus = rating === 'PERFECT' ? 0.34 : rating === 'GOOD' ? 0.22 : 0.14;
    state.boostMeter = clamp(state.boostMeter + meterBonus, 0, 1);
    state.trickBoostTimer = rating === 'PERFECT' ? 0.95 : 0.55;

    const minTrickSpeed = wasGrinding ? PHYSICS.GRIND_SPEED + 4 : 36.0;
    state.speed = clamp(Math.max(state.speed + speedBonus, minTrickSpeed), 0, PHYSICS.BOOST_SPEED);
    state.vx = forwardX(state.heading) * state.speed;
    state.vz = forwardZ(state.heading) * state.speed;

    audioRef?.playTrickSfx?.(rating);
    emitSparkBurst(
      state.x,
      state.y + 0.55,
      state.z,
      state.vx,
      state.vz,
      rating === 'PERFECT' ? 22 : 12,
      rating === 'PERFECT' ? 'perfect' : 'trick'
    );

    const basePoints = spec.basePoints;
    const points = Math.round(basePoints * bonusMultiplier);
    const payload = {
      trickName: spec.name,
      rating,
      basePoints,
      points,
      bonusMultiplier,
      accuracy,
      isGrinding: wasGrinding
    };

    if (typeof api.onTrick === 'function') {
      api.onTrick(payload);
    }
    return payload;
  }

  function parseInput(raw) {
    if (!raw) {
      return { throttle: 0, brake: 0, steer: 0, jump: false, trick: false, boost: false };
    }
    const keySet = raw instanceof Set ? raw : (raw.keys instanceof Set ? raw.keys : null);
    const hasKey = (k) => Boolean(keySet && (keySet.has(k) || keySet.has(k.toLowerCase())));

    const fwd = Boolean(
      raw.forward || raw.accelerate || raw.up ||
      (typeof raw.throttle === 'number' && raw.throttle > 0.05) ||
      hasKey('KeyW') || hasKey('w') || hasKey('ArrowUp') || hasKey('arrowup')
    );
    const back = Boolean(
      raw.backward || raw.brake || raw.down || raw.reverse ||
      (typeof raw.throttle === 'number' && raw.throttle < -0.05) ||
      hasKey('KeyS') || hasKey('s') || hasKey('ArrowDown') || hasKey('arrowdown')
    );

    let steer = 0;
    if (typeof raw.steer === 'number' && Number.isFinite(raw.steer)) {
      steer = clamp(raw.steer, -1, 1);
    } else if (typeof raw.turn === 'number' && Number.isFinite(raw.turn)) {
      steer = clamp(raw.turn, -1, 1);
    }
    if (steer === 0) {
      const left = Boolean(raw.left || hasKey('KeyA') || hasKey('a') || hasKey('ArrowLeft') || hasKey('arrowleft'));
      const right = Boolean(raw.right || hasKey('KeyD') || hasKey('d') || hasKey('ArrowRight') || hasKey('arrowright'));
      steer = (right ? 1 : 0) - (left ? 1 : 0);
    }

    const throttle = typeof raw.throttle === 'number' && Number.isFinite(raw.throttle) && raw.throttle > 0
      ? clamp(raw.throttle, 0, 1)
      : (fwd ? 1 : 0);

    const jump = Boolean(
      raw.jump || raw.jumpPressed || raw.space ||
      hasKey('Space') || hasKey(' ')
    );
    const trick = Boolean(
      raw.trick || raw.trickPressed ||
      hasKey('KeyE') || hasKey('e') || hasKey('KeyJ') || hasKey('j') ||
      hasKey('KeyK') || hasKey('k') || hasKey('Enter') || hasKey('enter')
    );
    const boost = Boolean(
      raw.boost || raw.drift || raw.shift || raw.boostPressed ||
      hasKey('ShiftLeft') || hasKey('ShiftRight') || hasKey('shift')
    );

    return {
      throttle,
      brake: back ? 1 : 0,
      steer,
      jump,
      trick,
      boost
    };
  }

  function stepPhysicsSubstep(dt, ctl, world, audio) {
    // Cooldown timers
    if (state.coyoteTimer > 0) state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
    if (state.jumpBufferTimer > 0) state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
    if (state.railCooldownTimer > 0) state.railCooldownTimer = Math.max(0, state.railCooldownTimer - dt);
    if (state.wallKickCooldown > 0) state.wallKickCooldown = Math.max(0, state.wallKickCooldown - dt);
    if (state.rampCooldownTimer > 0) state.rampCooldownTimer = Math.max(0, state.rampCooldownTimer - dt);
    if (state.manualBoostTimer > 0) state.manualBoostTimer = Math.max(0, state.manualBoostTimer - dt);
    if (state.trickBoostTimer > 0) state.trickBoostTimer = Math.max(0, state.trickBoostTimer - dt);
    if (state.trickCooldownTimer > 0) state.trickCooldownTimer = Math.max(0, state.trickCooldownTimer - dt);

    // --- RAIL-GRINDING MODE ---
    if (state.isGrinding) {
      state.isDrifting = false;
      const boosting = state.manualBoostTimer > 0 || state.trickBoostTimer > 0 || (ctl.boost && state.boostMeter > 0.05);
      const targetGrindSpeed = boosting ? PHYSICS.GRIND_BOOST_SPEED : PHYSICS.GRIND_SPEED;
      state.speed = lerp(state.speed, Math.max(state.speed, targetGrindSpeed), clamp(dt * 8.0, 0, 1));
      state.boostMeter = clamp(state.boostMeter + dt * 0.16, 0, 1);

      state.railU += state.railDir * (state.speed * dt) / Math.max(1.0, state.railLength);

      if (state.railU < 0.0 || state.railU > 1.0 || !world || typeof world.sampleRail !== 'function') {
        // Reached end of rail -> clean high-speed lip launch!
        const exitedRail = state.activeRailId;
        const clampedU = clamp(state.railU, 0, 1);
        const endSample = world && typeof world.sampleRail === 'function'
          ? world.sampleRail(exitedRail, clampedU)
          : null;
        endGrind(audio);
        state.railCooldownId = exitedRail;
        state.railCooldownTimer = 0.34;
        state.isGrounded = false;
        state.canAirTrickDash = true;
        const slopeVy = endSample?.tangent ? finiteOr(endSample.tangent.y, 0) * state.railDir * state.speed : 0;
        state.vy = clamp(slopeVy + 6.8, 5.5, 18.0);
        state.vx = forwardX(state.heading) * state.speed;
        state.vz = forwardZ(state.heading) * state.speed;
      } else {
        const sample = world.sampleRail(state.activeRailId, state.railU);
        if (sample && sample.point) {
          if (Number.isFinite(sample.length) && sample.length > 1) {
            state.railLength = sample.length;
          }
          const px = finiteOr(sample.point.x, state.x);
          const py = finiteOr(sample.point.y, state.y) + 0.08;
          const pz = finiteOr(sample.point.z, state.z);
          state.railSnapBlend = Math.max(0, state.railSnapBlend - dt * 12.0);
          const snapAlpha = state.railSnapBlend > 0 ? clamp(dt * 22.0, 0.35, 1.0) : 1.0;
          state.x = lerp(state.x, px, snapAlpha);
          state.y = lerp(state.y, py, snapAlpha);
          state.z = lerp(state.z, pz, snapAlpha);

          if (sample.tangent) {
            const tx = finiteOr(sample.tangent.x, 0) * state.railDir;
            const tz = finiteOr(sample.tangent.z, -1) * state.railDir;
            if (Math.hypot(tx, tz) > 1e-4) {
              const railYaw = Math.atan2(-tx, -tz);
              state.heading = lerpAngle(state.heading, railYaw, clamp(dt * 20.0, 0, 1));
            }
          }
          state.vx = forwardX(state.heading) * state.speed;
          state.vz = forwardZ(state.heading) * state.speed;
          state.vy = 0;

          audio?.setGrinding?.(true, clamp(state.speed / PHYSICS.BOOST_SPEED, 0.4, 1.0));
          emitSparkBurst(state.x, state.y + 0.08, state.z, state.vx, state.vz, 2, 'grind');
        } else {
          endGrind(audio);
        }
      }
      return;
    }

    // --- FREE-RIDE / AIRBORNE / DRIFT MODE ---
    const driftActive = state.isGrounded && ctl.boost && Math.abs(ctl.steer) > 0.22 && state.speed > 12.0;
    if (state.isDrifting && !driftActive && state.driftCharge >= 0.32) {
      // Release drift-carve -> punchy Drift Boost!
      state.manualBoostTimer = Math.max(state.manualBoostTimer, 0.72);
      state.speed = Math.min(PHYSICS.BOOST_SPEED, Math.max(state.speed + 10.0, 46.0));
      state.boostMeter = clamp(state.boostMeter + 0.18, 0, 1);
      audio?.playBoostSfx?.();
      emitSparkBurst(state.x, state.y + 0.18, state.z, state.vx, state.vz, 12, 'perfect');
    }
    state.isDrifting = driftActive;
    if (driftActive) {
      state.driftCharge = Math.min(1.0, state.driftCharge + dt * 1.25);
      state.boostMeter = clamp(state.boostMeter + dt * 0.22, 0, 1);
    } else {
      state.driftCharge = Math.max(0, state.driftCharge - dt * 3.0);
    }

    // Boost activation (Shift while moving straight or manual/trick boost timer)
    const shiftBoost = ctl.boost && !driftActive && state.boostMeter > 0.02 && (ctl.throttle > 0 || state.speed > 6.0);
    if (shiftBoost) {
      state.boostMeter = Math.max(0, state.boostMeter - dt * 0.26);
    } else if (!ctl.boost && state.isGrounded && state.speed > 18.0) {
      // Passive trickle recharge at high flow speed
      state.boostMeter = Math.min(1.0, state.boostMeter + dt * 0.035);
    }
    state.isBoosting = shiftBoost || state.manualBoostTimer > 0 || state.trickBoostTimer > 0;

    // Turning / Carving
    let turnRate = state.isGrounded
      ? (driftActive ? PHYSICS.DRIFT_TURN_RATE : lerp(3.05, 2.15, clamp(state.speed / PHYSICS.BOOST_SPEED, 0, 1)))
      : PHYSICS.AIR_TURN_RATE;
    if (Math.abs(ctl.steer) > 0.001) {
      state.heading = wrapAngle(state.heading - ctl.steer * turnRate * dt);
    }

    // Forward acceleration & braking
    const topSpeed = state.isBoosting ? PHYSICS.BOOST_SPEED : PHYSICS.CRUISE_SPEED;
    if (state.isBoosting) {
      state.speed = Math.min(PHYSICS.BOOST_SPEED, state.speed + PHYSICS.BOOST_ACCEL * dt);
    } else if (ctl.throttle > 0) {
      // Extra snappy launch off the line (0 -> 18 m/s)
      const launchMult = state.speed < 18.0 ? 1.38 : 1.0;
      if (state.speed < topSpeed) {
        state.speed = Math.min(topSpeed, state.speed + PHYSICS.ACCEL * launchMult * ctl.throttle * dt);
      } else {
        state.speed = Math.max(topSpeed, state.speed - PHYSICS.COAST_DECEL * 1.5 * dt);
      }
    } else if (ctl.brake > 0) {
      state.speed = Math.max(PHYSICS.REVERSE_MAX, state.speed - PHYSICS.BRAKE_DECEL * dt);
    } else {
      const decel = state.isGrounded ? PHYSICS.COAST_DECEL : PHYSICS.AIR_DRAG;
      if (state.speed > 0) {
        state.speed = Math.max(0, state.speed - decel * dt);
      } else if (state.speed < 0) {
        state.speed = Math.min(0, state.speed + PHYSICS.BRAKE_DECEL * 0.5 * dt);
      }
    }

    // Align horizontal velocity with heading (slight stylish slip during drift-carve)
    const desiredVx = forwardX(state.heading) * state.speed;
    const desiredVz = forwardZ(state.heading) * state.speed;
    const grip = state.isGrounded ? (driftActive ? 5.2 : 14.0) : 6.5;
    const blend = clamp(grip * dt, 0, 1);
    state.vx = lerp(state.vx, desiredVx, blend);
    state.vz = lerp(state.vz, desiredVz, blend);

    // Integrate horizontal motion
    state.x += state.vx * dt;
    state.z += state.vz * dt;

    // Building collision + Wall-Ride / Bounce deflection
    if (world && typeof world.resolveHorizontalCollision === 'function') {
      const posObj = { x: state.x, y: state.y, z: state.z };
      const col = world.resolveHorizontalCollision(posObj, PHYSICS.COLLISION_RADIUS, state.y);
      if (Number.isFinite(posObj.x) && Number.isFinite(posObj.z)) {
        state.x = posObj.x;
        state.z = posObj.z;
      }
      if (col && col.hit) {
        let nx = finiteOr(col.normalX, 0);
        let nz = finiteOr(col.normalZ, 0);
        const nLen = Math.hypot(nx, nz);
        if (nLen > 1e-4) {
          nx /= nLen;
          nz /= nLen;
        } else {
          nx = -forwardX(state.heading);
          nz = -forwardZ(state.heading);
        }

        const vn = state.vx * nx + state.vz * nz;
        if (!state.isGrounded && Math.abs(state.speed) > 9.0) {
          // Airborne Wall-Ride / Wall-Kick Deflection!
          if (vn < 0) {
            state.vx -= 1.62 * vn * nx;
            state.vz -= 1.62 * vn * nz;
          } else {
            state.vx += nx * 8.0;
            state.vz += nz * 8.0;
          }
          const newHoriz = Math.hypot(state.vx, state.vz);
          state.speed = clamp(Math.max(newHoriz, state.speed * 0.88, 26.0), 0, PHYSICS.BOOST_SPEED);
          if (newHoriz > 1e-3) {
            state.heading = Math.atan2(-state.vx, -state.vz);
            state.vx = forwardX(state.heading) * state.speed;
            state.vz = forwardZ(state.heading) * state.speed;
          }
          if (state.wallKickCooldown <= 0) {
            state.vy = Math.max(state.vy, PHYSICS.WALL_KICK_VEL_Y);
            state.wallKickCooldown = 0.28;
            state.canAirTrickDash = true;
            audio?.playJumpSfx?.();
          }
          const crossSide = forwardX(state.heading) * nz - forwardZ(state.heading) * nx;
          state.wallTilt = (crossSide >= 0 ? 1 : -1) * 0.35;
          emitSparkBurst(state.x, state.y + 0.6, state.z, state.vx, state.vz, 10, 'grind');
        } else if (vn < 0) {
          // Smooth grounded wall slide along street facade
          state.vx -= 1.08 * vn * nx;
          state.vz -= 1.08 * vn * nz;
          const slideSpeed = Math.hypot(state.vx, state.vz);
          state.speed = slideSpeed * 0.94;
          if (slideSpeed > 2.0) {
            const slideYaw = Math.atan2(-state.vx, -state.vz);
            state.heading = lerpAngle(state.heading, slideYaw, clamp(dt * 10.0, 0, 1));
          }
          if (slideSpeed > 14.0) {
            emitSparkBurst(state.x, state.y + 0.35, state.z, state.vx, state.vz, 2, 'grind');
          }
        }
      }
    }

    // Vertical gravity & ground / rooftop contact
    const groundY = world && typeof world.getGroundHeight === 'function'
      ? finiteOr(world.getGroundHeight(state.x, state.z, state.y), 0)
      : 0;

    if (state.isGrounded) {
      if (state.y - groundY > 0.65) {
        // Rode off a rooftop or overpass ledge!
        state.isGrounded = false;
        state.coyoteTimer = PHYSICS.COYOTE_TIME;
      } else {
        state.y = groundY;
        state.vy = 0;
      }
    }

    if (!state.isGrounded) {
      state.vy -= PHYSICS.GRAVITY * dt;
      state.y += state.vy * dt;

      // Magnet rail-snap when airborne & descending/cresting near a spline rail!
      if (state.vy <= 11.5 && trySnapToRail(world, audio, PHYSICS.RAIL_SNAP_DIST)) {
        return;
      }

      // Check landing on street or rooftop
      const postGroundY = world && typeof world.getGroundHeight === 'function'
        ? finiteOr(world.getGroundHeight(state.x, state.z, state.y), groundY)
        : groundY;

      if (state.y <= postGroundY && state.vy <= 0) {
        state.y = postGroundY;
        state.vy = 0;
        state.isGrounded = true;
        state.canAirTrickDash = true;
        state.crouchAmount = 0.28; // Absorb landing compression!

        // Buffered jump triggers immediately on touchdown
        if (state.jumpBufferTimer > 0) {
          state.jumpBufferTimer = 0;
          executeJump(ctl.steer);
          return;
        }
      }
    }

    // Check Atomic-Orange Kicker Ramps
    if (world && typeof world.checkRampTrigger === 'function') {
      const ramp = world.checkRampTrigger({ x: state.x, y: state.y, z: state.z });
      if (ramp && (ramp.id !== state.lastRampId || state.rampCooldownTimer <= 0)) {
        state.lastRampId = ramp.id ?? 'ramp';
        state.rampCooldownTimer = 0.38;
        state.isGrounded = false;
        state.coyoteTimer = 0;
        state.canAirTrickDash = true;
        state.vy = Math.max(state.vy, finiteOr(ramp.boostVelY, 20.5));
        const fwdBoost = finiteOr(ramp.forwardBoost, 12.0);
        state.speed = clamp(Math.max(state.speed + fwdBoost, 46.0), 0, PHYSICS.BOOST_SPEED);
        state.boostMeter = clamp(state.boostMeter + 0.25, 0, 1);
        state.vx = forwardX(state.heading) * state.speed;
        state.vz = forwardZ(state.heading) * state.speed;
        audio?.playBoostSfx?.();
        emitSparkBurst(state.x, state.y + 0.25, state.z, state.vx, state.vz, 16, 'perfect');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. PROCEDURAL ANIMATION, RIBBONS, SPARKS & CRAZY-TAXI ARROW UPDATE
  // ---------------------------------------------------------------------------
  function updateVisuals(dt, elapsed, ctl, beatPhase, world) {
    worldFxGroup.visible = group.visible;

    const speedNorm = clamp(Math.abs(state.speed) / PHYSICS.CRUISE_SPEED, 0, 1.45);
    const beatPulse = Math.pow(Math.max(0, 1.0 - finiteOr(beatPhase, 0)), 2.2);

    // Cassette deck reels spin with forward speed
    state.reelAngle = (state.reelAngle + state.speed * dt * 0.45) % (Math.PI * 2);
    for (const reel of cassetteReels) {
      reel.rotation.y = state.reelAngle;
    }

    // Carve & wall-ride lean spring
    state.wallTilt *= Math.exp(-7.0 * dt);
    const targetLean = -ctl.steer * (state.isDrifting ? 0.50 : 0.34) * clamp(speedNorm + 0.25, 0.3, 1.15) + state.wallTilt;
    state.carveLean = lerp(state.carveLean, state.isGrinding ? -ctl.steer * 0.16 : targetLean, clamp(dt * 11.0, 0, 1));

    // Crouch / landing spring
    const targetCrouch = ctl.jump && state.isGrounded ? 0.22 : (state.isDrifting ? 0.24 : 0.0);
    state.crouchAmount = lerp(state.crouchAmount, targetCrouch, clamp(dt * 12.0, 0, 1));

    const hoverBob = state.isGrounded
      ? Math.sin(elapsed * 7.5) * 0.028 + beatPulse * 0.016
      : 0;

    // Reset trick transforms before applying active trick pose
    let trickSpinY = 0;
    let trickRollZ = 0;
    let trickPitchX = 0;
    let boardFlipZ = 0;
    let boardSpinY = 0;
    let methodGrab = 0;
    let handplant = 0;

    if (state.trickTimer > 0) {
      state.trickTimer = Math.max(0, state.trickTimer - dt);
      const p = clamp(1.0 - state.trickTimer / Math.max(0.01, state.trickDuration), 0, 1);
      const arc = Math.sin(p * Math.PI);

      switch (state.activeTrickIndex) {
        case 0: // CASSETTE FLIP
          boardFlipZ = p * Math.PI * 2;
          trickPitchX = arc * 0.18;
          break;
        case 1: // 360 PIRATE SPIN
          trickSpinY = p * Math.PI * 2;
          boardFlipZ = arc * 0.35;
          break;
        case 2: // FM METHOD GRAB
          methodGrab = arc;
          trickPitchX = arc * 0.34;
          trickSpinY = Math.sin(p * Math.PI * 2) * 0.35;
          break;
        case 3: // SIGNAL OVERDRIVE
          trickRollZ = p * Math.PI * 2;
          trickPitchX = -arc * 0.24;
          break;
        case 4: // SUBWOOFER SHUVIT
          boardSpinY = p * Math.PI * 4;
          trickSpinY = -arc * 0.25;
          break;
        case 5: // ANTENNA HANDPLANT
          handplant = arc;
          trickRollZ = arc * 2.45;
          break;
      }

      if (state.trickTimer <= 0) {
        state.activeTrick = null;
      }
    }

    // Apply visualRoot & boardRig poses
    const grindBoardYaw = state.isGrinding ? 0.36 : (state.isDrifting ? -ctl.steer * 0.28 : 0);
    const airPitch = !state.isGrounded && !state.isGrinding
      ? clamp(state.vy * 0.022, -0.34, 0.34)
      : 0;

    visualRoot.position.set(0, 0.24 + hoverBob + (handplant * 0.36), 0);
    visualRoot.rotation.set(
      airPitch + trickPitchX,
      grindBoardYaw + trickSpinY,
      state.carveLean + trickRollZ
    );

    boardRig.rotation.set(
      methodGrab * 0.32,
      boardSpinY,
      boardFlipZ + methodGrab * 0.45
    );
    boardRig.position.set(0, methodGrab * 0.16, 0);

    // Courier body articulation (crouch, grind balance arms, grab, handplant)
    const kneeFlex = clamp(0.18 + state.crouchAmount * 0.95 + methodGrab * 0.85 - handplant * 0.35, 0.04, 1.35);
    hipsRig.position.set(0, 0.72 - kneeFlex * 0.19, 0.02);
    hipsRig.rotation.y = STANCE_YAW - ctl.steer * 0.14;

    frontLeg.hipJoint.rotation.x = -kneeFlex * 0.62 + handplant * 0.55;
    frontLeg.kneeJoint.rotation.x = kneeFlex * 1.15;
    frontLeg.ankleJoint.rotation.x = -kneeFlex * 0.50;

    backLeg.hipJoint.rotation.x = -kneeFlex * 0.52 - handplant * 0.65;
    backLeg.kneeJoint.rotation.x = kneeFlex * 1.05;
    backLeg.ankleJoint.rotation.x = -kneeFlex * 0.48;

    torsoRig.rotation.x = 0.12 + speedNorm * 0.14 + state.crouchAmount * 0.30 - methodGrab * 0.42;
    torsoRig.rotation.z = -state.carveLean * 0.32;

    if (handplant > 0.05) {
      // Plant left glove down toward hoverboard deck while flinging right arm skyward
      leftArm.shoulderJoint.rotation.set(0.15, 0, -2.75 * handplant);
      leftArm.elbowJoint.rotation.set(-0.15, 0, 0);
      rightArm.shoulderJoint.rotation.set(-0.2, 0, 2.2 * handplant);
      rightArm.elbowJoint.rotation.set(-0.35, 0, 0);
    } else if (methodGrab > 0.05) {
      // Reach front hand down to grab cassette hoverboard nose rail
      leftArm.shoulderJoint.rotation.set(-1.15 * methodGrab, 0.25, -0.35);
      leftArm.elbowJoint.rotation.set(-0.55 * methodGrab, 0, 0);
      rightArm.shoulderJoint.rotation.set(0.45, 0, 1.15 * methodGrab);
      rightArm.elbowJoint.rotation.set(-0.45, 0, 0);
    } else if (state.isGrinding) {
      // Wide expressive rail-balance surfer arms!
      const wave = Math.sin(elapsed * 9.0) * 0.14;
      leftArm.shoulderJoint.rotation.set(-0.15 + wave, 0.1, -1.22);
      leftArm.elbowJoint.rotation.set(-0.32, 0, 0);
      rightArm.shoulderJoint.rotation.set(0.18 - wave, -0.1, 1.24);
      rightArm.elbowJoint.rotation.set(-0.36, 0, 0);
    } else {
      // Street skater cruise pump
      const pump = Math.sin(elapsed * 6.5) * 0.12 * clamp(speedNorm, 0.2, 1.0);
      leftArm.shoulderJoint.rotation.set(-0.28 + pump, 0.12, -0.52 - Math.abs(state.carveLean) * 0.5);
      leftArm.elbowJoint.rotation.set(-0.62, 0, 0);
      rightArm.shoulderJoint.rotation.set(0.26 - pump, -0.12, 0.56 + Math.abs(state.carveLean) * 0.5);
      rightArm.elbowJoint.rotation.set(-0.68, 0, 0);
    }

    // Head beat nod + look into turns
    headRig.rotation.y = -STANCE_YAW * 0.92 - ctl.steer * 0.28;
    headRig.rotation.x = beatPulse * 0.09 - 0.04;

    // 4-Link Whipping Pirate Radio Antenna physics
    const targetAntX = clamp(speedNorm * 0.26 + state.vy * -0.015, -0.35, 0.48);
    const targetAntZ = clamp(ctl.steer * 0.34 + Math.sin(elapsed * 14.0) * 0.06 * speedNorm, -0.5, 0.5);
    state.antennaBendX = lerp(state.antennaBendX, targetAntX, clamp(dt * 9.0, 0, 1));
    state.antennaBendZ = lerp(state.antennaBendZ, targetAntZ, clamp(dt * 9.0, 0, 1));
    for (let s = 0; s < antennaSegs.length; s++) {
      antennaSegs[s].rotation.x = state.antennaBendX * (0.65 + s * 0.25);
      antennaSegs[s].rotation.z = (s === 0 ? -0.14 : 0) + state.antennaBendZ * (0.55 + s * 0.25);
    }

    // Messenger bag cassette bounce
    const bagJiggle = Math.abs(state.vy) * 0.008 + beatPulse * 0.04;
    bagRig.rotation.z = -0.18 - bagJiggle;

    // Thruster flames, headphone EQ rings & dynamic neon palette shift
    const flameScale = state.isBoosting ? 1.85 : state.isGrinding ? 1.45 : (0.55 + speedNorm * 0.75);
    for (const p of thrusterPlumes) {
      const flicker = 0.90 + Math.sin(elapsed * 42.0) * 0.14;
      p.scale.set(1.0 + (flameScale - 1.0) * 0.25, 1.0 + (flameScale - 1.0) * 0.25, flameScale * flicker);
    }
    for (const r of repulsorRings) {
      r.scale.setScalar(0.92 + beatPulse * 0.16);
    }

    const activeHex = state.trickTimer > 0 && state.lastTrickRating === 'PERFECT'
      ? 0xff2a85
      : state.isBoosting
        ? 0xff6b1a
        : state.isGrinding
          ? 0xffe042
          : 0x00f0ff;
    mats.thrusterPlume.color.setHex(activeHex);
    mats.boardRailGlow.color.setHex(state.isGrinding ? 0xffe042 : 0x00f0ff);
    mats.headphoneEqGlow.color.setHex(beatPulse > 0.45 ? 0xffe042 : 0x00f0ff);
    if (underglowLight) {
      underglowLight.color.setHex(activeHex);
      underglowLight.intensity = (state.isBoosting || state.isGrinding ? 3.2 : 2.1) + beatPulse * 0.6;
    }

    // Ground contact shadow/projection ring directly under rider
    const dropGroundY = world && typeof world.getGroundHeight === 'function'
      ? finiteOr(world.getGroundHeight(state.x, state.z, state.y), 0)
      : 0;
    const heightAboveGround = Math.max(0, state.y - dropGroundY);
    groundShadowRing.position.set(state.x, dropGroundY + 0.04, state.z);
    const ringScale = clamp(1.0 - heightAboveGround * 0.04, 0.45, 1.05);
    groundShadowRing.scale.set(ringScale, 1, ringScale);
    groundShadowRing.material.color.setHex(activeHex);

    // Update Twin Neon Wake Ribbons
    const rx = Math.cos(state.heading);
    const rz = -Math.sin(state.heading);
    const bx = -forwardX(state.heading) * 0.84;
    const bz = -forwardZ(state.heading) * 0.84;
    tmpTrailColor.setHex(activeHex);

    for (const rib of [leftRibbon, rightRibbon]) {
      const sideOff = rib === leftRibbon ? -0.15 : 0.15;
      const hx = state.x + bx + rx * sideOff;
      const hy = state.y + 0.22 + hoverBob;
      const hz = state.z + bz + rz * sideOff;

      const hist = rib.history;
      const headDist = Math.hypot(hx - hist[0].x, hy - hist[0].y, hz - hist[0].z);
      if (headDist > 0.22) {
        for (let i = TRAIL_SLICES - 1; i > 0; i--) {
          hist[i].x = hist[i - 1].x;
          hist[i].y = hist[i - 1].y;
          hist[i].z = hist[i - 1].z;
          hist[i].rx = hist[i - 1].rx;
          hist[i].rz = hist[i - 1].rz;
        }
      }
      hist[0].x = hx;
      hist[0].y = hy;
      hist[0].z = hz;
      hist[0].rx = rx;
      hist[0].rz = rz;

      const baseHalfW = state.isBoosting ? 0.105 : 0.068;
      for (let i = 0; i < TRAIL_SLICES; i++) {
        const fade = Math.pow(1.0 - i / (TRAIL_SLICES - 1), 1.45) * clamp(speedNorm, 0.05, 1.0);
        const w = baseHalfW * fade;
        const pNode = hist[i];
        const vi = i * 6;
        rib.positions[vi] = pNode.x - pNode.rx * w;
        rib.positions[vi + 1] = pNode.y;
        rib.positions[vi + 2] = pNode.z - pNode.rz * w;
        rib.positions[vi + 3] = pNode.x + pNode.rx * w;
        rib.positions[vi + 4] = pNode.y;
        rib.positions[vi + 5] = pNode.z + pNode.rz * w;

        rib.colors[vi] = tmpTrailColor.r * fade;
        rib.colors[vi + 1] = tmpTrailColor.g * fade;
        rib.colors[vi + 2] = tmpTrailColor.b * fade;
        rib.colors[vi + 3] = tmpTrailColor.r * fade;
        rib.colors[vi + 4] = tmpTrailColor.g * fade;
        rib.colors[vi + 5] = tmpTrailColor.b * fade;
      }
      rib.posAttr.needsUpdate = true;
      rib.colAttr.needsUpdate = true;
    }

    // Update Pooled Spark Particles
    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      const sp = sparks[i];
      const pi = i * 3;
      if (!sp.active) {
        sparkPositions[pi + 1] = -9999;
        continue;
      }
      sp.life -= dt;
      if (sp.life <= 0) {
        sp.active = false;
        sparkPositions[pi + 1] = -9999;
        continue;
      }
      sp.vy -= 22.0 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;
      if (sp.y < dropGroundY + 0.05 && sp.vy < 0) {
        sp.y = dropGroundY + 0.05;
        sp.vy *= -0.45;
      }
      const alpha = clamp(sp.life / sp.maxLife, 0, 1);
      sparkPositions[pi] = sp.x;
      sparkPositions[pi + 1] = sp.y;
      sparkPositions[pi + 2] = sp.z;
      sparkColors[pi] = sp.r * alpha;
      sparkColors[pi + 1] = sp.g * alpha;
      sparkColors[pi + 2] = sp.b * alpha;
    }
    sparkPosAttr.needsUpdate = true;
    sparkColAttr.needsUpdate = true;

    // Update Overhead Crazy-Taxi 3D Navigation Arrow
    if (state.targetPos) {
      arrowAnchor.visible = true;
      const dx = state.targetPos.x - state.x;
      const dy = state.targetPos.y - (state.y + 3.4);
      const dz = state.targetPos.z - state.z;
      const horizDist = Math.hypot(dx, dz);

      const desiredWorldYaw = horizDist > 0.25 ? Math.atan2(-dx, -dz) : state.heading;
      state.arrowWorldYaw = lerpAngle(state.arrowWorldYaw, desiredWorldYaw, clamp(dt * 12.0, 0, 1));

      // Convert world yaw to local group yaw (since arrowAnchor is inside `group`)
      const localArrowYaw = shortestAngleDiff(state.heading, state.arrowWorldYaw);
      const closeTilt = horizDist < 24.0 ? -0.42 * (1.0 - horizDist / 24.0) : clamp(Math.atan2(dy, Math.max(horizDist, 8.0)) * 0.45, -0.35, 0.35);

      const isDropoff = state.targetKind === 'dropoff' || state.targetKind === 'delivery';
      const pulseRate = isDropoff ? 11.0 : 6.5;
      const urgentPulse = 0.5 + 0.5 * Math.sin(elapsed * pulseRate);
      const scaleBump = 1.0 + urgentPulse * (isDropoff ? 0.14 : 0.09) + beatPulse * 0.06;

      arrowAnchor.position.set(0, 3.4 + Math.sin(elapsed * 5.2) * 0.11, 0);
      arrowSpinGroup.rotation.set(closeTilt, localArrowYaw, 0);
      arrowSpinGroup.scale.setScalar(scaleBump);

      if (isDropoff) {
        arrowCoreMat.color.setHex(urgentPulse > 0.55 ? 0xffe042 : 0xff6b1a);
        arrowRimMat.color.setHex(0xff2a85);
      } else {
        arrowCoreMat.color.setHex(urgentPulse > 0.55 ? 0x00f0ff : 0x1aff9c);
        arrowRimMat.color.setHex(0x00f0ff);
      }
    } else {
      arrowAnchor.visible = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 7. PUBLIC API METHODS
  // ---------------------------------------------------------------------------
  function reset(spawnPoint) {
    if (spawnPoint && typeof spawnPoint === 'object') {
      lastSpawnPoint = {
        x: finiteOr(spawnPoint.x, 0),
        y: finiteOr(spawnPoint.y, 0),
        z: finiteOr(spawnPoint.z, 0),
        yaw: finiteOr(spawnPoint.yaw, 0)
      };
    }
    endGrind(lastAudio);
    state.x = lastSpawnPoint.x;
    state.y = lastSpawnPoint.y;
    state.z = lastSpawnPoint.z;
    state.heading = wrapAngle(lastSpawnPoint.yaw);
    state.vx = 0;
    state.vy = 0;
    state.vz = 0;
    state.speed = 0;
    state.isGrounded = true;
    state.isGrinding = false;
    state.isDrifting = false;
    state.isBoosting = false;
    state.boostMeter = 1.0;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
    state.canAirTrickDash = true;
    state.driftCharge = 0;
    state.manualBoostTimer = 0;
    state.trickBoostTimer = 0;
    state.trickCooldownTimer = 0;
    state.activeTrick = null;
    state.trickTimer = 0;
    state.railCooldownId = null;
    state.railCooldownTimer = 0;
    state.wallKickCooldown = 0;
    state.wallTilt = 0;
    state.lastRampId = null;
    state.rampCooldownTimer = 0;
    state.carveLean = 0;
    state.crouchAmount = 0;
    state.camInitialized = false;
    state.camYaw = state.heading;
    state.camRoll = 0;
    state.camObstruction = 1.0;

    prevJumpHeld = false;
    prevTrickHeld = false;
    prevBoostHeld = false;

    for (let i = 0; i < SPARK_POOL_SIZE; i++) {
      sparks[i].active = false;
      sparkPositions[i * 3 + 1] = -9999;
    }
    sparkPosAttr.needsUpdate = true;

    resetRibbons(state.x, state.y, state.z, state.heading);
    syncGroupTransform();
  }

  function setTargetPosition(targetVec3OrNull, kind = 'pickup') {
    if (!targetVec3OrNull) {
      state.targetPos = null;
      arrowAnchor.visible = false;
      return;
    }
    if (Array.isArray(targetVec3OrNull)) {
      state.targetPos = {
        x: finiteOr(targetVec3OrNull[0], 0),
        y: finiteOr(targetVec3OrNull[1], 0),
        z: finiteOr(targetVec3OrNull[2], 0)
      };
    } else {
      state.targetPos = {
        x: finiteOr(targetVec3OrNull.x, 0),
        y: finiteOr(targetVec3OrNull.y, 0),
        z: finiteOr(targetVec3OrNull.z, 0)
      };
    }
    state.targetKind = kind || 'pickup';
    arrowAnchor.visible = true;
  }

  function getState() {
    return {
      position: { x: state.x, y: state.y, z: state.z },
      speed: Math.abs(state.speed),
      speedMph: Math.round(Math.abs(state.speed) * 2.23694),
      heading: state.heading,
      isGrounded: state.isGrounded,
      isGrinding: state.isGrinding,
      activeTrick: state.activeTrick,
      boostMeter: state.boostMeter,
      isDrifting: state.isDrifting,
      isBoosting: state.isBoosting
    };
  }

  function update({ dt, elapsed = 0, input = null, world = null, audio = null, beatPhase = 0 } = {}) {
    if (world) lastWorld = world;
    if (audio) lastAudio = audio;

    const safeDt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 1 / 60;
    const safeElapsed = finiteOr(elapsed, 0);
    const ctl = parseInput(input);

    // Rising-edge actions from held input object
    const jumpEdge = ctl.jump && !prevJumpHeld;
    const trickEdge = ctl.trick && !prevTrickHeld;
    const boostEdge = ctl.boost && !prevBoostHeld;
    prevJumpHeld = ctl.jump;
    prevTrickHeld = ctl.trick;
    prevBoostHeld = ctl.boost;

    if (jumpEdge) {
      executeJump(ctl.steer);
    }
    if (boostEdge && Math.abs(ctl.steer) <= 0.22 && state.boostMeter > 0.08) {
      audio?.playBoostSfx?.();
    }
    if (trickEdge) {
      executeTrick();
    }

    // Substep physics if frame dt > 40ms so rail & wall collisions never tunnel
    if (safeDt > 0) {
      const steps = safeDt > 0.042 ? 2 : 1;
      const subDt = safeDt / steps;
      for (let s = 0; s < steps; s++) {
        stepPhysicsSubstep(subDt, ctl, world, audio);
      }
    }

    // Collect Signal Boost Mini-Tapes along streets & rails
    if (world && typeof world.collectBoostPickups === 'function') {
      const collected = world.collectBoostPickups({ x: state.x, y: state.y, z: state.z }, PHYSICS.PICKUP_RADIUS);
      if (Number.isFinite(collected) && collected > 0) {
        state.boostMeter = clamp(state.boostMeter + collected * 0.25, 0, 1);
        state.speed = clamp(Math.max(state.speed + collected * 4.0, 40.0), 0, PHYSICS.BOOST_SPEED);
        state.vx = forwardX(state.heading) * state.speed;
        state.vz = forwardZ(state.heading) * state.speed;
        emitSparkBurst(state.x, state.y + 0.65, state.z, state.vx, state.vz, 12, 'pickup');
        if (typeof api.onPickupCollected === 'function') {
          api.onPickupCollected(collected);
        }
      }
    }

    syncGroupTransform();
    updateVisuals(safeDt, safeElapsed, ctl, beatPhase, world);
  }

  function updateCamera(camera, dt) {
    if (!camera) return;
    const safeDt = Number.isFinite(dt) ? clamp(dt, 0.001, 0.1) : 1 / 60;

    if (!state.camInitialized) {
      state.camYaw = state.heading;
      const backX = -forwardX(state.camYaw);
      const backZ = -forwardZ(state.camYaw);
      state.camPos.x = state.x + backX * 6.8;
      state.camPos.y = state.y + 2.75;
      state.camPos.z = state.z + backZ * 6.8;
      state.camLook.x = state.x + forwardX(state.camYaw) * 8.5;
      state.camLook.y = state.y + 1.62;
      state.camLook.z = state.z + forwardZ(state.camYaw) * 8.5;
      state.camInitialized = true;
    }

    // Smooth spring yaw behind rider
    const yawStiffness = state.isGrinding ? 11.5 : 8.8;
    state.camYaw = lerpAngle(state.camYaw, state.heading, 1.0 - Math.exp(-yawStiffness * safeDt));

    const speedRatio = clamp(Math.abs(state.speed) / PHYSICS.BOOST_SPEED, 0, 1);
    const highEnergy = state.isBoosting || state.isGrinding || state.trickBoostTimer > 0;
    const baseDist = lerp(6.5, 7.6, speedRatio) - (highEnergy ? 0.25 : 0);
    const baseHeight = 2.72 + (!state.isGrounded && !state.isGrinding ? 0.35 : 0);

    const backX = -forwardX(state.camYaw);
    const backZ = -forwardZ(state.camYaw);

    // Building & rooftop obstruction pull-in probe
    let allowedFrac = 1.0;
    if (lastWorld && typeof lastWorld.resolveHorizontalCollision === 'function') {
      const samples = [0.38, 0.62, 0.84, 1.0];
      for (const f of samples) {
        const px = state.x + backX * (baseDist * f);
        const py = state.y + lerp(1.55, baseHeight, f);
        const pz = state.z + backZ * (baseDist * f);
        const probe = { x: px, y: py, z: pz };
        const col = lastWorld.resolveHorizontalCollision(probe, 0.55, py);
        if (col && col.hit) {
          allowedFrac = Math.max(0.32, f - 0.16);
          break;
        }
      }
    }
    const obsRate = allowedFrac < state.camObstruction ? 18.0 : 5.5;
    state.camObstruction = lerp(state.camObstruction, allowedFrac, 1.0 - Math.exp(-obsRate * safeDt));

    const effDist = baseDist * state.camObstruction;
    const pullLift = (1.0 - state.camObstruction) * 0.95;
    let idealCamX = state.x + backX * effDist;
    let idealCamY = state.y + baseHeight + pullLift;
    let idealCamZ = state.z + backZ * effDist;

    if (lastWorld && typeof lastWorld.getGroundHeight === 'function') {
      const camGround = finiteOr(lastWorld.getGroundHeight(idealCamX, idealCamZ, idealCamY), 0);
      if (idealCamY < camGround + 1.05) {
        idealCamY = camGround + 1.05;
      }
    }

    const posDamp = 1.0 - Math.exp(-13.5 * safeDt);
    state.camPos.x = lerp(state.camPos.x, idealCamX, posDamp);
    state.camPos.y = lerp(state.camPos.y, idealCamY, posDamp);
    state.camPos.z = lerp(state.camPos.z, idealCamZ, posDamp);

    const lookAhead = lerp(7.5, 11.5, speedRatio);
    const idealLookX = state.x + forwardX(state.heading) * lookAhead;
    const idealLookY = state.y + 1.62;
    const idealLookZ = state.z + forwardZ(state.heading) * lookAhead;

    const lookDamp = 1.0 - Math.exp(-16.0 * safeDt);
    state.camLook.x = lerp(state.camLook.x, idealLookX, lookDamp);
    state.camLook.y = lerp(state.camLook.y, idealLookY, lookDamp);
    state.camLook.z = lerp(state.camLook.z, idealLookZ, lookDamp);

    camera.position?.set?.(state.camPos.x, state.camPos.y, state.camPos.z);

    // Subtle arcade banking on sharp carves & rail grinds
    const desiredRoll = clamp(
      state.carveLean * 0.14 + (state.isGrinding ? Math.sin(state.railU * Math.PI * 2) * 0.035 : 0),
      -0.085,
      0.085
    );
    state.camRoll = lerp(state.camRoll, desiredRoll, 1.0 - Math.exp(-9.0 * safeDt));
    camera.up?.set?.(-Math.sin(state.camRoll), Math.cos(state.camRoll), 0);
    camera.lookAt?.(state.camLook.x, state.camLook.y, state.camLook.z);

    // Speed-based FOV kick (62° -> 78° on boost/grind)
    if (typeof camera.fov === 'number') {
      const targetFov = highEnergy
        ? lerp(73.0, 78.0, speedRatio)
        : lerp(62.0, 72.5, clamp(Math.abs(state.speed) / PHYSICS.CRUISE_SPEED, 0, 1));
      const nextFov = lerp(camera.fov, targetFov, 1.0 - Math.exp(-7.5 * safeDt));
      if (Math.abs(nextFov - camera.fov) > 0.01) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix?.();
      }
    }
  }

  // Initialize ribbons & transform cleanly at origin
  reset(lastSpawnPoint);

  const api = {
    group,
    reset,
    setTargetPosition,
    triggerTrick: () => executeTrick(),
    triggerJump: () => executeJump(0),
    triggerBoost: () => executeBoost(),
    getState,
    onTrick: null,
    onPickupCollected: null,
    update,
    updateCamera
  };

  return api;
}
