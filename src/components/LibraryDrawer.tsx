import React, { useState } from 'react';
import {
  LibraryItem,
  AssetType,
  StyleProfile,
} from '../types';
import {
  Download,
  Trash2,
  Edit2,
  RotateCcw,
  Film,
  Box,
  Layers,
  Image as ImageIcon,
  Flame,
  CheckSquare,
  Square,
  Sparkles,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Archive,
  Upload,
  Brush,
} from 'lucide-react';
import {
  downloadDataUrl,
  exportAssetAsGif,
  exportFramesZip,
  exportMultipleAssetsZip,
  downloadBlob,
  exportForTouchUp,
} from '../utils/export';

interface LibraryDrawerProps {
  items: LibraryItem[];
  profiles: StyleProfile[];
  onSelectAndOpenItem: (item: LibraryItem) => void;
  onGenerateAgainWithChanges: (item: LibraryItem) => void;
  onDeleteItem: (id: string) => void;
  onRenameItem: (id: string, newName: string) => void;
  onImportFiles: (files: File[]) => void;
}

export const LibraryDrawer: React.FC<LibraryDrawerProps> = ({
  items,
  profiles,
  onSelectAndOpenItem,
  onGenerateAgainWithChanges,
  onDeleteItem,
  onRenameItem,
  onImportFiles,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProfile, setFilterProfile] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [isExportingZip, setIsExportingZip] = useState(false);

  // Filter items
  const filtered = items.filter((item) => {
    if (filterType !== 'all' && item.type !== filterType) return false;
    if (filterProfile !== 'all' && item.profileId !== filterProfile) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  };

  const handleStartRename = (item: LibraryItem) => {
    setRenamingId(item.id);
    setRenameText(item.name);
  };

  const handleSaveRename = (id: string) => {
    if (renameText.trim()) {
      onRenameItem(id, renameText.trim());
    }
    setRenamingId(null);
  };

  const handleExportSelectedZip = async () => {
    const chosen = items.filter((i) => selectedIds.has(i.id));
    if (chosen.length === 0) return;

    setIsExportingZip(true);
    try {
      const zipBlob = await exportMultipleAssetsZip(chosen);
      downloadBlob(zipBlob, `pixelforge_assets_manifest.zip`);
    } catch (err) {
      console.error('Failed to export selected ZIP:', err);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleTouchUpExport = async (chosen: LibraryItem[]) => {
    try {
      await exportForTouchUp(chosen);
    } catch (err) {
      console.error('Failed to export for touch-up:', err);
    }
  };

  const handleExportSingleGif = async (item: LibraryItem) => {
    try {
      const gifBlob = await exportAssetAsGif(item, item.metadata.fps || 8);
      downloadBlob(gifBlob, `${item.name}.gif`);
    } catch (err) {
      console.error('Failed to export GIF:', err);
    }
  };

  const handleExportSingleFramesZip = async (item: LibraryItem) => {
    try {
      const zipBlob = await exportFramesZip(item);
      downloadBlob(zipBlob, `${item.name}_frames.zip`);
    } catch (err) {
      console.error('Failed to export frames zip:', err);
    }
  };

  return (
    <div className="bg-zinc-950 border-t border-zinc-800 transition-all select-none">
      {/* Drawer Header Bar */}
      <div className="h-10 px-4 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 hover:text-white"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            <span>ASSET LIBRARY ({items.length})</span>
          </button>

          {/* Quick Filters */}
          <div className="hidden sm:flex items-center gap-2 text-xs">
            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="all">All Types</option>
              <option value="animation">Animations</option>
              <option value="sprite">Sprites</option>
              <option value="prop">Props</option>
              <option value="background">Backgrounds</option>
              <option value="effect">Effects</option>
            </select>

            {/* Profile Filter */}
            <select
              value={filterProfile}
              onChange={(e) => setFilterProfile(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-300 focus:outline-none"
            >
              <option value="all">All Profiles</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Multi-Select & Export Actions */}
        <div className="flex items-center gap-2">
          <label
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer transition"
            title="Add image files (PNG, GIF, WebP, JPG) to the library. A strip of frames matching the current frame size is split into an animation."
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Import</span>
            <input
              type="file"
              multiple
              accept="image/png,image/gif,image/webp,image/jpeg"
              data-testid="library-import-input"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                if (files.length > 0) onImportFiles(files);
              }}
            />
          </label>
          {filtered.length > 0 && (
            <button
              onClick={selectAll}
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
            >
              {selectedIds.size === filtered.length ? (
                <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline">Select All</span>
            </button>
          )}

          {selectedIds.size > 0 && (
            <button
              onClick={() => handleTouchUpExport(items.filter((i) => selectedIds.has(i.id)))}
              data-testid="touchup-export-selected"
              className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs border border-zinc-700 transition"
              title="Download the selected assets as PNG strips named name_WxH_Nf.png, in one ZIP"
            >
              <Brush className="w-3.5 h-3.5 text-amber-400" />
              <span>Export for touch-up ({selectedIds.size})</span>
            </button>
          )}

          {selectedIds.size > 0 && (
            <button
              onClick={handleExportSelectedZip}
              disabled={isExportingZip}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded text-xs transition shadow-sm"
              title="Export selected assets and manifest.json"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Export Selected ({selectedIds.size})</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded Grid Cards */}
      {isExpanded && (
        <div className="p-3 max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-6 text-zinc-600 text-xs">
              No assets in library matching current filters. Generated assets appear here automatically.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {filtered.map((item) => {
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`group bg-zinc-900 border rounded-lg p-2 flex flex-col justify-between transition hover:border-zinc-700 relative ${
                      isSelected
                        ? 'border-amber-500/80 bg-zinc-900/90 shadow-md ring-1 ring-amber-500/30'
                        : 'border-zinc-800'
                    }`}
                  >
                    {/* Checkbox & Type Badge */}
                    <div className="flex items-center justify-between pb-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(item.id);
                        }}
                        className="text-zinc-500 hover:text-amber-400"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <span className="text-[9px] font-mono px-1 py-0.2 bg-zinc-950 rounded text-zinc-400 border border-zinc-800 uppercase">
                        {item.type}
                      </span>
                    </div>

                    {/* Image Preview Thumbnail */}
                    <div
                      onClick={() => onSelectAndOpenItem(item)}
                      className="w-full h-20 rounded border border-zinc-800/80 bg-zinc-950 flex items-center justify-center p-1 cursor-pointer overflow-hidden relative"
                      style={{
                        backgroundImage:
                          'linear-gradient(45deg, #18181b 25%, transparent 25%), linear-gradient(-45deg, #18181b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #18181b 75%), linear-gradient(-45deg, transparent 75%, #18181b 75%)',
                        backgroundSize: '8px 8px',
                        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                      }}
                    >
                      <img
                        src={item.cleanedImage}
                        alt={item.name}
                        className="max-w-full max-h-full object-contain [image-rendering:pixelated]"
                      />
                    </div>

                    {/* Asset Name & Meta */}
                    <div className="pt-1.5 space-y-1">
                      {renamingId === item.id ? (
                        <input
                          type="text"
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onBlur={() => handleSaveRename(item.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(item.id)}
                          className="w-full bg-zinc-950 border border-amber-500 rounded px-1 text-[11px] text-zinc-100 font-mono"
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center justify-between group/title">
                          <span
                            className="text-[11px] font-mono font-medium text-zinc-200 truncate cursor-pointer hover:text-amber-300"
                            onClick={() => onSelectAndOpenItem(item)}
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <button
                            onClick={() => handleStartRename(item)}
                            className="hidden group-hover/title:block text-zinc-500 hover:text-zinc-300"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[9px] text-zinc-500">
                        <span>{item.profileName}</span>
                        <span>
                          {item.metadata.frameWidth}×{item.metadata.frameHeight}
                          {item.type === 'animation' ? ` (${item.metadata.frameCount}f)` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Quick Card Actions */}
                    <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-zinc-400">
                      <div className="flex items-center gap-1">
                        {/* Download Single PNG */}
                        <button
                          onClick={() => downloadDataUrl(item.cleanedImage, `${item.name}.png`)}
                          className="p-1 hover:bg-zinc-800 rounded hover:text-zinc-200"
                          title="Download PNG Sheet"
                        >
                          <Download className="w-3 h-3" />
                        </button>

                        {/* Touch-up handoff strip */}
                        <button
                          onClick={() => handleTouchUpExport([item])}
                          className="p-1 hover:bg-zinc-800 rounded hover:text-amber-400"
                          title="Export for touch-up (PNG strip named name_WxH_Nf.png)"
                        >
                          <Brush className="w-3 h-3" />
                        </button>

                        {/* If Animation: Export GIF */}
                        {item.type === 'animation' && (
                          <button
                            onClick={() => handleExportSingleGif(item)}
                            className="p-1 hover:bg-zinc-800 rounded hover:text-amber-400"
                            title="Download animated GIF"
                          >
                            <Film className="w-3 h-3" />
                          </button>
                        )}

                        {/* Generate Again with changes */}
                        <button
                          onClick={() => onGenerateAgainWithChanges(item)}
                          className="p-1 hover:bg-zinc-800 rounded hover:text-sky-400"
                          title="Load into generator with changes"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1 hover:bg-zinc-800 rounded hover:text-red-400"
                        title="Delete from Library"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
