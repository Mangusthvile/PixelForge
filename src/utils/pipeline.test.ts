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
      assetName: 'fig_walk',
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

test('getModelOption resolves ids against the live model list', async () => {
  const { getModelOption } = await import('../types.ts');
  const models = [
    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' },
    { id: 'gemini-2.5-flash-image', name: 'Nano Banana' },
  ];

  assert.equal(getModelOption(models), null);
  assert.equal(getModelOption(models, 'gemini-3-pro-image-preview')?.name, 'Nano Banana Pro');

  // Unknown ids (e.g. an old saved selection) are shown as-is
  const custom = getModelOption(models, 'custom-experimental-model');
  assert.equal(custom?.id, 'custom-experimental-model');
  assert.equal(custom?.name, 'custom-experimental-model');
});

test('preset asset names follow the preset (fig_idle, fig_walk, bg_forest)', async () => {
  const { ANIMATION_PRESETS, BACKGROUND_PRESETS, getPresetAssetName } = await import('./presets.ts');
  const byId = (id: string) => [...ANIMATION_PRESETS, ...BACKGROUND_PRESETS].find((p) => p.id === id)!;
  assert.equal(getPresetAssetName(byId('anim_idle')), 'fig_idle');
  assert.equal(getPresetAssetName(byId('anim_walk')), 'fig_walk');
  assert.equal(getPresetAssetName(byId('bg_forest')), 'bg_forest');
});

test('nextVersionName picks the next free _vN suffix', async () => {
  const { nextVersionName } = await import('./naming.ts');
  assert.equal(nextVersionName('fig_idle', [{ name: 'fig_idle' }]), 'fig_idle_v2');
  assert.equal(
    nextVersionName('fig_idle', [{ name: 'fig_idle' }, { name: 'fig_idle_v2' }, { name: 'fig_idle_v3' }]),
    'fig_idle_v4'
  );
  assert.equal(nextVersionName('fig_idle_v2', [{ name: 'fig_idle_v2' }]), 'fig_idle_v3');
});

test('suggested names: type prefix + main action/subject, max 2 words, max 20 chars', async () => {
  const { suggestAssetName } = await import('./naming.ts');
  assert.equal(suggestAssetName('animation', 'chop with axe'), 'fig_chop');
  assert.equal(suggestAssetName('animation', 'walk cycle continuous 6 frames swinging arms and stepping legs'), 'fig_walk');
  assert.equal(suggestAssetName('background', 'cave'), 'bg_cave');
  assert.equal(suggestAssetName('background', 'deep subterranean cavern, stalactites'), 'bg_deep_subterranean'); // exactly 20
  assert.equal(suggestAssetName('background', 'underground quarry tunnel'), 'bg_underground');
  assert.equal(suggestAssetName('prop', 'collection of woodland props'), 'props_woodland_props');
  assert.equal(suggestAssetName('effect', 'fire spark burst 4 frames'), 'fx_fire_spark');
  assert.equal(suggestAssetName('sprite', ''), 'fig_asset');
  for (const d of ['supercalifragilisticexpialidocious hero', 'raising a woodcutter axe overhead and swinging down']) {
    assert.ok(suggestAssetName('animation', d).length <= 20, d);
  }
});

test('Name field follows presets until the user types a name, never the open asset', async () => {
  const { withAutoName, generationAssetName } = await import('./naming.ts');
  const base: any = { assetName: '', type: 'animation', description: 'idle stance' };

  // Preset picked: name is the preset's name
  const preset = withAutoName({ ...base, presetAssetName: 'fig_idle', presetDescription: 'idle stance' });
  assert.equal(preset.assetName, 'fig_idle');
  // Description edited away from the preset: suggestion instead
  assert.equal(withAutoName({ ...preset, description: 'chop wood' }).assetName, 'fig_chop_wood');
  // Typed name sticks through description changes
  const typed = withAutoName({ ...preset, assetName: 'hero_idle', assetNameEdited: true, description: 'x' });
  assert.equal(typed.assetName, 'hero_idle');
  // Background preset
  const bg = withAutoName({ ...base, type: 'background', description: 'lush woods', presetAssetName: 'bg_forest', presetDescription: 'lush woods' });
  assert.equal(bg.assetName, 'bg_forest');
  // The generation name is the sanitized Name field
  assert.equal(generationAssetName({ ...base, assetName: ' My Hero!! ' }), 'my_hero');
  assert.equal(generationAssetName({ ...base, assetName: '' }), 'fig_idle_stance');
});

