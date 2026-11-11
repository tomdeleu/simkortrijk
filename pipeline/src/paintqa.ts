/**
 * Whether a painted window is close enough to the render to keep.
 * Shared by the interactive painter and the Gemini batch retries.
 *
 * A dark band, or a weak edge-map match on a textured window, is repainted
 * (up to three attempts). Open water and empty lots (texture below MIN_TEXTURE)
 * skip the match check. A small drift is warped back by the caller when shouldWarp is true.
 */

export const MIN_MATCH = 0.45;
export const MIN_TEXTURE = 0.05;
/**
 * Max share of flat roof/wall interiors that grew a strong new edge.
 * Tile texture on the existing plane stays under this. A pitched roof on a flat block does not.
 */
export const MAX_ROOF_NOVELTY = 0.04;
export const MAX_ATTEMPTS = 3;

export interface PaintScore {
  score: number;
  identity: number;
  texture: number;
  dark: boolean;
  /** 1-based attempt. */
  attempt: number;
  /** From register.roofNovelty. Omitted in tests that only check the edge-map score. */
  roofNovelty?: number;
}

export function paintVerdict(input: PaintScore): "accept" | "retry" {
  if (input.dark && input.attempt < MAX_ATTEMPTS) return "retry";
  if ((input.roofNovelty ?? 0) > MAX_ROOF_NOVELTY && input.attempt < MAX_ATTEMPTS) return "retry";
  const structured = input.texture >= MIN_TEXTURE;
  if (structured && input.score < MIN_MATCH && input.attempt < MAX_ATTEMPTS) return "retry";
  return "accept";
}

/** Warp the paint back onto the render when the match is real and better than the unshifted image. */
export function shouldWarp(input: Pick<PaintScore, "score" | "identity" | "texture">): boolean {
  return input.texture >= MIN_TEXTURE && input.score > input.identity + 0.01;
}
