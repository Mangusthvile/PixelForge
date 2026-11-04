// Auto Clean: deterministic, pure pixel cleanup for animation frames.
// Same input pixels + same palette roles always give the same output. No randomness,
// no model calls, no time-dependent logic (see CLAUDE.md).

import { hexToRgb, colorDistance, keyOutMagentaData } from './pipeline';

export type PaletteRole = 'body' | 'outline' | 'tool' | 'effect';
export const PALETTE_ROLES: PaletteRole[] = ['body', 'outline', 'tool', 'effect'];

/**
 * Default roles for the built-in Characters profile. Colors not listed are 'tool'.
 * Grayscale is the built-in palette; the older cream palette is included too, so
 * either one gets body/outline roles without manual setup.
 */
export const CHARACTER_ROLE_DEFAULTS: Record<string, PaletteRole> = {
  '#ffffff': 'body',
  '#bdbdbd': 'body',
  '#e3e3e3': 'body',
  '#2b2b2b': 'outline',
  '#faf3e8': 'body',
  '#e7d5c6': 'body',
  '#b9b3a1': 'body',
  '#2f2522': 'outline',
};

interface RoleProfile {
  id: string;
  palette: string[];
  outlineColor?: string;
  paletteRoles?: Record<string, PaletteRole>;
}

/**
 * Role for every palette color: an explicit per-swatch role wins; otherwise the profile's
 * outline color is 'outline'; Characters uses CHARACTER_ROLE_DEFAULTS (rest 'tool');
 * other profiles default to 'body'.
 */
export function resolvePaletteRoles(profile: RoleProfile): Record<string, PaletteRole> {
  const roles: Record<string, PaletteRole> = {};
  const outline = (profile.outlineColor || '').toLowerCase();
  const isCharacters = profile.id === 'profile_characters';
  for (const raw of profile.palette) {
    const hex = raw.toLowerCase();
    const explicit = profile.paletteRoles?.[hex];
    if (explicit) roles[hex] = explicit;
    else if (hex === outline) roles[hex] = 'outline';
    else if (isCharacters) roles[hex] = CHARACTER_ROLE_DEFAULTS[hex] || 'tool';
    else roles[hex] = 'body';
  }
  return roles;
}

export type RoleOf = (r: number, g: number, b: number) => PaletteRole | null;

/** Pixel color -> role of the nearest palette color (exact matches are the fast path). */
export function makeRoleLookup(roles: Record<string, PaletteRole>): RoleOf {
  const entries = Object.entries(roles).map(([hex, role]) => ({ rgb: hexToRgb(hex), role }));
  const cache = new Map<number, PaletteRole | null>();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best: PaletteRole | null = null;
    let bestDist = Infinity;
    for (const e of entries) {
      const d = colorDistance({ r, g, b }, e.rgb);
      if (d < bestDist) {
        bestDist = d;
        best = e.role;
      }
    }
    cache.set(key, best);
    return best;
  };
}

// Fixed neighbor order keeps tie-breaks deterministic.
const N8: Array<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const N4: Array<[number, number]> = [[0, -1], [-1, 0], [1, 0], [0, 1]];

const opaque = (px: Uint8ClampedArray, i: number) => px[i + 3] > 0;
const roleAt = (px: Uint8ClampedArray, i: number, roleOf: RoleOf) =>
  opaque(px, i) ? roleOf(px[i], px[i + 1], px[i + 2]) : null;

function clear(px: Uint8ClampedArray, i: number) {
  px[i] = 0;
  px[i + 1] = 0;
  px[i + 2] = 0;
  px[i + 3] = 0;
}

/**
 * Remove orphan outline pixels: an outline-colored pixel with no non-outline,
 * non-transparent pixel in its 8-neighborhood. Repeats until nothing changes
 * (each pass decides from the previous pass's result).
 */
export function removeOrphanOutline(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  roleOf: RoleOf
): { pixels: Uint8ClampedArray; removed: number } {
  let px = new Uint8ClampedArray(src);
  let removed = 0;
  for (let pass = 0; pass < w * h; pass++) {
    const next = new Uint8ClampedArray(px);
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (roleAt(px, i, roleOf) !== 'outline') continue;
        let supported = false;
        for (const [dx, dy] of N8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const role = roleAt(px, (ny * w + nx) * 4, roleOf);
          if (role !== null && role !== 'outline') {
            supported = true;
            break;
          }
        }
        if (!supported) {
          clear(next, i);
          changed++;
        }
      }
    }
    px = next;
    removed += changed;
    if (changed === 0) break;
  }
  return { pixels: px, removed };
}

/**
 * Fill pinholes: a transparent pixel with at least 6 of its 8 neighbors filled, at least
 * one of them a body color, takes the most common neighboring non-outline color
 * (ties: first in fixed neighbor order). Single pass from the input.
 */
