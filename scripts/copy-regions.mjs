/**
 * Copy the export cache into the Astro build so one Worker serves pages and tiles
 * from the same origin. Run after `astro build`. Skipped when TILES_ORIGIN (or the default r2.dev
 * origin in pipeline/src/hosting.ts) is set: the site then loads tiles from R2.
 *
 *   data/web/regions/<region>/  ->  web/dist/regions/<region>/
 */
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HOSTING } from "../pipeline/src/hosting.ts";

const src = "data/web/regions";
const dest = "web/dist/regions";

if (existsSync(".env")) process.loadEnvFile(".env");
if (HOSTING.origin) {
  console.log(`tiles load from ${HOSTING.origin}: not copying data/web/regions into web/dist`);
  process.exit(0);
}
if (!existsSync("web/dist")) {
  console.error("web/dist is missing. Run the Astro build first.");
  process.exit(1);
}
if (!existsSync(src)) {
  console.warn("data/web/regions is missing. This build has pages only. Run npm run export before npx wrangler deploy, or the map has no tiles.");
  process.exit(0);
}

cpSync(src, dest, { recursive: true });

function count(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    n += statSync(path).isDirectory() ? count(path) : 1;
  }
  return n;
}

console.log(`copied ${count(dest)} map files to ${dest}`);
