import type {
  AdminSettings,
  AnimatedStickerOptions,
  BackgroundRemovalUploadOptions,
  StickerUploadOptions,
} from './api';
import type { BrushStroke, ImageEditOptions } from './image-editor';

export function isAnimatedSourceFile(file: File) {
  return file.type === 'image/gif' || file.type === 'image/webp' || /\.(gif|webp)$/i.test(file.name);
}

function animatedOptionsFromEdit(
  file: File,
  isAnimatedPack: boolean,
  options: ImageEditOptions,
): AnimatedStickerOptions | undefined {
  if (!isAnimatedPack || !isAnimatedSourceFile(file)) return undefined;
  return {
    animatedTrimStart: options.animatedTrimStart,
    animatedTrimEnd: options.animatedTrimEnd,
    animatedFrameRate: options.animatedFrameRate,
    animatedQuality: options.animatedCompress ? options.outputQuality : undefined,
  };
}

function backgroundRemovalOptionsFromEdit(
  isAnimatedPack: boolean,
  options: ImageEditOptions,
): BackgroundRemovalUploadOptions | undefined {
  if (isAnimatedPack || options.serverBackgroundRemovalMode === 'none') return undefined;
  return {
    backgroundRemovalMode: options.serverBackgroundRemovalMode,
    backgroundRemovalThreshold: options.backgroundThreshold,
    backgroundRemovalFeather: options.backgroundFeather,
    backgroundRemovalCleanupSpeckles: options.cleanupSpeckles,
    backgroundRemovalSpeckleSize: options.speckleSize,
  };
}

export function serverBackgroundRemovalMessage(
  mode: ImageEditOptions['serverBackgroundRemovalMode'],
  status?: AdminSettings['backgroundRemoval'],
) {
  if (mode === 'threshold') return 'Server threshold cleanup uses the same threshold, soft edge, and speckle controls.';
  if (!status)
    return 'Server AI availability is visible to admins; uploads fall back to threshold if no model is configured.';
  if (status.aiCommandConfigured)
    return 'Server AI command is configured; failed AI runs fall back to threshold cleanup.';
  return 'Server AI is not configured yet; this upload will use threshold fallback.';
}

export function stickerUploadOptionsFromEdit(
  file: File,
  isAnimatedPack: boolean,
  options: ImageEditOptions,
): StickerUploadOptions | undefined {
  return {
    ...animatedOptionsFromEdit(file, isAnimatedPack, options),
    ...backgroundRemovalOptionsFromEdit(isAnimatedPack, options),
  };
}

export async function editableUploadFile(file: File, isAnimatedPack: boolean, options: ImageEditOptions) {
  return isAnimatedPack && isAnimatedSourceFile(file) ? file : editImageFile(file, options);
}

async function editImageFile(file: File, options: ImageEditOptions) {
  if (!hasEffectiveImageEdits(options)) {
    return file;
  }

  const image = await loadImage(file);
  const canvas = renderImageEditCanvas(image, options);
  if (!canvas) return file;

  const blob = options.optimizeOutput
    ? await optimizeCanvasBlob(canvas, options.outputQuality)
    : await canvasToBlob(canvas, 'image/png');
  if (!blob) return file;

  return new File([blob], editedFileName(file, blob.type), { type: blob.type });
}

function hasEffectiveImageEdits(options: ImageEditOptions) {
  return (
    options.rotation !== 0 ||
    options.cropSquare ||
    options.normalizeSquare ||
    options.removeLightBackground ||
    options.outline ||
    options.shadow ||
    options.autoFitSubject ||
    hasColorAdjustments(options) ||
    options.optimizeOutput ||
    options.brushStrokes.length > 0 ||
    (options.textEnabled && options.textContent.trim().length > 0)
  );
}

export function hasColorAdjustments(options: ImageEditOptions) {
  return (
    options.brightness !== 0 ||
    options.contrast !== 0 ||
    options.saturation !== 0 ||
    options.sharpen !== 0 ||
    options.warmth !== 0 ||
    options.tint !== 0 ||
    options.grayscale
  );
}

