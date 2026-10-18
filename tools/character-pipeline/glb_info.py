import json, struct, sys
for path in sys.argv[1:]:
    b = open(path, 'rb').read()
    ln = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20+ln])
    print('==', path.split('/')[-1], 'bytes', len(b))
    nodes = j.get('nodes', [])
    print('nodes:', [(i, n.get('name'), 'mesh' if 'mesh' in n else '', 'skin' if 'skin' in n else '', n.get('translation'), n.get('rotation'), n.get('scale')) for i, n in enumerate(nodes)])
    for s in j.get('skins', []):
        print('skin joints:', [nodes[i].get('name') for i in s['joints']], 'skeleton', s.get('skeleton'))
    print('anims:', [a.get('name') for a in j.get('animations', [])][:40])
    print('materials:', [(m.get('name'), list(m.get('pbrMetallicRoughness', {}).keys())) for m in j.get('materials', [])])
    print('images:', [(im.get('mimeType'), im.get('name')) for im in j.get('images', [])])
    for m in j.get('meshes', []):
        for p in m['primitives']:
            print('prim attrs', list(p['attributes'].keys()), 'count', j['accessors'][p['attributes']['POSITION']]['count'])
