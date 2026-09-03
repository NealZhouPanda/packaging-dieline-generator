import { describe, expect, it } from "vitest";
import { snapshotSizeFor } from "../src/three-preview.js";

describe("3D high-resolution snapshot sizing", () => {
  it("uses the full 4K render budget even in a narrow preview panel", () => {
    expect(snapshotSizeFor(800, 500)).toEqual({ width: 4096, height: 2560, scale: 5.12 });
  });

  it("caps the longest side at the supported 4K render size", () => {
    const size = snapshotSizeFor(1280, 720);
    expect(size.width).toBe(4096);
    expect(size.height).toBe(2304);
    expect(size.width / size.height).toBeCloseTo(1280 / 720, 3);
  });

  it("respects tighter device limits while preserving aspect ratio", () => {
    const size = snapshotSizeFor(1200, 800, { maxWidth: 2048, maxHeight: 1536, maxScale: 4 });
    expect(size.width).toBe(2048);
    expect(size.height).toBe(1365);
    expect(size.width / size.height).toBeCloseTo(1.5, 2);
  });
});
