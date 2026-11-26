/**
 * Shared 2D contour & fold-axis helpers for 3D box topology builders.
 * Parameterised per box type so existing epsilon / arc sampling tolerances
 * remain bit-for-bit identical to calibrated topologies.
 */
export function createTopologyHelpers({
  boxLabel = "",
  epsilon = 1e-4,
  arcStepDegrees = 5.625,
  includeHoles = false,
} = {}) {
  const prefix = boxLabel ? `${boxLabel} ` : "";

  function axis(x1, y1, x2, y2) {
    return { type: 1, x1, y1, x2, y2 };
  }

  function lineFrom(element, reverse = false) {
    if (element?.[0] !== 0) {
      throw new RangeError(`${prefix}拓扑索引与刀模线类型不匹配`);
    }
    const line = { type: 1, x1: element[2], y1: element[3], x2: element[4], y2: element[5] };
    return reverse
      ? { type: 1, x1: line.x2, y1: line.y2, x2: line.x1, y2: line.y1 }
      : line;
  }

  function sourceArcPoints(element) {
    if (element?.[0] !== 1) {
      throw new RangeError(`${prefix}拓扑索引与刀模圆弧类型不匹配`);
    }
    const [, , cx, cy, radius, start, end] = element;
    const sweep = (((end - start) % 360) + 360) % 360;
    const startAngle = (-end * Math.PI) / 180;
    const steps = Math.max(1, Math.ceil(sweep / arcStepDegrees));
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
    throw new RangeError(`${prefix}拓扑包含不支持的刀模线类型`);
  }

  function samePoint(left, right) {
    return Math.abs(left[0] - right[0]) < epsilon && Math.abs(left[1] - right[1]) < epsilon;
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

  function polygon(...builders) {
    const points = [];
    for (const build of builders) build(points);
    if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
    return points;
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
    if (length < epsilon) return false;
    const cross = Math.abs((x - line.x1) * dy - (y - line.y1) * dx) / length;
    if (cross > epsilon) return false;
    const dot = (x - line.x1) * dx + (y - line.y1) * dy;
    return dot >= -epsilon && dot <= dx * dx + dy * dy + epsilon;
  }

  function exposedEdges(points, foldLines) {
    return points
      .map((point, index) => {
        const next = points[(index + 1) % points.length];
        return foldLines.some((line) => pointOnLine(point, line) && pointOnLine(next, line))
          ? null
          : index;
      })
      .filter((index) => index !== null);
  }

  function cloneClosed(points) {
    return [...points.map((point) => [...point]), [...points[0]]];
  }

  function makePiece(
    {
      id,
      label,
      points,
      holes = [],
      parentId = null,
      sourceLine = null,
      phaseAngles = [0],
      foldLinesToDraw = [],
    },
    allFoldLines,
  ) {
    const edges = exposedEdges(points, allFoldLines);
    const piece = {
      id,
      label,
      kind: "panel",
      netPoints: points,
    };
    if (includeHoles) piece.holeNetPoints = holes;
    piece.sideNetPoints = cloneClosed(points);
    piece.exposedEdges = edges;
    piece.sideExposedEdges = edges;
    piece.foldLinesToDraw = foldLinesToDraw;
    piece.foldRule = { parentId, sourceLine, phaseAngles };
    return piece;
  }

  function extractFoldLines(elements) {
    return elements
      .filter((element) => element[0] === 0 && element[1] === 1)
      .map((element) => lineFrom(element));
  }

  return {
    axis,
    lineFrom,
    sourceArcPoints,
    sourceElementPoints,
    samePoint,
    appendPoint,
    appendLine,
    appendArc,
    appendConnected,
    polygon,
    connectedPolygon,
    pointOnLine,
    exposedEdges,
    cloneClosed,
    makePiece,
    extractFoldLines,
  };
}
