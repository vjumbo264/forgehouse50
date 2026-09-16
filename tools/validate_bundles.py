"""Post-generation schema gate for ForgeHouse 50 scripture bundles.
Run after generating any bundle in public/bundles/: exits non-zero if any
footnote entry (key 'f') is not a plain scalar, so malformed bundles are
caught before publish instead of surfacing as runtime parse errors."""
import gzip, json, glob, sys
def load_any(p):
    raw=open(p,'rb').read()
    if raw[:2]==b'\x1f\x8b': raw=gzip.decompress(raw)
    return json.loads(raw.decode('utf-8'))
bad=[]
def validate(o,path='$'):
    if isinstance(o,dict):
        for k,v in o.items():
            if k=='f' and isinstance(v,list):
                for i,item in enumerate(v):
                    if isinstance(item,dict):
                        bad.append(f'{path}.f[{i}] is an object: {str(item)[:80]}')
            else: validate(v,f'{path}.{k}')
    elif isinstance(o,list):
        for i,it in enumerate(o): validate(it,f'{path}[{i}]')
files=sorted(glob.glob('public/bundles/*.json*'))
if not files: print('no bundles found'); sys.exit(1)
for p in files: validate(load_any(p),p)
if bad:
    print('SCHEMA VALIDATION FAILED:'); [print(' -',b) for b in bad[:50]]; sys.exit(1)
print(f'SCHEMA OK: {len(files)} bundle(s), all footnotes are plain scalars')
