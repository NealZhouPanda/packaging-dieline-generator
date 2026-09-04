import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

export const PDF_RENDER_DPI = 300;
export const PDF_POINTS_PER_INCH = 72;
export const MILLIMETRES_PER_INCH = 25.4;

let pdfWorkerUrl = "";

function ensurePdfWorker() {
  if (!pdfWorkerUrl) {
    pdfWorkerUrl = URL.createObjectURL(
      new Blob([pdfWorkerSource], { type: "text/javascript" }),
    );
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");
}

/**
 * Match Packmage's PDF import rule: rasterise at 300 DPI, then reduce the
 * result proportionally when its pixel area exceeds maxSize².
 */
export function pdfRenderSizeFor(
  viewport,
  maxSize,
  dpi = PDF_RENDER_DPI,
) {
  const sourceWidth = Math.max(1, Number(viewport?.width) || 1);
  const sourceHeight = Math.max(1, Number(viewport?.height) || 1);
  const safeMaxSize = Math.max(1, Number(maxSize) || 4096);
  let scale = Math.max(0.01, Number(dpi) || PDF_RENDER_DPI) / PDF_POINTS_PER_INCH;
  let width = sourceWidth * scale;
  let height = sourceHeight * scale;
  const maxArea = safeMaxSize ** 2;
  const area = width * height;

  if (area > maxArea) {
    const reduction = Math.sqrt(maxArea / area);
    scale *= reduction;
    width *= reduction;
    height *= reduction;
  }

  return {
    scale,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function pdfPhysicalSizeFor(viewport) {
  return {
    width: (Math.max(1, Number(viewport?.width) || 1) * MILLIMETRES_PER_INCH)
      / PDF_POINTS_PER_INCH,
    height: (Math.max(1, Number(viewport?.height) || 1) * MILLIMETRES_PER_INCH)
      / PDF_POINTS_PER_INCH,
  };
}

function readablePdfError(reason) {
  if (reason?.name === "PasswordException") {
    return new Error("PDF 受密码保护，暂时无法作为贴图导入。");
  }
  if (reason?.name === "InvalidPDFException") {
    return new Error("PDF 文件无效或已经损坏。");
  }
  if (reason?.name === "MissingPDFException") {
    return new Error("无法读取 PDF 文件。");
  }
  return reason instanceof Error ? reason : new Error("PDF 贴图导入失败。");
}

export async function destroyPdfLoadingTask(documentTask, warn = console.warn) {
  if (typeof documentTask?.destroy !== "function") return;
  try {
    await documentTask.destroy();
  } catch (reason) {
    warn("PDF 贴图资源清理失败：", reason);
  }
}

export async function renderPdfFirstPage(file, { maxSize = 4096 } = {}) {
  ensurePdfWorker();
  let documentTask;
  let pdfDocument;
  let page;

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    documentTask = pdfjsLib.getDocument({ data });
    pdfDocument = await documentTask.promise;
    page = await pdfDocument.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const physicalSize = pdfPhysicalSizeFor(baseViewport);
    const size = pdfRenderSizeFor(baseViewport, maxSize);
    const viewport = page.getViewport({ scale: size.scale });
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("浏览器无法创建 PDF 贴图画布。");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    await page.render({ canvasContext: context, viewport }).promise;
    return {
      canvas,
      pageNumber: 1,
      pageCount: pdfDocument.numPages,
      width: size.width,
      height: size.height,
      physicalWidth: physicalSize.width,
      physicalHeight: physicalSize.height,
    };
  } catch (reason) {
    throw readablePdfError(reason);
  } finally {
    page?.cleanup();
    await destroyPdfLoadingTask(documentTask);
  }
}
