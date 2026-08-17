import { describe, expect, it } from "vitest";
import { generate0202A } from "../src/generator0202a.js";

const cases = [
  [350, 190, 230, 3, "default-L350-W190-D230-CAL3.json"],
  [351, 190, 230, 3, "L351-W190-D230-CAL3.json"],
  [350, 191, 230, 3, "L350-W191-D230-CAL3.json"],
  [350, 190, 231, 3, "L350-W190-D231-CAL3.json"],
  [350, 190, 230, 4, "L350-W190-D230-CAL4.json"],
  [405, 299, 650, 3, "L405-W299-D650-CAL3.json"],
  [405, 299, 660, 3, "L405-W299-D660-CAL3.json"],
  [445, 299, 680, 3, "L445-W299-D680-CAL3.json"],
  [350, 190, 230, 1.5, "L350-W190-D230-CAL1.5.json"],
  [350, 190, 230, 4.75, "L350-W190-D230-CAL4.75.json"],
  [350, 190, 50, 3, "L350-W190-D50-CAL3.json"],
  [1000, 600, 500, 5, "L1000-W600-D500-CAL5.json"],
  [2000, 1200, 1500, 3, "L2000-W1200-D1500-CAL3.json"],
];

async function loadCalibration(name) {
  const url = new URL(`../reference/0202a-calibration/${name}`, import.meta.url);
  return import(url, { with: { type: "json" } }).then((module) => module.default);
}

describe("0202A geometry", () => {
  for (const [length, width, depth, caliper, calibrationFile] of cases) {
    it(`matches local calibration for ${length}×${width}×${depth}, ${caliper}mm`, async () => {
      const expected = await loadCalibration(calibrationFile);
      const actual = generate0202A({ length, width, depth, caliper });

      expect(actual.meta.width).toBe(expected.meta.width);
      expect(actual.meta.height).toBe(expected.meta.height);
      // 刀线/压线总长为展示用元数据（粘口已由曲线改为直线），容差 0.5mm
      expect(actual.meta.solidLength).toBeCloseTo(expected.meta.solidLength, 0);
      expect(actual.meta.foldLength).toBeCloseTo(expected.meta.foldLength, 0);
      // 直线类对象与本地校准快照逐坐标一致（槽底弧+槽立刀与粘口刻意偏离，见下）
      const SLOT_INDICES = new Set([
        15, 17, 20, 22, 26, 31, 35, 37, 40, 42, 45, 49, // 槽底弧
        16, 18, 21, 23, 27, 32, 36, 38, 41, 43, 46, 50, // 槽立刀
        19, 24, 29, 34, 39, 44, 48, 52, // 摇盖横边（槽宽 6→5 端点内收 0.5）
      ]);
      actual.elements.slice(0, 53).forEach((element, index) => {
        if (SLOT_INDICES.has(index)) return;
        expect(element, `element ${index}`).toEqual(expected.elements[index]);
      });
      // 槽底：R2.5 弧在折线中心相遇（生产样式），不再是在线版的 R3 凸起弧
      for (const index of [15, 17, 20, 22, 26, 31, 35, 37, 40, 42, 45, 49]) {
        const arc = actual.elements[index];
        expect(arc[0]).toBe(1);
        expect(arc[4]).toBe(2.5);
        // 每段弧必须是 90° 四分之一弧（防止角度倒序被渲染成大弧/圆圈）
        expect(((arc[6] - arc[5]) % 360 + 360) % 360).toBe(90);
      }
      // 补偿变量与本地校准数据逐项一致（r 除外：槽底弧按生产件改为 2.5）
      const ce = expected.compensation;
      for (const key of ["of", "of1", "l1", "w1", "f", "f1", "g", "t"]) {
        expect(actual.compensation[key], `compensation.${key}`).toBeCloseTo(ce[key], 6);
      }
      // 第 54 个对象（粘口）刻意采用生产验证过的梯形
      const [top, outer, bottom] = actual.elements.slice(53);
      const bezier = expected.elements[53];
      expect(top).toEqual([0, bezier[1], bezier[2], bezier[3], bezier[4], bezier[5]]);
      expect(outer).toEqual([0, bezier[1], bezier[4], bezier[5], bezier[6], bezier[7]]);
      expect(bottom).toEqual([0, bezier[1], bezier[6], bezier[7], bezier[8], bezier[9]]);
      expect(actual.elements).toHaveLength(56);
    });
  }

  it("generates the production trapezoid glue flap for the 72-inch preset", () => {
    const { elements } = generate0202A({ length: 405, width: 299, depth: 650, caliper: 3 });
    const flap = elements.slice(53);
    expect(flap[0][0]).toBe(0); // 直线，不是曲线
    expect(elements.some((element) => element[0] === 2)).toBe(false); // 无贝塞尔
    // 收分 = G × tan(15°) = 8.04mm，与生产样本实测比例一致
    const taper = Math.abs(flap[0][5] - flap[0][3]);
    const width = Math.abs(flap[0][4] - flap[0][2]);
    expect(taper / width).toBeCloseTo(Math.tan((15 * Math.PI) / 180), 2);
  });

  it("rejects values outside the verified operating envelope", () => {
    expect(() => generate0202A({ length: 0, width: 190, depth: 230, caliper: 3 })).toThrow(
      /大于 0/,
    );
    expect(() => generate0202A({ length: 1, width: 1, depth: 1, caliper: 1 })).toThrow(
      /已验证范围/,
    );
    expect(() => generate0202A({ length: 350, width: 190, depth: 230, caliper: 100 })).toThrow(
      /已验证范围/,
    );
    expect(() => generate0202A({ length: 49, width: 299, depth: 230, caliper: 3 })).toThrow(
      /已验证范围/,
    );
  });

  it("accepts every corner of the verified envelope", () => {
    for (const length of [50, 2000])
      for (const width of [120, 1200])
        for (const depth of [50, 1500])
          for (const caliper of [1.5, 5]) {
            expect(() => generate0202A({ length, width, depth, caliper })).not.toThrow();
          }
  });

  it("accepts a length smaller than width", () => {
    expect(() => generate0202A({ length: 150, width: 200, depth: 100, caliper: 3 })).not.toThrow();
  });
});
