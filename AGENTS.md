# SimKortrijk: guide for agents

Isometric Kortrijk from Flemish open data. Read [README.md](README.md), [ATTRIBUTION.md](ATTRIBUTION.md) and, for Claude Code, [CLAUDE.md](CLAUDE.md). Skills for each pipeline step are in `.claude/skills/`.

The code is adapted from [Isometric World](https://github.com/krasun/isometricworld) (Dmytro Krasun, MIT). Do not copy his tiles, video or `pipeline/style` images.

## Hard rules

1. Open data only. Never use Google, Apple, Bing or other proprietary imagery or geometry, not even as a style reference.
2. Credit every source. The footer and `places.ts` `credits` must keep `Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen` and `© OpenStreetMap contributors`.
3. Do not change `origin` or `headingDeg` for a region that already has tiles.
4. Do not delete `data/derived/` (renders and any paintings) or `data/web-state/`. `data/web/` is only the unpublished cache.
5. `npm run publish` and `npm run deploy` write to the live bucket and site. Run them only when asked.
6. In Cloudflare, only touch R2 bucket `simkortrijk` and Worker `simkortrijk`. Never change other buckets, workers, domains, DNS, or settings. Never delete objects outside `regions/kortrijk/`. A custom domain on the bucket only if Tom asks.

## Paint status

The live map is 29 tiles of `kortrijk-binnenstad`. Six are painted (style C, Nano Banana 2.1): `tx` -2..0 × `ty` -2..-1, the Broeltorens. The rest is unpainted render. Paint files are in `data/derived` (not in git) and on R2.

Before painting the Broeltorens windows, run `python3 pipeline/landmarks/broeltorens/edit_broel.py`, then `--restore` afterwards. Assemble a partial block with `python3 pipeline/tools/assemble_block.py` (~220 px feather into the render). A 3×3 there is `npm run paint -- kortrijk-binnenstad --near 50.83049,3.26704 --radius 1 --center 50.83049,3.26704 --interactive -j 3` (~33 calls, ~$1.10).

Next, in order: (1) `roofNovelty` fails every window (0.07–0.29 vs 0.04) and the third attempt is kept, so flat roofs get ridges — tighten the prompt or enforce it; (2) colour-match land windows, not only sea; (3) Broeltorens cones are a bit squat; (4) the beige quay downstream of the Broelbrug should be water in the source data; (5) then `npm run paint -- kortrijk-binnenstad`, export, `npm run dev`, and only if the user asks `npm run publish -- kortrijk --yes --keep`, `npm run build`, `npx wrangler deploy`; (6) optional area `kortrijk`; (7) custom domain only if Tom asks. Detail is in `CLAUDE.md`.

## Commands

```sh
npm run binnenstad
npm run dev
```

Areas live in `pipeline/src/areas.ts`. `kortrijk-binnenstad` is the 800 m patch. `kortrijk` is the municipality and uses the same camera.
