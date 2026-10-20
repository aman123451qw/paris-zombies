"""
Build a low-poly Paris street kit and export it as one GLB for the
paris-zombies three.js shooter. Run headless:

  blender -b --python build_paris_kit.py --python-exit-code 1

Conventions:
 - metres, Z-up in Blender.
 - Each piece's front faces -Y in Blender -> +Z in three.js after the
   standard glTF Y-up export conversion (gltf_z = -blender_y).
 - Each piece object origin sits at its base centre (x=0,y=0,z=0 local).
 - Every piece gets a child collider mesh "col_<piece>" (material
   mat_collider) except shotgun.
"""

import bpy
import bmesh
import math
import os
import json
import struct

from mathutils import Matrix, Vector

BLEND_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(BLEND_DIR)
GLB_PATH = os.path.join(REPO_DIR, "game", "assets", "paris_kit.glb")
PREVIEW_PATH = os.path.join(BLEND_DIR, "kit_preview.png")

SEG = 12  # low-poly round segment count

# ---------------------------------------------------------------------------
# Scene setup
# ---------------------------------------------------------------------------

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                 bpy.data.lights, bpy.data.images):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


clear_scene()

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def hex_to_linear(hex_color):
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0

    def to_lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (to_lin(r), to_lin(g), to_lin(b))


def make_mat(name, hex_color, roughness=0.6, metallic=0.0,
             emission_strength=0.0, emission_hex=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    rgb = hex_to_linear(hex_color)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission_strength > 0:
        erg = hex_to_linear(emission_hex or hex_color)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*erg, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        else:  # older API name fallback
            bsdf.inputs["Emission"].default_value = (*erg, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


MAT_DEFS = {
    "mat_stone": ("#D8C7A6", 0.9, 0.0, 0.0, None),
    "mat_window": ("#2a3440", 0.2, 0.0, 0.0, None),
    "mat_shopfront": ("#3a3a3a", 0.6, 0.0, 0.0, None),
    "mat_iron": ("#1a1a1a", 0.4, 0.6, 0.0, None),
    "mat_zinc": ("#6E7378", 0.5, 0.5, 0.0, None),
    "mat_brick": ("#9a5a40", 0.8, 0.0, 0.0, None),
    "mat_terracotta": ("#b5653a", 0.8, 0.0, 0.0, None),
    "mat_bronze": ("#4a5a4a", 0.4, 0.8, 0.0, None),
    "mat_metro_green": ("#2f5a3c", 0.5, 0.3, 0.0, None),
    "mat_lamp": ("#ffcf7a", 0.3, 0.0, 2.0, "#ffcf7a"),
    "mat_sign": ("#e9dcb5", 0.6, 0.0, 0.0, None),
    "mat_bark": ("#6b5a45", 0.9, 0.0, 0.0, None),
    "mat_leaves": ("#B8A04A", 0.8, 0.0, 0.0, None),
    "mat_wood": ("#8a6a45", 0.7, 0.0, 0.0, None),
    "mat_steel": ("#9a9ea3", 0.4, 0.7, 0.0, None),
    "mat_marble": ("#e8e4dc", 0.3, 0.0, 0.0, None),
    "mat_rattan": ("#a8743a", 0.7, 0.0, 0.0, None),
    "mat_gun": ("#1b1b1d", 0.4, 0.6, 0.0, None),
    "mat_gunwood": ("#6b4426", 0.6, 0.0, 0.0, None),
    "mat_collider": ("#ff00ff", 0.8, 0.0, 0.0, None),
}

MATS = {}
for name, (hexc, rough, metal, emis, emis_hex) in MAT_DEFS.items():
    MATS[name] = make_mat(name, hexc, rough, metal, emis, emis_hex)

# ---------------------------------------------------------------------------
# Geometry helpers (all build directly into a per-piece bmesh)
# ---------------------------------------------------------------------------

def add_box(bm, center, size, mat_idx, rot_z=0.0):
    res = bmesh.ops.create_cube(bm, size=1.0)
    verts = res['verts']
    bmesh.ops.scale(bm, vec=size, verts=verts)
    if rot_z:
        bmesh.ops.rotate(bm, verts=verts, cent=(0, 0, 0),
                          matrix=Matrix.Rotation(rot_z, 3, 'Z'))
    bmesh.ops.translate(bm, vec=center, verts=verts)
    vset = set(verts)
    faces = set()
    for v in verts:
        for f in v.link_faces:
            if all(fv in vset for fv in f.verts):
                faces.add(f)
    for f in faces:
        f.material_index = mat_idx
    return verts, faces


def add_wall_box(bm, orientation, along_c, along_s, depth_c, depth_s,
                  z_c, z_s, mat_idx):
    """orientation 0: facing -Y, width along X. orientation 1: facing -X,
    width along Y."""
    if orientation == 0:
        add_box(bm, (along_c, depth_c, z_c), (along_s, depth_s, z_s), mat_idx)
    else:
        add_box(bm, (depth_c, along_c, z_c), (depth_s, along_s, z_s), mat_idx)


def add_cyl(bm, center, radius1, radius2, height, mat_idx, segments=SEG,
            cap=True):
    res = bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False,
                                 segments=segments, radius1=radius1,
                                 radius2=radius2, depth=height)
    verts = res['verts']
    bmesh.ops.translate(bm, vec=center, verts=verts)
    vset = set(verts)
    faces = set()
    for v in verts:
        for f in v.link_faces:
            if all(fv in vset for fv in f.verts):
                faces.add(f)
    for f in faces:
        f.material_index = mat_idx
    return verts, faces


def add_sphere(bm, center, radius, mat_idx, subdiv=1):
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    verts = res['verts']
    bmesh.ops.translate(bm, vec=center, verts=verts)
    vset = set(verts)
    faces = set()
    for v in verts:
        for f in v.link_faces:
            if all(fv in vset for fv in f.verts):
                faces.add(f)
    for f in faces:
        f.material_index = mat_idx
    return verts, faces


def add_extruded_profile(bm, profile, x_min, x_max, mat_idx):
    """profile: list of (y, z) points, CCW, extruded along X."""
    n = len(profile)
    v0 = [bm.verts.new((x_min, y, z)) for (y, z) in profile]
    v1 = [bm.verts.new((x_max, y, z)) for (y, z) in profile]
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((v0[i], v0[j], v1[j], v1[i])))
    faces.append(bm.faces.new(list(reversed(v0))))
    faces.append(bm.faces.new(v1))
    for f in faces:
        f.material_index = mat_idx
    return faces


