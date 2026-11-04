// Grid Layout, Template Fill, Pose Notes, and Copy Detection Utilities for PixelForge

export interface GridDimensions {
  cols: number;
  rows: number;
}

/**
 * Returns grid dimensions for animation sheets according to user specification:
 * - 2 frames: 2x1
 * - 3 or 4 frames: 2x2
 * - 5 or 6 frames: 3x2
 * - 7 or 8 frames: 4x2
 * - 9 frames: 3x3
 * - 10 to 12 frames: 4x3
 */
export function getGridDimensions(frameCount: number): GridDimensions {
  if (frameCount <= 2) return { cols: 2, rows: 1 };
  if (frameCount <= 4) return { cols: 2, rows: 2 };
  if (frameCount <= 6) return { cols: 3, rows: 2 };
  if (frameCount <= 8) return { cols: 4, rows: 2 };
  if (frameCount === 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: 3 }; // 10 to 12 frames
}

export type SupportedAspectRatio = '1:1' | '3:2' | '4:3' | '16:9';

/**
 * Calculates the closest supported aspect ratio for a given grid and cell dimensions
 */
export function getBestAspectRatio(
  cols: number,
  rows: number,
  frameWidth: number = 24,
  frameHeight: number = 24
): SupportedAspectRatio {
  const pixelRatio = (cols * frameWidth) / (rows * frameHeight);

  const candidates: Array<{ ratio: number; value: SupportedAspectRatio }> = [
    { ratio: 1.0, value: '1:1' },
    { ratio: 4 / 3, value: '4:3' },
    { ratio: 3 / 2, value: '3:2' },
    { ratio: 16 / 9, value: '16:9' },
  ];

  let best = candidates[0].value;
  let minDiff = Infinity;

  for (const c of candidates) {
    const diff = Math.abs(pixelRatio - c.ratio);
    if (diff < minDiff) {
      minDiff = diff;
      best = c.value;
    }
  }

  return best;
}

/**
 * Generates context-aware pose notes from an action description and frame count.
 * Notes are numbered "frame N of M" and never repeat (a second pass through a cycle
 * is marked ", loop 2").
 */
export function generatePoseNotes(actionDescription: string, frameCount: number): string[] {
  const count = Math.max(2, Math.min(12, frameCount));
  return syncPoseNotes([], count, actionDescription);
}

