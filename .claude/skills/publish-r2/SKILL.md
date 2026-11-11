---
name: publish-r2
description: Upload a SimKortrijk export cache to Cloudflare R2 and optionally deploy the Astro site. Use only when the user explicitly asked to publish or deploy. Do not point this at the Isometric World bucket.
---

# Publish to R2

Outward-facing. Do not run this because a local preview looks finished. The user has to ask.

The bucket name is `simkortrijk-tiles` (`pipeline/src/hosting.ts`). Create that bucket in the user's Cloudflare account. Do not upload into `isometricworldtiles`.

## Commands

```sh
npm run publish -- kortrijk
npm run deploy
```

`publish` asks `publish? [y/N]`. `--yes` skips the question (only after the user said to publish). `--keep` leaves `data/web/` in place; the default deletes the cache after a checked upload.

Order inside `pipeline/src/publish.ts`: tiles and previews first, `world.json` last. Each object is checked (stored size equals local size). The published manifest is copied to `data/web-state/kortrijk.json`.

`npm run deploy` runs `npm run build`, then `wrangler deploy` on `SITE_DOMAIN` (`pipeline/src/deploy.ts`). Deploy after every publish so the HTML picks up new hashed filenames. The site still works without that redeploy (the viewer reads live `world.json`), but preloads and the preview image go stale.

## Env

| Name | Required | Secret |
|---|---|---|
| `TILES_ORIGIN` | Yes for publish | No. Public bucket origin, no trailing slash. |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Account id, not a token. |
| `CLOUDFLARE_API_TOKEN` | Yes, unless `npx wrangler login` has been done | R2 Object Read & Write on `simkortrijk-tiles`. |
| `SITE_DOMAIN` | Yes for deploy | No. Hostname only, e.g. `maps.example.com`. |
| `PIRSCH_ACCESS_KEY` | No | Worker secret for analytics. `npx wrangler secret put PIRSCH_ACCESS_KEY`. The site runs without it. |

Copy names from `.env.example`. Never commit `.env`.

## Verify

- Publish prints an upload count and does not exit on a size mismatch.
- `curl -I "$TILES_ORIGIN/regions/kortrijk/data/world.json"` returns 200.
- A production build with `TILES_ORIGIN` set loads `/kortrijk` from that origin, and the footer credits are still the Flemish line plus OpenStreetMap.
- Local `npm run dev` after a publish with the cache deleted should proxy `/regions/` to `TILES_ORIGIN`. If `TILES_ORIGIN` is unset, dev only serves files still in `data/web`.
