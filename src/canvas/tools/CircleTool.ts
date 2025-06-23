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

export function createCircleTool(_canvasRef: React.RefObject<HTMLCanvasElement | null>, stateManager: StateManager) {
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
      // Case 1: If we're already drawing, complete the circle with second click
      if (isDrawingLineRef.current && currentPathRef.current) {
        const snapPoint = getSnapPoint(event.point);
        const endPoint = snapPoint || event.point;
        const center = currentPathRef.current.data.center;
        const radius = center.getDistance(endPoint);
        
        // Replace with final circle
        currentPathRef.current.remove();
        currentPathRef.current = new paper.Path.Circle({
          center: center,
          radius: radius,
          strokeColor: new paper.Color('black'),
          strokeWidth: 2,
        });
        
        // Store metadata for DXF export
        currentPathRef.current.data = { 
          center: center,
          radius: radius,
          isArc: false // Full circle, not an arc
        };
        
        finishCurrentDrawing();
        return;
      }
      
      // Case 2: Start drawing a new circle with first click (center point)
      finishCurrentDrawing();
      resetNumericInput();
      const snapPoint = getSnapPoint(event.point);
      const centerPoint = snapPoint || event.point;
      
      // Create initial circle (zero radius)
      currentPathRef.current = new paper.Path.Circle({
        center: centerPoint,
        radius: 0,
        strokeColor: new paper.Color('black'),
        strokeWidth: 2,
      });
      
      // Store the center point for reference
      currentPathRef.current.data = { 
        center: centerPoint,
        isArc: false // Full circle, not an arc
      };
      
      isDrawingLineRef.current = true;
    },
    
    onMouseMove: (event: paper.ToolEvent) => {
      // Update snap indicator
      const snapPoint = getSnapPoint(event.point);
      if (snapIndicatorRef.current) {
        snapIndicatorRef.current.position = snapPoint || event.point;
        snapIndicatorRef.current.visible = snapPoint !== null;
      }
      
      // Update circle preview as mouse moves
      if (isDrawingLineRef.current && currentPathRef.current) {
        const center = currentPathRef.current.data.center;
        const newPoint = snapPoint || event.point;
        const radius = center.getDistance(newPoint);
        
        // Replace with updated circle
        currentPathRef.current.remove();
        currentPathRef.current = new paper.Path.Circle({
          center: center,
          radius: radius,
          strokeColor: new paper.Color('black'),
          strokeWidth: 2,
        });
        
        // Preserve the center point in data
        currentPathRef.current.data = { 
          center: center,
          isArc: false // Full circle, not an arc
        };
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
