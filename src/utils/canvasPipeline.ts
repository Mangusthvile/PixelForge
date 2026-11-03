import {
  keyOutMagentaData,
  applyPaletteLockData,
  removeStrayPixelsData,
  detectPixelScale,
  downscaleNearestNeighborData,
  downscaleBlockModeData,
  computeGridScale,
  getFrameBounds,
  getGridCellBounds,
  extractPaletteFromData,
} from './pipeline';
import { CleanupSettings, GenerationConfig, StyleProfile, ParallaxLayer } from '../types';
import { loadImage } from './export';
import { getGridDimensions, detectCopyOfFrames } from './gridLayout';

export interface PipelineResult {
  cleanedCanvas: HTMLCanvasElement;
  cleanedDataUrl: string;
  detectedScale: number;
  actualScaleUsed: number;
  /** Set for Template Fill results: exact scale from the known grid (may be fractional). */
  computedScale?: number;
  frames: string[]; // data URLs
  frameWarning?: string;
  baselineY: number;
  parallaxLayers?: ParallaxLayer[];
  hasCopiedAnchor?: boolean;
  copyWarning?: string;
}

export async function runCleanupPipeline(
  sourceImageSrc: string,
  config: GenerationConfig,
  profile: StyleProfile,
  settings: CleanupSettings
): Promise<PipelineResult> {
  let safeSrc = sourceImageSrc;
  if (!safeSrc.startsWith('data:') && typeof window !== 'undefined') {
    try {
      const resp = await fetch(safeSrc);
      const blob = await resp.blob();
      safeSrc = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('Failed to convert image to data URL:', e);
    }
  }

  const img = await loadImage(safeSrc);
  const rawW = img.naturalWidth || img.width;
  const rawH = img.naturalHeight || img.height;

  // 1. Calculate target size and grid structure
  const frameCount =
    settings.frameCountOverride > 0 ? settings.frameCountOverride : config.frameCount || 1;
  const gridDims = getGridDimensions(frameCount);
  const cols = settings.gridCols || gridDims.cols;
  const rows = settings.gridRows || gridDims.rows;

  let targetW = config.frameWidth;
  let targetH = config.frameHeight;

  if (config.type === 'animation') {
    // Sized to the full grid layout
    targetW = config.frameWidth * cols;
    targetH = config.frameHeight * rows;
  } else if (config.type === 'background') {
    targetW = config.frameWidth || 320;
    targetH = config.frameHeight || 64;
  }

  // 2. Scale. Template Fill results are grid-based, so the scale is computed from the
  // known layout; auto-detection is only used for assets that aren't grid-based.
  const isTemplateGrid = config.type === 'animation' && config.animationMode === 'template';
  const computedScale = isTemplateGrid ? computeGridScale(rawW, cols, config.frameWidth) : undefined;
  const detectedScale =
    computedScale !== undefined
      ? Math.max(1, Math.round(computedScale))
      : detectPixelScale(rawW, rawH, config.frameWidth, config.frameHeight, config.type === 'animation' ? cols : 1);

  const actualScale = settings.scaleOverride > 0 ? settings.scaleOverride : detectedScale;

  // 3. Initial Canvas from raw image
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = rawW;
  rawCanvas.height = rawH;
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true })!;
  rawCtx.drawImage(img, 0, 0);

  let curPixels: any = rawCtx.getImageData(0, 0, rawW, rawH).data;
  let curW = rawW;
  let curH = rawH;

  // Step A: Key out magenta background & guide lines (unless it's a solid background without keying)
  if (settings.keyMagenta && config.type !== 'background') {
    keyOutMagentaData(curPixels, settings.magentaTolerance);
  }

  // Step B: Pixel snap downscale to target grid
  if (settings.pixelSnap && (curW > targetW || curH > targetH)) {
    // Grid results: majority color per scale x scale block (robust to half-pixel offsets).
    const downscaled = isTemplateGrid
      ? downscaleBlockModeData(curPixels, curW, curH, targetW, targetH)
      : downscaleNearestNeighborData(curPixels, curW, curH, targetW, targetH);
    curPixels = downscaled;
    curW = targetW;
    curH = targetH;
  }

  // Step C: Remove stray pixels & sanitize alpha
  if (settings.removeStrayPixels) {
    removeStrayPixelsData(curPixels, curW, curH);
  }

  // Step D: Palette Lock
  if (settings.paletteLock && profile.palette && profile.palette.length > 0) {
    applyPaletteLockData(curPixels, profile.palette);
  }

  // Render to cleaned intermediate grid canvas
  const cleanedCanvas = document.createElement('canvas');
  cleanedCanvas.width = curW;
  cleanedCanvas.height = curH;
  const cleanedCtx = cleanedCanvas.getContext('2d', { willReadFrequently: true })!;
  const cleanedImageData = cleanedCtx.createImageData(curW, curH);
  cleanedImageData.data.set(curPixels);
  cleanedCtx.putImageData(cleanedImageData, 0, 0);

  // Step E: Animation slicing in reading order & baseline alignment
  const frames: string[] = [];
  const framePixelArrays: Uint8ClampedArray[] = [];
  let frameWarning: string | undefined;
  let copyWarning: string | undefined;
  let hasCopiedAnchor = false;
  let baselineY = -1;

  if (config.type === 'animation' && settings.sliceFrames) {
    // Slicing reading order: row by row, column by column
    const cellW = Math.max(1, Math.floor(curW / cols));
    const cellH = Math.max(1, Math.floor(curH / rows));
    const boundsList: Array<{ minX: number; maxX: number; minY: number; maxY: number; hasContent: boolean }> = [];
    let emptyCount = 0;

    for (let f = 0; f < frameCount; f++) {
      const c = f % cols;
      const r = Math.floor(f / cols);

      const startX = c * cellW;
      const endX = Math.min(curW, (c + 1) * cellW);
      const startY = r * cellH;
      const endY = Math.min(curH, (r + 1) * cellH);

      const bounds = getGridCellBounds(curPixels, curW, curH, startX, endX, startY, endY);
      boundsList.push(bounds);
      if (!bounds.hasContent) emptyCount++;
    }

    if (emptyCount > 0 && frameCount > 1) {
      frameWarning = `Detected only ${frameCount - emptyCount} visible frames out of ${frameCount} requested. You can override frame count or retry.`;
    }

    // Determine baseline Y across all frames (bottom-most pixel row relative to cell origin)
    let maxRelativeBottomY = -1;
    for (let f = 0; f < frameCount; f++) {
      const b = boundsList[f];
      if (b.hasContent) {
        const r = Math.floor(f / cols);
        const cellTop = r * cellH;
        const relativeY = b.maxY - cellTop;
        if (relativeY > maxRelativeBottomY) {
          maxRelativeBottomY = relativeY;
        }
      }
    }

    baselineY =
      settings.baselineY >= 0
        ? settings.baselineY
        : maxRelativeBottomY >= 0
        ? maxRelativeBottomY
        : config.frameHeight - 2;

    // Slice and align each frame into its individual canvas (config.frameWidth x config.frameHeight)
    for (let f = 0; f < frameCount; f++) {
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = config.frameWidth;
      frameCanvas.height = config.frameHeight;
      const fCtx = frameCanvas.getContext('2d', { willReadFrequently: true })!;
      fCtx.imageSmoothingEnabled = false;

      const bounds = boundsList[f];
      const c = f % cols;
      const r = Math.floor(f / cols);
      const cellTop = r * cellH;

      if (bounds.hasContent) {
        const charW = bounds.maxX - bounds.minX + 1;
        const charH = bounds.maxY - bounds.minY + 1;

        // Horizontally center character in target frame
        const targetX = Math.round((config.frameWidth - charW) / 2);
        // Vertically place character so its feet (maxY) align with baselineY
        const targetY = baselineY - charH + 1;

        fCtx.drawImage(
          cleanedCanvas,
          bounds.minX,
          bounds.minY,
          charW,
          charH,
          targetX,
          targetY,
          charW,
          charH
        );
      }

      const fDataUrl = frameCanvas.toDataURL('image/png');
      frames.push(fDataUrl);

      // Collect raw pixels for copy detection
      const fPixels = fCtx.getImageData(0, 0, config.frameWidth, config.frameHeight).data;
      framePixelArrays.push(fPixels);
    }

    // Copy Detection
    if (frames.length > 1) {
      const copyCheck = detectCopyOfFrames(framePixelArrays, config.frameWidth, config.frameHeight);
      if (copyCheck.isCopied) {
        hasCopiedAnchor = true;
        copyWarning =
          'The model copied the anchor. Try again, switch to Frame by frame, or use a stronger model.';
      }
    }

    // Reassemble into ONE HORIZONTAL ROW for library, preview, and export
    const rowCanvas = document.createElement('canvas');
    rowCanvas.width = config.frameWidth * frameCount;
    rowCanvas.height = config.frameHeight;
    const rowCtx = rowCanvas.getContext('2d', { willReadFrequently: true })!;
    rowCtx.imageSmoothingEnabled = false;

    for (let f = 0; f < frameCount; f++) {
      const imgElem = await loadImage(frames[f]);
      rowCtx.drawImage(imgElem, f * config.frameWidth, 0);
    }

    const rowDataUrl = rowCanvas.toDataURL('image/png');

    return {
      cleanedCanvas: rowCanvas,
      cleanedDataUrl: rowDataUrl,
      detectedScale,
      actualScaleUsed: actualScale,
      computedScale,
      frames,
      frameWarning,
      baselineY,
      hasCopiedAnchor,
      copyWarning,
    };
  }

  // Single asset or background
  const cleanedDataUrl = cleanedCanvas.toDataURL('image/png');
  frames.push(cleanedDataUrl);

  let parallaxLayers: ParallaxLayer[] | undefined;
  if (config.type === 'background' && config.splitParallax) {
    parallaxLayers = splitBackgroundParallax(cleanedCanvas, curW, curH);
  }

  return {
    cleanedCanvas,
    cleanedDataUrl,
    detectedScale,
    actualScaleUsed: actualScale,
    computedScale,
    frames,
    frameWarning,
    baselineY,
    parallaxLayers,
    hasCopiedAnchor,
    copyWarning,
  };
}

