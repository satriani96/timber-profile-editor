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

    function resizePaperCanvas() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      if (paper.view) {
        paper.view.viewSize = new paper.Size(rect.width, rect.height);
      }
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
