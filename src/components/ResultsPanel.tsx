import React, { useState } from 'react';
import {
  CleanupSettings,
  GenerationConfig,
  LibraryItem,
  StyleProfile,
} from '../types';
import {
  ZoomIn,
  ZoomOut,
  Sliders,
  CheckCircle2,
  Anchor,
  Download,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Maximize2,
  Edit3,
} from 'lucide-react';

interface ResultsPanelProps {
  rawImage: string | null;
  cleanedImage: string | null;
  frames: string[];
  config: GenerationConfig;
  profile: StyleProfile;
  settings: CleanupSettings;
  onChangeSettings: (settings: CleanupSettings) => void;
  detectedScale: number;
  frameWarning?: string;
  copyWarning?: string;
  onRetry?: () => void;
  onSwitchToFrameByFrame?: () => void;
  onSelectStrongerModel?: () => void;
  onApproveAsReference: () => void;
  onSetAsAnchor: () => void;
  onSaveToLibrary: () => void;
  isSaved: boolean;
  activeTab: 'compare' | 'preview' | 'editor';
  setActiveTab: (tab: 'compare' | 'preview' | 'editor') => void;
  onOpenPixelEditor: (frameIndex?: number) => void;
  assetBar?: React.ReactNode;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  rawImage,
  cleanedImage,
  frames,
  config,
  profile,
  settings,
  onChangeSettings,
  detectedScale,
  frameWarning,
  copyWarning,
  onRetry,
  onSwitchToFrameByFrame,
  onSelectStrongerModel,
  onApproveAsReference,
  onSetAsAnchor,
  onSaveToLibrary,
  isSaved,
  activeTab,
  setActiveTab,
  onOpenPixelEditor,
  assetBar,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(4); // 1x, 2x, 4x, 8x
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  if (!rawImage && !cleanedImage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-zinc-950/60 border border-zinc-800/80 rounded-lg min-h-[460px]">
        <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-3">
          <Sparkles className="w-8 h-8" />
        </div>
        <p className="text-sm text-zinc-400">Generate something to see it here</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950/90 border border-zinc-800 rounded-lg overflow-hidden min-h-[500px]">
      {assetBar}
      {/* Top Toolbar */}
      <div className="h-11 bg-zinc-900/90 border-b border-zinc-800 px-3 flex items-center justify-between gap-2 select-none shrink-0">
        {/* View Tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('compare')}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              activeTab === 'compare'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Raw vs Cleaned
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1 rounded text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'preview'
                ? 'bg-zinc-800 text-amber-300 border border-zinc-700 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>
              {config.type === 'animation'
                ? 'Animation Player'
                : config.type === 'background'
                ? 'Tiling & Parallax'
                : 'Asset Preview'}
            </span>
          </button>
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom Selector (1x, 2x, 4x, 8x) */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs text-zinc-300">
            {[1, 2, 4, 8].map((z) => (
              <button
                key={z}
                onClick={() => setZoomLevel(z)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition ${
                  zoomLevel === z
                    ? 'bg-amber-500/20 text-amber-400 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {z}x
              </button>
            ))}
          </div>

          {/* Cleanup Settings Toggle */}
          <button
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition ${
              showSettingsDrawer
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Toggle Cleanup Pipeline settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Pipeline Controls</span>
          </button>

          {/* Edit in Pixel Editor Button */}
          <button
            onClick={() => onOpenPixelEditor(0)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition"
            title="Open pixel touch-up editor"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Touch-up</span>
          </button>

          {/* Approve as Reference */}
          <button
            onClick={onApproveAsReference}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition"
            title="Add cleaned result to current profile references"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Approve Ref</span>
          </button>

          {/* Set as Anchor */}
          <button
            onClick={onSetAsAnchor}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition"
            title="Set as Character & Style Anchor for profile"
          >
            <Anchor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Make Anchor</span>
          </button>
        </div>
      </div>

      {/* Copy Detection Warning */}
      {copyWarning && (
        <div className="bg-amber-500/15 border-b border-amber-500/50 px-3.5 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium">{copyWarning}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded text-[11px] transition"
              >
                Try Again
              </button>
            )}
            {onSwitchToFrameByFrame && (
              <button
                onClick={onSwitchToFrameByFrame}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded text-[11px] transition"
              >
                Switch to Frame by frame
              </button>
            )}
            {onSelectStrongerModel && (
              <button
                onClick={onSelectStrongerModel}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded text-[11px] transition"
              >
                Use Gemini 3 Pro
              </button>
            )}
          </div>
        </div>
      )}

      {/* Frame Warning Alert (if animation frame slice count differs) */}
      {frameWarning && (
        <div className="bg-amber-950/40 border-b border-amber-500/40 px-3 py-1.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{frameWarning}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">Override:</span>
            <input
              type="number"
              min={1}
              max={16}
              value={settings.frameCountOverride || config.frameCount}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  frameCountOverride: parseInt(e.target.value, 10) || 1,
                })
              }
              className="w-12 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100 font-mono"
            />
          </div>
        </div>
      )}

      {/* Main View Area */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Canvas Display Area */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]">
          {activeTab === 'compare' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-full items-start">
              {/* Raw Result Card */}
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 space-y-2 flex flex-col items-center">
                <div className="flex items-center justify-between w-full text-[11px] font-medium text-zinc-400 pb-1 border-b border-zinc-800">
                  <span>Raw Model Output</span>
                  <span className="font-mono text-zinc-500 text-[10px]">Solid #FF00FF Magenta</span>
                </div>
                <div className="overflow-auto max-h-[380px] p-2 flex items-center justify-center bg-zinc-950 border border-zinc-800/80 rounded">
                  {rawImage && (
                    <img
                      src={rawImage}
                      alt="Raw Generated Output"
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'center center',
                        imageRendering: 'pixelated',
                      }}
                      className="transition-transform duration-75 max-w-none"
                    />
                  )}
                </div>
              </div>

