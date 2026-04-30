import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import paper from 'paper';
import { createLineTool } from '../../canvas/tools/LineTool';
import { createSelectTool } from '../../canvas/tools/SelectTool';
import { createSquareTool } from '../../canvas/tools/SquareTool';
import { createCircleTool } from '../../canvas/tools/CircleTool';
import { createFilletTool } from '../../canvas/tools/FilletTool';
import { createFitSplineTool } from '../../canvas/tools/FitSplineTool';
import { createTrimTool } from '../../canvas/tools/TrimTool';
import { getSnapPoint } from '../../utils/snapHelpers';
import type { SnapConfig } from '../../utils/snapHelpers';
import type { ImageUpload } from '../../canvas/ImageUpload';

export interface SketchPaperToolsContext {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imageUploadRef: MutableRefObject<ImageUpload | null>;
  selectToolRef: MutableRefObject<paper.Tool | null>;
  lineToolRef: MutableRefObject<paper.Tool | null>;
  squareToolRef: MutableRefObject<paper.Tool | null>;
  circleToolRef: MutableRefObject<paper.Tool | null>;
  panToolRef: MutableRefObject<paper.Tool | null>;
  filletToolRef: MutableRefObject<paper.Tool | null>;
  filletToolInstanceRef: MutableRefObject<ReturnType<typeof createFilletTool> | null>;
  trimToolRef: MutableRefObject<paper.Tool | null>;
  trimToolInstanceRef: MutableRefObject<ReturnType<typeof createTrimTool> | null>;
  fitSplineToolRef: MutableRefObject<paper.Tool | null>;
  fitSplineToolInstanceRef: MutableRefObject<ReturnType<typeof createFitSplineTool> | null>;
  currentSplineRef: MutableRefObject<paper.Path | null>;
  isDrawingSplineRef: MutableRefObject<boolean>;
  selectedSplinePointRef: MutableRefObject<{ path: paper.Path; index: number } | null>;
  snapIndicatorRef: MutableRefObject<paper.Path.Circle | null>;
  currentPathRef: MutableRefObject<paper.Path | null>;
  isDrawingLineRef: MutableRefObject<boolean>;
  draggedSegmentRef: MutableRefObject<paper.Segment | null>;
  path1Ref: MutableRefObject<paper.Path | null>;
  path2Ref: MutableRefObject<paper.Path | null>;
  cornerPointRef: MutableRefObject<paper.Point | null>;
  lastFilletRadiusRef: MutableRefObject<number>;
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  setIsNumericInputActive: Dispatch<SetStateAction<boolean>>;
  setNumericInputPosition: Dispatch<SetStateAction<{ x: number; y: number } | null>>;
  setIsSplineDrawing: Dispatch<SetStateAction<boolean>>;
  setSplineSegmentCount: Dispatch<SetStateAction<number>>;
  finishCurrentDrawing: () => void;
  finishCurrentFilletOperation: () => void;
  finishCurrentSpline: () => void;
  resetNumericInput: () => void;
}