/** Pose note texts (no "frame N of M" prefix) for an action; may repeat for long cycles. */
function rawPoseBodies(actionDescription: string, count: number): string[] {
  const desc = (actionDescription || '').toLowerCase();

  if (desc.includes('walk') || desc.includes('stride')) {
    const walkPhases = [
      'contact: right foot forward, left arm forward, head upright',
      'down: weight on front right foot, knees flexing slightly',
      'passing: left leg swinging through center, arms crossing torso',
      'contact: left foot forward, right arm forward, upright posture',
      'down: weight on front left foot, knees flexing slightly',
      'passing: right leg swinging forward, arms returning to neutral',
      'contact: stride extending, right heel striking baseline',
      'recovery: balanced center pose completing cycle',
    ];
    return Array.from({ length: count }, (_, i) => {
      const phase = walkPhases[i % walkPhases.length];
      return phase;
    });
  }

  if (desc.includes('run') || desc.includes('dash') || desc.includes('sprint')) {
    const runPhases = [
      'right foot strike: forward lean, left arm bent 90deg driving forward',
      'push off: right leg extending back, body airborne',
      'flight peak: knees tucked, arms driving opposite',
      'left foot strike: forward lean, right arm bent driving forward',
      'push off: left leg extending back, body airborne',
      'flight peak: transition into right foot reach',
    ];
    return Array.from({ length: count }, (_, i) => {
      const phase = runPhases[i % runPhases.length];
      return phase;
    });
  }

  if (
    desc.includes('chop') ||
    desc.includes('swing') ||
    desc.includes('slash') ||
    desc.includes('attack') ||
    desc.includes('mine')
  ) {
    const attackPhases = [
      'ready stance: knees bent, weapon held back in anticipation',
      'windup: lifting weapon overhead, torso rotating slightly',
      'apex: tool/weapon raised at highest point, body coiled',
      'swing down: powerful downward acceleration, arms extending',
      'impact / follow-through: tool reaches lowest point, weight forward',
      'recovery: lifting tool back toward neutral standing pose',
      'ready stance: returning to stable balance',
      'neutral loop transition',
    ];
    return Array.from({ length: count }, (_, i) => {
      const phase = attackPhases[i % attackPhases.length];
      return phase;
    });
  }

  if (desc.includes('jump') || desc.includes('hop') || desc.includes('leap')) {
    const jumpPhases = [
      'anticipation: crouch low, knees deeply bent, arms down',
      'takeoff: explosive launch, legs extended straight down, arms swinging up',
      'ascent: body rising, knees starting to tuck',
      'apex: highest point, floating pose, arms balanced out',
      'descent: falling, legs reaching downward toward ground',
      'landing: knees bent deep to absorb impact on baseline',
    ];
    return Array.from({ length: count }, (_, i) => {
      const phase = jumpPhases[i % jumpPhases.length];
      return phase;
    });
  }

  if (desc.includes('idle') || desc.includes('breathe') || desc.includes('stand')) {
    const idlePhases = [
      'neutral standing stance, calm posture',
      'subtle inhale: chest rises 1px, head slightly tilted',
      'inhale peak: shoulders raised 1px, eyes relaxed',
      'hold: relaxed stance',
      'subtle exhale: shoulders lower 1px, knees settle',
      'return to neutral base pose',
    ];
    return Array.from({ length: count }, (_, i) => {
      const phase = idlePhases[i % idlePhases.length];
      return phase;
    });
  }

  // General fallback
  return Array.from({ length: count }, (_, i) => {
    return `progression step ${i + 1} of ${actionDescription || 'action'}`;
  });
}

/**
 * Builds the Canvas Template Image for Template Fill Mode:
 * - Canvas has exactly the aspect ratio requested from the model (see computeTemplateLayout);
 *   the cols x rows block of cells (frame x 8 each) is centered and the rest is magenta padding
 * - Faint #E000E0 guide lines around and between cells
 * - Anchor drawn in cell 1 at 8x nearest-neighbor on the shared baseline
 * - Cells 2..frameCount get their number drawn faintly in the top-left corner in #E000E0
 *   (the cleanup keys this color out); cells past frameCount stay blank
 */
