/**
 * Repaint the open-data 3D render into one illustrated style.
 *
 * Default painter: Gemini Nano Banana (`gemini-nano-banana-2.1`) via GEMINI_API_KEY.
 * A small run calls generateContent per window. More than 12 windows (or `--batch`)
 * uses the Gemini Batch API at half price. `--interactive` forces per-window calls.
 * Codex (`PAINT_PROVIDER=codex`) and OpenAI (`PAINT_PROVIDER=openai`) stay available.
 *
 * Painting happens in overlapping 1024px windows on a global grid (stride 896). Each window gets
 * its already-painted neighbours (any side) pasted into the 128 px overlap, then windows are feather-blended
 * into 1024px art tiles aligned with the render tiles. Every result is checked against the render
 * and repainted up to three times.
 *
 *   npm run paint -- kortrijk-binnenstad --plan
 *   npm run paint -- kortrijk-binnenstad --near 50.82757,3.26562 --radius 1
 *   npm run paint -- kortrijk-binnenstad --window 4,-3
 *   npm run paint -- kortrijk-binnenstad --batch
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import sharp, { type OverlayOptions } from "sharp";
import { GROUND_H, openArea } from "./areas.ts";
import { CAMERA, llhToPixel } from "./camera.ts";
import { DERIVED, PIPELINE, readJson, writeAtomic } from "./paths.ts";
import { SEA_H, readHeights } from "./heights.ts";
import { applyRegistration, register, roofNovelty } from "./register.ts";
import {
  PRICE_1K_USD, choosePaintMode, estimateUsd, geminiEdit, runGeminiBatch, type GeminiImage,
} from "./gemini.ts";
import { MAX_ATTEMPTS, MAX_ROOF_NOVELTY, MIN_MATCH, MIN_TEXTURE, paintVerdict, shouldWarp } from "./paintqa.ts";

const WIN = 1024, OVERLAP = 128, STRIDE = WIN - OVERLAP, T = CAMERA.tile;
/** Blend band in the middle of each overlap; outside it a window's own pixels win outright. */
const FEATHER = 64;
const STYLE = join(PIPELINE, "style", "reference.png");
const TREES = join(PIPELINE, "style", "trees.png"); // pastel mint and sage crowns, style C
const SEA = join(PIPELINE, "style", "sea.png");
/** Background of the model input outside the map (cream paper). */
const PAPER = { r: 246, g: 241, b: 231 };
/** Style A (style C, more contrast, blue water) plus the shared geometry lock. Used by every painter. */
const GEOMETRY_LOCK = `Follow the source massing render as a strict geometric template. Preserve every \
building position, footprint, height, roof outline, street, square, water, and \
tree. Do not add, remove, move, merge, or invent buildings, towers, bridges, \
rivers, vehicles, people, or landmarks. Do not copy objects from any style \
reference (no glass skyscrapers, palm trees, jacarandas, solar farms, or extra \
churches). You may add painted windows, shutters, facade color variation, \
roof-tile texture, cobblestones, and richer deciduous tree canopies, but \
silhouettes and positions must stay identical. Keep the same isometric camera, \
framing, and crop. Empty map-edge background (plain cream paper) stays empty: paint no city there. No text, labels, \
borders, or watermarks.
Flat roof planes in the massing stay flat. Paint blush or coral tile colour on that existing plane only. \
Do not add hips, ridges, gables, or pitched roofs that change the silhouette.`;

/** Style A (chosen 11 Nov 2026): style C with stronger contrast and clear blue water. */
const STYLE_A = `Bright, stylised isometric city-map illustration with a cozy city-builder / \
storybook-game finish. Blush and coral roofs, peach and cream walls, mint and sage tree canopies, \
pale lavender-grey streets, simplified charming window dots, clean soft shapes. Still a clear \
illustrated map, not photorealistic. Compared to a soft pastel map: noticeably MORE CONTRAST \
(deeper shadows on the shaded facades, clearer light/dark separation between roofs, walls and \
streets). Rivers, canals and ponds are a TRUE CLEAR BLUE (around #2F7FD6), saturated and \
unmistakably blue, NOT mint, teal or turquoise, with a few lighter blue ripple highlights. \
Conical tower roofs and spires are slate blue-grey (around #6B7A90), not black or anthracite. \
Keep everything else in the pastel style.`;

