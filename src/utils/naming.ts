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
