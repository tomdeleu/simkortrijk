#!/usr/bin/env python3
"""Per-building wall and roof colour, and a gable roof where LiDAR shows one.

    pip install pillow numpy opencv-python-headless pyproj
    python3 pipeline/tools/building_colours.py [--area kortrijk-binnenstad] [--refetch] [--soften 0.5]

Run after `npm run fetch` and before `npm run scene` (scene.ts reads the output).

Sources, in order of trust:
  1. OSM tags on the building whose centre lies in the GRB footprint:
     building:colour, roof:colour, roof:material, roof:shape (Overpass, cached).
  2. Roof colour sampled from the Digitaal Vlaanderen winter orthophoto OMWRGB25VL
     (2025, 15 cm, fetched at 25 cm): median of the sunlit, non-green pixels inside the
     footprint shrunk by 0.5 m, then pulled half-way to the nearest roof material class.
  3. A Flemish palette by building type when there is no usable sample.

Walls are never visible on an orthophoto, so they come from OSM or the palette:
mostly red and brown brick, some whitewash, buff brick, painted grey; stone for
churches and public buildings, light render for big flat-roofed blocks.

Roof shape: DHMV II 1 m DSM (data/raw/<area>/dhm). A footprint is a gable when the
nDSM spread inside it is > 2 m and the height falls off away from one axis of its
minimum-area rectangle (a tent fit, R² >= 0.35, ridge within 30% of the centre).
Output: eave height above ground, the ridge bearing and a point on the ridge.

Output: data/raw/<area>/building_colours.json
  { "<OIDN>": { "wall": [r,g,b], "roof": [r,g,b], "src": "osm|ortho|palette",
                "cls": roof class, "gable": [eave_m, ridge_angle_rad_lambert, ridge_x, ridge_y (Lambert 72)] | null } }
Colours are 0..1 sRGB, the same space as PALETTE in pipeline/page/renderer.ts.

Softening (--soften, or env COLOUR_SOFTEN; default 0.5): the measured colours are photo-real and
read dark next to the pastel style A. Each colour is moved part of the way to the pastel version
of its own class (PASTEL_ROOF / PASTEL_WALL), keeping its offset from the class base so neighbours
stay different. 0 = measured colours, 1 = full pastel. "wall_raw"/"roof_raw" keep the measured ones.
"""
import argparse, colorsys, glob, hashlib, io, json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np
import cv2
from PIL import Image
import pyproj

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
UA = {"User-Agent": "simkortrijk/0.1 (open-data isometric map of Kortrijk)"}
BBOX = {"kortrijk-binnenstad": (50.813201, 3.242863, 50.841947, 3.288372)}  # keep in step with pipeline/src/areas.ts
ORTHO_LAYER, RES = "OMWRGB25VL", 0.25

ap = argparse.ArgumentParser()
ap.add_argument("--area", default="kortrijk-binnenstad")
ap.add_argument("--refetch", action="store_true")
ap.add_argument("--soften", type=float, default=float(os.environ.get("COLOUR_SOFTEN", "0.5")),
                help="0 = measured colours, 1 = full pastel style-A palette (default 0.5)")
args = ap.parse_args()
raw = os.path.join(ROOT, "data", "raw", args.area)
s, w, n, e = BBOX[args.area]
toL = pyproj.Transformer.from_crs(4326, 31370, always_xy=True)


def get(url, timeout=120):
    for k in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except Exception as ex:  # noqa: BLE001
            if k == 3: raise
            time.sleep(2 * (k + 1))


# --- OSM building tags --------------------------------------------------------------------
osm_file = os.path.join(raw, "osm_building_tags.json")
if args.refetch or not os.path.exists(osm_file):
    q = f'[out:json][timeout:150];(way["building"]({s},{w},{n},{e});relation["building"]({s},{w},{n},{e}););out tags center;'
    body = urllib.parse.urlencode({"data": q}).encode()
    for url in ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]:
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, body, UA), timeout=180).read()
            json.loads(data); open(osm_file, "wb").write(data); break
        except Exception as ex:  # noqa: BLE001
            print("  overpass", url, ex)
osm = json.load(open(osm_file))["elements"]

