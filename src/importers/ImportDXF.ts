import paper from 'paper';
import { BASE_STROKE_WIDTH } from '../components/sketch/constants';
import { arcDataFor } from '../canvas/geometry/pathCuts';
import { millimetresPerUnit, parseDxf, type DxfDocument, type DxfEntity, type DxfPoint, type DxfVertex } from './dxfParser';
import { bsplineToSegments, clampedUniformKnots, knotsAreValid, sampleBSpline } from './splineConversion';

export interface ImportSummary {
  imported: number;
  skipped: Record<string, number>;
  items: paper.Path[];
}

const MAX_BLOCK_DEPTH = 8;
const SPLINE_SAMPLES_PER_SPAN = 4;
const ELLIPSE_SAMPLES = 48;

/** A parsed file waiting for the user to confirm its units. */
export interface PreparedImport {
  doc: DxfDocument;
  /** Bounding size of the geometry in the file's own drawing units. */
  extents: { width: number; height: number } | null;
  /** $INSUNITS from the header; 0 when the file does not say. */
  headerUnits: number;
  /** Millimetres per drawing unit implied by the header (1 when unspecified). */
  headerMmPerUnit: number;
  entityCount: number;
}

/**
 * Parses the file and measures its geometry without adding anything to the
 * sketch, so the caller can show the user what the header claims and let them
 * override it. CAD exporters do not always write a $INSUNITS that matches the
 * numbers in the file.
 */
export function prepareDxfImport(text: string): PreparedImport {
  const doc = parseDxf(text);
  const probe: paper.Path[] = [];
  buildEntities(doc.entities, new paper.Matrix(), doc, probe, {}, 0);
  let bounds: paper.Rectangle | null = null;
  for (const item of probe) bounds = bounds ? bounds.unite(item.bounds) : item.bounds.clone();
  probe.forEach((item) => item.remove());
  return {
    doc,
    extents: bounds ? { width: bounds.width, height: bounds.height } : null,
    headerUnits: doc.insUnits,
    headerMmPerUnit: millimetresPerUnit(doc.insUnits),
    entityCount: probe.length,
  };
}

/**
 * Adds the prepared geometry to the active layer, scaling drawing units to
 * millimetres by `mmPerUnit`. Coordinates are used exactly as the exporter
 * writes them (no Y flip), so round-tripping a profile is lossless.
 */
export function commitDxfImport(prepared: PreparedImport, mmPerUnit: number): ImportSummary {
  const unitMatrix = new paper.Matrix().scale(mmPerUnit);
  const items: paper.Path[] = [];
  const skipped: Record<string, number> = { ...prepared.doc.unsupported };
  buildEntities(prepared.doc.entities, unitMatrix, prepared.doc, items, skipped, 0);
  return { imported: items.length, skipped, items };
}

/** One-step import using the header's units (or a caller-supplied override). */
export function importDxfText(text: string, mmPerUnit?: number): ImportSummary {
  const prepared = prepareDxfImport(text);
  return commitDxfImport(prepared, mmPerUnit ?? prepared.headerMmPerUnit);
}

function skip(skipped: Record<string, number>, key: string) {
  skipped[key] = (skipped[key] ?? 0) + 1;
}

function toPoint(p: DxfPoint): paper.Point {
  return new paper.Point(p.x, p.y);
}

function pointOnCircle(center: paper.Point, radius: number, angleDeg: number): paper.Point {
  const rad = (angleDeg * Math.PI) / 180;
  return center.add(new paper.Point(Math.cos(rad) * radius, Math.sin(rad) * radius));
}

function style(path: paper.Path): paper.Path {
  path.strokeColor = new paper.Color('black');
  path.strokeWidth = BASE_STROKE_WIDTH / paper.view.zoom;
  return path;
}

