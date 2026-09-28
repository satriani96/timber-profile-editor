import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { clearOpenEnds, findOpenEnds, showOpenEnds } from './openEnds';

function line(x1: number, y1: number, x2: number, y2: number) {
  return new paper.Path.Line({ from: [x1, y1], to: [x2, y2], strokeColor: 'black' });
}

describe('openEnds', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('finds nothing loose in a closed chain of lines', () => {
    const paths = [line(0, 0, 10, 0), line(10, 0, 10, 10), line(10, 10, 0, 10.02), line(0, 10.02, 0, 0)];
    expect(findOpenEnds(paths)).toHaveLength(0);
  });

  it('ignores closed paths', () => {
    const square = new paper.Path.Rectangle({ point: [0, 0], size: [10, 10] });
    expect(findOpenEnds([square])).toHaveLength(0);
  });

  it('flags both ends of a stub that overlaps the next line instead of meeting it', () => {
    // The spline end at x=32.0139, a 0.15 mm stub, and a top line that starts on the stub's midpoint.
    const corner = line(31, 44, 32.0139, 45.7973);
    const stub = line(32.0139, 45.7973, 32.1632, 45.7973);
    const top = line(32.0886, 45.7973, 83, 45.7973);
    const loose = findOpenEnds([corner, stub, top]);
    expect(loose.map((p) => p.x.toFixed(4))).toEqual(expect.arrayContaining(['32.1632', '32.0886']));
    // Plus the far ends of the corner and the top line, which nothing in this set meets.
    expect(loose).toHaveLength(4);
  });

  it('only checks the paths it is given', () => {
    const a = line(0, 0, 10, 0);
    line(10, 0, 20, 0);
    expect(findOpenEnds([a])).toHaveLength(2);
  });

  it('rings are temporary and clear', () => {
    showOpenEnds([new paper.Point(1, 1), new paper.Point(2, 2)]);
    const rings = () => paper.project.activeLayer.children.filter((item) => item.data?.isOpenEndMarker);
    expect(rings()).toHaveLength(2);
    expect(rings().every((item) => item.data.isTemporary)).toBe(true);
    clearOpenEnds();
    expect(rings()).toHaveLength(0);
  });
});