# --- orthophoto -----------------------------------------------------------------------------
odir = os.path.join(raw, "ortho"); os.makedirs(odir, exist_ok=True)
ofile = os.path.join(odir, f"{ORTHO_LAYER}.png"); ometa = os.path.join(odir, f"{ORTHO_LAYER}.json")
xs, ys = zip(*[toL.transform(lo, la) for lo in (w, e) for la in (s, n)])
X0, X1, Y0, Y1 = int(min(xs)) - 20, int(max(xs)) + 20, int(min(ys)) - 20, int(max(ys)) + 20
if args.refetch or not os.path.exists(ofile):
    W, H = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
    out = np.zeros((H, W, 3), np.uint8)
    for gy in range(Y0, Y1, 500):
        for gx in range(X0, X1, 500):
            bx, by = min(gx + 500, X1), min(gy + 500, Y1)
            ww, hh = round((bx - gx) / RES), round((by - gy) / RES)
            url = (f"https://geo.api.vlaanderen.be/OMW/wms?service=WMS&version=1.3.0&request=GetMap&layers={ORTHO_LAYER}"
                   f"&styles=&crs=EPSG:31370&bbox={gx},{gy},{bx},{by}&width={ww}&height={hh}&format=image/png")
            im = np.array(Image.open(io.BytesIO(get(url))).convert("RGB"))
            r0, c0 = round((Y1 - by) / RES), round((gx - X0) / RES)
            out[r0:r0 + hh, c0:c0 + ww] = im[:H - r0, :W - c0]
    Image.fromarray(out).save(ofile)
json.dump({"layer": ORTHO_LAYER, "x0": X0, "y0": Y0, "x1": X1, "y1": Y1, "res": RES, "epsg": 31370}, open(ometa, "w"))
ortho = np.array(Image.open(ofile).convert("RGB"))
OH, OW = ortho.shape[:2]

# --- DHMV II rasters --------------------------------------------------------------------------
dm = json.load(open(os.path.join(raw, "dhm", "raster.json")))
dsm = np.fromfile(os.path.join(raw, "dhm", "dsm.f32"), np.float32).reshape(dm["height"], dm["width"])
dtm = np.fromfile(os.path.join(raw, "dhm", "dtm.f32"), np.float32).reshape(dm["height"], dm["width"])
ndsm = np.where((dsm > -1000) & (dtm > -1000), dsm - dtm, np.nan)
DR = (dm["x1"] - dm["x0"]) / dm["width"]

# --- palettes ---------------------------------------------------------------------------------
ROOF_CLASSES = {  # sRGB 0..1
    "terracotta": (0.66, 0.33, 0.22),   # red/orange clay pantiles
    "brown_tile": (0.47, 0.30, 0.24),   # old dark clay tiles
    "slate":      (0.31, 0.32, 0.35),   # slate / anthracite tiles (bourgeois houses, churches)
    "dark_flat":  (0.36, 0.36, 0.37),   # bitumen, EPDM
    "grey_flat":  (0.60, 0.58, 0.55),   # gravel, concrete
    "light_flat": (0.80, 0.79, 0.76),   # white membrane, light gravel
    "green":      (0.46, 0.56, 0.34),   # sedum roof
    "copper":     (0.42, 0.62, 0.55),   # verdigris (church roofs, domes)
}
WALLS = [  # (weight, colour, name) for ordinary townhouses
    (52, (0.62, 0.32, 0.24), "red brick"),
    (16, (0.50, 0.30, 0.23), "brown brick"),
    (12, (0.90, 0.87, 0.80), "whitewash / cream paint"),
    (10, (0.78, 0.66, 0.49), "buff brick"),
    (6,  (0.70, 0.70, 0.68), "grey paint"),
    (4,  (0.82, 0.76, 0.66), "sandstone / plaster"),
]
STONE = (0.80, 0.76, 0.66)
MODERN = [(0.82, 0.81, 0.78), (0.70, 0.69, 0.66), (0.62, 0.36, 0.28), (0.40, 0.40, 0.42)]
# Pastel (style A) version of each class: lighter, a bit less saturated, same hue family.
PASTEL_ROOF = {
    "terracotta": (0.88, 0.56, 0.46),   # coral clay
    "brown_tile": (0.74, 0.55, 0.47),   # soft cocoa tile
    "slate":      (0.55, 0.57, 0.63),   # slate blue-grey (same family as the Broeltorens cones)
    "dark_flat":  (0.60, 0.61, 0.64),
    "grey_flat":  (0.80, 0.79, 0.76),
    "light_flat": (0.93, 0.92, 0.89),
    "green":      (0.64, 0.79, 0.58),   # sage
    "copper":     (0.60, 0.81, 0.74),   # mint verdigris
}
PASTEL_WALL = [  # pastel twin of each WALLS / STONE / MODERN colour
    ((0.62, 0.32, 0.24), (0.88, 0.60, 0.52)),   # red brick -> rose brick
    ((0.50, 0.30, 0.23), (0.78, 0.61, 0.53)),   # brown brick -> cocoa
    ((0.90, 0.87, 0.80), (0.98, 0.95, 0.89)),   # whitewash -> cream
    ((0.78, 0.66, 0.49), (0.94, 0.84, 0.67)),   # buff brick -> peach-buff
    ((0.70, 0.70, 0.68), (0.86, 0.86, 0.84)),   # grey paint
    ((0.82, 0.76, 0.66), (0.94, 0.89, 0.80)),   # sandstone / plaster
    ((0.80, 0.76, 0.66), (0.94, 0.90, 0.81)),   # stone
    ((0.82, 0.81, 0.78), (0.93, 0.92, 0.89)),   # modern light render
    ((0.40, 0.40, 0.42), (0.66, 0.67, 0.70)),   # modern dark cladding
]
OSM_MATERIAL = {"slate": "slate", "roof_tiles": "terracotta", "tile": "terracotta", "concrete": "grey_flat",
                "tar_paper": "dark_flat", "gravel": "grey_flat", "copper": "copper", "metal": "grey_flat",
                "grass": "green", "glass": "light_flat"}