              {/* Cleaned Result Card */}
              <div className="bg-zinc-900/90 border border-amber-500/30 rounded-lg p-3 space-y-2 flex flex-col items-center">
                <div className="flex items-center justify-between w-full text-[11px] font-medium text-amber-300/90 pb-1 border-b border-zinc-800">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cleaned & Palette-Locked</span>
                  </div>
                  <span className="font-mono text-zinc-500 text-[10px]">
                    Scale: {settings.scaleOverride || detectedScale}x • Transparent BG
                  </span>
                </div>
                <div
                  className="overflow-auto max-h-[380px] p-2 flex items-center justify-center border border-zinc-800/80 rounded"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    backgroundColor: '#09090b',
                  }}
                >
                  {cleanedImage && (
                    <img
                      src={cleanedImage}
                      alt="Cleaned Output"
                      style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'center center',
                        imageRendering: 'pixelated',
                      }}
                      className="transition-transform duration-75 max-w-none"
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Sliding Pipeline Controls Drawer */}
        {showSettingsDrawer && (
          <div className="w-80 bg-zinc-900 border-l border-zinc-800 p-4 space-y-4 overflow-y-auto shrink-0 select-none">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Sliders className="w-4 h-4" />
                <span>Cleanup Pipeline</span>
              </h4>
              <button
                onClick={() => setShowSettingsDrawer(false)}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >
                Close
              </button>
            </div>

            {/* 1. Magenta Keying */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.keyMagenta}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, keyMagenta: e.target.checked })
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
                  />
                  <span>Key Out Magenta (#FF00FF)</span>
                </label>
                <span className="text-[11px] font-mono text-zinc-400">
                  {settings.magentaTolerance}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                disabled={!settings.keyMagenta}
                value={settings.magentaTolerance}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    magentaTolerance: parseInt(e.target.value, 10),
                  })
                }
                className="w-full accent-amber-500"
              />
              <span className="text-[10px] text-zinc-500 block">
                Removes magenta background and compression fringe
              </span>
            </div>

            {/* 2. Pixel Snap & Nearest Neighbor */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-800">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={settings.pixelSnap}
                  onChange={(e) =>
                    onChangeSettings({ ...settings, pixelSnap: e.target.checked })
                  }
                  className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
                />
                <span>Pixel Snap Downscale</span>
              </label>

              <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                <span>Detected Scale:</span>
                <span className="font-mono text-amber-400 font-semibold">{detectedScale}x</span>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                <span>Manual Scale Override:</span>
                <select
                  value={settings.scaleOverride}
                  onChange={(e) =>
                    onChangeSettings({
                      ...settings,
                      scaleOverride: parseInt(e.target.value, 10),
                    })
                  }
                  className="bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 font-mono"
                >
                  <option value={0}>Auto ({detectedScale}x)</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                  <option value={6}>6x</option>
                  <option value={8}>8x</option>
                  <option value={16}>16x</option>
                  <option value={32}>32x</option>
                </select>
              </div>
            </div>

            {/* 3. Palette Lock */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-800">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={settings.paletteLock}
                  onChange={(e) =>
                    onChangeSettings({ ...settings, paletteLock: e.target.checked })
                  }
                  className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
                />
                <span>Palette Lock (Profile Swatches)</span>
              </label>
              <span className="text-[10px] text-zinc-500 block">
                Maps every pixel to closest color in {profile.name} palette
              </span>
            </div>

            {/* 4. Remove Stray Pixels */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-800">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={settings.removeStrayPixels}
                  onChange={(e) =>
                    onChangeSettings({ ...settings, removeStrayPixels: e.target.checked })
                  }
                  className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
                />
                <span>Remove Stray Pixels</span>
              </label>
              <span className="text-[10px] text-zinc-500 block">
                Deletes isolated single pixels and snaps semi-transparent alpha
              </span>
            </div>

            {/* 5. Animation Slicing & Baseline Alignment */}
            {config.type === 'animation' && (
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settings.sliceFrames}
                    onChange={(e) =>
                      onChangeSettings({ ...settings, sliceFrames: e.target.checked })
                    }
                    className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
                  />
                  <span>Slice & Align Frames</span>
                </label>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-0.5">Frame Count</span>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={settings.frameCountOverride || config.frameCount}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          frameCountOverride: parseInt(e.target.value, 10) || 1,
                        })
                      }
                      className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-0.5">Baseline Y</span>
                    <input
                      type="number"
                      min={-1}
                      max={config.frameHeight}
                      value={settings.baselineY}
                      onChange={(e) =>
                        onChangeSettings({
                          ...settings,
                          baselineY: parseInt(e.target.value, 10),
                        })
                      }
                      placeholder="Auto"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                </div>
                <span className="text-[10px] text-zinc-500 block">
                  Re-centers character horizontally and pins feet to baseline Y
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
