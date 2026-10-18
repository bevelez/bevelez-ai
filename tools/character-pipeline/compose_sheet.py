"""Blender-python image strip composer: compose_sheet.py <out.png> <height> <img1> <img2> ..."""
import bpy, sys, numpy as np
argv = sys.argv[sys.argv.index('--')+1:]
out, H = argv[0], int(argv[1])
panels = []
for p in argv[2:]:
    img = bpy.data.images.load(p); w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    # composite over dark grey for transparent inputs
    a = px[..., 3:4]; rgb = px[..., :3] * a + np.array([0.16, 0.17, 0.21]) * (1 - a)
    # nearest-neighbour resize to height H
    nw = max(1, int(round(w * H / h)))
    ys = (np.arange(H) * h / H).astype(int); xs = (np.arange(nw) * w / nw).astype(int)
    panels.append(rgb[ys][:, xs])
    panels.append(np.ones((H, 6, 3), dtype=np.float32) * 0.05)
sheet = np.concatenate(panels[:-1], axis=1)
o = bpy.data.images.new('sheet', sheet.shape[1], H, alpha=False)
o.pixels = np.concatenate([sheet[::-1], np.ones((H, sheet.shape[1], 1), dtype=np.float32)], axis=2).ravel().tolist()
o.file_format = 'PNG'; o.filepath_raw = out; o.save(); print('SHEET', out, sheet.shape)
