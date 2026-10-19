"""mirror_patch.py <in.png> <out.png> src_cx src_cy dst_cx dst_cy r — copies a disc from the source spot,
mirrored horizontally, onto the destination (e.g. the free fist over the hand that holds a prop)."""
import bpy, sys, numpy as np
argv = sys.argv[sys.argv.index('--')+1:]
src, out, sx, sy, dx, dy, r = argv[0], argv[1], *map(int, argv[2:7])
img = bpy.data.images.load(src); w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1].copy()
patch = px[sy-r:sy+r, sx-r:sx+r].copy()[:, ::-1]
yy, xx = np.mgrid[-r:r, -r:r]; disc = (xx**2 + yy**2) <= r*r
dst = px[dy-r:dy+r, dx-r:dx+r]
dst[disc] = patch[disc]
px[dy-r:dy+r, dx-r:dx+r] = dst
o = bpy.data.images.new('o', w, h, alpha=True); o.pixels = px[::-1].ravel().tolist(); o.alpha_mode = 'STRAIGHT'; o.file_format = 'PNG'; o.filepath_raw = out; o.save()
print('PATCHED', out)
