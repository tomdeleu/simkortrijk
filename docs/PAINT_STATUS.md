# Paint status (single source of truth)

What is painted on the live map and what is not. **Update this file after every paint run and every publish**: the tile grid, the numbers, the date and the landmark table. Read the facts off the data, not from memory:
- `data/derived/kortrijk-binnenstad/paint/`: which tiles are painted.
- `windows/`: which windows exist.
- `openai-usage.jsonl`: calls, model and time.
- `manifest.json`: the tile list.
- The `npm run export` log line `N rendered, M painted tiles`.

Regenerate `docs/paint-status.png` when the grid changes.

Last updated: **2026-11-11**, after the HD publish of about 17:32 CET (1 277 files to R2 bucket `simkortrijk`, region `kortrijk`). The 16:23 publish before it was the same map at z8.

![Paint status: painted tiles outlined in red, render-only tiles greyed, landmarks by priority, the proposed next piece dashed blue](paint-status.png)

## Working rule: one piece at a time (Tom, 2026-11-11)

The map is painted in **pieces** (`stukken`): a few neighbouring tiles, or one landmark fix plus its repaint. For every piece:

1. **Propose before painting.** Show `docs/paint-status.png` and give the tiles and windows, the landmarks in them and their render fixes, the estimated calls and cost, and which reference material would help (photos of the facades that face the camera, i.e. south-south-west, since the camera looks along heading 20°).
2. **Wait for Tom.** He approves, changes the scope, and may add reference material (into `pipeline/landmarks/<slug>/refs/`, listed in `refs/SOURCES.md`; his own photos may go into a paint request, Commons images only if their licence allows). No paint call before his go.
3. **Do the piece**: render fixes, check the render with Tom where a landmark changed, paint, check the windows by eye, assemble, export, and show the result before publishing.
4. **Record progress** right after: the piece table and the summary in `docs/PAINT_STATUS.md` (tiles painted, % of the binnenstad, calls and cost, date), and regenerate `docs/paint-status.png`. Then propose the next piece.

## Pieces

| # | Piece | Tiles | Landmarks | Status | Calls / cost | Date |
|---|---|---|---|---|---|---|
| 0 | Broeltorens block | `-2_-2` `-1_-2` `0_-2` `-2_-1` `-1_-1` `0_-1` | Broeltorens + Broelbrug, Sint-Maartenskerk (fixed); Belfort, stadhuis, OLV-kerk, Begijnhof, Buda, Collegebrug, Groeningeabdij painted from the uncorrected render | **done**, live | 11 / ~$0.98 | 2026-11-11 |
| 1 | Grote Markt | repaint the Belfort and stadhuis windows in `-1_-1` / `0_-1`; paint `-1_0` `0_0` | Belfort, historisch stadhuis (P1, render fix first); Stadsschouwburg, station (P2) | **in progress**: approved by Tom; Belfort and stadhuis render fixed, render check with Tom; no paint calls yet | ~10 / ~$0.90 (estimate) | 2026-11-11 |

Progress: **6 of 29** binnenstad tiles painted (20.7%).

## Summary

| | |
|---|---|
| Area on the live map | `kortrijk-binnenstad` only (bbox 50.820387,3.254240 – 50.834760,3.276994, about 800 m) |
| Render tiles (1024 px, 0.25 m/px, 256 m) | **29**, `tx` -4..3 × `ty` -3..2 (irregular, see grid) |
| Web resolution | **HD**: native zoom 9 at 0.125 m/px from `render-hd/` (2048 px per tile), AVIF q65. The 6 painted tiles are 1024 px paint upscaled: they are no sharper than before until they are repainted at 2K into `paint-hd/`. |
| Painted tiles | **6**: `tx` -2..0 × `ty` -2..-1, the Broeltorens / Grote Markt / Sint-Maarten block |
| Render-only tiles | **23**, showing the coloured 3D render (per-building colours, `--soften 0.5`), not painted |
| Coverage | **20.7%** of the binnenstad map (6 of 29 equal tiles, all fully inside the map) |
| Style | Style A + real colours (`.claude/skills/map-style`) |
| Painter | OpenAI `gpt-image-2.6-flare`, quality high, input fidelity high, `PAINT_ATTEMPTS=1` |
| Painted | 2026-11-11, 16:01–16:06 CET |
| Cost of the live paint | 11 calls, about **$0.98**: 1 test window, 8 block windows, 2 failed repaints of `-1_-3`. Each call is 4 754 input / 1 758 output tokens, about $0.09. |
| Rest of Kortrijk (area `kortrijk`, whole municipality) | **Not fetched, not rendered, not painted** (0 tiles) |

## Tile grid (`tx` across, `ty` down)

`P` = painted, `r` = coloured render only, `.` = no tile (outside the binnenstad bbox).

```
ty \ tx   -4  -3  -2  -1   0   1   2   3
  -3       .   .   .   .   r   r   .   .
  -2       r   r   P   P   P   r   r   .
  -1       r   r   P   P   P   r   r   .
   0       .   r   r   r   r   r   r   r
   1       .   .   r   r   r   r   r   .
   2       .   .   r   .   .   .   .   .
```

