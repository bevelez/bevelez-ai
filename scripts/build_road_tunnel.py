#!/usr/bin/env python3
"""
scripts/build_road_tunnel.py
Generates assets/models/night-drive-tunnel.glb — a high-detail 12m repeating
Tokyo Bay Aqua-Line x Cyberpunk 2077 x Wangan Midnight Subsea Megatunnel bore
segment (Z in [-6.0, +6.0]) for Night Drive Option 6 ("AMBIENT TUNNEL").

Clearance Contract:
  - Road surface: X in [-9.0, +9.0], Y = 0.0
  - Interior clearance zone: |X| < 9.30 and Y in [0.0, 7.60] is 100% open & unobstructed
    so all 4 camera modes (including HELI WIDE at Y = 4.8, Z = 17.0) never clip.
  - Child nodes exposed for runtime animation in roads/tunnel.js:
      * TunnelArchLED (cobalt-blue structural arch rib accent light strips)
      * TunnelFanRotor / TunnelFanRotor_R (twin axial jet-fan turbine rotors at X = +-3.8, Y = 8.20)
"""

import json
import math
import os
import struct
import zlib
from pathlib import Path


# =============================================================================
# 1. MINIMAL VECTOR & PROCEDURAL MESH BUILDER
# =============================================================================

def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def v_norm(a):
    l = math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
    if l < 1e-9:
        return (0.0, 1.0, 0.0)
    return (a[0] / l, a[1] / l, a[2] / l)


class MeshBuilder:
    def __init__(self, name):
        self.name = name
        self.positions = []
        self.normals = []
        self.uvs = []
        self.indices = []

    def add_quad(self, p0, p1, p2, p3, uv_rect=(0.0, 0.0, 1.0, 1.0), flip=False, n_override=None):
        """Adds a 4-vertex flat-shaded or custom-normal quad (p0->p1->p2->p3 CCW)."""
        if flip:
            p0, p1, p2, p3 = p3, p2, p1, p0
        if n_override is not None:
            n0 = n1 = n2 = n3 = n_override
        else:
            n = v_norm(v_cross(v_sub(p1, p0), v_sub(p2, p0)))
            n0 = n1 = n2 = n3 = n

        u0, v0, u1, v1 = uv_rect
        base = len(self.positions)
        self.positions.extend([p0, p1, p2, p3])
        self.normals.extend([n0, n1, n2, n3])
        self.uvs.extend([(u0, v1), (u1, v1), (u1, v0), (u0, v0)])
        self.indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def add_smooth_quad(self, p0, p1, p2, p3, n0, n1, n2, n3, uv_rect=(0.0, 0.0, 1.0, 1.0), flip=False):
        if flip:
            p0, p1, p2, p3 = p3, p2, p1, p0
            n0, n1, n2, n3 = n3, n2, n1, n0
        u0, v0, u1, v1 = uv_rect
        base = len(self.positions)
        self.positions.extend([p0, p1, p2, p3])
        self.normals.extend([n0, n1, n2, n3])
        self.uvs.extend([(u0, v1), (u1, v1), (u1, v0), (u0, v0)])
        self.indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def add_tri(self, p0, p1, p2, uv0=(0.0, 0.0), uv1=(1.0, 0.0), uv2=(0.5, 1.0), flip=False):
        if flip:
            p0, p1, p2 = p2, p1, p0
            uv0, uv1, uv2 = uv2, uv1, uv0
        n = v_norm(v_cross(v_sub(p1, p0), v_sub(p2, p0)))
        base = len(self.positions)
        self.positions.extend([p0, p1, p2])
        self.normals.extend([n, n, n])
        self.uvs.extend([uv0, uv1, uv2])
        self.indices.extend([base, base + 1, base + 2])

    def add_box(self, x0, y0, z0, x1, y1, z1, uv_rect=(0.0, 0.36, 1.0, 0.50), faces="all"):
        """Axis-aligned box with selectable faces ('x-', 'x+', 'y-', 'y+', 'z-', 'z+')."""
        if x0 > x1:
            x0, x1 = x1, x0
        if y0 > y1:
            y0, y1 = y1, y0
        if z0 > z1:
            z0, z1 = z1, z0

        want = faces if isinstance(faces, (set, list, tuple)) else ("x-", "x+", "y-", "y+", "z-", "z+")
        if "z+" in want:
            self.add_quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), uv_rect)
        if "z-" in want:
            self.add_quad((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), uv_rect)
        if "x+" in want:
            self.add_quad((x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), uv_rect)
        if "x-" in want:
            self.add_quad((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0), uv_rect)
        if "y+" in want:
            self.add_quad((x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0), uv_rect)
        if "y-" in want:
            self.add_quad((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), uv_rect)

    def add_cylinder_z(self, cx, cy, z0, z1, r0, r1=None, segs=16, uv_rect=(0.0, 0.36, 1.0, 0.50),
                       cap_start=False, cap_end=False, inward=False):
        """Cylinder or frustum aligned along Z axis."""
        if r1 is None:
            r1 = r0
        u0, v0, u1, v1 = uv_rect
        for i in range(segs):
            a0 = (i / segs) * math.tau
            a1 = ((i + 1) / segs) * math.tau
            c0, s0 = math.cos(a0), math.sin(a0)
            c1, s1 = math.cos(a1), math.sin(a1)

            p00 = (cx + c0 * r0, cy + s0 * r0, z0)
            p10 = (cx + c1 * r0, cy + s1 * r0, z0)
            p11 = (cx + c1 * r1, cy + s1 * r1, z1)
            p01 = (cx + c0 * r1, cy + s0 * r1, z1)

            sign = -1.0 if inward else 1.0
            n0 = (c0 * sign, s0 * sign, 0.0)
            n1 = (c1 * sign, s1 * sign, 0.0)
            uu0 = u0 + (u1 - u0) * (i / segs)
            uu1 = u0 + (u1 - u0) * ((i + 1) / segs)
            self.add_smooth_quad(
                p00, p10, p11, p01,
                n0, n1, n1, n0,
                uv_rect=(uu0, v0, uu1, v1),
                flip=inward,
            )
            if cap_start:
                self.add_tri(
                    (cx, cy, z0), p10, p00,
                    (0.5 * (u0 + u1), 0.5 * (v0 + v1)), (uu1, v0), (uu0, v0),
                )
            if cap_end:
                self.add_tri(
                    (cx, cy, z1), p01, p11,
                    (0.5 * (u0 + u1), 0.5 * (v0 + v1)), (uu0, v1), (uu1, v1),
                )

    def add_annulus_z(self, cx, cy, z, r_inner, r_outer, segs=20, uv_rect=(0.0, 0.36, 1.0, 0.50), face_plus_z=True):
        """Flat ring cap at Z."""
        u0, v0, u1, v1 = uv_rect
        for i in range(segs):
            a0 = (i / segs) * math.tau
            a1 = ((i + 1) / segs) * math.tau
            c0, s0 = math.cos(a0), math.sin(a0)
            c1, s1 = math.cos(a1), math.sin(a1)
            p0 = (cx + c0 * r_inner, cy + s0 * r_inner, z)
            p1 = (cx + c0 * r_outer, cy + s0 * r_outer, z)
            p2 = (cx + c1 * r_outer, cy + s1 * r_outer, z)
            p3 = (cx + c1 * r_inner, cy + s1 * r_inner, z)
            self.add_quad(p0, p1, p2, p3, uv_rect=(u0, v0, u1, v1), flip=not face_plus_z)


# =============================================================================
# 2. PROCEDURAL 512x512 PNG TEXTURE ATLAS GENERATOR (PURE STDLIB)
# =============================================================================

def encode_png_rgb(width, height, rgb_bytes):
    """Encodes raw RGB8 bytearray (width * height * 3) as a valid PNG image."""
    raw_rows = bytearray()
    stride = width * 3
    for y in range(height):
        raw_rows.append(0)  # Filter type 0 (None)
        row_start = y * stride
        raw_rows.extend(rgb_bytes[row_start:row_start + stride])

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw_rows), level=6)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", idat)
        + chunk(b"IEND", b"")
    )


def clamp_byte(v):
    return 0 if v <= 0 else (255 if v >= 255 else int(v))