export function renderImageEditCanvas(image: HTMLImageElement, options: ImageEditOptions) {
  const sourceSize = options.cropSquare
    ? Math.min(image.naturalWidth, image.naturalHeight) / Math.max(options.zoom, 1)
    : undefined;
  const sourceWidth = sourceSize ?? image.naturalWidth;
  const sourceHeight = sourceSize ?? image.naturalHeight;
  const sourceX = sourceSize
    ? clamp(
        (image.naturalWidth - sourceWidth) / 2 + ((image.naturalWidth - sourceWidth) / 2) * (options.offsetX / 100),
        0,
        image.naturalWidth - sourceWidth,
      )
    : 0;
  const sourceY = sourceSize
    ? clamp(
        (image.naturalHeight - sourceHeight) / 2 + ((image.naturalHeight - sourceHeight) / 2) * (options.offsetY / 100),
        0,
        image.naturalHeight - sourceHeight,
      )
    : 0;
  const rotated = options.rotation === 90 || options.rotation === 270;

  const canvas = document.createElement('canvas');
  const outputWidth = rotated ? sourceHeight : sourceWidth;
  const outputHeight = rotated ? sourceWidth : sourceHeight;
  const normalizedSide = options.normalizeSquare ? Math.max(outputWidth, outputHeight) : undefined;
  canvas.width = normalizedSide ?? outputWidth;
  canvas.height = normalizedSide ?? outputHeight;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((options.rotation * Math.PI) / 180);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -sourceWidth / 2,
    -sourceHeight / 2,
    sourceWidth,
    sourceHeight,
  );
  context.setTransform(1, 0, 0, 1, 0, 0);

  if (hasColorAdjustments(options)) {
    applyColorAdjustments(context, canvas.width, canvas.height, options);
  }

  const restoreSource = document.createElement('canvas');
  restoreSource.width = canvas.width;
  restoreSource.height = canvas.height;
  restoreSource.getContext('2d')?.drawImage(canvas, 0, 0);

  if (options.removeLightBackground) {
    removeLightBackground(context, canvas.width, canvas.height, options);
  }
  if (options.brushStrokes.length > 0) {
    applyBrushStrokes(context, canvas.width, canvas.height, options.brushStrokes, restoreSource);
  }
  if (options.autoFitSubject) {
    fitSubjectToCanvas(context, options.subjectPadding);
  }
  if (options.outline) {
    applyOutline(context, canvas.width, canvas.height);
  }
  if (options.shadow) {
    applyShadow(context, canvas.width, canvas.height);
  }
  if (options.textEnabled && options.textContent.trim()) {
    applyTextLayer(context, canvas.width, canvas.height, options);
  }

  return canvas;
}

export async function imageEditOutputSize(file: File, canvas: HTMLCanvasElement, options: ImageEditOptions) {
  if (!hasEffectiveImageEdits(options)) return file.size;
  const blob = options.optimizeOutput
    ? await optimizeCanvasBlob(canvas, options.outputQuality)
    : await canvasToBlob(canvas, 'image/png');
  return blob?.size ?? file.size;
}

export function ensurePreviewCanvasSize(canvas: HTMLCanvasElement) {
  if (canvas.width !== 512) canvas.width = 512;
  if (canvas.height !== 512) canvas.height = 512;
}

export function drawEditedPreview(canvas: HTMLCanvasElement, editedCanvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) return null;

  drawCheckerboard(context, canvas.width, canvas.height, 16);
  const scale = Math.min(canvas.width / editedCanvas.width, canvas.height / editedCanvas.height);
  const width = editedCanvas.width * scale;
  const height = editedCanvas.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.drawImage(editedCanvas, x, y, width, height);

  return {
    x: x / canvas.width,
    y: y / canvas.height,
    width: width / canvas.width,
    height: height / canvas.height,
  };
}

function removeLightBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: ImageEditOptions,
) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const threshold = clamp(options.backgroundThreshold, 180, 255);
  const feather = clamp(options.backgroundFeather, 0, 48);
  const tolerance = 28;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (colorSpread > tolerance) continue;

    if (brightness >= threshold) {
      data[index + 3] = 0;
      continue;
    }

    if (feather > 0 && brightness >= threshold - feather) {
      const distance = (threshold - brightness) / feather;
      data[index + 3] = Math.round(data[index + 3] * clamp(distance, 0, 1));
    }
  }

  if (options.cleanupSpeckles) {
    removeSmallAlphaIslands(imageData, width, height, options.speckleSize);
  }

  context.putImageData(imageData, 0, 0);
}

