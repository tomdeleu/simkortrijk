---
name: add-region
description: Add a SimKortrijk area on the existing Kortrijk camera, or a new region with its own origin. Use when extending coverage to the rest of the municipality or to another Flemish city. Do not move an origin that already has tiles.
---

# Add an area or a region

The binnenstad and the full municipality already share region `kortrijk`. Prefer a new **area** on that camera whenever the city is within about 150 km of the Belfort.

## Same region (the usual case)

1. Add a bbox to `AREAS` in `pipeline/src/areas.ts`: `title`, `region: "kortrijk"`, `[south, west, north, east]`. `kortrijk` (the municipality) is already there.
2. If the place needs its own URL, add a city in `pipeline/src/places.ts` (`center`, `widthM`) and, if the border overlay should name another gemeente, append that OSM `admin_level=8` name to `municipalities`.
3. Run boundaries only when municipalities changed:

```sh
npm run boundaries -- kortrijk
npm run fetch -- <area>
npm run ground -- <area>
npm run scene -- <area>
npm run render -- <area> -j 2
npm run export -- kortrijk-binnenstad <area>
npm run dev
```

Export every area of the region together so the pyramid, borders and roads stay one map. Fetch for `kortrijk` is the scale-up: on the order of 54,000 buildings, a multi-gigabyte DHMV raster, and a few hundred render tiles. `3dgrb.json` resumes height lookups.

Do not edit `origin` or `headingDeg`.

## New region (far from Kortrijk)

A new key in `REGIONS`:

| Field | Rule |
|---|---|
| `origin` | Central square. Fixed once you export. |
| `headingDeg` | 20–40° off the street grid so two façades show. |
| `country` | OSM `name:en` of admin_level 2, used by the Overpass area filter. |
| `municipalities` | OSM `name` of admin_level 8, exact spelling. |
| `credits` | Must include the GRB line if the data is Flemish, plus `© OpenStreetMap contributors`. |

Then `npm run boundaries -- <region>`, areas as above, and a city whose `region` matches.

Flemish areas keep using `fetch.ts` (GRB / DHMV / OMZ). A city outside Flanders needs its own source branch in `fetch.ts` and `scene.ts`. Do not point it at Tel Aviv's municipal layers, and do not reuse Isometric World imagery.

`GROUND_M` / `GEOID_M` in `pipeline/src/heights.ts` are the Kortrijk vertical datum (TAW + 43.5 m). Another region whose terrain is not ~16 m TAW needs its own ground height or buildings will float or sink. Area outlines use `GROUND_H`.

## Verify

- `npm run dev` opens `/<city>` on the new centre.
- Tiles of the new area meet the binnenstad without a step (same origin and heading).
- Footer credits still name Digitaal Vlaanderen and OpenStreetMap.
- `npm run typecheck` passes.
