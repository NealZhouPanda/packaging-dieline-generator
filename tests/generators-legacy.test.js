import { describe, expect, it } from "vitest";
import { generate0201, generateC001GX, generateE005C } from "../src/generators-legacy.js";
import { geometryToSvg } from "../src/svg.js";

const validElements = (geometry) =>
  geometry.elements.every((element) => element.every((value) => typeof value !== "number" || Number.isFinite(value)));

describe("migrated single-file generators", () => {
  it.each([
    ["0201", generate0201, { length: 350, width: 190, depth: 230, caliper: 5, paperType: "corrugated" }],
    ["E005C", generateE005C, { length: 350, width: 190, depth: 230, caliper: 3, paperType: "corrugated" }],
    ["C001GX", generateC001GX, { length: 350, width: 190, depth: 230, caliper: 0.5, paperType: "white-card" }],
  ])("keeps %s in module source and exports valid SVG", (boxType, generate, parameters) => {
    const geometry = generate(parameters);

    expect(geometry.parameters.boxType).toBe(boxType);
    expect(geometry.parameters.paperType).toBe(parameters.paperType);
    expect(geometry.meta.width).toBeGreaterThan(0);
    expect(geometry.meta.height).toBeGreaterThan(0);
    expect(validElements(geometry)).toBe(true);
    expect(() => geometryToSvg(geometry)).not.toThrow();
  });

  it("keeps white card limited to the supported C001GX structure", () => {
    expect(() =>
      generate0201({ length: 350, width: 190, depth: 230, caliper: 0.5, paperType: "white-card" }),
    ).toThrow(/已验证范围/);
    expect(() =>
      generateE005C({ length: 350, width: 190, depth: 230, caliper: 0.5, paperType: "white-card" }),
    ).toThrow(/已验证范围/);
  });
});
