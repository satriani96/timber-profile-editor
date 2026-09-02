import paper from 'paper';

/** Offsets closer than this (project units, mm) are treated as the same cut. */
const CUT_EPSILON = 1e-3;
/** An open path's endpoint within this distance of another path counts as connected to it. */
const TOUCH_EPSILON = 0.05;

/** Paths that are part of the sketch (not previews, snap markers, or measurement annotations). */
export function isSketchPath(item: paper.Item): item is paper.Path {
  return (
    item instanceof paper.Path &&
    item.visible &&
    !item.data?.isTemporary &&
    !item.data?.isMeasurement &&
    item.length > 0
  );
}

export function sketchPaths(project: paper.Project = paper.project): paper.Path[] {
  return project.activeLayer.children.filter(isSketchPath);
}

export interface SketchPathHit {
  path: paper.Path;
  location: paper.CurveLocation;
}

/**
 * Nearest sketch path within `tolerance` of `point`. Uses curve distance rather
 * than Paper's stroke hit-test, which misses points that fall exactly on a
 * smooth segment (e.g. the quadrants of a circle) when joins are mitered.
 */
export function nearestSketchPath(
  point: paper.Point,
  tolerance: number,
  exclude: paper.Path | null = null,
  project: paper.Project = paper.project
): SketchPathHit | null {
  let best: SketchPathHit | null = null;
  let bestDistance = tolerance;
  for (const path of sketchPaths(project)) {
    if (path === exclude) continue;
    if (!path.bounds.expand(tolerance * 2).contains(point)) continue;
    const location = path.getNearestLocation(point);
    if (!location) continue;
    const distance = location.point.getDistance(point);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = { path, location };
    }
  }
  return best;
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Every offset along `path` where another sketch path crosses or touches it.
 * For closed paths offsets are normalised to [0, length); for open paths the
 * endpoints are excluded because there is nothing to cut off there.
 */
export function collectCutOffsets(path: paper.Path): number[] {
  const length = path.length;
  const raw: number[] = [];

  // Paper treats a missing argument as "intersect with itself"; the typings do not expose that overload.
  for (const loc of path.getIntersections(undefined as unknown as paper.PathItem)) raw.push(loc.offset);

  for (const other of sketchPaths(path.project)) {
    if (other === path) continue;
    for (const loc of path.getIntersections(other)) raw.push(loc.offset);
    if (!other.closed) {
      for (const end of [other.firstSegment.point, other.lastSegment.point]) {
        const near = path.getNearestLocation(end);
        if (near && near.point.getDistance(end) < TOUCH_EPSILON) raw.push(near.offset);
      }
    }
  }

  const normalised = raw
    .map((o) => {
      if (!path.closed) return o;
      const wrapped = ((o % length) + length) % length;
      return wrapped > length - CUT_EPSILON ? 0 : wrapped;
    })
    .filter((o) => path.closed || (o > CUT_EPSILON && o < length - CUT_EPSILON))
    .sort((a, b) => a - b);

  const cuts: number[] = [];
  for (const o of normalised) {
    if (cuts.length === 0 || o - cuts[cuts.length - 1] > CUT_EPSILON) cuts.push(o);
  }
  return cuts;
}

export interface CutInterval {
  from: number;
  to: number;
  /** True when the interval covers the entire path (no usable cuts). */
  whole: boolean;
}

/**
 * The stretch of `path` containing `hoverOffset`, bounded by the nearest cuts on
 * either side. On closed paths the interval may wrap (`to < from`).
 */
export function findCutInterval(path: paper.Path, hoverOffset: number, cuts: number[]): CutInterval {
  const length = path.length;

  if (!path.closed) {
    let from = 0;
    let to = length;
    for (const c of cuts) {
      if (c <= hoverOffset) from = c;
      else {
        to = c;
        break;
      }
    }
    return { from, to, whole: cuts.length === 0 };
  }

  if (cuts.length < 2) return { from: 0, to: length, whole: true };

  for (let i = 0; i < cuts.length - 1; i++) {
    if (hoverOffset >= cuts[i] && hoverOffset < cuts[i + 1]) {
      return { from: cuts[i], to: cuts[i + 1], whole: false };
    }
  }
  return { from: cuts[cuts.length - 1], to: cuts[0], whole: false };
}

