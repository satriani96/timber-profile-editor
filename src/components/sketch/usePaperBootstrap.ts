import { useEffect, type RefObject } from 'react';
import paper from 'paper';

/**
 * One-time Paper.js setup on the canvas and resize sync. Does not recreate the project on resize.
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
    return () => window.removeEventListener('resize', resizePaperCanvas);
  }, [canvasRef, setPaperReady, setZoom]);
}
