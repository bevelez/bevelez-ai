#!/usr/bin/env python3
"""
Builds assets/models/night-drive-windmill.glb for Night Drive Option 5 ("WINDMILL SUNSET").

Generates a 24m seamless Z-tiling California Mountain Pass Wind Farm segment (Z in [-12, +12]):
  - Galvanized steel corrugated W-beam highway guardrails at X = +/-9.48 with steel I-posts,
    glowing golden-amber reflector tabs, and desert highway milepost delineators.
  - Three staggered modern 3-blade wind turbines:
      * Left primary turbine (X = -18.0, Z = -5.2, yaw = +14 deg) -> child node Windmill_Rotor_L
      * Right primary turbine (X = +20.6, Z = +6.2, yaw = -12 deg) -> child node Windmill_Rotor_R
      * Outer-pass slope turbine (X = -34.6, Z = +4.6, yaw = +9 deg) -> child node Windmill_Rotor_Outer
    Each rotor node sits inside a yawed Turbine_Pivot_* transform with local origin (0, 0, 0)
    centered on the hub axle and 3 tapered, pitch-twisted airfoil blades in its local XY plane
    so main.js's `rotor.rotation.z -= rotorSpeed` spins every turbine cleanly with zero wobble.
  - High-voltage lattice steel H-frame transmission tower at X = +13.65, Z = -2.0 with ceramic
    insulator strings, 5 continuous sagging catenary phase conductors + 2 shield wires spanning
    Z in [-12, +12] with exact periodic boundary continuity, and an aviation marker sphere.
  - Stratified Mojave red-gold sandstone boulder outcrops, gnarled branching Joshua trees
    (Yucca brevifolia), and desert yucca rosettes anchored cleanly to the valley slope profile.

Pure Python 3 stdlib (math, json, struct, random, pathlib) — zero external dependencies.
"""

import json
import math
import random
import struct
from pathlib import Path

SEGMENT_LENGTH = 24.0
HALF_Z = SEGMENT_LENGTH * 0.5  # 12.0m


# ---------------------------------------------------------------------------
# Vector & Transform Helpers
# ---------------------------------------------------------------------------
def v_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def v_cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def v_norm(a):
    l = math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
    if l < 1e-12:
        return (0.0, 1.0, 0.0)
    return (a[0] / l, a[1] / l, a[2] / l)


def rot_x(v, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c)


def rot_y(v, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def rot_z(v, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2])


def terrain_bounds_at_x(x):
    """Matches createTerrainChunk(zOffset) in main.js so props anchor cleanly."""
    dist = abs(x) - 11.5
    if dist <= 0.0:
        return (-0.15, -0.15)
    factor = min(dist / 42.0, 1.8)
    base = (factor ** 1.55) * 16.0
    max_wave = (abs(math.sin(x * 0.08)) * 8.5 + 3.8) * factor
    return (base, base + max_wave)


