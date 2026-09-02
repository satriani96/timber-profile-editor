import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { rotatePath } from './itemData';
import { arcDataFor } from './pathCuts';

function expectPoint(actual: paper.Point, expected: paper.Point, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe('rotatePath', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('rotates a circle and updates data.center', () => {
    const origin = new paper.Point(0, 0);
    const center = new paper.Point(80, 20);
    const path = new paper.Path.Circle({ center, radius: 15, strokeColor: 'black' });
    path.data = { center: center.clone(), radius: 15, isArc: false };

    rotatePath(path, 90, origin);

    const expected = center.rotate(90, origin);
    expectPoint(path.data.center, expected);
    expect(path.data.radius).toBe(15);
    expect(path.data.isArc).toBe(false);
    expectPoint(path.position, expected);
  });

  it('keeps arc radius and start/end angles whose midpoint matches the rotated geometry', () => {
    const center = new paper.Point(0, 0);
    const radius = 40;
    const path = new paper.Path();
    path.add(new paper.Point(radius, 0));
    path.arcTo(new paper.Point(0, radius), new paper.Point(-radius, 0));
    path.data = arcDataFor(path, center, radius);

    const midBefore = path.getPointAt(path.length / 2)!;
    rotatePath(path, 90, center);

    expect(path.data.radius).toBe(radius);
    expect(path.data.isArc).toBe(true);
    expectPoint(path.data.center, center);

    const midAfter = path.getPointAt(path.length / 2)!;
    expectPoint(midAfter, midBefore.rotate(90, center));

    const recomputed = arcDataFor(path, path.data.center, path.data.radius);
    expect(path.data.startAngle).toBeCloseTo(recomputed.startAngle, 6);
    expect(path.data.endAngle).toBeCloseTo(recomputed.endAngle, 6);

    const start = path.firstSegment.point;
    const end = path.lastSegment.point;
    const startH = (Math.atan2(start.y - center.y, start.x - center.x) * 180) / Math.PI;
    const endH = (Math.atan2(end.y - center.y, end.x - center.x) * 180) / Math.PI;
    expect(((startH % 360) + 360) % 360).toBeCloseTo(((recomputed.startAngle % 360) + 360) % 360, 4);
    expect(((endH % 360) + 360) % 360).toBeCloseTo(((recomputed.endAngle % 360) + 360) % 360, 4);
  });

  it('drops isRect on a filleted rectangle and rotates fillet metadata', () => {
    const origin = new paper.Point(0, 0);
    const path = new paper.Path.Rectangle({ from: [0, 0], to: [40, 20], strokeColor: 'black' });
    const filletCenter = new paper.Point(35, 5);
    path.data = {
      isRect: true,
      startPoint: new paper.Point(0, 0),
      endPoint: new paper.Point(40, 20),
      width: 40,
      height: 20,
      fillets: [
        {
          cornerPoint: new paper.Point(40, 0),
          tangentPoint1: new paper.Point(35, 0),
          tangentPoint2: new paper.Point(40, 5),
          center: filletCenter.clone(),
          radius: 5,
          startAngle: 0,
          endAngle: 90,
        },
      ],
    };

    rotatePath(path, 90, origin);

    expect(path.data.isRect).toBeUndefined();
    expect(path.data.width).toBeUndefined();
    expect(path.data.height).toBeUndefined();
    expectPoint(path.data.startPoint, new paper.Point(0, 0).rotate(90, origin));
    expectPoint(path.data.endPoint, new paper.Point(40, 20).rotate(90, origin));
    expectPoint(path.data.fillets[0].center, filletCenter.rotate(90, origin));
    expectPoint(path.data.fillets[0].cornerPoint, new paper.Point(40, 0).rotate(90, origin));
    expectPoint(path.data.fillets[0].tangentPoint1, new paper.Point(35, 0).rotate(90, origin));
    expect(path.data.fillets[0].startAngle).toBeCloseTo(90);
    expect(path.data.fillets[0].endAngle).toBeCloseTo(180);
    expect(path.data.fillets[0].radius).toBe(5);
  });

  it('rotates spline fitPoints with the geometry', () => {
    const origin = new paper.Point(10, 10);
    const fit = [new paper.Point(0, 0), new paper.Point(20, 0), new paper.Point(30, 15)];
    const path = new paper.Path({ segments: fit, strokeColor: 'black' });
    path.data = { isSpline: true, fitPoints: fit.map((p) => p.clone()) };

    rotatePath(path, -45, origin);

    expect(path.data.isSpline).toBe(true);
    expect(path.data.fitPoints).toHaveLength(3);
    path.data.fitPoints.forEach((p: paper.Point, i: number) => {
      expectPoint(p, fit[i].rotate(-45, origin));
      expectPoint(path.segments[i].point, fit[i].rotate(-45, origin));
    });
  });
});