export async function buildGridTemplateImage(
  anchorDataUrl: string,
  layout: TemplateLayout,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  baselineY?: number
): Promise<string> {
  const { cols, rows, cellW, cellH, canvasW, canvasH, offsetX, offsetY } = layout;
  const gridW = cols * cellW;
  const gridH = rows * cellH;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 1. Solid #FF00FF magenta everywhere (cells and padding)
  ctx.fillStyle = '#FF00FF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 2. Faint 1px guide lines in #E000E0: block outline and lines between cells
  ctx.fillStyle = '#E000E0';
  for (let c = 0; c <= cols; c++) {
    ctx.fillRect(offsetX + Math.min(c * cellW, gridW - 1), offsetY, 1, gridH);
  }
  for (let r = 0; r <= rows; r++) {
    ctx.fillRect(offsetX, offsetY + Math.min(r * cellH, gridH - 1), gridW, 1);
  }

  // 3. Cell numbers for the cells the model must fill
  const fontPx = Math.max(10, Math.round(Math.min(cellW, cellH) * 0.12));
  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#E000E0';
  for (let i = 1; i < Math.min(frameCount, cols * rows); i++) {
    const x = offsetX + (i % cols) * cellW;
    const y = offsetY + Math.floor(i / cols) * cellH;
    ctx.fillText(String(i + 1), x + 4, y + 4);
  }

  // 4. Anchor in cell 1 at 8x with nearest-neighbor scaling
  if (anchorDataUrl) {
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = anchorDataUrl;
      });

      ctx.imageSmoothingEnabled = false;
      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      let drawW = cellW;
      let drawH = cellH;
      if (imgW <= frameWidth && imgH <= frameHeight) {
        drawW = imgW * TEMPLATE_SCALE;
        drawH = imgH * TEMPLATE_SCALE;
      } else {
        const scale = Math.min(cellW / imgW, cellH / imgH);
        drawW = Math.round(imgW * scale);
        drawH = Math.round(imgH * scale);
      }

      const drawX = offsetX + Math.round((cellW - drawW) / 2);
      // Feet on the baseline if given, else bottom with a 1 sprite-pixel margin
      const baselinePx =
        baselineY !== undefined && baselineY >= 0 ? (baselineY + 1) * TEMPLATE_SCALE : cellH - TEMPLATE_SCALE;
      const drawY = offsetY + Math.max(0, baselinePx - drawH);

      ctx.drawImage(img, 0, 0, imgW, imgH, drawX, drawY, drawW, drawH);
    } catch (e) {
      console.warn('Failed to load anchor for grid template:', e);
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Pure algorithm to detect whether generated frames are nearly identical copies
 * of each other or the anchor (indicating model failed to animate)
 */
export function detectCopyOfFrames(
  framesPixelData: Uint8ClampedArray[],
  width: number,
  height: number
): { isCopied: boolean; similarityPercent: number } {
  if (!framesPixelData || framesPixelData.length <= 1) {
    return { isCopied: false, similarityPercent: 0 };
  }

  const frame1 = framesPixelData[0];
  let totalCompared = 0;
  let totalIdentical = 0;

  for (let f = 1; f < framesPixelData.length; f++) {
    const cur = framesPixelData[f];
    const len = Math.min(frame1.length, cur.length);

    for (let i = 0; i < len; i += 4) {
      const a1 = frame1[i + 3];
      const a2 = cur[i + 3];

      // Compare non-transparent content
      if (a1 > 64 || a2 > 64) {
        totalCompared++;
        const dr = Math.abs(frame1[i] - cur[i]);
        const dg = Math.abs(frame1[i + 1] - cur[i + 1]);
        const db = Math.abs(frame1[i + 2] - cur[i + 2]);
        const da = Math.abs(a1 - a2);

        if (dr <= 10 && dg <= 10 && db <= 10 && da <= 30) {
          totalIdentical++;
        }
      }
    }
  }

  if (totalCompared === 0) {
    return { isCopied: false, similarityPercent: 0 };
  }

  const similarity = (totalIdentical / totalCompared) * 100;
  // If > 94% of colored pixels are identical across frames, the character didn't animate
  return {
    isCopied: similarity > 94,
    similarityPercent: Math.round(similarity),
  };
}

// ---------------------------------------------------------------------------
// Pose notes: always one unique note per frame, numbered "frame N of M"
// ---------------------------------------------------------------------------

const NOTE_PREFIX = /^\s*frame\s+\d+\s+of\s+\d+\s*[:\-–]?\s*/i;

/** The text of a pose note without its "frame N of M:" prefix. */
export function poseNoteBody(note: string): string {
  return (note || '').replace(NOTE_PREFIX, '').trim();
}

const noteKey = (body: string) => body.toLowerCase().replace(/\s+/g, ' ').trim();

/** Make every body unique: repeats of a cycle get ", loop 2", ", loop 3", ... */
function makeUnique(bodies: string[]): string[] {
  const seen = new Set<string>();
  return bodies.map((body) => {
    let candidate = body;
    let loop = 2;
    while (seen.has(noteKey(candidate))) {
      candidate = `${body}, loop ${loop++}`;
    }
    seen.add(noteKey(candidate));
    return candidate;
  });
}

function numberNotes(bodies: string[]): string[] {
  return bodies.map((b, i) => `frame ${i + 1} of ${bodies.length}: ${b}`);
}

/**
 * Match pose notes to the frame count: keep existing notes in order, drop extras,
 * fill missing ones from the auto-written phases, remove duplicates, and renumber
 * every note "frame N of M".
 */
export function syncPoseNotes(notes: string[], frameCount: number, description: string): string[] {
  const count = Math.max(1, Math.floor(frameCount) || 1);
  const generated = rawPoseBodies(description, count);
  const bodies: string[] = [];
  for (let i = 0; i < count; i++) {
    const existing = poseNoteBody((notes || [])[i] || '');
    bodies.push(existing || generated[i]);
  }
  return numberNotes(makeUnique(bodies));
}

/** Null when the notes are usable for generation, otherwise a message saying what to fix. */
export function validatePoseNotes(notes: string[], frameCount: number): string | null {
  const list = notes || [];
  if (list.length !== frameCount) {
    return `Pose notes (${list.length}) don't match the frame count (${frameCount}). Change Frames or click "Auto-write notes".`;
  }
  const firstIndex = new Map<string, number>();
  for (let i = 0; i < list.length; i++) {
    const body = poseNoteBody(list[i]);
    if (!body) return `Pose note ${i + 1} is empty.`;
    const key = noteKey(body);
    if (firstIndex.has(key)) {
      return `Pose notes ${firstIndex.get(key)! + 1} and ${i + 1} are the same. Each frame needs its own pose.`;
    }
    firstIndex.set(key, i);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Template canvas layout (exact requested aspect ratio, centered cell block)
// ---------------------------------------------------------------------------

export const TEMPLATE_SCALE = 8;

export interface TemplateLayout {
  aspectRatio: string;
  cols: number;
  rows: number;
  /** Template canvas size in template pixels (multiples of TEMPLATE_SCALE). */
  canvasW: number;
  canvasH: number;
  /** One cell in template pixels. */
  cellW: number;
  cellH: number;
  /** Top-left of the cell block in template pixels (multiples of TEMPLATE_SCALE). */
  offsetX: number;
  offsetY: number;
}

export function parseAspect(aspect: string): [number, number] {
  const [a, b] = aspect.split(':').map((n) => parseInt(n, 10));
  return a > 0 && b > 0 ? [a, b] : [1, 1];
}

/**
 * Canvas with exactly the aspect ratio requested from the model, big enough for the
 * cols x rows block of (frame x 8) cells, padded with magenta and the block centered.
 * Canvas size and offsets are multiples of 8, so in sprite pixels (template / 8) every
 * cell lands on whole pixels and slicing uses the same positions as the template.
 */
export function computeTemplateLayout(
  cols: number,
  rows: number,
  frameWidth: number,
  frameHeight: number,
  aspectRatio: string
): TemplateLayout {
  const s = TEMPLATE_SCALE;
  const cellW = frameWidth * s;
  const cellH = frameHeight * s;
  const gridW = cols * cellW;
  const gridH = rows * cellH;
  const [a, b] = parseAspect(aspectRatio);
  // canvas = (a*k) x (b*k), k a multiple of 8 so both sides are multiples of 8
  const k = s * Math.ceil(Math.max(gridW / a, gridH / b) / s);
  const canvasW = a * k;
  const canvasH = b * k;
  const offsetX = s * Math.floor((canvasW - gridW) / 2 / s);
  const offsetY = s * Math.floor((canvasH - gridH) / 2 / s);
  return { aspectRatio, cols, rows, canvasW, canvasH, cellW, cellH, offsetX, offsetY };
}

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cell rectangles in sprite pixels (template / 8), reading order. */
export function templateCellRects(layout: TemplateLayout, frameWidth: number, frameHeight: number): CellRect[] {
  const ox = layout.offsetX / TEMPLATE_SCALE;
  const oy = layout.offsetY / TEMPLATE_SCALE;
  const rects: CellRect[] = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      rects.push({ x: ox + c * frameWidth, y: oy + r * frameHeight, w: frameWidth, h: frameHeight });
    }
  }
  return rects;
}

// ---------------------------------------------------------------------------
// Grid detection from magenta (transparent after keying) gutters
// ---------------------------------------------------------------------------

export interface Band {
  start: number; // inclusive
  end: number; // inclusive
}

export interface DetectedGrid {
  cols: number;
  rows: number;
  colBands: Band[];
  rowBands: Band[];
}

/** Runs of indices where `filled[i]` is true, merging runs split by gaps narrower than minGap. */
function findBands(filled: boolean[], minGap: number): Band[] {
  const bands: Band[] = [];
  let i = 0;
  while (i < filled.length) {
    if (!filled[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < filled.length && filled[i]) i++;
    const band = { start, end: i - 1 };
    const prev = bands[bands.length - 1];
    if (prev && band.start - prev.end - 1 < minGap) prev.end = band.end;
    else bands.push(band);
  }
  return bands;
}

/**
 * Detect the cell layout the model actually drew. After magenta keying, gutters are
 * columns / rows with no opaque pixel; figures are the runs between them. Gaps narrower
 * than `minGap` pixels are treated as part of a figure (e.g. between legs).
 */
export function detectGrid(pixels: Uint8ClampedArray, width: number, height: number, minGap = 2): DetectedGrid {
  const colFilled = new Array<boolean>(width).fill(false);
  const rowFilled = new Array<boolean>(height).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) {
        colFilled[x] = true;
        rowFilled[y] = true;
      }
    }
  }
  const colBands = findBands(colFilled, minGap);
  const rowBands = findBands(rowFilled, minGap);
  return { cols: colBands.length, rows: rowBands.length, colBands, rowBands };
}