# ---------------------------------------------------------------------------
# Vertex-Welding Mesh Builder
# ---------------------------------------------------------------------------
class MeshBuilder:
    def __init__(self, name):
        self.name = name
        self.positions = []
        self.normals = []
        self.uvs = []
        self.indices = []
        self._weld_map = {}

    def add_vertex(self, pos, norm, uv=(0.5, 0.5)):
        n = v_norm(norm)
        key = (
            round(pos[0], 4),
            round(pos[1], 4),
            round(pos[2], 4),
            round(n[0], 3),
            round(n[1], 3),
            round(n[2], 3),
            round(uv[0], 3),
            round(uv[1], 3),
        )
        idx = self._weld_map.get(key)
        if idx is not None:
            return idx
        idx = len(self.positions)
        self.positions.append((float(pos[0]), float(pos[1]), float(pos[2])))
        self.normals.append((float(n[0]), float(n[1]), float(n[2])))
        self.uvs.append((float(uv[0]), float(uv[1])))
        self._weld_map[key] = idx
        return idx

    def append_transformed(self, other, yaw_rad=0.0, offset=(0.0, 0.0, 0.0)):
        """Merges another MeshBuilder transformed by Y-yaw + world translation."""
        remap = {}
        ox, oy, oz = offset
        for i, p in enumerate(other.positions):
            rp = rot_y(p, yaw_rad) if yaw_rad else p
            rn = rot_y(other.normals[i], yaw_rad) if yaw_rad else other.normals[i]
            wp = (rp[0] + ox, rp[1] + oy, rp[2] + oz)
            remap[i] = self.add_vertex(wp, rn, other.uvs[i])
        for k in range(0, len(other.indices), 3):
            self.add_tri(
                remap[other.indices[k]],
                remap[other.indices[k + 1]],
                remap[other.indices[k + 2]],
            )

    def add_tri(self, i0, i1, i2):
        if i0 != i1 and i1 != i2 and i2 != i0:
            self.indices.extend((i0, i1, i2))

    def add_quad(self, p0, p1, p2, p3, norm=None, uvs=None):
        if norm is None:
            norm = v_cross(v_sub(p1, p0), v_sub(p2, p0))
        if uvs is None:
            uvs = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
        i0 = self.add_vertex(p0, norm, uvs[0])
        i1 = self.add_vertex(p1, norm, uvs[1])
        i2 = self.add_vertex(p2, norm, uvs[2])
        i3 = self.add_vertex(p3, norm, uvs[3])
        self.add_tri(i0, i1, i2)
        self.add_tri(i0, i2, i3)

    def add_box(self, cx, cy, cz, sx, sy, sz, rx=0.0, ry=0.0, rz=0.0):
        hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
        faces = [
            ((-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz), (0, 0, 1)),
            ((hx, -hy, -hz), (-hx, -hy, -hz), (-hx, hy, -hz), (hx, hy, -hz), (0, 0, -1)),
            ((hx, -hy, hz), (hx, -hy, -hz), (hx, hy, -hz), (hx, hy, hz), (1, 0, 0)),
            ((-hx, -hy, -hz), (-hx, -hy, hz), (-hx, hy, hz), (-hx, hy, -hz), (-1, 0, 0)),
            ((-hx, hy, hz), (hx, hy, hz), (hx, hy, -hz), (-hx, hy, -hz), (0, 1, 0)),
            ((-hx, -hy, -hz), (hx, -hy, -hz), (hx, -hy, hz), (-hx, -hy, hz), (0, -1, 0)),
        ]

        def tf(v, is_n=False):
            p = v
            if rx:
                p = rot_x(p, rx)
            if ry:
                p = rot_y(p, ry)
            if rz:
                p = rot_z(p, rz)
            return p if is_n else (p[0] + cx, p[1] + cy, p[2] + cz)

        for p0, p1, p2, p3, n in faces:
            self.add_quad(tf(p0), tf(p1), tf(p2), tf(p3), tf(n, True))

    def add_strut(self, p_start, p_end, thickness, sides=4):
        axis = v_sub(p_end, p_start)
        length = math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2)
        if length < 1e-6:
            return
        fwd = v_mul(axis, 1.0 / length)
        ref = (0.0, 1.0, 0.0) if abs(fwd[1]) < 0.92 else (1.0, 0.0, 0.0)
        right = v_norm(v_cross(ref, fwd))
        up = v_norm(v_cross(fwd, right))
        r = thickness * 0.5

        ring0 = []
        ring1 = []
        for i in range(sides):
            ang = (i / sides) * math.tau + (math.pi / sides)
            c, s = math.cos(ang), math.sin(ang)
            n = v_add(v_mul(right, c), v_mul(up, s))
            off = v_mul(n, r)
            ring0.append((v_add(p_start, off), n, i / sides))
            ring1.append((v_add(p_end, off), n, i / sides))

        for i in range(sides):
            j = (i + 1) % sides
            p00, n0, u0 = ring0[i]
            p01, n1, u1 = ring0[j]
            p11, _, _ = ring1[j]
            p10, _, _ = ring1[i]
            idx0 = self.add_vertex(p00, n0, (u0, 0.0))
            idx1 = self.add_vertex(p01, n1, (u1, 0.0))
            idx2 = self.add_vertex(p11, n1, (u1, 1.0))
            idx3 = self.add_vertex(p10, n0, (u0, 1.0))
            self.add_tri(idx0, idx1, idx2)
            self.add_tri(idx0, idx2, idx3)

    def add_lathe_y(self, cx, cz, profile_yr, radial_segs=18, cap_bottom=False, cap_top=False, smooth=True):
        rings = []
        n_st = len(profile_yr)
        for s_idx, (y, r) in enumerate(profile_yr):
            prev_y, prev_r = profile_yr[max(0, s_idx - 1)]
            next_y, next_r = profile_yr[min(n_st - 1, s_idx + 1)]
            dy = next_y - prev_y
            dr = next_r - prev_r
            ny_slope = -dr
            nr_slope = dy if abs(dy) > 1e-6 else 1.0

            ring = []
            v_coord = s_idx / max(1, n_st - 1)
            for i in range(radial_segs + 1):
                ang = (i / radial_segs) * math.tau
                c, s = math.cos(ang), math.sin(ang)
                pos = (cx + c * r, y, cz + s * r)
                nrm = v_norm((c * nr_slope, ny_slope, s * nr_slope))
                ring.append((pos, nrm, (i / radial_segs, v_coord)))
            rings.append(ring)

        for s_idx in range(n_st - 1):
            r0 = rings[s_idx]
            r1 = rings[s_idx + 1]
            for i in range(radial_segs):
                if smooth:
                    i00 = self.add_vertex(r0[i][0], r0[i][1], r0[i][2])
                    i01 = self.add_vertex(r0[i + 1][0], r0[i + 1][1], r0[i + 1][2])
                    i11 = self.add_vertex(r1[i + 1][0], r1[i + 1][1], r1[i + 1][2])
                    i10 = self.add_vertex(r1[i][0], r1[i][1], r1[i][2])
                    self.add_tri(i00, i10, i11)
                    self.add_tri(i00, i11, i01)
                else:
                    self.add_quad(r0[i][0], r1[i][0], r1[i + 1][0], r0[i + 1][0])

        if cap_bottom and profile_yr[0][1] > 1e-5:
            y0, _ = profile_yr[0]
            c_idx = self.add_vertex((cx, y0, cz), (0, -1, 0), (0.5, 0.5))
            for i in range(radial_segs):
                i0 = self.add_vertex(rings[0][i][0], (0, -1, 0), (0.5, 0.5))
                i1 = self.add_vertex(rings[0][i + 1][0], (0, -1, 0), (0.5, 0.5))
                self.add_tri(c_idx, i0, i1)

        if cap_top and profile_yr[-1][1] > 1e-5:
            yt, _ = profile_yr[-1]
            c_idx = self.add_vertex((cx, yt, cz), (0, 1, 0), (0.5, 0.5))
            for i in range(radial_segs):
                i0 = self.add_vertex(rings[-1][i][0], (0, 1, 0), (0.5, 0.5))
                i1 = self.add_vertex(rings[-1][i + 1][0], (0, 1, 0), (0.5, 0.5))
                self.add_tri(c_idx, i1, i0)

    def add_lathe_z(self, cx, cy, profile_zr, radial_segs=16, cap_back=False):
        rings = []
        n_st = len(profile_zr)
        for s_idx, (z, r) in enumerate(profile_zr):
            prev_z, prev_r = profile_zr[max(0, s_idx - 1)]
            next_z, next_r = profile_zr[min(n_st - 1, s_idx + 1)]
            dz = next_z - prev_z
            dr = next_r - prev_r
            nz_slope = -dr
            nr_slope = dz if abs(dz) > 1e-6 else 1.0
            ring = []
            for i in range(radial_segs + 1):
                ang = (i / radial_segs) * math.tau
                c, s = math.cos(ang), math.sin(ang)
                pos = (cx + c * r, cy + s * r, z)
                nrm = v_norm((c * nr_slope, s * nr_slope, nz_slope if r > 1e-4 else 1.0))
                ring.append((pos, nrm, (i / radial_segs, s_idx / max(1, n_st - 1))))
            rings.append(ring)

        for s_idx in range(n_st - 1):
            r0 = rings[s_idx]
            r1 = rings[s_idx + 1]
            for i in range(radial_segs):
                i00 = self.add_vertex(r0[i][0], r0[i][1], r0[i][2])
                i01 = self.add_vertex(r0[i + 1][0], r0[i + 1][1], r0[i + 1][2])
                i11 = self.add_vertex(r1[i + 1][0], r1[i + 1][1], r1[i + 1][2])
                i10 = self.add_vertex(r1[i][0], r1[i][1], r1[i][2])
                self.add_tri(i00, i01, i11)
                self.add_tri(i00, i11, i10)

        if cap_back and profile_zr[0][1] > 1e-5:
            z0, _ = profile_zr[0]
            c_idx = self.add_vertex((cx, cy, z0), (0, 0, -1), (0.5, 0.5))
            for i in range(radial_segs):
                i0 = self.add_vertex(rings[0][i][0], (0, 0, -1), (0.5, 0.5))
                i1 = self.add_vertex(rings[0][i + 1][0], (0, 0, -1), (0.5, 0.5))
                self.add_tri(c_idx, i1, i0)


