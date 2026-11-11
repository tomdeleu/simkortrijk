/**
 * Fetch the open data a Kortrijk area is built from. No Google imagery.
 *
 *   npm run fetch -- kortrijk-binnenstad
 *
 * data/raw/<area>/buildings.geojson   GRB GBG/GBA/KNW footprints (WGS84) + height_m / height_src
 * data/raw/<area>/grb_roads.geojson   GRB WBN road polygons
 * data/raw/<area>/grb_water.geojson   GRB WTZ water polygons
 * data/raw/<area>/dhm/{dtm,dsm}.f32   DHMV II 1 m, row 0 = north, plus raster.json
 * data/raw/<area>/osm.json            OSM buildings (church tags) and natural=tree
 * data/raw/<area>/roads.json          OSM drivable roads (traffic)
 * data/raw/<area>/ground.json         OSM ground (parks, landuse, paths, rail) + margin
 * data/raw/<area>/trees.geojson       orthophoto + CHM crowns, merged with OSM trees
 * data/raw/<area>/3dgrb.json          checkpoint of 3D GRB heights (resume)
 *
 * Heights: 3D GRB WMS GetFeatureInfo (GRBGEBL1D2, HN_P99) where the building still
 * matches the 2015 survey; otherwise the 95th percentile of DHMV II DSM−DTM inside
 * the footprint. Towers flattened by 3D GRB are rebuilt later in scene.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openArea } from "./areas.ts";
import { fetchDhmv, fillPolygon, lambertBounds, loadRaster, sampleNearest, saveRaster, toLambert, UA } from "./flanders.ts";
import { RAW } from "./paths.ts";
import { detectTrees } from "./trees.ts";

const WFS = "https://geo.api.vlaanderen.be/GRB/wfs";
const WMS3D = "https://geo.api.vlaanderen.be/3DGRB/wms";
const LAYERS = ["GBG", "GBA", "KNW"] as const;
const ENT: Record<string, string> = { GBG: "Gbg", GBA: "Gba", KNW: "Knw" };
const SKIP = new Set(["trap", "ingezonken garagetoegang", "verheven garagetoegang", "pijler", "overbrugging"]);

type BBox = [number, number, number, number];
type Feature = { type: "Feature"; geometry: { type: string; coordinates: number[][][] | number[][][][] }; properties: Record<string, unknown> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, ms = 180_000): Promise<any> {
  let last = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
      if (r.status === 429 || r.status >= 500) throw new Error(String(r.status));
      if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 160)}`);
      return await r.json();
    } catch (err) {
      last = (err as Error).message;
      if (attempt === 5) break;
      await sleep(1000 * attempt);
    }
  }
  throw new Error(last);
}

async function overpass(query: string) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(180_000),
    });
    if (r.ok) return r.json();
    console.warn(`  overpass ${r.status}, retrying…`);
    await sleep(10_000 * attempt);
  }
  throw new Error("overpass failed");
}

/** WFS 2.0 GeoJSON. bbox is west,south,east,north. Paged; cells keep a full-city run from timing out. */
async function wfs(typeName: string, bbox: BBox): Promise<Feature[]> {
  const [s, w, n, e] = bbox;
  const step = 0.02;
  const seen = new Map<string, Feature>();
  for (let lat = s; lat < n - 1e-12; lat = Math.min(n, lat + step)) {
    const lat2 = Math.min(n, lat + step);
    for (let lon = w; lon < e - 1e-12; lon = Math.min(e, lon + step)) {
      const lon2 = Math.min(e, lon + step);
      const page = 1000;
      for (let start = 0; ; start += page) {
        const q = new URLSearchParams({
          service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: `GRB:${typeName}`,
          srsName: "EPSG:4326", bbox: `${lon},${lat},${lon2},${lat2},EPSG:4326`,
          outputFormat: "application/json", count: String(page), startIndex: String(start),
        });
        const j = await getJson(`${WFS}?${q}`);
        const batch: Feature[] = j.features ?? [];
        for (const f of batch) seen.set(String(f.properties?.OIDN ?? seen.size), f);
        if (batch.length < page) break;
      }
      process.stdout.write(`\r  ${typeName}: ${seen.size} features`);
    }
  }
  process.stdout.write("\n");
  return [...seen.values()];
}

function outerRing(f: Feature): number[][] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === "Polygon") return (g.coordinates as number[][][])[0] ?? null;
  if (g.type === "MultiPolygon") return (g.coordinates as number[][][][])[0]?.[0] ?? null;
  return null;
}

