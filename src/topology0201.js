import { pointBounds } from "./svg.js";

const EPSILON = 1e-6;

const OFFICIAL_0201_PHASES = Object.freeze({
  bodyFast: Object.freeze([0, 90]),
  bodyLeft: Object.freeze([0, 45, 90]),
  longTop: Object.freeze([0, 0, 0, 0, 0, -30, 90]),
  longBottom: Object.freeze([0, 0, 0, -30, 90]),
  sideTop: Object.freeze([0, 0, 0, 0, 0, 90]),
  sideBottom: Object.freeze([0, 0, 0, 90]),
  glue: Object.freeze([0, 91]),
});

function create0201FoldRule(piece, topology) {
  const bodyIds = ["front", "right", "back", "left"];
  if (piece.kind === "body") {
    if (piece.panelIndex === 0) {
      return {
        parentId: "right",
        sourceLine: { type: 1, x1: piece.netRect.x2, y1: topology.body.y1, x2: piece.netRect.x2, y2: topology.body.y2 },
        phaseAngles: OFFICIAL_0201_PHASES.bodyFast,
      };
    }
    if (piece.panelIndex === 1) {
      return {
        parentId: "back",
        sourceLine: { type: 1, x1: piece.netRect.x2, y1: topology.body.y1, x2: piece.netRect.x2, y2: topology.body.y2 },
        phaseAngles: OFFICIAL_0201_PHASES.bodyFast,
      };
    }
    if (piece.panelIndex === 3) {
      return {
        parentId: "back",
        sourceLine: { type: 1, x1: piece.netRect.x1, y1: topology.body.y2, x2: piece.netRect.x1, y2: topology.body.y1 },
        phaseAngles: OFFICIAL_0201_PHASES.bodyLeft,
      };
    }
    return { parentId: null, sourceLine: null, phaseAngles: [0] };
  }
  if (piece.kind === "top" || piece.kind === "bottom") {
    const isTop = piece.kind === "top";
    const isLongPanel = piece.panelIndex === 0 || piece.panelIndex === 2;
    const ownerPanel = topology.pieces.find(
      (candidate) => candidate.kind === "body" && candidate.panelIndex === piece.panelIndex,
    );
    const hingeX1 = isLongPanel ? piece.netRect.x1 : ownerPanel.netRect.x1;
    const hingeX2 = isLongPanel ? piece.netRect.x2 : ownerPanel.netRect.x2;
    return {
      parentId: bodyIds[piece.panelIndex],
      sourceLine: {
        type: 1,
        x1: isTop ? hingeX2 : hingeX1,
        y1: piece.foldHingeY,
        x2: isTop ? hingeX1 : hingeX2,
        y2: piece.foldHingeY,
      },
      phaseAngles: isLongPanel
        ? (isTop ? OFFICIAL_0201_PHASES.longTop : OFFICIAL_0201_PHASES.longBottom)
        : (isTop ? OFFICIAL_0201_PHASES.sideTop : OFFICIAL_0201_PHASES.sideBottom),
    };
  }
  if (piece.kind === "glue" && piece.netPoints?.length >= 2) {
    const first = piece.netPoints[0];
    const last = piece.netPoints.at(-1);
    return {
      parentId: "front",
      sourceLine: { type: 1, x1: first[0], y1: first[1], x2: last[0], y2: last[1] },
      phaseAngles: OFFICIAL_0201_PHASES.glue,
    };
  }
  return { parentId: null, sourceLine: null, phaseAngles: [0] };
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

function isNearly(value, target) {
  return Math.abs(value - target) < EPSILON;
}

function lineCoordinates(element) {
  if (element[0] !== 0) return null;
  return { type: element[1], x1: element[2], y1: element[3], x2: element[4], y2: element[5] };
}

function arcCoordinates(element) {
  if (element[0] !== 1) return null;
  const [, , cx, cy, radius, start, end] = element;
  const span = ((end - start) % 360 + 360) % 360;
  return { element, cx, cy, radius, start, end, span };
}

function polylineCoordinates(element) {
  if (element[0] !== 2 || element.length < 6 || element.length % 2 !== 0) return null;
  const points = [];
  for (let index = 2; index < element.length; index += 2) {
    points.push([element[index], element[index + 1]]);
  }
  return { type: element[1], points };
}

function isHorizontal(line) {
  return isNearly(line.y1, line.y2);
}

function isVertical(line) {
  return isNearly(line.x1, line.x2);
}

function lineLength(line) {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

function lineMatches(line, x1, y1, x2, y2) {
  return (
    (isNearly(line.x1, x1) && isNearly(line.y1, y1) && isNearly(line.x2, x2) && isNearly(line.y2, y2)) ||
    (isNearly(line.x1, x2) && isNearly(line.y1, y2) && isNearly(line.x2, x1) && isNearly(line.y2, y1))
  );
}

function cutLineOnSegment(cutLines, x1, y1, x2, y2) {
  return cutLines.some((line) => lineMatches(line, x1, y1, x2, y2));
}

/**
 * The legacy 0201 data contains the real flap hinge and perimeter lines.
 * Do not recreate these rectangles from L/W/D: the generator offsets them by
 * the board caliper and shortens their sides for the cut clearance.
 */
function flapRectFromHinge(hinge, cutLines, direction) {
  const x1 = Math.min(hinge.x1, hinge.x2);
  const x2 = Math.max(hinge.x1, hinge.x2);
  const verticalCuts = cutLines.filter(
    (line) =>
      isVertical(line) &&
      (isNearly(line.x1, x1) || isNearly(line.x1, x2)) &&
      ((direction < 0 && Math.min(line.y1, line.y2) < hinge.y1 - EPSILON) ||
        (direction > 0 && Math.max(line.y1, line.y2) > hinge.y1 + EPSILON)),
  );
  const outerHorizontalCuts = cutLines.filter(
    (line) =>
      isHorizontal(line) &&
      isNearly(Math.min(line.x1, line.x2), x1) &&
      isNearly(Math.max(line.x1, line.x2), x2) &&
      ((direction < 0 && line.y1 < hinge.y1 - EPSILON) || (direction > 0 && line.y1 > hinge.y1 + EPSILON)),
  );
  const outerY = outerHorizontalCuts.length
    ? outerHorizontalCuts.reduce((current, line) =>
        Math.abs(line.y1 - hinge.y1) > Math.abs(current.y1 - hinge.y1) ? line : current,
      ).y1
    : verticalCuts.reduce(
        (current, line) =>
          direction < 0 ? Math.min(current, line.y2) : Math.max(current, line.y2),
        hinge.y1,
      );
  return { x1, y1: Math.min(hinge.y1, outerY), x2, y2: Math.max(hinge.y1, outerY) };
}

// The legacy 0201 generator records the four minor flaps as cut-line
// rectangles. They do not have a separate fold-line element, but they are
// still real dieline faces and must be present in both the flat and folded
// previews.
function flapRectsFromOuterCuts(cutLines, panels, bodyTop, bodyBottom, direction) {
  return cutLines
    .filter(
      (line) =>
        isHorizontal(line) &&
        lineLength(line) > 50 &&
        (direction < 0 ? line.y1 < bodyTop - EPSILON : line.y1 > bodyBottom + EPSILON),
    )
    .sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2))
    .map((outer) => {
      const x1 = Math.min(outer.x1, outer.x2);
      const x2 = Math.max(outer.x1, outer.x2);
      const outerY = outer.y1;
      const verticals = cutLines.filter(
        (line) =>
          isVertical(line) &&
          (isNearly(line.x1, x1) || isNearly(line.x1, x2)) &&
          Math.min(line.y1, line.y2) <= outerY + EPSILON &&
          Math.max(line.y1, line.y2) >= outerY - EPSILON,
      );
      const innerYs = [x1, x2].map((x) => {
        const vertical = verticals.find((line) => isNearly(line.x1, x));
        if (!vertical) return null;
        return isNearly(vertical.y1, outerY) ? vertical.y2 : vertical.y1;
      });
      if (innerYs.some((value) => value === null)) return null;
      const centerX = (x1 + x2) / 2;
      const panelIndex = panels.findIndex((panel) => centerX > panel.x1 && centerX < panel.x2);
      if (panelIndex < 0) return null;
      const innerY = innerYs.reduce((current, value) =>
        direction < 0 ? Math.max(current, value) : Math.min(current, value),
      );
      return {
        panelIndex,
        rect: { x1, y1: Math.min(innerY, outerY), x2, y2: Math.max(innerY, outerY) },
      };
    })
    .filter(Boolean);
}

