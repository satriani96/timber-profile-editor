import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { constrainToAxis, findSnap } from './snapHelpers';

describe('constrainToAxis (Shift ortho)', () => {
  beforeEach(() => paper.setup(new paper.Size(800, 600)));

  it('snaps to the nearest 45° increment while keeping the projected length', () => {
    const start = new paper.Point(100, 100);

    const nearlyHorizontal = constrainToAxis(start, new paper.Point(300, 140));
    expect(nearlyHorizontal.y).toBeCloseTo(100, 9);
    expect(nearlyHorizontal.x).toBeCloseTo(300, 9);

    const nearlyVertical = constrainToAxis(start, new paper.Point(90, 350));
    expect(nearlyVertical.x).toBeCloseTo(100, 9);
    expect(nearlyVertical.y).toBeCloseTo(350, 9);

    const diagonal = constrainToAxis(start, new paper.Point(200, 190));
    expect(diagonal.x - start.x).toBeCloseTo(diagonal.y - start.y, 9);

    expect(constrainToAxis(start, start).equals(start)).toBe(true);
  });
});

describe('findSnap midpoints', () => {
  beforeEach(() => paper.setup(new paper.Size(800, 600)));

  const config = () => ({ snapTolerancePx: 10, currentPathRef: { current: null }, snapIndicatorRef: { current: null } });

  it('offers no midpoint on a segment too short to tell it from its ends', () => {
    // A 0.15 mm stub at 782% zoom: the midpoint is within 10 px of both ends.
    paper.view.zoom = 7.82;
    new paper.Path.Line({ from: [0, 0], to: [0.15, 0], strokeColor: 'black' });
    const snap = findSnap(new paper.Point(0.07, 0), config());
    expect(snap?.kind).toBe('endpoint');
  });

  it('still offers the midpoint once zoomed in far enough to separate it', () => {
    paper.view.zoom = 1000;
    new paper.Path.Line({ from: [0, 0], to: [0.15, 0], strokeColor: 'black' });
    const snap = findSnap(new paper.Point(0.075, 0), config());
    expect(snap?.kind).toBe('midpoint');
  });
});