const PROMPT = `Four images are attached, in order:
1. input.png: an orthographic massing render (camera tilted 45° down, no perspective) of {title}, Belgium, \
built from Flemish open data. ~256 m across. Layout is exact. Colours are flat placeholders.
2. height.png: the height map from the SAME camera, pixel-aligned with image 1. Black = ground, \
brighter = taller. Use it for footprints and heights. Church spires and the belfry stay the tallest objects.
3. style.png: STYLE ONLY. A painted tile in the target style (contrast, blue water, slate cones). Do not copy its buildings, streets, or towers into this frame.
4. trees.png: pastel crowns for this style. Round mint and sage canopies, one narrow poplar. \
Repaint every tree already in image 1 with these canopies. Do not add or move trees. Do not use dark forest green.

${GEOMETRY_LOCK}

Style: ${STYLE_A}
{continuation}Output: one square 1024x1024 image, no text, no labels, no border, no vignette.

When done, copy the final PNG to {out} and reply only with that path.
`;
const CONTINUATION = `- The strip(s) along the {edges} edge(s) of image 1 are ALREADY-PAINTED neighbouring artwork. \
Reproduce them unchanged and continue the same palette and detail seamlessly into the rest.
`;

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    plan: { type: "boolean", default: false },
    window: { type: "string" },
    near: { type: "string" },
    radius: { type: "string", default: "1" },
    force: { type: "boolean", default: false },
    // repaint windows painted before this time (e.g. after a style change); runs alongside a normal paint
    older: { type: "string" },
    assemble: { type: "boolean", default: false }, // only rebuild every art tile from the windows
    batch: { type: "boolean", default: false }, // Gemini Batch API (half price; default above 12 windows)
    interactive: { type: "boolean", default: false }, // one Gemini generateContent call per window
    j: { type: "string", default: "3" },
    center: { type: "string", default: "50.8275738,3.2656171" }, // Belfort, painted first
  },
});
const areaName = positionals[0] ?? "kortrijk-binnenstad";
const base = join(DERIVED, areaName);
const manifest = readJson(join(base, "manifest.json"));
const title = openArea(areaName).title;
const OLDER = args.older ? new Date(args.older).getTime() : 0;
const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);
/** painted in the current style (with --older, windows painted before the cut-off don't count) */
const current = (i: number, j: number) => existsSync(winFile(i, j)) && mtime(winFile(i, j)) >= OLDER;
const tileSet = new Set<string>(manifest.tiles.map((t: any) => `${t.x}_${t.y}`));
const winDir = join(base, "windows");
mkdirSync(winDir, { recursive: true });

const renderFile = (tx: number, ty: number) => join(base, "render", `${tx}_${ty}.png`);
const winFile = (i: number, j: number) => join(winDir, `${i}_${j}.png`);

/** Crop a global-pixel box out of tiles produced by `load(tx, ty)` (1024² PNG buffers or null). */
async function cropGlobal(x: number, y: number, w: number, h: number,
  load: (tx: number, ty: number) => Promise<Buffer | null> = async (tx, ty) =>
    existsSync(renderFile(tx, ty)) ? sharp(renderFile(tx, ty)).png().toBuffer() : null,
  background: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }) {
  const comps: OverlayOptions[] = [];
  for (let ty = Math.floor(y / T); ty <= Math.floor((y + h - 1) / T); ty++)
    for (let tx = Math.floor(x / T); tx <= Math.floor((x + w - 1) / T); tx++) {
      const buf = await load(tx, ty);
      if (!buf) continue;
      const left = tx * T - x, top = ty * T - y;
      const sx = Math.max(0, -left), sy = Math.max(0, -top);
      const width = Math.min(T - sx, w - Math.max(0, left)), height = Math.min(T - sy, h - Math.max(0, top));
      comps.push({ input: await sharp(buf).extract({ left: sx, top: sy, width, height }).toBuffer(), left: Math.max(0, left), top: Math.max(0, top) });
    }
  return sharp({ create: { width: w, height: h, channels: 4, background: { ...background, alpha: 1 } } }).composite(comps);
}

/** Height pass as a grayscale structure image: black = ground, white = 60 m above `ground`. */
async function heightTile(tx: number, ty: number, ground: number): Promise<Buffer | null> {
  const f = join(base, "height", `${tx}_${ty}.png`);
  if (!existsSync(f)) return null;
  const h = await readHeights(f);
  const g = Buffer.alloc(h.length);
  for (let i = 0; i < h.length; i++) g[i] = Number.isNaN(h[i]) ? 0 : Math.max(0, Math.min(255, Math.sqrt(Math.max(0, h[i] - ground) / 60) * 255));
  return sharp(g, { raw: { width: 256, height: 256, channels: 1 } }).resize(T, T, { kernel: "cubic" }).png().toBuffer();
}

/** Local ground level of a window: low percentile of all surface heights it covers. */
async function windowGround(x: number, y: number) {
  const all: number[] = [];
  for (let ty = Math.floor(y / T); ty <= Math.floor((y + WIN - 1) / T); ty++)
    for (let tx = Math.floor(x / T); tx <= Math.floor((x + WIN - 1) / T); tx++) {
      const f = join(base, "height", `${tx}_${ty}.png`);
      if (existsSync(f)) for (const v of await readHeights(f)) if (!Number.isNaN(v) && v > SEA_H - 0.5) all.push(v);
    }
  all.sort((a, b) => a - b);
  return all[Math.floor(all.length * 0.05)] ?? SEA_H;
}

function windows(): Array<[number, number]> {
  const out = new Set<string>();
  for (const k of tileSet) {
    const [tx, ty] = k.split("_").map(Number);
    for (let j = Math.floor((ty * T - WIN) / STRIDE) + 1; j * STRIDE < (ty + 1) * T; j++)
      for (let i = Math.floor((tx * T - WIN) / STRIDE) + 1; i * STRIDE < (tx + 1) * T; i++)
        out.add(`${i}_${j}`);
  }
  return [...out].map((s) => s.split("_").map(Number) as [number, number]);
}

