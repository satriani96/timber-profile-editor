export interface DxfPoint {
  x: number;
  y: number;
}

export interface DxfVertex extends DxfPoint {
  /** tan(θ/4) of the arc to the next vertex; 0 for a straight segment. */
  bulge: number;
}

type WithLayer<T> = T & { layer: string };

export type DxfEntity = WithLayer<
  | { type: 'LINE'; start: DxfPoint; end: DxfPoint }
  | { type: 'CIRCLE'; center: DxfPoint; radius: number }
  | { type: 'ARC'; center: DxfPoint; radius: number; startAngle: number; endAngle: number }
  | { type: 'POLYLINE'; vertices: DxfVertex[]; closed: boolean }
  | {
      type: 'SPLINE';
      degree: number;
      closed: boolean;
      controlPoints: DxfPoint[];
      fitPoints: DxfPoint[];
      knots: number[];
    }
  | { type: 'ELLIPSE'; center: DxfPoint; majorAxis: DxfPoint; ratio: number; startParam: number; endParam: number }
  | { type: 'INSERT'; name: string; position: DxfPoint; scale: DxfPoint; rotation: number }
>;

export interface DxfLayerInfo {
  name: string;
  colorIndex: number;
}

export interface DxfBlock {
  name: string;
  base: DxfPoint;
  entities: DxfEntity[];
}

export interface DxfDocument {
  entities: DxfEntity[];
  blocks: Record<string, DxfBlock>;
  /** $INSUNITS header value (0 = unitless, 1 = inches, 4 = millimetres, ...). */
  insUnits: number;
  /** Entity types encountered that the importer does not understand, with counts. */
  unsupported: Record<string, number>;
  layers: DxfLayerInfo[];
}

interface Pair {
  code: number;
  value: string;
}

export class DxfParseError extends Error {}

