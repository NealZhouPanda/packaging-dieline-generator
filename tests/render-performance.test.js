import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { generate0201 } from "../src/generators-legacy.js";
import { generate0206 } from "../src/generator0206.js";
import { createBoxTopology } from "../src/box-topology.js";
import { TextureEditor } from "../src/texture-editor.js";
import { ThreePreview } from "../src/three-preview.js";

describe("Phase 2 render and memory optimizations", () => {
  it("TextureEditor defers rendering while inactive and flushes on activation", () => {
    const editor = Object.assign(Object.create(TextureEditor.prototype), {
      bounds: null,
      geometry: null,
      layers: [],
      isActive: false,
      dirty: false,
      artworkCanvas: { width: 4096, height: 2048 },
      render: vi.fn(function () {
        this.dirty = false;
      }),
    });

    editor.setGeometry(generate0201({ length: 350, width: 190, depth: 230, caliper: 5 }));
    expect(editor.dirty).toBe(true);
    expect(editor.render).not.toHaveBeenCalled();

    // Without artwork layers, getArtworkCanvas avoids 4K allocation and returns null.
    expect(editor.getArtworkCanvas()).toBeNull();
    expect(editor.artworkCanvas.width).toBe(1);
    expect(editor.artworkCanvas.height).toBe(1);

    editor.setActive(true);
    expect(editor.render).toHaveBeenCalledOnce();
    expect(editor.render).toHaveBeenCalledWith({ syncArtwork: false });
    expect(editor.dirty).toBe(false);
  });

  it("ThreePreview defers geometry rebuild when hidden and shares wireframe material", () => {
    const geometry = generate0206({ length: 350, width: 190, depth: 230, caliper: 3 });
    const preview = Object.assign(Object.create(ThreePreview.prototype), {
      isActive: false,
      geometryDirty: false,
      pendingGeometry: null,
      topology: null,
      geometry: null,
      model: new THREE.Group(),
      thickness: 3,
      foldProgress: 1,
      textureCanvas: null,
      camera: new THREE.PerspectiveCamera(45, 1.6),
      paperMaterial: new THREE.MeshBasicMaterial(),
      edgeMaterial: new THREE.MeshBasicMaterial(),
      backPaperMaterial: new THREE.MeshBasicMaterial(),
      foldPaperMaterial: new THREE.MeshBasicMaterial(),
      foldBackPaperMaterial: new THREE.MeshBasicMaterial(),
      controls: { target: new THREE.Vector3(), reset: vi.fn(), update: vi.fn(), handleResize: vi.fn() },
      host: { clientWidth: 800, clientHeight: 500 },
      renderer: { setSize: vi.fn(), render: vi.fn() },
      requestRender: vi.fn(),
    });

    preview.setGeometry(geometry);
    expect(preview.geometryDirty).toBe(true);
    expect(preview.topology).toBeNull();
    expect(preview.model.children).toHaveLength(0);

    preview.setActive(true);
    expect(preview.geometryDirty).toBe(false);
    expect(preview.planeGroups.size).toBe(13);
    expect(preview.requestRender).toHaveBeenCalled();

    const lineMaterials = new Set();
    preview.model.traverse((child) => {
      if (child.isLineSegments) lineMaterials.add(child.material);
    });
    expect(lineMaterials.size).toBe(1);
    expect(lineMaterials.has(preview.wireframeMaterial)).toBe(true);

    preview.clearModel();
    expect(preview.model.children).toHaveLength(0);
  });

  it("ThreePreview skips GPU CanvasTexture when no artwork exists and reuses same-size texture", () => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: "",
    };
    const compositeCanvas = {
      width: 512,
      height: 256,
      getContext: () => context,
    };
    const preview = Object.assign(Object.create(ThreePreview.prototype), {
      textureCanvas: null,
      compositeCanvas,
      texture: null,
      paperColorInput: { value: "#d7b78e" },
      paperMaterial: new THREE.MeshStandardMaterial(),
      backPaperMaterial: new THREE.MeshStandardMaterial(),
      foldPaperMaterial: new THREE.MeshStandardMaterial(),
      foldBackPaperMaterial: new THREE.MeshStandardMaterial(),
      calAtlasImage: { complete: true, naturalWidth: 256 },
      refreshEdgeTexture: vi.fn(),
      requestRender: vi.fn(),
    });

    // No artwork: shrinks compositeCanvas to 1x1, no CanvasTexture created.
    preview.refreshTexture();
    expect(compositeCanvas.width).toBe(1);
    expect(compositeCanvas.height).toBe(1);
    expect(preview.texture).toBeNull();
    expect(preview.paperMaterial.map).toBeNull();
    expect(preview.refreshEdgeTexture).not.toHaveBeenCalled();

    // Artwork attached: creates one CanvasTexture, then reuses it on color change.
    const artwork = { width: 1024, height: 512 };
    preview.setTextureCanvas(artwork);
    const firstTexture = preview.texture;
    expect(firstTexture).toBeInstanceOf(THREE.CanvasTexture);
    expect(compositeCanvas.width).toBe(1024);
    expect(compositeCanvas.height).toBe(512);
    expect(preview.paperMaterial.map).toBe(firstTexture);

    preview.paperColorInput.value = "#ffffff";
    preview.refreshTexture();
    expect(preview.texture).toBe(firstTexture);
    expect(preview.refreshEdgeTexture).not.toHaveBeenCalled();

    firstTexture.dispose();
  });

  it("ThreePreview requestRender stays idle while inactive and coalesces frames while active", () => {
    const callbacks = [];
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((cb) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    try {
      const preview = Object.assign(Object.create(ThreePreview.prototype), {
        isActive: false,
        renderFrameId: 0,
        sliderFrameId: 0,
        isPointerInteracting: false,
        controls: { update: vi.fn() },
        renderer: { render: vi.fn() },
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(),
      });

      preview.requestRender();
      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();

      preview.isActive = true;
      preview.requestRender();
      preview.requestRender();
      preview.requestRender();
      expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

      callbacks[0]();
      expect(preview.controls.update).toHaveBeenCalledTimes(1);
      expect(preview.renderer.render).toHaveBeenCalledTimes(1);
      // Stays idle after settling (no extra rAF scheduled).
      expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

      // Deactivating cancels any pending frame.
      preview.requestRender();
      expect(preview.renderFrameId).toBe(2);
      preview.setActive(false);
      expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(2);
      expect(preview.renderFrameId).toBe(0);
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      globalThis.cancelAnimationFrame = originalCancel;
    }
  });

  it("ThreePreview generates valid [0,1] UVs even without an imported artwork canvas", () => {
    const topology = createBoxTopology(generate0201({ length: 350, width: 190, depth: 230, caliper: 5 }));
    const preview = Object.assign(Object.create(ThreePreview.prototype), {
      topology,
      model: new THREE.Group(),
      thickness: 5,
      foldProgress: 1,
      textureCanvas: null,
      camera: new THREE.PerspectiveCamera(45, 1.6),
      paperMaterial: new THREE.MeshBasicMaterial(),
      edgeMaterial: new THREE.MeshBasicMaterial(),
      backPaperMaterial: new THREE.MeshBasicMaterial(),
      foldPaperMaterial: new THREE.MeshBasicMaterial(),
      foldBackPaperMaterial: new THREE.MeshBasicMaterial(),
    });
    preview.rebuildModel(false);
    for (const piece of topology.pieces) {
      const mesh = preview.planeGroups.get(piece.id).children.find((child) => child.isMesh);
      const uv = mesh.geometry.attributes.uv;
      for (const group of mesh.geometry.groups.filter((g) => g.materialIndex === 0)) {
        for (let i = group.start; i < group.start + group.count; i += 1) {
          const v = mesh.geometry.index.getX(i);
          expect(uv.getX(v)).toBeGreaterThanOrEqual(-0.001);
          expect(uv.getX(v)).toBeLessThanOrEqual(1.001);
          expect(uv.getY(v)).toBeGreaterThanOrEqual(-0.001);
          expect(uv.getY(v)).toBeLessThanOrEqual(1.001);
        }
      }
    }
    preview.clearModel();
  });
});
