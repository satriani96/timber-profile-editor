import { useCallback, useRef } from 'react';

/** Paths shorter than this after a drawing gesture are treated as accidental clicks. */
const MIN_PATH_LENGTH = 0.01;

/** Refs describing the shape currently being drawn by the Line/Rectangle/Circle tools. */
export function useDrawingSession() {
  const currentPathRef = useRef<paper.Path | null>(null);
  const isDrawingLineRef = useRef(false);
  const snapIndicatorRef = useRef<paper.Item | null>(null);

  const hideSnapIndicator = useCallback(() => {
    snapIndicatorRef.current?.remove();
    snapIndicatorRef.current = null;
  }, []);

  /** Commit the in-progress shape (dropping degenerate ones) and leave drawing mode. */
  const finishCurrentDrawing = useCallback(() => {
    const path = currentPathRef.current;
    if (path && path.length < MIN_PATH_LENGTH) path.remove();
    isDrawingLineRef.current = false;
    currentPathRef.current = null;
    hideSnapIndicator();
  }, [hideSnapIndicator]);

  /** Discard the in-progress shape entirely. */
  const cancelDrawing = useCallback(() => {
    currentPathRef.current?.remove();
    currentPathRef.current = null;
    isDrawingLineRef.current = false;
    hideSnapIndicator();
  }, [hideSnapIndicator]);

  return { currentPathRef, isDrawingLineRef, snapIndicatorRef, finishCurrentDrawing, cancelDrawing, hideSnapIndicator };
}

export type DrawingSession = ReturnType<typeof useDrawingSession>;
