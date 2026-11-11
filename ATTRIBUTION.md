# Licences, data sources and attribution

SimKortrijk is built from open data. No Google, Apple, Bing or other proprietary map content (imagery, 3D tiles, geometry) is used, not even as a reference.

The pipeline and viewer are adapted from [Isometric World](https://github.com/krasun/isometricworld) by Dmytro Krasun, under the MIT licence in [LICENSE](LICENSE). His published tiles, `video/` and `pipeline/style/` images are **not** in this repository and must not be copied from his: they are CC BY 4.0 plus his data credits (see `ATTRIBUTION.md` upstream). The sheets in `pipeline/style/` here were drawn for this project.

## Credit line

Shown on the map footer and in video mode. Keep it on reposts:

> Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen · © OpenStreetMap contributors

Each region lists its lines in `pipeline/src/places.ts` (`credits`).

## Data sources

| Source | Used for | Notes |
|---|---|---|
| [GRB WFS](https://geo.api.vlaanderen.be/GRB/wfs) layers GBG, GBA, KNW, WBN, WTZ | Building footprints, road polygons, water | Digitaal Vlaanderen. Cite as above. |
| [3D GRB WMS](https://geo.api.vlaanderen.be/3DGRB/wms) layer `GRBGEBL1D2` | Height above ground (`HN_P99`), via GetFeatureInfo | Same source. Buildings changed after the 2015 LiDAR are often missing. |
| [DHMV II WCS](https://geo.api.vlaanderen.be/DHMV/wcs) `DHMVII_DSM_1m`, `DHMVII_DTM_1m` | Terrain (DTM), height gaps (DSM−DTM), church and belfry spires | Digitaal Vlaanderen. Elevations are TAW. |
| [OMZ WMS](https://geo.api.vlaanderen.be/OMZ/wms) `OMZNIR24VL` | Summer 2024 colour-infrared orthophoto, used only to detect trees (NDVI) | Orthofotomozaïek middenschalig, zomer 2024, Digitaal Vlaanderen. Not drawn on the map as a photo. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via Overpass | Parks and landuse, road centre-lines and traffic, rails, church and tower tags, `natural=tree` | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). "© OpenStreetMap contributors" stays visible. Derived data is not redistributed; `pipeline/` is the method to recreate it. |

None of this data is in git. `npm run fetch` writes it under `data/` (gitignored).

Flemish open data is published for reuse with attribution (Modellicentie voor gratis hergebruik). The credit line above is the one this project shows. This is not legal advice.

## AI painting

Optional. The default painter is Google's Gemini image model `gemini-nano-banana-2.1` (`GEMINI_API_KEY`; `GEMINI_IMAGE_MODEL` overrides the id). Codex (`PAINT_PROVIDER=codex`, ChatGPT login, no API key) and OpenAI (`OPENAI_API_KEY`) remain available. Label painted clips "Painted with AI". The binnenstad viewer ships the unpainted render until that step has been run.

`pipeline/style/reference.png` is a Kortrijk Grote Markt tile painted in style C (pastel, game-like). `pipeline/style/trees.png` is a mint and sage crown sheet drawn for the same palette. Neither image is from Isometric World's Tel Aviv set.

## Software

[three.js](https://threejs.org) (MIT), [OpenSeadragon](https://openseadragon.github.io) (BSD-3-Clause), [Astro](https://astro.build) (MIT), [sharp](https://sharp.pixelplumbing.com) (Apache-2.0), [Playwright](https://playwright.dev) (Apache-2.0), [proj4](https://github.com/proj4js/proj4js) (MIT), [geotiff.js](https://github.com/geotiffjs/geotiff.js) (MIT), [esbuild](https://esbuild.github.io) (MIT), [tsx](https://tsx.is) (MIT). Installed from npm, not vendored.
