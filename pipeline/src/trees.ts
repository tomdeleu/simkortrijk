/**
 * Tree crowns for one area.
 * Tall crowns: OMZ summer 2024 CIR orthophoto (OMZNIR24VL, NDVI) and DHMV II nDSM > 3 m,
 * outside GRB buildings and water. Local maxima, then a crown radius from the tall cells
 * nearer to that peak than to any other (~the POC watershed, without a Python stack).
 * OSM natural=tree fills young street trees the 2013–15 LiDAR and the NDVI miss.
 * Google imagery is not used.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { fromLambert, lambertBounds, loadRaster, sampleNearest, toLambert, UA } from "./flanders.ts";
import { readJson } from "./paths.ts";

const RES = 0.5;

async function getMap(x0: number, y0: number, x1: number, y1: number, width: number, height: number) {
  const q = new URLSearchParams({
    service: "WMS", version: "1.3.0", request: "GetMap", layers: "OMZNIR24VL", styles: "",
    crs: "EPSG:31370", bbox: `${x0},${y0},${x1},${y1}`, width: String(width), height: String(height),
    format: "image/png", transparent: "false",
  });
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(`https://geo.api.vlaanderen.be/OMZ/wms?${q}`, { headers: UA, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) throw new Error(String(r.status));
      return Buffer.from(await r.arrayBuffer());
    } catch (err) {
      last = (err as Error).message;
      if (attempt === 4) break;
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
  throw new Error(`OMZ ${x0},${y0},${x1},${y1}: ${last}`);
}

function polygons(g: { type: string; coordinates: any }): number[][][][] {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

/** Fill outer rings and clear holes on a north-up pixel mask. */
function rasterize(file: string, x0: number, y0: number, x1: number, y1: number, W: number, H: number, mask: Uint8Array) {
  const fc = readJson(file);
  const toPix = (lon: number, lat: number): [number, number] => {
    const [x, y] = toLambert(lon, lat);
    return [((x - x0) / (x1 - x0)) * W, ((y1 - y) / (y1 - y0)) * H];
  };
  const fill = (ring: number[][], value: number) => {
    if (ring.length < 4) return;
    const pix = ring.map(([lon, lat]) => toPix(lon, lat));
    let miny = Infinity, maxy = -Infinity;
    for (const p of pix) { miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
    const iy0 = Math.max(0, Math.ceil(miny)), iy1 = Math.min(H - 1, Math.floor(maxy));
    for (let iy = iy0; iy <= iy1; iy++) {
      const y = iy + 0.5, xs: number[] = [];
      for (let i = 0, j = pix.length - 1; i < pix.length; j = i++) {
        const [xi, yi] = pix[i], [xj, yj] = pix[j];
        if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.ceil(xs[k])), b = Math.min(W - 1, Math.floor(xs[k + 1]));
        for (let ix = a; ix <= b; ix++) mask[iy * W + ix] = value;
      }
    }
  };
  for (const f of fc.features ?? []) for (const poly of polygons(f.geometry)) {
    fill(poly[0], 1);
    for (const hole of poly.slice(1)) fill(hole, 0);
  }
}

