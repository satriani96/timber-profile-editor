import { useEffect, type RefObject } from 'react';
import paper from 'paper';

/**
 * One-time Paper.js setup on the canvas and size sync. Does not recreate the
 * project on resize. Tracks the canvas element's own size (not just the
 * window) so docked dev tools or layout changes keep the view in sync.
 */
export function usePaperBootstrap(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  setPaperReady: (ready: boolean) => void,
  setZoom: (z: number) => void
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = paper.view as { element?: HTMLCanvasElement } | undefined;
    if (!view || view.element !== canvas) {
      paper.setup(canvas);
    }
    setPaperReady(true);
    setZoom(paper.view.zoom);

    // Size the view from the container in CSS pixels and let Paper own the backing store.
    // Paper's viewSize setter multiplies by the device pixel ratio and applies the matching
    // context scale itself; touching canvas.width/height here would reset that transform
    // (which on HiDPI screens shows up as offset drawing, ghost trails and offset hit-testing).
    function resizePaperCanvas() {
      if (!canvas || !paper.view) return;
      const rect = (canvas.parentElement ?? canvas).getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const size = new paper.Size(rect.width, rect.height);
      if (!paper.view.viewSize.equals(size)) paper.view.viewSize = size;
    }
    resizePaperCanvas();
    window.addEventListener('resize', resizePaperCanvas);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizePaperCanvas) : null;
    if (canvas.parentElement) observer?.observe(canvas.parentElement);
    return () => {
      window.removeEventListener('resize', resizePaperCanvas);
      observer?.disconnect();
    };
  }, [canvasRef, setPaperReady, setZoom]);
}
