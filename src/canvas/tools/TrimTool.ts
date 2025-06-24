import paper from 'paper';

interface StateManager {
  finishCurrentDrawing: () => void;
  isPanning: boolean;
  isSpacebarPan: boolean;
  handleDragPan: (event: paper.ToolEvent) => void;
}

const BASE_STROKE_WIDTH = 2;

export function createTrimTool(stateManager: StateManager) {
  const { finishCurrentDrawing, isPanning, isSpacebarPan, handleDragPan } = stateManager;

  let highlightPath: paper.Path | null = null;

  function cleanupHighlight() {
    if (highlightPath) {
      highlightPath.remove();
      highlightPath = null;
    }
  }

  function findNearestIntersection(path: paper.Path, eventPoint: paper.Point) {
    let nearest = null, minDist = Infinity;
    for (const other of paper.project.activeLayer.children) {
      if (other === path || !(other instanceof paper.Path) || !other.visible) continue;
      const inters = path.getIntersections(other);
      for (const inter of inters) {
        const dist = inter.point.getDistance(eventPoint);
        if (dist < minDist) { minDist = dist; nearest = inter; }
      }
    }
    return nearest;
  }

  function getTrimOffsets(path: paper.Path, eventPoint: paper.Point, nearestInter: any) {
    const nearestLoc = path.getNearestLocation(eventPoint);
    const clickOffset = nearestLoc ? nearestLoc.offset : null;
    let from = 0, to = path.length;
    if (nearestInter) {
      const intersectionOffset = path.getOffsetOf(nearestInter.point);
      if (clickOffset !== null && clickOffset < intersectionOffset) {
        from = 0;
        to = intersectionOffset;
      } else {
        from = intersectionOffset;
        to = path.length;
      }
    } else if (!path.closed) {
      // No intersection and open: highlight whole line
      from = 0;
      to = path.length;
    } else {
      const startDist = path.firstSegment.point.getDistance(eventPoint);
      const endDist = path.lastSegment.point.getDistance(eventPoint);
      if (startDist < endDist) {
        from = 0;
        to = path.length / 2;
      } else {
        from = path.length / 2;
        to = path.length;
      }
    }
    return { from, to };
  }

  function createHighlight(path: paper.Path, from: number, to: number) {
    const highlight = new paper.Path({
      strokeColor: new paper.Color('red'),
      strokeWidth: BASE_STROKE_WIDTH / paper.view.zoom,
      dashArray: [8 / paper.view.zoom, 8 / paper.view.zoom],
      opacity: 0.7,
      visible: true
    });
    if (!path.closed || from <= to) {
      const step = Math.max(1, (to - from) / 32);
      for (let offset = from; offset <= to; offset += step) {
        const loc = path.getLocationAt(offset);
        if (loc) highlight.add(loc.point);
      }
      const locEnd = path.getLocationAt(to);
      if (locEnd) highlight.add(locEnd.point);
    } else {
      // Closed path, wrap around
      const stepA = Math.max(1, (path.length - from) / 16);
      for (let offset = from; offset <= path.length; offset += stepA) {
        const loc = path.getLocationAt(offset);
        if (loc) highlight.add(loc.point);
      }
      const stepB = Math.max(1, to / 16);
      for (let offset = 0; offset <= to; offset += stepB) {
        const loc = path.getLocationAt(offset);
        if (loc) highlight.add(loc.point);
      }
      const locEnd = path.getLocationAt(to);
      if (locEnd) highlight.add(locEnd.point);
    }
    return highlight;
  }

  /**
   * Splits a rectangle (or polygon) at intersections with another path.
   * Returns all resulting path pieces (including the original, split in place).
   * The caller is responsible for removing/keeping pieces as needed.
   */
  /**
   * Splits a closed path (rectangle/polygon) at exactly two intersections with another path.
   * Returns the two resulting closed polygons (if possible).
   */
  function splitPathAtIntersections(closedPath: paper.Path, cuttingPath: paper.Path): paper.Path[] {
    const intersections = closedPath.getIntersections(cuttingPath);
    if (intersections.length !== 2) return [];
    // Get offsets and sort ascending
    const epsilon = 1e-2;
    const offsets = intersections
      .map(loc => closedPath.getOffsetOf(loc.point))
      .filter(offset => offset > epsilon && offset < closedPath.length - epsilon)
      .sort((a, b) => a - b);
    if (offsets.length !== 2) return [];
    // Split at higher offset first to avoid offset invalidation
    const [offset1, offset2] = offsets;
    // Split at offset2, then offset1
    const firstSplit = closedPath.splitAt(offset2);
    if (!firstSplit) return [];
    // After splitting, we have two open paths: closedPath and firstSplit
    // Close both to form polygons
    closedPath.closed = true;
    firstSplit.closed = true;
    return [closedPath, firstSplit];
  }

  function trimOpenPath(path: paper.Path, from: number, to: number) {
    // If trimming the entire path, just remove
    if (from === 0 && to === path.length) {
      path.remove();
      return;
    }
    // Always split at the larger offset first to avoid offset invalidation
    const larger = Math.max(from, to);
    const smaller = Math.min(from, to);
    path.splitAt(larger);
    const toRemove = path.splitAt(smaller);
    if (toRemove) toRemove.remove();
  }

  function trimClosedPath(path: paper.Path, from: number, to: number) {
    const len = path.length;
    // If trimming the entire path, just remove
    if (from === 0 && to === len) {
      path.remove();
      return;
    }
    const newPath = new paper.Path({
      strokeColor: path.strokeColor,
      strokeWidth: path.strokeWidth,
      closed: true,
      data: { ...path.data }
    });
    if (from <= to) {
      const step = Math.max(1, (to - from) / 32);
      for (let offset = from; offset <= to; offset += step) {
        const loc = path.getLocationAt(offset);
        if (loc) newPath.add(loc.point);
      }
      const locEnd = path.getLocationAt(to);
      if (locEnd) newPath.add(locEnd.point);
    } else {
      // Wrap around
      const stepA = Math.max(1, (len - from) / 16);
      for (let offset = from; offset <= len; offset += stepA) {
        const loc = path.getLocationAt(offset);
        if (loc) newPath.add(loc.point);
      }
      const stepB = Math.max(1, to / 16);
      for (let offset = 0; offset <= to; offset += stepB) {
        const loc = path.getLocationAt(offset);
        if (loc) newPath.add(loc.point);
      }
      const locEnd = path.getLocationAt(to);
      if (locEnd) newPath.add(locEnd.point);
    }
    if (path.data && path.data.isArc) newPath.data.isArc = true;
    path.remove();
  }

  function onMouseMove(event: paper.ToolEvent) {
    cleanupHighlight();
    if (isPanning || isSpacebarPan) return;

    const hit = paper.project.hitTest(event.point, { segments: false, stroke: true, tolerance: 8 / paper.view.zoom });
    if (!hit || !(hit.item instanceof paper.Path) || !hit.item.visible) return;
    const path = hit.item as paper.Path;
    if (path.segments.length < 2) return;

    const nearest = findNearestIntersection(path, event.point);
    const { from, to } = getTrimOffsets(path, event.point, nearest);

    // Debug output
    console.log('[TrimTool] onMouseMove', {
      pathId: path.id,
      pathType: path.data?.isArc ? 'arc' : path.data?.isSpline ? 'spline' : 'line',
      eventPoint: event.point,
      trimMode: nearest ? 'intersection' : 'endpoint',
      intersectionOffset: nearest ? path.getOffsetOf(nearest.point) : null,
      from,
      to,
      pathLength: path.length
    });

    highlightPath = createHighlight(path, from, to);
  }

  function onMouseDown(event: paper.ToolEvent) {
    cleanupHighlight();
    const hit = paper.project.hitTest(event.point, { segments: false, stroke: true, tolerance: 8 / paper.view.zoom });
    if (!hit || !(hit.item instanceof paper.Path) || !hit.item.visible) return;
    const path = hit.item as paper.Path;
    if (path.segments.length < 2) return;
    const nearest = findNearestIntersection(path, event.point);
    const { from, to } = getTrimOffsets(path, event.point, nearest);
    // If no intersection and path is open, delete the whole path (single unconnected line)
    if (!nearest && !path.closed) {
      path.remove();
      finishCurrentDrawing();
      return;
    }

    if (path.closed) {
      let didSplit = false;
      for (const other of paper.project.activeLayer.children) {
        if (other !== path && other instanceof paper.Path && other.visible) {
          const pieces = splitPathAtIntersections(path, other);
          if (pieces.length === 2) {
            for (const piece of pieces) {
              if ((piece.hitTest && piece.hitTest(event.point)) || (piece.contains && piece.contains(event.point))) {
                piece.remove();
                didSplit = true;
                break;
              }
            }
            break;
          }
        }
      }
      if (didSplit) {
        finishCurrentDrawing();
        return;
      }
    }

    if (!path.closed) {
      trimOpenPath(path, from, to);
    } else {
      trimClosedPath(path, from, to);
    }
    finishCurrentDrawing();
  }

  return {
    onMouseMove,
    onMouseDown,
    onDeactivate: cleanupHighlight,
    onMouseDrag: (event: paper.ToolEvent) => {
      if (isPanning || isSpacebarPan) handleDragPan(event);
    },
    onActivate: () => {},
    onKeyDown: null,
    onKeyUp: null
  };
}
