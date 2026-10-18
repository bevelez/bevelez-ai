#!/usr/bin/env python3
"""
Builds assets/mountain-view-ride.json: the bike-commute route for the first-person ride in
mountain-view.html. Routes over OpenStreetMap ways (cycleways, paths, footways, service roads
and streets) between a chain of public waypoints, in two variants that share a trunk:

  Whisman School Park -> Stevens Creek Trail (under Middlefield, Central and US-101)
  -> Crittenden access ramp -> Crittenden Lane
     A) -> Stierlin Court through the Google lot -> Gradient Canopy (Charleston East)
     B) -> North Shoreline Boulevard -> Gradient Canopy

Input: --corridor <overpass json with geometry> (see the query in the docstring of the
scratch fetch; bbox 37.393,-122.095,37.434,-122.040). Output coordinates are local metres
(same origin as the map bundle), rounded to 0.1 m.
"""
import argparse, collections, heapq, json, math

LAT0, LON0 = 37.396, -122.079
R = 6378137.0
COST = {'cycleway': 1.0, 'path': 1.1, 'footway': 1.25, 'pedestrian': 1.1, 'service': 1.3, 'residential': 1.4,
        'living_street': 1.3, 'unclassified': 1.5, 'tertiary': 1.8, 'secondary': 2.6, 'primary': 3.6, 'track': 1.3}

