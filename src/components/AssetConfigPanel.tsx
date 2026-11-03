import React, { useState, useEffect, useRef } from 'react';
import {
  AssetType,
  Facing,
  GenerationConfig,
  ProfileReference,
  PresetItem,
  StyleProfile,
  ImageModelOption,
  AnimationMode,
} from '../types';
import {
  Sparkles,
  ChevronDown,
  Layers,
  Film,
  Box,
  Image as ImageIcon,
  Flame,
  Plus,
  BookmarkCheck,
  AlertTriangle,
  Cpu,
  LayoutGrid,
  ListOrdered,
  RefreshCw,
} from 'lucide-react';
import {
  ANIMATION_PRESETS,
  BACKGROUND_PRESETS,
  PROP_PRESETS,
  getPresetAssetName,
} from '../utils/presets';
import {
  getGridDimensions,
  getBestAspectRatio,
  generatePoseNotes,
} from '../utils/gridLayout';

interface AssetConfigPanelProps {
  config: GenerationConfig;
  onChangeConfig: (config: GenerationConfig) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  activeProfile: StyleProfile;
  profiles: StyleProfile[];
  onSelectProfile: (profile: StyleProfile) => void;
  models: ImageModelOption[];
  modelsSource?: 'api' | 'fallback';
}

export const AssetConfigPanel: React.FC<AssetConfigPanelProps> = ({
  config,
  onChangeConfig,
  onGenerate,
  isGenerating,
  activeProfile,
  profiles,
  onSelectProfile,
  models,
  modelsSource,
}) => {
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);
  const [showPoseNotes, setShowPoseNotes] = useState(true);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  // Initialize pose notes if not present
  useEffect(() => {
    if (config.type === 'animation' && (!config.poseNotes || config.poseNotes.length === 0)) {
      const generated = generatePoseNotes(config.description, config.frameCount || 6);
      onChangeConfig({
        ...config,
        poseNotes: generated,
      });
    }
  }, [config.description, config.frameCount, config.type]);

  // Click outside listener for presets menu
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setShowPresetsMenu(false);
      }
    };
    if (showPresetsMenu) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showPresetsMenu]);

  // Model selection handler with localStorage persistence
  const handleModelChange = (modelId: string) => {
    try {
      localStorage.setItem('pixelforge_selected_model', modelId);
    } catch (e) {
      // ignore
    }
    onChangeConfig({
      ...config,
      selectedModel: modelId,
    });
  };

  const applyPreset = (preset: PresetItem) => {
    if (
      preset.profileType === 'characters' ||
      preset.type === 'animation' ||
      preset.type === 'sprite' ||
      preset.type === 'prop'
    ) {
      const charProf =
        profiles.find(
          (p) => p.id === 'profile_characters' || p.name.toLowerCase().includes('character')
        ) || profiles[0];
      if (charProf && activeProfile.id !== charProf.id) {
        onSelectProfile(charProf);
      }
    } else if (preset.profileType === 'backgrounds' || preset.type === 'background') {
      const bgProf = profiles.find(
        (p) => p.id === 'profile_backgrounds' || p.name.toLowerCase().includes('background')
      );
      if (bgProf && activeProfile.id !== bgProf.id) {
        onSelectProfile(bgProf);
      }
    }

    const frameCount = preset.frameCount || config.frameCount;
    const poseNotes = generatePoseNotes(preset.description, frameCount);

    onChangeConfig({
      ...config,
      type: preset.type,
      description: preset.description,
      frameCount,
      facing: preset.facing || config.facing,
      frameWidth: preset.frameWidth || (preset.type === 'background' ? 320 : 24),
      frameHeight: preset.frameHeight || (preset.type === 'background' ? 64 : 24),
      tilingSeamless: preset.tilingSeamless ?? config.tilingSeamless,
      splitParallax: preset.splitParallax ?? config.splitParallax,
      propItems: preset.propItems || config.propItems,
      poseNotes,
      presetAssetName: getPresetAssetName(preset),
      presetDescription: preset.description,
      assetNameEdited: false,
    });
    setShowPresetsMenu(false);
  };

  const handleSelectAssetType = (newType: AssetType) => {
    let nextW = config.frameWidth;
    let nextH = config.frameHeight;

    if (newType === 'background') {
      const bgProf = profiles.find(
        (p) => p.id === 'profile_backgrounds' || p.name.toLowerCase().includes('background')
      );
      if (bgProf && activeProfile.id !== bgProf.id) {
        onSelectProfile(bgProf);
      }
      nextW = 320;
      nextH = 64;
    } else {
      const charProf =
        profiles.find(
          (p) => p.id === 'profile_characters' || p.name.toLowerCase().includes('character')
        ) || profiles[0];
      if (charProf && activeProfile.id !== charProf.id) {
        onSelectProfile(charProf);
      }
      if (nextW > 64) nextW = 24;
      if (nextH > 64) nextH = 24;
    }

    const poseNotes =
      newType === 'animation'
        ? generatePoseNotes(config.description, config.frameCount || 6)
        : config.poseNotes;

    onChangeConfig({
      ...config,
      type: newType,
      frameWidth: nextW,
      frameHeight: nextH,
      poseNotes,
    });
  };

  const handleRegeneratePoseNotes = () => {
    const notes = generatePoseNotes(config.description, config.frameCount || 6);
    onChangeConfig({
      ...config,
      poseNotes: notes,
    });
  };

  const handlePoseNoteChange = (index: number, val: string) => {
    const updated = [...(config.poseNotes || [])];
    updated[index] = val;
    onChangeConfig({
      ...config,
      poseNotes: updated,
    });
  };

  const handleExtraUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const newRef: ProfileReference = {
          id: `extra_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          url: base64,
          base64: base64,
          label: file.name,
        };
        onChangeConfig({
          ...config,
          extraReferences: [...(config.extraReferences || []), newRef],
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeExtraRef = (id: string) => {
    onChangeConfig({
      ...config,
      extraReferences: config.extraReferences.filter((r) => r.id !== id),
    });
  };

  const gridDims = getGridDimensions(config.frameCount || 6);
  const bestAspect = getBestAspectRatio(gridDims.cols, gridDims.rows, config.frameWidth, config.frameHeight);
  const currentModel = models.find((m) => m.id === config.selectedModel) || null;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 space-y-4">
      {/* Top Header & Preset Button */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          Asset Configuration
        </label>
        <div className="relative" ref={presetMenuRef}>
          <button
            onClick={() => setShowPresetsMenu(!showPresetsMenu)}
            className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-medium transition"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Presets</span>
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>

          {/* Presets Dropdown */}
          {showPresetsMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-64 bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl p-2 z-50 max-h-96 overflow-y-auto space-y-2">
              <div>
                <span className="text-[10px] font-semibold uppercase text-amber-400/90 px-1.5 block mb-1">
                  Character Animations ({ANIMATION_PRESETS.length})
                </span>
                <div className="space-y-0.5">
                  {ANIMATION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className="w-full text-left px-2 py-1 text-xs text-zinc-300 hover:text-amber-300 hover:bg-zinc-800 rounded truncate transition flex items-center justify-between"
                    >
                      <span>{p.name}</span>
                      <span className="text-[10px] text-zinc-500">{p.frameCount}f</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-1.5">
                <span className="text-[10px] font-semibold uppercase text-sky-400/90 px-1.5 block mb-1">
                  Background Environments ({BACKGROUND_PRESETS.length})
                </span>
                <div className="space-y-0.5">
                  {BACKGROUND_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className="w-full text-left px-2 py-1 text-xs text-zinc-300 hover:text-sky-300 hover:bg-zinc-800 rounded truncate transition"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-1.5">
                <span className="text-[10px] font-semibold uppercase text-emerald-400/90 px-1.5 block mb-1">
                  Item & Prop Sheets ({PROP_PRESETS.length})
                </span>
                <div className="space-y-0.5">
                  {PROP_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className="w-full text-left px-2 py-1 text-xs text-zinc-300 hover:text-emerald-300 hover:bg-zinc-800 rounded truncate transition"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Profile Status & Quick Switcher */}
      <div className="flex items-center justify-between p-2 rounded-md bg-zinc-950 border border-zinc-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Profile:</span>
          <select
            value={activeProfile.id}
            onChange={(e) => {
              const found = profiles.find((p) => p.id === e.target.value);
              if (found) onSelectProfile(found);
            }}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs font-semibold text-amber-400 focus:outline-none cursor-pointer"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <span className="text-[10px] text-zinc-400 font-mono">
          Cell: {config.frameWidth}×{config.frameHeight}px
        </span>
      </div>

      {/* Profile Mismatch Safeguard */}
      {(config.type === 'animation' || config.type === 'sprite') && activeProfile.id.includes('background') && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/40 rounded-lg flex items-center justify-between gap-2 text-xs text-amber-300">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">Wrong Profile: Character assets need Characters profile!</span>
          </div>
          <button
            onClick={() => {
              const charProf = profiles.find((p) => p.id === 'profile_characters') || profiles[0];
              if (charProf) onSelectProfile(charProf);
            }}
            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded text-[11px] shrink-0 transition"
          >
            Fix Profile
          </button>
        </div>
      )}

      {/* Asset Type Selector Tabs */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-400 block">
          Asset Type
        </label>
        <div className="grid grid-cols-5 gap-1 bg-zinc-950 p-1 rounded border border-zinc-800 text-center">
          {(
            [
              { type: 'sprite', label: 'Sprite', icon: ImageIcon },
              { type: 'animation', label: 'Anim Sheet', icon: Film },
              { type: 'prop', label: 'Props', icon: Box },
              { type: 'background', label: 'Background', icon: Layers },
              { type: 'effect', label: 'Effects', icon: Flame },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = config.type === item.type;
            return (
              <button
                key={item.type}
                onClick={() => handleSelectAssetType(item.type)}
                className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 text-[10px] font-medium transition ${
                  active
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="truncate w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Asset Name (what the next generation is saved as) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="config-asset-name" className="text-[11px] font-medium text-zinc-400">
            Name
          </label>
          {config.assetNameEdited && (
            <button
              onClick={() => onChangeConfig({ ...config, assetNameEdited: false })}
              className="text-[10px] text-amber-400 hover:text-amber-300"
              title="Go back to the preset / suggested name"
            >
              Use suggested
            </button>
          )}
        </div>
        <input
          id="config-asset-name"
          data-testid="config-asset-name"
          type="text"
          value={config.assetName}
          onChange={(e) =>
            onChangeConfig({ ...config, assetName: e.target.value, assetNameEdited: e.target.value.trim() !== '' })
          }
          placeholder="fig_idle"
          className="w-full bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1 text-xs font-mono text-zinc-100 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* 1. Sprite Fields */}
      {config.type === 'sprite' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 block">
              Character / Sprite Description
            </label>
            <textarea
              value={config.description}
              onChange={(e) => onChangeConfig({ ...config, description: e.target.value })}
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:border-amber-500/60 focus:outline-none"
              placeholder="e.g. holding a wooden torch, leather belt, idle pose"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Facing</span>
              <select
                value={config.facing}
                onChange={(e) => onChangeConfig({ ...config, facing: e.target.value as Facing })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="front">Front</option>
                <option value="back">Back</option>
              </select>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Width</span>
              <input
                type="number"
                value={config.frameWidth}
                onChange={(e) => onChangeConfig({ ...config, frameWidth: parseInt(e.target.value, 10) || 24 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Height</span>
              <input
                type="number"
                value={config.frameHeight}
                onChange={(e) => onChangeConfig({ ...config, frameHeight: parseInt(e.target.value, 10) || 24 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-zinc-500">Cell:</span>
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, frameWidth: 24, frameHeight: 24 })}
              className={`text-[10px] px-2 py-0.5 rounded border transition font-mono ${
                config.frameWidth === 24 && config.frameHeight === 24
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              24×24 Standing
            </button>
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, frameWidth: 32, frameHeight: 24 })}
              className={`text-[10px] px-2 py-0.5 rounded border transition font-mono ${
                config.frameWidth === 32 && config.frameHeight === 24
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              32×24 Tool / Reach
            </button>
          </div>
        </div>
      )}

      {/* 2. Animation Sheet Fields with Grid Layout & Modes */}
      {config.type === 'animation' && (
        <div className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 block">
              Action Description
            </label>
            <textarea
              value={config.description}
              onChange={(e) => onChangeConfig({ ...config, description: e.target.value })}
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:border-amber-500/60 focus:outline-none"
              placeholder="e.g. chop with axe 4 frames, raising overhead and swinging down"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Frames (2-12)</span>
              <input
                type="number"
                min={2}
                max={12}
                value={config.frameCount}
                onChange={(e) => {
                  const cnt = Math.max(2, Math.min(12, parseInt(e.target.value, 10) || 4));
                  const notes = generatePoseNotes(config.description, cnt);
                  onChangeConfig({
                    ...config,
                    frameCount: cnt,
                    poseNotes: notes,
                  });
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Facing</span>
              <select
                value={config.facing}
                onChange={(e) => onChangeConfig({ ...config, facing: e.target.value as Facing })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
                <option value="front">Front</option>
                <option value="back">Back</option>
              </select>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Frame W</span>
              <input
                type="number"
                value={config.frameWidth}
                onChange={(e) => onChangeConfig({ ...config, frameWidth: parseInt(e.target.value, 10) || 24 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Frame H</span>
              <input
                type="number"
                value={config.frameHeight}
                onChange={(e) => onChangeConfig({ ...config, frameHeight: parseInt(e.target.value, 10) || 24 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-zinc-500">Cell:</span>
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, frameWidth: 24, frameHeight: 24 })}
              className={`text-[10px] px-2 py-0.5 rounded border transition font-mono ${
                config.frameWidth === 24 && config.frameHeight === 24
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              24×24 Standing
            </button>
            <button
              type="button"
              onClick={() => onChangeConfig({ ...config, frameWidth: 32, frameHeight: 24 })}
              className={`text-[10px] px-2 py-0.5 rounded border transition font-mono ${
                config.frameWidth === 32 && config.frameHeight === 24
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              32×24 Tool / Reach
            </button>
          </div>

          {/* Grid Layout & Generation Mode Selector */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-300">Animation Strategy</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-amber-400 font-mono">
                {gridDims.cols}×{gridDims.rows} Grid ({bestAspect})
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-zinc-950 p-1 rounded border border-zinc-800 text-center">
              <button
                type="button"
                onClick={() => onChangeConfig({ ...config, animationMode: 'template' })}
                className={`py-1.5 px-2 rounded text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                  config.animationMode !== 'frame_by_frame'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Template Fill (Default)</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeConfig({ ...config, animationMode: 'frame_by_frame' })}
                className={`py-1.5 px-2 rounded text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                  config.animationMode === 'frame_by_frame'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Frame by frame</span>
              </button>
            </div>

            {config.animationMode !== 'frame_by_frame' ? (
              <div className="p-2 rounded bg-zinc-950/80 border border-zinc-800/80 text-[10px] text-zinc-400 leading-relaxed">
                Builds an 8x grid canvas with your <span className="text-amber-400 font-semibold">Anchor in Cell 1</span> on baseline, faint #E000E0 dividers, and prompts Gemini to fill empty cells in {gridDims.cols}×{gridDims.rows} reading order, then reassembles into a horizontal row strip.
              </div>
            ) : (
              <div className="p-2 rounded bg-zinc-950/80 border border-zinc-800/80 text-[10px] text-zinc-400 leading-relaxed">
                Generates each frame sequentially, passing the Anchor + previous finished frame as references along with your customized pose notes below.
              </div>
            )}

            {/* Editable Pose Notes */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowPoseNotes(!showPoseNotes)}
                  className="text-[10px] uppercase font-semibold text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  <span>Pose Notes ({config.poseNotes?.length || config.frameCount})</span>
                  <span className="text-xs">{showPoseNotes ? '▾' : '▸'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleRegeneratePoseNotes}
                  className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  title="Auto-write pose notes from description"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Auto-write notes</span>
                </button>
              </div>

              {showPoseNotes && (
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 bg-zinc-950/90 p-1.5 rounded border border-zinc-800">
                  {(config.poseNotes || []).map((note, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-zinc-500 w-5 shrink-0">#{idx + 1}</span>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => handlePoseNoteChange(idx, e.target.value)}
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-[11px] text-zinc-200 focus:outline-none focus:border-amber-500/50"
                        placeholder={`Pose for frame ${idx + 1}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Prop Sheet Fields */}
      {config.type === 'prop' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 block">
              Props / Items List (One per line)
            </label>
            <textarea
              value={config.propItems}
              onChange={(e) => onChangeConfig({ ...config, propItems: e.target.value })}
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 font-mono focus:border-amber-500/60 focus:outline-none resize-y"
              placeholder="Iron pickaxe&#10;Wooden cart&#10;Lantern&#10;Gold chunk"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Approx Item W</span>
              <input
                type="number"
                value={config.frameWidth}
                onChange={(e) => onChangeConfig({ ...config, frameWidth: parseInt(e.target.value, 10) || 16 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Approx Item H</span>
              <input
                type="number"
                value={config.frameHeight}
                onChange={(e) => onChangeConfig({ ...config, frameHeight: parseInt(e.target.value, 10) || 16 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Background Fields */}
      {config.type === 'background' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 block">
              Environment Description
            </label>
            <textarea
              value={config.description}
              onChange={(e) => onChangeConfig({ ...config, description: e.target.value })}
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:border-amber-500/60 focus:outline-none"
              placeholder="e.g. dense alpine evergreen pines, misty blue distant peaks"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Width (px)</span>
              <input
                type="number"
                value={config.frameWidth}
                onChange={(e) => onChangeConfig({ ...config, frameWidth: parseInt(e.target.value, 10) || 320 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block mb-0.5">Height (px)</span>
              <input
                type="number"
                value={config.frameHeight}
                onChange={(e) => onChangeConfig({ ...config, frameHeight: parseInt(e.target.value, 10) || 64 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={config.tilingSeamless}
                onChange={(e) => onChangeConfig({ ...config, tilingSeamless: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
              />
              <span>Seamless left-right tiling</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={config.splitParallax}
                onChange={(e) => onChangeConfig({ ...config, splitParallax: e.target.checked })}
                className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
              />
              <span>Split into parallax layers (sky, far, mid, near)</span>
            </label>
          </div>
        </div>
      )}

      {/* 5. Effects Sheet Fields */}
      {config.type === 'effect' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-400 block">
              Effects List
            </label>
            <textarea
              value={config.effectItems}
              onChange={(e) => onChangeConfig({ ...config, effectItems: e.target.value })}
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:border-amber-500/60 focus:outline-none"
              placeholder="e.g. fire spark burst, water splash, smoke poof"
            />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 block mb-0.5">Frames Per Effect</span>
            <input
              type="number"
              min={2}
              max={8}
              value={config.framesPerEffect}
              onChange={(e) =>
                onChangeConfig({ ...config, framesPerEffect: parseInt(e.target.value, 10) || 4 })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Model Picker (Dropdown + Memory) */}
      <div className="space-y-1.5 p-2 rounded-md bg-zinc-950 border border-zinc-800">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>Image Model</span>
          </label>
          {modelsSource === 'fallback' && (
            <span
              className="text-[10px] font-mono text-red-400/90 font-medium"
              title="Could not list models from the Gemini API; showing a fallback list. Check the server log."
            >
              fallback list
            </span>
          )}
        </div>
        <select
          value={config.selectedModel}
          onChange={(e) => handleModelChange(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 font-medium focus:outline-none cursor-pointer"
        >
          {models.length === 0 && <option value={config.selectedModel}>Loading models…</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.id})
            </option>
          ))}
        </select>
        {currentModel?.description && (
          <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">{currentModel.description}</p>
        )}
      </div>

      {/* Extra References for this request */}
      <div className="space-y-1.5 pt-1 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-zinc-400">
            Extra References (Optional)
          </label>
          <label className="cursor-pointer text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1">
            <Plus className="w-3 h-3" />
            <span>Add</span>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleExtraUpload}
            />
          </label>
        </div>

        {config.extraReferences && config.extraReferences.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {config.extraReferences.map((ref) => (
              <div
                key={ref.id}
                className="relative group w-10 h-10 rounded border border-zinc-700 bg-zinc-950 p-0.5"
              >
                <img
                  src={ref.url}
                  alt={ref.label}
                  className="w-full h-full object-contain [image-rendering:pixelated]"
                />
                <button
                  onClick={() => removeExtraRef(ref.id)}
                  className="hidden group-hover:flex absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 text-white rounded-full items-center justify-center text-[9px]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-zinc-600 block">
            Uses {activeProfile.name} profile references & Anchor by default.
          </span>
        )}
      </div>

      {/* Main Generate Button */}
      <div className="pt-2">
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full py-2.5 px-4 rounded-md font-semibold text-xs tracking-wide uppercase transition flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              <span>Generating Pixel Art...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 fill-current" />
              <span>
                {config.type === 'animation' && config.animationMode === 'template'
                  ? `Fill Grid with ${activeProfile.name}`
                  : `Generate with ${activeProfile.name}`}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
