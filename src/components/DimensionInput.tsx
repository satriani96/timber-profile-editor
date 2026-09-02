import type { RefObject } from 'react';

interface DimensionInputProps {
  visible: boolean;
  position: { x: number; y: number } | null;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export default function DimensionInput({ visible, position, value, onChange, onKeyDown, inputRef }: DimensionInputProps) {
  if (!visible || !position) return null;
  return (
    <div
      className="absolute z-30 rounded border border-blue-500 bg-white px-1.5 py-1 shadow-md"
      style={{ left: position.x, top: position.y }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-20 border-0 font-mono text-sm outline-none"
        inputMode="decimal"
        aria-label="Dimension value in millimetres"
      />
      <span className="ml-0.5 text-xs text-gray-500">mm</span>
    </div>
  );
}
