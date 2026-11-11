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
| `pipeline/src/paint.ts`, `gemini.ts`, `paintqa.ts` | Optional Gemini repaint. Batch API above 12 windows. `register.ts` checks geometry |
| `pipeline/src/export.ts` | AVIF pyramid into `data/web/regions/kortrijk/` |
| `pipeline/src/hosting.ts` | R2 bucket `simkortrijk`, default `TILES_ORIGIN` (its r2.dev URL) |
| `web/` | Astro viewer. `/` and `/kortrijk` |
| `pipeline/style/` | Style C (pastel game-like). `reference.png` is the painted Grote Markt tile. `trees.png` is mint/sage crowns. Not Tel Aviv imagery. |
| `.claude/skills/` | One skill per step |

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

## Secrets

None for fetch, render, export or `npm run dev`.

| Name | When |
|---|---|
| `PAINT_PROVIDER` | `gemini` (default), `codex`, or `openai` |
| `GEMINI_API_KEY` | Default painter. Image edits on `gemini-nano-banana-2.1` |
| `GEMINI_IMAGE_MODEL` | Optional. Default `gemini-nano-banana-2.1` |
| `OPENAI_API_KEY` | Only if `PAINT_PROVIDER=openai` |
| `OPENAI_IMAGE_MODEL` | Optional, default `gpt-image-1` |
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
- Paint style is variant C: blush and coral roofs, peach and cream walls, mint and sage trees, pale lavender streets. The prompt in `paint.ts` is the geometry lock plus that paragraph. Flat LOD1 roofs stay flat; tile colour is allowed, new hips and ridges are not.
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
