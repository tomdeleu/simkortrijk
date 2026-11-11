/**
 * Belgian Lambert 72 (EPSG:31370) and DHMV II rasters.
 * Heights in the rasters are orthometric, TAW (Tweede Algemene Waterpassing). Nodata is -9999.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";

const LAMBERT =
  "+proj=lcc +lat_0=90 +lon_0=4.36748666666667 +lat_1=51.1666672333333 +lat_2=49.8333339 " +
  "+x_0=150000.013 +y_0=5400088.438 +ellps=intl " +
  "+towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs";
proj4.defs("EPSG:31370", LAMBERT);

export const UA = { "User-Agent": "simkortrijk/0.1 (open-data isometric map of Kortrijk)" };

export function toLambert(lon: number, lat: number): [number, number] {
  const [x, y] = proj4("EPSG:4326", "EPSG:31370", [lon, lat]);
  return [x, y];
}
export function fromLambert(x: number, y: number): [number, number] {
  const [lon, lat] = proj4("EPSG:31370", "EPSG:4326", [x, y]);
  return [lon, lat];
}

/** Float32 grid, row 0 = north, covering Lambert 72 [x0,x1) × [y0,y1). */
export interface Raster {
  x0: number; y0: number; x1: number; y1: number;
  width: number; height: number;
  data: Float32Array;
}

export function sampleNearest(r: Raster, x: number, y: number): number {
  const fx = ((x - r.x0) / (r.x1 - r.x0)) * r.width - 0.5;
  const fy = ((r.y1 - y) / (r.y1 - r.y0)) * r.height - 0.5;
  const ix = Math.round(fx), iy = Math.round(fy);
  if (ix < 0 || iy < 0 || ix >= r.width || iy >= r.height) return NaN;
  return r.data[iy * r.width + ix];
}

export function sampleBilinear(r: Raster, x: number, y: number): number {
  const fx = ((x - r.x0) / (r.x1 - r.x0)) * r.width - 0.5;
  const fy = ((r.y1 - y) / (r.y1 - r.y0)) * r.height - 0.5;
  if (fx < 0 || fy < 0 || fx >= r.width - 1 || fy >= r.height - 1) return NaN;
  const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
  const v = (i: number, j: number) => r.data[j * r.width + i];
  const a = v(ix, iy), b = v(ix + 1, iy), c = v(ix, iy + 1), d = v(ix + 1, iy + 1);
  if (![a, b, c, d].every((n) => Number.isFinite(n) && n > -1000)) return NaN;
  return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
}

/** 1 m scanline fill of a Lambert ring. The ring need not repeat its first point. */
export function fillPolygon(ring: Array<[number, number]>, step: number, cb: (x: number, y: number) => void) {
  if (ring.length < 3) return;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of ring) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  for (let y = Math.floor(y0 / step) * step + step / 2; y < y1; y += step) {
    const xs: number[] = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.floor(xs[k] / step) * step + step / 2; x < xs[k + 1]; x += step) cb(x, y);
  }
}

export function saveRaster(dir: string, which: "dtm" | "dsm", r: Raster) {
  mkdirSync(dir, { recursive: true });
  const copy = Float32Array.from(r.data);
  writeFileSync(join(dir, `${which}.f32`), Buffer.from(copy.buffer));
  writeFileSync(join(dir, "raster.json"), JSON.stringify({
    x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, width: r.width, height: r.height, row0: "north", epsg: 31370,
  }));
}

export function loadRaster(dir: string, which: "dtm" | "dsm"): Raster {
  const meta = JSON.parse(readFileSync(join(dir, "raster.json"), "utf8"));
  const b = readFileSync(join(dir, `${which}.f32`));
  const data = new Float32Array(b.byteLength / 4);
  Buffer.from(data.buffer).set(b);
  return { x0: meta.x0, y0: meta.y0, x1: meta.x1, y1: meta.y1, width: meta.width, height: meta.height, data };
}

