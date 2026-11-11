# Partial paint block

`assemble_block.py` turns a finished rectangle of paint windows into `paint/` tiles. Inside the block, windows blend with the usual 64 px overlap. At the edge, where the next tile is still the raw render, the paint feathers out over about 220 px. `npm run paint -- --assemble` does not do that edge: it only blends windows, so a half-painted map gets a hard seam. Use this instead, then export.

Broeltorens block (the six tiles that are painted on the live map):

```sh
pip install pillow numpy scipy
python3 pipeline/tools/assemble_block.py
```

That reads `data/derived/kortrijk-binnenstad/windows/{i}_{j}.png` for `i` in -2..0 and `j` in -3..-1, and writes `paint/{tx}_{ty}.png` for `tx` in -2..0 and `ty` in -2..-1. Another block:

```sh
python3 pipeline/tools/assemble_block.py --windows=-1..1,-1..1 --tiles=-1..1,-1..0 --feather=220
```

A window that will not paint right (wrong geometry after retries) can be left out with `--skip=i_j[,i_j]`: that area stays render and the paint feathers into it. The live Broeltorens block uses `--skip=-2_-3`.

`--base` points at another derived directory. Windows and render tiles must already be on disk. This does not call Gemini and does not publish.
