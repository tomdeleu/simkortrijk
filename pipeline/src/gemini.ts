/**
 * Gemini image edits for the paint step (Nano Banana).
 *
 * Interactive: POST .../models/{model}:generateContent with the render, the height
 * pass, and the style sheets. Used for a handful of windows.
 * Batch: the Gemini Batch API (JSONL via the Files API, then :batchGenerateContent).
 * Half the interactive price. Used for a whole area.
 *
 * Prices published for gemini-nano-banana-2.1: $0.0336 / 1K image, $0.0504 / 2K.
 * This painter asks for 1K (windows are 1024 px). Batch is half of that.
 *
 * Auth: header x-goog-api-key from GEMINI_API_KEY. No call is made without it.
 */
import { createHash } from "node:crypto";

export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const GEMINI_ROOT = "https://generativelanguage.googleapis.com";
/** Interactive 1K price, USD. Batch API is half. */
export const PRICE_1K_USD = 0.0336;
export const PRICE_2K_USD = 0.0504;
export const IMAGE_SIZE = "1K";
/** More windows than this, and the default Gemini run uses the Batch API. */
export const BATCH_AT = 12;

export interface GeminiImage {
  /** File name, only so logs and tests can see the order. Not sent as a filename. */
  name: string;
  mimeType: string;
  bytes: Buffer;
}

export type FetchImpl = typeof fetch;

export function geminiModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL;
}

export function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "PAINT_PROVIDER=gemini needs secret GEMINI_API_KEY (Gemini API, image edits). " +
      `Optional GEMINI_IMAGE_MODEL (default ${DEFAULT_GEMINI_IMAGE_MODEL}).`,
    );
  }
  return key;
}

export function estimateUsd(images: number, batch: boolean): number {
  return images * PRICE_1K_USD * (batch ? 0.5 : 1);
}

export function choosePaintMode(count: number, flags: { batch?: boolean; interactive?: boolean }): "batch" | "interactive" {
  if (flags.batch && flags.interactive) throw new Error("pass only one of --batch and --interactive");
  if (flags.batch) return "batch";
  if (flags.interactive) return "interactive";
  return count > BATCH_AT ? "batch" : "interactive";
}

/** generateContent body: prompt, then render, height, style, trees, in that order. */
export function generateBody(prompt: string, images: GeminiImage[]) {
  return {
    contents: [{
      role: "user",
      parts: [
        { text: prompt },
        ...images.map((img) => ({
          inlineData: { mimeType: img.mimeType, data: img.bytes.toString("base64") },
        })),
      ],
    }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "1:1", imageSize: IMAGE_SIZE },
    },
  };
}

export function batchJsonl(items: Array<{ key: string; prompt: string; images: GeminiImage[] }>): string {
  return items.map((item) => JSON.stringify({ key: item.key, request: generateBody(item.prompt, item.images) })).join("\n") + "\n";
}

function partData(part: Record<string, unknown>): string | undefined {
  const inline = (part.inlineData ?? part.inline_data) as { data?: string } | undefined;
  return inline?.data;
}

/** First image in a generateContent response, or null when the model returned only text. */
export function imageFromResponse(body: unknown): Buffer | null {
  const candidates = (body as { candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }> })?.candidates ?? [];
  for (const candidate of candidates) {
    for (const part of candidate.content?.parts ?? []) {
      const data = partData(part);
      if (data) return Buffer.from(data, "base64");
    }
  }
  return null;
}

export interface GeminiEditResult { ok: boolean; png?: Buffer; log: string }

export async function geminiEdit(prompt: string, images: GeminiImage[], fetchImpl: FetchImpl = fetch): Promise<GeminiEditResult> {
  const key = requireGeminiKey();
  const model = geminiModel();
  const url = `${GEMINI_ROOT}/v1beta/models/${model}:generateContent`;
  let text = "";
  let status = 0;
  try {
    const r = await fetchImpl(url, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(generateBody(prompt, images)),
      signal: AbortSignal.timeout(300_000),
    });
    status = r.status;
    text = await r.text();
  } catch (err) {
    return { ok: false, log: `gemini ${model} ${(err as Error).message}` };
  }
  const log = `${status} ${model}\n${text.slice(0, 6000)}`;
  if (status < 200 || status >= 300) return { ok: false, log };
  try {
    const png = imageFromResponse(JSON.parse(text));
    if (!png) return { ok: false, log: `${log}\nno image in response` };
    return { ok: true, png, log };
  } catch {
    return { ok: false, log };
  }
}