test('import dialog pre-fills frame layout from the image size', async () => {
  const { importedAssetName, guessImportLayout, sliceRects, maxFramesFor } = await import('./naming.ts');
  assert.equal(importedAssetName('Walk Cycle (2).png'), 'walk_cycle_2');
  assert.equal(importedAssetName('.png'), 'imported');

  const anim = { type: 'animation' as const, frameWidth: 24, frameHeight: 24 };
  // 96x24 with 24x24 frames = 4 frames
  assert.deepEqual(guessImportLayout(96, 24, anim), { type: 'animation', frameWidth: 24, frameHeight: 24, frameCount: 4 });
  // Generator frame size that doesn't fit the image: falls back to square frames
  assert.deepEqual(
    guessImportLayout(96, 24, { type: 'sprite', frameWidth: 40, frameHeight: 24 }),
    { type: 'animation', frameWidth: 24, frameHeight: 24, frameCount: 4 }
  );
  // When the generator's frame size fits, it wins (96x24 at 32x24 = 3 frames)
  assert.equal(guessImportLayout(96, 24, { type: 'animation', frameWidth: 32, frameHeight: 24 }).frameCount, 3);
  // Single image
  assert.deepEqual(guessImportLayout(24, 24, anim), { type: 'animation', frameWidth: 24, frameHeight: 24, frameCount: 1 });
  // 2x2 grid of 24x24 frames
  assert.equal(guessImportLayout(48, 48, anim).frameCount, 4);
  // GIF: one frame per GIF frame
  assert.deepEqual(guessImportLayout(24, 24, anim, 6), { type: 'animation', frameWidth: 24, frameHeight: 24, frameCount: 6 });
  // Background
  assert.equal(guessImportLayout(320, 64, { type: 'background', frameWidth: 320, frameHeight: 64 }).frameCount, 1);

  assert.equal(maxFramesFor(96, 24, 24, 24), 4);
  assert.deepEqual(sliceRects(48, 48, 24, 24, 3), [{ x: 0, y: 0 }, { x: 24, y: 0 }, { x: 0, y: 24 }]);
  assert.equal(sliceRects(96, 24, 24, 24, 10).length, 4);
});

test('Template Fill scale is computed from the known grid, not detected', async () => {
  const { computeGridScale, formatScale } = await import('./pipeline.ts');
  // 3x2 grid of 24px frames rendered 1536px wide -> 1536 / (3 * 24) = 21.33x
  const scale = computeGridScale(1536, 3, 24);
  assert.ok(Math.abs(scale - 21.3333) < 0.001);
  assert.equal(formatScale(scale), '21.3');
  // Exact 8x template
  assert.equal(computeGridScale(576, 3, 24), 8);
  assert.equal(formatScale(8), '8');
  // Degenerate input falls back to 1x
  assert.equal(computeGridScale(576, 0, 24), 1);
});

test('block-majority downscale ignores a half-pixel offset', async () => {
  const { downscaleBlockModeData } = await import('./pipeline.ts');
  // 4x scale, 2x1 target. Source 8x4: left block red, right block blue, but the red
  // block bleeds 1px into the right block (simulated offset). Nearest sampling at the
  // block center could pick either; majority keeps blue.
  const w = 8, h = 4;
  const src = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const red = x < 5; // 1px bleed past the 4px boundary
      src[i] = red ? 255 : 0;
      src[i + 1] = 0;
      src[i + 2] = red ? 0 : 255;
      src[i + 3] = 255;
    }
  }
  const out = downscaleBlockModeData(src, w, h, 2, 1);
  assert.deepEqual(Array.from(out.slice(0, 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(out.slice(4, 8)), [0, 0, 255, 255]);

  // Fully transparent pixels count as one color regardless of their RGB
  const t = new Uint8ClampedArray(2 * 2 * 4);
  t.set([10, 20, 30, 0, 99, 99, 99, 0, 1, 2, 3, 0, 255, 255, 255, 255]);
  assert.deepEqual(Array.from(downscaleBlockModeData(t, 2, 2, 1, 1)), [0, 0, 0, 0]);
});

