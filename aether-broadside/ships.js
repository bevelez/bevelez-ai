// Tape No. 08: Aether Broadside — 3D Stormy Cloud-Sea Arena, Sculpted 1889
// Flying Dutchman Galleon (5 Interactive Subsystems), Live Isometric X-Ray CAD
// Damage-Control Schematic Mode, Enemy Fleet, Ordnance & Volumetric VFX.

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteOr(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function wrapAngle(a) {
  let r = finiteOr(a, 0) % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function lerpAngle(from, to, t) {
  const diff = wrapAngle(to - from);
  return from + diff * clamp(t, 0, 1);
}

function makeRng(seed = 18890808) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SUBSYSTEM_IDS = Object.freeze([
  'boiler',
  'sponsons',
  'gunDeck',
  'rigging',
  'propulsor',
]);

// Palette tokens honoring flying-dutchman.html (1889 Admiralty Technical Plate)
const PALETTE = Object.freeze({
  mode3d: {
    bg: 0x121b2b,
    fog: 0x182438,
    fogDensity: 0.00135,
    mahogany: 0x522818,
    mahoganyDark: 0x2c150d,
    oakDeck: 0x8b6946,
    brass: 0xdba33c,
    brassBright: 0xf4c867,
    bronze: 0x8f6726,
    iron: 0x262c35,
    ironDark: 0x171b22,
    sailCanvas: 0xf0e6d1,
    enemySail: 0x3b2d32,
    crimsonTrim: 0x8f2429,
    aether: 0x38d9a9,
    aetherHot: 0x8cfce0,
    amber: 0xffb347,
    alertRed: 0xff6b6b,
    schematicBlue: 0x6b9bff,
  },
  cadDark: {
    page: 0x0b0b0b,
    gridMinor: 0x1d1d20,
    gridMajor: 0x34343a,
    hullFill: 0x18181b,
    hullOpacity: 0.14,
    hullEdge: 0x6a6a70,
    rockFill: 0x141416,
    rockEdge: 0x45454b,
    healthyEdge: 0x38d9a9,
    healthyFill: 0x102e25,
    warnEdge: 0xffb347,
    warnFill: 0x38260e,
    critEdge: 0xff6b6b,
    critFill: 0x3f1317,
    repairBlue: 0x6b9bff,
    enemyEdge: 0xff6b6b,
    enemyFill: 0x2b1215,
    windLine: 0x6b9bff,
  },
  cadLight: {
    page: 0xf2f2ef,
    gridMinor: 0xdcdcd7,
    gridMajor: 0xb0b0b6,
    hullFill: 0xffffff,
    hullOpacity: 0.24,
    hullEdge: 0x76767d,
    rockFill: 0xe6e6e2,
    rockEdge: 0x8d8d94,
    healthyEdge: 0x0ca678,
    healthyFill: 0xcff2e3,
    warnEdge: 0xd97706,
    warnFill: 0xfde7bc,
    critEdge: 0xe5484d,
    critFill: 0xfcd5d8,
    repairBlue: 0x3e63dd,
    enemyEdge: 0xe5484d,
    enemyFill: 0xf9d6d9,
    windLine: 0x3e63dd,
  },
});

const DEFAULT_OBSTACLES = Object.freeze([
  { id: 'rock-0', x: -145, z: -135, radius: 24, height: 34 },
  { id: 'rock-1', x: 165, z: -115, radius: 28, height: 38 },
  { id: 'rock-2', x: -215, z: 85, radius: 26, height: 31 },
  { id: 'rock-3', x: 195, z: 130, radius: 30, height: 42 },
  { id: 'rock-4', x: -25, z: -245, radius: 22, height: 29 },
  { id: 'rock-5', x: 35, z: 235, radius: 25, height: 35 },
  { id: 'rock-6', x: 295, z: -15, radius: 23, height: 30 },
]);

// ============================================================================
// PROCEDURAL GEOMETRY BUILDERS (Pure BufferGeometry — 100% deterministic)
// ============================================================================

function makeBufferGeom(THREE, positions, indices, colors = null) {
  const geom = new THREE.BufferGeometry();
  const posArr = positions instanceof Float32Array ? positions : new Float32Array(positions);
  geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  if (colors) {
    const colArr = colors instanceof Float32Array ? colors : new Float32Array(colors);
    geom.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  }
  if (indices) {
    const idxArr = indices instanceof Uint16Array || indices instanceof Uint32Array
      ? indices
      : (posArr.length / 3 > 65000 ? new Uint32Array(indices) : new Uint16Array(indices));
    geom.setIndex(new THREE.BufferAttribute(idxArr, 1));
  }
  if (typeof geom.computeVertexNormals === 'function') {
    geom.computeVertexNormals();
  }
  return geom;
}

/**
 * Builds a sculpted 1889 tumblehome ship hull along local Z:
 * Bow at -length/2, Stern at +length/2, Port at -X, Starboard at +X, Deck at +Y.
 */
function buildLoftedHullGeometry(THREE, {
  length = 25.5,
  beam = 7.2,
  depth = 4.6,
  sheerBow = 1.35,
  sheerStern = 2.05,
  tumblehome = 0.14,
  ramBow = false,
} = {}) {
  const stations = 16;
  const profilePts = 11; // port deck -> port chine -> keel -> stbd chine -> stbd deck
  const positions = [];
  const indices = [];

  for (let i = 0; i <= stations; i++) {
    // u = 0 is Bow (-Z), u = 1 is Stern (+Z)
    const u = i / stations;
    const z = -length * 0.5 + u * length;

    // Beam envelope: sharp clipper prow -> full midships -> tapered stern transom
    let halfW;
    if (u < 0.35) {
      const t = u / 0.35;
      halfW = (beam * 0.5) * Math.pow(Math.sin(t * Math.PI * 0.5), 0.78);
    } else if (u <= 0.72) {
      halfW = beam * 0.5;
    } else {
      const t = (u - 0.72) / 0.28;
      halfW = (beam * 0.5) * (1.0 - 0.36 * t * t);
    }
    halfW = Math.max(0.06, halfW);

    // Sheer line (deck height rises fore and aft)
    const midDip = Math.pow((u - 0.44) * 2.0, 2);
    const sheerY = 1.2 + (u < 0.44 ? sheerBow * midDip * 0.55 : sheerStern * midDip * 0.65);

    // Keel rocker
    let keelY = -depth * 0.68;
    if (u < 0.16) {
      const t = 1 - u / 0.16;
      keelY += depth * (ramBow ? 0.12 : 0.42) * t * t;
    } else if (u > 0.84) {
      const t = (u - 0.84) / 0.16;
      keelY += depth * 0.28 * t * t;
    }

    // Ram bow projection forward at waterline for ironclad
    const zBowOffset = (ramBow && u < 0.12) ? -1.8 * (1 - u / 0.12) : 0;

    for (let j = 0; j < profilePts; j++) {
      // s from -1 (port gunwale) to 0 (keel) to +1 (starboard gunwale)
      const s = (j / (profilePts - 1)) * 2 - 1;
      const absS = Math.abs(s);
      const sign = s < 0 ? -1 : (s > 0 ? 1 : 0);

      let x = 0;
      let y = keelY;
      let zLocal = z;

      if (absS < 0.001) {
        x = 0;
        y = keelY;
        zLocal = z + zBowOffset * 0.6;
      } else if (absS <= 0.5) {
        // Bilge curve from keel to widest waterline
        const bt = absS / 0.5;
        x = sign * halfW * Math.pow(bt, 0.62);
        y = lerp(keelY, 0.15, bt * bt);
        zLocal = z + zBowOffset * (1 - bt * 0.3);
      } else {
        // Waterline to gunwale with classic 1889 tumblehome inward slope
        const tt = (absS - 0.5) / 0.5;
        const widthFactor = 1.0 - tumblehome * tt * tt * (1 - 0.5 * Math.pow(1 - u, 3));
        x = sign * halfW * widthFactor;
        y = lerp(0.15, sheerY, tt);
      }

      positions.push(x, y, zLocal);
    }
  }

  const stride = profilePts;
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < profilePts - 1; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, d, c, a, c, b);
    }
  }

  // Deck strip connecting port gunwale (j=0) to starboard gunwale (j=profilePts-1)
  for (let i = 0; i < stations; i++) {
    const p0 = i * stride;
    const s0 = i * stride + (profilePts - 1);
    const p1 = (i + 1) * stride;
    const s1 = (i + 1) * stride + (profilePts - 1);
    indices.push(p0, p1, s1, p0, s1, s0);
  }

  // Stern transom cap at i = stations
  const sternBase = stations * stride;
  const sternCenterIdx = positions.length / 3;
  const sternLeft = sternBase;
  const sternRight = sternBase + (profilePts - 1);
  const cz = positions[sternLeft * 3 + 2];
  const cy = (positions[sternLeft * 3 + 1] + positions[sternBase + Math.floor(profilePts / 2) * 3 + 1]) * 0.5;
  positions.push(0, finiteOr(cy, 0.4), cz);
  for (let j = 0; j < profilePts - 1; j++) {
    indices.push(sternCenterIdx, sternBase + j, sternBase + j + 1);
  }
  indices.push(sternCenterIdx, sternRight, sternLeft);

  return makeBufferGeom(THREE, positions, indices);
}

/**
 * Builds a forward-billowing square sail (-Z billow) hanging from y=0 down to y=-height.
 */
function buildSquareSailGeometry(THREE, width = 8.4, height = 4.6, camber = 1.05, segX = 10, segY = 7) {
  const positions = [];
  const indices = [];
  for (let iy = 0; iy <= segY; iy++) {
    const v = iy / segY;
    // Foot of sail narrows slightly & arches upward at bunt
    const footTapering = 1.0 - 0.06 * v;
    const arch = Math.sin(v * Math.PI);
    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const x = (u - 0.5) * width * footTapering;
      const footLift = v > 0.7 ? Math.sin(u * Math.PI) * 0.22 * ((v - 0.7) / 0.3) : 0;
      const y = -v * height + footLift;
      const z = -camber * Math.sin(u * Math.PI) * (0.28 + 0.72 * arch);
      positions.push(x, y, z);
    }
  }
  const row = segX + 1;
  for (let iy = 0; iy < segY; iy++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iy * row + ix;
      const b = a + 1;
      const c = a + row + 1;
      const d = a + row;
      indices.push(a, d, c, a, c, b);
    }
  }
  return makeBufferGeom(THREE, positions, indices);
}

/**
 * Builds a horizontal broadside gunnery sector fan pointing along dirSign * X (+1 Starboard, -1 Port).
 */
function buildBroadsideFanGeometry(THREE, innerR, outerR, halfAngleRad, dirSign = 1, rSegs = 6, aSegs = 22) {
  const positions = [];
  const indices = [];
  const baseAngle = dirSign > 0 ? 0 : Math.PI;
  for (let ir = 0; ir <= rSegs; ir++) {
    const r = lerp(innerR, outerR, ir / rSegs);
    for (let ia = 0; ia <= aSegs; ia++) {
      const ang = baseAngle + lerp(-halfAngleRad, halfAngleRad, ia / aSegs);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      positions.push(x, 0, z);
    }
  }
  const row = aSegs + 1;
  for (let ir = 0; ir < rSegs; ir++) {
    for (let ia = 0; ia < aSegs; ia++) {
      const a = ir * row + ia;
      const b = a + 1;
      const c = a + row + 1;
      const d = a + row;
      indices.push(a, c, d, a, b, c);
    }
  }
  return makeBufferGeom(THREE, positions, indices);
}

function buildBroadsideFanLinesGeometry(THREE, innerR, outerR, halfAngleRad, dirSign = 1) {
  const pts = [];
  const baseAngle = dirSign > 0 ? 0 : Math.PI;
  const rings = [innerR, (innerR + outerR) * 0.38, (innerR + outerR) * 0.69, outerR];
  const arcSegs = 28;
  for (const r of rings) {
    for (let i = 0; i < arcSegs; i++) {
      const a0 = baseAngle + lerp(-halfAngleRad, halfAngleRad, i / arcSegs);
      const a1 = baseAngle + lerp(-halfAngleRad, halfAngleRad, (i + 1) / arcSegs);
      pts.push(
        Math.cos(a0) * r, 0.02, Math.sin(a0) * r,
        Math.cos(a1) * r, 0.02, Math.sin(a1) * r
      );
    }
  }
  // Boundary rays + center bearing line
  for (const offset of [-halfAngleRad, 0, halfAngleRad]) {
    const a = baseAngle + offset;
    pts.push(
      Math.cos(a) * innerR, 0.02, Math.sin(a) * innerR,
      Math.cos(a) * outerR, 0.02, Math.sin(a) * outerR
    );
  }
  return makeBufferGeom(THREE, pts, null);
}

/**
 * Builds a sculpted hexagonal-columnar floating basalt sky-rock spire.
 */
