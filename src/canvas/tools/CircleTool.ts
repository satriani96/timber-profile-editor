import paper from 'paper';
import { preserveMeta } from '../geometry/itemData';
import { assignActiveLayer } from '../layers';
import { adoptGeometry, isPrimaryButton, sketchStrokeColor, sketchStrokeWidth, type DrawingState } from './drawingState';

/** Center-radius circle: click the center, then click (or type a diameter) for the radius. */
export function createCircleTool(stateManager: DrawingState) {
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

  function setRadius(path: paper.Path, center: paper.Point, radius: number) {
    adoptGeometry(path, new paper.Path.Circle({ center, radius: Math.max(radius, 1e-6), insert: false }));
    path.data = preserveMeta(path, { center, radius, isArc: false });
  }

  return {
    onMouseDown: (event: paper.ToolEvent) => {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;

      if (isDrawingLineRef.current && currentPathRef.current) {
        const path = currentPathRef.current;
        const center = path.data.center as paper.Point;
        const endPoint = getSnapPoint(event.point, path) ?? event.point;
        const radius = center.getDistance(endPoint);
        if (radius <= 1e-6) return;
        setRadius(path, center, radius);
        finishCurrentDrawing();
        return;
      }

      finishCurrentDrawing();
      resetNumericInput();
      const center = getSnapPoint(event.point) ?? event.point;
      const path = new paper.Path.Circle({
        center,
        radius: 1e-6,
        strokeColor: sketchStrokeColor(),
        strokeWidth: sketchStrokeWidth(),
      });
      path.data = { center, radius: 0, isArc: false };
      assignActiveLayer(path);
      currentPathRef.current = path;
      isDrawingLineRef.current = true;
    },

    onMouseMove: (event: paper.ToolEvent) => {
      const path = currentPathRef.current;
      if (isDrawingLineRef.current && path) {
        const center = path.data.center as paper.Point;
        const snapPoint = getSnapPoint(event.point, path);
        setRadius(path, center, center.getDistance(snapPoint ?? event.point));
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
