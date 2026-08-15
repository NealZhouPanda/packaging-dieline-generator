import { describe, expect, it } from "vitest";
import { generateK016A } from "../src/generatorK016A.js";

describe("K016A 提手盒", () => {
  it("matches the Packmage reference at the captured base dimensions", () => {
    const geometry = generateK016A({ length: 200, width: 100, depth: 100, caliper: 1 });

    expect(geometry.parameters.boxType).toBe("K016A");
    expect(geometry.meta.width).toBe(614);
    expect(geometry.meta.height).toBe(270.67);
    expect(geometry.meta.solidLength).toBe(3124.9);
    expect(geometry.meta.foldLength).toBe(1865.9);
    expect(geometry.elements).toHaveLength(110);
    expect(geometry.elements.some(([type]) => type === 1)).toBe(true);
  });

  it("keeps the handle geometry while interpolating the project default size", () => {
    const geometry = generateK016A({ length: 350, width: 190, depth: 230, caliper: 3 });

    expect(geometry.elements).toHaveLength(110);
    expect(geometry.meta.width).toBe(1093);
    expect(geometry.meta.height).toBe(522);
    expect(geometry.meta.solidLength).toBe(5071.4);
    expect(geometry.meta.foldLength).toBe(3625.8);
    expect(geometry.elements.some((element) => element[0] === 1)).toBe(true);
    expect(geometry.elements.every((element) => element.length >= 6)).toBe(true);
  });

  it("matches the captured 3 mm and 5 mm paper thickness samples", () => {
    expect(generateK016A({ length: 200, width: 100, depth: 100, caliper: 3 }).meta).toMatchObject({
      width: 613,
      height: 274,
      solidLength: 3147.7,
      foldLength: 1843.8,
    });
    expect(generateK016A({ length: 200, width: 100, depth: 100, caliper: 5 }).meta).toMatchObject({
      width: 622,
      height: 277.33,
      solidLength: 3186,
      foldLength: 1821.7,
    });
  });

  it("rejects dimensions outside the verified operating range", () => {
    expect(() => generateK016A({ length: 199, width: 100, depth: 100, caliper: 3 })).toThrow(/verified/);
    expect(() => generateK016A({ length: 200, width: 100, depth: 100, caliper: 5.1 })).toThrow(/caliper/);
  });
});
