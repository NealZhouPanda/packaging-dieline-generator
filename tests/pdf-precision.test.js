import { describe, expect, it } from "vitest";
import { generateK016A } from "../src/generatorK016A.js";
import { generate0201 } from "../src/generators-legacy.js";
import { geometryToPdf } from "../src/pdf.js";
import { pointBounds, dedupeFoldLines } from "../src/svg.js";

const decoder = new TextDecoder();
const MM_TO_PT = 72 / 25.4;

/** 取出刀模绘图块（q … Q），只在这里谈几何精度，侧栏文字不算。 */
function dielineBlock(pdf) {
  const start = pdf.indexOf(" cm");
  const qStart = pdf.lastIndexOf("q ", start);
  const end = pdf.indexOf("Q", qStart);
  return pdf.slice(qStart, end);
}

/** 坐标流里的 cm 缩放系数（pt per mm）。 */
function streamScale(block) {
  const match = block.match(/q (-?\d+(?:\.\d+)?) 0 0 (-?\d+(?:\.\d+)?) /);
  expect(match, "刀模绘图块应含 cm 矩阵").toBeTruthy();
  return Number(match[1]);
}

/** 绘图块里全部路径坐标（毫米）。只取 " m " 之后的路径操作数，避开颜色/线宽操作数。 */
function pathCoordinates(block) {
  const points = [];
  for (const segment of block.split("S")) {
    const pathMatch = segment.match(/m (.*)$/s);
    if (!pathMatch) continue;
    const nums = (pathMatch[1].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    for (let index = 0; index + 1 < nums.length; index += 2) points.push([nums[index], nums[index + 1]]);
  }
  return points;
}

/** 把一段绘图拆成「m + 若干 c」的路径，返回每段 cubic 的控制点。 */
function arcPaths(block) {
  const paths = [];
  for (const segment of block.split("S")) {
    if (!segment.includes(" c")) continue;
    const pathMatch = segment.match(/m (.*)$/s);
    if (!pathMatch) continue;
    const chunks = pathMatch[1]
      .split(" c")
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    const cubics = [];
    let start = null;
    for (const chunk of chunks) {
      const nums = chunk.split(/\s+/).map(Number);
      if (nums.length !== 6) continue;
      if (!start) {
        const before = segment.match(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) m/);
        start = [Number(before[1]), Number(before[2])];
      }
      const [c1x, c1y, c2x, c2y, px, py] = nums;
      cubics.push({ p0: start, c1: [c1x, c1y], c2: [c2x, c2y], p1: [px, py] });
      start = [px, py];
    }
    if (cubics.length) paths.push(cubics);
  }
  return paths;
}

function cubicPoint({ p0, c1, c2, p1 }, t) {
  const w = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3];
  const x = w[0] * p0[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * p1[0];
  const y = w[0] * p0[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * p1[1];
  return [x, y];
}

describe("PDF 刀模精度：1:1 比例", () => {
  it("刀模绘图块的缩放系数等于 72/25.4（毫米到点）", () => {
    const geometry = generate0201({ length: 350, width: 190, depth: 230, caliper: 5 });
    const pdf = decoder.decode(geometryToPdf(geometry, { filename: "0201_default", date: "2026-09-26" }));
    const scale = streamScale(dielineBlock(pdf));
    expect(Math.abs(scale - MM_TO_PT)).toBeLessThanOrEqual(1e-6);
  });

  it("图纸上刀模的物理尺寸等于几何毫米尺寸（1:1）", () => {
    const geometry = generate0201({ length: 350, width: 190, depth: 230, caliper: 5 });
    const pdf = decoder.decode(geometryToPdf(geometry, { filename: "0201_default", date: "2026-09-26" }));
    const block = dielineBlock(pdf);
    const scale = streamScale(block);
    const points = pathCoordinates(block);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const bounds = pointBounds(dedupeFoldLines(geometry.elements));
    // 流坐标是毫米；换算成点后应与「毫米 × 72/25.4」一致（允许坐标取整的 0.01pt 噪声）。
    expect(Math.abs((Math.max(...xs) - Math.min(...xs)) * scale - (bounds.maxX - bounds.minX) * MM_TO_PT)).toBeLessThan(0.05);
    expect(Math.abs((Math.max(...ys) - Math.min(...ys)) * scale - (bounds.maxY - bounds.minY) * MM_TO_PT)).toBeLessThan(0.05);
  });
});

describe("PDF 刀模精度：圆弧不因转换失真", () => {
  const geometry = generateK016A({ length: 350, width: 190, depth: 230, caliper: 3 });
  const pdf = decoder.decode(geometryToPdf(geometry, { filename: "K016A_default", date: "2026-09-26" }));
  const block = dielineBlock(pdf);
  const arcElements = geometry.elements.filter((element) => element[0] === 1);
  const paths = arcPaths(block);

  it("每条圆弧仍各自成一条路径（数量对齐，解析可信）", () => {
    expect(paths.length).toBe(arcElements.length);
  });

  it("半圆不得用单段贝塞尔拟合（≥90° 弧须分段）", () => {
    const semicircles = arcElements
      .map((element, index) => ({ element, path: paths[index] }))
      .filter(({ element }) => {
        const span = (((element[6] - element[5]) % 360) + 360) % 360;
        return span > 90.001;
      });
    expect(semicircles.length).toBeGreaterThan(0);
    for (const { element, path } of semicircles) {
      const span = (((element[6] - element[5]) % 360) + 360) % 360;
      expect(path.length, `span=${span}° 的弧只用了 ${path.length} 段`).toBeGreaterThanOrEqual(
        Math.ceil(span / 90 - 1e-9),
      );
    }
  });

  it("每条圆弧与真圆的偏差都在 0.02mm 以内", () => {
    let worst = 0;
    arcElements.forEach((element, index) => {
      const [, , cx, cy, r] = element;
      for (const cubic of paths[index]) {
        for (let step = 0; step <= 200; step += 1) {
          const [x, y] = cubicPoint(cubic, step / 200);
          const deviation = Math.abs(Math.hypot(x - cx, y - cy) - Math.abs(r));
          if (deviation > worst) worst = deviation;
        }
      }
    });
    expect(worst).toBeLessThan(0.02);
  });
});
