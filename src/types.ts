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

export interface ImageModelOption {
  id: string;
  name: string;
  badge: string;
  description: string;
  isDefault?: boolean;
}

export const AVAILABLE_IMAGE_MODELS: ImageModelOption[] = [
  {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro Image',
    badge: 'Pro Quality (Default)',
    description: 'Highest visual fidelity, exact adherence to pixel art references and proportions',
    isDefault: true,
  },
  {
    id: 'gemini-nano-banana-2.1',
    name: 'Gemini Nano Banana 2.1',
    badge: 'High-Res / 2K',
    description: 'High-quality generation with expanded aspect ratio support and crisp edges',
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Gemini 3.1 Flash Lite Image',
    badge: 'Fast Lite',
    description: 'High throughput, fast draft generations and rapid iteration',
  },
];

export function getModelOption(modelId?: string): ImageModelOption {
  if (!modelId) return AVAILABLE_IMAGE_MODELS[0];
  const found = AVAILABLE_IMAGE_MODELS.find((m) => m.id === modelId);
  if (found) return found;
  return {
    id: modelId,
    name: modelId,
    badge: 'Custom',
    description: `Target model: ${modelId}`,
  };
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
