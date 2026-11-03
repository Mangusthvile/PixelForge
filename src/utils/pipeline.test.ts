import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb,
  rgbToHex,
  colorDistance,
  isNearMagenta,
  keyOutMagentaData,
  applyPaletteLockData,
  removeStrayPixelsData,
  extractPaletteFromData,
  downscaleNearestNeighborData,
  detectPixelScale,
  getFrameBounds,
  getGridCellBounds,
} from './pipeline';
import {
  getGridDimensions,
  getBestAspectRatio,
  generatePoseNotes,
  detectCopyOfFrames,
} from './gridLayout';

test('hexToRgb and rgbToHex conversion', () => {
  const rgb = hexToRgb('#ff00ff');
  assert.equal(rgb.r, 255);
  assert.equal(rgb.g, 0);
  assert.equal(rgb.b, 255);

  const hex = rgbToHex(255, 0, 255);
  assert.equal(hex.toLowerCase(), '#ff00ff');

  const shortRgb = hexToRgb('#fff');
  assert.equal(shortRgb.r, 255);
  assert.equal(shortRgb.g, 255);
  assert.equal(shortRgb.b, 255);
});

test('magenta keying detects magenta and near-magenta accurately', () => {
  assert.equal(isNearMagenta({ r: 255, g: 0, b: 255 }, 35), true);
  assert.equal(isNearMagenta({ r: 250, g: 10, b: 248 }, 35), true);
  // White or skin tone should NOT be magenta
  assert.equal(isNearMagenta({ r: 255, g: 255, b: 255 }, 35), false);
  assert.equal(isNearMagenta({ r: 61, g: 37, b: 30 }, 35), false);

  // Test array mutation
  const pixels = new Uint8ClampedArray([
    255, 0, 255, 255, // magenta
    255, 255, 255, 255, // white
    240, 5, 240, 255, // near magenta
    61, 37, 30, 255, // brown
  ]);
  keyOutMagentaData(pixels, 35);

  assert.equal(pixels[3], 0); // magenta cleared
  assert.equal(pixels[7], 255); // white preserved
  assert.equal(pixels[11], 0); // near magenta cleared
  assert.equal(pixels[15], 255); // brown preserved
});

test('palette lock snaps colors to nearest profile color', () => {
  const palette = ['#000000', '#ffffff', '#ff0000'];
  const pixels = new Uint8ClampedArray([
    10, 10, 12, 255, // near black -> should lock to #000000
    245, 240, 250, 255, // near white -> should lock to #ffffff
    230, 20, 15, 255, // near red -> should lock to #ff0000
    0, 0, 0, 0, // transparent -> should stay untouched
  ]);

  applyPaletteLockData(pixels, palette);

  // First pixel: #000000
  assert.equal(pixels[0], 0);
  assert.equal(pixels[1], 0);
  assert.equal(pixels[2], 0);

  // Second pixel: #ffffff
  assert.equal(pixels[4], 255);
  assert.equal(pixels[5], 255);
  assert.equal(pixels[6], 255);

  // Third pixel: #ff0000
  assert.equal(pixels[8], 255);
  assert.equal(pixels[9], 0);
  assert.equal(pixels[10], 0);

  // Fourth pixel: remains transparent
  assert.equal(pixels[15], 0);
});

test('remove stray pixels eliminates isolated single pixels and snaps alpha', () => {
  const width = 3;
  const height = 3;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // (1, 0)
  const idx1 = (0 * 3 + 1) * 4;
  pixels[idx1] = 255; pixels[idx1 + 1] = 255; pixels[idx1 + 2] = 255; pixels[idx1 + 3] = 255;

  // (0, 2)
  const idx2 = (2 * 3 + 0) * 4;
  pixels[idx2] = 255; pixels[idx2 + 1] = 255; pixels[idx2 + 2] = 255; pixels[idx2 + 3] = 255;

  // (1, 2)
  const idx3 = (2 * 3 + 1) * 4;
  pixels[idx3] = 255; pixels[idx3 + 1] = 255; pixels[idx3 + 2] = 255; pixels[idx3 + 3] = 200;

  removeStrayPixelsData(pixels, width, height);

  // Isolated pixel (1, 0) should be cleared
  assert.equal(pixels[idx1 + 3], 0);

  // Connected pixels in row 2 should be preserved, with alpha snapped to 255
  assert.equal(pixels[idx2 + 3], 255);
  assert.equal(pixels[idx3 + 3], 255);
});

