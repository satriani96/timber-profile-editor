import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { isSketchPath, nearestSketchPath } from './geometry/pathCuts';
import { buildDxf } from '../exporters/ExportDXF';
import { parseDxf } from '../importers/dxfParser';
import {
  applyDimensionValue,
  createDimension,
  dimensionLabel,
  driveDistance,
  driveLineLength,
  ensureItemUid,
  formatDimensionValue,
} from './dimensions';

describe('dimension formatting', () => {
  it('trims trailing zeros and keeps up to two decimals', () => {
    expect(formatDimensionValue(12)).toBe('12');
    expect(formatDimensionValue(12.5)).toBe('12.5');
    expect(formatDimensionValue(12.5)).toBe('12.5');
    expect(formatDimensionValue(12.25)).toBe('12.25');
    expect(formatDimensionValue(0.1)).toBe('0.1');
    expect(formatDimensionValue(-0)).toBe('0');
    expect(dimensionLabel('diameter', 10)).toBe('⌀10');
    expect(dimensionLabel('radius', 6.5)).toBe('R6.5');
    expect(dimensionLabel('aligned', 8)).toBe('8');
  });
});

describe('dimension driving math', () => {
  it('keeps the farther endpoint fixed when changing a line length', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    const clickNearStart = { x: 10, y: 0 };
    const driven = driveLineLength(start, end, clickNearStart, 40);
    expect(driven.end).toEqual({ x: 100, y: 0 });
    expect(driven.start.x).toBeCloseTo(60);
    expect(driven.start.y).toBeCloseTo(0);

    const clickNearEnd = { x: 90, y: 0 };
    const driven2 = driveLineLength(start, end, clickNearEnd, 40);
    expect(driven2.start).toEqual({ x: 0, y: 0 });
    expect(driven2.end.x).toBeCloseTo(40);
  });

  it('moves the second point along the direction for a distance drive', () => {
    const moved = driveDistance({ x: 0, y: 0 }, { x: 30, y: 40 }, 100);
    expect(moved.p1).toEqual({ x: 0, y: 0 });
    expect(moved.p2.x).toBeCloseTo(60);
    expect(moved.p2.y).toBeCloseTo(80);
  });
});

describe('dimension paper integration', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('drives a line length while keeping the anchored end fixed', () => {
    const line = new paper.Path.Line({ from: [0, 0], to: [80, 0], strokeColor: 'black' });
    ensureItemUid(line);
    const group = createDimension({
      kind: 'aligned',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(80, 0),
      textPoint: new paper.Point(40, -15),
      value: 80,
      linkedUid: line.data.uid,
      click: new paper.Point(70, 0),
    });
    applyDimensionValue(group, 50);
    expect(line.firstSegment.point.x).toBeCloseTo(0);
    expect(line.lastSegment.point.x).toBeCloseTo(50);
    expect(group.data.value).toBe(50);
  });

  it('drives a circle diameter about its centre', () => {
    const circle = new paper.Path.Circle({ center: [20, 20], radius: 10, strokeColor: 'black' });
    circle.data = { center: new paper.Point(20, 20), radius: 10, isArc: false };
    ensureItemUid(circle);
    const group = createDimension({
      kind: 'diameter',
      p1: new paper.Point(20, 20),
      p2: new paper.Point(30, 20),
      textPoint: new paper.Point(45, 20),
      value: 20,
      linkedUid: circle.data.uid,
    });
    applyDimensionValue(group, 40);
    expect(circle.data.radius).toBeCloseTo(20);
    expect(circle.bounds.width).toBeCloseTo(40);
  });

  it('excludes dimensions from cut targets', () => {
    new paper.Path.Line({ from: [0, 0], to: [100, 0], strokeColor: 'black' });
    const group = createDimension({
      kind: 'aligned',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(100, 0),
      textPoint: new paper.Point(50, -20),
      value: 100,
    });
    expect(isSketchPath(group)).toBe(false);
    expect(isSketchPath(group.children[0])).toBe(false);
    const hit = nearestSketchPath(new paper.Point(50, -20), 30);
    expect(hit?.path.data?.isDimension).toBeFalsy();
  });

  it('exports dimensions as DXF DIMENSION entities on the Dimensions layer', () => {
    new paper.Path.Line({ from: [0, 0], to: [60, 0], strokeColor: 'black' });
    createDimension({
      kind: 'aligned',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(60, 0),
      textPoint: new paper.Point(30, -12),
      value: 60,
    });
    const text = buildDxf();
    expect(text).toContain('DIMENSION');
    expect(text).toMatch(/8\nDimensions/);
    const doc = parseDxf(text);
    expect(doc.unsupported.DIMENSION).toBeGreaterThan(0);
    expect(doc.layers.map((l) => l.name)).toContain('Dimensions');
  });
});
