import paper from 'paper';

const MAX_UNDO_STEPS = 60;

/** Everything in the sketch except the traced image and transient previews/markers. */
function persistentItems(): paper.Item[] {
  return paper.project.activeLayer.children.filter((item) => !(item instanceof paper.Raster) && !item.data?.isTemporary);
}

function serialize(): string {
  return JSON.stringify(persistentItems().map((item) => item.exportJSON({ asString: false })));
}

function restore(snapshot: string): void {
  const layer = paper.project.activeLayer;
  for (const item of [...layer.children]) {
    if (!(item instanceof paper.Raster)) item.remove();
  }
  const entries = JSON.parse(snapshot) as unknown[];
  for (const entry of entries) layer.importJSON(JSON.stringify(entry));
  for (const item of layer.children) {
    if (item instanceof paper.Raster) item.sendToBack();
  }
  paper.project.deselectAll();
}

/**
 * Snapshot-based undo/redo. Call `checkpoint()` right before a change is about
 * to happen (tool mouse-down, delete, import); identical consecutive snapshots
 * are collapsed so no-op clicks do not pollute the stack.
 */
export function createHistory() {
  let undoStack: string[] = [];
  let redoStack: string[] = [];
  let lastKnown: string | null = null;

  function noteDivergence(current: string) {
    if (lastKnown !== null && current !== lastKnown) redoStack = [];
  }

  return {
    checkpoint(): void {
      const current = serialize();
      noteDivergence(current);
      if (undoStack[undoStack.length - 1] !== current) {
        undoStack.push(current);
        if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
      }
      lastKnown = current;
    },

    undo(): boolean {
      const current = serialize();
      noteDivergence(current);
      let target: string | undefined;
      while (undoStack.length) {
        const candidate = undoStack.pop()!;
        if (candidate !== current) {
          target = candidate;
          break;
        }
      }
      if (target === undefined) {
        lastKnown = current;
        return false;
      }
      redoStack.push(current);
      restore(target);
      lastKnown = target;
      return true;
    },

    redo(): boolean {
      const current = serialize();
      noteDivergence(current);
      const target = redoStack.pop();
      if (target === undefined) {
        lastKnown = current;
        return false;
      }
      undoStack.push(current);
      restore(target);
      lastKnown = target;
      return true;
    },

    clear(): void {
      undoStack = [];
      redoStack = [];
      lastKnown = null;
    },
  };
}

export type SketchHistory = ReturnType<typeof createHistory>;
