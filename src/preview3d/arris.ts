import type { Point2 } from './profileSolid';

/** Corners turning less than this are treated as part of a sampled curve and left alone. */
const MIN_TURN = (20 * Math.PI) / 180;
const ARC_STEP = (15 * Math.PI) / 180;
const EPS = 1e-6;

/**
 * Replace sharp polygon corners with small fillet arcs so machined arrises catch a
 * highlight in the render instead of reading as razor edges. The radius shrinks where
 * adjacent edges are too short to take it.
 */
export function softenArrises(points: Point2[], radius: number): Point2[] {
  const count = points.length;
  if (count < 3 || radius <= 0) return points;

  const out: Point2[] = [];
  for (let i = 0; i < count; i++) {
    const prev = points[(i + count - 1) % count];
    const cur = points[i];
    const next = points[(i + 1) % count];

    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    const len1 = Math.hypot(d1x, d1y);
    const len2 = Math.hypot(d2x, d2y);
    if (len1 < EPS || len2 < EPS) {
      out.push(cur);
      continue;
    }

    const u1x = d1x / len1;
    const u1y = d1y / len1;
    const u2x = d2x / len2;
    const u2y = d2y / len2;
    const cross = u1x * u2y - u1y * u2x;
    const dot = u1x * u2x + u1y * u2y;
    const turn = Math.atan2(Math.abs(cross), dot);
    if (turn < MIN_TURN || Math.PI - turn < EPS) {
      out.push(cur);
      continue;
    }

    const half = (Math.PI - turn) / 2; // half the interior angle
    const tanHalf = Math.tan(half);
    let tangent = radius / tanHalf;
    const maxTangent = 0.4 * Math.min(len1, len2);
    let r = radius;
    if (tangent > maxTangent) {
      tangent = maxTangent;
      r = tangent * tanHalf;
    }

    const ax = cur.x - u1x * tangent;
    const ay = cur.y - u1y * tangent;
    const bx = cur.x + u2x * tangent;
    const by = cur.y + u2y * tangent;

    let bisX = u2x - u1x;
    let bisY = u2y - u1y;
    const bisLen = Math.hypot(bisX, bisY);
    bisX /= bisLen;
    bisY /= bisLen;
    const toCentre = r / Math.sin(half);
    const cx = cur.x + bisX * toCentre;
    const cy = cur.y + bisY * toCentre;

    const startAngle = Math.atan2(ay - cy, ax - cx);
    const endAngle = Math.atan2(by - cy, bx - cx);
    let sweep = endAngle - startAngle;
    if (sweep > Math.PI) sweep -= 2 * Math.PI;
    if (sweep < -Math.PI) sweep += 2 * Math.PI;

    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
    for (let s = 0; s <= steps; s++) {
      const angle = startAngle + (sweep * s) / steps;
      out.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
  }
  return out;
}