def build_tunnel_textures(size=512):
    """
    Builds 512x512 basecolor and emissive PNG textures with 8 horizontal UV bands:
      Band 0 [0.00..0.18]: TBM Precast Concrete Bore Liner
      Band 1 [0.18..0.36]: Ceramic / Acoustic Lower Wall Cladding
      Band 2 [0.36..0.50]: Dark Brushed Structural Steel & Rivets
      Band 3 [0.50..0.62]: Precast Crash Curb & Non-Slip Walkway Concrete
      Band 4 [0.62..0.72]: Ice-Cyan (#00e5ff) Recessed Cove Linear LED
      Band 5 [0.72..0.80]: Sodium-Amber (#ff9f24) Curb LED [0..0.5] & Chevron >>> [0.5..1.0]
      Band 6 [0.80..0.90]: Lane Matrix Green Arrow [0..0.5] & Amber Flank Beacon [0.5..1.0]
      Band 7 [0.90..1.00]: Emergency EXIT Sign [0..0.5], Bulkhead Door [0.5..0.75], SOS Panel [0.75..1.0]
    """
    base = bytearray(size * size * 3)
    emis = bytearray(size * size * 3)

    def set_px(buf, x, y, r, g, b):
        idx = (y * size + x) * 3
        buf[idx] = clamp_byte(r)
        buf[idx + 1] = clamp_byte(g)
        buf[idx + 2] = clamp_byte(b)

    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            # Deterministic subtle grain
            h = ((x * 73856093) ^ (y * 19349663)) & 0xFF
            grain = ((h / 255.0) - 0.5) * 6.0

            if v < 0.18:
                # Band 0: Precast TBM Concrete Bore Liner
                lv = v / 0.18
                r, g, b = 22 + grain, 30 + grain, 44 + grain
                # Staggered TBM segment seams
                row_idx = int(lv * 4)
                stagger = 0.25 if (row_idx % 2 == 1) else 0.0
                seam_u = (u * 4.0 + stagger) % 1.0
                seam_v = (lv * 4.0) % 1.0
                if seam_u < 0.025 or seam_v < 0.06:
                    r, g, b = 11, 16, 25
                elif seam_u < 0.045 or seam_v < 0.10:
                    r, g, b = 32, 43, 60
                # TBM bolt pockets near corners
                if 0.08 < seam_u < 0.13 and (0.16 < seam_v < 0.28 or 0.72 < seam_v < 0.84):
                    r, g, b = 13, 18, 28
                set_px(base, x, y, r, g, b)

            elif v < 0.36:
                # Band 1: Ceramic / Acoustic Lower Wall Cladding (Tokyo Bay Aqua-Line inspired)
                lv = (v - 0.18) / 0.18
                # Satin cool slate-ceramic tile grid
                tile_u = (u * 12.0) % 1.0
                tile_v = (lv * 6.0) % 1.0
                r, g, b = 30 + grain * 0.6, 44 + grain * 0.6, 66 + grain * 0.6
                if tile_u < 0.055 or tile_v < 0.08:
                    r, g, b = 14, 21, 33
                elif tile_u > 0.92 or tile_v > 0.90:
                    r, g, b = 40, 56, 82
                # Horizontal architectural brushed trim band & cyan pin-stripe near top
                if 0.06 < lv < 0.15:
                    r, g, b = 22, 32, 48
                    if 0.095 < lv < 0.115:
                        set_px(emis, x, y, 0, 95, 135)
                # Subtle industrial distance tick bar near bottom
                if 0.82 < lv < 0.90:
                    r, g, b = 20, 28, 42
                    if (int(u * 32) % 4 == 0) and 0.84 < lv < 0.88:
                        r, g, b = 62, 82, 108
                set_px(base, x, y, r, g, b)

            elif v < 0.50:
                # Band 2: Dark Brushed Structural Steel
                lv = (v - 0.36) / 0.14
                streak = math.sin(x * 0.35 + (y % 7) * 1.7) * 3.5
                r, g, b = 36 + streak + grain * 0.5, 45 + streak + grain * 0.5, 61 + streak + grain * 0.5
                if lv < 0.08 or lv > 0.92:
                    r, g, b = 52, 64, 84
                elif 0.47 < lv < 0.53:
                    r, g, b = 21, 27, 38
                # Rivet heads along top/bottom flanges
                ru = (u * 16.0) % 1.0
                if (0.14 < lv < 0.24 or 0.76 < lv < 0.86) and 0.42 < ru < 0.58:
                    r, g, b = 64, 78, 100
                set_px(base, x, y, r, g, b)

            elif v < 0.62:
                # Band 3: Heavy Crash Curb & Non-Slip Walkway Concrete
                lv = (v - 0.50) / 0.12
                r, g, b = 25 + grain, 31 + grain, 43 + grain
                # Expansion joint every 1/4 U
                if (u * 4.0) % 1.0 < 0.025:
                    r, g, b = 12, 15, 22
                # Subtle safety curb stripe near bottom edge
                if lv > 0.78:
                    diag = ((u * 16.0) + (lv - 0.78) * 6.0) % 1.0
                    if diag < 0.5:
                        r, g, b = 58, 48, 26
                    else:
                        r, g, b = 20, 24, 34
                set_px(base, x, y, r, g, b)

            elif v < 0.72:
                # Band 4: Ice-Cyan (#00e5ff) Upper Cove Linear LED Strip
                lv = (v - 0.62) / 0.10
                dist_c = abs(lv - 0.5) * 2.0  # 0 at center, 1 at edge
                profile = max(0.0, 1.0 - dist_c * dist_c * 0.85)
                # Subtle louver ticks every 1/16 U
                louver = 0.25 if ((u * 24.0) % 1.0 < 0.05) else 1.0
                p = profile * louver
                set_px(base, x, y, 40 + 180 * p, 190 + 65 * p, 220 + 35 * p)
                # HDR-ready ice-cyan with hot white-cyan center
                er = (75.0 * (p ** 3))
                eg = 229.0 * p + 26.0 * (p ** 3)
                eb = 255.0 * p
                set_px(emis, x, y, er, eg, eb)

            elif v < 0.80:
                # Band 5: Sodium-Amber (#ff9f24) Curb LED [0..0.5] & Wall Chevron >>> [0.5..1.0]
                lv = (v - 0.72) / 0.08
                if u < 0.5:
                    lu = u / 0.5
                    dist_c = abs(lv - 0.5) * 2.0
                    profile = max(0.0, 1.0 - dist_c * dist_c * 0.9)
                    gap = 0.15 if ((lu * 8.0) % 1.0 < 0.06) else 1.0
                    p = profile * gap
                    set_px(base, x, y, 60 + 195 * p, 40 + 145 * p, 16 + 40 * p)
                    set_px(emis, x, y, 255.0 * p, 159.0 * p + 45.0 * (p ** 3), 36.0 * p + 40.0 * (p ** 3))
                else:
                    # Wangan highway triple-chevron reflector plate (>>>)
                    lu = (u - 0.5) / 0.5
                    set_px(base, x, y, 16, 20, 29)
                    if 0.08 < lv < 0.92 and 0.06 < lu < 0.94:
                        cy_d = abs(lv - 0.5) * 2.0  # 0 at center, 1 at top/bottom
                        # Three crisp chevrons pointing along tunnel direction
                        chev_u = (lu * 3.0 - cy_d * 0.55) % 1.0
                        if 0.22 < chev_u < 0.56:
                            set_px(base, x, y, 255, 190, 64)
                            set_px(emis, x, y, 255, 162, 34)

            elif v < 0.90:
                # Band 6: Lane-Control Matrix Sign [0..0.5] = Green Down Arrow (↓), [0.5..1.0] = Amber Beacon
                lv = (v - 0.80) / 0.10
                # LED dot-matrix mask for crisp realism
                led_dot = 1.0 if ((x % 3 != 0) and (y % 2 != 0)) else 0.42
                set_px(base, x, y, 8, 11, 16)
                if u < 0.5:
                    lu = u / 0.5
                    cx_d = abs(lu - 0.5)
                    # Border bezel
                    if 0.04 < lu < 0.96 and 0.06 < lv < 0.94:
                        # Downward arrow (lv=0 is top, lv=1 is bottom):
                        # Vertical shaft: lv in [0.16, 0.72], cx_d < 0.065
                        in_shaft = (0.16 <= lv <= 0.72) and (cx_d <= 0.068)
                        # Chevron wings converging to tip at (lu=0.5, lv=0.84)
                        tip_dist = 0.84 - lv
                        in_wings = (0.46 <= lv <= 0.84) and (abs(cx_d - tip_dist * 0.62) <= 0.062)
                        # Subtle corner matrix brackets
                        in_corner = (
                            (0.08 < lu < 0.16 or 0.84 < lu < 0.92)
                            and (0.10 < lv < 0.18 or 0.82 < lv < 0.90)
                        )
                        if in_shaft or in_wings:
                            set_px(base, x, y, 40, 255, 130)
                            set_px(emis, x, y, 20 * led_dot, 255 * led_dot, 108 * led_dot)
                        elif in_corner:
                            set_px(emis, x, y, 0, 95 * led_dot, 55 * led_dot)
                else:
                    lu = (u - 0.5) / 0.5
                    # Twin circular amber caution beacons + center telemetry bars
                    d1 = math.hypot((lu - 0.25) * 1.3, lv - 0.5)
                    d2 = math.hypot((lu - 0.75) * 1.3, lv - 0.5)
                    in_ring = (0.28 < d1 < 0.36) or (0.28 < d2 < 0.36)
                    in_lamp = (d1 <= 0.21) or (d2 <= 0.21)
                    in_bar = (0.43 < lu < 0.57) and (0.28 < lv < 0.36 or 0.46 < lv < 0.54 or 0.64 < lv < 0.72)
                    if in_lamp:
                        set_px(base, x, y, 255, 195, 65)
                        set_px(emis, x, y, 255 * led_dot, 168 * led_dot, 32 * led_dot)
                    elif in_ring or in_bar:
                        set_px(base, x, y, 220, 145, 35)
                        set_px(emis, x, y, 205 * led_dot, 120 * led_dot, 20 * led_dot)

            else:
                # Band 7: Emergency EXIT Lightbox [0..0.5], Bulkhead Door [0.5..0.75], SOS Panel [0.75..1.0]
                lv = (v - 0.90) / 0.10
                if u < 0.5:
                    lu = u / 0.5
                    # Emerald-green backlit EXIT sign with crisp white icon/glyph bars
                    set_px(base, x, y, 12, 165, 82)
                    er, eg, eb = 0, 225, 105
                    if 0.06 < lu < 0.94 and 0.12 < lv < 0.88:
                        # Doorway + arrow + EXIT block bars
                        in_glyph = (
                            (0.14 < lu < 0.28 and 0.22 < lv < 0.78)
                            or (0.36 < lu < 0.44 and 0.26 < lv < 0.74)
                            or (0.48 < lu < 0.56 and 0.26 < lv < 0.74)
                            or (0.60 < lu < 0.66 and 0.26 < lv < 0.74)
                            or (0.70 < lu < 0.82 and 0.26 < lv < 0.38)
                            or (0.74 < lu < 0.78 and 0.26 < lv < 0.74)
                        )
                        if in_glyph:
                            set_px(base, x, y, 235, 255, 245)
                            er, eg, eb = 195, 255, 225
                    else:
                        set_px(base, x, y, 18, 26, 36)
                        er, eg, eb = 0, 45, 22
                    set_px(emis, x, y, er, eg, eb)
                elif u < 0.75:
                    # Pressurized egress stainless/slate bulkhead door
                    lu = (u - 0.5) / 0.25
                    set_px(base, x, y, 38 + grain * 0.4, 49 + grain * 0.4, 64 + grain * 0.4)
                    if lu < 0.08 or lu > 0.92 or lv < 0.06 or lv > 0.94:
                        set_px(base, x, y, 20, 26, 36)
                    # Illuminated green vertical safety strip & silver push bar
                    if 0.14 < lu < 0.21 and 0.14 < lv < 0.86:
                        set_px(base, x, y, 30, 230, 120)
                        set_px(emis, x, y, 0, 210, 95)
                    elif 0.24 < lu < 0.82 and 0.50 < lv < 0.57:
                        set_px(base, x, y, 130, 145, 165)
                else:
                    # SOS / Fire Telemetry Niche Panel
                    lu = (u - 0.75) / 0.25
                    set_px(base, x, y, 24, 31, 44)
                    if 0.12 < lu < 0.88 and 0.12 < lv < 0.30:
                        # Top Amber/Green SOS beacon strip
                        set_px(base, x, y, 255, 168, 38)
                        set_px(emis, x, y, 255, 148, 28)
                    elif 0.18 < lu < 0.82 and 0.40 < lv < 0.78:
                        # Emergency cabinet window
                        set_px(base, x, y, 52, 22, 26)
                        if 0.26 < lu < 0.74 and 0.48 < lv < 0.70:
                            set_px(emis, x, y, 185, 38, 28)

    return encode_png_rgb(size, size, base), encode_png_rgb(size, size, emis)