## Paint windows of the block

Windows are 1024 px at stride 896, so they overlap by 128 px. Window `i_j` starts at pixel (`i`·896, `j`·896). The whole binnenstad has **59 windows**, `i` -5..4 × `j` -4..3. **9** were painted for this block. **50** are not painted.

| Window | Status |
|---|---|
| `-2_-2` `-1_-2` `0_-2` `-2_-1` `-1_-1` `0_-1` `0_-3` | Painted and used. `-1_-2` (Broeltorens) was painted first and is also `pipeline/style/reference.png`. |
| `-2_-3` | Painted, **excluded**. It is mostly empty map edge (no tile at `-2_-3`), and GPT invents a city there. Its area stays coloured render. |
| `-1_-3` | Painted 3×, **excluded**. Same reason: it copied the style image twice and its neighbour once. The top ~384 px of tiles `-2_-2` and `-1_-2` stay coloured render, feathered in over ~220 px. |

Assembled with `python3 pipeline/tools/assemble_block.py --skip=-2_-3,-1_-3`. Before painting, run `edit_broel.py`; afterwards, `--restore`.

## Not painted yet

- **The rest of the binnenstad:** 23 tiles. In order of interest:
  - the Leie and Groeninge side to the east, `1_-2`, `1_-1`, `2_-2`, `2_-1`: K in Kortrijk, Baggaertshof, Groeningemonument;
  - Sint-Elooiskerk and Noordbrug to the west, `-3_-2`, `-3_-1`;
  - the station and Schouwburg to the south, row `ty` 0;
  - then the outer rows.

  Paint outward from the block so every new window has painted neighbours. Skip mostly-empty edge windows.
- **The whole municipality** (area `kortrijk`): nothing yet. It needs fetch, ground, scene and render first.

## Landmarks

Each landmark has notes, photos and a priority in `pipeline/landmarks/<slug>/` (see `pipeline/landmarks/README.md`).

| Prio | Landmark | Render fix | Tile | Painted |
|---|---|---|---|---|
| P1 | Broeltorens + Broelbrug | **done** (`edit_broel.py`) | `-1_-2` | **yes** |
| P1 | Sint-Maartenskerk | **done** (`massing.json`) | `0_-1` | **yes** (church with spire) |
| P1 | Belfort / Halletoren | **done** (`massing.json`, piece 1) | `-1_-1` | yes, but from the uncorrected render: it needs a fix and a repaint of its window |
| P1 | Historisch stadhuis | **done** (`massing.json`, piece 1) | `-1_-1` | yes, from the uncorrected render |
| P1 | Onze-Lieve-Vrouwekerk | pending | `0_-1` | yes, from the uncorrected render |
| P1 | Begijnhof | pending | `0_-1` | yes, from the uncorrected render |
| P2 | Artillerietoren | pending | `0_-1` | yes, from the uncorrected render |
| P2 | Sint-Michielskerk | pending | `-1_-1` | yes, from the uncorrected render |
| P2 | Buda (toren, fabriek, brug) | pending | `-1_-2` / `-2_-2` | yes, from the uncorrected render |
| P2 | Collegebrug | pending | `-1_-2` | yes, from the uncorrected render |
| P2 | Leiebruggen | pending | `-1_-1`, `-2_-1`, `-3_-1` | partly |
| P2 | Sint-Elooiskerk | pending | `-3_-2` | no |
| P2 | K in Kortrijk + Sint-Janstoren | pending | `1_-1` | no |
| P2 | Station | pending | row `ty` 0 | no |
| P2 | Stadsschouwburg | pending | row `ty` 0 | no |
| P3 | Groeningeabdij | pending | `0_-2` | yes, from the uncorrected render |
| P3 | Baggaertshof | pending | `1_-1` | no |
| P3 | Groeningemonument | pending | `2_-2` | no |

Tiles are from the landmark's OSM position projected with `pipeline/src/camera.ts`. Station and Schouwburg are approximate.

## Restore points

**Local `paint/` (since the HD publish, 2026-11-11):** the 6 live painted tiles were rebuilt from the published z8 map tiles (AVIF q50, so one generation of compression), with the baked map-edge fade divided back out of `-2_-2`, `-1_-2` and `0_-2`. The original lossless paint is on the build box (`styleA-colour-preview/`); copy it over `paint/` when you have it. The older local paint (29 tiles, pre-colour) is in `paint.old-local/`, and `backup-prehd-2026-11-11/` holds render, scene and paint as they were before the HD run.

Restore points are on the build box under `/workspace/paintrun/` and are not in git. Each folder has `PUBLISH.md` with the exact commands.

| Folder | What it is |
|---|---|
| `styleA-colour-preview/` | **Live**: paint, windows, render, `building_colours.json`. |
| `styleA-gpt/` | Previous: coral GPT flare. |
| `pre-colour-snapshot/kortrijk-binnenstad/` | Previous: uniform render. |
| `styleA-gemini-live/` | Gemini. |

`publish --keep` leaves older objects on R2.
