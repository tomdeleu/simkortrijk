# Nationaal Leiemonument

Priority: **P2** (Koning Albertpark, by the R36 roundabout north of the Leie; tile `-1_-3`, windows `-1_-4` / `-1_-3`)

- No OSM or GRB object in our data (Google Maps: "Nationaal Leiemonument"). Protected monument ("Leiegedenkteken met Luikse gedenksteen").

## What it looks like

WWII memorial for the Battle of the Leie (May 1940): a tall slender white-grey stone pylon on a stepped terrace, in front of it a dark bronze equestrian statue of King Leopold III with standing soldiers; a long low grey stone wall around the lawn. Sources: [TracesOfWar](https://www.tracesofwar.com/sights/148117/Monument-Leieslag-1940-Kortrijk.htm).

## Render fix

**Done (2026-11-14, Tom's feedback):** `massing.json` without GRB footprint (empty `replace_oidn`, new in `scene.ts`): terrace, a 27 m pylon (DSM tip 24.5 m, under-sampled) and the bronze group.
