/**
 * Regions and cities of SimKortrijk. Pure data, shared by the pipeline and the web viewer.
 *
 * Adapted from Isometric World (Dmytro Krasun, MIT): https://github.com/krasun/isometricworld
 *
 * A REGION is one flat map: one orthographic camera in a local East-North-Up frame at its origin,
 * one tile pyramid under regions/<id>/ on R2 (or in the local export cache). A flat map stays
 * accurate for every city within ~150 km of its origin, so later Kortrijk municipalities can share it.
 *
 * A CITY is a named view into a region: /<city-slug> opens the region centred on it.
 *
 * origin and headingDeg are fixed once tiles exist. Changing either moves every tile.
 */

export interface Region {
  title: string;
  /** ENU origin. Fixed forever once tiles exist. */
  origin: { lat: number; lon: number; h: number };
  /** Compass bearing the camera looks toward (diagonal to the street grid; the Leie sits to the north). */
  headingDeg: number;
  /** OSM country (name:en of the admin_level=2 area) and municipality names (admin_level=8). */
  country: string;
  municipalities: string[];
  /** Airliners on final approach drawn over the map (optional). */
  airport?: { lat: number; lon: number; runwayHeadingDeg: number };
  /** Credit lines shown in video mode and on the map. */
  credits: string[];
}

export interface City {
  title: string;
  region: string;
  /** Opening view: centre and on-screen width in metres. */
  center: [number, number];
  widthM: number;
}

export const REGIONS: Record<string, Region> = {
  kortrijk: {
    title: "Kortrijk",
    // Belfort, Grote Markt. Do not move this once tiles have been exported.
    origin: { lat: 50.8275738, lon: 3.2656171, h: 0 },
    headingDeg: 20, // slightly east of north: two façades, Leie toward the top of the view
    country: "Belgium",
    municipalities: ["Kortrijk"],
    credits: [
      "Bron: Grootschalig Referentie Bestand Vlaanderen, Digitaal Vlaanderen",
      "© OpenStreetMap contributors · Hoogte: 3D GRB / DHMV II · Orthofoto zomer 2024, Digitaal Vlaanderen",
    ],
  },
};

export const CITIES: Record<string, City> = {
  kortrijk: {
    title: "Kortrijk",
    region: "kortrijk",
    center: [50.8275738, 3.2656171],
    widthM: 1500,
  },
};

export const DEFAULT_CITY = "kortrijk";
