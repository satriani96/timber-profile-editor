import paper from 'paper';
import type { MutableRefObject } from 'react';
import type { SketchHistory } from '../history';
import { finalizePastedItems, importClipboardItems } from '../clipboard';
import { findSnap, type SnapConfig } from '../../utils/snapHelpers';
import { isPrimaryButton } from './drawingState';
import { applyTranslateSelection, itemsBoundsCenter, removePreview } from './transformSelection';

export interface PasteToolState {
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  isPastingRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
  getSnapConfig: () => SnapConfig;
  history: SketchHistory;
  onHint: (message: string | null) => void;
  onDone: () => void;
}

export function createPasteTool(state: PasteToolState) {
  const { isPanningRef, isSpacebarPanRef, isPastingRef, handleDragPan, getSnapConfig, history, onHint, onDone } = state;

  let ghosts: paper.Item[] = [];
  let anchor: paper.Point | null = null;

  const clearGhosts = () => {
    removePreview(ghosts);
    ghosts = [];
    anchor = null;
  };

  const finish = () => {
    clearGhosts();
    isPastingRef.current = false;
    onHint(null);
    onDone();
  };

  const moveGhostsTo = (dest: paper.Point) => {
    if (!anchor || ghosts.length === 0) return;
    const delta = dest.subtract(anchor);
    if (delta.isZero()) return;
    applyTranslateSelection(ghosts, delta);
    for (const item of ghosts) {
      item.data.isTemporary = true;
      item.selected = false;
      item.locked = true;
      item.opacity = 0.55;
      item.visible = true;
    }
    anchor = dest;
  };

  return {
    begin(entries: unknown[]) {
      clearGhosts();
      if (!entries.length) return;
      ghosts = importClipboardItems(entries, true);
      if (!ghosts.length) return;
      isPastingRef.current = true;
      const originalCenter = itemsBoundsCenter(ghosts);
      anchor = originalCenter;
      moveGhostsTo(paper.view.center);
      onHint('Click to place the copy · Escape cancels');
    },

    onMouseDown(event: paper.ToolEvent) {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;
      if (!ghosts.length || !anchor) return;
      const snap = findSnap(event.point, getSnapConfig());
      moveGhostsTo(snap?.point ?? event.point);
      const placed = ghosts;
      ghosts = [];
      anchor = null;
      history.checkpoint();
      finalizePastedItems(placed);
      isPastingRef.current = false;
      onHint(null);
      onDone();
    },

    onMouseMove(event: paper.ToolEvent) {
      if (!ghosts.length) return;
      const snap = findSnap(event.point, getSnapConfig());
      moveGhostsTo(snap?.point ?? event.point);
    },

    onMouseDrag(event: paper.ToolEvent) {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },

    cancel() {
      if (!isPastingRef.current && ghosts.length === 0) return;
      finish();
    },

    isBusy() {
      return isPastingRef.current || ghosts.length > 0;
    },
  };
}

export type PasteTool = ReturnType<typeof createPasteTool>;
