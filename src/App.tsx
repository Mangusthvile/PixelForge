import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleProfile,
  GenerationConfig,
  CleanupSettings,
  LibraryItem,
  ParallaxLayer,
  AVAILABLE_IMAGE_MODELS,
  AnimationMode,
} from './types';
import {
  getStoredProfiles,
  saveProfile,
  saveAllProfiles,
  deleteProfileFromDB,
  getStoredLibrary,
  saveLibraryItem,
  deleteLibraryItem,
  INITIAL_CHARACTERS_PROFILE,
  INITIAL_BACKGROUNDS_PROFILE,
} from './utils/storage';
import { runCleanupPipeline } from './utils/canvasPipeline';
import { buildGenerationPrompt } from './utils/promptBuilder';
import {
  buildGridTemplateImage,
  getGridDimensions,
  generatePoseNotes,
  detectCopyOfFrames,
} from './utils/gridLayout';
import { Header } from './components/Header';
import { ProfilePanel } from './components/ProfilePanel';
import { AssetConfigPanel } from './components/AssetConfigPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { AnimationPreview } from './components/AnimationPreview';
import { BackgroundPreview } from './components/BackgroundPreview';
import { PixelEditorModal } from './components/PixelEditorModal';
import { LibraryDrawer } from './components/LibraryDrawer';
import { exportMultipleAssetsZip, downloadBlob } from './utils/export';
import { AlertCircle, RefreshCw, Sparkles, Check, Palette } from 'lucide-react';

