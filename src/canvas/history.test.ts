import { beforeEach, describe, expect, it } from 'vitest';
import paper from 'paper';
import { createHistory } from './history';

function pathCount() {
  return paper.project.activeLayer.children.filter((i) => i instanceof paper.Path).length;
}

describe('history', () => {
  beforeEach(() => {
    paper.setup(new paper.Size(800, 600));
  });

  it('undoes and redoes changes taken at checkpoints', () => {
    const history = createHistory();

    history.checkpoint();
    new paper.Path.Line({ from: [0, 0], to: [10, 0], strokeColor: 'black' });
    history.checkpoint();
    const circle = new paper.Path.Circle({ center: [0, 0], radius: 5, strokeColor: 'black' });
    circle.data = { center: new paper.Point(0, 0), radius: 5, isArc: false };
    expect(pathCount()).toBe(2);

    expect(history.undo()).toBe(true);
    expect(pathCount()).toBe(1);
    expect(history.undo()).toBe(true);
    expect(pathCount()).toBe(0);
    expect(history.undo()).toBe(false);

    expect(history.redo()).toBe(true);
    expect(pathCount()).toBe(1);
    expect(history.redo()).toBe(true);
    expect(pathCount()).toBe(2);
    const restored = paper.project.activeLayer.children.find((i) => i.data?.radius === 5) as paper.Path;
    expect(restored.data.center).toBeInstanceOf(paper.Point);
    expect(history.redo()).toBe(false);
  });

  it('collapses no-op checkpoints and drops redo after a new change', () => {
    const history = createHistory();
    history.checkpoint();
    new paper.Path.Line({ from: [0, 0], to: [10, 0], strokeColor: 'black' });
    history.checkpoint();
    history.checkpoint();
    history.checkpoint();

    expect(history.undo()).toBe(true);
    expect(pathCount()).toBe(0);

    history.checkpoint();
    new paper.Path.Line({ from: [0, 0], to: [20, 0], strokeColor: 'black' });
    expect(history.redo()).toBe(false);
    expect(pathCount()).toBe(1);
    expect(history.undo()).toBe(true);
    expect(pathCount()).toBe(0);
  });

  it('leaves the traced image alone', () => {
    const history = createHistory();
    const raster = new paper.Raster({ size: [2, 2] });
    history.checkpoint();
    new paper.Path.Line({ from: [0, 0], to: [10, 0], strokeColor: 'black' });
    history.undo();
    expect(raster.isInserted()).toBe(true);
    expect(pathCount()).toBe(0);
  });
});