# =============================================================================
# 3. SUBSEA MEGATUNNEL 12M BORE ARCHITECTURAL GEOMETRY
# =============================================================================

UV_CONCRETE = (0.0, 0.005, 1.0, 0.175)
UV_CERAMIC  = (0.0, 0.185, 1.0, 0.355)
UV_STEEL    = (0.0, 0.365, 1.0, 0.495)
UV_CURB     = (0.0, 0.505, 1.0, 0.615)
UV_LED_CYAN = (0.0, 0.625, 1.0, 0.715)
UV_LED_AMB  = (0.01, 0.725, 0.49, 0.795)
UV_CHEVRON  = (0.51, 0.725, 0.99, 0.795)
UV_SIGN_ARR = (0.01, 0.805, 0.49, 0.895)
UV_SIGN_BCN = (0.51, 0.805, 0.99, 0.895)
UV_EXIT_SGN = (0.01, 0.905, 0.49, 0.995)
UV_EXIT_DR  = (0.505, 0.905, 0.745, 0.995)
UV_SOS_PNL  = (0.755, 0.905, 0.995, 0.995)


def arch_point(frac, a, y0, b):
    """
    frac in [0..1]: 0 = right wall haunch (x=+a, y=y0), 0.5 = crown (x=0, y=y0+b), 1 = left haunch (x=-a, y=y0).
    Profile stays 100% outside (|X| < 9.30 and Y < 7.60).
    """
    theta = frac * math.pi  # 0 -> pi
    c = math.cos(theta)     # +1 -> -1
    sign = 1.0 if c >= 0.0 else -1.0
    u = abs(c)
    x = sign * a * (u ** 0.62)
    y = y0 + b * ((1.0 - min(1.0, u * u)) ** 0.20)
    return x, y


def arch_inward_normal(frac, a, y0, b):
    eps = 0.002
    x0, y0p = arch_point(max(0.0, frac - eps), a, y0, b)
    x1, y1p = arch_point(min(1.0, frac + eps), a, y0, b)
    dx, dy = x1 - x0, y1p - y0p
    # (-dy, dx, 0): at right wall (dy>0) -> -X; at crown (dx<0) -> -Y; at left wall (dy<0) -> +X!
    return v_norm((-dy, dx, 0.0))


def build_bore_shell(mb):
    """Segmented precast TBM concrete arch vault from Y=3.95 up to crown Y=9.26, Z in [-6, +6]."""
    arch_steps = 28
    z_steps = 8
    a, y0, b = 10.38, 3.95, 5.31  # crown at Y = 9.26

    for iz in range(z_steps):
        z0 = -6.0 + (12.0 * iz) / z_steps
        z1 = -6.0 + (12.0 * (iz + 1)) / z_steps
        u_z0 = iz / 2.0
        u_z1 = (iz + 1) / 2.0
        for ia in range(arch_steps):
            f0 = ia / arch_steps
            f1 = (ia + 1) / arch_steps
            x0, py0 = arch_point(f0, a, y0, b)
            x1, py1 = arch_point(f1, a, y0, b)
            n0 = arch_inward_normal(f0, a, y0, b)
            n1 = arch_inward_normal(f1, a, y0, b)

            # Inner bore face (both CCW winding and smooth normals point inward into the tunnel bore)
            v_a = 0.005 + 0.170 * ((ia % 7) / 7.0)
            v_b = 0.005 + 0.170 * (((ia % 7) + 1) / 7.0)
            mb.add_smooth_quad(
                (x0, py0, z0), (x0, py0, z1), (x1, py1, z1), (x1, py1, z0),
                n0, n0, n1, n1,
                uv_rect=(u_z0 % 1.0, v_a, (u_z0 % 1.0) + 0.5, v_b),
                flip=False,
            )

    # Central overhead crown spine track (X in [-0.22, +0.22], Y = 9.16..9.25) for razor-sharp center perspective
    mb.add_box(-0.22, 9.17, -6.0, 0.22, 9.25, 6.0, UV_STEEL, faces=("x-", "x+", "y-"))
    for iz in range(4):
        z0 = -6.0 + iz * 3.0
        z1 = z0 + 3.0
        mb.add_quad(
            (-0.09, 9.162, z1), (0.09, 9.162, z1),
            (0.09, 9.162, z0), (-0.09, 9.162, z0),
            UV_LED_CYAN,
        )