/**
 * The detected layout matches the requested one when every figure band sits inside a
 * single requested cell (columns and rows checked separately). A band crossing a cell
 * boundary, or more bands than cells, means the model drew its own grid.
 */
export function gridMatchesRequested(
  detected: DetectedGrid,
  cells: { originX: number; originY: number; cellW: number; cellH: number; cols: number; rows: number },
  tolerance = 1
): boolean {
  if (detected.cols === 0 || detected.rows === 0) return true; // nothing drawn: nothing to contradict
  if (detected.cols > cells.cols || detected.rows > cells.rows) return false;
  const fits = (band: Band, origin: number, size: number, count: number) => {
    const first = Math.floor((band.start + tolerance - origin) / size);
    const last = Math.floor((band.end - tolerance - origin) / size);
    return first === last && first >= 0 && first < count;
  };
  return (
    detected.colBands.every((b) => fits(b, cells.originX, cells.cellW, cells.cols)) &&
    detected.rowBands.every((b) => fits(b, cells.originY, cells.cellH, cells.rows))
  );
}

/** Cell rectangles for a detected grid: split halfway through each gutter, reading order. */
export function detectedCellRects(detected: DetectedGrid, width: number, height: number): CellRect[] {
  const splits = (bands: Band[], size: number) => {
    const edges = [0];
    for (let i = 1; i < bands.length; i++) {
      edges.push(Math.floor((bands[i - 1].end + 1 + bands[i].start) / 2));
    }
    edges.push(size);
    return edges;
  };
  const xs = splits(detected.colBands, width);
  const ys = splits(detected.rowBands, height);
  const rects: CellRect[] = [];
  for (let r = 0; r < detected.rows; r++) {
    for (let c = 0; c < detected.cols; c++) {
      rects.push({ x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] });
    }
  }
  return rects;
}

