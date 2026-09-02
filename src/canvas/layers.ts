import paper from 'paper';

export const PROFILE_LAYER = 'Profile';
export const DIMENSIONS_LAYER = 'Dimensions';

export interface LayerDef {
  name: string;
  visible: boolean;
  color: string;
}

export interface LayerState {
  layers: LayerDef[];
  activeLayer: string;
}

export const DEFAULT_LAYERS: LayerDef[] = [
  { name: PROFILE_LAYER, visible: true, color: '#000000' },
  { name: DIMENSIONS_LAYER, visible: true, color: '#2563eb' },
];

function cloneState(source: LayerState): LayerState {
  return {
    layers: source.layers.map((layer) => ({ ...layer })),
    activeLayer: source.activeLayer,
  };
}

const DEFAULT_STATE: LayerState = { layers: DEFAULT_LAYERS, activeLayer: PROFILE_LAYER };

let state: LayerState = cloneState(DEFAULT_STATE);
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function find(name: string): LayerDef | undefined {
  return state.layers.find((layer) => layer.name === name);
}

function persistentItems(): paper.Item[] {
  if (!paper.project?.activeLayer) return [];
  return paper.project.activeLayer.children.filter(
    (item) => !(item instanceof paper.Raster) && !item.data?.isTemporary && !item.data?.isMeasurement
  );
}

export function itemLayerName(item: paper.Item): string {
  return typeof item.data?.layer === 'string' && item.data.layer ? item.data.layer : PROFILE_LAYER;
}

function uniqueLayerName(preferred: string): string {
  const names = new Set(state.layers.map((layer) => layer.name));
  if (!names.has(preferred)) return preferred;
  const match = /^(.*?)(?:\s+(\d+))?$/.exec(preferred);
  const base = (match?.[1] || preferred).trim() || 'Layer';
  let n = match?.[2] ? Number(match[2]) + 1 : 1;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function healItemLayers() {
  const names = new Set(state.layers.map((layer) => layer.name));
  if (!names.has(PROFILE_LAYER)) {
    state.layers.unshift({ name: PROFILE_LAYER, visible: true, color: '#000000' });
    names.add(PROFILE_LAYER);
  }
  for (const item of persistentItems()) {
    if (!names.has(itemLayerName(item))) item.data.layer = PROFILE_LAYER;
  }
}

/** Apply each layer's colour and visibility to its items. */
export function syncItemStyles(): void {
  if (!paper.project?.activeLayer) return;
  const byName = new Map(state.layers.map((layer) => [layer.name, layer]));
  for (const item of persistentItems()) {
    const layer = byName.get(itemLayerName(item));
    if (!layer) continue;
    item.visible = layer.visible;
    if (item.data?.isDimension && item instanceof paper.Group) {
      const color = new paper.Color(layer.color);
      for (const child of item.children) {
        if (child instanceof paper.PointText) child.fillColor = color;
        else if (child instanceof paper.Path) {
          child.strokeColor = color;
          if (child.fillColor) child.fillColor = color;
        }
      }
      continue;
    }
    if (item instanceof paper.Path && !item.data?.isDimension) {
      item.strokeColor = new paper.Color(layer.color);
    }
  }
}

export function getLayerState(): LayerState {
  return cloneState(state);
}

export function getActiveLayerName(): string {
  return state.activeLayer;
}

export function layerColor(name: string): string {
  return find(name)?.color ?? '#000000';
}

export function isLayerVisible(name: string): boolean {
  return find(name)?.visible ?? true;
}

export function subscribeLayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetLayers(): void {
  state = cloneState(DEFAULT_STATE);
  notify();
}

export function serializeLayerState(): LayerState {
  return getLayerState();
}

export function restoreLayerState(snapshot: LayerState | undefined): void {
  if (!snapshot?.layers?.length) {
    state = cloneState(DEFAULT_STATE);
  } else {
    const layers = snapshot.layers.map((layer) => ({
      name: layer.name,
      visible: Boolean(layer.visible),
      color: normalizeHex(layer.color),
    }));
    const active = layers.some((layer) => layer.name === snapshot.activeLayer) ? snapshot.activeLayer : layers[0].name;
    state = { layers, activeLayer: active };
  }
  healItemLayers();
  syncItemStyles();
  notify();
}

export function setActiveLayer(name: string): void {
  if (!find(name)) return;
  state.activeLayer = name;
  notify();
}

export function addLayer(name = 'Layer 1', color = '#000000'): string {
  const finalName = uniqueLayerName(name);
  state.layers.push({ name: finalName, visible: true, color: normalizeHex(color) });
  state.activeLayer = finalName;
  notify();
  return finalName;
}

/** Creates the layer if missing; existing colour/visibility are left alone. */
export function ensureLayer(name: string, color = '#000000'): LayerDef {
  const mapped = name === '0' || name === '' ? PROFILE_LAYER : name;
  const existing = find(mapped);
  if (existing) return existing;
  state.layers.push({ name: mapped, visible: true, color: normalizeHex(color) });
  notify();
  return find(mapped)!;
}

export function setLayerVisible(name: string, visible: boolean): void {
  const layer = find(name);
  if (!layer) return;
  layer.visible = visible;
  syncItemStyles();
  notify();
}

export function setLayerColor(name: string, color: string): void {
  const layer = find(name);
  if (!layer) return;
  layer.color = normalizeHex(color);
  syncItemStyles();
  notify();
}

export function renameLayer(oldName: string, newName: string): boolean {
  if (oldName === PROFILE_LAYER) return false;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName || find(trimmed)) return false;
  const layer = find(oldName);
  if (!layer) return false;
  layer.name = trimmed;
  if (state.activeLayer === oldName) state.activeLayer = trimmed;
  for (const item of persistentItems()) {
    if (item.data?.layer === oldName) item.data.layer = trimmed;
  }
  notify();
  return true;
}

export function countLayerItems(name: string): number {
  return persistentItems().filter((item) => itemLayerName(item) === name).length;
}

export function deleteLayer(name: string): boolean {
  if (name === PROFILE_LAYER || !find(name)) return false;
  for (const item of persistentItems()) {
    if (item.data?.layer === name) item.data.layer = PROFILE_LAYER;
  }
  state.layers = state.layers.filter((layer) => layer.name !== name);
  if (state.activeLayer === name) state.activeLayer = PROFILE_LAYER;
  syncItemStyles();
  notify();
  return true;
}

export function moveSelectionToLayer(name: string): number {
  if (!find(name) || !paper.project) return 0;
  let moved = 0;
  for (const item of paper.project.selectedItems) {
    if (item instanceof paper.Raster || item.data?.isTemporary || item.data?.isMeasurement) continue;
    item.data.layer = name;
    moved++;
  }
  syncItemStyles();
  notify();
  return moved;
}

export function assignActiveLayer(item: paper.Item): void {
  item.data.layer = state.activeLayer;
}

export function applyItemLayerStyle(item: paper.Item): void {
  const layer = find(itemLayerName(item));
  if (!layer) return;
  item.visible = layer.visible;
  if (item instanceof paper.Path && !item.data?.isDimension) {
    item.strokeColor = new paper.Color(layer.color);
  }
}

export function normalizeHex(color: string): string {
  const raw = color.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(raw);
  if (full) return `#${full[1].toLowerCase()}`;
  return '#000000';
}