async function composeInput(i: number, j: number, file: string, heightFile: string) {
  const ground = await windowGround(i * STRIDE, j * STRIDE);
  await (await cropGlobal(i * STRIDE, j * STRIDE, WIN, WIN, (tx, ty) => heightTile(tx, ty, ground))).png().toFile(heightFile);
  // lift baked photogrammetry shadows so footprints and streets read clearly
  // outside the map is plain paper, not black: on black the model invents a city there and
  // leaves the real part of the window unpainted
  const lifted = await sharp(await (await cropGlobal(i * STRIDE, j * STRIDE, WIN, WIN, undefined, PAPER)).png().toBuffer())
    .removeAlpha().clahe({ width: 128, height: 128, maxSlope: 2 }).modulate({ saturation: 1.1 }).png().toBuffer();
  const img = sharp(lifted);
  const comps: OverlayOptions[] = [];
  const edges: string[] = [];
  // already-painted neighbours on any side: paste their overlap strip so this window continues them
  const sides: Array<[string, number, number, { left: number; top: number; width: number; height: number }, number, number]> = [
    ["left", i - 1, j, { left: STRIDE, top: 0, width: OVERLAP, height: WIN }, 0, 0],
    ["right", i + 1, j, { left: 0, top: 0, width: OVERLAP, height: WIN }, STRIDE, 0],
    ["top", i, j - 1, { left: 0, top: STRIDE, width: WIN, height: OVERLAP }, 0, 0],
    ["bottom", i, j + 1, { left: 0, top: 0, width: WIN, height: OVERLAP }, 0, STRIDE],
  ];
  for (const [side, ni, nj, box, left, top] of sides) {
    if (!current(ni, nj)) continue; // old-style neighbours are being repainted too: don't continue them
    comps.push({ input: await sharp(winFile(ni, nj)).resize(WIN, WIN).extract(box).toBuffer(), left, top });
    edges.push(side);
  }
  await sharp(await img.png().toBuffer()).composite(comps).png().toFile(file);
  return edges;
}

/** Codex/ChatGPT usage or rate limit: every worker pauses until `resumeAt`, then retries. */
let resumeAt = 0, backoff = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LIMIT = /usage limit|rate.?limit|too many requests|\b429\b|quota/i;

/** How long a limit message asks us to wait (ms); falls back to exponential backoff 5 → 60 min. */
function limitWait(log: string) {
  const at = log.match(/try again at ([0-9]{1,2}:[0-9]{2}\s*(?:[AP]M)?)/i);
  if (at) {
    const [, t] = at, [h, m] = t.match(/\d+/g)!.map(Number), pm = /pm/i.test(t), am = /am/i.test(t);
    const d = new Date();
    d.setHours(pm && h < 12 ? h + 12 : am && h === 12 ? 0 : h, m, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime() - Date.now() + 60_000;
  }
  const inMin = log.match(/try again in (\d+)\s*(second|minute|hour)/i);
  if (inMin) return Number(inMin[1]) * ({ second: 1e3, minute: 6e4, hour: 36e5 } as Record<string, number>)[inMin[2].toLowerCase()] + 30_000;
  backoff = Math.min(60, backoff ? backoff * 2 : 5);
  return backoff * 60_000;
}

type Painter = "gemini" | "codex" | "openai";
let painter: Painter = "gemini";

/** Gemini (default), Codex CLI, or OpenAI Images. */
function ensurePainter(): Painter {
  for (const f of [STYLE, TREES]) {
    if (!existsSync(f)) throw new Error(`missing ${f}. pipeline/style/ holds original SimKortrijk sheets, not the Tel Aviv images from isometricworld.`);
  }
  const provider = (process.env.PAINT_PROVIDER || "gemini").toLowerCase();
  if (provider === "gemini") {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("PAINT_PROVIDER=gemini needs secret GEMINI_API_KEY. Optional GEMINI_IMAGE_MODEL (default gemini-nano-banana-2.1).");
    }
    return "gemini";
  }
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("PAINT_PROVIDER=openai needs secret OPENAI_API_KEY (Images API). Optional OPENAI_IMAGE_MODEL (default gpt-image-1).");
    return "openai";
  }
  if (provider !== "codex") throw new Error(`unknown PAINT_PROVIDER=${provider} (use gemini, codex, or openai)`);
  const which = spawnSync("codex", ["--version"], { encoding: "utf8" });
  if (which.status !== 0) {
    throw new Error([
      "PAINT_PROVIDER=codex needs the Codex CLI (`codex` on PATH, ChatGPT login, no API key).",
      "The default painter is Gemini: set GEMINI_API_KEY (model gemini-nano-banana-2.1).",
      "Style sheets: pipeline/style/reference.png and pipeline/style/trees.png.",
      "Without a painter, npm run export still builds the viewer from the 3D render.",
    ].join("\n"));
  }
  return "codex";
}

