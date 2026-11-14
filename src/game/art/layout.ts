export type ArtKind = "body" | "head" | "hat" | "melee";
export type ArtLayout = "single" | "grid" | "graal-body" | "graal-head";

/** Shared 16×24 character coordinates, independent of source resolution. */
export function artPlacement(kind: ArtKind, width: number, height: number) {
  const box = kind === "body" ? { y: 12, w: 12, h: 12 } : kind === "melee" ? { y: 0, w: 16, h: 24 } : { y: 0, w: 16, h: 13 };
  const scale = Math.min(box.w / Math.max(1, width), box.h / Math.max(1, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  return { x: Math.floor((16 - w) / 2), y: box.y + box.h - h, w, h };
}

export function sourceCell(layout: ArtLayout, row: number, col: number, width: number, height: number) {
  if (layout === "grid") return { x: col * width / 4, y: row * height / 4, w: width / 4, h: height / 4 };
  const direction = [2, 0, 1, 3][row] ?? 2;
  if (layout === "graal-body") return { x: direction * 32, y: col === 2 ? 32 : col === 3 ? 128 : 0, w: 32, h: 32 };
  if (layout === "graal-head") return { x: 0, y: direction * 32, w: 32, h: 32 };
  return { x: 0, y: 0, w: width, h: height };
}