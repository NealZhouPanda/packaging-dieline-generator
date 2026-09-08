import { describe, expect, it } from "vitest";
import { createBoxTopology } from "../src/box-topology.js";
import { generate0421 } from "../src/generator0421.js";
import { generateC001GX } from "../src/generators-legacy.js";
import { whiteCardCalipersFor } from "../src/material-options.js";
import { geometryToPdf } from "../src/pdf.js";
import { geometryToSvg } from "../src/svg.js";

const samples = [
  ["0421", generate0421, { length: 350, width: 190, depth: 230, caliper: 1, paperType: "white-card" }],
  [
    "C001GX",
    generateC001GX,
    { length: 350, width: 190, depth: 230, caliper: 1, paperType: "white-card", c001gxTongueStyle: 2 },
  ],
];

describe("1.0 mm white-card support", () => {
  it.each(samples)("generates, exports, and builds 3D topology for %s", (_boxType, generator, parameters) => {
    const geometry = generator(parameters);
    const topology = createBoxTopology(geometry);

    expect(geometry.parameters.caliper).toBe(1);
    expect(geometry.elements.length).toBeGreaterThan(0);
    expect(geometry.elements.every((element) => element.slice(2).every(Number.isFinite))).toBe(true);
    expect(geometryToSvg(geometry)).toContain("<svg");
    expect(geometryToPdf(geometry).byteLength).toBeGreaterThan(100);
    expect(topology.pieces.length).toBeGreaterThan(0);
    expect(
      topology.pieces.every((piece) =>
        (piece.netPoints || []).every((point) => point.every(Number.isFinite)),
      ),
    ).toBe(true);
  });

  it.each(samples)("rejects unsupported white-card thickness above 1.0 mm for %s", (_boxType, generator, parameters) => {
    expect(() => generator({ ...parameters, caliper: 1.1 })).toThrow(/1(?:\.0)? mm|0.4–1/);
  });

  it("offers 1.0 mm only for the two requested box types", () => {
    expect(whiteCardCalipersFor("0421")).toEqual([0.4, 0.5, 0.6, 0.8, 1]);
    expect(whiteCardCalipersFor("C001GX")).toEqual([0.4, 0.5, 0.6, 0.8, 1]);
    expect(whiteCardCalipersFor("0201")).toEqual([0.4, 0.5, 0.6, 0.8]);
    expect(whiteCardCalipersFor("E005C")).toEqual([0.4, 0.5, 0.6, 0.8]);
    expect(whiteCardCalipersFor("K016A")).toEqual([0.4, 0.5, 0.6, 0.8]);
  });
});
