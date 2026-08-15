import { describe, expect, it } from "vitest";
import { generate0202A } from "../src/generator0202a.js";
import { geometryToPdf, stripExportExt, exportFilename, textWidthMm } from "../src/pdf.js";

const decoder = new TextDecoder();

describe("stripExportExt", () => {
  it("去掉下载扩展名", () => {
    expect(stripExportExt("测试纸箱.svg")).toBe("测试纸箱");
    expect(stripExportExt("测试纸箱.PDF")).toBe("测试纸箱");
    expect(stripExportExt("dieline")).toBe("dieline");
    expect(stripExportExt("0202A_L390_W130_D640_C5.svg.pdf")).toBe("0202A_L390_W130_D640_C5");
  });

  it("导出文件名只保留一个正确扩展名", () => {
    expect(exportFilename("0202A_L390_W130_D640_C5.svg", "pdf")).toBe("0202A_L390_W130_D640_C5.pdf");
    expect(exportFilename("测试纸箱.svg.pdf", "pdf")).toBe("测试纸箱.pdf");
    expect(exportFilename("测试纸箱", "svg")).toBe("测试纸箱.svg");
  });

  it("数字字母字宽小于汉字，避免等宽空档", () => {
    expect(textWidthMm("0000", 18)).toBeLessThan(textWidthMm("刀刀刀刀", 18) * 0.7);
  });
});

describe("PDF 图纸导出", () => {
  const geometry = generate0202A({ length: 405, width: 299, depth: 650, caliper: 3 });
  const bytes = geometryToPdf(geometry, {
    filename: "测试纸箱.svg",
    date: "2026-08-13",
    ratio: 8000,
    sideLimit: 100,
  });
  const pdf = decoder.decode(bytes);

  it("生成合法 PDF 结构（含 90mm 信息栏，页面 = 侧栏 + 主区）", () => {
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf).toMatch(/\/MediaBox \[0 0 [\d.]+ [\d.]+\]/);
    expect(pdf).toContain("startxref");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("内嵌 Noto Sans SC 子集（Type0 + CIDFontType2 + ToUnicode）", () => {
    expect(pdf).toContain("/Subtype /Type0");
    expect(pdf).toContain("/Subtype /CIDFontType2");
    expect(pdf).toContain("/FontFile2 8 0 R");
    expect(pdf).toContain("/Length1");
    expect(pdf).toContain("begincmap");
  });

  it("每个几何对象一条路径，刀线/压线颜色分组", () => {
    const ops = pdf.match(/ m /g) ?? [];
    expect(ops.length).toBeGreaterThanOrEqual(56);
    expect(pdf).toContain("0 0.36 1 RG");
    expect(pdf).toContain("1 0.18 0.18 RG [4 2] 0 d");
  });

  it("侧栏用 Tm 定位，多行 y 互不相同且在页内", () => {
    const tms = [...pdf.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
    }));
    expect(tms.length).toBeGreaterThan(8);
    const ys = tms.map((item) => item.y);
    expect(new Set(ys).size).toBe(ys.length);
    expect(Math.min(...ys)).toBeGreaterThan(20);
    expect(Math.max(...ys)).toBeLessThan(4000);
    expect(tms.every((item) => item.x > 10 && item.x < 700)).toBe(true);
    expect(pdf).not.toContain(" Td ");
    expect(pdf).toContain("0.11 0.145 0.18 rg");
  });

  it("注意事项写入文档属性（UTF-16BE）", () => {
    expect(pdf).toContain("/Title <FEFF");
    expect(pdf).toContain("/Info 11 0 R");
  });

  it("uses the generated box type and paper type in PDF metadata", async () => {
    const { generate0421 } = await import("../src/generator0421.js");
    const whiteCard = generate0421({
      length: 300,
      width: 200,
      depth: 100,
      caliper: 0.5,
      paperType: "white-card",
    });
    const whiteCardPdf = decoder.decode(geometryToPdf(whiteCard, { date: "2026-08-13" }));
    const subject = "0421 L300 W200 D100 CAL0.5 PAPER white-card";
    const subjectHex = `<FEFF${[...subject]
      .map((char) => char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"))
      .join("")}>`;

    expect(whiteCard.parameters.paperType).toBe("white-card");
    expect(whiteCardPdf).toContain(subjectHex);
  });
});
