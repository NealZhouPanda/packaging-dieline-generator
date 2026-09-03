import { describe, expect, it } from "vitest";
import { createBoxTopology, phaseAngleAt, supportsBoxTopology } from "../src/box-topology.js";
import { generate0421 } from "../src/generator0421.js";
import { create0421Topology } from "../src/topology0421.js";

function sample0421(overrides = {}) {
  return generate0421({
    boxType: "0421",
    length: 350,
    width: 190,
    depth: 230,
    caliper: 5,
    paperType: "corrugated",
    ...overrides,
  });
}

describe("generic box topology protocol", () => {
  it("registers only the completed texture and 3D box types", () => {
    expect(supportsBoxTopology("0201")).toBe(true);
    expect(supportsBoxTopology("0421")).toBe(true);
    expect(supportsBoxTopology("E005C")).toBe(true);
    expect(supportsBoxTopology("K016A")).toBe(true);
    expect(supportsBoxTopology("C001GX")).toBe(true);
  });

  it("dispatches and validates a 0421 topology", () => {
    const topology = createBoxTopology(sample0421());
    expect(topology.boxId).toBe("0421");
    expect(topology.pieces.filter(({ foldRule }) => !foldRule.parentId)).toHaveLength(1);
  });
});

describe("0421 topology", () => {
  it("matches the official 15-plane hierarchy", () => {
    const topology = create0421Topology(sample0421());
    expect(topology.maxAngleSteps).toBe(9);
    expect(topology.pieces.map(({ id, foldRule }) => `${id}${foldRule.parentId ? `:${foldRule.parentId}` : ""}`)).toEqual([
      "M0", "M1:M0", "M2:M0", "M3:M0", "M4:M0", "M5:M1", "M6:M2", "M7:M3",
      "M9:M5", "M11:M7", "S2R:M2", "S2L:M2", "S4L:M4", "S4R:M4", "M8:M6",
    ]);
    expect(topology.pieces.every(({ netPoints }) => netPoints.length >= 4)).toBe(true);
    expect(topology.pieces.every(({ sideNetPoints, netPoints }) => sideNetPoints.length === netPoints.length + 1)).toBe(true);
  });

  it("uses the official staged folding phases and axis directions", () => {
    const topology = create0421Topology(sample0421());
    const piece = (id) => topology.pieces.find((candidate) => candidate.id === id);
    expect(piece("M1").foldRule.sourceLine).toEqual({ type: 1, x1: 0, y1: 0, x2: 0, y2: 28 });
    expect(piece("M2").foldRule.sourceLine).toEqual({ type: 1, x1: 347.5, y1: 0, x2: 2.5, y2: 0 });
    expect(piece("M6").foldRule.phaseAngles).toEqual([0, 0, -30, -30, -30, -30, -30, 90]);
    expect(piece("M8").foldRule.phaseAngles).toEqual([0, 0, 0, 0, 0, 0, 105, 105, 90.1]);
    expect(piece("S2R").foldRule.phaseAngles).toEqual([0, 90.1]);
    expect(phaseAngleAt(piece("M6").foldRule.phaseAngles, 0.5, topology.maxAngleSteps)).toBe(-30);
    expect(phaseAngleAt(piece("M8").foldRule.phaseAngles, 0.75, topology.maxAngleSteps)).toBe(105);
  });

  it("keeps every contour tied to generated dimensions", () => {
    const small = create0421Topology(sample0421({ length: 300, width: 200, depth: 100 }));
    const large = create0421Topology(sample0421({ length: 500, width: 260, depth: 320 }));
    expect(small.pieces.find(({ id }) => id === "M0").netPoints).not.toEqual(
      large.pieces.find(({ id }) => id === "M0").netPoints,
    );
    expect(small.bounds.maxX - small.bounds.minX).toBeLessThan(large.bounds.maxX - large.bounds.minX);
  });

  it("rejects non-0421 and incomplete source geometry", () => {
    expect(() => create0421Topology({ meta: { boxId: "0201" }, elements: [] })).toThrow(/0421/);
    expect(() => create0421Topology({ meta: { boxId: "0421" }, elements: [] })).toThrow(/不完整/);
  });
});
