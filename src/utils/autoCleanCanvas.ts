// Browser glue for Auto Clean: load frame images into pixel arrays, run the pure
// functions from autoClean.ts, and turn the results back into PNG data URLs.

import { StyleProfile } from '../types';
import {
  AutoCleanStats,
  autoCleanPixels,
  bodyHeight,
  fixBodyHeight,
  makeRoleLookup,
  resolvePaletteRoles,
  RoleOf,
} from './autoClean';
import { keyOutMagentaData, downscaleBlockModeData } from './pipeline';

export interface PixelImage {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function readPixels(src: string): Promise<PixelImage> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not load image'));
    el.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}

export function pixelsToDataUrl({ pixels, width, height }: PixelImage): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(width, height);
  data.data.set(pixels);
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

export function roleLookupFor(profile: StyleProfile): RoleOf {
  return makeRoleLookup(resolvePaletteRoles(profile));
}

/** Auto Clean every frame. Frames that don't change keep their original data URL. */
export async function autoCleanFrameUrls(
  frames: string[],
  profile: StyleProfile
): Promise<{ frames: string[]; stats: AutoCleanStats }> {
  const roleOf = roleLookupFor(profile);
  const total: AutoCleanStats = { orphanOutline: 0, specks: 0, pinholes: 0 };
  const out: string[] = [];
  for (const src of frames) {
    const img = await readPixels(src);
    const { pixels, stats } = autoCleanPixels(img.pixels, img.width, img.height, roleOf);
    total.orphanOutline += stats.orphanOutline;
    total.specks += stats.specks;
    total.pinholes += stats.pinholes;
    const changed = stats.orphanOutline + stats.specks + stats.pinholes > 0;
    out.push(changed ? pixelsToDataUrl({ pixels, width: img.width, height: img.height }) : src);
  }
  return { frames: out, stats: total };
}

export async function measureBodyHeights(frames: string[], profile: StyleProfile): Promise<number[]> {
  const roleOf = roleLookupFor(profile);
  const heights: number[] = [];
  for (const src of frames) {
    const img = await readPixels(src);
    heights.push(bodyHeight(img.pixels, img.width, img.height, roleOf));
  }
  return heights;
}

/**
 * Body height of the profile's Anchor at sprite scale. Anchors are usually drawn at 8x on
 * magenta: key the magenta out, then downscale by the whole-number scale that maps the
 * image onto the frame size.
 */
export async function measureAnchorBodyHeight(
  profile: StyleProfile,
  frameWidth: number,
  frameHeight: number
): Promise<number> {
  const anchor =
    profile.references.find((r) => r.isAnchor || r.id === profile.anchorId) || profile.references[0];
  if (!anchor) return 0;
  const img = await readPixels(anchor.base64 || anchor.url);
  const pixels = new Uint8ClampedArray(img.pixels);
  keyOutMagentaData(pixels, 35);
  const scale = Math.max(1, Math.round(Math.min(img.width / frameWidth, img.height / frameHeight)));
  const w = Math.max(1, Math.round(img.width / scale));
  const h = Math.max(1, Math.round(img.height / scale));
  const small = scale > 1 ? downscaleBlockModeData(pixels, img.width, img.height, w, h) : pixels;
  return bodyHeight(small, w, h, roleLookupFor(profile));
}

export function formatAutoCleanStats(s: AutoCleanStats): string {
  const parts = [
    s.orphanOutline ? `removed ${s.orphanOutline} orphan outline px` : '',
    s.specks ? `removed ${s.specks} speck${s.specks === 1 ? '' : 's'}` : '',
    s.pinholes ? `filled ${s.pinholes} pinhole${s.pinholes === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.length ? `Auto Clean: ${parts.join(', ')}.` : 'Auto Clean: nothing to fix.';
}

/**
 * Bring the given frames' body height to the anchor's (see fixBodyHeight).
 * Returns new frame URLs plus a per-frame result for reporting.
 */
export async function fixFrameHeights(
  frames: string[],
  profile: StyleProfile,
  anchorHeight: number,
  indices: number[]
): Promise<{ frames: string[]; results: Array<{ index: number; delta: number; skipped?: string }> }> {
  const roleOf = roleLookupFor(profile);
  const out = [...frames];
  const results: Array<{ index: number; delta: number; skipped?: string }> = [];
  for (const index of indices) {
    if (!frames[index]) continue;
    const img = await readPixels(frames[index]);
    const res = fixBodyHeight(img.pixels, img.width, img.height, roleOf, anchorHeight);
    if (res.delta !== 0) out[index] = pixelsToDataUrl({ pixels: res.pixels, width: img.width, height: img.height });
    results.push({ index, delta: res.delta, skipped: res.skipped });
  }
  return { frames: out, results };
}

export function formatHeightFixResults(results: Array<{ index: number; delta: number; skipped?: string }>): string {
  const parts = results.map((r) =>
    r.delta !== 0
      ? `frame ${r.index + 1} ${r.delta > 0 ? '+' : '−'}${Math.abs(r.delta)}px`
      : `frame ${r.index + 1} skipped (${r.skipped || 'already matches'})`
  );
  return parts.length ? `Size fix: ${parts.join(', ')}.` : 'Size fix: no frames to fix.';
}