function windowImages(work: string): GeminiImage[] {
  return ["input.png", "height.png", "style.png", "trees.png"].map((name) => ({
    name, mimeType: "image/png", bytes: readFileSync(join(work, name)),
  }));
}

function providerLog(work: string): string {
  for (const name of ["paint.log", "codex.log"]) {
    const file = join(work, name);
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  return "";
}

async function openaiPaint(cwd: string, prompt: string): Promise<void> {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", "1024x1024");
  form.set("quality", process.env.OPENAI_IMAGE_QUALITY || "high");
  // keep the pasted neighbour strips and the render layout as close to the input as the model allows
  const fidelity = process.env.OPENAI_INPUT_FIDELITY ?? "high";
  if (fidelity) form.set("input_fidelity", fidelity);
  for (const file of ["input.png", "height.png", "style.png", "trees.png"]) {
    const bytes = readFileSync(join(cwd, file));
    form.append("image[]", new Blob([bytes], { type: "image/png" }), file);
  }
  const send = () => fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(600_000),
  });
  let r = await send();
  let text = await r.text();
  // a model that does not take input_fidelity: send again without it
  if (r.status === 400 && fidelity && /input_fidelity/i.test(text)) {
    form.delete("input_fidelity");
    r = await send();
    text = await r.text();
  }
  writeFileSync(join(cwd, "codex.log"), `${r.status} ${model}\n${text.slice(0, 6000)}`);
  if (!r.ok) return;
  try {
    const body = JSON.parse(text);
    if (body.usage) appendFileSync(join(base, "openai-usage.jsonl"), JSON.stringify({ at: new Date().toISOString(), window: cwd.split("/").pop(), model, ...body.usage }) + "\n");
    const b64 = body.data?.[0]?.b64_json as string | undefined;
    if (b64) writeFileSync(join(cwd, "out.png"), Buffer.from(b64, "base64"));
  } catch { /* the caller reads codex.log */ }
}

function codex(cwd: string, prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const log = openSync(join(cwd, "codex.log"), "w");
    const p = spawn("codex", ["exec", "--skip-git-repo-check", "-s", "workspace-write", "-C", cwd, "-i", "input.png", "-i", "height.png", "-i", "style.png", "-i", "trees.png", "-"],
      { stdio: ["pipe", log, log] });
    const timer = setTimeout(() => p.kill("SIGTERM"), 900_000);
    p.on("close", () => { clearTimeout(timer); closeSync(log); resolve(); });
    p.stdin!.end(prompt);
  });
}

/** Share of a window's surface at sea level (from the height pass). */
async function seaFraction(i: number, j: number) {
  let wet = 0, n = 0;
  for (let y = j * STRIDE; y < j * STRIDE + WIN; y += 32)
    for (let x = i * STRIDE; x < i * STRIDE + WIN; x += 32) {
      const tx = Math.floor(x / T), ty = Math.floor(y / T), f = join(base, "height", `${tx}_${ty}.png`);
      if (!existsSync(f)) continue;
      const h = (await readHeights(f))[Math.floor((y - ty * T) / 4) * 256 + Math.floor((x - tx * T) / 4)];
      n++;
      if (h <= SEA_H + 0.3) wet++;
    }
  return n ? wet / n : 0;
}

/** Mean brightness of each cell of an 8×8 grid (catches black bands or patches a mean over the image hides). */
async function cells(file: string | Buffer) {
  const d = await sharp(file).removeAlpha().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  return Array.from({ length: 64 }, (_, k) => (d[k * 3] + d[k * 3 + 1] + d[k * 3 + 2]) / 3);
}

/** Codex sometimes returns black bands or near-black images: any cell much darker than the render. */
async function hasDarkPatch(out: string | Buffer, input: string | Buffer) {
  const [o, n] = [await cells(out), await cells(input)];
  return o.some((v, k) => v < 40 && v < 0.5 * n[k]);
}

/** Blue everywhere and not dark (checked per cell). */
async function looksLikeSea(file: string) {
  const d = await sharp(file).removeAlpha().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  for (let k = 0; k < 64; k++) if (d[k * 3 + 2] < 80 || d[k * 3 + 2] < d[k * 3] + 25) return false;
  return true;
}

/** Delete finished windows with a black band or patch the render doesn't have, so they get repainted. */
async function dropDarkWindows(wins: Array<[number, number]>) {
  let n = 0;
  for (const [i, j] of wins) {
    if (!existsSync(winFile(i, j))) continue;
    const render = await (await cropGlobal(i * STRIDE, j * STRIDE, WIN, WIN)).png().toBuffer();
    if (await hasDarkPatch(winFile(i, j), render)) { rmSync(winFile(i, j)); n++; console.warn(`  ${i}_${j}: black patch, will repaint`); }
  }
  if (n) console.log(`  dropped ${n} windows with black patches`);
}

