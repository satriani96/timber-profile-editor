import { DEFAULT_EXTRUSION, type DxfBlock, type DxfDocument, type DxfEntity, type DxfLayerInfo, type DxfPoint } from './dxfParser';

/** Structural subset of LibreDWG's DwgDatabase — keeps the mapper testable without WASM. */
export interface DwgLikePoint {
  x?: number;
  y?: number;
  z?: number;
}

export interface DwgLikeEntity {
  type: string;
  layer?: string;
  isInPaperSpace?: boolean;
  extrusionDirection?: DwgLikePoint;
  startPoint?: DwgLikePoint;
  endPoint?: DwgLikePoint;
  center?: DwgLikePoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  vertices?: Array<DwgLikePoint & { bulge?: number; flag?: number }>;
  elevation?: number;
  flag?: number;
  degree?: number;
  knots?: number[];
  controlPoints?: DwgLikePoint[];
  fitPoints?: DwgLikePoint[];
  majorAxisEndPoint?: DwgLikePoint;
  axisRatio?: number;
  name?: string;
  insertionPoint?: DwgLikePoint;
  xScale?: number;
  yScale?: number;
  zScale?: number;
  rotation?: number;
}

export interface DwgLikeBlock {
  name: string;
  basePoint?: DwgLikePoint;
  entities?: DwgLikeEntity[];
}

export interface DwgLikeLayer {
  name: string;
  colorIndex?: number;
}

export interface DwgLikeDatabase {
  header?: { INSUNITS?: number };
  entities?: DwgLikeEntity[];
  tables?: {
    BLOCK_RECORD?: { entries?: DwgLikeBlock[] | Record<string, DwgLikeBlock> };
    LAYER?: { entries?: DwgLikeLayer[] | Record<string, DwgLikeLayer> };
  };
}

const MODEL_SPACE = new Set(['*model_space', '*paper_space', '*paper_space0']);

function tableEntries<T>(table: { entries?: T[] | Record<string, T> } | undefined): T[] {
  if (!table?.entries) return [];
  return Array.isArray(table.entries) ? table.entries : Object.values(table.entries);
}

function point(p?: DwgLikePoint): DxfPoint {
  return { x: p?.x ?? 0, y: p?.y ?? 0, z: p?.z ?? 0 };
}

function extrusionOf(entity: DwgLikeEntity): DxfPoint {
  const e = entity.extrusionDirection;
  if (!e) return { ...DEFAULT_EXTRUSION };
  return point(e);
}

function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

function isPaperSpaceName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('*paper_space');
}

function mapEntity(entity: DwgLikeEntity, unsupported: Record<string, number>): DxfEntity | null {
  if (entity.isInPaperSpace) return null;
  const layer = entity.layer || '0';
  const extrusion = extrusionOf(entity);
  switch (entity.type) {
    case 'LINE':
      return { type: 'LINE', start: point(entity.startPoint), end: point(entity.endPoint), layer, extrusion };
    case 'CIRCLE':
      return { type: 'CIRCLE', center: point(entity.center), radius: entity.radius ?? 0, layer, extrusion };
    case 'ARC':
      return {
        type: 'ARC',
        center: point(entity.center),
        radius: entity.radius ?? 0,
        startAngle: radToDeg(entity.startAngle ?? 0),
        endAngle: radToDeg(entity.endAngle ?? Math.PI * 2),
        layer,
        extrusion,
      };
    case 'LWPOLYLINE': {
      const elevation = entity.elevation ?? 0;
      const closed = ((entity.flag ?? 0) & 512) !== 0;
      return {
        type: 'POLYLINE',
        vertices: (entity.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0, z: elevation, bulge: v.bulge ?? 0 })),
        closed,
        ocs: true,
        layer,
        extrusion,
      };
    }
    case 'POLYLINE':
    case 'POLYLINE2D': {
      const flag = entity.flag ?? 0;
      if (flag & (16 | 64)) {
        unsupported['POLYLINE (mesh)'] = (unsupported['POLYLINE (mesh)'] ?? 0) + 1;
        return null;
      }
      return {
        type: 'POLYLINE',
        vertices: (entity.vertices ?? [])
          .filter((v) => ((v.flag ?? 0) & 16) === 0)
          .map((v) => ({ x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? entity.elevation ?? 0, bulge: v.bulge ?? 0 })),
        closed: (flag & 1) === 1,
        ocs: (flag & 8) === 0,
        layer,
        extrusion,
      };
    }
    case 'POLYLINE3D':
      return {
        type: 'POLYLINE',
        vertices: (entity.vertices ?? []).map((v) => ({ x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0, bulge: 0 })),
        closed: ((entity.flag ?? 0) & 1) === 1,
        ocs: false,
        layer,
        extrusion,
      };
    case 'SPLINE':
      return {
        type: 'SPLINE',
        degree: entity.degree ?? 3,
        closed: ((entity.flag ?? 0) & 1) === 1,
        controlPoints: (entity.controlPoints ?? []).map(point),
        fitPoints: (entity.fitPoints ?? []).map(point),
        knots: entity.knots ?? [],
        layer,
        extrusion,
      };
    case 'ELLIPSE':
      return {
        type: 'ELLIPSE',
        center: point(entity.center),
        majorAxis: point(entity.majorAxisEndPoint),
        ratio: entity.axisRatio ?? 1,
        startParam: entity.startAngle ?? 0,
        endParam: entity.endAngle ?? Math.PI * 2,
        layer,
        extrusion,
      };
    case 'INSERT':
      return {
        type: 'INSERT',
        name: entity.name ?? '',
        position: point(entity.insertionPoint),
        scale: { x: entity.xScale ?? 1, y: entity.yScale ?? 1, z: entity.zScale ?? 1 },
        rotation: radToDeg(entity.rotation ?? 0),
        layer,
        extrusion,
      };
    default:
      unsupported[entity.type] = (unsupported[entity.type] ?? 0) + 1;
      return null;
  }
}

function mapEntities(entities: DwgLikeEntity[] | undefined, unsupported: Record<string, number>): DxfEntity[] {
  const out: DxfEntity[] = [];
  for (const entity of entities ?? []) {
    const mapped = mapEntity(entity, unsupported);
    if (mapped) out.push(mapped);
  }
  return out;
}

export function dwgDatabaseToDxf(db: DwgLikeDatabase): DxfDocument {
  const unsupported: Record<string, number> = {};
  const blocks: Record<string, DxfBlock> = {};
  for (const entry of tableEntries(db.tables?.BLOCK_RECORD)) {
    if (!entry.name || MODEL_SPACE.has(entry.name.toLowerCase()) || isPaperSpaceName(entry.name)) continue;
    blocks[entry.name] = {
      name: entry.name,
      base: point(entry.basePoint),
      entities: mapEntities(entry.entities, unsupported),
    };
  }
  const layers: DxfLayerInfo[] = tableEntries(db.tables?.LAYER).map((layer) => ({
    name: layer.name || '0',
    colorIndex: Math.round(Math.abs(layer.colorIndex ?? 7) || 7),
  }));
  return {
    entities: mapEntities(db.entities, unsupported),
    blocks,
    insUnits: db.header?.INSUNITS ?? 0,
    unsupported,
    layers,
  };
}
