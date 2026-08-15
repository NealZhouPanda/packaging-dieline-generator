const POINT_TOLERANCE = 0.01;
const key = (x, y) => `${Math.round(x / POINT_TOLERANCE)}:${Math.round(y / POINT_TOLERANCE)}`;

function endpoints(element) {
  if (element[0] === 0) {
    return { start: [element[2], element[3]], end: [element[4], element[5]] };
  }
  if (element[0] === 1) {
    const [, , cx, cy, r, start, end] = element;
    const rad = (d) => (d * Math.PI) / 180;
    return {
      start: [cx + r * Math.cos(rad(start)), cy + r * Math.sin(rad(start))],
      end: [cx + r * Math.cos(rad(end)), cy + r * Math.sin(rad(end))],
    };
  }
  throw new TypeError(`Unsupported element type: ${element[0]}`);
}

/** 把圆弧细分为折线点列（含首尾），用于面积积分。 */
function arcPoints(element, steps = 16) {
  const [, , cx, cy, r, start, end] = element;
  const span = (((end - start) % 360) + 360) % 360;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = ((start + (span * i) / steps) * Math.PI) / 180;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return points;
}

/**
 * 将 0202A 的刀线按端点串成闭合轮廓，返回净面积（mm²）。
 * 0421/K016A 的几何包含多段面板辅助线和二次曲线，当前没有完整 NetArea 数据，页面会明确显示暂不支持。
 */
export function netArea(elements) {
  const cuts = elements.filter((element) => element[1] === 0);
  const unused = new Set(cuts.map((_, index) => index));
  const adjacent = new Map();
  cuts.forEach((element, index) => {
    const { start, end } = endpoints(element);
    for (const pointKey of [key(...start), key(...end)]) {
      const bucket = adjacent.get(pointKey) ?? [];
      bucket.push(index);
      adjacent.set(pointKey, bucket);
    }
  });

  const chain = [{ index: 0, reversed: false }];
  unused.delete(0);
  const takeNext = (pointKey) => {
    for (const index of adjacent.get(pointKey) ?? []) {
      if (!unused.has(index)) continue;
      unused.delete(index);
      const { start } = endpoints(cuts[index]);
      return { index, reversed: key(...start) !== pointKey };
    }
    return null;
  };

  let tail = endpoints(cuts[0]).end;
  while (unused.size > 0) {
    const next = takeNext(key(...tail));
    if (!next) break;
    chain.push(next);
    const { start, end } = endpoints(cuts[next.index]);
    tail = next.reversed ? start : end;
  }
  let head = endpoints(cuts[0]).start;
  while (unused.size > 0) {
    const next = takeNext(key(...head));
    if (!next) break;
    chain.unshift(next);
    const { start, end } = endpoints(cuts[next.index]);
    head = next.reversed ? start : end;
  }
  if (unused.size > 0) {
    throw new Error(`刀线轮廓未闭合：${unused.size} 段未能串联`);
  }
  if (key(...head) !== key(...tail)) {
    throw new Error("刀线轮廓首尾不相接");
  }

  const polygon = [];
  for (const { index, reversed } of chain) {
    const element = cuts[index];
    let points = element[0] === 0 ? [endpoints(element).start] : arcPoints(element).slice(0, -1);
    if (reversed) {
      points = element[0] === 0 ? [endpoints(element).end] : arcPoints(element).slice(1).reverse();
    }
    polygon.push(...points);
  }

  let twice = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/** 当前只有 0202A 的刀线数据具备可验证的净面积闭合轮廓。 */
export function supportsNetArea(boxType) {
  return boxType === "0202A";
}

/**
 * 输入值和导出几何统一按刀模尺寸处理。
 * 这个旧函数保留给历史调用，不参与当前 PDF 或抛重计算。
 */
export function dieSize({ length, width, depth, caliper }) {
  const half = caliper / 2;
  return {
    length: length + half,
    width: width + half,
    depth: depth + half,
  };
}

/** 返回导出文件使用的刀模尺寸，不做任何内外尺寸换算。 */
export function dielineSize({ length, width, depth }) {
  return { length, width, depth };
}

/**
 * 从刀模尺寸估算箱体外尺寸。
 * 该换算只用于抛重和三边和，不能回写到刀模几何或导出文件。
 */
export function outerSizeFromDieline({ length, width, depth, caliper, boxType }) {
  const isE005C = boxType === "E005C" || boxType === "0427";
  const lengthOffset = isE005C ? (2 * caliper) / 3 : 2 * caliper;
  const widthOffset = isE005C ? (5 * caliper) / 3 : 2 * caliper;
  const depthOffset = isE005C ? (2 * caliper) / 3 : caliper;
  return {
    length: length + lengthOffset,
    width: width + widthOffset,
    depth: depth + depthOffset,
  };
}

/** 兼容历史调用名；当前语义是“由刀模尺寸估算外尺寸”。 */
export function outerSize(parameters) {
  return outerSizeFromDieline(parameters);
}

/** 四侧面高度：高位 / 低位，差距 2×纸厚。 */
export function sideHeights({ depth, caliper }) {
  const dieDepth = depth + caliper / 2;
  return { high: dieDepth + caliper, low: dieDepth - caliper };
}

/** 抛重按外尺寸估算，单位 kg。 */
export function volumetricWeightKg(parameters, ratio) {
  const outer = outerSizeFromDieline(parameters);
  const cm = [outer.length, outer.width, outer.depth].map((mm) => mm / 10);
  return (cm[0] * cm[1] * cm[2]) / ratio;
}

/** 三边和按外尺寸，单位 cm。 */
export function sideSumCm(parameters) {
  const outer = outerSizeFromDieline(parameters);
  return (outer.length + outer.width + outer.depth) / 10;
}

export function blanksPerSheet(blankWidth, blankHeight, maxW, maxL) {
  const normal = Math.floor(maxW / blankWidth) * Math.floor(maxL / blankHeight);
  const rotated = Math.floor(maxW / blankHeight) * Math.floor(maxL / blankWidth);
  return Math.max(normal, rotated);
}
