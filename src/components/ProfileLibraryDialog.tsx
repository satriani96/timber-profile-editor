import React, { useEffect, useMemo, useState } from 'react';
import type { ProfileSheetListItem } from '../netsuite/profileSheet';

interface ProfileLibraryDialogProps {
  mode: 'open' | 'save';
  sheets: ProfileSheetListItem[];
  currentId?: string | null;
  busy?: boolean;
  error?: string | null;
  onPick: (sheet: ProfileSheetListItem) => void;
  onClose: () => void;
}

const ProfileLibraryDialog: React.FC<ProfileLibraryDialogProps> = ({
  mode,
  sheets,
  currentId,
  busy,
  error,
  onPick,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [drawingsOnly, setDrawingsOnly] = useState(mode === 'open');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (drawingsOnly && !sheet.hasDxf) return false;
      if (!needle) return true;
      return (sheet.name || `Sheet ${sheet.id}`).toLowerCase().includes(needle) || sheet.id.includes(needle);
    });
  }, [drawingsOnly, query, sheets]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onMouseDown={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-library-title"
        className="flex max-h-[36rem] w-[28rem] flex-col rounded-lg bg-white text-sm text-gray-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-5 pt-5 pb-3">
          <h2 id="profile-library-title" className="text-base font-semibold">
            {mode === 'open' ? 'Open Profile Sheet' : 'Save to Profile Sheet'}
          </h2>
          <p className="mt-1 text-gray-600">
            {mode === 'open'
              ? 'Sheets that already have a drawing. Creating a new sheet is not available yet.'
              : 'Save this drawing onto an existing sheet. Creating a new sheet is not available yet.'}
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name"
            autoFocus
            className="mt-3 w-full rounded border border-gray-300 px-2 py-1"
          />
          <label className="mt-2 flex items-center gap-2 text-gray-700">
            <input type="checkbox" checked={drawingsOnly} onChange={(e) => setDrawingsOnly(e.target.checked)} />
            Only sheets with a drawing
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="px-5 py-3 text-red-700">{error}</p>}
          {!error && busy && sheets.length === 0 && <p className="px-5 py-6 text-center text-gray-500">Loading…</p>}
          {!error && !busy && rows.length === 0 && (
            <p className="px-5 py-6 text-center text-gray-500">No profile sheets match.</p>
          )}
          <ul>
            {rows.map((sheet) => {
              const current = sheet.id === currentId;
              return (
                <li key={sheet.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(sheet)}
                    className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-gray-100 disabled:opacity-50 ${
                      current ? 'bg-amber-50' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{sheet.name || `Sheet ${sheet.id}`}</span>
                      {current && <span className="text-xs text-amber-800">Current</span>}
                    </span>
                    <span className={`shrink-0 text-xs ${sheet.hasDxf ? 'text-green-700' : 'text-gray-400'}`}>
                      {sheet.hasDxf ? 'Drawing' : 'Empty'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex justify-end border-t border-gray-200 px-5 py-3">
          <button type="button" className="rounded px-3 py-1 text-gray-600 hover:bg-gray-100" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileLibraryDialog;
