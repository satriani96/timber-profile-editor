import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { buildDxf } from '../exporters/ExportDXF';
import { importDxfText } from '../importers/ImportDXF';
import { parseDxf } from '../importers/dxfParser';
import { createHistory } from './history';
import {
  PROFILE_LAYER,
  addLayer,
  applyItemLayerStyle,
  assignActiveLayer,
  countLayerItems,
  deleteLayer,
  getActiveLayerName,
  getLayerState,
  itemLayerName,
  moveSelectionToLayer,
  renameLayer,
  resetLayers,
  setActiveLayer,
  setLayerColor,
  setLayerVisible,
} from './layers';

function sketchPaths() {
  return paper.project.activeLayer.children.filter((i): i is paper.Path => i instanceof paper.Path);
}

function lineOn(layer: string, from: [number, number], to: [number, number]) {
  setActiveLayer(layer);
  const path = new paper.Path.Line({ from, to, strokeColor: 'black' });
  assignActiveLayer(path);
  applyItemLayerStyle(path);
  return path;
}

describe('layers', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
    resetLayers();
  });

  it('starts with Profile and Dimensions and stamps new geometry on the active layer', () => {
    const names = getLayerState().layers.map((l) => l.name);
    expect(names).toEqual(['Profile', 'Dimensions']);
    expect(getActiveLayerName()).toBe(PROFILE_LAYER);

    const profile = lineOn('Profile', [0, 0], [10, 0]);
    expect(itemLayerName(profile)).toBe('Profile');

    addLayer('Walls', '#ff0000');
    expect(getActiveLayerName()).toBe('Walls');
    const wall = lineOn('Walls', [0, 10], [10, 10]);
    expect(itemLayerName(wall)).toBe('Walls');
    expect((wall.strokeColor as paper.Color).toCSS(true)).toBe('#ff0000');
  });

  it('hides items when their layer is hidden', () => {
    const path = lineOn('Profile', [0, 0], [10, 0]);
    setLayerVisible('Profile', false);
    expect(path.visible).toBe(false);
    setLayerVisible('Profile', true);
    expect(path.visible).toBe(true);
  });

  it('deleting a layer reassigns its items to Profile', () => {
    addLayer('Extra', '#00ff00');
    const path = lineOn('Extra', [0, 0], [20, 0]);
    expect(countLayerItems('Extra')).toBe(1);
    expect(deleteLayer('Extra')).toBe(true);
    expect(itemLayerName(path)).toBe(PROFILE_LAYER);
    expect(getLayerState().layers.map((l) => l.name)).not.toContain('Extra');
    expect(deleteLayer(PROFILE_LAYER)).toBe(false);
  });

  it('renames a layer and updates item assignments', () => {
    addLayer('Old', '#0000ff');
    const path = lineOn('Old', [0, 0], [5, 0]);
    expect(renameLayer('Old', 'New')).toBe(true);
    expect(itemLayerName(path)).toBe('New');
    expect(getActiveLayerName()).toBe('New');
    expect(renameLayer(PROFILE_LAYER, 'Nope')).toBe(false);
  });

  it('moves the selection to another layer', () => {
    const path = lineOn('Profile', [0, 0], [10, 0]);
    path.selected = true;
    addLayer('Target', '#112233');
    expect(moveSelectionToLayer('Target')).toBe(1);
    expect(itemLayerName(path)).toBe('Target');
    expect((path.strokeColor as paper.Color).toCSS(true)).toBe('#112233');
  });

  it('round-trips layer names and assignments through DXF', () => {
    addLayer('Walls', '#ff0000');
    lineOn('Profile', [0, 0], [40, 0]);
    lineOn('Walls', [0, 10], [40, 10]);
    setLayerVisible('Walls', false);

    const text = buildDxf();
    const doc = parseDxf(text);
    expect(doc.layers.map((l) => l.name)).toEqual(expect.arrayContaining(['Profile', 'Dimensions', 'Walls']));
    expect(doc.entities.filter((e) => e.type === 'LINE')).toHaveLength(2);
    expect(doc.entities.map((e) => e.layer).sort()).toEqual(['Profile', 'Walls']);

    paper.project.activeLayer.removeChildren();
    resetLayers();
    const summary = importDxfText(text);
    expect(summary.imported).toBe(2);
    const names = getLayerState().layers.map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(['Profile', 'Walls']));
    const imported = sketchPaths();
    expect(imported.map((p) => itemLayerName(p)).sort()).toEqual(['Profile', 'Walls']);
  });

  it('restores the layer registry and item assignments on undo', () => {
    const history = createHistory();
    history.checkpoint();
    addLayer('Extra', '#00aa00');
    const path = lineOn('Extra', [0, 0], [30, 0]);
    setLayerColor('Extra', '#00aa00');
    history.checkpoint();

    deleteLayer('Extra');
    expect(itemLayerName(path)).toBe(PROFILE_LAYER);
    expect(getLayerState().layers.map((l) => l.name)).not.toContain('Extra');

    expect(history.undo()).toBe(true);
    const restored = sketchPaths()[0];
    expect(getLayerState().layers.map((l) => l.name)).toContain('Extra');
    expect(itemLayerName(restored)).toBe('Extra');
    expect(restored.visible).toBe(true);
  });
});
