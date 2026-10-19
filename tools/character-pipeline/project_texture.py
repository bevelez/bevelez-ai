"""
project_texture.py — Blender 4.3 headless. Paints a generated character mesh with the design
turnaround images by orthographic projection (front / back / side, side mirrored for the other
flank), with per-texel occlusion tests, then exports a skinned GLB with a single base-colour texture.

  Blender -b --python project_texture.py -- <skinned.glb> <out.glb> --front f.png --back b.png --side s.png
         [--side-shows right|left] [--facing +y|-y] [--tex 1024] [--png-out texture.png]
"""
import bpy, bmesh, sys, os, math, json, time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
IN_GLB, OUT_GLB = argv[0], argv[1]
def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
TEX = int(opt('--tex', '2048'))
FACING = 1.0 if opt('--facing', '+y') == '+y' else -1.0
SIDE_SHOWS = opt('--side-shows', 'right')
PNG_OUT = opt('--png-out', os.path.splitext(OUT_GLB)[0] + '_basecolor.png')
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN_GLB, merge_vertices=True)
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
for poly in mesh.data.polygons: poly.use_smooth = True
arm = next((o for o in bpy.context.scene.objects if o.type == 'ARMATURE'), None)
bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active = mesh
M = mesh.matrix_world.copy()

# ---- UV unwrap
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, scale_to_bounds=False)
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(margin_method='FRACTION', margin=0.001, rotate=True, shape_method='CONCAVE')
bpy.ops.object.mode_set(mode='OBJECT')
me = mesh.data
me.calc_loop_triangles()
uv_layer = me.uv_layers.active.data
V = np.array([(M @ v.co)[:] for v in me.vertices], dtype=np.float64)
tris = np.array([lt.vertices[:] for lt in me.loop_triangles], dtype=np.int64)
loops = np.array([lt.loops[:] for lt in me.loop_triangles], dtype=np.int64)
UV = np.array([uv_layer[i].uv[:] for i in range(len(uv_layer))], dtype=np.float64)
TUV = UV[loops]                                  # (T, 3, 2)
# smooth vertex normals
VN = np.array([vn.vector[:] for vn in me.vertex_normals], dtype=np.float64)
N3 = np.array(M.to_3x3()); VN = VN @ N3.T
VN /= np.maximum(np.linalg.norm(VN, axis=1, keepdims=True), 1e-9)
print(f'[{time.time()-t0:.0f}s] unwrapped: {len(tris)} tris, {len(V)} verts', flush=True)

# ---- rasterise UV triangles -> per-texel world position & normal
P = np.full((TEX, TEX, 3), np.nan); Nrm = np.zeros((TEX, TEX, 3)); filled = np.zeros((TEX, TEX), bool)
px = TUV * TEX
for t in range(len(tris)):
    a, b, c = px[t]
    x0, x1 = int(max(0, np.floor(min(a[0], b[0], c[0])) - 1)), int(min(TEX - 1, np.ceil(max(a[0], b[0], c[0])) + 1))
    y0, y1 = int(max(0, np.floor(min(a[1], b[1], c[1])) - 1)), int(min(TEX - 1, np.ceil(max(a[1], b[1], c[1])) + 1))
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(det) < 1e-12: continue
    l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
    l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
    l2 = 1 - l0 - l1
    eps = -0.75 / max(1.0, math.sqrt(abs(det)))     # ~1 texel of overdraw so islands have no cracks
    inside = (l0 >= eps) & (l1 >= eps) & (l2 >= eps)
    if not inside.any(): continue
    vi = tris[t]
    pos = l0[..., None] * V[vi[0]] + l1[..., None] * V[vi[1]] + l2[..., None] * V[vi[2]]
    nrm = l0[..., None] * VN[vi[0]] + l1[..., None] * VN[vi[1]] + l2[..., None] * VN[vi[2]]
    sub = (slice(y0, y1 + 1), slice(x0, x1 + 1))
    write = inside & ~filled[sub]
    P[sub][write] = pos[write]; Nrm[sub][write] = nrm[write]; filled[sub] |= inside
Nrm /= np.maximum(np.linalg.norm(Nrm, axis=2, keepdims=True), 1e-9)
print(f'[{time.time()-t0:.0f}s] rasterised {int(filled.sum())} texels', flush=True)

# ---- views
def load_rgba(path, flip_h=False):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]     # top row first
    if flip_h: a = a[:, ::-1]
    alpha = a[..., 3] > 0.5
    ys, xs = np.nonzero(alpha)
    bbox = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return a, bbox
