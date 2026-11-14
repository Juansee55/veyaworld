export interface PixelBounds { x: number; y: number; w: number; h: number }

/** Fit visible hat pixels to the visible head, in the shared 16×24 character space. */
export function fitHat(head: PixelBounds, hat: PixelBounds, kind: "procedural" | "custom" | "helmet") {
  const scale = kind === "procedural" ? head.w / 10 : (head.w + (kind === "helmet" ? 4 : 2)) / hat.w;
  const seat = kind === "helmet" ? head.h + 1 : kind === "custom" ? Math.min(3, head.h / 4) : (hat.y + hat.h - 3) * scale;
  return {
    scale,
    x: head.x + head.w / 2 - (hat.x + hat.w / 2) * scale,
    y: head.y + seat - (hat.y + hat.h) * scale,
  };
}