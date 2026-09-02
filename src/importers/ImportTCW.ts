import paper from 'paper';
import { readCompoundFile } from './tcw/cfb';
import { inflateIfNeeded, splitRecords } from './tcw/tcwRecords';
import { classifyRecord, type TcwEntity } from './tcw/tcwGeometry';
import { bsplineToSegments, clampedUniformKnots } from './splineConversion';
import {
  buildCircular,
  buildEllipticArc,
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
 * model-space entities. 2-D lines, polylines, splines, circles, arcs, and
 * elliptical arcs are imported; dimensions, text, and anything unrecognised
 * are counted.
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
      case 'spline': {
        // TurboCAD stores the control points of a clamped uniform cubic B-spline (verified
        // against its own DXF export); convert them to exact Bézier segments.
        const control = entity.points.map(([x, y]) => ({ x, y }));
        const degree = Math.min(3, control.length - 1);
        const segments = bsplineToSegments(control, degree, clampedUniformKnots(control.length, degree));
        if (!segments) {
          skip(skipped, 'spline (unsupported control net)');
          break;
        }
        const path = new paper.Path({ segments });
        path.data = { isSpline: true };
        commitPath(path, matrix, items);
        break;
      }
      case 'circle':
        buildCircular(new paper.Point(entity.center), entity.radius, 0, 360, matrix, items);
        break;
      case 'arc':
        buildCircular(new paper.Point(entity.center), entity.radius, entity.startAngle, entity.endAngle, matrix, items);
        break;
      case 'ellipticArc':
        buildEllipticArc(
          new paper.Point(entity.center),
          entity.a,
          entity.b,
          entity.rotation,
          entity.startParam,
          entity.endParam,
          matrix,
          items
        );
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
