import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import paper from 'paper';
import type { SketchTool } from '../types';
import { createFilletTool } from '../canvas/tools/FilletTool';
import { createFitSplineTool } from '../canvas/tools/FitSplineTool';
import { createLineTool } from '../canvas/tools/LineTool';
import { createSplitTool, createTrimTool } from '../canvas/tools/CutTool';
import { createHistory, type SketchHistory } from '../canvas/history';
import { exportToDXF } from '../exporters/ExportDXF';
import { commitDxfImport, prepareDxfImport, type PreparedImport } from '../importers/ImportDXF';
import { usePaperBootstrap } from './sketch/usePaperBootstrap';
import { useImageCalibration } from './sketch/useImageCalibration';
import { useImageMeasurement } from './sketch/useImageMeasurement';
import { useDrawingSession } from './sketch/useDrawingSession';
import { useViewport } from './sketch/useViewport';
import { useNumericInput } from './sketch/useNumericInput';
import { useSketchKeyboard } from './sketch/useSketchKeyboard';
import { attachSketchPaperTools } from './sketch/attachSketchPaperTools';
import NumericInputPanel from './NumericInputPanel';
import FloatingFinishButton from './FloatingFinishButton';
import { ImageUpload } from '../canvas/ImageUpload';
import ImageSideToolbar from './ImageSideToolbar';
import ZoomLevelIndicator from './ZoomLevelIndicator';
import StatusToast from './StatusToast';
import ImportUnitsDialog from './ImportUnitsDialog';

interface SketchCanvasProps {
  activeTool: SketchTool;
  setActiveTool: (tool: SketchTool) => void;
  exportDXFRef: MutableRefObject<() => void>;
}

export type SketchCanvasHandle = {
  handleUploadImage: (file: File) => void;
  handleImportDXF: (file: File) => void;
  undo: () => void;
  redo: () => void;
};

const TOOL_CURSORS: Record<SketchTool, string> = {
  select: 'default',
  line: 'crosshair',
  square: 'crosshair',
  circle: 'crosshair',
  pan: 'grab',
  fillet: 'crosshair',
  fitspline: 'crosshair',
  trim: 'crosshair',
  split: 'crosshair',
};