function buildBasaltSpireGeometry(THREE, radius = 24, bottomY = -30, topY = 32, seed = 1) {
  const rng = makeRng(seed);
  const rings = 9;
  const sides = 10;
  const positions = [];
  const indices = [];

  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;

  for (let ir = 0; ir <= rings; ir++) {
    const v = ir / rings;
    const y = lerp(bottomY, topY, v);
    // Tapered root below cloud deck, broad crag waist near y=0, stepped spire crown above
    let profile;
    if (v < 0.35) {
      profile = Math.pow(v / 0.35, 0.68) * 0.92;
    } else if (v < 0.62) {
      profile = 0.92 + 0.08 * Math.sin(((v - 0.35) / 0.27) * Math.PI);
    } else {
      const t = (v - 0.62) / 0.38;
      profile = 0.92 * (1.0 - 0.74 * Math.pow(t, 1.15));
    }
    for (let is = 0; is < sides; is++) {
      const ang = (is / sides) * Math.PI * 2;
      const facet = 0.84 + 0.16 * Math.cos(ang * 3 + phaseA) + 0.09 * Math.sin(ang * 5 - v * 4 + phaseB);
      const r = Math.max(0.5, radius * profile * facet);
      positions.push(Math.cos(ang) * r, y, Math.sin(ang) * r);
    }
  }

  for (let ir = 0; ir < rings; ir++) {
    for (let is = 0; is < sides; is++) {
      const nextS = (is + 1) % sides;
      const a = ir * sides + is;
      const b = ir * sides + nextS;
      const c = (ir + 1) * sides + nextS;
      const d = (ir + 1) * sides + is;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Bottom & top caps
  const botCenter = positions.length / 3;
  positions.push(0, bottomY - 2, 0);
  const topCenter = positions.length / 3;
  positions.push(0, topY + 0.4, 0);

  for (let is = 0; is < sides; is++) {
    const nextS = (is + 1) % sides;
    indices.push(botCenter, nextS, is);
    indices.push(topCenter, rings * sides + is, rings * sides + nextS);
  }

  return makeBufferGeom(THREE, positions, indices);
}

/**
 * Builds CAD wireframe LineSegments for any geometry (uses THREE.EdgesGeometry with safe fallback).
 */
function createEdgeOverlay(THREE, geom, lineMat, thresholdAngle = 22) {
  let edgeGeom = null;
  if (typeof THREE.EdgesGeometry === 'function') {
    try {
      edgeGeom = new THREE.EdgesGeometry(geom, thresholdAngle);
    } catch (_) {
      edgeGeom = null;
    }
  }
  if (!edgeGeom) {
    // Fallback wireframe segment extraction from triangle index/position buffer
    const posAttr = geom?.attributes?.position;
    const arr = posAttr?.array;
    const pts = [];
    if (arr && arr.length >= 9) {
      const idx = geom?.index?.array;
      const maxEdges = 180;
      if (idx && idx.length >= 3) {
        const step = Math.max(1, Math.floor((idx.length / 3) / maxEdges)) * 3;
        for (let i = 0; i + 2 < idx.length; i += step) {
          const i0 = idx[i] * 3;
          const i1 = idx[i + 1] * 3;
          const i2 = idx[i + 2] * 3;
          pts.push(
            arr[i0], arr[i0 + 1], arr[i0 + 2], arr[i1], arr[i1 + 1], arr[i1 + 2],
            arr[i1], arr[i1 + 1], arr[i1 + 2], arr[i2], arr[i2 + 1], arr[i2 + 2]
          );
        }
      } else {
        for (let i = 0; i + 8 < arr.length && pts.length < maxEdges * 6; i += 9) {
          pts.push(
            arr[i], arr[i + 1], arr[i + 2], arr[i + 3], arr[i + 4], arr[i + 5],
            arr[i + 3], arr[i + 4], arr[i + 5], arr[i + 6], arr[i + 7], arr[i + 8]
          );
        }
      }
    } else {
      pts.push(-0.5, 0, 0, 0.5, 0, 0);
    }
    edgeGeom = makeBufferGeom(THREE, pts, null);
  }
  const lines = new THREE.LineSegments(edgeGeom, lineMat);
  lines.raycast = () => {};
  return lines;
}

// ============================================================================
// MAIN WORLD & FLEET FACTORY
// ============================================================================

export function createBroadsideWorld({ THREE, scene } = {}) {
  if (!THREE) {
    throw new Error('createBroadsideWorld requires { THREE, scene }');
  }

  const group = new THREE.Group();
  group.name = 'AetherBroadsideWorld';
  if (scene && typeof scene.add === 'function') {
    scene.add(group);
  }

  let viewMode = '3d'; // '3d' | 'cad'
  let cadTheme = 'dark'; // 'dark' | 'light'
  let internalElapsed = 0;

  // Dual-mode material registry for instant 3D <-> X-Ray CAD switching
  const hullDualRecords = [];
  const rockDualRecords = [];
  const subsystemDualRecords = {
    boiler: [],
    sponsons: [],
    gunDeck: [],
    rigging: [],
    propulsor: [],
  };

  // Shared CAD ghost/technical materials
  const cadGhostHullMat = new THREE.MeshBasicMaterial({
    color: PALETTE.cadDark.hullFill,
    transparent: true,
    opacity: PALETTE.cadDark.hullOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cadHullEdgeMat = new THREE.LineBasicMaterial({
    color: PALETTE.cadDark.hullEdge,
    transparent: true,
    opacity: 0.82,
  });
  const cadRockFillMat = new THREE.MeshBasicMaterial({
    color: PALETTE.cadDark.rockFill,
    transparent: true,
    opacity: 0.78,
  });
  const cadRockEdgeMat = new THREE.LineBasicMaterial({
    color: PALETTE.cadDark.rockEdge,
    transparent: true,
    opacity: 0.9,
  });

  // Per-subsystem CAD technical materials (independently color-coded by health/fire/leak)
  const subsystemCadMats = {};
  for (const id of SUBSYSTEM_IDS) {
    subsystemCadMats[id] = {
      fill: new THREE.MeshBasicMaterial({
        color: PALETTE.cadDark.healthyFill,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
      }),
      edge: new THREE.LineBasicMaterial({
        color: PALETTE.cadDark.healthyEdge,
        transparent: true,
        opacity: 0.96,
      }),
    };
  }

  // Shared 3D PBR Materials
  const mats3d = {
    mahogany: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.mahogany,
      roughness: 0.62,
      metalness: 0.12,
      side: THREE.DoubleSide,
    }),
    mahoganyDark: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.mahoganyDark,
      roughness: 0.68,
      metalness: 0.14,
      side: THREE.DoubleSide,
    }),
    oakDeck: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.oakDeck,
      roughness: 0.76,
      metalness: 0.06,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.brass,
      roughness: 0.28,
      metalness: 0.84,
    }),
    brassBright: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.brassBright,
      roughness: 0.22,
      metalness: 0.88,
      emissive: 0x3b2506,
      emissiveIntensity: 0.25,
    }),
    bronze: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.bronze,
      roughness: 0.38,
      metalness: 0.76,
    }),
    iron: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.iron,
      roughness: 0.48,
      metalness: 0.68,
    }),
    ironDark: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.ironDark,
      roughness: 0.54,
      metalness: 0.62,
    }),
    sail: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.sailCanvas,
      roughness: 0.84,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
    aetherCore: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.aether,
      emissive: PALETTE.mode3d.aether,
      emissiveIntensity: 1.65,
      roughness: 0.18,
      metalness: 0.2,
    }),
    aetherGlow: new THREE.MeshBasicMaterial({
      color: PALETTE.mode3d.aether,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    lanternWarm: new THREE.MeshStandardMaterial({
      color: 0xffe4a0,
      emissive: 0xffa838,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1,
    }),
    riggingRope: new THREE.LineBasicMaterial({
      color: 0x8c775c,
      transparent: true,
      opacity: 0.75,
    }),
    basalt: new THREE.MeshStandardMaterial({
      color: 0x222936,
      roughness: 0.88,
      metalness: 0.12,
      flatShading: true,
    }),
    basaltCap: new THREE.MeshStandardMaterial({
      color: 0x364254,
      roughness: 0.82,
      metalness: 0.15,
      flatShading: true,
    }),
  };

  function addHullMesh(parent, geom, mat3d, edgeThreshold = 22) {
    const mesh = new THREE.Mesh(geom, mat3d);
    const edges = createEdgeOverlay(THREE, geom, cadHullEdgeMat, edgeThreshold);
    edges.visible = false;
    mesh.add(edges);
    parent.add(mesh);
    hullDualRecords.push({ mesh, mat3d, edges });
    return mesh;
  }

  function addSubsystemMesh(subsystemId, parent, geom, mat3d, opts = {}) {
    const mesh = new THREE.Mesh(geom, mat3d);
    mesh.userData.subsystemId = subsystemId;
    const cadPair = subsystemCadMats[subsystemId];
    const edges = createEdgeOverlay(THREE, geom, cadPair.edge, opts.edgeThreshold ?? 22);
    edges.visible = false;
    mesh.add(edges);
    parent.add(mesh);
    subsystemDualRecords[subsystemId].push({
      mesh,
      mat3d,
      edges,
      keepGlowInCad: Boolean(opts.keepGlowInCad),
    });
    return mesh;
  }

  // ==========================================================================
  // 1. STORMY CLOUD-SEA ARENA, SKY DOME, LIGHTING, WIND & CAD DRAFTING PLATE
  // ==========================================================================
  const envGroup = new THREE.Group();
  envGroup.name = 'EnvironmentArena';
  group.add(envGroup);

  // Lighting rig: warm sunset-brass vs deep storm-slate + distant lightning
  const hemiLight = new THREE.HemisphereLight(0xffdfb3, 0x1a2840, 1.35);
  hemiLight.position.set(0, 120, 0);
  group.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffbe76, 2.35);
  sunLight.position.set(-190, 95, -240);
  group.add(sunLight);

  const stormRimLight = new THREE.DirectionalLight(0x568cff, 1.05);
  stormRimLight.position.set(210, 75, 190);
  group.add(stormRimLight);

  const lightningLight = new THREE.DirectionalLight(0xb8dcff, 0.0);
  lightningLight.position.set(280, 140, -290);
  group.add(lightningLight);

  // Sky Dome (hidden in CAD schematic mode)
  const skyDomeGroup = new THREE.Group();
  envGroup.add(skyDomeGroup);
  {
    const skySegW = 28;
    const skySegH = 16;
    const skyRadius = 1180;
    const pos = [];
    const col = [];
    const idx = [];
    const cTop = new THREE.Color(0x0b1220);
    const cMid = new THREE.Color(0x1b2942);
    const cHorizonStorm = new THREE.Color(0x2c3c59);
    const cHorizonBrass = new THREE.Color(0xc97b3d);
    const cAbyss = new THREE.Color(0x090e18);
    const tmp = new THREE.Color();

    for (let iy = 0; iy <= skySegH; iy++) {
      const v = iy / skySegH;
      const phi = v * Math.PI;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      for (let ix = 0; ix <= skySegW; ix++) {
        const u = ix / skySegW;
        const theta = u * Math.PI * 2;
        const x = -skyRadius * sinPhi * Math.cos(theta);
        const y = skyRadius * cosPhi;
        const z = skyRadius * sinPhi * Math.sin(theta);
        pos.push(x, y, z);

        // Warm sunset-brass glow in the NW quadrant (-X, -Z), storm slate opposite
        const sunDot = clamp((-Math.cos(theta) * 0.65 - Math.sin(theta) * 0.75 + 1) * 0.5, 0, 1);
        if (cosPhi >= 0) {
          const hBlend = Math.pow(1 - cosPhi, 2.4);
          tmp.copy(cTop).lerp(cMid, clamp(1 - cosPhi * 1.2, 0, 1));
          const horiz = cHorizonStorm.clone().lerp(cHorizonBrass, Math.pow(sunDot, 2.1) * 0.82);
          tmp.lerp(horiz, hBlend);
        } else {
          tmp.copy(cHorizonStorm).lerp(cAbyss, clamp(-cosPhi * 2.5, 0, 1));
        }
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    const row = skySegW + 1;
    for (let iy = 0; iy < skySegH; iy++) {
      for (let ix = 0; ix < skySegW; ix++) {
        const a = iy * row + ix;
        const b = a + 1;
        const c = a + row + 1;
        const d = a + row;
        // Inward-facing winding
        idx.push(a, b, c, a, c, d);
      }
    }
    const skyGeom = makeBufferGeom(THREE, pos, idx, col);
    const skyMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      fog: false,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(skyGeom, skyMat);
    skyMesh.renderOrder = -10;
    skyMesh.raycast = () => {};
    skyDomeGroup.add(skyMesh);
  }

  // Distant Storm-Wall Lightning Bolt Ribbon (flashes on storm perimeter)
  const lightningBoltGroup = new THREE.Group();
  skyDomeGroup.add(lightningBoltGroup);
  const lightningBoltMat = new THREE.MeshBasicMaterial({
    color: 0xd8eeff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    fog: false,
    depthWrite: false,
  });
  {
    const boltPos = [];
    const boltIdx = [];
    let bx = 0;
    let by = 195;
    const steps = 11;
    for (let i = 0; i <= steps; i++) {
      const w = lerp(4.2, 0.9, i / steps);
      boltPos.push(bx - w, by, 0, bx + w, by, 0);
      bx += (i % 2 === 0 ? 14 : -11);
      by -= 22;
      if (i < steps) {
        const k = i * 2;
        boltIdx.push(k, k + 1, k + 3, k, k + 3, k + 2);
      }
    }
    const boltGeom = makeBufferGeom(THREE, boltPos, boltIdx);
    const boltMesh = new THREE.Mesh(boltGeom, lightningBoltMat);
    boltMesh.raycast = () => {};
    lightningBoltGroup.add(boltMesh);
    lightningBoltGroup.position.set(420, 10, -460);
  }

  // Multi-Layer Rolling Cloud-Sea Floor (Y ≈ -22m) + Abyssal Under-Layer (Y ≈ -30m)
  const cloudSeaGroup = new THREE.Group();
  cloudSeaGroup.name = 'CloudSeaFloor';
  envGroup.add(cloudSeaGroup);

  const cloudGridSegs = 44;
  const cloudGridSize = 1480;
  let cloudPosAttr = null;
  const cloudBaseXZ = [];
  {
    const pos = [];
    const col = [];
    const idx = [];
    const cTrough = new THREE.Color(0x121b2c);
    const cMid = new THREE.Color(0x2b3c56);
    const cCrest = new THREE.Color(0x6e6a74);
    const cWarm = new THREE.Color(0x9a6d56);
    const tmp = new THREE.Color();

    for (let iz = 0; iz <= cloudGridSegs; iz++) {
      const z = (iz / cloudGridSegs - 0.5) * cloudGridSize;
      for (let ix = 0; ix <= cloudGridSegs; ix++) {
        const x = (ix / cloudGridSegs - 0.5) * cloudGridSize;
        const h =
          Math.sin(x * 0.018 + z * 0.011) * 2.8 +
          Math.cos(x * 0.009 - z * 0.016) * 3.4 +
          Math.sin((x + z) * 0.031) * 1.2;
        const y = -22.0 + h;
        pos.push(x, y, z);
        cloudBaseXZ.push(x, z);

        const normH = clamp((h + 7.4) / 14.8, 0, 1);
        tmp.copy(cTrough).lerp(cMid, clamp(normH * 1.5, 0, 1));
        if (normH > 0.55) {
          tmp.lerp(cCrest, (normH - 0.55) / 0.45);
        }
        const sunWarmth = clamp((-x - z) / 1100, 0, 1) * Math.pow(normH, 2) * 0.48;
        tmp.lerp(cWarm, sunWarmth);
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    const row = cloudGridSegs + 1;
    for (let iz = 0; iz < cloudGridSegs; iz++) {
      for (let ix = 0; ix < cloudGridSegs; ix++) {
        const a = iz * row + ix;
        const b = a + 1;
        const c = a + row + 1;
        const d = a + row;
        idx.push(a, d, c, a, c, b);
      }
    }
    const cloudGeom = makeBufferGeom(THREE, pos, idx, col);
    cloudPosAttr = cloudGeom.attributes.position;
    const cloudMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: true,
    });
    const cloudMesh = new THREE.Mesh(cloudGeom, cloudMat);
    cloudMesh.raycast = () => {};
    cloudSeaGroup.add(cloudMesh);

    // Lower storm-abyss sub-layer with faint lightning glow
    const abyssGeom = new THREE.PlaneGeometry(1600, 1600, 1, 1);
    const abyssMat = new THREE.MeshBasicMaterial({
      color: 0x0b1220,
      side: THREE.DoubleSide,
    });
    const abyssMesh = new THREE.Mesh(abyssGeom, abyssMat);
    abyssMesh.rotation.x = -Math.PI * 0.5;
    abyssMesh.position.y = -31.5;
    abyssMesh.raycast = () => {};
    cloudSeaGroup.add(abyssMesh);
  }

  // Drifting Cloud Banks at Low (Y=-12), Mid (Y=-3), and High (Y=+8) Altitude Strata
  const cloudBanksGroup = new THREE.Group();
  cloudBanksGroup.name = 'DriftingCloudStrata';
  cloudSeaGroup.add(cloudBanksGroup);

  const cloudBanks = [];
  {
    const rng = makeRng(188911);
    const puffGeom = typeof THREE.IcosahedronGeometry === 'function'
      ? new THREE.IcosahedronGeometry(1, 1)
      : new THREE.SphereGeometry(1, 8, 6);
    const strataDefs = [
      { y: -13.5, count: 16, color: 0x2f405c, opacity: 0.52, scaleMin: 11, scaleMax: 22, speedMul: 0.55 },
      { y: -3.8, count: 12, color: 0x4b5f7d, opacity: 0.30, scaleMin: 9, scaleMax: 17, speedMul: 0.82 },
      { y: 7.5, count: 10, color: 0x73849e, opacity: 0.22, scaleMin: 8, scaleMax: 15, speedMul: 1.12 },
    ];
    for (const st of strataDefs) {
      const mat = new THREE.MeshStandardMaterial({
        color: st.color,
        roughness: 0.92,
        metalness: 0.0,
        transparent: true,
        opacity: st.opacity,
        depthWrite: false,
        flatShading: true,
      });
      for (let i = 0; i < st.count; i++) {
        const bank = new THREE.Group();
        const angle = rng() * Math.PI * 2;
        const dist = 75 + rng() * 410;
        const bx = Math.cos(angle) * dist;
        const bz = Math.sin(angle) * dist;
        const baseScale = lerp(st.scaleMin, st.scaleMax, rng());

        const puffs = 3 + Math.floor(rng() * 3);
        for (let p = 0; p < puffs; p++) {
          const m = new THREE.Mesh(puffGeom, mat);
          const s = baseScale * (0.6 + rng() * 0.55);
          m.scale.set(s * 1.45, s * 0.42, s * 1.15);
          m.position.set(
            (p - (puffs - 1) * 0.5) * baseScale * 0.85,
            (rng() - 0.5) * 2.2,
            (rng() - 0.5) * baseScale * 0.55
          );
          m.raycast = () => {};
          bank.add(m);
        }
        const by = st.y + (rng() - 0.5) * 2.8;
        bank.position.set(bx, by, bz);
        cloudBanksGroup.add(bank);
        cloudBanks.push({
          group: bank,
          baseY: by,
          speedMul: st.speedMul,
          bobPhase: rng() * Math.PI * 2,
        });
      }
    }
  }

  // Wind-Streamline Ribbons aligned dynamically to wind.angle & wind.knots
  const windFieldGroup = new THREE.Group();
  windFieldGroup.name = 'WindStreamlines';
  envGroup.add(windFieldGroup);

  const windRibbonMat = new THREE.MeshBasicMaterial({
    color: 0xaad4ff,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const windRibbons = [];
  {
    const rng = makeRng(8802);
    const ribbonGeom = new THREE.PlaneGeometry(0.42, 22, 1, 1);
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(ribbonGeom, windRibbonMat);
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.raycast = () => {};
      const rx = (rng() - 0.5) * 560;
      const rz = (rng() - 0.5) * 560;
      const ry = -9 + rng() * 24;
      mesh.position.set(rx, ry, rz);
      windFieldGroup.add(mesh);
      windRibbons.push({
        mesh,
        localX: rx,
        localZ: rz,
        baseY: ry,
        speedOffset: 0.75 + rng() * 0.65,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  // Isometric CAD Technical Drafting Grid & Range Compass Plate (visible in 'cad' mode)
  const cadGridGroup = new THREE.Group();
  cadGridGroup.name = 'CadTechnicalPlate';
  cadGridGroup.visible = false;
  envGroup.add(cadGridGroup);

  const cadMinorGridMat = new THREE.LineBasicMaterial({
    color: PALETTE.cadDark.gridMinor,
    transparent: true,
    opacity: 0.85,
  });
  const cadMajorGridMat = new THREE.LineBasicMaterial({
    color: PALETTE.cadDark.gridMajor,
    transparent: true,
    opacity: 0.92,
  });
  {
    // World drafting grid
    const minorPts = [];
    const majorPts = [];
    const half = 480;
    const step = 20;
    for (let d = -half; d <= half; d += step) {
      const target = (d % 80 === 0) ? majorPts : minorPts;
      target.push(-half, 0, d, half, 0, d);
      target.push(d, 0, -half, d, 0, half);
    }
    const minorLines = new THREE.LineSegments(makeBufferGeom(THREE, minorPts, null), cadMinorGridMat);
    const majorLines = new THREE.LineSegments(makeBufferGeom(THREE, majorPts, null), cadMajorGridMat);
    minorLines.raycast = () => {};
    majorLines.raycast = () => {};
    cadGridGroup.add(minorLines, majorLines);
  }

  // Player-centered Admiralty Range Compass Rings in CAD mode (70m, 140m, 210m max gunnery range)
  const cadShipCompass = new THREE.Group();
  cadShipCompass.visible = false;
  envGroup.add(cadShipCompass);
  {
    const ringPts = [];
    const radii = [28, 70, 140, 210];
    const segs = 64;
    for (const r of radii) {
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        ringPts.push(
          Math.cos(a0) * r, 0.05, Math.sin(a0) * r,
          Math.cos(a1) * r, 0.05, Math.sin(a1) * r
        );
      }
    }
    // 16-point compass rose ticks
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const inner = i % 4 === 0 ? 22 : 196;
      ringPts.push(
        Math.cos(a) * inner, 0.05, Math.sin(a) * inner,
        Math.cos(a) * 216, 0.05, Math.sin(a) * 216
      );
    }
    const compassLines = new THREE.LineSegments(makeBufferGeom(THREE, ringPts, null), cadMajorGridMat);
    compassLines.raycast = () => {};
    cadShipCompass.add(compassLines);
  }

  // ==========================================================================
  // 2. SKY-ARCHIPELAGO BASALT SPIRES & AETHER-BEACON ROCKS (setObstacles)
  // ==========================================================================
  const obstaclesGroup = new THREE.Group();
  obstaclesGroup.name = 'SkyArchipelagoObstacles';
  group.add(obstaclesGroup);

  const beaconRotors = [];
  let lastObstacleSignature = '';

  function setObstacles(obstacles) {
    const list = Array.isArray(obstacles) && obstacles.length > 0 ? obstacles : DEFAULT_OBSTACLES;
    const sig = list
      .map((o, idx) => `${o?.id ?? idx}:${Math.round(finiteOr(o?.x, 0))}:${Math.round(finiteOr(o?.z, 0))}:${Math.round(finiteOr(o?.radius, 22))}`)
      .join('|');
    if (sig === lastObstacleSignature && obstaclesGroup.children.length > 0) {
      return;
    }
    lastObstacleSignature = sig;

    while (obstaclesGroup.children.length > 0) {
      obstaclesGroup.remove(obstaclesGroup.children[0]);
    }
    rockDualRecords.length = 0;
    beaconRotors.length = 0;

    list.forEach((obs, idx) => {
      const ox = finiteOr(obs?.x, 0);
      const oz = finiteOr(obs?.z, 0);
      const radius = Math.max(6, finiteOr(obs?.radius, 24));
      const height = Math.max(12, finiteOr(obs?.height, 32));

      const rockRoot = new THREE.Group();
      rockRoot.name = obs?.id ? `SkyRock_${obs.id}` : `SkyRock_${idx}`;
      rockRoot.position.set(ox, 0, oz);

      const spireGeom = buildBasaltSpireGeometry(THREE, radius, -30, height, 4100 + idx * 97);
      const spireMesh = new THREE.Mesh(spireGeom, viewMode === 'cad' ? cadRockFillMat : mats3d.basalt);
      const spireEdges = createEdgeOverlay(THREE, spireGeom, cadRockEdgeMat, 18);
      spireEdges.visible = viewMode === 'cad';
      spireMesh.add(spireEdges);
      rockRoot.add(spireMesh);
      rockDualRecords.push({ mesh: spireMesh, mat3d: mats3d.basalt, edges: spireEdges });

      // Flanking shoulder crag
      const cragGeom = buildBasaltSpireGeometry(THREE, radius * 0.56, -24, height * 0.52, 7200 + idx * 53);
      const cragMesh = new THREE.Mesh(cragGeom, viewMode === 'cad' ? cadRockFillMat : mats3d.basaltCap);
      const cragAng = idx * 2.15;
      cragMesh.position.set(Math.cos(cragAng) * radius * 0.52, -2, Math.sin(cragAng) * radius * 0.52);
      const cragEdges = createEdgeOverlay(THREE, cragGeom, cadRockEdgeMat, 18);
      cragEdges.visible = viewMode === 'cad';
      cragMesh.add(cragEdges);
      rockRoot.add(cragMesh);
      rockDualRecords.push({ mesh: cragMesh, mat3d: mats3d.basaltCap, edges: cragEdges });

      // Embedded emerald aether crystal shard + summit Admiralty Aether-Beacon Lantern
      const beaconY = height + 0.4;
      const towerGeom = new THREE.CylinderGeometry(0.65, 1.35, 4.6, 6);
      const towerMesh = new THREE.Mesh(towerGeom, viewMode === 'cad' ? cadRockFillMat : mats3d.iron);
      towerMesh.position.set(0, beaconY + 2.1, 0);
      const towerEdges = createEdgeOverlay(THREE, towerGeom, cadRockEdgeMat, 20);
      towerEdges.visible = viewMode === 'cad';
      towerMesh.add(towerEdges);
      rockRoot.add(towerMesh);
      rockDualRecords.push({ mesh: towerMesh, mat3d: mats3d.iron, edges: towerEdges });

      const crystalGeom = typeof THREE.OctahedronGeometry === 'function'
        ? new THREE.OctahedronGeometry(1.35, 0)
        : new THREE.SphereGeometry(1.2, 6, 6);
      const crystalMesh = new THREE.Mesh(crystalGeom, mats3d.aetherCore);
      crystalMesh.position.set(0, beaconY + 5.4, 0);
      rockRoot.add(crystalMesh);

      const cageRingGeom = new THREE.TorusGeometry(2.0, 0.14, 6, 16);
      const cageRing = new THREE.Mesh(cageRingGeom, mats3d.brass);
      cageRing.position.set(0, beaconY + 5.4, 0);
      rockRoot.add(cageRing);
      beaconRotors.push({ crystal: crystalMesh, cage: cageRing, phase: idx * 1.3 });

      obstaclesGroup.add(rockRoot);
    });
  }

  // Seed default sky-archipelago rocks immediately
  setObstacles(DEFAULT_OBSTACLES);

  // ==========================================================================
  // 3. SCULPTED 3D PLAYER GALLEON ("THE FLYING DUTCHMAN") + 5 SUBSYSTEMS
  // ==========================================================================
  const playerShipGroup = new THREE.Group();
  playerShipGroup.name = 'FlyingDutchmanGalleon';
  if (playerShipGroup.rotation) {
    playerShipGroup.rotation.order = 'YXZ';
  }
  group.add(playerShipGroup);

  // Inner roll/pitch cradle so screen anchors & broadside arcs stay super crisp
  const shipBody = new THREE.Group();
  shipBody.name = 'GalleonBody';
  playerShipGroup.add(shipBody);

  // --- 3A. HULL, DECKS, BOWSPRIT & STERN GALLERY ---
  const hullGroup = new THREE.Group();
  hullGroup.name = 'GalleonHull';
  shipBody.add(hullGroup);

  {
    const mainHullGeom = buildLoftedHullGeometry(THREE, {
      length: 25.6,
      beam: 7.3,
      depth: 4.8,
      sheerBow: 1.45,
      sheerStern: 2.25,
      tumblehome: 0.15,
    });
    addHullMesh(hullGroup, mainHullGeom, mats3d.mahogany, 20);

    // Keel & clipper stem shoe
    const keelGeom = new THREE.BoxGeometry(0.46, 0.7, 23.2);
    const keel = addHullMesh(hullGroup, keelGeom, mats3d.mahoganyDark);
    keel.position.set(0, -3.35, 0.2);

    // Burnished brass rub-strakes along Port & Starboard wales
    const strakeGeom = new THREE.BoxGeometry(0.18, 0.22, 22.8);
    const portStrake = addHullMesh(hullGroup, strakeGeom, mats3d.brass);
    portStrake.position.set(-3.58, 0.55, 0.2);
    const stbdStrake = addHullMesh(hullGroup, strakeGeom, mats3d.brass);
    stbdStrake.position.set(3.58, 0.55, 0.2);

    // Raised Forecastle Deck (forward, Z in [-12.2, -7.2])
    const focslGeom = new THREE.BoxGeometry(5.1, 0.95, 4.9);
    const focsl = addHullMesh(hullGroup, focslGeom, mats3d.oakDeck);
    focsl.position.set(0, 1.95, -9.6);

    // Raised Quarterdeck & Stern Castle (aft, Z in [+5.6, +12.6])
    const qdeckGeom = new THREE.BoxGeometry(5.8, 1.35, 6.8);
    const qdeck = addHullMesh(hullGroup, qdeckGeom, mats3d.oakDeck);
    qdeck.position.set(0, 2.25, 9.1);

    const poopGeom = new THREE.BoxGeometry(4.9, 1.05, 3.4);
    const poop = addHullMesh(hullGroup, poopGeom, mats3d.mahogany);
    poop.position.set(0, 3.25, 10.9);

    // Ship's Brass Helm Wheel on Quarterdeck
    const helmStand = addHullMesh(hullGroup, new THREE.BoxGeometry(0.45, 0.95, 0.45), mats3d.mahoganyDark);
    helmStand.position.set(0, 3.3, 6.6);
    const helmWheel = addHullMesh(hullGroup, new THREE.TorusGeometry(0.62, 0.07, 6, 14), mats3d.brass);
    helmWheel.position.set(0, 3.65, 6.32);

    // Amidships Open Brass Deck Grating (reveals glowing 15.5-bar aether boiler below!)
    const grateFrameGeom = new THREE.BoxGeometry(3.4, 0.16, 5.2);
    // Build open frame bars rather than solid slab so boiler emerald light shines straight up!
    const sideBarGeom = new THREE.BoxGeometry(0.26, 0.18, 5.2);
    const pBar = addHullMesh(hullGroup, sideBarGeom, mats3d.brass);
    pBar.position.set(-1.6, 1.42, -0.5);
    const sBar = addHullMesh(hullGroup, sideBarGeom, mats3d.brass);
    sBar.position.set(1.6, 1.42, -0.5);
    const slatGeom = new THREE.BoxGeometry(3.1, 0.1, 0.14);
    for (let k = -4; k <= 4; k++) {
      const slat = addHullMesh(hullGroup, slatGeom, mats3d.bronze);
      slat.position.set(0, 1.42, -0.5 + k * 0.55);
    }
    void grateFrameGeom;

    // Ornate Bowsprit & Jibboom (-Z prow) + Brass Figurehead Scroll
    const bowspritGeom = new THREE.CylinderGeometry(0.11, 0.28, 7.6, 8);
    const bowsprit = addHullMesh(hullGroup, bowspritGeom, mats3d.mahoganyDark);
    bowsprit.rotation.x = -Math.PI * 0.5 + 0.31;
    bowsprit.position.set(0, 2.85, -15.3);

    const figureheadGeom = new THREE.TorusGeometry(0.55, 0.16, 6, 12, Math.PI * 1.45);
    const figurehead = addHullMesh(hullGroup, figureheadGeom, mats3d.brassBright);
    figurehead.rotation.y = Math.PI * 0.5;
    figurehead.position.set(0, 1.75, -13.1);

    // Gilded Stern Gallery Windows & Great Admiralty Lantern (+Z stern)
    const transomTrim = addHullMesh(hullGroup, new THREE.BoxGeometry(4.6, 0.24, 0.28), mats3d.brass);
    transomTrim.position.set(0, 3.78, 12.68);
    for (let wx = -1.5; wx <= 1.5; wx += 1.0) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.12), mats3d.lanternWarm);
      pane.position.set(wx, 3.18, 12.68);
      hullGroup.add(pane);
    }

    const lanternCage = addHullMesh(hullGroup, new THREE.CylinderGeometry(0.45, 0.34, 1.05, 6), mats3d.brass);
    lanternCage.position.set(0, 4.55, 13.05);
    const lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), mats3d.lanternWarm);
    lanternCore.position.set(0, 4.55, 13.05);
    hullGroup.add(lanternCore);
  }

  // --- 3B. FIVE INTERACTIVE SUBSYSTEM GROUPS ---
  const subsystemGroups = {
    boiler: new THREE.Group(),
    sponsons: new THREE.Group(),
    gunDeck: new THREE.Group(),
    rigging: new THREE.Group(),
    propulsor: new THREE.Group(),
  };

  // Distinct local 3D callout anchors (diamond + spire layout so HUD pins never overlap)
  const subsystemLocalAnchors = {
    boiler: new THREE.Vector3(0, 1.65, -0.5),
    sponsons: new THREE.Vector3(5.05, -0.15, 2.2),
    gunDeck: new THREE.Vector3(-3.55, 1.15, -5.8),
    rigging: new THREE.Vector3(0, 13.6, -0.8),
    propulsor: new THREE.Vector3(0, -1.1, 13.3),
  };

  // Bounding spheres in ship-local space for generous analytic fallback raycasting
  const subsystemLocalSpheres = {
    boiler: { center: new THREE.Vector3(0, 1.1, -0.5), radius: 2.5 },
    sponsons: { center: new THREE.Vector3(0, -0.3, 0.6), radius: 5.5, dualX: 5.0, singleRadius: 2.4 },
    gunDeck: { center: new THREE.Vector3(0, 0.95, -1.0), radius: 3.4, dualGun: true },
    rigging: { center: new THREE.Vector3(0, 13.8, -0.3), radius: 5.0 },
    propulsor: { center: new THREE.Vector3(0, -1.2, 13.1), radius: 2.5 },
  };

  const subsystemHitProxyMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });

  function addPickProxy(subsystemId, parent, x, y, z, sx, sy, sz) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), subsystemHitProxyMat);
    proxy.position.set(x, y, z);
    proxy.userData.subsystemId = subsystemId;
    proxy.userData.isHitProxy = true;
    parent.add(proxy);
    return proxy;
  }

  for (const id of SUBSYSTEM_IDS) {
    const g = subsystemGroups[id];
    g.name = `Subsystem_${id}`;
    g.userData.subsystemId = id;
    shipBody.add(g);
  }

  // 1) SUBSYSTEM: 'boiler' — 15.5-Bar Scotch Marine Aether-Boiler & Twin Brass Smokestacks
  const boilerCoreLight = new THREE.PointLight(PALETTE.mode3d.aether, 2.6, 18);
  boilerCoreLight.position.set(0, 0.9, -0.5);
  subsystemGroups.boiler.add(boilerCoreLight);

  let boilerCoreMesh = null;
  {
    const bg = subsystemGroups.boiler;
    // Heavy Scotch marine cylindrical drum along Z
    const drumGeom = new THREE.CylinderGeometry(1.62, 1.62, 5.2, 16);
    const drum = addSubsystemMesh('boiler', bg, drumGeom, mats3d.iron);
    drum.rotation.x = Math.PI * 0.5;
    drum.position.set(0, -0.45, -0.5);

    // Brass boiler bands
    const bandGeom = new THREE.TorusGeometry(1.66, 0.09, 8, 20);
    for (const bz of [-2.5, -1.1, 0.3, 1.7]) {
      const band = addSubsystemMesh('boiler', bg, bandGeom, mats3d.brass);
      band.position.set(0, -0.45, bz);
    }

    // Glowing emerald Aether-Core Reaction Chamber inside boiler + sight-ports
    const coreGeom = new THREE.CylinderGeometry(1.12, 1.12, 4.1, 12);
    boilerCoreMesh = addSubsystemMesh('boiler', bg, coreGeom, mats3d.aetherCore, { keepGlowInCad: true });
    boilerCoreMesh.rotation.x = Math.PI * 0.5;
    boilerCoreMesh.position.set(0, -0.25, -0.5);

    // Longitudinal steam collector dome & transverse manifold pipes to sponsons
    const domeGeom = new THREE.CylinderGeometry(0.58, 0.65, 3.6, 12);
    const dome = addSubsystemMesh('boiler', bg, domeGeom, mats3d.brass);
    dome.rotation.x = Math.PI * 0.5;
    dome.position.set(0, 1.05, -0.5);

    const crossPipeGeom = new THREE.CylinderGeometry(0.22, 0.22, 8.8, 10);
    const crossPipe = addSubsystemMesh('boiler', bg, crossPipeGeom, mats3d.bronze);
    crossPipe.rotation.z = Math.PI * 0.5;
    crossPipe.position.set(0, 0.35, 0.4);

    // Aft high-pressure steam line feeding the Kort propulsor
    const aftPipeGeom = new THREE.CylinderGeometry(0.20, 0.20, 12.2, 8);
    const aftPipe = addSubsystemMesh('boiler', bg, aftPipeGeom, mats3d.bronze);
    aftPipe.rotation.x = Math.PI * 0.5;
    aftPipe.position.set(0, -0.65, 6.4);

    // Twin raked brass smokestacks rising proudly amidships
    const stackGeom = new THREE.CylinderGeometry(0.46, 0.58, 6.8, 14);
    const crownGeom = new THREE.TorusGeometry(0.50, 0.10, 8, 16);
    for (const sz of [-1.85, 0.85]) {
      const stack = addSubsystemMesh('boiler', bg, stackGeom, mats3d.brass);
      stack.rotation.x = 0.11; // classic naval aft rake
      stack.position.set(0, 4.4, sz);

      const crown = addSubsystemMesh('boiler', bg, crownGeom, mats3d.ironDark);
      crown.rotation.x = Math.PI * 0.5 + 0.11;
      crown.position.set(0, 7.75, sz + 0.36);
    }

    addPickProxy('boiler', bg, 0, 0.9, -0.5, 3.0, 3.4, 4.2);
  }

  // 2) SUBSYSTEM: 'sponsons' — Twin Sidewheel Levitation Sponsons & Aether-Lift Rings
  const sponsonWheels = [];
  const sponsonLiftRings = [];
  {
    const sg = subsystemGroups.sponsons;
    const wheelRadius = 1.95;
    const spokeGeom = new THREE.BoxGeometry(0.85, 0.14, wheelRadius * 1.92);
    const rimGeom = new THREE.TorusGeometry(wheelRadius, 0.13, 8, 20);
    const liftOuterGeom = new THREE.TorusGeometry(2.15, 0.14, 8, 24);
    const liftInnerGeom = new THREE.TorusGeometry(1.35, 0.09, 8, 20);
    for (const sideSign of [-1, 1]) {
      const sx = sideSign * 4.75;
      // Outrigger armored paddlebox hood
      const hoodGeom = new THREE.CylinderGeometry(2.28, 2.28, 1.35, 14, 1, false, 0, Math.PI);
      const hood = addSubsystemMesh('sponsons', sg, hoodGeom, mats3d.mahogany);
      hood.rotation.z = Math.PI * 0.5;
      hood.rotation.y = Math.PI * 0.5;
      hood.position.set(sx, 0.15, 0.4);

      // Structural iron outrigger struts tying into hull
      const strutGeom = new THREE.BoxGeometry(1.9, 0.34, 4.8);
      const strut = addSubsystemMesh('sponsons', sg, strutGeom, mats3d.iron);
      strut.position.set(sideSign * 3.85, 0.25, 0.4);

      // Spinning radial brass paddlewheel
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(sx, -0.05, 0.4);
      sg.add(wheelGroup);

      const rimA = addSubsystemMesh('sponsons', wheelGroup, rimGeom, mats3d.brass);
      rimA.rotation.y = Math.PI * 0.5;
      rimA.position.x = -0.36;
      const rimB = addSubsystemMesh('sponsons', wheelGroup, rimGeom, mats3d.brass);
      rimB.rotation.y = Math.PI * 0.5;
      rimB.position.x = 0.36;

      for (let b = 0; b < 6; b++) {
        const blade = addSubsystemMesh('sponsons', wheelGroup, spokeGeom, mats3d.brassBright);
        blade.rotation.x = (b / 6) * Math.PI;
      }
      sponsonWheels.push(wheelGroup);

      // Glowing ventral aether-levitation rings beneath each sponson
      const liftGroup = new THREE.Group();
      liftGroup.position.set(sx, -2.05, 0.4);
      sg.add(liftGroup);

      const outerLift = addSubsystemMesh('sponsons', liftGroup, liftOuterGeom, mats3d.aetherCore, { keepGlowInCad: true });
      outerLift.rotation.x = Math.PI * 0.5;
      const innerLift = addSubsystemMesh('sponsons', liftGroup, liftInnerGeom, mats3d.aetherGlow, { keepGlowInCad: true });
      innerLift.rotation.x = Math.PI * 0.5;
      sponsonLiftRings.push(liftGroup);

      addPickProxy('sponsons', sg, sideSign * 5.05, -0.45, 0.6, 2.4, 3.6, 3.8);
    }
  }

  // 3) SUBSYSTEM: 'gunDeck' — 6 Port + 6 Starboard Brass Broadside Cannons + Aiming Fan Arcs
  const cannonsPort = [];
  const cannonsStarboard = [];
  {
    const gg = subsystemGroups.gunDeck;
    const carriageGeom = new THREE.BoxGeometry(0.95, 0.42, 0.68);
    const barrelGeom = new THREE.CylinderGeometry(0.13, 0.21, 1.95, 10);
    const muzzleGeom = new THREE.TorusGeometry(0.16, 0.05, 6, 10);
    const zPositions = [-6.0, -4.0, -2.0, 0.0, 2.0, 4.0];

    for (let i = 0; i < 6; i++) {
      const gz = zPositions[i];
      for (const sideSign of [-1, 1]) {
        const cannonUnit = new THREE.Group();
        const baseX = sideSign * 3.32;
        cannonUnit.position.set(baseX, 0.95, gz);
        gg.add(cannonUnit);

        const carriage = addSubsystemMesh('gunDeck', cannonUnit, carriageGeom, mats3d.mahoganyDark);
        carriage.position.set(-sideSign * 0.22, -0.14, 0);

        const barrel = addSubsystemMesh('gunDeck', cannonUnit, barrelGeom, mats3d.brass);
        barrel.rotation.z = -sideSign * Math.PI * 0.5;
        barrel.position.set(sideSign * 0.62, 0.05, 0);

        const muzzle = addSubsystemMesh('gunDeck', cannonUnit, muzzleGeom, mats3d.brassBright);
        muzzle.rotation.y = Math.PI * 0.5;
        muzzle.position.set(sideSign * 1.56, 0.05, 0);

        const entry = { group: cannonUnit, baseX, recoil: 0, sideSign, index: i };
        if (sideSign < 0) cannonsPort.push(entry);
        else cannonsStarboard.push(entry);
      }
    }

    addPickProxy('gunDeck', gg, -3.55, 0.95, -5.2, 1.8, 1.5, 3.2);
    addPickProxy('gunDeck', gg, -3.55, 0.95, 3.2, 1.8, 1.5, 3.0);
    addPickProxy('gunDeck', gg, 3.55, 0.95, -5.2, 1.8, 1.5, 3.2);
    addPickProxy('gunDeck', gg, 3.55, 0.95, 3.2, 1.8, 1.5, 3.0);
  }

  // Broadside Aiming Fan Arc Decals (Port & Starboard ±28° cones out to 210m range)
  // Attached to playerShipGroup (yaw-aligned, level with sea plane, non-raycastable)
  const aimArcGroup = new THREE.Group();
  aimArcGroup.name = 'BroadsideAimingArcs';
  aimArcGroup.position.set(0, -1.2, 0);
  playerShipGroup.add(aimArcGroup);

  const halfConeRad = (28 * Math.PI) / 180;
  const portFanFillMat = new THREE.MeshBasicMaterial({
    color: PALETTE.mode3d.amber,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const portFanLineMat = new THREE.LineBasicMaterial({
    color: PALETTE.mode3d.amber,
    transparent: true,
    opacity: 0.48,
  });
  const stbdFanFillMat = new THREE.MeshBasicMaterial({
    color: PALETTE.mode3d.amber,
    transparent: true,
    opacity: 0.09,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const stbdFanLineMat = new THREE.LineBasicMaterial({
    color: PALETTE.mode3d.amber,
    transparent: true,
    opacity: 0.48,
  });
  {
    const portFill = new THREE.Mesh(
      buildBroadsideFanGeometry(THREE, 6.5, 215, halfConeRad, -1),
      portFanFillMat
    );
    const portLines = new THREE.LineSegments(
      buildBroadsideFanLinesGeometry(THREE, 6.5, 215, halfConeRad, -1),
      portFanLineMat
    );
    const stbdFill = new THREE.Mesh(
      buildBroadsideFanGeometry(THREE, 6.5, 215, halfConeRad, 1),
      stbdFanFillMat
    );
    const stbdLines = new THREE.LineSegments(
      buildBroadsideFanLinesGeometry(THREE, 6.5, 215, halfConeRad, 1),
      stbdFanLineMat
    );
    portFill.raycast = () => {};
    portLines.raycast = () => {};
    stbdFill.raycast = () => {};
    stbdLines.raycast = () => {};
    aimArcGroup.add(portFill, portLines, stbdFill, stbdLines);
  }

  // 4) SUBSYSTEM: 'rigging' — Fore, Main & Mizzen Square-Rigged Masts & Trimming Yards
  const yardPivots = [];
  const sailMeshes = [];
  let pennantMesh = null;
  {
    const rg = subsystemGroups.rigging;
    const mastDefs = [
      {
        name: 'Fore',
        z: -7.5,
        baseY: 2.1,
        height: 15.8,
        yards: [
          { y: 7.4, width: 8.6, sailH: 4.3, camber: 1.05 },
          { y: 12.6, width: 6.8, sailH: 3.7, camber: 0.88 },
        ],
      },
      {
        name: 'Main',
        z: -0.3,
        baseY: 1.4,
        height: 19.6,
        yards: [
          { y: 7.8, width: 10.4, sailH: 4.9, camber: 1.25 },
          { y: 13.4, width: 8.4, sailH: 4.2, camber: 1.02 },
          { y: 18.0, width: 6.1, sailH: 3.2, camber: 0.76 },
        ],
      },
      {
        name: 'Mizzen',
        z: 7.2,
        baseY: 2.6,
        height: 14.6,
        yards: [
          { y: 8.2, width: 7.4, sailH: 3.9, camber: 0.92 },
          { y: 12.9, width: 5.6, sailH: 3.1, camber: 0.72 },
        ],
      },
    ];

    const shroudPts = [];
    for (const m of mastDefs) {
      const mastGeom = new THREE.CylinderGeometry(0.14, 0.34, m.height, 10);
      const mast = addSubsystemMesh('rigging', rg, mastGeom, mats3d.mahoganyDark);
      mast.position.set(0, m.baseY + m.height * 0.5, m.z);

      // Fighting top / crow's nest platform
      const topPlatformGeom = new THREE.CylinderGeometry(0.95, 0.72, 0.32, 10);
      const topPlatform = addSubsystemMesh('rigging', rg, topPlatformGeom, mats3d.mahogany);
      topPlatform.position.set(0, m.baseY + m.height * 0.56, m.z);

      // Standing shrouds to Port & Starboard chainplates
      const topY = m.baseY + m.height * 0.56;
      shroudPts.push(
        -3.4, 1.5, m.z - 0.8, 0, topY, m.z,
        -3.4, 1.5, m.z + 0.8, 0, topY, m.z,
        3.4, 1.5, m.z - 0.8, 0, topY, m.z,
        3.4, 1.5, m.z + 0.8, 0, topY, m.z
      );

      for (const yd of m.yards) {
        const pivot = new THREE.Group();
        pivot.position.set(0, yd.y, m.z - 0.24);
        rg.add(pivot);

        const sparGeom = new THREE.CylinderGeometry(0.08, 0.13, yd.width * 1.08, 8);
        const spar = addSubsystemMesh('rigging', pivot, sparGeom, mats3d.mahoganyDark);
        spar.rotation.z = Math.PI * 0.5;

        const sailGeom = buildSquareSailGeometry(THREE, yd.width, yd.sailH, yd.camber, 10, 6);
        const sail = addSubsystemMesh('rigging', pivot, sailGeom, mats3d.sail, { edgeThreshold: 32 });
        sailMeshes.push(sail);
        yardPivots.push(pivot);
      }
    }

    // Forestays & backstays tying bowsprit <-> fore <-> main <-> mizzen
    shroudPts.push(
      0, 3.8, -17.8, 0, 16.5, -7.5,
      0, 16.5, -7.5, 0, 19.8, -0.3,
      0, 19.8, -0.3, 0, 16.2, 7.2,
      0, 16.2, 7.2, 0, 3.9, 12.4
    );
    const shroudLines = new THREE.LineSegments(makeBufferGeom(THREE, shroudPts, null), mats3d.riggingRope);
    shroudLines.raycast = () => {};
    rg.add(shroudLines);

    // Mainmast truck Admiralty Aether Pennant
    const pennantGeom = new THREE.PlaneGeometry(3.6, 0.55, 6, 1);
    pennantMesh = addSubsystemMesh('rigging', rg, pennantGeom, mats3d.aetherCore, { keepGlowInCad: true });
    pennantMesh.position.set(0, 21.15, 1.55);
    pennantMesh.rotation.y = Math.PI * 0.5;

    addPickProxy('rigging', rg, 0, 13.2, -7.5, 6.8, 6.8, 2.8);
    addPickProxy('rigging', rg, 0, 14.2, -0.3, 8.2, 8.0, 3.0);
    addPickProxy('rigging', rg, 0, 12.8, 7.2, 5.8, 6.4, 2.8);
  }

  // 5) SUBSYSTEM: 'propulsor' — Shrouded Stern Kort Propulsor, Impeller & Rudders
  let propulsorImpeller = null;
  let propulsorWakeCone = null;
  const sternRudders = [];
  {
    const pg = subsystemGroups.propulsor;
    const pz = 13.05;
    const py = -1.25;

    // Riveted brass Kort nozzle shroud ring (open-ended cylinder + beveled torus lips)
    const shroudCylGeom = new THREE.CylinderGeometry(1.58, 1.48, 1.95, 18, 1, true);
    const shroudCyl = addSubsystemMesh('propulsor', pg, shroudCylGeom, mats3d.brass);
    shroudCyl.rotation.x = Math.PI * 0.5;
    shroudCyl.position.set(0, py, pz);

    const lipGeom = new THREE.TorusGeometry(1.56, 0.14, 8, 20);
    const foreLip = addSubsystemMesh('propulsor', pg, lipGeom, mats3d.brassBright);
    foreLip.position.set(0, py, pz - 0.95);
    const aftLip = addSubsystemMesh('propulsor', pg, lipGeom, mats3d.brassBright);
    aftLip.position.set(0, py, pz + 0.95);

    // Mounting strut from stern counter
    const mountGeom = new THREE.BoxGeometry(0.45, 2.2, 1.2);
    const mount = addSubsystemMesh('propulsor', pg, mountGeom, mats3d.iron);
    mount.position.set(0, py + 1.45, pz - 0.1);

    // Spinning 6-blade skewed brass impeller
    propulsorImpeller = new THREE.Group();
    propulsorImpeller.position.set(0, py, pz);
    pg.add(propulsorImpeller);

    const hubGeom = new THREE.CylinderGeometry(0.32, 0.42, 1.5, 10);
    const hub = addSubsystemMesh('propulsor', propulsorImpeller, hubGeom, mats3d.brass);
    hub.rotation.x = Math.PI * 0.5;

    const bladeGeom = new THREE.BoxGeometry(0.16, 1.32, 0.46);
    for (let b = 0; b < 6; b++) {
      const bladePivot = new THREE.Group();
      bladePivot.rotation.z = (b / 6) * Math.PI * 2;
      const blade = addSubsystemMesh('propulsor', bladePivot, bladeGeom, mats3d.brassBright);
      blade.position.y = 0.72;
      blade.rotation.y = 0.52; // hydro/aether pitch angle
      propulsorImpeller.add(bladePivot);
    }

    // Twin balanced brass rudders aft of Kort shroud
    const rudderGeom = new THREE.BoxGeometry(0.14, 2.05, 1.25);
    for (const rx of [-1.05, 1.05]) {
      const rudderPivot = new THREE.Group();
      rudderPivot.position.set(rx, py + 0.1, pz + 1.25);
      const rudder = addSubsystemMesh('propulsor', rudderPivot, rudderGeom, mats3d.bronze);
      rudder.position.z = 0.58;
      pg.add(rudderPivot);
      sternRudders.push(rudderPivot);
    }

    // Glowing emerald Aether Exhaust Wake Cone
    const wakeGeom = new THREE.ConeGeometry(1.32, 6.8, 14, 1, true);
    propulsorWakeCone = new THREE.Mesh(wakeGeom, mats3d.aetherGlow);
    propulsorWakeCone.rotation.x = Math.PI * 0.5;
    propulsorWakeCone.position.set(0, py, pz + 4.3);
    propulsorWakeCone.raycast = () => {};
    pg.add(propulsorWakeCone);

    addPickProxy('propulsor', pg, 0, py, pz + 0.3, 3.8, 3.8, 4.2);
  }

  // --- 3C. SUBSYSTEM AFFLICTION PLUMES (Fire, Steam Leak & Engineer Crew Repair Ring) ---
  const afflictionRigs = {};
  const sharedFireMat = new THREE.MeshBasicMaterial({
    color: 0xff6b2b,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const sharedFlameCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffe26a,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const sharedSmokeMat = new THREE.MeshBasicMaterial({
    color: 0x26262b,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const sharedSteamJetMat = new THREE.MeshBasicMaterial({
    color: 0xdffbf4,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sharedRepairRingMat = new THREE.MeshBasicMaterial({
    color: PALETTE.cadDark.repairBlue,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  {
    const coneGeom = new THREE.ConeGeometry(0.55, 2.2, 7);
    const puffGeom = new THREE.SphereGeometry(0.62, 7, 6);
    const ringGeom = new THREE.TorusGeometry(1.75, 0.08, 6, 24);

    for (const id of SUBSYSTEM_IDS) {
      const anchor = subsystemLocalAnchors[id];
      const rig = new THREE.Group();
      rig.position.copy(anchor);
      rig.raycast = () => {};
      shipBody.add(rig);

      const fireGroup = new THREE.Group();
      fireGroup.visible = false;
      const tongues = [];
      for (let t = 0; t < 4; t++) {
        const m = new THREE.Mesh(coneGeom, t === 0 ? sharedFlameCoreMat : sharedFireMat);
        m.position.set((t - 1.5) * 0.38, 0.6, (t % 2 === 0 ? 0.25 : -0.25));
        m.raycast = () => {};
        fireGroup.add(m);
        tongues.push(m);
      }
      const smokePuffs = [];
      for (let s = 0; s < 3; s++) {
        const sm = new THREE.Mesh(puffGeom, sharedSmokeMat);
        sm.position.set(0, 1.8 + s * 0.9, 0);
        sm.raycast = () => {};
        fireGroup.add(sm);
        smokePuffs.push(sm);
      }
      rig.add(fireGroup);

      const steamGroup = new THREE.Group();
      steamGroup.visible = false;
      const jets = [];
      for (let j = 0; j < 2; j++) {
        const jet = new THREE.Mesh(coneGeom, sharedSteamJetMat);
        jet.rotation.z = (j === 0 ? -1 : 1) * 0.85;
        jet.scale.set(0.7, 1.5, 0.7);
        jet.raycast = () => {};
        steamGroup.add(jet);
        jets.push(jet);
      }
      rig.add(steamGroup);

      const repairGroup = new THREE.Group();
      repairGroup.visible = false;
      const repairRing = new THREE.Mesh(ringGeom, sharedRepairRingMat);
      repairRing.rotation.x = Math.PI * 0.5;
      repairRing.raycast = () => {};
      repairGroup.add(repairRing);
      rig.add(repairGroup);

      afflictionRigs[id] = { rig, fireGroup, tongues, smokePuffs, steamGroup, jets, repairGroup, repairRing };
    }
  }

  // ==========================================================================
  // 4. ENEMY FLEET ('cutter', 'frigate', 'ironclad')
  // ==========================================================================
  const enemyFleetGroup = new THREE.Group();
  enemyFleetGroup.name = 'EnemyFleet';
  group.add(enemyFleetGroup);

  const enemyMaterials3d = {
    hullSlate: new THREE.MeshStandardMaterial({
      color: 0x262c38,
      roughness: 0.58,
      metalness: 0.36,
      side: THREE.DoubleSide,
    }),
    hullArmor: new THREE.MeshStandardMaterial({
      color: 0x1d222b,
      roughness: 0.42,
      metalness: 0.74,
      side: THREE.DoubleSide,
    }),
    crimson: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.crimsonTrim,
      roughness: 0.5,
      metalness: 0.25,
    }),
    sailDark: new THREE.MeshStandardMaterial({
      color: PALETTE.mode3d.enemySail,
      roughness: 0.86,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
    hostileGlow: new THREE.MeshStandardMaterial({
      color: 0xff5a36,
      emissive: 0xff3b1f,
      emissiveIntensity: 1.75,
      roughness: 0.2,
      metalness: 0.1,
    }),
    chainCrippleMat: new THREE.MeshBasicMaterial({
      color: 0x6b9bff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  };

  const enemyCadFillMat = new THREE.MeshBasicMaterial({
    color: PALETTE.cadDark.enemyFill,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const enemyCadEdgeMat = new THREE.LineBasicMaterial({
    color: PALETTE.cadDark.enemyEdge,
    transparent: true,
    opacity: 0.94,
  });

  function buildEnemyMeshRecord(kindRaw) {
    const kind = (kindRaw === 'frigate' || kindRaw === 'ironclad') ? kindRaw : 'cutter';
    const root = new THREE.Group();
    root.name = `Enemy_${kind}`;
    if (root.rotation) root.rotation.order = 'YXZ';

    const body = new THREE.Group();
    root.add(body);
    const dualList = [];
    const spinners = [];

    function addEnemyPart(parent, geom, mat3d, threshold = 22) {
      const m = new THREE.Mesh(geom, viewMode === 'cad' ? enemyCadFillMat : mat3d);
      const e = createEdgeOverlay(THREE, geom, enemyCadEdgeMat, threshold);
      e.visible = viewMode === 'cad';
      m.add(e);
      parent.add(m);
      dualList.push({ mesh: m, mat3d, edges: e });
      return m;
    }

    if (kind === 'cutter') {
      // Scout Cutter: nimble 17m corsair brig with twin raked masts & compact lift pods
      const hull = buildLoftedHullGeometry(THREE, {
        length: 17.2, beam: 4.7, depth: 3.1, sheerBow: 1.1, sheerStern: 1.4, tumblehome: 0.1,
      });
      addEnemyPart(body, hull, enemyMaterials3d.hullSlate);
      const stripe = addEnemyPart(body, new THREE.BoxGeometry(4.85, 0.22, 13.5), enemyMaterials3d.crimson);
      stripe.position.set(0, 0.75, 0);

      for (const mz of [-3.6, 3.2]) {
        const mast = addEnemyPart(body, new THREE.CylinderGeometry(0.10, 0.22, 11.5, 8), mats3d.mahoganyDark);
        mast.rotation.x = 0.09;
        mast.position.set(0, 6.6, mz);
        const sail = addEnemyPart(body, buildSquareSailGeometry(THREE, 6.2, 3.8, 0.85, 8, 5), enemyMaterials3d.sailDark, 32);
        sail.position.set(0, 10.6, mz - 0.15);
      }
      // Outrigger lift rotors
      for (const sx of [-3.2, 3.2]) {
        const pod = addEnemyPart(body, new THREE.TorusGeometry(1.15, 0.12, 6, 16), mats3d.brass);
        pod.rotation.x = Math.PI * 0.5;
        pod.position.set(sx, -0.6, 0.4);
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.14, 10), enemyMaterials3d.hostileGlow);
        core.position.set(sx, -0.6, 0.4);
        body.add(core);
      }
      // 3 swivel guns per side
      const gunGeom = new THREE.CylinderGeometry(0.09, 0.14, 1.35, 8);
      for (const gz of [-2.4, 0, 2.4]) {
        for (const s of [-1, 1]) {
          const g = addEnemyPart(body, gunGeom, mats3d.brass);
          g.rotation.z = -s * Math.PI * 0.5;
          g.position.set(s * 2.55, 0.95, gz);
        }
      }
    } else if (kind === 'frigate') {
      // Mortar Frigate: 24.5m twin-funnel bombard cruiser with armored mortar dome
      const hull = buildLoftedHullGeometry(THREE, {
        length: 24.5, beam: 6.8, depth: 4.3, sheerBow: 1.3, sheerStern: 1.85, tumblehome: 0.14,
      });
      addEnemyPart(body, hull, enemyMaterials3d.hullSlate);
      const belt = addEnemyPart(body, new THREE.BoxGeometry(7.0, 0.55, 19.5), enemyMaterials3d.hullArmor);
      belt.position.set(0, 0.35, 0.2);

      // Central Brass Bombard Mortar Dome
      const dome = addEnemyPart(body, new THREE.SphereGeometry(1.85, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mats3d.bronze);
      dome.position.set(0, 1.35, -3.2);
      const mortarTube = addEnemyPart(body, new THREE.CylinderGeometry(0.46, 0.62, 2.2, 10), mats3d.brass);
      mortarTube.rotation.x = -0.58;
      mortarTube.position.set(0, 2.55, -3.7);

      // Twin belching black-iron funnels
      for (const fz of [-0.2, 2.4]) {
        const funnel = addEnemyPart(body, new THREE.CylinderGeometry(0.48, 0.62, 6.2, 12), enemyMaterials3d.hullArmor);
        funnel.rotation.x = 0.12;
        funnel.position.set(0, 4.1, fz);
        const band = addEnemyPart(body, new THREE.CylinderGeometry(0.51, 0.53, 0.55, 12), enemyMaterials3d.crimson);
        band.rotation.x = 0.12;
        band.position.set(0, 6.2, fz + 0.25);
      }

      // Fore & Mizzen masts
      for (const mz of [-7.2, 7.0]) {
        const mast = addEnemyPart(body, new THREE.CylinderGeometry(0.12, 0.26, 13.8, 8), mats3d.mahoganyDark);
        mast.position.set(0, 8.0, mz);
        const sail = addEnemyPart(body, buildSquareSailGeometry(THREE, 7.6, 4.1, 0.95, 8, 5), enemyMaterials3d.sailDark, 32);
        sail.position.set(0, 12.6, mz - 0.2);
      }

      // Heavy paddle-sponsons + 5 broadside guns per side
      for (const s of [-1, 1]) {
        const wheel = new THREE.Group();
        wheel.position.set(s * 4.35, -0.1, 1.0);
        const wRim = addEnemyPart(wheel, new THREE.TorusGeometry(1.65, 0.16, 6, 16), mats3d.iron);
        wRim.rotation.y = Math.PI * 0.5;
        body.add(wheel);
        spinners.push({ obj: wheel, axis: 'x', speed: 4.2 });

        for (let gi = -2; gi <= 2; gi++) {
          const g = addEnemyPart(body, new THREE.CylinderGeometry(0.11, 0.18, 1.7, 8), mats3d.brass);
          g.rotation.z = -s * Math.PI * 0.5;
          g.position.set(s * 3.55, 0.9, gi * 2.1);
        }
      }
    } else {
      // Admiral Dreadnought Ironclad ("HMS Leviathan"): 37m armored flagship
      const hull = buildLoftedHullGeometry(THREE, {
        length: 37.0, beam: 10.2, depth: 5.8, sheerBow: 1.6, sheerStern: 2.1, tumblehome: 0.22, ramBow: true,
      });
      addEnemyPart(body, hull, enemyMaterials3d.hullArmor);

      // Sloped riveted Krupp-iron armor casemate citadel
      const casemate = addEnemyPart(body, new THREE.CylinderGeometry(3.8, 5.1, 3.2, 8), enemyMaterials3d.hullSlate);
      casemate.scale.set(0.92, 1.0, 2.35);
      casemate.position.set(0, 2.6, 0.4);

      // Armored conning bridge & glowing crimson furnace visor
      const bridge = addEnemyPart(body, new THREE.BoxGeometry(4.6, 2.2, 3.6), enemyMaterials3d.hullArmor);
      bridge.position.set(0, 4.9, -4.6);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.36, 0.2), enemyMaterials3d.hostileGlow);
      visor.position.set(0, 5.2, -6.45);
      body.add(visor);

      // Triple towering smokestacks with crimson Admiralty stripes
      for (const fz of [-1.8, 1.4, 4.6]) {
        const stack = addEnemyPart(body, new THREE.CylinderGeometry(0.68, 0.86, 8.4, 12), enemyMaterials3d.hullArmor);
        stack.rotation.x = 0.1;
        stack.position.set(0, 6.8, fz);
        const stripe = addEnemyPart(body, new THREE.CylinderGeometry(0.71, 0.74, 0.85, 12), enemyMaterials3d.crimson);
        stripe.rotation.x = 0.1;
        stripe.position.set(0, 9.6, fz + 0.28);
      }

      // Quad heavy levitation turbine pods + 8 broadside cannon barrels per side
      for (const s of [-1, 1]) {
        for (const pz of [-6.8, 7.2]) {
          const podRing = addEnemyPart(body, new THREE.TorusGeometry(2.1, 0.22, 8, 20), mats3d.brass);
          podRing.rotation.x = Math.PI * 0.5;
          podRing.position.set(s * 6.1, -1.2, pz);
          const rotor = new THREE.Group();
          rotor.position.set(s * 6.1, -1.2, pz);
          const bar = addEnemyPart(rotor, new THREE.BoxGeometry(3.8, 0.16, 0.42), mats3d.brassBright);
          void bar;
          body.add(rotor);
          spinners.push({ obj: rotor, axis: 'y', speed: 7.5 * s });
        }
        for (let gi = 0; gi < 8; gi++) {
          const gz = -8.4 + gi * 2.4;
          const g = addEnemyPart(body, new THREE.CylinderGeometry(0.14, 0.24, 2.25, 8), mats3d.brass);
          g.rotation.z = -s * Math.PI * 0.5;
          g.position.set(s * 5.0, 2.1, gz);
        }
      }
    }

    // Enemy status FX: fire plume + chainshot cripple ring + floating HP bar
    const fireRing = new THREE.Group();
    fireRing.visible = false;
    for (let f = 0; f < 3; f++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.9, 7), f === 0 ? sharedFlameCoreMat : sharedFireMat);
      flame.position.set((f - 1) * 0.9, 2.8, (f - 1) * 1.4);
      fireRing.add(flame);
    }
    body.add(fireRing);

    const crippleRing = new THREE.Mesh(
      new THREE.TorusGeometry(kind === 'ironclad' ? 7.8 : 4.8, 0.14, 6, 24),
      enemyMaterials3d.chainCrippleMat
    );
    crippleRing.rotation.x = Math.PI * 0.5;
    crippleRing.position.y = 0.6;
    crippleRing.visible = false;
    body.add(crippleRing);

    // Crisp world-space HP bar above enemy masthead
    const hpHeight = kind === 'ironclad' ? 14.5 : (kind === 'frigate' ? 16.5 : 14.0);
    const hpWidth = kind === 'ironclad' ? 9.0 : 5.6;
    const hpBarGroup = new THREE.Group();
    hpBarGroup.position.set(0, hpHeight, 0);
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(hpWidth, 0.55),
      new THREE.MeshBasicMaterial({ color: 0x0d0f14, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
    );
    const hpFillMat = new THREE.MeshBasicMaterial({ color: 0xff5c5c, side: THREE.DoubleSide });
    const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(hpWidth - 0.2, 0.36), hpFillMat);
    hpFill.position.z = 0.03;
    hpBarGroup.add(hpBg, hpFill);
    root.add(hpBarGroup);

    enemyFleetGroup.add(root);
    return {
      kind,
      root,
      body,
      dualList,
      spinners,
      fireRing,
      crippleRing,
      hpBarGroup,
      hpFill,
      hpFillMat,
      prevX: NaN,
      prevZ: NaN,
      lastYaw: 0,
    };
  }

  const activeEnemies = new Map(); // id -> enemyRecord

  function applyEnemyMaterialMode(rec) {
    const isCad = viewMode === 'cad';
    for (const item of rec.dualList) {
      item.mesh.material = isCad ? enemyCadFillMat : item.mat3d;
      item.edges.visible = isCad;
    }
  }

  // ==========================================================================
  // 5. ORDNANCE PROJECTILE POOL (roundshot, chainshot, aethershell, enemy)
  // ==========================================================================
  const projectileGroup = new THREE.Group();
  projectileGroup.name = 'BroadsideProjectiles';
  group.add(projectileGroup);

  const projSharedGeoms = {
    ball: new THREE.SphereGeometry(0.42, 8, 8),
    chainBall: new THREE.SphereGeometry(0.32, 7, 7),
    chainLink: new THREE.BoxGeometry(2.1, 0.11, 0.14),
    aetherOrb: typeof THREE.OctahedronGeometry === 'function'
      ? new THREE.OctahedronGeometry(0.52, 1)
      : new THREE.SphereGeometry(0.52, 8, 8),
    aetherRing: new THREE.TorusGeometry(0.72, 0.07, 6, 14),
    trailCone: new THREE.ConeGeometry(0.34, 4.6, 7),
  };

  const projMats = {
    roundshot: new THREE.MeshBasicMaterial({ color: 0xffcf6e }),
    roundTrail: new THREE.MeshBasicMaterial({ color: 0xff8c38, transparent: true, opacity: 0.62, depthWrite: false }),
    chainIron: new THREE.MeshStandardMaterial({ color: 0x8ea4c8, metalness: 0.8, roughness: 0.25, emissive: 0x26467a }),
    chainTrail: new THREE.MeshBasicMaterial({ color: 0x6b9bff, transparent: true, opacity: 0.55, depthWrite: false }),
    aetherCore: new THREE.MeshBasicMaterial({ color: 0x67ffcf }),
    aetherTrail: new THREE.MeshBasicMaterial({ color: 0x38d9a9, transparent: true, opacity: 0.68, depthWrite: false }),
    enemyCore: new THREE.MeshBasicMaterial({ color: 0xff6b4a }),
    enemyTrail: new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.60, depthWrite: false }),
  };

  const projectilePool = [];

  function acquireProjectileVisual(index) {
    while (projectilePool.length <= index) {
      const root = new THREE.Group();
      root.visible = false;

      // Sub-variants toggled by ammoType
      const roundNode = new THREE.Mesh(projSharedGeoms.ball, projMats.roundshot);

      const chainNode = new THREE.Group();
      const cb1 = new THREE.Mesh(projSharedGeoms.chainBall, projMats.chainIron);
      cb1.position.x = -1.05;
      const cb2 = new THREE.Mesh(projSharedGeoms.chainBall, projMats.chainIron);
      cb2.position.x = 1.05;
      const cLink = new THREE.Mesh(projSharedGeoms.chainLink, projMats.chainIron);
      chainNode.add(cb1, cb2, cLink);

      const aetherNode = new THREE.Group();
      const aOrb = new THREE.Mesh(projSharedGeoms.aetherOrb, projMats.aetherCore);
      const aRing = new THREE.Mesh(projSharedGeoms.aetherRing, mats3d.brassBright);
      aetherNode.add(aOrb, aRing);

      const enemyNode = new THREE.Mesh(projSharedGeoms.ball, projMats.enemyCore);
      enemyNode.scale.setScalar(1.15);

      const trail = new THREE.Mesh(projSharedGeoms.trailCone, projMats.roundTrail);
      trail.rotation.x = -Math.PI * 0.5;
      trail.position.z = 2.4; // trails behind -Z forward direction

      root.add(roundNode, chainNode, aetherNode, enemyNode, trail);
      projectileGroup.add(root);
      projectilePool.push({ root, roundNode, chainNode, aetherNode, aRing, enemyNode, trail });
    }
    return projectilePool[index];
  }

  // ==========================================================================
  // 6. MUZZLE-FLASH VOLLEY & IMPACT / SINK / VENT VFX POOLS
  // ==========================================================================
  const vfxGroup = new THREE.Group();
  vfxGroup.name = 'BroadsideVFX';
  group.add(vfxGroup);

  const vfxParticles = [];
  const MAX_VFX_PARTICLES = 180;
  const vfxSphereGeom = new THREE.SphereGeometry(0.65, 7, 6);
  const vfxShardGeom = new THREE.BoxGeometry(0.28, 0.18, 0.95);
  const vfxRingGeom = new THREE.TorusGeometry(1.0, 0.11, 6, 20);

  for (let i = 0; i < MAX_VFX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geom = i % 5 === 0 ? vfxRingGeom : (i % 3 === 0 ? vfxShardGeom : vfxSphereGeom);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.raycast = () => {};
    vfxGroup.add(mesh);
    vfxParticles.push({
      mesh,
      mat,
      isRing: i % 5 === 0,
      isShard: i % 3 === 0 && i % 5 !== 0,
      active: false,
      age: 0,
      life: 0.6,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      drag: 1.0,
      startScale: 1,
      endScale: 2,
      startOpacity: 0.9,
      spinX: 0,
      spinY: 0,
    });
  }

  let vfxCursor = 0;
  const vfxRng = makeRng(9081889);

  function spawnParticle({
    x, y, z, vx = 0, vy = 0, vz = 0,
    color = 0xffb347, life = 0.65, startScale = 0.8, endScale = 2.4,
    startOpacity = 0.9, gravity = 0, drag = 1.8, preferRing = false, preferShard = false,
  }) {
    let chosen = null;
    for (let attempt = 0; attempt < MAX_VFX_PARTICLES; attempt++) {
      const idx = (vfxCursor + attempt) % MAX_VFX_PARTICLES;
      const p = vfxParticles[idx];
      if (preferRing && !p.isRing) continue;
      if (preferShard && !p.isShard) continue;
      if (!preferRing && !preferShard && (p.isRing || p.isShard)) continue;
      if (!p.active) {
        chosen = p;
        vfxCursor = (idx + 1) % MAX_VFX_PARTICLES;
        break;
      }
    }
    if (!chosen) {
      chosen = vfxParticles[vfxCursor];
      vfxCursor = (vfxCursor + 1) % MAX_VFX_PARTICLES;
    }

    chosen.active = true;
    chosen.age = 0;
    chosen.life = Math.max(0.08, finiteOr(life, 0.5));
    chosen.vx = finiteOr(vx, 0);
    chosen.vy = finiteOr(vy, 0);
    chosen.vz = finiteOr(vz, 0);
    chosen.gravity = finiteOr(gravity, 0);
    chosen.drag = finiteOr(drag, 1.5);
    chosen.startScale = Math.max(0.05, finiteOr(startScale, 0.8));
    chosen.endScale = Math.max(0.05, finiteOr(endScale, 2.0));
    chosen.startOpacity = clamp(finiteOr(startOpacity, 0.9), 0.05, 1.0);
    chosen.spinX = (vfxRng() - 0.5) * 8;
    chosen.spinY = (vfxRng() - 0.5) * 8;

    chosen.mat.color.setHex(color);
    chosen.mat.opacity = chosen.startOpacity;
    chosen.mesh.position.set(finiteOr(x, 0), finiteOr(y, 0), finiteOr(z, 0));
    if (chosen.isRing) {
      chosen.mesh.rotation.set(Math.PI * 0.5, 0, 0);
    } else {
      chosen.mesh.rotation.set(vfxRng() * 3, vfxRng() * 3, 0);
    }
    chosen.mesh.scale.setScalar(chosen.startScale);
    chosen.mesh.visible = true;
  }

  // Heading convention matches systems.js 1:1 from frame 0:
  // heading = 0 faces -Z (bow), +X is Starboard, -X is Port, +Z is Stern (yaw = heading).
  // Also auto-adapts if external callers pass custom vx/vz conventions.
  let headingConvention = 'posYaw'; // 'posYaw' | 'negYaw' | 'cosSin' | 'sinCos'

  function headingToForwardXZ(h) {
    const rad = finiteOr(h, 0);
    switch (headingConvention) {
      case 'negYaw':
        return { fx: Math.sin(rad), fz: -Math.cos(rad) };
      case 'cosSin':
        return { fx: Math.cos(rad), fz: Math.sin(rad) };
      case 'sinCos':
        return { fx: Math.sin(rad), fz: Math.cos(rad) };
      case 'posYaw':
      default:
        return { fx: -Math.sin(rad), fz: -Math.cos(rad) };
    }
  }

  function calibrateHeadingConvention(h, dx, dz) {
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(h) || len < 0.02) return;
    const ux = dx / len;
    const uz = dz / len;
    const candidates = [
      { id: 'negYaw', fx: Math.sin(h), fz: -Math.cos(h) },
      { id: 'posYaw', fx: -Math.sin(h), fz: -Math.cos(h) },
      { id: 'cosSin', fx: Math.cos(h), fz: Math.sin(h) },
      { id: 'sinCos', fx: Math.sin(h), fz: Math.cos(h) },
    ];
    let best = candidates[0];
    let bestDot = -2;
    for (const c of candidates) {
      const dot = c.fx * ux + c.fz * uz;
      if (dot > bestDot) {
        bestDot = dot;
        best = c;
      }
    }
    if (bestDot > 0.82) {
      headingConvention = best.id;
    }
  }

  function forwardToThreeYaw(fx, fz) {
    // Ship bow is local -Z: rotated by yaw around +Y, local (0,0,-1) -> (-sin(yaw), 0, -cos(yaw))
    if (!Number.isFinite(fx) || !Number.isFinite(fz) || (Math.abs(fx) < 1e-6 && Math.abs(fz) < 1e-6)) {
      return 0;
    }
    return Math.atan2(-fx, -fz);
  }

  function headingToThreeYaw(heading, vx = NaN, vz = NaN) {
    if (Number.isFinite(vx) && Number.isFinite(vz) && Math.hypot(vx, vz) > 0.08) {
      calibrateHeadingConvention(heading, vx, vz);
      return forwardToThreeYaw(vx, vz);
    }
    const { fx, fz } = headingToForwardXZ(heading);
    return forwardToThreeYaw(fx, fz);
  }

  // Public VFX Triggers
  function triggerMuzzleVolley(origin, heading = 0, side = 'port', count = 6, ammoType = 'roundshot') {
    const ox = finiteOr(origin?.x, playerShipGroup.position.x);
    const oy = finiteOr(origin?.y, playerShipGroup.position.y) + 0.95;
    const oz = finiteOr(origin?.z, playerShipGroup.position.z);

    const yaw = headingToThreeYaw(heading);
    // Local forward (-Z) = (-sin(yaw), -cos(yaw)), local starboard (+X) = (cos(yaw), -sin(yaw))
    const stbdX = Math.cos(yaw);
    const stbdZ = -Math.sin(yaw);
    const aftX = Math.sin(yaw);
    const aftZ = Math.cos(yaw);

    const sideSign = side === 'port' ? -1 : 1;
    const gunCount = clamp(Math.round(finiteOr(count, 6)), 1, 8);
    const flashColor = ammoType === 'aethershell'
      ? 0x38d9a9
      : (ammoType === 'chainshot' ? 0x8cb8ff : 0xffbe55);

    // Trigger barrel recoil on player galleon if volley originated near player ship
    const distToPlayer = Math.hypot(ox - playerShipGroup.position.x, oz - playerShipGroup.position.z);
    if (distToPlayer < 9.0) {
      const bank = sideSign < 0 ? cannonsPort : cannonsStarboard;
      for (let i = 0; i < Math.min(gunCount, bank.length); i++) {
        bank[i].recoil = 1.0;
      }
    }

    for (let i = 0; i < gunCount; i++) {
      const alongZ = (i - (gunCount - 1) * 0.5) * 2.0;
      const mx = ox + stbdX * (sideSign * 4.5) + aftX * alongZ;
      const mz = oz + stbdZ * (sideSign * 4.5) + aftZ * alongZ;
      const outVx = stbdX * sideSign * (18 + vfxRng() * 10);
      const outVz = stbdZ * sideSign * (18 + vfxRng() * 10);

      // Muzzle flash burst
      spawnParticle({
        x: mx, y: oy, z: mz,
        vx: outVx * 0.65, vy: (vfxRng() - 0.3) * 2.5, vz: outVz * 0.65,
        color: flashColor, life: 0.24 + vfxRng() * 0.1,
        startScale: 0.75, endScale: 2.3, startOpacity: 0.95, drag: 5.5,
      });

      // Rolling gunsmoke puff
      spawnParticle({
        x: mx + stbdX * sideSign * 0.8, y: oy + 0.2, z: mz + stbdZ * sideSign * 0.8,
        vx: outVx * 0.32, vy: 2.2 + vfxRng() * 2.0, vz: outVz * 0.32,
        color: viewMode === 'cad' ? (cadTheme === 'light' ? 0x8c8c94 : 0x55555e) : 0xb8bec9,
        life: 0.95 + vfxRng() * 0.45,
        startScale: 0.65, endScale: 3.6, startOpacity: 0.52, drag: 2.2,
      });
    }
  }

  function triggerImpactVfx(position, kind = 'hit') {
    const px = finiteOr(position?.x, playerShipGroup.position.x);
    const py = finiteOr(position?.y, playerShipGroup.position.y) + 0.8;
    const pz = finiteOr(position?.z, playerShipGroup.position.z);

    if (kind === 'vent') {
      // 360-degree pressurized emerald-white relief steam nova
      spawnParticle({
        x: px, y: py + 1.5, z: pz,
        color: 0x38d9a9, life: 0.75, startScale: 1.5, endScale: 14.5,
        startOpacity: 0.88, preferRing: true,
      });
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const spd = 14 + vfxRng() * 10;
        spawnParticle({
          x: px, y: py + 2.2, z: pz,
          vx: Math.cos(ang) * spd, vy: 3.5 + vfxRng() * 5, vz: Math.sin(ang) * spd,
          color: i % 3 === 0 ? 0x7efce0 : 0xeafcf8,
          life: 0.85 + vfxRng() * 0.35, startScale: 0.9, endScale: 4.2,
          startOpacity: 0.72, drag: 2.4,
        });
      }
      return;
    }

    if (kind === 'splash') {
      spawnParticle({
        x: px, y: py, z: pz,
        color: 0x9ab8dc, life: 0.7, startScale: 0.8, endScale: 6.5,
        startOpacity: 0.65, preferRing: true,
      });
      for (let i = 0; i < 8; i++) {
        const ang = vfxRng() * Math.PI * 2;
        spawnParticle({
          x: px, y: py, z: pz,
          vx: Math.cos(ang) * 7, vy: 8 + vfxRng() * 7, vz: Math.sin(ang) * 7,
          color: 0xdbe9fa, life: 0.8, startScale: 0.7, endScale: 3.0,
          startOpacity: 0.55, gravity: 15, drag: 1.2,
        });
      }
      return;
    }

    const isSink = kind === 'sink';
    const isCrit = kind === 'crit';
    const isFire = kind === 'fire';

    // Expanding shockwave ring
    spawnParticle({
      x: px, y: py, z: pz,
      color: isCrit ? 0x38d9a9 : (isSink ? 0xff5a36 : 0xffb347),
      life: isSink ? 1.15 : 0.55,
      startScale: 1.0,
      endScale: isSink ? 18.0 : (isCrit ? 9.5 : 5.8),
      startOpacity: 0.9,
      preferRing: true,
    });

    const burstCount = isSink ? 22 : (isCrit || isFire ? 12 : 8);
    for (let i = 0; i < burstCount; i++) {
      const ang = vfxRng() * Math.PI * 2;
      const spd = (isSink ? 18 : 10) * (0.4 + vfxRng());
      const isDebris = i % 3 === 0;
      const color = isCrit && i % 2 === 0
        ? 0x38d9a9
        : (isFire || i % 2 === 0 ? 0xff6b2b : (isDebris ? 0x784421 : 0xffd166));
      spawnParticle({
        x: px, y: py, z: pz,
        vx: Math.cos(ang) * spd,
        vy: (isSink ? 14 : 7) * (0.3 + vfxRng()),
        vz: Math.sin(ang) * spd,
        color,
        life: (isSink ? 1.35 : 0.7) * (0.7 + vfxRng() * 0.5),
        startScale: isSink ? 1.3 : 0.75,
        endScale: isDebris ? 0.5 : (isSink ? 5.2 : 2.8),
        startOpacity: 0.92,
        gravity: isDebris ? 18 : 3,
        drag: isDebris ? 0.6 : 2.0,
        preferShard: isDebris,
      });
    }
  }

  // ==========================================================================
  // 7. VIEW MODE & CAD X-RAY SCHEMATIC CONTROLLER
  // ==========================================================================
  let latestSubsystemsState = null;

  function refreshSubsystemColors() {
    const isCad = viewMode === 'cad';
    const pal = cadTheme === 'light' ? PALETTE.cadLight : PALETTE.cadDark;
    sharedRepairRingMat.color.setHex(pal.repairBlue);

    for (const id of SUBSYSTEM_IDS) {
      const sub = latestSubsystemsState?.[id];
      const hp = finiteOr(sub?.hp, 100);
      const maxHp = Math.max(1, finiteOr(sub?.maxHp, 100));
      const ratio = clamp(hp / maxHp, 0, 1);
      const onFire = Boolean(sub?.onFire);
      const steamLeak = Boolean(sub?.steamLeak);

      const pair = subsystemCadMats[id];
      if (onFire || ratio < 0.35) {
        pair.edge.color.setHex(pal.critEdge);
        pair.fill.color.setHex(pal.critFill);
        pair.fill.opacity = 0.74;
      } else if (steamLeak || ratio < 0.72) {
        pair.edge.color.setHex(pal.warnEdge);
        pair.fill.color.setHex(pal.warnFill);
        pair.fill.opacity = 0.66;
      } else {
        pair.edge.color.setHex(pal.healthyEdge);
        pair.fill.color.setHex(pal.healthyFill);
        pair.fill.opacity = 0.56;
      }

      for (const rec of subsystemDualRecords[id]) {
        if (isCad && !rec.keepGlowInCad) {
          rec.mesh.material = pair.fill;
        } else {
          rec.mesh.material = rec.mat3d;
        }
        rec.edges.visible = isCad;
      }
    }
  }

  function applySceneAtmosphere() {
    const isCad = viewMode === 'cad';
    const pal = cadTheme === 'light' ? PALETTE.cadLight : PALETTE.cadDark;

    if (scene) {
      if (!scene.background || typeof scene.background.setHex !== 'function') {
        scene.background = new THREE.Color(isCad ? pal.page : PALETTE.mode3d.bg);
      } else {
        scene.background.setHex(isCad ? pal.page : PALETTE.mode3d.bg);
      }
      if (isCad) {
        scene.fog = null;
      } else if (typeof THREE.FogExp2 === 'function') {
        scene.fog = new THREE.FogExp2(PALETTE.mode3d.fog, PALETTE.mode3d.fogDensity);
      }
    }

    skyDomeGroup.visible = !isCad;
    cloudSeaGroup.visible = !isCad;
    cadGridGroup.visible = isCad;
    cadShipCompass.visible = isCad;

    if (isCad) {
      cadGhostHullMat.color.setHex(pal.hullFill);
      cadGhostHullMat.opacity = pal.hullOpacity;
      cadHullEdgeMat.color.setHex(pal.hullEdge);
      cadRockFillMat.color.setHex(pal.rockFill);
      cadRockEdgeMat.color.setHex(pal.rockEdge);
      cadMinorGridMat.color.setHex(pal.gridMinor);
      cadMajorGridMat.color.setHex(pal.gridMajor);
      enemyCadFillMat.color.setHex(pal.enemyFill);
      enemyCadEdgeMat.color.setHex(pal.enemyEdge);
      windRibbonMat.color.setHex(pal.windLine);
      windRibbonMat.opacity = 0.38;

      hemiLight.intensity = 1.9;
      sunLight.intensity = 1.1;
      stormRimLight.intensity = 0.6;
      lightningLight.intensity = 0;
    } else {
      windRibbonMat.color.setHex(0xaad4ff);
      windRibbonMat.opacity = 0.24;
      hemiLight.intensity = 1.35;
      sunLight.intensity = 2.35;
      stormRimLight.intensity = 1.05;
    }

    for (const rec of hullDualRecords) {
      rec.mesh.material = isCad ? cadGhostHullMat : rec.mat3d;
      rec.edges.visible = isCad;
    }
    for (const rec of rockDualRecords) {
      rec.mesh.material = isCad ? cadRockFillMat : rec.mat3d;
      rec.edges.visible = isCad;
    }
    for (const enemyRec of activeEnemies.values()) {
      applyEnemyMaterialMode(enemyRec);
    }
    refreshSubsystemColors();
  }

  function setViewMode(mode = '3d', nextCadTheme = cadTheme) {
    viewMode = mode === 'cad' ? 'cad' : '3d';
    if (nextCadTheme === 'light' || nextCadTheme === 'dark') {
      cadTheme = nextCadTheme;
    }
    applySceneAtmosphere();
    return getViewMode();
  }

  function getViewMode() {
    return { mode: viewMode, cadTheme };
  }

  // Initialize default '3d' atmosphere cleanly
  applySceneAtmosphere();

  // ==========================================================================
  // 8. SCREEN ANCHORS & SUBSYSTEM RAYCASTING (3D + CAD HUD Callout Pins)
  // ==========================================================================
  const tmpWorldAnchor = new THREE.Vector3();
  const tmpProjected = new THREE.Vector3();

  function computeWorldPointFromShip(localVec, outVec) {
    outVec.copy(localVec);
    if (typeof shipBody.updateMatrixWorld === 'function') {
      playerShipGroup.updateMatrixWorld(true);
      if (shipBody.matrixWorld && typeof outVec.applyMatrix4 === 'function') {
        return outVec.applyMatrix4(shipBody.matrixWorld);
      }
    }
    // Fallback manual transform if minimal mock THREE has no Matrix4 world propagation
    const yaw = finiteOr(playerShipGroup.rotation?.y, 0);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const wx = localVec.x * cy + localVec.z * sy + finiteOr(playerShipGroup.position.x, 0);
    const wy = localVec.y + finiteOr(playerShipGroup.position.y, 0);
    const wz = -localVec.x * sy + localVec.z * cy + finiteOr(playerShipGroup.position.z, 0);
    return outVec.set(wx, wy, wz);
  }

  function getSubsystemScreenAnchors(camera, viewportWidth = 1280, viewportHeight = 720) {
    const w = Math.max(1, finiteOr(viewportWidth, 1280));
    const h = Math.max(1, finiteOr(viewportHeight, 720));
    camera?.updateMatrixWorld?.(true);

    const anchors = {};
    for (const id of SUBSYSTEM_IDS) {
      computeWorldPointFromShip(subsystemLocalAnchors[id], tmpWorldAnchor);
      let ndcX = 0;
      let ndcY = 0;
      let ndcZ = 0.5;
      let projectedOk = false;

      if (camera && typeof tmpProjected.project === 'function') {
        try {
          tmpProjected.copy(tmpWorldAnchor).project(camera);
          if (
            Number.isFinite(tmpProjected.x) &&
            Number.isFinite(tmpProjected.y) &&
            Number.isFinite(tmpProjected.z)
          ) {
            ndcX = tmpProjected.x;
            ndcY = tmpProjected.y;
            ndcZ = tmpProjected.z;
            projectedOk = true;
          }
        } catch (_) {
          projectedOk = false;
        }
      }

      if (!projectedOk) {
        // Fallback orthographic-style spread around viewport center for mock cameras
        const camX = finiteOr(camera?.position?.x, playerShipGroup.position.x);
        const camZ = finiteOr(camera?.position?.z, playerShipGroup.position.z + 40);
        const dx = tmpWorldAnchor.x - camX;
        const dy = tmpWorldAnchor.y - finiteOr(playerShipGroup.position.y, 0);
        void camZ;
        ndcX = clamp(dx * 0.035, -0.9, 0.9);
        ndcY = clamp(dy * 0.045, -0.9, 0.9);
        ndcZ = 0.2;
      }

      const visible = ndcZ >= -1.0 && ndcZ <= 1.0 && Math.abs(ndcX) <= 1.2 && Math.abs(ndcY) <= 1.2;
      const sx = finiteOr((ndcX * 0.5 + 0.5) * w, w * 0.5);
      const sy = finiteOr((-ndcY * 0.5 + 0.5) * h, h * 0.5);

      anchors[id] = {
        x: sx,
        y: sy,
        visible: Boolean(visible),
        ndcX: finiteOr(ndcX, 0),
        ndcY: finiteOr(ndcY, 0),
      };
    }
    return anchors;
  }

  const pickRootList = SUBSYSTEM_IDS.map((id) => subsystemGroups[id]);

  function pickSubsystem(raycaster) {
    if (!raycaster) return null;
    playerShipGroup.updateMatrixWorld?.(true);

    const rayOrigin = raycaster.ray?.origin;
    const rayDir = raycaster.ray?.direction;

    // Helper: perpendicular distance squared from ray to a ship-local point
    const rayPerpDistSq = (localVec) => {
      if (!rayOrigin || !rayDir) return Infinity;
      const dLen = Math.hypot(rayDir.x, rayDir.y, rayDir.z) || 1;
      const dx = finiteOr(rayDir.x, 0) / dLen;
      const dy = finiteOr(rayDir.y, 0) / dLen;
      const dz = finiteOr(rayDir.z, -1) / dLen;
      computeWorldPointFromShip(localVec, tmpWorldAnchor);
      const lx = tmpWorldAnchor.x - finiteOr(rayOrigin.x, 0);
      const ly = tmpWorldAnchor.y - finiteOr(rayOrigin.y, 0);
      const lz = tmpWorldAnchor.z - finiteOr(rayOrigin.z, 0);
      const tca = lx * dx + ly * dy + lz * dz;
      if (tca < 0) return Infinity;
      return Math.max(0, (lx * lx + ly * ly + lz * lz) - tca * tca);
    };

    if (typeof raycaster.intersectObjects === 'function') {
      try {
        const hits = raycaster.intersectObjects(pickRootList, true);
        if (Array.isArray(hits) && hits.length > 0) {
          const hitSet = new Set();
          let firstFound = null;
          for (const hit of hits) {
            let cur = hit?.object;
            while (cur) {
              const sid = cur.userData?.subsystemId;
              if (sid && SUBSYSTEM_IDS.includes(sid)) {
                if (!firstFound) firstFound = sid;
                hitSet.add(sid);
                break;
              }
              cur = cur.parent;
            }
          }
          // In X-Ray CAD mode, if multiple overlapping subsystems lie along the ray,
          // choose the hit subsystem whose anchor/core sits closest to the cursor ray!
          if (viewMode === 'cad' && hitSet.size > 1 && rayOrigin && rayDir) {
            let bestCadId = firstFound;
            let bestD2 = Infinity;
            for (const sid of hitSet) {
              let d2 = rayPerpDistSq(subsystemLocalAnchors[sid]);
              if (sid === 'sponsons') {
                d2 = Math.min(d2, rayPerpDistSq(new THREE.Vector3(-5.05, -0.15, 2.2)));
              } else if (sid === 'gunDeck') {
                d2 = Math.min(
                  d2,
                  rayPerpDistSq(new THREE.Vector3(3.55, 1.15, -5.8)),
                  rayPerpDistSq(new THREE.Vector3(-3.55, 1.15, 3.2)),
                  rayPerpDistSq(new THREE.Vector3(3.55, 1.15, 3.2))
                );
              }
              if (d2 < bestD2) {
                bestD2 = d2;
                bestCadId = sid;
              }
            }
            return bestCadId;
          }
          if (firstFound) return firstFound;
        }
      } catch (_) {
        // Fall through to analytic ray-sphere check
      }
    }

    // Analytic ray-sphere fallback (supports lightweight mock raycasters in jsc -m)
    if (rayOrigin && rayDir) {
      let bestId = null;
      let bestT = Infinity;
      const ox = finiteOr(rayOrigin.x, 0);
      const oy = finiteOr(rayOrigin.y, 0);
      const oz = finiteOr(rayOrigin.z, 0);
      const dLen = Math.hypot(rayDir.x, rayDir.y, rayDir.z) || 1;
      const dx = finiteOr(rayDir.x, 0) / dLen;
      const dy = finiteOr(rayDir.y, 0) / dLen;
      const dz = finiteOr(rayDir.z, -1) / dLen;

      const testSphere = (sid, localVec, radius) => {
        computeWorldPointFromShip(localVec, tmpWorldAnchor);
        const lx = tmpWorldAnchor.x - ox;
        const ly = tmpWorldAnchor.y - oy;
        const lz = tmpWorldAnchor.z - oz;
        const tca = lx * dx + ly * dy + lz * dz;
        if (tca < 0) return;
        const d2 = (lx * lx + ly * ly + lz * lz) - tca * tca;
        if (d2 <= radius * radius && tca < bestT) {
          bestT = tca;
          bestId = sid;
        }
      };

      for (const id of SUBSYSTEM_IDS) {
        const spec = subsystemLocalSpheres[id];
        if (spec.dualX) {
          testSphere(id, new THREE.Vector3(-spec.dualX, spec.center.y, spec.center.z), spec.singleRadius);
          testSphere(id, new THREE.Vector3(spec.dualX, spec.center.y, spec.center.z), spec.singleRadius);
        } else if (spec.dualGun) {
          testSphere(id, new THREE.Vector3(-3.65, 0.95, -4.4), 2.1);
          testSphere(id, new THREE.Vector3(-3.65, 0.95, 3.2), 2.0);
          testSphere(id, new THREE.Vector3(3.65, 0.95, -4.4), 2.1);
          testSphere(id, new THREE.Vector3(3.65, 0.95, 3.2), 2.0);
        } else {
          testSphere(id, spec.center, spec.radius);
        }
      }
      return bestId;
    }

    return null;
  }

  // ==========================================================================
  // 9. LIVE FRAME SYNCHRONIZATION (syncState)
  // ==========================================================================
  let prevPlayerX = NaN;
  let prevPlayerZ = NaN;
  let prevPlayerYaw = 0;
  let lightningTimer = 3.8;
  let lightningFlash = 0;

  function syncState(simState, dt = 1 / 60, elapsed = NaN) {
    const safeDt = clamp(finiteOr(dt, 1 / 60), 0, 0.1);
    internalElapsed = Number.isFinite(elapsed) ? elapsed : (internalElapsed + safeDt);
    const t = internalElapsed;

    if (Array.isArray(simState?.obstacles) && simState.obstacles.length > 0) {
      setObstacles(simState.obstacles);
    }

    // --- A. Player Galleon Transform, Subsystem Animations & Aiming Fans ---
    const player = simState?.player || {};
    const px = finiteOr(player.x, 0);
    const py = finiteOr(player.y, 0);
    const pz = finiteOr(player.z, 0);
    const pHeading = finiteOr(player.heading, 0);
    const pSpeed = finiteOr(player.speed, 0);
    const pThrottle = clamp(finiteOr(player.throttle, 0.5), 0, 1);

    if (Number.isFinite(prevPlayerX) && Number.isFinite(prevPlayerZ) && Math.abs(pSpeed) > 0.25) {
      calibrateHeadingConvention(pHeading, px - prevPlayerX, pz - prevPlayerZ);
    }
    prevPlayerX = px;
    prevPlayerZ = pz;

    const playerYaw = headingToThreeYaw(pHeading, player.vx, player.vz);
    const yawRate = safeDt > 1e-4 ? wrapAngle(playerYaw - prevPlayerYaw) / safeDt : 0;
    prevPlayerYaw = playerYaw;

    const swellRoll = Math.sin(t * 1.35) * 0.025;
    const swellPitch = Math.cos(t * 1.05) * 0.016;
    const pRoll = clamp(finiteOr(player.roll, -yawRate * 0.08 + swellRoll), -0.45, 0.45);
    const pPitch = clamp(finiteOr(player.pitch, swellPitch), -0.35, 0.35);

    playerShipGroup.position.set(px, py, pz);
    playerShipGroup.rotation.set(0, playerYaw, 0);
    shipBody.rotation.set(pPitch, 0, pRoll);

    // Keep CAD grid & range compass centered cleanly
    cadGridGroup.position.set(Math.round(px / 80) * 80, py - 3.6, Math.round(pz / 80) * 80);
    cadShipCompass.position.set(px, py - 3.55, pz);
    cadShipCompass.rotation.y = playerYaw;

    // Boiler glow & overpressure response
    const boilerState = simState?.boiler || {};
    const overcharged = Boolean(boilerState.overcharged);
    const alloc = boilerState.allocation || {};
    const propBar = finiteOr(alloc.propulsion, 5.5);
    const sponsonBar = finiteOr(alloc.sponsons, 5.0);

    if (boilerCoreMesh) {
      const pulse = 0.85 + 0.15 * Math.sin(t * (overcharged ? 14 : 4.5));
      boilerCoreLight.intensity = (overcharged ? 4.4 : 2.5) * pulse;
      boilerCoreLight.color.setHex(overcharged ? PALETTE.mode3d.aetherHot : PALETTE.mode3d.aether);
      if (mats3d.aetherCore.emissiveIntensity !== undefined) {
        mats3d.aetherCore.emissiveIntensity = (overcharged ? 2.6 : 1.6) * pulse;
      }
    }

    // Sponson paddlewheels & levitation lift rings
    const wheelSpin = (1.8 + sponsonBar * 0.45 + Math.abs(pSpeed) * 0.12) * safeDt;
    for (const w of sponsonWheels) {
      w.rotation.x -= wheelSpin;
    }
    const liftPulse = 0.94 + 0.08 * Math.sin(t * 6.0);
    for (const lr of sponsonLiftRings) {
      lr.rotation.y += safeDt * 1.8;
      lr.scale.setScalar(liftPulse);
    }

    // Kort Propulsor impeller spin, rudder deflection & exhaust wake
    if (propulsorImpeller) {
      const impRate = 3.5 + pThrottle * 10.5 + propBar * 1.15 + (overcharged ? 6.0 : 0);
      propulsorImpeller.rotation.z += impRate * safeDt;
    }
    const rudderAngle = clamp(-yawRate * 0.55, -0.52, 0.52);
    for (const r of sternRudders) {
      r.rotation.y = lerp(finiteOr(r.rotation.y, 0), rudderAngle, clamp(safeDt * 10, 0, 1));
    }
    if (propulsorWakeCone) {
      const wakeScale = clamp(0.35 + pThrottle * 0.85 + (propBar / 10) * 0.35, 0.25, 1.65);
      propulsorWakeCone.scale.set(
        0.85 + 0.12 * Math.sin(t * 15),
        wakeScale * (0.92 + 0.08 * Math.cos(t * 18)),
        0.85 + 0.12 * Math.sin(t * 15)
      );
    }

    // Broadside cannon barrel recoil recovery, disabled-gunport retraction & aiming fan arc readiness
    const activeGuns = clamp(Math.round(finiteOr(player.activeGuns, 6)), 2, 6);
    for (const bank of [cannonsPort, cannonsStarboard]) {
      for (const c of bank) {
        const disabledInset = c.index >= activeGuns ? 0.52 : 0;
        if (c.recoil > 0.001) {
          c.recoil = Math.max(0, c.recoil - safeDt * 3.4);
          const kick = Math.sin(c.recoil * Math.PI * 0.5) * 0.55;
          c.group.position.x = c.baseX - c.sideSign * (kick + disabledInset);
        } else {
          c.group.position.x = c.baseX - c.sideSign * disabledInset;
        }
      }
    }

    const ammoType = simState?.ammoType || 'roundshot';
    const arcHex = ammoType === 'aethershell'
      ? (viewMode === 'cad' && cadTheme === 'light' ? 0x0ca678 : 0x38d9a9)
      : (ammoType === 'chainshot'
        ? (viewMode === 'cad' && cadTheme === 'light' ? 0x3e63dd : 0x6b9bff)
        : (viewMode === 'cad' && cadTheme === 'light' ? 0xd97706 : 0xffb347));
    const portReload = Math.max(0, finiteOr(simState?.portReload, 0));
    const stbdReload = Math.max(0, finiteOr(simState?.starboardReload, 0));
    const portReady = portReload <= 0.05;
    const stbdReady = stbdReload <= 0.05;

    aimArcGroup.position.y = -1.2;
    portFanFillMat.color.setHex(arcHex);
    portFanLineMat.color.setHex(arcHex);
    stbdFanFillMat.color.setHex(arcHex);
    stbdFanLineMat.color.setHex(arcHex);
    portFanFillMat.opacity = portReady ? (viewMode === 'cad' ? 0.14 : 0.09) : 0.025;
    portFanLineMat.opacity = portReady ? (viewMode === 'cad' ? 0.72 : 0.48) : 0.16;
    stbdFanFillMat.opacity = stbdReady ? (viewMode === 'cad' ? 0.14 : 0.09) : 0.025;
    stbdFanLineMat.opacity = stbdReady ? (viewMode === 'cad' ? 0.72 : 0.48) : 0.16;

    // Wind streamlines, cloud strata drift & square-rigged sail trim
    const wind = simState?.wind || {};
    const windAngle = finiteOr(wind.angle, 0.65);
    const windKnots = clamp(finiteOr(wind.knots, 18), 4, 40);
    const windYaw = headingToThreeYaw(windAngle);
    const windFwdX = -Math.sin(windYaw);
    const windFwdZ = -Math.cos(windYaw);

    // Trim yards smoothly toward relative wind angle (clamped to realistic ±38° brace limit)
    const relWind = wrapAngle(windYaw - playerYaw);
    const targetYardTrim = clamp(relWind * 0.48, -0.66, 0.66);
    const riggingHp = finiteOr(simState?.subsystems?.rigging?.hp, 100);
    const riggingMax = Math.max(1, finiteOr(simState?.subsystems?.rigging?.maxHp, 100));
    const sailHealthScale = clamp(0.42 + 0.58 * (riggingHp / riggingMax), 0.42, 1.0);

    for (const yp of yardPivots) {
      yp.rotation.y = lerp(finiteOr(yp.rotation.y, 0), targetYardTrim, clamp(safeDt * 4.5, 0, 1));
    }
    const billowPulse = 1.0 + 0.05 * Math.sin(t * 2.8) * (windKnots / 20);
    for (const sm of sailMeshes) {
      sm.scale.set(1, sailHealthScale, billowPulse);
    }
    if (pennantMesh) {
      pennantMesh.rotation.y = relWind + Math.sin(t * 8.5) * 0.16;
    }

    //Subsystem afflictions (fire, steam leak, crew repair rings) & CAD health colors
    latestSubsystemsState = simState?.subsystems || null;
    refreshSubsystemColors();

    for (const id of SUBSYSTEM_IDS) {
      const sub = latestSubsystemsState?.[id];
      const rig = afflictionRigs[id];
      const onFire = Boolean(sub?.onFire);
      const steamLeak = Boolean(sub?.steamLeak);
      const crew = finiteOr(sub?.crewAssigned, 0);

      rig.fireGroup.visible = onFire;
      if (onFire) {
        rig.tongues.forEach((m, idx) => {
          const flick = 0.72 + 0.45 * Math.abs(Math.sin(t * 13 + idx * 1.7));
          m.scale.set(0.85, flick, 0.85);
        });
        rig.smokePuffs.forEach((sm, idx) => {
          const cycle = (t * 0.9 + idx * 0.33) % 1;
          sm.position.y = 1.4 + cycle * 3.4;
          sm.scale.setScalar(0.65 + cycle * 1.35);
        });
      }

      rig.steamGroup.visible = steamLeak;
      if (steamLeak) {
        rig.jets.forEach((jet, idx) => {
          const hiss = 0.8 + 0.45 * Math.abs(Math.cos(t * 18 + idx * 2.1));
          jet.scale.set(0.55, 1.3 * hiss, 0.55);
        });
      }

      rig.repairGroup.visible = crew > 0;
      if (crew > 0) {
        rig.repairRing.rotation.z = t * 2.6;
        const rScale = 0.92 + 0.1 * Math.sin(t * 6.5);
        rig.repairRing.scale.setScalar(rScale);
      }
    }

    // --- B. Cloud-Sea Undulation, Drifting Strata, Wind Ribbons & Lightning ---
    if (viewMode === '3d') {
      // Gentle cloud-sea vertex wave undulation (every frame, strictly finite)
      if (cloudPosAttr?.array) {
        const arr = cloudPosAttr.array;
        const count = cloudBaseXZ.length / 2;
        const phase1 = t * 0.55;
        const phase2 = t * 0.38;
        for (let i = 0; i < count; i++) {
          const bx = cloudBaseXZ[i * 2];
          const bz = cloudBaseXZ[i * 2 + 1];
          const h =
            Math.sin(bx * 0.018 + bz * 0.011 + phase1) * 2.8 +
            Math.cos(bx * 0.009 - bz * 0.016 - phase2) * 3.4 +
            Math.sin((bx + bz) * 0.031 + phase1 * 1.4) * 1.1;
          arr[i * 3 + 1] = -22.0 + h;
        }
        cloudPosAttr.needsUpdate = true;
      }

      // Drifting volumetric cloud banks across arena
      const driftStep = windKnots * 0.42 * safeDt;
      for (const cb of cloudBanks) {
        cb.group.position.x += windFwdX * driftStep * cb.speedMul;
        cb.group.position.z += windFwdZ * driftStep * cb.speedMul;
        cb.group.position.y = cb.baseY + Math.sin(t * 0.7 + cb.bobPhase) * 0.65;
        if (cb.group.position.x > 520) cb.group.position.x -= 1040;
        if (cb.group.position.x < -520) cb.group.position.x += 1040;
        if (cb.group.position.z > 520) cb.group.position.z -= 1040;
        if (cb.group.position.z < -520) cb.group.position.z += 1040;
      }

      // Distant storm-wall lightning flashes
      lightningTimer -= safeDt;
      if (lightningTimer <= 0) {
        lightningFlash = 1.0;
        lightningTimer = 4.8 + (Math.sin(t * 3.7) * 0.5 + 0.5) * 4.5;
        const boltAngle = (t * 0.73) % (Math.PI * 2);
        lightningBoltGroup.position.set(Math.cos(boltAngle) * 560, 12, Math.sin(boltAngle) * 560);
        lightningBoltGroup.rotation.y = -boltAngle + Math.PI * 0.5;
      }
      if (lightningFlash > 0) {
        lightningFlash = Math.max(0, lightningFlash - safeDt * 3.8);
        const flicker = lightningFlash > 0.55 && lightningFlash < 0.72 ? 0.25 : lightningFlash;
        lightningLight.intensity = flicker * 3.4;
        lightningBoltMat.opacity = flicker * 0.92;
      } else {
        lightningLight.intensity = 0;
        lightningBoltMat.opacity = 0;
      }
    }

    // Wind-streamline ribbons (active in both 3D and CAD modes, centered around player arena)
    const ribbonStep = windKnots * 1.65 * safeDt;
    for (const wr of windRibbons) {
      wr.localX += windFwdX * ribbonStep * wr.speedOffset;
      wr.localZ += windFwdZ * ribbonStep * wr.speedOffset;
      if (wr.localX > 280) wr.localX -= 560;
      if (wr.localX < -280) wr.localX += 560;
      if (wr.localZ > 280) wr.localZ -= 560;
      if (wr.localZ < -280) wr.localZ += 560;
      wr.mesh.position.set(
        px + wr.localX,
        wr.baseY + Math.sin(t * 1.6 + wr.phase) * 0.6,
        pz + wr.localZ
      );
      wr.mesh.rotation.set(-Math.PI * 0.5, 0, windYaw);
    }

    // Sky-rock aether beacons
    for (const br of beaconRotors) {
      br.crystal.rotation.y = t * 1.4 + br.phase;
      br.cage.rotation.y = -t * 0.9 + br.phase;
      br.cage.rotation.x = Math.sin(t * 0.8 + br.phase) * 0.35;
    }

    // --- C. Sync Enemy Fleet ---
    const enemiesList = Array.isArray(simState?.enemies) ? simState.enemies : [];
    const seenEnemyIds = new Set();

    enemiesList.forEach((enemy, idx) => {
      if (!enemy || enemy.alive === false || enemy.dead === true) return;
      const eid = String(enemy.id ?? `enemy-${idx}`);
      seenEnemyIds.add(eid);

      const kind = enemy.type || enemy.kind || enemy.className || 'cutter';
      let rec = activeEnemies.get(eid);
      if (!rec || rec.kind !== kind) {
        if (rec) enemyFleetGroup.remove(rec.root);
        rec = buildEnemyMeshRecord(kind);
        activeEnemies.set(eid, rec);
      }

      const ex = finiteOr(enemy.x, 0);
      const ey = finiteOr(enemy.y, 0);
      const ez = finiteOr(enemy.z, 0);
      const eHeading = finiteOr(enemy.heading ?? enemy.yaw, 0);

      let eYaw = rec.lastYaw;
      if (Number.isFinite(enemy.vx) && Number.isFinite(enemy.vz) && Math.hypot(enemy.vx, enemy.vz) > 0.08) {
        eYaw = forwardToThreeYaw(enemy.vx, enemy.vz);
      } else if (Number.isFinite(rec.prevX) && Math.hypot(ex - rec.prevX, ez - rec.prevZ) > 0.03) {
        calibrateHeadingConvention(eHeading, ex - rec.prevX, ez - rec.prevZ);
        eYaw = headingToThreeYaw(eHeading);
      } else {
        eYaw = headingToThreeYaw(eHeading);
      }
      rec.prevX = ex;
      rec.prevZ = ez;
      rec.lastYaw = eYaw;

      const sinkProg = clamp(finiteOr(enemy.sinkProgress, 0), 0, 1);
      rec.root.visible = true;
      rec.root.position.set(ex, ey - sinkProg * 9.5, ez);
      rec.root.rotation.set(0, eYaw, 0);
      rec.body.rotation.set(
        finiteOr(enemy.pitch, Math.cos(t * 1.2 + idx) * 0.02 + sinkProg * 0.35),
        0,
        finiteOr(enemy.roll, Math.sin(t * 1.5 + idx) * 0.03 + sinkProg * 0.45)
      );

      for (const sp of rec.spinners) {
        sp.obj.rotation[sp.axis] += sp.speed * safeDt;
      }

      const isBurning = Boolean(enemy.onFire || finiteOr(enemy.fireTimer, 0) > 0);
      rec.fireRing.visible = isBurning;
      if (isBurning) {
        rec.fireRing.scale.set(1, 0.8 + 0.35 * Math.abs(Math.sin(t * 14 + idx)), 1);
      }

      const isCrippled = Boolean(
        enemy.crippled ||
        finiteOr(enemy.crippledTimer, 0) > 0 ||
        finiteOr(enemy.slowTimer, 0) > 0 ||
        finiteOr(enemy.chainTimer, 0) > 0 ||
        finiteOr(enemy.crippleTimer, 0) > 0
      );
      rec.crippleRing.visible = isCrippled;
      if (isCrippled) {
        rec.crippleRing.rotation.z = t * 3.5;
      }

      const eHp = Math.max(0, finiteOr(enemy.hp ?? enemy.hull, 100));
      const eMaxHp = Math.max(1, finiteOr(enemy.maxHp ?? enemy.maxHull, 100));
      const hpRatio = clamp(eHp / eMaxHp, 0.001, 1);
      rec.hpFill.scale.x = hpRatio;
      rec.hpFillMat.color.setHex(hpRatio > 0.5 ? 0xff6b6b : (hpRatio > 0.25 ? 0xffb347 : 0xff2e44));
      rec.hpBarGroup.rotation.y = -eYaw;
    });

    for (const [eid, rec] of activeEnemies.entries()) {
      if (!seenEnemyIds.has(eid)) {
        enemyFleetGroup.remove(rec.root);
        activeEnemies.delete(eid);
      }
    }

    // --- D. Sync Broadside Projectiles ---
    const projList = Array.isArray(simState?.projectiles) ? simState.projectiles : [];
    let activeProjCount = 0;
    for (let i = 0; i < projList.length; i++) {
      const p = projList[i];
      if (!p || p.active === false) continue;
      const vis = acquireProjectileVisual(activeProjCount++);
      const qx = finiteOr(p.x, 0);
      const qy = finiteOr(p.y, 0.8);
      const qz = finiteOr(p.z, 0);

      vis.root.visible = true;
      vis.root.position.set(qx, qy, qz);

      const pvx = finiteOr(p.vx, NaN);
      const pvz = finiteOr(p.vz, NaN);
      const pYaw = headingToThreeYaw(finiteOr(p.heading, 0), pvx, pvz);
      vis.root.rotation.set(0, pYaw, 0);

      const isEnemyShot = p.owner === 'enemy' || p.team === 'enemy' || p.fromPlayer === false;
      const ammo = p.ammoType || p.ammo || p.type || 'roundshot';

      vis.roundNode.visible = !isEnemyShot && ammo === 'roundshot';
      vis.chainNode.visible = !isEnemyShot && ammo === 'chainshot';
      vis.aetherNode.visible = !isEnemyShot && ammo === 'aethershell';
      vis.enemyNode.visible = isEnemyShot;

      if (vis.chainNode.visible) {
        vis.chainNode.rotation.y = t * 22.0 + i;
        vis.trail.material = projMats.chainTrail;
      } else if (vis.aetherNode.visible) {
        vis.aRing.rotation.x = t * 14.0;
        vis.aRing.rotation.y = t * 9.0;
        vis.trail.material = projMats.aetherTrail;
      } else if (isEnemyShot) {
        vis.trail.material = projMats.enemyTrail;
      } else {
        vis.trail.material = projMats.roundTrail;
      }
    }
    for (let i = activeProjCount; i < projectilePool.length; i++) {
      projectilePool[i].root.visible = false;
    }

    // --- E. Step Active Muzzle & Impact VFX Pool ---
    for (let i = 0; i < vfxParticles.length; i++) {
      const p = vfxParticles[i];
      if (!p.active) continue;
      p.age += safeDt;
      if (p.age >= p.life) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const u = clamp(p.age / p.life, 0, 1);
      const damp = Math.exp(-p.drag * safeDt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp - p.gravity * safeDt;

      p.mesh.position.x = finiteOr(p.mesh.position.x + p.vx * safeDt, 0);
      p.mesh.position.y = finiteOr(p.mesh.position.y + p.vy * safeDt, 0);
      p.mesh.position.z = finiteOr(p.mesh.position.z + p.vz * safeDt, 0);

      if (!p.isRing) {
        p.mesh.rotation.x += p.spinX * safeDt;
        p.mesh.rotation.y += p.spinY * safeDt;
      }
      const sc = lerp(p.startScale, p.endScale, 1 - Math.pow(1 - u, 2));
      p.mesh.scale.setScalar(Math.max(0.02, finiteOr(sc, 1)));
      p.mat.opacity = clamp(p.startOpacity * (1 - u * u), 0, 1);
    }
  }

  return {
    group,
    playerShipGroup,
    subsystemGroups,
    setObstacles,
    setViewMode,
    getViewMode,
    getSubsystemScreenAnchors,
    pickSubsystem,
    triggerMuzzleVolley,
    triggerImpactVfx,
    syncState,
  };
}
