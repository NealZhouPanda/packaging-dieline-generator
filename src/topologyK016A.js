import { pointBounds } from "./svg.js";
import { createTopologyHelpers } from "./topology/helpers.js";

const {
  axis,
  lineFrom,
  sourceArcPoints,
  connectedPolygon,
  makePiece,
  extractFoldLines,
} = createTopologyHelpers({ boxLabel: "K016A", epsilon: 1e-4, arcStepDegrees: 5.625, includeHoles: true });

/**
 * Build the official 15-plane K016A hierarchy from the local indexed dieline.
 * The plane graph, axes and phase arrays mirror /ProOnline/GetBoxData. Curves
 * and the four official cover contours are reconstructed from generated lines
 * so dimensions and caliper remain dynamic and the handle/lock holes stay real.
 */
export function createK016ATopology(geometry) {
  if (geometry?.meta?.boxId !== "K016A") {
    throw new RangeError("K016A topology requires a K016A geometry");
  }
  const e = geometry.elements;
  if (!Array.isArray(e) || e.length < 110) {
    throw new RangeError("K016A 刀模数据不完整，无法建立 3D 拓扑");
  }

  const topY = e[3][3];
  const handleRise = Math.abs(e[65][5] - e[65][3]);
  const handleRun = Math.abs(e[77][2] - e[0][2]);
  const handleAngle = Math.atan2(handleRun, handleRise) * 180 / Math.PI;

  const phases = {
    M1: [0, 90],
    M2: [0, 90],
    M3: [0, 45, 90],
    M9: [0, 0, 0, 0, 0, 0, -30, 90],
    M10: [0, 0, 0, 0, 0, 0, -30, 90],
    S2L: [0, 91],
    handle: [0, 0, 0, 0, 0, 0, -30, -30, handleAngle],
    lock: [0, 0, 0, 0, 0, 0, 0, 90],
    M4: [0, 0, 0, 135, 135, 135, 95],
    M5: [0, 0, 0, 0, 135, 135, 95],
    M6: [0, 0, 0, 0, 0, 135, 95],
    M7: [0, 0, 0, 0, 135, 135, 95],
  };

  const hinges = {
    M1: axis(e[0][2], e[0][3], e[0][2], topY),
    M2: axis(e[11][2], e[11][3], e[11][2], topY),
    M3: lineFrom(e[5], true),
    M9: lineFrom(e[13]),
    M10: lineFrom(e[0], true),
    S2L: lineFrom(e[17]),
    S1T: lineFrom(e[6]),
    S3T: lineFrom(e[19], true),
    S9T: lineFrom(e[26], true),
    S10T: lineFrom(e[37], true),
    M4: lineFrom(e[15], true),
    M5: lineFrom(e[10], true),
    M6: lineFrom(e[3]),
    M7: lineFrom(e[23]),
  };

  const contours = {
    M0: connectedPolygon([e[0][2], e[0][3]], [e[0], e[5], e[2], e[3], e[1], e[4]]),
    M1: connectedPolygon([e[7][4], e[7][5]], [e[7], e[8], e[6], e[4], e[9], e[10], e[12], e[11]]),
    M2: connectedPolygon([e[13][4], e[13][5]], [e[13], e[11], e[14], e[15], e[16], e[17]]),
    M3: connectedPolygon([e[5][2], e[5][3]], [e[18], e[20], e[19], e[22], e[23], e[21], e[5]]),
    // Arc elements store cx/cy at [2]/[3]. The official Plane contour starts
    // on the arc itself; using the centre as the first polygon vertex creates
    // a short triangular spur and pulls the folded seam away from its mate.
    M9: connectedPolygon(sourceArcPoints(e[28]).at(-1), [e[28], e[29], e[30], e[27], e[26], e[25], e[24]]),
    M10: connectedPolygon(sourceArcPoints(e[31]).at(-1), [e[31], e[32], e[33], e[34], e[37], e[36], e[35]]),
    S2L: [
      [e[38][4], e[38][5]],
      [e[38][2], e[38][3]],
      [e[38][8], e[38][9]],
      [e[38][6], e[38][7]],
    ],
    S1T: connectedPolygon(sourceArcPoints(e[42]).at(-1), [e[42], e[43], e[44], e[45], e[41], e[40], e[39], e[6], e[8], e[7]]),
    S3T: connectedPolygon(sourceArcPoints(e[50]).at(-1), [e[50], e[51], e[52], e[55], e[54], e[53], e[19], e[20], e[18]]),
    S9T: connectedPolygon(sourceArcPoints(e[69])[0], [e[69], e[67], e[66], e[65], e[26], e[27], e[30], e[68]]),
    S10T: connectedPolygon([e[75][4], e[75][5]], [e[76], e[77], e[79], e[78], e[37], e[34], e[33], e[75]]),
    M4: connectedPolygon([e[15][4], e[15][5]], [e[15], e[81], e[87], e[89], e[88], e[90], e[91], e[92], e[86], e[85], e[83], e[84], e[82], e[80]]),
    M5: connectedPolygon([e[10][4], e[10][5]], [e[10], e[93], e[94], e[96], e[95], e[97], e[98]]),
    M6: connectedPolygon([e[3][2], e[3][3]], [e[3], e[99], e[100], e[103], e[102], e[101]]),
    M7: connectedPolygon([e[23][2], e[23][3]], [e[23], e[109], e[108], e[106], e[107], e[105], e[104]]),
  };

  const holes = {
    S1T: [connectedPolygon(sourceArcPoints(e[47])[0], [e[47], e[48], e[8], e[49]])],
    S3T: [connectedPolygon(sourceArcPoints(e[57])[0], [e[57], e[59], e[20], e[58]])],
    S9T: [connectedPolygon(sourceArcPoints(e[61])[0], [e[61], e[62], e[60], e[64], e[63], e[27]])],
    S10T: [connectedPolygon(sourceArcPoints(e[73])[0], [e[73], e[74], e[70], e[72], e[71], e[34]])],
  };

  const allFoldLines = extractFoldLines(e);
  const outgoing = {
    // Official M0.d contains all four boundary scores. M6 was previously
    // omitted, leaving the long upper crease without either half-caliper cap.
    M0: [hinges.M1, hinges.M3, hinges.M10, hinges.M6],
    M1: [hinges.M2, hinges.S1T, hinges.M5],
    M2: [hinges.M9, hinges.S2L, hinges.M4],
    M3: [hinges.S3T, hinges.M7],
    M9: [hinges.S9T],
    M10: [hinges.S10T],
  };
  const definitions = [
    ["M0", "主体正面", null, null, [0]],
    ["M1", "左侧面", "M0", hinges.M1, phases.M1],
    ["M2", "背面", "M1", hinges.M2, phases.M2],
    ["M3", "右侧面", "M0", hinges.M3, phases.M3],
    ["M9", "背面底盖", "M2", hinges.M9, phases.M9],
    ["M10", "正面底盖", "M0", hinges.M10, phases.M10],
    ["S2L", "粘口", "M2", hinges.S2L, phases.S2L],
    ["S1T", "左提手盖", "M1", hinges.S1T, phases.handle],
    ["S3T", "右提手盖", "M3", hinges.S3T, phases.handle],
    ["S9T", "背面底锁", "M9", hinges.S9T, phases.lock],
    ["S10T", "正面底锁", "M10", hinges.S10T, phases.lock],
    ["M4", "背面上盖", "M2", hinges.M4, phases.M4],
    ["M5", "左上盖", "M1", hinges.M5, phases.M5],
    ["M6", "正面上盖", "M0", hinges.M6, phases.M6],
    ["M7", "右上盖", "M3", hinges.M7, phases.M7],
  ];
  const pieces = definitions.map(([id, label, parentId, sourceLine, phaseAngles]) => makePiece({
    id,
    label,
    points: contours[id],
    holes: holes[id] || [],
    parentId,
    sourceLine,
    phaseAngles,
    // drawOnePlane seals a shared score twice: the child Plane contributes
    // its own half-caliper strip and the parent contributes the matching
    // outgoing strip. Supplying only outgoing lines leaves the child half
    // open and exposes the scene background after folding.
    foldLinesToDraw: [
      ...(sourceLine ? [sourceLine] : []),
      ...(outgoing[id] || []),
    ],
  }, allFoldLines));

  return {
    boxId: "K016A",
    officialBoxId: "K016A",
    caliper: Number(geometry.parameters?.caliper) || 0.5,
    bounds: pointBounds(e),
    maxAngleSteps: 9,
    autoFitCamera: true,
    // The handle carton has much more depth variation than the other flat
    // nets. Extra projection margin matches the official viewer at 0% fold.
    cameraFitFraction: 0.72,
    foldLines: allFoldLines,
    faces: pieces.map(({ id, label, kind, netPoints, holeNetPoints }) => ({
      id,
      label,
      kind,
      netPoints,
      holeNetPoints,
    })),
    pieces,
  };
}
