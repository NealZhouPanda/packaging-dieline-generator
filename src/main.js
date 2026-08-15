import { generate0202A } from "./generator0202a.js";
import { generate0421 } from "./generator0421.js";
import { generateK016A } from "./generatorK016A.js";
import { blanksPerSheet, netArea, sideSumCm, volumetricWeightKg } from "./netarea.js";
import { detectFace, remapDimensions } from "./orientation.js";
import { geometryToPdf, exportFilename, stripExportExt } from "./pdf.js";
import { geometryToSvg } from "./svg.js";

const inputs = {
  length: document.querySelector("#length"),
  width: document.querySelector("#width"),
  depth: document.querySelector("#depth"),
};
const boxTypeSelect = document.querySelector("#boxType");
const paperTypeSelect = document.querySelector("#paperType");
const generators = Object.freeze({ "0202A": generate0202A, "0421": generate0421, K016A: generateK016A });

function generateBox(parameters) {
  const generator = generators[parameters.boxType || "0202A"];
  if (!generator) throw new RangeError(`Unknown box type: ${parameters.boxType}`);
  return generator(parameters);
}
// 系统层限制：批量生产常见设备（1224 型水墨印刷开槽模切机）的最大进纸幅面。
// 不在界面显示；如供应商设备不同，改这里即可。
const SHEET_MAX = Object.freeze({ width: 1200, length: 2400 });
const materialWarning = document.querySelector("#materialWarning");
const dimRatioSelect = document.querySelector("#dimRatio");
const sideSumLimitInput = document.querySelector("#sideSumLimit");
const fluteSelect = document.querySelector("#flute");
const customCaliperRow = document.querySelector("#customCaliperRow");
const customCaliperInput = document.querySelector("#caliper");
const preview = document.querySelector("#preview");
const error = document.querySelector("#error");
const downloadButton = document.querySelector("#download");
const downloadPdfButton = document.querySelector("#downloadPdf");
const filenameInput = document.querySelector("#filename");

let currentGeometry = null;
let currentSvg = "";
let userEditedFilename = false;

function values() {
  const dimensions = Object.fromEntries(
    Object.entries(inputs).map(([key, input]) => [key, Number(input.value)]),
  );
  dimensions.caliper =
    fluteSelect.value === "custom" ? Number(customCaliperInput.value) : Number(fluteSelect.value);
  dimensions.boxType = boxTypeSelect.value;
  return dimensions;
}

function makeFilename(parameters) {
  return `${parameters.boxType || "0202A"}_L${parameters.length}_W${parameters.width}_D${parameters.depth}_C${parameters.caliper}`;
}

function checkMaterial(blankWidth, blankHeight) {
  const { width: maxW, length: maxL } = SHEET_MAX;
  const fits =
    (blankWidth <= maxW && blankHeight <= maxL) || (blankWidth <= maxL && blankHeight <= maxW);
  materialWarning.hidden = fits;
  materialWarning.textContent = fits
    ? ""
    : `刀模展开 ${blankWidth}×${blankHeight}mm，超过材料幅面 ${maxW}×${maxL}mm：一张纸印不下，需与供应商确认分张或拼接方案。`;
}

/** 为三个开口方向分别计算净面积与每张可切数量，显示在图标上。 */
function refreshFaceData(current) {
  for (const span of document.querySelectorAll("[data-face-data]")) {
    const face = span.dataset.faceData;
    try {
      const dims = remapDimensions(current, face);
      const geometry = generateBox({ ...dims, caliper: current.caliper, boxType: current.boxType });
      const area = netArea(geometry.elements);
      const count = blanksPerSheet(
        geometry.meta.width,
        geometry.meta.height,
        SHEET_MAX.width,
        SHEET_MAX.length,
      );
      span.textContent =
        count > 0 ? `${(area / 1e6).toFixed(3)}m²\n${count}个/张` : "超幅面";
    } catch {
      span.textContent = "超范围";
    }
  }
}

