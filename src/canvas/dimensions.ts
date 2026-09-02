import paper from 'paper';
import { DIMENSIONS_LAYER, ensureLayer, layerColor } from './layers';
import { reflectPoint } from './geometry/itemData';
import { BASE_STROKE_WIDTH } from '../components/sketch/constants';

export type DimensionKind = 'aligned' | 'horizontal' | 'vertical' | 'diameter' | 'radius' | 'distance';

export interface DimensionData {
  isDimension: true;
  layer: string;
  kind: DimensionKind;
  p1: paper.Point;
  p2: paper.Point;
  textPoint: paper.Point;
  value: number;
}

export function formatDimensionValue(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Number(n.toFixed(2));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function dimensionLabel(kind: DimensionKind, value: number): string {
  const n = formatDimensionValue(value);
  if (kind === 'diameter') return `⌀${n}`;
  if (kind === 'radius') return `R${n}`;
  return n;
}

export function classifyLinearKind(a: paper.Point, b: paper.Point, place: paper.Point): 'aligned' | 'horizontal' | 'vertical' {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dy < 1e-6) return 'horizontal';
  if (dx < 1e-6) return 'vertical';
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const beyondX = place.x < minX - 1e-6 || place.x > maxX + 1e-6;
  const beyondY = place.y < minY - 1e-6 || place.y > maxY + 1e-6;
  if (beyondX && beyondY) {
    const ox = place.x < minX ? minX - place.x : place.x - maxX;
    const oy = place.y < minY ? minY - place.y : place.y - maxY;
    return ox > oy ? 'vertical' : 'horizontal';
  }
  if (beyondX) return 'vertical';
  if (beyondY) return 'horizontal';
  return 'aligned';
}

export function measureDimension(kind: DimensionKind, p1: paper.Point, p2: paper.Point): number {
  switch (kind) {
    case 'horizontal':
      return Math.abs(p2.x - p1.x);
    case 'vertical':
      return Math.abs(p2.y - p1.y);
    case 'diameter':
      return p1.getDistance(p2) * 2;
    case 'radius':
      return p1.getDistance(p2);
    default:
      return p1.getDistance(p2);
  }
}

export function isDimensionGroup(item: paper.Item): item is paper.Group {
  return item instanceof paper.Group && Boolean(item.data?.isDimension);
}

export function ancestorDimension(item: paper.Item | null): paper.Group | null {
  let current: paper.Item | null = item;
  while (current) {
    if (isDimensionGroup(current)) return current;
    current = current.parent;
  }
  return null;
}

function toPoint(value: unknown, fallback: paper.Point): paper.Point {
  if (value instanceof paper.Point) return value;
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
    const p = value as { x: number; y: number };
    return new paper.Point(p.x, p.y);
  }
  return fallback;
}

export function readDimensionData(group: paper.Group): DimensionData {
  const d = group.data as DimensionData;
  return {
    ...d,
    p1: toPoint(d.p1, new paper.Point(0, 0)),
    p2: toPoint(d.p2, new paper.Point(0, 0)),
    textPoint: toPoint(d.textPoint, new paper.Point(0, 0)),
  };
}

function dimColor(): paper.Color {
  return new paper.Color(layerColor(DIMENSIONS_LAYER));
}

function dimSizes() {
  const z = paper.view.zoom;
  return {
    stroke: Math.max(0.6, BASE_STROKE_WIDTH * 0.7) / z,
    font: 12 / z,
    arrow: 8 / z,
    gap: 2 / z,
    overshoot: 3.5 / z,
  };
}

function lineStyle(color: paper.Color, stroke: number) {
  return { strokeColor: color, strokeWidth: stroke, strokeCap: 'round' as const, strokeJoin: 'round' as const };
}

function arrowHead(tip: paper.Point, dir: paper.Point, size: number, color: paper.Color): paper.Path {
  const unit = dir.length > 1e-9 ? dir.normalize() : new paper.Point(1, 0);
  const back = tip.subtract(unit.multiply(size));
  const side = new paper.Point(-unit.y, unit.x).multiply(size * 0.38);
  return new paper.Path({
    segments: [tip, back.add(side), back.subtract(side)],
    closed: true,
    fillColor: color,
    strokeColor: color,
    strokeWidth: 0.5 / paper.view.zoom,
    insert: false,
  });
}

