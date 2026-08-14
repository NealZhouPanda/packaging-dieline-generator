import { describe, expect, it } from "vitest";
import { detectFace, remapDimensions } from "../src/orientation.js";

const sample = { length: 405, width: 299, depth: 650 };

describe("开口方向数据重排", () => {
  it("大面开口：D 取最小值，开口面为最大两面", () => {
    expect(remapDimensions(sample, "big")).toEqual({ length: 650, width: 405, depth: 299 });
  });
  it("中面开口：D 取中间值", () => {
    expect(remapDimensions(sample, "mid")).toEqual({ length: 650, width: 299, depth: 405 });
  });
  it("小面开口：D 取最大值", () => {
    expect(remapDimensions(sample, "small")).toEqual({ length: 405, width: 299, depth: 650 });
  });
  it("重排后始终满足 L ≥ W", () => {
    for (const face of ["big", "mid", "small"]) {
      const r = remapDimensions(sample, face);
      expect(r.length).toBeGreaterThanOrEqual(r.width);
    }
  });
  it("数值顺序任意也能正确归类", () => {
    expect(remapDimensions({ length: 299, width: 650, depth: 405 }, "big")).toEqual({
      length: 650,
      width: 405,
      depth: 299,
    });
  });
  it("detectFace 与 remap 互逆", () => {
    expect(detectFace(remapDimensions(sample, "big"))).toBe("big");
    expect(detectFace(remapDimensions(sample, "mid"))).toBe("mid");
    expect(detectFace(remapDimensions(sample, "small"))).toBe("small");
  });
});
