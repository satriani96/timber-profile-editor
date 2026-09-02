import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { reflectPoint } from '../geometry/itemData';
import { applyMirrorSelection, collectSelectedTransformItems, mirrorCopyItems } from './transformSelection';
import { buildDxf } from '../../exporters/ExportDXF';
import { parseDxf } from '../../importers/dxfParser';

function expectPoint(actual: paper.Point, expected: paper.Point, precision = 6) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe('mirror copy semantics', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('does not mutate the original fillet metadata when copying', () => {
    const path = new paper.Path.Rectangle({ from: [0, 0], to: [40, 20], strokeColor: 'black' });
    const filletCenter = new paper.Point(35, 5);
    path.data = {
      isRect: true,
      fillets: [{ center: filletCenter.clone(), radius: 5, tangentPoint1: new paper.Point(35, 0), tangentPoint2: new paper.Point(40, 5) }],
    };
    const copies = mirrorCopyItems([path], new paper.Point(20, 0), new paper.Point(0, 1));
    expectPoint(path.data.fillets[0].center, filletCenter);
    expectPoint(copies[0].data.fillets[0].center, new paper.Point(5, 5));
  });

  it('exports distinct DXF ARC centres for a mirrored fillet copy', () => {
    const path = new paper.Path.Rectangle({ from: [0, 0], to: [40, 20], strokeColor: 'black', closed: true });
    path.data = {
      isRect: true,
      fillets: [
        {
          cornerIndex: 1,
          cornerPoint: new paper.Point(40, 0),
          tangentPoint1: new paper.Point(35, 0),
          tangentPoint2: new paper.Point(40, 5),
          center: new paper.Point(35, 5),
          radius: 5,
          startAngle: 0,
          endAngle: 90,
        },
      ],
    };
    mirrorCopyItems([path], new paper.Point(50, 0), new paper.Point(0, 1));
    const { entities } = parseDxf(buildDxf());
    const arcs = entities.filter((e) => e.type === 'ARC');
    expect(arcs).toHaveLength(2);
    const xs = arcs.map((e) => (e.type === 'ARC' ? e.center.x : 0)).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(10);
    expect(arcs.every((e) => e.type === 'ARC' && Math.abs(e.radius - 5) < 1e-6)).toBe(true);
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
