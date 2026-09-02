import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { isSketchPath, nearestSketchPath } from './geometry/pathCuts';
import { buildDxf } from '../exporters/ExportDXF';
import { parseDxf } from '../importers/dxfParser';
import {
  createDimension,
  dimensionLabel,
  formatDimensionValue,
  measureDimension,
  offsetDimension,
} from './dimensions';

describe('dimension formatting', () => {
  it('trims trailing zeros and keeps up to two decimals', () => {
    expect(formatDimensionValue(12)).toBe('12');
    expect(formatDimensionValue(12.5)).toBe('12.5');
    expect(formatDimensionValue(12.25)).toBe('12.25');
    expect(formatDimensionValue(0.1)).toBe('0.1');
    expect(formatDimensionValue(-0)).toBe('0');
    expect(dimensionLabel('diameter', 10)).toBe('⌀10');
    expect(dimensionLabel('radius', 6.5)).toBe('R6.5');
    expect(dimensionLabel('aligned', 8)).toBe('8');
  });
});

describe('dimension measurement', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('measures aligned, projected, radial, and two-point distances', () => {
    const a = new paper.Point(0, 0);
    const b = new paper.Point(30, 40);
    expect(measureDimension('aligned', a, b)).toBeCloseTo(50);
    expect(measureDimension('distance', a, b)).toBeCloseTo(50);
    expect(measureDimension('horizontal', a, b)).toBeCloseTo(30);
    expect(measureDimension('vertical', a, b)).toBeCloseTo(40);
    expect(measureDimension('radius', a, new paper.Point(10, 0))).toBeCloseTo(10);
    expect(measureDimension('diameter', a, new paper.Point(10, 0))).toBeCloseTo(20);
  });

  it('stores the measured value at creation time', () => {
    const group = createDimension({
      kind: 'aligned',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(80, 0),
      textPoint: new paper.Point(40, -15),
      value: measureDimension('aligned', new paper.Point(0, 0), new paper.Point(80, 0)),
    });
    expect(group.data.value).toBe(80);
    expect(group.data.layer).toBe('Dimensions');
  });
});

describe('dimension paper integration', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
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

  it('moves the text offset without changing definition points or value', () => {
    const group = createDimension({
      kind: 'aligned',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(60, 0),
      textPoint: new paper.Point(30, -12),
      value: 60,
    });
    offsetDimension(group, new paper.Point(0, -20));
    expect(group.data.p1.x).toBeCloseTo(0);
    expect(group.data.p2.x).toBeCloseTo(60);
    expect(group.data.textPoint.y).toBeCloseTo(-32);
    expect(group.data.value).toBe(60);
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
