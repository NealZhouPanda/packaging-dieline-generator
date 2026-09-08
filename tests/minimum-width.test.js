import { describe, expect, it } from "vitest";
import { createBoxTopology } from "../src/box-topology.js";
import { generate0421 } from "../src/generator0421.js";
import { generateK016A } from "../src/generatorK016A.js";
import { generate0201, generateC001GX, generateE005C } from "../src/generators-legacy.js";
import { containerLoadCount, volumetricWeightKg } from "../src/netarea.js";
import { geometryToPdf } from "../src/pdf.js";
import { geometryToSvg } from "../src/svg.js";

const cases = [
  ["0201", generate0201, { paperType: "corrugated", caliper: 5 }],
  ["0421", generate0421, { paperType: "corrugated", caliper: 5 }],
  ["E005C", generateE005C, { paperType: "corrugated", caliper: 3 }],
  ["K016A", generateK016A, { paperType: "corrugated", caliper: 5 }],
  ["C001GX", generateC001GX, { paperType: "white-card", caliper: 0.5, c001gxTongueStyle: 2 }],
];

const parameters = (overrides) => ({
  length: 350,
  width: 50,
  depth: 230,
  ...overrides,
});

const finite = (value) => typeof value !== "number" || Number.isFinite(value);

describe("50 mm minimum width", () => {
  it.each(cases)("keeps %s geometry, SVG and 3D topology valid", (boxId, generate, overrides) => {
    const geometry = generate(parameters(overrides));
    const topology = createBoxTopology(geometry);

    expect(geometry.parameters.boxType).toBe(boxId);
    expect(geometry.meta.width).toBeGreaterThan(0);
    expect(geometry.meta.height).toBeGreaterThan(0);
    expect(geometry.elements.flat().every(finite)).toBe(true);
    expect(() => geometryToSvg(geometry)).not.toThrow();
    expect(geometryToPdf(geometry, { date: "2026-09-07" }).byteLength).toBeGreaterThan(100);
    expect(topology.bounds.maxX - topology.bounds.minX).toBeGreaterThan(0);
    expect(topology.bounds.maxY - topology.bounds.minY).toBeGreaterThan(0);
    expect(topology.pieces.every(({ netPoints, netRect }) =>
      (netPoints?.flat() ?? Object.values(netRect ?? {})).every(Number.isFinite),
    )).toBe(true);
    expect(volumetricWeightKg({ ...parameters(overrides), boxType: boxId }, 8000)).toBeGreaterThan(0);
    expect(containerLoadCount({ ...parameters(overrides), boxType: boxId }, "40HQ")).toBeGreaterThan(0);
  });

  it.each(cases)("supports %s at the shared 50 x 50 x 50 mm lower corner", (_boxId, generate, overrides) => {
    const geometry = generate({ length: 50, width: 50, depth: 50, ...overrides });

    expect(() => geometryToSvg(geometry)).not.toThrow();
    expect(() => createBoxTopology(geometry)).not.toThrow();
  });

  it.each(cases)("rejects %s below the shared 50 mm limit", (_boxId, generate, overrides) => {
    expect(() => generate(parameters({ ...overrides, width: 49 }))).toThrow();
  });
});