function removeSmallAlphaIslands(imageData: ImageData, width: number, height: number, maxArea: number) {
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const component: number[] = [];
  const areaLimit = clamp(Math.round(maxArea), 4, 180);

  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || data[start * 4 + 3] <= 12) continue;

    stack.length = 0;
    component.length = 0;
    stack.push(start);
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop() as number;
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [current - 1, current + 1, current - width, current + width];

      for (const neighbor of neighbors) {
        if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) continue;
        const neighborX = neighbor % width;
        const neighborY = Math.floor(neighbor / width);
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) continue;
        if (data[neighbor * 4 + 3] <= 12) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    if (component.length <= areaLimit) {
      for (const pixel of component) {
        data[pixel * 4 + 3] = 0;
      }
    }
  }
}

function applyColorAdjustments(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: ImageEditOptions,
) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const brightness = clamp(options.brightness, -100, 100) * 2.55;
  const contrast = clamp(options.contrast, -100, 100);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const saturationFactor = 1 + clamp(options.saturation, -100, 100) / 100;
  const warmth = clamp(options.warmth, -100, 100) * 0.9;
  const tint = clamp(options.tint, -100, 100) * 0.7;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    let red = data[index] + brightness + warmth + tint * 0.45;
    let green = data[index + 1] + brightness - tint * 0.6;
    let blue = data[index + 2] + brightness - warmth + tint * 0.45;

    red = contrastFactor * (red - 128) + 128;
    green = contrastFactor * (green - 128) + 128;
    blue = contrastFactor * (blue - 128) + 128;

    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    if (options.grayscale) {
      red = luminance;
      green = luminance;
      blue = luminance;
    } else {
      red = luminance + (red - luminance) * saturationFactor;
      green = luminance + (green - luminance) * saturationFactor;
      blue = luminance + (blue - luminance) * saturationFactor;
    }

    data[index] = clamp(Math.round(red), 0, 255);
    data[index + 1] = clamp(Math.round(green), 0, 255);
    data[index + 2] = clamp(Math.round(blue), 0, 255);
  }

  if (options.sharpen > 0) {
    sharpenImageData(imageData, width, height, clamp(options.sharpen, 0, 100) / 100);
  }

  context.putImageData(imageData, 0, 0);
}

function sharpenImageData(imageData: ImageData, width: number, height: number, amount: number) {
  const source = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel] * (1 + 4 * amount);
        const left = source[index - 4 + channel] * amount;
        const right = source[index + 4 + channel] * amount;
        const top = source[index - width * 4 + channel] * amount;
        const bottom = source[index + width * 4 + channel] * amount;
        data[index + channel] = clamp(Math.round(center - left - right - top - bottom), 0, 255);
      }
    }
  }
}

function applyBrushStrokes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokes: BrushStroke[],
  restoreSource: HTMLCanvasElement,
) {
  const restoreMask = document.createElement('canvas');
  restoreMask.width = width;
  restoreMask.height = height;
  const restoreMaskContext = restoreMask.getContext('2d');
  const restoreLayer = document.createElement('canvas');
  restoreLayer.width = width;
  restoreLayer.height = height;
  const restoreLayerContext = restoreLayer.getContext('2d');

  for (const stroke of strokes) {
    if (stroke.mode === 'erase') {
      context.save();
      context.globalCompositeOperation = 'destination-out';
      drawBrushStroke(context, stroke, width, height);
      context.restore();
      continue;
    }

    if (!restoreMaskContext || !restoreLayerContext) continue;
    restoreMaskContext.clearRect(0, 0, width, height);
    drawBrushStroke(restoreMaskContext, stroke, width, height);
    restoreLayerContext.clearRect(0, 0, width, height);
    restoreLayerContext.globalCompositeOperation = 'source-over';
    restoreLayerContext.drawImage(restoreSource, 0, 0);
    restoreLayerContext.globalCompositeOperation = 'destination-in';
    restoreLayerContext.drawImage(restoreMask, 0, 0);
    restoreLayerContext.globalCompositeOperation = 'source-over';
    context.drawImage(restoreLayer, 0, 0);
  }
}

