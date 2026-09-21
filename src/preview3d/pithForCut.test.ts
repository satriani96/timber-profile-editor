import { describe, expect, it } from 'vitest';
import { pithForCut } from './timberMaterial';

describe('pithForCut', () => {
  it('sets a wide board so long-grain rings cross the long side of the end', () => {
    const pith = pithForCut(90, 18, 100, 0.75, 'long');
    expect(pith.y).toBeGreaterThan(18);
    expect(pith.x).toBeGreaterThan(0);
    expect(pith.x).toBeLessThan(90);
  });

  it('quarters the same board so the rings cross the short side', () => {
    const pith = pithForCut(90, 18, 100, 0.75, 'cross');
    expect(pith.x).toBeGreaterThan(90);
    expect(pith.y).toBeGreaterThan(0);
    expect(pith.y).toBeLessThan(18);
  });

  it('flips a standing profile the other way', () => {
    const along = pithForCut(18, 90, 100, 0.75, 'long');
    const across = pithForCut(18, 90, 100, 0.75, 'cross');
    expect(along.x).toBeGreaterThan(18);
    expect(across.y).toBeGreaterThan(90);
  });
});
