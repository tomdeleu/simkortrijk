# Broeltorens render edit

Run this on the raw render **before** painting the Broeltorens windows. It rewrites four tiles (`-1` and `0` by `-2` and `-1`): cream stone towers with slate cones, and the Broelbrug from OSM way 567818112 (three arches, parapets, statue) lying low between the towers' feet.

```sh
pip install pillow numpy opencv-python-headless
python3 pipeline/landmarks/broeltorens/edit_broel.py
```

The first run copies those tiles to `data/derived/kortrijk-binnenstad/render.orig` and writes the edit into `render/`. That snapshot must be the raw massing. If `render/` is already this drawing and `render.orig/` is missing, re-render those four tiles before running it. Paint from the edit (`--near 50.83049,3.26704`). Then put the raw render back so the photo layer is not the drawing:

```sh
python3 pipeline/landmarks/broeltorens/edit_broel.py --restore
```

Needs `npm install` (the bridge is projected with `pipeline/src/camera.ts`). `--base` points at another derived directory. Do not change the region origin or heading. The cones are a bit squat; that is a known follow-up, not a reason to move the camera.
