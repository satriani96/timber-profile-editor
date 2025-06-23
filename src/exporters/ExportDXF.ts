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

interface PathData {
  isTemporary?: boolean;
  center?: paper.Point;
  radius?: number;
  isArc?: boolean;
  startAngle?: number;
  endAngle?: number;
  sweepAngle?: number;
}

/**
 * Exports the current Paper.js canvas content to DXF format
 * and triggers a download of the resulting file
 */
export const exportToDXF = () => {
  // Create a new DXF writer
  const dxf = new DxfWriter();
  
  let arcCount = 0;
  let lineCount = 0;
  
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
        // For closed shapes with fillets, we need to handle them differently
        // First, identify which segments are part of fillets
        const filletCorners = new Set(item.data.fillets.map((fillet: any) => fillet.cornerIndex));
        
        // Create a map of tangent points for each segment
        const tangentPoints = new Map<number, { prev: paper.Point, next: paper.Point }>();
        
        // Collect all tangent points
        item.data.fillets.forEach((fillet: any) => {
          // Store the tangent points by the corner index
          tangentPoints.set(fillet.cornerIndex, {
            prev: fillet.tangentPoint1,
            next: fillet.tangentPoint2
          });
        });
        
        // Take a completely different approach for closed shapes with fillets
        // We'll create a new array of points that includes both segment points and tangent points
        let exportPoints: paper.Point[] = [];
        for (let i = 0; i < item.segments.length; i++) {
          if (filletCorners.has(i) && tangentPoints.has(i)) {
            const t1 = tangentPoints.get(i)!.prev;
            const t2 = tangentPoints.get(i)!.next;
            exportPoints.push(t1);
            exportPoints.push(t2);
            console.log(`[DXF DEBUG] Fillet corner ${i}: tangentPoint1=(${t1.x.toFixed(3)},${t1.y.toFixed(3)}), tangentPoint2=(${t2.x.toFixed(3)},${t2.y.toFixed(3)})`);
          } else {
            const currentPoint = item.segments[i].point;
            exportPoints.push(currentPoint);
            console.log(`[DXF DEBUG] Non-filleted corner ${i}: point=(${currentPoint.x.toFixed(3)},${currentPoint.y.toFixed(3)})`);
          }
        }
        // Remove consecutive duplicate points
        exportPoints = exportPoints.filter((pt, idx, arr) => idx === 0 || !pt.equals(arr[idx - 1]));
        // Remove any non-consecutive duplicates (keep only the first occurrence of each point)
        exportPoints = exportPoints.filter((pt, idx, arr) => arr.findIndex(p => p.equals(pt)) === idx);
        if (exportPoints.length > 1 && exportPoints[0].equals(exportPoints[exportPoints.length - 1])) {
          exportPoints.pop();
        }
        // Log the final exportPoints order (after all filtering)
        console.log('[DXF DEBUG] Export point order (filtered):');
        exportPoints.forEach((pt, idx) => {
          console.log(`  [${idx}] (${pt.x.toFixed(3)},${pt.y.toFixed(3)})`);
        });
        
        // Now export lines between consecutive points, but skip lines that connect tangent points
        // These will be replaced by arcs
        for (let i = 0; i < exportPoints.length; i++) {
          const p1 = exportPoints[i];
          const p2 = exportPoints[(i + 1) % exportPoints.length];
          let skipLine = false;
          let filletIdx = null;
          for (const fillet of item.data.fillets) {
            const tangentPair = tangentPoints.get(fillet.cornerIndex);
            if (tangentPair) {
              if ((p1.equals(tangentPair.prev) && p2.equals(tangentPair.next)) ||
                  (p1.equals(tangentPair.next) && p2.equals(tangentPair.prev))) {
                skipLine = true;
                filletIdx = fillet.cornerIndex;
                break;
              }
            }
          }
          if (!skipLine) {
            dxf.addLine(dxfPoint(p1.x, p1.y), dxfPoint(p2.x, p2.y));
            lineCount++;
            console.log(`[DXF DEBUG] Line: (${p1.x.toFixed(3)},${p1.y.toFixed(3)}) -> (${p2.x.toFixed(3)},${p2.y.toFixed(3)})`);
          } else {
            console.log(`[DXF DEBUG] Skipped line between tangent points of fillet corner ${filletIdx}: (${p1.x.toFixed(3)},${p1.y.toFixed(3)}) <-> (${p2.x.toFixed(3)},${p2.y.toFixed(3)})`);
          }
        }
        
        // Now add each fillet arc
        item.data.fillets.forEach((fillet: any, filletIdx: number) => {
          let startAngle = fillet.startAngle;
          let endAngle = fillet.endAngle;
          if (endAngle < startAngle) {
            endAngle += 360;
          }
          dxf.addArc(
            dxfPoint(fillet.center.x, fillet.center.y),
            fillet.radius,
            startAngle,
            endAngle
          );
          arcCount++;
          console.log(`[DXF DEBUG] Arc (fillet ${filletIdx}): center=(${fillet.center.x.toFixed(3)},${fillet.center.y.toFixed(3)}), radius=${fillet.radius}, startAngle=${startAngle}, endAngle=${endAngle}`);
        });
        
        processed = true;
      }
      // Check for circle data first
      else if (item.data?.center && item.data.radius !== undefined && !item.data.isArc) {
        // It's a circle - export as DXF circle entity
        try {
          const circleCenter = item.data.center;
          const radius = item.data.radius;
          dxf.addCircle(dxfPoint(circleCenter.x, circleCenter.y), radius);
          arcCount++; // We'll count circles as arcs for the summary
        } catch (e) {
          console.error('Error creating circle entity:', e);
          // Fallback to polyline approximation
          sampleAndExportCurve(item, dxf);
        }
      }
      // Check for rectangle/square data
      else if (item.segments && item.segments.length === 4 && isRectangle(item)) {
        // It's a rectangle - export as polyline with 5 points (closing the shape)
        try {
          // Create vertices for LWPolyline - using point2d as LWPolyline is always in 2D space
          const vertices = item.segments.map(segment => ({
            point: point2d(segment.point.x, segment.point.y) // Using original point2d for polylines
          }));
          
          // No need to add closing point - the Closed flag handles that
          dxf.addLWPolyline(vertices, { flags: LWPolylineFlags.Closed }); // Closed polyline
          lineCount++;
        } catch (e) {
          console.error('Error creating rectangle entity:', e);
          // Fallback to individual lines
          for (let i = 0; i < 4; i++) {
            const startPoint = item.segments[i].point;
            const endPoint = item.segments[(i + 1) % 4].point;
            dxf.addLine(dxfPoint(startPoint.x, startPoint.y), dxfPoint(endPoint.x, endPoint.y));
            lineCount++;
          }
        }
      }
      // CRITICAL: Check for arc data before assuming it's a straight line
      else if (item.data?.isArc && item.data.center) {
        // Check if we have the complete arc metadata we need
        if (item.data.startAngle !== undefined && item.data.endAngle !== undefined && item.data.radius) {
          try {
            // Export the arc with properly calculated angles
            exportArc(item, dxf);
            arcCount++;
            processed = true;
          } catch (e) {
            console.error('Error creating arc entity:', e);
            // Fallback to polyline approximation
            sampleAndExportCurve(item, dxf);
            processed = true;
          }
        } else {
          // Fall back to polyline approximation if we're missing data
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
        lineCount++;
        processed = true;
      } 
      // Handle curves and other complex paths that weren't processed by previous conditions
      else if (!processed && item.segments.length > 1 && item.curves && item.curves.length > 0) {
        // Check if this path is a Bézier spline (has non-zero handles)
        const hasBezierHandles = item.segments.some(seg =>
          (seg.handleIn && seg.handleIn.length > 0) || (seg.handleOut && seg.handleOut.length > 0)
        );
        if (hasBezierHandles) {
          try {
            exportBezierSplineToDXF(item, dxf);
            processed = true;
          } catch (e) {
            console.error('Error exporting Bézier spline as DXF Spline:', e);
            // Fallback to polyline approximation
            sampleAndExportCurve(item, dxf);
            processed = true;
          }
        } else {
          // Fallback to sampled polyline for non-spline curves
          sampleAndExportCurve(item, dxf);
          processed = true;
        }
      }
    }
  });

  // Display a simple summary of what was exported
  console.log(`DXF Export complete: ${lineCount} lines, ${arcCount} arcs`);
  
  // Export the DXF document to a string
  const dxfString = dxf.stringify();
  
  // Create a download link
  const blob = new Blob([dxfString], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'timber-profile.dxf';
  document.body.appendChild(a);
  a.click();
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
  let startAngleDeg = arcData.startAngle;
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
