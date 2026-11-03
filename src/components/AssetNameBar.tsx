import React, { useEffect, useState } from 'react';
import { Check, Loader2, Save, AlertCircle } from 'lucide-react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AssetNameBarProps {
  name: string;
  onRename: (name: string) => void;
  onSaveToLibrary: () => void;
  saveStatus: SaveStatus;
  isInLibrary: boolean;
  modelUsed?: string | null;
  canSave: boolean;
}

/**
 * Header strip shown above the Raw vs Cleaned view, the Animation Player and the
 * background preview: rename field, save status, manual "Save to Library" and the model used.
 */
export const AssetNameBar: React.FC<AssetNameBarProps> = ({
  name,
  onRename,
  onSaveToLibrary,
  saveStatus,
  isInLibrary,
  modelUsed,
  canSave,
}) => {
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = () => {
    const cleaned = draft
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-.]/g, '');
    if (!cleaned) {
      setDraft(name);
      return;
    }
    if (cleaned !== name) onRename(cleaned);
    else setDraft(name);
  };

  return (
    <div className="h-10 bg-zinc-900/60 border-b border-zinc-800 px-3 flex items-center gap-2 text-xs select-none shrink-0">
      <label htmlFor="asset-name-input" className="text-zinc-500 text-[11px]">
        Name
      </label>
      <input
        id="asset-name-input"
        data-testid="asset-rename-input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-48 bg-zinc-950 border border-zinc-700 rounded px-2 py-0.5 font-mono text-zinc-100 focus:border-amber-500 focus:outline-none"
        title="Rename asset (Enter to apply)"
      />

      <span className="min-w-[64px] flex items-center gap-1" data-testid="save-status">
        {saveStatus === 'saving' && (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
            <span className="text-zinc-400">Saving…</span>
          </>
        )}
        {saveStatus === 'saved' && (
          <>
            <Check className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400">Saved</span>
          </>
        )}
        {saveStatus === 'error' && (
          <>
            <AlertCircle className="w-3 h-3 text-red-400" />
            <span className="text-red-400">Save failed</span>
          </>
        )}
        {saveStatus === 'idle' && !isInLibrary && canSave && <span className="text-zinc-500">Not saved</span>}
      </span>

      <button
        onClick={onSaveToLibrary}
        disabled={!canSave || saveStatus === 'saving'}
        className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        title="Save the current asset to the library"
      >
        <Save className="w-3 h-3 text-amber-400" />
        <span>Save to Library</span>
      </button>

      {modelUsed && (
        <span className="ml-auto font-mono text-[10px] text-zinc-500 truncate" title="Model that produced this asset">
          model: <span className="text-zinc-300">{modelUsed}</span>
        </span>
      )}
    </div>
  );
};
