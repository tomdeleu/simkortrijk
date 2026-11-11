/**
 * Draw the details of the K in Kortrijk south entrance (Koeiekop) into the render tiles before they
 * are painted: the big angled canopy with its hole and ring lamp over the entrance passage, and the
 * red "K" logo on the facade west of it. The massing renderer cannot draw a slab in mid-air or a logo.
 * Originals are kept in data/derived/<area>/render.orig-k/ (--restore puts them back).
 *
 *   npx tsx landmarks/k-in-kortrijk/edit_k.ts            # draw (always from the kept original)
 *   npx tsx landmarks/k-in-kortrijk/edit_k.ts --restore  # put the raw render back
 *   npx tsx landmarks/k-in-kortrijk/edit_k.ts --logo-on-paint  # after assembling: the painter drops the
 *                                                             # small logo, so draw it on paint/ again
 *
 * Geometry in the frame of massing.json (anchor, axis_deg; metres): the south facade is at v = -46.1,
 * the entrance passage is the notch at u -45.8..-39.0 running back to the glass atrium at v -32.6.
 * Ground ~16.8 m TAW (DHMV II). Look from Street View screenshots Tom shared (look-up only, AGENTS.md
 * rule 1) and the 2024 orthophoto (canopy with a round lamp seen through the hole).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { llhToPixel, useRegion } from "../../src/camera.ts";
import { fromLambert, toLambert } from "../../src/flanders.ts";
import { GEOID_M } from "../../src/heights.ts";
import { DERIVED } from "../../src/paths.ts";

useRegion("kortrijk");
const dir = join(DERIVED, "kortrijk-binnenstad"), orig = join(dir, "render.orig-k");
const T = 1024, GROUND = 16.8, FACADE = -46.1;
const m = JSON.parse(readFileSync(join(import.meta.dirname, "massing.json"), "utf8"));
const [ax, ay] = toLambert(m.anchor[1], m.anchor[0]);
const a = (m.axis_deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
/** (u, v, height above ground) -> global art pixel */
const P = (u: number, v: number, h: number): [number, number] => {
  const [lon, lat] = fromLambert(ax + u * ca - v * sa, ay + u * sa + v * ca);
  return llhToPixel(lat, lon, GROUND + h + GEOID_M);
};

// canopy: front edge 2 m past the facade at 12.4 m, rising to 13.0 m at the atrium
const C0 = -47.6, C1 = -37.4, VF = FACADE - 2, VB = -33.0, HF = 12.4, HB = 13.0, FASCIA = 0.9;
const canopyTop = [P(C0, VF, HF), P(C1, VF, HF), P(C1, VB, HB), P(C0, VB, HB)];
const fascia = [P(C0, VF, HF), P(C1, VF, HF), P(C1, VF, HF - FASCIA), P(C0, VF, HF - FASCIA)];
const lerpH = (v: number) => HF + ((v - VF) / (VB - VF)) * (HB - HF);
const hole = [P(-44.6, -43.5, lerpH(-43.5)), P(-40.4, -43.5, lerpH(-43.5)), P(-40.4, -37.5, lerpH(-37.5)), P(-44.6, -37.5, lerpH(-37.5))];
const lamp = P(-42.5, -40.5, 8.5);
// "K" logo on the facade west of the entrance: 6.5 m tall, top at 11.2 m, from u -53.6
const L0 = -53.6, LTOP = 11.2, LV = FACADE - 0.05;
const o = P(L0, LV, LTOP), ex = P(L0 + 1, LV, LTOP), ey = P(L0, LV, LTOP - 1);

const pts = [...canopyTop, ...fascia, o, P(L0 + 5, LV, LTOP - 6.5)];
const tiles = new Set(pts.map(([x, y]) => `${Math.floor(x / T)}_${Math.floor(y / T)}`));

if (process.argv.includes("--restore")) {
  if (!existsSync(orig)) { console.log("nothing to restore"); process.exit(0); }
  for (const f of readdirSync(orig)) { copyFileSync(join(orig, f), join(dir, "render", f)); console.log(`  restored render/${f}`); }
  process.exit(0);
}
const logoSvg = (tx: number, ty: number) => {
  const mat = [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0] - tx * T, o[1] - ty * T].map((v) => v.toFixed(3)).join(",");
  return `<g transform="matrix(${mat})"><text x="0" y="6.5" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="8.6" fill="#d8262e" stroke="#ffffff" stroke-width="0.35">K</text></g>`;
};
if (process.argv.includes("--logo-on-paint")) {
  const k = `${Math.floor(o[0] / T)}_${Math.floor(o[1] / T)}`, [tx, ty] = k.split("_").map(Number), file = join(dir, "paint", `${k}.png`);
  const buf = await sharp(file).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">${logoSvg(tx, ty)}</svg>`) }]).png().toBuffer();
  await sharp(buf).toFile(file);
  console.log(`  drew the K logo on paint/${k}.png`);
  process.exit(0);
}
mkdirSync(orig, { recursive: true });
for (const k of tiles) {
  const [tx, ty] = k.split("_").map(Number), file = join(dir, "render", `${k}.png`), keep = join(orig, `${k}.png`);
  if (!existsSync(keep)) copyFileSync(file, keep);
  const q = (p: [number, number]) => `${(p[0] - tx * T).toFixed(1)},${(p[1] - ty * T).toFixed(1)}`;
  const poly = (ps: Array<[number, number]>, fill: string, extra = "") => `<polygon points="${ps.map(q).join(" ")}" fill="${fill}" ${extra}/>`;
  const [lx, ly] = [lamp[0] - tx * T, lamp[1] - ty * T];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}">` + logoSvg(tx, ty)
    + poly(fascia, "#a9aaa7")
    + poly(canopyTop, "#d6d6d2", `stroke="#9c9d9a" stroke-width="0.6"`)
    + poly(hole, "#55585e")
    + `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="4.2" ry="2.2" fill="none" stroke="#f4f1ea" stroke-width="1.6"/>`
    + `</svg>`;
  await sharp(keep).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 6 }).toFile(file);
  console.log(`  drew the K entrance canopy and logo into render/${k}.png`);
}
