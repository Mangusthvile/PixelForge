import React, { useState } from 'react';
import {
  StyleProfile,
  ProfileReference,
} from '../types';
import {
  Plus,
  Copy,
  Trash2,
  Edit2,
  Anchor,
  Upload,
  Download,
  FileJson,
  Palette,
  Check,
  X,
  Sparkles,
  Info,
  RotateCcw,
} from 'lucide-react';
import { extractPaletteFromImageUrl } from '../utils/canvasPipeline';
import { getDefaultProfile } from '../utils/storage';
import { PALETTE_ROLES, PaletteRole, resolvePaletteRoles, AnchorMeasure } from '../utils/autoClean';

const ROLE_LETTER: Record<PaletteRole, string> = { body: 'B', outline: 'O', tool: 'T', effect: 'E' };

interface ProfilePanelProps {
  profiles: StyleProfile[];
  activeProfile: StyleProfile;
  onSelectProfile: (profile: StyleProfile) => void;
  onUpdateProfile: (profile: StyleProfile) => void;
  onCreateProfile: () => void;
  onDuplicateProfile: (profile: StyleProfile) => void;
  onDeleteProfile: (profileId: string) => void;
  onResetProfileToDefaults: (profileId: string) => void;
  /** Anchor measured at true size, for the size check. */
  anchorInfo?: AnchorMeasure | null;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  profiles,
  activeProfile,
  onSelectProfile,
  onUpdateProfile,
  onCreateProfile,
  onDuplicateProfile,
  onDeleteProfile,
  onResetProfileToDefaults,
  anchorInfo,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(activeProfile.name);
  const [newColorInput, setNewColorInput] = useState('#ffffff');
  const [isExtracting, setIsExtracting] = useState(false);

