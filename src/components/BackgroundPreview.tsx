import React, { useState, useEffect, useRef } from 'react';
import { ParallaxLayer } from '../types';
import { Play, Pause, Eye, EyeOff, Layers, Sliders, RefreshCw } from 'lucide-react';

interface BackgroundPreviewProps {
  backgroundImage: string;
  width: number;
  height: number;
  isSeamless: boolean;
  parallaxLayers?: ParallaxLayer[];
}

export const BackgroundPreview: React.FC<BackgroundPreviewProps> = ({
  backgroundImage,
  width,
  height,
  isSeamless,
  parallaxLayers,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [scrollSpeed, setScrollSpeed] = useState(30); // px per second
  const [showSeamMarker, setShowSeamMarker] = useState(true);
  const [zoom, setZoom] = useState(2);
  const [viewMode, setViewMode] = useState<'tiling' | 'parallax'>(
    parallaxLayers && parallaxLayers.length > 0 ? 'parallax' : 'tiling'
  );

  const [scrollX, setScrollX] = useState(0);
  const lastTimeRef = useRef<number>(performance.now());
  const reqIdRef = useRef<number | null>(null);

  // Animation frame loop for continuous smooth scrolling
  useEffect(() => {
    if (!isPlaying) return;

    const animate = (time: number) => {
      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      setScrollX((prev) => {
        const next = prev + scrollSpeed * dt;
        return next % (width || 320);
      });

      reqIdRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = performance.now();
    reqIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    };
  }, [isPlaying, scrollSpeed, width]);

  const hasParallax = parallaxLayers && parallaxLayers.length > 0;

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
      {/* Viewport Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col items-center justify-center min-h-[320px] relative overflow-hidden">
        {/* Viewport Frame with pixelated rendering */}
        <div
          className="relative border border-zinc-700/80 rounded shadow-2xl overflow-hidden"
          style={{
            width: `${Math.min(800, width * zoom)}px`,
            height: `${height * zoom}px`,
            backgroundColor: '#09090b',
          }}
        >
          {viewMode === 'tiling' || !hasParallax ? (
            /* Seamless Tiling View */
            <div
              className="absolute inset-0 flex"
              style={{
                width: `${width * zoom * 3}px`,
                transform: `translateX(-${(scrollX % width) * zoom}px)`,
                willChange: 'transform',
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="relative shrink-0"
                  style={{
                    width: `${width * zoom}px`,
                    height: `${height * zoom}px`,
                  }}
                >
                  <img
                    src={backgroundImage}
                    alt="Background tile"
                    style={{
                      width: `${width * zoom}px`,
                      height: `${height * zoom}px`,
                      imageRendering: 'pixelated',
                    }}
                    className="block"
                  />
                  {/* Seam line indicator */}
                  {showSeamMarker && (
                    <div className="absolute top-0 bottom-0 right-0 w-[1px] bg-red-500/60 z-10">
                      <span className="absolute top-1 right-1 text-[8px] font-mono text-red-400 bg-black/70 px-1 rounded">
                        Seam
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Multi-layer Parallax View */
            <div className="absolute inset-0 overflow-hidden">
              {parallaxLayers!.map((layer, idx) => {
                const layerOffset = (scrollX * layer.speed) % width;
                return (
                  <div
                    key={idx}
                    className="absolute inset-0 flex"
                    style={{
                      width: `${width * zoom * 3}px`,
                      transform: `translateX(-${layerOffset * zoom}px)`,
                      willChange: 'transform',
                    }}
                  >
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="relative shrink-0"
                        style={{
                          width: `${width * zoom}px`,
                          height: `${height * zoom}px`,
                        }}
                      >
                        <img
                          src={layer.image}
                          alt={layer.name}
                          style={{
                            width: `${width * zoom}px`,
                            height: `${height * zoom}px`,
                            imageRendering: 'pixelated',
                          }}
                          className="block"
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Viewport Info */}
        <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
          <span className="font-mono bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
            {width}×{height} px
          </span>
          <span>{isSeamless ? 'Seamless Horizontal Wrap' : 'Single Pane'}</span>
          {hasParallax && (
            <span className="text-amber-400 font-mono">
              {parallaxLayers!.length} Parallax Layers
            </span>
          )}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
        {/* Play/Pause & Speed */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded flex items-center gap-1.5 text-xs transition"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause Scroll</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Scroll</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Speed:</span>
            <input
              type="range"
              min={0}
              max={120}
              value={scrollSpeed}
              onChange={(e) => setScrollSpeed(parseInt(e.target.value, 10))}
              className="w-24 accent-amber-500"
            />
            <span className="font-mono text-zinc-200 w-10">{scrollSpeed} px/s</span>
          </div>
        </div>

        {/* Mode Switch & Seam Marker */}
        <div className="flex items-center gap-2">
          {hasParallax && (
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs text-zinc-300">
              <button
                onClick={() => setViewMode('tiling')}
                className={`px-2 py-0.5 rounded ${
                  viewMode === 'tiling' ? 'bg-amber-500/20 text-amber-400 font-medium' : ''
                }`}
              >
                Seamless Tiling
              </button>
              <button
                onClick={() => setViewMode('parallax')}
                className={`px-2 py-0.5 rounded ${
                  viewMode === 'parallax' ? 'bg-amber-500/20 text-amber-400 font-medium' : ''
                }`}
              >
                Parallax Layers
              </button>
            </div>
          )}

          <button
            onClick={() => setShowSeamMarker(!showSeamMarker)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition ${
              showSeamMarker
                ? 'bg-zinc-800 border-zinc-700 text-amber-300'
                : 'bg-zinc-950 border-zinc-800 text-zinc-400'
            }`}
            title="Toggle red vertical seam marker"
          >
            {showSeamMarker ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Seam Marker</span>
          </button>

          {/* Zoom Selector */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-xs text-zinc-300">
            {[1, 2, 3].map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                  zoom === z ? 'bg-amber-500/20 text-amber-400 font-semibold' : 'text-zinc-400'
                }`}
              >
                {z}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