test('pose notes follow the frame count: add, remove, renumber, no duplicates', async () => {
  const { syncPoseNotes, validatePoseNotes, poseNoteBody, generatePoseNotes } = await import('./gridLayout.ts');

  const four = ['frame 1 of 4: a', 'frame 2 of 4: b', 'frame 3 of 4: c', 'frame 4 of 4: d'];
  // Grow: existing notes kept, new ones added, all renumbered
  const six = syncPoseNotes(four, 6, 'idle stance');
  assert.equal(six.length, 6);
  assert.equal(six[0], 'frame 1 of 6: a');
  assert.equal(six[3], 'frame 4 of 6: d');
  assert.match(six[5], /^frame 6 of 6: /);
  // Shrink: extras dropped, renumbered
  assert.deepEqual(syncPoseNotes(four, 2, 'idle'), ['frame 1 of 2: a', 'frame 2 of 2: b']);
  // Duplicates are made unique; notes without a prefix get one
  const dup = syncPoseNotes(['same pose', 'frame 2 of 3: Same  pose', 'other'], 3, 'idle');
  assert.equal(new Set(dup.map((n) => poseNoteBody(n).toLowerCase())).size, 3);
  assert.equal(dup[0], 'frame 1 of 3: same pose');
  assert.match(dup[1], /^frame 2 of 3: Same {2}pose, loop 2$/);

  // Auto-written notes never repeat, even past the end of a phase cycle
  const twelve = generatePoseNotes('idle breathing', 12);
  assert.equal(twelve.length, 12);
  assert.equal(new Set(twelve.map(poseNoteBody)).size, 12);
  assert.equal(validatePoseNotes(twelve, 12), null);

  // Validation blocks mismatched counts and duplicates with a clear message
  assert.match(validatePoseNotes(four, 6)!, /Pose notes \(4\) don't match the frame count \(6\)/);
  assert.match(validatePoseNotes(['frame 1 of 2: x', 'frame 2 of 2: X'], 2)!, /Pose notes 1 and 2 are the same/);
  assert.match(validatePoseNotes(['frame 1 of 2: x', 'frame 2 of 2: '], 2)!, /Pose note 2 is empty/);
});

test('template canvas has the exact requested aspect ratio with a centered cell block', async () => {
  const { computeTemplateLayout, templateCellRects, getBestAspectRatio } = await import('./gridLayout.ts');
  // 3x2 grid of 32x24 cells is 2:1, but the model is asked for 16:9
  const aspect = getBestAspectRatio(3, 2, 32, 24);
  assert.equal(aspect, '16:9');
  const l = computeTemplateLayout(3, 2, 32, 24, aspect);
  assert.equal(l.canvasW * 9, l.canvasH * 16); // exactly 16:9
  assert.deepEqual([l.canvasW, l.canvasH], [768, 432]);
  assert.ok(l.canvasW >= 3 * 32 * 8 && l.canvasH >= 2 * 24 * 8);
  assert.deepEqual([l.offsetX, l.offsetY], [0, 24]); // centered vertically
  assert.equal(l.offsetX % 8 + l.offsetY % 8 + l.canvasW % 8 + l.canvasH % 8, 0);

  // Every layout keeps the exact ratio and fits the block
  for (const [c, r, fw, fh] of [[2, 2, 24, 24], [3, 2, 24, 24], [4, 2, 24, 24], [4, 3, 32, 24], [2, 1, 32, 24]]) {
    const a = getBestAspectRatio(c, r, fw, fh);
    const [aw, ah] = a.split(':').map(Number);
    const t = computeTemplateLayout(c, r, fw, fh, a);
    assert.equal(t.canvasW * ah, t.canvasH * aw, `${c}x${r} ${fw}x${fh} ${a}`);
    assert.ok(t.offsetX + c * fw * 8 <= t.canvasW && t.offsetY + r * fh * 8 <= t.canvasH);
  }

  // Slice rects in sprite pixels use the same positions
  const rects = templateCellRects(l, 32, 24);
  assert.equal(rects.length, 6);
  assert.deepEqual(rects[0], { x: 0, y: 3, w: 32, h: 24 });
  assert.deepEqual(rects[4], { x: 32, y: 27, w: 32, h: 24 });
});

/** Transparent canvas with opaque rectangles (sprite pixels). */
function canvasWith(w: number, h: number, boxes: Array<[number, number, number, number]>): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (const [x0, y0, bw, bh] of boxes) {
    for (let y = y0; y < y0 + bh; y++) {
      for (let x = x0; x < x0 + bw; x++) {
        const i = (y * w + x) * 4;
        px[i] = 47; px[i + 1] = 37; px[i + 2] = 34; px[i + 3] = 255;
      }
    }
  }
  return px;
}

