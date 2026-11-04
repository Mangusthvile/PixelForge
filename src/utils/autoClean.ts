// Auto Clean: deterministic, pure pixel cleanup for animation frames.
// Same input pixels + same palette roles always give the same output. No randomness,
// no model calls, no time-dependent logic (see CLAUDE.md).

import { hexToRgb, colorDistance } from './pipeline';

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
// Size check (report only)
// ---------------------------------------------------------------------------

/** Body height: number of rows that contain at least one body-colored pixel (tools ignored). */
export function bodyHeight(px: Uint8ClampedArray, w: number, h: number, roleOf: RoleOf): number {
  let rows = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (roleAt(px, (y * w + x) * 4, roleOf) === 'body') {
        rows++;
        break;
      }
    }
  }
  return rows;
}

/**
 * Compare each frame's body height to the anchor's. Returns a warning per frame
 * ("2px taller than anchor") or null when within `tolerance` pixels.
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
