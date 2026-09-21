import { describe, expect, it } from 'vitest';
import { DEFAULT_FINISH, FINISHES, FINISH_IDS, isFinishId } from './finishes';
import { createTimberMaterial } from './timberMaterial';
import type { ProfileLoops } from './profileSolid';

const LOOPS: ProfileLoops = {
  outer: [
    { x: 0, y: 0 },
    { x: 65, y: 0 },
    { x: 65, y: 15 },
    { x: 0, y: 15 },
  ],
  holes: [],
};

describe('finishes', () => {
  it('leaves bare timber untouched under the clear finish', () => {
    // The shader mixes the surface towards the coat by `cover` and scales the timber's own
    // relief by `relief`, so these two are what make clear a no-op rather than white paint.
    expect(FINISHES.clear.cover).toBe(0);
    expect(FINISHES.clear.relief).toBe(1);
  });

  it('keeps every coat inside the range the shader mixes over', () => {
    for (const id of FINISH_IDS) {
      const finish = FINISHES[id];
      expect(finish.color).toMatch(/^#[0-9a-f]{6}$/);
      for (const value of [finish.cover, finish.grain, finish.roughness, finish.relief, finish.specular, finish.anisotropy]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('recognises only the ids it defines', () => {
    expect(FINISH_IDS.every(isFinishId)).toBe(true);
    expect(isFinishId(DEFAULT_FINISH)).toBe(true);
    expect(isFinishId('blackOiled')).toBe(false);
  });
});

describe('createTimberMaterial', () => {
  it('takes its surface properties from the chosen finish', () => {
    for (const id of FINISH_IDS) {
      const material = createTimberMaterial(LOOPS, 300, 'flat', FINISHES[id]);
      expect(material.specularIntensity).toBe(FINISHES[id].specular);
      // Paint has no fibre direction, so only the uncoated and oiled faces stretch a highlight.
      expect(material.anisotropy).toBe(FINISHES[id].anisotropy);
    }
  });
});
