import { AssetType, GenerationConfig, LibraryItem } from '../types';

// ---------------------------------------------------------------------------
// Asset names
// ---------------------------------------------------------------------------

export const MAX_SUGGESTED_NAME_LENGTH = 20;

const TYPE_PREFIX: Record<AssetType, string> = {
  sprite: 'fig',
  animation: 'fig',
  prop: 'props',
  background: 'bg',
  effect: 'fx',
};

// Words that never make a useful name on their own.
const SKIP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'with', 'in', 'on', 'at', 'to', 'into', 'from', 'by', 'for',
  'its', 'his', 'her', 'their', 'over', 'under', 'up', 'down', 'while', 'then', 'both',
  'frame', 'frames', 'cycle', 'continuous', 'loop', 'looping', 'sheet', 'sprite', 'animation',
  'pixel', 'art', 'tiny', 'small', 'simple', 'subtle', 'smooth', 'quick', 'gentle', 'soft',
  'collection', 'set', 'pack', 'various', 'assorted', 'items', 'item',
  'character', 'figure', 'chibi', 'side', 'view', 'facing', 'left', 'right', 'front', 'back',
]);

/** Lowercase, keep a-z 0-9 _ -, collapse separators. */
export function sanitizeAssetName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Short name from the type prefix plus the main action or subject (max 2 words,
 * never more than 20 characters): "chop wood with an axe" -> fig_chop_wood,
 * "deep cave with crystals" (background) -> bg_deep_cave.
 */
export function suggestAssetName(type: AssetType, description: string): string {
  const prefix = TYPE_PREFIX[type] || 'asset';
  const tokens = (description || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const meaningful = (w: string | undefined) => !!w && w.length > 1 && !SKIP_WORDS.has(w);

  // Main word: first meaningful word. Second word only if it directly follows the main
  // word (articles aside) and isn't an -ing clause ("walk cycle swinging arms" -> walk).
  const words: string[] = [];
  const first = tokens.findIndex((w) => meaningful(w));
  if (first !== -1) {
    words.push(tokens[first]);
    let j = first + 1;
    while (tokens[j] === 'a' || tokens[j] === 'an' || tokens[j] === 'the') j++;
    if (meaningful(tokens[j]) && !tokens[j].endsWith('ing')) words.push(tokens[j]);
  }

  let name = prefix;
  for (const word of words) {
    const next = `${name}_${word}`;
    if (next.length > MAX_SUGGESTED_NAME_LENGTH) {
      if (name === prefix) name = next.slice(0, MAX_SUGGESTED_NAME_LENGTH).replace(/_+$/, '');
      break;
    }
    name = next;
  }
  return name === prefix ? `${prefix}_asset` : name;
}

/**
 * Keep config.assetName in sync until the user types their own name:
 * a picked preset's name while its description is unchanged, otherwise a suggestion.
 */
export function withAutoName(cfg: GenerationConfig): GenerationConfig {
  if (cfg.assetNameEdited && cfg.assetName.trim()) return cfg;
  const presetStillApplies =
    cfg.presetAssetName &&
    cfg.presetDescription === cfg.description &&
    cfg.presetAssetName.split('_')[0] === TYPE_PREFIX[cfg.type];
  const assetName = presetStillApplies ? cfg.presetAssetName! : suggestAssetName(cfg.type, cfg.description);
  return { ...cfg, assetName, assetNameEdited: false };
}

/** The name a new generation is saved under. Only ever comes from the config, never the open asset. */
export function generationAssetName(cfg: GenerationConfig): string {
  return sanitizeAssetName(cfg.assetName || '') || suggestAssetName(cfg.type, cfg.description);
}

/** fig_idle -> fig_idle_v2 (or the next free _vN). */
export function nextVersionName(name: string, items: Pick<LibraryItem, 'name'>[]): string {
  const base = name.replace(/_v\d+$/, '');
  const taken = new Set(items.map((i) => i.name));
  let n = 2;
  while (taken.has(`${base}_v${n}`)) n++;
  return `${base}_v${n}`;
}

export function sameFrames(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Library name for an imported file: "Walk Cycle (2).png" -> "walk_cycle_2". */
export function importedAssetName(fileName: string): string {
  return sanitizeAssetName(fileName.replace(/\.[^.]+$/, '')).replace(/-/g, '_').slice(0, 40) || 'imported';
}

// ---------------------------------------------------------------------------
// Import layout
// ---------------------------------------------------------------------------

export interface ImportLayout {
  type: AssetType;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

/**
 * Pre-fill the import dialog from the image size:
 *  - GIFs with several frames: one frame per GIF frame, full image size.
 *  - Width a multiple of the generator's frame width and height a multiple of its frame height
 *    (e.g. 96x24 with 24x24 frames): a strip/grid of those frames.
 *  - Wider than tall and width a multiple of height (e.g. 96x24): square frames.
 *  - Otherwise a single frame.
 */
export function guessImportLayout(
  width: number,
  height: number,
  cfg: { type: AssetType; frameWidth: number; frameHeight: number },
  gifFrameCount = 1
): ImportLayout {
  if (gifFrameCount > 1) {
    return { type: 'animation', frameWidth: width, frameHeight: height, frameCount: gifFrameCount };
  }
  if (cfg.type === 'background') {
    return { type: 'background', frameWidth: width, frameHeight: height, frameCount: 1 };
  }

  const fits = (fw: number, fh: number) =>
    fw > 0 && fh > 0 && width % fw === 0 && height % fh === 0 && (width / fw) * (height / fh) > 1;

  let fw = width;
  let fh = height;
  if (fits(cfg.frameWidth, cfg.frameHeight)) {
    fw = cfg.frameWidth;
    fh = cfg.frameHeight;
  } else if (width > height && fits(height, height)) {
    fw = height;
    fh = height;
  }

  const frameCount = (width / fw) * (height / fh);
  const type: AssetType = frameCount > 1 ? (cfg.type === 'sprite' ? 'animation' : cfg.type) : cfg.type;
  return { type, frameWidth: fw, frameHeight: fh, frameCount };
}

/** Max frames that fit in an image for a frame size (columns x rows). */
export function maxFramesFor(width: number, height: number, fw: number, fh: number): number {
  if (fw <= 0 || fh <= 0) return 0;
  return Math.floor(width / fw) * Math.floor(height / fh);
}

/** Top-left corners of each frame in reading order (left to right, then top to bottom). */
export function sliceRects(
  width: number,
  height: number,
  fw: number,
  fh: number,
  count: number
): Array<{ x: number; y: number }> {
  const cols = Math.max(1, Math.floor(width / fw));
  const total = Math.min(count, maxFramesFor(width, height, fw, fh));
  const rects: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < total; i++) {
    rects.push({ x: (i % cols) * fw, y: Math.floor(i / cols) * fh });
  }
  return rects;
}
