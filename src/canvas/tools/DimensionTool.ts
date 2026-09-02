import paper from 'paper';
import type { MutableRefObject } from 'react';
import { isSketchPath, nearestSketchPath } from '../geometry/pathCuts';
import {
  classifyLinearKind,
  createDimension,
  measureDimension,
  rebuildDimension,
  type DimensionData,
  type DimensionKind,
} from '../dimensions';
import { findSnap, type SnapConfig } from '../../utils/snapHelpers';
import { isPrimaryButton } from './drawingState';

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
  forceKind?: DimensionKind;
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

/** Same distance-based lookup as the cut tools; slightly looser so circles/arcs are easy to pick. */
const HIT_PX = 10;

function isCircle(path: paper.Path): boolean {
  return Boolean(path.closed && path.data?.center instanceof paper.Point && path.data?.isArc === false);
}

function isArcPath(path: paper.Path): boolean {
  return Boolean(path.data?.isArc && path.data?.center instanceof paper.Point);
}

function straightEnds(location: paper.CurveLocation): { p1: paper.Point; p2: paper.Point } | null {
  const curve = location.curve;
  if (!curve || !curve.isStraight()) return null;
  return { p1: curve.point1.clone(), p2: curve.point2.clone() };
}

function pickSnapPoint(point: paper.Point, snapConfig: SnapConfig): paper.Point | null {
  const snap = findSnap(point, snapConfig);
  return snap ? snap.point.clone() : null;
}

export function createDimensionTool(state: DimensionToolState) {
  const { isPanningRef, isSpacebarPanRef, isDimensioningRef, handleDragPan, getSnapConfig } = state;

  let pending: Pending | null = null;
  let preview: paper.Group | null = null;

  function clearPreview() {
    preview?.remove();
    preview = null;
  }

  function finish() {
    clearPreview();
    pending = null;
    isDimensioningRef.current = false;
  }

  function cancel() {
    finish();
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
      const kind = pending.forceKind ?? classifyLinearKind(pending.p1, pending.p2, place);
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
  }

  function startLinear(location: paper.CurveLocation) {
    const ends = straightEnds(location);
    if (!ends) return false;
    pending = { mode: 'linear', p1: ends.p1, p2: ends.p2 };
    isDimensioningRef.current = true;
    updatePreview(ends.p1.add(ends.p2).divide(2));
    return true;
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
      const second = pickSnapPoint(point, snapConfig);
      if (!second) return;
      pending = { mode: 'linear', p1: pending.first, p2: second, forceKind: 'distance' };
      isDimensioningRef.current = true;
      updatePreview(point);
      return;
    }

    if (pending) {
      commit(point);
      return;
    }

    const snap = findSnap(point, snapConfig);
    const hit = nearestSketchPath(point, HIT_PX / paper.view.zoom);

    if (hit && isCircle(hit.path)) {
      if (snap?.kind === 'center') {
        pending = { mode: 'distance', first: snap.point.clone() };
        isDimensioningRef.current = true;
        return;
      }
      const center = (hit.path.data.center as paper.Point).clone();
      pending = { mode: 'radial', kind: 'diameter', center, onCurve: hit.location.point.clone() };
      isDimensioningRef.current = true;
      updatePreview(point);
      return;
    }

    if (hit && isArcPath(hit.path)) {
      const center = (hit.path.data.center as paper.Point).clone();
      pending = { mode: 'radial', kind: 'radius', center, onCurve: hit.location.point.clone() };
      isDimensioningRef.current = true;
      updatePreview(point);
      return;
    }

    const preferPoint = snap && (snap.kind === 'endpoint' || snap.kind === 'center');
    if (preferPoint) {
      pending = { mode: 'distance', first: snap.point.clone() };
      isDimensioningRef.current = true;
      return;
    }

    if (hit && isSketchPath(hit.path) && startLinear(hit.location)) return;

    if (snap) {
      pending = { mode: 'distance', first: snap.point.clone() };
      isDimensioningRef.current = true;
    }
  }

  function onMouseMove(event: paper.ToolEvent) {
    if (isPanningRef.current || isSpacebarPanRef.current) return;
    const snapConfig = getSnapConfig();
    findSnap(event.point, snapConfig);
    if (pending && pending.mode !== 'distance') updatePreview(event.point);
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseDrag: (event: paper.ToolEvent) => {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },
    cancel,
    isBusy: () => pending !== null,
    onActivate: () => {},
    onDeactivate: cancel,
  };
}
