import { CAMERA, llhToPixel, useRegion } from "./camera.ts";

/**
 * A rendered patch of a region (see places.ts); all pipeline steps work per area.
 * kortrijk-binnenstad is the area this repo builds. `kortrijk` is the whole municipality
 * (~54k buildings): same camera, same commands, a much larger fetch and render.
 */
export interface Area {
  title: string;
  region: string;
  /** south, west, north, east (WGS84) */
  bbox: [number, number, number, number];
}

export const AREAS: Record<string, Area> = {
  /**
   * ~800 m around the Belfort: Grote Markt, Sint-Maartenskerk, Onze-Lieve-Vrouwekerk,
   * Begijnhof, Broeltorens and the Leie quays.
   * Belfort 50.8275738, 3.2656171; 800 m ≈ 0.007186° lat, 0.011377° lon.
   */
  "kortrijk-binnenstad": {
    title: "Kortrijk binnenstad",
    region: "kortrijk",
    bbox: [50.820387, 3.254240, 50.834760, 3.276994],
  },
  /** Whole municipality (OSM relation 961284). Defined so the region scales; not fetched by default. */
  kortrijk: {
    title: "Kortrijk",
    region: "kortrijk",
    bbox: [50.7310311, 3.2007699, 50.8746384, 3.3590759],
  },
};

/** Look up an area and switch the camera to its region: call before any projection. */
export function openArea(name: string): Area {
  const area = AREAS[name];
  if (!area) throw new Error(`unknown area ${name} (have ${Object.keys(AREAS).join(", ")})`);
  useRegion(area.region);
  return area;
}

/**
 * Ground ellipsoid height for outlines and the opening view.
 * Matches GROUND_M in heights.ts (TAW ~16.5 m + geoid 43.5 m). Kept as a literal so the
 * browser bundle does not import heights.ts, which depends on sharp.
 */
export const GROUND_H = 60;

type Pt = [number, number];

/** Area outline in global art pixels (the bbox projected at ground level: a slanted quad). */
export function areaPolygon(bbox: [number, number, number, number]): Pt[] {
  const [s, w, n, e] = bbox;
  return [[s, w], [s, e], [n, e], [n, w]].map(([lat, lon]) => llhToPixel(lat, lon, GROUND_H));
}

export function inside([x, y]: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Render tiles whose centre lies inside the area outline. */
export function areaTiles(bbox: [number, number, number, number]) {
  const poly = areaPolygon(bbox);
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const out: Array<[number, number]> = [];
  for (let ty = Math.floor(Math.min(...ys) / CAMERA.tile); ty <= Math.floor(Math.max(...ys) / CAMERA.tile); ty++)
    for (let tx = Math.floor(Math.min(...xs) / CAMERA.tile); tx <= Math.floor(Math.max(...xs) / CAMERA.tile); tx++)
      if (inside([(tx + 0.5) * CAMERA.tile, (ty + 0.5) * CAMERA.tile], poly)) out.push([tx, ty]);
  return out;
}

/** Distance (art px) from a point inside a convex outline to its nearest edge; ≤ 0 outside. */
export function insideDistance([x, y]: Pt, poly: Pt[]) {
  if (!inside([x, y], poly)) return 0;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}
