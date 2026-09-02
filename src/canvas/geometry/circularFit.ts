import paper from 'paper';
import { arcAngles } from './pathCuts';

/** Circle through three points, or null when they are (nearly) collinear. */
export function circumcenter(a: paper.Point, b: paper.Point, c: paper.Point): paper.Point | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return new paper.Point(
    (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  );
}

/**
 * Detects Bézier curves that approximate a circular arc (fillets, cut circles)
 * so they can be treated as true arcs for export and dimensioning.
 */
export function fitCircularArc(curve: paper.Curve) {
  const start = curve.point1;
  const end = curve.point2;
  const mid = curve.getPointAtTime(0.5);
  const center = circumcenter(start, mid, end);
  if (!center) return null;
  const radius = center.getDistance(start);
  if (radius <= 0) return null;
  const tolerance = Math.max(0.005, radius * 0.002);
  for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) {
    if (Math.abs(center.getDistance(curve.getPointAtTime(t)) - radius) > tolerance) return null;
  }
  return { center, radius, ...arcAngles(center, start, mid, end) };
}
