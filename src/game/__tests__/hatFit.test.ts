import { describe, expect, it } from "vitest";
import { fitHat } from "../art/hatFit";
import { sourceCell } from "../art/layout";

describe("hat attachment", () => {
  it("keeps the original cap seated on a standard head", () => {
    expect(fitHat({ x: 3, y: 3, w: 10, h: 10 }, { x: 3, y: 1, w: 10, h: 5 }, "procedural")).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it("follows the head when the breathing frame moves down", () => {
    const hat = { x: 0, y: 0, w: 16, h: 13 };
    const idle = fitHat({ x: 3, y: 3, w: 10, h: 10 }, hat, "custom");
    const breathe = fitHat({ x: 3, y: 4, w: 10, h: 10 }, hat, "custom");
    expect(breathe.y - idle.y).toBe(1);
  });
  it("fits a larger imported head instead of keeping the small procedural size", () => {
    const fit = fitHat({ x: 1, y: 0, w: 14, h: 16 }, { x: 3, y: 1, w: 10, h: 5 }, "procedural");
    expect(fit.scale).toBe(1.4);
    expect(fit.x + 8 * fit.scale).toBe(8);
    expect(fit.y + 6 * fit.scale).toBeCloseTo(4.2);
  });
  it("centers a helmet over the head and seats it at the jaw", () => {
    const fit = fitHat({ x: 3, y: 3, w: 10, h: 10 }, { x: 1, y: 0, w: 22, h: 24 }, "helmet");
    expect(fit.x + 12 * fit.scale).toBe(8);
    expect(fit.y + 24 * fit.scale).toBe(14);
    expect(22 * fit.scale).toBe(14);
  });
  it.each([{ x: 6, y: 5, w: 4, h: 4 }, { x: 1, y: 0, w: 14, h: 16 }])("seats custom hats on small and large heads without covering the face", (head) => {
    const hat = { x: 2, y: 7, w: 12, h: 6 };
    const fit = fitHat(head, hat, "custom");
    expect(fit.x + (hat.x + hat.w / 2) * fit.scale).toBeCloseTo(head.x + head.w / 2);
    expect(fit.y + (hat.y + hat.h) * fit.scale).toBeCloseTo(head.y + Math.min(3, head.h / 4));
    expect(hat.w * fit.scale).toBeCloseTo(head.w + 2);
  });
  it("ignores transparent margins when positioning a custom hat", () => {
    const head = { x: 3, y: 3, w: 10, h: 10 };
    const tight = fitHat(head, { x: 0, y: 0, w: 12, h: 6 }, "custom");
    const padded = fitHat(head, { x: 3, y: 9, w: 12, h: 6 }, "custom");
    expect(padded.scale).toBe(tight.scale);
    expect(padded.x + 3 * padded.scale).toBeCloseTo(tight.x);
    expect(padded.y + 9 * padded.scale).toBeCloseTo(tight.y);
  });
});

describe("Graal hat cropping", () => {
  it("uses hat direction rows rather than head direction rows", () => {
    expect([0, 1, 2, 3].map((row) => sourceCell("graal-hat", row, 0, 96, 128).y)).toEqual([0, 64, 32, 96]);
  });
  it("keeps all three animation columns inside the 96×128 template", () => {
    expect([0, 1, 2, 3].map((col) => sourceCell("graal-hat", 0, col, 0 + 96, 128).x)).toEqual([0, 0, 32, 64]);
    expect(sourceCell("graal-hat", 3, 3, 96, 128)).toEqual({ x: 64, y: 96, w: 32, h: 32 });
  });
  it("supports four-column hat sheets at larger resolutions", () => {
    expect(sourceCell("graal-hat", 1, 3, 256, 256)).toEqual({ x: 192, y: 128, w: 64, h: 64 });
  });
});