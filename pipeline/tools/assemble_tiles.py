#!/usr/bin/env python3
"""Rebuild chosen paint tiles from the windows, feathered into the render where painted meets unpainted.

Unlike assemble_block.py (one rectangle, all of it rewritten) this rewrites only the tiles of a piece
and leaves every other paint tile as it is:

    python3 pipeline/tools/assemble_tiles.py --target -2_-2,-1_-2,...  --rewrite 0_-1,1_-1

--target: every tile that is painted once this piece is done (feather only where they meet the rest).
--rewrite: the tiles to write (windows changed under them). Windows are used wherever they exist in
windows/; a missing window leaves its square to its neighbours, or to the render.
"""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

S, W, OV, FE = 896, 1024, 128, 64
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--area", default="kortrijk-binnenstad")
ap.add_argument("--target", required=True)
ap.add_argument("--rewrite", required=True)
ap.add_argument("--feather", type=float, default=220)
args = ap.parse_args()
pair = lambda s: tuple(int(v) for v in s.split("_"))
target = {pair(t) for t in args.target.split(",")}
rewrite = [pair(t) for t in args.rewrite.split(",")]
base = Path(__file__).resolve().parents[2] / "data" / "derived" / args.area
txs = [t[0] for t in target]; tys = [t[1] for t in target]
tx0, tx1, ty0, ty1 = min(txs) - 1, max(txs) + 1, min(tys) - 1, max(tys) + 1   # a render margin all round
x0, y0 = tx0 * 1024, ty0 * 1024
Wd, Hd = (tx1 - tx0 + 1) * 1024, (ty1 - ty0 + 1) * 1024
k = np.arange(W)
edge = lambda t: np.clip((t + 0.5 - (OV - FE) / 2) / FE, 0, 1)
ramp = np.minimum(edge(k), edge(W - 1 - k))
acc = np.zeros((Hd, Wd, 3)); ws = np.zeros((Hd, Wd))
wins = {pair(p.stem) for p in (base / "windows").glob("*.png")}
for (i, j) in sorted(wins):
    x, y = i * S - x0, j * S - y0
    if x + W <= 0 or y + W <= 0 or x >= Wd or y >= Hd: continue
    a = np.asarray(Image.open(base / "windows" / f"{i}_{j}.png").convert("RGB").resize((W, W))).astype(float)
    c, r = ramp.copy(), ramp.copy()
    if (i - 1, j) not in wins: c[: W // 2] = 1   # no neighbour on that side: opaque to its own edge
    if (i + 1, j) not in wins: c[W // 2 :] = 1
    if (i, j - 1) not in wins: r[: W // 2] = 1
    if (i, j + 1) not in wins: r[W // 2 :] = 1
    w2 = np.outer(r, c)
    xs, ys, xe, ye = max(0, -x), max(0, -y), min(W, Wd - x), min(W, Hd - y)
    acc[y + ys : y + ye, x + xs : x + xe] += a[ys:ye, xs:xe] * w2[ys:ye, xs:xe, None]
    ws[y + ys : y + ye, x + xs : x + xe] += w2[ys:ye, xs:xe]
paint = acc / np.maximum(ws, 1e-6)[..., None]
render = np.zeros((Hd, Wd, 3)); tgt = np.zeros((Hd, Wd), bool)
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        f = base / "render" / f"{tx}_{ty}.png"; y, x = (ty - ty0) * 1024, (tx - tx0) * 1024
        if f.exists(): render[y : y + 1024, x : x + 1024] = np.asarray(Image.open(f).convert("RGB"))
        if (tx, ty) in target: tgt[y : y + 1024, x : x + 1024] = True
zone = ~(tgt & (ws > 1e-3))
alpha = np.clip(ndimage.distance_transform_edt(~zone) / args.feather, 0, 1)
alpha = alpha * alpha * (3 - 2 * alpha)
out = paint * alpha[..., None] + render * (1 - alpha[..., None])
(base / "paint").mkdir(exist_ok=True)
for tx, ty in rewrite:
    y, x = (ty - ty0) * 1024, (tx - tx0) * 1024
    Image.fromarray(np.clip(out[y : y + 1024, x : x + 1024], 0, 255).astype(np.uint8)).save(base / "paint" / f"{tx}_{ty}.png")
print(f"wrote {len(rewrite)} paint tiles: {' '.join(f'{a}_{b}' for a, b in rewrite)} (feather {args.feather:g} px)")
