import bpy, sys, os, math
argv = sys.argv[sys.argv.index('--')+1:]
IN, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
print('mesh modifiers', [(m.type, getattr(m, 'object', None) and m.object.name) for m in mesh.modifiers], 'parent', mesh.parent and mesh.parent.name, 'vgroups', len(mesh.vertex_groups))
poses = {'leftKnee': (0.88, 0.47, 0, 0), 'leftLeg': (0.97, -0.24, 0, 0), 'leftArm': (0.903, 0.351, -0.068, -0.239), 'leftElbow': (0.773, 0.634, 0, 0), 'rightArm': (0.907, 0.361, -0.007, 0.217), 'rightElbow': (0.789, 0.615, 0, 0), 'torso': (0.993, 0.038, -0.11, -0.019)}
for name, q in poses.items():
    pb = arm.pose.bones.get(name)
    if pb is None: print('missing bone', name); continue
    pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = q
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'; scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x = 700; scene.render.resolution_y = 1000
world = bpy.data.worlds.new('w'); scene.world = world; world.color = (0.12, 0.13, 0.18)
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2.3
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (0, 6, 1.0); cam.rotation_euler = (math.radians(90), 0, math.radians(180))
scene.render.filepath = OUT; bpy.ops.render.render(write_still=True); print('rendered', OUT)
