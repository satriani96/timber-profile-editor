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

export function createLineTool(_canvasRef: React.RefObject<HTMLCanvasElement | null>, stateManager: StateManager) {
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
      // Case 1: Finish drawing the current line segment with a second click
      if (isDrawingLineRef.current) {
        const snapPoint = getSnapPoint(event.point);
        const finalPoint = snapPoint || event.point;
        currentPathRef.current!.lastSegment.point = finalPoint;

        // If the new segment has zero length (user clicked the same spot twice), remove it.
        if (currentPathRef.current!.lastSegment.previous.point.equals(finalPoint)) {
          currentPathRef.current!.removeSegment(currentPathRef.current!.segments.length - 1);
        }

        finishCurrentDrawing(); // This sets isDrawingLineRef to false and currentPathRef to null
        return;
      }

      // Case 2: Start drawing a new line. Each line is a new path.
      const snapPoint = getSnapPoint(event.point);
      const startPoint = snapPoint || event.point;

      // Create a brand new path
      currentPathRef.current = new paper.Path({
        segments: [startPoint],
        strokeColor: new paper.Color('black'),
        strokeWidth: 2,
      });
      // Add a second point that will be moved by onMouseMove
      currentPathRef.current.add(startPoint);
      
      isDrawingLineRef.current = true;
    },
    
    onMouseMove: (event: paper.ToolEvent) => {
      if (snapIndicatorRef.current) snapIndicatorRef.current.visible = false;
      const snapPoint = getSnapPoint(event.point);
      if (isDrawingLineRef.current) currentPathRef.current!.lastSegment.point = snapPoint || event.point;
    },
    
    onMouseDrag: (event: paper.ToolEvent) => { 
      if (isPanning || isSpacebarPan) handleDragPan(event); 
    },
    
    onKeyDown: null,
    onKeyUp: null,
    onActivate: () => {},
    onDeactivate: () => {}
  };
}
