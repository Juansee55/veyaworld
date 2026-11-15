import type * as Phaser from "phaser";
import hatHelm from "@/assets/art/hat_shadow_helm.png.asset.json";
import knife from "@/assets/art/melee_violet_knife.png.asset.json";
import kunai from "@/assets/art/melee_jade_kunai.png.asset.json";
import staff from "@/assets/art/melee_moon_staff.png.asset.json";
import voidBlade from "@/assets/art/melee_void_blade.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_LOOK, DIRECTIONS, isCustomPart, type Direction, type Look } from "../catalog";
import { buildCharacterSheets } from "./characterArt";
import { loadUploadedArt } from "./uploadedArt";
import { fitHat, type PixelBounds } from "./hatFit";
import { autumnHatSheets } from "./autumnArt";

export type Layer = "body" | "head" | "hat" | "melee";
/**
 * One character layer texture. Character layers stack animation blocks vertically, each block being
 * 4 columns x 4 direction rows of fw x fh. Melee sheets have 8 orientation columns per animation row.
 */
export interface LayerSheet { image: HTMLCanvasElement | HTMLImageElement; fw: number; fh: number; frames: number; ms: number; oy: number; melee: boolean }

const registry = new Map<string, LayerSheet>();
const pending = new Map<string, Promise<LayerSheet | null>>();
export const MELEE_CELL = 32;

const EXTRA = [
  { key: "hat:hat_shadow_helm", url: hatHelm.url, fw: 24, fh: 24, ms: 150, oy: 0, melee: false },
  { key: "melee:melee_violet_knife", url: knife.url, fw: 42, fh: 42, ms: 200, oy: 0, melee: true },
  { key: "melee:melee_jade_kunai", url: kunai.url, fw: 29, fh: 29, ms: 200, oy: 0, melee: true },
  { key: "melee:melee_moon_staff", url: staff.url, fw: 32, fh: 32, ms: 200, oy: 0, melee: true },
  { key: "melee:melee_void_blade", url: voidBlade.url, fw: 38, fh: 38, ms: 300, oy: 0, melee: true },
];

async function image(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}
const framesOf = (h: number, fh: number, melee: boolean) => Math.max(1, Math.floor(h / (melee ? fh : fh * 4)));

let loading: Promise<void> | undefined;
export function loadLayerArt() {
  loading ??= (async () => {
    await loadUploadedArt();
    for (const [key, canvas] of buildCharacterSheets()) registry.set(key, { image: canvas, fw: 16, fh: 24, frames: 1, ms: 1000, oy: 0, melee: false });
    for (const { id, canvas } of autumnHatSheets()) registry.set(`hat:${id}`, { image: canvas, fw: 16, fh: 24, frames: 1, ms: 1000, oy: 0, melee: false });
    await Promise.allSettled(EXTRA.map(async (e) => {
      const img = await image(e.url);
      let source: HTMLCanvasElement | HTMLImageElement = img;
      if (!e.melee) {
        // The original helmet rows are down, left, up, right; the game uses down, up, left, right.
        const canvas = document.createElement("canvas");
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          for (let a = 0; a < framesOf(img.height, e.fh, false); a++) {
            [0, 2, 1, 3].forEach((row, target) => ctx.drawImage(img, 0, (a * 4 + row) * e.fh, img.width, e.fh, 0, (a * 4 + target) * e.fh, img.width, e.fh));
          }
          source = canvas;
        }
      }
      registry.set(e.key, { image: source, fw: e.fw, fh: e.fh, frames: framesOf(img.height, e.fh, e.melee), ms: e.ms, oy: e.oy, melee: e.melee });
    }));
  })();
  return loading;
}

export const layerKeys = () => [...registry.keys()];
export const sheetFor = (key: string) => registry.get(key);
/** Temporary editor sheets use the same attachment and animation as gameplay. */
export function registerPreviewSheet(layer: Layer, id: string, canvas: HTMLCanvasElement, frames: number, ms: number) {
  registry.set(`${layer}:${id}`, { image: canvas, fw: layer === "melee" ? 32 : 16, fh: layer === "melee" ? 32 : 24, frames, ms, oy: 0, melee: layer === "melee" });
  return () => { registry.delete(`${layer}:${id}`); };
}

/** Fetch a player-uploaded part (private storage, readable by signed-in players). */
export function loadCustom(layer: Layer, id: string): Promise<LayerSheet | null> {
  const key = `${layer}:${id}`;
  const known = registry.get(key);
  if (known) return Promise.resolve(known);
  let p = pending.get(key);
  if (!p) {
    p = (async () => {
      const { data } = await supabase.from("player_art").select("kind, sheet_path, frames, frame_ms").eq("id", id.slice(7)).maybeSingle();
      if (!data || data.kind !== layer) return null;
      const { data: blob } = await supabase.storage.from("player-art").download(data.sheet_path);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      try {
        const img = await image(url);
        const melee = layer === "melee";
        const sheet: LayerSheet = { image: img, fw: melee ? MELEE_CELL : 16, fh: melee ? MELEE_CELL : 24, frames: data.frames, ms: data.frame_ms, oy: 0, melee };
        sheet.frames = Math.min(sheet.frames, framesOf(img.height, sheet.fh, melee));
        registry.set(key, sheet);
        return sheet;
      } finally { URL.revokeObjectURL(url); }
    })().catch(() => null);
    pending.set(key, p);
  }
  return p;
}