function update() {
  try {
    const geometry = generateBox(values());
    currentGeometry = geometry;
    currentSvg = geometryToSvg(geometry); // 预览用纯净版，不带注意事项
    if (!userEditedFilename) filenameInput.value = makeFilename(geometry.parameters);

    preview.innerHTML = currentSvg.replace(/^<\?xml[^>]+>\s*/, "");
    document.querySelector("#sheetWidth").textContent = `${geometry.meta.width} mm`;
    document.querySelector("#sheetHeight").textContent = `${geometry.meta.height} mm`;
    const ratio = Number(dimRatioSelect.value);
    const sideSum = sideSumCm(geometry.parameters);
    const sideLimit = Number(sideSumLimitInput.value);
    const overLimit = Number.isFinite(sideLimit) && sideLimit > 0 && sideSum > sideLimit;
    // 未超抛时不显示抛重数值（按实际重量计费，抛重无意义）
    document.querySelector("#volWeightResult").hidden = !overLimit;
    if (overLimit) {
      document.querySelector("#volWeightNote").textContent =
        `已超抛（三边和 ${sideSum.toFixed(0)}cm > ${sideLimit}cm），抛重为：`;
      document.querySelector("#volWeight").textContent =
        `${volumetricWeightKg(geometry.parameters, ratio).toFixed(1)} kg`;
    }
    checkMaterial(geometry.meta.width, geometry.meta.height);
    refreshFaceData(geometry.parameters);
    error.hidden = true;
    downloadButton.disabled = false;
    downloadPdfButton.disabled = false;
  } catch (reason) {
    error.textContent = reason instanceof Error ? reason.message : "请输入有效的尺寸。";
    error.hidden = false;
    downloadButton.disabled = true;
    downloadPdfButton.disabled = true;
    preview.replaceChildren();
  }
}

for (const input of Object.values(inputs)) input.addEventListener("input", update);

const faceButtons = [...document.querySelectorAll(".face-option")];
let currentFace = detectFace({
  length: Number(inputs.length.value),
  width: Number(inputs.width.value),
  depth: Number(inputs.depth.value),
});

function syncFaceUI() {
  for (const button of faceButtons) {
    const active = button.dataset.face === currentFace;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  }
}

for (const button of faceButtons) {
  button.addEventListener("click", () => {
    currentFace = button.dataset.face;
    const remapped = remapDimensions(
      {
        length: Number(inputs.length.value),
        width: Number(inputs.width.value),
        depth: Number(inputs.depth.value),
      },
      currentFace,
    );
    inputs.length.value = remapped.length;
    inputs.width.value = remapped.width;
    inputs.depth.value = remapped.depth;
    syncFaceUI();
    update();
  });
}
syncFaceUI();

fluteSelect.addEventListener("change", () => {
  customCaliperRow.hidden = fluteSelect.value !== "custom";
  update();
});
customCaliperInput.addEventListener("input", update);
dimRatioSelect.addEventListener("change", update);
sideSumLimitInput.addEventListener("input", update);
boxTypeSelect.addEventListener("change", update);
paperTypeSelect?.addEventListener("change", update);

filenameInput.addEventListener("input", () => {
  userEditedFilename = true;
});

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadName(extension) {
  return exportFilename(filenameInput.value, extension);
}

downloadButton.addEventListener("click", () => {
  // 下载版：底部加注意事项条带（页面预览不带）
  download(
    downloadName("svg"),
    geometryToSvg(currentGeometry, { withNote: true }),
    "image/svg+xml;charset=utf-8",
  );
});

downloadPdfButton.addEventListener("click", () => {
  download(
    downloadName("pdf"),
    geometryToPdf(currentGeometry, {
      filename: stripExportExt(filenameInput.value),
      ratio: Number(dimRatioSelect.value),
      sideLimit: Number(sideSumLimitInput.value),
    }),
    "application/pdf",
  );
});

update();
