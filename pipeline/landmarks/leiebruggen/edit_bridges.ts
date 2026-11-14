/**
 * Draw the smaller Leie bridges into the render before their windows are painted (Tom, 2026-11-13:
 * "recheck all bridges"; each checked on Google Street View from the deck, the rail bridge on Google
 * satellite, look-up only). The render draws roads and paths on the ground, so the painter made thin
 * white lines or a stone arch over the water. One spec per bridge, from its OSM line:
 *
 *   - Budabrug (Budastraat, OSM 1264315394, 2014): flat steel lift bridge, dark grey steel side
 *     girders, white mesh railings. Painted before as an arched stone bridge. The DHMV LiDAR (and Street
 *     View, May 2025) caught it lifted for a boat (DSM 17 m over 14.8 m quays), so it is drawn lowered,
 *     flush with the quay roads (`level`; Tom, 2026-11-14: it stood up like a block over the Leie).
 *   - IJzerkaaibrug (OSM 61597591): short, low concrete slab road bridge over the old Leie arm, flush with
 *     the quays, concrete edge beam, galvanised railings, brick abutments (Street View, May 2025). The
 *     export laid a loose asphalt deck over the paint here (Tom, 2026-11-14), so it is drawn here and
 *     listed in PAINTED_BRIDGES in export.ts.
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

// level: the deck lies flush with the road on both quays (height of the DTM 4 m beyond each end), not on
// the DSM; face: colour of the visible side girder or edge beam, depth in m
type Spec = { name: string; ways: number[]; kind: "road" | "foot" | "rail"; half: number; clear: number; fillMax: number; level?: boolean; face?: [string, number]; dash?: boolean };
const SPECS: Spec[] = [
  { name: "Budabrug", ways: [1264315394], kind: "road", half: 6.5, clear: 3.5, fillMax: 70, level: true, face: ["#5d6168", 1.8], dash: true },
  { name: "IJzerkaaibrug", ways: [61597591], kind: "road", half: 5.0, clear: 2.5, fillMax: 70, level: true, face: ["#c4bfb7", 1.0], dash: false },
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
  const endH = [sampleBilinear(dtm, A[0] - ax[0] * 4, A[1] - ax[1] * 4), sampleBilinear(dtm, B[0] + ax[0] * 4, B[1] + ax[1] * 4)];
  const deckH = ts.map((_, i) => {
    if (s.level) return endH[0] + ((endH[1] - endH[0]) * ts[i]) / L;
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
      const [fc, fd] = s.face ?? ["#5d6168", 1.8];
      out += poly(q, [...edge(s.half, 0), ...edge(s.half, -fd).reverse()], fc)                   // south girder or edge beam face
        + poly(q, [...edge(s.half), ...edge(-s.half).reverse()], "#a59ba9")                     // deck in painted road colour
        + pl(q, edge(s.half - 1.4), 2.2, "#ece4dc") + pl(q, edge(-s.half + 1.4), 2.2, "#ece4dc") // pavements
        + (s.dash === false ? "" : pl(q, edge(0), 0.9, "#f6f2ec", 'stroke-dasharray="5 5"'))
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


// Long road viaducts with several carriageways (Tom, 2026-11-14: the R36 west bridge "floats"). The
// render draws them on the ground and the export laid a deck over the paint, so the deck seemed to lie on
// top of the road at both ends. Here the deck follows the DSM over its whole length (it meets the road at
// the ends, where the road is on the embankment), takes the road's render colour, is only drawn where it
// is clearly above the ground, and the ground road under it is opened up.
type Viaduct = { name: string; axis: number; ways: number[]; cycle: number[]; piers: number[]; fillMax: number };
const VIADUCTS: Viaduct[] = [
  // Burgemeester Lambrechtlaan (R36 west) over the Leie: two one-way carriageways and two cycle tracks,
  // 199 m, deck 15.5 m TAW on the embankments to 19.5 m over the river (ground 10-12.5 m). Street View:
  // a long, low concrete beam viaduct with light railings, open below over the quays and the park.
  { name: "R36 west (Lambrechtlaan)", axis: 28270495, ways: [114830948, 28270495, 112955382, 114831019], cycle: [114830948, 114831019], piers: [40, 75, 120, 160], fillMax: 320 },
];
const rawTile = async (x: number, y: number) => {
  const k = `${Math.floor(x / T)}_${Math.floor(y / T)}`, keep = join(orig, `${k}.png`), file = join(dir, "render", `${k}.png`);
  const src = existsSync(keep) ? keep : file;
  const { data } = await sharp(src).removeAlpha().extract({ left: Math.round(x - Math.floor(x / T) * T) - 2, top: Math.round(y - Math.floor(y / T) * T) - 2, width: 5, height: 5 }).raw().toBuffer({ resolveWithObject: true });
  return `rgb(${[0, 1, 2].map((c) => Math.round([...Array(25).keys()].reduce((a, i) => a + data[i * 3 + c], 0) / 25)).join(",")})`;
};
for (const v of VIADUCTS) {
  const ax0 = geo(v.axis), A = ax0[0], B = ax0[ax0.length - 1];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ax = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  let n = [-ax[1], ax[0]]; const flipped = n[1] > 0; if (flipped) n = [-n[0], -n[1]]; // n: the side the camera sees
  const off = (p: number[]) => (p[0] - A[0]) * n[0] + (p[1] - A[1]) * n[1];
  const offs = v.ways.flatMap((id) => geo(id).map(off));
  const lo = Math.min(...offs) - 2.4, hi = Math.max(...offs) + 2.4, mid = (lo + hi) / 2; // lo..hi across the deck
  // n points south, so `hi` is the edge the camera sees (heading 20°): the side face, abutment walls and
  // ribs go there. Before 2026-11-14 they were drawn on `lo`, the north edge, hidden under the deck, which
  // is why the viaduct read as a floating slab.
  const vis = hi;
  const ts = Array.from({ length: Math.ceil(L / 2) + 1 }, (_, k) => Math.min(L, k * 2));
  const at0 = (t: number, o: number) => [A[0] + ax[0] * t + n[0] * o, A[1] + ax[1] * t + n[1] * o];
  const gnd = ts.map((t) => sampleBilinear(dtm, ...(at0(t, mid) as [number, number])));
  const top = ts.map((t) => { const hs = [lo + 3, mid, hi - 3].map((o) => sampleBilinear(dsm, ...(at0(t, o) as [number, number]))).sort((p, q) => p - q); return hs[1]; });
  // the deck meets the road at the road's own height at both ends (Tom, 2026-11-14: a deck that starts
  // 1.2 m up with a light front edge "floats"): it is drawn over the whole length, at the ground where
  // the DSM is near the ground, and only its elevated part gets a front face, railings, shadow and piers
  const deckH = top.map((_, i) => { const w = top.slice(Math.max(0, i - 4), i + 5).sort((p, q) => p - q); return Math.max(gnd[i], w[Math.floor(w.length / 2)] - 0.3); });
  const idx = ts.map((_, i) => i);
  const lift = (i: number) => deckH[i] - gnd[i];
  if (idx.length < 3) continue;
  const P3 = (i: number, o: number, h: number) => { const [x, y] = at0(ts[i], o); return P(x, y, h); };
  const edge = (o: number, dh = 0, sel = idx) => sel.map((i) => P3(i, o, deckH[i] + dh));
  const upIdx = idx.filter((i) => lift(i) > 1.5); // the elevated part
  // railings and front face grow with the lift, so they start from nothing where the deck leaves the ground
  const grow = (i: number) => Math.max(0, Math.min(1, (lift(i) - 1.5) / 2.5));
  const face = (o: number, depth: number) => upIdx.length > 1 ? [...upIdx.map((i) => P3(i, o, deckH[i])), ...upIdx.map((i) => P3(i, o, deckH[i] - depth * grow(i))).reverse()] : [];
  const rail = (o: number) => upIdx.map((i) => P3(i, o, deckH[i] + 1.1 * grow(i)));
  // abutments: where the deck leaves the embankment it stands on a solid wall down to the ground, so it
  // reads as resting on the land, not hovering (the first and last 14 m of the lifted part)
  const ends = upIdx.length > 1 ? [upIdx.filter((i) => ts[i] - ts[upIdx[0]] < 8), upIdx.filter((i) => ts[upIdx[upIdx.length - 1]] - ts[i] < 8)] : [];
  const wall = (sel: number[], o: number) => [...sel.map((i) => P3(i, o, deckH[i])), ...sel.map((i) => P3(i, o, gnd[i])).reverse()];
  const endWall = (i: number) => [P3(i, lo, deckH[i]), P3(i, hi, deckH[i]), P3(i, hi, gnd[i]), P3(i, lo, gnd[i])];
  const shadow = upIdx.length > 1 ? [...upIdx.map((i) => P3(i, lo + 1, gnd[i])), ...upIdx.map((i) => P3(i, hi - 1, gnd[i])).reverse()] : [];
  const high = idx.filter((i) => lift(i) > 0.4); // open up the ground road under the whole lifted deck, or it shows as a second road below it
  const fill = high.length > 2 ? [...high.map((i) => P3(i, lo - 1, gnd[i])), ...high.map((i) => P3(i, hi + 1, gnd[i])).reverse()] : null;
  // colours from the raw render right where the deck starts (road and cycle track)
  const i0 = upIdx.length ? upIdx[0] : 0, cyc = v.cycle.map((id) => off(geo(id)[0]));
  const lanes = v.ways.filter((id) => !v.cycle.includes(id)).map((id) => off(geo(id)[0]));
  const start = P3(Math.max(0, i0 - 3), lanes[0] + 1.5, gnd[Math.max(0, i0 - 3)]);
  const ROAD = await rawTile(start[0], start[1]);
  const CYCLE = "#c98c6c"; // the orange cycle-track colour of the render
  const piers = v.piers.map((t) => ts.findIndex((x) => x >= t)).filter((i) => i > 0 && deckH[i] - gnd[i] > 2.5);
  const poly = (q: (p: [number, number]) => string, p: Array<[number, number]>, f: string, x = "") => `<polygon points="${p.map(q).join(" ")}" fill="${f}" ${x}/>`;
  const pl = (q: (p: [number, number]) => string, p: Array<[number, number]>, w: number, c: string, x = "") => `<polyline points="${p.map(q).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" ${x}/>`;
  const svg = (q: (p: [number, number]) => string) =>
    poly(q, shadow, "#2f3a4a", 'fill-opacity="0.22"')
    // square concrete piers (Street View: grey concrete columns under a galvanised steel box girder)
    + piers.map((i) => [lo + 3.5, vis - 1.5].map((o) => pl(q, [P3(i, o, gnd[i]), P3(i, o, deckH[i] - 2.8)], 10, "#a29d96") + pl(q, [P3(i, o, gnd[i]), P3(i, o, deckH[i] - 2.8)], 6.5, "#c6c1b9")).join("")).join("")
    + ends.map((sel) => sel.length > 1 ? poly(q, wall(sel, vis), "#bdb7ae") + pl(q, sel.map((i) => P3(i, vis, gnd[i])), 1.2, "#8f8a92") : "").join("")
    + (ends.length ? poly(q, endWall(ends[1][ends[1].length - 1]), "#b3ada4") : "")
    // the side of the deck: a slate-grey steel girder, 3 m deep, with a light top lip and a rib every 5 m
    + (upIdx.length > 1 ? poly(q, face(vis, 3.0), "#727883")
      + upIdx.filter((i) => Math.round(ts[i]) % 6 === 0 && grow(i) > 0.5).map((i) => pl(q, [P3(i, vis, deckH[i] - 0.3), P3(i, vis, deckH[i] - 3.0 * grow(i))], 1.1, "#8e949d")).join("")
      + pl(q, upIdx.map((i) => P3(i, vis, deckH[i] - 0.25)), 1.4, "#b9bec5")
      + pl(q, upIdx.map((i) => P3(i, vis, deckH[i] - 3.0 * grow(i))), 1.3, "#555a63") : "")
    + poly(q, [...edge(lo), ...edge(hi).reverse()], ROAD)
    + cyc.map((o) => pl(q, edge(o), 7, CYCLE)).join("")
    + lanes.map((o) => pl(q, edge(o), 0.9, "#f4f4f1", 'stroke-dasharray="5 5"')).join("")
    + pl(q, edge(lo + 0.6), 1.3, "#f4f4f1") + pl(q, edge(hi - 0.6), 1.3, "#f4f4f1")
    + (upIdx.length > 1 ? pl(q, rail(lo), 1.4, "#f4f4f1") + pl(q, rail(hi), 1.6, "#f4f4f1") : "");
  drawn.push({ svg, fill, fillMax: v.fillMax, pts: [...shadow, ...edge(lo, 3), ...edge(hi, 3), ...edge(lo, -3), ...edge(hi, -3)] });
  console.log(`  ${v.name}: ${L.toFixed(0)} m, elevated over ${upIdx.length ? (ts[upIdx[upIdx.length - 1]] - ts[upIdx[0]]).toFixed(0) : 0} m, ${Math.min(...deckH).toFixed(1)}-${Math.max(...deckH).toFixed(1)} m TAW, road ${ROAD}, cycle ${CYCLE}`);
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
