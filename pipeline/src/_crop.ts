import sharp from "sharp";
const [x0, y0, w, h, out] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5]), process.argv[6]];
const d = process.env.CROP_DIR ?? "../data/derived/kortrijk-binnenstad/render-hd", S = Number(process.env.CROP_S ?? 2);
const parts = [];
for (let ty = Math.floor(y0 / 1024); ty <= Math.floor((y0 + h - 1) / 1024); ty++) for (let tx = Math.floor(x0 / 1024); tx <= Math.floor((x0 + w - 1) / 1024); tx++)
  parts.push({ input: `${d}/${tx}_${ty}.png`, left: (tx * 1024 - Math.floor(x0 / 1024) * 1024) * S, top: (ty * 1024 - Math.floor(y0 / 1024) * 1024) * S });
const bx = Math.floor(x0 / 1024) * 1024, by = Math.floor(y0 / 1024) * 1024;
const W = (Math.floor((x0 + w - 1) / 1024) * 1024 + 1024 - bx) * S, H = (Math.floor((y0 + h - 1) / 1024) * 1024 + 1024 - by) * S;
const m = await sharp({ create: { width: W, height: H, channels: 3, background: "#0e0f12" } }).composite(parts).png().toBuffer();
await sharp(m).extract({ left: (x0 - bx) * S, top: (y0 - by) * S, width: w * S, height: h * S }).png().toFile(out);
