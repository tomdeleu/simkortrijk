/**
 * Deploy the built site (web/dist) to Cloudflare Workers on the custom domain SITE_DOMAIN (.env).
 * Outward-facing: run only when you mean to update the live site. `npm run deploy` builds first.
 */
import { spawnSync } from "node:child_process";
import { ROOT } from "./paths.ts";

const domain = process.env.SITE_DOMAIN;
// No SITE_DOMAIN: workers.dev (wrangler.jsonc workers_dev). A domain adds that route.
const args = ["wrangler", "deploy", ...(domain ? ["--domain", domain] : [])];
const r = spawnSync("npx", args, { cwd: ROOT, stdio: "inherit" });
process.exit(r.status ?? 1);