def window_columns(width, win_w, n):
    gap = (width - n * win_w) / (n + 1)
    centers = []
    x = -width / 2 + gap + win_w / 2
    for _ in range(n):
        centers.append(x)
        x += win_w + gap
    return centers


def new_bm():
    return bmesh.new()


def finish_piece(name, bm, mat_names):
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mn in mat_names:
        mesh.materials.append(MATS[mn])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def add_collider(piece_obj, boxes):
    """boxes: list of (center, size) tuples."""
    bm = new_bm()
    for center, size in boxes:
        add_box(bm, center, size, 0)
    col = finish_piece(f"col_{piece_obj.name}", bm, ["mat_collider"])
    col.parent = piece_obj
    col.hide_render = True
    return col


# ---------------------------------------------------------------------------
# Facade wall builder (reused by facade_A, facade_B, facade_corner)
# ---------------------------------------------------------------------------

FACADE_W = 6.0
FACADE_H = 18.0
FACADE_D = 1.0
GROUND_H = 4.5
UPPER_H = (FACADE_H - GROUND_H) / 4.0
WIN_W = 1.1
WIN_H = 2.2
SILL_H = 0.6
INSET = 0.2
SHOP_INSET = 0.3

I_STONE = 0
I_WINDOW = 1
I_SHOPFRONT = 2
FACADE_MATS = ["mat_stone", "mat_window", "mat_shopfront"]


