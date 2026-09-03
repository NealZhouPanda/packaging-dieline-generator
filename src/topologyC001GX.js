import { pointBounds } from "./svg.js";

const EPSILON = 1e-4;
const ARC_STEP_DEGREES = 5.625;

function lineFrom(element, reverse = false) {
  if (element?.[0] !== 0) throw new RangeError("C001GX 拓扑索引与刀模线类型不匹配");
  const line = { type: 1, x1: element[2], y1: element[3], x2: element[4], y2: element[5] };
  return reverse
    ? { type: 1, x1: line.x2, y1: line.y2, x2: line.x1, y2: line.y1 }
    : line;
}

function axis(x1, y1, x2, y2) {
  return { type: 1, x1, y1, x2, y2 };
}

function sourceArcPoints(element) {
  if (element?.[0] !== 1) throw new RangeError("C001GX 拓扑索引与刀模圆弧类型不匹配");
  const [, , cx, cy, radius, start, end] = element;
  const sweep = ((end - start) % 360 + 360) % 360;
  const startAngle = (-end * Math.PI) / 180;
  const steps = Math.max(1, Math.ceil(sweep / ARC_STEP_DEGREES));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + (sweep * Math.PI * index) / (180 * steps);
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function sourceElementPoints(element) {
  if (element?.[0] === 0) return [[element[2], element[3]], [element[4], element[5]]];
  if (element?.[0] === 1) return sourceArcPoints(element);
  if (element?.[0] === 2) {
    const points = [];
    for (let index = 2; index + 1 < element.length; index += 2) {
      points.push([element[index], element[index + 1]]);
    }
    return points;
  }
  throw new RangeError("C001GX 拓扑包含不支持的刀模线类型");
}

function samePoint(left, right) {
  return Math.abs(left[0] - right[0]) < EPSILON && Math.abs(left[1] - right[1]) < EPSILON;
}

function appendPoint(points, point) {
  if (!points.length || !samePoint(points.at(-1), point)) points.push(point);
}

function appendConnected(points, element) {
  const segment = sourceElementPoints(element);
  if (!points.length) {
    for (const point of segment) appendPoint(points, point);
    return;
  }
  const last = points.at(-1);
  const startDistance = Math.hypot(last[0] - segment[0][0], last[1] - segment[0][1]);
  const endDistance = Math.hypot(last[0] - segment.at(-1)[0], last[1] - segment.at(-1)[1]);
  if (endDistance < startDistance) segment.reverse();
  for (const point of segment) appendPoint(points, point);
}

function connectedPolygon(start, elements) {
  const points = [[...start]];
  for (const element of elements) appendConnected(points, element);
  if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
  return points;
}

function pointOnLine([x, y], line) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return false;
  const cross = Math.abs((x - line.x1) * dy - (y - line.y1) * dx) / length;
  if (cross > EPSILON) return false;
  const dot = (x - line.x1) * dx + (y - line.y1) * dy;
  return dot >= -EPSILON && dot <= dx * dx + dy * dy + EPSILON;
}

function exposedEdges(points, foldLines) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return foldLines.some((line) => pointOnLine(point, line) && pointOnLine(next, line)) ? null : index;
  }).filter((index) => index !== null);
}

function cloneClosed(points) {
  return [...points.map((point) => [...point]), [...points[0]]];
}

function makePiece({
  id,
  label,
  points,
  parentId = null,
  sourceLine = null,
  phaseAngles = [0],
  foldLinesToDraw = [],
}, allFoldLines) {
  const edges = exposedEdges(points, allFoldLines);
  return {
    id,
    label,
    kind: "panel",
    netPoints: points,
    holeNetPoints: [],
    sideNetPoints: cloneClosed(points),
    exposedEdges: edges,
    sideExposedEdges: edges,
    foldLinesToDraw,
    foldRule: { parentId, sourceLine, phaseAngles },
  };
}