async function paintWindow(i: number, j: number) {
  if (existsSync(winFile(i, j)) && !args.force && !(OLDER && !current(i, j))) return;
  // open sea: reuse the painted sea texture (mirrored per window so repeats don't line up)
  if (existsSync(SEA) && (await seaFraction(i, j)) >= 0.995) {
    let img = sharp(SEA).resize(WIN, WIN);
    if ((i + j) & 1) img = img.flop();
    if (j & 1) img = img.flip();
    await writeAtomic(img.png(), winFile(i, j));
    console.log(`  ${i}_${j}: sea texture`);
    return;
  }
  const work = join(base, "work", `${i}_${j}`);
  mkdirSync(work, { recursive: true });
  const edges = await composeInput(i, j, join(work, "input.png"), join(work, "height.png"));
  copyFileSync(STYLE, join(work, "style.png"));
  copyFileSync(TREES, join(work, "trees.png"));
  const prompt = windowPrompt(edges, join(work, "out.png"), painter !== "codex");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    while (Date.now() < resumeAt) await sleep(Math.min(60_000, resumeAt - Date.now()));
    rmSync(join(work, "out.png"), { force: true });
    const t0 = Date.now();
    if (painter === "gemini") {
      const edited = await geminiEdit(prompt, windowImages(work));
      writeFileSync(join(work, "paint.log"), edited.log);
      if (edited.png) writeFileSync(join(work, "out.png"), edited.png);
    } else if (painter === "openai") await openaiPaint(work, prompt);
    else await codex(work, prompt);
    if (!existsSync(join(work, "out.png"))) {
      const log = providerLog(work).slice(-4000);
      if (LIMIT.test(log)) {
        const wait = limitWait(log);
        resumeAt = Math.max(resumeAt, Date.now() + wait);
        console.warn(`  ${i}_${j}: painter limit reached, pausing all workers until ${new Date(resumeAt).toLocaleTimeString()}`);
        attempt--; // a limit is not the window's fault: retry without using up an attempt
        continue;
      }
    } else backoff = 0;
    if (existsSync(join(work, "out.png")) && await acceptOrRetry({ i, j, work, edges }, attempt, t0) === "accept") return;
    if (!existsSync(join(work, "out.png"))) console.error(`  ${i}_${j}: attempt ${attempt} failed, see ${join(work, "paint.log")} or ${join(work, "codex.log")}`);
  }
}

interface Prepared { i: number; j: number; work: string; edges: string[] }

/** `direct`: an image API (Gemini, OpenAI) returns the picture itself; only Codex copies a file. */
function windowPrompt(edges: string[], out: string, direct: boolean) {
  const prompt = PROMPT.replace("{title}", title).replace("{out}", out)
    .replace("{continuation}", edges.length ? CONTINUATION.replace("{edges}", edges.join(" and ")) : "");
  return direct
    ? prompt.replace(/When done, copy the final PNG to [\s\S]* and reply only with that path\./, "Return one square image and no other text.")
    : prompt;
}

/** Register the paint against the render. Retry a black band or a weak match; otherwise keep it. */
async function acceptOrRetry(job: Prepared, attempt: number, started: number): Promise<"accept" | "retry"> {
  const { i, j, work, edges } = job;
  const r = await register(join(work, "input.png"), join(work, "out.png"));
  const roofs = await roofNovelty(join(work, "input.png"), join(work, "out.png"));
  writeFileSync(join(work, "qa.json"), JSON.stringify({ ...r, roofNovelty: roofs }));
  const dark = await hasDarkPatch(join(work, "out.png"), join(work, "input.png"));
  if (paintVerdict({ score: r.score, identity: r.identity, texture: r.texture, dark, attempt, roofNovelty: roofs }) === "retry") {
    const why = roofs > MAX_ROOF_NOVELTY ? `roof silhouette changed (${roofs.toFixed(2)})`
      : dark ? "black band or patch" : `match ${r.score.toFixed(2)} < ${MIN_MATCH}`;
    console.warn(`  ${i}_${j}: ${why}, repainting`);
    return "retry";
  }
  const structured = r.texture >= MIN_TEXTURE;
  const warp = shouldWarp(r);
  await applyRegistration(join(work, "out.png"), winFile(i, j), warp ? r : { ...r, scale: 1, dx: 0, dy: 0 });
  console.log(`  ${i}_${j}: ${((Date.now() - started) / 1000).toFixed(0)}s edges=${edges.join("+") || "-"} match=${r.score.toFixed(2)}`
    + (structured ? "" : " (low texture)") + (warp ? ` shift=(${r.dx},${r.dy}) scale=${r.scale.toFixed(2)}` : ""));
  for (const f of ["input.png", "height.png", "style.png", "trees.png", "out.png"]) rmSync(join(work, f), { force: true });
  return "accept";
}