// ---------------------------------------------------------------------------
// Divider lines (model drew solid grid lines instead of leaving magenta gutters)
// ---------------------------------------------------------------------------

export interface Dividers {
  /** Horizontal divider runs (row ranges). */
  rows: Band[];
  /** Vertical divider runs (column ranges). */
  cols: Band[];
}

export interface DividerOptions {
  /** Pixels this dark or darker count as divider pixels (default: the outline color). */
  outlineColor?: string;
  /** Faint guide color the template uses. */
  guideColor?: string;
  /** Share of a full row/column that must be divider pixels. */
  minFraction?: number;
  /** Minimum run thickness as a share of the image size along that axis. */
  minThicknessFraction?: number;
}

const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function hexRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/**
 * Find full-width rows and full-height columns where more than 85% of pixels are dark
 * (outline color or darker) or the guide color, in runs at least 1% of the image size thick.
 * Works on the raw model output, before magenta keying.
 */
export function findDividers(px: Uint8ClampedArray, w: number, h: number, opts: DividerOptions = {}): Dividers {
  const [or, og, ob] = hexRgb(opts.outlineColor || '#2b2b2b');
  const [gr, gg, gb] = hexRgb(opts.guideColor || '#e000e0');
  const darkLimit = luminance(or, og, ob) + 16; // small margin for compression noise
  const minFraction = opts.minFraction ?? 0.85;
  const minThick = opts.minThicknessFraction ?? 0.01;

  const isDivider = (i: number) => {
    if (px[i + 3] === 0) return false;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (luminance(r, g, b) <= darkLimit) return true;
    return Math.abs(r - gr) <= 24 && Math.abs(g - gg) <= 24 && Math.abs(b - gb) <= 24;
  };

  const rowHits = new Array<boolean>(h).fill(false);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (isDivider((y * w + x) * 4)) n++;
    rowHits[y] = n > minFraction * w;
  }
  const colHits = new Array<boolean>(w).fill(false);
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (isDivider((y * w + x) * 4)) n++;
    colHits[x] = n > minFraction * h;
  }

  const runs = (hits: boolean[], size: number): Band[] => {
    const out: Band[] = [];
    let i = 0;
    while (i < hits.length) {
      if (!hits[i]) {
        i++;
        continue;
      }
      const start = i;
      while (i < hits.length && hits[i]) i++;
      if (i - start >= minThick * size) out.push({ start, end: i - 1 });
    }
    return out;
  };
  return { rows: runs(rowHits, h), cols: runs(colHits, w) };
}

