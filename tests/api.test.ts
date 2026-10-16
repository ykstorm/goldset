import { afterEach, describe, it, expect, vi } from 'vitest';
import { goldenDataset, toEvalResult, structural, llmJudge, grounding } from '../src/index';

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

  it('embeds grounding results under the right key', async () => {
    const result = await grounding([{ id: 'gr', input: 'q', context: ['the sky is blue'] }], {
      llm: vi.fn().mockResolvedValue('the sky is blue'),
      judge: vi.fn().mockResolvedValue(JSON.stringify({ score: 5, reason: 'grounded' })),
    });
    const combined = toEvalResult(result);
    expect(combined.runners.grounding?.summary.passed).toBe(1);
    expect(combined.passed).toBe(true);
  });

  it('merges two results from the same runner', async () => {
    const a = await structural([{ id: 'a', input: 'x' }], {
      llm: vi.fn().mockResolvedValue('yes'),
      assertions: [{ type: 'contains', substring: 'yes' }],
    });
    const b = await structural([{ id: 'b', input: 'x' }], {
      llm: vi.fn().mockResolvedValue('no'),
      assertions: [{ type: 'contains', substring: 'yes' }],
    });
    const combined = toEvalResult(a, b);
    expect(combined.runners.structural?.cases).toHaveLength(2);
    expect(combined.runners.structural?.summary).toEqual({ passed: 1, failed: 1 });
    expect(combined.passed).toBe(false);
  });

  it('omits volatile fields with { stable: true }', async () => {
    const golden = await goldenDataset([{ id: 'g', input: 'x', expected: 'x' }], {
      llm: vi.fn().mockResolvedValue('x'),
    });
    const stable = toEvalResult(golden, { stable: true });
    expect(stable.timestamp).toBe('');
    expect(stable.commit).toBe('');
    expect(stable.branch).toBe('');
    expect(stable.runners.goldenDataset).toBeDefined();
    expect(stable.passed).toBe(true);
  });
});

describe('grounding', () => {
  it('passes when the answer is supported by the context', async () => {
    const r = await grounding(
      [{ id: 'g1', input: 'What colour is the sky?', context: ['The sky is blue on a clear day.'] }],
      {
        llm: vi.fn().mockResolvedValue('The sky is blue.'),
        judge: vi.fn().mockResolvedValue(JSON.stringify({ score: 5, reason: 'fully grounded' })),
      }
    );
    expect(r.runner).toBe('grounding');
    expect(r.summary.passed).toBe(1);
    expect(r.summary.failed).toBe(0);
    expect(r.cases[0].passed).toBe(true);
  });

  it('fails when the answer hallucinates beyond the context', async () => {
    const r = await grounding(
      [{ id: 'g2', input: 'Who founded it?', context: ['Acme makes widgets.'] }],
      {
        // the answer invents a fact the context does not support
        llm: vi.fn().mockResolvedValue('Acme was founded by Jane Doe in 1998.'),
        judge: vi.fn().mockResolvedValue(JSON.stringify({ score: 1, reason: 'founder/date not in context' })),
      }
    );
    expect(r.summary.failed).toBe(1);
    expect(r.cases[0].passed).toBe(false);
    expect(r.cases[0].score).toBe(1);
  });

  it('treats unparseable judge output as a failure', async () => {
    const r = await grounding([{ id: 'g3', input: 'q', context: ['ctx'] }], {
      llm: vi.fn().mockResolvedValue('answer'),
      judge: vi.fn().mockResolvedValue('not json'),
    });
    expect(r.cases[0].score).toBe(0);
    expect(r.cases[0].passed).toBe(false);
  });

  it('passes the context into the judge prompt', async () => {
    const judge = vi.fn().mockResolvedValue(JSON.stringify({ score: 5 }));
    await grounding([{ id: 'g4', input: 'q', context: ['SECRET_CONTEXT_MARKER'] }], {
      llm: vi.fn().mockResolvedValue('a'),
      judge,
    });
    expect(judge.mock.calls[0][0]).toContain('SECRET_CONTEXT_MARKER');
  });
});

