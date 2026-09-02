import { useCallback, useState } from 'react';
import paper from 'paper';
import { BASE_STROKE_WIDTH } from './constants';
import { rescaleDimension } from '../../canvas/dimensions';

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 400;
const FIT_PADDING_PX = 48;

/** Zoom state plus the helpers that keep on-screen line weights constant while zooming. */
export function useViewport(paperReady: boolean) {
  const [zoom, setZoom] = useState(1);

  const updateAllStrokeWidths = useCallback(() => {
    if (!paperReady) return;
    const z = paper.view.zoom;
    paper.project.activeLayer.children.forEach((item) => {
      if (item.data?.isDimension && item instanceof paper.Group) {
        rescaleDimension(item);
        return;
      }
      if (item.data?.isMeasurement && item instanceof paper.Group) {
        item.children.forEach((child) => {
          if (child instanceof paper.PointText) child.fontSize = 14 / z;
          else if (child instanceof paper.Path.Circle) child.strokeWidth = 1.5 / z;
          else if (child instanceof paper.Path) child.strokeWidth = BASE_STROKE_WIDTH / z;
        });
        return;
      }
      if (item instanceof paper.Path && !item.data?.isTemporary && item.visible) {
        item.strokeWidth = BASE_STROKE_WIDTH / z;
      }
    });
  }, [paperReady]);

  const applyZoom = useCallback(
    (newZoom: number, anchorView?: paper.Point) => {
      const view = paper.view;
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
      if (anchorView) {
        const before = view.viewToProject(anchorView);
        view.zoom = clamped;
        const after = view.viewToProject(anchorView);
        view.center = view.center.add(before.subtract(after));
      } else {
        view.zoom = clamped;
      }
      setZoom(clamped);
      updateAllStrokeWidths();
    },
    [updateAllStrokeWidths]
  );

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      applyZoom(paper.view.zoom * factor, new paper.Point(event.offsetX, event.offsetY));
    },
    [applyZoom]
  );

  /** Zoom extents: fit the given bounds (default: everything visible) into the view. */
  const zoomToFit = useCallback(
    (bounds?: paper.Rectangle) => {
      const view = paper.view;
      let target = bounds;
      if (!target) {
        for (const item of paper.project.activeLayer.children) {
          if (!item.visible || item.data?.isTemporary) continue;
          target = target ? target.unite(item.bounds) : item.bounds.clone();
        }
      }
      if (!target || (target.width === 0 && target.height === 0)) return;
      const availableWidth = Math.max(1, view.viewSize.width - FIT_PADDING_PX * 2);
      const availableHeight = Math.max(1, view.viewSize.height - FIT_PADDING_PX * 2);
      const scale = Math.min(
        target.width > 0 ? availableWidth / target.width : Infinity,
        target.height > 0 ? availableHeight / target.height : Infinity
      );
      applyZoom(Number.isFinite(scale) ? scale : view.zoom);
      view.center = target.center;
    },
    [applyZoom]
  );

  return { zoom, setZoom, updateAllStrokeWidths, applyZoom, handleWheel, zoomToFit };
}

export type Viewport = ReturnType<typeof useViewport>;
