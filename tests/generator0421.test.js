import { describe, expect, it } from "vitest";
import { generate0421 } from "../src/generator0421.js";
import { geometryToSvg } from "../src/svg.js";

describe("0421 flip-top display box", () => {
  it("matches the supplied Packmage reference geometry", () => {
    const geometry = generate0421({ length: 300, width: 200, depth: 100, caliper: 3 });

    expect(geometry.parameters.boxType).toBe("0421");
    expect(geometry.meta.width).toBe(703.98);
    expect(geometry.meta.height).toBe(694);
    expect(geometry.meta.solidLength).toBe(3858.2);
    expect(geometry.meta.foldLength).toBe(2602.1);
    expect(geometry.elements.some(([type]) => type === 1)).toBe(true);
    expect(geometry.elements.length).toBe(90);
    expect(geometry.elements.every((element) => element.length >= 6)).toBe(true);
  });

  it("interpolates the supplied reference variants", () => {
    const geometry = generate0421({ length: 350, width: 190, depth: 230, caliper: 3 });

    expect(geometry.meta.width).toBe(1273.98);
    expect(geometry.meta.height).toBe(1064);
    expect(geometry.parameters.slotCount).toBe(2);
  });

  it("generates the white-card variant for the display box", () => {
    const geometry = generate0421({
      length: 300,
      width: 200,
      depth: 100,
      caliper: 0.5,
      paperType: "white-card",
    });

    expect(geometry.parameters.paperType).toBe("white-card");
    expect(geometry.meta.width).toBe(702.28);
    expect(geometry.meta.height).toBe(699);
    expect(geometry.elements.length).toBe(90);
  });

  it("keeps the exported canvas aligned with the boundary geometry", () => {
    const geometry = generate0421({ length: 600, width: 400, depth: 50, caliper: 1.5 });

    expect(geometry.meta.width).toBe(997);
    expect(geometry.meta.height).toBe(947);
    expect(() => geometryToSvg(geometry)).not.toThrow();
  });

  it("rejects dimensions outside the current verified envelope", () => {
    expect(() => generate0421({ length: 100, width: 200, depth: 100, caliper: 3 })).toThrow(/verified/);
    expect(() => generate0421({ length: 300, width: 200, depth: 100, caliper: 6 })).toThrow(/caliper/);
  });
});
