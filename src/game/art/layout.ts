export type ArtKind = "body" | "head" | "hat" | "melee";
export type ArtLayout = "single" | "grid" | "graal-body" | "graal-head" | "graal-hat";

/** Shared 16×24 character coordinates, independent of source resolution. */
export function artPlacement(kind: ArtKind, width: number, height: number) {
  const box = kind === "body" ? { y: 12, w: 12, h: 12 } : kind === "melee" ? { y: 0, w: 16, h: 24 } : { y: 0, w: 16, h: 13 };
  const scale = Math.min(box.w / Math.max(1, width), box.h / Math.max(1, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  return { x: Math.floor((16 - w) / 2), y: box.y + box.h - h, w, h };
}

export function sourceCell(layout: ArtLayout, row: number, col: number, width: number, height: number) {
  if (layout === "grid") return { x: col * width / 4, y: row * height / 4, w: width / 4, h: height / 4 };
  if (layout === "graal-hat") {
    // Graal hats use down/left/up/right rows, with idle and two walking cells.
    // Accept both the three-column template and four-column sheets.
    const columns = width < height ? 3 : 4;
    const w = width / columns, h = height / 4;
    return { x: (columns === 3 ? [0, 0, 1, 2][col] ?? 0 : col) * w, y: ([0, 2, 1, 3][row] ?? 0) * h, w, h };
  }
  const direction = [2, 0, 1, 3][row] ?? 2;
  if (layout === "graal-body") return { x: direction * 32, y: col === 2 ? 32 : col === 3 ? 128 : 0, w: 32, h: 32 };
  if (layout === "graal-head") return { x: 0, y: direction * 32, w: 32, h: 32 };
  return { x: 0, y: 0, w: width, h: height };
}