import React, { useEffect, useState } from 'react';
import type { PreparedImport } from '../importers/ImportDXF';

interface ImportUnitsDialogProps {
  fileName: string;
  prepared: PreparedImport;
  onConfirm: (mmPerUnit: number) => void;
  onCancel: () => void;
}

const UNIT_OPTIONS: { label: string; mmPerUnit: number }[] = [
  { label: 'Millimetres', mmPerUnit: 1 },
  { label: 'Centimetres', mmPerUnit: 10 },
  { label: 'Metres', mmPerUnit: 1000 },
  { label: 'Inches', mmPerUnit: 25.4 },
  { label: 'Feet', mmPerUnit: 304.8 },
];

const INSUNITS_NAMES: Record<number, string> = {
  1: 'inches',
  2: 'feet',
  3: 'miles',
  4: 'millimetres',
  5: 'centimetres',
  6: 'metres',
  7: 'kilometres',
  8: 'microinches',
  9: 'mils',
  10: 'yards',
  13: 'microns',
  14: 'decimetres',
};

function formatMm(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} m`;
  return `${value.toFixed(value < 10 ? 2 : 1)} mm`;
}

/**
 * Confirms the unit of a DXF before it is placed. Shows what the file header
 * claims and how large the geometry would come out, so a header that disagrees
 * with the numbers in the file (common with some CAD exporters) is obvious.
 */
const ImportUnitsDialog: React.FC<ImportUnitsDialogProps> = ({ fileName, prepared, onConfirm, onCancel }) => {
  const [mmPerUnit, setMmPerUnit] = useState(prepared.headerMmPerUnit);

  const options = UNIT_OPTIONS.some((o) => o.mmPerUnit === prepared.headerMmPerUnit)
    ? UNIT_OPTIONS
    : [...UNIT_OPTIONS, { label: `File units (×${prepared.headerMmPerUnit} mm)`, mmPerUnit: prepared.headerMmPerUnit }];

  const headerName = INSUNITS_NAMES[prepared.headerUnits];
  const headerText = headerName
    ? `File header says ${headerName} ($INSUNITS = ${prepared.headerUnits}).`
    : 'File header does not specify units; assuming millimetres.';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm(mmPerUnit);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mmPerUnit, onCancel, onConfirm]);

  const extents = prepared.extents;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-units-title"
        className="w-[26rem] rounded-lg bg-white p-5 text-sm text-gray-800 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="import-units-title" className="mb-1 text-base font-semibold">
          Import {fileName}
        </h2>
        <p className="mb-3 text-gray-600">
          {prepared.entityCount} {prepared.entityCount === 1 ? 'entity' : 'entities'}. {headerText}
        </p>

        <label className="mb-1 block font-medium" htmlFor="import-units-select">
          Numbers in this file are in
        </label>
        <select
          id="import-units-select"
          className="mb-3 w-full rounded border border-gray-300 px-2 py-1"
          value={mmPerUnit}
          onChange={(e) => setMmPerUnit(parseFloat(e.target.value))}
          autoFocus
        >
          {options.map((o) => (
            <option key={o.label} value={o.mmPerUnit}>
              {o.label}
            </option>
          ))}
        </select>

        {extents && (
          <div className="mb-4 rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-700">
            <div>
              In file: {extents.width.toFixed(3)} × {extents.height.toFixed(3)} units
            </div>
            <div className="font-semibold text-gray-900">
              Imported size: {formatMm(extents.width * mmPerUnit)} × {formatMm(extents.height * mmPerUnit)}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-1 text-gray-600 hover:bg-gray-100" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700"
            onClick={() => onConfirm(mmPerUnit)}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportUnitsDialog;
