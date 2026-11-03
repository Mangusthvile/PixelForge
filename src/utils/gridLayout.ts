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
 * Generates context-aware pose notes from an action description and frame count
 */
export function generatePoseNotes(actionDescription: string, frameCount: number): string[] {
  const desc = (actionDescription || '').toLowerCase();
  const count = Math.max(2, Math.min(12, frameCount));

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
      return `frame ${i + 1} of ${count}: ${phase}`;
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
      return `frame ${i + 1} of ${count}: ${phase}`;
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
      return `frame ${i + 1} of ${count}: ${phase}`;
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
      return `frame ${i + 1} of ${count}: ${phase}`;
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
      return `frame ${i + 1} of ${count}: ${phase}`;
    });
  }

  // General fallback
  return Array.from({ length: count }, (_, i) => {
    return `frame ${i + 1} of ${count}: progression step ${i + 1} of ${actionDescription || 'action'}`;
  });
}

/**
 * Builds the Canvas Template Image for Template Fill Mode:
 * - Sized to grid: each cell = frameWidth * 8 by frameHeight * 8
 * - Solid #FF00FF magenta canvas
 * - Faint guide lines in #E000E0 between cells
 * - Anchor drawn in cell 1 (col 0, row 0) at 8x nearest-neighbor on the shared baseline
 * - Other cells empty
 */
export async function buildGridTemplateImage(
  anchorDataUrl: string,
  cols: number,
  rows: number,
  frameWidth: number,
  frameHeight: number,
  baselineY?: number
): Promise<string> {
  const cellW = frameWidth * 8;
  const cellH = frameHeight * 8;
  const totalW = cols * cellW;
  const totalH = rows * cellH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 1. Fill solid #FF00FF vibrant magenta
  ctx.fillStyle = '#FF00FF';
  ctx.fillRect(0, 0, totalW, totalH);

  // 2. Faint guide lines between cells in #E000E0 (1px wide)
  ctx.strokeStyle = '#E000E0';
  ctx.lineWidth = 1;

  for (let c = 1; c < cols; c++) {
    const x = c * cellW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, totalH);
    ctx.stroke();
  }

  for (let r = 1; r < rows; r++) {
    const y = r * cellH;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(totalW, y);
    ctx.stroke();
  }

  // 3. Draw Anchor in cell 1 (col 0, row 0) at 8x with nearest-neighbor scaling
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

      // Calculate anchor bounds or draw centered in cell 1
      let drawW = cellW;
      let drawH = cellH;

      if (imgW <= frameWidth && imgH <= frameHeight) {
        drawW = imgW * 8;
        drawH = imgH * 8;
      } else {
        // Already scaled or proportional
        const scale = Math.min(cellW / imgW, cellH / imgH);
        drawW = Math.round(imgW * scale);
        drawH = Math.round(imgH * scale);
      }

      const drawX = Math.round((cellW - drawW) / 2);
      // Place feet on baseline if specified, else bottom with 1-cell-pixel (8 screen px) margin
      const baselinePx =
        baselineY !== undefined && baselineY >= 0 ? (baselineY + 1) * 8 : cellH - 8;
      const drawY = Math.max(0, baselinePx - drawH);

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
