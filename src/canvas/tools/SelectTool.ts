import paper from 'paper';

interface StateManager {
  draggedSegmentRef: React.MutableRefObject<paper.Segment | null>;
  isPanning: boolean;
  isSpacebarPan: boolean;
  handleDragPan: (event: paper.ToolEvent) => void;
  handleVertexDrag: (event: paper.ToolEvent) => void;
}

export function createSelectTool(_canvasRef: React.RefObject<HTMLCanvasElement | null>, stateManager: StateManager) {
  const {
    draggedSegmentRef,
    isPanning,
    isSpacebarPan,
    handleDragPan,
    handleVertexDrag
  } = stateManager;

  // Track selected spline handle for dragging
  let selectedHandle: {
    path: paper.Path,
    segmentIndex: number,
    handleType: 'in' | 'out'
  } | null = null;

  return {
    onMouseDown: (event: paper.ToolEvent) => {
      draggedSegmentRef.current = null;
      selectedHandle = null;
      // First, check if a spline handle was clicked
      const hit = paper.project.hitTest(event.point, { segments: true, handles: true, tolerance: 10 });
      if (hit && hit.item && hit.item.data && hit.item.data.isSpline && hit.item instanceof paper.Path) {
        // Check if a handle was clicked
        if (hit.type === 'handle-in' || hit.type === 'handle-out') {
          selectedHandle = {
            path: hit.item,
            segmentIndex: hit.segment.index,
            handleType: hit.type === 'handle-in' ? 'in' : 'out'
          };
          hit.item.fullySelected = true;
          return;
        }
      }
      // Otherwise, proceed as before
      const segmentHit = paper.project.hitTest(event.point, { segments: true, tolerance: 5 });
      if (segmentHit) {
        draggedSegmentRef.current = segmentHit.segment;
        if (!segmentHit.item.selected) { 
          paper.project.deselectAll(); 
          segmentHit.item.selected = true; 
        }
        // If this is a spline, show all Bezier handles
        if (segmentHit.item.data && segmentHit.item.data.isSpline && segmentHit.item instanceof paper.Path) {
          (segmentHit.item as paper.Path).fullySelected = true;
        }
        return;
      }
      const pathHit = paper.project.hitTest(event.point, { stroke: true, tolerance: 5 });
      if (pathHit) { 
        paper.project.deselectAll(); 
        pathHit.item.selected = true; 
        // If this is a spline, show all Bezier handles
        if (pathHit.item.data && pathHit.item.data.isSpline && pathHit.item instanceof paper.Path) {
          (pathHit.item as paper.Path).fullySelected = true;
        }
      } else { 
        paper.project.deselectAll(); 
      }
    },
    
    onMouseDrag: (event: paper.ToolEvent) => { 
      if (isPanning || isSpacebarPan) {
        handleDragPan(event);
        return;
      }
      // If a spline handle is being dragged, update it
      if (selectedHandle) {
        const { path, segmentIndex, handleType } = selectedHandle;
        const seg = path.segments[segmentIndex];
        const newHandle = event.point.subtract(seg.point);
        if (handleType === 'in') {
          seg.handleIn = newHandle;
          seg.handleOut = new paper.Point(-newHandle.x, -newHandle.y);
        } else {
          seg.handleOut = newHandle;
          seg.handleIn = new paper.Point(-newHandle.x, -newHandle.y);
        }
        // Do NOT call .smooth() here; this would overwrite manual handle edits
        return;
      }
      handleVertexDrag(event);
    },
    
    onMouseUp: () => { 
      draggedSegmentRef.current = null; 
      selectedHandle = null;
    },
    
    onKeyDown: null,
    onKeyUp: null,
    onActivate: () => {},
    onDeactivate: () => {}
  };
}
