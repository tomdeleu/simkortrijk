/**
 * Gemini painter, with fetch mocked. No API key and no network.
 *   npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BATCH_AT, DEFAULT_GEMINI_IMAGE_MODEL, GEMINI_ROOT, IMAGE_SIZE, PRICE_1K_USD,
  batchJsonl, choosePaintMode, estimateUsd, geminiEdit, generateBody, imageFromResponse,
  imagesFromBatchJsonl, readBatchState, requireGeminiKey, runGeminiBatch,
  type FetchImpl, type GeminiImage,
} from "./gemini.ts";
import { MAX_ROOF_NOVELTY, paintVerdict, shouldWarp } from "./paintqa.ts";
import { roofNovelty } from "./register.ts";
import sharp from "sharp";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("gemini painter", { concurrency: 1 }, () => {

function images(): GeminiImage[] {
  return ["input.png", "height.png", "style.png", "trees.png"].map((name, i) => ({
    name, mimeType: "image/png", bytes: Buffer.from(`img-${i}-${name}`),
  }));
}

test("generateContent body sends the render, the height pass, then the style sheets at 1K", () => {
  const body = generateBody("paint Kortrijk", images());
  const parts = body.contents[0].parts;
  assert.equal("text" in parts[0] ? parts[0].text : "", "paint Kortrijk");
  const inline = parts.slice(1).map((p) => ("inlineData" in p ? p.inlineData : undefined));
  assert.deepEqual(inline.map((p) => p?.mimeType), ["image/png", "image/png", "image/png", "image/png"]);
  assert.deepEqual(inline.map((p) => Buffer.from(p!.data, "base64").toString()), [
    "img-0-input.png", "img-1-height.png", "img-2-style.png", "img-3-trees.png",
  ]);
  assert.deepEqual(body.generationConfig.responseModalities, ["IMAGE"]);
  assert.equal(body.generationConfig.imageConfig.imageSize, IMAGE_SIZE);
  assert.equal(body.generationConfig.imageConfig.aspectRatio, "1:1");
});

test("imageFromResponse reads camelCase and snake_case inline images", () => {
  const camel = imageFromResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG.toString("base64") } }] } }] });
  const snake = imageFromResponse({ candidates: [{ content: { parts: [{ text: "ok" }, { inline_data: { mime_type: "image/png", data: PNG.toString("base64") } }] } }] });
  assert.ok(camel?.equals(PNG));
  assert.ok(snake?.equals(PNG));
  assert.equal(imageFromResponse({ candidates: [{ content: { parts: [{ text: "no image" }] } }] }), null);
});

test("interactive edit posts to the default model with the API key and returns the PNG", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_IMAGE_MODEL;
  let url = "", header = "", sent: { contents: Array<{ parts: unknown[] }> } | undefined;
  const fetchImpl: FetchImpl = async (input, init) => {
    url = String(input);
    header = new Headers(init?.headers).get("x-goog-api-key") ?? "";
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG.toString("base64") } }] } }],
    }), { status: 200 });
  };
  const result = await geminiEdit("redraw", images(), fetchImpl);
  assert.equal(result.ok, true);
  assert.ok(result.png?.equals(PNG));
  assert.equal(url, `${GEMINI_ROOT}/v1beta/models/${DEFAULT_GEMINI_IMAGE_MODEL}:generateContent`);
  assert.equal(header, "test-key");
  assert.equal(sent?.contents[0].parts.length, 5);
});

test("GEMINI_IMAGE_MODEL overrides the model, and a missing key names the secret", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_IMAGE_MODEL = "gemini-nano-banana-2.1-preview";
  let url = "";
  const fetchImpl: FetchImpl = async (input) => {
    url = String(input);
    return new Response("{}", { status: 200 });
  };
  const result = await geminiEdit("redraw", images(), fetchImpl);
  assert.equal(result.ok, false);
  assert.match(url, /models\/gemini-nano-banana-2\.1-preview:generateContent/);
  assert.match(result.log, /no image/);
  delete process.env.GEMINI_API_KEY;
  assert.throws(() => requireGeminiKey(), /GEMINI_API_KEY/);
  process.env.GEMINI_API_KEY = "test-key";
});

test("a 429 is a failed edit whose log the painter can retry", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  const fetchImpl: FetchImpl = async () => new Response("rate limit 429", { status: 429 });
  const result = await geminiEdit("redraw", images(), fetchImpl);
  assert.equal(result.ok, false);
  assert.match(result.log, /429/);
});

test("batch JSONL is one request per window and the batch run uploads, polls, and maps images", async () => {
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GEMINI_IMAGE_MODEL;
  const items = [
    { key: "0_0", prompt: "a", images: images() },
    { key: "1_0", prompt: "b", images: images() },
  ];
  const lines = batchJsonl(items).trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.equal(first.key, "0_0");
  assert.equal(first.request.contents[0].parts.length, 5);
  assert.equal(first.request.generationConfig.imageConfig.imageSize, "1K");

  const calls: string[] = [];
  let polls = 0;
  const fetchImpl: FetchImpl = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/upload/v1beta/files")) {
      assert.equal(new Headers(init?.headers).get("X-Goog-Upload-Protocol"), "raw");
      assert.equal(String(init?.body), batchJsonl(items));
      return Response.json({ file: { name: "files/in-1" } });
    }
    if (url.includes(":batchGenerateContent")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.batch.inputConfig.fileName, "files/in-1");
      assert.match(url, /models\/gemini-nano-banana-2\.1:batchGenerateContent/);
      return Response.json({ name: "batches/job-1" });
    }
    if (url.endsWith("/v1beta/batches/job-1")) {
      polls++;
      if (polls === 1) return Response.json({ name: "batches/job-1", metadata: { state: "BATCH_STATE_RUNNING" } });
      return Response.json({
        name: "batches/job-1", done: true,
        metadata: { state: "BATCH_STATE_SUCCEEDED", output: { responsesFile: "files/out-1" } },
        response: { responsesFile: "files/out-1" },
      });
    }
    if (url.includes("/download/v1beta/files/out-1")) {
      const line = (key: string) => JSON.stringify({
        key,
        response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG.toString("base64") } }] } }] },
      });
      return new Response(`${line("0_0")}\n${line("1_0")}\n${JSON.stringify({ key: "2_0", error: { message: "blocked" } })}\n`, { status: 200 });
    }
    return new Response("unexpected " + url, { status: 500 });
  };
  const slept: number[] = [];
  const got = await runGeminiBatch(items, { fetchImpl, pollMs: 5, sleep: async (ms) => { slept.push(ms); } });
  assert.deepEqual([...got.keys()], ["0_0", "1_0"]);
  assert.ok(got.get("0_0")?.equals(PNG));
  assert.equal(slept.length, 1);
  assert.equal(readBatchState({ metadata: { state: "BATCH_STATE_FAILED" } }), "failed");
  assert.ok(calls.some((c) => c.startsWith("POST")));
});

test("imagesFromBatchJsonl skips errors and accepts metadata.key", () => {
  const line = JSON.stringify({
    metadata: { key: "4_-3" },
    response: { candidates: [{ content: { parts: [{ inlineData: { data: PNG.toString("base64") } }] } }] },
  });
  const map = imagesFromBatchJsonl(line + "\n" + JSON.stringify({ key: "9_9", error: { code: 1 } }) + "\nnot json\n");
  assert.deepEqual([...map.keys()], ["4_-3"]);
});

test("small tests stay interactive and a whole area uses the batch API", () => {
  assert.equal(choosePaintMode(1, {}), "interactive");
  assert.equal(choosePaintMode(BATCH_AT, {}), "interactive");
  assert.equal(choosePaintMode(BATCH_AT + 1, {}), "batch");
  assert.equal(choosePaintMode(2, { batch: true }), "batch");
  assert.equal(choosePaintMode(100, { interactive: true }), "interactive");
  assert.throws(() => choosePaintMode(3, { batch: true, interactive: true }), /only one/);
  assert.equal(estimateUsd(10, false), 10 * PRICE_1K_USD);
  assert.equal(estimateUsd(10, true), 5 * PRICE_1K_USD);
});

async function flatBlock(mode: "plain" | "tiles" | "ridge") {
  const s = 256;
  const raw = Buffer.alloc(s * s * 3, 230);
  for (let y = 40; y < 180; y++) for (let x = 40; x < 200; x++) {
    const i = (y * s + x) * 3;
    let r = 170, g = 80, b = 60;
    if (mode === "tiles" && (x % 6 === 0 || y % 8 === 0)) { r -= 14; g -= 8; b -= 6; }
    if (mode === "ridge" && Math.abs((y - 40) - (x - 40) * 0.4) < 2) { r = 230; g = 210; b = 190; }
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
  }
  return sharp(raw, { raw: { width: s, height: s, channels: 3 } }).png().toBuffer();
}

test("roof check allows tile texture and rejects a new ridge on a flat block", async () => {
  const plain = await flatBlock("plain");
  const tiles = await flatBlock("tiles");
  const ridge = await flatBlock("ridge");
  const texture = await roofNovelty(plain, tiles);
  const pitched = await roofNovelty(plain, ridge);
  assert.ok(texture <= MAX_ROOF_NOVELTY, `texture novelty ${texture}`);
  assert.ok(pitched > MAX_ROOF_NOVELTY, `ridge novelty ${pitched}`);
});

test("a weak or black paint is retried, then kept on the third attempt", () => {
  assert.equal(paintVerdict({ score: 0.2, identity: 0.9, texture: 0.4, dark: false, attempt: 1 }), "retry");
  assert.equal(paintVerdict({ score: 0.9, identity: 0.8, texture: 0.4, dark: true, attempt: 1 }), "retry");
  assert.equal(paintVerdict({ score: 0.2, identity: 0.9, texture: 0.01, dark: false, attempt: 1 }), "accept");
  assert.equal(paintVerdict({ score: 0.2, identity: 0.9, texture: 0.4, dark: true, attempt: 3 }), "accept");
  assert.equal(paintVerdict({ score: 0.8, identity: 0.7, texture: 0.4, dark: false, attempt: 1, roofNovelty: 0.1 }), "retry");
  assert.equal(paintVerdict({ score: 0.8, identity: 0.7, texture: 0.4, dark: false, attempt: 1, roofNovelty: 0.01 }), "accept");
  assert.ok(MAX_ROOF_NOVELTY < 0.1);
  assert.equal(shouldWarp({ score: 0.7, identity: 0.6, texture: 0.4 }), true);
  assert.equal(shouldWarp({ score: 0.7, identity: 0.6, texture: 0.01 }), false);
});
});
