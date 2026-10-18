"""Blender-python background keyer for the design crops: flood-fill from the border on the
uniform studio colour, keep the largest foreground component, write RGBA PNGs."""
import bpy, sys, os, numpy as np
argv = sys.argv[sys.argv.index('--')+1:]
indir, outdir = argv[0], argv[1]
TOL = float(argv[2]) if len(argv) > 2 else 48.0
os.makedirs(outdir, exist_ok=True)

def grow(seed, allowed):
    cur = seed & allowed
    while True:
        nxt = cur.copy()
        nxt[1:] |= cur[:-1]; nxt[:-1] |= cur[1:]; nxt[:, 1:] |= cur[:, :-1]; nxt[:, :-1] |= cur[:, 1:]
        nxt &= allowed
        if np.array_equal(nxt, cur): return cur
        cur = nxt

def largest_component(mask):
    # label by repeated seeded growth from the first unvisited pixel; keep biggest
    remaining = mask.copy(); best = None
    while remaining.any():
        ys, xs = np.nonzero(remaining)
        seed = np.zeros_like(mask); seed[ys[0], xs[0]] = True
        comp = grow(seed, remaining)
        if best is None or comp.sum() > best.sum(): best = comp
        remaining &= ~comp
        if remaining.sum() < 0.002 * mask.size: break   # ignore specks
    return best

for fn in sorted(os.listdir(indir)):
    if not fn.endswith('.png'): continue
    img = bpy.data.images.load(os.path.join(indir, fn))
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = px[..., :3] * 255.0
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.linalg.norm(rgb - bg, axis=2)
    # the line art outline is pure black; the key tolerance stays safely below the outline's distance
    tol = TOL
    allowed = dist < tol
    seed = np.zeros((h, w), dtype=bool); seed[0] = seed[-1] = True; seed[:, 0] = seed[:, -1] = True
    background = grow(seed, allowed)
    fg = ~background
    # morphological opening (radius 2) strips the thin studio grid lines that cross behind the figure
    def erode(m):
        out = m.copy()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            out &= np.roll(np.roll(m, dy, 0), dx, 1)
        return out
    def dilate(m):
        out = m.copy()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            out |= np.roll(np.roll(m, dy, 0), dx, 1)
        return out
    opened = dilate(dilate(erode(erode(fg))))
    fg = largest_component(opened & fg)
    background = ~fg
    # soft edge: half-alpha on the 1px foreground ring that touches the background (geometric, not colour-based,
    # because the dark costume is close to the studio colour)
    alpha = fg.astype(np.float32)
    bgd = background.copy()
    ring = np.zeros_like(fg)
    ring[1:] |= bgd[:-1]; ring[:-1] |= bgd[1:]; ring[:, 1:] |= bgd[:, :-1]; ring[:, :-1] |= bgd[:, 1:]
    alpha[fg & ring] = 0.55
    px[..., 3] = alpha
    # premultiply-ish: push keyed pixels to neutral grey so no dark halo bakes into the texture
    px[alpha < 0.01, :3] = 0.5
    out = bpy.data.images.new(fn, w, h, alpha=True)
    out.pixels = px.ravel().tolist()
    out.file_format = 'PNG'; out.alpha_mode = 'STRAIGHT'
    out.filepath_raw = os.path.join(outdir, fn)
    out.save()
    ys, xs = np.nonzero(fg)
    print('KEYED', fn, 'bg', bg.round(0).tolist(), 'tol', round(tol, 1), 'fg_px', int(fg.sum()), 'bbox', [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())], 'img', w, h)
