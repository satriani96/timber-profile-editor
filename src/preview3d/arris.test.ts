import { describe, expect, it } from 'vitest';
import { softenArrises } from './arris';

const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 0, y: 20 },
];

function area(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

describe('softenArrises', () => {
  it('rounds each sharp corner into an arc that stays inside the original outline', () => {
    const out = softenArrises(square, 1);
    expect(out.length).toBeGreaterThan(square.length);
    for (const p of out) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(40 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(20 + 1e-9);
    }
    // A 1 mm fillet removes (1 - π/4) mm² per corner.
    expect(area(out)).toBeCloseTo(800 - 4 * (1 - Math.PI / 4), 1);
  });

  it('leaves the gentle corners of a sampled curve alone', () => {
    const arc = Array.from({ length: 40 }, (_, i) => {
      const t = (i / 40) * Math.PI * 2;
      return { x: Math.cos(t) * 10, y: Math.sin(t) * 10 };
    });
    expect(softenArrises(arc, 0.8)).toEqual(arc);
  });

  it('shrinks the fillet where an edge is too short to take it', () => {
    const notch = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 21, y: 20 },
      { x: 21, y: 19 },
      { x: 19, y: 19 },
      { x: 19, y: 20 },
      { x: 0, y: 20 },
    ];
    const out = softenArrises(notch, 1);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(area(out)).toBeLessThan(area(notch));
    expect(area(out)).toBeGreaterThan(area(notch) - 8);
  });
});
