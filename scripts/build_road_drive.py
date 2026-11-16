#!/usr/bin/env python3
"""
scripts/build_road_drive.py

Procedural glTF 2.0 (.glb) generator for Night Drive — Option 4 ("THE DRIVE", ROAD_MODES[3]).
Builds `assets/models/night-drive-city.glb`: a 16m seamless Z-tiling (`Z in [-8, +8]`)
LA Dusk / *Drive* (2011) Sixth-Street-Viaduct ("Ribbon of Light") & Downtown Expressway tile.

Features:
- Sculpted concrete viaduct parapets & F-shape Jersey barriers at X = +-9.4 with warm-amber
  highway reflector studs and expansion-joint pilasters.
- Graceful paired Sixth-Street-Viaduct canted concrete/steel parabolic arch ribs curving outside
  the barriers (X = +-10.2..11.4, cresting to Y = 9.1m) with steel tie-struts, vertical hanger
  cables, seamless split V-pier knuckles at Z = +-8, and warm golden-coral uplighting ribbons
  (node `ViaductArchGlow`).
- Cantilevered twin-arm LA highway cobra streetlamps (staggered L/R) with glowing warm
  high-pressure sodium-vapor luminaire heads clearing Y >= 9.0m over the roadway.
- Staggered California fan-palm silhouettes (*Washingtonia robusta*, X = +-14..20.5) with
  curved ringed trunks, fibrous petiole skirts, and multi-tiered 3D pleated fan-frond crowns.
- Continuous outer viaduct cantilever deck, palm boulevard promenade, battered retaining walls,
  and flanking elevated LA Metro rail viaduct decks (X = +-9.22..30) eliminating roadside void.

Strict Highway Clearance:
- Roadway corridor X in [-9.2, +9.2], Y in [0, 7.8] is 100% unobstructed (verified at build time).
"""

import json
import math
import os
import struct
import zlib

SEGMENT_LENGTH = 16.0
Z_MIN = -8.0
Z_MAX = 8.0


# ---------------------------------------------------------------------------
# Vector Math Helpers
# ---------------------------------------------------------------------------
def v_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def v_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def v_cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def v_len(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def v_norm(a):
    l = v_len(a)
    if l < 1e-9:
        return (0.0, 1.0, 0.0)
    return (a[0] / l, a[1] / l, a[2] / l)


def tri_normal(p0, p1, p2):
    return v_norm(v_cross(v_sub(p1, p0), v_sub(p2, p0)))


# ---------------------------------------------------------------------------
# Pure-Python PNG Generator (Zero external dependencies)
# ---------------------------------------------------------------------------
def make_png_rgba(width, height, pixel_fn):
    raw_rows = bytearray()
    for y in range(height):
        raw_rows.append(0)  # filter type 0 (None)
        v = y / float(max(1, height - 1))
        for x in range(width):
            u = x / float(max(1, width - 1))
            r, g, b, a = pixel_fn(u, v, x, y)
            raw_rows.extend((
                max(0, min(255, int(r))),
                max(0, min(255, int(g))),
                max(0, min(255, int(b))),
                max(0, min(255, int(a))),
            ))

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), level=6)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def build_concrete_png():
    """Warm dusk architectural board-formed concrete with subtle tie-holes & seam lines."""
    def px(u, v, x, y):
        # Subtle deterministic grain
        h = math.sin(x * 12.9898 + y * 78.233) * 43758.5453
        grain = (h - math.floor(h)) - 0.5
        # Board-form horizontal bands & vertical expansion joints
        horiz_seam = -14.0 if (y % 32 in (0, 1)) else 0.0
        vert_seam = -12.0 if (x % 64 in (0, 1)) else 0.0
        # Subtle warm dusk lavender-sandstone concrete base (multiplied by material baseColorFactor)
        base_r = 216 + grain * 16 + horiz_seam + vert_seam
        base_g = 204 + grain * 15 + horiz_seam + vert_seam
        base_b = 214 + grain * 16 + horiz_seam + vert_seam
        # Slight vertical ambient occlusion gradient
        ao = 0.86 + 0.14 * math.sin(v * math.pi)
        return (base_r * ao, base_g * ao, base_b * ao, 255)

    return make_png_rgba(256, 256, px)


def build_palm_bark_png():
    """Ringed California fan-palm (*Washingtonia*) trunk bark texture."""
    def px(u, v, x, y):
        h = math.sin(x * 19.19 + y * 47.73) * 19381.13
        grain = (h - math.floor(h)) - 0.5
        ring = math.sin(v * 88.0 * math.pi + math.sin(u * 6.0 * math.pi) * 0.4)
        fiber = math.sin(u * 42.0 * math.pi) * 0.5
        shade = 0.78 + 0.16 * ring + 0.06 * fiber + grain * 0.08
        return (176 * shade, 144 * shade, 134 * shade, 255)

    return make_png_rgba(128, 256, px)