  const handleRenameSubmit = () => {
    if (renameValue.trim()) {
      onUpdateProfile({
        ...activeProfile,
        name: renameValue.trim(),
      });
    }
    setIsRenaming(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const newRef: ProfileReference = {
          id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          url: base64,
          base64: base64,
          label: file.name,
          isAnchor: activeProfile.references.length === 0, // Make anchor if first
        };

        const updatedRefs = [...activeProfile.references, newRef];
        onUpdateProfile({
          ...activeProfile,
          references: updatedRefs,
          anchorId: activeProfile.anchorId || (newRef.isAnchor ? newRef.id : undefined),
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleSetAnchor = (refId: string) => {
    const updated = activeProfile.references.map((r) => ({
      ...r,
      isAnchor: r.id === refId,
    }));
    onUpdateProfile({
      ...activeProfile,
      references: updated,
      anchorId: refId,
    });
  };

  const handleDeleteReference = (refId: string) => {
    const updated = activeProfile.references.filter((r) => r.id !== refId);
    let newAnchorId = activeProfile.anchorId;
    if (newAnchorId === refId) {
      newAnchorId = updated.length > 0 ? updated[0].id : undefined;
      if (updated.length > 0) updated[0].isAnchor = true;
    }
    onUpdateProfile({
      ...activeProfile,
      references: updated,
      anchorId: newAnchorId,
    });
  };

  const handleAddColor = () => {
    if (activeProfile.palette.length >= 32) return;
    const clean = newColorInput.toLowerCase();
    if (!activeProfile.palette.includes(clean)) {
      onUpdateProfile({
        ...activeProfile,
        palette: [...activeProfile.palette, clean],
      });
    }
  };

  const handleRemoveColor = (hex: string) => {
    onUpdateProfile({
      ...activeProfile,
      palette: activeProfile.palette.filter((c) => c !== hex),
    });
  };

  // Clicking a swatch cycles its Auto Clean role: body -> outline -> tool -> effect.
  const roles = resolvePaletteRoles(activeProfile);
  const handleCycleRole = (hex: string) => {
    const key = hex.toLowerCase();
    const current = roles[key] || 'body';
    const next = PALETTE_ROLES[(PALETTE_ROLES.indexOf(current) + 1) % PALETTE_ROLES.length];
    onUpdateProfile({ ...activeProfile, paletteRoles: { ...roles, [key]: next } });
  };

  const handleExtractPalette = async () => {
    if (activeProfile.references.length === 0) return;
    setIsExtracting(true);
    try {
      // Sample colors from active anchor or first 3 references
      const sampleRefs = activeProfile.references.slice(0, 3);
      const combinedColors = new Set<string>();

      for (const ref of sampleRefs) {
        try {
          const colors = await extractPaletteFromImageUrl(ref.url, 24);
          colors.forEach((c) => combinedColors.add(c.toLowerCase()));
        } catch (e) {
          console.warn('Could not extract palette from reference:', ref.url, e);
        }
      }

      if (combinedColors.size > 0) {
        const newPalette = Array.from(combinedColors).slice(0, 32);
        onUpdateProfile({
          ...activeProfile,
          palette: newPalette,
        });
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExportProfileJson = () => {
    const data = JSON.stringify(activeProfile, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profile_${activeProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProfileJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.name && Array.isArray(parsed.palette)) {
          const importedProfile: StyleProfile = {
            ...parsed,
            id: `profile_${Date.now()}`,
            isBuiltIn: false,
            name: `${parsed.name} (Imported)`,
          };
          onUpdateProfile(importedProfile);
        }
      } catch (err) {
        console.error('Failed to import profile JSON:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3.5 space-y-4">
      {/* Profile Header & Selector */}
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
          Style Profile
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportProfileJson}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-amber-400 transition"
            title="Export Profile as JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <label
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-amber-400 transition cursor-pointer"
            title="Import Profile JSON"
          >
            <FileJson className="w-3.5 h-3.5" />
            <input
              type="file"
              accept=".json"
              onChange={handleImportProfileJson}
              className="hidden"
            />
          </label>
          <button
            onClick={onCreateProfile}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-amber-400 transition"
            title="Create New Profile"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDuplicateProfile(activeProfile)}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition"
            title="Duplicate Current Profile"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {getDefaultProfile(activeProfile.id) && (
            <button
              onClick={() => onResetProfileToDefaults(activeProfile.id)}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-amber-400 transition"
              title={`Reset ${activeProfile.name} to defaults`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {profiles.length > 1 && (
            <button
              onClick={() => onDeleteProfile(activeProfile.id)}
              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400 transition"
              title="Delete Profile"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Select Dropdown & Inline Rename */}
      <div className="space-y-1.5">
        {isRenaming ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
              className="flex-1 bg-zinc-950 border border-amber-500/50 rounded px-2.5 py-1 text-xs text-zinc-100 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleRenameSubmit}
              className="p-1 bg-amber-500/20 text-amber-300 rounded hover:bg-amber-500/30"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="p-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              value={activeProfile.id}
              onChange={(e) => {
                const found = profiles.find((p) => p.id === e.target.value);
                if (found) {
                  onSelectProfile(found);
                  setRenameValue(found.name);
                }
              }}
              className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-100 font-medium focus:border-amber-500 focus:outline-none"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isBuiltIn ? '(Built-in)' : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setRenameValue(activeProfile.name);
                setIsRenaming(true);
              }}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded border border-zinc-700 transition"
              title="Rename Profile"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Written Style Description */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-400 flex items-center justify-between">
          <span>Style Description (Sent to Model)</span>
        </label>
        <textarea
          value={activeProfile.description}
          onChange={(e) =>
            onUpdateProfile({
              ...activeProfile,
              description: e.target.value,
            })
          }
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 placeholder-zinc-600 focus:border-amber-500/60 focus:outline-none resize-y"
          placeholder="Detailed art style instructions..."
        />
      </div>

      {/* Target Pixel Settings */}
      <div className="space-y-2 pt-1 border-t border-zinc-800/80">
        <label className="text-[11px] font-medium text-zinc-400 block">
          Target Pixel Settings
        </label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <span className="text-[10px] text-zinc-500 block mb-0.5">Frame W</span>
            <input
              type="number"
              min={8}
              max={1024}
              value={activeProfile.frameWidth}
              onChange={(e) =>
                onUpdateProfile({
                  ...activeProfile,
                  frameWidth: parseInt(e.target.value, 10) || 16,
                })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:border-amber-500/60 focus:outline-none"
            />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 block mb-0.5">Frame H</span>
            <input
              type="number"
              min={8}
              max={1024}
              value={activeProfile.frameHeight}
              onChange={(e) =>
                onUpdateProfile({
                  ...activeProfile,
                  frameHeight: parseInt(e.target.value, 10) || 24,
                })
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:border-amber-500/60 focus:outline-none"
            />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 block mb-0.5">Outline Color</span>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={activeProfile.outlineColor}
                onChange={(e) =>
                  onUpdateProfile({
                    ...activeProfile,
                    outlineColor: e.target.value,
                  })
                }
                className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
              />
              <span className="text-[10px] font-mono text-zinc-400 uppercase truncate">
                {activeProfile.outlineColor}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Color Palette (Max 32 colors) */}
      <div className="space-y-2 pt-1 border-t border-zinc-800/80">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1.5">
            <Palette className="w-3 h-3 text-amber-400" />
            <span>Profile Palette ({activeProfile.palette.length}/32)</span>
          </label>
          <button
            onClick={handleExtractPalette}
            disabled={isExtracting || activeProfile.references.length === 0}
            className="text-[10px] text-amber-400/90 hover:text-amber-300 disabled:opacity-40 flex items-center gap-1 transition"
            title="Automatically extract dominant colors from reference images"
          >
            <Sparkles className="w-3 h-3" />
            <span>{isExtracting ? 'Extracting...' : 'Auto-Extract'}</span>
          </button>
        </div>

        {/* Swatches Grid */}
        <div className="flex flex-wrap gap-1 p-1.5 bg-zinc-950 border border-zinc-800/80 rounded min-h-[44px] max-h-32 overflow-y-auto">
          {activeProfile.palette.map((color) => (
            <div
              key={color}
              onClick={() => handleCycleRole(color)}
              data-testid={`swatch-${color.toLowerCase()}`}
              className="group relative w-6 h-6 rounded-sm border border-zinc-700/60 shadow-xs cursor-pointer hover:scale-110 transition"
              style={{ backgroundColor: color }}
              title={`${color} — role: ${roles[color.toLowerCase()] || 'body'} (click to change)`}
            >
              <span className="absolute bottom-0 right-0 px-[2px] text-[8px] leading-none font-bold font-mono bg-zinc-950/85 text-amber-300 rounded-tl-sm">
                {ROLE_LETTER[roles[color.toLowerCase()] || 'body']}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveColor(color);
                }}
                className="hidden group-hover:flex absolute -top-1 -right-1 w-3 h-3 bg-red-600 text-white rounded-full items-center justify-center text-[8px]"
              >
                ×
              </button>
            </div>
          ))}
          {activeProfile.palette.length === 0 && (
            <span className="text-[10px] text-zinc-600 py-1 px-1">No colors in palette.</span>
          )}
        </div>

        <p className="text-[10px] text-zinc-500 leading-snug">
          Click a swatch to set its Auto Clean role: B body, O outline, T tool, E effect.
        </p>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-300">
          <input
            type="checkbox"
            data-testid="auto-clean-after-generation"
            checked={activeProfile.autoCleanAfterGeneration !== false}
            onChange={(e) => onUpdateProfile({ ...activeProfile, autoCleanAfterGeneration: e.target.checked })}
            className="rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-0"
          />
          <span>Auto Clean after generation</span>
        </label>

        {/* Add Color Input */}
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={newColorInput}
            onChange={(e) => setNewColorInput(e.target.value)}
            className="w-6 h-6 rounded border border-zinc-700 bg-transparent cursor-pointer p-0"
          />
          <input
            type="text"
            value={newColorInput}
            onChange={(e) => setNewColorInput(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 text-xs text-zinc-200 font-mono"
            placeholder="#hex"
          />
          <button
            onClick={handleAddColor}
            disabled={activeProfile.palette.length >= 32}
            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs border border-zinc-700 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* Style Reference Images & Anchor Reference */}
      <div className="space-y-2 pt-1 border-t border-zinc-800/80">
        <p data-testid="anchor-body-height" className="text-[11px] text-zinc-400">
          {anchorInfo && anchorInfo.bodyHeight > 0 ? (
            <>
              Anchor body height: <span className="font-mono text-amber-300">{anchorInfo.bodyHeight}px</span>
              <span className="text-zinc-500">
                {' '}
                (reference at {anchorInfo.scale}x, {anchorInfo.width}×{anchorInfo.height} at true size)
              </span>
            </>
          ) : (
            <span className="text-zinc-500">Anchor body height: not measured (no anchor or no body-role colors)</span>
          )}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-medium text-zinc-400">
              Style References ({activeProfile.references.length})
            </label>
            <div className="group relative">
              <Info className="w-3 h-3 text-zinc-500 cursor-help" />
              <div className="hidden group-hover:block absolute left-0 bottom-full mb-1 w-56 p-2 bg-zinc-950 border border-zinc-700 rounded shadow-xl text-[10px] text-zinc-300 z-50">
                The <span className="text-amber-400 font-semibold">Anchor</span> is sent as the primary reference with instructions to preserve exact character proportions, outline, and colors.
              </div>
            </div>
          </div>
          <label className="cursor-pointer text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition">
            <Upload className="w-3 h-3" />
            <span>Upload</span>
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>

        {/* References List */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {activeProfile.references.map((ref) => {
            const isAnchor = ref.isAnchor || ref.id === activeProfile.anchorId;
            return (
              <div
                key={ref.id}
                className={`flex items-center justify-between p-1.5 rounded border text-xs transition ${
                  isAnchor
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src={ref.url}
                      alt={ref.label || 'Reference'}
                      className="max-w-full max-h-full object-contain [image-rendering:pixelated]"
                    />
                  </div>
                  <div className="truncate">
                    <span className="text-[11px] text-zinc-300 block truncate font-medium">
                      {ref.label || 'Reference Image'}
                    </span>
                    {isAnchor ? (
                      <span className="text-[9px] text-amber-400 font-semibold flex items-center gap-1">
                        <Anchor className="w-2.5 h-2.5" /> Style & Character Anchor
                      </span>
                    ) : (
                      <span className="text-[9px] text-zinc-500">Style reference</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleSetAnchor(ref.id)}
                    className={`p-1 rounded text-xs transition ${
                      isAnchor
                        ? 'text-amber-400 bg-amber-500/20'
                        : 'text-zinc-500 hover:text-amber-400 hover:bg-zinc-800'
                    }`}
                    title={isAnchor ? 'Active Anchor Reference' : 'Set as Style & Character Anchor'}
                  >
                    <Anchor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteReference(ref.id)}
                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
                    title="Remove Reference"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {activeProfile.references.length === 0 && (
            <div className="text-center py-4 border border-dashed border-zinc-800 rounded text-zinc-500 text-xs">
              No reference images yet. Upload images or approve generated results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
