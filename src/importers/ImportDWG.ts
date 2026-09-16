import { prepareFromDxfDocument } from './ImportDXF';
import { dwgDatabaseToDxf } from './dwgToDxf';
import { commitImport, type ImportSummary, type PreparedImport } from './prepared';
import type { ViewPlane } from './viewPlane';

export class DwgImportError extends Error {}

type LibreDwgHandle = {
  dwg_read_data: (data: ArrayBuffer | string, type: number) => number | undefined;
  convert: (ptr: number) => Parameters<typeof dwgDatabaseToDxf>[0];
  dwg_free: (ptr: number) => void;
};

let libredwgPromise: Promise<LibreDwgHandle> | null = null;

function wasmDirectory(): string {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return `${process.cwd().replace(/\\/g, '/')}/node_modules/@mlightcad/libredwg-web/wasm/`;
  }
  return `${import.meta.env.BASE_URL}wasm/`;
}

async function getLibreDwg(): Promise<LibreDwgHandle> {
  if (!libredwgPromise) {
    libredwgPromise = import('@mlightcad/libredwg-web').then(({ LibreDwg }) => LibreDwg.create(wasmDirectory()));
  }
  return libredwgPromise;
}

export async function parseDwg(buffer: ArrayBuffer) {
  const { Dwg_File_Type } = await import('@mlightcad/libredwg-web');
  const libredwg = await getLibreDwg();
  const ptr = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG);
  if (ptr == null) throw new DwgImportError('Could not read this DWG file.');
  try {
    return dwgDatabaseToDxf(libredwg.convert(ptr));
  } finally {
    libredwg.dwg_free(ptr);
  }
}

export async function prepareDwgImport(buffer: ArrayBuffer, plane: ViewPlane = 'auto'): Promise<PreparedImport> {
  const raw = await parseDwg(buffer);
  return prepareFromDxfDocument(raw, 'dwg', plane, (next) => prepareDwgImport(buffer, next));
}

export async function importDwg(buffer: ArrayBuffer, mmPerUnit?: number): Promise<ImportSummary> {
  const prepared = await prepareDwgImport(buffer);
  return commitImport(prepared, mmPerUnit ?? prepared.headerMmPerUnit);
}