/** One ring-pass through the Gemini Batch API, then the same per-window validation and up to two retries. */
async function paintGeminiPass(todo: Array<[number, number]>) {
  const jobs: Array<Prepared & { prompt: string }> = [];
  for (const [i, j] of todo) {
    if (existsSync(winFile(i, j)) && !args.force && !(OLDER && !current(i, j))) continue;
    if (existsSync(SEA) && (await seaFraction(i, j)) >= 0.995) {
      let img = sharp(SEA).resize(WIN, WIN);
      if ((i + j) & 1) img = img.flop();
      if (j & 1) img = img.flip();
      await writeAtomic(img.png(), winFile(i, j));
      console.log(`  ${i}_${j}: sea texture`);
      continue;
    }
    const work = join(base, "work", `${i}_${j}`);
    mkdirSync(work, { recursive: true });
    const edges = await composeInput(i, j, join(work, "input.png"), join(work, "height.png"));
    copyFileSync(STYLE, join(work, "style.png"));
    copyFileSync(TREES, join(work, "trees.png"));
    jobs.push({ i, j, work, edges, prompt: windowPrompt(edges, join(work, "out.png"), true) });
  }
  let left = jobs;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && left.length; attempt++) {
    console.log(`  gemini batch: ${left.length} windows, about $${estimateUsd(left.length, true).toFixed(2)} at 1K (half of $${PRICE_1K_USD})`);
    const started = Date.now();
    let images: Map<string, Buffer>;
    try {
      images = await runGeminiBatch(left.map((job) => ({
        key: `${job.i}_${job.j}`, prompt: job.prompt, images: windowImages(job.work),
      })), { displayName: `simkortrijk-${areaName}-a${attempt}` }); // a QA retry is a new batch
    } catch (err) {
      const msg = (err as Error).message;
      for (const job of left) writeFileSync(join(job.work, "paint.log"), msg);
      if (LIMIT.test(msg)) {
        const wait = limitWait(msg);
        console.warn(`  gemini batch limited, pausing until ${new Date(Date.now() + wait).toLocaleTimeString()}`);
        await sleep(wait);
        attempt--;
        continue;
      }
      throw err;
    }
    const again: typeof left = [];
    for (const job of left) {
      const png = images.get(`${job.i}_${job.j}`);
      if (png) writeFileSync(join(job.work, "out.png"), png);
      else writeFileSync(join(job.work, "paint.log"), "missing from gemini batch output");
      if (existsSync(join(job.work, "out.png")) && await acceptOrRetry(job, attempt, started) === "accept") continue;
      again.push(job);
    }
    left = again;
  }
}

/** Feather-blend painted windows into 1024 art tiles; only tiles fully covered are written. */
// ---- sea colour harmonisation -------------------------------------------------------------------
// Codex paints open water in slightly different blues per window, which shows as window-sized
// rectangles. In each window, deep water (sea level, far from land) is shifted to the median
// deep-water colour of all windows, fading in from the shore so surf and harbours keep their colours.
const CELL = 8, PAD = 256, NEAR = 12, FULL = 28; // 8 px cells; fade from 12 to 28 cells (24 → 56 m) off the coast
const heightCache = new Map<string, Float32Array | null>();
async function heightAt(x: number, y: number) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), k = `${tx}_${ty}`;
  if (!heightCache.has(k)) {
    const f = join(base, "height", `${k}.png`);
    heightCache.set(k, existsSync(f) ? await readHeights(f) : null);
  }
  const h = heightCache.get(k);
  return h ? h[Math.floor((y - ty * T) / 4) * 256 + Math.floor((x - tx * T) / 4)] : NaN;
}

/** Per window cell (WIN/CELL)²: 0 on land or near the coast → 1 in open water. Null if no open water. */
async function deepWater(i: number, j: number) {
  const n = (WIN + 2 * PAD) / CELL, x0 = i * STRIDE - PAD, y0 = j * STRIDE - PAD;
  const d = new Float32Array(n * n);
  let any = false;
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    const h = await heightAt(x0 + cx * CELL + CELL / 2, y0 + cy * CELL + CELL / 2);
    const land = !Number.isNaN(h) && h > SEA_H + 0.3;
    d[cy * n + cx] = land ? 0 : 1e9;
    if (!land && !Number.isNaN(h)) any = true;
  }
  if (!any) return null;
  // chamfer distance to land, in cells
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = d[y * n + x];
    if (x) v = Math.min(v, d[y * n + x - 1] + 1);
    if (y) v = Math.min(v, d[(y - 1) * n + x] + 1);
    if (x && y) v = Math.min(v, d[(y - 1) * n + x - 1] + 1.414);
    if (y && x < n - 1) v = Math.min(v, d[(y - 1) * n + x + 1] + 1.414);
    d[y * n + x] = v;
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    let v = d[y * n + x];
    if (x < n - 1) v = Math.min(v, d[y * n + x + 1] + 1);
    if (y < n - 1) v = Math.min(v, d[(y + 1) * n + x] + 1);
    if (x < n - 1 && y < n - 1) v = Math.min(v, d[(y + 1) * n + x + 1] + 1.414);
    if (y < n - 1 && x) v = Math.min(v, d[(y + 1) * n + x - 1] + 1.414);
    d[y * n + x] = v;
  }
  const m = WIN / CELL, w = new Float32Array(m * m), p = PAD / CELL;
  let deep = 0;
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const h = await heightAt(i * STRIDE + x * CELL + CELL / 2, j * STRIDE + y * CELL + CELL / 2);
    if (Number.isNaN(h)) continue;
    const v = Math.min(1, Math.max(0, (d[(y + p) * n + x + p] - NEAR) / (FULL - NEAR)));
    w[y * m + x] = v;
    if (v >= 1) deep++;
  }
  return deep >= 64 ? w : null;
}

