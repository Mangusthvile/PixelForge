import { LibraryItem } from '../types';

// ---------------------------------------------------------------------------
// Animation sheet strip: frames drawn left to right in one row
// ---------------------------------------------------------------------------

/**
 * Pure: copy each frame (frameWidth x frameHeight RGBA) into one horizontal strip,
 * frameWidth * frames.length wide and frameHeight tall, transparent elsewhere.
 * Frames whose data is smaller than a full frame are copied as far as they go.
 */
export function composeStripPixels(
  frames: Uint8ClampedArray[],
  frameWidth: number,
  frameHeight: number
): { width: number; height: number; pixels: Uint8ClampedArray } {
  const width = frameWidth * frames.length;
  const height = frameHeight;
  const pixels = new Uint8ClampedArray(width * height * 4);
  frames.forEach((frame, f) => {
    for (let y = 0; y < frameHeight; y++) {
      const srcStart = y * frameWidth * 4;
      if (srcStart >= frame.length) break;
      const row = frame.subarray(srcStart, Math.min(srcStart + frameWidth * 4, frame.length));
      pixels.set(row, (y * width + f * frameWidth) * 4);
    }
  });
  return { width, height, pixels };
}

/** Browser: build the strip PNG (data URL) from frame image URLs. */
export async function buildStripDataUrl(frames: string[], frameWidth: number, frameHeight: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, frameWidth * frames.length);
  canvas.height = Math.max(1, frameHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < frames.length; i++) {
    const img = await loadStripImage(frames[i]);
    // Clip each frame to its cell so an oversized frame can't spill into the next one.
    ctx.drawImage(img, 0, 0, frameWidth, frameHeight, i * frameWidth, 0, frameWidth, frameHeight);
  }
  return canvas.toDataURL('image/png');
}

function loadStripImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load frame image`));
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Export manifest
// ---------------------------------------------------------------------------

/** Number of frames an item really has: always from item.frames, never the stored count. */
export function itemFrameCount(item: Pick<LibraryItem, 'frames'>): number {
  return item.frames && item.frames.length > 0 ? item.frames.length : 1;
}

/** Manifest entry for one library item (image files are added by the exporter). */
export function manifestEntry(item: LibraryItem): Record<string, any> {
  const entry: Record<string, any> = {
    id: item.id,
    file: `images/${item.name}.png`,
    type: item.type,
    frameWidth: item.metadata.frameWidth,
    frameHeight: item.metadata.frameHeight,
    frames: itemFrameCount(item),
    fps: item.metadata.fps || 8,
    baselineY: item.metadata.baselineY || 0,
  };
  if (item.type === 'background') {
    entry.width = item.metadata.frameWidth;
    entry.height = item.metadata.frameHeight;
    entry.tiling = item.metadata.tiling ?? true;
  }
  return entry;
}
