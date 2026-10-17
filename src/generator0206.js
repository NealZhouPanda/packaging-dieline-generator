import { pointBounds } from "./svg.js";

const round = (value) => Math.round(value * 1000) / 1000;

/** Packmage 0206, CHOOSE=3 (dieline dimensions), round clearance slots.
 * The long flaps fully overlap. Short flaps are L/2, not W/2.
 * Public GetBoxData calibration fixtures are kept independently in reference/0206.
 */
export function generate0206({ length, width, depth, caliper, paperType = "corrugated" }) {
  const values = { length, width, depth, caliper };
  const ranges = { length: [50, 2000], width: [50, 1200], depth: [50, 1500], caliper: paperType === "white-card" ? [0.4, 0.8] : [1.5, 5] };
  for (const [name, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(values[name]) || values[name] < min || values[name] > max) {
      throw new RangeError(`0206 ${name} 必须在 ${min}–${max} mm 范围内`);
    }
  }

  const r = caliper / 2;
  const highLow = 2 * caliper;
  const backHighLow = caliper;
  const bodyHeight = depth - 4 * caliper;
  const correctedWidth = round(width - Math.min(3, 2 * caliper / 3));
  const glue = Math.min(30, Math.floor(width / 4));
  const glueBevel = Math.round(glue * Math.tan(Math.PI / 12) * 100) / 100;
  const shortFlap = length / 2;
  const backFlap = width - caliper;
  const backX = -width - length;
  const endX = length + correctedWidth;
  const elements = [];
  const line = (type, x1, y1, x2, y2) => elements.push([0, type, x1, y1, x2, y2]);
  const arc = (cx, cy, start, end) => elements.push([1, 0, cx, cy, r, start, end]);

  // Long walls own the rounded shoulders between the minor and major scores.
  function longPanel(x1, x2, offset, flapLength) {
    line(1, x1, 0, x1, bodyHeight);
    line(1, x2, 0, x2, bodyHeight);
    line(1, x1 + r, -offset, x2 - r, -offset);
    arc(x1, -r, 270, 0);
    line(0, x1 + r, -r, x1 + r, -offset);
    arc(x2, -r, 180, 270);
    line(0, x2 - r, -r, x2 - r, -offset);
    line(1, x1 + r, bodyHeight + offset, x2 - r, bodyHeight + offset);
    arc(x1, bodyHeight + r, 0, 90);
    line(0, x1 + r, bodyHeight + r, x1 + r, bodyHeight + offset);
    arc(x2, bodyHeight + r, 90, 180);
    line(0, x2 - r, bodyHeight + r, x2 - r, bodyHeight + offset);
    line(0, x1 + r, -offset, x1 + r, -offset - flapLength);
    line(0, x2 - r, -offset, x2 - r, -offset - flapLength);
    line(0, x1 + r, -offset - flapLength, x2 - r, -offset - flapLength);
    line(0, x1 + r, bodyHeight + offset, x1 + r, bodyHeight + offset + flapLength);
    line(0, x2 - r, bodyHeight + offset, x2 - r, bodyHeight + offset + flapLength);
    line(0, x1 + r, bodyHeight + offset + flapLength, x2 - r, bodyHeight + offset + flapLength);
  }
  longPanel(0, length, highLow, width);
  longPanel(backX, -width, backHighLow, backFlap);

  function shortPanel(x1, x2, finalPanel = false) {
    if (finalPanel) line(0, x2, 0, x2, bodyHeight);
    line(1, x1, 0, x2, 0);
    line(1, x1, bodyHeight, x2, bodyHeight);
    arc(x1, -r, 270, 0);
    line(0, x1 + r, -r, x1 + r, -shortFlap);
    arc(x2, -r, 180, 270);
    line(0, x2 - r, -r, x2 - r, -shortFlap);
    line(0, x1 + r, -shortFlap, x2 - r, -shortFlap);
    arc(x1, bodyHeight + r, 0, 90);
    line(0, x1 + r, bodyHeight + r, x1 + r, bodyHeight + shortFlap);
    arc(x2, bodyHeight + r, 90, 180);
    line(0, x2 - r, bodyHeight + r, x2 - r, bodyHeight + shortFlap);
    line(0, x1 + r, bodyHeight + shortFlap, x2 - r, bodyHeight + shortFlap);
  }
  shortPanel(-width, 0);
  shortPanel(length, endX, true);
  elements.push([2, 0, backX, 0, backX - glue, glueBevel, backX - glue, bodyHeight - glueBevel, backX, bodyHeight]);

  const bounds = pointBounds(elements);
  const blankWidth = round(bounds.maxX - bounds.minX);
  const blankHeight = round(bounds.maxY - bounds.minY);
  const pathLength = (element) => {
    if (element[0] === 1) return r * (((element[6] - element[5]) % 360 + 360) % 360) * Math.PI / 180;
    let total = 0;
    for (let i = 4; i < element.length; i += 2) total += Math.hypot(element[i] - element[i - 2], element[i + 1] - element[i - 1]);
    return total;
  };
  return {
    parameters: { boxType: "0206", length, width, depth, caliper, paperType },
    elements,
    meta: {
      boxId: "0206", width: blankWidth, height: blankHeight, area: round(blankWidth * blankHeight),
      solidLength: round(elements.filter((e) => e[1] === 0).reduce((sum, e) => sum + pathLength(e), 0)),
      foldLength: round(elements.filter((e) => e[1] === 1).reduce((sum, e) => sum + pathLength(e), 0)),
    },
    compensation: { radius: r, highLow, backHighLow, bodyHeight, correctedWidth, glue, glueBevel, shortFlap, backFlap },
  };
}
