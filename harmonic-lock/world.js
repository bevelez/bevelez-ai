// Tape No. 09: Harmonic Lock — Synesthetic 3D Spline Megastructure Corridor,
// 4 Morphing Architectural/Fourier Areas, 3-Stage Evolving Vector Craft,
// Curving Quadratic Bezier Homing Salvos & 3-Phase Boss (SERAPH-IX).

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function finiteOr(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function wrapDist(dist, totalLength) {
  const len = totalLength > 1e-6 ? totalLength : 1200;
  const d = finiteOr(dist, 0) % len;
  return d < 0 ? d + len : d;
}

function makeRng(seed = 20260909) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb01(hex) {
  const h = (finiteOr(hex, 0xffffff) >>> 0) & 0xffffff;
  return {
    r: ((h >> 16) & 0xff) / 255,
    g: ((h >> 8) & 0xff) / 255,
    b: (h & 0xff) / 255,
  };
}

function rgb01ToHex(r, g, b) {
  const ri = clamp(Math.round(finiteOr(r, 0) * 255), 0, 255);
  const gi = clamp(Math.round(finiteOr(g, 0) * 255), 0, 255);
  const bi = clamp(Math.round(finiteOr(b, 0) * 255), 0, 255);
  return (ri << 16) | (gi << 8) | bi;
}

function lerpHex(hexA, hexB, t) {
  const u = clamp(finiteOr(t, 0), 0, 1);
  const a = hexToRgb01(hexA);
  const b = hexToRgb01(hexB);
  return rgb01ToHex(
    lerp(a.r, b.r, u),
    lerp(a.g, b.g, u),
    lerp(a.b, b.b, u)
  );
}

const AREA_THEMES = Object.freeze([
  {
    index: 0,
    id: 'phosphor-lattice',
    name: 'PHOSPHOR LATTICE',
    primaryHex: 0x00f0ff,
    secondaryHex: 0x1d4ed8,
    accentHex: 0x8ef9ff,
    fogHex: 0x030714,
    ambientHex: 0x102848,
    rimHex: 0x00d8ff,
  },
  {
    index: 1,
    id: 'fourier-cathedral',
    name: 'FOURIER CATHEDRAL',
    primaryHex: 0xffd166,
    secondaryHex: 0xff2a85,
    accentHex: 0xfff1bf,
    fogHex: 0x110518,
    ambientHex: 0x341530,
    rimHex: 0xff9e44,
  },
  {
    index: 2,
    id: 'subspace-conduit',
    name: 'SUBSPACE CONDUIT',
    primaryHex: 0x1affb2,
    secondaryHex: 0x9d4edd,
    accentHex: 0x9effdf,
    fogHex: 0x041216,
    ambientHex: 0x123238,
    rimHex: 0x1affb2,
  },
  {
    index: 3,
    id: 'singularity-core',
    name: 'SINGULARITY CORE',
    primaryHex: 0xff2a6d,
    secondaryHex: 0xe8f9ff,
    accentHex: 0xff85a9,
    fogHex: 0x14030c,
    ambientHex: 0x381024,
    rimHex: 0xff477e,
  },
]);

const TARGET_CORRIDOR_LENGTH = 1200.0;
const SPLINE_TABLE_STEPS = 1200; // 1.0m station resolution around 1200m closed loop
const GATE_COUNT = 28;
const GATE_SPACING = 12.0;
const STAR_MOTE_COUNT = 360;
const SALVO_POOL_SIZE = 28;
const SALVO_SEGMENTS = 20;
const VULCAN_POOL_SIZE = 16;
const SHOCKWAVE_POOL_SIZE = 36;
const SHARD_POOL_SIZE = 96;
const BOLT_POOL_SIZE = 64;
const WAKE_SEGMENTS = 16;

export function createHarmonicWorld({ THREE, scene }) {
  if (!THREE) {
    throw new Error('createHarmonicWorld requires { THREE, scene }');
  }

  const ADDITIVE = THREE.AdditiveBlending ?? 2;
  const DOUBLE_SIDE = THREE.DoubleSide ?? 2;

  const group = new THREE.Group();
  group.name = 'HarmonicLockWorld';
  if (scene && typeof scene.add === 'function') {
    scene.add(group);
  }

  // --------------------------------------------------------------------------
  // Low-level Geometry / Material / Transform Helpers (WebGL + jsc -m safe)
  // --------------------------------------------------------------------------
  function makeBufferAttr(f32, itemSize = 3) {
    if (typeof THREE.BufferAttribute === 'function') {
      return new THREE.BufferAttribute(f32, itemSize);
    }
    if (typeof THREE.Float32BufferAttribute === 'function') {
      return new THREE.Float32BufferAttribute(f32, itemSize);
    }
    return { array: f32, itemSize, count: f32.length / itemSize, needsUpdate: false };
  }

  function makeLineLoopGeometry(points3d, closed = true) {
    const geom = new THREE.BufferGeometry();
    const count = points3d.length + (closed ? 1 : 0);
    const f32 = new Float32Array(count * 3);
    for (let i = 0; i < points3d.length; i++) {
      const p = points3d[i];
      f32[i * 3] = finiteOr(p[0], 0);
      f32[i * 3 + 1] = finiteOr(p[1], 0);
      f32[i * 3 + 2] = finiteOr(p[2], 0);
    }
    if (closed && points3d.length > 0) {
      const p0 = points3d[0];
      const base = points3d.length * 3;
      f32[base] = finiteOr(p0[0], 0);
      f32[base + 1] = finiteOr(p0[1], 0);
      f32[base + 2] = finiteOr(p0[2], 0);
    }
    if (typeof geom.setAttribute === 'function') {
      geom.setAttribute('position', makeBufferAttr(f32, 3));
    }
    return geom;
  }

  function makeSegmentsGeometry(segmentPairs) {
    const geom = new THREE.BufferGeometry();
    const f32 = new Float32Array(segmentPairs.length * 3);
    for (let i = 0; i < segmentPairs.length; i++) {
      const p = segmentPairs[i];
      f32[i * 3] = finiteOr(p[0], 0);
      f32[i * 3 + 1] = finiteOr(p[1], 0);
      f32[i * 3 + 2] = finiteOr(p[2], 0);
    }
    if (typeof geom.setAttribute === 'function') {
      geom.setAttribute('position', makeBufferAttr(f32, 3));
    }
    return geom;
  }

  function makeRegularPolygonGeometry(sides, radius, zOffset = 0, phaseOffset = 0) {
    const pts = [];
    const n = Math.max(3, Math.round(sides));
    for (let i = 0; i < n; i++) {
      const a = phaseOffset + (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * radius, Math.sin(a) * radius, zOffset]);
    }
    return makeLineLoopGeometry(pts, true);
  }

  function makeDoublePolygonStrutGeometry(sides, innerR, outerR, zInner = 0, zOuter = 0, twist = 0) {
    const segs = [];
    const n = Math.max(3, Math.round(sides));
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + twist;
      const aNext = ((i + 1) / n) * Math.PI * 2;
      const ix = Math.cos(a0) * innerR;
      const iy = Math.sin(a0) * innerR;
      const ox = Math.cos(a1) * outerR;
      const oy = Math.sin(a1) * outerR;
      const inx = Math.cos(aNext) * innerR;
      const iny = Math.sin(aNext) * innerR;
      const onx = Math.cos(aNext + twist) * outerR;
      const ony = Math.sin(aNext + twist) * outerR;
      // Radial rib
      segs.push([ix, iy, zInner], [ox, oy, zOuter]);
      // Inner chord
      segs.push([ix, iy, zInner], [inx, iny, zInner]);
      // Outer chord
      segs.push([ox, oy, zOuter], [onx, ony, zOuter]);
    }
    return makeSegmentsGeometry(segs);
  }

  // Passacaglia-inspired 3D Fourier epicycle harmonic curve!
  function makeFourierCurveGeometry({
    samples = 96,
    r1 = 14.5,
    r2 = 2.4,
    r3 = 1.15,
    freq2 = 3,
    freq3 = 5,
    zAmp = 2.2,
    zFreq = 4,
    openBottom = false,
  }) {
    const pts = [];
    const startT = openBottom ? -Math.PI * 0.82 : 0;
    const endT = openBottom ? Math.PI * 0.82 : Math.PI * 2;
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const theta = lerp(startT, endT, u);
      // When openBottom is true, theta=0 is top (+Y), +/-0.82*pi are low cathedral pillars
      const ang = openBottom ? theta + Math.PI * 0.5 : theta;
      const x =
        r1 * Math.cos(ang) +
        r2 * Math.cos(freq2 * ang) +
        r3 * Math.cos(freq3 * ang);
      const y =
        r1 * Math.sin(ang) -
        r2 * Math.sin(freq2 * ang) +
        r3 * Math.sin(freq3 * ang);
      const z = zAmp * Math.sin(zFreq * ang);
      pts.push([x, y, z]);
    }
    return makeLineLoopGeometry(pts, !openBottom);
  }

  function makeLine(geometry, hex, opacity = 0.85, additive = true) {
    const mat = new THREE.LineBasicMaterial({
      color: hex,
      transparent: true,
      opacity,
      blending: additive ? ADDITIVE : undefined,
      depthWrite: false,
    });
    return { line: new THREE.Line(geometry, mat), mat };
  }

  function makeLineSegments(geometry, hex, opacity = 0.85, additive = true) {
    const mat = new THREE.LineBasicMaterial({
      color: hex,
      transparent: true,
      opacity,
      blending: additive ? ADDITIVE : undefined,
      depthWrite: false,
    });
    const Cls = THREE.LineSegments || THREE.Line;
    return { line: new Cls(geometry, mat), mat };
  }

  function setColorSafe(colorObj, hex) {
    if (!colorObj) return;
    if (typeof colorObj.setHex === 'function') {
      colorObj.setHex(hex);
    } else if (typeof colorObj.set === 'function') {
      colorObj.set(hex);
    }
  }

  const tmpMat4 = typeof THREE.Matrix4 === 'function' ? new THREE.Matrix4() : null;
  const tmpNegForward = new THREE.Vector3(0, 0, 1);

  // Orients an Object3D so local +X = right, local +Y = up, local -Z = forward (+tangent)
  function applyCorridorBasis(obj, right, up, forward) {
    if (!obj) return;
    const fx = finiteOr(forward.x, 0);
    const fy = finiteOr(forward.y, 0);
    const fz = finiteOr(forward.z, -1);
    tmpNegForward.set(-fx, -fy, -fz);

    if (
      tmpMat4 &&
      typeof tmpMat4.makeBasis === 'function' &&
      obj.quaternion &&
      typeof obj.quaternion.setFromRotationMatrix === 'function'
    ) {
      tmpMat4.makeBasis(right, up, tmpNegForward);
      obj.quaternion.setFromRotationMatrix(tmpMat4);
      if (obj.rotation && typeof obj.rotation.setFromRotationMatrix === 'function') {
        obj.rotation.setFromRotationMatrix(tmpMat4);
      }
      return;
    }

    const yaw = Math.atan2(-fx, -fz);
    const pitch = Math.asin(clamp(fy, -1, 1));
    if (obj.rotation && typeof obj.rotation.set === 'function') {
      obj.rotation.set(finiteOr(pitch, 0), finiteOr(yaw, 0), 0);
    }
  }

  // --------------------------------------------------------------------------
  // 1. CLOSED 3D CATMULL-ROM FLIGHT SPLINE (~1200.0m, ZERO GIMBAL FLIP)
  // --------------------------------------------------------------------------
  const rawControlCoords = [];
  const WAYPOINT_COUNT = 16;
  for (let i = 0; i < WAYPOINT_COUNT; i++) {
    const theta = (i / WAYPOINT_COUNT) * Math.PI * 2;
    // Sculpted closed 3D orbital circuit: sweeping banking S-curves + harmonic climbs
    // At i=0 (theta=0), point is near (+R, 0, 0) moving smoothly toward -Z so forward is -Z!
    const radialMod = 1.0 + 0.13 * Math.cos(3 * theta) - 0.06 * Math.sin(2 * theta);
    const rx = 194.0 * radialMod * Math.cos(theta);
    const rz = -168.0 * radialMod * Math.sin(theta);
    const ry = 24.0 * Math.sin(theta) + 13.5 * Math.sin(2 * theta + 0.55) - 6.0 * Math.cos(3 * theta);
    rawControlCoords.push([rx, ry, rz]);
  }

  function evalClosedCatmullRomRaw(pts, uNorm, outArr) {
    const n = pts.length;
    const u = ((finiteOr(uNorm, 0) % 1) + 1) % 1;
    const scaled = u * n;
    const seg = Math.floor(scaled) % n;
    const t = scaled - Math.floor(scaled);
    const t2 = t * t;
    const t3 = t2 * t;

    const p0 = pts[(seg - 1 + n) % n];
    const p1 = pts[seg];
    const p2 = pts[(seg + 1) % n];
    const p3 = pts[(seg + 2) % n];

    for (let c = 0; c < 3; c++) {
      const v0 = p0[c];
      const v1 = p1[c];
      const v2 = p2[c];
      const v3 = p3[c];
      outArr[c] =
        0.5 *
        (2 * v1 +
          (-v0 + v2) * t +
          (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
          (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
    }
    return outArr;
  }

  // Measure high-precision arc length & scale control points to exact 1200.0m!
  const SUBDIV_SAMPLES = 4800;
  const denseU = new Float64Array(SUBDIV_SAMPLES + 1);
  const denseCumLen = new Float64Array(SUBDIV_SAMPLES + 1);
  {
    const prev = [0, 0, 0];
    const curr = [0, 0, 0];
    evalClosedCatmullRomRaw(rawControlCoords, 0, prev);
    let accum = 0;
    denseU[0] = 0;
    denseCumLen[0] = 0;
    for (let i = 1; i <= SUBDIV_SAMPLES; i++) {
      const u = i / SUBDIV_SAMPLES;
      evalClosedCatmullRomRaw(rawControlCoords, u, curr);
      const dx = curr[0] - prev[0];
      const dy = curr[1] - prev[1];
      const dz = curr[2] - prev[2];
      accum += Math.hypot(dx, dy, dz);
      denseU[i] = u;
      denseCumLen[i] = accum;
      prev[0] = curr[0];
      prev[1] = curr[1];
      prev[2] = curr[2];
    }
    const scaleFactor = TARGET_CORRIDOR_LENGTH / Math.max(1, accum);
    for (let i = 0; i < rawControlCoords.length; i++) {
      rawControlCoords[i][0] *= scaleFactor;
      rawControlCoords[i][1] *= scaleFactor;
      rawControlCoords[i][2] *= scaleFactor;
    }
    for (let i = 0; i <= SUBDIV_SAMPLES; i++) {
      denseCumLen[i] *= scaleFactor;
    }
  }

  const totalLength = TARGET_CORRIDOR_LENGTH; // Exact 1200.0m closed loop

  // Also instantiate official THREE.CatmullRomCurve3 when available
  const controlVecs = rawControlCoords.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const flightCurve =
    typeof THREE.CatmullRomCurve3 === 'function'
      ? new THREE.CatmullRomCurve3(controlVecs, true, 'catmullrom', 0.5)
      : null;

  function uForArcDistance(distMeters) {
    const d = wrapDist(distMeters, totalLength);
    let lo = 0;
    let hi = SUBDIV_SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (denseCumLen[mid] <= d) lo = mid;
      else hi = mid;
    }
    const len0 = denseCumLen[lo];
    const len1 = denseCumLen[hi];
    const frac = len1 > len0 + 1e-9 ? (d - len0) / (len1 - len0) : 0;
    return lerp(denseU[lo], denseU[hi], clamp(frac, 0, 1));
  }

  // Precompute 1200 uniform 1.0m stations with up-stabilized banking basis (0 gimbal flips!)
  const stationPos = new Float64Array(SPLINE_TABLE_STEPS * 3);
  const stationTan = new Float64Array(SPLINE_TABLE_STEPS * 3);
  const stationRight = new Float64Array(SPLINE_TABLE_STEPS * 3);
  const stationUp = new Float64Array(SPLINE_TABLE_STEPS * 3);

  {
    const pCurr = [0, 0, 0];
    const pPrev = [0, 0, 0];
    const pNext = [0, 0, 0];
    const deltaS = 0.5;

    for (let i = 0; i < SPLINE_TABLE_STEPS; i++) {
      const s = (i / SPLINE_TABLE_STEPS) * totalLength;
      evalClosedCatmullRomRaw(rawControlCoords, uForArcDistance(s), pCurr);
      evalClosedCatmullRomRaw(rawControlCoords, uForArcDistance(s - deltaS), pPrev);
      evalClosedCatmullRomRaw(rawControlCoords, uForArcDistance(s + deltaS), pNext);

      const base = i * 3;
      stationPos[base] = pCurr[0];
      stationPos[base + 1] = pCurr[1];
      stationPos[base + 2] = pCurr[2];

      let tx = pNext[0] - pPrev[0];
      let ty = pNext[1] - pPrev[1];
      let tz = pNext[2] - pPrev[2];
      const tLen = Math.hypot(tx, ty, tz) || 1;
      tx /= tLen;
      ty /= tLen;
      tz /= tLen;
      stationTan[base] = tx;
      stationTan[base + 1] = ty;
      stationTan[base + 2] = tz;

      // Lateral curvature banking hint blended safely into worldUp = (0, 1, 0)
      // Since |ty| < 0.28 everywhere on the loop, T x upRef is strictly > 0.92 in magnitude!
      const ax = pNext[0] - 2 * pCurr[0] + pPrev[0];
      const az = pNext[2] - 2 * pCurr[2] + pPrev[2];
      const bankX = clamp(ax * 10.5, -0.24, 0.24);
      const bankZ = clamp(az * 10.5, -0.24, 0.24);
      let refUx = bankX;
      let refUy = 1.0;
      let refUz = bankZ;
      const uRefLen = Math.hypot(refUx, refUy, refUz) || 1;
      refUx /= uRefLen;
      refUy /= uRefLen;
      refUz /= uRefLen;

      // right = normalize(tangent x refUp)
      let rx = ty * refUz - tz * refUy;
      let ry = tz * refUx - tx * refUz;
      let rz = tx * refUy - ty * refUx;
      const rLen = Math.hypot(rx, ry, rz);
      if (rLen > 1e-6) {
        rx /= rLen;
        ry /= rLen;
        rz /= rLen;
      } else {
        rx = 1;
        ry = 0;
        rz = 0;
      }

      // up = normalize(right x tangent)
      let ux = ry * tz - rz * ty;
      let uy = rz * tx - rx * tz;
      let uz = rx * ty - ry * tx;
      const uLen = Math.hypot(ux, uy, uz) || 1;
      ux /= uLen;
      uy /= uLen;
      uz /= uLen;

      stationRight[base] = rx;
      stationRight[base + 1] = ry;
      stationRight[base + 2] = rz;
      stationUp[base] = ux;
      stationUp[base + 1] = uy;
      stationUp[base + 2] = uz;
    }
  }

  function sampleCorridorInto(dist, outPoint, outTangent, outRight, outUp) {
    const d = wrapDist(dist, totalLength);
    const fIdx = (d / totalLength) * SPLINE_TABLE_STEPS;
    const i0 = Math.floor(fIdx) % SPLINE_TABLE_STEPS;
    const i1 = (i0 + 1) % SPLINE_TABLE_STEPS;
    const frac = clamp(fIdx - Math.floor(fIdx), 0, 1);

    const b0 = i0 * 3;
    const b1 = i1 * 3;

    const px = lerp(stationPos[b0], stationPos[b1], frac);
    const py = lerp(stationPos[b0 + 1], stationPos[b1 + 1], frac);
    const pz = lerp(stationPos[b0 + 2], stationPos[b1 + 2], frac);

    let tx = lerp(stationTan[b0], stationTan[b1], frac);
    let ty = lerp(stationTan[b0 + 1], stationTan[b1 + 1], frac);
    let tz = lerp(stationTan[b0 + 2], stationTan[b1 + 2], frac);
    const tLen = Math.hypot(tx, ty, tz);
    if (tLen > 1e-7) {
      tx /= tLen;
      ty /= tLen;
      tz /= tLen;
    } else {
      tx = 0;
      ty = 0;
      tz = -1;
    }

    let uxHint = lerp(stationUp[b0], stationUp[b1], frac);
    let uyHint = lerp(stationUp[b0 + 1], stationUp[b1 + 1], frac);
    let uzHint = lerp(stationUp[b0 + 2], stationUp[b1 + 2], frac);
    if (Math.hypot(uxHint, uyHint, uzHint) < 1e-6) {
      uxHint = 0;
      uyHint = 1;
      uzHint = 0;
    }

    // Re-orthonormalize strictly: right = normalize(tangent x upHint), up = normalize(right x tangent)
    let rx = ty * uzHint - tz * uyHint;
    let ry = tz * uxHint - tx * uzHint;
    let rz = tx * uyHint - ty * uxHint;
    let rLen = Math.hypot(rx, ry, rz);
    if (rLen < 1e-6) {
      // Emergency orthogonal fallback if hint ever aligned with tangent
      const altUx = Math.abs(ty) < 0.9 ? 0 : 1;
      const altUy = Math.abs(ty) < 0.9 ? 1 : 0;
      rx = ty * 0 - tz * altUy;
      ry = tz * altUx - tx * 0;
      rz = tx * altUy - ty * altUx;
      rLen = Math.hypot(rx, ry, rz) || 1;
    }
    rx /= rLen;
    ry /= rLen;
    rz /= rLen;

    let ux = ry * tz - rz * ty;
    let uy = rz * tx - rx * tz;
    let uz = rx * ty - ry * tx;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;

    outPoint.set(finiteOr(px, 0), finiteOr(py, 0), finiteOr(pz, 0));
    outTangent.set(finiteOr(tx, 0), finiteOr(ty, 0), finiteOr(tz, -1));
    outRight.set(finiteOr(rx, 1), finiteOr(ry, 0), finiteOr(rz, 0));
    outUp.set(finiteOr(ux, 0), finiteOr(uy, 1), finiteOr(uz, 0));
  }

  function sampleCorridor(dist) {
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    sampleCorridorInto(dist, point, tangent, right, up);
    return { point, tangent, right, up };
  }

  const scratchPt = new THREE.Vector3();
  const scratchTan = new THREE.Vector3();
  const scratchRight = new THREE.Vector3();
  const scratchUp = new THREE.Vector3();

  function corridorToWorld(dist, offsetX = 0, offsetY = 0, outVec3 = null) {
    sampleCorridorInto(dist, scratchPt, scratchTan, scratchRight, scratchUp);
    const ox = finiteOr(offsetX, 0);
    const oy = finiteOr(offsetY, 0);
    const target =
      outVec3 && typeof outVec3.set === 'function' ? outVec3 : new THREE.Vector3();
    target.set(
      finiteOr(scratchPt.x + scratchRight.x * ox + scratchUp.x * oy, 0),
      finiteOr(scratchPt.y + scratchRight.y * ox + scratchUp.y * oy, 0),
      finiteOr(scratchPt.z + scratchRight.z * ox + scratchUp.z * oy, 0)
    );
    return target;
  }

  group.userData = {
    totalLength,
    flightCurve,
    areaThemes: AREA_THEMES,
  };

  // --------------------------------------------------------------------------
  // 2. SCENE LIGHTING & ATMOSPHERIC MEGASTRUCTURE CORRIDOR (4 AREAS)
  // --------------------------------------------------------------------------
  const lightingGroup = new THREE.Group();
  lightingGroup.name = 'HarmonicLighting';
  group.add(lightingGroup);

  const ambientLight =
    typeof THREE.AmbientLight === 'function'
      ? new THREE.AmbientLight(AREA_THEMES[0].ambientHex, 1.35)
      : null;
  if (ambientLight) lightingGroup.add(ambientLight);

  const hemiLight =
    typeof THREE.HemisphereLight === 'function'
      ? new THREE.HemisphereLight(0x88e8ff, 0x09061a, 0.95)
      : null;
  if (hemiLight) lightingGroup.add(hemiLight);

  const keyDirLight =
    typeof THREE.DirectionalLight === 'function'
      ? new THREE.DirectionalLight(0xffffff, 1.4)
      : null;
  if (keyDirLight) {
    keyDirLight.position.set(18, 36, 24);
    lightingGroup.add(keyDirLight);
  }

  const playerPointLight =
    typeof THREE.PointLight === 'function'
      ? new THREE.PointLight(0x00f0ff, 2.4, 42, 1.6)
      : null;
  if (playerPointLight) lightingGroup.add(playerPointLight);

  const bossPointLight =
    typeof THREE.PointLight === 'function'
      ? new THREE.PointLight(0xff2a6d, 0, 85, 1.4)
      : null;
  if (bossPointLight) lightingGroup.add(bossPointLight);

  if (scene && !scene.fog && typeof THREE.FogExp2 === 'function') {
    scene.fog = new THREE.FogExp2(AREA_THEMES[0].fogHex, 0.0046);
  }

  // --- A. Continuous 1200m Spline Laser Guide Rails ---
  const corridorGroup = new THREE.Group();
  corridorGroup.name = 'MegastructureCorridor';
  group.add(corridorGroup);

  const RAIL_SAMPLES = 400;
  const railPrimaryMats = [];
  const railSecondaryMats = [];

  const railOffsets = [
    { x: -11.6, y: -6.8, primary: true, opacity: 0.62 },
    { x: 11.6, y: -6.8, primary: true, opacity: 0.62 },
    { x: -11.6, y: 6.8, primary: false, opacity: 0.42 },
    { x: 11.6, y: 6.8, primary: false, opacity: 0.42 },
    { x: -5.2, y: -7.1, primary: false, opacity: 0.48 },
    { x: 5.2, y: -7.1, primary: false, opacity: 0.48 },
    { x: 0.0, y: -7.25, primary: true, opacity: 0.36 },
    { x: 0.0, y: 7.25, primary: false, opacity: 0.26 },
  ];

  {
    const tmpRailVec = new THREE.Vector3();
    for (const spec of railOffsets) {
      const pts = [];
      for (let i = 0; i < RAIL_SAMPLES; i++) {
        const d = (i / RAIL_SAMPLES) * totalLength;
        corridorToWorld(d, spec.x, spec.y, tmpRailVec);
        pts.push([tmpRailVec.x, tmpRailVec.y, tmpRailVec.z]);
      }
      const geom = makeLineLoopGeometry(pts, true);
      const hex = spec.primary ? AREA_THEMES[0].primaryHex : AREA_THEMES[0].secondaryHex;
      const { line, mat } = makeLine(geom, hex, spec.opacity, true);
      corridorGroup.add(line);
      if (spec.primary) railPrimaryMats.push(mat);
      else railSecondaryMats.push(mat);
    }
  }

  // --- B. Station-Quantized Morphing Architectural Megastructure Gates ---
  // Shared reusable BufferGeometries across the 28 active corridor gates!
  const sharedGateGeoms = {
    // Area 0: PHOSPHOR LATTICE — Octagonal vector monolith double-frame + floor/ceiling grid rungs
    a0OuterLattice: makeDoublePolygonStrutGeometry(8, 13.2, 16.4, 0, -1.2, 0),
    a0InnerOct: makeRegularPolygonGeometry(8, 12.6, 0.45, Math.PI / 8),
    a0FloorGrid: makeSegmentsGeometry([
      [-11.6, -6.8, 0], [11.6, -6.8, 0],
      [-11.6, 6.8, 0], [11.6, 6.8, 0],
      [-9.5, -6.8, -3.0], [9.5, -6.8, -3.0],
      [-9.5, -6.8, 3.0], [9.5, -6.8, 3.0],
      [-13.2, -5.5, 0], [-13.2, 5.5, 0],
      [13.2, -5.5, 0], [13.2, 5.5, 0],
    ]),

    // Area 1: FOURIER CATHEDRAL — Parametric 3D Fourier ribbon arch + rotating rose-window ring
    a1FourierArch: makeFourierCurveGeometry({
      samples: 84,
      r1: 14.8,
      r2: 2.35,
      r3: 1.05,
      freq2: 3,
      freq3: 5,
      zAmp: 1.85,
      zFreq: 4,
      openBottom: true,
    }),
    a1RoseWindow: makeFourierCurveGeometry({
      samples: 96,
      r1: 14.2,
      r2: 1.9,
      r3: 1.25,
      freq2: 5,
      freq3: 7,
      zAmp: 0.6,
      zFreq: 6,
      openBottom: false,
    }),

    // Area 2: SUBSPACE CONDUIT — Hexagonal accelerator ring + counter-rotating 6-blade iris gate
    a2HexTunnel: makeDoublePolygonStrutGeometry(6, 13.0, 15.8, 0.9, -1.5, Math.PI / 18),
    a2IrisRing: (() => {
      const segs = [];
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2;
        const a1 = a0 + 0.42;
        const a2 = a0 + 0.85;
        segs.push(
          [Math.cos(a0) * 15.4, Math.sin(a0) * 15.4, 0],
          [Math.cos(a1) * 11.9, Math.sin(a1) * 11.9, 0.65],
          [Math.cos(a1) * 11.9, Math.sin(a1) * 11.9, 0.65],
          [Math.cos(a2) * 15.4, Math.sin(a2) * 15.4, 0]
        );
      }
      return makeSegmentsGeometry(segs);
    })(),

    // Area 3: SINGULARITY CORE — Colossal concentric 3-axis gyroscope cathedral rings
    a3GyroOuter: makeDoublePolygonStrutGeometry(16, 16.5, 18.2, -0.4, 0.4, Math.PI / 16),
    a3GyroMid: makeRegularPolygonGeometry(24, 15.0, 0, 0),
    a3GyroInner: makeDoublePolygonStrutGeometry(12, 13.4, 14.4, -0.8, 0.8, 0),
  };

  const gatesGroup = new THREE.Group();
  gatesGroup.name = 'MegastructureGates';
  corridorGroup.add(gatesGroup);

  const gatePrimaryMat = new THREE.LineBasicMaterial({
    color: AREA_THEMES[0].primaryHex,
    transparent: true,
    opacity: 0.82,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const gateSecondaryMat = new THREE.LineBasicMaterial({
    color: AREA_THEMES[0].secondaryHex,
    transparent: true,
    opacity: 0.64,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const gateAccentMat = new THREE.LineBasicMaterial({
    color: AREA_THEMES[0].accentHex,
    transparent: true,
    opacity: 0.72,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const gateNodePillarMat = new THREE.MeshStandardMaterial({
    color: 0x0b1328,
    emissive: AREA_THEMES[0].primaryHex,
    emissiveIntensity: 1.25,
    roughness: 0.25,
    metalness: 0.78,
  });

  const pillarBoxGeom = new THREE.BoxGeometry(0.55, 2.4, 0.55);
  const LineSegCls = THREE.LineSegments || THREE.Line;

  const corridorGates = [];
  for (let i = 0; i < GATE_COUNT; i++) {
    const root = new THREE.Group();
    const pulseNode = new THREE.Group();
    root.add(pulseNode);

    // Area 0 sub-assembly
    const area0 = new THREE.Group();
    area0.add(new LineSegCls(sharedGateGeoms.a0OuterLattice, gatePrimaryMat));
    area0.add(new THREE.Line(sharedGateGeoms.a0InnerOct, gateAccentMat));
    area0.add(new LineSegCls(sharedGateGeoms.a0FloorGrid, gateSecondaryMat));
    const leftPillar = new THREE.Mesh(pillarBoxGeom, gateNodePillarMat);
    leftPillar.position.set(-13.4, 0, 0);
    const rightPillar = new THREE.Mesh(pillarBoxGeom, gateNodePillarMat);
    rightPillar.position.set(13.4, 0, 0);
    area0.add(leftPillar, rightPillar);
    pulseNode.add(area0);

    // Area 1 sub-assembly (Fourier Cathedral)
    const area1 = new THREE.Group();
    const archLine = new THREE.Line(sharedGateGeoms.a1FourierArch, gatePrimaryMat);
    const roseRotor = new THREE.Line(sharedGateGeoms.a1RoseWindow, gateSecondaryMat);
    area1.add(archLine, roseRotor);
    area1.visible = false;
    pulseNode.add(area1);

    // Area 2 sub-assembly (Subspace Conduit)
    const area2 = new THREE.Group();
    const hexFrame = new LineSegCls(sharedGateGeoms.a2HexTunnel, gatePrimaryMat);
    const irisA = new LineSegCls(sharedGateGeoms.a2IrisRing, gateSecondaryMat);
    const irisB = new LineSegCls(sharedGateGeoms.a2IrisRing, gateAccentMat);
    irisB.rotation.z = Math.PI / 6;
    area2.add(hexFrame, irisA, irisB);
    area2.visible = false;
    pulseNode.add(area2);

    // Area 3 sub-assembly (Singularity Core Gyroscopes)
    const area3 = new THREE.Group();
    const gyroOuter = new LineSegCls(sharedGateGeoms.a3GyroOuter, gatePrimaryMat);
    const gyroMid = new THREE.Line(sharedGateGeoms.a3GyroMid, gateSecondaryMat);
    const gyroInner = new LineSegCls(sharedGateGeoms.a3GyroInner, gateAccentMat);
    area3.add(gyroOuter, gyroMid, gyroInner);
    area3.visible = false;
    pulseNode.add(area3);

    gatesGroup.add(root);
    corridorGates.push({
      index: i,
      root,
      pulseNode,
      assemblies: [area0, area1, area2, area3],
      roseRotor,
      irisA,
      irisB,
      gyroOuter,
      gyroMid,
      gyroInner,
      stationIndex: -999999,
    });
  }

  // --- C. Synesthetic Corridor Particle Star-Streams ---
  const rng = makeRng(909124);
  const starMoteOffsets = [];
  const starPositions = new Float32Array(STAR_MOTE_COUNT * 3);
  for (let i = 0; i < STAR_MOTE_COUNT; i++) {
    const angle = rng() * Math.PI * 2;
    const rad = 9.8 + rng() * 16.5;
    const localDist = i * (260.0 / STAR_MOTE_COUNT);
    const ox = Math.cos(angle) * rad;
    const oy = Math.sin(angle) * rad * 0.72;
    starMoteOffsets.push({
      relDist: localDist,
      ox,
      oy,
      driftPhase: rng() * Math.PI * 2,
      speedMul: 0.65 + rng() * 0.85,
    });
    corridorToWorld(localDist, ox, oy, scratchPt);
    starPositions[i * 3] = scratchPt.x;
    starPositions[i * 3 + 1] = scratchPt.y;
    starPositions[i * 3 + 2] = scratchPt.z;
  }
  const starGeom = new THREE.BufferGeometry();
  const starPosAttr = makeBufferAttr(starPositions, 3);
  if (typeof starGeom.setAttribute === 'function') {
    starGeom.setAttribute('position', starPosAttr);
  }
  const starMat =
    typeof THREE.PointsMaterial === 'function'
      ? new THREE.PointsMaterial({
          color: AREA_THEMES[0].accentHex,
          size: 0.42,
          transparent: true,
          opacity: 0.78,
          blending: ADDITIVE,
          depthWrite: false,
        })
      : new THREE.MeshBasicMaterial({ color: AREA_THEMES[0].accentHex });
  const starPoints =
    typeof THREE.Points === 'function'
      ? new THREE.Points(starGeom, starMat)
      : new THREE.Group();
  corridorGroup.add(starPoints);

  // --- Area State & Smooth Morphing ---
  let currentAreaIndex = 0;
  let areaWeights = [1, 0, 0, 0];
  let blendedPrimaryHex = AREA_THEMES[0].primaryHex;
  let blendedSecondaryHex = AREA_THEMES[0].secondaryHex;
  let blendedAccentHex = AREA_THEMES[0].accentHex;
  let blendedFogHex = AREA_THEMES[0].fogHex;

  function applyPaletteHexes(primaryHex, secondaryHex, accentHex, fogHex, ambientHex, rimHex) {
    setColorSafe(gatePrimaryMat.color, primaryHex);
    setColorSafe(gateSecondaryMat.color, secondaryHex);
    setColorSafe(gateAccentMat.color, accentHex);
    setColorSafe(gateNodePillarMat.emissive, primaryHex);
    setColorSafe(starMat.color, accentHex);

    for (const m of railPrimaryMats) setColorSafe(m.color, primaryHex);
    for (const m of railSecondaryMats) setColorSafe(m.color, secondaryHex);

    if (ambientLight) setColorSafe(ambientLight.color, ambientHex);
    if (hemiLight) setColorSafe(hemiLight.color, rimHex);
    if (scene?.fog?.color) setColorSafe(scene.fog.color, fogHex);
  }

  function updateGateAreaMorph() {
    for (const g of corridorGates) {
      for (let a = 0; a < 4; a++) {
        const w = areaWeights[a];
        const sub = g.assemblies[a];
        sub.visible = w > 0.02;
        if (sub.visible) {
          const sc = 0.72 + 0.28 * w;
          sub.scale.setScalar(finiteOr(sc, 1));
        }
      }
    }
  }

  function setArea(areaIndex) {
    const nextIdx = clamp(Math.round(finiteOr(areaIndex, 0)), 0, 3);
    const changed = nextIdx !== currentAreaIndex;
    currentAreaIndex = nextIdx;
    // Ensure target area assembly becomes immediately visible even before next dt step
    if (areaWeights[nextIdx] < 0.25) {
      for (let a = 0; a < 4; a++) {
        areaWeights[a] = a === nextIdx ? Math.max(areaWeights[a], 0.35) : areaWeights[a] * 0.65;
      }
      const theme = AREA_THEMES[nextIdx];
      blendedPrimaryHex = lerpHex(blendedPrimaryHex, theme.primaryHex, 0.5);
      blendedSecondaryHex = lerpHex(blendedSecondaryHex, theme.secondaryHex, 0.5);
      blendedAccentHex = lerpHex(blendedAccentHex, theme.accentHex, 0.5);
      blendedFogHex = lerpHex(blendedFogHex, theme.fogHex, 0.5);
      applyPaletteHexes(
        blendedPrimaryHex,
        blendedSecondaryHex,
        blendedAccentHex,
        blendedFogHex,
        theme.ambientHex,
        theme.rimHex
      );
      updateGateAreaMorph();
    }
    return changed;
  }

  // Initialize gates along the first 336m of the spline immediately
  function layoutGatesAtDist(corridorDist, elapsed = 0, beatPulse = 0) {
    const baseStation = Math.floor((finiteOr(corridorDist, 0) - 24.0) / GATE_SPACING);
    for (let i = 0; i < GATE_COUNT; i++) {
      const st = baseStation + i;
      const gate = corridorGates[i];
      const gateDist = st * GATE_SPACING;
      sampleCorridorInto(gateDist, scratchPt, scratchTan, scratchRight, scratchUp);
      gate.root.position.copy(scratchPt);
      applyCorridorBasis(gate.root, scratchRight, scratchUp, scratchTan);
      gate.stationIndex = st;

      const parity = st & 1 ? 1 : -1;
      const waveBeat = beatPulse * (0.055 + 0.03 * Math.sin(st * 0.75 - elapsed * 4.0));
      gate.pulseNode.scale.setScalar(finiteOr(1.0 + waveBeat, 1));

      if (gate.assemblies[1].visible) {
        gate.roseRotor.rotation.z = elapsed * 0.55 * parity + st * 0.28;
      }
      if (gate.assemblies[2].visible) {
        gate.irisA.rotation.z = elapsed * 1.15 * parity + st * 0.2;
        gate.irisB.rotation.z = -elapsed * 1.15 * parity + Math.PI / 6;
        const irisBreathe = 0.93 + 0.09 * beatPulse;
        gate.irisA.scale.setScalar(irisBreathe);
      }
      if (gate.assemblies[3].visible) {
        gate.gyroOuter.rotation.z = elapsed * 0.48 * parity;
        gate.gyroMid.rotation.x = Math.sin(elapsed * 0.7 + st * 0.4) * 0.32;
        gate.gyroMid.rotation.y = Math.cos(elapsed * 0.6 + st * 0.3) * 0.32;
        gate.gyroInner.rotation.z = -elapsed * 0.95 * parity;
      }
    }
  }
  layoutGatesAtDist(0, 0, 0);

  // --------------------------------------------------------------------------
  // 3. 3-STAGE EVOLVING PLAYER VECTOR CRAFT + ION WAKES + BARREL ROLL SHIELD
  // --------------------------------------------------------------------------
  const playerGroup = new THREE.Group();
  playerGroup.name = 'PlayerVectorCraft';
  group.add(playerGroup);

  const craftTiltNode = new THREE.Group();
  const craftRollNode = new THREE.Group();
  playerGroup.add(craftTiltNode);
  craftTiltNode.add(craftRollNode);

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x091326,
    emissive: 0x00587a,
    emissiveIntensity: 0.85,
    roughness: 0.2,
    metalness: 0.86,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xaef8ff,
    emissive: 0x00f0ff,
    emissiveIntensity: 1.75,
    roughness: 0.1,
    metalness: 0.3,
  });
  const craftWireCyanMat = new THREE.LineBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.95,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const craftGoldMat = new THREE.MeshStandardMaterial({
    color: 0x201508,
    emissive: 0xffd166,
    emissiveIntensity: 1.45,
    roughness: 0.18,
    metalness: 0.75,
  });
  const craftSeraphWingMat = new THREE.MeshBasicMaterial({
    color: 0x7df9ff,
    transparent: true,
    opacity: 0.46,
    side: DOUBLE_SIDE,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const craftHaloMat = new THREE.LineBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.92,
    blending: ADDITIVE,
    depthWrite: false,
  });

  // --- Stage 1: VECTOR DART (Always-on sleek swept-wing delta interceptor) ---
  const stage1Group = new THREE.Group();
  stage1Group.name = 'EvolutionStage1_VectorDart';
  craftRollNode.add(stage1Group);

  {
    // Forward nose cone pointing along local -Z
    const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.68, 3.3, 4), hullMat);
    noseCone.rotation.x = -Math.PI * 0.5;
    noseCone.rotation.y = Math.PI * 0.25;
    noseCone.position.set(0, 0, -0.55);
    stage1Group.add(noseCone);

    // Cockpit crystal prism
    const canopy = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), canopyMat);
    canopy.scale.set(0.75, 0.58, 1.9);
    canopy.position.set(0, 0.26, -0.35);
    stage1Group.add(canopy);

    // Swept delta wings (port & starboard)
    const wingPlateGeom = new THREE.BoxGeometry(1.75, 0.09, 1.45);
    const leftWing = new THREE.Mesh(wingPlateGeom, hullMat);
    leftWing.position.set(-1.05, -0.04, 0.38);
    leftWing.rotation.set(0, 0.42, -0.11);
    const rightWing = new THREE.Mesh(wingPlateGeom, hullMat);
    rightWing.position.set(1.05, -0.04, 0.38);
    rightWing.rotation.set(0, -0.42, 0.11);
    stage1Group.add(leftWing, rightWing);

    // Twin engine nacelles + glowing exhaust cores at local +Z
    const nacelleGeom = new THREE.CylinderGeometry(0.18, 0.24, 1.35, 6);
    const exhaustGeom = new THREE.OctahedronGeometry(0.22, 0);
    for (const side of [-1, 1]) {
      const nac = new THREE.Mesh(nacelleGeom, hullMat);
      nac.rotation.x = Math.PI * 0.5;
      nac.position.set(side * 0.52, -0.06, 0.72);
      const flare = new THREE.Mesh(exhaustGeom, canopyMat);
      flare.position.set(side * 0.52, -0.06, 1.42);
      stage1Group.add(nac, flare);
    }

    // Crisp phosphor-cyan vector wireframe skeleton over the delta interceptor
    const dartWireSegs = [
      // Spine & nose
      [0, 0.18, -2.25], [0, 0.42, 0.95],
      [0, 0.18, -2.25], [-0.55, -0.06, 1.35],
      [0, 0.18, -2.25], [0.55, -0.06, 1.35],
      // Swept delta leading & trailing edges
      [0, 0.08, -1.65], [-2.05, -0.16, 1.15],
      [-2.05, -0.16, 1.15], [-0.52, -0.06, 1.42],
      [0, 0.08, -1.65], [2.05, -0.16, 1.15],
      [2.05, -0.16, 1.15], [0.52, -0.06, 1.42],
      // Wingtip vertical stabilizers
      [-2.05, -0.16, 1.15], [-1.85, 0.42, 1.35],
      [2.05, -0.16, 1.15], [1.85, 0.42, 1.35],
      [-0.52, -0.06, 1.42], [0.52, -0.06, 1.42],
    ];
    stage1Group.add(new LineSegCls(makeSegmentsGeometry(dartWireSegs), craftWireCyanMat));
  }

  // --- Stage 2: HARMONIC VALKYRIE (Unfolded forward canards + 4 orbiting wing-pods) ---
  const stage2Group = new THREE.Group();
  stage2Group.name = 'EvolutionStage2_HarmonicValkyrie';
  stage2Group.visible = false;
  craftRollNode.add(stage2Group);

  const stage2PodOrbitNode = new THREE.Group();
  stage2Group.add(stage2PodOrbitNode);
  const wingPodMeshes = [];

  {
    const canardGeom = new THREE.BoxGeometry(1.15, 0.07, 0.55);
    const leftCanard = new THREE.Mesh(canardGeom, craftGoldMat);
    leftCanard.position.set(-0.78, 0.05, -0.92);
    leftCanard.rotation.set(0, -0.45, 0.14);
    const rightCanard = new THREE.Mesh(canardGeom, craftGoldMat);
    rightCanard.position.set(0.78, 0.05, -0.92);
    rightCanard.rotation.set(0, 0.45, -0.14);

    const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.25, 4), craftGoldMat);
    dorsalFin.position.set(0, 0.58, 0.55);
    dorsalFin.rotation.x = -0.55;
    stage2Group.add(leftCanard, rightCanard, dorsalFin);

    const canardWire = makeSegmentsGeometry([
      [0, 0.1, -1.45], [-1.38, 0.16, -0.72],
      [-1.38, 0.16, -0.72], [-0.45, 0.04, -0.62],
      [0, 0.1, -1.45], [1.38, 0.16, -0.72],
      [1.38, 0.16, -0.72], [0.45, 0.04, -0.62],
    ]);
    stage2Group.add(new LineSegCls(canardWire, craftHaloMat));

    // 4 Orbiting Crystalline Wing-Pods
    const podOctGeom = new THREE.OctahedronGeometry(0.28, 0);
    const podRingGeom = makeRegularPolygonGeometry(6, 0.44, 0, 0);
    const podCoords = [
      [-2.35, 0.65, 0.25],
      [2.35, 0.65, 0.25],
      [-2.15, -0.72, 0.55],
      [2.15, -0.72, 0.55],
    ];
    for (let i = 0; i < 4; i++) {
      const podHolder = new THREE.Group();
      podHolder.position.set(podCoords[i][0], podCoords[i][1], podCoords[i][2]);
      const crystal = new THREE.Mesh(podOctGeom, craftGoldMat);
      crystal.scale.set(0.85, 0.85, 1.55);
      const ring = new THREE.Line(podRingGeom, craftWireCyanMat);
      podHolder.add(crystal, ring);
      stage2PodOrbitNode.add(podHolder);
      wingPodMeshes.push({ holder: podHolder, crystal, ring, basePos: podCoords[i] });
    }
  }

  // --- Stage 3: SYNESTHETIC SERAPH (Radiant Halo Ring + 6 Articulated Light-Wings) ---
  const stage3Group = new THREE.Group();
  stage3Group.name = 'EvolutionStage3_SynestheticSeraph';
  stage3Group.visible = false;
  craftRollNode.add(stage3Group);

  const seraphHaloGroup = new THREE.Group();
  seraphHaloGroup.position.set(0, 0.62, 1.18);
  stage3Group.add(seraphHaloGroup);
  const seraphWings = [];

  {
    seraphHaloGroup.add(new THREE.Line(makeRegularPolygonGeometry(8, 1.55, 0, 0), craftHaloMat));
    seraphHaloGroup.add(
      new THREE.Line(makeRegularPolygonGeometry(16, 1.85, -0.08, Math.PI / 16), craftWireCyanMat)
    );

    // 6 Articulated Light-Wings (3 starboard, 3 port)
    const wingBladeGeom = new THREE.ConeGeometry(0.32, 2.65, 4);
    const wingOutlineGeom = makeSegmentsGeometry([
      [0, 0, 0], [0, 2.6, 0],
      [-0.28, 0.55, 0], [0, 2.6, 0],
      [0.28, 0.55, 0], [0, 2.6, 0],
    ]);
    const wingAngles = [0.58, 0.12, -0.36];
    for (let tier = 0; tier < 3; tier++) {
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.65, 0.18 - tier * 0.12, 0.62 + tier * 0.22);
        const blade = new THREE.Mesh(wingBladeGeom, craftSeraphWingMat);
        blade.scale.set(0.45, 1.0, 1.35);
        blade.position.set(0, 1.35, 0);
        const edge = new LineSegCls(wingOutlineGeom, tier === 1 ? craftHaloMat : craftWireCyanMat);
        pivot.add(blade, edge);
        // Fan wings outward to port (-X) and starboard (+X)
        const baseZ = -side * (Math.PI * 0.42 - wingAngles[tier] * 0.55);
        pivot.rotation.set(-0.28 - tier * 0.1, side * 0.18, baseZ);
        stage3Group.add(pivot);
        seraphWings.push({ pivot, side, tier, baseZ });
      }
    }
  }

  // --- Barrel Roll Hexagonal Wireframe Deflector Sphere ---
  const barrelShieldGroup = new THREE.Group();
  barrelShieldGroup.name = 'BarrelRollDeflector';
  barrelShieldGroup.visible = false;
  playerGroup.add(barrelShieldGroup);

  const barrelShieldWireMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    wireframe: true,
    transparent: true,
    opacity: 0.72,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const barrelShieldRingMat = new THREE.LineBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.9,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const barrelShieldSphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.65, 1),
    barrelShieldWireMat
  );
  const barrelShieldHexRing = new THREE.Line(
    makeRegularPolygonGeometry(6, 2.95, 0, 0),
    barrelShieldRingMat
  );
  barrelShieldGroup.add(barrelShieldSphere, barrelShieldHexRing);

  // --- Twin Dynamic Ion Wake Ribbons (World-Space History Trail) ---
  const ionWakeGroup = new THREE.Group();
  ionWakeGroup.name = 'PlayerIonWakes';
  group.add(ionWakeGroup);

  const ionWakes = [-1, 1].map((side) => {
    const f32 = new Float32Array(WAKE_SEGMENTS * 3);
    const geom = new THREE.BufferGeometry();
    const attr = makeBufferAttr(f32, 3);
    if (typeof geom.setAttribute === 'function') {
      geom.setAttribute('position', attr);
    }
    const { line, mat } = makeLine(geom, 0x00f0ff, 0.78, true);
    ionWakeGroup.add(line);
    const history = [];
    for (let i = 0; i < WAKE_SEGMENTS; i++) {
      history.push(new THREE.Vector3(side * 0.52, 0, i * 0.65));
    }
    return { side, line, mat, attr, f32, history, initialized: false };
  });

  // --------------------------------------------------------------------------
  // 4. ENEMY FORMATIONS, PLASMA BOLTS & 3-PHASE BOSS (SERAPH-IX)
  // --------------------------------------------------------------------------
  const enemiesGroup = new THREE.Group();
  enemiesGroup.name = 'EnemyFormations';
  group.add(enemiesGroup);

  const boltsGroup = new THREE.Group();
  boltsGroup.name = 'PlasmaBolts';
  group.add(boltsGroup);

  const sharedEnemyGeoms = {
    oct: new THREE.OctahedronGeometry(1.15, 0),
    smallOct: new THREE.OctahedronGeometry(0.62, 0),
    icosa: new THREE.IcosahedronGeometry(1.05, 0),
    prismCore: new THREE.OctahedronGeometry(1.75, 0),
    prismPlate: new THREE.BoxGeometry(0.42, 1.95, 2.45),
    cubeOuter: new THREE.BoxGeometry(1.65, 1.65, 1.65),
    cubeInner: new THREE.BoxGeometry(0.92, 0.92, 0.92),
    spikeCyl: new THREE.CylinderGeometry(0.08, 0.2, 2.9, 5),
    ringOct: makeRegularPolygonGeometry(8, 1.85, 0, 0),
    ringHex: makeRegularPolygonGeometry(6, 1.55, 0, 0),
    lockHighlight: makeRegularPolygonGeometry(4, 2.35, 0, Math.PI * 0.25),
    boltCore: new THREE.OctahedronGeometry(0.45, 0),
    boltHalo: makeRegularPolygonGeometry(6, 0.78, 0, 0),
  };

  const sharedEnemyMats = {
    bitSolid: new THREE.MeshStandardMaterial({
      color: 0x0d1b38,
      emissive: 0x00e5ff,
      emissiveIntensity: 1.4,
      roughness: 0.22,
      metalness: 0.8,
    }),
    bitWire: new THREE.LineBasicMaterial({
      color: 0x7df9ff,
      transparent: true,
      opacity: 0.9,
      blending: ADDITIVE,
      depthWrite: false,
    }),
    weaverSolid: new THREE.MeshStandardMaterial({
      color: 0x2a1026,
      emissive: 0xff2a85,
      emissiveIntensity: 1.45,
      roughness: 0.25,
      metalness: 0.75,
    }),
    weaverRingA: new THREE.LineBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.92,
      blending: ADDITIVE,
      depthWrite: false,
    }),
    weaverRingB: new THREE.LineBasicMaterial({
      color: 0xff2a85,
      transparent: true,
      opacity: 0.88,
      blending: ADDITIVE,
      depthWrite: false,
    }),
    prismSolid: new THREE.MeshStandardMaterial({
      color: 0x160f2e,
      emissive: 0x9d4edd,
      emissiveIntensity: 1.35,
      roughness: 0.18,
      metalness: 0.88,
    }),
    prismAccent: new THREE.MeshStandardMaterial({
      color: 0x082a22,
      emissive: 0x1affb2,
      emissiveIntensity: 1.55,
      roughness: 0.2,
      metalness: 0.8,
    }),
    prismWire: new THREE.LineBasicMaterial({
      color: 0x1affb2,
      transparent: true,
      opacity: 0.92,
      blending: ADDITIVE,
      depthWrite: false,
    }),
    mineSolid: new THREE.MeshStandardMaterial({
      color: 0x2b0812,
      emissive: 0xff2a6d,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.7,
    }),
    mineSpike: new THREE.MeshBasicMaterial({
      color: 0xff9e00,
    }),
    mineWire: new THREE.LineBasicMaterial({
      color: 0xff2a6d,
      transparent: true,
      opacity: 0.85,
      blending: ADDITIVE,
      depthWrite: false,
    }),
    cubeOuter: new THREE.MeshBasicMaterial({
      color: 0x00b4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.92,
      blending: ADDITIVE,
      depthWrite: false,
    }),
    cubeInner: new THREE.MeshStandardMaterial({
      color: 0x80e5ff,
      emissive: 0x0096ff,
      emissiveIntensity: 1.85,
      roughness: 0.12,
      metalness: 0.4,
    }),
    lockRing: new THREE.LineBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.95,
      blending: ADDITIVE,
      depthWrite: false,
    }),
    enemyBoltCore: new THREE.MeshBasicMaterial({
      color: 0xff2a6d,
    }),
    enemyBoltRing: new THREE.LineBasicMaterial({
      color: 0xffb3c6,
      transparent: true,
      opacity: 0.9,
      blending: ADDITIVE,
      depthWrite: false,
    }),
  };

  function buildEnemyVisual(archetype) {
    const kind = String(archetype || 'bit').toLowerCase();
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);

    const spinners = [];
    let worldRadius = 1.65;

    if (kind === 'weaver') {
      worldRadius = 2.0;
      const core = new THREE.Mesh(sharedEnemyGeoms.smallOct, sharedEnemyMats.weaverSolid);
      const ringA = new THREE.Line(sharedEnemyGeoms.ringOct, sharedEnemyMats.weaverRingA);
      const ringB = new THREE.Line(sharedEnemyGeoms.ringOct, sharedEnemyMats.weaverRingB);
      ringB.rotation.x = Math.PI * 0.5;
      body.add(core, ringA, ringB);
      spinners.push(
        { obj: core, axis: 'y', speed: 2.8 },
        { obj: ringA, axis: 'z', speed: 2.2 },
        { obj: ringA, axis: 'x', speed: 1.1 },
        { obj: ringB, axis: 'y', speed: -2.6 }
      );
    } else if (kind === 'prism') {
      worldRadius = 2.75;
      const cruiserHull = new THREE.Mesh(sharedEnemyGeoms.prismCore, sharedEnemyMats.prismSolid);
      cruiserHull.scale.set(1.15, 0.88, 1.95);
      const portShield = new THREE.Mesh(sharedEnemyGeoms.prismPlate, sharedEnemyMats.prismAccent);
      portShield.position.set(-1.65, 0, 0);
      const stbdShield = new THREE.Mesh(sharedEnemyGeoms.prismPlate, sharedEnemyMats.prismAccent);
      stbdShield.position.set(1.65, 0, 0);
      const halo = new THREE.Line(sharedEnemyGeoms.ringHex, sharedEnemyMats.prismWire);
      halo.scale.setScalar(1.45);
      body.add(cruiserHull, portShield, stbdShield, halo);
      spinners.push(
        { obj: cruiserHull, axis: 'z', speed: 0.65 },
        { obj: halo, axis: 'z', speed: -1.8 }
      );
    } else if (kind === 'mine') {
      worldRadius = 1.85;
      const core = new THREE.Mesh(sharedEnemyGeoms.icosa, sharedEnemyMats.mineSolid);
      const sX = new THREE.Mesh(sharedEnemyGeoms.spikeCyl, sharedEnemyMats.mineSpike);
      sX.rotation.z = Math.PI * 0.5;
      const sY = new THREE.Mesh(sharedEnemyGeoms.spikeCyl, sharedEnemyMats.mineSpike);
      const sZ = new THREE.Mesh(sharedEnemyGeoms.spikeCyl, sharedEnemyMats.mineSpike);
      sZ.rotation.x = Math.PI * 0.5;
      const warnRing = new THREE.Line(sharedEnemyGeoms.ringHex, sharedEnemyMats.mineWire);
      body.add(core, sX, sY, sZ, warnRing);
      spinners.push(
        { obj: body, axis: 'x', speed: 1.3 },
        { obj: body, axis: 'y', speed: 1.7 },
        { obj: warnRing, axis: 'z', speed: -3.2 }
      );
    } else if (kind === 'cube') {
      worldRadius = 1.65;
      const outer = new THREE.Mesh(sharedEnemyGeoms.cubeOuter, sharedEnemyMats.cubeOuter);
      const inner = new THREE.Mesh(sharedEnemyGeoms.cubeInner, sharedEnemyMats.cubeInner);
      body.add(outer, inner);
      spinners.push(
        { obj: outer, axis: 'x', speed: 1.2 },
        { obj: outer, axis: 'y', speed: 1.6 },
        { obj: inner, axis: 'z', speed: -2.4 },
        { obj: inner, axis: 'x', speed: -1.9 }
      );
    } else {
      // 'bit' | 'swarmer' | default spinning neon octahedron + diamond orbit frame
      worldRadius = kind === 'swarmer' ? 1.35 : 1.6;
      const oct = new THREE.Mesh(sharedEnemyGeoms.oct, sharedEnemyMats.bitSolid);
      if (kind === 'swarmer') oct.scale.set(0.78, 0.62, 1.55);
      const frame = new THREE.Line(sharedEnemyGeoms.ringHex, sharedEnemyMats.bitWire);
      frame.scale.setScalar(0.92);
      body.add(oct, frame);
      spinners.push(
        { obj: oct, axis: 'y', speed: 3.1 },
        { obj: oct, axis: 'x', speed: 1.5 },
        { obj: frame, axis: 'z', speed: -2.4 }
      );
    }

    const lockBracket3d = new THREE.Line(
      sharedEnemyGeoms.lockHighlight,
      sharedEnemyMats.lockRing
    );
    lockBracket3d.visible = false;
    root.add(lockBracket3d);

    enemiesGroup.add(root);
    return {
      kind,
      root,
      body,
      spinners,
      lockBracket3d,
      worldRadius,
      worldPos: new THREE.Vector3(),
      rawId: null,
      lockable: true,
    };
  }

  const activeEnemyRecords = new Map();

  // --- Enemy Plasma Bolt Pool ---
  const boltPool = [];
  function acquireBoltVisual(idx) {
    while (boltPool.length <= idx) {
      const root = new THREE.Group();
      const core = new THREE.Mesh(sharedEnemyGeoms.boltCore, sharedEnemyMats.enemyBoltCore);
      core.scale.set(0.95, 0.95, 2.2);
      const ring = new THREE.Line(sharedEnemyGeoms.boltHalo, sharedEnemyMats.enemyBoltRing);
      root.add(core, ring);
      root.visible = false;
      boltsGroup.add(root);
      boltPool.push({ root, core, ring });
    }
    return boltPool[idx];
  }

  // --- 3-Phase Morphing Boss: SERAPH-IX ---
  const bossGroup = new THREE.Group();
  bossGroup.name = 'Boss_SERAPH_IX';
  bossGroup.visible = false;
  group.add(bossGroup);

  const bossCoreMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xff2a6d,
    emissiveIntensity: 2.2,
    roughness: 0.1,
    metalness: 0.5,
  });
  const bossCageWireMat = new THREE.MeshBasicMaterial({
    color: 0xff2a6d,
    wireframe: true,
    transparent: true,
    opacity: 0.86,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const bossWingLineMat = new THREE.LineBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.92,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const bossWingMembraneMat = new THREE.MeshBasicMaterial({
    color: 0xff2a6d,
    transparent: true,
    opacity: 0.34,
    side: DOUBLE_SIDE,
    blending: ADDITIVE,
    depthWrite: false,
  });
  const bossNodeMat = new THREE.MeshStandardMaterial({
    color: 0x1a0822,
    emissive: 0x00f0ff,
    emissiveIntensity: 1.9,
    roughness: 0.15,
    metalness: 0.65,
  });
  const bossTelegraphMat = new THREE.LineBasicMaterial({
    color: 0xe8f9ff,
    transparent: true,
    opacity: 0.88,
    blending: ADDITIVE,
    depthWrite: false,
  });

  // Phase 1: Outer Rotating Icosahedral Wireframe Cage
  const bossCageOuter = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5.6, 1),
    bossCageWireMat
  );
  const bossCageInner = new THREE.Mesh(
    new THREE.OctahedronGeometry(3.9, 0),
    bossCageWireMat
  );
  bossGroup.add(bossCageOuter, bossCageInner);

  // Phase 2: 4 Unfolding Parametric Harmonic Wing-Blades + Telegraph Cores
  const bossWingsGroup = new THREE.Group();
  bossGroup.add(bossWingsGroup);
  const bossWingBlades = [];
  {
    const wingFourierGeom = makeFourierCurveGeometry({
      samples: 64,
      r1: 4.2,
      r2: 1.15,
      r3: 0.55,
      freq2: 3,
      freq3: 5,
      zAmp: 0.75,
      zFreq: 3,
      openBottom: false,
    });
    const bladeConeGeom = new THREE.ConeGeometry(1.35, 7.6, 4);
    for (let i = 0; i < 4; i++) {
      const baseAngle = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const pivot = new THREE.Group();
      pivot.rotation.z = baseAngle;

      const arm = new THREE.Group();
      const membrane = new THREE.Mesh(bladeConeGeom, bossWingMembraneMat);
      membrane.position.set(5.4, 0, 0);
      membrane.rotation.z = -Math.PI * 0.5;
      membrane.scale.set(0.65, 1.0, 0.28);

      const fourierRib = new THREE.Line(wingFourierGeom, bossWingLineMat);
      fourierRib.position.set(5.6, 0, 0);
      fourierRib.scale.set(1.15, 0.46, 0.8);

      const telegraphHalo = new THREE.Line(
        makeRegularPolygonGeometry(8, 1.45, 0, 0),
        bossTelegraphMat
      );
      telegraphHalo.position.set(6.2, 0, 0.4);

      arm.add(membrane, fourierRib, telegraphHalo);
      pivot.add(arm);
      bossWingsGroup.add(pivot);
      bossWingBlades.push({ pivot, arm, fourierRib, telegraphHalo, baseAngle });
    }
  }

  // Phase 3: Blazing Stellated-Octahedron Singularity Core + 3 Gyroscope Rings
  const bossSingularityGroup = new THREE.Group();
  bossGroup.add(bossSingularityGroup);

  const bossStarCoreA = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.35, 0),
    bossCoreMat
  );
  const bossStarCoreB = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.35, 0),
    bossCoreMat
  );
  bossStarCoreB.rotation.set(Math.PI * 0.25, Math.PI * 0.25, 0);
  const bossCoreGyro1 = new THREE.Line(
    makeRegularPolygonGeometry(12, 3.15, 0, 0),
    bossTelegraphMat
  );
  const bossCoreGyro2 = new THREE.Line(
    makeRegularPolygonGeometry(12, 3.65, 0, 0),
    bossWingLineMat
  );
  bossCoreGyro2.rotation.x = Math.PI * 0.5;
  const bossCoreGyro3 = new THREE.Line(
    makeRegularPolygonGeometry(16, 4.2, 0, 0),
    sharedEnemyMats.weaverRingB
  );
  bossCoreGyro3.rotation.y = Math.PI * 0.5;
  bossSingularityGroup.add(
    bossStarCoreA,
    bossStarCoreB,
    bossCoreGyro1,
    bossCoreGyro2,
    bossCoreGyro3
  );

  // World-space Boss Weak-Point Nodes (Shield Nodes in Phase 1 / Wing Emitters in Phase 2 / Core Nodes)
  const bossNodesWorldGroup = new THREE.Group();
  bossNodesWorldGroup.name = 'BossWeakPointNodes';
  group.add(bossNodesWorldGroup);

  const bossNodePool = [];
  function acquireBossNodeVisual(idx) {
    while (bossNodePool.length <= idx) {
      const root = new THREE.Group();
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 0), bossNodeMat);
      const orbitRing = new THREE.Line(
        makeRegularPolygonGeometry(6, 1.85, 0, 0),
        bossTelegraphMat
      );
      const lockRing = new THREE.Line(
        sharedEnemyGeoms.lockHighlight,
        sharedEnemyMats.lockRing
      );
      lockRing.scale.setScalar(1.1);
      lockRing.visible = false;

      // Energy tether line connecting node back to SERAPH-IX center
      const tetherF32 = new Float32Array(6);
      const tetherGeom = new THREE.BufferGeometry();
      const tetherAttr = makeBufferAttr(tetherF32, 3);
      if (typeof tetherGeom.setAttribute === 'function') {
        tetherGeom.setAttribute('position', tetherAttr);
      }
      const { line: tetherLine, mat: tetherMat } = makeLine(tetherGeom, 0x00f0ff, 0.55, true);

      root.add(gem, orbitRing, lockRing);
      root.visible = false;
      tetherLine.visible = false;
      bossNodesWorldGroup.add(root, tetherLine);
      bossNodePool.push({
        root,
        gem,
        orbitRing,
        lockRing,
        tetherLine,
        tetherAttr,
        tetherF32,
        tetherMat,
        worldPos: new THREE.Vector3(),
        rawId: null,
        worldRadius: 1.95,
        lockable: true,
      });
    }
    return bossNodePool[idx];
  }

  // --------------------------------------------------------------------------
  // 5. CURVING BEZIER HOMING SALVO BEAMS, VULCAN & OCTAGONAL SHOCKWAVE VFX
  // --------------------------------------------------------------------------
  const vfxGroup = new THREE.Group();
  vfxGroup.name = 'SynestheticCombatVfx';
  group.add(vfxGroup);

  const SALVO_PALETTE = [
    0x00f0ff,
    0x48cae4,
    0x1affb2,
    0xffd166,
    0xff9e44,
    0xff2a85,
    0xc77dff,
    0xe8f9ff,
  ];

  // --- A. Curving Quadratic Bezier Homing Salvo Ribbons ---
  const salvoTipGeom = new THREE.OctahedronGeometry(0.38, 0);
  const salvoBeams = [];
  for (let i = 0; i < SALVO_POOL_SIZE; i++) {
    const f32 = new Float32Array((SALVO_SEGMENTS + 1) * 3);
    const geom = new THREE.BufferGeometry();
    const attr = makeBufferAttr(f32, 3);
    if (typeof geom.setAttribute === 'function') {
      geom.setAttribute('position', attr);
    }
    const { line, mat } = makeLine(geom, SALVO_PALETTE[i % SALVO_PALETTE.length], 0.95, true);
    line.visible = false;

    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: ADDITIVE,
      depthWrite: false,
    });
    const tipMesh = new THREE.Mesh(salvoTipGeom, tipMat);
    tipMesh.visible = false;

    vfxGroup.add(line, tipMesh);
    salvoBeams.push({
      active: false,
      age: 0,
      duration: 0.34,
      p0: new THREE.Vector3(),
      p1: new THREE.Vector3(),
      p2: new THREE.Vector3(),
      targetId: null,
      line,
      mat,
      attr,
      f32,
      tipMesh,
      tipMat,
    });
  }
  let salvoCursor = 0;

  // --- B. Twin Vulcan Pulse Tracers ---
  const vulcanBolts = [];
  for (let i = 0; i < VULCAN_POOL_SIZE; i++) {
    const f32 = new Float32Array(6);
    const geom = new THREE.BufferGeometry();
    const attr = makeBufferAttr(f32, 3);
    if (typeof geom.setAttribute === 'function') {
      geom.setAttribute('position', attr);
    }
    const { line, mat } = makeLine(geom, 0x7df9ff, 0.95, true);
    line.visible = false;
    vfxGroup.add(line);
    vulcanBolts.push({
      active: false,
      age: 0,
      duration: 0.16,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      line,
      mat,
      attr,
      f32,
    });
  }
  let vulcanCursor = 0;

  // --- C. Quantized Expanding Octagonal Shockwave Rings & Vector Shards ---
  const octRingGeom = makeRegularPolygonGeometry(8, 1.0, 0, Math.PI / 8);
  const hexRingGeom = makeRegularPolygonGeometry(6, 1.0, 0, 0);
  const shockwaves = [];
  for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      blending: ADDITIVE,
      depthWrite: false,
    });
    const octLine = new THREE.Line(octRingGeom, mat);
    octLine.visible = false;
    vfxGroup.add(octLine);
    shockwaves.push({
      active: false,
      age: 0,
      delay: 0,
      life: 0.55,
      startScale: 0.4,
      endScale: 6.5,
      spinSpeed: 1.8,
      line: octLine,
      mat,
    });
  }
  let shockwaveCursor = 0;

  const shardGeom = new THREE.OctahedronGeometry(0.24, 0);
  const shards = [];
  for (let i = 0; i < SHARD_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95,
      blending: ADDITIVE,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(shardGeom, mat);
    mesh.visible = false;
    vfxGroup.add(mesh);
    shards.push({
      active: false,
      age: 0,
      life: 0.5,
      vx: 0,
      vy: 0,
      vz: 0,
      drag: 3.2,
      startScale: 1.0,
      mesh,
      mat,
    });
  }
  let shardCursor = 0;

  // Live tracked world positions for player, boss, and targets
  let lastCorridorDist = 0;
  let lastBeatPhase = 0;
  let lastElapsed = 0;
  const playerWorldPosLive = new THREE.Vector3();
  const playerForwardLive = new THREE.Vector3(0, 0, -1);
  const playerRightLive = new THREE.Vector3(1, 0, 0);
  const playerUpLive = new THREE.Vector3(0, 1, 0);
  const bossWorldPosLive = new THREE.Vector3();
  let bossIsActiveLive = false;

  // Registry of all currently synced target projections/world anchors
  const syncedTargets = [];
  const targetWorldById = new Map();

  // Initialize player craft along corridorDist = 0 immediately
  {
    sampleCorridorInto(0, playerWorldPosLive, playerForwardLive, playerRightLive, playerUpLive);
    playerGroup.position.copy(playerWorldPosLive);
    applyCorridorBasis(playerGroup, playerRightLive, playerUpLive, playerForwardLive);
  }

  function extractVec3(candidate, fallbackVec) {
    if (!candidate) return fallbackVec;
    if (Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z)) {
      return new THREE.Vector3(candidate.x, candidate.y, candidate.z);
    }
    if (candidate.worldPos && Number.isFinite(candidate.worldPos.x)) {
      return new THREE.Vector3(
        finiteOr(candidate.worldPos.x, fallbackVec.x),
        finiteOr(candidate.worldPos.y, fallbackVec.y),
        finiteOr(candidate.worldPos.z, fallbackVec.z)
      );
    }
    const refId = candidate.targetId ?? candidate.id;
    if (
      refId !== undefined &&
      refId !== null &&
      (targetWorldById.has(refId) || targetWorldById.has(String(refId)))
    ) {
      const found = targetWorldById.get(refId) || targetWorldById.get(String(refId));
      return found.clone();
    }
    // Support corridor-space event payloads { dist, x, y } / { corridorDist, offsetX, offsetY } directly!
    if (
      candidate.z === undefined &&
      (Number.isFinite(candidate.dist) || Number.isFinite(candidate.corridorDist))
    ) {
      return corridorToWorld(
        finiteOr(candidate.dist ?? candidate.corridorDist, lastCorridorDist + 40),
        finiteOr(candidate.offsetX ?? candidate.x, 0),
        finiteOr(candidate.offsetY ?? candidate.y, 0)
      );
    }
    if (Array.isArray(candidate) && candidate.length >= 3) {
      return new THREE.Vector3(
        finiteOr(candidate[0], fallbackVec.x),
        finiteOr(candidate[1], fallbackVec.y),
        finiteOr(candidate[2], fallbackVec.z)
      );
    }
    if (targetWorldById.has(candidate) || targetWorldById.has(String(candidate))) {
      const found = targetWorldById.get(candidate) || targetWorldById.get(String(candidate));
      return found.clone();
    }
    return fallbackVec;
  }

  function evalQuadraticBezier(p0, p1, p2, t, out) {
    const u = clamp(t, 0, 1);
    const inv = 1 - u;
    const c0 = inv * inv;
    const c1 = 2 * inv * u;
    const c2 = u * u;
    out.set(
      finiteOr(c0 * p0.x + c1 * p1.x + c2 * p2.x, 0),
      finiteOr(c0 * p0.y + c1 * p1.y + c2 * p2.y, 0),
      finiteOr(c0 * p0.z + c1 * p1.z + c2 * p2.z, 0)
    );
    return out;
  }

  const tmpCurvePt = new THREE.Vector3();

  function updateSalvoBeamGeometry(beam, progress) {
    const headT = clamp(progress * 1.28, 0.06, 1.0);
    const tailT = clamp((progress - 0.36) * 1.35, 0.0, 0.98);
    const span = Math.max(0.02, headT - tailT);

    for (let s = 0; s <= SALVO_SEGMENTS; s++) {
      const t = tailT + (s / SALVO_SEGMENTS) * span;
      evalQuadraticBezier(beam.p0, beam.p1, beam.p2, t, tmpCurvePt);
      const base = s * 3;
      beam.f32[base] = tmpCurvePt.x;
      beam.f32[base + 1] = tmpCurvePt.y;
      beam.f32[base + 2] = tmpCurvePt.z;
    }
    beam.attr.needsUpdate = true;

    evalQuadraticBezier(beam.p0, beam.p1, beam.p2, headT, tmpCurvePt);
    beam.tipMesh.position.copy(tmpCurvePt);
  }

  // Supports both Exact Return Contract:
  //   triggerSalvoVfx(playerWorldPos, targetWorldPositions, lockCount)
  // AND prose call shape:
  //   triggerSalvoVfx(targetsWorldPosArray, originWorldPos)
  function triggerSalvoVfx(arg0, arg1, lockCount = 0) {
    let originPos = playerWorldPosLive;
    let rawTargets = [];

    if (Array.isArray(arg0)) {
      rawTargets = arg0;
      originPos = extractVec3(arg1, playerWorldPosLive);
    } else {
      originPos = extractVec3(arg0, playerWorldPosLive);
      if (Array.isArray(arg1)) {
        rawTargets = arg1;
      } else if (arg1 && typeof arg1 === 'object') {
        rawTargets = [arg1];
      }
    }

    const requestedCount = clamp(
      Math.max(rawTargets.length, Math.round(finiteOr(lockCount, rawTargets.length || 1))),
      1,
      8
    );

    const resolvedTargets = [];
    for (let i = 0; i < rawTargets.length; i++) {
      const item = rawTargets[i];
      if (!item) continue;
      let tid = null;
      if (typeof item === 'object' && (item.targetId !== undefined || item.id !== undefined)) {
        tid = item.targetId !== undefined ? item.targetId : item.id;
      } else if (typeof item === 'string' || typeof item === 'number') {
        tid = item;
      }

      const fallback = corridorToWorld(
        lastCorridorDist + 46 + i * 3,
        Math.cos(i * 1.1) * 3.5,
        Math.sin(i * 1.1) * 2.4
      );
      const pos = extractVec3(item, fallback);
      resolvedTargets.push({ pos, targetId: tid });
    }

    // If lockCount was supplied without target coordinates, auto-pick synced targets or forward points
    while (resolvedTargets.length < requestedCount) {
      const idx = resolvedTargets.length;
      if (syncedTargets.length > 0) {
        const st = syncedTargets[idx % syncedTargets.length];
        resolvedTargets.push({ pos: st.worldPos.clone(), targetId: st.id });
      } else {
        const ang = (idx / requestedCount) * Math.PI * 2;
        resolvedTargets.push({
          pos: corridorToWorld(
            lastCorridorDist + 50,
            Math.cos(ang) * 3.8,
            Math.sin(ang) * 2.4
          ),
          targetId: null,
        });
      }
    }

    const isFullOctet = resolvedTargets.length >= 8 || finiteOr(lockCount, 0) >= 8;

    for (let i = 0; i < resolvedTargets.length; i++) {
      const beam = salvoBeams[salvoCursor % SALVO_POOL_SIZE];
      salvoCursor++;

      const fanAngle =
        ((i + 0.5) / resolvedTargets.length) * Math.PI * 2 +
        (i % 2 === 0 ? 0.28 : -0.28);
      const podRadX = Math.cos(fanAngle) * 1.85;
      const podRadY = Math.sin(fanAngle) * 1.05;

      // Launch from wing-pods radially around the player craft
      beam.p0.set(
        finiteOr(originPos.x + playerRightLive.x * podRadX + playerUpLive.x * podRadY, 0),
        finiteOr(originPos.y + playerRightLive.y * podRadX + playerUpLive.y * podRadY, 0),
        finiteOr(originPos.z + playerRightLive.z * podRadX + playerUpLive.z * podRadY, 0)
      );
      beam.p2.copy(resolvedTargets[i].pos);
      beam.targetId = resolvedTargets[i].targetId;

      const chordDist = clamp(beam.p0.distanceTo(beam.p2), 8, 140);
      const arcSpread = (5.5 + (i % 3) * 1.9) * (isFullOctet ? 1.32 : 1.0);
      const outX = Math.cos(fanAngle) * arcSpread;
      const outY = Math.sin(fanAngle) * arcSpread * 0.82;
      const fwdPush = chordDist * 0.34;

      // Sweeping radial quadratic Bezier control point (Itano / Rez homing fan!)
      beam.p1.set(
        finiteOr(
          beam.p0.x +
            playerForwardLive.x * fwdPush +
            playerRightLive.x * outX +
            playerUpLive.x * outY,
          0
        ),
        finiteOr(
          beam.p0.y +
            playerForwardLive.y * fwdPush +
            playerRightLive.y * outX +
            playerUpLive.y * outY,
          0
        ),
        finiteOr(
          beam.p0.z +
            playerForwardLive.z * fwdPush +
            playerRightLive.z * outX +
            playerUpLive.z * outY,
          0
        )
      );

      beam.active = true;
      beam.age = 0;
      beam.duration = 0.28 + i * 0.032;

      const colorHex = isFullOctet
        ? SALVO_PALETTE[i % SALVO_PALETTE.length]
        : i % 2 === 0
          ? blendedPrimaryHex
          : 0xffd166;
      setColorSafe(beam.mat.color, colorHex);
      setColorSafe(beam.tipMat.color, 0xffffff);
      beam.mat.opacity = 0.96;
      beam.tipMat.opacity = 0.98;
      beam.line.visible = true;
      beam.tipMesh.visible = true;
      beam.tipMesh.scale.setScalar(isFullOctet ? 1.25 : 0.95);

      updateSalvoBeamGeometry(beam, 0.08);
    }
  }

  function triggerVulcanVfx(playerWorldPos, aimWorldPos) {
    const origin = extractVec3(playerWorldPos, playerWorldPosLive);
    const defaultAim = corridorToWorld(lastCorridorDist + 62, 0, 0);
    const aim = extractVec3(aimWorldPos, defaultAim);

    for (const side of [-1, 1]) {
      const bolt = vulcanBolts[vulcanCursor % VULCAN_POOL_SIZE];
      vulcanCursor++;

      bolt.start.set(
        finiteOr(origin.x + playerRightLive.x * (side * 1.18) - playerUpLive.x * 0.08, 0),
        finiteOr(origin.y + playerRightLive.y * (side * 1.18) - playerUpLive.y * 0.08, 0),
        finiteOr(origin.z + playerRightLive.z * (side * 1.18) - playerUpLive.z * 0.08, 0)
      );
      bolt.end.set(
        finiteOr(aim.x + playerRightLive.x * (side * 0.22), 0),
        finiteOr(aim.y + playerRightLive.y * (side * 0.22), 0),
        finiteOr(aim.z + playerRightLive.z * (side * 0.22), 0)
      );

      bolt.f32[0] = bolt.start.x;
      bolt.f32[1] = bolt.start.y;
      bolt.f32[2] = bolt.start.z;
      bolt.f32[3] = lerp(bolt.start.x, bolt.end.x, 0.35);
      bolt.f32[4] = lerp(bolt.start.y, bolt.end.y, 0.35);
      bolt.f32[5] = lerp(bolt.start.z, bolt.end.z, 0.35);
      bolt.attr.needsUpdate = true;

      setColorSafe(bolt.mat.color, blendedPrimaryHex);
      bolt.mat.opacity = 0.95;
      bolt.active = true;
      bolt.age = 0;
      bolt.duration = 0.16;
      bolt.line.visible = true;
    }
  }

  function spawnShockwaveRing({
    center,
    hex,
    startScale = 0.45,
    endScale = 6.5,
    life = 0.52,
    delay = 0,
    useHexGeometry = false,
  }) {
    const sw = shockwaves[shockwaveCursor % SHOCKWAVE_POOL_SIZE];
    shockwaveCursor++;

    sw.line.geometry = useHexGeometry ? hexRingGeom : octRingGeom;
    sw.line.position.copy(center);
    applyCorridorBasis(sw.line, playerRightLive, playerUpLive, playerForwardLive);
    sw.line.scale.setScalar(finiteOr(startScale, 0.5));
    setColorSafe(sw.mat.color, hex);
    sw.mat.opacity = delay > 0 ? 0 : 0.96;
    sw.active = true;
    sw.age = 0;
    sw.delay = Math.max(0, finiteOr(delay, 0));
    sw.life = Math.max(0.12, finiteOr(life, 0.5));
    sw.startScale = finiteOr(startScale, 0.45);
    sw.endScale = finiteOr(endScale, 6.5);
    sw.spinSpeed = (shockwaveCursor % 2 === 0 ? 1 : -1) * 2.1;
    sw.line.visible = delay <= 0;
  }

  function spawnShardBurst(center, count, primaryHex, secondaryHex, speedScale = 14) {
    for (let i = 0; i < count; i++) {
      const sh = shards[shardCursor % SHARD_POOL_SIZE];
      shardCursor++;

      const theta = (i / Math.max(1, count)) * Math.PI * 2 + rng() * 0.45;
      const elev = (rng() - 0.5) * 1.4;
      const spd = speedScale * (0.55 + rng() * 0.75);
      const dirR = Math.cos(theta) * Math.cos(elev);
      const dirU = Math.sin(theta) * Math.cos(elev);
      const dirF = Math.sin(elev);

      sh.vx = finiteOr(
        (playerRightLive.x * dirR + playerUpLive.x * dirU + playerForwardLive.x * dirF) * spd,
        0
      );
      sh.vy = finiteOr(
        (playerRightLive.y * dirR + playerUpLive.y * dirU + playerForwardLive.y * dirF) * spd,
        0
      );
      sh.vz = finiteOr(
        (playerRightLive.z * dirR + playerUpLive.z * dirU + playerForwardLive.z * dirF) * spd,
        0
      );

      sh.mesh.position.copy(center);
      sh.startScale = 0.75 + rng() * 0.85;
      sh.mesh.scale.setScalar(sh.startScale);
      setColorSafe(sh.mat.color, i % 2 === 0 ? primaryHex : secondaryHex);
      sh.mat.opacity = 0.96;
      sh.age = 0;
      sh.life = 0.38 + rng() * 0.28;
      sh.active = true;
      sh.mesh.visible = true;
    }
  }

  function triggerExplosionVfx(worldPos, kind = 'enemy', beatPhase = lastBeatPhase) {
    const k = String(kind || 'enemy').toLowerCase();
    const fallbackCenter =
      k === 'boss' && bossIsActiveLive
        ? bossWorldPosLive
        : k === 'overdrive'
          ? corridorToWorld(lastCorridorDist + 26, 0, 0)
          : playerWorldPosLive;
    const center = extractVec3(worldPos, fallbackCenter);
    const beatBoost = 1.0 + 0.22 * Math.cos(finiteOr(beatPhase, 0) * Math.PI * 2);

    if (k === 'boss') {
      const bossCols = [0xe8f9ff, 0xff2a6d, 0xffd166, 0x00f0ff, 0xff2a85];
      for (let r = 0; r < 5; r++) {
        spawnShockwaveRing({
          center,
          hex: bossCols[r],
          startScale: 1.2 + r * 0.6,
          endScale: (15.5 + r * 4.2) * beatBoost,
          life: 0.85 + r * 0.1,
          delay: r * 0.055,
        });
      }
      spawnShardBurst(center, 22, 0xff2a6d, 0xffd166, 24);
    } else if (k === 'overdrive') {
      const waveCols = [0x00f0ff, 0xffd166, 0xff2a85, 0xe8f9ff];
      for (let r = 0; r < 4; r++) {
        const ringCenter = corridorToWorld(lastCorridorDist + 14 + r * 16, 0, 0);
        spawnShockwaveRing({
          center: ringCenter,
          hex: waveCols[r],
          startScale: 1.6,
          endScale: 24.0 * beatBoost,
          life: 0.9,
          delay: r * 0.06,
        });
      }
      spawnShardBurst(center, 18, 0x00f0ff, 0xffd166, 22);
    } else if (k === 'deflect') {
      spawnShockwaveRing({
        center,
        hex: 0x00f0ff,
        startScale: 0.8,
        endScale: 5.4 * beatBoost,
        life: 0.36,
        useHexGeometry: true,
      });
      spawnShockwaveRing({
        center,
        hex: 0x1affb2,
        startScale: 0.5,
        endScale: 3.8 * beatBoost,
        life: 0.28,
        delay: 0.03,
        useHexGeometry: true,
      });
      spawnShardBurst(center, 6, 0x00f0ff, 0x1affb2, 13);
    } else if (k === 'node') {
      spawnShockwaveRing({
        center,
        hex: 0xffd166,
        startScale: 0.7,
        endScale: 9.2 * beatBoost,
        life: 0.62,
      });
      spawnShockwaveRing({
        center,
        hex: 0xe8f9ff,
        startScale: 0.4,
        endScale: 6.4 * beatBoost,
        life: 0.48,
        delay: 0.04,
      });
      spawnShardBurst(center, 12, 0xffd166, 0xe8f9ff, 18);
    } else {
      // 'enemy' and any custom kinds
      spawnShockwaveRing({
        center,
        hex: blendedPrimaryHex,
        startScale: 0.45,
        endScale: 6.2 * beatBoost,
        life: 0.48,
      });
      spawnShockwaveRing({
        center,
        hex: blendedSecondaryHex,
        startScale: 0.3,
        endScale: 4.1 * beatBoost,
        life: 0.38,
        delay: 0.035,
      });
      spawnShardBurst(center, 8, blendedPrimaryHex, blendedAccentHex, 15);
    }
  }

  // --------------------------------------------------------------------------
  // 6. SCREEN-SPACE TARGET PROJECTIONS (Paint-Lock Cursor & HUD Brackets)
  // --------------------------------------------------------------------------
  const tmpProj = new THREE.Vector3();
  const tmpCamPos = new THREE.Vector3();
  const tmpCamFwd = new THREE.Vector3();
  const tmpCamRight = new THREE.Vector3();
  const tmpCamUp = new THREE.Vector3();

  function getTargetScreenProjections(camera, viewportWidth = 1280, viewportHeight = 720) {
    const w = Math.max(1, finiteOr(viewportWidth, 1280));
    const h = Math.max(1, finiteOr(viewportHeight, 720));
    const aspect = w / h;

    camera?.updateMatrixWorld?.(true);

    // Derive camera position & forward basis (supports both real PerspectiveCamera and jsc -m mocks)
    if (camera?.position && Number.isFinite(camera.position.x)) {
      tmpCamPos.set(
        finiteOr(camera.position.x, 0),
        finiteOr(camera.position.y, 0),
        finiteOr(camera.position.z, 0)
      );
    } else {
      corridorToWorld(lastCorridorDist - 14.5, 0, 1.8, tmpCamPos);
    }

    const me = camera?.matrixWorld?.elements;
    let hasRealCamMatrix = false;
    if (Array.isArray(me) || ArrayBuffer.isView(me)) {
      const fx = -finiteOr(me[8], 0);
      const fy = -finiteOr(me[9], 0);
      const fz = -finiteOr(me[10], -1);
      const fl = Math.hypot(fx, fy, fz);
      // Note: an un-updated identity mock matrixWorld has forward (0,0,-1); check projectionMatrix too
      if (fl > 0.5 && camera?.projectionMatrix && camera?.matrixWorldInverse) {
        tmpCamFwd.set(fx / fl, fy / fl, fz / fl);
        tmpCamRight.set(finiteOr(me[0], 1), finiteOr(me[1], 0), finiteOr(me[2], 0)).normalize?.();
        tmpCamUp.set(finiteOr(me[4], 0), finiteOr(me[5], 1), finiteOr(me[6], 0)).normalize?.();
        hasRealCamMatrix = true;
      }
    }

    if (!hasRealCamMatrix) {
      // Exact analytical chase-camera basis looking down the corridor at corridorDist + 28
      const lookTarget = corridorToWorld(lastCorridorDist + 28, 0, 0);
      let fx = lookTarget.x - tmpCamPos.x;
      let fy = lookTarget.y - tmpCamPos.y;
      let fz = lookTarget.z - tmpCamPos.z;
      const fl = Math.hypot(fx, fy, fz) || 1;
      fx /= fl;
      fy /= fl;
      fz /= fl;
      tmpCamFwd.set(fx, fy, fz);

      let rx = fy * playerUpLive.z - fz * playerUpLive.y;
      let ry = fz * playerUpLive.x - fx * playerUpLive.z;
      let rz = fx * playerUpLive.y - fy * playerUpLive.x;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl;
      ry /= rl;
      rz /= rl;
      tmpCamRight.set(rx, ry, rz);

      tmpCamUp.set(
        ry * fz - rz * fy,
        rz * fx - rx * fz,
        rx * fy - ry * fx
      );
    }

    const fovDeg = clamp(finiteOr(camera?.fov, 62), 20, 130);
    const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360) || 0.6;

    const projections = [];
    for (let i = 0; i < syncedTargets.length; i++) {
      const t = syncedTargets[i];
      const wp = t.worldPos;
      const dx = wp.x - tmpCamPos.x;
      const dy = wp.y - tmpCamPos.y;
      const dz = wp.z - tmpCamPos.z;

      const forwardDepth =
        dx * tmpCamFwd.x + dy * tmpCamFwd.y + dz * tmpCamFwd.z;
      const distToCam = Math.max(0.5, Math.hypot(dx, dy, dz));

      let ndcX = 0;
      let ndcY = 0;
      let inFront = forwardDepth > 0.35;
      let usedThreeProject = false;

      if (hasRealCamMatrix && typeof tmpProj.project === 'function') {
        try {
          tmpProj.copy(wp).project(camera);
          if (
            Number.isFinite(tmpProj.x) &&
            Number.isFinite(tmpProj.y) &&
            Number.isFinite(tmpProj.z)
          ) {
            ndcX = tmpProj.x;
            ndcY = tmpProj.y;
            inFront = inFront && tmpProj.z >= -1.0 && tmpProj.z <= 1.0;
            usedThreeProject = true;
          }
        } catch (_) {
          usedThreeProject = false;
        }
      }

      if (!usedThreeProject) {
        const safeZ = Math.max(0.5, Math.abs(forwardDepth));
        const localX = dx * tmpCamRight.x + dy * tmpCamRight.y + dz * tmpCamRight.z;
        const localY = dx * tmpCamUp.x + dy * tmpCamUp.y + dz * tmpCamUp.z;
        ndcX = finiteOr(localX / (safeZ * tanHalfFov * aspect), 0);
        ndcY = finiteOr(localY / (safeZ * tanHalfFov), 0);
        if (!inFront) {
          ndcX = clamp(ndcX, -2, 2) + 4;
          ndcY = clamp(ndcY, -2, 2) + 4;
        }
      }

      const screenX = finiteOr((ndcX * 0.5 + 0.5) * w, w * 0.5);
      const screenY = finiteOr((-ndcY * 0.5 + 0.5) * h, h * 0.5);
      const radiusPx = clamp(
        finiteOr((t.worldRadius / (Math.max(2.0, forwardDepth) * tanHalfFov)) * (h * 0.5), 24),
        14,
        140
      );

      const onScreenLockable =
        Boolean(t.lockable) &&
        inFront &&
        Math.abs(ndcX) <= 1.18 &&
        Math.abs(ndcY) <= 1.18;

      projections.push({
        id: t.id,
        screenX,
        screenY,
        ndcX: finiteOr(ndcX, 0),
        ndcY: finiteOr(ndcY, 0),
        worldPos: wp.clone(),
        radiusPx,
        lockable: onScreenLockable,
      });
    }

    return projections;
  }

  // --------------------------------------------------------------------------
  // 7. LIVE FRAME SYNCHRONIZATION (syncState)
  // --------------------------------------------------------------------------
  let prevPlayerOffX = 0;
  let prevPlayerOffY = 0;
  let activeRollPeak = 0.55;

  function syncState(simState, camera, dt = 1 / 60, elapsed = NaN, beatPhase = 0) {
    void camera;
    const safeDt = clamp(finiteOr(dt, 1 / 60), 0, 0.1);
    lastElapsed = Number.isFinite(elapsed) ? elapsed : lastElapsed + safeDt;
    const t = lastElapsed;
    const bp = ((finiteOr(beatPhase, 0) % 1) + 1) % 1;
    lastBeatPhase = bp;

    // Musical beat envelope: sharp attack at beatPhase=0, smooth decay across the beat
    const beatPulse = Math.pow(1.0 - bp, 2.2);

    // --- A. Area Sync & Smooth Palette/Geometry Crossfade ---
    if (simState && Number.isFinite(simState.areaIndex)) {
      const stateArea = clamp(Math.round(simState.areaIndex), 0, 3);
      if (stateArea !== currentAreaIndex) {
        setArea(stateArea);
      }
    }

    const morphRate = clamp(safeDt * 2.8, 0.02, 1);
    for (let a = 0; a < 4; a++) {
      const goal = a === currentAreaIndex ? 1 : 0;
      areaWeights[a] = lerp(areaWeights[a], goal, morphRate);
    }
    const targetTheme = AREA_THEMES[currentAreaIndex];
    const colorBlend = clamp(safeDt * 3.4, 0.03, 1);
    blendedPrimaryHex = lerpHex(blendedPrimaryHex, targetTheme.primaryHex, colorBlend);
    blendedSecondaryHex = lerpHex(blendedSecondaryHex, targetTheme.secondaryHex, colorBlend);
    blendedAccentHex = lerpHex(blendedAccentHex, targetTheme.accentHex, colorBlend);
    blendedFogHex = lerpHex(blendedFogHex, targetTheme.fogHex, colorBlend);

    applyPaletteHexes(
      blendedPrimaryHex,
      blendedSecondaryHex,
      blendedAccentHex,
      blendedFogHex,
      targetTheme.ambientHex,
      targetTheme.rimHex
    );
    updateGateAreaMorph();

    gatePrimaryMat.opacity = clamp(0.68 + 0.26 * beatPulse, 0, 1);
    gateAccentMat.opacity = clamp(0.56 + 0.32 * beatPulse, 0, 1);
    gateNodePillarMat.emissiveIntensity = 1.05 + 0.85 * beatPulse;

    // --- B. Corridor Gates & Streaming Star-Motes ---
    const corridorDist = finiteOr(simState?.corridorDist, lastCorridorDist);
    const corridorSpeed = finiteOr(simState?.corridorSpeed, 52);
    lastCorridorDist = corridorDist;

    layoutGatesAtDist(corridorDist, t, beatPulse);

    const starSpan = 260.0;
    for (let i = 0; i < STAR_MOTE_COUNT; i++) {
      const m = starMoteOffsets[i];
      m.relDist -= safeDt * corridorSpeed * (m.speedMul * 0.45);
      if (m.relDist < -22) m.relDist += starSpan;
      if (m.relDist > starSpan - 22) m.relDist -= starSpan;

      const swirlX = m.ox + Math.cos(t * 1.2 + m.driftPhase) * 0.65;
      const swirlY = m.oy + Math.sin(t * 1.2 + m.driftPhase) * 0.65;
      corridorToWorld(corridorDist + m.relDist, swirlX, swirlY, scratchPt);
      starPositions[i * 3] = scratchPt.x;
      starPositions[i * 3 + 1] = scratchPt.y;
      starPositions[i * 3 + 2] = scratchPt.z;
    }
    starPosAttr.needsUpdate = true;

    // --- C. Player Vector Craft, 3 Evolution Forms, Ion Wakes & Barrel Roll ---
    const player = simState?.player || {};
    const pxOff = clamp(finiteOr(player.x, 0), -12, 12);
    const pyOff = clamp(finiteOr(player.y, 0), -8, 8);
    const vx = Number.isFinite(player.vx)
      ? player.vx
      : safeDt > 1e-4
        ? (pxOff - prevPlayerOffX) / safeDt
        : 0;
    const vy = Number.isFinite(player.vy)
      ? player.vy
      : safeDt > 1e-4
        ? (pyOff - prevPlayerOffY) / safeDt
        : 0;
    prevPlayerOffX = pxOff;
    prevPlayerOffY = pyOff;

    sampleCorridorInto(
      corridorDist,
      scratchPt,
      playerForwardLive,
      playerRightLive,
      playerUpLive
    );
    playerWorldPosLive.set(
      finiteOr(scratchPt.x + playerRightLive.x * pxOff + playerUpLive.x * pyOff, 0),
      finiteOr(scratchPt.y + playerRightLive.y * pxOff + playerUpLive.y * pyOff, 0),
      finiteOr(scratchPt.z + playerRightLive.z * pxOff + playerUpLive.z * pyOff, 0)
    );

    playerGroup.position.copy(playerWorldPosLive);
    applyCorridorBasis(playerGroup, playerRightLive, playerUpLive, playerForwardLive);

    if (playerPointLight) {
      playerPointLight.position.copy(playerWorldPosLive);
      setColorSafe(playerPointLight.color, blendedPrimaryHex);
      playerPointLight.intensity = 2.1 + 0.9 * beatPulse;
    }

    // Responsive Star Fox banking & climb pitch
    const dodgeBank = clamp(-vx * 0.048, -0.58, 0.58);
    const dodgePitch = clamp(vy * 0.036, -0.42, 0.42);
    craftTiltNode.rotation.set(
      lerp(finiteOr(craftTiltNode.rotation.x, 0), dodgePitch, clamp(safeDt * 12, 0, 1)),
      lerp(finiteOr(craftTiltNode.rotation.y, 0), clamp(-vx * 0.018, -0.22, 0.22), clamp(safeDt * 10, 0, 1)),
      0
    );

    // Barrel Roll 360-degree spin + hexagonal wireframe deflector sphere
    const rollTimer = Math.max(0, finiteOr(player.barrelRollTimer, 0));
    if (rollTimer > 0) {
      if (rollTimer > activeRollPeak) activeRollPeak = rollTimer;
      const rollProgress = clamp(1.0 - rollTimer / Math.max(0.15, activeRollPeak), 0, 1);
      craftRollNode.rotation.z = finiteOr(dodgeBank + rollProgress * Math.PI * 2, 0);

      barrelShieldGroup.visible = true;
      barrelShieldSphere.rotation.y = t * 8.5;
      barrelShieldSphere.rotation.z = -t * 6.2;
      barrelShieldHexRing.rotation.z = t * 11.0;
      const shieldPulse = 0.92 + 0.14 * Math.sin(rollProgress * Math.PI);
      barrelShieldGroup.scale.setScalar(finiteOr(shieldPulse, 1));
      barrelShieldWireMat.opacity = clamp(0.45 + 0.45 * Math.sin(rollProgress * Math.PI), 0.2, 0.95);
    } else {
      activeRollPeak = 0.55;
      craftRollNode.rotation.z = lerp(
        finiteOr(craftRollNode.rotation.z, 0),
        dodgeBank,
        clamp(safeDt * 12, 0, 1)
      );
      barrelShieldGroup.visible = false;
    }

    // Invulnerability flicker on hit
    const invuln = Math.max(0, finiteOr(player.invulnTimer, 0));
    playerGroup.visible = invuln > 0 ? Math.sin(t * 42) > -0.25 : true;

    // 3-Stage Visual Evolution Forms (1: Vector Dart, 2: Harmonic Valkyrie, 3: Synesthetic Seraph)
    const evoStage = clamp(
      Math.round(finiteOr(player.evolutionStage ?? player.stage ?? 1, 1)),
      1,
      3
    );
    stage1Group.visible = true;
    stage2Group.visible = evoStage >= 2;
    stage3Group.visible = evoStage >= 3;

    if (stage2Group.visible) {
      stage2PodOrbitNode.rotation.z = Math.sin(t * 1.5) * 0.14;
      for (let i = 0; i < wingPodMeshes.length; i++) {
        const pod = wingPodMeshes[i];
        pod.crystal.rotation.z = t * 3.8 + bp * Math.PI * 2;
        pod.crystal.rotation.x = t * 2.1 + i;
        pod.ring.rotation.z = -t * 4.5;
        const bob = 1.0 + 0.18 * beatPulse;
        pod.holder.scale.setScalar(bob);
      }
    }

    if (stage3Group.visible) {
      seraphHaloGroup.rotation.z = t * 1.25 + bp * 0.4;
      seraphHaloGroup.scale.setScalar(0.95 + 0.12 * beatPulse);
      for (const sw of seraphWings) {
        const flap = Math.sin(bp * Math.PI * 2 + sw.tier * 0.55) * 0.11;
        sw.pivot.rotation.z = sw.baseZ - sw.side * flap;
      }
      craftSeraphWingMat.opacity = clamp(0.36 + 0.24 * beatPulse, 0.2, 0.78);
    }

    // Update Twin Ion Wake Ribbons in world space
    for (const wake of ionWakes) {
      const nozzleX =
        playerWorldPosLive.x +
        playerRightLive.x * (wake.side * 0.52) -
        playerForwardLive.x * 1.42;
      const nozzleY =
        playerWorldPosLive.y +
        playerRightLive.y * (wake.side * 0.52) -
        playerForwardLive.y * 1.42;
      const nozzleZ =
        playerWorldPosLive.z +
        playerRightLive.z * (wake.side * 0.52) -
        playerForwardLive.z * 1.42;

      if (!wake.initialized) {
        for (let i = 0; i < WAKE_SEGMENTS; i++) {
          wake.history[i].set(
            finiteOr(nozzleX - playerForwardLive.x * i * 0.55, 0),
            finiteOr(nozzleY - playerForwardLive.y * i * 0.55, 0),
            finiteOr(nozzleZ - playerForwardLive.z * i * 0.55, 0)
          );
        }
        wake.initialized = true;
      } else {
        for (let i = WAKE_SEGMENTS - 1; i >= 1; i--) {
          wake.history[i].lerp(wake.history[i - 1], clamp(safeDt * 32, 0.35, 0.92));
          // Drift wake points gently aft so stationary tests still show crisp trails
          wake.history[i].x -= playerForwardLive.x * safeDt * 16;
          wake.history[i].y -= playerForwardLive.y * safeDt * 16;
          wake.history[i].z -= playerForwardLive.z * safeDt * 16;
        }
        wake.history[0].set(finiteOr(nozzleX, 0), finiteOr(nozzleY, 0), finiteOr(nozzleZ, 0));
      }

      for (let i = 0; i < WAKE_SEGMENTS; i++) {
        const hp = wake.history[i];
        wake.f32[i * 3] = finiteOr(hp.x, 0);
        wake.f32[i * 3 + 1] = finiteOr(hp.y, 0);
        wake.f32[i * 3 + 2] = finiteOr(hp.z, 0);
      }
      wake.attr.needsUpdate = true;
      setColorSafe(wake.mat.color, evoStage === 3 ? 0xffd166 : blendedPrimaryHex);
      wake.mat.opacity = clamp(0.62 + 0.28 * beatPulse, 0.3, 0.98);
    }

    // --- D. Collect Locked Target IDs for 3D Highlight Rings ---
    const lockedIdCounts = new Map();
    if (Array.isArray(simState?.locks)) {
      for (const lk of simState.locks) {
        const tid = lk && typeof lk === 'object' ? lk.targetId : lk;
        if (tid !== undefined && tid !== null) {
          const key = String(tid);
          lockedIdCounts.set(key, (lockedIdCounts.get(key) || 0) + 1);
        }
      }
    }

    syncedTargets.length = 0;
    targetWorldById.clear();

    // --- E. Sync Enemy Formations ---
    const enemiesList = Array.isArray(simState?.enemies) ? simState.enemies : [];
    const seenEnemyKeys = new Set();

    for (let i = 0; i < enemiesList.length; i++) {
      const e = enemiesList[i];
      if (!e || e.alive === false || e.dead === true || e.active === false) continue;
      if (Number.isFinite(e.hp) && e.hp <= 0) continue;

      const rawId = e.id !== undefined ? e.id : `enemy-${i}`;
      const mapKey = String(rawId);
      seenEnemyKeys.add(mapKey);

      const kind = String(e.type || e.kind || e.archetype || 'bit').toLowerCase();
      let rec = activeEnemyRecords.get(mapKey);
      if (!rec || rec.kind !== kind) {
        if (rec) enemiesGroup.remove(rec.root);
        rec = buildEnemyVisual(kind);
        activeEnemyRecords.set(mapKey, rec);
      }

      const eDist = finiteOr(e.dist ?? e.corridorDist ?? e.s, corridorDist + 42);
      const eOffX = finiteOr(e.offsetX ?? e.x, 0);
      const eOffY = finiteOr(e.offsetY ?? e.y, 0);

      sampleCorridorInto(eDist, scratchPt, scratchTan, scratchRight, scratchUp);
      rec.worldPos.set(
        finiteOr(scratchPt.x + scratchRight.x * eOffX + scratchUp.x * eOffY, 0),
        finiteOr(scratchPt.y + scratchRight.y * eOffX + scratchUp.y * eOffY, 0),
        finiteOr(scratchPt.z + scratchRight.z * eOffX + scratchUp.z * eOffY, 0)
      );

      rec.root.visible = true;
      rec.root.position.copy(rec.worldPos);
      // Orient enemy root to face the player (-tangent) while keeping lock bracket upright
      applyCorridorBasis(rec.root, scratchRight, scratchUp, scratchTan);

      const beatScale = 1.0 + 0.08 * beatPulse;
      rec.body.scale.setScalar(beatScale);
      for (const sp of rec.spinners) {
        sp.obj.rotation[sp.axis] = finiteOr(sp.obj.rotation[sp.axis] + sp.speed * safeDt, 0);
      }

      const lockCnt = lockedIdCounts.get(mapKey) || 0;
      rec.lockBracket3d.visible = lockCnt > 0;
      if (lockCnt > 0) {
        rec.lockBracket3d.rotation.z = t * 4.5;
        rec.lockBracket3d.scale.setScalar(1.0 + 0.12 * Math.sin(t * 14));
      }

      const isLockable = e.lockable !== undefined ? Boolean(e.lockable) : true;
      rec.rawId = rawId;
      rec.lockable = isLockable;

      syncedTargets.push({
        id: rawId,
        worldPos: rec.worldPos,
        worldRadius: rec.worldRadius,
        lockable: isLockable,
      });
      targetWorldById.set(rawId, rec.worldPos);
      targetWorldById.set(mapKey, rec.worldPos);
    }

    for (const [key, rec] of activeEnemyRecords.entries()) {
      if (!seenEnemyKeys.has(key)) {
        enemiesGroup.remove(rec.root);
        activeEnemyRecords.delete(key);
      }
    }

    // --- F. Sync Enemy Plasma Bolts ---
    const boltsList = Array.isArray(simState?.enemyBolts)
      ? simState.enemyBolts
      : Array.isArray(simState?.bolts)
        ? simState.bolts
        : [];
    let visibleBolts = 0;
    for (let i = 0; i < boltsList.length; i++) {
      const b = boltsList[i];
      if (!b || b.active === false || b.alive === false || b.deflected === true || b.dead === true) {
        continue;
      }
      const vis = acquireBoltVisual(visibleBolts++);
      const bDist = finiteOr(b.dist ?? b.corridorDist, corridorDist + 18);
      const bOffX = finiteOr(b.offsetX ?? b.x, 0);
      const bOffY = finiteOr(b.offsetY ?? b.y, 0);

      sampleCorridorInto(bDist, scratchPt, scratchTan, scratchRight, scratchUp);
      vis.root.position.set(
        finiteOr(scratchPt.x + scratchRight.x * bOffX + scratchUp.x * bOffY, 0),
        finiteOr(scratchPt.y + scratchRight.y * bOffX + scratchUp.y * bOffY, 0),
        finiteOr(scratchPt.z + scratchRight.z * bOffX + scratchUp.z * bOffY, 0)
      );
      applyCorridorBasis(vis.root, scratchRight, scratchUp, scratchTan);
      vis.ring.rotation.z = t * 12.0 + i;
      vis.core.rotation.z = -t * 8.0;
      vis.root.visible = true;
    }
    for (let i = visibleBolts; i < boltPool.length; i++) {
      boltPool[i].root.visible = false;
    }

    // --- G. Sync 3-Phase Morphing Boss: SERAPH-IX ---
    const boss = simState?.boss;
    const bossActive = Boolean(
      boss &&
        boss.active !== false &&
        boss.defeated !== true &&
        (!Number.isFinite(boss.hp) || boss.hp > 0 || (boss.phase && boss.phase < 3))
    );
    bossIsActiveLive = bossActive;
    bossGroup.visible = bossActive;

    let activeBossNodeCount = 0;

    if (bossActive) {
      const bossDist = finiteOr(boss.dist ?? boss.corridorDist, corridorDist + 58);
      const bossOffX = finiteOr(boss.offsetX ?? boss.x, 0);
      const bossOffY = finiteOr(boss.offsetY ?? boss.y, 0);
      const bossPhase = clamp(Math.round(finiteOr(boss.phase, 1)), 1, 3);

      sampleCorridorInto(bossDist, scratchPt, scratchTan, scratchRight, scratchUp);
      bossWorldPosLive.set(
        finiteOr(scratchPt.x + scratchRight.x * bossOffX + scratchUp.x * bossOffY, 0),
        finiteOr(scratchPt.y + scratchRight.y * bossOffX + scratchUp.y * bossOffY, 0),
        finiteOr(scratchPt.z + scratchRight.z * bossOffX + scratchUp.z * bossOffY, 0)
      );

      bossGroup.position.copy(bossWorldPosLive);
      applyCorridorBasis(bossGroup, scratchRight, scratchUp, scratchTan);

      if (bossPointLight) {
        bossPointLight.position.copy(bossWorldPosLive);
        setColorSafe(bossPointLight.color, bossPhase === 3 ? 0xffffff : 0xff2a6d);
        bossPointLight.intensity = (bossPhase === 3 ? 4.2 : 2.6) * (0.85 + 0.35 * beatPulse);
      }

      // Phase 1 -> 2 -> 3 Architectural Morphing
      // Phase 1: Intact rotating icosahedral wireframe cage
      // Phase 2: Cage expands into fractured outer halo; 4 Harmonic Wing-Blades unfold + charge
      // Phase 3: Wings peel wide; blazing Singularity Core exposed & pulsing on beat!
      const cageTargetScale = bossPhase === 1 ? 1.0 : bossPhase === 2 ? 1.38 : 1.72;
      bossCageOuter.scale.setScalar(
        lerp(finiteOr(bossCageOuter.scale.x, 1), cageTargetScale, clamp(safeDt * 4, 0.05, 1))
      );
      bossCageOuter.rotation.x = t * 0.55;
      bossCageOuter.rotation.y = t * 0.78;
      bossCageWireMat.opacity = bossPhase === 1 ? 0.88 : bossPhase === 2 ? 0.38 : 0.2;

      bossCageInner.visible = bossPhase === 1;
      bossCageInner.rotation.z = -t * 1.15;
      bossCageInner.rotation.x = -t * 0.65;

      bossWingsGroup.visible = bossPhase >= 2;
      if (bossWingsGroup.visible) {
        bossWingsGroup.rotation.z = Math.sin(t * 0.65) * 0.22;
        for (let w = 0; w < bossWingBlades.length; w++) {
          const wb = bossWingBlades[w];
          const unfold = bossPhase === 2 ? 1.0 : 1.28;
          wb.arm.scale.setScalar(unfold);
          wb.arm.rotation.y =
            bossPhase === 3 ? -0.48 : Math.sin(t * 2.2 + w) * 0.14;
          wb.telegraphHalo.rotation.z = t * 6.0;
          wb.telegraphHalo.scale.setScalar(0.85 + 0.42 * beatPulse);
        }
      }

      const coreScale =
        bossPhase === 3
          ? 1.35 + 0.28 * beatPulse
          : bossPhase === 2
            ? 0.85 + 0.1 * beatPulse
            : 0.62;
      bossSingularityGroup.scale.setScalar(finiteOr(coreScale, 1));
      bossStarCoreA.rotation.y = t * (bossPhase === 3 ? 3.4 : 1.4);
      bossStarCoreA.rotation.x = t * 1.9;
      bossStarCoreB.rotation.z = -t * (bossPhase === 3 ? 3.8 : 1.5);
      bossCoreGyro1.rotation.z = t * 2.8;
      bossCoreGyro2.rotation.y = -t * 3.2;
      bossCoreGyro3.rotation.x = t * 2.4;
      bossCoreMat.emissiveIntensity = bossPhase === 3 ? 2.4 + 1.4 * beatPulse : 1.3;
      setColorSafe(bossCoreMat.emissive, bossPhase === 3 ? 0xff2a6d : 0x9d4edd);

      // Sync Boss Nodes (Phase 1 Shield Nodes, Phase 2 Wing Emitters, or Phase 3 Core Node)
      const nodesArr = Array.isArray(boss.nodes) ? boss.nodes : [];
      let lockableNodeEmitted = false;

      for (let n = 0; n < nodesArr.length; n++) {
        const nd = nodesArr[n];
        if (!nd || nd.alive === false || nd.dead === true || nd.active === false) continue;
        if (Number.isFinite(nd.hp) && nd.hp <= 0) continue;

        const vis = acquireBossNodeVisual(activeBossNodeCount++);
        const rawNodeId = nd.id !== undefined ? nd.id : `boss-node-${n}`;
        const nodeKey = String(rawNodeId);

        let nOffX = bossOffX;
        let nOffY = bossOffY;
        if (Number.isFinite(nd.localX) || Number.isFinite(nd.localY)) {
          nOffX = bossOffX + finiteOr(nd.localX, 0);
          nOffY = bossOffY + finiteOr(nd.localY, 0);
        } else if (
          Number.isFinite(nd.offsetX) ||
          Number.isFinite(nd.offsetY) ||
          Number.isFinite(nd.x) ||
          Number.isFinite(nd.y)
        ) {
          nOffX = finiteOr(nd.offsetX ?? nd.x, bossOffX);
          nOffY = finiteOr(nd.offsetY ?? nd.y, bossOffY);
        } else {
          const orbAng =
            finiteOr(nd.angle, (n / Math.max(1, nodesArr.length)) * Math.PI * 2 + t * 0.9);
          const orbRad = finiteOr(nd.radius, bossPhase === 2 ? 6.2 : 5.2);
          nOffX = bossOffX + Math.cos(orbAng) * orbRad;
          nOffY = bossOffY + Math.sin(orbAng) * orbRad;
        }

        const nDist = finiteOr(nd.dist ?? nd.corridorDist, bossDist - 2.2);
        sampleCorridorInto(nDist, scratchPt, scratchTan, scratchRight, scratchUp);
        vis.worldPos.set(
          finiteOr(scratchPt.x + scratchRight.x * nOffX + scratchUp.x * nOffY, 0),
          finiteOr(scratchPt.y + scratchRight.y * nOffX + scratchUp.y * nOffY, 0),
          finiteOr(scratchPt.z + scratchRight.z * nOffX + scratchUp.z * nOffY, 0)
        );

        const nodeTelegraph = clamp(finiteOr(nd.telegraph ?? boss.telegraph, 0), 0, 1);
        const nodeFlash = clamp(finiteOr(nd.hitFlash ?? boss.hitFlash, 0), 0, 1);

        vis.root.position.copy(vis.worldPos);
        applyCorridorBasis(vis.root, scratchRight, scratchUp, scratchTan);
        vis.gem.rotation.y = t * 3.2 + n;
        vis.gem.rotation.x = t * 2.0;
        vis.orbitRing.rotation.z = -t * (3.6 + nodeTelegraph * 8.0);
        vis.orbitRing.scale.setScalar(1.0 + 0.35 * nodeTelegraph);
        vis.root.scale.setScalar(1.0 + 0.14 * beatPulse + 0.18 * nodeFlash);
        vis.root.visible = true;

        // Update energy tether to boss center
        vis.tetherF32[0] = vis.worldPos.x;
        vis.tetherF32[1] = vis.worldPos.y;
        vis.tetherF32[2] = vis.worldPos.z;
        vis.tetherF32[3] = bossWorldPosLive.x;
        vis.tetherF32[4] = bossWorldPosLive.y;
        vis.tetherF32[5] = bossWorldPosLive.z;
        vis.tetherAttr.needsUpdate = true;
        setColorSafe(vis.tetherMat.color, bossPhase === 2 ? 0xffd166 : 0x00f0ff);
        vis.tetherLine.visible = true;

        const lockCnt = lockedIdCounts.get(nodeKey) || 0;
        vis.lockRing.visible = lockCnt > 0;
        if (lockCnt > 0) {
          vis.lockRing.rotation.z = t * 5.2;
        }

        const nodeLockable =
          nd.lockable !== undefined
            ? Boolean(nd.lockable)
            : nd.vulnerable !== undefined
              ? Boolean(nd.vulnerable)
              : true;

        if (nodeLockable) lockableNodeEmitted = true;

        syncedTargets.push({
          id: rawNodeId,
          worldPos: vis.worldPos,
          worldRadius: vis.worldRadius,
          lockable: nodeLockable,
        });
        targetWorldById.set(rawNodeId, vis.worldPos);
        targetWorldById.set(nodeKey, vis.worldPos);
      }

      // In Phase 3 (or if boss.coreVulnerable / boss.lockable is set without active nodes),
      // expose the Singularity Core itself for multi-lock up to 8 octave slots!
      if ((bossPhase >= 3 && !lockableNodeEmitted) || boss.lockable === true) {
        const coreId = boss.coreId ?? boss.id ?? 'boss-core';
        const coreWorld = bossWorldPosLive.clone();
        syncedTargets.push({
          id: coreId,
          worldPos: coreWorld,
          worldRadius: 3.4,
          lockable: true,
        });
        targetWorldById.set(coreId, coreWorld);
        targetWorldById.set(String(coreId), coreWorld);
      }
    } else if (bossPointLight) {
      bossPointLight.intensity = 0;
    }

    for (let i = activeBossNodeCount; i < bossNodePool.length; i++) {
      bossNodePool[i].root.visible = false;
      bossNodePool[i].tetherLine.visible = false;
    }

    // --- H. Advance Homing Salvo Beams, Vulcan Bolts & Shockwave/Shard Pools ---
    for (let i = 0; i < salvoBeams.length; i++) {
      const beam = salvoBeams[i];
      if (!beam.active) continue;
      beam.age += safeDt;
      if (beam.age >= beam.duration) {
        beam.active = false;
        beam.line.visible = false;
        beam.tipMesh.visible = false;
        continue;
      }
      // Track live moving target if its ID is still alive in targetWorldById!
      if (beam.targetId !== null && beam.targetId !== undefined) {
        const tracked =
          targetWorldById.get(beam.targetId) || targetWorldById.get(String(beam.targetId));
        if (tracked) beam.p2.copy(tracked);
      }
      const u = clamp(beam.age / beam.duration, 0, 1);
      updateSalvoBeamGeometry(beam, u);
      beam.tipMesh.rotation.y += safeDt * 12;
      beam.tipMesh.rotation.z += safeDt * 9;
      const fade = u > 0.72 ? (1 - u) / 0.28 : 1.0;
      beam.mat.opacity = clamp(0.95 * fade, 0, 1);
      beam.tipMat.opacity = clamp(fade, 0, 1);
    }

    for (let i = 0; i < vulcanBolts.length; i++) {
      const vb = vulcanBolts[i];
      if (!vb.active) continue;
      vb.age += safeDt;
      if (vb.age >= vb.duration) {
        vb.active = false;
        vb.line.visible = false;
        continue;
      }
      const u = clamp(vb.age / vb.duration, 0, 1);
      const t0 = clamp(u * 0.85, 0, 0.92);
      const t1 = clamp(t0 + 0.28, 0.08, 1.0);
      vb.f32[0] = lerp(vb.start.x, vb.end.x, t0);
      vb.f32[1] = lerp(vb.start.y, vb.end.y, t0);
      vb.f32[2] = lerp(vb.start.z, vb.end.z, t0);
      vb.f32[3] = lerp(vb.start.x, vb.end.x, t1);
      vb.f32[4] = lerp(vb.start.y, vb.end.y, t1);
      vb.f32[5] = lerp(vb.start.z, vb.end.z, t1);
      vb.attr.needsUpdate = true;
      vb.mat.opacity = clamp(1 - u * 0.75, 0, 1);
    }

    for (let i = 0; i < shockwaves.length; i++) {
      const sw = shockwaves[i];
      if (!sw.active) continue;
      if (sw.delay > 0) {
        sw.delay -= safeDt;
        if (sw.delay > 0) continue;
        sw.line.visible = true;
      }
      sw.age += safeDt;
      if (sw.age >= sw.life) {
        sw.active = false;
        sw.line.visible = false;
        continue;
      }
      const u = clamp(sw.age / sw.life, 0, 1);
      const easeOut = 1 - Math.pow(1 - u, 2.4);
      const sc = lerp(sw.startScale, sw.endScale, easeOut);
      sw.line.scale.setScalar(Math.max(0.05, finiteOr(sc, 1)));
      sw.line.rotation.z = finiteOr(sw.line.rotation.z + sw.spinSpeed * safeDt, 0);
      sw.mat.opacity = clamp(0.96 * (1 - u * u), 0, 1);
    }

    for (let i = 0; i < shards.length; i++) {
      const sh = shards[i];
      if (!sh.active) continue;
      sh.age += safeDt;
      if (sh.age >= sh.life) {
        sh.active = false;
        sh.mesh.visible = false;
        continue;
      }
      const u = clamp(sh.age / sh.life, 0, 1);
      const damp = Math.exp(-sh.drag * safeDt);
      sh.vx *= damp;
      sh.vy *= damp;
      sh.vz *= damp;
      sh.mesh.position.set(
        finiteOr(sh.mesh.position.x + sh.vx * safeDt, 0),
        finiteOr(sh.mesh.position.y + sh.vy * safeDt, 0),
        finiteOr(sh.mesh.position.z + sh.vz * safeDt, 0)
      );
      sh.mesh.rotation.x = finiteOr(sh.mesh.rotation.x + 7.5 * safeDt, 0);
      sh.mesh.rotation.y = finiteOr(sh.mesh.rotation.y + 9.2 * safeDt, 0);
      sh.mesh.scale.setScalar(Math.max(0.04, finiteOr(sh.startScale * (1 - u), 0.1)));
      sh.mat.opacity = clamp(0.96 * (1 - u), 0, 1);
    }
  }

  return {
    group,
    sampleCorridor,
    corridorToWorld,
    setArea,
    getTargetScreenProjections,
    triggerSalvoVfx,
    triggerVulcanVfx,
    triggerExplosionVfx,
    syncState,
  };
}
