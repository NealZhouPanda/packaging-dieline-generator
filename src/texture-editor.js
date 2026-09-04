import { geometryToSvg, pointBounds } from "./svg.js";
import { supportsBoxTopology } from "./box-topology.js";
import { isPdfFile, renderPdfFirstPage } from "./pdf-texture.js";

const INITIAL_CANVAS_WIDTH = 1280;
const INITIAL_CANVAS_HEIGHT = 480;

// Packmage's artwork editor probes a 4096px canvas and falls back to 2290px
// when that allocation cannot be read back. Its 3D texture is then resized to
// the editor's output canvas instead of staying at the renderer's initial
// 2048px size.
export const OFFICIAL_ARTWORK_MAX_SIZE = 4096;
export const OFFICIAL_ARTWORK_FALLBACK_SIZE = 2290;
const EDITOR_PREVIEW_MAX_SIZE = 2048;

export function artworkCanvasSizeFor(bounds, maxSize = OFFICIAL_ARTWORK_MAX_SIZE) {
  if (!bounds) return { width: INITIAL_CANVAS_WIDTH, height: INITIAL_CANVAS_HEIGHT };
  const netWidth = Math.max(1, bounds.maxX - bounds.minX);
  const netHeight = Math.max(1, bounds.maxY - bounds.minY);
  const longestEdge = Math.max(1, Number(maxSize) || OFFICIAL_ARTWORK_FALLBACK_SIZE);
  const scale = longestEdge / Math.max(netWidth, netHeight);
  return {
    width: Math.max(1, Math.floor(netWidth * scale)),
    height: Math.max(1, Math.floor(netHeight * scale)),
  };
}

export function detectArtworkMaxSize() {
  if (typeof document === "undefined") return OFFICIAL_ARTWORK_FALLBACK_SIZE;
  try {
    const probe = document.createElement("canvas");
    probe.width = OFFICIAL_ARTWORK_MAX_SIZE;
    probe.height = OFFICIAL_ARTWORK_MAX_SIZE;
    const context = probe.getContext("2d");
    if (!context) return OFFICIAL_ARTWORK_FALLBACK_SIZE;
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data[0]
      ? OFFICIAL_ARTWORK_MAX_SIZE
      : OFFICIAL_ARTWORK_FALLBACK_SIZE;
  } catch {
    return OFFICIAL_ARTWORK_FALLBACK_SIZE;
  }
}

/**
 * Return the exact net-to-canvas transform used by the texture editor.
 *
 * The 3D preview samples the same artwork canvas, so it must use this
 * transform instead of normalising raw dieline coordinates to [0, 1].
 */
export function canvasTransformFor(bounds, canvasWidth, canvasHeight, padding = 36) {
  if (!bounds) {
    return {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      point: () => [0, 0],
      unpoint: () => [0, 0],
    };
  }
  const netWidth = Math.max(1, bounds.maxX - bounds.minX);
  const netHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (canvasWidth - padding * 2) / netWidth,
    (canvasHeight - padding * 2) / netHeight,
  );
  const offsetX = (canvasWidth - netWidth * scale) / 2;
  const offsetY = (canvasHeight - netHeight * scale) / 2;
  return {
    scale,
    offsetX,
    offsetY,
    point: (x, y) => [offsetX + (x - bounds.minX) * scale, offsetY + (y - bounds.minY) * scale],
    unpoint: (x, y) => [bounds.minX + (x - offsetX) / scale, bounds.minY + (y - offsetY) / scale],
  };
}

export function layerAtPoint(layers, x, y) {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (
      x >= layer.x
      && x <= layer.x + layer.width
      && y >= layer.y
      && y <= layer.y + layer.height
    ) return layer;
  }
  return null;
}

function imageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("贴图文件无法读取"));
    image.src = url;
  });
}

function imageDimensions(image) {
  return {
    width: image?.naturalWidth || image?.videoWidth || image?.width || 1,
    height: image?.naturalHeight || image?.videoHeight || image?.height || 1,
  };
}

function releaseLayer(layer) {
  if (layer?.url) URL.revokeObjectURL(layer.url);
}