test('grid detection finds the drawn layout from magenta gutters', async () => {
  const { detectGrid, gridMatchesRequested, detectedCellRects } = await import('./gridLayout.ts');
  // Requested 3x2 of 24x24 cells starting at (0,0); figures 10x16 centered in each cell
  const requested = { originX: 0, originY: 0, cellW: 24, cellH: 24, cols: 3, rows: 2 };
  const boxes3x2: Array<[number, number, number, number]> = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) boxes3x2.push([c * 24 + 7, r * 24 + 4, 10, 16]);
  const good = detectGrid(canvasWith(72, 48, boxes3x2), 72, 48);
  assert.deepEqual([good.cols, good.rows], [3, 2]);
  assert.equal(gridMatchesRequested(good, requested), true);

  // A 1px gap inside a figure (between legs) is not a gutter
  const legs = detectGrid(canvasWith(24, 24, [[7, 4, 4, 16], [12, 4, 4, 16]]), 24, 24);
  assert.equal(legs.cols, 1);

  // Fewer figures than cells (unused last cell) still matches
  const five = detectGrid(canvasWith(72, 48, boxes3x2.slice(0, 5)), 72, 48);
  assert.equal(gridMatchesRequested(five, requested), true);

  // Model drew its own 4x3 grid on the same canvas: detected and reported as a mismatch
  const boxes4x3: Array<[number, number, number, number]> = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) boxes4x3.push([c * 18 + 4, r * 16 + 2, 10, 12]);
  const wrong = detectGrid(canvasWith(72, 48, boxes4x3), 72, 48);
  assert.deepEqual([wrong.cols, wrong.rows], [4, 3]);
  assert.equal(gridMatchesRequested(wrong, requested), false);

  // Same count but figures straddling the requested cell boundaries: mismatch
  const shifted = detectGrid(canvasWith(72, 48, boxes3x2.map(([x, y, w, h]) => [x + 12, y, w, h] as [number, number, number, number]).filter(([x]) => x + 10 <= 72)), 72, 48);
  assert.equal(gridMatchesRequested(shifted, requested), false);

  // Detected cells split halfway through each gutter, reading order
  const rects = detectedCellRects(wrong, 72, 48);
  assert.equal(rects.length, 12);
  assert.deepEqual(rects[0], { x: 0, y: 0, w: 18, h: 16 });
  assert.equal(rects[3].x + rects[3].w, 72);
  assert.equal(rects[11].y + rects[11].h, 48);
});

test('deleting a frame rebuilds a 4-frame strip and the manifest says 4', async () => {
  const { composeStripPixels, manifestEntry, itemFrameCount } = await import('./strip.ts');
  const fw = 24;
  const fh = 24;
  // 5 frames, each filled with its own red value so order can be checked
  const framePixels = [10, 20, 30, 40, 50].map((v) => {
    const px = new Uint8ClampedArray(fw * fh * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = v;
      px[i + 3] = 255;
    }
    return px;
  });
  const frameUrls = framePixels.map((_, i) => `frame${i}`);

  // Delete frame 3 (index 2), the same way the Animation Player does
  const keptPixels = framePixels.filter((_, i) => i !== 2);
  const keptUrls = frameUrls.filter((_, i) => i !== 2);

  const strip = composeStripPixels(keptPixels, fw, fh);
  assert.equal(strip.width, 4 * fw);
  assert.equal(strip.height, fh);
  const redAt = (frame: number) => strip.pixels[(5 * strip.width + frame * fw + 5) * 4];
  assert.deepEqual([0, 1, 2, 3].map(redAt), [10, 20, 40, 50]);

  // Manifest frame count comes from item.frames, even if the stored frameCount is stale
  const item: any = {
    id: 'item_x',
    name: 'fig_chop',
    type: 'animation',
    frames: keptUrls,
    cleanedImage: 'strip',
    metadata: { frameWidth: fw, frameHeight: fh, frameCount: 5, fps: 8, baselineY: 22 },
  };
  assert.equal(itemFrameCount(item), 4);
  assert.equal(manifestEntry(item).frames, 4);
  assert.equal(manifestEntry(item).file, 'images/fig_chop.png');

  // Transparent background where a frame is smaller than the cell
  const small = composeStripPixels([new Uint8ClampedArray(4 * 4 * 4).fill(255)], 4, 8);
  assert.equal(small.pixels[(7 * 4 + 0) * 4 + 3], 0);
});

