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

/** Keeps layer/uid when a tool replaces `path.data`. */
export function preserveMeta(path: paper.Path, data: Record<string, unknown>): Record<string, unknown> {
  const layer = path.data?.layer;
  const uid = path.data?.uid;
  if (typeof layer === 'string') data.layer = layer;
  if (typeof uid === 'string') data.uid = uid;
  return data;
}