# ---------------------------------------------------------------------------
# Mesh Builder
# ---------------------------------------------------------------------------
class MeshBuilder:
    def __init__(self, name, material_index):
        self.name = name
        self.material_index = material_index
        self.positions = []
        self.normals = []
        self.uvs = []
        self.indices = []

    def add_vert(self, pos, norm, uv=(0.5, 0.5)):
        idx = len(self.positions)
        self.positions.append((float(pos[0]), float(pos[1]), float(pos[2])))
        self.normals.append((float(norm[0]), float(norm[1]), float(norm[2])))
        self.uvs.append((float(uv[0]), float(uv[1])))
        return idx

    def add_tri(self, p0, p1, p2, uv0=(0, 0), uv1=(1, 0), uv2=(0.5, 1), n=None):
        if n is None:
            n = tri_normal(p0, p1, p2)
        i0 = self.add_vert(p0, n, uv0)
        i1 = self.add_vert(p1, n, uv1)
        i2 = self.add_vert(p2, n, uv2)
        self.indices.extend((i0, i1, i2))

    def add_quad(self, p0, p1, p2, p3, u_scale=1.0, v_scale=1.0, n=None):
        """CCW quad (p0 -> p1 -> p2 -> p3)."""
        if n is None:
            n = tri_normal(p0, p1, p2)
        i0 = self.add_vert(p0, n, (0.0, 0.0))
        i1 = self.add_vert(p1, n, (u_scale, 0.0))
        i2 = self.add_vert(p2, n, (u_scale, v_scale))
        i3 = self.add_vert(p3, n, (0.0, v_scale))
        self.indices.extend((i0, i1, i2, i0, i2, i3))

    def add_smooth_quad(self, p0, p1, p2, p3, n0, n1, n2, n3, uv0, uv1, uv2, uv3):
        i0 = self.add_vert(p0, n0, uv0)
        i1 = self.add_vert(p1, n1, uv1)
        i2 = self.add_vert(p2, n2, uv2)
        i3 = self.add_vert(p3, n3, uv3)
        self.indices.extend((i0, i1, i2, i0, i2, i3))

    def add_box(self, cx, cy, cz, sx, sy, sz, uv_density=0.25, skip_bottom=False):
        hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
        x0, x1 = cx - hx, cx + hx
        y0, y1 = cy - hy, cy + hy
        z0, z1 = cz - hz, cz + hz
        # +Z front
        self.add_quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), sx * uv_density, sy * uv_density, (0, 0, 1))
        # -Z back
        self.add_quad((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), sx * uv_density, sy * uv_density, (0, 0, -1))
        # +X right
        self.add_quad((x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), sz * uv_density, sy * uv_density, (1, 0, 0))
        # -X left
        self.add_quad((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0), sz * uv_density, sy * uv_density, (-1, 0, 0))
        # +Y top
        self.add_quad((x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0), sx * uv_density, sz * uv_density, (0, 1, 0))
        if not skip_bottom:
            # -Y bottom
            self.add_quad((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), sx * uv_density, sz * uv_density, (0, -1, 0))

    def add_strut(self, p_start, p_end, radius_a, radius_b=None, sides=6, cap_ends=False):
        """Oriented cylinder/prism strut between 3D points p_start and p_end with shared ring vertices."""
        if radius_b is None:
            radius_b = radius_a
        axis = v_sub(p_end, p_start)
        length = v_len(axis)
        if length < 1e-5:
            return
        fwd = v_scale(axis, 1.0 / length)
        ref = (0.0, 0.0, 1.0) if abs(fwd[1]) > 0.92 else (0.0, 1.0, 0.0)
        right = v_norm(v_cross(ref, fwd))
        up = v_norm(v_cross(fwd, right))

        idx_a = []
        idx_b = []
        ring_a = []
        ring_b = []
        v_top = length * 0.25
        for s in range(sides + 1):
            ang = (2.0 * math.pi * (s % sides)) / sides
            ca, sa = math.cos(ang), math.sin(ang)
            radial = v_add(v_scale(right, ca), v_scale(up, sa))
            pa = v_add(p_start, v_scale(radial, radius_a))
            pb = v_add(p_end, v_scale(radial, radius_b))
            u = s / float(sides)
            idx_a.append(self.add_vert(pa, radial, (u, 0.0)))
            idx_b.append(self.add_vert(pb, radial, (u, v_top)))
            if s < sides:
                ring_a.append(pa)
                ring_b.append(pb)

        for s in range(sides):
            i0, i1 = idx_a[s], idx_a[s + 1]
            i2, i3 = idx_b[s + 1], idx_b[s]
            self.indices.extend((i0, i1, i2, i0, i2, i3))

        if cap_ends:
            n_end = fwd
            c_end = self.add_vert(p_end, n_end, (0.5, 0.5))
            ring_end_idx = [self.add_vert(ring_b[s], n_end, (0.5, 0.5)) for s in range(sides)]
            for s in range(sides):
                self.indices.extend((c_end, ring_end_idx[s], ring_end_idx[(s + 1) % sides]))

            n_start = v_scale(fwd, -1.0)
            c_start = self.add_vert(p_start, n_start, (0.5, 0.5))
            ring_st_idx = [self.add_vert(ring_a[s], n_start, (0.5, 0.5)) for s in range(sides)]
            for s in range(sides):
                self.indices.extend((c_start, ring_st_idx[(s + 1) % sides], ring_st_idx[s]))

    def extrude_profile_z(self, profile_xy, z0, z1, z_steps=4, closed_loop=True, uv_scale=0.22):
        """
        Extrudes a 2D [(x, y), ...] profile from z0 to z1 with crisp per-segment normals
        and shared vertices along Z steps.
        """
        num_pts = len(profile_xy)
        seg_count = num_pts if closed_loop else (num_pts - 1)
        dz = (z1 - z0) / float(z_steps)

        for k in range(seg_count):
            x_a, y_a = profile_xy[k]
            x_b, y_b = profile_xy[(k + 1) % num_pts]
            edge_len = math.hypot(x_b - x_a, y_b - y_a)
            if edge_len < 1e-6:
                continue
            nx = (y_b - y_a) / edge_len
            ny = -(x_b - x_a) / edge_len
            n = (nx, ny, 0.0)

            # Check geometric winding on first slice
            test_gn = tri_normal((x_a, y_a, z0 + dz), (x_b, y_b, z0 + dz), (x_b, y_b, z0))
            flip = v_dot(test_gn, n) < 0
            gn = tri_normal((x_b, y_b, z0 + dz), (x_a, y_a, z0 + dz), (x_a, y_a, z0)) if flip else test_gn
            u1 = edge_len * uv_scale

            row_indices = []
            for sz in range(z_steps + 1):
                z = z0 + sz * dz
                vz_uv = (z - z0) * uv_scale
                if flip:
                    ia = self.add_vert((x_b, y_b, z), gn, (0.0, vz_uv))
                    ib = self.add_vert((x_a, y_a, z), gn, (u1, vz_uv))
                else:
                    ia = self.add_vert((x_a, y_a, z), gn, (0.0, vz_uv))
                    ib = self.add_vert((x_b, y_b, z), gn, (u1, vz_uv))
                row_indices.append((ia, ib))

            for sz in range(z_steps):
                i0_a, i0_b = row_indices[sz]
                i1_a, i1_b = row_indices[sz + 1]
                self.indices.extend((i1_a, i1_b, i0_b, i1_a, i0_b, i0_a))

    def sweep_section_along_curve(
        self, curve_pts, section_2d, closed_section=True, up_hint=(0.0, 1.0, 0.0), uv_scale=0.2, miter_z_ends=False
    ):
        """
        Sweeps a 2D cross-section [(u, v), ...] in (right, up) local frame along 3D `curve_pts`.
        Shares vertices longitudinally per facet strip while keeping crisp bevel normals across edges.
        """
        n_rings = len(curve_pts)
        n_sec = len(section_2d)
        seg_count = n_sec if closed_section else (n_sec - 1)

        frames = []
        arc_s = [0.0]
        for i in range(n_rings):
            if i == 0:
                tang = v_norm(v_sub(curve_pts[1], curve_pts[0]))
            elif i == n_rings - 1:
                tang = v_norm(v_sub(curve_pts[-1], curve_pts[-2]))
            else:
                tang = v_norm(v_sub(curve_pts[i + 1], curve_pts[i - 1]))
            if i > 0:
                arc_s.append(arc_s[-1] + v_len(v_sub(curve_pts[i], curve_pts[i - 1])))
            right = v_norm(v_cross(up_hint, tang))
            if v_len(right) < 1e-5:
                right = (1.0, 0.0, 0.0)
            up = v_norm(v_cross(tang, right))
            frames.append((right, up, tang))

        rings_3d = []
        for i, pt in enumerate(curve_pts):
            right, up, _ = frames[i]
            ring = []
            for su, sv in section_2d:
                p = v_add(pt, v_add(v_scale(right, su), v_scale(up, sv)))
                if miter_z_ends and (i == 0 or i == n_rings - 1):
                    p = (p[0], p[1], pt[2])
                ring.append(p)
            rings_3d.append(ring)

        for k in range(seg_count):
            kn = (k + 1) % n_sec
            # Determine consistent facet orientation on mid-ring
            mid_i = max(0, (n_rings - 1) // 2)
            p0_m, p1_m = rings_3d[mid_i][k], rings_3d[mid_i][kn]
            p2_m, p3_m = rings_3d[mid_i + 1][kn], rings_3d[mid_i + 1][k]
            n_test = tri_normal(p0_m, p1_m, p2_m)
            mid_quad = v_scale(v_add(v_add(p0_m, p1_m), v_add(p2_m, p3_m)), 0.25)
            mid_curve = v_scale(v_add(curve_pts[mid_i], curve_pts[mid_i + 1]), 0.5)
            flip = v_dot(n_test, v_sub(mid_quad, mid_curve)) < 0
            edge_w = v_len(v_sub(p1_m, p0_m)) * uv_scale

            strip_idx = []
            for i in range(n_rings):
                ni = min(i, n_rings - 2)
                pa, pb = rings_3d[ni][k], rings_3d[ni][kn]
                pc, pd = rings_3d[ni + 1][kn], rings_3d[ni + 1][k]
                nf = tri_normal(pb, pa, pd) if flip else tri_normal(pa, pb, pc)
                s_uv = arc_s[i] * uv_scale
                if flip:
                    ia = self.add_vert(rings_3d[i][kn], nf, (0.0, s_uv))
                    ib = self.add_vert(rings_3d[i][k], nf, (edge_w, s_uv))
                else:
                    ia = self.add_vert(rings_3d[i][k], nf, (0.0, s_uv))
                    ib = self.add_vert(rings_3d[i][kn], nf, (edge_w, s_uv))
                strip_idx.append((ia, ib))

            for i in range(n_rings - 1):
                i0_a, i0_b = strip_idx[i]
                i1_a, i1_b = strip_idx[i + 1]
                self.indices.extend((i0_a, i0_b, i1_b, i0_a, i1_b, i1_a))


def mirror_profile_x(profile_right):
    """Mirrors a right-side (+X) 2D profile to left-side (-X) and reverses order to keep orientation."""
    return [(-x, y) for (x, y) in reversed(profile_right)]


# ---------------------------------------------------------------------------
# Scene Component Builders
# ---------------------------------------------------------------------------
def build_viaduct_barriers_and_deck(m_concrete, m_ground, m_amber, m_dark_metal, m_metro_glow):
    """
    1. Sculpted concrete viaduct parapets & F-shape Jersey barriers at X = +-9.4
       with warm-amber reflector studs & expansion pilasters.
    2. Cantilevered viaduct deck edge, palm boulevard terrace, battered concrete
       retaining walls, and elevated LA Metro parallel rail viaduct silhouette.
    """
    # A. Right-side (+X) F-shape Concrete Jersey Barrier & Viaduct Parapet (X = 9.25..10.02, Y = 0..1.18)
    # Strictly >= 9.25 so X in [-9.2, +9.2] is 100% untouched!
    barrier_right = [
        (9.25, 0.00),
        (9.25, 0.12),   # vertical curb toe
        (9.44, 0.38),   # F-shape lower sloped toe deflecting tires
        (9.54, 1.06),   # upper battered parapet face
        (9.58, 1.18),   # chamfered top inner lip
        (9.94, 1.18),   # flat parapet top coping
        (10.02, 1.06),  # outer bevel
        (10.02, 0.00),  # outer vertical parapet back
    ]
    m_concrete.extrude_profile_z(barrier_right, Z_MIN, Z_MAX, z_steps=8, closed_loop=True)
    m_concrete.extrude_profile_z(mirror_profile_x(barrier_right), Z_MIN, Z_MAX, z_steps=8, closed_loop=True)

    # B. Cantilevered Viaduct Structural Apron, Walkway & Deep Box-Girder Fascia (X = 9.24..11.85)
    apron_right = [
        (9.24, -0.02),
        (11.75, -0.02),   # outer cantilevered viaduct maintenance walkway
        (11.88, -0.16),   # cantilevered drip-edge cornice
        (11.88, -0.52),   # upper edge-beam fascia
        (11.35, -0.88),   # sculpted underside chamfer
        (10.85, -1.75),   # deep viaduct box-girder web
        (9.24, -1.75),
    ]
    m_concrete.extrude_profile_z(apron_right, Z_MIN, Z_MAX, z_steps=6, closed_loop=True)
    m_concrete.extrude_profile_z(mirror_profile_x(apron_right), Z_MIN, Z_MAX, z_steps=6, closed_loop=True)

    # C. Outer Urban Shoulder, Palm Boulevard Promenade & Battered Retaining Walls (X = 11.4..31.5)
    terrace_right = [
        (11.40, -1.62),
        (12.25, -1.62),
        (12.55, -0.45),   # inner low concrete terrace wall crest
        (12.95, -0.45),
        (13.15, -1.60),   # drop into planted California fan-palm boulevard terrace
        (22.10, -1.60),   # wide palm boulevard median
        (22.55, 1.15),    # battered urban retaining wall rising beside LA river/metro embankment
        (23.35, 1.15),    # retaining wall coping cap
        (23.55, 0.35),
        (31.50, 0.35),    # outer urban embankment ground shelf
        (31.50, -2.40),
        (11.40, -2.40),
    ]
    m_ground.extrude_profile_z(terrace_right, Z_MIN, Z_MAX, z_steps=6, closed_loop=True)
    m_ground.extrude_profile_z(mirror_profile_x(terrace_right), Z_MIN, Z_MAX, z_steps=6, closed_loop=True)

    # D. Parapet Expansion Pilasters, Open Drainage Scupper Trim & Glowing Warm-Amber Reflector Studs
    stud_zs = [-6.0, -2.0, 2.0, 6.0]
    for side in (-1.0, 1.0):
        for zs in stud_zs:
            # Sculpted concrete pilaster rib straddling the parapet every 4m
            m_concrete.add_box(side * 9.76, 0.62, zs, 0.56, 1.24, 0.42, skip_bottom=True)
            # Cantilevered under-deck rib bracket every 4m
            m_concrete.add_box(side * 11.15, -0.72, zs, 1.25, 0.55, 0.38)

            # Highway reflector bracket housing (dark anodized steel) on sloped barrier face
            m_dark_metal.add_box(side * 9.46, 0.72, zs, 0.10, 0.16, 0.28)
            # Glowing warm-amber bidirectional reflector lens (visible from camera looking -Z)
            m_amber.add_box(side * 9.40, 0.72, zs, 0.06, 0.12, 0.22)

            # Low curb retro-reflector tab near road edge (X = +-9.28, Y = 0.20), spaced every 4m
            m_amber.add_box(side * 9.28, 0.20, zs + 1.6, 0.05, 0.06, 0.30)

        # Warm terrace step-light strip tucked into the outer boulevard retaining wall at X = +-22.3
        for z_seg in (-4.0, 4.0):
            m_metro_glow.add_box(side * 22.28, 0.58, z_seg, 0.08, 0.09, 5.6)

    # E. Parallel Elevated LA Metro Rail Viaduct Deck Silhouette (X = +-26.2, asymmetric heights)
    for side, deck_y in ((-1.0, 2.15), (1.0, 2.85)):
        cx = side * 26.2
        # Continuous concrete box-girder guideway spanning Z in [-8, +8]
        guideway = [
            (cx - 1.95, deck_y),
            (cx + 1.95, deck_y),
            (cx + 2.05, deck_y - 0.28),
            (cx + 1.45, deck_y - 1.15),
            (cx - 1.45, deck_y - 1.15),
            (cx - 2.05, deck_y - 0.28),
        ]
        if side < 0:
            # Ensure consistent CCW profile
            pass
        m_concrete.extrude_profile_z(guideway, Z_MIN, Z_MAX, z_steps=4, closed_loop=True)

        # Low concrete edge parapets on the elevated metro deck
        for edge_s in (-1.82, 1.82):
            rail_prof = [
                (cx + edge_s - 0.12, deck_y),
                (cx + edge_s + 0.12, deck_y),
                (cx + edge_s + 0.10, deck_y + 0.52),
                (cx + edge_s - 0.10, deck_y + 0.52),
            ]
            m_concrete.extrude_profile_z(rail_prof, Z_MIN, Z_MAX, z_steps=4, closed_loop=True)

        # Continuous glowing warm coral-amber architectural edge trim facing the highway
        face_x = cx - side * 2.02
        m_metro_glow.add_box(face_x, deck_y - 0.14, 0.0, 0.07, 0.10, 16.0)

        # Hammerhead T-pier supporting the elevated metro deck (staggered L/R)
        pier_z = -3.8 if side < 0 else 3.8
        col_h = (deck_y - 1.15) - 0.25
        if col_h > 0.2:
            m_concrete.add_box(cx, 0.25 + col_h * 0.5, pier_z, 1.15, col_h, 1.35, skip_bottom=True)
            m_concrete.add_box(cx, deck_y - 1.25, pier_z, 2.75, 0.48, 1.55)

        # Overhead OCS Catenary T-Mast & Continuous Contact Wire along the Metro Guideway
        mast_y0 = deck_y + 0.45
        mast_y1 = deck_y + 3.45
        m_dark_metal.add_box(cx, (mast_y0 + mast_y1) * 0.5, pier_z, 0.18, mast_y1 - mast_y0, 0.18, skip_bottom=True)
        m_dark_metal.add_box(cx, mast_y1 - 0.15, pier_z, 2.50, 0.12, 0.14)
        # Twin continuous contact wires spanning Z in [-8, +8]
        for wx in (-0.85, 0.85):
            m_dark_metal.add_strut((cx + wx, mast_y1 - 0.28, Z_MIN), (cx + wx, mast_y1 - 0.28, Z_MAX), 0.025, 0.025, sides=4)


def build_sixth_street_viaduct_arches(m_arch_steel, m_concrete, m_dark_metal, m_arch_glow):
    """
    Graceful paired Sixth-Street-Viaduct ("Ribbon of Light") canted concrete/steel parabolic arch ribs
    outside the barriers (X = +-10.22..11.45), seamless V-pier knuckles at Z = +-8.0,
    slender vertical hanger cables, cross-tie struts, and warm golden-coral uplighting ribbons!
    """
    n_steps = 26
    # Chamfered hexagonal/octagonal sculptural rib cross-section
    main_rib_sec = [
        (-0.26, -0.32),
        (0.26, -0.32),
        (0.34, -0.10),
        (0.28, 0.28),
        (-0.28, 0.28),
        (-0.34, -0.10),
    ]
    comp_rib_sec = [
        (-0.18, -0.22),
        (0.18, -0.22),
        (0.24, 0.00),
        (0.18, 0.20),
        (-0.18, 0.20),
        (-0.24, 0.00),
    ]
    # Warm golden-coral uplight ribbon tucked along the inner-bottom bevel of each arch
    glow_sec_left = [
        (0.16, -0.36),
        (0.35, -0.16),
        (0.30, -0.06),
        (0.10, -0.28),
    ]
    glow_sec_right = [(-u, v) for (u, v) in reversed(glow_sec_left)]

    for side in (-1.0, 1.0):
        main_curve = []
        comp_curve = []
        for i in range(n_steps + 1):
            z = Z_MIN + (Z_MAX - Z_MIN) * (i / float(n_steps))
            t = z / 8.0  # -1.0 .. +1.0
            arch_parabola = 1.0 - t * t  # 0 at +-8m piers, 1.0 at Z=0 crown

            # Primary arch springs from X = +-10.22, Y = 1.12 at piers, leaning gracefully outward
            # to X = +-11.38, Y = 9.15 at crown (iconic Sixth Street outward-canted Ribbon of Light!)
            x_main = side * (10.22 + 1.16 * arch_parabola)
            y_main = 1.12 + 8.03 * arch_parabola
            main_curve.append((x_main, y_main, z))

            # Paired companion outer arch rib (curving slightly lower & wider, joined by steel struts)
            x_comp = side * (11.12 + 0.52 * arch_parabola)
            y_comp = 0.72 + 6.75 * arch_parabola
            comp_curve.append((x_comp, y_comp, z))

        m_arch_steel.sweep_section_along_curve(main_curve, main_rib_sec, closed_section=True, miter_z_ends=True)
        m_arch_steel.sweep_section_along_curve(comp_curve, comp_rib_sec, closed_section=True, miter_z_ends=True)

        # Continuous golden-coral uplighting strip along the inner/under curve of both ribs!
        g_sec = glow_sec_left if side < 0 else glow_sec_right
        m_arch_glow.sweep_section_along_curve(main_curve, g_sec, closed_section=True, miter_z_ends=True)

        comp_glow_sec = [(u * 0.72, v * 0.72) for (u, v) in g_sec]
        m_arch_glow.sweep_section_along_curve(comp_curve, comp_glow_sec, closed_section=True, miter_z_ends=True)

        # Cross-tie steel bracing struts linking the paired Sixth-Street arch ribs + vertical hanger cables
        tie_zs = [-5.4, -2.7, 0.0, 2.7, 5.4]
        for tz in tie_zs:
            t = tz / 8.0
            ap = 1.0 - t * t
            p_main = (side * (10.22 + 1.16 * ap), 1.12 + 8.03 * ap, tz)
            p_comp = (side * (11.12 + 0.52 * ap), 0.72 + 6.75 * ap, tz)
            m_dark_metal.add_strut(p_main, p_comp, 0.09, 0.09, sides=6)

            # Vertical stainless steel hanger cable dropping from primary arch to viaduct edge beam
            p_deck = (side * 10.65, 0.02, tz)
            m_dark_metal.add_strut(p_deck, (p_main[0], p_main[1] - 0.24, tz), 0.042, 0.042, sides=6)
            # Deck cable anchor socket collar
            m_arch_steel.add_box(side * 10.65, 0.14, tz, 0.24, 0.26, 0.24, skip_bottom=True)

        # Seamless Split Concrete V-Pier Knuckles at Z = -8.0 and Z = +8.0
        # Half-knuckle at Z in [-8.0, -7.15] and [+7.15, +8.0] so adjacent tiles form one sculpted pier!
        for z_center, z_len in ((-7.55, 0.90), (7.55, 0.90)):
            m_concrete.add_box(side * 10.68, -0.15, z_center, 1.65, 2.85, z_len)
            # Angled concrete pier buttress dropping down to the promenade (-1.65m)
            m_concrete.add_strut(
                (side * 11.15, -1.65, z_center),
                (side * 10.55, 1.10, z_center),
                0.52, 0.42, sides=6
            )
            # Uplight fixture bar at the springline knuckle
            m_arch_glow.add_box(side * 10.12, 1.28, z_center, 0.16, 0.14, z_len * 0.75)


def build_cobra_streetlamps(m_dark_metal, m_sodium_glow, m_concrete):
    """
    Cantilevered twin-arm LA highway cobra streetlamps with glowing warm sodium-vapor luminaire heads.
    Staggered at Z = -3.6 (Left) and Z = +3.6 (Right).
    Roadway luminaire head sits at X = +-7.35, Y = 9.22m — well above Y >= 7.8m clearance!
    """
    placements = [
        (-1.0, -3.6),
        (1.0, 3.6),
    ]
    for side, z_pole in placements:
        pole_x = side * 10.18
        # Concrete bolt pedestal anchored on viaduct edge walkway
        m_concrete.add_box(pole_x, 0.55, z_pole, 0.56, 1.15, 0.56, skip_bottom=True)

        # Tall tapered 8-sided steel mast (Y = 1.10 .. 9.35m)
        m_dark_metal.add_strut((pole_x, 1.10, z_pole), (pole_x, 9.35, z_pole), 0.16, 0.095, sides=8, cap_ends=True)

        # 1. Longer Inward Highway Cobra Arm (curves smoothly up to Y=9.72 and inward to X=+-7.35, Y=9.42)
        arm_in_pts = []
        n_arm = 8
        for i in range(n_arm + 1):
            u = i / float(n_arm)
            ax = pole_x - side * (2.83 * u)
            ay = 8.85 + 0.85 * math.sin(u * math.pi * 0.68) + 0.32 * u
            arm_in_pts.append((ax, ay, z_pole))

        arm_sec = [
            (-0.055, -0.065),
            (0.055, -0.065),
            (0.055, 0.065),
            (-0.055, 0.065),
        ]
        m_dark_metal.sweep_section_along_curve(arm_in_pts, arm_sec, closed_section=True)
        # Diagonal under-brace gusset near mast
        m_dark_metal.add_strut((pole_x, 8.25, z_pole), arm_in_pts[3], 0.04, 0.035, sides=6)

        # Aerodynamic LA Cobra-Head Luminaire Housing (Inner Highway Head at X = +-7.35, Y = 9.40)
        tip_in = arm_in_pts[-1]
        head_x = tip_in[0] - side * 0.22
        head_y = tip_in[1] - 0.02
        m_dark_metal.add_box(head_x, head_y + 0.06, z_pole, 0.94, 0.14, 0.44)
        m_dark_metal.add_box(head_x - side * 0.12, head_y + 0.13, z_pole, 0.56, 0.08, 0.32)
        # Glowing Warm High-Pressure Sodium-Vapor Prismatic Drop Refractor Lens (Y >= 9.18m >> 7.8m!)
        m_sodium_glow.add_strut(
            (head_x - side * 0.05, head_y - 0.01, z_pole),
            (head_x - side * 0.05, head_y - 0.14, z_pole),
            0.34, 0.20, sides=6, cap_ends=True
        )

        # 2. Shorter Outward Boulevard Cobra Arm (illuminating the California fan-palm promenade)
        arm_out_pts = []
        for i in range(7):
            u = i / 6.0
            ax = pole_x + side * (2.15 * u)
            ay = 8.65 + 0.62 * math.sin(u * math.pi * 0.65) + 0.22 * u
            arm_out_pts.append((ax, ay, z_pole))

        m_dark_metal.sweep_section_along_curve(arm_out_pts, arm_sec, closed_section=True)
        m_dark_metal.add_strut((pole_x, 8.15, z_pole), arm_out_pts[2], 0.036, 0.032, sides=6)
        tip_out = arm_out_pts[-1]
        o_head_x = tip_out[0] + side * 0.18
        o_head_y = tip_out[1] - 0.02
        m_dark_metal.add_box(o_head_x, o_head_y + 0.05, z_pole, 0.76, 0.13, 0.38)
        m_sodium_glow.add_strut(
            (o_head_x + side * 0.04, o_head_y - 0.01, z_pole),
            (o_head_x + side * 0.04, o_head_y - 0.12, z_pole),
            0.26, 0.15, sides=6, cap_ends=True
        )


def add_california_fan_palm(
    m_trunk, m_fronds, m_concrete, m_amber,
    base_x, base_y, base_z, height, lean_x, lean_z, seed_angle
):
    """
    Sculpted *Washingtonia robusta* California Fan-Palm:
    - Concrete planter well on the boulevard terrace with warm architectural uplight accent
    - 14-segment tapered organic curved 10-sided trunk with shared ring vertices & bark UVs
    - Shaggy fibrous petiole crownshaft ("petticoat") below crown
    - 18 multi-segment 3D pleated fan-palm fronds in 3 natural radiating/drooping tiers
    """
    # Tree planter curb box on the boulevard terrace
    m_concrete.add_box(base_x, base_y + 0.24, base_z, 1.85, 0.48, 1.85, skip_bottom=True)
    m_amber.add_box(base_x - (0.94 if base_x > 0 else -0.94), base_y + 0.36, base_z, 0.06, 0.10, 0.95)

    # Curved tapered trunk with shared smooth ring vertices
    n_rings = 14
    sides = 10
    ring_vert_idx = []
    for r in range(n_rings + 1):
        t = r / float(n_rings)
        curve = t * t * (1.25 - 0.25 * t)
        cx = base_x + lean_x * curve
        cz = base_z + lean_z * curve
        cy = base_y + 0.35 + height * t
        rad = 0.41 * ((1.0 - t) ** 1.8) + 0.175 + 0.016 * math.sin(t * 30.0)
        v_coord = r * 0.38

        row = []
        for s in range(sides + 1):
            ang = (2.0 * math.pi * (s % sides)) / float(sides)
            nx, nz = math.cos(ang), math.sin(ang)
            pos = (cx + nx * rad, cy, cz + nz * rad)
            norm = v_norm((nx, 0.08, nz))
            u_coord = s / float(sides)
            row.append(m_trunk.add_vert(pos, norm, (u_coord, v_coord)))
        ring_vert_idx.append(row)

    for r in range(n_rings):
        for s in range(sides):
            i0 = ring_vert_idx[r][s]
            i1 = ring_vert_idx[r][s + 1]
            i2 = ring_vert_idx[r + 1][s + 1]
            i3 = ring_vert_idx[r + 1][s]
            # Outward CCW check: at s=0 (nx=+1), s=1 (nz>0), r+1 (y higher):
            # (p1-p0) is +Z, (p2-p0) is +Y -> (+Z) x (+Y) = (-X), so reverse to (i1, i0, i3, i2)!
            m_trunk.indices.extend((i1, i0, i3, i1, i3, i2))

    top_x = base_x + lean_x
    top_y = base_y + 0.35 + height
    top_z = base_z + lean_z

    # Shaggy fibrous petiole skirt ("California fan-palm petticoat") just under the frond crown
    skirt_h = 1.70
    m_trunk.add_strut(
        (top_x, top_y - skirt_h, top_z),
        (top_x, top_y - 0.12, top_z),
        0.34, 0.50, sides=9, cap_ends=True
    )

    # Crown heart bulb
    m_fronds.add_strut(
        (top_x, top_y - 0.20, top_z),
        (top_x, top_y + 0.58, top_z),
        0.44, 0.22, sides=8, cap_ends=True
    )

    # 18 Lush Arched 3D Fan-Palm Fronds in 3 Tiers (crown burst + spreading mid-ring + drooping silhouette skirt)
    tiers = [
        # (count, launch_pitch, droop_gravity, length, fan_half_width, y_offset, az_offset)
        (5, 0.92, 0.95, 2.15, 0.58, 0.42, 0.18),
        (7, 0.52, 1.38, 2.50, 0.70, 0.20, 0.0),
        (6, 0.10, 1.82, 2.25, 0.62, -0.12, 0.44),
    ]
    for count, pitch, droop, f_len, f_half_w, y_off, az_off in tiers:
        for fi in range(count):
            az = seed_angle + az_off + (2.0 * math.pi * fi) / float(count)
            az += 0.08 * math.sin(fi * 2.7 + seed_angle)
            dir_x = math.cos(az)
            dir_z = math.sin(az)
            side_x = -dir_z
            side_z = dir_x

            f_segs = 5
            spine_idx = []
            left_idx = []
            right_idx = []
            n_left = v_norm((side_x * 0.35, 0.92, side_z * 0.35))
            n_right = v_norm((-side_x * 0.35, 0.92, -side_z * 0.35))

            for s in range(f_segs + 1):
                u = s / float(f_segs)
                reach = f_len * u
                fy = top_y + y_off + math.sin(pitch) * reach - droop * (u ** 2.15)
                fx = top_x + dir_x * (0.18 + reach * 0.92)
                fz = top_z + dir_z * (0.18 + reach * 0.92)

                if u < 0.25:
                    w = 0.07 + 0.25 * (u / 0.25) * f_half_w
                else:
                    fan_u = (u - 0.25) / 0.75
                    w = f_half_w * math.sin(fan_u * math.pi * 0.82 + 0.22)

                fold_drop = 0.17 * math.sin(u * math.pi)
                sp_p = (fx, fy + 0.06, fz)
                le_p = (fx + side_x * w, fy - fold_drop, fz + side_z * w)
                ri_p = (fx - side_x * w, fy - fold_drop, fz - side_z * w)

                spine_idx.append((
                    m_fronds.add_vert(sp_p, n_left, (0.5, u)),
                    m_fronds.add_vert(sp_p, n_right, (0.5, u)),
                ))
                left_idx.append(m_fronds.add_vert(le_p, n_left, (0.0, u)))
                right_idx.append(m_fronds.add_vert(ri_p, n_right, (1.0, u)))

            for s in range(f_segs):
                sp0_l, sp0_r = spine_idx[s]
                sp1_l, sp1_r = spine_idx[s + 1]
                le0, le1 = left_idx[s], left_idx[s + 1]
                ri0, ri1 = right_idx[s], right_idx[s + 1]
                m_fronds.indices.extend((sp0_l, le0, le1, sp0_l, le1, sp1_l))
                m_fronds.indices.extend((ri0, sp0_r, sp1_r, ri0, sp1_r, ri1))


# ---------------------------------------------------------------------------
# GLB Binary Serializer & Validator
# ---------------------------------------------------------------------------
def pad4(data, pad_byte=b"\x00"):
    rem = len(data) % 4
    return data if rem == 0 else data + pad_byte * (4 - rem)


def export_glb(out_path, meshes, materials, images_png):
    bin_blob = bytearray()
    buffer_views = []
    accessors = []
    gltf_meshes = []
    gltf_nodes = []

    def append_bv(raw_bytes, target=None):
        while len(bin_blob) % 4 != 0:
            bin_blob.append(0)
        offset = len(bin_blob)
        bin_blob.extend(raw_bytes)
        bv = {
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": len(raw_bytes),
        }
        if target is not None:
            bv["target"] = target
        idx = len(buffer_views)
        buffer_views.append(bv)
        return idx

    total_verts = 0
    total_tris = 0

    for mb in meshes:
        if not mb.positions or not mb.indices:
            continue
        v_count = len(mb.positions)
        total_verts += v_count
        total_tris += len(mb.indices) // 3

        # Verify strict Night Drive roadway & HELI WIDE camera clearance!
        for (vx, vy, vz) in mb.positions:
            if -9.2 < vx < 9.2 and -0.1 <= vy < 7.8:
                raise AssertionError(
                    f"CLEARANCE VIOLATION in {mb.name}: vertex ({vx:.2f}, {vy:.2f}, {vz:.2f}) "
                    f"intrudes into roadway corridor X in [-9.2, +9.2], Y in [0, 7.8]!"
                )
            if vz < Z_MIN - 0.05 or vz > Z_MAX + 0.05:
                raise AssertionError(
                    f"Z-TILE BOUNDS VIOLATION in {mb.name}: vz={vz:.2f} outside [{Z_MIN}, {Z_MAX}]!"
                )

        pos_bytes = bytearray()
        norm_bytes = bytearray()
        uv_bytes = bytearray()
        xs = [p[0] for p in mb.positions]
        ys = [p[1] for p in mb.positions]
        zs = [p[2] for p in mb.positions]

        for p in mb.positions:
            pos_bytes.extend(struct.pack("<3f", p[0], p[1], p[2]))
        for n in mb.normals:
            norm_bytes.extend(struct.pack("<3f", n[0], n[1], n[2]))
        for uv in mb.uvs:
            uv_bytes.extend(struct.pack("<2f", uv[0], uv[1]))

        use_u32 = v_count > 65535
        idx_bytes = bytearray()
        if use_u32:
            for ix in mb.indices:
                idx_bytes.extend(struct.pack("<I", ix))
        else:
            for ix in mb.indices:
                idx_bytes.extend(struct.pack("<H", ix))

        bv_pos = append_bv(pos_bytes, target=34962)
        bv_norm = append_bv(norm_bytes, target=34962)
        bv_uv = append_bv(uv_bytes, target=34962)
        bv_idx = append_bv(idx_bytes, target=34963)

        acc_pos = len(accessors)
        accessors.append({
            "bufferView": bv_pos,
            "componentType": 5126,
            "count": v_count,
            "type": "VEC3",
            "min": [min(xs), min(ys), min(zs)],
            "max": [max(xs), max(ys), max(zs)],
        })
        acc_norm = len(accessors)
        accessors.append({
            "bufferView": bv_norm,
            "componentType": 5126,
            "count": v_count,
            "type": "VEC3",
        })
        acc_uv = len(accessors)
        accessors.append({
            "bufferView": bv_uv,
            "componentType": 5126,
            "count": v_count,
            "type": "VEC2",
        })
        acc_idx = len(accessors)
        accessors.append({
            "bufferView": bv_idx,
            "componentType": 5125 if use_u32 else 5123,
            "count": len(mb.indices),
            "type": "SCALAR",
        })

        mesh_idx = len(gltf_meshes)
        gltf_meshes.append({
            "name": f"{mb.name}_Mesh",
            "primitives": [{
                "attributes": {
                    "POSITION": acc_pos,
                    "NORMAL": acc_norm,
                    "TEXCOORD_0": acc_uv,
                },
                "indices": acc_idx,
                "material": mb.material_index,
            }],
        })
        gltf_nodes.append({
            "name": mb.name,
            "mesh": mesh_idx,
        })

    gltf_images = []
    gltf_textures = []
    for img_name, png_bytes in images_png:
        bv_img = append_bv(png_bytes, target=None)
        img_idx = len(gltf_images)
        gltf_images.append({
            "bufferView": bv_img,
            "mimeType": "image/png",
            "name": img_name,
        })
        gltf_textures.append({
            "sampler": 0,
            "source": img_idx,
        })

    bin_padded = pad4(bytes(bin_blob), b"\x00")

    root_node_idx = len(gltf_nodes)
    child_indices = list(range(root_node_idx))
    gltf_nodes.append({
        "name": "night-drive-city",
        "children": child_indices,
    })

    gltf_dict = {
        "asset": {
            "version": "2.0",
            "generator": "NightDrive Procedural Viaduct Builder (build_road_drive.py)",
        },
        "extensionsUsed": ["KHR_materials_emissive_strength"],
        "scene": 0,
        "scenes": [{"name": "Scene", "nodes": [root_node_idx]}],
        "nodes": gltf_nodes,
        "meshes": gltf_meshes,
        "materials": materials,
        "textures": gltf_textures,
        "images": gltf_images,
        "samplers": [{
            "magFilter": 9729,
            "minFilter": 9987,
            "wrapS": 10497,
            "wrapT": 10497,
        }],
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_padded)}],
    }

    json_raw = json.dumps(gltf_dict, separators=(",", ":")).encode("utf-8")
    json_padded = pad4(json_raw, b" ")

    total_len = 12 + 8 + len(json_padded) + 8 + len(bin_padded)
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<I4s", len(json_padded), b"JSON"))
        f.write(json_padded)
        f.write(struct.pack("<I4s", len(bin_padded), b"BIN\x00"))
        f.write(bin_padded)

    print(
        f"[build_road_drive] Wrote {out_path}\n"
        f"  Size: {total_len:,} bytes ({total_len / 1024.0:.1f} KB)\n"
        f"  Nodes: {len(child_indices)} | Vertices: {total_verts:,} | Triangles: {total_tris:,}"
    )


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_glb = os.path.join(repo_root, "assets", "models", "night-drive-city.glb")

    images_png = [
        ("viaduct_concrete_base", build_concrete_png()),
        ("california_palm_bark", build_palm_bark_png()),
    ]

    # Clean PBR MeshStandardMaterials tuned for LA Dusk / *Drive* (2011) lighting & HDR Bloom
    materials = [
        # 0: Viaduct Architectural Concrete (warm dusk sandstone-lavender tint + board-form texture)
        {
            "name": "Viaduct_Concrete",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "baseColorFactor": [0.38, 0.28, 0.36, 1.0],
                "metallicFactor": 0.16,
                "roughnessFactor": 0.68,
            },
        },
        # 1: Sixth-Street-Viaduct Sculpted Arch Steel-Concrete Composite
        {
            "name": "Viaduct_Arch_Rib",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "baseColorFactor": [0.54, 0.39, 0.46, 1.0],
                "metallicFactor": 0.48,
                "roughnessFactor": 0.36,
            },
            "emissiveFactor": [0.09, 0.03, 0.04],
        },
        # 2: Expressway Dark Anodized Steel (Cobra poles, cable hangers, brackets, Metro OCS)
        {
            "name": "Expressway_DarkSteel",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.15, 0.12, 0.19, 1.0],
                "metallicFactor": 0.78,
                "roughnessFactor": 0.30,
            },
        },
        # 3: Urban Shoulder & Promenade Terrace Ground
        {
            "name": "Urban_Terrace_Ground",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "baseColorFactor": [0.19, 0.12, 0.21, 1.0],
                "metallicFactor": 0.22,
                "roughnessFactor": 0.76,
            },
        },
        # 4: California Fan-Palm Ringed Trunk & Petticoat Skirt
        {
            "name": "California_Palm_Trunk",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 1},
                "baseColorFactor": [0.34, 0.22, 0.24, 1.0],
                "metallicFactor": 0.08,
                "roughnessFactor": 0.84,
            },
        },
        # 5: California Fan-Palm Frond Crowns (warm dusk silhouette olive-plum catching sunset rim)
        {
            "name": "California_Palm_Fronds",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.14, 0.16, 0.15, 1.0],
                "metallicFactor": 0.14,
                "roughnessFactor": 0.56,
            },
            "emissiveFactor": [0.04, 0.02, 0.03],
        },
        # 6: Glowing Warm-Amber Barrier Reflector Studs
        {
            "name": "Glow_Amber_Reflectors",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 0.72, 0.24, 1.0],
                "metallicFactor": 0.10,
                "roughnessFactor": 0.20,
            },
            "emissiveFactor": [1.0, 0.66, 0.18],
            "extensions": {
                "KHR_materials_emissive_strength": {"emissiveStrength": 1.85},
            },
        },
        # 7: Sixth-Street-Viaduct Golden-Coral Ribbon Uplighting Strips
        {
            "name": "Glow_SixthSt_Uplight",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 0.56, 0.36, 1.0],
                "metallicFactor": 0.12,
                "roughnessFactor": 0.24,
            },
            "emissiveFactor": [1.0, 0.48, 0.28],
            "extensions": {
                "KHR_materials_emissive_strength": {"emissiveStrength": 1.72},
            },
        },
        # 8: High-Pressure Warm Sodium-Vapor Cobra Streetlamp Luminaires
        {
            "name": "Glow_Sodium_Vapor",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 0.88, 0.62, 1.0],
                "metallicFactor": 0.05,
                "roughnessFactor": 0.15,
            },
            "emissiveFactor": [1.0, 0.82, 0.46],
            "extensions": {
                "KHR_materials_emissive_strength": {"emissiveStrength": 2.25},
            },
        },
        # 9: Outer Metro Deck & Retaining Wall Coral-Amber Architectural Strip Lights
        {
            "name": "Glow_Metro_Strip",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1.0, 0.60, 0.42, 1.0],
                "metallicFactor": 0.15,
                "roughnessFactor": 0.28,
            },
            "emissiveFactor": [1.0, 0.52, 0.34],
            "extensions": {
                "KHR_materials_emissive_strength": {"emissiveStrength": 1.48},
            },
        },
    ]

    m_concrete = MeshBuilder("ViaductConcrete", 0)
    m_arch_steel = MeshBuilder("ViaductArchRibs", 1)
    m_dark_metal = MeshBuilder("ExpresswaySteel", 2)
    m_ground = MeshBuilder("UrbanPromenadeDeck", 3)
    m_trunk = MeshBuilder("PalmTrunks", 4)
    m_fronds = MeshBuilder("PalmFronds", 5)
    m_amber = MeshBuilder("BarrierReflectors", 6)
    m_arch_glow = MeshBuilder("ViaductArchGlow", 7)
    m_sodium = MeshBuilder("CobraSodiumLamps", 8)
    m_metro_glow = MeshBuilder("MetroDeckAccents", 9)

    # 1. Viaduct Jersey barriers, cantilevered deck, boulevard terrace & parallel Metro rail deck
    build_viaduct_barriers_and_deck(m_concrete, m_ground, m_amber, m_dark_metal, m_metro_glow)

    # 2. Iconic Sixth-Street-Viaduct paired concrete/steel arches & golden-coral uplighting ribbons
    build_sixth_street_viaduct_arches(m_arch_steel, m_concrete, m_dark_metal, m_arch_glow)

    # 3. Cantilevered twin-arm LA highway cobra streetlamps
    build_cobra_streetlamps(m_dark_metal, m_sodium, m_concrete)

    # 4. Staggered California Fan-Palms (*Washingtonia robusta*) along left & right boulevard terraces
    palms = [
        # (base_x, base_y, base_z, height, lean_x, lean_z, seed_angle)
        (-14.6, -1.60, 2.55, 17.6, 0.55, 0.12, 0.32),
        (14.9, -1.60, -2.45, 18.4, -0.60, -0.10, 1.18),
        (-19.5, -1.60, -4.40, 14.9, -0.45, 0.15, 2.05),
        (20.1, -1.60, 4.35, 15.8, 0.48, -0.14, 0.76),
    ]
    for p in palms:
        add_california_fan_palm(m_trunk, m_fronds, m_concrete, m_amber, *p)

    all_meshes = [
        m_concrete,
        m_arch_steel,
        m_dark_metal,
        m_ground,
        m_trunk,
        m_fronds,
        m_amber,
        m_arch_glow,
        m_sodium,
        m_metro_glow,
    ]
    export_glb(out_glb, all_meshes, materials, images_png)


if __name__ == "__main__":
    main()
