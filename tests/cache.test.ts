import { describe, it, expect, vi } from 'vitest';
import { cacheKey, memoryCache, layeredCache, cacheFromEnv } from '../src/cache';
import { llmJudge } from '../src/index';

describe('cacheKey', () => {
  it('is deterministic for the same parts', () => {
    const parts = { runner: 'llmJudge', rubric: 'r', input: 'i', expected: 'e', output: 'o' };
    expect(cacheKey(parts)).toBe(cacheKey({ ...parts }));
  });

  it('changes when any field changes', () => {
    const base = { runner: 'llmJudge', rubric: 'r', input: 'i', output: 'o' };
    const k = cacheKey(base);
    expect(cacheKey({ ...base, output: 'o2' })).not.toBe(k);
    expect(cacheKey({ ...base, runner: 'grounding' })).not.toBe(k);
    expect(cacheKey({ ...base, expected: 'x' })).not.toBe(k);
  });
});

describe('memoryCache / layeredCache', () => {
  it('stores and retrieves verdicts', () => {
    const c = memoryCache();
    expect(c.get('k')).toBeUndefined();
    c.set('k', 'verdict');
    expect(c.get('k')).toBe('verdict');
  });

  it('reads the first layer that has the key and writes through all layers', () => {
    const a = memoryCache();
    const b = memoryCache();
    const layered = layeredCache(a, b);
    layered.set('k', 'v');
    expect(a.get('k')).toBe('v');
    expect(b.get('k')).toBe('v');
    b.set('only-b', 'x');
    expect(layered.get('only-b')).toBe('x');
  });
});

describe('cacheFromEnv', () => {
  it('is disabled unless GOLDSET_JUDGE_CACHE is truthy', () => {
    expect(cacheFromEnv({})).toBeUndefined();
    expect(cacheFromEnv({ GOLDSET_JUDGE_CACHE: '0' })).toBeUndefined();
    expect(cacheFromEnv({ GOLDSET_JUDGE_CACHE: 'false' })).toBeUndefined();
    expect(cacheFromEnv({ GOLDSET_JUDGE_CACHE: '1' })).toBeDefined();
  });
});

describe('llmJudge with a cache', () => {
  it('reuses a cached verdict instead of calling the judge again', async () => {
    const cache = memoryCache();
    const judge = vi.fn().mockResolvedValue(JSON.stringify({ score: 5, reason: 'ok' }));
    const cfg = { llm: () => 'same output', judge, rubric: 'r', cache };
    const cases = [{ id: 'c', input: 'q' }];

    const first = await llmJudge(cases, cfg);
    const second = await llmJudge(cases, cfg);

    expect(first.cases[0].score).toBe(5);
    expect(second.cases[0].score).toBe(5);
    expect(judge).toHaveBeenCalledTimes(1); // second run served from cache
  });
});
