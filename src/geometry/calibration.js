import { roundMm } from "./core.js";

/**
 * Pick the calibration sample set closest to the requested dimensions
 * using the normalized L1 distance across L/W/D/caliper.
 */
export function pickClosestSampleSet(sets, { length, width, depth, caliper }) {
  let selected = sets[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of sets) {
    const score =
      Math.abs(length - candidate.base.length) / Math.max(1, candidate.base.length) +
      Math.abs(width - candidate.base.width) / Math.max(1, candidate.base.width) +
      Math.abs(depth - candidate.base.depth) / Math.max(1, candidate.base.depth) +
      Math.abs(caliper - candidate.base.caliper) / 5;
    if (score < bestScore) {
      bestScore = score;
      selected = candidate;
    }
  }
  return selected;
}

/**
 * First-order multi-axis linear interpolation around a calibration origin.
 */
export function interpolateLinear(baseValue, axisValues, deltas, steps = null) {
  let total = baseValue;
  for (let index = 0; index < axisValues.length; index += 1) {
    const step = steps ? steps[index] : 1;
    total += (deltas[index] / step) * (axisValues[index] - baseValue);
  }
  return total;
}

/**
 * Interpolate an array of geometry elements from a base sample and per-axis
 * perturbation variants. Preserves non-numeric fields and optional prefix slots.
 */
export function interpolateElementsByVariants(
  baseElements,
  variantElementLists,
  deltas,
  { steps = null, skipPrefix = 0, round = roundMm } = {},
) {
  return baseElements.map((element, elementIndex) =>
    element.map((value, fieldIndex) => {
      if (fieldIndex < skipPrefix || typeof value !== "number") return value;
      const axisValues = variantElementLists.map((list) => list[elementIndex][fieldIndex]);
      const interpolated = interpolateLinear(value, axisValues, deltas, steps);
      return round ? round(interpolated) : interpolated;
    }),
  );
}

/**
 * Piecewise linear interpolation/extrapolation along sorted caliper samples.
 */
export function interpolatePiecewiseCaliper(baseValue, samples, caliper, baseCaliper) {
  const points = [{ caliper: baseCaliper, value: baseValue }, ...samples].sort(
    (left, right) => left.caliper - right.caliper,
  );
  if (caliper <= points[0].caliper) {
    return (
      points[0].value +
      ((caliper - points[0].caliper) / (points[1].caliper - points[0].caliper)) *
        (points[1].value - points[0].value)
    );
  }
  if (caliper >= points.at(-1).caliper) {
    const lower = points.at(-2);
    const upper = points.at(-1);
    return (
      lower.value +
      ((caliper - lower.caliper) / (upper.caliper - lower.caliper)) * (upper.value - lower.value)
    );
  }
  for (let index = 1; index < points.length; index += 1) {
    if (caliper <= points[index].caliper) {
      const lower = points[index - 1];
      const upper = points[index];
      return (
        lower.value +
        ((caliper - lower.caliper) / (upper.caliper - lower.caliper)) * (upper.value - lower.value)
      );
    }
  }
  return points.at(-1).value;
}
