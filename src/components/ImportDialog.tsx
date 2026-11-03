import React, { useMemo, useState } from 'react';
import { AssetType } from '../types';
import { ImportLayout, maxFramesFor } from '../utils/naming';

export interface ImportRequest {
  fileName: string;
  preview: string; // data URL
  width: number;
  height: number;
  gifFrameCount: number; // 1 for still images
  initial: ImportLayout;
  index: number; // 1-based position in the batch
  total: number;
}

interface ImportDialogProps {
  request: ImportRequest;
  onConfirm: (layout: ImportLayout) => void;
  onSkip: () => void;
}

const TYPE_OPTIONS: Array<{ value: AssetType; label: string }> = [
  { value: 'sprite', label: 'Sprite' },
  { value: 'animation', label: 'Animation' },
  { value: 'background', label: 'Background' },
  { value: 'prop', label: 'Props' },
  { value: 'effect', label: 'Effects' },
];

/** Asks how to store an imported image: type, frame size and frame count. */
export const ImportDialog: React.FC<ImportDialogProps> = ({ request, onConfirm, onSkip }) => {
  const { width, height, gifFrameCount } = request;
  const [type, setType] = useState<AssetType>(request.initial.type);
  const [frameWidth, setFrameWidth] = useState(request.initial.frameWidth);
  const [frameHeight, setFrameHeight] = useState(request.initial.frameHeight);
  const [frameCount, setFrameCount] = useState(request.initial.frameCount);

  // GIF frames are used when the frame size is the whole GIF; otherwise the first frame is sliced.
  const usesGifFrames = gifFrameCount > 1 && frameWidth === width && frameHeight === height;
  const maxFrames = usesGifFrames ? gifFrameCount : maxFramesFor(width, height, frameWidth, frameHeight);

  const error = useMemo(() => {
    if (!(frameWidth >= 1 && frameWidth <= width)) return `Frame width must be 1–${width}.`;
    if (!(frameHeight >= 1 && frameHeight <= height)) return `Frame height must be 1–${height}.`;
    if (!(frameCount >= 1 && frameCount <= maxFrames)) return `Frame count must be 1–${maxFrames} for this frame size.`;
    return null;
  }, [frameWidth, frameHeight, frameCount, maxFrames, width, height]);

  const changeFrameSize = (w: number, h: number) => {
    setFrameWidth(w);
    setFrameHeight(h);
    const isGifSize = gifFrameCount > 1 && w === width && h === height;
    const fitted = isGifSize ? gifFrameCount : maxFramesFor(width, height, w, h);
    if (fitted > 0) setFrameCount(fitted);
  };

  // Preview scaled to at most 320x160, with frame boundaries drawn over it.
  const previewScale = Math.min(320 / width, 160 / height) || 1;
  const showGrid = !usesGifFrames && frameWidth > 0 && frameHeight > 0 && maxFrames > 1;

  const numberInput = (value: number, onChange: (v: number) => void, testId: string, max: number) => (
    <input
      type="number"
      min={1}
      max={max}
      value={Number.isFinite(value) ? value : ''}
      data-testid={testId}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
      className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:border-amber-500 focus:outline-none"
    />
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        data-testid="import-dialog"
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 w-full max-w-md space-y-3 text-sm text-zinc-200"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-zinc-100 truncate">Import {request.fileName}</h3>
          {request.total > 1 && (
            <span className="text-[11px] text-zinc-500 shrink-0">
              {request.index} of {request.total}
            </span>
          )}
        </div>

        <div className="flex justify-center bg-zinc-950 border border-zinc-800 rounded p-2">
          <div className="relative" style={{ width: width * previewScale, height: height * previewScale }}>
            <img
              src={request.preview}
              alt=""
              style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
            />
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(251,191,36,0.7) 1px, transparent 1px), linear-gradient(to bottom, rgba(251,191,36,0.7) 1px, transparent 1px)',
                  backgroundSize: `${frameWidth * previewScale}px ${frameHeight * previewScale}px`,
                }}
              />
            )}
          </div>
        </div>
        <p className="text-[11px] text-zinc-500">
          Image {width}×{height}px
          {gifFrameCount > 1 ? ` • GIF with ${gifFrameCount} frames` : ''}
          {maxFrames > 0 ? ` • fits up to ${maxFrames} frame${maxFrames === 1 ? '' : 's'}` : ''}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 space-y-1">
            <span className="text-[11px] text-zinc-400">Type</span>
            <select
              value={type}
              data-testid="import-type"
              onChange={(e) => setType(e.target.value as AssetType)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-zinc-400">Frame width</span>
            {numberInput(frameWidth, (v) => changeFrameSize(v, frameHeight), 'import-frame-width', width)}
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-zinc-400">Frame height</span>
            {numberInput(frameHeight, (v) => changeFrameSize(frameWidth, v), 'import-frame-height', height)}
          </label>
          <label className="col-span-2 space-y-1">
            <span className="text-[11px] text-zinc-400">Frame count</span>
            {numberInput(frameCount, setFrameCount, 'import-frame-count', Math.max(1, maxFrames))}
          </label>
        </div>

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onSkip}
            className="px-3 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-xs"
          >
            {request.total > 1 ? 'Skip this file' : 'Cancel'}
          </button>
          <button
            disabled={!!error}
            onClick={() => onConfirm({ type, frameWidth, frameHeight, frameCount })}
            className="px-3 py-1.5 rounded bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
};
