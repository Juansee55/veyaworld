import { parseGIF, decompressFrames } from "gifuct-js";
import { artPlacement, sourceCell, type ArtKind, type ArtLayout } from "./layout";
import { makeCanvas } from "./pixel";

export const MAX_FRAMES = 40;
const CELL = 32;

/** Bounding box of visible pixels. */
function trim(source: HTMLCanvasElement | HTMLImageElement) {
  const { canvas, ctx } = makeCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let l = canvas.width, t = canvas.height, r = -1, b = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if ((px[(y * canvas.width + x) * 4 + 3] ?? 0) > 20) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x); b = Math.max(b, y); }
  }
  return r < l ? null : { canvas, x: l, y: t, w: r - l + 1, h: b - t + 1 };
}

/** Melee: one weapon image pointing up, rotated into 8 orientations of 32x32 (clockwise from up). */
function normalizedMelee(source: HTMLCanvasElement | HTMLImageElement) {
  const { canvas, ctx } = makeCanvas(CELL * 8, CELL);
  const box = trim(source);
  if (!box) return canvas;
  const k = Math.min(2, 22 / Math.max(box.w, box.h));
  const w = Math.max(1, Math.round(box.w * k)), h = Math.max(1, Math.round(box.h * k));
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(i * CELL + CELL / 2, CELL / 2);
    ctx.rotate((i * Math.PI) / 4);
    ctx.drawImage(box.canvas, box.x, box.y, box.w, box.h, -Math.floor(w / 2), -Math.floor(h / 2), w, h);
    ctx.restore();
  }
  return canvas;
}

function normalized(source: HTMLCanvasElement | HTMLImageElement, kind: ArtKind, layout: ArtLayout) {
  if (kind === "melee") return normalizedMelee(source);
  const { canvas, ctx } = makeCanvas(64, 96);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const s = sourceCell(layout, row, col, source.width, source.height);
    if (layout === "graal-body" || layout === "graal-head") {
      // Same fixed half scale as the built-in Graal uploads, so custom parts match the current character size.
      const dy = layout === "graal-body" ? 8 : col === 1 ? 1 : 0;
      ctx.drawImage(source, s.x, s.y, s.w, s.h, col * 16, row * 24 + dy, 16, 16);
      continue;
    }
    const { canvas: crop, ctx: cc } = makeCanvas(Math.ceil(s.w), Math.ceil(s.h));
    cc.drawImage(source, s.x, s.y, s.w, s.h, 0, 0, crop.width, crop.height);
    const pixels = cc.getImageData(0, 0, crop.width, crop.height).data;
    let left = crop.width, top = crop.height, right = -1, bottom = -1;
    for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
      if ((pixels[(y * crop.width + x) * 4 + 3] ?? 0) > 20) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    if (right < left) continue;
    if (layout === "grid" && kind !== "hat") ctx.drawImage(crop, col * 16, row * 24, 16, 24);
    else {
      const w = right - left + 1, h = bottom - top + 1, p = artPlacement(kind, w, h);
      ctx.drawImage(crop, left, top, w, h, col * 16 + p.x, row * 24 + p.y, p.w, p.h);
    }
  }
  return canvas;
}

export async function normalizeUpload(file: File, kind: ArtKind, layout: ArtLayout) {
  if (!["image/png", "image/gif"].includes(file.type)) throw new Error("Choose a PNG or GIF");
  if (file.size > 5 * 1024 * 1024) throw new Error("Maximum file size: 5 MB");
  const sources: HTMLCanvasElement[] = [];
  let frameMs = 100;
  if (file.type === "image/gif") {
    const gif = parseGIF(await file.arrayBuffer());
    if (gif.lsd.width * gif.lsd.height > 2048 * 2048 || gif.frames.length > 400) throw new Error("Image or animation is too large");
    const frames = decompressFrames(gif, true);
    const { canvas, ctx } = makeCanvas(gif.lsd.width, gif.lsd.height);
    let previous: typeof frames[number] | undefined;
    let restore: ImageData | undefined;
    const step = Math.ceil(frames.length / MAX_FRAMES);
    frameMs = Math.max(20, Math.min(2000, step * Math.round(frames.reduce((sum, f) => sum + (f.delay || 100), 0) / Math.max(1, frames.length))));
    for (const [i, f] of frames.entries()) {
      if (previous?.disposalType === 2) ctx.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height);
      if (previous?.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0);
      restore = f.disposalType === 3 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : undefined;
      const { canvas: patch, ctx: pc } = makeCanvas(f.dims.width, f.dims.height);
      pc.putImageData(new ImageData(new Uint8ClampedArray(f.patch), f.dims.width, f.dims.height), 0, 0);
      ctx.drawImage(patch, f.dims.left, f.dims.top);
      if (i % step === 0) sources.push(normalized(canvas, kind, layout));
      previous = f;
    }
  } else {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (image.width * image.height > 2048 * 2048) throw new Error("Image is too large");
      sources.push(normalized(image, kind, layout));
    } finally { URL.revokeObjectURL(url); }
  }
  const first = sources[0];
  if (!first) throw new Error("Empty image");
  const fw = first.width, fh = first.height;
  const { canvas, ctx } = makeCanvas(fw, sources.length * fh);
  sources.forEach((source, i) => ctx.drawImage(source, 0, i * fh));
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Image could not be prepared")), "image/png"));
  return { canvas, blob, frames: sources.length, frameMs };
}