export function readBatchState(body: unknown): "pending" | "succeeded" | "failed" {
  const record = body as {
    metadata?: { state?: string; output?: { responsesFile?: string } };
    state?: string;
    done?: boolean;
    error?: unknown;
    response?: { responsesFile?: string; state?: string };
  };
  const state = String(record?.metadata?.state ?? record?.response?.state ?? record?.state ?? "").toUpperCase();
  if (/FAIL|CANCEL|EXPIR/.test(state) || (record?.done === true && record?.error)) return "failed";
  if (/SUCCEED/.test(state)) return "succeeded";
  if (record?.done === true && outputFileName(body)) return "succeeded";
  return "pending";
}

export function outputFileName(body: unknown): string | undefined {
  const record = body as {
    metadata?: { output?: { responsesFile?: string } };
    response?: { responsesFile?: string; output?: { responsesFile?: string } };
    dest?: { fileName?: string };
  };
  return record?.response?.responsesFile
    ?? record?.metadata?.output?.responsesFile
    ?? record?.response?.output?.responsesFile
    ?? record?.dest?.fileName;
}

export function imagesFromBatchJsonl(jsonl: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: { key?: string; metadata?: { key?: string }; response?: unknown; error?: unknown };
    try { row = JSON.parse(trimmed); } catch { continue; }
    if (row.error) continue;
    const key = row.key ?? row.metadata?.key;
    if (!key) continue;
    const png = imageFromResponse(row.response);
    if (png) out.set(key, png);
  }
  return out;
}

async function readError(r: Response): Promise<string> {
  const text = await r.text();
  return `${r.status} ${text.slice(0, 500)}`;
}

export async function uploadJsonl(jsonl: string, key: string, fetchImpl: FetchImpl): Promise<string> {
  const bytes = Buffer.from(jsonl);
  const r = await fetchImpl(`${GEMINI_ROOT}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "X-Goog-Upload-Protocol": "raw",
      "X-Goog-Upload-Command": "start, upload, finalize",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": "application/jsonl",
      "Content-Type": "application/jsonl",
    },
    body: bytes,
  });
  if (!r.ok) throw new Error(`gemini file upload ${await readError(r)}`);
  const body = await r.json() as { file?: { name?: string }; name?: string };
  const name = body.file?.name ?? body.name;
  if (!name) throw new Error("gemini file upload returned no file name");
  return name;
}

export async function createBatch(fileName: string, key: string, model: string, displayName: string, fetchImpl: FetchImpl): Promise<string> {
  const r = await fetchImpl(`${GEMINI_ROOT}/v1beta/models/${model}:batchGenerateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      batch: { displayName, inputConfig: { fileName } },
    }),
  });
  if (!r.ok) throw new Error(`gemini batch create ${await readError(r)}`);
  const body = await r.json() as { name?: string };
  if (!body.name) throw new Error("gemini batch create returned no name");
  return body.name;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Name of a batch with this display name that has not failed, newest first; undefined if none. */
