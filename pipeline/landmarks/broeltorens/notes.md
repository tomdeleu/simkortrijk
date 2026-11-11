# Broeltorens + Broelbrug

Priority: **P1 (done)**

- OSM / ids: relation 10904404 (Q925006); Inghelburghtorre way 689927723, Speytorre way 689927724; Broelbrug way 567818112 (Q1856639)
- GRB / render: GRB OIDN 1744148 and 1744040 (3D GRB ~25 m)

## What it looks like

Two round medieval towers on the Leie (Speytoren south 1385, Ingelborchtoren north 1413) in cream/grey stone with conical slate roofs, linked by the low three-arched stone Broelbrug with a statue of John of Nepomuk. Done by edit_broel.py (see README.md).

## Prompt line (draft)

(see paint.ts, style A: slate blue-grey cones)

## Render fixes needed

- Already handled by edit_broel.py.
- OSM tags roof:colour=#243724 (dark green) and roof:shape=pyramidal on both towers; building_colours.py trusts OSM, so the raw render shows dark green cones. The real cones are slate. Override in building_colours.py, or fix the OSM tags (roof:shape=cone, roof:colour=slate grey).

## References

- refs/01-broeltorens-kortrijk-dscf9278.jpg
- refs/02-kortrijk-luchtfoto-22774-onroerenderfgoed.jpg
- refs/03-broeltorens-kortrijk-1-september-2025.jpg

Sources and licences: refs/SOURCES.md.