def build_window_floor(bm, orientation, along_origin, width, front, z_bottom,
                        floor_h, direction=1.0):
    centers = window_columns(width, WIN_W, 3)
    lintel_h = floor_h - SILL_H - WIN_H
    left = -width / 2
    wall_c = front + direction * FACADE_D / 2.0
    for c in centers:
        pier_w = (c - WIN_W / 2) - left
        pier_c = left + pier_w / 2
        add_wall_box(bm, orientation, along_origin + pier_c, pier_w,
                     wall_c, FACADE_D, z_bottom + floor_h / 2, floor_h,
                     I_STONE)
        add_wall_box(bm, orientation, along_origin + c, WIN_W,
                     wall_c, FACADE_D, z_bottom + SILL_H / 2, SILL_H,
                     I_STONE)
        add_wall_box(bm, orientation, along_origin + c, WIN_W,
                     wall_c, FACADE_D,
                     z_bottom + SILL_H + WIN_H + lintel_h / 2, lintel_h,
                     I_STONE)
        win_depth_c = front + direction * (INSET + 0.03)
        add_wall_box(bm, orientation, along_origin + c, WIN_W * 0.85,
                     win_depth_c, 0.06,
                     z_bottom + SILL_H + WIN_H / 2, WIN_H * 0.92, I_WINDOW)
        left = c + WIN_W / 2
    pier_w = width / 2 - left
    pier_c = left + pier_w / 2
    add_wall_box(bm, orientation, along_origin + pier_c, pier_w,
                 wall_c, FACADE_D, z_bottom + floor_h / 2, floor_h, I_STONE)
    # protruding sill ledge across the whole floor width
    sill_ledge_c = front - direction * 0.03
    add_wall_box(bm, orientation, along_origin, width, sill_ledge_c,
                 FACADE_D + 0.06, z_bottom + SILL_H - 0.04, 0.08, I_STONE)


def build_shopfront(bm, orientation, along_origin, width, front, z_bottom,
                     height, direction=1.0):
    pier_w = 0.3
    wall_c = front + direction * FACADE_D / 2.0
    add_wall_box(bm, orientation, along_origin - width / 2 + pier_w / 2,
                 pier_w, wall_c, FACADE_D, z_bottom + height / 2, height,
                 I_STONE)
    add_wall_box(bm, orientation, along_origin + width / 2 - pier_w / 2,
                 pier_w, wall_c, FACADE_D, z_bottom + height / 2, height,
                 I_STONE)
    header_h = 0.3
    opening_w = width - 2 * pier_w
    add_wall_box(bm, orientation, along_origin, opening_w,
                 wall_c, FACADE_D, z_bottom + height - header_h / 2,
                 header_h, I_STONE)
    shop_depth_c = front + direction * (SHOP_INSET + 0.03)
    add_wall_box(bm, orientation, along_origin, opening_w * 0.95,
                 shop_depth_c, 0.06,
                 z_bottom + (height - header_h) / 2, height - header_h - 0.1,
                 I_SHOPFRONT)


def build_cornice(bm, orientation, along_origin, width, front, z, direction=1.0):
    c = front - direction * 0.08
    add_wall_box(bm, orientation, along_origin, width + 0.2, c,
                 FACADE_D + 0.16, z, 0.3, I_STONE)


def build_balcony(bm, orientation, along_origin, width, front, z, direction=1.0):
    ledge_depth = 0.6
    ledge_c = front - direction * ledge_depth / 2.0
    add_wall_box(bm, orientation, along_origin, width - 0.4, ledge_c,
                 ledge_depth, z + 0.05, 0.1, I_STONE)
    rail_h = 0.95
    rail_front = front - direction * (ledge_depth - 0.05)
    # top rail
    add_wall_box(bm, orientation, along_origin, width - 0.4, rail_front,
                 0.04, z + rail_h, 0.04, I_STONE)
    n_bal = 20
    bal_w = (width - 0.4) / n_bal
    start = -((width - 0.4) / 2) + bal_w / 2
    for i in range(n_bal):
        bc = along_origin + start + i * bal_w
        add_wall_box(bm, orientation, bc, 0.03, rail_front, 0.03,
                     z + rail_h / 2, rail_h, I_STONE)


def build_facade(name, with_balcony):
    bm = new_bm()
    # main wall body (back fill so there are no gaps at pier/lintel seams)
    add_wall_box(bm, 0, 0.0, FACADE_W, -0.5 + FACADE_D / 2, FACADE_D,
                 FACADE_H / 2, FACADE_H, I_STONE)
    build_shopfront(bm, 0, 0.0, FACADE_W, -0.5, 0.0, GROUND_H)
    for i in range(4):
        z0 = GROUND_H + i * UPPER_H
        build_window_floor(bm, 0, 0.0, FACADE_W, -0.5, z0, UPPER_H)
    build_cornice(bm, 0, 0.0, FACADE_W, -0.5, GROUND_H)
    build_cornice(bm, 0, 0.0, FACADE_W, -0.5, FACADE_H)
    if with_balcony:
        build_balcony(bm, 0, 0.0, FACADE_W, -0.5, GROUND_H)
        build_balcony(bm, 0, 0.0, FACADE_W, -0.5, GROUND_H + 3 * UPPER_H)
    obj = finish_piece(name, bm, FACADE_MATS)
    add_collider(obj, [
        ((0, 0, FACADE_H / 2), (FACADE_W, FACADE_D, FACADE_H)),
    ])
    return obj


