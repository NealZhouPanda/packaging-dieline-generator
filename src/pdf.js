import { PDF_FONT } from "./font-subset.js";
import { PDF_FONT_WIDTHS } from "./font-widths.js";
import { dielineSize, sideSumCm, volumetricWeightKg } from "./netarea.js";
import { dedupeFoldLines, pointBounds } from "./svg.js";

const MM_TO_PT = 72 / 25.4;
const PROOF_NOTE = "注意：首次投产前先打样核对。";

function makeLayout(blankW) {
  const sidebar = Math.min(240, Math.max(100, blankW * 0.16));
  const titleMm = sidebar * 0.1;
  const valueMm = sidebar * 0.078;
  const labelMm = sidebar * 0.05;
  return {
    sidebar,
    gap: Math.min(14, sidebar * 0.07),
    margin: 12,
    left: sidebar * 0.07,
    header: titleMm * 2.1,
    titlePt: titleMm * MM_TO_PT,
    valuePt: valueMm * MM_TO_PT,
    labelPt: labelMm * MM_TO_PT,
    lineMm: valueMm * 1.5,
    labelStep: valueMm * 1.5,
    blockGap: valueMm * 0.85,
  };
}

const FALLBACK = Object.freeze({
  "：": ":",
  "。": ".",
  "（": "(",
  "）": ")",
  "，": ",",
  "；": ";",
  "！": "!",
  "？": "?",
});

const round = (value) => Math.round(value * 1000) / 1000;
const fmt = (value) => String(Math.round(value * 10) / 10);
const mm = (value) => round(value * MM_TO_PT);

export function stripExportExt(name) {
  let result = String(name ?? "").trim();
  while (/\.(svg|pdf|dxf)$/i.test(result)) {
    result = result.replace(/\.(svg|pdf|dxf)$/i, "").trim();
  }
  return result || "dieline";
}

export function exportFilename(name, extension) {
  return `${stripExportExt(name)}.${extension}`;
}

function charWidth(char) {
  return PDF_FONT_WIDTHS[char] ?? PDF_FONT_WIDTHS[FALLBACK[char]] ?? 1000;
}

export function textWidthMm(text, sizePt) {
  let units = 0;
  for (const raw of String(text)) {
    const char = PDF_FONT.gids[raw] !== undefined ? raw : FALLBACK[raw];
    if (char === undefined) continue;
    units += charWidth(char);
  }
  return (units / 1000) * sizePt * (25.4 / 72);
}