function SketchCanvas(
  { activeTool, setActiveTool, exportDXFRef }: SketchCanvasProps,
  ref: React.ForwardedRef<SketchCanvasHandle>
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paperReady, setPaperReady] = useState(false);
  const viewport = useViewport(paperReady);
  const { setZoom, updateAllStrokeWidths, zoomToFit, handleWheel } = viewport;
  usePaperBootstrap(canvasRef, setPaperReady, setZoom);

  const historyRef = useRef<SketchHistory | null>(null);
  if (!historyRef.current) historyRef.current = createHistory();
  const history = historyRef.current;

  const session = useDrawingSession();
  const { currentPathRef, isDrawingLineRef, snapIndicatorRef, finishCurrentDrawing, cancelDrawing, hideSnapIndicator } = session;

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const dismissStatus = useCallback(() => setStatusMessage(null), []);

  // --- Image trace state ---
  const imageUploadRef = useRef<ImageUpload | null>(null);
  const calibrationMarkersRef = useRef<paper.Path.Circle[]>([]);
  const measurementPointsRef = useRef<paper.Point[]>([]);
  const measurementMarkersRef = useRef<paper.Path.Circle[]>([]);
  const [imageVisible, setImageVisible] = useState(true);
  const [calibrateActive, setCalibrateActive] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const [hasImage, setHasImage] = useState(false);
  const [queuedImageFile, setQueuedImageFile] = useState<File | null>(null);

  const handleUploadImage = useCallback(
    (file: File) => {
      if (!paperReady) {
        setQueuedImageFile(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target && typeof e.target.result === 'string') {
          if (!imageUploadRef.current) imageUploadRef.current = new ImageUpload();
          imageUploadRef.current.loadImage(e.target.result);
          imageUploadRef.current.state.imageUrl = e.target.result;
          setImageVisible(true);
          setImageVersion((v) => v + 1);
          setHasImage(true);
          setTimeout(() => {
            const raster = imageUploadRef.current?.state.raster;
            if (raster) {
              paper.view.center = raster.position;
              paper.view.update();
            }
          }, 0);
        }
      };
      reader.readAsDataURL(file);
    },
    [paperReady]
  );

  useImageCalibration({ calibrateActive, paperReady, canvasRef, imageUploadRef, calibrationMarkersRef, setCalibrateActive });
  useImageMeasurement({ measureActive, paperReady, canvasRef, measurementPointsRef, measurementMarkersRef });

  useEffect(() => {
    if (paperReady && queuedImageFile) {
      handleUploadImage(queuedImageFile);
      setQueuedImageFile(null);
    }
  }, [paperReady, queuedImageFile, handleUploadImage]);

  // --- Tool refs ---
  const [isSplineDrawing, setIsSplineDrawing] = useState(false);
  const [splineSegmentCount, setSplineSegmentCount] = useState(0);
  const selectToolRef = useRef<paper.Tool | null>(null);
  const lineToolRef = useRef<paper.Tool | null>(null);
  const lineToolInstanceRef = useRef<ReturnType<typeof createLineTool> | null>(null);
  const squareToolRef = useRef<paper.Tool | null>(null);
  const circleToolRef = useRef<paper.Tool | null>(null);
  const panToolRef = useRef<paper.Tool | null>(null);
  const filletToolRef = useRef<paper.Tool | null>(null);
  const filletToolInstanceRef = useRef<ReturnType<typeof createFilletTool> | null>(null);
  const trimToolRef = useRef<paper.Tool | null>(null);
  const trimToolInstanceRef = useRef<ReturnType<typeof createTrimTool> | null>(null);
  const splitToolRef = useRef<paper.Tool | null>(null);
  const splitToolInstanceRef = useRef<ReturnType<typeof createSplitTool> | null>(null);
  const fitSplineToolRef = useRef<paper.Tool | null>(null);
  const fitSplineToolInstanceRef = useRef<ReturnType<typeof createFitSplineTool> | null>(null);
  const currentSplineRef = useRef<paper.Path | null>(null);
  const isDrawingSplineRef = useRef<boolean>(false);
  const selectedSplinePointRef = useRef<{ path: paper.Path; index: number } | null>(null);
  const lastFilletRadiusRef = useRef<number>(10);
  const previousToolRef = useRef<SketchTool>('select');
  const lastActivatedToolRef = useRef<SketchTool>('select');
  const draggedSegmentRef = useRef<paper.Segment | null>(null);
  const cornerPointRef = useRef<paper.Point | null>(null);
  const path1Ref = useRef<paper.Path | null>(null);
  const path2Ref = useRef<paper.Path | null>(null);
  const isPanningRef = useRef(false);
  const isSpacebarPanRef = useRef(false);

  const numeric = useNumericInput({ activeTool, session, cornerPointRef, filletToolInstanceRef, lineToolInstanceRef });
  const { reset: resetNumericInput, openRadiusAt } = numeric;

  const finishCurrentSpline = useCallback(() => {
    currentSplineRef.current = null;
    isDrawingSplineRef.current = false;
    selectedSplinePointRef.current = null;
    setIsSplineDrawing(false);
    setSplineSegmentCount(0);
  }, []);

  const cancelSpline = useCallback(() => {
    fitSplineToolInstanceRef.current?.cancelSpline();
  }, []);

  const finishCurrentFilletOperation = useCallback(() => {
    resetNumericInput();
    cornerPointRef.current = null;
    path1Ref.current = null;
    path2Ref.current = null;
  }, [resetNumericInput]);

  const cancelCurrentDrawing = useCallback(() => {
    cancelDrawing();
    resetNumericInput();
  }, [cancelDrawing, resetNumericInput]);

  const clearTransientVisuals = useCallback(() => {
    trimToolInstanceRef.current?.onDeactivate();
    splitToolInstanceRef.current?.onDeactivate();
    hideSnapIndicator();
  }, [hideSnapIndicator]);

  const afterHistoryChange = useCallback(() => {
    clearTransientVisuals();
    resetNumericInput();
    finishCurrentFilletOperation();
    updateAllStrokeWidths();
    paper.view.update();
  }, [clearTransientVisuals, finishCurrentFilletOperation, resetNumericInput, updateAllStrokeWidths]);

  const runHistory = useCallback(
    (action: 'undo' | 'redo') => {
      if (isDrawingLineRef.current) cancelCurrentDrawing();
      if (currentSplineRef.current) cancelSpline();
      if (history[action]()) afterHistoryChange();
    },
    [afterHistoryChange, cancelCurrentDrawing, cancelSpline, history, isDrawingLineRef]
  );

  useSketchKeyboard({
    activeTool,
    setActiveTool,
    numeric,
    session,
    history,
    isSpacebarPanRef,
    previousToolRef,
    currentSplineRef,
    cornerPointRef,
    cancelSpline,
    cancelCurrentDrawing,
    afterHistoryChange,
    zoomToFit,
  });

  // --- DXF import/export ---
  useEffect(() => {
    exportDXFRef.current = exportToDXF;
  }, [exportDXFRef]);

  const [pendingImport, setPendingImport] = useState<{ fileName: string; prepared: PreparedImport } | null>(null);

  const handleImportDXF = useCallback(
    async (file: File) => {
      if (!paperReady) return;
      try {
        const prepared = prepareDxfImport(await file.text());
        if (prepared.entityCount === 0) {
          setStatusMessage(`Import failed: no supported geometry found in ${file.name}`);
          return;
        }
        setPendingImport({ fileName: file.name, prepared });
      } catch (error) {
        setStatusMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [paperReady]
  );

  const confirmImport = useCallback(
    (mmPerUnit: number) => {
      if (!pendingImport) return;
      const { fileName, prepared } = pendingImport;
      setPendingImport(null);
      history.checkpoint();
      const summary = commitDxfImport(prepared, mmPerUnit);
      if (summary.items.length) {
        let bounds = summary.items[0].bounds.clone();
        for (const item of summary.items) bounds = bounds.unite(item.bounds);
        zoomToFit(bounds);
      }
      const skippedEntries = Object.entries(summary.skipped);
      const skippedTotal = skippedEntries.reduce((sum, [, n]) => sum + n, 0);
      const skippedText = skippedTotal
        ? ` — skipped ${skippedTotal}: ${skippedEntries.map(([type, n]) => `${type} ×${n}`).join(', ')}`
        : '';
      setStatusMessage(`Imported ${summary.imported} ${summary.imported === 1 ? 'entity' : 'entities'} from ${fileName}${skippedText}`);
    },
    [history, pendingImport, zoomToFit]
  );

  const cancelImport = useCallback(() => setPendingImport(null), []);

  React.useImperativeHandle(
    ref,
    () => ({
      handleUploadImage,
      handleImportDXF,
      undo: () => runHistory('undo'),
      redo: () => runHistory('redo'),
    }),
    [handleUploadImage, handleImportDXF, runHistory]
  );

  // --- Tool wiring (once Paper is ready; never call paper.setup here — it would wipe the project) ---
  useEffect(() => {
    if (!paperReady) return;
    attachSketchPaperTools({
      canvasRef,
      imageUploadRef,
      history,
      selectToolRef,
      lineToolRef,
      lineToolInstanceRef,
      squareToolRef,
      circleToolRef,
      panToolRef,
      filletToolRef,
      filletToolInstanceRef,
      trimToolRef,
      trimToolInstanceRef,
      splitToolRef,
      splitToolInstanceRef,
      fitSplineToolRef,
      fitSplineToolInstanceRef,
      currentSplineRef,
      isDrawingSplineRef,
      selectedSplinePointRef,
      snapIndicatorRef,
      currentPathRef,
      isDrawingLineRef,
      draggedSegmentRef,
      path1Ref,
      path2Ref,
      cornerPointRef,
      lastFilletRadiusRef,
      isPanningRef,
      isSpacebarPanRef,
      openRadiusInput: openRadiusAt,
      setIsSplineDrawing,
      setSplineSegmentCount,
      finishCurrentDrawing,
      finishCurrentFilletOperation,
      finishCurrentSpline,
      resetNumericInput,
    });
    // Refs and setters are stable; re-wiring only when Paper becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional single wire-up
  }, [paperReady]);

  // --- Tool activation ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = TOOL_CURSORS[activeTool];

    // Switching commands cancels whatever was in progress (except a temporary Space-pan).
    const previous = lastActivatedToolRef.current;
    const isTemporaryPan = activeTool === 'pan' || previous === 'pan';
    if (!isTemporaryPan && previous !== activeTool) {
      if (isDrawingLineRef.current) cancelCurrentDrawing();
      if (currentSplineRef.current) cancelSpline();
      finishCurrentFilletOperation();
    }
    clearTransientVisuals();
    lastActivatedToolRef.current = activeTool;

    const tools: Record<SketchTool, MutableRefObject<paper.Tool | null>> = {
      select: selectToolRef,
      line: lineToolRef,
      square: squareToolRef,
      circle: circleToolRef,
      pan: panToolRef,
      fillet: filletToolRef,
      fitspline: fitSplineToolRef,
      trim: trimToolRef,
      split: splitToolRef,
    };
    if (activeTool === 'fitspline') {
      isDrawingSplineRef.current = true;
      setIsSplineDrawing(false);
      setSplineSegmentCount(0);
    } else {
      isDrawingSplineRef.current = false;
    }
    tools[activeTool].current?.activate();
  }, [activeTool, cancelCurrentDrawing, cancelSpline, clearTransientVisuals, finishCurrentFilletOperation, isDrawingLineRef]);

  // --- Canvas mouse listeners: wheel zoom, right/middle-button pan, spline double-click ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2) {
        isPanningRef.current = true;
        e.preventDefault();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2) isPanningRef.current = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onDblClick = (e: MouseEvent) => {
      if (activeTool !== 'fitspline' || !isDrawingSplineRef.current) return;
      e.preventDefault();
      fitSplineToolInstanceRef.current?.finishSpline();
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('dblclick', onDblClick);
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('dblclick', onDblClick);
    };
  }, [activeTool, handleWheel]);

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full bg-gray-100 focus:outline-none" data-paper-resize tabIndex={0} />
      <ZoomLevelIndicator zoom={viewport.zoom} onZoomToFit={() => zoomToFit()} />
      <StatusToast message={statusMessage} onDismiss={dismissStatus} />
      {pendingImport && (
        <ImportUnitsDialog
          fileName={pendingImport.fileName}
          prepared={pendingImport.prepared}
          onConfirm={confirmImport}
          onCancel={cancelImport}
        />
      )}
      <FloatingFinishButton
        visible={Boolean(activeTool === 'fitspline' && isSplineDrawing && splineSegmentCount > 1)}
        onClick={() => fitSplineToolInstanceRef.current?.finishSpline()}
      />
      <NumericInputPanel {...numeric.panelProps} />
      <ImageSideToolbar
        key={imageVersion}
        hasImage={hasImage}
        imageVisible={imageVisible}
        onToggleImage={() => {
          setImageVisible((v) => {
            const next = !v;
            imageUploadRef.current?.setVisible(next);
            return next;
          });
        }}
        onDeleteImage={() => {
          if (imageUploadRef.current) {
            imageUploadRef.current.removeImage();
            imageUploadRef.current.state.imageUrl = undefined;
          }
          setImageVisible(false);
          setCalibrateActive(false);
          setMeasureActive(false);
          setImageVersion((v) => v + 1);
          setHasImage(false);
          paper.view.update();
        }}
        onStartCalibrate={() => {
          setMeasureActive(false);
          setCalibrateActive((v) => !v);
        }}
        calibrateActive={calibrateActive}
        onStartMeasure={() => {
          setCalibrateActive(false);
          setMeasureActive((v) => {
            const next = !v;
            if (next) setActiveTool('select');
            return next;
          });
        }}
        measureActive={measureActive}
        onClearMeasurements={() => {
          history.checkpoint();
          paper.project.activeLayer.children.filter((item) => item.data?.isMeasurement).forEach((item) => item.remove());
          paper.view.update();
        }}
      />
    </div>
  );
}

export default React.forwardRef(SketchCanvas);
