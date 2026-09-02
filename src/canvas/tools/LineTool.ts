import paper from 'paper';
import { constrainToAxis } from '../../utils/snapHelpers';
import { assignActiveLayer } from '../layers';
import {
  isPrimaryButton,
  isShiftHeld,
  sketchStrokeColor,
  sketchStrokeWidth,
  type DrawingState,
} from './drawingState';

/**
 * CAD-style line drawing: click to start, click to place each vertex; each
 * segment becomes its own path and the next one starts where the last ended.
 * Escape (handled by the canvas) ends the chain. Shift constrains to 45° steps.
 */
export function createLineTool(stateManager: DrawingState) {
  const {
    currentPathRef,
    isDrawingLineRef,
    snapIndicatorRef,
    finishCurrentDrawing,
    getSnapPoint,
    isPanningRef,
    isSpacebarPanRef,
    handleDragPan,
  } = stateManager;

  function beginAt(start: paper.Point) {
    currentPathRef.current = new paper.Path({
      segments: [start, start],
      strokeColor: sketchStrokeColor(),
      strokeWidth: sketchStrokeWidth(),
    });
    assignActiveLayer(currentPathRef.current);
    isDrawingLineRef.current = true;
  }

  function resolveEndPoint(event: paper.ToolEvent): paper.Point {
    const snapPoint = getSnapPoint(event.point);
    if (snapPoint) return snapPoint;
    const path = currentPathRef.current;
    if (path && isShiftHeld(event)) return constrainToAxis(path.firstSegment.point, event.point);
    return event.point;
  }

  return {
    onMouseDown: (event: paper.ToolEvent) => {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;

      if (isDrawingLineRef.current && currentPathRef.current) {
        const path = currentPathRef.current;
        const endPoint = resolveEndPoint(event);
        path.lastSegment.point = endPoint;

        if (path.firstSegment.point.isClose(endPoint, 1e-6)) {
          // Clicking the start point again ends the chain without a zero-length line.
          path.remove();
          currentPathRef.current = null;
          finishCurrentDrawing();
          return;
        }

        finishCurrentDrawing();
        beginAt(endPoint);
        return;
      }

      beginAt(getSnapPoint(event.point) ?? event.point);
    },

    onMouseMove: (event: paper.ToolEvent) => {
      if (isDrawingLineRef.current && currentPathRef.current) {
        currentPathRef.current.lastSegment.point = resolveEndPoint(event);
      } else {
        getSnapPoint(event.point);
      }
      if (snapIndicatorRef.current) snapIndicatorRef.current.bringToFront();
    },

    onMouseDrag: (event: paper.ToolEvent) => {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },

    /** Continue the chain from a point placed by numeric entry. */
    beginAt,

    onKeyDown: null,
    onKeyUp: null,
    onActivate: () => {},
    onDeactivate: () => {},
  };
}