def build_structural_arch_ribs(mb, led_mb):
    """
    Heavy sculpted concrete & dark brushed-steel I-beam structural ribs every 6m (Z = -3.0, +3.0),
    plus split flange rings at Z = -5.88 and +5.88 so tile seams butt cleanly.
    Also populates led_mb (TunnelArchLED) with cobalt-blue rib accent strips!
    """
    rib_steps = 26
    y0 = 3.95
    a_out, b_out = 10.40, 5.33
    a_in, b_in = 10.06, 5.05  # crown inner soffit at Y = 9.00

    # 1. Main 6m Structural Arch Ribs at Z = -3.0 and Z = +3.0
    for zc in (-3.0, 3.0):
        half_w = 0.32
        z0, z1 = zc - half_w, zc + half_w

        # Vertical lower steel wall columns (Y = 0.88 .. 3.95) outside walkway back
        for side in (-1.0, 1.0):
            x_in = side * 10.06
            x_out = side * 10.38
            mb.add_box(x_in, 0.88, z0, x_out, 3.95, z1, UV_STEEL, faces=("x-", "x+", "z-", "z+"))
            # Chamfered column flange face
            flange_z0, flange_z1 = zc - 0.40, zc + 0.40
            mb.add_box(side * 10.02, 0.88, flange_z0, side * 10.12, 3.95, flange_z1, UV_STEEL, faces=("x-", "x+", "z-", "z+"))

            # Vertical cobalt-blue TunnelArchLED strip along column (Y = 1.85 .. 3.95)
            lx = side * 10.005
            for dz in (-0.22, 0.22):
                led_mb.add_box(
                    lx - 0.025, 1.85, zc + dz - 0.035,
                    lx + 0.025, 3.95, zc + dz + 0.035,
                    UV_LED_CYAN,
                    faces=("x-", "x+", "z-", "z+"),
                )

        # Curved arch I-beam rib segments from right haunch (0) to left haunch (1)
        for i in range(rib_steps):
            f0 = i / rib_steps
            f1 = (i + 1) / rib_steps
            xi0, yi0 = arch_point(f0, a_in, y0, b_in)
            xi1, yi1 = arch_point(f1, a_in, y0, b_in)
            xo0, yo0 = arch_point(f0, a_out, y0, b_out)
            xo1, yo1 = arch_point(f1, a_out, y0, b_out)

            # Inner soffit face of steel arch rib
            mb.add_quad((xi0, yi0, z0), (xi1, yi1, z0), (xi1, yi1, z1), (xi0, yi0, z1), UV_STEEL)
            # +Z side web of arch rib
            mb.add_quad((xi0, yi0, z1), (xi1, yi1, z1), (xo1, yo1, z1), (xo0, yo0, z1), UV_STEEL)
            # -Z side web of arch rib
            mb.add_quad((xo0, yo0, z0), (xo1, yo1, z0), (xi1, yi1, z0), (xi0, yi0, z0), UV_STEEL)

            # Stepped inner flange lip for industrial I-beam profile
            xf0, yf0 = arch_point(f0, a_in - 0.04, y0, b_in - 0.03)
            xf1, yf1 = arch_point(f1, a_in - 0.04, y0, b_in - 0.03)
            mb.add_quad(
                (xf0, yf0, zc - 0.40), (xf1, yf1, zc - 0.40),
                (xf1, yf1, zc - 0.28), (xf0, yf0, zc - 0.28),
                UV_STEEL,
            )
            mb.add_quad(
                (xf0, yf0, zc + 0.28), (xf1, yf1, zc + 0.28),
                (xf1, yf1, zc + 0.40), (xf0, yf0, zc + 0.40),
                UV_STEEL,
            )

            # Recessed cobalt-blue TunnelArchLED accent channel sweeping all the way over the crown!
            xl0, yl0 = arch_point(f0, a_in - 0.045, y0, b_in - 0.035)
            xl1, yl1 = arch_point(f1, a_in - 0.045, y0, b_in - 0.035)
            led_mb.add_quad(
                (xl0, yl0, zc - 0.09), (xl1, yl1, zc - 0.09),
                (xl1, yl1, zc + 0.09), (xl0, yl0, zc + 0.09),
                UV_LED_CYAN,
            )

    # 2. Secondary Split Ring Collars at Z in [-6.0, -5.84] and [+5.84, +6.0] (forms 0.32m seam ring every 12m)
    a_sec, b_sec = 10.22, 5.18
    for z0, z1 in ((-6.0, -5.84), (5.84, 6.0)):
        for i in range(rib_steps):
            f0 = i / rib_steps
            f1 = (i + 1) / rib_steps
            xi0, yi0 = arch_point(f0, a_sec, y0, b_sec)
            xi1, yi1 = arch_point(f1, a_sec, y0, b_sec)
            xo0, yo0 = arch_point(f0, a_out, y0, b_out)
            xo1, yo1 = arch_point(f1, a_out, y0, b_out)
            mb.add_quad((xi0, yi0, z0), (xi1, yi1, z0), (xi1, yi1, z1), (xi0, yi0, z1), UV_STEEL)
            if z0 < 0:
                mb.add_quad((xi0, yi0, z1), (xi1, yi1, z1), (xo1, yo1, z1), (xo0, yo0, z1), UV_STEEL)
            else:
                mb.add_quad((xo0, yo0, z0), (xo1, yo1, z0), (xi1, yi1, z0), (xi0, yi0, z0), UV_STEEL)