# ---------------------------------------------------------------------------
# 1. Highway W-Beam Guardrails, Reflector Tabs & Milepost Delineators
# ---------------------------------------------------------------------------
def build_guardrails(steel_mb, concrete_mb, dark_mb, amber_mb):
    z_steps = 4
    z_vals = [-HALF_Z + (SEGMENT_LENGTH * k / z_steps) for k in range(z_steps + 1)]

    w_profile = [
        (0.03, 0.83),
        (-0.04, 0.79),
        (-0.04, 0.73),
        (0.03, 0.68),
        (-0.04, 0.63),
        (-0.04, 0.57),
        (0.03, 0.53),
    ]

    for side in (-1.0, 1.0):
        rail_x = side * 9.48
        inward = -side

        for p_idx in range(len(w_profile) - 1):
            dx0, y0 = w_profile[p_idx]
            dx1, y1 = w_profile[p_idx + 1]
            x0 = rail_x + inward * dx0
            x1 = rail_x + inward * dx1
            thick = side * 0.018

            for k in range(z_steps):
                za, zb = z_vals[k], z_vals[k + 1]
                if side < 0:
                    steel_mb.add_quad((x0, y0, za), (x0, y0, zb), (x1, y1, zb), (x1, y1, za))
                    steel_mb.add_quad(
                        (x1 + thick, y1, za),
                        (x1 + thick, y1, zb),
                        (x0 + thick, y0, zb),
                        (x0 + thick, y0, za),
                    )
                else:
                    steel_mb.add_quad((x1, y1, za), (x1, y1, zb), (x0, y0, zb), (x0, y0, za))
                    steel_mb.add_quad(
                        (x0 + thick, y0, za),
                        (x0 + thick, y0, zb),
                        (x1 + thick, y1, zb),
                        (x1 + thick, y1, za),
                    )

        # Galvanized steel wide-flange posts + spacer blockouts every 3.0m
        for p_i in range(8):
            zp = -10.5 + p_i * 3.0
            post_x = rail_x + side * 0.14
            steel_mb.add_box(post_x, 0.28, zp, 0.13, 1.20, 0.05)
            steel_mb.add_box(rail_x + side * 0.04, 0.68, zp, 0.10, 0.22, 0.11)

        # Glowing golden-amber butterfly reflector tabs in W-beam trough (staggered L vs R)
        ref_zs = [-9.0, -3.0, 3.0, 9.0] if side < 0 else [-6.0, 0.0, 6.0, 11.4]
        for zr in ref_zs:
            rx = rail_x + inward * 0.025
            amber_mb.add_box(rx, 0.68, zr, 0.035, 0.095, 0.16)
            dark_mb.add_box(rx - inward * 0.015, 0.68, zr, 0.02, 0.11, 0.18)

    # Caltrans-style flexible desert highway milepost delineator paddles (asymmetric Z)
    for side, zm in ((-1.0, -7.8), (1.0, 4.6)):
        mx = side * 9.88
        concrete_mb.add_box(mx, 0.48, zm, 0.035, 1.32, 0.13)
        dark_mb.add_box(mx, 1.07, zm, 0.04, 0.16, 0.135)
        amber_mb.add_box(mx - side * 0.018, 0.90, zm, 0.015, 0.09, 0.10)
        amber_mb.add_box(mx - side * 0.018, 0.74, zm, 0.015, 0.05, 0.10)


# ---------------------------------------------------------------------------
# 2. Sculpted Modern 3-Blade Wind Turbine & Spinning Rotor Node
# ---------------------------------------------------------------------------
def build_turbine_static(
    tower_h,
    ped_bottom,
    ped_top,
    r_base,
    r_top,
    nacelle_len=5.8,
    nacelle_w=2.3,
    nacelle_h=2.2,
):
    white_mb = MeshBuilder("TurbineWhite")
    steel_mb = MeshBuilder("TurbineSteel")
    dark_mb = MeshBuilder("TurbineDark")
    conc_mb = MeshBuilder("TurbineConcrete")
    amber_mb = MeshBuilder("TurbineDoorLamp")
    red_mb = MeshBuilder("TurbineBeacon")

    # 1. Stepped octagonal concrete hillside foundation pedestal
    conc_profile = [
        (ped_bottom, r_base + 1.55),
        (ped_top - 0.65, r_base + 1.12),
        (ped_top - 0.45, r_base + 0.70),
        (ped_top, r_base + 0.56),
        (ped_top + 0.18, r_base + 0.12),
    ]
    conc_mb.add_lathe_y(0.0, 0.0, conc_profile, radial_segs=8, cap_top=True, smooth=False)

    # Steel maintenance platform ring & handrail around tower base
    plat_r = r_base + 0.50
    steel_mb.add_lathe_y(
        0.0,
        0.0,
        [(ped_top + 0.05, plat_r), (ped_top + 0.16, plat_r)],
        radial_segs=12,
        cap_top=True,
        smooth=False,
    )
    for i in range(10):
        ang = (i / 10.0) * math.tau
        if 0.25 < ang < 0.90:
            continue
        px = math.cos(ang) * (plat_r - 0.06)
        pz = math.sin(ang) * (plat_r - 0.06)
        steel_mb.add_strut((px, ped_top + 0.15, pz), (px, ped_top + 1.10, pz), 0.045, sides=4)
        ang2 = ((i + 1) / 10.0) * math.tau
        if not (0.25 < ang2 < 0.90):
            px2 = math.cos(ang2) * (plat_r - 0.06)
            pz2 = math.sin(ang2) * (plat_r - 0.06)
            steel_mb.add_strut((px, ped_top + 1.08, pz), (px2, ped_top + 1.08, pz2), 0.04, sides=4)

    # Tower service door & warm amber safety work-lamp on +Z side
    door_z = r_base - 0.02
    dark_mb.add_box(0.0, ped_top + 1.25, door_z, 0.86, 2.05, 0.18)
    steel_mb.add_box(0.0, ped_top + 2.34, door_z + 0.08, 1.02, 0.12, 0.28)
    amber_mb.add_box(0.0, ped_top + 2.24, door_z + 0.14, 0.34, 0.09, 0.12)

    # 2. Tapered warm-white tubular steel tower with bolted flange seam collars
    tower_start = ped_top + 0.10
    tower_span = tower_h - tower_start
    n_sections = 4
    tower_profile = [
        (tower_start + tower_span * (s / n_sections), r_base + (r_top - r_base) * (s / n_sections))
        for s in range(n_sections + 1)
    ]
    white_mb.add_lathe_y(0.0, 0.0, tower_profile, radial_segs=18, smooth=True)

    for s in range(1, n_sections):
        t = s / n_sections
        yf = tower_start + tower_span * t
        rf = r_base + (r_top - r_base) * t
        steel_mb.add_lathe_y(
            0.0,
            0.0,
            [(yf - 0.09, rf + 0.01), (yf, rf + 0.055), (yf + 0.09, rf + 0.01)],
            radial_segs=18,
            smooth=True,
        )

    # Yaw bearing ring at top of tower
    steel_mb.add_lathe_y(
        0.0,
        0.0,
        [(tower_h - 0.15, r_top + 0.08), (tower_h + 0.18, r_top + 0.08)],
        radial_segs=18,
        cap_top=True,
        smooth=True,
    )

    # 3. Sculpted chamfered octagonal nacelle housing
    hub_y = tower_h + nacelle_h * 0.54
    z_rear = -nacelle_len * 0.58
    z_front = nacelle_len * 0.42
    hw = nacelle_w * 0.5
    hh = nacelle_h * 0.5
    cham = 0.36

    oct_xy = [
        (-hw + cham, hh),
        (hw - cham, hh),
        (hw, hh - cham),
        (hw, -hh + cham),
        (hw - cham, -hh),
        (-hw + cham, -hh),
        (-hw, -hh + cham),
        (-hw, hh - cham),
    ]
    z_stations = [
        (z_rear, 0.86),
        (z_rear + 0.45, 0.98),
        (0.0, 1.00),
        (z_front - 0.45, 0.95),
        (z_front, 0.76),
    ]
    rings = [[(x * sc, hub_y + y * sc, zs) for (x, y) in oct_xy] for zs, sc in z_stations]

    for s_idx in range(len(rings) - 1):
        ra, rb = rings[s_idx], rings[s_idx + 1]
        for i in range(8):
            j = (i + 1) % 8
            white_mb.add_quad(ra[i], rb[i], rb[j], ra[j])

    front_c = (0.0, hub_y, z_front)
    rear_c = (0.0, hub_y, z_rear)
    for i in range(8):
        j = (i + 1) % 8
        fc = white_mb.add_vertex(front_c, (0, 0, 1))
        f0 = white_mb.add_vertex(rings[-1][i], (0, 0, 1))
        f1 = white_mb.add_vertex(rings[-1][j], (0, 0, 1))
        white_mb.add_tri(fc, f1, f0)

        rc = dark_mb.add_vertex(rear_c, (0, 0, -1))
        r0 = dark_mb.add_vertex(rings[0][i], (0, 0, -1))
        r1 = dark_mb.add_vertex(rings[0][j], (0, 0, -1))
        dark_mb.add_tri(rc, r0, r1)

    # Dark rear cooling radiator louvers & upper heat-exchanger box
    dark_mb.add_box(0.0, hub_y + hh + 0.14, z_rear * 0.55, hw * 1.15, 0.28, nacelle_len * 0.36)
    for lv in range(3):
        ly = hub_y - 0.38 + lv * 0.36
        steel_mb.add_box(0.0, ly, z_rear - 0.04, hw * 1.25, 0.06, 0.08)

    # Rooftop anemometer wind-sensor mast + glowing red FAA obstruction beacon
    beacon_y = hub_y + hh + 0.28
    beacon_z = z_rear + 0.85
    steel_mb.add_strut((0.38, hub_y + hh, beacon_z - 0.3), (0.38, beacon_y + 0.72, beacon_z - 0.3), 0.045, sides=4)
    steel_mb.add_box(0.38, beacon_y + 0.72, beacon_z - 0.3, 0.42, 0.04, 0.04)
    steel_mb.add_lathe_y(
        0.0,
        beacon_z,
        [(hub_y + hh, 0.16), (beacon_y + 0.22, 0.13)],
        radial_segs=8,
        smooth=False,
    )
    red_mb.add_lathe_y(
        0.0,
        beacon_z,
        [
            (beacon_y + 0.20, 0.02),
            (beacon_y + 0.24, 0.22),
            (beacon_y + 0.44, 0.24),
            (beacon_y + 0.58, 0.15),
            (beacon_y + 0.64, 0.01),
        ],
        radial_segs=10,
        smooth=True,
    )

    hub_z = z_front + 0.42
    dark_mb.add_lathe_z(0.0, hub_y, [(z_front - 0.05, 0.58), (hub_z - 0.35, 0.56)], radial_segs=14)

    return (
        {
            "white": white_mb,
            "steel": steel_mb,
            "dark": dark_mb,
            "conc": conc_mb,
            "amber": amber_mb,
            "red": red_mb,
        },
        (0.0, hub_y, hub_z),
    )


