import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import paper from 'paper';
import type { SketchTool } from '../../types';
import type { DrawingSession } from './useDrawingSession';
import type { createFilletTool } from '../../canvas/tools/FilletTool';
import type { createLineTool } from '../../canvas/tools/LineTool';
import { preserveMeta } from '../../canvas/geometry/itemData';
import { adoptGeometry } from '../../canvas/tools/drawingState';

export type NumericField = 'length' | 'angle' | 'width' | 'height' | 'diameter' | 'radius';

interface Args {
  activeTool: SketchTool;
  session: DrawingSession;
  cornerPointRef: MutableRefObject<paper.Point | null>;
  filletToolInstanceRef: MutableRefObject<ReturnType<typeof createFilletTool> | null>;
  lineToolInstanceRef: MutableRefObject<ReturnType<typeof createLineTool> | null>;
}

const EMPTY_VALUES: Record<NumericField, string> = {
  length: '',
  angle: '',
  width: '',
  height: '',
  diameter: '',
  radius: '',
};

/** Keyboard-driven dimension entry (Tab to open, Enter to apply, Escape to cancel). */
export function useNumericInput({ activeTool, session, cornerPointRef, filletToolInstanceRef, lineToolInstanceRef }: Args) {
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeInput, setActiveInput] = useState<NumericField>('length');
  const [values, setAllValues] = useState<Record<NumericField, string>>(EMPTY_VALUES);

  const refs: Record<NumericField, MutableRefObject<HTMLInputElement | null>> = {
    length: useRef<HTMLInputElement>(null),
    angle: useRef<HTMLInputElement>(null),
    width: useRef<HTMLInputElement>(null),
    height: useRef<HTMLInputElement>(null),
    diameter: useRef<HTMLInputElement>(null),
    radius: useRef<HTMLInputElement>(null),
  };

  const setValue = useCallback((field: NumericField, value: string) => {
    setAllValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  const reset = useCallback(() => {
    setIsActive(false);
    setAllValues(EMPTY_VALUES);
  }, []);

  const openAt = useCallback((field: NumericField, anchor: paper.Point) => {
    const viewPosition = paper.view.projectToView(anchor);
    setActiveInput(field);
    setPosition({ x: viewPosition.x + 15, y: viewPosition.y - 15 });
    setIsActive(true);
  }, []);

  /** Opens the panel for whatever the active tool is currently drawing. Returns false if nothing applies. */
  const openForCurrentTool = useCallback((): boolean => {
    const path = session.currentPathRef.current;
    let target: { field: NumericField; anchor: paper.Point } | null = null;
    if (activeTool === 'line' && path) target = { field: 'length', anchor: path.lastSegment.point };
    else if (activeTool === 'square' && path) target = { field: 'width', anchor: path.bounds.topRight };
    else if (activeTool === 'circle' && path) target = { field: 'diameter', anchor: path.bounds.rightCenter };
    else if (activeTool === 'fillet' && cornerPointRef.current) target = { field: 'radius', anchor: cornerPointRef.current };
    if (!target) return false;
    openAt(target.field, target.anchor);
    return true;
  }, [activeTool, cornerPointRef, openAt, session.currentPathRef]);

  const applyLine = useCallback(() => {
    const path = session.currentPathRef.current;
    const length = parseFloat(values.length);
    const angle = parseFloat(values.angle);
    if (!path || isNaN(length) || length <= 0) return;
    const start = path.firstSegment.point;
    const end = start.add(new paper.Point({ length, angle: isNaN(angle) ? path.lastSegment.point.subtract(start).angle : -angle }));
    path.lastSegment.point = end;
    session.finishCurrentDrawing();
    reset();
    lineToolInstanceRef.current?.beginAt(end);
  }, [lineToolInstanceRef, reset, session, values.angle, values.length]);

  const applyRectangle = useCallback(() => {
    const path = session.currentPathRef.current;
    const width = parseFloat(values.width);
    const height = parseFloat(values.height);
    if (!path || isNaN(width) || width <= 0 || isNaN(height) || height <= 0) return;
    const start = (path.data?.startPoint as paper.Point | undefined) ?? path.bounds.topLeft;
    const end = start.add([width, height]);
    adoptGeometry(path, new paper.Path.Rectangle({ from: start, to: end, insert: false }));
    path.data = preserveMeta(path, { isRect: true, startPoint: start, endPoint: end, width, height });
    session.finishCurrentDrawing();
    reset();
  }, [reset, session, values.height, values.width]);

  const applyCircle = useCallback(() => {
    const path = session.currentPathRef.current;
    const diameter = parseFloat(values.diameter);
    if (!path || isNaN(diameter) || diameter <= 0) return;
    const center = path.data.center as paper.Point;
    adoptGeometry(path, new paper.Path.Circle({ center, radius: diameter / 2, insert: false }));
    path.data = preserveMeta(path, { center, radius: diameter / 2, isArc: false });
    session.finishCurrentDrawing();
    reset();
  }, [reset, session, values.diameter]);

  const applyFillet = useCallback(() => {
    const radius = parseFloat(values.radius);
    if (!isNaN(radius) && radius > 0) filletToolInstanceRef.current?.applyFillet(radius);
  }, [filletToolInstanceRef, values.radius]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (activeTool === 'line') applyLine();
        else if (activeTool === 'square') applyRectangle();
        else if (activeTool === 'circle') applyCircle();
        else if (activeTool === 'fillet') applyFillet();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        session.cancelDrawing();
        reset();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (activeTool === 'line') setActiveInput((prev) => (prev === 'length' ? 'angle' : 'length'));
        else if (activeTool === 'square') setActiveInput((prev) => (prev === 'width' ? 'height' : 'width'));
      }
    },
    [activeTool, applyCircle, applyFillet, applyLine, applyRectangle, reset, session]
  );

  useEffect(() => {
    if (!isActive) return;
    const input = refs[activeInput].current;
    const timer = setTimeout(() => {
      input?.focus();
      input?.select();
    }, 50);
    return () => clearTimeout(timer);
    // refs is a stable set of ref objects; only the active field matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, activeInput]);

  const panelProps = {
    isActive,
    position,
    activeTool,
    activeInput,
    values,
    setValues: {
      length: (v: string) => setValue('length', v),
      angle: (v: string) => setValue('angle', v),
      width: (v: string) => setValue('width', v),
      height: (v: string) => setValue('height', v),
      diameter: (v: string) => setValue('diameter', v),
      radius: (v: string) => setValue('radius', v),
    },
    refs,
    onKeyDown: handleKeyDown,
  };

  /** Used by the fillet tool, which positions the panel itself in view coordinates. */
  const openRadiusAt = useCallback((viewPosition: { x: number; y: number }) => {
    setActiveInput('radius');
    setPosition(viewPosition);
    setIsActive(true);
  }, []);

  return { isActive, reset, openForCurrentTool, openRadiusAt, panelProps };
}

export type NumericInput = ReturnType<typeof useNumericInput>;