up = np.array([0.0, 0.0, 1.0])
char_right = np.array([FACING, 0.0, 0.0])
views = []
def add_view(name, d, path, flip_h=False):
    if not path or not os.path.exists(path): return
    img, bbox = load_rgba(path, flip_h)
    right = np.cross(-np.array(d), up)
    views.append({'name': name, 'd': np.array(d, dtype=np.float64), 'right': right, 'img': img, 'bbox': bbox})
    print('view', name, 'd', d, 'right', right.round(2).tolist(), 'bbox', [int(b) for b in bbox], flush=True)
add_view('front', (0.0, FACING, 0.0), opt('--front'))
add_view('back', (0.0, -FACING, 0.0), opt('--back'))
side = opt('--side')
if side:
    # The art shows one flank with the character's front toward image-right. Assume left/right flank
    # symmetry: for each side camera, orient the image so the front lands on the correct image side.
    fwd = np.array([0.0, FACING, 0.0])
    for name, d in (('side_right', char_right), ('side_left', -char_right)):
        right = np.cross(-d, up)
        add_view(name, tuple(d.tolist()), side, flip_h=(fwd @ right) < 0)

# mesh extents for the projection mapping
zmin, zmax = V[:, 2].min(), V[:, 2].max()
bvh = BVHTree.FromPolygons([tuple(p) for p in V], [tuple(t) for t in tris])
ys_t, xs_t = np.nonzero(filled)
Pf = P[ys_t, xs_t]; Nf = Nrm[ys_t, xs_t]
col = np.zeros((len(Pf), 3)); wsum = np.zeros(len(Pf))
for v in views:
    d = v['d']; cosang = Nf @ d
    cand = np.nonzero(cosang > (0.55 if v['name'].startswith('side') else 0.08))[0]
    s = V @ v['right']; smin, smax = s.min(), s.max()
    img, (bx0, by0, bx1, by1) = v['img'], v['bbox']
    vis = np.zeros(len(cand), bool)
    dvec = Vector(d.tolist())
    for k, i in enumerate(cand):
        origin = Vector((Pf[i] + Nf[i] * 0.004 + d * 0.004).tolist())
        hit = bvh.ray_cast(origin, dvec, 5.0)
        vis[k] = hit[0] is None
    idx = cand[vis]
    u = (Pf[idx] @ v['right'] - smin) / max(1e-9, smax - smin)
    vv = (zmax - Pf[idx][:, 2]) / max(1e-9, zmax - zmin)
    ix = np.clip((bx0 + u * (bx1 - bx0)).astype(int), 0, img.shape[1] - 1)
    iy = np.clip((by0 + vv * (by1 - by0)).astype(int), 0, img.shape[0] - 1)
    samp = img[iy, ix]
    ok = samp[:, 3] > 0.5
    # front/back carry the drawing; side views only where a surface really faces sideways, so the
    # three never blend at grazing angles on the arms (that blend read as seams)
    cz = np.clip(cosang[idx], 0, 1)
    if v['name'].startswith('side'):
        w = np.where(cz > 0.55, (cz - 0.55) / 0.45, 0.0) ** 2 * ok
    else:
        w = cz ** 4 * ok
    col[idx] += samp[:, :3] * w[:, None]; wsum[idx] += w
    print(f"[{time.time()-t0:.0f}s] view {v['name']}: candidates {len(cand)} visible {int(vis.sum())} painted {int(ok.sum())}", flush=True)
have = wsum > 1e-6
col[have] /= wsum[have][:, None]
tex = np.zeros((TEX, TEX, 3)); known = np.zeros((TEX, TEX), bool)
tex[ys_t[have], xs_t[have]] = col[have]; known[ys_t[have], xs_t[have]] = True
print(f'[{time.time()-t0:.0f}s] painted {int(have.sum())} / {len(Pf)} texels; inpainting the rest', flush=True)
# 3-D fill for texels no view reached (backs without a back view, undersides, occluded folds):
# voxelise the painted texels' colours in world space, dilate the voxel colours through empty
# cells, then give every unpainted texel its voxel's colour. Colours therefore flow around the
# body (vest side -> vest back) instead of across unrelated UV islands.
VOX = 0.012
pmin = Pf.min(axis=0) - 2 * VOX; dims = np.ceil((Pf.max(axis=0) + 2 * VOX - pmin) / VOX).astype(int) + 2
def vox_index(Q): return np.clip(((Q - pmin) / VOX).astype(int), 0, dims - 1)
vall = vox_index(Pf)
surface = np.zeros(dims, bool); surface[vall[:, 0], vall[:, 1], vall[:, 2]] = True
# a 1-voxel shell around the surface so colour can hop across small gaps but not through the body
shell = surface.copy()
for ax in range(3):
    for sh in (-1, 1): shell |= np.roll(surface, sh, axis=ax)