describe('goldenDataset edges', () => {
  const one = [{ id: 'g1', input: 'q', expected: 'same answer' }];

  it('summarises an empty case list as zeros', async () => {
    const result = await goldenDataset([], { llm: vi.fn() });
    expect(result).toEqual({
      runner: 'goldenDataset',
      cases: [],
      summary: { passed: 0, failed: 0, passRate: 0, avgSimilarity: 0 },
    });
  });

  it('defaults the threshold to 0.8 and records it on each case', async () => {
    const result = await goldenDataset(one, { llm: vi.fn().mockResolvedValue('same answer') });
    expect(result.cases[0].threshold).toBe(0.8);
  });

  it.each([0, 1])('accepts the boundary threshold %s', async (threshold) => {
    const result = await goldenDataset(one, { llm: vi.fn().mockResolvedValue('same answer'), threshold });
    expect(result.cases[0].threshold).toBe(threshold);
  });

  it.each([-0.01, 1.01])('rejects the threshold %s with a message', async (threshold) => {
    await expect(goldenDataset(one, { llm: vi.fn(), threshold })).rejects.toThrow(
      'goldenDataset: threshold must be between 0 and 1'
    );
  });

  it('checks the threshold before calling the model', async () => {
    const llm = vi.fn();
    await expect(goldenDataset(one, { llm, threshold: 2 })).rejects.toThrow();
    expect(llm).not.toHaveBeenCalled();
  });

  it('accepts a synchronous model function', async () => {
    const result = await goldenDataset(one, { llm: () => 'same answer' });
    expect(result.cases[0].passed).toBe(true);
  });

  it('logs one PASS or FAIL line per case to stderr when verbose', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = await goldenDataset(
        [
          { id: 'ok', input: 'q1', expected: 'same answer' },
          { id: 'off', input: 'q2', expected: 'same answer' },
        ],
        { llm: vi.fn().mockResolvedValueOnce('same answer').mockResolvedValueOnce('zzz'), verbose: true }
      );
      expect(log.mock.calls.map((c) => c[0])).toEqual([
        '[goldenDataset] PASS ok (similarity 1)',
        `[goldenDataset] FAIL off (similarity ${result.cases[1].similarity})`,
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it('logs nothing when not verbose', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await goldenDataset(one, { llm: vi.fn().mockResolvedValue('zzz') });
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('rounds similarity, pass rate and average to two places', async () => {
    const result = await goldenDataset(
      [
        { id: 'a', input: 'q', expected: 'abc' },
        { id: 'b', input: 'q', expected: 'abc' },
        { id: 'c', input: 'q', expected: 'abc' },
      ],
      { llm: vi.fn().mockResolvedValueOnce('abc').mockResolvedValueOnce('abd').mockResolvedValueOnce('xyz'), threshold: 0.5 }
    );
    expect(result.cases.map((c) => c.similarity)).toEqual([1, 0.67, 0]);
    expect(result.summary).toEqual({ passed: 2, failed: 1, passRate: 0.67, avgSimilarity: 0.56 });
  });
});

describe('toEvalResult options and metadata', () => {
  const golden = () =>
    goldenDataset([{ id: 'g', input: 'x', expected: 'x' }], { llm: vi.fn().mockResolvedValue('x') });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fills the timestamp, commit and branch from the run when not stable', async () => {
    vi.stubEnv('GITHUB_SHA', 'abc123');
    vi.stubEnv('GITHUB_REF_NAME', 'feature/x');
    const r = toEvalResult(await golden());
    expect(new Date(r.timestamp).toISOString()).toBe(r.timestamp);
    expect(r.commit).toBe('abc123');
    expect(r.branch).toBe('feature/x');
  });

  it('uses empty strings when the commit and branch are not in the environment', async () => {
    vi.stubEnv('GITHUB_SHA', undefined);
    vi.stubEnv('GITHUB_REF_NAME', undefined);
    const r = toEvalResult(await golden());
    expect(r.commit).toBe('');
    expect(r.branch).toBe('');
    expect(r.timestamp).not.toBe('');
  });

  it.each([
    ['an empty options object', {}],
    ['stable: false', { stable: false }],
  ])('treats %s as not stable', async (_name, options) => {
    vi.stubEnv('GITHUB_SHA', 'abc123');
    const r = toEvalResult(await golden(), options);
    expect(r.timestamp).not.toBe('');
    expect(r.commit).toBe('abc123');
    expect(r.runners.goldenDataset).toBeDefined();
  });

  it('accepts options with no runner results', () => {
    const r = toEvalResult({ stable: true });
    expect(r).toEqual({ version: 1, timestamp: '', commit: '', branch: '', runners: {}, passed: true });
  });

  it('accepts no arguments at all', () => {
    const r = toEvalResult();
    expect(r.runners).toEqual({});
    expect(r.passed).toBe(true);
  });

  it('keeps the field order of the JSON it emits', async () => {
    const r = toEvalResult(await golden(), { stable: true });
    expect(Object.keys(r)).toEqual(['version', 'timestamp', 'commit', 'branch', 'runners', 'passed']);
  });

  it('fails the result when any runner has a failure', async () => {
    const bad = await goldenDataset([{ id: 'b', input: 'x', expected: 'x' }], { llm: vi.fn().mockResolvedValue('nothing alike') });
    expect(toEvalResult(await golden(), bad, { stable: true }).passed).toBe(false);
  });
});
