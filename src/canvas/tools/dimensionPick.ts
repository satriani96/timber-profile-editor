import paper from 'paper';
import { lineIntersection } from '../dimensions';
import { nearestSketchPath } from '../geometry/pathCuts';
import { fitCircularArc } from '../../exporters/ExportDXF';
import { findSnap, updateSnapIndicator, type SnapConfig, type SnapResult, type SnapKind } from '../../utils/snapHelpers';

export const DIMENSION_HIT_PX = 10;

export type DimensionPick =
  | { type: 'point'; point: paper.Point; kind: SnapKind }
  | { type: 'line'; path: paper.Path; p1: paper.Point; p2: paper.Point }
  | { type: 'circle'; path: paper.Path; center: paper.Point; onCurve: paper.Point }
  | { type: 'arc'; path: paper.Path; center: paper.Point; onCurve: paper.Point };

function isCircle(path: paper.Path): boolean {
  return Boolean(path.closed && path.data?.center instanceof paper.Point && path.data?.isArc === false);
}

/**
 * The straight edge under the cursor that makes an angle with the line from `a`
 * to `b`: any edge that is not parallel to it. Snap points are ignored, so the
 * whole length of the second line can be clicked.
 */
export function pickAngleLine(point: paper.Point, a: paper.Point, b: paper.Point): Extract<DimensionPick, { type: 'line' }> | null {
  const hit = nearestSketchPath(point, DIMENSION_HIT_PX / paper.view.zoom);
  const curve = hit?.location.curve;
  if (!hit || !curve || !curve.isStraight()) return null;
  if (!lineIntersection(a, b, curve.point1, curve.point2)) return null;
  return { type: 'line', path: hit.path, p1: curve.point1.clone(), p2: curve.point2.clone() };
}

/**
 * Whether a snap point takes the click away from the arc under the cursor.
 * An arc's own midpoint never does, and its ends only claim the outer quarter
 * of the arc, so a short fillet still has a stretch that picks the arc itself.
 */
function snapBeatsArc(snap: SnapResult, point: paper.Point, curve: paper.Curve): boolean {
  if (snap.kind === 'midpoint') return false;
  return snap.point.getDistance(point) < curve.length / 4;
}

/**
 * Snap points win over lines and circles. A click on a fillet tangent (arc
 * endpoint / line endpoint / intersection) is a point pick; anywhere else along
 * an arc picks the arc. Arcs are recognised from the curve under the cursor, so
 * a fillet inside a longer path counts the same as a standalone arc.
 */
export function pickDimensionTarget(point: paper.Point, snapConfig: SnapConfig): DimensionPick | null {
  const snap = findSnap(point, snapConfig);
  const hit = nearestSketchPath(point, DIMENSION_HIT_PX / paper.view.zoom);
  const curve = hit?.location.curve;
  const arc = hit && curve && !isCircle(hit.path) && !curve.isStraight() ? fitCircularArc(curve) : null;

  if (snap && !(arc && curve && !snapBeatsArc(snap, point, curve))) {
    return { type: 'point', point: snap.point.clone(), kind: snap.kind };
  }
  if (!hit || !curve) return null;

  if (arc) {
    updateSnapIndicator(null, snapConfig.snapIndicatorRef);
    return { type: 'arc', path: hit.path, center: arc.center, onCurve: hit.location.point.clone() };
  }
  if (isCircle(hit.path)) {
    return {
      type: 'circle',
      path: hit.path,
      center: (hit.path.data.center as paper.Point).clone(),
      onCurve: hit.location.point.clone(),
    };
  }
  if (curve.isStraight()) return { type: 'line', path: hit.path, p1: curve.point1.clone(), p2: curve.point2.clone() };
  return null;
}
