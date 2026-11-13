# Partial paint block

`assemble_block.py` turns a finished rectangle of paint windows into `paint/` tiles. Inside the block, windows blend with the usual 64 px overlap. At the edge, where the next tile is still the raw render, the paint feathers out over about 220 px. `npm run paint -- --assemble` does not do that edge: it only blends windows, so a half-painted map gets a hard seam. Use this instead, then export.

Broeltorens block (the six tiles that are painted on the live map):

```sh
pip install pillow numpy scipy
python3 pipeline/tools/assemble_block.py
```

That reads `data/derived/kortrijk-binnenstad/windows/{i}_{j}.png` for `i` in -2..0 and `j` in -3..-1, and writes `paint/{tx}_{ty}.png` for `tx` in -2..0 and `ty` in -2..-1. Another block:

```sh
python3 pipeline/tools/assemble_block.py --windows=-1..1,-1..1 --tiles=-1..1,-1..0 --feather=220
```

A window that will not paint right (wrong geometry after retries) can be left out with `--skip=i_j[,i_j]`: that area stays render and the paint feathers into it. The live Broeltorens block uses `--skip=-2_-3,-1_-3` (both mostly empty map edge; GPT invents a city there).

`--base` points at another derived directory. Windows and render tiles must already be on disk. This does not call Gemini and does not publish.

# Building colours and gable roofs

`building_colours.py` gives every GRB footprint its own wall and roof colour and, where LiDAR shows a pitched roof, a gable. `npm run scene` reads the result; without it the render falls back to the fixed style palette.

```sh
pip install pillow numpy opencv-python-headless pyproj
python3 pipeline/tools/building_colours.py      # after `npm run fetch`, before `npm run scene`; --soften 0.5 is the default
npm run scene -- kortrijk-binnenstad && npm run render -- kortrijk-binnenstad --force
```

Roof colour, in order: OSM `roof:colour` / `roof:material` (almost never set in Kortrijk: 2 of 5 756 buildings), then the median sunlit colour inside the footprint on the Digitaal Vlaanderen winter orthophoto OMWRGB25VL (2025, fetched at 25 cm, cached in `data/raw/<area>/ortho/`), pulled half-way to the nearest roof class (terracotta, brown tile, slate, dark/grey/light flat, green, copper). Churches get slate. Walls come from OSM `building:colour` or a Flemish palette (red and brown brick, whitewash, buff brick, grey paint; stone for churches and public buildings; light render for big flat blocks), with a small per-house jitter.

Gables: DHMV II 1 m DSM inside the footprint. A footprint gets a gable when the nDSM spreads more than 2 m and a tent fit across one axis of its minimum-area rectangle explains it (R² ≥ 0.35). Non-rectangular footprints (churches, L-shapes) stay flat; see `pipeline/landmarks/` for those.

Output `data/raw/<area>/building_colours.json`, keyed by GRB OIDN. This does not call Gemini and does not publish.

Softening: measured colours are photo-real and read dark next to style A (Tom, 11 Nov 2026: "ergens tussen, nu te donker en te realistisch"). `--soften` (or `COLOUR_SOFTEN`, default 0.5) moves each colour half-way to the pastel twin of its class (`PASTEL_ROOF`, `PASTEL_WALL`) and keeps 60% of its offset from the class base, so neighbours stay different. 0 = measured, 1 = full pastel. The JSON keeps the measured colours as `wall_raw` / `roof_raw`.

Paint prompt (applied in `pipeline/src/paint.ts`): image 1 is described as already carrying each building's own colour; style A keeps image-1 colour families softened into the pastel palette; the geometry lock forbids recolouring all roofs alike or swapping colours between neighbours and keeps the ridges of sloped roof planes. `pipeline/style/reference.png` is now the coloured Broeltorens window `-1_-2` painted with that prompt (the old all-coral reference would pull every roof to coral).

## Piece helpers (`.claude/skills/paint-piece`)

| Tool | What it does |
|---|---|
| `landmarks_in_tiles.ts <tiles>` | Tile centres (lat/lon) and the named churches, heritage, towers and GRB footprints over 25 m in them |
| `landmark_measure.ts <OIDN>` | Footprint in (u, v) metres, `anchor`, `axis_deg` and a DHMV II nDSM grid, for a landmark `massing.json` |
| `landmark_refs.py <slug> --search ... --require Kortrijk --ortho lat,lon` | Commons photos (licence into `refs/SOURCES.md`) and an orthophoto crop |
| `window_check.py out.png <windows>` | Current render next to each paint window, for the eye check |
