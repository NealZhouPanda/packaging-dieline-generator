import { geometryToSvg, pointBounds } from "./svg.js";
import { supportsBoxTopology } from "./box-topology.js";

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
  };
}

function imageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("贴图文件无法读取"));
    image.src = url;
  });
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
    this.artworkMaxSize = detectArtworkMaxSize();
    this.artworkCanvas = document.createElement("canvas");
    this.canvas.width = INITIAL_CANVAS_WIDTH;
    this.canvas.height = INITIAL_CANVAS_HEIGHT;

    fileInput.addEventListener("change", () => this.importFiles(fileInput.files));
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
    const unsupported = files.find((file) => !file.type.startsWith("image/") && !/\.svg$/i.test(file.name));
    if (unsupported) {
      this.setStatus("第一阶段支持 PNG、JPG、SVG 贴图；PDF 导入将在后续接入。", true);
      this.fileInput.value = "";
      return;
    }

    try {
      for (const file of files) {
        const url = URL.createObjectURL(file);
        const image = await imageFromUrl(url);
        this.layers.push({
          id: this.nextLayerId++,
          name: file.name,
          url,
          image,
          opacity: 1,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        });
      }
      this.fileInput.value = "";
      this.setStatus(`${this.layers.length} 个贴图图层，已同步到 3D 预览。`);
      this.render();
    } catch (reason) {
      this.setStatus(reason instanceof Error ? reason.message : "贴图导入失败", true);
    }
  }

  clear() {
    for (const layer of this.layers) URL.revokeObjectURL(layer.url);
    this.layers = [];
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
    URL.revokeObjectURL(this.layers[index].url);
    this.layers.splice(index, 1);
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
        const imageRatio = layer.image.naturalHeight / Math.max(1, layer.image.naturalWidth);
        layer.width = this.bounds.maxX - this.bounds.minX;
        layer.height = layer.width * imageRatio;
        if (layer.height > this.bounds.maxY - this.bounds.minY) {
          layer.height = this.bounds.maxY - this.bounds.minY;
          layer.width = layer.height / Math.max(0.01, imageRatio);
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

  render() {
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
    this.onChange?.(this.getArtworkCanvas());
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
      const name = document.createElement("span");
      name.textContent = layer.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "texture-layer-remove";
      remove.textContent = "删除";
      remove.addEventListener("click", () => this.removeLayer(layer.id));
      row.append(name, remove);
      this.layerList.append(row);
    }
  }
}
