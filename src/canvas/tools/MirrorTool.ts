import paper from 'paper';
import type { MutableRefObject } from 'react';
import { BASE_STROKE_WIDTH } from '../../components/sketch/constants';
import type { SketchHistory } from '../history';
import { applyItemLayerStyle } from '../layers';
import { constrainToAxis, findSnap, type SnapConfig } from '../../utils/snapHelpers';
import { nearestSketchPath } from '../geometry/pathCuts';
import { isAltHeld, isPrimaryButton, isShiftHeld } from './drawingState';
import { hitSelectable } from './marquee';
import {
  applyMirrorSelection,
  clonePreview,
  collectSelectedTransformItems,
  mirrorCopyItems,
  removePreview,
} from './transformSelection';

const HOVER_COLOR = '#2563eb';

export interface MirrorToolState {
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  isMirroringRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
  getSnapConfig: () => SnapConfig;
  history: SketchHistory;
  onHint: (message: string | null) => void;
}

function straightAxisAt(point: paper.Point): { from: paper.Point; to: paper.Point; path: paper.Path } | null {
  const hit = nearestSketchPath(point, 10 / paper.view.zoom);
  if (!hit) return null;
  const curve = hit.location.curve;
  if (!curve?.isStraight()) return null;
  return { from: curve.point1.clone(), to: curve.point2.clone(), path: hit.path };
}

export function createMirrorTool(state: MirrorToolState) {
  const { isPanningRef, isSpacebarPanRef, isMirroringRef, handleDragPan, getSnapConfig, history, onHint } = state;

  let phase: 'idle' | 'second' | 'ready' = 'idle';
  let axisPoint: paper.Point | null = null;
  let axisDirection: paper.Point | null = null;
  let firstPoint: paper.Point | null = null;
  let preview: paper.Item[] = [];
  let targets: paper.Item[] = [];
  let hoverClone: paper.Path | null = null;
  let hoverPath: paper.Path | null = null;

  const clearHover = () => {
    hoverClone?.remove();
    hoverClone = null;
    hoverPath = null;
  };

  const clearPreview = () => {
    removePreview(preview);
    preview = [];
  };

  const reset = () => {
    clearPreview();
    clearHover();
    phase = 'idle';
    axisPoint = null;
    axisDirection = null;
    firstPoint = null;
    targets = [];
    isMirroringRef.current = false;
  };

  const trySelect = (point: paper.Point): boolean => {
    const hit = hitSelectable(point);
    if (!hit) return false;
    paper.project.deselectAll();
    hit.selected = true;
    return true;
  };

  const highlightEntity = (path: paper.Path) => {
    if (hoverPath === path && hoverClone?.isInserted()) return;
    clearHover();
    hoverPath = path;
    const clone = path.clone();
    clone.data = { isTemporary: true };
    clone.selected = false;
    clone.fillColor = null;
    clone.strokeColor = new paper.Color(HOVER_COLOR);
    clone.strokeWidth = (path.strokeWidth || BASE_STROKE_WIDTH / paper.view.zoom) + 1.5 / paper.view.zoom;
    clone.bringToFront();
    hoverClone = clone;
  };

  const setAxis = (from: paper.Point, to: paper.Point) => {
    const dir = to.subtract(from);
    if (dir.length < 1e-6) return false;
    axisPoint = from.clone();
    axisDirection = dir;
    phase = 'ready';
    isMirroringRef.current = true;
    return true;
  };

  const updatePreview = () => {
    clearPreview();
    if (!axisPoint || !axisDirection || targets.length === 0) return;
    preview = clonePreview(targets);
    applyMirrorSelection(preview, axisPoint, axisDirection);
    for (const item of preview) {
      item.data.isTemporary = true;
      item.selected = false;
      item.locked = true;
      item.opacity = 0.55;
      item.visible = true;
    }
  };

  const commit = (moveInstead: boolean) => {
    if (!axisPoint || !axisDirection || targets.length === 0) return;
    clearPreview();
    history.checkpoint();
    if (moveInstead) {
      applyMirrorSelection(targets, axisPoint, axisDirection);
      for (const item of targets) item.selected = true;
    } else {
      const copies = mirrorCopyItems(targets, axisPoint, axisDirection);
      paper.project.deselectAll();
      for (const copy of copies) {
        applyItemLayerStyle(copy);
        copy.selected = true;
      }
    }
    reset();
    onHint('Click a mirror line, or two points, to mirror again');
  };

  return {
    onMouseDown(event: paper.ToolEvent) {
      if (!isPrimaryButton(event) || isPanningRef.current || isSpacebarPanRef.current) return;
      const snap = findSnap(event.point, getSnapConfig());
      const pt = snap?.point ?? event.point;

      if (phase === 'idle') {
        const selected = collectSelectedTransformItems();
        if (selected.length === 0) {
          if (!trySelect(pt)) onHint('Select an item, then click a mirror line or first axis point');
          else onHint('Click a straight line, or two snapped points, to set the axis');
          return;
        }
        targets = selected;
        if (snap) {
          firstPoint = pt.clone();
          phase = 'second';
          isMirroringRef.current = true;
          onHint('Click the second axis point · Shift 45°');
          return;
        }
        const line = straightAxisAt(event.point);
        if (line && setAxis(line.from, line.to)) {
          updatePreview();
          onHint('Click to place the mirrored copy · Alt = move instead of copy');
          return;
        }
        firstPoint = pt.clone();
        phase = 'second';
        isMirroringRef.current = true;
        onHint('Click the second axis point · Shift 45°');
        return;
      }

      if (phase === 'second' && firstPoint) {
        const raw = snap?.point ?? event.point;
        const dest = isShiftHeld(event) ? constrainToAxis(firstPoint, raw) : raw;
        if (!setAxis(firstPoint, dest)) return;
        commit(isAltHeld(event));
        return;
      }

      if (phase === 'ready') commit(isAltHeld(event));
    },

    onMouseMove(event: paper.ToolEvent) {
      const snap = findSnap(event.point, getSnapConfig());
      if (phase === 'idle') {
        if (collectSelectedTransformItems().length === 0) {
          clearHover();
          return;
        }
        if (snap) {
          clearHover();
          return;
        }
        const line = straightAxisAt(event.point);
        if (line) highlightEntity(line.path);
        else clearHover();
        return;
      }
      clearHover();
      if (phase === 'second' && firstPoint) {
        const raw = snap?.point ?? event.point;
        const dest = isShiftHeld(event) ? constrainToAxis(firstPoint, raw) : raw;
        if (setAxis(firstPoint, dest)) {
          phase = 'second';
          updatePreview();
        }
      }
    },

    onMouseDrag(event: paper.ToolEvent) {
      if (isPanningRef.current || isSpacebarPanRef.current) handleDragPan(event);
    },

    cancel() {
      if (phase === 'idle' && preview.length === 0) return;
      reset();
      onHint(null);
    },

    isBusy() {
      return phase !== 'idle';
    },
  };
}

export type MirrorTool = ReturnType<typeof createMirrorTool>;
