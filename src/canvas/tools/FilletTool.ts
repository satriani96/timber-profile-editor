import paper from 'paper';
import React from 'react';
import { PaperRoundCorners } from 'paperjs-round-corners';

// Defines the state contract between the tool and the React component.
interface StateManager {
  path1Ref: React.RefObject<paper.Path | null>;
  path2Ref: React.RefObject<paper.Path | null>;
  cornerPointRef: React.RefObject<paper.Point | null>;
  lastFilletRadiusRef: React.RefObject<number>;
  setIsNumericInputActive: (visible: boolean) => void;
  setNumericInputPosition: (position: { x: number; y: number }) => void;
  finishCurrentFilletOperation: () => void;
  isSpacebarPan: boolean;
}

export function createFilletTool(stateManager: StateManager) {
  const {
    path1Ref,
    path2Ref,
    cornerPointRef,
    lastFilletRadiusRef,
    setIsNumericInputActive,
    setNumericInputPosition,
    finishCurrentFilletOperation,
    isSpacebarPan,
  } = stateManager;

  const applyFillet = (radiusValue: number) => {
    const path1 = path1Ref.current;
    const path2 = path2Ref.current;
    const cornerPoint = cornerPointRef.current;

    if (!path1 || !cornerPoint || radiusValue <= 0) {
      return;
    }

    const isClosedShape = path2 === null;

    if (isClosedShape && path1.closed) {
      const cornerSegment = path1.segments.find(seg => seg.point.equals(cornerPoint));
      if (!cornerSegment) return;

      const newPath = path1.clone() as paper.Path;
      const segmentToRound = newPath.segments[cornerSegment.index];
      const success = PaperRoundCorners.round(segmentToRound, radiusValue);

      if (success) {
        // For closed shapes, we'll take a different approach
        // Instead of trying to calculate arc parameters from the bezier curves,
        // we'll use the original corner point and the radius to define the arc
        
        // Get the segments adjacent to the corner
        const prevIndex = (cornerSegment.index - 1 + path1.segments.length) % path1.segments.length;
        const nextIndex = (cornerSegment.index + 1) % path1.segments.length;
        
        const prevPoint = path1.segments[prevIndex].point;
        const nextPoint = path1.segments[nextIndex].point;
        
        // Calculate vectors from corner to adjacent points
        const vec1 = prevPoint.subtract(cornerPoint).normalize();
        const vec2 = nextPoint.subtract(cornerPoint).normalize();
        
        // Calculate the angle between the vectors
        const angle = Math.acos(vec1.dot(vec2));
        
        // Calculate the tangent distance
        const tanDist = radiusValue / Math.tan(angle / 2);
        
        // Calculate tangent points
        const tangentPoint1 = cornerPoint.add(vec1.multiply(tanDist));
        const tangentPoint2 = cornerPoint.add(vec2.multiply(tanDist));
        
        // Calculate the midpoint vector
        const midVector = vec1.add(vec2).normalize();
        
        // Calculate the center distance and center point
        const centerDist = radiusValue / Math.sin(angle / 2);
        const arcCenter = cornerPoint.add(midVector.multiply(centerDist));
        
        // Calculate angles for DXF export
        const startAngle = Math.atan2(tangentPoint1.y - arcCenter.y, tangentPoint1.x - arcCenter.x) * 180 / Math.PI;
        const endAngle = Math.atan2(tangentPoint2.y - arcCenter.y, tangentPoint2.x - arcCenter.x) * 180 / Math.PI;
        
        // Normalize angles to 0-360 range
        let normalizedStartAngle = (startAngle + 360) % 360;
        let normalizedEndAngle = (endAngle + 360) % 360;
        
        // Calculate sweep angle
        let sweepAngle = normalizedEndAngle - normalizedStartAngle;
        if (sweepAngle < 0) sweepAngle += 360;
        
        // For closed shapes, we want the smaller arc (less than 180 degrees)
        if (sweepAngle > 180) {
          sweepAngle = 360 - sweepAngle;
          const temp = normalizedStartAngle;
          normalizedStartAngle = normalizedEndAngle;
          normalizedEndAngle = temp;
        }
        
        // Add metadata to the path for DXF export
        if (!newPath.data) newPath.data = {};
        if (!newPath.data.fillets) newPath.data.fillets = [];
        
        // Add this fillet to the fillets array
        newPath.data.fillets.push({
          cornerIndex: cornerSegment.index,
          isArc: true,
          center: arcCenter,
          radius: radiusValue,
          startAngle: normalizedStartAngle,
          endAngle: normalizedEndAngle,
          sweepAngle: sweepAngle,
          tangentPoint1: tangentPoint1,
          tangentPoint2: tangentPoint2
        });
        
        path1.remove();
        path1Ref.current = newPath;
        if(lastFilletRadiusRef) lastFilletRadiusRef.current = radiusValue;
      } else {
        newPath.remove();
        alert('Failed to apply fillet. Radius may be too large.');
      }
    } else if (!isClosedShape && path2) {
      const line1 = path1;
      const line2 = path2;

      const seg1 = line1.firstSegment.point.equals(cornerPoint) ? line1.firstSegment : line1.lastSegment;
      const seg2 = line2.firstSegment.point.equals(cornerPoint) ? line2.firstSegment : line2.lastSegment;

      const vec1 = (seg1 === line1.firstSegment ? line1.lastSegment.point : line1.firstSegment.point).subtract(cornerPoint).normalize();
      const vec2 = (seg2 === line2.firstSegment ? line2.lastSegment.point : line2.firstSegment.point).subtract(cornerPoint).normalize();

      const angle = Math.acos(vec1.dot(vec2));
      if (Math.abs(angle) < 0.01 || Math.abs(angle - Math.PI) < 0.01) return;
      
      const tanDist = radiusValue / Math.tan(angle / 2);

      // Check if the radius is too large for the segments.
      if (tanDist > seg1.curve.length || tanDist > seg2.curve.length) {
        alert('Radius is too large for one or both segments.');
        return;
      }

      const tangentPoint1 = cornerPoint.add(vec1.multiply(tanDist));
      const tangentPoint2 = cornerPoint.add(vec2.multiply(tanDist));

      const midVector = vec1.add(vec2).normalize();
      const centerDist = radiusValue / Math.sin(angle / 2);
      const arcCenter = cornerPoint.add(midVector.multiply(centerDist));

      // Calculate the midpoint for the 'through' point
      const throughPoint = arcCenter.add(cornerPoint.subtract(arcCenter).normalize().multiply(radiusValue));
      
      // Create the arc
      const arc = new paper.Path.Arc({
        from: tangentPoint1,
        through: throughPoint,
        to: tangentPoint2,
        strokeColor: line1.strokeColor,
        strokeWidth: line1.strokeWidth,
      });
      
      // Calculate angles for DXF export
      const startAngle = Math.atan2(tangentPoint1.y - arcCenter.y, tangentPoint1.x - arcCenter.x) * 180 / Math.PI;
      const endAngle = Math.atan2(tangentPoint2.y - arcCenter.y, tangentPoint2.x - arcCenter.x) * 180 / Math.PI;
      
      // Normalize angles to 0-360 range
      let normalizedStartAngle = (startAngle + 360) % 360;
      let normalizedEndAngle = (endAngle + 360) % 360;
      
      // Calculate sweep angle - we want the smaller of the two possible arcs
      let sweepAngle = normalizedEndAngle - normalizedStartAngle;
      if (sweepAngle < 0) sweepAngle += 360;
      
      // For line-to-line fillets, we want the smaller arc (less than 180 degrees)
      // This is the opposite of what we want for closed shapes
      if (sweepAngle > 180) {
        // If the sweep angle is greater than 180, we want the other arc
        sweepAngle = 360 - sweepAngle;
        // Swap start and end angles
        const temp = normalizedStartAngle;
        normalizedStartAngle = normalizedEndAngle;
        normalizedEndAngle = temp;
      }
      
      // Add metadata to the arc for DXF export
      arc.data = {
        isArc: true,
        center: arcCenter,
        radius: radiusValue,
        startAngle: normalizedStartAngle,
        endAngle: normalizedEndAngle,
        sweepAngle: sweepAngle
      };

      // Trim the original lines to meet the new arc.
      seg1.point = tangentPoint1;
      seg2.point = tangentPoint2;

      if(lastFilletRadiusRef) lastFilletRadiusRef.current = radiusValue;
    } else {
      alert('Unsupported fillet case.');
    }
    
    (paper.view as any).draw();
    finishCurrentFilletOperation();
  };

  return {
    onActivate: () => {
      document.body.style.cursor = 'crosshair';
    },

    onDeactivate: () => {
      document.body.style.cursor = 'default';
      finishCurrentFilletOperation();
    },

    onMouseDown: (event: paper.ToolEvent) => {
      if (isSpacebarPan) return;

      const hitResult = paper.project.hitTest(event.point, { segments: true, tolerance: 10 });
      if (!hitResult || !hitResult.segment || !(hitResult.item instanceof paper.Path)) {
        return;
      }

      const clickedPath = hitResult.item;
      const cornerPoint = hitResult.segment.point;
      cornerPointRef.current = cornerPoint;

      // Find other paths that share the clicked corner point.
      const otherPaths = paper.project.getItems({
        class: paper.Path,
        match: (path: paper.Path) =>
          path !== clickedPath && path.segments.some(s => s.point.equals(cornerPoint))
      });

      if (clickedPath.closed) {
        // Case 1: A single closed shape.
        path1Ref.current = clickedPath;
        path2Ref.current = null;
      } else if (otherPaths.length > 0) {
        // Case 2: An open path with at least one other path at the corner.
        path1Ref.current = clickedPath;
        path2Ref.current = otherPaths[0] as paper.Path;
      } else {
        // Not a valid corner for filleting (e.g., an endpoint of a single line).
        return;
      }

      const viewPosition = paper.view.projectToView(cornerPoint);
      setNumericInputPosition(viewPosition);
      setIsNumericInputActive(true);
    },

    onKeyDown: (event: paper.KeyEvent) => {
      if (event.key === 'escape') {
        finishCurrentFilletOperation();
      }
    },

    applyFillet,
  };
}
