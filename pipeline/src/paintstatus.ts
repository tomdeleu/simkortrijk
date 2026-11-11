/**
 * Paint status map: docs/paint-status.png. Every binnenstad tile from the export cache (z7 = one tile
 * per 1024 px art tile), painted tiles outlined red, render-only tiles greyed, landmarks by priority,
 * and the proposed next piece dashed blue. Run after every piece (docs/PAINT_STATUS.md "Working rule").
 *
 *   npx tsx src/paintstatus.ts [--next="1_-2,1_-1"] [--label "voorstel: stuk 2 ..."]
 *
 * Reads the z7 map tiles from the export cache, else the published ones on R2 (TILES_ORIGIN, default the
 * simkortrijk r2.dev bucket) by their hashes in data/web-state/<region>.json.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { GROUND_H } from "./areas.ts";
import { llhToPixel } from "./camera.ts";
import { DERIVED, PIPELINE, ROOT, WEB_CACHE, WEB_STATE } from "./paths.ts";

const { values: args } = parseArgs({ options: { area: { type: "string", default: "kortrijk-binnenstad" }, next: { type: "string", default: "" }, label: { type: "string", default: "" } } });
const d = join(DERIVED, args.area!);
const z7 = join(WEB_CACHE, "regions", "kortrijk", "tiles", "map", "7");
const key = (f: string) => f.replace(".png", "");
const tiles = readdirSync(join(d, "render")).filter((f) => f.endsWith(".png")).map((f) => key(f).split("_").map(Number) as [number, number]);
const painted = new Set(existsSync(join(d, "paint")) ? readdirSync(join(d, "paint")).filter((f) => f.endsWith(".png")).map(key) : []);
const next = new Set(args.next!.split(",").filter(Boolean));
const C = 240, TX0 = Math.min(...tiles.map((t) => t[0])), TY0 = Math.min(...tiles.map((t) => t[1]));
const NX = Math.max(...tiles.map((t) => t[0])) - TX0 + 1, NY = Math.max(...tiles.map((t) => t[1])) - TY0 + 1, W = NX * C, H = NY * C;
const ORIGIN = process.env.TILES_ORIGIN || "https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev";
const stateFile = join(WEB_STATE, "kortrijk.json");
const published = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
const parts = [];
for (const [tx, ty] of tiles) {
  const f = join(z7, `${tx}`, `${ty}.avif`);
  let buf: Buffer;
  if (existsSync(f)) buf = readFileSync(f);
  else {
    const v = published.layers?.map?.hashes?.[`7/${tx}_${ty}`];
    const r = await fetch(`${ORIGIN}/regions/kortrijk/tiles/map/7/${tx}/${ty}.avif${v ? `?v=${v}` : ""}`);
    if (!r.ok) throw new Error(`z7 tile ${tx}_${ty}: not in the export cache and ${r.status} from ${ORIGIN}`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  let img = sharp(buf).resize(C, C);
  if (!painted.has(`${tx}_${ty}`)) img = img.modulate({ saturation: 0.25, brightness: 1.05 });
  parts.push({ input: await img.png().toBuffer(), left: (tx - TX0) * C, top: (ty - TY0) * C });
}
const P = (lat: number, lon: number) => { const [x, y] = llhToPixel(lat, lon, GROUND_H + 15); return [(x / 1024 - TX0) * C, (y / 1024 - TY0) * C]; };
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`;
for (const [tx, ty] of tiles) {
  const k = `${tx}_${ty}`, x = (tx - TX0) * C, y = (ty - TY0) * C, p = painted.has(k);
  svg += `<rect x="${x + 1}" y="${y + 1}" width="${C - 2}" height="${C - 2}" fill="none" stroke="${p ? "#e0245e" : "#fff"}" stroke-width="${p ? 5 : 1.5}" stroke-opacity="${p ? 1 : 0.7}"/>`;
  svg += `<rect x="${x + 6}" y="${y + 6}" width="${p ? 92 : 58}" height="24" rx="4" fill="${p ? "#e0245e" : "#222"}" fill-opacity="0.85"/><text x="${x + 12}" y="${y + 23}" font-size="16" font-weight="700" fill="#fff">${k}${p ? " · P" : ""}</text>`;
  if (next.has(k)) svg += `<rect x="${x + 5}" y="${y + 5}" width="${C - 10}" height="${C - 10}" fill="none" stroke="#1d72e8" stroke-width="6" stroke-dasharray="18 10"/>`;
}
if (next.size && args.label) {
  const [tx, ty] = [...next].map((k) => k.split("_").map(Number)).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  svg += `<rect x="${(tx - TX0) * C + 8}" y="${(ty - TY0 + 1) * C - 34}" width="${args.label.length * 8.6 + 16}" height="26" rx="4" fill="#1d72e8"/><text x="${(tx - TX0) * C + 16}" y="${(ty - TY0 + 1) * C - 15}" font-size="15" font-weight="700" fill="#fff">${args.label}</text>`;
}
const lm = JSON.parse(readFileSync(join(PIPELINE, "landmarks", "positions.json"), "utf8"));
for (const [name, l] of Object.entries(lm) as Array<[string, any]>) {
  if (name.startsWith("_")) continue;
  const [x, y] = P(l.lat, l.lon), col = l.prio === "P1" ? "#ffd400" : l.prio === "P2" ? "#ff8c1a" : "#9ad0ff";
  svg += `<circle cx="${x}" cy="${y}" r="7" fill="${col}" stroke="#000" stroke-width="2"/><text x="${x + 10}" y="${y + 5}" font-size="14" font-weight="700" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${name}</text>`;
}
const pct = ((100 * painted.size) / tiles.length).toFixed(1);
svg += `<g transform="translate(12,${H - 96})"><rect width="320" height="86" rx="6" fill="#111" fill-opacity="0.8"/>
<rect x="10" y="10" width="18" height="12" fill="none" stroke="#e0245e" stroke-width="3"/><text x="36" y="21" font-size="13" fill="#fff">geschilderd: ${painted.size} van ${tiles.length} tegels (${pct}%)</text>
<rect x="10" y="30" width="18" height="12" fill="#999"/><text x="36" y="41" font-size="13" fill="#fff">alleen render (grijs gemaakt)</text>
<circle cx="19" cy="62" r="6" fill="#ffd400" stroke="#000"/><circle cx="35" cy="62" r="6" fill="#ff8c1a" stroke="#000"/><circle cx="51" cy="62" r="6" fill="#9ad0ff" stroke="#000"/><text x="64" y="66" font-size="13" fill="#fff">landmark P1 / P2 / P3</text></g></svg>`;
const out = join(ROOT, "docs", "paint-status.png");
await sharp({ create: { width: W, height: H, channels: 3, background: "#0e0f12" } }).composite([...parts, { input: Buffer.from(svg) }])
  .png().toBuffer().then((b) => sharp(b).resize(1440).png({ palette: true, quality: 90, effort: 10 }).toFile(out));
console.log(`${out}: ${painted.size}/${tiles.length} painted (${pct}%)${next.size ? `, next: ${[...next].join(" ")}` : ""}`);
