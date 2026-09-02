import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { createDimension, measureDimension, readDimensionData } from '../dimensions';
import { applyRotateSelection, applyTranslateSelection, collectSelectedTransformItems } from './transformSelection';

function expectPoint(actual: paper.Point, expected: paper.Point, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe('transform selection', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('translates a mixed selection and keeps path/dimension metadata aligned', () => {
    const line = new paper.Path.Line({ from: [0, 0], to: [40, 0], strokeColor: 'black' });
    const circleCenter = new paper.Point(80, 20);
    const circle = new paper.Path.Circle({ center: circleCenter, radius: 10, strokeColor: 'black' });
    circle.data = { center: circleCenter.clone(), radius: 10, isArc: false };

    const p1 = new paper.Point(0, 0);
    const p2 = new paper.Point(40, 0);
    const dim = createDimension({
      kind: 'horizontal',
      p1,
      p2,
      textPoint: new paper.Point(20, -12),
      value: measureDimension('horizontal', p1, p2),
    });

    const delta = new paper.Point(15, -8);
    applyTranslateSelection([line, circle, dim], delta);

    expectPoint(line.firstSegment.point, new paper.Point(15, -8));
    expectPoint(line.lastSegment.point, new paper.Point(55, -8));
    expectPoint(circle.data.center, circleCenter.add(delta));
    expect(circle.data.radius).toBe(10);
    expectPoint(circle.position, circleCenter.add(delta));

    const data = readDimensionData(dim);
    expectPoint(data.p1, p1.add(delta));
    expectPoint(data.p2, p2.add(delta));
    expectPoint(data.textPoint, new paper.Point(35, -20));
    expect(data.kind).toBe('horizontal');
    expect(data.value).toBe(40);
  });

  it('rotates a horizontal dimension to aligned and turns definition points', () => {
    const dim = createDimension({
      kind: 'horizontal',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(50, 0),
      textPoint: new paper.Point(25, -10),
      value: 50,
    });
    const center = new paper.Point(0, 0);
    applyRotateSelection([dim], 90, center);

    const data = readDimensionData(dim);
    expect(data.kind).toBe('aligned');
    expectPoint(data.p1, new paper.Point(0, 0));
    expectPoint(data.p2, new paper.Point(0, 50));
    expectPoint(data.textPoint, new paper.Point(10, 25));
    expect(data.value).toBe(50);
  });

  it('collects selected sketch paths and dimension groups', () => {
    const line = new paper.Path.Line({ from: [0, 0], to: [10, 0], strokeColor: 'black' });
    const dim = createDimension({
      kind: 'aligned',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(10, 0),
      textPoint: new paper.Point(5, -8),
      value: 10,
    });
    const ghost = new paper.Path.Line({ from: [0, 20], to: [10, 20], strokeColor: 'black' });
    ghost.data = { isTemporary: true };
    line.selected = true;
    dim.selected = true;
    ghost.selected = true;

    const items = collectSelectedTransformItems();
    expect(items).toContain(line);
    expect(items).toContain(dim);
    expect(items).not.toContain(ghost);
  });
});
