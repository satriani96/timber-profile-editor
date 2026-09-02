import paper from 'paper';
import { nearestSketchPath } from '../geometry/pathCuts';
import { findSnap, type SnapConfig, type SnapKind } from '../../utils/snapHelpers';

export const DIMENSION_HIT_PX = 10;

export type DimensionPick =
  | { type: 'point'; point: paper.Point; kind: SnapKind }
  | { type: 'line'; path: paper.Path; p1: paper.Point; p2: paper.Point }
  | { type: 'circle'; path: paper.Path; center: paper.Point; onCurve: paper.Point }
  | { type: 'arc'; path: paper.Path; center: paper.Point; onCurve: paper.Point };

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

/**
 * Snap points win over entities. A click on a fillet tangent (arc endpoint /
 * line endpoint / intersection) is always a point pick.
 */
export function pickDimensionTarget(point: paper.Point, snapConfig: SnapConfig): DimensionPick | null {
  const snap = findSnap(point, snapConfig);
  if (snap) return { type: 'point', point: snap.point.clone(), kind: snap.kind };

  const hit = nearestSketchPath(point, DIMENSION_HIT_PX / paper.view.zoom);
  if (!hit) return null;

  if (isCircle(hit.path)) {
    return {
      type: 'circle',
      path: hit.path,
      center: (hit.path.data.center as paper.Point).clone(),
      onCurve: hit.location.point.clone(),
    };
  }
  if (isArcPath(hit.path)) {
    return {
      type: 'arc',
      path: hit.path,
      center: (hit.path.data.center as paper.Point).clone(),
      onCurve: hit.location.point.clone(),
    };
  }
  const ends = straightEnds(hit.location);
  if (ends) return { type: 'line', path: hit.path, p1: ends.p1, p2: ends.p2 };
  return null;
}
