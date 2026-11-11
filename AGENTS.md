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

The live map is 29 tiles of `kortrijk-binnenstad`. Six are painted (style A, OpenAI `gpt-image-2.6-flare`): `tx` -2..0 × `ty` -2..-1, the Broeltorens. Window `-2_-3` is skipped and stays render. The rest is unpainted render. Paint files are in `data/derived` (not in git) and on R2.

New painting should use `PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare` (about $0.09 a window). Try `flare` before `sunburst`; only use `gpt-image-2.6-sunburst` if Tom says so. Gemini is still the code default. Use `PAINT_ATTEMPTS=1` and check windows by eye while `roofNovelty` fails every window.

Before painting the Broeltorens windows, run `python3 pipeline/landmarks/broeltorens/edit_broel.py`, then `--restore` afterwards. Assemble that block with `python3 pipeline/tools/assemble_block.py --skip -2_-3`. A 3×3 there:

```sh
PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare PAINT_ATTEMPTS=1 \
  npm run paint -- kortrijk-binnenstad --near 50.83049,3.26704 --radius 1 --center 50.83049,3.26704 --interactive -j 3
```

Next, in order: (1) landmark render fixes, Sint-Maartenskerk first; (2) per-building roof and wall colours; (3) `roofNovelty` still fails (0.07–0.29 vs 0.04); (4) colour-match land and river windows; (5) squat Broeltorens cones, and the beige quay downstream of the Broelbrug should be water; (6) paint the rest outward, export, `npm run dev`, and publish only if Tom asks (`npm run publish -- kortrijk --yes --keep`; tiles-only needs no redeploy); (7) optional area `kortrijk`, and a custom domain only if Tom asks. Detail is in `CLAUDE.md`.

## Commands

```sh
npm run binnenstad
npm run dev
```

Areas live in `pipeline/src/areas.ts`. `kortrijk-binnenstad` is the 800 m patch. `kortrijk` is the municipality and uses the same camera.