def h01(key, salt=""):
    return int(hashlib.md5(f"{key}{salt}".encode()).hexdigest()[:8], 16) / 2 ** 32


def parse_colour(v):
    v = (v or "").strip().lower()
    named = {"red": (0.66, 0.30, 0.24), "brown": (0.48, 0.32, 0.24), "white": (0.92, 0.91, 0.88),
             "grey": (0.60, 0.60, 0.58), "gray": (0.60, 0.60, 0.58), "black": (0.22, 0.22, 0.24),
             "yellow": (0.88, 0.80, 0.55), "beige": (0.85, 0.78, 0.64), "green": (0.40, 0.55, 0.40)}
    if v in named: return named[v]
    if v.startswith("#") and len(v) in (4, 7):
        if len(v) == 4: v = "#" + "".join(c * 2 for c in v[1:])
        return tuple(int(v[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return None


def classify(rgb, flat):
    r, g, b = rgb
    hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
    deg = hh * 360
    if 70 < deg < 170 and ss > 0.18: return "green"
    if 150 <= deg < 200 and ss > 0.15 and vv > 0.35: return "copper"
    if (deg < 40 or deg > 340) and ss > 0.28 and vv > 0.35: return "terracotta"
    if (deg < 45 or deg > 330) and ss > 0.16: return "brown_tile"
    if flat:
        return "light_flat" if vv > 0.62 else "grey_flat" if vv > 0.42 else "dark_flat"
    # winter sun lights slate planes pale grey; on a pitched roof grey is slate or anthracite tile
    return "slate" if vv < 0.66 else "grey_flat"


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t, 3) for i in range(3))


# --- footprints ---------------------------------------------------------------------------------
fc = json.load(open(os.path.join(raw, "buildings.geojson")))
feats = []
for f in fc["features"]:
    g = f["geometry"]; p = f["properties"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
    if not polys: continue
    outer = max(polys, key=lambda pl: len(pl[0]))[0]
    L = np.array([toL.transform(lo, la) for lo, la in outer])
    feats.append((str(p.get("OIDN")), p, L))

# OSM join: centre of the OSM way inside the GRB footprint
osm_pts = [(toL.transform(el["center"]["lon"], el["center"]["lat"]), el.get("tags", {}), el["id"]) for el in osm if "center" in el]
grid = {}
for (x, y), t, i in osm_pts:
    grid.setdefault((int(x // 50), int(y // 50)), []).append((x, y, t, i))


def osm_for(L):
    path = None
    x0, y0 = L.min(0); x1, y1 = L.max(0)
    for gx in range(int(x0 // 50), int(x1 // 50) + 1):
        for gy in range(int(y0 // 50), int(y1 // 50) + 1):
            for x, y, t, i in grid.get((gx, gy), []):
                if cv2.pointPolygonTest(L.astype(np.float32), (float(x), float(y)), False) >= 0:
                    return t, i
    return {}, None


def mask_for(L, x0, y0, res, shape, erode_px):
    pts = np.round(np.stack([(L[:, 0] - x0) / res, (y0 - L[:, 1]) / res], 1)).astype(np.int32)
    c0, r0 = pts.min(0) - 2; c1, r1 = pts.max(0) + 3
    c0, r0 = max(c0, 0), max(r0, 0); c1, r1 = min(c1, shape[1]), min(r1, shape[0])
    if c1 <= c0 or r1 <= r0: return None
    m = np.zeros((r1 - r0, c1 - c0), np.uint8)
    cv2.fillPoly(m, [pts - [c0, r0]], 1)
    if erode_px: m = cv2.erode(m, np.ones((2 * erode_px + 1,) * 2, np.uint8))
    return (r0, r1, c0, c1), m.astype(bool)


def roof_sample(L):
    mm = mask_for(L, X0, Y1, RES, (OH, OW), 2)
    if mm is None: return None
    (r0, r1, c0, c1), m = mm
    px = ortho[r0:r1, c0:c1][m].astype(np.float32)
    if len(px) < 30: return None
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    veg = (2 * g - r - b > 18) & (g > r)
    px = px[~veg]
    if len(px) < 30: return None
    lum = px @ np.array([0.299, 0.587, 0.114])
    lo, hi = np.percentile(lum, 45), np.percentile(lum, 95)   # sunlit roof plane, no glare
    lit = px[(lum >= lo) & (lum <= hi)]
    if len(lit) < 15: return None
    med = np.median(lit, 0) / 255
    # winter photo is cool and hazy: warm it slightly and lift saturation
    med = med * np.array([1.04, 1.0, 0.94])
    hh, ss, vv = colorsys.rgb_to_hsv(*np.clip(med, 0, 1))
    return colorsys.hsv_to_rgb(hh, min(1, ss * 1.35), min(1, vv * 0.95))


def gable(L, h):
    mm = mask_for(L, dm["x0"], dm["y1"], DR, ndsm.shape, 1)
    if mm is None: return None, 0
    (r0, r1, c0, c1), m = mm
    hv = ndsm[r0:r1, c0:c1][m]
    ok = np.isfinite(hv)
    if ok.sum() < 12: return None, 0
    hv = hv[ok]
    spread = np.percentile(hv, 95) - np.percentile(hv, 10)
    rect = cv2.minAreaRect(L.astype(np.float32))
    (cx, cy), (rw, rh), ang = rect
    area = abs(cv2.contourArea(L.astype(np.float32)))
    rectangularity = area / max(rw * rh, 1e-6)
    if spread < 2.0 or rectangularity < 0.8 or min(rw, rh) < 4: return None, spread
    rr, cc = np.nonzero(m)
    rr, cc = rr[ok], cc[ok]
    X = dm["x0"] + (c0 + cc + 0.5) * DR - cx
    Y = dm["y1"] - (r0 + rr + 0.5) * DR - cy
    best = None
    for a in (math.radians(ang), math.radians(ang) + math.pi / 2):  # candidate ridge directions
        ux, uy = math.cos(a), math.sin(a)
        t = -uy * X + ux * Y                      # signed distance across the ridge
        half = (rh if abs(math.cos(a - math.radians(ang))) > 0.5 else rw) / 2
        if half < 2: continue
        for d0 in np.linspace(-0.3 * half, 0.3 * half, 7):  # ridge need not sit in the middle
            d = np.abs(t - d0)
            A = np.stack([np.ones_like(d), d], 1)
            coef, res, *_ = np.linalg.lstsq(A, hv, rcond=None)
            r2 = 1 - (res[0] if len(res) else 0) / max(((hv - hv.mean()) ** 2).sum(), 1e-6)
            if coef[1] < -0.3 and (best is None or r2 > best[0]): best = (r2, a, d0)
    if best is None or best[0] < 0.35: return None, spread
    eave = float(np.clip(np.percentile(hv, 12), 2.5, h - 1.5))
    if h - eave < 1.5: return None, spread
    a, d0 = best[1], float(best[2])
    rx, ry = cx - math.sin(a) * d0, cy + math.cos(a) * d0   # a point on the ridge line (Lambert)
    return [round(eave, 1), round(a, 4), round(rx, 2), round(ry, 2)], spread


def soften(rgb, base, pastel, t):
    """Move rgb toward the pastel twin of its class base, keeping (damped) per-building variation."""
    if t <= 0: return tuple(rgb)
    target = [pastel[i] + (rgb[i] - base[i]) * 0.6 for i in range(3)]
    return tuple(round(min(1, max(0, rgb[i] * (1 - t) + target[i] * t)), 3) for i in range(3))


def soften_wall(rgb, t):
    base, pastel = min(PASTEL_WALL, key=lambda bp: sum((rgb[i] - bp[0][i]) ** 2 for i in range(3)))
    return soften(rgb, base, pastel, t)


# Landmark colour overrides: pipeline/landmarks/<slug>/colours.json forces wall and roof class for
# every footprint whose centre lies inside its OSM area (e.g. the whitewashed Begijnhof).
WALL_BY_NAME = {name.split(" /")[0]: col for _, col, name in WALLS}
overrides = []
for cf in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "landmarks", "*", "colours.json"))):
    ov = json.load(open(cf))
    poly = np.array([toL.transform(lon, lat) for lat, lon in ov["polygon"]], np.float32)
    overrides.append((os.path.basename(os.path.dirname(cf)), poly, WALL_BY_NAME[ov["wall"]], ov["roof"]))
override_hits = {}

def override_for(L):
    c = L.mean(axis=0)
    for slug, poly, wall, roof in overrides:
        if cv2.pointPolygonTest(poly, (float(c[0]), float(c[1])), False) >= 0: return slug, wall, roof
    return None

heights = {}
out, stats = {}, {"osm": 0, "ortho": 0, "palette": 0, "gable": 0, "cls": {}}
for oidn, p, L in feats:
    h = float(p.get("height_m") or 8)
    tags, osm_id = osm_for(L)
    btype = tags.get("building", "")
    big = abs(cv2.contourArea(L.astype(np.float32))) > 600
    g, spread = gable(L, h) if p.get("layer") != "Knw" else (None, 0)
    flat = g is None and spread < 1.5
    roof, src, cls = None, "palette", None
    if tags.get("roof:colour") and parse_colour(tags["roof:colour"]):
        roof, src = parse_colour(tags["roof:colour"]), "osm"
    elif tags.get("roof:material") in OSM_MATERIAL:
        cls = OSM_MATERIAL[tags["roof:material"]]; roof, src = ROOF_CLASSES[cls], "osm"
    else:
        smp = roof_sample(L)
        if smp is not None:
            cls = classify(smp, flat)
            roof, src = mix(smp, ROOF_CLASSES[cls], 0.5), "ortho"
    if roof is None:
        cls = "grey_flat" if flat else ("slate" if h01(oidn, "r") < 0.35 else "terracotta")
        roof = ROOF_CLASSES[cls]
    if cls is None: cls = classify(roof, flat)
    church = btype in ("church", "cathedral", "chapel") or tags.get("amenity") == "place_of_worship"
    if church and src == "ortho" and cls not in ("copper", "green", "slate"):
        cls, roof = "slate", ROOF_CLASSES["slate"]   # Kortrijk churches: slate roofs (Onroerend Erfgoed inventory)
    public = btype in ("public", "civic", "school", "college", "train_station", "hospital", "government") or p.get("layer") == "Knw"
    if parse_colour(tags.get("building:colour")):
        wall = parse_colour(tags["building:colour"])
    elif church or public and h > 14:
        wall = STONE
    elif flat and (big or h > 16):
        wall = MODERN[int(h01(oidn, "m") * len(MODERN))]
    else:
        t = h01(oidn, "w") * sum(x[0] for x in WALLS)
        # old slate-roofed houses lean to painted/plastered fronts
        if cls == "slate" and h01(oidn, "s") < 0.25: t = sum(x[0] for x in WALLS[:2])
        for wt, col, _ in WALLS:
            t -= wt
            if t < 0: wall = col; break
    ov = override_for(L)
    if ov:
        slug, wall, cls = ov
        roof = ROOF_CLASSES[cls]
        override_hits[slug] = override_hits.get(slug, 0) + 1
    # small per-house jitter so a row of houses does not read as one block
    j = (h01(oidn, "j") - 0.5) * 0.08
    wall = tuple(round(min(1, max(0, c * (1 + j))), 3) for c in wall)
    roof = tuple(round(c, 3) for c in roof)
    out[oidn] = {"wall": list(soften_wall(wall, args.soften)), "roof": list(soften(roof, ROOF_CLASSES[cls], PASTEL_ROOF[cls], args.soften)),
                 "wall_raw": list(wall), "roof_raw": list(roof), "src": src, "cls": cls, "gable": g}
    if osm_id: out[oidn]["osm"] = osm_id
    stats[src] += 1; stats["cls"][cls] = stats["cls"].get(cls, 0) + 1; stats["gable"] += g is not None

json.dump(out, open(os.path.join(raw, "building_colours.json"), "w"))
N = len(out)
print(f"  {N} GRB footprints: roof from osm {stats['osm']}, ortho {stats['ortho']} ({100*stats['ortho']/N:.1f}%), palette {stats['palette']}; gable roofs {stats['gable']} ({100*stats['gable']/N:.1f}%)")
print(f"  soften {args.soften} (0 = measured, 1 = pastel)")
print("  roof classes", dict(sorted(stats["cls"].items(), key=lambda kv: -kv[1])))
for slug, n in override_hits.items(): print(f"  landmark colours {slug}: {n} footprints")
