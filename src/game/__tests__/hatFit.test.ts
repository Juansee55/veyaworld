import { describe, expect, it } from "vitest";
import { fitHat } from "../art/hatFit";

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
});