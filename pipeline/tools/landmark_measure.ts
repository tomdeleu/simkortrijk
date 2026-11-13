/**
 * Measure a GRB footprint for a landmark massing.json: axis of the longest edge, the ring in (u, v)
 * metres around the vertex mean, a DHMV II nDSM grid (DSM minus ground, 2 m steps) and the tallest point.
 * The printed anchor, axis_deg and (u, v) are what landmarks/<slug>/massing.json expects.
 *
 *   npx tsx tools/landmark_measure.ts <OIDN> [area]          (from pipeline/)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toLambert, fromLambert, loadRaster, sampleBilinear } from "../src/flanders.ts";

const oid = Number(process.argv[2]);
const area = process.argv[3] ?? "kortrijk-binnenstad";
const raw = join(import.meta.dirname, "..", "..", "data", "raw", area);
const g = JSON.parse(readFileSync(join(raw, "buildings.geojson"), "utf8"));
const f = g.features.find((x: any) => x.properties.OIDN === oid);
if (!f) throw new Error(`GRB ${oid} not in ${area}`);
const ll = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
const ring: number[][] = ll.map((p: number[]) => toLambert(p[0], p[1]));
let best = 0, ang = 0;
for (let i = 0; i < ring.length - 1; i++) {
  const dx = ring[i + 1][0] - ring[i][0], dy = ring[i + 1][1] - ring[i][1], L = Math.hypot(dx, dy);
  if (L > best) { best = L; ang = (Math.atan2(dy, dx) * 180) / Math.PI; }
}
const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
const a = (ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
const uv = ring.map(([x, y]) => [(x - cx) * ca + (y - cy) * sa, -(x - cx) * sa + (y - cy) * ca]);
const [alon, alat] = fromLambert(cx, cy);
console.log(`GRB ${oid} ${JSON.stringify(f.properties)}`);
console.log(`anchor [${alat.toFixed(7)}, ${alon.toFixed(7)}]  axis_deg ${ang.toFixed(1)}  longest edge ${best.toFixed(1)} m`);
console.log(`u points ${compass(ca, sa)}, v points ${compass(-sa, ca)}`);
console.log("ring (u,v): " + uv.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" | "));
const dsm = loadRaster(join(raw, "dhm"), "dsm"), dtm = loadRaster(join(raw, "dhm"), "dtm");
const us = uv.map((p) => p[0]), vs = uv.map((p) => p[1]);
const u0 = Math.floor(Math.min(...us)) - 4, u1 = Math.ceil(Math.max(...us)) + 4, v0 = Math.floor(Math.min(...vs)) - 4, v1 = Math.ceil(Math.max(...vs)) + 4;
const ground = sampleBilinear(dtm, cx, cy);
const at = (u: number, v: number) => sampleBilinear(dsm, cx + u * ca - v * sa, cy + u * sa + v * ca) - ground;
console.log(`nDSM in m above ground (${ground.toFixed(1)} m), rows v from ${v1} down to ${v0}, columns u every 2 m:`);
for (let v = v1; v >= v0; v -= 2) {
  let s = String(v).padStart(4) + " ";
  for (let u = u0; u <= u1; u += 2) { const h = at(u, v); s += h < 1 ? "  ." : h.toFixed(0).padStart(3); }
  console.log(s);
}
console.log("   u:" + Array.from({ length: Math.floor((u1 - u0) / 2) + 1 }, (_, k) => String(u0 + 2 * k).padStart(3)).join(""));
let mx = 0, mu = 0, mv = 0;
for (let u = u0; u <= u1; u += 0.5) for (let v = v0; v <= v1; v += 0.5) { const h = at(u, v); if (h > mx) { mx = h; mu = u; mv = v; } }
console.log(`tallest ${mx.toFixed(1)} m at u ${mu}, v ${mv} (a LiDAR spire tip is under-sampled: the real tip is a few m higher)`);

function compass(x: number, y: number) {
  const b = ((90 - (Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(b / 45) % 8] + ` (bearing ${b.toFixed(0)}°)`;
}