/** Transforms a locally built path into drawing space and rebuilds its circle/arc metadata. */
function commit(
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

function buildEntities(
  entities: DxfEntity[],
  matrix: paper.Matrix,
  doc: DxfDocument,
  items: paper.Path[],
  skipped: Record<string, number>,
  depth: number
) {
  for (const entity of entities) {
    switch (entity.type) {
      case 'LINE': {
        const from = toPoint(entity.start);
        const to = toPoint(entity.end);
        if (from.isClose(to, 1e-9)) {
          skip(skipped, 'LINE (zero length)');
          break;
        }
        commit(new paper.Path.Line({ from, to }), matrix, items);
        break;
      }
      case 'CIRCLE': {
        if (entity.radius <= 0) {
          skip(skipped, 'CIRCLE (zero radius)');
          break;
        }
        const center = toPoint(entity.center);
        commit(new paper.Path.Circle({ center, radius: entity.radius }), matrix, items, {
          center,
          radius: entity.radius,
          full: true,
        });
        break;
      }
      case 'ARC': {
        if (entity.radius <= 0) {
          skip(skipped, 'ARC (zero radius)');
          break;
        }
        const center = toPoint(entity.center);
        let sweep = ((entity.endAngle - entity.startAngle) % 360 + 360) % 360;
        if (sweep === 0) sweep = 360;
        if (sweep >= 360 - 1e-9) {
          commit(new paper.Path.Circle({ center, radius: entity.radius }), matrix, items, {
            center,
            radius: entity.radius,
            full: true,
          });
          break;
        }
        const arc = new paper.Path.Arc({
          from: pointOnCircle(center, entity.radius, entity.startAngle),
          through: pointOnCircle(center, entity.radius, entity.startAngle + sweep / 2),
          to: pointOnCircle(center, entity.radius, entity.startAngle + sweep),
        });
        commit(arc, matrix, items, { center, radius: entity.radius, full: false });
        break;
      }
      case 'POLYLINE': {
        const path = buildPolyline(entity.vertices, entity.closed);
        if (!path) {
          skip(skipped, 'POLYLINE (degenerate)');
          break;
        }
        commit(path, matrix, items);
        break;
      }
      case 'SPLINE': {
        const path = buildSpline(entity);
        if (!path) {
          skip(skipped, 'SPLINE (degenerate)');
          break;
        }
        commit(path, matrix, items);
        break;
      }
      case 'ELLIPSE': {
        const path = buildEllipse(entity);
        if (!path) {
          skip(skipped, 'ELLIPSE (degenerate)');
          break;
        }
        commit(path, matrix, items);
        break;
      }
      case 'INSERT': {
        const block = doc.blocks[entity.name];
        if (!block) {
          skip(skipped, `INSERT (missing block "${entity.name}")`);
          break;
        }
        if (depth >= MAX_BLOCK_DEPTH) {
          skip(skipped, 'INSERT (nested too deeply)');
          break;
        }
        if (entity.scale.x === 0 || entity.scale.y === 0) {
          skip(skipped, 'INSERT (zero scale)');
          break;
        }
        const blockMatrix = matrix
          .clone()
          .translate(toPoint(entity.position))
          .rotate(entity.rotation, new paper.Point(0, 0))
          .scale(entity.scale.x, entity.scale.y)
          .translate(-block.base.x, -block.base.y);
        buildEntities(block.entities, blockMatrix, doc, items, skipped, depth + 1);
        break;
      }
    }
  }
}

/** Appends an arc (defined by a DXF bulge) from the path's last segment to `to`. */
function appendBulgeArc(path: paper.Path, to: paper.Point, bulge: number) {
  const from = path.lastSegment.point;
  const chord = to.subtract(from);
  const chordLength = chord.length;
  if (chordLength < 1e-9) return;
  const sagitta = (Math.abs(bulge) * chordLength) / 2;
  // Positive bulge is counter-clockwise (in DXF coordinate values), which places
  // the arc midpoint on the right-hand side of the chord direction.
  const normal = new paper.Point(chord.y, -chord.x).normalize().multiply(Math.sign(bulge) || 1);
  const through = from.add(chord.divide(2)).add(normal.multiply(sagitta));
  const arc = new paper.Path.Arc({ from, through, to, insert: false });
  path.lastSegment.handleOut = arc.firstSegment.handleOut;
  for (let i = 1; i < arc.segments.length; i++) {
    const s = arc.segments[i];
    path.add(new paper.Segment(s.point, s.handleIn, s.handleOut));
  }
  arc.remove();
}

function buildPolyline(vertices: DxfVertex[], closed: boolean): paper.Path | null {
  const cleaned: DxfVertex[] = [];
  for (const v of vertices) {
    const last = cleaned[cleaned.length - 1];
    if (last && Math.abs(last.x - v.x) < 1e-9 && Math.abs(last.y - v.y) < 1e-9) {
      last.bulge = v.bulge;
      continue;
    }
    cleaned.push({ ...v });
  }
  if (closed && cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.abs(last.x - first.x) < 1e-9 && Math.abs(last.y - first.y) < 1e-9) cleaned.pop();
  }
  if (cleaned.length < 2) return null;

  const path = new paper.Path({ segments: [toPoint(cleaned[0])] });
  for (let i = 1; i < cleaned.length; i++) {
    const prev = cleaned[i - 1];
    const next = toPoint(cleaned[i]);
    if (prev.bulge !== 0) appendBulgeArc(path, next, prev.bulge);
    else path.add(next);
  }
  if (closed) {
    const last = cleaned[cleaned.length - 1];
    if (last.bulge !== 0) {
      appendBulgeArc(path, toPoint(cleaned[0]), last.bulge);
      const seam = path.lastSegment;
      path.firstSegment.handleIn = seam.handleIn;
      seam.remove();
    }
    path.closed = true;
  }
  return path.length > 1e-9 ? path : null;
}

