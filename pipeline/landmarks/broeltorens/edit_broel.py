#!/usr/bin/env python3
"""Edit the Broeltorens render tiles before they are painted.

The massing render draws the two towers as flat blocks and the Broelbrug as a
road. This replaces that patch with cream stone towers, slate cones, and the
bridge from OSM way 567818112: three arches, parapets, and the statue, sitting
low between the towers' feet from quay to quay.

Reads data/derived/kortrijk-binnenstad/render.orig (copied from render/ on the
first run) and writes the four tiles (-1,0) x (-2,-1) back into render/.
Run --restore after painting so the photo layer stays the raw render.

The bridge is projected with the repo camera (pipeline/src/camera.ts), height
relative to GROUND_H. Tower cylinders are measured pixels on this render
(heading 20°, 0.25 m/px). Do not reuse them if the camera changes.
"""
import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import cv2
from PIL import Image, ImageDraw

# OSM way 567818112, node order, closed. Front quay is 0→1, back quay is 4→3.
WAY = [
    (50.8305026, 3.2668115),
    (50.8303405, 3.2669979),
    (50.8303550, 3.2670354),
    (50.8303675, 3.2670676),
    (50.8305453, 3.2668643),
    (50.8305244, 3.2668388),
    (50.8305026, 3.2668115),
]
STATUE = (50.8304529, 3.2669665)
# Global box of the four tiles the towers straddle.
X0, Y0, X1, Y1 = -1024, -2048, 1024, 0
TILES = [(tx, ty) for ty in (-2, -1) for tx in (-1, 0)]
# px per metre of height at pitch 45° and 0.25 m/px.
K = math.cos(math.radians(45)) / 0.25


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def project(points):
    """(lat, lon, metres above the camera ground plane) → global art pixels."""
    code = """
import { readFileSync } from "node:fs";
import { llhToPixel } from "./pipeline/src/camera.ts";
import { GROUND_H } from "./pipeline/src/areas.ts";
const pts = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(pts.map(([lat, lon, h]) => llhToPixel(lat, lon, GROUND_H + h))));
"""
    r = subprocess.run(
        ["node", "--import", "tsx", "--input-type=module", "-e", code],
        input=json.dumps(points),
        cwd=repo_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    if r.stderr:
        sys.stderr.write(r.stderr)
    return json.loads(r.stdout)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--restore", action="store_true", help="copy render.orig back over render/ and stop")
    ap.add_argument("--base", type=Path, help="derived area directory (default data/derived/kortrijk-binnenstad)")
    args = ap.parse_args()
    base = args.base or (repo_root() / "data" / "derived" / "kortrijk-binnenstad")
    orig = base / "render.orig"
    out = base / "render"
    if not out.is_dir():
        sys.exit(f"missing {out}: render the binnenstad first")
    missing = [f"{tx}_{ty}.png" for tx, ty in TILES if not (out / f"{tx}_{ty}.png").is_file() and not (orig / f"{tx}_{ty}.png").is_file()]
    if missing:
        sys.exit("missing render tiles: " + ", ".join(missing))
    orig.mkdir(parents=True, exist_ok=True)
    for tx, ty in TILES:
        src, dst = out / f"{tx}_{ty}.png", orig / f"{tx}_{ty}.png"
        if not dst.exists():
            shutil.copyfile(src, dst)
    if args.restore:
        for tx, ty in TILES:
            shutil.copyfile(orig / f"{tx}_{ty}.png", out / f"{tx}_{ty}.png")
        print(f"restored {len(TILES)} tiles from {orig}")
        return

    ox, oy = -X0, -Y0
    can = Image.new("RGBA", (X1 - X0, Y1 - Y0), (0, 0, 0, 0))
    for tx, ty in TILES:
        can.paste(Image.open(orig / f"{tx}_{ty}.png").convert("RGBA"), (tx * 1024 + ox, ty * 1024 + oy))

    # Tower boxes were measured on a crop of this canvas whose origin is (450, 1450).
    def cc(x, y):
        return (x - 450 + ox, y - 1450 + oy)

    rgb = np.array(can.convert("RGB"))
    alpha = np.array(can)[:, :, 3]
    towers = [dict(cx=326.5, rx=27, top=215, bot=308), dict(cx=439.5, rx=25.5, top=271, bot=369)]
    wall, roof = 16, 12.5
    mask = np.zeros(rgb.shape[:2], np.uint8)
    geo = []
    for t in towers:
        cx, cyb = cc(t["cx"], t["bot"])
        _, ytop = cc(0, t["top"])
        rx, ry = t["rx"], t["rx"] * 0.70
        yw = cyb - wall * K
        apex = yw - roof * K
        geo.append((cx, cyb, rx, ry, yw, apex))
        m = np.zeros_like(mask)
        cv2.rectangle(m, (int(cx - rx - 2), int(ytop - 3)), (int(cx + rx + 2), int(yw)), 255, -1)
        cv2.ellipse(m, (int(cx), int(yw)), (int(rx + 2), int(ry)), 0, 0, 180, 255, -1)
        mask |= m
    im = Image.fromarray(cv2.inpaint(rgb, mask, 9, cv2.INPAINT_TELEA)).convert("RGBA")
    d = ImageDraw.Draw(im)
    stone, stone_d, stone_l = (214, 205, 186), (176, 166, 148), (232, 226, 210)
    for cx, cyb, rx, ry, yw, apex in geo:
        for i in range(int(2 * rx) + 1):
            x = cx - rx + i
            u = (x - cx) / rx
            shade = 0.80 + 0.25 * (1 - (u + 1) / 2)
            col = tuple(int(min(255, v * shade)) for v in stone)
            d.line([(x, yw + ry * math.sqrt(max(0, 1 - u * u))), (x, cyb + ry * math.sqrt(max(0, 1 - u * u)))], fill=col)
        for k in range(1, 6):
            yy = yw + k * (cyb - yw) / 6
            d.arc([cx - rx, yy - ry, cx + rx, yy + ry], 0, 180, fill=stone_d)
        d.ellipse([cx - rx - 3, yw - ry + 1, cx + rx + 3, yw + ry + 7], fill=stone_l, outline=stone_d)
        for u in (-0.45, 0.25):
            x = cx + u * rx
            y = yw + (cyb - yw) * 0.45 + ry * math.sqrt(1 - u * u)
            d.rectangle([x - 1.5, y - 7, x + 1.5, y + 3], fill=(70, 62, 60))
        rx2, ry2, n = rx + 5, ry + 3.5, 60
        d.ellipse([cx - rx2, yw - ry2, cx + rx2, yw + ry2], fill=(92, 102, 122))
        for i in range(n):
            x0 = cx - rx2 + 2 * rx2 * i / n
            x1 = cx - rx2 + 2 * rx2 * (i + 1) / n
            y0 = yw + ry2 * math.sqrt(max(0, 1 - ((x0 - cx) / rx2) ** 2))
            y1 = yw + ry2 * math.sqrt(max(0, 1 - ((x1 - cx) / rx2) ** 2))
            g = int(150 - 62 * i / n)
            d.polygon([(cx, apex), (x0, y0), (x1, y1)], fill=(g - 10, g, g + 20))
        dx, dy = cx - rx2 * 0.25, yw - (yw - apex) * 0.25 + ry2 * 0.6
        d.polygon([(dx - 4, dy + 4), (dx + 4, dy + 4), (dx + 4, dy - 3), (dx, dy - 8), (dx - 4, dy - 3)], fill=(200, 190, 175), outline=(150, 60, 60))
        d.rectangle([dx - 1.5, dy - 2, dx + 1.5, dy + 3], fill=(60, 50, 55))
        d.line([(cx, apex), (cx, apex - 14)], fill=(55, 55, 65), width=2)
        d.polygon([(cx, apex - 14), (cx + 7, apex - 12), (cx, apex - 10)], fill=(55, 55, 65))

    # Deck 5 m under the camera ground plane, so the bridge lies at the towers' feet.
    deck, hump, par, base_h = -3.5, 1.0, 0.9, -8.5  # deck is 5 m under the ground plane; base is the arch springing
    fw, fe, be, bw = WAY[0], WAY[1], WAY[3], WAY[4]

    def lerp(a, b, t):
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def hh(t):
        return deck + hump * math.sin(math.pi * t)

    ts = [i / 24 for i in range(25)]
    queries = []
    for t in ts:
        queries.append((*lerp(fw, fe, t), hh(t)))
        queries.append((*lerp(bw, be, t), hh(t)))
        queries.append((*lerp(fw, fe, t), base_h))
    for k in range(3):
        t0 = 0.08 + k * 0.30
        t1 = t0 + 0.24
        queries.append((*lerp(fw, fe, t0), base_h))
        queries.append((*lerp(fw, fe, t1), base_h))
        queries.append((*lerp(fw, fe, (t0 + t1) / 2), hh((t0 + t1) / 2) - 0.9))
    queries.append((*STATUE, hh(0.5)))
    xy = project(queries)

    def can_xy(i):
        x, y = xy[i]
        return (x + ox, y + oy)

    n = 25
    front = [can_xy(3 * i) for i in range(n)]
    back = [can_xy(3 * i + 1) for i in range(n)]
    flow = [can_xy(3 * i + 2) for i in range(n)]
    water, bs, deckc = (70, 120, 160), (200, 192, 176), (218, 210, 194)
    d.polygon(front + flow[::-1], fill=(168, 160, 145))
    arch0 = 3 * n
    for k in range(3):
        a0, a1, top = can_xy(arch0 + 3 * k), can_xy(arch0 + 3 * k + 1), can_xy(arch0 + 3 * k + 2)
        rise = a0[1] - top[1]
        poly = [(a0[0] + (a1[0] - a0[0]) * j / 20, a0[1] + (a1[1] - a0[1]) * j / 20 - rise * math.sin(math.pi * j / 20) ** 0.6) for j in range(21)]
        d.polygon(poly, fill=water)
    d.polygon(front + back[::-1], fill=deckc)
    for edge in (back, front):
        up = [(x, y - par * K) for x, y in edge]
        d.polygon(edge + up[::-1], fill=bs)
        d.line(up, fill=(150, 144, 132), width=1)
    sx, sy = can_xy(arch0 + 9)
    sy += 3
    d.rectangle([sx - 2, sy - 4 * K, sx + 2, sy], fill=(150, 146, 140))
    d.ellipse([sx - 3, sy - 5.6 * K, sx + 3, sy - 3.9 * K], fill=(120, 118, 115))

    painted = np.array(im)
    painted[:, :, 3] = alpha
    im = Image.fromarray(painted)
    for tx, ty in TILES:
        box = (tx * 1024 + ox, ty * 1024 + oy, tx * 1024 + ox + 1024, ty * 1024 + oy + 1024)
        im.crop(box).save(out / f"{tx}_{ty}.png")
    preview = base / "broel_edit.png"
    im.crop(cc(0, 0) + cc(800, 550)).save(preview)
    print(f"wrote 4 tiles to {out} (originals in {orig}); preview {preview}")


if __name__ == "__main__":
    main()
