import paper from 'paper';
import { arcDataFor } from './pathCuts';

const POINT_KEYS = ['center', 'startPoint', 'endPoint', 'cornerPoint', 'tangentPoint1', 'tangentPoint2'] as const;

function translateRecord(record: Record<string, unknown>, delta: paper.Point) {
  for (const key of POINT_KEYS) {
    const value = record[key];
    if (value instanceof paper.Point) record[key] = value.add(delta);
  }
  if (Array.isArray(record.fitPoints)) {
    record.fitPoints = record.fitPoints.map((p) => (p instanceof paper.Point ? p.add(delta) : p));
  }
}

/** Keeps DXF export metadata (centers, fillet tangents, fit points) aligned after moving a path. */
export function translatePathData(path: paper.Path, delta: paper.Point): void {
  const data = path.data as Record<string, unknown> | undefined;
  if (!data) return;
  translateRecord(data, delta);
  if (Array.isArray(data.fillets)) {
    for (const fillet of data.fillets) {
      if (fillet && typeof fillet === 'object') translateRecord(fillet as Record<string, unknown>, delta);
    }
  }
}

export function movePath(path: paper.Path, delta: paper.Point): void {
  path.position = path.position.add(delta);
  translatePathData(path, delta);
}

function rotatePoint(point: paper.Point, angleDeg: number, center: paper.Point): paper.Point {
  return point.rotate(angleDeg, center);
}

function rotateRecord(record: Record<string, unknown>, angleDeg: number, center: paper.Point) {
  for (const key of POINT_KEYS) {
    const value = record[key];
    if (value instanceof paper.Point) record[key] = rotatePoint(value, angleDeg, center);
  }
  if (Array.isArray(record.fitPoints)) {
    record.fitPoints = record.fitPoints.map((p) => (p instanceof paper.Point ? rotatePoint(p, angleDeg, center) : p));
  }
  if (typeof record.startAngle === 'number') record.startAngle = Number(record.startAngle) + angleDeg;
  if (typeof record.endAngle === 'number') record.endAngle = Number(record.endAngle) + angleDeg;
}

/**
 * Rotates path geometry and export metadata. `angleDeg` is Paper.js rotation
 * (clockwise on screen). Axis-aligned rectangles lose `isRect` so DXF export
 * uses the generic polyline. Arcs recompute start/end via `arcDataFor`.
 */
export function rotatePath(path: paper.Path, angleDeg: number, center: paper.Point): void {
  path.rotate(angleDeg, center);
  const data = path.data as Record<string, unknown> | undefined;
  if (!data) return;
  rotateRecord(data, angleDeg, center);
  if (Array.isArray(data.fillets)) {
    for (const fillet of data.fillets) {
      if (fillet && typeof fillet === 'object') rotateRecord(fillet as Record<string, unknown>, angleDeg, center);
    }
  }
  if (data.isRect) {
    delete data.isRect;
    delete data.width;
    delete data.height;
  }
  if (data.center instanceof paper.Point && typeof data.radius === 'number' && data.isArc) {
    const next = arcDataFor(path, data.center, data.radius);
    path.data = preserveMeta(path, { ...data, ...next });
  }
}

/** Deep-clones `data` so transforms on a copy cannot mutate the original metadata. */
export function clonePathData(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };
  for (const key of POINT_KEYS) {
    const value = next[key];
    if (value instanceof paper.Point) next[key] = value.clone();
  }
  if (Array.isArray(next.fitPoints)) {
    next.fitPoints = next.fitPoints.map((p) => (p instanceof paper.Point ? p.clone() : p));
  }
  if (Array.isArray(next.fillets)) {
    next.fillets = next.fillets.map((fillet) =>
      fillet && typeof fillet === 'object' ? clonePathData(fillet as Record<string, unknown>) : fillet,
    );
  }
  return next;
}

export function reflectPoint(point: paper.Point, axisPoint: paper.Point, axisDirection: paper.Point): paper.Point {
  const dir = axisDirection.normalize();
  if (dir.isZero()) return point.clone();
  const rel = point.subtract(axisPoint);
  const proj = axisPoint.add(dir.multiply(rel.dot(dir)));
  return proj.multiply(2).subtract(point);
}

export function reflectVector(vector: paper.Point, axisDirection: paper.Point): paper.Point {
  const dir = axisDirection.normalize();
  if (dir.isZero()) return vector.clone();
  return dir.multiply(vector.dot(dir) * 2).subtract(vector);
}

function isAxisAligned(direction: paper.Point): boolean {
  const dir = direction.normalize();
  return Math.abs(dir.x) < 1e-6 || Math.abs(dir.y) < 1e-6;
}

function reflectAngleDeg(deg: number, axisDirection: paper.Point): number {
  const rad = (deg * Math.PI) / 180;
  const reflected = reflectVector(new paper.Point(Math.cos(rad), Math.sin(rad)), axisDirection);
  return (Math.atan2(reflected.y, reflected.x) * 180) / Math.PI;
}

function mirrorRecord(record: Record<string, unknown>, axisPoint: paper.Point, axisDirection: paper.Point) {
  for (const key of POINT_KEYS) {
    const value = record[key];
    if (value instanceof paper.Point) record[key] = reflectPoint(value, axisPoint, axisDirection);
  }
  if (Array.isArray(record.fitPoints)) {
    record.fitPoints = record.fitPoints.map((p) =>
      p instanceof paper.Point ? reflectPoint(p, axisPoint, axisDirection) : p,
    );
  }
}

/**
 * Reflects path geometry and export metadata across the axis through
 * `axisPoint` along `axisDirection`. Reflection reverses arc sweep, so arcs
 * recompute via `arcDataFor`. `isRect` survives only for a horizontal or
 * vertical axis.
 */
export function mirrorPath(path: paper.Path, axisPoint: paper.Point, axisDirection: paper.Point): void {
  for (const segment of path.segments) {
    segment.point = reflectPoint(segment.point, axisPoint, axisDirection);
    segment.handleIn = reflectVector(segment.handleIn, axisDirection);
    segment.handleOut = reflectVector(segment.handleOut, axisDirection);
  }
  const data = path.data as Record<string, unknown> | undefined;
  if (!data) return;
  mirrorRecord(data, axisPoint, axisDirection);
  if (Array.isArray(data.fillets)) {
    for (const fillet of data.fillets) {
      if (!fillet || typeof fillet !== 'object') continue;
      const record = fillet as Record<string, unknown>;
      mirrorRecord(record, axisPoint, axisDirection);
      if (typeof record.startAngle === 'number' && typeof record.endAngle === 'number') {
        const start = reflectAngleDeg(Number(record.startAngle), axisDirection);
        const end = reflectAngleDeg(Number(record.endAngle), axisDirection);
        record.startAngle = end;
        record.endAngle = start;
      }
    }
  }
  if (data.isRect && !isAxisAligned(axisDirection)) {
    delete data.isRect;
    delete data.width;
    delete data.height;
  }
  if (data.center instanceof paper.Point && typeof data.radius === 'number' && data.isArc) {
    const next = arcDataFor(path, data.center, data.radius);
    path.data = preserveMeta(path, { ...data, ...next });
  }
}

/** Keeps layer/uid when a tool replaces `path.data`. */
export function preserveMeta(path: paper.Path, data: Record<string, unknown>): Record<string, unknown> {
  const layer = path.data?.layer;
  const uid = path.data?.uid;
  if (typeof layer === 'string') data.layer = layer;
  if (typeof uid === 'string') data.uid = uid;
  return data;
}
