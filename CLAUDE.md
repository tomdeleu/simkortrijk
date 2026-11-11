# SimKortrijk

Isometric map of Kortrijk (Belgium). One orthographic camera, Flemish open data, a three.js render, an optional image-model repaint, and an Astro + OpenSeadragon viewer.

Adapted from [Isometric World](https://github.com/krasun/isometricworld) (Dmytro Krasun, MIT). Do not copy that repo's tiles, video or style images. Licence: `LICENSE`. Credits: `ATTRIBUTION.md`.

## Layout

| Path | Role |
|---|---|
| `pipeline/src/places.ts` | Region `kortrijk` (origin = Belfort, heading 20°) and city `kortrijk` |
| `pipeline/src/areas.ts` | `kortrijk-binnenstad` (~800 m) and `kortrijk` (whole municipality) |
| `pipeline/src/fetch.ts` | GRB, 3D GRB, DHMV, OSM. Calls `trees.ts` |
| `pipeline/src/flanders.ts` | Lambert 72 and DHMV rasters |
| `pipeline/src/ground.ts` | Terrain grid + drawable ground |
| `pipeline/src/scene.ts` | Buildings, LiDAR spires, trees, binned per render tile |
| `pipeline/src/render.ts` | Headless Chrome render |
| `pipeline/page/renderer.ts` | three.js page the renderer loads |
| `pipeline/src/paint.ts`, `gemini.ts`, `paintqa.ts` | Optional repaint (OpenAI `gpt-image-2.6-flare` recommended, Gemini default). Batch API above 12 windows. `register.ts` checks geometry |
| `pipeline/src/export.ts` | AVIF pyramid into `data/web/regions/kortrijk/` |
| `pipeline/src/hosting.ts` | R2 bucket `simkortrijk`, default `TILES_ORIGIN` (its r2.dev URL) |
| `web/` | Astro viewer. `/` and `/kortrijk` |
| `pipeline/style/` | Style A (style C pastel game-like, more contrast, clear blue water). `reference.png` is a painted Broeltorens window in that style. `trees.png` is mint/sage crowns. Not Tel Aviv imagery. |
| `.claude/skills/` | One skill per step |
| `pipeline/landmarks/broeltorens/edit_broel.py` | Hand edit of the Broeltorens render before that block is painted |
| `pipeline/tools/assemble_block.py` | Paint tiles for a partial block, feathered into the render |

`data/` is gitignored. Raw downloads are `data/raw/<area>/`. Renders and paints are `data/derived/<area>/`. The viewer reads `data/web/`.

## Commands

```sh
npm install
npm run binnenstad     # boundaries + fetch + ground + scene + render + export
npm run dev             # http://localhost:4321/
```

Or step by step (every command takes the area or region name after `--`):

```sh
npm run boundaries -- kortrijk
npm run fetch -- kortrijk-binnenstad
npm run ground -- kortrijk-binnenstad
npm run scene -- kortrijk-binnenstad
npm run render -- kortrijk-binnenstad -j 2
npm run paint -- kortrijk-binnenstad --plan
npm run export -- kortrijk-binnenstad
npm run dev
```

Deploy as one Worker `simkortrijk`; tiles load from the R2 bucket `simkortrijk` (https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev, the default `TILES_ORIGIN`). `npm run publish -- kortrijk --yes --keep` uploads new exports there. Set `TILES_ORIGIN=` (empty) to bundle tiles into the Worker instead. `wrangler.jsonc` is `name: simkortrijk`, `workers_dev: true`, assets directory `web/dist`.

```sh
npm run binnenstad
npm run build            # astro build, then scripts/copy-regions.mjs -> web/dist/regions
npx wrangler login       # once
npx wrangler deploy
```

The build reads `data/web/regions/<region>/data/world.json` so the HTML preloads `tiles-map.<hash>.json` and the preview, not the legacy `tiles.json`. Wrangler prints `https://simkortrijk.<account>.workers.dev`.

Typecheck: `npm run typecheck` (pipeline `tsc`, then `astro check`). Chrome is auto-detected (`CHROME_PATH` overrides).

## Data

- Footprints: GRB WFS `GBG`, `GBA`, `KNW`. Roads `WBN`, water `WTZ`.
- Heights: 3D GRB WMS `GRBGEBL1D2` GetFeatureInfo (`HN_P99`), else DHMV II DSM−DTM p95. Checkpoint: `data/raw/<area>/3dgrb.json`.
- Spires: scene.ts, where canopy is 8 m above the surveyed roof (Sint-Maartenskerk, Belfort).
- Terrain: DHMV II DTM. Geoid constant `GEOID_M = 43.5` in `heights.ts`.
- Trees: OMZNIR24VL NDVI + nDSM > 3 m, merged with OSM `natural=tree`. No Google imagery.
- Ground and traffic: GRB roads/water + OSM.

Attribution on the map must include `Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen` and `© OpenStreetMap contributors`.

## Conventions

- TypeScript, ESM, Node 22.23+. The renderer is three.js in headless Chrome, not a second Python stack.
- One region = one camera = one tile pyramid. Do not change `origin` or `headingDeg` after export.
- Areas of one region are exported together: `npm run export -- kortrijk-binnenstad kortrijk`.
- Unpainted tiles are allowed. Export uses `paint/` where it exists and `render/` elsewhere.
- Do not delete `data/derived/` or `data/web-state/`.
- Do not run `npm run publish` or `npm run deploy` unless the user asked. Publish asks `[y/N]` unless `--yes`.

## Cloudflare

Only touch R2 bucket `simkortrijk` and Worker `simkortrijk`. Never change any other bucket, worker, domain, DNS, or setting. Never delete objects outside `regions/kortrijk/`. A custom domain on the bucket only if Tom asks.

## Where the binnenstad paint stands

The live site serves 29 render tiles of `kortrijk-binnenstad`. Six are painted: `tx` -2..0, `ty` -2..-1, the Broeltorens block, style A, painted with **OpenAI `gpt-image-2.6-flare`** (quality high, input fidelity high). The corner window `-2_-3` is skipped and stays render. Windows and paint tiles live in `data/derived` (gitignored) and the published copies are on R2.

Painter choice: use OpenAI `gpt-image-2.6-flare` for new painting (`PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare`). It copies the pasted neighbour strips far better than Gemini, so window seams are almost invisible (Gemini Nano Banana 2.1 left rectangular colour steps in the Leie and on roofs). About $0.09 per window. Tom asked to try `flare` first and not `sunburst`; only try `gpt-image-2.6-sunburst` if Tom says so. Use `PAINT_ATTEMPTS=1` and check windows by eye while `roofNovelty` still fails on every window. Every call's token usage is logged to `data/derived/<area>/openai-usage.jsonl`.

Known weakness of GPT: it follows the render literally. Where the render is wrong (Sint-Maartenskerk is a flat LOD1 block with one tower), GPT paints a flat roof. Fix the render or add a landmark description first, then repaint that window.

Before painting the Broeltorens block, run `python3 pipeline/landmarks/broeltorens/edit_broel.py` so the towers are cream stone with slate cones and the Broelbrug (OSM way 567818112) is drawn low between their feet. After the windows are accepted, `python3 pipeline/landmarks/broeltorens/edit_broel.py --restore` puts the raw render back. Assemble a partial block with `python3 pipeline/tools/assemble_block.py --skip -2_-3` (about 220 px of feather into the surrounding render). Do not use `npm run paint -- --assemble` for a partial block: it leaves a hard seam.

A 3×3 around the towers:

```sh
PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare PAINT_ATTEMPTS=1 \
  npm run paint -- kortrijk-binnenstad --near 50.83049,3.26704 --radius 1 --center 50.83049,3.26704 --interactive -j 3
```

Next, in this order:

1. Landmarks. For each important landmark (Sint-Maartenskerk first, then Belfort/Halletoren, Onze-Lieve-Vrouwekerk, Begijnhof, stadhuis, Leiebruggen, station...), research online how it really looks (roof shape and colour, towers, spires, materials), save refs and a `notes.md` under `pipeline/landmarks/<slug>/`, and fix the render the way `edit_broel.py` does. Then repaint only that window with its painted neighbours pasted in.
2. Building colours. Every building now has the same colour in the render, so the paint looks uniform. Give each building a roof and wall colour from OSM tags (`roof:colour`, `building:colour`, `roof:material`), else sampled from the Digitaal Vlaanderen orthophoto inside its footprint, else a type-based palette, and tell the prompt to keep the render's roof and wall colours.
3. `roofNovelty` fails on every window (about 0.07–0.29, limit 0.04). Tighten the prompt or enforce the check. Do not raise the limit to hide it.
4. Colour match between neighbouring windows for land and river (only open sea is matched). Less urgent with GPT.
5. The Broeltorens cones are a bit squat. The beige quay downstream of the Broelbrug should be water (source data, not paint).
6. Then paint the rest of the binnenstad block by block outward from the Broeltorens, export, `npm run dev` and look. Publish only when Tom asks: `npm run publish -- kortrijk --yes --keep`. The Worker reads tiles from R2, so a tiles-only change needs no redeploy; code changes need `npm run build` then `npx wrangler deploy`.
7. Optional: the whole municipality, area `kortrijk`. A custom domain on the bucket only if Tom asks.

## Secrets

None for fetch, render, export or `npm run dev`.

| Name | When |
|---|---|
| `PAINT_PROVIDER` | `gemini` (default), `codex`, or `openai` |
| `GEMINI_API_KEY` | Default painter. Image edits on `gemini-nano-banana-2.1` |
| `GEMINI_IMAGE_MODEL` | Optional. Default `gemini-nano-banana-2.1` |
| `OPENAI_API_KEY` | Only if `PAINT_PROVIDER=openai` |
| `OPENAI_IMAGE_MODEL` | Optional, default `gpt-image-1`. Use `gpt-image-2.6-flare` (current live paint) |
| `OPENAI_IMAGE_QUALITY`, `OPENAI_INPUT_FIDELITY` | Optional, both default `high`. Set `OPENAI_INPUT_FIDELITY=` (empty) for a model that rejects it |
| `TILES_ORIGIN` | Unset: the `simkortrijk` bucket on r2.dev. Empty: tiles bundled in the Worker. A custom domain is better for production (r2.dev is rate-limited). |
| `CLOUDFLARE_ACCOUNT_ID` | publish / deploy |
| `CLOUDFLARE_API_TOKEN` | publish, if you are not using `wrangler login` |
| `SITE_DOMAIN` | `npm run deploy` |
| `PIRSCH_ACCESS_KEY` | Optional Worker analytics |
| `CHROME_PATH`, `CHROME_ARGS`, `SITE_URL` | Optional |

Do not run `npm run paint` until `GEMINI_API_KEY` is set on purpose. `npm test` mocks the Gemini calls and spends nothing. More than 12 windows uses the Batch API (half of $0.0336 per 1K image); `--interactive` forces one `generateContent` call per window. Codex (`PAINT_PROVIDER=codex`) has no API key: `codex` must be on `PATH` and logged into ChatGPT.

## Gotchas

- WFS 2.0 bbox for EPSG:4326 on this server is west,south,east,north. Geometries are lon, lat.
- DHMV GeoTIFFs are north-up (origin at the north edge, negative y scale). `flanders.ts` normalises row 0 = north.
- 3D GRB misses buildings newer than about 2015. Those keep a DHMV height. The binnenstad is roughly 6,500 footprints after dropping ramps and bridge decks.
- A failed height lookup is stored as `null` in `3dgrb.json` and that building uses DHMV. Keys already in the checkpoint are not requested again.
- Render uses software WebGL if there is no GPU (`--enable-unsafe-swiftshader`). `-j 2` is a safe default.
- `npm run dev` serves `/regions/...` from `data/web` first and proxies everything else to R2, so a fresh clone shows the published tiles with no export. With `TILES_ORIGIN=` (empty) it 404s `/regions/...` that are not in `data/web`. Export first. A production build with an empty origin reads that same cache; run `npm run build` after export so `web/dist/regions` exists before `npx wrangler deploy`.
- If Overpass is unreachable, `fetch` retries a second Overpass server and then the OSM map API (`api.openstreetmap.org/api/0.6/map.json`) for the same bbox. The map API is a fallback: it downloads every object and this repo filters it.
- `uitest` treats any HTTP 400+ as a failure, including a tile the index should not have requested.
- Paint style is variant A: style C (blush and coral roofs, peach and cream walls, mint and sage trees, pale lavender streets) with stronger contrast, clear blue water (#2F7FD6, not teal) and slate blue-grey cones. The prompt in `paint.ts` is the geometry lock plus that paragraph. Flat LOD1 roofs stay flat; tile colour is allowed, new hips and ridges are not.
- `roofNovelty` in `register.ts` retries a paint when more than 4% of flat roof and wall interiors grow a strong new edge. Fine tile texture stays under that. Do not copy Tel Aviv style images into `pipeline/style/`.
- Whole-city DHMV is a large raster and tens of thousands of GetFeatureInfo calls. Use the binnenstad area until that is what you want.

## Skills

| Skill | Use when |
|---|---|
| `.claude/skills/fetch-flemish-data` | Downloading GRB, DHMV, orthophoto, OSM |
| `.claude/skills/build-ground-scene` | Terrain, ground features, 3D scene bins |
| `.claude/skills/render-tiles` | Headless three.js tiles |
| `.claude/skills/paint-tiles` | Image-model repaint and geometry check |
| `.claude/skills/export-preview` | AVIF pyramid and `npm run dev` |
| `.claude/skills/publish-r2` | Upload the cache, deploy the site |
| `.claude/skills/add-region` | A new area or a new camera |
| `.claude/skills/test-viewer` | uitest, perf, tour |
