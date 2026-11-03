import { GenerationConfig, StyleProfile, ProfileReference } from '../types';
import { getGridDimensions, getBestAspectRatio } from './gridLayout';

export interface BuiltPromptData {
  promptText: string;
  referenceImages: Array<{ data: string; mimeType: string }>;
  aspectRatio: string;
  assetName: string;
  gridCols?: number;
  gridRows?: number;
}

export function buildGenerationPrompt(
  config: GenerationConfig,
  profile: StyleProfile,
  frameByFrameIndex?: number
): BuiltPromptData {
  const parts: string[] = [];

  // 1. Core Profile Style
  parts.push(`Pixel art style guidelines: ${profile.description}`);
  parts.push(`Palette constraint: restricted color palette with outline color ${profile.outlineColor}.`);
  parts.push(`Pixel specifications: authentic crisp pixel art, hard square pixels, NO anti-aliasing, NO blurring, NO gradients, NO modern lighting filters.`);

  // 2. Asset Type Specific Instructions
  let assetName = 'asset';
  let aspectRatio = '1:1';
  let gridCols = 1;
  let gridRows = 1;

  switch (config.type) {
    case 'sprite':
      assetName = `fig_${sanitizeName(config.description || 'character')}`;
      parts.push(`Asset Type: Single Character Sprite.`);
      parts.push(`Facing direction: ${config.facing}.`);
      parts.push(`Target dimensions: approximately ${config.frameWidth}x${config.frameHeight} pixels.`);
      parts.push(`Description: ${config.description}`);
      parts.push(`CRITICAL BACKGROUND REQUIREMENT: Solid flat #FF00FF vibrant magenta background ONLY. Absolutely NO shadows on ground, NO text, NO labels, NO UI, NO grid lines.`);
      break;

    case 'animation': {
      assetName = `fig_${sanitizeName(config.description || 'action')}`;
      const frameCount = config.frameCount || 6;
      const dims = getGridDimensions(frameCount);
      gridCols = dims.cols;
      gridRows = dims.rows;
      aspectRatio = getBestAspectRatio(dims.cols, dims.rows, config.frameWidth, config.frameHeight);

      if (config.animationMode === 'template') {
        // User's exact prompt specification for Template Fill Mode
        parts.push(
          `Fill every empty cell with the next frame of this animation: ${config.description}. Same exact character as cell 1, same size, same baseline, same outline and colors. One figure per cell, centered. Keep the magenta background and the cell positions. Do not add text.`
        );
        parts.push(
          `GRID SPECIFICATION: The attached template is the canvas to edit. It contains a block of ${dims.cols} columns by ${dims.rows} rows (total ${dims.cols * dims.rows} cells) centered on a larger magenta canvas. Keep the canvas size, keep the block where it is, and leave the magenta margins around it empty. Frames proceed left-to-right, row-by-row in reading order. Exactly ${frameCount} animation frames: cell 1 is the anchor, and cells 2 to ${frameCount} are marked with small faint numbers in their top-left corners. Those numbers are labels only; do not copy them. Any unnumbered cells remain solid empty #FF00FF magenta. Do not add, remove, or move cells.`
        );
        parts.push(
          `ALIGNMENT: Every frame must touch the EXACT SAME BASELINE so the looped animation runs smoothly without jitter.`
        );
      } else if (config.animationMode === 'frame_by_frame') {
        const frameIdx = frameByFrameIndex !== undefined ? frameByFrameIndex : 0;
        const poseNote =
          config.poseNotes && config.poseNotes[frameIdx]
            ? config.poseNotes[frameIdx]
            : `frame ${frameIdx + 1} of ${frameCount}: progression of ${config.description}`;

        parts.push(`Asset Type: Single Animation Frame (${frameIdx + 1} of ${frameCount}).`);
        parts.push(`Action description: ${config.description}`);
        parts.push(`Pose note for this frame: ${poseNote}`);
        parts.push(`Facing direction: ${config.facing}.`);
        parts.push(`Cell size: ${config.frameWidth}x${config.frameHeight} pixels.`);
        parts.push(
          `ALIGNMENT & CONTINUITY: Keep the exact proportions, size, 1px outline (${profile.outlineColor}), and baseline position identical to the anchor and previous frame reference.`
        );
        parts.push(
          `CRITICAL BACKGROUND REQUIREMENT: Solid flat #FF00FF vibrant magenta background ONLY. No shadows, no text, no borders.`
        );
        aspectRatio = '1:1';
      } else {
        // Standard Grid Generation Mode
        parts.push(`Asset Type: 2D Pixel Art Animation Sheet.`);
        parts.push(`Action description: ${config.description}`);
        parts.push(`Facing direction: ${config.facing}.`);
        parts.push(`Frame count: Exactly ${frameCount} animation frames arranged in a ${dims.cols}x${dims.rows} grid.`);
        parts.push(
          `GRID LAYOUT: Render the ${frameCount} frames in a ${dims.cols} columns by ${dims.rows} rows grid in reading order (row 1: left to right, then row 2: left to right). Any unused cells must remain solid flat empty #FF00FF magenta.`
        );
        parts.push(
          `ALIGNMENT: The character must be centered in each cell, and the feet must touch the EXACT SAME BASELINE across every frame so the animation loops without jitter.`
        );
        parts.push(
          `Each frame cell size is ${config.frameWidth}x${config.frameHeight} pixels (${
            config.frameWidth === 32 ? '32x24 wide cell for swinging tool/weapon reach' : '24x24 cell for standing pose'
          }).`
        );
        parts.push(
          `CRITICAL BACKGROUND REQUIREMENT: Solid flat #FF00FF vibrant magenta background ONLY behind the frames. Absolutely NO text, NO numbers, NO dividers, NO shadows.`
        );
      }
      break;
    }

    case 'prop':
      assetName = `props_${sanitizeName(config.description || 'items')}`;
      parts.push(`Asset Type: Pixel Art Prop Sheet / Item Icons.`);
      parts.push(`Theme: ${config.description}`);
      parts.push(`Items to draw in a loose, clean grid separated from each other:\n${config.propItems}`);
      parts.push(`Each item should be an authentic small pixel art icon (~${config.frameWidth}x${config.frameHeight} pixels).`);
      parts.push(`CRITICAL BACKGROUND REQUIREMENT: Solid flat #FF00FF vibrant magenta background ONLY. No shadows, no labels, no text, no grid boxes.`);
      break;

    case 'background':
      assetName = `bg_${sanitizeName(config.description || 'environment')}`;
      parts.push(`Asset Type: Layered Side-View Pixel Art Background Landscape.`);
      parts.push(`Description: ${config.description}`);
      parts.push(`Resolution: ${config.frameWidth}x${config.frameHeight} pixels.`);
      if (config.tilingSeamless) {
        parts.push(`SEAMLESS TILING: The left and right edges must align seamlessly so this background can tile infinitely horizontally without visible seam.`);
      }
      if (config.splitParallax) {
        parts.push(`PARALLAX DEPTH: Clean visual separation between vertical layers: top sky band, pale distant hazy mountains, darker midground hills/trees, dark saturated foreground ground silhouettes.`);
      }
      parts.push(`Visual style: Calm mood, simple rounded shapes, clean silhouettes, vertical bands of flat color steps, atmospheric perspective.`);
      aspectRatio = config.frameWidth >= config.frameHeight * 3 ? '16:9' : '1:1';
      break;

    case 'effect':
      assetName = `fx_${sanitizeName(config.description || 'effect')}`;
      parts.push(`Asset Type: Pixel Art Visual Effects Sheet.`);
      parts.push(`Effect details: ${config.effectItems}`);
      parts.push(`Frames per effect: ${config.framesPerEffect || 4} horizontal sequential frames.`);
      parts.push(`CRITICAL BACKGROUND REQUIREMENT: Solid flat #FF00FF vibrant magenta background ONLY. No glow blooms, no soft antialiasing.`);
      break;
  }

  // 3. Anchor Reference & Image References
  const referenceImages: Array<{ data: string; mimeType: string }> = [];

  // Anchor reference is placed first
  const anchor = profile.references.find((r) => r.isAnchor || r.id === profile.anchorId);
  if (anchor) {
    parts.push(
      `ANCHOR REFERENCE INSTRUCTION: The attached reference image is the exact character Anchor (a single character on solid magenta). You MUST keep its proportions, body size, eye style, 1-pixel dark brown outline color (${profile.outlineColor}), and exact color palette identical.`
    );
    if (anchor.base64) {
      referenceImages.push({
        data: anchor.base64,
        mimeType: 'image/png',
      });
    }
  }

  // Add other profile references
  for (const ref of profile.references) {
    if (ref !== anchor && ref.base64) {
      referenceImages.push({
        data: ref.base64,
        mimeType: 'image/png',
      });
    }
  }

  // Add extra references specifically added for this request
  for (const ref of config.extraReferences || []) {
    if (ref.base64) {
      referenceImages.push({
        data: ref.base64,
        mimeType: 'image/png',
      });
    }
  }

  return {
    promptText: parts.join('\n\n'),
    referenceImages,
    aspectRatio,
    assetName,
    gridCols,
    gridRows,
  };
}

function sanitizeName(str: string): string {
  return (
    str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'item'
  );
}
