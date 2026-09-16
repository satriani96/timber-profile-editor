import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import paper from 'paper';
import { dwgDatabaseToDxf } from './dwgToDxf';
import { prepareFromDxfDocument, prepareDxfImport } from './ImportDXF';

describe('dwgDatabaseToDxf', () => {
  it('maps LibreDWG radians and the LWPOLYLINE closed flag', () => {
    const doc = dwgDatabaseToDxf({
      header: { INSUNITS: 4 },
      entities: [
        {
          type: 'LINE',
          layer: '0',
          startPoint: { x: 0, y: 0, z: 0 },
          endPoint: { x: 10, y: 0, z: 5 },
        },
        {
          type: 'ARC',
          layer: 'Profile',
          center: { x: 0, y: 0, z: 0 },
          radius: 2,
          startAngle: 0,
          endAngle: Math.PI / 2,
          extrusionDirection: { x: 0, y: 0, z: 1 },
        },
        {
          type: 'LWPOLYLINE',
          layer: '0',
          flag: 512,
          elevation: 0,
          vertices: [
            { x: 0, y: 0, bulge: 0 },
            { x: 12, y: 0, bulge: 0 },
            { x: 12, y: 12, bulge: 0 },
            { x: 0, y: 12, bulge: 0 },
          ],
        },
        { type: 'TEXT', layer: '0' },
      ],
      tables: {
        LAYER: { entries: [{ name: 'Profile', colorIndex: 1 }] },
        BLOCK_RECORD: {
          entries: [
            { name: '*Model_Space', entities: [] },
            {
              name: 'B1',
              basePoint: { x: 0, y: 0, z: 0 },
              entities: [{ type: 'LINE', startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 1, y: 0, z: 0 } }],
            },
          ],
        },
      },
    });

    expect(doc.insUnits).toBe(4);
    expect(doc.unsupported).toEqual({ TEXT: 1 });
    expect(doc.entities).toHaveLength(3);
    const arc = doc.entities.find((e) => e.type === 'ARC');
    expect(arc?.type).toBe('ARC');
    if (arc?.type === 'ARC') {
      expect(arc.startAngle).toBeCloseTo(0);
      expect(arc.endAngle).toBeCloseTo(90);
    }
    const poly = doc.entities.find((e) => e.type === 'POLYLINE');
    expect(poly?.type).toBe('POLYLINE');
    if (poly?.type === 'POLYLINE') expect(poly.closed).toBe(true);
    expect(doc.blocks.B1.entities).toHaveLength(1);
  });
});

const TECH = 'C:\\Users\\joshua.hewetson\\Genia\\Files-Team - Documents\\Quality\\5 Product Specs\\Technical Files';
const PAIR_DXF = `${TECH}\\12 x 12 - DAR - Clear.dxf`;
const PAIR_DWG = `${TECH}\\12 x 12 - DAR - Clear.dwg`;
const MORE_PAIRS = [
  ['12 x 12 - Quad - Clear', `${TECH}\\12 x 12 - Quad - Clear.dxf`, `${TECH}\\12 x 12 - Quad - Clear.dwg`],
  ['17 x 10 - M13 - Clear', `${TECH}\\17 x 10 - M13 - Clear.DXF`, `${TECH}\\17 x 10 - M13 - Clear.dwg`],
  ['140 x 19 - Standard Board', `${TECH}\\140 x 19 - Standard Board.dxf`, `${TECH}\\140 x 19 - Standard Board.dwg`],
] as const;

describe.skipIf(!existsSync(PAIR_DXF))('paired Technical Files DXF', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('imports the DAR DXF as a roughly 12 × 12 profile', () => {
    const prepared = prepareDxfImport(readFileSync(PAIR_DXF, 'utf8'));
    expect(prepared.entityCount).toBeGreaterThan(0);
    expect(prepared.extents).not.toBeNull();
    expect(prepared.extents!.width).toBeGreaterThan(8);
    expect(prepared.extents!.height).toBeGreaterThan(8);
  });
});

describe.skipIf(!existsSync(PAIR_DWG))('paired Technical Files DWG', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  async function preparePair(dxfPath: string, dwgPath: string) {
    const { parseDwg } = await import('./ImportDWG');
    const buf = readFileSync(dwgPath);
    const fromDwg = prepareFromDxfDocument(
      await parseDwg(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
      'dwg'
    );
    const fromDxf = prepareDxfImport(readFileSync(dxfPath, 'utf8'));
    return { fromDwg, fromDxf };
  }

  it('matches the sibling DXF extents after LibreDWG conversion', async () => {
    const { fromDwg, fromDxf } = await preparePair(PAIR_DXF, PAIR_DWG);
    expect(fromDwg.entityCount).toBeGreaterThan(0);
    expect(fromDwg.extents).not.toBeNull();
    expect(fromDxf.extents).not.toBeNull();
    expect(fromDwg.extents!.width).toBeCloseTo(fromDxf.extents!.width, 0);
    expect(fromDwg.extents!.height).toBeCloseTo(fromDxf.extents!.height, 0);
  });

  it.each(MORE_PAIRS.filter(([, dxf, dwg]) => existsSync(dxf) && existsSync(dwg)))(
    'matches DXF extents for %s',
    async (_name, dxfPath, dwgPath) => {
      const { fromDwg, fromDxf } = await preparePair(dxfPath, dwgPath);
      expect(fromDwg.entityCount).toBeGreaterThan(0);
      expect(fromDwg.extents).not.toBeNull();
      expect(fromDxf.extents).not.toBeNull();
      expect(fromDwg.extents!.width).toBeCloseTo(fromDxf.extents!.width, 0);
      expect(fromDwg.extents!.height).toBeCloseTo(fromDxf.extents!.height, 0);
    }
  );
});
