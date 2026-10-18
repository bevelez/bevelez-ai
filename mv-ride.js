// Mountain View 3D — "Bike to work": an opt-in first-person ride from Whisman School Park up the
// Stevens Creek Trail to Gradient Canopy. Loaded on demand by mountain-view.js.

import * as THREE from 'three';

const EYE = 1.55 + 0.13;
const RIDE_FOV = 68;
const SPEED = { cruise: 5.6, sprint: 8.4, coast: 2.6 };
const MARK_LABEL = {
  park: 'Whisman School Park', trail_s: 'Stevens Creek Trail', trail_101: 'Stevens Creek levee · NASA Ames',
  crit_ramp: 'Bay View exit · Crittenden ramp', crit_ln: 'Crittenden Lane', stierlin: 'Stierlin Court · Google lot',
  shoreline: 'North Shoreline Boulevard', gradient: 'Gradient Canopy',
};

export function createRide(ctx) {
  const { scene, camera, controls, renderer, group, onExit, isNight, reduceMotion } = ctx;
  const phase = ctx.phase || (() => 0);
  const phased = []; // materials that darken at night: {mat, day, night}
  const rideGroup = new THREE.Group();
  scene.add(rideGroup);

  let data = null, variant = 'stierlin', curve = null, lengths = null, total = 0;
  let s = 0, speed = 0, yaw = 0, yawTarget = 0, pedal = 0, active = false, paused = false, finished = false;
  let choiceOpen = false, chosen = false, startedAt = 0;
  const keys = new Set();
  const hud = buildHud();

  const curves = {};
  function buildCurves() {
    for (const [key, v] of Object.entries(data.variants)) {
      const pts = [];
      for (let i = 0; i < v.points.length; i += 2) pts.push(new THREE.Vector3(v.points[i], 0, -v.points[i + 1]));
      // drop near-duplicate points so the spline stays smooth
      const clean = [pts[0]];
      for (const p of pts) if (p.distanceTo(clean[clean.length - 1]) > 1.5) clean.push(p);
      const c = new THREE.CatmullRomCurve3(clean, false, 'centripetal', 0.5);
      c.arcLengthDivisions = 2000;
      curves[key] = { curve: c, lengths: c.getLengths(2000), total: c.getLength(), data: v };
    }
  }
  function setVariant(key) {
    variant = key;
    curve = curves[key].curve; lengths = curves[key].lengths; total = curves[key].total;
  }
  // distance -> t on the curve
  function tAt(dist) {
    const u = THREE.MathUtils.clamp(dist / total, 0, 1);
    return curve.getUtoTmapping(u, dist);
  }
  function posAt(dist) { return curve.getPoint(tAt(dist)); }
  function tanAt(dist) { return curve.getTangent(tAt(dist)); }

  // ------------------------------------------------------------ scenery: underpass decks, trail edge
  const underpassPatches = [];
  function buildScenery() {
    const v = curves[variant].data;
    const mk = key => (v.marks.find(x => x.key === key) || {}).at;
    const tun = v.segments.find(sg => sg.tag === 'tunnel');
    leveeFrom = tun ? tun.at + tun.len + 10 : (mk('trail_101') || 1200);
    leveeTo = (mk('crit_ramp') || 3000) + 60;
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8e9199, roughness: 0.9 });
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x7c7f87, roughness: 0.95 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc3, roughness: 0.7, metalness: 0.3 });
    const seen = new Set();
    for (const key of Object.keys(data.variants)) {
      for (const c of data.variants[key].crossings || []) {
        const id = `${Math.round(c.x / 10)}:${Math.round(c.y / 10)}`;
        if (seen.has(id)) continue; seen.add(id);
        const wide = c.c === 'mw' || c.c === 'tr' ? 15 : c.c === 'pr' ? 14 : 11;
        const h = c.c === 'mw' ? 6.8 : 5.6;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(wide, 1.3, 46), deckMat);
        deck.position.set(c.x, h + 0.65, -c.y);
        deck.rotation.y = c.angle + Math.PI / 2;
        deck.castShadow = deck.receiveShadow = true;
        rideGroup.add(deck);
        // hide the map's ground-level road where it crosses the trail: a land-coloured patch under the deck,
        // with the trail re-drawn on top of it
        const patch = new THREE.Mesh(new THREE.BoxGeometry(wide + 6, 0.08, 120), new THREE.MeshStandardMaterial({ color: 0xcfd8b4, roughness: 1 }));
        patch.position.set(c.x, 0.78, -c.y); patch.rotation.y = deck.rotation.y; patch.receiveShadow = true;
        rideGroup.add(patch);
        underpassPatches.push({ at: c.at });
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 46), railMat);
          rail.position.set(side * (wide / 2 - 0.2), 1.3 + 0.55, 0);
          deck.add(rail);
          for (const along of [-17, 17]) {
            const pier = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.9, h, 2.2), pierMat);
            pier.position.set(0, -h / 2 - 0.65, along);
            pier.castShadow = pier.receiveShadow = true;
            deck.add(pier);
          }
        }
      }
    }
    // the trail as a levee: asphalt crown with grass slopes, sampled along the spline
    buildTrailSurface();
    buildCentreDashes();
    buildTunnelsAndBridges(v);
    buildTowers(v);
    buildThickets(v);
    // fence posts along the creek side of the trail, rails joined post to post
    const trailEnd = (v.marks.find(mk => mk.key === 'crit_ramp') || { at: 2900 }).at;
    const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 1.1, 6); postGeo.translate(0, 0.55, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8b6b48, roughness: 1 });
    const postPos = [];
    const trailStart = (v.segments.find(sg => sg.name === 'Stevens Creek Trail') || { at: 0 }).at;
    for (let d = trailStart; d < Math.min(total, trailEnd); d += 4.5) {
      const p = posAt(d), t = tanAt(d);
      postPos.push(new THREE.Vector3(p.x - t.z * 2.4, surfaceY(d, 2.4), p.z + t.x * 2.4));
    }
    const posts = new THREE.InstancedMesh(postGeo, postMat, postPos.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    postPos.forEach((pp, i) => { m.makeTranslation(pp.x, pp.y, pp.z); posts.setMatrixAt(i, m); });
    posts.castShadow = true;
    rideGroup.add(posts);
    const railGeo = new THREE.BoxGeometry(1, 0.06, 0.06); // unit length along x, scaled per rail
    const rails = new THREE.InstancedMesh(railGeo, postMat, Math.max(1, postPos.length - 1));
    for (let i = 0; i + 1 < postPos.length; i++) {
      const a = postPos[i], b = postPos[i + 1];
      const dir = b.clone().sub(a); const len = dir.length();
      pv.copy(a).add(b).multiplyScalar(0.5); pv.y += 0.95;
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
      sc.set(len, 1, 1);
      m.compose(pv, q, sc); rails.setMatrixAt(i, m);
    }
    rails.castShadow = true;
    rideGroup.add(rails);
  }
  // yellow dashes down the middle of the trail (the paint in the trail photos)
  function buildCentreDashes() {
    const geo = new THREE.BoxGeometry(1.3, 0.02, 0.12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe9d98a, roughness: 1 });
    phased.push({ mat, day: new THREE.Color(0xe9d98a), night: new THREE.Color(0x6e6a4a) });
    const n = Math.floor(total / 3.8);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    let k = 0;
    for (let d = 1.5; d < total && k < n; d += 3.8) {
      const p = posAt(d), t = tanAt(d);
      pv.set(p.x, 0.35 + hump(d), p.z);
      q.setFromAxisAngle(up, Math.atan2(-t.z, t.x));
      m.compose(pv, q, one); mesh.setMatrixAt(k++, m);
    }
    mesh.count = k; rideGroup.add(mesh);
  }

  // concrete box tunnels where the trail is tagged tunnel; decks with railings where it is a bridge
  function buildTunnelsAndBridges(v) {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9a9b9c, roughness: 0.95 });
    const rail = new THREE.MeshStandardMaterial({ color: 0xa9adb5, roughness: 0.6, metalness: 0.4 });
    const wallGeo = new THREE.BoxGeometry(2.3, 3.4, 0.45); wallGeo.translate(0, 1.7, 0);
    const slabGeo = new THREE.BoxGeometry(2.3, 0.7, 7.0); slabGeo.translate(0, 3.75, 0);
    const deckGeo = new THREE.BoxGeometry(2.3, 0.35, 4.6); deckGeo.translate(0, 0.33, 0);
    const railGeo = new THREE.BoxGeometry(2.3, 1.05, 0.08); railGeo.translate(0, 0.33 + 0.55, 0);
    const postGeo = new THREE.BoxGeometry(0.08, 1.05, 0.08); postGeo.translate(0, 0.33 + 0.55, 0);
    const items = [];
    for (const seg of v.segments) {
      if (seg.tag !== 'tunnel' && seg.tag !== 'bridge') continue;
      for (let d = seg.at; d < seg.at + seg.len; d += 2.2) items.push({ d, tag: seg.tag });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    const place = (mesh, i, d, side) => {
      const p = posAt(d), t = tanAt(d);
      const nx = -t.z, nz = t.x;
      pv.set(p.x + nx * side, 0, p.z + nz * side);
      q.setFromAxisAngle(up, Math.atan2(-t.z, t.x));
      m.compose(pv, q, one); mesh.setMatrixAt(i, m);
    };
    const tunnels = items.filter(i => i.tag === 'tunnel'), bridges = items.filter(i => i.tag === 'bridge');
    if (tunnels.length) {
      const walls = new THREE.InstancedMesh(wallGeo, concrete, tunnels.length * 2);
      const slabs = new THREE.InstancedMesh(slabGeo, concrete, tunnels.length);
      // a floor across the box so the map's road ribbons never show beside the crown
      const floorGeo = new THREE.BoxGeometry(2.3, 0.1, 6.6); floorGeo.translate(0, 0.86, 0);
      const floors = new THREE.InstancedMesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x7f7d79, roughness: 1 }), tunnels.length);
      tunnels.forEach((it, i) => { place(walls, i * 2, it.d, 3.1); place(walls, i * 2 + 1, it.d, -3.1); place(slabs, i, it.d, 0); place(floors, i, it.d, 0); });
      walls.castShadow = slabs.castShadow = true; walls.receiveShadow = floors.receiveShadow = true;
      rideGroup.add(walls, slabs, floors);
    }
    if (bridges.length) {
      const decks = new THREE.InstancedMesh(deckGeo, concrete, bridges.length);
      const rails = new THREE.InstancedMesh(railGeo, rail, bridges.length * 2);
      bridges.forEach((it, i) => { place(decks, i, it.d, 0); place(rails, i * 2, it.d, 2.2); place(rails, i * 2 + 1, it.d, -2.2); });
      decks.receiveShadow = true;
      rideGroup.add(decks, rails);
    }
  }

  // the transmission line that follows the creek north of Central Expressway
  function buildTowers(v) {
    const steel = new THREE.MeshStandardMaterial({ color: 0x8b9099, roughness: 0.6, metalness: 0.5 });
    const legGeo = new THREE.BoxGeometry(0.35, 34, 0.35); legGeo.translate(0, 17, 0);
    const armGeo = new THREE.BoxGeometry(14, 0.3, 0.3);
    const wireGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 4); wireGeo.rotateZ(Math.PI / 2); // unit length along x
    const from = 1250, to = Math.min(total, 3050);
    const towers = [];
    for (let d = from; d < to; d += 230) {
      const p = posAt(d), t = tanAt(d);
      const nx = -t.z, nz = t.x;
      towers.push(new THREE.Vector3(p.x + nx * 20, 0, p.z + nz * 20));
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), sc = new THREE.Vector3();
    const legs = new THREE.InstancedMesh(legGeo, steel, towers.length * 4);
    const arms = new THREE.InstancedMesh(armGeo, steel, towers.length * 2);
    towers.forEach((c, i) => {
      [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(([ox, oz], j) => {
        pv.set(c.x + ox, 0, c.z + oz); sc.set(1, 1, 1);
        // taper: lean legs inward
        q.setFromAxisAngle(new THREE.Vector3(oz, 0, -ox).normalize(), 0.055);
        m.compose(pv, q, sc); legs.setMatrixAt(i * 4 + j, m);
      });
      [24, 30].forEach((h, j) => { pv.set(c.x, h, c.z); q.identity(); m.compose(pv, q, one); arms.setMatrixAt(i * 2 + j, m); });
    });
    legs.castShadow = true;
    rideGroup.add(legs, arms);
    // wires: three per level, sagging between towers as two straight halves
    const segs = [];
    for (let i = 0; i + 1 < towers.length; i++) {
      for (const h of [24, 30]) for (const ox of [-6.5, 0, 6.5]) {
        const a = new THREE.Vector3(towers[i].x + ox, h, towers[i].z), b = new THREE.Vector3(towers[i + 1].x + ox, h, towers[i + 1].z);
        const mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= 4.5;
        segs.push([a, mid], [mid, b]);
      }
    }
    const wires = new THREE.InstancedMesh(wireGeo, new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.8 }), segs.length);
    segs.forEach(([a, b], i) => {
      const dir = b.clone().sub(a); const len = dir.length();
      pv.copy(a).add(b).multiplyScalar(0.5);
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
      sc.set(len, 1, 1);
      m.compose(pv, q, sc); wires.setMatrixAt(i, m);
    });
    rideGroup.add(wires);
  }

  // willow and shrub thickets pressing in on the trail
  function buildThickets(v) {
    const geo = new THREE.IcosahedronGeometry(1.4, 1); geo.scale(1.3, 0.8, 1.1); geo.translate(0, 0.9, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const greens = [new THREE.Color(0x6f9c5a), new THREE.Color(0x86a85f), new THREE.Color(0x5e8d4f), new THREE.Color(0x9cae66)];
    const spots = [];
    for (const seg of v.segments) {
      if (!/Stevens Creek Trail|Hetch Hetchy/.test(seg.name) || seg.tag) continue;
      for (let d = seg.at + 2; d < seg.at + seg.len; d += 3.2) {
        for (const side of [-1, 1]) {
          if (Math.random() > 0.78) continue;
          const off = 5.4 + Math.random() * 4.5;
          spots.push({ d, side, off, s: 0.55 + Math.random() * 0.75, c: Math.floor(Math.random() * greens.length) });
        }
      }
    }
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    spots.forEach((sp, i) => {
      const p = posAt(sp.d), t = tanAt(sp.d);
      pv.set(p.x - t.z * sp.off * sp.side, surfaceY(sp.d, sp.off) - 0.3, p.z + t.x * sp.off * sp.side);
      q.setFromAxisAngle(up, Math.random() * 6.283); sc.set(sp.s * 1.2, sp.s, sp.s);
      m.compose(pv, q, sc); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, greens[sp.c]);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    rideGroup.add(mesh);
    phased.push({ mat, day: new THREE.Color(0xffffff), night: new THREE.Color(0x3a4658) });
  }

  // extra height of the trail near an underpass (so it rides over the hidden road, not through it)
  // trail height above the map: a 1.2 m levee from the US-101 box to the Crittenden ramp (the trail runs
  // along the top of the flood bank there), plus a small rise over each hidden road crossing
  let leveeFrom = 1200, leveeTo = 3000;
  // rise over a hidden road crossing, 0..1
  function underFactor(d) {
    let f = 0;
    for (const u of underpassPatches) {
      const x = Math.abs(d - u.at);
      if (x < 60) f = Math.max(f, 1 - THREE.MathUtils.smoothstep(x, 28, 60));
    }
    return f;
  }
  function hump(d) {
    const h = 0.66 * underFactor(d);
    const lv = 1.2 * THREE.MathUtils.smoothstep(d, leveeFrom, leveeFrom + 70) * (1 - THREE.MathUtils.smoothstep(d, leveeTo - 70, leveeTo));
    return Math.max(h, lv);
  }
  // height of the levee surface at a lateral offset from the centre line (crown 2.1 m, toe at 8 m);
  // near an underpass the whole strip, toes included, sits on the patch that hides the road
  function surfaceY(d, off) {
    const h = hump(d), a = Math.abs(off);
    const toe = 0.02 + 0.84 * underFactor(d);
    const crown = 0.30 + h;
    if (a <= 2.1) return crown;
    if (a >= 8) return toe;
    return toe + (crown - toe) * (1 - THREE.MathUtils.smoothstep(a, 2.1, 8));
  }
  function buildTrailSurface() {
    const offs = [-8, -4.8, -2.3, -2.1, 2.1, 2.3, 4.8, 8];
    const grass = new THREE.Color(0xa9c38c), asphalt = new THREE.Color(0x8a8781), edge = new THREE.Color(0x9a9c92), concrete = new THREE.Color(0x8d8c89);
    const cols = [grass, grass, edge, asphalt, asphalt, edge, grass, grass];
    const tunnels = curves[variant].data.segments.filter(sg => sg.tag === 'tunnel');
    const positions = [], colors = [], indices = [];
    let row = 0;
    for (let d = 0; d <= total; d += 2.5, row++) {
      const p = posAt(d), t = tanAt(d);
      const nx = -t.z, nz = t.x;
      const inTunnel = tunnels.some(tn => d >= tn.at - 3 && d <= tn.at + tn.len + 3);
      offs.forEach((o, j) => {
        positions.push(p.x + nx * o, surfaceY(d, o), p.z + nz * o);
        const c = inTunnel && Math.abs(o) > 2.1 ? concrete : cols[j];
        colors.push(c.r, c.g, c.b);
      });
      if (row > 0) {
        const a = (row - 1) * offs.length, b = row * offs.length;
        for (let j = 0; j + 1 < offs.length; j++) indices.push(a + j, a + j + 1, b + j, a + j + 1, b + j + 1, b + j);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(indices); g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -0.3, polygonOffsetUnits: -12 });
    phased.push({ mat, day: new THREE.Color(0xffffff), night: new THREE.Color(0x4a5468) });
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    rideGroup.add(mesh);
  }
  function ribbon(pts, width, y, color, ys = null) {
    const positions = [], indices = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const d = next.clone().sub(prev).normalize();
      const nrm = new THREE.Vector2(-d.y, d.x).multiplyScalar(width / 2);
      const yy = ys ? ys[i] : y;
      positions.push(pts[i].x + nrm.x, yy, pts[i].y + nrm.y, pts[i].x - nrm.x, yy, pts[i].y - nrm.y);
      if (i > 0) { const a = (i - 1) * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -0.3, polygonOffsetUnits: -12 }));
    mesh.receiveShadow = true;
    return mesh;
  }

  // ------------------------------------------------------------ the bike, seen from the saddle
  const bike = new THREE.Group();
  function buildBike() {
    const frame = new THREE.MeshStandardMaterial({ color: 0x3b7bd6, roughness: 0.45, metalness: 0.35 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.35, metalness: 0.7 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.95 });
    const wicker = new THREE.MeshStandardMaterial({ color: 0xc9a56d, roughness: 1 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.5, 8), chrome);
    stem.position.set(0, -0.42, -0.62); stem.rotation.x = 0.35; bike.add(stem);
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.016, 8, 24, Math.PI), frame);
    bar.rotation.set(Math.PI / 2, 0, Math.PI); bar.position.set(0, -0.36, -0.64); bike.add(bar);
    for (const sgn of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), rubber);
      grip.rotation.z = Math.PI / 2; grip.position.set(sgn * 0.3, -0.36, -0.4); bike.add(grip);
    }
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), wicker);
    basket.position.set(0, -0.5, -0.92); bike.add(basket);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 28), rubber);
    wheel.rotation.y = Math.PI / 2; wheel.position.set(0, -1.1, -1.05); bike.add(wheel);
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.64, 4), chrome);
      sp.rotation.x = i * Math.PI / 8; sp.position.copy(wheel.position); bike.add(sp);
    }
    bike.userData.wheel = wheel; bike.userData.spokes = bike.children.filter(c => c.geometry && c.geometry.type === 'CylinderGeometry' && c.position.z === wheel.position.z);
    camera.add(bike);
  }

  // ------------------------------------------------------------ HUD
  function buildHud() {
    const root = document.createElement('div');
    root.className = 'ride-hud';
    root.innerHTML = `
      <div class="ride-top">
        <button class="pill icon" id="ride-exit" type="button" aria-label="Back to the map"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <div class="pill ride-street" id="ride-street">Whisman School Park</div>
        <div class="pill ride-speed" id="ride-speed">0 km/h</div>
      </div>
      <div class="ride-progress"><div class="bar"><div class="fill" id="ride-fill"></div></div><div class="marks" id="ride-marks"></div></div>
      <div class="ride-hint" id="ride-hint">↑ pedal harder · ← → glance · space pause · esc map</div>
      <div class="ride-choice hidden" id="ride-choice">
        <div class="q">Which way to Gradient Canopy?</div>
        <button class="pill" data-v="stierlin" type="button">Stierlin Court · through the Google lot</button>
        <button class="pill" data-v="shoreline" type="button">North Shoreline Boulevard</button>
      </div>
      <div class="ride-done hidden" id="ride-done">
        <div class="big">You made it to Gradient Canopy</div>
        <div class="stats" id="ride-stats"></div>
        <button class="pill" id="ride-again" type="button">Ride again</button>
        <button class="pill" id="ride-map" type="button">Back to the map</button>
      </div>`;
    document.body.appendChild(root);
    root.querySelector('#ride-exit').addEventListener('click', () => exit());
    root.querySelector('#ride-map').addEventListener('click', () => exit());
    root.querySelector('#ride-again').addEventListener('click', () => restart());
    root.querySelectorAll('#ride-choice button').forEach(b => b.addEventListener('click', () => choose(b.dataset.v)));
    return root;
  }
  function renderMarks() {
    const v = curves[variant].data;
    const el = hud.querySelector('#ride-marks'); el.innerHTML = '';
    for (const mk of v.marks) {
      const d = document.createElement('div'); d.className = 'mark';
      d.style.left = (100 * mk.at / total) + '%'; d.title = MARK_LABEL[mk.key] || mk.key;
      el.appendChild(d);
    }
  }
  function streetAt(dist) {
    const v = curves[variant].data;
    let name = '';
    for (const seg of v.segments) { if (seg.at <= dist) name = seg.name || name; else break; }
    for (const mk of v.marks) if (Math.abs(mk.at - dist) < 40) return MARK_LABEL[mk.key] || name;
    return name || 'Path';
  }

  // ------------------------------------------------------------ input
  function onKey(e, down) {
    const k = e.key.toLowerCase();
    if (!active) return;
    if (down && k === 'escape') { exit(); return; }
    if (down && k === ' ') { paused = !paused; e.preventDefault(); return; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift'].includes(k)) {
      if (down) keys.add(k); else keys.delete(k);
      e.preventDefault();
    }
  }
  let touch = null, mapFov = 50, mapNear = 12;
  function onTouch(e, phase) {
    if (!active) return;
    const t = e.touches && e.touches[0];
    if (phase === 'start' && t) { touch = { x: t.clientX, y: t.clientY, yaw0: yawTarget, t0: performance.now(), moved: false }; keys.add('shift'); }
    if (phase === 'move' && t && touch) { const dx = t.clientX - touch.x; if (Math.abs(dx) > 6) touch.moved = true; yawTarget = THREE.MathUtils.clamp(touch.yaw0 - dx * 0.006, -1.3, 1.3); }
    if (phase === 'end') { keys.delete('shift'); touch = null; }
  }
  const handlers = {
    keydown: e => onKey(e, true), keyup: e => onKey(e, false),
    touchstart: e => onTouch(e, 'start'), touchmove: e => onTouch(e, 'move'), touchend: e => onTouch(e, 'end'),
  };

  // ------------------------------------------------------------ lifecycle
  async function start() {
    if (!data) {
      data = await (await fetch('./assets/mountain-view-ride.json?v=2')).json();
      buildCurves();
      setVariant('stierlin');
      buildScenery();
      buildBike();
    }
    for (const [ev, fn] of Object.entries(handlers)) addEventListener(ev, fn, { passive: ev !== 'keydown' });
    controls.enabled = false;
    mapFov = camera.fov; mapNear = camera.near; camera.fov = RIDE_FOV; camera.near = 0.4; camera.updateProjectionMatrix();
    hud.classList.add('on');
    document.documentElement.dataset.ride = 'on';
    renderMarks();
    restart();
    active = true;
  }
  function restart() {
    s = 0; speed = 0; yaw = 0; yawTarget = 0; pedal = 0; paused = false; finished = false; chosen = false; choiceOpen = false;
    setVariant('stierlin'); renderMarks();
    hud.querySelector('#ride-done').classList.add('hidden');
    hud.querySelector('#ride-choice').classList.add('hidden');
    startedAt = performance.now();
    const p = posAt(0), t = tanAt(0);
    camera.position.set(p.x, EYE, p.z);
    camera.lookAt(p.x + t.x, EYE - 0.05, p.z + t.z);
  }
  function choose(v) {
    chosen = true; choiceOpen = false;
    hud.querySelector('#ride-choice').classList.add('hidden');
    if (v !== variant) {
      // the variants share the trunk up to Crittenden Lane: keep the same distance along it
      const before = total; setVariant(v); renderMarks();
    }
    paused = false;
  }
  function exit() {
    active = false; paused = false;
    for (const [ev, fn] of Object.entries(handlers)) removeEventListener(ev, fn);
    hud.classList.remove('on');
    delete document.documentElement.dataset.ride;
    camera.remove(bike);
    camera.fov = mapFov; camera.near = mapNear; camera.updateProjectionMatrix();
    controls.enabled = true;
    onExit && onExit();
  }

  // ------------------------------------------------------------ per-frame
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _look = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  let bob = 0;
  function update(dt, time) {
    if (!active || finished) return;
    if (!bike.parent) camera.add(bike);
    const sprint = keys.has('shift') || keys.has('arrowup') || keys.has('w');
    const slow = keys.has('arrowdown') || keys.has('s');
    const looking = keys.has('arrowleft') || keys.has('a') || keys.has('arrowright') || keys.has('d') || !!touch;
    if (keys.has('arrowleft') || keys.has('a')) yawTarget = Math.min(1.3, yawTarget + dt * 0.8);
    if (keys.has('arrowright') || keys.has('d')) yawTarget = Math.max(-1.3, yawTarget - dt * 0.8);
    if (!looking) yawTarget *= Math.max(0, 1 - dt * 1.1); // drift back to the road ahead
    const target = paused ? 0 : (sprint ? SPEED.sprint : slow ? SPEED.coast : SPEED.cruise);
    speed += (target - speed) * Math.min(1, dt * (target > speed ? 1.2 : 2.2));
    s = Math.min(total, s + speed * dt);
    yaw += (yawTarget - yaw) * Math.min(1, dt * 2.6);
    if (!paused) pedal += speed * dt;

    // choice at the Crittenden Lane mark
    const v = curves[variant].data;
    const critAt = (v.marks.find(m => m.key === 'crit_ln') || {}).at || 0;
    if (!chosen && !choiceOpen && s > critAt - 60) {
      choiceOpen = true; paused = true;
      hud.querySelector('#ride-choice').classList.remove('hidden');
    }

    curve.getPoint(tAt(s), _p);
    curve.getTangent(tAt(s), _t);
    // lean into turns from curvature; a gentle cadence bob
    const ahead = curve.getTangent(tAt(Math.min(total, s + 14)));
    const turn = THREE.MathUtils.clamp(_t.x * ahead.z - _t.z * ahead.x, -1, 1);
    bob = reduceMotion ? 0 : Math.sin(pedal * 2.1) * 0.012 * Math.min(1, speed / 4);
    camera.position.set(_p.x, EYE + bob + hump(s), _p.z);
    // positive yaw turns the view to the left (counter-clockwise seen from above)
    const yawed = new THREE.Vector3(_t.x * Math.cos(yaw) + _t.z * Math.sin(yaw), 0, -_t.x * Math.sin(yaw) + _t.z * Math.cos(yaw));
    _look.copy(camera.position).add(yawed.multiplyScalar(10)); _look.y -= 0.35;
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
    camera.rotateZ(-turn * 0.07 * Math.min(1, speed / 5));
    // bike details
    bike.rotation.y = yaw * 0.25;
    bike.userData.wheel.rotation.x = -pedal / 0.34;
    for (const sp of bike.userData.spokes) sp.rotation.x += 0;
    const ph = phase();
    for (const e of phased) e.mat.color.copy(e.day).lerp(e.night, ph);
    // HUD
    hud.querySelector('#ride-fill').style.width = (100 * s / total) + '%';
    hud.querySelector('#ride-speed').textContent = Math.round(speed * 3.6) + ' km/h';
    hud.querySelector('#ride-street').textContent = streetAt(s);
    hud.querySelector('#ride-hint').style.opacity = s < 120 ? '1' : '0';
    if (s >= total - 0.5) {
      finished = true;
      const secs = (performance.now() - startedAt) / 1000;
      hud.querySelector('#ride-stats').textContent = `${(total / 1000).toFixed(1)} km · ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')} · ${isNight() ? 'under the street lights' : 'in the sunshine'}`;
      hud.querySelector('#ride-done').classList.remove('hidden');
    }
  }

  return { start, exit, update, restart, choose, jump: (d) => { s = THREE.MathUtils.clamp(d, 0, total); }, get active() { return active; }, get distance() { return s; }, get total() { return total; } };
}
