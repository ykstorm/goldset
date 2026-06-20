import { describe, it, expect, vi } from 'vitest';
import { goldenDataset, toEvalResult, structural, llmJudge } from '../src/index';

describe('goldenDataset', () => {
  it('passes exact matches and fails drifted output, with a summary', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce('Email support@example.com')
      .mockResolvedValueOnce('totally different unrelated answer');

    const result = await goldenDataset(
      [
        { id: 'faq-1', input: 'How do I cancel?', expected: 'Email support@example.com' },
        { id: 'faq-2', input: 'Where is my order?', expected: 'Track at example.com/track' },
      ],
      { llm, threshold: 0.85 }
    );

    expect(result.runner).toBe('goldenDataset');
    expect(result.cases[0].passed).toBe(true);
    expect(result.cases[0].similarity).toBe(1);
    expect(result.cases[1].passed).toBe(false);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.passRate).toBe(0.5);
  });

  it('applies a custom normalize() before comparing', async () => {
    const llm = vi.fn().mockResolvedValue('  HELLO  ');
    const result = await goldenDataset([{ id: 'n', input: 'x', expected: 'hello' }], {
      llm,
      threshold: 1,
      normalize: (s) => s.trim().toLowerCase(),
    });
    expect(result.cases[0].passed).toBe(true);
  });

  it('rejects an out-of-range threshold', async () => {
    await expect(
      goldenDataset([], { llm: vi.fn(), threshold: 1.5 })
    ).rejects.toThrow();
  });
});

describe('toEvalResult', () => {
  it('combines runner results and reports overall pass/fail', async () => {
    const golden = await goldenDataset(
      [{ id: 'g', input: 'x', expected: 'x' }],
      { llm: vi.fn().mockResolvedValue('x') }
    );
    const struct = await structural([{ id: 's', input: 'x' }], {
      llm: vi.fn().mockResolvedValue('nope'),
      assertions: [{ type: 'contains', substring: 'yes' }],
    });

    const passing = toEvalResult(golden);
    expect(passing.version).toBe(1);
    expect(passing.passed).toBe(true);
    expect(passing.runners.goldenDataset).toBeDefined();

    const failing = toEvalResult(golden, struct);
    expect(failing.passed).toBe(false);
    expect(failing.runners.structural?.summary.failed).toBe(1);
  });

  it('embeds judge results under the right key', async () => {
    const judge = await llmJudge([{ id: 'j', input: 'hi' }], {
      llm: vi.fn().mockResolvedValue('hello'),
      judge: vi.fn().mockResolvedValue(JSON.stringify({ score: 5, reason: 'ok' })),
      rubric: 'be nice',
    });
    const combined = toEvalResult(judge);
    expect(combined.runners.llmJudge?.summary.passed).toBe(1);
    expect(combined.passed).toBe(true);
  });
});
