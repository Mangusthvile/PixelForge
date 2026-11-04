import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  RefreshCw,
  Download,
  AlertTriangle,
  Sparkles,
  Cpu,
  ListOrdered,
  Wand2,
  Undo2,
} from 'lucide-react';
import { exportAssetAsGif, downloadBlob } from '../utils/export';
import { LibraryItem } from '../types';

interface AnimationPreviewProps {
  frames: string[];
  fps: number;
  onChangeFps: (fps: number) => void;
  onUpdateFrames: (frames: string[]) => void;
  onEditFrame: (index: number) => void;
  onRegenerateFrame: (index: number) => void;
  isRegenerating: boolean;
  frameWidth: number;
  frameHeight: number;
  assetName: string;
  copyWarning?: string;
  poseNotes?: string[];
  onRetry?: () => void;
  onSwitchToFrameByFrame?: () => void;
  onSelectStrongerModel?: () => void;
  onAutoClean?: () => void;
  isAutoCleaning?: boolean;
  autoCleanMessage?: string | null;
  onUndo?: () => void;
  canUndo?: boolean;
  /** Per-frame size check result, e.g. "2px taller than anchor" (null = fine). */
  frameWarnings?: Array<string | null>;
  /** Fix flagged frames' body height to the anchor's; no indices = all flagged frames. */
  onFixSize?: (indices?: number[]) => void;
}

