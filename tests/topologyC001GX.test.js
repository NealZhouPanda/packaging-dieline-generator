import { describe, expect, it } from "vitest";
import { createBoxTopology } from "../src/box-topology.js";
import { generateC001GX } from "../src/generators-legacy.js";
import { createC001GXTopology } from "../src/topologyC001GX.js";

function sampleC001GX(overrides = {}) {
  return generateC001GX({
    length: 350,
    width: 190,
    depth: 230,
    caliper: 0.5,
    paperType: "white-card",
    c001gxTongueStyle: 2,
    ...overrides,
  });
}

describe("C001GX topology", () => {
  it("dispatches through the common topology protocol", () => {
    expect(createBoxTopology(sampleC001GX()).boxId).toBe("C001GX");
  });

  it("matches the official 15-plane parent hierarchy", () => {
    const topology = createC001GXTopology(sampleC001GX());
    expect(topology.maxAngleSteps).toBe(10);
    expect(topology.pieces.map(({ id }) => id)).toEqual([
      "M0", "M1", "M3", "M5", "S1T", "S3T", "S5", "M6",
      "S6", "S0", "S1B", "S3B", "S5B", "S5T", "S5TT",
    ]);
    expect(Object.fromEntries(topology.pieces.map((piece) => [
      piece.id,
      piece.foldRule.parentId,
    ]))).toEqual({
      M0: null,
      M1: "M0",
      M3: "M0",
      M5: "M1",
      S1T: "M1",
      S3T: "M3",
      S5: "M5",
      M6: "M0",
      S6: "M6",
      S0: "M0",
      S1B: "M1",
      S3B: "M3",
      S5B: "M5",
      S5T: "M5",
      S5TT: "S5T",
    });
  });

  it("preserves the official staged fold sequence", () => {
    const topology = createC001GXTopology(sampleC001GX());
    const piece = (id) => topology.pieces.find((item) => item.id === id);
    expect(piece("M3").foldRule.phaseAngles).toEqual([0, 45, 90]);
    expect(piece("M6").foldRule.phaseAngles).toEqual([0, 0, 0, 0, 0, 0, 0, -30, 90]);
    expect(piece("S5T").foldRule.phaseAngles).toEqual([0, 0, 0, 0, 0, 0, 0, -45, -45, 0]);
    expect(piece("S0").foldRule.phaseAngles.slice(0, 6)).toEqual([0, 0, 0, 135, 135, 135]);
    expect(piece("S0").foldRule.phaseAngles.at(-1)).toBeGreaterThan(90);
    expect(piece("S6").foldRule.phaseAngles.at(-1)).toBe(90.1);
  });

  it("supports both official tuck-tongue contour variants", () => {
    const style1 = createC001GXTopology(sampleC001GX({ c001gxTongueStyle: 1 }));
    const style2 = createC001GXTopology(sampleC001GX({ c001gxTongueStyle: 2 }));
    const points = (topology, id) => topology.pieces.find((piece) => piece.id === id).netPoints;

    expect(sampleC001GX({ c001gxTongueStyle: 1 }).elements).toHaveLength(96);
    expect(sampleC001GX({ c001gxTongueStyle: 2 }).elements).toHaveLength(100);
    expect(points(style1, "M6")).not.toEqual(points(style2, "M6"));
    expect(points(style1, "S6")).not.toEqual(points(style2, "S6"));
    for (const topology of [style1, style2]) {
      const tongueY = points(topology, "S6").map((point) => point[1]);
      expect(Math.max(...tongueY) - Math.min(...tongueY)).toBeLessThan(25);
    }
    expect(style1.pieces.every((piece) => piece.netPoints.length >= 4)).toBe(true);
    expect(style2.pieces.every((piece) => piece.netPoints.length >= 4)).toBe(true);
  });

  it("emits both official half-caliper caps for every shared score", () => {
    const expected = {
      M0: 4,
      M1: 4,
      M3: 3,
      M5: 4,
      S1T: 1,
      S3T: 1,
      S5: 1,
      M6: 3,
      S6: 2,
      S0: 1,
      S1B: 1,
      S3B: 1,
      S5B: 1,
      S5T: 2,
      S5TT: 1,
    };
    for (const style of [1, 2]) {
      const topology = createC001GXTopology(sampleC001GX({ c001gxTongueStyle: style }));
      expect(Object.fromEntries(topology.pieces.map((piece) => [
        piece.id,
        piece.foldLinesToDraw.length,
      ]))).toEqual(expected);
      expect(topology.pieces.reduce((sum, piece) => sum + piece.foldLinesToDraw.length, 0)).toBe(30);
    }
  });

  it("derives finite dynamic contours from each generated size", () => {
    const small = createC001GXTopology(sampleC001GX({ length: 180, width: 120, depth: 80, caliper: 0.4 }));
    const large = createC001GXTopology(sampleC001GX({ length: 440, width: 400, depth: 330, caliper: 0.8 }));
    for (const topology of [small, large]) {
      expect(topology.pieces.every((piece) => piece.netPoints
        .flat()
        .every(Number.isFinite))).toBe(true);
    }
    expect(large.bounds.maxX - large.bounds.minX).toBeGreaterThan(small.bounds.maxX - small.bounds.minX);
    expect(large.bounds.maxY - large.bounds.minY).toBeGreaterThan(small.bounds.maxY - small.bounds.minY);
  });

  it("rejects non-C001GX and incomplete source geometry", () => {
    expect(() => createC001GXTopology({ meta: { boxId: "K016A" }, elements: [] })).toThrow(/C001GX/);
    expect(() => createC001GXTopology({
      meta: { boxId: "C001GX" },
      parameters: { c001gxTongueStyle: 2 },
      elements: [],
    })).toThrow(/不完整/);
  });
});
