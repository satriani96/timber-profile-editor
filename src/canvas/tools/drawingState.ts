import paper from 'paper';
import type { MutableRefObject } from 'react';
import { BASE_STROKE_WIDTH } from '../../components/sketch/constants';
import { getActiveLayerName, layerColor } from '../layers';

/** State shared by the Line, Square, and Circle tools. */
export interface DrawingState {
  currentPathRef: MutableRefObject<paper.Path | null>;
  isDrawingLineRef: MutableRefObject<boolean>;
  snapIndicatorRef: MutableRefObject<paper.Item | null>;
  finishCurrentDrawing: () => void;
  resetNumericInput: () => void;
  getSnapPoint: (point: paper.Point, pathToIgnore?: paper.Path | null) => paper.Point | null;
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  handleDragPan: (event: paper.ToolEvent) => void;
}

/** Paper forwards every mouse button to tools; drawing must only react to the primary one. */
export function isPrimaryButton(event: paper.ToolEvent): boolean {
  const native = (event as unknown as { event?: MouseEvent }).event;
  return !native || native.button === 0;
}

export function isShiftHeld(event: paper.ToolEvent): boolean {
  return Boolean((event.modifiers as { shift?: boolean } | undefined)?.shift);
}

export function sketchStrokeWidth(): number {
  return BASE_STROKE_WIDTH / paper.view.zoom;
}

export function sketchStrokeColor(): paper.Color {
  return new paper.Color(layerColor(getActiveLayerName()));
}

/** Replaces a path's geometry with that of a template path built with `insert: false`. */
export function adoptGeometry(target: paper.Path, template: paper.Path): void {
  target.segments = template.segments.map((s) => new paper.Segment(s.point, s.handleIn, s.handleOut));
  target.closed = template.closed;
  template.remove();
}
