import { pointBounds } from "./svg.js";

const EPSILON = 1e-4;

const PHASES = Object.freeze({
  M1: Object.freeze([0, 0, 0, 90]),
  M2: Object.freeze([0, 0, 90]),
  M3: Object.freeze([0, 0, 0, 90]),
  M4: Object.freeze([0, 0, 90]),
  M5: Object.freeze([0, 0, 0, 0, 90]),
  M6: Object.freeze([0, 0, -30, -30, -30, -30, -30, 90]),
  M7: Object.freeze([0, 0, 0, 0, 0, 90]),
  M9: Object.freeze([0, 0, 0, 0, 89.9]),
  M11: Object.freeze([0, 0, 0, 0, 0, 89.9]),
  side: Object.freeze([0, 90.1]),
  M8: Object.freeze([0, 0, 0, 0, 0, 0, 105, 105, 90.1]),
});

function lineFrom(element, reverse = false) {
  if (element?.[0] !== 0) throw new RangeError("0421 拓扑索引与刀模线类型不匹配");
  const line = { type: 1, x1: element[2], y1: element[3], x2: element[4], y2: element[5] };
  return reverse
    ? { type: 1, x1: line.x2, y1: line.y2, x2: line.x1, y2: line.y1 }
    : line;
}

function sourceArcPoints(element) {
  if (element?.[0] !== 1) throw new RangeError("0421 拓扑索引与刀模圆弧类型不匹配");
  const [, , cx, cy, radius, start, end] = element;
  const sweep = ((end - start) % 360 + 360) % 360;
  const startAngle = (-end * Math.PI) / 180;
  const steps = Math.max(1, Math.ceil(sweep / 22.5));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + (sweep * Math.PI * index) / (180 * steps);
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function samePoint(left, right) {
  return Math.abs(left[0] - right[0]) < EPSILON && Math.abs(left[1] - right[1]) < EPSILON;
}

function appendPoint(points, point) {
  if (!points.length || !samePoint(points.at(-1), point)) points.push(point);
}

function appendLine(points, element, reverse = false) {
  const line = lineFrom(element, reverse);
  appendPoint(points, [line.x1, line.y1]);
  appendPoint(points, [line.x2, line.y2]);
}

function appendArc(points, element, reverse = false) {
  const arc = sourceArcPoints(element);
  if (reverse) arc.reverse();
  for (const point of arc) appendPoint(points, point);
}

function polygon(...builders) {
  const points = [];
  for (const build of builders) build(points);
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

function makePiece({ id, label, points, parentId = null, sourceLine = null, phaseAngles = [0], foldLinesToDraw = [] }, allFoldLines) {
  const edges = exposedEdges(points, allFoldLines);
  return {
    id,
    label,
    kind: "panel",
    netPoints: points,
    sideNetPoints: cloneClosed(points),
    exposedEdges: edges,
    sideExposedEdges: edges,
    foldLinesToDraw,
    foldRule: { parentId, sourceLine, phaseAngles },
  };
}

/**
 * Build the 15 official 0421 Planes from the generator's indexed dieline.
 * generator0421 preserves the Packmage element order while interpolating the
 * requested dimensions, so each contour follows the generated coordinates
 * instead of re-deriving the carton from L/W/D.
 */
export function create0421Topology(geometry) {
  if (geometry?.meta?.boxId !== "0421") throw new RangeError("0421 topology requires a 0421 geometry");
  const e = geometry.elements;
  if (!Array.isArray(e) || e.length < 90) throw new RangeError("0421 刀模数据不完整，无法建立 3D 拓扑");

  const hinges = {
    M1: lineFrom(e[6]),
    M2: lineFrom(e[0], true),
    M3: lineFrom(e[11], true),
    M4: lineFrom(e[1]),
    M5: lineFrom(e[19]),
    M6: lineFrom(e[26], true),
    M7: lineFrom(e[30], true),
    M9: lineFrom(e[40]),
    M11: lineFrom(e[50], true),
    S2R: lineFrom(e[22]),
    S2L: lineFrom(e[23], true),
    S4L: lineFrom(e[31]),
    S4R: lineFrom(e[32], true),
    M8: lineFrom(e[45], true),
  };
  const allFoldLines = e
    .filter((element) => element[0] === 0 && element[1] === 1)
    .map((element) => lineFrom(element));

  const contours = {
    M0: polygon(
      (p) => appendLine(p, e[2]), (p) => appendLine(p, e[0]), (p) => appendLine(p, e[3], true),
      (p) => appendLine(p, e[11]), (p) => appendLine(p, e[13]), (p) => appendLine(p, e[14]),
      (p) => appendLine(p, e[15]), (p) => appendLine(p, e[12], true), (p) => appendLine(p, e[5]),
      (p) => appendLine(p, e[1], true), (p) => appendLine(p, e[4], true), (p) => appendLine(p, e[7]),
      (p) => appendLine(p, e[10], true), (p) => appendLine(p, e[9], true), (p) => appendLine(p, e[8], true),
      (p) => appendLine(p, e[6], true),
    ),
    M1: polygon((p) => appendLine(p, e[17], true), (p) => appendLine(p, e[16]), (p) => appendLine(p, e[18])),
    M2: polygon(
      (p) => appendPoint(p, [e[0][2], e[0][3]]), (p) => appendArc(p, e[20], true),
      (p) => appendLine(p, e[23]), (p) => appendLine(p, e[24]), (p) => appendLine(p, e[26]),
      (p) => appendLine(p, e[25], true), (p) => appendLine(p, e[22], true), (p) => appendArc(p, e[21], true),
    ),
    M3: polygon((p) => appendLine(p, e[28]), (p) => appendLine(p, e[30]), (p) => appendLine(p, e[29], true), (p) => appendLine(p, e[27], true)),
    M4: polygon(
      (p) => appendPoint(p, [e[1][2], e[1][3]]), (p) => appendArc(p, e[33]), (p) => appendLine(p, e[31]),
      (p) => appendLine(p, e[35]), (p) => appendLine(p, e[36]), (p) => appendLine(p, e[37]),
      (p) => appendLine(p, e[32], true), (p) => appendArc(p, e[34]),
    ),
    M5: polygon((p) => appendLine(p, e[38]), (p) => appendLine(p, e[40]), (p) => appendLine(p, e[39], true)),
    M6: polygon(
      (p) => appendLine(p, e[41]), (p) => appendLine(p, e[43]), (p) => appendLine(p, e[46]),
      (p) => appendLine(p, e[45]), (p) => appendLine(p, e[47], true), (p) => appendLine(p, e[44], true),
      (p) => appendLine(p, e[42], true), (p) => appendLine(p, e[26], true),
    ),
    M7: polygon((p) => appendLine(p, e[48]), (p) => appendLine(p, e[50]), (p) => appendLine(p, e[49], true)),
    M9: polygon(
      (p) => appendLine(p, e[51]), (p) => appendLine(p, e[53]), (p) => appendLine(p, e[55]),
      (p) => appendLine(p, e[56]), (p) => appendLine(p, e[57]), (p) => appendLine(p, e[54], true),
      (p) => appendLine(p, e[52], true), (p) => appendLine(p, e[40], true),
    ),
    M11: polygon(
      (p) => appendLine(p, e[58]), (p) => appendLine(p, e[60]), (p) => appendLine(p, e[62]),
      (p) => appendLine(p, e[63]), (p) => appendLine(p, e[64]), (p) => appendLine(p, e[61], true),
      (p) => appendLine(p, e[59], true), (p) => appendLine(p, e[50], true),
    ),
    S2R: polygon(
      (p) => appendPoint(p, [e[22][2], e[22][3]]), (p) => appendArc(p, e[65]), (p) => appendLine(p, e[66]),
      (p) => appendLine(p, e[67]), (p) => appendLine(p, e[68]), (p) => appendLine(p, e[69]),
    ),
    S2L: polygon(
      (p) => appendLine(p, e[74], true), (p) => appendLine(p, e[73], true), (p) => appendLine(p, e[72], true),
      (p) => appendLine(p, e[71], true), (p) => appendArc(p, e[70]), (p) => appendLine(p, e[23]),
    ),
    S4L: polygon(
      (p) => appendPoint(p, [e[31][2], e[31][3]]), (p) => appendArc(p, e[75]), (p) => appendLine(p, e[76]),
      (p) => appendLine(p, e[77]), (p) => appendLine(p, e[78]), (p) => appendLine(p, e[79]),
    ),
    S4R: polygon(
      (p) => appendLine(p, e[84], true), (p) => appendLine(p, e[83], true), (p) => appendLine(p, e[82], true),
      (p) => appendLine(p, e[81], true), (p) => appendArc(p, e[80]), (p) => appendLine(p, e[32]),
    ),
    M8: polygon(
      (p) => appendLine(p, e[85]), (p) => appendArc(p, e[87]), (p) => appendLine(p, e[89]),
      (p) => appendArc(p, e[88]), (p) => appendLine(p, e[86], true), (p) => appendLine(p, e[45], true),
    ),
  };

  const outgoing = {
    M0: [lineFrom(e[0]), lineFrom(e[1]), lineFrom(e[6]), lineFrom(e[7]), lineFrom(e[11]), lineFrom(e[12])],
    M1: [lineFrom(e[19])], M2: [lineFrom(e[22]), lineFrom(e[23]), lineFrom(e[26])],
    M3: [lineFrom(e[30])], M4: [lineFrom(e[31]), lineFrom(e[32])], M5: [lineFrom(e[40])],
    M6: [lineFrom(e[45])], M7: [lineFrom(e[50])],
  };
  const definitions = [
    ["M0", "主体面", null, null, [0]], ["M1", "左侧主体", "M0", hinges.M1, PHASES.M1],
    ["M2", "上内盖", "M0", hinges.M2, PHASES.M2], ["M3", "右侧主体", "M0", hinges.M3, PHASES.M3],
    ["M4", "下内盖", "M0", hinges.M4, PHASES.M4], ["M5", "左折边", "M1", hinges.M5, PHASES.M5],
    ["M6", "翻盖", "M2", hinges.M6, PHASES.M6], ["M7", "右折边", "M3", hinges.M7, PHASES.M7],
    ["M9", "左侧盖板", "M5", hinges.M9, PHASES.M9], ["M11", "右侧盖板", "M7", hinges.M11, PHASES.M11],
    ["S2R", "上盖右插翼", "M2", hinges.S2R, PHASES.side], ["S2L", "上盖左插翼", "M2", hinges.S2L, PHASES.side],
    ["S4L", "下盖左插翼", "M4", hinges.S4L, PHASES.side], ["S4R", "下盖右插翼", "M4", hinges.S4R, PHASES.side],
    ["M8", "翻盖锁舌", "M6", hinges.M8, PHASES.M8],
  ];
  const pieces = definitions.map(([id, label, parentId, sourceLine, phaseAngles]) => makePiece({
    id, label, points: contours[id], parentId, sourceLine, phaseAngles, foldLinesToDraw: outgoing[id] || [],
  }, allFoldLines));

  return {
    boxId: "0421",
    caliper: Number(geometry.parameters?.caliper) || 0.5,
    bounds: pointBounds(e),
    maxAngleSteps: 9,
    autoFitCamera: true,
    foldLines: allFoldLines,
    faces: pieces.map(({ id, label, kind, netPoints }) => ({ id, label, kind, netPoints })),
    pieces,
  };
}
