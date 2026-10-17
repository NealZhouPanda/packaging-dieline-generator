import { pointBounds } from "./svg.js";

const PHASES = Object.freeze({
  M1: [0, 90], M2: [0, 0, 0, 0, 0, 0, -30, -30, 90],
  M3: [0, 45, 90], M4: [0, 0, 0, -30, -30, 90], M5: [0, 90],
  M6: [0, 0, 0, 0, 0, 0, -30, 90], M7: [0, 0, 0, -30, 90],
  topSide: [0, 0, 0, 0, 0, 0, 90.2], bottomSide: [0, 0, 0, 90.2], glue: [0, 90.5],
});

const axis = (x1, y1, x2, y2) => ({ type: 1, x1, y1, x2, y2 });
const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7;

function append(points, point) {
  if (!points.length || !near(points.at(-1), point)) points.push(point);
}

function arc(points, cx, cy, radius, from, to) {
  const count = Math.ceil(Math.abs(to - from) / 22.5);
  for (let i = 0; i <= count; i++) {
    const angle = (from + (to - from) * i / count) * Math.PI / 180;
    append(points, [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
}

function longWall(x1, x2, height, offset, radius) {
  const points = [];
  arc(points, x1, -radius, radius, 90, 0);
  append(points, [x1 + radius, -offset]);
  append(points, [x2 - radius, -offset]);
  arc(points, x2, -radius, radius, 180, 90);
  append(points, [x2, height]);
  arc(points, x2, height + radius, radius, -90, -180);
  append(points, [x2 - radius, height + offset]);
  append(points, [x1 + radius, height + offset]);
  arc(points, x1, height + radius, radius, 0, -90);
  return points;
}

function shortFlapContour(x1, x2, y, radius, span, bottom = false) {
  const points = [];
  arc(points, x1, -radius, radius, 90, 0);
  append(points, [x1 + radius, -span]);
  append(points, [x2 - radius, -span]);
  arc(points, x2, -radius, radius, 180, 90);
  return points.map(([x, py]) => [x, y + (bottom ? -py : py)]);
}

function pointOnLine([x, y], line) {
  const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy);
  if (length < 1e-7) return false;
  const t = ((x - line.x1) * dx + (y - line.y1) * dy) / (length * length);
  return t >= -1e-7 && t <= 1 + 1e-7 && Math.abs((x - line.x1) * dy - (y - line.y1) * dx) / length < 1e-7;
}

/** Official 0206 has 13 planes and nine folding phases. Both sides of every
 * shared score emit a paper-coloured thickness strip to seal folded seams.
 */
export function create0206Topology(geometry) {
  if (geometry?.meta?.boxId !== "0206") throw new RangeError("0206 topology requires 0206 geometry");
  const { length: l, width: w } = geometry.parameters;
  const { radius: r, bodyHeight: h, highLow: of, backHighLow: of6, correctedWidth: w1, glue, glueBevel, shortFlap, backFlap } = geometry.compensation;
  const back = -l - w, end = l + w1;
  const hinges = {
    M1: axis(0, 0, 0, h), M2: axis(l - r, -of, r, -of),
    M3: axis(l, h, l, 0), M4: axis(r, h + of, l - r, h + of),
    M5: axis(-w, 0, -w, h), M6: axis(-w - r, -of6, back + r, -of6),
    M7: axis(back + r, h + of6, -w - r, h + of6),
    S1T: axis(0, 0, -w, 0), S1B: axis(-w, h, 0, h),
    S3T: axis(end, 0, l, 0), S3B: axis(l, h, end, h), S5: axis(back, 0, back, h),
  };
  const contours = {
    M0: longWall(0, l, h, of, r), M1: rect(-w, 0, 0, h),
    M2: rect(r, -of - w, l - r, -of), M3: rect(l, 0, end, h),
    M4: rect(r, h + of, l - r, h + of + w), M5: longWall(back, -w, h, of6, r),
    M6: rect(back + r, -of6 - backFlap, -w - r, -of6),
    M7: rect(back + r, h + of6, -w - r, h + of6 + backFlap),
    S1T: shortFlapContour(-w, 0, 0, r, shortFlap), S1B: shortFlapContour(-w, 0, h, r, shortFlap, true),
    S3T: shortFlapContour(l, end, 0, r, shortFlap), S3B: shortFlapContour(l, end, h, r, shortFlap, true),
    S5: [[back - glue, glueBevel], [back, 0], [back, h], [back - glue, h - glueBevel]],
  };
  const specs = [
    ["M0", "正面", null, [0]], ["M1", "左侧面", "M0", PHASES.M1],
    ["M2", "正面上搭盖", "M0", PHASES.M2], ["M3", "右侧面", "M0", PHASES.M3],
    ["M4", "正面底搭盖", "M0", PHASES.M4], ["M5", "背面", "M1", PHASES.M5],
    ["M6", "背面上搭盖", "M5", PHASES.M6], ["M7", "背面底搭盖", "M5", PHASES.M7],
    ["S1T", "左上摇盖", "M1", PHASES.topSide], ["S1B", "左底摇盖", "M1", PHASES.bottomSide],
    ["S3T", "右上摇盖", "M3", PHASES.topSide], ["S3B", "右底摇盖", "M3", PHASES.bottomSide],
    ["S5", "粘口", "M5", PHASES.glue],
  ];
  const allFoldLines = Object.values(hinges);
  const pieces = specs.map(([id, label, parentId, phaseAngles]) => {
    const netPoints = contours[id];
    const exposedEdges = netPoints.map((point, index) => {
      const next = netPoints[(index + 1) % netPoints.length];
      return allFoldLines.some((line) => pointOnLine(point, line) && pointOnLine(next, line)) ? null : index;
    }).filter((index) => index !== null);
    const sourceLine = hinges[id] || null;
    const outgoing = specs.filter(([, , parent]) => parent === id).map(([child]) => hinges[child]);
    return {
      id, label, kind: "panel", netPoints, sideNetPoints: [...netPoints, [...netPoints[0]]],
      exposedEdges, sideExposedEdges: exposedEdges,
      foldLinesToDraw: [...(sourceLine ? [sourceLine] : []), ...outgoing],
      foldRule: { parentId, sourceLine, phaseAngles: [...phaseAngles] },
    };
  });
  return {
    boxId: "0206", officialBoxId: "0206", caliper: geometry.parameters.caliper,
    bounds: pointBounds(geometry.elements), maxAngleSteps: 9, autoFitCamera: true,
    cameraFitFraction: 0.82, foldLines: allFoldLines,
    faces: pieces.map(({ id, label, kind, netPoints }) => ({ id, label, kind, netPoints })), pieces,
  };
}
