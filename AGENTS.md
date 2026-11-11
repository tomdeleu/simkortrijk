# SimKortrijk: guide for agents

Isometric Kortrijk from Flemish open data. Read [README.md](README.md), [ATTRIBUTION.md](ATTRIBUTION.md) and, for Claude Code, [CLAUDE.md](CLAUDE.md). Skills for each pipeline step are in `.claude/skills/`.

The code is adapted from [Isometric World](https://github.com/krasun/isometricworld) (Dmytro Krasun, MIT). Do not copy his tiles, video or `pipeline/style` images.

## Hard rules

1. Open data only in anything that ends up in the map or the repo. Proprietary imagery (Google Street View / Maps, Apple, Bing) may be **looked at** to read off the shape, proportions and colours of a building (Tom's decision, 2026-11-11), the way you would look at the real square. It is never stored in the repo, never sent to a paint model, never traced, composited or used as a style image, and never a source of geometry or heights (those come from GRB, 3D GRB, DHMV and OSM).
2. Credit every source. The footer and `places.ts` `credits` must keep `Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen` and `© OpenStreetMap contributors`.
3. Do not change `origin` or `headingDeg` for a region that already has tiles.
4. Do not delete `data/derived/` (renders and any paintings) or `data/web-state/`. `data/web/` is only the unpublished cache.
5. `npm run publish` and `npm run deploy` write to the live bucket and site. Run them only when asked.
6. In Cloudflare, only touch R2 bucket `simkortrijk` and Worker `simkortrijk`. Never change other buckets, workers, domains, DNS, or settings. Never delete objects outside `regions/kortrijk/`. A custom domain on the bucket only if Tom asks.

## Paint status

- **Paint one piece at a time, with Tom in the loop.** Before each piece: show `docs/paint-status.png`, propose tiles, landmarks, render fixes, cost and useful references, and wait for Tom's go and any reference material he adds. After each piece: update the piece table and summary in `docs/PAINT_STATUS.md` and regenerate `docs/paint-status.png`. Full rule in `docs/PAINT_STATUS.md` ("Working rule").

Single source of truth: [docs/PAINT_STATUS.md](docs/PAINT_STATUS.md). Update it after every paint run and every publish. As of 2026-11-11: 8 of 29 tiles painted (27.6%, all live), and windows `-2_-3` / `-1_-3` are excluded.

The live map (published 2026-11-11) is 29 tiles of `kortrijk-binnenstad`, rendered with per-building colours and the Sint-Maartenskerk massing. Six tiles are painted in **Style A + real colours** with OpenAI `gpt-image-2.6-flare`: `tx` -2..0 × `ty` -2..-1, the Broeltorens block. Windows `-2_-3` and `-1_-3` (mostly empty map edge) are skipped and stay render. The rest is unpainted render. Paint files are in `data/derived` (not in git) and on R2. Restore points (live, previous coral GPT, pre-colour snapshot, Gemini) are listed in `CLAUDE.md` under "Where the binnenstad paint stands".

## Style (live): Style A + real colours

Read `.claude/skills/map-style/SKILL.md` before changing colours, the prompt, `pipeline/style/` or a landmark.

- Look: pastel, game-like and high-contrast. Water is `#2F7FD6`, cones are slate blue-grey `#6B7A90`, trees mint and sage.
- Colours: every building keeps its own roof and wall colour from the Digitaal Vlaanderen orthophoto, softened halfway to pastel (`--soften 0.5`; 0.35 is more realistic, 0.65 more pastel).
  - Roofs: terracotta and brown tiles, slate, grey and light flat.
  - Walls: red, brown and buff brick, whitewash, pale stone.
  - The tone stays light, and neighbours stay distinguishable.
- Shapes: gables come from DHMV. Landmarks are researched in `pipeline/landmarks/<slug>/` and fixed with `massing.json` or a render edit.
- Painting: the style image is `pipeline/style/reference.png` (the coloured Broeltorens window). The painter is `gpt-image-2.6-flare` with `PAINT_ATTEMPTS=1`.
- Don't: no all-coral roofs and no recolouring. Don't paint windows that are mostly empty map edge. Paint centre-out with neighbour strips for seams.

New painting should use `PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare` (about $0.09 a window). Try `flare` before `sunburst`; only use `gpt-image-2.6-sunburst` if Tom says so. Gemini is still the code default. Use `PAINT_ATTEMPTS=1` and check windows by eye while `roofNovelty` fails every window.

Before rendering, run `python3 pipeline/tools/building_colours.py` (per-building colours, softened half-way to pastel with `--soften 0.5`, and LiDAR gables), then `npm run scene` (also builds landmark `massing.json` parts such as Sint-Maartenskerk) and `npm run render -- kortrijk-binnenstad --force`. Before painting the Broeltorens windows, run `python3 pipeline/landmarks/broeltorens/edit_broel.py`, then `--restore` afterwards. Assemble that block with `python3 pipeline/tools/assemble_block.py --skip=-2_-3,-1_-3`. A 3×3 there:

```sh
PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare PAINT_ATTEMPTS=1 \
  npm run paint -- kortrijk-binnenstad --near 50.83049,3.26704 --radius 1 --center 50.83049,3.26704 --interactive -j 3
```

Next, in order: (1) landmark render fixes (Sint-Maartenskerk done via `massing.json`; Belfort next); (2) per-building colours are done and live; (3) `roofNovelty` still fails (0.07–0.29 vs 0.04); (4) colour-match land and river windows; (5) squat Broeltorens cones, and the beige quay downstream of the Broelbrug should be water; (6) paint the rest outward, export, `npm run dev`, and publish only if Tom asks (`npm run publish -- kortrijk --yes --keep`; tiles-only needs no redeploy); (7) optional area `kortrijk`, and a custom domain only if Tom asks. Detail is in `CLAUDE.md`.

## Commands

```sh
npm run binnenstad
npm run dev
```

Areas live in `pipeline/src/areas.ts`. `kortrijk-binnenstad` is the 800 m patch. `kortrijk` is the municipality and uses the same camera.
