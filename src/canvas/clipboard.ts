import paper from 'paper';
import { applyItemLayerStyle, getActiveLayerName, getLayerState, itemLayerName } from './layers';
import { collectSelectedTransformItems } from './tools/transformSelection';

export const CLIPBOARD_VERSION = 1;

export interface ClipboardEnvelope {
  timberProfileEditor: typeof CLIPBOARD_VERSION;
  items: unknown[];
}

let inAppItems: unknown[] = [];

export function isClipboardEnvelope(value: unknown): value is ClipboardEnvelope {
  if (!value || typeof value !== 'object') return false;
  const rec = value as { timberProfileEditor?: unknown; items?: unknown };
  return rec.timberProfileEditor === CLIPBOARD_VERSION && Array.isArray(rec.items);
}

export function serializeClipboard(items: paper.Item[]): ClipboardEnvelope {
  return {
    timberProfileEditor: CLIPBOARD_VERSION,
    items: items.map((item) => item.exportJSON({ asString: false })),
  };
}

export function parseClipboardEnvelope(text: string): ClipboardEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isClipboardEnvelope(parsed) ? parsed : null;
}

function writeSystemClipboard(text: string): void {
  const clip = globalThis.navigator?.clipboard;
  if (!clip?.writeText) return;
  void clip.writeText(text).catch(() => undefined);
}

async function readSystemClipboard(): Promise<string | null> {
  try {
    const clip = globalThis.navigator?.clipboard;
    if (!clip?.readText) return null;
    return await clip.readText();
  } catch {
    return null;
  }
}

export function copySelection(): ClipboardEnvelope | null {
  const items = collectSelectedTransformItems();
  if (!items.length) return null;
  const envelope = serializeClipboard(items);
  inAppItems = envelope.items;
  writeSystemClipboard(JSON.stringify(envelope));
  return envelope;
}

export function cutSelection(): paper.Item[] {
  const items = collectSelectedTransformItems();
  if (!items.length) return [];
  copySelection();
  return items;
}

export async function resolvePasteEntries(): Promise<unknown[]> {
  const text = await readSystemClipboard();
  if (text) {
    const envelope = parseClipboardEnvelope(text);
    if (envelope && envelope.items.length) {
      inAppItems = envelope.items;
      return envelope.items;
    }
  }
  return inAppItems;
}

export function importClipboardItems(entries: unknown[], temporary: boolean): paper.Item[] {
  const layer = paper.project.activeLayer;
  const created: paper.Item[] = [];
  for (const entry of entries) {
    const before = new Set(layer.children);
    layer.importJSON(JSON.stringify(entry));
    for (const child of layer.children) {
      if (before.has(child)) continue;
      created.push(child);
    }
  }
  for (const item of created) {
    if (temporary) {
      item.data = { ...(item.data as Record<string, unknown>), isTemporary: true };
      item.opacity = 0.55;
      item.locked = true;
      item.selected = false;
    }
    delete item.data.uid;
  }
  return created;
}

export function assignPastedLayer(item: paper.Item): void {
  const name = itemLayerName(item);
  const exists = getLayerState().layers.some((layer) => layer.name === name);
  if (!exists) item.data.layer = getActiveLayerName();
  applyItemLayerStyle(item);
}

export function finalizePastedItems(items: paper.Item[]): void {
  paper.project.deselectAll();
  for (const item of items) {
    delete item.data.isTemporary;
    item.locked = false;
    item.opacity = 1;
    item.visible = true;
    assignPastedLayer(item);
    item.selected = true;
  }
}