/** window -> [cell weights, RGB offset to the reference deep-water colour] */
const seaFix = new Map<string, [Float32Array, number[]]>();
async function harmoniseSea() {
  const means: Array<[string, Float32Array, number[]]> = [];
  for (const [i, j] of windows()) {
    if (!existsSync(winFile(i, j))) continue;
    const w = await deepWater(i, j);
    if (!w) continue;
    const m = WIN / CELL, px = await sharp(winFile(i, j)).removeAlpha().resize(m, m, { kernel: "cubic" }).raw().toBuffer();
    const sum = [0, 0, 0];
    let n = 0;
    for (let k = 0; k < m * m; k++) if (w[k] >= 1) { for (let c = 0; c < 3; c++) sum[c] += px[k * 3 + c]; n++; }
    means.push([`${i}_${j}`, w, sum.map((v) => v / n)]);
  }
  const ref = [0, 1, 2].map((c) => means.map((m) => m[2][c]).sort((a, b) => a - b)[Math.floor(means.length / 2)]);
  for (const [k, w, mean] of means) seaFix.set(k, [w, mean.map((v, c) => ref[c] - v)]);
  console.log(`  sea: ${means.length} windows with open water, reference rgb(${ref.map(Math.round).join(",")})`);
}

async function assemble(all = false) {
  const ramp = new Float32Array(WIN);
  // 0 → 1 across a FEATHER-wide band centred in the overlap (complementary for neighbours)
  const edge = (k: number) => Math.min(1, Math.max(0, (k + 0.5 - (OVERLAP - FEATHER) / 2) / FEATHER));
  for (let k = 0; k < WIN; k++) ramp[k] = Math.min(edge(k), edge(WIN - 1 - k));
  mkdirSync(join(base, "paint"), { recursive: true });
  let written = 0;
  for (const k of tileSet) {
    const [tx, ty] = k.split("_").map(Number);
    const covering: Array<[number, number]> = [];
    for (let j = Math.floor((ty * T - WIN) / STRIDE) + 1; j * STRIDE < (ty + 1) * T; j++)
      for (let i = Math.floor((tx * T - WIN) / STRIDE) + 1; i * STRIDE < (tx + 1) * T; i++) covering.push([i, j]);
    if (!covering.every(([i, j]) => existsSync(winFile(i, j)))) continue;
    const tile = join(base, "paint", `${tx}_${ty}.png`);
    // rebuilt when any covering window was repainted since
    if (existsSync(tile) && !args.force && !all && covering.every(([i, j]) => mtime(winFile(i, j)) <= mtime(tile))) continue;
    const acc = new Float32Array(T * T * 3), wsum = new Float32Array(T * T);
    for (const [i, j] of covering) {
      const px = await sharp(winFile(i, j)).resize(WIN, WIN).removeAlpha().raw().toBuffer();
      const fix = seaFix.get(`${i}_${j}`);
      if (fix) { // bilinear cell weights × colour offset
        const [w, off] = fix, m = WIN / CELL;
        for (let y = 0; y < WIN; y++) {
          const fy = Math.min(m - 1, Math.max(0, (y + 0.5) / CELL - 0.5)), y0 = Math.floor(fy), y1 = Math.min(m - 1, y0 + 1), ay = fy - y0;
          for (let x = 0; x < WIN; x++) {
            const fx = Math.min(m - 1, Math.max(0, (x + 0.5) / CELL - 0.5)), x0 = Math.floor(fx), x1 = Math.min(m - 1, x0 + 1), ax = fx - x0;
            const a = (w[y0 * m + x0] * (1 - ax) + w[y0 * m + x1] * ax) * (1 - ay) + (w[y1 * m + x0] * (1 - ax) + w[y1 * m + x1] * ax) * ay;
            if (a <= 0) continue;
            const s = (y * WIN + x) * 3;
            for (let c = 0; c < 3; c++) px[s + c] = Math.max(0, Math.min(255, px[s + c] + off[c] * a));
          }
        }
      }
      const ox = i * STRIDE - tx * T, oy = j * STRIDE - ty * T;
      for (let y = Math.max(0, oy); y < Math.min(T, oy + WIN); y++)
        for (let x = Math.max(0, ox); x < Math.min(T, ox + WIN); x++) {
          const wx = x - ox, wy = y - oy, w = ramp[wx] * ramp[wy], s = (wy * WIN + wx) * 3, d = y * T + x;
          acc[d * 3] += px[s] * w; acc[d * 3 + 1] += px[s + 1] * w; acc[d * 3 + 2] += px[s + 2] * w;
          wsum[d] += w;
        }
    }
    const out = Buffer.alloc(T * T * 3);
    for (let d = 0; d < T * T; d++) for (let c = 0; c < 3; c++) out[d * 3 + c] = acc[d * 3 + c] / Math.max(wsum[d], 1e-6);
    await writeAtomic(sharp(out, { raw: { width: T, height: T, channels: 3 } }).png(), join(base, "paint", `${tx}_${ty}.png`));
    written++;
  }
  console.log(`  assembled ${written} art tiles`);
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()!); }));
}

