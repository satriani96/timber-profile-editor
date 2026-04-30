import { DxfWriter, point3d, point2d, LWPolylineFlags } from '@tarikjabiri/dxf';
import paper from 'paper';

// Type definitions for Paper.js path metadata
interface CircleData {
  center: paper.Point;
  radius: number;
  isArc?: boolean;
}

interface ArcData extends CircleData {
  isArc: true;
  startAngle: number;
  endAngle: number;
  sweepAngle: number;
}

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

/**
 * Exports the current Paper.js canvas content to DXF format
 * and triggers a download of the resulting file
 */
export const exportToDXF = () => {
  const dxf = new DxfWriter();

  // Process all paths in the active layer
  paper.project.activeLayer.children.forEach((item) => {
    // Skip temporary/debug paths like snap indicators or construction lines
    if (item.data && item.data.isTemporary) {
      return;
    }
    
    if (item instanceof paper.Path) {
      // Track if this item was processed
      let processed = false;
      
      // Check for fillets array in closed shapes
      if (item.data?.fillets && Array.isArray(item.data.fillets) && item.data.fillets.length > 0) {
        const fillets = item.data.fillets as FilletMeta[];
        const resolvedByFillet = fillets.map((f) => resolveFilletCornerIndex(item, f));
        const filletCorners = new Set(resolvedByFillet);

        const tangentPoints = new Map<number, { prev: paper.Point; next: paper.Point }>();
        fillets.forEach((fillet, idx) => {
          const cornerIdx = resolvedByFillet[idx];
          tangentPoints.set(cornerIdx, {
            prev: fillet.tangentPoint1,
            next: fillet.tangentPoint2,
          });
        });

        let exportPoints: paper.Point[] = [];
        for (let i = 0; i < item.segments.length; i++) {
          if (filletCorners.has(i) && tangentPoints.has(i)) {
            const t1 = tangentPoints.get(i)!.prev;
            const t2 = tangentPoints.get(i)!.next;
            exportPoints.push(t1);
            exportPoints.push(t2);
          } else {
            exportPoints.push(item.segments[i].point);
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
          let skipLine = false;
          for (let fi = 0; fi < fillets.length; fi++) {
            const cornerIdx = resolvedByFillet[fi];
            const tangentPair = tangentPoints.get(cornerIdx);
            if (tangentPair) {
              if (
                (p1.equals(tangentPair.prev) && p2.equals(tangentPair.next)) ||
                (p1.equals(tangentPair.next) && p2.equals(tangentPair.prev))
              ) {
                skipLine = true;
                break;
              }
            }
          }
          if (!skipLine) {
            dxf.addLine(dxfPoint(p1.x, p1.y), dxfPoint(p2.x, p2.y));
          }
        }

        fillets.forEach((fillet) => {
          const startAngle = fillet.startAngle;
          let endAngle = fillet.endAngle;
          if (endAngle < startAngle) {
            endAngle += 360;
          }
          dxf.addArc(dxfPoint(fillet.center.x, fillet.center.y), fillet.radius, startAngle, endAngle);
        });

        processed = true;
      }
      // Check for circle data first
      else if (item.data?.center && item.data.radius !== undefined && !item.data.isArc) {
        const circleCenter = item.data.center;
        const radius = item.data.radius;
        dxf.addCircle(dxfPoint(circleCenter.x, circleCenter.y), radius);
      }
      // Check for rectangle/square data
      else if (item.segments && item.segments.length === 4 && isRectangle(item)) {
        const vertices = item.segments.map((segment) => ({
          point: point2d(segment.point.x, segment.point.y),
        }));
        dxf.addLWPolyline(vertices, { flags: LWPolylineFlags.Closed });
      }
      // CRITICAL: Check for arc data before assuming it's a straight line
      else if (item.data?.isArc && item.data.center) {
        if (item.data.startAngle !== undefined && item.data.endAngle !== undefined && item.data.radius) {
          exportArc(item, dxf);
          processed = true;
        } else {
          sampleAndExportCurve(item, dxf);
          processed = true;
        }
      } 
      // Check for a simple straight line (2 segments, no arc data)
      else if (item.segments.length === 2 && !processed) {
        // It's a straight line
        const startPoint = item.segments[0].point;
        const endPoint = item.segments[1].point;
        dxf.addLine(dxfPoint(startPoint.x, startPoint.y), dxfPoint(endPoint.x, endPoint.y));
        processed = true;
      } 
      // Handle curves and other complex paths that weren't processed by previous conditions
      else if (!processed && item.segments.length > 1 && item.curves && item.curves.length > 0) {
        // Check if this path is a Bézier spline (has non-zero handles)
        const hasBezierHandles = item.segments.some(seg =>
          (seg.handleIn && seg.handleIn.length > 0) || (seg.handleOut && seg.handleOut.length > 0)
        );
        if (hasBezierHandles) {
          exportBezierSplineToDXF(item, dxf);
          processed = true;
        } else {
          sampleAndExportCurve(item, dxf);
          processed = true;
        }
      }
    }
  });

  const dxfString = dxf.stringify();

  const blob = new Blob([dxfString], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'timber-profile.dxf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Point helper for coordinate system conversion
 * Paper.js has Y-down, but DXF typically expects Y-up
 */
// Rectangle detection: checks for 4 segments and right angles
function isRectangle(path: paper.Path): boolean {
  if (path.segments.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const p1 = path.segments[i].point;
    const p2 = path.segments[(i + 1) % 4].point;
    const p3 = path.segments[(i + 2) % 4].point;
    const v1 = new paper.Point(p2.x - p1.x, p2.y - p1.y);
    const v2 = new paper.Point(p3.x - p2.x, p3.y - p2.y);
    const dotProduct = v1.x * v2.x + v1.y * v2.y;
    if (Math.abs(dotProduct) > 0.01) {
      return false;
    }
  }
  return true;
}

function dxfPoint(x: number, y: number) {
  return point3d(x, y); // No inversion needed for our specific use case
}

/**
 * Exports an arc to DXF format with proper angle calculations
 */
function exportArc(path: paper.Path, dxf: DxfWriter): void {
  // We can safely assert these properties exist because this function is only
  // called after checking their existence
  const arcData = path.data as ArcData;
  const arcCenter = arcData.center;
  const radius = arcData.radius;
  
  // Get the angles directly from data (they're already in degrees)
  const startAngleDeg = arcData.startAngle;
  let endAngleDeg = arcData.endAngle;
  
  // For fillet arcs, we've already calculated the correct angles in the fillet tool
  // so we can use them directly without recalculating
  
  // Ensure end angle is greater than start angle for DXF
  if (endAngleDeg < startAngleDeg) {
    endAngleDeg += 360;
  }
  
  // Export the arc with the angles from the metadata
  dxf.addArc(point3d(arcCenter.x, arcCenter.y), radius, startAngleDeg, endAngleDeg);
}

/**
 * Helper function to export a Paper.js Bézier spline as a true DXF spline entity
 */
function exportBezierSplineToDXF(path: paper.Path, dxf: DxfWriter): void {
  // Collect control points from Paper.js path segments
  // DXF expects control points in 3D as {x, y, z}
  const controlPoints = path.segments.map(seg => {
    return point3d(seg.point.x, seg.point.y, 0);
  });

  // Optionally, collect fit points if available (for fit-point splines)
  let fitPoints: ReturnType<typeof point3d>[] | undefined = undefined;
  if (Array.isArray(path.data?.fitPoints)) {
    fitPoints = path.data.fitPoints.map((pt: paper.Point) => point3d(pt.x, pt.y, 0));
  }

  // Degree: 3 for cubic Bézier
  const degreeCurve = 3;

  // Spline flags: closed if path.closed
  let flags = 0;
  if (path.closed) {
    flags |= 1; // SplineFlags.Closed
  }

  // Weights and knots are optional; let DXF handle default interpolation
  dxf.addSpline({
    controlPoints,
    fitPoints,
    degreeCurve,
    flags
  });
}

/**
 * Helper function to sample points along a curve and export as line segments
 * Used as a fallback when a path can't be exported as a geometric primitive
 */
function sampleAndExportCurve(path: paper.Path, dxf: DxfWriter): void {
  const samples = 24;  // More samples for smoother approximation
  const pathLength = path.length;
  for (let i = 0; i < samples; i++) {
    const t1 = i / samples;
    const t2 = (i + 1) / samples;
    const p1 = path.getPointAt(pathLength * t1);
    const p2 = path.getPointAt(pathLength * t2);
    if (p1 && p2) {
      dxf.addLine(dxfPoint(p1.x, p1.y), dxfPoint(p2.x, p2.y));
    }
  }
}
