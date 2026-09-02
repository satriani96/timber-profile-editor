import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import paper from 'paper';
import { createLineTool } from '../../canvas/tools/LineTool';
import { createSelectTool } from '../../canvas/tools/SelectTool';
import { createSquareTool } from '../../canvas/tools/SquareTool';
import { createCircleTool } from '../../canvas/tools/CircleTool';
import { createFilletTool } from '../../canvas/tools/FilletTool';
import { createFitSplineTool } from '../../canvas/tools/FitSplineTool';
import { createSplitTool, createTrimTool } from '../../canvas/tools/CutTool';
import { createDimensionTool } from '../../canvas/tools/DimensionTool';
import { adoptGeometry, isPrimaryButton, type DrawingState } from '../../canvas/tools/drawingState';
import { movePath, preserveMeta } from '../../canvas/geometry/itemData';
import { getSnapPoint } from '../../utils/snapHelpers';
import type { SnapConfig } from '../../utils/snapHelpers';
import type { ImageUpload } from '../../canvas/ImageUpload';
import type { SketchHistory } from '../../canvas/history';

export interface SketchPaperToolsContext {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imageUploadRef: MutableRefObject<ImageUpload | null>;
  history: SketchHistory;
  selectToolRef: MutableRefObject<paper.Tool | null>;
  lineToolRef: MutableRefObject<paper.Tool | null>;
  lineToolInstanceRef: MutableRefObject<ReturnType<typeof createLineTool> | null>;
  squareToolRef: MutableRefObject<paper.Tool | null>;
  circleToolRef: MutableRefObject<paper.Tool | null>;
  panToolRef: MutableRefObject<paper.Tool | null>;
  filletToolRef: MutableRefObject<paper.Tool | null>;
  filletToolInstanceRef: MutableRefObject<ReturnType<typeof createFilletTool> | null>;
  trimToolRef: MutableRefObject<paper.Tool | null>;
  trimToolInstanceRef: MutableRefObject<ReturnType<typeof createTrimTool> | null>;
  splitToolRef: MutableRefObject<paper.Tool | null>;
  splitToolInstanceRef: MutableRefObject<ReturnType<typeof createSplitTool> | null>;
  fitSplineToolRef: MutableRefObject<paper.Tool | null>;
  fitSplineToolInstanceRef: MutableRefObject<ReturnType<typeof createFitSplineTool> | null>;
  dimensionToolRef: MutableRefObject<paper.Tool | null>;
  dimensionToolInstanceRef: MutableRefObject<ReturnType<typeof createDimensionTool> | null>;
  isDimensioningRef: MutableRefObject<boolean>;
  onDimensionPlaced: (group: paper.Group) => void;
  currentSplineRef: MutableRefObject<paper.Path | null>;
  isDrawingSplineRef: MutableRefObject<boolean>;
  selectedSplinePointRef: MutableRefObject<{ path: paper.Path; index: number } | null>;
  snapIndicatorRef: MutableRefObject<paper.Item | null>;
  currentPathRef: MutableRefObject<paper.Path | null>;
  isDrawingLineRef: MutableRefObject<boolean>;
  draggedSegmentRef: MutableRefObject<paper.Segment | null>;
  path1Ref: MutableRefObject<paper.Path | null>;
  path2Ref: MutableRefObject<paper.Path | null>;
  cornerPointRef: MutableRefObject<paper.Point | null>;
  lastFilletRadiusRef: MutableRefObject<number>;
  isPanningRef: MutableRefObject<boolean>;
  isSpacebarPanRef: MutableRefObject<boolean>;
  openRadiusInput: (viewPosition: { x: number; y: number }) => void;
  setIsSplineDrawing: Dispatch<SetStateAction<boolean>>;
  setSplineSegmentCount: Dispatch<SetStateAction<number>>;
  finishCurrentDrawing: () => void;
  finishCurrentFilletOperation: () => void;
  finishCurrentSpline: () => void;
  resetNumericInput: () => void;
}

const SNAP_TOLERANCE_PX = 10;

