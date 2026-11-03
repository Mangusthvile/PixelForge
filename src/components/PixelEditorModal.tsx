import React, { useState, useEffect, useRef } from 'react';
import {
  Pencil,
  Eraser,
  Pipette,
  PaintBucket,
  RotateCcw,
  RotateCw,
  Grid,
  Check,
  X,
  Palette,
} from 'lucide-react';
import { hexToRgb, rgbToHex } from '../utils/pipeline';

interface PixelEditorModalProps {
  initialImage: string; // data URL
  palette: string[]; // profile hex colors
  frameWidth: number;
  frameHeight: number;
  frameIndex?: number;
  onSave: (dataUrl: string, frameIndex?: number) => void;
  onClose: () => void;
}

type Tool = 'pencil' | 'eraser' | 'eyedropper' | 'bucket';

export const PixelEditorModal: React.FC<PixelEditorModalProps> = ({
  initialImage,
  palette,
  frameWidth,
  frameHeight,
  frameIndex,
  onSave,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [selectedColor, setSelectedColor] = useState<string>(palette[0] || '#ffffff');
  const [zoom, setZoom] = useState<number>(16);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);

  // Undo / Redo stack of ImageData
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Initialize canvas from image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = frameWidth;
      canvas.height = frameHeight;
      ctx.clearRect(0, 0, frameWidth, frameHeight);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, frameWidth, frameHeight);

      const initialData = ctx.getImageData(0, 0, frameWidth, frameHeight);
      setHistory([initialData]);
      setHistoryIndex(0);
    };
    img.src = initialImage;
  }, [initialImage, frameWidth, frameHeight]);

  const saveToHistory = (newImageData: ImageData) => {
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(newImageData);
    // Keep max 25 history states
    if (newHist.length > 25) newHist.shift();
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.putImageData(history[newIndex], 0, 0);
      setHistoryIndex(newIndex);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.putImageData(history[newIndex], 0, 0);
      setHistoryIndex(newIndex);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
        e.preventDefault();
      } else if (e.key === 'p') setTool('pencil');
      else if (e.key === 'e') setTool('eraser');
      else if (e.key === 'i') setTool('eyedropper');
      else if (e.key === 'b') setTool('bucket');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  const applyPixelAction = (x: number, y: number, isInitialClick = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (x < 0 || x >= frameWidth || y < 0 || y >= frameHeight) return;

    const imgData = ctx.getImageData(0, 0, frameWidth, frameHeight);
    const pixels = imgData.data;
    const idx = (y * frameWidth + x) * 4;

    if (tool === 'eyedropper') {
      const a = pixels[idx + 3];
      if (a > 0) {
        const hex = rgbToHex(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
        setSelectedColor(hex);
      }
      setTool('pencil');
      return;
    }

    if (tool === 'eraser') {
      pixels[idx + 3] = 0;
      ctx.putImageData(imgData, 0, 0);
      if (isInitialClick) saveToHistory(imgData);
      return;
    }

    if (tool === 'pencil') {
      const rgb = hexToRgb(selectedColor);
      pixels[idx] = rgb.r;
      pixels[idx + 1] = rgb.g;
      pixels[idx + 2] = rgb.b;
      pixels[idx + 3] = 255;
      ctx.putImageData(imgData, 0, 0);
      if (isInitialClick) saveToHistory(imgData);
      return;
    }

    if (tool === 'bucket' && isInitialClick) {
      // Flood fill
      const targetR = pixels[idx];
      const targetG = pixels[idx + 1];
      const targetB = pixels[idx + 2];
      const targetA = pixels[idx + 3];

      const fillRgb = hexToRgb(selectedColor);
      if (
        targetR === fillRgb.r &&
        targetG === fillRgb.g &&
        targetB === fillRgb.b &&
        targetA === 255
      ) {
        return;
      }

      const queue: [number, number][] = [[x, y]];
      const visited = new Uint8Array(frameWidth * frameHeight);

      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        if (cx < 0 || cx >= frameWidth || cy < 0 || cy >= frameHeight) continue;
        const cidx = cy * frameWidth + cx;
        if (visited[cidx]) continue;
        visited[cidx] = 1;

        const pidx = cidx * 4;
        const matches =
          pixels[pidx] === targetR &&
          pixels[pidx + 1] === targetG &&
          pixels[pidx + 2] === targetB &&
          pixels[pidx + 3] === targetA;

        if (matches) {
          pixels[pidx] = fillRgb.r;
          pixels[pidx + 1] = fillRgb.g;
          pixels[pidx + 2] = fillRgb.b;
          pixels[pidx + 3] = 255;

          queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      saveToHistory(imgData);
    }
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const x = Math.floor((clientX / rect.width) * frameWidth);
    const y = Math.floor((clientY / rect.height) * frameHeight);
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsMouseDown(true);
    const { x, y } = getCanvasCoords(e);
    applyPixelAction(x, y, true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isMouseDown) return;
    if (tool === 'pencil' || tool === 'eraser') {
      const { x, y } = getCanvasCoords(e);
      applyPixelAction(x, y, false);
    }
  };

  const handleMouseUp = () => {
    if (isMouseDown && (tool === 'pencil' || tool === 'eraser')) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const currentData = ctx.getImageData(0, 0, frameWidth, frameHeight);
          saveToHistory(currentData);
        }
      }
    }
    setIsMouseDown(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'), frameIndex);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-700 rounded-xl shadow-2xl flex flex-col max-w-3xl w-full overflow-hidden max-h-[90vh]">
        {/* Modal Header */}
        <div className="h-12 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              Pixel Touch-Up Editor
              {frameIndex !== undefined ? ` (Frame #${frameIndex + 1})` : ''}
            </h3>
            <span className="text-xs text-zinc-500 font-mono">
              {frameWidth}×{frameHeight} px
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded text-zinc-300"
              title="Undo (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 rounded text-zinc-300"
              title="Redo (Ctrl+Y)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Editor Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Tool Palette */}
          <div className="w-14 bg-zinc-900 border-r border-zinc-800 p-2 flex flex-col items-center gap-2 shrink-0">
            {(
              [
                { id: 'pencil', icon: Pencil, label: 'Pencil (P)' },
                { id: 'eraser', icon: Eraser, label: 'Eraser (E)' },
                { id: 'eyedropper', icon: Pipette, label: 'Eyedropper (I)' },
                { id: 'bucket', icon: PaintBucket, label: 'Bucket Fill (B)' },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = tool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTool(t.id)}
                  className={`w-10 h-10 rounded flex items-center justify-center transition ${
                    active
                      ? 'bg-amber-500 text-zinc-950 font-bold shadow-md'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                  title={t.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}

            <div className="w-8 border-t border-zinc-800 my-1" />

            {/* Grid toggle */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`w-10 h-10 rounded flex items-center justify-center transition ${
                showGrid
                  ? 'bg-zinc-800 text-amber-400 border border-zinc-700'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Toggle Pixel Grid Overlay"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>

          {/* Center Canvas Area */}
          <div
            className="flex-1 bg-zinc-950 overflow-auto p-8 flex items-center justify-center relative select-none"
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="relative shadow-2xl border border-zinc-700"
              style={{
                width: `${frameWidth * zoom}px`,
                height: `${frameHeight * zoom}px`,
                backgroundImage:
                  'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: '#09090b',
              }}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                style={{
                  width: `${frameWidth * zoom}px`,
                  height: `${frameHeight * zoom}px`,
                  imageRendering: 'pixelated',
                }}
                className="block cursor-crosshair"
              />

              {/* Grid overlay */}
              {showGrid && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`,
                    backgroundSize: `${zoom}px ${zoom}px`,
                  }}
                />
              )}
            </div>
          </div>

          {/* Right Restricted Palette & Zoom */}
          <div className="w-56 bg-zinc-900 border-l border-zinc-800 p-3 space-y-4 flex flex-col shrink-0">
            {/* Active Color Preview */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Active Color
              </label>
              <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                <div
                  className="w-7 h-7 rounded border border-zinc-700 shadow-xs"
                  style={{ backgroundColor: selectedColor }}
                />
                <span className="text-xs font-mono text-zinc-200 uppercase">
                  {selectedColor}
                </span>
              </div>
            </div>

            {/* Profile Restricted Swatches */}
            <div className="space-y-1.5 flex-1 overflow-hidden flex flex-col">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Profile Swatches</span>
                <span className="font-mono text-[10px] text-zinc-500">{palette.length}</span>
              </label>
              <div className="flex-1 overflow-y-auto bg-zinc-950 p-2 rounded border border-zinc-800 grid grid-cols-4 gap-1.5 content-start">
                {palette.map((color) => {
                  const isSelected = selectedColor.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      style={{ backgroundColor: color }}
                      className={`h-7 rounded-sm border transition relative ${
                        isSelected
                          ? 'border-amber-400 ring-2 ring-amber-400/40 scale-105'
                          : 'border-zinc-800 hover:scale-105'
                      }`}
                      title={color}
                    />
                  );
                })}
              </div>
            </div>

            {/* Zoom Slider */}
            <div className="space-y-1 pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Zoom:</span>
                <span className="font-mono text-amber-400">{zoom}x</span>
              </div>
              <input
                type="range"
                min={8}
                max={32}
                step={4}
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-12 bg-zinc-900 border-t border-zinc-800 px-4 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Tip: Use Eyedropper (I) or click swatches to match profile colors.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 transition shadow-md"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
