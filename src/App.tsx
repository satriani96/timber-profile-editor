import { useCallback, useEffect, useRef, useState } from 'react';
import type { SketchTool } from './types';
import Toolbar from './components/Toolbar';
import StatusToast from './components/StatusToast';
import ProfileLibraryDialog from './components/ProfileLibraryDialog';
import TimberPreviewPanel from './components/TimberPreviewPanel';
import SketchCanvas, { type SketchCanvasHandle } from './components/SketchCanvas';
import {
  listProfileSheets,
  loadProfileSheet,
  saveProfileSheet,
  type ProfileSheetListItem,
} from './netsuite/profileSheet';

function sheetIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('psid');
}

function setSheetInUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('psid', id);
  window.history.replaceState(null, '', url);
}

function App() {
  const [activeTool, setActiveTool] = useState<SketchTool>('select');
  const exportDXFRef = useRef<() => void>(() => {});
  const sketchCanvasRef = useRef<SketchCanvasHandle | null>(null);
  const [nsSheet, setNsSheet] = useState<{ id: string; name: string } | null>(null);
  const [nsDxf, setNsDxf] = useState<string | null>(null);
  const [nsBusy, setNsBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [libraryMode, setLibraryMode] = useState<'open' | 'save' | null>(null);
  const [librarySheets, setLibrarySheets] = useState<ProfileSheetListItem[]>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [preview3dOpen, setPreview3dOpen] = useState(false);

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

  const openLibrary = useCallback(async (mode: 'open' | 'save') => {
    setLibraryMode(mode);
    setLibraryError(null);
    setNsBusy(true);
    try {
      setLibrarySheets(await listProfileSheets());
    } catch (error: unknown) {
      setLibraryError(error instanceof Error ? error.message : String(error));
    } finally {
      setNsBusy(false);
    }
  }, []);

  const closeLibrary = useCallback(() => {
    if (nsBusy) return;
    setLibraryMode(null);
    setLibraryError(null);
  }, [nsBusy]);

  const handleOpenSheet = useCallback(
    async (sheet: ProfileSheetListItem) => {
      setNsBusy(true);
      try {
        const loaded = await loadProfileSheet(sheet.id);
        const imported = sketchCanvasRef.current?.replaceFromDxf(loaded.dxf) ?? 0;
        setNsSheet({ id: loaded.id, name: loaded.name });
        setSheetInUrl(loaded.id);
        setLibraryMode(null);
        setStatus(
          imported
            ? `Opened ${loaded.name || `Sheet ${loaded.id}`}`
            : `${loaded.name || `Sheet ${loaded.id}`} has no DXF yet`
        );
      } catch (error: unknown) {
        setStatus(`NetSuite load failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setNsBusy(false);
      }
    },
    []
  );

  const handleSaveSheet = useCallback(
    async (sheet: ProfileSheetListItem) => {
      if (sheet.hasDxf && sheet.id !== nsSheet?.id) {
        const label = sheet.name || `Sheet ${sheet.id}`;
        if (!window.confirm(`Replace the drawing already on ${label}?`)) return;
      }
      setNsBusy(true);
      try {
        const dxf = sketchCanvasRef.current?.exportDxfText() ?? '';
        const result = await saveProfileSheet(sheet.id, dxf);
        setNsSheet({ id: sheet.id, name: sheet.name });
        setSheetInUrl(sheet.id);
        setLibrarySheets((rows) => rows.map((row) => (row.id === sheet.id ? { ...row, hasDxf: dxf.length > 0 } : row)));
        setLibraryMode(null);
        setStatus(`Saved ${result.chars} characters to ${sheet.name || `Sheet ${sheet.id}`}`);
      } catch (error: unknown) {
        setStatus(`NetSuite save failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setNsBusy(false);
      }
    },
    [nsSheet]
  );

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
          onOpenLibrary={() => void openLibrary('open')}
          onSaveLibrary={() => void openLibrary('save')}
          nsBusy={nsBusy}
          onTogglePreview3d={() => setPreview3dOpen((open) => !open)}
          preview3dOpen={preview3dOpen}
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
      {libraryMode && (
        <ProfileLibraryDialog
          mode={libraryMode}
          sheets={librarySheets}
          currentId={nsSheet?.id}
          busy={nsBusy}
          error={libraryError}
          onPick={libraryMode === 'open' ? handleOpenSheet : handleSaveSheet}
          onClose={closeLibrary}
        />
      )}
      {preview3dOpen && (
        <TimberPreviewPanel
          sheetName={nsSheet ? nsSheet.name || `Sheet ${nsSheet.id}` : null}
          onClose={() => setPreview3dOpen(false)}
        />
      )}
      <StatusToast message={status} onDismiss={() => setStatus(null)} />
    </div>
  );
}

export default App;