def proj(lat, lon):
    return (math.radians(lon - LON0) * R * math.cos(math.radians(LAT0)), math.radians(lat - LAT0) * R)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corridor', required=True)
    ap.add_argument('--out', default='assets/mountain-view-ride.json')
    ap.add_argument('--map', default='assets/mountain-view-map.json')
    a = ap.parse_args()
    els = json.load(open(a.corridor))['elements']

    adj = collections.defaultdict(list)
    edge_tags = {}
    for e in els:
        if e['type'] != 'way':
            continue
        t = e.get('tags', {})
        hw = t.get('highway')
        if hw not in COST:
            continue
        g = e['geometry']
        name = t.get('name', '')
        bias = 1.0
        if 'Stevens Creek Trail' in name: bias = 0.7          # ride the trail, not parallel paths
        if '(lower)' in name or hw == 'track': bias = 4.0     # the creek-bed track is not the commute
        if name in ('Crittenden Lane', 'Stierlin Court', 'North Shoreline Boulevard'): bias = 0.55
        if t.get('access') in ('private',) and hw != 'service': bias = 3.0
        for i in range(len(g) - 1):
            p = (round(g[i]['lat'], 6), round(g[i]['lon'], 6)); q = (round(g[i + 1]['lat'], 6), round(g[i + 1]['lon'], 6))
            L = math.dist(proj(*p), proj(*q))
            meta = {'name': name, 'hw': hw, 'bridge': t.get('bridge') == 'yes', 'tunnel': t.get('tunnel') == 'yes', 'layer': t.get('layer')}
            adj[p].append((q, L * COST[hw] * bias, L, meta)); adj[q].append((p, L * COST[hw] * bias, L, meta))

    # OSM ways that end within a few metres of another way without sharing a node (the Crittenden
    # ramp bridge meets the paved trail this way): join such endpoints so the router can use them
    nodes = list(adj.keys())
    xy = {n: proj(*n) for n in nodes}
    endpoints = set()
    for e in els:
        if e['type'] != 'way' or e.get('tags', {}).get('highway') not in COST: continue
        g = e['geometry']
        for q in (g[0], g[-1]):
            endpoints.add((round(q['lat'], 6), round(q['lon'], 6)))
    joined = 0
    for ep in endpoints:
        p = xy[ep] if ep in xy else proj(*ep)
        for n in nodes:
            if n == ep: continue
            d = math.dist(p, xy[n])
            if 0.05 < d < 4.0 and not any(v == n for v, _, _, _ in adj[ep]):
                meta = {'name': '', 'hw': 'path', 'bridge': False, 'tunnel': False, 'layer': None}
                adj[ep].append((n, d, d, meta)); adj[n].append((ep, d, d, meta)); joined += 1
    print('joined', joined, 'dangling endpoints')

    def nearest(lat, lon, pred=None):
        p = proj(lat, lon)
        best, bd = None, 1e18
        for n in adj:
            if pred and not any(pred(m) for _, _, _, m in adj[n]):
                continue
            d = math.dist(proj(*n), p)
            if d < bd: best, bd = n, d
        return best

    def route(s, t):
        dist = {s: 0}; prev = {}; pq = [(0, s)]
        while pq:
            c, u = heapq.heappop(pq)
            if u == t: break
            if c > dist.get(u, 1e18): continue
            for v, w, L, meta in adj[u]:
                nc = c + w
                if nc < dist.get(v, 1e18):
                    dist[v] = nc; prev[v] = (u, L, meta); heapq.heappush(pq, (nc, v))
        if t not in prev: raise SystemExit(f'no route {s} -> {t}')
        path = []; u = t
        while u != s:
            pu, L, meta = prev[u]; path.append((pu, u, L, meta)); u = pu
        path.reverse(); return path

    trail = lambda m: m['name'] == 'Stevens Creek Trail' and m['hw'] != 'track'
    W = {
        'park':      nearest(37.4006, -122.0670),
        'trail_s':   nearest(37.4040, -122.0660, trail),
        'trail_101': nearest(37.4175, -122.0710, trail),
        'crit_ramp': nearest(37.4216, -122.0736, lambda m: 'Crittenden Access' in m['name']),
        'crit_ln':   nearest(37.4222, -122.0760, lambda m: m['name'] == 'Crittenden Lane'),
        'stierlin':  nearest(37.4232, -122.0775, lambda m: m['name'] == 'Stierlin Court'),
        'shoreline': nearest(37.4228, -122.0800, lambda m: 'Shoreline' in m['name']),
        'gradient':  nearest(37.4225, -122.0792),
    }
    chains = {
        'stierlin': ['park', 'trail_s', 'trail_101', 'crit_ramp', 'crit_ln', 'stierlin', 'gradient'],
        'shoreline': ['park', 'trail_s', 'trail_101', 'crit_ramp', 'crit_ln', 'shoreline', 'gradient'],
    }
    out = {'origin': {'lat': LAT0, 'lon': LON0}, 'variants': {}}
    for key, chain in chains.items():
        pts, segs, marks = [], [], []
        total = 0.0
        for i in range(len(chain) - 1):
            marks.append({'at': round(total, 1), 'key': chain[i]})
            for pu, u, L, meta in route(W[chain[i]], W[chain[i + 1]]):
                if not pts: pts.append(proj(*pu))
                pts.append(proj(*u))
                tag = ('tunnel' if meta['tunnel'] else 'bridge' if meta['bridge'] else '')
                if segs and segs[-1]['name'] == meta['name'] and segs[-1]['hw'] == meta['hw'] and segs[-1]['tag'] == tag:
                    segs[-1]['len'] += L
                else:
                    segs.append({'at': round(total, 1), 'name': meta['name'], 'hw': meta['hw'], 'tag': tag, 'len': L})
                total += L
        marks.append({'at': round(total, 1), 'key': chain[-1]})
        for s in segs: s['len'] = round(s['len'], 1)
        out['variants'][key] = {
            'length': round(total, 1),
            'points': [round(v, 1) for p in pts for v in p],
            'segments': segs,
            'marks': marks,
        }
        print(key, round(total), 'm,', len(pts), 'points')
        for s in segs:
            if s['len'] > 25 or s['tag']:
                print('   %6.0f m  %-10s %-7s %s' % (s['len'], s['hw'], s['tag'], s['name']))
    # where arterials and freeways cross the route: the ride builds underpass decks there
    try:
        roads = json.load(open(a.map))['roads']
    except Exception:
        roads = []
    def seg_x(p1, p2, p3, p4):
        d = (p2[0]-p1[0])*(p4[1]-p3[1]) - (p2[1]-p1[1])*(p4[0]-p3[0])
        if abs(d) < 1e-9: return None
        u = ((p3[0]-p1[0])*(p4[1]-p3[1]) - (p3[1]-p1[1])*(p4[0]-p3[0])) / d
        v = ((p3[0]-p1[0])*(p2[1]-p1[1]) - (p3[1]-p1[1])*(p2[0]-p1[0])) / d
        if 0 <= u <= 1 and 0 <= v <= 1: return (p1[0] + u*(p2[0]-p1[0]), p1[1] + u*(p2[1]-p1[1]), u)
        return None
    for key, v in out['variants'].items():
        pts = [(v['points'][i], v['points'][i+1]) for i in range(0, len(v['points']), 2)]
        cum = [0.0]
        for i in range(1, len(pts)): cum.append(cum[-1] + math.dist(pts[i-1], pts[i]))
        found = []
        for r in roads:
            if r['c'] not in ('mw', 'mwl', 'tr', 'trl', 'pr', 'se'): continue
            rp = [(r['p'][i]/10, r['p'][i+1]/10) for i in range(0, len(r['p']), 2)]
            for i in range(1, len(pts)):
                for j in range(1, len(rp)):
                    hit = seg_x(pts[i-1], pts[i], rp[j-1], rp[j])
                    if hit:
                        ang = math.atan2(rp[j][1]-rp[j-1][1], rp[j][0]-rp[j-1][0])
                        found.append({'at': round(cum[i-1] + hit[2]*(cum[i]-cum[i-1]), 1), 'x': round(hit[0], 1), 'y': round(hit[1], 1), 'c': r['c'], 'angle': round(ang, 3)})
        found.sort(key=lambda f: f['at'])
        merged = []
        for f in found:
            if merged and abs(merged[-1]['at'] - f['at']) < 18 and merged[-1]['c'] == f['c']: continue
            merged.append(f)
        v['crossings'] = merged
        print(key, 'crossings:', [(c['c'], c['at']) for c in merged])
    json.dump(out, open(a.out, 'w'), separators=(',', ':'))
    print('wrote', a.out)

if __name__ == '__main__':
    main()
