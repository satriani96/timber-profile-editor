import paper from 'paper';
import type { MutableRefObject } from 'react';
import { constrainToAxis, findSnap, type SnapConfig } from '../../utils/snapHelpers';
import { isPrimaryButton, isShiftHeld } from './drawingState';
import { hitSelectable } from './marquee';
import {
  applyTranslateSelection,
  cadAngleFromDelta,
  clonePreview,
  collectSelectedTransformItems,
  hideOriginals,
  paperAngleFromCad,
  removePreview,
} from './transformSelection';

export interface MoveToolState {
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  isTransformingRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
  getSnapConfig: () => SnapConfig;
  onHint: (message: string | null) => void;
}

export function createMoveTool(state: MoveToolState) {
  const { isPanningRef, isSpacebarPanRef, isTransformingRef, handleDragPan, getSnapConfig, onHint } = state;

  let phase: 'idle' | 'moving' = 'idle';
  let base: paper.Point | null = null;
  let preview: paper.Item[] = [];
  let targets: paper.Item[] = [];
  let lastDest: paper.Point | null = null;

  const clearPreview = () => {
    removePreview(preview);
    preview = [];
    hideOriginals(targets, false);
  };

  const reset = () => {
    clearPreview();
    phase = 'idle';
    base = null;
    targets = [];
    lastDest = null;
    isTransformingRef.current = false;
  };

  const trySelect = (point: paper.Point): boolean => {
    const hit = hitSelectable(point);
    if (!hit) return false;
    paper.project.deselectAll();
    hit.selected = true;
    return true;
  };

  const destPoint = (raw: paper.Point, ortho: boolean): paper.Point => {
    if (!base) return raw;
    return ortho ? constrainToAxis(base, raw) : raw;
  };

  const updatePreview = (dest: paper.Point) => {
    if (!base) return;
    lastDest = dest;
    removePreview(preview);
    preview = clonePreview(targets);
    applyTranslateSelection(preview, dest.subtract(base));
    for (const item of preview) {
      item.data.isTemporary = true;
      item.selected = false;
      item.locked = true;
      item.opacity = 0.55;
      item.visible = true;
    }
  };

  const commit = (dest: paper.Point) => {
    if (!base || targets.length === 0) return;
    const delta = dest.subtract(base);
    clearPreview();
    applyTranslateSelection(targets, delta);
    for (const item of targets) item.selected = true;
    reset();
    onHint('Click a base point to move again');
  };

  return {
    onMouseDown(event: paper.ToolEvent) {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;
      const snap = findSnap(event.point, getSnapConfig());
      const pt = snap?.point ?? event.point;

      if (phase === 'idle') {
        const selected = collectSelectedTransformItems();
        if (selected.length === 0) {
          if (!trySelect(pt)) onHint('Select an item, then click a base point');
          else onHint('Click a base point (snaps). Shift = 45°. Tab = distance.');
          return;
        }
        targets = selected;
        base = pt.clone();
        lastDest = pt.clone();
        phase = 'moving';
        isTransformingRef.current = true;
        preview = clonePreview(targets);
        hideOriginals(targets, true);
        onHint('Click the destination · Shift 45° · Tab distance');
        return;
      }

      commit(destPoint(pt, isShiftHeld(event)));
    },

    onMouseMove(event: paper.ToolEvent) {
      const snap = findSnap(event.point, getSnapConfig());
      if (phase !== 'moving' || !base) return;
      updatePreview(destPoint(snap?.point ?? event.point, isShiftHeld(event)));
    },

    onMouseDrag(event: paper.ToolEvent) {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },

    applyNumeric(length: number, angleCad: number | undefined) {
      if (phase !== 'moving' || !base || targets.length === 0) return;
      const dirCad = angleCad ?? (lastDest ? cadAngleFromDelta(lastDest.subtract(base)) : 0);
      const paperRad = (paperAngleFromCad(dirCad) * Math.PI) / 180;
      commit(base.add(new paper.Point(Math.cos(paperRad) * length, Math.sin(paperRad) * length)));
    },

    cancel() {
      if (phase === 'idle') return;
      reset();
      onHint(null);
    },

    isBusy() {
      return phase !== 'idle';
    },

    anchor() {
      return lastDest ?? base;
    },
  };
}

export type MoveTool = ReturnType<typeof createMoveTool>;