test('detectPixelScale detects scaling factors properly', () => {
  const scale = detectPixelScale(512, 128, 16, 16, 4);
  assert.equal(scale, 8);
});

test('downscaleNearestNeighbor samples cleanly', () => {
  const src = new Uint8ClampedArray([
    10, 10, 10, 255,  10, 10, 10, 255,  20, 20, 20, 255,  20, 20, 20, 255,
    10, 10, 10, 255,  10, 10, 10, 255,  20, 20, 20, 255,  20, 20, 20, 255,
    30, 30, 30, 255,  30, 30, 30, 255,  40, 40, 40, 255,  40, 40, 40, 255,
    30, 30, 30, 255,  30, 30, 30, 255,  40, 40, 40, 255,  40, 40, 40, 255,
  ]);

  const dst = downscaleNearestNeighborData(src, 4, 4, 2, 2);
  assert.equal(dst.length, 2 * 2 * 4);
  assert.equal(dst[0], 10);
  assert.equal(dst[4], 20);
  assert.equal(dst[8], 30);
  assert.equal(dst[12], 40);
});

test('getFrameBounds and getGridCellBounds calculate bounding box accurately', () => {
  const width = 10;
  const height = 10;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Set non-empty pixels in cell 2 (x=5..8, y=5..8)
  for (let y = 5; y <= 8; y++) {
    for (let x = 5; x <= 8; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx] = 255;
      pixels[idx + 3] = 255;
    }
  }

  // Check full bounds
  const bounds = getFrameBounds(pixels, width, height, 0, 10);
  assert.equal(bounds.hasContent, true);
  assert.equal(bounds.minX, 5);
  assert.equal(bounds.maxX, 8);

  // Check 2D grid cell bounds
  // Cell at row 0 (y 0..4), col 0 (x 0..4) -> empty!
  const emptyCell = getGridCellBounds(pixels, width, height, 0, 5, 0, 5);
  assert.equal(emptyCell.hasContent, false);

  // Cell at row 1 (y 5..9), col 1 (x 5..9) -> hasContent!
  const activeCell = getGridCellBounds(pixels, width, height, 5, 10, 5, 10);
  assert.equal(activeCell.hasContent, true);
  assert.equal(activeCell.minX, 5);
  assert.equal(activeCell.maxX, 8);
  assert.equal(activeCell.minY, 5);
  assert.equal(activeCell.maxY, 8);
});

test('getGridDimensions follows exact user specifications', () => {
  // - 2 frames: 2x1
  assert.deepEqual(getGridDimensions(2), { cols: 2, rows: 1 });
  // - 3 or 4 frames: 2x2
  assert.deepEqual(getGridDimensions(3), { cols: 2, rows: 2 });
  assert.deepEqual(getGridDimensions(4), { cols: 2, rows: 2 });
  // - 5 or 6 frames: 3x2
  assert.deepEqual(getGridDimensions(5), { cols: 3, rows: 2 });
  assert.deepEqual(getGridDimensions(6), { cols: 3, rows: 2 });
  // - 7 or 8 frames: 4x2
  assert.deepEqual(getGridDimensions(7), { cols: 4, rows: 2 });
  assert.deepEqual(getGridDimensions(8), { cols: 4, rows: 2 });
  // - 9 frames: 3x3
  assert.deepEqual(getGridDimensions(9), { cols: 3, rows: 3 });
  // - 10 to 12 frames: 4x3
  assert.deepEqual(getGridDimensions(10), { cols: 4, rows: 3 });
  assert.deepEqual(getGridDimensions(11), { cols: 4, rows: 3 });
  assert.deepEqual(getGridDimensions(12), { cols: 4, rows: 3 });
});

test('getBestAspectRatio calculates closest aspect ratio for grid', () => {
  // 2x2 grid with square cells (ratio 1.0) -> '1:1'
  assert.equal(getBestAspectRatio(2, 2, 24, 24), '1:1');
  // 3x2 grid with square cells (ratio 1.5) -> '3:2'
  assert.equal(getBestAspectRatio(3, 2, 24, 24), '3:2');
  // 4x2 grid with square cells (ratio 2.0) -> '16:9' (closest among 1:1, 4:3, 3:2, 16:9)
  assert.equal(getBestAspectRatio(4, 2, 24, 24), '16:9');
  // 3x3 grid with square cells (ratio 1.0) -> '1:1'
  assert.equal(getBestAspectRatio(3, 3, 24, 24), '1:1');
  // 4x3 grid with square cells (ratio 1.33) -> '4:3'
  assert.equal(getBestAspectRatio(4, 3, 24, 24), '4:3');
});

