/**
 * Low-level access to TurboCAD's Graphics/ModelSpace stream. The stream is a
 * sequence of tagged records; the tags that matter for geometry are:
 *   35 00 <u32>            entity id (record anchor)
 *   54 00 <f64 x> <f64 y>  2-D point
 *   36 00 <u32>            vertex id, precedes each vertex point
 *   "CMD_xxx@"             ASCII name of the tool that created the entity
 * Everything else (property trees, styles) is skipped.
 */

export interface TcwRecord {
  id: number;
  points: [number, number][];
  /** True when the points were preceded by vertex ids (reference points excluded). */
  indexed: boolean;
  tools: string[];
}

const GZIP_MAGIC = [0x1f, 0x8b];

export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

/** Older TurboCAD versions gzip each stream. */
export async function inflateIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isGzip(bytes)) return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function isAnchor(b: Uint8Array, i: number): boolean {
  if (b[i] !== 0x35 || b[i + 1] !== 0x00) return false;
  const t0 = b[i + 6];
  const t1 = b[i + 7];
  return (t0 === 0x21 && t1 === 0x01) || (t0 === 0xfe && t1 === 0x00);
}

/** Splits the stream into entity records at each entity-id anchor. */
export function splitRecords(bytes: Uint8Array): TcwRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const anchors: number[] = [];
  for (let i = 0; i + 8 <= bytes.length; i++) if (isAnchor(bytes, i)) anchors.push(i);

  return anchors.map((start, k) => {
    const end = k + 1 < anchors.length ? anchors[k + 1] : bytes.length;
    const id = view.getUint32(start + 2, true);
    return { id, ...tokenize(bytes, view, start + 6, end) };
  });
}

function tokenize(b: Uint8Array, view: DataView, start: number, end: number) {
  const before: [number, number][] = [];
  const after: [number, number][] = [];
  let seenVertexId = false;
  let i = start;
  while (i + 1 < end) {
    const tag = b[i] | (b[i + 1] << 8);
    if (tag === 0x54 && i + 18 <= end) {
      const x = view.getFloat64(i + 2, true);
      const y = view.getFloat64(i + 10, true);
      if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e7 && Math.abs(y) < 1e7) {
        (seenVertexId ? after : before).push([x, y]);
        i += 18;
        continue;
      }
    }
    if (tag === 0x36 && i + 6 <= end) {
      seenVertexId = true;
      i += 6;
      continue;
    }
    i++;
  }
  return {
    points: after.length ? after : before,
    indexed: after.length > 0,
    tools: findToolNames(b, start, end),
  };
}

function findToolNames(b: Uint8Array, start: number, end: number): string[] {
  const tools: string[] = [];
  for (let i = start; i + 4 < end; i++) {
    if (b[i] === 0x43 && b[i + 1] === 0x4d && b[i + 2] === 0x44 && b[i + 3] === 0x5f) {
      let j = i + 4;
      let name = 'CMD_';
      while (j < end && j - i < 64) {
        const c = b[j];
        const ok = (c >= 0x41 && c <= 0x5a) || (c >= 0x30 && c <= 0x39) || c === 0x5f;
        if (!ok) break;
        name += String.fromCharCode(c);
        j++;
      }
      if (b[j] === 0x40) {
        tools.push(name + '@');
        i = j;
      }
    }
  }
  return tools;
}
