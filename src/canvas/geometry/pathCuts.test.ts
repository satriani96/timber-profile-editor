import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { arcDataFor, collectCutOffsets, cutInterval, findCutInterval, openClosedPathAt } from './pathCuts';

function circle(cx: number, cy: number, r: number) {
  const c = new paper.Path.Circle({ center: [cx, cy], radius: r, strokeColor: 'black' });
  c.data = { center: new paper.Point(cx, cy), radius: r, isArc: false };
  return c;
}

function line(x1: number, y1: number, x2: number, y2: number) {
  return new paper.Path.Line({ from: [x1, y1], to: [x2, y2], strokeColor: 'black' });
}

describe('pathCuts', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('trims a circle to the arc between two line intersections', () => {
    const c = circle(0, 0, 50);
    line(-100, 0, 100, 0);

    const cuts = collectCutOffsets(c);
    expect(cuts).toHaveLength(2);

    // Hover the top of the circle (y is negative upwards in Paper).
    const hover = c.getNearestLocation(new paper.Point(0, -50))!;
    const interval = findCutInterval(c, hover.offset, cuts);
    expect(interval.whole).toBe(false);

    const { piece, rest } = cutInterval(c, interval);
    expect(piece.length).toBeCloseTo(Math.PI * 50, 1);
    expect(rest).toHaveLength(1);
    expect(rest[0].length).toBeCloseTo(Math.PI * 50, 1);
    expect(piece.closed).toBe(false);

    expect(piece.data.isArc).toBe(true);
    expect(piece.data.radius).toBe(50);
    expect(piece.data.sweepAngle).toBeCloseTo(180, 3);
    // Piece is the upper half: its midpoint must be above the center.
    const mid = piece.getPointAt(piece.length / 2)!;
    expect(mid.y).toBeLessThan(0);

    piece.remove();
    expect(paper.project.activeLayer.children.filter((i) => i instanceof paper.Path)).toHaveLength(2);
  });

  it('trims the chord of a line that passes through a circle', () => {
    circle(0, 0, 50);
    const l = line(-100, 0, 100, 0);

    const cuts = collectCutOffsets(l);
    expect(cuts.map((c) => Math.round(c))).toEqual([50, 150]);

    const hover = l.getNearestLocation(new paper.Point(0, 0))!;
    const interval = findCutInterval(l, hover.offset, cuts);
    expect(interval.from).toBeCloseTo(50, 5);
    expect(interval.to).toBeCloseTo(150, 5);

    const { piece, rest } = cutInterval(l, interval);
    expect(piece.length).toBeCloseTo(100, 5);
    expect(rest).toHaveLength(2);
    expect(rest[0].firstSegment.point.x).toBeCloseTo(-100);
    expect(rest[0].lastSegment.point.x).toBeCloseTo(-50);
    expect(rest[1].firstSegment.point.x).toBeCloseTo(50);
    expect(rest[1].lastSegment.point.x).toBeCloseTo(100);
    expect(piece.data).toEqual({});
  });

  it('treats the endpoint of a connected line as a cut', () => {
    const base = line(0, 0, 100, 0);
    line(60, 0, 60, 80);

    const cuts = collectCutOffsets(base);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toBeCloseTo(60, 5);

    const interval = findCutInterval(base, 10, cuts);
    expect(interval.from).toBe(0);
    expect(interval.to).toBeCloseTo(60, 5);
    expect(interval.whole).toBe(false);

    const { piece, rest } = cutInterval(base, interval);
    expect(piece.firstSegment.point.x).toBeCloseTo(0);
    expect(piece.lastSegment.point.x).toBeCloseTo(60);
    expect(rest).toHaveLength(1);
    expect(rest[0].firstSegment.point.x).toBeCloseTo(60);
  });

  it('reports the whole path when nothing cuts it', () => {
    const lonely = line(0, 0, 100, 0);
    const cuts = collectCutOffsets(lonely);
    expect(cuts).toEqual([]);
    expect(findCutInterval(lonely, 40, cuts).whole).toBe(true);
    lonely.remove();

    const tangentCircle = circle(0, 0, 50);
    line(-100, 50, 100, 50);
    const circleCuts = collectCutOffsets(tangentCircle);
    expect(circleCuts.length).toBeLessThanOrEqual(1);
    expect(findCutInterval(tangentCircle, 10, circleCuts).whole).toBe(true);
  });

  it('extracts a wrapped interval from a closed rectangle', () => {
    const rect = new paper.Path.Rectangle({ from: [0, 0], to: [100, 60], strokeColor: 'black' });
    line(50, -20, 50, 80);

    const cuts = collectCutOffsets(rect);
    expect(cuts).toHaveLength(2);

    // Hover the left side; the resulting piece must contain the left edge's midpoint.
    const hover = rect.getNearestLocation(new paper.Point(0, 30))!;
    const interval = findCutInterval(rect, hover.offset, cuts);
    const { piece, rest } = cutInterval(rect, interval);
    expect(piece.closed).toBe(false);
    expect(piece.getNearestLocation(new paper.Point(0, 30))!.distance).toBeLessThan(1e-6);
    expect(piece.length).toBeCloseTo(50 + 60 + 50, 5);
    expect(rest).toHaveLength(1);
    expect(rest[0].length).toBeCloseTo(50 + 60 + 50, 5);
  });

  it('opens a closed path at a single cut and marks it as a full arc', () => {
    const c = circle(0, 0, 50);
    openClosedPathAt(c, 0);
    expect(c.closed).toBe(false);
    expect(c.length).toBeCloseTo(2 * Math.PI * 50, 1);
    expect(c.data.isArc).toBe(true);
    expect(c.data.sweepAngle).toBeCloseTo(360, 3);
  });

  it('orders arc angles counter-clockwise through the arc midpoint', () => {
    const arc = new paper.Path.Arc({ from: [50, 0], through: [0, 50], to: [-50, 0], strokeColor: 'black' });
    const data = arcDataFor(arc, new paper.Point(0, 0), 50);
    expect(data.startAngle).toBeCloseTo(0, 3);
    expect(data.endAngle).toBeCloseTo(180, 3);

    const reversed = new paper.Path.Arc({ from: [50, 0], through: [0, -50], to: [-50, 0], strokeColor: 'black' });
    const data2 = arcDataFor(reversed, new paper.Point(0, 0), 50);
    expect(data2.startAngle).toBeCloseTo(180, 3);
    expect(data2.endAngle).toBeCloseTo(0, 3);
  });
});
