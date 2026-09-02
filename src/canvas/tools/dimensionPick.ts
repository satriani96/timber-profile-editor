import paper from 'paper';
import { fitCircularArc } from '../geometry/circularFit';
import { nearestSketchPath, type SketchPathHit } from '../geometry/pathCuts';
import { findSnap, updateSnapIndicator, type SnapConfig, type SnapKind, type SnapResult } from '../../utils/snapHelpers';

export const DIMENSION_HIT_PX = 10;

export type DimensionPick =
  | { type: 'point'; point: paper.Point; kind: SnapKind }
  | { type: 'line'; path: paper.Path; p1: paper.Point; p2: paper.Point; curveIndex?: number }
  | { type: 'circle'; path: paper.Path; center: paper.Point; onCurve: paper.Point }
  | { type: 'arc'; path: paper.Path; center: paper.Point; onCurve: paper.Point; curveIndex?: number };

interface FilletRecord {
  center?: unknown;
  radius?: unknown;
  cornerPoint?: unknown;
  tangentPoint1?: unknown;
  tangentPoint2?: unknown;
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

function filletList(path: paper.Path): FilletRecord[] {
  const raw = path.data?.fillets;
  return Array.isArray(raw) ? raw : [];
}

function endpointsMatch(curve: paper.Curve, a: paper.Point, b: paper.Point, tol: number): boolean {
  const matchForward = curve.point1.getDistance(a) <= tol && curve.point2.getDistance(b) <= tol;
  const matchReverse = curve.point1.getDistance(b) <= tol && curve.point2.getDistance(a) <= tol;
  return matchForward || matchReverse;
}

function curveIsFillet(path: paper.Path, curve: paper.Curve, fillet: FilletRecord): boolean {
  if (curve.isStraight()) return false;
  const radius = typeof fillet.radius === 'number' ? fillet.radius : 0;
  const endTol = Math.max(0.5, radius * 0.2);
  if (
    fillet.tangentPoint1 instanceof paper.Point &&
    fillet.tangentPoint2 instanceof paper.Point &&
    endpointsMatch(curve, fillet.tangentPoint1, fillet.tangentPoint2, endTol)
  ) {
    return true;
  }
  if (!(fillet.cornerPoint instanceof paper.Point)) return false;
  const near = path.getNearestLocation(fillet.cornerPoint);
  return Boolean(near && near.curve === curve);
}

function filletForCurve(path: paper.Path, curve: paper.Curve): FilletRecord | null {
  if (!curve || curve.isStraight() || path.data?.isSpline) return null;
  for (const fillet of filletList(path)) {
    if (fillet && typeof fillet === 'object' && curveIsFillet(path, curve, fillet)) return fillet;
  }
  return null;
}

/**
 * Center of the circular entity under `hit`, classified from the clicked
 * curve — not the whole path. Closed fillets live on the same path as the
 * adjacent straight sides.
 */
function circularCenterForHit(hit: SketchPathHit): paper.Point | null {
  const path = hit.path;
  if (isCircle(path) || isArcPath(path)) {
    return (path.data.center as paper.Point).clone();
  }
  const curve = hit.location.curve;
  if (!curve || path.data?.isSpline) return null;
  const fillet = filletForCurve(path, curve);
  if (fillet?.center instanceof paper.Point) return fillet.center.clone();
  if (!curve.isStraight()) {
    const fit = fitCircularArc(curve);
    if (fit) return fit.center.clone();
  }
  return null;
}

/**
 * Endpoint / intersection / center / quadrant snaps still win so two-point
 * dimensions work at fillet tangents. A midpoint that sits on the circular
 * curve itself does not — that click is a radius/diameter pick.
 */
function snapOverridesCircular(snap: SnapResult, hit: SketchPathHit | null, center: paper.Point | null): boolean {
  if (!center || !hit) return true;
  if (snap.kind !== 'midpoint') return true;
  const curve = hit.location.curve;
  if (!curve) return true;
  const mid = curve.getPointAt(curve.length / 2);
  return !mid || snap.point.getDistance(mid) > 1e-4;
}

/**
 * Snap points win over entities, except a midpoint on a fillet/arc curve.
 * A click on a fillet tangent (arc endpoint / line endpoint / intersection)
 * is always a point pick.
 */
export function pickDimensionTarget(point: paper.Point, snapConfig: SnapConfig): DimensionPick | null {
  const snap = findSnap(point, snapConfig);
  const hit = nearestSketchPath(point, DIMENSION_HIT_PX / paper.view.zoom);
  const center = hit ? circularCenterForHit(hit) : null;

  if (snap && snapOverridesCircular(snap, hit, center)) {
    return { type: 'point', point: snap.point.clone(), kind: snap.kind };
  }
  if (snap) updateSnapIndicator(null, snapConfig.snapIndicatorRef);

  if (!hit) return null;

  if (isCircle(hit.path)) {
    return {
      type: 'circle',
      path: hit.path,
      center: (hit.path.data.center as paper.Point).clone(),
      onCurve: hit.location.point.clone(),
    };
  }
  if (center) {
    return {
      type: 'arc',
      path: hit.path,
      center,
      onCurve: hit.location.point.clone(),
      curveIndex: hit.location.curve?.index,
    };
  }
  const ends = straightEnds(hit.location);
  if (ends) {
    return {
      type: 'line',
      path: hit.path,
      p1: ends.p1,
      p2: ends.p2,
      curveIndex: hit.location.curve?.index,
    };
  }
  return null;
}