facade_A = build_facade("facade_A", with_balcony=False)
facade_B = build_facade("facade_B", with_balcony=True)

# ---------------------------------------------------------------------------
# facade_corner
# ---------------------------------------------------------------------------

def build_facade_corner():
    bm = new_bm()
    chamfer = 1.8
    span = FACADE_W - chamfer  # 4.2
    along_origin = -FACADE_W / 2 + chamfer + span / 2  # centre of visible face
    # south face (orientation 0), west face (orientation 1)
    for orientation in (0, 1):
        front = -FACADE_W / 2
        add_wall_box(bm, orientation, along_origin, span,
                     front + FACADE_D / 2, FACADE_D, FACADE_H / 2, FACADE_H,
                     I_STONE)
        for i in range(5):
            z0 = i * (FACADE_H / 5)
            fh = FACADE_H / 5
            build_window_floor(bm, orientation, along_origin, span, front,
                                z0, fh)
        build_cornice(bm, orientation, along_origin, span, front, FACADE_H)
    # chamfer wall connecting the two cut corners
    p1 = (-FACADE_W / 2 + chamfer, -FACADE_W / 2)
    p2 = (-FACADE_W / 2, -FACADE_W / 2 + chamfer)
    mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
    length = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    angle = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    add_box(bm, (mid[0], mid[1], FACADE_H / 2), (length, FACADE_D, FACADE_H),
            I_STONE, rot_z=angle)
    obj = finish_piece("facade_corner", bm, FACADE_MATS)
    add_collider(obj, [
        ((-1.5, -1.5, FACADE_H / 2), (6, 6, FACADE_H)),
    ])
    return obj


facade_corner = build_facade_corner()

# ---------------------------------------------------------------------------
# mansard_roof
# ---------------------------------------------------------------------------

def build_mansard_roof():
    bm = new_bm()
    profile = [(-0.5, 0.0), (-0.5, 0.5), (2.0, 4.0), (2.0, 0.0)]
    add_extruded_profile(bm, profile, -3.0, 3.0, 0)  # mat_zinc
    # 2 dormers on the slope
    for dx in (-1.6, 1.6):
        t = (2.0 - 0.5) / (4.0 - 0.5)
        y_slope = -0.5 + t * 2.5
        add_box(bm, (dx, y_slope - 0.3, 2.3), (0.9, 0.7, 1.1), 0)
        add_box(bm, (dx, y_slope - 0.62, 2.35), (0.5, 0.1, 0.7), 1)  # window
    # chimney with 3 pots
    add_box(bm, (2.2, 1.3, 4.6), (0.8, 0.8, 1.6), 2)  # mat_brick
    for i, dx in enumerate((-0.2, 0.0, 0.2)):
        add_cyl(bm, (2.2 + dx, 1.3, 5.55), 0.14, 0.14, 0.3, 3, segments=8)
    obj = finish_piece("mansard_roof", bm,
                        ["mat_zinc", "mat_window", "mat_brick",
                         "mat_terracotta"])
    add_collider(obj, [
        ((0, 0.3, 2.0), (6, 2.6, 4.0)),
    ])
    return obj


mansard_roof = build_mansard_roof()

# ---------------------------------------------------------------------------
# monument (simplified: fast primitives, 2-3 collider boxes)
# ---------------------------------------------------------------------------

