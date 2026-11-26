import crypto from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { generate0201, generateE005C, generateC001GX } from "../src/generators-legacy.js";
import { generate0202A } from "../src/generator0202a.js";
import { generate0421 } from "../src/generator0421.js";
import { generateK016A } from "../src/generatorK016A.js";
import { generate0206 } from "../src/generator0206.js";
import { generateT004C } from "../src/generatorT004C.js";
import { createBoxTopology, supportsBoxTopology } from "../src/box-topology.js";
import { geometryToSvg } from "../src/svg.js";
import { geometryToPdf } from "../src/pdf.js";

const BASELINE_PATH = new URL("./golden-baseline.json", import.meta.url);
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");

const GOLDEN_CASES = [
  ["0201-default", generate0201, { length: 350, width: 190, depth: 230, caliper: 5, paperType: "corrugated" }],
  ["0201-narrow", generate0201, { length: 350, width: 50, depth: 230, caliper: 3, paperType: "corrugated" }],
  ["0202A-default", generate0202A, { length: 350, width: 190, depth: 230, caliper: 3, paperType: "corrugated" }],
  ["0202A-large", generate0202A, { length: 405, width: 299, depth: 650, caliper: 5, paperType: "corrugated" }],
  ["0421-default", generate0421, { length: 350, width: 190, depth: 230, caliper: 5, paperType: "corrugated" }],
  ["0421-white-1mm", generate0421, { length: 300, width: 200, depth: 100, caliper: 1, paperType: "white-card" }],
  ["E005C-shallow", generateE005C, { length: 300, width: 200, depth: 50, caliper: 3, paperType: "corrugated" }],
  ["E005C-deep", generateE005C, { length: 350, width: 190, depth: 230, caliper: 3, paperType: "corrugated" }],
  ["C001GX-style2-wc", generateC001GX, { length: 350, width: 190, depth: 230, caliper: 0.5, paperType: "white-card", c001gxTongueStyle: 2 }],
  ["C001GX-style1-wc1", generateC001GX, { length: 300, width: 180, depth: 120, caliper: 1, paperType: "white-card", c001gxTongueStyle: 1 }],
  ["C001GX-corrugated", generateC001GX, { length: 320, width: 220, depth: 180, caliper: 3, paperType: "corrugated", c001gxTongueStyle: 2 }],
  ["K016A-default", generateK016A, { length: 350, width: 190, depth: 230, caliper: 3, paperType: "corrugated" }],
  ["K016A-base", generateK016A, { length: 200, width: 100, depth: 100, caliper: 1, paperType: "corrugated" }],
  ["0206-default", generate0206, { length: 350, width: 190, depth: 230, caliper: 3, paperType: "corrugated" }],
  ["0206-white", generate0206, { length: 240, width: 140, depth: 180, caliper: 0.5, paperType: "white-card" }],
  ["T004C-style2", generateT004C, { length: 120, width: 100, depth: 200, caliper: 0.5, paperType: "white-card", t004cTongueStyle: 2 }],
  ["T004C-style1", generateT004C, { length: 120, width: 100, depth: 200, caliper: 0.5, paperType: "white-card", t004cTongueStyle: 1 }],
  ["T004C-corrugated", generateT004C, { length: 350, width: 190, depth: 230, caliper: 3, paperType: "corrugated", t004cTongueStyle: 2 }],
];

function captureSnapshot(label, generate, params) {
  const geometry = generate(params);
  const svg = geometryToSvg(geometry, { withNote: true });
  const pdf = geometryToPdf(geometry, { filename: label, date: "2026-11-26", ratio: 8000, sideLimit: 100 });
  const topology = supportsBoxTopology(geometry.meta.boxId) ? createBoxTopology(geometry) : null;
  return {
    boxId: geometry.meta.boxId,
    elementCount: geometry.elements.length,
    meta: geometry.meta,
    compensation: geometry.compensation,
    elementsSha: sha(JSON.stringify(geometry.elements)),
    topologySha: topology ? sha(JSON.stringify(topology)) : null,
    svgSha: sha(svg),
    pdfSha: sha(pdf),
  };
}

if (process.env.UPDATE_GOLDEN === "1") {
  const baseline = {};
  for (const [label, generate, params] of GOLDEN_CASES) {
    baseline[label] = captureSnapshot(label, generate, params);
  }
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));

describe("Golden baseline: zero regression across all box types", () => {
  it.each(GOLDEN_CASES)("matches frozen geometry, topology, SVG and PDF for %s", (label, generate, params) => {
    const actual = captureSnapshot(label, generate, params);
    expect(actual).toEqual(baseline[label]);
  });
});
