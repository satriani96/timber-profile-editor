import paper from 'paper';
import type { MutableRefObject } from 'react';
import { BASE_STROKE_WIDTH } from '../../components/sketch/constants';
import { classifyLinearKind, createDimension, measureDimension, rebuildDimension, type DimensionData } from '../dimensions';
import { findSnap, type SnapConfig } from '../../utils/snapHelpers';
import { isPrimaryButton } from './drawingState';
import { pickDimensionTarget } from './dimensionPick';

export interface DimensionToolState {
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  isDimensioningRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
  getSnapConfig: () => SnapConfig;
}

interface PendingLinear {
  mode: 'linear';
  p1: paper.Point;
  p2: paper.Point;
}

interface PendingRadial {
  mode: 'radial';
  kind: 'diameter' | 'radius';
  center: paper.Point;
  onCurve: paper.Point;
}

interface PendingDistance {
  mode: 'distance';
  first: paper.Point;
}

type Pending = PendingLinear | PendingRadial | PendingDistance;

const HOVER_COLOR = '#2563eb';

function setCursor(cursor: string) {
  const el = paper.view?.element as HTMLElement | undefined;
  if (el) el.style.cursor = cursor;
}

export function createDimensionTool(state: DimensionToolState) {
  const { isPanningRef, isSpacebarPanRef, isDimensioningRef, handleDragPan, getSnapConfig } = state;

  let pending: Pending | null = null;
  let preview: paper.Group | null = null;
  let hoverClone: paper.Path | null = null;
  let hoverPath: paper.Path | null = null;

  function clearPreview() {
    preview?.remove();
    preview = null;
  }

  function clearHover() {
    hoverClone?.remove();
    hoverClone = null;
    hoverPath = null;
  }

  function finish() {
    clearPreview();
    clearHover();
    pending = null;
    isDimensioningRef.current = false;
    setCursor('crosshair');
  }

  function cancel() {
    finish();
  }

  function highlightEntity(path: paper.Path) {
    if (hoverPath === path && hoverClone?.isInserted()) return;
    clearHover();
    hoverPath = path;
    const clone = path.clone();
    clone.data = { isTemporary: true };
    clone.selected = false;
    clone.fillColor = null;
    clone.strokeColor = new paper.Color(HOVER_COLOR);
    clone.strokeWidth = (path.strokeWidth || BASE_STROKE_WIDTH / paper.view.zoom) + 1.5 / paper.view.zoom;
    clone.bringToFront();
    hoverClone = clone;
  }

  function showPreview(data: Omit<DimensionData, 'isDimension' | 'layer'>) {
    if (!preview) {
      preview = createDimension(data);
      preview.data.isTemporary = true;
    } else {
      Object.assign(preview.data, data, { isDimension: true, isTemporary: true, layer: preview.data.layer });
      rebuildDimension(preview);
    }
  }

  function updatePreview(place: paper.Point) {
    if (!pending || pending.mode === 'distance') return;
    if (pending.mode === 'linear') {
      const kind = classifyLinearKind(pending.p1, pending.p2, place);
      showPreview({
        kind,
        p1: pending.p1.clone(),
        p2: pending.p2.clone(),
        textPoint: place.clone(),
        value: measureDimension(kind, pending.p1, pending.p2),
      });
      return;
    }
    showPreview({
      kind: pending.kind,
      p1: pending.center.clone(),
      p2: pending.onCurve.clone(),
      textPoint: place.clone(),
      value: measureDimension(pending.kind, pending.center, pending.onCurve),
    });
  }

  function commit(place: paper.Point) {
    if (!pending || pending.mode === 'distance') return;
    updatePreview(place);
    if (!preview) return;
    delete preview.data.isTemporary;
    preview = null;
    pending = null;
    isDimensioningRef.current = false;
    clearHover();
  }

  function updateHover(point: paper.Point, snapConfig: SnapConfig) {
    if (pending?.mode === 'distance') {
      findSnap(point, snapConfig);
      clearHover();
      setCursor('crosshair');
      return;
    }
    if (pending) {
      findSnap(point, snapConfig);
      clearHover();
      updatePreview(point);
      return;
    }
    const pick = pickDimensionTarget(point, snapConfig);
    if (pick?.type === 'point') {
      clearHover();
      setCursor('crosshair');
      return;
    }
    if (pick) {
      highlightEntity(pick.path);
      setCursor('pointer');
      return;
    }
    clearHover();
    setCursor('crosshair');
  }

  function onMouseDown(event: paper.ToolEvent) {
    if (isPanningRef.current || isSpacebarPanRef.current) return;
    if (!isPrimaryButton(event)) {
      cancel();
      return;
    }
    const snapConfig = getSnapConfig();
    const point = event.point;

    if (pending?.mode === 'distance') {
      const snap = findSnap(point, snapConfig);
      if (!snap) return;
      pending = { mode: 'linear', p1: pending.first, p2: snap.point.clone() };
      isDimensioningRef.current = true;
      clearHover();
      updatePreview(point);
      return;
    }

    if (pending) {
      commit(point);
      return;
    }

    const pick = pickDimensionTarget(point, snapConfig);
    if (!pick) return;

    if (pick.type === 'point') {
      pending = { mode: 'distance', first: pick.point };
      isDimensioningRef.current = true;
      clearHover();
      return;
    }
    if (pick.type === 'circle') {
      pending = { mode: 'radial', kind: 'diameter', center: pick.center, onCurve: pick.onCurve };
    } else if (pick.type === 'arc') {
      pending = { mode: 'radial', kind: 'radius', center: pick.center, onCurve: pick.onCurve };
    } else {
      pending = { mode: 'linear', p1: pick.p1, p2: pick.p2 };
    }
    isDimensioningRef.current = true;
    clearHover();
    updatePreview(point);
  }

  function onMouseMove(event: paper.ToolEvent) {
    if (isPanningRef.current || isSpacebarPanRef.current) return;
    updateHover(event.point, getSnapConfig());
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseDrag: (event: paper.ToolEvent) => {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },
    cancel,
    isBusy: () => pending !== null,
    onActivate: () => setCursor('crosshair'),
    onDeactivate: cancel,
  };
}
