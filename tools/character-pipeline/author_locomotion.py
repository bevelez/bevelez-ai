"""author_locomotion.py — Blender 4.3 headless. Authors looping walk / run cycles on the 19-bone
DJ KRONOS clip skeleton (identity rest, bone names = clip joint names) and exports an animation-only
GLB. Rotation-only tracks (no hips translation) so every fighter can play them.
  Blender -b --python author_locomotion.py -- <out.glb> [--leg-sign -1|1] [--elbow-sign -1|1]
"""
import bpy, sys, math
from mathutils import Vector, Quaternion, Euler
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
def opt(n, d): return argv[argv.index(n) + 1] if n in argv else d
LEG = float(opt('--leg-sign', '1'))      # +X rotation swings a leg forward for a -Z-facing (glTF) character; +Z-facing fighters get the clip mirrored at load
ELB = float(opt('--elbow-sign', '1'))    # +X rotation brings the hand forward for a -Z-facing character
FPS = 30
SPEC = {
  'hips': (None, (0.0, 1.07, 0.0)), 'spine': ('hips', (0.0, 1.09, 0.0)), 'torso': ('spine', (0.0, 1.11, 0.0)),
  'neck': ('torso', (0.0, 1.60, 0.002)), 'head': ('neck', (0.0, 1.76, 0.0)),
  'leftShoulder': ('torso', (-0.12, 1.54, 0.005)), 'leftArm': ('leftShoulder', (-0.215, 1.54, 0.005)),
  'leftElbow': ('leftArm', (-0.215, 1.28, 0.005)), 'leftHand': ('leftElbow', (-0.215, 1.005, 0.005)),
  'rightShoulder': ('torso', (0.12, 1.54, 0.005)), 'rightArm': ('rightShoulder', (0.215, 1.54, 0.005)),
  'rightElbow': ('rightArm', (0.215, 1.28, 0.005)), 'rightHand': ('rightElbow', (0.215, 1.005, 0.005)),
  'leftLeg': ('hips', (-0.105, 1.02, 0.0)), 'leftKnee': ('leftLeg', (-0.115, 0.64, 0.0)), 'leftAnkle': ('leftKnee', (-0.115, 0.22, 0.006)),
  'rightLeg': ('hips', (0.105, 1.02, 0.0)), 'rightKnee': ('rightLeg', (0.115, 0.64, 0.0)), 'rightAnkle': ('rightKnee', (0.115, 0.22, 0.006)),
}
def three_to_blender(p): return Vector((p[0], -p[2], p[1]))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS; bpy.context.scene.render.fps_base = 1.0
arm_data = bpy.data.armatures.new('locomotion_skeleton')
arm = bpy.data.objects.new('locomotion_rig', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
ebs = {}
for name, (parent, p) in SPEC.items():
    eb = arm_data.edit_bones.new(name); h = three_to_blender(p); eb.head = h; eb.tail = h + Vector((0, 0, 0.08)); eb.roll = 0.0
    if parent: eb.parent = ebs[parent]; eb.use_connect = False
    ebs[name] = eb
bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'

def cycle(name, period, legA, kneeK, armB, elbowE, leanX, twistY, bob_knee):
    """Keyframe one looping cycle. Angles are in the three.js bone frame (X right, Y up, Z back)."""
    act = bpy.data.actions.new(name)
    arm.animation_data_create(); arm.animation_data.action = act
    n = int(round(period * FPS))
    for f in range(n + 1):
        t = f / n; ph = 2 * math.pi * t
        bpy.context.scene.frame_set(f)
        s, c = math.sin(ph), math.cos(ph)
        # legs: left forward at ph = pi/2
        lleg = LEG * legA * s; rleg = -LEG * legA * s
        # knee flexion peaks while the leg swings forward (recovery), plus a base bend when it bears weight
        # knee flexion peaks mid-swing (leg passing under the body, cos > 0) and is gone at heel strike;
        # a small bend on the stance leg as it takes the weight
        lk = kneeK * max(0.0, c) ** 1.3 + bob_knee * max(0.0, -c) * max(0.0, -s + 0.3)
        rk = kneeK * max(0.0, -c) ** 1.3 + bob_knee * max(0.0, c) * max(0.0, s + 0.3)
        rot = {
            'hips':  Euler((leanX * 0.3, -twistY * s, 0.04 * s), 'XYZ'),
            'torso': Euler((leanX, twistY * s, -0.03 * s), 'XYZ'),
            'head':  Euler((-leanX * 0.6, -twistY * 0.5 * s, 0.0), 'XYZ'),
            'leftLeg':  Euler((lleg, 0.0, 0.03), 'XYZ'),
            'rightLeg': Euler((rleg, 0.0, -0.03), 'XYZ'),
            'leftKnee':  Euler((-LEG * lk, 0, 0), 'XYZ'),
            'rightKnee': Euler((-LEG * rk, 0, 0), 'XYZ'),
            'leftAnkle':  Euler((LEG * 0.25 * -s * 0.5, 0, 0), 'XYZ'),
            'rightAnkle': Euler((LEG * 0.25 * s * 0.5, 0, 0), 'XYZ'),
            # arms swing opposite to the leg on the same side
            'leftArm':  Euler((-LEG * armB * s, 0.0, -0.10), 'XYZ'),
            'rightArm': Euler((LEG * armB * s, 0.0, 0.10), 'XYZ'),
            'leftElbow':  Euler((ELB * (elbowE + 0.25 * armB * max(0.0, -s)), 0, 0), 'XYZ'),
            'rightElbow': Euler((ELB * (elbowE + 0.25 * armB * max(0.0, s)), 0, 0), 'XYZ'),
        }
        for bname, eul in rot.items():
            pb = arm.pose.bones[bname]
            pb.rotation_quaternion = eul.to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=f)
    for fc in act.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    # push to its own NLA track so the exporter writes one animation per cycle
    track = arm.animation_data.nla_tracks.new(); track.name = name
    strip = track.strips.new(name, 0, act); strip.name = name
    arm.animation_data.action = None
    return act

cycle('walk', 1.30, legA=0.46, kneeK=0.70, armB=0.38, elbowE=0.35, leanX=0.04, twistY=0.10, bob_knee=0.12)
cycle('run',  0.65, legA=0.80, kneeK=1.20, armB=0.70, elbowE=1.15, leanX=0.20, twistY=0.16, bob_knee=0.18)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.scene.frame_start = 0; bpy.context.scene.frame_end = 40
arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                          export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_skins=False, export_materials='NONE', export_frame_range=False)
print('LOCOMOTION_EXPORTED', OUT)
