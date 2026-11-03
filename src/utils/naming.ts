import { GenerationConfig, LibraryItem } from '../types';

/** Use the preset's name (fig_idle, bg_forest, ...) while the preset's description is unchanged. */
export function resolveAssetName(cfg: GenerationConfig, fallback: string): string {
  if (
    cfg.presetAssetName &&
    cfg.presetDescription === cfg.description &&
    cfg.presetAssetName.split('_')[0] === fallback.split('_')[0]
  ) {
    return cfg.presetAssetName;
  }
  return fallback;
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
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'imported'
  );
}

export interface ImportLayout {
  type: 'animation' | 'sprite' | 'background';
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

/**
 * Decide how to store an imported image. A horizontal strip whose height equals the
 * configured frame height and whose width is a multiple of the frame width becomes an
 * animation with one frame per cell. Otherwise it is a single-frame sprite (or a
 * background when the generator is set to backgrounds).
 */
export function classifyImport(
  width: number,
  height: number,
  cfg: { type: string; frameWidth: number; frameHeight: number }
): ImportLayout {
  if (cfg.type === 'background') {
    return { type: 'background', frameWidth: width, frameHeight: height, frameCount: 1 };
  }
  const fw = cfg.frameWidth;
  if (fw > 0 && height === cfg.frameHeight && width > fw && width % fw === 0) {
    return { type: 'animation', frameWidth: fw, frameHeight: height, frameCount: width / fw };
  }
  return { type: 'sprite', frameWidth: width, frameHeight: height, frameCount: 1 };
}