function finishSpline(path: paper.Path, closed: boolean): paper.Path | null {
  if (closed && path.segments.length > 2 && path.firstSegment.point.isClose(path.lastSegment.point, 1e-9)) {
    path.firstSegment.handleIn = path.lastSegment.handleIn;
    path.lastSegment.remove();
    path.closed = true;
  }
  if (path.segments.length < 2 || path.length < 1e-9) return null;
  path.data = { isSpline: true, fitPoints: path.segments.map((s) => s.point.clone()) };
  return path;
}

/**
 * Control-point splines are converted exactly when they are clamped
 * degree 1–3 curves (which covers everything this app exports); anything else
 * is sampled with De Boor's algorithm and smoothed through the samples.
 * Splines that only carry fit points are interpolated through them.
 */
function buildSpline(entity: Extract<DxfEntity, { type: 'SPLINE' }>): paper.Path | null {
  const control = entity.controlPoints;

  if (control.length >= 2) {
    const degree = Math.min(entity.degree, control.length - 1);
    if (degree < 1) return null;
    const knots = knotsAreValid(entity.knots, control.length, degree)
      ? entity.knots
      : clampedUniformKnots(control.length, degree);

    const segments = bsplineToSegments(control, degree, knots);
    if (segments) return finishSpline(new paper.Path({ segments }), entity.closed);

    const points = sampleBSpline(control, degree, knots, SPLINE_SAMPLES_PER_SPAN);
    if (points.length < 2) return null;
    const path = new paper.Path({ segments: points });
    path.smooth({ type: 'catmull-rom', factor: 0.5 });
    return finishSpline(path, entity.closed);
  }

  if (entity.fitPoints.length >= 2) {
    const path = new paper.Path({ segments: entity.fitPoints.map(toPoint) });
    path.smooth({ type: 'catmull-rom', factor: 0.5 });
    return finishSpline(path, entity.closed);
  }

  return null;
}

function buildEllipse(entity: Extract<DxfEntity, { type: 'ELLIPSE' }>): paper.Path | null {
  const center = toPoint(entity.center);
  const major = toPoint(entity.majorAxis);
  const a = major.length;
  const b = a * entity.ratio;
  if (a <= 0 || b <= 0) return null;
  const minor = new paper.Point(-major.y, major.x).normalize().multiply(b);

  let sweep = entity.endParam - entity.startParam;
  while (sweep <= 0) sweep += Math.PI * 2;
  const full = sweep >= Math.PI * 2 - 1e-9;

  if (full) {
    const path = new paper.Path.Ellipse({ center: [0, 0], radius: [a, b] });
    path.rotate(major.angle, new paper.Point(0, 0));
    path.position = center;
    return path;
  }

  const samples = Math.max(8, Math.round((ELLIPSE_SAMPLES * sweep) / (Math.PI * 2)));
  const points: paper.Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = entity.startParam + (sweep * i) / samples;
    points.push(center.add(major.multiply(Math.cos(t))).add(minor.multiply(Math.sin(t))));
  }
  const path = new paper.Path({ segments: points });
  path.smooth({ type: 'catmull-rom', factor: 0.5 });
  return path;
}
