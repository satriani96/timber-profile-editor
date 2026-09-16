import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  SAMPLE_LENGTH_MM,
  describeProfileError,
  extractProfileLoops,
} from '../preview3d/profileSolid';

const TimberPreview = lazy(() => import('../preview3d/TimberPreview'));

interface TimberPreviewPanelProps {
  onClose: () => void;
}

export default function TimberPreviewPanel({ onClose }: TimberPreviewPanelProps) {
  const [revision, setRevision] = useState(0);
  const result = useMemo(() => {
    try {
      return { ok: true as const, loops: extractProfileLoops() };
    } catch (error) {
      return { ok: false as const, message: describeProfileError(error) };
    }
  }, [revision]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timber-preview-title"
        className="flex h-[min(90vh,46rem)] w-[min(96vw,72rem)] flex-col overflow-hidden rounded-lg bg-[#d6d0c6] text-sm text-gray-800 shadow-xl"
      >
        <div className="flex items-center gap-3 border-b border-black/10 bg-white/80 px-5 py-3">
          <h2 id="timber-preview-title" className="text-base font-semibold">
            3D preview
          </h2>
          <p className="min-w-0 flex-1 text-gray-600">
            {SAMPLE_LENGTH_MM} mm sample, generated from the current drawing
          </p>
          <button
            type="button"
            className="rounded px-3 py-1 text-gray-700 hover:bg-gray-100"
            onClick={() => setRevision((n) => n + 1)}
          >
            Refresh
          </button>
          <button type="button" className="rounded px-3 py-1 text-gray-700 hover:bg-gray-100" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          {result.ok ? (
            <Suspense
              fallback={<p className="p-8 text-center text-gray-600">Loading preview…</p>}
            >
              <TimberPreview loops={result.loops} length={SAMPLE_LENGTH_MM} />
            </Suspense>
          ) : (
            <p className="px-8 py-16 text-center text-gray-700">{result.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
