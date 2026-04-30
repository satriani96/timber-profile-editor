import paper from 'paper';
import type { MutableRefObject } from 'react';

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

function collectCandidatePaths(
  pathToIgnore: paper.Path | null,
  config: SnapConfig
): paper.Path[] {
  const { currentPathRef, snapIndicatorRef } = config;
  return paper.project.activeLayer.children.filter(
    (c) =>
      c instanceof paper.Path &&
      c.visible &&
      c.length > 0 &&
      c !== currentPathRef.current &&
      c !== snapIndicatorRef.current &&
      c !== pathToIgnore
  ) as paper.Path[];
}

/**
 * Get the closest snap point based on the current mouse position
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
    enableIntersectionSnap = false,
  } = config;

  let snapPoint: paper.Point | null = null;
  let minDistance = Infinity;

  const paths = collectCandidatePaths(pathToIgnore, config);

  for (const path of paths) {
    if (enableEndpointSnap) {
      if (path.closed) {
        for (const seg of path.segments) {
          const dist = point.getDistance(seg.point);
          if (dist < snapTolerance && dist < minDistance) {
            minDistance = dist;
            snapPoint = seg.point;
          }
        }
      } else {
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
    }

    if (enableMidpointSnap && path.segments.length === 2) {
      const midPoint = path.firstSegment.point.add(path.lastSegment.point).divide(2);
      const distance = point.getDistance(midPoint);
      if (distance < snapTolerance && distance < minDistance) {
        minDistance = distance;
        snapPoint = midPoint;
      }
    }

    if (enableMidpointSnap && path.closed && path.segments.length > 2) {
      for (let i = 0; i < path.segments.length; i++) {
        const a = path.segments[i].point;
        const b = path.segments[(i + 1) % path.segments.length].point;
        const midPoint = a.add(b).divide(2);
        const distance = point.getDistance(midPoint);
        if (distance < snapTolerance && distance < minDistance) {
          minDistance = distance;
          snapPoint = midPoint;
        }
      }
    }

    if (enableIntersectionSnap && currentPathRef.current && currentPathRef.current.segments.length > 1) {
      const intersections = currentPathRef.current.getIntersections(path);
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

  updateSnapIndicator(snapPoint, snapIndicatorRef, snapTolerance);

  return snapPoint;
};

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
        data: { isTemporary: true },
      });
    }
    snapIndicatorRef.current.position = snapPoint;
    snapIndicatorRef.current.visible = true;
  } else if (snapIndicatorRef.current) {
    snapIndicatorRef.current.visible = false;
  }
};
