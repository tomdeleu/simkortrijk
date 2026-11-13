/**
 * Draw the smaller Leie bridges into the render before their windows are painted (Tom, 2026-11-13:
 * "recheck all bridges"; each checked on Google Street View from the deck, the rail bridge on Google
 * satellite, look-up only). The render draws roads and paths on the ground, so the painter made thin
 * white lines or a stone arch over the water. One spec per bridge, from its OSM line:
 *
 *   - Budabrug (Budastraat, OSM 1264315394, 2014): flat steel road bridge, dark grey slanted steel side
 *     girders, white mesh railings, light deck. Painted before as an arched stone bridge.
 *   - Kalkovenbrug (OSM 118613392): narrow footbridge over the Leie (timber until 2025, rebuilt in
 *     composite in 2026). Painted before as a thin white line.
 *   - Footbridge at the Nijverheidskaai (OSM 767977976, 62 m): slim steel footbridge, light deck, steel
 *     railings. Painted before as a thin white line.
 *   - De Drie Duikers (rail, OSM 298628668 + 298628667): double-track steel girder bridge, a light grey
 *     girder along each side of the tracks. Painted before as bare tracks over the water.
 *
 * Colours are the painted ones (road #a59ba9, path #e8ddd0, pavement #ece4dc), so a deck reads as the
 * same road or path passing over. Draws onto the current render (other edits such as the Noordbrug
 * pylon stay); originals in data/derived/<area>/render.orig-bridges/, put back with --restore.
 *
 *   npx tsx landmarks/leiebruggen/edit_bridges.ts            # draw (run --restore first to redraw)
 *   npx tsx landmarks/leiebruggen/edit_bridges.ts --restore
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { llhToPixel, useRegion } from "../../src/camera.ts";
import { fromLambert, loadRaster, sampleBilinear, toLambert } from "../../src/flanders.ts";
import { GEOID_M } from "../../src/heights.ts";
import { DERIVED, RAW } from "../../src/paths.ts";

useRegion("kortrijk");
const dir = join(DERIVED, "kortrijk-binnenstad"), orig = join(dir, "render.orig-bridges");
const raw = join(RAW, "kortrijk-binnenstad");
const T = 1024;

if (process.argv.includes("--restore")) {
  if (!existsSync(orig)) { console.log("nothing to restore"); process.exit(0); }
  for (const f of readdirSync(orig)) { copyFileSync(join(orig, f), join(dir, "render", f)); console.log(`  restored render/${f}`); }
  process.exit(0);
}

type Spec = { name: string; ways: number[]; kind: "road" | "foot" | "rail"; half: number; clear: number; fillMax: number };
const SPECS: Spec[] = [
  { name: "Budabrug", ways: [1264315394], kind: "road", half: 6.5, clear: 3.5, fillMax: 70 },
  { name: "Kalkovenbrug", ways: [118613392], kind: "foot", half: 1.6, clear: 2.5, fillMax: 26 },
  { name: "Nijverheidskaai footbridge", ways: [767977976], kind: "foot", half: 1.6, clear: 3, fillMax: 26 },
  { name: "De Drie Duikers", ways: [298628668, 298628667], kind: "rail", half: 5.2, clear: 4, fillMax: 0 },
];

const ground = JSON.parse(readFileSync(join(raw, "ground.json"), "utf8"));
const geo = (id: number) => ground.elements.find((e: { id: number }) => e.id === id).geometry.map((q: { lon: number; lat: number }) => toLambert(q.lon, q.lat)) as number[][];
const dsm = loadRaster(join(raw, "dhm"), "dsm"), dtm = loadRaster(join(raw, "dhm"), "dtm");
const P = (x: number, y: number, h: number): [number, number] => { const [lon, lat] = fromLambert(x, y); return llhToPixel(lat, lon, h + GEOID_M); };

type Drawn = { svg: (q: (p: [number, number]) => string) => string; fill: Array<[number, number]> | null; fillMax: number; pts: Array<[number, number]> };
const drawn: Drawn[] = [];
for (const s of SPECS) {
  // axis: the mean of the ways (two tracks for the rail bridge), resampled every metre
  const lines = s.ways.map(geo);
  const a0 = lines.map((l) => l[0]), a1 = lines.map((l) => l[l.length - 1]);
  const flip = lines.map((l) => Math.hypot(l[0][0] - a0[0][0], l[0][1] - a0[0][1]) > Math.hypot(l[l.length - 1][0] - a0[0][0], l[l.length - 1][1] - a0[0][1]));
  const A = [0, 1].map((k) => lines.reduce((t, l, i) => t + (flip[i] ? l[l.length - 1] : l[0])[k], 0) / lines.length);
  const B = [0, 1].map((k) => lines.reduce((t, l, i) => t + (flip[i] ? l[0] : l[l.length - 1])[k], 0) / lines.length);
  void a1;
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ax = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  let n = [-ax[1], ax[0]]; if (n[1] > 0) n = [-n[0], -n[1]]; // n points to the south side the camera sees
  const ts = Array.from({ length: Math.ceil(L) + 1 }, (_, k) => Math.min(L, k));
  const gnd = ts.map((t) => sampleBilinear(dtm, A[0] + ax[0] * t, A[1] + ax[1] * t));
  const top = ts.map((t) => sampleBilinear(dsm, A[0] + ax[0] * t, A[1] + ax[1] * t));
  const deckH = ts.map((_, i) => {
    const w = top.slice(Math.max(0, i - 5), i + 6).sort((p, q) => p - q);
    return Math.max(w[Math.floor(w.length / 2)] - (s.kind === "rail" ? 2.5 : 0.3), Math.min(...gnd) + s.clear);
  });
  const at = (i: number, o: number, dh = 0) => P(A[0] + ax[0] * ts[i] + n[0] * o, A[1] + ax[1] * ts[i] + n[1] * o, deckH[i] + dh);
  const atG = (i: number, o: number) => P(A[0] + ax[0] * ts[i] + n[0] * o, A[1] + ax[1] * ts[i] + n[1] * o, gnd[i]);
  const idx = ts.map((_, i) => i);
  const edge = (o: number, dh = 0) => idx.map((i) => at(i, o, dh));
  const shadow = [...idx.map((i) => atG(i, s.half)), ...idx.map((i) => atG(i, -s.half)).reverse()];
  const inner = idx.filter((i) => ts[i] > 3 && ts[i] < L - 3);
  const fill = s.fillMax ? [...inner.map((i) => atG(i, s.half + 1.5)), ...inner.map((i) => atG(i, -s.half - 1.5)).reverse()] : null;
  const poly = (q: (p: [number, number]) => string, p: Array<[number, number]>, f: string, x = "") => `<polygon points="${p.map(q).join(" ")}" fill="${f}" ${x}/>`;
  const pl = (q: (p: [number, number]) => string, p: Array<[number, number]>, w: number, c: string, x = "") => `<polyline points="${p.map(q).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" ${x}/>`;
  const svg = (q: (p: [number, number]) => string) => {
    let out = poly(q, shadow, "#2f3a4a", 'fill-opacity="0.16"');
    if (s.kind === "road") {
      out += poly(q, [...edge(s.half, 0), ...edge(s.half, -1.8).reverse()], "#5d6168")          // south steel girder face
        + poly(q, [...edge(s.half), ...edge(-s.half).reverse()], "#a59ba9")                     // deck in painted road colour
        + pl(q, edge(s.half - 1.4), 2.2, "#ece4dc") + pl(q, edge(-s.half + 1.4), 2.2, "#ece4dc") // pavements
        + pl(q, edge(0), 0.9, "#f6f2ec", 'stroke-dasharray="5 5"')
        + pl(q, edge(s.half, 1.1), 1.6, "#f4f4f1") + pl(q, edge(-s.half, 1.1), 1.4, "#f4f4f1")   // white mesh railings
        + pl(q, edge(s.half, 0.1), 1.2, "#7e848c");
    } else if (s.kind === "foot") {
      out += poly(q, [...edge(s.half, 0), ...edge(s.half, -0.7).reverse()], "#9aa0a8")
        + poly(q, [...edge(s.half), ...edge(-s.half).reverse()], "#e8ddd0")                     // deck in painted path colour
        + pl(q, edge(s.half, 1.0), 1.2, "#8e939a") + pl(q, edge(-s.half, 1.0), 1.1, "#8e939a");
    } else {
      for (const o of [s.half, -s.half]) // light grey steel girders along both sides of the tracks
        out += poly(q, [...edge(o, 2.6), ...edge(o, -0.6).reverse()], o > 0 ? "#b9bdc3" : "#a4a9b0") + pl(q, edge(o, 2.6), 1.2, "#e2e5e8");
    }
    return out;
  };
  drawn.push({ svg, fill, fillMax: s.fillMax, pts: [...shadow, ...edge(s.half, 3), ...edge(-s.half, 3)] });
  console.log(`  ${s.name}: ${L.toFixed(0)} m, deck ${Math.min(...deckH).toFixed(1)}-${Math.max(...deckH).toFixed(1)} m TAW over ground ${Math.min(...gnd).toFixed(1)} m`);
}

const tiles = new Set(drawn.flatMap((d) => d.pts.map(([x, y]) => `${Math.floor(x / T)}_${Math.floor(y / T)}`)));
mkdirSync(orig, { recursive: true });
for (const k of tiles) {
  const [tx, ty] = k.split("_").map(Number), file = join(dir, "render", `${k}.png`), keep = join(orig, `${k}.png`);
  if (!existsSync(file)) continue;
  if (!existsSync(keep)) copyFileSync(file, keep);
  const q = ([x, y]: [number, number]) => `${(x - tx * T).toFixed(1)},${(y - ty * T).toFixed(1)}`;
  const { data: px, info } = await sharp(await sharp(file).toBuffer()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // the render drew the road or path on the ground under the deck: fill those short column runs with
  // what lies just south of them (water, grass)
  for (const d of drawn) {
    if (!d.fill) continue;
    const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}"><polygon points="${d.fill.map(q).join(" ")}" fill="#fff"/></svg>`)).greyscale().raw().toBuffer();
    for (let x = 0; x < T; x++) {
      let bot = -1;
      for (let y = T - 1; y >= 0; y--) if (mask[y * T + x] > 127) { bot = y; break; }
      if (bot < 0) continue;
      let top = bot; while (top > 0 && mask[(top - 1) * T + x] > 127) top--;
      if (bot - top > d.fillMax) continue;
      const src = (Math.min(T - 1, bot + 4) * T + x) * 3;
      for (let y = top; y <= bot; y++) { const o = (y * T + x) * 3; px[o] = px[src]; px[o + 1] = px[src + 1]; px[o + 2] = px[src + 2]; }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">${drawn.map((d) => d.svg(q)).join("")}</svg>`;
  const base = await sharp(px, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  await sharp(base).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 6 }).toFile(file);
  console.log(`  drew bridges into render/${k}.png`);
}
