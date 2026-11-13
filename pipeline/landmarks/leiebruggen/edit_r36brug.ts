/**
 * Draw the R36 bridge over the Leie (Burgemeester Vercruysselaan, OSM way 826126060) into the render
 * tiles before they are painted. The massing renderer draws the road on the ground, so the painter
 * made a short dark slab on grass embankments; in reality it is a long, slender light-concrete deck
 * on V-shaped piers, open underneath (Koning Albertpark, the skatebowl and the Leie quays pass below),
 * with white railings and lamp posts (Google Street View from the IJzerkaai bank, look-up only,
 * Tom's feedback 2026-11-13). Like edit_noordbrug.ts: originals are kept in
 * data/derived/<area>/render.orig-r36brug/ and put back with --restore after painting.
 *
 *   npx tsx landmarks/leiebruggen/edit_r36brug.ts            # draw
 *   npx tsx landmarks/leiebruggen/edit_r36brug.ts --restore  # put the raw render back
 *
 * Geometry (Lambert 72, metres; heights TAW): the OSM bridge way runs 127 m from (72497.2, 169945.5)
 * to (72614.8, 169898.0). DHMV II: deck 16.6 m at the ends rising to ~18.8 m in the middle, ground and
 * water below at 10-12.5 m; the deck spans offsets -10.5 .. +8.5 m from the OSM axis (normal points
 * north-north-east, so the -10.5 edge is the south side the camera sees).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { llhToPixel, useRegion } from "../../src/camera.ts";
import { fromLambert } from "../../src/flanders.ts";
import { GEOID_M } from "../../src/heights.ts";
import { DERIVED } from "../../src/paths.ts";

useRegion("kortrijk");
const dir = join(DERIVED, "kortrijk-binnenstad"), orig = join(dir, "render.orig-r36brug");
const T = 1024;
const A = [72497.2, 169945.5], B = [72614.8, 169898.0];
const LEN = Math.hypot(B[0] - A[0], B[1] - A[1]);
const AX = [(B[0] - A[0]) / LEN, (B[1] - A[1]) / LEN], N = [-AX[1], AX[0]];
const SOUTH = -10.5, NORTH = 8.5, GROUND = 11.5;
const deck = (t: number) => 16.6 + 2.2 * Math.sin((Math.PI * Math.min(LEN, Math.max(0, t))) / LEN);
const P = (t: number, o: number, h: number): [number, number] => {
  const [lon, lat] = fromLambert(A[0] + AX[0] * t + N[0] * o, A[1] + AX[1] * t + N[1] * o);
  return llhToPixel(lat, lon, h + GEOID_M);
};
const ts = Array.from({ length: 33 }, (_, k) => (k * LEN) / 32);
const edge = (o: number, dh = 0) => ts.map((t) => P(t, o, deck(t) + dh));

if (process.argv.includes("--restore")) {
  if (!existsSync(orig)) { console.log("nothing to restore"); process.exit(0); }
  for (const f of readdirSync(orig)) { copyFileSync(join(orig, f), join(dir, "render", f)); console.log(`  restored render/${f}`); }
  process.exit(0);
}

// everything drawn, in art px
const top = [...edge(SOUTH), ...edge(NORTH).reverse()];            // asphalt deck surface
const fascia = [...edge(SOUTH), ...edge(SOUTH, -1.6).reverse()];    // light concrete south edge
const shadow = [...ts.map((t) => P(t, SOUTH + 2, GROUND)), ...ts.map((t) => P(t, NORTH - 2, GROUND)).reverse()];
const piers = [24, 103].flatMap((t) => [
  [P(t, SOUTH + 3, GROUND), P(t - 7, SOUTH + 3, deck(t - 7) - 1.6)],
  [P(t, SOUTH + 3, GROUND), P(t + 7, SOUTH + 3, deck(t + 7) - 1.6)],
]);
const lamps = [10, 35, 60, 85, 110].flatMap((t) => [[P(t, SOUTH + 0.3, deck(t)), P(t, SOUTH + 0.3, deck(t) + 8)], [P(t, NORTH - 0.3, deck(t)), P(t, NORTH - 0.3, deck(t) + 8)]]);
const all = [...top, ...fascia, ...shadow, ...piers.flat(), ...lamps.flat()];
const tiles = new Set(all.map(([x, y]) => `${Math.floor(x / T)}_${Math.floor(y / T)}`));

mkdirSync(orig, { recursive: true });
for (const k of tiles) {
  const [tx, ty] = k.split("_").map(Number), file = join(dir, "render", `${k}.png`), keep = join(orig, `${k}.png`);
  if (!existsSync(file)) continue;
  if (!existsSync(keep)) copyFileSync(file, keep);
  const q = ([x, y]: [number, number]) => `${(x - tx * T).toFixed(1)},${(y - ty * T).toFixed(1)}`;
  const poly = (pts: Array<[number, number]>, fill: string, extra = "") => `<polygon points="${pts.map(q).join(" ")}" fill="${fill}" ${extra}/>`;
  const line = (a: [number, number], b: [number, number], w: number, c: string) => { const [x1, y1] = q(a).split(","), [x2, y2] = q(b).split(","); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`; };
  const pl = (pts: Array<[number, number]>, w: number, c: string, dash = "") => `<polyline points="${pts.map(q).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linejoin="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">`
    + poly(shadow, "#3a3d44", `fill-opacity="0.18"`)
    + piers.map(([a, b]) => line(a, b, 5, "#b9b8b2") + line(a, b, 3, "#dddbd4")).join("")
    + poly(fascia, "#e2e0d9") + pl(edge(SOUTH, -1.6), 1.2, "#a9a7a0")
    + poly(top, "#74777e")
    + pl(edge(SOUTH + 1.2), 1.4, "#e9e9e6") + pl(edge(NORTH - 1.2), 1.4, "#e9e9e6") + pl(edge(-1), 1.1, "#f2f2ee", "6 6")
    + pl(edge(SOUTH, 1.1), 1.6, "#f4f4f1") + pl(edge(NORTH, 1.1), 1.4, "#f4f4f1")
    + lamps.map(([a, b]) => line(a, b, 1.4, "#8d9097")).join("")
    + `</svg>`;
  // the render drew the road on the ground under the deck: fill that strip with what lies just south
  // of it in the same column (water over the Leie, grass in the park), so the bridge is open below
  const strip = [...ts.filter((t) => t > 5 && t < LEN - 5).map((t) => P(t, SOUTH - 2.5, GROUND)), ...ts.filter((t) => t > 5 && t < LEN - 5).map((t) => P(t, NORTH + 2.5, GROUND)).reverse()];
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">${poly(strip, "#fff")}</svg>`;
  const mask = await sharp(Buffer.from(maskSvg)).greyscale().raw().toBuffer();
  const { data: px, info } = await sharp(keep).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let x = 0; x < T; x++) {
    let bot = -1;
    for (let y = T - 1; y >= 0; y--) if (mask[y * T + x] > 127) { bot = y; break; }
    if (bot < 0) continue;
    const sy = Math.min(T - 1, bot + 5), src = (sy * T + x) * 3;
    for (let y = 0; y <= bot; y++) if (mask[y * T + x] > 127) { const d = (y * T + x) * 3; px[d] = px[src]; px[d + 1] = px[src + 1]; px[d + 2] = px[src + 2]; }
  }
  const base = await sharp(px, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  await sharp(base).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 6 }).toFile(file);
  console.log(`  drew the R36 bridge into render/${k}.png`);
}
const mid = P(LEN / 2, -1, deck(LEN / 2));
console.log(`  deck middle at art px ${mid.map(Math.round)}`);