function styleIndexes(style) {
  if (style === 1) {
    return {
      M6: [46, 54, 52, 49, 51, 50, 53, 55, 48, 47, 3, 45],
      S6: [59, 60, 61, 62, 63, 55, 53, 56, 52, 54, 57, 58],
      bottomOffset: -4,
      lock: 90,
      expectedElements: 96,
    };
  }
  return {
    M6: [46, 56, 57, 54, 51, 53, 52, 55, 59, 58, 49, 48, 3, 45],
    S6: [63, 64, 65, 66, 67, 58, 59, 55, 60, 54, 57, 56, 61, 62],
    bottomOffset: 0,
    lock: 94,
    expectedElements: 100,
  };
}

/**
 * Build the official 15-plane C001GX hierarchy from the local indexed dieline.
 * Both official tuck-tongue variants keep the same plane graph and animation;
 * only the M6/S6 contour table and the following source indexes differ.
 */
export function createC001GXTopology(geometry) {
  if (geometry?.meta?.boxId !== "C001GX") {
    throw new RangeError("C001GX topology requires a C001GX geometry");
  }
  const e = geometry.elements;
  const style = Number(geometry.parameters?.c001gxTongueStyle) === 1 ? 1 : 2;
  const indexes = styleIndexes(style);
  if (!Array.isArray(e) || e.length < indexes.expectedElements) {
    throw new RangeError("C001GX 刀模数据不完整，无法建立 3D 拓扑");
  }

  const offset = indexes.bottomOffset;
  const at = (style2Index) => e[style2Index + offset];
  const caliper = Number(geometry.parameters?.caliper) || 0.5;
  const width = Number(geometry.parameters?.width) || 1;
  const bottomAngle = (height) => 90 + Math.atan(caliper / height) * 180 / Math.PI;

  const phases = {
    M1: [0, 90],
    M3: [0, 45, 90],
    M5: [0, 90],
    dust: [0, 0, 0, 0, 0, 0, 0, 90.1],
    S5: [0, 91],
    M6: [0, 0, 0, 0, 0, 0, 0, -30, 90],
    S6: [0, 0, 0, 0, 0, 0, 0, 90.1],
    S0: [0, 0, 0, 135, 135, 135, bottomAngle(width / 2)],
    sideBottom: [0, 0, 0, 0, 135, 135, bottomAngle(width * 0.3)],
    S5B: [0, 0, 0, 0, 0, 135, bottomAngle(width / 2)],
    S5T: [0, 0, 0, 0, 0, 0, 0, -45, -45, 0],
    S5TT: [0, 0, 0, 0, 0, 0, 0, 90.1],
  };

  const hinges = {
    M1: axis(e[0][2], 0, e[0][2], e[2][3] + caliper / 2),
    M3: axis(e[1][2], e[2][3] + caliper / 2, e[1][2], 0),
    M5: axis(e[8][2], e[0][3], e[8][2], e[2][3]),
    S1T: lineFrom(e[9], true),
    S3T: lineFrom(e[16], true),
    S5: lineFrom(e[23]),
    M6: lineFrom(e[3], true),
    S6: lineFrom(style === 1 ? e[52] : e[54], true),
    S0: lineFrom(e[2], true),
    S1B: lineFrom(e[10]),
    S3B: lineFrom(e[17]),
    S5B: lineFrom(e[29]),
    S5T: lineFrom(e[28], true),
    S5TT: lineFrom(e[indexes.lock], true),
  };

  const contours = {
    M0: connectedPolygon([e[3][2], e[3][3]], [e[3], e[5], e[1], e[7], e[2], e[6], e[0], e[4]]),
    M1: connectedPolygon([e[12][2], e[12][3]], [e[12], e[9], e[11], e[0], e[14], e[15], e[10], e[13], e[8]]),
    M3: connectedPolygon([e[1][2], e[1][3]], [e[18], e[16], e[19], e[20], e[17], e[22], e[21], e[1]]),
    M5: connectedPolygon([e[24][2], e[24][3]], [e[24], e[26], e[28], e[27], e[25], e[8], e[32], e[33], e[29], e[31], e[30], e[23]]),
    S1T: connectedPolygon([e[34][2], e[34][3]], [e[34], e[35], e[36], e[37], e[9]]),
    S3T: connectedPolygon([e[16][2], e[16][3]], [e[41], e[40], e[39], e[38], e[16]]),
    S5: connectedPolygon([e[42][2], e[42][3]], [e[42], e[23], e[43], e[44]]),
    M6: connectedPolygon([e[indexes.M6[0]][2], e[indexes.M6[0]][3]], indexes.M6.map((index) => e[index])),
    // S6 starts on a rounded corner. Arc records store centre/radius/angles,
    // not endpoint coordinates at [4]/[5]; treating those fields as x/y adds
    // a remote vertex (radius, 90°) and creates the tall spike seen folded.
    S6: connectedPolygon(sourceArcPoints(e[indexes.S6[0]])[0], indexes.S6.map((index) => e[index])),
    S0: connectedPolygon([at(68)[2], at(68)[3]], [at(68), at(69), at(70), at(71), at(72), at(73), at(74), at(75), at(76), e[2]]),
    S1B: connectedPolygon([e[10][2], e[10][3]], [e[10], at(81), at(80), at(79), at(78), at(77)]),
    S3B: connectedPolygon([e[17][2], e[17][3]], [e[17], at(82), at(83), at(84), at(85), at(86)]),
    S5B: connectedPolygon([e[29][2], e[29][3]], [e[29], at(90), at(91), at(92), at(93), at(89), at(88), at(87)]),
    S5T: connectedPolygon([e[indexes.lock][2], e[indexes.lock][3]], [e[indexes.lock], e[27], e[28], e[26]]),
    S5TT: connectedPolygon([e[indexes.lock + 1][4], e[indexes.lock + 1][5]], [e[indexes.lock + 1], e[indexes.lock + 2], e[indexes.lock + 5], e[indexes.lock + 4], e[indexes.lock + 3], e[indexes.lock]]),
  };

  const folds = {
    M0: [e[0], e[1], e[2], e[3]],
    M1: [e[0], e[8], e[9], e[10]],
    M3: [e[1], e[16], e[17]],
    M5: [e[8], e[23], e[28], e[29]],
    S1T: [e[9]],
    S3T: [e[16]],
    S5: [e[23]],
    M6: [e[3], style === 1 ? e[52] : e[54], style === 1 ? e[53] : e[55]],
    S6: [style === 1 ? e[52] : e[54], style === 1 ? e[53] : e[55]],
    S0: [e[2]],
    S1B: [e[10]],
    S3B: [e[17]],
    S5B: [e[29]],
    S5T: [e[28], e[indexes.lock]],
    S5TT: [e[indexes.lock]],
  };

  const allFoldLines = e
    .filter((element) => element[0] === 0 && element[1] === 1)
    .map((element) => lineFrom(element));
  const definitions = [
    ["M0", "正面", null, null, [0]],
    ["M1", "左侧面", "M0", hinges.M1, phases.M1],
    ["M3", "右侧面", "M0", hinges.M3, phases.M3],
    ["M5", "背面", "M1", hinges.M5, phases.M5],
    ["S1T", "左上防尘翼", "M1", hinges.S1T, phases.dust],
    ["S3T", "右上防尘翼", "M3", hinges.S3T, phases.dust],
    ["S5", "粘口", "M5", hinges.S5, phases.S5],
    ["M6", "翻盖", "M0", hinges.M6, phases.M6],
    ["S6", "插舌", "M6", hinges.S6, phases.S6],
    ["S0", "正面底锁", "M0", hinges.S0, phases.S0],
    ["S1B", "左底翼", "M1", hinges.S1B, phases.sideBottom],
    ["S3B", "右底翼", "M3", hinges.S3B, phases.sideBottom],
    ["S5B", "背面底锁", "M5", hinges.S5B, phases.S5B],
    ["S5T", "背面锁片", "M5", hinges.S5T, phases.S5T],
    ["S5TT", "圆头锁舌", "S5T", hinges.S5TT, phases.S5TT],
  ];
  const pieces = definitions.map(([id, label, parentId, sourceLine, phaseAngles]) => makePiece({
    id,
    label,
    points: contours[id],
    parentId,
    sourceLine,
    phaseAngles,
    foldLinesToDraw: folds[id].map((element) => lineFrom(element)),
  }, allFoldLines));

  return {
    boxId: "C001GX",
    officialBoxId: "C001GX",
    caliper,
    bounds: pointBounds(e),
    maxAngleSteps: 10,
    autoFitCamera: true,
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
