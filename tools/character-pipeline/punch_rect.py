"""punch_rect.py <in.png> <out.png> x0 y0 x1 y1 — makes a rectangle transparent (opens a gap the generator must respect)"""
import bpy, sys, numpy as np
argv = sys.argv[sys.argv.index('--')+1:]
src, out, x0, y0, x1, y1 = argv[0], argv[1], *map(int, argv[2:6])
img = bpy.data.images.load(src); w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
px[y0:y1, x0:x1, 3] = 0.0; px[y0:y1, x0:x1, :3] = 1.0
o = bpy.data.images.new('o', w, h, alpha=True); o.pixels = px[::-1].ravel().tolist(); o.alpha_mode = 'STRAIGHT'; o.file_format = 'PNG'; o.filepath_raw = out; o.save()
print('RECT', out, (x1-x0)*(y1-y0))
