"""Merge the Mixamo FBX downloads into one GLB with every clip as a named animation.

  blender -b --python blender/build_crew.py --python-exit-code 1

Input:  game/assets/mixamo/crew_character.fbx + anim_*.fbx  (Mixamo, FBX binary, skin only on the character)
Output: game/assets/crew.glb   (clips named idle, run, walk, swing, throw, hit, death)
"""
import glob
import os

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "game", "assets", "mixamo")
OUT = os.path.join(ROOT, "game", "assets", "crew.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    return [o for o in bpy.data.objects if o not in before]


char_objs = import_fbx(os.path.join(SRC, "crew_character.fbx"))
arm = next(o for o in char_objs if o.type == "ARMATURE")
arm.name = "crew"
if arm.animation_data is None:
    arm.animation_data_create()
# Drop the character file's own take (usually a T-pose) so it doesn't export as a clip.
if arm.animation_data.action:
    arm.animation_data.action = None

for path in sorted(glob.glob(os.path.join(SRC, "anim_*.fbx"))):
    clip = os.path.splitext(os.path.basename(path))[0].replace("anim_", "")
    objs = import_fbx(path)
    src_arm = next((o for o in objs if o.type == "ARMATURE"), None)
    act = src_arm.animation_data.action if src_arm and src_arm.animation_data else None
    if act is None:
        print(f"!! no action in {path}")
    else:
        act.name = clip
        act.use_fake_user = True
        track = arm.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, int(act.frame_range[0]), act)
        if hasattr(strip, "action_slot") and act.slots:
            strip.action_slot = act.slots[0]
        track.mute = True
        print(f"clip {clip}: frames {tuple(act.frame_range)}")
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_animation_mode="NLA_TRACKS",
    export_apply=True,
    export_image_format="JPEG",
    export_jpeg_quality=80,
)
print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")
