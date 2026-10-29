import { pointBounds } from "./svg.js";

const EPS = 1e-5;
function pointsOf(e) {
  if (e[0] === 0) return [[e[2], e[3]], [e[4], e[5]]];
  if (e[0] === 2) return Array.from({ length: (e.length - 2) / 2 }, (_, i) => e.slice(i * 2 + 2, i * 2 + 4));
  const [, , cx, cy, r, from, to] = e;
  const span = ((to - from) % 360 + 360) % 360, steps = Math.max(1, Math.ceil(span / 5.625));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = (-to + span * i / steps) * Math.PI / 180;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function polygon(start, elements) {
  const result = [[...start]];
  for (const e of elements) {
    const points = pointsOf(e);
    if (distance(result.at(-1), points.at(-1)) < distance(result.at(-1), points[0])) points.reverse();
    for (const p of points) if (distance(result.at(-1), p) > EPS) result.push(p);
  }
  if (distance(result[0], result.at(-1)) < EPS) result.pop();
  return result;
}
function line(e, reverse = false) {
  if (e[0] !== 0) throw new RangeError("T004C 折线索引错误");
  return reverse ? { type: 1, x1: e[4], y1: e[5], x2: e[2], y2: e[3] } : { type: 1, x1: e[2], y1: e[3], x2: e[4], y2: e[5] };
}
function onLine([x, y], e) {
  const dx = e.x2 - e.x1, dy = e.y2 - e.y1, length = Math.hypot(dx, dy);
  if (length < EPS || Math.abs((x - e.x1) * dy - (y - e.y1) * dx) / length > EPS) return false;
  const t = ((x - e.x1) * dx + (y - e.y1) * dy) / (length * length);
  return t >= -EPS && t <= 1 + EPS;
}

/** Rebuild proper faces from source cut paths. The public low-caliper ge.p
 * contour for M0 can collapse into four points at a corner; it is not the
 * rectangular wall bounded by the four real scores. Do not use that contour.
 */
export function createT004CTopology(geometry) {
  if (geometry?.meta?.boxId !== "T004C") throw new RangeError("T004C topology requires T004C geometry");
  const e = geometry.elements, style = geometry.parameters.t004cTongueStyle;
  const offset = style === 1 ? -2 : 0, at = (i) => e[i + offset];
  const { length: l, width: w, depth: d } = geometry.parameters;
  const { of, r, w1 } = geometry.compensation, H = d - of, back = l + w, end = back + l;
  const axes = {
    M1: line(e[0]), M3: line(e[1], true), M5: line(e[11], true), S1T: line(e[7], true),
    S3T: line(e[12], true), S5: { type: 1, x1: end, y1: H, x2: end, y2: 0 },
    M6: line(e[3], true), S6: line(e[style === 1 ? 47 : 49], true), S0: line(e[2]),
    S1B: line(e[9]), S3B: line(e[13]), S5B: line(e[16], true), M7: line(e[24]), M8: line(at(95)),
  };
  const contour = (start, indexes) => polygon(start, indexes.map((i) => e[i]));
  const topY = -r + Math.sqrt(Math.max(0, r * r - e[4][2] ** 2));
  // Clip round reliefs at the actual wall boundaries. Each shoulder belongs
  // to one face only, preventing tiny overlapping loops and corner spikes.
  const leftTopArc = pointsOf(e[4]).filter(([x]) => x <= EPS).reverse();
  const leftLower = pointsOf(e[10]).filter(([x, y]) => x <= EPS && y <= H + EPS).reverse();
  const sideLeft = [[-w1, 0], ...leftTopArc, [0, topY], [0, -of], [0, H], ...leftLower, [-w1, H]];
  const sideRight = [[l, -of], [l, topY], ...leftTopArc.map(([x, y]) => [l - x, y]).reverse(), [back, 0], [back, H], ...leftLower.map(([x, y]) => [l - x, y]).reverse(), [l, H]];
  const contours = {
    M0: [[0, -of], [l, -of], [l, H], [0, H]], M1: sideLeft, M3: sideRight,
    M5: contour([back, 0], [21, 22, 23, 24, 20, 19, 18, 15, 16]),
    S1T: contour([e[7][2], 0], [32, 33, 34, 35, 7]),
    S3T: contour([e[12][2], 0], [41, 40, 39, 38, 37, 12]),
    S5: contour([end, e[42][3]], [42, 44, 43]),
    M6: contour([0, -of], style === 1 ? [45, 48, 47, 49, 46] : [45, 50, 51, 49, 53, 52, 47]),
    S6: contour(pointsOf(e[style === 1 ? 50 : 54])[0], style === 1 ? [50, 51, 52, 53, 54, 55, 56, 49, 47, 48] : [54, 55, 56, 57, 58, 59, 60, 52, 53, 49, 51, 50]),
    S0: polygon([0, H], [[...at(62).slice(0, 6), 180 - e[10][6]], at(63), at(64), at(65), at(66), at(67), at(68), at(69), at(70), at(71), [...at(72).slice(0, 5), e[10][6], 180], e[2]]),
    S1B: polygon([-w1, H], [e[9], at(79), at(78), at(77), at(76), at(75), at(74)]),
    S3B: polygon([e[13][2], H], [e[13], [...at(80).slice(0, 5), e[10][6], 180], at(81), at(82), at(83), at(84), at(85)]),
    S5B: polygon([e[16][4], H], [e[16], at(91), at(92), at(93), at(94), at(90), at(89), at(88), [...at(87).slice(0, 6), 180 - e[10][6]]]),
    M7: polygon([e[24][4], at(95)[3]], [at(95), at(96), e[24], at(97)]),
    M8: polygon([at(95)[4], at(95)[3]], [at(99), at(101), at(102), at(100), at(98), at(95)]),
  };
  contours.M5.push([back, H]);
  contours.M6.push([l, -of]);
  const holes = {
    M5: [contour(pointsOf(e[25])[0], [25, 28, 30, 29, 26, 27])],
    M8: [polygon(pointsOf(at(103))[0], [at(103), at(105), at(104), at(107), at(108), at(106)])],
  };
  const definitions = [
    ["M0", "正面", null, [0]], ["M1", "左侧面", "M0", [0, 0, 90]],
    ["M3", "右侧面", "M0", [0, 0, 45, 90]], ["M5", "背面及挂片", "M3", [0, 0, 90]],
    ["S1T", "左防尘翼", "M1", [0, 0, 0, 0, 0, 0, 0, 0, 90]], ["S3T", "右防尘翼", "M3", [0, 0, 0, 0, 0, 0, 0, 0, 90]],
    ["S5", "粘口", "M5", [0, 0, 91]], ["M6", "上盖", "M0", [0, 0, 0, 0, 0, 0, 0, 0, -30, 90]],
    ["S6", "上插舌", "M6", [0, 0, 0, 0, 0, 0, 0, 0, 90]], ["S0", "正面扣底", "M0", [0, 0, 0, 0, 135, 135, 135, 94]],
    ["S1B", "左扣底", "M1", [0, 0, 0, 0, 0, 135, 135, 94]], ["S3B", "右扣底", "M3", [0, 0, 0, 0, 0, 135, 135, 94]],
    ["S5B", "背面扣底", "M5", [0, 0, 0, 0, 0, 0, 135, 94]], ["M7", "挂片纸厚折边", "M5", [0, 90]], ["M8", "双层挂片", "M7", [0, 90]],
  ];
  const allFoldLines = Object.values(axes);
  const pieces = definitions.map(([id, label, parentId, phaseAngles]) => {
    const points = contours[id].filter((p, i, all) => !i || distance(p, all[i - 1]) > EPS);
    if (distance(points[0], points.at(-1)) < EPS) points.pop();
    const exposedEdges = points.map((p, i) => allFoldLines.some((f) => onLine(p, f) && onLine(points[(i + 1) % points.length], f)) ? null : i).filter((i) => i !== null);
    return { id, label, kind: "panel", netPoints: points, sideNetPoints: [...points, [...points[0]]], holeNetPoints: holes[id] || [], exposedEdges, sideExposedEdges: exposedEdges,
      foldLinesToDraw: [...(axes[id] ? [axes[id]] : []), ...definitions.filter(([, , parent]) => parent === id).map(([child]) => axes[child])],
      foldRule: { parentId, sourceLine: axes[id] || null, phaseAngles } };
  });
  return { boxId: "T004C", officialBoxId: "T004C", caliper: geometry.parameters.caliper, bounds: pointBounds(e), maxAngleSteps: 10,
    autoFitCamera: true, cameraFitFraction: 0.72, foldLines: allFoldLines,
    faces: pieces.map(({ id, label, kind, netPoints, holeNetPoints }) => ({ id, label, kind, netPoints, holeNetPoints })), pieces };
}