// Split a layered side-view background into Sky, Far, Mid, Near layers
function splitBackgroundParallax(
  sourceCanvas: HTMLCanvasElement,
  w: number,
  h: number
): ParallaxLayer[] {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
  const originalData = ctx.getImageData(0, 0, w, h).data;

  // Sky layer (top ~30% height)
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = w;
  skyCanvas.height = h;
  const skyCtx = skyCanvas.getContext('2d')!;
  const skyImgData = skyCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (y < h * 0.45) {
        skyImgData.data[idx] = originalData[idx];
        skyImgData.data[idx + 1] = originalData[idx + 1];
        skyImgData.data[idx + 2] = originalData[idx + 2];
        skyImgData.data[idx + 3] = originalData[idx + 3];
      }
    }
  }
  skyCtx.putImageData(skyImgData, 0, 0);

  // Far layer (~25% to 65% height)
  const farCanvas = document.createElement('canvas');
  farCanvas.width = w;
  farCanvas.height = h;
  const farCtx = farCanvas.getContext('2d')!;
  const farImgData = farCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (y >= h * 0.25 && y < h * 0.65) {
        farImgData.data[idx] = originalData[idx];
        farImgData.data[idx + 1] = originalData[idx + 1];
        farImgData.data[idx + 2] = originalData[idx + 2];
        farImgData.data[idx + 3] = originalData[idx + 3];
      }
    }
  }
  farCtx.putImageData(farImgData, 0, 0);

  // Mid layer (~45% to 85% height)
  const midCanvas = document.createElement('canvas');
  midCanvas.width = w;
  midCanvas.height = h;
  const midCtx = midCanvas.getContext('2d')!;
  const midImgData = midCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (y >= h * 0.45 && y < h * 0.85) {
        midImgData.data[idx] = originalData[idx];
        midImgData.data[idx + 1] = originalData[idx + 1];
        midImgData.data[idx + 2] = originalData[idx + 2];
        midImgData.data[idx + 3] = originalData[idx + 3];
      }
    }
  }
  midCtx.putImageData(midImgData, 0, 0);

  // Near layer (~65% to 100% height)
  const nearCanvas = document.createElement('canvas');
  nearCanvas.width = w;
  nearCanvas.height = h;
  const nearCtx = nearCanvas.getContext('2d')!;
  const nearImgData = nearCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (y >= h * 0.65) {
        nearImgData.data[idx] = originalData[idx];
        nearImgData.data[idx + 1] = originalData[idx + 1];
        nearImgData.data[idx + 2] = originalData[idx + 2];
        nearImgData.data[idx + 3] = originalData[idx + 3];
      }
    }
  }
  nearCtx.putImageData(nearImgData, 0, 0);

  return [
    { name: 'sky', image: skyCanvas.toDataURL('image/png'), speed: 0.1 },
    { name: 'far', image: farCanvas.toDataURL('image/png'), speed: 0.3 },
    { name: 'mid', image: midCanvas.toDataURL('image/png'), speed: 0.6 },
    { name: 'near', image: nearCanvas.toDataURL('image/png'), speed: 1.0 },
  ];
}

// Utility to extract palette from an image URL
export async function extractPaletteFromImageUrl(url: string, maxColors = 32): Promise<string[]> {
  let safeSrc = url;
  if (!safeSrc.startsWith('data:') && typeof window !== 'undefined') {
    try {
      const resp = await fetch(safeSrc);
      const blob = await resp.blob();
      safeSrc = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      // ignore
    }
  }
  const img = await loadImage(safeSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return extractPaletteFromData(data, maxColors);
}
