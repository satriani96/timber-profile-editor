import paper from 'paper';
import { DIMENSIONS_LAYER, itemLayerName } from '../canvas/layers';

/** Length of the rendered offcut, framed whole like a photographed sample. */
export const SAMPLE_LENGTH_MM = 300;
/** Same as sketch touch distance — CAD fillets often miss by a few microns. */
const JOIN_TOLERANCE_MM = 0.05;
const SAMPLE_STEP_MM = 0.4;
const MIN_AREA = 1e-4;

export type Point2 = { x: number; y: number };

export type ProfileLoops = {
  outer: Point2[];
  holes: Point2[][];
};

export class ProfileSolidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileSolidError';
  }
}

type Polyline = { points: paper.Point[] };

function isProfilePath(item: paper.Item): item is paper.Path {
  if (!(item instanceof paper.Path) || !item.visible) return false;
  if (item.data?.isTemporary || item.data?.isMeasurement || item.data?.isDimension) return false;
  if (item.length <= 0 || item.segments.length < 2) return false;
  return itemLayerName(item) !== DIMENSIONS_LAYER;
}

function collectProfilePaths(project: paper.Project): paper.Path[] {
  if (!project.activeLayer) throw new ProfileSolidError('Canvas is not ready.');
  return project.activeLayer.children.filter(isProfilePath);
}

function nearly(a: paper.Point, b: paper.Point): boolean {
  return a.getDistance(b) <= JOIN_TOLERANCE_MM;
}

function clonePoints(path: paper.Path): paper.Point[] {
  return path.segments.map((segment) => segment.point.clone());
}

function reversePoints(points: paper.Point[]): paper.Point[] {
  return points.map((point) => point.clone()).reverse();
}

/** Stitch open sketch paths whose endpoints meet into closed loops. */
export function joinOpenPaths(paths: paper.Path[]): { closed: paper.Path[]; leftover: number } {
  const remaining: Polyline[] = paths.filter((path) => !path.closed).map((path) => ({ points: clonePoints(path) }));
  const closed: paper.Path[] = paths.filter((path) => path.closed);
  let leftover = 0;

  while (remaining.length > 0) {
    const chain = remaining.pop()!;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const piece = remaining[i];
        const start = chain.points[0];
        const end = chain.points[chain.points.length - 1];
        const pieceStart = piece.points[0];
        const pieceEnd = piece.points[piece.points.length - 1];
        if (nearly(end, pieceStart)) {
          chain.points.push(...piece.points.slice(1));
        } else if (nearly(end, pieceEnd)) {
          chain.points.push(...reversePoints(piece.points).slice(1));
        } else if (nearly(start, pieceEnd)) {
          chain.points.unshift(...piece.points.slice(0, -1));
        } else if (nearly(start, pieceStart)) {
          chain.points.unshift(...reversePoints(piece.points).slice(0, -1));
        } else {
          continue;
        }
        remaining.splice(i, 1);
        grew = true;
      }
    }

    const first = chain.points[0];
    const last = chain.points[chain.points.length - 1];
    if (chain.points.length >= 3 && nearly(first, last)) {
      const loop = nearly(first, last) ? chain.points.slice(0, -1) : chain.points;
      if (loop.length >= 3) {
        closed.push(new paper.Path({ insert: false, closed: true, segments: loop }));
        continue;
      }
    }
    leftover += 1;
  }

  return { closed, leftover };
}

function loopInside(outer: paper.Path, inner: paper.Path): boolean {
  if (!outer.contains(inner.position)) return false;
  return inner.segments.every((segment) => outer.contains(segment.point));
}

function signedArea(points: Point2[]): number {
  let area = 0;
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function withWinding(points: Point2[], clockwise: boolean): Point2[] {
  const isClockwise = signedArea(points) < 0;
  return isClockwise === clockwise ? points : points.slice().reverse();
}

/** Sample a closed paper path into a Y-up millimetre polygon (DXF convention). */
export function sampleLoopYUp(path: paper.Path): Point2[] {
  const points: Point2[] = [];
  const push = (point: paper.Point) => {
    points.push({ x: point.x, y: -point.y });
  };

  for (const segment of path.segments) {
    push(segment.point);
    const curve = segment.curve;
    if (!curve || curve.length <= 1e-9 || curve.isStraight()) continue;
    const steps = Math.max(2, Math.ceil(curve.length / SAMPLE_STEP_MM));
    for (let i = 1; i < steps; i++) {
      push(curve.getPointAtTime(i / steps));
    }
  }

  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= JOIN_TOLERANCE_MM) points.pop();
  }
  if (points.length < 3) {
    throw new ProfileSolidError('The profile outline has no area.');
  }
  return points;
}

export function extractProfileLoops(project: paper.Project = paper.project): ProfileLoops {
  if (!project) throw new ProfileSolidError('Canvas is not ready.');

  const paths = collectProfilePaths(project);
  if (paths.length === 0) {
    throw new ProfileSolidError('Draw a closed profile outline to preview.');
  }

  const { closed } = joinOpenPaths(paths);
  if (closed.length === 0) {
    throw new ProfileSolidError('Close the profile outline to preview.');
  }

  const ranked = [...closed].sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const outerPath = ranked[0];
  if (Math.abs(outerPath.area) < MIN_AREA) {
    throw new ProfileSolidError('The profile outline has no area.');
  }

  // CAD sketches often include construction and a second island. Preview the
  // largest closed outline; only treat loops inside it as holes.
  const holes = ranked
    .slice(1)
    .filter((candidate) => Math.abs(candidate.area) >= MIN_AREA && loopInside(outerPath, candidate));

  const outer = withWinding(sampleLoopYUp(outerPath), false);
  const holeLoops = holes.map((hole) => withWinding(sampleLoopYUp(hole), true));
  return { outer, holes: holeLoops };
}

export function profileBounds(loops: ProfileLoops): { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of loops.outer) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function describeProfileError(error: unknown): string {
  if (error instanceof ProfileSolidError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Could not build a 3D preview from this drawing.';
}
