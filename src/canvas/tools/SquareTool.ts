import paper from 'paper';
import { adoptGeometry, isPrimaryButton, sketchStrokeColor, sketchStrokeWidth, type DrawingState } from './drawingState';

/** Two-corner rectangle: click one corner, then click (or type W/H) for the opposite corner. */
export function createSquareTool(stateManager: DrawingState) {
  const {
    currentPathRef,
    isDrawingLineRef,
    finishCurrentDrawing,
    resetNumericInput,
    getSnapPoint,
    isPanningRef,
    isSpacebarPanRef,
    handleDragPan,
  } = stateManager;

  function setCorner(path: paper.Path, start: paper.Point, end: paper.Point) {
    adoptGeometry(path, new paper.Path.Rectangle({ from: start, to: end, insert: false }));
    path.data = {
      isRect: true,
      startPoint: start,
      endPoint: end,
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }

  return {
    onMouseDown: (event: paper.ToolEvent) => {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;

      if (isDrawingLineRef.current && currentPathRef.current) {
        const path = currentPathRef.current;
        const start = path.data.startPoint as paper.Point;
        const end = getSnapPoint(event.point, path) ?? event.point;
        if (Math.abs(end.x - start.x) < 1e-6 || Math.abs(end.y - start.y) < 1e-6) return;
        setCorner(path, start, end);
        finishCurrentDrawing();
        return;
      }

      finishCurrentDrawing();
      resetNumericInput();
      const start = getSnapPoint(event.point) ?? event.point;
      const path = new paper.Path.Rectangle({
        from: start,
        to: start.add([1e-6, 1e-6]),
        strokeColor: sketchStrokeColor(),
        strokeWidth: sketchStrokeWidth(),
      });
      path.data = { isRect: true, startPoint: start, endPoint: start, width: 0, height: 0 };
      currentPathRef.current = path;
      isDrawingLineRef.current = true;
    },

    onMouseMove: (event: paper.ToolEvent) => {
      const path = currentPathRef.current;
      if (isDrawingLineRef.current && path) {
        const start = path.data.startPoint as paper.Point;
        const snapPoint = getSnapPoint(event.point, path);
        setCorner(path, start, snapPoint ?? event.point);
      } else {
        getSnapPoint(event.point);
      }
    },

    onMouseDrag: (event: paper.ToolEvent) => {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },

    onMouseUp: () => {},
    onKeyDown: null,
    onKeyUp: null,
    onActivate: () => {},
    onDeactivate: () => {},
  };
}
