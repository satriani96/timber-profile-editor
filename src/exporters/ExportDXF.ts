import { DxfWriter, LWPolylineFlags, SplineFlags, Units, point2d, point3d, type CommonEntityOptions } from '@tarikjabiri/dxf';
import paper from 'paper';
import { dimensionLabel, dimensionOffset, readDimensionData } from '../canvas/dimensions';
import { arcAngles } from '../canvas/geometry/pathCuts';
import { DIMENSIONS_LAYER, getLayerState, itemLayerName } from '../canvas/layers';
import { pathToBezierSpline } from '../importers/splineConversion';
import { hexToAci } from './aci';

interface FilletMeta {
  cornerIndex: number;
  cornerPoint?: paper.Point;
  tangentPoint1: paper.Point;
  tangentPoint2: paper.Point;
  center: paper.Point;
  radius: number;
  startAngle: number;
  endAngle: number;
}

/** Curve samples used when a curve is neither straight nor circular. */
const FREEFORM_SAMPLES = 16;

/**
 * Serialises the sketch to DXF text in CAD's Y-up convention (see dxfPoint);
 * the importers apply the inverse so a file round-trips without change.
 */
export function buildDxf(project: paper.Project = paper.project): string {
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Millimeters);
  registerLayers(dxf, project);

  for (const item of project.activeLayer.children) {
    if (item.data?.isTemporary || item.data?.isMeasurement) continue;
    if (item.data?.isDimension && item instanceof paper.Group) {
      exportDimension(item, dxf);
      continue;
    }
    if (!(item instanceof paper.Path)) continue;
    if (item.segments.length < 2 || item.length <= 0) continue;
    exportPath(item, dxf);
  }
  return dxf.stringify();
}

function exportDimension(group: paper.Group, dxf: DxfWriter) {
  const data = readDimensionData(group);
  const opts = {
    layerName: DIMENSIONS_LAYER,
    text: dimensionLabel(data.kind, data.value),
    ActualMeasurement: data.value,
  };
  const first = dxfPoint(data.p1);
  const second = dxfPoint(data.p2);
  const offset = -dimensionOffset(data.p1, data.p2, data.textPoint, data.kind);
  const leaderLength = data.textPoint.getDistance(data.p2);
  switch (data.kind) {
    case 'horizontal':
      dxf.addLinearDim(first, second, { ...opts, angle: 0, offset });
      break;
    case 'vertical':
      dxf.addLinearDim(first, second, { ...opts, angle: 90, offset });
      break;
    case 'diameter':
      dxf.addDiameterDim(first, second, { ...opts, leaderLength });
      break;
    case 'radius':
      dxf.addRadialDim(first, second, { ...opts, leaderLength });
      break;
    default:
      dxf.addAlignedDim(first, second, { ...opts, offset });
  }
}

function registerLayers(dxf: DxfWriter, project: paper.Project) {
  const seen = new Set<string>();
  const add = (name: string, color: string) => {
    if (!name || name === '0' || seen.has(name)) return;
    if (!dxf.layer(name)) dxf.addLayer(name, hexToAci(color), 'Continuous');
    seen.add(name);
  };
  for (const layer of getLayerState().layers) add(layer.name, layer.color);
  for (const item of project.activeLayer.children) {
    if (item.data?.isTemporary || item.data?.isMeasurement) continue;
    const name = itemLayerName(item);
    add(name, '#000000');
  }
}

function entityOpts(path: paper.Path): CommonEntityOptions {
  return { layerName: itemLayerName(path) };
}

