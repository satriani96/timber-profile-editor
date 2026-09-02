import paper from 'paper';
import type { MutableRefObject } from 'react';

export type SnapKind = 'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'intersection';

export interface SnapResult {
  point: paper.Point;
  kind: SnapKind;
}

export interface SnapConfig {
  /** Snap radius in screen pixels; converted to project units using the current zoom. */
  snapTolerancePx: number;
  currentPathRef: MutableRefObject<paper.Path | null>;
  snapIndicatorRef: MutableRefObject<paper.Item | null>;
  enableEndpointSnap?: boolean;
  enableMidpointSnap?: boolean;
  enableCenterSnap?: boolean;
  enableIntersectionSnap?: boolean;
}

const SNAP_COLOR = '#16a34a';
const MARKER_SIZE_PX = 12;
const MARKER_STROKE_PX = 2;
/** Lower wins when several snap kinds land on the same point. */
const SNAP_PRIORITY: Record<SnapKind, number> = {
  intersection: 0,
  endpoint: 1,
  midpoint: 2,
  center: 3,
  quadrant: 4,
};

function isFullCircle(path: paper.Path): boolean {
  return Boolean(path.closed && path.data?.center && path.data?.isArc === false);
}

function collectCandidatePaths(pathToIgnore: paper.Path | null, config: SnapConfig): paper.Path[] {
  const { currentPathRef, snapIndicatorRef } = config;
  return paper.project.activeLayer.children.filter(
    (c): c is paper.Path =>
      c instanceof paper.Path &&
      c.visible &&
      c.length > 0 &&
      !c.data?.isTemporary &&
      !c.data?.isMeasurement &&
      c !== currentPathRef.current &&
      c !== snapIndicatorRef.current &&
      c !== pathToIgnore
  );
}

/**
 * Closest object snap to `point` within the configured tolerance, or null.
 * Also updates the on-canvas snap marker so callers do not have to.
 */
export function findSnap(point: paper.Point, config: SnapConfig, pathToIgnore: paper.Path | null = null): SnapResult | null {
  const {
    enableEndpointSnap = true,
    enableMidpointSnap = true,
    enableCenterSnap = true,
    enableIntersectionSnap = true,
  } = config;
  const tolerance = config.snapTolerancePx / paper.view.zoom;

  const state: { best: SnapResult | null; distance: number } = { best: null, distance: Infinity };
  const consider = (candidate: paper.Point, kind: SnapKind) => {
    const d = point.getDistance(candidate);
    if (d >= tolerance) return;
    const coincident = state.best && Math.abs(d - state.distance) < 1e-6;
    const betterKind = coincident && SNAP_PRIORITY[kind] < SNAP_PRIORITY[state.best!.kind];
    if (d < state.distance - 1e-6 || betterKind) {
      state.distance = d;
      state.best = { point: candidate, kind };
    }
  };

  const paths = collectCandidatePaths(pathToIgnore, config);
  const nearPaths = paths.filter((p) => p.bounds.expand(tolerance * 2).contains(point));

  for (const path of nearPaths) {
    const circle = isFullCircle(path);

    if (enableEndpointSnap) {
      if (path.closed) {
        for (const seg of path.segments) consider(seg.point, circle ? 'quadrant' : 'endpoint');
      } else {
        consider(path.firstSegment.point, 'endpoint');
        consider(path.lastSegment.point, 'endpoint');
        for (let i = 1; i < path.segments.length - 1; i++) consider(path.segments[i].point, 'endpoint');
      }
    }

    if (enableMidpointSnap && !circle) {
      for (const curve of path.curves) {
        consider(curve.getPointAt(curve.length / 2), 'midpoint');
      }
    }

    if (enableCenterSnap && path.data?.center instanceof paper.Point) {
      consider(path.data.center, 'center');
    }
  }

  if (enableIntersectionSnap) {
    for (let i = 0; i < nearPaths.length; i++) {
      for (let j = i + 1; j < nearPaths.length; j++) {
        for (const loc of nearPaths[i].getIntersections(nearPaths[j])) consider(loc.point, 'intersection');
      }
    }
  }

  updateSnapIndicator(state.best, config.snapIndicatorRef);
  return state.best;
}

/** Convenience wrapper returning only the snapped point. */
export function getSnapPoint(point: paper.Point, config: SnapConfig, pathToIgnore: paper.Path | null = null): paper.Point | null {
  return findSnap(point, config, pathToIgnore)?.point ?? null;
}

function buildMarker(kind: SnapKind, center: paper.Point): paper.Item {
  const zoom = paper.view.zoom;
  const size = MARKER_SIZE_PX / zoom;
  const half = size / 2;
  const style = {
    strokeColor: new paper.Color(SNAP_COLOR),
    strokeWidth: MARKER_STROKE_PX / zoom,
    fillColor: null as paper.Color | null,
  };
  let marker: paper.Item;
  switch (kind) {
    case 'endpoint':
      marker = new paper.Path.Rectangle({ center, size: [size, size], ...style });
      break;
    case 'midpoint':
      marker = new paper.Path({
        segments: [center.add([0, -half * 1.15]), center.add([half * 1.15, half * 0.85]), center.add([-half * 1.15, half * 0.85])],
        closed: true,
        ...style,
      });
      break;
    case 'center':
      marker = new paper.Path.Circle({ center, radius: half, ...style });
      break;
    case 'quadrant':
      marker = new paper.Path({
        segments: [center.add([0, -half]), center.add([half, 0]), center.add([0, half]), center.add([-half, 0])],
        closed: true,
        ...style,
      });
      break;
    case 'intersection':
      marker = new paper.Group([
        new paper.Path.Line({ from: center.add([-half, -half]), to: center.add([half, half]), ...style }),
        new paper.Path.Line({ from: center.add([-half, half]), to: center.add([half, -half]), ...style }),
      ]);
      break;
  }
  marker.data = { isTemporary: true, snapKind: kind };
  return marker;
}

export function updateSnapIndicator(snap: SnapResult | null, snapIndicatorRef: MutableRefObject<paper.Item | null>): void {
  const current = snapIndicatorRef.current;
  if (!snap) {
    if (current) current.visible = false;
    return;
  }
  if (!current || current.data?.snapKind !== snap.kind || !current.isInserted()) {
    current?.remove();
    snapIndicatorRef.current = buildMarker(snap.kind, snap.point);
  } else {
    current.position = snap.point;
    current.visible = true;
  }
  snapIndicatorRef.current?.bringToFront();
}

/**
 * Constrains `end` relative to `start` to the nearest 45° increment (ortho /
 * polar tracking), preserving the projected length along that direction.
 */
export function constrainToAxis(start: paper.Point, end: paper.Point): paper.Point {
  const vector = end.subtract(start);
  if (vector.length === 0) return end;
  const angle = Math.round(vector.angle / 45) * 45;
  const direction = new paper.Point({ length: 1, angle });
  const length = vector.dot(direction);
  return start.add(direction.multiply(length));
}
