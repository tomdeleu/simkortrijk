# SimKortrijk

An isometric map of Kortrijk you can pan and zoom. Buildings, streets and trees sit where they really are. The picture is a 3D render from Flemish open data; an optional image model repaints each window of that render in one illustrated style, checked so nothing moves.

The pipeline and the viewer are adapted from [Isometric World](https://github.com/krasun/isometricworld) by Dmytro Krasun (MIT). This repository keeps that licence ([LICENSE](LICENSE)). It does **not** include his map tiles, video or style images: those stay with his data credits, and [ATTRIBUTION.md](ATTRIBUTION.md) in his repository says not to reuse them. The style sheets in `pipeline/style/` are original placeholders drawn for Kortrijk.

Live reference for the look: [isometric Tel Aviv](https://isometricworld.dmytrokrasun.com/tel-aviv-yafo).

## What you get

The region is one flat map centred on the Belfort. This run builds the **binnenstad**: about 800 m around the Belfort (Grote Markt, Sint-Maartenskerk, Onze-Lieve-Vrouwekerk, Begijnhof, Broeltorens, Leie quays). The same camera and commands cover the whole municipality (`kortrijk` in `pipeline/src/areas.ts`, on the order of 54,000 buildings). Do not change `origin` or `headingDeg` in `pipeline/src/places.ts` after tiles exist.

## Quick start

Node 22.23 or newer, and Chrome or Chromium (auto-detected; or set `CHROME_PATH`). No API key is required to fetch, render and preview.

```sh
npm install
npm run binnenstad          # boundaries, fetch, ground, scene, render, export
npm run dev                 # http://localhost:4321/  and  /kortrijk
```

`npm run dev` serves `data/web/` (the export cache). It does not need Cloudflare. Keys: **B** borders, **T** traffic, **P** the raw render, **I** is unused here, **V** video mode (`?video`). Links: `?at=50.8276,3.2656,0.8` and `#metro`.

## Pipeline

```sh
npm run boundaries -- kortrijk
npm run fetch -- kortrijk-binnenstad
npm run ground -- kortrijk-binnenstad
npm run scene -- kortrijk-binnenstad
npm run render -- kortrijk-binnenstad -j 2
npm run paint -- kortrijk-binnenstad --plan          # optional; see Painting
npm run export -- kortrijk-binnenstad
npm run dev
```

| Step | File | What it does |
|---|---|---|
| camera | `pipeline/src/camera.ts` | One orthographic camera per region, 45° down, 0.25 m/px, local East-North-Up at the Belfort, heading 20°. |
| fetch | `pipeline/src/fetch.ts`, `trees.ts`, `flanders.ts` | GRB footprints, 3D GRB heights, DHMV II DSM/DTM, orthophoto crowns, OSM ground, roads and trees. |
| ground | `pipeline/src/ground.ts` | DHMV II DTM as the terrain grid. GRB roads and water plus OSM parks, paths and lanes. |
| scene | `pipeline/src/scene.ts` | Buildings extruded on the terrain. Spires that 3D GRB flattens are cut from the LiDAR canopy. |
| render | `pipeline/src/render.ts`, `pipeline/page/renderer.ts` | Headless Chrome and three.js. One colour tile and one height tile per window. No network. |
| paint | `pipeline/src/paint.ts` | Optional. Repaints every 1024 px window and checks it against the render. |
| export | `pipeline/src/export.ts` | AVIF pyramid into `data/web/regions/kortrijk/`. Unpainted tiles use the 3D render. |
| web | `web/` | Astro + OpenSeadragon. Traffic, a few cats and parakeets, on top of the tiles. |

`data/` is gitignored. Delete `data/derived/<area>/` only when you mean to throw away renders. Paintings, once you have them, live there too.

## Painting

Not run in the default build. The viewer shows the render until a painter fills `data/derived/<area>/paint/`.

Two providers, chosen with `PAINT_PROVIDER` (see `.env.example`):

- `codex` (default). The [Codex CLI](https://github.com/openai/codex) on `PATH`, logged into ChatGPT. No API key. This is the upstream tool.
- `openai`. Secret **`OPENAI_API_KEY`**. Optional `OPENAI_IMAGE_MODEL` (default `gpt-image-1`). Calls `POST https://api.openai.com/v1/images/edits` with the render, the height pass, `pipeline/style/reference.png` and `pipeline/style/trees.png`.

```sh
npm run paint -- kortrijk-binnenstad --near 50.82757,3.26562 --radius 1   # a few windows around the Belfort
npm run paint -- kortrijk-binnenstad -j 2                                  # the whole binnenstad
npm run export -- kortrijk-binnenstad
```

Each window is registered back onto the render (`pipeline/src/register.ts`). A weak match or a black band is repainted, up to three times. Replace the placeholder style sheets with a painted Flemish reference before spending on the whole city. A binnenstad paint is a few dollars; the municipality is larger (see the scale notes below).

## Publishing

Map tiles are not in git. Create an R2 bucket named `simkortrijk-tiles` (not the Isometric World bucket) and set:

| Variable | Used by |
|---|---|
| `TILES_ORIGIN` | Public origin of the bucket. Dev falls back to it for tiles missing from the cache. Production pages load it directly. |
| `CLOUDFLARE_ACCOUNT_ID` | `npm run publish`, `npm run deploy` |
| `CLOUDFLARE_API_TOKEN` | R2 write. If unset, publish uses `npx wrangler login`. |
| `SITE_DOMAIN` | `npm run deploy` |
| `PIRSCH_ACCESS_KEY` | Optional analytics on the Worker (`npx wrangler secret put PIRSCH_ACCESS_KEY`). |

```sh
npm run publish -- kortrijk          # asks first; --yes to skip; --keep to leave the cache
npm run deploy                       # builds the site onto SITE_DOMAIN
```

Publish only when you mean to update the live bucket.

## Data

Shown on the map: **Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen**, plus **© OpenStreetMap contributors** where OSM is used.

| Source | Used for |
|---|---|
| [GRB WFS](https://geo.api.vlaanderen.be/GRB/wfs) GBG, GBA, KNW, WBN, WTZ | Footprints, road polygons, water |
| [3D GRB WMS](https://geo.api.vlaanderen.be/3DGRB/wms) `GRBGEBL1D2` | Height above ground (`HN_P99`). Covers buildings in the 2015 survey; later buildings are missing. |
| [DHMV II WCS](https://geo.api.vlaanderen.be/DHMV/wcs) `DHMVII_DSM_1m`, `DHMVII_DTM_1m` | Gap-fill heights, terrain, and spires (Sint-Maartenskerk, Belfort) that 3D GRB flattens |
| [OMZ WMS](https://geo.api.vlaanderen.be/OMZ/wms) `OMZNIR24VL` (summer 2024, 25 cm, requested at 0.5 m) | Tree crowns, with nDSM > 3 m. No Google imagery. |
| OpenStreetMap (Overpass) | Ground, traffic roads, church tags, `natural=tree` for young street trees |

Details and the credit line: [ATTRIBUTION.md](ATTRIBUTION.md).

Geoid: TAW + 43.5 m ≈ ellipsoid height at Kortrijk (`GEOID_M` in `pipeline/src/heights.ts`). One constant is enough inside the municipality.

## Whole city

`areas.ts` already has `kortrijk` (the municipality bbox). Same region origin, so it lines up with the binnenstad.

```sh
npm run fetch -- kortrijk
npm run ground -- kortrijk && npm run scene -- kortrijk
npm run render -- kortrijk -j 2
npm run export -- kortrijk-binnenstad kortrijk
```

Expect a long fetch: on the order of 54,000 building-height lookups (the binnenstad run did about 30 per second, and `data/raw/<area>/3dgrb.json` resumes). DHMV for the whole municipality is a large raster. Render tiles grow from a few dozen to several hundred. Paint after you are happy with a binnenstad sample. Hosting still fits a small R2 bucket; put `TILES_ORIGIN` in `.env` before you publish.

Neighbouring towns (Kuurne, Harelbeke, …) can share this region: add them to `municipalities` in `places.ts`, run `npm run boundaries -- kortrijk`, and add areas. Anything much beyond ~150 km needs its own region.

## Claude Code

[CLAUDE.md](CLAUDE.md) is the project guide. Task skills live in `.claude/skills/`.

## Licence

Code: [MIT](LICENSE), Copyright (c) 2026 Dmytro Krasun, adapted here for Kortrijk. Map imagery you generate is yours to licence together with the data credits in [ATTRIBUTION.md](ATTRIBUTION.md).
