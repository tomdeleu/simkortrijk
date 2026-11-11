/**
 * Build the 3D scene for an area from Flemish open data, in the camera's ENU frame.
 *
 *   npm run scene -- kortrijk-binnenstad
 *
 * Output: data/derived/<area>/scene/<tx>_<ty>.json
 *   b: buildings [ring (ENU x,y pairs, CCW), height above ground, style, groundHint, holes?,
 *      colour? (wall rgb + roof rgb), gable? (eave m, ridge point x y, ridge dir x y)]
 *   t: tree crowns [x, y, radius, crown-centre height above ground]
 *
 * Footprints are GRB. Heights are 3D GRB HN_P99, filled from DHMV where the 2015
 * survey has no building. Spires that 3D GRB flattens (Sint-Maartenskerk, Belfort)
 * are cut from the LiDAR canopy where it rises 8 m above the surveyed roof.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openArea } from "./areas.ts";
import { CAMERA, ecefToEnu, enuToPixel, llhToEcef } from "./camera.ts";
import { fromLambert, loadRaster, toLambert } from "./flanders.ts";
import { GROUND_M } from "./heights.ts";
import { DERIVED, RAW, readJson } from "./paths.ts";

type P2 = [number, number];
const T = CAMERA.tile;
const GROUND_GUESS = GROUND_M;

const toEnu = (lon: number, lat: number): [number, number, number] => ecefToEnu(llhToEcef(lat, lon, 0));

function area2(r: P2[]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

function simplify(r: P2[], tol: number): P2[] {
  if (r.length <= 4) return r;
  const keep = new Uint8Array(r.length);
  keep[0] = keep[r.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, r.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bi = -1;
    const [ax, ay] = r[a], [bx, by] = r[b];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - r[i][1]) - (ax - r[i][0]) * (by - ay)) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return r.filter((_, i) => keep[i]);
}

function ringFromLonLat(coords: number[][], hole = false): P2[] | null {
  let r: P2[] = coords.map(([lon, lat]) => { const p = toEnu(lon, lat); return [p[0], p[1]] as P2; });
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  let far = 0;
  r.forEach((p, i) => { if (Math.hypot(p[0] - r[0][0], p[1] - r[0][1]) > Math.hypot(r[far][0] - r[0][0], r[far][1] - r[0][1])) far = i; });
  if (far > 0) r = [...simplify(r.slice(0, far + 1), 0.35).slice(0, -1), ...simplify([...r.slice(far), r[0]], 0.35).slice(0, -1)];
  if (r.length < 3) return null;
  const wantCcw = !hole;
  if ((area2(r) > 0) !== wantCcw) r.reverse();
  return Math.abs(area2(r)) >= 6 ? r : null;
}

function inside([x, y]: P2, poly: P2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const hash = (n: number) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; return (Math.imul(x, 0xc2b2ae35) >>> 0) / 2 ** 32; };

/**
 * 0 whitewashed (beguinage) · 1 brick townhouse · 2 stone church/public · 3 glass (rare tall block)
 * 4 annex/shed · 5 modern. See page/renderer.ts.
 */
function styleOf(height: number, layer: string, id: number, area: number, church: boolean) {
  if (church || layer === "Knw") return 2;
  if (layer === "Gba" || area < 25) return 4;
  if (height >= 45 && area > 500) return 3;
  if (height >= 36) return 2;
  return hash(id) < 0.18 ? 0 : 1;
}

function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [], upper: P2[] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
    upper.push(p[i]);
  }
  lower.pop(); upper.pop();
  return [...lower, ...upper];
}

type Building = { ring: P2[]; holes: P2[][]; h: number; s: number; c?: number[]; g?: number[] | null; oidn?: string };

const name = process.argv[2] ?? "kortrijk-binnenstad";
openArea(name);
const raw = join(RAW, name);
const out = join(DERIVED, name, "scene");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const buildingsFile = join(raw, "buildings.geojson");
if (!existsSync(buildingsFile)) throw new Error(`missing ${buildingsFile}; run: npm run fetch -- ${name}`);

