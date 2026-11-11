# SimKortrijk: guide for agents

Isometric Kortrijk from Flemish open data. Read [README.md](README.md), [ATTRIBUTION.md](ATTRIBUTION.md) and, for Claude Code, [CLAUDE.md](CLAUDE.md). Skills for each pipeline step are in `.claude/skills/`.

The code is adapted from [Isometric World](https://github.com/krasun/isometricworld) (Dmytro Krasun, MIT). Do not copy his tiles, video or `pipeline/style` images.

## Hard rules

1. Open data only. Never use Google, Apple, Bing or other proprietary imagery or geometry, not even as a style reference.
2. Credit every source. The footer and `places.ts` `credits` must keep `Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen` and `© OpenStreetMap contributors`.
3. Do not change `origin` or `headingDeg` for a region that already has tiles.
4. Do not delete `data/derived/` (renders and any paintings) or `data/web-state/`. `data/web/` is only the unpublished cache.
5. `npm run publish` and `npm run deploy` write to the live bucket and site. Run them only when asked.

## Commands

```sh
npm run binnenstad
npm run dev
```

Areas live in `pipeline/src/areas.ts`. `kortrijk-binnenstad` is the 800 m patch. `kortrijk` is the municipality and uses the same camera.
