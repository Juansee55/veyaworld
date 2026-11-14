import { useEffect, useRef } from "react";
import type { Direction, Look } from "@/game/catalog";

const SIZE = 40; // logical preview canvas (see drawPreview)
const WALK = [2, 0, 3, 0];

/**
 * Animated character drawn with the same layered art as the game.
 * `crop` shows only part of the 40×40 preview (e.g. the head for avatars).
 */
export function CharacterCanvas({ look, dir = "down", walking = false, scale = 4, crop, className = "" }: {
  look: Look; dir?: Direction; walking?: boolean; scale?: number;
  crop?: { x: number; y: number; w: number; h: number }; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0, t = 0, last = performance.now(), alive = true;
    let draw: typeof import("@/game/art/layers").drawPreview | null = null;
    void import("@/game/art/layers").then(async (m) => { await m.loadLayerArt(); if (alive) draw = m.drawPreview; });
    const loop = (now: number) => {
      t += now - last; last = now;
      const ctx = ref.current?.getContext("2d");
      if (ctx && draw) draw(ctx, look, dir, walking ? WALK[Math.floor(t / 160) % 4]! : 0, scale, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [look, dir, walking, scale]);
  const c = crop ?? { x: 0, y: 0, w: SIZE, h: SIZE };
  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`} style={{ width: c.w * scale, height: c.h * scale }}>
      <canvas ref={ref} width={SIZE * scale} height={SIZE * scale}
        className="absolute [image-rendering:pixelated]" style={{ left: -c.x * scale, top: -c.y * scale }} />
    </div>
  );
}

/** Head-and-hat crop used for small avatars. */
export const HEAD_CROP = { x: 8, y: 8, w: 24, h: 20 };