def build_monument():
    bm = new_bm()
    # 3-step round base
    add_cyl(bm, (0, 0, 0.2), 7.0, 7.0, 0.4, 0, segments=16)
    add_cyl(bm, (0, 0, 0.6), 6.0, 6.0, 0.4, 0, segments=16)
    add_cyl(bm, (0, 0, 1.0), 5.0, 5.0, 0.4, 0, segments=16)
    # tapered plinth + cornice cap
    add_cyl(bm, (0, 0, 1.2 + 4.0), 2.5, 2.2, 8.0, 0, segments=16)
    add_cyl(bm, (0, 0, 9.35), 2.6, 2.6, 0.3, 0, segments=16)
    # bronze figure
    base_z = 9.5
    add_cyl(bm, (0, 0, base_z + 1.5), 1.0, 0.4, 3.0, 1, segments=10)  # robe
    add_cyl(bm, (0, 0, base_z + 3.5), 0.35, 0.3, 1.0, 1, segments=10)  # torso
    add_sphere(bm, (0, 0, base_z + 4.35), 0.32, 1)  # head
    add_cyl(bm, (0.25, 0, base_z + 3.9), 0.1, 0.07, 1.1, 1, segments=8,
            cap=True)  # raised arm (approx, vertical-ish)
    add_sphere(bm, (0.25, 0.15, base_z + 4.9), 0.12, 1)  # branch/hand
    # reclining lion on front of base
    add_box(bm, (0, -5.6, 0.75), (1.3, 3.0, 1.0), 0)
    add_sphere(bm, (0, -7.0, 0.95), 0.55, 0)
    obj = finish_piece("monument", bm, ["mat_stone", "mat_bronze"])
    add_collider(obj, [
        ((0, 0, 0.6), (14, 14, 1.2)),
        ((0, 0, 1.2 + 4.0), (5, 5, 8.0)),
        ((0, 0, base_z + 2.5), (2, 2, 5.0)),
    ])
    return obj


monument = build_monument()

# ---------------------------------------------------------------------------
# metro_arch
# ---------------------------------------------------------------------------

def build_metro_arch():
    bm = new_bm()
    for side in (-1, 1):
        x = side * 1.8
        # curved post approximated with 2 angled segments
        add_box(bm, (x, 0, 1.2), (0.12, 0.12, 2.4), 0)
        ang = -side * 0.35
        add_box(bm, (x - side * 0.25, 0, 2.9), (0.12, 0.12, 1.4), 0,
                rot_z=0)
        add_sphere(bm, (x - side * 0.45, 0, 3.55), 0.22, 1)  # lamp globe
    # sign plate between posts
    add_box(bm, (0, 0, 3.0), (3.4, 0.08, 0.5), 2)
    # low railing around a 4x2m stair opening
    rail_h = 0.9
    ow, od = 4.0, 2.0
    for sx in (-ow / 2, ow / 2):
        add_box(bm, (sx, -od / 2, rail_h / 2), (0.06, od, rail_h), 0)
    for sy in (-od / 2, od / 2):
        add_box(bm, (0, sy, rail_h / 2), (ow, 0.06, rail_h), 0)
    add_box(bm, (0, -od / 2, rail_h), (ow, 0.06, 0.06), 0)
    add_box(bm, (0, od / 2, rail_h), (ow, 0.06, 0.06), 0)
    obj = finish_piece("metro_arch", bm,
                        ["mat_metro_green", "mat_lamp", "mat_sign"])
    add_collider(obj, [
        ((0, 0, 1.75), (4.0, 0.3, 3.5)),
    ])
    return obj


metro_arch = build_metro_arch()

# ---------------------------------------------------------------------------
# lamp_post
# ---------------------------------------------------------------------------

def build_lamp_post():
    bm = new_bm()
    add_cyl(bm, (0, 0, 0.1), 0.18, 0.15, 0.2, 0, segments=10)  # base
    add_cyl(bm, (0, 0, 2.2), 0.07, 0.05, 4.0, 0, segments=10)  # post
    add_cyl(bm, (0, 0, 4.3), 0.12, 0.12, 0.2, 0, segments=10)  # cap ring
    add_box(bm, (0, 0, 4.1), (0.05, 0.05, 0.3), 0)  # arm stub
    add_sphere(bm, (0, 0, 4.1), 0.22, 1)  # lantern glass (emissive)
    add_cyl(bm, (0, 0, 4.4), 0.0, 0.2, 0.3, 0, segments=8)  # lantern roof
    obj = finish_piece("lamp_post", bm, ["mat_metro_green", "mat_lamp"])
    add_collider(obj, [
        ((0, 0, 2.25), (0.3, 0.3, 4.5)),
    ])
    return obj


lamp_post = build_lamp_post()

# ---------------------------------------------------------------------------
# plane_tree
# ---------------------------------------------------------------------------

def build_plane_tree():
    bm = new_bm()
    add_cyl(bm, (0, 0, 2.0), 0.28, 0.2, 4.0, 0, segments=8)
    for cx, cy, cz, r in (
        (0.0, 0.0, 6.8, 3.6),
        (1.6, 0.8, 7.6, 2.6),
        (-1.5, -0.6, 7.3, 2.8),
        (0.3, -1.4, 6.6, 2.4),
    ):
        add_sphere(bm, (cx, cy, cz), r, 1, subdiv=1)
    obj = finish_piece("plane_tree", bm, ["mat_bark", "mat_leaves"])
    add_collider(obj, [
        ((0, 0, 2.0), (0.6, 0.6, 4.0)),
    ])
    return obj


