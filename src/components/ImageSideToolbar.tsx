import React from 'react';

interface ImageSideToolbarProps {
  hasImage: boolean;
  imageVisible: boolean;
  onToggleImage: () => void;
  onDeleteImage: () => void;
  onStartCalibrate: () => void;
  calibrateActive: boolean;
  onStartMeasure: () => void;
  measureActive: boolean;
  onClearMeasurements: () => void;
}

const ImageSideToolbar: React.FC<ImageSideToolbarProps> = ({
  hasImage,
  imageVisible,
  onToggleImage,
  onDeleteImage,
  onStartCalibrate,
  calibrateActive,
  onStartMeasure,
  measureActive,
  onClearMeasurements,
}) => {
  if (!hasImage) return null;
  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-3 bg-white/90 rounded-lg shadow px-2 py-3 border border-gray-200">
      <button
        title={imageVisible ? 'Hide Image' : 'Show Image'}
        className={`w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 ${imageVisible ? '' : 'opacity-50'}`}
        onClick={onToggleImage}
      >
        {/* Eye icon */}
        <span role="img" aria-label="toggle image">{imageVisible ? '👁️' : '🚫'}</span>
      </button>
      <button
        title="Delete Image"
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-100 text-red-600"
        onClick={onDeleteImage}
      >
        {/* Trash icon */}
        <span role="img" aria-label="delete">🗑️</span>
      </button>
      <button
        title="Calibrate Image"
        className={`w-8 h-8 flex items-center justify-center rounded hover:bg-blue-100 ${calibrateActive ? 'bg-blue-200' : ''}`}
        onClick={onStartCalibrate}
      >
        {/* Ruler icon */}
        <span role="img" aria-label="calibrate">📏</span>
      </button>
      <button
        title="Measure Distance"
        className={`w-8 h-8 flex items-center justify-center rounded hover:bg-rose-100 ${measureActive ? 'bg-rose-200' : ''}`}
        onClick={onStartMeasure}
      >
        {/* Measure icon */}
        <span role="img" aria-label="measure">📐</span>
      </button>
      <button
        title="Clear Measurements"
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600"
        onClick={onClearMeasurements}
      >
        {/* Clear icon */}
        <span role="img" aria-label="clear measurements">🧹</span>
      </button>
    </div>
  );
};

export default ImageSideToolbar;