export async function detectTrees(dir: string, bbox: [number, number, number, number]) {
  const [x0, y0, x1, y1] = lambertBounds(bbox, 8);
  const W = Math.round((x1 - x0) / RES), H = Math.round((y1 - y0) / RES);
  console.log(`  orthophoto ${W}×${H} @ ${RES} m`);
  const nir = new Float32Array(W * H), red = new Float32Array(W * H);
  const BLOCK = 700; // metres → 1400 px, under typical WMS limits
  for (let y = y0; y < y1; y += BLOCK) for (let x = x0; x < x1; x += BLOCK) {
    const xa = x, xb = Math.min(x1, x + BLOCK), ya = y, yb = Math.min(y1, y + BLOCK);
    const tw = Math.max(1, Math.round((xb - xa) / RES)), th = Math.max(1, Math.round((yb - ya) / RES));
    const png = await getMap(xa, ya, xb, yb, tw, th);
    const raw = await sharp(png).resize(tw, th, { fit: "fill" }).removeAlpha().raw().toBuffer();
    const ix0 = Math.round((xa - x0) / RES), iy0 = Math.round((y1 - yb) / RES);
    for (let row = 0; row < th; row++) for (let col = 0; col < tw; col++) {
      const dx = ix0 + col, dy = iy0 + row;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const s = (row * tw + col) * 3, i = dy * W + dx;
      nir[i] = raw[s]; red[i] = raw[s + 1]; // CIR: R = near infrared, G = red
    }
  }
  const dtm = loadRaster(join(dir, "dhm"), "dtm");
  const dsm = loadRaster(join(dir, "dhm"), "dsm");
  const chm = new Float32Array(W * H);
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    const lx = x0 + (ix + 0.5) * RES, ly = y1 - (iy + 0.5) * RES;
    const a = sampleNearest(dsm, lx, ly), b = sampleNearest(dtm, lx, ly);
    chm[iy * W + ix] = Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, a - b) : 0;
  }
  const blocked = new Uint8Array(W * H);
  rasterize(join(dir, "buildings.geojson"), x0, y0, x1, y1, W, H, blocked);
  rasterize(join(dir, "grb_water.geojson"), x0, y0, x1, y1, W, H, blocked);
  const tall = new Uint8Array(W * H);
  for (let i = 0; i < tall.length; i++) {
    const ndvi = (nir[i] - red[i]) / (nir[i] + red[i] + 1e-6);
    if (ndvi > 0.12 && chm[i] > 3 && !blocked[i]) tall[i] = 1;
  }
  type Peak = { ix: number; iy: number; h: number };
  const cand: Peak[] = [];
  const rad = 4;
  for (let iy = rad; iy < H - rad; iy++) for (let ix = rad; ix < W - rad; ix++) {
    if (!tall[iy * W + ix]) continue;
    const v = chm[iy * W + ix];
    let max = true;
    for (let dy = -rad; dy <= rad && max; dy++) for (let dx = -rad; dx <= rad; dx++)
      if (chm[(iy + dy) * W + ix + dx] > v) max = false;
    if (max) cand.push({ ix, iy, h: v });
  }
  cand.sort((a, b) => b.h - a.h);
  const kept: Peak[] = [];
  const cell = 8, buckets = new Map<string, Peak[]>();
  for (const p of cand) {
    let close = false;
    const gx = Math.floor(p.ix / cell), gy = Math.floor(p.iy / cell);
    for (let yy = gy - 1; yy <= gy + 1 && !close; yy++) for (let xx = gx - 1; xx <= gx + 1 && !close; xx++)
      for (const q of buckets.get(`${xx}_${yy}`) ?? [])
        if ((q.ix - p.ix) ** 2 + (q.iy - p.iy) ** 2 < 36) close = true;
    if (close) continue;
    kept.push(p);
    const k = `${gx}_${gy}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(p);
  }
  const counts = new Int32Array(kept.length);
  const peakBuckets = new Map<string, number[]>();
  kept.forEach((p, i) => {
    const k = `${Math.floor(p.ix / cell)}_${Math.floor(p.iy / cell)}`;
    (peakBuckets.get(k) ?? peakBuckets.set(k, []).get(k)!).push(i);
  });
  const maxR2 = 16 * 16;
  for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
    if (!tall[iy * W + ix]) continue;
    const gx = Math.floor(ix / cell), gy = Math.floor(iy / cell);
    let best = -1, bd = maxR2;
    for (let yy = gy - 2; yy <= gy + 2; yy++) for (let xx = gx - 2; xx <= gx + 2; xx++)
      for (const i of peakBuckets.get(`${xx}_${yy}`) ?? []) {
        const p = kept[i], d = (p.ix - ix) ** 2 + (p.iy - iy) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    if (best >= 0) counts[best]++;
  }
  type Tree = { lon: number; lat: number; x: number; y: number; h: number; r: number; source: string };
  const trees: Tree[] = [];
  for (let i = 0; i < kept.length; i++) {
    const area = counts[i] * RES * RES;
    if (area < 3) continue;
    const p = kept[i];
    const r = Math.min(12, Math.max(1.4, Math.sqrt(area / Math.PI)));
    const lx = x0 + (p.ix + 0.5) * RES, ly = y1 - (p.iy + 0.5) * RES;
    const [lon, lat] = fromLambert(lx, ly);
    trees.push({ lon, lat, x: lx, y: ly, h: Math.round(p.h * 10) / 10, r: Math.round(r * 100) / 100, source: "OMZNIR24 NDVI + DHMVII CHM>3m" });
  }
  const detBuckets = new Map<string, Tree[]>();
  const put = (t: Tree) => {
    const k = `${Math.floor(t.x / 8)}_${Math.floor(t.y / 8)}`;
    (detBuckets.get(k) ?? detBuckets.set(k, []).get(k)!).push(t);
  };
  for (const t of trees) put(t);
  const nearest = (x: number, y: number) => {
    let best = Infinity;
    const gx = Math.floor(x / 8), gy = Math.floor(y / 8);
    for (let yy = gy - 1; yy <= gy + 1; yy++) for (let xx = gx - 1; xx <= gx + 1; xx++)
      for (const t of detBuckets.get(`${xx}_${yy}`) ?? []) best = Math.min(best, Math.hypot(t.x - x, t.y - y));
    return best;
  };
  let osmAdded = 0;
  for (const el of readJson(join(dir, "osm.json")).elements ?? []) {
    const tags = el.tags ?? {};
    if (el.type !== "node" || tags.natural !== "tree" || el.lon == null) continue;
    const [x, y] = toLambert(el.lon, el.lat);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (nearest(x, y) <= 4) continue;
    const h = parseFloat(tags.height) || 7;
    trees.push({ lon: el.lon, lat: el.lat, x, y, h, r: 2.5, source: "OSM natural=tree" });
    put(trees[trees.length - 1]);
    osmAdded++;
  }
  writeFileSync(join(dir, "trees.geojson"), JSON.stringify({
    type: "FeatureCollection",
    features: trees.map((t) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Math.round(t.lon * 1e7) / 1e7, Math.round(t.lat * 1e7) / 1e7] },
      properties: { h: t.h, crown_r: t.r, source: t.source },
    })),
  }));
  console.log(`  trees: ${trees.length - osmAdded} detected + ${osmAdded} OSM-only`);
}