plane_tree = build_plane_tree()

# ---------------------------------------------------------------------------
# pallet_stack
# ---------------------------------------------------------------------------

def build_pallet_stack():
    bm = new_bm()
    add_box(bm, (-0.6, 0, 0.3), (1.2, 1.0, 0.6), 0)
    for i in range(3):
        add_box(bm, (-0.6, -0.42 + i * 0.42, 0.62), (1.15, 0.06, 0.04), 0)
    add_box(bm, (0.5, 0, 0.5), (1.15, 0.06, 1.0), 0, rot_z=0.45)
    add_box(bm, (0.95, 0, 0.5), (1.1, 0.06, 1.0), 0, rot_z=-0.4)
    obj = finish_piece("pallet_stack", bm, ["mat_wood"])
    add_collider(obj, [
        ((-0.6, 0, 0.3), (1.3, 1.1, 0.6)),
        ((0.75, 0, 0.5), (1.3, 0.8, 1.0)),
    ])
    return obj


pallet_stack = build_pallet_stack()

# ---------------------------------------------------------------------------
# crowd_barrier
# ---------------------------------------------------------------------------

def build_crowd_barrier():
    bm = new_bm()
    w = 2.5
    h = 1.1
    add_cyl(bm, (0, 0, h), 0.03, 0.03, w, 0, segments=8)
    for i in range(6):
        bx = -w / 2 + 0.1 + i * (w - 0.2) / 5
        add_box(bm, (bx, 0, h * 0.5), (0.03, 0.03, h), 0)
    for sx in (-w / 2 + 0.15, w / 2 - 0.15):
        add_box(bm, (sx, 0, 0.1), (0.3, 0.4, 0.06), 0)
        add_box(bm, (sx, 0, 0.05), (0.06, 0.4, 0.1), 0)
    obj = finish_piece("crowd_barrier", bm, ["mat_steel"])
    add_collider(obj, [
        ((0, 0, 0.55), (w, 0.4, 1.1)),
    ])
    return obj


crowd_barrier = build_crowd_barrier()

# ---------------------------------------------------------------------------
# cafe_table
# ---------------------------------------------------------------------------

def build_cafe_table():
    bm = new_bm()
    add_cyl(bm, (0, 0, 0.1), 0.16, 0.14, 0.06, 0, segments=10)  # foot
    add_cyl(bm, (0, 0, 0.4), 0.035, 0.035, 0.6, 0, segments=8)  # pole
    add_cyl(bm, (0, 0, 0.73), 0.3, 0.3, 0.04, 1, segments=SEG)  # marble top
    obj = finish_piece("cafe_table", bm, ["mat_iron", "mat_marble"])
    add_collider(obj, [
        ((0, 0, 0.37), (0.35, 0.35, 0.75)),
    ])
    return obj


cafe_table = build_cafe_table()

# ---------------------------------------------------------------------------
# cafe_chair
# ---------------------------------------------------------------------------

def build_cafe_chair():
    bm = new_bm()
    for sx in (-0.17, 0.17):
        for sy in (-0.17, 0.17):
            add_box(bm, (sx, sy, 0.22), (0.03, 0.03, 0.44), 1)
    add_cyl(bm, (0, 0, 0.46), 0.22, 0.22, 0.04, 0, segments=10)  # seat
    for i in range(3):
        add_box(bm, (-0.18 + i * 0.18, 0.19, 0.68), (0.03, 0.03, 0.44), 1)
    add_box(bm, (0, 0.19, 0.9), (0.42, 0.03, 0.03), 1)
    obj = finish_piece("cafe_chair", bm, ["mat_rattan", "mat_iron"])
    add_collider(obj, [
        ((0, 0, 0.45), (0.4, 0.4, 0.9)),
    ])
    return obj


cafe_chair = build_cafe_chair()

# ---------------------------------------------------------------------------
# bench
# ---------------------------------------------------------------------------