export const AnimationPreview: React.FC<AnimationPreviewProps> = ({
  frames,
  fps,
  onChangeFps,
  onUpdateFrames,
  onEditFrame,
  onRegenerateFrame,
  isRegenerating,
  frameWidth,
  frameHeight,
  assetName,
  copyWarning,
  poseNotes,
  onRetry,
  onSwitchToFrameByFrame,
  onSelectStrongerModel,
  onAutoClean,
  isAutoCleaning,
  autoCleanMessage,
  onUndo,
  canUndo,
  frameWarnings,
  onFixSize,
}) => {
  const flaggedCount = (frameWarnings || []).filter((w) => w && w !== 'no body pixels found').length;
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(6);
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);

  // Playback timer
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const interval = 1000 / (fps || 8);
    const timer = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, fps, frames.length]);

  // Keep index within bounds
  useEffect(() => {
    if (currentFrameIndex >= frames.length) {
      setCurrentFrameIndex(Math.max(0, frames.length - 1));
    }
  }, [frames.length, currentFrameIndex]);

  const handleStepBack = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => (prev === 0 ? frames.length - 1 : prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
  };

  const handleMoveLeft = (index: number) => {
    if (index <= 0) return;
    const newFrames = [...frames];
    const temp = newFrames[index - 1];
    newFrames[index - 1] = newFrames[index];
    newFrames[index] = temp;
    onUpdateFrames(newFrames);
    setCurrentFrameIndex(index - 1);
  };

  const handleMoveRight = (index: number) => {
    if (index >= frames.length - 1) return;
    const newFrames = [...frames];
    const temp = newFrames[index + 1];
    newFrames[index + 1] = newFrames[index];
    newFrames[index] = temp;
    onUpdateFrames(newFrames);
    setCurrentFrameIndex(index + 1);
  };

  const handleDuplicate = (index: number) => {
    const newFrames = [...frames];
    newFrames.splice(index + 1, 0, frames[index]);
    onUpdateFrames(newFrames);
    setCurrentFrameIndex(index + 1);
  };

  const handleDelete = (index: number) => {
    if (frames.length <= 1) return;
    const newFrames = frames.filter((_, i) => i !== index);
    onUpdateFrames(newFrames);
    setCurrentFrameIndex(Math.min(index, newFrames.length - 1));
  };

  const handleExportGif = async () => {
    setIsExportingGif(true);
    try {
      const mockItem: LibraryItem = {
        id: 'temp',
        name: assetName,
        type: 'animation',
        profileId: '',
        profileName: '',
        prompt: '',
        referencesUsed: [],
        createdAt: '',
        rawImage: '',
        cleanedImage: frames[0],
        frames,
        metadata: {
          frameWidth,
          frameHeight,
          frameCount: frames.length,
          fps,
          baselineY: 0,
        },
      };

      const gifBlob = await exportAssetAsGif(mockItem, fps);
      downloadBlob(gifBlob, `${assetName}.gif`);
    } catch (err) {
      console.error('Failed to export GIF:', err);
    } finally {
      setIsExportingGif(false);
    }
  };

  if (!frames || frames.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
        No frames available to preview.
      </div>
    );
  }

  const currentPoseNote =
    poseNotes && poseNotes[currentFrameIndex] ? poseNotes[currentFrameIndex] : null;

  return (
    <div className="flex-1 flex flex-col p-4 space-y-3.5 overflow-y-auto">
      {/* Copy Detection Warning Banner */}
      {copyWarning && (
        <div className="p-3 bg-amber-500/15 border border-amber-500/50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
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
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded text-[11px] flex items-center gap-1 transition"
              >
                <ListOrdered className="w-3 h-3 text-amber-400" />
                <span>Switch to Frame by frame</span>
              </button>
            )}
            {onSelectStrongerModel && (
              <button
                onClick={onSelectStrongerModel}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded text-[11px] flex items-center gap-1 transition"
              >
                <Cpu className="w-3 h-3 text-amber-400" />
                <span>Use Gemini 3 Pro</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Player Viewport */}
      <div className="flex flex-col items-center justify-center p-5 bg-zinc-900/80 border border-zinc-800 rounded-lg relative min-h-[250px]">
        {/* Background checkerboard */}
        <div
          className="p-4 rounded border border-zinc-700/60 shadow-lg relative flex items-center justify-center"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#09090b',
            width: `${frameWidth * zoomLevel + 32}px`,
            height: `${frameHeight * zoomLevel + 32}px`,
          }}
        >
          {/* Onion skin: previous frame rendered at 35% opacity */}
          {onionSkin && frames.length > 1 && (
            <img
              src={frames[(currentFrameIndex - 1 + frames.length) % frames.length]}
              alt="Onion skin previous frame"
              style={{
                width: `${frameWidth * zoomLevel}px`,
                height: `${frameHeight * zoomLevel}px`,
                imageRendering: 'pixelated',
                opacity: 0.35,
              }}
              className="object-contain absolute pointer-events-none filter hue-rotate-180"
            />
          )}

          {frames[currentFrameIndex] && (
            <img
              src={frames[currentFrameIndex]}
              alt={`Frame ${currentFrameIndex + 1}`}
              style={{
                width: `${frameWidth * zoomLevel}px`,
                height: `${frameHeight * zoomLevel}px`,
                imageRendering: 'pixelated',
              }}
              className="object-contain relative z-10"
            />
          )}

          {/* Baseline reference marker line */}
          <div className="absolute bottom-4 left-0 right-0 border-b border-dashed border-red-500/30 pointer-events-none z-20" />
        </div>

        {/* Frame Info & Pose Note display */}
        <div className="mt-3 flex flex-col items-center gap-1.5 text-xs text-zinc-400">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-amber-400 font-semibold">
              Frame {currentFrameIndex + 1} / {frames.length}
            </span>
            <span>{frameWidth}×{frameHeight} px</span>
            <button
              onClick={() => setOnionSkin(!onionSkin)}
              className={`text-[11px] px-2 py-0.5 rounded border transition flex items-center gap-1 ${
                onionSkin
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                  : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
              title="Toggle previous frame ghosting to check movement"
            >
              <span className="w-2 h-2 rounded-full border border-current opacity-70" />
              <span>Onion Skin {onionSkin ? 'ON' : 'OFF'}</span>
            </button>
            <div className="flex items-center gap-1 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
              <span className="text-[10px] text-zinc-500">Zoom:</span>
              {[4, 6, 8, 12].map((z) => (
                <button
                  key={z}
                  onClick={() => setZoomLevel(z)}
                  className={`text-[10px] px-1 rounded ${
                    zoomLevel === z ? 'text-amber-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>
          </div>

          {currentPoseNote && (
            <div className="text-[11px] font-mono text-zinc-400 bg-zinc-950/80 px-2.5 py-1 rounded border border-zinc-800 text-center max-w-lg truncate">
              {currentPoseNote}
            </div>
          )}
        </div>
      </div>

      {/* Transport Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleStepBack}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 transition"
            title="Previous Frame"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded flex items-center gap-1.5 text-xs transition"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>
          <button
            onClick={handleStepForward}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded border border-zinc-700 transition"
            title="Next Frame"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* FPS Slider (Default 8) */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-400">Speed:</span>
          <input
            type="range"
            min={1}
            max={24}
            value={fps}
            onChange={(e) => onChangeFps(parseInt(e.target.value, 10))}
            className="w-28 accent-amber-500"
          />
          <span className="text-xs font-mono text-amber-400 font-semibold w-12">
            {fps} FPS
          </span>
        </div>

        {/* Export Animated GIF */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportGif}
            disabled={isExportingGif}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition"
            title="Export animation as looping GIF"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>{isExportingGif ? 'Encoding GIF...' : 'Export GIF'}</span>
          </button>
        </div>
      </div>

      {/* Filmstrip Frame Timeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-300">
            Frames Filmstrip ({frames.length})
          </span>
          <div className="flex items-center gap-2">
            {onUndo && (
              <button
                onClick={onUndo}
                disabled={!canUndo}
                data-testid="frames-undo"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Undo the last frame edit"
              >
                <Undo2 className="w-3 h-3" />
                <span>Undo</span>
              </button>
            )}
            {onFixSize && flaggedCount > 0 && (
              <button
                onClick={() => onFixSize()}
                disabled={isAutoCleaning}
                data-testid="fix-sizes"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-300 hover:bg-amber-500/25 disabled:opacity-50"
                title="Move flagged frames up or down so their feet line up with the anchor's baseline. Never resizes. Asks first; undoable."
              >
                <span>Fix sizes: align feet ({flaggedCount})</span>
              </button>
            )}
            {onAutoClean && (
              <button
                onClick={onAutoClean}
                disabled={isAutoCleaning}
                data-testid="auto-clean"
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[11px] text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                title="Remove orphan outline pixels and specks, fill pinholes, on every frame (undoable)"
              >
                <Wand2 className="w-3 h-3" />
                <span>{isAutoCleaning ? 'Cleaning…' : 'Auto Clean'}</span>
              </button>
            )}
          </div>
        </div>
        {autoCleanMessage && (
          <div data-testid="auto-clean-message" className="text-[11px] text-emerald-300/90">
            {autoCleanMessage}
          </div>
        )}

        <div className="flex items-center gap-2.5 overflow-x-auto pb-2.5 pt-1">
          {frames.map((frame, idx) => {
            const isSelected = idx === currentFrameIndex;
            return (
              <div
                key={idx}
                onClick={() => {
                  setCurrentFrameIndex(idx);
                  setIsPlaying(false);
                }}
                className={`group shrink-0 rounded-lg p-2 flex flex-col items-center gap-1.5 border transition cursor-pointer ${
                  isSelected
                    ? 'bg-amber-950/20 border-amber-500/70 shadow-md ring-1 ring-amber-500/40'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* Frame Index Badge & Redo button */}
                <div className="flex items-center justify-between w-full text-[10px] text-zinc-500">
                  <span className="font-mono font-medium">#{idx + 1}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRegenerateFrame(idx);
                    }}
                    disabled={isRegenerating}
                    className="px-1.5 py-0.5 rounded bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 text-[9px] font-semibold flex items-center gap-1 border border-sky-500/30 transition disabled:opacity-50"
                    title="Redo this cell using neighbors and pose note"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    <span>Redo</span>
                  </button>
                </div>

                {/* Frame Thumbnail */}
                <div
                  className="w-16 h-16 rounded border border-zinc-800 flex items-center justify-center p-1 bg-zinc-950"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                    backgroundSize: '8px 8px',
                    backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                  }}
                >
                  <img
                    src={frame}
                    alt={`Frame ${idx + 1}`}
                    className="max-w-full max-h-full object-contain [image-rendering:pixelated]"
                  />
                </div>

                {/* Size check badge */}
                {frameWarnings?.[idx] && (
                  <span
                    data-testid={`size-warning-${idx}`}
                    className="max-w-[84px] text-center text-[9px] leading-tight px-1 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300"
                    title="Body height compared to the profile Anchor (tools ignored)"
                  >
                    {frameWarnings[idx]}
                    {onFixSize && frameWarnings[idx] !== 'no body pixels found' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onFixSize([idx]);
                        }}
                        disabled={isAutoCleaning}
                        data-testid={`fix-size-${idx}`}
                        className="ml-1 underline font-semibold hover:text-amber-100 disabled:opacity-50"
                        title="Move this frame up or down so its feet line up with the anchor's baseline. Never resizes. Asks first; undoable."
                      >
                        Fix
                      </button>
                    )}
                  </span>
                )}

                {/* Frame Action Toolbar */}
                <div className="flex items-center gap-1 pt-0.5 opacity-90 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveLeft(idx);
                    }}
                    disabled={idx === 0}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-20"
                    title="Move Left"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFrame(idx);
                    }}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-amber-300"
                    title="Edit in Pixel Editor"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(idx);
                    }}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                    title="Duplicate Frame"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {frames.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(idx);
                      }}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400"
                      title="Delete Frame"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveRight(idx);
                    }}
                    disabled={idx === frames.length - 1}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-20"
                    title="Move Right"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
