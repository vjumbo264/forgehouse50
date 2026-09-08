#!/usr/bin/env python3
"""Generate ForgeHouse 50 PWA icon set from the committed source logo.

Source: public/branding/forgehouse50-logo-source.png (1024x1024 RGBA,
rounded-square app-icon artwork on white corners).

Outputs (public/icons/):
  icon-192.png, icon-512.png           - standard "any" icons
  icon-maskable-192.png, icon-maskable-512.png - maskable (safe-zone) variants
  apple-touch-icon.png (180x180)       - iOS home screen (flattened, no alpha)
  favicon-32.png, favicon-16.png       - favicon sizes
  favicon.ico                          - multi-size ICO (16/32/48)
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "branding", "forgehouse50-logo-source.png")
OUT = os.path.join(ROOT, "public", "icons")
os.makedirs(OUT, exist_ok=True)

src = Image.open(SRC).convert("RGBA")
print("source:", src.size, src.mode)

def rounded_rect_mask(size, radius):
    from PIL import ImageDraw
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def fill_art(size):
    """Crop the artwork to its opaque bounding box (drop white corners) and
    scale to fill the full square — standard app-icon treatment."""
    bbox = src.getbbox()
    art = src.crop(bbox)
    return art.resize((size, size), Image.LANCZOS)

def maskable_art(size, safe=0.80):
    """Maskable variant: full-bleed background colour sampled from the logo
    (deep blue), with the artwork scaled into the inner ~80% safe zone so
    Android adaptive-icon masks never crop the mark."""
    # Sample the deep blue near the centre-left of the source artwork
    bbox = src.getbbox()
    art = src.crop(bbox)
    px = art.convert("RGB").load()
    bg = px[art.width // 2, art.height // 2]  # central deep blue
    canvas = Image.new("RGBA", (size, size), bg + (255,))
    inner = int(size * safe)
    art_resized = art.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(art_resized, (off, off), art_resized)
    return canvas

def flattened(size):
    """Opaque square icon (white corners composited away via bbox crop)."""
    img = fill_art(size)
    return img.convert("RGB")

# --- standard "any" icons: full-bleed rounded artwork -------------------
for s in (192, 512):
    img = fill_art(s)
    # Re-apply a rounded-corner mask so launchers that don't round look right
    mask = rounded_rect_mask(s, int(s * 0.18))
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(OUT, f"icon-{s}.png"), optimize=True)
    print(f"icon-{s}.png")

# --- maskable variants ---------------------------------------------------
for s in (192, 512):
    maskable_art(s).save(os.path.join(OUT, f"icon-maskable-{s}.png"), optimize=True)
    print(f"icon-maskable-{s}.png")

# --- apple touch icon (180x180, flattened; iOS applies its own rounding) -
flattened(180).save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True)
print("apple-touch-icon.png")

# --- favicons ------------------------------------------------------------
for s in (16, 32):
    flattened(s).save(os.path.join(OUT, f"favicon-{s}.png"), optimize=True)
    print(f"favicon-{s}.png")

ico = [flattened(s) for s in (16, 32, 48)]
ico[0].save(os.path.join(OUT, "favicon.ico"), format="ICO",
            sizes=[(16, 16), (32, 32), (48, 48)],
            append_images=ico[1:])
print("favicon.ico")

print("done ->", OUT)