function tokenize(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeText = lines[i].trim();
    if (codeText === '') continue;
    const code = Number(codeText);
    if (!Number.isInteger(code)) {
      throw new DxfParseError(`Malformed DXF: expected a group code at line ${i + 1}, found "${codeText}".`);
    }
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

/** Splits the flat pair stream into entity records, each starting at a `0` group code. */
function splitRecords(pairs: Pair[]): Pair[][] {
  const records: Pair[][] = [];
  let current: Pair[] | null = null;
  for (const pair of pairs) {
    if (pair.code === 0) {
      if (current) records.push(current);
      current = [pair];
    } else if (current) {
      current.push(pair);
    }
  }
  if (current) records.push(current);
  return records;
}

const num = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

function firstValue(record: Pair[], code: number, fallback: string): string {
  const pair = record.find((p, i) => i > 0 && p.code === code);
  return pair ? pair.value : fallback;
}

function pointAt(record: Pair[], xCode: number, yCode: number): DxfPoint {
  return { x: num(firstValue(record, xCode, '0')), y: num(firstValue(record, yCode, '0')) };
}

function recordLayer(record: Pair[]): string {
  return firstValue(record, 8, '0');
}

function parseLwPolyline(record: Pair[]): DxfEntity {
  const vertices: DxfVertex[] = [];
  let closed = false;
  for (const pair of record) {
    switch (pair.code) {
      case 70:
        closed = (num(pair.value) & 1) === 1;
        break;
      case 10:
        vertices.push({ x: num(pair.value), y: 0, bulge: 0 });
        break;
      case 20:
        if (vertices.length) vertices[vertices.length - 1].y = num(pair.value);
        break;
      case 42:
        if (vertices.length) vertices[vertices.length - 1].bulge = num(pair.value);
        break;
    }
  }
  return { type: 'POLYLINE', vertices, closed, layer: recordLayer(record) };
}

function parseSpline(record: Pair[]): DxfEntity {
  const controlPoints: DxfPoint[] = [];
  const fitPoints: DxfPoint[] = [];
  const knots: number[] = [];
  let degree = 3;
  let closed = false;
  for (const pair of record) {
    switch (pair.code) {
      case 70:
        closed = (num(pair.value) & 1) === 1;
        break;
      case 71:
        degree = Math.max(1, Math.round(num(pair.value)));
        break;
      case 40:
        knots.push(num(pair.value));
        break;
      case 10:
        controlPoints.push({ x: num(pair.value), y: 0 });
        break;
      case 20:
        if (controlPoints.length) controlPoints[controlPoints.length - 1].y = num(pair.value);
        break;
      case 11:
        fitPoints.push({ x: num(pair.value), y: 0 });
        break;
      case 21:
        if (fitPoints.length) fitPoints[fitPoints.length - 1].y = num(pair.value);
        break;
    }
  }
  return { type: 'SPLINE', degree, closed, controlPoints, fitPoints, knots, layer: recordLayer(record) };
}

/**
 * Converts a sequence of records into entities. Legacy POLYLINE/VERTEX/SEQEND
 * groups are folded into a single POLYLINE entity.
 */
function parseEntities(records: Pair[][], unsupported: Record<string, number>): DxfEntity[] {
  const entities: DxfEntity[] = [];
  let pendingPolyline: { vertices: DxfVertex[]; closed: boolean; layer: string } | null = null;
  let skippingMeshVertices = false;

  for (const record of records) {
    const type = record[0].value.toUpperCase();

    if (skippingMeshVertices) {
      if (type === 'VERTEX') continue;
      skippingMeshVertices = false;
      if (type === 'SEQEND') continue;
    }

    if (pendingPolyline) {
      if (type === 'VERTEX') {
        const flags = num(firstValue(record, 70, '0'));
        // Bit 16 marks spline-frame control points, which are not part of the drawn curve.
        if ((flags & 16) === 0) {
          const p = pointAt(record, 10, 20);
          pendingPolyline.vertices.push({ ...p, bulge: num(firstValue(record, 42, '0')) });
        }
        continue;
      }
      entities.push({ type: 'POLYLINE', ...pendingPolyline });
      pendingPolyline = null;
      if (type === 'SEQEND') continue;
    }

    const layer = recordLayer(record);
    switch (type) {
      case 'LINE':
        entities.push({ type: 'LINE', start: pointAt(record, 10, 20), end: pointAt(record, 11, 21), layer });
        break;
      case 'CIRCLE':
        entities.push({ type: 'CIRCLE', center: pointAt(record, 10, 20), radius: num(firstValue(record, 40, '0')), layer });
        break;
      case 'ARC':
        entities.push({
          type: 'ARC',
          center: pointAt(record, 10, 20),
          radius: num(firstValue(record, 40, '0')),
          startAngle: num(firstValue(record, 50, '0')),
          endAngle: num(firstValue(record, 51, '360')),
          layer,
        });
        break;
      case 'LWPOLYLINE':
        entities.push(parseLwPolyline(record));
        break;
      case 'POLYLINE': {
        const flags = num(firstValue(record, 70, '0'));
        // Bits 16/64 are polygon/polyface meshes; they carry no 2D profile geometry.
        if (flags & (16 | 64)) {
          unsupported['POLYLINE (mesh)'] = (unsupported['POLYLINE (mesh)'] ?? 0) + 1;
          skippingMeshVertices = true;
          break;
        }
        pendingPolyline = { vertices: [], closed: (flags & 1) === 1, layer };
        break;
      }
      case 'SPLINE':
        entities.push(parseSpline(record));
        break;
      case 'ELLIPSE':
        entities.push({
          type: 'ELLIPSE',
          center: pointAt(record, 10, 20),
          majorAxis: pointAt(record, 11, 21),
          ratio: num(firstValue(record, 40, '1')),
          startParam: num(firstValue(record, 41, '0')),
          endParam: num(firstValue(record, 42, String(Math.PI * 2))),
          layer,
        });
        break;
      case 'INSERT':
        entities.push({
          type: 'INSERT',
          name: firstValue(record, 2, ''),
          position: pointAt(record, 10, 20),
          scale: { x: num(firstValue(record, 41, '1')), y: num(firstValue(record, 42, '1')) },
          rotation: num(firstValue(record, 50, '0')),
          layer,
        });
        break;
      case 'VERTEX':
      case 'SEQEND':
      case 'ENDBLK':
      case 'BLOCK':
        break;
      default:
        unsupported[type] = (unsupported[type] ?? 0) + 1;
    }
  }
  if (pendingPolyline) entities.push({ type: 'POLYLINE', ...pendingPolyline });
  return entities;
}

function parseBlocks(records: Pair[][], unsupported: Record<string, number>): Record<string, DxfBlock> {
  const blocks: Record<string, DxfBlock> = {};
  let i = 0;
  while (i < records.length) {
    const record = records[i];
    if (record[0].value.toUpperCase() !== 'BLOCK') {
      i++;
      continue;
    }
    const name = firstValue(record, 2, '');
    const base = pointAt(record, 10, 20);
    const body: Pair[][] = [];
    i++;
    while (i < records.length && records[i][0].value.toUpperCase() !== 'ENDBLK') {
      body.push(records[i]);
      i++;
    }
    blocks[name] = { name, base, entities: parseEntities(body, unsupported) };
    i++;
  }
  return blocks;
}

function parseLayerTable(records: Pair[][]): DxfLayerInfo[] {
  const layers: DxfLayerInfo[] = [];
  for (const record of records) {
    if (record[0].value.toUpperCase() !== 'LAYER') continue;
    layers.push({
      name: firstValue(record, 2, '0'),
      colorIndex: Math.round(num(firstValue(record, 62, '7'))),
    });
  }
  return layers;
}

/**
 * Parses an ASCII DXF file. Supports LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE,
 * SPLINE, ELLIPSE, and INSERT (block references). Other entity types are
 * counted in `unsupported` so the caller can report them.
 */
export function parseDxf(text: string): DxfDocument {
  if (text.startsWith('AutoCAD Binary DXF')) {
    throw new DxfParseError('Binary DXF files are not supported. Save the file as ASCII DXF and try again.');
  }
  const pairs = tokenize(text);
  if (pairs.length === 0) throw new DxfParseError('The file does not contain any DXF data.');

  const unsupported: Record<string, number> = {};
  let insUnits = 0;
  let entities: DxfEntity[] = [];
  let blocks: Record<string, DxfBlock> = {};
  let layers: DxfLayerInfo[] = [];
  let sawEntities = false;

  let i = 0;
  while (i < pairs.length) {
    const pair = pairs[i];
    if (pair.code === 0 && pair.value.toUpperCase() === 'SECTION' && i + 1 < pairs.length) {
      const name = pairs[i + 1].value.toUpperCase();
      let end = i + 2;
      while (end < pairs.length && !(pairs[end].code === 0 && pairs[end].value.toUpperCase() === 'ENDSEC')) end++;
      const body = pairs.slice(i + 2, end);

      if (name === 'HEADER') {
        const idx = body.findIndex((p) => p.code === 9 && p.value.toUpperCase() === '$INSUNITS');
        if (idx >= 0 && idx + 1 < body.length && body[idx + 1].code === 70) insUnits = num(body[idx + 1].value);
      } else if (name === 'TABLES') {
        layers = parseLayerTable(splitRecords(body));
      } else if (name === 'BLOCKS') {
        blocks = parseBlocks(splitRecords(body), unsupported);
      } else if (name === 'ENTITIES') {
        sawEntities = true;
        entities = parseEntities(splitRecords(body), unsupported);
      }
      i = end + 1;
      continue;
    }
    i++;
  }

  if (!sawEntities) {
    // Some minimal exporters omit SECTION wrappers and list entities directly.
    entities = parseEntities(
      splitRecords(pairs).filter((r) => !['SECTION', 'ENDSEC', 'EOF'].includes(r[0].value.toUpperCase())),
      unsupported
    );
  }

  return { entities, blocks, insUnits, unsupported, layers };
}

/** Millimetres per drawing unit for a $INSUNITS value; unknown/unitless files are assumed to be in mm. */
export function millimetresPerUnit(insUnits: number): number {
  switch (insUnits) {
    case 1:
      return 25.4;
    case 2:
      return 304.8;
    case 3:
      return 1609344;
    case 5:
      return 10;
    case 6:
      return 1000;
    case 8:
      return 0.0254;
    case 9:
      return 0.0000254;
    case 10:
      return 914.4;
    case 13:
      return 0.001;
    case 14:
      return 100;
    default:
      return 1;
  }
}
