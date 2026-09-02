import { useEffect, type MutableRefObject } from 'react';
import paper from 'paper';
import type { SketchTool } from '../../types';
import type { SketchHistory } from '../../canvas/history';
import type { DrawingSession } from './useDrawingSession';
import type { NumericInput } from './useNumericInput';
import { isSketchPath } from '../../canvas/geometry/pathCuts';

interface Args {
  activeTool: SketchTool;
  setActiveTool: (tool: SketchTool) => void;
  numeric: NumericInput;
  session: DrawingSession;
  history: SketchHistory;
  isSpacebarPanRef: MutableRefObject<boolean>;
  previousToolRef: MutableRefObject<SketchTool>;
  currentSplineRef: MutableRefObject<paper.Path | null>;
  cornerPointRef: MutableRefObject<paper.Point | null>;
  cancelSpline: () => void;
  cancelCurrentDrawing: () => void;
  afterHistoryChange: () => void;
  zoomToFit: () => void;
  cancelDimension: () => void;
  isDimensioningRef: MutableRefObject<boolean>;
  cancelMarquee: () => void;
  isMarqueeing: () => boolean;
  cancelTransform: () => void;
  isTransforming: () => boolean;
  cancelPaste: () => void;
  isPasting: () => boolean;
  beginPaste: () => void;
  copySelection: () => void;
  cutSelection: () => void;
}

const TOOL_SHORTCUTS: Record<string, SketchTool> = {
  v: 'select',
  l: 'line',
  r: 'square',
  c: 'circle',
  s: 'fitspline',
  f: 'fillet',
  t: 'trim',
  x: 'split',
  d: 'dimension',
  m: 'move',
  q: 'rotate',
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Global keyboard handling: shortcuts, undo/redo, Escape/Delete, Space-to-pan, Tab for length/size while drawing. */
export function useSketchKeyboard({
  activeTool,
  setActiveTool,
  numeric,
  session,
  history,
  isSpacebarPanRef,
  previousToolRef,
  currentSplineRef,
  cornerPointRef,
  cancelSpline,
  cancelCurrentDrawing,
  afterHistoryChange,
  zoomToFit,
  cancelDimension,
  isDimensioningRef,
  cancelMarquee,
  isMarqueeing,
  cancelTransform,
  isTransforming,
  cancelPaste,
  isPasting,
  beginPaste,
  copySelection,
  cutSelection,
}: Args) {
  useEffect(() => {
    const abortInProgressWork = () => {
      if (session.isDrawingLineRef.current) cancelCurrentDrawing();
      if (currentSplineRef.current) cancelSpline();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (numeric.isActive || isTypingTarget(event.target)) return;
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (meta && key === 'z') {
        event.preventDefault();
        abortInProgressWork();
        if (event.shiftKey ? history.redo() : history.undo()) afterHistoryChange();
        return;
      }
      if (meta && key === 'y') {
        event.preventDefault();
        abortInProgressWork();
        if (history.redo()) afterHistoryChange();
        return;
      }
      if (meta && key === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }
      if (meta && key === 'x') {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (meta && key === 'v') {
        event.preventDefault();
        beginPaste();
        return;
      }
      if (meta) return;

      switch (event.key) {
        case 'Delete':
        case 'Backspace': {
          const canDelete =
            activeTool === 'select' || ((activeTool === 'move' || activeTool === 'rotate') && !isTransforming());
          if (!canDelete) return;
          event.preventDefault();
          const doomed = paper.project.selectedItems.filter(
            (item) => isSketchPath(item) || item.data?.isMeasurement || item.data?.isDimension
          );
          if (!doomed.length) return;
          history.checkpoint();
          doomed.forEach((item) => item.remove());
          return;
        }
        case 'Escape':
          if (isMarqueeing()) {
            cancelMarquee();
            return;
          }
          if (isPasting()) {
            cancelPaste();
            return;
          }
          if (isTransforming()) {
            cancelTransform();
            return;
          }
          if (isDimensioningRef.current) {
            cancelDimension();
            return;
          }
          if (session.isDrawingLineRef.current) cancelCurrentDrawing();
          else if (currentSplineRef.current) cancelSpline();
          else if (numeric.isActive) numeric.reset();
          else setActiveTool('select');
          return;
        case ' ':
          if (!isSpacebarPanRef.current) {
            event.preventDefault();
            isSpacebarPanRef.current = true;
            previousToolRef.current = activeTool;
            setActiveTool('pan');
          }
          return;
        case 'Tab':
          if (
            session.isDrawingLineRef.current ||
            (activeTool === 'fillet' && cornerPointRef.current) ||
            ((activeTool === 'move' || activeTool === 'rotate') && isTransforming())
          ) {
            event.preventDefault();
            numeric.openForCurrentTool();
          }
          return;
        case 'Home':
          event.preventDefault();
          zoomToFit();
          return;
      }

      const shortcut = TOOL_SHORTCUTS[key];
      if (
        shortcut &&
        !event.altKey &&
        !session.isDrawingLineRef.current &&
        !currentSplineRef.current &&
        !isDimensioningRef.current
      ) {
        setActiveTool(shortcut);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && isSpacebarPanRef.current) {
        isSpacebarPanRef.current = false;
        setActiveTool(previousToolRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    activeTool,
    setActiveTool,
    numeric,
    session,
    history,
    isSpacebarPanRef,
    previousToolRef,
    currentSplineRef,
    cornerPointRef,
    cancelSpline,
    cancelCurrentDrawing,
    afterHistoryChange,
    zoomToFit,
    cancelDimension,
    isDimensioningRef,
    cancelMarquee,
    isMarqueeing,
    cancelTransform,
    isTransforming,
    cancelPaste,
    isPasting,
    beginPaste,
    copySelection,
    cutSelection,
  ]);
}