// ---------------------------------------------------------------------------
// Auto Clean
// ---------------------------------------------------------------------------

/** Build a frame from rows of characters: '.' transparent, B body, O outline, T tool. */
function frameFromRows(rows: string[]) {
  const colors: Record<string, [number, number, number]> = {
    B: [0xff, 0xff, 0xff], // #ffffff body
    G: [0xbd, 0xbd, 0xbd], // #bdbdbd body
    O: [0x2b, 0x2b, 0x2b], // #2b2b2b outline
    T: [0x8b, 0x5a, 0x2b], // tool
  };
  const h = rows.length;
  const w = rows[0].length;
  const px = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const [r, g, b] = colors[ch];
      px.set([r, g, b, 255], (y * w + x) * 4);
    })
  );
  return { px, w, h };
}

function rowsFromFrame(px: Uint8ClampedArray, w: number, h: number): string[] {
  const names: Record<string, string> = { '255,255,255': 'B', '189,189,189': 'G', '43,43,43': 'O', '139,90,43': 'T' };
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row += px[i + 3] === 0 ? '.' : names[`${px[i]},${px[i + 1]},${px[i + 2]}`] || '?';
    }
    rows.push(row);
  }
  return rows;
}

async function characterRoleOf() {
  const { makeRoleLookup, resolvePaletteRoles } = await import('./autoClean.ts');
  const roles = resolvePaletteRoles({
    id: 'profile_characters',
    palette: ['#ffffff', '#bdbdbd', '#e3e3e3', '#2b2b2b', '#8b5a2b'],
    outlineColor: '#2b2b2b',
  });
  return { roles, roleOf: makeRoleLookup(roles) };
}

test('palette roles: Characters defaults and explicit per-swatch roles', async () => {
  const { resolvePaletteRoles } = await import('./autoClean.ts');
  const { roles } = await characterRoleOf();
  assert.deepEqual(roles, {
    '#ffffff': 'body',
    '#bdbdbd': 'body',
    '#e3e3e3': 'body',
    '#2b2b2b': 'outline',
    '#8b5a2b': 'tool',
  });
  // The shipped cream palette also gets body/outline roles
  const cream = resolvePaletteRoles({ id: 'profile_characters', palette: ['#faf3e8', '#2f2522'], outlineColor: '#2f2522' });
  assert.deepEqual(cream, { '#faf3e8': 'body', '#2f2522': 'outline' });
  // Explicit role wins; other profiles default to body
  const custom = resolvePaletteRoles({
    id: 'profile_x',
    palette: ['#ff0000', '#00ff00'],
    outlineColor: '#000000',
    paletteRoles: { '#00ff00': 'effect' },
  });
  assert.deepEqual(custom, { '#ff0000': 'body', '#00ff00': 'effect' });
});

test('removeOrphanOutline removes unsupported outline pixels until nothing changes', async () => {
  const { removeOrphanOutline } = await import('./autoClean.ts');
  const { roleOf } = await characterRoleOf();
  // Outline pixels with no body/tool neighbor: the pair at the top right and the corner pixel.
  const f = frameFromRows([
    '.....OO',
    '.OOO...',
    '.OBO...',
    '.OOO...',
    'O......',
  ]);
  const { pixels, removed } = removeOrphanOutline(f.px, f.w, f.h, roleOf);
  assert.deepEqual(rowsFromFrame(pixels, f.w, f.h), [
    '.......',
    '.OOO...',
    '.OBO...',
    '.OOO...',
    '.......',
  ]);
  assert.equal(removed, 3);

  // Only the outline pixel touching the body survives a stray outline line
  const chain = frameFromRows(['BOOOO']);
  const res = removeOrphanOutline(chain.px, chain.w, chain.h, roleOf);
  assert.deepEqual(rowsFromFrame(res.pixels, chain.w, chain.h), ['BO...']);

  // Input is not mutated
  assert.equal(rowsFromFrame(f.px, f.w, f.h)[0], '.....OO');
});