function drawBrushStroke(context: CanvasRenderingContext2D, stroke: BrushStroke, width: number, height: number) {
  if (stroke.points.length === 0) return;
  const brushSize = Math.max(1, stroke.size * (Math.max(width, height) / 512));
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  context.strokeStyle = '#000';
  context.fillStyle = '#000';

  const [firstPoint, ...remainingPoints] = stroke.points;
  const firstX = firstPoint.x * width;
  const firstY = firstPoint.y * height;
  if (remainingPoints.length === 0) {
    context.beginPath();
    context.arc(firstX, firstY, brushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(firstX, firstY);
  for (const point of remainingPoints) {
    context.lineTo(point.x * width, point.y * height);
  }
  context.stroke();
  context.restore();
}

function applyTextLayer(context: CanvasRenderingContext2D, width: number, height: number, options: ImageEditOptions) {
  const text = options.textContent.trim();
  if (!text) return;
  const scale = Math.max(width, height) / 512;
  const fontSize = Math.max(8, options.textSize * scale);
  const strokeWidth = Math.max(0, options.textStrokeWidth * scale);
  const maxTextWidth = width * 0.92;
  const x = (options.textX / 100) * width;
  const y = (options.textY / 100) * height;

  context.save();
  context.translate(x, y);
  context.rotate((options.textRotation * Math.PI) / 180);
  context.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.miterLimit = 2;
  if (strokeWidth > 0) {
    context.lineWidth = strokeWidth;
    context.strokeStyle = options.textStrokeColor;
    context.strokeText(text, 0, 0, maxTextWidth);
  }
  context.fillStyle = options.textColor;
  context.fillText(text, 0, 0, maxTextWidth);
  context.restore();
}

function fitSubjectToCanvas(context: CanvasRenderingContext2D, paddingPercent: number) {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = context.canvas.width;
  sourceCanvas.height = context.canvas.height;
  sourceCanvas.getContext('2d')?.drawImage(context.canvas, 0, 0);
  const bounds = visiblePixelBounds(context, sourceCanvas.width, sourceCanvas.height);
  if (!bounds) return;

  const padding = clamp(paddingPercent, 0, 35) / 100;
  const paddedWidth = bounds.width * (1 + padding * 2);
  const paddedHeight = bounds.height * (1 + padding * 2);
  const cropSize = Math.min(Math.max(paddedWidth, paddedHeight), Math.max(sourceCanvas.width, sourceCanvas.height));
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const sourceX = clamp(centerX - cropSize / 2, 0, Math.max(0, sourceCanvas.width - cropSize));
  const sourceY = clamp(centerY - cropSize / 2, 0, Math.max(0, sourceCanvas.height - cropSize));

  context.canvas.width = 512;
  context.canvas.height = 512;
  context.clearRect(0, 0, 512, 512);
  context.drawImage(sourceCanvas, sourceX, sourceY, cropSize, cropSize, 0, 0, 512, 512);
}

function visiblePixelBounds(context: CanvasRenderingContext2D, width: number, height: number) {
  const data = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function applyOutline(context: CanvasRenderingContext2D, width: number, height: number) {
  const original = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  output.data.set(original.data);
  const radius = 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (original.data[index + 3] > 0) continue;

      let nearOpaque = false;
      for (let offsetY = -radius; offsetY <= radius && !nearOpaque; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
          if (original.data[(sampleY * width + sampleX) * 4 + 3] > 64) {
            nearOpaque = true;
            break;
          }
        }
      }

      if (nearOpaque) {
        output.data[index] = 18;
        output.data[index + 1] = 22;
        output.data[index + 2] = 25;
        output.data[index + 3] = 220;
      }
    }
  }

  context.putImageData(output, 0, 0);
}

function applyShadow(context: CanvasRenderingContext2D, width: number, height: number) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source.getContext('2d')?.drawImage(context.canvas, 0, 0);

  context.clearRect(0, 0, width, height);
  context.save();
  context.shadowColor = 'rgba(15, 23, 42, 0.35)';
  context.shadowBlur = 12;
  context.shadowOffsetY = 8;
  context.drawImage(source, 0, 0);
  context.restore();
  context.drawImage(source, 0, 0);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number, tileSize: number) {
  context.clearRect(0, 0, width, height);
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      context.fillStyle = (x / tileSize + y / tileSize) % 2 === 0 ? '#f7faf9' : '#d8e2df';
      context.fillRect(x, y, tileSize, tileSize);
    }
  }
}

export function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image preview failed'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function optimizeCanvasBlob(canvas: HTMLCanvasElement, initialQuality: number) {
  let quality = clamp(initialQuality, 35, 95) / 100;
  let bestBlob = await canvasToBlob(canvas, 'image/webp', quality);
  while (bestBlob && bestBlob.size > 100 * 1024 && quality > 0.35) {
    quality = Math.max(0.35, quality - 0.07);
    bestBlob = await canvasToBlob(canvas, 'image/webp', quality);
  }
  return bestBlob ?? canvasToBlob(canvas, 'image/png');
}

function editedFileName(file: File, mimeType = 'image/png') {
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'sticker';
  const extension = mimeType === 'image/webp' ? 'webp' : 'png';
  return `${baseName}-edited.${extension}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}