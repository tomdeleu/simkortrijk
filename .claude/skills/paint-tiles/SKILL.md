---
name: paint-tiles
description: Repaint SimKortrijk render windows with Gemini Nano Banana (default), including Batch API for a whole city and the render-vs-paint retry. Use when painting, retrying a window, or wiring PAINT_PROVIDER. Skip this if the 3D render is enough for the preview. Do not call the API without GEMINI_API_KEY; npm test mocks it.
---

# Paint tiles

Optional. Export already shows the 3D render wherever `paint/` has no tile. Do not run a paid paint until the user has set a key and asked for it. `npm test` covers the Gemini request, the batch upload/poll, and the accept/retry decision with a mocked `fetch`.

## Providers

| `PAINT_PROVIDER` | Secret | What runs |
|---|---|---|
| `gemini` (default) | **`GEMINI_API_KEY`** | Gemini image edits. Model `GEMINI_IMAGE_MODEL` or `gemini-nano-banana-2.1`. |
| `codex` | none | `codex exec` on PATH, ChatGPT login. No `--batch`. |
| `openai` | **`OPENAI_API_KEY`** | `POST https://api.openai.com/v1/images/edits`. Model `OPENAI_IMAGE_MODEL` or `gpt-image-1`. No `--batch`. |

Gemini prices for `gemini-nano-banana-2.1`: **$0.0336 per 1K image**, **$0.0504 per 2K**. This painter requests 1K (windows are 1024 px). The Batch API is half of that ($0.0168 per 1K image).

Style is variant C, pastel and game-like. Do not replace these with Tel Aviv imagery.

- `pipeline/style/reference.png`: a painted Grote Markt and Belfort tile. Blush and coral roofs, peach and cream walls, mint and sage trees, pale lavender streets. Style only. The prompt forbids copying its buildings into another window.
- `pipeline/style/trees.png`: round mint and sage canopies and one narrow poplar, on a cream ground.

The prompt in `pipeline/src/paint.ts` is shared by Gemini, Codex, and OpenAI: the geometry lock, then the style C paragraph. Flat roof planes stay flat. Tile colour on that plane is allowed. Hips, ridges, and gables that change the silhouette are not. The HTTP client is `pipeline/src/gemini.ts`.

## Commands

```sh
npm test
npm run paint -- kortrijk-binnenstad --plan
npm run paint -- kortrijk-binnenstad --near 50.82757,3.26562 --radius 1   # interactive
npm run paint -- kortrijk-binnenstad --window 4,-3 --interactive
npm run paint -- kortrijk-binnenstad --batch                                      # whole area
npm run paint -- kortrijk-binnenstad --assemble
```

Negative window indexes need `--window=-7,4`. `--older=<ISO time>` repaints windows painted before that time. `--force` ignores finished windows.

Mode, only for `PAINT_PROVIDER=gemini`:

| | |
|---|---|
| 12 windows or fewer | interactive `generateContent`, one window at a time |
| more than 12, or `--batch` | Gemini Batch API |
| `--interactive` | always per window, even for a large set |
| `--batch` and `--interactive` together | error |

`--batch` with `codex` or `openai` is an error.

## What a window does

1. Crops a 1024 px view of the render and a matching height image (stride 896, so neighbours overlap by 128 px).
2. Pastes already-painted neighbour edges into the overlap. Batch mode still paints ring by ring (even positions, then odd) so a window can continue its neighbour.
3. Sends four PNGs, in order: `input.png` (the render), `height.png`, `style.png`, `trees.png`.
4. Interactive: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with header `x-goog-api-key`.
5. Batch: upload a JSONL to the Files API, `POST .../models/{model}:batchGenerateContent`, poll `GET /v1beta/batches/...` until `BATCH_STATE_SUCCEEDED`, download the output JSONL.
6. `pipeline/src/register.ts` compares edge maps, and `roofNovelty` measures strong new edges on surfaces that were flat in the render. `pipeline/src/paintqa.ts` retries (up to 3 attempts) when the match is under 0.45 on a textured window, when roof novelty is over 0.04 (a new ridge on a flat block), or when the paint has a black band the render does not. Roof-tile texture stays under 0.04. A small shift is warped back.
7. Assembles accepted windows into `paint/<tx>_<ty>.png`.

Open sea reuses `pipeline/style/sea.png` when that file exists. Kortrijk binnenstad has no open sea; the Leie is not at `SEA_H`.

## Inputs

`data/derived/<area>/manifest.json`, `render/`, `height/`.

## Outputs

| Path | Contents |
|---|---|
| `data/derived/<area>/windows/<i>_<j>.png` | Accepted window |
| `data/derived/<area>/work/<i>_<j>/` | `input.png`, `height.png`, `qa.json`, `paint.log` (Gemini) or `codex.log` |
| `data/derived/<area>/paint/<tx>_<ty>.png` | Feather-blended art tile |

## Env

`GEMINI_API_KEY` for the default painter. `GEMINI_IMAGE_MODEL` optional. `PAINT_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` only when switching away from Gemini.

Without `GEMINI_API_KEY` the command exits naming that secret and does not write fake paintings.

## Verify

- `npm test` passes. It never calls Gemini.
- `--plan` prints a window count and does not call the model.
- A finished window log line includes `match=0.xx`. Reject lines say `match … repainting` or `black band`.
- A batch log line includes `gemini batch: N windows, about $…`.
- Overlay `paint/<tx>_<ty>.png` on `render/<tx>_<ty>.png`. Streets and the church must still meet. Then `npm run export -- <area>` and refresh `npm run dev`.