vi = vall[have]
acc = np.zeros((*dims, 3)); cnt = np.zeros(dims)
np.add.at(acc, (vi[:, 0], vi[:, 1], vi[:, 2]), col[have]); np.add.at(cnt, (vi[:, 0], vi[:, 1], vi[:, 2]), 1.0)
vcol = np.zeros_like(acc); vfill = cnt > 0; vcol[vfill] = acc[vfill] / cnt[vfill][..., None]
need = vall[~have]
for it in range(200):
    if vfill[need[:, 0], need[:, 1], need[:, 2]].all(): break
    a = np.zeros_like(vcol); c = np.zeros(dims)
    for ax in range(3):
        for sh in (-1, 1):
            a += np.roll(vcol, sh, axis=ax) * np.roll(vfill, sh, axis=ax)[..., None]; c += np.roll(vfill, sh, axis=ax)
    f = ~vfill & shell & (c > 0); vcol[f] = a[f] / c[f][..., None]; vfill |= f
    if not f.any(): break
# trilinear sample of the voxel colours (unfilled neighbours are skipped) for every unpainted texel
Q = (Pf[~have] - pmin) / VOX - 0.5
q0 = np.floor(Q).astype(int); fr = Q - q0
samp = np.zeros((len(Q), 3)); wsum2 = np.zeros(len(Q))
for dx in (0, 1):
    for dy in (0, 1):
        for dz in (0, 1):
            ix = np.clip(q0[:, 0] + dx, 0, dims[0] - 1); iy = np.clip(q0[:, 1] + dy, 0, dims[1] - 1); iz = np.clip(q0[:, 2] + dz, 0, dims[2] - 1)
            w8 = (fr[:, 0] if dx else 1 - fr[:, 0]) * (fr[:, 1] if dy else 1 - fr[:, 1]) * (fr[:, 2] if dz else 1 - fr[:, 2]) * vfill[ix, iy, iz]
            samp += vcol[ix, iy, iz] * w8[:, None]; wsum2 += w8
okf = wsum2 > 1e-6
fillcol = np.zeros((len(Q), 3)); fillcol[okf] = samp[okf] / wsum2[okf][:, None]
fillcol[~okf] = vcol[need[~okf, 0], need[~okf, 1], need[~okf, 2]]
col[~have] = fillcol
tex = np.zeros((TEX, TEX, 3)); known = np.zeros((TEX, TEX), bool)
tex[ys_t, xs_t] = col; known[ys_t, xs_t] = True
print(f'[{time.time()-t0:.0f}s] 3-D fill done ({int((~have).sum())} texels)', flush=True)
# pad island borders by 6 px so bilinear/mip sampling never pulls in the void
for it in range(6):
    todo = ~known
    acc2 = np.zeros_like(tex); cnt2 = np.zeros((TEX, TEX))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0: continue
            sh = np.roll(np.roll(tex, dy, 0), dx, 1); shk = np.roll(np.roll(known, dy, 0), dx, 1)
            acc2 += sh * shk[..., None]; cnt2 += shk
    fillable = todo & (cnt2 > 0)
    tex[fillable] = acc2[fillable] / cnt2[fillable][..., None]
    known |= fillable
# write texture (Blender pixels: bottom row first)
out = bpy.data.images.new('basecolor', TEX, TEX, alpha=False)
rgba = np.concatenate([tex, np.ones((TEX, TEX, 1))], axis=2).astype(np.float32)  # row 0 == v 0 == Blender bottom row
out.pixels = rgba.ravel().tolist()
out.file_format = 'PNG'; out.filepath_raw = PNG_OUT; out.save()
# material
mat = bpy.data.materials.new('toon_base'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
texn = nt.nodes.new('ShaderNodeTexImage'); texn.image = bpy.data.images.load(PNG_OUT)
nt.links.new(texn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.9; bsdf.inputs['Metallic'].default_value = 0.0
me.materials.clear(); me.materials.append(mat)
# export
for o in bpy.context.scene.objects: o.select_set(o in (mesh, arm))
bpy.context.view_layer.objects.active = arm or mesh
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_yup=True,
                          export_animations=False, export_skins=True, export_apply=False,
                          export_image_format=('JPEG' if '--png' not in argv else 'AUTO'), export_jpeg_quality=82, export_texcoords=True, export_normals=True, export_materials='EXPORT')
print('TEXTURE_REPORT ' + json.dumps({'texels': int(filled.sum()), 'painted': int(have.sum()), 'glb_bytes': os.path.getsize(OUT_GLB), 'png': PNG_OUT, 'seconds': round(time.time() - t0, 1)}))
