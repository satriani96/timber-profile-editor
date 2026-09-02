import paper from 'paper';
import { isDimensionGroup, mirrorDimension, rotateDimension, translateDimension } from '../dimensions';
import { mirrorPath, movePath, rotatePath } from '../geometry/itemData';
import { isSelectableItem } from './marquee';

export function collectSelectedTransformItems(): paper.Item[] {
  return paper.project.selectedItems.filter((item) => isSelectableItem(item) && !item.data?.isTemporary);
}

export function applyTranslateSelection(items: paper.Item[], delta: paper.Point): void {
  for (const item of items) {
    if (isDimensionGroup(item)) translateDimension(item, delta);
    else if (item instanceof paper.Path) movePath(item, delta);
    else item.translate(delta);
  }
}

/** `angleDeg` is Paper.js rotation (clockwise on screen / Y-down). */
export function applyRotateSelection(items: paper.Item[], angleDeg: number, center: paper.Point): void {
  for (const item of items) {
    if (isDimensionGroup(item)) rotateDimension(item, angleDeg, center);
    else if (item instanceof paper.Path) rotatePath(item, angleDeg, center);
    else item.rotate(angleDeg, center);
  }
}

export function applyMirrorSelection(items: paper.Item[], axisPoint: paper.Point, axisDirection: paper.Point): void {
  for (const item of items) {
    if (isDimensionGroup(item)) mirrorDimension(item, axisPoint, axisDirection);
    else if (item instanceof paper.Path) mirrorPath(item, axisPoint, axisDirection);
  }
}

export function mirrorCopyItems(items: paper.Item[], axisPoint: paper.Point, axisDirection: paper.Point): paper.Item[] {
  const copies = items.map((item) => {
    const clone = item.clone();
    clone.data = { ...(item.data as Record<string, unknown>) };
    delete clone.data.isTemporary;
    delete clone.data.uid;
    clone.selected = false;
    clone.locked = false;
    clone.opacity = 1;
    clone.visible = true;
    return clone;
  });
  applyMirrorSelection(copies, axisPoint, axisDirection);
  return copies;
}

export function itemsBoundsCenter(items: paper.Item[]): paper.Point {
  let bounds = items[0].bounds.clone();
  for (const item of items.slice(1)) bounds = bounds.unite(item.bounds);
  return bounds.center;
}

export function clonePreview(items: paper.Item[]): paper.Item[] {
  return items.map((item) => {
    const clone = item.clone();
    clone.data = { ...(item.data as Record<string, unknown>), isTemporary: true };
    clone.selected = false;
    clone.locked = true;
    clone.opacity = 0.55;
    clone.visible = true;
    return clone;
  });
}

export function removePreview(clones: paper.Item[]): void {
  for (const clone of clones) clone.remove();
}

export function hideOriginals(items: paper.Item[], hidden: boolean): void {
  for (const item of items) item.visible = !hidden;
}

/** CAD CCW-from-+X angle of a Paper.js delta (Y-down). */
export function cadAngleFromDelta(delta: paper.Point): number {
  return -Math.atan2(delta.y, delta.x) * (180 / Math.PI);
}

export function paperAngleFromCad(cadDeg: number): number {
  return -cadDeg;
}

export function snapCadAngle(cadDeg: number, increment = 15): number {
  return Math.round(cadDeg / increment) * increment;
}

export function normalizeDeg180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
