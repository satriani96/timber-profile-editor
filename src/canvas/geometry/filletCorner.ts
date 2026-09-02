import { PaperRoundCorners } from 'paperjs-round-corners';

export interface FilletMeta {
  cornerIndex: number;
  cornerPoint: paper.Point;
  isArc: true;
  center: paper.Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  sweepAngle: number;
  tangentPoint1: paper.Point;
  tangentPoint2: paper.Point;
}

export type ClosedFilletResult =
  | { ok: true; path: paper.Path }
  | { ok: false; reason: 'no-corner' | 'round-failed' };

/**
 * Rounds one corner of a closed path and records circular fillet metadata
 * (center, radius, tangents) used by DXF export and the dimension tool.
 */
export function applyClosedCornerFillet(
  path: paper.Path,
  cornerPoint: paper.Point,
  radiusValue: number,
): ClosedFilletResult {
  if (!path.closed || radiusValue <= 0) return { ok: false, reason: 'no-corner' };

  const cornerSegment = path.segments.find((seg) => seg.point.equals(cornerPoint));
  if (!cornerSegment) return { ok: false, reason: 'no-corner' };

  const newPath = path.clone() as paper.Path;
  const segmentToRound = newPath.segments[cornerSegment.index];
  const success = PaperRoundCorners.round(segmentToRound, radiusValue);
  if (!success) {
    newPath.remove();
    return { ok: false, reason: 'round-failed' };
  }

  const prevIndex = (cornerSegment.index - 1 + path.segments.length) % path.segments.length;
  const nextIndex = (cornerSegment.index + 1) % path.segments.length;
  const prevPoint = path.segments[prevIndex].point;
  const nextPoint = path.segments[nextIndex].point;

  const vec1 = prevPoint.subtract(cornerPoint).normalize();
  const vec2 = nextPoint.subtract(cornerPoint).normalize();
  const angle = Math.acos(vec1.dot(vec2));
  const tanDist = radiusValue / Math.tan(angle / 2);
  const tangentPoint1 = cornerPoint.add(vec1.multiply(tanDist));
  const tangentPoint2 = cornerPoint.add(vec2.multiply(tanDist));
  const midVector = vec1.add(vec2).normalize();
  const centerDist = radiusValue / Math.sin(angle / 2);
  const arcCenter = cornerPoint.add(midVector.multiply(centerDist));

  const startAngle = (Math.atan2(tangentPoint1.y - arcCenter.y, tangentPoint1.x - arcCenter.x) * 180) / Math.PI;
  const endAngle = (Math.atan2(tangentPoint2.y - arcCenter.y, tangentPoint2.x - arcCenter.x) * 180) / Math.PI;
  let normalizedStartAngle = (startAngle + 360) % 360;
  let normalizedEndAngle = (endAngle + 360) % 360;
  let sweepAngle = normalizedEndAngle - normalizedStartAngle;
  if (sweepAngle < 0) sweepAngle += 360;
  if (sweepAngle > 180) {
    sweepAngle = 360 - sweepAngle;
    const temp = normalizedStartAngle;
    normalizedStartAngle = normalizedEndAngle;
    normalizedEndAngle = temp;
  }

  if (!newPath.data) newPath.data = {};
  if (!newPath.data.fillets) newPath.data.fillets = [];

  let cornerIndexOnNew = cornerSegment.index;
  let bestD = Infinity;
  for (let i = 0; i < newPath.segments.length; i++) {
    const d = newPath.segments[i].point.getDistance(cornerPoint);
    if (d < bestD) {
      bestD = d;
      cornerIndexOnNew = i;
    }
  }

  const fillet: FilletMeta = {
    cornerIndex: cornerIndexOnNew,
    cornerPoint: cornerPoint.clone(),
    isArc: true,
    center: arcCenter,
    radius: radiusValue,
    startAngle: normalizedStartAngle,
    endAngle: normalizedEndAngle,
    sweepAngle,
    tangentPoint1,
    tangentPoint2,
  };
  newPath.data.fillets.push(fillet);

  path.remove();
  return { ok: true, path: newPath };
}
