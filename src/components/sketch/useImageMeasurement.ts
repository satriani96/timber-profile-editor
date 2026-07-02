import { useEffect, type MutableRefObject, type RefObject } from 'react';
import paper from 'paper';
import { BASE_STROKE_WIDTH } from './constants';

type Args = {
  measureActive: boolean;
  paperReady: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  measurementPointsRef: MutableRefObject<paper.Point[]>;
  measurementMarkersRef: MutableRefObject<paper.Path.Circle[]>;
};

const MEASURE_COLOR = '#e11d48';

export function useImageMeasurement({
  measureActive,
  paperReady,
  canvasRef,
  measurementPointsRef,
  measurementMarkersRef,
}: Args) {
  useEffect(() => {
    if (!measureActive) return;
    if (!paperReady) return;

    const handleMeasureClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (event.clientX - rect.left) * dpr;
      const y = (event.clientY - rect.top) * dpr;
      const point = paper.view.viewToProject(new paper.Point(x / dpr, y / dpr));

      measurementPointsRef.current.push(point);

      const marker = new paper.Path.Circle({
        center: point,
        radius: 5 / paper.view.zoom,
        fillColor: new paper.Color(MEASURE_COLOR),
        strokeColor: new paper.Color('white'),
        strokeWidth: 1.5 / paper.view.zoom,
        data: { isTemporary: true },
      });
      measurementMarkersRef.current.push(marker);

      if (measurementPointsRef.current.length === 2) {
        const [p1, p2] = measurementPointsRef.current;
        const dist = p1.getDistance(p2);
        const zoom = paper.view.zoom;

        const line = new paper.Path.Line({
          from: p1,
          to: p2,
          strokeColor: new paper.Color(MEASURE_COLOR),
          strokeWidth: BASE_STROKE_WIDTH / zoom,
        });

        const endpoint1 = new paper.Path.Circle({
          center: p1,
          radius: 4 / zoom,
          fillColor: new paper.Color(MEASURE_COLOR),
        });
        const endpoint2 = new paper.Path.Circle({
          center: p2,
          radius: 4 / zoom,
          fillColor: new paper.Color(MEASURE_COLOR),
        });

        const mid = p1.add(p2).divide(2);
        const label = new paper.PointText({
          point: mid.add(new paper.Point(0, -8 / zoom)),
          content: `${dist.toFixed(1)} mm`,
          fillColor: new paper.Color(MEASURE_COLOR),
          fontSize: 14 / zoom,
          justification: 'center',
        });

        const group = new paper.Group([line, endpoint1, endpoint2, label]);
        group.data = { isMeasurement: true };

        measurementMarkersRef.current.forEach((m) => m.remove());
        measurementMarkersRef.current = [];
        measurementPointsRef.current = [];
        paper.view.update();
      }
    };

    const canvas = canvasRef.current;
    if (canvas) canvas.addEventListener('mousedown', handleMeasureClick);
    return () => {
      if (canvas) canvas.removeEventListener('mousedown', handleMeasureClick);
      // Clean up any dangling temporary markers if measure mode is exited mid-measurement
      measurementMarkersRef.current.forEach((m) => m.remove());
      measurementMarkersRef.current = [];
      measurementPointsRef.current = [];
    };
  }, [
    measureActive,
    paperReady,
    canvasRef,
    measurementPointsRef,
    measurementMarkersRef,
  ]);
}