const osm = readJson(join(raw, "osm.json"));
const churches: P2[][] = [];
const towerNodes: P2[] = [];
for (const el of osm.elements ?? []) {
  const t = el.tags ?? {};
  if (el.type === "node" && (t.historic === "tower" || t.man_made === "tower" || t.amenity === "place_of_worship")) {
    const p = toEnu(el.lon, el.lat); towerNodes.push([p[0], p[1]]);
    continue;
  }
  const church = t.building === "church" || t.building === "cathedral" || t.amenity === "place_of_worship" || t.historic === "church";
  if (!church) continue;
  const coords = el.type === "way" ? el.geometry?.map((q: { lon: number; lat: number }) => [q.lon, q.lat])
    : el.members?.find((m: { role: string; geometry?: unknown }) => m.role === "outer" && m.geometry)?.geometry?.map((q: { lon: number; lat: number }) => [q.lon, q.lat]);
  if (!coords) continue;
  const ring = ringFromLonLat(coords);
  if (ring) churches.push(ring);
}
const isChurch = (c: P2) => churches.some((r) => inside(c, r)) || towerNodes.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 20);

// Per-building wall/roof colour and gable roofs from pipeline/tools/building_colours.py (optional).
const coloursFile = join(raw, "building_colours.json");
const colours: Record<string, { wall: number[]; roof: number[]; gable: number[] | null }> =
  existsSync(coloursFile) ? readJson(coloursFile) : {};
if (!existsSync(coloursFile)) console.log("  no building_colours.json: style palette only (run pipeline/tools/building_colours.py)");
/** [eave above ground, ridge point x, y, ridge direction x, y] in ENU, from the Lambert ridge. */
function gableEnu(g: number[] | null | undefined): number[] | null {
  if (!g) return null;
  const [eave, a, rx, ry] = g;
  const [lon0, lat0] = fromLambert(rx, ry), [lon1, lat1] = fromLambert(rx + Math.cos(a) * 10, ry + Math.sin(a) * 10);
  const p = toEnu(lon0, lat0), q = toEnu(lon1, lat1);
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return [eave, p[0], p[1], (q[0] - p[0]) / L, (q[1] - p[1]) / L].map((v) => Math.round(v * 1000) / 1000);
}

const buildings: Building[] = [];
const lambertRings: P2[][] = [];
const lambertHoles: P2[][][] = [];
const fc = readJson(buildingsFile);
for (const f of fc.features ?? []) {
  const g = f.geometry, p = f.properties ?? {};
  const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
  const h = Math.max(2.5, Number(p.height_m) || 8);
  for (const poly of polys) {
    const ring = ringFromLonLat(poly[0]);
    if (!ring) continue;
    const holes = (poly as number[][][]).slice(1).map((hole: number[][]) => ringFromLonLat(hole, true)).filter((r): r is P2[] => !!r);
    const c: P2 = [ring.reduce((a, q) => a + q[0], 0) / ring.length, ring.reduce((a, q) => a + q[1], 0) / ring.length];
    const id = Number(p.OIDN) || buildings.length;
    const col = colours[String(p.OIDN)];
    buildings.push({
      ring, holes, h, s: styleOf(h, String(p.layer ?? "Gbg"), id, Math.abs(area2(ring)), isChurch(c)),
      c: col ? [...col.wall, ...col.roof] : undefined, g: col && !holes.length ? gableEnu(col.gable) : null,
      oidn: String(p.OIDN),
    });
    lambertRings.push((poly[0] as number[][]).map(([lon, lat]) => toLambert(lon, lat)));
    lambertHoles.push((poly as number[][][]).slice(1).map((hole) => hole.map(([lon, lat]) => toLambert(lon, lat))));
  }
}
console.log(`  GRB buildings: ${buildings.length}`);