/** Builds the DXF and triggers a browser download. */
export const exportToDXF = () => {
  const blob = new Blob([buildDxf()], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'timber-profile.dxf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
};

/**
 * The sketch is Y-down (screen space); DXF is Y-up. Flipping Y here (and again
 * on import) makes the exported profile look in CAD/CAM exactly as it does on
 * screen. Arc angles flip with it: a counter-clockwise sweep from a to b in
 * screen space becomes a sweep from -b to -a in DXF space.
 */
function dxfPoint(p: paper.Point) {
  return point3d(p.x, -p.y);
}

function dxfVertex(p: paper.Point) {
  return { point: point2d(p.x, -p.y) };
}

function addArc(
  dxf: DxfWriter,
  center: paper.Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  options?: CommonEntityOptions
) {
  const start = ((-endAngle % 360) + 360) % 360;
  let end = ((-startAngle % 360) + 360) % 360;
  if (end <= start) end += 360;
  dxf.addArc(dxfPoint(center), radius, start, end, options);
}

function exportPath(path: paper.Path, dxf: DxfWriter): void {
  const data = (path.data ?? {}) as Record<string, unknown>;
  const opts = entityOpts(path);

  if (Array.isArray(data.fillets) && data.fillets.length > 0 && path.closed) {
    exportFilletedPolygon(path, data.fillets as FilletMeta[], dxf);
    return;
  }

  const center = data.center;
  const radius = data.radius;
  if (center instanceof paper.Point && typeof radius === 'number' && radius > 0) {
    if (path.closed && !data.isArc) {
      dxf.addCircle(dxfPoint(center), radius, opts);
      return;
    }
    if (data.isArc && typeof data.startAngle === 'number' && typeof data.endAngle === 'number') {
      addArc(dxf, center, radius, data.startAngle, data.endAngle, opts);
      return;
    }
  }

  if (data.isSpline && path.hasHandles()) {
    exportSpline(path, dxf);
    return;
  }

  if (path.curves.every((c) => c.isStraight())) {
    const vertices = path.segments.map((s) => dxfVertex(s.point));
    if (path.closed) {
      dxf.addLWPolyline(vertices, { flags: LWPolylineFlags.Closed, ...opts });
    } else if (vertices.length === 2) {
      dxf.addLine(dxfPoint(path.firstSegment.point), dxfPoint(path.lastSegment.point), opts);
    } else {
      dxf.addLWPolyline(vertices, opts);
    }
    return;
  }

  for (const curve of path.curves) exportCurve(curve, dxf, opts);
}

/** Straight curves become lines, circular curves become arcs, anything else is sampled. */
function exportCurve(curve: paper.Curve, dxf: DxfWriter, options?: CommonEntityOptions): void {
  if (curve.isStraight()) {
    dxf.addLine(dxfPoint(curve.point1), dxfPoint(curve.point2), options);
    return;
  }
  const arc = fitCircularArc(curve);
  if (arc) {
    addArc(dxf, arc.center, arc.radius, arc.startAngle, arc.endAngle, options);
    return;
  }
  const vertices = [];
  for (let i = 0; i <= FREEFORM_SAMPLES; i++) {
    const p = curve.getPointAtTime(i / FREEFORM_SAMPLES);
    vertices.push(dxfVertex(p));
  }
  dxf.addLWPolyline(vertices, options);
}

/** Circle through three points, or null when they are (nearly) collinear. */
function circumcenter(a: paper.Point, b: paper.Point, c: paper.Point): paper.Point | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return new paper.Point(
    (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  );
}

/**
 * Detects Bézier curves that approximate a circular arc (fillets, cut circles)
 * so they can be written as true DXF arcs.
 */
export function fitCircularArc(curve: paper.Curve) {
  const start = curve.point1;
  const end = curve.point2;
  const mid = curve.getPointAtTime(0.5);
  const center = circumcenter(start, mid, end);
  if (!center) return null;
  const radius = center.getDistance(start);
  if (radius <= 0) return null;
  const tolerance = Math.max(0.005, radius * 0.002);
  for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) {
    if (Math.abs(center.getDistance(curve.getPointAtTime(t)) - radius) > tolerance) return null;
  }
  return { center, radius, ...arcAngles(center, start, mid, end) };
}

/** Writes the path's cubic Bézier curves as an exact degree-3 NURBS. */
function exportSpline(path: paper.Path, dxf: DxfWriter): void {
  const { controlPoints, knots } = pathToBezierSpline(path);
  const fitPoints = path.segments.map((s) => dxfPoint(s.point));
  if (path.closed) fitPoints.push(dxfPoint(path.firstSegment.point));
  dxf.addSpline(
    {
      controlPoints: controlPoints.map((p) => point3d(p.x, -p.y, 0)),
      fitPoints,
      knots,
      degreeCurve: 3,
      flags: SplineFlags.Planar | (path.closed ? SplineFlags.Closed : 0),
    },
    entityOpts(path)
  );
}

function resolveFilletCornerIndex(path: paper.Path, fillet: FilletMeta): number {
  const cp = fillet.cornerPoint;
  if (cp && typeof cp.getDistance === 'function') {
    let best = fillet.cornerIndex;
    let bestD = Infinity;
    for (let i = 0; i < path.segments.length; i++) {
      const d = path.segments[i].point.getDistance(cp);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
  return fillet.cornerIndex;
}

/** Closed polygon with fillet metadata: straight edges between tangent points plus true arcs. */
function exportFilletedPolygon(path: paper.Path, fillets: FilletMeta[], dxf: DxfWriter): void {
  const opts = entityOpts(path);
  const resolvedByFillet = fillets.map((f) => resolveFilletCornerIndex(path, f));
  const filletCorners = new Set(resolvedByFillet);

  const tangentPoints = new Map<number, { prev: paper.Point; next: paper.Point }>();
  fillets.forEach((fillet, idx) => {
    tangentPoints.set(resolvedByFillet[idx], { prev: fillet.tangentPoint1, next: fillet.tangentPoint2 });
  });

  let exportPoints: paper.Point[] = [];
  for (let i = 0; i < path.segments.length; i++) {
    const tangents = tangentPoints.get(i);
    if (filletCorners.has(i) && tangents) {
      exportPoints.push(tangents.prev, tangents.next);
    } else {
      exportPoints.push(path.segments[i].point);
    }
  }
  exportPoints = exportPoints.filter((pt, idx, arr) => idx === 0 || !pt.equals(arr[idx - 1]));
  exportPoints = exportPoints.filter((pt, idx, arr) => arr.findIndex((p) => p.equals(pt)) === idx);
  if (exportPoints.length > 1 && exportPoints[0].equals(exportPoints[exportPoints.length - 1])) {
    exportPoints.pop();
  }

  for (let i = 0; i < exportPoints.length; i++) {
    const p1 = exportPoints[i];
    const p2 = exportPoints[(i + 1) % exportPoints.length];
    const isArcChord = fillets.some((_, fi) => {
      const pair = tangentPoints.get(resolvedByFillet[fi]);
      return (
        pair &&
        ((p1.equals(pair.prev) && p2.equals(pair.next)) || (p1.equals(pair.next) && p2.equals(pair.prev)))
      );
    });
    if (!isArcChord) dxf.addLine(dxfPoint(p1), dxfPoint(p2), opts);
  }

  for (const fillet of fillets) {
    addArc(dxf, fillet.center, fillet.radius, fillet.startAngle, fillet.endAngle, opts);
  }
}