export interface CutResult {
  /** The path covering exactly the requested interval. */
  piece: paper.Path;
  /** Whatever remains of the original path on either side (may be empty). */
  rest: paper.Path[];
}

/**
 * Cuts `path` so that the requested interval becomes its own path. Mutates the
 * original path in place; every returned path is inserted in the project.
 * Curve geometry (arcs, splines) is preserved because Paper divides curves
 * mathematically instead of sampling them.
 */
export function cutInterval(path: paper.Path, interval: CutInterval): CutResult {
  const length = path.length;
  const sourceData = path.data ?? {};
  const rest: paper.Path[] = [];
  let piece: paper.Path;

  if (interval.whole) {
    piece = path;
  } else if (path.closed) {
    const span = interval.to >= interval.from ? interval.to - interval.from : length - interval.from + interval.to;
    path.splitAt(interval.from);
    const remainder = path.splitAt(span);
    piece = path;
    if (remainder && remainder !== path && remainder.length > CUT_EPSILON) rest.push(remainder);
    else remainder?.remove();
  } else {
    let tail: paper.Path | null = null;
    if (interval.to < length - CUT_EPSILON) tail = path.splitAt(interval.to);
    if (interval.from > CUT_EPSILON) {
      piece = path.splitAt(interval.from);
      rest.push(path);
    } else {
      piece = path;
    }
    if (tail) rest.push(tail);
  }

  assignPieceData(piece, sourceData);
  for (const r of rest) assignPieceData(r, sourceData);
  return { piece, rest };
}

/** Opens a closed path at a single offset without removing anything. */
export function openClosedPathAt(path: paper.Path, offset: number): void {
  const sourceData = path.data ?? {};
  path.splitAt(offset);
  assignPieceData(path, sourceData);
}

/**
 * Rebuilds export metadata for a path that was derived from `sourceData`'s
 * owner. Circles that were cut become arcs, splines keep their fit points, and
 * everything else falls back to plain geometry so the DXF exporter reads the
 * actual curves instead of stale shape metadata.
 */
export function assignPieceData(piece: paper.Path, sourceData: Record<string, unknown>): void {
  const center = sourceData.center;
  const radius = sourceData.radius;
  const layer = typeof sourceData.layer === 'string' ? sourceData.layer : undefined;
  if (center instanceof paper.Point && typeof radius === 'number') {
    if (piece.closed) {
      piece.data = { center: center.clone(), radius, isArc: false };
    } else {
      piece.data = arcDataFor(piece, center, radius);
    }
    if (layer) piece.data.layer = layer;
    return;
  }
  if (sourceData.isSpline) {
    piece.data = { isSpline: true, fitPoints: piece.segments.map((s) => s.point.clone()) };
    if (layer) piece.data.layer = layer;
    return;
  }
  piece.data = layer ? { layer } : {};
}

/**
 * Arc metadata (DXF convention: counter-clockwise from start to end angle in
 * the drawing's coordinate values) for an open path lying on a known circle.
 */
export function arcDataFor(piece: paper.Path, center: paper.Point, radius: number) {
  const start = piece.firstSegment.point;
  const end = piece.lastSegment.point;
  const mid = piece.getPointAt(piece.length / 2) ?? start;
  const angles = arcAngles(center, start, mid, end);
  if (angles.sweepAngle === 0 && piece.length > CUT_EPSILON) angles.sweepAngle = 360;
  return { isArc: true, center: center.clone(), radius, ...angles };
}

/**
 * Start/end angles (degrees, DXF counter-clockwise convention in coordinate
 * values) of the arc from `start` to `end` that passes through `mid`.
 */
export function arcAngles(center: paper.Point, start: paper.Point, mid: paper.Point, end: paper.Point) {
  const angleOf = (p: paper.Point) => normalizeAngle((Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI);
  let startAngle = angleOf(start);
  let endAngle = angleOf(end);
  const midAngle = angleOf(mid);

  const sweepStartToEnd = normalizeAngle(endAngle - startAngle);
  const midFromStart = normalizeAngle(midAngle - startAngle);
  if (midFromStart > sweepStartToEnd) {
    [startAngle, endAngle] = [endAngle, startAngle];
  }
  return { startAngle, endAngle, sweepAngle: normalizeAngle(endAngle - startAngle) };
}