export default function App() {
  // Profiles State
  const [profiles, setProfiles] = useState<StyleProfile[]>([
    INITIAL_CHARACTERS_PROFILE,
    INITIAL_BACKGROUNDS_PROFILE,
  ]);
  const [activeProfile, setActiveProfile] = useState<StyleProfile>(INITIAL_CHARACTERS_PROFILE);

  // Asset Generation Config
  const [config, setConfig] = useState<GenerationConfig>(() => {
    const savedModel =
      typeof window !== 'undefined'
        ? localStorage.getItem('pixelforge_selected_model') || 'gemini-3-pro-image'
        : 'gemini-3-pro-image';

    const defaultAction = 'walk cycle continuous 6 frames swinging arms and stepping legs';

    return {
      type: 'animation',
      description: defaultAction,
      facing: 'right',
      frameWidth: 24,
      frameHeight: 24,
      frameCount: 6,
      propItems: 'Iron pickaxe\nWooden cart\nLantern\nGold ore chunk',
      tilingSeamless: true,
      splitParallax: true,
      effectItems: 'fire spark burst 4 frames',
      framesPerEffect: 4,
      extraReferences: [],
      animationMode: 'template', // Default to Template Fill Mode
      selectedModel: savedModel,
      poseNotes: generatePoseNotes(defaultAction, 6),
    };
  });

  // Cleanup Settings
  const [settings, setSettings] = useState<CleanupSettings>({
    keyMagenta: true,
    magentaTolerance: 35,
    pixelSnap: true,
    detectedScale: 1,
    scaleOverride: 0, // auto
    paletteLock: true,
    removeStrayPixels: true,
    sliceFrames: true,
    frameCountOverride: 0,
    baselineY: -1,
  });

  // Generation & Pipeline Result State
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [cleanedImage, setCleanedImage] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [detectedScale, setDetectedScale] = useState<number>(1);
  const [frameWarning, setFrameWarning] = useState<string | undefined>();
  const [copyWarning, setCopyWarning] = useState<string | undefined>();
  const [baselineY, setBaselineY] = useState<number>(-1);
  const [parallaxLayers, setParallaxLayers] = useState<ParallaxLayer[] | undefined>();
  const [currentAssetName, setCurrentAssetName] = useState<string>('fig_walk');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgressText, setGenerationProgressText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [lastUsedModel, setLastUsedModel] = useState<string | null>(null);

  // UI View State
  const [activeTab, setActiveTab] = useState<'compare' | 'preview' | 'editor'>('compare');
  const [sidebarTab, setSidebarTab] = useState<'profile' | 'generator'>('generator');
  const [fps, setFps] = useState<number>(8);
  const [pixelEditorOpen, setPixelEditorOpen] = useState(false);
  const [editingFrameIndex, setEditingFrameIndex] = useState<number | undefined>(undefined);

  // Library State
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [isSavedToLibrary, setIsSavedToLibrary] = useState(false);

  // Helper: Convert URL to base64
  const urlToBase64 = async (url: string): Promise<string> => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return '';
    }
  };

  // Load Initial Storage & Seed
  useEffect(() => {
    async function init() {
      const storedProfiles = await getStoredProfiles();
      if (storedProfiles && storedProfiles.length > 0) {
        setProfiles(storedProfiles);
        setActiveProfile(storedProfiles[0]);
      }

      const storedLib = await getStoredLibrary();

      // If library is empty, seed 2 starter assets
      if (!storedLib || storedLib.length === 0) {
        const sampleBgUrl = '/assets/aistudio/image_e2a4566b.png';
        const sampleCharUrl = '/assets/anchor_figure_right_facing.png';

        const starterItems: LibraryItem[] = [
          {
            id: 'item_seed_idle',
            name: 'fig_idle',
            type: 'animation',
            profileId: INITIAL_CHARACTERS_PROFILE.id,
            profileName: INITIAL_CHARACTERS_PROFILE.name,
            prompt: 'chibi character idle stance in 24x24 cell on magenta',
            referencesUsed: ['Right-Facing Figure Anchor (8x on Magenta)'],
            createdAt: new Date().toISOString(),
            rawImage: sampleCharUrl,
            cleanedImage: sampleCharUrl,
            frames: [sampleCharUrl],
            metadata: {
              frameWidth: 24,
              frameHeight: 24,
              frameCount: 1,
              fps: 8,
              baselineY: 23,
              facing: 'right',
            },
          },
          {
            id: 'item_seed_bg',
            name: 'bg_pine_hills',
            type: 'background',
            profileId: INITIAL_BACKGROUNDS_PROFILE.id,
            profileName: INITIAL_BACKGROUNDS_PROFILE.name,
            prompt: 'rolling pine hills with layered atmospheric perspective',
            referencesUsed: ['Rolling Pine Hills (Anchor)'],
            createdAt: new Date().toISOString(),
            rawImage: sampleBgUrl,
            cleanedImage: sampleBgUrl,
            frames: [sampleBgUrl],
            metadata: {
              frameWidth: 320,
              frameHeight: 64,
              frameCount: 1,
              fps: 0,
              baselineY: 0,
              tiling: true,
            },
          },
        ];
        setLibrary(starterItems);
        starterItems.forEach((it) => saveLibraryItem(it));
      } else {
        setLibrary(storedLib);
      }

      // Pre-seed sample character into preview on first visit
      const sampleUrl = '/assets/anchor_figure_right_facing.png';
      setRawImage(sampleUrl);
      try {
        const result = await runCleanupPipeline(
          sampleUrl,
          {
            type: 'animation',
            description: 'idle stance',
            facing: 'right',
            frameWidth: 24,
            frameHeight: 24,
            frameCount: 1,
            propItems: '',
            tilingSeamless: true,
            splitParallax: false,
            effectItems: '',
            framesPerEffect: 4,
            extraReferences: [],
            animationMode: 'template',
            selectedModel: 'gemini-3-pro-image',
            poseNotes: ['neutral idle stance'],
          },
          INITIAL_CHARACTERS_PROFILE,
          {
            keyMagenta: true,
            magentaTolerance: 35,
            pixelSnap: true,
            detectedScale: 1,
            scaleOverride: 0,
            paletteLock: true,
            removeStrayPixels: true,
            sliceFrames: true,
            frameCountOverride: 1,
            baselineY: -1,
          }
        );
        setCleanedImage(result.cleanedDataUrl);
        setFrames(result.frames);
        setDetectedScale(result.detectedScale);
        setCurrentAssetName('fig_idle');
      } catch (e) {
        console.error('Failed to run initial cleanup pipeline:', e);
      }
    }
    init();
  }, []);

  // Update Config when Profile changes
  const handleSelectProfile = async (p: StyleProfile) => {
    setActiveProfile(p);
    if (p.name.toLowerCase().includes('background')) {
      const bgUrl = '/assets/aistudio/image_e2a4566b.png';
      setConfig((prev) => ({
        ...prev,
        type: 'background',
        description: 'dense alpine evergreen pines, misty blue distant peaks',
        frameWidth: p.frameWidth || 320,
        frameHeight: p.frameHeight || 64,
        tilingSeamless: true,
        splitParallax: true,
      }));
      setRawImage(bgUrl);
      setCurrentAssetName('bg_pine_hills');
      try {
        const res = await runCleanupPipeline(
          bgUrl,
          {
            type: 'background',
            description: 'dense alpine evergreen pines',
            facing: 'right',
            frameWidth: 320,
            frameHeight: 64,
            frameCount: 1,
            propItems: '',
            tilingSeamless: true,
            splitParallax: true,
            effectItems: '',
            framesPerEffect: 4,
            extraReferences: [],
            animationMode: 'template',
            selectedModel: config.selectedModel,
            poseNotes: [],
          },
          p,
          settings
        );
        setCleanedImage(res.cleanedDataUrl);
        setFrames(res.frames);
        setParallaxLayers(res.parallaxLayers);
        setActiveTab('preview');
      } catch (e) {
        // ignore
      }
    } else {
      const charUrl = '/assets/anchor_figure_right_facing.png';
      const actionDesc = 'walk cycle continuous 6 frames swinging arms and stepping legs';
      setConfig((prev) => ({
        ...prev,
        type: 'animation',
        description: actionDesc,
        frameWidth: p.frameWidth || 24,
        frameHeight: p.frameHeight || 24,
        frameCount: 6,
        poseNotes: generatePoseNotes(actionDesc, 6),
      }));
      setRawImage(charUrl);
      setCurrentAssetName('fig_walk');
    }
  };

  // Profile management
  const handleUpdateProfile = (updated: StyleProfile) => {
    setActiveProfile(updated);
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    saveProfile(updated);
  };

  const handleCreateProfile = () => {
    const newProf: StyleProfile = {
      id: `profile_${Date.now()}`,
      name: `Custom Style ${profiles.length + 1}`,
      description: 'clean 16-bit retro pixel art with defined outlines and vibrant color contrast.',
      frameWidth: 16,
      frameHeight: 24,
      outlineColor: '#2b2d42',
      palette: ['#ffffff', '#edf2f4', '#8d99ae', '#2b2d42', '#d90429', '#ef233c'],
      references: [],
    };
    const updated = [...profiles, newProf];
    setProfiles(updated);
    setActiveProfile(newProf);
    saveAllProfiles(updated);
  };

  const handleDuplicateProfile = (source: StyleProfile) => {
    const copy: StyleProfile = {
      ...source,
      id: `profile_${Date.now()}`,
      name: `${source.name} Copy`,
      isBuiltIn: false,
      references: source.references.map((r) => ({ ...r, id: `ref_${Date.now()}_${Math.random()}` })),
    };
    const updated = [...profiles, copy];
    setProfiles(updated);
    setActiveProfile(copy);
    saveAllProfiles(updated);
  };

  const handleDeleteProfile = (id: string) => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter((p) => p.id !== id);
    setProfiles(remaining);
    setActiveProfile(remaining[0]);
    deleteProfileFromDB(id);
  };

  const handleResetProfiles = () => {
    if (confirm('Reset to built-in Characters and Backgrounds profiles?')) {
      const defaults = [INITIAL_CHARACTERS_PROFILE, INITIAL_BACKGROUNDS_PROFILE];
      setProfiles(defaults);
      setActiveProfile(defaults[0]);
      saveAllProfiles(defaults);
    }
  };

  // Re-run cleanup pipeline whenever settings or profile change
  const rerunPipeline = useCallback(
    async (sourceSrc: string, customSettings?: CleanupSettings) => {
      try {
        const useSettings = customSettings || settings;
        const result = await runCleanupPipeline(sourceSrc, config, activeProfile, useSettings);

        setCleanedImage(result.cleanedDataUrl);
        setFrames(result.frames);
        setDetectedScale(result.detectedScale);
        setFrameWarning(result.frameWarning);
        setCopyWarning(result.copyWarning);
        setBaselineY(result.baselineY);
        setParallaxLayers(result.parallaxLayers);
        return result;
      } catch (err) {
        console.error('Error in cleanup pipeline:', err);
      }
    },
    [config, activeProfile, settings]
  );

  const handleSettingsChange = (newSettings: CleanupSettings) => {
    setSettings(newSettings);
    if (rawImage) {
      rerunPipeline(rawImage, newSettings);
    }
  };

  // MAIN GENERATION FLOW
  const handleGenerate = async (overrideConfig?: Partial<GenerationConfig>) => {
    const currentConfig = { ...config, ...(overrideConfig || {}) };
    setIsGenerating(true);
    setError(null);
    setCopyWarning(undefined);
    setIsSavedToLibrary(false);
    setGenerationProgressText('Preparing style references & prompt...');

    try {
      // Auto-correct profile if character asset was set to generate with Backgrounds profile
      let targetProfile = activeProfile;
      if (
        (currentConfig.type === 'animation' || currentConfig.type === 'sprite' || currentConfig.type === 'prop') &&
        targetProfile.id.includes('background')
      ) {
        const charProf =
          profiles.find(
            (p) => p.id === 'profile_characters' || p.name.toLowerCase().includes('character')
          ) || profiles[0];
        targetProfile = charProf;
        setActiveProfile(charProf);
      } else if (currentConfig.type === 'background' && targetProfile.id.includes('character')) {
        const bgProf = profiles.find(
          (p) => p.id === 'profile_backgrounds' || p.name.toLowerCase().includes('background')
        );
        if (bgProf) {
          targetProfile = bgProf;
          setActiveProfile(bgProf);
        }
      }

      // 1. Ensure all reference images have base64 data
      const enrichedProfile = { ...targetProfile };
      const enrichedRefs = await Promise.all(
        targetProfile.references.map(async (ref) => {
          if (!ref.base64 && ref.url) {
            const b64 = await urlToBase64(ref.url);
            return { ...ref, base64: b64 };
          }
          return ref;
        })
      );
      enrichedProfile.references = enrichedRefs;

      // Find Anchor
      let anchor = enrichedRefs.find((r) => r.isAnchor || r.id === targetProfile.anchorId);
      if (!anchor && enrichedRefs.length > 0) {
        anchor = enrichedRefs[0];
      }

      // If no anchor base64, load default right-facing anchor
      let anchorBase64 = anchor?.base64 || '';
      if (!anchorBase64) {
        anchorBase64 = await urlToBase64('/assets/anchor_figure_right_facing.png');
      }

      // MODE A: FRAME BY FRAME GENERATION
      if (currentConfig.type === 'animation' && currentConfig.animationMode === 'frame_by_frame') {
        const totalFrames = currentConfig.frameCount || 6;
        const accumulatedFrames: string[] = [];
        let lastFrameBase64 = '';

        for (let f = 0; f < totalFrames; f++) {
          setGenerationProgressText(`Generating frame ${f + 1} of ${totalFrames}...`);

          const frameRefs: Array<{ data: string; mimeType: string }> = [];

          // Anchor reference first
          if (anchorBase64) {
            frameRefs.push({ data: anchorBase64, mimeType: 'image/png' });
          }

          // Previous finished frame reference (for f > 0)
          if (lastFrameBase64) {
            frameRefs.push({ data: lastFrameBase64, mimeType: 'image/png' });
          }

          // Build prompt for frame f
          const builtPrompt = buildGenerationPrompt(currentConfig, enrichedProfile, f);

          const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: builtPrompt.promptText,
              references: frameRefs,
              aspectRatio: '1:1',
              type: 'sprite',
              model: currentConfig.selectedModel || 'gemini-3-pro-image',
            }),
          });

          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.error || `Failed to generate frame ${f + 1}.`);
          }

          if (data.modelUsed) {
            setLastUsedModel(data.modelUsed);
          }

          // Run single-frame cleanup
          const singleRes = await runCleanupPipeline(
            data.image,
            { ...currentConfig, type: 'sprite', frameCount: 1 },
            targetProfile,
            settings
          );

          accumulatedFrames.push(singleRes.cleanedDataUrl);
          lastFrameBase64 = singleRes.cleanedDataUrl;
        }

        // Reassemble all frames into one horizontal row
        const rowCanvas = document.createElement('canvas');
        rowCanvas.width = currentConfig.frameWidth * totalFrames;
        rowCanvas.height = currentConfig.frameHeight;
        const rowCtx = rowCanvas.getContext('2d')!;
        rowCtx.imageSmoothingEnabled = false;

        for (let f = 0; f < totalFrames; f++) {
          const imgElem = new Image();
          await new Promise<void>((res) => {
            imgElem.onload = () => res();
            imgElem.src = accumulatedFrames[f];
          });
          rowCtx.drawImage(imgElem, f * currentConfig.frameWidth, 0);
        }

        const assembledUrl = rowCanvas.toDataURL('image/png');
        setRawImage(assembledUrl);
        setCleanedImage(assembledUrl);
        setFrames(accumulatedFrames);
        setCurrentAssetName(`fig_${sanitizeName(currentConfig.description)}`);

        // Save to library
        const newItem: LibraryItem = {
          id: `item_${Date.now()}`,
          name: `fig_${sanitizeName(currentConfig.description)}`,
          type: currentConfig.type,
          profileId: targetProfile.id,
          profileName: targetProfile.name,
          prompt: `Frame-by-frame animation: ${currentConfig.description}`,
          referencesUsed: enrichedRefs.map((r) => r.label || r.id),
          createdAt: new Date().toISOString(),
          rawImage: assembledUrl,
          cleanedImage: assembledUrl,
          frames: accumulatedFrames,
          metadata: {
            frameWidth: currentConfig.frameWidth,
            frameHeight: currentConfig.frameHeight,
            frameCount: totalFrames,
            fps: 8,
            baselineY: currentConfig.frameHeight - 2,
            facing: currentConfig.facing,
            modelUsed: currentConfig.selectedModel,
            animationMode: 'frame_by_frame',
            poseNotes: currentConfig.poseNotes,
          },
        };
        await saveLibraryItem(newItem);
        setLibrary((prev) => [newItem, ...prev]);
        setIsSavedToLibrary(true);
        setActiveTab('preview');
        return;
      }

      // MODE B: TEMPLATE FILL (GRID) OR STANDARD GENERATION
      let templateImageBase64: string | undefined;

      if (currentConfig.type === 'animation' && currentConfig.animationMode === 'template') {
        setGenerationProgressText('Building 8x grid template with Anchor in Cell 1...');
        const gridDims = getGridDimensions(currentConfig.frameCount);
        templateImageBase64 = await buildGridTemplateImage(
          anchorBase64,
          gridDims.cols,
          gridDims.rows,
          currentConfig.frameWidth,
          currentConfig.frameHeight,
          settings.baselineY >= 0 ? settings.baselineY : undefined
        );
      }

      setGenerationProgressText(`Sending request to ${currentConfig.selectedModel || 'gemini-3-pro-image'}...`);

      // 2. Build Prompt
      const builtPrompt = buildGenerationPrompt(currentConfig, enrichedProfile);
      setCurrentAssetName(builtPrompt.assetName);

      // 3. Call Server API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: builtPrompt.promptText,
          references: builtPrompt.referenceImages,
          aspectRatio: builtPrompt.aspectRatio,
          type: currentConfig.type,
          model: currentConfig.selectedModel || 'gemini-3-pro-image',
          templateImage: templateImageBase64,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate image via Gemini API.');
      }

      if (data.modelUsed) {
        setLastUsedModel(data.modelUsed);
      }

      const generatedDataUrl = data.image;
      setRawImage(generatedDataUrl);

      setGenerationProgressText('Cleaning pixel art, slicing grid cells & aligning baseline...');

      // 4. Run Cleanup Pipeline with reading order grid slicing
      const pipelineRes = await rerunPipeline(generatedDataUrl, {
        ...settings,
        gridCols: builtPrompt.gridCols,
        gridRows: builtPrompt.gridRows,
      });

      // 5. Automatically save to Library
      if (pipelineRes) {
        if (pipelineRes.hasCopiedAnchor) {
          setCopyWarning(pipelineRes.copyWarning);
        }

        const newItem: LibraryItem = {
          id: `item_${Date.now()}`,
          name: builtPrompt.assetName,
          type: currentConfig.type,
          profileId: targetProfile.id,
          profileName: targetProfile.name,
          prompt: builtPrompt.promptText,
          referencesUsed: enrichedRefs.map((r) => r.label || r.id),
          createdAt: new Date().toISOString(),
          rawImage: generatedDataUrl,
          cleanedImage: pipelineRes.cleanedDataUrl,
          frames: pipelineRes.frames,
          metadata: {
            frameWidth: currentConfig.frameWidth,
            frameHeight: currentConfig.frameHeight,
            frameCount: pipelineRes.frames.length,
            fps: 8,
            baselineY: pipelineRes.baselineY,
            facing: currentConfig.facing,
            tiling: currentConfig.tilingSeamless,
            parallaxLayers: pipelineRes.parallaxLayers,
            modelUsed: currentConfig.selectedModel,
            animationMode: currentConfig.animationMode,
            poseNotes: currentConfig.poseNotes,
          },
        };
        await saveLibraryItem(newItem);
        setLibrary((prev) => [newItem, ...prev]);
        setIsSavedToLibrary(true);
      }
    } catch (err: any) {
      console.error('Generation failure:', err);
      setError(err?.message || 'Generation failed. Please retry.');
    } finally {
      setIsGenerating(false);
      setGenerationProgressText('');
    }
  };

  // Switch to Frame by Frame handler (from copy warning banner)
  const handleSwitchToFrameByFrame = () => {
    const updated = { ...config, animationMode: 'frame_by_frame' as AnimationMode };
    setConfig(updated);
    setCopyWarning(undefined);
    handleGenerate(updated);
  };

  // Select Stronger Model handler (from copy warning banner)
  const handleSelectStrongerModel = () => {
    const updated = { ...config, selectedModel: 'gemini-3-pro-image' };
    setConfig(updated);
    try {
      localStorage.setItem('pixelforge_selected_model', 'gemini-3-pro-image');
    } catch (e) {
      // ignore
    }
    setCopyWarning(undefined);
    handleGenerate(updated);
  };

  // Fallback demo generation using preloaded style reference
  const handleTrySampleGeneration = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const sampleUrl =
        config.type === 'background'
          ? '/assets/aistudio/image_e2a4566b.png'
          : '/assets/anchor_figure_right_facing.png';

      const b64 = await urlToBase64(sampleUrl);
      setRawImage(b64);
      const res = await rerunPipeline(b64);

      if (res) {
        const name = config.type === 'background' ? 'bg_pine_hills' : 'fig_idle';
        setCurrentAssetName(name);
        const newItem: LibraryItem = {
          id: `item_${Date.now()}`,
          name,
          type: config.type,
          profileId: activeProfile.id,
          profileName: activeProfile.name,
          prompt: 'Sample reference pipeline demonstration',
          referencesUsed: ['Base Anchor'],
          createdAt: new Date().toISOString(),
          rawImage: b64,
          cleanedImage: res.cleanedDataUrl,
          frames: res.frames,
          metadata: {
            frameWidth: config.frameWidth,
            frameHeight: config.frameHeight,
            frameCount: res.frames.length,
            fps: 8,
            baselineY: res.baselineY,
            facing: config.facing,
            tiling: config.tilingSeamless,
            parallaxLayers: res.parallaxLayers,
          },
        };
        await saveLibraryItem(newItem);
        setLibrary((prev) => [newItem, ...prev]);
        setIsSavedToLibrary(true);
      }
    } catch (e: any) {
      setError('Sample generation failed: ' + e?.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Approve current cleaned image as a reference
  const handleApproveAsReference = () => {
    if (!cleanedImage) return;
    const newRef = {
      id: `ref_${Date.now()}`,
      label: currentAssetName || 'Approved Asset',
      url: cleanedImage,
      base64: cleanedImage,
      isAnchor: false,
    };
    const updated = {
      ...activeProfile,
      references: [...activeProfile.references, newRef],
    };
    handleUpdateProfile(updated);
  };

  // Mark as Anchor
  const handleSetAsAnchor = () => {
    if (!cleanedImage) return;
    const anchorId = `ref_${Date.now()}`;
    const newAnchor = {
      id: anchorId,
      label: `${currentAssetName || 'Character'} (Anchor)`,
      url: cleanedImage,
      base64: cleanedImage,
      isAnchor: true,
    };
    const updatedRefs = activeProfile.references.map((r) => ({ ...r, isAnchor: false }));
    const updated = {
      ...activeProfile,
      references: [newAnchor, ...updatedRefs],
      anchorId,
    };
    handleUpdateProfile(updated);
  };

  // Save / update frame from Pixel Editor
  const handleSavePixelEdit = (editedDataUrl: string, frameIndex?: number) => {
    if (frameIndex !== undefined && frames[frameIndex]) {
      const newFrames = [...frames];
      newFrames[frameIndex] = editedDataUrl;
      setFrames(newFrames);

      // Composite back to cleanedImage canvas
      const compCanvas = document.createElement('canvas');
      compCanvas.width = config.frameWidth * newFrames.length;
      compCanvas.height = config.frameHeight;
      const ctx = compCanvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;

      const imgsLoaded = newFrames.map((fSrc, idx) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, idx * config.frameWidth, 0);
            resolve();
          };
          img.src = fSrc;
        });
      });

      Promise.all(imgsLoaded).then(() => {
        const fullSheet = compCanvas.toDataURL('image/png');
        setCleanedImage(fullSheet);
      });
    } else {
      setCleanedImage(editedDataUrl);
      setFrames([editedDataUrl]);
    }

    setPixelEditorOpen(false);
  };

  // Single Frame Redo / Regeneration using neighbors
  const handleRegenerateFrame = async (frameIndex: number) => {
    if (!frames[frameIndex]) return;
    setIsGenerating(true);
    setGenerationProgressText(`Regenerating frame #${frameIndex + 1} with neighbors...`);

    try {
      const leftNeighbor = frameIndex > 0 ? frames[frameIndex - 1] : null;
      const rightNeighbor = frameIndex < frames.length - 1 ? frames[frameIndex + 1] : null;

      const neighborRefs: Array<{ data: string; mimeType: string }> = [];

      // 1. Profile Anchor
      const anchor = activeProfile.references.find((r) => r.isAnchor || r.id === activeProfile.anchorId);
      if (anchor) {
        const anchorB64 = anchor.base64 || (anchor.url ? await urlToBase64(anchor.url) : '');
        if (anchorB64) {
          neighborRefs.push({ data: anchorB64, mimeType: 'image/png' });
        }
      }

      // 2. Left neighbor
      if (leftNeighbor) {
        const b64 = leftNeighbor.startsWith('data:') ? leftNeighbor : await urlToBase64(leftNeighbor);
        if (b64) neighborRefs.push({ data: b64, mimeType: 'image/png' });
      }

      // 3. Right neighbor
      if (rightNeighbor) {
        const b64 = rightNeighbor.startsWith('data:') ? rightNeighbor : await urlToBase64(rightNeighbor);
        if (b64) neighborRefs.push({ data: b64, mimeType: 'image/png' });
      }

      // Frame specific pose note
      const poseNote =
        config.poseNotes && config.poseNotes[frameIndex]
          ? config.poseNotes[frameIndex]
          : `frame ${frameIndex + 1} of ${frames.length}: intermediate movement step`;

      // Build prompt for in-between interpolation frame
      const prompt = `Pixel art character animation single frame #${frameIndex + 1} of ${frames.length}.
Action: ${config.description}.
Target pose: ${poseNote}.
Facing: ${config.facing}.
Keeping exact proportions, size, 1-pixel dark brown outline (${activeProfile.outlineColor}), and exact color palette of neighboring frames.
CRITICAL BACKGROUND REQUIREMENT: Solid flat #FF00FF magenta background ONLY. Absolutely NO shadows, no text.`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          references: neighborRefs,
          aspectRatio: '1:1',
          type: 'sprite',
          model: config.selectedModel || 'gemini-3-pro-image',
        }),
      });

      const data = await response.json();
      if (data.success && data.image) {
        if (data.modelUsed) {
          setLastUsedModel(data.modelUsed);
        }
        const singleResult = await runCleanupPipeline(
          data.image,
          { ...config, type: 'sprite', frameCount: 1 },
          activeProfile,
          settings
        );
        const updatedFrames = [...frames];
        updatedFrames[frameIndex] = singleResult.cleanedDataUrl;
        setFrames(updatedFrames);

        // Reassemble full horizontal strip
        const rowCanvas = document.createElement('canvas');
        rowCanvas.width = config.frameWidth * updatedFrames.length;
        rowCanvas.height = config.frameHeight;
        const rowCtx = rowCanvas.getContext('2d')!;
        rowCtx.imageSmoothingEnabled = false;

        for (let i = 0; i < updatedFrames.length; i++) {
          const imgElem = new Image();
          await new Promise<void>((res) => {
            imgElem.onload = () => res();
            imgElem.src = updatedFrames[i];
          });
          rowCtx.drawImage(imgElem, i * config.frameWidth, 0);
        }
        setCleanedImage(rowCanvas.toDataURL('image/png'));
      }
    } catch (e: any) {
      console.error('Frame regeneration failed:', e);
      setError('Frame redo failed: ' + e?.message);
    } finally {
      setIsGenerating(false);
      setGenerationProgressText('');
    }
  };

  // Library Item interactions
  const handleSelectAndOpenItem = (item: LibraryItem) => {
    setRawImage(item.rawImage || item.cleanedImage);
    setCleanedImage(item.cleanedImage);
    setFrames(item.frames || [item.cleanedImage]);
    setCurrentAssetName(item.name);
    setConfig((prev) => ({
      ...prev,
      type: item.type,
      frameWidth: item.metadata.frameWidth,
      frameHeight: item.metadata.frameHeight,
      frameCount: item.metadata.frameCount,
      facing: item.metadata.facing || prev.facing,
      tilingSeamless: item.metadata.tiling ?? prev.tilingSeamless,
      selectedModel: item.metadata.modelUsed || prev.selectedModel,
      animationMode: item.metadata.animationMode || prev.animationMode,
      poseNotes: item.metadata.poseNotes || prev.poseNotes,
    }));
    if (item.metadata?.modelUsed) {
      setLastUsedModel(item.metadata.modelUsed);
    }
    setActiveTab(item.type === 'animation' ? 'preview' : 'compare');
  };

  const handleGenerateAgainWithChanges = (item: LibraryItem) => {
    handleSelectAndOpenItem(item);
    const foundProfile = profiles.find((p) => p.id === item.profileId);
    if (foundProfile) setActiveProfile(foundProfile);
  };

  const handleDeleteLibraryItem = async (id: string) => {
    await deleteLibraryItem(id);
    setLibrary((prev) => prev.filter((i) => i.id !== id));
  };

  const handleRenameLibraryItem = async (id: string, newName: string) => {
    const updated = library.map((i) => (i.id === id ? { ...i, name: newName } : i));
    setLibrary(updated);
    const item = updated.find((i) => i.id === id);
    if (item) await saveLibraryItem(item);
  };

  const handleExportAll = async () => {
    if (library.length === 0) return;
    try {
      const blob = await exportMultipleAssetsZip(library);
      downloadBlob(blob, 'pixelforge_complete_library_manifest.zip');
    } catch (err) {
      console.error('Failed to export all library assets:', err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* App Header */}
      <Header
        onExportAll={handleExportAll}
        libraryCount={library.length}
        onResetProfiles={handleResetProfiles}
        selectedModelId={config.selectedModel}
        lastUsedModelId={lastUsedModel}
      />

      {/* Main 3-Column Studio Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar: Style Profiles & Asset Configuration */}
        <div className="w-full lg:w-[380px] xl:w-[420px] p-3 overflow-y-auto border-r border-zinc-800/80 bg-zinc-950/60 shrink-0 flex flex-col gap-2.5">
          {/* Sidebar Tab Switcher */}
          <div className="flex items-center bg-zinc-900 p-1 rounded-lg border border-zinc-800 shrink-0 select-none">
            <button
              onClick={() => setSidebarTab('generator')}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold tracking-wide transition flex items-center justify-center gap-1.5 ${
                sidebarTab === 'generator'
                  ? 'bg-amber-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Asset Generator</span>
            </button>
            <button
              onClick={() => setSidebarTab('profile')}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-semibold tracking-wide transition flex items-center justify-center gap-1.5 ${
                sidebarTab === 'profile'
                  ? 'bg-amber-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Style Profile</span>
            </button>
          </div>

          {/* Active Sidebar Tab Content */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {sidebarTab === 'profile' ? (
              <ProfilePanel
                profiles={profiles}
                activeProfile={activeProfile}
                onSelectProfile={handleSelectProfile}
                onUpdateProfile={handleUpdateProfile}
                onCreateProfile={handleCreateProfile}
                onDuplicateProfile={handleDuplicateProfile}
                onDeleteProfile={handleDeleteProfile}
              />
            ) : (
              <AssetConfigPanel
                config={config}
                onChangeConfig={setConfig}
                onGenerate={() => handleGenerate()}
                isGenerating={isGenerating}
                activeProfile={activeProfile}
                profiles={profiles}
                onSelectProfile={handleSelectProfile}
              />
            )}
          </div>
        </div>

        {/* Center Main Stage */}
        <div className="flex-1 flex flex-col p-3 overflow-hidden bg-zinc-950">
          {/* Error Banner */}
          {error && (
            <div className="mb-3 p-3 bg-red-950/50 border border-red-500/50 rounded-lg flex items-start justify-between gap-3 text-xs text-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">Generation Notice</span>
                  <span>{error}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleTrySampleGeneration}
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 font-medium"
                  title="Run pipeline with preloaded profile assets"
                >
                  Try Sample Asset
                </button>
                <button
                  onClick={() => handleGenerate()}
                  className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded border border-red-500/40 font-medium"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Progress Banner */}
          {isGenerating && generationProgressText && (
            <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2.5 text-xs text-amber-300 animate-pulse">
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>{generationProgressText}</span>
            </div>
          )}

          {/* Conditional Center Stage: Compare View vs Specialized Preview */}
          {activeTab === 'preview' && config.type === 'animation' ? (
            <div className="flex-1 flex flex-col bg-zinc-950/90 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="h-11 bg-zinc-900/90 border-b border-zinc-800 px-3 flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('compare')}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                >
                  ← Back to Raw vs Cleaned Compare
                </button>
                <span className="text-xs font-mono text-zinc-400">{currentAssetName}</span>
              </div>
              <AnimationPreview
                frames={frames}
                fps={fps}
                onChangeFps={setFps}
                onUpdateFrames={setFrames}
                onEditFrame={(idx) => {
                  setEditingFrameIndex(idx);
                  setPixelEditorOpen(true);
                }}
                onRegenerateFrame={handleRegenerateFrame}
                isRegenerating={isGenerating}
                frameWidth={config.frameWidth}
                frameHeight={config.frameHeight}
                assetName={currentAssetName}
                copyWarning={copyWarning}
                poseNotes={config.poseNotes}
                onRetry={() => handleGenerate()}
                onSwitchToFrameByFrame={handleSwitchToFrameByFrame}
                onSelectStrongerModel={handleSelectStrongerModel}
              />
            </div>
          ) : activeTab === 'preview' && config.type === 'background' ? (
            <div className="flex-1 flex flex-col bg-zinc-950/90 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="h-11 bg-zinc-900/90 border-b border-zinc-800 px-3 flex items-center justify-between">
                <button
                  onClick={() => setActiveTab('compare')}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                >
                  ← Back to Raw vs Cleaned Compare
                </button>
                <span className="text-xs font-mono text-zinc-400">{currentAssetName}</span>
              </div>
              <BackgroundPreview
                backgroundImage={cleanedImage || rawImage || ''}
                width={config.frameWidth}
                height={config.frameHeight}
                isSeamless={config.tilingSeamless}
                parallaxLayers={parallaxLayers}
              />
            </div>
          ) : (
            <ResultsPanel
              rawImage={rawImage}
              cleanedImage={cleanedImage}
              frames={frames}
              config={config}
              profile={activeProfile}
              settings={settings}
              onChangeSettings={handleSettingsChange}
              detectedScale={detectedScale}
              frameWarning={frameWarning}
              copyWarning={copyWarning}
              onRetry={() => handleGenerate()}
              onSwitchToFrameByFrame={handleSwitchToFrameByFrame}
              onSelectStrongerModel={handleSelectStrongerModel}
              onApproveAsReference={handleApproveAsReference}
              onSetAsAnchor={handleSetAsAnchor}
              onSaveToLibrary={() => {}}
              isSaved={isSavedToLibrary}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onOpenPixelEditor={(idx) => {
                setEditingFrameIndex(idx ?? 0);
                setPixelEditorOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* Bottom Drawer: Asset Library */}
      <LibraryDrawer
        items={library}
        profiles={profiles}
        onSelectAndOpenItem={handleSelectAndOpenItem}
        onGenerateAgainWithChanges={handleGenerateAgainWithChanges}
        onDeleteItem={handleDeleteLibraryItem}
        onRenameItem={handleRenameLibraryItem}
      />

      {/* Tiny Pixel Editor Modal */}
      {pixelEditorOpen && (
        <PixelEditorModal
          initialImage={
            editingFrameIndex !== undefined && frames[editingFrameIndex]
              ? frames[editingFrameIndex]
              : cleanedImage || rawImage || ''
          }
          palette={activeProfile.palette}
          frameWidth={config.frameWidth}
          frameHeight={config.frameHeight}
          frameIndex={editingFrameIndex}
          onSave={handleSavePixelEdit}
          onClose={() => setPixelEditorOpen(false)}
        />
      )}
    </div>
  );
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
