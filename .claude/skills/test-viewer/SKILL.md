---
name: test-viewer
description: Run the SimKortrijk viewer tests (uitest, perf, tour) against a running dev server. Use after export when checking pan, zoom, load time and the binnenstad landmarks.
---

# Test the viewer

The scripts drive headless Chrome against a site that is already running. They do not start it. Export first, then:

```sh
npm run dev
```

Default URL is `SITE_URL` from `.env` (see `.env.example`, `http://localhost:4321/`). You can pass the URL as the first argument instead. Chrome is auto-detected (`CHROME_PATH`).

## Commands

From the repo root, in another shell:

```sh
npm -w pipeline exec tsx src/uitest.ts http://localhost:4321/
npm -w pipeline exec tsx src/perf.ts http://localhost:4321/
npm -w pipeline exec tsx src/tour.ts http://localhost:4321/ /tmp/kortrijk-tour
npm -w pipeline exec tsx src/traffictest.ts http://localhost:4321/ 2
```

| Script | What it checks | Success |
|---|---|---|
| `pipeline/src/uitest.ts` | Wheel zoom, drag, key toggles. Screenshots in `/tmp/ui_*.png`. | Prints `no errors`. A `PROBLEMS` line (any HTTP status ≥ 400, including a tile 404) means it failed; the script still exits 0, so read the log. |
| `pipeline/src/perf.ts` | Bytes and time while zooming out and in. | Prints a small table. A cold binnenstad view should be a few dozen tile requests, not hundreds of 404s. |
| `pipeline/src/tour.ts` | Screenshots at street and district scale for `PLACES` (Belfort, Sint-Maartenskerk, OLV-kerk, Begijnhof, Broeltorens, Leie). | `ok -> <outDir>` and a PNG per place. Pass place names to shoot a subset. |
| `pipeline/src/traffictest.ts` | Optional. `2` is simulated minutes of cars. | No overlap or speed errors on the printed summary. |

`pipeline/src/film.ts` is a clip renderer, not part of the default check. It needs ffmpeg and a running site: `npm -w pipeline exec tsx src/film.ts http://localhost:4321/ video/kortrijk.mp4 --preview`.

## Env

| Name | Required |
|---|---|
| `SITE_URL` | Only when you omit the URL argument. |
| `CHROME_PATH` | No. |
| `TILES_ORIGIN` | No, if `data/web/regions/kortrijk/` is complete. |

## Verify

- uitest exits 0. If it reports `404`, export again or fix the tile index before calling the test a pass.
- Tour PNGs show the binnenstad (church, square, river), the attribution bar, and no blank viewer.
- `npm run typecheck` is the static check; these scripts are the runtime check.
