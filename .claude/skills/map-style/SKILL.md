---
name: map-style
description: The live SimKortrijk look, "Style A + real colours" (approved by Tom, live since 2026-11-11). Use before changing colours, the paint prompt, pipeline/style/reference.png, a landmark, or painting a new block, so new work matches what is live.
---

# Style A + real colours (live)

What the live Broeltorens block looks like, and how every new block must be made so it matches. Approved by Tom on 2026-11-11 after "de kleur moet er ergens tussen liggen, nu is het vrij donker en te realistisch".

## The look

- Pastel, game-like isometric city map (cozy city-builder / storybook finish), not photorealistic.
- More contrast than plain pastel: deeper shade on facades facing away from the sun, clear light/dark split between roofs, walls and streets.
- Water is a true clear blue, around `#2F7FD6`, with a few lighter ripples. Never mint, teal or turquoise.
- Conical tower roofs and spires are slate blue-grey, around `#6B7A90`. Never black or anthracite.
- Trees: round mint and sage canopies (`pipeline/style/trees.png`), never dark forest green. Streets: pale lavender-grey. Empty map edge: cream paper.
- **Every building keeps its own colour.** Neighbours must stay distinguishable. The overall tone is light, never dark or muddy.

## Colour families

The colours come from the render, not from the model. `pipeline/tools/building_colours.py` gives each GRB footprint a roof and wall colour.

Roof colours come from the first source that has one:
1. OSM tags.
2. The median sunlit colour inside the footprint on the Digitaal Vlaanderen winter orthophoto `OMWRGB25VL` (2025).
3. A palette.

Each colour is then moved part of the way toward a pastel version of its own class.

| Roofs | Walls |
|---|---|
| terracotta clay tiles, brown clay tiles | red brick, brown brick |
| slate blue-grey (most bourgeois houses, all churches) | buff brick |
| dark, grey and light flat roofs | whitewash / cream paint |
| sedum green, copper verdigris (rare) | grey paint, pale stone (churches, public buildings) |

The amount of softening is set with `--soften` (or `COLOUR_SOFTEN`):

| `--soften` | Result |
|---|---|
| 0 | Measured orthophoto colours. Realistic, too dark for this map. |
| 0.35 | More realistic, darker. |
| **0.5** | **Live. Halfway between realistic and pastel.** |
| 0.65 | More pastel, lighter. |
| 1 | Full pastel. Families stay, but neighbours look alike. |

Each pastel version keeps 60% of the building's offset from its class colour, so a row of houses never turns into one block. The measured colours stay in `building_colours.json` as `wall_raw` / `roof_raw`. After changing the softening, rerun `building_colours.py`, `npm run scene`, `npm run render -- <area> --force`, then repaint.

## Shapes

- **Pitched roofs.** Where LiDAR shows a tent profile, roofs are gables, taken from the DHMV II 1 m DSM (about 35% of binnenstad footprints). The paint keeps their ridges. Flat roofs in the render stay flat.
- **Landmarks are researched, not guessed.** Each one has its own folder, `pipeline/landmarks/<slug>/`, containing:
  - `notes.md`: materials and colours from the Onroerend Erfgoed inventory, OSM/GRB ids, and a prompt line.
  - `refs/`: Wikimedia Commons photos, with licences in `refs/SOURCES.md`, for look-up only.
  - A render fix, in one of two forms:
    - Preferred: `massing.json`. Real 3D parts, built by `npm run scene`. Example: `sint-maartenskerk/massing.json`, with nave gables, transept, brick choirs, a pale stone tower, and a slate spire with four pinnacles.
    - A 2D render edit script, for shapes the renderer cannot build. Example: `broeltorens/edit_broel.py`, which draws the arched Broelbrug and the cones. Run it before painting and run `--restore` afterwards.
  - Format of `massing.json`: see `pipeline/landmarks/README.md`.

## Painting

- Painter: `PAINT_PROVIDER=openai OPENAI_IMAGE_MODEL=gpt-image-2.6-flare PAINT_ATTEMPTS=1` (quality and input fidelity high, about $0.09 a window). Use `sunburst` only if Tom asks.
- Style image: `pipeline/style/reference.png`, the coloured Broeltorens window `-1_-2`. It shows the finish and how the colours are softened. The prompt says to take colours from image 1 (the render), not from this tile.
- Prompt: `GEOMETRY_LOCK`, `STYLE_A` and `PROMPT` in `pipeline/src/paint.ts`. The lines that carry this style:
  - Image 1 already has each building's own colour, from aerial photos, softened toward pastel.
  - Roofs and walls keep image-1 colour families, softened into a light pastel palette, never darker or muddier than image 1.
  - Keep every building's roof and wall colour family. Do not recolour all roofs the same. Do not swap colours between neighbours. Add clay-tile, slate and brick texture.
  - Sloped roof planes are real pitched roofs: keep their ridges.
- Seams: paint centre-out (`--center`). Each window gets its painted neighbours' overlap strips pasted in, and GPT continues them. Assemble a partial block with `pipeline/tools/assemble_block.py`, which feathers about 220 px into the render.

## Do / don't

Do:
- Fix the render (colours, `massing.json`) before painting. GPT paints the render literally.
- Test one window first and look at it before painting a block.
- Keep the colour families and keep the overall tone light.
- Keep backups of the live windows/paint before repainting.

Don't:
- Use all-coral roofs, peach-everything, or the old coral `reference.png`.
- Ask the model to "recolour" or "harmonise" buildings.
- Use dark realistic orthophoto colours (soften 0).
- Paint windows that are mostly empty map edge (`-1_-3`, `-2_-3` at the Broeltorens). GPT copies the style image or invents a city there. Leave them out with `assemble_block.py --skip`.
- Use `npm run paint -- --assemble` for a partial block, because it leaves a hard seam.
- Paste reference photos or Tel Aviv imagery in as style images.

## Verify

Compare the new block with the live one at the same zoom. Check four things:
- Roofs are a mix of terracotta, brown, slate and grey, not one colour.
- Nothing is darker than the render.
- The river is clear blue.
- No window-sized colour steps.
