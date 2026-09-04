import { describe, expect, it, vi } from "vitest";
import {
  destroyPdfLoadingTask,
  isPdfFile,
  pdfPhysicalSizeFor,
  pdfRenderSizeFor,
} from "../src/pdf-texture.js";

describe("PDF artwork import", () => {
  it("recognises PDF files by MIME type or extension", () => {
    expect(isPdfFile({ type: "application/pdf", name: "artwork.bin" })).toBe(true);
    expect(isPdfFile({ type: "", name: "ARTWORK.PDF" })).toBe(true);
    expect(isPdfFile({ type: "image/png", name: "artwork.png" })).toBe(false);
  });

  it("uses the official 300 DPI scale when it fits the area limit", () => {
    const result = pdfRenderSizeFor({ width: 720, height: 360 }, 4096);
    expect(result.scale).toBeCloseTo(300 / 72, 8);
    expect(result.width).toBe(3000);
    expect(result.height).toBe(1500);
  });

  it("reduces oversized pages proportionally to maxSize squared", () => {
    const result = pdfRenderSizeFor({ width: 1440, height: 720 }, 4096);
    expect(result.width / result.height).toBeCloseTo(2, 3);
    expect(result.width * result.height).toBeLessThanOrEqual(4096 ** 2 + 4096);
  });

  it("preserves the PDF page's physical size in dieline millimetres", () => {
    const result = pdfPhysicalSizeFor({ width: 5102.3622, height: 2494.4882 });

    expect(result.width).toBeCloseTo(1800, 3);
    expect(result.height).toBeCloseTo(880, 3);
  });

  it("destroys the PDF loading task without relying on the document proxy", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);

    await destroyPdfLoadingTask({ destroy });

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("keeps the imported texture when resource cleanup fails", async () => {
    const failure = new Error("cleanup failed");
    const warn = vi.fn();

    await expect(
      destroyPdfLoadingTask({ destroy: vi.fn().mockRejectedValue(failure) }, warn),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("PDF 贴图资源清理失败：", failure);
  });
});
