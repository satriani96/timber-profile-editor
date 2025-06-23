import paper from 'paper';

interface StateManager {
  currentPathRef: React.MutableRefObject<paper.Path | null>;
  isDrawingLineRef: React.MutableRefObject<boolean>;
  snapIndicatorRef: React.MutableRefObject<paper.Path.Circle | null>;
  finishCurrentDrawing: () => void;
  resetNumericInput: () => void;
  getSnapPoint: (point: paper.Point, pathToIgnore?: paper.Path | null) => paper.Point | null;
  isPanning: boolean;
  isSpacebarPan: boolean;
  handleDragPan: (event: paper.ToolEvent) => void;
}

export function createSquareTool(_canvasRef: React.RefObject<HTMLCanvasElement | null>, stateManager: StateManager) {
  const {
    currentPathRef,
    isDrawingLineRef,
    snapIndicatorRef,
    finishCurrentDrawing,
    resetNumericInput,
    getSnapPoint,
    isPanning,
    isSpacebarPan,
    handleDragPan
  } = stateManager;

  return {
    onMouseDown: (event: paper.ToolEvent) => {
      // Case 1: If we're already drawing, complete the rectangle with second click
      if (isDrawingLineRef.current && currentPathRef.current) {
        const snapPoint = getSnapPoint(event.point);
        const endPoint = snapPoint || event.point;
        const startPoint = currentPathRef.current.data.startPoint;
        
        // Replace the rectangle with final coordinates
        currentPathRef.current.remove();
        currentPathRef.current = new paper.Path.Rectangle({
          from: startPoint,
          to: endPoint,
          strokeColor: new paper.Color('black'),
          strokeWidth: 2,
        });
        
        // Store metadata for DXF export
        currentPathRef.current.data = {
          isRect: true,
          width: Math.abs(endPoint.x - startPoint.x),
          height: Math.abs(endPoint.y - startPoint.y),
          startPoint: startPoint,
          endPoint: endPoint
        };
        
        finishCurrentDrawing();
        return;
      }
      
      // Case 2: Start drawing a new rectangle with first click
      finishCurrentDrawing();
      resetNumericInput();
      const snapPoint = getSnapPoint(event.point);
      const startPoint = snapPoint || event.point;
      
      // Create initial rectangle (zero size)
      currentPathRef.current = new paper.Path.Rectangle({
        from: startPoint,
        to: startPoint,
        strokeColor: new paper.Color('black'),
        strokeWidth: 2,
      });
      
      // Store the start point for reference
      currentPathRef.current.data = { startPoint: startPoint };
      
      isDrawingLineRef.current = true;
    },
    
    onMouseMove: (event: paper.ToolEvent) => {
      // Update snap indicator
      const snapPoint = getSnapPoint(event.point);
      if (snapIndicatorRef.current) {
        snapIndicatorRef.current.position = snapPoint || event.point;
        snapIndicatorRef.current.visible = snapPoint !== null;
      }
      
      // Update rectangle preview as mouse moves
      if (isDrawingLineRef.current && currentPathRef.current) {
        const startPoint = currentPathRef.current.data.startPoint;
        const newPoint = snapPoint || event.point;
        
        // Replace with updated rectangle
        currentPathRef.current.remove();
        currentPathRef.current = new paper.Path.Rectangle({
          from: startPoint,
          to: newPoint,
          strokeColor: new paper.Color('black'),
          strokeWidth: 2,
        });
        
        // Preserve the start point in data
        currentPathRef.current.data = { startPoint: startPoint };
      }
    },
    
    onMouseDrag: (event: paper.ToolEvent) => { 
      if (isPanning || isSpacebarPan) handleDragPan(event); 
    },
    
    onMouseUp: () => {},
    onKeyDown: null,
    onKeyUp: null,
    onActivate: () => {},
    onDeactivate: () => {}
  };
}
