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

describe('calculateSimilarity past the length cap', () => {
  it('scores two strings that differ across their whole second half as very different', () => {
    const a = 'a'.repeat(40_000);
    const b = 'a'.repeat(20_000) + 'b'.repeat(20_000);
    // Only the first 20,000 characters are compared, and those are equal.
    expect(calculateSimilarity(a, b)).toBe(1);
    const c = 'b'.repeat(30_000);
    // Capped at 20,000 on both sides, all different: 0, not 1 - 20000/30000.
    expect(calculateSimilarity(a, c)).toBe(0);
  });
});
