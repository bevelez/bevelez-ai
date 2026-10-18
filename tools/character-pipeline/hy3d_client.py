#!/usr/bin/env python3
"""Minimal Gradio 4.x client for the tencent/Hunyuan3D-2.1 Space (stdlib + curl only)."""
import json, os, subprocess, sys, time, urllib.request

SPACE = os.environ.get('HY3D_SPACE', 'https://tencent-hunyuan3d-2-1.hf.space')

def _hf_token():
    tok = os.environ.get('HF_TOKEN')
    if tok: return tok.strip()
    for cand in (os.path.expanduser('~/.cache/huggingface/token'), os.path.expanduser('~/.huggingface/token')):
        if os.path.exists(cand):
            return open(cand).read().strip()
    return None
HF_TOKEN = _hf_token()
AUTH_HEADERS = {'Authorization': f'Bearer {HF_TOKEN}'} if HF_TOKEN else {}

def upload(path):
    auth = ['-H', f'Authorization: Bearer {HF_TOKEN}'] if HF_TOKEN else []
    out = subprocess.run(['curl', '-s', '-m', '120', *auth, '-F', f'files=@{path}', f'{SPACE}/upload'], capture_output=True, text=True)
    paths = json.loads(out.stdout)
    return paths[0]

def filedata(server_path, local):
    return {"path": server_path, "orig_name": os.path.basename(local), "mime_type": "image/png", "meta": {"_type": "gradio.FileData"}}

def call(fn, data, timeout=1500):
    req = urllib.request.Request(f'{SPACE}/call/{fn}', data=json.dumps({"data": data}).encode(), headers={'Content-Type': 'application/json', **AUTH_HEADERS})
    with urllib.request.urlopen(req, timeout=60) as r:
        event_id = json.loads(r.read())['event_id']
    print('event', event_id, flush=True)
    t0 = time.time()
    req = urllib.request.Request(f'{SPACE}/call/{fn}/{event_id}', headers=AUTH_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        event = None
        for raw in r:
            line = raw.decode('utf-8', 'replace').rstrip('\n')
            if line.startswith('event:'):
                event = line.split(':', 1)[1].strip()
            elif line.startswith('data:'):
                payload = line.split(':', 1)[1].strip()
                print(f'[{int(time.time()-t0)}s] {event}: {payload[:300]}', flush=True)
                if event == 'complete':
                    return json.loads(payload)
                if event == 'error':
                    raise SystemExit(f'space error: {payload}')
    raise SystemExit('stream ended without complete')

def download(fd, dest):
    url = f"{SPACE}/file={fd['path']}"
    auth = ['-H', f'Authorization: Bearer {HF_TOKEN}'] if HF_TOKEN else []
    subprocess.run(['curl', '-s', '-L', '-m', '600', *auth, '-o', dest, url], check=True)
    return os.path.getsize(dest)

if __name__ == '__main__':
    print('hf token:', 'present' if HF_TOKEN else 'none', flush=True)
    name = sys.argv[1]; indir = sys.argv[2]; outdir = sys.argv[3]
    views = {}
    for v in ('front', 'back', 'side'):
        p = os.path.join(indir, f'{name}_{v}.png')
        if os.path.exists(p):
            views[v] = (upload(p), p)
            print('uploaded', v, views[v][0], flush=True)
    img = filedata(*views['front'])
    mv = os.environ.get('HY3D_MV', '0') == '1'
    front = filedata(*views['front']) if mv else None
    back = filedata(*views['back']) if (mv and 'back' in views) else None
    left = filedata(*views['side']) if (mv and 'side' in views) else None
    steps = int(os.environ.get('HY3D_STEPS', '30')); guidance = float(os.environ.get('HY3D_GUIDANCE', '5.0'))
    seed = int(os.environ.get('HY3D_SEED', '1234')); octree = int(os.environ.get('HY3D_OCTREE', '256'))
    first = None if os.environ.get("HY3D_FIRST", "state") == "state" else ""
    data = [first, img, front, back, left, None, steps, guidance, seed, octree, os.environ.get("HY3D_REMBG", "1") == "1", 8000, False]
    fn = os.environ.get('HY3D_FN', 'generation_all')
    result = call(fn, data)
    os.makedirs(outdir, exist_ok=True)
    def unwrap(x):
        return x.get('value') if isinstance(x, dict) and isinstance(x.get('value'), dict) else x
    result = [unwrap(x) for x in result]
    files = [x for x in result if isinstance(x, dict) and x.get('path')]
    saved = []
    for i, fd in enumerate(files):
        dest = os.path.join(outdir, f"{name}_{'white' if i == 0 else 'textured'}.glb")
        saved.append((dest, download(fd, dest)))
    stats = [x for x in result if isinstance(x, dict) and 'path' not in x]
    print('SAVED', json.dumps(saved), 'STATS', json.dumps(stats)[:500], flush=True)
