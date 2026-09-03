import { describe, expect, it } from "vitest";
import { createBoxTopology, phaseAngleAt } from "../src/box-topology.js";
import { generateE005C } from "../src/generators-legacy.js";
import { createE005CTopology } from "../src/topologyE005C.js";

function sampleE005C(overrides = {}) {
  return generateE005C({
    boxType: "E005C",
    length: 350,
    width: 190,
    depth: 230,
    caliper: 3,
    paperType: "corrugated",
    ...overrides,
  });
}

describe("0427/E005C topology", () => {
  it("dispatches through the generic topology protocol", () => {
    expect(createBoxTopology(sampleE005C()).boxId).toBe("E005C");
  });

  it("matches the official 19-plane hierarchy", () => {
    const topology = createE005CTopology(sampleE005C());
    expect(topology.officialBoxId).toBe("0427");
    expect(topology.maxAngleSteps).toBe(10);
    expect(topology.pieces.map(({ id, foldRule }) => `${id}${foldRule.parentId ? `:${foldRule.parentId}` : ""}`)).toEqual([
      "M0", "M1:M0", "M2:M0", "M3:M0", "M4:M0", "M5:M1", "M6:M2", "M7:M3",
      "M9:M5", "M11:M7", "S2R:M2", "S2L:M2", "S4L:M4", "S4R:M4", "S6L:M6",
      "S6R:M6", "M8:M6", "S8L:M8", "S8R:M8",
    ]);
    expect(topology.pieces.every(({ netPoints }) => netPoints.length >= 3)).toBe(true);
    expect(topology.pieces.every(({ sideNetPoints, netPoints }) => sideNetPoints.length === netPoints.length + 1)).toBe(true);
  });

  it("uses the official staged fold sequence and axis directions", () => {
    const topology = createE005CTopology(sampleE005C());
    const piece = (id) => topology.pieces.find((candidate) => candidate.id === id);
    expect(piece("M2").foldRule.sourceLine).toEqual({ type: 1, x1: 348.5, y1: 0, x2: 1.5, y2: 0 });
    expect(piece("M6").foldRule.sourceLine).toEqual({ type: 1, x1: 340, y1: -230, x2: 10, y2: -230 });
    expect(piece("M6").foldRule.phaseAngles).toEqual([0, 0, -30, -30, -30, -30, -30, -30, 90]);
    expect(piece("M8").foldRule.phaseAngles).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 90]);
    expect(piece("S8R").foldRule.sourceLine).toEqual({ type: 1, x1: 347, y1: -424.5, x2: 347, y2: -651.5 });
    expect(phaseAngleAt(piece("M6").foldRule.phaseAngles, 0.6, topology.maxAngleSteps)).toBe(-30);
    expect(phaseAngleAt(piece("M8").foldRule.phaseAngles, 8 / 9, topology.maxAngleSteps)).toBe(0);
  });

  it("supports both official shallow and deep contour branches", () => {
    const shallow = createE005CTopology(sampleE005C({ length: 300, width: 200, depth: 50 }));
    const deep = createE005CTopology(sampleE005C({ length: 350, width: 190, depth: 230 }));
    expect(shallow.pieces).toHaveLength(19);
    expect(deep.pieces).toHaveLength(19);
    expect(shallow.pieces.find(({ id }) => id === "S8L").netPoints).not.toEqual(
      deep.pieces.find(({ id }) => id === "S8L").netPoints,
    );
    expect(shallow.bounds.maxY - shallow.bounds.minY).toBeLessThan(deep.bounds.maxY - deep.bounds.minY);
  });

  it("keeps all contours tied to generated dimensions", () => {
    const small = createE005CTopology(sampleE005C({ length: 300, width: 180, depth: 90 }));
    const large = createE005CTopology(sampleE005C({ length: 500, width: 260, depth: 320 }));
    expect(small.pieces.find(({ id }) => id === "M0").netPoints).not.toEqual(
      large.pieces.find(({ id }) => id === "M0").netPoints,
    );
    expect(small.bounds.maxX - small.bounds.minX).toBeLessThan(large.bounds.maxX - large.bounds.minX);
  });

  it("rejects non-E005C and incomplete source geometry", () => {
    expect(() => createE005CTopology({ meta: { boxId: "0421" }, elements: [] })).toThrow(/E005C/);
    expect(() => createE005CTopology({ meta: { boxId: "E005C" }, elements: [] })).toThrow(/不完整/);
  });
});
