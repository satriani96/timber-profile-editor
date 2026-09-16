import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  SAMPLE_LENGTH_MM,
  describeProfileError,
  extractProfileLoops,
} from '../preview3d/profileSolid';
import type { GrainDirection, GrainStyle } from '../preview3d/timberMaterial';
import {
  CAMERA_PRESET_IDS,
  CAMERA_PRESETS,
  DEFAULT_CAMERA_PRESET,
  isCameraPresetId,
  type CameraPresetId,
} from '../preview3d/cameraPresets';

const TimberPreview = lazy(() => import('../preview3d/TimberPreview'));

const GRAINS: { id: GrainStyle; label: string; title: string }[] = [
  { id: 'crown', label: 'Crown', title: 'Cut close to the heart: big sweeping cathedrals' },
  { id: 'flat', label: 'Flat sawn', title: 'Typical board: a few flame bands, straighter grain between' },
  { id: 'quarter', label: 'Quarter', title: 'Cut through the radius: quiet, near-parallel grain' },
];

const DIRECTIONS: { id: GrainDirection; label: string; title: string }[] = [
  { id: 'long', label: 'Long', title: 'Grain along the length of the sample' },
  { id: 'cross', label: 'Cross', title: 'Grain across the width, rotated 90°' },
];

interface TimberPreviewPanelProps {
  onClose: () => void;
}

export default function TimberPreviewPanel({ onClose }: TimberPreviewPanelProps) {
  const [revision, setRevision] = useState(0);
  const [grain, setGrain] = useState<GrainStyle>('flat');
  const [grainDirection, setGrainDirection] = useState<GrainDirection>('long');
  const [primed, setPrimed] = useState(false);
  const [preset, setPreset] = useState<CameraPresetId>(DEFAULT_CAMERA_PRESET);
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
        className="flex h-[min(90vh,46rem)] w-[min(96vw,72rem)] flex-col overflow-hidden rounded-lg bg-white text-sm text-gray-800 shadow-xl"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-black/10 bg-gray-50 px-5 py-3">
          <h2 id="timber-preview-title" className="text-base font-semibold">
            3D preview
          </h2>
          <p className="min-w-0 flex-1 text-gray-600">
            Clear pine sample, generated from the current drawing
          </p>
          <label className="flex items-center gap-1.5 text-gray-700">
            View
            <select
              aria-label="View angle"
              title={CAMERA_PRESETS[preset].title}
              value={preset}
              onChange={(event) => {
                const value = event.target.value;
                if (!isCameraPresetId(value)) {
                  throw new Error(`Unknown camera preset: ${value}`);
                }
                setPreset(value);
              }}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700"
            >
              {CAMERA_PRESET_IDS.map((id) => (
                <option key={id} value={id} title={CAMERA_PRESETS[id].title}>
                  {CAMERA_PRESETS[id].label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Grain">
            {GRAINS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.title}
                aria-pressed={grain === option.id}
                onClick={() => setGrain(option.id)}
                className={`px-3 py-1 ${
                  grain === option.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Grain direction">
            {DIRECTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.title}
                aria-pressed={grainDirection === option.id}
                onClick={() => setGrainDirection(option.id)}
                className={`px-3 py-1 ${
                  grainDirection === option.id ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label
            className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1 text-gray-700"
            title="Machined faces shown with factory primer; the cut ends stay bare timber"
          >
            <input type="checkbox" checked={primed} onChange={(event) => setPrimed(event.target.checked)} />
            Primed
          </label>
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
              <TimberPreview
                loops={result.loops}
                length={SAMPLE_LENGTH_MM}
                grain={grain}
                grainDirection={grainDirection}
                primed={primed}
                preset={preset}
              />
            </Suspense>
          ) : (
            <p className="px-8 py-16 text-center text-gray-700">{result.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