function panelHingeY(foldLines, panel, bodyTop, bodyBottom, direction) {
  const candidates = foldLines
    .filter(
      (line) =>
        isHorizontal(line) &&
        lineLength(line) > 50 &&
        Math.min(line.x1, line.x2) <= panel.x2 + EPSILON &&
        Math.max(line.x1, line.x2) >= panel.x1 - EPSILON &&
        (direction < 0 ? line.y1 <= bodyTop + EPSILON : line.y1 >= bodyBottom - EPSILON),
    )
    .sort((left, right) => {
      const leftOverlap = Math.min(left.x2, panel.x2) - Math.max(left.x1, panel.x1);
      const rightOverlap = Math.min(right.x2, panel.x2) - Math.max(right.x1, panel.x1);
      if (Math.abs(leftOverlap - rightOverlap) > EPSILON) return rightOverlap - leftOverlap;
      return Math.abs(left.y1 - (direction < 0 ? bodyTop : bodyBottom)) -
        Math.abs(right.y1 - (direction < 0 ? bodyTop : bodyBottom));
    });
  return candidates[0]?.y1 ?? (direction < 0 ? bodyTop : bodyBottom);
}

function sourceArcPoints(element) {
  const [, , cx, cy, radius, start, end] = element;
  const sweep = ((end - start) % 360 + 360) % 360;
  const startAngle = (-end * Math.PI) / 180;
  // The official Plane contour stores a quarter-circle as four chords
  // (22.5 degrees each).  Using the same subdivision keeps the two halves of
  // every clearance slot coincident instead of giving one face a denser,
  // slightly different boundary.
  const steps = Math.max(1, Math.ceil(sweep / 22.5));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + (sweep * Math.PI * index) / (180 * steps);
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function appendDistinctPoint(points, point) {
  const previous = points.at(-1);
  if (!previous || !samePoint(previous, point)) points.push(point);
}

function samePoint(left, right) {
  return Math.abs(left[0] - right[0]) < EPSILON && Math.abs(left[1] - right[1]) < EPSILON;
}

function orientSourceArc(element, bodyCorner) {
  const points = sourceArcPoints(element);
  const firstDistance = Math.hypot(points[0][0] - bodyCorner[0], points[0][1] - bodyCorner[1]);
  const lastDistance = Math.hypot(points.at(-1)[0] - bodyCorner[0], points.at(-1)[1] - bodyCorner[1]);
  return firstDistance <= lastDistance ? points : points.reverse();
}

function snappedSourceArc(element, bodyCorner, clearanceCorner) {
  const points = element
    ? orientSourceArc(element, bodyCorner).map((point) => [...point])
    : [[...bodyCorner], [...clearanceCorner]];
  points[0] = [...bodyCorner];
  points[points.length - 1] = [...clearanceCorner];
  return points;
}

function sourceArcAtBoundary(arcElements, boundaryX, bodyY, flapX, flapY, caliper) {
  const candidates = arcElements.filter(({ cx, cy, span }) =>
    isNearly(cx, boundaryX) &&
    Math.abs(cy - bodyY) <= caliper + EPSILON &&
    span >= 45,
  );
  return candidates
    .map(({ element }) => ({
      element,
      distance: Math.min(
        ...sourceArcPoints(element).map(([x, y]) => Math.hypot(x - flapX, y - flapY)),
      ),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.element ?? null;
}

/**
 * Rebuild each closure flap from the generator's actual boundary geometry.
 *
 * A short 0201 side flap owns the two rounded halves of its clearance slots.
 * The major front/back flaps are handled separately: the official model keeps
 * those Planes rectangular because the matching arcs belong to the long body
 * Plane. Giving both faces the arcs makes the contours overlap and turns one
 * side of each slot into a triangulated straight edge.
 */
function sourceFlapGeometry(netRect, panel, direction, bodyTop, bodyBottom, foldHingeY, arcElements, caliper) {
  const isTop = direction < 0;
  const bodyY = isTop ? bodyTop : bodyBottom;
  const outerY = isTop ? netRect.y1 : netRect.y2;
  const rootY = isTop ? netRect.y2 : netRect.y1;
  const arcFlapY = bodyY + (isTop ? -1 : 1) * caliper / 2;
  const leftArc = sourceArcAtBoundary(arcElements, panel.x1, bodyY, netRect.x1, arcFlapY, caliper);
  const rightArc = sourceArcAtBoundary(arcElements, panel.x2, bodyY, netRect.x2, arcFlapY, caliper);
  const points = [];

  for (const point of snappedSourceArc(
    leftArc,
    [panel.x1, bodyY],
    [netRect.x1, arcFlapY],
  )) appendDistinctPoint(points, point);
  appendDistinctPoint(points, [netRect.x1, rootY]);
  appendDistinctPoint(points, [netRect.x1, outerY]);
  appendDistinctPoint(points, [netRect.x2, outerY]);
  appendDistinctPoint(points, [netRect.x2, rootY]);
  for (const point of snappedSourceArc(
    rightArc,
    [panel.x2, bodyY],
    [netRect.x2, arcFlapY],
  ).reverse()) appendDistinctPoint(points, point);

  const sidePoints = [...points, points[0]];
  const cutEdges = sidePoints
    .map((_, index) => index)
    .filter((index) => index < sidePoints.length - 2);
  return {
    points,
    exposedEdges: cutEdges,
    sidePoints,
    sideExposedEdges: cutEdges,
    radius: Math.max(0, Number(caliper) || 0) / 2,
    foldHingeY,
  };
}

function sourceMajorFlapGeometry(netRect, direction, foldHingeY, caliper) {
  const points = [
    [netRect.x1, netRect.y1],
    [netRect.x2, netRect.y1],
    [netRect.x2, netRect.y2],
    [netRect.x1, netRect.y2],
  ];
  const sidePoints = [...points, points[0]];
  // Top major flaps close on edge 2; bottom major flaps close on edge 0.
  const cutEdges = direction < 0 ? [0, 1, 3] : [1, 2, 3];
  return {
    points,
    exposedEdges: cutEdges,
    sidePoints,
    sideExposedEdges: cutEdges,
    radius: Math.max(0, Number(caliper) || 0) / 2,
    foldHingeY,
  };
}

/**
 * The two long 0201 body Planes (official M0/M5) are not rectangles. Their
 * source contours continue through a half-caliper corner arc and a short
 * connector to the major-flap score. Those small shoulders close the end of
 * each clearance slot; omitting them leaves the neighbouring fold strip
 * visibly sticking out at the body/flap junction.
 */
function sourceLongBodyGeometry(panel, bodyTop, bodyBottom, topHingeY, bottomHingeY, arcElements, caliper) {
  const inset = caliper / 2;
  const topLeftArc = sourceArcAtBoundary(
    arcElements,
    panel.x1,
    bodyTop,
    panel.x1 + inset,
    bodyTop - inset,
    caliper,
  );
  const topRightArc = sourceArcAtBoundary(
    arcElements,
    panel.x2,
    bodyTop,
    panel.x2 - inset,
    bodyTop - inset,
    caliper,
  );
  const bottomRightArc = sourceArcAtBoundary(
    arcElements,
    panel.x2,
    bodyBottom,
    panel.x2 - inset,
    bodyBottom + inset,
    caliper,
  );
  const bottomLeftArc = sourceArcAtBoundary(
    arcElements,
    panel.x1,
    bodyBottom,
    panel.x1 + inset,
    bodyBottom + inset,
    caliper,
  );
  const points = [];
  const exposedEdges = [];

  const appendPath = (path, exposed = true) => {
    for (const point of path) {
      const previousLength = points.length;
      appendDistinctPoint(points, point);
      if (exposed && points.length > previousLength && points.length > 1) {
        exposedEdges.push(points.length - 2);
      }
    }
  };

  const arcFromBody = (arc, corner, fallback) =>
    snappedSourceArc(arc, corner, fallback);

  appendPath(arcFromBody(topLeftArc, [panel.x1, bodyTop], [panel.x1 + inset, bodyTop - inset]));
  appendPath([[panel.x1 + inset, topHingeY]]);
  appendPath([[panel.x2 - inset, topHingeY]], false);
  appendPath(
    arcFromBody(topRightArc, [panel.x2, bodyTop], [panel.x2 - inset, bodyTop - inset]).reverse(),
  );
  appendPath([[panel.x2, bodyBottom]], false);
  appendPath(arcFromBody(bottomRightArc, [panel.x2, bodyBottom], [panel.x2 - inset, bodyBottom + inset]));
  appendPath([[panel.x2 - inset, bottomHingeY]]);
  appendPath([[panel.x1 + inset, bottomHingeY]], false);
  appendPath(
    arcFromBody(bottomLeftArc, [panel.x1, bodyBottom], [panel.x1 + inset, bodyBottom + inset]).reverse(),
  );

  const sidePoints = [...points, points[0]];
  // The closing vertical body edge is a fold, not an exposed cut edge.
  return {
    netPoints: points,
    sideNetPoints: sidePoints,
    exposedEdges,
    sideExposedEdges: exposedEdges,
    foldLinesToDraw: [
      { type: 1, x1: panel.x1, y1: bodyTop, x2: panel.x1, y2: bodyBottom },
      { type: 1, x1: panel.x2, y1: bodyTop, x2: panel.x2, y2: bodyBottom },
      { type: 1, x1: panel.x1 + inset, y1: topHingeY, x2: panel.x2 - inset, y2: topHingeY },
      { type: 1, x1: panel.x1 + inset, y1: bottomHingeY, x2: panel.x2 - inset, y2: bottomHingeY },
    ],
  };
}

/**
 * Convert the existing 0201 dieline into planar pieces used by the texture
 * and 3D previews. The body panels and closure flaps stay anchored to their
 * real net coordinates; the 3D renderer folds those pieces around their
 * actual panel edges.
 */
export function create0201Topology(geometry) {
  if (geometry?.meta?.boxId !== "0201") {
    throw new RangeError("0201 topology requires a 0201 geometry");
  }

  const allLines = geometry.elements.map(lineCoordinates).filter(Boolean);
  const foldLines = allLines.filter(({ type }) => type === 1);
  const cutLines = allLines.filter(({ type }) => type === 0);
  const polylines = geometry.elements.map(polylineCoordinates).filter(Boolean);

  const bodyHorizontalYs = uniqueSorted(
    foldLines
      .filter(({ y1, y2, x1, x2 }) => isNearly(y1, y2) && y1 >= -EPSILON && Math.abs(x2 - x1) > 50)
      .map(({ y1 }) => y1),
  );
  if (bodyHorizontalYs.length < 2) {
    throw new RangeError("0201 topology could not identify the body height");
  }

  const bodyTop = bodyHorizontalYs[0];
  // The short flap crease at y=bodyBottom+5 is also present; the first two
  // positive crease levels are the actual body top and body bottom.
  const bodyBottom = bodyHorizontalYs[1];
  // The last body boundary is a cut line in the legacy 0201 generator, so
  // body panel detection must include both crease and cut segments.
  const bodyVerticals = uniqueSorted(
    allLines
      .filter(({ x1, x2, y1, y2 }) => isNearly(x1, x2) && Math.min(y1, y2) <= bodyTop + EPSILON && Math.max(y1, y2) >= bodyBottom - EPSILON)
      .map(({ x1 }) => x1),
  );
  if (bodyVerticals.length < 5) {
    throw new RangeError("0201 topology could not identify the four body panels");
  }

  const panelXs = bodyVerticals.slice(0, 5);
  const bodyHeight = bodyBottom - bodyTop;
  const bounds = pointBounds(geometry.elements);

  const rect = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
  const panels = panelXs.slice(0, -1).map((x1, index) => ({
    id: `body-${index}`,
    x1,
    // 0201 deliberately alternates the body panel score levels.  The two
    // length panels use the -caliper / +caliper score pair (-5 / 225 for the
    // sample), while the two side panels use the nominal 0 / 220 pair.  The
    // online 3D model keeps these as four separate Plane contours. Flattening
    // them to one common y range moves the long-panel hinge off the original
    // board centre and is the source of the recessed/raised corners in the
    // local preview.
    y1: null,
    x2: panelXs[index + 1],
    y2: null,
  }));
  for (const panel of panels) {
    const horizontalScores = foldLines
      .filter(
        (line) =>
          isHorizontal(line) &&
          Math.min(line.x1, line.x2) < panel.x2 - EPSILON &&
          Math.max(line.x1, line.x2) > panel.x1 + EPSILON &&
          lineLength(line) > 50,
      )
      .map((line) => line.y1);
    panel.y1 = Math.min(...horizontalScores);
    panel.y2 = Math.max(...horizontalScores);
  }
  const bodyFoldLines = panelXs.slice(1, -1).map((x) =>
    foldLines.find(
      (line) =>
        isVertical(line) &&
        isNearly(line.x1, x) &&
        Math.min(line.y1, line.y2) <= bodyTop + EPSILON &&
        Math.max(line.y1, line.y2) >= bodyBottom - EPSILON,
    ) ?? { type: 1, x1: x, y1: bodyTop, x2: x, y2: bodyBottom },
  );
  const gluePolyline = polylines.find(({ points }) =>
    points.length >= 4 && points.some(([x, y]) => isNearly(x, panelXs[0]) && (isNearly(y, bodyTop) || isNearly(y, bodyBottom))),
  );

  const topHinges = foldLines
    .filter(({ x1, x2, y1, y2 }) => isHorizontal({ x1, x2, y1, y2 }) && y1 < bodyTop - EPSILON && lineLength({ x1, x2, y1, y2 }) > 50)
    .sort((a, b) => a.x1 - b.x1);
  const bottomHinges = foldLines
    .filter(({ x1, x2, y1, y2 }) => isHorizontal({ x1, x2, y1, y2 }) && y1 > bodyBottom + EPSILON && lineLength({ x1, x2, y1, y2 }) > 50)
    .sort((a, b) => a.x1 - b.x1);
  if (topHinges.length < 2 || bottomHinges.length < 2) {
    throw new RangeError("0201 topology could not identify the flap hinge lines");
  }
  const hingedTopFlaps = topHinges.slice(0, 2).map((hinge) => ({
    panelIndex: panels.findIndex((panel) => (hinge.x1 + hinge.x2) / 2 > panel.x1 && (hinge.x1 + hinge.x2) / 2 < panel.x2),
    rect: flapRectFromHinge(hinge, cutLines, -1),
  }));
  const hingedBottomFlaps = bottomHinges.slice(-2).map((hinge) => ({
    panelIndex: panels.findIndex((panel) => (hinge.x1 + hinge.x2) / 2 > panel.x1 && (hinge.x1 + hinge.x2) / 2 < panel.x2),
    rect: flapRectFromHinge(hinge, cutLines, 1),
  }));
  const cutTopFlaps = flapRectsFromOuterCuts(cutLines, panels, bodyTop, bodyBottom, -1);
  const cutBottomFlaps = flapRectsFromOuterCuts(cutLines, panels, bodyTop, bodyBottom, 1);
  // The outer cut rectangles are the authoritative list: it includes both
  // major flaps (which also have explicit hinge lines) and minor flaps (which
  // only have cut lines). Fall back to the hinge-derived pair only for an
  // older/malformed geometry that does not expose all perimeter cuts.
  const topFlaps = (cutTopFlaps.length === 4 ? cutTopFlaps : hingedTopFlaps)
    .filter(({ panelIndex }) => panelIndex >= 0)
    .sort((a, b) => a.rect.x1 - b.rect.x1);
  const bottomFlaps = (cutBottomFlaps.length === 4 ? cutBottomFlaps : hingedBottomFlaps)
    .filter(({ panelIndex }) => panelIndex >= 0)
    .sort((a, b) => a.rect.x1 - b.rect.x1);
  if (topFlaps.length !== 4 || bottomFlaps.length !== 4) {
    throw new RangeError("0201 topology could not identify all eight closure flaps");
  }
  const panelWidths = panels.map((panel) => panel.x2 - panel.x1);

  const bodyEdgeSegments = (panel) => [
    [panel.x1, panel.y2, panel.x2, panel.y2],
    [panel.x2, panel.y2, panel.x2, panel.y1],
    [panel.x2, panel.y1, panel.x1, panel.y1],
    [panel.x1, panel.y1, panel.x1, panel.y2],
  ];
  const exposedBodyEdges = (panel) => bodyEdgeSegments(panel)
    .map(([x1, y1, x2, y2], index) => (cutLineOnSegment(cutLines, x1, y1, x2, y2) ? index : null))
    .filter((index) => index !== null);

  const caliper = Number(geometry.parameters?.caliper) || 0.2;
  const arcElements = geometry.elements.map(arcCoordinates).filter(Boolean);
  const bodyFaces = panels.map((panel, index) => {
    const netRect = rect(panel.x1, panel.y1, panel.x2, panel.y2);
    const isLongPanel = index === 0 || index === 2;
    const longBody = isLongPanel
      ? sourceLongBodyGeometry(
          panel,
          bodyTop,
          bodyBottom,
          panelHingeY(foldLines, panel, bodyTop, bodyBottom, -1),
          panelHingeY(foldLines, panel, bodyTop, bodyBottom, 1),
          arcElements,
          caliper,
        )
      : null;
    return {
      id: ["front", "right", "back", "left"][index],
      label: ["前面", "右面", "背面", "左面"][index],
      kind: "body",
      panelIndex: index,
      // Use the official per-Plane contour and fold-line list. Long panels
      // include the rounded score shoulders; short panels remain rectangles.
      exposedEdges: longBody?.exposedEdges ?? exposedBodyEdges(panel),
      netRect,
      ...(longBody || {
        foldLinesToDraw: [
          { type: 1, x1: panel.x1, y1: bodyTop, x2: panel.x1, y2: bodyBottom },
          { type: 1, x1: panel.x2, y1: bodyTop, x2: panel.x2, y2: bodyBottom },
          { type: 1, x1: panel.x1, y1: bodyTop, x2: panel.x2, y2: bodyTop },
          { type: 1, x1: panel.x1, y1: bodyBottom, x2: panel.x2, y2: bodyBottom },
        ],
      }),
    };
  });
  // The online 0201 model keeps the small, real quarter-arcs at the three
  // internal panel boundaries. They occur as a pair on each boundary (one
  // from each neighbouring flap); keep them as source metadata while the
  // flap builder consumes the corresponding exact cut/arc paths.
  const junctionArcs = panelXs.slice(1, -1).flatMap((x) => [
    {
      side: "top",
      panelIndex: panelXs.indexOf(x) - 1,
      x,
      y: bodyTop,
      arcs: arcElements
        .filter(({ cx, cy, span }) =>
          isNearly(cx, x) && cy < bodyTop + EPSILON && Math.abs(cy - bodyTop) <= caliper + EPSILON && span >= 45,
        )
        .map(({ element }) => element),
    },
    {
      side: "bottom",
      panelIndex: panelXs.indexOf(x) - 1,
      x,
      y: bodyBottom,
      arcs: arcElements
        .filter(({ cx, cy, span }) =>
          isNearly(cx, x) && cy > bodyBottom - EPSILON && Math.abs(cy - bodyBottom) <= caliper + EPSILON && span >= 45,
        )
        .map(({ element }) => element),
    },
  ]);
  const pieces = [
    ...bodyFaces,
    ...(gluePolyline
      ? [{
          id: "glue-flap",
          label: "粘口",
          kind: "glue",
          panelIndex: 0,
          // The polyline starts/ends on the body edge; the renderer closes it
          // along that real fold line, just like the official ShapeGeometry.
          netPoints: gluePolyline.points,
          exposedEdges: [0, 1, 2],
        }]
      : []),
    ...topFlaps.map(({ panelIndex, rect: netRect }) => {
      const foldHingeY = panelHingeY(foldLines, panels[panelIndex], bodyTop, bodyBottom, -1);
      const flap = panelIndex % 2 === 0
        ? sourceMajorFlapGeometry(netRect, -1, foldHingeY, caliper)
        : sourceFlapGeometry(
            netRect,
            panels[panelIndex],
            -1,
            panels[panelIndex].y1,
            panels[panelIndex].y2,
            foldHingeY,
            arcElements,
            caliper,
          );
      return {
        id: `top-${["front", "right", "back", "left"][panelIndex]}`,
        label: `顶部${["前", "右", "后", "左"][panelIndex]}盖`,
        kind: "top",
        panelIndex,
        hingeY: bodyTop,
        // The flap perimeter has a caliper-clearance cut height, but the
        // folding axis is the generated horizontal score for this panel. The
        // online model keeps these values distinct (for example -5 vs 0).
        foldHingeY,
        netPoints: flap.points,
        exposedEdges: flap.exposedEdges,
        sideNetPoints: flap.sidePoints,
        sideExposedEdges: flap.sideExposedEdges,
        radius: flap.radius,
        netRect,
      };
    }),
    ...bottomFlaps.map(({ panelIndex, rect: netRect }) => {
      const foldHingeY = panelHingeY(foldLines, panels[panelIndex], bodyTop, bodyBottom, 1);
      const flap = panelIndex % 2 === 0
        ? sourceMajorFlapGeometry(netRect, 1, foldHingeY, caliper)
        : sourceFlapGeometry(
            netRect,
            panels[panelIndex],
            1,
            panels[panelIndex].y1,
            panels[panelIndex].y2,
            foldHingeY,
            arcElements,
            caliper,
          );
      return {
        id: `bottom-${["front", "right", "back", "left"][panelIndex]}`,
        label: `底部${["前", "右", "后", "左"][panelIndex]}盖`,
        kind: "bottom",
        panelIndex,
        hingeY: bodyBottom,
        // Bottom closure flaps likewise use their panel's real score (325 vs
        // 320), not the inner cut clearance (322.5).
        foldHingeY,
        netPoints: flap.points,
        exposedEdges: flap.exposedEdges,
        sideNetPoints: flap.sidePoints,
        sideExposedEdges: flap.sideExposedEdges,
        radius: flap.radius,
        netRect,
      };
    }),
  ];

  const topology = {
    boxId: "0201",
    caliper,
    bounds,
    maxAngleSteps: 7,
    // Keep every generated score line for the 3D renderer. The body fold
    // lines below are used for panel transforms; this full list is also
    // needed to draw the minor-flap creases that have no face of their own.
    foldLines: foldLines.map(({ type, x1, y1, x2, y2 }) => ({ type, x1, y1, x2, y2 })),
    junctionArcs,
    body: {
      x1: panelXs[0],
      x2: panelXs[4],
      y1: bodyTop,
      y2: bodyBottom,
      length: panelWidths[0],
      width: panelWidths[1],
      height: bodyHeight,
      foldLines: bodyFoldLines,
    },
    faces: [
      ...bodyFaces,
      { id: "top", label: "顶部", kind: "top", netRect: topFlaps[0] },
      { id: "bottom", label: "底部", kind: "bottom", netRect: bottomFlaps[0] },
    ],
    pieces,
  };
  for (const piece of pieces) piece.foldRule = create0201FoldRule(piece, topology);
  return topology;
}