def build_rotor_meshes(blade_length=11.4, initial_roll_deg=18.0):
    """
    Builds 3-blade rotor + aerodynamic bullet nose spinner in local hub space:
      - Origin (0, 0, 0) is exact axle center!
      - Z axis is shaft axis (+Z points out of nose cone).
      - 3 blades spaced strictly by 120 deg in XY with initial_roll_deg baked in.
    """
    white_mb = MeshBuilder("SpinnerAndBlades")
    tip_mb = MeshBuilder("BladeSafetyTips")

    # 1. Aerodynamic bullet nose spinner cone centered on (0, 0, 0)
    z_back, z_tip, r_hub, n_sp = -0.42, 1.48, 0.88, 8
    spinner_profile = [
        (
            z_back + (z_tip - z_back) * (i / n_sp),
            r_hub * math.sqrt(max(0.0, 1.0 - ((i / n_sp) ** 1.75))),
        )
        for i in range(n_sp + 1)
    ]
    white_mb.add_lathe_z(0.0, 0.0, spinner_profile, radial_segs=16, cap_back=True)

    # 2. Airfoil unit cross-section (8 points)
    airfoil_2d = [
        (-0.32, 0.00),
        (-0.22, 0.38),
        (-0.02, 0.50),
        (0.32, 0.30),
        (0.68, 0.00),
        (0.32, -0.18),
        (-0.05, -0.32),
        (-0.24, -0.24),
    ]
    n_af = len(airfoil_2d)

    span_spec = [
        (0.065, 0.76, 0.72, 24.0, 0.00),
        (0.140, 1.02, 0.56, 19.5, 0.03),
        (0.240, 1.42, 0.38, 14.5, 0.06),
        (0.420, 1.16, 0.25, 9.0, 0.02),
        (0.640, 0.84, 0.16, 4.8, -0.04),
        (0.840, 0.52, 0.09, 2.2, -0.12),  # boundary where safety tip paint begins
        (0.940, 0.33, 0.06, 1.1, -0.20),
        (1.000, 0.15, 0.03, 0.5, -0.28),
    ]
    tip_start_idx = 5

    base_rad = math.radians(initial_roll_deg)
    for b_idx in range(3):
        blade_angle = base_rad + b_idx * (math.tau / 3.0)
        blade_rings = []
        for frac, chord, thick, twist_deg, sweep in span_spec:
            r_span = frac * blade_length
            cone_z = 0.42 * (frac ** 1.65)
            twist = math.radians(twist_deg)
            ct, st = math.cos(twist), math.sin(twist)
            circ_blend = max(0.0, min(1.0, (0.15 - frac) / 0.085))
            ring_pts = []
            for k, (ax, az) in enumerate(airfoil_2d):
                ang_k = (k / n_af) * math.tau + math.pi
                ux = ax * (1.0 - circ_blend) + math.cos(ang_k) * 0.5 * circ_blend
                uz = az * (1.0 - circ_blend) + math.sin(ang_k) * 0.5 * circ_blend
                lx, lz = ux * chord, uz * thick
                tx = lx * ct - lz * st + sweep
                tz = lx * st + lz * ct + cone_z
                ring_pts.append(rot_z((tx, r_span, tz), blade_angle))
            blade_rings.append(ring_pts)

        for s_idx in range(len(span_spec) - 1):
            target = tip_mb if s_idx >= tip_start_idx else white_mb
            ra, rb = blade_rings[s_idx], blade_rings[s_idx + 1]
            ca = (
                sum(p[0] for p in ra) / n_af,
                sum(p[1] for p in ra) / n_af,
                sum(p[2] for p in ra) / n_af,
            )
            cb = (
                sum(p[0] for p in rb) / n_af,
                sum(p[1] for p in rb) / n_af,
                sum(p[2] for p in rb) / n_af,
            )
            for i in range(n_af):
                j = (i + 1) % n_af
                i00 = target.add_vertex(ra[i], v_sub(ra[i], ca), (i / n_af, s_idx / len(span_spec)))
                i01 = target.add_vertex(ra[j], v_sub(ra[j], ca), ((i + 1) / n_af, s_idx / len(span_spec)))
                i11 = target.add_vertex(rb[j], v_sub(rb[j], cb), ((i + 1) / n_af, (s_idx + 1) / len(span_spec)))
                i10 = target.add_vertex(rb[i], v_sub(rb[i], cb), (i / n_af, (s_idx + 1) / len(span_spec)))
                target.add_tri(i00, i01, i11)
                target.add_tri(i00, i11, i10)

        tip_ring = blade_rings[-1]
        cx_t = sum(p[0] for p in tip_ring) / n_af
        cy_t = sum(p[1] for p in tip_ring) / n_af
        cz_t = sum(p[2] for p in tip_ring) / n_af
        tip_n = rot_z((0.0, 1.0, 0.0), blade_angle)
        c_idx = tip_mb.add_vertex((cx_t, cy_t, cz_t), tip_n)
        for i in range(n_af):
            j = (i + 1) % n_af
            i0 = tip_mb.add_vertex(tip_ring[i], tip_n)
            i1 = tip_mb.add_vertex(tip_ring[j], tip_n)
            tip_mb.add_tri(c_idx, i0, i1)

    return white_mb, tip_mb


