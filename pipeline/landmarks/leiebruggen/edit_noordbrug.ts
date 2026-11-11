/**
 * Draw the Noordbrug pylon and stays into the render tiles before they are painted (the massing
 * renderer cannot draw a leaning pylon or cables). Like broeltorens/edit_broel.py: originals are kept
 * in data/derived/<area>/render.orig-noordbrug/ and put back with --restore after painting, so the
 * photo layer stays the raw render.
 *
 *   npx tsx landmarks/leiebruggen/edit_noordbrug.ts            # draw
 *   npx tsx landmarks/leiebruggen/edit_noordbrug.ts --restore  # put the raw render back
 *
 * Geometry (Lambert 72, metres; heights TAW): OSM way 1333504491 (bridge outline) gives the deck axis;
 * DHMV II gives the deck at ~19.3 m, the quays at ~16 m and the pylon top at 38.3 m on the axis at the
 * south-east bank (Lambert 71634.5, 169341.5). Shape from photos (look-up only, AGENTS.md rule 1):
 * a lambda pylon, one near-vertical leg at the deck end and one strut leaning back inland, with a fan
 * of stays down to the deck over the river.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { llhToPixel, useRegion } from "../../src/camera.ts";
import { fromLambert } from "../../src/flanders.ts";
import { GEOID_M } from "../../src/heights.ts";
import { DERIVED } from "../../src/paths.ts";

useRegion("kortrijk");
const dir = join(DERIVED, "kortrijk-binnenstad"), orig = join(dir, "render.orig-noordbrug");
const T = 1024;
// deck axis: centre and direction (towards the north-west bank), metres along it
const C = [71625.7, 169366.1], AX = [-0.344, 0.939];
const at = (t: number, h: number): [number, number] => {
  const [lon, lat] = fromLambert(C[0] + AX[0] * t, C[1] + AX[1] * t);
  return llhToPixel(lat, lon, h + GEOID_M);
};
const DECK = 19.4, QUAY = 16.2, TOP = 38.3;
const top = at(-35.2, TOP), legFoot = at(-37.5, QUAY), strutFoot = at(-49, QUAY);
const stays = [-27, -22, -17, -12, -7, -2, 3].map((t) => at(t, DECK + 0.6));
const anchors = [-36.2, -36.0, -35.8, -35.6, -35.4, -35.3, -35.2].map((t, k) => at(t, TOP - 1.2 - k * 0.9));
const pts = [top, legFoot, strutFoot, ...stays];
const tiles = new Set(pts.map(([x, y]) => `${Math.floor(x / T)}_${Math.floor(y / T)}`));

if (process.argv.includes("--restore")) {
  if (!existsSync(orig)) { console.log("nothing to restore"); process.exit(0); }
  for (const f of readdirSync(orig)) { copyFileSync(join(orig, f), join(dir, "render", f)); console.log(`  restored render/${f}`); }
  process.exit(0);
}
mkdirSync(orig, { recursive: true });
for (const k of tiles) {
  const [tx, ty] = k.split("_").map(Number), file = join(dir, "render", `${k}.png`), keep = join(orig, `${k}.png`);
  if (!existsSync(keep)) copyFileSync(file, keep);
  const o = (p: [number, number]) => `${(p[0] - tx * T).toFixed(1)},${(p[1] - ty * T).toFixed(1)}`;
  const line = (a: [number, number], b: [number, number], w: number, c: string) => `<line x1="${o(a).split(",")[0]}" y1="${o(a).split(",")[1]}" x2="${o(b).split(",")[0]}" y2="${o(b).split(",")[1]}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">`
    + stays.map((s, i) => line(anchors[i], s, 1.9, "#565a63")).join("")
    + line(strutFoot, top, 7, "#9a9ea6") + line(strutFoot, top, 4.5, "#c9ccd2")
    + line(legFoot, top, 7, "#8e929a") + line(legFoot, top, 4.5, "#bfc2c9")
    + `</svg>`;
  await sharp(keep).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 6 }).toFile(file);
  console.log(`  drew the Noordbrug pylon into render/${k}.png`);
}
console.log(`  pylon top at art px ${top.map(Math.round)}`);
