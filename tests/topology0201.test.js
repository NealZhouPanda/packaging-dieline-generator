import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { generate0201 } from "../src/generators-legacy.js";
import { create0201Topology } from "../src/topology0201.js";
import {
  arcPointsForCanvas,
  artworkCanvasSizeFor,
  canvasTransformFor,
  OFFICIAL_ARTWORK_FALLBACK_SIZE,
  OFFICIAL_ARTWORK_MAX_SIZE,
} from "../src/texture-editor.js";
import {
  foldedBodyCorners,
  officialPhaseAngle,
  officialPlaneSpec,
  centeredSurfacePoint,
  foldSegmentsForPiece,
  mapFlapNetPoint,
  OFFICIAL_CAL_TEXTURE_BANDS,
  OFFICIAL_VIEWER_DEFAULTS,
  officialCutEdgeUvs,
} from "../src/three-preview.js";

describe("0201 texture and 3D topology", () => {
  it("reuses the generated body panel coordinates", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    expect(topology.faces).toHaveLength(6);
    expect(topology.body.length).toBe(350);
    expect(topology.body.width).toBe(190);
    expect(topology.body.height).toBe(220);
    expect(topology.body.foldLines.map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }))).toEqual([
      { x1: -190, y1: 0, x2: -190, y2: 220 },
      { x1: 0, y1: 0, x2: 0, y2: 220 },
      { x1: 350, y1: 0, x2: 350, y2: 220 },
    ]);
    expect(topology.faces.map(({ id }) => id)).toEqual(["front", "right", "back", "left", "top", "bottom"]);
    expect(topology.pieces.map(({ id }) => id)).toEqual([
      "front",
      "right",
      "back",
      "left",
      "glue-flap",
      "top-front",
      "top-right",
      "top-back",
      "top-left",
      "bottom-front",
      "bottom-right",
      "bottom-back",
      "bottom-left",
    ]);
    const glueFlap = topology.pieces.find(({ id }) => id === "glue-flap");
    expect(glueFlap).toMatchObject({ panelIndex: 0, exposedEdges: [0, 1, 2] });
    expect(glueFlap.netPoints).toHaveLength(4);
    expect(glueFlap.netPoints[0]).toEqual([topology.body.x1, topology.body.y1]);
    expect(glueFlap.netPoints.at(-1)).toEqual([topology.body.x1, topology.body.y2]);
    expect(glueFlap.netPoints[1][0]).toBeLessThan(topology.body.x1);
    expect(glueFlap.netPoints[2][0]).toBeLessThan(topology.body.x1);
    expect(glueFlap.netPoints[1][1]).toBeGreaterThan(topology.body.y1);
    expect(glueFlap.netPoints[2][1]).toBeLessThan(topology.body.y2);
    expect(topology.pieces.filter(({ kind }) => kind === "top").map(({ panelIndex }) => panelIndex)).toEqual([0, 1, 2, 3]);
    expect(topology.pieces.filter(({ kind }) => kind === "bottom").map(({ panelIndex }) => panelIndex)).toEqual([0, 1, 2, 3]);
    expect(topology.junctionArcs).toHaveLength(6);
    expect(topology.junctionArcs.every(({ arcs }) => arcs)).toBe(true);
    expect(topology.junctionArcs.map(({ side, x, arcs }) => [side, x, arcs.length])).toEqual([
      ["top", -190, 2],
      ["bottom", -190, 2],
      ["top", 0, 2],
      ["bottom", 0, 2],
      ["top", 350, 2],
      ["bottom", 350, 2],
    ]);
    expect(topology.foldLines.every(({ type }) => type === 1)).toBe(true);
    expect(topology.junctionArcs.every(({ arcs }) => arcs.every(([type]) => type === 1))).toBe(true);
    expect(topology.pieces.filter(({ kind }) => kind === "top").every(({ hingeY }) => hingeY === topology.body.y1)).toBe(true);
    expect(topology.pieces.filter(({ kind }) => kind === "bottom").every(({ hingeY }) => hingeY === topology.body.y2)).toBe(true);
    const topPieces = topology.pieces.filter(({ kind }) => kind === "top");
    const bottomPieces = topology.pieces.filter(({ kind }) => kind === "bottom");
    expect(topPieces.map(({ foldHingeY }) => foldHingeY)).toEqual([-5, 0, -5, 0]);
    expect(bottomPieces.map(({ foldHingeY }) => foldHingeY)).toEqual([225, 220, 225, 220]);
    expect(topPieces.some(({ foldHingeY, netRect }) => foldHingeY !== netRect.y2)).toBe(true);
    expect(bottomPieces.some(({ foldHingeY, netRect }) => foldHingeY !== netRect.y1)).toBe(true);
    const rightPanel = topology.pieces.find(({ id }) => id === "right").netRect;
    const topRight = topology.pieces.find(({ id }) => id === "top-right").netRect;
    expect(topRight.x1).toBeCloseTo(rightPanel.x1 + 2.5);
    expect(topRight.x2).toBeCloseTo(rightPanel.x2 - 2.5);
    expect(topRight.y2).toBeCloseTo(topology.body.y1 - 2.5);
    expect(topRight.y1).toBeLessThan(topRight.y2);
    expect(topology.pieces.find(({ id }) => id === "top-front").netRect).toMatchObject({
      x1: -537.5,
      x2: -192.5,
      y1: -100,
      y2: -5,
    });
    expect(topology.pieces.find(({ id }) => id === "bottom-back").netRect).toMatchObject({
      x1: 2.5,
      x2: 347.5,
      y1: 225,
      y2: 320,
    });
    const frontBody = topology.pieces.find(({ id }) => id === "front");
    const backBody = topology.pieces.find(({ id }) => id === "back");
    expect(frontBody.netPoints.length).toBeGreaterThan(4);
    expect(backBody.netPoints.length).toBeGreaterThan(4);
    expect(frontBody.netPoints[0]).toEqual([frontBody.netRect.x1, topology.body.y1]);
    expect(frontBody.netPoints).toContainEqual([
      frontBody.netRect.x1 + topology.caliper / 2,
      topology.body.y1 - topology.caliper,
    ]);
    expect(frontBody.netPoints).toContainEqual([
      frontBody.netRect.x2 - topology.caliper / 2,
      topology.body.y2 + topology.caliper,
    ]);
    expect(frontBody.sideNetPoints.at(-1)).toEqual(frontBody.sideNetPoints[0]);
    expect(frontBody.foldLinesToDraw).toEqual([
      { type: 1, x1: frontBody.netRect.x1, y1: 0, x2: frontBody.netRect.x1, y2: 220 },
      { type: 1, x1: frontBody.netRect.x2, y1: 0, x2: frontBody.netRect.x2, y2: 220 },
      { type: 1, x1: frontBody.netRect.x1 + 2.5, y1: -5, x2: frontBody.netRect.x2 - 2.5, y2: -5 },
      { type: 1, x1: frontBody.netRect.x1 + 2.5, y1: 225, x2: frontBody.netRect.x2 - 2.5, y2: 225 },
    ]);
    expect(topology.pieces.find(({ id }) => id === "right").exposedEdges).toEqual([]);
    expect(topology.pieces.find(({ id }) => id === "left").exposedEdges).toEqual([1]);
    const topFrontPiece = topology.pieces.find(({ id }) => id === "top-front");
    const bottomFrontPiece = topology.pieces.find(({ id }) => id === "bottom-front");
    // Official M2/M6 major flaps are rectangles. Their rounded slot halves
    // belong to M0/M5, so the flap must not duplicate those arcs.
    expect(topFrontPiece.netPoints).toEqual([
      [-537.5, -100],
      [-192.5, -100],
      [-192.5, -5],
      [-537.5, -5],
    ]);
    expect(bottomFrontPiece.netPoints).toEqual([
      [-537.5, 225],
      [-192.5, 225],
      [-192.5, 320],
      [-537.5, 320],
    ]);
    expect(topFrontPiece.exposedEdges).toEqual([0, 1, 3]);
    expect(bottomFrontPiece.exposedEdges).toEqual([1, 2, 3]);
    expect(topFrontPiece.exposedEdges).toEqual(topFrontPiece.sideExposedEdges);
    expect(bottomFrontPiece.exposedEdges).toEqual(bottomFrontPiece.sideExposedEdges);
    expect(topFrontPiece.sideNetPoints).toHaveLength(5);
    expect(bottomFrontPiece.sideNetPoints).toHaveLength(5);
    expect(topFrontPiece.sideNetPoints.at(-1)).toEqual(topFrontPiece.sideNetPoints[0]);
    expect(bottomFrontPiece.sideNetPoints.at(-1)).toEqual(bottomFrontPiece.sideNetPoints[0]);
    expect(topFrontPiece.sideNetPoints[0]).toEqual(topFrontPiece.netPoints[0]);
    expect(bottomFrontPiece.sideNetPoints[0]).toEqual(bottomFrontPiece.netPoints[0]);

    for (const id of ["top-right", "top-left"]) {
      const piece = topology.pieces.find((candidate) => candidate.id === id);
      const panel = topology.pieces.find((candidate) => candidate.panelIndex === piece.panelIndex && candidate.kind === "body");
      expect(piece.netPoints[0]).toEqual([panel.netRect.x1, topology.body.y1]);
      expect(piece.netPoints.at(-1)).toEqual([panel.netRect.x2, topology.body.y1]);
      expect(piece.netPoints[1][0]).toBeGreaterThan(panel.netRect.x1);
      expect(piece.netPoints.at(-2)[0]).toBeLessThan(panel.netRect.x2);
    }
    for (const id of ["bottom-right", "bottom-left"]) {
      const piece = topology.pieces.find((candidate) => candidate.id === id);
      const panel = topology.pieces.find((candidate) => candidate.panelIndex === piece.panelIndex && candidate.kind === "body");
      expect(piece.netPoints[0]).toEqual([panel.netRect.x1, topology.body.y2]);
      expect(piece.netPoints.at(-1)).toEqual([panel.netRect.x2, topology.body.y2]);
      expect(piece.netPoints[1][0]).toBeGreaterThan(panel.netRect.x1);
      expect(piece.netPoints.at(-2)[0]).toBeLessThan(panel.netRect.x2);
    }
  });

  it("rejects a non-0201 geometry", () => {
    expect(() => create0201Topology({ meta: { boxId: "0421" }, elements: [] })).toThrow(/0201/);
  });

  it("unwraps arcs in the same direction as the SVG renderer", () => {
    const points = arcPointsForCanvas([1, 0, 0, 0, 10, 270, 0]);
    expect(points[0][0]).toBeCloseTo(10);
    expect(points[0][1]).toBeCloseTo(0);
    expect(points.at(-1)[0]).toBeCloseTo(0);
    expect(points.at(-1)[1]).toBeCloseTo(10);
    expect(points.length).toBeLessThan(20);
  });

  it("uses the same padded net transform for the canvas and 3D UVs", () => {
    const transform = canvasTransformFor(
      { minX: -50, minY: -20, maxX: 150, maxY: 80 },
      400,
      300,
    );
    expect(transform.point(-50, -20)).toEqual([36, 68]);
    expect(transform.point(150, 80)).toEqual([364, 232]);
  });

  it("uses the official 3D cut-edge texture atlas bands", () => {
    expect(OFFICIAL_CAL_TEXTURE_BANDS).toEqual({
      wa3: { start: 0, end: 52 },
      wa5: { start: 52, end: 140 },
      wa7: { start: 140, end: 272 },
      feng: { start: 272, end: 344 },
    });
  });

  it("uses the official camera and effective light defaults", () => {
    expect(OFFICIAL_VIEWER_DEFAULTS).toEqual({
      cameraFov: 45,
      cameraNear: 0.5,
      cameraFar: 20000,
      cameraZ: 670,
      modelPitch: 30,
      modelYaw: 30,
      directionalLight: 0.8,
      hemisphereLight: 0.7,
    });
  });

  it("uses the official artwork canvas scale and cut-edge grain coordinates", () => {
    expect(OFFICIAL_ARTWORK_MAX_SIZE).toBe(4096);
    expect(OFFICIAL_ARTWORK_FALLBACK_SIZE).toBe(2290);
    expect(artworkCanvasSizeFor(
      { minX: -870, minY: -205, maxX: 837, maxY: 525 },
      OFFICIAL_ARTWORK_MAX_SIZE,
    )).toEqual({ width: 4096, height: 1751 });
    expect(officialCutEdgeUvs([0, 0], [100, 0], 5)).toEqual([
      [0, 0],
      [6, 0],
      [6, 1],
      [0, 1],
    ]);
    expect(officialCutEdgeUvs([0, 0], [0, 100], 5)).toEqual([
      [0, 0],
      [0, 0],
      [0, 1],
      [0, 1],
    ]);
    expect(officialCutEdgeUvs([0, 0], [0, 100], 5, 1)).toEqual([
      [0, 0],
      [6, 0],
      [6, 1],
      [0, 1],
    ]);
  });

  it("folds each body panel from the previous dieline crease", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    const panels = topology.pieces.filter(({ kind }) => kind === "body").map(({ netRect }) => netRect);
    const folded = foldedBodyCorners(panels, topology.body);

    expect(folded.frames).toHaveLength(4);
    for (let index = 0; index < folded.frames.length - 1; index += 1) {
      const frame = folded.frames[index];
      const next = folded.frames[index + 1];
      const edge = frame.origin.clone().add(frame.horizontal.clone().multiplyScalar(frame.width));
      expect(edge.distanceTo(next.origin)).toBeLessThan(1e-8);
    }
    expect(folded.front[0][2]).toBeCloseTo(0);
    // for3d.min.js negates source Y before deriving a vertical FoldLine axis;
    // the second body panel therefore turns toward +Z at 100%.
    expect(folded.back[0][2]).toBeCloseTo(190);
    expect(folded.frames[1].horizontal.x).toBeCloseTo(0);
    expect(folded.frames[1].horizontal.z).toBeCloseTo(1);
    expect(folded.front[0][1]).toBeCloseTo(0);
    expect(folded.front[2][1]).toBeCloseTo(220);

    const flat = foldedBodyCorners(panels, topology.body, 0);
    const halfway = foldedBodyCorners(panels, topology.body, 0.5);
    expect(flat.frames.every(({ horizontal }) => horizontal.distanceTo(folded.frames[0].horizontal) < 1e-8)).toBe(true);
    expect(halfway.frames[1].horizontal.angleTo(flat.frames[1].horizontal)).toBeCloseTo(Math.PI / 4);
    expect(halfway.frames[1].horizontal.angleTo(folded.frames[1].horizontal)).toBeCloseTo(Math.PI / 4);
    expect(flat.frames[3].origin.x).toBeCloseTo(panels[3].x1 - flat.netCenterX);
    expect(flat.frames[3].origin.z).toBeCloseTo(0);
  });

  it("keeps each flap on its own source FoldLine while the slider reaches 100%", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    const panels = topology.pieces.filter(({ kind }) => kind === "body").map(({ netRect }) => netRect);
    const flat = foldedBodyCorners(panels, topology.body, 0);
    const folded = foldedBodyCorners(panels, topology.body, 1);
    const flapPieces = topology.pieces.filter(({ kind }) => kind === "top" || kind === "bottom");
    expect(flapPieces.map(({ foldHingeY }) => foldHingeY)).toEqual([-5, 0, -5, 0, 225, 220, 225, 220]);

    for (const piece of flapPieces) {
      const x = piece.netRect.x1 + 17;
      const source = mapFlapNetPoint(piece, x, piece.foldHingeY, folded);
      const frame = folded.frames[piece.panelIndex];
      const parent = folded.panelRects[piece.panelIndex];
      const expected = frame.origin
        .clone()
        .add(frame.horizontal.clone().multiplyScalar(x - parent.x1))
        .add(frame.vertical.clone().multiplyScalar(topology.body.y2 - piece.foldHingeY));
      expect(source.point.distanceTo(expected)).toBeLessThan(1e-8);

      const flatSource = mapFlapNetPoint(piece, x, piece.foldHingeY, flat);
      const flatFrame = flat.frames[piece.panelIndex];
      const flatExpected = flatFrame.origin
        .clone()
        .add(flatFrame.horizontal.clone().multiplyScalar(x - parent.x1))
        .add(flatFrame.vertical.clone().multiplyScalar(topology.body.y2 - piece.foldHingeY));
      expect(flatSource.point.distanceTo(flatExpected)).toBeLessThan(1e-8);
    }
  });

  it("keeps paper thickness centered on every folded flap hinge", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    const panels = topology.pieces.filter(({ kind }) => kind === "body").map(({ netRect }) => netRect);
    const folded = foldedBodyCorners(panels, topology.body, 1);

    for (const piece of topology.pieces.filter(({ kind }) => kind === "top" || kind === "bottom")) {
      const center = mapFlapNetPoint(piece, piece.netRect.x1 + 17, piece.foldHingeY, folded);
      const front = centeredSurfacePoint(center.point, center.normal, 5, 1);
      const back = centeredSurfacePoint(center.point, center.normal, 5, -1);
      const midpoint = front.clone().add(back).multiplyScalar(0.5);

      expect(midpoint.distanceTo(center.point)).toBeLessThan(1e-8);
      expect(front.distanceTo(back)).toBeCloseTo(5);
    }
  });

  it("folds every closure flap toward its owning panel interior", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    const panels = topology.pieces.filter(({ kind }) => kind === "body").map(({ netRect }) => netRect);
    const folded = foldedBodyCorners(panels, topology.body, 1);

    for (const piece of topology.pieces.filter(({ kind }) => kind === "top" || kind === "bottom")) {
      const x = (piece.netRect.x1 + piece.netRect.x2) / 2;
      const outerY = piece.kind === "top" ? piece.netRect.y1 : piece.netRect.y2;
      const hinge = mapFlapNetPoint(piece, x, piece.foldHingeY, folded).point;
      const outer = mapFlapNetPoint(piece, x, outerY, folded).point;
      const frame = folded.frames[piece.panelIndex];
      const expectedInward = frame.horizontal.clone().cross(frame.vertical).normalize();

      expect(outer.clone().sub(hinge).normalize().distanceTo(expectedInward)).toBeLessThan(1e-8);
    }
  });

  it("draws every real body boundary score on the owning face", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    const panels = topology.pieces.filter(({ kind }) => kind === "body").map(({ netRect }) => netRect);
    const folded = foldedBodyCorners(panels, topology.body, 1);
    const bodyPieces = topology.pieces.filter(({ kind }) => kind === "body");
    const scoreCounts = bodyPieces.map((piece) => foldSegmentsForPiece(piece, topology, folded).length);

    // Each panel owns the scores at its actual top/bottom boundary. The
    // outer panels use the generated -5/225 mm clearance levels while the
    // side panels use 0/220 mm, matching the official source net.
    expect(scoreCounts).toEqual([4, 4, 4, 3]);
  });

  it("uses the official nested-plane pivots and local axes", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    const piece = (id) => topology.pieces.find((candidate) => candidate.id === id);

    const front = officialPlaneSpec(piece("front"), topology);
    const right = officialPlaneSpec(piece("right"), topology);
    const back = officialPlaneSpec(piece("back"), topology);
    const left = officialPlaneSpec(piece("left"), topology);
    const topFront = officialPlaneSpec(piece("top-front"), topology);
    const topRight = officialPlaneSpec(piece("top-right"), topology);
    const bottomFront = officialPlaneSpec(piece("bottom-front"), topology);
    const glueFlap = officialPlaneSpec(piece("glue-flap"), topology);

    expect(back).toMatchObject({ parentId: null, foldOrigin: null });
    expect(right.parentId).toBe("back");
    expect(right.foldOrigin.x).toBeCloseTo(0);
    expect(right.foldOrigin.y).toBeCloseTo(0);
    expect(right.foldOrigin.z).toBeCloseTo(0);
    expect(right.axis.x).toBeCloseTo(0);
    expect(right.axis.y).toBeCloseTo(-1);
    expect(right.axis.z).toBeCloseTo(0);
    expect(right.angle).toBeCloseTo(Math.PI / 2);
    expect(front.parentId).toBe("right");
    expect(front.foldOrigin.x).toBeCloseTo(-190);
    expect(front.axis.y).toBeCloseTo(-1);
    expect(left.parentId).toBe("back");
    expect(left.foldOrigin.x).toBeCloseTo(350);
    expect(left.foldOrigin.y).toBeCloseTo(-220);
    expect(left.axis.y).toBeCloseTo(1);
    expect(topFront.parentId).toBe("front");
    expect(topFront.foldOrigin.x).toBeCloseTo(-192.5);
    expect(topFront.foldOrigin.y).toBeCloseTo(5);
    expect(topFront.foldOrigin.z).toBeCloseTo(0);
    expect(topFront.axis.x).toBeCloseTo(-1);
    expect(topFront.axis.y).toBeCloseTo(0);
    expect(topFront.axis.z).toBeCloseTo(0);
    expect(topFront.angle).toBeCloseTo(Math.PI / 2);
    expect(topRight.parentId).toBe("right");
    expect(topRight.foldOrigin.x).toBeCloseTo(0);
    expect(topRight.foldOrigin.y).toBeCloseTo(0);
    expect(topRight.foldOrigin.z).toBeCloseTo(0);
    expect(topRight.axis.x).toBeCloseTo(-1);
    expect(bottomFront.angle).toBeCloseTo(Math.PI / 2);
    expect(glueFlap.parentId).toBe("front");
    expect(glueFlap.axis.x).toBeCloseTo(0);
    expect(glueFlap.axis.y).toBeCloseTo(-1);
    expect(glueFlap.axis.z).toBeCloseTo(0);
    expect(glueFlap.angle).toBeCloseTo(THREE.MathUtils.degToRad(91));
  });

  it("matches the official seven-stage 0201 fold schedule", () => {
    const geometry = generate0201({
      boxType: "0201",
      length: 350,
      width: 190,
      depth: 230,
      caliper: 5,
      paperType: "corrugated",
    });
    const topology = create0201Topology(geometry);
    const piece = (id) => topology.pieces.find((candidate) => candidate.id === id);
    const front = officialPlaneSpec(piece("front"), topology);
    const left = officialPlaneSpec(piece("left"), topology);
    const topFront = officialPlaneSpec(piece("top-front"), topology);
    const bottomFront = officialPlaneSpec(piece("bottom-front"), topology);
    const topRight = officialPlaneSpec(piece("top-right"), topology);
    const glueFlap = officialPlaneSpec(piece("glue-flap"), topology);

    expect(front.phaseAngles).toEqual([0, 90]);
    expect(left.phaseAngles).toEqual([0, 45, 90]);
    expect(topFront.phaseAngles).toEqual([0, 0, 0, 0, 0, -30, 90]);
    expect(bottomFront.phaseAngles).toEqual([0, 0, 0, -30, 90]);
    expect(topRight.phaseAngles).toEqual([0, 0, 0, 0, 0, 90]);
    expect(glueFlap.phaseAngles).toEqual([0, 91]);
    expect(officialPhaseAngle(front.phaseAngles, 0.5)).toBe(90);
    expect(officialPhaseAngle(topFront.phaseAngles, 0.5)).toBe(0);
    expect(officialPhaseAngle(bottomFront.phaseAngles, 0.5)).toBe(-30);
    expect(officialPhaseAngle(topFront.phaseAngles, 0.9)).toBeCloseTo(18);
    expect(officialPhaseAngle(glueFlap.phaseAngles, 0.2)).toBe(91);
  });
});
