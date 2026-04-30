import { describe, it, expect } from 'vitest';
import { BASE_STROKE_WIDTH } from './constants';

describe('sketch constants', () => {
  it('uses a positive base stroke width for zoom scaling', () => {
    expect(BASE_STROKE_WIDTH).toBeGreaterThan(0);
    expect(BASE_STROKE_WIDTH).toBe(2);
  });
});
