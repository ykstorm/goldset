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
  it('compares only the capped text, so text past the cap neither matches nor differs', () => {
    const a = 'a'.repeat(40_000);
    const b = 'a'.repeat(20_000) + 'b'.repeat(20_000);
    // The first 20,000 characters are equal, and that is all that is compared.
    expect(calculateSimilarity(a, b)).toBe(1);
  });

  // One 20,000 x 20,000 distance; about 3 s locally, longer under coverage.
  it('divides by the capped length, not the full length', { timeout: 60_000 }, () => {
    const a = 'a'.repeat(30_000);
    const c = 'b'.repeat(30_000);
    // Capped at 20,000 on both sides and all different: 0, not 1 - 20000/30000.
    expect(calculateSimilarity(a, c)).toBe(0);
  });
});