export function arcPointsForCanvas(element) {
  const [, , cx, cy, radius, start, end] = element;
  // svg.js renders arcs from -end to -start with sweep=1. Canvas uses a
  // clockwise positive direction in screen coordinates, so unwrap the
  // positive SVG sweep instead of walking from end back to start directly.
  const sweep = ((end - start) % 360 + 360) % 360;
  const startAngle = (-end * Math.PI) / 180;
  const steps = Math.max(8, Math.ceil(sweep / 8));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + (sweep * Math.PI * index) / (180 * steps);
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });
}

function drawGeometryLine(context, element, transform) {
  const [type, fold] = element;
  context.strokeStyle = fold === 1 ? "#ef3f3f" : "#005cff";
  context.lineWidth = fold === 1 ? 1.5 : 1.4;
  context.setLineDash(fold === 1 ? [7, 4] : []);
  context.beginPath();

  if (type === 0) {
    context.moveTo(...transform(element[2], element[3]));
    context.lineTo(...transform(element[4], element[5]));
  } else if (type === 1) {
    for (const [index, [x, y]] of arcPointsForCanvas(element).entries()) {
      const point = transform(x, y);
      if (index === 0) context.moveTo(...point);
      else context.lineTo(...point);
    }
  } else if (type === 2) {
    for (let index = 2; index < element.length; index += 2) {
      const point = transform(element[index], element[index + 1]);
      if (index === 2) context.moveTo(...point);
      else context.lineTo(...point);
    }
  }
  context.stroke();
}

export class TextureEditor {
  constructor({ canvas, fileInput, layerList, status, onChange }) {
    this.canvas = canvas;
    this.fileInput = fileInput;
    this.layerList = layerList;
    this.status = status;
    this.onChange = onChange;
    this.geometry = null;
    this.bounds = null;
    this.layers = [];
    this.nextLayerId = 1;
    this.activeLayerId = null;
    this.dragState = null;
    this.artworkMaxSize = detectArtworkMaxSize();
    this.artworkCanvas = document.createElement("canvas");
    this.canvas.width = INITIAL_CANVAS_WIDTH;
    this.canvas.height = INITIAL_CANVAS_HEIGHT;

    fileInput.addEventListener("change", () => this.importFiles(fileInput.files));
    canvas.tabIndex = 0;
    canvas.addEventListener("pointerdown", (event) => this.startDrag(event));
    canvas.addEventListener("pointermove", (event) => this.moveDrag(event));
    canvas.addEventListener("pointerup", (event) => this.endDrag(event));
    canvas.addEventListener("pointercancel", (event) => this.endDrag(event));
    canvas.addEventListener("lostpointercapture", (event) => this.endDrag(event));
    canvas.addEventListener("keydown", (event) => this.moveActiveLayerByKeyboard(event));
    this.render();
  }

  setGeometry(geometry) {
    const previousBounds = this.bounds;
    this.geometry = supportsBoxTopology(geometry?.meta?.boxId) ? geometry : null;
    this.bounds = this.geometry ? pointBounds(this.geometry.elements) : null;
    if (previousBounds && this.bounds && (previousBounds.maxX - previousBounds.minX !== this.bounds.maxX - this.bounds.minX || previousBounds.maxY - previousBounds.minY !== this.bounds.maxY - this.bounds.minY)) {
      for (const layer of this.layers) {
        layer.x = 0;
        layer.y = 0;
        layer.width = 0;
        layer.height = 0;
      }
    }
    this.render();
  }

  async importFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const unsupported = files.find(
      (file) => !file.type.startsWith("image/") && !/\.svg$/i.test(file.name) && !isPdfFile(file),
    );
    if (unsupported) {
      this.setStatus("支持 PNG、JPG、SVG 或 PDF 贴图文件。", true);
      this.fileInput.value = "";
      return;
    }

