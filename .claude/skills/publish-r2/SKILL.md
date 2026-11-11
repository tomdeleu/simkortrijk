---
name: publish-r2
description: Deploy SimKortrijk as one Cloudflare Worker with tiles in the static assets (npx wrangler deploy, no R2), or upload the tile cache to R2. Use only when the user explicitly asked to deploy or publish.
---

# Deploy

Outward-facing. Do not deploy because a local preview looks finished. The user has to ask.

## Deploy as one Worker (no R2)

Tiles and pages are the same Worker. `wrangler.jsonc` sets `name` to `simkortrijk`, `workers_dev` to true, and `assets.directory` to `./web/dist`. Leave `TILES_ORIGIN` empty so the build reads the export cache and the browser loads `/regions/...` from the Worker, not from a bucket.

```sh
npm run binnenstad
npm run build
npx wrangler login
npx wrangler deploy
```

What each step does:

1. `npm run binnenstad` fetches, renders, and exports into `data/web/regions/kortrijk`.
2. `npm run build` runs Astro, then `scripts/copy-regions.mjs`, which copies `data/web/regions` to `web/dist/regions`. With `TILES_ORIGIN` empty, `MapPage.astro` reads `data/web/regions/<region>/data/world.json` during the build, so the HTML preloads `tiles-map.<hash>.json` and the city preview. It must not preload `tiles.json` or `borders.json`.
3. `npx wrangler login` once, in a browser.
4. `npx wrangler deploy` from the repo root. Wrangler prints `https://simkortrijk.<account>.workers.dev`.

`npm run deploy` is that same `npx wrangler deploy`. If `SITE_DOMAIN` is set, it also passes `--domain`. The workers.dev URL works without `SITE_DOMAIN`.

No `CLOUDFLARE_API_TOKEN` is required after `wrangler login`. `PIRSCH_ACCESS_KEY` is optional (`npx wrangler secret put PIRSCH_ACCESS_KEY`); the site runs without it.

## Verify

- `web/dist/index.html` contains `tiles-map.` and does not reference `tiles.json` as the preload.
- `web/dist/regions/kortrijk/data/world.json` exists, and `web/dist/regions/kortrijk/tiles/map/` has avif files.
- The workers.dev URL shows the binnenstad, pan and zoom work, and the footer still names Digitaal Vlaanderen and OpenStreetMap.
- A tile request in the network panel is same-origin (`/regions/kortrijk/tiles/...`), not another host.

## Upload tiles to R2

Optional. The bucket name is `simkortrijk-tiles` (`pipeline/src/hosting.ts`). Do not upload into `isometricworldtiles`.

```sh
npm run publish -- kortrijk
```

`publish` asks `publish? [y/N]`. `--yes` skips the question (only after the user said to publish). `--keep` leaves `data/web/` in place; the default deletes the cache after a checked upload.

Order inside `pipeline/src/publish.ts`: tiles and previews first, `world.json` last. Each object is checked (stored size equals local size). The published manifest is copied to `data/web-state/kortrijk.json`.

Set `TILES_ORIGIN` to the bucket’s public origin before the next `npm run build` if the site should load tiles from R2 instead of the bundle. Then redeploy.

| Name | Required | Secret |
|---|---|---|
| `TILES_ORIGIN` | Only for R2 | No. Public origin, no trailing slash. Empty for the Worker bundle. |
| `CLOUDFLARE_ACCOUNT_ID` | For publish | Account id, not a token. |
| `CLOUDFLARE_API_TOKEN` | For publish, unless `npx wrangler login` | R2 Object Read & Write on `simkortrijk-tiles`. |
| `SITE_DOMAIN` | No | Custom hostname for `npm run deploy`. |
| `PIRSCH_ACCESS_KEY` | No | Worker secret for analytics. |

Copy names from `.env.example`. Never commit `.env`.
