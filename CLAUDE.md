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
| `pipeline/style/` | Style A + real colours (see "Style" below). `reference.png` is the coloured Broeltorens window (-1_-2) painted with GPT 2.6 flare. `trees.png` is mint/sage crowns. Not Tel Aviv imagery. |
| `pipeline/tools/building_colours.py` | Per-building roof/wall colour (orthophoto, softened to pastel) and LiDAR gables, read by `scene.ts` |
| `pipeline/landmarks/` | Landmark research (notes, refs) and render fixes (`massing.json`, `edit_broel.py`) |
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

## Style: A + real colours (live)

Approved by Tom and live since 2026-11-11. The full spec is in `.claude/skills/map-style/SKILL.md`; read it before touching colours, the prompt, `pipeline/style/` or a landmark.

- Look: pastel, game-like isometric map with more contrast than plain pastel. Water is clear blue `#2F7FD6`, never teal. Cones and spires are slate blue-grey `#6B7A90`. Trees are mint and sage, streets pale lavender-grey, and the empty edge is cream paper.
- Real colours, softened: every building has its own roof and wall colour. `pipeline/tools/building_colours.py` takes it from OSM tags, else the Digitaal Vlaanderen winter orthophoto `OMWRGB25VL`, else a palette, then moves it halfway to the pastel version of its class: `--soften 0.5` / `COLOUR_SOFTEN=0.5`. 0.35 is more realistic and darker; 0.65 is more pastel and lighter.
  - Roofs: terracotta and brown clay tiles, slate blue-grey, grey and light flat roofs.
  - Walls: red, brown and buff brick, whitewash, pale stone.
  - The tone stays light, never dark, and neighbours stay distinguishable.
- Shapes: pitched roofs (gables) come from the DHMV II DSM. Landmarks are researched online (`pipeline/landmarks/<slug>/notes.md` + `refs/`) and fixed in the render with `massing.json` (Sint-Maartenskerk) or a render edit script (Broeltorens).
- Painting: `gpt-image-2.6-flare`, `PAINT_ATTEMPTS=1`. The style image `pipeline/style/reference.png` is the coloured Broeltorens window `-1_-2`. The prompt (`GEOMETRY_LOCK`, `STYLE_A`, `PROMPT` in `pipeline/src/paint.ts`) keeps each building's colour family and ridges, and takes colours from the render, not from the style image.
- Don't: no all-coral roofs and no old coral reference. Don't recolour or harmonise buildings, and don't paint windows that are mostly empty map edge (skip them in `assemble_block.py`). Keep seams invisible by painting centre-out with neighbour strips pasted in, then assembling with `assemble_block.py`.

## Cloudflare

Only touch R2 bucket `simkortrijk` and Worker `simkortrijk`. Never change any other bucket, worker, domain, DNS, or setting. Never delete objects outside `regions/kortrijk/`. A custom domain on the bucket only if Tom asks.

## Where the binnenstad paint stands

- **Paint one piece at a time, with Tom in the loop.** Before each piece: show `docs/paint-status.png`, propose tiles, landmarks, render fixes, cost and useful references, and wait for Tom's go and any reference material he adds. After each piece: update the piece table and summary in `docs/PAINT_STATUS.md` and regenerate `docs/paint-status.png`. Full rule in `docs/PAINT_STATUS.md` ("Working rule").

**`docs/PAINT_STATUS.md` is the single source of truth**: what is painted and what is not, the tile and window grid, cost, excluded windows, landmark status, and restore points. Update it (and `docs/paint-status.png`) after every paint run and every publish. In short, as of 2026-11-11: 6 of 29 binnenstad tiles are painted (20.7%), 23 are coloured render, and the municipality is not started.

Live since 2026-11-11, published to R2 in HD (native zoom 9, 0.125 m/px from `render-hd/`, AVIF q65; viewer reads `scale` from world.json): 29 tiles of `kortrijk-binnenstad`, rendered with per-building colours (`--soften 0.5`) and the Sint-Maartenskerk `massing.json`. Six are painted in **Style A + real colours** with **OpenAI `gpt-image-2.6-flare`** (quality high, input fidelity high, `PAINT_ATTEMPTS=1`): `tx` -2..0, `ty` -2..-1, the Broeltorens block. Windows `-2_-3` and `-1_-3` (mostly empty map edge) are skipped and stay render (`assemble_block.py --skip=-2_-3,-1_-3`). Cost was 11 calls, about $1. Windows and paint tiles live in `data/derived` (gitignored), and the published copies are on R2.

Restore points are on the build box (`/workspace/paintrun/`, not in git). Each holds `paint/`, `windows/` and `paint.json`; copy those into `data/derived/kortrijk-binnenstad/`, export, and publish only if Tom asks. `PUBLISH.md` in each folder has the exact commands.

| Folder | What it is |
|---|---|
| `styleA-colour-preview/` | The live version. Also holds its render, `building_colours.json` and the old coral reference. |
| `styleA-gpt/` | The previous coral GPT version. |
| `pre-colour-snapshot/kortrijk-binnenstad/` | Full derived folder before colours, including the uniform render. |
| `styleA-gemini-live/` | The Gemini version. |

`publish --keep` leaves older objects on R2.

Painter choice: use OpenAI `gpt-image-2.6-flare` for new painting (`PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare`). It copies the pasted neighbour strips far better than Gemini, so window seams are almost invisible (Gemini Nano Banana 2.1 left rectangular colour steps in the Leie and on roofs). About $0.09 per window. Tom asked to try `flare` first and not `sunburst`; only try `gpt-image-2.6-sunburst` if Tom says so. Use `PAINT_ATTEMPTS=1` and check windows by eye while `roofNovelty` still fails on every window. Every call's token usage is logged to `data/derived/<area>/openai-usage.jsonl`.

