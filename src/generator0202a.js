import baseCalibration from "../reference/0202a-calibration/default-L350-W190-D230-CAL3.json";
import lengthCalibration from "../reference/0202a-calibration/L351-W190-D230-CAL3.json";
import widthCalibration from "../reference/0202a-calibration/L350-W191-D230-CAL3.json";
import depthCalibration from "../reference/0202a-calibration/L350-W190-D231-CAL3.json";
import caliperCalibration from "../reference/0202a-calibration/L350-W190-D230-CAL4.json";

const ORIGIN = Object.freeze({ length: 350, width: 190, depth: 230, caliper: 3 });
const base = baseCalibration;
const axes = [
  lengthCalibration,
  widthCalibration,
  depthCalibration,
  caliperCalibration,
];

function validateDimension(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name}必须是大于 0 的有效数字`);
  }
}

/**
 * 已验证范围：0202A 在此包络内的本地校准结果逐坐标一致。
 * 边界来自结构样本的实测映射，不是估计：
 * - W≥120：W<120 时粘口宽度切换为 W/4 缩放规则；
 * - W≤L−2：W>L−2 时摇盖切换防碰撞规则（2F>L 时 F=L/2）；
 * - CAL≤5：CAL≥8 时高低位补偿切换规则（双瓦楞未验证）。
 */
const VERIFIED_RANGE = Object.freeze({
  length: [200, 2000],
  width: [120, 1200],
  depth: [50, 1500],
  caliper: [1.5, 5],
});

function validateVerifiedRange({ length, width, depth, caliper }) {
  const labels = { length: "长 L", width: "宽 W", depth: "高 D", caliper: "纸厚" };
  const values = { length, width, depth, caliper };
  for (const [key, [min, max]] of Object.entries(VERIFIED_RANGE)) {
    if (values[key] < min || values[key] > max) {
      throw new RangeError(`${labels[key]}超出已验证范围（${min}–${max} mm），该尺寸尚未校准，不能生成刀模`);
    }
  }
  if (width > length - 2) {
    throw new RangeError("宽 W 必须比长 L 小 2mm 以上：接近正方形时摇盖结构会切换规则，尚未校准");
  }
}

function interpolateNumber(baseValue, axisValues, deltas) {
  return baseValue + axisValues.reduce(
    (sum, axisValue, index) => sum + deltas[index] * (axisValue - baseValue),
    0,
  );
}

function interpolateElement(element, index, deltas) {
  return element.map((value, fieldIndex) => {
    if (typeof value !== "number") return value;
    const axisValues = axes.map((axis) => axis.elements[index][fieldIndex]);
    const result = interpolateNumber(value, axisValues, deltas);
    const rounded = Math.round(result * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
  });
}

/**
 * 将基础曲线粘口替换为生产验证过的梯形粘口。
 * 生产版是三条直线：
 * 上斜边（G×tan15° 收分）→ 直外边 → 下斜边。贝塞尔的控制点恰好是梯形角点。
 */
function straightenGlueFlap(elements) {
  const index = elements.findIndex((element) => element[0] === 2);
  if (index === -1) return elements;
  const [, kind, x1, y1, cx1, cy1, cx2, cy2, x2, y2] = elements[index];
  const trapezoid = [
    [0, kind, x1, y1, cx1, cy1],
    [0, kind, cx1, cy1, cx2, cy2],
    [0, kind, cx2, cy2, x2, y2],
  ];
  return [...elements.slice(0, index), ...trapezoid, ...elements.slice(index + 1)];
}

/**
 * 槽底结构使用生产样本验证过的样式。
 * 参考样本：槽宽 5mm，立刀在距折线 2.5mm 处收，两个 R2.5 四分之一弧
 * 向下收拢并在折线正中心相遇——槽底贴折线，弧切进摇盖角，不凸起。
 */
const SLOT_RELIEF_RADIUS = 2.5;
const SLOT_SPECS = [
  { arcs: [35, 15], lines: [36, 16] }, // 顶边槽，居中
  { arcs: [17, 45], lines: [18, 46] }, // 顶边槽，右
  { arcs: [26, 37], lines: [27, 38] }, // 顶边槽，左（粘口侧）
  { arcs: [20, 40], lines: [21, 41] }, // 底边槽，居中
  { arcs: [22, 49], lines: [23, 50] }, // 底边槽，右
  { arcs: [31, 42], lines: [32, 43] }, // 底边槽，左（粘口侧）
];

function adjustSlotFloors(elements) {
  const result = elements.map((element) => [...element]);
  for (const { arcs, lines } of SLOT_SPECS) {
    const leftLine = result[lines[0]];
    const rightLine = result[lines[1]];
    const center = (leftLine[2] + rightLine[2]) / 2;
    const foldY = leftLine[3]; // 折线侧 y
    const edgeY = leftLine[5]; // 坯料边缘侧 y
    const dir = Math.sign(edgeY - foldY); // 顶槽为负，底槽为正
    const r = SLOT_RELIEF_RADIUS;
    const floorY = foldY + r * dir; // 立刀收刀位置

    // 槽宽 6→5mm：槽两侧摇盖边及相连横边的 x 端点同步内收 0.5mm
    const oldLeftX = leftLine[2];
    const oldRightX = rightLine[2];
    for (const element of result) {
      if (element[0] !== 0 || element[1] !== 0) continue;
      for (const field of [2, 4]) {
        if (Math.abs(element[field] - oldLeftX) < 0.001) element[field] = center - r;
        else if (Math.abs(element[field] - oldRightX) < 0.001) element[field] = center + r;
      }
    }

    result[lines[0]] = [0, leftLine[1], center - r, floorY, center - r, edgeY];
    result[lines[1]] = [0, rightLine[1], center + r, floorY, center + r, edgeY];
    // 左弧：立刀底 → 折线中心；右弧：折线中心 → 右立刀底。
    // 角度必须按 start<end 存储（转换器按递增角渲染）；谷底朝折线。
    const [leftStart, leftEnd, rightStart, rightEnd] =
      dir < 0 ? [90, 180, 0, 90] : [180, 270, 270, 0];
    result[arcs[0]] = [1, 0, center, floorY, r, leftStart, leftEnd];
    result[arcs[1]] = [1, 0, center, floorY, r, rightStart, rightEnd];
  }
  return result;
}

/**
 * Generate 0202A geometry locally.
 *
 * Element encoding used by the local calibration snapshots:
 * [0, kind, x1, y1, x2, y2]                  line
 * [1, kind, cx, cy, radius, start, end]       circular arc (degrees)
 * kind: 0 = cut, 1 = fold.
 * The glue flap is a trapezoid calibrated against the 2021 production PDF.
 */
export function generate0202A({ length, width, depth, caliper }) {
  validateDimension("length", length);
  validateDimension("width", width);
  validateDimension("depth", depth);
  validateDimension("caliper", caliper);
  validateVerifiedRange({ length, width, depth, caliper });

  const deltas = [
    length - ORIGIN.length,
    width - ORIGIN.width,
    depth - ORIGIN.depth,
    caliper - ORIGIN.caliper,
  ];
  const interpolated = base.elements.map((element, index) => interpolateElement(element, index, deltas));
  const elements = adjustSlotFloors(straightenGlueFlap(interpolated));

  const metaValue = (key) =>
    interpolateNumber(
      base.meta[key],
      axes.map((axis) => axis.meta[key]),
      deltas,
    );

  const meta = {
    boxId: "0202A",
    width: metaValue("width"),
    height: metaValue("height"),
    solidLength: metaValue("solidLength"),
    foldLength: metaValue("foldLength"),
  };
  meta.area = meta.width * meta.height;

  // 随纸厚联动的补偿变量（关系已由 CAL 1.5–5.0 的官方样本逐坐标验证）
  const compensation = {
    of: caliper, // 高低位补偿 = 纸厚
    of1: caliper,
    l1: length, // 补偿后长
    w1: width - caliper, // 补偿后宽 = W − 纸厚
    f: (width + 2) / 2, // 摇盖长
    f1: (width + 2) / 2,
    g: 30, // 粘口宽
    t: 15, // 粘口收分角度
    r: 3, // 圆角半径
  };

  return {
    parameters: { length, width, depth, caliper },
    elements,
    meta,
    compensation,
  };
}
