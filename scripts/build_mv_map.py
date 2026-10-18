#!/usr/bin/env python3
"""
Builds assets/mountain-view-map.json, the compact map bundle behind mountain-view.html.

Sources (OpenStreetMap via Overpass, ODbL; Microsoft Global ML Building Footprints heights):
  --gis    the cleaned building footprints with heights (8,010). No longer shipped; recover it with
           `git show d78cd26:assets/mountain-view-gis.json > /tmp/mountain-view-gis.json`
  --cache  a folder holding the raw Overpass dumps streets_and_aeroway_raw.json,
           infrastructure_raw.json and boundary_and_water_raw.json (not shipped; see
           scripts/build_mv_gis.py in git history for how they were fetched).

Output coordinates are local metres from (37.396 N, -122.079 W), stored as integer
decimetres so the bundle stays small. Every layer is a flat [x0,y0,x1,y1,...] list.
"""
import argparse, json, math, os, re, sys
from collections import defaultdict

LAT0, LON0 = 37.396, -122.079
R = 6378137.0
BOUNDS = {"minLat": 37.355, "maxLat": 37.445, "minLon": -122.120, "maxLon": -122.040}

def proj(lon, lat):
    x = math.radians(lon - LON0) * R * math.cos(math.radians(LAT0))
    y = math.radians(lat - LAT0) * R
    return x, y

def dm(v):
    return int(round(v * 10))

def flat(pts):
    out = []
    last = None
    for x, y in pts:
        p = (dm(x), dm(y))
        if p != last:
            out.extend(p)
            last = p
    return out

def simplify(pts, eps):
    """Douglas-Peucker on a list of (x, y) metres."""
    if len(pts) < 3:
        return pts
    def dist(p, a, b):
        ax, ay = a; bx, by = b; px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    stack = [(0, len(pts) - 1)]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    while stack:
        i, j = stack.pop()
        best, bi = 0.0, -1
        for k in range(i + 1, j):
            d = dist(pts[k], pts[i], pts[j])
            if d > best:
                best, bi = d, k
        if best > eps:
            keep[bi] = True
            stack.append((i, bi)); stack.append((bi, j))
    return [p for p, k in zip(pts, keep) if k]

def ring_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return a / 2.0

def geom_pts(el):
    return [proj(g["lon"], g["lat"]) for g in el.get("geometry", [])]

def closed(el):
    g = el.get("geometry") or []
    return len(g) > 3 and g[0]["lat"] == g[-1]["lat"] and g[0]["lon"] == g[-1]["lon"]

def assemble_rings(members, role="outer"):
    """Join relation member ways (with geometry) into closed rings."""
    segs = []
    for m in members:
        if m.get("type") != "way" or m.get("role", "outer") != role or not m.get("geometry"):
            continue
        segs.append([(round(g["lon"], 7), round(g["lat"], 7)) for g in m["geometry"]])
    rings = []
    while segs:
        ring = segs.pop(0)
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[-1]:
                    ring += list(reversed(s))[1:]; segs.pop(i); changed = True; break
                if s[-1] == ring[0]:
                    ring = s[:-1] + ring; segs.pop(i); changed = True; break
                if s[0] == ring[0]:
                    ring = list(reversed(s))[:-1] + ring; segs.pop(i); changed = True; break
        if len(ring) > 3:
            rings.append([proj(lon, lat) for lon, lat in ring])
    return rings

