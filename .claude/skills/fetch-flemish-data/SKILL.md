---
name: fetch-flemish-data
description: Download Flemish open data for a SimKortrijk area (GRB footprints, 3D GRB heights, DHMV II terrain, summer orthophoto tree crowns, OSM). Use when fetching, refreshing, or resuming raw inputs for kortrijk-binnenstad or another area.
---

# Fetch Flemish data

No API key. Reads the area bbox from `pipeline/src/areas.ts`.

## Command

```sh
npm run fetch -- kortrijk-binnenstad
```

Replace the area name to fetch another bbox in the same pipeline (`kortrijk` is the whole municipality). Municipal borders are a separate step: `npm run boundaries -- kortrijk`.

## What it calls

`pipeline/src/fetch.ts`, `pipeline/src/trees.ts`, `pipeline/src/flanders.ts`.

| Request | URL |
|---|---|
| Footprints, roads, water | `https://geo.api.vlaanderen.be/GRB/wfs` types `GRB:GBG`, `GBA`, `KNW`, `WBN`, `WTZ` |
| Heights | `https://geo.api.vlaanderen.be/3DGRB/wms` layer `GRBGEBL1D2` GetFeatureInfo, field `HN_P99` |
| DSM / DTM | `https://geo.api.vlaanderen.be/DHMV/wcs` coverages `DHMVII_DSM_1m`, `DHMVII_DTM_1m` |
| Trees | `https://geo.api.vlaanderen.be/OMZ/wms` layer `OMZNIR24VL`, plus nDSM > 3 m |
| Ground, roads, trees, churches | `https://overpass-api.de/api/interpreter` |

Ramps, pillars and `overbrugging` footprints are dropped. Buildings with no 3D GRB hit keep the 95th percentile of DSM−DTM, or 8 m (3.5 m for GBA).

## Outputs

`data/raw/<area>/`

| File | Contents |
|---|---|
| `buildings.geojson` | WGS84 footprints, `height_m`, `height_src` |
| `grb_roads.geojson`, `grb_water.geojson` | WBN, WTZ |
| `dhm/dtm.f32`, `dhm/dsm.f32`, `dhm/raster.json` | 1 m Lambert grid, row 0 = north, TAW metres |
| `3dgrb.json` | Checkpoint `{ "Gbg:<OIDN>": metres or null }` |
| `osm.json`, `roads.json`, `ground.json` | Overpass, then the OSM map API if Overpass is unreachable |
| `trees.geojson` | Detected crowns plus OSM `natural=tree` more than 4 m from a detection |

Existing files are skipped. A GetFeatureInfo failure is stored as `null` in `3dgrb.json` and that building keeps its DHMV height. Re-run still resumes: keys already in `3dgrb.json` are not requested again. Delete `buildings.geojson` (keep `3dgrb.json`) to rebuild the GeoJSON without repeating the successful lookups.

## Env

None required. `CHROME_PATH` is not used here.

## Verify

- The log prints a height histogram: `3DGRB HN_P99`, `DHMVII DSM-DTM p95`, `default`. For the binnenstad, most buildings are 3D GRB (the POC saw about 78%).
- `trees.geojson` exists and the log reports a detected count plus an OSM-only count.
- A spot check: Belfort Lambert is about 72282, 169149. DTM there is roughly 16–20 m TAW, not a nodata value.
