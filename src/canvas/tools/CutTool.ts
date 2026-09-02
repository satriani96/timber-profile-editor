import paper from 'paper';
import type { MutableRefObject } from 'react';
import { BASE_STROKE_WIDTH } from '../../components/sketch/constants';
import {
  collectCutOffsets,
  cutInterval,
  findCutInterval,
  nearestSketchPath,
  openClosedPathAt,
  type CutInterval,
} from '../geometry/pathCuts';

interface StateManager {
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
}

type CutMode = 'trim' | 'split';

const HOVER_TOLERANCE_PX = 8;
const COLORS: Record<CutMode, string> = {
  trim: '#dc2626',
  split: '#2563eb',
};

interface CutTarget {
  path: paper.Path;
  interval: CutInterval;
  cuts: number[];
}

/**
 * Trim: remove the stretch of the hovered path between its nearest cuts
 * (intersections with, or endpoints of, other sketch paths). With no cuts the
 * whole path is removed.
 *
 * Split: break the hovered path at its nearest cuts so the stretch under the
 * cursor becomes its own path. Nothing is removed.
 */
function createCutTool(mode: CutMode, stateManager: StateManager) {
  const { isPanningRef, isSpacebarPanRef, handleDragPan } = stateManager;

  let highlight: paper.Path | null = null;
  let markers: paper.Path[] = [];
  let highlightKey = '';

  function clearHighlight() {
    highlight?.remove();
    highlight = null;
    markers.forEach((m) => m.remove());
    markers = [];
    highlightKey = '';
  }

  function locate(point: paper.Point): CutTarget | null {
    const hit = nearestSketchPath(point, HOVER_TOLERANCE_PX / paper.view.zoom);
    if (!hit) return null;
    const cuts = collectCutOffsets(hit.path);
    const interval = findCutInterval(hit.path, hit.location.offset, cuts);
    return { path: hit.path, interval, cuts };
  }

  /** A closed path with a single cut can still be split: it is opened at that point. */
  function canSplitWhole(target: CutTarget): boolean {
    return target.path.closed && target.cuts.length === 1;
  }

  function isActionable(target: CutTarget): boolean {
    if (mode === 'trim') return true;
    return !target.interval.whole || canSplitWhole(target);
  }

  function showHighlight(target: CutTarget) {
    const { path, interval } = target;
    const zoom = paper.view.zoom;
    // Preview stroke and markers are sized in screen pixels, so the zoom is part of the identity.
    const key = `${path.id}:${interval.from.toFixed(4)}:${interval.to.toFixed(4)}:${interval.whole}:${zoom}`;
    if (key === highlightKey && highlight && highlight.isInserted()) return;
    clearHighlight();

    const clone = path.clone({ insert: true }) as paper.Path;
    clone.data = { ...clone.data, isTemporary: true };
    let piece = clone;
    if (!interval.whole) {
      const result = cutInterval(clone, interval);
      piece = result.piece;
      result.rest.forEach((r) => r.remove());
    }
    piece.data = { isTemporary: true };
    piece.selected = false;
    piece.strokeColor = new paper.Color(COLORS[mode]);
    piece.strokeWidth = (BASE_STROKE_WIDTH + 2) / zoom;
    piece.opacity = 0.85;
    piece.dashArray = mode === 'trim' ? [6 / zoom, 4 / zoom] : [];
    highlight = piece;

    if (mode === 'split') {
      const points = interval.whole
        ? [path.getPointAt(target.cuts[0])]
        : [piece.firstSegment.point, piece.lastSegment.point];
      markers = points
        .filter((p): p is paper.Point => Boolean(p))
        .map(
          (p) =>
            new paper.Path.Circle({
              center: p,
              radius: 4 / zoom,
              fillColor: new paper.Color('white'),
              strokeColor: new paper.Color(COLORS.split),
              strokeWidth: 1.5 / zoom,
              data: { isTemporary: true },
            })
        );
    }
    highlightKey = key;
  }

  function onMouseMove(event: paper.ToolEvent) {
    if (isPanningRef.current || isSpacebarPanRef.current) {
      clearHighlight();
      return;
    }
    const target = locate(event.point);
    if (!target || !isActionable(target)) {
      clearHighlight();
      return;
    }
    showHighlight(target);
  }

  function onMouseDown(event: paper.ToolEvent) {
    if (isPanningRef.current || isSpacebarPanRef.current) return;
    clearHighlight();
    const target = locate(event.point);
    if (!target || !isActionable(target)) return;

    const { path, interval } = target;
    if (mode === 'trim') {
      if (interval.whole) {
        path.remove();
      } else {
        cutInterval(path, interval).piece.remove();
      }
    } else if (interval.whole) {
      openClosedPathAt(path, target.cuts[0]);
    } else {
      cutInterval(path, interval);
    }
    paper.project.deselectAll();
    onMouseMove(event);
  }

  return {
    onMouseMove,
    onMouseDown,
    onMouseDrag: (event: paper.ToolEvent) => {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },
    onActivate: () => {},
    onDeactivate: clearHighlight,
    onKeyDown: null,
    onKeyUp: null,
  };
}

export function createTrimTool(stateManager: StateManager) {
  return createCutTool('trim', stateManager);
}

export function createSplitTool(stateManager: StateManager) {
  return createCutTool('split', stateManager);
}