def build_bench():
    bm = new_bm()
    for ex in (-0.9, 0.9):
        add_box(bm, (ex, 0, 0.22), (0.06, 0.5, 0.44), 1)
        add_box(bm, (ex, 0.2, 0.6), (0.06, 0.1, 0.7), 1)
    for i in range(3):
        add_box(bm, (0, -0.2 + i * 0.2, 0.46), (2.0, 0.12, 0.04), 0)
    for i in range(3):
        add_box(bm, (0, 0.24, 0.65 + i * 0.18), (2.0, 0.1, 0.04), 0)
    obj = finish_piece("bench", bm, ["mat_metro_green", "mat_wood"])
    add_collider(obj, [
        ((0, 0, 0.3), (2.0, 0.55, 0.9)),
    ])
    return obj


bench = build_bench()

# ---------------------------------------------------------------------------
# shotgun (no collider), grip at origin, barrel points +Y in Blender
# (-Z in three.js)
# ---------------------------------------------------------------------------

def build_shotgun():
    bm = new_bm()
    add_cyl(bm, (0, 0.42, 0.04), 0.022, 0.022, 0.62, 0, segments=8)  # barrel
    add_box(bm, (0, 0.1, 0.0), (0.05, 0.3, 0.06), 0)  # receiver
    add_box(bm, (0, 0.28, -0.045), (0.045, 0.22, 0.05), 1)  # pump grip
    add_box(bm, (0, -0.02, -0.12), (0.035, 0.07, 0.2), 1)  # pistol grip
    add_box(bm, (0, -0.22, -0.05), (0.04, 0.3, 0.09), 1)  # stock
    obj = finish_piece("shotgun", bm, ["mat_gun", "mat_gunwood"])
    return obj


shotgun = build_shotgun()

# ---------------------------------------------------------------------------
# Lay pieces out spaced along X
# ---------------------------------------------------------------------------

ALL_PIECES = [
    facade_A, facade_B, facade_corner, mansard_roof, monument, metro_arch,
    lamp_post, plane_tree, pallet_stack, crowd_barrier, cafe_table,
    cafe_chair, bench, shotgun,
]

x = 0.0
for obj in ALL_PIECES:
    obj.location.x = x
    x += 12.0

# ---------------------------------------------------------------------------
# Export GLB
# ---------------------------------------------------------------------------

os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format='GLB',
    use_selection=False,
    export_apply=True,
    export_yup=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
)

print(f"EXPORTED: {GLB_PATH}")
print(f"SIZE_BYTES: {os.path.getsize(GLB_PATH)}")

# ---------------------------------------------------------------------------
# Preview render (Workbench, all pieces laid out in a row)
# ---------------------------------------------------------------------------

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 1600
scene.render.resolution_y = 700
scene.render.filepath = PREVIEW_PATH
scene.render.image_settings.file_format = 'PNG'
try:
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
except Exception as e:
    print("shading setup warn:", e)

bpy.ops.object.camera_add(location=(x / 2, -28, 11),
                           rotation=(math.radians(80), 0, 0))
cam = bpy.context.object
cam.data.type = 'ORTHO'
cam.data.ortho_scale = x + 14
scene.camera = cam

sun_data = bpy.data.lights.new("sun", type='SUN')
sun_data.energy = 2.5
sun_obj = bpy.data.objects.new("sun", sun_data)
bpy.context.collection.objects.link(sun_obj)
sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))

bpy.ops.render.render(write_still=True)
print(f"PREVIEW: {PREVIEW_PATH}")

# ---------------------------------------------------------------------------
# Verify GLB node names (read JSON chunk straight from the GLB container)
# ---------------------------------------------------------------------------

with open(GLB_PATH, 'rb') as f:
    data = f.read()

magic, version, length = struct.unpack('<4sII', data[0:12])
offset = 12
json_text = None
while offset < length:
    chunk_len, chunk_type = struct.unpack('<I4s', data[offset:offset + 8])
    chunk_data = data[offset + 8: offset + 8 + chunk_len]
    if chunk_type == b'JSON':
        json_text = chunk_data.decode('utf-8')
        break
    offset += 8 + chunk_len

gltf = json.loads(json_text)
node_names = [n.get('name', '<unnamed>') for n in gltf.get('nodes', [])]
print("NODE_NAMES:")
for n in node_names:
    print(" -", n)

expected = {p.name for p in ALL_PIECES}
expected_cols = {f"col_{n}" for n in expected if n != "shotgun"}
missing = (expected | expected_cols) - set(node_names)
print("MISSING_NODES:", sorted(missing) if missing else "none")