function tick(center: paper.Point, dir: paper.Point, size: number, color: paper.Color, stroke: number): paper.Path {
  const unit = dir.length > 1e-9 ? dir.normalize() : new paper.Point(1, 0);
  const perp = new paper.Point(-unit.y, unit.x);
  const a = center.add(unit.add(perp).normalize().multiply(size * 0.55));
  const b = center.subtract(unit.add(perp).normalize().multiply(size * 0.55));
  return new paper.Path.Line({ from: a, to: b, ...lineStyle(color, stroke), insert: false });
}

function readableAngle(degrees: number): number {
  let a = ((degrees % 360) + 360) % 360;
  if (a > 90 && a <= 270) a += 180;
  return a;
}

function addEnds(from: paper.Point, to: paper.Point, size: number, color: paper.Color, stroke: number): paper.Item[] {
  const dir = to.subtract(from);
  if (dir.length < size * 2.4) {
    return [tick(from, dir, size, color, stroke), tick(to, dir, size, color, stroke)];
  }
  return [arrowHead(from, from.subtract(to), size, color), arrowHead(to, to.subtract(from), size, color)];
}

function extension(from: paper.Point, toward: paper.Point, gap: number, overshoot: number, color: paper.Color, stroke: number): paper.Path | null {
  const vec = toward.subtract(from);
  const len = vec.length;
  if (len < gap + 1e-6) return null;
  const unit = vec.normalize();
  return new paper.Path.Line({
    from: from.add(unit.multiply(gap)),
    to: toward.add(unit.multiply(overshoot)),
    ...lineStyle(color, stroke),
    insert: false,
  });
}

function buildLinearParts(data: DimensionData): paper.Item[] {
  const { p1, p2, textPoint, kind } = data;
  const color = dimColor();
  const { stroke, font, arrow, gap, overshoot } = dimSizes();
  const horizontal = kind === 'horizontal';
  const vertical = kind === 'vertical';

  let a1: paper.Point;
  let a2: paper.Point;
  if (horizontal) {
    a1 = new paper.Point(p1.x, textPoint.y);
    a2 = new paper.Point(p2.x, textPoint.y);
  } else if (vertical) {
    a1 = new paper.Point(textPoint.x, p1.y);
    a2 = new paper.Point(textPoint.x, p2.y);
  } else {
    const axis = p2.subtract(p1);
    if (axis.length < 1e-9) return [];
    const n = new paper.Point(-axis.y, axis.x).normalize();
    const offset = textPoint.subtract(p1).dot(n);
    a1 = p1.add(n.multiply(offset));
    a2 = p2.add(n.multiply(offset));
  }

  const items: paper.Item[] = [];
  const e1 = extension(p1, a1, gap, overshoot, color, stroke);
  const e2 = extension(p2, a2, gap, overshoot, color, stroke);
  if (e1) items.push(e1);
  if (e2) items.push(e2);
  items.push(new paper.Path.Line({ from: a1, to: a2, ...lineStyle(color, stroke), insert: false }));
  items.push(...addEnds(a1, a2, arrow, color, stroke));

  const mid = a1.add(a2).divide(2);
  const label = new paper.PointText({
    point: mid,
    content: dimensionLabel(kind, data.value),
    fillColor: color,
    fontSize: font,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    justification: 'center',
    insert: false,
  });
  label.rotate(readableAngle(a2.subtract(a1).angle), mid);
  label.translate(new paper.Point(0, -font * 0.35));
  items.push(label);
  return items;
}

function buildRadialParts(data: DimensionData): paper.Item[] {
  const { p1: center, p2: onCurve, textPoint, kind } = data;
  const color = dimColor();
  const { stroke, font, arrow } = dimSizes();
  const items: paper.Item[] = [];

  if (kind === 'diameter') {
    const dir = onCurve.subtract(center);
    const radius = Math.max(dir.length, 1e-6);
    const unit = dir.normalize();
    const far = center.subtract(unit.multiply(radius));
    const near = center.add(unit.multiply(radius));
    items.push(new paper.Path.Line({ from: far, to: near, ...lineStyle(color, stroke), insert: false }));
    items.push(...addEnds(far, near, arrow, color, stroke));
    if (textPoint.getDistance(near) > arrow) {
      items.push(new paper.Path.Line({ from: near, to: textPoint, ...lineStyle(color, stroke), insert: false }));
    }
  } else {
    items.push(new paper.Path.Line({ from: onCurve, to: textPoint, ...lineStyle(color, stroke), insert: false }));
    items.push(arrowHead(onCurve, onCurve.subtract(textPoint), arrow, color));
  }

  const label = new paper.PointText({
    point: textPoint,
    content: dimensionLabel(kind, data.value),
    fillColor: color,
    fontSize: font,
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    justification: 'left',
    insert: false,
  });
  label.translate(new paper.Point(font * 0.25, font * 0.35));
  items.push(label);
  return items;
}

