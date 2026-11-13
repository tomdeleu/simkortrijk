# Collegebrug

Priority: **P2**

- OSM / ids: way 567809509 (cable-stayed, Q2632761), also way 375212756
- GRB / render: no building

## What it looks like

Footbridge and cycle bridge (2012, Ney & Partners), 203 m long. It zigzags in an S/zigzag line over the Leie near the Dambrug, hung from two slanted steel masts with cables. Grey metallised steel (#A7ABAE), slim triangular deck, no arch. It sits at the north edge of the area.

## Prompt line (draft)

Collegebrug: a slim grey steel footbridge zigzagging over the river, hung by cables from two leaning masts.

## Render fix

**Done (2026-11-13, Tom's feedback):** render edit `edit_collegebrug.ts`. The render had a flat path (the painter made a straight white line). Google satellite and Street View: an S-curve from the Diksmuidekaai over the Leie, a wide bend over the Budabeach park and on along the bank to the IJzerkaai, hung from sagging cables between two slanted A-masts on the two banks. The edit fills the ground path under the deck with what lies beside it and draws the deck (OSM line, DHMV height, ~4.5 m wide) in the painted path colour with a grey steel girder, railings, masts, cables and hangers. Run before painting windows `-2_-3` / `-1_-3`, then `--restore` (originals in `render.orig-collegebrug/`); it draws onto the current render, so run it after `leiebruggen/edit_r36brug.ts`.

## References

- refs/01-collegebrug-kortrijk.jpg
- refs/02-kortrijk-collegebrug.jpg
- refs/03-kortrijk-de-collegebrug-over-de-leie-img-6610-2023-06-06-10-.jpg

Sources and licences: refs/SOURCES.md.
