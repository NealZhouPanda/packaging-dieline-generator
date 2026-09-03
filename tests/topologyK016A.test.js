import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createBoxTopology, phaseAngleAt } from "../src/box-topology.js";
import { generateK016A } from "../src/generatorK016A.js";
import { createK016ATopology } from "../src/topologyK016A.js";

function sampleK016A(overrides = {}) {
  return generateK016A({
    length: 350,
    width: 190,
    depth: 230,
    caliper: 3,
    paperType: "corrugated",
    ...overrides,
  });
}

function foldedWorldPoints(topology) {
  const root = new THREE.Group();
  const groups = new Map();
  const specs = new Map();

  for (const piece of topology.pieces) {
    const line = piece.foldRule.sourceLine;
    const origin = line ? new THREE.Vector3(line.x1, -line.y1, 0) : null;
    const foldAxis = line
      ? new THREE.Vector3(line.x2 - line.x1, -(line.y2 - line.y1), 0).normalize()
      : null;
    groups.set(piece.id, new THREE.Group());
    specs.set(piece.id, {
      piece,
      parentId: piece.foldRule.parentId,
      origin,
      foldAxis,
    });
  }

  for (const [id, spec] of specs) {
    const group = groups.get(id);
    const parentSpec = spec.parentId ? specs.get(spec.parentId) : null;
    if (spec.origin) {
      group.position.copy(spec.origin);
      if (parentSpec?.origin) group.position.sub(parentSpec.origin);
      const angle = phaseAngleAt(
        spec.piece.foldRule.phaseAngles,
        1,
        topology.maxAngleSteps,
      );
      group.setRotationFromAxisAngle(spec.foldAxis, THREE.MathUtils.degToRad(angle));
    }
    (spec.parentId ? groups.get(spec.parentId) : root).add(group);
  }

  root.updateMatrixWorld(true);
  return new Map([...specs].map(([id, spec]) => [
    id,
    spec.piece.netPoints.map(([x, y]) => new THREE.Vector3(x, -y, 0)
      .sub(spec.origin || new THREE.Vector3())
      .applyMatrix4(groups.get(id).matrixWorld)),
  ]));
}

function nearestVertexDistance(left, right) {
  return left.reduce((minimum, point) => Math.min(
    minimum,
    ...right.map((candidate) => point.distanceTo(candidate)),
  ), Number.POSITIVE_INFINITY);
}

