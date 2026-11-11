---
name: publish-r2
description: Deploy SimKortrijk as the Cloudflare Worker `simkortrijk` (npx wrangler deploy) and upload tiles to the R2 bucket `simkortrijk`. Use only when the user explicitly asked to deploy or publish.
---

# Deploy

Outward-facing. Do not deploy because a local preview looks finished. The user has to ask.

In Cloudflare, only touch R2 bucket `simkortrijk` and Worker `simkortrijk`. Never change any other bucket, worker, domain, DNS, or setting. Never delete objects outside `regions/kortrijk/`. Do not add a custom domain on the bucket unless Tom asks.

The live map is 29 tiles of `kortrijk-binnenstad` on that bucket. Six are painted (`tx` -2..0, `ty` -2..-1, the Broeltorens, style C). The rest is unpainted render. After the rest is painted and the user has asked, the sequence is `npm run export -- kortrijk-binnenstad`, `npm run dev` to look, then:

```sh
npm run publish -- kortrijk --yes --keep
npm run build
npx wrangler deploy
```

## Deploy as one Worker (no R2)

Tiles and pages are the same Worker. `wrangler.jsonc` sets `name` to `simkortrijk`, `workers_dev` to true, and `assets.directory` to `./web/dist`. By default tiles come from R2 (see below). Only with `TILES_ORIGIN=` (empty) does the build copy the export cache into `web/dist` so the browser loads `/regions/...` from the Worker.

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

The bucket is `simkortrijk` (`pipeline/src/hosting.ts`), public at https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev with CORS GET/HEAD from any origin. That URL is the default `TILES_ORIGIN`, so `npm run dev` (fresh clone, no export) and `npm run build` load these tiles; the build then skips copying tiles into `web/dist`. Upload before you deploy: Do not upload into `isometricworldtiles`.

```sh
npm run publish -- kortrijk
```

`publish` asks `publish? [y/N]`. `--yes` skips the question (only after the user said to publish). `--keep` leaves `data/web/` in place; the default deletes the cache after a checked upload.

Order inside `pipeline/src/publish.ts`: tiles and previews first, `world.json` last. Each object is checked (stored size equals local size). The published manifest is copied to `data/web-state/kortrijk.json`.

Leave `TILES_ORIGIN` unset so the site keeps loading this bucket. Set `TILES_ORIGIN=` (empty) only when tiles should be copied into the Worker instead.

| Name | Required | Secret |
|---|---|---|
| `TILES_ORIGIN` | No | No. Default https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev. Empty for the Worker bundle. Prefer a custom domain for production; r2.dev is rate-limited. |
| `CLOUDFLARE_ACCOUNT_ID` | For publish | Account id, not a token. |
| `CLOUDFLARE_API_TOKEN` | For publish, unless `npx wrangler login` | R2 Object Read & Write on `simkortrijk`. |
| `SITE_DOMAIN` | No | Custom hostname for `npm run deploy`. |
| `PIRSCH_ACCESS_KEY` | No | Worker secret for analytics. |

Copy names from `.env.example`. Never commit `.env`.
