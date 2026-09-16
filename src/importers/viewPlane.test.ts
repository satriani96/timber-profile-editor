import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import paper from 'paper';
import { parseDxf } from './dxfParser';
import { importDxfText, prepareDxfImport } from './ImportDXF';
import { detectViewPlane, flattenDxfDocument, ocsToWcs } from './viewPlane';

function dxf(lines: (string | number)[]): string {
  return lines.join('\n') + '\n';
}

/** 100 × 40 rectangle in the XZ plane (Y = 0), plus a semicircle with extrusion (0, −1, 0). */
function xzProfileDxf(): string {
  return dxf([
    0, 'SECTION', 2, 'HEADER', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC',
    0, 'SECTION', 2, 'ENTITIES',
    0, 'LINE', 10, 0, 20, 0, 30, 0, 11, 100, 21, 0, 31, 0,
    0, 'LINE', 10, 100, 20, 0, 30, 0, 11, 100, 21, 0, 31, 40,
    0, 'LINE', 10, 100, 20, 0, 30, 40, 11, 0, 21, 0, 31, 40,
    0, 'LINE', 10, 0, 20, 0, 30, 40, 11, 0, 21, 0, 31, 0,
    0, 'ARC',
    10, 50, 20, 20, 30, 0,
    40, 20,
    50, 0,
    51, 180,
    210, 0, 220, -1, 230, 0,
    0, 'ENDSEC', 0, 'EOF',
  ]);
}

describe('OCS and view-plane detection', () => {
  it('maps OCS through an extrusion of (0, −1, 0) onto XZ', () => {
    const wcs = ocsToWcs({ x: 50, y: 20, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(wcs.x).toBeCloseTo(50);
    expect(wcs.y).toBeCloseTo(0);
    expect(wcs.z).toBeCloseTo(20);
  });

  it('picks XZ when Y has no extent', () => {
    expect(
      detectViewPlane([
        { x: 0, y: 32.6, z: 0 },
        { x: 100, y: 32.6, z: 40 },
      ])
    ).toBe('xz');
  });

  it('keeps XY for a normal top-view drawing', () => {
    expect(
      detectViewPlane([
        { x: 0, y: 0, z: 0 },
        { x: 12, y: 12, z: 0 },
      ])
    ).toBe('xy');
  });
});

describe('DXF flatten onto the profile plane', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('turns an XZ-plane drawing into a visible 100 × 40 profile', () => {
    const raw = parseDxf(xzProfileDxf());
    const line = raw.entities.find((e) => e.type === 'LINE' && e.start.x === 100 && e.end.x === 100);
    expect(line?.type).toBe('LINE');
    if (line?.type === 'LINE') {
      expect(line.start.y).toBe(0);
      expect(line.start.z).toBe(0);
      expect(line.end.z).toBe(40);
    }

    const prepared = prepareDxfImport(xzProfileDxf());
    expect(prepared.viewPlane).toBe('xz');
    expect(prepared.extents?.width).toBeCloseTo(100);
    expect(prepared.extents?.height).toBeCloseTo(40);
    expect(prepared.entityCount).toBe(5);

    const summary = importDxfText(xzProfileDxf(), 1);
    expect(summary.imported).toBe(5);
    const bounds = summary.items.reduce((acc, item) => acc.unite(item.bounds), summary.items[0].bounds.clone());
    expect(bounds.width).toBeCloseTo(100);
    expect(bounds.height).toBeCloseTo(40);
  });

  it('lets the caller force the top view even when the file is XZ', () => {
    const prepared = prepareDxfImport(xzProfileDxf(), 'xy');
    expect(prepared.viewPlane).toBe('xy');
    expect(prepared.extents?.height ?? 0).toBeLessThan(1);
  });

  it('preserves bulge after projecting an XY polyline', () => {
    const { doc } = flattenDxfDocument(
      parseDxf(
        dxf([
          0, 'SECTION', 2, 'ENTITIES',
          0, 'LWPOLYLINE', 90, 3, 70, 0, 10, 0, 20, 0, 10, 1, 20, 0, 42, 1, 10, 1, 20, 1,
          0, 'ENDSEC', 0, 'EOF',
        ])
      )
    );
    const poly = doc.entities[0];
    expect(poly.type).toBe('POLYLINE');
    if (poly.type === 'POLYLINE') expect(poly.vertices[1].bulge).toBeCloseTo(1);
  });
});

const GC06 = 'C:\\Users\\joshua.hewetson\\Downloads\\GC06.dxf';
const GC25 = 'C:\\Users\\joshua.hewetson\\Downloads\\GC25.dxf';

describe.skipIf(!existsSync(GC06) || !existsSync(GC25))('SolidWorks-style XZ DXF samples', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it.each([
    ['GC06', GC06],
    ['GC25', GC25],
  ])('imports %s as a front-view profile, not an edge-on line', (_name, path) => {
    const prepared = prepareDxfImport(readFileSync(path, 'utf8'));
    expect(prepared.viewPlane).toBe('xz');
    expect(prepared.extents).not.toBeNull();
    expect(prepared.extents!.width).toBeGreaterThan(20);
    expect(prepared.extents!.height).toBeGreaterThan(10);
    expect(prepared.entityCount).toBeGreaterThan(10);
  });
});