function extractTiff(body: Buffer): ArrayBuffer {
  const le = body.indexOf(Buffer.from([0x49, 0x49, 0x2a, 0x00]));
  const be = body.indexOf(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
  const start = le >= 0 && (be < 0 || le < be) ? le : be;
  if (start < 0) throw new Error(`WCS response has no TIFF (${body.subarray(0, 180).toString("utf8")})`);
  const endMark = body.indexOf(Buffer.from("\n--wcs"), start);
  const slice = body.subarray(start, endMark > start ? endMark : body.length);
  const copy = new ArrayBuffer(slice.byteLength);
  new Uint8Array(copy).set(slice);
  return copy;
}

async function readTiff(buf: ArrayBuffer): Promise<Raster> {
  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const width = image.getWidth(), height = image.getHeight();
  const raw = (await image.readRasters())[0] as ArrayLike<number>;
  let data = Float32Array.from(raw);
  for (let i = 0; i < data.length; i++) if (data[i] < -1000) data[i] = NaN;
  const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
  const origin = image.getOrigin();
  const row0North = origin[1] >= (bbox[1] + bbox[3]) / 2;
  if (!row0North) {
    const flipped = new Float32Array(data.length);
    for (let y = 0; y < height; y++) flipped.set(data.subarray((height - 1 - y) * width, (height - y) * width), y * width);
    data = flipped;
  }
  return { x0: bbox[0], y0: bbox[1], x1: bbox[2], y1: bbox[3], width, height, data };
}

async function wcsTile(coverageId: string, x0: number, y0: number, x1: number, y1: number): Promise<Raster> {
  const q = new URLSearchParams({
    service: "WCS", version: "2.0.1", request: "GetCoverage", CoverageId: coverageId, format: "image/tiff",
  });
  q.append("subset", `x(${x0},${x1})`);
  q.append("subset", `y(${y0},${y1})`);
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(`https://geo.api.vlaanderen.be/DHMV/wcs?${q}`, { headers: UA, signal: AbortSignal.timeout(180_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      return await readTiff(extractTiff(Buffer.from(await r.arrayBuffer())));
    } catch (err) {
      last = (err as Error).message;
      if (attempt === 4) break;
      await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
  throw new Error(`WCS ${coverageId} ${x0},${y0},${x1},${y1}: ${last}`);
}

function blit(dst: Float32Array, grid: Raster, tile: Raster) {
  const dx = (grid.x1 - grid.x0) / grid.width, dy = (grid.y1 - grid.y0) / grid.height;
  const tdx = (tile.x1 - tile.x0) / tile.width, tdy = (tile.y1 - tile.y0) / tile.height;
  for (let iy = 0; iy < tile.height; iy++) for (let ix = 0; ix < tile.width; ix++) {
    const v = tile.data[iy * tile.width + ix];
    if (!Number.isFinite(v)) continue;
    const x = tile.x0 + (ix + 0.5) * tdx, y = tile.y1 - (iy + 0.5) * tdy;
    const mx = Math.round((x - grid.x0) / dx - 0.5), my = Math.round((grid.y1 - y) / dy - 0.5);
    if (mx >= 0 && my >= 0 && mx < grid.width && my < grid.height) dst[my * grid.width + mx] = v;
  }
}

/** DHMV II coverage stitched onto a 1 m Lambert grid. Blocks stay under the WCS size limit. */
export async function fetchDhmv(coverageId: string, x0: number, y0: number, x1: number, y1: number): Promise<Raster> {
  const width = x1 - x0, height = y1 - y0;
  const data = new Float32Array(width * height);
  data.fill(NaN);
  const grid: Raster = { x0, y0, x1, y1, width, height, data };
  const BLOCK = 700;
  for (let y = y0; y < y1; y += BLOCK) for (let x = x0; x < x1; x += BLOCK) {
    const tile = await wcsTile(coverageId, x, y, Math.min(x1, x + BLOCK), Math.min(y1, y + BLOCK));
    blit(data, grid, tile);
    console.log(`  ${coverageId} ${x}..${Math.min(x1, x + BLOCK)} ${y}..${Math.min(y1, y + BLOCK)}`);
  }
  return grid;
}

/** Lambert bounds of a WGS84 bbox, expanded by `margin` metres and rounded outward to whole metres. */
export function lambertBounds(bbox: [number, number, number, number], margin = 30): [number, number, number, number] {
  const [s, w, n, e] = bbox;
  const pts = [[w, s], [e, s], [w, n], [e, n]].map(([lon, lat]) => toLambert(lon, lat));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [
    Math.floor(Math.min(...xs) - margin),
    Math.floor(Math.min(...ys) - margin),
    Math.ceil(Math.max(...xs) + margin),
    Math.ceil(Math.max(...ys) + margin),
  ];
}
