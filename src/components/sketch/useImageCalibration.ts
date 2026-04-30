import { useEffect, type MutableRefObject, type RefObject } from 'react';
import paper from 'paper';
import type { ImageUpload } from '../../canvas/ImageUpload';

type Args = {
  calibrateActive: boolean;
  paperReady: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imageUploadRef: MutableRefObject<ImageUpload | null>;
  calibrationMarkersRef: MutableRefObject<paper.Path.Circle[]>;
  setCalibrateActive: (v: boolean | ((prev: boolean) => boolean)) => void;
};

export function useImageCalibration({
  calibrateActive,
  paperReady,
  canvasRef,
  imageUploadRef,
  calibrationMarkersRef,
  setCalibrateActive,
}: Args) {
  useEffect(() => {
    if (!calibrateActive) return;
    if (!paperReady || !imageUploadRef.current) return;

    const handleCalibrateClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (event.clientX - rect.left) * dpr;
      const y = (event.clientY - rect.top) * dpr;
      const point = paper.view.viewToProject(new paper.Point(x / dpr, y / dpr));
      if (!imageUploadRef.current) return;
      imageUploadRef.current.setCalibrationPoint(point);
      const marker = new paper.Path.Circle({
        center: point,
        radius: 6 / paper.view.zoom,
        fillColor: new paper.Color('blue'),
        strokeColor: new paper.Color('white'),
        strokeWidth: 2 / paper.view.zoom,
        opacity: 0.7,
        data: { isTemporary: true },
      });
      calibrationMarkersRef.current.push(marker);
      if (imageUploadRef.current.state.calibrationPoints.length === 2) {
        setTimeout(() => {
          const input = window.prompt(
            'Enter real-world distance between the two points (mm):',
            '100'
          );
          if (input) {
            const dist = parseFloat(input);
            if (!isNaN(dist) && dist > 0 && imageUploadRef.current) {
              imageUploadRef.current.calibrate(dist);
            } else {
              alert('Invalid distance. Calibration cancelled.');
            }
          }
          calibrationMarkersRef.current.forEach((m) => m.remove());
          calibrationMarkersRef.current = [];
          if (imageUploadRef.current) imageUploadRef.current.state.calibrationPoints = [];
          setCalibrateActive(false);
        }, 200);
      }
    };
    const canvas = canvasRef.current;
    if (canvas) canvas.addEventListener('mousedown', handleCalibrateClick);
    return () => {
      if (canvas) canvas.removeEventListener('mousedown', handleCalibrateClick);
    };
  }, [
    calibrateActive,
    paperReady,
    canvasRef,
    imageUploadRef,
    calibrationMarkersRef,
    setCalibrateActive,
  ]);
}