/** Registry key to draw for a part; falls back to the default part while a custom upload loads. */
export function resolveKey(layer: Layer, id: string, onReady?: () => void) {
  const key = `${layer}:${id}`;
  if (registry.has(key)) return key;
  if (isCustomPart(id)) void loadCustom(layer, id).then((s) => { if (s) onReady?.(); });
  return `${layer}:${DEFAULT_LOOK[`${layer}_id`]}`;
}

export function ensureLayerTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return true;
  const s = registry.get(key);
  if (!s) return false;
  scene.textures.addSpriteSheet(key, s.image as HTMLImageElement, { frameWidth: s.fw, frameHeight: s.fh });
  return true;
}

export const animFrame = (s: LayerSheet | undefined, clock: number) => (s && s.frames > 1 ? Math.floor(clock / s.ms) % s.frames : 0);
/** Melee sheets: column 0 points up, then clockwise in 45° steps. */
export const MELEE_FACING: Record<Direction, number> = { up: 0, right: 2, down: 4, left: 6 };

const boundsCache = new WeakMap<LayerSheet, Map<number, PixelBounds | null>>();
function visibleBounds(sheet: LayerSheet, frame: number) {
  let cache = boundsCache.get(sheet);
  if (!cache) { cache = new Map(); boundsCache.set(sheet, cache); }
  if (cache.has(frame)) return cache.get(frame);
  const canvas = document.createElement("canvas");
  canvas.width = sheet.fw; canvas.height = sheet.fh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(sheet.image, (frame % 4) * sheet.fw, Math.floor(frame / 4) * sheet.fh, sheet.fw, sheet.fh, 0, 0, sheet.fw, sheet.fh);
  const pixels = ctx.getImageData(0, 0, sheet.fw, sheet.fh).data;
  let left = sheet.fw, top = sheet.fh, right = -1, bottom = -1;
  for (let y = 0; y < sheet.fh; y++) for (let x = 0; x < sheet.fw; x++) {
    if ((pixels[(y * sheet.fw + x) * 4 + 3] ?? 0) <= 20) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  const bounds = right < left ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  cache.set(frame, bounds);
  return bounds;
}

/** Shared by Phaser and every canvas preview, including existing player uploads. */
export function hatTransform(head: LayerSheet | undefined, hat: LayerSheet | undefined, id: string, frame: number, clock: number) {
  if (!head || !hat) return { x: 0, y: hat?.oy ?? 0, scale: 1 };
  const h = visibleBounds(head, animFrame(head, clock) * 16 + frame);
  const b = visibleBounds(hat, animFrame(hat, clock) * 16 + frame);
  if (!h || !b) return { x: 0, y: hat.oy, scale: 1 };
  const fit = fitHat(h, b, id === "hat_shadow_helm" ? "helmet" : isCustomPart(id) || id.startsWith("hat_autumn_") ? "custom" : "procedural");
  return { scale: fit.scale, x: -head.fw / 2 + fit.x + hat.fw * fit.scale / 2, y: head.oy - head.fh + fit.y + hat.fh * fit.scale };
}

/** Wardrobe preview: BODY -> HEAD -> HAT on a 40x40 logical canvas, with the melee held at the side. */
export function drawPreview(ctx: CanvasRenderingContext2D, look: Look, dir: Direction, col: number, scale: number, clock: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const row = DIRECTIONS.indexOf(dir);
  for (const layer of ["body", "head", "hat"] as const) {
    const id = look[`${layer}_id`];
    if (layer === "hat" && id === "hat_none") continue;
    const s = registry.get(resolveKey(layer, id));
    if (!s) continue;
    const a = animFrame(s, clock);
    const fit = layer === "hat" ? hatTransform(registry.get(resolveKey("head", look.head_id)), s, id, row * 4 + col, clock) : { x: 0, y: s.oy, scale: 1 };
    ctx.drawImage(s.image, col * s.fw, (a * 4 + row) * s.fh, s.fw, s.fh, (20 + fit.x - s.fw * fit.scale / 2) * scale, (38 + fit.y - s.fh * fit.scale) * scale, s.fw * fit.scale * scale, s.fh * fit.scale * scale);
  }
  const m = registry.get(resolveKey("melee", look.melee_id));
  if (m && look.melee_id !== "melee_none") {
    const size = 16;
    ctx.drawImage(m.image, 1 * m.fw, animFrame(m, clock) * m.fh, m.fw, m.fh, 23 * scale, 12 * scale, size * scale, size * scale);
  }
}
