import React from 'react';

interface ZoomLevelIndicatorProps {
  zoom: number;
}

const ZoomLevelIndicator: React.FC<ZoomLevelIndicatorProps> = ({ zoom }) => {
  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 100,
        background: 'rgba(30,30,30,0.7)',
        color: '#fff',
        borderRadius: 8,
        padding: '4px 12px',
        fontSize: 14,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        userSelect: 'none',
      }}
      aria-label="Zoom Level"
    >
      Zoom: {(zoom * 100).toFixed(0)}%
    </div>
  );
};

export default ZoomLevelIndicator;
