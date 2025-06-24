import paper from 'paper';
import React from 'react';

// StateManager contract for the Fit Point Spline tool
export interface FitSplineStateManager {
  setSplineSegmentCount?: (n: number) => void;
  currentSplineRef: React.MutableRefObject<paper.Path | null>;
  isDrawingSplineRef: React.MutableRefObject<boolean>;
  selectedSplinePointRef: React.MutableRefObject<{ path: paper.Path, index: number } | null>;
  finishCurrentSpline: () => void;
  isPanning: boolean;
  isSpacebarPan: boolean;
  handleDragPan: (event: paper.ToolEvent) => void;
  setIsSplineDrawing?: (val: boolean) => void; // Optional setter for React state
}

interface SelectedHandle {
  path: paper.Path;
  segmentIndex: number;
  handleType: 'in' | 'out';
}

export function createFitSplineTool(stateManager: FitSplineStateManager) {
  const {
    currentSplineRef,
    isDrawingSplineRef,
    selectedSplinePointRef,
    finishCurrentSpline,
    isPanning,
    isSpacebarPan,
    handleDragPan,
  } = stateManager;

  // Track selected handle for dragging
  let selectedHandle: SelectedHandle | null = null;

  // --- Drawing mode ---
  function onMouseDown(event: paper.ToolEvent) {
    console.log("[FitSplineTool] onMouseDown", event.point);
    if (isSpacebarPan) return;

    // --- Handle editing: check if user clicked a handle first ---
    if (isDrawingSplineRef.current && currentSplineRef.current) {
      const path = currentSplineRef.current;
      for (let i = 0; i < path.segments.length; i++) {
        const seg = path.segments[i];
        // Check handleIn
        if (seg.handleIn && seg.handleIn.length > 0 && seg.point.add(seg.handleIn).getDistance(event.point) < 10 / paper.view.zoom) {
          selectedHandle = { path, segmentIndex: i, handleType: 'in' };
          seg.selected = true;
          return;
        }
        // Check handleOut
        if (seg.handleOut && seg.handleOut.length > 0 && seg.point.add(seg.handleOut).getDistance(event.point) < 10 / paper.view.zoom) {
          selectedHandle = { path, segmentIndex: i, handleType: 'out' };
          seg.selected = true;
          return;
        }
      }
    }

    if (isDrawingSplineRef.current) {
      // First, hit test for an existing segment on the current spline
      const hit = paper.project.hitTest(event.point, { segments: true, tolerance: 10 / paper.view.zoom });
      if (
        hit &&
        hit.segment &&
        currentSplineRef.current &&
        hit.item === currentSplineRef.current
      ) {
        // Clicked on an existing point: select for dragging
        selectedSplinePointRef.current = { path: hit.item as paper.Path, index: hit.segment.index };
        hit.segment.selected = true;
        // Do NOT add a new point
        return;
      }
      // Not on an existing point: add a new fit point
      // Deselect any active point before adding
      if (selectedSplinePointRef.current) {
        const { path, index } = selectedSplinePointRef.current;
        if (path && path.segments[index]) {
          path.segments[index].selected = false;
        }
        selectedSplinePointRef.current = null;
      }
      if (!currentSplineRef.current) {
        // Start a new path
        const path = new paper.Path({
          segments: [event.point],
          strokeColor: new paper.Color('black'),
          strokeWidth: 2 / paper.view.zoom,
          fullySelected: true,
        });
        path.data = { isSpline: true, fitPoints: [event.point.clone()] };
        currentSplineRef.current = path;
        // Notify React state
        if (stateManager.setIsSplineDrawing) stateManager.setIsSplineDrawing(true);
        if (stateManager.setSplineSegmentCount)
          stateManager.setSplineSegmentCount(1);
      } else {
        currentSplineRef.current.add(event.point);
        currentSplineRef.current.data.fitPoints.push(event.point.clone());
        currentSplineRef.current.fullySelected = true;
        if (stateManager.setSplineSegmentCount && currentSplineRef.current)
          stateManager.setSplineSegmentCount(currentSplineRef.current.segments.length);
      }
      currentSplineRef.current.smooth({ type: 'catmull-rom', factor: 0.5 });
    } else {
      // --- Editing mode ---
      // Hit test for a segment
      const hit = paper.project.hitTest(event.point, { segments: true, tolerance: 10 / paper.view.zoom });
      if (hit && hit.segment && hit.item && hit.item.data && hit.item.data.isSpline) {
        selectedSplinePointRef.current = { path: hit.item as paper.Path, index: hit.segment.index };
        hit.segment.selected = true;
      } else {
        // Deselect
        if (selectedSplinePointRef.current) {
          const { path, index } = selectedSplinePointRef.current;
          path.segments[index].selected = false;
          selectedSplinePointRef.current = null;
        }
      }
    }
  }

  function onMouseDrag(event: paper.ToolEvent) {
    if (isPanning || isSpacebarPan) {
      handleDragPan(event);
      return;
    }
    // --- Drag handle if selected ---
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
    // --- Drag fit point if selected ---
    const sel = selectedSplinePointRef.current;
    if (sel && sel.path && sel.path.segments[sel.index]) {
      // Update the point of the dragged segment
      sel.path.segments[sel.index].point = event.point;
      // Update fitPoints array
      sel.path.data.fitPoints[sel.index] = event.point.clone();
      // Do not zero handles—allow user to edit them
    }
  }

  // --- Rubber band preview for spline drawing ---
  let previewSegment: paper.Segment | null = null;

  function onMouseMove(event: paper.ToolEvent) {
    if (isDrawingSplineRef.current && currentSplineRef.current) {
      const path = currentSplineRef.current;
      // Only preview if at least one real point exists
      if (path.segments.length > 0) {
        // If a preview segment already exists, update its point
        if (previewSegment) {
          previewSegment.point = event.point;
        } else {
          // Add a preview segment to the path
          const added = path.add(event.point);
          // Ensure preview segment strokeWidth scales with zoom
          if (Array.isArray(added) ? added[0] : added) {
            path.strokeWidth = 2 / paper.view.zoom;
          }
          previewSegment = Array.isArray(added) ? added[0] : added;
        }
        path.fullySelected = true;
        path.smooth({ type: 'catmull-rom', factor: 0.5 });
      }
    } else if (previewSegment) {
      // Not drawing, remove preview if it exists
      previewSegment.remove();
      previewSegment = null;
    }
  }

  // Patch onMouseDown to commit preview segment as a real point
  const originalOnMouseDown = onMouseDown;
  function patchedOnMouseDown(event: paper.ToolEvent) {
    if (isDrawingSplineRef.current && currentSplineRef.current && previewSegment) {
      // Remove preview segment before adding the real one (will be re-added below)
      previewSegment.remove();
      previewSegment = null;
    }
    originalOnMouseDown(event);
  }

  // Patch finish/cancel to remove preview
  // Only keep the patched finishSpline/cancelSpline implementations (above). Remove any duplicates below if present.


  function onMouseUp() {
    // Deselect handle after drag
    if (selectedHandle) {
      const { path, segmentIndex } = selectedHandle;
      path.segments[segmentIndex].selected = false;
      selectedHandle = null;
    }
  }

  function onKeyDown(event: paper.KeyEvent) {
    if (isDrawingSplineRef.current) {
      if (event.key === 'enter') {
        finishSpline();
      } else if (event.key === 'escape') {
        cancelSpline();
      }
    }
  }

  function onDoubleClick() {
    if (isDrawingSplineRef.current) {
      finishSpline();
    }
  }

  function finishSpline() {
    // Always remove preview segment BEFORE smoothing
    if (previewSegment) {
      previewSegment.remove();
      previewSegment = null;
    }
    if (currentSplineRef.current) {
      // Now smooth
      currentSplineRef.current.smooth({ type: 'catmull-rom', factor: 0.5 });
      // Set BOTH handles of the last segment to zero for a truly neutral end
      const segs = currentSplineRef.current.segments;
      if (segs.length > 0) {
        segs[segs.length - 1].handleIn = new paper.Point(0, 0);
        segs[segs.length - 1].handleOut = new paper.Point(0, 0);
      }
      currentSplineRef.current.fullySelected = false;
      currentSplineRef.current.data.isSpline = true;
    }
    isDrawingSplineRef.current = false;
    if (stateManager.setIsSplineDrawing) stateManager.setIsSplineDrawing(false);
    finishCurrentSpline();
  }

  function cancelSpline() {
    // Remove preview segment if it exists
    if (previewSegment) {
      previewSegment.remove();
      previewSegment = null;
    }
    if (currentSplineRef.current) {
      if (stateManager.setSplineSegmentCount) stateManager.setSplineSegmentCount(0);
      currentSplineRef.current.remove();
      currentSplineRef.current = null;
    }
    isDrawingSplineRef.current = false;
    if (stateManager.setIsSplineDrawing) stateManager.setIsSplineDrawing(false);
    finishCurrentSpline();
  }

  function onActivate() {
    document.body.style.cursor = isDrawingSplineRef.current ? 'crosshair' : 'pointer';
  }

  function onDeactivate() {
    document.body.style.cursor = 'default';
    // Deselect any selected point
    if (selectedSplinePointRef.current) {
      const { path, index } = selectedSplinePointRef.current;
      path.segments[index].selected = false;
      selectedSplinePointRef.current = null;
    }
  }

  const toolApi = {
    onMouseDown: patchedOnMouseDown,
    onMouseDrag,
    onMouseMove,
    onMouseUp,
    onKeyDown,
    onDoubleClick,
    finishSpline, // Expose for external calls
    onActivate,
    onDeactivate,
  };
  return toolApi;
}