def build_curbs_walkways_and_walls(mb):
    """
    Builds:
      - Sub-road shoulder apron (Y = -0.015) sealing X = +-8.90 .. +-10.60
      - Sculpted chamfered crash curbs (|X| >= 9.35, Y = 0..0.88) + expansion bevels
      - Warm sodium-amber (#ff9f24) low curb emergency LED strips + Wangan chevron reflectors (>>>)
      - Emergency walkways + brushed steel handrails with stanchion posts every 1.5m
      - Tiled ceramic/acoustic lower wall cladding (Y = 0.88..3.98)
      - Recessed Left EXIT bulkhead alcove (Z in [-1.35, +1.35]) & Right SOS niche (Z in [+1.50, +3.50])
    """
    for side in (-1.0, 1.0):
        is_right = side > 0
        # 1. Sub-road dark wet shoulder seal apron (strictly below Y=0 so Y in [0, 7.6] stays 100% clear)
        xa, xb = sorted((side * 8.90, side * 10.65))
        mb.add_quad(
            (xa, -0.015, 6.0), (xb, -0.015, 6.0),
            (xb, -0.015, -6.0), (xa, -0.015, -6.0),
            UV_CURB,
        )

        # 2. Chamfered concrete crash curb + emergency walkway deck (Z in [-6, +6] in 6 x 2m bays)
        # Profile points (|x|, y) facing inward toward X=0:
        curb_pts = [
            (9.35, 0.00),
            (9.35, 0.20),
            (9.46, 0.56),
            (9.50, 0.88),
            (10.24, 0.88),
        ]
        for iz in range(6):
            z0 = -6.0 + iz * 2.0
            z1 = z0 + 2.0
            for ip in range(len(curb_pts) - 1):
                r0, y0 = curb_pts[ip]
                r1, y1 = curb_pts[ip + 1]
                p00 = (side * r0, y0, z0)
                p01 = (side * r0, y0, z1)
                p11 = (side * r1, y1, z1)
                p10 = (side * r1, y1, z0)
                mb.add_quad(p00, p01, p11, p10, UV_CURB, flip=not is_right)

            # Curb concrete expansion joint ribs every 2m
            jz = z0 + 1.0
            mb.add_box(
                side * 9.34, 0.01, jz - 0.03,
                side * 9.52, 0.89, jz + 0.03,
                UV_STEEL,
                faces=("x-", "x+", "y+", "z-", "z+"),
            )

            # Warm sodium-amber (#ff9f24) low curb emergency guide LED strip (|X| = 9.39, Y in [0.27, 0.41])
            lx = side * 9.395
            mb.add_quad(
                (lx, 0.27, z0 + 0.08), (lx, 0.27, z1 - 0.08),
                (lx, 0.40, z1 - 0.08), (lx, 0.40, z0 + 0.08),
                UV_LED_AMB,
                flip=not is_right,
            )

        # 3. Directional Wangan chevron reflector plates (>>>) at Z = -4.0, 0.0, +4.0
        for cz in (-4.0, 0.0, 4.0):
            cx_plate = side * 9.475
            mb.add_box(
                side * 9.47, 0.60, cz - 0.46,
                side * 9.51, 0.83, cz + 0.46,
                UV_STEEL,
                faces=("x-", "x+", "y+", "y-", "z-", "z+"),
            )
            mb.add_quad(
                (cx_plate - side * 0.006, 0.62, cz - 0.42),
                (cx_plate - side * 0.006, 0.62, cz + 0.42),
                (cx_plate - side * 0.006, 0.81, cz + 0.42),
                (cx_plate - side * 0.006, 0.81, cz - 0.42),
                UV_CHEVRON,
                flip=not is_right,
            )

        # 4. Brushed-steel emergency walkway safety handrail (|X| = 9.56, Y = 0.88 .. 1.80)
        rx0, rx1 = side * 9.54, side * 9.59
        # Top & mid rails
        mb.add_box(rx0, 1.74, -6.0, rx1, 1.80, 6.0, UV_STEEL, faces=("x-", "x+", "y+", "y-"))
        mb.add_box(rx0, 1.32, -6.0, rx1, 1.37, 6.0, UV_STEEL, faces=("x-", "x+", "y+", "y-"))
        # Vertical stanchions every 1.5m
        for ip in range(8):
            pz = -5.25 + ip * 1.5
            mb.add_box(rx0 - 0.01, 0.88, pz - 0.03, rx1 + 0.01, 1.80, pz + 0.03, UV_STEEL, faces=("x-", "x+", "z-", "z+"))

        # 5. Ceramic / Acoustic Lower Wall Cladding (Y = 0.88 .. 3.98 at |X| = 10.22) + Recessed Alcoves
        if not is_right:
            # Left wall: Recessed Illuminated Green Emergency EXIT Alcove in Z in [-1.30, +1.30]
            spans = [(-6.0, -1.30), (1.30, 6.0)]
            for sz0, sz1 in spans:
                mb.add_quad(
                    (-10.22, 0.88, sz0), (-10.22, 0.88, sz1),
                    (-10.22, 3.98, sz1), (-10.22, 3.98, sz0),
                    UV_CERAMIC,
                    flip=True,
                )
            # Header panel above EXIT alcove (Y = 3.35 .. 3.98)
            mb.add_quad(
                (-10.22, 3.35, -1.30), (-10.22, 3.35, 1.30),
                (-10.22, 3.98, 1.30), (-10.22, 3.98, -1.30),
                UV_CERAMIC,
                flip=True,
            )
            # Alcove recessed floor, ceiling, and side reveals (X from -10.22 out to -10.68)
            mb.add_quad((-10.68, 0.88, 1.30), (-10.22, 0.88, 1.30), (-10.22, 0.88, -1.30), (-10.68, 0.88, -1.30), UV_CURB)
            mb.add_quad((-10.22, 3.35, 1.30), (-10.68, 3.35, 1.30), (-10.68, 3.35, -1.30), (-10.22, 3.35, -1.30), UV_STEEL)
            mb.add_quad((-10.68, 0.88, -1.30), (-10.22, 0.88, -1.30), (-10.22, 3.35, -1.30), (-10.68, 3.35, -1.30), UV_STEEL)
            mb.add_quad((-10.22, 0.88, 1.30), (-10.68, 0.88, 1.30), (-10.68, 3.35, 1.30), (-10.22, 3.35, 1.30), UV_STEEL)
            # Alcove back wall + pressurized bulkhead door
            mb.add_quad((-10.68, 0.88, -1.30), (-10.68, 0.88, 1.30), (-10.68, 3.35, 1.30), (-10.68, 3.35, -1.30), UV_STEEL, flip=True)
            mb.add_quad((-10.65, 0.92, -0.68), (-10.65, 0.92, 0.68), (-10.65, 2.95, 0.68), (-10.65, 2.95, -0.68), UV_EXIT_DR, flip=True)
            # Protruding Glowing Green Emergency EXIT Lightbox Sign above alcove (visible looking down bore!)
            mb.add_box(-10.26, 3.02, -0.85, -10.08, 3.38, 0.85, UV_STEEL)
            # Front/inward/rear glowing green EXIT faces
            mb.add_quad((-10.075, 3.05, -0.80), (-10.075, 3.05, 0.80), (-10.075, 3.35, 0.80), (-10.075, 3.35, -0.80), UV_EXIT_SGN, flip=True)
            mb.add_quad((-10.25, 3.05, 0.855), (-10.08, 3.05, 0.855), (-10.08, 3.35, 0.855), (-10.25, 3.35, 0.855), UV_EXIT_SGN)
        else:
            # Right wall: Recessed SOS & Fire-Suppression Telemetry Niche in Z in [+1.20, +2.80]
            spans = [(-6.0, 1.20), (2.80, 6.0)]
            for sz0, sz1 in spans:
                mb.add_quad(
                    (10.22, 0.88, sz0), (10.22, 0.88, sz1),
                    (10.22, 3.98, sz1), (10.22, 3.98, sz0),
                    UV_CERAMIC,
                )
            mb.add_quad((10.22, 0.88, 1.20), (10.22, 0.88, 2.80), (10.22, 1.15, 2.80), (10.22, 1.15, 1.20), UV_CERAMIC)
            mb.add_quad((10.22, 3.10, 1.20), (10.22, 3.10, 2.80), (10.22, 3.98, 2.80), (10.22, 3.98, 1.20), UV_CERAMIC)
            # Niche box (X = 10.22 .. 10.58)
            mb.add_quad((10.22, 1.15, 2.80), (10.58, 1.15, 2.80), (10.58, 1.15, 1.20), (10.22, 1.15, 1.20), UV_STEEL)
            mb.add_quad((10.58, 3.10, 2.80), (10.22, 3.10, 2.80), (10.22, 3.10, 1.20), (10.58, 3.10, 1.20), UV_STEEL)
            mb.add_quad((10.22, 1.15, 1.20), (10.58, 1.15, 1.20), (10.58, 3.10, 1.20), (10.22, 3.10, 1.20), UV_STEEL)
            mb.add_quad((10.58, 1.15, 2.80), (10.22, 1.15, 2.80), (10.22, 3.10, 2.80), (10.58, 3.10, 2.80), UV_STEEL)
            mb.add_quad((10.56, 1.18, 1.24), (10.56, 1.18, 2.76), (10.56, 3.06, 2.76), (10.56, 3.06, 1.24), UV_SOS_PNL)
            # Overhead green SOS indicator tab
            mb.add_box(10.08, 2.88, 1.55, 10.24, 3.14, 2.45, UV_STEEL)
            mb.add_quad((10.075, 2.91, 1.60), (10.075, 2.91, 2.40), (10.075, 3.11, 2.40), (10.075, 3.11, 1.60), UV_EXIT_SGN)

        # Continuous architectural cornice beam at Y = 3.92 .. 4.06
        mb.add_box(side * 10.12, 3.92, -6.0, side * 10.38, 4.06, 6.0, UV_STEEL, faces=("x-", "x+", "y+", "y-"))

        # Illuminated subsea depth / sector marker plaque at Z = 0.0, Y = 4.32..4.72
        mb.add_box(side * 10.02, 4.30, -0.55, side * 10.26, 4.74, 0.55, UV_STEEL)
        px = side * 10.014
        mb.add_quad(
            (px, 4.35, -0.48), (px, 4.35, 0.48),
            (px, 4.69, 0.48), (px, 4.69, -0.48),
            UV_LED_CYAN,
            flip=not is_right,
        )