test('generatePoseNotes produces contextual progression steps', () => {
  const walkNotes = generatePoseNotes('walk cycle 6 frames', 6);
  assert.equal(walkNotes.length, 6);
  assert.match(walkNotes[0], /frame 1 of 6/);
  assert.match(walkNotes[0], /right foot/i);

  const chopNotes = generatePoseNotes('chop with axe 4 frames', 4);
  assert.equal(chopNotes.length, 4);
  assert.match(chopNotes[0], /frame 1 of 4/);
});

test('detectCopyOfFrames detects copied identical frames vs animated frames', () => {
  const w = 4;
  const h = 4;
  // Frame 1: character pixels
  const f1 = new Uint8ClampedArray(w * h * 4);
  f1[0] = 255; f1[1] = 255; f1[2] = 255; f1[3] = 255;
  f1[4] = 61;  f1[5] = 37;  f1[6] = 30;  f1[7] = 255;

  // Frame 2: exact duplicate
  const f2 = new Uint8ClampedArray(f1);

  const copyResult = detectCopyOfFrames([f1, f2], w, h);
  assert.equal(copyResult.isCopied, true);
  assert.equal(copyResult.similarityPercent, 100);

  // Frame 3: distinctly animated posture
  const f3 = new Uint8ClampedArray(w * h * 4);
  f3[8] = 200; f3[9] = 100; f3[10] = 50; f3[11] = 255;

  const distinctResult = detectCopyOfFrames([f1, f3], w, h);
  assert.equal(distinctResult.isCopied, false);
});

test('Template Fill Mode builds the exact required prompt instruction', async () => {
  const { buildGenerationPrompt } = await import('./promptBuilder.ts');
  const { INITIAL_CHARACTERS_PROFILE } = await import('./storage.ts');

  const action = 'walk cycle continuous 6 frames swinging arms and stepping legs';
  const built = buildGenerationPrompt(
    {
      type: 'animation',
      description: action,
      facing: 'right',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 6,
      propItems: '',
      tilingSeamless: true,
      splitParallax: false,
      effectItems: '',
      framesPerEffect: 4,
      extraReferences: [],
      animationMode: 'template',
      selectedModel: 'gemini-3-pro-image',
      poseNotes: [],
    },
    INITIAL_CHARACTERS_PROFILE
  );

  assert.match(built.promptText, /Fill every empty cell with the next frame of this animation: walk cycle/);
  assert.match(built.promptText, /Same exact character as cell 1, same size, same baseline, same outline and colors/);
  assert.match(built.promptText, /One figure per cell, centered/);
  assert.match(built.promptText, /Keep the magenta background and the cell positions/);
  assert.match(built.promptText, /Do not add text/);
  assert.equal(built.aspectRatio, '3:2'); // 3x2 grid -> 3:2
  assert.equal(built.gridCols, 3);
  assert.equal(built.gridRows, 2);
});

test('getModelOption correctly resolves Gemini image models and badges', async () => {
  const { getModelOption } = await import('../types.ts');

  // Default / undefined returns Gemini 3 Pro Image (highest quality default)
  const defaultModel = getModelOption();
  assert.equal(defaultModel.id, 'gemini-3-pro-image');
  assert.equal(defaultModel.name, 'Gemini 3 Pro Image');
  assert.match(defaultModel.badge, /Pro Quality/);

  // Gemini 3 Pro Image explicitly
  const proModel = getModelOption('gemini-3-pro-image');
  assert.equal(proModel.name, 'Gemini 3 Pro Image');

  // Gemini 3.1 Flash-Lite
  const flashModel = getModelOption('gemini-3.1-flash-lite-image');
  assert.equal(flashModel.name, 'Gemini 3.1 Flash Lite Image');
  assert.match(flashModel.badge, /Fast Lite/);

  // Gemini Nano Banana 2.1
  const nanoModel = getModelOption('gemini-nano-banana-2.1');
  assert.equal(nanoModel.name, 'Gemini Nano Banana 2.1');
  assert.match(nanoModel.badge, /High-Res/);

  // Custom / fallback model
  const customModel = getModelOption('custom-experimental-model');
  assert.equal(customModel.id, 'custom-experimental-model');
  assert.equal(customModel.name, 'custom-experimental-model');
});
