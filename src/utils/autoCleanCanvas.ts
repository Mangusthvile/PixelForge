// Browser glue for Auto Clean: load frame images into pixel arrays, run the pure
// functions from autoClean.ts, and turn the results back into PNG data URLs.

import { StyleProfile } from '../types';
import {
  AutoCleanStats,
  autoCleanPixels,
  bodyHeight,
  makeRoleLookup,
  measureAnchorPixels,
  AnchorMeasure,
  feetAlignmentShift,
  shiftFrameVertical,
  resolvePaletteRoles,
  RoleOf,
} from './autoClean';

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
 * Measure the profile's Anchor at true size. The scale comes from the anchor image itself
 * (8x for a 192x192 reference), never from the frame size being checked; the profile's
 * own frame size is only a fallback hint.
 */
export async function measureAnchor(profile: StyleProfile): Promise<AnchorMeasure | null> {
  const anchor =
    profile.references.find((r) => r.isAnchor || r.id === profile.anchorId) || profile.references[0];
  if (!anchor) return null;
  const img = await readPixels(anchor.base64 || anchor.url);
  return measureAnchorPixels(img.pixels, img.width, img.height, roleLookupFor(profile), {
    width: profile.frameWidth,
    height: profile.frameHeight,
  });
}

export interface FeetMove {
  index: number;
  /** Rows to move: positive = down, negative = up. */
  dy: number;
  /** Set when the move would push pixels out of the frame (not applied). */
  blocked?: boolean;
}

/** Vertical moves that would put each frame's feet on the anchor's baseline. Nothing is resized. */
export async function proposeFeetAlignment(
  frames: string[],
  profile: StyleProfile,
  anchor: AnchorMeasure,
  indices: number[]
): Promise<FeetMove[]> {
  const roleOf = roleLookupFor(profile);
  const moves: FeetMove[] = [];
  for (const index of indices) {
    if (!frames[index]) continue;
    const img = await readPixels(frames[index]);
    const dy = feetAlignmentShift(img.pixels, img.width, img.height, roleOf, anchor.bottomGap);
    if (dy === 0) continue;
    const blocked = shiftFrameVertical(img.pixels, img.width, img.height, dy) === null;
    moves.push({ index, dy, blocked });
  }
  return moves;
}

/** Apply the (unblocked) moves; returns the new frame list. */
export async function applyFeetAlignment(frames: string[], moves: FeetMove[]): Promise<string[]> {
  const out = [...frames];
  for (const m of moves) {
    if (m.blocked) continue;
    const img = await readPixels(frames[m.index]);
    const shifted = shiftFrameVertical(img.pixels, img.width, img.height, m.dy);
    if (shifted) out[m.index] = pixelsToDataUrl({ pixels: shifted, width: img.width, height: img.height });
  }
  return out;
}

export function describeFeetMove(m: FeetMove): string {
  const dir = m.dy > 0 ? 'down' : 'up';
  return `Frame ${m.index + 1}: move ${dir} ${Math.abs(m.dy)}px${m.blocked ? ' (skipped: would cut off pixels at the edge)' : ''}`;
}

export function formatAutoCleanStats(s: AutoCleanStats): string {
  const parts = [
    s.orphanOutline ? `removed ${s.orphanOutline} orphan outline px` : '',
    s.specks ? `removed ${s.specks} speck${s.specks === 1 ? '' : 's'}` : '',
    s.pinholes ? `filled ${s.pinholes} pinhole${s.pinholes === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return parts.length ? `Auto Clean: ${parts.join(', ')}.` : 'Auto Clean: nothing to fix.';
}
