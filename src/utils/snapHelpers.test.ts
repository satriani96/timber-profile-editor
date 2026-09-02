import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { constrainToAxis } from './snapHelpers';

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
