"""punch_hole.py <in.png> <out.png> cx cy r  — makes a disc transparent (removes an accessory seen head-on)"""
import bpy, sys, numpy as np
argv = sys.argv[sys.argv.index('--')+1:]
src, out, cx, cy, r = argv[0], argv[1], int(argv[2]), int(argv[3]), int(argv[4])
img = bpy.data.images.load(src); w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
yy, xx = np.mgrid[0:h, 0:w]
m = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
px[m, 3] = 0.0; px[m, :3] = 1.0
o = bpy.data.images.new('o', w, h, alpha=True); o.pixels = px[::-1].ravel().tolist(); o.alpha_mode = 'STRAIGHT'; o.file_format = 'PNG'; o.filepath_raw = out; o.save()
print('HOLE', out, int(m.sum()))