def build_cove_lights_and_haunch_utilities(mb):
    """
    - Continuous recessed ice-cyan (#00e5ff) upper cove LED light strips (4 lines down the vault)
    - Twin pressurized subsea coolant/drainage pipes + bolted clamps + cable ladder trays on upper haunches
    All strictly outside |X| < 9.30 for Y < 7.60 (utilities at |X| >= 9.72; cove LEDs at Y >= 8.20).
    """
    for side in (-1.0, 1.0):
        # 1. Twin pressurized steel utility mains along upper wall haunch (|X| = 9.90, Y = 5.15 & 5.62)
        for py in (5.15, 5.62):
            mb.add_cylinder_z(side * 9.92, py, -6.0, 6.0, 0.125, segs=10, uv_rect=UV_STEEL)
            # Bolted pipe clamps every 3m
            for cz in (-4.5, -1.5, 1.5, 4.5):
                mb.add_box(
                    side * 9.76, py - 0.16, cz - 0.08,
                    side * 10.22, py + 0.16, cz + 0.08,
                    UV_STEEL,
                    faces=("x-", "x+", "y+", "y-", "z-", "z+"),
                )

        # 2. High-voltage fiber/power cable ladder tray along |X| = 9.80, Y = 6.32
        mb.add_box(side * 9.68, 6.26, -6.0, side * 10.12, 6.34, 6.0, UV_STEEL, faces=("x-", "x+", "y+", "y-"))
        mb.add_box(side * 9.68, 6.34, -6.0, side * 9.73, 6.48, 6.0, UV_STEEL, faces=("x-", "x+", "y+"))
        for bz in (-4.5, -1.5, 1.5, 4.5):
            mb.add_box(side * 9.66, 6.14, bz - 0.06, side * 10.14, 6.26, bz + 0.06, UV_STEEL)

        # 3. Primary Upper Cove Linear Ice-Cyan (#00e5ff) LED Fixture (|X| = 8.38, Y = 8.24)
        # Angled at 38 degrees inward/downward toward the DeLorean & wet asphalt!
        cx, cy = side * 8.38, 8.24
        ang = side * 0.62  # tilt normal inward & down
        ca, sa = math.cos(ang), math.sin(ang)

        def rot_pt(lx, ly):
            return (cx + lx * ca - ly * sa, cy + lx * sa + ly * ca)

        # Aluminum reflector trough housing
        h0 = rot_pt(-0.22, 0.08)
        h1 = rot_pt(0.22, 0.08)
        h2 = rot_pt(0.18, -0.06)
        h3 = rot_pt(-0.18, -0.06)
        mb.add_quad((h0[0], h0[1], -6.0), (h1[0], h1[1], -6.0), (h1[0], h1[1], 6.0), (h0[0], h0[1], 6.0), UV_STEEL)
        mb.add_quad((h0[0], h0[1], 6.0), (h3[0], h3[1], 6.0), (h3[0], h3[1], -6.0), (h0[0], h0[1], -6.0), UV_STEEL)
        mb.add_quad((h2[0], h2[1], 6.0), (h1[0], h1[1], 6.0), (h1[0], h1[1], -6.0), (h2[0], h2[1], -6.0), UV_STEEL)
        # Glowing ice-cyan diffuser lens face (split into 4x3m spans for crisp louver UV tiling)
        l0 = rot_pt(-0.14, -0.062)
        l1 = rot_pt(0.14, -0.062)
        for iz in range(4):
            z0 = -6.0 + iz * 3.0
            z1 = z0 + 3.0
            mb.add_quad(
                (l0[0], l0[1], z0), (l1[0], l1[1], z0),
                (l1[0], l1[1], z1), (l0[0], l0[1], z1),
                UV_LED_CYAN,
            )

        # 4. Secondary High Vault Ice-Cyan LED Accent Strip (|X| = 5.55, Y = 8.82)
        vx0, vx1 = side * 5.44, side * 5.68
        mb.add_box(vx0, 8.83, -6.0, vx1, 8.91, 6.0, UV_STEEL, faces=("x-", "x+", "y-"))
        xa, xb = sorted((side * 5.47, side * 5.65))
        for iz in range(4):
            z0 = -6.0 + iz * 3.0
            z1 = z0 + 3.0
            mb.add_quad(
                (xa, 8.822, z0), (xb, 8.822, z0),
                (xb, 8.822, z1), (xa, 8.822, z1),
                UV_LED_CYAN,
            )


def build_jet_fan_housings(mb, z_center=-3.0):
    """
    Suspended twin cylindrical axial jet-fan booster turbine nacelles at (X = +-3.80, Y = 8.20, Z = -3.0).
    Lowest point of nacelle = 8.20 - 0.46 = 7.74m (> 7.60m clearance!).
    """
    r_outer = 0.46
    r_inner = 0.39
    z0, z1 = z_center - 1.25, z_center + 1.25

    for cx in (-3.80, 3.80):
        # Outer cylindrical acoustic silencer drum
        mb.add_cylinder_z(cx, 8.20, z0, z1, r_outer, segs=20, uv_rect=UV_STEEL)
        # Flared aerodynamic intake/exhaust bellmouth collars
        mb.add_cylinder_z(cx, 8.20, z0 - 0.16, z0, r_outer + 0.03, r_outer, segs=20, uv_rect=UV_STEEL)
        mb.add_cylinder_z(cx, 8.20, z1, z1 + 0.16, r_outer, r_outer + 0.03, segs=20, uv_rect=UV_STEEL)
        # Inner shroud barrel (dark steel interior)
        mb.add_cylinder_z(cx, 8.20, z0 - 0.16, z1 + 0.16, r_inner, segs=20, uv_rect=UV_STEEL, inward=True)
        # Front & rear bellmouth annular rims + subtle glowing cyan intake status ring on +Z camera side!
        mb.add_annulus_z(cx, 8.20, z0 - 0.16, r_inner, r_outer + 0.03, segs=20, uv_rect=UV_STEEL, face_plus_z=False)
        mb.add_annulus_z(cx, 8.20, z1 + 0.16, r_inner, r_outer + 0.03, segs=20, uv_rect=UV_STEEL, face_plus_z=True)
        mb.add_annulus_z(cx, 8.20, z1 + 0.164, r_inner + 0.015, r_inner + 0.042, segs=20, uv_rect=UV_LED_CYAN, face_plus_z=True)

        # Acoustic stiffening rings around drum
        for rz in (z_center - 0.65, z_center, z_center + 0.65):
            mb.add_cylinder_z(cx, 8.20, rz - 0.05, rz + 0.05, r_outer + 0.025, segs=20, uv_rect=UV_STEEL)

        # Internal stationary stator vanes + motor pod support struts (behind rotor at z_center - 0.35)
        mb.add_cylinder_z(cx, 8.20, z_center - 0.65, z_center + 0.05, 0.12, segs=12, uv_rect=UV_STEEL, cap_start=True, cap_end=True)
        for iv in range(4):
            ang = iv * (math.pi * 0.5) + math.pi * 0.25
            vx, vy = math.cos(ang), math.sin(ang)
            p_in = (cx + vx * 0.11, 8.20 + vy * 0.11)
            p_out = (cx + vx * r_inner, 8.20 + vy * r_inner)
            mb.add_quad(
                (p_in[0], p_in[1], z_center - 0.55),
                (p_out[0], p_out[1], z_center - 0.55),
                (p_out[0], p_out[1], z_center - 0.25),
                (p_in[0], p_in[1], z_center - 0.25),
                UV_STEEL,
            )

        # Twin heavy angled steel suspension V-struts anchoring drum up to vault (Y = 8.58 -> 9.08)
        for sz in (z_center - 0.72, z_center + 0.72):
            for dx in (-0.30, 0.30):
                mb.add_box(cx + dx - 0.045, 8.55, sz - 0.05, cx + dx + 0.045, 9.08, sz + 0.05, UV_STEEL)


def build_fan_rotor_mesh(name, spin_handedness=1.0):
    """
    Builds a single TunnelFanRotor mesh centered strictly at LOCAL (0, 0, 0)!
    Radius = 0.365m (fits cleanly inside r_inner = 0.39m with zero wobble when rotated around Z).
    """
    rmb = MeshBuilder(name)
    # Aerodynamic nosecone spinner at +Z (facing camera) and hub barrel
    rmb.add_cylinder_z(0.0, 0.0, -0.14, 0.08, 0.115, 0.115, segs=14, uv_rect=UV_STEEL, cap_start=True)
    rmb.add_cylinder_z(0.0, 0.0, 0.08, 0.28, 0.115, 0.015, segs=14, uv_rect=UV_STEEL, cap_end=True)

    # 7 pitched axial turbine blades
    num_blades = 7
    r_root = 0.105
    r_tip = 0.368
    chord = 0.115
    pitch = 0.58 * spin_handedness  # ~33 deg blade twist

    for i in range(num_blades):
        a = (i / num_blades) * math.tau
        ca, sa = math.cos(a), math.sin(a)
        # Tangent vector in XY plane perpendicular to radial (ca, sa)
        tx, ty = -sa, ca

        dz = math.sin(pitch) * (chord * 0.5)
        dt = math.cos(pitch) * (chord * 0.5)

        # Root leading/trailing & Tip leading/trailing (slightly tapered/swept tip)
        p_rl = (ca * r_root + tx * dt, sa * r_root + ty * dt, dz)
        p_rt = (ca * r_root - tx * dt, sa * r_root - ty * dt, -dz)
        p_tt = (ca * r_tip - tx * (dt * 0.82), sa * r_tip - ty * (dt * 0.82), -dz * 0.85)
        p_tl = (ca * r_tip + tx * (dt * 0.82), sa * r_tip + ty * (dt * 0.82), dz * 0.85)

        # Double-sided thickened blade airfoil (front + back faces + tip cap)
        thick = 0.014
        nx, ny, nz = v_norm(v_cross(v_sub(p_rt, p_rl), v_sub(p_tl, p_rl)))
        off = (nx * thick, ny * thick, nz * thick)

        f0 = (p_rl[0] + off[0], p_rl[1] + off[1], p_rl[2] + off[2])
        f1 = (p_rt[0] + off[0], p_rt[1] + off[1], p_rt[2] + off[2])
        f2 = (p_tt[0] + off[0], p_tt[1] + off[1], p_tt[2] + off[2])
        f3 = (p_tl[0] + off[0], p_tl[1] + off[1], p_tl[2] + off[2])

        b0 = (p_rl[0] - off[0], p_rl[1] - off[1], p_rl[2] - off[2])
        b1 = (p_rt[0] - off[0], p_rt[1] - off[1], p_rt[2] - off[2])
        b2 = (p_tt[0] - off[0], p_tt[1] - off[1], p_tt[2] - off[2])
        b3 = (p_tl[0] - off[0], p_tl[1] - off[1], p_tl[2] - off[2])

        rmb.add_quad(f0, f1, f2, f3, UV_STEEL)
        rmb.add_quad(b0, b1, b2, b3, UV_STEEL, flip=True)
        rmb.add_quad(f3, f2, b2, b3, UV_STEEL)

    return rmb


