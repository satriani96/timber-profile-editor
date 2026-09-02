import paper from 'paper';

const POINT_KEYS = ['center', 'startPoint', 'endPoint', 'cornerPoint', 'tangentPoint1', 'tangentPoint2'] as const;

function translateRecord(record: Record<string, unknown>, delta: paper.Point) {
  for (const key of POINT_KEYS) {
    const value = record[key];
    if (value instanceof paper.Point) record[key] = value.add(delta);
  }
  if (Array.isArray(record.fitPoints)) {
    record.fitPoints = record.fitPoints.map((p) => (p instanceof paper.Point ? p.add(delta) : p));
  }
}

/** Keeps DXF export metadata (centers, fillet tangents, fit points) aligned after moving a path. */
export function translatePathData(path: paper.Path, delta: paper.Point): void {
  const data = path.data as Record<string, unknown> | undefined;
  if (!data) return;
  translateRecord(data, delta);
  if (Array.isArray(data.fillets)) {
    for (const fillet of data.fillets) {
      if (fillet && typeof fillet === 'object') translateRecord(fillet as Record<string, unknown>, delta);
    }
  }
}

export function movePath(path: paper.Path, delta: paper.Point): void {
  path.position = path.position.add(delta);
  translatePathData(path, delta);
}

/** Keeps layer/uid when a tool replaces `path.data`. */
export function preserveMeta(path: paper.Path, data: Record<string, unknown>): Record<string, unknown> {
  const layer = path.data?.layer;
  const uid = path.data?.uid;
  if (typeof layer === 'string') data.layer = layer;
  if (typeof uid === 'string') data.uid = uid;
  return data;
}
