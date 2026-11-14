# Leie bridges (Leiebrug, Kasteelbrug, Kalkovenbrug, Dambrug, Groeningebrug, Noordbrug, Reepbrug)

Priority: **P2**

- OSM / ids: Leiebrug way 567818111 (beam, Q1914240); Kasteelbrug 567818110 (humpback); Kalkovenbrug 567818113 (rebuilt 2026 in composite); Dambrug 567818114 (Q13510952); Groeningebrug 629119851 (Q2240035); Noordbrug 1333504491 / 537013799 (cable-stayed); Reepbrug 1073998494; Gentbrug 567818116
- GRB / render: no buildings

## What it looks like

The Leiewerken bridges are modern: flat concrete/steel beam decks with grey or white railings, the river between sloping green banks and broad stone quays. Noordbrug is cable-stayed with a single mast. The old postcard-style Leiebrug with towers no longer exists. Kalkovenbrug was a timber footbridge until 2025; a composite one is being built in 2026.

## Prompt line (draft)

Leie bridges: flat modern bridges with light railings across a straight blue river with stepped stone quays and green slopes.

## Render fixes needed

- **Noordbrug done (2026-11-11): `edit_noordbrug.ts`.** The massing render cannot draw its leaning lambda pylon or stays, so they are drawn into `render/` before painting (pylon top 38.3 m TAW on the deck axis at the south-east bank, from DHMV II; seven stays to the deck) and put back with `--restore` afterwards.

- Check the ground render draws each deck over the water (roads with bridge=yes). Noordbrug needs a mast and cables like the Collegebrug.

## References

- refs/02-kortrijk-brug-over-leie.jpg
- refs/03-leieboorden-kortrijk.jpg

Sources and licences: refs/SOURCES.md.

## R36 bridge (Burgemeester Vercruysselaan)

OSM way 826126060, 127 m, over the Leie at the mouth of the Kanaal Bossuit-Kortrijk, between two roundabouts. Street View (IJzerkaai bank, look-up only): a long, slender deck in light concrete on V-shaped piers on both banks, open below (Koning Albertpark paths, the skatebowl and the quays pass under), white railings and lamp posts. DHMV II: deck 16.6 m TAW at the ends, ~18.8 m in the middle, ~19 m wide; ground and water below at 10-12.5 m.

**Done (2026-11-13, Tom's feedback):** render edit `edit_r36brug.ts`. The render drew the road on the ground (a closed embankment); the edit fills that strip with the water or grass beside it and draws the raised deck, its light south edge, railings, lamps and piers. Run it before painting windows `-1_-3` / `0_-3`, then `--restore` (originals in `render.orig-r36brug/`).

## The other bridges (2026-11-13, Tom: "recheck all bridges")

All bridges in painted tiles were checked in the paint and on Google Street View from the deck (look-up only). `edit_bridges.ts` draws the ones the painter got wrong, one spec per bridge, in painted colours, onto the current render (`--restore` after painting; originals in `render.orig-bridges/`):

| Bridge | Real | Was painted as | Now |
|---|---|---|---|
| Budabrug (Budastraat, OSM 1264315394, 2014) | flat steel road bridge, dark slanted side girders, white mesh railings | arched stone bridge | `edit_bridges.ts`, kept out of the export deck overlay |
| Kalkovenbrug (OSM 118613392) | narrow footbridge (timber until 2025, composite from 2026) | thin white line | slim footbridge |
| Footbridge at the Nijverheidskaai (OSM 767977976) | slim steel footbridge | thin white line | slim footbridge |
| De Drie Duikers (rail, OSM 298628668/7) | double-track steel girder bridge | bare tracks over water | light grey side girders |
| Kasteelbrug, Leiebrug, Dambrug, Gentsesteenweg, lock footbridge, R36 west | flat modern bridges with steel railings | flat road over water | fine (export deck in road colour) |

Railway viaducts over streets: `export.ts` (`railParapets`) lays light concrete parapets along their outer sides over the paint (2026-11-13).

R36 bridge, second pass (Tom: "it floats"): the deck now starts at the road's own height, rises in a hump, narrows to the road width and takes the road's render colour, so it continues the road instead of hovering over it.

Third pass, 2026-11-14 (Tom: R36 west "still not right", Budabrug and IJzerkaai bridge "loose blocks"; Google Street View, look-up only):

- R36 west (Lambrechtlaan): a long galvanised steel box girder on square concrete piers, the quay road and a car park under its north-west end, abutment walls with murals. The script drew the front face on the north edge (hidden under the deck); it is now on the south edge: slate-grey steel girder 3 m deep with ribs, grey piers, 8 m concrete abutments.
- Budabrug: a lift bridge, raised in the DHMV LiDAR and on Street View (May 2025). Drawn lowered, flush with the quays (`level`).
- IJzerkaaibrug (OSM 61597591, over the old Leie arm by the Koning Albertpark): a short concrete slab road bridge at quay level, concrete edge beam, galvanised railings, brick abutments. Drawn by `edit_bridges.ts` and skipped by the export deck overlay.
