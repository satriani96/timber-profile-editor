/**
 * Minimal reader for Microsoft Compound File Binary (OLE2) containers — the
 * envelope TurboCAD uses for .tcw files. Supports v3 (512-byte) and v4
 * (4096-byte) sectors, FAT/DIFAT chains, and the mini stream.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;
const MAX_CHAIN = 1 << 22;

export class CfbError extends Error {}

interface DirectoryEntry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

export interface CompoundFile {
  /** Stream contents keyed by slash-joined path, e.g. "Graphics/ModelSpace". */
  streams: Map<string, Uint8Array>;
}

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}
function u32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

export function readCompoundFile(buffer: ArrayBuffer): CompoundFile {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < 512 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new CfbError('Not an OLE compound document.');
  }

  const sectorSize = 1 << u16(view, 0x1e);
  const miniSectorSize = 1 << u16(view, 0x20);
  const fatSectorCount = u32(view, 0x2c);
  const firstDirectorySector = u32(view, 0x30);
  const miniStreamCutoff = u32(view, 0x38);
  const firstMiniFatSector = u32(view, 0x3c);
  const firstDifatSector = u32(view, 0x44);
  const difatSectorCount = u32(view, 0x48);
  const entriesPerSector = sectorSize / 4;

  const sectorOffset = (sector: number) => (sector + 1) * sectorSize;
  const readSector = (sector: number): Uint8Array => {
    const start = sectorOffset(sector);
    if (start + sectorSize > bytes.length) throw new CfbError(`Sector ${sector} is outside the file.`);
    return bytes.subarray(start, start + sectorSize);
  };

  // DIFAT: 109 entries in the header, then a chain of DIFAT sectors.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109 && fatSectors.length < fatSectorCount; i++) {
    const s = u32(view, 0x4c + i * 4);
    if (s !== FREE_SECTOR) fatSectors.push(s);
  }
  let difat = firstDifatSector;
  for (let n = 0; n < difatSectorCount && difat !== END_OF_CHAIN && difat !== FREE_SECTOR; n++) {
    const base = sectorOffset(difat);
    for (let i = 0; i < entriesPerSector - 1 && fatSectors.length < fatSectorCount; i++) {
      const s = u32(view, base + i * 4);
      if (s !== FREE_SECTOR) fatSectors.push(s);
    }
    difat = u32(view, base + (entriesPerSector - 1) * 4);
  }

  const fat = new Uint32Array(fatSectors.length * entriesPerSector);
  fatSectors.forEach((s, i) => {
    const base = sectorOffset(s);
    for (let j = 0; j < entriesPerSector; j++) fat[i * entriesPerSector + j] = u32(view, base + j * 4);
  });

  const chain = (start: number, table: Uint32Array): number[] => {
    const sectors: number[] = [];
    let s = start;
    while (s !== END_OF_CHAIN && s !== FREE_SECTOR && s < table.length) {
      sectors.push(s);
      if (sectors.length > MAX_CHAIN) throw new CfbError('Corrupt sector chain.');
      s = table[s];
    }
    return sectors;
  };

  const readChain = (start: number, size: number): Uint8Array => {
    const out = new Uint8Array(size);
    let written = 0;
    for (const s of chain(start, fat)) {
      if (written >= size) break;
      const data = readSector(s);
      const n = Math.min(sectorSize, size - written);
      out.set(data.subarray(0, n), written);
      written += n;
    }
    return out;
  };

  // Directory entries.
  const entries: DirectoryEntry[] = [];
  for (const s of chain(firstDirectorySector, fat)) {
    const base = sectorOffset(s);
    for (let e = 0; e < sectorSize / 128; e++) {
      const o = base + e * 128;
      const nameLength = u16(view, o + 0x40);
      const type = bytes[o + 0x42];
      if (type === 0) continue;
      let name = '';
      for (let c = 0; c + 1 < Math.min(nameLength, 64); c += 2) {
        const code = u16(view, o + c);
        if (code === 0) break;
        name += String.fromCharCode(code);
      }
      entries.push({
        name,
        type,
        left: u32(view, o + 0x44),
        right: u32(view, o + 0x48),
        child: u32(view, o + 0x4c),
        start: u32(view, o + 0x74),
        size: u32(view, o + 0x78),
      });
    }
  }
  if (!entries.length || entries[0].type !== 5) throw new CfbError('Missing root directory entry.');

  // Mini stream lives in the root entry's chain; mini FAT maps mini sectors.
  const root = entries[0];
  const miniStream = readChain(root.start, root.size);
  const miniFatBytes = readChain(firstMiniFatSector, u32(view, 0x40) * sectorSize);
  const miniFat = new Uint32Array(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength / 4);

  const readStream = (entry: DirectoryEntry): Uint8Array => {
    if (entry.size >= miniStreamCutoff) return readChain(entry.start, entry.size);
    const out = new Uint8Array(entry.size);
    let written = 0;
    for (const ms of chain(entry.start, miniFat)) {
      if (written >= entry.size) break;
      const from = ms * miniSectorSize;
      const n = Math.min(miniSectorSize, entry.size - written);
      out.set(miniStream.subarray(from, from + n), written);
      written += n;
    }
    return out;
  };

  const streams = new Map<string, Uint8Array>();
  const visited = new Set<number>();
  const walk = (index: number, prefix: string) => {
    if (index === FREE_SECTOR || index >= entries.length || visited.has(index)) return;
    visited.add(index);
    const entry = entries[index];
    walk(entry.left, prefix);
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 2) streams.set(path, readStream(entry));
    else if (entry.type === 1) walk(entry.child, path);
    walk(entry.right, prefix);
  };
  walk(root.child, '');

  return { streams };
}
