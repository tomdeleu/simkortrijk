/**
 * Draw the Collegebrug (cable-stayed foot and cycle bridge, 2012, OSM ways 124540765 + 375212757 +
 * 375212756) into the render tiles before they are painted. The massing renderer draws it as a flat
 * path on the ground, so the painter made a straight thin white line over the Leie. In reality it is an
 * S-curve: from the Diksmuidekaai it crosses the Leie diagonally, bends widely over the Budabeach park
 * and runs on along the bank to the IJzerkaai, hung from sagging cables between two slanted steel
 * masts, one on each bank (Commons refs/, Google satellite and Street View, look-up only; Tom's
 * feedback 2026-11-13). Like leiebruggen/edit_r36brug.ts: originals are kept in
 * data/derived/<area>/render.orig-collegebrug/ and put back with --restore after painting.
 *
 *   (draws onto the current render: run --restore first before drawing it again)
 *   npx tsx landmarks/collegebrug/edit_collegebrug.ts            # draw
 *   npx tsx landmarks/collegebrug/edit_collegebrug.ts --restore  # put the raw render back
 *
 * Deck: the OSM line, ~4.5 m wide, at the DHMV II deck height (smoothed; ~18.5 m TAW over the river,
 * down to ~14 m at the east ramp), in the painted path colour with a grey steel edge girder, so it reads
 * as the same path passing over the water (Tom: bridges must not have another colour than their road).
 * Masts ~12 m above the deck at the north bank (DSM peak 27.8 m) and at the bend over the south bank.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { llhToPixel, useRegion } from "../../src/camera.ts";
import { fromLambert, loadRaster, sampleBilinear, toLambert } from "../../src/flanders.ts";
import { GEOID_M } from "../../src/heights.ts";
import { DERIVED, RAW } from "../../src/paths.ts";

useRegion("kortrijk");
const dir = join(DERIVED, "kortrijk-binnenstad"), orig = join(dir, "render.orig-collegebrug");
const raw = join(RAW, "kortrijk-binnenstad");
const T = 1024;

if (process.argv.includes("--restore")) {
  if (!existsSync(orig)) { console.log("nothing to restore"); process.exit(0); }
  for (const f of readdirSync(orig)) { copyFileSync(join(orig, f), join(dir, "render", f)); console.log(`  restored render/${f}`); }
  process.exit(0);
}

// the deck line, north end (Diksmuidekaai) to east end (IJzerkaai), in Lambert 72
const ground = JSON.parse(readFileSync(join(raw, "ground.json"), "utf8"));
const way = (id: number) => ground.elements.find((e: { id: number }) => e.id === id).geometry.map((q: { lon: number; lat: number }) => toLambert(q.lon, q.lat)) as number[][];
const line = [...way(124540765), ...way(375212757).slice(1), ...way(375212756).slice(1)];
// resample every 1 m
const pts: number[][] = [];
for (let i = 1; i < line.length; i++) {
  const [a, b] = [line[i - 1], line[i]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let s = 0; s < L; s += 1) pts.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L]);
}
pts.push(line[line.length - 1]);
const dsm = loadRaster(join(raw, "dhm"), "dsm"), dtm = loadRaster(join(raw, "dhm"), "dtm");
// deck height: DSM along the line, smoothed over 15 m, never below 2 m above the ground under it
const rawH = pts.map(([x, y]) => sampleBilinear(dsm, x, y));
const H = rawH.map((_, i) => {
  const w = rawH.slice(Math.max(0, i - 7), i + 8).sort((p, q) => p - q);
  return Math.max(w[Math.floor(w.length * 0.6)], sampleBilinear(dtm, pts[i][0], pts[i][1]) + 2);
});
const norm = (i: number) => {
  const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
};
const P = (x: number, y: number, h: number): [number, number] => { const [lon, lat] = fromLambert(x, y); return llhToPixel(lat, lon, h + GEOID_M); };
const at = (i: number, o: number, dh = 0): [number, number] => { const n = norm(i); return P(pts[i][0] + n[0] * o, pts[i][1] + n[1] * o, H[i] + dh); };
const W = 2.3; // half width
const idx = pts.map((_, i) => i);
const nearest = (x: number, y: number) => idx.reduce((m, i) => (Math.hypot(pts[i][0] - x, pts[i][1] - y) < Math.hypot(pts[m][0] - x, pts[m][1] - y) ? i : m), 0);
const m1 = nearest(72338, 169822), m2 = nearest(72430, 169772); // mast feet on the deck line
const MAST = 12;
// main cable: sags between the two mast tops, low point ~2.5 m above the deck in the middle of the span
const cable = (i: number, side: number): [number, number] => {
  const f = (i - m1) / (m2 - m1), top = MAST, low = 2.5, h = low + (top - low) * Math.pow(2 * f - 1, 2);
  return at(i, side * (W + 0.6), h);
};

const deckTop = [...idx.map((i) => at(i, -W)), ...idx.map((i) => at(i, W)).reverse()];
const shadowPoly = [...idx.map((i) => { const n = norm(i); return P(pts[i][0] - n[0] * W, pts[i][1] - n[1] * W, sampleBilinear(dtm, pts[i][0], pts[i][1])); }),
  ...idx.map((i) => { const n = norm(i); return P(pts[i][0] + n[0] * W, pts[i][1] + n[1] * W, sampleBilinear(dtm, pts[i][0], pts[i][1])); }).reverse()];
const all = [...deckTop, ...shadowPoly, at(m1, 0, MAST + 2), at(m2, 0, MAST + 2)];
const tiles = new Set(all.map(([x, y]) => `${Math.floor(x / T)}_${Math.floor(y / T)}`));

mkdirSync(orig, { recursive: true });
for (const k of tiles) {
  const [tx, ty] = k.split("_").map(Number), file = join(dir, "render", `${k}.png`), keep = join(orig, `${k}.png`);
  if (!existsSync(file)) continue;
  if (!existsSync(keep)) copyFileSync(file, keep);
  const q = ([x, y]: [number, number]) => `${(x - tx * T).toFixed(1)},${(y - ty * T).toFixed(1)}`;
  const poly = (p: Array<[number, number]>, fill: string, extra = "") => `<polygon points="${p.map(q).join(" ")}" fill="${fill}" ${extra}/>`;
  const pl = (p: Array<[number, number]>, w: number, c: string) => `<polyline points="${p.map(q).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const seg = (a: [number, number], b: [number, number], w: number, c: string) => pl([a, b], w, c);
  // mast: an A-frame leaning back from the span (two legs from either deck edge to one top)
  const mast = (i: number, back: number) => {
    const j = Math.max(0, Math.min(pts.length - 1, i + back)), top = at(j, 0, MAST + 1.5);
    return seg(at(i, -W - 0.8, -0.5), top, 3.2, "#8e939a") + seg(at(i, W + 0.8, -0.5), top, 3.2, "#9da2a9")
      + seg(at(i, -W - 0.8, -0.5), top, 1.6, "#c9cdd2") + seg(at(i, W + 0.8, -0.5), top, 1.6, "#d3d6da");
  };
  const span = idx.filter((i) => i >= m1 && i <= m2);
  const hangers = span.filter((i) => (i - m1) % 5 === 0).flatMap((i) => [seg(cable(i, -1), at(i, -W, 0.2), 0.9, "#6f747c"), seg(cable(i, 1), at(i, W, 0.2), 0.9, "#7b8088")]);
  // stays from the mast tops to the deck ends beyond the span (back-stays)
  const back = [...idx.filter((i) => i < m1 && (m1 - i) % 6 === 0 && m1 - i <= 24).map((i) => seg(at(m1 - 3, 0, MAST + 1.5), at(i, -W, 0.2), 0.9, "#6f747c")),
    ...idx.filter((i) => i > m2 && (i - m2) % 6 === 0 && i - m2 <= 24).map((i) => seg(at(m2 + 3, 0, MAST + 1.5), at(i, W, 0.2), 0.9, "#6f747c"))];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">`
    + poly(shadowPoly, "#2f3a4a", 'fill-opacity="0.16"')
    + back.join("") + hangers.filter((_, n) => n % 2 === 1).join("") + pl(span.map((i) => cable(i, 1)), 1.3, "#5f646c")
    + pl(idx.map((i) => at(i, -W, -0.9)), 3.2, "#a7abae")                  // steel edge girder, south side
    + poly(deckTop, "#e8ddd0") + pl(idx.map((i) => at(i, -W)), 1.2, "#f7f4ef") + pl(idx.map((i) => at(i, W)), 1.2, "#f7f4ef")
    + pl(idx.map((i) => at(i, -W, 1.0)), 0.9, "#9aa0a8") + pl(idx.map((i) => at(i, W, 1.0)), 0.9, "#9aa0a8") // railings
    + hangers.filter((_, n) => n % 2 === 0).join("") + pl(span.map((i) => cable(i, -1)), 1.3, "#5f646c")
    + mast(m1, -4) + mast(m2, 4)
    + `</svg>`;
  // the render drew the path on the ground under the deck: fill it with what lies just south of it
  const strip = shadowPoly;
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">${poly(strip, "#fff", 'stroke="#fff" stroke-width="5"')}</svg>`)).greyscale().raw().toBuffer();
  // draw onto the current render (other render edits may already be in it); --restore puts the raw one back
  const { data: px, info } = await sharp(await sharp(file).toBuffer()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let x = 0; x < T; x++) {
    let bot = -1;
    for (let y = T - 1; y >= 0; y--) if (mask[y * T + x] > 127) { bot = y; break; }
    if (bot < 0) continue;
    // only columns where the strip is short (the deck crosses the column); long runs are along the deck
    let top = bot; while (top > 0 && mask[(top - 1) * T + x] > 127) top--;
    if (bot - top > 30) continue;
    const src = (Math.min(T - 1, bot + 4) * T + x) * 3;
    for (let y = top; y <= bot; y++) { const d = (y * T + x) * 3; px[d] = px[src]; px[d + 1] = px[src + 1]; px[d + 2] = px[src + 2]; }
  }
  const base = await sharp(px, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  await sharp(base).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 6 }).toFile(file);
  console.log(`  drew the Collegebrug into render/${k}.png`);
}
console.log(`  masts at art px ${at(m1, 0, MAST).map(Math.round)} and ${at(m2, 0, MAST).map(Math.round)}, deck ${pts.length} m`);
