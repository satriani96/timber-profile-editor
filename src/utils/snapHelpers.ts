import paper from 'paper';
import { MutableRefObject } from 'react';

/**
 * Configuration for snap behavior
 */
export interface SnapConfig {
  snapTolerance: number;
  currentPathRef: MutableRefObject<paper.Path | null>;
  snapIndicatorRef: MutableRefObject<paper.Path.Circle | null>;
  enableEndpointSnap?: boolean;
  enableMidpointSnap?: boolean;
  enableIntersectionSnap?: boolean;
}

/**
 * Get the closest snap point based on the current mouse position
 * 
 * @param point Current mouse position
 * @param config Snap configuration 
 * @param pathToIgnore Optional path to exclude from snap calculations (e.g. when dragging a segment)
 * @returns The snap point if found, otherwise null
 */
export const getSnapPoint = (
  point: paper.Point, 
  config: SnapConfig,
  pathToIgnore: paper.Path | null = null
): paper.Point | null => {
  const { 
    snapTolerance, 
    currentPathRef, 
    snapIndicatorRef,
    enableEndpointSnap = true,
    enableMidpointSnap = true,
    enableIntersectionSnap = false
  } = config;

  let snapPoint: paper.Point | null = null;
  let minDistance = Infinity;
  
  // Find valid paths to potentially snap to
  const paths = paper.project.activeLayer.children.filter(c =>
    c instanceof paper.Path &&
    c.visible &&
    !c.closed &&
    c.length > 0 &&
    c !== currentPathRef.current &&
    c !== snapIndicatorRef.current &&
    c !== pathToIgnore
  ) as paper.Path[];

  for (const path of paths) {
    // 1. Snap to endpoints (first and last segment of a path)
    if (enableEndpointSnap) {
      if (path.firstSegment) {
        const dist = point.getDistance(path.firstSegment.point);
        if (dist < snapTolerance && dist < minDistance) {
          minDistance = dist;
          snapPoint = path.firstSegment.point;
        }
      }
      
      if (path.lastSegment && path.lastSegment !== path.firstSegment) {
        const dist = point.getDistance(path.lastSegment.point);
        if (dist < snapTolerance && dist < minDistance) {
          minDistance = dist;
          snapPoint = path.lastSegment.point;
        }
      }
    }

    // 2. Snap to midpoints of simple lines (which have exactly 2 segments)
    if (enableMidpointSnap && path.segments.length === 2) {
      const midPoint = path.firstSegment.point.add(path.lastSegment.point).divide(2);
      const distance = point.getDistance(midPoint);
      if (distance < snapTolerance && distance < minDistance) {
        minDistance = distance;
        snapPoint = midPoint;
      }
    }

    // 3. Snap to intersections with other paths 
    // Only enabled if specifically requested, as it can be unstable
    if (enableIntersectionSnap && currentPathRef.current && currentPathRef.current.segments.length > 1) {
      const intersections = currentPathRef.current.getIntersections(path);
      // Only snap to single, clean intersection points. Ignore overlaps which can return multiple points.
      if (intersections.length === 1) {
        const intersection = intersections[0];
        const distance = point.getDistance(intersection.point);
        if (distance < snapTolerance && distance < minDistance) {
          minDistance = distance;
          snapPoint = intersection.point;
        }
      }
    }
  }

  // Update the visual snap indicator
  updateSnapIndicator(snapPoint, snapIndicatorRef, snapTolerance);
  
  return snapPoint;
};

/**
 * Updates the visual snap indicator circle
 */
export const updateSnapIndicator = (
  snapPoint: paper.Point | null, 
  snapIndicatorRef: MutableRefObject<paper.Path.Circle | null>,
  snapTolerance: number
): void => {
  if (snapPoint) {
    if (!snapIndicatorRef.current) {
      snapIndicatorRef.current = new paper.Path.Circle({ 
        center: snapPoint, 
        radius: snapTolerance, 
        fillColor: 'red', 
        opacity: 0.7, 
        data: { isTemporary: true } 
      });
    }
    snapIndicatorRef.current.position = snapPoint;
    snapIndicatorRef.current.visible = true;
  } else if (snapIndicatorRef.current) {
    snapIndicatorRef.current.visible = false;
  }
};
