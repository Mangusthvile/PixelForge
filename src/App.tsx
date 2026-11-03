import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleProfile,
  GenerationConfig,
  CleanupSettings,
  LibraryItem,
  ParallaxLayer,
  ImageModelOption,
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
  runStartupMaintenance,
  getDefaultProfile,
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
import { AssetNameBar, SaveStatus } from './components/AssetNameBar';
import { resolveAssetName, nextVersionName, sameFrames } from './utils/naming';
import { exportMultipleAssetsZip, downloadBlob } from './utils/export';
import { AlertCircle, Sparkles, Palette, X } from 'lucide-react';

type NameConflictChoice = 'replace' | 'version' | 'cancel';

export default function App() {
  // Profiles State
  const [profiles, setProfiles] = useState<StyleProfile[]>([
    INITIAL_CHARACTERS_PROFILE,
    INITIAL_BACKGROUNDS_PROFILE,
  ]);
  const [activeProfile, setActiveProfile] = useState<StyleProfile>(INITIAL_CHARACTERS_PROFILE);

  // Asset Generation Config
  const [config, setConfig] = useState<GenerationConfig>(() => {
    // Small setting, kept in localStorage. Validated against the real model list once it loads.
    const savedModel =
      typeof window !== 'undefined' ? localStorage.getItem('pixelforge_selected_model') || '' : '';

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
  const [currentAssetName, setCurrentAssetName] = useState<string>('');
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

  // Image models (discovered by the server from the Gemini models list API)
  const [models, setModels] = useState<ImageModelOption[]>([]);
  const [modelsSource, setModelsSource] = useState<'api' | 'fallback' | undefined>();
  const [defaultModel, setDefaultModel] = useState<string>('');

  // Library State
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const libraryRef = useRef<LibraryItem[]>([]);
  // The library record behind the asset currently shown (may not be saved yet).
  const [openItem, setOpenItem] = useState<LibraryItem | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nameConflict, setNameConflict] = useState<{
    name: string;
    versionName: string;
    resolve: (choice: NameConflictChoice) => void;
  } | null>(null);

  const isOpenItemInLibrary = Boolean(openItem && library.some((i) => i.id === openItem.id));

  const updateLibrary = (fn: (prev: LibraryItem[]) => LibraryItem[]) => {
    const next = fn(libraryRef.current);
    libraryRef.current = next;
    setLibrary(next);
  };

  const reportStorageError = (context: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${context}:`, err);
    setSaveError(`${context}: ${msg}`);
  };

  /** Write one item to IndexedDB, then reflect it in the library list. Returns true on success. */
  const persistItem = async (item: LibraryItem): Promise<boolean> => {
    setSaveStatus('saving');
    try {
      await saveLibraryItem(item);
      updateLibrary((prev) => {
        const idx = prev.findIndex((i) => i.id === item.id);
        if (idx === -1) return [item, ...prev];
        const next = [...prev];
        next[idx] = item;
        return next;
      });
      setSaveStatus('saved');
      setSaveError(null);
      return true;
    } catch (err) {
      setSaveStatus('error');
      reportStorageError(`Couldn't save "${item.name}" to the library`, err);
      return false;
    }
  };

  const askNameConflict = (name: string, versionName: string) =>
    new Promise<NameConflictChoice>((resolve) => {
      setNameConflict({
        name,
        versionName,
        resolve: (choice) => {
          setNameConflict(null);
          resolve(choice);
        },
      });
    });

  /**
   * Save a brand-new asset. If another library item already has its name, ask whether to
   * replace it or save as a new version (name_v2, name_v3, ...).
   */
  const saveNewItem = async (item: LibraryItem): Promise<LibraryItem> => {
    const existing = libraryRef.current.find((i) => i.name === item.name && i.id !== item.id);
    let finalItem = item;
    if (existing) {
      const versionName = nextVersionName(item.name, libraryRef.current);
      const choice = await askNameConflict(item.name, versionName);
      if (choice === 'cancel') {
        setSaveStatus('idle');
        return item;
      }
      finalItem =
        choice === 'replace' ? { ...item, id: existing.id } : { ...item, name: versionName };
    }
    await persistItem(finalItem);
    return finalItem;
  };

  /** Make a freshly generated item the open asset and save it. */
  const openAndSaveNewItem = async (item: LibraryItem) => {
    setOpenItem(item);
    const finalItem = await saveNewItem(item);
    setOpenItem(finalItem);
    setCurrentAssetName(finalItem.name);
  };

  // Auto-save: any change to the open asset (frames, cleaned sheet, name, fps) updates its library entry.
  useEffect(() => {
    if (!openItem || !cleanedImage) return;
    const stored = library.find((i) => i.id === openItem.id);
    if (!stored) return; // not in the library yet; "Save to Library" adds it
    const name = currentAssetName.trim() || stored.name;
    const changed =
      stored.name !== name ||
      stored.cleanedImage !== cleanedImage ||
      stored.metadata.fps !== fps ||
      !sameFrames(stored.frames, frames);
    if (!changed) return;

    const timer = setTimeout(() => {
      persistItem({
        ...stored,
        name,
        cleanedImage,
        frames,
        metadata: { ...stored.metadata, fps, frameCount: frames.length },
      });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem, library, currentAssetName, cleanedImage, frames, fps]);

  // Fade the "Saved" indicator back to idle after a moment.
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = setTimeout(() => setSaveStatus('idle'), 2500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  const handleManualSave = async () => {
    if (!openItem || !cleanedImage) return;
    const snapshot: LibraryItem = {
      ...openItem,
      name: currentAssetName.trim() || openItem.name,
      cleanedImage,
      frames,
      metadata: { ...openItem.metadata, fps, frameCount: frames.length },
    };
    if (libraryRef.current.some((i) => i.id === snapshot.id)) {
      const stored = libraryRef.current.find((i) => i.id === snapshot.id)!;
      await persistItem({ ...stored, ...snapshot, metadata: { ...stored.metadata, ...snapshot.metadata } });
    } else {
      await openAndSaveNewItem(snapshot);
    }
  };

  const handleRenameOpenAsset = (name: string) => {
    setCurrentAssetName(name);
    if (openItem && !libraryRef.current.some((i) => i.id === openItem.id)) {
      setOpenItem({ ...openItem, name });
    }
  };

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

  // Load profiles + library from IndexedDB, and the real model list from the server
  useEffect(() => {
    async function init() {
      try {
        await runStartupMaintenance();
      } catch (err) {
        reportStorageError('Storage cleanup failed', err);
      }

      try {
        const storedProfiles = await getStoredProfiles();
        if (storedProfiles.length > 0) {
          setProfiles(storedProfiles);
          setActiveProfile(storedProfiles[0]);
        }
      } catch (err) {
        reportStorageError("Couldn't load style profiles", err);
      }

      try {
        const storedLib = await getStoredLibrary();
        updateLibrary(() => storedLib);
      } catch (err) {
        reportStorageError("Couldn't load the library", err);
      }
    }

    async function loadModels() {
      try {
        const res = await fetch('/api/models');
        const data = await res.json();
        const list: ImageModelOption[] = Array.isArray(data.models) ? data.models : [];
        setModels(list);
        setModelsSource(data.source);
        setDefaultModel(data.defaultModel || list[0]?.id || '');
        setConfig((prev) =>
          list.some((m) => m.id === prev.selectedModel)
            ? prev
            : { ...prev, selectedModel: data.defaultModel || list[0]?.id || '' }
        );
      } catch (err) {
        console.error('Failed to load model list:', err);
      }
    }

    init();
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Config when Profile changes
  const handleSelectProfile = (p: StyleProfile) => {
    setActiveProfile(p);
    if (p.name.toLowerCase().includes('background')) {
      setConfig((prev) => ({
        ...prev,
        type: 'background',
        description: 'dense alpine evergreen pines, misty blue distant peaks',
        frameWidth: p.frameWidth || 320,
        frameHeight: p.frameHeight || 64,
        tilingSeamless: true,
        splitParallax: true,
      }));
    } else {
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
    }
  };

  // Profile management
  const handleUpdateProfile = (updated: StyleProfile) => {
    setActiveProfile(updated);
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    saveProfile(updated).catch((err) => reportStorageError(`Couldn't save profile "${updated.name}"`, err));
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
    saveAllProfiles(updated).catch((err) => reportStorageError("Couldn't save profiles", err));
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
    saveAllProfiles(updated).catch((err) => reportStorageError("Couldn't save profiles", err));
  };

  const handleDeleteProfile = (id: string) => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter((p) => p.id !== id);
    setProfiles(remaining);
    setActiveProfile(remaining[0]);
    deleteProfileFromDB(id).catch((err) => reportStorageError("Couldn't delete profile", err));
  };

  const handleResetProfiles = () => {
    if (confirm('Reset ALL profiles to the built-in Characters and Backgrounds defaults? Custom profiles will be removed.')) {
      const defaults = [INITIAL_CHARACTERS_PROFILE, INITIAL_BACKGROUNDS_PROFILE];
      setProfiles(defaults);
      setActiveProfile(defaults[0]);
      saveAllProfiles(defaults).catch((err) => reportStorageError("Couldn't reset profiles", err));
    }
  };

  // Reset a single built-in profile (e.g. Characters) back to its shipped defaults
  const handleResetProfileToDefaults = (id: string) => {
    const def = getDefaultProfile(id);
    if (!def) return;
    if (!confirm(`Reset "${def.name}" to its default settings? Your changes to this profile will be lost.`)) return;
    setProfiles((prev) => prev.map((p) => (p.id === id ? def : p)));
    if (activeProfile.id === id) setActiveProfile(def);
    saveProfile(def).catch((err) => reportStorageError(`Couldn't reset profile "${def.name}"`, err));
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
    // Detach the previous asset so intermediate results never overwrite its library entry.
    setOpenItem(null);
    setSaveStatus('idle');
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
        anchorBase64 = await urlToBase64(INITIAL_CHARACTERS_PROFILE.references[0].url);
      }

      // MODE A: FRAME BY FRAME GENERATION
      if (currentConfig.type === 'animation' && currentConfig.animationMode === 'frame_by_frame') {
        const totalFrames = currentConfig.frameCount || 6;
        const accumulatedFrames: string[] = [];
        let lastFrameBase64 = '';
        let frameModelUsed = '';

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
              model: currentConfig.selectedModel || undefined,
            }),
          });

          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.error || `Failed to generate frame ${f + 1}.`);
          }

          if (data.modelUsed) {
            setLastUsedModel(data.modelUsed);
            frameModelUsed = data.modelUsed;
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
        const fbfName = resolveAssetName(currentConfig, `fig_${sanitizeName(currentConfig.description)}`);
        setCurrentAssetName(fbfName);

        // Save to library
        const newItem: LibraryItem = {
          id: `item_${Date.now()}`,
          name: fbfName,
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
            fps,
            baselineY: currentConfig.frameHeight - 2,
            facing: currentConfig.facing,
            modelUsed: frameModelUsed || currentConfig.selectedModel,
            animationMode: 'frame_by_frame',
            poseNotes: currentConfig.poseNotes,
          },
        };
        setActiveTab('preview');
        await openAndSaveNewItem(newItem);
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

      setGenerationProgressText(`Sending request to ${currentConfig.selectedModel || 'default model'}...`);

      // 2. Build Prompt
      const builtPrompt = buildGenerationPrompt(currentConfig, enrichedProfile);
      const assetName = resolveAssetName(currentConfig, builtPrompt.assetName);
      setCurrentAssetName(assetName);

      // 3. Call Server API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: builtPrompt.promptText,
          references: builtPrompt.referenceImages,
          aspectRatio: builtPrompt.aspectRatio,
          type: currentConfig.type,
          model: currentConfig.selectedModel || undefined,
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
          name: assetName,
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
            fps,
            baselineY: pipelineRes.baselineY,
            facing: currentConfig.facing,
            tiling: currentConfig.tilingSeamless,
            parallaxLayers: pipelineRes.parallaxLayers,
            modelUsed: data.modelUsed || currentConfig.selectedModel,
            animationMode: currentConfig.animationMode,
            poseNotes: currentConfig.poseNotes,
          },
        };
        await openAndSaveNewItem(newItem);
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
    const strongest = defaultModel || config.selectedModel;
    const updated = { ...config, selectedModel: strongest };
    setConfig(updated);
    try {
      localStorage.setItem('pixelforge_selected_model', strongest);
    } catch (e) {
      // ignore
    }
    setCopyWarning(undefined);
    handleGenerate(updated);
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
          model: config.selectedModel || undefined,
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
    setFps(item.metadata.fps ?? 8);
    setParallaxLayers(item.metadata.parallaxLayers);
    setOpenItem(item);
    setSaveStatus('idle');
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
    setLastUsedModel(item.metadata?.modelUsed || null);
    setActiveTab(item.type === 'animation' ? 'preview' : 'compare');
  };

  const handleGenerateAgainWithChanges = (item: LibraryItem) => {
    handleSelectAndOpenItem(item);
    const foundProfile = profiles.find((p) => p.id === item.profileId);
    if (foundProfile) setActiveProfile(foundProfile);
  };

  const handleDeleteLibraryItem = async (id: string) => {
    try {
      await deleteLibraryItem(id);
      updateLibrary((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      reportStorageError("Couldn't delete library item", err);
    }
  };

  const handleRenameLibraryItem = async (id: string, newName: string) => {
    const item = libraryRef.current.find((i) => i.id === id);
    if (!item) return;
    if (openItem?.id === id) setCurrentAssetName(newName);
    await persistItem({ ...item, name: newName });
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

  const assetBar = (
    <AssetNameBar
      name={currentAssetName}
      onRename={handleRenameOpenAsset}
      onSaveToLibrary={handleManualSave}
      saveStatus={saveStatus}
      isInLibrary={isOpenItemInLibrary}
      modelUsed={openItem?.metadata.modelUsed || lastUsedModel}
      canSave={Boolean(openItem && cleanedImage)}
    />
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* App Header */}
      <Header
        onExportAll={handleExportAll}
        libraryCount={library.length}
        onResetProfiles={handleResetProfiles}
        selectedModelId={config.selectedModel}
        lastUsedModelId={lastUsedModel}
        models={models}
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
                onResetProfileToDefaults={handleResetProfileToDefaults}
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
                models={models}
                modelsSource={modelsSource}
              />
            )}
          </div>
        </div>

        {/* Center Main Stage */}
        <div className="flex-1 flex flex-col p-3 overflow-hidden bg-zinc-950">
          {/* Library save error (always visible until dismissed) */}
          {saveError && (
            <div
              data-testid="save-error-banner"
              className="mb-3 p-3 bg-red-950/60 border border-red-500/60 rounded-lg flex items-start justify-between gap-3 text-xs text-red-200"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block mb-0.5">Library not saved</span>
                  <span>{saveError}</span>
                </div>
              </div>
              <button
                onClick={() => setSaveError(null)}
                className="p-1 text-red-300 hover:text-red-100 shrink-0"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

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
              </div>
              {assetBar}
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
              </div>
              {assetBar}
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
              onSaveToLibrary={handleManualSave}
              isSaved={isOpenItemInLibrary}
              assetBar={assetBar}
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

      {/* Same-name dialog for new assets */}
      {nameConflict && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            data-testid="name-conflict-dialog"
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-full max-w-sm space-y-3 text-sm text-zinc-200"
          >
            <p>
              An asset named <span className="font-mono text-amber-300">{nameConflict.name}</span> is already in
              the library.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => nameConflict.resolve('replace')}
                className="px-3 py-1.5 rounded bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 text-xs font-medium"
              >
                Replace existing {nameConflict.name}
              </button>
              <button
                onClick={() => nameConflict.resolve('version')}
                className="px-3 py-1.5 rounded bg-amber-500 text-zinc-950 hover:bg-amber-400 text-xs font-semibold"
              >
                Save as new version ({nameConflict.versionName})
              </button>
              <button
                onClick={() => nameConflict.resolve('cancel')}
                className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-xs"
              >
                Don't save for now
              </button>
            </div>
          </div>
        </div>
      )}

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