function inside(lon: number, lat: number, ring: number[][]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function interior(ring: number[][]): [number, number] {
  let sx = 0, sy = 0, n = 0, minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [lon, lat] of ring) {
    if (n > 0 && lon === ring[0][0] && lat === ring[0][1]) continue;
    sx += lon; sy += lat; n++;
    minx = Math.min(minx, lon); maxx = Math.max(maxx, lon); miny = Math.min(miny, lat); maxy = Math.max(maxy, lat);
  }
  const c: [number, number] = [sx / n, sy / n];
  if (inside(c[0], c[1], ring)) return c;
  const b: [number, number] = [(minx + maxx) / 2, (miny + maxy) / 2];
  if (inside(b[0], b[1], ring)) return b;
  return [ring[0][0], ring[0][1]];
}

function chmP95(ring: number[][], dtm: ReturnType<typeof loadRaster>, dsm: ReturnType<typeof loadRaster>): number | null {
  const lam = ring.map(([lon, lat]) => toLambert(lon, lat));
  const vals: number[] = [];
  fillPolygon(lam, 1, (x, y) => {
    const a = sampleNearest(dsm, x, y), b = sampleNearest(dtm, x, y);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const h = a - b;
      if (h > -1 && h < 120) vals.push(h);
    }
  });
  if (vals.length < 3) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))];
}

const num = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

async function featureInfo(x: number, y: number): Promise<any[] | null> {
  const q = new URLSearchParams({
    service: "WMS", version: "1.3.0", request: "GetFeatureInfo",
    layers: "GRBGEBL1D2", query_layers: "GRBGEBL1D2", crs: "EPSG:31370",
    bbox: `${x - 1},${y - 1},${x + 1},${y + 1}`, width: "3", height: "3", i: "1", j: "1",
    info_format: "application/geo+json", feature_count: "8",
  });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(`${WMS3D}?${q}`, { headers: UA, signal: AbortSignal.timeout(25_000) });
      if (r.status === 429 || r.status >= 500) throw new Error(String(r.status));
      if (!r.ok) return [];
      const j = await r.json();
      return j.features ?? [];
    } catch {
      if (attempt === 4) return null;
      await sleep(400 * attempt);
    }
  }
  return null;
}

async function mapPool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  }));
}

const name = process.argv[2] ?? "kortrijk-binnenstad";
const area = openArea(name);
const dir = join(RAW, name);
mkdirSync(dir, { recursive: true });
const [lx0, ly0, lx1, ly1] = lambertBounds(area.bbox, 40);

const dhmDir = join(dir, "dhm");
if (!existsSync(join(dhmDir, "dtm.f32")) || !existsSync(join(dhmDir, "dsm.f32"))) {
  console.log(`  DHMV II ${lx0},${ly0} .. ${lx1},${ly1}`);
  const dtm = await fetchDhmv("DHMVII_DTM_1m", lx0, ly0, lx1, ly1);
  const dsm = await fetchDhmv("DHMVII_DSM_1m", lx0, ly0, lx1, ly1);
  saveRaster(dhmDir, "dtm", dtm);
  saveRaster(dhmDir, "dsm", dsm);
} else console.log("  DHMV II: cached");

