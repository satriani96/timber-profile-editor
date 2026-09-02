import paper from 'paper';
import type { MutableRefObject } from 'react';
import { findSnap, type SnapConfig } from '../../utils/snapHelpers';
import { isPrimaryButton, isShiftHeld } from './drawingState';
import { hitSelectable } from './marquee';
import {
  applyRotateSelection,
  clonePreview,
  collectSelectedTransformItems,
  hideOriginals,
  normalizeDeg180,
  paperAngleFromCad,
  removePreview,
  snapCadAngle,
} from './transformSelection';

export interface RotateToolState {
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  isTransformingRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
  getSnapConfig: () => SnapConfig;
  onHint: (message: string | null) => void;
}

function paperHeading(from: paper.Point, to: paper.Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function createRotateTool(state: RotateToolState) {
  const { isPanningRef, isSpacebarPanRef, isTransformingRef, handleDragPan, getSnapConfig, onHint } = state;

  let phase: 'idle' | 'ref' | 'rotating' = 'idle';
  let center: paper.Point | null = null;
  let refPoint: paper.Point | null = null;
  let preview: paper.Item[] = [];
  let targets: paper.Item[] = [];
  let lastPaperDelta = 0;
  let lastCursor: paper.Point | null = null;

  const clearPreview = () => {
    removePreview(preview);
    preview = [];
    hideOriginals(targets, false);
  };

  const reset = () => {
    clearPreview();
    phase = 'idle';
    center = null;
    refPoint = null;
    targets = [];
    lastPaperDelta = 0;
    lastCursor = null;
    isTransformingRef.current = false;
  };

  const trySelect = (point: paper.Point): boolean => {
    const hit = hitSelectable(point);
    if (!hit) return false;
    paper.project.deselectAll();
    hit.selected = true;
    return true;
  };

  const paperDeltaFromMouse = (raw: paper.Point, shift: boolean): number => {
    if (!center || !refPoint) return 0;
    const paperDelta = normalizeDeg180(paperHeading(center, raw) - paperHeading(center, refPoint));
    if (!shift) return paperDelta;
    return paperAngleFromCad(snapCadAngle(-paperDelta, 15));
  };

  const updatePreview = (paperDelta: number) => {
    if (!center) return;
    lastPaperDelta = paperDelta;
    removePreview(preview);
    preview = clonePreview(targets);
    applyRotateSelection(preview, paperDelta, center);
    for (const item of preview) {
      item.data.isTemporary = true;
      item.selected = false;
      item.locked = true;
      item.opacity = 0.55;
      item.visible = true;
    }
  };

  const commit = (paperDelta: number) => {
    if (!center || targets.length === 0) return;
    clearPreview();
    applyRotateSelection(targets, paperDelta, center);
    for (const item of targets) item.selected = true;
    reset();
    onHint('Click the centre to rotate again');
  };

  return {
    onMouseDown(event: paper.ToolEvent) {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;
      const snap = findSnap(event.point, getSnapConfig());
      const pt = snap?.point ?? event.point;

      if (phase === 'idle') {
        const selected = collectSelectedTransformItems();
        if (selected.length === 0) {
          if (!trySelect(pt)) onHint('Select an item, then click the rotation centre');
          else onHint('Click the rotation centre (snaps)');
          return;
        }
        targets = selected;
        center = pt.clone();
        phase = 'ref';
        isTransformingRef.current = true;
        onHint('Click a reference point (defines the start angle)');
        return;
      }

      if (phase === 'ref' && center) {
        refPoint = pt.clone();
        lastCursor = pt.clone();
        phase = 'rotating';
        preview = clonePreview(targets);
        hideOriginals(targets, true);
        onHint('Click to set the new angle · Shift 15° · Tab angle (CCW°)');
        return;
      }

      if (phase === 'rotating') {
        commit(paperDeltaFromMouse(pt, isShiftHeld(event)));
      }
    },

    onMouseMove(event: paper.ToolEvent) {
      const snap = findSnap(event.point, getSnapConfig());
      if (phase !== 'rotating' || !center || !refPoint) return;
      lastCursor = (snap?.point ?? event.point).clone();
      updatePreview(paperDeltaFromMouse(lastCursor, isShiftHeld(event)));
    },

    onMouseDrag(event: paper.ToolEvent) {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },

    applyNumeric(cadAngleDeg: number) {
      if (phase !== 'rotating' || !center || targets.length === 0) return;
      commit(paperAngleFromCad(cadAngleDeg));
    },

    cancel() {
      if (phase === 'idle') return;
      reset();
      onHint(null);
    },

    isBusy() {
      return phase !== 'idle';
    },

    canApplyNumeric() {
      return phase === 'rotating';
    },

    anchor() {
      return lastCursor ?? refPoint ?? center;
    },

    lastPaperDelta() {
      return lastPaperDelta;
    },
  };
}

export type RotateTool = ReturnType<typeof createRotateTool>;
