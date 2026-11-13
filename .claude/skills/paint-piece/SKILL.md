---
name: paint-piece
description: Paint the next piece (stuk) of the SimKortrijk map end to end, the way pieces 5-7 were done - plan tiles and windows, research landmarks (Commons, Onroerend Erfgoed, orthophoto, Street View / satellite look-up), fix the render with massing.json, check and repaint stale windows, paint window by window with an eye check, assemble, export, view, record in PAINT_STATUS.md, publish when Tom says so. Use when Tom says "next piece", "stuk N", "what's next" or asks to paint more of the map.
---

# Paint a piece

A piece (`stuk`) is a few neighbouring render tiles plus the landmarks in them. One piece at a time. `docs/PAINT_STATUS.md` is the source of truth (piece table, grid, landmarks, lessons): read it first, and read `.claude/skills/map-style/SKILL.md` and `.claude/skills/paint-tiles/SKILL.md` once per session.

Tom's rule (`PAINT_STATUS.md`, "Working rule"): propose, wait for his go, do the piece, record it. When Tom says to work on his own ("zelfstandig"), skip the wait but still do every step below, and stop before publishing unless he said to publish.

Paths below are relative to the repo root. `D=data/derived/kortrijk-binnenstad`. The Python tools need `pillow numpy scipy` (Tom's system Python has none: make a venv in the scratchpad, `python3 -m venv $S/venv && $S/venv/bin/pip install pillow numpy scipy`).

## 1. Plan

- Pick the tiles from the blue dashed proposal in `docs/paint-status.png` (`tx_ty`, 1024 art px each). Paint outward from the painted block.
- Windows are 1024 px at stride 896: window `i_j` covers art px `i*896 .. i*896+1024`. A tile `tx` needs windows `i` with `i*896 < (tx+1)*1024` and `i*896+1024 > tx*1024`; same for `j`. Include the row/column that covers the last 384 px (e.g. `j = -4` for tile row `-3`); a missing 128 px bottom strip may stay a feather.
- `cd pipeline && npx tsx tools/landmarks_in_tiles.ts <tiles>` prints each tile's centre lat/lon and the named churches, heritage, museums, towers and GRB footprints over 25 m in it.
- Look at the render of each tile (and at the windows that already exist there) before proposing.
- The proposal to Tom: tiles, windows (new / repaint / reuse, and why), landmarks and their render fixes, calls and cost (~$0.09 a call plus one or two repaints), useful references.

## 2. Landmark research (Claude does it alone)

For every landmark in the piece (and any large building the render gets wrong, like Hangar K's sawtooth roof):

- `python3 pipeline/tools/landmark_refs.py <slug> --search "<name> Kortrijk" --require Kortrijk --ortho <lat>,<lon>`: Commons photos (licence and author into `refs/SOURCES.md`, max 900 px) and a Digitaal Vlaanderen orthophoto crop. Add searches for the Onroerend Erfgoed inventory name (`--search "parochiekerk Sint-X Kortrijk"`). `--require` is needed: Commons search also returns churches of the same name in other towns. The tool retries Wikimedia's 429.
- Google Street View and satellite (Claude in Chrome, `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=<lat>,<lon>&heading=<deg>&pitch=15&fov=90`, satellite `https://www.google.com/maps/@<lat>,<lon>,90m/data=!3m1!1e3`): **look only, never store** (rule 1). The camera looks along heading 20°, so the facades that matter face south-south-west: stand south-west of the building and look north-east. Never record the Maps sidebar (it shows Tom's saved places).
- WebSearch for dates, materials and the inventory text when the photos leave questions.
- `cd pipeline && npx tsx tools/landmark_measure.ts <OIDN>` prints the footprint in (u, v) metres, `anchor`, `axis_deg`, where u and v point, and an nDSM grid: read ridges (a row or column of maxima), eaves (the edge values), towers (a local peak; a LiDAR spire tip is a few m short) and sawtooth roofs (a periodic pattern). Find the OIDN with the GRB footprints near the OSM centre in `data/raw/<area>/buildings.geojson`.
- Write `pipeline/landmarks/<slug>/notes.md` (what it looks like, OSM/GRB ids, the render fix, references), and add the slug to `pipeline/landmarks/positions.json` and the table in `pipeline/landmarks/README.md`.

## 3. Render fix

- `massing.json` (format in `pipeline/landmarks/README.md`; examples: `sint-rochuskerk`, `sint-janskerk`, `hangar-k`, `sint-elooiskerk`): a `footprint: "grb"` base at aisle height, `gable-u`/`gable-v` rects for nave, choir, transept and bays, a `poly` + `pyramid` apse, a flat tower rect, an `oct` + `pyramid` needle and small `oct` pinnacles. Brick around `[0.7, 0.47, 0.39]`, buff stone `[0.86, 0.76, 0.58]`, slate roof `[0.46, 0.5, 0.6]`, needle `[0.48, 0.52, 0.61]`: light, never dark (map-style).
- Back up first: `B=$D/backup-pre-pieceN-$(date +%H%M)`, copy `scene windows paint paint.json` and, per tile you re-render, `render/`, `render-hd/`, `height/`.
- `npm run scene -- kortrijk-binnenstad`, then re-render only the tiles under the piece's windows: `npm run render -- kortrijk-binnenstad --only=tx,ty --force` (one tile per call; in zsh loop over an array `L=(a b c); for t in $L`, or the tile list becomes one argument). Put byte-identical renders back with `cp -p` from the backup so export does not rebuild them. `--only` renders any tile, even one that is not in the area: check the tile grid in `PAINT_STATUS.md` first. Do not re-render painted tiles that have a render edit (`edit_k.ts`, `edit_noordbrug.ts`, `edit_broel.py`) without re-running the edit.
- Crop the landmark from old and new render side by side and check it against the references.
- Data bugs found on the way (a fake tower, a 23 m garden shed) are fixed in `scene.ts` for the whole map, but only the piece's tiles are re-rendered; say so in the record.

## 4. Windows: reuse or repaint

- `python3 pipeline/tools/window_check.py $S/check.png <windows>` puts the current render next to each existing window. A window painted before a render change is stale even when it looks fine (`3_-1`/`3_0` kept a fake tower from before the piece 5 cleanup): repaint it.
- When a landmark's render changed, move every window that shows it to `$D/windows.replaced/<w>.pre-pN.png` **before** painting its neighbours, or its old strip is pasted into them and the old shape comes back (piece 2's palace, piece 5's style-image copy).
- An old invented-city window that a live tile still uses (`-4_0`): move it out of `windows/` while its neighbour is painted, then put it back.

## 5. Paint

```sh
PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare PAINT_ATTEMPTS=1 \
  npm run paint -- kortrijk-binnenstad --window=i,j --interactive        # --force to repaint in place
```

- Skip windows that are half outside the map (no render tile under them): GPT invents a city there; the tile edge fades into the render instead.
- One window per call, from the painted block outward, landmarks first (so their neighbours continue the corrected paint).
- Windows with little content (rail yards, open ground, sparse suburbs) tend to come back as a copy of the style image (the Broeltorens and the Leie, `match` ~0.05 with a shift), and the same call repeats the copy. Paint those with `PAINT_STYLE=<copy of a good painted window of a similar area>` (copy it to the scratchpad first, it must not change while painting).
- After **every** window: `window_check.py` and look. `match` below ~0.3, a copied style image (repaint with `PAINT_STYLE`) (Broeltorens, river), invented water, a city in empty edge, or a fake tower: move it to `windows.replaced/` and repaint before going on.
- `npm run paint -- --window` also rewrites any paint tile whose windows all exist; step 6 overwrites those. Note which tiles it touched (`ls -lT $D/paint`).

## 6. Assemble, export, view

```sh
$S/venv/bin/python pipeline/tools/assemble_tiles.py --target=<all painted tiles incl. new> --rewrite=<new tiles + painted neighbours incl. diagonals>
TILES_ORIGIN=https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev npm run export -- kortrijk-binnenstad
```

- Rewrite the painted neighbours too: their 220 px fade into the render moves when the next tile becomes paint. After rewriting `1_-1`, run `npx tsx landmarks/k-in-kortrijk/edit_k.ts --logo-on-paint` (from `pipeline/`).
- `data/web/regions/kortrijk` should be empty before the export so only changed tiles are published (lower zooms come from R2).
- Make a mosaic of the new tiles with their neighbours (paint where it exists, else render) and look for seams. Then `TILES_ORIGIN=... npm run dev` and look at `http://localhost:4321/kortrijk?at=<lat>,<lon>,<km across>` (overview and each landmark close-up); save the screenshots for Tom.

## 7. Record

- `docs/PAINT_STATUS.md`: a row in the piece table (tiles, windows new/repainted and why, landmarks and fixes, references, status, calls/cost from `$D/openai-usage.jsonl`, date), Progress line, Summary (painted / render-only / coverage), tile grid, "Not painted yet", landmark table, lessons. `CLAUDE.md`: the "as of" line and any new gotcha.
- `cd pipeline && npx tsx src/paintstatus.ts --next="<next tiles>" --label "voorstel: stuk N+1 ..."` regenerates `docs/paint-status.png` with the next proposal.
- Report to Tom: what changed, calls and cost, screenshots, open points, and the proposal for the next piece.

## 8. Publish (only when Tom says so)

```sh
cd /private/tmp && TOK=$(npx -y wrangler auth token | tail -1) && cd - && \
CLOUDFLARE_API_TOKEN="$TOK" CLOUDFLARE_ACCOUNT_ID=fa71ab6722bdece3cb45e84ff630e3c0 \
TILES_ORIGIN=https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev npm run publish -- kortrijk --yes --keep
```

Tiles-only changes need no Worker redeploy. Check `.../regions/kortrijk/data/world.json` answers 200, then mark the piece live in `PAINT_STATUS.md` and `CLAUDE.md`. Commit and open a PR only when Tom asks (branch `pieceN-<where>`).
