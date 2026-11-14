# Landmarks

The massing render gets landmarks wrong: churches become one box at ridge height, spires become LiDAR prisms, and towers lose their roofs. Each landmark has a folder with `notes.md` (what it looks like, a prompt line, OSM/GRB ids, the render fix it needs) and `refs/` (small Wikimedia Commons copies, licences in `refs/SOURCES.md`). `broeltorens/` also has `edit_broel.py`, the worked example of a render edit.

Priority is visual weight on the map (height, footprint, how well-known it is).

| prio | folder | landmark | main fix |
|---|---|---|---|
| P1 | broeltorens | Broeltorens + Broelbrug | done (edit_broel.py); OSM roof:colour is wrong (dark green) |
| P1 | sint-maartenskerk | Sint-Maartenskerk, 83 m | done (massing.json): three nave gables, transept, brick choirs, pale stone tower, slate spire + 4 pinnacles |
| P1 | belfort | Belfort / Halletoren | slate needle spire + 4 corner spires on a red-brick shaft |
| P1 | onze-lieve-vrouwekerk | OLV-kerk + Gravenkapel | grey stone, two squat towers with low slate pyramids, cross gables |
| P1 | stadhuis | Historisch stadhuis | white stone front, slate gable, dormers, ridge turret |
| P1 | begijnhof | Sint-Elisabethbegijnhof | whitewash + red pantiles override, open square with one tree |
| P2 | artillerietoren | Artillerietoren | bright red walls, slate pyramid |
| P2 | sint-michielskerk | Sint-Michielskerk | brick walls, two needle-spired towers |
| P2 | sint-elooiskerk | Sint-Elooiskerk | brick, one tall slate spire (56 m) |
| P2 | k-in-kortrijk | K in Kortrijk | done (massing.json): dark stone block at 16.8 m, glass hip roof to 25 m |
| P2 | sint-janstoren | Sint-Janstoren | done (massing.json + colours.json): white stepped tower, dark plinth, roof garden |
| P2 | buda | Budatoren, Budafabriek, Budabrug | glass-clad tower, brick halls, steel bridge |
| P2 | collegebrug | Collegebrug | zigzag deck, two leaning masts with cables |
| P2 | leiebruggen | Leie bridges | modern flat decks, Noordbrug mast |
| P2 | station | Station | done (massing.json): buff brick, raised hall, platform canopies, bike parking |
| P2 | damiaankerk | Damiaankerk (Karmelieten) | done (massing.json): brick nave with gable, rose window front, turret |
| P3 | karmelietenklooster | Karmelietenklooster | done (massing.json): brick wings with red gable roofs around the garth |
| P2 | schouwburg | Stadsschouwburg | brick + white stone, stepped gables, slate |
| P3 | groeningeabdij | Groeningeabdij (Abby) | brick wings with steep tiled roofs |
| P3 | baggaertshof | Baggaertshof | done (colours.json): whitewash + red pantiles |
| P2 | sint-janskerk | Sint-Janskerk | done (massing.json): buff stone cruciform church, crossing tower with slate needle + turrets |
| P3 | verrijzeniskerk | Verrijzeniskerk | done (massing.json): round white church, green copper cone, lantern and spire |
| P3 | athena-pottelberg | Athena campus Pottelberg | done (massing.json): gabled school wings instead of a flat 27 m block |
| P3 | wildernis | De Wildernis | done (massing.json): low timber hut instead of a 14 m DSM block |
| P2 | k-tower | K Tower | done (massing.json): white 66 m residential tower (missing: the DSM predates it) |
| P2 | sint-amandscollege | Sint-Amandscollege / Guldensporencollege | done (colours.json: red brick + slate; massing.json: the quay school 14 m dark glass instead of the old Collegetoren's 58 m) |
| P3 | hoog-mosscher | Hoog Mosscher | done (massing.json): brick château, slate hipped roof, turret |
| P3 | newfoundland-memorial | Newfoundland Memorial | done (massing.json): granite cairn with a bronze caribou |
| P3 | sint-rochuskerk | Sint-Rochuskerk | done (massing.json): dark brick, one slate roof, apse, brick tower with slate needle + 4 pinnacles |
| P3 | hangar-k | Hangar K | done (massing.json): 16 red gabled bays on a brick hall |
| P3 | groeningemonument | Groeningemonument + poort | statue in park |
| - | _city | oblique aerials of the binnenstad | palette check for building_colours.py |

Two ways to fix a landmark in the render:

- `massing.json` (preferred, real 3D, occlusion and lighting are right): `npm run scene` replaces the GRB footprint(s) in `replace_oidn`, and any LiDAR needle standing inside them, with hand-built parts. Parts are `rect` [u0, u1, v0, v1], `oct` [u, v, radius], `poly` [[u, v], ...] or `footprint: "grb"`, in metres around `anchor` (lat, lon) with u along `axis_deg` (Lambert 72, degrees CCW from grid east). `shape` is `flat`, `gable-u` / `gable-v` (ridge along u or v, walls up to `eave`), or `pyramid` (walls up to `eave`, facets to the apex at `h`: spires, tent roofs). `style` 6 is Gothic stone (lancet windows), 4 is plain. `wall` / `roof` are 0..1 sRGB. See `sint-maartenskerk/massing.json`.
- `colours.json` (colour only): an OSM area polygon plus a wall name and roof class from `pipeline/tools/building_colours.py`; every GRB footprint whose centre lies inside gets those colours (`begijnhof/colours.json`). Rerun `building_colours.py`, then `npm run scene`.
- A 2D render edit script like `broeltorens/edit_broel.py` (for things the renderer cannot extrude, such as the arched Broelbrug).

Workflow for a new landmark, as with the Broeltorens: look it up (Onroerend Erfgoed inventory text gives materials, Wikimedia Commons gives photos), write `notes.md`, then either add a `massing.json`, fix the scene data (heights, gables, colours in `pipeline/tools/building_colours.py`) or draw a render edit script like `edit_broel.py` that runs before painting and restores after. Paint the windows over it with `--near lat,lon`.

Reference images are for look-up only. Screenshots Tom shares from Google Street View or Maps may be looked at for shapes and colours (AGENTS.md rule 1) but are not saved here. Do not paste them into the paint request as style images unless their licence allows it (most are CC BY / CC BY-SA, see SOURCES.md).
