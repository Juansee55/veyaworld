import { describe, expect, it } from "vitest";
import { validateWorldArt } from "@/lib/game/world-art-rules";
describe("world editor images", () => {
  it("accepts a horizontal strip of 16×16 tiles", () => { expect(validateWorldArt("tileset", 64, 16).count).toBe(4); });
  it("rejects a vertical strip", () => { expect(() => validateWorldArt("tileset", 16, 64)).toThrow(); });
  it("rejects tiles not aligned to 16×16", () => { expect(() => validateWorldArt("tileset", 33, 16)).toThrow(); });
  it("accepts objects aligned to the tile grid", () => { expect(validateWorldArt("object", 32, 48)).toEqual({ width: 32, height: 48, count: 2 }); });
});