import React, { useState, useRef } from 'react';
import { SketchTool } from './types';
import Toolbar from './components/Toolbar';

import SketchCanvas from './components/SketchCanvas';

function App() {
  const [activeTool, setActiveTool] = useState<SketchTool>('select');
  const exportDXFRef = useRef<() => void>(() => {});
  const sketchCanvasRef = useRef<any>(null);

  const handleExportDXF = () => {
    exportDXFRef.current();
  };

  // Forward image upload to SketchCanvas
  const handleUploadImage = (file: File) => {
    if (sketchCanvasRef.current && typeof sketchCanvasRef.current.handleUploadImage === 'function') {
      sketchCanvasRef.current.handleUploadImage(file);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-white font-sans">
      {/* Toolbar is absolutely positioned at the top, overlaying the canvas */}
      <div className="absolute top-0 left-0 w-full z-10">
        <Toolbar 
          activeTool={activeTool} 
          setActiveTool={setActiveTool} 
          exportDXF={handleExportDXF}
          onUploadImage={handleUploadImage}
        />
      </div>

      {/* Main content area fills the screen with no padding */}
      <div className="flex h-full">
        <div className="flex flex-col h-full w-full">
          <SketchCanvas 
            ref={sketchCanvasRef}
            activeTool={activeTool} 
            setActiveTool={setActiveTool} 
            exportDXFRef={exportDXFRef}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
