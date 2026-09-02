import paper from 'paper';
import { BASE_STROKE_WIDTH } from '../components/sketch/constants';
import { arcDataFor } from '../canvas/geometry/pathCuts';

export interface ImportSummary {
  imported: number;
  skipped: Record<string, number>;
  items: paper.Path[];
}

export type SkipCounter = Record<string, number>;

/** Builds geometry into the active layer under `matrix`, appending to `items`. */
export type GeometryBuilder = (matrix: paper.Matrix, items: paper.Path[], skipped: SkipCounter) => void;

/** A parsed file waiting for the user to confirm its units before it is placed. */
export interface PreparedImport {
  format: 'dxf' | 'tcw';
  entityCount: number;
  /** Bounding size of the geometry in the file's own drawing units. */
  extents: { width: number; height: number } | null;
  /** Millimetres per drawing unit suggested by the file (1 when unspecified). */
  headerMmPerUnit: number;
  /** One-line explanation of where the suggested unit came from. */
  unitsNote: string;
  /** Entity types the parser saw but does not understand. */
  unsupported: SkipCounter;
  build: GeometryBuilder;
}

export function skip(skipped: SkipCounter, key: string) {
  skipped[key] = (skipped[key] ?? 0) + 1;
}

/** Measures what `build` would produce, without leaving anything in the sketch. */
export function measureBuilder(build: GeometryBuilder): { extents: PreparedImport['extents']; count: number } {
  const probe: paper.Path[] = [];
  build(new paper.Matrix(), probe, {});
  let bounds: paper.Rectangle | null = null;
  for (const item of probe) bounds = bounds ? bounds.unite(item.bounds) : item.bounds.clone();
  probe.forEach((item) => item.remove());
  return { extents: bounds ? { width: bounds.width, height: bounds.height } : null, count: probe.length };
}

/**
 * Adds the prepared geometry to the active layer, scaling drawing units to
 * millimetres. CAD files are Y-up and the sketch is Y-down, so Y is flipped;
 * the exporter flips it back, keeping round-trips exact.
 */
export function commitImport(prepared: PreparedImport, mmPerUnit: number): ImportSummary {
  const items: paper.Path[] = [];
  const skipped: SkipCounter = { ...prepared.unsupported };
  prepared.build(importMatrix(mmPerUnit), items, skipped);
  return { imported: items.length, skipped, items };
}

export function importMatrix(mmPerUnit: number): paper.Matrix {
  return new paper.Matrix().scale(mmPerUnit, -mmPerUnit);
}

export function pointOnCircle(center: paper.Point, radius: number, angleDeg: number): paper.Point {
  const rad = (angleDeg * Math.PI) / 180;
  return center.add(new paper.Point(Math.cos(rad) * radius, Math.sin(rad) * radius));
}

function style(path: paper.Path): paper.Path {
  path.strokeColor = new paper.Color('black');
  path.strokeWidth = BASE_STROKE_WIDTH / paper.view.zoom;
  return path;
}

/** Transforms a locally built path into drawing space and rebuilds its circle/arc metadata. */
export function commitPath(
  path: paper.Path,
  matrix: paper.Matrix,
  items: paper.Path[],
  circular?: { center: paper.Point; radius: number; full: boolean }
) {
  path.transform(matrix);
  if (circular) {
    const scaling = matrix.scaling;
    const uniform = Math.abs(Math.abs(scaling.x) - Math.abs(scaling.y)) < 1e-9;
    if (uniform) {
      const center = matrix.transform(circular.center);
      const radius = circular.radius * Math.abs(scaling.x);
      path.data = circular.full ? { center, radius, isArc: false } : arcDataFor(path, center, radius);
    } else {
      path.data = {};
    }
  } else if (!path.data?.isSpline) {
    path.data = {};
  }
  items.push(style(path));
}

/** Circle or counter-clockwise arc (DXF angle convention) built in local coordinates. */
export function buildCircular(
  center: paper.Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  matrix: paper.Matrix,
  items: paper.Path[]
) {
  let sweep = ((endAngle - startAngle) % 360 + 360) % 360;
  if (sweep === 0) sweep = 360;
  if (sweep >= 360 - 1e-9) {
    commitPath(new paper.Path.Circle({ center, radius }), matrix, items, { center, radius, full: true });
    return;
  }
  const arc = new paper.Path.Arc({
    from: pointOnCircle(center, radius, startAngle),
    through: pointOnCircle(center, radius, startAngle + sweep / 2),
    to: pointOnCircle(center, radius, startAngle + sweep),
  });
  commitPath(arc, matrix, items, { center, radius, full: false });
}
