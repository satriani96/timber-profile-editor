import paper from 'paper';

interface StateManager {
  handleDragPan: (event: paper.ToolEvent) => void;
}

export function createPanTool(_canvasRef: React.RefObject<HTMLCanvasElement>, stateManager: StateManager) {
  const { handleDragPan } = stateManager;

  return {
    onMouseDown: () => {},
    onMouseMove: () => {},
    onMouseDrag: handleDragPan,
    onMouseUp: () => {},
    onKeyDown: null,
    onKeyUp: null,
    onActivate: () => {},
    onDeactivate: () => {}
  };
}
