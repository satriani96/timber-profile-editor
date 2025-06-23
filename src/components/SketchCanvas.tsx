import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import paper from 'paper';
import type { SketchTool } from '../types';
import { createLineTool } from '../canvas/tools/LineTool';
import { createSelectTool } from '../canvas/tools/SelectTool';
import { createSquareTool } from '../canvas/tools/SquareTool';
import { createCircleTool } from '../canvas/tools/CircleTool';
import { createFilletTool } from '../canvas/tools/FilletTool';
import { createFitSplineTool } from '../canvas/tools/FitSplineTool';
import { exportToDXF } from '../exporters/ExportDXF';
import { getSnapPoint } from '../utils/snapHelpers';
import type { SnapConfig } from '../utils/snapHelpers';
import NumericInputPanel from './NumericInputPanel';
import FloatingFinishButton from './FloatingFinishButton';
import { ImageUpload } from '../canvas/ImageUpload';
import ImageSideToolbar from './ImageSideToolbar';

interface SketchCanvasProps {
  activeTool: SketchTool;
  setActiveTool: (tool: SketchTool) => void;
  exportDXFRef: MutableRefObject<() => void>;
}

type SketchCanvasHandle = {
  handleUploadImage: (file: File) => void;
};

const SketchCanvas = (
  { activeTool, setActiveTool, exportDXFRef }: SketchCanvasProps
) => {
  // --- Image Trace Integration ---
  const imageUploadRef = useRef<ImageUpload | null>(null);

  // State for image visibility, calibration, and image version (for forced re-render)
  const [imageVisible, setImageVisible] = useState(true);
  const [calibrateActive, setCalibrateActive] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const [hasImage, setHasImage] = useState(false);
  const [paperReady] = useState(false);
  const [queuedImageFile, setQueuedImageFile] = useState<File | null>(null);

  // Called when an image is uploaded from the toolbar
  const handleUploadImage = useCallback((file: File) => {
    console.log('[SketchCanvas] handleUploadImage called, file:', file?.name);

    if (!paperReady) {
      setQueuedImageFile(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target && typeof e.target.result === 'string') {
        if (!imageUploadRef.current) imageUploadRef.current = new ImageUpload();
        imageUploadRef.current.loadImage(e.target.result);
        // Store the imageUrl so it can be reloaded after Paper.js resets
        imageUploadRef.current.state.imageUrl = e.target.result;
        setImageVisible(true); // Always show image on upload
        setImageVersion(v => v + 1); // Force re-render for toolbar
        setHasImage(true);
        // Center view on raster after load
        setTimeout(() => {
          if (imageUploadRef.current && imageUploadRef.current.state.raster) {
            paper.view.center = imageUploadRef.current.state.raster.position;
            paper.view.update();
          }
        }, 0);
      }
    };
    reader.readAsDataURL(file);
  }, [paperReady]);

  // --- Paper.js Canvas Size Sync ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resizePaperCanvas() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Set canvas pixel size for HiDPI
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      // Set canvas display size (CSS)
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      if (paper && paper.view) {
        // Set Paper.js view size to logical CSS pixels, not device pixels
        paper.view.viewSize = new paper.Size(rect.width, rect.height);
      }
      // Log all sizing info
      console.log('[SketchCanvas] resizePaperCanvas', {
        dpr,
        rectWidth: rect.width,
        rectHeight: rect.height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height,
        paperViewSize: paper?.view?.viewSize,
      });
    }
    resizePaperCanvas();
    window.addEventListener('resize', resizePaperCanvas);
    return () => window.removeEventListener('resize', resizePaperCanvas);
  }, []);

  // If an image upload was queued before Paper.js was ready, process it now
  useEffect(() => {
    if (paperReady && queuedImageFile) {
      handleUploadImage(queuedImageFile);
      setQueuedImageFile(null);
    }
  }, [paperReady, queuedImageFile, handleUploadImage]);

  // Spline drawing state for UI
  const [isSplineDrawing, setIsSplineDrawing] = useState(false);
  const [splineSegmentCount, setSplineSegmentCount] = useState(0);
  // Core canvas, tool, and state refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectToolRef = useRef<paper.Tool | null>(null);
  const lineToolRef = useRef<paper.Tool | null>(null);
  const squareToolRef = useRef<paper.Tool | null>(null);
  const circleToolRef = useRef<paper.Tool | null>(null);
  const panToolRef = useRef<paper.Tool | null>(null);
  const filletToolRef = useRef<paper.Tool | null>(null);
  const filletToolInstanceRef = useRef<ReturnType<typeof createFilletTool> | null>(null);

  // FitSplineTool refs and state
  const fitSplineToolRef = useRef<paper.Tool | null>(null);
  const fitSplineToolInstanceRef = useRef<ReturnType<typeof createFitSplineTool> | null>(null);
  const currentSplineRef = useRef<paper.Path | null>(null);
  const isDrawingSplineRef = useRef<boolean>(false);
  const selectedSplinePointRef = useRef<{ path: paper.Path, index: number } | null>(null);
  const finishCurrentSpline = useCallback(() => {
    // Optionally trigger a re-render or update UI
    // For now, just clear the currentSplineRef
    currentSplineRef.current = null;
    isDrawingSplineRef.current = false;
    selectedSplinePointRef.current = null;
  }, []);
  const lastFilletRadiusRef = useRef<number>(10);
  const previousToolRef = useRef<SketchTool>('select');
  const previousActiveToolRef = useRef<SketchTool>(activeTool);
  const snapIndicatorRef = useRef<paper.Path.Circle | null>(null);
  const currentPathRef = useRef<paper.Path | null>(null);
  const isDrawingLineRef = useRef(false);
  const draggedSegmentRef = useRef<paper.Segment | null>(null);

  // FilletTool specific refs
  const cornerPointRef = useRef<paper.Point | null>(null);
  const path1Ref = useRef<paper.Path | null>(null);
  const path2Ref = useRef<paper.Path | null>(null);

  // Component state
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacebarPan, setIsSpacebarPan] = useState(false);
  const [isNumericInputActive, setIsNumericInputActive] = useState(false);

  const [lengthInputValue, setLengthInputValue] = useState('');
  const [angleInputValue, setAngleInputValue] = useState('');
  const [numericInputPosition, setNumericInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeNumericInput, setActiveNumericInput] = useState<'length' | 'angle' | 'width' | 'height' | 'diameter' | 'radius'>('length');
  const lengthInputRef = useRef<HTMLInputElement>(null);
  const angleInputRef = useRef<HTMLInputElement>(null);
  const widthInputRef = useRef<HTMLInputElement>(null);
  const heightInputRef = useRef<HTMLInputElement>(null);
  const diameterInputRef = useRef<HTMLInputElement>(null);
  const radiusInputRef = useRef<HTMLInputElement>(null);
  const [widthInputValue, setWidthInputValue] = useState('');
  const [heightInputValue, setHeightInputValue] = useState('');
  const [diameterInputValue, setDiameterInputValue] = useState('');
  const [radiusInputValue, setRadiusInputValue] = useState('');

  // --- Memoized Event Handlers ---
  const resetNumericInput = useCallback(() => {
    setIsNumericInputActive(false);
    // setNumericInputVisible(false);
    setLengthInputValue('');
    setAngleInputValue('');
    setWidthInputValue('');
    setHeightInputValue('');
    setDiameterInputValue('');
    setRadiusInputValue('');
  }, []);

  const finishCurrentFilletOperation = useCallback(() => {
    resetNumericInput();
    cornerPointRef.current = null;
    path1Ref.current = null;
    path2Ref.current = null;
  }, [resetNumericInput]);

  const finishCurrentDrawing = useCallback(() => {
    if (currentPathRef.current && currentPathRef.current.length < 1) {
      currentPathRef.current.remove();
    }
    isDrawingLineRef.current = false;
    currentPathRef.current = null;
    snapIndicatorRef.current?.remove();
    snapIndicatorRef.current = null;
  }, []);

  const cancelCurrentDrawing = useCallback(() => {
    currentPathRef.current?.remove();
    currentPathRef.current = null;
    isDrawingLineRef.current = false;
    snapIndicatorRef.current?.remove();
    snapIndicatorRef.current = null;
    resetNumericInput();
  }, [resetNumericInput]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isNumericInputActive) return;
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        if (activeTool === 'select') {
          event.preventDefault();
          [...paper.project.selectedItems].forEach(item => item.remove());
        }
        break;
      case 'Escape':
        isDrawingLineRef.current ? cancelCurrentDrawing() : setActiveTool('select');
        break;
      case ' ':
        if (!isSpacebarPan) {
          event.preventDefault();
          setIsSpacebarPan(true);
          previousToolRef.current = activeTool;
          setActiveTool('pan');
        }
        break;
      case 'Tab':
        if (isDrawingLineRef.current && currentPathRef.current) {
          event.preventDefault();
          setIsNumericInputActive(true);
          
          // Different numeric inputs based on active tool
          if (activeTool === 'line') {
            setActiveNumericInput('length');
            const viewPosition = paper.view.projectToView(currentPathRef.current.lastSegment.point);
            setNumericInputPosition({ x: viewPosition.x + 15, y: viewPosition.y - 15 });
          } 
          else if (activeTool === 'square') {
            setActiveNumericInput('width');
            const viewPosition = paper.view.projectToView(currentPathRef.current.bounds.topRight);
            setNumericInputPosition({ x: viewPosition.x + 15, y: viewPosition.y - 15 });
          }
          else if (activeTool === 'circle') {
            setActiveNumericInput('diameter');
            const viewPosition = paper.view.projectToView(currentPathRef.current.bounds.rightCenter);
            setNumericInputPosition({ x: viewPosition.x + 15, y: viewPosition.y - 15 });
          }
          else if (activeTool === 'fillet' && cornerPointRef.current) {
            setActiveNumericInput('radius');
            const viewPosition = paper.view.projectToView(cornerPointRef.current);
            setNumericInputPosition({ x: viewPosition.x + 15, y: viewPosition.y - 15 });
          }
        }
        break;
    }
  }, [activeTool, isSpacebarPan, isNumericInputActive, setActiveTool, cancelCurrentDrawing]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === ' ') {
      setIsSpacebarPan(false);
      setActiveTool(previousToolRef.current);
    }
  }, [setActiveTool]);

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    const view = paper.view;
    const oldZoom = view.zoom;
    const mousePosition = new paper.Point(event.offsetX, event.offsetY);
    const viewPosition = view.viewToProject(mousePosition);
    const newZoom = event.deltaY < 0 ? oldZoom * 1.1 : oldZoom / 1.1;
    view.zoom = newZoom;
    const newViewPosition = view.viewToProject(mousePosition);
    view.center = view.center.add(viewPosition.subtract(newViewPosition));
  }, []);

  const handleRightMouseDown = useCallback((e: MouseEvent) => {
    if (e.button === 2) { setIsPanning(true); e.preventDefault(); }
  }, []);

  const handleRightMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 2) setIsPanning(false);
  }, []);

  const handleContextMenu = useCallback((e: Event) => e.preventDefault(), []);

  // --- DXF Export Implementation ---
  // Using the exported module instead of inline implementation

  // Assign the export function to the ref so it can be called from the Toolbar
  useEffect(() => {
    exportDXFRef.current = exportToDXF;
  }, [exportDXFRef]);

  // --- Main Setup Effect (runs once) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('[SketchCanvas] paper.setup called');
    paper.setup(canvas);
    selectToolRef.current = new paper.Tool();
    lineToolRef.current = new paper.Tool();
    squareToolRef.current = new paper.Tool();
    circleToolRef.current = new paper.Tool();
    panToolRef.current = new paper.Tool();
    filletToolRef.current = new paper.Tool();

    const snapTolerance = 6;
    // Create a snap configuration for use with the snapHelpers module
    const snapConfig: SnapConfig = {
      snapTolerance,
      currentPathRef,
      snapIndicatorRef,
      enableEndpointSnap: true,
      enableMidpointSnap: true,
      enableIntersectionSnap: false // Temporarily disabled due to instability
    };
    // Define common tool functions first to avoid reference errors

    // Pan handler used by multiple tools
    const handleDragPan = (event: paper.ToolEvent) => {
      if (paper && canvasRef.current) {
        const view = paper.project.view;
        view.translate(new paper.Point(event.delta.x, event.delta.y));
      }
    };

    // Vertex drag handler for select tool
    const handleVertexDrag = (event: paper.ToolEvent) => {
      if (draggedSegmentRef.current) {
        const draggedSegment = draggedSegmentRef.current;
        const path = draggedSegment.path;
        const snapPoint = getSnapPoint(event.point, snapConfig, path);

        // Update the point of the dragged segment
        draggedSegment.point = snapPoint || event.point;

        // Only straighten if this is a plain line (not arc, circle, or spline)
        if (path &&
          !path.data?.isSpline &&
          !path.data?.isArc &&
          !path.data?.center &&
          !path.data?.radius
        ) {
          for (const segment of path.segments) {
            segment.handleIn.set(0, 0);
            segment.handleOut.set(0, 0);
          }
        }
      }
    };

    // Common state for drawing tools
    const commonDrawingState = {
      currentPathRef,
      isDrawingLineRef,
      snapIndicatorRef,
      finishCurrentDrawing,
      resetNumericInput,
      getSnapPoint: (point: paper.Point, pathToIgnore?: paper.Path | null) => getSnapPoint(point, snapConfig, pathToIgnore),
      isPanning,
      isSpacebarPan,
      handleDragPan
    };

    // --- FitSpline Tool Implementation (now in correct order) ---
    if (!fitSplineToolRef.current) {
      fitSplineToolRef.current = new paper.Tool();
    }
    const fitSplineTool = createFitSplineTool({
      currentSplineRef,
      isDrawingSplineRef,
      selectedSplinePointRef,
      finishCurrentSpline,
      isPanning,
      isSpacebarPan,
      handleDragPan,
      setIsSplineDrawing,
      setSplineSegmentCount
    });

    fitSplineToolRef.current.onMouseDown = fitSplineTool.onMouseDown;
    fitSplineToolRef.current.onMouseDrag = fitSplineTool.onMouseDrag;
    fitSplineToolRef.current.onMouseMove = fitSplineTool.onMouseMove;
    fitSplineToolRef.current.onMouseUp = fitSplineTool.onMouseUp;
    fitSplineToolRef.current.onKeyDown = fitSplineTool.onKeyDown;

    // --- Ensure image is rendered after Paper.js setup ---
    if (imageUploadRef.current && imageUploadRef.current.state.imageUrl && paper.project) {
      imageUploadRef.current.loadImage(imageUploadRef.current.state.imageUrl);
    }

    if (filletToolRef.current) {
      // Reset the instance ref to ensure we create a fresh tool
      filletToolInstanceRef.current = null;
      const filletTool = createFilletTool({
        path1Ref,
        path2Ref,
        cornerPointRef,
        lastFilletRadiusRef,
        setIsNumericInputActive,
        setNumericInputPosition,
        finishCurrentFilletOperation,
        isSpacebarPan,
      });
      filletToolInstanceRef.current = filletTool;
      filletToolRef.current.onMouseDown = filletTool.onMouseDown;
      filletToolRef.current.onKeyDown = filletTool.onKeyDown;
    }

    // Apply the line tool handlers to the Paper.js tool object
    if (lineToolRef.current) {
      const lineTool = createLineTool(canvasRef, commonDrawingState);
      lineToolRef.current.onMouseDown = lineTool.onMouseDown;
      lineToolRef.current.onMouseMove = lineTool.onMouseMove;
      lineToolRef.current.onMouseDrag = lineTool.onMouseDrag;
    }

    // Now that handleVertexDrag is defined, create the select tool
    if (selectToolRef.current) {
      const selectToolStateManager = {
        draggedSegmentRef,
        isPanning,
        isSpacebarPan,
        handleDragPan,
        handleVertexDrag
      };
      const selectTool = createSelectTool(canvasRef, selectToolStateManager);
      selectToolRef.current.onMouseDown = selectTool.onMouseDown;
      selectToolRef.current.onMouseDrag = selectTool.onMouseDrag;
      selectToolRef.current.onMouseUp = selectTool.onMouseUp;
    }

    // We'll initialize tools with null checks to ensure they're available
    // Setup Square Tool with modular approach
    if (squareToolRef.current) {
      const squareTool = createSquareTool(canvasRef, commonDrawingState);
      squareToolRef.current.onMouseDown = squareTool.onMouseDown;
      squareToolRef.current.onMouseMove = squareTool.onMouseMove;
      squareToolRef.current.onMouseDrag = squareTool.onMouseDrag;
    }

    // Circle Tool Implementation with modular approach
    if (circleToolRef.current) {
      const circleTool = createCircleTool(canvasRef, commonDrawingState);
      circleToolRef.current.onMouseDown = circleTool.onMouseDown;
      circleToolRef.current.onMouseMove = circleTool.onMouseMove;
      circleToolRef.current.onMouseDrag = circleTool.onMouseDrag;
    }
    // Set up Pan tool
    if (panToolRef.current) {
      panToolRef.current.onMouseDrag = handleDragPan;
    }

  }, [isPanning, isSpacebarPan]);

  // --- Tool Activation & Global Listeners ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tool = activeTool;
    if (tool === 'select' && selectToolRef.current) { selectToolRef.current.activate(); canvas.style.cursor = 'default'; }
    else if (tool === 'line' && lineToolRef.current) { lineToolRef.current.activate(); canvas.style.cursor = 'crosshair'; }
    else if (tool === 'square' && squareToolRef.current) { squareToolRef.current.activate(); canvas.style.cursor = 'crosshair'; }
    else if (tool === 'circle' && circleToolRef.current) { circleToolRef.current.activate(); canvas.style.cursor = 'crosshair'; }
    else if (tool === 'pan' && panToolRef.current) { panToolRef.current.activate(); canvas.style.cursor = 'grab'; }
    else if (tool === 'fillet' && filletToolRef.current) { 
      filletToolRef.current.activate();
    }
    else if (tool === 'fitspline' && fitSplineToolRef.current) {
      // Always clear any unfinished spline and selection when (re)activating the tool
      if (currentSplineRef.current) {
        currentSplineRef.current.remove();
        currentSplineRef.current = null;
      }
      selectedSplinePointRef.current = null;
      isDrawingSplineRef.current = true;
      setIsSplineDrawing(false);
      setSplineSegmentCount(0);
      fitSplineToolRef.current.activate();
      canvas.style.cursor = 'crosshair';
    } else {
      // When switching away from fitspline, ensure drawing mode is off
      if (isDrawingSplineRef.current) isDrawingSplineRef.current = false;
    }

    // Update the ref for the next render
    previousActiveToolRef.current = activeTool;

    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('mousedown', handleRightMouseDown);
    window.addEventListener('mouseup', handleRightMouseUp);
    canvas.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleRightMouseDown);
      window.removeEventListener('mouseup', handleRightMouseUp);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool, handleKeyDown, handleKeyUp, handleWheel, handleRightMouseDown, handleRightMouseUp, handleContextMenu]);

  // --- Numeric Input Logic ---
  const handleNumericInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeTool === 'line' && currentPathRef.current) {
        // Line tool logic - length and angle
        const length = parseFloat(lengthInputValue);
        const angle = parseFloat(angleInputValue);
        if (!isNaN(length) && length > 0 && !isNaN(angle)) {
          const path = currentPathRef.current;
          const startPoint = path.firstSegment.point;
          path.lastSegment.point = startPoint.add(new paper.Point({ length, angle: -angle }));
          finishCurrentDrawing();
          resetNumericInput();
        }
      } else if (activeTool === 'square' && currentPathRef.current) {
        // Square tool logic - width and height
        const width = parseFloat(widthInputValue);
        const height = parseFloat(heightInputValue);
        if (!isNaN(width) && width > 0 && !isNaN(height) && height > 0) {
          const rect = currentPathRef.current as paper.Path;
          const topLeft = rect.bounds.topLeft;
          
          // Remove current rectangle and create new one with specified dimensions
          currentPathRef.current.remove();
          currentPathRef.current = new paper.Path.Rectangle({
            point: topLeft,
            size: new paper.Size(width, height),
            strokeColor: 'black',
            strokeWidth: 2
          });
          finishCurrentDrawing();
          resetNumericInput();
        }
      } else if (activeTool === 'circle' && currentPathRef.current) {
        // Circle tool logic - diameter
        const diameter = parseFloat(diameterInputValue);
        if (!isNaN(diameter) && diameter > 0) {
          const circle = currentPathRef.current;
          const center = circle.data.center;
          
          // Remove current circle and create new one with specified diameter
          currentPathRef.current.remove();
          currentPathRef.current = new paper.Path.Circle({
            center: center,
            radius: diameter / 2,
            strokeColor: 'black',
            strokeWidth: 2
          });
          
          // Store metadata for export
          currentPathRef.current.data = {
            center: center,
            radius: diameter / 2,
            isArc: false
          };
          
          finishCurrentDrawing();
          resetNumericInput();
        }
      } else if (activeTool === 'fillet') {
        const radius = parseFloat(radiusInputValue);
        if (!isNaN(radius) && radius > 0) {
          filletToolInstanceRef.current?.applyFillet(radius);
          // The finishCurrentFilletOperation is called inside the tool's applyFillet method
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelCurrentDrawing(); // Use full cancel
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (activeTool === 'line') {
        setActiveNumericInput(prev => prev === 'length' ? 'angle' : 'length');
      } else if (activeTool === 'square') {
        setActiveNumericInput(prev => prev === 'width' ? 'height' : 'width');
      }
      // Circle tool only has one input (diameter), so Tab does nothing
    }
  };

  useEffect(() => {
    if (isNumericInputActive) {
      let inputToFocus;
      
      switch (activeNumericInput) {
        case 'length':
          inputToFocus = lengthInputRef.current;
          break;
        case 'angle':
          inputToFocus = angleInputRef.current;
          break;
        case 'width':
          inputToFocus = widthInputRef.current;
          break;
        case 'height':
          inputToFocus = heightInputRef.current;
          break;
        case 'diameter':
          inputToFocus = diameterInputRef.current;
          break;
        case 'radius':
          inputToFocus = radiusInputRef.current;
          break;
        default:
          inputToFocus = lengthInputRef.current;
      }
      
      // Give the input time to render before focusing
      setTimeout(() => {
        inputToFocus?.focus();
        inputToFocus?.select();
      }, 100);
    }
  }, [isNumericInputActive, activeNumericInput]);

  return (
    <div className="w-full h-full relative">

      <canvas
        ref={canvasRef}
        className="w-full h-full bg-gray-100 cursor-crosshair focus:outline-none"
        data-paper-resize
        tabIndex={0} // Make canvas focusable to receive key events
      />
      {/* Image upload logic is handled via Paper.js raster and ImageUpload module */}
      {/* Floating finish (tick) button for spline tool */}

      <FloatingFinishButton
        visible={
          Boolean(
            activeTool === 'fitspline' &&
            isSplineDrawing &&
            splineSegmentCount > 1
          )
        }
        onClick={() => {
          // Call the real finish logic if present
          // @ts-expect-error: finishSpline is attached at runtime
          fitSplineToolInstanceRef.current?.finishSpline?.();
          // Also run the UI cleanup
          finishCurrentSpline();
        }}
      />
      {/* Numeric input panel */}
      <NumericInputPanel
        isActive={isNumericInputActive}
        position={numericInputPosition}
        activeTool={activeTool}
        activeInput={activeNumericInput}
        values={{
          length: lengthInputValue,
          angle: angleInputValue,
          width: widthInputValue,
          height: heightInputValue,
          diameter: diameterInputValue,
          radius: radiusInputValue
        }}
        setValues={{
          length: setLengthInputValue,
          angle: setAngleInputValue,
          width: setWidthInputValue,
          height: setHeightInputValue,
          diameter: setDiameterInputValue,
          radius: setRadiusInputValue
        }}
        refs={{
          length: lengthInputRef,
          angle: angleInputRef,
          width: widthInputRef,
          height: heightInputRef,
          diameter: diameterInputRef,
          radius: radiusInputRef
        }}
        onKeyDown={handleNumericInputKeyDown}
      />
      <ImageSideToolbar
        key={imageVersion}
        hasImage={hasImage}
        imageVisible={imageVisible}
        onToggleImage={() => {
          setImageVisible(v => {
            const newVisible = !v;
            if (imageUploadRef.current) imageUploadRef.current.setVisible(newVisible);
            return newVisible;
          });
        }}
        onDeleteImage={() => {
          if (imageUploadRef.current) {
            imageUploadRef.current.removeImage();
            imageUploadRef.current.state.imageUrl = undefined;
          }
          setImageVisible(false);
          setCalibrateActive(false);
          setImageVersion(v => v + 1);
          setHasImage(false);
          paper.view.update();
        }}
        onStartCalibrate={() => setCalibrateActive(v => !v)}
        calibrateActive={calibrateActive}
      />
    </div>
  );
}

export default React.forwardRef<SketchCanvasHandle, SketchCanvasProps>(SketchCanvas);