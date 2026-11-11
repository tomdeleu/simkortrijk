# Sint-Maartenskerk

Priority: **P1**

- OSM / ids: way 108142277 (church, wikidata Q2644010); inventaris Onroerend Erfgoed 59787
- GRB / render: GRB OIDN 1744653 (2 987 m², 3D GRB 25.0 m); LiDAR spire hull 72.8 m at 50.82747,3.26789 (scene.ts)

## What it looks like

Gothic hall church (1390-1466) next to the Grote Markt, the tallest landmark (tower 83 m). Nave and west tower of pale Tournai and Lede limestone (light grey-cream, #D9D3C4); 19th-century choirs of brick with stone trim. All roofs are slate (saddle, hip and tent roofs, #4A4F58). The west tower is square, buttressed, pale stone, with paired pointed belfry openings; on top a dark slate neo-Gothic wooden spire (1876): a tall octagonal bulb-and-lantern spire with clock faces, surrounded by four small slate corner pinnacles with needle spires and crosses. Carillon of 49 bells.

## Prompt line (draft)

Sint-Maartenskerk: pale cream limestone Gothic hall church with steep dark slate roofs; a square pale stone west tower carrying a tall dark slate octagonal spire with a lantern and four small slate corner pinnacles; the tallest object in the map.

## Render fix (done: `massing.json`)

Rendered from `massing.json` since 11 Nov 2026: whole footprint as 12 m aisles/chapels, three nave saddles (eave 15 m, ridge 27-28 m) along the axis, a transept saddle across it, three brick choirs, an 11 × 11 m pale stone west tower to 55 m, an octagonal slate lantern to 63 m with a slate needle to 83 m, and four slate corner pinnacles. GPT 2.6 flare paints it as a church with a spire (preview `/workspace/live-check/preview-colour-church.jpg` on the box).

## Original problem

- The render extrudes the whole 2 987 m² footprint to 25 m as one flat box with a pale-stone wall and (now) slate roof, plus a hexagonal LiDAR prism to 73 m. That reads as a block with a pole.
- Edit like edit_broel.py: nave + aisles as three parallel steep slate saddle roofs (eaves ~14 m, ridge ~28 m, axis east-west), the square west tower (~11 × 11 m) in pale stone to ~55 m, then an octagonal slate spire to 83 m with four corner pinnacles (~6 m).
- Or in scene.ts: split the footprint into tower + nave and give the nave a gable along its long axis (building_colours.py rejects it because the footprint is not rectangular).

## References

- refs/01-kortrijk-sint-maartenskerk-2.jpg
- refs/02-id59787-kortrijk-sint-maartenskerk-pm-36299.jpg
- refs/03-kortrijk-luchtfoto-22775-onroerenderfgoed.jpg

Sources and licences: refs/SOURCES.md.
