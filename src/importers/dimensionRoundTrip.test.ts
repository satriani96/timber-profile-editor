import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { buildDxf } from '../exporters/ExportDXF';
import { importDxfText } from './ImportDXF';
import { createDimension, dimensionLineEnds, isDimensionGroup, readDimensionData, type DimensionKind } from '../canvas/dimensions';
import { DIMENSIONS_LAYER, resetLayers } from '../canvas/layers';

const P = (x: number, y: number) => new paper.Point(x, y);

function dimensions() {
  return paper.project.activeLayer.children.filter(isDimensionGroup).map(readDimensionData);
}

function clearSketch() {
  for (const item of [...paper.project.activeLayer.children]) item.remove();
}

function expectPoint(actual: paper.Point, expected: paper.Point) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

function dxf(lines: (string | number)[]): string {
  return lines.join('\n') + '\n';
}

/** A DIMENSION record wrapped in a minimal ENTITIES section. */
function dimensionFile(groups: (string | number)[]): string {
  return dxf(['0', 'SECTION', '2', 'ENTITIES', '0', 'DIMENSION', '8', 'DIM', ...groups, '0', 'ENDSEC', '0', 'EOF']);
}

describe('dimension DXF round trip', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
    resetLayers();
  });

  const linear: { kind: DimensionKind; p1: paper.Point; p2: paper.Point; textPoint: paper.Point }[] = [
    // Uneven points, so a dimension line measured from p1 instead of the midpoint would show.
    { kind: 'horizontal', p1: P(0, 0), p2: P(30, -5), textPoint: P(15, -20) },
    { kind: 'vertical', p1: P(0, 0), p2: P(5, -40), textPoint: P(-15, -20) },
    { kind: 'aligned', p1: P(0, 0), p2: P(30, -40), textPoint: P(-10, -30) },
  ];

  for (const original of linear) {
    it(`keeps a ${original.kind} dimension's points and dimension line`, () => {
      createDimension({ ...original, value: 0 });
      const text = buildDxf();
      clearSketch();
      importDxfText(text, 1);

      const [back] = dimensions();
      expect(back.kind).toBe(original.kind);
      expect(back.layer).toBe(DIMENSIONS_LAYER);
      expectPoint(back.p1, original.p1);
      expectPoint(back.p2, original.p2);
      const [a1, a2] = dimensionLineEnds(back)!;
      const [e1, e2] = dimensionLineEnds(original)!;
      expectPoint(a1, e1);
      expectPoint(a2, e2);
    });
  }

  it('keeps a radius dimension and where its label sits', () => {
    createDimension({ kind: 'radius', p1: P(100, 0), p2: P(110, 0), textPoint: P(120, -10), value: 10 });
    const text = buildDxf();
    clearSketch();
    importDxfText(text, 1);

    const [back] = dimensions();
    expect(back.kind).toBe('radius');
    expectPoint(back.p1, P(100, 0));
    expectPoint(back.p2, P(110, 0));
    expectPoint(back.textPoint, P(120, -10));
    expect(back.value).toBeCloseTo(10, 9);
  });

  it('keeps a diameter dimension, recovering the centre from the two rim points', () => {
    createDimension({ kind: 'diameter', p1: P(200, 0), p2: P(206, -8), textPoint: P(220, -20), value: 20 });
    const text = buildDxf();
    clearSketch();
    importDxfText(text, 1);

    const [back] = dimensions();
    expect(back.kind).toBe('diameter');
    expectPoint(back.p1, P(200, 0));
    expectPoint(back.p2, P(206, -8));
    expectPoint(back.textPoint, P(220, -20));
    expect(back.value).toBeCloseTo(20, 9);
  });

  it('recomputes the value in the units the user picked', () => {
    createDimension({ kind: 'horizontal', p1: P(0, 0), p2: P(2, 0), textPoint: P(1, -1), value: 2 });
    const text = buildDxf();
    clearSketch();
    importDxfText(text, 25.4);

    const [back] = dimensions();
    expect(back.value).toBeCloseTo(50.8, 9);
  });

  it('keeps the geometry beside the dimensions', () => {
    new paper.Path.Line({ from: [0, 0], to: [30, 0], strokeColor: 'black' });
    createDimension({ kind: 'horizontal', p1: P(0, 0), p2: P(30, 0), textPoint: P(15, -10), value: 30 });
    const text = buildDxf();
    clearSketch();
    const summary = importDxfText(text, 1);

    expect(summary.items).toHaveLength(1);
    expect(summary.dimensions).toHaveLength(1);
    expect(summary.imported).toBe(2);
  });
});

describe('dimension DXF import from other CAD', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
    resetLayers();
  });

  it('reads a rotated dimension at 90° as vertical, with its line at the definition point', () => {
    // prettier-ignore
    importDxfText(dimensionFile([
      '10', 25, '20', 40, '11', 25, '21', 20, '70', 32 + 128,
      '13', 10, '23', 0, '14', 12, '24', 40, '50', 90,
    ]), 1);
    const [back] = dimensions();
    expect(back.kind).toBe('vertical');
    // Y flips into the sketch.
    expectPoint(back.p1, P(10, 0));
    expectPoint(back.p2, P(12, -40));
    expect(back.textPoint.x).toBeCloseTo(25, 9);
    expect(back.value).toBeCloseTo(40, 9);
  });

  it('reads a rotated dimension that runs along its own points as aligned', () => {
    // prettier-ignore
    importDxfText(dimensionFile([
      '10', 30, '20', 30, '11', 15, '21', 20, '70', 0,
      '13', 0, '23', 0, '14', 30, '24', 30, '50', 45,
    ]), 1);
    const [back] = dimensions();
    expect(back.kind).toBe('aligned');
    expect(back.value).toBeCloseTo(Math.hypot(30, 30), 9);
  });

  it('skips what the sketch cannot draw, and says why', () => {
    const angular = importDxfText(dimensionFile(['10', 0, '20', 0, '11', 1, '21', 1, '70', 2]), 1);
    expect(angular.skipped['DIMENSION (angular)']).toBe(1);

    const noText = importDxfText(dimensionFile(['10', 0, '20', 5, '70', 0, '13', 0, '23', 0, '14', 10, '24', 0]), 1);
    expect(noText.skipped['DIMENSION (no text position)']).toBe(1);

    // prettier-ignore
    const skewed = importDxfText(dimensionFile([
      '10', 0, '20', 5, '11', 5, '21', 5, '70', 0,
      '13', 0, '23', 0, '14', 10, '24', 0, '50', 30,
    ]), 1);
    expect(skewed.skipped['DIMENSION (rotated linear)']).toBe(1);
    expect(dimensions()).toHaveLength(0);
  });
});
