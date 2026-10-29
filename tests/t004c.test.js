import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { generateT004C } from "../src/generatorT004C.js";
import { createBoxTopology } from "../src/box-topology.js";
import { ThreePreview } from "../src/three-preview.js";
import { geometryToSvg } from "../src/svg.js";
import { geometryToPdf } from "../src/pdf.js";

const reference = JSON.parse(readFileSync(new URL("../reference/t004c/packmage-samples.json", import.meta.url), "utf8"));
const parameters = (sample) => {
  const p = Object.fromEntries(sample.data.ce.split(",").map((s) => s.split("=")).map(([k, v]) => [k, Number(v)]));
  return { length: p.l, width: p.w, depth: p.d, caliper: p.cal, paperType: p.cal < 1 ? "white-card" : "corrugated", t004cTongueStyle: p.sty13 };
};
const area = (p) => Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
function intersects(points) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < points.length; i++) for (let j = i + 2; j < points.length; j++) {
    if (i === 0 && j === points.length - 1) continue;
    const a = points[i], b = points[(i + 1) % points.length], c = points[j], d = points[(j + 1) % points.length];
    if (cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8) return true;
  }
  return false;
}

describe("T004C independent dieline and folding model", () => {
  for (const sample of reference.samples) {
    it(`calibrates the cut/crease paths and 15-plane hierarchy: ${sample.input}`, () => {
      const p = parameters(sample), geometry = generateT004C(p), topology = createBoxTopology(geometry);
      expect(geometry.meta.width).toBeCloseTo(sample.data.de.Width, 2);
      expect(geometry.meta.height).toBeCloseTo(sample.data.de.Height, 2);
      expect(geometry.elements).toHaveLength(sample.data.fe.length);
      const offset = p.t004cTongueStyle === 1 ? -2 : 0;
      for (const [i, actual] of geometry.elements.entries()) {
        const expected = sample.data.fe[i];
        // The rear-bottom relief is solved as a true circle/line tangent.
        // The source kernel's rounded guide angle is not a tangent; all other
        // paths and every arc centre/radius are calibrated independently.
        if (i === 88 + offset) continue;
        expect(actual.length, `path ${i}`).toBe(expected.length);
        for (let j = 0; j < actual.length; j++) {
          if (actual[0] === 1 && j === 5 && (i === 17 || i === 87 + offset)) continue;
          const delta = actual[0] === 1 && j >= 5 ? Math.abs(((actual[j] - expected[j] + 540) % 360) - 180) : Math.abs(actual[j] - expected[j]);
          expect(delta, `path ${i}, value ${j}`).toBeLessThan(0.04);
        }
      }
      expect(topology.pieces).toHaveLength(15);
      expect(area(topology.pieces[0].netPoints)).toBeCloseTo(p.length * p.depth, 6);
      for (const [i, relation] of sample.data.ge.b.entries()) {
        const [id, parent = null] = relation.split(":"), piece = topology.pieces.find((p) => p.id === id);
        expect(piece.foldRule.parentId).toBe(parent);
        expect(piece.foldRule.phaseAngles).toEqual(sample.data.ge.p[i].c?.[4].map(Number) || [0]);
        if (parent) {
          const f = piece.foldRule.sourceLine, expected = sample.data.ge.p[i].c;
          for (const [j, value] of [f.x1, f.y1, f.x2, f.y2].entries()) expect(value).toBeCloseTo(expected[j], 1);
          expect(piece.foldLinesToDraw).toContainEqual(f);
          expect(topology.pieces.find((p) => p.id === parent).foldLinesToDraw).toContainEqual(f);
        }
        expect(intersects(piece.netPoints), `${id} self-intersection`).toBe(false);
        expect(area(piece.netPoints), `${id} degenerate plane`).toBeGreaterThan(1);
        expect(piece.netPoints.flat().every(Number.isFinite)).toBe(true);
      }
    });
  }

  it("keeps the rear relief tangent and the two Euro-slots open", () => {
    for (const sample of reference.samples) {
      const p = parameters(sample), g = generateT004C(p), offset = p.t004cTongueStyle === 1 ? -2 : 0;
      const arc = g.elements[87 + offset], cut = g.elements[88 + offset];
      const radius = new THREE.Vector2(cut[2] - arc[2], cut[3] - arc[3]);
      const side = new THREE.Vector2(cut[4] - cut[2], cut[5] - cut[3]);
      expect(radius.length()).toBeCloseTo(arc[4], 8);
      expect(radius.dot(side)).toBeCloseTo(0, 6);
      const topology = createBoxTopology(g);
      for (const id of ["M5", "M8"]) {
        const face = topology.pieces.find((piece) => piece.id === id);
        expect(face.holeNetPoints).toHaveLength(1);
        expect(intersects(face.holeNetPoints[0])).toBe(false);
        expect(area(face.holeNetPoints[0])).toBeGreaterThan(20);
      }
    }
  });

  it("generates textured closed-fold 3D meshes for both tongues at all phases", () => {
    for (const style of [1, 2]) {
      const topology = createBoxTopology(generateT004C({ length: 120, width: 100, depth: 200, caliper: 0.5, t004cTongueStyle: style }));
      const preview = Object.assign(Object.create(ThreePreview.prototype), {
        topology, model: new THREE.Group(), thickness: 0.5, foldProgress: 0,
        textureCanvas: { width: 4096, height: 3474 }, camera: new THREE.PerspectiveCamera(45, 1.8),
        paperMaterial: new THREE.MeshBasicMaterial(), edgeMaterial: new THREE.MeshBasicMaterial(), backPaperMaterial: new THREE.MeshBasicMaterial(), foldPaperMaterial: new THREE.MeshBasicMaterial(), foldBackPaperMaterial: new THREE.MeshBasicMaterial(),
      });
      preview.rebuildModel(false);
      for (let step = 0; step <= 9; step++) {
        preview.foldProgress = step / 9; preview.updateFoldTransforms(); preview.model.updateMatrixWorld(true);
        for (const piece of topology.pieces) {
          const group = preview.planeGroups.get(piece.id), mesh = group.children.find((c) => c.isMesh);
          expect(group.matrixWorld.elements.every(Number.isFinite)).toBe(true);
          expect([...mesh.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
          expect([...mesh.geometry.attributes.uv.array].every(Number.isFinite)).toBe(true);
          expect(mesh.geometry.groups.filter((g) => g.materialIndex === 3)).toHaveLength(piece.foldLinesToDraw.length);
          expect(mesh.geometry.groups.filter((g) => g.materialIndex === 4)).toHaveLength(piece.foldLinesToDraw.length);
        }
      }
      preview.clearModel();
    }
  });

  it("exports 1:1 SVG/PDF and supports the existing 50 mm width minimum", () => {
    for (const dims of [[50, 50, 50, 0.4], [350, 190, 230, 3], [120, 100, 200, 0.6]]) {
      const [length, width, depth, caliper] = dims, g = generateT004C({ length, width, depth, caliper, paperType: caliper < 1 ? "white-card" : "corrugated" });
      const svg = geometryToSvg(g), pdf = new TextDecoder().decode(geometryToPdf(g, { filename: "T004C", ratio: 8000, sideLimit: 100 }));
      expect(svg).toContain("<svg"); expect(/NaN|Infinity/.test(svg)).toBe(false);
      expect(pdf.startsWith("%PDF-1.4")).toBe(true);
      expect(/\b(?:NaN|Infinity)\b/.test(pdf.slice(pdf.indexOf("stream"), pdf.indexOf("endstream")))).toBe(false);
    }
    expect(() => generateT004C({ length: 120, width: 49, depth: 200, caliper: 0.5 })).toThrow(RangeError);
  });
});
