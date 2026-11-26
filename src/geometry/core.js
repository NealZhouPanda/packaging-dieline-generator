import { pointBounds } from "../svg.js";

export const DEFAULT_DIMENSION_RANGES = Object.freeze({
  length: Object.freeze([50, 2000]),
  width: Object.freeze([50, 1200]),
  depth: Object.freeze([50, 1500]),
});

export const DIMENSION_LABELS = Object.freeze({
  length: "长 L",
  width: "宽 W",
  depth: "高 D",
  caliper: "纸厚",
});

export function roundMm(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function validatePositiveFinite(name, value, message) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(message || `${name}必须是大于 0 的有效数字`);
  }
}

export function validateStandardParameters(
  { length, width, depth, caliper, paperType = "corrugated" },
  {
    ranges = DEFAULT_DIMENSION_RANGES,
    caliperRange,
    whiteCard = false,
    whiteCardMax = 1,
    corrugatedRange = [1.5, 5],
  } = {},
) {
  validatePositiveFinite("length", length);
  validatePositiveFinite("width", width);
  validatePositiveFinite("depth", depth);
  validatePositiveFinite("caliper", caliper);

  const values = { length, width, depth };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (values[key] < min || values[key] > max) {
      throw new RangeError(
        `${DIMENSION_LABELS[key]}超出已验证范围（${min}–${max} mm），该尺寸尚未校准，不能生成刀模`,
      );
    }
  }

  const effectiveCaliperRange =
    caliperRange ||
    (whiteCard && paperType === "white-card" ? [0.4, whiteCardMax] : corrugatedRange);
  if (caliper < effectiveCaliperRange[0] || caliper > effectiveCaliperRange[1]) {
    throw new RangeError(
      `纸厚超出已验证范围（${effectiveCaliperRange[0]}–${effectiveCaliperRange[1]} mm），该尺寸尚未校准，不能生成刀模`,
    );
  }
}

export function elementLength(element) {
  if (element[0] === 0) {
    return Math.hypot(element[4] - element[2], element[5] - element[3]);
  }
  if (element[0] === 1) {
    const span = (((element[6] - element[5]) % 360) + 360) % 360;
    return (element[4] * span * Math.PI) / 180;
  }
  if (element[0] === 2) {
    let total = 0;
    for (let index = 4; index < element.length; index += 2) {
      total += Math.hypot(element[index] - element[index - 2], element[index + 1] - element[index - 1]);
    }
    return total;
  }
  return 0;
}

export function buildGeometryMeta(boxId, elements) {
  const bounds = pointBounds(elements);
  const width = roundMm(bounds.maxX - bounds.minX);
  const height = roundMm(bounds.maxY - bounds.minY);
  let solidLength = 0;
  let foldLength = 0;
  for (const element of elements) {
    if (element[1] === 0) solidLength += elementLength(element);
    else if (element[1] === 1) foldLength += elementLength(element);
  }
  return {
    boxId,
    width,
    height,
    solidLength: roundMm(solidLength),
    foldLength: roundMm(foldLength),
    area: roundMm(width * height),
  };
}
