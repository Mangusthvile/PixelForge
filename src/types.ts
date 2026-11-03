export type AssetType = 'sprite' | 'animation' | 'prop' | 'background' | 'effect';

export type Facing = 'right' | 'left' | 'front' | 'back';

export type AnimationMode = 'template' | 'frame_by_frame';

export interface ProfileReference {
  id: string;
  url: string;
  base64?: string;
  label?: string;
  isAnchor?: boolean;
}

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  references: ProfileReference[];
  anchorId?: string;
  palette: string[]; // max 32 hex strings like #ffffff
  frameWidth: number;
  frameHeight: number;
  outlineColor: string; // e.g. #3d251e
  isBuiltIn?: boolean;
}

/** An image-capable model as reported by the server's /api/models (real Gemini model ids). */
export interface ImageModelOption {
  id: string;
  name: string;
  description?: string;
}

export function getModelOption(models: ImageModelOption[], modelId?: string | null): ImageModelOption | null {
  if (!modelId) return null;
  return models.find((m) => m.id === modelId) || { id: modelId, name: modelId };
}

export interface GenerationConfig {
  type: AssetType;
  description: string;
  facing: Facing;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  propItems: string;
  tilingSeamless: boolean;
  splitParallax: boolean;
  effectItems: string;
  framesPerEffect: number;
  extraReferences: ProfileReference[];
  // Animation-specific enhancements
  animationMode: AnimationMode; // 'template' (default) or 'frame_by_frame'
  selectedModel: string;
  poseNotes: string[];
  // Set when a preset is applied; the asset is named after the preset while the description is unchanged.
  presetAssetName?: string;
  presetDescription?: string;
}

export interface CleanupSettings {
  keyMagenta: boolean;
  magentaTolerance: number; // 0 to 100
  pixelSnap: boolean;
  detectedScale: number;
  scaleOverride: number; // 0 = auto, 1, 2, 3, 4, 6, 8, 16
  paletteLock: boolean;
  removeStrayPixels: boolean;
  sliceFrames: boolean;
  frameCountOverride: number; // 0 = follow config
  baselineY: number; // -1 = auto
  gridCols?: number;
  gridRows?: number;
}

export interface ParallaxLayer {
  name: string;
  image: string; // data URL
  speed: number;
}

export interface LibraryItem {
  id: string;
  name: string;
  type: AssetType;
  profileId: string;
  profileName: string;
  prompt: string;
  referencesUsed: string[];
  createdAt: string;
  rawImage: string; // data URL
  cleanedImage: string; // data URL
  frames: string[]; // data URLs
  metadata: {
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    fps: number;
    baselineY: number;
    facing?: Facing;
    tiling?: boolean;
    parallaxLayers?: ParallaxLayer[];
    modelUsed?: string;
    animationMode?: AnimationMode;
    poseNotes?: string[];
  };
}

export interface PresetItem {
  id: string;
  name: string;
  type: AssetType;
  profileType: 'characters' | 'backgrounds' | 'any';
  description: string;
  frameCount?: number;
  facing?: Facing;
  propItems?: string;
  frameWidth?: number;
  frameHeight?: number;
  tilingSeamless?: boolean;
  splitParallax?: boolean;
}
