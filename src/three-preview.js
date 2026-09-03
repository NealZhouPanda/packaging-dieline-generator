import * as THREE from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { createBoxTopology, phaseAngleAt, planeRuleFor } from "./box-topology.js";
import { canvasTransformFor } from "./texture-editor.js";
import wa3TextureUrl from "./assets/paper-cal/wa3.png";
import wa5TextureUrl from "./assets/paper-cal/wa5.png";
import wa7TextureUrl from "./assets/paper-cal/wa7.png";
import fengTextureUrl from "./assets/paper-cal/feng.png";
import officialCalAtlasUrl from "./assets/paper-cal/official-cal-atlas.png";

const EDGE_TEXTURE_URLS = Object.freeze({
  wa3: wa3TextureUrl,
  wa5: wa5TextureUrl,
  wa7: wa7TextureUrl,
  feng: fengTextureUrl,
});

// The online renderer does not use the four 26x26 UI thumbnails as its
// material maps. for3d.min.js contains this 256x344 atlas and crops one band
// into a 256x128 canvas before applying it to the cut-edge quads.
export const OFFICIAL_CAL_TEXTURE_BANDS = Object.freeze({
  wa3: Object.freeze({ start: 0, end: 52 }),
  wa5: Object.freeze({ start: 52, end: 140 }),
  wa7: Object.freeze({ start: 140, end: 272 }),
  feng: Object.freeze({ start: 272, end: 344 }),
});

const OFFICIAL_CAL_TEXTURE_WIDTH = 256;
const OFFICIAL_CAL_TEXTURE_HEIGHT = 128;
const OFFICIAL_CAL_U_SCALE = 0.3;

export function snapshotSizeFor(
  width,
  height,
  { maxWidth = 4096, maxHeight = 4096, maxScale = Number.POSITIVE_INFINITY } = {},
) {
  const baseWidth = Math.max(1, Math.round(Number(width) || 1));
  const baseHeight = Math.max(1, Math.round(Number(height) || 1));
  const scale = Math.min(
    Number.isFinite(Number(maxScale)) ? Math.max(0.01, Number(maxScale)) : Number.POSITIVE_INFINITY,
    Math.max(1, Number(maxWidth) || 1) / baseWidth,
    Math.max(1, Number(maxHeight) || 1) / baseHeight,
  );
  return {
    width: Math.max(1, Math.floor(baseWidth * scale)),
    height: Math.max(1, Math.floor(baseHeight * scale)),
    scale,
  };
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成 3D PNG 图片"));
    }, "image/png");
  });
}

// Effective defaults after the online Vue controls initialize lin3d.min.js.
// The renderer starts at 1/.5, then the two light sliders set 80/70.
export const OFFICIAL_VIEWER_DEFAULTS = Object.freeze({
  cameraFov: 45,
  cameraNear: 0.5,
  cameraFar: 20000,
  cameraZ: 670,
  modelPitch: 30,
  modelYaw: 30,
  directionalLight: 0.8,
  hemisphereLight: 0.7,
});

function uvPoint(bounds, x, y, canvas) {
  // The 3D artwork canvas has no editor-only padding; its UVs therefore map
  // the generated net directly across every available texture pixel.
  const [canvasX, canvasY] = canvasTransformFor(bounds, canvas.width, canvas.height, 0).point(x, y);
  return [
    canvasX / canvas.width,
    1 - canvasY / canvas.height,
  ];
}

function addQuad(positions, uvs, indices, groups, corners, cornerUvs, materialIndex) {
  const vertexStart = positions.length / 3;
  for (const [index, corner] of corners.entries()) {
    positions.push(...corner);
    uvs.push(...cornerUvs[index]);
  }
  const indexStart = indices.length;
  indices.push(
    vertexStart,
    vertexStart + 1,
    vertexStart + 2,
    vertexStart,
    vertexStart + 2,
    vertexStart + 3,
  );
  groups.push({ start: indexStart, count: 6, materialIndex });
}

function mirrorUvs(uvs) {
  return uvs.map(([u, v]) => [1 - u, v]);
}

/**
 * The online Plane renderer treats the generated dieline as the board's
 * center plane.  The two visible paper surfaces are exactly +/- Cal/2 from
 * that plane, and a fold rotates the center plane and its normal together.
 * Keep that rule in one helper so no face can accidentally pivot from one
 * surface of the board while another face pivots from the other surface.
 */
function boardThickness(thickness) {
  return Math.max(0.2, Number(thickness) || 0.2);
}

export function centeredSurfacePoint(point, normal, thickness, side) {
  const distance = boardThickness(thickness) / 2;
  return point
    .clone()
    .add(normal.clone().normalize().multiplyScalar(distance * side));
}

/**
 * Add one source fold line as a board-thickness strip.
 *
 * This is the important distinction from the old implementation: the strip
 * belongs to one face and is built from that face's own mapped fold line. It
 * is not a bridge between two independently chosen faces and it never uses
 * the corrugated cut-edge material. The official renderer does the same by
 * merging two half-caliper fold-line quads into each Plane mesh.
 */
function addFoldStrip(
  positions,
  uvs,
  indices,
  groups,
  segment,
  normal,
  bounds,
  canvas,
  thickness,
) {
  const caliper = boardThickness(thickness);
  const start = new THREE.Vector3(...segment.start);
  const end = new THREE.Vector3(...segment.end);
  const frontStart = centeredSurfacePoint(start, normal, caliper, 1).toArray();
  const frontEnd = centeredSurfacePoint(end, normal, caliper, 1).toArray();
  const backEnd = centeredSurfacePoint(end, normal, caliper, -1).toArray();
  const backStart = centeredSurfacePoint(start, normal, caliper, -1).toArray();
  const startUv = uvPoint(bounds, segment.netStart[0], segment.netStart[1], canvas);
  const endUv = uvPoint(bounds, segment.netEnd[0], segment.netEnd[1], canvas);
  const frontUvs = [startUv, endUv, endUv, startUv];
  // for3d.min.js calls its UV helper with the reverse-side flag for the
  // second half of every fold strip. That flag mirrors U; it is not a second
  // arbitrary texture placed over the crease.
  const backUvs = mirrorUvs(frontUvs);

  addQuad(
    positions,
    uvs,
    indices,
    groups,
    [frontStart, frontEnd, segment.end, segment.start],
    frontUvs,
    3,
  );
  addQuad(
    positions,
    uvs,
    indices,
    groups,
    [segment.start, segment.end, backEnd, backStart],
    backUvs,
    4,
  );
}

/**
 * Match for3d.min.js' cut-edge UV helper.  The official renderer does not
 * normalize each edge to its own [0, 1] range: it uses the real net x (or y
 * when the grain is reversed), scaled by 0.3 / caliper.  That is why a
 * horizontal cut and a vertical cut show different corrugated interfaces.
 */