ROAD_CLASS = {
    "motorway": "mw", "motorway_link": "mwl", "trunk": "tr", "trunk_link": "trl",
    "primary": "pr", "primary_link": "prl", "secondary": "se", "secondary_link": "sel",
    "tertiary": "te", "tertiary_link": "tel", "residential": "re", "unclassified": "re",
    "living_street": "re", "pedestrian": "pe", "cycleway": "cy",
}
ICON = [
    (re.compile(r"hangar one", re.I), "hangar1"),
    (re.compile(r"hangar (2|3|two|three)", re.I), "hangar"),
    (re.compile(r"canopy", re.I), "canopy"),
    (re.compile(r"amphitheat", re.I), "amphitheatre"),
    (re.compile(r"computer history museum", re.I), "chm"),
    (re.compile(r"^google", re.I), "google"),
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gis", default="assets/mountain-view-gis.json")
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default="assets/mountain-view-map.json")
    a = ap.parse_args()

    gis = json.load(open(a.gis))
    buildings = []
    for b in gis["buildings"]:
        pts = [proj(lon, lat) for lon, lat in b["polygon"]]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        pts = simplify(pts, 0.6)
        if len(pts) < 3 or abs(ring_area(pts)) < 6:
            continue
        name = b.get("name") or ""
        kind = ""
        for rx, k in ICON:
            if name and rx.search(name):
                kind = k; break
        h = max(3.0, min(70.0, float(b.get("height_m") or 4.0)))
        rec = {"h": round(h, 1), "p": flat(pts)}
        if kind: rec["k"] = kind
        if name and (kind or b.get("area_m2", 0) > 2500): rec["n"] = name
        buildings.append(rec)

    def load(fn):
        return json.load(open(os.path.join(a.cache, fn))).get("elements", [])

    # the blimp hangars at Moffett are untagged for height in the cleaned set; pull them from the raw dump
    have = {b.get("n") for b in buildings}
    for el in load("buildings_tagged_raw.json"):
        t = el.get("tags", {})
        name = t.get("name", "")
        if not re.match(r"^Hangar [23]$", name) or name in have or not el.get("geometry"):
            continue
        pts = geom_pts(el)
        if pts and pts[0] == pts[-1]:
            pts = pts[:-1]
        if len(pts) >= 3:
            buildings.append({"h": 58.0, "p": flat(pts), "k": "hangar", "n": name})
    streets = load("streets_and_aeroway_raw.json")
    infra = load("infrastructure_raw.json")
    bw = load("boundary_and_water_raw.json")

    roads, rail, streams = [], [], []
    runways, taxiways, aprons = [], [], []
    water, wetland, parks = [], [], []
    seen = set()
    for el in streets + infra + bw:
        if el.get("type") == "way":
            key = ("w", el["id"])
            if key in seen: continue
            seen.add(key)
            t = el.get("tags", {})
            pts = geom_pts(el)
            if len(pts) < 2: continue
            hw = t.get("highway")
            if hw in ROAD_CLASS:
                roads.append({"c": ROAD_CLASS[hw], "p": flat(simplify(pts, 1.2))})
                continue
            rw = t.get("railway")
            if rw in ("rail", "light_rail"):
                rail.append({"c": "lr" if rw == "light_rail" else "rail", "p": flat(simplify(pts, 1.2))})
                continue
            ww = t.get("waterway")
            if ww in ("stream", "river", "canal"):
                streams.append({"p": flat(simplify(pts, 2.0))})
                continue
            aw = t.get("aeroway")
            if aw == "runway":
                w = float(re.sub(r"[^0-9.]", "", t.get("width", "45") or "45") or 45)
                runways.append({"w": round(w, 1), "p": flat(pts)})
                continue
            if aw == "taxiway":
                taxiways.append({"p": flat(simplify(pts, 1.0))})
                continue
            if aw == "apron" and closed(el):
                aprons.append({"p": flat(simplify(pts[:-1], 1.0))})
                continue
            nat = t.get("natural")
            if nat in ("water", "bay") and closed(el):
                water.append({"n": t.get("name", ""), "p": flat(simplify(pts[:-1], 1.0))})
                continue
            if nat == "wetland" and closed(el):
                wetland.append({"p": flat(simplify(pts[:-1], 1.5))})
                continue
            if t.get("leisure") == "park" and closed(el):
                parks.append({"n": t.get("name", ""), "p": flat(simplify(pts[:-1], 1.0))})
                continue
        elif el.get("type") == "relation":
            key = ("r", el["id"])
            if key in seen: continue
            seen.add(key)
            t = el.get("tags", {})
            nat = t.get("natural")
            target = None
            if nat in ("water", "bay"): target = water
            elif nat == "wetland": target = wetland
            elif t.get("leisure") == "park": target = parks
            if target is None: continue
            for ring in assemble_rings(el.get("members", [])):
                if abs(ring_area(ring)) < 50: continue
                rec = {"p": flat(simplify(ring, 1.5))}
                if target is not water or t.get("name"): rec["n"] = t.get("name", "")
                target.append(rec)

    minx, miny = proj(BOUNDS["minLon"], BOUNDS["minLat"])
    maxx, maxy = proj(BOUNDS["maxLon"], BOUNDS["maxLat"])
    out = {
        "origin": {"lat": LAT0, "lon": LON0},
        "units": "decimetres",
        "bounds": [dm(minx), dm(miny), dm(maxx), dm(maxy)],
        "buildings": buildings,
        "roads": roads, "rail": rail, "streams": streams,
        "aero": {"runways": runways, "taxiways": taxiways, "aprons": aprons},
        "water": water, "wetland": wetland, "parks": parks,
        "attribution": "© OpenStreetMap contributors (ODbL); building heights © Microsoft (ODbL)",
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    counts = {k: (len(v) if isinstance(v, list) else {kk: len(vv) for kk, vv in v.items()} if isinstance(v, dict) and k == "aero" else None)
              for k, v in out.items() if k in ("buildings", "roads", "rail", "streams", "aero", "water", "wetland", "parks")}
    print(json.dumps(counts), os.path.getsize(a.out), "bytes")
    kinds = defaultdict(int)
    for b in buildings:
        if b.get("k"): kinds[b["k"]] += 1
    print("icons", dict(kinds))

if __name__ == "__main__":
    main()