function wrapByWidth(text, sizePt, maxMm) {
  const chars = [...String(text)];
  const lines = [];
  let current = "";
  for (const ch of chars) {
    const trial = current + ch;
    if (current && textWidthMm(trial, sizePt) > maxMm) {
      lines.push(current);
      current = ch;
    } else current = trial;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function cidWidthArray() {
  const pairs = [];
  for (const [char, gid] of Object.entries(PDF_FONT.gids)) {
    pairs.push([Number(gid), charWidth(char)]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let index = 0;
  while (index < pairs.length) {
    const start = pairs[index][0];
    const run = [pairs[index][1]];
    index += 1;
    while (index < pairs.length && pairs[index][0] === start + run.length) {
      run.push(pairs[index][1]);
      index += 1;
    }
    parts.push(`${start} [${run.join(" ")}]`);
  }
  return `[ ${parts.join(" ")} ]`;
}

function hexGids(text, gids) {
  let hex = "";
  for (const raw of text) {
    const char = gids[raw] !== undefined ? raw : FALLBACK[raw];
    const gid = char === undefined ? undefined : gids[char];
    if (gid === undefined) continue;
    hex += gid.toString(16).toUpperCase().padStart(4, "0");
  }
  return `<${hex}>`;
}

function arcToCubic(cx, cy, r, startDeg, endDeg) {
  const span = (((endDeg - startDeg) % 360) + 360) % 360;
  // 与 SVG 一致：源角度按 Y 向上的数学坐标系定义，PDF 刀模坐标稍后再整体翻转。
  const start = (-endDeg * Math.PI) / 180;
  const theta = (span * Math.PI) / 180;
  const k = (4 / 3) * Math.tan(theta / 4);
  const p1 = [cx + r * Math.cos(start), cy + r * Math.sin(start)];
  const p2 = [cx + r * Math.cos(start + theta), cy + r * Math.sin(start + theta)];
  const c1 = [p1[0] - k * r * Math.sin(start), p1[1] + k * r * Math.cos(start)];
  const c2 = [p2[0] + k * r * Math.sin(start + theta), p2[1] - k * r * Math.cos(start + theta)];
  return { p1, c1, c2, p2 };
}

/** 主区刀模路径（mm 坐标系，x 右移 SIDEBAR，y 翻转仅作用于刀模）。 */
function dielineStream(geometry, lay) {
  const { elements } = geometry;
  const bounds = pointBounds(elements);
  const drawn = dedupeFoldLines(elements);
  const parts = [];
  parts.push(
    `q ${round(MM_TO_PT)} 0 0 ${round(-MM_TO_PT)} ${round((lay.sidebar + lay.gap - bounds.minX) * MM_TO_PT)} ${round((lay.margin + bounds.maxY) * MM_TO_PT)} cm`,
  );
  parts.push("0.25 w 1 J 1 j");
  let currentKind = null;
  for (const element of drawn) {
    const kind = element[1];
    if (kind !== currentKind) {
      parts.push(kind === 1 ? "1 0.18 0.18 RG [4 2] 0 d" : "0 0.36 1 RG [] 0 d");
      currentKind = kind;
    }
    if (element[0] === 0) {
      const [, , x1, y1, x2, y2] = element;
      parts.push(`${round(x1)} ${round(y1)} m ${round(x2)} ${round(y2)} l S`);
    } else if (element[0] === 1) {
      const [, , cx, cy, r, start, end] = element;
      const { p1, c1, c2, p2 } = arcToCubic(cx, cy, r, start, end);
      parts.push(
        `${round(p1[0])} ${round(p1[1])} m ${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(p2[0])} ${round(p2[1])} c S`,
      );
    } else if (element[0] === 2) {
      if (element.length < 6 || element.length % 2 !== 0) {
        throw new TypeError("Polyline geometry requires at least two complete points");
      }
      const points = [];
      for (let index = 2; index < element.length; index += 2) {
        points.push([round(element[index]), round(element[index + 1])]);
      }
      parts.push(
        `${points[0][0]} ${points[0][1]} m ${points
          .slice(1)
          .map(([x, y]) => `${x} ${y} l`)
          .join(" ")} S`,
      );
    }
  }
  parts.push("Q");
  return parts.join("\n");
}

function sidebarBackground(pageHeightMm, lay) {
  return [
    "0.93 0.94 0.95 rg",
    `0 0 ${mm(lay.sidebar)} ${mm(pageHeightMm)} re f`,
    "0.11 0.145 0.18 rg",
    `0 ${mm(pageHeightMm - lay.header)} ${mm(lay.sidebar)} ${mm(lay.header)} re f`,
    "0.55 0.58 0.6 RG 0.6 w",
    `${mm(lay.sidebar)} 0 m ${mm(lay.sidebar)} ${mm(pageHeightMm)} l S`,
  ].join("\n");
}

function textLine(xMm, yFromTopMm, pageHeightMm, sizePt, text) {
  const x = mm(xMm);
  const y = mm(pageHeightMm - yFromTopMm);
  return `BT /F1 ${sizePt} Tf 1 0 0 1 ${x} ${y} Tm ${hexGids(text, PDF_FONT.gids)} Tj ET`;
}

function hairline(yFromTopMm, pageHeightMm, lay) {
  const y = mm(pageHeightMm - yFromTopMm);
  return [
    "0.72 0.74 0.76 RG 0.4 w",
    `${mm(lay.left)} ${y} m ${mm(lay.sidebar - lay.left)} ${y} l S`,
  ].join("\n");
}

function sidebarText({ filename, date, parameters, overLimit, ratio, sideSum, pageHeightMm, lay }) {
  const { caliper, paperType = "corrugated" } = parameters;
  const paperLabel = paperType === "white-card" ? "白卡纸" : "瓦楞纸板";
  const die = dielineSize(parameters);
  const contentW = lay.sidebar - lay.left * 2;
  const nameLines = wrapByWidth(stripExportExt(filename), lay.titlePt, contentW);
  const noteLines = wrapByWidth("首次投产前先打样核对", lay.valuePt, contentW);
  const parts = [];

  parts.push("1 1 1 rg");
  parts.push(textLine(lay.left, lay.header * 0.68, pageHeightMm, lay.titlePt, "包装刀模图纸"));

  let y = lay.header + lay.lineMm;
  const label = (text) => {
    parts.push("0.35 0.38 0.4 rg");
    parts.push(textLine(lay.left, y, pageHeightMm, lay.labelPt, text));
    y += lay.labelStep;
  };
  const value = (text, size = lay.valuePt) => {
    parts.push("0 0 0 rg");
    parts.push(textLine(lay.left, y, pageHeightMm, size, text));
    y += lay.lineMm;
  };
  const divider = () => {
    y += lay.blockGap * 0.35;
    parts.push(hairline(y, pageHeightMm, lay));
    y += lay.blockGap * 0.75;
  };

  label("文件名");
  for (const line of nameLines) value(line, lay.titlePt);
  divider();

  label("日期");
  value(date);
  label("纸厚");
  value(`${fmt(caliper)} mm`);
  label("纸型");
  value(paperLabel);
  divider();

  label("刀模尺寸");
  value(`L  ${fmt(die.length)} mm`);
  value(`W  ${fmt(die.width)} mm`);
  value(`D  ${fmt(die.depth)} mm`);
  divider();

  label("过抛");
  if (overLimit) {
    value("已超抛");
    value(`三边和 ${Math.round(sideSum)} cm`);
    value(`抛重 ${volumetricWeightKg(parameters, ratio).toFixed(1)} kg`);
  } else {
    value("未超抛");
    value(`三边和 ${Math.round(sideSum)} cm`);
  }
  divider();

  label("注意");
  for (const line of noteLines) value(line);
  return parts.join("\n");
}

function utf16Hex(text) {
  let hex = "FEFF";
  for (const char of text) hex += char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
  return `<${hex}>`;
}

/**
 * 图纸式单页 PDF：
 * 左侧 90mm 信息栏（灰底+分隔线）：文件名 / 日期 / 长宽高 / 纸厚 / 过抛 / 打样确认；
 * 右侧主区 1:1 mm 刀模。
 */
export function geometryToPdf(geometry, { filename = "dieline", date, ratio = 8000, sideLimit = 100 } = {}) {
  const { parameters } = geometry;
  const bounds = pointBounds(geometry.elements);
  const blankW = bounds.maxX - bounds.minX;
  const blankH = bounds.maxY - bounds.minY;
  const lay = makeLayout(blankW);
  const pageW = lay.sidebar + lay.gap + blankW + lay.margin;
  const pageH = blankH + 2 * lay.margin;
  const sideSum = sideSumCm(parameters);
  const overLimit = sideSum > sideLimit;
  const today = date ?? new Date().toLocaleDateString("sv-SE");

  const content = [
    sidebarBackground(pageH, lay),
    dielineStream(geometry, lay),
    sidebarText({
      filename,
      date: today,
      parameters,
      overLimit,
      ratio,
      sideSum,
      pageHeightMm: pageH,
      lay,
    }),
  ].join("\n");

  const fontBytes = Uint8Array.from(atob(PDF_FONT.base64), (c) => c.charCodeAt(0));

  const toUnicode = toUnicodeStream(PDF_FONT.gids);
  const toUnicodeLen = toUnicode.length;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(pageW * MM_TO_PT)} ${round(pageH * MM_TO_PT)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+NotoSansSC /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 9 0 R >>`,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+NotoSansSC /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /DW 1000 /W ${cidWidthArray()} /CIDToGIDMap /Identity >>`,
    `<< /Type /FontDescriptor /FontName /AAAAAA+NotoSansSC /Flags 4 /FontBBox [-100 -300 1100 1000] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 /FontFile2 8 0 R >>`,
    "<< /Length 0 >>",
    `<< /Length ${toUnicodeLen} >>\nstream\n${toUnicode}\nendstream`,
  ];
  const info = `<< /Title ${utf16Hex(PROOF_NOTE)} /Subject ${utf16Hex(
    `${parameters.boxType || "0202A"} L${parameters.length} W${parameters.width} D${parameters.depth} CAL${parameters.caliper} PAPER ${parameters.paperType || "corrugated"}`,
  )} >>`;

  const encoder = new TextEncoder();
  const chunks = [];
  let pdfBytes = 0;
  const push = (text) => {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    pdfBytes += bytes.length;
  };

  push("%PDF-1.4\n%\x80\x80\x80\x80\n");
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdfBytes);
    if (index === 7) {
      const length = fontBytes.length;
      push(`${index + 1} 0 obj\n<< /Length ${length} /Length1 ${length} >>\nstream\n`);
      chunks.push(fontBytes);
      pdfBytes += length;
      push("endstream\nendobj\n");
      return;
    }
    push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });
  const infoOffset = pdfBytes;
  push(`11 0 obj\n${info}\nendobj\n`);
  const xrefOffset = pdfBytes;
  const xrefLineEnd = [32, 10].map((code) => String.fromCharCode(code)).join("");
  push(`xref\n0 12\n0000000000 65535 f${xrefLineEnd}`);
  for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n${xrefLineEnd}`);
  push(`${String(infoOffset).padStart(10, "0")} 00000 n${xrefLineEnd}`);
  push(`trailer\n<< /Size 12 /Root 1 0 R /Info 11 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const result = new Uint8Array(pdfBytes);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

function toUnicodeStream(gids) {
  const lines = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
  ];
  const entries = [];
  for (const [char, gid] of Object.entries(gids)) {
    const code = Number(gid).toString(16).toUpperCase().padStart(4, "0");
    const uni = char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
    entries.push(`<${code}> <${uni}>`);
  }
  lines.push(`${entries.length} beginbfchar`);
  lines.push(...entries);
  lines.push("endbfchar");
  lines.push("endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end");
  return lines.join("\n");
}
