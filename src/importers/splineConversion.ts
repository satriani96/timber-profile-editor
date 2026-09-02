import paper from 'paper';

export interface XY {
  x: number;
  y: number;
}

const KNOT_EPSILON = 1e-9;

function lerp(a: XY, b: XY, t: number): XY {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Knot vector is non-decreasing and sized for the control point count. */
export function knotsAreValid(knots: number[], controlCount: number, degree: number): boolean {
  if (knots.length !== controlCount + degree + 1) return false;
  return knots.every((k, i) => i === 0 || k >= knots[i - 1] - KNOT_EPSILON);
}

/** Clamped: the first and last knots each repeat degree + 1 times. */
export function knotsAreClamped(knots: number[], degree: number): boolean {
  const n = knots.length;
  for (let i = 1; i <= degree; i++) {
    if (Math.abs(knots[i] - knots[0]) > KNOT_EPSILON) return false;
    if (Math.abs(knots[n - 1 - i] - knots[n - 1]) > KNOT_EPSILON) return false;
  }
  return true;
}

/** Boehm's algorithm: inserts knot `t` once, returning the refined control net. */
function insertKnot(control: XY[], knots: number[], degree: number, t: number): { control: XY[]; knots: number[] } {
  let k = degree;
  while (k < control.length - 1 && t >= knots[k + 1]) k++;
  const next: XY[] = [];
  for (let i = 0; i <= control.length; i++) {
    if (i <= k - degree) next.push(control[i]);
    else if (i > k) next.push(control[i - 1]);
    else {
      const denom = knots[i + degree] - knots[i];
      const alpha = denom <= KNOT_EPSILON ? 0 : (t - knots[i]) / denom;
      next.push(lerp(control[i - 1], control[i], alpha));
    }
  }
  const nextKnots = [...knots];
  nextKnots.splice(k + 1, 0, t);
  return { control: next, knots: nextKnots };
}

/**
 * Converts a clamped, non-rational B-spline of degree 1–3 into exact cubic
 * Bézier segments by raising every interior knot to full multiplicity.
 * Returns null when the spline cannot be represented exactly this way.
 */
export function bsplineToSegments(controlIn: XY[], degree: number, knotsIn: number[]): paper.Segment[] | null {
  if (degree < 1 || degree > 3 || controlIn.length < degree + 1) return null;
  if (!knotsAreValid(knotsIn, controlIn.length, degree) || !knotsAreClamped(knotsIn, degree)) return null;

  let control = controlIn.map((p) => ({ x: p.x, y: p.y }));
  let knots = [...knotsIn];

  // Raise each distinct interior knot to multiplicity `degree`.
  const domainStart = knots[degree];
  const domainEnd = knots[control.length];
  const distinct: number[] = [];
  for (let i = degree + 1; i < control.length; i++) {
    const k = knots[i];
    if (k > domainStart + KNOT_EPSILON && k < domainEnd - KNOT_EPSILON) {
      if (!distinct.length || Math.abs(distinct[distinct.length - 1] - k) > KNOT_EPSILON) distinct.push(k);
    }
  }
  for (const k of distinct) {
    let multiplicity = knots.filter((v) => Math.abs(v - k) <= KNOT_EPSILON).length;
    while (multiplicity < degree) {
      ({ control, knots } = insertKnot(control, knots, degree, k));
      multiplicity++;
    }
  }

  const spans = (control.length - 1) / degree;
  if (!Number.isInteger(spans) || spans < 1) return null;

  const segments: paper.Segment[] = [];
  const zero = new paper.Point(0, 0);
  const pointAt = (p: XY) => new paper.Point(p.x, p.y);

  for (let s = 0; s < spans; s++) {
    const base = s * degree;
    const p0 = control[base];
    const p3 = control[base + degree];
    let c1: XY;
    let c2: XY;
    if (degree === 3) {
      c1 = control[base + 1];
      c2 = control[base + 2];
    } else if (degree === 2) {
      const q = control[base + 1];
      c1 = lerp(p0, q, 2 / 3);
      c2 = lerp(p3, q, 2 / 3);
    } else {
      c1 = p0;
      c2 = p3;
    }
    const start = pointAt(p0);
    if (s === 0) segments.push(new paper.Segment(start, zero, pointAt(c1).subtract(start)));
    else segments[segments.length - 1].handleOut = pointAt(c1).subtract(start);
    const end = pointAt(p3);
    segments.push(new paper.Segment(end, pointAt(c2).subtract(end), zero));
  }
  return segments;
}

/** De Boor evaluation at parameter t (non-rational). */
export function evaluateBSpline(control: XY[], degree: number, knots: number[], t: number): XY {
  const n = control.length;
  let span = degree;
  while (span < n - 1 && t >= knots[span + 1]) span++;
  const d: XY[] = [];
  for (let j = 0; j <= degree; j++) d.push({ ...control[span - degree + j] });
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = span - degree + j;
      const denom = knots[i + degree - r + 1] - knots[i];
      const alpha = denom <= KNOT_EPSILON ? 0 : (t - knots[i]) / denom;
      d[j] = lerp(d[j - 1], d[j], alpha);
    }
  }
  return d[degree];
}

export function clampedUniformKnots(controlCount: number, degree: number): number[] {
  const knots: number[] = [];
  const inner = controlCount - degree - 1;
  for (let i = 0; i <= degree; i++) knots.push(0);
  for (let i = 1; i <= inner; i++) knots.push(i / (inner + 1));
  for (let i = 0; i <= degree; i++) knots.push(1);
  return knots;
}

/** Samples a B-spline of any degree into points along its parameter domain. */
export function sampleBSpline(control: XY[], degree: number, knots: number[], samplesPerSpan: number): paper.Point[] {
  const tStart = knots[degree];
  const tEnd = knots[control.length];
  const spans = Math.max(1, control.length - degree);
  const samples = Math.max(2, spans * samplesPerSpan);
  const points: paper.Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i === samples ? tEnd - 1e-12 : tStart + ((tEnd - tStart) * i) / samples;
    const p = evaluateBSpline(control, degree, knots, t);
    const point = new paper.Point(p.x, p.y);
    if (!points.length || !points[points.length - 1].isClose(point, 1e-9)) points.push(point);
  }
  return points;
}

/**
 * Exact NURBS representation of a Paper path's cubic Bézier curves: control
 * points and a knot vector with every interior knot at multiplicity three.
 */
export function pathToBezierSpline(path: paper.Path): { controlPoints: XY[]; knots: number[] } {
  const curves = path.curves;
  const controlPoints: XY[] = [];
  const knots: number[] = [0, 0, 0, 0];
  curves.forEach((curve, index) => {
    const p1 = curve.point1;
    const p2 = curve.point2;
    const c1 = p1.add(curve.handle1);
    const c2 = p2.add(curve.handle2);
    if (index === 0) controlPoints.push({ x: p1.x, y: p1.y });
    controlPoints.push({ x: c1.x, y: c1.y }, { x: c2.x, y: c2.y }, { x: p2.x, y: p2.y });
    const knot = index + 1;
    knots.push(knot, knot, knot);
  });
  knots.push(curves.length);
  return { controlPoints, knots };
}