    try {
      for (const file of files) {
        let url = "";
        let image;
        let name = file.name;
        let physicalWidth = 0;
        let physicalHeight = 0;
        if (isPdfFile(file)) {
          this.setStatus(`正在解析 ${file.name} 的第 1 页…`);
          const pdfLayer = await renderPdfFirstPage(file, { maxSize: this.artworkMaxSize });
          image = pdfLayer.canvas;
          physicalWidth = pdfLayer.physicalWidth;
          physicalHeight = pdfLayer.physicalHeight;
          if (pdfLayer.pageCount > 1) name = `${file.name}（第 1 页 / 共 ${pdfLayer.pageCount} 页）`;
        } else {
          url = URL.createObjectURL(file);
          image = await imageFromUrl(url);
        }
        const layer = {
          id: this.nextLayerId++,
          name,
          url,
          image,
          opacity: 1,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          physicalWidth,
          physicalHeight,
        };
        this.layers.push(layer);
        this.activeLayerId = layer.id;
      }
      this.fileInput.value = "";
      this.setStatus(`${this.layers.length} 个贴图图层，已同步到 3D 预览；PDF 默认导入第 1 页。`);
      this.render();
    } catch (reason) {
      this.setStatus(reason instanceof Error ? reason.message : "贴图导入失败", true);
    }
  }

  clear() {
    for (const layer of this.layers) releaseLayer(layer);
    this.layers = [];
    this.activeLayerId = null;
    this.setStatus("已清空贴图，3D 将恢复为纸张底色。");
    this.render();
  }

  reset() {
    for (const layer of this.layers) {
      layer.x = 0;
      layer.y = 0;
      layer.width = 0;
      layer.height = 0;
    }
    this.setStatus("贴图已恢复默认铺满刀模。");
    this.render();
  }

  removeLayer(id) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    releaseLayer(this.layers[index]);
    this.layers.splice(index, 1);
    if (this.activeLayerId === id) this.activeLayerId = this.layers.at(-1)?.id ?? null;
    this.setStatus("贴图图层已删除。");
    this.render();
  }

  setStatus(message, isError = false) {
    this.status.textContent = message;
    this.status.classList.toggle("is-error", isError);
  }

  canvasTransform() {
    return canvasTransformFor(this.bounds, this.canvas.width, this.canvas.height).point;
  }

  pointerNetPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return [0, 0];
    const canvasX = (event.clientX - rect.left) * this.canvas.width / rect.width;
    const canvasY = (event.clientY - rect.top) * this.canvas.height / rect.height;
    return canvasTransformFor(this.bounds, this.canvas.width, this.canvas.height).unpoint(canvasX, canvasY);
  }

  startDrag(event) {
    if (!this.bounds || event.button !== 0) return;
    const [x, y] = this.pointerNetPoint(event);
    const layer = layerAtPoint(this.layers, x, y);
    if (!layer) return;
    this.activeLayerId = layer.id;
    this.dragState = {
      pointerId: event.pointerId,
      layerId: layer.id,
      startX: layer.x,
      startY: layer.y,
      pointerX: x,
      pointerY: y,
    };
    this.canvas.setPointerCapture?.(event.pointerId);
    this.canvas.classList.add("is-dragging");
    this.canvas.focus({ preventScroll: true });
    this.renderLayerList();
    event.preventDefault();
  }

  moveDrag(event) {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
    const layer = this.layers.find(({ id }) => id === this.dragState.layerId);
    if (!layer) return;
    const [x, y] = this.pointerNetPoint(event);
    layer.x = this.dragState.startX + x - this.dragState.pointerX;
    layer.y = this.dragState.startY + y - this.dragState.pointerY;
    // Keep pointer feedback light; the high-resolution 3D texture is synced
    // once the pointer is released, matching the reference editor's workflow.
    this.render({ syncArtwork: false });
    event.preventDefault();
  }

  endDrag(event) {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
    this.dragState = null;
    this.canvas.classList.remove("is-dragging");
    if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.setStatus("贴图位置已更新，并同步到 3D 预览。");
    this.render();
    event.preventDefault();
  }

  moveActiveLayerByKeyboard(event) {
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!delta) return;
    const layer = this.layers.find(({ id }) => id === this.activeLayerId);
    if (!layer) return;
    const step = event.shiftKey ? 5 : 1;
    layer.x += delta[0] * step;
    layer.y += delta[1] * step;
    this.setStatus(`贴图已移动 ${step} mm，并同步到 3D 预览。`);
    this.render();
    event.preventDefault();
  }

  prepareCanvas() {
    const size = artworkCanvasSizeFor(this.bounds, EDITOR_PREVIEW_MAX_SIZE);
    this.canvas.width = size.width;
    this.canvas.height = size.height;
  }

  drawArtwork(context, { includePaper = false, padding = 36 } = {}) {
    const targetCanvas = context.canvas;
    context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    if (includePaper) {
      context.fillStyle = "#d7b78e";
      context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    }
    if (!this.bounds) return;

    const transform = canvasTransformFor(
      this.bounds,
      targetCanvas.width,
      targetCanvas.height,
      padding,
    ).point;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    for (const layer of this.layers) {
      if (!layer.width || !layer.height) {
        const imageSize = imageDimensions(layer.image);
        if (layer.physicalWidth > 0 && layer.physicalHeight > 0) {
          // Keep PDF artwork at its real-world page size in the dieline's
          // millimetre coordinate space. Raster downsampling only controls
          // clarity/memory and must not shrink the placed artwork.
          layer.width = layer.physicalWidth;
          layer.height = layer.physicalHeight;
        } else {
          const imageRatio = imageSize.height / Math.max(1, imageSize.width);
          layer.width = this.bounds.maxX - this.bounds.minX;
          layer.height = layer.width * imageRatio;
          if (layer.height > this.bounds.maxY - this.bounds.minY) {
            layer.height = this.bounds.maxY - this.bounds.minY;
            layer.width = layer.height / Math.max(0.01, imageRatio);
          }
        }
        layer.x = this.bounds.minX + ((this.bounds.maxX - this.bounds.minX) - layer.width) / 2;
        layer.y = this.bounds.minY + ((this.bounds.maxY - this.bounds.minY) - layer.height) / 2;
      }
      const [x, y] = transform(layer.x, layer.y);
      const [x2, y2] = transform(layer.x + layer.width, layer.y + layer.height);
      context.globalAlpha = layer.opacity;
      context.drawImage(layer.image, x, y, x2 - x, y2 - y);
      context.globalAlpha = 1;
    }
  }

  getArtworkCanvas({ includePaper = false } = {}) {
    const size = artworkCanvasSizeFor(this.bounds, this.artworkMaxSize);
    if (this.artworkCanvas.width !== size.width || this.artworkCanvas.height !== size.height) {
      this.artworkCanvas.width = size.width;
      this.artworkCanvas.height = size.height;
    }
    // The visible editor keeps a small margin around the dieline, while the
    // 3D texture uses the complete canvas so no pixels are wasted on padding.
    this.drawArtwork(this.artworkCanvas.getContext("2d"), { includePaper, padding: 0 });
    return this.artworkCanvas;
  }

  render({ syncArtwork = true } = {}) {
    this.prepareCanvas();
    const context = this.canvas.getContext("2d");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawArtwork(context);
    if (this.geometry && this.bounds) {
      const transform = this.canvasTransform();
      for (const element of this.geometry.elements) drawGeometryLine(context, element, transform);
      context.setLineDash([]);
      // Keep the SVG conversion referenced here so the canvas view and export
      // continue to share the same source geometry semantics.
      geometryToSvg(this.geometry);
    }
    this.renderLayerList();
    // The editor stays transparent like the reference web editor. The 3D
    // preview adds its own paper color before uploading this canvas as a map.
    if (syncArtwork) this.onChange?.(this.getArtworkCanvas());
  }

  renderLayerList() {
    this.layerList.replaceChildren();
    if (!this.layers.length) {
      const empty = document.createElement("p");
      empty.className = "texture-empty";
      empty.textContent = "尚未导入贴图";
      this.layerList.append(empty);
      return;
    }
    for (const layer of this.layers) {
      const row = document.createElement("div");
      row.className = "texture-layer";
      row.classList.toggle("is-active", layer.id === this.activeLayerId);
      row.addEventListener("click", () => {
        this.activeLayerId = layer.id;
        this.canvas.focus({ preventScroll: true });
        this.renderLayerList();
      });
      const name = document.createElement("span");
      name.textContent = layer.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "texture-layer-remove";
      remove.textContent = "删除";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        this.removeLayer(layer.id);
      });
      row.append(name, remove);
      this.layerList.append(row);
    }
  }
}
