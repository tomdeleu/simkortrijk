/**
 * OSM map-API fallback: geometry attachment and the filters fetch uses when Overpass is down.
 *   npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attachGeometry, keepBuildingsAndTrees, keepGround, keepRoads, osmOrMap } from "./osm.ts";

describe("osm fallback", () => {
  test("ways and relations gain geometry from nodes", () => {
    const { elements } = attachGeometry([
      { type: "node", id: 1, lat: 50.82, lon: 3.26 },
      { type: "node", id: 2, lat: 50.83, lon: 3.27 },
      { type: "way", id: 9, nodes: [1, 2], tags: { highway: "residential" } },
      { type: "relation", id: 3, members: [{ type: "way", ref: 9, role: "outer" }], tags: { landuse: "residential" } },
    ]);
    const way = elements.find((el) => el.type === "way");
    assert.deepEqual(way?.geometry, [{ lat: 50.82, lon: 3.26 }, { lat: 50.83, lon: 3.27 }]);
    assert.deepEqual(elements.find((el) => el.type === "relation")?.members?.[0].geometry, way?.geometry);
  });

  test("filters match the binnenstad queries", () => {
    assert.equal(keepBuildingsAndTrees({ type: "way", id: 1, tags: { building: "yes" } }), true);
    assert.equal(keepBuildingsAndTrees({ type: "node", id: 2, tags: { natural: "tree" } }), true);
    assert.equal(keepBuildingsAndTrees({ type: "node", id: 3, tags: { amenity: "cafe" } }), false);
    assert.equal(keepRoads({ type: "way", id: 4, tags: { highway: "residential" } }), true);
    assert.equal(keepRoads({ type: "way", id: 5, tags: { highway: "footway" } }), false);
    assert.equal(keepGround({ type: "way", id: 6, tags: { highway: "primary", tunnel: "yes" } }), false);
    assert.equal(keepGround({ type: "way", id: 7, tags: { leisure: "park" } }), true);
    assert.equal(keepGround({ type: "node", id: 8, tags: { amenity: "cafe" } }), false);
  });

  test("when Overpass is unreachable, the map API result is filtered and given geometry", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("overpass")) throw new Error("connect ECONNREFUSED");
      assert.match(url, /api\.openstreetmap\.org\/api\/0\.6\/map\.json\?bbox=3.25,50.82,3.27,50.83/);
      return Response.json({
        elements: [
          { type: "node", id: 1, lat: 50.825, lon: 3.26 },
          { type: "node", id: 2, lat: 50.826, lon: 3.261 },
          { type: "way", id: 10, nodes: [1, 2], tags: { building: "yes" } },
          { type: "way", id: 11, nodes: [1, 2], tags: { highway: "footway" } },
        ],
      });
    };
    const data = await osmOrMap("query", [50.82, 3.25, 50.83, 3.27], keepBuildingsAndTrees, fetchImpl, async () => {});
    assert.equal(data.elements.length, 1);
    assert.equal(data.elements[0].id, 10);
    assert.equal(data.elements[0].geometry?.length, 2);
  });
});
