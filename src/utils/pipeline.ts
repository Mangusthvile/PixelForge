// Pure image processing algorithms for the PixelForge Cleanup Pipeline

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

export function hexToRgb(hex: string): RGB {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Weighted perceptual color distance
export function colorDistance(c1: RGB, c2: RGB): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

// Check if a color is considered magenta (#FF00FF)
export function isNearMagenta(rgb: RGB, tolerance: number): boolean {
  // Pure magenta is 255, 0, 255. Max distance ~765
  const magenta: RGB = { r: 255, g: 0, b: 255 };
  const dist = colorDistance(rgb, magenta);
  // tolerance scale 0 to 100 maps to distance threshold up to ~300
  const threshold = (tolerance / 100) * 320;
  if (dist <= threshold) return true;

  // Secondary heuristic for JPEG/compression noise around magenta:
  // Red and Blue high, Green low
  if (rgb.r > 190 && rgb.b > 190 && rgb.g < 70) {
    if (dist <= threshold * 1.5) return true;
  }
  return false;
}

// 1. Key out magenta background
export function keyOutMagentaData(
  pixels: Uint8ClampedArray,
  tolerance: number = 35
): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a === 0) continue;

    const rgb: RGB = {
      r: pixels[i],
      g: pixels[i + 1],
      b: pixels[i + 2],
    };

    if (isNearMagenta(rgb, tolerance)) {
      pixels[i + 3] = 0; // Transparent
    }
  }
}

// 2. Palette Lock: map each non-transparent pixel to closest color in profile palette
export function applyPaletteLockData(
  pixels: Uint8ClampedArray,
  paletteHexes: string[]
): void {
  if (!paletteHexes || paletteHexes.length === 0) return;

  const paletteRgb = paletteHexes.map(hexToRgb);

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;

    const current: RGB = {
      r: pixels[i],
      g: pixels[i + 1],
      b: pixels[i + 2],
    };

    let minDistance = Infinity;
    let closestColor = paletteRgb[0];

    for (const color of paletteRgb) {
      const dist = colorDistance(current, color);
      if (dist < minDistance) {
        minDistance = dist;
        closestColor = color;
      }
    }

    pixels[i] = closestColor.r;
    pixels[i + 1] = closestColor.g;
    pixels[i + 2] = closestColor.b;
  }
}

// 3. Remove stray pixels & sanitize alpha
export function removeStrayPixelsData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): void {
  // First snap alpha: <128 becomes 0, >=128 becomes 255
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i + 3] = pixels[i + 3] < 128 ? 0 : 255;
  }

  // Find isolated pixels (pixels with 0 or only 1 orthogonal non-transparent neighbor)
  const toClear: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (pixels[idx + 3] === 0) continue;

      let neighbors = 0;
      // Top
      if (y > 0 && pixels[((y - 1) * width + x) * 4 + 3] > 0) neighbors++;
      // Bottom
      if (y < height - 1 && pixels[((y + 1) * width + x) * 4 + 3] > 0) neighbors++;
      // Left
      if (x > 0 && pixels[(y * width + (x - 1)) * 4 + 3] > 0) neighbors++;
      // Right
      if (x < width - 1 && pixels[(y * width + (x + 1)) * 4 + 3] > 0) neighbors++;

      if (neighbors <= 0) {
        toClear.push(idx);
      }
    }
  }

  for (const idx of toClear) {
    pixels[idx + 3] = 0;
  }
}

// 4. Extract dominant palette (up to maxColors, default 32)
export function extractPaletteFromData(
  pixels: Uint8ClampedArray,
  maxColors: number = 32
): string[] {
  const colorMap = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 128) continue;

    const rgb: RGB = {
      r: pixels[i],
      g: pixels[i + 1],
      b: pixels[i + 2],
    };

    // Ignore magenta background
    if (isNearMagenta(rgb, 35)) continue;

    // Quantize slightly into 5-bit to group near-identical colors
    const qr = Math.round(rgb.r / 8) * 8;
    const qg = Math.round(rgb.g / 8) * 8;
    const qb = Math.round(rgb.b / 8) * 8;
    const key = `${qr},${qg},${qb}`;

    const existing = colorMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      colorMap.set(key, { count: 1, r: qr, g: qg, b: qb });
    }
  }

  // Sort by popularity
  const sorted = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);

  // Pick top colors, filtering out ones too close to already picked ones
  const chosen: RGB[] = [];
  for (const item of sorted) {
    if (chosen.length >= maxColors) break;
    const tooClose = chosen.some((c) => colorDistance(c, item) < 18);
    if (!tooClose) {
      chosen.push({ r: item.r, g: item.g, b: item.b });
    }
  }

  // If very few colors found, ensure at least basic outline and white/accents
  if (chosen.length === 0) {
    return ['#ffffff', '#f4ede2', '#3d251e', '#e07a5f', '#81b29a'];
  }

  // Sort by perceived luminance for a beautiful palette display
  chosen.sort((a, b) => {
    const lumA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
    const lumB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
    return lumB - lumA; // Light to dark
  });

  return chosen.map((c) => rgbToHex(c.r, c.g, c.b));
}

