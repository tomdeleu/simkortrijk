/**
 * Where published map data lives. Shared by the pipeline and the web viewer.
 *
 * Tiles and region data are not in git or web/public: `npm run export` builds changed files into the
 * local cache (data/web/regions/<region>/), the dev server serves that cache on top of production,
 * and `npm run publish` uploads the cache to R2 and empties it.
 *
 * The public origin and the Cloudflare account come from the environment (.env, see .env.example).
 * In the browser there is no process.env: the web build injects the origin (astro.config.mjs).
 */
const env = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
function need(name: string): string {
  const v = env()[name];
  if (!v) throw new Error(`${name} is not set: add it to .env (see .env.example)`);
  return v;
}

/**
 * Public r2.dev origin of the `simkortrijk` bucket. Used when TILES_ORIGIN is not set at all, so
 * `npm run dev` and `npm run build` load the same tiles as the live site. Set `TILES_ORIGIN=` (empty)
 * to ship tiles inside the Worker instead. r2.dev is rate-limited: use a custom domain for production.
 */
export const DEFAULT_ORIGIN = "https://pub-74f69231228247acb76f1009b1fa86f5.r2.dev";

export const HOSTING = {
  /** R2 bucket of SimKortrijk (Cloudflare account CLOUDFLARE_ACCOUNT_ID). Not the isometricworld bucket. */
  bucket: "simkortrijk",
  get accountId() { return need("CLOUDFLARE_ACCOUNT_ID"); },
  /**
   * Public origin of the bucket, no trailing slash. Empty in a local-only checkout:
   * `npm run dev` then serves just the export cache and does not proxy to R2.
   */
  get origin() { return (env().TILES_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/+$/, ""); },
  /** Cache-Control per kind: tile URLs carry ?v=<content hash> and data/preview files their hash in the
   *  name, so they never change (cacheTiles); only data/world.json is rewritten in place (cacheData). */
  cacheTiles: "public, max-age=31536000, immutable",
  cacheData: "public, max-age=60, stale-while-revalidate=600",
};
