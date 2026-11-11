---
name: render-tiles
description: Render SimKortrijk scene tiles with headless Chrome and three.js (45° orthographic, 0.25 m/px). Use when producing or re-rendering colour and height tiles for an area.
---

# Render tiles

Needs Google Chrome or Chromium. No network and no API key inside the page. Run ground and scene first.

## Command

```sh
npm run render -- kortrijk-binnenstad -j 2
```

Flags (parsed by `pipeline/src/render.ts`):

| Flag | Meaning |
|---|---|
| `-j 2` | Parallel browser pages. Keep this at 2 on a machine without a GPU. |
| `--only tx,ty` | One tile. |
| `--force` | Ignore existing PNGs. |
| `--ss 2` | Supersample factor (default 2). |

Chrome is the first existing binary among `CHROME_PATH`, `/usr/bin/chromium`, `/usr/bin/google-chrome-stable`, `/usr/bin/google-chrome`, `/usr/local/bin/google-chrome`. The launcher adds `--ignore-gpu-blocklist` and `--enable-unsafe-swiftshader`.

## Inputs

`data/derived/<area>/ground/` and `data/derived/<area>/scene/`.

## Outputs

| Path | Contents |
|---|---|
| `data/derived/<area>/render/<tx>_<ty>.png` | 1024² colour |
| `data/derived/<area>/height/<tx>_<ty>.png` | 256² ellipsoid height (cm + 10000 in R,G) |
| `data/derived/<area>/manifest.json` | Area, camera, tile list, attribution strings |

Tiles whose centre falls inside the area polygon are rendered. Finished PNGs are skipped unless `--force`.

## Env

| Name | Required |
|---|---|
| `CHROME_PATH` | No. Set it when auto-detect picks the wrong browser. |
| `CHROME_ARGS` | No. Default `--enable-gpu`. |

## Verify

- The log ends with a tile count and no `FAILED` lines. A binnenstad run is on the order of a few dozen tiles, about a second to a few seconds each.
- Open one `render/*.png`. You should see brick blocks, grey streets, blue water and a taller stone church or belfry near the middle, not a flat grey plate and not a Tel Aviv beach.
- `manifest.json` `attributions` include the GRB credit line.
