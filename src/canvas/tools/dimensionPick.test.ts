import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { createDimension, measureDimension } from '../dimensions';
import { applyClosedCornerFillet } from '../geometry/filletCorner';
import { createDimensionTool } from './DimensionTool';
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

function fakeEvent(point: paper.Point): paper.ToolEvent {
  return { point, event: { button: 0 } } as unknown as paper.ToolEvent;
}

function dimensionTool() {
  const isDimensioningRef = { current: false };
  const tool = createDimensionTool({
    isPanningRef: { current: false },
    isSpacebarPanRef: { current: false },
    isDimensioningRef,
    handleDragPan: () => {},
    getSnapConfig: snapConfig,
  });
  return { tool, isDimensioningRef };
}

function previewKind(): string | undefined {
  const group = paper.project.getItems({
    class: paper.Group,
    match: (item: paper.Item) => Boolean(item.data?.isDimension),
  })[0];
  return group?.data?.kind as string | undefined;
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
    return { line, arc, junction: new paper.Point(100, 0), center };
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

  it('picks a radius on a standalone fillet arc, including at the arc midpoint snap', () => {
    const { arc, center } = filletJunction();
    const mid = arc.getPointAt(arc.length / 2);
    const pick = pickDimensionTarget(mid, snapConfig());
    expect(pick?.type).toBe('arc');
    if (pick?.type !== 'arc') return;
    expect(pick.center.x).toBeCloseTo(center.x);
    expect(pick.center.y).toBeCloseTo(center.y);
    expect(pick.onCurve.getDistance(center)).toBeCloseTo(10, 1);
  });
});

describe('dimension pick on a closed filleted square', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  function filletedSquare() {
    const square = new paper.Path.Rectangle({ from: [0, 0], to: [100, 100], strokeColor: 'black' });
    const corner = new paper.Point(100, 100);
    const result = applyClosedCornerFillet(square, corner, 10);
    if (!result.ok) throw new Error(`fillet failed: ${result.reason}`);
    const path = result.path;
    const fillet = path.data.fillets[0];
    const filletCurve = path.curves.find((c) => !c.isStraight());
    if (!filletCurve) throw new Error('expected a non-straight fillet curve');
    return { path, fillet, filletCurve, corner };
  }

  it('picks a radius dimension on the fillet arc, not a linear dimension of the path', () => {
    const { fillet, filletCurve } = filletedSquare();
    const onArc = filletCurve.getPointAt(filletCurve.length / 2);
    const pick = pickDimensionTarget(onArc, snapConfig());
    expect(pick?.type).toBe('arc');
    if (pick?.type !== 'arc') return;
    expect(pick.center.x).toBeCloseTo(fillet.center.x);
    expect(pick.center.y).toBeCloseTo(fillet.center.y);
    const value = measureDimension('radius', pick.center, pick.onCurve);
    expect(value).toBeCloseTo(10);
    const group = createDimension({
      kind: 'radius',
      p1: pick.center,
      p2: pick.onCurve,
      textPoint: pick.onCurve.add([8, -8]),
      value,
    });
    expect(group.data.kind).toBe('radius');
    expect(group.data.value).toBeCloseTo(10);
  });

  it('picks a linear dimension on a straight side of the same filleted path', () => {
    filletedSquare();
    const pick = pickDimensionTarget(new paper.Point(40, 0.5), snapConfig());
    expect(pick?.type).toBe('line');
    if (pick?.type !== 'line') return;
    expect(pick.p1.y).toBeCloseTo(0);
    expect(pick.p2.y).toBeCloseTo(0);
    expect(Math.abs(pick.p2.x - pick.p1.x)).toBeCloseTo(100);
  });

  it('picks two-point distance from a fillet tangent to another corner', () => {
    const { fillet } = filletedSquare();
    const config = snapConfig();
    const tangent = fillet.tangentPoint1 as paper.Point;
    const first = pointPick(pickDimensionTarget(tangent, config));
    const second = pointPick(pickDimensionTarget(new paper.Point(0, 0), config));
    const value = measureDimension('aligned', first, second);
    expect(first.getDistance(tangent)).toBeCloseTo(0);
    expect(second.x).toBeCloseTo(0);
    expect(second.y).toBeCloseTo(0);
    expect(value).toBeGreaterThan(0);
  });

  it('starts a radius dimension when the Dimension tool clicks the fillet', () => {
    const { filletCurve } = filletedSquare();
    const { tool, isDimensioningRef } = dimensionTool();
    const onArc = filletCurve.getPointAt(filletCurve.length / 2);
    tool.onMouseDown(fakeEvent(onArc));
    expect(isDimensioningRef.current).toBe(true);
    expect(previewKind()).toBe('radius');
    tool.cancel();
  });

  it('starts a linear dimension when the Dimension tool clicks a straight side', () => {
    filletedSquare();
    const { tool, isDimensioningRef } = dimensionTool();
    tool.onMouseDown(fakeEvent(new paper.Point(40, 0.5)));
    expect(isDimensioningRef.current).toBe(true);
    expect(previewKind()).toMatch(/aligned|horizontal|vertical/);
    expect(previewKind()).not.toBe('radius');
    expect(previewKind()).not.toBe('diameter');
    tool.cancel();
  });
});
