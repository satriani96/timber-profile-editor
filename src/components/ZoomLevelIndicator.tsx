import React from 'react';

interface ZoomLevelIndicatorProps {
  zoom: number;
  onZoomToFit: () => void;
}

const ZoomLevelIndicator: React.FC<ZoomLevelIndicatorProps> = ({ zoom, onZoomToFit }) => {
  return (
    <div
      className="fixed right-4 bottom-4 z-[100] flex items-center gap-2 rounded-lg bg-gray-900/70 px-3 py-1 font-mono text-sm text-white shadow select-none"
      aria-label="Zoom Level"
    >
      <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
      <button
        type="button"
        onClick={onZoomToFit}
        title="Zoom to fit (Home)"
        className="rounded px-1.5 py-0.5 text-xs font-sans hover:bg-white/20"
      >
        Fit
      </button>
    </div>
  );
};

export default ZoomLevelIndicator;
