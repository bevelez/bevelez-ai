import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--')+1:]
IN, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
arm = next((o for o in bpy.context.scene.objects if o.type == 'ARMATURE'), None)
mesh = next((o for o in bpy.context.scene.objects if o.type == 'MESH'), None)
# joint markers
mat = bpy.data.materials.new('joint'); mat.diffuse_color = (1.0, 0.1, 0.1, 1.0)
if arm:
    for b in arm.data.bones:
        p = arm.matrix_world @ b.head_local
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, location=p, segments=8, ring_count=6)
        s = bpy.context.active_object; s.data.materials.append(mat)
        if b.parent:
            q = arm.matrix_world @ b.parent.head_local
            mid = (p + q) * 0.5; d = p - q
            if d.length > 1e-4:
                bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=d.length, location=mid, vertices=6)
                c = bpy.context.active_object; c.rotation_mode = 'QUATERNION'; c.rotation_quaternion = d.to_track_quat('Z', 'Y'); c.data.materials.append(mat)
# grey body material if none
if mesh and not mesh.data.materials:
    m = bpy.data.materials.new('body'); m.diffuse_color = (0.75, 0.75, 0.78, 1.0); mesh.data.materials.append(m)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL' if mesh.data.materials and mesh.data.materials[0].node_tree is None else 'TEXTURE'
scene.display.shading.show_object_outline = True
if "--xray" in argv:
    scene.display.shading.show_xray = True; scene.display.shading.xray_alpha = 0.3
scene.render.resolution_x = 700; scene.render.resolution_y = 1000
scene.render.film_transparent = False
world = bpy.data.worlds.new('w'); scene.world = world; world.color = (0.12, 0.13, 0.18)
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2.3
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
FACING = argv[2] if len(argv) > 2 else "+y"
fy = 1 if FACING == "+y" else -1
views = {"front": (0, 6*fy, 1.0, math.radians(90), 0, math.radians(180 if fy > 0 else 0)), "side": (6, 0, 1.0, math.radians(90), 0, math.radians(90)), "back": (0, -6*fy, 1.0, math.radians(90), 0, math.radians(0 if fy > 0 else 180))}
os.makedirs(OUT, exist_ok=True)
for name, (x, y, z, rx, ry, rz) in views.items():
    cam.location = (x, y, z); cam.rotation_euler = (rx, ry, rz)
    scene.render.filepath = os.path.join(OUT, f'{os.path.splitext(os.path.basename(IN))[0]}_{name}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)