export function fillPinholes(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  roleOf: RoleOf
): { pixels: Uint8ClampedArray; filled: number } {
  const px = new Uint8ClampedArray(src);
  let filled = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (opaque(src, i)) continue;
      let count = 0;
      let hasBody = false;
      const tally = new Map<number, { n: number; idx: number }>();
      let bestKey = -1;
      let bestN = 0;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = (ny * w + nx) * 4;
        if (!opaque(src, j)) continue;
        count++;
        const role = roleOf(src[j], src[j + 1], src[j + 2]);
        if (role === 'body') hasBody = true;
        if (role === 'outline') continue;
        const key = ((src[j] << 24) | (src[j + 1] << 16) | (src[j + 2] << 8) | src[j + 3]) >>> 0;
        const t = tally.get(key) || { n: 0, idx: j };
        t.n++;
        tally.set(key, t);
        if (t.n > bestN) {
          bestN = t.n;
          bestKey = key;
        }
      }
      if (count >= 6 && hasBody && bestKey !== -1) {
        const j = tally.get(bestKey)!.idx;
        px[i] = src[j];
        px[i + 1] = src[j + 1];
        px[i + 2] = src[j + 2];
        px[i + 3] = src[j + 3];
        filled++;
      }
    }
  }
  return { pixels: px, filled };
}

/** Remove isolated specks: a non-transparent pixel with no non-transparent 4-neighbor. */
export function removeSpecks(
  src: Uint8ClampedArray,
  w: number,
  h: number
): { pixels: Uint8ClampedArray; removed: number } {
  const px = new Uint8ClampedArray(src);
  let removed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!opaque(src, i)) continue;
      let neighbor = false;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (opaque(src, (ny * w + nx) * 4)) {
          neighbor = true;
          break;
        }
      }
      if (!neighbor) {
        clear(px, i);
        removed++;
      }
    }
  }
  return { pixels: px, removed };
}

export interface AutoCleanStats {
  orphanOutline: number;
  specks: number;
  pinholes: number;
}

/** Full Auto Clean for one frame: orphan outline, then specks, then pinholes. */
export function autoCleanPixels(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  roleOf: RoleOf
): { pixels: Uint8ClampedArray; stats: AutoCleanStats } {
  const a = removeOrphanOutline(src, w, h, roleOf);
  const b = removeSpecks(a.pixels, w, h);
  const c = fillPinholes(b.pixels, w, h, roleOf);
  return { pixels: c.pixels, stats: { orphanOutline: a.removed, specks: b.removed, pinholes: c.filled } };
}

// ---------------------------------------------------------------------------
// Size check (report only) and feet alignment (move only, never resize)
// ---------------------------------------------------------------------------

export interface FigureMeasure {
  /** Rows that contain body-role pixels of the main figure. */
  bodyHeight: number;
  /** Lowest row of the main figure (body + outline), i.e. where the feet are. -1 if none. */
  bottomRow: number;
}

/**
 * Measure the main figure: 8-connected groups of body + outline pixels (tool and effect
 * colors never join or count), keeping the group with the most body pixels. Detached
 * body-colored pixels, such as light-grey smear trails, are ignored. Body height counts
 * only rows containing body-role pixels of that group.
 */
export function measureFigure(px: Uint8ClampedArray, w: number, h: number, roleOf: RoleOf): FigureMeasure {
  const label = new Int32Array(w * h).fill(-1);
  const isFigure = (i: number) => {
    const r = roleAt(px, i * 4, roleOf);
    return r === 'body' || r === 'outline';
  };
  let best = { bodyPixels: 0, bodyRows: new Set<number>(), bottom: -1 };
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || !isFigure(start)) continue;
    const id = next++;
    const stack = [start];
    label[start] = id;
    let bodyPixels = 0;
    let bottom = -1;
    const bodyRows = new Set<number>();
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      if (y > bottom) bottom = y;
      if (roleAt(px, i * 4, roleOf) === 'body') {
        bodyPixels++;
        bodyRows.add(y);
      }
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (label[j] === -1 && isFigure(j)) {
          label[j] = id;
          stack.push(j);
        }
      }
    }
    // Most body pixels wins; ties keep the first group found (row-major), so it's deterministic.
    if (bodyPixels > best.bodyPixels) best = { bodyPixels, bodyRows, bottom };
  }
  return { bodyHeight: best.bodyRows.size, bottomRow: best.bodyPixels > 0 ? best.bottom : -1 };
}

/** Body height of the main figure (see measureFigure). */
export function bodyHeight(px: Uint8ClampedArray, w: number, h: number, roleOf: RoleOf): number {
  return measureFigure(px, w, h, roleOf).bodyHeight;
}

/**
 * Compare each frame's body height to the anchor's. Returns a warning per frame
 * ("2px taller than anchor") or null when within `tolerance` pixels (default 1).
 */
export function sizeCheck(frameHeights: number[], anchorHeight: number, tolerance = 1): Array<string | null> {
  if (!(anchorHeight > 0)) return frameHeights.map(() => null);
  return frameHeights.map((fh) => {
    if (fh === 0) return 'no body pixels found';
    const diff = fh - anchorHeight;
    if (Math.abs(diff) <= tolerance) return null;
    return `${Math.abs(diff)}px ${diff > 0 ? 'taller' : 'shorter'} than anchor`;
  });
}

