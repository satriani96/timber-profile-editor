import { useCallback, useEffect, useRef, useState } from 'react';
import type { SketchTool } from './types';
import Toolbar from './components/Toolbar';
import StatusToast from './components/StatusToast';
import SketchCanvas, { type SketchCanvasHandle } from './components/SketchCanvas';
import { loadProfileSheet, saveProfileSheet } from './netsuite/profileSheet';

function sheetIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('psid');
}

function App() {
  const [activeTool, setActiveTool] = useState<SketchTool>('select');
  const exportDXFRef = useRef<() => void>(() => {});
  const sketchCanvasRef = useRef<SketchCanvasHandle | null>(null);
  const [nsSheet, setNsSheet] = useState<{ id: string; name: string } | null>(null);
  const [nsDxf, setNsDxf] = useState<string | null>(null);
  const [nsBusy, setNsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const id = sheetIdFromUrl();
    if (!id) return;
    setNsBusy(true);
    loadProfileSheet(id)
      .then((sheet) => {
        setNsSheet({ id: sheet.id, name: sheet.name });
        setNsDxf(sheet.dxf);
        setStatus(sheet.dxf ? `Opened ${sheet.name || `Sheet ${sheet.id}`}` : `${sheet.name || `Sheet ${sheet.id}`} has no DXF yet`);
      })
      .catch((error: unknown) => {
        setStatus(`NetSuite load failed: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => setNsBusy(false));
  }, []);

  const handleSaveNs = useCallback(async () => {
    if (!nsSheet) return;
    setNsBusy(true);
    try {
      const dxf = sketchCanvasRef.current?.exportDxfText() ?? '';
      const result = await saveProfileSheet(nsSheet.id, dxf);
      setStatus(`Saved ${result.chars} characters to ${nsSheet.name || `Sheet ${nsSheet.id}`}`);
    } catch (error) {
      setStatus(`NetSuite save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setNsBusy(false);
    }
  }, [nsSheet]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-white font-sans">
      <div className="absolute top-0 left-0 w-full z-10">
        <Toolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          exportDXF={() => exportDXFRef.current()}
          onImportDXF={(file) => sketchCanvasRef.current?.handleImportDXF(file)}
          onUploadImage={(file) => sketchCanvasRef.current?.handleUploadImage(file)}
          onUndo={() => sketchCanvasRef.current?.undo()}
          onRedo={() => sketchCanvasRef.current?.redo()}
          nsSheet={nsSheet}
          onSaveNs={handleSaveNs}
          nsBusy={nsBusy}
        />
      </div>

      <div className="flex h-full">
        <div className="flex flex-col h-full w-full">
          <SketchCanvas
            ref={sketchCanvasRef}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            exportDXFRef={exportDXFRef}
            nsDxf={nsDxf}
          />
        </div>
      </div>
      <StatusToast message={status} onDismiss={() => setStatus(null)} />
    </div>
  );
}

export default App;
