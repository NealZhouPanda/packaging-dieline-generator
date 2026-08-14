/**
 * 开口方向 → 长宽高数据重排。
 * 开口面 = L×W 所在面（摇盖所在面），D 垂直于开口面。
 * 大面开口：D = 最小值；中面开口：D = 中间值；小面开口：D = 最大值。
 * L/W 取开口面的两条边，并保证 L ≥ W（结构约束要求 W ≤ L−2）。
 */
export const FACES = Object.freeze(["big", "mid", "small"]);

export function remapDimensions({ length, width, depth }, face) {
  const sorted = [length, width, depth].sort((a, b) => a - b);
  const [min, mid, max] = sorted;
  switch (face) {
    case "big":
      return { length: max, width: mid, depth: min };
    case "mid":
      return { length: max, width: min, depth: mid };
    case "small":
      return { length: mid, width: min, depth: max };
    default:
      throw new RangeError(`未知开口面: ${face}`);
  }
}

/** 根据当前数值推断开口面（用于初始状态）。 */
export function detectFace({ length, width, depth }) {
  const sorted = [length, width, depth].sort((a, b) => a - b);
  if (depth === sorted[0]) return "big";
  if (depth === sorted[2]) return "small";
  return "mid";
}
