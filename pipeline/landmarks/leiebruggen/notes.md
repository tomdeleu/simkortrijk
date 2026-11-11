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
