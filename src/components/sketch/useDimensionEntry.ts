import { useCallback, useEffect, useRef, useState } from 'react';
import paper from 'paper';
import { applyDimensionValue, formatDimensionValue, readDimensionData } from '../../canvas/dimensions';
import type { SketchHistory } from '../../canvas/history';

interface Args {
  history: SketchHistory;
  afterChange: () => void;
}

export function useDimensionEntry({ history, afterChange }: Args) {
  const [session, setSession] = useState<{ group: paper.Group; value: string; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openFor = useCallback((group: paper.Group) => {
    const data = readDimensionData(group);
    const view = paper.view.projectToView(data.textPoint);
    setSession({
      group,
      value: formatDimensionValue(data.value),
      x: view.x + 10,
      y: view.y - 32,
    });
  }, []);

  const close = useCallback(() => setSession(null), []);

  const apply = useCallback(() => {
    if (!session) return;
    const n = parseFloat(session.value);
    if (!Number.isNaN(n) && n > 0) {
      history.checkpoint();
      applyDimensionValue(session.group, n);
      afterChange();
    }
    setSession(null);
  }, [afterChange, history, session]);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => clearTimeout(timer);
  }, [session]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        apply();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    },
    [apply, close]
  );

  return {
    isActive: Boolean(session),
    openFor,
    close,
    apply,
    inputProps: {
      visible: Boolean(session),
      position: session ? { x: session.x, y: session.y } : null,
      value: session?.value ?? '',
      onChange: (value: string) => setSession((prev) => (prev ? { ...prev, value } : prev)),
      onKeyDown,
      inputRef,
    },
  };
}
