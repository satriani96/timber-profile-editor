import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { createDimension, measureDimension } from '../dimensions';
import { pickAngleLine, pickDimensionTarget, type DimensionPick } from './dimensionPick';
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

  it('picks the arc at its midpoint, where a midpoint snap also sits', () => {
    const { arc } = filletJunction();
    const mid = arc.getPointAt(arc.length / 2);
    const pick = pickDimensionTarget(mid, snapConfig());
    expect(pick?.type).toBe('arc');
    if (pick?.type !== 'arc') return;
    expect(pick.center.x).toBeCloseTo(100);
    expect(pick.center.y).toBeCloseTo(10);
    expect(measureDimension('radius', pick.center, pick.onCurve)).toBeCloseTo(10);
  });

  it('picks a fillet that is one curve of a longer path with no arc metadata', () => {
    const path = new paper.Path({ segments: [[0, 0], [100, 0]], strokeColor: 'black' });
    path.arcTo([100 + 10 * Math.cos(Math.PI / 4), 10 - 10 * Math.sin(Math.PI / 4)], [110, 10]);
    path.lineTo([110, 60]);
    const onArc = path.getPointAt(100 + (Math.PI * 10) / 4);
    const pick = pickDimensionTarget(onArc.add([0.5, 0]), snapConfig());
    expect(pick?.type).toBe('arc');
    if (pick?.type !== 'arc') return;
    expect(pick.center.x).toBeCloseTo(100, 1);
    expect(pick.center.y).toBeCloseTo(10, 1);
  });

  it('offers a second line for an angle anywhere along it, but not the first line or one parallel to it', () => {
    const a = new paper.Point(0, 0);
    const b = new paper.Point(100, 0);
    new paper.Path({ segments: [a, b, [100, 50], [0, 50]], closed: true, strokeColor: 'black' });

    // The right-hand edge at its midpoint, where a snap point also sits.
    const side = pickAngleLine(new paper.Point(100, 25), a, b);
    expect(side?.p1.x).toBeCloseTo(100);
    expect(side?.p2.x).toBeCloseTo(100);

    expect(pickAngleLine(new paper.Point(50, 0), a, b)).toBeNull();
    expect(pickAngleLine(new paper.Point(50, 50), a, b)).toBeNull();
    expect(pickAngleLine(new paper.Point(50, 25), a, b)).toBeNull();
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
