import { describe, expect, it } from "vitest";
import { generate0202A } from "../src/generator0202a.js";
import { generate0421 } from "../src/generator0421.js";
import { generateK016A } from "../src/generatorK016A.js";
import { blanksPerSheet, containerLoadCount, dieSize, dielineSize, netArea, outerSize, outerSizeFromDieline, sideHeights, sideSumCm, supportsNetArea, volumetricWeightKg } from "../src/netarea.js";

describe("净面积", () => {
  it("默认尺寸：轮廓闭合，净面积稳定（结构差异在 1% 以内）", () => {
    const g = generate0202A({ length: 350, width: 190, depth: 230, caliper: 3 });
    const area = netArea(g.elements);
    // 官方 NetArea=457120.84（弧形粘口+凸弧槽底）；我们为生产样式，允许 1% 偏差
    expect(Math.abs(area - 457120.84) / 457120.84).toBeLessThan(0.01);
    expect(area).toBeLessThan(g.meta.width * g.meta.height);
  });

  it("72寸尺寸：净面积小于外接矩形且大于其 90%", () => {
    const g = generate0202A({ length: 405, width: 299, depth: 650, caliper: 3 });
    const area = netArea(g.elements);
    const rect = g.meta.width * g.meta.height;
    expect(area / rect).toBeGreaterThan(0.9);
    expect(area / rect).toBeLessThan(1);
  });

  it("0421 face data is explicitly disabled until multi-contour net area is calibrated", () => {
    const geometry = generate0421({ length: 350, width: 190, depth: 230, caliper: 3 });

    expect(geometry.elements.length).toBeGreaterThan(0);
    expect(supportsNetArea(geometry.parameters.boxType)).toBe(false);
  });

  it("K016A face data is explicitly disabled until quadratic paths are calibrated", () => {
    const geometry = generateK016A({ length: 350, width: 190, depth: 230, caliper: 3 });

    expect(geometry.elements.some(([type]) => type === 2)).toBe(true);
    expect(supportsNetArea(geometry.parameters.boxType)).toBe(false);
  });

  it("未校准净面积的箱型用展开包络做开口面积估算", () => {
    for (const generate of [generate0421, generateK016A]) {
      const geometry = generate({ length: 350, width: 190, depth: 230, caliper: 3 });
      const estimate = geometry.meta.width * geometry.meta.height;
      expect(estimate).toBeGreaterThan(0);
      expect(blanksPerSheet(geometry.meta.width, geometry.meta.height, 1200, 2400)).toBeGreaterThan(0);
    }
  });
});

describe("刀模尺寸", () => {
  const p = { length: 390, width: 130, depth: 640, caliper: 5 };
  it("输入刀模尺寸时，导出尺寸保持输入值", () => {
    expect(dielineSize(p)).toEqual({ length: 390, width: 130, depth: 640 });
  });
  it("保留历史 dieSize 换算函数的兼容性", () => {
    expect(dieSize(p)).toEqual({ length: 392.5, width: 132.5, depth: 642.5 });
  });
  it("默认盒型按刀模尺寸估算外尺寸", () => {
    expect(outerSize(p)).toEqual({ length: 400, width: 140, depth: 645 });
  });
  it("E005C 使用项目现有的刀模到外尺寸抛重换算", () => {
    expect(outerSizeFromDieline({ ...p, boxType: "E005C" })).toEqual({
      length: 393.3333333333333,
      width: 138.33333333333334,
      depth: 643.3333333333334,
    });
  });
  it("四侧面高度分高低两组，差距 2 个纸厚", () => {
    expect(sideHeights(p)).toEqual({ high: 647.5, low: 637.5 });
  });
});

describe("抛重估算", () => {
  it("体积重量 = 外尺寸(cm)乘积 ÷ 抛比；外尺寸=内尺寸+纸厚", () => {
    // 开箱面外 411×305，高 653 → 41.1×30.5×65.3cm ÷8000
    expect(
      volumetricWeightKg({ length: 405, width: 299, depth: 650, caliper: 3 }, 8000),
    ).toBeCloseTo(10.23, 1);
  });
  it("三边和为外尺寸三边之和（cm）", () => {
    expect(sideSumCm({ length: 405, width: 299, depth: 650, caliper: 3 })).toBeCloseTo(136.9, 1);
  });
});

describe("每张可切数量", () => {
  it("横竖两种排法取多", () => {
    // 1107×422 在 1200×2400 上：正排 1×5=5，旋转 2×2=4 → 5
    expect(blanksPerSheet(1107, 422, 1200, 2400)).toBe(5);
    // 300×500：正排 4×4=16，旋转 2×8=16 → 16
    expect(blanksPerSheet(300, 500, 1200, 2400)).toBe(16);
    // 放不下
    expect(blanksPerSheet(1300, 2500, 1200, 2400)).toBe(0);
  });
});

describe("装柜估算", () => {
  // 外尺寸 356×196×233（刀模 350×190×230 + 默认补偿 2T/2T/T，T=3）
  const p = { length: 350, width: 190, depth: 230, caliper: 3, boxType: "0202A" };

  it("6 向排列取最大：20GP=1920，40HQ=4356", () => {
    expect(containerLoadCount(p, "20GP")).toBe(1920);
    expect(containerLoadCount(p, "40HQ")).toBe(4356);
  });

  it("未知柜型或单箱超过柜内尺寸返回 0", () => {
    expect(containerLoadCount(p, "XXL")).toBe(0);
    expect(containerLoadCount({ ...p, length: 6000 }, "20GP")).toBe(0);
  });
});