def build_lane_control_gantry(mb, z_center=3.0):
    """
    Slim overhead electronic lane-control space-frame gantry at Z = +3.0, Y in [7.68, 8.26]:
      - 3 glowing green downward lane arrow (↓) matrix signs over X = -3.0, 0.0, +3.0
      - 2 flank amber speed/clearance beacon panels at X = -6.40, +6.40
    Strictly respects Y >= 7.68 (> 7.60 clearance!).
    """
    # 1. Twin horizontal dark-steel space-frame chord beams spanning X in [-9.52, +9.52]
    z_front = z_center + 0.16
    z_back = z_center - 0.16
    for y_beam in (7.84, 8.16):
        mb.add_box(-9.52, y_beam - 0.035, z_front - 0.035, 9.52, y_beam + 0.035, z_front + 0.035, UV_STEEL)
        mb.add_box(-9.52, y_beam - 0.035, z_back - 0.035, 9.52, y_beam + 0.035, z_back + 0.035, UV_STEEL)

    # Vertical & cross truss struts every 1.6m + vault hanger rods up to arch rib
    for ix in range(13):
        sx = -9.6 + ix * 1.6
        if abs(sx) <= 9.45:
            mb.add_box(sx - 0.025, 7.84, z_back, sx + 0.025, 8.16, z_front, UV_STEEL)
    for hx in (-7.6, -4.6, -1.6, 1.6, 4.6, 7.6):
        mb.add_box(hx - 0.035, 8.16, z_center - 0.04, hx + 0.035, 8.78, z_center + 0.04, UV_STEEL)

    # 2. Three Electronic Lane-Control Matrix Signs at X = -3.0, 0.0, +3.0 (Y in [7.68, 8.26])
    for lx in (-3.0, 0.0, 3.0):
        hw = 0.62
        y_bot, y_top = 7.68, 8.26
        zf = z_center + 0.22
        zb = z_center - 0.20
        # Matte steel matrix sign cabinet + sun visor hood
        mb.add_box(lx - hw, y_bot, zb, lx + hw, y_top, zf, UV_STEEL)
        mb.add_box(lx - hw - 0.03, y_top - 0.04, zf, lx + hw + 0.03, y_top + 0.02, zf + 0.10, UV_STEEL)
        # Camera-facing (+Z) crisp glowing green downward arrow (↓) LED matrix display
        mb.add_quad(
            (lx - hw + 0.04, y_bot + 0.04, zf + 0.006),
            (lx + hw - 0.04, y_bot + 0.04, zf + 0.006),
            (lx + hw - 0.04, y_top - 0.05, zf + 0.006),
            (lx - hw + 0.04, y_top - 0.05, zf + 0.006),
            UV_SIGN_ARR,
        )

    # 3. Flank Amber Speed / Clearance Caution Beacon Panels at X = -6.40, +6.40 (Y in [7.72, 8.22])
    for bx in (-6.40, 6.40):
        hw = 0.72
        y_bot, y_top = 7.72, 8.22
        zf = z_center + 0.21
        zb = z_center - 0.18
        mb.add_box(bx - hw, y_bot, zb, bx + hw, y_top, zf, UV_STEEL)
        mb.add_quad(
            (bx - hw + 0.04, y_bot + 0.04, zf + 0.006),
            (bx + hw - 0.04, y_bot + 0.04, zf + 0.006),
            (bx + hw - 0.04, y_top - 0.04, zf + 0.006),
            (bx - hw + 0.04, y_top - 0.04, zf + 0.006),
            UV_SIGN_BCN,
        )


# =============================================================================
# 4. CLEARANCE VERIFICATION & GLTF 2.0 BINARY (.GLB) SERIALIZER
# =============================================================================

