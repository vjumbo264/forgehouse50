#!/usr/bin/env python3
"""Regenerate ForgeHouse 50 PWA icons with correct corner handling.

The source logo (public/branding/forgehouse50-logo-source.png) is an opaque
1024x1024 PNG: a dark-navy rounded-square badge on a WHITE background. The
white exterior must not ship inside the icons:

  - "any"-purpose icons + favicons  -> exterior white becomes TRUE ALPHA
                                       (transparent corners, OS mask shapes it)
  - maskable + apple-touch-icon     -> exterior filled with the badge's own
                                       edge colour (fully opaque square, as
                                       those platforms require; no white
                                       corner artifact)
A 1px anti-alias fringe around the badge edge is alpha-feathered so no light
halo shows on dark OS surfaces.
"""
from PIL import Image
from collections import deque
import os

SRC = 'public/branding/forgehouse50-logo-source.png'
OUT = 'public/icons'
im = Image.open(SRC).convert('RGBA')
W, H = im.size
px = im.load()

# 1) Flood-fill the exterior near-white region from every border pixel.
THRESH = 235
def nearwhite(p): return p[0] > THRESH and p[1] > THRESH and p[2] > THRESH

ext = bytearray(W * H)  # 1 = exterior white connected to the border
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if nearwhite(px[x, y]) and not ext[y * W + x]:
            ext[y * W + x] = 1; dq.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        if nearwhite(px[x, y]) and not ext[y * W + x]:
            ext[y * W + x] = 1; dq.append((x, y))
while dq:
    x, y = dq.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < W and 0 <= ny < H and not ext[ny * W + nx] and nearwhite(px[nx, ny]):
            ext[ny * W + nx] = 1; dq.append((nx, ny))

edge = px[10, H // 2][:3]  # badge edge colour (dark navy)
print('badge edge colour:', edge)

def whiteness(p): return min(p[0], p[1], p[2]) / 255.0

def build(fill):
    """fill=None -> transparent exterior; fill=RGB -> opaque badge-colour exterior."""
    out = im.copy()
    op = out.load()
    for y in range(H):
        for x in range(W):
            if ext[y * W + x]:
                op[x, y] = (fill[0], fill[1], fill[2], 255) if fill else (0, 0, 0, 0)
    if not fill:
        # Feather the 1px fringe just inside the boundary that is still
        # near-white anti-alias residue -> partial alpha, avoids light halo.
        fringe = []
        for y in range(H):
            for x in range(W):
                if ext[y * W + x]:
                    continue
                if any(0 <= x + dx < W and 0 <= y + dy < H and ext[(y + dy) * W + (x + dx)]
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    p = op[x, y]
                    w = whiteness(p)
                    if w > 0.75:
                        a = int(255 * (1 - (w - 0.75) / 0.25))
                        fringe.append((x, y, max(0, min(255, a))))
        for x, y, a in fringe:
            p = op[x, y]
            op[x, y] = (p[0], p[1], p[2], min(p[3], a))
    return out

print('building transparent-corner set...')
transparent = build(None)
print('building badge-filled set...')
filled = build(edge)

def save(img, name, size):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))

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
