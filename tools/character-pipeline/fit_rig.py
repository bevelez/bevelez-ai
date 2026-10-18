"""
fit_rig.py — Blender 4.3 headless: turn a generated character mesh (Hunyuan3D / TRELLIS GLB)
into a game-ready skinned GLB that the DJ KRONOS authored clips can drive directly.

  Blender -b --python fit_rig.py -- <in.glb> <character> <out.glb> [--faces 24000] [--tex 1024] [--front +y|-y|auto]

The skeleton uses the same 19 bone names, joint offsets and identity rest pose as the authored
clip GLBs (assets/models/kronos-clips-*.glb), so no retargeting is needed: the clips bind by name.
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
IN_GLB, CHAR, OUT_GLB = argv[0], argv[1], argv[2]
def opt(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
TARGET_FACES = int(opt('--faces', '24000'))
TEX_SIZE = int(opt('--tex', '1024'))
FRONT = opt('--front', 'auto')          # which Blender axis the generated mesh faces
STRIP_ARMATURE = '--strip-armature' in argv  # dry-run mode: drop any skeleton that came with the GLB
TRIM_BAND = opt('--trim-depth-band', None)  # 'z0,z1': in that height band, drop geometry deeper than the chest profile
FRONT_MASK = opt('--front-mask', None)       # keyed front crop: geometry outside its silhouette is carved away

# ---------------------------------------------------------------------------------------------
# Joint spec in Three.js Y-up coordinates: name -> (parent, (x, y, z)). Identical to the clip GLBs.
SPECS = {
  'challenger': {
    'hips': (None, (0.0, 1.07, 0.0)), 'spine': ('hips', (0.0, 1.09, 0.0)), 'torso': ('spine', (0.0, 1.11, 0.0)),
    'neck': ('torso', (0.0, 1.60, 0.002)), 'head': ('neck', (0.0, 1.76, 0.0)),
    'leftShoulder': ('torso', (-0.12, 1.54, 0.005)), 'leftArm': ('leftShoulder', (-0.215, 1.54, 0.005)),
    'leftElbow': ('leftArm', (-0.215, 1.28, 0.005)), 'leftHand': ('leftElbow', (-0.215, 1.005, 0.005)),
    'rightShoulder': ('torso', (0.12, 1.54, 0.005)), 'rightArm': ('rightShoulder', (0.215, 1.54, 0.005)),
    'rightElbow': ('rightArm', (0.215, 1.28, 0.005)), 'rightHand': ('rightElbow', (0.215, 1.005, 0.005)),
    'leftLeg': ('hips', (-0.105, 1.02, 0.0)), 'leftKnee': ('leftLeg', (-0.115, 0.64, 0.0)), 'leftAnkle': ('leftKnee', (-0.115, 0.22, 0.006)),
    'rightLeg': ('hips', (0.105, 1.02, 0.0)), 'rightKnee': ('rightLeg', (0.115, 0.64, 0.0)), 'rightAnkle': ('rightKnee', (0.115, 0.22, 0.006)),
  },
  'kronos': {
    'hips': (None, (0.0, 1.04, 0.0)), 'spine': ('hips', (0.0, 1.055, 0.0)), 'torso': ('spine', (0.0, 1.07, 0.0)),
    'neck': ('torso', (0.0, 1.62, 0.004)), 'head': ('neck', (0.0, 1.78, 0.008)),
    'leftShoulder': ('torso', (-0.14, 1.50, 0.0)), 'leftArm': ('leftShoulder', (-0.248, 1.50, 0.0)),
    'leftElbow': ('leftArm', (-0.248, 1.24, 0.0)), 'leftHand': ('leftElbow', (-0.248, 0.96, 0.0)),
    'rightShoulder': ('torso', (0.14, 1.50, 0.0)), 'rightArm': ('rightShoulder', (0.248, 1.50, 0.0)),
    'rightElbow': ('rightArm', (0.248, 1.24, 0.0)), 'rightHand': ('rightElbow', (0.248, 0.96, 0.0)),
    'leftLeg': ('hips', (-0.115, 0.99, 0.0)), 'leftKnee': ('leftLeg', (-0.129, 0.62, 0.0)), 'leftAnkle': ('leftKnee', (-0.129, 0.22, -0.006)),
    'rightLeg': ('hips', (0.115, 0.99, 0.0)), 'rightKnee': ('rightLeg', (0.129, 0.62, 0.0)), 'rightAnkle': ('rightKnee', (0.129, 0.22, -0.006)),
  },
  'bruiser': {
    'hips': (None, (0.0, 1.00, 0.0)), 'spine': ('hips', (0.0, 1.03, 0.0)), 'torso': ('spine', (0.0, 1.06, 0.0)),
    'neck': ('torso', (0.0, 1.75, 0.0)), 'head': ('neck', (0.0, 1.94, 0.0)),
    'leftShoulder': ('torso', (-0.15, 1.68, 0.0)), 'leftArm': ('leftShoulder', (-0.255, 1.68, 0.0)),
    'leftElbow': ('leftArm', (-0.255, 1.34, 0.0)), 'leftHand': ('leftElbow', (-0.255, 0.98, 0.0)),
    'rightShoulder': ('torso', (0.15, 1.68, 0.0)), 'rightArm': ('rightShoulder', (0.255, 1.68, 0.0)),
    'rightElbow': ('rightArm', (0.255, 1.34, 0.0)), 'rightHand': ('rightElbow', (0.255, 0.98, 0.0)),
    'leftLeg': ('hips', (-0.15, 1.00, 0.0)), 'leftKnee': ('leftLeg', (-0.15, 0.52, 0.0)), 'leftAnkle': ('leftKnee', (-0.15, 0.08, 0.02)),
    'rightLeg': ('hips', (0.15, 1.00, 0.0)), 'rightKnee': ('rightLeg', (0.15, 0.52, 0.0)), 'rightAnkle': ('rightKnee', (0.15, 0.08, 0.02)),
  },
}
# Standing height of each design (top of hair/cap) in metres, and which glTF axis the game rig faces.
HEIGHTS = {'challenger': 1.88, 'kronos': 2.02, 'bruiser': 2.04}
GAME_FACING_GLTF_Z = {'challenger': -1.0, 'kronos': +1.0, 'bruiser': +1.0}

def three_to_blender(p):  # Three Y-up -> Blender Z-up for export_yup=True
    return Vector((p[0], -p[2], p[1]))

spec = SPECS[CHAR]

# ---------------------------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN_GLB)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
if STRIP_ARMATURE:
    for o in meshes:
        for m in list(o.modifiers):
            if m.type == 'ARMATURE': o.modifiers.remove(m)
        o.vertex_groups.clear()
        o.parent = None
    for a in arms: bpy.data.objects.remove(a, do_unlink=True)
    arms = []
for o in bpy.context.scene.objects:
    o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
mesh = bpy.context.view_layer.objects.active
mesh.name = f'{CHAR}_body'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Remove backdrop slabs: any connected component whose thinnest extent is < 4 % of its longest
# (a flat panel), or that is not the main body and is tiny. Keeps the largest 3D component plus
# any component with volume (accessories that got detached by the generator).
bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table()
seen = set(); comps = []
for v in bm.verts:
    if v.index in seen: continue
    stack = [v]; comp = []; seen.add(v.index)
    while stack:
        cur = stack.pop(); comp.append(cur.index)
        for e in cur.link_edges:
            ov = e.other_vert(cur)
            if ov.index not in seen: seen.add(ov.index); stack.append(ov)
    comps.append(comp)
co_all = np.array([v.co[:] for v in bm.verts])
drop = set(); kept = []
total_ext = (co_all.max(0) - co_all.min(0)).max()
for comp in comps:
    P = co_all[comp]; ext = np.sort(P.max(0) - P.min(0))
    planar = ext[0] < 0.04 * ext[2]
    tiny = ext[2] < 0.02 * total_ext or len(comp) < 0.01 * co_all.shape[0]
    if planar or tiny: drop.update(comp)
    else: kept.append(len(comp))
if drop:
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in drop], context='VERTS')
    bm.to_mesh(mesh.data); mesh.data.update()
bm.free()
components_report = {'components': len(comps), 'dropped_verts': len(drop), 'kept_sizes': kept[:6]}

# Clean + decimate to budget
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
faces_before = len(mesh.data.polygons)
co_dense = np.array([v.co[:] for v in mesh.data.vertices], dtype=np.float64)
mesh.data.calc_loop_triangles()
tris_dense = np.array([lt.vertices[:] for lt in mesh.data.loop_triangles], dtype=np.int64)
if faces_before > TARGET_FACES:
    dec = mesh.modifiers.new('dec', 'DECIMATE')
    dec.ratio = TARGET_FACES / faces_before
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier='dec')
faces_after = len(mesh.data.polygons)

# Normalize: feet on the floor, centred, scaled to the design height (computed on the dense mesh)
co = np.array([v.co[:] for v in mesh.data.vertices], dtype=np.float64)
mn, mx = co_dense.min(axis=0), co_dense.max(axis=0)
height = mx[2] - mn[2]
scale = HEIGHTS[CHAR] / height
center = np.array([(mn[0] + mx[0]) * 0.5, (mn[1] + mx[1]) * 0.5, mn[2]])
co = (co - center) * scale
co_dense = (co_dense - center) * scale

# Facing: the feet (lowest 9 %) stick out in front of the ankles -> front direction in XY
if FRONT == 'auto':
    h = co_dense[:, 2].max()
    feet = co_dense[co_dense[:, 2] < 0.09 * h]
    shins = co_dense[(co_dense[:, 2] > 0.12 * h) & (co_dense[:, 2] < 0.22 * h)]
    d = feet[:, :2].mean(axis=0) - shins[:, :2].mean(axis=0)
    front_xy = d / (np.linalg.norm(d) + 1e-9)
else:
    front_xy = np.array({'+y': (0, 1), '-y': (0, -1), '+x': (1, 0), '-x': (-1, 0)}[FRONT], dtype=np.float64)
if FRONT == 'auto' and '--no-snap' not in argv:
    snapped = np.zeros(2); snapped[np.abs(front_xy).argmax()] = np.sign(front_xy[np.abs(front_xy).argmax()]); front_xy = snapped
# Game facing: glTF -Z == Blender +Y ; glTF +Z == Blender -Y
want_xy = np.array((0.0, -GAME_FACING_GLTF_Z[CHAR]))
ang = math.atan2(want_xy[1], want_xy[0]) - math.atan2(front_xy[1], front_xy[0])
rot = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
co[:, :2] = co[:, :2] @ rot.T
co_dense[:, :2] = co_dense[:, :2] @ rot.T
for v, c in zip(mesh.data.vertices, co):
    v.co = Vector(c)
mesh.data.update()

trim_report = None
if TRIM_BAND:
    z0, z1 = [float(v) for v in TRIM_BAND.split(',')]
    chest = co_dense[(co_dense[:, 2] > 1.2) & (co_dense[:, 2] < 1.5)]
    ymin_b, ymax_b = np.percentile(chest[:, 1], 1), np.percentile(chest[:, 1], 99)
    def deep(P):
        inband = (P[:, 2] >= z0) & (P[:, 2] <= z1)
        return inband & ((P[:, 1] < ymin_b + 0.0) | (P[:, 1] > ymax_b - 0.0))
    dm = deep(co)
    if dm.any():
        bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(dm)[0]], context='VERTS')
        bm.to_mesh(mesh.data); mesh.data.update(); bm.free()
        co = np.array([v.co[:] for v in mesh.data.vertices], dtype=np.float64)
    kd = ~deep(co_dense)
    remap = -np.ones(co_dense.shape[0], dtype=np.int64); remap[kd] = np.arange(int(kd.sum()))
    tri_ok = kd[tris_dense].all(axis=1); tris_dense = remap[tris_dense[tri_ok]]; co_dense = co_dense[kd]
    trim_report = {'verts_dropped': int(dm.sum()), 'chest_y': [round(float(ymin_b), 3), round(float(ymax_b), 3)]}

# Silhouette carve: the generator reconstructs one volume from the front view, so studio panels,
# floor wedges and anything else outside the drawn figure can be removed by projecting every
# vertex into the keyed front crop and dropping those that land on transparent pixels.
carve_report = None
if FRONT_MASK and os.path.exists(FRONT_MASK):
    mimg = bpy.data.images.load(FRONT_MASK); mw, mh = mimg.size
    malpha = np.array(mimg.pixels[:], dtype=np.float32).reshape(mh, mw, 4)[::-1][..., 3] > 0.5
    # erode 2 px so the carve never nibbles the figure's own edge
    er = malpha.copy()
    for _ in range(3):
        e = er.copy(); e[1:] &= er[:-1]; e[:-1] &= er[1:]; e[:, 1:] &= er[:, :-1]; e[:, :-1] &= er[:, 1:]; er = e
    mys, mxs = np.nonzero(malpha); bx0, bx1, by0, by1 = mxs.min(), mxs.max() + 1, mys.min(), mys.max() + 1
    # image width maps to the body's x extent measured above the hips (slabs live low); height to full z
    xmin, xmax = co_dense[:, 0].min(), co_dense[:, 0].max()   # Hunyuan fits the mesh to the figure's image bbox
    zmin, zmax = co_dense[:, 2].min(), co_dense[:, 2].max()
    def outside(P):
        # front camera looks along -facing; image u runs along the camera's right = (-facing) x up
        u = (P[:, 0] - xmin) / max(1e-9, xmax - xmin)
        if GAME_FACING_GLTF_Z[CHAR] < 0: u = 1.0 - u          # faces Blender +Y: camera at +Y, right = -X
        v = (zmax - P[:, 2]) / max(1e-9, zmax - zmin)
        ix = np.clip((bx0 + u * (bx1 - bx0)).astype(int), 0, mw - 1)
        iy = np.clip((by0 + v * (by1 - by0)).astype(int), 0, mh - 1)
        return ~er[iy, ix]
    drop_mask = outside(co)
    if drop_mask.any():
        bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(drop_mask)[0]], context='VERTS')
        bm.to_mesh(mesh.data); mesh.data.update(); bm.free()
        co = np.array([v.co[:] for v in mesh.data.vertices], dtype=np.float64)
    co_dense_all = co_dense.copy()
    keep_dense = ~outside(co_dense)
    remap = -np.ones(co_dense.shape[0], dtype=np.int64); remap[keep_dense] = np.arange(int(keep_dense.sum()))
    tri_ok = keep_dense[tris_dense].all(axis=1)
    tris_dense = remap[tris_dense[tri_ok]]; co_dense = co_dense[keep_dense]
    # drop fragments the carve left floating (< 1.5 % of the vertices)
    bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table()
    seen = set(); frag = []
    for v in bm.verts:
        if v.index in seen: continue
        stack = [v]; comp = []; seen.add(v.index)
        while stack:
            cur = stack.pop(); comp.append(cur)
            for e in cur.link_edges:
                ov = e.other_vert(cur)
                if ov.index not in seen: seen.add(ov.index); stack.append(ov)
        if len(comp) < 0.015 * len(bm.verts): frag.extend(comp)
    if frag: bmesh.ops.delete(bm, geom=frag, context='VERTS')
    bm.to_mesh(mesh.data); mesh.data.update(); bm.free()
    co = np.array([v.co[:] for v in mesh.data.vertices], dtype=np.float64)
    bands = {}
    for z0 in np.arange(0.0, HEIGHTS[CHAR], 0.25):
        sel = (co_dense_all[:, 2] >= z0) & (co_dense_all[:, 2] < z0 + 0.25)
        bands[f'{z0:.2f}'] = round(float((~keep_dense)[sel].mean()), 2) if sel.any() else None
    carve_report = {'verts_dropped': int(drop_mask.sum()), 'dense_dropped': int((~keep_dense).sum()), 'fragments_dropped': len(frag), 'dense_drop_frac_by_band': bands,
                    'mask_bbox': [int(bx0), int(by0), int(bx1), int(by1)], 'x_extent': [round(float(xmin), 3), round(float(xmax), 3)]}

# Fit the joint spec to this body by slicing an area-weighted surface sampling of the mesh.
# Every design stands arms-down, so per height slice: two legs, then torso (+ two arms when they
# separate from the body), then neck and head. The spec supplies parent links and the pivot offsets;
# the mesh supplies the joint heights and lateral positions.
spec_height = HEIGHTS[CHAR]
joints = {}
for name, (parent, p) in spec.items():
    joints[name] = three_to_blender(p)

rng = np.random.default_rng(7)
_verts = co_dense
_tris = []
for poly in mesh.data.polygons:  # mesh is already decimated/triangulated here; dense verts map 1:1 before decimation,
    pass
# sample on the dense (pre-decimation) surface: rebuild triangles from the pre-decimation copy
def sample_surface(verts, tris, n):
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    pick = rng.choice(len(tris), size=n, p=area / area.sum())
    r1, r2 = rng.random(n), rng.random(n)
    u = 1 - np.sqrt(r1); v = np.sqrt(r1) * (1 - r2); w = np.sqrt(r1) * r2
    return a[pick] * u[:, None] + b[pick] * v[:, None] + c[pick] * w[:, None]
CO_FIT = sample_surface(co_dense, tris_dense, 220000)
H = float(CO_FIT[:, 2].max())
CELL = 0.02
def slice_components(zc, band=0.008, min_n=60):
    sl = CO_FIT[np.abs(CO_FIT[:, 2] - zc) < band]
    if len(sl) == 0: return []
    g = np.floor(sl[:, :2] / CELL).astype(np.int64)
    cells = {}
    for key, pt in zip(map(tuple, g), sl): cells.setdefault(key, []).append(pt)
    seen = set(); comps = []
    for c in cells:
        if c in seen: continue
        stack = [c]; seen.add(c); pts = []
        while stack:
            cur = stack.pop(); pts.extend(cells[cur])
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (cur[0] + dx, cur[1] + dy)
                    if n in cells and n not in seen: seen.add(n); stack.append(n)
        P = np.array(pts)
        if len(P) >= min_n:
            comps.append({'n': len(P), 'c': P.mean(0), 'min': P.min(0), 'max': P.max(0), 'w': P[:, 0].max() - P[:, 0].min()})
    comps.sort(key=lambda c: c['c'][0])
    return comps
DZ = 0.01
zs = np.arange(0.03, H - 0.005, DZ)
info = [(z, slice_components(z)) for z in zs]
if '--dump-slices' in argv:
    for z, comps in info[::4]:
        print(f'SLICE z {z:.2f} ({len(comps)}): ' + ' | '.join(f"x{c['c'][0]:+.2f} y{c['c'][1]:+.2f} w{c['w']:.2f} n{c['n']}" for c in comps))
def width_all(comps):
    return (max(c['max'][0] for c in comps) - min(c['min'][0] for c in comps)) if comps else 0.0
def symmetric_pair(a, b):
    return a['c'][0] < -0.03 and b['c'][0] > 0.03 and abs(a['c'][0] + b['c'][0]) < 0.08

# --- legs & crotch
leg_z = []
crotch = None
for z, comps in info:
    if z > 0.62 * H: break
    if len(comps) == 2 and symmetric_pair(comps[0], comps[1]):
        leg_z.append(z)
    elif len(comps) == 1 and len(leg_z) >= 10 and z > 0.25 * H:
        crotch = z; break
if crotch is None: crotch = 0.42 * H
def comps_at(zq): return min(info, key=lambda r: abs(r[0] - zq))[1]
def leg_centres(zq):
    comps = comps_at(zq)
    if len(leg_z) >= 10 and len(comps) >= 2:
        return comps[0]['c'], comps[-1]['c']
    # fused legs (baggy trousers touching): split the lower-body block in two at its centre
    if not comps: return np.array([-0.1, 0.0]), np.array([0.1, 0.0])
    big = max(comps, key=lambda c: c['n'])
    cx = 0.5 * (big['min'][0] + big['max'][0]); q = 0.25 * (big['max'][0] - big['min'][0])
    return np.array([cx - q, big['c'][1]]), np.array([cx + q, big['c'][1]])
# ankle: narrowest leg slice between 0.06H and 0.2H
ankle_z, best = 0.12 * H, 1e9
for z, comps in info:
    if 0.06 * H <= z <= 0.2 * H and len(comps) == 2:
        w = comps[0]['w'] + comps[1]['w']
        if w < best: best, ankle_z = w, z
hipj_z = crotch + 0.10 * (H - crotch)
hips_z = three_to_blender(spec['hips'][1]).z   # keep the game's hips height: kronos.js hard-codes it per fighter
knee_z = ankle_z + 0.5 * (hipj_z - ankle_z)
for z_name, zq, scale_x in (('Leg', crotch - 0.03, 0.8), ('Knee', knee_z, 1.0), ('Ankle', ankle_z, 1.0)):
    L, R = leg_centres(zq)
    ax = (abs(L[0]) + abs(R[0])) * 0.5 * scale_x; ay = (L[1] + R[1]) * 0.5
    zz = {'Leg': hipj_z, 'Knee': knee_z, 'Ankle': ankle_z}[z_name]
    joints[f'left{z_name}'] = Vector((-ax, ay, zz)); joints[f'right{z_name}'] = Vector((ax, ay, zz))

# --- arms: outer symmetric narrow components beside the body
arm_rows = []
for z, comps in info:
    if len(comps) >= 3 and symmetric_pair(comps[0], comps[-1]) and comps[0]['w'] < 0.22 and comps[-1]['w'] < 0.22:
        arm_rows.append((z, comps[0]['c'], comps[-1]['c']))
hand_bottom = arm_rows[0][0] if arm_rows else 0.45 * H
arm_top = arm_rows[-1][0] if arm_rows else 0.6 * H
# shoulder line: where the merged width falls below 72 % of the widest merged slice above the arms
merged = [(z, width_all(c)) for z, c in info if z > arm_top and z < 0.92 * H and c]
wmax = max(w for _, w in merged) if merged else 0.5
sh_z = next((z for z, w in merged if w < 0.72 * wmax), 0.8 * H) - 0.02
sh_w = next((w for z, w in merged if abs(z - (sh_z + 0.02)) < DZ), wmax * 0.72)
sh_x = sh_w * 0.5 - 0.05
hand_z = hand_bottom + 0.07 * (H / 1.88)
hand_row = min(arm_rows, key=lambda r: abs(r[0] - (hand_bottom + 0.04))) if arm_rows else (0, np.array([-0.3, 0]), np.array([0.3, 0]))
hand_x = (abs(hand_row[1][0]) + abs(hand_row[2][0])) * 0.5; hand_y = (hand_row[1][1] + hand_row[2][1]) * 0.5
elb_z = sh_z - 0.45 * (sh_z - hand_z)
elb_row = min(arm_rows, key=lambda r: abs(r[0] - elb_z)) if arm_rows else None
if elb_row is not None and abs(elb_row[0] - elb_z) < 0.04:
    elb_x = (abs(elb_row[1][0]) + abs(elb_row[2][0])) * 0.5; elb_y = (elb_row[1][1] + elb_row[2][1]) * 0.5
else:
    elb_x = 0.5 * (sh_x + hand_x) + 0.03; elb_y = hand_y
torso_c = max(comps_at(sh_z + 0.02), key=lambda c: c['n'])['c'] if comps_at(sh_z + 0.02) else np.array([0.0, 0.0])
for side, sgn in (('left', -1), ('right', 1)):
    joints[f'{side}Shoulder'] = Vector((sgn * sh_x * 0.5, torso_c[1], sh_z))
    joints[f'{side}Arm'] = Vector((sgn * sh_x, torso_c[1], sh_z))
    joints[f'{side}Elbow'] = Vector((sgn * elb_x, elb_y, elb_z))
    joints[f'{side}Hand'] = Vector((sgn * hand_x, hand_y, hand_z))

# --- torso column, neck, head
def centre_at(zq):
    comps = comps_at(zq)
    return max(comps, key=lambda c: c['n'])['c'] if comps else np.array([0.0, 0.0])
tc = centre_at(hips_z)
# recentre the body in depth so the hips pivot sits at y = 0 (game code zeroes hips x/z on knockback)
depth_shift = -float(tc[1])
co[:, 1] += depth_shift; co_dense[:, 1] += depth_shift; CO_FIT[:, 1] += depth_shift
for v, c in zip(mesh.data.vertices, co): v.co = Vector(c)
mesh.data.update()
for k in list(joints.keys()):
    if k not in ('hips', 'spine', 'torso', 'neck', 'head'): joints[k].y += depth_shift
nc_shift = depth_shift
joints['hips'] = Vector((0.0, 0.0, hips_z))
joints['spine'] = Vector((0.0, 0.0, hips_z + 0.02))
joints['torso'] = Vector((0.0, 0.0, hips_z + 0.04))
neck_z, best = sh_z + 0.1, 1e9
for z, comps in info:
    if sh_z + 0.03 <= z <= 0.93 * H and comps:
        w = width_all(comps)
        if w < best: best, neck_z = w, z
nc = centre_at(neck_z)
joints['neck'] = Vector((0.0, nc[1], neck_z))
joints['head'] = Vector((0.0, nc[1], neck_z + 0.4 * (H - neck_z)))
autofit_depth_shift = depth_shift
autofit = {'H': H, 'depth_shift': depth_shift, 'crotch': crotch, 'ankle_z': ankle_z, 'knee_z': knee_z, 'hipj_z': hipj_z, 'hips_z': hips_z,
           'hand_bottom': hand_bottom, 'arm_top': arm_top, 'shoulder_z': sh_z, 'shoulder_w': sh_w, 'neck_z': neck_z,
           'arm_rows': len(arm_rows), 'leg_slices': len(leg_z),
           'joints': {k: [round(v.x, 3), round(v.y, 3), round(v.z, 3)] for k, v in joints.items()}}

# ---------------------------------------------------------------------------------------------
# Armature with identity rest: every bone's tail points +Z_blender (= +Y glTF) with roll 0.
arm_data = bpy.data.armatures.new(f'{CHAR}_skeleton')
arm_obj = bpy.data.objects.new(f'{CHAR}_rig', arm_data)
bpy.context.scene.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
order = list(spec.keys())
for name in order:
    parent, _ = spec[name]
    eb = arm_data.edit_bones.new(name)
    head = joints[name]
    eb.head = head
    eb.tail = head + Vector((0.0, 0.0, 0.08))
    eb.roll = 0.0
    if parent:
        eb.parent = ebs[parent]
        eb.use_connect = False
    ebs[name] = eb
bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------------------------------------
# Skin weights: nearest bone segments (head -> children heads / along +Z for leaf bones),
# smooth 2-bone blend by inverse squared distance. Deterministic and robust on generated meshes.
children = {n: [c for c in order if spec[c][0] == n] for n in order}
segments = []
for n in order:
    h = np.array(joints[n][:])
    kids = children[n]
    if kids:
        for c in kids:
            if c in ('spine', 'leftShoulder', 'rightShoulder') and n in ('hips', 'torso'):
                continue  # these pivots are covered by their own short segments below
            segments.append((n, h, np.array(joints[c][:])))
    # leaf / stub segments so hands, head, ankles and tiny pivots carry weight
    stub = {'head': 0.26, 'leftHand': 0.12, 'rightHand': 0.12, 'leftAnkle': -0.10, 'rightAnkle': -0.10,
            'spine': 0.0, 'neck': 0.0, 'leftShoulder': 0.0, 'rightShoulder': 0.0}
    if n in stub:
        if stub[n] != 0.0:
            segments.append((n, h, h + np.array([0.0, 0.0, stub[n]])))
# feet extend forward: give ankles a forward stub too
fwd = np.array([0.0, -GAME_FACING_GLTF_Z[CHAR] * 1.0, 0.0])
for n in ('leftAnkle', 'rightAnkle'):
    h = np.array(joints[n][:]); segments.append((n, h, h + fwd * 0.16))

def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / max(1e-9, ab @ ab), 0.0, 1.0)
    proj = a + t[:, None] * ab
    return np.linalg.norm(P - proj, axis=1)

bone_names = [n for n in order]
bone_of_seg = [s[0] for s in segments]
def compute_weights(P, k=2, restrict=False):
    D = np.stack([seg_dist(P, a, b) for (_, a, b) in segments], axis=1)   # (V, S)
    Db = np.full((P.shape[0], len(bone_names)), np.inf)
    for si, bn in enumerate(bone_of_seg):
        bi = bone_names.index(bn)
        Db[:, bi] = np.minimum(Db[:, bi], D[:, si])
    # rotation pivots (spine/neck/shoulders) carry no skin: their clips barely move them, and any weight
    # there anchors deltoid/neck vertices while the arm or head swings away (stretched sleeves).
    for pivot in ('spine', 'neck', 'leftShoulder', 'rightShoulder'):
        Db[:, bone_names.index(pivot)] = np.inf
    idx = np.argsort(Db, axis=1)[:, :k]
    d = np.take_along_axis(Db, idx, axis=1)
    w = 1.0 / (d ** 2 + 1e-4)
    ratio = d[:, 1] / np.maximum(d[:, 0], 1e-6)
    w[:, 1] *= np.clip(1.6 - ratio, 0.0, 1.0)
    if restrict:
        # a vertex may blend across limb groups only where limbs really join: arm<->core near the
        # shoulder, leg<->core near the hips. Elsewhere (hand beside thigh, thigh beside thigh) the
        # second influence is dropped so touching surfaces separate cleanly.
        g0 = np.array([LIMB_GROUP[bone_names[i]] for i in idx[:, 0]])
        g1 = np.array([LIMB_GROUP[bone_names[i]] for i in idx[:, 1]])
        z = P[:, 2]
        both_arm_core = ((np.char.startswith(g0, 'arm') & (g1 == 'core')) | (np.char.startswith(g1, 'arm') & (g0 == 'core')))
        both_leg_core = ((np.char.startswith(g0, 'leg') & (g1 == 'core')) | (np.char.startswith(g1, 'leg') & (g0 == 'core')))
        allowed = (g0 == g1) | (both_arm_core & (z >= sh_cut_z)) | (both_leg_core & (z >= crotch_cut_z - 0.03))
        w[:, 1] *= allowed
    w /= w.sum(axis=1, keepdims=True)
    return idx, w

# ---------------------------------------------------------------------------------------------
# Cut limb bridges. The generator reconstructs one closed volume, so hands fuse to thighs and the
# inner thighs to each other; faces spanning two limbs would stretch into streaks the moment a
# clip lifts an arm. Delete those faces, cap the small holes, drop loose vertices.
LIMB_GROUP = {}
for n in ('leftShoulder', 'leftArm', 'leftElbow', 'leftHand'): LIMB_GROUP[n] = 'armL'
for n in ('rightShoulder', 'rightArm', 'rightElbow', 'rightHand'): LIMB_GROUP[n] = 'armR'
for n in ('leftLeg', 'leftKnee', 'leftAnkle'): LIMB_GROUP[n] = 'legL'
for n in ('rightLeg', 'rightKnee', 'rightAnkle'): LIMB_GROUP[n] = 'legR'
for n in ('hips', 'spine', 'torso', 'neck', 'head'): LIMB_GROUP[n] = 'core'
idx0, w0 = compute_weights(co)
dominant = np.array([LIMB_GROUP[bone_names[idx0[i, int(np.argmax(w0[i]))]]] for i in range(co.shape[0])])
sh_cut_z = joints['leftArm'].z - 0.15
crotch_cut_z = (autofit['crotch'] if 'crotch' in autofit else joints['leftLeg'].z - 0.1) - 0.02
bm = bmesh.new(); bm.from_mesh(mesh.data); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
bridge_faces = []
for f in bm.faces:
    groups = {dominant[v.index] for v in f.verts}
    if len(groups) < 2: continue
    zmax = max(v.co.z for v in f.verts)
    arms = {g for g in groups if g.startswith('arm')}; legs = {g for g in groups if g.startswith('leg')}
    is_bridge = False
    if len(arms) == 2 or (arms and legs): is_bridge = True
    elif arms and 'core' in groups and zmax < sh_cut_z: is_bridge = True
    elif len(legs) == 2 and zmax < crotch_cut_z: is_bridge = True
    if is_bridge: bridge_faces.append(f)
n_bridge = len(bridge_faces)
if bridge_faces:
    bmesh.ops.delete(bm, geom=bridge_faces, context='FACES_ONLY')
    boundary = [e for e in bm.edges if e.is_boundary]
    # cap holes per limb side: fill, then triangulate the caps
    res = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
    if res.get('faces'):
        bmesh.ops.triangulate(bm, faces=res['faces'])
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(mesh.data); mesh.data.update()
bm.free()
co = np.array([v.co[:] for v in mesh.data.vertices], dtype=np.float64)
faces_after = len(mesh.data.polygons)
bridge_report = {'bridge_faces_cut': n_bridge, 'faces_after_cut': faces_after, 'verts_after_cut': int(co.shape[0])}

idx, w = compute_weights(co, restrict=True)
k = 2
for bn in bone_names:
    mesh.vertex_groups.new(name=bn)
for vi in range(co.shape[0]):
    for j in range(k):
        if w[vi, j] > 1e-3:
            mesh.vertex_groups[bone_names[idx[vi, j]]].add([vi], float(w[vi, j]), 'REPLACE')

for poly in mesh.data.polygons: poly.use_smooth = True   # shared vertices + smooth normals on export
mesh.parent = arm_obj
mod = mesh.modifiers.new('Armature', 'ARMATURE')
mod.object = arm_obj

# ---------------------------------------------------------------------------------------------
# Textures: keep base colour only, shrink to TEX_SIZE; the game applies its toon shading on top.
for mat in mesh.data.materials:
    if not mat or not mat.use_nodes: continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    for inp_name in ('Metallic', 'Roughness', 'Normal', 'Emission Color', 'Specular IOR Level'):
        inp = bsdf.inputs.get(inp_name)
        if inp and inp.is_linked:
            for l in list(inp.links): nt.links.remove(l)
    if bsdf.inputs.get('Metallic'): bsdf.inputs['Metallic'].default_value = 0.0
    if bsdf.inputs.get('Roughness'): bsdf.inputs['Roughness'].default_value = 0.85
for img in bpy.data.images:
    if img.size[0] > TEX_SIZE or img.size[1] > TEX_SIZE:
        img.scale(TEX_SIZE, TEX_SIZE)
# remove images no longer referenced
used = set()
for mat in mesh.data.materials:
    if mat and mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and any(o.is_linked for o in n.outputs): used.add(n.image.name)
for img in list(bpy.data.images):
    if img.name not in used: bpy.data.images.remove(img)

# ---------------------------------------------------------------------------------------------
for o in bpy.context.scene.objects: o.select_set(o in (mesh, arm_obj))
bpy.context.view_layer.objects.active = arm_obj
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True,
                          export_animations=False, export_skins=True, export_apply=True,
                          export_image_format='JPEG' if '--jpeg' in argv else 'AUTO',
                          export_texcoords=True, export_normals=True, export_materials='EXPORT')
report = {
  'char': CHAR, 'faces_before': faces_before, 'faces_after': faces_after, 'verts': int(co.shape[0]),
  'height_in': float(height), 'scale': float(scale), 'front_xy_detected': [float(x) for x in front_xy],
  'rotated_deg': float(math.degrees(ang)), 'arm_x': float(joints['leftArm'].x), 'autofit': autofit,
  'glb_bytes': os.path.getsize(OUT_GLB), 'components': components_report, 'bridges': bridge_report, 'carve': carve_report, 'trim': trim_report, 'images': [(i.name, list(i.size)) for i in bpy.data.images]
}
print('FIT_REPORT ' + json.dumps(report))
