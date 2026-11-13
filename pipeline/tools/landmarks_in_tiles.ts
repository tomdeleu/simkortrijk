/**
 * For planning a piece: the centre lat/lon of each tile (for Street View, satellite, orthophoto) and the
 * named OSM churches, heritage, museums, towers and GRB footprints over 25 m whose position falls in it.
 *
 *   npx tsx tools/landmarks_in_tiles.ts 3_-2 2_-3 1_-3 [--area kortrijk-binnenstad]      (from pipeline/)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useRegion, llhToPixel } from "../src/camera.ts";

const argv = process.argv.slice(2);
const ai = argv.indexOf("--area");
const area = ai >= 0 ? argv.splice(ai, 2)[1] : "kortrijk-binnenstad";
const tiles = new Set(argv);
useRegion("kortrijk");
const raw = join(import.meta.dirname, "..", "..", "data", "raw", area);
const key = (lat: number, lon: number, h = 20) => { const [x, y] = llhToPixel(lat, lon, h); return `${Math.floor(x / 1024)}_${Math.floor(y / 1024)}`; };

for (const t of tiles) {
  const [tx, ty] = t.split("_").map(Number), X = tx * 1024 + 512, Y = ty * 1024 + 512;
  let lat = 50.8276, lon = 3.2656;
  for (let k = 0; k < 60; k++) {
    const [x, y] = llhToPixel(lat, lon, 19), [x2, y2] = llhToPixel(lat, lon + 1e-4, 19), [x3, y3] = llhToPixel(lat + 1e-4, lon, 19);
    const a = (x2 - x) / 1e-4, b = (x3 - x) / 1e-4, c = (y2 - y) / 1e-4, d = (y3 - y) / 1e-4, det = a * d - b * c, ex = X - x, ey = Y - y;
    lon += (d * ex - b * ey) / det; lat += (-c * ex + a * ey) / det;
  }
  console.log(`tile ${t}: centre ${lat.toFixed(5)},${lon.toFixed(5)}`);
}
const osm = JSON.parse(readFileSync(join(raw, "osm_building_tags.json"), "utf8"));
const els: any[] = Array.isArray(osm) ? osm : osm.elements ?? Object.values(osm);
for (const e of els) {
  const t = e.tags ?? {}, c = e.center ?? (e.lat != null ? { lat: e.lat, lon: e.lon } : null);
  if (!c || !t.name) continue;
  const hit = t.amenity === "place_of_worship" || t.building === "church" || t.historic || t.heritage || t.tourism === "museum" || t.tourism === "attraction" || t.man_made === "tower" || t.amenity === "townhall";
  const k = key(c.lat, c.lon);
  if (hit && tiles.has(k)) console.log(`${k}  OSM ${e.type} ${e.id}  ${t.name}  [${t.building ?? t.amenity ?? t.historic ?? ""}${t.heritage ? ", heritage" : ""}]  ${c.lat},${c.lon}`);
}
const g = JSON.parse(readFileSync(join(raw, "buildings.geojson"), "utf8"));
for (const f of g.features) {
  if (!(f.properties.height_m > 25)) continue;
  const r = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
  const la = r.reduce((s: number, p: number[]) => s + p[1], 0) / r.length, lo = r.reduce((s: number, p: number[]) => s + p[0], 0) / r.length;
  const k = key(la, lo);
  if (tiles.has(k)) console.log(`${k}  GRB ${f.properties.OIDN}  ${f.properties.height_m} m (${f.properties.height_src}, ${f.properties.LBLTYPE})  ${la.toFixed(6)},${lo.toFixed(6)}`);
}
