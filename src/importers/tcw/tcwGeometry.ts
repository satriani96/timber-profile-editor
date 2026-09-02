import type { TcwRecord } from './tcwRecords';

export type TcwEntity =
  | { type: 'polyline'; points: [number, number][]; closed: boolean }
  | { type: 'circle'; center: [number, number]; radius: number }
  | { type: 'arc'; center: [number, number]; radius: number; startAngle: number; endAngle: number };

export type TcwClassification = { entity: TcwEntity } | { skip: string };

const EPSILON = 1e-6;

function close(a: [number, number], b: [number, number], eps = EPSILON) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}
function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function angleDeg(center: [number, number], p: [number, number]) {
  return ((Math.atan2(p[1] - center[1], p[0] - center[0]) * 180) / Math.PI + 360) % 360;
}

/**
 * Decides what a record draws from its geometry rather than its header bytes,
 * which differ between TurboCAD versions. Tool names are used only as hints.
 *
 * - Dimensions/text: named tool, or (older files) a point list ending in a
 *   duplicated text-anchor point.
 * - Circle/arc: four points equidistant from the first — center, start, end,
 *   and a point marking the local Y axis (start rotated 90°). Start = end
 *   means a full circle. Both are produced by the circle *and* arc tools.
 * - Anything else with ≥ 2 points is a polyline (2 points = line).
 */
export function classifyRecord(record: TcwRecord): TcwClassification {
  let points = record.points;
  const tools = record.tools;

  if (tools.some((t) => t.includes('DIM') || t.includes('TEXT'))) return { skip: 'dimension/text' };
  if (points.length >= 5 && close(points[points.length - 1], points[points.length - 2]) && !close(points[0], points[points.length - 1])) {
    return { skip: 'dimension' };
  }

  if (points.length === 4) {
    const [center, start, end, axis] = points;
    const r = distance(center, start);
    const tolerance = EPSILON * Math.max(1, r);
    if (r > EPSILON && Math.abs(distance(center, end) - r) < tolerance && Math.abs(distance(center, axis) - r) < tolerance) {
      if (close(start, end)) return { entity: { type: 'circle', center, radius: r } };
      const xAxis = [start[0] - center[0], start[1] - center[1]];
      const yAxis = [axis[0] - center[0], axis[1] - center[1]];
      const rightHanded = xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0] > 0;
      let startAngle = angleDeg(center, start);
      let endAngle = angleDeg(center, end);
      // A left-handed frame means the arc runs clockwise; describe it counter-clockwise from the other end.
      if (!rightHanded) [startAngle, endAngle] = [endAngle, startAngle];
      return { entity: { type: 'arc', center, radius: r, startAngle, endAngle } };
    }
  }

  // Line records often carry a reference point (midpoint or an endpoint) ahead of the two vertices.
  if (tools.includes('CMD_LINE@') && points.length > 2) points = points.slice(-2);
  if (points.length === 3) {
    const mid: [number, number] = [(points[1][0] + points[2][0]) / 2, (points[1][1] + points[2][1]) / 2];
    if (close(points[0], mid) || close(points[0], points[1]) || close(points[0], points[2])) points = points.slice(1);
  }

  if (points.length < 2) return { skip: 'no geometry' };

  const cleaned: [number, number][] = [points[0]];
  for (const p of points.slice(1)) if (!close(p, cleaned[cleaned.length - 1])) cleaned.push(p);
  const closed = cleaned.length > 3 && close(cleaned[0], cleaned[cleaned.length - 1]);
  if (closed) cleaned.pop();
  if (cleaned.length < 2) return { skip: 'degenerate' };
  return { entity: { type: 'polyline', points: cleaned, closed } };
}
