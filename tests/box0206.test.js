import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { generate0206 } from "../src/generator0206.js";
import { createBoxTopology, supportsBoxTopology, phaseAngleAt } from "../src/box-topology.js";
import { ThreePreview } from "../src/three-preview.js";
import { geometryToSvg } from "../src/svg.js";
import { geometryToPdf } from "../src/pdf.js";
import { TextureEditor, canvasTransformFor } from "../src/texture-editor.js";

const fixture = JSON.parse(readFileSync(new URL("../reference/0206/packmage-samples.json", import.meta.url), "utf8"));
const make = ([length, width, depth, caliper], paperType = "corrugated") => generate0206({ length, width, depth, caliper, paperType });
const closeArray = (actual, expected, tolerance = 0.011) => actual.length === expected.length && actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);

function canonical(element) {
  if (element[0] !== 1) return element;
  const sweep = ((element[6] - element[5]) % 360 + 360) % 360;
  // Official output contains eight numerical slivers (<0.002 mm) at tangent
  // joins. Local geometry emits continuous exact quarter-circles instead.
  if (sweep < 0.1) return null;
  return element.map((v, i) => i >= 5 && Math.abs(v - Math.round(v / 90) * 90) < 0.1 ? Math.round(v / 90) * 90 : v);
}

describe("0206 official calibration", () => {
  for (const sample of fixture.samples) {
    it(`matches the official cut/crease paths at ${sample.input.join(" × ")}`, () => {
      const geometry = make(sample.input);
      const expected = sample.elements.map(canonical).filter(Boolean);
      expect(geometry.elements).toHaveLength(expected.length);
      for (const element of expected) {
        expect(geometry.elements.some((candidate) => closeArray(candidate, element)), JSON.stringify(element)).toBe(true);
      }
      expect(geometry.meta.width).toBeCloseTo(sample.meta.Width, 1);
      expect(geometry.meta.height).toBeCloseTo(sample.meta.Height, 1);
      expect(geometry.meta.foldLength).toBeCloseTo(sample.meta.DashLength, 1);
      // The official displayed cut length sums four chords per quarter-arc;
      // our vector paths retain the true circular length.
      expect(Math.abs(geometry.meta.solidLength - sample.meta.SolidLength)).toBeLessThan(sample.input[3] * 0.1 + 0.05);
    });

    it(`matches all 13 official plane contours and hinges at ${sample.input.join(" × ")}`, () => {
      const topology = createBoxTopology(make(sample.input));
      expect(supportsBoxTopology("0206")).toBe(true);
      expect(topology.pieces).toHaveLength(13);
      for (const [i, relation] of sample.planes.b.entries()) {
        const [id, parentId = null] = relation.split(":");
        const piece = topology.pieces.find((p) => p.id === id);
        const source = sample.planes.p[i];
        expect(piece.foldRule.parentId).toBe(parentId);
        expect(piece.foldRule.phaseAngles).toEqual(source.c?.[4].map(Number) || [0]);
        if (source.c) {
          const axis = piece.foldRule.sourceLine;
          expect(closeArray([axis.x1, axis.y1, axis.x2, axis.y2], source.c.slice(0, 4))).toBe(true);
        }
        const contour = source.a[0];
        const points = [];
        for (let j = 0; j < contour.length; j += 2) {
          const point = contour.slice(j, j + 2);
          if (!points.some((p) => closeArray(p, point))) points.push(point);
        }
        expect(piece.netPoints).toHaveLength(points.length);
        for (const point of points) expect(piece.netPoints.some((p) => closeArray(p, point)), `${id}: ${point}`).toBe(true);
        // Every incoming AND outgoing crease gets its own thickness seal.
        if (source.c) expect(piece.foldLinesToDraw).toContainEqual(piece.foldRule.sourceLine);
        for (const child of topology.pieces.filter((p) => p.foldRule.parentId === id)) {
          expect(piece.foldLinesToDraw).toContainEqual(child.foldRule.sourceLine);
        }
      }
    });
  }

  it("keeps independent dimensions and full-overlap flaps instead of 0201 half flaps", () => {
    const geometry = make([190, 350, 230, 3]);
    expect(geometry.parameters.width).toBe(350);
    const topology = createBoxTopology(geometry);
    const front = topology.pieces.find((p) => p.id === "M2").netPoints;
    expect(Math.max(...front.map((p) => p[1])) - Math.min(...front.map((p) => p[1]))).toBe(350);
    expect(geometry.compensation.shortFlap).toBe(95);
  });

  it("exports valid SVG and vector PDF for narrow boxes and white card", () => {
    for (const [dims, paper] of [[[50, 50, 50, 5], "corrugated"], [[350, 80, 230, 3], "corrugated"], [[350, 190, 230, 0.5], "white-card"]]) {
      const geometry = make(dims, paper);
      const svg = geometryToSvg(geometry);
      const pdf = new TextDecoder().decode(geometryToPdf(geometry, { filename: "0206", ratio: 8000, sideLimit: 100 }));
      expect(svg).toContain("<svg");
      expect(svg).not.toMatch(/NaN|Infinity/);
      expect(pdf.startsWith("%PDF-1.4")).toBe(true);
      expect(/\b(?:NaN|Infinity)\b/.test(pdf.slice(pdf.indexOf("stream"), pdf.indexOf("endstream")))).toBe(false);
    }
    expect(() => make([350, 49, 230, 3])).toThrow(RangeError);
  });

  it("builds textured 3D meshes with UVs and sealed creases through every fold phase", () => {
    const topology = createBoxTopology(make([350, 190, 230, 3]));
    const preview = Object.assign(Object.create(ThreePreview.prototype), {
      topology, model: new THREE.Group(), thickness: 3, foldProgress: 0,
      textureCanvas: { width: 4096, height: 2255 }, camera: new THREE.PerspectiveCamera(45, 1.7),
      paperMaterial: new THREE.MeshBasicMaterial(), edgeMaterial: new THREE.MeshBasicMaterial(),
      backPaperMaterial: new THREE.MeshBasicMaterial(), foldPaperMaterial: new THREE.MeshBasicMaterial(),
      foldBackPaperMaterial: new THREE.MeshBasicMaterial(),
    });
    preview.rebuildModel(false);
    expect(preview.planeGroups.size).toBe(13);
    for (let i = 0; i <= 8; i++) {
      preview.foldProgress = i / 8;
      preview.updateFoldTransforms();
      preview.model.updateMatrixWorld(true);
      for (const piece of topology.pieces) {
        const mesh = preview.planeGroups.get(piece.id).children.find((child) => child.isMesh);
        expect([...mesh.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
        const uv = mesh.geometry.attributes.uv;
        expect([...uv.array].every(Number.isFinite)).toBe(true);
        // Cut-edge atlas UVs intentionally repeat outside [0,1]; printed
        // surface UVs must stay inside the imported artwork canvas.
        for (const group of mesh.geometry.groups.filter((g) => g.materialIndex === 0)) {
          for (let j = group.start; j < group.start + group.count; j++) {
            const vertex = mesh.geometry.index.getX(j);
            expect(uv.getX(vertex)).toBeGreaterThanOrEqual(-0.001);
            expect(uv.getX(vertex)).toBeLessThanOrEqual(1.001);
            expect(uv.getY(vertex)).toBeGreaterThanOrEqual(-0.001);
            expect(uv.getY(vertex)).toBeLessThanOrEqual(1.001);
          }
        }
        // Fold strips use front/back paper, not a corrugated cut-edge material.
        expect(mesh.geometry.groups.filter((group) => group.materialIndex === 3)).toHaveLength(piece.foldLinesToDraw.length);
        expect(mesh.geometry.groups.filter((group) => group.materialIndex === 4)).toHaveLength(piece.foldLinesToDraw.length);
        const angle = phaseAngleAt(piece.foldRule.phaseAngles, preview.foldProgress, 9);
        expect(Number.isFinite(angle)).toBe(true);
        expect(preview.planeGroups.get(piece.id).matrixWorld.elements.every(Number.isFinite)).toBe(true);
      }
    }
    // The two full-overlap top covers are parallel, separated by exactly
    // one caliper; they must not occupy the same plane and flicker.
    const planePoint = (id, point) => point.sub(preview.planeSpecs.get(id).foldOrigin).applyMatrix4(preview.planeGroups.get(id).matrixWorld);
    const upperA = planePoint("M2", new THREE.Vector3(175, 6, 0));
    const upperB = planePoint("M6", new THREE.Vector3(-365, 3, 0));
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(preview.planeGroups.get("M2").matrixWorld);
    expect(Math.abs(upperA.sub(upperB).dot(normal)) / preview.model.scale.x).toBeCloseTo(3, 6);
    preview.clearModel();
  });

  it("accepts 0206 artwork and keeps PDF physical size while allowing drag alignment", () => {
    const canvas = {
      width: 1280, height: 704, classList: { add: vi.fn(), remove: vi.fn() }, focus: vi.fn(),
      setPointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 352 }),
    };
    const editor = Object.assign(Object.create(TextureEditor.prototype), {
      canvas, bounds: null, layers: [], render: vi.fn(), renderLayerList: vi.fn(), setStatus: vi.fn(),
    });
    editor.setGeometry(make([350, 190, 230, 3]));
    expect(editor.geometry.meta.boxId).toBe("0206");
    const pdf = { id: 1, image: { width: 4096, height: 2389 }, physicalWidth: 1200, physicalHeight: 700, width: 0, height: 0, x: 0, y: 0, opacity: 1 };
    editor.layers.push(pdf);
    const context = { canvas, clearRect: vi.fn(), drawImage: vi.fn() };
    editor.drawArtwork(context);
    expect([pdf.width, pdf.height]).toEqual([1200, 700]);
    expect(context.drawImage).toHaveBeenCalledOnce();
    const original = [pdf.x, pdf.y];
    const transform = canvasTransformFor(editor.bounds, canvas.width, canvas.height);
    const start = transform.point(0, 0);
    const finish = transform.point(10, -5);
    const event = (point) => ({ button: 0, pointerId: 1, clientX: point[0] / 2, clientY: point[1] / 2, preventDefault: vi.fn() });
    editor.startDrag(event(start));
    editor.moveDrag(event(finish));
    expect(pdf.x - original[0]).toBeCloseTo(10, 8);
    expect(pdf.y - original[1]).toBeCloseTo(-5, 8);
    expect(editor.render).toHaveBeenLastCalledWith({ syncArtwork: false });
    editor.endDrag(event(finish));
    expect(editor.render).toHaveBeenLastCalledWith();
    expect(editor.dragState).toBeNull();
    editor.moveActiveLayerByKeyboard({ key: "ArrowRight", shiftKey: true, preventDefault: vi.fn() });
    expect(pdf.x - original[0]).toBeCloseTo(15, 8);
  });
});
