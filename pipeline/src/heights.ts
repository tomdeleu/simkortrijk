/** Vertical datum and the renderer's height pass (one 256² PNG per render tile). */
import sharp from "sharp";

/**
 * Ellipsoid height of TAW 0 at Kortrijk. hBG18 / EGM2008 undulation is about 43.5 m here and
 * varies by only a few decimetres across the municipality, so one constant is enough.
 * Orthometric (TAW) + GEOID_M = ellipsoid height. The Leie is not at this level.
 */
export const GEOID_M = 43.5;
/** Typical binnenstad ground ellipsoid height (TAW ~16.5 m + geoid), for views and tile outlines. */
export const GROUND_M = 60;
/** Kept under the upstream name: paint's "open sea" test compares against it. Kortrijk has no sea. */
export const SEA_H = GEOID_M;

/** Decode a height PNG (ellipsoid height in cm + 10000, R<<8|G; alpha 0 = nothing rendered). */
export async function readHeights(file: string) {
  const buf = await sharp(file).ensureAlpha().raw().toBuffer();
  const n = buf.length / 4, h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = buf[i * 4 + 3] ? (buf[i * 4] * 256 + buf[i * 4 + 1]) / 100 - 100 : NaN;
  return h;
}