Known weakness of GPT: it follows the render literally. Where the render is wrong, GPT paints it wrong. Fix the render first (`pipeline/landmarks/<slug>/massing.json`, read by `npm run scene`; Sint-Maartenskerk is done that way), then repaint that window. GPT also invents a city in windows that are mostly empty map edge (`-1_-3`, `-2_-3`): leave those out of `assemble_block.py --skip`.

Before painting the Broeltorens block, run `python3 pipeline/landmarks/broeltorens/edit_broel.py` so the towers are cream stone with slate cones and the Broelbrug (OSM way 567818112) is drawn low between their feet. After the windows are accepted, `python3 pipeline/landmarks/broeltorens/edit_broel.py --restore` puts the raw render back. Assemble a partial block with `python3 pipeline/tools/assemble_block.py --skip=-2_-3,-1_-3` (about 220 px of feather into the surrounding render). Do not use `npm run paint -- --assemble` for a partial block: it leaves a hard seam.

A 3×3 around the towers:

```sh
PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare PAINT_ATTEMPTS=1 \
  npm run paint -- kortrijk-binnenstad --near 50.83049,3.26704 --radius 1 --center 50.83049,3.26704 --interactive -j 3
```

Next, in this order:

1. Landmarks. Sint-Maartenskerk is done (`massing.json`). Next: Belfort/Halletoren, Onze-Lieve-Vrouwekerk, Begijnhof, stadhuis, Leiebruggen, station... Notes and refs are already under `pipeline/landmarks/<slug>/`; add a `massing.json` (or a render edit like `edit_broel.py`), check the render, then repaint only that window with its painted neighbours pasted in.
2. Building colours: done. `python3 pipeline/tools/building_colours.py` (OSM tags, else the Digitaal Vlaanderen winter orthophoto, else a palette; gables from DHMV II; `--soften 0.5` pulls colours half-way to pastel) feeds `npm run scene`. The prompt keeps each building's colour family. See `pipeline/tools/README.md`.
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

- HD: `HD = 2` in `camera.ts`. `npm run render` writes `render/` (1024, for paint and tools) and `render-hd/` (2048) from one render; export builds z9 from the HD file and upscales a 1024 paint. Art px stay the coordinate system everywhere; only the pyramid and OpenSeadragon's image px are ×HD. Deploy a viewer change before publishing a `world.json` it does not understand.
- Cloudflare auth on Tom's Mac: the `CLOUDFLARE_API_TOKEN` in `.env` gets 403 on Workers and R2 for account `fa71ab6722bdece3cb45e84ff630e3c0`. Use the wrangler OAuth login instead: `npx wrangler deploy --env-file <empty file>`, and for publish `CLOUDFLARE_API_TOKEN=$(npx wrangler auth token) CLOUDFLARE_ACCOUNT_ID=fa71ab6722bdece3cb45e84ff630e3c0` (run `auth token` outside the repo so `.env` is not loaded). Build with `TILES_ORIGIN=https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev` so the site loads tiles from R2 like production.

- WFS 2.0 bbox for EPSG:4326 on this server is west,south,east,north. Geometries are lon, lat.
- DHMV GeoTIFFs are north-up (origin at the north edge, negative y scale). `flanders.ts` normalises row 0 = north.
- 3D GRB misses buildings newer than about 2015. Those keep a DHMV height. The binnenstad is roughly 6,500 footprints after dropping ramps and bridge decks.
- A failed height lookup is stored as `null` in `3dgrb.json` and that building uses DHMV. Keys already in the checkpoint are not requested again.
- Render uses software WebGL if there is no GPU (`--enable-unsafe-swiftshader`). `-j 2` is a safe default.
- `npm run dev` serves `/regions/...` from `data/web` first and proxies everything else to R2, so a fresh clone shows the published tiles with no export. With `TILES_ORIGIN=` (empty) it 404s `/regions/...` that are not in `data/web`. Export first. A production build with an empty origin reads that same cache; run `npm run build` after export so `web/dist/regions` exists before `npx wrangler deploy`.
- If Overpass is unreachable, `fetch` retries a second Overpass server and then the OSM map API (`api.openstreetmap.org/api/0.6/map.json`) for the same bbox. The map API is a fallback: it downloads every object and this repo filters it.
- `uitest` treats any HTTP 400+ as a failure, including a tile the index should not have requested.
- Paint style is "Style A + real colours" (section "Style" above, full spec in `.claude/skills/map-style`). Flat LOD1 roofs stay flat; sloped roof planes in the render are real gables and keep their ridges.
- `roofNovelty` in `register.ts` retries a paint when more than 4% of flat roof and wall interiors grow a strong new edge. Fine tile texture stays under that. Do not copy Tel Aviv style images into `pipeline/style/`.
- Whole-city DHMV is a large raster and tens of thousands of GetFeatureInfo calls. Use the binnenstad area until that is what you want.

## Skills

| Skill | Use when |
|---|---|
| `.claude/skills/fetch-flemish-data` | Downloading GRB, DHMV, orthophoto, OSM |
| `.claude/skills/build-ground-scene` | Terrain, ground features, 3D scene bins |
| `.claude/skills/render-tiles` | Headless three.js tiles |
| `.claude/skills/map-style` | The live look (Style A + real colours): colours, landmarks, prompt, do/don't |
| `.claude/skills/paint-tiles` | Image-model repaint and geometry check |
| `.claude/skills/export-preview` | AVIF pyramid and `npm run dev` |
| `.claude/skills/publish-r2` | Upload the cache, deploy the site |
| `.claude/skills/add-region` | A new area or a new camera |
| `.claude/skills/test-viewer` | uitest, perf, tour |
