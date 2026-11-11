---
name: build-ground-scene
description: Build the Kortrijk terrain grid and the 3D scene (buildings, LiDAR spires, trees) from fetched open data. Use after fetch, or when rebuilding ground or scene bins for an area.
---

# Ground and scene

Run fetch first. No API key and no Chrome.

## Commands

```sh
npm run ground -- kortrijk-binnenstad
npm run scene -- kortrijk-binnenstad
```

`pipeline/src/ground.ts`, `pipeline/src/scene.ts`. Both call `openArea`, which selects the region's camera. Do not change `origin` or `headingDeg` in `places.ts` if tiles already exist.

## Inputs

`data/raw/<area>/buildings.geojson`, `grb_roads.geojson`, `grb_water.geojson`, `dhm/`, `ground.json`, `osm.json`, `trees.geojson`.

## Outputs

`data/derived/<area>/ground/`

| File | Contents |
|---|---|
| `meta.json` | Grid origin, step (10 m), size, in ENU metres |
| `height.bin` | Float32 ENU "up" of the ground. DHMV II DTM + geoid 43.5 m, light blur. Water from GRB WTZ and OSM is flattened. |
| `features.json` | GRB roadbeds and water, OSM parks, lanes, rails, junctions |

`data/derived/<area>/scene/<tx>_<ty>.json`

| Field | Contents |
|---|---|
| `b` | `[ring, height_m, style, groundHint, holes?]` in ENU. Styles: 0 whitewash, 1 brick, 2 stone, 3 glass, 4 annex. |
| `t` | `[x, y, radius, crownCentreHeight]` |

Scene also drops decks that a motorway or railway runs through, and adds a spire where the LiDAR canopy maximum is at least 8 m above the surveyed roof. The spire is extruded to that maximum (Sint-Maartenskerk is about 73 m in DHMV II). The Belfort's 1 m DSM peak is only about 33 m, so the model follows the raster rather than a handbook height.

## Env

None.

## Verify

- Ground log: terrain width × height and an "up" range near 55–65 m (ellipsoid), not near 0 and not near the Tel Aviv geoid (~19 m).
- Scene log: a few thousand GRB buildings for the binnenstad, a spire count, and the tallest spires. Sint-Maartenskerk should show up near 70 m, not as a flat nave.
- `scene/` contains one JSON per render tile that has geometry. An empty directory means the camera region was wrong or fetch produced no buildings.
