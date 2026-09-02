import paper from 'paper';
import { ancestorDimension } from '../dimensions';
import { isSketchPath, nearestSketchPath } from '../geometry/pathCuts';
import { BASE_STROKE_WIDTH } from '../../components/sketch/constants';

export type MarqueeMode = 'window' | 'crossing';

const CLICK_PX = 3;

export function marqueeMode(from: paper.Point, to: paper.Point): MarqueeMode {
  return to.x >= from.x ? 'window' : 'crossing';
}

export function isClickNotDrag(from: paper.Point, to: paper.Point, zoom = paper.view.zoom): boolean {
  return from.getDistance(to) * zoom < CLICK_PX;
}

/** Sketch paths and dimension groups that can be selected; never rasters or previews. */
export function isSelectableItem(item: paper.Item): boolean {
  if (!item.visible || item instanceof paper.Raster) return false;
  if (item.data?.isTemporary || item.data?.isMeasurement) return false;
  if (item instanceof paper.Group && item.data?.isDimension) return true;
  return isSketchPath(item);
}

/** Hit a sketch path or dimension group under `point`, or null. */
export function hitSelectable(point: paper.Point, zoom = paper.view.zoom): paper.Item | null {
  const tolerance = 8 / zoom;
  const dimHit = paper.project.hitTest(point, { fill: true, stroke: true, bounds: true, tolerance });
  const dimension = dimHit ? ancestorDimension(dimHit.item) : null;
  if (dimension && isSelectableItem(dimension)) return dimension;
  const stroke = nearestSketchPath(point, tolerance);
  if (stroke && isSelectableItem(stroke.path)) return stroke.path;
  return null;
}

export function collectSelectable(project: paper.Project = paper.project): paper.Item[] {
  return project.activeLayer.children.filter(isSelectableItem);
}

export function itemMatchesMarquee(item: paper.Item, rect: paper.Rectangle, mode: MarqueeMode): boolean {
  const bounds = item.bounds;
  if (mode === 'window') return rect.contains(bounds);
  return rect.intersects(bounds) || rect.contains(bounds);
}

export function applyMarqueeSelection(rect: paper.Rectangle, mode: MarqueeMode, additive: boolean): paper.Item[] {
  const hits = collectSelectable().filter((item) => itemMatchesMarquee(item, rect, mode));
  if (!additive) paper.project.deselectAll();
  for (const item of hits) {
    item.selected = true;
    if (item instanceof paper.Path && item.data?.isSpline) item.fullySelected = true;
  }
  return hits;
}

export function createMarqueePreview(from: paper.Point, to: paper.Point): paper.Path {
  const mode = marqueeMode(from, to);
  const zoom = paper.view.zoom;
  const stroke = Math.max(0.6, BASE_STROKE_WIDTH * 0.5) / zoom;
  const rect = new paper.Path.Rectangle({
    rectangle: new paper.Rectangle(from, to),
    strokeColor: new paper.Color('#2563eb'),
    strokeWidth: stroke,
    fillColor: new paper.Color(0.15, 0.4, 0.9, 0.08),
    dashArray: mode === 'crossing' ? [6 / zoom, 3.5 / zoom] : [],
  });
  rect.data = { isTemporary: true, isMarquee: true };
  return rect;
}
