import React from 'react';
import { SketchTool } from '../types';

interface ToolbarProps {
  activeTool: SketchTool;
  setActiveTool: (tool: SketchTool) => void;
  exportDXF: () => void;
}

const ToolButton: React.FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}> = ({ label, isActive, onClick, children }) => (
  <button
    onClick={onClick}
    title={label}
    className={`p-2 rounded-md flex items-center justify-center ${isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
    {children}
    <span className="sr-only">{label}</span>
  </button>
);

const Toolbar: React.FC<ToolbarProps & { onUploadImage: (file: File) => void }> = ({ activeTool, setActiveTool, exportDXF, onUploadImage }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadImage(e.target.files[0]);
      e.target.value = '';
    }
  };
  return (
    <div className="bg-gray-800 text-white p-2 shadow-md flex items-center space-x-2">
      <ToolButton label="Select" isActive={activeTool === 'select'} onClick={() => setActiveTool('select')}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
      </ToolButton>
      <ToolButton label="Line" isActive={activeTool === 'line'} onClick={() => setActiveTool('line')}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>
      </ToolButton>
      <ToolButton label="Square" isActive={activeTool === 'square'} onClick={() => setActiveTool('square')}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>
      </ToolButton>
      <ToolButton label="Circle" isActive={activeTool === 'circle'} onClick={() => setActiveTool('circle')}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /></svg>
      </ToolButton>
      <ToolButton label="Fillet" isActive={activeTool === 'fillet'} onClick={() => setActiveTool('fillet')}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 20v-8a4 4 0 00-4-4H8" /></svg>
      </ToolButton>
      <ToolButton label="Fit Spline" isActive={activeTool === 'fitspline'} onClick={() => setActiveTool('fitspline')}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M4 19C7 10 17 14 20 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="4" cy="19" r="1.5" fill="currentColor" />
          <circle cx="20" cy="5" r="1.5" fill="currentColor" />
        </svg>
      </ToolButton>
      <button
        onClick={handleUploadClick}
        className="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded-md flex items-center space-x-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16m16-8H4" />
        </svg>
        <span>Upload Image</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </button>
      <div className="flex-grow"></div>
      <button
        onClick={exportDXF}
        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md flex items-center space-x-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export DXF</span>
      </button>
    </div>
  );
};

export default Toolbar;
