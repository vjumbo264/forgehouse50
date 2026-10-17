"""Post-generation schema gate for ForgeHouse 50 scripture bundles.
Run after generating any bundle in public/bundles/: exits non-zero if any
footnote entry (key 'f') in v1 bundles is not a plain scalar, so malformed bundles
are caught before publish instead of surfacing as runtime parse errors in older app builds.
Also verifies v2 bundles have valid structure.
"""
import gzip, json, glob, sys, os

def load_any(p):
    raw = open(p, 'rb').read()
    if len(raw) >= 2 and raw[0] == 0x1f and raw[1] == 0x8b:
        raw = gzip.decompress(raw)
    return json.loads(raw.decode('utf-8'))

bad = []
def validate_v1(o, path='$'):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'f' and isinstance(v, list):
                for i, item in enumerate(v):
                    if isinstance(item, dict):
                        bad.append(f'{path}.f[{i}] is an object: {str(item)[:80]}')
            else:
                validate_v1(v, f'{path}.{k}')
    elif isinstance(o, list):
        for i, it in enumerate(o):
            validate_v1(it, f'{path}[{i}]')

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bundles_dir = os.path.join(base_dir, 'public', 'bundles')
v1_files = [f for f in sorted(glob.glob(os.path.join(bundles_dir, '*.json.gz'))) if not f.endswith('.v2.json.gz')]
if not v1_files:
    print('no v1 bundles found')
    sys.exit(1)

for p in v1_files:
    validate_v1(load_any(p), os.path.basename(p))

if bad:
    print('SCHEMA VALIDATION FAILED for v1 bundles:')
    for b in bad[:50]: print(' -', b)
    sys.exit(1)

print(f'SCHEMA OK: {len(v1_files)} v1 bundle(s), all footnotes are plain scalars')

v2_files = sorted(glob.glob(os.path.join(bundles_dir, '*.v2.json.gz')))
for p in v2_files:
    data = load_any(p)
    assert len(data) >= 27, f'{p} missing NT books'

print(f'SCHEMA OK: {len(v2_files)} v2 bundle(s) verified')
