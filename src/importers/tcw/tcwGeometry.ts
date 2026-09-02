import type { TcwRecord } from './tcwRecords';

export type TcwEntity =
  | { type: 'polyline'; points: [number, number][]; closed: boolean }
  | { type: 'spline'; points: [number, number][] }
  | { type: 'circle'; center: [number, number]; radius: number }
  | { type: 'arc'; center: [number, number]; radius: number; startAngle: number; endAngle: number }
  | {
      type: 'ellipticArc';
      center: [number, number];
      /** Semi-axis along the (rotated) local X axis. */
      a: number;
      /** Semi-axis along the local Y axis. */
      b: number;
      /** Rotation of the local X axis, degrees. */
      rotation: number;
      /** Parameter angles (degrees) in the unit-circle space; sweep is counter-clockwise from start to end. */
      startParam: number;
      endParam: number;
    };

export type TcwClassification = { entity: TcwEntity } | { skip: string };

const EPSILON = 1e-6;
/** Vertex flag bit 0: set on line/arc vertices, clear on spline fit points. */
const STRAIGHT_VERTEX_BIT = 0x01;

type Pt = [number, number];

function close(a: Pt, b: Pt, eps = EPSILON) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}
function distance(a: Pt, b: Pt) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function degrees(rad: number) {
  return ((rad * 180) / Math.PI + 360) % 360;
}
function angleDeg(center: Pt, p: Pt) {
  return degrees(Math.atan2(p[1] - center[1], p[0] - center[0]));
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
 * - Elliptical arc: the same four points after TurboCAD's non-uniform scale;
 *   the centered ellipse through the three outer points is exact.
 * - Spline: vertices flagged as curve points; the points are fit points.
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
    const circular = classifyCircular(points);
    if (circular) return { entity: circular };
  }

  const splineVertices =
    record.vertexFlags.length > 0 && record.vertexFlags.every((f) => (f & STRAIGHT_VERTEX_BIT) === 0);
  if (splineVertices && points.length >= 3 && !tools.includes('CMD_LINE@')) {
    const fit = dedupe(points);
    if (fit.length >= 3) return { entity: { type: 'spline', points: fit } };
  }

  // Line records often carry a reference point (midpoint or an endpoint) ahead of the two vertices.
  if (tools.includes('CMD_LINE@') && points.length > 2) points = points.slice(-2);
  if (points.length === 3) {
    const mid: Pt = [(points[1][0] + points[2][0]) / 2, (points[1][1] + points[2][1]) / 2];
    if (close(points[0], mid) || close(points[0], points[1]) || close(points[0], points[2])) points = points.slice(1);
  }

  if (points.length < 2) return { skip: 'no geometry' };

  const cleaned = dedupe(points);
  const closed = cleaned.length > 3 && close(cleaned[0], cleaned[cleaned.length - 1]);
  if (closed) cleaned.pop();
  if (cleaned.length < 2) return { skip: 'degenerate' };
  return { entity: { type: 'polyline', points: cleaned, closed } };
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [points[0]];
  for (const p of points.slice(1)) if (!close(p, out[out.length - 1])) out.push(p);
  return out;
}

function classifyCircular(points: Pt[]): TcwEntity | null {
  const [center, start, end, axis] = points;
  const r = distance(center, start);
  if (r <= EPSILON) return null;
  const tolerance = EPSILON * Math.max(1, r);

  if (Math.abs(distance(center, end) - r) < tolerance && Math.abs(distance(center, axis) - r) < tolerance) {
    if (close(start, end)) return { type: 'circle', center, radius: r };
    const xAxis = [start[0] - center[0], start[1] - center[1]];
    const yAxis = [axis[0] - center[0], axis[1] - center[1]];
    const rightHanded = xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0] > 0;
    let startAngle = angleDeg(center, start);
    let endAngle = angleDeg(center, end);
    // A left-handed frame means the arc runs clockwise; describe it counter-clockwise from the other end.
    if (!rightHanded) [startAngle, endAngle] = [endAngle, startAngle];
    return { type: 'arc', center, radius: r, startAngle, endAngle };
  }

  return classifyEllipticArc(center, start, end, axis);
}

/**
 * Fits the centered conic A·x² + B·xy + C·y² = 1 through three points and
 * accepts it when it is an ellipse whose axis point sits 90° along the
 * parameter from the start point — the same construction TurboCAD uses for
 * circles, seen through a non-uniform scale.
 */
function classifyEllipticArc(center: Pt, start: Pt, end: Pt, axis: Pt): TcwEntity | null {
  const rel = (p: Pt): Pt => [p[0] - center[0], p[1] - center[1]];
  const rows = [rel(start), rel(end), rel(axis)].map(([x, y]) => [x * x, x * y, y * y]);
  const conic = solve3(rows, [1, 1, 1]);
  if (!conic) return null;
  const [A, B, C] = conic;
  if (!(A > 0 && C > 0 && B * B < 4 * A * C)) return null;

  // Eigen-decomposition of [[A, B/2], [B/2, C]] gives axis directions and 1/semi-axis².
  const half = B / 2;
  const trace = A + C;
  const det = A * C - half * half;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lambda1 = trace / 2 - disc;
  const lambda2 = trace / 2 + disc;
  if (lambda1 <= 0) return null;
  const a = 1 / Math.sqrt(lambda1);
  const b = 1 / Math.sqrt(lambda2);
  const theta = Math.abs(half) < 1e-12 && A <= C ? 0 : Math.atan2(lambda1 - A, half);

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const param = (p: Pt) => {
    const [x, y] = rel(p);
    const u = (x * cos + y * sin) / a;
    const v = (-x * sin + y * cos) / b;
    return degrees(Math.atan2(v, u));
  };
  const startParam = param(start);
  const axisParam = param(axis);
  const endParam = param(end);
  const offset = ((axisParam - startParam) % 360 + 360) % 360;
  const rightHanded = Math.abs(offset - 90) < 0.5;
  const leftHanded = Math.abs(offset - 270) < 0.5;
  if (!rightHanded && !leftHanded) return null;

  const rotation = degrees(theta);
  if (rightHanded) return { type: 'ellipticArc', center, a, b, rotation, startParam, endParam };
  return { type: 'ellipticArc', center, a, b, rotation, startParam: endParam, endParam: startParam };
}

/** Gaussian elimination for a 3×3 system; null when singular. */
function solve3(m: number[][], rhs: number[]): number[] | null {
  const a = m.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-15) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c < 4; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => row[3] / row[i]);
}
