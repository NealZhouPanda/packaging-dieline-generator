import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  generate0201,
  generateE005C,
  generateC001GX,
} from "../src/generators-legacy.js";
import { generate0421 } from "../src/generator0421.js";
import { generateK016A } from "../src/generatorK016A.js";
import { geometryToPdf } from "../src/pdf.js";

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");

async function extractText(bytes) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: undefined,
    isEvalSupported: false,
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // 按行聚合：pdfjs 项的 transform[5] 为基线 y（PDF 坐标，向上）。
  const items = content.items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      w: item.width,
      h: Math.abs(item.transform[3]) || item.height,
    }));
  return { pageHeight: viewport.height, pageWidth: viewport.width, items };
}

const NOTE_KEYS = ["打样", "首次投产"];

function noteItems(items) {
  return items.filter((item) => NOTE_KEYS.some((k) => item.str.includes(k)));
}

describe("PDF 打样提醒须完整位于页内（真实 PDF 解析）", () => {
  it("0201 默认尺寸：打样提醒全文在页内", async () => {
    const geometry = generate0201({ length: 350, width: 190, depth: 230, caliper: 5 });
    const bytes = geometryToPdf(geometry, {
      filename: "0201_L350_W190_D230_C5",
      date: "2026-09-26",
    });
    const { pageHeight, pageWidth, items } = await extractText(bytes);
    const note = noteItems(items);
    expect(note.length).toBeGreaterThan(0);
    for (const item of note) {
      expect(item.y, `提醒行 y=${item.y} 超出页高 ${pageHeight}`).toBeLessThanOrEqual(pageHeight);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x + item.w).toBeLessThanOrEqual(pageWidth);
    }
  });

  it("较矮盒高 + 长文件名：提醒仍页内，文件名换行不与其他内容重叠", async () => {
    const geometry = generate0201({ length: 300, width: 200, depth: 100, caliper: 3 });
    const bytes = geometryToPdf(geometry, {
      filename: "0201_超长文件名测试_aaaabbbbccccddddeeeeffffgggg",
      date: "2026-09-26",
    });
    const { pageHeight, items } = await extractText(bytes);
    const note = noteItems(items);
    expect(note.length).toBeGreaterThan(0);
    for (const item of note) {
      expect(item.y).toBeLessThanOrEqual(pageHeight);
      expect(item.y).toBeGreaterThanOrEqual(0);
    }
    // 主要标题文字行两两不重叠（x 重叠且 y 区间交叠视为重叠）
    const sideItems = items.filter((item) => item.x < 250);
    for (let i = 0; i < sideItems.length; i += 1) {
      for (let j = i + 1; j < sideItems.length; j += 1) {
        const a = sideItems[i];
        const b = sideItems[j];
        const overlapY = Math.abs(a.y - b.y) < Math.max(a.h, b.h) * 0.8;
        expect(overlapY).toBe(false);
      }
    }
  });

  it("超抛分支：提醒仍页内", async () => {
    const geometry = generate0201({ length: 600, width: 400, depth: 300, caliper: 5 });
    const bytes = geometryToPdf(geometry, {
      filename: "0201_L600_W400_D300_C5",
      date: "2026-09-26",
      sideLimit: 50,
    });
    const { pageHeight, items } = await extractText(bytes);
    const note = noteItems(items);
    expect(note.length).toBeGreaterThan(0);
    for (const item of note) {
      expect(item.y).toBeLessThanOrEqual(pageHeight);
      expect(item.y).toBeGreaterThanOrEqual(0);
    }
    expect(items.some((item) => item.str.includes("已超抛"))).toBe(true);
  });

  it("5 种真实盒型：提醒完整文本在页内", async () => {
    const cases = [
      ["0201", generate0201, { length: 350, width: 190, depth: 230, caliper: 5 }],
      ["E005C", generateE005C, { length: 300, width: 200, depth: 150, caliper: 3 }],
      ["C001GX", generateC001GX, { length: 320, width: 220, depth: 180, caliper: 3 }],
      ["0421", generate0421, { length: 300, width: 200, depth: 120, caliper: 3 }],
      ["K016A", generateK016A, { length: 250, width: 150, depth: 100, caliper: 3 }],
    ];
    for (const [type, fn, params] of cases) {
      const geometry = fn(params);
      const bytes = geometryToPdf(geometry, {
        filename: `${type}_默认`,
        date: "2026-09-26",
      });
      const { pageHeight, pageWidth, items } = await extractText(bytes);
      const note = noteItems(items);
      expect(note.length, `${type} 应含打样提醒`).toBeGreaterThan(0);
      for (const item of note) {
        expect(item.y, `${type} 提醒 y=${item.y} 超出页高 ${pageHeight}`).toBeLessThanOrEqual(pageHeight);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.x + item.w, `${type} 提醒超出右边界`).toBeLessThanOrEqual(pageWidth);
      }
    }
  });
});