const buildingsFile = join(dir, "buildings.geojson");
if (!existsSync(buildingsFile)) {
  const dtm = loadRaster(dhmDir, "dtm"), dsm = loadRaster(dhmDir, "dsm");
  const checkpointFile = join(dir, "3dgrb.json");
  const checkpoint: Record<string, number | null> = existsSync(checkpointFile) ? JSON.parse(readFileSync(checkpointFile, "utf8")) : {};
  type Row = { f: Feature; layer: string; ent: string; key: string; ring: number[][]; chm: number | null };
  const rows: Row[] = [];
  let skipped = 0;
  for (const layer of LAYERS) {
    for (const f of await wfs(layer, area.bbox)) {
      const lbl = String(f.properties?.LBLTYPE ?? "");
      if (SKIP.has(lbl)) { skipped++; continue; }
      const ring = outerRing(f);
      if (!ring || ring.length < 4) continue;
      const oidn = String(f.properties.OIDN);
      rows.push({ f, layer, ent: ENT[layer], key: `${ENT[layer]}:${oidn}`, ring, chm: chmP95(ring, dtm, dsm) });
    }
  }
  console.log(`  ${rows.length} footprints to height (${skipped} ramps/pillars/bridges skipped)`);
  const pending = rows.filter((r) => !Object.hasOwn(checkpoint, r.key));
  let done = 0;
  const t0 = Date.now();
  await mapPool(pending, 8, async (row) => {
    const [lon, lat] = interior(row.ring);
    const [x, y] = toLambert(lon, lat);
    const feats = await featureInfo(x, y);
    if (feats == null) return; // network failure: leave it for the next run
    const hit = feats.find((feat) => String(feat.properties?.GRB_OIDN) === String(row.f.properties.OIDN) && feat.properties?.ENTITEIT === row.ent);
    checkpoint[row.key] = hit ? num(hit.properties.HN_P99) : null;
    if (++done % 200 === 0) {
      writeFileSync(checkpointFile, JSON.stringify(checkpoint));
      console.log(`  3D GRB ${done}/${pending.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
  });
  writeFileSync(checkpointFile, JSON.stringify(checkpoint));
  const failed = rows.filter((r) => !Object.hasOwn(checkpoint, r.key));
  if (failed.length) {
    console.warn(`  ${failed.length} 3D GRB lookups failed; DHMV or the default height is used for those`);
    for (const row of failed) checkpoint[row.key] = null;
    writeFileSync(checkpointFile, JSON.stringify(checkpoint));
  }
  const stats: Record<string, number> = { "3DGRB HN_P99": 0, "DHMVII DSM-DTM p95": 0, default: 0 };
  const features: Feature[] = [];
  for (const row of rows) {
    const hit = checkpoint[row.key];
    let height: number, src: string;
    if (hit != null) { height = hit; src = "3DGRB HN_P99"; }
    else if (row.chm != null) { height = row.chm; src = "DHMVII DSM-DTM p95"; }
    else { height = row.layer === "GBA" ? 3.5 : 8; src = "default"; }
    height = Math.max(2.5, height);
    stats[src] = (stats[src] ?? 0) + 1;
    features.push({
      type: "Feature",
      geometry: row.f.geometry,
      properties: {
        OIDN: row.f.properties.OIDN, layer: row.ent, LBLTYPE: row.f.properties.LBLTYPE ?? null,
        height_m: Math.round(height * 100) / 100, height_src: src,
      },
    });
  }
  writeFileSync(buildingsFile, JSON.stringify({ type: "FeatureCollection", features }));
  console.log("  heights", stats);
} else console.log("  buildings: cached");

async function saveLayer(file: string, typeName: string) {
  if (existsSync(file)) { console.log(`  ${typeName}: cached`); return; }
  const features = await wfs(typeName, area.bbox);
  writeFileSync(file, JSON.stringify({ type: "FeatureCollection", features }));
}
await saveLayer(join(dir, "grb_roads.geojson"), "WBN");
await saveLayer(join(dir, "grb_water.geojson"), "WTZ");

const [s, w, n, e] = area.bbox;
if (!existsSync(join(dir, "osm.json"))) {
  const b = `(${s},${w},${n},${e})`;
  const data = await overpass(`[out:json][timeout:180];
(way["building"]${b}; relation["building"]${b}; node["natural"="tree"]${b}; node["historic"="tower"]${b}; node["man_made"="tower"]${b};);
out body geom;`);
  writeFileSync(join(dir, "osm.json"), JSON.stringify(data));
  console.log(`  osm: ${data.elements.length} elements`);
}
if (!existsSync(join(dir, "roads.json"))) {
  const data = await overpass(`[out:json][timeout:180];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|service)$"]["area"!="yes"](${s},${w},${n},${e});
out body geom;`);
  writeFileSync(join(dir, "roads.json"), JSON.stringify(data));
  console.log(`  roads: ${data.elements.length} ways`);
}
if (!existsSync(join(dir, "ground.json"))) {
  const m = 0.006;
  const b = `(${s - m},${w - m},${n + m},${e + m})`;
  const data = await overpass(`[out:json][timeout:240];
(
  way["highway"]["tunnel"!~"yes|building_passage"]${b};
  way["area:highway"]${b};
  way["railway"~"^(rail|light_rail|tram)$"]["tunnel"!="yes"]${b};
  nwr["landuse"]${b};
  nwr["leisure"~"^(park|garden|pitch|playground|stadium|track|golf_course|dog_park|nature_reserve|recreation_ground)$"]${b};
  nwr["natural"~"^(water|wood|scrub|grassland|wetland)$"]${b};
  nwr["water"]${b};
  nwr["waterway"="riverbank"]${b};
  nwr["amenity"~"^(parking|school|university|college|hospital|grave_yard|place_of_worship)$"]${b};
  nwr["place"="square"]${b};
  nwr["historic"="tower"]${b};
);
out body geom;`);
  writeFileSync(join(dir, "ground.json"), JSON.stringify(data));
  console.log(`  ground: ${data.elements.length} elements`);
}
if (!existsSync(join(dir, "trees.geojson"))) await detectTrees(dir, area.bbox);
else console.log("  trees: cached");
