/** AutoCAD Color Index helpers for the DXF layer table. */

const BASIC: Record<number, string> = {
  0: '#000000',
  1: '#ff0000',
  2: '#ffff00',
  3: '#00ff00',
  4: '#00ffff',
  5: '#0000ff',
  6: '#ff00ff',
  7: '#ffffff',
  8: '#808080',
  9: '#c0c0c0',
};

function parseRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const cells: [number, number, number][] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ];
  const [r, g, b] = cells[i];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** ACI 10–249: 24 hues × 10 shades (standard AutoCAD layout). */
function generatedAci(aci: number): [number, number, number] {
  const row = Math.floor((aci - 10) / 10);
  const col = (aci - 10) % 10;
  const hue = (row * 15) % 360;
  if (col < 5) {
    const value = [1, 0.75, 0.5, 0.35, 0.2][col];
    return hsvToRgb(hue, 1, value);
  }
  const mix = [0.85, 0.65, 0.5, 0.35, 0.2][col - 5];
  const [r, g, b] = hsvToRgb(hue, 0.45, 1);
  return [Math.round(r * mix + 255 * (1 - mix)), Math.round(g * mix + 255 * (1 - mix)), Math.round(b * mix + 255 * (1 - mix))];
}

function aciRgb(aci: number): [number, number, number] {
  const index = Math.min(255, Math.max(0, Math.round(Math.abs(aci))));
  if (index <= 9) return parseRgb(BASIC[index]);
  if (index >= 250) {
    const gray = [0, 45, 89, 127, 165, 210][index - 250] ?? 255;
    return [gray, gray, gray];
  }
  return generatedAci(index);
}

export function aciToHex(aci: number): string {
  const [r, g, b] = aciRgb(aci);
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * Nearest ACI in 1–255. Near-black maps to 7 (CAD black/white) rather than
 * 0 (ByBlock), which is not a real layer colour.
 */
export function hexToAci(hex: string): number {
  const [r, g, b] = parseRgb(hex);
  if (r < 12 && g < 12 && b < 12) return 7;
  let best = 7;
  let bestD = Infinity;
  for (let i = 1; i <= 255; i++) {
    const [cr, cg, cb] = aciRgb(i);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
