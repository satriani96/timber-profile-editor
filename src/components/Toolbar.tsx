import React from 'react';
import type { SketchTool } from '../types';

interface ToolbarProps {
  activeTool: SketchTool;
  setActiveTool: (tool: SketchTool) => void;
  exportDXF: () => void;
  onImportDXF: (file: File) => void;
  onUploadImage: (file: File) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const ToolButton: React.FC<{
  label: string;
  shortcut?: string;
  isActive: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}> = ({ label, shortcut, isActive, onClick, children }) => (
  <button
    onClick={onClick}
    title={shortcut ? `${label} (${shortcut})` : label}
    aria-pressed={isActive}
    className={`p-2 rounded-md flex items-center justify-center ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
    }`}
  >
    {children}
    <span className="sr-only">{label}</span>
  </button>
);

const Icon: React.FC<{ children: React.ReactNode; filled?: boolean }> = ({ children, filled }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const Divider = () => <div className="w-px h-6 bg-gray-600 mx-1" aria-hidden />;

const FileButton: React.FC<{
  label: string;
  accept: string;
  className: string;
  onFile: (file: File) => void;
  children: React.ReactNode;
}> = ({ label, accept, className, onFile, children }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <button
      onClick={() => inputRef.current?.click()}
      className={`${className} text-white px-3 py-1 rounded-md flex items-center space-x-1`}
      title={label}
    >
      {children}
      <span>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </button>
  );
};

const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  setActiveTool,
  exportDXF,
  onImportDXF,
  onUploadImage,
  onUndo,
  onRedo,
}) => {
  const tool = (id: SketchTool) => ({ isActive: activeTool === id, onClick: () => setActiveTool(id) });

  return (
    <div className="bg-gray-800 text-white p-2 shadow-md flex items-center space-x-1">
      <ToolButton label="Select" shortcut="V" {...tool('select')}>
        <Icon>
          <path d="M4 4l7.5 16 2.5-6.5L20.5 11z" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Move — click a snapped base point, then the destination. Shift constrains to 45°. Tab enters distance/angle."
        shortcut="M"
        {...tool('move')}
      >
        <Icon>
          <path d="M12 3v18" />
          <path d="M3 12h18" />
          <path d="M8 7l4-4 4 4" />
          <path d="M8 17l4 4 4-4" />
          <path d="M7 8l-4 4 4 4" />
          <path d="M17 8l4 4-4 4" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Rotate — click centre, then a reference point, then the new angle. Shift snaps 15°. Tab enters CCW degrees."
        shortcut="Q"
        {...tool('rotate')}
      >
        <Icon>
          <path d="M20 12a8 8 0 11-3.2-6.4" />
          <path d="M20 4v5h-5" />
        </Icon>
      </ToolButton>
      <ToolButton
        label="Mirror — click a straight line, or two snapped points, to copy the selection across that axis. Alt at the commit click moves instead of copying."
        shortcut="I"
        {...tool('mirror')}
      >
        <Icon>
          <path d="M12 3v18" />
          <path d="M10 8L5 12l5 4" />
          <path d="M14 8l5 4-5 4" />
        </Icon>
      </ToolButton>
      <ToolButton label="Line" shortcut="L" {...tool('line')}>
        <Icon>
          <path d="M5 19L19 5" />
          <circle cx="5" cy="19" r="1.5" fill="currentColor" />
          <circle cx="19" cy="5" r="1.5" fill="currentColor" />
        </Icon>
      </ToolButton>
      <ToolButton label="Rectangle" shortcut="R" {...tool('square')}>
        <Icon>
          <rect x="4" y="5" width="16" height="14" rx="1" />
        </Icon>
      </ToolButton>
      <ToolButton label="Circle" shortcut="C" {...tool('circle')}>
        <Icon>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
        </Icon>
      </ToolButton>
      <ToolButton label="Fit Spline" shortcut="S" {...tool('fitspline')}>
        <Icon>
          <path d="M4 19C7 10 17 14 20 5" />
          <circle cx="4" cy="19" r="1.5" fill="currentColor" />
          <circle cx="20" cy="5" r="1.5" fill="currentColor" />
        </Icon>
      </ToolButton>

      <Divider />

      <ToolButton label="Fillet" shortcut="F" {...tool('fillet')}>
        <Icon>
          <path d="M4 20V12a8 8 0 018-8h8" />
          <path d="M4 8V4h4" strokeDasharray="2 2" />
        </Icon>
      </ToolButton>
      <ToolButton label="Trim — remove the hovered stretch up to the nearest intersections" shortcut="T" {...tool('trim')}>
        <Icon>
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M20 4L8.12 15.88" />
          <path d="M14.47 14.48L20 20" />
          <path d="M8.12 8.12L12 12" />
        </Icon>
      </ToolButton>
      <ToolButton label="Split — break the hovered path at its nearest intersections" shortcut="X" {...tool('split')}>
        <Icon>
          <path d="M3 12h6" />
          <path d="M15 12h6" />
          <path d="M9 12l1.5-4M15 12l-1.5 4" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </Icon>
      </ToolButton>
      <ToolButton label="Dimension — measure a length, diameter, or radius" shortcut="D" {...tool('dimension')}>
        <Icon>
          <path d="M4 6v12" />
          <path d="M20 6v12" />
          <path d="M4 12h16" />
          <path d="M7 10l-3 2 3 2" />
          <path d="M17 10l3 2-3 2" />
        </Icon>
      </ToolButton>

      <Divider />

      <ToolButton label="Undo" shortcut="Ctrl+Z" isActive={false} onClick={onUndo}>
        <Icon>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 010 12h-3" />
        </Icon>
      </ToolButton>
      <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" isActive={false} onClick={onRedo}>
        <Icon>
          <path d="M15 14l5-5-5-5" />
          <path d="M20 9H10a6 6 0 000 12h3" />
        </Icon>
      </ToolButton>

      <Divider />

      <FileButton label="Upload Image" accept="image/png,image/jpeg" className="bg-blue-500 hover:bg-blue-700" onFile={onUploadImage}>
        <Icon>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-5-9 8" />
        </Icon>
      </FileButton>

      <div className="flex-grow" />

      <FileButton
        label="Import DXF / TCW"
        accept=".dxf,.tcw,application/dxf,image/vnd.dxf"
        className="bg-gray-600 hover:bg-gray-500"
        onFile={onImportDXF}
      >
        <Icon>
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
          <path d="M8 8l4-4 4 4" />
          <path d="M12 4v12" />
        </Icon>
      </FileButton>
      <button
        onClick={exportDXF}
        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md flex items-center space-x-1 ml-2"
        title="Export DXF"
      >
        <Icon>
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
          <path d="M8 12l4 4 4-4" />
          <path d="M12 4v12" />
        </Icon>
        <span>Export DXF</span>
      </button>
    </div>
  );
};

export default Toolbar;
