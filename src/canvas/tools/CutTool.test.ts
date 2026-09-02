import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { createSplitTool, createTrimTool } from './CutTool';
import { findSnap } from '../../utils/snapHelpers';

const state = () => ({
  isPanningRef: { current: false },
  isSpacebarPanRef: { current: false },
  handleDragPan: () => {},
});

const event = (x: number, y: number) => ({ point: new paper.Point(x, y) }) as unknown as paper.ToolEvent;

function sketchPaths() {
  return paper.project.activeLayer.children.filter((i): i is paper.Path => i instanceof paper.Path && !i.data?.isTemporary);
}

function temporaries() {
  return paper.project.activeLayer.children.filter((i) => i.data?.isTemporary);
}

function circleAndLine() {
  const c = new paper.Path.Circle({ center: [400, 300], radius: 100, strokeColor: 'black', strokeWidth: 2 });
  c.data = { center: new paper.Point(400, 300), radius: 100, isArc: false };
  const l = new paper.Path.Line({ from: [200, 300], to: [600, 300], strokeColor: 'black', strokeWidth: 2 });
  return { c, l };
}

describe('Trim tool', () => {
  beforeEach(() => paper.setup(new paper.Size(800, 600)));

  it('previews and removes the hovered arc, even when hovering exactly on a quadrant point', () => {
    circleAndLine();
    const trim = createTrimTool(state());

    trim.onMouseMove(event(400, 200));
    expect(temporaries()).toHaveLength(1);
    const preview = temporaries()[0] as paper.Path;
    expect(preview.length).toBeCloseTo(Math.PI * 100, 0);

    trim.onMouseDown(event(400, 200));
    const remaining = sketchPaths();
    expect(remaining).toHaveLength(2);
    const arc = remaining.find((p) => p.data?.isArc)!;
    expect(arc.length).toBeCloseTo(Math.PI * 100, 0);
    expect(arc.getPointAt(arc.length / 2)!.y).toBeGreaterThan(300);

    // Hovering the chord inside the remaining arc trims only that stretch of the line.
    trim.onMouseDown(event(400, 300));
    const afterChord = sketchPaths();
    expect(afterChord).toHaveLength(3);
    const stubs = afterChord.filter((p) => !p.data?.isArc);
    expect(stubs.map((s) => Math.round(s.length)).sort()).toEqual([100, 100]);
  });

  it('removes an unconnected path outright and clears its preview on deactivate', () => {
    new paper.Path.Line({ from: [0, 0], to: [100, 0], strokeColor: 'black', strokeWidth: 2 });
    const trim = createTrimTool(state());
    trim.onMouseMove(event(50, 2));
    expect(temporaries()).toHaveLength(1);
    trim.onDeactivate();
    expect(temporaries()).toHaveLength(0);
    trim.onMouseDown(event(50, 2));
    expect(sketchPaths()).toHaveLength(0);
  });
});

describe('Split tool', () => {
  beforeEach(() => paper.setup(new paper.Size(800, 600)));

  it('breaks the circle into two arcs without removing anything', () => {
    circleAndLine();
    const split = createSplitTool(state());

    split.onMouseMove(event(400, 200));
    // Preview arc plus two cut-point markers.
    expect(temporaries()).toHaveLength(3);

    split.onMouseDown(event(400, 200));
    const paths = sketchPaths();
    expect(paths).toHaveLength(3);
    const arcs = paths.filter((p) => p.data?.isArc);
    expect(arcs).toHaveLength(2);
    arcs.forEach((a) => expect(a.length).toBeCloseTo(Math.PI * 100, 0));
    expect(paths.reduce((sum, p) => sum + p.length, 0)).toBeCloseTo(2 * Math.PI * 100 + 400, 0);
  });

  it('does nothing on a path with no cuts', () => {
    new paper.Path.Line({ from: [0, 0], to: [100, 0], strokeColor: 'black', strokeWidth: 2 });
    const split = createSplitTool(state());
    split.onMouseMove(event(50, 0));
    expect(temporaries()).toHaveLength(0);
    split.onMouseDown(event(50, 0));
    expect(sketchPaths()).toHaveLength(1);
  });
});

describe('snap markers', () => {
  beforeEach(() => paper.setup(new paper.Size(800, 600)));

  it('reports endpoint, midpoint, center, quadrant and intersection snaps with a marker', () => {
    const { l } = circleAndLine();
    const snapIndicatorRef = { current: null as paper.Item | null };
    const config = { snapTolerancePx: 10, currentPathRef: { current: null }, snapIndicatorRef };

    expect(findSnap(new paper.Point(603, 302), config)?.kind).toBe('endpoint');
    expect(snapIndicatorRef.current?.data.snapKind).toBe('endpoint');
    expect(snapIndicatorRef.current?.isInserted()).toBe(true);

    // The line's midpoint coincides with the circle center; midpoint outranks center.
    expect(findSnap(new paper.Point(402, 303), config)?.kind).toBe('midpoint');
    const lone = new paper.Path.Circle({ center: [100, 100], radius: 30, strokeColor: 'black', strokeWidth: 2 });
    lone.data = { center: new paper.Point(100, 100), radius: 30, isArc: false };
    expect(findSnap(new paper.Point(102, 103), config)?.kind).toBe('center');
    expect(findSnap(new paper.Point(402, 203), config)?.kind).toBe('quadrant');
    expect(findSnap(new paper.Point(302, 297), config)?.kind).toBe('intersection');
    expect(snapIndicatorRef.current?.data.snapKind).toBe('intersection');

    l.remove();
    expect(findSnap(new paper.Point(700, 500), config)).toBeNull();
    expect(snapIndicatorRef.current?.visible).toBe(false);
  });

  it('keeps markers a constant on-screen size across zoom levels', () => {
    circleAndLine();
    const snapIndicatorRef = { current: null as paper.Item | null };
    const config = { snapTolerancePx: 10, currentPathRef: { current: null }, snapIndicatorRef };

    paper.view.zoom = 1;
    expect(findSnap(new paper.Point(600, 300), config)?.kind).toBe('endpoint');
    const sizeAt1 = snapIndicatorRef.current!.bounds.width;

    paper.view.zoom = 4;
    expect(findSnap(new paper.Point(600, 300), config)?.kind).toBe('endpoint');
    const sizeAt4 = snapIndicatorRef.current!.bounds.width;

    // Project-space size shrinks by the zoom factor so the screen size stays put.
    expect(sizeAt4 * 4).toBeCloseTo(sizeAt1, 9);
    expect(sizeAt1).toBeCloseTo(12, 6); // 12 px marker at zoom 1 (bounds exclude the stroke)
  });
});