/** Make divider pixels transparent so they act as gutters (mutates `px`). */
export function blankDividers(px: Uint8ClampedArray, w: number, h: number, d: Dividers): void {
  for (const band of d.rows) {
    for (let y = band.start; y <= band.end; y++) for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] = 0;
  }
  for (const band of d.cols) {
    for (let x = band.start; x <= band.end; x++) for (let y = 0; y < h; y++) px[(y * w + x) * 4 + 3] = 0;
  }
}

/**
 * Segments between dividers along one axis. Thin leftovers (under half the median segment,
 * e.g. a sliver outside an outer border line) are dropped.
 */
export function segmentsBetween(dividers: Band[], size: number): Band[] {
  const segs: Band[] = [];
  let cursor = 0;
  for (const d of dividers) {
    if (d.start > cursor) segs.push({ start: cursor, end: d.start - 1 });
    cursor = d.end + 1;
  }
  if (cursor < size) segs.push({ start: cursor, end: size - 1 });
  if (segs.length <= 1) return segs;
  const lengths = segs.map((s) => s.end - s.start + 1).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  return segs.filter((s) => s.end - s.start + 1 >= median / 2);
}

/**
 * Cell rectangles (reading order) from divider lines. An axis without dividers uses
 * `fallback` segments (e.g. the computed template cells) for that axis.
 */
export function cellsFromDividers(
  d: Dividers,
  w: number,
  h: number,
  fallback: { xs: Band[]; ys: Band[] }
): { cols: number; rows: number; rects: CellRect[] } {
  const xs = d.cols.length > 0 ? segmentsBetween(d.cols, w) : fallback.xs;
  const ys = d.rows.length > 0 ? segmentsBetween(d.rows, h) : fallback.ys;
  const rects: CellRect[] = [];
  for (const y of ys) for (const x of xs) rects.push({ x: x.start, y: y.start, w: x.end - x.start + 1, h: y.end - y.start + 1 });
  return { cols: xs.length, rows: ys.length, rects };
}
