---
name: paint-tiles
description: Repaint SimKortrijk render windows with an image model and reject results that drift from the render. Use when painting, retrying a window, or wiring PAINT_PROVIDER. Skip this if the 3D render is enough for the preview.
---

# Paint tiles

Optional. Export already shows the 3D render wherever `paint/` has no tile. Do this only when a painter is available. A binnenstad run is a few dollars if the provider bills per image; paint a ring around the Belfort before the whole area.

## Providers

| `PAINT_PROVIDER` | Secret | What runs |
|---|---|---|
| `codex` (default) | none | `codex exec` on PATH, ChatGPT login. Same tool as Isometric World. |
| `openai` | **`OPENAI_API_KEY`** | `POST https://api.openai.com/v1/images/edits`. Model `OPENAI_IMAGE_MODEL` or `gpt-image-1`. |

Style sheets (original placeholders, not from isometricworld):

- `pipeline/style/reference.png`
- `pipeline/style/trees.png`

Replace them with a painted Flemish street and crown sheet before a large spend. The prompt is in `pipeline/src/paint.ts`.

## Commands

```sh
npm run paint -- kortrijk-binnenstad --plan
npm run paint -- kortrijk-binnenstad --near 50.82757,3.26562 --radius 1
npm run paint -- kortrijk-binnenstad --window 4,-3
npm run paint -- kortrijk-binnenstad -j 2
npm run paint -- kortrijk-binnenstad --assemble
```

Negative window indexes need `--window=-7,4`. `--older=<ISO time>` repaints windows painted before that time. `--force` ignores finished windows.

## What a window does

1. Crops a 1024 px view of the render and a matching height image (stride 896, so neighbours overlap by 128 px).
2. Pastes already-painted neighbour edges into the overlap.
3. Sends render, height, `reference.png` and `trees.png` to the provider.
4. `pipeline/src/register.ts` compares edge maps. If the match is weak it warps the image back, or repaints (up to 3 attempts) when the score stays under 0.45 or a black band appears.
5. Assembles accepted windows into `paint/<tx>_<ty>.png`.

Open sea reuses `pipeline/style/sea.png` when that file exists. Kortrijk binnenstad has no open sea; the Leie is not at `SEA_H`.

## Inputs

`data/derived/<area>/manifest.json`, `render/`, `height/`.

## Outputs

| Path | Contents |
|---|---|
| `data/derived/<area>/windows/<i>_<j>.png` | Accepted window |
| `data/derived/<area>/work/<i>_<j>/` | `input.png`, `height.png`, `qa.json`, `codex.log` |
| `data/derived/<area>/paint/<tx>_<ty>.png` | Feather-blended art tile |

## Env

`PAINT_PROVIDER`, `OPENAI_API_KEY` (openai only), `OPENAI_IMAGE_MODEL` (optional). Codex needs a logged-in `codex` binary, not a key.

If neither painter is available the command exits with the secret name and does not write fake paintings.

## Verify

- `--plan` prints a window count and does not call the model.
- A finished window log line includes `match=0.xx`. Reject lines say `match … repainting` or `black band`.
- Overlay `paint/<tx>_<ty>.png` on `render/<tx>_<ty>.png`. Streets and the church must still meet. Then `npm run export -- <area>` and refresh `npm run dev`.