export function buildDimensionChildren(data: DimensionData): paper.Item[] {
  if (data.kind === 'diameter' || data.kind === 'radius') return buildRadialParts(data);
  return buildLinearParts(data);
}

export function rebuildDimension(group: paper.Group): void {
  const data = readDimensionData(group);
  group.removeChildren();
  for (const child of buildDimensionChildren(data)) {
    child.data = { isDimension: true };
    group.addChild(child);
  }
}

export function createDimension(data: Omit<DimensionData, 'isDimension' | 'layer'> & Partial<Pick<DimensionData, 'layer'>>): paper.Group {
  ensureLayer(DIMENSIONS_LAYER, '#2563eb');
  const full: DimensionData = {
    ...data,
    isDimension: true,
    layer: data.layer ?? DIMENSIONS_LAYER,
    p1: data.p1.clone(),
    p2: data.p2.clone(),
    textPoint: data.textPoint.clone(),
  };
  const group = new paper.Group({ insert: true });
  group.data = full;
  rebuildDimension(group);
  return group;
}

export function offsetDimension(group: paper.Group, delta: paper.Point): void {
  const data = readDimensionData(group);
  data.textPoint = data.textPoint.add(delta);
  group.data = { ...group.data, textPoint: data.textPoint };
  rebuildDimension(group);
}

export function translateDimension(group: paper.Group, delta: paper.Point): void {
  const data = readDimensionData(group);
  data.p1 = data.p1.add(delta);
  data.p2 = data.p2.add(delta);
  data.textPoint = data.textPoint.add(delta);
  group.data = { ...group.data, p1: data.p1, p2: data.p2, textPoint: data.textPoint };
  rebuildDimension(group);
}

export function rotateDimension(group: paper.Group, angleDeg: number, center: paper.Point): void {
  const data = readDimensionData(group);
  const turn = (p: paper.Point) => p.rotate(angleDeg, center);
  data.p1 = turn(data.p1);
  data.p2 = turn(data.p2);
  data.textPoint = turn(data.textPoint);
  if (data.kind === 'horizontal' || data.kind === 'vertical') data.kind = 'aligned';
  group.data = { ...group.data, ...data };
  rebuildDimension(group);
}

export function mirrorDimension(group: paper.Group, axisPoint: paper.Point, axisDirection: paper.Point): void {
  const data = readDimensionData(group);
  data.p1 = reflectPoint(data.p1, axisPoint, axisDirection);
  data.p2 = reflectPoint(data.p2, axisPoint, axisDirection);
  data.textPoint = reflectPoint(data.textPoint, axisPoint, axisDirection);
  if (data.kind === 'horizontal' || data.kind === 'vertical') {
    const dx = Math.abs(data.p2.x - data.p1.x);
    const dy = Math.abs(data.p2.y - data.p1.y);
    if (dy < 1e-6) data.kind = 'horizontal';
    else if (dx < 1e-6) data.kind = 'vertical';
    else data.kind = 'aligned';
  }
  group.data = { ...group.data, ...data };
  rebuildDimension(group);
}

export function rescaleDimension(group: paper.Group): void {
  rebuildDimension(group);
}

export function dimensionOffset(p1: paper.Point, p2: paper.Point, text: paper.Point, kind: DimensionKind): number {
  if (kind === 'horizontal') return text.y - (p1.y + p2.y) / 2;
  if (kind === 'vertical') return text.x - (p1.x + p2.x) / 2;
  const axis = p2.subtract(p1);
  if (axis.length < 1e-9) return 0;
  return text.subtract(p1).dot(new paper.Point(-axis.y, axis.x).normalize());
}
