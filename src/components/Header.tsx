import React from 'react';
import { Sparkles, ShieldCheck, Download, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getModelOption } from '../types';

interface HeaderProps {
  onExportAll: () => void;
  libraryCount: number;
  onResetProfiles: () => void;
  selectedModelId?: string;
  lastUsedModelId?: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  onExportAll,
  libraryCount,
  onResetProfiles,
  selectedModelId,
  lastUsedModelId,
}) => {
  const selectedModel = getModelOption(selectedModelId || 'gemini-3-pro-image');
  const usedModel = lastUsedModelId ? getModelOption(lastUsedModelId) : null;
  const isVerifiedUsed = Boolean(usedModel && usedModel.id === selectedModel.id);

  return (
    <header className="h-14 bg-zinc-950 border-b border-zinc-800 px-4 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-sm tracking-wide text-zinc-100 flex items-center gap-1.5">
              <span>PIXELFORGE</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">STUDIO</span>
            </h1>
            <span className="text-zinc-600 text-xs">•</span>
            <span className="text-xs text-zinc-400 hidden sm:inline">Style-Locked Pixel Art Generator</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          data-testid="header-model-badge"
          className="flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 transition"
          title={
            usedModel
              ? `Currently targeting: ${selectedModel.name} • Last generation used: ${usedModel.name}`
              : `Active Selected Model: ${selectedModel.name} (${selectedModel.badge})`
          }
        >
          {isVerifiedUsed ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="hidden md:inline text-zinc-400">Model:</span>
          <span className="font-mono text-zinc-100 font-semibold">{selectedModel.name}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-amber-400 border border-zinc-700 hidden sm:inline">
            {usedModel ? `Used: ${usedModel.badge.split(' ')[0]}` : selectedModel.badge.split(' ')[0]}
          </span>
        </div>

        {libraryCount > 0 && (
          <button
            onClick={onExportAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
            title="Export all library assets as ZIP with manifest.json"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Export Manifest ({libraryCount})</span>
          </button>
        )}

        <button
          onClick={onResetProfiles}
          className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded transition"
          title="Reset to default built-in Profiles"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