# ---------------------------------------------------------------------------
# 3. High-Voltage Lattice H-Frame Pylon & Seamless 24m Catenary Power Lines
# ---------------------------------------------------------------------------
def build_transmission_corridor(steel_mb, conc_mb, dark_mb, tip_mb, red_mb):
    pylon_x = 13.65
    pylon_z = -2.0
    leg_dx = 1.25

    for sx in (-1.0, 1.0):
        lx = pylon_x + sx * leg_dx
        conc_mb.add_lathe_y(lx, pylon_z, [(-0.45, 0.46), (1.05, 0.34)], radial_segs=8, cap_top=True, smooth=False)

        leg_levels = [0.95, 4.4, 7.9, 11.2, 14.0, 16.6, 18.2]
        half_spans = [0.24, 0.21, 0.18, 0.15, 0.12, 0.10, 0.08]
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]

        for lv in range(len(leg_levels) - 1):
            y0, y1 = leg_levels[lv], leg_levels[lv + 1]
            w0, w1 = half_spans[lv], half_spans[lv + 1]
            for ci, (cx, cz) in enumerate(corners):
                p0 = (lx + cx * w0, y0, pylon_z + cz * w0)
                p1 = (lx + cx * w1, y1, pylon_z + cz * w1)
                steel_mb.add_strut(p0, p1, 0.055, sides=4)

                ncx, ncz = corners[(ci + 1) % 4]
                q1 = (lx + ncx * w1, y1, pylon_z + ncz * w1)
                steel_mb.add_strut(p1, q1, 0.035, sides=4)
                steel_mb.add_strut(p0, q1, 0.032, sides=4)

        steel_mb.add_strut((lx, 18.2, pylon_z), (lx, 18.75, pylon_z), 0.06, sides=4)

    steel_mb.add_strut((pylon_x - leg_dx, 8.6, pylon_z), (pylon_x + leg_dx, 13.1, pylon_z), 0.065, sides=4)
    steel_mb.add_strut((pylon_x + leg_dx, 8.6, pylon_z), (pylon_x - leg_dx, 13.1, pylon_z), 0.065, sides=4)
    steel_mb.add_box(pylon_x, 8.6, pylon_z, leg_dx * 2.0, 0.11, 0.11)

    arms = [
        (13.25, 11.45, 15.85, [11.65, 13.65, 15.65]),
        (16.40, 11.95, 15.35, [12.15, 15.15]),
    ]
    conductor_attaches = []
    for arm_y, x_min, x_max, phase_xs in arms:
        arm_w = x_max - x_min
        arm_cx = 0.5 * (x_min + x_max)
        steel_mb.add_box(arm_cx, arm_y, pylon_z - 0.14, arm_w, 0.12, 0.09)
        steel_mb.add_box(arm_cx, arm_y, pylon_z + 0.14, arm_w, 0.12, 0.09)
        steel_mb.add_box(arm_cx, arm_y + 0.34, pylon_z, arm_w * 0.76, 0.09, 0.09)
        steel_mb.add_strut((x_min + 0.08, arm_y, pylon_z), (pylon_x - leg_dx, arm_y + 0.72, pylon_z), 0.055, sides=4)
        steel_mb.add_strut((x_max - 0.08, arm_y, pylon_z), (pylon_x + leg_dx, arm_y + 0.72, pylon_z), 0.055, sides=4)

        for px in phase_xs:
            ins_profile = []
            for d in range(4):
                yd = arm_y - 0.08 - d * 0.17
                ins_profile.extend([(yd, 0.045), (yd - 0.05, 0.125), (yd - 0.11, 0.045)])
            dark_mb.add_lathe_y(px, pylon_z, ins_profile, radial_segs=6, smooth=False)
            conductor_attaches.append((px, arm_y - 0.76, 1.18))

    red_mb.add_lathe_y(
        pylon_x + leg_dx,
        pylon_z,
        [(18.74, 0.02), (18.80, 0.13), (18.96, 0.13), (19.04, 0.02)],
        radial_segs=8,
        smooth=True,
    )

    shield_attaches = [
        (pylon_x - leg_dx, 18.70, 0.78),
        (pylon_x + leg_dx, 18.70, 0.78),
    ]

    z_wire_segs = 12
    zw_list = [-HALF_Z + (SEGMENT_LENGTH * k / z_wire_segs) for k in range(z_wire_segs + 1)]

    def catenary_y(y_anchor, sag, z):
        dz = (z - pylon_z) % SEGMENT_LENGTH
        t = dz / HALF_Z
        return y_anchor - sag * (t * (2.0 - t))

    for wx, wy, sag in conductor_attaches:
        for k in range(z_wire_segs):
            za, zb = zw_list[k], zw_list[k + 1]
            dark_mb.add_strut((wx, catenary_y(wy, sag, za), za), (wx, catenary_y(wy, sag, zb), zb), 0.052, sides=3)

    for wx, wy, sag in shield_attaches:
        for k in range(z_wire_segs):
            za, zb = zw_list[k], zw_list[k + 1]
            steel_mb.add_strut((wx, catenary_y(wy, sag, za), za), (wx, catenary_y(wy, sag, zb), zb), 0.032, sides=3)

    marker_z = 10.0
    marker_x = pylon_x - leg_dx
    marker_y = catenary_y(18.70, 0.78, marker_z)
    tip_mb.add_lathe_y(
        marker_x,
        marker_z,
        [
            (marker_y - 0.28, 0.02),
            (marker_y - 0.20, 0.20),
            (marker_y, 0.28),
            (marker_y + 0.20, 0.20),
            (marker_y + 0.28, 0.02),
        ],
        radial_segs=8,
        smooth=True,
    )


# ---------------------------------------------------------------------------
# 4. Mojave Sandstone Boulder Outcrops & Joshua Trees / Desert Yuccas
# ---------------------------------------------------------------------------
def add_sandstone_boulder(rock_mb, cx, cy_base, cz, rx, ry, rz, seed):
    rng = random.Random(seed)
    n_rings = 5
    n_seg = 8
    rings = []
    levels = [
        (-0.75, 0.96),
        (0.08 * ry, 1.04),
        (0.42 * ry, 0.92),
        (0.76 * ry, 0.68),
        (1.00 * ry, 0.30),
    ]
    yaw = rng.uniform(0.0, math.tau)
    for li, (ly, r_scale) in enumerate(levels):
        ring = []
        sx = rng.uniform(-0.08, 0.08) * rx
        sz = rng.uniform(-0.08, 0.08) * rz
        for i in range(n_seg):
            ang = yaw + (i / n_seg) * math.tau
            jitter = rng.uniform(0.80, 1.18)
            px = cx + sx + math.cos(ang) * rx * r_scale * jitter
            pz = cz + sz + math.sin(ang) * rz * r_scale * jitter
            py = cy_base + ly + (rng.uniform(-0.06, 0.06) * ry if li > 0 else 0.0)
            ring.append((px, py, pz))
        rings.append(ring)

    for li in range(n_rings - 1):
        ra, rb = rings[li], rings[li + 1]
        for i in range(n_seg):
            j = (i + 1) % n_seg
            rock_mb.add_quad(ra[i], rb[i], rb[j], ra[j])

    top = rings[-1]
    tcx = sum(p[0] for p in top) / n_seg
    tcy = sum(p[1] for p in top) / n_seg + 0.04 * ry
    tcz = sum(p[2] for p in top) / n_seg
    c_i = rock_mb.add_vertex((tcx, tcy, tcz), (0, 1, 0))
    for i in range(n_seg):
        j = (i + 1) % n_seg
        i0 = rock_mb.add_vertex(top[i], (0, 1, 0))
        i1 = rock_mb.add_vertex(top[j], (0, 1, 0))
        rock_mb.add_tri(c_i, i1, i0)