/** Wire Paper.Tool handlers once the project exists. Must not call paper.setup. */
export function attachSketchPaperTools(ctx: SketchPaperToolsContext): void {
  const canvas = ctx.canvasRef.current;
  if (!canvas) return;

  const ensureTool = (ref: MutableRefObject<paper.Tool | null>) => {
    if (!ref.current) ref.current = new paper.Tool();
    return ref.current;
  };

  const snapConfig: SnapConfig = {
    snapTolerancePx: SNAP_TOLERANCE_PX,
    currentPathRef: ctx.currentPathRef,
    snapIndicatorRef: ctx.snapIndicatorRef,
  };

  /**
   * Records an undo checkpoint before a mutating gesture starts. Mid-gesture
   * clicks (second click of a line, spline vertices) are skipped so undo never
   * restores a half-drawn rubber band.
   */
  const withCheckpoint =
    (handler: (event: paper.ToolEvent) => void) =>
    (event: paper.ToolEvent) => {
      if (
        isPrimaryButton(event) &&
        !ctx.isPanningRef.current &&
        !ctx.isSpacebarPanRef.current &&
        !ctx.isDrawingLineRef.current &&
        !ctx.currentSplineRef.current &&
        !ctx.isDimensioningRef.current
      ) {
        ctx.history.checkpoint();
      }
      handler(event);
    };

  const handleDragPan = (event: paper.ToolEvent) => {
    paper.project.view.translate(new paper.Point(event.delta.x, event.delta.y));
  };

  const handleVertexDrag = (event: paper.ToolEvent) => {
    const draggedSegment = ctx.draggedSegmentRef.current;
    if (!draggedSegment) return;
    const path = draggedSegment.path;
    const snapPoint = getSnapPoint(event.point, snapConfig, path);
    const target = snapPoint || event.point;

    const data = path?.data ?? {};
    if (path && data.center instanceof paper.Point && typeof data.radius === 'number') {
      if (data.isArc === false) {
        // Dragging a circle's quadrant resizes it instead of denting it.
        const radius = Math.max(1e-6, data.center.getDistance(target));
        adoptGeometry(path, new paper.Path.Circle({ center: data.center, radius, insert: false }));
        path.data = preserveMeta(path, { center: data.center, radius, isArc: false });
      } else {
        // Arcs stay circular: a vertex drag moves the whole arc.
        movePath(path, event.delta);
      }
      path.selected = true;
      return;
    }

    draggedSegment.point = target;
    if (path && !data.isSpline && !data.isArc && !data.center) {
      for (const segment of path.segments) {
        segment.handleIn.set(0, 0);
        segment.handleOut.set(0, 0);
      }
      if (data.isRect) path.data = {};
    }
  };

  const drawingState: DrawingState = {
    currentPathRef: ctx.currentPathRef,
    isDrawingLineRef: ctx.isDrawingLineRef,
    snapIndicatorRef: ctx.snapIndicatorRef,
    finishCurrentDrawing: ctx.finishCurrentDrawing,
    resetNumericInput: ctx.resetNumericInput,
    getSnapPoint: (point, pathToIgnore) => getSnapPoint(point, snapConfig, pathToIgnore),
    isPanningRef: ctx.isPanningRef,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
    handleDragPan,
  };

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
  const fitSplinePaperTool = ensureTool(ctx.fitSplineToolRef);
  fitSplinePaperTool.onMouseDown = withCheckpoint(fitSplineTool.onMouseDown);
  fitSplinePaperTool.onMouseDrag = fitSplineTool.onMouseDrag;
  fitSplinePaperTool.onMouseMove = fitSplineTool.onMouseMove;
  fitSplinePaperTool.onMouseUp = fitSplineTool.onMouseUp;
  fitSplinePaperTool.onKeyDown = fitSplineTool.onKeyDown;

  if (ctx.imageUploadRef.current?.state.imageUrl && paper.project) {
    ctx.imageUploadRef.current.loadImage(ctx.imageUploadRef.current.state.imageUrl);
  }

  const filletTool = createFilletTool({
    path1Ref: ctx.path1Ref,
    path2Ref: ctx.path2Ref,
    cornerPointRef: ctx.cornerPointRef,
    lastFilletRadiusRef: ctx.lastFilletRadiusRef,
    openRadiusInput: ctx.openRadiusInput,
    finishCurrentFilletOperation: ctx.finishCurrentFilletOperation,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
  });
  ctx.filletToolInstanceRef.current = filletTool;
  const filletPaperTool = ensureTool(ctx.filletToolRef);
  filletPaperTool.onMouseDown = withCheckpoint(filletTool.onMouseDown);
  filletPaperTool.onKeyDown = filletTool.onKeyDown;

  const lineTool = createLineTool(drawingState);
  ctx.lineToolInstanceRef.current = lineTool;
  const linePaperTool = ensureTool(ctx.lineToolRef);
  linePaperTool.onMouseDown = withCheckpoint(lineTool.onMouseDown);
  linePaperTool.onMouseMove = lineTool.onMouseMove;
  linePaperTool.onMouseDrag = lineTool.onMouseDrag;

  const selectTool = createSelectTool({
    draggedSegmentRef: ctx.draggedSegmentRef,
    isPanningRef: ctx.isPanningRef,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
    handleDragPan,
    handleVertexDrag,
  });
  const selectPaperTool = ensureTool(ctx.selectToolRef);
  selectPaperTool.onMouseDown = withCheckpoint(selectTool.onMouseDown);
  selectPaperTool.onMouseDrag = selectTool.onMouseDrag;
  selectPaperTool.onMouseUp = () => {
    selectTool.onMouseUp();
    ctx.snapIndicatorRef.current?.remove();
    ctx.snapIndicatorRef.current = null;
  };

  const squareTool = createSquareTool(drawingState);
  const squarePaperTool = ensureTool(ctx.squareToolRef);
  squarePaperTool.onMouseDown = withCheckpoint(squareTool.onMouseDown);
  squarePaperTool.onMouseMove = squareTool.onMouseMove;
  squarePaperTool.onMouseDrag = squareTool.onMouseDrag;

  const circleTool = createCircleTool(drawingState);
  const circlePaperTool = ensureTool(ctx.circleToolRef);
  circlePaperTool.onMouseDown = withCheckpoint(circleTool.onMouseDown);
  circlePaperTool.onMouseMove = circleTool.onMouseMove;
  circlePaperTool.onMouseDrag = circleTool.onMouseDrag;

  const panPaperTool = ensureTool(ctx.panToolRef);
  panPaperTool.onMouseDrag = handleDragPan;

  const cutState = {
    isPanningRef: ctx.isPanningRef,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
    handleDragPan,
  };

  const trimTool = createTrimTool(cutState);
  ctx.trimToolInstanceRef.current = trimTool;
  const trimPaperTool = ensureTool(ctx.trimToolRef);
  trimPaperTool.onMouseMove = trimTool.onMouseMove;
  trimPaperTool.onMouseDown = withCheckpoint(trimTool.onMouseDown);
  trimPaperTool.onMouseDrag = trimTool.onMouseDrag;

  const splitTool = createSplitTool(cutState);
  ctx.splitToolInstanceRef.current = splitTool;
  const splitPaperTool = ensureTool(ctx.splitToolRef);
  splitPaperTool.onMouseMove = splitTool.onMouseMove;
  splitPaperTool.onMouseDown = withCheckpoint(splitTool.onMouseDown);
  splitPaperTool.onMouseDrag = splitTool.onMouseDrag;

  const dimensionTool = createDimensionTool({
    isPanningRef: ctx.isPanningRef,
    isSpacebarPanRef: ctx.isSpacebarPanRef,
    isDimensioningRef: ctx.isDimensioningRef,
    handleDragPan,
    getSnapConfig: () => snapConfig,
    onPlaced: ctx.onDimensionPlaced,
  });
  ctx.dimensionToolInstanceRef.current = dimensionTool;
  const dimensionPaperTool = ensureTool(ctx.dimensionToolRef);
  dimensionPaperTool.onMouseDown = withCheckpoint(dimensionTool.onMouseDown);
  dimensionPaperTool.onMouseMove = dimensionTool.onMouseMove;
  dimensionPaperTool.onMouseDrag = dimensionTool.onMouseDrag;
}