// 5. Downscale via nearest-neighbor
export function downscaleNearestNeighborData(
  srcPixels: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const dstPixels = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y + 0.5) * (srcH / dstH)));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x + 0.5) * (srcW / dstW)));

      const srcIdx = (sy * srcW + sx) * 4;
      const dstIdx = (y * dstW + x) * 4;

      dstPixels[dstIdx] = srcPixels[srcIdx];
      dstPixels[dstIdx + 1] = srcPixels[srcIdx + 1];
      dstPixels[dstIdx + 2] = srcPixels[srcIdx + 2];
      dstPixels[dstIdx + 3] = srcPixels[srcIdx + 3];
    }
  }

  return dstPixels;
}

// 6. Detect pixel scale factor
export function detectPixelScale(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  frameCount: number = 1
): number {
  const expectedTotalW = targetWidth * frameCount;
  const ratioW = srcWidth / expectedTotalW;
  const ratioH = srcHeight / targetHeight;

  // Choose the closest power-of-two or whole integer
  const avgRatio = Math.max(1, (ratioW + ratioH) / 2);
  const rounded = Math.round(avgRatio);

  return Math.max(1, rounded);
}

// 6b. Computed scale for grid-based (Template Fill) results.
// The grid layout is known, so the scale is exact rather than guessed:
// raw image width / (grid columns x frame width). May be fractional (e.g. 21.3).
export function computeGridScale(rawWidth: number, gridCols: number, frameWidth: number): number {
  const expected = gridCols * frameWidth;
  if (expected <= 0 || rawWidth <= 0) return 1;
  return rawWidth / expected;
}

/** Round a scale for display: 21.333 -> 21.3, 8 -> 8. */
export function formatScale(scale: number): string {
  return String(Math.round(scale * 10) / 10);
}

/**
 * Block-majority downscale: each destination pixel takes the most common color in its
 * (possibly fractional) source block, instead of sampling a single point. A half-pixel
 * offset in the model output therefore can't shift the figure by a whole pixel.
 * All fully transparent pixels count as one color. Ties go to the color seen first in
 * row-major order, so the result is deterministic.
 */
export function downscaleBlockModeData(
  srcPixels: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const dstPixels = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  const counts = new Map<number, number>();

  for (let y = 0; y < dstH; y++) {
    const y0 = Math.min(srcH - 1, Math.floor(y * scaleY));
    const y1 = Math.max(y0 + 1, Math.min(srcH, Math.floor((y + 1) * scaleY)));
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.min(srcW - 1, Math.floor(x * scaleX));
      const x1 = Math.max(x0 + 1, Math.min(srcW, Math.floor((x + 1) * scaleX)));

      counts.clear();
      let bestKey = 0;
      let bestCount = 0;
      let bestIdx = (y0 * srcW + x0) * 4;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const idx = (sy * srcW + sx) * 4;
          const a = srcPixels[idx + 3];
          const key =
            a === 0
              ? 0
              : ((srcPixels[idx] << 24) | (srcPixels[idx + 1] << 16) | (srcPixels[idx + 2] << 8) | a) >>> 0;
          const c = (counts.get(key) || 0) + 1;
          counts.set(key, c);
          if (c > bestCount) {
            bestCount = c;
            bestKey = key;
            bestIdx = idx;
          }
        }
      }

      const dstIdx = (y * dstW + x) * 4;
      if (bestKey === 0) {
        dstPixels[dstIdx] = 0;
        dstPixels[dstIdx + 1] = 0;
        dstPixels[dstIdx + 2] = 0;
        dstPixels[dstIdx + 3] = 0;
      } else {
        dstPixels[dstIdx] = srcPixels[bestIdx];
        dstPixels[dstIdx + 1] = srcPixels[bestIdx + 1];
        dstPixels[dstIdx + 2] = srcPixels[bestIdx + 2];
        dstPixels[dstIdx + 3] = srcPixels[bestIdx + 3];
      }
    }
  }

  return dstPixels;
}

// 7. Frame Bounding Box
export interface FrameBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  hasContent: boolean;
}

export function getFrameBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  endX: number
): FrameBounds {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let hasContent = false;

  for (let y = 0; y < height; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      if (pixels[idx + 3] > 0) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { minX, maxX, minY, maxY, hasContent };
}

export function getGridCellBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number
): FrameBounds {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let hasContent = false;

  const clampedEndY = Math.min(height, endY);
  const clampedEndX = Math.min(width, endX);

  for (let y = startY; y < clampedEndY; y++) {
    for (let x = startX; x < clampedEndX; x++) {
      const idx = (y * width + x) * 4;
      if (pixels[idx + 3] > 0) {
        hasContent = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return { minX, maxX, minY, maxY, hasContent };
}
