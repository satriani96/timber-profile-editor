import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import {
  copySelection,
  importClipboardItems,
  parseClipboardEnvelope,
  serializeClipboard,
} from './clipboard';
import { createDimension } from './dimensions';

function expectPoint(actual: paper.Point, expected: { x: number; y: number }, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe('clipboard envelope', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('round-trips paths and dimension metadata through the envelope', () => {
    const line = new paper.Path.Line({ from: [10, 20], to: [40, 20], strokeColor: 'black' });
    line.data = { layer: 'Profile' };
    const center = new paper.Point(80, 40);
    const circle = new paper.Path.Circle({ center, radius: 12, strokeColor: 'black' });
    circle.data = { center: center.clone(), radius: 12, isArc: false, layer: 'Profile' };
    const dim = createDimension({
      kind: 'aligned',
      p1: new paper.Point(10, 20),
      p2: new paper.Point(40, 20),
      textPoint: new paper.Point(25, 8),
      value: 30,
    });

    const envelope = serializeClipboard([line, circle, dim]);
    const text = JSON.stringify(envelope);
    const parsed = parseClipboardEnvelope(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.timberProfileEditor).toBe(1);
    expect(parsed!.items).toHaveLength(3);

    line.remove();
    circle.remove();
    dim.remove();

    const imported = importClipboardItems(parsed!.items, false);
    expect(imported).toHaveLength(3);

    const restoredLine = imported.find((item) => item instanceof paper.Path && !item.data?.center) as paper.Path;
    const restoredCircle = imported.find((item) => item instanceof paper.Path && item.data?.radius === 12) as paper.Path;
    const restoredDim = imported.find((item) => item.data?.isDimension) as paper.Group;

    expectPoint(restoredLine.firstSegment.point, { x: 10, y: 20 });
    expectPoint(restoredLine.lastSegment.point, { x: 40, y: 20 });
    expect(restoredLine.data.layer).toBe('Profile');

    expect(restoredCircle.data.center).toBeInstanceOf(paper.Point);
    expectPoint(restoredCircle.data.center, { x: 80, y: 40 });
    expect(restoredCircle.data.radius).toBe(12);
    expect(restoredCircle.data.isArc).toBe(false);

    expect(restoredDim.data.kind).toBe('aligned');
    expect(restoredDim.data.value).toBe(30);
    expectPoint(restoredDim.data.p1, { x: 10, y: 20 });
    expectPoint(restoredDim.data.p2, { x: 40, y: 20 });
  });

  it('copies the current selection and leaves the originals in place', () => {
    const path = new paper.Path.Line({ from: [0, 0], to: [8, 0], strokeColor: 'black' });
    path.selected = true;
    const envelope = copySelection();
    expect(envelope?.items).toHaveLength(1);
    expect(path.isInserted()).toBe(true);
    expect(parseClipboardEnvelope(JSON.stringify(envelope))).not.toBeNull();
  });

  it('rejects text that is not our envelope', () => {
    expect(parseClipboardEnvelope('not json')).toBeNull();
    expect(parseClipboardEnvelope('{"items":[]}')).toBeNull();
    expect(parseClipboardEnvelope('{"timberProfileEditor":2,"items":[]}')).toBeNull();
  });
});
