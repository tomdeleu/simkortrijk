/**
 * Fetch a region's municipal boundaries (OSM admin_level=8) from Overpass.
 *
 *   npm run boundaries -- kortrijk      -> data/raw/boundaries/<region>.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { overpass } from "./osm.ts";
import { REGIONS } from "./places.ts";
import { RAW } from "./paths.ts";

const id = process.argv[2] ?? "kortrijk", region = REGIONS[id];
if (!region) throw new Error(`unknown region ${id}`);
const names = region.municipalities.map((c) => c.replace(/[-]/g, "\\-")).join("|");
const data = await overpass(`[out:json][timeout:240];
area["name:en"="${region.country}"]["admin_level"="2"]->.il;
relation["boundary"="administrative"]["admin_level"="8"]["name"~"^(${names})$"](area.il);
out body geom;`);
mkdirSync(join(RAW, "boundaries"), { recursive: true });
writeFileSync(join(RAW, "boundaries", `${id}.json`), JSON.stringify(data));
console.log("  boundaries:", data.elements.map((e: any) => e.tags["name:en"] ?? e.tags.name).join(", "));
