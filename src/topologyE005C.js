import { pointBounds } from "./svg.js";

const EPSILON = 1e-4;

// Official 0427 fold schedule from /ProOnline/GetBoxData (STY1=1).
// The local generator calls this same structure E005C.
const PHASES = Object.freeze({
  M1: Object.freeze([0, 0, 0, 0, 90]),
  M2: Object.freeze([0, 90]),
  M3: Object.freeze([0, 0, 0, 0, 90]),
  M4: Object.freeze([0, 90]),
  M5: Object.freeze([0, 0, 0, 0, 0, 90]),
  M6: Object.freeze([0, 0, -30, -30, -30, -30, -30, -30, 90]),
  M7: Object.freeze([0, 0, 0, 0, 0, 90]),
  M9: Object.freeze([0, 0, 0, 0, 0, 0, 90]),
  M11: Object.freeze([0, 0, 0, 0, 0, 0, 90]),
  S2: Object.freeze([0, 0, 0, 90]),
  S4: Object.freeze([0, 0, 90]),
  S6: Object.freeze([0, 0, 0, 0, 0, 0, 0, 90]),
  M8: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 0, 90]),
  S8: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 90]),
});

function lineFrom(element, reverse = false) {
  if (element?.[0] !== 0) throw new RangeError("0427/E005C 拓扑索引与刀模线类型不匹配");
  const line = { type: 1, x1: element[2], y1: element[3], x2: element[4], y2: element[5] };
  return reverse
    ? { type: 1, x1: line.x2, y1: line.y2, x2: line.x1, y2: line.y1 }
    : line;
}