export async function findBatch(displayName: string, key: string, fetchImpl: FetchImpl): Promise<string | undefined> {
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const r = await fetchImpl(`${GEMINI_ROOT}/v1beta/batches?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, {
      headers: { "x-goog-api-key": key },
    });
    if (!r.ok) throw new Error(`gemini batch list ${await readError(r)}`);
    const body = await r.json() as { operations?: Array<{ name?: string; metadata?: { displayName?: string } }>; nextPageToken?: string };
    for (const op of body.operations ?? []) {
      if (op.name && op.metadata?.displayName === displayName && readBatchState(op) !== "failed") return op.name;
    }
    if (!body.nextPageToken) return undefined;
    pageToken = body.nextPageToken;
  }
  return undefined;
}

/**
 * Retry transient failures: HTTP 429/5xx always, and dropped connections (ECONNRESET,
 * "fetch failed") only when `network` is true, i.e. for calls that are safe to repeat.
 */
export function retrying(fetchImpl: FetchImpl, wait: (ms: number) => Promise<void>, network = true, attempts = 6): FetchImpl {
  return (async (input: Parameters<FetchImpl>[0], init?: Parameters<FetchImpl>[1]) => {
    for (let i = 1; ; i++) {
      const delay = Math.min(60_000, 2_000 * 2 ** (i - 1));
      try {
        const r = await fetchImpl(input, init);
        if ((r.status === 429 || r.status >= 500) && i < attempts) {
          console.log(`  gemini ${r.status}, retry ${i}/${attempts - 1} in ${delay / 1000}s`);
          await wait(delay);
          continue;
        }
        return r;
      } catch (err) {
        if (!network || i >= attempts) throw err;
        const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message;
        console.log(`  gemini ${cause}, retry ${i}/${attempts - 1} in ${delay / 1000}s`);
        await wait(delay);
      }
    }
  }) as FetchImpl;
}

export interface BatchRunOptions {
  fetchImpl?: FetchImpl;
  key?: string;
  model?: string;
  displayName?: string;
  pollMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Upload JSONL, submit a batch, poll until it finishes, return PNG bytes keyed by window id. */
export async function runGeminiBatch(
  items: Array<{ key: string; prompt: string; images: GeminiImage[] }>,
  opts: BatchRunOptions = {},
): Promise<Map<string, Buffer>> {
  if (!items.length) return new Map();
  const key = opts.key ?? requireGeminiKey();
  const wait = opts.sleep ?? sleep;
  const raw = opts.fetchImpl ?? fetch;
  // upload, poll, list and download are idempotent and retry on dropped connections.
  // A create can hang past the 300 s headers timeout while the server still creates the
  // batch, so the batch is named after its input and adopted by that name instead of resubmitted.
  const fetchImpl = retrying(raw, wait);
  const model = opts.model ?? geminiModel();
  const jsonl = batchJsonl(items);
  const displayName = `${opts.displayName ?? "simkortrijk-paint"}-${createHash("sha256").update(model).update(jsonl).digest("hex").slice(0, 16)}`;
  let batchName = await findBatch(displayName, key, fetchImpl);
  if (batchName) console.log(`  gemini batch: reusing ${batchName} (same input)`);
  else {
    const fileName = await uploadJsonl(jsonl, key, fetchImpl);
    try {
      batchName = await createBatch(fileName, key, model, displayName, retrying(raw, wait, false));
    } catch (err) {
      for (let i = 0; i < 4 && !batchName; i++) {
        await wait(15_000);
        batchName = await findBatch(displayName, key, fetchImpl);
      }
      if (!batchName) throw err;
      console.log(`  gemini batch create: ${(err as Error).message}; the server created ${batchName}, following it`);
    }
  }
  const pollMs = opts.pollMs ?? 15_000;
  const deadline = Date.now() + (opts.timeoutMs ?? 6 * 60 * 60 * 1000);
  let output: string | undefined;
  for (;;) {
    const r = await fetchImpl(`${GEMINI_ROOT}/v1beta/${batchName}`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) throw new Error(`gemini batch poll ${await readError(r)}`);
    const body = await r.json();
    const state = readBatchState(body);
    if (state === "succeeded") { output = outputFileName(body); break; }
    if (state === "failed") throw new Error(`gemini batch failed ${JSON.stringify(body).slice(0, 500)}`);
    if (Date.now() > deadline) throw new Error(`gemini batch ${batchName} timed out`);
    await wait(pollMs);
  }
  if (!output) throw new Error("gemini batch succeeded without an output file");
  const file = await fetchImpl(`${GEMINI_ROOT}/download/v1beta/${output}:download?alt=media`, {
    headers: { "x-goog-api-key": key },
  });
  if (!file.ok) throw new Error(`gemini batch download ${await readError(file)}`);
  return imagesFromBatchJsonl(await file.text());
}