test('fillPinholes fills enclosed transparent pixels with the most common non-outline neighbor', async () => {
  const { fillPinholes } = await import('./autoClean.ts');
  const { roleOf } = await characterRoleOf();
  const f = frameFromRows([
    'OOOOO',
    'OBGBO',
    'OG.GO',
    'OBGBO',
    'OOOOO',
  ]);
  const { pixels, filled } = fillPinholes(f.px, f.w, f.h, roleOf);
  assert.equal(filled, 1);
  // B and G both appear 4 times; the color that reaches the top count first (G) wins, deterministically
  assert.equal(rowsFromFrame(pixels, f.w, f.h)[2], 'OGGGO');

  // Needs at least 6 filled neighbors
  const open = frameFromRows(['BBB', 'B..', 'B..']);
  assert.equal(fillPinholes(open.px, open.w, open.h, roleOf).filled, 0);

  // Needs a body neighbor: a hole surrounded only by outline + tool stays open
  const toolHole = frameFromRows(['OTO', 'T.T', 'OTO']);
  assert.equal(fillPinholes(toolHole.px, toolHole.w, toolHole.h, roleOf).filled, 0);
});

test('removeSpecks removes single pixels with no 4-neighbors', async () => {
  const { removeSpecks } = await import('./autoClean.ts');
  const f = frameFromRows([
    'B...T',
    '.....',
    '..B..',
    '.B.BB',
  ]);
  const { pixels, removed } = removeSpecks(f.px, f.w, f.h);
  // (0,0), (4,0), (2,2) and (1,3) are isolated; diagonal contact does not count; the BB pair stays
  assert.deepEqual(rowsFromFrame(pixels, f.w, f.h), ['.....', '.....', '.....', '...BB']);
  assert.equal(removed, 4);
});

test('autoCleanPixels is deterministic and reports what it changed', async () => {
  const { autoCleanPixels } = await import('./autoClean.ts');
  const { roleOf } = await characterRoleOf();
  const f = frameFromRows([
    'O......',
    '.OOOOO.',
    '.OBBBO.',
    '.OB.BO.',
    '.OBBBO.',
    '.OOOOO.',
    '......T',
  ]);
  const a = autoCleanPixels(f.px, f.w, f.h, roleOf);
  const b = autoCleanPixels(f.px, f.w, f.h, roleOf);
  assert.deepEqual(Array.from(a.pixels), Array.from(b.pixels));
  assert.deepEqual(a.stats, { orphanOutline: 1, specks: 1, pinholes: 1 });
  assert.deepEqual(rowsFromFrame(a.pixels, f.w, f.h), [
    '.......',
    '.OOOOO.',
    '.OBBBO.',
    '.OBBBO.',
    '.OBBBO.',
    '.OOOOO.',
    '.......',
  ]);
});

test('size check compares body height (tools ignored) to the anchor', async () => {
  const { bodyHeight, sizeCheck } = await import('./autoClean.ts');
  const { roleOf } = await characterRoleOf();
  const f = frameFromRows([
    'T..',
    'TB.',
    'TB.',
    'TG.',
    'T..',
  ]);
  assert.equal(bodyHeight(f.px, f.w, f.h, roleOf), 3); // tool rows don't count
  assert.deepEqual(sizeCheck([14, 15, 16, 12, 0], 14), [
    null,
    null,
    '2px taller than anchor',
    '2px shorter than anchor',
    'no body pixels found',
  ]);
  assert.deepEqual(sizeCheck([10, 20], 0), [null, null]);
});

test('touch-up file names round-trip', async () => {
  const { touchUpFileName, parseTouchUpFileName } = await import('./naming.ts');
  assert.equal(touchUpFileName('fig_spear', 40, 24, 5), 'fig_spear_40x24_5f.png');
  assert.deepEqual(parseTouchUpFileName('fig_spear_40x24_5f.png'), {
    name: 'fig_spear',
    frameWidth: 40,
    frameHeight: 24,
    frameCount: 5,
  });
  assert.equal(parseTouchUpFileName('fig_spear_40x24_5f (1).png')?.name, 'fig_spear');
  assert.equal(parseTouchUpFileName('bg_forest_320x64_1f.png')?.frameCount, 1);
  assert.equal(parseTouchUpFileName('walk_row.png'), null);
  assert.equal(parseTouchUpFileName('fig_x_0x24_5f.png'), null);
});
