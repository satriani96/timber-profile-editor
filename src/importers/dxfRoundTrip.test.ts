import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { buildDxf } from '../exporters/ExportDXF';
import { commitDxfImport, importDxfText, prepareDxfImport } from './ImportDXF';
import { parseDxf, millimetresPerUnit } from './dxfParser';
import { collectCutOffsets, cutInterval, findCutInterval } from '../canvas/geometry/pathCuts';

function sketchPaths() {
  return paper.project.activeLayer.children.filter((i): i is paper.Path => i instanceof paper.Path);
}

function dxf(lines: (string | number)[]): string {
  return lines.join('\n') + '\n';
}

describe('DXF export/import round trip', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('round-trips lines, circles, rectangles, cut arcs and splines', () => {
    new paper.Path.Line({ from: [0, 0], to: [100, 40], strokeColor: 'black' });

    const circle = new paper.Path.Circle({ center: [200, 100], radius: 30, strokeColor: 'black' });
    circle.data = { center: new paper.Point(200, 100), radius: 30, isArc: false };

    new paper.Path.Rectangle({ from: [300, 0], to: [400, 60], strokeColor: 'black' });

    // A circle cut by a line becomes a real arc with metadata.
    const cutCircle = new paper.Path.Circle({ center: [0, 300], radius: 50, strokeColor: 'black' });
    cutCircle.data = { center: new paper.Point(0, 300), radius: 50, isArc: false };
    const cutter = new paper.Path.Line({ from: [-100, 300], to: [100, 300], strokeColor: 'black' });
    const cuts = collectCutOffsets(cutCircle);
    const hover = cutCircle.getNearestLocation(new paper.Point(0, 250))!;
    cutInterval(cutCircle, findCutInterval(cutCircle, hover.offset, cuts)).piece.remove();
    cutter.remove();

    const spline = new paper.Path({
      segments: [
        [500, 0],
        [540, 60],
        [600, 20],
        [660, 80],
      ],
      strokeColor: 'black',
    });
    spline.smooth({ type: 'catmull-rom', factor: 0.5 });
    spline.data = { isSpline: true, fitPoints: spline.segments.map((s) => s.point.clone()) };

    const before = sketchPaths();
    expect(before).toHaveLength(5);
    const text = buildDxf();
    expect(text).toContain('ENTITIES');

    paper.project.activeLayer.removeChildren();
    const summary = importDxfText(text);
    expect(summary.skipped).toEqual({});
    expect(summary.imported).toBe(5);

    const after = sketchPaths();
    expect(after).toHaveLength(5);

    const importedLine = after.find((p) => p.segments.length === 2 && !p.closed && !p.data?.isArc)!;
    expect(importedLine.firstSegment.point.x).toBeCloseTo(0);
    expect(importedLine.lastSegment.point.y).toBeCloseTo(40);

    const importedCircle = after.find((p) => p.data?.isArc === false)!;
    expect(importedCircle.data.center.x).toBeCloseTo(200);
    expect(importedCircle.data.radius).toBeCloseTo(30);
    expect(importedCircle.closed).toBe(true);

    const importedRect = after.find((p) => p.closed && p.segments.length === 4 && !p.data?.center)!;
    expect(importedRect.bounds.width).toBeCloseTo(100);
    expect(importedRect.bounds.height).toBeCloseTo(60);

    const importedArc = after.find((p) => p.data?.isArc === true)!;
    expect(importedArc.data.radius).toBeCloseTo(50);
    expect(importedArc.length).toBeCloseTo(Math.PI * 50, 0);
    // Remaining half is the lower half (y > center) in Paper coordinates.
    expect(importedArc.getPointAt(importedArc.length / 2)!.y).toBeGreaterThan(300);

    const importedSpline = after.find((p) => p.data?.isSpline)!;
    expect(importedSpline.segments).toHaveLength(4);
    importedSpline.segments.forEach((seg, i) => {
      expect(seg.point.x).toBeCloseTo(spline.segments[i].point.x, 6);
      expect(seg.point.y).toBeCloseTo(spline.segments[i].point.y, 6);
      expect(seg.handleOut.x).toBeCloseTo(spline.segments[i].handleOut.x, 6);
      expect(seg.handleIn.y).toBeCloseTo(spline.segments[i].handleIn.y, 6);
    });
  });

  it('exports fillet-like curves as true arcs', () => {
    const arc = new paper.Path.Arc({ from: [50, 0], through: [35.355, 35.355], to: [0, 50], strokeColor: 'black' });
    arc.data = {};
    const text = buildDxf();
    expect(text).toContain('\nARC\n');
    const doc = parseDxf(text);
    expect(doc.entities).toHaveLength(1);
    const entity = doc.entities[0];
    expect(entity.type).toBe('ARC');
    if (entity.type === 'ARC') {
      expect(entity.radius).toBeCloseTo(50, 2);
      expect(entity.center.x).toBeCloseTo(0, 2);
      expect(entity.startAngle).toBeCloseTo(0, 1);
      expect(entity.endAngle).toBeCloseTo(90, 1);
    }
  });
});

