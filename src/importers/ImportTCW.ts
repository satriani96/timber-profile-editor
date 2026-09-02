import paper from 'paper';
import { readCompoundFile } from './tcw/cfb';
import { inflateIfNeeded, splitRecords } from './tcw/tcwRecords';
import { classifyRecord, type TcwEntity } from './tcw/tcwGeometry';
import {
  buildCircular,
  commitImport,
  commitPath,
  measureBuilder,
  skip,
  type GeometryBuilder,
  type ImportSummary,
  type PreparedImport,
  type SkipCounter,
} from './prepared';

export class TcwImportError extends Error {}

export interface TcwDocument {
  version: string;
  entities: TcwEntity[];
  skipped: SkipCounter;
}

/**
 * Reads a TurboCAD .tcw drawing: an OLE compound file whose
 * Graphics/ModelSpace stream (gzip-compressed in older versions) holds the
 * model-space entities. Only 2-D lines, polylines, circles, and arcs are
 * imported; dimensions, text, and anything unrecognised are counted.
 */
export async function parseTcw(buffer: ArrayBuffer): Promise<TcwDocument> {
  let streams: Map<string, Uint8Array>;
  try {
    streams = readCompoundFile(buffer).streams;
  } catch (error) {
    throw new TcwImportError(`Not a TurboCAD drawing: ${error instanceof Error ? error.message : String(error)}`);
  }
  const modelSpace = streams.get('Graphics/ModelSpace');
  if (!modelSpace) throw new TcwImportError('No Graphics/ModelSpace stream found — is this a TurboCAD .tcw file?');

  const versionBytes = streams.get('VersionInfo');
  const version = versionBytes
    ? new TextDecoder('latin1').decode(await inflateIfNeeded(versionBytes)).split(/\r?\n/)[1]?.trim() || 'unknown'
    : 'unknown';

  const entities: TcwEntity[] = [];
  const skipped: SkipCounter = {};
  for (const record of splitRecords(await inflateIfNeeded(modelSpace))) {
    const result = classifyRecord(record);
    if ('entity' in result) entities.push(result.entity);
    else if (result.skip !== 'no geometry') skip(skipped, result.skip);
  }
  return { version, entities, skipped };
}

function buildTcwEntities(entities: TcwEntity[], matrix: paper.Matrix, items: paper.Path[], skipped: SkipCounter) {
  for (const entity of entities) {
    switch (entity.type) {
      case 'polyline': {
        const path = new paper.Path({ segments: entity.points, closed: entity.closed });
        if (path.length <= 1e-9) {
          skip(skipped, 'zero-length line');
          break;
        }
        commitPath(path, matrix, items);
        break;
      }
      case 'circle':
        buildCircular(new paper.Point(entity.center), entity.radius, 0, 360, matrix, items);
        break;
      case 'arc':
        buildCircular(new paper.Point(entity.center), entity.radius, entity.startAngle, entity.endAngle, matrix, items);
        break;
    }
  }
}

/**
 * TurboCAD stores model-space coordinates in millimetres regardless of the
 * drawing's display units, so the suggested scale is 1:1; the user can still
 * override it in the confirmation dialog.
 */
export async function prepareTcwImport(buffer: ArrayBuffer): Promise<PreparedImport> {
  const doc = await parseTcw(buffer);
  const build: GeometryBuilder = (matrix, items, skipped) => buildTcwEntities(doc.entities, matrix, items, skipped);
  const { extents, count } = measureBuilder(build);
  return {
    format: 'tcw',
    entityCount: count,
    extents,
    headerMmPerUnit: 1,
    unitsNote: `TurboCAD ${doc.version} drawing; model space is stored in millimetres.`,
    unsupported: doc.skipped,
    build,
  };
}

/** One-step import at 1:1 (or a caller-supplied scale). */
export async function importTcw(buffer: ArrayBuffer, mmPerUnit = 1): Promise<ImportSummary> {
  return commitImport(await prepareTcwImport(buffer), mmPerUnit);
}
