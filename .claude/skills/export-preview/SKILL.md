---
name: export-preview
description: Export a SimKortrijk area to the local AVIF tile pyramid and open the dev viewer. Use after render or paint, when checking pan, zoom and attribution, or when rebuilding data/web.
---

# Export and preview

No Cloudflare account. With `TILES_ORIGIN` empty, the dev server only reads the local cache.

## Commands

```sh
npm run export -- kortrijk-binnenstad
npm run dev
```

Open `http://localhost:4321/` and `http://localhost:4321/kortrijk`. The dev server prints the port if 4321 is taken. Set `SITE_URL` in `.env` to that URL before the test scripts.

Export several areas of one region in one go: `npm run export -- kortrijk-binnenstad kortrijk`. `--data-only` rebuilds JSON (roads, borders, world) and skips image tiles.

`npm run og -- kortrijk` writes `web/public/og/kortrijk.jpg` from the cache. Optional.

## Inputs

`data/derived/<area>/manifest.json`, `render/`, `height/`, and `paint/` if any windows were painted. Borders need `data/raw/boundaries/kortrijk.json` (`npm run boundaries -- kortrijk`). Roads need `data/raw/<area>/roads.json`.

## Outputs

`data/web/regions/kortrijk/`

| Path | Contents |
|---|---|
| `tiles/map/{z}/{x}/{y}.avif` | Paint if present, otherwise the render |
| `tiles/photo/{z}/{x}/{y}.avif` | Render only (key **P**) |
| `data/world.json` | Camera, bounds, file names, credits |
| `data/tiles-map.<hash>.json`, `tiles-photo.<hash>.json` | Tile index. The viewer never requests a missing tile. |
| `data/borders.<hash>.json`, `data/roads.<hash>.json` | Borders and traffic |
| `preview/kortrijk-*.avif` | Opening view |

State for the next incremental export: `data/web/kortrijk.state.json`. Published state, once you publish: `data/web-state/kortrijk.json`.

Zoom 8 is 1:1 with the 1024 px render, split into 512 px web tiles. Lower zooms are built only from children that exist, so a first export does not call R2.

## Env

| Name | Required |
|---|---|
| `TILES_ORIGIN` | No for a complete local export. Set it when an incremental export must download a neighbour tile from R2. |
| `SITE_URL` | No for the viewer. Yes as the default URL for uitest, perf and tour. |

## Verify

- The export log reports a rendered-tile count and `files ready in data/web/regions/kortrijk`.
- `npm run dev` loads the map centred on the Belfort. Wheel zoom and drag work. The footer contains `Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen` and an OpenStreetMap link.
- `?at=50.82757,3.26562,0.6` frames the Grote Markt. **B** draws the municipality outline. **T** toggles traffic.
- A 404 in the network panel for `/regions/...` means that file was not exported, or `TILES_ORIGIN` is empty and the cache is incomplete.