// ---------------------------------------------------------------------------
// Anchor at true size
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Integer pixel scale of upscaled pixel art: the greatest common divisor of every run of
 * identical pixels along rows and columns (all fully transparent pixels count as one
 * color) and of the image size. An 8x reference gives 8; true-size art gives 1.
 */
export function detectIntegerScale(px: Uint8ClampedArray, w: number, h: number): number {
  const same = (i: number, j: number) =>
    (px[i + 3] === 0 && px[j + 3] === 0) ||
    (px[i] === px[j] && px[i + 1] === px[j + 1] && px[i + 2] === px[j + 2] && px[i + 3] === px[j + 3]);
  let g = gcd(w, h);
  for (let y = 0; y < h && g > 1; y++) {
    let run = 1;
    for (let x = 1; x <= w; x++) {
      if (x < w && same((y * w + x) * 4, (y * w + x - 1) * 4)) run++;
      else {
        g = gcd(g, run);
        run = 1;
      }
    }
  }
  for (let x = 0; x < w && g > 1; x++) {
    let run = 1;
    for (let y = 1; y <= h; y++) {
      if (y < h && same((y * w + x) * 4, ((y - 1) * w + x) * 4)) run++;
      else {
        g = gcd(g, run);
        run = 1;
      }
    }
  }
  return Math.max(1, g);
}

/** Nearest-neighbor downscale by an integer factor (samples each block's center). */
export function downscaleByInteger(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number
): { pixels: Uint8ClampedArray; width: number; height: number } {
  if (scale <= 1) return { pixels: new Uint8ClampedArray(px), width: w, height: h };
  const width = Math.floor(w / scale);
  const height = Math.floor(h / scale);
  const out = new Uint8ClampedArray(width * height * 4);
  const off = Math.floor(scale / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = ((y * scale + off) * w + (x * scale + off)) * 4;
      out.set(px.subarray(si, si + 4), (y * width + x) * 4);
    }
  }
  return { pixels: out, width, height };
}

export interface AnchorMeasure {
  /** Detected integer scale of the stored reference (8 for a 192x192 reference of a 24x24 figure). */
  scale: number;
  /** True-size dimensions after downscaling. */
  width: number;
  height: number;
  /** Body height of the main figure at true size. */
  bodyHeight: number;
  /** Empty rows between the feet and the bottom edge, at true size. -1 if no figure. */
  bottomGap: number;
}

/**
 * Measure the anchor at true size: key out magenta, detect its own integer scale
 * (independent of the frame size being checked), downscale with nearest neighbor,
 * then measure the main figure. If the image has no detectable scale but its size is
 * an exact multiple of `hintFrame`, that multiple is used.
 */
export function measureAnchorPixels(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  roleOf: RoleOf,
  hintFrame?: { width: number; height: number },
  magentaTolerance = 35
): AnchorMeasure {
  const px = new Uint8ClampedArray(src);
  keyOutMagentaData(px, magentaTolerance);
  let scale = detectIntegerScale(px, w, h);
  if (scale === 1 && hintFrame && hintFrame.width > 0 && hintFrame.height > 0) {
    const sx = w / hintFrame.width;
    const sy = h / hintFrame.height;
    if (Number.isInteger(sx) && sx === sy && sx > 1) scale = sx;
  }
  const small = downscaleByInteger(px, w, h, scale);
  const m = measureFigure(small.pixels, small.width, small.height, roleOf);
  return {
    scale,
    width: small.width,
    height: small.height,
    bodyHeight: m.bodyHeight,
    bottomGap: m.bottomRow >= 0 ? small.height - 1 - m.bottomRow : -1,
  };
}

/**
 * Vertical move that puts a frame's feet on the anchor's baseline (same gap to the bottom
 * edge as the anchor). 0 when already aligned or when there is no figure / anchor.
 */
export function feetAlignmentShift(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  roleOf: RoleOf,
  anchorBottomGap: number
): number {
  if (anchorBottomGap < 0) return 0;
  const { bottomRow } = measureFigure(px, w, h, roleOf);
  if (bottomRow < 0) return 0;
  return h - 1 - anchorBottomGap - bottomRow;
}

/**
 * Move every pixel of a frame up (dy < 0) or down (dy > 0). Never resizes anything.
 * Returns null if the move would push opaque pixels out of the frame.
 */
export function shiftFrameVertical(px: Uint8ClampedArray, w: number, h: number, dy: number): Uint8ClampedArray | null {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = px.subarray(y * w * 4, (y + 1) * w * 4);
    const ny = y + dy;
    if (ny < 0 || ny >= h) {
      for (let i = 3; i < row.length; i += 4) if (row[i] > 0) return null;
      continue;
    }
    out.set(row, ny * w * 4);
  }
  return out;
}
