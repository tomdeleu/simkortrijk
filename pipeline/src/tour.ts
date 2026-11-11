/**
 * Visual QA tour: screenshots the live viewer at well-known places, at street and district zoom.
 *
 *   npx tsx src/tour.ts [url] [outDir] [place …]
 *
 * Output: <outDir>/<place>_<zoom>.png (scale = screen px per art px: 1 = native, 0.35 = district)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { GROUND_H } from "./areas.ts";
import { llhToPixel } from "./camera.ts";
import { CHROME, CHROME_ARGS, siteUrl } from "./paths.ts";

export const PLACES: Record<string, [number, number]> = {
  belfort: [50.8275738, 3.2656171],
  "sint-maartenskerk": [50.8284, 3.2659],
  "olv-kerk": [50.8278, 3.2679],
  begijnhof: [50.8270, 3.2643],
  broeltorens: [50.8297, 3.2665],
  leie: [50.8292, 3.2660],
};

const [urlArg, outDir = "tour", ...only] = process.argv.slice(2), url = siteUrl(urlArg);
mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript("window.__name = (f) => f;");
const problems: string[] = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => (window as any).__viewer?.world.getItemCount() > 0);

for (const [name, [lat, lon]] of Object.entries(PLACES)) {
  if (only.length && !only.includes(name)) continue;
  const [x, y] = llhToPixel(lat, lon, GROUND_H);
  for (const scale of [1, 0.35]) {
    await page.evaluate(([gx, gy, s]) => {
      const v = (window as any).__viewer, world = (window as any).__world;
      const w = v.world.getItemAt(0).getContentSize().x;
      v.viewport.zoomTo((w / v.container.clientWidth) * s, undefined, true);
      v.viewport.panTo(v.world.getItemAt(0).imageToViewportCoordinates(gx - world.origin[0], gy - world.origin[1]), true);
    }, [x, y, scale]);
    await page.waitForTimeout(400);
    await page.waitForFunction(() => (window as any).__viewer.world.getItemAt(0).getFullyLoaded(), null, { timeout: 30_000 }).catch(() => problems.push(`${name}: tiles not loaded`));
    await page.waitForTimeout(1500); // let traffic move
    await page.screenshot({ path: join(outDir, `${name}_${scale === 1 ? "street" : "district"}.png`) });
  }
}
console.log(problems.length ? `PROBLEMS:\n  ${[...new Set(problems)].join("\n  ")}` : `ok -> ${outDir}`);
await b.close();