// A footprint a motorway or railway runs through is a deck, not a house.
{
  const ground = readJson(join(raw, "ground.json"));
  const lines: P2[] = [];
  for (const el of ground.elements ?? []) {
    const t = el.tags ?? {};
    if (el.type !== "way" || !el.geometry || !(/^(motorway|trunk)(_link)?$/.test(t.highway) || /^(rail|light_rail)$/.test(t.railway))) continue;
    const g: P2[] = el.geometry.map((q: { lon: number; lat: number }) => { const p = toEnu(q.lon, q.lat); return [p[0], p[1]] as P2; });
    for (let i = 1; i < g.length; i++) {
      const n = Math.ceil(Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]) / 5);
      for (let k = 0; k < n; k++) lines.push([g[i - 1][0] + ((g[i][0] - g[i - 1][0]) * k) / n, g[i - 1][1] + ((g[i][1] - g[i - 1][1]) * k) / n]);
    }
  }
  const grid = new Map<string, P2[]>();
  for (const p of lines) { const k = `${Math.floor(p[0] / 50)}_${Math.floor(p[1] / 50)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(p); }
  const before = buildings.length;
  for (let i = buildings.length - 1; i >= 0; i--) {
    const r = buildings[i].ring, xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
    let hits = 0;
    for (let gx = Math.floor(Math.min(...xs) / 50); gx <= Math.floor(Math.max(...xs) / 50); gx++)
      for (let gy = Math.floor(Math.min(...ys) / 50); gy <= Math.floor(Math.max(...ys) / 50); gy++)
        for (const p of grid.get(`${gx}_${gy}`) ?? []) if (inside(p, r)) hits++;
    if (hits >= 4) { buildings.splice(i, 1); lambertRings.splice(i, 1); lambertHoles.splice(i, 1); }
  }
  console.log(`  dropped ${before - buildings.length} decks over motorways and rail`);
}

// LiDAR spires: CHM pixels 8 m above the surveyed roof, in small components.
{
  const dtm = loadRaster(join(raw, "dhm"), "dtm");
  const dsm = loadRaster(join(raw, "dhm"), "dsm");
  const n = dtm.width * dtm.height;
  const bid = new Int32Array(n), bh = new Float32Array(n);
  const toPix = (x: number, y: number): [number, number] => [
    ((x - dtm.x0) / (dtm.x1 - dtm.x0)) * dtm.width,
    ((dtm.y1 - y) / (dtm.y1 - dtm.y0)) * dtm.height,
  ];
  const fill = (ring: P2[], value: number, height: number) => {
    const pix = ring.map(([x, y]) => toPix(x, y));
    let miny = Infinity, maxy = -Infinity;
    for (const p of pix) { miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
    for (let iy = Math.max(0, Math.ceil(miny)); iy <= Math.min(dtm.height - 1, Math.floor(maxy)); iy++) {
      const y = iy + 0.5, xs: number[] = [];
      for (let i = 0, j = pix.length - 1; i < pix.length; j = i++) {
        const [xi, yi] = pix[i], [xj, yj] = pix[j];
        if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k])), b = Math.min(dtm.width - 1, Math.floor(xs[k + 1]));
        for (let ix = a; ix <= b; ix++) { bid[iy * dtm.width + ix] = value; bh[iy * dtm.width + ix] = height; }
      }
    }
  };
  buildings.forEach((b, i) => fill(lambertRings[i], i + 1, b.h));
  lambertHoles.forEach((holes) => holes.forEach((hole) => fill(hole, 0, 0)));
  const chm = (i: number) => {
    const a = dsm.data[i], b = dtm.data[i];
    return Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN;
  };
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = chm(i);
    if (bid[i] && c > bh[i] + 8 && c < 110) mask[i] = 1;
  }
  const seen = new Uint8Array(n);
  const spires: Array<{ h: number; lat: number; lon: number }> = [];
  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const pix: number[] = [];
    while (stack.length) {
      const p = stack.pop()!;
      pix.push(p);
      const x = p % dtm.width, y = (p - x) / dtm.width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as P2[]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= dtm.width || ny >= dtm.height) continue;
        const q = ny * dtm.width + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (pix.length < 4) continue;
    const vals = pix.map(chm).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const max = vals[vals.length - 1] ?? 0;
    const counts = new Map<number, number>();
    for (const p of pix) if (bid[p]) counts.set(bid[p], (counts.get(bid[p]) ?? 0) + 1);
    let owner = 0, best = 0;
    for (const [id, c] of counts) if (c > best) { owner = id; best = c; }
    if (!owner || max < buildings[owner - 1].h + 8) continue;
    // The needle is often one or two DSM cells. Lower the cut until a handful of cells remain,
    // and extrude to the maximum so Sint-Maartenskerk stays near its LiDAR height (~73 m).
    const base = buildings[owner - 1].h;
    let cut = max - 2;
    let tip = pix.filter((p) => chm(p) >= cut);
    while (tip.length < 6 && cut > base + 8) { cut -= 2; tip = pix.filter((p) => chm(p) >= cut); }
    const use = tip.length >= 4 ? tip : pix;
    if (use.length > 400) continue;
    const spireH = max;
    // Skip roof clutter. Keep needles that clearly overtop the surveyed roof (church, belfry, mill).
    if (spireH < base + 10 || spireH < 26) continue;
    const pts = use.filter((_, i) => use.length < 80 || i % Math.ceil(use.length / 80) === 0).map((p) => {
      const ix = p % dtm.width, iy = (p - ix) / dtm.width;
      return [
        dtm.x0 + (ix + 0.5) * (dtm.x1 - dtm.x0) / dtm.width,
        dtm.y1 - (iy + 0.5) * (dtm.y1 - dtm.y0) / dtm.height,
      ] as P2;
    });
    const poly = hull(pts);
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    let ring = poly.length >= 3 ? ringFromLonLat(poly.map(([x, y]) => fromLambert(x, y))) : null;
    if (!ring) {
      const hex: number[][] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        hex.push(fromLambert(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4));
      }
      ring = ringFromLonLat(hex);
    }
    if (!ring) continue;
    buildings.push({ ring, holes: [], h: Math.round(spireH * 10) / 10, s: 2 });
    const [lon, lat] = fromLambert(cx, cy);
    spires.push({ h: spireH, lat, lon });
  }
  spires.sort((a, b) => b.h - a.h);
  console.log(`  lidar spires: ${spires.length}` + (spires.length ? `, tallest ${spires.slice(0, 6).map((s) => `${s.h.toFixed(0)}m@${s.lat.toFixed(5)},${s.lon.toFixed(5)}`).join(" ")}` : ""));
}

// Landmark massing (pipeline/landmarks/<name>/massing.json): replace a GRB footprint and the LiDAR
// needle inside it with hand-built parts (gabled naves, tower, octagonal spire). See pipeline/landmarks/README.md.
{
  const dir = join(import.meta.dirname, "..", "landmarks");
  type Part = {
    id: string; footprint?: "grb"; rect?: [number, number, number, number]; oct?: [number, number, number]; poly?: Array<[number, number]>;
    h: number; style?: number; wall: number[]; roof: number[]; shape?: "flat" | "gable-u" | "gable-v" | "pyramid"; eave?: number;
  };
  type Massing = { anchor: [number, number]; axis_deg: number; replace_oidn: Array<number | string>; parts: Part[] };
  for (const lm of existsSync(dir) ? readdirSync(dir) : []) {
    const f = join(dir, lm, "massing.json");
    if (!existsSync(f)) continue;
    const m: Massing = readJson(f);
    const ids = new Set(m.replace_oidn.map(String));
    const grb = buildings.filter((b) => b.oidn && ids.has(b.oidn));
    if (!grb.length) { console.log(`  landmark ${lm}: GRB ${[...ids]} not in this area, skipped`); continue; }
    // drop the GRB footprints and any LiDAR needle standing inside them
    const doomed = new Set(grb);
    for (const b of buildings) {
      if (b.oidn) continue;
      const c: P2 = [b.ring.reduce((a, q) => a + q[0], 0) / b.ring.length, b.ring.reduce((a, q) => a + q[1], 0) / b.ring.length];
      if (grb.some((g) => inside(c, g.ring))) doomed.add(b);
    }
    for (let i = buildings.length - 1; i >= 0; i--) if (doomed.has(buildings[i])) buildings.splice(i, 1);
    const [ax, ay] = toLambert(m.anchor[1], m.anchor[0]);
    const a = (m.axis_deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const enu = (u: number, v: number): P2 => {
      const [lon, lat] = fromLambert(ax + u * ca - v * sa, ay + u * sa + v * ca);
      const p = toEnu(lon, lat);
      return [p[0], p[1]];
    };
    for (const part of m.parts) {
      let rings: P2[][] = [];
      if (part.footprint === "grb") rings = grb.map((g) => g.ring);
      else if (part.rect) {
        const [u0, u1, v0, v1] = part.rect;
        rings = [[enu(u0, v0), enu(u1, v0), enu(u1, v1), enu(u0, v1)]];
      } else if (part.poly) {
        rings = [part.poly.map(([u, v]) => enu(u, v))];
      } else if (part.oct) {
        const [cu, cv, r] = part.oct;
        rings = [Array.from({ length: 8 }, (_, k) => enu(cu + r * Math.cos((k + 0.5) * Math.PI / 4), cv + r * Math.sin((k + 0.5) * Math.PI / 4)))];
      }
      for (let ring of rings) {
        if (area2(ring) < 0) ring = [...ring].reverse();
        let g: number[] | null = null;
        if (part.shape === "pyramid") g = [part.eave ?? 0];
        else if ((part.shape === "gable-u" || part.shape === "gable-v") && part.rect) {
          const [u0, u1, v0, v1] = part.rect, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
          const p = enu(mu, mv), q = part.shape === "gable-u" ? enu(mu + 10, mv) : enu(mu, mv + 10);
          const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          g = [part.eave ?? part.h * 0.6, p[0], p[1], (q[0] - p[0]) / L, (q[1] - p[1]) / L].map((v) => Math.round(v * 1000) / 1000);
        }
        buildings.push({ ring, holes: [], h: part.h, s: part.style ?? 6, c: [...part.wall, ...part.roof], g });
      }
    }
    console.log(`  landmark ${lm}: replaced ${doomed.size} footprint(s) with ${m.parts.length} parts`);
  }
}

const trees: Array<[number, number, number, number]> = [];
for (const f of readJson(join(raw, "trees.geojson")).features ?? []) {
  const [lon, lat] = f.geometry.coordinates;
  const p = toEnu(lon, lat);
  const r = Math.max(1.2, Number(f.properties.crown_r) || 2.5);
  const h = Math.max(4, Number(f.properties.h) || 7);
  trees.push([p[0], p[1], r, Math.max(r * 0.9, h - r * 0.5)]);
}
console.log(`  tree crowns: ${trees.length}`);

const bins = new Map<string, { b: unknown[]; t: Array<[number, number, number, number]> }>();
const add = (minx: number, miny: number, maxx: number, maxy: number, fn: (bin: { b: unknown[]; t: Array<[number, number, number, number]> }) => void) => {
  for (let ty = Math.floor((miny - 8) / T); ty <= Math.floor((maxy + 8) / T); ty++)
    for (let tx = Math.floor((minx - 8) / T); tx <= Math.floor((maxx + 8) / T); tx++) {
      const k = `${tx}_${ty}`;
      if (!bins.has(k)) bins.set(k, { b: [], t: [] });
      fn(bins.get(k)!);
    }
};
for (const b of buildings) {
  const pts = b.ring.flatMap(([x, y]) => [enuToPixel([x, y, GROUND_GUESS - 15]), enuToPixel([x, y, GROUND_GUESS + 25 + b.h])]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const ring = b.ring.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as P2);
  const holes = b.holes.map((h) => h.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as P2));
  const rec: unknown[] = [ring, Math.round(b.h * 10) / 10, b.s, null];
  if (holes.length || b.c) rec.push(holes);
  if (b.c) rec.push(b.c.map((v) => Math.round(v * 1000) / 1000), b.g ?? null);
  add(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), (bin) => bin.b.push(rec));
}
for (const t of trees) {
  const a = enuToPixel([t[0], t[1], GROUND_GUESS - 15]), c = enuToPixel([t[0], t[1], GROUND_GUESS + 25 + t[3] + t[2]]);
  const r = t[2] / CAMERA.mpp;
  add(Math.min(a[0], c[0]) - r, Math.min(a[1], c[1]) - r, Math.max(a[0], c[0]) + r, Math.max(a[1], c[1]) + r,
    (bin) => bin.t.push(t.map((v) => Math.round(v * 10) / 10) as [number, number, number, number]));
}
for (const [k, v] of bins) writeFileSync(join(out, `${k}.json`), JSON.stringify(v));
console.log(`  ${bins.size} tile bins -> ${out}`);
