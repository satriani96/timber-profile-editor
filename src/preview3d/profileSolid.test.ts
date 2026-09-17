import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { createDimension } from '../canvas/dimensions';
import {
  DIMENSIONS_LAYER,
  PROFILE_LAYER,
  addLayer,
  assignActiveLayer,
  resetLayers,
  setActiveLayer,
  setLayerVisible,
} from '../canvas/layers';
import { existsSync, readFileSync } from 'node:fs';
import { importDxfText } from '../importers/ImportDXF';
import { extractProfileLoops, profileBounds, ProfileSolidError, sampleLoopYUp } from './profileSolid';

function onLayer(layer: string, build: () => paper.Path): paper.Path {
  setActiveLayer(layer);
  const path = build();
  assignActiveLayer(path);
  return path;
}

function rectangle(from: [number, number], to: [number, number], layer = PROFILE_LAYER): paper.Path {
  return onLayer(layer, () => new paper.Path.Rectangle({ from, to, strokeColor: 'black' }));
}

function line(from: [number, number], to: [number, number], layer = PROFILE_LAYER): paper.Path {
  return onLayer(layer, () => new paper.Path.Line({ from, to, strokeColor: 'black' }));
}

describe('extractProfileLoops', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
    resetLayers();
  });

  it('samples a closed rectangle in Y-up millimetres', () => {
    rectangle([10, 20], [40, 50]);
    const loops = extractProfileLoops();
    expect(loops.holes).toHaveLength(0);
    expect(loops.outer).toHaveLength(4);
    const xs = loops.outer.map((p) => p.x).sort((a, b) => a - b);
    const ys = loops.outer.map((p) => p.y).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(10);
    expect(xs[3]).toBeCloseTo(40);
    expect(ys[0]).toBeCloseTo(-50);
    expect(ys[3]).toBeCloseTo(-20);
    expect(loops.outer.every((p) => p.x === 10 || p.x === 40)).toBe(true);
    expect(loops.outer.every((p) => p.y === -20 || p.y === -50)).toBe(true);
  });

  it('treats a closed path inside the outline as a hole', () => {
    rectangle([0, 0], [100, 80]);
    rectangle([20, 20], [40, 40]);
    const loops = extractProfileLoops();
    expect(loops.holes).toHaveLength(1);
    const holeXs = loops.holes[0].map((p) => p.x);
    expect(Math.min(...holeXs)).toBeCloseTo(20);
    expect(Math.max(...holeXs)).toBeCloseTo(40);
    expect(Math.min(...loops.outer.map((p) => p.x))).toBeCloseTo(0);
    expect(Math.max(...loops.outer.map((p) => p.x))).toBeCloseTo(100);
  });

  it('joins unjoined but touching lines into one outline', () => {
    line([0, 0], [80, 0]);
    line([80, 0], [80, 18]);
    line([80, 18], [0, 18]);
    line([0, 18], [0, 0]);
    const loops = extractProfileLoops();
    expect(loops.holes).toHaveLength(0);
    expect(loops.outer).toHaveLength(4);
    expect(Math.max(...loops.outer.map((p) => p.x))).toBeCloseTo(80);
    expect(Math.max(...loops.outer.map((p) => Math.abs(p.y)))).toBeCloseTo(18);
  });

  it('joins CAD-style endpoints that miss by a few microns', () => {
    line([0, 0], [80, 0]);
    line([80, 0], [80, 18]);
    line([80, 18], [0, 18]);
    line([0, 18.002], [0, 0]);
    const loops = extractProfileLoops();
    expect(loops.holes).toHaveLength(0);
    expect(Math.max(...loops.outer.map((p) => p.x))).toBeCloseTo(80);
  });

  it('previews the largest closed outline and ignores a disjoint island', () => {
    rectangle([0, 0], [10, 10]);
    rectangle([40, 40], [55, 55]);
    const loops = extractProfileLoops();
    expect(loops.holes).toHaveLength(0);
    expect(Math.min(...loops.outer.map((p) => p.x))).toBeCloseTo(40);
    expect(Math.max(...loops.outer.map((p) => p.x))).toBeCloseTo(55);
  });

  it('ignores leftover construction next to a closed outline', () => {
    rectangle([0, 0], [80, 18]);
    line([200, 0], [220, 4]);
    const loops = extractProfileLoops();
    expect(loops.holes).toHaveLength(0);
    expect(Math.max(...loops.outer.map((p) => p.x))).toBeCloseTo(80);
  });

  it('rejects an open chain that does not close', () => {
    line([0, 0], [80, 0]);
    line([80, 0], [80, 18]);
    line([80, 18], [0, 18]);
    expect(() => extractProfileLoops()).toThrow(/Close the profile outline/);
  });

  it('ignores dimensions, measurements, and hidden layers', () => {
    rectangle([0, 0], [60, 15]);
    createDimension({
      kind: 'horizontal',
      p1: new paper.Point(0, 0),
      p2: new paper.Point(60, 0),
      textPoint: new paper.Point(30, -10),
      value: 60,
    });
    const measure = line([0, 20], [10, 20]);
    measure.data.isMeasurement = true;
    addLayer('Notes', '#ff0000');
    line([200, 0], [220, 0], 'Notes');
    setLayerVisible('Notes', false);
    rectangle([0, 80], [20, 100], DIMENSIONS_LAYER);
    const loops = extractProfileLoops();
    expect(loops.outer).toHaveLength(4);
    expect(Math.max(...loops.outer.map((p) => p.x))).toBeCloseTo(60);
  });

  it('uses a visible imported CAD layer as the profile outline', () => {
    addLayer('GC25 v2_Sketch2');
    rectangle([0, 0], [40, 18], 'GC25 v2_Sketch2');
    const loops = extractProfileLoops();
    expect(loops.holes).toHaveLength(0);
    expect(Math.max(...loops.outer.map((p) => p.x))).toBeCloseTo(40);
    expect(Math.max(...loops.outer.map((p) => Math.abs(p.y)))).toBeCloseTo(18);
  });

  const GC25 = 'C:\\Users\\joshua.hewetson\\Downloads\\GC25.dxf';
  const DECKING =
    'C:\\Users\\joshua.hewetson\\Genia\\Files-Team - Documents\\Quality\\5 Product Specs\\Technical Files\\Knife Templates\\Archive\\88 x 32 - Decking v5.dxf';

  it.skipIf(!existsSync(GC25))('builds a closed outline from GC25 imported onto its CAD layer', () => {
    paper.project.activeLayer.removeChildren();
    resetLayers();
    const summary = importDxfText(readFileSync(GC25, 'utf8'), 1);
    expect(summary.imported).toBeGreaterThan(0);
    const loops = extractProfileLoops();
    expect(loops.outer.length).toBeGreaterThan(3);
    expect(loops.holes).toHaveLength(0);
  });

  it.skipIf(!existsSync(DECKING))('builds a closed outline from 88x32 Decking v5 imported onto its CAD layer', () => {
    paper.project.activeLayer.removeChildren();
    resetLayers();
    const summary = importDxfText(readFileSync(DECKING, 'utf8'), 1);
    expect(summary.imported).toBeGreaterThan(0);
    const bounds = profileBounds(extractProfileLoops());
    expect(bounds.maxX - bounds.minX).toBeCloseTo(88, 1);
    expect(bounds.maxY - bounds.minY).toBeCloseTo(32, 1);
  });

  it('samples curved segments instead of only the bezier handles', () => {
    const circle = onLayer(PROFILE_LAYER, () => new paper.Path.Circle({ center: [0, 0], radius: 10, strokeColor: 'black' }));
    const points = sampleLoopYUp(circle);
    expect(points.length).toBeGreaterThan(8);
    const radii = points.map((p) => Math.hypot(p.x, p.y));
    for (const radius of radii) expect(radius).toBeCloseTo(10, 2);
  });
});