export function officialCutEdgeUvs(start, end, thickness, grain = 0) {
  const caliper = boardThickness(thickness);
  const axis = Number(grain) ? 1 : 0;
  const u = (point) => (point[axis] / caliper) * OFFICIAL_CAL_U_SCALE;
  return [
    [u(start), 0],
    [u(end), 0],
    [u(end), 1],
    [u(start), 1],
  ];
}

function createSolidFaceGeometry(
  corners,
  rect,
  bounds,
  canvas,
  flipNetY,
  thickness,
  exposedEdges = [],
  foldSegments = [],
) {
  // ShapeGeometry in the official renderer normalizes every source contour
  // before extrusion, so canvasA is always the +Z face of a flat Plane.  Do
  // not infer the printed side from the source contour winding: 0201 contains
  // both clockwise and counter-clockwise flap paths.
  const normal = new THREE.Vector3(0, 0, 1);
  const front = corners.map((corner) => centeredSurfacePoint(new THREE.Vector3(...corner), normal, thickness, 1).toArray());
  const back = corners.map((corner) => centeredSurfacePoint(new THREE.Vector3(...corner), normal, thickness, -1).toArray());
  const topY = flipNetY ? rect.y2 : rect.y1;
  const bottomY = flipNetY ? rect.y1 : rect.y2;
  const netUvs = [
    uvPoint(bounds, rect.x1, topY, canvas),
    uvPoint(bounds, rect.x2, topY, canvas),
    uvPoint(bounds, rect.x2, bottomY, canvas),
    uvPoint(bounds, rect.x1, bottomY, canvas),
  ];
  const netCorners = [
    [rect.x1, topY],
    [rect.x2, topY],
    [rect.x2, bottomY],
    [rect.x1, bottomY],
  ];
  const positions = [];
  const uvs = [];
  const indices = [];
  const groups = [];

  addQuad(positions, uvs, indices, groups, front, netUvs, 0);
  // The reverse surface is canvasB. It keeps the official mirrored UV rule,
  // but canvasB is blank unless a separate reverse-side artwork is supplied.
  // sidePlaneBlank applies to named side-Plane groups, not to every reverse
  // paper surface.
  addQuad(positions, uvs, indices, groups, [...back].reverse(), mirrorUvs(netUvs).reverse(), 2);
  for (const index of exposedEdges) {
    const next = (index + 1) % corners.length;
    addQuad(
      positions,
      uvs,
      indices,
      groups,
      [front[index], front[next], back[next], back[index]],
      officialCutEdgeUvs(netCorners[index], netCorners[next], thickness),
      1,
    );
  }
  for (const segment of foldSegments) {
    addFoldStrip(positions, uvs, indices, groups, segment, normal, bounds, canvas, thickness);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeVertexNormals();
  return geometry;
}

function sameNetPoint(left, right) {
  return Math.abs(left[0] - right[0]) < 1e-6 && Math.abs(left[1] - right[1]) < 1e-6;
}

function createSolidPolygonGeometry(
  corners,
  netPoints,
  bounds,
  canvas,
  thickness,
  exposedEdges = [],
  sideCorners = corners,
  sideNetPoints = netPoints,
  sideExposedEdges = exposedEdges,
  foldSegments = [],
  holeNetPoints = [],
) {
  // ShapeUtils removes a duplicated closing point before triangulating, but
  // the old adapter kept that vertex in the position/UV arrays.  The index
  // mismatch split the lower flaps into diagonally different triangles and
  // sampled artwork from the body/red band.  Use the open contour for the
  // two paper surfaces while retaining the closed contour for cut edges.
  const hasDuplicateEnd = netPoints.length > 2 && sameNetPoint(netPoints[0], netPoints.at(-1));
  const surfaceNetPoints = hasDuplicateEnd ? netPoints.slice(0, -1) : netPoints;
  const surfaceCorners = hasDuplicateEnd ? corners.slice(0, -1) : corners;
  const surfaceHoleNetPoints = holeNetPoints.map((hole) => (
    hole.length > 2 && sameNetPoint(hole[0], hole.at(-1)) ? hole.slice(0, -1) : hole
  ));
  const surfaceHoleCorners = surfaceHoleNetPoints.map((hole) => (
    hole.map((point) => sourcePlanePoint(point))
  ));
  const allSurfaceNetPoints = [surfaceNetPoints, ...surfaceHoleNetPoints].flat();
  const allSurfaceCorners = [surfaceCorners, ...surfaceHoleCorners].flat();
  // Official Plane content is normalized so that canvasA is +Z for every
  // contour.  Computing this from the first three polygon points made the
  // printed side flip whenever a flap path had the opposite winding.
  const normal = new THREE.Vector3(0, 0, 1);
  const front = allSurfaceCorners.map((corner) => centeredSurfacePoint(new THREE.Vector3(...corner), normal, thickness, 1).toArray());
  const back = allSurfaceCorners.map((corner) => centeredSurfacePoint(new THREE.Vector3(...corner), normal, thickness, -1).toArray());
  const netUvs = allSurfaceNetPoints.map(([x, y]) => uvPoint(bounds, x, y, canvas));
  const shapePoints = surfaceNetPoints.map(([x, y]) => new THREE.Vector2(x, y));
  const holeShapePoints = surfaceHoleNetPoints.map((hole) => hole.map(([x, y]) => new THREE.Vector2(x, y)));
  const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, holeShapePoints);
  const positions = [...front.flat(), ...back.flat()];
  const uvs = [...netUvs.flat(), ...mirrorUvs(netUvs).flat()];
  const indices = [];
  const groups = [];
  const backOffset = allSurfaceCorners.length;
  for (const triangle of triangles) {
    const [a, b, c] = triangle;
    const triangleNormal = new THREE.Vector3()
      .subVectors(new THREE.Vector3(...allSurfaceCorners[b]), new THREE.Vector3(...allSurfaceCorners[a]))
      .cross(new THREE.Vector3(...allSurfaceCorners[c]).sub(new THREE.Vector3(...allSurfaceCorners[a])));
    // Earcut follows the 2D contour winding.  Some 0201 flap contours run
    // opposite to the 3D front normal after the net Y axis is flipped, so
    // explicitly orient the front triangles before using FrontSide materials.
    const orientedTriangle = triangleNormal.dot(normal) >= 0 ? triangle : [a, c, b];
    indices.push(...orientedTriangle);
    groups.push({ start: indices.length - 3, count: 3, materialIndex: 0 });
    indices.push(
      backOffset + orientedTriangle[2],
      backOffset + orientedTriangle[1],
      backOffset + orientedTriangle[0],
    );
    groups.push({ start: indices.length - 3, count: 3, materialIndex: 2 });
  }
  for (const index of sideExposedEdges) {
    if (index < 0 || index >= sideCorners.length) continue;
    const next = (index + 1) % sideCorners.length;
    const start = positions.length / 3;
    const sideStart = sideCorners[index];
    const sideEnd = sideCorners[next];
    const sideFront = centeredSurfacePoint(new THREE.Vector3(...sideStart), normal, thickness, 1).toArray();
    const sideFrontNext = centeredSurfacePoint(new THREE.Vector3(...sideEnd), normal, thickness, 1).toArray();
    const sideBackNext = centeredSurfacePoint(new THREE.Vector3(...sideEnd), normal, thickness, -1).toArray();
    const sideBack = centeredSurfacePoint(new THREE.Vector3(...sideStart), normal, thickness, -1).toArray();
    positions.push(...sideFront, ...sideFrontNext, ...sideBackNext, ...sideBack);
    uvs.push(
      ...officialCutEdgeUvs(sideNetPoints[index], sideNetPoints[next], thickness).flat(),
    );
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    groups.push({ start: indices.length - 6, count: 6, materialIndex: 1 });
  }
  for (const [holeIndex, holeCorners] of surfaceHoleCorners.entries()) {
    const holePoints = surfaceHoleNetPoints[holeIndex];
    for (let index = 0; index < holeCorners.length; index += 1) {
      const next = (index + 1) % holeCorners.length;
      const start = positions.length / 3;
      const sideFront = centeredSurfacePoint(new THREE.Vector3(...holeCorners[index]), normal, thickness, 1).toArray();
      const sideFrontNext = centeredSurfacePoint(new THREE.Vector3(...holeCorners[next]), normal, thickness, 1).toArray();
      const sideBackNext = centeredSurfacePoint(new THREE.Vector3(...holeCorners[next]), normal, thickness, -1).toArray();
      const sideBack = centeredSurfacePoint(new THREE.Vector3(...holeCorners[index]), normal, thickness, -1).toArray();
      positions.push(...sideFront, ...sideFrontNext, ...sideBackNext, ...sideBack);
      uvs.push(...officialCutEdgeUvs(holePoints[index], holePoints[next], thickness).flat());
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      groups.push({ start: indices.length - 6, count: 6, materialIndex: 1 });
    }
  }
  for (const segment of foldSegments) {
    addFoldStrip(positions, uvs, indices, groups, segment, normal, bounds, canvas, thickness);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  for (const group of groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.computeVertexNormals();
  return geometry;
}

// The official renderer creates one plane per dieline face and nests each
// plane under the face that owns its fold line. Keep the same invariant here:
// every child starts at the exact previous panel edge in the generated net,
// and only that child is rotated around the shared crease.
function flipNetYForPiece(id) {
  return [
    "front",
    "right",
    "back",
    "left",
    "top-front",
    "top-right",
    "top-back",
    "top-left",
    "bottom-front",
    "bottom-right",
    "bottom-back",
    "bottom-left",
  ].includes(id);
}

const MAX_FOLD_ANGLE = Math.PI / 2;

export function foldedBodyCorners(panelRects, body, foldProgress = 1) {
  const progress = Math.min(1, Math.max(0, Number(foldProgress) || 0));
  const panelWidths = panelRects.map((panel) => panel.x2 - panel.x1);
  const height = body.y2 - body.y1;
  const netCenterX = (panelRects[0].x1 + panelRects.at(-1).x2) / 2;
  const origin = new THREE.Vector3(panelRects[0].x1 - netCenterX, 0, 0);
  const vertical = new THREE.Vector3(0, 1, 0);
  const frames = [];
  let frameOrigin = origin;
  let horizontal = new THREE.Vector3(1, 0, 0);

  // The frame origin is the bottom-left point of the panel (net y2). At 0%
  // all frames are coplanar and reproduce the generated net. At 100% the
  // next frame is rotated around the previous panel's actual right crease.
  for (const [index, panelWidth] of panelWidths.entries()) {
    frames.push({
      origin: frameOrigin.clone(),
      horizontal: horizontal.clone(),
      vertical: vertical.clone(),
      width: panelWidth,
      height,
    });
    if (index < panelWidths.length - 1) {
      const fallbackHingeX = panelRects[index].x2;
      const hingeX = Number(body.foldLines?.[index]?.x1);
      const actualHingeX = Number.isFinite(hingeX) ? hingeX : fallbackHingeX;
      frameOrigin = frameOrigin
        .clone()
        .add(horizontal.clone().multiplyScalar(actualHingeX - panelRects[index].x1));
      // for3d.min.js first flips the dieline Y coordinate (`-y`) and then
      // derives the fold axis from FoldLine.to - FoldLine.from. A vertical
      // source crease therefore becomes the negative local Y axis. The
      // previous local implementation rotated around +Y, bending the panel
      // chain into the opposite side.
      horizontal = horizontal.clone().applyAxisAngle(vertical, -MAX_FOLD_ANGLE * progress).normalize();
    }
  }

  const cornersForFrame = ({ origin: frameStart, horizontal: u, vertical: v, width }) => [
    frameStart.clone(),
    frameStart.clone().add(u.clone().multiplyScalar(width)),
    frameStart.clone().add(u.clone().multiplyScalar(width)).add(v.clone().multiplyScalar(height)),
    frameStart.clone().add(v.clone().multiplyScalar(height)),
  ].map((point) => point.toArray());

  return {
    front: cornersForFrame(frames[0]),
    right: cornersForFrame(frames[1]),
    back: cornersForFrame(frames[2]),
    left: cornersForFrame(frames[3]),
    frames,
    frontLength: panelWidths[0],
    backLength: panelWidths[2],
    frontLeft: frames[0].origin.x,
    frontRight: frames[0].origin.clone().add(frames[0].horizontal.clone().multiplyScalar(panelWidths[0])).x,
    backLeft: frames[2].origin.x,
    backRight: frames[2].origin.clone().add(frames[2].horizontal.clone().multiplyScalar(panelWidths[2])).x,
    frontZ: frames[0].origin.z,
    backZ: frames[2].origin.z,
    halfHeight: height / 2,
    bodyHeight: height,
    body,
    panelRects,
    netCenterX,
    foldProgress: progress,
  };
}

function flapCorners(piece, folded) {
  const { netRect } = piece;
  const isTop = piece.kind === "top";
  const frame = folded.frames[piece.panelIndex];
  const parentPanel = folded.panelRects[piece.panelIndex];
  // The dieline contains a small caliper-clearance offset around some flap
  // cuts.  It is useful for the texture/cut geometry, but it is not the 3D
  // hinge: the flap must meet the body at its actual top/bottom score line.
  const hingeNetY = Number.isFinite(piece.hingeY)
    ? piece.hingeY
    : isTop ? netRect.y2 : netRect.y1;
  const localX1 = netRect.x1 - parentPanel.x1;
  const localX2 = netRect.x2 - parentPanel.x1;
  const attachLeft = frame.origin
    .clone()
    .add(frame.vertical.clone().multiplyScalar(folded.body.y2 - hingeNetY))
    .add(frame.horizontal.clone().multiplyScalar(localX1));
  const attachRight = frame.origin
    .clone()
    .add(frame.vertical.clone().multiplyScalar(folded.body.y2 - hingeNetY))
    .add(frame.horizontal.clone().multiplyScalar(localX2));
  const span = isTop
    ? hingeNetY - netRect.y1
    : netRect.y2 - hingeNetY;
  const flatDirection = frame.vertical.clone().multiplyScalar(isTop ? 1 : -1);
  // A horizontal source FoldLine is stored as (x1,-y1) -> (x2,-y2), so its
  // axis is +local X. After the body chain uses the official -Y axis, the
  // face-local phases that point all four flaps toward the same box interior
  // are top +90° and bottom -90°.
  const hingeAngle = (isTop ? 1 : -1) * MAX_FOLD_ANGLE * folded.foldProgress;
  const foldedDirection = flatDirection.clone().applyAxisAngle(frame.horizontal, hingeAngle).normalize();
  const outerLeft = attachLeft.clone().add(foldedDirection.clone().multiplyScalar(span));
  const outerRight = attachRight.clone().add(foldedDirection.clone().multiplyScalar(span));
  const corners = isTop
    ? [attachLeft, attachRight, outerRight, outerLeft]
    : [outerLeft, outerRight, attachRight, attachLeft];
  return corners.map((point) => point.toArray());
}

function cornersForPiece(piece, folded) {
  if (piece.kind === "body") return folded[piece.id];
  if (piece.kind === "glue") {
    const frame = folded.frames[piece.panelIndex];
    const parentPanel = folded.panelRects[piece.panelIndex];
    // The glue tab is attached to the outer left edge of panel 0. It folds
    // in the opposite direction to the body panel chain and lands against
    // the last panel at the closed seam, as it does in the official model.
    const glueHorizontal = frame.horizontal
      .clone()
      .applyAxisAngle(frame.vertical, -MAX_FOLD_ANGLE * folded.foldProgress)
      .normalize();
    return piece.netPoints.map(([x, y]) =>
      frame.origin
        .clone()
        .add(glueHorizontal.clone().multiplyScalar(x - parentPanel.x1))
        .add(frame.vertical.clone().multiplyScalar(folded.body.y2 - y))
        .toArray(),
    );
  }
  if (piece.netPoints) {
    return piece.netPoints.map(([x, y]) => mapFlapNetPoint(piece, x, y, folded).point.toArray());
  }
  return flapCorners(piece, folded);
}

function panelIndexForX(x, panelRects) {
  const index = panelRects.findIndex(({ x1, x2 }) => x >= x1 - 1e-6 && x <= x2 + 1e-6);
  if (index >= 0) return index;
  return x < panelRects[0].x1 ? 0 : panelRects.length - 1;
}

function mapBodyNetPoint(x, y, folded, forcedPanelIndex = null) {
  // At an internal panel boundary the net x coordinate belongs to both
  // panels.  The first-match lookup is useful for ordinary crease lines, but
  // a flap joint must use the owning panel's frame and normal at both ends.
  // Otherwise one end of the closure is extruded from the neighbouring face,
  // producing the diagonal/raised seam visible at the six junctions.
  const panelIndex = Number.isInteger(forcedPanelIndex)
    ? forcedPanelIndex
    : panelIndexForX(x, folded.panelRects);
  const frame = folded.frames[panelIndex];
  const panel = folded.panelRects[panelIndex];
  const point = frame.origin
    .clone()
    .add(frame.horizontal.clone().multiplyScalar(x - panel.x1))
    .add(frame.vertical.clone().multiplyScalar(folded.body.y2 - y));
  return { point, normal: frame.horizontal.clone().cross(frame.vertical).normalize() };
}

export function mapFlapNetPoint(piece, x, y, folded) {
  const isTop = piece.kind === "top";
  const netRect = piece.netRect;
  const frame = folded.frames[piece.panelIndex];
  const parentPanel = folded.panelRects[piece.panelIndex];
  const foldHingeY = Number.isFinite(piece.foldHingeY)
    ? piece.foldHingeY
    : Number.isFinite(piece.hingeY)
      ? piece.hingeY
      : isTop ? netRect.y2 : netRect.y1;
  const localX = x - parentPanel.x1;

  // First place the vertex in the exact flat net coordinate system. The
  // perimeter follows the source cut/arc coordinates, including the small
  // clearance around each real junction.
  const flatPoint = frame.origin
    .clone()
    .add(frame.horizontal.clone().multiplyScalar(localX))
    .add(frame.vertical.clone().multiplyScalar(folded.body.y2 - y));

  // Match the official Plane/FoldLine hierarchy: the flap geometry is first
  // translated so this source fold line is its local origin, then that local
  // plane is rotated by the fold angle.  The body boundary and the score can
  // intentionally differ (-5 vs 0, or 325 vs 320); that small source segment
  // is what produces the outward paper lip at the junction in the online
  // model.  Pivoting at the body boundary collapses that segment and pulls
  // the offline corner inward.
  const pivot = frame.origin
    .clone()
    .add(frame.horizontal.clone().multiplyScalar(localX))
    .add(frame.vertical.clone().multiplyScalar(folded.body.y2 - foldHingeY));
  // Same face-specific phase angles as flapCorners(): top +90° and bottom
  // -90° around the +local-X source FoldLine axis.
  const hingeAngle = (isTop ? 1 : -1) * MAX_FOLD_ANGLE * folded.foldProgress;
  const point = flatPoint
    .sub(pivot)
    .applyAxisAngle(frame.horizontal, hingeAngle)
    .add(pivot);

  // The flat face normal is shared by the surface and its actual fold axis.
  // Rotating it with the face keeps the crease/thickness geometry on the
  // visible side for both top and bottom flaps.
  const normal = frame.horizontal
    .clone()
    .cross(frame.vertical)
    // Bottom contours are wound in the opposite direction to top contours,
    // so their printed face normal is the reverse of the top face normal.
    .multiplyScalar(isTop ? 1 : -1)
    .applyAxisAngle(frame.horizontal, hingeAngle)
    .normalize();
  return { point, normal };
}

function mapPieceNetPoint(piece, x, y, folded) {
  if (piece.kind === "body") return mapBodyNetPoint(x, y, folded, piece.panelIndex);
  if (piece.kind === "top" || piece.kind === "bottom") {
    return mapFlapNetPoint(piece, x, y, folded);
  }
  return null;
}

/**
 * Return the source fold lines drawn by this face.
 *
 * The online model stores each face's FoldLine and all boundary scores in
 * foldlinesToDraw. A shared crease is emitted on both adjacent faces; a flap
 * hinge is emitted on the body and flap faces. Each remains a
 * face-owned half-caliper strip, so the real board thickness closes without
 * inventing a bridge or a corrugated cut edge.
 */
export function foldSegmentsForPiece(piece, topology, folded) {
  if (piece.kind === "body") {
    const body = topology.body;
    const panel = piece.netRect;
    const bodyBoundaryFoldLines = (topology.foldLines ?? []).filter((line) => {
      if (line.type !== 1) return false;
      const vertical = Math.abs(line.x1 - line.x2) <= 1e-6;
      const horizontal = Math.abs(line.y1 - line.y2) <= 1e-6;
      if (vertical) {
        const onPanelEdge = Math.abs(line.x1 - panel.x1) <= 1e-6 || Math.abs(line.x1 - panel.x2) <= 1e-6;
        const lineMinY = Math.min(line.y1, line.y2);
        const lineMaxY = Math.max(line.y1, line.y2);
        return onPanelEdge && lineMaxY >= panel.y1 - 1e-6 && lineMinY <= panel.y2 + 1e-6;
      }
      if (horizontal) {
        // A flap's caliper-clearance hinge may sit 5 mm outside the body
        // (for example y=-5 or y=225). It belongs to that flap's Plane only.
        // Drawing it on the body creates a floating strip and makes the
        // apparent fold axis miss the middle of the body thickness. The
        // official renderer draws only scores on this face's own boundary.
        const onBodyBoundary =
          Math.abs(line.y1 - panel.y1) <= 1e-6 ||
          Math.abs(line.y1 - panel.y2) <= 1e-6;
        const overlapsPanel = Math.min(line.x1, line.x2) < panel.x2 - 1e-6 &&
          Math.max(line.x1, line.x2) > panel.x1 + 1e-6;
        return onBodyBoundary && overlapsPanel;
      }
      return false;
    });

    return bodyBoundaryFoldLines.flatMap((sourceLine) => {
      const start = mapPieceNetPoint(piece, sourceLine.x1, sourceLine.y1, folded);
      const end = mapPieceNetPoint(piece, sourceLine.x2, sourceLine.y2, folded);
      if (!start || !end) return [];
      return [{
        start: start.point.toArray(),
        end: end.point.toArray(),
        netStart: [sourceLine.x1, sourceLine.y1],
        netEnd: [sourceLine.x2, sourceLine.y2],
      }];
    });
  }

  if (piece.kind !== "top" && piece.kind !== "bottom") return [];
  const scoreY = Number(piece.foldHingeY);
  if (!Number.isFinite(scoreY)) return [];
  const sourceLine = topology.foldLines?.find(
    (line) =>
      line.type === 1 &&
      Math.abs(line.y1 - line.y2) <= 1e-6 &&
      Math.abs(line.y1 - scoreY) <= 1e-6 &&
      Math.max(line.x1, line.x2) >= piece.netRect.x1 - 1e-6 &&
      Math.min(line.x1, line.x2) <= piece.netRect.x2 + 1e-6,
  );
  if (!sourceLine) return [];
  const start = mapPieceNetPoint(piece, sourceLine.x1, sourceLine.y1, folded);
  const end = mapPieceNetPoint(piece, sourceLine.x2, sourceLine.y2, folded);
  if (!start || !end) return [];
  return [{
    start: start.point.toArray(),
    end: end.point.toArray(),
    netStart: [sourceLine.x1, sourceLine.y1],
    netEnd: [sourceLine.x2, sourceLine.y2],
  }];
}

/**
 * The online renderer does not calculate a new world-space polygon for every
 * slider tick. It draws every Plane in the original dieline coordinates,
 * translates that Plane so its own FoldLine starts at the local origin, and
 * nests the Plane group under the face that owns the crease. Keep the same
 * source-coordinate representation here; the only world transform is then
 * the official parent-group rotation.
 */
function sourcePlanePoint([x, y], z = 0) {
  return [x, -y, z];
}

function sourceRectCorners(rect) {
  // for3d.min.js draws ShapePath points as (x, -y). This winding puts the
  // printed surface on +Z, exactly like the online ShapeGeometry.
  const netCorners = [
    [rect.x1, rect.y2],
    [rect.x2, rect.y2],
    [rect.x2, rect.y1],
    [rect.x1, rect.y1],
  ];
  return { netCorners, corners: netCorners.map((point) => sourcePlanePoint(point)) };
}

/** Match FoldLine.getCurrentAngle() in the official for3d renderer. */
export function officialPhaseAngle(phaseAngles, progress, maxSteps = 7) {
  return phaseAngleAt(phaseAngles, progress, maxSteps);
}

export function officialPlaneSpec(piece, topology) {
  const { parentId, sourceLine, phaseAngles } = planeRuleFor(piece, topology);
  const angle = THREE.MathUtils.degToRad(phaseAngles.at(-1) ?? 0);

  if (!sourceLine) {
    return { parentId, foldOrigin: null, axis: null, angle, phaseAngles, sourceLine: null };
  }
  const from = sourcePlanePoint([sourceLine.x1, sourceLine.y1]);
  const to = sourcePlanePoint([sourceLine.x2, sourceLine.y2]);
  const axis = new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize();
  return {
    parentId,
    foldOrigin: new THREE.Vector3(...from),
    axis,
    angle,
    phaseAngles,
    sourceLine,
  };
}

function sourceFoldSegmentsForPiece(piece, topology) {
  let sourceLines = [];
  if (Array.isArray(piece.foldLinesToDraw)) {
    sourceLines = piece.foldLinesToDraw || [];
  } else {
    const sourceLine = officialPlaneSpec(piece, topology).sourceLine;
    if (sourceLine) sourceLines = [sourceLine];
  }

  // Plane geometry stays in source coordinates. Mapping these lines through
  // an already-folded world frame and then rotating the parent group again
  // double-transformed the hinge strips and produced the white/broken gaps.
  return sourceLines.map((line) => ({
    start: sourcePlanePoint([line.x1, line.y1]),
    end: sourcePlanePoint([line.x2, line.y2]),
    netStart: [line.x1, line.y1],
    netEnd: [line.x2, line.y2],
  }));
}

function createOfficialPieceGeometry(piece, topology, bounds, canvas, thickness) {
  const foldSegments = sourceFoldSegmentsForPiece(piece, topology);
  if (piece.netRect && !piece.netPoints?.length) {
    const { corners } = sourceRectCorners(piece.netRect);
    return createSolidFaceGeometry(
      corners,
      piece.netRect,
      bounds,
      canvas,
      true,
      thickness,
      piece.exposedEdges,
      foldSegments,
    );
  }
  const corners = piece.netPoints.map((point) => sourcePlanePoint(point));
  const sideCorners = piece.sideNetPoints
    ? piece.sideNetPoints.map((point) => sourcePlanePoint(point))
    : corners;
  return createSolidPolygonGeometry(
    corners,
    piece.netPoints,
    bounds,
    canvas,
    thickness,
    piece.exposedEdges,
    sideCorners,
    piece.sideNetPoints || piece.netPoints,
    piece.sideExposedEdges || piece.exposedEdges,
    foldSegments,
    piece.holeNetPoints || [],
  );
}

function edgesForCorners(corners, excludedEdges = [], extraContours = []) {
  const excluded = new Set(excludedEdges);
  const positions = [];
  for (let index = 0; index < corners.length; index += 1) {
    if (excluded.has(index)) continue;
    const next = (index + 1) % corners.length;
    positions.push(corners[index], corners[next]);
  }
  for (const contour of extraContours) {
    for (let index = 0; index < contour.length; index += 1) {
      const next = (index + 1) % contour.length;
      positions.push(contour[index], contour[next]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions.flat(), 3));
  return geometry;
}

export class ThreePreview {
  constructor({
    host,
    rotationInput,
    rotationValue,
    foldInput,
    foldValue,
    foldButton,
    resetButton,
    paperColorInput,
    light1Input,
    light2Input,
    edgeTextureButtons = [],
  }) {
    this.host = host;
    this.rotationInput = rotationInput;
    this.rotationValue = rotationValue;
    this.foldInput = foldInput;
    this.foldValue = foldValue;
    this.foldButton = foldButton;
    this.foldProgress = 1;
    this.paperColorInput = paperColorInput;
    this.geometry = null;
    this.topology = null;
    this.textureCanvas = null;
    this.edgeTextureType = "wa5";
    this.thickness = 0;
    this.planeGroups = new Map();
    this.planeSpecs = new Map();
    this.edgeTextureButtons = edgeTextureButtons;
    this.compositeCanvas = document.createElement("canvas");
    this.compositeCanvas.width = 1;
    this.compositeCanvas.height = 1;
    this.texture = this.configureArtworkTexture(new THREE.CanvasTexture(this.compositeCanvas));
    this.scene = new THREE.Scene();
    this.scene.background = null;
    // lin3d.min.js uses PerspectiveCamera(45, aspect, .5, 20000) at
    // (0, D3.cameraPosY, 670), where cameraPosY is zero for this editor.
    this.camera = new THREE.PerspectiveCamera(
      OFFICIAL_VIEWER_DEFAULTS.cameraFov,
      1,
      OFFICIAL_VIEWER_DEFAULTS.cameraNear,
      OFFICIAL_VIEWER_DEFAULTS.cameraFar,
    );
    this.camera.position.set(0, 0, OFFICIAL_VIEWER_DEFAULTS.cameraZ);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#ffffff", 0);
    host.replaceChildren(this.renderer.domElement);
    this.controls = new TrackballControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.model = new THREE.Group();
    this.scene.add(this.model);
    this.hemisphereLight = new THREE.HemisphereLight(
      "#ffffff",
      "#ffffff",
      OFFICIAL_VIEWER_DEFAULTS.hemisphereLight * Math.PI,
    );
    this.hemisphereLight.position.set(0, 50, 0);
    this.scene.add(this.hemisphereLight);
    this.directionalLight = new THREE.DirectionalLight(
      "#ffffff",
      OFFICIAL_VIEWER_DEFAULTS.directionalLight * Math.PI,
    );
    this.directionalLight.position.set(-1, 1.75, 1).multiplyScalar(30);
    this.directionalLight.lookAt(0, 0, 0);
    this.directionalLight.castShadow = false;
    this.scene.add(this.directionalLight);
    this.paperMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", map: this.texture, roughness: 0.9, metalness: 0.5, side: THREE.FrontSide });
    // canvasB is the unprinted reverse side. The official material table does
    // not reuse canvasA here; doing so mirrored the complete net onto every
    // flap whose contour winding exposed its reverse face.
    this.backPaperMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", map: null, roughness: 0.9, metalness: 0.5, side: THREE.FrontSide });
    // Fold-line strips are the two half-caliper quads merged by the official
    // Plane renderer. They inherit the two face surfaces, but are double
    // sided because they are viewed edge-on. They must stay separate from the
    // corrugated cut-edge material.
    this.foldPaperMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", map: this.texture, roughness: 0.9, metalness: 0.5, side: THREE.DoubleSide });
    this.foldBackPaperMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", map: null, roughness: 0.9, metalness: 0.5, side: THREE.DoubleSide });
    this.calTextureCanvas = document.createElement("canvas");
    this.calTextureCanvas.width = OFFICIAL_CAL_TEXTURE_WIDTH;
    this.calTextureCanvas.height = OFFICIAL_CAL_TEXTURE_HEIGHT;
    this.calTextureContext = this.calTextureCanvas.getContext("2d");
    this.calAtlasImage = new Image();
    this.calAtlasImage.onload = () => {
      this.refreshEdgeTexture();
    };
    this.edgeTexture = this.configureEdgeTexture(new THREE.CanvasTexture(this.calTextureCanvas));
    this.edgeMaterial = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: this.edgeTexture,
      roughness: 0.9,
      metalness: 0.5,
      side: THREE.DoubleSide,
    });
    this.calAtlasImage.src = officialCalAtlasUrl;
    this.refreshEdgeTexture();

    rotationInput.addEventListener("input", () => this.setRotation(Number(rotationInput.value)));
    foldInput.addEventListener("input", () => this.setFoldProgress(Number(foldInput.value)));
    foldButton.addEventListener("click", () => this.setFoldProgress(this.foldProgress >= 0.5 ? 0 : 1));
    resetButton.addEventListener("click", () => this.resetView());
    paperColorInput.addEventListener("input", () => this.refreshTexture());
    light1Input?.addEventListener("input", () => this.setDirectionalLight(Number(light1Input.value) / 100));
    light2Input?.addEventListener("input", () => this.setHemisphereLight(Number(light2Input.value) / 100));
    for (const button of edgeTextureButtons) {
      const textureUrl = EDGE_TEXTURE_URLS[button.dataset.edgeTexture];
      if (textureUrl) button.style.setProperty("--edge-texture-image", `url("${textureUrl}")`);
      button.addEventListener("click", () => this.setEdgeTexture(button.dataset.edgeTexture));
    }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.setRotation(Number(rotationInput.value));
    this.setDirectionalLight(Number(light1Input?.value ?? 80) / 100);
    this.setHemisphereLight(Number(light2Input?.value ?? 70) / 100);
    this.updateFoldControls();
    this.refreshTexture();
    this.animate();
  }

  setGeometry(geometry) {
    try {
      this.topology = geometry ? createBoxTopology(geometry) : null;
      this.geometry = this.topology ? geometry : null;
    } catch {
      this.geometry = null;
      this.topology = null;
    }
    this.thickness = this.geometry ? Math.max(0.2, Number(this.geometry.parameters?.caliper) || 0.2) : 0;
    this.foldProgress = 1;
    this.foldInput.value = "1";
    this.updateFoldControls();
    this.rebuildModel();
  }

  setTextureCanvas(canvas) {
    this.textureCanvas = canvas;
    this.refreshTexture();
  }

  refreshTexture() {
    const source = this.textureCanvas;
    if (source) {
      this.compositeCanvas.width = source.width;
      this.compositeCanvas.height = source.height;
    }
    const context = this.compositeCanvas.getContext("2d");
    context.clearRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
    context.fillStyle = this.paperColorInput.value;
    context.fillRect(0, 0, this.compositeCanvas.width, this.compositeCanvas.height);
    if (source) context.drawImage(source, 0, 0);
    const previousTexture = this.texture;
    this.texture = this.configureArtworkTexture(new THREE.CanvasTexture(this.compositeCanvas));
    this.paperMaterial.map = this.texture;
    this.paperMaterial.needsUpdate = true;
    this.backPaperMaterial.map = null;
    this.backPaperMaterial.needsUpdate = true;
    this.foldPaperMaterial.map = this.texture;
    this.foldPaperMaterial.needsUpdate = true;
    this.foldBackPaperMaterial.map = null;
    this.foldBackPaperMaterial.needsUpdate = true;
    // The reverse side has no artwork, but it is still the selected paper
    // stock. Keeping it white made a correctly generated fold cap resemble
    // an open crack against kraft-coloured faces.
    this.backPaperMaterial.color.set(this.paperColorInput.value);
    this.foldBackPaperMaterial.color.set(this.paperColorInput.value);
    previousTexture.dispose();
    this.refreshEdgeTexture();
  }

  setEdgeTexture(type) {
    if (!EDGE_TEXTURE_URLS[type]) return;
    this.edgeTextureType = type;
    for (const button of this.edgeTextureButtons) {
      const isActive = button.dataset.edgeTexture === type;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
    this.refreshEdgeTexture();
  }

  configureEdgeTexture(texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    // Match the online CanvasTexture used for the cut-edge material. Linear
    // sampling keeps the embedded corrugated profile clean when zoomed.
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  configureArtworkTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    // Match the official LoadCanvasTexture path: do not generate a lower
    // resolution mip chain for the artwork canvas, because it makes close-up
    // dieline text and linework visibly softer than the online preview.
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  refreshEdgeTexture() {
    const type = this.edgeTextureType;
    const band = OFFICIAL_CAL_TEXTURE_BANDS[type];
    if (!band || !this.calTextureContext) return;
    this.calTextureContext.clearRect(0, 0, OFFICIAL_CAL_TEXTURE_WIDTH, OFFICIAL_CAL_TEXTURE_HEIGHT);
    if (this.calAtlasImage?.complete && this.calAtlasImage.naturalWidth > 0) {
      // This is the same crop-and-stretch operation as the official renderer:
      // drawImage(atlas, 0, band.start, atlas.width, band.height,
      //           0, 0, canvasCal.width, canvasCal.height).
      this.calTextureContext.drawImage(
        this.calAtlasImage,
        0,
        band.start,
        this.calAtlasImage.naturalWidth,
        band.end - band.start,
        0,
        0,
        OFFICIAL_CAL_TEXTURE_WIDTH,
        OFFICIAL_CAL_TEXTURE_HEIGHT,
      );
    } else {
      this.calTextureContext.fillStyle = this.paperColorInput.value;
      this.calTextureContext.fillRect(0, 0, OFFICIAL_CAL_TEXTURE_WIDTH, OFFICIAL_CAL_TEXTURE_HEIGHT);
    }
    this.edgeTexture.needsUpdate = true;
    this.edgeMaterial.map = this.edgeTexture;
    this.edgeMaterial.needsUpdate = true;
  }

  setRotation(value) {
    const degrees = Number(value) || 0;
    this.model.rotation.x = THREE.MathUtils.degToRad(OFFICIAL_VIEWER_DEFAULTS.modelPitch);
    this.model.rotation.y = (degrees * Math.PI) / 180;
    this.rotationInput.value = String(degrees);
    this.rotationValue.textContent = `${Math.round(degrees)}°`;
    this.centerModel();
  }

  setFoldProgress(value) {
    this.foldProgress = Math.min(1, Math.max(0, Number(value) || 0));
    this.foldInput.value = String(this.foldProgress);
    this.updateFoldControls();
    if (!this.topology) return;
    // The official slider keeps the meshes alive and only updates each
    // FoldLine group's quaternion. Rebuilding here caused camera jumps and a
    // visibly different drag response.
    this.updateFoldTransforms();
    this.centerModel();
  }

  setDirectionalLight(value) {
    // Modern physically-correct lights use PI-scaled values compared with
    // the legacy Three.js build used online.
    this.directionalLight.intensity = Math.max(0, Number(value) || 0) * Math.PI;
  }

  setHemisphereLight(value) {
    this.hemisphereLight.intensity = Math.max(0, Number(value) || 0) * Math.PI;
  }

  async downloadSnapshot(filename = "3D-view.png") {
    if (!this.topology || !this.model.children.length) {
      throw new RangeError("当前没有可保存的 3D 模型");
    }

    const gl = this.renderer.getContext();
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [4096, 4096];
    const limits = {
      maxWidth: Math.min(4096, maxTextureSize, Number(maxViewport[0]) || 4096),
      maxHeight: Math.min(4096, maxTextureSize, Number(maxViewport[1]) || 4096),
      maxScale: Number.POSITIVE_INFINITY,
    };
    const size = snapshotSizeFor(this.host.clientWidth, this.host.clientHeight, limits);
    const target = new THREE.WebGLRenderTarget(size.width, size.height, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;

    const previousTarget = this.renderer.getRenderTarget();
    const previousClearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = this.renderer.getClearAlpha();
    const pixels = new Uint8Array(size.width * size.height * 4);
    try {
      this.controls.update();
      this.renderer.setRenderTarget(target);
      this.renderer.setClearColor("#ffffff", 1);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.scene, this.camera);
      this.renderer.readRenderTargetPixels(target, 0, 0, size.width, size.height, pixels);
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      this.renderer.setClearColor(previousClearColor, previousClearAlpha);
      target.dispose();
    }

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    const imageData = context.createImageData(size.width, size.height);
    const stride = size.width * 4;
    for (let row = 0; row < size.height; row += 1) {
      const sourceStart = (size.height - row - 1) * stride;
      imageData.data.set(pixels.subarray(sourceStart, sourceStart + stride), row * stride);
    }
    context.putImageData(imageData, 0, 0);

    const blob = await canvasToPngBlob(canvas);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = String(filename || "3D-view.png");
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { filename: anchor.download, width: size.width, height: size.height };
  }

  updateFoldControls() {
    if (!this.foldInput || !this.foldValue || !this.foldButton) return;
    this.foldValue.textContent = `${Math.round(this.foldProgress * 100)}%`;
    this.foldButton.textContent = this.foldProgress >= 0.5 ? "展开刀模" : "折叠刀模";
  }

  clearModel() {
    this.model.traverse((child) => {
      child.geometry?.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (
            material !== this.paperMaterial &&
            material !== this.edgeMaterial &&
            material !== this.backPaperMaterial &&
            material !== this.foldPaperMaterial &&
            material !== this.foldBackPaperMaterial
          ) material.dispose();
        }
      }
    });
    this.model.clear();
    this.planeGroups = new Map();
    this.planeSpecs = new Map();
  }

  rebuildModel(resetView = true) {
    this.clearModel();
    if (!this.topology) return;
    const source = this.textureCanvas || this.compositeCanvas;
    const planeGroups = new Map();
    const planeSpecs = new Map();

    // Create every Plane first, then wire the official branching hierarchy.
    // The source piece order is front/right/back/left, while official ge.b
    // uses back(M0) as the root, so a one-pass parent lookup attaches children
    // to the model root before their real parent exists.
    for (const piece of this.topology.pieces) {
      const spec = officialPlaneSpec(piece, this.topology);
      planeGroups.set(piece.id, new THREE.Group());
      planeGroups.get(piece.id).name = `${piece.id}.group`;
      planeSpecs.set(piece.id, spec);
    }

    for (const piece of this.topology.pieces) {
      const spec = planeSpecs.get(piece.id);
      const parentGroup = spec.parentId ? planeGroups.get(spec.parentId) : null;
      const parentSpec = spec.parentId ? planeSpecs.get(spec.parentId) : null;
      const planeGroup = planeGroups.get(piece.id);
      if (spec.foldOrigin) {
        const position = spec.foldOrigin.clone();
        if (parentSpec?.foldOrigin) position.sub(parentSpec.foldOrigin);
        planeGroup.position.copy(position);
        const degrees = officialPhaseAngle(spec.phaseAngles, this.foldProgress, this.topology.maxAngleSteps);
        planeGroup.setRotationFromAxisAngle(spec.axis, THREE.MathUtils.degToRad(degrees));
      }
      (parentGroup || this.model).add(planeGroup);
    }
    this.planeGroups = planeGroups;
    this.planeSpecs = planeSpecs;

    for (const piece of this.topology.pieces) {
      const spec = planeSpecs.get(piece.id);
      const planeGroup = planeGroups.get(piece.id);
      const geometry = createOfficialPieceGeometry(
        piece,
        this.topology,
        this.topology.bounds,
        source,
        this.thickness,
      );
      if (spec.foldOrigin) {
        // drawOnePlane() translates the Plane mesh by -FoldLine.from before
        // it is inserted in the nested group. Keep the source coordinates and
        // this pivot translation separate from the group's rotation.
        geometry.translate(-spec.foldOrigin.x, -spec.foldOrigin.y, 0);
      }
      const mesh = new THREE.Mesh(geometry, [
        this.paperMaterial,
        this.edgeMaterial,
        this.backPaperMaterial,
        this.foldPaperMaterial,
        this.foldBackPaperMaterial,
      ]);
      mesh.name = piece.label;
      planeGroup.add(mesh);

      const edgeCorners = piece.netRect && !piece.netPoints?.length
        ? sourceRectCorners(piece.netRect).corners
        : (piece.sideNetPoints || piece.netPoints).map((point) => sourcePlanePoint(point));
      const edgeIndices = piece.sideNetPoints ? piece.sideExposedEdges : piece.exposedEdges;
      const holeEdgeCorners = (piece.holeNetPoints || []).map((hole) => (
        hole.map((point) => sourcePlanePoint(point))
      ));
      const edges = new THREE.LineSegments(
        edgesForCorners(edgeCorners, edgeIndices, holeEdgeCorners),
        new THREE.LineBasicMaterial({ color: "#8d755c", transparent: true, opacity: 0.45 }),
      );
      if (spec.foldOrigin) edges.position.set(-spec.foldOrigin.x, -spec.foldOrigin.y, 0);
      planeGroup.add(edges);
    }
    this.updateFoldTransforms();
    this.centerModel();
    if (resetView) this.resetView(false);
  }

  updateFoldTransforms() {
    for (const [pieceId, planeGroup] of this.planeGroups) {
      const spec = this.planeSpecs.get(pieceId);
      if (!spec?.foldOrigin) continue;
      const degrees = officialPhaseAngle(spec.phaseAngles, this.foldProgress, this.topology.maxAngleSteps);
      planeGroup.setRotationFromAxisAngle(spec.axis, THREE.MathUtils.degToRad(degrees));
    }
  }

  centerModel() {
    if (!this.topology || !this.model.children.length) return;
    // D3.autoCenter calls the equivalent Box3 operation after every official
    // render. Recenter only when a transform changes; the resulting pose is
    // identical without doing the same expensive bounds pass every frame.
    this.model.position.set(0, 0, 0);
    this.model.scale.setScalar(1);
    const bounds = new THREE.Box3().setFromObject(this.model);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    this.model.position.copy(center.multiplyScalar(-1));
    if (this.topology.autoFitCamera) {
      const size = bounds.getSize(new THREE.Vector3());
      const visibleHeight = 2 * OFFICIAL_VIEWER_DEFAULTS.cameraZ * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const visibleWidth = visibleHeight * Math.max(0.1, this.camera.aspect || 1);
      const fitFraction = Math.min(0.95, Math.max(0.5, Number(this.topology.cameraFitFraction) || 0.84));
      const scale = Math.min(
        1,
        (visibleWidth * fitFraction) / Math.max(1, size.x),
        (visibleHeight * fitFraction) / Math.max(1, size.y),
      );
      this.model.scale.setScalar(scale);
      this.model.position.multiplyScalar(scale);
    }
  }

  resetView(resetRotation = true) {
    if (!this.topology) return;
    if (resetRotation) this.setRotation(OFFICIAL_VIEWER_DEFAULTS.modelYaw);
    this.centerModel();
    this.camera.position.set(0, 0, OFFICIAL_VIEWER_DEFAULTS.cameraZ);
    this.camera.near = OFFICIAL_VIEWER_DEFAULTS.cameraNear;
    this.camera.far = OFFICIAL_VIEWER_DEFAULTS.cameraFar;
    this.controls.target.set(0, 0, 0);
    this.controls.reset();
    this.camera.position.set(0, 0, OFFICIAL_VIEWER_DEFAULTS.cameraZ);
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.controls.handleResize?.();
    if (this.topology?.autoFitCamera) this.centerModel();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.texture.dispose();
    this.edgeTexture.dispose();
    this.paperMaterial.dispose();
    this.backPaperMaterial.dispose();
    this.foldPaperMaterial.dispose();
    this.foldBackPaperMaterial.dispose();
    this.edgeMaterial.dispose();
  }
}
