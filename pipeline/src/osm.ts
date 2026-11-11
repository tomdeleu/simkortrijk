/**
 * OpenStreetMap download for the ground, roads, and tree layers.
 * Overpass first (filtered). If every Overpass server is unreachable, the same
 * bbox is read from the OSM main map API and filtered here. The map API is the
 * fallback, not the default: it returns every object in the box.
 */
export const UA = { "User-Agent": "simkortrijk/0.1 (open-data isometric map of Kortrijk)" };

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export type BBox = [number, number, number, number]; // south, west, north, east
type OsmEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{ type: string; ref: number; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function overpass(
  query: string,
  fetchImpl: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = sleep,
): Promise<{ elements: OsmEl[] }> {
  let last = "no attempt";
  for (const url of OVERPASS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetchImpl(url, {
          method: "POST",
          headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(90_000),
        });
        if (r.ok) {
          if (url !== OVERPASS[0]) console.log(`  overpass via ${new URL(url).host}`);
          return await r.json();
        }
        last = `${new URL(url).host} ${r.status}`;
        console.warn(`  overpass ${last}, retrying…`);
      } catch (err) {
        last = `${new URL(url).host} ${(err as Error).message}`;
        console.warn(`  overpass unreachable (${last})`);
      }
      await pause(1500 * attempt);
    }
  }
  throw new Error(`overpass failed (${last})`);
}

/** Attach way and relation geometry from the node list, the way Overpass `out geom` does. */
export function attachGeometry(elements: OsmEl[]): { elements: OsmEl[] } {
  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const el of elements) if (el.type === "node" && el.lat != null && el.lon != null) nodes.set(el.id, { lat: el.lat, lon: el.lon });
  const ways = new Map<number, OsmEl>();
  for (const el of elements) {
    if (el.type !== "way" || !el.nodes) continue;
    el.geometry = el.nodes.flatMap((id) => {
      const n = nodes.get(id);
      return n ? [n] : [];
    });
    ways.set(el.id, el);
  }
  for (const el of elements) {
    if (el.type !== "relation" || !el.members) continue;
    for (const member of el.members) {
      if (member.type === "way") member.geometry = ways.get(member.ref)?.geometry;
    }
  }
  return { elements };
}

const ROAD = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|service)$/;
const RAIL = /^(rail|light_rail|tram)$/;
const LEISURE = /^(park|garden|pitch|playground|stadium|track|golf_course|dog_park|nature_reserve|recreation_ground)$/;
const NATURAL = /^(water|wood|scrub|grassland|wetland)$/;
const AMENITY = /^(parking|school|university|college|hospital|grave_yard|place_of_worship)$/;

export function keepBuildingsAndTrees(el: OsmEl): boolean {
  const t = el.tags ?? {};
  if (el.type === "node") return t.natural === "tree" || t.historic === "tower" || t.man_made === "tower";
  return (el.type === "way" || el.type === "relation") && "building" in t;
}

export function keepRoads(el: OsmEl): boolean {
  const t = el.tags ?? {};
  return el.type === "way" && ROAD.test(t.highway ?? "") && t.area !== "yes";
}

export function keepGround(el: OsmEl): boolean {
  const t = el.tags ?? {};
  if (el.type === "way") {
    if (t.highway && t.tunnel !== "yes" && t.tunnel !== "building_passage") return true;
    if (t["area:highway"]) return true;
    if (RAIL.test(t.railway ?? "") && t.tunnel !== "yes") return true;
  }
  if (t.landuse) return true;
  if (LEISURE.test(t.leisure ?? "")) return true;
  if (NATURAL.test(t.natural ?? "")) return true;
  if (t.water) return true;
  if (t.waterway === "riverbank") return true;
  if (AMENITY.test(t.amenity ?? "")) return true;
  if (t.place === "square") return true;
  if (t.historic === "tower") return true;
  return false;
}

/** OSM map API. bbox is west,south,east,north. Cells stay under the 0.25 deg² limit. */
export async function fetchOsmMap(bbox: BBox, fetchImpl: typeof fetch = fetch): Promise<OsmEl[]> {
  const [s, w, n, e] = bbox;
  const area = (n - s) * (e - w);
  if (area > 0.2) {
    const midLat = (s + n) / 2, midLon = (w + e) / 2;
    const parts = await Promise.all([
      fetchOsmMap([s, w, midLat, midLon], fetchImpl),
      fetchOsmMap([s, midLon, midLat, e], fetchImpl),
      fetchOsmMap([midLat, w, n, midLon], fetchImpl),
      fetchOsmMap([midLat, midLon, n, e], fetchImpl),
    ]);
    const seen = new Map<string, OsmEl>();
    for (const el of parts.flat()) seen.set(`${el.type}/${el.id}`, el);
    return [...seen.values()];
  }
  const url = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`;
  const r = await fetchImpl(url, { headers: UA, signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(`OSM map API ${r.status} for bbox ${w},${s},${e},${n}`);
  const body = await r.json() as { elements?: OsmEl[] };
  return body.elements ?? [];
}

/** Overpass when it answers. Otherwise the OSM map API, filtered to `keep`. */
export async function osmOrMap(
  query: string,
  bbox: BBox,
  keep: (el: OsmEl) => boolean,
  fetchImpl: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = sleep,
) {
  try {
    return await overpass(query, fetchImpl, pause);
  } catch (err) {
    console.warn(`  ${(err as Error).message}; using the OSM map API`);
    // Attach geometry first: the map API stores coordinates on nodes, and the filter drops those nodes.
    const attached = attachGeometry(await fetchOsmMap(bbox, fetchImpl)).elements.filter(keep);
    console.log(`  OSM map API: ${attached.length} elements kept`);
    return { elements: attached };
  }
}
