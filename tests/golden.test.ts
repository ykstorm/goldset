import { describe, it, expect } from 'vitest';
import { calculateSimilarity, levenshteinDistance } from '../src/index';

describe('similarity utilities', () => {
  it('treats two empty strings as identical', () => {
    expect(calculateSimilarity('', '')).toBe(1.0);
  });

  it('calculates Levenshtein distance correctly', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
  });

  it('bounds work on very large inputs (length cap, two-row DP)', () => {
    const t0 = performance.now();
    const sim = calculateSimilarity('a'.repeat(500_000), 'a'.repeat(500_000));
    const elapsed = performance.now() - t0;
    expect(sim).toBe(1);
    expect(elapsed).toBeLessThan(1000);
  });
});
