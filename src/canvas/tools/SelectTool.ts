import paper from 'paper';
import { isSketchPath, nearestSketchPath } from '../geometry/pathCuts';
import { ancestorDimension, offsetDimension } from '../dimensions';
import { movePath } from '../geometry/itemData';
import { isPrimaryButton, isShiftHeld } from './drawingState';
import { applyMarqueeSelection, createMarqueePreview, isClickNotDrag, marqueeMode } from './marquee';

interface StateManager {
  draggedSegmentRef: React.MutableRefObject<paper.Segment | null>;
  isPanningRef: React.MutableRefObject<boolean>;
  isSpacebarPanRef: React.MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
  handleVertexDrag: (event: paper.ToolEvent) => void;
}

interface SelectedHandle {
  path: paper.Path;
  segmentIndex: number;
  handleType: 'in' | 'out';
}

interface MarqueeState {
  from: paper.Point;
  additive: boolean;
  preview: paper.Path | null;
  dragging: boolean;
}

/**
 * Selection and direct manipulation: drag a vertex to edit it, drag a stroke to
 * move the whole path (and every other selected path), Shift-click to add to
 * the selection, drag spline handles to reshape curves. Empty-canvas drag is a
 * window (L→R) or crossing (R→L) marquee.
 */
export function createSelectTool(stateManager: StateManager) {
  const { draggedSegmentRef, isPanningRef, isSpacebarPanRef, handleDragPan, handleVertexDrag } = stateManager;

  let selectedHandle: SelectedHandle | null = null;
  let movingPaths: paper.Path[] = [];
  let movingDimensions: paper.Group[] = [];
  let marquee: MarqueeState | null = null;

  const matchSketch = (h: paper.HitResult) => isSketchPath(h.item);

  function selectedSketchPaths(): paper.Path[] {
    return paper.project.selectedItems.filter(isSketchPath);
  }

  function clearMarqueePreview() {
    if (!marquee) return;
    marquee.preview?.remove();
    marquee.preview = null;
  }

  function cancelMarquee() {
    clearMarqueePreview();
    marquee = null;
  }

  function updateMarquee(to: paper.Point) {
    if (!marquee) return;
    if (!marquee.dragging && isClickNotDrag(marquee.from, to)) return;
    marquee.dragging = true;
    clearMarqueePreview();
    marquee.preview = createMarqueePreview(marquee.from, to);
  }

  function finishMarquee(to: paper.Point) {
    if (!marquee) return;
    const { from, additive, dragging } = marquee;
    cancelMarquee();
    if (!dragging || isClickNotDrag(from, to)) {
      if (!additive) paper.project.deselectAll();
      return;
    }
    applyMarqueeSelection(new paper.Rectangle(from, to), marqueeMode(from, to), additive);
  }

  return {
    onMouseDown: (event: paper.ToolEvent) => {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;
      draggedSegmentRef.current = null;
      selectedHandle = null;
      movingPaths = [];
      movingDimensions = [];
      cancelMarquee();
      const tolerance = 8 / paper.view.zoom;
      const additive = isShiftHeld(event);

      const dimHit = paper.project.hitTest(event.point, {
        fill: true,
        stroke: true,
        bounds: true,
        tolerance,
      });
      const dimension = dimHit ? ancestorDimension(dimHit.item) : null;
      if (dimension) {
        if (additive) dimension.selected = !dimension.selected;
        else if (!dimension.selected) {
          paper.project.deselectAll();
          dimension.selected = true;
        }
        if (dimension.selected) {
          movingDimensions = paper.project.selectedItems.filter(
            (item): item is paper.Group => item instanceof paper.Group && Boolean(item.data?.isDimension)
          );
        }
        return;
      }

      const handleHit = paper.project.hitTest(event.point, { handles: true, tolerance, match: matchSketch });
      if (handleHit && handleHit.item instanceof paper.Path && handleHit.item.data?.isSpline) {
        if (handleHit.type === 'handle-in' || handleHit.type === 'handle-out') {
          selectedHandle = {
            path: handleHit.item,
            segmentIndex: handleHit.segment.index,
            handleType: handleHit.type === 'handle-in' ? 'in' : 'out',
          };
          handleHit.item.fullySelected = true;
          return;
        }
      }

      const segmentHit = paper.project.hitTest(event.point, { segments: true, tolerance, match: matchSketch });
      if (segmentHit && segmentHit.item instanceof paper.Path) {
        draggedSegmentRef.current = segmentHit.segment;
        if (!segmentHit.item.selected) {
          if (!additive) paper.project.deselectAll();
          segmentHit.item.selected = true;
        }
        if (segmentHit.item.data?.isSpline) segmentHit.item.fullySelected = true;
        return;
      }

      const strokeHit = nearestSketchPath(event.point, tolerance);
      if (strokeHit) {
        const path = strokeHit.path;
        if (additive) {
          path.selected = !path.selected;
        } else if (!path.selected) {
          paper.project.deselectAll();
          path.selected = true;
        }
        if (path.data?.isSpline && path.selected) path.fullySelected = true;
        movingPaths = path.selected ? selectedSketchPaths() : [];
        return;
      }

      marquee = { from: event.point.clone(), additive, preview: null, dragging: false };
    },

    onMouseDrag: (event: paper.ToolEvent) => {
      if (isPanningRef.current || isSpacebarPanRef.current) {
        handleDragPan(event);
        return;
      }
      if (marquee) {
        updateMarquee(event.point);
        return;
      }
      if (selectedHandle) {
        const { path, segmentIndex, handleType } = selectedHandle;
        const seg = path.segments[segmentIndex];
        const newHandle = event.point.subtract(seg.point);
        if (handleType === 'in') {
          seg.handleIn = newHandle;
          seg.handleOut = newHandle.multiply(-1);
        } else {
          seg.handleOut = newHandle;
          seg.handleIn = newHandle.multiply(-1);
        }
        return;
      }
      if (draggedSegmentRef.current) {
        handleVertexDrag(event);
        return;
      }
      if (movingDimensions.length) {
        for (const group of movingDimensions) offsetDimension(group, event.delta);
        return;
      }
      if (movingPaths.length) {
        for (const path of movingPaths) movePath(path, event.delta);
      }
    },

    onMouseUp: (event?: paper.ToolEvent) => {
      if (marquee) finishMarquee(event?.point ?? marquee.from);
      draggedSegmentRef.current = null;
      selectedHandle = null;
      movingPaths = [];
      movingDimensions = [];
    },

    cancel: cancelMarquee,
    isBusy: () => Boolean(marquee),
    onKeyDown: null,
    onKeyUp: null,
    onActivate: () => {},
    onDeactivate: cancelMarquee,
  };
}
