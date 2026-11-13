"""Fetch landmark reference images into pipeline/landmarks/<slug>/refs/ and write refs/SOURCES.md:
Wikimedia Commons photos (search, max 900 px, licence + author) and a Digitaal Vlaanderen orthophoto crop
(OMZRGB24VL, north-up). For look-up only; Street View / Google screenshots are never stored here.

  python3 pipeline/tools/landmark_refs.py <slug> --search "Sint-Janskerk Kortrijk" --require Kortrijk [--max 8] --ortho 50.82911,3.28118 [--ortho-m 160]
"""
import argparse, json, re, urllib.parse, urllib.request
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("slug"); ap.add_argument("--search", action="append", default=[])
ap.add_argument("--require", help="regex every Commons title must match (e.g. Kortrijk): searches also return other towns")
ap.add_argument("--max", type=int, default=8); ap.add_argument("--ortho"); ap.add_argument("--ortho-m", type=float, default=160)
a = ap.parse_args()
UA = {"User-Agent": "simkortrijk-refs/1.0"}
def get(u, tries=6):
    """Wikimedia answers 429 to quick downloads: wait and retry (5, 10, 20 ... s), and pause between files."""
    import time, urllib.error
    for k in range(tries):
        try:
            b = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
            time.sleep(1.5)
            return b
        except urllib.error.HTTPError as e:
            if e.code != 429 or k == tries - 1: raise
            time.sleep(5 * 2 ** k)
refs = Path(__file__).resolve().parents[1] / "landmarks" / a.slug / "refs"
refs.mkdir(parents=True, exist_ok=True)
n = len([p for p in refs.glob("*.jpg")])
rows = []
titles = []
for q in a.search:
    r = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "query", "list": "search", "srnamespace": 6, "srsearch": q, "srlimit": 30, "format": "json"})))
    titles += [s["title"] for s in r["query"]["search"] if re.search(r"\.(jpe?g|png)$", s["title"], re.I) and s["title"] not in titles
               and (not a.require or re.search(a.require, s["title"], re.I))]
titles = titles[: a.max]
if titles:
    d = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "query", "titles": "|".join(titles), "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 900, "format": "json"})))
    pages = sorted(d["query"]["pages"].values(), key=lambda p: titles.index(p["title"]) if p["title"] in titles else 99)
    for p in pages:
        if "imageinfo" not in p: continue
        ii = p["imageinfo"][0]; m = ii["extmetadata"]; n += 1
        slug = re.sub(r"[^a-z0-9]+", "-", p["title"][5:].rsplit(".", 1)[0].lower()).strip("-")[:60]
        fn = f"{n:02d}-{slug}.jpg"
        (refs / fn).write_bytes(get(ii["thumburl"]))
        art = re.sub("<[^>]+>", "", m.get("Artist", {}).get("value", "?")).strip()
        rows.append(f"| {fn} | {ii['descriptionurl']} | {m.get('LicenseShortName', {}).get('value', '?')} | {art} |")
if a.ortho:
    lat, lon = map(float, a.ortho.split(","))
    dl = a.ortho_m / 2 / 111320; dlo = dl / 0.63
    n += 1; fn = f"{n:02d}-top-{a.slug}-omzrgb24vl.jpg"
    (refs / fn).write_bytes(get("https://geo.api.vlaanderen.be/OMZ/wms?" + urllib.parse.urlencode({
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": "OMZRGB24VL", "STYLES": "", "CRS": "EPSG:4326",
        "BBOX": f"{lat-dl},{lon-dlo},{lat+dl},{lon+dlo}", "WIDTH": 800, "HEIGHT": 800, "FORMAT": "image/jpeg"})))
    rows.append(f"| {fn} | Digitaal Vlaanderen orthophoto WMS `OMZRGB24VL` (summer 2024), north-up crop (geo.api.vlaanderen.be) | Modellicentie Gratis Hergebruik (open data, attribution: Digitaal Vlaanderen) | Digitaal Vlaanderen |")
src = refs / "SOURCES.md"
head = "# Reference images\n\nSmall copies (max 900 px), for look-up only (prompt research, render edits). Not part of the map output.\n\n| file | source | licence | author |\n|---|---|---|---|\n"
src.write_text((src.read_text() if src.exists() else head) + "".join(r + "\n" for r in rows))
print("\n".join(rows) or "nothing found")
