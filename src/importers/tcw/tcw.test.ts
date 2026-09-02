import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import paper from 'paper';
import { readCompoundFile } from './cfb';
import { inflateIfNeeded, isGzip, splitRecords } from './tcwRecords';
import { classifyRecord, type TcwEntity } from './tcwGeometry';
import { importTcw, parseTcw, prepareTcwImport } from '../ImportTCW';
import { importDxfText } from '../ImportDXF';

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
  const buf = readFileSync(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const DOWEL = '16x16-dowel-tc2017.tcw';
const M13 = '17x10-m13-tc2017.tcw';
const D4_RADIUS = '18x18-d4-2mm-radius-tc18-gzip.tcw';
const D4 = '18x18-d4-tc2015.tcw';

function ofType<T extends TcwEntity['type']>(entities: TcwEntity[], type: T) {
  return entities.filter((e): e is Extract<TcwEntity, { type: T }> => e.type === type);
}

describe('compound file reader', () => {
  it('lists TurboCAD streams and reads their sizes', () => {
    const { streams } = readCompoundFile(fixture(DOWEL));
    expect(streams.get('Graphics/ModelSpace')?.length).toBe(3130);
    expect(streams.get('VersionInfo')?.length).toBe(69);
    expect(streams.has('Styles/Layers')).toBe(true);
    expect(new TextDecoder('latin1').decode(streams.get('VersionInfo'))).toContain('TurboCAD 2017');
  });

  it('rejects non-OLE input', () => {
    expect(() => readCompoundFile(new TextEncoder().encode('0\nSECTION\n').buffer as ArrayBuffer)).toThrow(/OLE/);
  });

  it('inflates gzip-compressed streams from older versions', async () => {
    const { streams } = readCompoundFile(fixture(D4_RADIUS));
    const raw = streams.get('Graphics/ModelSpace')!;
    expect(isGzip(raw)).toBe(true);
    const inflated = await inflateIfNeeded(raw);
    expect(inflated.length).toBe(9666);
    expect(splitRecords(inflated).length).toBeGreaterThan(8);
  });
});

describe('TurboCAD model space decoding', () => {
  it('reads a 16 mm dowel as a circle of radius 8 at the origin', async () => {
    const doc = await parseTcw(fixture(DOWEL));
    expect(doc.version).toBe('24.0.62.2');
    expect(doc.entities).toHaveLength(1);
    const [circle] = ofType(doc.entities, 'circle');
    expect(circle.center[0]).toBeCloseTo(0, 9);
    expect(circle.center[1]).toBeCloseTo(0, 9);
    expect(circle.radius).toBeCloseTo(8, 9);
    expect(doc.skipped).toEqual({ 'dimension/text': 1 });
  });

  it('reads an M13 moulding as three lines and three arcs spanning 17 x 10 mm', async () => {
    const doc = await parseTcw(fixture(M13));
    const lines = ofType(doc.entities, 'polyline');
    const arcs = ofType(doc.entities, 'arc');
    expect(lines).toHaveLength(3);
    expect(arcs).toHaveLength(3);

    const base = lines.find((l) => Math.abs(l.points[0][1] - l.points[1][1]) < 1e-9)!;
    expect(Math.abs(base.points[1][0] - base.points[0][0])).toBeCloseTo(17, 6);

    const crown = arcs.reduce((a, b) => (a.center[1] > b.center[1] ? a : b));
    // Crown arc runs counter-clockwise over the top: start near 9.5°, end near 170.5°.
    expect(crown.startAngle).toBeCloseTo(9.47, 1);
    expect(crown.endAngle).toBeCloseTo(170.53, 1);
    const top = crown.center[1] + crown.radius;
    expect(top - base.points[0][1]).toBeCloseTo(10, 1);
  });

  it('reads a 2 mm radiused D4 (TurboCAD 18, gzip) as four lines and four quarter arcs', async () => {
    const doc = await parseTcw(fixture(D4_RADIUS));
    const lines = ofType(doc.entities, 'polyline');
    const arcs = ofType(doc.entities, 'arc');
    expect(lines).toHaveLength(4);
    expect(arcs).toHaveLength(4);
    for (const line of lines) {
      const length = Math.hypot(line.points[1][0] - line.points[0][0], line.points[1][1] - line.points[0][1]);
      expect(length).toBeCloseTo(14, 9);
    }
    const centers = arcs.map((a) => a.center.map((v) => Math.round(v)).join(',')).sort();
    expect(centers).toEqual(['16,-16', '16,-2', '2,-16', '2,-2']);
    for (const arc of arcs) {
      expect(arc.radius).toBeCloseTo(2, 9);
      expect(((arc.endAngle - arc.startAngle) % 360 + 360) % 360).toBeCloseTo(90, 6);
    }
    // The zero-length line TurboCAD left behind is reported, not imported.
    expect(doc.skipped.degenerate).toBe(1);
  });

  it('reads a plain D4 (TurboCAD 2015, no tool names) as a closed 18 x 18 polyline', async () => {
    const doc = await parseTcw(fixture(D4));
    expect(doc.version).toBe('22.2.90.0');
    expect(doc.entities).toHaveLength(1);
    const [rect] = ofType(doc.entities, 'polyline');
    expect(rect.closed).toBe(true);
    expect(rect.points).toHaveLength(4);
    const xs = rect.points.map((p) => p[0]);
    const ys = rect.points.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(18, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(18, 9);
    expect(doc.skipped).toEqual({ dimension: 2 });
  });

  it('classifies a line record with a leading reference point as a two-point line', () => {
    const result = classifyRecord({
      id: 1,
      indexed: false,
      vertexFlags: [0xf3],
      tools: ['CMD_LINE@'],
      points: [
        [5, 5],
        [0, 0],
        [10, 10],
      ],
    });
    expect(result).toEqual({ entity: { type: 'polyline', points: [[0, 0], [10, 10]], closed: false } });
  });
});

describe('TurboCAD splines and elliptical arcs', () => {
  const C375 = '65x15-c375-spline-ellipse-tc2017.tcw';

  it('reads the C375 cove as a fit-point spline joined to an elliptical arc', async () => {
    const doc = await parseTcw(fixture(C375));
    const splines = ofType(doc.entities, 'spline');
    const ellipses = ofType(doc.entities, 'ellipticArc');
    const lines = ofType(doc.entities, 'polyline');
    expect(splines).toHaveLength(1);
    expect(ellipses).toHaveLength(1);
    expect(lines).toHaveLength(9);
    expect(doc.skipped).toEqual({ 'dimension/text': 4 });

    const spline = splines[0];
    expect(spline.points).toHaveLength(22);
    expect(spline.points[0][0]).toBeCloseTo(15.91177, 4);
    expect(spline.points[21][0]).toBeCloseTo(-18.07608, 4);

    const ellipse = ellipses[0];
    expect(ellipse.center[0]).toBeCloseTo(-23.91491, 4);
    expect(ellipse.center[1]).toBeCloseTo(15.927, 3);
    expect(ellipse.a).toBeCloseTo(7.4086, 3);
    expect(ellipse.b).toBeCloseTo(6.8801, 3);
    // Major axis is vertical; the arc sweeps counter-clockwise over the top from the spline's end.
    expect(Math.abs(Math.sin((ellipse.rotation * Math.PI) / 180))).toBeCloseTo(1, 6);
    const sweep = ((ellipse.endParam - ellipse.startParam) % 360 + 360) % 360;
    expect(sweep).toBeGreaterThan(90);
    expect(sweep).toBeLessThan(180);
  });

  it('matches TurboCAD\'s own DXF export of the same drawing', async () => {
    paper.setup(new paper.Size(800, 600));
    const fromTcw = await importTcw(fixture(C375));
    const dxfText = new TextDecoder('latin1').decode(fixture('65x15-c375-turbocad-export.dxf'));
    // TurboCAD writes $INSUNITS = 1 (inches) but the numbers are millimetres; import 1:1.
    const fromDxf = importDxfText(dxfText, 1);
    expect(fromTcw.imported).toBe(11);
    expect(fromDxf.imported).toBe(11);

    const tcwSpline = fromTcw.items.find((p) => p.data?.isSpline)!;
    const dxfSpline = fromDxf.items.find((p) => p.data?.isSpline)!;
    expect(tcwSpline.segments).toHaveLength(dxfSpline.segments.length);
    tcwSpline.segments.forEach((seg, i) => {
      const ref = dxfSpline.segments[i];
      expect(seg.point.getDistance(ref.point)).toBeLessThan(1e-6);
      expect(seg.handleIn.getDistance(ref.handleIn)).toBeLessThan(1e-6);
      expect(seg.handleOut.getDistance(ref.handleOut)).toBeLessThan(1e-6);
    });

    // The elliptical arc must coincide with the DXF ELLIPSE entity along its whole length.
    const tcwEllipse = fromTcw.items.find((p) => !p.data?.isSpline && p.hasHandles() && !p.data?.isArc)!;
    const dxfEllipse = fromDxf.items.find((p) => !p.data?.isSpline && p.hasHandles() && !p.data?.isArc)!;
    expect(tcwEllipse.length).toBeCloseTo(dxfEllipse.length, 5);
    for (let t = 0; t <= 1; t += 0.1) {
      const p = tcwEllipse.getPointAt(tcwEllipse.length * t)!;
      expect(dxfEllipse.getNearestLocation(p)!.distance).toBeLessThan(1e-5);
    }
  });

  it('builds the spline from control points and the ellipse as a true elliptical arc', async () => {
    paper.setup(new paper.Size(800, 600));
    const summary = await importTcw(fixture(C375));
    expect(summary.imported).toBe(11);

    const spline = summary.items.find((p) => p.data?.isSpline)!;
    // 22 control points, cubic: 19 spans -> 20 Bézier knots.
    expect(spline.segments).toHaveLength(20);
    expect(spline.hasHandles()).toBe(true);
    // A clamped B-spline starts and ends on its first and last control points.
    expect(spline.firstSegment.point.x).toBeCloseTo(15.91177, 4);
    expect(spline.firstSegment.point.y).toBeCloseTo(-19.25954, 4); // Y flipped into sketch space
    expect(spline.lastSegment.point.x).toBeCloseTo(-18.07608, 4);
    // Interior control points are not on the curve.
    expect(spline.getNearestLocation(new paper.Point(11.32788, -22.88164))!.distance).toBeGreaterThan(0.05);

    const ellipse = summary.items.find((p) => !p.data?.isSpline && p.hasHandles() && !p.data?.isArc)!;
    expect(ellipse).toBeDefined();
    // Endpoints coincide with the spline's end and the neighbouring line's end.
    const ends = [ellipse.firstSegment.point, ellipse.lastSegment.point].map((p) => [p.x, p.y]);
    expect(ends).toEqual(
      expect.arrayContaining([
        [expect.closeTo(-18.07608, 3), expect.closeTo(-19.8457, 3)],
        [expect.closeTo(-29.98112, 3), expect.closeTo(-19.42234, 3)],
      ])
    );
    // Every point on the arc satisfies the ellipse equation (a = 7.4086 vertical, b = 6.8801 horizontal).
    for (let t = 0; t <= 1; t += 0.1) {
      const p = ellipse.getPointAt(ellipse.length * t)!;
      const u = (p.x + 23.91491) / 6.8801;
      const v = (-p.y - 15.927) / 7.4086;
      expect(u * u + v * v).toBeCloseTo(1, 3);
    }
  });
});

describe('TCW import into Paper', () => {
  beforeEach(() => paper.setup(new paper.Size(800, 600)));

  it('prepares at 1:1 with mm extents and builds true arcs and circles', async () => {
    const prepared = await prepareTcwImport(fixture(D4_RADIUS));
    expect(prepared.format).toBe('tcw');
    expect(prepared.headerMmPerUnit).toBe(1);
    expect(prepared.entityCount).toBe(8);
    expect(prepared.extents!.width).toBeCloseTo(18, 6);
    expect(prepared.extents!.height).toBeCloseTo(18, 6);
    expect(paper.project.activeLayer.children).toHaveLength(0);

    const summary = await importTcw(fixture(D4_RADIUS));
    expect(summary.imported).toBe(8);
    const arcs = summary.items.filter((p) => p.data?.isArc);
    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      expect(arc.data.radius).toBeCloseTo(2, 9);
      expect(arc.length).toBeCloseTo(Math.PI, 2);
    }

    const dowel = await importTcw(fixture(DOWEL));
    expect(dowel.items[0].data).toMatchObject({ isArc: false, radius: 8 });
    expect(dowel.items[0].closed).toBe(true);
  });

  it('rejects files that are not TurboCAD drawings', async () => {
    await expect(parseTcw(new TextEncoder().encode('hello').buffer as ArrayBuffer)).rejects.toThrow(/Not a TurboCAD/);
  });
});