def verify_clearance(mesh_builders_with_offsets):
    """
    Strictly verifies that EVERY vertex in scene coordinates:
      1) lies within Z in [-6.0, +6.0] (within 1e-4 float tolerance)
      2) stays 100% OUTSIDE the camera/highway clearance box (|X| < 9.30 and 0.0 <= Y < 7.60)
      3) has consistent triangle winding vs vertex normals (dot > 0) so PBR lighting never inverts
    """
    violations = []
    z_violations = []
    normal_violations = []
    for mb, (ox, oy, oz) in mesh_builders_with_offsets:
        for idx, (lx, ly, lz) in enumerate(mb.positions):
            wx, wy, wz = lx + ox, ly + oy, lz + oz
            if wz < -6.0002 or wz > 6.0002:
                z_violations.append((mb.name, idx, round(wx, 3), round(wy, 3), round(wz, 3)))
            if abs(wx) < 9.30 and 0.0 <= wy < 7.60:
                violations.append((mb.name, idx, round(wx, 3), round(wy, 3), round(wz, 3)))

        for t in range(0, len(mb.indices), 3):
            i0, i1, i2 = mb.indices[t], mb.indices[t + 1], mb.indices[t + 2]
            p0, p1, p2 = mb.positions[i0], mb.positions[i1], mb.positions[i2]
            fn = v_cross(v_sub(p1, p0), v_sub(p2, p0))
            fl = math.sqrt(fn[0] * fn[0] + fn[1] * fn[1] + fn[2] * fn[2])
            if fl > 1e-8:
                fn = (fn[0] / fl, fn[1] / fl, fn[2] / fl)
                vn = mb.normals[i0]
                dot = fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2]
                if dot < -0.05:
                    normal_violations.append((mb.name, t // 3, round(dot, 3)))

    if z_violations:
        raise AssertionError(f"Z-bounds [-6, +6] violated ({len(z_violations)} verts): {z_violations[:5]}")
    if violations:
        raise AssertionError(f"Interior clearance (|X|<9.3, 0<=Y<7.6) violated ({len(violations)} verts): {violations[:5]}")
    if normal_violations:
        raise AssertionError(f"Inverted normals vs winding ({len(normal_violations)} tris): {normal_violations[:5]}")


def pack_mesh_primitive(mb, bin_blob, buffer_views, accessors, material_idx):
    def align4(blob):
        rem = len(blob) % 4
        if rem:
            blob.extend(b"\x00" * (4 - rem))

    n_verts = len(mb.positions)
    if n_verts == 0 or n_verts > 65535:
        raise ValueError(f"Mesh {mb.name} vertex count {n_verts} out of uint16 range")

    # POSITION (VEC3 float32)
    align4(bin_blob)
    pos_off = len(bin_blob)
    xs = [p[0] for p in mb.positions]
    ys = [p[1] for p in mb.positions]
    zs = [p[2] for p in mb.positions]
    for p in mb.positions:
        bin_blob.extend(struct.pack("<fff", p[0], p[1], p[2]))
    pos_len = len(bin_blob) - pos_off
    pos_bv = len(buffer_views)
    buffer_views.append({"buffer": 0, "byteOffset": pos_off, "byteLength": pos_len, "target": 34962})
    pos_acc = len(accessors)
    accessors.append({
        "bufferView": pos_bv,
        "componentType": 5126,
        "count": n_verts,
        "type": "VEC3",
        "min": [min(xs), min(ys), min(zs)],
        "max": [max(xs), max(ys), max(zs)],
    })

    # NORMAL (VEC3 float32)
    align4(bin_blob)
    nrm_off = len(bin_blob)
    for n in mb.normals:
        bin_blob.extend(struct.pack("<fff", n[0], n[1], n[2]))
    nrm_len = len(bin_blob) - nrm_off
    nrm_bv = len(buffer_views)
    buffer_views.append({"buffer": 0, "byteOffset": nrm_off, "byteLength": nrm_len, "target": 34962})
    nrm_acc = len(accessors)
    accessors.append({
        "bufferView": nrm_bv,
        "componentType": 5126,
        "count": n_verts,
        "type": "VEC3",
    })

    # TEXCOORD_0 (VEC2 float32)
    align4(bin_blob)
    uv_off = len(bin_blob)
    for uv in mb.uvs:
        bin_blob.extend(struct.pack("<ff", uv[0], uv[1]))
    uv_len = len(bin_blob) - uv_off
    uv_bv = len(buffer_views)
    buffer_views.append({"buffer": 0, "byteOffset": uv_off, "byteLength": uv_len, "target": 34962})
    uv_acc = len(accessors)
    accessors.append({
        "bufferView": uv_bv,
        "componentType": 5126,
        "count": n_verts,
        "type": "VEC2",
    })

    # INDICES (SCALAR uint16)
    align4(bin_blob)
    idx_off = len(bin_blob)
    for idx in mb.indices:
        bin_blob.extend(struct.pack("<H", idx))
    idx_len = len(bin_blob) - idx_off
    idx_bv = len(buffer_views)
    buffer_views.append({"buffer": 0, "byteOffset": idx_off, "byteLength": idx_len, "target": 34963})
    idx_acc = len(accessors)
    accessors.append({
        "bufferView": idx_bv,
        "componentType": 5123,
        "count": len(mb.indices),
        "type": "SCALAR",
    })

    return {
        "attributes": {
            "POSITION": pos_acc,
            "NORMAL": nrm_acc,
            "TEXCOORD_0": uv_acc,
        },
        "indices": idx_acc,
        "material": material_idx,
    }


def write_glb(out_path, static_mb, led_mb, rotor_l_mb, rotor_r_mb, png_base, png_emis):
    bin_blob = bytearray()
    buffer_views = []
    accessors = []

    prim_static = pack_mesh_primitive(static_mb, bin_blob, buffer_views, accessors, material_idx=0)
    prim_led = pack_mesh_primitive(led_mb, bin_blob, buffer_views, accessors, material_idx=1)
    prim_rotor_l = pack_mesh_primitive(rotor_l_mb, bin_blob, buffer_views, accessors, material_idx=2)
    prim_rotor_r = pack_mesh_primitive(rotor_r_mb, bin_blob, buffer_views, accessors, material_idx=2)

    # Pack embedded PNG images
    def pack_image_bytes(img_bytes):
        rem = len(bin_blob) % 4
        if rem:
            bin_blob.extend(b"\x00" * (4 - rem))
        off = len(bin_blob)
        bin_blob.extend(img_bytes)
        bv_idx = len(buffer_views)
        buffer_views.append({"buffer": 0, "byteOffset": off, "byteLength": len(img_bytes)})
        return bv_idx

    emis_bv = pack_image_bytes(png_emis)
    base_bv = pack_image_bytes(png_base)

    while len(bin_blob) % 4 != 0:
        bin_blob.append(0)

    gltf = {
        "asset": {
            "generator": "NightDrive Subsea Megatunnel Builder (build_road_tunnel.py)",
            "version": "2.0",
        },
        "extensionsUsed": [
            "KHR_materials_emissive_strength",
        ],
        "scene": 0,
        "scenes": [
            {
                "name": "Scene",
                "nodes": [0],
            }
        ],
        "nodes": [
            {
                "name": "night-drive-tunnel",
                "mesh": 0,
                "children": [1, 2, 3],
            },
            {
                "name": "TunnelArchLED",
                "mesh": 1,
            },
            {
                "name": "TunnelFanRotor",
                "mesh": 2,
                "translation": [-3.80, 8.20, -3.00],
            },
            {
                "name": "TunnelFanRotor_R",
                "mesh": 3,
                "translation": [3.80, 8.20, -3.00],
            },
        ],
        "meshes": [
            {"name": "Tunnel_Mesh", "primitives": [prim_static]},
            {"name": "TunnelArchLED_Mesh", "primitives": [prim_led]},
            {"name": "TunnelFanRotor_L_Mesh", "primitives": [prim_rotor_l]},
            {"name": "TunnelFanRotor_R_Mesh", "primitives": [prim_rotor_r]},
        ],
        "materials": [
            {
                "name": "Tunnel_Material",
                "doubleSided": True,
                "emissiveFactor": [1.0, 1.0, 1.0],
                "emissiveTexture": {"index": 0},
                "extensions": {
                    "KHR_materials_emissive_strength": {"emissiveStrength": 1.65}
                },
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 1},
                    "metallicFactor": 0.48,
                    "roughnessFactor": 0.34,
                },
            },
            {
                "name": "TunnelArchLED_Material",
                "doubleSided": True,
                "emissiveFactor": [0.02, 0.42, 1.0],
                "extensions": {
                    "KHR_materials_emissive_strength": {"emissiveStrength": 1.75}
                },
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.04, 0.14, 0.32, 1.0],
                    "metallicFactor": 0.50,
                    "roughnessFactor": 0.25,
                },
            },
            {
                "name": "TunnelFanBlade_Material",
                "doubleSided": True,
                "emissiveFactor": [0.0, 0.06, 0.10],
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.44, 0.51, 0.60, 1.0],
                    "metallicFactor": 0.85,
                    "roughnessFactor": 0.22,
                },
            },
        ],
        "textures": [
            {"sampler": 0, "source": 0},
            {"sampler": 0, "source": 1},
        ],
        "images": [
            {"bufferView": emis_bv, "mimeType": "image/png", "name": "tunnel_emissive"},
            {"bufferView": base_bv, "mimeType": "image/png", "name": "tunnel_basecolor"},
        ],
        "samplers": [
            {"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}
        ],
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_blob)}],
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4 != 0:
        json_bytes += b" "

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_blob)
    header = struct.pack("<III", 0x46546C67, 2, total_len)
    json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    bin_chunk = struct.pack("<II", len(bin_blob), 0x004E4942) + bytes(bin_blob)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(header + json_chunk + bin_chunk)

    return total_len


def main():
    repo_root = Path(__file__).resolve().parent.parent
    out_path = repo_root / "assets" / "models" / "night-drive-tunnel.glb"

    static_mb = MeshBuilder("Tunnel_Static")
    led_mb = MeshBuilder("TunnelArchLED")

    build_bore_shell(static_mb)
    build_structural_arch_ribs(static_mb, led_mb)
    build_curbs_walkways_and_walls(static_mb)
    build_cove_lights_and_haunch_utilities(static_mb)
    build_jet_fan_housings(static_mb, z_center=-3.0)
    build_lane_control_gantry(static_mb, z_center=3.0)

    rotor_l_mb = build_fan_rotor_mesh("TunnelFanRotor", spin_handedness=1.0)
    rotor_r_mb = build_fan_rotor_mesh("TunnelFanRotor_R", spin_handedness=-1.0)

    verify_clearance([
        (static_mb, (0.0, 0.0, 0.0)),
        (led_mb, (0.0, 0.0, 0.0)),
        (rotor_l_mb, (-3.80, 8.20, -3.00)),
        (rotor_r_mb, (3.80, 8.20, -3.00)),
    ])

    png_base, png_emis = build_tunnel_textures(size=512)
    total_bytes = write_glb(str(out_path), static_mb, led_mb, rotor_l_mb, rotor_r_mb, png_base, png_emis)

    total_verts = (
        len(static_mb.positions)
        + len(led_mb.positions)
        + len(rotor_l_mb.positions)
        + len(rotor_r_mb.positions)
    )
    total_tris = (
        len(static_mb.indices)
        + len(led_mb.indices)
        + len(rotor_l_mb.indices)
        + len(rotor_r_mb.indices)
    ) // 3
    print(
        f"[build_road_tunnel] Wrote {out_path} ({total_bytes / 1024:.1f} KB | "
        f"{total_verts} verts | {total_tris} tris | clearance verified)"
    )


if __name__ == "__main__":
    main()
