import { useCallback, type MutableRefObject, type RefObject } from 'react';
import paper from 'paper';
import type { SketchTool } from '../../types';
import type { SketchHistory } from '../../canvas/history';
import { copySelection as snapshotSelection, cutSelection as snapshotCut, resolvePasteEntries } from '../../canvas/clipboard';
import type { createPasteTool } from '../../canvas/tools/PasteTool';

export type PaperToolRefs = Record<SketchTool, MutableRefObject<paper.Tool | null>>;

export function collectPaperTools(
  select: MutableRefObject<paper.Tool | null>,
  line: MutableRefObject<paper.Tool | null>,
  square: MutableRefObject<paper.Tool | null>,
  circle: MutableRefObject<paper.Tool | null>,
  pan: MutableRefObject<paper.Tool | null>,
  fillet: MutableRefObject<paper.Tool | null>,
  fitspline: MutableRefObject<paper.Tool | null>,
  trim: MutableRefObject<paper.Tool | null>,
  split: MutableRefObject<paper.Tool | null>,
  dimension: MutableRefObject<paper.Tool | null>,
  move: MutableRefObject<paper.Tool | null>,
  rotate: MutableRefObject<paper.Tool | null>,
): PaperToolRefs {
  return { select, line, square, circle, pan, fillet, fitspline, trim, split, dimension, move, rotate };
}

interface Args {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  history: SketchHistory;
  pasteToolRef: MutableRefObject<paper.Tool | null>;
  pasteToolInstanceRef: MutableRefObject<ReturnType<typeof createPasteTool> | null>;
  isPastingRef: MutableRefObject<boolean>;
  lastActivatedToolRef: MutableRefObject<SketchTool>;
  tools: () => PaperToolRefs;
  cursors: Record<SketchTool, string>;
  cancelMarquee: () => void;
  cancelTransform: () => void;
  onHint: (message: string | null) => void;
}

export function useSketchClipboard({
  canvasRef,
  history,
  pasteToolRef,
  pasteToolInstanceRef,
  isPastingRef,
  lastActivatedToolRef,
  tools,
  cursors,
  cancelMarquee,
  cancelTransform,
  onHint,
}: Args) {
  const restoreActiveTool = useCallback(() => {
    isPastingRef.current = false;
    const name = lastActivatedToolRef.current;
    tools()[name].current?.activate();
    if (canvasRef.current) canvasRef.current.style.cursor = cursors[name];
  }, [canvasRef, cursors, isPastingRef, lastActivatedToolRef, tools]);

  const cancelPaste = useCallback(() => {
    pasteToolInstanceRef.current?.cancel();
    isPastingRef.current = false;
  }, [isPastingRef, pasteToolInstanceRef]);

  const copyCurrentSelection = useCallback(() => {
    snapshotSelection();
  }, []);

  const cutCurrentSelection = useCallback(() => {
    const items = snapshotCut();
    if (!items.length) return;
    history.checkpoint();
    items.forEach((item) => item.remove());
    paper.view.update();
  }, [history]);

  const beginPaste = useCallback(() => {
    void resolvePasteEntries().then((entries) => {
      if (!entries.length) {
        onHint('Clipboard is empty');
        return;
      }
      cancelMarquee();
      cancelTransform();
      pasteToolInstanceRef.current?.begin(entries);
      isPastingRef.current = true;
      pasteToolRef.current?.activate();
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    });
  }, [cancelMarquee, cancelTransform, canvasRef, isPastingRef, onHint, pasteToolInstanceRef, pasteToolRef]);

  return { restoreActiveTool, cancelPaste, copyCurrentSelection, cutCurrentSelection, beginPaste };
}
