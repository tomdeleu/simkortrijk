"""Side by side: the current render under a paint window (left) and the painted window (right).
Check every window by eye before painting the next one (fake towers, copied style image, invented water).
Also use it before reusing an old window: a window painted before a render change is stale.

  python3 pipeline/tools/window_check.py out.png 3_-1 3_0 [--area kortrijk-binnenstad] [--old windows.replaced/3_0.pre-p6.png]
"""
import argparse, os
from pathlib import Path
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("windows", nargs="*")
ap.add_argument("--area", default="kortrijk-binnenstad"); ap.add_argument("--size", type=int, default=600)
a, extra = ap.parse_known_args()  # window names like -1_2 look like options to argparse
a.windows += [w for w in extra if __import__("re").fullmatch(r"-?\d+_-?\d+", w)]
D = Path(__file__).resolve().parents[2] / "data" / "derived" / a.area
S, W = 896, a.size

def render_window(i, j):
    x0, y0 = i * S, j * S
    c = Image.new("RGB", (1024, 1024), (240, 234, 220))
    for tx in range(x0 // 1024 - 1, (x0 + 1024) // 1024 + 1):
        for ty in range(y0 // 1024 - 1, (y0 + 1024) // 1024 + 1):
            p = D / "render" / f"{tx}_{ty}.png"
            if p.exists(): c.paste(Image.open(p).convert("RGB"), (tx * 1024 - x0, ty * 1024 - y0))
    return c

im = Image.new("RGB", (2 * W + 10, len(a.windows) * (W + 10)), "white")
for r, w in enumerate(a.windows):
    i, j = map(int, w.split("_"))
    left = render_window(i, j).resize((W, W))
    f = D / "windows" / f"{w}.png"
    right = Image.open(f).convert("RGB").resize((W, W)) if f.exists() else Image.new("RGB", (W, W), (90, 90, 90))
    for img, label in ((left, f"{w} render now"), (right, f"{w} window" if f.exists() else f"{w}: no window")):
        ImageDraw.Draw(img).text((6, 6), label, fill=(255, 255, 0))
    im.paste(left, (0, r * (W + 10))); im.paste(right, (W + 10, r * (W + 10)))
im.save(a.out)
print(a.out)