def add_yucca_rosette(crown_mb, tip_pos, axis_dir, scale=1.0, seed=1):
    rng = random.Random(seed)
    up = v_norm(axis_dir)
    ref = (1.0, 0.0, 0.0) if abs(up[0]) < 0.85 else (0.0, 0.0, 1.0)
    t1 = v_norm(v_cross(up, ref))
    t2 = v_norm(v_cross(up, t1))

    tiers = [
        (7, 0.42, 0.58 * scale, 0.075 * scale),
        (5, 0.96, 0.50 * scale, 0.065 * scale),
        (3, 1.35, 0.42 * scale, 0.055 * scale),
    ]
    for count, elev, length, half_w in tiers:
        phase = rng.uniform(0.0, math.tau)
        ce, se = math.cos(elev), math.sin(elev)
        for i in range(count):
            ang = phase + (i / count) * math.tau
            radial = v_add(v_mul(t1, math.cos(ang)), v_mul(t2, math.sin(ang)))
            leaf_dir = v_norm(v_add(v_mul(radial, ce), v_mul(up, se)))
            side_dir = v_norm(v_cross(up, radial))

            p_tip = v_add(tip_pos, v_mul(leaf_dir, length))
            p_l = v_add(tip_pos, v_add(v_mul(side_dir, half_w), v_mul(leaf_dir, 0.06 * scale)))
            p_r = v_add(tip_pos, v_add(v_mul(side_dir, -half_w), v_mul(leaf_dir, 0.06 * scale)))
            n_leaf = v_cross(v_sub(p_l, p_r), v_sub(p_tip, p_r))
            crown_mb.add_tri(
                crown_mb.add_vertex(p_l, n_leaf),
                crown_mb.add_vertex(p_r, n_leaf),
                crown_mb.add_vertex(p_tip, n_leaf),
            )


def add_joshua_tree(bark_mb, crown_mb, x, z, height, seed):
    rng = random.Random(seed)
    y_min, y_max = terrain_bounds_at_x(x)
    y_root = y_min - 0.45
    trunk_fork_y = max(y_max + 1.35, y_min + height * 0.48)
    lean_x = rng.uniform(-0.28, 0.28)
    lean_z = rng.uniform(-0.28, 0.28)

    p0 = (x, y_root, z)
    p_mid = (x + lean_x * 0.5, 0.5 * (y_root + trunk_fork_y), z + lean_z * 0.5)
    p_fork = (x + lean_x, trunk_fork_y, z + lean_z)

    bark_mb.add_strut(p0, p_mid, 0.34, sides=5)
    bark_mb.add_strut(p_mid, p_fork, 0.27, sides=5)

    n_limbs = rng.choice([3, 4])
    base_az = rng.uniform(0.0, math.tau)
    for li in range(n_limbs):
        az = base_az + (li / n_limbs) * math.tau + rng.uniform(-0.32, 0.32)
        spread = rng.uniform(0.68, 1.18)
        rise = rng.uniform(1.15, 1.95)
        elbow = (
            p_fork[0] + math.cos(az) * spread * 0.62,
            p_fork[1] + rise * 0.48,
            p_fork[2] + math.sin(az) * spread * 0.62,
        )
        tip = (
            p_fork[0] + math.cos(az) * spread * 0.88,
            p_fork[1] + rise,
            p_fork[2] + math.sin(az) * spread * 0.88,
        )
        bark_mb.add_strut(p_fork, elbow, 0.20, sides=5)
        bark_mb.add_strut(elbow, tip, 0.16, sides=5)
        add_yucca_rosette(crown_mb, tip, v_sub(tip, elbow), scale=1.08, seed=seed * 17 + li)

        if li % 2 == 0:
            az2 = az + rng.choice([-0.65, 0.65])
            sub_tip = (
                elbow[0] + math.cos(az2) * 0.58,
                elbow[1] + rng.uniform(0.65, 1.05),
                elbow[2] + math.sin(az2) * 0.58,
            )
            bark_mb.add_strut(elbow, sub_tip, 0.13, sides=5)
            add_yucca_rosette(crown_mb, sub_tip, v_sub(sub_tip, elbow), scale=0.86, seed=seed * 31 + li)


def build_desert_flora_and_rocks(rock_mb, bark_mb, crown_mb):
    boulder_specs = [
        (-12.2, -9.6, 1.35, 1.15, 1.10, 101),
        (-13.4, -8.7, 0.85, 0.72, 0.78, 102),
        (-14.8, 2.8, 1.85, 1.65, 1.45, 103),
        (-13.5, 3.9, 1.05, 0.92, 0.95, 104),
        (-22.8, -1.6, 2.75, 3.35, 2.15, 105),
        (11.9, -7.6, 1.25, 0.98, 1.05, 106),
        (16.4, -1.1, 2.05, 2.05, 1.60, 107),
        (15.2, 0.2, 1.10, 1.15, 0.95, 108),
        (24.6, -6.4, 2.90, 3.70, 2.35, 109),
    ]
    for bx, bz, rx, ry, rz, seed in boulder_specs:
        y_min, y_max = terrain_bounds_at_x(bx)
        cy_base = 0.55 * y_min + 0.45 * y_max - 0.15
        eff_ry = max(ry, (y_max - cy_base) + 0.75)
        add_sandstone_boulder(rock_mb, bx, cy_base, bz, rx, eff_ry, rz, seed)

    joshua_specs = [
        (-12.9, 7.6, 4.2, 201),
        (-15.6, -1.2, 4.8, 202),
        (-21.4, -9.8, 5.4, 203),
        (12.3, 9.1, 4.0, 204),
        (17.1, -8.4, 5.1, 205),
        (15.4, 2.4, 4.5, 206),
    ]
    for jx, jz, jh, seed in joshua_specs:
        add_joshua_tree(bark_mb, crown_mb, jx, jz, jh, seed)

    yucca_specs = [
        (-11.7, -3.4, 1.05, 301),
        (-12.4, 5.2, 0.92, 302),
        (-11.8, 10.2, 0.98, 303),
        (11.7, -10.2, 0.95, 304),
        (12.1, -3.8, 1.08, 305),
        (11.8, 5.8, 0.90, 306),
    ]
    for yx, yz, sc, seed in yucca_specs:
        y_min, y_max = terrain_bounds_at_x(yx)
        y_top = y_max + 0.22
        bark_mb.add_strut((yx, y_min - 0.35, yz), (yx, y_top, yz), 0.16, sides=5)
        add_yucca_rosette(crown_mb, (yx, y_top, yz), (0.0, 1.0, 0.0), scale=sc, seed=seed)


