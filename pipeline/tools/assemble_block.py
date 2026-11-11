#!/usr/bin/env python3
"""Write paint tiles for one finished block, feathered into the unpainted render.

The painter's own assemble blends every finished window across the whole area.
A partial block needs a soft edge where it meets render tiles that are not
painted yet. This builds that edge: 64 px between windows, about 220 px of
feather into the render.

Default block is the Broeltorens paint: windows i=-2..0, j=-3..-1, tiles
tx=-2..0, ty=-2..-1.
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

S, W, OV, FE = 896, 1024, 128, 64


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def span(spec: str):
    if ".." in spec:
        a, b = (int(v) for v in spec.split("..", 1))
        step = 1 if b >= a else -1
        return list(range(a, b + step, step))
    return [int(v) for v in spec.split(",") if v != ""]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--area", default="kortrijk-binnenstad")
    ap.add_argument("--base", type=Path, help="derived area directory (default data/derived/<area>)")
    ap.add_argument("--windows", default="-2..0,-3..-1", help="i range, j range (inclusive)")
    ap.add_argument("--tiles", default="-2..0,-2..-1", help="tx range, ty range (inclusive)")
    ap.add_argument("--feather", type=float, default=220)
    args = ap.parse_args()
    i_spec, j_spec = args.windows.split(",")
    tx_spec, ty_spec = args.tiles.split(",")
    ii, jj = span(i_spec), span(j_spec)
    txs, tys = span(tx_spec), span(ty_spec)
    base = args.base or (repo_root() / "data" / "derived" / args.area)
    x0, y0 = min(txs) * 1024, min(tys) * 1024
    x1, y1 = (max(txs) + 1) * 1024, (max(tys) + 1) * 1024
    height, width = y1 - y0, x1 - x0
    k = np.arange(W)
    edge = lambda t: np.clip((t + 0.5 - (OV - FE) / 2) / FE, 0, 1)
    ramp = np.minimum(edge(k), edge(W - 1 - k))
    acc = np.zeros((height, width, 3))
    ws = np.zeros((height, width))
    imin, imax, jmin, jmax = min(ii), max(ii), min(jj), max(jj)
    for i in ii:
        for j in jj:
            path = base / "windows" / f"{i}_{j}.png"
            if not path.is_file():
                sys.exit(f"missing {path}: paint this window first")
            a = np.array(Image.open(path).convert("RGB").resize((W, W))).astype(float)
            r, c = ramp.copy(), ramp.copy()
            # Outer edges of the block stay opaque; the render blend feathers them.
            if i == imin:
                c[: W // 2] = 1
            if i == imax:
                c[W // 2 :] = 1
            if j == jmin:
                r[: W // 2] = 1
            if j == jmax:
                r[W // 2 :] = 1
            w2 = np.outer(r, c)
            x, y = i * S - x0, j * S - y0
            xs, ys = max(0, -x), max(0, -y)
            xe, ye = min(W, width - x), min(W, height - y)
            acc[y + ys : y + ye, x + xs : x + xe] += a[ys:ye, xs:xe] * w2[ys:ye, xs:xe, None]
            ws[y + ys : y + ye, x + xs : x + xe] += w2[ys:ye, xs:xe]
    paint = acc / np.maximum(ws, 1e-6)[..., None]
    covered = ws > 1e-3
    # Names are {tx}_{ty}.png, and ty (or tx) may be negative: "0_-1" must not split on every underscore.
    tiles = set()
    for f in (base / "render").iterdir():
        m = re.fullmatch(r"(-?\d+)_(-?\d+)\.png", f.name)
        if m:
            tiles.add((int(m.group(1)), int(m.group(2))))
    render = np.zeros((height, width, 3))
    for ty in tys:
        for tx in txs:
            y, x = ty * 1024 - y0, tx * 1024 - x0
            render[y : y + 1024, x : x + 1024] = np.array(Image.open(base / "render" / f"{tx}_{ty}.png").convert("RGB"))
    pad = 1
    zone = np.zeros((height + 2 * pad, width + 2 * pad), bool)
    zone[pad:-pad, pad:-pad] = ~covered

    def row_slice(ty):
        y = ty * 1024 - y0
        return slice(pad + y, pad + y + 1024)

    def col_slice(tx):
        x = tx * 1024 - x0
        return slice(pad + x, pad + x + 1024)

    tx0, tx1, ty0, ty1 = min(txs), max(txs), min(tys), max(tys)
    for ty in range(ty0, ty1 + 1):
        if (tx0 - 1, ty) in tiles:
            zone[row_slice(ty), slice(0, pad)] = True
        if (tx1 + 1, ty) in tiles:
            zone[row_slice(ty), slice(-pad, None)] = True
    for tx in range(tx0, tx1 + 1):
        if (tx, ty0 - 1) in tiles:
            zone[slice(0, pad), col_slice(tx)] = True
        if (tx, ty1 + 1) in tiles:
            zone[slice(-pad, None), col_slice(tx)] = True
    dist = ndimage.distance_transform_edt(~zone)[pad:-pad, pad:-pad]
    t = np.clip(dist / args.feather, 0, 1)
    alpha = t * t * (3 - 2 * t)
    alpha[~covered] = 0
    out = paint * alpha[..., None] + render * (1 - alpha[..., None])
    dest = base / "paint"
    dest.mkdir(parents=True, exist_ok=True)
    for ty in tys:
        for tx in txs:
            y, x = ty * 1024 - y0, tx * 1024 - x0
            Image.fromarray(np.clip(out[y : y + 1024, x : x + 1024], 0, 255).astype(np.uint8)).save(dest / f"{tx}_{ty}.png")
    print(f"wrote {len(txs) * len(tys)} tiles to {dest} (feather {args.feather:g}px)")


if __name__ == "__main__":
    main()
