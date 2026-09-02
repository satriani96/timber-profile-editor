import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { createDimension, measureDimension } from '../dimensions';
import { pickDimensionTarget, type DimensionPick } from './dimensionPick';
import type { SnapConfig } from '../../utils/snapHelpers';

function snapConfig(): SnapConfig {
  return {
    snapTolerancePx: 10,
    currentPathRef: { current: null },
    snapIndicatorRef: { current: null },
  };
}

function pointPick(pick: DimensionPick | null): paper.Point {
  expect(pick?.type).toBe('point');
  if (pick?.type !== 'point') throw new Error('expected point pick');
  return pick.point;
}

describe('dimension pick priority', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  function filletJunction() {
    const line = new paper.Path.Line({ from: [0, 0], to: [100, 0], strokeColor: 'black' });
    const center = new paper.Point(100, 10);
    const arc = new paper.Path.Arc({
      from: [100, 0],
      through: [100 + 10 * Math.cos(Math.PI / 4), 10 - 10 * Math.sin(Math.PI / 4)],
      to: [110, 10],
      strokeColor: 'black',
    });
    arc.data = { isArc: true, center, radius: 10 };
    return { line, arc, junction: new paper.Point(100, 0) };
  }

  it('picks the shared endpoint where a line meets a fillet arc, not the line or arc', () => {
    const { junction } = filletJunction();
    const pick = pickDimensionTarget(junction.add([1, 1]), snapConfig());
    expect(pick?.type).toBe('point');
    if (pick?.type !== 'point') return;
    expect(pick.point.x).toBeCloseTo(100);
    expect(pick.point.y).toBeCloseTo(0);
    expect(['endpoint', 'intersection']).toContain(pick.kind);
  });

  it('picks the line when clicking the stroke away from snap points', () => {
    filletJunction();
    const pick = pickDimensionTarget(new paper.Point(30, 1), snapConfig());
    expect(pick?.type).toBe('line');
    if (pick?.type !== 'line') return;
    expect(pick.p1.x).toBeCloseTo(0);
    expect(pick.p2.x).toBeCloseTo(100);
  });

  it('two endpoint picks produce a distance dimension with the measured length', () => {
    filletJunction();
    const config = snapConfig();
    const first = pointPick(pickDimensionTarget(new paper.Point(100, 0), config));
    const second = pointPick(pickDimensionTarget(new paper.Point(0, 0), config));
    const value = measureDimension('aligned', first, second);
    const group = createDimension({
      kind: 'aligned',
      p1: first,
      p2: second,
      textPoint: first.add(second).divide(2).add([0, -12]),
      value,
    });
    expect(value).toBeCloseTo(100);
    expect(group.data.value).toBeCloseTo(100);
    expect(group.data.kind).toBe('aligned');
  });
});