# ---------------------------------------------------------------------------
# Binary glTF 2.0 (.glb) Writer
# ---------------------------------------------------------------------------
class GLBPacker:
    def __init__(self):
        self.materials = []
        self.meshes = []
        self.nodes = []
        self.buffer_views = []
        self.accessors = []
        self.bin_blob = bytearray()

    def _align4(self):
        rem = len(self.bin_blob) % 4
        if rem:
            self.bin_blob.extend(b"\x00" * (4 - rem))

    def add_material(
        self,
        name,
        base_color,
        metallic=0.25,
        roughness=0.45,
        emissive=None,
        emissive_strength=None,
    ):
        mat = {
            "name": name,
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorFactor": [float(c) for c in base_color],
                "metallicFactor": float(metallic),
                "roughnessFactor": float(roughness),
            },
        }
        if emissive is not None:
            mat["emissiveFactor"] = [float(c) for c in emissive]
        if emissive_strength is not None:
            mat["extensions"] = {
                "KHR_materials_emissive_strength": {
                    "emissiveStrength": float(emissive_strength)
                }
            }
        idx = len(self.materials)
        self.materials.append(mat)
        return idx

    def add_mesh(self, mb: MeshBuilder, mat_idx: int):
        assert len(mb.positions) > 0 and len(mb.indices) > 0, f"Empty mesh {mb.name}"
        assert len(mb.positions) < 65535, f"Mesh {mb.name} exceeds uint16 index limit"

        self._align4()
        pos_off = len(self.bin_blob)
        xs = [p[0] for p in mb.positions]
        ys = [p[1] for p in mb.positions]
        zs = [p[2] for p in mb.positions]
        for p in mb.positions:
            self.bin_blob.extend(struct.pack("<3f", p[0], p[1], p[2]))
        pos_bv = len(self.buffer_views)
        self.buffer_views.append(
            {"buffer": 0, "byteOffset": pos_off, "byteLength": len(mb.positions) * 12, "target": 34962}
        )
        pos_acc = len(self.accessors)
        self.accessors.append(
            {
                "bufferView": pos_bv,
                "componentType": 5126,
                "count": len(mb.positions),
                "type": "VEC3",
                "min": [min(xs), min(ys), min(zs)],
                "max": [max(xs), max(ys), max(zs)],
            }
        )

        self._align4()
        nrm_off = len(self.bin_blob)
        for n in mb.normals:
            self.bin_blob.extend(struct.pack("<3f", n[0], n[1], n[2]))
        nrm_bv = len(self.buffer_views)
        self.buffer_views.append(
            {"buffer": 0, "byteOffset": nrm_off, "byteLength": len(mb.normals) * 12, "target": 34962}
        )
        nrm_acc = len(self.accessors)
        self.accessors.append(
            {"bufferView": nrm_bv, "componentType": 5126, "count": len(mb.normals), "type": "VEC3"}
        )

        self._align4()
        uv_off = len(self.bin_blob)
        for u in mb.uvs:
            self.bin_blob.extend(struct.pack("<2f", u[0], u[1]))
        uv_bv = len(self.buffer_views)
        self.buffer_views.append(
            {"buffer": 0, "byteOffset": uv_off, "byteLength": len(mb.uvs) * 8, "target": 34962}
        )
        uv_acc = len(self.accessors)
        self.accessors.append(
            {"bufferView": uv_bv, "componentType": 5126, "count": len(mb.uvs), "type": "VEC2"}
        )

        self._align4()
        idx_off = len(self.bin_blob)
        for ix in mb.indices:
            self.bin_blob.extend(struct.pack("<H", ix))
        idx_bv = len(self.buffer_views)
        self.buffer_views.append(
            {"buffer": 0, "byteOffset": idx_off, "byteLength": len(mb.indices) * 2, "target": 34963}
        )
        idx_acc = len(self.accessors)
        self.accessors.append(
            {"bufferView": idx_bv, "componentType": 5123, "count": len(mb.indices), "type": "SCALAR"}
        )

        mesh_idx = len(self.meshes)
        self.meshes.append(
            {
                "name": f"{mb.name}_Mesh",
                "primitives": [
                    {
                        "attributes": {"POSITION": pos_acc, "NORMAL": nrm_acc, "TEXCOORD_0": uv_acc},
                        "indices": idx_acc,
                        "material": mat_idx,
                    }
                ],
            }
        )
        return mesh_idx

    def add_node(self, name, mesh=None, children=None, translation=None, rotation_y_rad=None):
        node = {"name": name}
        if mesh is not None:
            node["mesh"] = mesh
        if children:
            node["children"] = list(children)
        if translation is not None:
            node["translation"] = [float(v) for v in translation]
        if rotation_y_rad is not None and abs(rotation_y_rad) > 1e-7:
            half = rotation_y_rad * 0.5
            node["rotation"] = [0.0, float(math.sin(half)), 0.0, float(math.cos(half))]
        idx = len(self.nodes)
        self.nodes.append(node)
        return idx

    def write_glb(self, out_path: Path, root_node_idx: int):
        self._align4()
        gltf = {
            "asset": {"version": "2.0", "generator": "NightDrive Windmill Pass Builder"},
            "extensionsUsed": ["KHR_materials_emissive_strength"],
            "scene": 0,
            "scenes": [{"name": "Scene", "nodes": [root_node_idx]}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "bufferViews": self.buffer_views,
            "accessors": self.accessors,
            "buffers": [{"byteLength": len(self.bin_blob)}],
        }
        json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        json_pad = (4 - (len(json_bytes) % 4)) % 4
        json_bytes += b" " * json_pad

        total_len = 12 + 8 + len(json_bytes) + 8 + len(self.bin_blob)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(struct.pack("<4sII", b"glTF", 2, total_len))
            f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
            f.write(json_bytes)
            f.write(struct.pack("<II", len(self.bin_blob), 0x004E4942))
            f.write(self.bin_blob)
        return total_len


# ---------------------------------------------------------------------------
# Main Assembly & Clearance Verification
# ---------------------------------------------------------------------------
def main():
    repo_root = Path(__file__).resolve().parent.parent
    out_path = repo_root / "assets" / "models" / "night-drive-windmill.glb"

    packer = GLBPacker()

    mat_white = packer.add_material(
        "Turbine_WarmWhite",
        [0.96, 0.91, 0.85, 1.0],
        metallic=0.22,
        roughness=0.36,
        emissive=[0.065, 0.030, 0.015],
    )
    mat_tip = packer.add_material(
        "Blade_SafetyVermilion",
        [0.93, 0.24, 0.09, 1.0],
        metallic=0.18,
        roughness=0.40,
        emissive=[0.14, 0.032, 0.010],
    )
    mat_steel = packer.add_material(
        "Galvanized_Steel",
        [0.68, 0.65, 0.64, 1.0],
        metallic=0.50,
        roughness=0.35,
        emissive=[0.028, 0.016, 0.010],
    )
    mat_dark = packer.add_material(
        "Industrial_DarkSteel",
        [0.20, 0.19, 0.21, 1.0],
        metallic=0.44,
        roughness=0.48,
    )
    mat_conc = packer.add_material(
        "Desert_Concrete",
        [0.78, 0.71, 0.64, 1.0],
        metallic=0.08,
        roughness=0.82,
        emissive=[0.028, 0.014, 0.008],
    )
    mat_rock = packer.add_material(
        "Mojave_Sandstone",
        [0.58, 0.26, 0.16, 1.0],
        metallic=0.06,
        roughness=0.88,
        emissive=[0.045, 0.016, 0.008],
    )
    mat_bark = packer.add_material(
        "Joshua_Bark",
        [0.25, 0.19, 0.13, 1.0],
        metallic=0.05,
        roughness=0.90,
        emissive=[0.022, 0.012, 0.006],
    )
    mat_crown = packer.add_material(
        "Yucca_Crown",
        [0.30, 0.34, 0.16, 1.0],
        metallic=0.06,
        roughness=0.78,
        emissive=[0.024, 0.022, 0.008],
    )
    mat_amber = packer.add_material(
        "Emissive_AmberReflector",
        [1.0, 0.76, 0.20, 1.0],
        metallic=0.10,
        roughness=0.24,
        emissive=[1.0, 0.68, 0.14],
        emissive_strength=2.25,
    )
    mat_red = packer.add_material(
        "Emissive_FAABeacon",
        [1.0, 0.16, 0.10, 1.0],
        metallic=0.10,
        roughness=0.20,
        emissive=[1.0, 0.12, 0.08],
        emissive_strength=2.65,
    )

    # Merged static corridor meshes (1 mesh per material across entire 24m tile for minimal draw calls!)
    st_white = MeshBuilder("PassTurbineTowers")
    st_steel = MeshBuilder("PassGuardrailAndPylon")
    st_conc = MeshBuilder("PassConcreteFootings")
    st_dark = MeshBuilder("PassCablesAndTrim")
    st_amber = MeshBuilder("PassAmberReflectors")
    st_red = MeshBuilder("PassFAABeacons")
    st_tip = MeshBuilder("PassLineMarker")
    st_rock = MeshBuilder("PassSandstoneBoulders")
    st_bark = MeshBuilder("PassJoshuaTrunks")
    st_crown = MeshBuilder("PassYuccaCrowns")

    build_guardrails(st_steel, st_conc, st_dark, st_amber)
    build_transmission_corridor(st_steel, st_conc, st_dark, st_tip, st_red)
    build_desert_flora_and_rocks(st_rock, st_bark, st_crown)

    turbine_specs = [
        ("L", "Windmill_Rotor_L", (-18.0, 0.0, -5.2), 14.0, 31.2, -0.55, 2.75, 1.46, 0.82, 11.4, 18.0),
        ("R", "Windmill_Rotor_R", (20.6, 0.0, 6.2), -12.0, 34.2, -0.55, 3.85, 1.54, 0.85, 11.8, 98.0),
        ("Outer", "Windmill_Rotor_Outer", (-34.6, 0.0, 4.6), 9.0, 41.2, 3.40, 13.65, 1.50, 0.80, 10.8, 222.0),
    ]

    pivot_nodes = []
    for (
        suffix,
        rotor_name,
        pos_xyz,
        yaw_deg,
        tower_h,
        ped_bot,
        ped_top,
        r_base,
        r_top,
        blade_len,
        roll_deg,
    ) in turbine_specs:
        yaw_rad = math.radians(yaw_deg)
        t_builders, hub_local = build_turbine_static(
            tower_h=tower_h,
            ped_bottom=ped_bot,
            ped_top=ped_top,
            r_base=r_base,
            r_top=r_top,
        )

        # Merge static turbine parts into corridor material meshes
        st_white.append_transformed(t_builders["white"], yaw_rad, pos_xyz)
        st_steel.append_transformed(t_builders["steel"], yaw_rad, pos_xyz)
        st_dark.append_transformed(t_builders["dark"], yaw_rad, pos_xyz)
        st_conc.append_transformed(t_builders["conc"], yaw_rad, pos_xyz)
        st_amber.append_transformed(t_builders["amber"], yaw_rad, pos_xyz)
        st_red.append_transformed(t_builders["red"], yaw_rad, pos_xyz)

        # Build spinning 3-blade rotor node inside yawed pivot (so local Z is exact shaft axle!)
        r_white, r_tip = build_rotor_meshes(blade_length=blade_len, initial_roll_deg=roll_deg)
        r_white.name = f"BladeAssembly_{suffix}"
        r_tip.name = f"BladeTipStripes_{suffix}"

        # Verify rotor hub centering & blade clearance
        _, terr_max = terrain_bounds_at_x(pos_xyz[0])
        lowest_blade_y = pos_xyz[1] + hub_local[1] - blade_len
        assert lowest_blade_y > max(7.8, terr_max + 4.0), (
            f"Rotor {rotor_name} blade sweep too low: {lowest_blade_y:.2f} vs terrain {terr_max:.2f}"
        )

        rw_idx = packer.add_mesh(r_white, mat_white)
        rt_idx = packer.add_mesh(r_tip, mat_tip)
        rw_node = packer.add_node(r_white.name, mesh=rw_idx)
        rt_node = packer.add_node(r_tip.name, mesh=rt_idx)

        rotor_hub_node = packer.add_node(
            rotor_name,
            children=[rw_node, rt_node],
            translation=hub_local,
        )
        pivot_node = packer.add_node(
            f"Turbine_Pivot_{suffix}",
            children=[rotor_hub_node],
            translation=pos_xyz,
            rotation_y_rad=yaw_rad,
        )
        pivot_nodes.append(pivot_node)

    static_children = []
    for mb, mat_id in [
        (st_white, mat_white),
        (st_steel, mat_steel),
        (st_conc, mat_conc),
        (st_dark, mat_dark),
        (st_amber, mat_amber),
        (st_red, mat_red),
        (st_tip, mat_tip),
        (st_rock, mat_rock),
        (st_bark, mat_bark),
        (st_crown, mat_crown),
    ]:
        for px, py, pz in mb.positions:
            assert not (-9.25 < px < 9.25 and -0.05 < py < 7.65), (
                f"Clearance violation in {mb.name}: ({px:.2f}, {py:.2f}, {pz:.2f})"
            )
        m_idx = packer.add_mesh(mb, mat_id)
        static_children.append(packer.add_node(mb.name, mesh=m_idx))

    static_group_node = packer.add_node("Pass_Static_Props", children=static_children)
    root_node = packer.add_node(
        "night-drive-windmill",
        children=[static_group_node] + pivot_nodes,
    )

    byte_size = packer.write_glb(out_path, root_node)
    vert_total = sum(a["count"] for a in packer.accessors if a["type"] == "VEC3") // 2
    idx_total = sum(a["count"] for a in packer.accessors if a["type"] == "SCALAR")
    rotor_matches = [n["name"] for n in packer.nodes if "rotor" in n["name"].lower()]

    print(f"Wrote {out_path}")
    print(f"  Size: {byte_size:,} bytes ({byte_size / 1024:.1f} KB)")
    print(f"  Vertices: {vert_total:,} | Triangles: {idx_total // 3:,} | Meshes: {len(packer.meshes)}")
    print(f"  /rotor/i nodes ({len(rotor_matches)}): {rotor_matches}")


if __name__ == "__main__":
    main()