function sourceArcPoints(element) {
  if (element?.[0] !== 1) throw new RangeError("0427/E005C 拓扑索引与刀模圆弧类型不匹配");
  const [, , cx, cy, radius, start, end] = element;
  const sweep = ((end - start) % 360 + 360) % 360;
  const startAngle = (-end * Math.PI) / 180;
  // The large rear locking wings are visually prominent. Sixteen samples per
  // quadrant match the official rounded contour without changing the dieline.
  const steps = Math.max(1, Math.ceil(sweep / 5.625));
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
 * Build the official 19-plane 0427 hierarchy from the local E005C dieline.
 * Both of the generator's shallow/deep variants keep the same indices through
 * M8; only the two rear locking-wing contours have variant-specific tails.
 */
export function createE005CTopology(geometry) {
  if (geometry?.meta?.boxId !== "E005C") {
    throw new RangeError("0427/E005C topology requires an E005C geometry");
  }
  const e = geometry.elements;
  if (!Array.isArray(e) || e.length < 108) {
    throw new RangeError("0427/E005C 刀模数据不完整，无法建立 3D 拓扑");
  }
  const isDeepVariant = e.length >= 110;

  const hinges = {
    M1: lineFrom(e[15]), M2: lineFrom(e[0], true), M3: lineFrom(e[20], true), M4: lineFrom(e[12]),
    M5: lineFrom(e[28]), M6: lineFrom(e[7], true), M7: lineFrom(e[32], true),
    M9: lineFrom(e[40]), M11: lineFrom(e[46], true),
    S2R: lineFrom(e[8]), S2L: lineFrom(e[9], true),
    S4L: lineFrom(e[33]), S4R: lineFrom(e[34], true),
    S6L: lineFrom(e[41], true), S6R: lineFrom(e[42]), M8: lineFrom(e[43], true),
    S8L: lineFrom(e[95]), S8R: lineFrom(e[96], true),
  };
  const allFoldLines = e
    .filter((element) => element[0] === 0 && element[1] === 1)
    .map((element) => lineFrom(element));

  const contours = {
    M0: polygon(
      (p) => appendLine(p, e[10]), (p) => appendLine(p, e[0]), (p) => appendLine(p, e[11], true),
      (p) => appendLine(p, e[20]), (p) => appendLine(p, e[22]), (p) => appendLine(p, e[23]),
      (p) => appendLine(p, e[24]), (p) => appendLine(p, e[21], true), (p) => appendLine(p, e[14]),
      (p) => appendLine(p, e[12], true), (p) => appendLine(p, e[13], true), (p) => appendLine(p, e[16]),
      (p) => appendLine(p, e[19], true), (p) => appendLine(p, e[18], true), (p) => appendLine(p, e[17], true),
      (p) => appendLine(p, e[15], true),
    ),
    M1: polygon(
      (p) => appendLine(p, e[26], true), (p) => appendLine(p, e[15]), (p) => appendLine(p, e[25]),
      (p) => appendLine(p, e[16], true), (p) => appendLine(p, e[27]), (p) => appendLine(p, e[28], true),
    ),
    M2: polygon(
      (p) => appendPoint(p, [e[0][2], e[0][3]]), (p) => appendArc(p, e[1], true),
      (p) => appendLine(p, e[9]), (p) => appendLine(p, e[3]), (p) => appendArc(p, e[5], true),
      (p) => appendLine(p, e[7]), (p) => appendArc(p, e[6], true), (p) => appendLine(p, e[4], true),
      (p) => appendLine(p, e[8], true), (p) => appendArc(p, e[2], true),
    ),
    M3: polygon((p) => appendLine(p, e[30]), (p) => appendLine(p, e[32]), (p) => appendLine(p, e[31], true)),
    M4: polygon(
      (p) => appendLine(p, e[12]), (p) => appendArc(p, e[36], true), (p) => appendLine(p, e[34]),
      (p) => appendLine(p, e[37], true), (p) => appendLine(p, e[33], true), (p) => appendArc(p, e[35], true),
    ),
    M5: polygon((p) => appendLine(p, e[38]), (p) => appendLine(p, e[40]), (p) => appendLine(p, e[39], true)),
    M6: polygon((p) => appendLine(p, e[41]), (p) => appendLine(p, e[43]), (p) => appendLine(p, e[42], true), (p) => appendLine(p, e[7], true)),
    M7: polygon((p) => appendLine(p, e[44]), (p) => appendLine(p, e[46]), (p) => appendLine(p, e[45], true)),
    M9: polygon(
      (p) => appendLine(p, e[47]), (p) => appendLine(p, e[49]), (p) => appendLine(p, e[51]),
      (p) => appendLine(p, e[52]), (p) => appendLine(p, e[53]), (p) => appendLine(p, e[50], true),
      (p) => appendLine(p, e[48], true),
    ),
    M11: polygon(
      (p) => appendLine(p, e[54]), (p) => appendLine(p, e[56]), (p) => appendLine(p, e[58]),
      (p) => appendLine(p, e[59]), (p) => appendLine(p, e[60]), (p) => appendLine(p, e[57], true),
      (p) => appendLine(p, e[55], true),
    ),
    S2R: polygon(
      (p) => appendLine(p, e[64], true), (p) => appendLine(p, e[63], true),
      (p) => appendLine(p, e[62], true), (p) => appendArc(p, e[61], true),
    ),
    S2L: polygon(
      (p) => appendPoint(p, [e[9][2], e[9][3]]), (p) => appendArc(p, e[65], true),
      (p) => appendLine(p, e[66]), (p) => appendLine(p, e[67]), (p) => appendLine(p, e[68]),
    ),
    S4L: polygon(
      (p) => appendArc(p, e[69]), (p) => appendLine(p, e[70]),
      (p) => appendLine(p, e[71]), (p) => appendLine(p, e[72]),
    ),
    S4R: polygon(
      (p) => appendPoint(p, [e[34][2], e[34][3]]), (p) => appendArc(p, e[73], true),
      (p) => appendLine(p, e[74]), (p) => appendLine(p, e[75]), (p) => appendLine(p, e[76]),
    ),
    S6L: polygon(
      (p) => appendArc(p, e[77], true), (p) => appendLine(p, e[79]), (p) => appendArc(p, e[81]),
      (p) => appendLine(p, e[83], true), (p) => appendArc(p, e[82]),
      (p) => appendLine(p, e[80], true), (p) => appendArc(p, e[78], true),
    ),
    S6R: polygon(
      (p) => appendArc(p, e[84]), (p) => appendLine(p, e[86]), (p) => appendArc(p, e[88], true),
      (p) => appendLine(p, e[90], true), (p) => appendArc(p, e[89], true),
      (p) => appendLine(p, e[87], true), (p) => appendArc(p, e[85]),
    ),
    M8: polygon(
      (p) => appendArc(p, e[91], true), (p) => appendLine(p, e[93], true), (p) => appendLine(p, e[95], true),
      (p) => appendLine(p, e[97]), (p) => appendLine(p, e[98]), (p) => appendArc(p, e[99], true),
      (p) => appendLine(p, e[100]), (p) => appendLine(p, e[101]), (p) => appendLine(p, e[96]),
      (p) => appendLine(p, e[94]), (p) => appendArc(p, e[92], true),
    ),
  };

  contours.S8L = isDeepVariant
    ? polygon(
      (p) => appendLine(p, e[105]), (p) => appendArc(p, e[104]),
      (p) => appendLine(p, e[103], true), (p) => appendArc(p, e[102]),
    )
    : polygon((p) => appendLine(p, e[104]), (p) => appendArc(p, e[103]), (p) => appendArc(p, e[102]));
  contours.S8R = isDeepVariant
    ? polygon(
      (p) => appendArc(p, e[106]), (p) => appendLine(p, e[107]), (p) => appendArc(p, e[108]),
      (p) => appendLine(p, e[109], true),
    )
    : polygon((p) => appendArc(p, e[105]), (p) => appendArc(p, e[106]), (p) => appendLine(p, e[107], true));

  const outgoing = {
    M0: [lineFrom(e[15]), lineFrom(e[0]), lineFrom(e[20]), lineFrom(e[12])],
    M1: [lineFrom(e[28])],
    M2: [lineFrom(e[7]), lineFrom(e[8]), lineFrom(e[9])],
    M3: [lineFrom(e[32])],
    M4: [lineFrom(e[33]), lineFrom(e[34])],
    M5: [lineFrom(e[40])],
    M6: [lineFrom(e[41]), lineFrom(e[42]), lineFrom(e[43])],
    M7: [lineFrom(e[46])],
    M8: [lineFrom(e[95]), lineFrom(e[96])],
  };
  const definitions = [
    ["M0", "主体面", null, null, [0]], ["M1", "左侧主体", "M0", hinges.M1, PHASES.M1],
    ["M2", "上内盖", "M0", hinges.M2, PHASES.M2], ["M3", "右侧主体", "M0", hinges.M3, PHASES.M3],
    ["M4", "下内盖", "M0", hinges.M4, PHASES.M4], ["M5", "左折边", "M1", hinges.M5, PHASES.M5],
    ["M6", "翻盖", "M2", hinges.M6, PHASES.M6], ["M7", "右折边", "M3", hinges.M7, PHASES.M7],
    ["M9", "左侧锁边", "M5", hinges.M9, PHASES.M9], ["M11", "右侧锁边", "M7", hinges.M11, PHASES.M11],
    ["S2R", "上盖右插翼", "M2", hinges.S2R, PHASES.S2], ["S2L", "上盖左插翼", "M2", hinges.S2L, PHASES.S2],
    ["S4L", "下盖左插翼", "M4", hinges.S4L, PHASES.S4], ["S4R", "下盖右插翼", "M4", hinges.S4R, PHASES.S4],
    ["S6L", "翻盖左插翼", "M6", hinges.S6L, PHASES.S6], ["S6R", "翻盖右插翼", "M6", hinges.S6R, PHASES.S6],
    ["M8", "后盖", "M6", hinges.M8, PHASES.M8], ["S8L", "后盖左锁翼", "M8", hinges.S8L, PHASES.S8],
    ["S8R", "后盖右锁翼", "M8", hinges.S8R, PHASES.S8],
  ];
  const pieces = definitions.map(([id, label, parentId, sourceLine, phaseAngles]) => makePiece({
    id, label, points: contours[id], parentId, sourceLine, phaseAngles, foldLinesToDraw: outgoing[id] || [],
  }, allFoldLines));

  return {
    boxId: "E005C",
    officialBoxId: "0427",
    caliper: Number(geometry.parameters?.caliper) || 0.5,
    bounds: pointBounds(e),
    maxAngleSteps: 10,
    autoFitCamera: true,
    foldLines: allFoldLines,
    faces: pieces.map(({ id, label, kind, netPoints }) => ({ id, label, kind, netPoints })),
    pieces,
  };
}
