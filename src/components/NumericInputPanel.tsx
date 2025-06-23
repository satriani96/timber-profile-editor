import React from 'react';
import { SketchTool } from '../types';

interface NumericInputPanelProps {
  isActive: boolean;
  position: { x: number; y: number } | null;
  activeTool: SketchTool;
  activeInput: 'length' | 'angle' | 'width' | 'height' | 'diameter' | 'radius';
  values: {
    length: string;
    angle: string;
    width: string;
    height: string;
    diameter: string;
    radius: string;
  };
  setValues: {
    length: (value: string) => void;
    angle: (value: string) => void;
    width: (value: string) => void;
    height: (value: string) => void;
    diameter: (value: string) => void;
    radius: (value: string) => void;
  };
  refs: {
    length: React.RefObject<HTMLInputElement | null> | React.MutableRefObject<HTMLInputElement | null>;
    angle: React.RefObject<HTMLInputElement | null> | React.MutableRefObject<HTMLInputElement | null>;
    width: React.RefObject<HTMLInputElement | null> | React.MutableRefObject<HTMLInputElement | null>;
    height: React.RefObject<HTMLInputElement | null> | React.MutableRefObject<HTMLInputElement | null>;
    diameter: React.RefObject<HTMLInputElement | null> | React.MutableRefObject<HTMLInputElement | null>;
    radius: React.RefObject<HTMLInputElement | null> | React.MutableRefObject<HTMLInputElement | null>;
  };
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const NumericInputPanel: React.FC<NumericInputPanelProps> = ({
  isActive,
  position,
  activeTool,
  activeInput,
  values,
  setValues,
  refs,
  onKeyDown,
}) => {
  if (!isActive || !position) {
    return null;
  }

  return (
    <div
      className="absolute bg-white border border-gray-400 rounded-md shadow-lg p-2 flex flex-col gap-2"
      style={{ left: position.x, top: position.y }}
    >
      {/* Line tool inputs */}
      {activeTool === 'line' && (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor="length-input" className="font-mono text-sm">L:</label>
            <input
              id="length-input"
              ref={refs.length}
              type="text"
              value={values.length}
              onChange={(e) => setValues.length(e.target.value)}
              onKeyDown={onKeyDown}
              className={`w-24 border px-1 rounded-sm ${activeInput === 'length' ? 'border-blue-500' : 'border-gray-300'}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="angle-input" className="font-mono text-sm">A:</label>
            <input
              id="angle-input"
              ref={refs.angle}
              type="text"
              value={values.angle}
              onChange={(e) => setValues.angle(e.target.value)}
              onKeyDown={onKeyDown}
              className={`w-24 border px-1 rounded-sm ${activeInput === 'angle' ? 'border-blue-500' : 'border-gray-300'}`}
            />
          </div>
        </>
      )}

      {/* Square tool inputs */}
      {activeTool === 'square' && (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor="width-input" className="font-mono text-sm">W:</label>
            <input
              id="width-input"
              ref={refs.width}
              type="text"
              value={values.width}
              onChange={(e) => setValues.width(e.target.value)}
              onKeyDown={onKeyDown}
              className={`w-24 border px-1 rounded-sm ${activeInput === 'width' ? 'border-blue-500' : 'border-gray-300'}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="height-input" className="font-mono text-sm">H:</label>
            <input
              id="height-input"
              ref={refs.height}
              type="text"
              value={values.height}
              onChange={(e) => setValues.height(e.target.value)}
              onKeyDown={onKeyDown}
              className={`w-24 border px-1 rounded-sm ${activeInput === 'height' ? 'border-blue-500' : 'border-gray-300'}`}
            />
          </div>
        </>
      )}

      {/* Circle tool input */}
      {activeTool === 'circle' && (
        <div>
          {activeInput === 'diameter' && (
            <div>
              <label htmlFor="diameter-input" className="font-medium text-sm mr-2">
                Diameter (mm):
              </label>
              <input
                id="diameter-input"
                ref={refs.diameter}
                value={values.diameter}
                onChange={(e) => setValues.diameter(e.target.value)}
                onKeyDown={onKeyDown}
                type="number"
                min="0.01"
                step="0.01"
                className="border p-1 rounded-sm text-sm"
                style={{ width: '80px' }}
                autoFocus
              />
            </div>
          )}
        </div>
      )}

      {/* Fillet tool input */}
      {activeTool === 'fillet' && (
        <div>
          <label htmlFor="radius-input" className="font-medium text-sm mr-2">
            Fillet Radius (mm):
          </label>
          <input
            id="radius-input"
            ref={refs.radius}
            value={values.radius}
            onChange={(e) => setValues.radius(e.target.value)}
            onKeyDown={onKeyDown}
            type="number"
            min="0.01"
            step="0.01"
            className="border p-1 rounded-sm text-sm"
            style={{ width: '80px' }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
};

export default NumericInputPanel;
