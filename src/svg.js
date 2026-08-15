const degToRad = (degrees) => (degrees * Math.PI) / 180;
const clean = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

function arcPoint(cx, cy, radius, degrees) {
  const angle = degToRad(degrees);
  return [clean(cx + radius * Math.cos(angle)), clean(cy + radius * Math.sin(angle))];
}

function pathFor(element) {
  const [type] = element;
  if (type === 0) {
    const [, , x1, y1, x2, y2] = element;
    return `M ${clean(x1)} ${clean(y1)} L ${clean(x2)} ${clean(y2)}`;
  }
  if (type === 1) {
    const [, , cx, cy, radius, start, end] = element;
    const [x1, y1] = arcPoint(cx, cy, radius, start);
    const [x2, y2] = arcPoint(cx, cy, radius, end);
    const delta = ((end - start) % 360 + 360) % 360;
    return `M ${x1} ${y1} A ${clean(radius)} ${clean(radius)} 0 ${delta > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  }
  if (type === 2) {
    if (element.length === 8) {
      const [, , x1, y1, cx, cy, x2, y2] = element;
      return `M ${clean(x1)} ${clean(y1)} Q ${clean(cx)} ${clean(cy)} ${clean(x2)} ${clean(y2)}`;
    }
    const [, , x1, y1, cx1, cy1, cx2, cy2, x2, y2] = element;
    return `M ${clean(x1)} ${clean(y1)} C ${clean(cx1)} ${clean(cy1)} ${clean(cx2)} ${clean(cy2)} ${clean(x2)} ${clean(y2)}`;
  }
  throw new TypeError(`Unsupported geometry element type: ${type}`);
}

function lineKey(element) {
  const [, , x1, y1, x2, y2] = element;
  const a = `${clean(x1)},${clean(y1)}`;
  const b = `${clean(x2)},${clean(y2)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 压痕线若正反画两遍，虚线相位互补会叠成实线。只保留第一条。 */
export function dedupeFoldLines(elements) {
  const seen = new Set();
  return elements.filter((element) => {
    if (element[0] !== 0 || element[1] !== 1) return true;
    const key = lineKey(element);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function pointBounds(elements) {
  const points = [];
  for (const element of elements) {
    if (element[0] === 0) points.push([element[2], element[3]], [element[4], element[5]]);
    if (element[0] === 1) {
      const [, , cx, cy, r, start, end] = element;
      points.push(arcPoint(cx, cy, r, start), arcPoint(cx, cy, r, end));
      const span = (((end - start) % 360) + 360) % 360;
      for (const deg of [0, 90, 180, 270]) {
        const delta = ((deg - start) % 360 + 360) % 360;
        if (delta <= span) points.push(arcPoint(cx, cy, r, deg));
      }
    }
    if (element[0] === 2) {
      for (let index = 2; index < element.length; index += 2) points.push([element[index], element[index + 1]]);
    }
  }
  return {
    minX: Math.min(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxX: Math.max(...points.map(([x]) => x)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
}

const PROOF_NOTE = "注意：首次投产前先打样核对。";
const NOTE_STRIP_MM = 12; // 画布底部为注意事项预留的条带（几何本身保持 1:1 mm 不变）

export function geometryToSvg(geometry, { withNote = false } = {}) {
  const { elements, meta, parameters } = geometry;
  const bounds = pointBounds(elements);
  const drawn = dedupeFoldLines(elements);

  const epsilon = 1e-6;
  const canvasContainsGeometry =
    bounds.maxX - bounds.minX <= meta.width + epsilon &&
    bounds.maxY - bounds.minY <= meta.height + epsilon &&
    meta.width > 0 &&
    meta.height > 0;
  if (!canvasContainsGeometry) {
    throw new RangeError("canvas does not contain geometry：声明画布无法容纳全部刀模坐标，已拒绝导出");
  }
  const paths = drawn
    .map((element) => {
      const className = element[1] === 1 ? "fold" : "cut";
      return `  <path class="${className}" d="${pathFor(element)}" vector-effect="non-scaling-stroke" />`;
    })
    .join("\n");

  // 默认导出纯净刀模（页面预览同版）；withNote 时底部加注意事项条带（下载用）
  const viewHeight = clean(meta.height + (withNote ? NOTE_STRIP_MM : 0));
  const noteLine = withNote
    ? `  <text class="note" x="${clean(bounds.minX + 2)}" y="${clean(bounds.maxY + 8)}">${PROOF_NOTE}</text>\n`
    : "";
  const noteComment = withNote ? `<!-- ${PROOF_NOTE} -->\n` : "";
  const noteStyle = withNote ? "\n  .note { fill: #888; font-size: 5px; font-family: sans-serif; }" : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
${noteComment}<svg xmlns="http://www.w3.org/2000/svg" width="${clean(meta.width)}mm" height="${viewHeight}mm" viewBox="${clean(bounds.minX)} ${clean(bounds.minY)} ${clean(meta.width)} ${viewHeight}" data-box-id="${meta.boxId}" data-length="${parameters.length}" data-width="${parameters.width}" data-depth="${parameters.depth}" data-caliper="${parameters.caliper}" data-blank-height="${clean(meta.height)}">
<style>
  .cut { fill: none; stroke: #005cff; stroke-width: 0.25; }
  .fold { fill: none; stroke: #ff2d2d; stroke-width: 0.25; stroke-dasharray: 4 2; }${noteStyle}
</style>
${noteLine}${paths}
</svg>\n`;
}
