import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { reflectPoint } from '../geometry/itemData';
import { applyMirrorSelection, collectSelectedTransformItems, mirrorCopyItems } from './transformSelection';

function expectPoint(actual: paper.Point, expected: paper.Point, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe('mirror copy semantics', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('adds a mirrored copy and leaves the original in place', () => {
    const center = new paper.Point(40, 10);
    const circle = new paper.Path.Circle({ center, radius: 8, strokeColor: 'black' });
    circle.data = { center: center.clone(), radius: 8, isArc: false, layer: 'Profile' };
    const line = new paper.Path.Line({ from: [0, 0], to: [0, 50], strokeColor: 'black' });

    const copies = mirrorCopyItems([circle, line], new paper.Point(0, 0), new paper.Point(0, 1));
    expect(copies).toHaveLength(2);
    expect(paper.project.activeLayer.children.filter((c) => c instanceof paper.Path)).toHaveLength(4);
    expectPoint(circle.data.center, center);
    expectPoint(copies[0].data.center, reflectPoint(center, new paper.Point(0, 0), new paper.Point(0, 1)));
    expect(copies[0].data.layer).toBe('Profile');
    expectPoint(line.firstSegment.point, new paper.Point(0, 0));
  });

  it('mirrors selected items in place when asked to move', () => {
    const center = new paper.Point(30, 0);
    const circle = new paper.Path.Circle({ center, radius: 5, strokeColor: 'black' });
    circle.data = { center: center.clone(), radius: 5, isArc: false };
    applyMirrorSelection([circle], new paper.Point(0, 0), new paper.Point(0, 1));
    expectPoint(circle.data.center, new paper.Point(-30, 0));
    expect(paper.project.activeLayer.children.filter((c) => c instanceof paper.Path)).toHaveLength(1);
  });

  it('collects selected sketch paths and not temporary ghosts', () => {
    const path = new paper.Path.Line({ from: [1, 1], to: [4, 1], strokeColor: 'black' });
    const ghost = path.clone();
    ghost.data = { isTemporary: true };
    path.selected = true;
    ghost.selected = true;
    const items = collectSelectedTransformItems();
    expect(items).toEqual([path]);
  });
});