describe('DXF parser', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('reads header units, bulged polylines, and block inserts', () => {
    const text = dxf([
      0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 1, 0, 'ENDSEC',
      0, 'SECTION', 2, 'BLOCKS',
      0, 'BLOCK', 2, 'B1', 10, 0, 20, 0,
      0, 'LINE', 10, 0, 20, 0, 11, 1, 21, 0,
      0, 'ENDBLK',
      0, 'ENDSEC',
      0, 'SECTION', 2, 'ENTITIES',
      0, 'LWPOLYLINE', 90, 3, 70, 0, 10, 0, 20, 0, 10, 1, 20, 0, 42, 1, 10, 1, 20, 1,
      0, 'INSERT', 2, 'B1', 10, 10, 20, 10, 41, 2, 42, 2, 50, 90,
      0, 'TEXT', 10, 0, 20, 0, 1, 'hello',
      0, 'ENDSEC',
      0, 'EOF',
    ]);

    const doc = parseDxf(text);
    expect(doc.insUnits).toBe(1);
    expect(millimetresPerUnit(doc.insUnits)).toBe(25.4);
    expect(doc.unsupported).toEqual({ TEXT: 1 });
    expect(doc.entities).toHaveLength(2);
    const poly = doc.entities[0];
    expect(poly.type).toBe('POLYLINE');
    if (poly.type === 'POLYLINE') {
      expect(poly.vertices).toHaveLength(3);
      expect(poly.vertices[1].bulge).toBe(1);
    }

    const summary = importDxfText(text);
    expect(summary.imported).toBe(2);
    const paths = sketchPaths();

    // Bulge of 1 is a semicircle from (1,0) to (1,1): radius 0.5 inch, centered (1, 0.5).
    const polyline = paths.find((p) => p.segments.length > 2)!;
    expect(polyline.bounds.right).toBeCloseTo(1.5 * 25.4, 1);
    expect(polyline.bounds.top).toBeCloseTo(0, 6);
    expect(polyline.bounds.bottom).toBeCloseTo(25.4, 6);
    expect(polyline.length).toBeCloseTo((1 + Math.PI * 0.5) * 25.4, 0);

    // Block line (0,0)-(1,0) scaled 2x, rotated 90°, inserted at (10,10): ends at (10, 12) inches.
    const inserted = paths.find((p) => p.segments.length === 2)!;
    expect(inserted.firstSegment.point.x).toBeCloseTo(10 * 25.4, 6);
    expect(inserted.lastSegment.point.x).toBeCloseTo(10 * 25.4, 6);
    expect(inserted.lastSegment.point.y).toBeCloseTo(12 * 25.4, 6);
  });

  it('lets the caller override the header units after previewing extents', () => {
    const text = dxf([
      0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 1, 0, 'ENDSEC',
      0, 'SECTION', 2, 'ENTITIES',
      0, 'LWPOLYLINE', 90, 4, 70, 1, 10, 0, 20, 0, 10, 12, 20, 0, 10, 12, 20, 12, 10, 0, 20, 12,
      0, 'ENDSEC', 0, 'EOF',
    ]);
    const prepared = prepareDxfImport(text);
    expect(prepared.headerUnits).toBe(1);
    expect(prepared.headerMmPerUnit).toBe(25.4);
    expect(prepared.entityCount).toBe(1);
    expect(prepared.extents).toEqual({ width: 12, height: 12 });
    // Probing must not leave anything in the sketch.
    expect(sketchPaths()).toHaveLength(0);

    // The header says inches, but the user knows the numbers are millimetres.
    const summary = commitDxfImport(prepared, 1);
    expect(summary.imported).toBe(1);
    expect(summary.items[0].bounds.width).toBeCloseTo(12, 9);

    const byHeader = importDxfText(text);
    expect(byHeader.items[0].bounds.width).toBeCloseTo(12 * 25.4, 9);
  });

  it('rejects binary and malformed files', () => {
    expect(() => parseDxf('AutoCAD Binary DXF\r\n')).toThrow(/Binary DXF/);
    expect(() => parseDxf('not\na\ndxf\nfile')).toThrow(/Malformed DXF/);
  });
});