describe("K016A topology", () => {
  it("dispatches through the common topology protocol", () => {
    expect(createBoxTopology(sampleK016A()).boxId).toBe("K016A");
  });

  it("matches the official 15-plane parent hierarchy", () => {
    const topology = createK016ATopology(sampleK016A());
    expect(topology.maxAngleSteps).toBe(9);
    expect(topology.pieces.map(({ id }) => id)).toEqual([
      "M0", "M1", "M2", "M3", "M9", "M10", "S2L", "S1T", "S3T",
      "S9T", "S10T", "M4", "M5", "M6", "M7",
    ]);
    expect(Object.fromEntries(topology.pieces.map((piece) => [
      piece.id,
      piece.foldRule.parentId,
    ]))).toEqual({
      M0: null,
      M1: "M0",
      M2: "M1",
      M3: "M0",
      M9: "M2",
      M10: "M0",
      S2L: "M2",
      S1T: "M1",
      S3T: "M3",
      S9T: "M9",
      S10T: "M10",
      M4: "M2",
      M5: "M1",
      M6: "M0",
      M7: "M3",
    });
  });

  it("preserves the official staged angles and directed axes", () => {
    const topology = createK016ATopology(sampleK016A());
    const piece = (id) => topology.pieces.find((item) => item.id === id);
    expect(piece("M3").foldRule.phaseAngles).toEqual([0, 45, 90]);
    expect(piece("M9").foldRule.phaseAngles).toEqual([0, 0, 0, 0, 0, 0, -30, 90]);
    expect(piece("M4").foldRule.phaseAngles).toEqual([0, 0, 0, 135, 135, 135, 95]);
    expect(piece("S2L").foldRule.phaseAngles).toEqual([0, 91]);
    expect(phaseAngleAt(piece("S1T").foldRule.phaseAngles, 0.75, topology.maxAngleSteps)).toBe(-30);
    expect(piece("S1T").foldRule.phaseAngles.at(-1)).toBeCloseTo(28.27, 1);
    expect(piece("M3").foldRule.sourceLine.y1).toBeGreaterThan(piece("M3").foldRule.sourceLine.y2);
    expect(piece("M10").foldRule.sourceLine.x1).toBeGreaterThan(piece("M10").foldRule.sourceLine.x2);
  });

  it("keeps both handle holes and both bottom-lock holes as real cover contours", () => {
    const topology = createK016ATopology(sampleK016A());
    const holePieces = topology.pieces.filter((piece) => piece.holeNetPoints.length);
    expect(holePieces.map(({ id }) => id)).toEqual(["S1T", "S3T", "S9T", "S10T"]);
    expect(holePieces.every((piece) => piece.holeNetPoints[0].length >= 6)).toBe(true);
  });

  it("starts curved cover contours on the arc rather than at its centre", () => {
    const geometry = sampleK016A({ length: 200, width: 100, depth: 150, caliper: 2 });
    const topology = createK016ATopology(geometry);
    const piece = (id) => topology.pieces.find((item) => item.id === id);
    const arcCentre = (index) => geometry.elements[index].slice(2, 4);

    expect(piece("M9").netPoints[0]).not.toEqual(arcCentre(28));
    expect(piece("M10").netPoints[0]).not.toEqual(arcCentre(31));
    expect(piece("S1T").netPoints[0]).not.toEqual(arcCentre(42));
    expect(piece("S3T").netPoints[0]).not.toEqual(arcCentre(50));
    expect(piece("S9T").netPoints[0]).not.toEqual(arcCentre(69));
    expect(piece("S9T").netPoints[0][0]).toBeCloseTo(
      geometry.elements[69][2] - geometry.elements[69][4],
      6,
    );
  });

  it("keeps every folded bottom seam within one board thickness", () => {
    const geometry = sampleK016A({ length: 200, width: 100, depth: 150, caliper: 2 });
    const topology = createK016ATopology(geometry);
    const worldPoints = foldedWorldPoints(topology);
    const seamPairs = [
      ["M9", "M10"],
      ["M9", "S10T"],
      ["M10", "S9T"],
      ["S9T", "S10T"],
    ];

    for (const [left, right] of seamPairs) {
      expect(nearestVertexDistance(worldPoints.get(left), worldPoints.get(right)))
        .toBeLessThanOrEqual(geometry.parameters.caliper + 1e-6);
    }
  });

  it("emits both official half-caliper caps for every shared score", () => {
    const topology = createK016ATopology(
      sampleK016A({ length: 200, width: 100, depth: 150, caliper: 2 }),
    );
    const piece = (id) => topology.pieces.find((item) => item.id === id);

    expect(Object.fromEntries(topology.pieces.map((item) => [
      item.id,
      item.foldLinesToDraw.length,
    ]))).toEqual({
      M0: 4,
      M1: 4,
      M2: 4,
      M3: 3,
      M9: 2,
      M10: 2,
      S2L: 1,
      S1T: 1,
      S3T: 1,
      S9T: 1,
      S10T: 1,
      M4: 1,
      M5: 1,
      M6: 1,
      M7: 1,
    });
    for (const item of topology.pieces.filter((candidate) => candidate.foldRule.sourceLine)) {
      expect(item.foldLinesToDraw).toContain(item.foldRule.sourceLine);
    }
    expect(piece("M0").foldLinesToDraw).toContain(piece("M6").foldRule.sourceLine);
  });

  it("derives dynamic contours from each generated size", () => {
    const small = createK016ATopology(sampleK016A({ length: 200, width: 120, depth: 80, caliper: 1 }));
    const large = createK016ATopology(sampleK016A({ length: 440, width: 400, depth: 230, caliper: 5 }));
    expect(small.pieces.every((piece) => piece.netPoints.length >= 4)).toBe(true);
    expect(large.pieces.every((piece) => piece.netPoints.length >= 4)).toBe(true);
    expect(large.bounds.maxX - large.bounds.minX).toBeGreaterThan(small.bounds.maxX - small.bounds.minX);
    expect(large.bounds.maxY - large.bounds.minY).toBeGreaterThan(small.bounds.maxY - small.bounds.minY);
  });

  it("rejects non-K016A and incomplete source geometry", () => {
    expect(() => createK016ATopology({ meta: { boxId: "0421" }, elements: [] })).toThrow(/K016A/);
    expect(() => createK016ATopology({ meta: { boxId: "K016A" }, elements: [] })).toThrow(/不完整/);
  });
});
