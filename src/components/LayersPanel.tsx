import { useState } from 'react';
import paper from 'paper';
import type { SketchHistory } from '../canvas/history';
import {
  PROFILE_LAYER,
  addLayer,
  countLayerItems,
  deleteLayer,
  moveSelectionToLayer,
  renameLayer,
  setActiveLayer,
  setLayerColor,
  setLayerVisible,
} from '../canvas/layers';
import { useLayers } from './sketch/useLayers';

interface LayersPanelProps {
  history: SketchHistory;
}

export default function LayersPanel({ history }: LayersPanelProps) {
  const { layers, activeLayer } = useLayers();
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const afterChange = () => paper.view?.update();

  const beginRename = (name: string) => {
    if (name === PROFILE_LAYER) return;
    setEditing(name);
    setDraft(name);
  };

  const commitRename = () => {
    if (!editing) return;
    const next = draft.trim();
    if (next && next !== editing) {
      history.checkpoint();
      renameLayer(editing, next);
      afterChange();
    }
    setEditing(null);
  };

  return (
    <div className="absolute right-2 top-14 z-20 w-52 select-none rounded border border-gray-700 bg-gray-800/95 text-xs text-gray-200 shadow-lg">
      <button
        type="button"
        className="flex w-full items-center justify-between px-2 py-1.5 font-medium text-gray-100 hover:bg-gray-700/60"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Layers</span>
        <span aria-hidden className="text-[10px] text-gray-400">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <>
          <ul className="max-h-56 overflow-y-auto border-t border-gray-700">
            {layers.map((layer) => {
              const active = layer.name === activeLayer;
              return (
                <li
                  key={layer.name}
                  className={`flex items-center gap-1 px-1.5 py-0.5 ${active ? 'bg-blue-700/50' : 'hover:bg-gray-700/50'}`}
                >
                  <button
                    type="button"
                    title={layer.visible ? 'Hide layer' : 'Show layer'}
                    className={`h-5 w-5 shrink-0 rounded text-[11px] ${layer.visible ? 'text-gray-100' : 'text-gray-500'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      history.checkpoint();
                      setLayerVisible(layer.name, !layer.visible);
                      afterChange();
                    }}
                  >
                    {layer.visible ? '👁' : '–'}
                  </button>
                  <input
                    type="color"
                    title={`${layer.name} colour`}
                    value={layer.color}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      history.checkpoint();
                      setLayerColor(layer.name, e.target.value);
                      afterChange();
                    }}
                  />
                  {editing === layer.name ? (
                    <input
                      autoFocus
                      value={draft}
                      className="min-w-0 flex-1 rounded border border-blue-400 bg-gray-900 px-1 py-0 text-xs text-white"
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate px-0.5 text-left ${active ? 'font-semibold text-white' : ''}`}
                      onClick={() => setActiveLayer(layer.name)}
                      onDoubleClick={() => beginRename(layer.name)}
                      title={layer.name === PROFILE_LAYER ? layer.name : `${layer.name} (double-click to rename)`}
                    >
                      {layer.name}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-1 border-t border-gray-700 px-1.5 py-1">
            <button
              type="button"
              title="Add layer"
              className="rounded px-1.5 py-0.5 hover:bg-gray-700"
              onClick={() => {
                history.checkpoint();
                addLayer();
                afterChange();
              }}
            >
              +
            </button>
            <button
              type="button"
              title="Delete active layer"
              className="rounded px-1.5 py-0.5 hover:bg-gray-700 disabled:opacity-30"
              disabled={activeLayer === PROFILE_LAYER}
              onClick={() => {
                if (activeLayer === PROFILE_LAYER) return;
                const n = countLayerItems(activeLayer);
                if (n > 0 && !window.confirm(`Delete layer "${activeLayer}" and move ${n} item${n === 1 ? '' : 's'} to Profile?`)) {
                  return;
                }
                history.checkpoint();
                deleteLayer(activeLayer);
                afterChange();
              }}
            >
              −
            </button>
            <button
              type="button"
              title="Move selection to active layer"
              className="ml-auto rounded px-1.5 py-0.5 hover:bg-gray-700"
              onClick={() => {
                history.checkpoint();
                moveSelectionToLayer(activeLayer);
                afterChange();
              }}
            >
              Move sel.
            </button>
          </div>
        </>
      )}
    </div>
  );
}
