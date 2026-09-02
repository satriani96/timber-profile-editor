import paper from 'paper';
import type { MutableRefObject } from 'react';
import { isSketchPath, nearestSketchPath } from '../geometry/pathCuts';
import {
  classifyLinearKind,
  createDimension,
  ensureItemUid,
  measureDimension,
  rebuildDimension,
  type DimensionData,
  type DimensionKind,
  type LinkedRole,
} from '../dimensions';
import { findSnap, type SnapConfig } from '../../utils/snapHelpers';
import { isPrimaryButton } from './drawingState';

export interface DimensionToolState {
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  isDimensioningRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
  getSnapConfig: () => SnapConfig;
  onPlaced: (group: paper.Group) => void;
}

interface PointPick {
  point: paper.Point;
  uid?: string;
  role?: LinkedRole;
}

interface PendingLinear {
  mode: 'linear';
  p1: paper.Point;
  p2: paper.Point;
  uid?: string;
  role?: LinkedRole;
  click: paper.Point;
  forceKind?: DimensionKind;
  p2Uid?: string;
  p2Role?: LinkedRole;
}

interface PendingRadial {
  mode: 'radial';
  kind: 'diameter' | 'radius';
  center: paper.Point;
  onCurve: paper.Point;
  uid: string;
}

interface PendingDistance {
  mode: 'distance';
  first: PointPick;
}

type Pending = PendingLinear | PendingRadial | PendingDistance;

const HIT_PX = 8;

function roleForSnap(path: paper.Path, kind: string, point: paper.Point): LinkedRole {
  if (kind === 'center') return 'center';
  if (kind === 'midpoint') return 'body';
  if (path.firstSegment && point.isClose(path.firstSegment.point, 1e-4)) return 'first';
  if (path.lastSegment && point.isClose(path.lastSegment.point, 1e-4)) return 'last';
  return 'body';
}

function pickPoint(point: paper.Point, snapConfig: SnapConfig): PointPick | null {
  const snap = findSnap(point, snapConfig);
  if (!snap) return null;
  const hit = nearestSketchPath(snap.point, 1e-3) ?? nearestSketchPath(point, HIT_PX / paper.view.zoom);
  const path = hit?.path;
  return {
    point: snap.point.clone(),
    uid: path ? ensureItemUid(path) : undefined,
    role: path ? roleForSnap(path, snap.kind, snap.point) : undefined,
  };
}

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

export function createDimensionTool(state: DimensionToolState) {
  const { isPanningRef, isSpacebarPanRef, isDimensioningRef, handleDragPan, getSnapConfig, onPlaced } = state;

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
        linkedUid: pending.uid,
        linkedRole: pending.role,
        p2Uid: pending.p2Uid,
        p2Role: pending.p2Role,
        click: pending.click.clone(),
      });
      return;
    }
    showPreview({
      kind: pending.kind,
      p1: pending.center.clone(),
      p2: pending.onCurve.clone(),
      textPoint: place.clone(),
      value: measureDimension(pending.kind, pending.center, pending.onCurve),
      linkedUid: pending.uid,
      linkedRole: 'center',
    });
  }

  function commit(place: paper.Point) {
    if (!pending || pending.mode === 'distance') return;
    updatePreview(place);
    if (!preview) return;
    delete preview.data.isTemporary;
    const group = preview;
    preview = null;
    pending = null;
    isDimensioningRef.current = false;
    onPlaced(group);
  }

  function startLinear(path: paper.Path, location: paper.CurveLocation, click: paper.Point) {
    const ends = straightEnds(location);
    if (!ends) return false;
    const first = path.firstSegment.point;
    const last = path.lastSegment.point;
    const role: LinkedRole = ends.p1.isClose(first, 1e-4)
      ? 'first'
      : ends.p2.isClose(last, 1e-4)
        ? 'last'
        : 'body';
    pending = {
      mode: 'linear',
      p1: ends.p1,
      p2: ends.p2,
      uid: ensureItemUid(path),
      role,
      click: click.clone(),
    };
    isDimensioningRef.current = true;
    updatePreview(click);
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
      const second = pickPoint(point, snapConfig);
      if (!second) return;
      pending = {
        mode: 'linear',
        p1: pending.first.point,
        p2: second.point,
        uid: pending.first.uid,
        role: pending.first.role,
        click: pending.first.point,
        forceKind: 'distance',
        p2Uid: second.uid,
        p2Role: second.role,
      };
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
        pending = { mode: 'distance', first: { point: snap.point.clone(), uid: ensureItemUid(hit.path), role: 'center' } };
        isDimensioningRef.current = true;
        return;
      }
      const center = (hit.path.data.center as paper.Point).clone();
      pending = {
        mode: 'radial',
        kind: 'diameter',
        center,
        onCurve: hit.location.point.clone(),
        uid: ensureItemUid(hit.path),
      };
      isDimensioningRef.current = true;
      updatePreview(point);
      return;
    }

    if (hit && isArcPath(hit.path)) {
      const center = (hit.path.data.center as paper.Point).clone();
      pending = {
        mode: 'radial',
        kind: 'radius',
        center,
        onCurve: hit.location.point.clone(),
        uid: ensureItemUid(hit.path),
      };
      isDimensioningRef.current = true;
      updatePreview(point);
      return;
    }

    const preferPoint = snap && (snap.kind === 'endpoint' || snap.kind === 'center');
    if (preferPoint) {
      const first = pickPoint(point, snapConfig);
      if (first) {
        pending = { mode: 'distance', first };
        isDimensioningRef.current = true;
        return;
      }
    }

    if (hit && isSketchPath(hit.path) && startLinear(hit.path, hit.location, point)) return;

    if (snap) {
      const first = pickPoint(point, snapConfig);
      if (first) {
        pending = { mode: 'distance', first };
        isDimensioningRef.current = true;
      }
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