async function main() {
  let wins = windows();
  if (args.near) {
    const [lat, lon] = args.near.split(",").map(Number);
    const [x, y] = llhToPixel(lat, lon, GROUND_H);
    const ci = Math.floor(x / STRIDE), cj = Math.floor(y / STRIDE), r = Number(args.radius);
    wins = wins.filter(([i, j]) => Math.abs(i - ci) <= r && Math.abs(j - cj) <= r);
  }
  if (args.window) wins = [args.window.split(",").map(Number) as [number, number]];
  if (OLDER) { // only land windows (sea-texture windows have no trees) painted before the cut-off
    const old: Array<[number, number]> = [];
    for (const [i, j] of wins) if (existsSync(winFile(i, j)) && !current(i, j) && !(await looksLikeSea(winFile(i, j)))) old.push([i, j]);
    wins = old;
  }
  if (args.plan) return console.log(`${wins.length} windows`);
  if (args.assemble) { await harmoniseSea(); return assemble(true); }
  painter = ensurePainter();
  if (args.batch && painter !== "gemini") throw new Error("--batch uses the Gemini Batch API. Leave PAINT_PROVIDER unset (gemini) and set GEMINI_API_KEY.");
  const mode = painter === "gemini" ? choosePaintMode(wins.length, { batch: args.batch, interactive: args.interactive }) : "interactive";
  console.log(`  painter ${painter}${painter === "gemini" ? ` (${mode})` : ""}`);
  // centre first: square rings around the city centre. Each ring runs in two passes over its
  // perimeter (even, then odd positions) so every window continues its painted inner/ring neighbours.
  const [cx, cy] = args.center.split(",").map(Number);
  const [px, py] = llhToPixel(cx, cy, GROUND_H);
  const ci = Math.floor(px / STRIDE), cj = Math.floor(py / STRIDE);
  const have = new Set(wins.map(([i, j]) => `${i}_${j}`));
  const maxR = Math.max(...wins.map(([i, j]) => Math.max(Math.abs(i - ci), Math.abs(j - cj))));
  console.log(`${wins.length} windows in ${maxR + 1} rings around ${ci}_${cj}`);
  // first: paint one open-sea window and keep it as the reusable sea texture
  // (validated: a bad paint would otherwise be stamped over every open-sea window)
  // a bad sea texture (or windows painted with black bands) never survives a restart: drop and redo them
  if (existsSync(SEA) && !(await looksLikeSea(SEA))) { console.warn("  sea texture is bad, repainting it"); rmSync(SEA); }
  if (!args.window && !OLDER) await dropDarkWindows(wins);
  if (!existsSync(SEA) && !args.window && !OLDER) {
    const open = [];
    for (const [i, j] of windows()) if ((await seaFraction(i, j)) >= 0.995) open.push([i, j]);
    for (const [i, j] of open.slice(0, 3)) {
      rmSync(winFile(i, j), { force: true });
      await paintWindow(i, j);
      if (existsSync(winFile(i, j)) && (await looksLikeSea(winFile(i, j)))) {
        copyFileSync(winFile(i, j), SEA);
        console.log(`  sea texture from ${i}_${j}`);
        break;
      }
      console.warn(`  ${i}_${j}: painted sea doesn't look like sea, trying another window`);
      rmSync(winFile(i, j), { force: true });
    }
  }
  for (let r = 0; r <= maxR; r++) {
    const ring: Array<[number, number]> = [];
    if (r === 0) ring.push([ci, cj]);
    else {
      for (let k = 0; k < 2 * r; k++) ring.push([ci - r + k, cj - r]);  // top, left → right
      for (let k = 0; k < 2 * r; k++) ring.push([ci + r, cj - r + k]);  // right, top → bottom
      for (let k = 0; k < 2 * r; k++) ring.push([ci + r - k, cj + r]);  // bottom, right → left
      for (let k = 0; k < 2 * r; k++) ring.push([ci - r, cj + r - k]);  // left, bottom → top
    }
    for (const pass of [0, 1]) {
      const todo = ring.filter(([i, j], k) => k % 2 === pass && have.has(`${i}_${j}`));
      if (mode === "batch") await paintGeminiPass(todo);
      else await pool(todo, Number(args.j), ([i, j]) => paintWindow(i, j));
    }
    await assemble(); // finished tiles become visible ring by ring
  }
  await harmoniseSea(); // then every tile with open water is rebuilt with the harmonised sea
  await assemble(!args.window);
  writeFileSync(join(base, "paint.json"), JSON.stringify({ updated: new Date().toISOString() }));
}

main();
