#!/usr/bin/env python3
"""leaderboard_scripture_icon_fix_v1 / ISSUE 3: regenerate the ForgeHouse 50
PWA icon set from the new operator-supplied master source
(public/branding/forgehouse50-icon-v3.png — 1024x1024 RGBA, glossy rounded-
square blue flame/house/globe/"50" badge with CLEAN transparent corners).

Unlike the old white-background source (regen_icons.py flood-fill), v3 already
has true alpha corners, so:
  - "any"-purpose icons + favicons  -> corners stay TRUE ALPHA (OS masks shape)
  - maskable + apple-touch-icon     -> full-bleed square; corners filled with
                                       the badge's own edge colour (opaque, as
                                       those platforms require; no corner
                                       artifact, no white padding)
"""
from PIL import Image
import os
from collections import Counter

SRC = 'public/branding/forgehouse50-icon-v3.png'
OUT = 'public/icons'
im = Image.open(SRC).convert('RGBA')
W, H = im.size

# Badge edge colour = the most common OPAQUE colour along the outer ring of
# the badge (sampled a couple px inside the transparent corner region).
ring = []
px = im.load()
for x in range(W):
    for y in (2, 3, 4, H - 3, H - 4, H - 5):
        p = px[x, y]
        if p[3] > 200:
            ring.append(p[:3])
for y in range(H):
    for x in (2, 3, 4, W - 3, W - 4, W - 5):
        p = px[x, y]
        if p[3] > 200:
            ring.append(p[:3])
edge = Counter(ring).most_common(1)[0][0]
print('badge edge colour:', edge)

# Standard "any" + favicons: the source as-is (transparent corners preserved).
transparent = im

# Maskable + apple-touch: flatten onto the badge edge colour, full-bleed.
def flattened(img):
    base = Image.new('RGBA', img.size, edge + (255,))
    base.paste(img, (0, 0), img)
    return base

filled = flattened(im)

def save(img, name, size, **kw):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), **kw)

save(transparent, 'icon-192.png', 192)
save(transparent, 'icon-512.png', 512)
save(filled, 'icon-maskable-192.png', 192)
save(filled, 'icon-maskable-512.png', 512)
save(filled, 'apple-touch-icon.png', 180)
save(transparent, 'favicon-32.png', 32)
save(transparent, 'favicon-16.png', 16)
transparent.resize((48, 48), Image.LANCZOS).save(
    os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)])

print('--- corner verification ---')
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    try:
        i2 = Image.open(p).convert('RGBA')
    except Exception:
        continue
    w, h = i2.size
    print(f, i2.size, 'TL', i2.getpixel((1, 1)), 'BR', i2.getpixel((w - 2, h - 2)),
          'CTR', i2.getpixel((w // 2, h // 2)))
