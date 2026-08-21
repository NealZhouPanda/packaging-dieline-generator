import { describe, expect, it } from "vitest";
import { generate0202A } from "../src/generator0202a.js";
import { remapDimensions } from "../src/orientation.js";
import { dedupeFoldLines, geometryToSvg, pointBounds } from "../src/svg.js";

describe("SVG export", () => {
  it("renders type 2 geometry as a polyline instead of a Bezier curve", () => {
    const svg = geometryToSvg({
      elements: [[2, 0, 0, 0, -30, 8.04, -30, 91.96, 0, 100]],
      meta: { width: 30, height: 100, boxId: "polyline" },
      parameters: { length: 30, width: 10, depth: 100, caliper: 1 },
    });

    expect(svg).toContain('d="M 0 0 L -30 8.04 L -30 91.96 L 0 100"');
    expect(svg).not.toMatch(/ d="[^"]* [QC] /);
  });

  it("converts mathematical arc angles to the SVG downward-y coordinate system", () => {
    const arc = [1, 0, 0, 0, 10, 0, 90];
    const svg = geometryToSvg({
      elements: [arc],
      meta: { width: 10, height: 10, boxId: "arc" },
      parameters: { length: 10, width: 10, depth: 10, caliper: 1 },
    });

    expect(svg).toContain('d="M 0 -10 A 10 10 0 0 1 10 0"');
    expect(pointBounds([arc])).toEqual({ minX: 0, minY: -10, maxX: 10, maxY: 0 });
  });

  it("exports all geometry as 1:1 mm vector paths", () => {
    const geometry = generate0202A({ length: 405, width: 299, depth: 650, caliper: 3 });
    const svg = geometryToSvg(geometry);

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="1435mm" height="951mm" viewBox="-734 -150.5 1435 951"');
    expect(svg).not.toContain("注意");
    expect(svg).toContain('data-blank-height="951"');
    expect(svg).toContain('data-box-id="0202A"');
    expect(svg).toContain('class="cut"');
    expect(svg).toContain('class="fold"');
    expect(svg.match(/<path /g)).toHaveLength(54);
    expect(svg).toContain('vector-effect="non-scaling-stroke"');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("refuses export if declared canvas does not contain the geometry", () => {
    const geometry = generate0202A({ length: 405, width: 299, depth: 650, caliper: 3 });
    geometry.meta.width = 1;
    expect(() => geometryToSvg(geometry)).toThrow(/canvas does not contain geometry/);
  });

  it("withNote: 底部加注意事项条带，几何不变", () => {
    const geometry = generate0202A({ length: 405, width: 299, depth: 650, caliper: 3 });
    const svg = geometryToSvg(geometry, { withNote: true });
    expect(svg).toContain('viewBox="-734 -150.5 1435 963"');
    expect(svg.match(/注意：首次投产前先打样核对。/g)).toHaveLength(2); // 注释 + 可见文字
    expect(svg).toContain('y="808.5"'); // 刀模底部（maxY 800.5 + 8）
    expect(svg.match(/<path /g)).toHaveLength(54);
  });

  it("中面：最左两条横向压痕不因正反叠画变成实线", () => {
    const mid = generate0202A({
      ...remapDimensions({ length: 405, width: 299, depth: 650 }, "mid"),
      caliper: 5,
    });
    expect(mid.elements.length - dedupeFoldLines(mid.elements).length).toBe(2);
    const svg = geometryToSvg(mid);
    const folds = [...svg.matchAll(/class="fold" d="M ([-\d.]+) ([-\d.]+) L ([-\d.]+) ([-\d.]+)"/g)];
    const keys = folds.map(([, x1, y1, x2, y2]) => {
      const a = `${x1},${y1}`;
      const b = `${x2},${y2}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});
