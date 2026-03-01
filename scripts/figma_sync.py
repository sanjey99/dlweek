#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / 'config' / 'figma_targets.json'
OUT_DIR = ROOT / 'design' / 'figma'
TOK_ENV = '/root/.openclaw/secrets/figma.env'


def load_token() -> str:
    tok = os.environ.get('FIGMA_TOKEN', '').strip()
    if tok:
        return tok
    p = Path(TOK_ENV)
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith('FIGMA_TOKEN='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    return ''


def extract_file_key(url: str) -> str:
    m = re.search(r'figma\.com/(?:file|design)/([a-zA-Z0-9]+)', url)
    return m.group(1) if m else ''


def api_get(url: str, token: str):
    req = Request(url, headers={'X-Figma-Token': token, 'User-Agent': 'finsentinel-figma-sync/1.0'})
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def walk(node, out):
    if not isinstance(node, dict):
        return
    n = {
        'id': node.get('id'),
        'name': node.get('name'),
        'type': node.get('type'),
        'visible': node.get('visible', True),
    }
    if 'absoluteBoundingBox' in node:
        n['bbox'] = node['absoluteBoundingBox']
    if 'fills' in node and isinstance(node['fills'], list):
        fills = []
        for f in node['fills']:
            if isinstance(f, dict):
                fills.append({
                    'type': f.get('type'),
                    'visible': f.get('visible', True),
                    'color': f.get('color')
                })
        n['fills'] = fills
    if 'style' in node and isinstance(node['style'], dict):
        n['style'] = node['style']
    out.append(n)
    for c in node.get('children', []) or []:
        walk(c, out)


def main():
    cfg = json.loads(CFG.read_text()) if CFG.exists() else {}
    file_key = (cfg.get('fileKey') or '').strip()
    if not file_key and cfg.get('fileUrl'):
        file_key = extract_file_key(cfg['fileUrl'])

    if not file_key:
        print('Missing fileKey/fileUrl in config/figma_targets.json', file=sys.stderr)
        raise SystemExit(2)

    token = load_token()
    if not token:
        print('Missing FIGMA_TOKEN (env or /root/.openclaw/secrets/figma.env)', file=sys.stderr)
        raise SystemExit(2)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    file_json = api_get(f'https://api.figma.com/v1/files/{file_key}', token)
    (OUT_DIR / 'file.json').write_text(json.dumps(file_json, indent=2))

    styles = api_get(f'https://api.figma.com/v1/files/{file_key}/styles', token)
    (OUT_DIR / 'styles.json').write_text(json.dumps(styles, indent=2))

    flat = []
    walk(file_json.get('document', {}), flat)
    (OUT_DIR / 'nodes_flat.json').write_text(json.dumps(flat, indent=2))

    # Basic token extraction
    colors = []
    text_styles = []
    for n in flat:
        for f in n.get('fills', []) or []:
            c = f.get('color')
            if c and isinstance(c, dict):
                colors.append(c)
        st = n.get('style')
        if st and isinstance(st, dict):
            text_styles.append(st)

    tokens = {
        'meta': {'fileKey': file_key, 'nodeCount': len(flat)},
        'colorsRaw': colors[:500],
        'textStylesRaw': text_styles[:500],
    }
    (OUT_DIR / 'design_tokens_raw.json').write_text(json.dumps(tokens, indent=2))

    print(json.dumps({'ok': True, 'fileKey': file_key, 'outDir': str(OUT_DIR), 'nodeCount': len(flat)}))


if __name__ == '__main__':
    main()