/** Wire Paper.Tool handlers once the project exists. Must not call paper.setup. */
export function attachSketchPaperTools(ctx: SketchPaperToolsContext): void {
  const canvas = ctx.canvasRef.current;
  if (!canvas) return;

  if (!ctx.selectToolRef.current) ctx.selectToolRef.current = new paper.Tool();
  if (!ctx.lineToolRef.current) ctx.lineToolRef.current = new paper.Tool();
  if (!ctx.squareToolRef.current) ctx.squareToolRef.current = new paper.Tool();
  if (!ctx.circleToolRef.current) ctx.circleToolRef.current = new paper.Tool();
  if (!ctx.panToolRef.current) ctx.panToolRef.current = new paper.Tool();
  if (!ctx.filletToolRef.current) ctx.filletToolRef.current = new paper.Tool();

  const snapTolerance = 6;
  const snapConfig: SnapConfig = {
    snapTolerance,
    currentPathRef: ctx.currentPathRef,
    snapIndicatorRef: ctx.snapIndicatorRef,
    enableEndpointSnap: true,
    enableMidpointSnap: true,
    enableIntersectionSnap: false,
  };

  const handleDragPan = (event: paper.ToolEvent) => {
    if (paper && ctx.canvasRef.current) {
      const view = paper.project.view;
      view.translate(new paper.Point(event.delta.x, event.delta.y));
    }
  };

  const handleVertexDrag = (event: paper.ToolEvent) => {
    if (ctx.draggedSegmentRef.current) {
      const draggedSegment = ctx.draggedSegmentRef.current;
      const path = draggedSegment.path;
      const snapPoint = getSnapPoint(event.point, snapConfig, path);
      draggedSegment.point = snapPoint || event.point;
      if (
        path &&
        !path.data?.isSpline &&
        !path.data?.isArc &&
        !path.data?.center &&
        !path.data?.radius
      ) {
        for (const segment of path.segments) {
          segment.handleIn.set(0, 0);
          segment.handleOut.set(0, 0);
        }
      }
    }
  };

  const commonDrawingState = {
    currentPathRef: ctx.currentPathRef,
    isDrawingLineRef: ctx.isDrawingLineRef,
    snapIndicatorRef: ctx.snapIndicatorRef,
    finishCurrentDrawing: ctx.finishCurrentDrawing,
    resetNumericInput: ctx.resetNumericInput,
    getSnapPoint: (point: paper.Point, pathToIgnore?: paper.Path | null) =>
      getSnapPoint(point, snapConfig, pathToIgnore),
    isPanningRef: ctx.isPanningRef,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
    handleDragPan,
  };

  if (!ctx.fitSplineToolRef.current) {
    ctx.fitSplineToolRef.current = new paper.Tool();
  }
  const fitSplineTool = createFitSplineTool({
    currentSplineRef: ctx.currentSplineRef,
    isDrawingSplineRef: ctx.isDrawingSplineRef,
    selectedSplinePointRef: ctx.selectedSplinePointRef,
    finishCurrentSpline: ctx.finishCurrentSpline,
    isPanningRef: ctx.isPanningRef,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
    handleDragPan,
    setIsSplineDrawing: ctx.setIsSplineDrawing,
    setSplineSegmentCount: ctx.setSplineSegmentCount,
  });
  ctx.fitSplineToolInstanceRef.current = fitSplineTool;
  ctx.fitSplineToolRef.current.onMouseDown = fitSplineTool.onMouseDown;
  ctx.fitSplineToolRef.current.onMouseDrag = fitSplineTool.onMouseDrag;
  ctx.fitSplineToolRef.current.onMouseMove = fitSplineTool.onMouseMove;
  ctx.fitSplineToolRef.current.onMouseUp = fitSplineTool.onMouseUp;
  ctx.fitSplineToolRef.current.onKeyDown = fitSplineTool.onKeyDown;

  if (ctx.imageUploadRef.current?.state.imageUrl && paper.project) {
    ctx.imageUploadRef.current.loadImage(ctx.imageUploadRef.current.state.imageUrl);
  }

  if (ctx.filletToolRef.current) {
    ctx.filletToolInstanceRef.current = null;
    const filletTool = createFilletTool({
      path1Ref: ctx.path1Ref,
      path2Ref: ctx.path2Ref,
      cornerPointRef: ctx.cornerPointRef,
      lastFilletRadiusRef: ctx.lastFilletRadiusRef,
      setIsNumericInputActive: ctx.setIsNumericInputActive,
      setNumericInputPosition: ctx.setNumericInputPosition,
      finishCurrentFilletOperation: ctx.finishCurrentFilletOperation,
      isSpacebarPanRef: ctx.isSpacebarPanRef,
    });
    ctx.filletToolInstanceRef.current = filletTool;
    ctx.filletToolRef.current.onMouseDown = filletTool.onMouseDown;
    ctx.filletToolRef.current.onKeyDown = filletTool.onKeyDown;
  }

  if (ctx.lineToolRef.current) {
    const lineTool = createLineTool(ctx.canvasRef, commonDrawingState);
    ctx.lineToolRef.current.onMouseDown = lineTool.onMouseDown;
    ctx.lineToolRef.current.onMouseMove = lineTool.onMouseMove;
    ctx.lineToolRef.current.onMouseDrag = lineTool.onMouseDrag;
  }

  if (ctx.selectToolRef.current) {
    const selectTool = createSelectTool(ctx.canvasRef, {
      draggedSegmentRef: ctx.draggedSegmentRef,
      isPanningRef: ctx.isPanningRef,
      isSpacebarPanRef: ctx.isSpacebarPanRef,
      handleDragPan,
      handleVertexDrag,
    });
    ctx.selectToolRef.current.onMouseDown = selectTool.onMouseDown;
    ctx.selectToolRef.current.onMouseDrag = selectTool.onMouseDrag;
    ctx.selectToolRef.current.onMouseUp = selectTool.onMouseUp;
  }

  if (ctx.squareToolRef.current) {
    const squareTool = createSquareTool(ctx.canvasRef, commonDrawingState);
    ctx.squareToolRef.current.onMouseDown = squareTool.onMouseDown;
    ctx.squareToolRef.current.onMouseMove = squareTool.onMouseMove;
    ctx.squareToolRef.current.onMouseDrag = squareTool.onMouseDrag;
  }

  if (ctx.circleToolRef.current) {
    const circleTool = createCircleTool(ctx.canvasRef, commonDrawingState);
    ctx.circleToolRef.current.onMouseDown = circleTool.onMouseDown;
    ctx.circleToolRef.current.onMouseMove = circleTool.onMouseMove;
    ctx.circleToolRef.current.onMouseDrag = circleTool.onMouseDrag;
  }

  if (ctx.panToolRef.current) {
    ctx.panToolRef.current.onMouseDrag = handleDragPan;
  }

  if (!ctx.trimToolRef.current) {
    ctx.trimToolRef.current = new paper.Tool();
  }
  const trimTool = createTrimTool({
    finishCurrentDrawing: ctx.finishCurrentDrawing,
    isPanningRef: ctx.isPanningRef,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
    handleDragPan,
  });
  ctx.trimToolInstanceRef.current = trimTool;
  ctx.trimToolRef.current.onMouseMove = trimTool.onMouseMove;
  ctx.trimToolRef.current.onMouseDown = trimTool.onMouseDown;
  ctx.trimToolRef.current.onMouseDrag = trimTool.onMouseDrag;
}
